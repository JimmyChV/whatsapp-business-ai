const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const aiChatHistoryService = require('../domains/operations/services/ai-chat-history.service');

test('ai_chat_history_service stores and isolates entries by scoped chat in file driver', async (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-ai-history-'));
    const previousDriver = process.env.SAAS_STORAGE_DRIVER;
    const previousTenantDataDir = process.env.SAAS_TENANT_DATA_DIR;

    process.env.SAAS_STORAGE_DRIVER = 'file';
    process.env.SAAS_TENANT_DATA_DIR = tempRoot;

    t.after(() => {
        if (previousDriver === undefined) delete process.env.SAAS_STORAGE_DRIVER;
        else process.env.SAAS_STORAGE_DRIVER = previousDriver;

        if (previousTenantDataDir === undefined) delete process.env.SAAS_TENANT_DATA_DIR;
        else process.env.SAAS_TENANT_DATA_DIR = previousTenantDataDir;

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    const tenantId = 'tenant_lavitat';
    const scopeA = '51911111111@c.us::mod::mod_a';
    const scopeB = '51911111111@c.us::mod::mod_b';

    await aiChatHistoryService.appendInteraction(tenantId, {
        scopeChatId: scopeA,
        baseChatId: '51911111111@c.us',
        scopeModuleId: 'mod_a',
        mode: 'copilot',
        userId: 'owner_lavitat',
        userName: 'Owner Lavitat',
        query: 'Dame 3 respuestas sugeridas',
        response: 'Aqui tienes 3 respuestas para ese cliente.'
    });

    await aiChatHistoryService.appendInteraction(tenantId, {
        scopeChatId: scopeB,
        baseChatId: '51911111111@c.us',
        scopeModuleId: 'mod_b',
        mode: 'copilot',
        userId: 'owner_lavitat',
        userName: 'Owner Lavitat',
        query: 'Genera una cotizacion rapida',
        response: 'Lista una cotizacion para el modulo B.'
    });

    const historyA = await aiChatHistoryService.listEntries(tenantId, {
        scopeChatId: scopeA,
        limit: 20
    });
    const historyB = await aiChatHistoryService.listEntries(tenantId, {
        scopeChatId: scopeB,
        limit: 20
    });

    assert.equal(Array.isArray(historyA), true);
    assert.equal(Array.isArray(historyB), true);
    assert.equal(historyA.length, 2);
    assert.equal(historyB.length, 2);

    assert.equal(historyA[0].role, 'user');
    assert.equal(historyA[1].role, 'assistant');
    assert.match(String(historyA[0].content || ''), /respuestas sugeridas/i);

    assert.equal(historyB[0].role, 'user');
    assert.equal(historyB[1].role, 'assistant');
    assert.match(String(historyB[0].content || ''), /cotizacion/i);
});


