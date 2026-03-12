const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');
const {
    encryptSecret,
    decryptSecret,
    maskSecret,
    isEncryptedValue
} = require('./meta_config_crypto');

const INTEGRATIONS_FILE_NAME = 'tenant_integrations.json';
const ALLOWED_CATALOG_MODES = new Set(['hybrid', 'meta_only', 'woo_only', 'local_only']);
const ALLOWED_AI_PROVIDERS = new Set(['openai']);

const DEFAULT_INTEGRATIONS = Object.freeze({
    catalog: {
        mode: 'hybrid',
        providers: {
            meta: { enabled: true },
            woocommerce: {
                enabled: true,
                baseUrl: null,
                perPage: 100,
                maxPages: 10,
                includeOutOfStock: true,
                consumerKey: null,
                consumerSecret: null
            },
            local: { enabled: true }
        }
    },
    ai: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        openaiApiKey: null
    },
    appearance: {
        brandName: null,
        primaryColor: '#12d2a6',
        secondaryColor: '#0b1f2e',
        accentColor: '#1ea7ff',
        surfaceColor: '#102433',
        backgroundColor: '#061520'
    },
    updatedAt: null
});

function cloneDefaultIntegrations() {
    return JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS));
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toBool(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const text = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(text)) return true;
        if (['false', '0', 'no', 'off'].includes(text)) return false;
    }
    return Boolean(fallback);
}

function normalizeText(value = '') {
    const text = String(value || '').trim();
    return text || null;
}

function normalizePositiveInteger(value, fallback = 1, { min = 1, max = 1000 } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.floor(parsed);
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
}

function normalizeCatalogMode(value = '', fallback = 'hybrid') {
    const mode = String(value || '').trim().toLowerCase();
    if (ALLOWED_CATALOG_MODES.has(mode)) return mode;
    return ALLOWED_CATALOG_MODES.has(fallback) ? fallback : 'hybrid';
}

function normalizeAiProvider(value = '', fallback = 'openai') {
    const provider = String(value || '').trim().toLowerCase();
    if (ALLOWED_AI_PROVIDERS.has(provider)) return provider;
    return ALLOWED_AI_PROVIDERS.has(fallback) ? fallback : 'openai';
}

function normalizeColor(value = '', fallback = '#12d2a6') {
    const text = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
    return fallback;
}

function normalizeSecretForStorage(value, fallback = null) {
    if (value === undefined) return fallback;
    if (value === null) return null;
    const text = String(value || '').trim();
    if (!text) return null;
    if (isEncryptedValue(text)) return text;
    return encryptSecret(text);
}

function resolveSecretPlain(value = '') {
    const text = String(value || '').trim();
    if (!text) return null;
    const plain = decryptSecret(text);
    const out = String(plain || '').trim();
    return out || null;
}

function normalizeIntegrationsForStorage(input = {}, existing = {}) {
    const source = isPlainObject(input) ? input : {};
    const current = isPlainObject(existing) ? existing : {};
    const defaults = cloneDefaultIntegrations();

    const sourceCatalog = isPlainObject(source.catalog) ? source.catalog : {};
    const sourceProviders = isPlainObject(sourceCatalog.providers) ? sourceCatalog.providers : {};
    const sourceWoo = isPlainObject(sourceProviders.woocommerce) ? sourceProviders.woocommerce : {};

    const currentCatalog = isPlainObject(current.catalog) ? current.catalog : {};
    const currentProviders = isPlainObject(currentCatalog.providers) ? currentCatalog.providers : {};
    const currentWoo = isPlainObject(currentProviders.woocommerce) ? currentProviders.woocommerce : {};

    const sourceAi = isPlainObject(source.ai) ? source.ai : {};
    const currentAi = isPlainObject(current.ai) ? current.ai : {};

    const sourceAppearance = isPlainObject(source.appearance) ? source.appearance : {};
    const currentAppearance = isPlainObject(current.appearance) ? current.appearance : {};

    const catalogMode = normalizeCatalogMode(
        sourceCatalog.mode ?? source.catalogMode,
        normalizeCatalogMode(currentCatalog.mode ?? current.catalogMode, defaults.catalog.mode)
    );

    const providerMetaEnabled = toBool(
        sourceProviders?.meta?.enabled,
        toBool(currentProviders?.meta?.enabled, defaults.catalog.providers.meta.enabled)
    );
    const providerWooEnabled = toBool(
        sourceProviders?.woocommerce?.enabled,
        toBool(currentProviders?.woocommerce?.enabled, defaults.catalog.providers.woocommerce.enabled)
    );
    const providerLocalEnabled = toBool(
        sourceProviders?.local?.enabled,
        toBool(currentProviders?.local?.enabled, defaults.catalog.providers.local.enabled)
    );

    const wooBaseUrl = normalizeText(sourceWoo.baseUrl ?? currentWoo.baseUrl);
    const wooPerPage = normalizePositiveInteger(
        sourceWoo.perPage ?? currentWoo.perPage,
        defaults.catalog.providers.woocommerce.perPage,
        { min: 10, max: 500 }
    );
    const wooMaxPages = normalizePositiveInteger(
        sourceWoo.maxPages ?? currentWoo.maxPages,
        defaults.catalog.providers.woocommerce.maxPages,
        { min: 1, max: 200 }
    );
    const wooIncludeOutOfStock = toBool(
        sourceWoo.includeOutOfStock ?? currentWoo.includeOutOfStock,
        defaults.catalog.providers.woocommerce.includeOutOfStock
    );

    const hasSourceWooConsumerKey = Object.prototype.hasOwnProperty.call(sourceWoo, 'consumerKey');
    const hasSourceWooConsumerSecret = Object.prototype.hasOwnProperty.call(sourceWoo, 'consumerSecret');
    const wooConsumerKey = normalizeSecretForStorage(
        hasSourceWooConsumerKey ? sourceWoo.consumerKey : undefined,
        normalizeText(currentWoo.consumerKey)
    );
    const wooConsumerSecret = normalizeSecretForStorage(
        hasSourceWooConsumerSecret ? sourceWoo.consumerSecret : undefined,
        normalizeText(currentWoo.consumerSecret)
    );

    const aiProvider = normalizeAiProvider(
        sourceAi.provider,
        normalizeAiProvider(currentAi.provider, defaults.ai.provider)
    );
    const aiModel = normalizeText(sourceAi.model ?? currentAi.model) || defaults.ai.model;
    const hasSourceAiApiKey = Object.prototype.hasOwnProperty.call(sourceAi, 'openaiApiKey');
    const aiApiKey = normalizeSecretForStorage(
        hasSourceAiApiKey ? sourceAi.openaiApiKey : undefined,
        normalizeText(currentAi.openaiApiKey)
    );

    const appearance = {
        brandName: normalizeText(sourceAppearance.brandName ?? currentAppearance.brandName),
        primaryColor: normalizeColor(sourceAppearance.primaryColor ?? currentAppearance.primaryColor, defaults.appearance.primaryColor),
        secondaryColor: normalizeColor(sourceAppearance.secondaryColor ?? currentAppearance.secondaryColor, defaults.appearance.secondaryColor),
        accentColor: normalizeColor(sourceAppearance.accentColor ?? currentAppearance.accentColor, defaults.appearance.accentColor),
        surfaceColor: normalizeColor(sourceAppearance.surfaceColor ?? currentAppearance.surfaceColor, defaults.appearance.surfaceColor),
        backgroundColor: normalizeColor(sourceAppearance.backgroundColor ?? currentAppearance.backgroundColor, defaults.appearance.backgroundColor)
    };

    return {
        catalog: {
            mode: catalogMode,
            providers: {
                meta: { enabled: providerMetaEnabled },
                woocommerce: {
                    enabled: providerWooEnabled,
                    baseUrl: wooBaseUrl,
                    perPage: wooPerPage,
                    maxPages: wooMaxPages,
                    includeOutOfStock: wooIncludeOutOfStock,
                    consumerKey: wooConsumerKey,
                    consumerSecret: wooConsumerSecret
                },
                local: { enabled: providerLocalEnabled }
            }
        },
        ai: {
            provider: aiProvider,
            model: aiModel,
            openaiApiKey: aiApiKey
        },
        appearance,
        updatedAt: normalizeText(source.updatedAt ?? current.updatedAt)
    };
}

function toPublicConfig(stored = {}) {
    const config = normalizeIntegrationsForStorage(stored, stored);
    const woo = config.catalog.providers.woocommerce;
    const ai = config.ai;

    const wooKeyPlain = resolveSecretPlain(woo.consumerKey);
    const wooSecretPlain = resolveSecretPlain(woo.consumerSecret);
    const aiKeyPlain = resolveSecretPlain(ai.openaiApiKey);

    return {
        catalog: {
            mode: config.catalog.mode,
            providers: {
                meta: { enabled: config.catalog.providers.meta.enabled },
                woocommerce: {
                    enabled: woo.enabled,
                    baseUrl: woo.baseUrl,
                    perPage: woo.perPage,
                    maxPages: woo.maxPages,
                    includeOutOfStock: woo.includeOutOfStock,
                    hasConsumerKey: Boolean(woo.consumerKey),
                    hasConsumerSecret: Boolean(woo.consumerSecret),
                    consumerKeyMasked: wooKeyPlain ? maskSecret(wooKeyPlain) : null,
                    consumerSecretMasked: wooSecretPlain ? maskSecret(wooSecretPlain) : null
                },
                local: { enabled: config.catalog.providers.local.enabled }
            }
        },
        ai: {
            provider: ai.provider,
            model: ai.model,
            hasOpenAiApiKey: Boolean(ai.openaiApiKey),
            openAiApiKeyMasked: aiKeyPlain ? maskSecret(aiKeyPlain) : null
        },
        appearance: config.appearance,
        updatedAt: config.updatedAt || null
    };
}

function toRuntimeConfig(stored = {}) {
    const config = normalizeIntegrationsForStorage(stored, stored);
    const woo = config.catalog.providers.woocommerce;
    const ai = config.ai;

    return {
        catalog: {
            mode: config.catalog.mode,
            providers: {
                meta: { enabled: config.catalog.providers.meta.enabled },
                woocommerce: {
                    enabled: woo.enabled,
                    baseUrl: woo.baseUrl,
                    perPage: woo.perPage,
                    maxPages: woo.maxPages,
                    includeOutOfStock: woo.includeOutOfStock,
                    consumerKey: resolveSecretPlain(woo.consumerKey),
                    consumerSecret: resolveSecretPlain(woo.consumerSecret)
                },
                local: { enabled: config.catalog.providers.local.enabled }
            }
        },
        ai: {
            provider: ai.provider,
            model: ai.model,
            openaiApiKey: resolveSecretPlain(ai.openaiApiKey)
        },
        appearance: config.appearance,
        updatedAt: config.updatedAt || null
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    await queryPostgres(
        `CREATE TABLE IF NOT EXISTS tenant_integrations (
            tenant_id TEXT PRIMARY KEY,
            config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
    );
}

async function loadFromPostgres(tenantId = DEFAULT_TENANT_ID) {
    try {
        await ensurePostgresSchema();
        const { rows } = await queryPostgres(
            `SELECT config_json, updated_at
               FROM tenant_integrations
              WHERE tenant_id = $1
              LIMIT 1`,
            [tenantId]
        );
        const row = rows?.[0] || null;
        if (!row) return null;
        return normalizeIntegrationsForStorage(
            {
                ...(isPlainObject(row.config_json) ? row.config_json : {}),
                updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
            },
            row.config_json
        );
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function saveToPostgres(tenantId = DEFAULT_TENANT_ID, stored = {}) {
    const clean = normalizeIntegrationsForStorage(stored, stored);
    const payload = {
        catalog: clean.catalog,
        ai: clean.ai,
        appearance: clean.appearance
    };
    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO tenant_integrations (tenant_id, config_json, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (tenant_id)
         DO UPDATE SET
            config_json = EXCLUDED.config_json,
            updated_at = NOW()`,
        [tenantId, JSON.stringify(payload)]
    );
    return {
        ...clean,
        updatedAt: new Date().toISOString()
    };
}

async function loadFromFile(tenantId = DEFAULT_TENANT_ID) {
    const data = await readTenantJsonFile(INTEGRATIONS_FILE_NAME, {
        tenantId,
        defaultValue: cloneDefaultIntegrations
    });
    return normalizeIntegrationsForStorage(data, data);
}

async function saveToFile(tenantId = DEFAULT_TENANT_ID, stored = {}) {
    const clean = normalizeIntegrationsForStorage(stored, stored);
    const next = {
        ...clean,
        updatedAt: new Date().toISOString()
    };
    await writeTenantJsonFile(INTEGRATIONS_FILE_NAME, next, { tenantId });
    return next;
}

async function loadStoredConfig(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        const persisted = await loadFromPostgres(cleanTenantId);
        if (persisted) return persisted;
        return normalizeIntegrationsForStorage(cloneDefaultIntegrations(), {});
    }
    return loadFromFile(cleanTenantId);
}

async function saveStoredConfig(tenantId = DEFAULT_TENANT_ID, stored = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        return saveToPostgres(cleanTenantId, stored);
    }
    return saveToFile(cleanTenantId, stored);
}

async function getTenantIntegrations(tenantId = DEFAULT_TENANT_ID, { runtime = false } = {}) {
    const stored = await loadStoredConfig(tenantId);
    return runtime ? toRuntimeConfig(stored) : toPublicConfig(stored);
}

async function updateTenantIntegrations(tenantId = DEFAULT_TENANT_ID, patch = {}) {
    const current = await loadStoredConfig(tenantId);
    const next = normalizeIntegrationsForStorage(patch, current);
    const saved = await saveStoredConfig(tenantId, next);
    return toPublicConfig(saved);
}

module.exports = {
    ALLOWED_CATALOG_MODES: Array.from(ALLOWED_CATALOG_MODES),
    DEFAULT_INTEGRATIONS,
    normalizeCatalogMode,
    getTenantIntegrations,
    updateTenantIntegrations,
    toRuntimeConfig
};
