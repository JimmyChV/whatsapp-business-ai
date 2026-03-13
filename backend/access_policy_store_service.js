const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

const ACCESS_CATALOG_FILE = 'saas_access_catalog.json';
const GLOBAL_SCOPE = 'global';

let cachedOverrides = null;
let ensurePromise = null;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOverrides(input = {}) {
    const source = isPlainObject(input) ? input : {};
    const permissionLabels = isPlainObject(source.permissionLabels) ? source.permissionLabels : {};
    const permissionPacks = isPlainObject(source.permissionPacks) ? source.permissionPacks : {};
    const roleProfiles = isPlainObject(source.roleProfiles) ? source.roleProfiles : {};

    return {
        permissionLabels: { ...permissionLabels },
        permissionPacks: { ...permissionPacks },
        roleProfiles: { ...roleProfiles },
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

async function ensurePostgresSchema() {
    await queryPostgres(
        `CREATE TABLE IF NOT EXISTS saas_access_catalog (
            scope TEXT PRIMARY KEY,
            catalog_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
    );
}

async function loadOverridesFromPostgres() {
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `SELECT catalog_json
           FROM saas_access_catalog
          WHERE scope = $1
          LIMIT 1`,
        [GLOBAL_SCOPE]
    );
    const row = rows?.[0] || null;
    if (!row || !isPlainObject(row.catalog_json)) return normalizeOverrides({});
    return normalizeOverrides(row.catalog_json);
}

async function saveOverridesToPostgres(overrides = {}) {
    await ensurePostgresSchema();
    const safe = normalizeOverrides(overrides);
    safe.updatedAt = new Date().toISOString();

    await queryPostgres(
        `INSERT INTO saas_access_catalog (scope, catalog_json, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (scope)
         DO UPDATE SET
            catalog_json = EXCLUDED.catalog_json,
            updated_at = NOW()`,
        [GLOBAL_SCOPE, JSON.stringify(safe)]
    );

    return safe;
}

async function loadOverridesFromFile() {
    const parsed = await readTenantJsonFile(ACCESS_CATALOG_FILE, {
        tenantId: DEFAULT_TENANT_ID,
        defaultValue: {}
    });
    return normalizeOverrides(parsed);
}

async function saveOverridesToFile(overrides = {}) {
    const safe = normalizeOverrides(overrides);
    safe.updatedAt = new Date().toISOString();
    await writeTenantJsonFile(ACCESS_CATALOG_FILE, safe, {
        tenantId: DEFAULT_TENANT_ID
    });
    return safe;
}

async function loadOverrides() {
    if (getStorageDriver() === 'postgres') {
        return loadOverridesFromPostgres();
    }
    return loadOverridesFromFile();
}

async function saveOverrides(overrides = {}) {
    if (getStorageDriver() === 'postgres') {
        return saveOverridesToPostgres(overrides);
    }
    return saveOverridesToFile(overrides);
}

async function ensureLoaded() {
    if (cachedOverrides) return cachedOverrides;
    if (ensurePromise) return ensurePromise;

    ensurePromise = (async () => {
        try {
            cachedOverrides = await loadOverrides();
        } catch (_) {
            cachedOverrides = normalizeOverrides({});
        } finally {
            ensurePromise = null;
        }
        return cachedOverrides;
    })();

    return ensurePromise;
}

function getOverridesSync() {
    if (!cachedOverrides) {
        cachedOverrides = normalizeOverrides({});
    }
    return cachedOverrides;
}

async function setOverrides(nextOverrides = {}) {
    const safe = normalizeOverrides(nextOverrides);
    cachedOverrides = await saveOverrides(safe);
    return cachedOverrides;
}

async function updateOverrides(mutator) {
    const current = normalizeOverrides(await ensureLoaded());
    const nextValue = typeof mutator === 'function' ? mutator(current) : current;
    return setOverrides(nextValue);
}

module.exports = {
    ensureLoaded,
    getOverridesSync,
    setOverrides,
    updateOverrides,
    normalizeOverrides
};

