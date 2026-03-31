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

test('chat_assignment_lifecycle covers assign/take/release/waiting/reactivation with tenant isolation (file driver)', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDataDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chat-assignment-lifecycle-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;

        const service = loadConversationOpsServiceFresh();
        const tenantA = 'tenant_assign_a';
        const tenantB = 'tenant_assign_b';
        const chatId = '51941443776@c.us';
        const scopeModuleId = 'mod-4q8k5c';

        const initial = await service.upsertChatAssignment(tenantA, {
            chatId,
            scopeModuleId,
            assigneeUserId: 'seller_a',
            assigneeRole: 'seller',
            assignedByUserId: 'owner_a',
            assignmentMode: 'manual',
            assignmentReason: 'initial_assign',
            status: 'active',
            metadata: { source: 'test.initial' }
        });

        assert.equal(initial?.assignment?.chatId, chatId);
        assert.equal(initial?.assignment?.scopeModuleId, scopeModuleId);
        assert.equal(initial?.assignment?.assigneeUserId, 'seller_a');
        assert.equal(initial?.assignment?.status, 'active');

        const taken = await service.upsertChatAssignment(tenantA, {
            chatId,
            scopeModuleId,
            assigneeUserId: 'seller_b',
            assigneeRole: 'seller',
            assignedByUserId: 'seller_b',
            assignmentMode: 'take',
            assignmentReason: 'take_chat',
            status: 'active',
            metadata: { source: 'test.take' }
        });

        assert.equal(taken?.assignment?.assigneeUserId, 'seller_b');
        assert.equal(taken?.assignment?.assignmentMode, 'take');
        assert.equal(taken?.previous?.assigneeUserId, 'seller_a');
        assert.equal(Boolean(taken?.changed), true);

        const trace = await service.listChatAssignmentEvents(tenantA, {
            chatId,
            scopeModuleId,
            limit: 20,
            offset: 0
        });
        const traceItems = Array.isArray(trace?.items) ? trace.items : [];
        assert.ok(traceItems.length >= 2, 'assignment trace should include initial assign and take');
        assert.ok(
            traceItems.some((entry) => entry?.assignmentMode === 'take' && entry?.nextAssigneeUserId === 'seller_b'),
            'trace should include take event'
        );

        const released = await service.clearChatAssignment(tenantA, {
            chatId,
            scopeModuleId,
            assignedByUserId: 'owner_a',
            assignmentMode: 'manual',
            assignmentReason: 'release'
        });
        assert.equal(released?.assignment?.status, 'released');
        assert.equal(released?.assignment?.assigneeUserId, null);

        await service.upsertChatAssignment(tenantA, {
            chatId,
            scopeModuleId,
            assigneeUserId: 'seller_c',
            assigneeRole: 'seller',
            assignedByUserId: 'owner_a',
            assignmentMode: 'manual',
            assignmentReason: 'reassign_before_waiting',
            status: 'active'
        });

        const waitingAt = '2026-03-31T00:00:00.000Z';
        const waiting = await service.markChatAssignmentWaiting(tenantA, {
            chatId,
            scopeModuleId,
            actorUserId: 'system',
            at: waitingAt,
            reason: 'inactive_48h',
            metadata: { source: 'test.waiting' }
        });
        assert.equal(waiting?.assignment?.status, 'en_espera');
        assert.equal(waiting?.assignment?.waitingSince, waitingAt);
        assert.ok(waiting?.assignment?.lastActivityAt, 'waiting transition should keep lifecycle fields');

        const reactivateAt = '2026-03-31T02:00:00.000Z';
        const reactivated = await service.reactivateChatAssignmentOnCustomerReply(tenantA, {
            chatId,
            scopeModuleId,
            actorUserId: 'system',
            at: reactivateAt,
            metadata: { source: 'test.reactivate' }
        });
        assert.equal(reactivated?.shouldAutoAssign, true);
        assert.equal(reactivated?.assignment?.status, 'released');
        assert.equal(reactivated?.assignment?.waitingSince, null);
        assert.equal(reactivated?.assignment?.lastCustomerMessageAt, reactivateAt);

        const crossTenantAssignment = await service.getChatAssignment(tenantB, { chatId, scopeModuleId });
        assert.equal(crossTenantAssignment, null, 'tenant B must not read tenant A assignment');

        const crossTenantTrace = await service.listChatAssignmentEvents(tenantB, {
            chatId,
            scopeModuleId,
            limit: 20,
            offset: 0
        });
        assert.equal(Array.isArray(crossTenantTrace?.items) ? crossTenantTrace.items.length : 0, 0, 'tenant B must not see tenant A trace');
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDataDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});
