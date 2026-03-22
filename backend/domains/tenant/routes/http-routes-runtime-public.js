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
        const authContext = req.authContext || { enabled: false, isAuthenticated: false, user: null };
        const authEnabled = authService.isAuthEnabled();
        const isAuthenticated = Boolean(authContext?.isAuthenticated && authContext?.user);

        const allTenants = tenantService.getTenants();
        const allowedTenants = isAuthenticated
            ? authService.getAllowedTenantsForUser(authContext?.user || {}, allTenants)
            : allTenants;

        // Avoid exposing tenant/company data before login when SaaS auth is enabled.
        const exposeTenantData = !authEnabled || isAuthenticated;
        const runtimeTenants = exposeTenantData ? allowedTenants : [];

        const requestedTenantId = String(req?.tenantContext?.id || '').trim();
        const fallbackTenant = req.tenantContext || tenantService.DEFAULT_TENANT;
        const effectiveTenant = exposeTenantData
            ? (runtimeTenants.find((tenant) => String(tenant?.id || '').trim() === requestedTenantId)
                || runtimeTenants[0]
                || fallbackTenant)
            : fallbackTenant;

        const tenantId = String(effectiveTenant?.id || 'default');
        const authUser = authContext?.user && typeof authContext.user === 'object' ? authContext.user : null;
        const runtimeUserId = String(authUser?.userId || authUser?.id || '').trim();

        let tenantSettings = null;
        let waModules = [];
        let selectedWaModule = null;

        if (exposeTenantData) {
            tenantSettings = await tenantSettingsService.getTenantSettings(tenantId);
            waModules = await waModuleService.listModules(tenantId, {
                includeInactive: false,
                userId: runtimeUserId
            });
            selectedWaModule = await waModuleService.getSelectedModule(tenantId, {
                userId: runtimeUserId
            });
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

