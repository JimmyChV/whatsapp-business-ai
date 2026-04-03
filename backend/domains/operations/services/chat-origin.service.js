const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const STORE_FILE = 'chat_origins.json';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const VALID_ORIGIN_TYPES = new Set(['organic', 'meta_ad', 'campaign']);

let schemaReady = false;
let schemaPromise = null;

function nowIso() {
    return new Date().toISOString();
}

function resolveTenantId(input = null) {
    if (typeof input === 'string') return normalizeTenantId(input || DEFAULT_TENANT_ID);
    if (input && typeof input === 'object') return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    return DEFAULT_TENANT_ID;
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toNullableText(value = '') {
    const text = toText(value);
    return text || null;
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function toIso(value = '') {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    }
    const text = toText(value);
    if (!text) return null;
    const parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed.toISOString();
}

function normalizeOriginType(value = '') {
    const normalized = toLower(value);
    if (VALID_ORIGIN_TYPES.has(normalized)) return normalized;
    return 'organic';
}

function normalizeScopeModuleId(value = '') {
    return toLower(value);
}

function normalizeObject(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function normalizeLimit(value = DEFAULT_LIMIT) {
    const parsed = Number(value || DEFAULT_LIMIT);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function normalizeOffset(value = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

function originKey(chatId = '', scopeModuleId = '') {
    return `${toText(chatId)}::${normalizeScopeModuleId(scopeModuleId)}`;
}

function normalizeOriginRecord(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const detectedAt = toIso(source.detectedAt || source.detected_at) || nowIso();
    const createdAt = toIso(source.createdAt || source.created_at) || detectedAt;

    return {
        chatId: toText(source.chatId || source.chat_id),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id),
        originType: normalizeOriginType(source.originType || source.origin_type),
        referralSourceUrl: toNullableText(source.referralSourceUrl || source.referral_source_url),
        referralSourceType: toNullableText(source.referralSourceType || source.referral_source_type),
        referralSourceId: toNullableText(source.referralSourceId || source.referral_source_id),
        referralHeadline: toNullableText(source.referralHeadline || source.referral_headline),
        ctwaClid: toNullableText(source.ctwaClid || source.ctwa_clid),
        campaignId: toNullableText(source.campaignId || source.campaign_id),
        rawReferral: normalizeObject(source.rawReferral || source.raw_referral),
        detectedAt,
        createdAt
    };
}

function normalizeStore(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const items = Array.isArray(source.items)
        ? source.items
            .map((entry) => normalizeOriginRecord(entry))
            .filter((entry) => entry.chatId)
        : [];
    return { items };
}

function toPublicRecord(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    return {
        chatId: toText(source.chatId),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId),
        originType: normalizeOriginType(source.originType),
        referralSourceUrl: toNullableText(source.referralSourceUrl),
        referralSourceType: toNullableText(source.referralSourceType),
        referralSourceId: toNullableText(source.referralSourceId),
        referralHeadline: toNullableText(source.referralHeadline),
        ctwaClid: toNullableText(source.ctwaClid),
        campaignId: toNullableText(source.campaignId),
        rawReferral: normalizeObject(source.rawReferral),
        detectedAt: toIso(source.detectedAt),
        createdAt: toIso(source.createdAt)
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_chat_origins (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                chat_id TEXT NOT NULL,
                scope_module_id TEXT NOT NULL DEFAULT '',
                origin_type TEXT NOT NULL CHECK (origin_type IN ('organic', 'meta_ad', 'campaign')),
                referral_source_url TEXT NULL,
                referral_source_type TEXT NULL,
                referral_source_id TEXT NULL,
                referral_headline TEXT NULL,
                ctwa_clid TEXT NULL,
                campaign_id TEXT NULL,
                raw_referral JSONB NOT NULL DEFAULT '{}'::jsonb,
                detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, chat_id, scope_module_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_chat_origins_origin
            ON tenant_chat_origins(tenant_id, origin_type, detected_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_chat_origins_campaign
            ON tenant_chat_origins(tenant_id, campaign_id, detected_at DESC)
            WHERE campaign_id IS NOT NULL AND campaign_id <> ''
        `);
        schemaReady = true;
    })();

    try {
        await schemaPromise;
    } catch (error) {
        schemaPromise = null;
        throw error;
    }
}

async function upsertChatOrigin(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const clean = normalizeOriginRecord(payload);
    if (!clean.chatId) throw new Error('chatId requerido para origen de chat.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = originKey(clean.chatId, clean.scopeModuleId);
        const index = store.items.findIndex((entry) => originKey(entry.chatId, entry.scopeModuleId) === key);
        const previous = index >= 0 ? store.items[index] : null;
        const next = normalizeOriginRecord({
            ...(previous || {}),
            ...clean,
            createdAt: previous?.createdAt || clean.createdAt
        });
        if (index >= 0) store.items[index] = next;
        else store.items.push(next);
        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        return toPublicRecord(next);
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `INSERT INTO tenant_chat_origins (
            tenant_id, chat_id, scope_module_id, origin_type,
            referral_source_url, referral_source_type, referral_source_id, referral_headline,
            ctwa_clid, campaign_id, raw_referral, detected_at, created_at
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11::jsonb, $12::timestamptz, $13::timestamptz
        )
        ON CONFLICT (tenant_id, chat_id, scope_module_id)
        DO UPDATE SET
            origin_type = EXCLUDED.origin_type,
            referral_source_url = COALESCE(EXCLUDED.referral_source_url, tenant_chat_origins.referral_source_url),
            referral_source_type = COALESCE(EXCLUDED.referral_source_type, tenant_chat_origins.referral_source_type),
            referral_source_id = COALESCE(EXCLUDED.referral_source_id, tenant_chat_origins.referral_source_id),
            referral_headline = COALESCE(EXCLUDED.referral_headline, tenant_chat_origins.referral_headline),
            ctwa_clid = COALESCE(EXCLUDED.ctwa_clid, tenant_chat_origins.ctwa_clid),
            campaign_id = COALESCE(EXCLUDED.campaign_id, tenant_chat_origins.campaign_id),
            raw_referral = COALESCE(tenant_chat_origins.raw_referral, '{}'::jsonb) || COALESCE(EXCLUDED.raw_referral, '{}'::jsonb),
            detected_at = COALESCE(EXCLUDED.detected_at, tenant_chat_origins.detected_at)
        RETURNING
            chat_id, scope_module_id, origin_type,
            referral_source_url, referral_source_type, referral_source_id, referral_headline,
            ctwa_clid, campaign_id, raw_referral, detected_at, created_at`,
        [
            cleanTenantId,
            clean.chatId,
            clean.scopeModuleId || '',
            clean.originType,
            clean.referralSourceUrl,
            clean.referralSourceType,
            clean.referralSourceId,
            clean.referralHeadline,
            clean.ctwaClid,
            clean.campaignId,
            JSON.stringify(clean.rawReferral || {}),
            clean.detectedAt,
            clean.createdAt
        ]
    );

    const row = result?.rows?.[0] || null;
    return toPublicRecord({
        chatId: row?.chat_id,
        scopeModuleId: row?.scope_module_id,
        originType: row?.origin_type,
        referralSourceUrl: row?.referral_source_url,
        referralSourceType: row?.referral_source_type,
        referralSourceId: row?.referral_source_id,
        referralHeadline: row?.referral_headline,
        ctwaClid: row?.ctwa_clid,
        campaignId: row?.campaign_id,
        rawReferral: row?.raw_referral,
        detectedAt: row?.detected_at,
        createdAt: row?.created_at
    });
}

async function getChatOrigin(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = toText(options.chatId || options);
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    if (!chatId) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = originKey(chatId, scopeModuleId);
        const item = store.items.find((entry) => originKey(entry.chatId, entry.scopeModuleId) === key);
        return item ? toPublicRecord(item) : null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT chat_id, scope_module_id, origin_type,
                    referral_source_url, referral_source_type, referral_source_id, referral_headline,
                    ctwa_clid, campaign_id, raw_referral, detected_at, created_at
               FROM tenant_chat_origins
              WHERE tenant_id = $1
                AND chat_id = $2
                AND scope_module_id = $3
              LIMIT 1`,
            [cleanTenantId, chatId, scopeModuleId]
        );
        const row = Array.isArray(result?.rows) && result.rows[0] ? result.rows[0] : null;
        if (!row) return null;
        return toPublicRecord({
            chatId: row.chat_id,
            scopeModuleId: row.scope_module_id,
            originType: row.origin_type,
            referralSourceUrl: row.referral_source_url,
            referralSourceType: row.referral_source_type,
            referralSourceId: row.referral_source_id,
            referralHeadline: row.referral_headline,
            ctwaClid: row.ctwa_clid,
            campaignId: row.campaign_id,
            rawReferral: row.raw_referral,
            detectedAt: row.detected_at,
            createdAt: row.created_at
        });
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function listChatOrigins(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    const originType = toLower(options.originType || '');
    const campaignId = toText(options.campaignId || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.items
            .filter((entry) => !scopeModuleId || entry.scopeModuleId === scopeModuleId)
            .filter((entry) => !originType || entry.originType === normalizeOriginType(originType))
            .filter((entry) => !campaignId || toText(entry.campaignId) === campaignId)
            .sort((a, b) => String(b.detectedAt || '').localeCompare(String(a.detectedAt || '')));
        const items = filtered.slice(offset, offset + limit).map((entry) => toPublicRecord(entry));
        return { items, total: filtered.length, limit, offset };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];

        if (scopeModuleId) {
            params.push(scopeModuleId);
            where.push(`scope_module_id = $${params.length}`);
        }
        if (originType) {
            params.push(normalizeOriginType(originType));
            where.push(`origin_type = $${params.length}`);
        }
        if (campaignId) {
            params.push(campaignId);
            where.push(`campaign_id = $${params.length}`);
        }

        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(
            `SELECT COUNT(*)::BIGINT AS total
               FROM tenant_chat_origins
              WHERE ${whereSql}`,
            params
        );

        const rowParams = [...params, limit, offset];
        const rowsResult = await queryPostgres(
            `SELECT chat_id, scope_module_id, origin_type,
                    referral_source_url, referral_source_type, referral_source_id, referral_headline,
                    ctwa_clid, campaign_id, raw_referral, detected_at, created_at
               FROM tenant_chat_origins
              WHERE ${whereSql}
              ORDER BY detected_at DESC
              LIMIT $${rowParams.length - 1}
              OFFSET $${rowParams.length}`,
            rowParams
        );

        const items = (Array.isArray(rowsResult?.rows) ? rowsResult.rows : []).map((row) => toPublicRecord({
            chatId: row.chat_id,
            scopeModuleId: row.scope_module_id,
            originType: row.origin_type,
            referralSourceUrl: row.referral_source_url,
            referralSourceType: row.referral_source_type,
            referralSourceId: row.referral_source_id,
            referralHeadline: row.referral_headline,
            ctwaClid: row.ctwa_clid,
            campaignId: row.campaign_id,
            rawReferral: row.raw_referral,
            detectedAt: row.detected_at,
            createdAt: row.created_at
        }));
        const total = Number(totalResult?.rows?.[0]?.total || 0);
        return { items, total, limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

module.exports = {
    upsertChatOrigin,
    getChatOrigin,
    listChatOrigins
};

