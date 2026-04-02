const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadChatCommercialStatusServiceFresh() {
    const runtimePath = require.resolve('../config/persistence-runtime');
    const modulePath = require.resolve('../domains/operations/services/chat-commercial-status.service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../domains/operations/services/chat-commercial-status.service');
}

test('chat_commercial_status lifecycle covers inbound/agent/quote/manual/final-state protection with tenant isolation (file driver)', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDataDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chat-commercial-status-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;

        const service = loadChatCommercialStatusServiceFresh();
        const tenantA = 'tenant_status_a';
        const tenantB = 'tenant_status_b';
        const scopeModuleId = 'mod-4q8k5c';
        const chatSold = '51941443776@c.us';
        const chatLost = '51955577989@c.us';

        const firstInboundAt = '2026-04-01T10:00:00.000Z';
        const inboundFirst = await service.markInboundCustomerFirstContact(tenantA, {
            chatId: chatSold,
            scopeModuleId,
            at: firstInboundAt,
            source: 'webhook',
            reason: 'first_inbound_customer_message'
        });
        assert.equal(inboundFirst?.status?.status, 'nuevo');
        assert.equal(inboundFirst?.status?.firstCustomerMessageAt, firstInboundAt);
        assert.equal(Boolean(inboundFirst?.changed), true);

        const inboundSecond = await service.markInboundCustomerFirstContact(tenantA, {
            chatId: chatSold,
            scopeModuleId,
            at: '2026-04-01T10:05:00.000Z',
            source: 'webhook',
            reason: 'duplicate_inbound'
        });
        assert.equal(inboundSecond?.status?.status, 'nuevo');
        assert.equal(inboundSecond?.status?.firstCustomerMessageAt, firstInboundAt);
        assert.equal(Boolean(inboundSecond?.changed), false);

        const firstReplyAt = '2026-04-01T10:10:00.000Z';
        const firstReply = await service.markFirstAgentReply(tenantA, {
            chatId: chatSold,
            scopeModuleId,
            at: firstReplyAt,
            source: 'socket',
            reason: 'first_outbound_agent_message',
            changedByUserId: 'seller_a'
        });
        assert.equal(firstReply?.status?.status, 'en_conversacion');
        assert.equal(firstReply?.status?.firstAgentResponseAt, firstReplyAt);

        const quoteAt = '2026-04-01T10:15:00.000Z';
        const quoted = await service.markQuoteSent(tenantA, {
            chatId: chatSold,
            scopeModuleId,
            at: quoteAt,
            source: 'socket',
            reason: 'send_structured_quote_success',
            changedByUserId: 'seller_a'
        });
        assert.equal(quoted?.status?.status, 'cotizado');
        assert.equal(quoted?.status?.quotedAt, quoteAt);

        const soldAt = '2026-04-01T10:20:00.000Z';
        const sold = await service.markManualStatus(tenantA, {
            chatId: chatSold,
            scopeModuleId,
            status: 'vendido',
            at: soldAt,
            source: 'manual',
            reason: 'manual_mark_vendido',
            changedByUserId: 'owner_a'
        });
        assert.equal(sold?.status?.status, 'vendido');
        assert.equal(sold?.status?.soldAt, soldAt);

        const quoteAfterSold = await service.markQuoteSent(tenantA, {
            chatId: chatSold,
            scopeModuleId,
            at: '2026-04-01T10:30:00.000Z',
            source: 'socket',
            reason: 'attempt_quote_after_sold',
            changedByUserId: 'seller_a'
        });
        assert.equal(quoteAfterSold?.status?.status, 'vendido');
        assert.equal(Boolean(quoteAfterSold?.changed), false);

        const lostAt = '2026-04-01T11:00:00.000Z';
        const lost = await service.markManualStatus(tenantA, {
            chatId: chatLost,
            scopeModuleId,
            status: 'perdido',
            at: lostAt,
            source: 'manual',
            reason: 'manual_mark_perdido',
            changedByUserId: 'owner_a'
        });
        assert.equal(lost?.status?.status, 'perdido');
        assert.equal(lost?.status?.lostAt, lostAt);

        const crossTenantStatus = await service.getChatCommercialStatus(tenantB, {
            chatId: chatSold,
            scopeModuleId
        });
        assert.equal(crossTenantStatus, null, 'tenant B must not read tenant A commercial status');

        const tenantAList = await service.listCommercialStatuses(tenantA, {
            scopeModuleId,
            limit: 20,
            offset: 0
        });
        assert.ok((Array.isArray(tenantAList?.items) ? tenantAList.items.length : 0) >= 2, 'tenant A should contain created commercial statuses');

        const tenantBList = await service.listCommercialStatuses(tenantB, {
            scopeModuleId,
            limit: 20,
            offset: 0
        });
        assert.equal(Array.isArray(tenantBList?.items) ? tenantBList.items.length : 0, 0, 'tenant B must not list tenant A commercial statuses');
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDataDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});
