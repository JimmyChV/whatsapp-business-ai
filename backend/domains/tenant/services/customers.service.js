const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    getPostgresPool,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
const crypto = require('crypto');
const { assertValidTenant } = require('../helpers/tenant-guard.helpers');
const {
    toText,
    toIsoText,
    toLower,
    toBool,
    nowIso,
    normalizePhone,
    normalizeObject,
    normalizeTags,
    normalizeCustomerIdCandidate,
    createCustomerId,
    normalizeCustomer,
    sanitizePublic,
    sanitizeIdentityPublic,
    sanitizeChannelEventPublic,
    parseCsvRows,
    mapCsvRow,
    createChannelEventId
} = require('../helpers/customers-normalizers.helpers');
const { normalizeCustomerFields, toUpper } = require('../../../utils/normalize-text');
const customerLifecycleService = require('../../operations/services/customer-lifecycle.service');
const customerConsentService = require('../../operations/services/customer-consent.service');
const CUSTOMERS_FILE = 'customers.json';
const PAGE_LIMIT_DEFAULT = 50;
const PAGE_LIMIT_MAX = 500;
const ERP_IMPORT_PROGRESS_TTL_MS = 10 * 60 * 1000;
const ERP_IMPORT_BATCH_SIZE = 250;

let schemaPromise = null;
let schemaReady = false;
const erpImportProgressStore = new Map();
const erpImportProgressCleanupTimers = new Map();

function createErpImportId() {
    return `erpimp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function scheduleErpImportProgressCleanup(importId = '') {
    const key = String(importId || '').trim();
    if (!key) return;
    const previousTimer = erpImportProgressCleanupTimers.get(key);
    if (previousTimer) clearTimeout(previousTimer);
    const nextTimer = setTimeout(() => {
        erpImportProgressStore.delete(key);
        erpImportProgressCleanupTimers.delete(key);
    }, ERP_IMPORT_PROGRESS_TTL_MS);
    erpImportProgressCleanupTimers.set(key, nextTimer);
}

function setErpImportProgress(importId = '', patch = {}) {
    const key = String(importId || '').trim();
    if (!key) return null;
    const current = erpImportProgressStore.get(key) || {};
    const next = {
        ...current,
        ...patch,
        importId: key,
        updatedAt: nowIso()
    };
    erpImportProgressStore.set(key, next);
    scheduleErpImportProgressCleanup(key);
    return next;
}

function getErpImportProgress(importId = '', tenantId = '') {
    const key = String(importId || '').trim();
    if (!key) return null;
    const item = erpImportProgressStore.get(key);
    if (!item) return null;
    const cleanTenantId = String(tenantId || '').trim();
    if (cleanTenantId && String(item?.tenantId || '').trim() !== cleanTenantId) return null;
    return item;
}

function cancelErpImportProgress(importId = '', tenantId = '') {
    const current = getErpImportProgress(importId, tenantId);
    if (!current) return null;
    return setErpImportProgress(importId, {
        ...current,
        cancelRequested: true,
        message: 'Cancelacion solicitada. Esperando rollback seguro...'
    });
}

function isErpImportCancelled(importId = '') {
    const current = getErpImportProgress(importId);
    return Boolean(current?.cancelRequested);
}

function throwIfErpImportCancelled(importId = '') {
    if (isErpImportCancelled(importId)) {
        const error = new Error('Importacion ERP cancelada por el usuario.');
        error.code = 'ERP_IMPORT_CANCELLED';
        throw error;
    }
}

function chunkArray(items = [], size = ERP_IMPORT_BATCH_SIZE) {
    const source = Array.isArray(items) ? items : [];
    const chunkSize = Math.max(1, Number(size) || ERP_IMPORT_BATCH_SIZE);
    const chunks = [];
    for (let index = 0; index < source.length; index += chunkSize) {
        chunks.push(source.slice(index, index + chunkSize));
    }
    return chunks;
}

function supportsMarketingConsentSync(status = '') {
    const normalized = toLower(status || '');
    return normalized === 'opted_in' || normalized === 'opted_out';
}

function buildConsentSyncTargets(insertCandidates = [], updateCandidates = [], linkCandidates = []) {
    const items = [];
    insertCandidates.forEach((entry) => {
        const status = entry?.candidate?.marketingOptInStatus;
        if (!supportsMarketingConsentSync(status)) return;
        items.push({
            customerId: entry?.customerId,
            status,
            source: 'appsheet_import'
        });
    });
    updateCandidates.forEach((entry) => {
        const status = entry?.candidate?.marketingOptInStatus;
        if (!supportsMarketingConsentSync(status)) return;
        items.push({
            customerId: entry?.existing?.customer_id,
            status,
            source: 'appsheet_import'
        });
    });
    linkCandidates.forEach((entry) => {
        const status = entry?.candidate?.marketingOptInStatus;
        if (!supportsMarketingConsentSync(status)) return;
        items.push({
            customerId: entry?.customerId,
            status,
            source: 'appsheet_import'
        });
    });

    const deduped = new Map();
    items.forEach((item) => {
        const customerId = toText(item?.customerId || '');
        if (!customerId) return;
        deduped.set(customerId, {
            customerId,
            status: toLower(item?.status || ''),
            source: item?.source || 'appsheet_import'
        });
    });
    return Array.from(deduped.values());
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_customers (
                tenant_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                module_id TEXT NULL,
                contact_name TEXT NULL,
                phone_e164 TEXT NULL,
                phone_alt TEXT NULL,
                email TEXT NULL,
                treatment_id TEXT NULL,
                first_name TEXT NULL,
                last_name_paternal TEXT NULL,
                last_name_maternal TEXT NULL,
                document_type_id TEXT NULL,
                document_number TEXT NULL,
                customer_type_id TEXT NULL,
                acquisition_source_id TEXT NULL,
                notes TEXT NULL,
                tags JSONB NOT NULL DEFAULT '[]'::jsonb,
                profile JSONB NOT NULL DEFAULT '{}'::jsonb,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                last_interaction_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, customer_id)
            )
        `);
        await queryPostgres(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_customers_phone_unique
            ON tenant_customers(tenant_id, phone_e164)
            WHERE phone_e164 IS NOT NULL AND phone_e164 <> ''
        `);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS treatment_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS first_name TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS last_name_paternal TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS last_name_maternal TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS document_type_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS document_number TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS customer_type_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS acquisition_source_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS notes TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS erp_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS erp_employee_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS erp_row_hash TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS erp_last_seen_at TIMESTAMPTZ NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS erp_last_import_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS erp_source_payload JSONB DEFAULT '{}'::jsonb`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS referral_customer_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS marketing_opt_in_status TEXT NOT NULL DEFAULT 'unknown'`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS marketing_opt_in_updated_at TIMESTAMPTZ NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS marketing_opt_in_source TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS phone_status TEXT DEFAULT 'unknown'`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS phone_status_checked_at TIMESTAMPTZ`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS phone_status_error_code INTEGER`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS dias_ultima_compra INTEGER`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS ultimo_pedido_id TEXT`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS ultima_fecha_compra DATE`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS primera_fecha_compra DATE`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS primer_pedido_id TEXT`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS compras_total INTEGER`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS compras_120 INTEGER`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS monto_120 NUMERIC(12,2)`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS compras_180 INTEGER`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS monto_180 NUMERIC(12,2)`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS ticket_prom_180 NUMERIC(12,2)`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS monto_acumulado NUMERIC(12,2)`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS segmento TEXT`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS realizo_compra BOOLEAN`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS cadencia_prom_dias NUMERIC(8,2)`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS rango_compras TEXT`);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_customers_module
            ON tenant_customers(tenant_id, module_id)
        `);
        await queryPostgres(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_customers_erp_unique
            ON tenant_customers(tenant_id, erp_id)
            WHERE erp_id IS NOT NULL AND erp_id <> ''
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_customers_erp_hash
            ON tenant_customers(tenant_id, erp_row_hash)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_customers_updated
            ON tenant_customers(tenant_id, updated_at DESC)
        `);
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_customer_module_contexts (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                customer_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                marketing_opt_in_status TEXT NOT NULL DEFAULT 'unknown',
                marketing_opt_in_updated_at TIMESTAMPTZ NULL,
                marketing_opt_in_source TEXT NULL,
                commercial_status TEXT NOT NULL DEFAULT 'unknown',
                labels JSONB NOT NULL DEFAULT '[]'::jsonb,
                assignment_user_id TEXT NULL,
                first_interaction_at TIMESTAMPTZ NULL,
                last_interaction_at TIMESTAMPTZ NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, customer_id, module_id),
                FOREIGN KEY (tenant_id, customer_id)
                    REFERENCES tenant_customers(tenant_id, customer_id)
                    ON DELETE CASCADE
            )
        `);
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_customer_addresses (
                address_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                customer_id TEXT NOT NULL,
                address_type TEXT NOT NULL DEFAULT 'other',
                street TEXT NULL,
                reference TEXT NULL,
                maps_url TEXT NULL,
                wkt TEXT NULL,
                latitude NUMERIC(10, 7) NULL,
                longitude NUMERIC(10, 7) NULL,
                is_primary BOOLEAN NOT NULL DEFAULT FALSE,
                district_id TEXT NULL,
                district_name TEXT NULL,
                province_name TEXT NULL,
                department_name TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (address_id),
                FOREIGN KEY (tenant_id, customer_id)
                    REFERENCES tenant_customers(tenant_id, customer_id)
                    ON DELETE CASCADE
            )
        `);
        await queryPostgres(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_customer_addresses_primary_unique
            ON tenant_customer_addresses(tenant_id, customer_id)
            WHERE is_primary = TRUE
        `);
        await queryPostgres(`ALTER TABLE tenant_customer_addresses ADD COLUMN IF NOT EXISTS erp_address_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customer_addresses ADD COLUMN IF NOT EXISTS erp_row_hash TEXT NULL`);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_addresses_erp_id
            ON tenant_customer_addresses(tenant_id, erp_address_id)
        `);
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_customer_identities (
                tenant_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                channel_type TEXT NOT NULL,
                channel_identity TEXT NOT NULL,
                normalized_phone TEXT NULL,
                module_id TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, channel_type, channel_identity),
                FOREIGN KEY (tenant_id, customer_id)
                    REFERENCES tenant_customers(tenant_id, customer_id)
                    ON DELETE CASCADE
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_customer_identities_tenant_customer
            ON tenant_customer_identities(tenant_id, customer_id, updated_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_customer_identities_tenant_phone
            ON tenant_customer_identities(tenant_id, normalized_phone)
            WHERE normalized_phone IS NOT NULL AND normalized_phone <> ''
        `);
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_channel_events (
                tenant_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                channel_type TEXT NOT NULL DEFAULT 'whatsapp',
                module_id TEXT NULL,
                customer_id TEXT NULL,
                chat_id TEXT NULL,
                message_id TEXT NULL,
                direction TEXT NOT NULL DEFAULT 'inbound',
                status TEXT NULL,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, event_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_channel_events_tenant_created
            ON tenant_channel_events(tenant_id, created_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_channel_events_tenant_module
            ON tenant_channel_events(tenant_id, module_id, created_at DESC)
        `);
        schemaReady = true;
    })();

    try {
        await schemaPromise;
    } catch (error) {
        schemaReady = false;
        throw error;
    } finally {
        schemaPromise = null;
    }
}

function getPageOptions(options = {}) {
    const rawLimit = Number(options.limit || PAGE_LIMIT_DEFAULT);
    const rawOffset = Number(options.offset || 0);
    const limit = Math.max(1, Math.min(PAGE_LIMIT_MAX, Number.isFinite(rawLimit) ? rawLimit : PAGE_LIMIT_DEFAULT));
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
    return { limit, offset };
}

function normalizeUpdatedSince(value = '') {
    const raw = toText(value || '');
    if (!raw) return '';
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return '';
    return parsed.toISOString();
}

function buildWhereClause(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const where = ['tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (options.includeInactive === false) {
        where.push('is_active = TRUE');
    }

    const moduleId = toText(options.moduleId || '');
    if (moduleId) {
        where.push(`module_id = $${idx}`);
        params.push(moduleId);
        idx += 1;
    }

    const query = toLower(options.query || '');
    if (query) {
        where.push(`(
            LOWER(customer_id) LIKE $${idx}
            OR LOWER(COALESCE(erp_id, '')) LIKE $${idx}
            OR LOWER(COALESCE(contact_name, '')) LIKE $${idx}
            OR LOWER(COALESCE(first_name, '')) LIKE $${idx}
            OR LOWER(COALESCE(last_name_paternal, '')) LIKE $${idx}
            OR LOWER(COALESCE(last_name_maternal, '')) LIKE $${idx}
            OR LOWER(COALESCE(document_number, '')) LIKE $${idx}
            OR LOWER(COALESCE(phone_e164, '')) LIKE $${idx}
            OR LOWER(COALESCE(email, '')) LIKE $${idx}
            OR LOWER(COALESCE(profile ->> 'firstNames', '')) LIKE $${idx}
            OR LOWER(COALESCE(profile ->> 'lastNamePaternal', '')) LIKE $${idx}
            OR LOWER(COALESCE(profile ->> 'lastNameMaternal', '')) LIKE $${idx}
            OR LOWER(COALESCE(profile ->> 'documentNumber', '')) LIKE $${idx}
        )`);
        params.push(`%${query}%`);
        idx += 1;
    }

    const updatedSince = normalizeUpdatedSince(options.updatedSince || '');
    if (updatedSince) {
        where.push(`updated_at > $${idx}`);
        params.push(updatedSince);
        idx += 1;
    }

    return { where: where.join(' AND '), params, nextIndex: idx };
}

async function listCustomersPostgres(tenantId = DEFAULT_TENANT_ID, options = {}) {
    await ensurePostgresSchema();
    const page = getPageOptions(options);
    const { where, params, nextIndex } = buildWhereClause(tenantId, options);

    const totalRes = await queryPostgres(
        `SELECT COUNT(*)::int AS total FROM tenant_customers WHERE ${where}`,
        params
    );
    const total = Number(totalRes?.rows?.[0]?.total || 0) || 0;

    const rowsRes = await queryPostgres(
        `SELECT *
         FROM tenant_customers
         WHERE ${where}
         ORDER BY customer_id ASC
         LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
        [...params, page.limit, page.offset]
    );

    return {
        items: (rowsRes?.rows || []).map(sanitizePublic),
        total,
        limit: page.limit,
        offset: page.offset
    };
}

async function listCustomersFile(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const parsed = await readTenantJsonFile(CUSTOMERS_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items.map(sanitizePublic) : [];
    const page = getPageOptions(options);
    const query = toLower(options.query || '');
    const moduleId = toText(options.moduleId || '');
    const includeInactive = options.includeInactive !== false;
    const updatedSinceIso = normalizeUpdatedSince(options.updatedSince || '');
    const updatedSinceTime = updatedSinceIso ? new Date(updatedSinceIso).getTime() : NaN;

    let filtered = items;
    if (!includeInactive) {
        filtered = filtered.filter((item) => item.isActive !== false);
    }
    if (moduleId) {
        filtered = filtered.filter((item) => String(item?.moduleId || '') === moduleId);
    }
    if (query) {
        filtered = filtered.filter((item) => {
            const profile = normalizeObject(item?.profile);
            const haystack = [
                item.customerId,
                item.contactName,
                item.phoneE164,
                item.email,
                profile.firstNames,
                profile.lastNamePaternal,
                profile.lastNameMaternal,
                profile.documentNumber
            ].map((entry) => toLower(entry)).join(' ');
            return haystack.includes(query);
        });
    }
    if (Number.isFinite(updatedSinceTime)) {
        filtered = filtered.filter((item) => {
            const candidateRaw = toText(item?.updatedAt || item?.updated_at || '');
            if (!candidateRaw) return false;
            const candidateTime = new Date(candidateRaw).getTime();
            if (!Number.isFinite(candidateTime)) return false;
            return candidateTime > updatedSinceTime;
        });
    }

    filtered = [...filtered].sort((a, b) => String(a?.customerId || '').localeCompare(String(b?.customerId || ''), 'es', { sensitivity: 'base' }));

    return {
        items: filtered.slice(page.offset, page.offset + page.limit),
        total: filtered.length,
        limit: page.limit,
        offset: page.offset
    };
}

async function listCustomers(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        return listCustomersPostgres(cleanTenantId, options);
    }
    return listCustomersFile(cleanTenantId, options);
}

async function searchCustomersForChatPostgres(tenantId = DEFAULT_TENANT_ID, options = {}) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const rawQuery = toLower(options.query || '');
    const cleanQuery = rawQuery.trim();
    if (!cleanQuery) return { items: [] };

    const limit = Math.max(1, Math.min(50, Number(options.limit || 24) || 24));
    const includeInactive = options.includeInactive !== false;
    const likeQuery = `%${cleanQuery}%`;
    const prefixQuery = `${cleanQuery}%`;

    const params = [cleanTenantId, likeQuery, cleanQuery, prefixQuery, limit];
    const activeSql = includeInactive ? '' : 'AND c.is_active = TRUE';

    const result = await queryPostgres(
        `SELECT
            c.customer_id,
            c.erp_id,
            c.contact_name,
            c.first_name,
            c.last_name_paternal,
            c.last_name_maternal,
            c.document_number,
            c.phone_e164,
            c.phone_alt,
            c.email,
            c.updated_at,
            mc.module_id,
            addr.district_name,
            addr.province_name,
            addr.department_name
         FROM tenant_customers c
         LEFT JOIN tenant_customer_module_contexts mc
           ON mc.tenant_id = c.tenant_id
          AND mc.customer_id = c.customer_id
         LEFT JOIN LATERAL (
            SELECT
                a.district_name,
                a.province_name,
                a.department_name
            FROM tenant_customer_addresses a
            WHERE a.tenant_id = c.tenant_id
              AND a.customer_id = c.customer_id
            ORDER BY
                CASE WHEN a.is_primary = TRUE THEN 0 ELSE 1 END,
                a.updated_at DESC NULLS LAST,
                a.created_at DESC NULLS LAST
            LIMIT 1
         ) addr ON TRUE
         WHERE c.tenant_id = $1
           ${activeSql}
           AND (
                LOWER(CONCAT_WS(' ',
                    COALESCE(c.first_name, ''),
                    COALESCE(c.last_name_paternal, ''),
                    COALESCE(c.last_name_maternal, '')
                )) LIKE $2
                OR LOWER(COALESCE(c.contact_name, '')) LIKE $2
                OR LOWER(COALESCE(c.erp_id, '')) LIKE $2
                OR LOWER(COALESCE(c.document_number, '')) LIKE $2
                OR LOWER(COALESCE(c.phone_e164, '')) LIKE $2
                OR LOWER(COALESCE(c.phone_alt, '')) LIKE $2
                OR LOWER(COALESCE(c.email, '')) LIKE $2
           )
         ORDER BY
            CASE
                WHEN LOWER(CONCAT_WS(' ',
                    COALESCE(c.first_name, ''),
                    COALESCE(c.last_name_paternal, ''),
                    COALESCE(c.last_name_maternal, '')
                )) = $3 THEN 0
                WHEN LOWER(COALESCE(c.contact_name, '')) = $3 THEN 0
                WHEN LOWER(COALESCE(c.erp_id, '')) = $3 THEN 0
                WHEN LOWER(CONCAT_WS(' ',
                    COALESCE(c.first_name, ''),
                    COALESCE(c.last_name_paternal, ''),
                    COALESCE(c.last_name_maternal, '')
                )) LIKE $4 THEN 1
                WHEN LOWER(COALESCE(c.contact_name, '')) LIKE $4 THEN 1
                WHEN LOWER(COALESCE(c.last_name_paternal, '')) LIKE $4 THEN 1
                WHEN LOWER(COALESCE(c.last_name_maternal, '')) LIKE $4 THEN 1
                ELSE 2
            END,
            c.updated_at DESC,
            c.customer_id ASC,
            mc.module_id ASC NULLS LAST
         LIMIT $5`,
        params
    );

    return {
        items: (result?.rows || []).map((row) => ({
            customerId: toText(row?.customer_id || ''),
            erpId: toText(row?.erp_id || ''),
            contactName: toText(row?.contact_name || ''),
            firstName: toText(row?.first_name || ''),
            lastNamePaternal: toText(row?.last_name_paternal || ''),
            lastNameMaternal: toText(row?.last_name_maternal || ''),
            documentNumber: toText(row?.document_number || ''),
            phoneE164: toText(row?.phone_e164 || ''),
            phoneAlt: toText(row?.phone_alt || ''),
            email: toText(row?.email || ''),
            moduleId: toText(row?.module_id || ''),
            districtName: toText(row?.district_name || ''),
            provinceName: toText(row?.province_name || ''),
            departmentName: toText(row?.department_name || ''),
            updatedAt: toIsoText(row?.updated_at || '') || null
        }))
    };
}

async function searchCustomersForChatFile(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const result = await listCustomersFile(tenantId, {
        query: options.query,
        includeInactive: options.includeInactive,
        limit: options.limit || 24,
        offset: 0
    });
    return {
        items: (Array.isArray(result?.items) ? result.items : []).map((item) => ({
            customerId: toText(item?.customerId || ''),
            erpId: toText(item?.erpId || item?.erp_id || ''),
            contactName: toText(item?.contactName || item?.contact_name || ''),
            firstName: toText(item?.firstName || item?.first_name || ''),
            lastNamePaternal: toText(item?.lastNamePaternal || item?.last_name_paternal || ''),
            lastNameMaternal: toText(item?.lastNameMaternal || item?.last_name_maternal || ''),
            documentNumber: toText(item?.documentNumber || item?.document_number || ''),
            phoneE164: toText(item?.phoneE164 || item?.phone_e164 || ''),
            phoneAlt: toText(item?.phoneAlt || item?.phone_alt || ''),
            email: toText(item?.email || ''),
            moduleId: toText(item?.moduleId || item?.module_id || ''),
            districtName: '',
            provinceName: '',
            departmentName: '',
            updatedAt: toIsoText(item?.updatedAt || item?.updated_at || '') || null
        }))
    };
}

async function searchCustomersForChat(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        return searchCustomersForChatPostgres(cleanTenantId, options);
    }
    return searchCustomersForChatFile(cleanTenantId, options);
}

async function findCustomerPostgres(tenantId = DEFAULT_TENANT_ID, { customerId = '', phoneE164 = '' } = {}) {
    await ensurePostgresSchema();
    const cleanCustomerId = toText(customerId || '');
    const cleanPhone = normalizePhone(phoneE164 || '');

    if (!cleanCustomerId && !cleanPhone) return null;

    const clauses = [];
    const params = [tenantId];
    let idx = 2;

    if (cleanCustomerId) {
        clauses.push(`customer_id = $${idx}`);
        params.push(cleanCustomerId);
        idx += 1;
    }

    if (cleanPhone) {
        clauses.push(`phone_e164 = $${idx}`);
        params.push(cleanPhone);
        idx += 1;
    }

    const result = await queryPostgres(
        `SELECT * FROM tenant_customers WHERE tenant_id = $1 AND (${clauses.join(' OR ')}) LIMIT 1`,
        params
    );
    return result?.rows?.[0] ? sanitizePublic(result.rows[0]) : null;
}

async function findCustomerFile(tenantId = DEFAULT_TENANT_ID, { customerId = '', phoneE164 = '' } = {}) {
    const parsed = await readTenantJsonFile(CUSTOMERS_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items.map(sanitizePublic) : [];
    const cleanCustomerId = toText(customerId || '');
    const cleanPhone = normalizePhone(phoneE164 || '');

    return items.find((item) => {
        if (cleanCustomerId && String(item?.customerId || '') === cleanCustomerId) return true;
        if (cleanPhone && String(item?.phoneE164 || '') === cleanPhone) return true;
        return false;
    }) || null;
}

async function findCustomer(tenantId = DEFAULT_TENANT_ID, selector = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        return findCustomerPostgres(cleanTenantId, selector);
    }
    return findCustomerFile(cleanTenantId, selector);
}

async function listCustomerIds(tenantId = DEFAULT_TENANT_ID) {
    if (getStorageDriver() === 'postgres') {
        await ensurePostgresSchema();
        const rows = await queryPostgres('SELECT customer_id FROM tenant_customers WHERE tenant_id = $1', [tenantId]);
        return new Set((rows?.rows || []).map((row) => String(row?.customer_id || '').trim().toUpperCase()).filter(Boolean));
    }

    const parsed = await readTenantJsonFile(CUSTOMERS_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return new Set(items.map((item) => String(item?.customerId || '').trim().toUpperCase()).filter(Boolean));
}

async function upsertCustomerPostgres(tenantId = DEFAULT_TENANT_ID, payload = {}, { allowPhoneMerge = true } = {}) {
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    assertValidTenant(cleanTenantId, 'customers.upsertCustomerPostgres');
    const customerIdInput = normalizeCustomerIdCandidate(payload?.customerId || payload?.id || '');
    const phoneInput = normalizePhone(payload?.phoneE164 || payload?.phone || payload?.telefono || '');

    let existing = null;
    if (customerIdInput) {
        existing = await findCustomerPostgres(cleanTenantId, { customerId: customerIdInput });
    }
    if (!existing && allowPhoneMerge && phoneInput) {
        existing = await findCustomerPostgres(cleanTenantId, { phoneE164: phoneInput });
    }

    let fallbackId = existing?.customerId || customerIdInput;
    if (!fallbackId) {
        fallbackId = createCustomerId(await listCustomerIds(cleanTenantId));
    }

    const normalized = normalizeCustomer(payload, { fallbackId, previous: existing });
    const normalizedDbFields = normalizeCustomerFields({
        contact_name: normalized.contactName,
        phone_e164: normalized.phoneE164,
        phone_alt: normalized.phoneAlt,
        first_name: normalized.firstName,
        last_name_paternal: normalized.lastNamePaternal,
        last_name_maternal: normalized.lastNameMaternal,
        document_number: normalized.documentNumber,
        notes: normalized.notes
    });

    const result = await queryPostgres(
        `INSERT INTO tenant_customers (
            tenant_id, customer_id, module_id, contact_name, phone_e164, phone_alt, email,
            treatment_id, first_name, last_name_paternal, last_name_maternal,
            document_type_id, document_number, customer_type_id, acquisition_source_id, notes,
            tags, profile, metadata, is_active, last_interaction_at, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17::jsonb, $18::jsonb, $19::jsonb, $20, $21, $22, $23
        )
        ON CONFLICT (tenant_id, customer_id)
        DO UPDATE SET
            module_id = EXCLUDED.module_id,
            contact_name = EXCLUDED.contact_name,
            phone_e164 = EXCLUDED.phone_e164,
            phone_alt = EXCLUDED.phone_alt,
            email = EXCLUDED.email,
            treatment_id = EXCLUDED.treatment_id,
            first_name = EXCLUDED.first_name,
            last_name_paternal = EXCLUDED.last_name_paternal,
            last_name_maternal = EXCLUDED.last_name_maternal,
            document_type_id = EXCLUDED.document_type_id,
            document_number = EXCLUDED.document_number,
            customer_type_id = EXCLUDED.customer_type_id,
            acquisition_source_id = EXCLUDED.acquisition_source_id,
            notes = EXCLUDED.notes,
            tags = EXCLUDED.tags,
            profile = EXCLUDED.profile,
            metadata = EXCLUDED.metadata,
            is_active = EXCLUDED.is_active,
            last_interaction_at = EXCLUDED.last_interaction_at,
            updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [
            cleanTenantId,
            normalized.customerId,
            normalized.moduleId,
            normalizedDbFields.contact_name,
            normalizedDbFields.phone_e164,
            normalizedDbFields.phone_alt,
            normalized.email,
            normalized.treatmentId,
            normalizedDbFields.first_name,
            normalizedDbFields.last_name_paternal,
            normalizedDbFields.last_name_maternal,
            normalized.documentTypeId,
            normalizedDbFields.document_number,
            normalized.customerTypeId,
            normalized.acquisitionSourceId,
            normalizedDbFields.notes,
            JSON.stringify(normalized.tags || []),
            JSON.stringify(normalized.profile || {}),
            JSON.stringify(normalized.metadata || {}),
            normalized.isActive !== false,
            normalized.lastInteractionAt,
            normalized.createdAt,
            normalized.updatedAt
        ]
    );

    return {
        created: !existing,
        item: result?.rows?.[0] ? sanitizePublic(result.rows[0]) : null
    };
}

async function upsertCustomerFile(tenantId = DEFAULT_TENANT_ID, payload = {}, { allowPhoneMerge = true } = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    assertValidTenant(cleanTenantId, 'customers.upsertCustomerFile');
    const parsed = await readTenantJsonFile(CUSTOMERS_FILE, {
        tenantId: cleanTenantId,
        defaultValue: { items: [] }
    });
    const source = Array.isArray(parsed?.items) ? parsed.items.map(sanitizePublic) : [];

    const customerIdInput = normalizeCustomerIdCandidate(payload?.customerId || payload?.id || '');
    const phoneInput = normalizePhone(payload?.phoneE164 || payload?.phone || payload?.telefono || '');

    let existing = null;
    if (customerIdInput) {
        existing = source.find((item) => String(item?.customerId || '') === customerIdInput) || null;
    }
    if (!existing && allowPhoneMerge && phoneInput) {
        existing = source.find((item) => String(item?.phoneE164 || '') === phoneInput) || null;
    }

    let fallbackId = existing?.customerId || customerIdInput;
    if (!fallbackId) {
        fallbackId = createCustomerId(new Set(source.map((item) => String(item?.customerId || '').trim().toUpperCase()).filter(Boolean)));
    }

    const normalized = normalizeCustomer(payload, { fallbackId, previous: existing });
    const next = source.filter((item) => String(item?.customerId || '') !== normalized.customerId);
    next.push(normalized);

    await writeTenantJsonFile(CUSTOMERS_FILE, { items: next }, { tenantId: cleanTenantId });
    return {
        created: !existing,
        item: sanitizePublic(normalized)
    };
}

async function upsertCustomer(tenantId = DEFAULT_TENANT_ID, payload = {}, options = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    assertValidTenant(cleanTenantId, 'customers.upsertCustomer');
    const result = getStorageDriver() === 'postgres'
        ? await upsertCustomerPostgres(cleanTenantId, payload, options)
        : await upsertCustomerFile(cleanTenantId, payload, options);

    if (result?.created && result?.item?.customerId) {
        customerLifecycleService.ensureProspectLabel(cleanTenantId, result.item.customerId)
            .catch((error) => console.warn('[customer-lifecycle] ensureProspectLabel skipped:', error?.message || error));
    }

    return result;
}

async function getCustomer(tenantId = DEFAULT_TENANT_ID, customerId = '') {
    const rawCustomerId = toText(customerId || '');
    if (!rawCustomerId) return null;
    const cleanCustomerId = normalizeCustomerIdCandidate(rawCustomerId);
    return findCustomer(tenantId, { customerId: cleanCustomerId || rawCustomerId });
}

async function getCustomerByPhone(tenantId = DEFAULT_TENANT_ID, phoneE164 = '') {
    const cleanPhone = normalizePhone(phoneE164 || '');
    if (!cleanPhone) return null;
    return findCustomer(tenantId, { phoneE164: cleanPhone });
}

async function getCustomerByPhoneWithAddresses(
    tenantId = DEFAULT_TENANT_ID,
    phoneE164 = '',
    { customerAddressesService = null } = {}
) {
    const item = await getCustomerByPhone(tenantId, phoneE164);
    if (!item) return null;

    let addresses = [];
    if (customerAddressesService && typeof customerAddressesService.listAddresses === 'function') {
        try {
            addresses = await customerAddressesService.listAddresses(tenantId, { customerId: item.customerId });
        } catch (_) {
            addresses = [];
        }
    }

    return {
        ...item,
        addresses: Array.isArray(addresses) ? addresses : []
    };
}

async function updateCustomer(tenantId = DEFAULT_TENANT_ID, customerId = '', patch = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    assertValidTenant(cleanTenantId, 'customers.updateCustomer');
    const rawCustomerId = toText(customerId || '');
    const cleanCustomerId = normalizeCustomerIdCandidate(rawCustomerId);
    const lookupCustomerId = cleanCustomerId || rawCustomerId;
    if (!lookupCustomerId) throw new Error('customerId invalido.');

    const existing = await findCustomer(cleanTenantId, { customerId: lookupCustomerId });
    if (!existing) throw new Error('Cliente no encontrado.');

    const resolvedCustomerId = toText(existing?.customerId || lookupCustomerId);
    const resolvedCleanCustomerId = normalizeCustomerIdCandidate(resolvedCustomerId);
    if (!resolvedCustomerId) throw new Error('customerId invalido.');

    const sourcePatch = patch && typeof patch === 'object' ? patch : {};
    if (resolvedCleanCustomerId) {
        return upsertCustomer(cleanTenantId, {
            ...existing,
            ...sourcePatch,
            customerId: resolvedCleanCustomerId
        }, { allowPhoneMerge: false });
    }

    const profilePatch = normalizeObject(sourcePatch.profile);
    const metadataPatch = normalizeObject(sourcePatch.metadata);
    const mergedLegacyProfile = {
        ...normalizeObject(existing?.profile),
        ...profilePatch
    };
    const legacyFirstName = toText(sourcePatch.firstName !== undefined ? sourcePatch.firstName : existing?.firstName || mergedLegacyProfile.firstNames || '') || null;
    const legacyLastNamePaternal = toText(sourcePatch.lastNamePaternal !== undefined ? sourcePatch.lastNamePaternal : existing?.lastNamePaternal || mergedLegacyProfile.lastNamePaternal || '') || null;
    const legacyLastNameMaternal = toText(sourcePatch.lastNameMaternal !== undefined ? sourcePatch.lastNameMaternal : existing?.lastNameMaternal || mergedLegacyProfile.lastNameMaternal || '') || null;
    const legacyTreatmentId = toText(sourcePatch.treatmentId !== undefined ? sourcePatch.treatmentId : existing?.treatmentId || mergedLegacyProfile.treatmentId || '') || null;
    const legacyDocumentTypeId = toText(sourcePatch.documentTypeId !== undefined ? sourcePatch.documentTypeId : existing?.documentTypeId || mergedLegacyProfile.documentTypeId || '') || null;
    const legacyDocumentNumber = toText(sourcePatch.documentNumber !== undefined ? sourcePatch.documentNumber : existing?.documentNumber || mergedLegacyProfile.documentNumber || '') || null;
    const legacyCustomerTypeId = toText(sourcePatch.customerTypeId !== undefined ? sourcePatch.customerTypeId : existing?.customerTypeId || mergedLegacyProfile.customerTypeId || '') || null;
    const legacyAcquisitionSourceId = toText(sourcePatch.acquisitionSourceId !== undefined ? sourcePatch.acquisitionSourceId : existing?.acquisitionSourceId || mergedLegacyProfile.sourceId || '') || null;
    const legacyNotes = toText(sourcePatch.notes !== undefined ? sourcePatch.notes : existing?.notes || mergedLegacyProfile.notes || '') || null;
    const updatedLegacy = {
        customerId: resolvedCustomerId,
        moduleId: toText(sourcePatch.moduleId !== undefined ? sourcePatch.moduleId : existing?.moduleId) || null,
        contactName: toText(sourcePatch.contactName !== undefined ? sourcePatch.contactName : existing?.contactName) || null,
        phoneE164: normalizePhone(sourcePatch.phoneE164 !== undefined ? sourcePatch.phoneE164 : existing?.phoneE164),
        phoneAlt: normalizePhone(sourcePatch.phoneAlt !== undefined ? sourcePatch.phoneAlt : existing?.phoneAlt),
        email: toLower(sourcePatch.email !== undefined ? sourcePatch.email : existing?.email) || null,
        tags: normalizeTags(sourcePatch.tags !== undefined ? sourcePatch.tags : existing?.tags || []),
        firstName: legacyFirstName,
        lastNamePaternal: legacyLastNamePaternal,
        lastNameMaternal: legacyLastNameMaternal,
        treatmentId: legacyTreatmentId,
        documentTypeId: legacyDocumentTypeId,
        documentNumber: legacyDocumentNumber,
        customerTypeId: legacyCustomerTypeId,
        acquisitionSourceId: legacyAcquisitionSourceId,
        notes: legacyNotes,
        profile: {
            ...mergedLegacyProfile,
            firstNames: legacyFirstName,
            lastNamePaternal: legacyLastNamePaternal,
            lastNameMaternal: legacyLastNameMaternal,
            treatmentId: legacyTreatmentId,
            documentTypeId: legacyDocumentTypeId,
            documentNumber: legacyDocumentNumber,
            customerTypeId: legacyCustomerTypeId,
            sourceId: legacyAcquisitionSourceId,
            notes: legacyNotes
        },
        metadata: {
            ...normalizeObject(existing?.metadata),
            ...metadataPatch
        },
        isActive: toBool(sourcePatch.isActive !== undefined ? sourcePatch.isActive : existing?.isActive, existing?.isActive ?? true),
        lastInteractionAt: toIsoText(sourcePatch.lastInteractionAt !== undefined ? sourcePatch.lastInteractionAt : existing?.lastInteractionAt) || null,
        createdAt: toIsoText(existing?.createdAt || nowIso()) || nowIso(),
        updatedAt: nowIso()
    };
    const normalizedDbFields = normalizeCustomerFields({
        contact_name: updatedLegacy.contactName,
        phone_e164: updatedLegacy.phoneE164,
        phone_alt: updatedLegacy.phoneAlt,
        first_name: updatedLegacy.firstName,
        last_name_paternal: updatedLegacy.lastNamePaternal,
        last_name_maternal: updatedLegacy.lastNameMaternal,
        document_number: updatedLegacy.documentNumber,
        notes: updatedLegacy.notes
    });

    if (getStorageDriver() === 'postgres') {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `UPDATE tenant_customers
             SET
                module_id = $3,
                contact_name = $4,
                phone_e164 = $5,
                phone_alt = $6,
                email = $7,
                treatment_id = $8,
                first_name = $9,
                last_name_paternal = $10,
                last_name_maternal = $11,
                document_type_id = $12,
                document_number = $13,
                customer_type_id = $14,
                acquisition_source_id = $15,
                notes = $16,
                tags = $17::jsonb,
                profile = $18::jsonb,
                metadata = $19::jsonb,
                is_active = $20,
                last_interaction_at = $21,
                updated_at = $22
             WHERE tenant_id = $1 AND customer_id = $2
             RETURNING *`,
            [
                cleanTenantId,
                resolvedCustomerId,
                updatedLegacy.moduleId,
                normalizedDbFields.contact_name,
                normalizedDbFields.phone_e164,
                normalizedDbFields.phone_alt,
                updatedLegacy.email,
                updatedLegacy.treatmentId,
                normalizedDbFields.first_name,
                normalizedDbFields.last_name_paternal,
                normalizedDbFields.last_name_maternal,
                updatedLegacy.documentTypeId,
                normalizedDbFields.document_number,
                updatedLegacy.customerTypeId,
                updatedLegacy.acquisitionSourceId,
                normalizedDbFields.notes,
                JSON.stringify(updatedLegacy.tags || []),
                JSON.stringify(updatedLegacy.profile || {}),
                JSON.stringify(updatedLegacy.metadata || {}),
                updatedLegacy.isActive !== false,
                updatedLegacy.lastInteractionAt,
                updatedLegacy.updatedAt
            ]
        );
        return {
            created: false,
            item: result?.rows?.[0] ? sanitizePublic(result.rows[0]) : sanitizePublic(updatedLegacy)
        };
    }

    const parsed = await readTenantJsonFile(CUSTOMERS_FILE, {
        tenantId: cleanTenantId,
        defaultValue: { items: [] }
    });
    const source = Array.isArray(parsed?.items) ? parsed.items.map(sanitizePublic) : [];
    const next = source.map((item) => (String(item?.customerId || '') === resolvedCustomerId ? updatedLegacy : item));
    await writeTenantJsonFile(CUSTOMERS_FILE, { items: next }, { tenantId: cleanTenantId });
    return {
        created: false,
        item: sanitizePublic(updatedLegacy)
    };
}

function normalizeErpHeaderKey(value = '') {
    return String(value || '')
        .replace(/\uFEFF/g, '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function getErpRowValue(row = {}, ...keys) {
    for (const key of keys) {
        const normalizedKey = normalizeErpHeaderKey(key);
        const value = row?.[normalizedKey];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }

        const rawMatchKey = Object.keys(row || {}).find((rowKey) => normalizeErpHeaderKey(rowKey) === normalizedKey);
        if (rawMatchKey) {
            const rawValue = row?.[rawMatchKey];
            if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
                return String(rawValue).trim();
            }
        }
    }
    return '';
}

function normalizeErpContactType(value = '') {
    const raw = normalizeImportTextUpper(value);
    return raw || 'PROSPECTO';
}

function normalizeErpMatchValue(value = '') {
    return String(value || '').replace(/\uFEFF/g, '').trim().toUpperCase() || null;
}

function getErpAddressField(row = {}, fieldName = '') {
    const target = String(fieldName || '').replace(/\uFEFF/g, '').trim().toLowerCase();
    if (!target) return '';
    const key = Object.keys(row || {}).find((entry) => String(entry || '').replace(/\uFEFF/g, '').trim().toLowerCase() === target);
    return key ? String(row?.[key] || '').trim() : '';
}

function normalizeErpPhone(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\+51\d{9}$/.test(raw)) return raw;
    const digits = raw.replace(/\D/g, '');
    if (/^51\d{9}$/.test(digits)) return `+${digits}`;
    if (/^9\d{8}$/.test(digits)) return `+51${digits}`;
    return null;
}

function normalizeErpBoolean(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    return raw === 'true' || raw === '1';
}

function normalizeErpTreatmentId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
        return String(Number(raw));
    }
    return raw.replace(/^0+/, '') || raw;
}

function normalizeErpOptInStatus(value = '') {
    return normalizeErpBoolean(value) ? 'opted_in' : 'pending';
}

function normalizeImportTextUpper(value = '') {
    return toUpper(String(value || '').trim()) || null;
}

function normalizeImportEmail(value = '') {
    const raw = String(value || '').trim();
    return raw ? raw.toLowerCase() : null;
}

function isValidEmailAddress(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function parseErpDate(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (!Number.isFinite(parsed.getTime())) return null;
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        return null;
    }
    return parsed.toISOString();
}

function createErpAddressId() {
    return `addr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const APPSHEET_TREATMENTS = [
    { id: '1', abbr: 'SR.' }, { id: '2', abbr: 'SRA.' }, { id: '3', abbr: 'SRTA.' },
    { id: '4', abbr: 'DR.' }, { id: '5', abbr: 'DRA.' }, { id: '6', abbr: 'LIC.' },
    { id: '7', abbr: 'ING.' }, { id: '8', abbr: 'ARQ.' }, { id: '9', abbr: 'PROF.' },
    { id: '10', abbr: 'D.' }, { id: '11', abbr: 'D\u00d1A.' }, { id: '12', abbr: 'MTRO.' },
    { id: '13', abbr: 'MTRA.' }
];
const APPSHEET_DOCUMENT_TYPES = [
    { id: '1', abbr: 'DNI', label: 'DOCUMENTO NACIONAL DE IDENTIDAD' },
    { id: '6', abbr: 'RUC', label: 'REGISTRO UNICO DE CONTRIBUYENTES' },
    { id: '4', abbr: 'C.EXT.', label: 'CARNET DE EXTRANJERIA' },
    { id: '7', abbr: 'PASAPORTE', label: 'PASAPORTE' },
    { id: '0', abbr: 'TRIB.EXT.', label: 'DOC.TRIB.NO.DOM.SIN.RUC' },
    { id: '-', abbr: 'SIN DOC.', label: 'SIN DOCUMENTO' },
    { id: 'A', abbr: 'C.DIPL.', label: 'CEDULA DIPLOMATICA DE IDENTIDAD' },
    { id: 'B', abbr: 'IDENT.EXT.', label: 'DOC.IDENT.PAIS.RESIDENCIA-NO.D' },
    { id: 'C', abbr: 'TIN', label: 'TAX IDENTIFICATION NUMBER (TIN)' },
    { id: 'D', abbr: 'IN', label: 'IDENTIFICATION NUMBER (IN)' }
];
const APPSHEET_CUSTOMER_TYPES = [
    { id: '1', label: 'PERSONA NATURAL' },
    { id: '2', label: 'PERSONA JURIDICA' },
    { id: '3', label: 'DISTRIBUIDOR' },
    { id: '4', label: 'MAYORISTA' },
    { id: '5', label: 'ALIADO LAVITAT' }
];
const APPSHEET_ACQUISITION_SOURCES = [
    { id: '1', label: 'CANAL DIGITAL' },
    { id: '2', label: 'CANAL WEB' },
    { id: '3', label: 'CANAL TRADICIONAL' }
];

function getAppSheetField(row = {}, ...names) {
    for (const name of names) {
        const target = String(name || '').trim().replace(/\uFEFF/g, '').toLowerCase();
        const key = Object.keys(row || {}).find(
            (entry) => String(entry || '').trim().replace(/\uFEFF/g, '').toLowerCase() === target
        );
        if (key !== undefined) return String(row?.[key] || '').trim();
    }
    return '';
}

function normalizeAppSheetPhone(value = '') {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 9 && digits.startsWith('9')) return `+51${digits}`;
    if (digits.startsWith('51') && digits.length === 11) return `+${digits}`;
    return null;
}

function parseAppSheetMonto(value = '') {
    const clean = String(value || '').replace(/[^0-9.]/g, '').trim();
    return clean ? Number.parseFloat(clean) : null;
}

function parseAppSheetDate(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const clean = raw.split(' ')[0];
    const parts = clean.split('/');
    if (parts.length !== 3) return null;
    const [dayRaw, monthRaw, yearRaw] = parts.map((part) => String(part || '').trim());
    if (!/^\d{1,2}$/.test(dayRaw) || !/^\d{1,2}$/.test(monthRaw) || !/^\d{4}$/.test(yearRaw)) return null;
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(parsed.getTime())) return null;
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        return null;
    }
    return `${yearRaw}-${String(monthRaw).padStart(2, '0')}-${String(dayRaw).padStart(2, '0')}`;
}

function parseOptionalInteger(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalFloat(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function resolveAppSheetTreatment(value = '') {
    const target = toUpper(value);
    return APPSHEET_TREATMENTS.find((entry) => toUpper(entry.abbr) === target)?.id || null;
}

function resolveAppSheetDocumentType(value = '') {
    const target = toUpper(value);
    return APPSHEET_DOCUMENT_TYPES.find((entry) => toUpper(entry.abbr) === target || toUpper(entry.label) === target)?.id || null;
}

function resolveAppSheetCustomerType(value = '') {
    const target = toUpper(value);
    return APPSHEET_CUSTOMER_TYPES.find((entry) => toUpper(entry.label) === target)?.id || null;
}

function resolveAppSheetSource(value = '') {
    const target = toUpper(value);
    return APPSHEET_ACQUISITION_SOURCES.find((entry) => toUpper(entry.label) === target)?.id || null;
}

function normalizeAppSheetOptInStatus(value = '') {
    return ['Y', 'SI', 'S', 'TRUE', '1'].includes(toUpper(value)) ? 'opted_in' : 'pending';
}

function normalizeAppSheetBoolean(value = '') {
    return ['Y', 'SI', 'S', 'TRUE', '1'].includes(toUpper(value));
}

function buildAppSheetCustomerPreview(candidate = {}) {
    return {
        erp_id: candidate.erpId,
        nombre_completo: candidate.fullName,
        telefono: candidate.phoneE164,
        segmento: candidate.segmento,
        realizo_compra: candidate.realizoCompra
    };
}

function buildAppSheetCustomerCandidate(row = {}, moduleId = '') {
    const erpId = normalizeImportTextUpper(getAppSheetField(row, 'Código de Cliente', 'Codigo de Cliente'));
    const contactType = toUpper(getAppSheetField(row, 'TipoContacto')) || 'PROSPECTO';
    const displayName = normalizeImportTextUpper(getAppSheetField(row, 'Cliente'));
    const firstName = normalizeImportTextUpper(getAppSheetField(row, 'Nombres'));
    const lastNamePaternal = normalizeImportTextUpper(getAppSheetField(row, 'Apellido Paterno o Razón Social', 'Apellido Paterno o Razon Social'));
    const lastNameMaternal = normalizeImportTextUpper(getAppSheetField(row, 'Apellido Materno'));
    const contactName = normalizeImportTextUpper(getAppSheetField(row, 'Nombre de Pila')) || displayName;
    const documentNumber = normalizeImportTextUpper(getAppSheetField(row, 'N° de Documento', 'Nro de Documento', 'No de Documento'));
    const phoneE164 = normalizeAppSheetPhone(getAppSheetField(row, 'Teléfono', 'Telefono'));
    const phoneAlt = normalizeAppSheetPhone(getAppSheetField(row, 'Teléfono 2', 'Telefono 2'));
    const email = normalizeImportEmail(getAppSheetField(row, 'Email'));
    const treatmentLabel = normalizeImportTextUpper(getAppSheetField(row, 'Tratamiento'));
    const treatmentId = resolveAppSheetTreatment(treatmentLabel);
    const documentTypeId = resolveAppSheetDocumentType(getAppSheetField(row, 'Tipo de Documento'));
    const customerTypeId = resolveAppSheetCustomerType(getAppSheetField(row, 'Tipo de Cliente'));
    const acquisitionSourceId = resolveAppSheetSource(getAppSheetField(row, 'Fuente'));
    const erpEmployeeId = normalizeImportTextUpper(getAppSheetField(row, 'Responsable'));
    const ubigeo = normalizeImportTextUpper(getAppSheetField(row, 'Ubigeo'));
    const plusCode = normalizeImportTextUpper(getAppSheetField(row, 'PlusCode'));
    const locationLabel = String(getAppSheetField(row, 'Ubicacion') || '').trim();
    const createdAt = parseAppSheetDate(getAppSheetField(row, 'Fecha de Registro'));
    const marketingOptInStatus = normalizeAppSheetOptInStatus(getAppSheetField(row, 'Autorizacion'));
    const notes = getAppSheetField(row, 'ObservacionCliente') || null;
    const diasUltimaCompra = parseOptionalInteger(getAppSheetField(row, 'DiasUltimaCompra'));
    const ultimoPedidoId = getAppSheetField(row, 'UltimoPedidoID') || null;
    const ultimaFechaCompra = parseAppSheetDate(getAppSheetField(row, 'UltimaFecha'));
    const primeraFechaCompra = parseAppSheetDate(getAppSheetField(row, 'PrimeraFecha'));
    const primerPedidoId = getAppSheetField(row, 'PrimeraPedidoID') || null;
    const comprasTotal = parseOptionalInteger(getAppSheetField(row, 'ComprasTotal'));
    const compras120 = parseOptionalInteger(getAppSheetField(row, 'Compras120'));
    const monto120 = parseAppSheetMonto(getAppSheetField(row, 'Monto120'));
    const compras180 = parseOptionalInteger(getAppSheetField(row, 'Compras180'));
    const monto180 = parseAppSheetMonto(getAppSheetField(row, 'Monto180'));
    const ticketProm180 = parseAppSheetMonto(getAppSheetField(row, 'TicketProm180'));
    const montoAcumulado = parseAppSheetMonto(getAppSheetField(row, 'MontoAcumulado'));
    const segmento = getAppSheetField(row, 'Segmento final') || null;
    const realizoCompra = normalizeAppSheetBoolean(getAppSheetField(row, 'Realizo Compra'));
    const cadenciaPromDias = parseOptionalFloat(getAppSheetField(row, 'CadenciaPromDias'));
    const rangoCompras = getAppSheetField(row, 'RangoCompras') || null;
    const fullName = [lastNamePaternal, lastNameMaternal, firstName].filter(Boolean).join(' ').trim()
        || [lastNamePaternal, firstName].filter(Boolean).join(' ').trim()
        || displayName
        || contactName
        || erpId
        || '';
    const rowNumber = Number(row?.__rowNumber || 0) || 0;
    const isProspect = !contactType || contactType === 'PROSPECTO';

    const errors = [];
    if (!erpId) {
        errors.push({ row: rowNumber, erp_id: null, field: 'Codigo de Cliente', message: 'Codigo de cliente vacio' });
    }
    if (isProspect) {
        if (!phoneE164 && !phoneAlt) {
            errors.push({ row: rowNumber, erp_id: erpId, field: 'Telefono', message: 'Prospecto sin telefono' });
        }
    } else if (!firstName && !lastNamePaternal) {
        errors.push({ row: rowNumber, erp_id: erpId, field: 'Nombres/Apellido Paterno o Razon Social', message: 'Debe existir nombres o apellido paterno.' });
    }
    if (email && !isValidEmailAddress(email)) {
        errors.push({ row: rowNumber, erp_id: erpId, field: 'Email', message: 'Email invalido' });
    }

    const dbFields = normalizeCustomerFields({
        erp_id: erpId,
        contact_name: contactName,
        phone_e164: phoneE164,
        phone_alt: phoneAlt,
        first_name: firstName,
        last_name_paternal: lastNamePaternal,
        last_name_maternal: lastNameMaternal,
        document_number: documentNumber
    });

    const candidate = {
        rowNumber,
        erpId,
        displayName,
        treatmentId,
        treatmentLabel,
        firstName: dbFields.first_name || null,
        lastNamePaternal: dbFields.last_name_paternal || null,
        lastNameMaternal: dbFields.last_name_maternal || null,
        documentNumber: dbFields.document_number || null,
        contactName: dbFields.contact_name || null,
        phoneE164: dbFields.phone_e164 || null,
        phoneAlt: dbFields.phone_alt || null,
        email,
        documentTypeId,
        erpEmployeeId: erpEmployeeId || null,
        customerTypeId,
        acquisitionSourceId,
        referralCustomerId: null,
        contactType,
        ubigeo,
        plusCode,
        locationLabel,
        createdAt: createdAt ? `${createdAt}T00:00:00.000Z` : null,
        marketingOptInStatus,
        moduleId: toText(moduleId || '') || null,
        fullName,
        notes,
        diasUltimaCompra,
        ultimoPedidoId,
        ultimaFechaCompra,
        primeraFechaCompra,
        primerPedidoId,
        comprasTotal,
        compras120,
        monto120,
        compras180,
        monto180,
        ticketProm180,
        montoAcumulado,
        segmento,
        realizoCompra,
        cadenciaPromDias,
        rangoCompras,
        errors
    };
    candidate.erpSourcePayload = buildAppSheetCustomerSourcePayload(candidate);
    candidate.erpRowHash = calcCustomerHash(candidate);
    return candidate;
}

function buildErpAddressCandidate(row = {}, customerMatch = null) {
    const rowNumber = Number(row?.__rowNumber || 0) || 0;
    const addressErpId = normalizeErpMatchValue(getErpAddressField(row, 'IdDireccion'));
    const erpId = normalizeErpMatchValue(getErpAddressField(row, 'IdCliente'));
    const street = normalizeImportTextUpper(getErpAddressField(row, 'Direccion'));
    const reference = normalizeImportTextUpper(getErpAddressField(row, 'Referencia'));
    const mapsUrl = String(getErpAddressField(row, 'UbicacionMaps') || '').trim() || null;
    const wkt = String(getErpAddressField(row, 'WKT') || '').trim() || null;
    const districtId = normalizeImportTextUpper(getErpAddressField(row, 'IdDistrito'));
    const isPrimary = normalizeErpBoolean(getErpAddressField(row, 'EsPrincipal'));
    const tipoZona = normalizeImportTextUpper(getErpAddressField(row, 'TipoZona'));
    const tipoVia = normalizeImportTextUpper(getErpAddressField(row, 'TipoVia'));
    const customerId = String(customerMatch?.customerId || '').trim() || null;

    const candidate = {
        rowNumber,
        addressErpId,
        erpId,
        customerId,
        street,
        reference,
        mapsUrl,
        wkt,
        districtId,
        isPrimary,
        tipoZona,
        tipoVia
    };
    candidate.erpRowHash = calcAddressHash(candidate, candidate.isPrimary);
    return candidate;
}

function buildAddressSignature(address = {}) {
    return [
        String(address?.street || '').trim().toUpperCase(),
        String(address?.reference || '').trim().toUpperCase(),
        String(address?.mapsUrl || address?.maps_url || '').trim().toLowerCase(),
        String(address?.wkt || '').trim().toUpperCase(),
        String(address?.districtId || address?.district_id || '').trim().toUpperCase(),
        Boolean(address?.isPrimary || address?.is_primary) ? '1' : '0'
    ].join('|');
}

function buildAppSheetCustomerProfile(candidate = {}) {
    return {
        notes: candidate.notes || null,
        contactType: candidate.contactType || null
    };
}

function buildAppSheetCustomerMetadata(candidate = {}) {
    return {
        appsheetImport: {
            importedAt: nowIso(),
            source: 'appsheet_csv',
            erpId: candidate.erpId || null,
            displayName: candidate.displayName || null,
            responsable: candidate.erpEmployeeId || null,
            ubigeo: candidate.ubigeo || null,
            plusCode: candidate.plusCode || null,
            ubicacion: candidate.locationLabel || null,
            diasUltimaCompra: candidate.diasUltimaCompra,
            ultimoPedidoId: candidate.ultimoPedidoId,
            ultimaFechaCompra: candidate.ultimaFechaCompra,
            primeraFechaCompra: candidate.primeraFechaCompra,
            primerPedidoId: candidate.primerPedidoId,
            comprasTotal: candidate.comprasTotal,
            compras120: candidate.compras120,
            monto120: candidate.monto120,
            compras180: candidate.compras180,
            monto180: candidate.monto180,
            ticketProm180: candidate.ticketProm180,
            montoAcumulado: candidate.montoAcumulado,
            segmento: candidate.segmento,
            realizoCompra: candidate.realizoCompra,
            cadenciaPromDias: candidate.cadenciaPromDias,
            rangoCompras: candidate.rangoCompras
        }
    };
}

function toHashValue(value = '') {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value || '').trim();
}

function createMd5Hash(values = []) {
    const source = (Array.isArray(values) ? values : [])
        .map((value) => toHashValue(value))
        .join('|');
    return crypto.createHash('md5').update(source).digest('hex');
}

function buildAppSheetCustomerSourcePayload(candidate = {}) {
    return {
        erp_id: candidate.erpId || null,
        display_name: candidate.displayName || candidate.fullName || candidate.contactName || null,
        contact_name: candidate.contactName || null,
        first_name: candidate.firstName || null,
        last_name_paternal: candidate.lastNamePaternal || null,
        last_name_maternal: candidate.lastNameMaternal || null,
        phone_e164: candidate.phoneE164 || null,
        phone2_e164: candidate.phoneAlt || null,
        email: candidate.email || null,
        document_number: candidate.documentNumber || null,
        document_type: candidate.documentTypeId || null,
        customer_type: candidate.customerTypeId || null,
        source: candidate.acquisitionSourceId || null,
        erp_employee_id: candidate.erpEmployeeId || null,
        treatment: candidate.treatmentLabel || candidate.treatmentId || null,
        ubigeo: candidate.ubigeo || null,
        plus_code: candidate.plusCode || null,
        location_label: candidate.locationLabel || null,
        dias_ultima_compra: candidate.diasUltimaCompra ?? null,
        ultimo_pedido_id: candidate.ultimoPedidoId || null,
        ultima_fecha_compra: candidate.ultimaFechaCompra || null,
        primera_fecha_compra: candidate.primeraFechaCompra || null,
        primer_pedido_id: candidate.primerPedidoId || null,
        compras_total: candidate.comprasTotal ?? null,
        compras_120: candidate.compras120 ?? null,
        monto_120: candidate.monto120 ?? null,
        compras_180: candidate.compras180 ?? null,
        monto_180: candidate.monto180 ?? null,
        ticket_prom_180: candidate.ticketProm180 ?? null,
        monto_acumulado: candidate.montoAcumulado ?? null,
        segmento: candidate.segmento || null,
        realizo_compra: candidate.realizoCompra ?? null,
        cadencia_prom_dias: candidate.cadenciaPromDias ?? null,
        rango_compras: candidate.rangoCompras || null,
        autorizacion: candidate.marketingOptInStatus || null
    };
}

function calcCustomerHash(candidate = {}) {
    const row = buildAppSheetCustomerSourcePayload(candidate);
    return createMd5Hash([
        row.erp_id,
        row.display_name,
        row.phone_e164,
        row.phone2_e164,
        row.email,
        row.document_number,
        row.customer_type,
        row.source,
        row.erp_employee_id,
        row.ubigeo,
        row.compras_total,
        row.monto_acumulado,
        row.segmento,
        row.autorizacion
    ]);
}

function getJsonField(value = {}, key = '') {
    if (!value || typeof value !== 'object') return '';
    return value?.[key];
}

function normalizeDiffValue(value = '') {
    return toHashValue(value).toUpperCase();
}

const CUSTOMER_IMPORT_DIFF_FIELDS = [
    ['display_name', 'Cliente', (existing) => existing?.erp_source_payload?.display_name || existing?.contact_name, (incoming) => incoming.displayName || incoming.fullName],
    ['contact_name', 'Nombre de pila', (existing) => existing?.contact_name, (incoming) => incoming.contactName],
    ['phone_e164', 'Telefono', (existing) => existing?.phone_e164, (incoming) => incoming.phoneE164],
    ['phone_alt', 'Telefono 2', (existing) => existing?.phone_alt, (incoming) => incoming.phoneAlt],
    ['email', 'Email', (existing) => existing?.email, (incoming) => incoming.email],
    ['document_number', 'Documento', (existing) => existing?.document_number, (incoming) => incoming.documentNumber],
    ['customer_type_id', 'Tipo de cliente', (existing) => existing?.customer_type_id, (incoming) => incoming.customerTypeId],
    ['acquisition_source_id', 'Fuente', (existing) => existing?.acquisition_source_id, (incoming) => incoming.acquisitionSourceId],
    ['erp_employee_id', 'Responsable', (existing) => existing?.erp_employee_id, (incoming) => incoming.erpEmployeeId],
    ['ubigeo', 'Ubigeo', (existing) => getJsonField(existing?.erp_source_payload, 'ubigeo'), (incoming) => incoming.ubigeo],
    ['plus_code', 'PlusCode', (existing) => getJsonField(existing?.erp_source_payload, 'plus_code'), (incoming) => incoming.plusCode],
    ['location_label', 'Ubicacion', (existing) => getJsonField(existing?.erp_source_payload, 'location_label'), (incoming) => incoming.locationLabel],
    ['compras_total', 'ComprasTotal', (existing) => existing?.compras_total, (incoming) => incoming.comprasTotal],
    ['monto_120', 'Monto120', (existing) => existing?.monto_120, (incoming) => incoming.monto120],
    ['monto_180', 'Monto180', (existing) => existing?.monto_180, (incoming) => incoming.monto180],
    ['ultima_fecha_compra', 'UltimaFecha', (existing) => existing?.ultima_fecha_compra, (incoming) => incoming.ultimaFechaCompra],
    ['segmento', 'Segmento final', (existing) => existing?.segmento, (incoming) => incoming.segmento],
    ['monto_acumulado', 'MontoAcumulado', (existing) => existing?.monto_acumulado, (incoming) => incoming.montoAcumulado],
    ['marketing_opt_in_status', 'Autorizacion', (existing) => existing?.marketing_opt_in_status, (incoming) => incoming.marketingOptInStatus]
];

function diffCustomerFields(existing = {}, incoming = {}) {
    return CUSTOMER_IMPORT_DIFF_FIELDS
        .map(([field, label, getCurrent, getIncoming]) => {
            const currentValue = getCurrent(existing);
            const incomingValue = getIncoming(incoming);
            if (normalizeDiffValue(currentValue) === normalizeDiffValue(incomingValue)) return null;
            return {
                field,
                label,
                current: currentValue ?? null,
                incoming: incomingValue ?? null
            };
        })
        .filter(Boolean);
}

function buildAddressSourcePayload(address = {}, isPrimary = false) {
    return {
        erp_address_id: address.addressErpId || null,
        erp_id: address.erpId || null,
        street: address.street || null,
        reference: address.reference || null,
        maps_url: address.mapsUrl || null,
        wkt: address.wkt || null,
        district_id: address.districtId || null,
        is_primary: Boolean(isPrimary),
        tipo_zona: address.tipoZona || null,
        tipo_via: address.tipoVia || null
    };
}

function calcAddressHash(address = {}, isPrimary = false) {
    const row = buildAddressSourcePayload(address, isPrimary);
    return createMd5Hash([
        row.erp_address_id,
        row.erp_id,
        row.street,
        row.reference,
        row.maps_url,
        row.wkt,
        row.district_id,
        row.is_primary,
        row.tipo_zona,
        row.tipo_via
    ]);
}

function buildCustomerImportSample(entry = {}, category = '') {
    const candidate = entry?.candidate || entry || {};
    const existing = entry?.existing || entry?.match || null;
    return {
        category,
        erp_id: candidate.erpId || null,
        customer_id: String(existing?.customer_id || entry?.customerId || '').trim() || null,
        nombre_completo: candidate.fullName || candidate.displayName || candidate.contactName || null,
        telefono: candidate.phoneE164 || candidate.phoneAlt || null,
        tipo_cliente: candidate.customerTypeId || null,
        fuente: candidate.acquisitionSourceId || null,
        changes: Array.isArray(entry?.changes) ? entry.changes : []
    };
}

function buildLinkableCustomerSample(entry = {}) {
    const candidate = entry?.candidate || {};
    const match = entry?.match || {};
    return {
        category: 'linkable',
        erp_id: candidate.erpId || null,
        phone_e164: candidate.phoneE164 || candidate.phoneAlt || null,
        erp: {
            name: candidate.fullName || candidate.displayName || candidate.contactName || null,
            erpId: candidate.erpId || null
        },
        system: {
            name: match.contactName || match.contact_name || match.first_name || null,
            customerId: match.customerId || match.customer_id || null
        },
        recommendedAction: 'link'
    };
}

function normalizeLinkDecisions(value = []) {
    let source = value;
    if (typeof source === 'string') {
        try {
            source = JSON.parse(source);
        } catch (_) {
            source = [];
        }
    }
    const map = new Map();
    (Array.isArray(source) ? source : []).forEach((item = {}) => {
        const erpId = normalizeImportTextUpper(item?.erpId || item?.erp_id || '');
        const customerId = String(item?.customerId || item?.customer_id || '').trim();
        const action = String(item?.action || '').trim().toLowerCase();
        if (!erpId || !['link', 'skip', 'separate'].includes(action)) return;
        map.set(erpId, { erpId, customerId, action });
    });
    return map;
}

function toPgSavepointName(value = 'sp') {
    const clean = String(value || 'sp')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^([^a-zA-Z_])/, '_$1')
        .slice(0, 48);
    return clean || 'sp';
}

function getCustomerImportRowContext(entry = {}, fallbackField = 'commit') {
    const candidate = entry?.candidate || entry?.address || entry || {};
    return {
        row: Number(candidate?.rowNumber || entry?.rowNumber || 0) || 0,
        erpId: String(candidate?.erpId || entry?.erpId || entry?.customerId || entry?.address?.erpId || '').trim() || null,
        field: fallbackField
    };
}

function logCustomerImportRowError(entry, field, error) {
    const context = getCustomerImportRowContext(entry, field);
    const originalError = String(error?.message || error || 'Error desconocido');
    console.error('[CustomerImport] row error:', {
        erpId: context.erpId,
        row: context.row,
        field: context.field,
        originalError
    });
    if (error && typeof error === 'object') {
        error.__customerImportRowLogged = true;
    }
}

async function rollbackAndReleaseSavepoint(client, savepointName) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    await client.query(`RELEASE SAVEPOINT ${savepointName}`);
}

async function runChunkWithSavepoint(client, savepointName, entries, runner, fallbackRunner) {
    if (!entries.length) return;
    const chunkSavepointName = toPgSavepointName(savepointName);
    await client.query(`SAVEPOINT ${chunkSavepointName}`);
    try {
        await runner(entries);
        await client.query(`RELEASE SAVEPOINT ${chunkSavepointName}`);
    } catch (error) {
        await rollbackAndReleaseSavepoint(client, chunkSavepointName);
        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            const rowSavepointName = toPgSavepointName(`${chunkSavepointName}_row_${index + 1}`);
            await client.query(`SAVEPOINT ${rowSavepointName}`);
            try {
                await fallbackRunner(entry, error);
                await client.query(`RELEASE SAVEPOINT ${rowSavepointName}`);
            } catch (rowError) {
                if (!rowError?.__customerImportRowLogged) {
                    logCustomerImportRowError(entry, 'fallback', rowError);
                }
                await rollbackAndReleaseSavepoint(client, rowSavepointName);
            }
        }
    }
}

async function importCustomersFromAppSheet(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const pool = getPostgresPool();
    await ensurePostgresSchema();

    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const importId = toText(payload?.importId || '') || createErpImportId();
    const clientesRows = Array.isArray(payload?.clientesRows) ? payload.clientesRows : [];
    const direccionesRows = Array.isArray(payload?.direccionesRows) ? payload.direccionesRows : [];
    const moduleId = toText(payload?.moduleId || '');
    const mode = String(payload?.mode || 'preview').trim().toLowerCase() || 'preview';
    const linkDecisionMap = normalizeLinkDecisions(payload?.linkDecisions || payload?.link_decisions || []);
    console.log('[ERP-IMPORT][SERVICE] start importId=%s mode=%s tenant=%s clientes=%s direcciones=%s', importId, mode, cleanTenantId, clientesRows.length, direccionesRows.length);

    setErpImportProgress(importId, {
        tenantId: cleanTenantId,
        mode,
        status: mode === 'preview' ? 'analyzing' : 'running',
        phase: 'validating',
        message: mode === 'preview' ? 'Analizando exportacion de AppSheet.' : 'Validando exportacion de AppSheet antes de importar.',
        startedAt: nowIso(),
        finishedAt: null,
        error: '',
        counts: {
            totalRows: clientesRows.length,
            validRows: 0,
            insertRows: 0,
            updateRows: 0,
            errorRows: 0,
            addressTotal: direccionesRows.length,
            addressMatched: 0,
            addressUnmatched: 0,
            customersProcessed: 0,
            customersInserted: 0,
            customersUpdated: 0,
            addressesProcessed: 0,
            addressesInserted: 0,
            addressesUpdated: 0
        },
        percent: 0
    });

    if (!clientesRows.length) {
        throw new Error('El archivo de clientes no tiene filas validas.');
    }
    if (mode !== 'preview' && mode !== 'commit') {
        throw new Error('mode invalido. Usa preview o commit.');
    }

    const candidates = clientesRows.map((row) => buildAppSheetCustomerCandidate(row, moduleId));
    const baseValidCandidates = candidates.filter((candidate) => (candidate.errors || []).length === 0 && candidate.erpId);
    const total = clientesRows.length;
    console.log('[ERP-IMPORT][SERVICE] candidates built importId=%s total=%s baseValid=%s', importId, total, baseValidCandidates.length);

    const existingResult = baseValidCandidates.length > 0
        ? await queryPostgres(
            `SELECT *
             FROM tenant_customers
             WHERE tenant_id = $1
               AND erp_id = ANY($2::text[])`,
            [cleanTenantId, baseValidCandidates.map((candidate) => candidate.erpId)]
        )
        : { rows: [] };
    const existingByErpId = new Map((existingResult?.rows || []).map((row) => [String(row?.erp_id || '').trim().toUpperCase(), row]));

    const phoneSeen = new Map();
    baseValidCandidates.forEach((candidate) => {
        const phone = String(candidate?.phoneE164 || '').trim();
        if (!phone) return;
        if (phoneSeen.has(phone)) {
            candidate.errors = candidate.errors || [];
            candidate.errors.push({
                row: candidate.rowNumber,
                erp_id: candidate.erpId,
                field: 'Telefono',
                message: `Telefono duplicado en CSV (ya usado por ${phoneSeen.get(phone)})`
            });
            return;
        }
        phoneSeen.set(phone, candidate.erpId);
    });

    const allPhones = baseValidCandidates
        .map((candidate) => String(candidate?.phoneE164 || '').trim())
        .filter(Boolean);
    const existingPhonesResult = allPhones.length > 0
        ? await queryPostgres(
            `SELECT phone_e164, erp_id, customer_id, contact_name, first_name, last_name_paternal, last_name_maternal
             FROM tenant_customers
             WHERE tenant_id = $1 AND phone_e164 = ANY($2::text[])`,
            [cleanTenantId, allPhones]
        )
        : { rows: [] };
    const existingPhoneMap = new Map(
        (existingPhonesResult?.rows || []).map((row) => [
            String(row?.phone_e164 || '').trim(),
            {
                erpId: String(row?.erp_id || '').trim() || null,
                customerId: String(row?.customer_id || '').trim() || null,
                customer_id: String(row?.customer_id || '').trim() || null,
                contactName: String(row?.contact_name || '').trim() || null,
                contact_name: String(row?.contact_name || '').trim() || null,
                first_name: String(row?.first_name || '').trim() || null,
                last_name_paternal: String(row?.last_name_paternal || '').trim() || null,
                last_name_maternal: String(row?.last_name_maternal || '').trim() || null
            }
        ])
    );

    baseValidCandidates.forEach((candidate) => {
        const phone = String(candidate?.phoneE164 || '').trim();
        if (!phone) return;
        const existingPhone = existingPhoneMap.get(phone);
        if (!existingPhone) return;
        const existingCustomer = existingByErpId.get(candidate.erpId) || null;
        const existingOwnerCustomerId = String(existingPhone?.customerId || '').trim() || null;
        const currentCustomerId = String(existingCustomer?.customer_id || '').trim() || null;
        if (existingOwnerCustomerId && currentCustomerId && existingOwnerCustomerId === currentCustomerId) {
            return;
        }
        if (existingOwnerCustomerId && !existingPhone.erpId && candidate.erpId) {
            candidate.linkableMatch = existingPhone;
            return;
        }
        const existingOwner = existingPhone.erpId || existingPhone.customerId || null;
        if (existingOwner && existingOwner !== candidate.erpId) {
            candidate.errors = candidate.errors || [];
            candidate.errors.push({
                row: candidate.rowNumber,
                erp_id: candidate.erpId,
                field: 'Telefono',
                message: `Telefono ya registrado para ${existingOwner}`
            });
        }
    });

    const errors = candidates.flatMap((candidate) => candidate.errors || []);
    const validCandidates = candidates.filter((candidate) => (candidate.errors || []).length === 0 && candidate.erpId);
    const categorizedCustomers = {
        new: [],
        updated: [],
        unchanged: [],
        linkable: []
    };

    validCandidates.forEach((candidate) => {
        const existing = existingByErpId.get(candidate.erpId) || null;
        if (!existing && candidate.linkableMatch) {
            categorizedCustomers.linkable.push({ candidate, match: candidate.linkableMatch });
            return;
        }
        if (!existing) {
            categorizedCustomers.new.push({ candidate });
            return;
        }
        const changes = diffCustomerFields(existing, candidate);
        if (String(existing?.erp_row_hash || '').trim() && String(existing.erp_row_hash || '').trim() === candidate.erpRowHash && changes.length === 0) {
            categorizedCustomers.unchanged.push({ candidate, existing, changes: [] });
            return;
        }
        if (!String(existing?.erp_row_hash || '').trim() && changes.length === 0) {
            categorizedCustomers.unchanged.push({ candidate, existing, changes: [] });
            return;
        }
        categorizedCustomers.updated.push({ candidate, existing, changes });
    });

    const inserts = categorizedCustomers.new.map((entry) => entry.candidate);
    const updates = categorizedCustomers.updated.map((entry) => entry.candidate);
    console.log(
        '[ERP-IMPORT][SERVICE] validation done importId=%s valid=%s new=%s updated=%s unchanged=%s linkable=%s errors=%s',
        importId,
        validCandidates.length,
        categorizedCustomers.new.length,
        categorizedCustomers.updated.length,
        categorizedCustomers.unchanged.length,
        categorizedCustomers.linkable.length,
        errors.length
    );

    const importedCustomerMap = new Map();
    let consentSyncTargets = [];
    validCandidates.forEach((candidate) => {
        const existing = existingByErpId.get(candidate.erpId) || candidate.linkableMatch || null;
        importedCustomerMap.set(candidate.erpId, {
            ...candidate,
            customerId: String(existing?.customer_id || existing?.customerId || '').trim() || null
        });
    });

    const addressCandidatesAll = direccionesRows.map((row) => {
        const direccionErpId = normalizeErpMatchValue(getErpAddressField(row, 'IdCliente'));
        return buildErpAddressCandidate(row, importedCustomerMap.get(direccionErpId) || null);
    });
    const previewMatchedAddressCandidates = addressCandidatesAll.filter((address) => address.erpId && importedCustomerMap.has(address.erpId));
    const addressErpIds = previewMatchedAddressCandidates
        .map((address) => String(address?.addressErpId || '').trim())
        .filter(Boolean);
    const existingAddressRows = addressErpIds.length > 0
        ? await queryPostgres(
            `SELECT *
             FROM tenant_customer_addresses
             WHERE tenant_id = $1
               AND erp_address_id = ANY($2::text[])`,
            [cleanTenantId, addressErpIds]
        )
        : { rows: [] };
    const existingAddressByErpId = new Map(
        (existingAddressRows?.rows || []).map((row) => [String(row?.erp_address_id || '').trim(), row])
    );
    const addressDeltaSummary = { new: 0, updated: 0, unchanged: 0 };
    previewMatchedAddressCandidates.forEach((address) => {
        const existingAddress = existingAddressByErpId.get(String(address?.addressErpId || '').trim()) || null;
        if (!existingAddress) {
            addressDeltaSummary.new += 1;
            return;
        }
        if (String(existingAddress?.erp_row_hash || '').trim() && String(existingAddress.erp_row_hash || '').trim() === address.erpRowHash) {
            addressDeltaSummary.unchanged += 1;
            return;
        }
        const currentSignature = buildAddressSignature({
            street: existingAddress.street,
            reference: existingAddress.reference,
            mapsUrl: existingAddress.maps_url,
            wkt: existingAddress.wkt,
            districtId: existingAddress.district_id,
            isPrimary: existingAddress.is_primary
        });
        const nextSignature = buildAddressSignature(address);
        if (!String(existingAddress?.erp_row_hash || '').trim() && currentSignature === nextSignature) {
            addressDeltaSummary.unchanged += 1;
            return;
        }
        addressDeltaSummary.updated += 1;
    });
    const addressSummary = {
        total: direccionesRows.length,
        matched: previewMatchedAddressCandidates.length,
        unmatched: Math.max(0, direccionesRows.length - previewMatchedAddressCandidates.length),
        new: addressDeltaSummary.new,
        updated: addressDeltaSummary.updated,
        unchanged: addressDeltaSummary.unchanged
    };
    console.log('[ERP-IMPORT][SERVICE] addresses prepared importId=%s matched=%s unmatched=%s', importId, addressSummary.matched, addressSummary.unmatched);

    setErpImportProgress(importId, {
        status: mode === 'preview' ? 'preview_ready' : 'running',
        phase: mode === 'preview' ? 'preview' : 'ready',
        message: mode === 'preview'
            ? 'Vista previa lista.'
            : 'Validacion lista. Preparando escritura en base de datos.',
        counts: {
            totalRows: total,
            validRows: validCandidates.length,
            insertRows: categorizedCustomers.new.length,
            updateRows: categorizedCustomers.updated.length,
            unchangedRows: categorizedCustomers.unchanged.length,
            linkableRows: categorizedCustomers.linkable.length,
            errorRows: errors.length,
            addressTotal: addressSummary.total,
            addressMatched: addressSummary.matched,
            addressUnmatched: addressSummary.unmatched,
            customersProcessed: 0,
            customersInserted: 0,
            customersUpdated: 0,
            addressesProcessed: 0,
            addressesInserted: 0,
            addressesUpdated: 0
        },
        percent: mode === 'preview' ? 100 : 2
    });

    if (mode === 'preview') {
        return {
            importId,
            summary: {
                total,
                valid: validCandidates.length,
                updates: categorizedCustomers.updated.length,
                inserts: categorizedCustomers.new.length,
                new: categorizedCustomers.new.length,
                updated: categorizedCustomers.updated.length,
                unchanged: categorizedCustomers.unchanged.length,
                linkable: categorizedCustomers.linkable.length,
                errors: errors.length
            },
            errors,
            preview: validCandidates.slice(0, 5).map(buildAppSheetCustomerPreview),
            samples: {
                new: categorizedCustomers.new.slice(0, 3).map((entry) => buildCustomerImportSample(entry, 'new')),
                updated: categorizedCustomers.updated.slice(0, 3).map((entry) => buildCustomerImportSample(entry, 'updated')),
                unchanged: categorizedCustomers.unchanged.slice(0, 3).map((entry) => buildCustomerImportSample(entry, 'unchanged')),
                linkable: categorizedCustomers.linkable.map(buildLinkableCustomerSample),
                errors
            },
            addressSummary
        };
    }

    const existingIdsRows = await queryPostgres('SELECT customer_id FROM tenant_customers WHERE tenant_id = $1', [cleanTenantId]);
    const existingIds = new Set((existingIdsRows?.rows || []).map((row) => String(row?.customer_id || '').trim().toUpperCase()).filter(Boolean));
    const customerCounts = {
        inserted: 0,
        updated: 0,
        linked: 0,
        skipped: categorizedCustomers.unchanged.length,
        errors: errors.length
    };
    const addressCounts = { inserted: 0, updated: 0, skipped: 0, errors: 0, unmatched: addressSummary.unmatched };
    const client = await pool.connect();
    const totalWorkUnits = Math.max(1, validCandidates.length + previewMatchedAddressCandidates.length);
    let transactionCommitted = false;

    function updateCommitProgress(phase = 'running', message = '') {
        const processedCustomers = customerCounts.inserted + customerCounts.updated;
        const processedAddresses = addressCounts.inserted + addressCounts.updated + addressCounts.skipped;
        const processedUnits = processedCustomers + processedAddresses;
        const percent = Math.max(2, Math.min(99, Math.round((processedUnits / totalWorkUnits) * 100)));
        setErpImportProgress(importId, {
            status: 'running',
            phase,
            message,
            counts: {
                totalRows: total,
                validRows: validCandidates.length,
                insertRows: categorizedCustomers.new.length,
                updateRows: categorizedCustomers.updated.length,
                unchangedRows: categorizedCustomers.unchanged.length,
                linkableRows: categorizedCustomers.linkable.length,
                errorRows: errors.length,
                addressTotal: addressSummary.total,
                addressMatched: addressSummary.matched,
                addressUnmatched: addressSummary.unmatched,
                customersProcessed: processedCustomers + customerCounts.linked + customerCounts.skipped,
                customersInserted: customerCounts.inserted,
                customersUpdated: customerCounts.updated,
                customersLinked: customerCounts.linked,
                customersSkipped: customerCounts.skipped,
                addressesProcessed: processedAddresses,
                addressesInserted: addressCounts.inserted,
                addressesUpdated: addressCounts.updated,
                addressesSkipped: addressCounts.skipped
            },
            percent
        });
    }

    try {
        console.log('[ERP-IMPORT][SERVICE] opening transaction importId=%s', importId);
        await client.query('BEGIN');
        updateCommitProgress('customers', 'Importando clientes a la base de datos.');
        console.log('[ERP-IMPORT][SERVICE] begin ok importId=%s', importId);
        throwIfErpImportCancelled(importId);

        const insertCandidates = [];
        const updateCandidates = [];
        const linkCandidates = [];

        for (const { candidate } of categorizedCustomers.new) {
            const customerId = createCustomerId(existingIds);
            existingIds.add(customerId);
            importedCustomerMap.set(candidate.erpId, { ...candidate, customerId });
            insertCandidates.push({ candidate, customerId });
        }

        categorizedCustomers.updated.forEach(({ candidate, existing }) => {
            updateCandidates.push({ candidate, existing });
            importedCustomerMap.set(candidate.erpId, { ...candidate, customerId: existing.customer_id });
        });

        categorizedCustomers.unchanged.forEach(({ candidate, existing }) => {
            importedCustomerMap.set(candidate.erpId, { ...candidate, customerId: existing.customer_id });
        });

        for (const entry of categorizedCustomers.linkable) {
            const candidate = entry.candidate;
            const match = entry.match || {};
            const decision = linkDecisionMap.get(candidate.erpId) || { action: 'skip' };
            if (decision.action === 'link') {
                const customerId = String(decision.customerId || match.customerId || match.customer_id || '').trim();
                if (!customerId) {
                    errors.push({ row: candidate.rowNumber, erp_id: candidate.erpId, field: 'link', message: 'Decision de vinculacion sin customerId.' });
                    customerCounts.errors += 1;
                    continue;
                }
                linkCandidates.push({ candidate, customerId });
                importedCustomerMap.set(candidate.erpId, { ...candidate, customerId });
                continue;
            }
            if (decision.action === 'separate') {
                const customerId = createCustomerId(existingIds);
                existingIds.add(customerId);
                importedCustomerMap.set(candidate.erpId, { ...candidate, customerId });
                insertCandidates.push({ candidate, customerId });
                continue;
            }
            importedCustomerMap.delete(candidate.erpId);
            customerCounts.skipped += 1;
        }

        let insertChunkIndex = 0;
        for (const chunk of chunkArray(insertCandidates, ERP_IMPORT_BATCH_SIZE)) {
            throwIfErpImportCancelled(importId);
            insertChunkIndex += 1;
            await runChunkWithSavepoint(
                client,
                `sp_insert_customers_${insertChunkIndex}`,
                chunk,
                async (entries) => {
                    const values = [];
                    const placeholders = entries.map((entry, index) => {
                        const candidate = entry.candidate;
                        const profile = buildAppSheetCustomerProfile(candidate);
                        const metadata = buildAppSheetCustomerMetadata(candidate);
                        const offset = index * 41;
                        values.push(
                            cleanTenantId,
                            entry.customerId,
                            candidate.moduleId,
                            candidate.contactName,
                            candidate.phoneE164,
                            candidate.phoneAlt,
                            candidate.email,
                            candidate.treatmentId,
                            candidate.firstName,
                            candidate.lastNamePaternal,
                            candidate.lastNameMaternal,
                            candidate.documentTypeId,
                            candidate.documentNumber,
                            candidate.customerTypeId,
                            candidate.acquisitionSourceId,
                            candidate.notes,
                            JSON.stringify(profile),
                            JSON.stringify(metadata),
                            candidate.createdAt || nowIso(),
                            candidate.erpId,
                            candidate.erpEmployeeId,
                            candidate.referralCustomerId,
                            candidate.marketingOptInStatus,
                            candidate.diasUltimaCompra,
                            candidate.ultimoPedidoId,
                            candidate.ultimaFechaCompra,
                            candidate.primeraFechaCompra,
                            candidate.primerPedidoId,
                            candidate.comprasTotal,
                            candidate.compras120,
                            candidate.monto120,
                            candidate.compras180,
                            candidate.monto180,
                            candidate.ticketProm180,
                            candidate.montoAcumulado,
                            candidate.segmento,
                            candidate.realizoCompra,
                            candidate.cadenciaPromDias,
                            candidate.rangoCompras,
                            candidate.erpRowHash,
                            importId,
                            JSON.stringify(candidate.erpSourcePayload || {})
                        );
                        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, '[]'::jsonb, $${offset + 17}::jsonb, $${offset + 18}::jsonb, TRUE, NULL, $${offset + 19}, NOW(), $${offset + 20}, $${offset + 21}, $${offset + 22}, $${offset + 23}, NOW(), 'appsheet_import', $${offset + 24}, $${offset + 25}, $${offset + 26}::date, $${offset + 27}::date, $${offset + 28}, $${offset + 29}, $${offset + 30}, $${offset + 31}, $${offset + 32}, $${offset + 33}, $${offset + 34}, $${offset + 35}, $${offset + 36}, $${offset + 37}, $${offset + 38}, $${offset + 39}, NOW(), $${offset + 40}, $${offset + 41}::jsonb)`;
                    });
                    await client.query(
                        `INSERT INTO tenant_customers (
                            tenant_id, customer_id, module_id, contact_name, phone_e164, phone_alt, email,
                            treatment_id, first_name, last_name_paternal, last_name_maternal, document_type_id,
                            document_number, customer_type_id, acquisition_source_id, notes, tags, profile, metadata,
                            is_active, last_interaction_at, created_at, updated_at, erp_id, erp_employee_id,
                            referral_customer_id, marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
                            dias_ultima_compra, ultimo_pedido_id, ultima_fecha_compra, primera_fecha_compra,
                            primer_pedido_id, compras_total, compras_120, monto_120, compras_180, monto_180,
                            ticket_prom_180, monto_acumulado, segmento, realizo_compra, cadencia_prom_dias, rango_compras,
                            erp_row_hash, erp_last_seen_at, erp_last_import_id, erp_source_payload
                        ) VALUES ${placeholders.join(', ')}`,
                        values
                    );
                    customerCounts.inserted += entries.length;
                    updateCommitProgress('customers', `Procesando clientes ${customerCounts.inserted + customerCounts.updated} de ${validCandidates.length}.`);
                },
                async (entry) => {
                    const candidate = entry.candidate;
                    const profile = buildAppSheetCustomerProfile(candidate);
                    const metadata = buildAppSheetCustomerMetadata(candidate);
                    try {
                        await client.query(
                            `INSERT INTO tenant_customers (
                                tenant_id, customer_id, module_id, contact_name, phone_e164, phone_alt, email,
                                treatment_id, first_name, last_name_paternal, last_name_maternal, document_type_id,
                                document_number, customer_type_id, acquisition_source_id, notes, tags, profile, metadata,
                                is_active, last_interaction_at, created_at, updated_at, erp_id, erp_employee_id,
                                referral_customer_id, marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
                                dias_ultima_compra, ultimo_pedido_id, ultima_fecha_compra, primera_fecha_compra,
                                primer_pedido_id, compras_total, compras_120, monto_120, compras_180, monto_180,
                                ticket_prom_180, monto_acumulado, segmento, realizo_compra, cadencia_prom_dias, rango_compras,
                                erp_row_hash, erp_last_seen_at, erp_last_import_id, erp_source_payload
                            ) VALUES (
                                $1, $2, $3, $4, $5, $6, $7,
                                $8, $9, $10, $11, $12,
                                $13, $14, $15, $16, '[]'::jsonb, $17::jsonb, $18::jsonb,
                                TRUE, NULL, $19, NOW(), $20, $21,
                                $22, $23, NOW(), 'appsheet_import',
                                $24, $25, $26::date, $27::date,
                                $28, $29, $30, $31, $32, $33,
                                $34, $35, $36, $37, $38, $39,
                                $40, NOW(), $41, $42::jsonb
                            )`,
                            [
                                cleanTenantId, entry.customerId, candidate.moduleId, candidate.contactName, candidate.phoneE164, candidate.phoneAlt, candidate.email,
                                candidate.treatmentId, candidate.firstName, candidate.lastNamePaternal, candidate.lastNameMaternal, candidate.documentTypeId,
                                candidate.documentNumber, candidate.customerTypeId, candidate.acquisitionSourceId, candidate.notes, JSON.stringify(profile), JSON.stringify(metadata),
                                candidate.createdAt || nowIso(), candidate.erpId, candidate.erpEmployeeId,
                                candidate.referralCustomerId, candidate.marketingOptInStatus, candidate.diasUltimaCompra, candidate.ultimoPedidoId,
                                candidate.ultimaFechaCompra, candidate.primeraFechaCompra, candidate.primerPedidoId, candidate.comprasTotal, candidate.compras120,
                                candidate.monto120, candidate.compras180, candidate.monto180, candidate.ticketProm180, candidate.montoAcumulado,
                                candidate.segmento, candidate.realizoCompra, candidate.cadenciaPromDias, candidate.rangoCompras,
                                candidate.erpRowHash, importId, JSON.stringify(candidate.erpSourcePayload || {})
                            ]
                        );
                        customerCounts.inserted += 1;
                    } catch (error) {
                        logCustomerImportRowError(entry, 'commit', error);
                        errors.push({ row: candidate.rowNumber, erp_id: candidate.erpId, field: 'commit', message: String(error?.message || error) });
                        customerCounts.errors += 1;
                        throw error;
                    }
                    updateCommitProgress('customers', `Procesando clientes ${customerCounts.inserted + customerCounts.updated} de ${validCandidates.length}.`);
                }
            );
        }

        for (const chunk of chunkArray(linkCandidates, ERP_IMPORT_BATCH_SIZE)) {
            throwIfErpImportCancelled(importId);
            const values = [];
            const placeholders = chunk.map(({ candidate, customerId }, index) => {
                const offset = index * 42;
                const profile = buildAppSheetCustomerProfile(candidate);
                const metadata = buildAppSheetCustomerMetadata(candidate);
                values.push(
                    customerId,
                    candidate.moduleId,
                    candidate.contactName,
                    candidate.phoneE164,
                    candidate.phoneAlt,
                    candidate.email,
                    candidate.treatmentId,
                    candidate.firstName,
                    candidate.lastNamePaternal,
                    candidate.lastNameMaternal,
                    candidate.documentTypeId,
                    candidate.documentNumber,
                    candidate.customerTypeId,
                    candidate.acquisitionSourceId,
                    candidate.notes,
                    JSON.stringify(profile),
                    JSON.stringify(metadata),
                    candidate.erpId,
                    candidate.erpEmployeeId,
                    candidate.referralCustomerId,
                    candidate.diasUltimaCompra,
                    candidate.ultimoPedidoId,
                    candidate.ultimaFechaCompra,
                    candidate.primeraFechaCompra,
                    candidate.primerPedidoId,
                    candidate.comprasTotal,
                    candidate.compras120,
                    candidate.monto120,
                    candidate.compras180,
                    candidate.monto180,
                    candidate.ticketProm180,
                    candidate.montoAcumulado,
                    candidate.segmento,
                    candidate.realizoCompra,
                    candidate.cadenciaPromDias,
                    candidate.rangoCompras,
                    candidate.marketingOptInStatus,
                    nowIso(),
                    'appsheet_import',
                    candidate.erpRowHash,
                    importId,
                    JSON.stringify(candidate.erpSourcePayload || {})
                );
                return `(
                    $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8},
                    $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15},
                    $${offset + 16}::jsonb, $${offset + 17}::jsonb, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21},
                    $${offset + 22}, $${offset + 23}::date, $${offset + 24}::date, $${offset + 25}, $${offset + 26}, $${offset + 27},
                    $${offset + 28}, $${offset + 29}, $${offset + 30}, $${offset + 31}, $${offset + 32}, $${offset + 33}, $${offset + 34},
                    $${offset + 35}, $${offset + 36}, $${offset + 37}, $${offset + 38}::timestamptz, $${offset + 39},
                    $${offset + 40}, NOW(), $${offset + 41}, $${offset + 42}::jsonb
                )`;
            });
            await client.query(
                `UPDATE tenant_customers AS customers
                 SET
                    module_id = COALESCE(payload.module_id, customers.module_id),
                    contact_name = COALESCE(payload.contact_name, customers.contact_name),
                    phone_e164 = COALESCE(payload.phone_e164, customers.phone_e164),
                    phone_alt = COALESCE(payload.phone_alt, customers.phone_alt),
                    email = COALESCE(payload.email, customers.email),
                    treatment_id = payload.treatment_id,
                    first_name = payload.first_name,
                    last_name_paternal = payload.last_name_paternal,
                    last_name_maternal = payload.last_name_maternal,
                    document_type_id = payload.document_type_id,
                    document_number = payload.document_number,
                    customer_type_id = payload.customer_type_id,
                    acquisition_source_id = payload.acquisition_source_id,
                    notes = payload.notes,
                    profile = payload.profile,
                    metadata = COALESCE(customers.metadata, '{}'::jsonb) || payload.metadata,
                    erp_id = payload.erp_id,
                    erp_employee_id = payload.erp_employee_id,
                    referral_customer_id = payload.referral_customer_id,
                    dias_ultima_compra = payload.dias_ultima_compra,
                    ultimo_pedido_id = payload.ultimo_pedido_id,
                    ultima_fecha_compra = payload.ultima_fecha_compra,
                    primera_fecha_compra = payload.primera_fecha_compra,
                    primer_pedido_id = payload.primer_pedido_id,
                    compras_total = payload.compras_total,
                    compras_120 = payload.compras_120,
                    monto_120 = payload.monto_120,
                    compras_180 = payload.compras_180,
                    monto_180 = payload.monto_180,
                    ticket_prom_180 = payload.ticket_prom_180,
                    monto_acumulado = payload.monto_acumulado,
                    segmento = payload.segmento,
                    realizo_compra = payload.realizo_compra,
                    cadencia_prom_dias = payload.cadencia_prom_dias,
                    rango_compras = payload.rango_compras,
                    marketing_opt_in_status = payload.marketing_opt_in_status,
                    marketing_opt_in_updated_at = payload.marketing_opt_in_updated_at,
                    marketing_opt_in_source = payload.marketing_opt_in_source,
                    erp_row_hash = payload.erp_row_hash,
                    erp_last_seen_at = payload.erp_last_seen_at,
                    erp_last_import_id = payload.erp_last_import_id,
                    erp_source_payload = payload.erp_source_payload,
                    is_active = TRUE,
                    updated_at = NOW()
                 FROM (
                    VALUES ${placeholders.join(', ')}
                 ) AS payload(
                    customer_id, module_id, contact_name, phone_e164, phone_alt, email, treatment_id, first_name,
                    last_name_paternal, last_name_maternal, document_type_id, document_number, customer_type_id,
                    acquisition_source_id, notes, profile, metadata, erp_id, erp_employee_id, referral_customer_id,
                    dias_ultima_compra, ultimo_pedido_id, ultima_fecha_compra, primera_fecha_compra, primer_pedido_id,
                    compras_total, compras_120, monto_120, compras_180, monto_180, ticket_prom_180, monto_acumulado,
                    segmento, realizo_compra, cadencia_prom_dias, rango_compras,
                    marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
                    erp_row_hash, erp_last_seen_at, erp_last_import_id, erp_source_payload
                 )
                 WHERE customers.tenant_id = $${values.length + 1}
                   AND customers.customer_id = payload.customer_id`,
                [...values, cleanTenantId]
            );
            customerCounts.linked += chunk.length;
            updateCommitProgress('customers', `Vinculando clientes ${customerCounts.linked} de ${linkCandidates.length}.`);
        }

        const contextRows = [
            ...insertCandidates
                .filter((entry) => entry.candidate.moduleId)
                .map((entry) => ({
                    customerId: entry.customerId,
                    moduleId: entry.candidate.moduleId,
                    marketingOptInStatus: entry.candidate.marketingOptInStatus
                })),
            ...updateCandidates
                .filter((entry) => entry.candidate.moduleId)
                .map((entry) => ({
                    customerId: entry.existing?.customer_id,
                    moduleId: entry.candidate.moduleId,
                    marketingOptInStatus: entry.candidate.marketingOptInStatus
                })),
            ...linkCandidates
                .filter((entry) => entry.candidate.moduleId)
                .map((entry) => ({
                    customerId: entry.customerId,
                    moduleId: entry.candidate.moduleId,
                    marketingOptInStatus: entry.candidate.marketingOptInStatus
                }))
        ];
        let contextChunkIndex = 0;
        for (const chunk of chunkArray(contextRows, ERP_IMPORT_BATCH_SIZE)) {
            throwIfErpImportCancelled(importId);
            contextChunkIndex += 1;
            await runChunkWithSavepoint(
                client,
                `sp_insert_contexts_${contextChunkIndex}`,
                chunk,
                async (entries) => {
                    const values = [];
                    const placeholders = entries.map((entry, index) => {
                        const offset = index * 4;
                        values.push(cleanTenantId, entry.customerId, entry.moduleId, entry.marketingOptInStatus);
                        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, NOW(), 'appsheet_import', 'nuevo', '[]'::jsonb, '{}'::jsonb, NOW(), NOW())`;
                    });
                    await client.query(
                        `INSERT INTO tenant_customer_module_contexts (
                            tenant_id, customer_id, module_id, marketing_opt_in_status, marketing_opt_in_updated_at,
                            marketing_opt_in_source, commercial_status, labels, metadata, created_at, updated_at
                        ) VALUES ${placeholders.join(', ')}
                        ON CONFLICT (tenant_id, customer_id, module_id)
                        DO UPDATE SET updated_at = NOW()`,
                        values
                    );
                },
                async (entry) => {
                    try {
                        await client.query(
                            `INSERT INTO tenant_customer_module_contexts (
                                tenant_id, customer_id, module_id, marketing_opt_in_status, marketing_opt_in_updated_at,
                                marketing_opt_in_source, commercial_status, labels, metadata, created_at, updated_at
                            ) VALUES (
                                $1, $2, $3, $4, NOW(), 'appsheet_import', 'nuevo', '[]'::jsonb, '{}'::jsonb, NOW(), NOW()
                            )
                            ON CONFLICT (tenant_id, customer_id, module_id)
                            DO UPDATE SET updated_at = NOW()`,
                            [cleanTenantId, entry.customerId, entry.moduleId, entry.marketingOptInStatus]
                        );
                    } catch (error) {
                        logCustomerImportRowError(entry, 'module_context', error);
                        errors.push({ row: 0, erp_id: entry.customerId, field: 'module_context', message: String(error?.message || error) });
                        customerCounts.errors += 1;
                        throw error;
                    }
                }
            );
        }

        let updateChunkIndex = 0;
        for (const chunk of chunkArray(updateCandidates, ERP_IMPORT_BATCH_SIZE)) {
            throwIfErpImportCancelled(importId);
            updateChunkIndex += 1;
            await runChunkWithSavepoint(
                client,
                `sp_update_customers_${updateChunkIndex}`,
                chunk,
                async (entries) => {
                    const values = [];
                    const placeholders = entries.map(({ candidate, existing }, index) => {
                        const offset = index * 42;
                        const profile = buildAppSheetCustomerProfile(candidate);
                        const metadata = buildAppSheetCustomerMetadata(candidate);
                        values.push(
                            existing.customer_id,
                            candidate.moduleId,
                            candidate.contactName,
                            candidate.phoneE164,
                            candidate.phoneAlt,
                            candidate.email,
                            candidate.treatmentId,
                            candidate.firstName,
                            candidate.lastNamePaternal,
                            candidate.lastNameMaternal,
                            candidate.documentTypeId,
                            candidate.documentNumber,
                            candidate.customerTypeId,
                            candidate.acquisitionSourceId,
                            candidate.notes,
                            JSON.stringify(profile),
                            JSON.stringify(metadata),
                            candidate.erpId,
                            candidate.erpEmployeeId,
                            candidate.referralCustomerId,
                            candidate.diasUltimaCompra,
                            candidate.ultimoPedidoId,
                            candidate.ultimaFechaCompra,
                            candidate.primeraFechaCompra,
                            candidate.primerPedidoId,
                            candidate.comprasTotal,
                            candidate.compras120,
                            candidate.monto120,
                            candidate.compras180,
                            candidate.monto180,
                            candidate.ticketProm180,
                            candidate.montoAcumulado,
                            candidate.segmento,
                            candidate.realizoCompra,
                            candidate.cadenciaPromDias,
                            candidate.rangoCompras,
                            candidate.marketingOptInStatus,
                            nowIso(),
                            'appsheet_import',
                            candidate.erpRowHash,
                            importId,
                            JSON.stringify(candidate.erpSourcePayload || {})
                        );
                        return `(
                            $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8},
                            $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15},
                            $${offset + 16}::jsonb, $${offset + 17}::jsonb, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21},
                            $${offset + 22}, $${offset + 23}::date, $${offset + 24}::date, $${offset + 25}, $${offset + 26}, $${offset + 27},
                            $${offset + 28}, $${offset + 29}, $${offset + 30}, $${offset + 31}, $${offset + 32}, $${offset + 33}, $${offset + 34},
                            $${offset + 35}, $${offset + 36}, $${offset + 37}, $${offset + 38}::timestamptz, $${offset + 39},
                            $${offset + 40}, NOW(), $${offset + 41}, $${offset + 42}::jsonb
                        )`;
                    });
                    await client.query(
                        `UPDATE tenant_customers AS customers
                         SET
                            module_id = payload.module_id,
                            contact_name = payload.contact_name,
                            phone_e164 = COALESCE(payload.phone_e164, customers.phone_e164),
                            phone_alt = COALESCE(payload.phone_alt, customers.phone_alt),
                            email = COALESCE(payload.email, customers.email),
                            treatment_id = payload.treatment_id,
                            first_name = payload.first_name,
                            last_name_paternal = payload.last_name_paternal,
                            last_name_maternal = payload.last_name_maternal,
                            document_type_id = payload.document_type_id,
                            document_number = payload.document_number,
                            customer_type_id = payload.customer_type_id,
                            acquisition_source_id = payload.acquisition_source_id,
                            notes = payload.notes,
                            profile = payload.profile,
                            metadata = COALESCE(customers.metadata, '{}'::jsonb) || payload.metadata,
                            erp_id = payload.erp_id,
                            erp_employee_id = payload.erp_employee_id,
                            referral_customer_id = payload.referral_customer_id,
                            dias_ultima_compra = payload.dias_ultima_compra,
                            ultimo_pedido_id = payload.ultimo_pedido_id,
                            ultima_fecha_compra = payload.ultima_fecha_compra,
                            primera_fecha_compra = payload.primera_fecha_compra,
                            primer_pedido_id = payload.primer_pedido_id,
                            compras_total = payload.compras_total,
                            compras_120 = payload.compras_120,
                            monto_120 = payload.monto_120,
                            compras_180 = payload.compras_180,
                            monto_180 = payload.monto_180,
                            ticket_prom_180 = payload.ticket_prom_180,
                            monto_acumulado = payload.monto_acumulado,
                            segmento = payload.segmento,
                            realizo_compra = payload.realizo_compra,
                            cadencia_prom_dias = payload.cadencia_prom_dias,
                            rango_compras = payload.rango_compras,
                            marketing_opt_in_status = payload.marketing_opt_in_status,
                            marketing_opt_in_updated_at = payload.marketing_opt_in_updated_at,
                            marketing_opt_in_source = payload.marketing_opt_in_source,
                            erp_row_hash = payload.erp_row_hash,
                            erp_last_seen_at = payload.erp_last_seen_at,
                            erp_last_import_id = payload.erp_last_import_id,
                            erp_source_payload = payload.erp_source_payload,
                            is_active = TRUE,
                            updated_at = NOW()
                         FROM (
                            VALUES ${placeholders.join(', ')}
                         ) AS payload(
                            customer_id, module_id, contact_name, phone_e164, phone_alt, email, treatment_id, first_name,
                            last_name_paternal, last_name_maternal, document_type_id, document_number, customer_type_id,
                            acquisition_source_id, notes, profile, metadata, erp_id, erp_employee_id, referral_customer_id,
                            dias_ultima_compra, ultimo_pedido_id, ultima_fecha_compra, primera_fecha_compra, primer_pedido_id,
                            compras_total, compras_120, monto_120, compras_180, monto_180, ticket_prom_180, monto_acumulado,
                            segmento, realizo_compra, cadencia_prom_dias, rango_compras,
                            marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
                            erp_row_hash, erp_last_seen_at, erp_last_import_id, erp_source_payload
                         )
                         WHERE customers.tenant_id = $${values.length + 1}
                           AND customers.customer_id = payload.customer_id`,
                        [...values, cleanTenantId]
                    );
                    entries.forEach(({ candidate, existing }) => {
                        importedCustomerMap.set(candidate.erpId, { ...candidate, customerId: existing.customer_id });
                    });
                    customerCounts.updated += entries.length;
                    updateCommitProgress('customers', `Procesando clientes ${customerCounts.inserted + customerCounts.updated} de ${validCandidates.length}.`);
                },
                async ({ candidate, existing }) => {
                    const profile = buildAppSheetCustomerProfile(candidate);
                    const metadata = buildAppSheetCustomerMetadata(candidate);
                    try {
                        await client.query(
                            `UPDATE tenant_customers
                             SET
                                module_id = $3,
                                contact_name = $4,
                                phone_e164 = COALESCE($5, phone_e164),
                                phone_alt = COALESCE($6, phone_alt),
                                email = COALESCE($7, email),
                                treatment_id = $8,
                                first_name = $9,
                                last_name_paternal = $10,
                                last_name_maternal = $11,
                                document_type_id = $12,
                                document_number = $13,
                                customer_type_id = $14,
                                acquisition_source_id = $15,
                                notes = $16,
                                profile = $17::jsonb,
                                metadata = COALESCE(metadata, '{}'::jsonb) || $18::jsonb,
                                erp_id = $19,
                                erp_employee_id = $20,
                                referral_customer_id = $21,
                                dias_ultima_compra = $22,
                                ultimo_pedido_id = $23,
                                ultima_fecha_compra = $24::date,
                                primera_fecha_compra = $25::date,
                                primer_pedido_id = $26,
                                compras_total = $27,
                                compras_120 = $28,
                                monto_120 = $29,
                                compras_180 = $30,
                                monto_180 = $31,
                                ticket_prom_180 = $32,
                                monto_acumulado = $33,
                                segmento = $34,
                                realizo_compra = $35,
                                cadencia_prom_dias = $36,
                                rango_compras = $37,
                                marketing_opt_in_status = $38,
                                marketing_opt_in_updated_at = $39::timestamptz,
                                marketing_opt_in_source = $40,
                                erp_row_hash = $41,
                                erp_last_seen_at = NOW(),
                                erp_last_import_id = $42,
                                erp_source_payload = $43::jsonb,
                                is_active = TRUE,
                                updated_at = NOW()
                             WHERE tenant_id = $1 AND customer_id = $2`,
                            [
                                cleanTenantId, existing.customer_id, candidate.moduleId, candidate.contactName, candidate.phoneE164, candidate.phoneAlt, candidate.email,
                                candidate.treatmentId, candidate.firstName, candidate.lastNamePaternal, candidate.lastNameMaternal, candidate.documentTypeId,
                                candidate.documentNumber, candidate.customerTypeId, candidate.acquisitionSourceId, candidate.notes, JSON.stringify(profile),
                                JSON.stringify(metadata), candidate.erpId, candidate.erpEmployeeId, candidate.referralCustomerId, candidate.diasUltimaCompra,
                                candidate.ultimoPedidoId, candidate.ultimaFechaCompra, candidate.primeraFechaCompra, candidate.primerPedidoId, candidate.comprasTotal,
                                candidate.compras120, candidate.monto120, candidate.compras180, candidate.monto180, candidate.ticketProm180,
                                candidate.montoAcumulado, candidate.segmento, candidate.realizoCompra, candidate.cadenciaPromDias, candidate.rangoCompras,
                                candidate.marketingOptInStatus, nowIso(), 'appsheet_import',
                                candidate.erpRowHash, importId, JSON.stringify(candidate.erpSourcePayload || {})
                            ]
                        );
                        importedCustomerMap.set(candidate.erpId, { ...candidate, customerId: existing.customer_id });
                        customerCounts.updated += 1;
                    } catch (error) {
                        logCustomerImportRowError({ candidate, existing }, 'commit', error);
                        errors.push({ row: candidate.rowNumber, erp_id: candidate.erpId, field: 'commit', message: String(error?.message || error) });
                        customerCounts.errors += 1;
                        throw error;
                    }
                    updateCommitProgress('customers', `Procesando clientes ${customerCounts.inserted + customerCounts.updated} de ${validCandidates.length}.`);
                }
            );
        }

        const matchedAddressCandidates = addressCandidatesAll
            .map((address) => {
                if (!address.erpId) return address;
                const importedCustomer = importedCustomerMap.get(address.erpId) || null;
                return {
                    ...address,
                    customerId: String(importedCustomer?.customerId || '').trim() || null
                };
            })
            .filter((address) => address.customerId);

        if (matchedAddressCandidates.length > 0) {
            updateCommitProgress('addresses', 'Importando direcciones con match.');
            const customerIds = Array.from(new Set(matchedAddressCandidates.map((candidate) => candidate.customerId).filter(Boolean)));
            const existingAddressesResult = await client.query(
                `SELECT *
                 FROM tenant_customer_addresses
                 WHERE tenant_id = $1
                   AND customer_id = ANY($2::text[])`,
                [cleanTenantId, customerIds]
            );
            const addressesByCustomer = new Map();
            (existingAddressesResult?.rows || []).forEach((row) => {
                const customerId = String(row?.customer_id || '').trim();
                if (!customerId) return;
                const list = addressesByCustomer.get(customerId) || [];
                list.push(row);
                addressesByCustomer.set(customerId, list);
            });

            const addressUpdates = [];
            const addressInserts = [];
            const primaryInsertCustomerIds = new Set();
            const primaryAssignedCustomerIds = new Set();

            for (const address of matchedAddressCandidates) {
                throwIfErpImportCancelled(importId);
                const effectiveIsPrimary = Boolean(address.isPrimary) && !primaryAssignedCustomerIds.has(address.customerId);
                if (effectiveIsPrimary) {
                    primaryAssignedCustomerIds.add(address.customerId);
                }
                const existingAddresses = addressesByCustomer.get(address.customerId) || [];
                const normalizedFields = {
                    street: normalizeImportTextUpper(address.street),
                    reference: normalizeImportTextUpper(address.reference),
                    maps_url: address.mapsUrl,
                    wkt: address.wkt,
                    district_id: normalizeImportTextUpper(address.districtId)
                };
                const addressMetadata = {
                    erpImport: {
                        erpAddressId: address.addressErpId,
                        tipoZona: address.tipoZona,
                        tipoVia: address.tipoVia
                    }
                };
                const incomingAddressHash = calcAddressHash({
                    ...address,
                    street: normalizedFields.street,
                    reference: normalizedFields.reference,
                    mapsUrl: normalizedFields.maps_url,
                    wkt: normalizedFields.wkt,
                    districtId: normalizedFields.district_id
                }, effectiveIsPrimary);
                const addressSignature = buildAddressSignature({
                    ...address,
                    ...normalizedFields,
                    isPrimary: effectiveIsPrimary
                });
                let target = null;
                if (address.addressErpId) {
                    target = existingAddresses.find((entry) => String(entry.erp_address_id || '').trim() === address.addressErpId) || null;
                }
                if (effectiveIsPrimary) {
                    target = target || existingAddresses.find((entry) => entry.is_primary === true) || null;
                }
                if (!target) {
                    target = existingAddresses.find((entry) => buildAddressSignature({
                        street: entry.street,
                        reference: entry.reference,
                        mapsUrl: entry.maps_url,
                        wkt: entry.wkt,
                        districtId: entry.district_id,
                        isPrimary: entry.is_primary
                    }) === addressSignature) || null;
                }

                if (target) {
                    const currentHash = String(target?.erp_row_hash || '').trim();
                    const currentSignature = buildAddressSignature({
                        street: target.street,
                        reference: target.reference,
                        mapsUrl: target.maps_url,
                        wkt: target.wkt,
                        districtId: target.district_id,
                        isPrimary: target.is_primary
                    });
                    if ((currentHash && currentHash === incomingAddressHash) || (!currentHash && currentSignature === addressSignature)) {
                        addressCounts.skipped += 1;
                        continue;
                    }
                    addressUpdates.push({
                        address,
                        target,
                        normalizedFields,
                        addressMetadata,
                        isPrimary: effectiveIsPrimary,
                        erpAddressId: address.addressErpId,
                        erpRowHash: incomingAddressHash
                    });
                } else {
                    if (effectiveIsPrimary) primaryInsertCustomerIds.add(address.customerId);
                    addressInserts.push({
                        addressId: createErpAddressId(),
                        customerId: address.customerId,
                        addressType: effectiveIsPrimary ? 'delivery' : 'other',
                        normalizedFields,
                        addressMetadata,
                        isPrimary: effectiveIsPrimary,
                        erpAddressId: address.addressErpId,
                        erpRowHash: incomingAddressHash
                    });
                }
            }

            if (primaryInsertCustomerIds.size > 0) {
                throwIfErpImportCancelled(importId);
                await client.query(
                    `UPDATE tenant_customer_addresses
                     SET is_primary = FALSE, updated_at = NOW()
                     WHERE tenant_id = $1
                       AND customer_id = ANY($2::text[])
                       AND is_primary = TRUE`,
                    [cleanTenantId, Array.from(primaryInsertCustomerIds)]
                );
            }

            let addressInsertChunkIndex = 0;
            for (const chunk of chunkArray(addressInserts, ERP_IMPORT_BATCH_SIZE)) {
                throwIfErpImportCancelled(importId);
                addressInsertChunkIndex += 1;
                await runChunkWithSavepoint(
                    client,
                    `sp_insert_addresses_${addressInsertChunkIndex}`,
                    chunk,
                    async (entries) => {
                        const values = [];
                        const placeholders = entries.map((entry, index) => {
                            const offset = index * 13;
                            values.push(
                                entry.addressId,
                                cleanTenantId,
                                entry.customerId,
                                entry.addressType,
                                entry.normalizedFields.street,
                                entry.normalizedFields.reference,
                                entry.normalizedFields.maps_url,
                                entry.normalizedFields.wkt,
                                entry.isPrimary,
                                entry.normalizedFields.district_id,
                                JSON.stringify(entry.addressMetadata),
                                entry.erpAddressId,
                                entry.erpRowHash
                            );
                            return `(
                                $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8},
                                NULL, NULL, $${offset + 9}, $${offset + 10}, NULL, NULL, NULL,
                                $${offset + 11}::jsonb, NOW(), NOW(), $${offset + 12}, $${offset + 13}
                            )`;
                        });
                        await client.query(
                            `INSERT INTO tenant_customer_addresses (
                                address_id, tenant_id, customer_id, address_type, street, reference, maps_url, wkt,
                                latitude, longitude, is_primary, district_id, district_name, province_name, department_name,
                                metadata, created_at, updated_at, erp_address_id, erp_row_hash
                            ) VALUES ${placeholders.join(', ')}`,
                            values
                        );
                        addressCounts.inserted += entries.length;
                        updateCommitProgress('addresses', `Procesando direcciones ${addressCounts.inserted + addressCounts.updated} de ${matchedAddressCandidates.length}.`);
                    },
                    async (entry) => {
                        try {
                            await client.query(
                                `INSERT INTO tenant_customer_addresses (
                                    address_id, tenant_id, customer_id, address_type, street, reference, maps_url, wkt,
                                    latitude, longitude, is_primary, district_id, district_name, province_name, department_name,
                                    metadata, created_at, updated_at, erp_address_id, erp_row_hash
                                ) VALUES (
                                    $1, $2, $3, $4, $5, $6, $7, $8,
                                    NULL, NULL, $9, $10, NULL, NULL, NULL,
                                    $11::jsonb, NOW(), NOW(), $12, $13
                                )`,
                                [
                                    entry.addressId,
                                    cleanTenantId,
                                    entry.customerId,
                                    entry.addressType,
                                    entry.normalizedFields.street,
                                    entry.normalizedFields.reference,
                                    entry.normalizedFields.maps_url,
                                    entry.normalizedFields.wkt,
                                    entry.isPrimary,
                                    entry.normalizedFields.district_id,
                                    JSON.stringify(entry.addressMetadata),
                                    entry.erpAddressId,
                                    entry.erpRowHash
                                ]
                            );
                            addressCounts.inserted += 1;
                        } catch (error) {
                            logCustomerImportRowError(entry, 'address_insert', error);
                            errors.push({ row: 0, erp_id: entry.customerId, field: 'address_insert', message: String(error?.message || error) });
                            addressCounts.errors += 1;
                            throw error;
                        }
                        updateCommitProgress('addresses', `Procesando direcciones ${addressCounts.inserted + addressCounts.updated} de ${matchedAddressCandidates.length}.`);
                    }
                );
            }

            let addressUpdateChunkIndex = 0;
            for (const chunk of chunkArray(addressUpdates, ERP_IMPORT_BATCH_SIZE)) {
                throwIfErpImportCancelled(importId);
                addressUpdateChunkIndex += 1;
                await runChunkWithSavepoint(
                    client,
                    `sp_update_addresses_${addressUpdateChunkIndex}`,
                    chunk,
                    async (entries) => {
                        for (const entry of entries) {
                            if (entry.isPrimary) {
                                await client.query(
                                    `UPDATE tenant_customer_addresses
                                     SET is_primary = FALSE, updated_at = NOW()
                                     WHERE tenant_id = $1 AND customer_id = $2 AND address_id <> $3 AND is_primary = TRUE`,
                                    [cleanTenantId, entry.address.customerId, entry.target.address_id]
                                );
                            }
                            await client.query(
                                `UPDATE tenant_customer_addresses
                                 SET
                                    address_type = $4,
                                    street = $5,
                                    reference = $6,
                                    maps_url = $7,
                                    wkt = $8,
                                    is_primary = $9,
                                    district_id = $10,
                                    metadata = COALESCE(metadata, '{}'::jsonb) || $11::jsonb,
                                    erp_address_id = $12,
                                    erp_row_hash = $13,
                                    updated_at = NOW()
                                 WHERE tenant_id = $1 AND customer_id = $2 AND address_id = $3`,
                                [
                                    cleanTenantId,
                                    entry.address.customerId,
                                    entry.target.address_id,
                                    entry.isPrimary ? 'delivery' : 'other',
                                    entry.normalizedFields.street,
                                    entry.normalizedFields.reference,
                                    entry.normalizedFields.maps_url,
                                    entry.normalizedFields.wkt,
                                    entry.isPrimary,
                                    entry.normalizedFields.district_id,
                                    JSON.stringify(entry.addressMetadata),
                                    entry.erpAddressId,
                                    entry.erpRowHash
                                ]
                            );
                            addressCounts.updated += 1;
                            updateCommitProgress('addresses', `Procesando direcciones ${addressCounts.inserted + addressCounts.updated} de ${matchedAddressCandidates.length}.`);
                        }
                    },
                    async (entry) => {
                        try {
                            if (entry.isPrimary) {
                                await client.query(
                                    `UPDATE tenant_customer_addresses
                                     SET is_primary = FALSE, updated_at = NOW()
                                     WHERE tenant_id = $1 AND customer_id = $2 AND address_id <> $3 AND is_primary = TRUE`,
                                    [cleanTenantId, entry.address.customerId, entry.target.address_id]
                                );
                            }
                            await client.query(
                                `UPDATE tenant_customer_addresses
                                 SET
                                    address_type = $4,
                                    street = $5,
                                    reference = $6,
                                    maps_url = $7,
                                    wkt = $8,
                                    is_primary = $9,
                                    district_id = $10,
                                    metadata = COALESCE(metadata, '{}'::jsonb) || $11::jsonb,
                                    erp_address_id = $12,
                                    erp_row_hash = $13,
                                    updated_at = NOW()
                                 WHERE tenant_id = $1 AND customer_id = $2 AND address_id = $3`,
                                [
                                    cleanTenantId,
                                    entry.address.customerId,
                                    entry.target.address_id,
                                    entry.isPrimary ? 'delivery' : 'other',
                                    entry.normalizedFields.street,
                                    entry.normalizedFields.reference,
                                    entry.normalizedFields.maps_url,
                                    entry.normalizedFields.wkt,
                                    entry.isPrimary,
                                    entry.normalizedFields.district_id,
                                    JSON.stringify(entry.addressMetadata),
                                    entry.erpAddressId,
                                    entry.erpRowHash
                                ]
                            );
                            addressCounts.updated += 1;
                        } catch (error) {
                            logCustomerImportRowError(entry, 'address_update', error);
                            errors.push({ row: entry.address.rowNumber || 0, erp_id: entry.address.erpId, field: 'address_update', message: String(error?.message || error) });
                            addressCounts.errors += 1;
                            throw error;
                        }
                        updateCommitProgress('addresses', `Procesando direcciones ${addressCounts.inserted + addressCounts.updated} de ${matchedAddressCandidates.length}.`);
                    }
                );
            }
        }

        await client.query('COMMIT');
        transactionCommitted = true;
        console.log('[ERP-IMPORT][SERVICE] commit ok importId=%s customersInserted=%s customersUpdated=%s addressesInserted=%s addressesUpdated=%s', importId, customerCounts.inserted, customerCounts.updated, addressCounts.inserted, addressCounts.updated);
        consentSyncTargets = buildConsentSyncTargets(insertCandidates, updateCandidates, linkCandidates);
        if (consentSyncTargets.length > 0 && customerConsentService && typeof customerConsentService.syncMarketingConsentState === 'function') {
            setErpImportProgress(importId, {
                status: 'running',
                phase: 'consents',
                message: 'Sincronizando consentimientos globales...'
            });
            for (const target of consentSyncTargets) {
                throwIfErpImportCancelled(importId);
                await customerConsentService.syncMarketingConsentState(cleanTenantId, {
                    customerId: target.customerId,
                    status: target.status,
                    source: target.source,
                    at: nowIso(),
                    proofPayload: {
                        syncedFrom: 'appsheet_import',
                        importId
                    }
                });
            }
        }
        setErpImportProgress(importId, {
            status: 'completed',
            phase: 'completed',
            message: 'Importacion AppSheet completada.',
            finishedAt: nowIso(),
            counts: {
                totalRows: total,
                validRows: validCandidates.length,
                insertRows: categorizedCustomers.new.length,
                updateRows: categorizedCustomers.updated.length,
                unchangedRows: categorizedCustomers.unchanged.length,
                linkableRows: categorizedCustomers.linkable.length,
                errorRows: errors.length,
                addressTotal: addressSummary.total,
                addressMatched: addressSummary.matched,
                addressUnmatched: addressSummary.unmatched,
                customersProcessed: customerCounts.inserted + customerCounts.updated + customerCounts.linked + customerCounts.skipped,
                customersInserted: customerCounts.inserted,
                customersUpdated: customerCounts.updated,
                customersLinked: customerCounts.linked,
                customersSkipped: customerCounts.skipped,
                addressesProcessed: addressCounts.inserted + addressCounts.updated + addressCounts.skipped,
                addressesInserted: addressCounts.inserted,
                addressesUpdated: addressCounts.updated,
                addressesSkipped: addressCounts.skipped,
                consentsSynced: consentSyncTargets.length
            },
            percent: 100
        });
    } catch (error) {
        if (!transactionCommitted) {
            await client.query('ROLLBACK');
            console.error('[ERP-IMPORT][SERVICE] rollback importId=%s error=%s', importId, error?.message || error);
        } else {
            console.error('[ERP-IMPORT][SERVICE] post-commit error importId=%s error=%s', importId, error?.message || error);
        }
        const wasCancelled = error?.code === 'ERP_IMPORT_CANCELLED';
        setErpImportProgress(importId, {
            status: wasCancelled ? 'cancelled' : 'failed',
            phase: wasCancelled ? 'cancelled' : 'failed',
            message: wasCancelled ? 'Importacion AppSheet cancelada. No se aplicaron cambios.' : 'La importacion AppSheet fallo.',
            finishedAt: nowIso(),
            error: wasCancelled ? '' : String(error?.message || error || 'Error desconocido.'),
            counts: {
                totalRows: total,
                validRows: validCandidates.length,
                insertRows: categorizedCustomers.new.length,
                updateRows: categorizedCustomers.updated.length,
                unchangedRows: categorizedCustomers.unchanged.length,
                linkableRows: categorizedCustomers.linkable.length,
                errorRows: errors.length,
                addressTotal: addressSummary.total,
                addressMatched: addressSummary.matched,
                addressUnmatched: addressSummary.unmatched,
                customersProcessed: customerCounts.inserted + customerCounts.updated + customerCounts.linked + customerCounts.skipped,
                customersInserted: customerCounts.inserted,
                customersUpdated: customerCounts.updated,
                customersLinked: customerCounts.linked,
                customersSkipped: customerCounts.skipped,
                addressesProcessed: addressCounts.inserted + addressCounts.updated + addressCounts.skipped,
                addressesInserted: addressCounts.inserted,
                addressesUpdated: addressCounts.updated,
                addressesSkipped: addressCounts.skipped
            }
        });
        throw error;
    } finally {
        client.release();
    }

    return {
        importId,
        customers: customerCounts,
        addresses: addressCounts,
        errors
    };
}

async function importCustomersCsv(tenantId = DEFAULT_TENANT_ID, csvText = '', options = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const rows = parseCsvRows(csvText, String(options?.delimiter || '').trim());
    if (rows.length < 2) throw new Error('El CSV no tiene filas de datos.');

    const headers = rows[0];
    const dataRows = rows.slice(1);
    const moduleId = toText(options?.moduleId || '');
    let created = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < dataRows.length; i += 1) {
        try {
            const payload = mapCsvRow(headers, dataRows[i], moduleId);
            const hasData = Boolean(payload.customerId || payload.phoneE164 || payload.email || payload.contactName || payload.firstNames);
            if (!hasData) continue;

            const result = await upsertCustomer(cleanTenantId, payload, { allowPhoneMerge: true });
            if (result.created) created += 1;
            else updated += 1;
        } catch (error) {
            errors.push({ row: i + 2, error: String(error?.message || error || 'Error desconocido') });
        }
    }

    return {
        totalRows: dataRows.length,
        created,
        updated,
        failed: errors.length,
        errors
    };
}
async function listCustomerIdentities(tenantId = DEFAULT_TENANT_ID, options = {}) {
    if (getStorageDriver() !== 'postgres') {
        return { items: [], total: 0, limit: Number(options.limit || 50) || 50, offset: Number(options.offset || 0) || 0 };
    }
    await ensurePostgresSchema();
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const customerId = normalizeCustomerIdCandidate(options?.customerId || options?.customer_id || '');
    const moduleId = toText(options?.moduleId || options?.module_id || '');
    const channelType = toText(options?.channelType || options?.channel_type || '').toLowerCase();
    const limit = Math.max(1, Math.min(PAGE_LIMIT_MAX, Number(options.limit || 50) || 50));
    const offset = Math.max(0, Number(options.offset || 0) || 0);

    const params = [cleanTenantId];
    const where = ['tenant_id = $1'];
    let idx = 2;

    if (customerId) {
        where.push(`customer_id = $${idx}`);
        params.push(customerId);
        idx += 1;
    }
    if (moduleId) {
        where.push(`module_id = $${idx}`);
        params.push(moduleId);
        idx += 1;
    }
    if (channelType) {
        where.push(`channel_type = $${idx}`);
        params.push(channelType);
        idx += 1;
    }

    const whereSql = where.join(' AND ');
    const totalRes = await queryPostgres(`SELECT COUNT(*)::int AS total FROM tenant_customer_identities WHERE ${whereSql}`, params);
    const rowsRes = await queryPostgres(
        `SELECT *
         FROM tenant_customer_identities
         WHERE ${whereSql}
         ORDER BY updated_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
    );

    return {
        items: (rowsRes?.rows || []).map(sanitizeIdentityPublic),
        total: Number(totalRes?.rows?.[0]?.total || 0) || 0,
        limit,
        offset
    };
}

async function upsertCustomerIdentity(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    if (getStorageDriver() !== 'postgres') return null;
    await ensurePostgresSchema();

    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const customerId = normalizeCustomerIdCandidate(payload?.customerId || payload?.customer_id || '');
    const channelType = toText(payload?.channelType || payload?.channel_type || 'whatsapp').toLowerCase() || 'whatsapp';
    const channelIdentity = toText(payload?.channelIdentity || payload?.channel_identity || payload?.chatId || payload?.chat_id || payload?.phoneE164 || payload?.phone || '');

    if (!customerId) throw new Error('customerId invalido para identidad de cliente.');
    if (!channelIdentity) throw new Error('channelIdentity invalido para identidad de cliente.');

    const normalizedPhone = normalizePhone(payload?.normalizedPhone || payload?.normalized_phone || payload?.phoneE164 || payload?.phone || '');
    const moduleId = toText(payload?.moduleId || payload?.module_id || '') || null;
    const metadata = normalizeObject(payload?.metadata);

    const result = await queryPostgres(
        `INSERT INTO tenant_customer_identities (
            tenant_id, customer_id, channel_type, channel_identity, normalized_phone, module_id, metadata, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW()
        )
        ON CONFLICT (tenant_id, channel_type, channel_identity)
        DO UPDATE SET
            customer_id = EXCLUDED.customer_id,
            normalized_phone = EXCLUDED.normalized_phone,
            module_id = EXCLUDED.module_id,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING *`,
        [
            cleanTenantId,
            customerId,
            channelType,
            channelIdentity,
            normalizedPhone || null,
            moduleId,
            JSON.stringify(metadata)
        ]
    );

    return result?.rows?.[0] ? sanitizeIdentityPublic(result.rows[0]) : null;
}

async function appendChannelEvent(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    if (getStorageDriver() !== 'postgres') return null;
    await ensurePostgresSchema();

    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const eventId = toText(payload?.eventId || payload?.event_id || '') || createChannelEventId();
    const channelType = toText(payload?.channelType || payload?.channel_type || 'whatsapp').toLowerCase() || 'whatsapp';
    const moduleId = toText(payload?.moduleId || payload?.module_id || '') || null;
    const customerId = normalizeCustomerIdCandidate(payload?.customerId || payload?.customer_id || '') || null;
    const chatId = toText(payload?.chatId || payload?.chat_id || '') || null;
    const messageId = toText(payload?.messageId || payload?.message_id || '') || null;
    const direction = toText(payload?.direction || 'inbound').toLowerCase() || 'inbound';
    const status = toText(payload?.status || '') || null;
    const eventPayload = normalizeObject(payload?.payload);

    const result = await queryPostgres(
        `INSERT INTO tenant_channel_events (
            tenant_id, event_id, channel_type, module_id, customer_id, chat_id, message_id, direction, status, payload, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW()
        )
        ON CONFLICT (tenant_id, event_id)
        DO UPDATE SET
            status = EXCLUDED.status,
            payload = EXCLUDED.payload
        RETURNING *`,
        [
            cleanTenantId,
            eventId,
            channelType,
            moduleId,
            customerId,
            chatId,
            messageId,
            direction,
            status,
            JSON.stringify(eventPayload)
        ]
    );

    return result?.rows?.[0] ? sanitizeChannelEventPublic(result.rows[0]) : null;
}

async function listChannelEvents(tenantId = DEFAULT_TENANT_ID, options = {}) {
    if (getStorageDriver() !== 'postgres') {
        return { items: [], total: 0, limit: Number(options.limit || 50) || 50, offset: Number(options.offset || 0) || 0 };
    }
    await ensurePostgresSchema();

    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const customerId = normalizeCustomerIdCandidate(options?.customerId || options?.customer_id || '');
    const moduleId = toText(options?.moduleId || options?.module_id || '');
    const chatId = toText(options?.chatId || options?.chat_id || '');
    const channelType = toText(options?.channelType || options?.channel_type || '').toLowerCase();
    const limit = Math.max(1, Math.min(PAGE_LIMIT_MAX, Number(options.limit || 50) || 50));
    const offset = Math.max(0, Number(options.offset || 0) || 0);

    const params = [cleanTenantId];
    const where = ['tenant_id = $1'];
    let idx = 2;

    if (customerId) {
        where.push(`customer_id = $${idx}`);
        params.push(customerId);
        idx += 1;
    }
    if (moduleId) {
        where.push(`module_id = $${idx}`);
        params.push(moduleId);
        idx += 1;
    }
    if (chatId) {
        where.push(`chat_id = $${idx}`);
        params.push(chatId);
        idx += 1;
    }
    if (channelType) {
        where.push(`channel_type = $${idx}`);
        params.push(channelType);
        idx += 1;
    }

    const whereSql = where.join(' AND ');
    const totalRes = await queryPostgres(`SELECT COUNT(*)::int AS total FROM tenant_channel_events WHERE ${whereSql}`, params);
    const rowsRes = await queryPostgres(
        `SELECT *
         FROM tenant_channel_events
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
    );

    return {
        items: (rowsRes?.rows || []).map(sanitizeChannelEventPublic),
        total: Number(totalRes?.rows?.[0]?.total || 0) || 0,
        limit,
        offset
    };
}
async function upsertFromInteraction(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const phone = normalizePhone(payload?.phone || payload?.phoneE164 || '');
    if (!phone) return null;
    const existingByPhone = await findCustomer(tenantId, { phoneE164: phone });
    const existingOrigin = normalizeObject(existingByPhone?.metadata?.origin || existingByPhone?.metadata?.acquisitionOrigin);
    const incomingOrigin = normalizeObject(payload?.metadata?.origin || payload?.origin || {});
    const shouldAttachFirstOrigin = Object.keys(existingOrigin).length === 0 && Object.keys(incomingOrigin).length > 0;
    const incomingWhatsappName = toText(payload?.contactName || payload?.name || payload?.pushname || '');
    const existingContactName = toText(existingByPhone?.contactName || '');

    const upsertResult = await upsertCustomer(tenantId, {
        customerId: toText(existingByPhone?.customerId || '') || undefined,
        moduleId: toText(payload?.moduleId || ''),
        phoneE164: phone,
        contactName: existingContactName || incomingWhatsappName || undefined,
        metadata: {
            ...(normalizeObject(payload?.metadata)),
            ...(shouldAttachFirstOrigin ? { origin: incomingOrigin } : {}),
            whatsapp: {
                ...(normalizeObject(existingByPhone?.metadata?.whatsapp)),
                chatId: toText(payload?.chatId || ''),
                direction: toText(payload?.direction || ''),
                messageType: toText(payload?.messageType || ''),
                lastMessageAt: toText(payload?.lastMessageAt || nowIso()),
                contactName: incomingWhatsappName || null
            }
        },
        lastInteractionAt: nowIso(),
        isActive: true
    }, { allowPhoneMerge: false });

    const customerId = toText(upsertResult?.item?.customerId || '');
    if (customerId && getStorageDriver() === 'postgres') {
        try {
            await upsertCustomerIdentity(tenantId, {
                customerId,
                moduleId: toText(payload?.moduleId || ''),
                channelType: toText(payload?.channelType || payload?.metadata?.channelType || 'whatsapp').toLowerCase() || 'whatsapp',
                channelIdentity: toText(payload?.channelIdentity || payload?.chatId || payload?.metadata?.senderId || payload?.phone || ''),
                normalizedPhone: phone,
                metadata: {
                    chatId: toText(payload?.chatId || ''),
                    senderId: toText(payload?.metadata?.senderId || ''),
                    senderPushname: toText(payload?.metadata?.senderPushname || ''),
                    fromMe: Boolean(payload?.metadata?.fromMe)
                }
            });

            await appendChannelEvent(tenantId, {
                channelType: toText(payload?.channelType || payload?.metadata?.channelType || 'whatsapp').toLowerCase() || 'whatsapp',
                moduleId: toText(payload?.moduleId || ''),
                customerId,
                chatId: toText(payload?.chatId || ''),
                messageId: toText(payload?.metadata?.messageId || payload?.messageId || ''),
                direction: toText(payload?.direction || 'inbound') || 'inbound',
                status: toText(payload?.status || '') || null,
                payload: {
                    messageType: toText(payload?.messageType || ''),
                    metadata: normalizeObject(payload?.metadata),
                    ...(shouldAttachFirstOrigin ? { origin: incomingOrigin, hasOrigin: true } : {})
                }
            });
        } catch (_) {
            // No bloquea operacion principal si falla instrumentacion multicanal.
        }
    }

    return upsertResult;
}

module.exports = {
    ensurePostgresSchema,
    setErpImportProgress,
    listCustomers,
    searchCustomersForChat,
    getCustomer,
    getCustomerByPhone,
    getCustomerByPhoneWithAddresses,
    upsertCustomer,
    updateCustomer,
    importCustomersFromAppSheet,
    getErpImportProgress,
    cancelErpImportProgress,
    importCustomersCsv,
    upsertFromInteraction,
    listCustomerIdentities,
    listChannelEvents,
    upsertCustomerIdentity,
    appendChannelEvent,
    sanitizePublic
};



