const DEFAULT_PLAN = 'starter';

const DEFAULT_LIMITS = {
    starter: {
        maxUsers: 3,
        maxCatalogItems: 120,
        maxMonthlyAiRequests: 500,
        maxActiveSessions: 1,
        features: {
            aiPro: true,
            catalog: true,
            cart: true,
            quickReplies: true,
            audit: false,
            opsPanel: false
        }
    },
    pro: {
        maxUsers: 15,
        maxCatalogItems: 1000,
        maxMonthlyAiRequests: 5000,
        maxActiveSessions: 3,
        features: {
            aiPro: true,
            catalog: true,
            cart: true,
            quickReplies: true,
            audit: true,
            opsPanel: true
        }
    },
    enterprise: {
        maxUsers: 100,
        maxCatalogItems: 10000,
        maxMonthlyAiRequests: 50000,
        maxActiveSessions: 10,
        features: {
            aiPro: true,
            catalog: true,
            cart: true,
            quickReplies: true,
            audit: true,
            opsPanel: true
        }
    }
};

function normalizePositiveInteger(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function normalizeFeatures(value, fallback = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const out = { ...fallback };
    for (const [key, featureValue] of Object.entries(source)) {
        out[String(key || '').trim()] = featureValue !== false;
    }
    return out;
}

function normalizePlanLimits(raw = {}, fallback = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        maxUsers: normalizePositiveInteger(source.maxUsers, normalizePositiveInteger(fallback.maxUsers, 3)),
        maxCatalogItems: normalizePositiveInteger(source.maxCatalogItems, normalizePositiveInteger(fallback.maxCatalogItems, 120)),
        maxMonthlyAiRequests: normalizePositiveInteger(source.maxMonthlyAiRequests, normalizePositiveInteger(fallback.maxMonthlyAiRequests, 500)),
        maxActiveSessions: normalizePositiveInteger(source.maxActiveSessions, normalizePositiveInteger(fallback.maxActiveSessions, 1)),
        features: normalizeFeatures(source.features, fallback.features || {})
    };
}

function parseOverridesFromEnv() {
    const raw = String(process.env.SAAS_PLAN_LIMITS_JSON || '').trim();
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch (_) {
        return {};
    }
}

function getMergedMatrix() {
    const overrides = parseOverridesFromEnv();
    const matrix = {};
    const keys = new Set([...Object.keys(DEFAULT_LIMITS), ...Object.keys(overrides || {})]);

    keys.forEach((planName) => {
        const key = String(planName || '').trim().toLowerCase();
        if (!key) return;
        matrix[key] = normalizePlanLimits(overrides?.[planName], DEFAULT_LIMITS[key] || DEFAULT_LIMITS[DEFAULT_PLAN]);
    });

    if (!matrix[DEFAULT_PLAN]) {
        matrix[DEFAULT_PLAN] = normalizePlanLimits({}, DEFAULT_LIMITS[DEFAULT_PLAN]);
    }
    return matrix;
}

function getPlanLimits(plan = DEFAULT_PLAN) {
    const cleanPlan = String(plan || DEFAULT_PLAN).trim().toLowerCase() || DEFAULT_PLAN;
    const matrix = getMergedMatrix();
    return matrix[cleanPlan] || matrix[DEFAULT_PLAN];
}

function getTenantPlanLimits(tenant = {}) {
    const plan = String(tenant?.plan || DEFAULT_PLAN).trim().toLowerCase() || DEFAULT_PLAN;
    return getPlanLimits(plan);
}

function isFeatureEnabledForTenant(featureKey = '', tenant = {}, tenantSettings = null) {
    const key = String(featureKey || '').trim();
    if (!key) return true;

    const limits = getTenantPlanLimits(tenant);
    const planEnabled = limits?.features?.[key] !== false;
    if (!planEnabled) return false;

    const explicit = tenantSettings?.enabledModules && typeof tenantSettings.enabledModules === 'object'
        ? tenantSettings.enabledModules[key]
        : undefined;

    if (explicit === undefined) return true;
    return explicit !== false;
}

function assertUsageWithinLimit({
    metric = 'usage',
    current = 0,
    next = 0,
    max = 0,
    plan = DEFAULT_PLAN
} = {}) {
    const safeCurrent = Number(current);
    const safeNext = Number(next);
    const safeMax = Number(max);
    if (!Number.isFinite(safeMax) || safeMax <= 0) return;

    const nextValue = Number.isFinite(safeNext) ? safeNext : safeCurrent;
    if (nextValue <= safeMax) return;

    const cleanMetric = String(metric || 'usage').trim();
    const cleanPlan = String(plan || DEFAULT_PLAN).trim().toLowerCase() || DEFAULT_PLAN;
    throw new Error(`El plan ${cleanPlan} excede el limite de ${cleanMetric} (${safeMax}).`);
}

module.exports = {
    DEFAULT_PLAN,
    DEFAULT_LIMITS,
    getPlanLimits,
    getTenantPlanLimits,
    isFeatureEnabledForTenant,
    assertUsageWithinLimit
};