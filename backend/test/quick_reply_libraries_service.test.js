const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadQuickReplyLibrariesServiceFresh() {
    const runtimePath = require.resolve('../persistence_runtime');
    const modulePath = require.resolve('../domains/tenant/services/quick-reply-libraries.service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../domains/tenant/services/quick-reply-libraries.service');
}

test('quick_reply_libraries_service invalidates cache on writes in file driver', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDataDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'quick-reply-libraries-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;
        const service = loadQuickReplyLibrariesServiceFresh();

        const tenantA = 'tenant_cache_a';
        const tenantB = 'tenant_cache_b';

        const initialA = await service.listQuickReplyLibraries({ tenantId: tenantA, includeInactive: true });
        assert.ok(Array.isArray(initialA));

        const createdLibrary = await service.saveQuickReplyLibrary({
            name: 'Biblioteca Venta',
            description: 'Plantillas comerciales',
            isShared: true,
            isActive: true,
            sortOrder: 3
        }, { tenantId: tenantA });

        const afterCreateA = await service.listQuickReplyLibraries({ tenantId: tenantA, includeInactive: true });
        assert.ok(afterCreateA.some((entry) => entry.libraryId === createdLibrary.libraryId), 'new library should appear after save');

        const createdItem = await service.saveQuickReplyItem({
            libraryId: createdLibrary.libraryId,
            label: 'Saludo',
            text: 'Hola, gracias por escribir.'
        }, { tenantId: tenantA });

        const itemsA = await service.listQuickReplyItems({ tenantId: tenantA, includeInactive: true });
        assert.ok(itemsA.some((entry) => entry.itemId === createdItem.itemId), 'new quick reply item should appear after save');

        await service.deactivateQuickReplyItem(createdItem.itemId, { tenantId: tenantA });
        const activeItemsA = await service.listQuickReplyItems({ tenantId: tenantA, includeInactive: false });
        assert.ok(!activeItemsA.some((entry) => entry.itemId === createdItem.itemId), 'deactivated item should not appear in active list');

        const librariesB = await service.listQuickReplyLibraries({ tenantId: tenantB, includeInactive: true });
        assert.ok(!librariesB.some((entry) => entry.libraryId === createdLibrary.libraryId), 'tenant data should stay isolated');
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDataDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});

