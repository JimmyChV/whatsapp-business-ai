const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadQuickRepliesManagerFresh() {
    const runtimePath = require.resolve('../persistence_runtime');
    const modulePath = require.resolve('../domains/tenant/services/quick-replies-manager.service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../domains/tenant/services/quick-replies-manager.service');
}

test('quick_replies_manager isolates tenant quick replies in file driver', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDataDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'quick-replies-tenants-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;
        const quickRepliesManager = loadQuickRepliesManagerFresh();

        const createdA = await quickRepliesManager.addQuickReply(
            { label: 'A', text: 'Mensaje A' },
            { tenantId: 'tenant_a' }
        );

        const createdB = await quickRepliesManager.addQuickReply(
            { label: 'B', text: 'Mensaje B' },
            { tenantId: 'tenant_b' }
        );

        const listA = await quickRepliesManager.listQuickReplies({ tenantId: 'tenant_a' });
        const listB = await quickRepliesManager.listQuickReplies({ tenantId: 'tenant_b' });

        assert.ok(listA.some((item) => item.id === createdA.id));
        assert.ok(listB.some((item) => item.id === createdB.id));
        assert.ok(!listA.some((item) => item.id === createdB.id));
        assert.ok(!listB.some((item) => item.id === createdA.id));

        const updatedA = await quickRepliesManager.updateQuickReply(
            { id: createdA.id, label: 'A2', text: 'Mensaje A2' },
            { tenantId: 'tenant_a' }
        );
        assert.equal(updatedA.label, 'A2');

        await quickRepliesManager.deleteQuickReply(createdB.id, { tenantId: 'tenant_b' });
        const afterDeleteB = await quickRepliesManager.listQuickReplies({ tenantId: 'tenant_b' });
        assert.ok(!afterDeleteB.some((item) => item.id === createdB.id));
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDataDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});

