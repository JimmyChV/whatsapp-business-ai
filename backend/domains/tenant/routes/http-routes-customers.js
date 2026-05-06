function ensureAuthenticated(req, res, authService) {
    if (authService.isAuthEnabled() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

const multer = require('multer');
const { TextDecoder } = require('util');
const { parseCsvRows } = require('../helpers/customers-normalizers.helpers');

const erpImportUpload = multer({ storage: multer.memoryStorage() });

function normalizeCsvHeader(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function decodeCsvBuffer(buffer) {
    const safeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from([]);
    if (!safeBuffer.length) return '';
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(safeBuffer);
    } catch (_) {
        return new TextDecoder('latin1').decode(safeBuffer);
    }
}

function parseUploadedCsv(file) {
    if (!file?.buffer) return [];
    const rows = parseCsvRows(decodeCsvBuffer(file.buffer), ',');
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const headers = (rows[0] || []).map((entry) => normalizeCsvHeader(entry));
    return rows.slice(1).map((row, index) => {
        const item = { __rowNumber: index + 2 };
        headers.forEach((header, headerIndex) => {
            if (!header) return;
            item[header] = String(row?.[headerIndex] || '').trim();
        });
        return item;
    }).filter((item) => Object.keys(item).some((key) => key !== '__rowNumber' && String(item[key] || '').trim()));
}

function registerTenantCustomerHttpRoutes({
    app,
    authService,
    accessPolicyService,
    customerService,
    customerAddressesService,
    customerCatalogsService,
    tenantZoneRulesService,
    waModuleService,
    isTenantAllowedForUser,
    hasPermission
}) {
    if (!app) throw new Error('registerTenantCustomerHttpRoutes requiere app.');

    function hasLabelsReadAccess(req) {
        return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_LABELS_READ);
    }

    function hasLabelsManageAccess(req) {
        return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_LABELS_MANAGE);
    }

    app.get('/api/admin/saas/tenants/:tenantId/customers', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_READ)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const query = String(req.query?.q || req.query?.query || '').trim();
            const moduleId = String(req.query?.moduleId || '').trim();
            const updatedSince = String(req.query?.updatedSince || '').trim();
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() !== 'false';
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const result = await customerService.listCustomers(tenantId, {
                query,
                moduleId,
                updatedSince,
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

    app.post(
        '/api/admin/saas/tenants/:tenantId/customers/import-erp',
        erpImportUpload.fields([
            { name: 'file_clientes', maxCount: 1 },
            { name: 'file_direcciones', maxCount: 1 }
        ]),
        async (req, res) => {
            const tenantId = String(req.params?.tenantId || '').trim();
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            try {
                const mode = String(req.body?.mode || 'preview').trim().toLowerCase();
                if (mode !== 'preview' && mode !== 'commit') {
                    throw new Error('mode invalido. Usa preview o commit.');
                }

                const fileClientes = Array.isArray(req.files?.file_clientes) ? req.files.file_clientes[0] : null;
                const fileDirecciones = Array.isArray(req.files?.file_direcciones) ? req.files.file_direcciones[0] : null;
                if (!fileClientes?.buffer) {
                    throw new Error('El archivo file_clientes es obligatorio.');
                }

                const result = await customerService.importCustomersFromErp(tenantId, {
                    clientesRows: parseUploadedCsv(fileClientes),
                    direccionesRows: parseUploadedCsv(fileDirecciones),
                    moduleId: String(req.body?.moduleId || '').trim(),
                    mode
                });
                return res.json({ ok: true, tenantId, ...result });
            } catch (error) {
                return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo importar ERP.') });
            }
        }
    );

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

    app.get('/api/tenant/zone-rules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasLabelsReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() === 'true';
            const items = await tenantZoneRulesService.listZoneRules(tenantId, { includeInactive });
            return res.json({ ok: true, tenantId, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar zonas.') });
        }
    });

    app.post('/api/tenant/zone-rules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasLabelsManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await tenantZoneRulesService.saveZoneRule(tenantId, payload);
            return res.status(201).json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar zona.') });
        }
    });

    app.put('/api/tenant/zone-rules/:ruleId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasLabelsManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const ruleId = String(req.params?.ruleId || '').trim();
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await tenantZoneRulesService.saveZoneRule(tenantId, { ...payload, ruleId });
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar zona.') });
        }
    });

    app.delete('/api/tenant/zone-rules/:ruleId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasLabelsManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const ruleId = String(req.params?.ruleId || '').trim();
            const result = await tenantZoneRulesService.deleteZoneRule(tenantId, ruleId);
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar zona.') });
        }
    });

    app.post('/api/tenant/zone-rules/recalculate', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasLabelsManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const result = await tenantZoneRulesService.recalculateZonesForTenant(tenantId);
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo recalcular zonas.') });
        }
    });

    app.get('/api/tenant/customer-labels', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasLabelsReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.query?.customerId || '').trim();
            const source = String(req.query?.source || '').trim().toLowerCase();
            const items = await tenantZoneRulesService.listCustomerLabels(tenantId, { customerId, source });
            return res.json({ ok: true, tenantId, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar etiquetas de clientes.') });
        }
    });

    app.get('/api/tenant/customers/by-phone/:phoneE164', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const phoneE164 = String(req.params?.phoneE164 || '').trim();
            if (!phoneE164) {
                return res.status(400).json({ ok: false, error: 'phoneE164 invalido.' });
            }

            const item = await customerService.getCustomerByPhoneWithAddresses(tenantId, phoneE164, {
                customerAddressesService
            });

            if (!item) {
                return res.status(404).json({ ok: false, error: 'Cliente no encontrado para ese telefono.' });
            }

            return res.json({
                ok: true,
                tenantId,
                phoneE164,
                item
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el cliente por telefono.') });
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

    app.get('/api/tenant/customer-catalogs/geo', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const departmentId = String(req.query?.departmentId || '').trim();
            const provinceId = String(req.query?.provinceId || '').trim();
            const payload = await customerCatalogsService.getGeoCatalog({ departmentId, provinceId });
            return res.json({ ok: true, ...payload });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo geografico.') });
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

