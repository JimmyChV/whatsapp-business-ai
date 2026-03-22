const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const AI_USAGE_FILE = 'ai_usage.json';
const MAX_MONTHS = 24;
let postgresSchemaReadyPromise = null;

function resolveTenantId(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function currentMonthKey() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function normalizeStore(store = {}) {
    const safe = store && typeof store === 'object' ? store : {};
    const counters = safe.counters && typeof safe.counters === 'object' ? safe.counters : {};
    return {
        counters
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

function buildMissingTableError() {
    return new Error('Tabla tenant_ai_usage no encontrada. Ejecuta migration 012_control_plane_hardening.sql.');
}

async function ensurePostgresSchema() {
    if (postgresSchemaReadyPromise) return postgresSchemaReadyPromise;

    postgresSchemaReadyPromise = (async () => {
        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS tenant_ai_usage (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                month_key TEXT NOT NULL,
                requests BIGINT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, month_key)
            )`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_tenant_updated
             ON tenant_ai_usage(tenant_id, updated_at DESC)`
        );
    })();

    try {
        await postgresSchemaReadyPromise;
    } catch (error) {
        postgresSchemaReadyPromise = null;
        throw error;
    }
}

async function loadStore(tenantId) {
    const parsed = await readTenantJsonFile(AI_USAGE_FILE, {
        tenantId,
        defaultValue: { counters: {} }
    });
    return normalizeStore(parsed);
}

async function saveStore(tenantId, store) {
    const safe = normalizeStore(store);
    await writeTenantJsonFile(AI_USAGE_FILE, safe, { tenantId });
}

async function getMonthlyUsageFromFile(tenantId = DEFAULT_TENANT_ID, monthKey = currentMonthKey()) {
    const cleanTenant = resolveTenantId(tenantId);
    const key = String(monthKey || currentMonthKey()).trim() || currentMonthKey();
    const store = await loadStore(cleanTenant);
    const value = Number(store.counters?.[key] || 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

async function incrementMonthlyUsageFromFile(tenantId = DEFAULT_TENANT_ID, {
    monthKey = currentMonthKey(),
    incrementBy = 1
} = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const key = String(monthKey || currentMonthKey()).trim() || currentMonthKey();
    const inc = Number(incrementBy);
    const safeInc = Number.isFinite(inc) && inc > 0 ? Math.floor(inc) : 1;

    const store = await loadStore(cleanTenant);
    const current = Number(store.counters?.[key] || 0);
    const next = (Number.isFinite(current) ? Math.floor(current) : 0) + safeInc;
    store.counters[key] = next;

    const keys = Object.keys(store.counters || {}).sort();
    if (keys.length > MAX_MONTHS) {
        const toDrop = keys.slice(0, keys.length - MAX_MONTHS);
        toDrop.forEach((oldKey) => {
            delete store.counters[oldKey];
        });
    }

    await saveStore(cleanTenant, store);
    return next;
}

async function getMonthlyUsageFromPostgres(tenantId = DEFAULT_TENANT_ID, monthKey = currentMonthKey()) {
    const cleanTenant = resolveTenantId(tenantId);
    const key = String(monthKey || currentMonthKey()).trim() || currentMonthKey();

    try {
        await ensurePostgresSchema();
        const { rows } = await queryPostgres(
            `SELECT requests
               FROM tenant_ai_usage
              WHERE tenant_id = $1
                AND month_key = $2
              LIMIT 1`,
            [cleanTenant, key]
        );
        const value = Number(rows?.[0]?.requests || 0);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (error) {
        if (missingRelation(error)) throw buildMissingTableError();
        throw error;
    }
}

async function incrementMonthlyUsageFromPostgres(tenantId = DEFAULT_TENANT_ID, {
    monthKey = currentMonthKey(),
    incrementBy = 1
} = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const key = String(monthKey || currentMonthKey()).trim() || currentMonthKey();
    const inc = Number(incrementBy);
    const safeInc = Number.isFinite(inc) && inc > 0 ? Math.floor(inc) : 1;

    try {
        await ensurePostgresSchema();
        await queryPostgres('BEGIN');
        const upsert = await queryPostgres(
            `INSERT INTO tenant_ai_usage (tenant_id, month_key, requests, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             ON CONFLICT (tenant_id, month_key)
             DO UPDATE SET
                requests = tenant_ai_usage.requests + EXCLUDED.requests,
                updated_at = NOW()
             RETURNING requests`,
            [cleanTenant, key, safeInc]
        );

        await queryPostgres(
            `DELETE FROM tenant_ai_usage
              WHERE tenant_id = $1
                AND month_key NOT IN (
                    SELECT month_key
                      FROM tenant_ai_usage
                     WHERE tenant_id = $1
                     ORDER BY month_key DESC
                     LIMIT $2
                )`,
            [cleanTenant, MAX_MONTHS]
        );

        await queryPostgres('COMMIT');

        const value = Number(upsert?.rows?.[0]?.requests || 0);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (error) {
        try {
            await queryPostgres('ROLLBACK');
        } catch (_) {
            // no-op
        }
        if (missingRelation(error)) throw buildMissingTableError();
        throw error;
    }
}

async function getMonthlyUsage(tenantId = DEFAULT_TENANT_ID, monthKey = currentMonthKey()) {
    if (getStorageDriver() === 'postgres') {
        return getMonthlyUsageFromPostgres(tenantId, monthKey);
    }
    return getMonthlyUsageFromFile(tenantId, monthKey);
}

async function incrementMonthlyUsage(tenantId = DEFAULT_TENANT_ID, options = {}) {
    if (getStorageDriver() === 'postgres') {
        return incrementMonthlyUsageFromPostgres(tenantId, options);
    }
    return incrementMonthlyUsageFromFile(tenantId, options);
}

module.exports = {
    currentMonthKey,
    getMonthlyUsage,
    incrementMonthlyUsage
};



