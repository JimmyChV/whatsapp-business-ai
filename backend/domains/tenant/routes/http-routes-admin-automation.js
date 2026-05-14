function registerTenantAdminAutomationHttpRoutes({
    app,
    tenantAutomationService,
    accessPolicyService,
    isTenantAllowedForUser,
    hasAnyPermission,
    hasPermission
}) {
    if (!app) throw new Error('registerTenantAdminAutomationHttpRoutes requiere app.');
    if (!tenantAutomationService) throw new Error('registerTenantAdminAutomationHttpRoutes requiere tenantAutomationService.');

    function canRead(req, tenantId) {
        return isTenantAllowedForUser(req, tenantId) && hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_SETTINGS_READ,
            accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE,
            accessPolicyService.PERMISSIONS.TENANT_MODULES_READ,
            accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE
        ]);
    }

    function canWrite(req, tenantId) {
        return isTenantAllowedForUser(req, tenantId) && (
            hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE)
            || hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE)
        );
    }

    app.get('/api/admin/saas/tenants/:tenantId/automations', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!canRead(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const items = await tenantAutomationService.listAutomationRules(tenantId);
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error?.message || 'No se pudieron cargar automatizaciones.' });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/automations', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!canWrite(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const item = await tenantAutomationService.createAutomationRule(tenantId, req.body || {});
            return res.status(201).json({ ok: true, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: error?.message || 'No se pudo crear la automatizacion.' });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/automations/:ruleId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const ruleId = String(req.params?.ruleId || '').trim();
        if (!tenantId || !ruleId) return res.status(400).json({ ok: false, error: 'tenantId/ruleId invalido.' });
        if (!canWrite(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const item = await tenantAutomationService.updateAutomationRule(tenantId, ruleId, req.body || {});
            return res.json({ ok: true, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: error?.message || 'No se pudo actualizar la automatizacion.' });
        }
    });

    app.delete('/api/admin/saas/tenants/:tenantId/automations/:ruleId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const ruleId = String(req.params?.ruleId || '').trim();
        if (!tenantId || !ruleId) return res.status(400).json({ ok: false, error: 'tenantId/ruleId invalido.' });
        if (!canWrite(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const result = await tenantAutomationService.deleteAutomationRule(tenantId, ruleId);
            return res.json({ ok: true, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: error?.message || 'No se pudo eliminar la automatizacion.' });
        }
    });
}

module.exports = {
    registerTenantAdminAutomationHttpRoutes
};
