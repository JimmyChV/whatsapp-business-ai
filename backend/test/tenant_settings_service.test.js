const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadTenantSettingsServiceFresh() {
    const runtimePath = require.resolve('../persistence_runtime');
    const modulePath = require.resolve('../domains/tenant/services/tenant-settings.service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../domains/tenant/services/tenant-settings.service');
}

test('tenant_settings_service keeps tenant isolation and defaults', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDir = process.env.SAAS_TENANT_DATA_DIR;
    const prevSettingsJson = process.env.SAAS_TENANT_SETTINGS_JSON;
    const prevDefaultMode = process.env.SAAS_DEFAULT_CATALOG_MODE;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tenant-settings-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;
        process.env.SAAS_TENANT_SETTINGS_JSON = JSON.stringify([
            { tenantId: 'tenant_env', settings: { catalogMode: 'woo_only', enabledModules: { aiPro: false } } }
        ]);
        process.env.SAAS_DEFAULT_CATALOG_MODE = 'hybrid';

        const service = loadTenantSettingsServiceFresh();

        const fromEnv = await service.getTenantSettings('tenant_env');
        assert.equal(fromEnv.catalogMode, 'hybrid');
        assert.equal(fromEnv.enabledModules.aiPro, true);

        const tenantAUpdated = await service.updateTenantSettings('tenant_a', {
            catalogMode: 'local_only',
            enabledModules: { catalog: true, cart: false },
            wa: { transportLock: 'cloud' }
        });

        assert.equal(tenantAUpdated.catalogMode, 'local_only');
        assert.equal(tenantAUpdated.enabledModules.cart, false);
        assert.equal(tenantAUpdated.wa.transportLock, 'cloud');

        const tenantA = await service.getTenantSettings('tenant_a');
        const tenantB = await service.getTenantSettings('tenant_b');

        assert.equal(tenantA.catalogMode, 'local_only');
        assert.equal(tenantB.catalogMode, 'hybrid');
        assert.equal(tenantB.enabledModules.cart, true);

        const sanitized = await service.updateTenantSettings('tenant_b', {
            catalogMode: 'modo_invalido',
            wa: { transportLock: 'otro' }
        });

        assert.equal(sanitized.catalogMode, 'hybrid');
        assert.equal(sanitized.wa.transportLock, 'auto');
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDir;
        process.env.SAAS_TENANT_SETTINGS_JSON = prevSettingsJson;
        process.env.SAAS_DEFAULT_CATALOG_MODE = prevDefaultMode;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});

