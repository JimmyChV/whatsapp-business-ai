const {
    DEFAULT_TENANT_ID,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('./persistence_runtime');

const AI_USAGE_FILE = 'ai_usage.json';

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

async function getMonthlyUsage(tenantId = DEFAULT_TENANT_ID, monthKey = currentMonthKey()) {
    const cleanTenant = resolveTenantId(tenantId);
    const key = String(monthKey || currentMonthKey()).trim() || currentMonthKey();
    const store = await loadStore(cleanTenant);
    const value = Number(store.counters?.[key] || 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

async function incrementMonthlyUsage(tenantId = DEFAULT_TENANT_ID, {
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
    if (keys.length > 24) {
        const toDrop = keys.slice(0, keys.length - 24);
        toDrop.forEach((oldKey) => {
            delete store.counters[oldKey];
        });
    }

    await saveStore(cleanTenant, store);
    return next;
}

module.exports = {
    currentMonthKey,
    getMonthlyUsage,
    incrementMonthlyUsage
};