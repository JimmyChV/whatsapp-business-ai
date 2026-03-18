const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

const STORE_FILE = 'assignment_rules.json';
const DEFAULT_ALLOWED_ROLES = ['seller', 'admin', 'owner'];
const VALID_MODES = new Set(['least_load', 'round_robin']);

let schemaReady = false;
let schemaPromise = null;

function resolveTenantId(input = null) {
    if (typeof input === 'string') return normalizeTenantId(input || DEFAULT_TENANT_ID);
    if (input && typeof input === 'object') return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    return DEFAULT_TENANT_ID;
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeScopeModuleId(value = '') {
    return toText(value).toLowerCase();
}

function normalizeMode(value = '') {
    const mode = toText(value).toLowerCase();
    if (VALID_MODES.has(mode)) return mode;
    return 'least_load';
}

function normalizeAllowedRoles(value = []) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const out = [];
    source.forEach((entry) => {
        const role = toText(entry).toLowerCase();
        if (!['seller', 'admin', 'owner'].includes(role)) return;
        if (seen.has(role)) return;
        seen.add(role);
        out.push(role);
    });
    return out.length > 0 ? out : [...DEFAULT_ALLOWED_ROLES];
}

function normalizeMaxOpenChats(value = null) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(1, Math.min(100000, Math.floor(parsed)));
}

function normalizeMetadata(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function normalizeRuleRecord(item = {}, { fallbackScopeModuleId = '' } = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const scopeModuleId = normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id || fallbackScopeModuleId || '');
    return {
        tenantId: resolveTenantId(source.tenantId || source.tenant_id || DEFAULT_TENANT_ID),
        scopeModuleId,
        enabled: source.enabled === true,
        mode: normalizeMode(source.mode || source.assignmentMode || source.assignment_mode || 'least_load'),
        allowedRoles: normalizeAllowedRoles(source.allowedRoles || source.allowed_roles || []),
        maxOpenChatsPerUser: normalizeMaxOpenChats(source.maxOpenChatsPerUser || source.max_open_chats_per_user),
        metadata: normalizeMetadata(source.metadata),
        updatedByUserId: toText(source.updatedByUserId || source.updated_by_user_id) || null,
        createdAt: toText(source.createdAt || source.created_at || new Date().toISOString()) || new Date().toISOString(),
        updatedAt: toText(source.updatedAt || source.updated_at || new Date().toISOString()) || new Date().toISOString()
    };
}

function normalizeStore(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const rules = Array.isArray(source.rules)
        ? source.rules.map((entry) => normalizeRuleRecord(entry)).filter((entry) => entry)
        : [];
    return { rules };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_assignment_rules (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                scope_module_id TEXT NOT NULL DEFAULT '',
                enabled BOOLEAN NOT NULL DEFAULT FALSE,
                mode TEXT NOT NULL DEFAULT 'least_load',
                allowed_roles TEXT[] NOT NULL DEFAULT ARRAY['seller','admin','owner']::text[],
                max_open_chats_per_user INTEGER NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, scope_module_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_assignment_rules_enabled
            ON tenant_assignment_rules(tenant_id, enabled, scope_module_id)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_assignment_rules_updated
            ON tenant_assignment_rules(tenant_id, updated_at DESC)
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

async function listRules(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = resolveTenantId(tenantId);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const items = store.rules
            .map((entry) => normalizeRuleRecord(entry, { fallbackScopeModuleId: entry.scopeModuleId || '' }))
            .map((entry) => ({ ...entry, tenantId: cleanTenantId }))
            .sort((a, b) => String(a.scopeModuleId || '').localeCompare(String(b.scopeModuleId || '')));
        return items;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT tenant_id, scope_module_id, enabled, mode, allowed_roles, max_open_chats_per_user,
                    metadata, updated_by_user_id, created_at, updated_at
               FROM tenant_assignment_rules
              WHERE tenant_id = $1
              ORDER BY scope_module_id ASC`,
            [cleanTenantId]
        );

        return (Array.isArray(result.rows) ? result.rows : []).map((row) => normalizeRuleRecord(row, {
            fallbackScopeModuleId: row.scope_module_id
        }));
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

async function getRule(tenantId = DEFAULT_TENANT_ID, scopeModuleId = '') {
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');
    const items = await listRules(tenantId);
    return items.find((entry) => String(entry.scopeModuleId || '') === cleanScopeModuleId) || null;
}

async function getEffectiveRule(tenantId = DEFAULT_TENANT_ID, scopeModuleId = '') {
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');
    const scoped = await getRule(tenantId, cleanScopeModuleId);
    if (scoped) {
        return {
            rule: scoped,
            sourceScopeModuleId: cleanScopeModuleId,
            inherited: false
        };
    }

    const global = await getRule(tenantId, '');
    if (!global) {
        return {
            rule: normalizeRuleRecord({ scopeModuleId: '', enabled: false, mode: 'least_load', allowedRoles: DEFAULT_ALLOWED_ROLES }, { fallbackScopeModuleId: '' }),
            sourceScopeModuleId: '',
            inherited: true
        };
    }

    return {
        rule: {
            ...global,
            scopeModuleId: cleanScopeModuleId
        },
        sourceScopeModuleId: '',
        inherited: cleanScopeModuleId !== ''
    };
}

async function upsertRule(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const source = payload && typeof payload === 'object' ? payload : {};
    const scopeModuleId = normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id || '');
    const now = new Date().toISOString();

    const next = normalizeRuleRecord({
        tenantId: cleanTenantId,
        scopeModuleId,
        enabled: source.enabled === true,
        mode: source.mode,
        allowedRoles: source.allowedRoles,
        maxOpenChatsPerUser: source.maxOpenChatsPerUser,
        metadata: source.metadata,
        updatedByUserId: source.updatedByUserId,
        createdAt: now,
        updatedAt: now
    }, { fallbackScopeModuleId: scopeModuleId });

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const index = store.rules.findIndex((entry) => normalizeScopeModuleId(entry.scopeModuleId || '') === scopeModuleId);
        const previous = index >= 0 ? normalizeRuleRecord(store.rules[index], { fallbackScopeModuleId: scopeModuleId }) : null;
        const createdAt = previous?.createdAt || now;
        const merged = {
            ...next,
            createdAt,
            updatedAt: now
        };

        if (index >= 0) store.rules[index] = merged;
        else store.rules.push(merged);

        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        return merged;
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO tenant_assignment_rules (
            tenant_id, scope_module_id, enabled, mode, allowed_roles, max_open_chats_per_user,
            metadata, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::text[], $6, $7::jsonb, $8, NOW(), NOW())
        ON CONFLICT (tenant_id, scope_module_id)
        DO UPDATE SET
            enabled = EXCLUDED.enabled,
            mode = EXCLUDED.mode,
            allowed_roles = EXCLUDED.allowed_roles,
            max_open_chats_per_user = EXCLUDED.max_open_chats_per_user,
            metadata = COALESCE(tenant_assignment_rules.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = NOW()`,
        [
            cleanTenantId,
            scopeModuleId,
            next.enabled,
            next.mode,
            next.allowedRoles,
            next.maxOpenChatsPerUser,
            JSON.stringify(next.metadata || {}),
            next.updatedByUserId
        ]
    );

    return getRule(cleanTenantId, scopeModuleId);
}

module.exports = {
    DEFAULT_ALLOWED_ROLES,
    listRules,
    getRule,
    getEffectiveRule,
    upsertRule
};