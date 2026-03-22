function registerTenantLabelsQuickRepliesHttpRoutes({
    app,
    accessPolicyService,
    tenantLabelService,
    quickReplyLibrariesService,
    isTenantAllowedForUser,
    hasAnyPermission,
    sanitizeTenantLabelPayload,
    sanitizeQuickReplyLibraryPayload,
    sanitizeQuickReplyItemPayload
}) {
    if (!app) throw new Error('registerTenantLabelsQuickRepliesHttpRoutes requiere app.');

    app.get('/api/admin/saas/tenants/:tenantId/labels', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_LABELS_READ,
                accessPolicyService.PERMISSIONS.TENANT_LABELS_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_READ,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() === 'true';
            const items = await tenantLabelService.listLabels({ tenantId, includeInactive });
            return res.json({ ok: true, tenantId, items: Array.isArray(items) ? items : [] });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar etiquetas.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/labels', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_LABELS_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeTenantLabelPayload(req.body, { allowLabelId: true });
            if (!String(payload.name || '').trim()) return res.status(400).json({ ok: false, error: 'Nombre de etiqueta requerido.' });
            const item = await tenantLabelService.saveLabel(payload, { tenantId });
            return res.status(201).json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear etiqueta.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/labels/:labelId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const labelId = tenantLabelService.normalizeLabelId(req.params?.labelId || '');
        if (!tenantId || !labelId) return res.status(400).json({ ok: false, error: 'tenantId/labelId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_LABELS_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeTenantLabelPayload(req.body, { allowLabelId: false });
            if (!String(payload.name || '').trim()) return res.status(400).json({ ok: false, error: 'Nombre de etiqueta requerido.' });
            const item = await tenantLabelService.saveLabel({ ...payload, labelId }, { tenantId });
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar etiqueta.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/labels/:labelId/deactivate', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const labelId = tenantLabelService.normalizeLabelId(req.params?.labelId || '');
        if (!tenantId || !labelId) return res.status(400).json({ ok: false, error: 'tenantId/labelId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_LABELS_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            await tenantLabelService.deactivateLabel(labelId, { tenantId });
            return res.json({ ok: true, tenantId, labelId });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar etiqueta.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/quick-reply-libraries', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_READ,
                accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_READ,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() === 'true';
            const moduleId = String(req.query?.moduleId || '').trim().toLowerCase();
            const items = await quickReplyLibrariesService.listQuickReplyLibraries({
                tenantId,
                includeInactive,
                moduleId
            });
            return res.json({ ok: true, tenantId, items: Array.isArray(items) ? items : [] });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar bibliotecas de respuestas rapidas.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/quick-reply-libraries', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE, accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeQuickReplyLibraryPayload(req.body, { allowLibraryId: true });
            if (!payload.name) return res.status(400).json({ ok: false, error: 'Nombre de biblioteca requerido.' });
            const item = await quickReplyLibrariesService.saveQuickReplyLibrary(payload, { tenantId });
            return res.status(201).json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear biblioteca de respuestas rapidas.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/quick-reply-libraries/:libraryId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const libraryId = quickReplyLibrariesService.normalizeLibraryId(req.params?.libraryId || '');
        if (!tenantId || !libraryId) return res.status(400).json({ ok: false, error: 'tenantId/libraryId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE, accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeQuickReplyLibraryPayload(req.body, { allowLibraryId: false });
            if (!payload.name) return res.status(400).json({ ok: false, error: 'Nombre de biblioteca requerido.' });
            const item = await quickReplyLibrariesService.saveQuickReplyLibrary({ ...payload, libraryId }, { tenantId });
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar biblioteca de respuestas rapidas.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/quick-reply-libraries/:libraryId/deactivate', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const libraryId = quickReplyLibrariesService.normalizeLibraryId(req.params?.libraryId || '');
        if (!tenantId || !libraryId) return res.status(400).json({ ok: false, error: 'tenantId/libraryId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE, accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            await quickReplyLibrariesService.deactivateQuickReplyLibrary(libraryId, { tenantId });
            return res.json({ ok: true, tenantId, libraryId });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar biblioteca de respuestas rapidas.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/quick-reply-items', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_READ,
                accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_READ,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() === 'true';
            const moduleId = String(req.query?.moduleId || '').trim().toLowerCase();
            const libraryId = quickReplyLibrariesService.normalizeLibraryId(req.query?.libraryId || '');
            const items = await quickReplyLibrariesService.listQuickReplyItems({
                tenantId,
                includeInactive,
                moduleId,
                libraryId
            });
            return res.json({ ok: true, tenantId, items: Array.isArray(items) ? items : [] });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron cargar respuestas rapidas.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/quick-reply-items', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE, accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeQuickReplyItemPayload(req.body, { allowItemId: true });
            if (!payload.label) return res.status(400).json({ ok: false, error: 'Etiqueta requerida.' });
            if (!payload.text && (!Array.isArray(payload.mediaAssets) || payload.mediaAssets.length === 0) && !payload.mediaUrl) return res.status(400).json({ ok: false, error: 'Debes registrar texto o adjunto.' });
            const item = await quickReplyLibrariesService.saveQuickReplyItem(payload, { tenantId });
            return res.status(201).json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear respuesta rapida.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/quick-reply-items/:itemId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const itemId = quickReplyLibrariesService.normalizeItemId(req.params?.itemId || '');
        if (!tenantId || !itemId) return res.status(400).json({ ok: false, error: 'tenantId/itemId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE, accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeQuickReplyItemPayload(req.body, { allowItemId: false });
            if (!payload.label) return res.status(400).json({ ok: false, error: 'Etiqueta requerida.' });
            if (!payload.text && (!Array.isArray(payload.mediaAssets) || payload.mediaAssets.length === 0) && !payload.mediaUrl) return res.status(400).json({ ok: false, error: 'Debes registrar texto o adjunto.' });
            const item = await quickReplyLibrariesService.saveQuickReplyItem({ ...payload, itemId }, { tenantId });
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar respuesta rapida.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/quick-reply-items/:itemId/deactivate', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const itemId = quickReplyLibrariesService.normalizeItemId(req.params?.itemId || '');
        if (!tenantId || !itemId) return res.status(400).json({ ok: false, error: 'tenantId/itemId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE, accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            await quickReplyLibrariesService.deactivateQuickReplyItem(itemId, { tenantId });
            return res.json({ ok: true, tenantId, itemId });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar respuesta rapida.') });
        }
    });
}

module.exports = {
    registerTenantLabelsQuickRepliesHttpRoutes
};

