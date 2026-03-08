const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadMessageHistoryServiceFresh() {
    const runtimePath = require.resolve('../persistence_runtime');
    const modulePath = require.resolve('../message_history_service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../message_history_service');
}

test('message_history_service persists messages with tenant isolation and supports ack/edit updates', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDir = process.env.SAAS_TENANT_DATA_DIR;
    const prevHistoryEnabled = process.env.HISTORY_PERSISTENCE_ENABLED;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'message-history-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;
        process.env.HISTORY_PERSISTENCE_ENABLED = 'true';

        const service = loadMessageHistoryServiceFresh();

        await service.upsertMessage('tenant_a', {
            messageId: 'msg_1',
            chatId: '51911111111@c.us',
            fromMe: false,
            senderPhone: '+51911111111',
            senderId: '51911111111@c.us',
            body: 'Hola',
            messageType: 'chat',
            timestampUnix: 100,
            ack: 1,
            chat: {
                id: '51911111111@c.us',
                displayName: 'Cliente Uno',
                phone: '+51911111111',
                subtitle: 'Pushname Uno'
            }
        });

        await service.upsertMessage('tenant_a', {
            messageId: 'msg_2',
            chatId: '51911111111@c.us',
            fromMe: true,
            senderPhone: null,
            senderId: null,
            body: 'Respuesta',
            messageType: 'chat',
            timestampUnix: 120,
            ack: 2,
            chat: {
                id: '51911111111@c.us',
                displayName: 'Cliente Uno',
                phone: '+51911111111'
            }
        });

        await service.upsertMessage('tenant_b', {
            messageId: 'msg_b_1',
            chatId: '51922222222@c.us',
            fromMe: false,
            body: 'Tenant B',
            messageType: 'chat',
            timestampUnix: 110,
            ack: 0,
            chat: {
                id: '51922222222@c.us',
                displayName: 'Cliente Dos',
                phone: '+51922222222'
            }
        });

        const tenantAChats = await service.listChats('tenant_a', { limit: 10, offset: 0 });
        const tenantAMessages = await service.listMessages('tenant_a', { chatId: '51911111111@c.us', limit: 10 });
        const tenantBChats = await service.listChats('tenant_b', { limit: 10, offset: 0 });

        assert.equal(tenantAChats.length, 1);
        assert.equal(tenantAChats[0].chatId, '51911111111@c.us');
        assert.equal(tenantAChats[0].displayName, 'Cliente Uno');
        assert.equal(tenantBChats.length, 1);
        assert.equal(tenantBChats[0].chatId, '51922222222@c.us');

        assert.equal(tenantAMessages.length, 2);
        assert.equal(tenantAMessages[0].messageId, 'msg_2');
        assert.equal(tenantAMessages[1].messageId, 'msg_1');

        await service.updateMessageAck('tenant_a', {
            messageId: 'msg_1',
            chatId: '51911111111@c.us',
            ack: 3
        });

        await service.updateMessageEdit('tenant_a', {
            messageId: 'msg_1',
            chatId: '51911111111@c.us',
            body: 'Hola editado',
            editedAtUnix: 130
        });

        const tenantAMessagesAfterUpdate = await service.listMessages('tenant_a', {
            chatId: '51911111111@c.us',
            limit: 10
        });

        const edited = tenantAMessagesAfterUpdate.find((message) => message.messageId === 'msg_1');
        assert.ok(edited);
        assert.equal(edited.ack, 3);
        assert.equal(edited.edited, true);
        assert.equal(edited.body, 'Hola editado');
        assert.equal(edited.editedAtUnix, 130);
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDir;
        process.env.HISTORY_PERSISTENCE_ENABLED = prevHistoryEnabled;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});

test('message_history_service respects disabled toggle', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDir = process.env.SAAS_TENANT_DATA_DIR;
    const prevHistoryEnabled = process.env.HISTORY_PERSISTENCE_ENABLED;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'message-history-disabled-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;
        process.env.HISTORY_PERSISTENCE_ENABLED = 'false';

        const service = loadMessageHistoryServiceFresh();
        const upsertResult = await service.upsertMessage('tenant_disabled', {
            messageId: 'msg_disabled',
            chatId: 'chat_disabled',
            body: 'No persistir'
        });

        assert.equal(upsertResult.ok, false);
        assert.equal(upsertResult.skipped, 'disabled');

        const chats = await service.listChats('tenant_disabled', { limit: 10, offset: 0 });
        const messages = await service.listMessages('tenant_disabled', { chatId: 'chat_disabled', limit: 10 });
        assert.deepEqual(chats, []);
        assert.deepEqual(messages, []);
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDir;
        process.env.HISTORY_PERSISTENCE_ENABLED = prevHistoryEnabled;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});
