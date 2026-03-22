const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tenantIntegrationsService = require('../domains/tenant/services/integrations.service');

test('tenant_integrations_service keeps legacy assistant ids stable and updatable', async (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-ai-legacy-'));
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

    const tenantId = 'tenant_legacy_ai';
    const tenantDir = path.join(tempRoot, tenantId);
    fs.mkdirSync(tenantDir, { recursive: true });

    const filePath = path.join(tenantDir, 'tenant_integrations.json');
    const initial = {
        catalog: {
            mode: 'hybrid',
            providers: {
                meta: { enabled: true },
                woocommerce: {
                    enabled: true,
                    baseUrl: null,
                    perPage: 100,
                    maxPages: 10,
                    includeOutOfStock: true,
                    consumerKey: null,
                    consumerSecret: null
                },
                local: { enabled: true }
            }
        },
        ai: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            openaiApiKey: null,
            defaultAssistantId: null,
            assistants: [
                {
                    assistantId: 'legacy-assistant-id',
                    name: 'Asistente Legacy',
                    isActive: true,
                    isDefault: true
                }
            ]
        },
        appearance: {
            brandName: null,
            primaryColor: '#12d2a6',
            secondaryColor: '#0b1f2e',
            accentColor: '#1ea7ff',
            surfaceColor: '#102433',
            backgroundColor: '#061520'
        },
        updatedAt: null
    };

    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8');

    const firstList = await tenantIntegrationsService.listTenantAiAssistants(tenantId);
    assert.equal(Array.isArray(firstList.items), true);
    assert.equal(firstList.items.length, 1);

    const normalizedAssistantId = String(firstList.items[0].assistantId || '');
    assert.match(normalizedAssistantId, /^AIA-[A-Z0-9]{6}$/);

    const secondList = await tenantIntegrationsService.listTenantAiAssistants(tenantId);
    assert.equal(secondList.items.length, 1);
    assert.equal(secondList.items[0].assistantId, normalizedAssistantId);

    const updated = await tenantIntegrationsService.updateTenantAiAssistant(tenantId, normalizedAssistantId, {
        name: 'Asistente Legacy Actualizado'
    });
    assert.equal(updated.item.assistantId, normalizedAssistantId);
    assert.equal(updated.item.name, 'Asistente Legacy Actualizado');

    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(persisted.ai.assistants[0].assistantId, normalizedAssistantId);
    assert.equal(persisted.ai.assistants[0].name, 'Asistente Legacy Actualizado');
});


