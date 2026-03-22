function defaultSanitizeCatalogProductPayload(payload = {}, { allowPartial = false } = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const categories = Array.isArray(source.categories)
        ? source.categories
        : String(source.categoriesText || source.categories || source.category || '')
            .split(',');

    const cleanCategories = categories
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
    const hasIsActive = Object.prototype.hasOwnProperty.call(source, 'isActive');

    const out = {
        title: String(source.title || source.name || '').trim(),
        price: String(source.price || '').trim(),
        regularPrice: String(source.regularPrice || source.regular_price || '').trim(),
        salePrice: String(source.salePrice || source.sale_price || '').trim(),
        description: String(source.description || '').trim(),
        imageUrl: String(source.imageUrl || source.image || source.image_url || '').trim(),
        sku: String(source.sku || '').trim(),
        stockStatus: String(source.stockStatus || source.stock_status || '').trim().toLowerCase(),
        stockQuantity: source.stockQuantity,
        categories: cleanCategories,
        category: cleanCategories[0] || '',
        url: String(source.url || source.permalink || source.productUrl || source.link || '').trim(),
        brand: String(source.brand || '').trim(),
        moduleId: String(source.moduleId || '').trim().toLowerCase(),
        catalogId: String(source.catalogId || '').trim().toUpperCase()
    };

    if (!allowPartial || hasIsActive) {
        out.isActive = source.isActive !== false;
    }

    if (!allowPartial) {
        if (!out.title) throw new Error('Titulo de producto es obligatorio.');
        if (!out.price) throw new Error('Precio de producto es obligatorio.');
    }

    const parsedStock = Number.parseInt(String(out.stockQuantity || '').trim(), 10);
    if (Number.isFinite(parsedStock)) {
        out.stockQuantity = parsedStock;
    } else {
        delete out.stockQuantity;
    }

    const clean = {};
    Object.keys(out).forEach((key) => {
        const value = out[key];
        if (value === null || value === undefined) return;
        if (typeof value === 'string' && !value.trim()) return;
        if (Array.isArray(value) && value.length === 0) return;
        clean[key] = value;
    });

    if (allowPartial) return clean;

    return {
        ...clean,
        source: 'local'
    };
}
function registerTenantAdminConfigCatalogHttpRoutes({
    app,
    tenantService,
    tenantSettingsService,
    tenantIntegrationsService,
    tenantCatalogService,
    planLimitsService,
    accessPolicyService,
    isTenantAllowedForUser,
    hasPermission,
    hasAnyPermission,
    sanitizeAiAssistantIdPayload,
    sanitizeAiAssistantPayload,
    sanitizeCatalogProductPayload,
    loadCatalog,
    addProduct,
    updateProduct
}) {
    if (!app) throw new Error('registerTenantAdminConfigCatalogHttpRoutes requiere app.');
    const sanitizeProductPayload = typeof sanitizeCatalogProductPayload === 'function'
        ? sanitizeCatalogProductPayload
        : defaultSanitizeCatalogProductPayload;

    app.get('/api/admin/saas/tenants/:tenantId/settings', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_SETTINGS_READ, accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE])) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const settings = await tenantSettingsService.getTenantSettings(tenantId);
            return res.json({ ok: true, tenantId, settings });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'No se pudo cargar configuracion del tenant.' });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/settings', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const patch = req.body && typeof req.body === 'object' ? req.body : {};
            const settings = await tenantSettingsService.updateTenantSettings(tenantId, patch);
            return res.json({ ok: true, tenantId, settings });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar configuracion del tenant.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/integrations', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_READ, accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE])) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const integrations = await tenantIntegrationsService.getTenantIntegrations(tenantId);
            return res.json({ ok: true, tenantId, integrations });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar integraciones del tenant.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/integrations', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const patch = req.body && typeof req.body === 'object' ? req.body : {};
            const integrations = await tenantIntegrationsService.updateTenantIntegrations(tenantId, patch);
            return res.json({ ok: true, tenantId, integrations });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar integraciones del tenant.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/ai-assistants', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_AI_READ,
                accessPolicyService.PERMISSIONS.TENANT_AI_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_READ,
                accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await tenantIntegrationsService.listTenantAiAssistants(tenantId);
            return res.json({ ok: true, tenantId, defaultAssistantId: result?.defaultAssistantId || null, items: result?.items || [] });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar asistentes IA del tenant.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/ai-assistants', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_AI_MANAGE, accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeAiAssistantPayload(req.body, { allowAssistantId: true });
            if (!payload.name) return res.status(400).json({ ok: false, error: 'Nombre de asistente requerido.' });

            const result = await tenantIntegrationsService.createTenantAiAssistant(tenantId, payload);
            return res.json({ ok: true, tenantId, defaultAssistantId: result?.defaultAssistantId || null, item: result?.item || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear asistente IA.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/ai-assistants/:assistantId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const assistantId = sanitizeAiAssistantIdPayload(req.params?.assistantId || '');
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!assistantId) return res.status(400).json({ ok: false, error: 'assistantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_AI_MANAGE, accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeAiAssistantPayload(req.body, { allowAssistantId: false });
            const result = await tenantIntegrationsService.updateTenantAiAssistant(tenantId, assistantId, payload);
            return res.json({ ok: true, tenantId, defaultAssistantId: result?.defaultAssistantId || null, item: result?.item || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar asistente IA.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/ai-assistants/:assistantId/default', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const assistantId = sanitizeAiAssistantIdPayload(req.params?.assistantId || '');
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!assistantId) return res.status(400).json({ ok: false, error: 'assistantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_AI_MANAGE, accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await tenantIntegrationsService.setDefaultTenantAiAssistant(tenantId, assistantId);
            return res.json({ ok: true, tenantId, defaultAssistantId: result?.defaultAssistantId || null, item: result?.item || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo definir asistente principal.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/ai-assistants/:assistantId/deactivate', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const assistantId = sanitizeAiAssistantIdPayload(req.params?.assistantId || '');
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!assistantId) return res.status(400).json({ ok: false, error: 'assistantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasAnyPermission(req, [accessPolicyService.PERMISSIONS.TENANT_AI_MANAGE, accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await tenantIntegrationsService.deactivateTenantAiAssistant(tenantId, assistantId);
            return res.json({ ok: true, tenantId, defaultAssistantId: result?.defaultAssistantId || null, item: result?.item || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar asistente IA.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/catalogs', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_CATALOGS_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_READ,
                accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_READ
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const items = await tenantCatalogService.ensureDefaultCatalog(tenantId);
            return res.json({ ok: true, tenantId, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar catalogos del tenant.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/catalogs', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CATALOGS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const tenant = tenantService.findTenantById(tenantId) || tenantService.DEFAULT_TENANT;
            const limits = planLimitsService.getTenantPlanLimits(tenant);
            const item = await tenantCatalogService.createCatalog(tenantId, payload, {
                maxCatalogs: Number(limits?.maxCatalogs || 0) || 0
            });
            return res.status(201).json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el catalogo.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        if (!tenantId || !catalogId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CATALOGS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const patch = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await tenantCatalogService.updateCatalog(tenantId, catalogId, patch);
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el catalogo.') });
        }
    });

    app.delete('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        if (!tenantId || !catalogId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CATALOGS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await tenantCatalogService.deactivateCatalog(tenantId, catalogId);
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar el catalogo.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId/products', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        const moduleId = String(req.query?.moduleId || '').trim().toLowerCase();
        if (!tenantId || !catalogId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId)
            || !hasAnyPermission(req, [
                accessPolicyService.PERMISSIONS.TENANT_CATALOGS_MANAGE,
                accessPolicyService.PERMISSIONS.TENANT_MODULES_READ,
                accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_READ
            ])) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const items = await loadCatalog({
                tenantId,
                catalogId,
                moduleId: moduleId || null
            });
            return res.json({ ok: true, tenantId, catalogId, moduleId: moduleId || null, items: Array.isArray(items) ? items : [] });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar los productos del catalogo.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId/products', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        if (!tenantId || !catalogId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CATALOGS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = sanitizeProductPayload(req.body, { allowPartial: false });
            const moduleId = String(payload.moduleId || req.body?.moduleId || '').trim().toLowerCase();
            const item = await addProduct({
                ...payload,
                catalogId,
                moduleId: moduleId || undefined,
                metadata: {
                    ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
                    isActive: payload.isActive !== false
                }
            }, {
                tenantId,
                catalogId,
                moduleId: moduleId || null
            });
            return res.status(201).json({ ok: true, tenantId, catalogId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el producto del catalogo.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId/products/:productId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        const productId = String(req.params?.productId || '').trim();
        if (!tenantId || !catalogId || !productId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId/productId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CATALOGS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const updates = sanitizeProductPayload(req.body, { allowPartial: true });
            const moduleId = String(updates.moduleId || req.body?.moduleId || '').trim().toLowerCase();
            const metadataPatch = req.body?.metadata && typeof req.body.metadata === 'object' ? { ...req.body.metadata } : {};
            if (Object.prototype.hasOwnProperty.call(updates, 'isActive')) {
                metadataPatch.isActive = updates.isActive !== false;
                delete updates.isActive;
            }
            const item = await updateProduct(productId, {
                ...updates,
                catalogId,
                moduleId: moduleId || undefined,
                ...(Object.keys(metadataPatch).length > 0 ? { metadata: metadataPatch } : {})
            }, {
                tenantId,
                catalogId,
                moduleId: moduleId || null
            });
            if (!item) {
                return res.status(404).json({ ok: false, error: 'Producto no encontrado para este catalogo.' });
            }
            return res.json({ ok: true, tenantId, catalogId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el producto.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId/products/:productId/deactivate', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        const productId = String(req.params?.productId || '').trim();
        if (!tenantId || !catalogId || !productId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId/productId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CATALOGS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const item = await updateProduct(productId, {
                catalogId,
                stockStatus: 'outofstock',
                metadata: {
                    ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
                    isActive: false
                }
            }, { tenantId, catalogId });
            if (!item) {
                return res.status(404).json({ ok: false, error: 'Producto no encontrado para este catalogo.' });
            }
            return res.json({ ok: true, tenantId, catalogId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar el producto.') });
        }
    });
}

module.exports = {
    registerTenantAdminConfigCatalogHttpRoutes
};
