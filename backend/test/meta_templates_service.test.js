const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadMetaTemplatesServiceFresh() {
    const runtimePath = require.resolve('../config/persistence-runtime');
    const servicePath = require.resolve('../domains/operations/services/meta-templates.service');
    const waModuleServicePath = require.resolve('../domains/tenant/services/wa-modules.service');
    const waCloudClientPath = require.resolve('../domains/channels/services/whatsapp-cloud-client.service');

    delete require.cache[runtimePath];
    delete require.cache[servicePath];
    delete require.cache[waModuleServicePath];
    delete require.cache[waCloudClientPath];

    const waModuleService = require('../domains/tenant/services/wa-modules.service');
    const waCloudClient = require('../domains/channels/services/whatsapp-cloud-client.service');

    const originalGetModuleRuntime = waModuleService.getModuleRuntime;
    const originalResolveModuleCloudConfig = waModuleService.resolveModuleCloudConfig;
    const originalDeleteMessageTemplate = waCloudClient.deleteMessageTemplate;

    waModuleService.getModuleRuntime = async (tenantId, moduleId) => ({
        moduleId: String(moduleId || '').trim().toLowerCase(),
        metadata: {
            cloudConfig: {
                wabaId: `waba_${String(moduleId || '').trim().toLowerCase()}`,
                phoneNumberId: `phone_${String(moduleId || '').trim().toLowerCase()}`,
                systemUserToken: `token_${String(moduleId || '').trim().toLowerCase()}`
            }
        }
    });
    waModuleService.resolveModuleCloudConfig = (module = {}) => ({
        wabaId: String(module?.metadata?.cloudConfig?.wabaId || '').trim(),
        phoneNumberId: String(module?.metadata?.cloudConfig?.phoneNumberId || '').trim(),
        systemUserToken: String(module?.metadata?.cloudConfig?.systemUserToken || '').trim()
    });
    waCloudClient.deleteMessageTemplate = async () => ({ success: true });

    const service = require('../domains/operations/services/meta-templates.service');

    const restore = () => {
        waModuleService.getModuleRuntime = originalGetModuleRuntime;
        waModuleService.resolveModuleCloudConfig = originalResolveModuleCloudConfig;
        waCloudClient.deleteMessageTemplate = originalDeleteMessageTemplate;
    };

    return { service, restore };
}

test('meta_templates_service lifecycle covers upsert/webhook/list/delete with tenant isolation (file driver)', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDataDir = process.env.SAAS_TENANT_DATA_DIR;
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-templates-service-'));

    let restoreDeps = () => { };

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;

        const { service, restore } = loadMetaTemplatesServiceFresh();
        restoreDeps = restore;

        const tenantA = 'tenant_templates_a';
        const tenantB = 'tenant_templates_b';
        const moduleId = 'mod-4q8k5c';

        const created = await service.upsertTemplateFromMeta(tenantA, {
            moduleId,
            metaTemplate: {
                id: 'meta_tpl_001',
                name: 'promo_bienvenida',
                language: 'ES',
                category: 'MARKETING',
                status: 'PENDING',
                quality_score: 'GREEN',
                components: [{ type: 'BODY', text: 'Hola {{1}}' }]
            }
        });

        assert.ok(created?.templateId, 'templateId should be generated');
        assert.equal(created?.tenantId, tenantA);
        assert.equal(created?.moduleId, moduleId);
        assert.equal(created?.scopeModuleId, moduleId);
        assert.equal(created?.metaTemplateId, 'meta_tpl_001');
        assert.equal(created?.templateName, 'promo_bienvenida');
        assert.equal(created?.templateLanguage, 'es');
        assert.equal(created?.category, 'marketing');
        assert.equal(created?.status, 'pending');
        assert.equal(created?.qualityScore, 'green');
        assert.equal(created?.deletedAt, null);

        const approvedResult = await service.applyTemplateWebhookStatusUpdate(tenantA, {
            templateName: 'promo_bienvenida',
            newStatus: 'APPROVED',
            wabaId: `waba_${moduleId}`,
            rawPayload: { event: 'status_update', status: 'APPROVED' }
        });

        assert.equal(approvedResult?.updatedCount, 1);
        assert.equal(approvedResult?.items?.[0]?.status, 'approved');

        const rejectedResult = await service.applyTemplateWebhookStatusUpdate(tenantA, {
            templateName: 'promo_bienvenida',
            newStatus: 'REJECTED',
            reason: 'Policy violation',
            wabaId: `waba_${moduleId}`,
            rawPayload: { event: 'status_update', status: 'REJECTED', reason: 'Policy violation' }
        });

        assert.equal(rejectedResult?.updatedCount, 1);
        assert.equal(rejectedResult?.items?.[0]?.status, 'rejected');
        assert.equal(rejectedResult?.items?.[0]?.rejectionReason, 'Policy violation');

        await service.upsertTemplateFromMeta(tenantA, {
            moduleId,
            metaTemplate: {
                id: 'meta_tpl_002',
                name: 'recordatorio_pago',
                language: 'es',
                category: 'utility',
                status: 'approved',
                quality_score: 'green',
                components: [{ type: 'BODY', text: 'Tu pago vence pronto' }]
            }
        });

        const approvedList = await service.listTemplates(tenantA, {
            scopeModuleId: moduleId,
            status: 'approved',
            limit: 50,
            offset: 0
        });

        assert.ok(Array.isArray(approvedList?.items), 'listTemplates should return items array');
        assert.equal(approvedList.items.length, 1);
        assert.equal(approvedList.items[0].templateName, 'recordatorio_pago');
        assert.equal(approvedList.items[0].status, 'approved');

        const deleted = await service.deleteTemplate(tenantA, {
            templateId: created.templateId,
            moduleId
        });

        assert.equal(deleted?.template?.templateId, created.templateId);
        assert.equal(deleted?.template?.status, 'deleted');
        assert.ok(Boolean(deleted?.template?.deletedAt), 'deletedAt should be set on soft delete');

        const tenantAAfterDelete = await service.listTemplates(tenantA, {
            scopeModuleId: moduleId,
            limit: 50,
            offset: 0
        });
        assert.equal(
            tenantAAfterDelete.items.some((item) => item.templateId === created.templateId),
            false,
            'soft deleted template must not appear in active list'
        );

        await service.upsertTemplateFromMeta(tenantB, {
            moduleId,
            metaTemplate: {
                id: 'meta_tpl_003',
                name: 'promo_bienvenida',
                language: 'es',
                category: 'marketing',
                status: 'approved',
                components: [{ type: 'BODY', text: 'Hola tenant B' }]
            }
        });

        const tenantAList = await service.listTemplates(tenantA, { limit: 50, offset: 0 });
        const tenantBList = await service.listTemplates(tenantB, { limit: 50, offset: 0 });

        assert.ok(tenantAList.items.every((item) => item.tenantId === tenantA), 'tenant A list must only include tenant A templates');
        assert.ok(tenantBList.items.every((item) => item.tenantId === tenantB), 'tenant B list must only include tenant B templates');
        assert.equal(
            tenantBList.items.some((item) => item.templateId === created.templateId),
            false,
            'tenant B must not access tenant A template'
        );
    } finally {
        restoreDeps();
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDataDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});

