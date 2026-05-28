const test = require('node:test');
const assert = require('node:assert/strict');

function loadCampaignDispatcherJobServiceFresh() {
    const modulePath = require.resolve('../domains/operations/services/campaign-dispatcher-job.service');
    delete require.cache[modulePath];
    return require('../domains/operations/services/campaign-dispatcher-job.service');
}

test('campaign dispatcher completes a successful template send cycle with mocked waClient', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevEnabled = process.env.CAMPAIGN_DISPATCHER_ENABLED;

    process.env.SAAS_STORAGE_DRIVER = 'file';
    process.env.CAMPAIGN_DISPATCHER_ENABLED = 'true';

    const messageHistoryService = require('../domains/operations/services/message-history.service');
    const customerService = require('../domains/tenant/services/customers.service');

    const originalUpsertMessage = messageHistoryService.upsertMessage;
    const originalUpsertFromInteraction = customerService.upsertFromInteraction;
    const originalGetCustomer = customerService.getCustomer;

    const queueJob = {
        jobId: 'job_1',
        campaignId: 'camp_1',
        recipientId: 'cus_1',
        idempotencyKey: 'idem_1',
        moduleId: 'mod_1',
        phone: '+51999999999',
        templateName: 'promo_template',
        variablesJson: {
            components: [
                {
                    type: 'BODY',
                    parameters: [{ type: 'text', text: 'Hola Rosa' }]
                }
            ]
        },
        attemptCount: 0
    };

    const calls = {
        sendTemplateMessage: 0,
        resolveSendWaId: 0,
        ackJob: 0,
        applyQueueJobUpdate: 0,
        upsertMessage: 0,
        ensureTransportForSelectedModule: 0
    };

    try {
        messageHistoryService.upsertMessage = async (tenantId, payload) => {
            calls.upsertMessage += 1;
            assert.equal(tenantId, 'tenant_test');
            assert.equal(payload?.messageType, 'template');
            return payload;
        };
        customerService.getCustomer = async () => ({
            firstName: 'Rosa',
            lastNamePaternal: 'Ballesteros',
            lastNameMaternal: 'Quispe'
        });
        customerService.upsertFromInteraction = async () => ({ ok: true });

        const service = loadCampaignDispatcherJobServiceFresh();
        const dispatcher = service.createCampaignDispatcherJob({
            campaignQueueService: {
                claimBatch: async () => [queueJob],
                ackJob: async (tenantId, { idempotencyKey }) => {
                    calls.ackJob += 1;
                    assert.equal(tenantId, 'tenant_test');
                    assert.equal(idempotencyKey, 'idem_1');
                    return { ...queueJob, status: 'sent' };
                },
                skipJob: async () => ({ ...queueJob, status: 'skipped' }),
                failJob: async () => ({ ...queueJob, status: 'failed' })
            },
            campaignsService: {
                applyQueueJobUpdate: async (tenantId, payload) => {
                    calls.applyQueueJobUpdate += 1;
                    assert.equal(tenantId, 'tenant_test');
                    assert.ok(payload?.queueJob);
                },
                getCampaignById: async () => ({
                    campaignId: 'camp_1',
                    validTo: '2026-05-30T00:00:00.000Z'
                }),
                buildTemplateComponentsForCustomerId: async () => queueJob.variablesJson.components
            },
            customerConsentService: {
                hasMarketingConsent: async () => true
            },
            tenantService: {
                getTenants: () => [{ id: 'tenant_test', active: true }]
            },
            waModuleService: {
                getModuleRuntime: async () => ({
                    tenantId: 'tenant_test',
                    moduleId: 'mod_1',
                    isActive: true,
                    transportMode: 'cloud',
                    channelType: 'whatsapp',
                    phoneNumber: '+51911111111'
                }),
                resolveModuleCloudConfig: () => ({})
            },
            waClient: {
                isReady: true,
                setCloudRuntimeConfig: () => {},
                getRuntimeInfo: () => ({ activeTransport: 'cloud' }),
                setTransportMode: async () => {},
                initialize: async () => {},
                resolveSendWaId: async (phone) => {
                    calls.resolveSendWaId += 1;
                    assert.equal(phone, '+51999999999');
                    return '51999999999';
                },
                sendTemplateMessage: async (phone, payload) => {
                    calls.sendTemplateMessage += 1;
                    assert.equal(phone, '+51999999999');
                    assert.equal(payload?.templateName, 'promo_template');
                    return { messages: [{ id: 'wamid.HBgLMOCK123' }] };
                }
            },
            transportOrchestrator: {
                ensureTransportForSelectedModule: async (moduleContext) => {
                    calls.ensureTransportForSelectedModule += 1;
                    assert.equal(moduleContext?.moduleId, 'mod_1');
                    assert.equal(moduleContext?.tenantId, 'tenant_test');
                }
            },
            metaTemplatesService: {
                getTemplateRecord: async () => ({
                    name: 'promo_template',
                    components: [
                        { type: 'HEADER', format: 'TEXT', text: 'Promo' },
                        { type: 'BODY', text: 'Hola {{1}}' },
                        { type: 'FOOTER', text: 'Lavitat' }
                    ]
                })
            },
            logger: {
                info: () => {},
                warn: () => {}
            },
            opsTelemetry: {
                recordInternalError: () => {}
            }
        });

        const result = await dispatcher.runNow();

        assert.equal(result?.ok, true);
        assert.equal(result?.claimed, 1);
        assert.equal(result?.sent, 1);
        assert.equal(result?.failed, 0);
        assert.equal(result?.skipped, 0);
        assert.equal(calls.sendTemplateMessage, 1);
        assert.equal(calls.ensureTransportForSelectedModule, 1);
        assert.equal(calls.resolveSendWaId, 1);
        assert.equal(calls.ackJob, 1);
        assert.ok(calls.applyQueueJobUpdate >= 2);
        assert.equal(calls.upsertMessage, 1);
    } finally {
        messageHistoryService.upsertMessage = originalUpsertMessage;
        customerService.upsertFromInteraction = originalUpsertFromInteraction;
        customerService.getCustomer = originalGetCustomer;
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.CAMPAIGN_DISPATCHER_ENABLED = prevEnabled;
    }
});

test('campaign dispatcher processes multiple queued sends in one run without retries or errors', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevEnabled = process.env.CAMPAIGN_DISPATCHER_ENABLED;

    process.env.SAAS_STORAGE_DRIVER = 'file';
    process.env.CAMPAIGN_DISPATCHER_ENABLED = 'true';

    const messageHistoryService = require('../domains/operations/services/message-history.service');
    const customerService = require('../domains/tenant/services/customers.service');

    const originalUpsertMessage = messageHistoryService.upsertMessage;
    const originalUpsertFromInteraction = customerService.upsertFromInteraction;
    const originalGetCustomer = customerService.getCustomer;

    const jobs = Array.from({ length: 4 }, (_, index) => ({
        jobId: `job_${index + 1}`,
        campaignId: 'camp_multi',
        recipientId: `cus_${index + 1}`,
        idempotencyKey: `idem_${index + 1}`,
        moduleId: 'mod_1',
        phone: `+5199999999${index + 1}`,
        templateName: 'promo_template',
        variablesJson: {
            components: [
                {
                    type: 'BODY',
                    parameters: [{ type: 'text', text: `Hola cliente ${index + 1}` }]
                }
            ]
        },
        attemptCount: 0
    }));

    const calls = {
        sendTemplateMessage: 0,
        ackJob: 0,
        failJob: 0,
        skipJob: 0,
        upsertMessage: 0,
        ensureTransportForSelectedModule: 0
    };

    try {
        messageHistoryService.upsertMessage = async () => {
            calls.upsertMessage += 1;
            return { ok: true };
        };
        customerService.getCustomer = async (tenantId, customerId) => ({
            firstName: `Nombre ${customerId}`,
            lastNamePaternal: 'Apellido',
            lastNameMaternal: 'Materno'
        });
        customerService.upsertFromInteraction = async () => ({ ok: true });

        const service = loadCampaignDispatcherJobServiceFresh();
        const dispatcher = service.createCampaignDispatcherJob({
            campaignQueueService: {
                claimBatch: async () => jobs,
                ackJob: async (tenantId, { idempotencyKey }) => {
                    calls.ackJob += 1;
                    return jobs.find((job) => job.idempotencyKey === idempotencyKey) || null;
                },
                skipJob: async () => {
                    calls.skipJob += 1;
                    return null;
                },
                failJob: async () => {
                    calls.failJob += 1;
                    return null;
                }
            },
            campaignsService: {
                applyQueueJobUpdate: async () => {},
                getCampaignById: async () => ({
                    campaignId: 'camp_multi',
                    validTo: '2026-05-30T00:00:00.000Z'
                }),
                buildTemplateComponentsForCustomerId: async (tenantId, campaign, customerId) => ([
                    {
                        type: 'BODY',
                        parameters: [{ type: 'text', text: `Hola ${customerId}` }]
                    }
                ])
            },
            customerConsentService: {
                hasMarketingConsent: async () => true
            },
            tenantService: {
                getTenants: () => [{ id: 'tenant_test', active: true }]
            },
            waModuleService: {
                getModuleRuntime: async () => ({
                    tenantId: 'tenant_test',
                    moduleId: 'mod_1',
                    isActive: true,
                    transportMode: 'cloud',
                    channelType: 'whatsapp',
                    phoneNumber: '+51911111111'
                }),
                resolveModuleCloudConfig: () => ({})
            },
            waClient: {
                isReady: true,
                setCloudRuntimeConfig: () => {},
                getRuntimeInfo: () => ({ activeTransport: 'cloud' }),
                setTransportMode: async () => {},
                initialize: async () => {},
                resolveSendWaId: async (phone) => phone.replace('+', ''),
                sendTemplateMessage: async (phone, payload) => {
                    calls.sendTemplateMessage += 1;
                    return { messages: [{ id: `wamid.${payload.templateName}.${phone}` }] };
                }
            },
            transportOrchestrator: {
                ensureTransportForSelectedModule: async (moduleContext) => {
                    calls.ensureTransportForSelectedModule += 1;
                    assert.equal(moduleContext?.moduleId, 'mod_1');
                    assert.equal(moduleContext?.tenantId, 'tenant_test');
                }
            },
            metaTemplatesService: {
                getTemplateRecord: async () => ({
                    name: 'promo_template',
                    components: [
                        { type: 'BODY', text: 'Hola {{1}}' },
                        { type: 'FOOTER', text: 'Lavitat' }
                    ]
                })
            },
            logger: {
                info: () => {},
                warn: () => {}
            },
            opsTelemetry: {
                recordInternalError: () => {}
            }
        });

        const result = await dispatcher.runNow();

        assert.equal(result?.ok, true);
        assert.equal(result?.claimed, 4);
        assert.equal(result?.sent, 4);
        assert.equal(result?.failed, 0);
        assert.equal(result?.skipped, 0);
        assert.equal(calls.sendTemplateMessage, 4);
        assert.equal(calls.ensureTransportForSelectedModule, 4);
        assert.equal(calls.ackJob, 4);
        assert.equal(calls.failJob, 0);
        assert.equal(calls.skipJob, 0);
        assert.equal(calls.upsertMessage, 4);
    } finally {
        messageHistoryService.upsertMessage = originalUpsertMessage;
        customerService.upsertFromInteraction = originalUpsertFromInteraction;
        customerService.getCustomer = originalGetCustomer;
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.CAMPAIGN_DISPATCHER_ENABLED = prevEnabled;
    }
});

test('campaign dispatcher falls back to direct cloud transport activation when no orchestrator is injected', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevEnabled = process.env.CAMPAIGN_DISPATCHER_ENABLED;

    process.env.SAAS_STORAGE_DRIVER = 'file';
    process.env.CAMPAIGN_DISPATCHER_ENABLED = 'true';

    const messageHistoryService = require('../domains/operations/services/message-history.service');
    const customerService = require('../domains/tenant/services/customers.service');

    const originalUpsertMessage = messageHistoryService.upsertMessage;
    const originalUpsertFromInteraction = customerService.upsertFromInteraction;
    const originalGetCustomer = customerService.getCustomer;

    const queueJob = {
        jobId: 'job_fallback',
        campaignId: 'camp_fallback',
        recipientId: 'cus_fallback',
        idempotencyKey: 'idem_fallback',
        moduleId: 'mod_fallback',
        phone: '+51988877766',
        templateName: 'promo_template',
        variablesJson: {
            components: [
                {
                    type: 'BODY',
                    parameters: [{ type: 'text', text: 'Hola fallback' }]
                }
            ]
        },
        attemptCount: 0
    };

    const calls = {
        setCloudRuntimeConfig: 0,
        setTransportMode: 0,
        initialize: 0,
        sendTemplateMessage: 0
    };

    try {
        messageHistoryService.upsertMessage = async () => ({ ok: true });
        customerService.getCustomer = async () => ({
            firstName: 'Laura',
            lastNamePaternal: 'Mendoza',
            lastNameMaternal: 'Rios'
        });
        customerService.upsertFromInteraction = async () => ({ ok: true });

        const service = loadCampaignDispatcherJobServiceFresh();
        const dispatcher = service.createCampaignDispatcherJob({
            campaignQueueService: {
                claimBatch: async () => [queueJob],
                ackJob: async () => ({ ...queueJob, status: 'sent' }),
                skipJob: async () => ({ ...queueJob, status: 'skipped' }),
                failJob: async () => ({ ...queueJob, status: 'failed' })
            },
            campaignsService: {
                applyQueueJobUpdate: async () => {},
                getCampaignById: async () => ({
                    campaignId: 'camp_fallback',
                    validTo: '2026-05-30T00:00:00.000Z'
                }),
                buildTemplateComponentsForCustomerId: async () => queueJob.variablesJson.components
            },
            customerConsentService: {
                hasMarketingConsent: async () => true
            },
            tenantService: {
                getTenants: () => [{ id: 'tenant_test', active: true }]
            },
            waModuleService: {
                getModuleRuntime: async () => ({
                    tenantId: 'tenant_test',
                    moduleId: 'mod_fallback',
                    isActive: true,
                    transportMode: 'cloud',
                    channelType: 'whatsapp',
                    phoneNumber: '+51911111111'
                }),
                resolveModuleCloudConfig: () => ({ accessToken: 'token', phoneNumberId: 'pnid' })
            },
            waClient: {
                isReady: false,
                setCloudRuntimeConfig: (config) => {
                    calls.setCloudRuntimeConfig += 1;
                    assert.equal(config?.tenantId, 'tenant_test');
                },
                getRuntimeInfo: () => ({ activeTransport: 'idle' }),
                setTransportMode: async (mode) => {
                    calls.setTransportMode += 1;
                    assert.equal(mode, 'cloud');
                    return { activeTransport: 'cloud' };
                },
                initialize: async () => {
                    calls.initialize += 1;
                },
                resolveSendWaId: async () => '51988877766',
                sendTemplateMessage: async () => {
                    calls.sendTemplateMessage += 1;
                    return { messages: [{ id: 'wamid.HBgLFALLBACK123' }] };
                }
            },
            metaTemplatesService: {
                getTemplateRecord: async () => ({
                    name: 'promo_template',
                    components: [
                        { type: 'BODY', text: 'Hola {{1}}' }
                    ]
                })
            },
            logger: {
                info: () => {},
                warn: () => {}
            },
            opsTelemetry: {
                recordInternalError: () => {}
            }
        });

        const result = await dispatcher.runNow();

        assert.equal(result?.ok, true);
        assert.equal(result?.sent, 1);
        assert.equal(calls.setCloudRuntimeConfig, 1);
        assert.equal(calls.setTransportMode, 1);
        assert.equal(calls.initialize, 1);
        assert.equal(calls.sendTemplateMessage, 1);
    } finally {
        messageHistoryService.upsertMessage = originalUpsertMessage;
        customerService.upsertFromInteraction = originalUpsertFromInteraction;
        customerService.getCustomer = originalGetCustomer;
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.CAMPAIGN_DISPATCHER_ENABLED = prevEnabled;
    }
});
