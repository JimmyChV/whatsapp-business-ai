const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadQuotesServiceFresh() {
    const runtimePath = require.resolve('../config/persistence-runtime');
    const modulePath = require.resolve('../domains/tenant/services/quotes.service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../domains/tenant/services/quotes.service');
}

test('tenant_quotes_service persists quote flow and tenant isolation in file driver', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDataDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tenant-quotes-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;

        const service = loadQuotesServiceFresh();
        const tenantA = 'tenant_quotes_a';
        const tenantB = 'tenant_quotes_b';

        const quoteDraft = await service.createQuoteRecord(tenantA, {
            chatId: '51941443776@c.us',
            scopeModuleId: 'mod-4q8k5c',
            status: 'draft',
            currency: 'PEN',
            itemsJson: [
                {
                    lineId: 'line_01',
                    productId: 'prod_colchon_140',
                    title: 'Colchon Ortopedico 2p',
                    qty: 2,
                    unitPrice: 49.9
                },
                {
                    lineId: 'line_02',
                    productId: 'prod_almohada_visco',
                    title: 'Almohada Viscoelastica',
                    qty: 1,
                    unitPrice: 29.9
                }
            ],
            summaryJson: {
                schemaVersion: 1,
                itemCount: 2,
                subtotalRegular: 149.7,
                subtotalProducts: 119.8,
                totalDiscount: 29.9,
                totalPayable: 122.3,
                currency: 'PEN'
            },
            notes: 'Cotizacion inicial desde carrito',
            createdByUserId: 'owner_lavitat',
            metadata: { source: 'chat_sidebar' }
        });

        assert.ok(quoteDraft?.quoteId, 'quoteId should be generated');
        assert.equal(quoteDraft.chatId, '51941443776@c.us');
        assert.equal(quoteDraft.scopeModuleId, 'mod-4q8k5c');
        assert.equal(quoteDraft.status, 'draft');
        assert.equal(quoteDraft.currency, 'PEN');
        assert.equal(quoteDraft.itemsJson.length, 2);
        assert.equal(quoteDraft.summaryJson.itemCount, 2);

        const storedDraft = await service.getQuoteById(tenantA, { quoteId: quoteDraft.quoteId });
        assert.ok(storedDraft, 'created quote should be retrievable by id');
        assert.equal(storedDraft.quoteId, quoteDraft.quoteId);
        assert.equal(storedDraft.status, 'draft');
        assert.equal(storedDraft.messageId, null);

        const sentQuote = await service.markQuoteSent(tenantA, {
            quoteId: quoteDraft.quoteId,
            messageId: 'wamid.HBgLNTE5NDE0NDM3NzYVAgARGBI5RjQ5RjQ5RjQ5RjQ5RkU=',
            updatedByUserId: 'owner_lavitat'
        });

        assert.ok(sentQuote, 'markQuoteSent should return updated record');
        assert.equal(sentQuote.quoteId, quoteDraft.quoteId);
        assert.equal(sentQuote.status, 'sent');
        assert.equal(sentQuote.messageId, 'wamid.HBgLNTE5NDE0NDM3NzYVAgARGBI5RjQ5RjQ5RjQ5RjQ5RkU=');
        assert.ok(sentQuote.sentAt, 'sentAt should be populated');

        const storedSent = await service.getQuoteById(tenantA, { quoteId: quoteDraft.quoteId });
        assert.ok(storedSent, 'updated quote should remain retrievable');
        assert.equal(storedSent.status, 'sent');
        assert.equal(storedSent.messageId, 'wamid.HBgLNTE5NDE0NDM3NzYVAgARGBI5RjQ5RjQ5RjQ5RjQ5RkU=');

        const crossTenant = await service.getQuoteById(tenantB, { quoteId: quoteDraft.quoteId });
        assert.equal(crossTenant, null, 'quote from tenant A must not appear in tenant B');
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDataDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});
