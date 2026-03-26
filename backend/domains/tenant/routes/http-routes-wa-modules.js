function registerTenantWaModuleAdminHttpRoutes({
    app,
    waModuleService,
    sanitizeWaModulePayload,
    invalidateWebhookCloudRegistryCache,
    hasTenantModuleWriteAccess
}) {
    if (!app) throw new Error('registerTenantWaModuleAdminHttpRoutes requiere app.');

    app.post('/api/admin/saas/tenants/:tenantId/wa-modules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const payload = sanitizeWaModulePayload(req.body, { allowModuleId: true });
            const created = await waModuleService.createModule(tenantId, payload);
            invalidateWebhookCloudRegistryCache();
            return res.status(201).json({ ok: true, tenantId, item: created });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el modulo WA.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/wa-modules/:moduleId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const moduleId = String(req.params?.moduleId || '').trim();
        if (!tenantId || !moduleId) return res.status(400).json({ ok: false, error: 'tenantId/moduleId invalido.' });
        if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const patch = sanitizeWaModulePayload(req.body, { allowModuleId: true });
            const updated = await waModuleService.updateModule(tenantId, moduleId, patch);
            invalidateWebhookCloudRegistryCache();
            return res.json({ ok: true, tenantId, item: updated });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el modulo WA.') });
        }
    });

    app.delete('/api/admin/saas/tenants/:tenantId/wa-modules/:moduleId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const moduleId = String(req.params?.moduleId || '').trim();
        if (!tenantId || !moduleId) return res.status(400).json({ ok: false, error: 'tenantId/moduleId invalido.' });
        if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            await waModuleService.deleteModule(tenantId, moduleId);
            invalidateWebhookCloudRegistryCache();
            return res.json({ ok: true, tenantId, moduleId });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar el modulo WA.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/wa-modules/:moduleId/select', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const moduleId = String(req.params?.moduleId || '').trim();
        if (!tenantId || !moduleId) return res.status(400).json({ ok: false, error: 'tenantId/moduleId invalido.' });
        if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const selected = await waModuleService.setSelectedModule(tenantId, moduleId);
            return res.json({ ok: true, tenantId, selected });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo seleccionar el modulo WA.') });
        }
    });
}

module.exports = {
    registerTenantWaModuleAdminHttpRoutes
};
