const fs = require('fs');
const path = require('path');
const {
    getStorageDriver,
    queryPostgres
} = require('../../../config/persistence-runtime');
const { parseCsvRows } = require('../../tenant/helpers/customers-normalizers.helpers');

const ERP_DATA_DIR = path.join(__dirname, '../../../config/data/erp');
const ERP_CATALOG_FILES = {
    treatments: 'ERP Contable - TbTratamientosCliente.csv',
    types: 'ERP Contable - TbTipoCliente.csv',
    sources: 'ERP Contable - TbFuenteCliente.csv',
    documentTypes: 'ERP Contable - TbDocumentosIdentidad.csv'
};

let customerCatalogFallbackCache = null;

function ensureAuthenticated(req, res, authService) {
    if (authService.isAuthEnabled() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

function resolveTenantIdFromContext(req) {
    return String(req?.tenantContext?.id || 'default').trim() || 'default';
}

function resolveActorUserId(req) {
    return String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim() || null;
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function isPlainObject(value = null) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function toSafeObject(value = null) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePreferredLanguage(value = '') {
    const normalized = toLower(value || 'es').replace(/[^a-z_-]/g, '');
    if (!normalized) return 'es';
    return normalized.slice(0, 16);
}

function normalizeHeaderKey(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function pickCell(row = [], indexes = []) {
    for (const index of indexes) {
        if (index < 0) continue;
        const value = toText(row[index] || '');
        if (value) return value;
    }
    return '';
}

function parseCatalogCsv(fileName = '', {
    idHeaders = [],
    labelHeaders = [],
    codeHeaders = [],
    abbreviationHeaders = []
} = {}) {
    const absolutePath = path.join(ERP_DATA_DIR, fileName);
    if (!fs.existsSync(absolutePath)) return [];

    const text = fs.readFileSync(absolutePath, 'utf8');
    const firstLine = String(text || '').split(/\r?\n/)[0] || '';
    const delimiterHint = firstLine.includes(';') ? ';' : ',';
    const rows = parseCsvRows(text, delimiterHint);
    if (!Array.isArray(rows) || rows.length < 2) return [];

    const headers = rows[0].map(normalizeHeaderKey);
    const findIndexes = (candidates = []) => headers
        .map((header, index) => ({ header, index }))
        .filter(({ header }) => candidates.includes(header))
        .map(({ index }) => index);

    const idIndexes = findIndexes(idHeaders);
    const labelIndexes = findIndexes(labelHeaders);
    const codeIndexes = findIndexes(codeHeaders);
    const abbreviationIndexes = findIndexes(abbreviationHeaders);

    const items = [];
    for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        const id = pickCell(row, idIndexes);
        const label = pickCell(row, labelIndexes);
        const code = pickCell(row, codeIndexes);
        const abbreviation = pickCell(row, abbreviationIndexes);
        const normalizedId = toText(id || code || label || '');
        const normalizedLabel = toText(label || code || id || '');
        if (!normalizedId || !normalizedLabel) continue;
        items.push({
            id: normalizedId,
            code: toText(code || normalizedId || ''),
            label: normalizedLabel,
            abbreviation: toText(abbreviation || '')
        });
    }
    return items;
}

function loadCustomerCatalogFallbacks() {
    if (customerCatalogFallbackCache) return customerCatalogFallbackCache;

    customerCatalogFallbackCache = {
        treatments: parseCatalogCsv(ERP_CATALOG_FILES.treatments, {
            idHeaders: ['idtratamientocliente', 'idtratamiento'],
            labelHeaders: ['tratamientocliente', 'descripcion', 'nombre'],
            codeHeaders: ['codigo', 'abreviatura'],
            abbreviationHeaders: ['abreviatura']
        }),
        customerTypes: parseCatalogCsv(ERP_CATALOG_FILES.types, {
            idHeaders: ['idtipocliente', 'idtipo'],
            labelHeaders: ['tipocliente', 'descripcion', 'nombre'],
            codeHeaders: ['codigo', 'abreviatura'],
            abbreviationHeaders: ['abreviatura']
        }),
        acquisitionSources: parseCatalogCsv(ERP_CATALOG_FILES.sources, {
            idHeaders: ['idfuentecliente', 'idfuente'],
            labelHeaders: ['fuentecliente', 'descripcion', 'nombre'],
            codeHeaders: ['codigo', 'abreviatura'],
            abbreviationHeaders: ['abreviatura']
        }),
        documentTypes: parseCatalogCsv(ERP_CATALOG_FILES.documentTypes, {
            idHeaders: ['iddocumentoidentidad', 'iddocumento', 'iddoc'],
            labelHeaders: ['documentoidentidad', 'descripcion', 'nombre'],
            codeHeaders: ['codigo', 'abreviatura'],
            abbreviationHeaders: ['abreviatura']
        })
    };

    return customerCatalogFallbackCache;
}

function registerOperationsHttpRoutes({
    app,
    authService,
    auditLogService,
    customerService,
    customerConsentService,
    customerModuleContextsService,
    templateWebhookEventsService,
    templateVariablesService,
    campaignsService,
    conversationOpsService,
    chatCommercialStatusService,
    metaTemplatesService,
    chatAssignmentPolicyService,
    assignmentRulesService,
    chatAssignmentRouterService,
    operationsKpiService,
    normalizeScopeModuleId,
    hasConversationEventsReadAccess,
    hasChatAssignmentsReadAccess,
    hasChatAssignmentsWriteAccess,
    hasAssignmentRulesReadAccess,
    hasAssignmentRulesWriteAccess,
    hasOperationsKpiReadAccess,
    emitCommercialStatusUpdated
}) {
    if (!app) throw new Error('registerOperationsHttpRoutes requiere app.');
    const assignmentPolicy = chatAssignmentPolicyService && typeof chatAssignmentPolicyService === 'object'
        ? chatAssignmentPolicyService
        : {};

    const assertInitialAssignmentAllowed = typeof assignmentPolicy.assertInitialAssignmentAllowed === 'function'
        ? assignmentPolicy.assertInitialAssignmentAllowed.bind(assignmentPolicy)
        : () => ({ ok: true });
    const assertTakeChatAllowed = typeof assignmentPolicy.assertTakeChatAllowed === 'function'
        ? assignmentPolicy.assertTakeChatAllowed.bind(assignmentPolicy)
        : () => ({ ok: true });
    const assertReleaseAllowed = typeof assignmentPolicy.assertReleaseAllowed === 'function'
        ? assignmentPolicy.assertReleaseAllowed.bind(assignmentPolicy)
        : () => ({ ok: true });
    const resolveActorTenantRole = typeof assignmentPolicy.resolveActorTenantRole === 'function'
        ? assignmentPolicy.resolveActorTenantRole.bind(assignmentPolicy)
        : () => 'seller';
    const commercialStatusApi = chatCommercialStatusService && typeof chatCommercialStatusService === 'object'
        ? chatCommercialStatusService
        : {};
    const getChatCommercialStatus = typeof commercialStatusApi.getChatCommercialStatus === 'function'
        ? commercialStatusApi.getChatCommercialStatus.bind(commercialStatusApi)
        : async () => null;
    const listCommercialStatuses = typeof commercialStatusApi.listCommercialStatuses === 'function'
        ? commercialStatusApi.listCommercialStatuses.bind(commercialStatusApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const markManualStatus = typeof commercialStatusApi.markManualStatus === 'function'
        ? commercialStatusApi.markManualStatus.bind(commercialStatusApi)
        : async () => {
            throw new Error('Servicio de estado comercial no disponible.');
        };
    const metaTemplatesApi = metaTemplatesService && typeof metaTemplatesService === 'object'
        ? metaTemplatesService
        : {};
    const createMetaTemplate = typeof metaTemplatesApi.createTemplate === 'function'
        ? metaTemplatesApi.createTemplate.bind(metaTemplatesApi)
        : async () => {
            throw new Error('Servicio de templates Meta no disponible.');
        };
    const listMetaTemplates = typeof metaTemplatesApi.listTemplates === 'function'
        ? metaTemplatesApi.listTemplates.bind(metaTemplatesApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const deleteMetaTemplate = typeof metaTemplatesApi.deleteTemplate === 'function'
        ? metaTemplatesApi.deleteTemplate.bind(metaTemplatesApi)
        : async () => {
            throw new Error('Servicio de templates Meta no disponible.');
        };
    const syncMetaTemplatesFromMeta = typeof metaTemplatesApi.syncTemplatesFromMeta === 'function'
        ? metaTemplatesApi.syncTemplatesFromMeta.bind(metaTemplatesApi)
        : async () => {
            throw new Error('Servicio de templates Meta no disponible.');
        };

    function ensureMetaTemplateWriteAccess(req, tenantId) {
        if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
            return { ok: false, statusCode: 403, error: 'No autorizado.' };
        }
        const role = String(resolveActorTenantRole({ req, tenantId }) || 'seller').trim().toLowerCase();
        if (!['owner', 'admin'].includes(role)) {
            return { ok: false, statusCode: 403, error: 'Solo owner/admin pueden gestionar templates Meta.' };
        }
        return { ok: true, role };
    }
    function ensureCampaignWriteAccess(req, tenantId) {
        if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
            return { ok: false, statusCode: 403, error: 'No autorizado.' };
        }
        const role = String(resolveActorTenantRole({ req, tenantId }) || 'seller').trim().toLowerCase();
        if (!['owner', 'admin'].includes(role)) {
            return { ok: false, statusCode: 403, error: 'Solo owner/admin pueden gestionar campanas.' };
        }
        return { ok: true, role };
    }
    const consentApi = customerConsentService && typeof customerConsentService === 'object'
        ? customerConsentService
        : {};
    const customerApi = customerService && typeof customerService === 'object'
        ? customerService
        : {};
    const getCustomerById = typeof customerApi.getCustomer === 'function'
        ? customerApi.getCustomer.bind(customerApi)
        : async () => null;
    const listCustomersForOutreach = typeof customerApi.listCustomers === 'function'
        ? customerApi.listCustomers.bind(customerApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const updateCustomerById = typeof customerApi.updateCustomer === 'function'
        ? customerApi.updateCustomer.bind(customerApi)
        : async () => {
            throw new Error('Servicio de clientes no disponible para actualizar.');
        };
    const grantConsent = typeof consentApi.grantConsent === 'function'
        ? consentApi.grantConsent.bind(consentApi)
        : async () => {
            throw new Error('Servicio de consentimiento no disponible.');
        };
    const revokeConsent = typeof consentApi.revokeConsent === 'function'
        ? consentApi.revokeConsent.bind(consentApi)
        : async () => {
            throw new Error('Servicio de consentimiento no disponible.');
        };
    const customerModuleContextsApi = customerModuleContextsService && typeof customerModuleContextsService === 'object'
        ? customerModuleContextsService
        : {};
    const listCustomerModuleContextsByCustomer = typeof customerModuleContextsApi.listContextsByCustomer === 'function'
        ? customerModuleContextsApi.listContextsByCustomer.bind(customerModuleContextsApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const upsertCustomerModuleContext = typeof customerModuleContextsApi.upsertContext === 'function'
        ? customerModuleContextsApi.upsertContext.bind(customerModuleContextsApi)
        : async () => {
            throw new Error('Servicio de contextos por modulo no disponible.');
        };
    const listContextsByModule = typeof customerModuleContextsApi.listContextsByModule === 'function'
        ? customerModuleContextsApi.listContextsByModule.bind(customerModuleContextsApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const assignCustomersToModule = typeof customerModuleContextsApi.assignCustomersToModule === 'function'
        ? customerModuleContextsApi.assignCustomersToModule.bind(customerModuleContextsApi)
        : async () => {
            throw new Error('Servicio de asignacion masiva por modulo no disponible.');
        };
    const templateWebhookEventsApi = templateWebhookEventsService && typeof templateWebhookEventsService === 'object'
        ? templateWebhookEventsService
        : {};
    const listTemplateWebhookEvents = typeof templateWebhookEventsApi.listTemplateWebhookEvents === 'function'
        ? templateWebhookEventsApi.listTemplateWebhookEvents.bind(templateWebhookEventsApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const templateVariablesApi = templateVariablesService && typeof templateVariablesService === 'object'
        ? templateVariablesService
        : {};
    const getTemplateVariablesCatalog = typeof templateVariablesApi.getCatalog === 'function'
        ? templateVariablesApi.getCatalog.bind(templateVariablesApi)
        : async () => ({ tenantId: 'default', generatedAt: null, categories: [], variables: [] });
    const getTemplateVariablesPreview = typeof templateVariablesApi.getPreview === 'function'
        ? templateVariablesApi.getPreview.bind(templateVariablesApi)
        : async (tenantId) => ({ tenantId, generatedAt: null, context: { chatId: null, customerId: null }, categories: [], variables: [] });
    const campaignsApi = campaignsService && typeof campaignsService === 'object'
        ? campaignsService
        : {};
    const createCampaign = typeof campaignsApi.createCampaign === 'function'
        ? campaignsApi.createCampaign.bind(campaignsApi)
        : async () => {
            throw new Error('Servicio de campanas no disponible.');
        };
    const listCampaigns = typeof campaignsApi.listCampaigns === 'function'
        ? campaignsApi.listCampaigns.bind(campaignsApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const getCampaignById = typeof campaignsApi.getCampaignById === 'function'
        ? campaignsApi.getCampaignById.bind(campaignsApi)
        : async () => null;
    const updateCampaign = typeof campaignsApi.updateCampaign === 'function'
        ? campaignsApi.updateCampaign.bind(campaignsApi)
        : async () => {
            throw new Error('Servicio de campanas no disponible.');
        };
    const startCampaign = typeof campaignsApi.startCampaign === 'function'
        ? campaignsApi.startCampaign.bind(campaignsApi)
        : async () => {
            throw new Error('Servicio de campanas no disponible.');
        };
    const pauseCampaign = typeof campaignsApi.pauseCampaign === 'function'
        ? campaignsApi.pauseCampaign.bind(campaignsApi)
        : async () => {
            throw new Error('Servicio de campanas no disponible.');
        };
    const resumeCampaign = typeof campaignsApi.resumeCampaign === 'function'
        ? campaignsApi.resumeCampaign.bind(campaignsApi)
        : async () => {
            throw new Error('Servicio de campanas no disponible.');
        };
    const cancelCampaign = typeof campaignsApi.cancelCampaign === 'function'
        ? campaignsApi.cancelCampaign.bind(campaignsApi)
        : async () => {
            throw new Error('Servicio de campanas no disponible.');
        };
    const listCampaignRecipients = typeof campaignsApi.listCampaignRecipients === 'function'
        ? campaignsApi.listCampaignRecipients.bind(campaignsApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const listCampaignEvents = typeof campaignsApi.listCampaignEvents === 'function'
        ? campaignsApi.listCampaignEvents.bind(campaignsApi)
        : async () => ({ items: [], total: 0, limit: 0, offset: 0 });
    const estimateCampaign = typeof campaignsApi.estimateCampaign === 'function'
        ? campaignsApi.estimateCampaign.bind(campaignsApi)
        : async () => {
            throw new Error('Servicio de campanas no disponible.');
        };

    async function listCustomerCatalogItems(catalogKey = '') {
        const fallbackCatalogs = loadCustomerCatalogFallbacks();
        const fallbackItemsByKey = {
            treatments: Array.isArray(fallbackCatalogs.treatments) ? fallbackCatalogs.treatments : [],
            types: Array.isArray(fallbackCatalogs.customerTypes) ? fallbackCatalogs.customerTypes : [],
            sources: Array.isArray(fallbackCatalogs.acquisitionSources) ? fallbackCatalogs.acquisitionSources : [],
            'document-types': Array.isArray(fallbackCatalogs.documentTypes) ? fallbackCatalogs.documentTypes : []
        };
        const fallbackItems = fallbackItemsByKey[catalogKey] || [];

        if (getStorageDriver() !== 'postgres') {
            return fallbackItems;
        }

        try {
            let sql = '';
            if (catalogKey === 'treatments') {
                sql = `SELECT id, code, label, abbreviation FROM global_customer_treatments ORDER BY id`;
            } else if (catalogKey === 'types') {
                sql = `SELECT id, NULL::text AS code, label, NULL::text AS abbreviation FROM global_customer_types ORDER BY id`;
            } else if (catalogKey === 'sources') {
                sql = `SELECT id, NULL::text AS code, label, NULL::text AS abbreviation FROM global_acquisition_sources ORDER BY id`;
            } else if (catalogKey === 'document-types') {
                sql = `SELECT id, code, label, abbreviation FROM global_document_types ORDER BY id`;
            } else {
                return [];
            }

            const result = await queryPostgres(sql, []);
            const rows = Array.isArray(result?.rows) ? result.rows : [];
            if (!rows.length) return fallbackItems;

            return rows.map((row) => {
                const id = toText(row?.id || '');
                const code = toText(row?.code || '');
                const label = toText(row?.label || code || id || '');
                const abbreviation = toText(row?.abbreviation || '');
                return {
                    id: id || code || label,
                    code: code || id || '',
                    label: label || id || code,
                    abbreviation
                };
            }).filter((item) => item.id && item.label);
        } catch (_) {
            return fallbackItems;
        }
    }

    function buildAddressFallbackFromCustomer(customer = null) {
        const source = customer && typeof customer === 'object' ? customer : {};
        const profile = toSafeObject(source.profile);
        const addresses = [];

        if (Array.isArray(profile.addresses)) {
            profile.addresses.forEach((entry = {}, index) => {
                const street = toText(entry.street || entry.address || entry.fiscalAddress || '');
                if (!street) return;
                addresses.push({
                    addressId: toText(entry.addressId || entry.address_id || `profile-${index + 1}`),
                    addressType: toText(entry.addressType || entry.address_type || 'other') || 'other',
                    street,
                    reference: toText(entry.reference || ''),
                    mapsUrl: toText(entry.mapsUrl || entry.maps_url || ''),
                    districtName: toText(entry.districtName || entry.district_name || ''),
                    provinceName: toText(entry.provinceName || entry.province_name || ''),
                    departmentName: toText(entry.departmentName || entry.department_name || ''),
                    isPrimary: Boolean(entry.isPrimary || entry.is_primary),
                    latitude: toText(entry.latitude || ''),
                    longitude: toText(entry.longitude || ''),
                    createdAt: toText(entry.createdAt || entry.created_at || source.createdAt || ''),
                    updatedAt: toText(entry.updatedAt || entry.updated_at || source.updatedAt || '')
                });
            });
        }

        const fiscalAddress = toText(profile.fiscalAddress || '');
        if (fiscalAddress && !addresses.some((item) => toText(item.street || '').toLowerCase() === fiscalAddress.toLowerCase())) {
            addresses.unshift({
                addressId: 'profile-fiscal',
                addressType: 'fiscal',
                street: fiscalAddress,
                reference: '',
                mapsUrl: '',
                districtName: toText(profile.districtName || ''),
                provinceName: toText(profile.provinceName || ''),
                departmentName: toText(profile.departmentName || ''),
                isPrimary: true,
                latitude: '',
                longitude: '',
                createdAt: toText(source.createdAt || ''),
                updatedAt: toText(source.updatedAt || '')
            });
        }

        return addresses;
    }

    function normalizeAddressPayload(payload = {}, fallback = {}) {
        const source = isPlainObject(payload) ? payload : {};
        const base = isPlainObject(fallback) ? fallback : {};
        const addressType = toText(source.addressType || source.address_type || base.addressType || 'other') || 'other';
        const street = toText(source.street || base.street || '');
        const reference = toText(source.reference || base.reference || '');
        const mapsUrl = toText(source.mapsUrl || source.maps_url || base.mapsUrl || '');
        const districtName = toText(source.districtName || source.district_name || base.districtName || '');
        const provinceName = toText(source.provinceName || source.province_name || base.provinceName || '');
        const departmentName = toText(source.departmentName || source.department_name || base.departmentName || '');
        const latitude = toText(source.latitude || base.latitude || '');
        const longitude = toText(source.longitude || base.longitude || '');
        const isPrimary = source.isPrimary !== undefined
            ? Boolean(source.isPrimary)
            : (source.is_primary !== undefined ? Boolean(source.is_primary) : Boolean(base.isPrimary));
        const metadata = toSafeObject(source.metadata || base.metadata);
        return {
            addressType,
            street,
            reference,
            mapsUrl,
            districtName,
            provinceName,
            departmentName,
            latitude,
            longitude,
            isPrimary,
            metadata
        };
    }

    async function listAddressesFromStorage(tenantId = '', customerId = '') {
        let items = [];
        let fromPostgres = false;
        if (getStorageDriver() === 'postgres') {
            try {
                const result = await queryPostgres(
                    `SELECT address_id, address_type, street, reference, maps_url, latitude, longitude,
                            district_name, province_name, department_name, is_primary, metadata,
                            created_at, updated_at
                       FROM tenant_customer_addresses
                      WHERE tenant_id = $1
                        AND customer_id = $2
                      ORDER BY is_primary DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST`,
                    [tenantId, customerId]
                );
                items = Array.isArray(result?.rows) ? result.rows.map((row) => ({
                    addressId: toText(row?.address_id || ''),
                    addressType: toText(row?.address_type || 'other') || 'other',
                    street: toText(row?.street || ''),
                    reference: toText(row?.reference || ''),
                    mapsUrl: toText(row?.maps_url || ''),
                    latitude: toText(row?.latitude || ''),
                    longitude: toText(row?.longitude || ''),
                    districtName: toText(row?.district_name || ''),
                    provinceName: toText(row?.province_name || ''),
                    departmentName: toText(row?.department_name || ''),
                    isPrimary: Boolean(row?.is_primary),
                    metadata: toSafeObject(row?.metadata),
                    createdAt: toText(row?.created_at || ''),
                    updatedAt: toText(row?.updated_at || '')
                })) : [];
                fromPostgres = true;
            } catch (_) {
                items = [];
                fromPostgres = false;
            }
        }
        if (!items.length) {
            const customer = await getCustomerById(tenantId, customerId);
            items = buildAddressFallbackFromCustomer(customer);
        }
        return { items, fromPostgres };
    }

    async function saveAddressesToCustomerProfile(tenantId = '', customerId = '', items = []) {
        const customer = await getCustomerById(tenantId, customerId);
        if (!customer) throw new Error('Cliente no encontrado.');
        const profile = toSafeObject(customer.profile);
        await updateCustomerById(tenantId, customerId, {
            profile: {
                ...profile,
                addresses: Array.isArray(items) ? items.map((entry = {}) => ({
                    addressId: toText(entry.addressId || ''),
                    addressType: toText(entry.addressType || 'other') || 'other',
                    street: toText(entry.street || ''),
                    reference: toText(entry.reference || ''),
                    mapsUrl: toText(entry.mapsUrl || ''),
                    districtName: toText(entry.districtName || ''),
                    provinceName: toText(entry.provinceName || ''),
                    departmentName: toText(entry.departmentName || ''),
                    latitude: toText(entry.latitude || ''),
                    longitude: toText(entry.longitude || ''),
                    isPrimary: Boolean(entry.isPrimary),
                    metadata: toSafeObject(entry.metadata),
                    createdAt: toText(entry.createdAt || ''),
                    updatedAt: toText(entry.updatedAt || '')
                })) : []
            }
        });
    }

    app.get('/api/tenant/customers/:customerId/module-contexts', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const customerId = toText(req.params?.customerId || '');
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const limit = Number(req.query?.limit || 500);
            const offset = Number(req.query?.offset || 0);
            const result = await listCustomerModuleContextsByCustomer(tenantId, {
                customerId,
                limit,
                offset
            });

            return res.json({
                ok: true,
                tenantId,
                customerId,
                ...result
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar contextos por modulo del cliente.') });
        }
    });

    app.post('/api/tenant/customers/outreach/eligibility', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const payload = isPlainObject(req.body) ? req.body : {};
            const moduleId = toText(payload.moduleId || '');
            if (!moduleId) return res.status(400).json({ ok: false, error: 'moduleId requerido.' });

            const requestedCustomerIds = Array.from(new Set(
                (Array.isArray(payload.customerIds) ? payload.customerIds : [])
                    .map((entry) => toText(entry))
                    .filter(Boolean)
            ));

            const sourceCustomers = requestedCustomerIds.length > 0
                ? (await Promise.all(requestedCustomerIds.map((customerId) => getCustomerById(tenantId, customerId)))).filter(Boolean)
                : (await listCustomersForOutreach(tenantId, {
                    query: toText(payload.query || ''),
                    includeInactive: false,
                    limit: 500,
                    offset: 0
                }))?.items || [];

            const contextsResult = await listContextsByModule(tenantId, { moduleId, limit: 5000, offset: 0 });
            const contextsByCustomerId = new Map(
                (Array.isArray(contextsResult?.items) ? contextsResult.items : [])
                    .map((item) => [toText(item?.customerId || ''), item])
                    .filter(([customerId]) => customerId)
            );

            const items = (Array.isArray(sourceCustomers) ? sourceCustomers : []).map((customer) => {
                const customerId = toText(customer?.customerId || '');
                const moduleContext = contextsByCustomerId.get(customerId) || null;
                return {
                    customerId,
                    contactName: toText(customer?.contactName || ''),
                    phoneE164: toText(customer?.phoneE164 || ''),
                    email: toText(customer?.email || ''),
                    moduleContext,
                    eligible: Boolean(moduleContext)
                };
            });

            return res.json({
                ok: true,
                tenantId,
                moduleId,
                eligibleItems: items.filter((item) => item.eligible),
                nonEligibleItems: items.filter((item) => !item.eligible),
                totalEligible: items.filter((item) => item.eligible).length,
                totalNonEligible: items.filter((item) => !item.eligible).length
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo evaluar elegibilidad de outreach.') });
        }
    });

    app.post('/api/tenant/customers/outreach/assign-module', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const actorUserId = resolveActorUserId(req);
            const payload = isPlainObject(req.body) ? req.body : {};
            const moduleId = toText(payload.moduleId || '');
            const customerIds = Array.isArray(payload.customerIds) ? payload.customerIds : [];
            if (!moduleId) return res.status(400).json({ ok: false, error: 'moduleId requerido.' });
            if (customerIds.length === 0) return res.status(400).json({ ok: false, error: 'customerIds requeridos.' });

            const result = await assignCustomersToModule(tenantId, {
                customerIds,
                moduleId,
                assignmentUserId: actorUserId,
                metadata: {
                    actorUserId,
                    source: 'customers_outreach'
                }
            });

            return res.json({
                ok: true,
                tenantId,
                moduleId,
                ...result
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron asignar clientes al modulo.') });
        }
    });

    app.get('/api/tenant/customers/:customerId/addresses', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);

            const customerId = toText(req.params?.customerId || '');
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const { items } = await listAddressesFromStorage(tenantId, customerId);

            return res.json({
                ok: true,
                tenantId,
                customerId,
                items,
                total: items.length
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar direcciones del cliente.') });
        }
    });

    app.post('/api/tenant/customers/:customerId/addresses', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const customerId = toText(req.params?.customerId || '');
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const nowIso = new Date().toISOString();
            const payload = normalizeAddressPayload(req.body || {});
            if (!payload.street) return res.status(400).json({ ok: false, error: 'street es requerido.' });
            const addressId = toText(req.body?.addressId || req.body?.address_id || `addr-${Date.now().toString(36)}`);
            let savedItem = null;

            if (getStorageDriver() === 'postgres') {
                try {
                    await queryPostgres(
                        `INSERT INTO tenant_customer_addresses (
                            tenant_id, customer_id, address_id, address_type, street, reference, maps_url,
                            latitude, longitude, district_name, province_name, department_name,
                            is_primary, metadata, created_at, updated_at
                        ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16
                        )`,
                        [
                            tenantId,
                            customerId,
                            addressId,
                            payload.addressType,
                            payload.street,
                            payload.reference,
                            payload.mapsUrl,
                            payload.latitude || null,
                            payload.longitude || null,
                            payload.districtName,
                            payload.provinceName,
                            payload.departmentName,
                            payload.isPrimary,
                            JSON.stringify(payload.metadata || {}),
                            nowIso,
                            nowIso
                        ]
                    );
                    if (payload.isPrimary) {
                        await queryPostgres(
                            `UPDATE tenant_customer_addresses
                                SET is_primary = CASE WHEN address_id = $3 THEN TRUE ELSE FALSE END,
                                    updated_at = $4
                              WHERE tenant_id = $1
                                AND customer_id = $2`,
                            [tenantId, customerId, addressId, nowIso]
                        );
                    }
                    const { items } = await listAddressesFromStorage(tenantId, customerId);
                    savedItem = items.find((entry) => toText(entry.addressId || '') === addressId) || null;
                } catch (_) {
                    savedItem = null;
                }
            }

            if (!savedItem) {
                const existing = await listAddressesFromStorage(tenantId, customerId);
                const baseItems = Array.isArray(existing.items) ? existing.items : [];
                const nextItems = baseItems.map((entry = {}) => ({ ...entry, isPrimary: payload.isPrimary ? false : Boolean(entry.isPrimary) }));
                nextItems.push({
                    addressId,
                    ...payload,
                    createdAt: nowIso,
                    updatedAt: nowIso
                });
                await saveAddressesToCustomerProfile(tenantId, customerId, nextItems);
                savedItem = nextItems.find((entry) => toText(entry.addressId || '') === addressId) || null;
            }

            return res.status(201).json({ ok: true, tenantId, customerId, item: savedItem });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo crear direccion.') });
        }
    });

    app.put('/api/tenant/customers/:customerId/addresses/:addressId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const customerId = toText(req.params?.customerId || '');
            const addressId = toText(req.params?.addressId || '');
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });

            const nowIso = new Date().toISOString();
            const existing = await listAddressesFromStorage(tenantId, customerId);
            const current = (existing.items || []).find((entry) => toText(entry.addressId || '') === addressId);
            if (!current) return res.status(404).json({ ok: false, error: 'Direccion no encontrada.' });
            const payload = normalizeAddressPayload(req.body || {}, current);
            if (!payload.street) return res.status(400).json({ ok: false, error: 'street es requerido.' });
            let savedItem = null;

            if (getStorageDriver() === 'postgres') {
                try {
                    await queryPostgres(
                        `UPDATE tenant_customer_addresses
                            SET address_type = $4,
                                street = $5,
                                reference = $6,
                                maps_url = $7,
                                latitude = $8,
                                longitude = $9,
                                district_name = $10,
                                province_name = $11,
                                department_name = $12,
                                is_primary = $13,
                                metadata = $14::jsonb,
                                updated_at = $15
                          WHERE tenant_id = $1
                            AND customer_id = $2
                            AND address_id = $3`,
                        [
                            tenantId,
                            customerId,
                            addressId,
                            payload.addressType,
                            payload.street,
                            payload.reference,
                            payload.mapsUrl,
                            payload.latitude || null,
                            payload.longitude || null,
                            payload.districtName,
                            payload.provinceName,
                            payload.departmentName,
                            payload.isPrimary,
                            JSON.stringify(payload.metadata || {}),
                            nowIso
                        ]
                    );
                    if (payload.isPrimary) {
                        await queryPostgres(
                            `UPDATE tenant_customer_addresses
                                SET is_primary = CASE WHEN address_id = $3 THEN TRUE ELSE FALSE END,
                                    updated_at = $4
                              WHERE tenant_id = $1
                                AND customer_id = $2`,
                            [tenantId, customerId, addressId, nowIso]
                        );
                    }
                    const reload = await listAddressesFromStorage(tenantId, customerId);
                    savedItem = reload.items.find((entry) => toText(entry.addressId || '') === addressId) || null;
                } catch (_) {
                    savedItem = null;
                }
            }

            if (!savedItem) {
                const nextItems = (existing.items || []).map((entry = {}) => {
                    const isCurrent = toText(entry.addressId || '') === addressId;
                    if (isCurrent) {
                        return {
                            ...entry,
                            ...payload,
                            addressId,
                            updatedAt: nowIso
                        };
                    }
                    if (payload.isPrimary) return { ...entry, isPrimary: false };
                    return entry;
                });
                await saveAddressesToCustomerProfile(tenantId, customerId, nextItems);
                savedItem = nextItems.find((entry) => toText(entry.addressId || '') === addressId) || null;
            }

            return res.json({ ok: true, tenantId, customerId, item: savedItem });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo actualizar direccion.') });
        }
    });

    app.delete('/api/tenant/customers/:customerId/addresses/:addressId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const customerId = toText(req.params?.customerId || '');
            const addressId = toText(req.params?.addressId || '');
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });

            if (getStorageDriver() === 'postgres') {
                try {
                    await queryPostgres(
                        `DELETE FROM tenant_customer_addresses
                          WHERE tenant_id = $1
                            AND customer_id = $2
                            AND address_id = $3`,
                        [tenantId, customerId, addressId]
                    );
                    return res.json({ ok: true, tenantId, customerId, addressId });
                } catch (_) {
                    // fallback to profile storage
                }
            }

            const existing = await listAddressesFromStorage(tenantId, customerId);
            const nextItems = (existing.items || []).filter((entry) => toText(entry.addressId || '') !== addressId);
            await saveAddressesToCustomerProfile(tenantId, customerId, nextItems);
            return res.json({ ok: true, tenantId, customerId, addressId });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo eliminar direccion.') });
        }
    });

    app.patch('/api/tenant/customers/:customerId/addresses/:addressId/set-primary', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const customerId = toText(req.params?.customerId || '');
            const addressId = toText(req.params?.addressId || '');
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });
            const nowIso = new Date().toISOString();

            if (getStorageDriver() === 'postgres') {
                try {
                    await queryPostgres(
                        `UPDATE tenant_customer_addresses
                            SET is_primary = CASE WHEN address_id = $3 THEN TRUE ELSE FALSE END,
                                updated_at = $4
                          WHERE tenant_id = $1
                            AND customer_id = $2`,
                        [tenantId, customerId, addressId, nowIso]
                    );
                    return res.json({ ok: true, tenantId, customerId, addressId });
                } catch (_) {
                    // fallback to profile storage
                }
            }

            const existing = await listAddressesFromStorage(tenantId, customerId);
            const nextItems = (existing.items || []).map((entry = {}) => ({
                ...entry,
                isPrimary: toText(entry.addressId || '') === addressId,
                updatedAt: nowIso
            }));
            await saveAddressesToCustomerProfile(tenantId, customerId, nextItems);
            return res.json({ ok: true, tenantId, customerId, addressId });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo actualizar direccion principal.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/:catalogKey', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);

            const catalogKey = toLower(req.params?.catalogKey || '');
            if (!['treatments', 'types', 'sources', 'document-types'].includes(catalogKey)) {
                return res.status(400).json({ ok: false, error: 'catalogKey invalido.' });
            }

            const items = await listCustomerCatalogItems(catalogKey);
            return res.json({
                ok: true,
                tenantId,
                catalogKey,
                items,
                total: items.length
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el catalogo solicitado.') });
        }
    });

    app.patch('/api/tenant/customers/:customerId/consent', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const consentType = toLower(req.body?.consentType || 'marketing') || 'marketing';
            const statusRaw = toLower(req.body?.status || '');
            const source = toLower(req.body?.source || 'manual') || 'manual';
            const moduleId = toText(req.body?.moduleId || '');
            const proofPayload = toSafeObject(req.body?.proofPayload);
            const actorUserId = resolveActorUserId(req);

            let result = null;
            if (['granted', 'opted_in'].includes(statusRaw)) {
                result = await grantConsent(tenantId, {
                    customerId,
                    consentType,
                    source,
                    proofPayload: {
                        ...proofPayload,
                        actorUserId
                    }
                });
            } else if (['revoked', 'opted_out'].includes(statusRaw)) {
                result = await revokeConsent(tenantId, {
                    customerId,
                    consentType,
                    source,
                    proofPayload: {
                        ...proofPayload,
                        actorUserId
                    }
                });
            } else {
                return res.status(400).json({ ok: false, error: 'status invalido. Usa granted/revoked (o opted_in/opted_out).' });
            }

            const nextMarketingOptInStatus = ['granted', 'opted_in'].includes(statusRaw)
                ? 'opted_in'
                : 'opted_out';
            const consentUpdatedAt = toText(
                result?.grantedAt
                || result?.revokedAt
                || result?.createdAt
                || new Date().toISOString()
            );
            const updatedContexts = [];

            if (moduleId) {
                const syncResult = await upsertCustomerModuleContext(tenantId, {
                    customerId,
                    moduleId,
                    marketingOptInStatus: nextMarketingOptInStatus,
                    marketingOptInUpdatedAt: consentUpdatedAt,
                    marketingOptInSource: source,
                    metadata: {
                        consentType,
                        syncedFrom: 'http.customers.consent',
                        actorUserId
                    }
                });
                if (syncResult?.context) updatedContexts.push(syncResult.context);
            } else {
                const contextsResult = await listCustomerModuleContextsByCustomer(tenantId, {
                    customerId,
                    limit: 500,
                    offset: 0
                });
                const contexts = Array.isArray(contextsResult?.items) ? contextsResult.items : [];
                for (const context of contexts) {
                    const targetModuleId = toText(context?.moduleId || context?.module_id || '');
                    if (!targetModuleId) continue;
                    const syncResult = await upsertCustomerModuleContext(tenantId, {
                        customerId,
                        moduleId: targetModuleId,
                        marketingOptInStatus: nextMarketingOptInStatus,
                        marketingOptInUpdatedAt: consentUpdatedAt,
                        marketingOptInSource: source,
                        metadata: {
                            consentType,
                            syncedFrom: 'http.customers.consent',
                            actorUserId
                        }
                    });
                    if (syncResult?.context) updatedContexts.push(syncResult.context);
                }
            }

            return res.json({
                ok: true,
                tenantId,
                customerId,
                consent: result,
                contextSync: {
                    moduleId: moduleId || null,
                    marketingOptInStatus: nextMarketingOptInStatus,
                    updatedCount: updatedContexts.length
                }
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el consentimiento.') });
        }
    });

    app.patch('/api/tenant/customers/:customerId/language', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const preferredLanguage = normalizePreferredLanguage(req.body?.preferredLanguage || 'es');

            if (getStorageDriver() === 'postgres') {
                const result = await queryPostgres(
                    `UPDATE tenant_customers
                        SET preferred_language = $3,
                            updated_at = NOW()
                      WHERE tenant_id = $1
                        AND customer_id = $2
                    RETURNING customer_id, preferred_language`,
                    [tenantId, customerId, preferredLanguage]
                );
                const row = Array.isArray(result?.rows) ? result.rows[0] : null;
                if (!row) return res.status(404).json({ ok: false, error: 'Cliente no encontrado.' });
                return res.json({
                    ok: true,
                    tenantId,
                    customerId: String(row.customer_id || customerId),
                    preferredLanguage: String(row.preferred_language || preferredLanguage)
                });
            }

            const updateResult = await customerService.updateCustomer(tenantId, customerId, {
                metadata: {
                    preferredLanguage
                }
            });

            return res.json({
                ok: true,
                tenantId,
                customerId,
                preferredLanguage,
                customer: updateResult?.item || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el idioma preferido.') });
        }
    });

    app.get('/api/tenant/template-webhook-events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const templateName = toText(req.query?.templateName || '');
            const eventType = toLower(req.query?.eventType || '');
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await listTemplateWebhookEvents(tenantId, {
                templateName,
                eventType,
                limit,
                offset
            });

            return res.json({
                ok: true,
                tenantId,
                templateName: templateName || null,
                eventType: eventType || null,
                ...result
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo listar eventos webhook de templates.') });
        }
    });

    app.get('/api/tenant/template-variables/catalog', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            const payload = await getTemplateVariablesCatalog(tenantId);
            return res.json({
                ok: true,
                tenantId,
                ...toSafeObject(payload)
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el catalogo de variables de template.') });
        }
    });

    app.get('/api/tenant/template-variables/preview', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            const chatId = toText(req.query?.chatId || '');
            const customerId = toText(req.query?.customerId || '');
            const payload = await getTemplateVariablesPreview(tenantId, { chatId, customerId });
            return res.json({
                ok: true,
                tenantId,
                ...toSafeObject(payload)
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar la previsualizacion de variables de template.') });
        }
    });

    app.get('/api/tenant/chats/:chatId/events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasConversationEventsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const eventTypes = String(req.query?.eventTypes || '').trim()
                .split(',')
                .map((entry) => String(entry || '').trim())
                .filter(Boolean);
            const limit = Number(req.query?.limit || 60);
            const offset = Number(req.query?.offset || 0);

            const result = await conversationOpsService.listConversationEvents(tenantId, {
                chatId,
                scopeModuleId,
                eventTypes,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar eventos de conversacion.') });
        }
    });

    app.get('/api/tenant/chats/:chatId/assignment', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const assignment = await conversationOpsService.getChatAssignment(tenantId, { chatId, scopeModuleId });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, assignment });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar la asignacion del chat.') });
        }
    });

    app.get('/api/tenant/chats/:chatId/commercial-status', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const commercialStatus = await getChatCommercialStatus(tenantId, { chatId, scopeModuleId });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, commercialStatus });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el estado comercial del chat.') });
        }
    });

    app.put('/api/tenant/chats/:chatId/commercial-status', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const targetStatus = toLower(req.body?.status || '');
            if (!['vendido', 'perdido'].includes(targetStatus)) {
                return res.status(400).json({ ok: false, error: 'Estado comercial invalido. Solo vendido/perdido.' });
            }

            const actorUserId = resolveActorUserId(req);
            const reason = String(req.body?.reason || '').trim();
            const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
                ? req.body.metadata
                : {};

            const result = await markManualStatus(tenantId, {
                chatId,
                scopeModuleId,
                status: targetStatus,
                source: 'manual',
                reason: reason || ('manual_mark_' + targetStatus),
                changedByUserId: actorUserId,
                metadata
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.commercial_status.updated',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    previousStatus: result?.previous?.status || null,
                    nextStatus: result?.status?.status || null,
                    changed: Boolean(result?.changed)
                }
            });

            if (typeof emitCommercialStatusUpdated === 'function') {
                emitCommercialStatusUpdated({
                    tenantId,
                    chatId,
                    scopeModuleId,
                    result,
                    source: 'http'
                });
            }

            return res.json({
                ok: true,
                tenantId,
                chatId,
                scopeModuleId,
                changed: Boolean(result?.changed),
                previousCommercialStatus: result?.previous || null,
                commercialStatus: result?.status || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el estado comercial del chat.') });
        }
    });

    app.get('/api/tenant/commercial-statuses', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const status = toLower(req.query?.status || '');
            const limit = Number(req.query?.limit || 200);
            const offset = Number(req.query?.offset || 0);

            const result = await listCommercialStatuses(tenantId, {
                scopeModuleId,
                status,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, scopeModuleId, status: status || null, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo listar estados comerciales.') });
        }
    });

    app.post('/api/tenant/meta-templates', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureMetaTemplateWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const moduleId = String(req.body?.moduleId || '').trim();
            const templatePayload = isPlainObject(req.body?.templatePayload) ? req.body.templatePayload : null;
            const useCase = toLower(req.body?.useCase || 'both') || 'both';
            const variableMapJson = isPlainObject(req.body?.variableMapJson) ? req.body.variableMapJson : {};
            if (!moduleId) return res.status(400).json({ ok: false, error: 'moduleId requerido.' });
            if (!templatePayload) return res.status(400).json({ ok: false, error: 'templatePayload requerido.' });

            const result = await createMetaTemplate(tenantId, { moduleId, templatePayload, useCase, variableMapJson });

            await auditLogService.writeAuditLog(tenantId, {
                userId: resolveActorUserId(req),
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'meta.template.create',
                resourceType: 'meta_template',
                resourceId: String(result?.template?.templateId || result?.template?.templateName || ''),
                source: 'http',
                payload: {
                    moduleId,
                    templateName: result?.template?.templateName || null,
                    templateLanguage: result?.template?.templateLanguage || null,
                    useCase: result?.template?.useCase || useCase,
                    status: result?.template?.status || null
                }
            });

            return res.status(201).json({
                ok: true,
                tenantId,
                template: result?.template || null,
                metaResponse: result?.metaResponse || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear template Meta.') });
        }
    });

    app.get('/api/tenant/meta-templates', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const status = String(req.query?.status || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await listMetaTemplates(tenantId, {
                scopeModuleId,
                status,
                limit,
                offset
            });

            return res.json({
                ok: true,
                tenantId,
                scopeModuleId: scopeModuleId || '',
                status: status || null,
                ...result
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron listar templates Meta.') });
        }
    });

    app.delete('/api/tenant/meta-templates/:templateId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureMetaTemplateWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const templateId = String(req.params?.templateId || '').trim();
            const moduleId = String(req.query?.moduleId || req.body?.moduleId || '').trim();
            if (!templateId) return res.status(400).json({ ok: false, error: 'templateId requerido.' });

            const result = await deleteMetaTemplate(tenantId, { templateId, moduleId });

            await auditLogService.writeAuditLog(tenantId, {
                userId: resolveActorUserId(req),
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'meta.template.delete',
                resourceType: 'meta_template',
                resourceId: templateId,
                source: 'http',
                payload: {
                    moduleId: moduleId || null,
                    deletedTemplateId: result?.template?.templateId || templateId,
                    templateName: result?.template?.templateName || null
                }
            });

            return res.json({
                ok: true,
                tenantId,
                templateId,
                template: result?.template || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar template Meta.') });
        }
    });

    app.post('/api/tenant/meta-templates/sync', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureMetaTemplateWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const moduleId = String(req.body?.moduleId || req.query?.moduleId || '').trim();
            if (!moduleId) return res.status(400).json({ ok: false, error: 'moduleId requerido para sincronizar.' });

            const result = await syncMetaTemplatesFromMeta(tenantId, { moduleId });

            await auditLogService.writeAuditLog(tenantId, {
                userId: resolveActorUserId(req),
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'meta.template.sync',
                resourceType: 'meta_template',
                resourceId: moduleId,
                source: 'http',
                payload: {
                    moduleId,
                    scopeModuleId: result?.scopeModuleId || null,
                    totalSynced: Number(result?.totalSynced || 0)
                }
            });

            return res.json({
                ok: true,
                tenantId,
                moduleId,
                scopeModuleId: result?.scopeModuleId || null,
                totalSynced: Number(result?.totalSynced || 0),
                items: Array.isArray(result?.items) ? result.items : []
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo sincronizar templates Meta.') });
        }
    });

    app.post('/api/tenant/campaigns', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureCampaignWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const actorUserId = resolveActorUserId(req);
            const payload = isPlainObject(req.body) ? req.body : {};
            const created = await createCampaign(tenantId, {
                ...payload,
                createdBy: actorUserId,
                updatedBy: actorUserId,
                actorUserId
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'campaign.create',
                resourceType: 'campaign',
                resourceId: String(created?.campaignId || ''),
                source: 'http',
                payload: {
                    moduleId: created?.moduleId || null,
                    templateName: created?.templateName || null,
                    status: created?.status || null
                }
            });

            return res.status(201).json({
                ok: true,
                tenantId,
                campaign: created
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear la campana.') });
        }
    });

    app.post('/api/tenant/campaigns/estimate', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureCampaignWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const payload = isPlainObject(req.body) ? req.body : {};
            const estimate = await estimateCampaign(tenantId, {
                campaignId: toText(payload.campaignId || ''),
                scopeModuleId: normalizeScopeModuleId(payload.scopeModuleId || ''),
                moduleId: toText(payload.moduleId || ''),
                templateName: toText(payload.templateName || ''),
                templateLanguage: toLower(payload.templateLanguage || 'es') || 'es',
                filters: isPlainObject(payload.filters) ? payload.filters : {}
            });

            return res.json({
                ok: true,
                tenantId,
                estimate
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo estimar el alcance de la campana.') });
        }
    });

    app.get('/api/tenant/campaigns', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const moduleId = toText(req.query?.moduleId || '');
            const status = toLower(req.query?.status || '');
            const query = toText(req.query?.query || req.query?.q || '');
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await listCampaigns(tenantId, {
                scopeModuleId,
                moduleId,
                status,
                query,
                limit,
                offset
            });

            return res.json({
                ok: true,
                tenantId,
                scopeModuleId: scopeModuleId || '',
                moduleId: moduleId || null,
                status: status || null,
                query: query || null,
                ...result
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron listar campanas.') });
        }
    });

    app.get('/api/tenant/campaigns/:campaignId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const campaignId = toText(req.params?.campaignId || '');
            if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId invalido.' });

            const campaign = await getCampaignById(tenantId, { campaignId });
            if (!campaign) return res.status(404).json({ ok: false, error: 'Campana no encontrada.' });

            return res.json({ ok: true, tenantId, campaign });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el detalle de la campana.') });
        }
    });

    app.patch('/api/tenant/campaigns/:campaignId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureCampaignWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const campaignId = toText(req.params?.campaignId || '');
            if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId invalido.' });

            const current = await getCampaignById(tenantId, { campaignId });
            if (!current) return res.status(404).json({ ok: false, error: 'Campana no encontrada.' });
            if (toLower(current.status) !== 'draft') {
                return res.status(400).json({ ok: false, error: 'Solo se puede editar una campana en estado draft.' });
            }

            const actorUserId = resolveActorUserId(req);
            const patch = isPlainObject(req.body) ? req.body : {};
            const updated = await updateCampaign(tenantId, {
                campaignId,
                patch: {
                    ...patch,
                    updatedBy: actorUserId,
                    actorUserId
                }
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'campaign.update_draft',
                resourceType: 'campaign',
                resourceId: campaignId,
                source: 'http',
                payload: {
                    status: updated?.status || null
                }
            });

            return res.json({ ok: true, tenantId, campaign: updated });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar la campana.') });
        }
    });

    app.post('/api/tenant/campaigns/:campaignId/start', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureCampaignWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const campaignId = toText(req.params?.campaignId || '');
            if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId invalido.' });
            const actorUserId = resolveActorUserId(req);

            const campaign = await startCampaign(tenantId, {
                campaignId,
                actorUserId
            });

            return res.json({ ok: true, tenantId, campaign });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo iniciar la campana.') });
        }
    });

    app.post('/api/tenant/campaigns/:campaignId/pause', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureCampaignWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const campaignId = toText(req.params?.campaignId || '');
            if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId invalido.' });
            const actorUserId = resolveActorUserId(req);

            const campaign = await pauseCampaign(tenantId, {
                campaignId,
                actorUserId
            });

            return res.json({ ok: true, tenantId, campaign });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo pausar la campana.') });
        }
    });

    app.post('/api/tenant/campaigns/:campaignId/resume', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureCampaignWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const campaignId = toText(req.params?.campaignId || '');
            if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId invalido.' });
            const actorUserId = resolveActorUserId(req);

            const campaign = await resumeCampaign(tenantId, {
                campaignId,
                actorUserId
            });

            return res.json({ ok: true, tenantId, campaign });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo reanudar la campana.') });
        }
    });

    app.post('/api/tenant/campaigns/:campaignId/cancel', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = resolveTenantIdFromContext(req);
            const access = ensureCampaignWriteAccess(req, tenantId);
            if (!access.ok) {
                return res.status(Number(access.statusCode || 403)).json({ ok: false, error: String(access.error || 'No autorizado.') });
            }

            const campaignId = toText(req.params?.campaignId || '');
            if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId invalido.' });
            const actorUserId = resolveActorUserId(req);
            const reason = toText(req.body?.reason || '');

            const campaign = await cancelCampaign(tenantId, {
                campaignId,
                actorUserId,
                reason
            });

            return res.json({ ok: true, tenantId, campaign });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo cancelar la campana.') });
        }
    });

    app.get('/api/tenant/campaigns/:campaignId/recipients', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const campaignId = toText(req.params?.campaignId || '');
            if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId invalido.' });

            const status = toLower(req.query?.status || '');
            const moduleId = toText(req.query?.moduleId || '');
            const search = toText(req.query?.search || '');
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await listCampaignRecipients(tenantId, {
                campaignId,
                status,
                moduleId,
                search,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, campaignId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron listar destinatarios de campana.') });
        }
    });

    app.get('/api/tenant/campaigns/:campaignId/events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const campaignId = toText(req.params?.campaignId || '');
            if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId invalido.' });

            const eventType = toLower(req.query?.eventType || '');
            const severity = toLower(req.query?.severity || '');
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await listCampaignEvents(tenantId, {
                campaignId,
                eventType,
                severity,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, campaignId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron listar eventos de campana.') });
        }
    });

    app.put('/api/tenant/chats/:chatId/assignment', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const assigneeUserId = String(req.body?.assigneeUserId || '').trim();
            const requestedAssigneeRole = String(req.body?.assigneeRole || '').trim().toLowerCase();
            const assignmentReason = String(req.body?.assignmentReason || '').trim();
            const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
                ? req.body.metadata
                : {};
            const previousAssignment = await conversationOpsService.getChatAssignment(tenantId, { chatId, scopeModuleId });
            const isInitialAssignment = Boolean(assigneeUserId) && !toText(previousAssignment?.assigneeUserId);

            if (isInitialAssignment) {
                const policyResult = assertInitialAssignmentAllowed({ req, tenantId });
                if (!policyResult?.ok) {
                    return res.status(Number(policyResult?.statusCode || 403)).json({ ok: false, error: String(policyResult?.error || 'No autorizado.') });
                }
            }

            let resolvedAssigneeRole = requestedAssigneeRole || null;

            if (assigneeUserId) {
                const assignee = authService.findUserRecord({ userId: assigneeUserId });
                if (!assignee) {
                    return res.status(400).json({ ok: false, error: 'El usuario asignado no existe.' });
                }

                const memberships = Array.isArray(assignee.memberships) ? assignee.memberships : [];
                const activeMembership = memberships.find((membership) =>
                    String(membership?.tenantId || '').trim() === tenantId && membership?.active !== false
                );
                if (!activeMembership) {
                    return res.status(400).json({ ok: false, error: 'El usuario no pertenece a esta empresa.' });
                }
                if (!resolvedAssigneeRole) {
                    resolvedAssigneeRole = String(activeMembership?.role || assignee?.role || 'seller').trim().toLowerCase() || 'seller';
                }
            }

            const actorUserId = resolveActorUserId(req);
            const result = await conversationOpsService.upsertChatAssignment(tenantId, {
                chatId,
                scopeModuleId,
                assigneeUserId: assigneeUserId || null,
                assigneeRole: resolvedAssigneeRole || null,
                assignedByUserId: actorUserId,
                assignmentMode: 'manual',
                assignmentReason,
                metadata,
                status: assigneeUserId ? 'active' : 'released'
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.updated',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    previousAssigneeUserId: result?.previous?.assigneeUserId || null,
                    nextAssigneeUserId: result?.assignment?.assigneeUserId || null,
                    changed: Boolean(result?.changed)
                }
            });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, ...result, previousAssignment: result?.previous || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar la asignacion del chat.') });
        }
    });

    app.post('/api/tenant/chats/:chatId/take', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const policyResult = assertTakeChatAllowed({ req, tenantId });
            if (!policyResult?.ok) {
                return res.status(Number(policyResult?.statusCode || 403)).json({ ok: false, error: String(policyResult?.error || 'No autorizado.') });
            }

            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const assignmentReason = String(req.body?.assignmentReason || '').trim() || 'take_chat';
            const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
                ? req.body.metadata
                : {};
            const actorUserId = resolveActorUserId(req);
            if (!actorUserId) return res.status(401).json({ ok: false, error: 'No autenticado.' });

            const actorRole = String(resolveActorTenantRole({ req, tenantId }) || 'seller').trim().toLowerCase() || 'seller';
            const result = await conversationOpsService.upsertChatAssignment(tenantId, {
                chatId,
                scopeModuleId,
                assigneeUserId: actorUserId,
                assigneeRole: actorRole,
                assignedByUserId: actorUserId,
                assignmentMode: 'take',
                assignmentReason,
                metadata,
                status: 'active'
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.taken',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    previousAssigneeUserId: result?.previous?.assigneeUserId || null,
                    nextAssigneeUserId: result?.assignment?.assigneeUserId || null,
                    changed: Boolean(result?.changed)
                }
            });

            return res.json({
                ok: true,
                tenantId,
                chatId,
                scopeModuleId,
                changed: Boolean(result?.changed),
                previousAssignment: result?.previous || null,
                assignment: result?.assignment || null
            });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo tomar el chat.') });
        }
    });

    app.delete('/api/tenant/chats/:chatId/assignment', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || req.body?.scopeModuleId || '');
            const actorUserId = resolveActorUserId(req);
            const policyResult = assertReleaseAllowed({ req, tenantId });
            if (!policyResult?.ok) {
                return res.status(Number(policyResult?.statusCode || 403)).json({ ok: false, error: String(policyResult?.error || 'No autorizado.') });
            }
            const result = await conversationOpsService.clearChatAssignment(tenantId, {
                chatId,
                scopeModuleId,
                assignedByUserId: actorUserId,
                assignmentMode: 'manual',
                assignmentReason: 'release'
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.cleared',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    previousAssigneeUserId: result?.previous?.assigneeUserId || null
                }
            });

            return res.json({ ok: true, tenantId, chatId, scopeModuleId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo liberar la asignacion.') });
        }
    });

    app.get('/api/tenant/assignments', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const assigneeUserId = String(req.query?.assigneeUserId || '').trim();
            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const status = String(req.query?.status || '').trim();
            const limit = Number(req.query?.limit || 60);
            const offset = Number(req.query?.offset || 0);

            const result = await conversationOpsService.listChatAssignments(tenantId, {
                assigneeUserId,
                scopeModuleId,
                status,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar asignaciones.') });
        }
    });

    app.get('/api/tenant/assignment-events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasChatAssignmentsReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.query?.chatId || '').trim();
            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const limit = Number(req.query?.limit || 60);
            const offset = Number(req.query?.offset || 0);

            const result = await conversationOpsService.listChatAssignmentEvents(tenantId, {
                chatId,
                scopeModuleId,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar eventos de asignacion.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/assignment-rules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasAssignmentRulesReadAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const items = await assignmentRulesService.listRules(tenantId);
            const effective = await assignmentRulesService.getEffectiveRule(tenantId, scopeModuleId || '');
            return res.json({ ok: true, tenantId, scopeModuleId, items, effective });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar reglas de asignacion.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/assignment-rules', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasAssignmentRulesWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const actorUserId = resolveActorUserId(req);
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const saved = await assignmentRulesService.upsertRule(tenantId, {
                scopeModuleId: normalizeScopeModuleId(payload.scopeModuleId || ''),
                enabled: payload.enabled === true,
                mode: payload.mode,
                allowedRoles: Array.isArray(payload.allowedRoles) ? payload.allowedRoles : [],
                maxOpenChatsPerUser: payload.maxOpenChatsPerUser,
                metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
                updatedByUserId: actorUserId
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.rule.updated',
                resourceType: 'assignment_rule',
                resourceId: String(saved?.scopeModuleId || ''),
                source: 'http',
                payload: {
                    scopeModuleId: saved?.scopeModuleId || '',
                    enabled: saved?.enabled === true,
                    mode: saved?.mode || 'least_load',
                    maxOpenChatsPerUser: saved?.maxOpenChatsPerUser || null,
                    allowedRoles: Array.isArray(saved?.allowedRoles) ? saved.allowedRoles : []
                }
            });

            return res.json({ ok: true, tenantId, rule: saved });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar la regla de asignacion.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/chats/:chatId/auto-assign', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const chatId = String(req.params?.chatId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });
        if (!hasAssignmentRulesWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const actorUserId = resolveActorUserId(req);
            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const trigger = String(req.body?.trigger || 'manual').trim().toLowerCase() || 'manual';
            const assignmentReason = String(req.body?.assignmentReason || '').trim();

            const result = await chatAssignmentRouterService.autoAssignChat(tenantId, {
                chatId,
                scopeModuleId,
                actorUserId,
                trigger,
                assignmentReason
            });

            await auditLogService.writeAuditLog(tenantId, {
                userId: actorUserId,
                userEmail: req?.authContext?.user?.email || null,
                role: req?.authContext?.user?.role || null,
                action: 'chat.assignment.auto.assign',
                resourceType: 'chat',
                resourceId: chatId,
                source: 'http',
                payload: {
                    scopeModuleId,
                    trigger,
                    resultMode: result?.mode || null,
                    reused: Boolean(result?.reused),
                    selectedCandidate: result?.selectedCandidate || null,
                    reason: result?.reason || null
                }
            });

            return res.json({ ok: Boolean(result?.ok), tenantId, chatId, scopeModuleId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo autoasignar el chat.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/kpis/operations', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!hasOperationsKpiReadAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        try {
            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const from = req.query?.from || req.query?.fromUnix || null;
            const to = req.query?.to || req.query?.toUnix || null;
            const assigneeUserId = String(req.query?.assigneeUserId || '').trim();

            const kpis = await operationsKpiService.getOperationsKpis(tenantId, {
                from,
                to,
                scopeModuleId,
                assigneeUserId
            });

            return res.json({ ok: true, tenantId, scopeModuleId, assigneeUserId: assigneeUserId || null, ...kpis });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar KPIs operativos.') });
        }
    });

    app.get('/api/tenant/assignment-rules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasAssignmentRulesReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const items = await assignmentRulesService.listRules(tenantId);
            const effective = await assignmentRulesService.getEffectiveRule(tenantId, scopeModuleId || '');
            return res.json({ ok: true, tenantId, scopeModuleId, items, effective });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar reglas de asignacion.') });
        }
    });

    app.put('/api/tenant/assignment-rules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasAssignmentRulesWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const actorUserId = resolveActorUserId(req);
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const saved = await assignmentRulesService.upsertRule(tenantId, {
                scopeModuleId: normalizeScopeModuleId(payload.scopeModuleId || ''),
                enabled: payload.enabled === true,
                mode: payload.mode,
                allowedRoles: Array.isArray(payload.allowedRoles) ? payload.allowedRoles : [],
                maxOpenChatsPerUser: payload.maxOpenChatsPerUser,
                metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
                updatedByUserId: actorUserId
            });

            return res.json({ ok: true, tenantId, rule: saved });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar la regla de asignacion.') });
        }
    });

    app.post('/api/tenant/chats/:chatId/auto-assign', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasAssignmentRulesWriteAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const chatId = String(req.params?.chatId || '').trim();
            if (!chatId) return res.status(400).json({ ok: false, error: 'chatId invalido.' });

            const actorUserId = resolveActorUserId(req);
            const scopeModuleId = normalizeScopeModuleId(req.body?.scopeModuleId || req.query?.scopeModuleId || '');
            const trigger = String(req.body?.trigger || 'manual').trim().toLowerCase() || 'manual';
            const assignmentReason = String(req.body?.assignmentReason || '').trim();

            const result = await chatAssignmentRouterService.autoAssignChat(tenantId, {
                chatId,
                scopeModuleId,
                actorUserId,
                trigger,
                assignmentReason
            });

            return res.json({ ok: Boolean(result?.ok), tenantId, chatId, scopeModuleId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo autoasignar el chat.') });
        }
    });

    app.get('/api/tenant/kpis/operations', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = resolveTenantIdFromContext(req);
            if (!hasOperationsKpiReadAccess(req, tenantId)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            const scopeModuleId = normalizeScopeModuleId(req.query?.scopeModuleId || '');
            const from = req.query?.from || req.query?.fromUnix || null;
            const to = req.query?.to || req.query?.toUnix || null;
            const assigneeUserId = String(req.query?.assigneeUserId || '').trim();

            const kpis = await operationsKpiService.getOperationsKpis(tenantId, {
                from,
                to,
                scopeModuleId,
                assigneeUserId
            });

            return res.json({ ok: true, tenantId, scopeModuleId, assigneeUserId: assigneeUserId || null, ...kpis });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar KPIs operativos.') });
        }
    });
}

module.exports = {
    registerOperationsHttpRoutes
};

