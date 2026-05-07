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

function createImportRequestId(prefix = 'erpimp') {
    return `${String(prefix || 'erpimp').trim() || 'erpimp'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

function parseUploadedCsv(file, delimiter = ',') {
    if (!file?.buffer) return [];
    const rows = parseCsvRows(decodeCsvBuffer(file.buffer).replace(/^\uFEFF/, ''), delimiter);
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const headers = (rows[0] || []).map((entry) => String(entry || '').replace(/\uFEFF/g, '').trim());
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
        (req, _res, next) => {
            console.log('[ERP-IMPORT][HTTP] incoming multipart request');
            next();
        },
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
                console.log('[ERP-IMPORT][HTTP] multipart parsed mode=%s tenant=%s', mode, tenantId);
                if (mode !== 'preview' && mode !== 'commit') {
                    throw new Error('mode invalido. Usa preview o commit.');
                }

                const fileClientes = Array.isArray(req.files?.file_clientes) ? req.files.file_clientes[0] : null;
                const fileDirecciones = Array.isArray(req.files?.file_direcciones) ? req.files.file_direcciones[0] : null;
                if (!fileClientes?.buffer) {
                    throw new Error('El archivo file_clientes es obligatorio.');
                }
                console.log(
                    '[ERP-IMPORT][HTTP] files ready clientesBytes=%s direccionesBytes=%s',
                    Number(fileClientes?.buffer?.length || 0),
                    Number(fileDirecciones?.buffer?.length || 0)
                );

                const importId = String(req.body?.importId || '').trim() || createImportRequestId(mode === 'commit' ? 'erpcommit' : 'erppreview');
                if (typeof customerService.setErpImportProgress === 'function') {
                    customerService.setErpImportProgress(importId, {
                        tenantId,
                        mode,
                        status: mode === 'preview' ? 'analyzing' : 'running',
                        phase: 'parsing_clients',
                        message: 'Leyendo exportacion de AppSheet...',
                        percent: mode === 'preview' ? 5 : 1,
                        counts: {}
                    });
                }
                await new Promise((resolve) => setImmediate(resolve));

                console.log('[ERP-IMPORT][HTTP] parsing clientes importId=%s', importId);
                const clientesRows = parseUploadedCsv(fileClientes, ';');
                console.log('[ERP-IMPORT][HTTP] parsed clientes rows=%s importId=%s', clientesRows.length, importId);

                if (typeof customerService.setErpImportProgress === 'function') {
                    customerService.setErpImportProgress(importId, {
                        tenantId,
                        mode,
                        status: mode === 'preview' ? 'analyzing' : 'running',
                        phase: 'parsing_addresses',
                        message: fileDirecciones?.buffer
                            ? 'Leyendo archivo de direcciones ERP...'
                            : 'Validando clientes AppSheet...',
                        percent: mode === 'preview' ? 15 : 3,
                        counts: {
                            totalRows: clientesRows.length
                        }
                    });
                }
                await new Promise((resolve) => setImmediate(resolve));

                console.log('[ERP-IMPORT][HTTP] parsing direcciones importId=%s', importId);
                const direccionesRows = parseUploadedCsv(fileDirecciones, ',');
                console.log('[ERP-IMPORT][HTTP] parsed direcciones rows=%s importId=%s', direccionesRows.length, importId);

                console.log('[ERP-IMPORT][HTTP] invoking service importId=%s mode=%s', importId, mode);
                const result = await customerService.importCustomersFromAppSheet(tenantId, {
                    importId,
                    clientesRows,
                    direccionesRows,
                    moduleId: String(req.body?.moduleId || '').trim(),
                    mode
                });
                console.log('[ERP-IMPORT][HTTP] service completed importId=%s mode=%s', importId, mode);
                return res.json({ ok: true, tenantId, ...result });
            } catch (error) {
                console.error('[ERP-IMPORT][HTTP] failed', error?.message, error?.stack);
                return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo importar ERP.') });
            }
        }
    );

    app.get('/api/admin/saas/tenants/:tenantId/customers/import-erp-progress', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const importId = String(req.query?.importId || '').trim();
            if (!importId) {
                return res.status(400).json({ ok: false, error: 'importId invalido.' });
            }
            const progress = customerService.getErpImportProgress(importId, tenantId);
            if (!progress) {
                return res.json({
                    ok: true,
                    tenantId,
                    progress: {
                        importId,
                        tenantId,
                        status: 'pending',
                        phase: 'starting',
                        mode: 'commit',
                        message: 'Preparando importacion ERP...',
                        percent: 1,
                        counts: {}
                    }
                });
            }
            return res.json({ ok: true, tenantId, progress });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo consultar el progreso de la importacion ERP.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/customers/import-erp-cancel', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const importId = String(req.body?.importId || '').trim();
            if (!importId) {
                return res.status(400).json({ ok: false, error: 'importId invalido.' });
            }
            const progress = typeof customerService.cancelErpImportProgress === 'function'
                ? customerService.cancelErpImportProgress(importId, tenantId)
                : null;
            if (!progress) {
                return res.status(404).json({ ok: false, error: 'No se encontro una importacion activa para cancelar.' });
            }
            return res.json({ ok: true, tenantId, progress });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cancelar la importacion ERP.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/customers/validate-phones', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const moduleId = String(req.body?.moduleId || '').trim().toLowerCase();
            const batchSize = Number(req.body?.batchSize || 50);
            if (!moduleId) {
                return res.status(400).json({ ok: false, error: 'moduleId invalido.' });
            }
            const modules = await waModuleService.listModulesRuntime(tenantId, { includeInactive: true, userId: req?.authContext?.userId || '' });
            const moduleRuntime = (Array.isArray(modules) ? modules : [])
                .find((entry) => String(entry?.moduleId || '').trim().toLowerCase() === moduleId);
            if (!moduleRuntime) {
                return res.status(404).json({ ok: false, error: 'No se encontro el modulo indicado.' });
            }
            const cloudConfig = waModuleService.resolveModuleCloudConfig(moduleRuntime);
            const phoneNumberId = String(cloudConfig?.phoneNumberId || '').trim();
            const systemUserToken = String(cloudConfig?.systemUserToken || '').trim();
            const graphVersion = String(cloudConfig?.graphVersion || 'v19.0').trim() || 'v19.0';
            if (!phoneNumberId || !systemUserToken) {
                return res.status(400).json({ ok: false, error: 'El modulo no tiene credenciales cloud completas para validar telefonos.' });
            }
            const progress = customerService.startTenantCustomerPhoneValidation(tenantId, {
                moduleId,
                batchSize,
                phoneNumberId,
                systemUserToken,
                graphVersion
            });
            return res.json({
                ok: true,
                tenantId,
                jobId: progress?.jobId || null,
                progress
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo iniciar la validacion de telefonos.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/customers/validate-phones/:jobId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const jobId = String(req.params?.jobId || '').trim();
        if (!tenantId || !jobId) return res.status(400).json({ ok: false, error: 'tenantId/jobId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const progress = customerService.getPhoneValidationJob(jobId, tenantId);
            if (!progress) {
                return res.status(404).json({ ok: false, error: 'No se encontro el job de validacion.' });
            }
            return res.json({ ok: true, tenantId, jobId, progress });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo consultar el progreso de validacion.') });
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

    app.get('/api/tenant/customers/chat-search', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const query = String(req.query?.q || req.query?.query || '').trim();
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() !== 'false';
            const limit = Number(req.query?.limit || 24);

            const result = await customerService.searchCustomersForChat(tenantId, {
                query,
                includeInactive,
                limit
            });

            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron buscar clientes para chat.') });
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

