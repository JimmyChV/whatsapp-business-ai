function registerTenantWaModuleAdminHttpRoutes({
    app,
    waModuleService,
    sanitizeWaModulePayload,
    invalidateWebhookCloudRegistryCache,
    hasTenantModuleWriteAccess
}) {
    if (!app) throw new Error('registerTenantWaModuleAdminHttpRoutes requiere app.');

    function summarizeModulePayloadForLog(payload = {}) {
        const source = payload && typeof payload === 'object' ? payload : {};
        const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
        const cloudConfig = metadata.cloudConfig && typeof metadata.cloudConfig === 'object' ? metadata.cloudConfig : {};
        return {
            name: String(source.name || '').trim() || null,
            phoneNumber: String(source.phoneNumber || '').trim() || null,
            transportMode: String(source.transportMode || '').trim() || null,
            assignedUserIdsCount: Array.isArray(source.assignedUserIds) ? source.assignedUserIds.length : 0,
            catalogIdsCount: Array.isArray(source.catalogIds) ? source.catalogIds.length : 0,
            hasCloudAppId: Boolean(String(cloudConfig.appId || '').trim()),
            hasCloudWabaId: Boolean(String(cloudConfig.wabaId || '').trim()),
            hasCloudPhoneNumberId: Boolean(String(cloudConfig.phoneNumberId || '').trim()),
            hasVerifyToken: Boolean(String(cloudConfig.verifyToken || '').trim()),
            hasAppSecret: Boolean(String(cloudConfig.appSecret || '').trim()),
            hasSystemUserToken: Boolean(String(cloudConfig.systemUserToken || '').trim())
        };
    }

    function summarizeErrorForLog(error) {
        const source = error && typeof error === 'object' ? error : {};
        return {
            name: source.name || null,
            message: source.message || String(error || ''),
            status: source.status ?? source.statusCode ?? null,
            stackPreview: typeof source.stack === 'string'
                ? source.stack.split('\n').slice(0, 4).join(' | ')
                : null
        };
    }

    app.post('/api/admin/saas/tenants/:tenantId/wa-modules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            console.log('[API][ModuleCreate][request]', {
                tenantId,
                userId: String(req?.authContext?.user?.userId || '').trim() || null,
                payload: summarizeModulePayloadForLog(req.body)
            });
            const payload = sanitizeWaModulePayload(req.body, { allowModuleId: true });
            console.log('[API][ModuleCreate][payload]', {
                tenantId,
                payload: summarizeModulePayloadForLog(payload)
            });
            const created = await waModuleService.createModule(tenantId, payload);
            invalidateWebhookCloudRegistryCache();
            console.log('[API][ModuleCreate][response]', {
                tenantId,
                status: 201,
                moduleId: String(created?.moduleId || '').trim() || null
            });
            return res.status(201).json({ ok: true, tenantId, item: created });
        } catch (error) {
            console.error('[API][ModuleCreate][error]', {
                tenantId,
                ...summarizeErrorForLog(error)
            });
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el modulo WA.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/wa-modules/:moduleId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const moduleId = String(req.params?.moduleId || '').trim();
        if (!tenantId || !moduleId) return res.status(400).json({ ok: false, error: 'tenantId/moduleId invalido.' });
        if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            console.log('[API][ModuleCreate][request]', {
                tenantId,
                moduleId,
                userId: String(req?.authContext?.user?.userId || '').trim() || null,
                mode: 'edit',
                payload: summarizeModulePayloadForLog(req.body)
            });
            const patch = sanitizeWaModulePayload(req.body, { allowModuleId: true });
            const updated = await waModuleService.updateModule(tenantId, moduleId, patch);
            invalidateWebhookCloudRegistryCache();
            console.log('[API][ModuleCreate][response]', {
                tenantId,
                moduleId,
                mode: 'edit',
                status: 200
            });
            return res.json({ ok: true, tenantId, item: updated });
        } catch (error) {
            console.error('[API][ModuleCreate][error]', {
                tenantId,
                moduleId,
                mode: 'edit',
                ...summarizeErrorForLog(error)
            });
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
