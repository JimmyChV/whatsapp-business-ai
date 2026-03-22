const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const CUSTOMERS_FILE = 'customers.json';
const CUSTOMER_PREFIX = 'CUS';
const PAGE_LIMIT_DEFAULT = 50;
const PAGE_LIMIT_MAX = 500;

let schemaPromise = null;

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function toBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    const lower = toLower(value);
    if (!lower) return Boolean(fallback);
    if (['true', 'yes', 'on', 'si', 's'].includes(lower)) return true;
    if (['false', 'no', 'off', 'n'].includes(lower)) return false;
    return Boolean(fallback);
}

function nowIso() {
    return new Date().toISOString();
}

function normalizePhone(value = '') {
    const digits = String(value || '').replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return '+' + digits;
}

function normalizeObject(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function normalizeTags(value = []) {
    if (Array.isArray(value)) {
        const seen = new Set();
        return value.map((entry) => toText(entry)).filter(Boolean).filter((entry) => {
            const key = entry.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    const text = toText(value);
    if (!text) return [];
    return normalizeTags(text.split(/[|,;]/g));
}

function sanitizeCode(value = '') {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeCustomerIdCandidate(value = '') {
    const clean = String(value || '').trim().toUpperCase();
    if (!/^CUS-[A-Z0-9]{6}$/.test(clean)) return '';
    return clean;
}

function randomCode(size = 6) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(size * 2);
    let out = '';
    for (let i = 0; i < bytes.length && out.length < size; i += 1) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out.slice(0, size);
}

function createCustomerId(existingIds = new Set()) {
    const used = new Set(Array.from(existingIds || []).map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean));
    for (let i = 0; i < 1000; i += 1) {
        const candidate = CUSTOMER_PREFIX + '-' + randomCode(6);
        if (!used.has(candidate)) return candidate;
    }
    return CUSTOMER_PREFIX + '-' + Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6).padStart(6, '0');
}

function normalizeCustomer(payload = {}, { fallbackId = '', previous = null } = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const prev = previous && typeof previous === 'object' ? previous : null;
    const customerId = normalizeCustomerIdCandidate(source.customerId || source.id || fallbackId || prev?.customerId || '');
    if (!customerId) throw new Error('customerId invalido.');

    const profile = {
        ...(normalizeObject(prev?.profile)),
        ...(normalizeObject(source.profile)),
        treatmentId: toText(source.treatmentId || source.idTratamientoCliente || source.IdTratamientoCliente || prev?.profile?.treatmentId || '') || null,
        lastNamePaternal: toText(source.lastNamePaternal || source.apellidoPaterno || source.ApellidoPaterno || prev?.profile?.lastNamePaternal || '') || null,
        lastNameMaternal: toText(source.lastNameMaternal || source.apellidoMaterno || source.ApellidoMaterno || prev?.profile?.lastNameMaternal || '') || null,
        firstNames: toText(source.firstNames || source.nombres || source.Nombres || prev?.profile?.firstNames || '') || null,
        documentNumber: toText(source.documentNumber || source.numeroDocumentoIdentidad || source.NumeroDocumentoIdentidad || prev?.profile?.documentNumber || '') || null,
        groupName: toText(source.groupName || source.grupo || source.Grupo || prev?.profile?.groupName || '') || null,
        documentTypeId: toText(source.documentTypeId || source.idDocumentoIdentidad || source.IdDocumentoIdentidad || prev?.profile?.documentTypeId || '') || null,
        employeeId: toText(source.employeeId || source.idEmpleado || source.IdEmpleado || prev?.profile?.employeeId || '') || null,
        username: toText(source.username || source.usuario || source.Usuario || prev?.profile?.username || '') || null,
        customerTypeId: toText(source.customerTypeId || source.idTipoCliente || source.IdTipoCliente || prev?.profile?.customerTypeId || '') || null,
        sourceId: toText(source.sourceId || source.idFuenteCliente || source.IdFuenteCliente || prev?.profile?.sourceId || '') || null,
        brandId: toText(source.brandId || source.idMarca || source.IdMarca || prev?.profile?.brandId || '') || null,
        districtId: toText(source.districtId || source.idDistritoFiscal || source.IdDistritoFiscal || prev?.profile?.districtId || '') || null,
        fiscalAddress: toText(source.fiscalAddress || source.direccionFiscal || source.DireccionFiscal || prev?.profile?.fiscalAddress || '') || null,
        referredById: toText(source.referredById || source.idReferido || source.IdReferido || prev?.profile?.referredById || '') || null,
        contactType: toText(source.contactType || source.tipoContacto || source.TipoContacto || prev?.profile?.contactType || '') || null,
        notes: toText(source.notes || source.observacionCliente || source.ObservacionCliente || prev?.profile?.notes || '') || null,
        marketingAuthorization: toBool(source.marketingAuthorization ?? source.autorizacion ?? source.Autorizacion ?? prev?.profile?.marketingAuthorization, prev?.profile?.marketingAuthorization ?? false)
    };

    return {
        customerId,
        moduleId: toText(source.moduleId || source.module_id || prev?.moduleId || '') || null,
        contactName: toText(source.contactName || source.contacto || source.Contacto || source.name || prev?.contactName || '') || null,
        phoneE164: normalizePhone(source.phoneE164 || source.phone || source.telefono || source.Telefono || prev?.phoneE164 || ''),
        phoneAlt: normalizePhone(source.phoneAlt || source.telefono2 || source.Telefono2 || prev?.phoneAlt || ''),
        email: toLower(source.email || source.correoElectronico || source.CorreoElectronico || prev?.email || '') || null,
        tags: normalizeTags(source.tags !== undefined ? source.tags : prev?.tags || []),
        profile,
        metadata: { ...(normalizeObject(prev?.metadata)), ...(normalizeObject(source.metadata)) },
        isActive: toBool(source.isActive ?? source.active ?? prev?.isActive, prev?.isActive ?? true),
        lastInteractionAt: toText(source.lastInteractionAt || prev?.lastInteractionAt || '') || null,
        createdAt: toText(prev?.createdAt || nowIso()),
        updatedAt: nowIso()
    };
}

function sanitizePublic(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        customerId: toText(source.customerId || source.customer_id),
        moduleId: toText(source.moduleId || source.module_id) || null,
        contactName: toText(source.contactName || source.contact_name) || null,
        phoneE164: toText(source.phoneE164 || source.phone_e164) || null,
        phoneAlt: toText(source.phoneAlt || source.phone_alt) || null,
        email: toLower(source.email || '') || null,
        tags: normalizeTags(source.tags || []),
        profile: normalizeObject(source.profile),
        metadata: normalizeObject(source.metadata),
        isActive: toBool(source.isActive ?? source.is_active, true),
        lastInteractionAt: toText(source.lastInteractionAt || source.last_interaction_at || '') || null,
        createdAt: toText(source.createdAt || source.created_at || '') || null,
        updatedAt: toText(source.updatedAt || source.updated_at || '') || null
    };
}

function sanitizeIdentityPublic(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        tenantId: toText(source.tenantId || source.tenant_id) || null,
        customerId: toText(source.customerId || source.customer_id) || null,
        channelType: toText(source.channelType || source.channel_type) || null,
        channelIdentity: toText(source.channelIdentity || source.channel_identity) || null,
        normalizedPhone: toText(source.normalizedPhone || source.normalized_phone) || null,
        moduleId: toText(source.moduleId || source.module_id) || null,
        metadata: normalizeObject(source.metadata),
        createdAt: toText(source.createdAt || source.created_at) || null,
        updatedAt: toText(source.updatedAt || source.updated_at) || null
    };
}

function sanitizeChannelEventPublic(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        tenantId: toText(source.tenantId || source.tenant_id) || null,
        eventId: toText(source.eventId || source.event_id) || null,
        channelType: toText(source.channelType || source.channel_type) || null,
        moduleId: toText(source.moduleId || source.module_id) || null,
        customerId: toText(source.customerId || source.customer_id) || null,
        chatId: toText(source.chatId || source.chat_id) || null,
        messageId: toText(source.messageId || source.message_id) || null,
        direction: toText(source.direction || 'inbound') || 'inbound',
        status: toText(source.status || '') || null,
        payload: normalizeObject(source.payload),
        createdAt: toText(source.createdAt || source.created_at) || null
    };
}
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
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_customers_module
            ON tenant_customers(tenant_id, module_id)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_customers_updated
            ON tenant_customers(tenant_id, updated_at DESC)
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

    const result = await queryPostgres(
        `INSERT INTO tenant_customers (
            tenant_id, customer_id, module_id, contact_name, phone_e164, phone_alt, email,
            tags, profile, metadata, is_active, last_interaction_at, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14
        )
        ON CONFLICT (tenant_id, customer_id)
        DO UPDATE SET
            module_id = EXCLUDED.module_id,
            contact_name = EXCLUDED.contact_name,
            phone_e164 = EXCLUDED.phone_e164,
            phone_alt = EXCLUDED.phone_alt,
            email = EXCLUDED.email,
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
            normalized.contactName,
            normalized.phoneE164,
            normalized.phoneAlt,
            normalized.email,
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
    const cleanCustomerId = normalizeCustomerIdCandidate(customerId);
    if (!cleanCustomerId) return null;
    return findCustomer(tenantId, { customerId: cleanCustomerId });
}

async function updateCustomer(tenantId = DEFAULT_TENANT_ID, customerId = '', patch = {}) {
    const cleanCustomerId = normalizeCustomerIdCandidate(customerId);
    if (!cleanCustomerId) throw new Error('customerId invalido.');

    const existing = await findCustomer(tenantId, { customerId: cleanCustomerId });
    if (!existing) throw new Error('Cliente no encontrado.');

    return upsertCustomer(tenantId, {
        ...existing,
        ...(patch && typeof patch === 'object' ? patch : {}),
        customerId: cleanCustomerId
    }, { allowPhoneMerge: false });
}

function normalizeHeader(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function parseCsvRows(raw = '', delimiterHint = '') {
    const text = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!text.trim()) return [];

    const firstLine = text.split('\n')[0] || '';
    const delimiter = delimiterHint || (firstLine.includes(';') ? ';' : ',');
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === delimiter && !inQuotes) {
            row.push(cell);
            cell = '';
            continue;
        }
        if (ch === '\n' && !inQuotes) {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }
        cell += ch;
    }
    row.push(cell);
    rows.push(row);

    return rows.map((entries) => entries.map((entry) => String(entry || '').trim())).filter((entries) => entries.some((entry) => entry !== ''));
}

function mapCsvRow(headers = [], row = [], moduleId = '') {
    const map = {
        idcliente: 'customerId',
        contacto: 'contactName',
        telefono: 'phoneE164',
        telefono2: 'phoneAlt',
        correoelectronico: 'email',
        tags: 'tags',
        nombres: 'firstNames',
        apellidopaterno: 'lastNamePaternal',
        apellidomaterno: 'lastNameMaternal',
        numerodocumentoidentidad: 'documentNumber',
        idtipocliente: 'customerTypeId',
        observacioncliente: 'notes',
        autorizacion: 'marketingAuthorization'
    };

    const payload = {};
    headers.forEach((header, index) => {
        const key = map[normalizeHeader(header)];
        if (!key) return;
        payload[key] = row[index];
    });

    if (!payload.moduleId && moduleId) payload.moduleId = moduleId;
    return payload;
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


function createChannelEventId() {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

    const upsertResult = await upsertCustomer(tenantId, {
        moduleId: toText(payload?.moduleId || ''),
        phoneE164: phone,
        contactName: toText(payload?.contactName || payload?.name || payload?.pushname || ''),
        metadata: {
            ...(normalizeObject(payload?.metadata)),
            whatsapp: {
                chatId: toText(payload?.chatId || ''),
                direction: toText(payload?.direction || ''),
                messageType: toText(payload?.messageType || ''),
                lastMessageAt: toText(payload?.lastMessageAt || nowIso())
            }
        },
        lastInteractionAt: nowIso(),
        isActive: true
    }, { allowPhoneMerge: true });

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
                    metadata: normalizeObject(payload?.metadata)
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
    upsertCustomer,
    updateCustomer,
    importCustomersCsv,
    upsertFromInteraction,
    listCustomerIdentities,
    listChannelEvents,
    upsertCustomerIdentity,
    appendChannelEvent,
    sanitizePublic
};


