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

function toPositiveIntOrNull(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const int = Math.trunc(num);
    return int > 0 ? int : null;
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
                quote_number INTEGER NOT NULL DEFAULT 1,
                revision_number INTEGER NOT NULL DEFAULT 1,
                parent_quote_id TEXT NULL,
                is_option_mode BOOLEAN NOT NULL DEFAULT FALSE,
                option_number INTEGER NULL,
                option_group_id TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, quote_id)
            )
        `);
        await queryPostgres(`ALTER TABLE tenant_quotes ADD COLUMN IF NOT EXISTS quote_number INTEGER NOT NULL DEFAULT 1`);
        await queryPostgres(`ALTER TABLE tenant_quotes ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1`);
        await queryPostgres(`ALTER TABLE tenant_quotes ADD COLUMN IF NOT EXISTS parent_quote_id TEXT NULL`);
        await queryPostgres(`ALTER TABLE tenant_quotes ADD COLUMN IF NOT EXISTS is_option_mode BOOLEAN NOT NULL DEFAULT FALSE`);
        await queryPostgres(`ALTER TABLE tenant_quotes ADD COLUMN IF NOT EXISTS option_number INTEGER NULL`);
        await queryPostgres(`ALTER TABLE tenant_quotes ADD COLUMN IF NOT EXISTS option_group_id TEXT NULL`);
        await queryPostgres(`
            WITH ranked AS (
                SELECT
                    tenant_id,
                    quote_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY tenant_id, chat_id
                        ORDER BY COALESCE(sent_at, created_at), created_at, quote_id
                    ) AS rn
                FROM tenant_quotes
                WHERE parent_quote_id IS NULL
            )
            UPDATE tenant_quotes q
            SET quote_number = ranked.rn
            FROM ranked
            WHERE q.tenant_id = ranked.tenant_id
              AND q.quote_id = ranked.quote_id
              AND q.parent_quote_id IS NULL
              AND q.quote_number = 1
        `);
        await queryPostgres(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_quotes_quote_id
            ON tenant_quotes(quote_id)
        `);
        await queryPostgres(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'fk_tenant_quotes_parent_quote'
                ) THEN
                    ALTER TABLE tenant_quotes
                        ADD CONSTRAINT fk_tenant_quotes_parent_quote
                        FOREIGN KEY (parent_quote_id)
                        REFERENCES tenant_quotes(quote_id)
                        ON DELETE SET NULL;
                END IF;
            END $$
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
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_quotes_chat_number
            ON tenant_quotes(tenant_id, chat_id, quote_number)
        `);
        await queryPostgres(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_chat_number_unique
            ON tenant_quotes(tenant_id, chat_id, quote_number)
            WHERE parent_quote_id IS NULL
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_quotes_option_group
            ON tenant_quotes(option_group_id)
            WHERE option_group_id IS NOT NULL
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
        quoteNumber: toPositiveIntOrNull(source.quoteNumber ?? source.quote_number),
        revisionNumber: toPositiveIntOrNull(source.revisionNumber ?? source.revision_number),
        parentQuoteId: toNullableText(source.parentQuoteId ?? source.parent_quote_id),
        isOptionMode: source.isOptionMode === true || source.is_option_mode === true,
        optionNumber: toPositiveIntOrNull(source.optionNumber ?? source.option_number),
        optionGroupId: toNullableText(source.optionGroupId ?? source.option_group_id),
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
        quoteNumber: toPositiveIntOrNull(record.quoteNumber ?? record.quote_number),
        revisionNumber: toPositiveIntOrNull(record.revisionNumber ?? record.revision_number),
        parentQuoteId: toNullableText(record.parentQuoteId ?? record.parent_quote_id),
        isOptionMode: record.isOptionMode === true || record.is_option_mode === true,
        optionNumber: toPositiveIntOrNull(record.optionNumber ?? record.option_number),
        optionGroupId: toNullableText(record.optionGroupId ?? record.option_group_id),
        metadata: isPlainObject(record.metadata) ? record.metadata : {},
        createdAt: toText(record.createdAt) || null,
        updatedAt: toText(record.updatedAt) || null
    };
}

function sanitizeQuoteRow(row = null) {
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
        quoteNumber: row.quote_number,
        revisionNumber: row.revision_number,
        parentQuoteId: row.parent_quote_id,
        isOptionMode: row.is_option_mode === true,
        optionNumber: row.option_number,
        optionGroupId: row.option_group_id,
        metadata: row.metadata,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    });
}

function buildOptionChoicePattern(optionNumber = 0) {
    const aliasesByOption = {
        1: ['primera', 'uno', '1'],
        2: ['segunda', 'dos', '2'],
        3: ['tercera', 'tres', '3'],
        4: ['cuarta', 'cuatro', '4'],
        5: ['quinta', 'cinco', '5']
    };
    const aliases = aliasesByOption[optionNumber] || [String(optionNumber || '').trim()];
    const escaped = aliases
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (escaped.length === 0) return null;
    return new RegExp(`\\b(opci[oó]n\\s*${optionNumber}|option\\s*${optionNumber}|${escaped.join('|')})\\b`, 'i');
}

async function resolveQuoteNumberingPostgres(tenantId = DEFAULT_TENANT_ID, clean = {}) {
    const existing = clean.quoteId
        ? await queryPostgres(
            `SELECT quote_number, revision_number, parent_quote_id
             FROM tenant_quotes
             WHERE tenant_id = $1 AND quote_id = $2
             LIMIT 1`,
            [tenantId, clean.quoteId]
        )
        : null;
    const existingRow = existing?.rows?.[0] || null;
    if (existingRow && !clean.quoteNumber && !clean.revisionNumber && !clean.parentQuoteId) {
        return {
            quoteNumber: toPositiveIntOrNull(existingRow.quote_number) || 1,
            revisionNumber: toPositiveIntOrNull(existingRow.revision_number) || 1,
            parentQuoteId: toNullableText(existingRow.parent_quote_id)
        };
    }

    if (clean.parentQuoteId) {
        const parentResult = await queryPostgres(
            `SELECT quote_number
             FROM tenant_quotes
             WHERE tenant_id = $1 AND quote_id = $2
             LIMIT 1`,
            [tenantId, clean.parentQuoteId]
        );
        const parentRow = parentResult?.rows?.[0] || null;
        const inheritedQuoteNumber = clean.quoteNumber || toPositiveIntOrNull(parentRow?.quote_number) || 1;
        const revisionResult = await queryPostgres(
            `SELECT COALESCE(MAX(revision_number), 1) + 1 AS next_revision
             FROM tenant_quotes
             WHERE tenant_id = $1
               AND chat_id = $2
               AND (quote_id = $3 OR parent_quote_id = $3)`,
            [tenantId, clean.chatId, clean.parentQuoteId]
        );
        return {
            quoteNumber: inheritedQuoteNumber,
            revisionNumber: clean.revisionNumber || toPositiveIntOrNull(revisionResult?.rows?.[0]?.next_revision) || 2,
            parentQuoteId: clean.parentQuoteId
        };
    }

    if (clean.quoteNumber) {
        return {
            quoteNumber: clean.quoteNumber,
            revisionNumber: clean.revisionNumber || 1,
            parentQuoteId: null
        };
    }

    const nextResult = await queryPostgres(
        `SELECT COALESCE(MAX(quote_number), 0) + 1 AS next_quote_number
         FROM tenant_quotes
         WHERE tenant_id = $1
           AND chat_id = $2
           AND parent_quote_id IS NULL`,
        [tenantId, clean.chatId]
    );
    return {
        quoteNumber: toPositiveIntOrNull(nextResult?.rows?.[0]?.next_quote_number) || 1,
        revisionNumber: clean.revisionNumber || 1,
        parentQuoteId: null
    };
}

async function createQuoteRecordPostgres(tenantId = DEFAULT_TENANT_ID, input = {}) {
    await ensurePostgresSchema();
    const clean = normalizeQuoteRecord(input);
    if (!clean.chatId) throw new Error('chatId requerido para crear cotizacion.');
    const numbering = await resolveQuoteNumberingPostgres(tenantId, clean);

    const { rows } = await queryPostgres(
        `INSERT INTO tenant_quotes (
            tenant_id, quote_id, chat_id, scope_module_id, message_id, status, currency,
            items_json, summary_json, notes,
            created_by_user_id, updated_by_user_id, sent_at,
            quote_number, revision_number, parent_quote_id,
            is_option_mode, option_number, option_group_id,
            metadata,
            created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::jsonb, $9::jsonb, $10,
            $11, $12, $13,
            $14, $15, $16,
            $17, $18, $19, $20::jsonb,
            $21::timestamptz, $22::timestamptz
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
            quote_number = COALESCE(EXCLUDED.quote_number, tenant_quotes.quote_number),
            revision_number = COALESCE(EXCLUDED.revision_number, tenant_quotes.revision_number),
            parent_quote_id = COALESCE(EXCLUDED.parent_quote_id, tenant_quotes.parent_quote_id),
            is_option_mode = EXCLUDED.is_option_mode,
            option_number = EXCLUDED.option_number,
            option_group_id = EXCLUDED.option_group_id,
            metadata = COALESCE(tenant_quotes.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_at = NOW()
        RETURNING
            quote_id, chat_id, scope_module_id, message_id, status, currency,
            items_json, summary_json, notes, created_by_user_id, updated_by_user_id,
            sent_at, quote_number, revision_number, parent_quote_id,
            is_option_mode, option_number, option_group_id,
            metadata, created_at, updated_at`,
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
            numbering.quoteNumber,
            numbering.revisionNumber,
            numbering.parentQuoteId,
            clean.isOptionMode === true,
            clean.optionNumber,
            clean.optionGroupId,
            JSON.stringify(clean.metadata || {}),
            clean.createdAt,
            clean.updatedAt
        ]
    );

    const row = rows?.[0] || null;
    return sanitizeQuoteRow(row);
}

async function getQuoteByIdPostgres(tenantId = DEFAULT_TENANT_ID, { quoteId = '' } = {}) {
    await ensurePostgresSchema();
    const cleanQuoteId = toText(quoteId);
    if (!cleanQuoteId) return null;

    const { rows } = await queryPostgres(
        `SELECT
            quote_id, chat_id, scope_module_id, message_id, status, currency,
            items_json, summary_json, notes, created_by_user_id, updated_by_user_id,
            sent_at, quote_number, revision_number, parent_quote_id,
            is_option_mode, option_number, option_group_id,
            metadata, created_at, updated_at
         FROM tenant_quotes
         WHERE tenant_id = $1 AND quote_id = $2
         LIMIT 1`,
        [tenantId, cleanQuoteId]
    );

    const row = rows?.[0] || null;
    if (!row) return null;

    return sanitizeQuoteRow(row);
}

async function listQuotesByChatPostgres(tenantId = DEFAULT_TENANT_ID, { chatId = '' } = {}) {
    await ensurePostgresSchema();
    const cleanChatId = toText(chatId);
    if (!cleanChatId) return [];

    const { rows } = await queryPostgres(
        `SELECT DISTINCT ON (quote_number)
            quote_id, chat_id, scope_module_id, message_id, status, currency,
            items_json, summary_json, notes, created_by_user_id, updated_by_user_id,
            sent_at, quote_number, revision_number, parent_quote_id,
            is_option_mode, option_number, option_group_id,
            metadata, created_at, updated_at
         FROM tenant_quotes
         WHERE tenant_id = $1
           AND chat_id = $2
         ORDER BY quote_number ASC, revision_number DESC, COALESCE(sent_at, created_at) DESC`,
        [tenantId, cleanChatId]
    );

    return (Array.isArray(rows) ? rows : []).map(sanitizeQuoteRow).filter(Boolean);
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
            sent_at, quote_number, revision_number, parent_quote_id,
            is_option_mode, option_number, option_group_id,
            metadata, created_at, updated_at`,
        [tenantId, cleanQuoteId, toNullableText(messageId), effectiveSentAt, toNullableText(updatedByUserId)]
    );

    const row = rows?.[0] || null;
    if (!row) return null;

    return sanitizeQuoteRow(row);
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
    const existingIndex = items.findIndex((entry) => toText(entry?.quoteId) === clean.quoteId);
    const existingRecord = existingIndex >= 0 ? items[existingIndex] : null;
    let quoteNumber = clean.quoteNumber || toPositiveIntOrNull(existingRecord?.quoteNumber) || null;
    let revisionNumber = clean.revisionNumber || toPositiveIntOrNull(existingRecord?.revisionNumber) || null;
    let parentQuoteId = clean.parentQuoteId || toNullableText(existingRecord?.parentQuoteId);
    const isOptionMode = clean.isOptionMode === true;
    const optionNumber = clean.optionNumber || toPositiveIntOrNull(existingRecord?.optionNumber) || null;
    const optionGroupId = clean.optionGroupId || toNullableText(existingRecord?.optionGroupId);

    if (parentQuoteId) {
        const parent = items.find((entry) => toText(entry?.quoteId) === parentQuoteId) || null;
        quoteNumber = quoteNumber || toPositiveIntOrNull(parent?.quoteNumber) || 1;
        const revisionMax = items.reduce((max, entry) => {
            const sameFamily = toText(entry?.quoteId) === parentQuoteId || toText(entry?.parentQuoteId) === parentQuoteId;
            if (!sameFamily) return max;
            return Math.max(max, toPositiveIntOrNull(entry?.revisionNumber) || 1);
        }, 1);
        revisionNumber = revisionNumber || (revisionMax + 1);
    } else {
        quoteNumber = quoteNumber || items
            .filter((entry) => toText(entry?.chatId) === clean.chatId && !toNullableText(entry?.parentQuoteId))
            .reduce((max, entry) => Math.max(max, toPositiveIntOrNull(entry?.quoteNumber) || 0), 0) + 1;
        revisionNumber = revisionNumber || 1;
    }

    const nextRecord = {
        ...clean,
        quoteNumber,
        revisionNumber,
        parentQuoteId,
        isOptionMode,
        optionNumber,
        optionGroupId,
        createdAt: clean.createdAt || now,
        updatedAt: now
    };

    const index = existingIndex;
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

async function listQuotesByChatFile(tenantId = DEFAULT_TENANT_ID, { chatId = '' } = {}) {
    const cleanChatId = toText(chatId);
    if (!cleanChatId) return [];

    const parsed = await readTenantJsonFile(QUOTES_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const latestByNumber = new Map();
    items
        .filter((entry) => toText(entry?.chatId) === cleanChatId)
        .forEach((entry) => {
            const quoteNumber = toPositiveIntOrNull(entry?.quoteNumber) || 1;
            const current = latestByNumber.get(quoteNumber);
            const revision = toPositiveIntOrNull(entry?.revisionNumber) || 1;
            const currentRevision = toPositiveIntOrNull(current?.revisionNumber) || 0;
            if (!current || revision >= currentRevision) {
                latestByNumber.set(quoteNumber, entry);
            }
        });

    return Array.from(latestByNumber.entries())
        .sort(([a], [b]) => a - b)
        .map(([, entry]) => sanitizeQuotePublic(entry))
        .filter(Boolean);
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

async function detectOptionChoicePostgres(tenantId = DEFAULT_TENANT_ID, { chatId = '', text = '' } = {}) {
    await ensurePostgresSchema();
    const cleanChatId = toText(chatId);
    const cleanText = toText(text);
    if (!cleanChatId || !cleanText) return null;

    const activeResult = await queryPostgres(
        `SELECT option_group_id, COUNT(*) AS total
         FROM tenant_quotes
         WHERE tenant_id = $1
           AND chat_id = $2
           AND is_option_mode = TRUE
           AND status = 'sent'
           AND created_at > NOW() - INTERVAL '48 hours'
           AND option_group_id IS NOT NULL
         GROUP BY option_group_id
         ORDER BY MAX(created_at) DESC
         LIMIT 1`,
        [tenantId, cleanChatId]
    );
    const activeRow = activeResult?.rows?.[0] || null;
    const optionGroupId = toNullableText(activeRow?.option_group_id);
    const total = Math.max(0, Number(activeRow?.total || 0) || 0);
    if (!optionGroupId || total <= 0) return null;

    for (let optionNumber = 1; optionNumber <= total; optionNumber += 1) {
        const pattern = buildOptionChoicePattern(optionNumber);
        if (!pattern || !pattern.test(cleanText)) continue;
        await queryPostgres(
            `UPDATE tenant_quotes
             SET status = CASE
                 WHEN option_number = $3 THEN 'chosen'
                 ELSE 'not_chosen'
             END,
             updated_at = NOW()
             WHERE option_group_id = $1
               AND tenant_id = $2`,
            [optionGroupId, tenantId, optionNumber]
        );
        return {
            chosenOption: optionNumber,
            optionGroupId,
            option_group_id: optionGroupId,
            totalOptions: total
        };
    }

    return null;
}

async function detectOptionChoiceFile(tenantId = DEFAULT_TENANT_ID, { chatId = '', text = '' } = {}) {
    const cleanChatId = toText(chatId);
    const cleanText = toText(text);
    if (!cleanChatId || !cleanText) return null;

    const parsed = await readTenantJsonFile(QUOTES_FILE, {
        tenantId,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const recentOptions = items
        .filter((entry) => (
            toText(entry?.chatId) === cleanChatId
            && entry?.isOptionMode === true
            && toText(entry?.status || 'sent') === 'sent'
            && toNullableText(entry?.optionGroupId)
        ))
        .filter((entry) => {
            const createdAt = new Date(entry?.createdAt || entry?.updatedAt || 0);
            return !Number.isNaN(createdAt.getTime()) && (Date.now() - createdAt.getTime()) <= (48 * 60 * 60 * 1000);
        })
        .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    if (recentOptions.length === 0) return null;

    const optionGroupId = toNullableText(recentOptions[0]?.optionGroupId);
    if (!optionGroupId) return null;
    const groupItems = recentOptions.filter((entry) => toNullableText(entry?.optionGroupId) === optionGroupId);
    const total = groupItems.length;
    for (let optionNumber = 1; optionNumber <= total; optionNumber += 1) {
        const pattern = buildOptionChoicePattern(optionNumber);
        if (!pattern || !pattern.test(cleanText)) continue;
        const now = nowIso();
        const nextItems = items.map((entry) => {
            if (toNullableText(entry?.optionGroupId) !== optionGroupId) return entry;
            return {
                ...entry,
                status: toPositiveIntOrNull(entry?.optionNumber) === optionNumber ? 'chosen' : 'not_chosen',
                updatedAt: now
            };
        });
        await writeTenantJsonFile(QUOTES_FILE, { items: nextItems }, { tenantId });
        return {
            chosenOption: optionNumber,
            optionGroupId,
            option_group_id: optionGroupId,
            totalOptions: total
        };
    }

    return null;
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

async function listQuotesByChat(tenantId = DEFAULT_TENANT_ID, input = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    if (getStorageDriver() === 'postgres') {
        return listQuotesByChatPostgres(cleanTenant, input);
    }
    return listQuotesByChatFile(cleanTenant, input);
}

async function detectOptionChoice(tenantId = DEFAULT_TENANT_ID, input = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    if (getStorageDriver() === 'postgres') {
        return detectOptionChoicePostgres(cleanTenant, input);
    }
    return detectOptionChoiceFile(cleanTenant, input);
}

module.exports = {
    createQuoteRecord,
    createQuoteRecordPostgres,
    markQuoteSent,
    getQuoteById,
    listQuotesByChat,
    detectOptionChoice
};
