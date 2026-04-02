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

function registerOperationsHttpRoutes({
    app,
    authService,
    auditLogService,
    conversationOpsService,
    chatCommercialStatusService,
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

