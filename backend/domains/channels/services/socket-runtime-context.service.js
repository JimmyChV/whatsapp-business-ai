function createSocketRuntimeContextStore({
    io,
    initialRuntimeContext = {},
    cacheConfig = {},
    now = Date.now
} = {}) {
    const state = {
        runtimeContext: {
            tenantId: String(initialRuntimeContext?.tenantId || '').trim() || null,
            moduleId: String(initialRuntimeContext?.moduleId || '').trim().toLowerCase() || null,
            moduleName: initialRuntimeContext?.moduleName || null,
            modulePhone: initialRuntimeContext?.modulePhone || null,
            channelType: initialRuntimeContext?.channelType || null,
            transportMode: String(initialRuntimeContext?.transportMode || 'idle').trim().toLowerCase() || 'idle',
            updatedAt: Number(initialRuntimeContext?.updatedAt || 0) || now()
        },
        chatListCache: { items: [], updatedAt: 0 },
        contactListCache: { items: [], updatedAt: 0 },
        chatMetaCache: new Map(),
        ttl: {
            chatMetaTtlMs: Number(cacheConfig?.chatMetaTtlMs || 10 * 60 * 1000),
            chatListTtlMs: Number(cacheConfig?.chatListTtlMs || 15000),
            contactListTtlMs: Number(cacheConfig?.contactListTtlMs || 60 * 1000)
        }
    };

    const get = (key, fallbackValue = null) => {
        if (!Object.prototype.hasOwnProperty.call(state, key)) return fallbackValue;
        return state[key];
    };

    const set = (key, valueOrUpdater) => {
        if (!Object.prototype.hasOwnProperty.call(state, key)) return null;
        const nextValue = typeof valueOrUpdater === 'function'
            ? valueOrUpdater(state[key])
            : valueOrUpdater;
        state[key] = nextValue;
        return state[key];
    };

    const getTenantRoom = (tenantId = '') => {
        const cleanTenant = String(tenantId || '').trim();
        if (!cleanTenant) return 'tenant:unresolved';
        return 'tenant:' + cleanTenant;
    };

    const getTenantModuleRoom = (tenantId = '', moduleId = '') => {
        const cleanTenant = String(tenantId || '').trim();
        const cleanModule = String(moduleId || '').trim().toLowerCase();
        if (!cleanTenant || !cleanModule) return 'tenant:unresolved:module:unresolved';
        return 'tenant:' + cleanTenant + ':module:' + cleanModule;
    };

    const resolveTarget = ({ preferRuntimeContext = true, fallbackSockets = true } = {}) => {
        const context = state.runtimeContext && typeof state.runtimeContext === 'object'
            ? state.runtimeContext
            : null;

        if (
            preferRuntimeContext
            && context?.tenantId
            && context?.moduleId
            && context.tenantId !== 'default'
            && context.moduleId !== 'default'
        ) {
            return { tenantId: context.tenantId, moduleId: context.moduleId };
        }

        if (!fallbackSockets) return null;

        const socketsMap = io?.sockets?.sockets;
        const sockets = socketsMap ? Array.from(socketsMap.values()) : [];
        const seen = new Set();
        let candidate = null;
        sockets.forEach((socket) => {
            const tenant = String(socket?.data?.tenantId || '').trim();
            const module = String(socket?.data?.waModuleId || '').trim().toLowerCase();
            if (!tenant || !module) return;
            const key = tenant + '::' + module;
            seen.add(key);
            if (!candidate) candidate = { tenantId: tenant, moduleId: module };
        });

        if (seen.size === 1 && candidate) return candidate;
        return candidate;
    };

    const emitToTenant = (tenantId, eventName, payload) => {
        io.to(getTenantRoom(tenantId)).emit(eventName, payload);
    };

    const emitToTenantModule = (tenantId, moduleId, eventName, payload) => {
        io.to(getTenantModuleRoom(tenantId, moduleId)).emit(eventName, payload);
    };

    const emitToRuntimeContext = (eventName, payload) => {
        const target = resolveTarget();
        if (target?.tenantId) {
            emitToTenant(target.tenantId, eventName, payload);
            return;
        }
        io.emit(eventName, payload);
    };

    return {
        get,
        set,
        resolveTarget,
        getTenantRoom,
        getTenantModuleRoom,
        emitToTenant,
        emitToTenantModule,
        emitToRuntimeContext
    };
}

module.exports = {
    createSocketRuntimeContextStore
};
