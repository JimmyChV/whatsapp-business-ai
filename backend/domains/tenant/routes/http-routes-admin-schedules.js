function registerTenantAdminScheduleHttpRoutes({
    app,
    tenantScheduleService,
    accessPolicyService,
    isTenantAllowedForUser,
    hasAnyPermission,
    hasPermission
}) {
    if (!app) throw new Error('registerTenantAdminScheduleHttpRoutes requiere app.');
    if (!tenantScheduleService) throw new Error('registerTenantAdminScheduleHttpRoutes requiere tenantScheduleService.');

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

    app.get('/api/admin/saas/tenants/:tenantId/schedules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!canRead(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const items = await tenantScheduleService.listSchedules(tenantId);
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error?.message || 'No se pudieron cargar horarios.' });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/schedules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!canWrite(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const item = await tenantScheduleService.createSchedule(tenantId, req.body || {});
            return res.status(201).json({ ok: true, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: error?.message || 'No se pudo crear el horario.' });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/schedules/:scheduleId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const scheduleId = String(req.params?.scheduleId || '').trim();
        if (!tenantId || !scheduleId) return res.status(400).json({ ok: false, error: 'tenantId/scheduleId invalido.' });
        if (!canRead(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const item = await tenantScheduleService.getSchedule(tenantId, scheduleId);
            if (!item) return res.status(404).json({ ok: false, error: 'Horario no encontrado.' });
            return res.json({ ok: true, item });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error?.message || 'No se pudo cargar el horario.' });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/schedules/:scheduleId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const scheduleId = String(req.params?.scheduleId || '').trim();
        if (!tenantId || !scheduleId) return res.status(400).json({ ok: false, error: 'tenantId/scheduleId invalido.' });
        if (!canWrite(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const item = await tenantScheduleService.updateSchedule(tenantId, scheduleId, req.body || {});
            return res.json({ ok: true, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: error?.message || 'No se pudo actualizar el horario.' });
        }
    });

    app.delete('/api/admin/saas/tenants/:tenantId/schedules/:scheduleId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const scheduleId = String(req.params?.scheduleId || '').trim();
        if (!tenantId || !scheduleId) return res.status(400).json({ ok: false, error: 'tenantId/scheduleId invalido.' });
        if (!canWrite(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
        try {
            const result = await tenantScheduleService.deleteSchedule(tenantId, scheduleId);
            return res.json({ ok: true, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: error?.message || 'No se pudo eliminar el horario.' });
        }
    });
}

module.exports = {
    registerTenantAdminScheduleHttpRoutes
};
