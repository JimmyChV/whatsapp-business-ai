const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadServicesFresh() {
    const runtimePath = require.resolve('../config/persistence-runtime');
    const msgPath = require.resolve('../domains/operations/services/message-history.service');
    const opsPath = require.resolve('../domains/operations/services/conversation-ops.service');
    const kpiPath = require.resolve('../domains/operations/services/operations-kpi.service');

    delete require.cache[runtimePath];
    delete require.cache[msgPath];
    delete require.cache[opsPath];
    delete require.cache[kpiPath];

    return {
        messageHistoryService: require('../domains/operations/services/message-history.service'),
        conversationOpsService: require('../domains/operations/services/conversation-ops.service'),
        operationsKpiService: require('../domains/operations/services/operations-kpi.service')
    };
}

test('operations_kpi_service computes metrics with scope and assignee filters (file driver)', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDir = process.env.SAAS_TENANT_DATA_DIR;
    const prevHistoryEnabled = process.env.HISTORY_PERSISTENCE_ENABLED;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ops-kpi-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;
        process.env.HISTORY_PERSISTENCE_ENABLED = 'true';

        const { messageHistoryService, conversationOpsService, operationsKpiService } = loadServicesFresh();

        await messageHistoryService.upsertMessage('tenant_lavitat', {
            messageId: 'msg_1_in',
            chatId: '51911111111@c.us',
            fromMe: false,
            waModuleId: 'mod_a',
            body: 'hola',
            timestampUnix: 100,
            chat: { id: '51911111111@c.us', displayName: 'Chat A' }
        });
        await messageHistoryService.upsertMessage('tenant_lavitat', {
            messageId: 'msg_1_out',
            chatId: '51911111111@c.us',
            fromMe: true,
            waModuleId: 'mod_a',
            body: 'respuesta',
            timestampUnix: 130,
            chat: { id: '51911111111@c.us', displayName: 'Chat A' }
        });

        await messageHistoryService.upsertMessage('tenant_lavitat', {
            messageId: 'msg_2_in',
            chatId: '51922222222@c.us',
            fromMe: false,
            waModuleId: 'mod_a',
            body: 'consulta',
            timestampUnix: 200,
            chat: { id: '51922222222@c.us', displayName: 'Chat B' }
        });

        await messageHistoryService.upsertMessage('tenant_lavitat', {
            messageId: 'msg_3_in',
            chatId: '51933333333@c.us',
            fromMe: false,
            waModuleId: 'mod_b',
            body: 'otro modulo',
            timestampUnix: 220,
            chat: { id: '51933333333@c.us', displayName: 'Chat C' }
        });

        await conversationOpsService.upsertChatAssignment('tenant_lavitat', {
            chatId: '51911111111@c.us',
            scopeModuleId: 'mod_a',
            assigneeUserId: 'USER-001',
            assigneeRole: 'seller',
            assignedByUserId: 'owner_lavitat',
            assignmentMode: 'manual',
            assignmentReason: 'seed'
        });

        await conversationOpsService.upsertChatAssignment('tenant_lavitat', {
            chatId: '51911111111@c.us',
            scopeModuleId: 'mod_a',
            assigneeUserId: 'USER-002',
            assigneeRole: 'seller',
            assignedByUserId: 'owner_lavitat',
            assignmentMode: 'manual',
            assignmentReason: 'reassign'
        });

        const scoped = await operationsKpiService.getOperationsKpis('tenant_lavitat', {
            scopeModuleId: 'mod_a'
        });

        assert.equal(scoped.metrics.source, 'file');
        assert.equal(scoped.metrics.incomingMessages, 2);
        assert.equal(scoped.metrics.outgoingMessages, 1);
        assert.equal(scoped.metrics.respondedChats, 1);
        assert.equal(scoped.metrics.avgFirstResponseSec, 30);
        assert.equal(scoped.metrics.activeAssignments, 1);
        assert.equal(scoped.metrics.reassignedChats, 1);

        const byAssignee = await operationsKpiService.getOperationsKpis('tenant_lavitat', {
            scopeModuleId: 'mod_a',
            assigneeUserId: 'USER-002'
        });

        assert.equal(byAssignee.metrics.incomingMessages, 1);
        assert.equal(byAssignee.metrics.outgoingMessages, 1);
        assert.equal(byAssignee.metrics.respondedChats, 1);
        assert.equal(byAssignee.metrics.activeAssignments, 1);
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDir;
        process.env.HISTORY_PERSISTENCE_ENABLED = prevHistoryEnabled;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});


