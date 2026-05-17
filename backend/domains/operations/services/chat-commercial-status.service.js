const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
const customerModuleContextsService = require('./customer-module-contexts.service');
const customerLifecycleService = require('./customer-lifecycle.service');
const metaTemplatesService = require('./meta-templates.service');
const templateVariablesService = require('./template-variables.service');
const tenantAutomationService = require('../../tenant/services/tenant-automation.service');
const quickRepliesManagerService = require('../../tenant/services/quick-replies-manager.service');
const waClient = require('../../channels/services/wa-provider.service');
const { resolveAndValidatePublicHost } = require('../../security/helpers/security-utils');
const { createLazySharpLoader } = require('../../channels/helpers/socket-runtime-bootstrap.helpers');
const { createMessageMediaAssetsHelpers } = require('../../channels/helpers/message-media-assets.helpers');
const {
    buildTemplateSendComponents,
    buildTemplatePreviewText,
    buildTemplateRealtimeComponents
} = require('../../channels/helpers/template-render.helpers');

const STORE_FILE = 'chat_commercial_status.json';
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 500;
const VALID_STATUSES = new Set([
    'nuevo',
    'en_conversacion',
    'cotizado',
    'aceptado',
    'programado',
    'atendido',
    'expirado',
    'vendido',
    'perdido'
]);
const INBOUND_FIRST_CONTACT_PROTECTED_STATUSES = new Set([
    'cotizado',
    'aceptado',
    'programado',
    'atendido',
    'vendido'
]);
const MANUAL_STATUS_KEYS = new Set([
    'aceptado',
    'programado',
    'atendido',
    'vendido',
    'perdido',
    'expirado'
]);
const VALID_SOURCES = new Set(['system', 'manual', 'automation', 'campaign', 'socket', 'webhook', 'http']);
const AUTOMATION_EVENT_BY_STATUS = Object.freeze({
    aceptado: 'quote_accepted',
    programado: 'order_programmed',
    atendido: 'order_attended',
    expirado: 'order_expired',
    perdido: 'order_lost',
    vendido: 'order_sold'
});
const QUICK_REPLY_MEDIA_MAX_BYTES = Math.max(
    256 * 1024,
    Number(process.env.QUICK_REPLY_MEDIA_MAX_BYTES || process.env.ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || (50 * 1024 * 1024))
);
const QUICK_REPLY_MEDIA_TIMEOUT_MS = Math.max(
    2000,
    Number(process.env.QUICK_REPLY_MEDIA_TIMEOUT_MS || 15000)
);
const DEFAULT_SAAS_UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');
const SAAS_UPLOADS_ROOT = path.resolve(String(process.env.SAAS_UPLOADS_DIR || DEFAULT_SAAS_UPLOADS_ROOT).trim() || DEFAULT_SAAS_UPLOADS_ROOT);
const processedMediaCache = new Map();
const { fetchQuickReplyMedia } = createMessageMediaAssetsHelpers({
    fs,
    path,
    URL,
    Buffer,
    resolveAndValidatePublicHost,
    getSharpImageProcessor: createLazySharpLoader(),
    SAAS_UPLOADS_ROOT,
    QUICK_REPLY_MEDIA_MAX_BYTES,
    QUICK_REPLY_MEDIA_TIMEOUT_MS,
    processedMediaCache
});

let schemaReady = false;
let schemaPromise = null;

function extractPhoneCandidatesFromChatId(chatId = '') {
    const clean = toText(chatId);
    const base = clean.split('@')[0].trim();
    const digits = base.replace(/[^\d]/g, '');
    const out = [];
    if (digits) {
        out.push(`+${digits}`);
        out.push(digits);
    }
    return out;
}

async function resolveCustomerIdFromChat(tenantId = DEFAULT_TENANT_ID, { chatId = '', scopeModuleId = '' } = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const cleanChatId = normalizeChatId(chatId);
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');
    if (!cleanChatId) return null;

    if (getStorageDriver() === 'postgres') {
        try {
            const params = [cleanTenantId, cleanChatId];
            let scopeSql = '';
            if (cleanScopeModuleId) {
                params.push(cleanScopeModuleId);
                scopeSql = ` AND LOWER(COALESCE(module_id, '')) = LOWER($${params.length})`;
            }
            const eventResult = await queryPostgres(
                `SELECT customer_id
                   FROM tenant_channel_events
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND COALESCE(customer_id, '') <> ''${scopeSql}
                  ORDER BY created_at DESC
                  LIMIT 1`,
                params
            );
            const eventCustomerId = toText(eventResult?.rows?.[0]?.customer_id || '');
            if (eventCustomerId) return eventCustomerId;

            const phoneCandidates = extractPhoneCandidatesFromChatId(cleanChatId);
            for (const phone of phoneCandidates) {
                const customerParams = [cleanTenantId, phone];
                let moduleSql = '';
                if (cleanScopeModuleId) {
                    customerParams.push(cleanScopeModuleId);
                    moduleSql = ` AND LOWER(COALESCE(module_id, '')) = LOWER($${customerParams.length})`;
                }
                const customerResult = await queryPostgres(
                    `SELECT customer_id
                       FROM tenant_customers
                      WHERE tenant_id = $1
                        AND phone_e164 = $2${moduleSql}
                      ORDER BY updated_at DESC
                      LIMIT 1`,
                    customerParams
                );
                const customerId = toText(customerResult?.rows?.[0]?.customer_id || '');
                if (customerId) return customerId;
            }
        } catch (_) {
            return null;
        }
        return null;
    }

    try {
        const customersStore = await readTenantJsonFile('customers.json', {
            tenantId: cleanTenantId,
            defaultValue: { items: [] }
        });
        const items = Array.isArray(customersStore?.items) ? customersStore.items : [];
        const phoneCandidates = extractPhoneCandidatesFromChatId(cleanChatId);
        const matched = items.find((entry) => {
            const customerPhone = toText(entry?.phoneE164 || entry?.phone_e164 || '');
            const customerModuleId = toText(entry?.moduleId || entry?.module_id || '').toLowerCase();
            const moduleMatch = !cleanScopeModuleId || customerModuleId === cleanScopeModuleId;
            return moduleMatch && phoneCandidates.some((phone) => customerPhone === phone);
        });
        return toText(matched?.customerId || matched?.customer_id || '') || null;
    } catch (_) {
        return null;
    }
}

function nowIso() {
    return new Date().toISOString();
}

function resolveTenantId(input = null) {
    if (typeof input === 'string') return normalizeTenantId(input || DEFAULT_TENANT_ID);
    if (input && typeof input === 'object') return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    return DEFAULT_TENANT_ID;
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function normalizeChatId(value = '') {
    return toText(value);
}

function normalizeScopeModuleId(value = '') {
    return toLower(value);
}

function normalizeIso(value = '') {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    }
    const text = toText(value);
    if (!text) return null;
    const parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed.toISOString();
}

function normalizeStatus(value = '') {
    const status = toLower(value);
    if (VALID_STATUSES.has(status)) return status;
    return 'nuevo';
}

function normalizeSource(value = '') {
    const source = toLower(value);
    if (!source) return 'system';
    if (VALID_SOURCES.has(source)) return source;
    return 'system';
}

function normalizeMetadata(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function formatAssistantDisplayName(value = '') {
    const clean = toText(value);
    if (clean.toLowerCase() === 'operador') return 'Asistente Virtual';
    if (!clean) return 'Asistente Virtual';
    return /\bIA$/i.test(clean) ? clean : `${clean} IA`;
}

async function getAssistantName(tenantId = DEFAULT_TENANT_ID, moduleId = '') {
    const cleanTenantId = resolveTenantId(tenantId);
    const cleanModuleId = toText(moduleId);
    if (!cleanTenantId || !cleanModuleId || getStorageDriver() !== 'postgres') return 'Asistente Virtual';
    try {
        const { rows } = await queryPostgres(
            `SELECT metadata
               FROM wa_modules
              WHERE tenant_id = $1
                AND LOWER(module_id) = LOWER($2)
              LIMIT 1`,
            [cleanTenantId, cleanModuleId]
        );
        const metadata = rows?.[0]?.metadata && typeof rows[0].metadata === 'object'
            ? rows[0].metadata
            : {};
        const assistantName = toText(metadata?.aiConfig?.assistantName);
        return formatAssistantDisplayName(assistantName);
    } catch (_) {
        return 'Asistente Virtual';
    }
}

function normalizeLimit(value = DEFAULT_LIMIT) {
    const parsed = Number(value || DEFAULT_LIMIT);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function normalizeOffset(value = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

function statusKey(chatId = '', scopeModuleId = '') {
    return `${normalizeChatId(chatId)}::${normalizeScopeModuleId(scopeModuleId)}`;
}

function triggerLifecycleAfterAttended(cleanTenantId, next = {}, previous = null) {
    if (String(next?.status || '').trim().toLowerCase() !== 'atendido') return;
    if (String(previous?.status || '').trim().toLowerCase() === 'atendido') return;

    Promise.resolve()
        .then(async () => {
            const customerId = await resolveCustomerIdFromChat(cleanTenantId, {
                chatId: next.chatId,
                scopeModuleId: next.scopeModuleId
            });
            if (!customerId) return;
            await customerLifecycleService.syncAfterAttendedOrder(cleanTenantId, customerId);
        })
        .catch((error) => console.warn('[customer-lifecycle] sync after attended skipped:', error?.message || error));
}

async function getLastInboundCustomerInteractionAt(cleanTenantId, chatId = '') {
    if (getStorageDriver() !== 'postgres') return null;
    const cleanChatId = normalizeChatId(chatId);
    if (!cleanTenantId || !cleanChatId) return null;
    try {
        const { rows } = await queryPostgres(
            `SELECT timestamp_unix, created_at
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND from_me = FALSE
              ORDER BY timestamp_unix DESC NULLS LAST, created_at DESC
              LIMIT 1`,
            [cleanTenantId, cleanChatId]
        );
        const row = rows?.[0] || null;
        if (!row) return null;
        const unix = Number(row.timestamp_unix || 0);
        if (Number.isFinite(unix) && unix > 0) return new Date(unix * 1000);
        const created = row.created_at ? new Date(row.created_at) : null;
        return created && !Number.isNaN(created.getTime()) ? created : null;
    } catch (error) {
        console.warn('[automation-rules] last inbound lookup skipped:', error?.message || error);
        return null;
    }
}

async function isWithinCustomerServiceWindow(cleanTenantId, chatId = '') {
    const lastInboundAt = await getLastInboundCustomerInteractionAt(cleanTenantId, chatId);
    if (!lastInboundAt) return false;
    return Date.now() - lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
}

async function resolveAutomationQuickReply(cleanTenantId, rule = {}, moduleId = '') {
    const code = toText(rule?.quickReplyCode || rule?.quick_reply_code);
    if (!code) return null;
    try {
        const items = await quickRepliesManagerService.listQuickReplies({
            tenantId: cleanTenantId,
            moduleId: moduleId || rule?.moduleId || rule?.module_id || ''
        });
        const normalizedCode = code.toLowerCase();
        return (Array.isArray(items) ? items : []).find((item) => {
            const id = toText(item?.id || item?.itemId).toLowerCase();
            const label = toText(item?.label).toLowerCase();
            return id === normalizedCode || label === normalizedCode;
        }) || null;
    } catch (error) {
        console.warn('[automation-rules] quick reply lookup skipped:', error?.message || error);
        return null;
    }
}

function normalizeQuickReplyAssetEntry(entry = {}) {
    return {
        url: toText(entry?.url || entry?.mediaUrl),
        mimeType: toText(entry?.mimeType || entry?.mediaMimeType).toLowerCase(),
        fileName: toText(entry?.fileName || entry?.mediaFileName || entry?.filename),
        sizeBytes: Number(entry?.sizeBytes ?? entry?.mediaSizeBytes) || null
    };
}

function normalizeQuickReplyButtons(buttons = []) {
    return (Array.isArray(buttons) ? buttons : [])
        .map((entry, index) => {
            const button = entry && typeof entry === 'object' ? entry : {};
            const title = toText(button.title || button.label || button.text).slice(0, 20);
            if (!title) return null;
            const id = toText(button.id || button.buttonId || `btn_${index + 1}`) || `btn_${index + 1}`;
            return { id, title };
        })
        .filter(Boolean)
        .slice(0, 3);
}

function buildQuickReplyInteractive(bodyText, buttons = []) {
    return {
        type: 'button',
        body: { text: toText(bodyText) },
        action: {
            buttons: normalizeQuickReplyButtons(buttons).map((button) => ({
                type: 'reply',
                reply: {
                    id: button.id,
                    title: button.title
                }
            }))
        }
    };
}

async function resolveQuickReplyVariables(cleanTenantId, {
    bodyText = '',
    chatId = '',
    customerId = ''
} = {}) {
    const source = String(bodyText || '');
    if (!source || !/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(source)) return source;
    try {
        const previewPayload = await templateVariablesService.getPreview(cleanTenantId, {
            chatId,
            customerId
        });
        const variables = (Array.isArray(previewPayload?.categories) ? previewPayload.categories : [])
            .flatMap((category) => (Array.isArray(category?.variables) ? category.variables : []));
        const valueMap = new Map(variables.map((variable) => [
            toText(variable?.key).toLowerCase(),
            String(variable?.previewValue ?? '').trim()
        ]));
        return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, rawKey) => {
            const value = valueMap.get(toText(rawKey).toLowerCase());
            return value || '';
        });
    } catch (error) {
        console.warn('[automation-rules] quick reply variables skipped:', error?.message || error);
        return source;
    }
}

async function sendAutomationQuickReply(cleanTenantId, {
    rule = {},
    quickReply = null,
    chatId = '',
    customerId = '',
    eventKey = '',
    nextStatus = '',
    agentMeta = {}
} = {}) {
    const bodyTextRaw = toText(quickReply?.text || quickReply?.bodyText || quickReply?.body);
    const bodyText = await resolveQuickReplyVariables(cleanTenantId, {
        bodyText: bodyTextRaw,
        chatId,
        customerId
    });
    const quickReplyButtons = normalizeQuickReplyButtons(quickReply?.buttons || quickReply?.metadata?.buttons);
    const mediaAssets = (Array.isArray(quickReply?.mediaAssets) ? quickReply.mediaAssets : [])
        .map(normalizeQuickReplyAssetEntry)
        .filter((entry) => Boolean(entry.url));

    const legacyMediaUrl = toText(quickReply?.mediaUrl);
    const legacyMediaMimeType = toText(quickReply?.mediaMimeType).toLowerCase();
    const legacyMediaFileName = toText(quickReply?.mediaFileName || quickReply?.filename);
    if (legacyMediaUrl && !mediaAssets.some((entry) => entry.url === legacyMediaUrl)) {
        mediaAssets.push({
            url: legacyMediaUrl,
            mimeType: legacyMediaMimeType,
            fileName: legacyMediaFileName,
            sizeBytes: null
        });
    }

    if (quickReplyButtons.length > 0 && !bodyText) {
        console.warn('[automation-rules] quick reply buttons skipped: missing body text', rule.ruleId);
        return false;
    }
    if (!bodyText && mediaAssets.length === 0) return false;

    const metadata = {
        agentMeta,
        automationRuleId: rule.ruleId,
        automationEventKey: eventKey,
        commercialStatus: nextStatus,
        quickReplyCode: rule.quickReplyCode
    };

    if (mediaAssets.length > 0) {
        for (let index = 0; index < mediaAssets.length; index += 1) {
            const mediaEntry = mediaAssets[index] || {};
            if (!mediaEntry.url) continue;
            const fetchedMedia = await fetchQuickReplyMedia(mediaEntry.url, {
                tenantId: cleanTenantId,
                maxBytes: QUICK_REPLY_MEDIA_MAX_BYTES,
                timeoutMs: QUICK_REPLY_MEDIA_TIMEOUT_MS,
                mimeHint: mediaEntry.mimeType || legacyMediaMimeType,
                fileNameHint: mediaEntry.fileName || legacyMediaFileName
            });
            if (!fetchedMedia?.mediaData) {
                console.warn('[automation-rules] quick reply media skipped: could not fetch asset', mediaEntry.url);
                return false;
            }
            const fileNameBase = mediaEntry.fileName
                || legacyMediaFileName
                || path.basename(toText(fetchedMedia.filename))
                || `adjunto-${Date.now()}`;
            const captionText = quickReplyButtons.length > 0 ? '' : (index === 0 ? bodyText : '');
            await waClient.sendMedia(
                chatId,
                fetchedMedia.mediaData,
                fetchedMedia.mimetype || mediaEntry.mimeType || legacyMediaMimeType || 'application/octet-stream',
                toText(fileNameBase) || `adjunto-${Date.now()}`,
                captionText,
                false,
                null
            );
        }
    }

    if (quickReplyButtons.length > 0) {
        if (typeof waClient?.sendInteractiveMessage !== 'function') {
            console.warn('[automation-rules] quick reply buttons skipped: interactive unsupported', rule.ruleId);
            return mediaAssets.length > 0;
        }
        await waClient.sendInteractiveMessage(chatId, buildQuickReplyInteractive(bodyText, quickReplyButtons), {
            metadata
        });
        return true;
    }

    if (mediaAssets.length === 0 && bodyText) {
        await waClient.sendMessage(chatId, bodyText, { metadata });
    }
    return true;
}

function triggerAutomationAfterCommercialTransition(cleanTenantId, next = {}, previous = null) {
    const nextStatus = String(next?.status || '').trim().toLowerCase();
    const previousStatus = String(previous?.status || '').trim().toLowerCase();
    const eventKey = AUTOMATION_EVENT_BY_STATUS[nextStatus];
    if (!eventKey || previousStatus === nextStatus) return;

    Promise.resolve()
        .then(async () => {
            const rules = await tenantAutomationService.listActiveRulesForEvent(cleanTenantId, eventKey, {
                moduleId: next.scopeModuleId || ''
            });
            if (!Array.isArray(rules) || rules.length === 0) {
                console.info('[automation-rules] no active rule for event:', eventKey);
                return;
            }

            const customerId = await resolveCustomerIdFromChat(cleanTenantId, {
                chatId: next.chatId,
                scopeModuleId: next.scopeModuleId
            });

            for (const rule of rules) {
                const send = async () => {
                    try {
                        const automationModuleId = next.scopeModuleId || rule.moduleId || '';
                        const assistantName = await getAssistantName(cleanTenantId, automationModuleId);
                        console.log('[automation] moduleId:', automationModuleId, 'name:', assistantName);
                        const automationAgentMeta = {
                            sentByUserId: 'automation',
                            sentByName: assistantName,
                            sentByRole: 'assistant',
                            sentViaModuleId: automationModuleId
                        };
                        const within24h = rule.quickReplyCode
                            ? await isWithinCustomerServiceWindow(cleanTenantId, next.chatId)
                            : false;
                        if (within24h && rule.quickReplyCode) {
                            const quickReply = await resolveAutomationQuickReply(cleanTenantId, rule, next.scopeModuleId || '');
                            if (quickReply) {
                                const quickReplySent = await sendAutomationQuickReply(cleanTenantId, {
                                    rule,
                                    quickReply,
                                    chatId: next.chatId,
                                    customerId: customerId || '',
                                    eventKey,
                                    nextStatus,
                                    agentMeta: automationAgentMeta
                                });
                                if (quickReplySent) {
                                    console.info('[automation-rules] quick reply sent:', eventKey, rule.quickReplyCode);
                                    return;
                                }
                            }
                            if (!rule.templateName) {
                                if (!quickReply) {
                                    console.info('[automation-rules] quick reply not found:', eventKey, rule.quickReplyCode);
                                } else {
                                    console.info('[automation-rules] quick reply has no sendable content:', eventKey, rule.quickReplyCode);
                                }
                                return;
                            }
                        }
                        if (!rule.templateName) {
                            console.info('[automation-rules] no template fallback configured:', eventKey, rule.ruleId);
                            return;
                        }
                        const templateLanguage = rule.templateLanguage || 'es';
                        const template = await metaTemplatesService.getTemplateRecord(cleanTenantId, {
                            templateName: rule.templateName,
                            moduleId: rule.moduleId || next.scopeModuleId || '',
                            templateLanguage
                        });
                        const previewPayload = await templateVariablesService.getPreview(cleanTenantId, {
                            chatId: next.chatId,
                            customerId: customerId || ''
                        });
                        const components = Array.isArray(template?.componentsJson) && template.componentsJson.length > 0
                            ? buildTemplateSendComponents(template, previewPayload)
                            : [];
                        const templateComponents = Array.isArray(template?.componentsJson) && template.componentsJson.length > 0
                            ? buildTemplateRealtimeComponents(template, previewPayload)
                            : [];
                        const previewText = Array.isArray(template?.componentsJson) && template.componentsJson.length > 0
                            ? buildTemplatePreviewText(template, previewPayload, rule.templateName)
                            : `Template: ${rule.templateName}`;
                        await waClient.sendTemplateMessage(next.chatId, {
                            templateName: rule.templateName,
                            languageCode: templateLanguage,
                            components,
                            metadata: {
                                previewText,
                                templateName: rule.templateName,
                                templateLanguage,
                                templateComponents,
                                agentMeta: automationAgentMeta,
                                automationRuleId: rule.ruleId,
                                automationEventKey: eventKey,
                                commercialStatus: nextStatus
                            }
                        });
                        console.info('[automation-rules] template sent:', eventKey, rule.templateName);
                    } catch (error) {
                        console.warn('[automation-rules] template send skipped:', error?.message || error);
                    }
                };

                const delaySeconds = Number.isFinite(Number(rule.delaySeconds))
                    ? Number(rule.delaySeconds)
                    : Math.max(0, Number(rule.delayMinutes || 0)) * 60;
                const delayMs = Math.max(0, delaySeconds) * 1000;
                if (delayMs > 0) {
                    const timer = setTimeout(send, delayMs);
                    if (typeof timer.unref === 'function') timer.unref();
                } else {
                    await send();
                }
            }
        })
        .catch((error) => console.warn('[automation-rules] trigger skipped:', error?.message || error));
}

function normalizeRecord(item = {}, { fallbackChatId = '', fallbackScopeModuleId = '' } = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const createdAt = normalizeIso(source.createdAt || source.created_at) || nowIso();
    const updatedAt = normalizeIso(source.updatedAt || source.updated_at) || createdAt;
    const status = normalizeStatus(source.status || 'nuevo');
    const lastTransitionAt = normalizeIso(source.lastTransitionAt || source.last_transition_at) || updatedAt;

    return {
        chatId: normalizeChatId(source.chatId || source.chat_id || fallbackChatId),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id || fallbackScopeModuleId),
        status,
        source: normalizeSource(source.source || 'system'),
        reason: toText(source.reason || '') || null,
        changedByUserId: toText(source.changedByUserId || source.changed_by_user_id || '') || null,
        firstCustomerMessageAt: normalizeIso(source.firstCustomerMessageAt || source.first_customer_message_at) || null,
        firstAgentResponseAt: normalizeIso(source.firstAgentResponseAt || source.first_agent_response_at) || null,
        quotedAt: normalizeIso(source.quotedAt || source.quoted_at) || null,
        soldAt: normalizeIso(source.soldAt || source.sold_at) || null,
        lostAt: normalizeIso(source.lostAt || source.lost_at) || null,
        lastTransitionAt,
        pattyMode: toLower(source.pattyMode || source.patty_mode || '') || null,
        pattyModeUntil: normalizeIso(source.pattyModeUntil || source.patty_mode_until) || null,
        pattyTakenBy: toText(source.pattyTakenBy || source.patty_taken_by || '') || null,
        metadata: normalizeMetadata(source.metadata),
        createdAt,
        updatedAt
    };
}

function normalizeStore(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const items = Array.isArray(source.items)
        ? source.items
            .map((entry) => normalizeRecord(entry))
            .filter((entry) => entry.chatId)
        : [];
    return { items };
}

function toDbRecord(record = {}) {
    return {
        chat_id: record.chatId,
        scope_module_id: record.scopeModuleId,
        status: record.status,
        source: record.source,
        reason: record.reason,
        changed_by_user_id: record.changedByUserId,
        first_customer_message_at: record.firstCustomerMessageAt,
        first_agent_response_at: record.firstAgentResponseAt,
        quoted_at: record.quotedAt,
        sold_at: record.soldAt,
        lost_at: record.lostAt,
        last_transition_at: record.lastTransitionAt,
        patty_mode: record.pattyMode,
        patty_mode_until: record.pattyModeUntil,
        patty_taken_by: record.pattyTakenBy,
        metadata: record.metadata,
        created_at: record.createdAt,
        updated_at: record.updatedAt
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_chat_commercial_status (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                chat_id TEXT NOT NULL,
                scope_module_id TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'nuevo'
                    CHECK (status IN ('nuevo', 'en_conversacion', 'cotizado', 'aceptado', 'programado', 'atendido', 'expirado', 'vendido', 'perdido')),
                source TEXT NOT NULL DEFAULT 'system'
                    CHECK (source IN ('system', 'manual', 'automation', 'campaign', 'socket', 'webhook', 'http')),
                reason TEXT NULL,
                changed_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
                first_customer_message_at TIMESTAMPTZ NULL,
                first_agent_response_at TIMESTAMPTZ NULL,
                quoted_at TIMESTAMPTZ NULL,
                sold_at TIMESTAMPTZ NULL,
                lost_at TIMESTAMPTZ NULL,
                last_transition_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                patty_mode TEXT NULL,
                patty_mode_until TIMESTAMPTZ NULL,
                patty_taken_by TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, chat_id, scope_module_id)
            )
        `);
        await queryPostgres(`
            ALTER TABLE tenant_chat_commercial_status
              ADD COLUMN IF NOT EXISTS patty_mode TEXT DEFAULT NULL,
              ADD COLUMN IF NOT EXISTS patty_mode_until TIMESTAMPTZ DEFAULT NULL,
              ADD COLUMN IF NOT EXISTS patty_taken_by TEXT DEFAULT NULL;
            ALTER TABLE tenant_chat_commercial_status
              DROP CONSTRAINT IF EXISTS tenant_chat_commercial_status_patty_mode_check;
            ALTER TABLE tenant_chat_commercial_status
              ADD CONSTRAINT tenant_chat_commercial_status_patty_mode_check
              CHECK (patty_mode IS NULL OR patty_mode IN ('autonomous', 'review', 'off'));
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_chat_commercial_status_tenant_status
            ON tenant_chat_commercial_status(tenant_id, scope_module_id, status, updated_at DESC)
        `);
        schemaReady = true;
    })();

    try {
        await schemaPromise;
    } catch (error) {
        schemaPromise = null;
        throw error;
    }
}

async function getChatCommercialStatus(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(options.chatId || options);
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    if (!chatId) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = statusKey(chatId, scopeModuleId);
        const match = store.items.find((entry) => statusKey(entry.chatId, entry.scopeModuleId) === key);
        return match ? { ...match } : null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT chat_id, scope_module_id, status, source, reason, changed_by_user_id,
                    first_customer_message_at, first_agent_response_at, quoted_at, sold_at, lost_at,
                    last_transition_at, patty_mode, patty_mode_until, patty_taken_by,
                    metadata, created_at, updated_at
               FROM tenant_chat_commercial_status
              WHERE tenant_id = $1
                AND chat_id = $2
                AND scope_module_id = $3
              LIMIT 1`,
            [cleanTenantId, chatId, scopeModuleId]
        );
        const row = Array.isArray(result?.rows) && result.rows[0] ? result.rows[0] : null;
        if (!row) return null;
        return normalizeRecord(row);
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function listCommercialStatuses(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    const status = toLower(options.status || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.items
            .filter((entry) => !scopeModuleId || entry.scopeModuleId === scopeModuleId)
            .filter((entry) => !status || entry.status === status)
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        const items = filtered.slice(offset, offset + limit).map((entry) => ({ ...entry }));
        return { items, total: filtered.length, limit, offset };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];

        if (scopeModuleId) {
            params.push(scopeModuleId);
            where.push(`scope_module_id = $${params.length}`);
        }
        if (status) {
            params.push(status);
            where.push(`status = $${params.length}`);
        }

        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(
            `SELECT COUNT(*)::BIGINT AS total
               FROM tenant_chat_commercial_status
              WHERE ${whereSql}`,
            params
        );

        const rowParams = [...params, limit, offset];
        const rowsResult = await queryPostgres(
            `SELECT chat_id, scope_module_id, status, source, reason, changed_by_user_id,
                    first_customer_message_at, first_agent_response_at, quoted_at, sold_at, lost_at,
                    last_transition_at, patty_mode, patty_mode_until, patty_taken_by,
                    metadata, created_at, updated_at
               FROM tenant_chat_commercial_status
              WHERE ${whereSql}
              ORDER BY updated_at DESC
              LIMIT $${rowParams.length - 1}
              OFFSET $${rowParams.length}`,
            rowParams
        );

        const items = (Array.isArray(rowsResult?.rows) ? rowsResult.rows : []).map((row) => normalizeRecord(row));
        const total = Number(totalResult?.rows?.[0]?.total || 0);
        return { items, total, limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

function normalizePattyMode(value = '') {
    const mode = toLower(value);
    return ['autonomous', 'review', 'off'].includes(mode) ? mode : null;
}

function buildPattyModeUntil(mode = '') {
    if (mode !== 'review') return null;
    return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

async function setChatPattyMode(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(payload.chatId || payload.chat_id);
    const scopeModuleId = normalizeScopeModuleId(payload.scopeModuleId || payload.scope_module_id || '');
    const mode = normalizePattyMode(payload.mode);
    if (!chatId) throw new Error('chatId requerido para modo Patty.');
    if (!mode) throw new Error('Modo Patty invalido.');
    const pattyModeUntil = payload.pattyModeUntil !== undefined
        ? normalizeIso(payload.pattyModeUntil)
        : buildPattyModeUntil(mode);
    const pattyTakenBy = payload.pattyTakenBy !== undefined
        ? toText(payload.pattyTakenBy || '') || null
        : null;

    const current = await getChatCommercialStatus(cleanTenantId, { chatId, scopeModuleId });
    const base = current || normalizeRecord({
        chatId,
        scopeModuleId,
        status: 'nuevo',
        source: 'system'
    });
    return upsertChatCommercialStatus(cleanTenantId, {
        ...base,
        chatId,
        scopeModuleId,
        pattyMode: mode,
        pattyModeUntil,
        pattyTakenBy: mode === 'review' ? pattyTakenBy : null,
        metadata: {
            ...(base.metadata || {}),
            pattyModeUpdatedAt: nowIso(),
            pattyModeReason: toText(payload.reason || '') || null
        }
    });
}

async function resetChatPattyMode(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(payload.chatId || payload.chat_id);
    const scopeModuleId = normalizeScopeModuleId(payload.scopeModuleId || payload.scope_module_id || '');
    if (!chatId) throw new Error('chatId requerido para reset Patty.');
    const current = await getChatCommercialStatus(cleanTenantId, { chatId, scopeModuleId });
    if (!current) return { status: null, previous: null, changed: false };
    return upsertChatCommercialStatus(cleanTenantId, {
        ...current,
        chatId,
        scopeModuleId,
        pattyMode: null,
        pattyModeUntil: null,
        pattyTakenBy: null,
        metadata: {
            ...(current.metadata || {}),
            pattyModeResetAt: nowIso(),
            pattyModeResetReason: toText(payload.reason || '') || null
        }
    });
}

async function extendPattyReviewWindow(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(payload.chatId || payload.chat_id);
    const scopeModuleId = normalizeScopeModuleId(payload.scopeModuleId || payload.scope_module_id || '');
    if (!chatId) return null;
    const current = await getChatCommercialStatus(cleanTenantId, { chatId, scopeModuleId });
    if (!current || current.pattyMode !== 'review') return current;
    const until = buildPattyModeUntil('review');
    await upsertChatCommercialStatus(cleanTenantId, {
        ...current,
        chatId,
        scopeModuleId,
        pattyMode: 'review',
        pattyModeUntil: until,
        pattyTakenBy: current.pattyTakenBy || payload.pattyTakenBy || null,
        metadata: {
            ...(current.metadata || {}),
            pattyModeExtendedAt: nowIso(),
            pattyModeExtendReason: toText(payload.reason || '') || null
        }
    });
    return getChatCommercialStatus(cleanTenantId, { chatId, scopeModuleId });
}

async function resumeExpiredPattyReviewModes(tenantId = DEFAULT_TENANT_ID, { limit = 100 } = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    if (getStorageDriver() !== 'postgres') return { items: [], count: 0 };
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `WITH candidates AS (
            SELECT ctid
              FROM tenant_chat_commercial_status
             WHERE tenant_id = $1
               AND patty_mode = 'review'
               AND patty_mode_until IS NOT NULL
               AND patty_mode_until < NOW()
               AND patty_taken_by IS NOT NULL
             ORDER BY patty_mode_until ASC
             LIMIT $2
        )
        UPDATE tenant_chat_commercial_status
            SET patty_mode = NULL,
                patty_mode_until = NULL,
                patty_taken_by = NULL,
                metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
                updated_at = NOW()
          WHERE ctid IN (SELECT ctid FROM candidates)
          RETURNING chat_id, scope_module_id`,
        [
            cleanTenantId,
            Math.max(1, Number(limit || 100)),
            JSON.stringify({ pattyResumedAt: nowIso(), pattyResumeReason: 'advisor_inactive' })
        ]
    );
    const items = (Array.isArray(rows) ? rows : []).map((row) => ({
        chatId: normalizeChatId(row.chat_id),
        scopeModuleId: normalizeScopeModuleId(row.scope_module_id || '')
    }));
    return { items, count: items.length };
}

async function upsertChatCommercialStatus(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const source = payload && typeof payload === 'object' ? payload : {};
    const chatId = normalizeChatId(source.chatId || source.chat_id);
    const scopeModuleId = normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id || '');
    if (!chatId) throw new Error('chatId requerido para estado comercial.');

    const previous = await getChatCommercialStatus(cleanTenantId, { chatId, scopeModuleId });
    const now = nowIso();
    const next = normalizeRecord({
        chatId,
        scopeModuleId,
        status: source.status || previous?.status || 'nuevo',
        source: source.source || previous?.source || 'system',
        reason: source.reason !== undefined ? source.reason : (previous?.reason || null),
        changedByUserId: source.changedByUserId !== undefined ? source.changedByUserId : (previous?.changedByUserId || null),
        firstCustomerMessageAt: source.firstCustomerMessageAt !== undefined ? source.firstCustomerMessageAt : (previous?.firstCustomerMessageAt || null),
        firstAgentResponseAt: source.firstAgentResponseAt !== undefined ? source.firstAgentResponseAt : (previous?.firstAgentResponseAt || null),
        quotedAt: source.quotedAt !== undefined ? source.quotedAt : (previous?.quotedAt || null),
        soldAt: source.soldAt !== undefined ? source.soldAt : (previous?.soldAt || null),
        lostAt: source.lostAt !== undefined ? source.lostAt : (previous?.lostAt || null),
        lastTransitionAt: source.lastTransitionAt !== undefined ? source.lastTransitionAt : (previous?.lastTransitionAt || now),
        pattyMode: source.pattyMode !== undefined ? source.pattyMode : (previous?.pattyMode || null),
        pattyModeUntil: source.pattyModeUntil !== undefined ? source.pattyModeUntil : (previous?.pattyModeUntil || null),
        pattyTakenBy: source.pattyTakenBy !== undefined ? source.pattyTakenBy : (previous?.pattyTakenBy || null),
        metadata: {
            ...(previous?.metadata || {}),
            ...normalizeMetadata(source.metadata)
        },
        createdAt: previous?.createdAt || now,
        updatedAt: now
    });

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = statusKey(chatId, scopeModuleId);
        const index = store.items.findIndex((entry) => statusKey(entry.chatId, entry.scopeModuleId) === key);
        const nextItems = [...store.items];
        if (index >= 0) nextItems[index] = next;
        else nextItems.push(next);
        const normalizedItems = nextItems
            .map((entry) => normalizeRecord(entry))
            .filter((entry) => entry.chatId);
        await writeTenantJsonFile(STORE_FILE, { items: normalizedItems }, { tenantId: cleanTenantId });
        try {
            const moduleId = toText(next.scopeModuleId || '');
            if (moduleId) {
                const customerId = await resolveCustomerIdFromChat(cleanTenantId, {
                    chatId,
                    scopeModuleId: moduleId
                });
                if (customerId) {
                    await customerModuleContextsService.upsertContext(cleanTenantId, {
                        customerId,
                        moduleId,
                        commercialStatus: next.status || 'unknown',
                        lastInteractionAt: next.lastTransitionAt || next.updatedAt || now,
                        metadata: {
                            dualWriteSource: 'chat_commercial_status.upsert'
                        }
                    });
                }
            }
        } catch (_) {
            // silent: dual-write must not interrupt commercial status lifecycle
        }
        triggerLifecycleAfterAttended(cleanTenantId, next, previous);
        triggerAutomationAfterCommercialTransition(cleanTenantId, next, previous);
        return {
            status: next,
            previous,
            changed: !previous || JSON.stringify(previous) !== JSON.stringify(next)
        };
    }

    await ensurePostgresSchema();
    const row = toDbRecord(next);
    await queryPostgres(
        `INSERT INTO tenant_chat_commercial_status (
            tenant_id, chat_id, scope_module_id, status, source, reason, changed_by_user_id,
            first_customer_message_at, first_agent_response_at, quoted_at, sold_at, lost_at,
            last_transition_at, patty_mode, patty_mode_until, patty_taken_by, metadata, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17::jsonb, $18, $19
        )
        ON CONFLICT (tenant_id, chat_id, scope_module_id)
        DO UPDATE SET
            status = EXCLUDED.status,
            source = EXCLUDED.source,
            reason = EXCLUDED.reason,
            changed_by_user_id = EXCLUDED.changed_by_user_id,
            first_customer_message_at = EXCLUDED.first_customer_message_at,
            first_agent_response_at = EXCLUDED.first_agent_response_at,
            quoted_at = EXCLUDED.quoted_at,
            sold_at = EXCLUDED.sold_at,
            lost_at = EXCLUDED.lost_at,
            last_transition_at = EXCLUDED.last_transition_at,
            patty_mode = EXCLUDED.patty_mode,
            patty_mode_until = EXCLUDED.patty_mode_until,
            patty_taken_by = EXCLUDED.patty_taken_by,
            metadata = COALESCE(tenant_chat_commercial_status.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_at = EXCLUDED.updated_at`,
        [
            cleanTenantId,
            row.chat_id,
            row.scope_module_id,
            row.status,
            row.source,
            row.reason,
            row.changed_by_user_id,
            row.first_customer_message_at,
            row.first_agent_response_at,
            row.quoted_at,
            row.sold_at,
            row.lost_at,
            row.last_transition_at,
            row.patty_mode,
            row.patty_mode_until,
            row.patty_taken_by,
            JSON.stringify(row.metadata || {}),
            row.created_at,
            row.updated_at
        ]
    );

    try {
        const moduleId = toText(next.scopeModuleId || '');
        if (moduleId) {
            const customerId = await resolveCustomerIdFromChat(cleanTenantId, {
                chatId,
                scopeModuleId: moduleId
            });
            if (customerId) {
                await customerModuleContextsService.upsertContext(cleanTenantId, {
                    customerId,
                    moduleId,
                    commercialStatus: next.status || 'unknown',
                    lastInteractionAt: next.lastTransitionAt || next.updatedAt || now,
                    metadata: {
                        dualWriteSource: 'chat_commercial_status.upsert'
                    }
                });
            }
        }
    } catch (_) {
        // silent: dual-write must not interrupt commercial status lifecycle
    }

    triggerLifecycleAfterAttended(cleanTenantId, next, previous);
    triggerAutomationAfterCommercialTransition(cleanTenantId, next, previous);
    return {
        status: next,
        previous,
        changed: !previous || JSON.stringify(previous) !== JSON.stringify(next)
    };
}

async function markInboundCustomerFirstContact(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const at = normalizeIso(options.at) || nowIso();
    const current = await getChatCommercialStatus(tenantId, options);
    const currentStatus = toText(current?.status || '').toLowerCase();

    if (INBOUND_FIRST_CONTACT_PROTECTED_STATUSES.has(currentStatus)) {
        return { status: current, previous: current, changed: false };
    }
    if (currentStatus && currentStatus !== 'nuevo') {
        return { status: current, previous: current, changed: false };
    }

    if (!current) {
        return upsertChatCommercialStatus(tenantId, {
            chatId: options.chatId,
            scopeModuleId: options.scopeModuleId,
            status: 'nuevo',
            source: options.source || 'webhook',
            reason: options.reason || 'first_inbound_customer_message',
            changedByUserId: options.changedByUserId || null,
            firstCustomerMessageAt: at,
            lastTransitionAt: at,
            metadata: normalizeMetadata(options.metadata)
        });
    }

    if (current.firstCustomerMessageAt) {
        return { status: current, previous: current, changed: false };
    }

    return upsertChatCommercialStatus(tenantId, {
        chatId: current.chatId,
        scopeModuleId: current.scopeModuleId,
        firstCustomerMessageAt: at,
        metadata: normalizeMetadata(options.metadata)
    });
}

async function markFirstAgentReply(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const at = normalizeIso(options.at) || nowIso();
    const current = await getChatCommercialStatus(tenantId, options);

    if (!current) {
        return upsertChatCommercialStatus(tenantId, {
            chatId: options.chatId,
            scopeModuleId: options.scopeModuleId,
            status: 'en_conversacion',
            source: options.source || 'socket',
            reason: options.reason || 'first_outbound_agent_message',
            changedByUserId: options.changedByUserId || null,
            firstAgentResponseAt: at,
            lastTransitionAt: at,
            metadata: normalizeMetadata(options.metadata)
        });
    }

    const patch = {
        chatId: current.chatId,
        scopeModuleId: current.scopeModuleId,
        metadata: normalizeMetadata(options.metadata)
    };
    if (!current.firstAgentResponseAt) patch.firstAgentResponseAt = at;
    if (current.status === 'nuevo') {
        patch.status = 'en_conversacion';
        patch.source = options.source || 'socket';
        patch.reason = options.reason || 'first_outbound_agent_message';
        patch.changedByUserId = options.changedByUserId || null;
        patch.lastTransitionAt = at;
    }

    if (Object.keys(patch).length <= 3) {
        return { status: current, previous: current, changed: false };
    }

    return upsertChatCommercialStatus(tenantId, patch);
}

async function markQuoteSent(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const at = normalizeIso(options.at) || nowIso();
    const current = await getChatCommercialStatus(tenantId, options);

    if (current && (current.status === 'vendido' || current.status === 'perdido')) {
        return { status: current, previous: current, changed: false };
    }

    const base = current || {
        chatId: normalizeChatId(options.chatId),
        scopeModuleId: normalizeScopeModuleId(options.scopeModuleId || '')
    };
    if (!base.chatId) throw new Error('chatId requerido para marcar cotizado.');

    return upsertChatCommercialStatus(tenantId, {
        chatId: base.chatId,
        scopeModuleId: base.scopeModuleId,
        status: 'cotizado',
        source: options.source || 'socket',
        reason: options.reason || 'send_structured_quote_success',
        changedByUserId: options.changedByUserId || null,
        quotedAt: current?.quotedAt || at,
        firstCustomerMessageAt: current?.firstCustomerMessageAt || null,
        firstAgentResponseAt: current?.firstAgentResponseAt || null,
        lastTransitionAt: at,
        metadata: normalizeMetadata(options.metadata)
    });
}

async function markManualStatus(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const targetStatus = normalizeStatus(options.status || '');
    if (!MANUAL_STATUS_KEYS.has(targetStatus)) {
        throw new Error('status manual invalido. Permitidos: aceptado, programado, atendido, vendido, perdido, expirado.');
    }
    const at = normalizeIso(options.at) || nowIso();
    const current = await getChatCommercialStatus(tenantId, options);
    const base = current || {
        chatId: normalizeChatId(options.chatId),
        scopeModuleId: normalizeScopeModuleId(options.scopeModuleId || '')
    };
    if (!base.chatId) throw new Error('chatId requerido para marcado manual.');

    return upsertChatCommercialStatus(tenantId, {
        chatId: base.chatId,
        scopeModuleId: base.scopeModuleId,
        status: targetStatus,
        source: options.source || 'manual',
        reason: options.reason || ('manual_mark_' + targetStatus),
        changedByUserId: options.changedByUserId || null,
        soldAt: targetStatus === 'vendido' ? (current?.soldAt || at) : current?.soldAt || null,
        lostAt: targetStatus === 'perdido' ? (current?.lostAt || at) : current?.lostAt || null,
        quotedAt: current?.quotedAt || null,
        firstCustomerMessageAt: current?.firstCustomerMessageAt || null,
        firstAgentResponseAt: current?.firstAgentResponseAt || null,
        lastTransitionAt: at,
        metadata: normalizeMetadata(options.metadata)
    });
}

module.exports = {
    getChatCommercialStatus,
    listCommercialStatuses,
    upsertChatCommercialStatus,
    setChatPattyMode,
    resetChatPattyMode,
    extendPattyReviewWindow,
    resumeExpiredPattyReviewModes,
    markInboundCustomerFirstContact,
    markFirstAgentReply,
    markQuoteSent,
    markManualStatus
};

