const test = require('node:test');
const assert = require('node:assert/strict');

function loadTenantServiceFresh() {
    const modulePath = require.resolve('../domains/tenant/services/tenant-core.service');
    const controlPath = require.resolve('../domains/tenant/services/tenant-control.service');
    delete require.cache[modulePath];
    delete require.cache[controlPath];
    return require('../domains/tenant/services/tenant-core.service');
}

test('tenant_service resolves tenant from request header', () => {
    const prev = {
        SAAS_ENABLED: process.env.SAAS_ENABLED,
        SAAS_TENANTS_JSON: process.env.SAAS_TENANTS_JSON
    };

    try {
        process.env.SAAS_ENABLED = 'true';
        process.env.SAAS_TENANTS_JSON = JSON.stringify([
            { id: 'tenant_acme', slug: 'acme', name: 'Acme SAC', active: true },
            { id: 'tenant_beta', slug: 'beta', name: 'Beta SAC', active: true }
        ]);

        const tenantService = loadTenantServiceFresh();
        const req = { headers: { 'x-tenant-id': 'tenant_beta' }, query: {}, body: {} };
        const tenant = tenantService.resolveTenantForRequest(req, null);

        assert.equal(tenant.id, 'tenant_beta');
        assert.equal(tenant.slug, 'beta');
    } finally {
        process.env.SAAS_ENABLED = prev.SAAS_ENABLED;
        process.env.SAAS_TENANTS_JSON = prev.SAAS_TENANTS_JSON;
    }
});

test('tenant_service prioritizes authContext tenant', () => {
    const prev = {
        SAAS_ENABLED: process.env.SAAS_ENABLED,
        SAAS_TENANTS_JSON: process.env.SAAS_TENANTS_JSON
    };

    try {
        process.env.SAAS_ENABLED = 'true';
        process.env.SAAS_TENANTS_JSON = JSON.stringify([
            { id: 'tenant_acme', slug: 'acme', name: 'Acme SAC', active: true },
            { id: 'tenant_beta', slug: 'beta', name: 'Beta SAC', active: true }
        ]);

        const tenantService = loadTenantServiceFresh();
        const req = { headers: { 'x-tenant-id': 'tenant_acme' }, query: {}, body: {} };
        const authContext = { tenantId: 'tenant_beta' };
        const tenant = tenantService.resolveTenantForRequest(req, authContext);

        assert.equal(tenant.id, 'tenant_beta');
    } finally {
        process.env.SAAS_ENABLED = prev.SAAS_ENABLED;
        process.env.SAAS_TENANTS_JSON = prev.SAAS_TENANTS_JSON;
    }
});

