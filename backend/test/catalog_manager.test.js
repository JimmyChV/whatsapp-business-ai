const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadCatalogManagerFresh() {
    const runtimePath = require.resolve('../persistence_runtime');
    const modulePath = require.resolve('../domains/tenant/services/catalog-manager.service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../domains/tenant/services/catalog-manager.service');
}

test('catalog_manager isolates tenant data in file driver', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDataDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-tenants-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;
        const catalogManager = loadCatalogManagerFresh();

        const createdA = await catalogManager.addProduct({ title: 'Producto A', price: '10' }, { tenantId: 'tenant_a' });
        const createdB = await catalogManager.addProduct({ title: 'Producto B', price: '25.5' }, { tenantId: 'tenant_b' });

        const tenantACatalog = await catalogManager.loadCatalog({ tenantId: 'tenant_a' });
        const tenantBCatalog = await catalogManager.loadCatalog({ tenantId: 'tenant_b' });

        assert.equal(tenantACatalog.length, 1);
        assert.equal(tenantBCatalog.length, 1);
        assert.equal(tenantACatalog[0].title, 'Producto A');
        assert.equal(tenantBCatalog[0].title, 'Producto B');
        assert.equal(tenantBCatalog[0].price, '25.50');

        const updated = await catalogManager.updateProduct(createdA.id, { price: '11.90' }, { tenantId: 'tenant_a' });
        assert.equal(updated.price, '11.90');

        await catalogManager.deleteProduct(createdB.id, { tenantId: 'tenant_b' });
        const afterDeleteB = await catalogManager.loadCatalog({ tenantId: 'tenant_b' });
        assert.equal(afterDeleteB.length, 0);
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDataDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});

