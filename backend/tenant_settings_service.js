const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

const SETTINGS_FILE_NAME = 'tenant_settings.json';
const ALLOWED_CATALOG_MODES = new Set(['hybrid', 'woo_only', 'local_only']);
const ALLOWED_TRANSPORT_LOCKS = new Set(['auto', 'webjs', 'cloud']);

const DEFAULT_SETTINGS = Object.freeze({
    catalogMode: String(process.env.SAAS_DEFAULT_CATALOG_MODE || 'hybrid').trim().toLowerCase() || 'hybrid',
    enabledModules: {
        aiPro: true,
        catalog: true,
        cart: true,
        quickReplies: true,
        locations: true
    },
    wa: {
        transportLock: 'auto'
    },
    updatedAt: null
});

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function toBool(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const raw = value.trim().toLowerCase();
        if (['true', 'yes', 'on'].includes(raw)) return true;
        if (['false', 'no', 'off'].includes(raw)) return false;
    }
    return fallback;
}

function deepMerge(base, patch) {
    if (!isPlainObject(base)) return patch;
    if (!isPlainObject(patch)) return base;
    const out = { ...base };
    for (const key of Object.keys(patch)) {
        const next = patch[key];
        if (isPlainObject(next) && isPlainObject(out[key])) {
            out[key] = deepMerge(out[key], next);
        } else {
            out[key] = next;
        }
    }
    return out;
}

function normalizeCatalogMode(value = '') {
    const mode = String(value || '').trim().toLowerCase();
    if (ALLOWED_CATALOG_MODES.has(mode)) return mode;
    const fallback = String(DEFAULT_SETTINGS.catalogMode || 'hybrid').trim().toLowerCase();
    return ALLOWED_CATALOG_MODES.has(fallback) ? fallback : 'hybrid';
}

function normalizeTransportLock(value = '') {
    const lock = String(value || '').trim().toLowerCase();
    if (ALLOWED_TRANSPORT_LOCKS.has(lock)) return lock;
    return 'auto';
}

function normalizeEnabledModules(value = {}) {
    const source = isPlainObject(value) ? value : {};
    const defaults = DEFAULT_SETTINGS.enabledModules;
    return {
        aiPro: toBool(source.aiPro, defaults.aiPro),
        catalog: toBool(source.catalog, defaults.catalog),
        cart: toBool(source.cart, defaults.cart),
        quickReplies: toBool(source.quickReplies, defaults.quickReplies),
        locations: toBool(source.locations, defaults.locations)
    };
}

function normalizeTenantSettings(input = {}) {
    const source = isPlainObject(input) ? input : {};
    return {
        catalogMode: normalizeCatalogMode(source.catalogMode),
        enabledModules: normalizeEnabledModules(source.enabledModules),
        wa: {
            transportLock: normalizeTransportLock(source?.wa?.transportLock)
        },
        updatedAt: source.updatedAt ? String(source.updatedAt) : null
    };
}

function resolveTenantId(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function parseTenantSettingsFromEnv() {
    const raw = String(process.env.SAAS_TENANT_SETTINGS_JSON || '').trim();
    if (!raw) return new Map();

    try {
        const parsed = JSON.parse(raw);
        const rows = Array.isArray(parsed) ? parsed : [];
        const out = new Map();
        rows.forEach((row) => {
            if (!isPlainObject(row)) return;
            const tenantId = resolveTenantId(row.tenantId || row.id || row.tenant);
            if (!tenantId) return;
            out.set(tenantId, normalizeTenantSettings(row.settings || row));
        });
        return out;
    } catch (error) {
        return new Map();
    }
}

const ENV_SETTINGS_MAP = parseTenantSettingsFromEnv();

function getEnvTenantSettings(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenant = resolveTenantId(tenantId);
    return ENV_SETTINGS_MAP.get(cleanTenant) || null;
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function getSettingsFromPostgres(tenantId) {
    try {
        const { rows } = await queryPostgres(
            `SELECT settings_json, updated_at
               FROM tenant_settings
              WHERE tenant_id = $1
              LIMIT 1`,
            [tenantId]
        );
        const row = rows?.[0] || null;
        if (!row) return null;
        return normalizeTenantSettings({
            ...(isPlainObject(row.settings_json) ? row.settings_json : {}),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        });
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function saveSettingsToPostgres(tenantId, settings = {}) {
    const clean = normalizeTenantSettings(settings);
    const payload = {
        catalogMode: clean.catalogMode,
        enabledModules: clean.enabledModules,
        wa: clean.wa
    };

    await queryPostgres(
        `INSERT INTO tenant_settings (tenant_id, settings_json, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (tenant_id)
         DO UPDATE SET
            settings_json = EXCLUDED.settings_json,
            updated_at = NOW()`,
        [tenantId, JSON.stringify(payload)]
    );

    return {
        ...clean,
        updatedAt: new Date().toISOString()
    };
}

async function getSettingsFromFile(tenantId) {
    const data = await readTenantJsonFile(SETTINGS_FILE_NAME, {
        tenantId,
        defaultValue: DEFAULT_SETTINGS
    });
    return normalizeTenantSettings(data);
}

async function saveSettingsToFile(tenantId, settings = {}) {
    const clean = normalizeTenantSettings(settings);
    const next = {
        ...clean,
        updatedAt: new Date().toISOString()
    };
    await writeTenantJsonFile(SETTINGS_FILE_NAME, next, { tenantId });
    return next;
}

async function getTenantSettings(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenant = resolveTenantId(tenantId);
    const fromEnv = getEnvTenantSettings(cleanTenant);

    let persisted = null;
    if (getStorageDriver() === 'postgres') {
        persisted = await getSettingsFromPostgres(cleanTenant);
    } else {
        persisted = await getSettingsFromFile(cleanTenant);
    }

    const persistedHasRealOverride = Boolean(persisted?.updatedAt);
    const mergedSource = persistedHasRealOverride
        ? deepMerge(DEFAULT_SETTINGS, deepMerge(fromEnv || {}, persisted || {}))
        : deepMerge(DEFAULT_SETTINGS, deepMerge(persisted || {}, fromEnv || {}));
    const merged = normalizeTenantSettings(mergedSource);
    return {
        ...merged,
        updatedAt: persisted?.updatedAt || null
    };
}

async function updateTenantSettings(tenantId = DEFAULT_TENANT_ID, patch = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const current = await getTenantSettings(cleanTenant);
    const merged = normalizeTenantSettings(deepMerge(current, patch));

    if (getStorageDriver() === 'postgres') {
        return saveSettingsToPostgres(cleanTenant, merged);
    }

    return saveSettingsToFile(cleanTenant, merged);
}

module.exports = {
    ALLOWED_CATALOG_MODES: Array.from(ALLOWED_CATALOG_MODES),
    ALLOWED_TRANSPORT_LOCKS: Array.from(ALLOWED_TRANSPORT_LOCKS),
    DEFAULT_SETTINGS,
    getTenantSettings,
    updateTenantSettings,
    normalizeTenantSettings,
    normalizeCatalogMode
};

