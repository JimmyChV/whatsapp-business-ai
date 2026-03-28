const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const QUOTES_FILE = 'quotes.json';
const DEFAULT_CURRENCY = 'PEN';

let schemaPromise = null;

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function toText(value = '') {
    return String(value || '').trim();
}

function toNullableText(value = '') {
    const text = toText(value);
    return text || null;
}

function nowIso() {
    return new Date().toISOString();
}

function buildQuoteId() {
    return `quote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTenantId(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

async function ensurePostgresSchema() {
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_quotes (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                quote_id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                scope_module_id TEXT NOT NULL DEFAULT '',
                message_id TEXT NULL,
                status TEXT NOT NULL DEFAULT 'sent',
                currency TEXT NOT NULL DEFAULT 'PEN',
                items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                notes TEXT NULL,
                created_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
                updated_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
                sent_at TIMESTAMPTZ NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, quote_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_quotes_chat_created
            ON tenant_quotes(tenant_id, chat_id, created_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_quotes_scope_created
            ON tenant_quotes(tenant_id, scope_module_id, created_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_quotes_status_updated
            ON tenant_quotes(tenant_id, status, updated_at DESC)
        `);
        await queryPostgres(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_quotes_message
            ON tenant_quotes(tenant_id, message_id)
            WHERE message_id IS NOT NULL
        `);
    })();
    return schemaPromise;
}

function normalizeQuoteRecord(input = {}) {
    const source = isPlainObject(input) ? input : {};
    const createdAt = toText(source.createdAt) || nowIso();
    const updatedAt = toText(source.updatedAt) || createdAt;

    return {
        quoteId: toText(source.quoteId) || buildQuoteId(),
        chatId: toText(source.chatId),
        scopeModuleId: toText(source.scopeModuleId || '').toLowerCase(),
        messageId: toNullableText(source.messageId),
        status: toText(source.status || 'sent') || 'sent',
        currency: toText(source.currency || DEFAULT_CURRENCY) || DEFAULT_CURRENCY,
        itemsJson: Array.isArray(source.itemsJson) ? source.itemsJson : [],
        summaryJson: isPlainObject(source.summaryJson) ? source.summaryJson : {},
        notes: toNullableText(source.notes),
        createdByUserId: toNullableText(source.createdByUserId),
        updatedByUserId: toNullableText(source.updatedByUserId),
        sentAt: toNullableText(source.sentAt),
        metadata: isPlainObject(source.metadata) ? source.metadata : {},
        createdAt,
        updatedAt
    };
}

function sanitizeQuotePublic(record = null) {
    if (!record || !isPlainObject(record)) return null;
    return {
        quoteId: toText(record.quoteId),
        chatId: toText(record.chatId),
        scopeModuleId: toText(record.scopeModuleId || '').toLowerCase(),
        messageId: toNullableText(record.messageId),
        status: toText(record.status || 'sent') || 'sent',
        currency: toText(record.currency || DEFAULT_CURRENCY) || DEFAULT_CURRENCY,
        itemsJson: Array.isArray(record.itemsJson) ? record.itemsJson : [],
        summaryJson: isPlainObject(record.summaryJson) ? record.summaryJson : {},
        notes: toNullableText(record.notes),
        createdByUserId: toNullableText(record.createdByUserId),
        updatedByUserId: toNullableText(record.updatedByUserId),
        sentAt: toNullableText(record.sentAt),
        metadata: isPlainObject(record.metadata) ? record.metadata : {},
        createdAt: toText(record.createdAt) || null,
        updatedAt: toText(record.updatedAt) || null
    };
}

async function createQuoteRecordPostgres(tenantId = DEFAULT_TENANT_ID, input = {}) {
    await ensurePostgresSchema();
    const clean = normalizeQuoteRecord(input);
    if (!clean.chatId) throw new Error('chatId requerido para crear cotizacion.');

    const { rows } = await queryPostgres(
        `INSERT INTO tenant_quotes (
            tenant_id, quote_id, chat_id, scope_module_id, message_id, status, currency,
            items_json, summary_json, notes,
            created_by_user_id, updated_by_user_id, sent_at, metadata,
            created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::jsonb, $9::jsonb, $10,
            $11, $12, $13, $14::jsonb,
            $15::timestamptz, $16::timestamptz
        )
        ON CONFLICT (tenant_id, quote_id)
        DO UPDATE SET
            chat_id = EXCLUDED.chat_id,
            scope_module_id = EXCLUDED.scope_module_id,
            message_id = COALESCE(EXCLUDED.message_id, tenant_quotes.message_id),
            status = COALESCE(EXCLUDED.status, tenant_quotes.status),
            currency = COALESCE(EXCLUDED.currency, tenant_quotes.currency),
            items_json = COALESCE(EXCLUDED.items_json, tenant_quotes.items_json),
            summary_json = COALESCE(EXCLUDED.summary_json, tenant_quotes.summary_json),
            notes = COALESCE(EXCLUDED.notes, tenant_quotes.notes),
            created_by_user_id = COALESCE(tenant_quotes.created_by_user_id, EXCLUDED.created_by_user_id),
            updated_by_user_id = COALESCE(EXCLUDED.updated_by_user_id, tenant_quotes.updated_by_user_id),
            sent_at = COALESCE(EXCLUDED.sent_at, tenant_quotes.sent_at),
            metadata = COALESCE(tenant_quotes.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_at = NOW()
        RETURNING
            quote_id, chat_id, scope_module_id, message_id, status, currency,
            items_json, summary_json, notes, created_by_user_id, updated_by_user_id,
            sent_at, metadata, created_at, updated_at`,
        [
            tenantId,
            clean.quoteId,
            clean.chatId,
            clean.scopeModuleId || '',
            clean.messageId,
            clean.status,
            clean.currency,
            JSON.stringify(clean.itemsJson || []),
            JSON.stringify(clean.summaryJson || {}),
            clean.notes,
            clean.createdByUserId,
            clean.updatedByUserId,
            clean.sentAt,
            JSON.stringify(clean.metadata || {}),
            clean.createdAt,
            clean.updatedAt
        ]
    );

    const row = rows?.[0] || null;
    return sanitizeQuotePublic({
        quoteId: row?.quote_id,
        chatId: row?.chat_id,
        scopeModuleId: row?.scope_module_id,
        messageId: row?.message_id,
        status: row?.status,
        currency: row?.currency,
        itemsJson: row?.items_json,
        summaryJson: row?.summary_json,
        notes: row?.notes,
        createdByUserId: row?.created_by_user_id,
        updatedByUserId: row?.updated_by_user_id,
        sentAt: row?.sent_at ? new Date(row.sent_at).toISOString() : null,
        metadata: row?.metadata,
        createdAt: row?.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
    });
}

async function getQuoteByIdPostgres(tenantId = DEFAULT_TENANT_ID, { quoteId = '' } = {}) {
    await ensurePostgresSchema();
    const cleanQuoteId = toText(quoteId);
    if (!cleanQuoteId) return null;

    const { rows } = await queryPostgres(
        `SELECT
            quote_id, chat_id, scope_module_id, message_id, status, currency,
            items_json, summary_json, notes, created_by_user_id, updated_by_user_id,
            sent_at, metadata, created_at, updated_at
         FROM tenant_quotes
         WHERE tenant_id = $1 AND quote_id = $2
         LIMIT 1`,
        [tenantId, cleanQuoteId]
    );

    const row = rows?.[0] || null;
    if (!row) return null;

    return sanitizeQuotePublic({
        quoteId: row.quote_id,
        chatId: row.chat_id,
        scopeModuleId: row.scope_module_id,
        messageId: row.message_id,
        status: row.status,
        currency: row.currency,
        itemsJson: row.items_json,
        summaryJson: row.summary_json,
        notes: row.notes,
        createdByUserId: row.created_by_user_id,
        updatedByUserId: row.updated_by_user_id,
        sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        metadata: row.metadata,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    });
}

async function markQuoteSentPostgres(
    tenantId = DEFAULT_TENANT_ID,
    { quoteId = '', messageId = '', updatedByUserId = null, sentAt = null } = {}
) {
    await ensurePostgresSchema();
    const cleanQuoteId = toText(quoteId);
    if (!cleanQuoteId) return null;

    const effectiveSentAt = toText(sentAt) || nowIso();
    const { rows } = await queryPostgres(
        `UPDATE tenant_quotes
         SET
            message_id = COALESCE($3, message_id),
            status = 'sent',
            sent_at = $4::timestamptz,
            updated_by_user_id = COALESCE($5, updated_by_user_id),
            updated_at = NOW()
         WHERE tenant_id = $1
           AND quote_id = $2
         RETURNING
            quote_id, chat_id, scope_module_id, message_id, status, currency,
            items_json, summary_json, notes, created_by_user_id, updated_by_user_id,
            sent_at, metadata, created_at, updated_at`,
        [tenantId, cleanQuoteId, toNullableText(messageId), effectiveSentAt, toNullableText(updatedByUserId)]
    );

    const row = rows?.[0] || null;
    if (!row) return null;

    return sanitizeQuotePublic({
        quoteId: row.quote_id,
        chatId: row.chat_id,
        scopeModuleId: row.scope_module_id,
        messageId: row.message_id,
        status: row.status,
        currency: row.currency,
        itemsJson: row.items_json,
        summaryJson: row.summary_json,
        notes: row.notes,
        createdByUserId: row.created_by_user_id,
        updatedByUserId: row.updated_by_user_id,
        sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
        metadata: row.metadata,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    });
}

async function createQuoteRecordFile(tenantId = DEFAULT_TENANT_ID, input = {}) {
    const clean = normalizeQuoteRecord(input);
    if (!clean.chatId) throw new Error('chatId requerido para crear cotizacion.');

    const parsed = await readTenantJsonFile(QUOTES_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const now = nowIso();
    const nextRecord = {
        ...clean,
        createdAt: clean.createdAt || now,
        updatedAt: now
    };

    const index = items.findIndex((entry) => toText(entry?.quoteId) === nextRecord.quoteId);
    if (index >= 0) {
        const previous = items[index];
        items[index] = {
            ...previous,
            ...nextRecord,
            createdAt: toText(previous?.createdAt) || nextRecord.createdAt,
            updatedAt: now
        };
    } else {
        items.unshift(nextRecord);
    }

    await writeTenantJsonFile(QUOTES_FILE, { items }, { tenantId });
    return sanitizeQuotePublic(nextRecord);
}

async function getQuoteByIdFile(tenantId = DEFAULT_TENANT_ID, { quoteId = '' } = {}) {
    const cleanQuoteId = toText(quoteId);
    if (!cleanQuoteId) return null;

    const parsed = await readTenantJsonFile(QUOTES_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const found = items.find((entry) => toText(entry?.quoteId) === cleanQuoteId) || null;
    return sanitizeQuotePublic(found);
}

async function markQuoteSentFile(
    tenantId = DEFAULT_TENANT_ID,
    { quoteId = '', messageId = '', updatedByUserId = null, sentAt = null } = {}
) {
    const cleanQuoteId = toText(quoteId);
    if (!cleanQuoteId) return null;

    const parsed = await readTenantJsonFile(QUOTES_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const index = items.findIndex((entry) => toText(entry?.quoteId) === cleanQuoteId);
    if (index < 0) return null;

    const now = nowIso();
    items[index] = {
        ...items[index],
        messageId: toNullableText(messageId) || items[index]?.messageId || null,
        status: 'sent',
        sentAt: toText(sentAt) || now,
        updatedByUserId: toNullableText(updatedByUserId) || items[index]?.updatedByUserId || null,
        updatedAt: now
    };

    await writeTenantJsonFile(QUOTES_FILE, { items }, { tenantId });
    return sanitizeQuotePublic(items[index]);
}

async function createQuoteRecord(tenantId = DEFAULT_TENANT_ID, input = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    if (getStorageDriver() === 'postgres') {
        return createQuoteRecordPostgres(cleanTenant, input);
    }
    return createQuoteRecordFile(cleanTenant, input);
}

async function markQuoteSent(tenantId = DEFAULT_TENANT_ID, input = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    if (getStorageDriver() === 'postgres') {
        return markQuoteSentPostgres(cleanTenant, input);
    }
    return markQuoteSentFile(cleanTenant, input);
}

async function getQuoteById(tenantId = DEFAULT_TENANT_ID, input = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    if (getStorageDriver() === 'postgres') {
        return getQuoteByIdPostgres(cleanTenant, input);
    }
    return getQuoteByIdFile(cleanTenant, input);
}

module.exports = {
    createQuoteRecord,
    markQuoteSent,
    getQuoteById
};
