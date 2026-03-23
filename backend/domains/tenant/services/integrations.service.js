const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
const {
    maskSecret
} = require('../../security/services/meta-config-crypto.service');
const {
    ALLOWED_CATALOG_MODES_SET,
    DEFAULT_INTEGRATIONS,
    cloneDefaultIntegrations,
    isPlainObject,
    toBool,
    normalizeText,
    normalizePositiveInteger,
    normalizeCatalogMode,
    normalizeAiProvider,
    normalizeAiAssistantId,
    createUniqueAssistantId,
    createStableAssistantId,
    normalizeFloatInRange,
    normalizeColor,
    normalizeSecretForStorage,
    resolveSecretPlain
} = require('../helpers/integrations-normalizers.helpers');

const INTEGRATIONS_FILE_NAME = 'tenant_integrations.json';


function normalizeAiAssistantRecord(input = {}, existing = {}, {
    defaultProvider = 'openai',
    defaultModel = 'gpt-4o-mini',
    fallbackId = ''
} = {}) {
    const source = isPlainObject(input) ? input : {};
    const current = isPlainObject(existing) ? existing : {};

    const sourceAssistantId = normalizeAiAssistantId(source.assistantId || source.id || '');
    const currentAssistantId = normalizeAiAssistantId(current.assistantId || current.id || '');
    const fallbackAssistantId = normalizeAiAssistantId(fallbackId || '');
    const assistantId = sourceAssistantId || currentAssistantId || fallbackAssistantId;
    if (!assistantId) return null;

    const hasSourceAiApiKey = Object.prototype.hasOwnProperty.call(source, 'openaiApiKey');
    const openaiApiKey = normalizeSecretForStorage(
        hasSourceAiApiKey ? source.openaiApiKey : undefined,
        normalizeText(current.openaiApiKey)
    );

    const nowIso = new Date().toISOString();
    const createdAt = normalizeText(source.createdAt ?? current.createdAt) || nowIso;

    return {
        assistantId,
        name: normalizeText(source.name ?? current.name) || `Asistente ${assistantId.slice(-4)}`,
        description: normalizeText(source.description ?? current.description),
        provider: normalizeAiProvider(source.provider, normalizeAiProvider(current.provider, defaultProvider)),
        model: normalizeText(source.model ?? current.model) || defaultModel,
        systemPrompt: normalizeText(source.systemPrompt ?? current.systemPrompt),
        temperature: normalizeFloatInRange(source.temperature ?? current.temperature, 0.7, { min: 0, max: 2, decimals: 2 }),
        topP: normalizeFloatInRange(source.topP ?? current.topP, 1, { min: 0, max: 1, decimals: 2 }),
        maxTokens: normalizePositiveInteger(source.maxTokens ?? current.maxTokens, 800, { min: 64, max: 4096 }),
        openaiApiKey,
        isActive: toBool(source.isActive ?? current.isActive, true),
        isDefault: toBool(source.isDefault ?? current.isDefault, false),
        createdAt,
        updatedAt: nowIso
    };
}

function resolveDefaultAssistantId(assistants = [], preferredId = '') {
    const source = Array.isArray(assistants) ? assistants : [];
    if (!source.length) return null;

    const cleanPreferred = normalizeAiAssistantId(preferredId || '');
    if (cleanPreferred) {
        const preferredMatch = source.find((entry) => entry.assistantId === cleanPreferred && entry.isActive !== false);
        if (preferredMatch) return preferredMatch.assistantId;
        const preferredAny = source.find((entry) => entry.assistantId === cleanPreferred);
        if (preferredAny) return preferredAny.assistantId;
    }

    const activeDefault = source.find((entry) => entry.isDefault === true && entry.isActive !== false);
    if (activeDefault) return activeDefault.assistantId;

    const activeFirst = source.find((entry) => entry.isActive !== false);
    if (activeFirst) return activeFirst.assistantId;

    return source[0]?.assistantId || null;
}

function normalizeAssistantListForStorage(sourceAi = {}, currentAi = {}, {
    fallbackProvider = 'openai',
    fallbackModel = 'gpt-4o-mini',
    fallbackApiKey = null
} = {}) {
    const sourceAssistants = Array.isArray(sourceAi?.assistants) ? sourceAi.assistants : null;
    const currentAssistants = Array.isArray(currentAi?.assistants) ? currentAi.assistants : [];
    const working = sourceAssistants !== null ? sourceAssistants : currentAssistants;

    const currentById = new Map();
    currentAssistants.forEach((entry) => {
        const assistantId = normalizeAiAssistantId(entry?.assistantId || entry?.id || '');
        if (!assistantId) return;
        currentById.set(assistantId, entry);
    });

    const normalized = [];
    const seen = new Set();

    (Array.isArray(working) ? working : []).forEach((entry) => {
        const cleanId = normalizeAiAssistantId(entry?.assistantId || entry?.id || '');
        const existing = cleanId ? (currentById.get(cleanId) || {}) : {};
        const stableSeed = [
            String(entry?.assistantId || entry?.id || '').trim(),
            String(entry?.name || '').trim(),
            String(entry?.createdAt || '').trim(),
            String(entry?.updatedAt || '').trim(),
            String(normalized.length)
        ].join('|');
        const fallbackId = createStableAssistantId(stableSeed, [...currentById.keys(), ...seen]);
        const normalizedEntry = normalizeAiAssistantRecord(
            cleanId ? { ...entry, assistantId: cleanId } : entry,
            existing,
            {
                defaultProvider: fallbackProvider,
                defaultModel: fallbackModel,
                fallbackId
            }
        );
        if (!normalizedEntry) return;
        if (seen.has(normalizedEntry.assistantId)) return;
        seen.add(normalizedEntry.assistantId);
        normalized.push(normalizedEntry);
    });

    if (!normalized.length) {
        const preferredBootstrapId = normalizeAiAssistantId(sourceAi?.defaultAssistantId || currentAi?.defaultAssistantId || '');
        const bootstrapSeed = [
            String(sourceAi?.provider ?? currentAi?.provider ?? fallbackProvider),
            String(sourceAi?.model ?? currentAi?.model ?? fallbackModel),
            String(sourceAi?.name || ''),
            String(sourceAi?.description || ''),
            String(sourceAi?.systemPrompt || ''),
            String(sourceAi?.openaiApiKey ?? currentAi?.openaiApiKey ?? fallbackApiKey ?? '')
        ].join('|');
        const bootstrapId = preferredBootstrapId || createStableAssistantId(`bootstrap|${bootstrapSeed}`, []);
        const bootstrap = normalizeAiAssistantRecord({
            assistantId: bootstrapId,
            name: 'Asistente principal',
            provider: fallbackProvider,
            model: fallbackModel,
            openaiApiKey: fallbackApiKey,
            isActive: true,
            isDefault: true
        }, {}, {
            defaultProvider: fallbackProvider,
            defaultModel: fallbackModel,
            fallbackId: bootstrapId
        });
        if (bootstrap) normalized.push(bootstrap);
    }

    const hasSourceAssistants = sourceAssistants !== null;
    const hasSourceProvider = Object.prototype.hasOwnProperty.call(sourceAi || {}, 'provider');
    const hasSourceModel = Object.prototype.hasOwnProperty.call(sourceAi || {}, 'model');
    const hasSourceApiKey = Object.prototype.hasOwnProperty.call(sourceAi || {}, 'openaiApiKey');
    if (!hasSourceAssistants && normalized.length && (hasSourceProvider || hasSourceModel || hasSourceApiKey)) {
        const currentDefaultId = resolveDefaultAssistantId(normalized, sourceAi?.defaultAssistantId || currentAi?.defaultAssistantId || '');
        const targetId = normalizeAiAssistantId(currentDefaultId || normalized[0]?.assistantId || '');
        if (targetId) {
            const targetIndex = normalized.findIndex((entry) => entry.assistantId === targetId);
            if (targetIndex >= 0) {
                const target = normalized[targetIndex];
                normalized[targetIndex] = normalizeAiAssistantRecord({
                    ...target,
                    ...(hasSourceProvider ? { provider: sourceAi.provider } : {}),
                    ...(hasSourceModel ? { model: sourceAi.model } : {}),
                    ...(hasSourceApiKey ? { openaiApiKey: sourceAi.openaiApiKey } : {})
                }, target, {
                    defaultProvider: fallbackProvider,
                    defaultModel: fallbackModel,
                    fallbackId: target.assistantId
                }) || target;
            }
        }
    }

    const preferredDefault = normalizeAiAssistantId(sourceAi?.defaultAssistantId || currentAi?.defaultAssistantId || '');
    const resolvedDefaultId = resolveDefaultAssistantId(normalized, preferredDefault);

    const finalized = normalized.map((entry) => ({
        ...entry,
        isDefault: entry.assistantId === resolvedDefaultId
    }));

    return {
        assistants: finalized,
        defaultAssistantId: resolvedDefaultId || null
    };
}

function toPublicAssistantRecord(record = {}) {
    const source = isPlainObject(record) ? record : {};
    const assistantId = normalizeAiAssistantId(source.assistantId || source.id || '');
    if (!assistantId) return null;
    const apiKeyPlain = resolveSecretPlain(source.openaiApiKey);

    return {
        assistantId,
        name: normalizeText(source.name) || `Asistente ${assistantId.slice(-4)}`,
        description: normalizeText(source.description),
        provider: normalizeAiProvider(source.provider, 'openai'),
        model: normalizeText(source.model) || 'gpt-4o-mini',
        systemPrompt: normalizeText(source.systemPrompt),
        temperature: normalizeFloatInRange(source.temperature, 0.7, { min: 0, max: 2, decimals: 2 }),
        topP: normalizeFloatInRange(source.topP, 1, { min: 0, max: 1, decimals: 2 }),
        maxTokens: normalizePositiveInteger(source.maxTokens, 800, { min: 64, max: 4096 }),
        hasOpenAiApiKey: Boolean(source.openaiApiKey),
        openAiApiKeyMasked: apiKeyPlain ? maskSecret(apiKeyPlain) : null,
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        createdAt: normalizeText(source.createdAt),
        updatedAt: normalizeText(source.updatedAt)
    };
}

function toRuntimeAssistantRecord(record = {}) {
    const source = isPlainObject(record) ? record : {};
    const assistantId = normalizeAiAssistantId(source.assistantId || source.id || '');
    if (!assistantId) return null;

    return {
        assistantId,
        name: normalizeText(source.name) || `Asistente ${assistantId.slice(-4)}`,
        description: normalizeText(source.description),
        provider: normalizeAiProvider(source.provider, 'openai'),
        model: normalizeText(source.model) || 'gpt-4o-mini',
        systemPrompt: normalizeText(source.systemPrompt),
        temperature: normalizeFloatInRange(source.temperature, 0.7, { min: 0, max: 2, decimals: 2 }),
        topP: normalizeFloatInRange(source.topP, 1, { min: 0, max: 1, decimals: 2 }),
        maxTokens: normalizePositiveInteger(source.maxTokens, 800, { min: 64, max: 4096 }),
        openaiApiKey: resolveSecretPlain(source.openaiApiKey),
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        createdAt: normalizeText(source.createdAt),
        updatedAt: normalizeText(source.updatedAt)
    };
}

function pickRuntimeDefaultAssistant(assistants = [], fallbackId = '') {
    const source = Array.isArray(assistants) ? assistants : [];
    if (!source.length) return null;

    const cleanFallback = normalizeAiAssistantId(fallbackId || '');
    if (cleanFallback) {
        const fallbackMatch = source.find((entry) => entry.assistantId === cleanFallback && entry.isActive !== false);
        if (fallbackMatch) return fallbackMatch;
    }

    return source.find((entry) => entry.isDefault === true && entry.isActive !== false)
        || source.find((entry) => entry.isActive !== false)
        || source[0]
        || null;
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

    const assistantStorage = normalizeAssistantListForStorage(sourceAi, currentAi, {
        fallbackProvider: aiProvider,
        fallbackModel: aiModel,
        fallbackApiKey: aiApiKey
    });
    const defaultAssistant = pickRuntimeDefaultAssistant(assistantStorage.assistants, assistantStorage.defaultAssistantId || '');
    const aiProviderStored = normalizeAiProvider(defaultAssistant?.provider, aiProvider);
    const aiModelStored = normalizeText(defaultAssistant?.model) || aiModel;
    const aiApiKeyStored = normalizeText(defaultAssistant?.openaiApiKey) || aiApiKey || null;

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
            provider: aiProviderStored,
            model: aiModelStored,
            openaiApiKey: aiApiKeyStored,
            defaultAssistantId: assistantStorage.defaultAssistantId,
            assistants: assistantStorage.assistants
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

    const assistantItems = (Array.isArray(ai.assistants) ? ai.assistants : [])
        .map((entry) => toPublicAssistantRecord(entry))
        .filter(Boolean);
    const defaultAssistantId = resolveDefaultAssistantId(assistantItems, ai.defaultAssistantId || '');

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
            openAiApiKeyMasked: aiKeyPlain ? maskSecret(aiKeyPlain) : null,
            defaultAssistantId: defaultAssistantId || null,
            assistants: assistantItems
        },
        appearance: config.appearance,
        updatedAt: config.updatedAt || null
    };
}

function toRuntimeConfig(stored = {}) {
    const config = normalizeIntegrationsForStorage(stored, stored);
    const woo = config.catalog.providers.woocommerce;
    const ai = config.ai;

    const assistants = (Array.isArray(ai.assistants) ? ai.assistants : [])
        .map((entry) => toRuntimeAssistantRecord(entry))
        .filter(Boolean);
    const defaultAssistant = pickRuntimeDefaultAssistant(assistants, ai.defaultAssistantId || '');

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
            provider: defaultAssistant?.provider || ai.provider,
            model: defaultAssistant?.model || ai.model,
            openaiApiKey: defaultAssistant?.openaiApiKey || resolveSecretPlain(ai.openaiApiKey),
            defaultAssistantId: defaultAssistant?.assistantId || normalizeAiAssistantId(ai.defaultAssistantId || '') || null,
            assistants
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

async function listTenantAiAssistants(tenantId = DEFAULT_TENANT_ID) {
    const config = await getTenantIntegrations(tenantId, { runtime: false });
    const ai = isPlainObject(config?.ai) ? config.ai : {};
    return {
        defaultAssistantId: normalizeAiAssistantId(ai.defaultAssistantId || '') || null,
        items: Array.isArray(ai.assistants) ? ai.assistants : []
    };
}

async function createTenantAiAssistant(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const current = await loadStoredConfig(tenantId);
    const clean = normalizeIntegrationsForStorage(current, current);
    const aiCurrent = isPlainObject(clean.ai) ? clean.ai : {};
    const assistants = Array.isArray(aiCurrent.assistants) ? aiCurrent.assistants : [];

    const source = isPlainObject(payload) ? payload : {};
    const requestedId = normalizeAiAssistantId(source.assistantId || source.id || '');
    if (requestedId && assistants.some((entry) => normalizeAiAssistantId(entry?.assistantId || entry?.id || '') === requestedId)) {
        throw new Error('Ya existe un asistente IA con ese codigo.');
    }

    const assistantId = requestedId || createUniqueAssistantId(assistants);
    const created = normalizeAiAssistantRecord(
        {
            ...source,
            assistantId,
            isActive: source.isActive !== false
        },
        {},
        {
            defaultProvider: normalizeAiProvider(aiCurrent.provider, 'openai'),
            defaultModel: normalizeText(aiCurrent.model) || 'gpt-4o-mini',
            fallbackId: assistantId
        }
    );
    if (!created) {
        throw new Error('No se pudo crear el asistente IA.');
    }

    const nextAssistants = [...assistants, created];
    const previousDefaultId = normalizeAiAssistantId(aiCurrent.defaultAssistantId || '');
    const desiredDefaultId = source.isDefault === true
        ? assistantId
        : (previousDefaultId || assistantId);

    const next = normalizeIntegrationsForStorage(
        {
            ...clean,
            ai: {
                ...aiCurrent,
                assistants: nextAssistants,
                defaultAssistantId: desiredDefaultId
            }
        },
        clean
    );
    const saved = await saveStoredConfig(tenantId, next);
    const publicConfig = toPublicConfig(saved);
    const publicAi = isPlainObject(publicConfig?.ai) ? publicConfig.ai : {};
    const publicItems = Array.isArray(publicAi.assistants) ? publicAi.assistants : [];
    const item = publicItems.find((entry) => entry.assistantId === assistantId) || null;
    return {
        defaultAssistantId: normalizeAiAssistantId(publicAi.defaultAssistantId || '') || null,
        item
    };
}

async function updateTenantAiAssistant(tenantId = DEFAULT_TENANT_ID, assistantId = '', patch = {}) {
    const targetId = normalizeAiAssistantId(assistantId || '');
    if (!targetId) throw new Error('assistantId invalido.');

    const current = await loadStoredConfig(tenantId);
    const clean = normalizeIntegrationsForStorage(current, current);
    const aiCurrent = isPlainObject(clean.ai) ? clean.ai : {};
    const assistants = Array.isArray(aiCurrent.assistants) ? aiCurrent.assistants : [];
    const index = assistants.findIndex((entry) => normalizeAiAssistantId(entry?.assistantId || entry?.id || '') === targetId);
    if (index < 0) throw new Error('Asistente IA no encontrado.');

    const source = isPlainObject(patch) ? patch : {};
    const currentEntry = assistants[index];
    const updated = normalizeAiAssistantRecord(
        {
            ...currentEntry,
            ...source,
            assistantId: targetId
        },
        currentEntry,
        {
            defaultProvider: normalizeAiProvider(aiCurrent.provider, 'openai'),
            defaultModel: normalizeText(aiCurrent.model) || 'gpt-4o-mini',
            fallbackId: targetId
        }
    );
    if (!updated) throw new Error('No se pudo actualizar el asistente IA.');

    const nextAssistants = assistants.map((entry, itemIndex) => (itemIndex === index ? updated : entry));

    let desiredDefaultId = normalizeAiAssistantId(aiCurrent.defaultAssistantId || '');
    if (source.isDefault === true) desiredDefaultId = targetId;
    if (source.isDefault === false && desiredDefaultId === targetId) desiredDefaultId = '';
    if (updated.isActive === false && desiredDefaultId === targetId) desiredDefaultId = '';

    desiredDefaultId = resolveDefaultAssistantId(nextAssistants, desiredDefaultId || '') || null;

    const next = normalizeIntegrationsForStorage(
        {
            ...clean,
            ai: {
                ...aiCurrent,
                assistants: nextAssistants,
                defaultAssistantId: desiredDefaultId
            }
        },
        clean
    );

    const saved = await saveStoredConfig(tenantId, next);
    const publicConfig = toPublicConfig(saved);
    const publicAi = isPlainObject(publicConfig?.ai) ? publicConfig.ai : {};
    const publicItems = Array.isArray(publicAi.assistants) ? publicAi.assistants : [];
    const item = publicItems.find((entry) => entry.assistantId === targetId) || null;

    return {
        defaultAssistantId: normalizeAiAssistantId(publicAi.defaultAssistantId || '') || null,
        item
    };
}

async function deactivateTenantAiAssistant(tenantId = DEFAULT_TENANT_ID, assistantId = '') {
    return updateTenantAiAssistant(tenantId, assistantId, { isActive: false, isDefault: false });
}

async function setDefaultTenantAiAssistant(tenantId = DEFAULT_TENANT_ID, assistantId = '') {
    const targetId = normalizeAiAssistantId(assistantId || '');
    if (!targetId) throw new Error('assistantId invalido.');

    const current = await loadStoredConfig(tenantId);
    const clean = normalizeIntegrationsForStorage(current, current);
    const aiCurrent = isPlainObject(clean.ai) ? clean.ai : {};
    const assistants = Array.isArray(aiCurrent.assistants) ? aiCurrent.assistants : [];
    const target = assistants.find((entry) => normalizeAiAssistantId(entry?.assistantId || entry?.id || '') === targetId) || null;
    if (!target) throw new Error('Asistente IA no encontrado.');
    if (target.isActive === false) throw new Error('No se puede establecer como principal un asistente inactivo.');

    const next = normalizeIntegrationsForStorage(
        {
            ...clean,
            ai: {
                ...aiCurrent,
                defaultAssistantId: targetId,
                assistants
            }
        },
        clean
    );

    const saved = await saveStoredConfig(tenantId, next);
    const publicConfig = toPublicConfig(saved);
    const publicAi = isPlainObject(publicConfig?.ai) ? publicConfig.ai : {};

    return {
        defaultAssistantId: normalizeAiAssistantId(publicAi.defaultAssistantId || '') || null,
        item: (Array.isArray(publicAi.assistants) ? publicAi.assistants : []).find((entry) => entry.assistantId === targetId) || null
    };
}

module.exports = {
    ALLOWED_CATALOG_MODES: Array.from(ALLOWED_CATALOG_MODES_SET),
    DEFAULT_INTEGRATIONS,
    normalizeCatalogMode,
    normalizeAiAssistantId,
    getTenantIntegrations,
    updateTenantIntegrations,
    listTenantAiAssistants,
    createTenantAiAssistant,
    updateTenantAiAssistant,
    deactivateTenantAiAssistant,
    setDefaultTenantAiAssistant,
    toRuntimeConfig
};



