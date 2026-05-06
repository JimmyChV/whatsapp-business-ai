const crypto = require('crypto');

const CLOUD_WEBHOOK_DEBUG = String(process.env.CLOUD_WEBHOOK_DEBUG || 'true').trim().toLowerCase() !== 'false';
const WEBHOOK_CONFIG_CACHE_TTL_MS = Math.max(3000, Number(process.env.WEBHOOK_CONFIG_CACHE_TTL_MS || 15000));

let webhookCloudRegistryCache = {
    expiresAt: 0,
    items: []
};

function invalidateWebhookCloudRegistryCache() {
    webhookCloudRegistryCache = { expiresAt: 0, items: [] };
}

function timingSafeEqualHex(a = '', b = '') {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    if (left.length !== right.length) return false;
    try {
        return crypto.timingSafeEqual(left, right);
    } catch (error) {
        return false;
    }
}

function extractWebhookPhoneNumberId(payload = {}) {
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
            const value = change?.value || {};
            const phoneId = String(
                value?.metadata?.phone_number_id
                || value?.phone_number_id
                || ''
            ).trim();
            if (phoneId) return phoneId;
        }
    }
    return '';
}

async function getWebhookCloudRegistry({
    saasControlService,
    waModuleService,
    force = false
} = {}) {
    if (!saasControlService || !waModuleService) {
        throw new Error('Dependencias de webhook cloud incompletas.');
    }

    const now = Date.now();
    if (!force && webhookCloudRegistryCache.expiresAt > now && Array.isArray(webhookCloudRegistryCache.items)) {
        return webhookCloudRegistryCache.items;
    }

    await saasControlService.ensureLoaded();
    const tenants = saasControlService.listTenantsSync({ includeInactive: true });
    const items = [];

    for (const tenant of tenants) {
        const tenantId = String(tenant?.id || '').trim();
        if (!tenantId) continue;

        let modules = [];
        try {
            modules = await waModuleService.listModulesRuntime(tenantId, { includeInactive: false });
        } catch (_) {
            modules = [];
        }

        for (const module of modules) {
            const transportMode = String(module?.transportMode || '').trim().toLowerCase();
            if (transportMode !== 'cloud') continue;

            const runtimeCloud = waModuleService.resolveModuleCloudConfig(module);
            const moduleId = String(module?.moduleId || '').trim();
            const verifyToken = String(runtimeCloud?.verifyToken || '').trim();
            const phoneNumberId = String(runtimeCloud?.phoneNumberId || '').trim();
            const appSecret = String(runtimeCloud?.appSecret || '').trim();
            const appId = String(runtimeCloud?.appId || '').trim();
            const systemUserToken = String(runtimeCloud?.systemUserToken || '').trim();
            if (!moduleId) continue;

            items.push({
                tenantId,
                moduleId,
                moduleName: String(module?.name || '').trim() || null,
                modulePhone: String(module?.phoneNumber || '').trim() || null,
                channelType: String(module?.channelType || '').trim().toLowerCase() || null,
                isSelected: module?.isSelected === true,
                verifyToken,
                phoneNumberId,
                appSecret,
                appId,
                systemUserToken,
                cloudConfig: runtimeCloud
            });
        }
    }

    webhookCloudRegistryCache = {
        expiresAt: now + WEBHOOK_CONFIG_CACHE_TTL_MS,
        items
    };

    return items;
}

function validateMetaWebhookSignature(req, registryItems = []) {
    const registry = Array.isArray(registryItems) ? registryItems : [];
    const payload = req?.body && typeof req.body === 'object' ? req.body : {};
    const phoneNumberId = extractWebhookPhoneNumberId(payload);

    let scoped = registry;
    if (phoneNumberId) {
        const byPhone = registry.filter((item) => String(item?.phoneNumberId || '').trim() === phoneNumberId);
        if (byPhone.length > 0) scoped = byPhone;
    }

    if (!phoneNumberId && scoped.length > 1) {
        const selectedOnly = scoped.filter((item) => item?.isSelected);
        if (selectedOnly.length > 0) scoped = selectedOnly;
    }

    const requiresSignature = scoped.filter((item) => (item?.cloudConfig?.enforceSignature !== false));
    if (requiresSignature.length === 0) {
        return { ok: true, skipped: true, reason: 'signature_not_required' };
    }

    const secrets = Array.from(new Set(
        requiresSignature
            .map((item) => String(item?.appSecret || '').trim())
            .filter(Boolean)
    ));

    if (secrets.length === 0) {
        return { ok: true, skipped: true, reason: 'no_app_secret_configured' };
    }

    const incoming = String(req.get('x-hub-signature-256') || '').trim();
    if (!incoming.startsWith('sha256=')) {
        return { ok: false, reason: 'missing_signature' };
    }

    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from('');
    for (const secret of secrets) {
        const expectedHash = crypto
            .createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');
        const expected = 'sha256=' + expectedHash;
        if (timingSafeEqualHex(expected, incoming)) {
            return { ok: true, reason: 'ok' };
        }
    }

    return { ok: false, reason: 'signature_mismatch' };
}

function summarizeMetaWebhookPayload(payload = {}) {
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    let changesCount = 0;
    let messagesCount = 0;
    let statusesCount = 0;
    let deliveryErrorsCount = 0;
    const statusKinds = new Set();
    let templateStatusUpdatesCount = 0;
    let templateQualityUpdatesCount = 0;
    let templateCategoryUpdatesCount = 0;

    entries.forEach((entry) => {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        changesCount += changes.length;
        changes.forEach((change) => {
            const field = String(change?.field || '').trim().toLowerCase();
            const value = change?.value || {};
            const messages = Array.isArray(value?.messages) ? value.messages : [];
            const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
            messagesCount += messages.length;
            statusesCount += statuses.length;

            statuses.forEach((status) => {
                const statusKind = String(status?.status || '').trim().toLowerCase();
                if (statusKind) statusKinds.add(statusKind);
                const errors = Array.isArray(status?.errors) ? status.errors : [];
                deliveryErrorsCount += errors.length;
            });

            if (field === 'message_template_status_update') templateStatusUpdatesCount += 1;
            else if (field === 'message_template_quality_update') templateQualityUpdatesCount += 1;
            else if (field === 'template_category_update') templateCategoryUpdatesCount += 1;
        });
    });

    return {
        object: String(payload?.object || '').trim() || null,
        entriesCount: entries.length,
        changesCount,
        messagesCount,
        statusesCount,
        statusKinds: Array.from(statusKinds),
        deliveryErrorsCount,
        templateStatusUpdatesCount,
        templateQualityUpdatesCount,
        templateCategoryUpdatesCount
    };
}

function extractTemplateWebhookEvents(payload = {}) {
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    const eventTypeByField = {
        message_template_status_update: 'status_update',
        message_template_quality_update: 'quality_update',
        template_category_update: 'category_update'
    };
    const out = [];

    entries.forEach((entry) => {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        changes.forEach((change) => {
            const field = String(change?.field || '').trim().toLowerCase();
            const eventType = eventTypeByField[field] || null;
            if (!eventType) return;

            const value = change?.value && typeof change.value === 'object' ? change.value : {};
            const payloadForField = value?.[field] && typeof value[field] === 'object' ? value[field] : value;
            const reasonRaw = payloadForField?.reason || payloadForField?.rejection_reason || payloadForField?.disable_info || payloadForField?.event;
            const reason = typeof reasonRaw === 'string'
                ? String(reasonRaw).trim()
                : (reasonRaw && typeof reasonRaw === 'object'
                    ? String(reasonRaw?.description || reasonRaw?.reason || '').trim()
                    : '');

            out.push({
                field,
                eventType,
                wabaId: String(entry?.id || value?.metadata?.waba_id || payloadForField?.waba_id || '').trim() || null,
                phoneNumberId: String(value?.metadata?.phone_number_id || value?.phone_number_id || '').trim() || null,
                templateName: String(payloadForField?.message_template_name || payloadForField?.template_name || payloadForField?.name || '').trim() || null,
                templateId: String(payloadForField?.message_template_id || payloadForField?.template_id || payloadForField?.id || '').trim() || null,
                previousStatus: String(payloadForField?.previous_status || payloadForField?.old_status || payloadForField?.prior_status || '').trim() || null,
                newStatus: String(payloadForField?.event || payloadForField?.new_status || payloadForField?.status || '').trim() || null,
                reason: reason || null,
                raw: payloadForField
            });
        });
    });

    return out;
}

function applyWebhookRuntimeConfigFromPayload(payload = {}, registryItems = [], waClient = null) {
    const phoneNumberId = extractWebhookPhoneNumberId(payload);
    const registry = Array.isArray(registryItems) ? registryItems : [];
    let match = null;

    if (phoneNumberId) {
        match = registry.find((item) => String(item?.phoneNumberId || '').trim() === phoneNumberId) || null;
    }

    if (!match && registry.length === 1) {
        match = registry[0];
    }

    if (match && typeof waClient?.setCloudRuntimeConfig === 'function') {
        waClient.setCloudRuntimeConfig(match.cloudConfig || {});
    }

    return {
        phoneNumberId,
        matched: match
    };
}

function registerCloudWebhookHttpRoutes({
    app,
    logger,
    saasControlService,
    waModuleService,
    waClient,
    socketManager
} = {}) {
    if (!app) throw new Error('registerCloudWebhookHttpRoutes requiere app.');
    if (!saasControlService) throw new Error('registerCloudWebhookHttpRoutes requiere saasControlService.');
    if (!waModuleService) throw new Error('registerCloudWebhookHttpRoutes requiere waModuleService.');
    if (!waClient) throw new Error('registerCloudWebhookHttpRoutes requiere waClient.');

    const appLogger = logger && typeof logger.info === 'function' ? logger : console;

    const handleMetaWebhookVerification = async (req, res) => {
        const mode = String(req.query['hub.mode'] || '').trim();
        const token = String(req.query['hub.verify_token'] || '').trim();
        const challenge = String(req.query['hub.challenge'] || '').trim();

        if (mode === 'subscribe' && token) {
            const registry = await getWebhookCloudRegistry({ saasControlService, waModuleService });
            const match = registry.find((item) => String(item?.verifyToken || '').trim() === token);
            if (match) {
                return res.status(200).send(challenge);
            }
        }

        return res.sendStatus(403);
    };

    const handleMetaWebhookEvent = async (req, res) => {
        try {
            const payload = req.body || {};
            const registry = await getWebhookCloudRegistry({ saasControlService, waModuleService });
            const signatureCheck = validateMetaWebhookSignature(req, registry);
            if (!signatureCheck.ok) {
                appLogger.warn('[WA][Cloud] webhook signature rejected (' + String(signatureCheck.reason || 'invalid') + ').');
                return res.sendStatus(401);
            }

            const runtimeApplied = applyWebhookRuntimeConfigFromPayload(payload, registry, waClient);
            if (runtimeApplied?.matched && typeof socketManager?.setActiveRuntimeContext === 'function') {
                const matched = runtimeApplied.matched || {};
                socketManager.setActiveRuntimeContext({
                    tenantId: String(matched?.tenantId || 'default').trim() || 'default',
                    moduleId: String(matched?.moduleId || 'default').trim().toLowerCase() || 'default',
                    moduleName: String(matched?.moduleName || '').trim() || null,
                    modulePhone: String(matched?.modulePhone || matched?.cloudConfig?.displayPhoneNumber || '').trim() || null,
                    channelType: String(matched?.channelType || 'whatsapp').trim().toLowerCase() || 'whatsapp',
                    transportMode: 'cloud'
                });
            }

            const templateEvents = extractTemplateWebhookEvents(payload);
            const summary = summarizeMetaWebhookPayload(payload);
            const handled = typeof waClient.handleWebhookPayload === 'function'
                ? await waClient.handleWebhookPayload(payload)
                : false;

            if (CLOUD_WEBHOOK_DEBUG) {
                appLogger.info('[WA][Cloud] webhook received object=' + String(summary.object || 'n/a')
                    + ' entries=' + String(summary.entriesCount)
                    + ' changes=' + String(summary.changesCount)
                    + ' messages=' + String(summary.messagesCount)
                    + ' statuses=' + String(summary.statusesCount)
                    + ' statusKinds=' + String((summary.statusKinds || []).join('|') || 'n/a')
                    + ' statusErrors=' + String(summary.deliveryErrorsCount)
                    + ' tmplStatus=' + String(summary.templateStatusUpdatesCount)
                    + ' tmplQuality=' + String(summary.templateQualityUpdatesCount)
                    + ' tmplCategory=' + String(summary.templateCategoryUpdatesCount)
                    + ' tmplEvents=' + String(templateEvents.length)
                    + ' handled=' + String(Boolean(handled))
                    + ' tenant=' + String(runtimeApplied?.matched?.tenantId || 'n/a')
                    + ' module=' + String(runtimeApplied?.matched?.moduleId || 'n/a')
                    + ' phone=' + String(runtimeApplied?.phoneNumberId || 'n/a'));
            }

            if (!handled && (summary.messagesCount > 0 || summary.statusesCount > 0)) {
                const runtime = typeof waClient.getRuntimeInfo === 'function' ? waClient.getRuntimeInfo() : {};
                appLogger.warn('[WA][Cloud] webhook payload not processed by active transport. active=' + String(runtime?.activeTransport || 'unknown') + ', requested=' + String(runtime?.requestedTransport || 'unknown'));
            }

            return res.sendStatus(200);
        } catch (error) {
            appLogger.error('[WA][Cloud] webhook processing failed: ' + String(error?.message || error));
            return res.sendStatus(500);
        }
    };

    app.get('/webhook', handleMetaWebhookVerification);
    app.get('/webhook/whatsapp', handleMetaWebhookVerification);
    app.post('/webhook', handleMetaWebhookEvent);
    app.post('/webhook/whatsapp', handleMetaWebhookEvent);
}

module.exports = {
    invalidateWebhookCloudRegistryCache,
    registerCloudWebhookHttpRoutes
};

