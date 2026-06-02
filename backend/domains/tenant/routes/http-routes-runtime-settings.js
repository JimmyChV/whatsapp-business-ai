function ensureAuthenticated(req, res, authService) {
    if (authService?.isAuthEnabled?.() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

function resolveRequestTenant(req) {
    const tenant = req?.tenantContext || null;
    const tenantId = String(req?.authContext?.user?.tenantId || tenant?.id || '').trim();
    if (!tenantId || tenantId === 'default') return null;
    return tenant && tenant.id === tenantId ? tenant : { id: tenantId };
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
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenant = resolveRequestTenant(req);
            if (!tenant) return res.status(400).json({ ok: false, error: 'tenant_not_resolved' });
            const tenantId = String(tenant.id).trim();
            if (!isTenantAllowedForUser(req, tenantId)
                || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_SETTINGS_READ)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const settings = await tenantSettingsService.getTenantSettings(tenantId);
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
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenant = resolveRequestTenant(req);
            if (!tenant) return res.status(400).json({ ok: false, error: 'tenant_not_resolved' });
            const tenantId = String(tenant.id).trim();
            if (!isTenantAllowedForUser(req, tenantId)
                || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para editar configuracion de empresa.' });
            }

            const patch = req.body && typeof req.body === 'object' ? req.body : {};
            const settings = await tenantSettingsService.updateTenantSettings(tenantId, patch);

            await auditLogService.writeAuditLog(tenantId, {
                userId: req?.authContext?.user?.userId || null,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || 'seller',
                action: 'tenant.settings.updated',
                resourceType: 'tenant_settings',
                resourceId: tenantId,
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

