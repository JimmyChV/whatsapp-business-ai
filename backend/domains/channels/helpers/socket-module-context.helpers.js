function createSocketModuleContextResolver({
    waModuleService
} = {}) {
    return async function resolveSocketModuleContext(
        tenantId = 'default',
        authContext = null,
        requestedModuleId = ''
    ) {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const userId = String(authContext?.userId || authContext?.id || '').trim();
        const normalizedRole = String(authContext?.role || '').trim().toLowerCase();
        const privilegedActor = Boolean(authContext?.isSuperAdmin) || ['superadmin', 'owner', 'admin'].includes(normalizedRole);
        const normalizedRequestedId = String(requestedModuleId || '').trim().toLowerCase();

        const modules = await waModuleService.listModules(cleanTenantId, {
            includeInactive: false,
            userId: privilegedActor ? '' : userId
        });

        if (!Array.isArray(modules) || modules.length === 0) {
            return { modules: [], selected: null };
        }

        let selected = null;
        if (normalizedRequestedId) {
            selected = modules.find(
                (module) => String(module?.moduleId || '').trim().toLowerCase() === normalizedRequestedId
            ) || null;
        }
        if (!selected) {
            selected = modules.find((module) => module?.isSelected)
                || modules.find((module) => module?.isDefault)
                || modules[0]
                || null;
        }

        return {
            modules,
            selected: selected || null
        };
    };
}

module.exports = {
    createSocketModuleContextResolver
};

