const { parseCsvEnv } = require('./security_utils');

function parseBooleanEnv(value, defaultValue = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

const DEFAULT_TENANT = {
    id: 'default',
    slug: 'default',
    name: 'Default Tenant',
    active: true,
    plan: 'starter'
};

function normalizeTenant(input = {}, index = 0) {
    if (!input || typeof input !== 'object') return null;
    const id = String(input.id || input.tenantId || `tenant_${index + 1}`).trim();
    if (!id) return null;
    const slug = String(input.slug || id).trim().toLowerCase();
    const name = String(input.name || input.displayName || slug || id).trim() || id;
    const active = input.active !== false;
    const plan = String(input.plan || 'starter').trim().toLowerCase() || 'starter';
    const allowedOrigins = parseCsvEnv(input.allowedOrigins || '');
    return {
        id,
        slug,
        name,
        active,
        plan,
        allowedOrigins
    };
}

function parseTenantsFromEnv() {
    const raw = String(process.env.SAAS_TENANTS_JSON || '').trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((entry, idx) => normalizeTenant(entry, idx))
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

function getTenants() {
    const saasEnabled = parseBooleanEnv(process.env.SAAS_ENABLED, false);
    if (!saasEnabled) return [DEFAULT_TENANT];

    const envTenants = parseTenantsFromEnv();
    if (!envTenants.length) return [DEFAULT_TENANT];

    const dedup = new Map();
    envTenants.forEach((tenant) => {
        if (!tenant?.id) return;
        dedup.set(tenant.id, tenant);
    });

    if (!dedup.has(DEFAULT_TENANT.id)) {
        dedup.set(DEFAULT_TENANT.id, DEFAULT_TENANT);
    }

    return Array.from(dedup.values());
}

function findTenantById(tenantId = '') {
    const target = String(tenantId || '').trim();
    if (!target) return null;
    return getTenants().find((tenant) => tenant.id === target) || null;
}

function findTenantBySlug(slug = '') {
    const target = String(slug || '').trim().toLowerCase();
    if (!target) return null;
    return getTenants().find((tenant) => String(tenant.slug || '').trim().toLowerCase() === target) || null;
}

function resolveTenant({ tenantId = '', tenantSlug = '', authContext = null } = {}) {
    const fromAuth = String(authContext?.tenantId || '').trim();
    if (fromAuth) {
        const tenantByAuth = findTenantById(fromAuth);
        if (tenantByAuth) return tenantByAuth;
    }

    const byId = findTenantById(tenantId);
    if (byId) return byId;

    const bySlug = findTenantBySlug(tenantSlug);
    if (bySlug) return bySlug;

    return DEFAULT_TENANT;
}

function resolveTenantForRequest(req = {}, authContext = null) {
    const tenantId = req?.headers?.['x-tenant-id'] || req?.query?.tenantId || req?.body?.tenantId || '';
    const tenantSlug = req?.headers?.['x-tenant-slug'] || req?.query?.tenantSlug || req?.body?.tenantSlug || '';
    return resolveTenant({ tenantId, tenantSlug, authContext });
}

function resolveTenantForSocket(socket = {}, authContext = null) {
    const tenantId = socket?.handshake?.auth?.tenantId || socket?.handshake?.query?.tenantId || '';
    const tenantSlug = socket?.handshake?.auth?.tenantSlug || socket?.handshake?.query?.tenantSlug || '';
    return resolveTenant({ tenantId, tenantSlug, authContext });
}

function isSaasEnabled() {
    return parseBooleanEnv(process.env.SAAS_ENABLED, false);
}

module.exports = {
    getTenants,
    findTenantById,
    findTenantBySlug,
    resolveTenant,
    resolveTenantForRequest,
    resolveTenantForSocket,
    isSaasEnabled,
    DEFAULT_TENANT
};
