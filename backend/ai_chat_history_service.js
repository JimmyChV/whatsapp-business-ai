const { randomUUID } = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

const AI_CHAT_HISTORY_FILE = 'ai_chat_history.json';
const MAX_SCOPE_ITEMS = 600;
let postgresSchemaReadyPromise = null;

function resolveTenantId(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function toSafeString(value = '') {
    const clean = String(value || '').trim();
    return clean || null;
}

function toSafeNumber(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
}

function normalizeRole(value = '') {
    const clean = String(value || '').trim().toLowerCase();
    if (clean === 'user' || clean === 'assistant' || clean === 'system') return clean;
    return 'assistant';
}

function normalizeMode(value = '') {
    const clean = String(value || '').trim().toLowerCase();
    if (!clean) return 'copilot';
    if (clean.length > 24) return clean.slice(0, 24);
    return clean;
}

function compactRuntimeContext(input = null) {
    if (!input || typeof input !== 'object') return {};
    const tenant = input.tenant && typeof input.tenant === 'object'
        ? {
            id: toSafeString(input.tenant.id),
            name: toSafeString(input.tenant.name),
            plan: toSafeString(input.tenant.plan)
        }
        : null;
    const moduleCtx = input.module && typeof input.module === 'object'
        ? {
            moduleId: toSafeString(input.module.moduleId),
            name: toSafeString(input.module.name),
            channelType: toSafeString(input.module.channelType),
            transportMode: toSafeString(input.module.transportMode)
        }
        : null;
    const chat = input.chat && typeof input.chat === 'object'
        ? {
            chatId: toSafeString(input.chat.chatId),
            phone: toSafeString(input.chat.phone),
            customerId: toSafeString(input.chat.customerId)
        }
        : null;
    const customer = input.customer && typeof input.customer === 'object'
        ? {
            customerId: toSafeString(input.customer.customerId),
            phoneE164: toSafeString(input.customer.phoneE164),
            name: toSafeString(input.customer.name)
        }
        : null;
    const catalog = input.catalog && typeof input.catalog === 'object'
        ? {
            catalogId: toSafeString(input.catalog.catalogId),
            source: toSafeString(input.catalog.source)
        }
        : null;
    return {
        ...(tenant ? { tenant } : {}),
        ...(moduleCtx ? { module: moduleCtx } : {}),
        ...(chat ? { chat } : {}),
        ...(customer ? { customer } : {}),
        ...(catalog ? { catalog } : {})
    };
}

function normalizeEntry(input = {}) {
    const scopeChatId = toSafeString(input.scopeChatId);
    const role = normalizeRole(input.role);
    const content = String(input.content || '').trim();
    if (!scopeChatId || !content) return null;
    const nowUnix = Math.floor(Date.now() / 1000);
    const createdAtUnix = Math.max(1, Math.floor(toSafeNumber(input.createdAtUnix, nowUnix) || nowUnix));
    const metadataInput = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
    const runtimeSummary = compactRuntimeContext(input.runtimeContext);
    const metadata = {
        ...metadataInput,
        ...(Object.keys(runtimeSummary).length > 0 ? { runtime: runtimeSummary } : {})
    };
    return {
        entryId: toSafeString(input.entryId) || randomUUID(),
        scopeChatId,
        baseChatId: toSafeString(input.baseChatId),
        scopeModuleId: toSafeString(input.scopeModuleId || '')?.toLowerCase() || null,
        mode: normalizeMode(input.mode),
        role,
        content,
        assistantId: toSafeString(input.assistantId || '')?.toUpperCase() || null,
        userId: toSafeString(input.userId),
        userName: toSafeString(input.userName),
        metadata,
        createdAtUnix
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function loadStore(tenantId) {
    const parsed = await readTenantJsonFile(AI_CHAT_HISTORY_FILE, {
        tenantId,
        defaultValue: {
            entriesByScope: {}
        }
    });
    return {
        entriesByScope: parsed?.entriesByScope && typeof parsed.entriesByScope === 'object'
            ? parsed.entriesByScope
            : {}
    };
}

async function saveStore(tenantId, store) {
    await writeTenantJsonFile(AI_CHAT_HISTORY_FILE, store, { tenantId });
}

async function ensurePostgresSchema() {
    if (postgresSchemaReadyPromise) return postgresSchemaReadyPromise;
    postgresSchemaReadyPromise = (async () => {
        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS tenant_ai_chat_history (
                tenant_id TEXT NOT NULL,
                entry_id TEXT NOT NULL,
                scope_chat_id TEXT NOT NULL,
                base_chat_id TEXT NULL,
                scope_module_id TEXT NULL,
                mode TEXT NOT NULL DEFAULT 'copilot',
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                assistant_id TEXT NULL,
                user_id TEXT NULL,
                user_name TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at_unix BIGINT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, entry_id)
            )`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_ai_chat_history_tenant_scope_created
             ON tenant_ai_chat_history(tenant_id, scope_chat_id, created_at_unix DESC, created_at DESC)`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_ai_chat_history_tenant_module_created
             ON tenant_ai_chat_history(tenant_id, scope_module_id, created_at_unix DESC, created_at DESC)`
        );
    })();

    try {
        await postgresSchemaReadyPromise;
    } catch (error) {
        postgresSchemaReadyPromise = null;
        throw error;
    }
}

async function appendEntries(tenantId = DEFAULT_TENANT_ID, entries = []) {
    const cleanTenant = resolveTenantId(tenantId);
    const safeEntries = (Array.isArray(entries) ? entries : [])
        .map((entry) => normalizeEntry(entry))
        .filter(Boolean);
    if (safeEntries.length === 0) return [];

    if (getStorageDriver() === 'postgres') {
        await ensurePostgresSchema();
        for (const entry of safeEntries) {
            await queryPostgres(
                `INSERT INTO tenant_ai_chat_history (
                    tenant_id, entry_id, scope_chat_id, base_chat_id, scope_module_id,
                    mode, role, content, assistant_id, user_id, user_name, metadata, created_at_unix
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
                ON CONFLICT (tenant_id, entry_id) DO NOTHING`,
                [
                    cleanTenant,
                    entry.entryId,
                    entry.scopeChatId,
                    entry.baseChatId,
                    entry.scopeModuleId,
                    entry.mode,
                    entry.role,
                    entry.content,
                    entry.assistantId,
                    entry.userId,
                    entry.userName,
                    JSON.stringify(entry.metadata || {}),
                    entry.createdAtUnix
                ]
            );
        }
        return safeEntries;
    }

    const store = await loadStore(cleanTenant);
    for (const entry of safeEntries) {
        const current = Array.isArray(store.entriesByScope?.[entry.scopeChatId])
            ? store.entriesByScope[entry.scopeChatId]
            : [];
        current.push(entry);
        if (current.length > MAX_SCOPE_ITEMS) {
            store.entriesByScope[entry.scopeChatId] = current.slice(current.length - MAX_SCOPE_ITEMS);
        } else {
            store.entriesByScope[entry.scopeChatId] = current;
        }
    }
    await saveStore(cleanTenant, store);
    return safeEntries;
}

async function appendInteraction(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const scopeChatId = toSafeString(payload.scopeChatId);
    if (!scopeChatId) return [];
    const nowUnix = Math.floor(Date.now() / 1000);
    const baseEntry = {
        scopeChatId,
        baseChatId: toSafeString(payload.baseChatId),
        scopeModuleId: toSafeString(payload.scopeModuleId || '')?.toLowerCase() || null,
        mode: normalizeMode(payload.mode),
        assistantId: toSafeString(payload.assistantId || '')?.toUpperCase() || null,
        userId: toSafeString(payload.userId),
        userName: toSafeString(payload.userName),
        metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
        runtimeContext: payload.runtimeContext && typeof payload.runtimeContext === 'object' ? payload.runtimeContext : null
    };
    const query = String(payload.query || '').trim();
    const response = String(payload.response || '').trim();
    const entries = [];
    if (query) {
        entries.push({
            ...baseEntry,
            entryId: randomUUID(),
            role: 'user',
            content: query,
            createdAtUnix: nowUnix
        });
    }
    if (response) {
        entries.push({
            ...baseEntry,
            entryId: randomUUID(),
            role: 'assistant',
            content: response,
            createdAtUnix: nowUnix + (query ? 1 : 0)
        });
    }
    return appendEntries(tenantId, entries);
}

async function listEntries(tenantId = DEFAULT_TENANT_ID, {
    scopeChatId = '',
    limit = 80,
    beforeTimestamp = null
} = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const safeScopeChatId = toSafeString(scopeChatId);
    if (!safeScopeChatId) return [];
    const safeLimit = Math.min(300, Math.max(1, Number(limit) || 80));
    const safeBefore = toSafeNumber(beforeTimestamp, null);

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresSchema();
            const params = [cleanTenant, safeScopeChatId, safeLimit];
            let sql = `SELECT entry_id, scope_chat_id, base_chat_id, scope_module_id, mode, role, content,
                              assistant_id, user_id, user_name, metadata, created_at_unix, created_at
                         FROM tenant_ai_chat_history
                        WHERE tenant_id = $1
                          AND scope_chat_id = $2`;
            if (Number.isFinite(safeBefore) && safeBefore > 0) {
                params.splice(2, 0, Math.floor(safeBefore));
                sql += ' AND created_at_unix < $3 ORDER BY created_at_unix DESC, created_at DESC LIMIT $4';
            } else {
                sql += ' ORDER BY created_at_unix DESC, created_at DESC LIMIT $3';
            }
            const { rows } = await queryPostgres(sql, params);
            return (Array.isArray(rows) ? rows : [])
                .map((row) => ({
                    entryId: row.entry_id,
                    scopeChatId: row.scope_chat_id,
                    baseChatId: row.base_chat_id || null,
                    scopeModuleId: row.scope_module_id || null,
                    mode: row.mode || 'copilot',
                    role: normalizeRole(row.role),
                    content: String(row.content || ''),
                    assistantId: row.assistant_id || null,
                    userId: row.user_id || null,
                    userName: row.user_name || null,
                    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
                    createdAtUnix: Number(row.created_at_unix || 0) || null,
                    createdAt: row.created_at || null
                }))
                .reverse();
        } catch (error) {
            if (missingRelation(error)) return [];
            throw error;
        }
    }

    const store = await loadStore(cleanTenant);
    const items = Array.isArray(store.entriesByScope?.[safeScopeChatId])
        ? store.entriesByScope[safeScopeChatId]
        : [];
    const filtered = Number.isFinite(safeBefore) && safeBefore > 0
        ? items.filter((entry) => Number(entry?.createdAtUnix || 0) < safeBefore)
        : items;
    return filtered.slice(Math.max(0, filtered.length - safeLimit));
}

module.exports = {
    appendEntries,
    appendInteraction,
    listEntries
};
