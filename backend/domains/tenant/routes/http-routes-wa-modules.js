function registerTenantWaModuleAdminHttpRoutes({
    app,
    waModuleService,
    sanitizeWaModulePayload,
    invalidateWebhookCloudRegistryCache,
    hasTenantModuleWriteAccess
}) {
    const auditLogService = require('../../security/services/audit-log.service');
    if (!app) throw new Error('registerTenantWaModuleAdminHttpRoutes requiere app.');

    app.post('/api/admin/saas/tenants/:tenantId/wa-modules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const payload = sanitizeWaModulePayload(req.body, { allowModuleId: true });
            const created = await waModuleService.createModule(tenantId, payload);
            invalidateWebhookCloudRegistryCache();
            await auditLogService.writeRequestAuditLog(req, {
                tenantId,
                action: 'wa_module.created',
                resourceType: 'wa_module',
                resourceId: created?.moduleId || created?.id || payload.moduleId || null,
                newValue: created
            });
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
            await auditLogService.writeRequestAuditLog(req, {
                tenantId,
                action: 'wa_module.updated',
                resourceType: 'wa_module',
                resourceId: moduleId,
                newValue: updated
            });
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
            await auditLogService.writeRequestAuditLog(req, {
                tenantId,
                action: 'wa_module.deactivated',
                resourceType: 'wa_module',
                resourceId: moduleId,
                newValue: { moduleId, active: false }
            });
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
            await auditLogService.writeRequestAuditLog(req, {
                tenantId,
                action: 'wa_module.selected',
                resourceType: 'wa_module',
                resourceId: moduleId,
                newValue: selected
            });
            return res.json({ ok: true, tenantId, selected });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo seleccionar el modulo WA.') });
        }
    });
}

module.exports = {
    registerTenantWaModuleAdminHttpRoutes
};
