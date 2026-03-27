function normalizeModuleId(value = '') {
    return String(value || '').trim().toLowerCase();
}

function createSocketWaModuleContextService({
    socket,
    tenantId = 'default',
    authContext = null,
    waModuleService,
    resolveSocketModuleContext,
    getTenantModuleRoom
} = {}) {
    const getRequestedModuleIdFromSocket = () => normalizeModuleId(
        socket?.handshake?.auth?.waModuleId
        || socket?.handshake?.auth?.moduleId
        || socket?.handshake?.query?.waModuleId
        || socket?.handshake?.query?.moduleId
        || ''
    );

    const emitWaModuleContext = async ({ requestedModuleId = '' } = {}) => {
        const cleanRequested = normalizeModuleId(requestedModuleId || getRequestedModuleIdFromSocket());
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
            modules,
            waModules: modules,
            selected,
            selectedModule: selected,
            moduleId: selected?.moduleId || null,
            scopeModuleId: selected?.moduleId || null
        };
        socket.emit('wa_module_context', payload);
        return payload;
    };

    const resolveAllowedModuleById = async ({ moduleId = '' } = {}) => {
        const requestedModuleId = normalizeModuleId(moduleId);
        if (!requestedModuleId) return null;

        const userId = String(authContext?.userId || authContext?.id || '').trim();
        const allowedModules = await waModuleService.listModules(tenantId, {
            includeInactive: false,
            userId
        });

        return (Array.isArray(allowedModules) ? allowedModules : [])
            .find((entry) => normalizeModuleId(entry?.moduleId) === requestedModuleId) || null;
    };

    return {
        normalizeModuleId,
        getRequestedModuleIdFromSocket,
        emitWaModuleContext,
        resolveAllowedModuleById
    };
}

module.exports = {
    createSocketWaModuleContextService
};
