const {
    getStorageDriver,
    queryPostgres
} = require('../../../config/persistence-runtime');

function ensureAuthenticated(req, res, authService) {
    if (authService.isAuthEnabled() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

function resolveTenantIdFromContext(req) {
    return String(req?.tenantContext?.id || 'default').trim() || 'default';
}

function resolveActorUserId(req) {
    return String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim() || null;
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function isPlainObject(value = null) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function toSafeObject(value = null) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePreferredLanguage(value = '') {
    const normalized = toLower(value || 'es').replace(/[^a-z_-]/g, '');
    if (!normalized) return 'es';
    return normalized.slice(0, 16);
}

function registerOperationsHttpRoutes({
    app,
    authService,
    auditLogService,
    customerService,
    customerConsentService,
    customerModuleContextsService,
    templateWebhookEventsService,
    templateVariablesService,
    conversationOpsService,
    chatCommercialStatusService,
    metaTemplatesService,
    chatAssignmentPolicyService,
    assignmentRulesService,
    chatAssignmentRouterService,
    operationsKpiService,
    normalizeScopeModuleId,
    hasConversationEventsReadAccess,
    hasChatAssignmentsReadAccess,
    hasChatAssignmentsWriteAccess,
    hasAssignmentRulesReadAccess,
    hasAssignmentRulesWriteAccess,
    hasOperationsKpiReadAccess,
    emitCommercialStatusUpdated
}) {
    if (!app) throw new Error('registerOperationsHttpRoutes requiere app.');
    const assignmentPolicy = chatAssignmentPolicyService && typeof chatAssignmentPolicyService === 'object'
        ? chatAssignmentPolicyService
        : {};

    const assertInitialAssignmentAllowed = typeof assignmentPolicy.assertInitialAssignmentAllowed === 'function'
        ? assignmentPolicy.assertInitialAssignmentAllowed.bind(assignmentPolicy)
        : () => ({ ok: true });
    const assertTakeChatAllowed = typeof assignmentPolicy.assertTakeChatAllowed === 'function'
        ? assignmentPolicy.assertTakeChatAllowed.bind(assignmentPolicy)
        : () => ({ ok: true });
    const assertReleaseAllowed = typeof assignmentPolicy.assertReleaseAllowed === 'function'
        ? assignmentPolicy.assertReleaseAllowed.bind(assignmentPolicy)
        : () => ({ ok: true });
    const resolveActorTenantRole = typeof assignmentPolicy.resolveActorTenantRole === 'function'
        ? assignmentPolicy.resolveActorTenantRole.bind(assignmentPolicy)
        : () => 'seller';
    const commercialStatusApi = chatCommercialStatusService && typeof chatCommercialStatusService === 'object'
        ? chatCommercialStatusService
        : {};
    const getChatCommercialStatus = typeof commercialStatusApi.getChatCommercialStatus === 'function'
        ? commercialStatusApi.getChatCommercialStatus.bind(commercialStatusApi)
        : async () => null;
    const listCommercialStatuses = typeof commercialStatusApi.listCommercialStatuses === 'function'
        ? commercialStatusApi.listCommercialStatuses.bind(commercialStatusApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const markManualStatus = typeof commercialStatusApi.markManualStatus === 'function'
        ? commercialStatusApi.markManualStatus.bind(commercialStatusApi)
        : async () => {
            throw new Error('Servicio de estado comercial no disponible.');
        };
    const metaTemplatesApi = metaTemplatesService && typeof metaTemplatesService === 'object'
        ? metaTemplatesService
        : {};
    const createMetaTemplate = typeof metaTemplatesApi.createTemplate === 'function'
        ? metaTemplatesApi.createTemplate.bind(metaTemplatesApi)
        : async () => {
            throw new Error('Servicio de templates Meta no disponible.');
        };
    const listMetaTemplates = typeof metaTemplatesApi.listTemplates === 'function'
        ? metaTemplatesApi.listTemplates.bind(metaTemplatesApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const deleteMetaTemplate = typeof metaTemplatesApi.deleteTemplate === 'function'
        ? metaTemplatesApi.deleteTemplate.bind(metaTemplatesApi)
        : async () => {
            throw new Error('Servicio de templates Meta no disponible.');
        };
    const syncMetaTemplatesFromMeta = typeof metaTemplatesApi.syncTemplatesFromMeta === 'function'
        ? metaTemplatesApi.syncTemplatesFromMeta.bind(metaTemplatesApi)
        : async () => {
            throw new Error('Servicio de templates Meta no disponible.');
        };

    function ensureMetaTemplateWriteAccess(req, tenantId) {
        if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
            return { ok: false, statusCode: 403, error: 'No autorizado.' };
        }
        const role = String(resolveActorTenantRole({ req, tenantId }) || 'seller').trim().toLowerCase();
        if (!['owner', 'admin'].includes(role)) {
            return { ok: false, statusCode: 403, error: 'Solo owner/admin pueden gestionar templates Meta.' };
        }
        return { ok: true, role };
    }
    const consentApi = customerConsentService && typeof customerConsentService === 'object'
        ? customerConsentService
        : {};
    const grantConsent = typeof consentApi.grantConsent === 'function'
        ? consentApi.grantConsent.bind(consentApi)
        : async () => {
            throw new Error('Servicio de consentimiento no disponible.');
        };
    const revokeConsent = typeof consentApi.revokeConsent === 'function'
        ? consentApi.revokeConsent.bind(consentApi)
        : async () => {
            throw new Error('Servicio de consentimiento no disponible.');
        };
    const customerModuleContextsApi = customerModuleContextsService && typeof customerModuleContextsService === 'object'
        ? customerModuleContextsService
        : {};
    const listCustomerModuleContextsByCustomer = typeof customerModuleContextsApi.listContextsByCustomer === 'function'
        ? customerModuleContextsApi.listContextsByCustomer.bind(customerModuleContextsApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const upsertCustomerModuleContext = typeof customerModuleContextsApi.upsertContext === 'function'
        ? customerModuleContextsApi.upsertContext.bind(customerModuleContextsApi)
        : async () => {
            throw new Error('Servicio de contextos por modulo no disponible.');
        };
    const templateWebhookEventsApi = templateWebhookEventsService && typeof templateWebhookEventsService === 'object'
        ? templateWebhookEventsService
        : {};
    const listTemplateWebhookEvents = typeof templateWebhookEventsApi.listTemplateWebhookEvents === 'function'
        ? templateWebhookEventsApi.listTemplateWebhookEvents.bind(templateWebhookEventsApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const templateVariablesApi = templateVariablesService && typeof templateVariablesService === 'object'
        ? templateVariablesService
        : {};
    const getTemplateVariablesCatalog = typeof templateVariablesApi.getCatalog === 'function'
        ? templateVariablesApi.getCatalog.bind(templateVariablesApi)
        : async () => ({ tenantId: 'default', generatedAt: null, categories: [], variables: [] });
    const getTemplateVariablesPreview = typeof templateVariablesApi.getPreview === 'function'
        ? templateVariablesApi.getPreview.bind(templateVariablesApi)
        : async (tenantId) => ({ tenantId, generatedAt: null, context: { chatId: null, customerId: null }, categories: [], variables: [] });

    app.patch('/api/tenant/customers/:customerId/consent', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const consentType = toLower(req.body?.consentType || 'marketing') || 'marketing';
            const statusRaw = toLower(req.body?.status || '');
            const source = toLower(req.body?.source || 'manual') || 'manual';
            const moduleId = toText(req.body?.moduleId || '');
            const proofPayload = toSafeObject(req.body?.proofPayload);
            const actorUserId = resolveActorUserId(req);

            let result = null;
            if (['granted', 'opted_in'].includes(statusRaw)) {
                result = await grantConsent(tenantId, {
                    customerId,
                    consentType,
                    source,
                    proofPayload: {
                        ...proofPayload,
                        actorUserId
                    }
                });
            } else if (['revoked', 'opted_out'].includes(statusRaw)) {
                result = await revokeConsent(tenantId, {
                    customerId,
                    consentType,
                    source,
                    proofPayload: {
                        ...proofPayload,
                        actorUserId
                    }
                });
            } else {
                return res.status(400).json({ ok: false, error: 'status invalido. Usa granted/revoked (o opted_in/opted_out).' });
            }

            const nextMarketingOptInStatus = ['granted', 'opted_in'].includes(statusRaw)
                ? 'opted_in'
                : 'opted_out';
            const consentUpdatedAt = toText(
                result?.grantedAt
                || result?.revokedAt
                || result?.createdAt
                || new Date().toISOString()
            );
            const updatedContexts = [];

            if (moduleId) {
                const syncResult = await upsertCustomerModuleContext(tenantId, {
                    customerId,
                    moduleId,
                    marketingOptInStatus: nextMarketingOptInStatus,
                    marketingOptInUpdatedAt: consentUpdatedAt,
                    marketingOptInSource: source,
                    metadata: {
                        consentType,
                        syncedFrom: 'http.customers.consent',
                        actorUserId
                    }
                });
                if (syncResult?.context) updatedContexts.push(syncResult.context);
            } else {
                const contextsResult = await listCustomerModuleContextsByCustomer(tenantId, {
                    customerId,
                    limit: 500,
                    offset: 0
                });
                const contexts = Array.isArray(contextsResult?.items) ? contextsResult.items : [];
                for (const context of contexts) {
                    const targetModuleId = toText(context?.moduleId || context?.module_id || '');
                    if (!targetModuleId) continue;
                    const syncResult = await upsertCustomerModuleContext(tenantId, {
                        customerId,
                        moduleId: targetModuleId,
                        marketingOptInStatus: nextMarketingOptInStatus,
                        marketingOptInUpdatedAt: consentUpdatedAt,
                        marketingOptInSource: source,
                        metadata: {
                            consentType,
                            syncedFrom: 'http.customers.consent',
                            actorUserId
                        }
                    });
                    if (syncResult?.context) updatedContexts.push(syncResult.context);
                }
            }

            return res.json({
                ok: true,
                tenantId,
                customerId,
                consent: result,
                contextSync: {
                    moduleId: moduleId || null,
                    marketingOptInStatus: nextMarketingOptInStatus,
                    updatedCount: updatedContexts.length
                }
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el consentimiento.') });
        }
    });

    app.patch('/api/tenant/customers/:customerId/language', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const preferredLanguage = normalizePreferredLanguage(req.body?.preferredLanguage || 'es');

            if (getStorageDriver() === 'postgres') {
                const result = await queryPostgres(
                    `UPDATE tenant_customers
                        SET preferred_language = $3,
                            updated_at = NOW()
                      WHERE tenant_id = $1
                        AND customer_id = $2
                    RETURNING customer_id, preferred_language`,
                    [tenantId, customerId, preferredLanguage]
                );
                const row = Array.isArray(result?.rows) ? result.rows[0] : null;
                if (!row) return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
                return res.json({
                    ok: true,
                    tenantId,
                    customerId: String(row.customer_id || customerId),
                    preferredLanguage: String(row.preferred_language || preferredLanguage)
                });
            }

            const updateResult = await customerService.updateCustomer(tenantId, customerId, {
                metadata: {
                    preferredLanguage
                }
            });

            return res.json({
                ok: true,
                tenantId,
                customerId,
                preferredLanguage,
                customer: updateResult?.item || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el idioma preferido.') });
        }
    });

    app.get('/api/tenant/template-webhook-events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const templateName = toText(req.query?.templateName || '');
            const eventType = toLower(req.query?.eventType || '');
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await listTemplateWebhookEvents(tenantId, {
                templateName,
                eventType,
                limit,
                offset
            });

            return res.json({
                ok: true,
                tenantId,
                templateName: templateName || null,
                eventType: eventType || null,
                ...result
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo listar eventos webhook de templates.') });
        }
    });

    app.get('/api/tenant/template-variables/catalog', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            const payload = await getTemplateVariablesCatalog(tenantId);
            return res.json({
                ok: true,
                tenantId,
                ...toSafeObject(payload)
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el catalogo de variables de template.') });
        }
    });

    app.get('/api/tenant/template-variables/preview', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            const chatId = toText(req.query?.chatId || '');
            const customerId = toText(req.query?.customerId || '');
            const payload = await getTemplateVariablesPreview(tenantId, { chatId, customerId });
            return res.json({
                ok: true,
                tenantId,
                ...toSafeObject(payload)
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar la previsualizacion de variables de template.') });
        }
    });

    app.get('/api/tenant/chats/:chatId/events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasConversationEventsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const eventTypes = String(req.query?.eventTypes || '').trim()
                .split(',')
                .map((entry) => String(entry || '').trim())
                .filter(Boolean);
            const limit = Number(req.query?.limit || 60);
            const offset = Number(req.query?.offset || 0);

            const result = await conversationOpsService.listConversationEvents(tenantId, {
                chatId,
                scopeModuleId,
                eventTypes,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar eventos de conversacion.') });
        }
    });

    app.get('/api/tenant/chats/:chatId/assignment', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const assignment = await conversationOpsService.getChatAssignment(tenantId, { chatId, scopeModuleId });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, assignment });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar la asignacion del chat.') });
        }
    });

    app.get('/api/tenant/chats/:chatId/commercial-status', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const commercialStatus = await getChatCommercialStatus(tenantId, { chatId, scopeModuleId });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, commercialStatus });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el estado comercial del chat.') });
        }
    });

    app.put('/api/tenant/chats/:chatId/commercial-status', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const targetStatus = toLower(req.body?.status || '');
            if (!['vendido', 'perdido'].includes(targetStatus)) {
                return res.status(400).json({ ok: false, error: 'Estado comercial invalido. Solo vendido/perdido.' });
            }

            const actorUserId = resolveActorUserId(req);
            const reason = String(req.body?.reason || '').trim();
            const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
                ? req.body.metadata
                : {};

            const result = await markManualStatus(tenantId, {
                chatId,
                scopeModuleId,
                status: targetStatus,
                source: 'manual',
                reason: reason || ('manual_mark_' + targetStatus),
                changedByUserId: actorUserId,
                metadata
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.commercial_status.updated',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    previousStatus: result?.previous?.status || null,
                    nextStatus: result?.status?.status || null,
                    changed: Boolean(result?.changed)
                }
            });

            if (typeof emitCommercialStatusUpdated === 'function') {
                emitCommercialStatusUpdated({
                    tenantId,
                    chatId,
                    scopeModuleId,
                    result,
                    source: 'http'
                });
            }

            return res.json({
                ok: true,
                tenantId,
                chatId,
                scopeModuleId,
                changed: Boolean(result?.changed),
                previousCommercialStatus: result?.previous || null,
                commercialStatus: result?.status || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el estado comercial del chat.') });
        }
    });

    app.get('/api/tenant/commercial-statuses', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const status = toLower(req.query?.status || '');
            const limit = Number(req.query?.limit || 200);
            const offset = Number(req.query?.offset || 0);

            const result = await listCommercialStatuses(tenantId, {
                scopeModuleId,
                status,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, scopeModuleId, status: status || null, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo listar estados comerciales.') });
        }
    });

    app.post('/api/tenant/meta-templates', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureMetaTemplateWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const moduleId = String(req.body?.moduleId || '').trim();
            const templatePayload = isPlainObject(req.body?.templatePayload) ? req.body.templatePayload : null;
            if (!moduleId) return res.status(400).json({ ok: false, error: 'moduleId requerido.' });
            if (!templatePayload) return res.status(400).json({ ok: false, error: 'templatePayload requerido.' });

            const result = await createMetaTemplate(tenantId, { moduleId, templatePayload });

            await auditLogService.writeAuditLog(tenantId, {
                userId: resolveActorUserId(req),
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'meta.template.create',
                resourceType: 'meta_template',
                resourceId: String(result?.template?.templateId || result?.template?.templateName || ''),
                source: 'http',
                payload: {
                    moduleId,
                    templateName: result?.template?.templateName || null,
                    templateLanguage: result?.template?.templateLanguage || null,
                    status: result?.template?.status || null
                }
            });

            return res.status(201).json({
                ok: true,
                tenantId,
                template: result?.template || null,
                metaResponse: result?.metaResponse || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear template Meta.') });
        }
    });

    app.get('/api/tenant/meta-templates', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const status = String(req.query?.status || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await listMetaTemplates(tenantId, {
                scopeModuleId,
                status,
                limit,
                offset
            });

            return res.json({
                ok: true,
                tenantId,
                scopeModuleId: scopeModuleId || '',
                status: status || null,
                ...result
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron listar templates Meta.') });
        }
    });

    app.delete('/api/tenant/meta-templates/:templateId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureMetaTemplateWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const templateId = String(req.params?.templateId || '').trim();
            const moduleId = String(req.query?.moduleId || req.body?.moduleId || '').trim();
            if (!templateId) return res.status(400).json({ ok: false, error: 'templateId requerido.' });

            const result = await deleteMetaTemplate(tenantId, { templateId, moduleId });

            await auditLogService.writeAuditLog(tenantId, {
                userId: resolveActorUserId(req),
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'meta.template.delete',
                resourceType: 'meta_template',
                resourceId: templateId,
                source: 'http',
                payload: {
                    moduleId: moduleId || null,
                    deletedTemplateId: result?.template?.templateId || templateId,
                    templateName: result?.template?.templateName || null
                }
            });

            return res.json({
                ok: true,
                tenantId,
                templateId,
                template: result?.template || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar template Meta.') });
        }
    });

    app.post('/api/tenant/meta-templates/sync', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureMetaTemplateWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const moduleId = String(req.body?.moduleId || req.query?.moduleId || '').trim();
            if (!moduleId) return res.status(400).json({ ok: false, error: 'moduleId requerido para sincronizar.' });

            const result = await syncMetaTemplatesFromMeta(tenantId, { moduleId });

            await auditLogService.writeAuditLog(tenantId, {
                userId: resolveActorUserId(req),
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'meta.template.sync',
                resourceType: 'meta_template',
                resourceId: moduleId,
                source: 'http',
                payload: {
                    moduleId,
                    scopeModuleId: result?.scopeModuleId || null,
                    totalSynced: Number(result?.totalSynced || 0)
                }
            });

            return res.json({
                ok: true,
                tenantId,
                moduleId,
                scopeModuleId: result?.scopeModuleId || null,
                totalSynced: Number(result?.totalSynced || 0),
                items: Array.isArray(result?.items) ? result.items : []
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo sincronizar templates Meta.') });
        }
    });

    app.put('/api/tenant/chats/:chatId/assignment', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const assigneeUserId = String(req.body?.assigneeUserId || '').trim();
            const requestedAssigneeRole = String(req.body?.assigneeRole || '').trim().toLowerCase();
            const assignmentReason = String(req.body?.assignmentReason || '').trim();
            const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
                ? req.body.metadata
                : {};
            const previousAssignment = await conversationOpsService.getChatAssignment(tenantId, { chatId, scopeModuleId });
            const isInitialAssignment = Boolean(assigneeUserId) && !toText(previousAssignment?.assigneeUserId);

            if (isInitialAssignment) {
                const policyResult = assertInitialAssignmentAllowed({ req, tenantId });
                if (!policyResult?.ok) {
                    return res.status(Number(policyResult?.statusCode || 403)).json({ ok: false, error: String(policyResult?.error || 'No autorizado.') });
                }
            }

            let resolvedAssigneeRole = requestedAssigneeRole || null;

            if (assigneeUserId) {
                const assignee = authService.findUserRecord({ userId: assigneeUserId });
                if (!assignee) {
                    return res.status(400).json({ ok: false, error: 'El usuario asignado no existe.' });
                }

                const memberships = Array.isArray(assignee.memberships) ? assignee.memberships : [];
                const activeMembership = memberships.find((membership) =>
                    String(membership?.tenantId || '').trim() === tenantId && membership?.active !== false
                );
                if (!activeMembership) {
                    return res.status(400).json({ ok: false, error: 'El usuario no pertenece a esta empresa.' });
                }
                if (!resolvedAssigneeRole) {
                    resolvedAssigneeRole = String(activeMembership?.role || assignee?.role || 'seller').trim().toLowerCase() || 'seller';
                }
            }

            const actorUserId = resolveActorUserId(req);
            const result = await conversationOpsService.upsertChatAssignment(tenantId, {
                chatId,
                scopeModuleId,
                assigneeUserId: assigneeUserId || null,
                assigneeRole: resolvedAssigneeRole || null,
                assignedByUserId: actorUserId,
                assignmentMode: 'manual',
                assignmentReason,
                metadata,
                status: assigneeUserId ? 'active' : 'released'
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.updated',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    previousAssigneeUserId: result?.previous?.assigneeUserId || null,
                    nextAssigneeUserId: result?.assignment?.assigneeUserId || null,
                    changed: Boolean(result?.changed)
                }
            });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, ...result, previousAssignment: result?.previous || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar la asignacion del chat.') });
        }
    });

    app.post('/api/tenant/chats/:chatId/take', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const policyResult = assertTakeChatAllowed({ req, tenantId });
            if (!policyResult?.ok) {
                return res.status(Number(policyResult?.statusCode || 403)).json({ ok: false, error: String(policyResult?.error || 'No autorizado.') });
            }

            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const assignmentReason = String(req.body?.assignmentReason || '').trim() || 'take_chat';
            const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
                ? req.body.metadata
                : {};
            const actorUserId = resolveActorUserId(req);
            if (!actorUserId) return res.status(401).json({ ok: false, error: 'No autenticado.' });

            const actorRole = String(resolveActorTenantRole({ req, tenantId }) || 'seller').trim().toLowerCase() || 'seller';
            const result = await conversationOpsService.upsertChatAssignment(tenantId, {
                chatId,
                scopeModuleId,
                assigneeUserId: actorUserId,
                assigneeRole: actorRole,
                assignedByUserId: actorUserId,
                assignmentMode: 'take',
                assignmentReason,
                metadata,
                status: 'active'
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.taken',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    previousAssigneeUserId: result?.previous?.assigneeUserId || null,
                    nextAssigneeUserId: result?.assignment?.assigneeUserId || null,
                    changed: Boolean(result?.changed)
                }
            });

            return res.json({
                ok: true,
                tenantId,
                chatId,
                scopeModuleId,
                changed: Boolean(result?.changed),
                previousAssignment: result?.previous || null,
                assignment: result?.assignment || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo tomar el chat.') });
        }
    });

    app.delete('/api/tenant/chats/:chatId/assignment', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || req.body?.scopeModuleId || '');
            const actorUserId = resolveActorUserId(req);
            const policyResult = assertReleaseAllowed({ req, tenantId });
            if (!policyResult?.ok) {
                return res.status(Number(policyResult?.statusCode || 403)).json({ ok: false, error: String(policyResult?.error || 'No autorizado.') });
            }
            const result = await conversationOpsService.clearChatAssignment(tenantId, {
                chatId,
                scopeModuleId,
                assignedByUserId: actorUserId,
                assignmentMode: 'manual',
                assignmentReason: 'release'
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.cleared',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    previousAssigneeUserId: result?.previous?.assigneeUserId || null
                }
            });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo liberar la asignacion.') });
        }
    });

    app.get('/api/tenant/assignments', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const assigneeUserId = String(req.query?.assigneeUserId || '').trim();
            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const status = String(req.query?.status || '').trim();
            const limit = Number(req.query?.limit || 60);
            const offset = Number(req.query?.offset || 0);

            const result = await conversationOpsService.listChatAssignments(tenantId, {
                assigneeUserId,
                scopeModuleId,
                status,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar asignaciones.') });
        }
    });

    app.get('/api/tenant/assignment-events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.query?.chatId || '').trim();
            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const limit = Number(req.query?.limit || 60);
            const offset = Number(req.query?.offset || 0);

            const result = await conversationOpsService.listChatAssignmentEvents(tenantId, {
                chatId,
                scopeModuleId,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar eventos de asignacion.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/assignment-rules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasAssignmentRulesReadAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const items = await assignmentRulesService.listRules(tenantId);
            const effective = await assignmentRulesService.getEffectiveRule(tenantId, scopeModuleId || '');
            return res.json({ ok: true, tenantId, scopeModuleId, items, effective });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar reglas de asignacion.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/assignment-rules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasAssignmentRulesWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const actorUserId = resolveActorUserId(req);
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const saved = await assignmentRulesService.upsertRule(tenantId, {
                scopeModuleId: normalizeScopeModuleId(payload.scopeModuleId || ''),
                enabled: payload.enabled === true,
                mode: payload.mode,
                allowedRoles: Array.isArray(payload.allowedRoles) ? payload.allowedRoles : [],
                maxOpenChatsPerUser: payload.maxOpenChatsPerUser,
                metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
                updatedByUserId: actorUserId
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.rule.updated',
                resourceType: 'assignment_rule',
                resourceId: String(saved?.scopeModuleId || ''),
                source: 'http',
                payload: {
                    scopeModuleId: saved?.scopeModuleId || '',
                    enabled: saved?.enabled === true,
                    mode: saved?.mode || 'least_load',
                    maxOpenChatsPerUser: saved?.maxOpenChatsPerUser || null,
                    allowedRoles: Array.isArray(saved?.allowedRoles) ? saved.allowedRoles : []
                }
            });

            return res.json({ ok: true, tenantId, rule: saved });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar la regla de asignacion.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/chats/:chatId/auto-assign', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const chatId = String(req.params?.chatId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });
        if (!hasAssignmentRulesWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const actorUserId = resolveActorUserId(req);
            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const trigger = String(req.body?.trigger || 'manual').trim().toLowerCase() || 'manual';
            const assignmentReason = String(req.body?.assignmentReason || '').trim();

            const result = await chatAssignmentRouterService.autoAssignChat(tenantId, {
                chatId,
                scopeModuleId,
                actorUserId,
                trigger,
                assignmentReason
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.auto.assign',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    trigger,
                    resultMode: result?.mode || null,
                    reused: Boolean(result?.reused),
                    selectedCandidate: result?.selectedCandidate || null,
                    reason: result?.reason || null
                }
            });

            return res.json({ ok: Boolean(result?.ok), tenantId, chatId, scopeModuleId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo autoasignar el chat.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/kpis/operations', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasOperationsKpiReadAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const from = req.query?.from || req.query?.fromUnix || null;
            const to = req.query?.to || req.query?.toUnix || null;
            const assigneeUserId = String(req.query?.assigneeUserId || '').trim();

            const kpis = await operationsKpiService.getOperationsKpis(tenantId, {
                from,
                to,
                scopeModuleId,
                assigneeUserId
            });

            return res.json({ ok: true, tenantId, scopeModuleId, assigneeUserId: assigneeUserId || null, ...kpis });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar KPIs operativos.') });
        }
    });

    app.get('/api/tenant/assignment-rules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasAssignmentRulesReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const items = await assignmentRulesService.listRules(tenantId);
            const effective = await assignmentRulesService.getEffectiveRule(tenantId, scopeModuleId || '');
            return res.json({ ok: true, tenantId, scopeModuleId, items, effective });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar reglas de asignacion.') });
        }
    });

    app.put('/api/tenant/assignment-rules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasAssignmentRulesWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const actorUserId = resolveActorUserId(req);
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const saved = await assignmentRulesService.upsertRule(tenantId, {
                scopeModuleId: normalizeScopeModuleId(payload.scopeModuleId || ''),
                enabled: payload.enabled === true,
                mode: payload.mode,
                allowedRoles: Array.isArray(payload.allowedRoles) ? payload.allowedRoles : [],
                maxOpenChatsPerUser: payload.maxOpenChatsPerUser,
                metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
                updatedByUserId: actorUserId
            });

            return res.json({ ok: true, tenantId, rule: saved });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar la regla de asignacion.') });
        }
    });

    app.post('/api/tenant/chats/:chatId/auto-assign', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasAssignmentRulesWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const actorUserId = resolveActorUserId(req);
            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const trigger = String(req.body?.trigger || 'manual').trim().toLowerCase() || 'manual';
            const assignmentReason = String(req.body?.assignmentReason || '').trim();

            const result = await chatAssignmentRouterService.autoAssignChat(tenantId, {
                chatId,
                scopeModuleId,
                actorUserId,
                trigger,
                assignmentReason
            });

            return res.json({ ok: Boolean(result?.ok), tenantId, chatId, scopeModuleId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo autoasignar el chat.') });
        }
    });

    app.get('/api/tenant/kpis/operations', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasOperationsKpiReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const from = req.query?.from || req.query?.fromUnix || null;
            const to = req.query?.to || req.query?.toUnix || null;
            const assigneeUserId = String(req.query?.assigneeUserId || '').trim();

            const kpis = await operationsKpiService.getOperationsKpis(tenantId, {
                from,
                to,
                scopeModuleId,
                assigneeUserId
            });

            return res.json({ ok: true, tenantId, scopeModuleId, assigneeUserId: assigneeUserId || null, ...kpis });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar KPIs operativos.') });
        }
    });
}

module.exports = {
    registerOperationsHttpRoutes
};

