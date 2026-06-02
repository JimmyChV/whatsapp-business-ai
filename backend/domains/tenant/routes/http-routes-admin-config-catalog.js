const catalogSyncService = require('../services/catalog-sync.service');

const emailService = require('../../security/services/email.service');
const emailTemplatesService = require('../../security/services/email-templates.service');
const {
    getStorageDriver,
    queryPostgres
} = require('../../../config/persistence-runtime');

function text(value = '') {
    return String(value || '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function isPostgresAvailable() {
    return getStorageDriver() === 'postgres';
}

function getRequestTenantId(req) {
    const tenantId = text(req?.authContext?.user?.tenantId || req?.tenantContext?.id);
    return tenantId && tenantId !== 'default' ? tenantId : null;
}

function sanitizeTenantSmtpPayload(payload = {}) {
    const source = payload?.smtp && typeof payload.smtp === 'object' ? payload.smtp : payload;
    const security = text(source.security || 'tls').toLowerCase();
    const port = Number(source.port || 587);
    const clean = {
        host: text(source.host),
        port: Number.isFinite(port) ? Math.max(1, Math.min(65535, Math.floor(port))) : 587,
        user: text(source.user),
        from: text(source.from),
        security: ['tls', 'ssl', 'none'].includes(security) ? security : 'tls',
        tlsRejectUnauthorized: source.tlsRejectUnauthorized === true
    };
    const pass = text(source.pass || source.password);
    if (pass) clean.pass = pass;
    return clean;
}

const ALLOWED_METADATA_KEYS = [
    'brand',
    'unit',
    'weight',
    'dimensions',
    'tags',
    'notes',
    'supplier',
    'barcode'
];
const MAX_METADATA_SIZE = 5000;

function sanitizeProductMetadata(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const size = Buffer.byteLength(JSON.stringify(raw), 'utf8');
    if (size > MAX_METADATA_SIZE) {
        throw new Error('Metadata demasiado grande.');
    }

    return Object.fromEntries(
        Object.entries(raw)
            .filter(([key]) => ALLOWED_METADATA_KEYS.includes(String(key || '').trim()))
            .map(([key, value]) => [key, String(value ?? '').slice(0, 500)])
    );
}

function ensureTenantIntegrationsRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService }) {
    return isTenantAllowedForUser(req, tenantId)
        && hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_READ,
            accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE
        ]);
}

function ensureTenantIntegrationsManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService }) {
    return isTenantAllowedForUser(req, tenantId)
        && hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE);
}

function ensureEmailTemplatesRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService }) {
    return isTenantAllowedForUser(req, tenantId)
        && hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_EMAIL_TEMPLATES_READ,
            accessPolicyService.PERMISSIONS.TENANT_EMAIL_TEMPLATES_MANAGE
        ]);
}

function ensureEmailTemplatesManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService }) {
    return isTenantAllowedForUser(req, tenantId)
        && hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_EMAIL_TEMPLATES_MANAGE);
}

function ensureBrandRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService }) {
    return isTenantAllowedForUser(req, tenantId)
        && hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_BRAND_READ,
            accessPolicyService.PERMISSIONS.TENANT_BRAND_MANAGE
        ]);
}

function ensureBrandManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService }) {
    return isTenantAllowedForUser(req, tenantId)
        && hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_BRAND_MANAGE);
}

function isValidEmail(value = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower(value));
}

function normalizeDeviceAuthorizer(row = null) {
    if (!row || typeof row !== 'object') return null;
    return {
        id: row.id,
        tenantId: text(row.tenant_id || row.tenantId),
        userId: text(row.user_id || row.userId),
        email: lower(row.email),
        name: text(row.name),
        isActive: row.is_active !== false && row.isActive !== false,
        createdAt: row.created_at || row.createdAt || null
    };
}

async function listTenantDeviceAuthorizers(tenantId = '') {
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId || !isPostgresAvailable()) return [];
    const { rows } = await queryPostgres(
        `SELECT id, tenant_id, user_id, email, name, is_active, created_at
           FROM tenant_device_authorizers
          WHERE tenant_id = $1
            AND is_active = TRUE
          ORDER BY created_at ASC NULLS LAST, id ASC`,
        [cleanTenantId]
    );
    return (rows || []).map(normalizeDeviceAuthorizer).filter((item) => item?.email);
}

async function getTenantOwnerEmail(tenantId = '') {
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId || !isPostgresAvailable()) return '';
    const { rows } = await queryPostgres(
        `SELECT u.email
           FROM memberships m
           JOIN users u ON u.user_id = m.user_id
          WHERE m.tenant_id = $1
            AND m.role = 'owner'
            AND m.is_active = TRUE
            AND u.is_active = TRUE
          ORDER BY u.created_at ASC NULLS LAST
          LIMIT 1`,
        [cleanTenantId]
    );
    return lower(rows?.[0]?.email);
}

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
    hasTenantCatalogReadAccess,
    hasTenantCatalogWriteAccess,
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

    app.get('/api/tenant/smtp', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!ensureTenantIntegrationsRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const integrations = await tenantIntegrationsService.getTenantIntegrations(tenantId);
            return res.json({ ok: true, tenantId, smtp: integrations?.smtp || {} });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar la configuracion de correo.') });
        }
    });

    app.put('/api/tenant/smtp', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!ensureTenantIntegrationsManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const patch = { smtp: sanitizeTenantSmtpPayload(req.body) };
            const integrations = await tenantIntegrationsService.updateTenantIntegrations(tenantId, patch);
            return res.json({ ok: true, tenantId, smtp: integrations?.smtp || {} });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar la configuracion de correo.') });
        }
    });

    app.post('/api/tenant/smtp/test', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        const to = text(req?.authContext?.user?.email || req?.body?.to);
        console.log('[SMTP Test] iniciando prueba', {
            tenantId,
            to,
            hasGlobalSmtp: !!process.env.SMTP_HOST,
            smtpHost: process.env.SMTP_HOST
        });
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!to) return res.status(400).json({ ok: false, error: 'El usuario actual no tiene correo para la prueba.' });
        if (!ensureTenantIntegrationsManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            await emailService.sendEmailForTenant(tenantId, {
                to,
                subject: 'Prueba de correo SMTP',
                text: 'Este es un correo de prueba enviado desde la configuracion SMTP del panel.',
                html: '<p>Este es un correo de prueba enviado desde la configuracion SMTP del panel.</p>'
            });
            console.log('[SMTP Test] resultado', { ok: true, error: null });
            return res.json({ ok: true, message: 'Correo enviado correctamente.' });
        } catch (error) {
            const errorMessage = String(error?.message || 'No se pudo enviar el correo de prueba.');
            console.log('[SMTP Test] resultado', { ok: false, error: errorMessage });
            return res.status(400).json({ ok: false, error: errorMessage });
        }
    });

    app.get('/api/tenant/email-templates', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!ensureEmailTemplatesRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const items = await emailTemplatesService.listTemplates(tenantId);
            return res.json({ ok: true, tenantId, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar plantillas de correo.') });
        }
    });

    app.get('/api/tenant/email-templates/:key', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        const templateKey = text(req.params?.key);
        if (!tenantId || !templateKey) return res.status(400).json({ ok: false, error: 'tenantId/templateKey invalido.' });
        if (!ensureEmailTemplatesRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const item = await emailTemplatesService.getTemplate(tenantId, templateKey);
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo cargar la plantilla.') });
        }
    });

    app.put('/api/tenant/email-templates/:key', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        const templateKey = text(req.params?.key);
        if (!tenantId || !templateKey) return res.status(400).json({ ok: false, error: 'tenantId/templateKey invalido.' });
        if (!ensureEmailTemplatesManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const userId = text(req?.authContext?.user?.userId || req?.authContext?.user?.id);
            const item = await emailTemplatesService.saveTemplate(tenantId, templateKey, req.body || {}, userId);
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar la plantilla.') });
        }
    });

    app.delete('/api/tenant/email-templates/:key', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        const templateKey = text(req.params?.key);
        if (!tenantId || !templateKey) return res.status(400).json({ ok: false, error: 'tenantId/templateKey invalido.' });
        if (!ensureEmailTemplatesManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const item = await emailTemplatesService.resetTemplate(tenantId, templateKey);
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo restaurar la plantilla.') });
        }
    });

    app.post('/api/tenant/email-templates/:key/preview', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        const templateKey = text(req.params?.key);
        if (!tenantId || !templateKey) return res.status(400).json({ ok: false, error: 'tenantId/templateKey invalido.' });
        if (!ensureEmailTemplatesRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const template = req.body?.subject || req.body?.bodyHtml
                ? (() => {
                    const draft = { ...(emailTemplatesService.TEMPLATE_DEFINITIONS[templateKey] || {}) };
                    const subject = text(req.body.subject);
                    const bodyHtml = text(req.body.bodyHtml || req.body.body_html);
                    return {
                        ...draft,
                        subject: subject || draft.subject,
                        bodyHtml: bodyHtml || draft.bodyHtml
                    };
                })()
                : await emailTemplatesService.getTemplate(tenantId, templateKey);
            const brand = await emailTemplatesService.getBrand(tenantId);
            const variables = {
                ...emailTemplatesService.getSampleVariables(templateKey),
                ...(req.body?.variables && typeof req.body.variables === 'object' ? req.body.variables : {})
            };
            const rendered = emailTemplatesService.renderTemplate(template, variables, brand);
            return res.json({ ok: true, tenantId, templateKey, ...rendered });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo generar vista previa.') });
        }
    });

    app.post('/api/tenant/email-templates/:key/test', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        const templateKey = text(req.params?.key);
        const to = text(req?.authContext?.user?.email || req?.body?.to);
        if (!tenantId || !templateKey) return res.status(400).json({ ok: false, error: 'tenantId/templateKey invalido.' });
        if (!to) return res.status(400).json({ ok: false, error: 'El usuario actual no tiene correo para la prueba.' });
        if (!ensureEmailTemplatesManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            await emailService.sendEmailForTenant(tenantId, {
                to,
                templateKey,
                variables: {
                    ...emailTemplatesService.getSampleVariables(templateKey),
                    ...(req.body?.variables && typeof req.body.variables === 'object' ? req.body.variables : {})
                }
            });
            return res.json({ ok: true, message: 'Correo de prueba enviado correctamente.' });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo enviar correo de prueba.') });
        }
    });

    app.get('/api/tenant/email-brand', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!ensureBrandRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const brand = await emailTemplatesService.getBrand(tenantId);
            return res.json({ ok: true, tenantId, brand });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar identidad de marca.') });
        }
    });

    app.put('/api/tenant/email-brand', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!ensureBrandManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const brand = await emailTemplatesService.upsertBrand(tenantId, req.body || {});
            return res.json({ ok: true, tenantId, brand });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar identidad de marca.') });
        }
    });

    app.get('/api/tenant/device-authorizers', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!ensureTenantIntegrationsRead(req, tenantId, { isTenantAllowedForUser, hasAnyPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const items = await listTenantDeviceAuthorizers(tenantId);
            return res.json({ ok: true, tenantId, items, limit: 5 });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar autorizadores.') });
        }
    });

    app.post('/api/tenant/device-authorizers', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!ensureTenantIntegrationsManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }
        if (!isPostgresAvailable()) return res.status(503).json({ ok: false, error: 'Base de datos no disponible.' });

        try {
            const email = lower(req?.body?.email);
            const name = text(req?.body?.name);
            if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'Email invalido.' });

            const current = await listTenantDeviceAuthorizers(tenantId);
            const alreadyActive = current.some((item) => item.email === email);
            if (!alreadyActive && current.length >= 5) {
                return res.status(400).json({ ok: false, error: 'Maximo 5 autorizadores por tenant.' });
            }

            const { rows } = await queryPostgres(
                `INSERT INTO tenant_device_authorizers (
                    tenant_id, email, name, is_active, created_at
                ) VALUES (
                    $1, $2, $3, TRUE, NOW()
                )
                ON CONFLICT (tenant_id, email)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    is_active = TRUE
                RETURNING id, tenant_id, user_id, email, name, is_active, created_at`,
                [tenantId, email, name]
            );
            const items = await listTenantDeviceAuthorizers(tenantId);
            return res.json({ ok: true, tenantId, item: normalizeDeviceAuthorizer(rows?.[0] || null), items, limit: 5 });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar autorizador.') });
        }
    });

    app.delete('/api/tenant/device-authorizers/:id', async (req, res) => {
        const tenantId = getRequestTenantId(req);
        const id = Number.parseInt(String(req.params?.id || ''), 10);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Autorizador invalido.' });
        if (!ensureTenantIntegrationsManage(req, tenantId, { isTenantAllowedForUser, hasPermission, accessPolicyService })) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }
        if (!isPostgresAvailable()) return res.status(503).json({ ok: false, error: 'Base de datos no disponible.' });

        try {
            const current = await listTenantDeviceAuthorizers(tenantId);
            const isDeletingLast = current.length <= 1 && current.some((item) => Number(item.id) === id);
            const ownerEmail = isDeletingLast ? await getTenantOwnerEmail(tenantId) : '';
            if (isDeletingLast && !ownerEmail) {
                return res.status(400).json({ ok: false, error: 'No se puede eliminar el unico autorizador sin owner fallback.' });
            }

            await queryPostgres(
                `UPDATE tenant_device_authorizers
                    SET is_active = FALSE
                  WHERE tenant_id = $1
                    AND id = $2`,
                [tenantId, id]
            );
            const items = await listTenantDeviceAuthorizers(tenantId);
            return res.json({ ok: true, tenantId, items, limit: 5 });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar autorizador.') });
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
        if (!hasTenantCatalogReadAccess(req, tenantId)) {
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
        if (!hasTenantCatalogWriteAccess(req, tenantId)) {
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
        if (!hasTenantCatalogWriteAccess(req, tenantId)) {
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
        if (!hasTenantCatalogWriteAccess(req, tenantId)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const result = await tenantCatalogService.deactivateCatalog(tenantId, catalogId);
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar el catalogo.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId/sync-status', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        if (!tenantId || !catalogId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId invalido.' });
        if (!hasTenantCatalogReadAccess(req, tenantId)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const status = await catalogSyncService.getSyncStatus(tenantId, catalogId);
            return res.json({ ok: true, tenantId, catalogId, status });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar estado de sincronizacion.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId/sync', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        if (!tenantId || !catalogId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId invalido.' });
        if (!hasTenantCatalogWriteAccess(req, tenantId)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const hasInterval = Object.prototype.hasOwnProperty.call(body, 'intervalHours');
            if (body.scheduleOnly === true) {
                if (hasInterval) catalogSyncService.scheduleCatalogSync(tenantId, catalogId, body.intervalHours);
                const status = await catalogSyncService.getSyncStatus(tenantId, catalogId);
                return res.json({ ok: true, tenantId, catalogId, status });
            }

            const result = await catalogSyncService.syncCatalogFromWoocommerce(tenantId, catalogId);
            if (hasInterval) catalogSyncService.scheduleCatalogSync(tenantId, catalogId, body.intervalHours);
            const status = await catalogSyncService.getSyncStatus(tenantId, catalogId);
            return res.json({ ok: true, tenantId, catalogId, result, status });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo sincronizar el catalogo.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/catalogs/:catalogId/products', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const catalogId = String(req.params?.catalogId || '').trim().toUpperCase();
        const moduleId = String(req.query?.moduleId || '').trim().toLowerCase();
        if (!tenantId || !catalogId) return res.status(400).json({ ok: false, error: 'tenantId/catalogId invalido.' });
        if (!hasTenantCatalogReadAccess(req, tenantId)) {
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
        if (!hasTenantCatalogWriteAccess(req, tenantId)) {
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
                    ...sanitizeProductMetadata(req.body?.metadata),
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
        if (!hasTenantCatalogWriteAccess(req, tenantId)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const updates = sanitizeProductPayload(req.body, { allowPartial: true });
            const moduleId = String(updates.moduleId || req.body?.moduleId || '').trim().toLowerCase();
            const metadataPatch = sanitizeProductMetadata(req.body?.metadata);
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
        if (!hasTenantCatalogWriteAccess(req, tenantId)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const item = await updateProduct(productId, {
                catalogId,
                stockStatus: 'outofstock',
                metadata: {
                    ...sanitizeProductMetadata(req.body?.metadata),
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

