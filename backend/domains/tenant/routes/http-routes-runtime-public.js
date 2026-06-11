function toPublicTenant(tenant = null) {
    if (!tenant || typeof tenant !== 'object') return null;
    const logoUrl = String(tenant?.logoUrl || tenant?.logo_url || '').trim();
    const coverImageUrl = String(tenant?.coverImageUrl || tenant?.cover_image_url || '').trim();

    return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        active: tenant.active,
        plan: tenant.plan,
        logoUrl: /^https?:\/\//i.test(logoUrl) ? logoUrl : null,
        coverImageUrl: /^https?:\/\//i.test(coverImageUrl) ? coverImageUrl : null
    };
}

function registerTenantRuntimePublicHttpRoutes({
    app,
    authService,
    tenantService,
    tenantSettingsService,
    waModuleService,
    saasSocketAuthRequired
}) {
    if (!app) throw new Error('registerTenantRuntimePublicHttpRoutes requiere app.');

    app.get('/api/saas/runtime', async (req, res) => {
        const perfId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const totalLabel = `[perf][/api/saas/runtime][${perfId}] total`;
        console.time(totalLabel);
        res.once('finish', () => {
            console.timeEnd(totalLabel);
        });
        const authContext = req.authContext || { enabled: false, isAuthenticated: false, user: null };
        const authEnabled = authService.isAuthEnabled();
        const isAuthenticated = Boolean(authContext?.isAuthenticated && authContext?.user);

        const tenantsLabel = `[perf][/api/saas/runtime][${perfId}] tenantService.getTenants`;
        console.time(tenantsLabel);
        const allTenants = tenantService.getTenants();
        console.timeEnd(tenantsLabel);
        const allowedTenants = isAuthenticated
            ? authService.getAllowedTenantsForUser(authContext?.user || {}, allTenants)
            : allTenants;

        // Avoid exposing tenant/company data before login when SaaS auth is enabled.
        const exposeTenantData = !authEnabled || isAuthenticated;
        const runtimeTenants = exposeTenantData ? allowedTenants : [];

        const requestedTenantId = String(authContext?.user?.tenantId || req?.tenantContext?.id || '').trim();
        const hasOperationalTenant = Boolean(requestedTenantId && requestedTenantId !== 'default');
        const effectiveTenant = exposeTenantData
            ? (hasOperationalTenant
                ? runtimeTenants.find((tenant) => String(tenant?.id || '').trim() === requestedTenantId) || null
                : null)
            : null;

        const tenantId = String(effectiveTenant?.id || '').trim();
        const authUser = authContext?.user && typeof authContext.user === 'object' ? authContext.user : null;
        const runtimeUserId = String(authUser?.userId || authUser?.id || '').trim();

        let tenantSettings = null;
        let waModules = [];
        let selectedWaModule = null;

        if (exposeTenantData && tenantId) {
            const settingsLabel = `[perf][/api/saas/runtime][${perfId}] tenantSettingsService.getTenantSettings tenant=${tenantId}`;
            console.time(settingsLabel);
            try {
                tenantSettings = await tenantSettingsService.getTenantSettings(tenantId);
            } finally {
                console.timeEnd(settingsLabel);
            }

            const modulesLabel = `[perf][/api/saas/runtime][${perfId}] waModuleService.listModules tenant=${tenantId}`;
            console.time(modulesLabel);
            try {
                waModules = await waModuleService.listModules(tenantId, {
                    includeInactive: false,
                    userId: runtimeUserId
                });
            } finally {
                console.timeEnd(modulesLabel);
            }

            const selectedModuleLabel = `[perf][/api/saas/runtime][${perfId}] waModuleService.getSelectedModule tenant=${tenantId}`;
            console.time(selectedModuleLabel);
            try {
                selectedWaModule = await waModuleService.getSelectedModule(tenantId, {
                    userId: runtimeUserId
                });
            } finally {
                console.timeEnd(selectedModuleLabel);
            }
        }

        return res.json({
            ok: true,
            saasEnabled: tenantService.isSaasEnabled(),
            authEnabled,
            socketAuthRequired: saasSocketAuthRequired,
            tenant: exposeTenantData ? toPublicTenant(effectiveTenant) : null,
            tenantSettings: exposeTenantData ? tenantSettings : null,
            waModules: exposeTenantData ? waModules : [],
            selectedWaModule: exposeTenantData ? selectedWaModule : null,
            tenants: exposeTenantData ? (runtimeTenants || []).map(toPublicTenant).filter(Boolean) : [],
            authContext: {
                enabled: Boolean(authContext.enabled),
                isAuthenticated: Boolean(authContext.isAuthenticated),
                user: authContext.user || null
            }
        });
    });
}

module.exports = {
    registerTenantRuntimePublicHttpRoutes
};

