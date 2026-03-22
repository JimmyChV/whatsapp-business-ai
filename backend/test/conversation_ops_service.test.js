const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadConversationOpsServiceFresh() {
    const runtimePath = require.resolve('../config/persistence-runtime');
    const modulePath = require.resolve('../domains/operations/services/conversation-ops.service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../domains/operations/services/conversation-ops.service');
}

test('conversation_ops_service stores events and assignments with tenant isolation (file driver)', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'conversation-ops-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;

        const service = loadConversationOpsServiceFresh();

        await service.recordConversationEvent('tenant_a', {
            chatId: '51999911111@c.us',
            scopeModuleId: 'mod_a',
            eventType: 'chat.message.outgoing.text',
            eventSource: 'socket',
            payload: { length: 12 }
        });

        await service.recordConversationEvent('tenant_b', {
            chatId: '51999922222@c.us',
            scopeModuleId: 'mod_b',
            eventType: 'chat.message.outgoing.text',
            eventSource: 'socket',
            payload: { length: 8 }
        });

        const tenantAEvents = await service.listConversationEvents('tenant_a', {
            chatId: '51999911111@c.us',
            limit: 20,
            offset: 0
        });
        const tenantBEvents = await service.listConversationEvents('tenant_b', {
            chatId: '51999922222@c.us',
            limit: 20,
            offset: 0
        });

        assert.equal(tenantAEvents.total, 1);
        assert.equal(tenantAEvents.items[0].chatId, '51999911111@c.us');
        assert.equal(tenantAEvents.items[0].scopeModuleId, 'mod_a');
        assert.equal(tenantAEvents.items[0].eventType, 'chat.message.outgoing.text');
        assert.equal(tenantBEvents.total, 1);

        const firstAssignment = await service.upsertChatAssignment('tenant_a', {
            chatId: '51999911111@c.us',
            scopeModuleId: 'mod_a',
            assigneeUserId: 'USER-001',
            assigneeRole: 'seller',
            assignedByUserId: 'owner_lavitat',
            assignmentMode: 'manual',
            assignmentReason: 'workload-balance',
            metadata: { priority: 'high' }
        });

        assert.equal(firstAssignment.assignment.assigneeUserId, 'USER-001');
        assert.equal(firstAssignment.assignment.scopeModuleId, 'mod_a');
        assert.equal(firstAssignment.assignment.assignmentMode, 'manual');
        assert.equal(firstAssignment.changed, true);

        const current = await service.getChatAssignment('tenant_a', {
            chatId: '51999911111@c.us',
            scopeModuleId: 'mod_a'
        });
        assert.ok(current);
        assert.equal(current.assigneeUserId, 'USER-001');
        assert.equal(current.assignmentReason, 'workload-balance');

        const released = await service.clearChatAssignment('tenant_a', {
            chatId: '51999911111@c.us',
            scopeModuleId: 'mod_a',
            assignedByUserId: 'owner_lavitat',
            assignmentReason: 'manual-release'
        });

        assert.equal(released.assignment.assigneeUserId, null);
        assert.equal(released.assignment.status, 'released');

        const tenantAAssignments = await service.listChatAssignments('tenant_a', {
            scopeModuleId: 'mod_a',
            limit: 20,
            offset: 0
        });
        assert.equal(tenantAAssignments.total, 1);
        assert.equal(tenantAAssignments.items[0].status, 'released');

        const assignmentEvents = await service.listChatAssignmentEvents('tenant_a', {
            chatId: '51999911111@c.us',
            scopeModuleId: 'mod_a',
            limit: 20,
            offset: 0
        });
        assert.equal(assignmentEvents.total, 2);

        const assignmentChangedEvents = await service.listConversationEvents('tenant_a', {
            chatId: '51999911111@c.us',
            scopeModuleId: 'mod_a',
            eventTypes: ['chat.assignment.changed'],
            limit: 20,
            offset: 0
        });
        assert.equal(assignmentChangedEvents.total, 2);
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});

