const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
const planLimitsService = require('./plan-limits.service');

const PLAN_LIMITS_FILE_NAME = 'saas_plan_limits.json';
const GLOBAL_SCOPE = 'global';

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    await queryPostgres(
        `CREATE TABLE IF NOT EXISTS saas_plan_limits (
            scope TEXT PRIMARY KEY,
            limits_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
    );
}

async function loadOverridesFromPostgres() {
    try {
        await ensurePostgresSchema();
        const { rows } = await queryPostgres(
            `SELECT limits_json
               FROM saas_plan_limits
              WHERE scope = $1
              LIMIT 1`,
            [GLOBAL_SCOPE]
        );
        const row = rows?.[0] || null;
        if (!row || !isPlainObject(row.limits_json)) return {};
        return row.limits_json;
    } catch (error) {
        if (missingRelation(error)) return {};
        throw error;
    }
}

async function saveOverridesToPostgres(overrides = {}) {
    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO saas_plan_limits (scope, limits_json, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (scope)
         DO UPDATE SET
            limits_json = EXCLUDED.limits_json,
            updated_at = NOW()`,
        [GLOBAL_SCOPE, JSON.stringify(isPlainObject(overrides) ? overrides : {})]
    );
}

async function loadOverridesFromFile() {
    return readTenantJsonFile(PLAN_LIMITS_FILE_NAME, {
        tenantId: DEFAULT_TENANT_ID,
        defaultValue: {}
    });
}

async function saveOverridesToFile(overrides = {}) {
    await writeTenantJsonFile(PLAN_LIMITS_FILE_NAME, isPlainObject(overrides) ? overrides : {}, {
        tenantId: DEFAULT_TENANT_ID
    });
}

async function loadOverrides() {
    if (getStorageDriver() === 'postgres') {
        return loadOverridesFromPostgres();
    }
    return loadOverridesFromFile();
}

async function saveOverrides(overrides = {}) {
    if (getStorageDriver() === 'postgres') {
        await saveOverridesToPostgres(overrides);
        return;
    }
    await saveOverridesToFile(overrides);
}

async function initializePlanLimits() {
    const overrides = await loadOverrides();
    if (isPlainObject(overrides) && Object.keys(overrides).length > 0) {
        planLimitsService.setPlanOverrides(overrides);
    }
    return planLimitsService.getPlanOverrides();
}

module.exports = {
    loadOverrides,
    saveOverrides,
    initializePlanLimits
};


