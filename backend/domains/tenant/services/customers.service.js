const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
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
    const updatedLegacy = {
        customerId: resolvedCustomerId,
        moduleId: toText(sourcePatch.moduleId !== undefined ? sourcePatch.moduleId : existing?.moduleId) || null,
        contactName: toText(sourcePatch.contactName !== undefined ? sourcePatch.contactName : existing?.contactName) || null,
        phoneE164: normalizePhone(sourcePatch.phoneE164 !== undefined ? sourcePatch.phoneE164 : existing?.phoneE164),
        phoneAlt: normalizePhone(sourcePatch.phoneAlt !== undefined ? sourcePatch.phoneAlt : existing?.phoneAlt),
        email: toLower(sourcePatch.email !== undefined ? sourcePatch.email : existing?.email) || null,
        tags: normalizeTags(sourcePatch.tags !== undefined ? sourcePatch.tags : existing?.tags || []),
        profile: {
            ...normalizeObject(existing?.profile),
            ...profilePatch
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
                tags = $8::jsonb,
                profile = $9::jsonb,
                metadata = $10::jsonb,
                is_active = $11,
                last_interaction_at = $12,
                updated_at = $13
             WHERE tenant_id = $1 AND customer_id = $2
             RETURNING *`,
            [
                cleanTenantId,
                resolvedCustomerId,
                updatedLegacy.moduleId,
                updatedLegacy.contactName,
                updatedLegacy.phoneE164,
                updatedLegacy.phoneAlt,
                updatedLegacy.email,
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



