function ensureAuthenticated(req, res, authService) {
    if (authService.isAuthEnabled() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

function registerTenantCustomerHttpRoutes({
    app,
    authService,
    accessPolicyService,
    customerService,
    customerAddressesService,
    customerCatalogsService,
    waModuleService,
    isTenantAllowedForUser,
    hasPermission
}) {
    if (!app) throw new Error('registerTenantCustomerHttpRoutes requiere app.');

    app.get('/api/admin/saas/tenants/:tenantId/customers', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_READ)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const query = String(req.query?.q || req.query?.query || '').trim();
            const moduleId = String(req.query?.moduleId || '').trim();
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() !== 'false';
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const result = await customerService.listCustomers(tenantId, {
                query,
                moduleId,
                includeInactive,
                limit,
                offset
            });
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar clientes.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/customers/:customerId/identities', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const customerId = String(req.params?.customerId || '').trim();
        if (!tenantId || !customerId) return res.status(400).json({ ok: false, error: 'tenantId/customerId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_READ)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const moduleId = String(req.query?.moduleId || '').trim();
            const channelType = String(req.query?.channelType || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const result = await customerService.listCustomerIdentities(tenantId, {
                customerId,
                moduleId,
                channelType,
                limit,
                offset
            });
            return res.json({ ok: true, tenantId, customerId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar identidades del cliente.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/customers/:customerId/channel-events', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const customerId = String(req.params?.customerId || '').trim();
        if (!tenantId || !customerId) return res.status(400).json({ ok: false, error: 'tenantId/customerId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_READ)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const moduleId = String(req.query?.moduleId || '').trim();
            const chatId = String(req.query?.chatId || '').trim();
            const channelType = String(req.query?.channelType || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const result = await customerService.listChannelEvents(tenantId, {
                customerId,
                moduleId,
                chatId,
                channelType,
                limit,
                offset
            });
            return res.json({ ok: true, tenantId, customerId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar eventos del cliente.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/customers', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const result = await customerService.upsertCustomer(tenantId, payload, { allowPhoneMerge: true });
            return res.status(result?.created ? 201 : 200).json({ ok: true, tenantId, created: Boolean(result?.created), item: result?.item || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar cliente.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/customers/:customerId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const customerId = String(req.params?.customerId || '').trim();
        if (!tenantId || !customerId) return res.status(400).json({ ok: false, error: 'tenantId/customerId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const patch = req.body && typeof req.body === 'object' ? req.body : {};
            const result = await customerService.updateCustomer(tenantId, customerId, patch);
            return res.json({ ok: true, tenantId, item: result?.item || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar cliente.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/customers/import-csv', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const csvText = String(req.body?.csvText || '').trim();
            const moduleId = String(req.body?.moduleId || '').trim();
            const delimiter = String(req.body?.delimiter || '').trim();
            const result = await customerService.importCustomersCsv(tenantId, csvText, { moduleId, delimiter });
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo importar CSV de clientes.') });
        }
    });

    app.get('/api/tenant/customers', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const query = String(req.query?.q || req.query?.query || '').trim();
            const moduleId = String(req.query?.moduleId || '').trim();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() !== 'false';

            const result = await customerService.listCustomers(tenantId, {
                query,
                moduleId,
                limit,
                offset,
                includeInactive
            });

            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar clientes.') });
        }
    });

    app.get('/api/tenant/customers/:customerId/identities', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const moduleId = String(req.query?.moduleId || '').trim();
            const channelType = String(req.query?.channelType || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await customerService.listCustomerIdentities(tenantId, {
                customerId,
                moduleId,
                channelType,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, customerId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar identidades del cliente.') });
        }
    });

    app.get('/api/tenant/customers/:customerId/channel-events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const moduleId = String(req.query?.moduleId || '').trim();
            const chatId = String(req.query?.chatId || '').trim();
            const channelType = String(req.query?.channelType || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await customerService.listChannelEvents(tenantId, {
                customerId,
                moduleId,
                chatId,
                channelType,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, customerId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar eventos del cliente.') });
        }
    });

    app.get('/api/tenant/customers/:customerId/addresses', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });
            const items = await customerAddressesService.listAddresses(tenantId, { customerId });
            return res.json({ ok: true, tenantId, customerId, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar direcciones del cliente.') });
        }
    });

    app.post('/api/tenant/customers/:customerId/addresses', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await customerAddressesService.upsertAddress(tenantId, { ...payload, customerId });
            return res.status(201).json({ ok: true, tenantId, customerId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear direccion.') });
        }
    });

    app.put('/api/tenant/customers/:customerId/addresses/:addressId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            const addressId = String(req.params?.addressId || '').trim();
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await customerAddressesService.upsertAddress(tenantId, { ...payload, customerId, addressId });
            return res.json({ ok: true, tenantId, customerId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar direccion.') });
        }
    });

    app.delete('/api/tenant/customers/:customerId/addresses/:addressId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            const addressId = String(req.params?.addressId || '').trim();
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });
            const deleted = await customerAddressesService.deleteAddress(tenantId, { addressId });
            return res.json({ ok: true, tenantId, customerId, addressId, deleted: Boolean(deleted) });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar direccion.') });
        }
    });

    app.patch('/api/tenant/customers/:customerId/addresses/:addressId/set-primary', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            const addressId = String(req.params?.addressId || '').trim();
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });
            const item = await customerAddressesService.setPrimaryAddress(tenantId, { customerId, addressId });
            return res.json({ ok: true, tenantId, customerId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo marcar direccion primaria.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/treatments', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const items = await customerCatalogsService.getTreatments();
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo de tratamientos.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/types', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const items = await customerCatalogsService.getCustomerTypes();
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo de tipos de cliente.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/sources', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const items = await customerCatalogsService.getAcquisitionSources();
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo de fuentes.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/document-types', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const items = await customerCatalogsService.getDocumentTypes();
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo de documentos.') });
        }
    });

    app.get('/api/tenant/wa-modules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const userId = String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim();
            const items = await waModuleService.listModules(tenantId, { includeInactive: false, userId });
            const selected = await waModuleService.getSelectedModule(tenantId, { userId });
            return res.json({ ok: true, tenantId, items, selected });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar modulos WA.') });
        }
    });
}

module.exports = {
    registerTenantCustomerHttpRoutes
};

