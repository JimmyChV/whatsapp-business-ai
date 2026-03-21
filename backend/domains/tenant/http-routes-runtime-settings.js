function hasTenantSettingsWriteAccess(req = {}, authService) {
    if (!authService?.isAuthEnabled || !authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) return false;
    const role = String(authContext.user.role || '').trim().toLowerCase();
    return role === 'owner' || role === 'admin';
}

function registerTenantRuntimeSettingsHttpRoutes({
    app,
    authService,
    tenantService,
    tenantSettingsService,
    auditLogService,
    aiUsageService,
    waClient,
    accessPolicyService,
    isTenantAllowedForUser,
    hasPermission
}) {
    if (!app) throw new Error('registerTenantRuntimeSettingsHttpRoutes requiere app.');

    app.get('/api/admin/saas/tenants/:tenantId/runtime', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const runtime = typeof waClient.getRuntimeInfo === 'function'
                ? waClient.getRuntimeInfo()
                : { requestedTransport: 'idle', activeTransport: 'idle' };
            const aiUsage = await aiUsageService.getMonthlyUsage(tenantId);
            return res.json({
                ok: true,
                tenantId,
                runtime,
                aiUsage: { monthKey: aiUsageService.currentMonthKey(), requests: aiUsage }
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'No se pudo obtener runtime del tenant.' });
        }
    });

    app.get('/api/tenant/settings', async (req, res) => {
        try {
            const tenant = req.tenantContext || tenantService.DEFAULT_TENANT;
            const settings = await tenantSettingsService.getTenantSettings(tenant?.id || 'default');
            return res.json({
                ok: true,
                tenant,
                settings
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'No se pudo cargar la configuracion de la empresa.' });
        }
    });

    app.put('/api/tenant/settings', async (req, res) => {
        try {
            if (!hasTenantSettingsWriteAccess(req, authService)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para editar configuracion de empresa.' });
            }

            const tenant = req.tenantContext || tenantService.DEFAULT_TENANT;
            const patch = req.body && typeof req.body === 'object' ? req.body : {};
            const settings = await tenantSettingsService.updateTenantSettings(tenant?.id || 'default', patch);

            await auditLogService.writeAuditLog(tenant?.id || 'default', {
                userId: req?.authContext?.user?.userId || null,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || 'seller',
                action: 'tenant.settings.updated',
                resourceType: 'tenant_settings',
                resourceId: tenant?.id || 'default',
                source: 'api',
                ip: String(req.ip || ''),
                payload: { patch }
            });

            return res.json({
                ok: true,
                tenant,
                settings
            });
        } catch (error) {
            const message = String(error?.message || 'No se pudo actualizar configuracion de empresa.');
            return res.status(400).json({ ok: false, error: message });
        }
    });
}

module.exports = {
    registerTenantRuntimeSettingsHttpRoutes
};
