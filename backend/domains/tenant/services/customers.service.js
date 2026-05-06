const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    getPostgresPool,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
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
const CUSTOMERS_FILE = 'customers.json';
const PAGE_LIMIT_DEFAULT = 50;
const PAGE_LIMIT_MAX = 500;

let schemaPromise = null;

async function ensurePostgresSchema() {
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
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS referral_customer_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS marketing_opt_in_status TEXT NOT NULL DEFAULT 'unknown'`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS marketing_opt_in_updated_at TIMESTAMPTZ NULL`);
        await queryPostgres(`ALTER TABLE tenant_customers ADD COLUMN IF NOT EXISTS marketing_opt_in_source TEXT NULL`);
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
    })();

    try {
        await schemaPromise;
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
            OR LOWER(COALESCE(contact_name, '')) LIKE $${idx}
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
         ORDER BY updated_at DESC
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

    filtered = [...filtered].sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')));

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
    if (getStorageDriver() === 'postgres') {
        return upsertCustomerPostgres(cleanTenantId, payload, options);
    }
    return upsertCustomerFile(cleanTenantId, payload, options);
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
    const rawCustomerId = toText(customerId || '');
    const cleanCustomerId = normalizeCustomerIdCandidate(rawCustomerId);
    const lookupCustomerId = cleanCustomerId || rawCustomerId;
    if (!lookupCustomerId) throw new Error('customerId invalido.');

    const existing = await findCustomer(tenantId, { customerId: lookupCustomerId });
    if (!existing) throw new Error('Cliente no encontrado.');

    const resolvedCustomerId = toText(existing?.customerId || lookupCustomerId);
    const resolvedCleanCustomerId = normalizeCustomerIdCandidate(resolvedCustomerId);
    if (!resolvedCustomerId) throw new Error('customerId invalido.');

    const sourcePatch = patch && typeof patch === 'object' ? patch : {};
    if (resolvedCleanCustomerId) {
        return upsertCustomer(tenantId, {
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

    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
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
    }
    return '';
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

function buildErpCustomerPreview(candidate = {}) {
    return {
        erp_id: candidate.erpId,
        nombre_completo: candidate.fullName,
        telefono: candidate.phoneE164,
        tipo_cliente: candidate.customerTypeId,
        fuente: candidate.acquisitionSourceId
    };
}

function buildErpCustomerCandidate(row = {}, moduleId = '') {
    const erpId = normalizeImportTextUpper(getErpRowValue(row, 'IdCliente'));
    const treatmentId = normalizeErpTreatmentId(getErpRowValue(row, 'IdTratamientoCliente'));
    const lastNamePaternal = normalizeImportTextUpper(getErpRowValue(row, 'ApellidoPaterno'));
    const lastNameMaternal = normalizeImportTextUpper(getErpRowValue(row, 'ApellidoMaterno'));
    const firstName = normalizeImportTextUpper(getErpRowValue(row, 'Nombres'));
    const documentNumber = normalizeImportTextUpper(getErpRowValue(row, 'NumeroDocumentoIdentidad'));
    const contactName = normalizeImportTextUpper(getErpRowValue(row, 'Contacto'));
    const email = normalizeImportEmail(getErpRowValue(row, 'CorreoElectronico'));
    const phoneE164 = normalizeErpPhone(getErpRowValue(row, 'Telefono'));
    const phoneAlt = normalizeErpPhone(getErpRowValue(row, 'Telefono2'));
    const documentTypeId = normalizeImportTextUpper(getErpRowValue(row, 'IdDocumentoIdentidad'));
    const erpEmployeeId = normalizeImportTextUpper(getErpRowValue(row, 'IdEmpleado'));
    const customerTypeId = normalizeImportTextUpper(getErpRowValue(row, 'IdTipoCliente'));
    const acquisitionSourceId = normalizeImportTextUpper(getErpRowValue(row, 'IdFuenteCliente'));
    const referralCustomerId = normalizeImportTextUpper(getErpRowValue(row, 'IdReferido'));
    const createdAtSource = getErpRowValue(row, 'Fecha Registro', 'FechaRegistro');
    const createdAt = parseErpDate(createdAtSource);
    const marketingOptInStatus = normalizeErpOptInStatus(getErpRowValue(row, 'Autorizacion'));
    const fullName = [lastNamePaternal, lastNameMaternal, firstName].filter(Boolean).join(' ').trim() || [lastNamePaternal, firstName].filter(Boolean).join(' ').trim();
    const rowNumber = Number(row?.__rowNumber || 0) || 0;

    const errors = [];
    if (!erpId) {
        errors.push({ row: rowNumber, erp_id: null, field: 'IdCliente', message: 'ERP ID vacio.' });
    }
    if (!firstName && !lastNamePaternal) {
        errors.push({ row: rowNumber, erp_id: erpId, field: 'Nombres/ApellidoPaterno', message: 'Debe existir nombres o apellido paterno.' });
    }
    if (email && !isValidEmailAddress(email)) {
        errors.push({ row: rowNumber, erp_id: erpId, field: 'CorreoElectronico', message: 'Email invalido.' });
    }
    if (createdAtSource && !createdAt) {
        errors.push({ row: rowNumber, erp_id: erpId, field: 'Fecha Registro', message: 'Fecha no parseable.' });
    }

    const dbFields = normalizeCustomerFields({
        erp_id: erpId,
        contact_name: contactName,
        phone_e164: phoneE164,
        phone_alt: phoneAlt,
        first_name: firstName,
        last_name_paternal: lastNamePaternal,
        last_name_maternal: lastNameMaternal,
        document_number: documentNumber,
        erp_employee_id: erpEmployeeId,
        referral_customer_id: referralCustomerId
    });

    return {
        rowNumber,
        erpId,
        treatmentId,
        firstName: dbFields.first_name || null,
        lastNamePaternal: dbFields.last_name_paternal || null,
        lastNameMaternal: dbFields.last_name_maternal || null,
        documentNumber: dbFields.document_number || null,
        contactName: dbFields.contact_name || null,
        phoneE164: dbFields.phone_e164 || null,
        phoneAlt: dbFields.phone_alt || null,
        email,
        documentTypeId,
        erpEmployeeId: dbFields.erp_employee_id || null,
        customerTypeId,
        acquisitionSourceId,
        referralCustomerId: dbFields.referral_customer_id || null,
        createdAt,
        marketingOptInStatus,
        moduleId: toText(moduleId || '') || null,
        fullName,
        errors
    };
}

function buildErpAddressCandidate(row = {}, customerMatch = null) {
    const rowNumber = Number(row?.__rowNumber || 0) || 0;
    const erpId = normalizeImportTextUpper(getErpRowValue(row, 'IdCliente'));
    const street = normalizeImportTextUpper(getErpRowValue(row, 'Direccion'));
    const reference = normalizeImportTextUpper(getErpRowValue(row, 'Referencia'));
    const mapsUrl = String(getErpRowValue(row, 'UbicacionMaps') || '').trim() || null;
    const wkt = String(getErpRowValue(row, 'WKT') || '').trim() || null;
    const districtId = normalizeImportTextUpper(getErpRowValue(row, 'IdDistrito'));
    const isPrimary = normalizeErpBoolean(getErpRowValue(row, 'EsPrincipal'));
    const customerId = String(customerMatch?.customerId || '').trim() || null;

    return {
        rowNumber,
        erpId,
        customerId,
        street,
        reference,
        mapsUrl,
        wkt,
        districtId,
        isPrimary
    };
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

async function importCustomersFromErp(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    if (getStorageDriver() !== 'postgres') {
        throw new Error('La importacion ERP requiere SAAS_STORAGE_DRIVER=postgres.');
    }

    await ensurePostgresSchema();

    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const clientesRows = Array.isArray(payload?.clientesRows) ? payload.clientesRows : [];
    const direccionesRows = Array.isArray(payload?.direccionesRows) ? payload.direccionesRows : [];
    const moduleId = toText(payload?.moduleId || '');
    const mode = String(payload?.mode || 'preview').trim().toLowerCase() || 'preview';

    if (!clientesRows.length) {
        throw new Error('El archivo de clientes no tiene filas validas.');
    }
    if (mode !== 'preview' && mode !== 'commit') {
        throw new Error('mode invalido. Usa preview o commit.');
    }

    const candidates = clientesRows.map((row) => buildErpCustomerCandidate(row, moduleId));
    const errors = candidates.flatMap((candidate) => candidate.errors || []);
    const validCandidates = candidates.filter((candidate) => (candidate.errors || []).length === 0 && candidate.erpId);
    const total = clientesRows.length;

    const existingResult = validCandidates.length > 0
        ? await queryPostgres(
            `SELECT *
             FROM tenant_customers
             WHERE tenant_id = $1
               AND erp_id = ANY($2::text[])`,
            [cleanTenantId, validCandidates.map((candidate) => candidate.erpId)]
        )
        : { rows: [] };
    const existingByErpId = new Map((existingResult?.rows || []).map((row) => [String(row?.erp_id || '').trim().toUpperCase(), row]));

    const inserts = validCandidates.filter((candidate) => !existingByErpId.has(candidate.erpId));
    const updates = validCandidates.filter((candidate) => existingByErpId.has(candidate.erpId));

    const importedCustomerMap = new Map();
    validCandidates.forEach((candidate) => {
        const existing = existingByErpId.get(candidate.erpId) || null;
        importedCustomerMap.set(candidate.erpId, {
            ...candidate,
            customerId: String(existing?.customer_id || '').trim() || null
        });
    });

    const addressCandidatesAll = direccionesRows.map((row) => buildErpAddressCandidate(row, importedCustomerMap.get(normalizeImportTextUpper(getErpRowValue(row, 'IdCliente'))) || null));
    const matchedAddressCandidates = addressCandidatesAll.filter((address) => address.customerId);
    const addressSummary = {
        total: direccionesRows.length,
        matched: matchedAddressCandidates.length,
        unmatched: Math.max(0, direccionesRows.length - matchedAddressCandidates.length)
    };

    if (mode === 'preview') {
        return {
            summary: {
                total,
                valid: validCandidates.length,
                updates: updates.length,
                inserts: inserts.length,
                errors: errors.length
            },
            errors,
            preview: validCandidates.slice(0, 5).map(buildErpCustomerPreview),
            addressSummary
        };
    }

    const existingIdsRows = await queryPostgres('SELECT customer_id FROM tenant_customers WHERE tenant_id = $1', [cleanTenantId]);
    const existingIds = new Set((existingIdsRows?.rows || []).map((row) => String(row?.customer_id || '').trim().toUpperCase()).filter(Boolean));
    const customerCounts = { inserted: 0, updated: 0, errors: errors.length };
    const addressCounts = { inserted: 0, updated: 0, errors: 0, unmatched: addressSummary.unmatched };
    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const candidate of validCandidates) {
            const existing = existingByErpId.get(candidate.erpId) || null;
            const profile = {
                treatmentId: candidate.treatmentId,
                firstNames: candidate.firstName,
                lastNamePaternal: candidate.lastNamePaternal,
                lastNameMaternal: candidate.lastNameMaternal,
                documentNumber: candidate.documentNumber,
                documentTypeId: candidate.documentTypeId,
                customerTypeId: candidate.customerTypeId,
                sourceId: candidate.acquisitionSourceId,
                employeeId: candidate.erpEmployeeId,
                referredById: candidate.referralCustomerId,
                erpId: candidate.erpId
            };
            const metadata = {
                erpImport: {
                    erpId: candidate.erpId,
                    importedAt: nowIso(),
                    source: 'erp_csv'
                }
            };

            if (existing) {
                await client.query(
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
                        profile = $16::jsonb,
                        metadata = COALESCE(metadata, '{}'::jsonb) || $17::jsonb,
                        erp_id = $18,
                        erp_employee_id = $19,
                        referral_customer_id = $20,
                        is_active = TRUE,
                        updated_at = NOW()
                     WHERE tenant_id = $1 AND customer_id = $2`,
                    [
                        cleanTenantId,
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
                        JSON.stringify(profile),
                        JSON.stringify(metadata),
                        candidate.erpId,
                        candidate.erpEmployeeId,
                        candidate.referralCustomerId
                    ]
                );
                importedCustomerMap.set(candidate.erpId, { ...candidate, customerId: existing.customer_id });
                customerCounts.updated += 1;
            } else {
                const customerId = createCustomerId(existingIds);
                existingIds.add(customerId);
                await client.query(
                    `INSERT INTO tenant_customers (
                        tenant_id, customer_id, module_id, contact_name, phone_e164, phone_alt, email,
                        treatment_id, first_name, last_name_paternal, last_name_maternal, document_type_id,
                        document_number, customer_type_id, acquisition_source_id, notes, tags, profile, metadata,
                        is_active, last_interaction_at, created_at, updated_at, erp_id, erp_employee_id,
                        referral_customer_id, marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7,
                        $8, $9, $10, $11, $12,
                        $13, $14, $15, NULL, '[]'::jsonb, $16::jsonb, $17::jsonb,
                        TRUE, NULL, $18, NOW(), $19, $20,
                        $21, $22, NOW(), 'erp_import'
                    )`,
                    [
                        cleanTenantId,
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
                        JSON.stringify(profile),
                        JSON.stringify(metadata),
                        candidate.createdAt || nowIso(),
                        candidate.erpId,
                        candidate.erpEmployeeId,
                        candidate.referralCustomerId,
                        candidate.marketingOptInStatus === 'opted_in' ? 'opted_in' : 'unknown'
                    ]
                );
                if (candidate.moduleId) {
                    await client.query(
                        `INSERT INTO tenant_customer_module_contexts (
                            tenant_id, customer_id, module_id, marketing_opt_in_status, marketing_opt_in_updated_at,
                            marketing_opt_in_source, commercial_status, labels, metadata, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, NOW(), 'erp_import', 'nuevo', '[]'::jsonb, '{}'::jsonb, NOW(), NOW()
                        )
                        ON CONFLICT (tenant_id, customer_id, module_id)
                        DO UPDATE SET
                            updated_at = NOW()`,
                        [
                            cleanTenantId,
                            customerId,
                            candidate.moduleId,
                            candidate.marketingOptInStatus
                        ]
                    );
                }
                importedCustomerMap.set(candidate.erpId, { ...candidate, customerId });
                customerCounts.inserted += 1;
            }
        }

        if (matchedAddressCandidates.length > 0) {
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

            for (const address of matchedAddressCandidates) {
                const existingAddresses = addressesByCustomer.get(address.customerId) || [];
                const normalizedFields = {
                    street: normalizeImportTextUpper(address.street),
                    reference: normalizeImportTextUpper(address.reference),
                    maps_url: address.mapsUrl,
                    wkt: address.wkt,
                    district_id: normalizeImportTextUpper(address.districtId)
                };
                const addressSignature = buildAddressSignature({
                    ...address,
                    ...normalizedFields
                });
                let target = null;
                if (address.isPrimary) {
                    target = existingAddresses.find((entry) => entry.is_primary === true) || null;
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
                    if (address.isPrimary) {
                        await client.query(
                            `UPDATE tenant_customer_addresses
                             SET is_primary = FALSE, updated_at = NOW()
                             WHERE tenant_id = $1 AND customer_id = $2 AND address_id <> $3 AND is_primary = TRUE`,
                            [cleanTenantId, address.customerId, target.address_id]
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
                            updated_at = NOW()
                         WHERE tenant_id = $1 AND customer_id = $2 AND address_id = $3`,
                        [
                            cleanTenantId,
                            address.customerId,
                            target.address_id,
                            address.isPrimary ? 'delivery' : 'other',
                            normalizedFields.street,
                            normalizedFields.reference,
                            normalizedFields.maps_url,
                            normalizedFields.wkt,
                            address.isPrimary,
                            normalizedFields.district_id
                        ]
                    );
                    addressCounts.updated += 1;
                } else {
                    if (address.isPrimary) {
                        await client.query(
                            `UPDATE tenant_customer_addresses
                             SET is_primary = FALSE, updated_at = NOW()
                             WHERE tenant_id = $1 AND customer_id = $2 AND is_primary = TRUE`,
                            [cleanTenantId, address.customerId]
                        );
                    }
                    await client.query(
                        `INSERT INTO tenant_customer_addresses (
                            address_id, tenant_id, customer_id, address_type, street, reference, maps_url, wkt,
                            latitude, longitude, is_primary, district_id, district_name, province_name, department_name,
                            metadata, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8,
                            NULL, NULL, $9, $10, NULL, NULL, NULL,
                            '{}'::jsonb, NOW(), NOW()
                        )`,
                        [
                            createErpAddressId(),
                            cleanTenantId,
                            address.customerId,
                            address.isPrimary ? 'delivery' : 'other',
                            normalizedFields.street,
                            normalizedFields.reference,
                            normalizedFields.maps_url,
                            normalizedFields.wkt,
                            address.isPrimary,
                            normalizedFields.district_id
                        ]
                    );
                    addressCounts.inserted += 1;
                }
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    return {
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

    const upsertResult = await upsertCustomer(tenantId, {
        customerId: toText(existingByPhone?.customerId || '') || undefined,
        moduleId: toText(payload?.moduleId || ''),
        phoneE164: phone,
        contactName: toText(payload?.contactName || payload?.name || payload?.pushname || ''),
        metadata: {
            ...(normalizeObject(payload?.metadata)),
            ...(shouldAttachFirstOrigin ? { origin: incomingOrigin } : {}),
            whatsapp: {
                chatId: toText(payload?.chatId || ''),
                direction: toText(payload?.direction || ''),
                messageType: toText(payload?.messageType || ''),
                lastMessageAt: toText(payload?.lastMessageAt || nowIso())
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
    listCustomers,
    getCustomer,
    getCustomerByPhone,
    getCustomerByPhoneWithAddresses,
    upsertCustomer,
    updateCustomer,
    importCustomersFromErp,
    importCustomersCsv,
    upsertFromInteraction,
    listCustomerIdentities,
    listChannelEvents,
    upsertCustomerIdentity,
    appendChannelEvent,
    sanitizePublic
};



