function normalizeSocketModuleId(value = '') {
    return String(value || '').trim().toLowerCase();
}

function createSocketTransportOrchestrator({
    socket,
    tenantId = 'default',
    authContext = null,
    authzAudit,
    waClient,
    waModuleService,
    resolveSocketModuleContext,
    runtimeStore,
    guardRateLimit,
    getTenantRoom,
    getTenantModuleRoom,
    getWaRuntime,
    emitWaCapabilities,
    setActiveRuntimeContext,
    invalidateChatListCache,
    waRequireSelectedModule = false
} = {}) {
    const getRequestedModuleIdFromSocket = () => normalizeSocketModuleId(
        socket?.handshake?.auth?.waModuleId
        || socket?.handshake?.auth?.moduleId
        || socket?.handshake?.query?.waModuleId
        || socket?.handshake?.query?.moduleId
        || ''
    );

    const emitWaModuleContext = async ({ requestedModuleId = '' } = {}) => {
        const cleanRequested = normalizeSocketModuleId(requestedModuleId || getRequestedModuleIdFromSocket());
        const moduleContext = await resolveSocketModuleContext(tenantId, authContext, cleanRequested);
        const selected = moduleContext?.selected || null;
        const modules = Array.isArray(moduleContext?.modules) ? moduleContext.modules : [];

        socket.data = socket.data || {};
        socket.data.waModule = selected;
        socket.data.waModuleId = selected?.moduleId || '';
        socket.data.waModules = modules;

        const previousModuleRoom = String(socket?.data?.waModuleRoom || '').trim();
        const nextModuleId = selected?.moduleId || 'default';
        const nextModuleRoom = getTenantModuleRoom(tenantId, nextModuleId);
        if (previousModuleRoom && previousModuleRoom !== nextModuleRoom) {
            socket.leave(previousModuleRoom);
        }
        if (nextModuleRoom && previousModuleRoom !== nextModuleRoom) {
            socket.join(nextModuleRoom);
        }
        socket.data.waModuleRoom = nextModuleRoom;

        const payload = {
            tenantId,
            items: modules,
            selected
        };
        socket.emit('wa_module_context', payload);
        return payload;
    };

    const applyCloudConfigForModule = async (selectedModule = null) => {
        if (!selectedModule || typeof selectedModule !== 'object') return null;
        if (String(selectedModule?.transportMode || '').trim().toLowerCase() !== 'cloud') return null;
        if (typeof waModuleService.resolveModuleCloudConfig !== 'function') return null;
        if (typeof waClient.setCloudRuntimeConfig !== 'function') return null;

        let moduleForRuntime = selectedModule;
        try {
            const moduleId = String(selectedModule?.moduleId || '').trim();
            if (moduleId && typeof waModuleService.getModuleRuntime === 'function') {
                const runtimeModule = await waModuleService.getModuleRuntime(tenantId, moduleId);
                if (runtimeModule) moduleForRuntime = runtimeModule;
            }
        } catch (_) {
            // fallback: usar modulo actual de contexto
        }

        const runtimeCloudConfig = waModuleService.resolveModuleCloudConfig(moduleForRuntime);
        waClient.setCloudRuntimeConfig(runtimeCloudConfig || {});
        return runtimeCloudConfig || null;
    };

    const ensureTransportForSelectedModule = async (selectedModule = null) => {
        const moduleTransport = String(selectedModule?.transportMode || '').trim().toLowerCase();
        if (moduleTransport !== 'cloud') return null;
        await applyCloudConfigForModule(selectedModule);

        const namespaceChanged = false;
        let runtime = getWaRuntime();
        const activeTransport = String(runtime?.activeTransport || 'idle').trim().toLowerCase();

        if (activeTransport === moduleTransport) {
            if (namespaceChanged) {
                try {
                    await waClient.initialize();
                } catch (_) { }
                runtime = getWaRuntime();
            }

            invalidateChatListCache();
            runtimeStore.set('contactListCache', { items: [], updatedAt: 0 });
            emitWaCapabilities(socket);
            socket.emit('transport_mode_set', runtime);

            if (waClient.isReady) {
                socket.emit('ready', { message: 'WhatsApp transport listo' });
            }

            setActiveRuntimeContext({
                tenantId,
                moduleId: selectedModule?.moduleId || 'default',
                moduleName: selectedModule?.name || null,
                modulePhone: selectedModule?.phoneNumber || null,
                channelType: selectedModule?.channelType || null,
                transportMode: moduleTransport,
                webjsNamespace: null
            });

            return runtime;
        }

        const nextRuntime = await waClient.setTransportMode(moduleTransport);
        invalidateChatListCache();
        runtimeStore.set('contactListCache', { items: [], updatedAt: 0 });
        emitWaCapabilities(socket);
        socket.emit('transport_mode_set', nextRuntime);
        await authzAudit.auditSocketAction('wa.transport_mode.autoset_by_module', {
            resourceType: 'wa_module',
            resourceId: selectedModule?.moduleId || null,
            payload: { moduleTransport, runtime: nextRuntime, namespaceChanged }
        });

        if (waClient.isReady) {
            socket.emit('ready', { message: 'WhatsApp transport listo' });
        }

        setActiveRuntimeContext({
            tenantId,
            moduleId: selectedModule?.moduleId || 'default',
            moduleName: selectedModule?.name || null,
            modulePhone: selectedModule?.phoneNumber || null,
            channelType: selectedModule?.channelType || null,
            transportMode: moduleTransport,
            webjsNamespace: null
        });

        return nextRuntime;
    };

    const ensureTransportReady = (targetSocket = socket, {
        action = 'completar la operacion',
        errorEvent = 'error',
        requireReady = true
    } = {}) => {
        const runtime = getWaRuntime();
        const activeTransport = String(runtime?.activeTransport || 'idle').toLowerCase();

        if (activeTransport === 'idle') {
            targetSocket.emit(errorEvent, `Selecciona un modo de transporte antes de ${action}.`);
            targetSocket.emit('wa_runtime', runtime);
            return false;
        }

        if (requireReady && !waClient.isReady) {
            const message = `Cloud API aun no esta lista para ${action}.`;
            targetSocket.emit(errorEvent, message);
            targetSocket.emit('wa_runtime', runtime);
            return false;
        }

        return true;
    };

    const emitTenantContext = () => {
        socket.join(getTenantRoom(tenantId));
        socket.emit('tenant_context', {
            tenantId,
            user: authContext ? {
                userId: authContext.userId,
                name: authContext.name || null,
                email: authContext.email,
                role: authContext.role,
                tenantId: authContext.tenantId
            } : null
        });
    };

    const bootstrapTransportContext = async () => {
        console.log('Web client connected:', socket.id, '| tenant:', tenantId);
        emitTenantContext();

        if (!waRequireSelectedModule) {
            if (waClient.isReady) {
                socket.emit('ready', { message: 'WhatsApp is ready' });
            }
        }
        emitWaCapabilities(socket);

        try {
            const payload = await emitWaModuleContext({ requestedModuleId: getRequestedModuleIdFromSocket() });
            const selectedModule = payload?.selected || null;
            if (waRequireSelectedModule && !selectedModule?.moduleId) {
                socket.emit('wa_module_error', 'No hay un numero WhatsApp habilitado para tu usuario/empresa.');
                socket.emit('transport_mode_set', getWaRuntime());
                return null;
            }
            return await ensureTransportForSelectedModule(selectedModule);
        } catch (_) {
            return null;
        }
    };

    const registerTransportHandlers = () => {
        socket.on('get_wa_capabilities', () => {
            emitWaCapabilities(socket);
        });

        socket.on('get_wa_modules', async () => {
            try {
                await emitWaModuleContext({ requestedModuleId: socket?.data?.waModuleId || getRequestedModuleIdFromSocket() });
            } catch (error) {
                socket.emit('wa_module_error', String(error?.message || 'No se pudieron cargar los modulos WhatsApp.'));
            }
        });

        socket.on('set_wa_module', async ({ moduleId } = {}) => {
            if (!guardRateLimit(socket, 'set_wa_module')) return;
            try {
                const requestedModuleId = normalizeSocketModuleId(moduleId);
                if (!requestedModuleId) {
                    socket.emit('wa_module_error', 'Selecciona un modulo valido.');
                    return;
                }

                const userId = String(authContext?.userId || authContext?.id || '').trim();
                const allowedModules = await waModuleService.listModules(tenantId, {
                    includeInactive: false,
                    userId
                });
                const selected = (Array.isArray(allowedModules) ? allowedModules : [])
                    .find((entry) => normalizeSocketModuleId(entry?.moduleId) === requestedModuleId);

                if (!selected) {
                    socket.emit('wa_module_error', 'No tienes acceso a ese modulo WhatsApp.');
                    return;
                }

                await waModuleService.setSelectedModule(tenantId, selected.moduleId);
                const contextPayload = await emitWaModuleContext({ requestedModuleId: selected.moduleId });
                socket.emit('wa_module_selected', {
                    tenantId,
                    selected: contextPayload?.selected || selected
                });
                await ensureTransportForSelectedModule(contextPayload?.selected || selected);
                await authzAudit.auditSocketAction('wa.module.selected', {
                    resourceType: 'wa_module',
                    resourceId: selected.moduleId,
                    payload: { transportMode: selected.transportMode || null }
                });
            } catch (error) {
                socket.emit('wa_module_error', String(error?.message || 'No se pudo seleccionar el modulo WhatsApp.'));
            }
        });

        socket.on('set_transport_mode', async ({ mode } = {}) => {
            try {
                const nextMode = String(mode || '').trim().toLowerCase();
                if (!nextMode) {
                    socket.emit('transport_mode_error', 'Debes seleccionar un modo de transporte.');
                    return;
                }

                if (nextMode !== 'cloud' && nextMode !== 'idle') {
                    socket.emit('transport_mode_error', 'Modo de transporte invalido. Solo Cloud API esta permitido.');
                    return;
                }

                const selectedModule = socket?.data?.waModule || null;
                if (waRequireSelectedModule && !selectedModule?.moduleId) {
                    socket.emit('transport_mode_error', 'Primero selecciona un numero/modulo WhatsApp permitido.');
                    return;
                }
                const forcedMode = String(selectedModule?.transportMode || '').trim().toLowerCase();
                const hasForcedMode = forcedMode === 'cloud';

                if (hasForcedMode && nextMode !== forcedMode) {
                    socket.emit('transport_mode_error', 'Este modulo exige modo ' + forcedMode + '. Cambia de modulo para usar otro transporte.');
                    return;
                }

                if (!hasForcedMode) {
                    if (!authzAudit.requireRole(['owner', 'admin'], { errorEvent: 'transport_mode_error', action: 'cambiar el modo de transporte' })) return;
                }

                if (nextMode === 'cloud' && selectedModule?.moduleId && typeof waModuleService.resolveModuleCloudConfig === 'function' && typeof waClient.setCloudRuntimeConfig === 'function') {
                    await applyCloudConfigForModule(selectedModule);
                }
                const runtime = await waClient.setTransportMode(nextMode);
                invalidateChatListCache();
                runtimeStore.set('contactListCache', { items: [], updatedAt: 0 });
                emitWaCapabilities(socket);
                socket.emit('transport_mode_set', runtime);

                setActiveRuntimeContext({
                    tenantId,
                    moduleId: selectedModule?.moduleId || socket?.data?.waModuleId || 'default',
                    moduleName: selectedModule?.name || null,
                    modulePhone: selectedModule?.phoneNumber || null,
                    channelType: selectedModule?.channelType || null,
                    transportMode: runtime?.activeTransport || nextMode,
                    webjsNamespace: null
                });
                await authzAudit.auditSocketAction('wa.transport_mode.changed', {
                    resourceType: hasForcedMode ? 'wa_module' : 'wa_runtime',
                    resourceId: hasForcedMode ? (selectedModule?.moduleId || null) : (runtime?.activeTransport || nextMode),
                    payload: {
                        requestedMode: nextMode,
                        effectiveMode: runtime?.activeTransport || nextMode,
                        selectedModuleId: selectedModule?.moduleId || null,
                        runtime
                    }
                });

                if (waClient.isReady) {
                    socket.emit('ready', { message: 'WhatsApp transport listo' });
                }
            } catch (error) {
                socket.emit('transport_mode_error', String(error?.message || 'No se pudo cambiar el modo de transporte.'));
                emitWaCapabilities(socket);
            }
        });
    };

    return {
        ensureTransportReady,
        emitTenantContext,
        bootstrapTransportContext,
        registerTransportHandlers,
        emitWaModuleContext,
        ensureTransportForSelectedModule
    };
}

module.exports = {
    createSocketTransportOrchestrator
};
