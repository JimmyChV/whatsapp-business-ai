const { getChatSuggestion, askInternalCopilot } = require('../../operations/services/ai.service');
const waClient = require('./wa-provider.service');
const mediaManager = require('./media-manager.service');
const { loadCatalog, addProduct, updateProduct, deleteProduct } = require('../../tenant/services/catalog-manager.service');
const { getWooCatalog, isWooConfigured } = require('../../tenant/services/woocommerce.service');
const { listQuickReplies } = require('../../tenant/services/quick-replies-manager.service');
const tenantSettingsService = require('../../tenant/services/tenant-settings.service');
const tenantIntegrationsService = require('../../tenant/services/integrations.service');
const tenantService = require('../../tenant/services/tenant-core.service');
const planLimitsService = require('../../security/services/plan-limits.service');
const aiUsageService = require('../../tenant/services/ai-usage.service');
const aiChatHistoryService = require('../../operations/services/ai-chat-history.service');
const messageHistoryService = require('../../operations/services/message-history.service');
const waModuleService = require('../../tenant/services/wa-modules.service');
const tenantCatalogService = require('../../tenant/services/tenant-catalog.service');
const customerService = require('../../tenant/services/customers.service');
const tenantLabelService = require('../../tenant/services/tenant-labels.service');
const conversationOpsService = require('../../operations/services/conversation-ops.service');
const auditLogService = require('../../security/services/audit-log.service');
const RateLimiter = require('../../../config/rate-limiter');
const { URL } = require('url');
const { resolveAndValidatePublicHost } = require('../../security/helpers/security-utils');
const {
    normalizeOrderCurrencyAmount,
    dedupeOrderProducts,
    collectProductsFromUnknownShape,
    parseProductsFromBodyText,
    parseProductsFromOrderTitle,
    buildOrderDebugKey,
    pickOrderDebugData,
    safeOrderDebugJson,
    extractCatalogItemCategories,
    buildCatalogDebugLine
} = require('../../operations/helpers/order-parsing.helpers');
const {
    normalizePhoneDigits,
    looksLikeSamePhoneDigits,
    formatPhoneForDisplay,
    isLikelyHumanPhoneDigits,
    coerceHumanPhone,
    resolveCloudDestinationChatId,
    normalizeScopedModuleId,
    parseScopedChatId,
    buildScopedChatId,
    getSummaryModuleScopeId,
    resolveScopedChatTarget,
    resolveAiHistoryScope,
    isLidIdentifier,
    extractPhoneFromText,
    extractPhoneFromContactLike,
    extractPhoneFromChat,
    extractPhoneFromSummary,
    buildChatIdentityKeyFromSummary,
    pickPreferredSummary
} = require('../helpers/chat-scope.helpers');
const {
    getSerializedMessageId,
    buildSocketAgentMeta,
    sanitizeAgentMeta,
    buildModuleAttributionMeta,
    buildEffectiveModuleContext
} = require('../helpers/agent-meta.helpers');
const {
    parseLocationNumber,
    isValidLatitude,
    isValidLongitude,
    extractFirstUrlFromText,
    extractMapUrlFromText,
    isLikelyMapUrl,
    extractCoordsFromText,
    extractLocationInfo,
    getMessageTypePreviewLabel
} = require('../helpers/message-location.helpers');
const {
    guessFileExtensionFromMime,
    sanitizeFilenameCandidate,
    getFilenameExtension,
    isGenericFilename,
    isMachineLikeFilename,
    looksLikeBodyFilename,
    extractMessageFileMeta,
    normalizeQuotedPayload,
    extractQuotedMessageInfo
} = require('../helpers/message-file.helpers');
const { createMessageMediaAssetsHelpers } = require('../helpers/message-media-assets.helpers');
const {
    resolveChatDisplayName,
    buildProfilePicCandidates,
    resolveProfilePic,
    truncateDisplayValue,
    snapshotSerializable,
    normalizeBusinessDetailsSnapshot,
    extractContactSnapshot,
    extractChatSnapshot,
    toParticipantArray,
    normalizeGroupParticipant,
    isInternalLikeName
} = require('../helpers/chat-profile.helpers');
const { createChatRuntimeHelpers } = require('../helpers/chat-runtime.helpers');
const { createSenderMetaHelpers } = require('../helpers/sender-meta.helpers');
const { createOutgoingAgentMetaCache } = require('../helpers/socket-agent-meta-cache.helpers');
const { createSocketOrderDebugHelpers } = require('../helpers/socket-order-debug.helpers');
const { createSocketModuleContextResolver } = require('../helpers/socket-module-context.helpers');
const { createSocketRuntimeContextStore } = require('./socket-runtime-context.service');
const { createSocketAuthzAuditService } = require('./socket-authz-audit.service');
const { createSocketTransportOrchestrator } = require('./socket-transport-orchestrator.service');
const { createSocketWaEventsBridgeService } = require('./socket-wa-events-bridge.service');
const { createSocketWaModuleContextService } = require('./socket-wa-module-context.service');
const { createSocketChatListService } = require('./socket-chat-list.service');
const { createSocketChatHistoryMediaService } = require('./socket-chat-history-media.service');
const {
    createGuardRateLimit,
    createLazySharpLoader
} = require('../helpers/socket-runtime-bootstrap.helpers');
const { buildWebjsSessionNamespaceFromIds } = require('../helpers/socket-session.helpers');
const fs = require('fs');
const path = require('path');

const eventRateLimiter = new RateLimiter({
    windowMs: Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS || 10000),
    max: Number(process.env.SOCKET_RATE_LIMIT_MAX || 30)
});
const HISTORY_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.HISTORY_DEBUG || '').trim().toLowerCase());
const SOCKET_RBAC_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.SAAS_AUTH_ENABLED || '').trim().toLowerCase());
const WA_REQUIRE_SELECTED_MODULE = ['1', 'true', 'yes', 'on'].includes(String(process.env.WA_REQUIRE_SELECTED_MODULE || '').trim().toLowerCase());
const WA_ENFORCE_WEBJS_PHONE_MATCH = ['1', 'true', 'yes', 'on'].includes(String(process.env.WA_ENFORCE_WEBJS_PHONE_MATCH || '').trim().toLowerCase());
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
const guardRateLimit = createGuardRateLimit(eventRateLimiter);
const getSharpImageProcessor = createLazySharpLoader();

const {
    slugifyFileName,
    buildCatalogProductCaption,
    buildCatalogImageCandidateUrls,
    normalizeUploadsRelativePath,
    resolveLocalUploadReference,
    guessMimeFromPathOrUrl,
    guessMimeFromFilename,
    parseContentDispositionFilename,
    buildQuickReplyFilename,
    parseCatalogImageDataUrl,
    fetchCatalogProductImageFromLocalUpload,
    fetchQuickReplyMedia,
    fetchCatalogProductImageFromUrl,
    fetchCatalogProductImage,
    ensureCloudApiCompatibleCatalogImage
} = createMessageMediaAssetsHelpers({
    fs,
    path,
    URL,
    Buffer,
    resolveAndValidatePublicHost,
    getSharpImageProcessor,
    SAAS_UPLOADS_ROOT,
    QUICK_REPLY_MEDIA_MAX_BYTES,
    QUICK_REPLY_MEDIA_TIMEOUT_MS
});
const {
    isStatusOrSystemMessage,
    isVisibleChatId,
    resolveLastMessagePreview,
    defaultCountryCode,
    buildPhoneCandidates,
    resolveRegisteredNumber,
    normalizeFilterToken,
    normalizeFilterTokens,
    toLabelTokenSet,
    matchesTokenSet,
    runWithConcurrency
} = createChatRuntimeHelpers({
    extractLocationInfo,
    extractCoordsFromText,
    normalizePhoneDigits,
    coerceHumanPhone
});
const {
    extractGroupParticipants,
    fetchGroupParticipantsFromStore,
    hydrateGroupParticipantsWithContacts,
    resolveMessageSenderMeta
} = createSenderMetaHelpers({
    env: process.env,
    waClient,
    coerceHumanPhone,
    isInternalLikeName,
    toParticipantArray,
    normalizeGroupParticipant
});
const {
    rememberOutgoingAgentMeta,
    getOutgoingAgentMeta,
    mergeAgentMeta
} = createOutgoingAgentMetaCache({
    sanitizeAgentMeta,
    ttlMs: Number(process.env.OUTGOING_AGENT_META_TTL_MS || (10 * 60 * 1000))
});
const {
    extractOrderInfo,
    logCatalogDebugSnapshot
} = createSocketOrderDebugHelpers({
    env: process.env,
    buildOrderDebugKey,
    pickOrderDebugData,
    safeOrderDebugJson,
    extractCatalogItemCategories,
    buildCatalogDebugLine,
    normalizeOrderCurrencyAmount,
    dedupeOrderProducts,
    collectProductsFromUnknownShape,
    parseProductsFromBodyText,
    parseProductsFromOrderTitle
});
const resolveSocketModuleContext = createSocketModuleContextResolver({
    waModuleService
});

class SocketManager {
    constructor(io) {
        this.io = io;
        this.runtimeStore = createSocketRuntimeContextStore({
            io,
            initialRuntimeContext: {
                tenantId: 'default',
                moduleId: 'default',
                transportMode: 'idle',
                webjsNamespace: typeof waClient.getWebjsSessionNamespace === 'function' ? waClient.getWebjsSessionNamespace() : null,
                updatedAt: Date.now()
            },
            cacheConfig: {
                chatMetaTtlMs: Number(process.env.CHAT_META_TTL_MS || 10 * 60 * 1000),
                chatListTtlMs: Number(process.env.CHAT_LIST_TTL_MS || 15000),
                contactListTtlMs: Number(process.env.CONTACT_LIST_TTL_MS || 60 * 1000)
            }
        });
        this.chatListService = createSocketChatListService({
            runtimeStore: this.runtimeStore,
            waClient,
            tenantLabelService,
            normalizeScopedModuleId,
            normalizePhoneDigits,
            normalizeFilterTokens,
            buildScopedChatId,
            buildChatIdentityKeyFromSummary,
            pickPreferredSummary,
            resolveChatDisplayName,
            resolveLastMessagePreview,
            extractPhoneFromChat,
            isVisibleChatId,
            isLidIdentifier,
            resolveProfilePic,
            coerceHumanPhone,
            resolveRegisteredNumber,
            toLabelTokenSet,
            matchesTokenSet,
            runWithConcurrency,
            getWaRuntime: this.getWaRuntime.bind(this)
        });
        this.chatHistoryMediaService = createSocketChatHistoryMediaService({
            waClient,
            mediaManager,
            messageHistoryService,
            normalizeScopedModuleId,
            resolveScopedChatTarget,
            buildScopedChatId,
            normalizePhoneDigits,
            extractPhoneFromChat,
            isStatusOrSystemMessage,
            getSerializedMessageId,
            resolveMessageSenderMeta,
            extractMessageFileMeta,
            extractQuotedMessageInfo,
            extractOrderInfo,
            extractLocationInfo,
            getOutgoingAgentMeta,
            mergeAgentMeta,
            getSortedVisibleChats: this.getSortedVisibleChats.bind(this)
        });
        this.setupSocketEvents();
        this.setupWAClientEvents();
    }


    getWaRuntime() {
        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : {};
        return {
            requestedTransport: String(runtime?.requestedTransport || process.env.WA_TRANSPORT || 'idle').toLowerCase(),
            activeTransport: String(runtime?.activeTransport || 'idle').toLowerCase(),
            cloudRequested: Boolean(runtime?.cloudRequested),
            cloudConfigured: Boolean(runtime?.cloudConfigured),
            cloudReady: Boolean(runtime?.cloudReady),
            availableTransports: Array.isArray(runtime?.availableTransports) ? runtime.availableTransports : ['cloud'],
            migrationReady: runtime?.migrationReady !== false
        };
    }

    getWaCapabilities() {
        const caps = waClient.getCapabilities();
        const runtime = this.getWaRuntime();
        return {
            messageEdit: Boolean(caps?.messageEdit),
            messageEditSync: Boolean(caps?.messageEditSync),
            messageForward: Boolean(caps?.messageForward),
            messageDelete: Boolean(caps?.messageDelete),
            messageReply: Boolean(caps?.messageReply),
            quickReplies: Boolean(caps?.quickReplies),
            quickRepliesRead: Boolean(caps?.quickRepliesRead),
            quickRepliesWrite: false,
            transport: runtime.activeTransport,
            requestedTransport: runtime.requestedTransport,
            cloudConfigured: runtime.cloudConfigured,
            cloudReady: runtime.cloudReady,
            availableTransports: runtime.availableTransports,
            migrationReady: runtime.migrationReady
        };
    }

    emitWaCapabilities(socket) {
        socket.emit('wa_capabilities', this.getWaCapabilities());

        socket.emit('wa_runtime', this.getWaRuntime());
    }


    async isFeatureEnabledForTenant(tenantId = 'default', featureKey = '') {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const tenant = tenantService.findTenantById(cleanTenantId) || tenantService.DEFAULT_TENANT;
        const tenantSettings = await tenantSettingsService.getTenantSettings(cleanTenantId);
        return planLimitsService.isFeatureEnabledForTenant(featureKey, tenant, tenantSettings);
    }

    async reserveAiQuota(tenantId = 'default', { socket = null } = {}) {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const tenant = tenantService.findTenantById(cleanTenantId) || tenantService.DEFAULT_TENANT;
        const tenantSettings = await tenantSettingsService.getTenantSettings(cleanTenantId);

        const aiEnabled = planLimitsService.isFeatureEnabledForTenant('aiPro', tenant, tenantSettings);
        if (!aiEnabled) {
            if (socket) socket.emit('ai_error', 'La IA esta deshabilitada para esta empresa o plan.');
            return { ok: false, reason: 'disabled' };
        }

        const limits = planLimitsService.getTenantPlanLimits(tenant);
        const used = await aiUsageService.getMonthlyUsage(cleanTenantId);
        const limit = Number(limits?.maxMonthlyAiRequests || 0);

        if (Number.isFinite(limit) && limit > 0 && used >= limit) {
            if (socket) {
                socket.emit('ai_error', 'Se alcanzo el limite mensual de IA (' + limit + ') para el plan ' + (tenant.plan || 'starter') + '.');
            }
            return { ok: false, reason: 'quota_exceeded', used, limit };
        }

        const next = await aiUsageService.incrementMonthlyUsage(cleanTenantId, { incrementBy: 1 });
        return { ok: true, used: next, limit };
    }

    getTenantRoom(tenantId = 'default') {
        return this.runtimeStore.getTenantRoom(tenantId);
    }

    emitToTenant(tenantId, eventName, payload) {
        this.runtimeStore.emitToTenant(tenantId, eventName, payload);
    }

    getTenantModuleRoom(tenantId = 'default', moduleId = 'default') {
        return this.runtimeStore.getTenantModuleRoom(tenantId, moduleId);
    }

    emitToTenantModule(tenantId, moduleId, eventName, payload) {
        this.runtimeStore.emitToTenantModule(tenantId, moduleId, eventName, payload);
    }

    setActiveRuntimeContext({
        tenantId = 'default',
        moduleId = 'default',
        moduleName = null,
        modulePhone = null,
        channelType = null,
        transportMode = 'idle',
        webjsNamespace = null
    } = {}) {
        return this.runtimeStore.set('runtimeContext', {
            tenantId: String(tenantId || 'default').trim() || 'default',
            moduleId: String(moduleId || 'default').trim().toLowerCase() || 'default',
            moduleName: String(moduleName || '').trim() || null,
            modulePhone: coerceHumanPhone(modulePhone || '') || null,
            channelType: String(channelType || '').trim().toLowerCase() || null,
            transportMode: String(transportMode || 'idle').trim().toLowerCase() || 'idle',
            webjsNamespace: String(webjsNamespace || '').trim() || null,
            updatedAt: Date.now()
        });
    }

    resolveRuntimeEventTarget() {
        return this.runtimeStore.resolveTarget();
    }

    emitToRuntimeContext(eventName, payload) {
        this.runtimeStore.emitToRuntimeContext(eventName, payload);
    }

    async enforceRuntimeWebjsPhonePolicy() {
        if (!WA_ENFORCE_WEBJS_PHONE_MATCH) return true;

        const runtime = this.getWaRuntime();
        const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
        if (activeTransport !== 'webjs') return true;

        const target = this.resolveRuntimeEventTarget();
        if (!target?.tenantId || !target?.moduleId) return true;

        const moduleConfig = await waModuleService.getModule(target.tenantId, target.moduleId).catch(() => null);
        const registeredPhone = normalizePhoneDigits(moduleConfig?.phoneNumber || '');
        if (!registeredPhone) return true;

        const connectedPhone = normalizePhoneDigits(waClient?.client?.info?.wid?.user || '');
        if (!connectedPhone) return true;

        if (looksLikeSamePhoneDigits(registeredPhone, connectedPhone)) return true;

        const warning = 'Numero no permitido para este modulo. Registrado: +' + registeredPhone + '. Escaneado: +' + connectedPhone + '.';
        this.emitToTenantModule(target.tenantId, target.moduleId, 'auth_failure', warning);

        try {
            await waClient.client.logout();
        } catch (_) { }

        try {
            waClient.isReady = false;
            await waClient.initialize();
        } catch (_) { }

        return false;
    }

    async persistMessageHistory(tenantId, {
        msg,
        senderMeta = null,
        fileMeta = null,
        order = null,
        location = null,
        quotedMessage = null,
        agentMeta = null,
        moduleContext = null
    } = {}) {
        try {
            if (!msg) return;
            const messageId = getSerializedMessageId(msg);
            const chatId = String(msg?.fromMe ? msg?.to : msg?.from || '').trim();
            if (!messageId || !chatId) return;

            const persistedAgentMeta = sanitizeAgentMeta(agentMeta);
            const historyModuleId = String(
                moduleContext?.moduleId
                || persistedAgentMeta?.sentViaModuleId
                || ''
            ).trim().toLowerCase() || null;
            const historyModulePhone = coerceHumanPhone(
                moduleContext?.phoneNumber
                || moduleContext?.phone
                || ''
            ) || null;
            const moduleAttributionMeta = buildModuleAttributionMeta(moduleContext);
            await messageHistoryService.upsertMessage(tenantId, {
                messageId,
                chatId,
                fromMe: Boolean(msg?.fromMe),
                senderId: senderMeta?.senderId || null,
                senderPhone: senderMeta?.senderPhone || null,
                waModuleId: historyModuleId,
                waPhoneNumber: historyModulePhone,
                authorId: String(msg?.author || msg?._data?.author || '').trim() || null,
                body: msg?.body || '',
                messageType: msg?.type || null,
                timestampUnix: Number(msg?.timestamp || 0) || Math.floor(Date.now() / 1000),
                ack: Number.isFinite(Number(msg?.ack)) ? Number(msg?.ack) : null,
                edited: false,
                hasMedia: Boolean(msg?.hasMedia),
                mediaMime: fileMeta?.mimetype || null,
                mediaFilename: fileMeta?.filename || null,
                mediaSizeBytes: Number(fileMeta?.fileSizeBytes || 0) || null,
                quotedMessageId: quotedMessage?.id || null,
                orderPayload: order && typeof order === 'object' ? order : null,
                locationPayload: location && typeof location === 'object' ? location : null,
                metadata: {
                    notifyName: senderMeta?.notifyName || null,
                    senderPushname: senderMeta?.senderPushname || null,
                    isGroupMessage: Boolean(senderMeta?.isGroupMessage),
                    media: {
                        url: fileMeta?.mediaUrl || null,
                        path: fileMeta?.mediaPath || null
                    },
                    sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || persistedAgentMeta?.sentViaModuleId || historyModuleId || null,
                    sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || persistedAgentMeta?.sentViaModuleName || null,
                    sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || persistedAgentMeta?.sentViaModuleImageUrl || null,
                    sentViaTransport: moduleAttributionMeta?.sentViaTransport || persistedAgentMeta?.sentViaTransport || null,
                    sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || historyModulePhone || null,
                    sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                    ...(persistedAgentMeta || {})
                },
                chat: {
                    id: chatId,
                    displayName: senderMeta?.notifyName || null,
                    phone: senderMeta?.senderPhone || null,
                    subtitle: senderMeta?.senderPushname || null
                }
            });

            const customerPhone = coerceHumanPhone(
                senderMeta?.senderPhone
                || chatId.split('@')[0]
                || ''
            );
            if (customerPhone) {
                await customerService.upsertFromInteraction(tenantId, {
                    moduleId: historyModuleId,
                    channelType: moduleContext?.channelType || moduleAttributionMeta?.sentViaChannelType || 'whatsapp',
                    messageId,
                    chatId,
                    phone: customerPhone,
                    contactName: senderMeta?.notifyName || senderMeta?.senderPushname || null,
                    direction: msg?.fromMe ? 'outbound' : 'inbound',
                    messageType: msg?.type || null,
                    lastMessageAt: new Date().toISOString(),
                    metadata: {
                        messageId,
                        senderId: senderMeta?.senderId || null,
                        senderPushname: senderMeta?.senderPushname || null,
                        waPhoneNumber: historyModulePhone,
                        fromMe: Boolean(msg?.fromMe)
                    }
                });
            }
            if (HISTORY_DEBUG_ENABLED) {
                console.info('[History] persist message ok tenant=' + String(tenantId || 'default') + ' chat=' + String(chatId || '') + ' msg=' + String(messageId || '') + ' module=' + String(historyModuleId || 'n/a'));
            }
        } catch (error) {
            console.warn('[History] persistMessageHistory failed:', String(error?.message || error));
        }
    }
    async persistMessageEdit(tenantId, {
        messageId,
        chatId,
        body,
        editedAtUnix
    } = {}) {
        try {
            await messageHistoryService.updateMessageEdit(tenantId, {
                messageId,
                chatId,
                body,
                editedAtUnix
            });
        } catch (error) {
            console.warn('[History] persistMessageEdit failed:', String(error?.message || error));
        }
    }

    async persistMessageAck(tenantId, {
        messageId,
        chatId,
        ack
    } = {}) {
        try {
            await messageHistoryService.updateMessageAck(tenantId, {
                messageId,
                chatId,
                ack
            });
        } catch (error) {
            console.warn('[History] persistMessageAck failed:', String(error?.message || error));
        }
    }

    resolveHistoryTenantId() {
        try {
            const runtimeTarget = this.resolveRuntimeEventTarget();
            if (runtimeTarget?.tenantId) return runtimeTarget.tenantId;
            const socketsMap = this.io?.sockets?.sockets;
            const entries = socketsMap ? Array.from(socketsMap.values()) : [];
            if (!entries.length) return 'default';
            const tenants = new Set(entries.map((socket) => String(socket?.data?.tenantId || 'default').trim() || 'default'));
            if (tenants.size === 1) return Array.from(tenants)[0] || 'default';
            const runtimeContext = this.runtimeStore.get('runtimeContext', {});
            return String(runtimeContext?.tenantId || 'default').trim() || 'default';
        } catch (error) {
            return 'default';
        }
    }

    resolveHistoryModuleContext() {
        const runtimeContext = this.runtimeStore.get('runtimeContext', {});
        const runtimeTarget = this.resolveRuntimeEventTarget();
        const moduleId = String(runtimeTarget?.moduleId || runtimeContext?.moduleId || '').trim().toLowerCase() || null;
        const phoneNumber = coerceHumanPhone(runtimeContext?.modulePhone || '') || null;
        const moduleName = String(runtimeContext?.moduleName || '').trim() || null;
        const transportMode = String(runtimeContext?.transportMode || this.getWaRuntime()?.activeTransport || '').trim().toLowerCase() || null;
        const channelType = String(runtimeContext?.channelType || '').trim().toLowerCase() || null;

        return {
            moduleId,
            phoneNumber,
            name: moduleName,
            transportMode,
            channelType
        };
    }

    normalizeHistoryLabels(labels = []) {
        if (!Array.isArray(labels)) return [];
        const seen = new Set();
        const normalized = [];
        for (const label of labels) {
            if (!label) continue;
            const id = String(label?.id || '').trim();
            const name = String(label?.name || '').trim();
            const key = `${id}:${name}`.toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            normalized.push({
                id: id || null,
                name: name || (id || ''),
                color: label?.color || null
            });
        }
        return normalized;
    }

    toHistoryChatSummary(entry = {}) {
        const chatId = String(entry?.chatId || '').trim();
        if (!chatId || !isVisibleChatId(chatId)) return null;

        const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
        const subtitle = String(entry?.subtitle || metadata?.senderPushname || '').trim() || null;
        const explicitPhone = coerceHumanPhone(entry?.phone || '');
        const idPhone = isLidIdentifier(chatId) ? null : coerceHumanPhone(chatId.split('@')[0] || '');
        const subtitlePhone = coerceHumanPhone(extractPhoneFromText(subtitle || '') || '');
        const phone = explicitPhone || subtitlePhone || idPhone || null;

        const displayName = String(entry?.displayName || metadata?.notifyName || '').trim();
        const fallbackName = displayName || subtitle || (phone ? `+${phone}` : 'Contacto');

        const labels = this.normalizeHistoryLabels(metadata?.labels || []);
        const profilePicUrl = String(metadata?.profilePicUrl || '').trim() || null;

        const lastMessageModuleId = String(entry?.lastMessageModuleId || metadata?.sentViaModuleId || '').trim().toLowerCase() || null;
        const lastMessageModuleName = String(entry?.lastMessageModuleName || metadata?.sentViaModuleName || '').trim() || null;
        const lastMessageModuleImageUrl = String(entry?.lastMessageModuleImageUrl || metadata?.sentViaModuleImageUrl || '').trim() || null;
        const lastMessageTransport = String(entry?.lastMessageTransport || metadata?.sentViaTransport || '').trim().toLowerCase() || null;
        const lastMessageChannelType = String(entry?.lastMessageChannelType || metadata?.sentViaChannelType || '').trim().toLowerCase() || null;
        const scopeModuleId = getSummaryModuleScopeId({ scopeModuleId: entry?.scopeModuleId, lastMessageModuleId, id: chatId }) || null;
        const scopedId = buildScopedChatId(chatId, scopeModuleId || '');

        return {
            id: scopedId || chatId,
            baseChatId: chatId,
            scopeModuleId,
            name: fallbackName,
            phone,
            subtitle,
            unreadCount: Number(entry?.unreadCount || 0) || 0,
            timestamp: Number(entry?.lastMessageAt || 0) || 0,
            lastMessage: String(entry?.lastMessageBody || metadata?.lastMessage || '').trim(),
            lastMessageFromMe: Boolean(entry?.lastMessageFromMe),
            ack: Number.isFinite(Number(entry?.lastMessageAck)) ? Number(entry.lastMessageAck) : 0,
            labels,
            profilePicUrl,
            isMyContact: Boolean(metadata?.isMyContact),
            lastMessageModuleId: scopeModuleId || lastMessageModuleId,
            lastMessageModuleName,
            lastMessageModuleImageUrl,
            lastMessageTransport,
            lastMessageChannelType,
            archived: Boolean(entry?.archived),
            pinned: Boolean(entry?.pinned)
        };
    }

    historySummaryMatches(summary = {}, { queryLower = '', queryDigits = '', filters = {} } = {}) {
        if (!summary || typeof summary !== 'object') return false;

        const name = String(summary?.name || '').toLowerCase();
        const subtitle = String(summary?.subtitle || '').toLowerCase();
        const lastMessage = String(summary?.lastMessage || '').toLowerCase();
        const phone = normalizePhoneDigits(summary?.phone || '');
        const baseSummaryId = String(summary?.baseChatId || parseScopedChatId(summary?.id || '').chatId || summary?.id || '');
        const idDigits = normalizePhoneDigits(String(baseSummaryId || '').split('@')[0] || '');

        if (queryDigits) {
            const byPhone = phone.includes(queryDigits);
            const byId = idDigits.includes(queryDigits);
            if (!byPhone && !byId) return false;
        } else if (queryLower) {
            const byText = name.includes(queryLower) || subtitle.includes(queryLower) || lastMessage.includes(queryLower);
            if (!byText) return false;
        }

        const unreadOnly = Boolean(filters?.unreadOnly);
        const unlabeledOnly = Boolean(filters?.unlabeledOnly);
        const contactMode = ['all', 'my', 'unknown'].includes(String(filters?.contactMode || 'all'))
            ? String(filters?.contactMode || 'all')
            : 'all';
        const archivedMode = ['all', 'archived', 'active'].includes(String(filters?.archivedMode || 'all'))
            ? String(filters?.archivedMode || 'all')
            : 'all';
        const pinnedMode = ['all', 'pinned', 'unpinned'].includes(String(filters?.pinnedMode || 'all'))
            ? String(filters?.pinnedMode || 'all')
            : 'all';
        const labelTokens = normalizeFilterTokens(filters?.labelTokens);

        if (unreadOnly && Number(summary?.unreadCount || 0) <= 0) return false;
        if (contactMode === 'my' && !summary?.isMyContact) return false;
        if (contactMode === 'unknown' && summary?.isMyContact) return false;
        if (archivedMode === 'archived' && !summary?.archived) return false;
        if (archivedMode === 'active' && summary?.archived) return false;
        if (pinnedMode === 'pinned' && !summary?.pinned) return false;
        if (pinnedMode === 'unpinned' && summary?.pinned) return false;

        const labels = Array.isArray(summary?.labels) ? summary.labels : [];
        if (unlabeledOnly && labels.length > 0) return false;
        if (!unlabeledOnly && labelTokens.length > 0) {
            const labelTokenSet = toLabelTokenSet(labels);
            if (!matchesTokenSet(labelTokenSet, labelTokens)) return false;
        }

        return true;
    }

    async getHistoryChatsPage(tenantId, {
        offset = 0,
        limit = 80,
        query = '',
        filters = {},
        filterKey = '',
        scopeModuleId = ''
    } = {}) {
        const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
        const safeLimit = Number.isFinite(Number(limit)) ? Math.min(250, Math.max(20, Math.floor(Number(limit)))) : 80;
        const queryText = String(query || '').trim();
        const queryLower = queryText.toLowerCase();
        const queryDigits = normalizePhoneDigits(queryText);
        const normalizedScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');

        const allRows = [];
        let cursor = 0;
        const batchSize = 500;
        const maxRows = Math.max(1000, Number(process.env.HISTORY_FALLBACK_MAX_CHATS || 3000));

        while (allRows.length < maxRows) {
            const batch = await messageHistoryService.listChats(tenantId, { limit: batchSize, offset: cursor });
            if (!Array.isArray(batch) || batch.length === 0) break;
            allRows.push(...batch);
            cursor += batch.length;
            if (batch.length < batchSize) break;
        }

        const normalized = allRows
            .map((entry) => this.toHistoryChatSummary(entry))
            .filter(Boolean)
            .filter((summary) => {
                if (!normalizedScopeModuleId) return true;
                const summaryScopeId = normalizeScopedModuleId(
                    summary?.scopeModuleId
                    || summary?.lastMessageModuleId
                    || summary?.sentViaModuleId
                    || ''
                );
                return summaryScopeId === normalizedScopeModuleId;
            })
            .filter((summary) => this.historySummaryMatches(summary, {
                queryLower,
                queryDigits,
                filters
            }))
            .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)));

        const pageItems = normalized.slice(safeOffset, safeOffset + safeLimit);
        const nextOffset = safeOffset + pageItems.length;
        const total = normalized.length;
        const hasMore = nextOffset < total;

        return {
            items: pageItems,
            offset: safeOffset,
            limit: safeLimit,
            total,
            hasMore,
            nextOffset,
            query: queryText,
            filters,
            filterKey,
            scopeModuleId: normalizedScopeModuleId || null,
            source: 'history_fallback'
        };
    }

    toHistoryMessagePayload(row = {}, chatId = '') {
        return this.chatHistoryMediaService.toHistoryMessagePayload(row, chatId);
    }

    async getHistoryChatHistory(tenantId, { chatId = '', limit = 60, scopeModuleId = '' } = {}) {
        return this.chatHistoryMediaService.getHistoryChatHistory(tenantId, { chatId, limit, scopeModuleId });
    }
    async emitMessageEditability(messageId, chatId) {
        const id = String(messageId || '').trim();
        if (!id) return;
        try {
            const canEdit = await waClient.canEditMessageById(id);
            this.emitToRuntimeContext('message_editability', {
                id,
                chatId: String(chatId || ''),
                canEdit
            });
        } catch (e) { }
    }

    scheduleEditabilityRefresh(messageId, chatId, delaysMs = [1200, 3200, 7000]) {
        const id = String(messageId || '').trim();
        if (!id) return;
        const normalizedChatId = String(chatId || '');
        (Array.isArray(delaysMs) ? delaysMs : []).forEach((delay) => {
            const waitMs = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
            setTimeout(() => {
                this.emitMessageEditability(id, normalizedChatId);
            }, waitMs);
        });
    }

    invalidateChatListCache() {
        return this.chatListService.invalidateChatListCache();
    }

    async getSortedVisibleChats({ forceRefresh = false } = {}) {
        return this.chatListService.getSortedVisibleChats({ forceRefresh });
    }
    getCachedChatMeta(chatId) {
        return this.chatListService.getCachedChatMeta(chatId);
    }

    async hydrateChatMeta(chat) {
        return this.chatListService.hydrateChatMeta(chat);
    }

    async getSearchableContacts({ forceRefresh = false } = {}) {
        return this.chatListService.getSearchableContacts({ forceRefresh });
    }
    async getChatLabelTokenSet(chat, { tenantId = 'default', scopeModuleId = '' } = {}) {
        return this.chatListService.getChatLabelTokenSet(chat, { tenantId, scopeModuleId });
    }

    async applyAdvancedChatFilters(chats = [], filters = {}, { tenantId = 'default', scopeModuleId = '' } = {}) {
        return this.chatListService.applyAdvancedChatFilters(chats, filters, { tenantId, scopeModuleId });
    }
    async toChatSummary(chat, {
        includeHeavyMeta = false,
        scopeModuleId = '',
        scopeModuleName = null,
        scopeModuleImageUrl = null,
        scopeChannelType = null,
        scopeTransport = null,
        tenantId = 'default'
    } = {}) {
        return this.chatListService.toChatSummary(chat, {
            includeHeavyMeta,
            scopeModuleId,
            scopeModuleName,
            scopeModuleImageUrl,
            scopeChannelType,
            scopeTransport,
            tenantId
        });
    }

    setupSocketEvents() {

        this.io.on('connection', async (socket) => {
            const tenantId = String(socket?.data?.tenantId || 'default');
            const authContext = socket?.data?.authContext || null;
            const authzAudit = createSocketAuthzAuditService({
                socket,
                tenantId,
                authContext,
                socketRbacEnabled: SOCKET_RBAC_ENABLED,
                auditLogService
            });
            const moduleContextService = createSocketWaModuleContextService({
                socket,
                tenantId,
                authContext,
                waModuleService,
                resolveSocketModuleContext,
                getTenantModuleRoom: this.getTenantModuleRoom.bind(this)
            });
            const transportOrchestrator = createSocketTransportOrchestrator({
                socket,
                tenantId,
                authContext,
                authzAudit,
                waClient,
                waModuleService,
                moduleContextService,
                runtimeStore: this.runtimeStore,
                guardRateLimit,
                getTenantRoom: this.getTenantRoom.bind(this),
                getWaRuntime: this.getWaRuntime.bind(this),
                emitWaCapabilities: this.emitWaCapabilities.bind(this),
                setActiveRuntimeContext: this.setActiveRuntimeContext.bind(this),
                invalidateChatListCache: this.invalidateChatListCache.bind(this),
                waRequireSelectedModule: WA_REQUIRE_SELECTED_MODULE
            });
            socket.data = socket.data || {};
            socket.data.transportOrchestrator = transportOrchestrator;

            const recordConversationEvent = async ({
                chatId = '',
                scopeModuleId = '',
                eventType = '',
                eventSource = 'socket',
                payload = {},
                customerId = null
            } = {}) => {
                try {
                    const cleanChatId = String(chatId || '').trim();
                    if (!cleanChatId) return;
                    await conversationOpsService.recordConversationEvent(tenantId, {
                        chatId: cleanChatId,
                        scopeModuleId: String(scopeModuleId || '').trim().toLowerCase(),
                        customerId: String(customerId || '').trim() || null,
                        actorUserId: authContext?.userId || null,
                        actorRole: authzAudit.actorContext.userRole || null,
                        eventType: String(eventType || '').trim() || 'chat.event',
                        eventSource: String(eventSource || 'socket').trim() || 'socket',
                        payload: payload && typeof payload === 'object' ? payload : {}
                    });
                } catch (_) { }
            };
            const normalizeSocketModuleId = (value = '') => String(value || '').trim().toLowerCase();
            const normalizeSocketCatalogId = (value = '') => String(value || '').trim().toUpperCase();
            const normalizeSocketCatalogIdList = (value = []) => {
                const source = Array.isArray(value) ? value : [];
                const seen = new Set();
                const out = [];
                source.forEach((entry) => {
                    const clean = normalizeSocketCatalogId(entry);
                    if (!/^CAT-[A-Z0-9]{4,}$/.test(clean)) return;
                    if (seen.has(clean)) return;
                    seen.add(clean);
                    out.push(clean);
                });
                return out;
            };
            const getCatalogIdsFromModuleContext = (moduleContext = null) => {
                const moduleSettings = moduleContext?.metadata?.moduleSettings && typeof moduleContext.metadata.moduleSettings === 'object'
                    ? moduleContext.metadata.moduleSettings
                    : {};
                return normalizeSocketCatalogIdList(moduleSettings.catalogIds);
            };

            const getActiveCatalogScope = () => {
                const selectedModuleContext = socket?.data?.waModule || null;
                return {
                    tenantId,
                    moduleId: String(selectedModuleContext?.moduleId || '').trim() || null,
                    channelType: String(selectedModuleContext?.channelType || '').trim().toLowerCase() || null,
                    catalogIds: getCatalogIdsFromModuleContext(selectedModuleContext)
                };
            };

            const resolveCatalogSelection = async (scope = {}) => {
                const catalogs = await tenantCatalogService.ensureDefaultCatalog(tenantId).catch(() => []);
                const activeCatalogs = (Array.isArray(catalogs) ? catalogs : []).filter((entry) => entry?.isActive !== false);
                const activeCatalogIds = new Set(activeCatalogs.map((entry) => normalizeSocketCatalogId(entry?.catalogId)).filter(Boolean));

                let catalogIds = normalizeSocketCatalogIdList(scope.catalogIds);
                catalogIds = catalogIds.filter((catalogId) => activeCatalogIds.has(catalogId));

                const defaultCatalogId = normalizeSocketCatalogId(
                    activeCatalogs.find((entry) => entry?.isDefault)?.catalogId
                    || activeCatalogs[0]?.catalogId
                    || ''
                ) || null;

                if (!catalogIds.length) {
                    catalogIds = activeCatalogs
                        .map((entry) => normalizeSocketCatalogId(entry?.catalogId))
                        .filter(Boolean);
                }
                if (!catalogIds.length && defaultCatalogId) {
                    catalogIds = [defaultCatalogId];
                }
                const primaryCatalogId = defaultCatalogId && catalogIds.includes(defaultCatalogId)
                    ? defaultCatalogId
                    : (catalogIds[0] || defaultCatalogId || null);

                return {
                    catalogIds,
                    defaultCatalogId,
                    primaryCatalogId,
                    catalogs: activeCatalogs.filter((entry) => catalogIds.includes(normalizeSocketCatalogId(entry?.catalogId)))
                };
            };

            const loadScopedLocalCatalog = async (scope = {}, { requestedCatalogId = '' } = {}) => {
                const selection = await resolveCatalogSelection(scope);
                let catalogIds = [...selection.catalogIds];
                const requested = normalizeSocketCatalogId(requestedCatalogId);
                if (requested && catalogIds.includes(requested)) {
                    catalogIds = [requested];
                }

                const catalogNameMap = new Map();
                (Array.isArray(selection.catalogs) ? selection.catalogs : []).forEach((entry) => {
                    const cleanCatalogId = normalizeSocketCatalogId(entry?.catalogId);
                    if (!cleanCatalogId) return;
                    catalogNameMap.set(cleanCatalogId, String(entry?.name || cleanCatalogId).trim() || cleanCatalogId);
                });

                const merged = [];
                for (const catalogId of catalogIds) {
                    const includeLegacyEmptyCatalogId = Boolean(
                        catalogId
                        && selection.defaultCatalogId
                        && catalogId === selection.defaultCatalogId
                    );
                    const scopedItems = await loadCatalog({
                        tenantId: scope?.tenantId || tenantId,
                        moduleId: scope?.moduleId || null,
                        channelType: scope?.channelType || null,
                        catalogId,
                        includeLegacyEmptyCatalogId
                    });
                    (Array.isArray(scopedItems) ? scopedItems : []).forEach((item) => {
                        merged.push({
                            ...item,
                            catalogId: normalizeSocketCatalogId(item?.catalogId || catalogId || '') || null,
                            catalogName: catalogNameMap.get(catalogId) || catalogId || null
                        });
                    });
                }

                return {
                    items: merged,
                    selection: {
                        ...selection,
                        catalogIds,
                        catalogs: (Array.isArray(selection.catalogs) ? selection.catalogs : [])
                            .filter((entry) => catalogIds.includes(normalizeSocketCatalogId(entry?.catalogId))),
                        primaryCatalogId: catalogIds[0] || selection.primaryCatalogId || null
                    }
                };
            };

            const resolveCatalogScope = async ({ requestedModuleId = '', requestedCatalogId = '' } = {}) => {
                const normalizedRequested = normalizeSocketModuleId(requestedModuleId);
                if (!normalizedRequested) {
                    const activeScope = getActiveCatalogScope();
                    const activeSelection = await resolveCatalogSelection(activeScope);
                    const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
                    const nextCatalogIds = overrideCatalogId && activeSelection.catalogIds.includes(overrideCatalogId)
                        ? [overrideCatalogId]
                        : activeSelection.catalogIds;
                    return {
                        ...activeScope,
                        catalogIds: nextCatalogIds,
                        catalogId: nextCatalogIds[0] || activeSelection.primaryCatalogId || null
                    };
                }

                const activeModuleId = normalizeSocketModuleId(
                    socket?.data?.waModule?.moduleId
                    || socket?.data?.waModuleId
                    || ''
                );
                if (activeModuleId && activeModuleId === normalizedRequested) {
                    const activeScope = getActiveCatalogScope();
                    const activeSelection = await resolveCatalogSelection(activeScope);
                    const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
                    const nextCatalogIds = overrideCatalogId && activeSelection.catalogIds.includes(overrideCatalogId)
                        ? [overrideCatalogId]
                        : activeSelection.catalogIds;
                    return {
                        ...activeScope,
                        catalogIds: nextCatalogIds,
                        catalogId: nextCatalogIds[0] || activeSelection.primaryCatalogId || null
                    };
                }

                const userId = String(authContext?.userId || authContext?.id || '').trim();
                const allowedModules = await waModuleService.listModules(tenantId, {
                    includeInactive: false,
                    userId
                });
                const selected = (Array.isArray(allowedModules) ? allowedModules : [])
                    .find((entry) => normalizeSocketModuleId(entry?.moduleId) === normalizedRequested);
                if (!selected) {
                    throw new Error('No tienes acceso al modulo solicitado para catalogo.');
                }

                const baseScope = {
                    tenantId,
                    moduleId: String(selected?.moduleId || '').trim() || null,
                    channelType: String(selected?.channelType || '').trim().toLowerCase() || null,
                    catalogIds: getCatalogIdsFromModuleContext(selected)
                };
                const selection = await resolveCatalogSelection(baseScope);
                const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
                const nextCatalogIds = overrideCatalogId && selection.catalogIds.includes(overrideCatalogId)
                    ? [overrideCatalogId]
                    : selection.catalogIds;

                return {
                    ...baseScope,
                    catalogIds: nextCatalogIds,
                    catalogId: nextCatalogIds[0] || selection.primaryCatalogId || null
                };
            };
            await transportOrchestrator.bootstrapTransportContext();
            transportOrchestrator.registerTransportHandlers();

            // --- Chat info ---
            this.chatListService.registerChatListHandlers({
                socket,
                tenantId,
                transportOrchestrator,
                getHistoryChatsPage: this.getHistoryChatsPage.bind(this)
            });

            this.chatHistoryMediaService.registerChatHistoryHandlers({
                socket,
                tenantId,
                transportOrchestrator
            });

            socket.on('start_new_chat', async ({ phone, firstMessage, moduleId } = {}) => {
                try {
                    if (!transportOrchestrator.ensureTransportReady(socket, { action: 'abrir un chat nuevo', errorEvent: 'start_new_chat_error' })) {
                        return;
                    }

                    const requestedModuleId = normalizeSocketModuleId(moduleId || '');
                    let activeModuleContext = socket?.data?.waModule || null;
                    if (requestedModuleId) {
                        const currentModuleId = normalizeSocketModuleId(activeModuleContext?.moduleId || socket?.data?.waModuleId || '');
                        if (!currentModuleId || currentModuleId !== requestedModuleId) {
                            const moduleContextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId);
                            activeModuleContext = moduleContextPayload?.selected || null;
                            if (!activeModuleContext?.moduleId || normalizeSocketModuleId(activeModuleContext.moduleId) !== requestedModuleId) {
                                socket.emit('start_new_chat_error', 'No tienes acceso al modulo solicitado para abrir este chat.');
                                return;
                            }
                            await transportOrchestrator.ensureTransportForSelectedModule(activeModuleContext);
                        }
                    }

                    const activeScopeModuleId = normalizeScopedModuleId(activeModuleContext?.moduleId || socket?.data?.waModuleId || '');
                    const scopeSummaryOptions = {
                        scopeModuleId: activeScopeModuleId,
                        scopeModuleName: String(activeModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(activeModuleContext?.imageUrl || activeModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(activeModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(activeModuleContext?.transportMode || '').trim().toLowerCase() || null
                    };

                    const clean = normalizePhoneDigits(phone);
                    if (!clean) {
                        socket.emit('start_new_chat_error', 'Numero invalido.');
                        return;
                    }

                    const runtime = this.getWaRuntime();
                    const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();

                    let registeredUser = null;
                    if (activeTransport === 'cloud') {
                        try {
                            if (waClient?.client && typeof waClient.client.getNumberId === 'function') {
                                const numberId = await waClient.client.getNumberId(clean);
                                const byUser = coerceHumanPhone(numberId?.user || '');
                                const bySerialized = coerceHumanPhone(String(numberId?._serialized || '').split('@')[0] || '');
                                registeredUser = byUser || bySerialized || null;
                            }
                        } catch (_) { }

                        if (!registeredUser) {
                            const candidates = buildPhoneCandidates(clean);
                            registeredUser = coerceHumanPhone(candidates[0] || clean);
                        }
                    } else {
                        registeredUser = await resolveRegisteredNumber(waClient.client, clean);
                        if (!registeredUser) {
                            socket.emit('start_new_chat_error', 'El numero no esta registrado en WhatsApp.');
                            return;
                        }
                    }

                    if (!registeredUser) {
                        socket.emit('start_new_chat_error', 'Numero invalido para abrir chat.');
                        return;
                    }

                    const normalizedRegistered = normalizePhoneDigits(registeredUser);
                    const directChatId = String(registeredUser) + '@c.us';
                    let canonicalChatId = directChatId;

                    try {
                        const visibleChats = await this.getSortedVisibleChats({ forceRefresh: true });
                        const existingChat = visibleChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === normalizedRegistered);
                        if (existingChat?.id?._serialized) {
                            canonicalChatId = existingChat.id._serialized;
                        }
                    } catch (e) { }

                    if (firstMessage && String(firstMessage).trim()) {
                        const firstText = String(firstMessage).trim();
                        const firstSentMessage = await waClient.sendMessage(directChatId, firstText);
                        const firstAgentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, activeModuleContext));
                        const firstSentMessageId = getSerializedMessageId(firstSentMessage);
                        if (firstSentMessageId && firstAgentMeta) {
                            rememberOutgoingAgentMeta(firstSentMessageId, firstAgentMeta);
                        }
                        await emitRealtimeOutgoingMessage({
                            sentMessage: firstSentMessage,
                            fallbackChatId: canonicalChatId || directChatId,
                            fallbackBody: firstText,
                            quotedMessageId: '',
                            moduleContext: activeModuleContext,
                            agentMeta: firstAgentMeta,
                            mediaPayload: null
                        });

                        await recordConversationEvent({
                            chatId: canonicalChatId || directChatId,
                            scopeModuleId: activeScopeModuleId || '',
                            eventType: 'chat.message.outgoing.text',
                            eventSource: 'socket',
                            payload: {
                                messageId: firstSentMessageId || null,
                                quotedMessageId: null,
                                length: firstText.length,
                                hasQuote: false
                            }
                        });
                    }

                    try {
                        const chat = await waClient.client.getChatById(canonicalChatId);
                        const summary = await this.toChatSummary(chat, { includeHeavyMeta: true, ...scopeSummaryOptions });
                        if (summary) {
                            canonicalChatId = String(summary.baseChatId || parseScopedChatId(summary.id).chatId || canonicalChatId || '').trim() || canonicalChatId;
                            this.io.emit('chat_updated', summary);
                        }
                    } catch (e) {
                        try {
                            const fallbackChat = await waClient.client.getChatById(directChatId);
                            const fallbackSummary = await this.toChatSummary(fallbackChat, { includeHeavyMeta: true, ...scopeSummaryOptions });
                            if (fallbackSummary) {
                                canonicalChatId = String(fallbackSummary.baseChatId || parseScopedChatId(fallbackSummary.id).chatId || directChatId || '').trim() || directChatId;
                                this.io.emit('chat_updated', fallbackSummary);
                            }
                        } catch (fallbackErr) { }
                    }

                    const scopedChatId = buildScopedChatId(canonicalChatId, activeScopeModuleId || '');
                    socket.emit('chat_opened', {
                        chatId: scopedChatId || canonicalChatId,
                        baseChatId: canonicalChatId,
                        moduleId: activeScopeModuleId || null,
                        phone: registeredUser
                    });
                } catch (e) {
                    console.error('start_new_chat error:', e.message);
                    socket.emit('start_new_chat_error', 'No se pudo iniciar el chat.');
                }
            });

            socket.on('set_chat_state', async ({ chatId, pinned, archived }) => {
                if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'error', action: 'actualizar estado de chat' })) return;
                try {
                    const requestedChatId = String(chatId || '').trim();
                    if (!requestedChatId) {
                        socket.emit('error', 'Chat invalido para actualizar estado.');
                        return;
                    }

                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedTarget = resolveScopedChatTarget(requestedChatId, selectedScopeModuleId);
                    const safeChatId = String(scopedTarget.baseChatId || '').trim();
                    const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                    const scopedChatId = scopedTarget.scopedChatId || buildScopedChatId(safeChatId, scopeModuleId || '');
                    if (!safeChatId) {
                        socket.emit('error', 'Chat invalido para actualizar estado.');
                        return;
                    }

                    const hasPinned = typeof pinned === 'boolean';
                    const hasArchived = typeof archived === 'boolean';
                    if (!hasPinned && !hasArchived) {
                        socket.emit('error', 'No se detectaron cambios para el chat.');
                        return;
                    }

                    const patch = {};
                    if (hasPinned) patch.pinned = Boolean(pinned);
                    if (hasArchived) patch.archived = Boolean(archived);

                    const persisted = await messageHistoryService.updateChatState(tenantId, {
                        chatId: safeChatId,
                        pinned: hasPinned ? patch.pinned : undefined,
                        archived: hasArchived ? patch.archived : undefined
                    });

                    const selectedModuleContext = socket?.data?.waModule || null;
                    const summaryScopeOptions = {
                        tenantId,
                        scopeModuleId: scopeModuleId || '',
                        scopeModuleName: String(selectedModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(selectedModuleContext?.imageUrl || selectedModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(selectedModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(selectedModuleContext?.transportMode || '').trim().toLowerCase() || null
                    };

                    let summary = null;
                    try {
                        const visibleChats = await this.getSortedVisibleChats({ forceRefresh: false });
                        const waChat = (visibleChats || []).find((entry) => String(entry?.id?._serialized || '').trim() === safeChatId);
                        if (waChat) {
                            summary = await this.toChatSummary(waChat, { includeHeavyMeta: false, ...summaryScopeOptions });
                        }
                    } catch (_) { }

                    if (!summary) {
                        try {
                            const rows = await messageHistoryService.listChats(tenantId, { limit: 5000, offset: 0 });
                            const row = Array.isArray(rows)
                                ? rows.find((entry) => String(entry?.chatId || '').trim() === safeChatId)
                                : null;
                            if (row) {
                                summary = this.toHistoryChatSummary({ ...row, scopeModuleId: scopeModuleId || row?.scopeModuleId || null });
                            }
                        } catch (_) { }
                    }

                    if (summary) {
                        const nextSummary = {
                            ...summary,
                            id: scopedChatId || summary.id || safeChatId,
                            baseChatId: safeChatId,
                            scopeModuleId: scopeModuleId || summary.scopeModuleId || null,
                            archived: hasArchived ? patch.archived : Boolean(summary.archived),
                            pinned: hasPinned ? patch.pinned : Boolean(summary.pinned)
                        };
                        this.emitToTenant(tenantId, 'chat_updated', nextSummary);
                    }

                    socket.emit('chat_state_saved', {
                        ok: true,
                        chatId: scopedChatId || safeChatId,
                        baseChatId: safeChatId,
                        scopeModuleId: scopeModuleId || null,
                        pinned: hasPinned ? patch.pinned : Boolean(persisted?.pinned),
                        archived: hasArchived ? patch.archived : Boolean(persisted?.archived)
                    });

                    await authzAudit.auditSocketAction('chat.state.updated', {
                        resourceType: 'chat',
                        resourceId: safeChatId,
                        payload: {
                            pinned: hasPinned ? patch.pinned : undefined,
                            archived: hasArchived ? patch.archived : undefined
                        }
                    });

                    await recordConversationEvent({
                        chatId: safeChatId,
                        scopeModuleId,
                        eventType: 'chat.state.updated',
                        eventSource: 'socket',
                        payload: {
                            pinned: hasPinned ? patch.pinned : undefined,
                            archived: hasArchived ? patch.archived : undefined
                        }
                    });
                } catch (e) {
                    console.error('set_chat_state error:', e.message);
                    socket.emit('error', String(e?.message || 'No se pudo actualizar el estado del chat.'));
                }
            });
            socket.on('set_chat_labels', async ({ chatId, labelIds }) => {
                if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'chat_labels_error', action: 'gestionar etiquetas' })) return;
                try {
                    const requestedChatId = String(chatId || '').trim();
                    if (!requestedChatId) {
                        socket.emit('chat_labels_error', 'Chat invalido para etiquetar.');
                        return;
                    }

                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedTarget = resolveScopedChatTarget(requestedChatId, selectedScopeModuleId);
                    const safeChatId = String(scopedTarget.baseChatId || '').trim();
                    const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                    const scopedChatId = scopedTarget.scopedChatId || buildScopedChatId(safeChatId, scopeModuleId || '');
                    if (!safeChatId) {
                        socket.emit('chat_labels_error', 'Chat invalido para etiquetar.');
                        return;
                    }

                    const ids = Array.isArray(labelIds)
                        ? labelIds.map((value) => tenantLabelService.normalizeLabelId(value)).filter(Boolean)
                        : [];

                    const updatedLabels = await tenantLabelService.setChatLabels({
                        tenantId,
                        chatId: safeChatId,
                        scopeModuleId,
                        labelIds: ids
                    });

                    const payload = {
                        chatId: scopedChatId || safeChatId,
                        baseChatId: safeChatId,
                        scopeModuleId: scopeModuleId || null,
                        labels: Array.isArray(updatedLabels) ? updatedLabels : []
                    };

                    this.emitToTenant(tenantId, 'chat_labels_updated', payload);
                    socket.emit('chat_labels_saved', {
                        chatId: payload.chatId || safeChatId,
                        baseChatId: safeChatId,
                        scopeModuleId: payload.scopeModuleId || null,
                        ok: true
                    });
                    await authzAudit.auditSocketAction('chat.labels.updated', {
                        resourceType: 'chat',
                        resourceId: safeChatId,
                        payload: { labelIds: ids, labels: payload.labels }
                    });

                    await recordConversationEvent({
                        chatId: safeChatId,
                        scopeModuleId,
                        eventType: 'chat.labels.updated',
                        eventSource: 'socket',
                        payload: {
                            labelIds: ids,
                            labels: payload.labels
                        }
                    });
                } catch (e) {
                    console.error('set_chat_labels error:', e.message);
                    socket.emit('chat_labels_error', String(e?.message || 'No se pudieron actualizar las etiquetas del chat.'));
                }
            });

            socket.on('create_label', async ({ name, color = '', description = '' }) => {
                if (!authzAudit.requireRole(['owner', 'admin'], { errorEvent: 'chat_labels_error', action: 'crear etiquetas' })) return;
                try {
                    const cleanName = String(name || '').trim();
                    if (!cleanName) {
                        socket.emit('chat_labels_error', 'Nombre de etiqueta invalido.');
                        return;
                    }
                    const item = await tenantLabelService.saveLabel({
                        name: cleanName,
                        color: String(color || '').trim(),
                        description: String(description || '').trim(),
                        isActive: true
                    }, { tenantId });
                    socket.emit('chat_label_created', { ok: true, item });
                    const labels = await tenantLabelService.listLabels({ tenantId, includeInactive: false });
                    this.emitToTenant(tenantId, 'business_data_labels', {
                        labels,
                        source: 'tenant_db'
                    });
                } catch (e) {
                    console.error('create_label error:', e.message);
                    socket.emit('chat_labels_error', String(e?.message || 'No se pudo crear la etiqueta.'));
                }
            });
            socket.on('get_quick_replies', async (payload = {}) => {
                try {
                    const quickRepliesEnabled = await this.isFeatureEnabledForTenant(tenantId, 'quickReplies');
                    if (!quickRepliesEnabled) {
                        socket.emit('quick_replies', { items: [], source: 'disabled', enabled: false, writable: false });
                        return;
                    }

                    const payloadModuleId = String(payload?.moduleId || '').trim().toLowerCase();
                    const selectedModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const moduleId = payloadModuleId || selectedModuleId || '';
                    const items = await listQuickReplies({ tenantId, moduleId });
                    socket.emit('quick_replies', {
                        items: Array.isArray(items) ? items : [],
                        source: 'db',
                        enabled: true,
                        writable: false
                    });
                } catch (_) {
                    socket.emit('quick_reply_error', 'No se pudieron cargar las respuestas rapidas.');
                }
            });

            socket.on('add_quick_reply', async () => {
                socket.emit('quick_reply_error', 'Gestiona respuestas rapidas desde Panel SaaS.');
            });

            socket.on('update_quick_reply', async () => {
                socket.emit('quick_reply_error', 'Gestiona respuestas rapidas desde Panel SaaS.');
            });

            socket.on('delete_quick_reply', async () => {
                socket.emit('quick_reply_error', 'Gestiona respuestas rapidas desde Panel SaaS.');
            });

            socket.on('send_quick_reply', async (payload = {}) => {
                if (!guardRateLimit(socket, 'send_quick_reply')) return;
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar respuestas rapidas', errorEvent: 'error' })) return;
                try {
                    const quickRepliesEnabled = await this.isFeatureEnabledForTenant(tenantId, 'quickReplies');
                    if (!quickRepliesEnabled) {
                        socket.emit('error', 'Respuestas rapidas deshabilitadas para esta empresa o plan.');
                        return;
                    }

                    const quoted = String(payload?.quotedMessageId || '').trim();
                    const target = await resolveScopedSendTarget({
                        rawChatId: payload?.to,
                        rawPhone: payload?.toPhone,
                        errorEvent: 'error',
                        action: 'enviar respuestas rapidas'
                    });
                    if (!target?.ok) return;

                    const moduleId = normalizeScopedModuleId(target.scopeModuleId || socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const quickReplyId = String(payload?.quickReplyId || payload?.id || '').trim();

                    let replyPayload = null;
                    if (quickReplyId) {
                        const scopedReplies = await listQuickReplies({ tenantId, moduleId });
                        replyPayload = (Array.isArray(scopedReplies) ? scopedReplies : [])
                            .find((entry) => String(entry?.id || '').trim() === quickReplyId) || null;
                    }

                    if (!replyPayload && payload?.quickReply && typeof payload.quickReply === 'object') {
                        replyPayload = payload.quickReply;
                    }

                    if (!replyPayload) {
                        socket.emit('error', 'Respuesta rapida no encontrada para este modulo.');
                        return;
                    }

                    const bodyText = String(replyPayload?.text || replyPayload?.bodyText || replyPayload?.body || '').trim();
                    const rawMediaAssets = Array.isArray(replyPayload?.mediaAssets) ? replyPayload.mediaAssets : [];
                    const mediaAssets = rawMediaAssets
                        .map((entry) => ({
                            url: String(entry?.url || entry?.mediaUrl || '').trim(),
                            mimeType: String(entry?.mimeType || entry?.mediaMimeType || '').trim().toLowerCase() || '',
                            fileName: String(entry?.fileName || entry?.mediaFileName || entry?.filename || '').trim() || '',
                            sizeBytes: Number(entry?.sizeBytes ?? entry?.mediaSizeBytes) || null
                        }))
                        .filter((entry) => Boolean(entry.url));
                    const legacyMediaUrl = String(replyPayload?.mediaUrl || '').trim();
                    const legacyMediaMimeType = String(replyPayload?.mediaMimeType || '').trim().toLowerCase();
                    const legacyMediaFileName = String(replyPayload?.mediaFileName || replyPayload?.filename || '').trim();
                    if (legacyMediaUrl && !mediaAssets.some((entry) => entry.url === legacyMediaUrl)) {
                        mediaAssets.push({
                            url: legacyMediaUrl,
                            mimeType: legacyMediaMimeType,
                            fileName: legacyMediaFileName,
                            sizeBytes: null
                        });
                    }

                    if (!bodyText && mediaAssets.length === 0) {
                        socket.emit('error', 'La respuesta rapida no tiene contenido para enviar.');
                        return;
                    }

                    const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));

                    let sentMessage = null;
                    let mediaPayload = null;

                    if (mediaAssets.length > 0) {
                        const sentMediaPayloads = [];
                        for (let index = 0; index < mediaAssets.length; index += 1) {
                            const mediaEntry = mediaAssets[index] || null;
                            if (!mediaEntry?.url) continue;

                            const fetchedMedia = await fetchQuickReplyMedia(mediaEntry.url, {
                                maxBytes: QUICK_REPLY_MEDIA_MAX_BYTES,
                                timeoutMs: QUICK_REPLY_MEDIA_TIMEOUT_MS,
                                mimeHint: mediaEntry.mimeType || legacyMediaMimeType,
                                fileNameHint: mediaEntry.fileName || legacyMediaFileName
                            });

                            if (!fetchedMedia || !fetchedMedia.mediaData) {
                                socket.emit('error', 'No se pudo procesar el adjunto de la respuesta rapida.');
                                return;
                            }

                            const fileNameBase = mediaEntry.fileName || legacyMediaFileName || path.basename(String(fetchedMedia.filename || '').trim() || '') || ('adjunto-' + Date.now());
                            const safeFileName = String(fileNameBase || '').trim() || ('adjunto-' + Date.now());
                            const captionText = index === 0 ? bodyText : '';
                            const quotedMessageId = index === 0 ? (quoted || null) : null;
                            const sentAssetMessage = await waClient.sendMedia(
                                target.targetChatId,
                                fetchedMedia.mediaData,
                                fetchedMedia.mimetype || mediaEntry.mimeType || legacyMediaMimeType || 'application/octet-stream',
                                safeFileName,
                                captionText,
                                false,
                                quotedMessageId
                            );

                            if (!sentMessage) sentMessage = sentAssetMessage;
                            const currentMediaPayload = {
                                mimetype: fetchedMedia.mimetype || mediaEntry.mimeType || legacyMediaMimeType || null,
                                filename: safeFileName,
                                fileSizeBytes: Number(fetchedMedia?.fileSizeBytes || mediaEntry?.sizeBytes || 0) || null,
                                mediaUrl: String(fetchedMedia?.publicUrl || fetchedMedia?.sourceUrl || mediaEntry.url || '').trim() || null,
                                mediaPath: String(fetchedMedia?.relativePath || '').trim() || null
                            };
                            sentMediaPayloads.push(currentMediaPayload);

                            const sentAssetMessageId = getSerializedMessageId(sentAssetMessage);
                            if (sentAssetMessageId && agentMeta) rememberOutgoingAgentMeta(sentAssetMessageId, agentMeta);

                            await emitRealtimeOutgoingMessage({
                                sentMessage: sentAssetMessage,
                                fallbackChatId: target.targetChatId,
                                fallbackBody: captionText,
                                quotedMessageId: quotedMessageId || '',
                                moduleContext,
                                agentMeta,
                                mediaPayload: currentMediaPayload
                            });
                        }
                        if (sentMediaPayloads.length > 0) {
                            mediaPayload = {
                                ...sentMediaPayloads[0],
                                mediaAssets: sentMediaPayloads
                            };
                        }
                    } else {
                        if (quoted) {
                            sentMessage = await waClient.sendMessage(target.targetChatId, bodyText, { quotedMessageId: quoted });
                        } else {
                            sentMessage = await waClient.sendMessage(target.targetChatId, bodyText);
                        }
                        const sentMessageId = getSerializedMessageId(sentMessage);
                        if (sentMessageId && agentMeta) rememberOutgoingAgentMeta(sentMessageId, agentMeta);

                        await emitRealtimeOutgoingMessage({
                            sentMessage,
                            fallbackChatId: target.targetChatId,
                            fallbackBody: bodyText,
                            quotedMessageId: quoted,
                            moduleContext,
                            agentMeta,
                            mediaPayload
                        });
                    }

                    socket.emit('quick_reply_sent', {
                        ok: true,
                        id: String(replyPayload?.id || quickReplyId || '').trim() || null,
                        label: String(replyPayload?.label || '').trim() || null,
                        to: target.scopedChatId || target.targetChatId,
                        baseChatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId || null
                    });
                } catch (error) {
                    socket.emit('error', String(error?.message || 'No se pudo enviar la respuesta rapida.'));
                }
            });

            // --- Messaging ---
            const emitRealtimeOutgoingMessage = async ({
                sentMessage = null,
                fallbackChatId = '',
                fallbackBody = '',
                quotedMessageId = '',
                moduleContext = null,
                agentMeta = null,
                mediaPayload = null
            } = {}) => {
                const safeSentMessage = sentMessage && typeof sentMessage === 'object' ? sentMessage : {};
                const serializedMessageId = getSerializedMessageId(safeSentMessage);
                const messageId = serializedMessageId || ('local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9));
                const targetChatId = String(safeSentMessage?.to || fallbackChatId || '').trim();
                if (!targetChatId || !isVisibleChatId(targetChatId)) return;

                const timestamp = Number(safeSentMessage?.timestamp || 0) || Math.floor(Date.now() / 1000);
                const ack = Number.isFinite(Number(safeSentMessage?.ack)) ? Number(safeSentMessage.ack) : 0;
                const quotedId = String(quotedMessageId || '').trim();
                const mediaData = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.data || '').trim() : '';
                const mediaMimetype = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mimetype || '').trim() : '';
                const mediaFilename = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.filename || '').trim() : '';
                const mediaUrl = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mediaUrl || mediaPayload?.url || '').trim() : '';
                const mediaPath = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mediaPath || mediaPayload?.path || '').trim() : '';
                const mediaSizeBytesRaw = mediaPayload && typeof mediaPayload === 'object' ? Number(mediaPayload?.fileSizeBytes) : null;
                const mediaSizeBytes = Number.isFinite(mediaSizeBytesRaw) ? mediaSizeBytesRaw : null;
                const moduleAttributionMeta = buildModuleAttributionMeta(moduleContext);
                const moduleScopeId = normalizeScopedModuleId(
                    moduleContext?.moduleId
                    || moduleAttributionMeta?.sentViaModuleId
                    || agentMeta?.sentViaModuleId
                    || ''
                );
                const scopedTargetChatId = buildScopedChatId(targetChatId, moduleScopeId || '');

                const payload = {
                    id: messageId,
                    from: String(safeSentMessage?.from || '').trim() || null,
                    to: scopedTargetChatId || targetChatId,
                    chatId: scopedTargetChatId || targetChatId,
                    baseChatId: targetChatId,
                    scopeModuleId: moduleScopeId || null,
                    body: String(safeSentMessage?.body ?? fallbackBody ?? ''),
                    timestamp,
                    fromMe: true,
                    hasMedia: Boolean(mediaData || mediaUrl || safeSentMessage?.hasMedia),
                    mediaData: mediaData || null,
                    mimetype: mediaMimetype || null,
                    filename: mediaFilename || null,
                    mediaUrl: mediaUrl || null,
                    mediaPath: mediaPath || null,
                    fileSizeBytes: mediaSizeBytes,
                    ack,
                    type: String(safeSentMessage?.type || ((mediaData || mediaUrl) ? 'media' : 'chat')),
                    author: String(safeSentMessage?.author || safeSentMessage?._data?.author || '').trim() || null,
                    notifyName: null,
                    senderPhone: null,
                    senderId: null,
                    senderPushname: null,
                    isGroupMessage: String(targetChatId || '').endsWith('@g.us'),
                    canEdit: false,
                    order: null,
                    location: null,
                    quotedMessage: quotedId ? { id: quotedId, body: '', fromMe: false, hasMedia: false, type: 'chat' } : null,
                    ...(agentMeta || {}),
                    sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || String(agentMeta?.sentViaModuleId || '').trim() || null,
                    sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || String(agentMeta?.sentViaModuleName || '').trim() || null,
                    sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || String(agentMeta?.sentViaModuleImageUrl || '').trim() || null,
                    sentViaTransport: moduleAttributionMeta?.sentViaTransport || String(agentMeta?.sentViaTransport || '').trim().toLowerCase() || null,
                    sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || String(agentMeta?.sentViaPhoneNumber || '').trim() || null,
                    sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || String(agentMeta?.sentViaChannelType || '').trim().toLowerCase() || null
                };

                const persistedMessage = {
                    ...safeSentMessage,
                    id: safeSentMessage?.id || { _serialized: messageId },
                    fromMe: true,
                    to: targetChatId,
                    body: payload.body,
                    timestamp,
                    hasMedia: payload.hasMedia,
                    type: payload.type,
                    ack
                };
                this.emitToRuntimeContext('message', payload);

                setImmediate(async () => {
                    try {
                        await this.persistMessageHistory(tenantId, {
                            msg: persistedMessage,
                            senderMeta: null,
                            fileMeta: {
                                mimetype: payload.mimetype,
                                filename: payload.filename,
                                fileSizeBytes: payload.fileSizeBytes,
                                mediaUrl: payload.mediaUrl,
                                mediaPath: payload.mediaPath
                            },
                            order: null,
                            location: null,
                            quotedMessage: payload.quotedMessage,
                            agentMeta,
                            moduleContext
                        });
                    } catch (persistError) {
                        console.warn('[WA][PersistOutgoing] ' + String(persistError?.message || persistError || 'No se pudo persistir mensaje saliente.'));
                    }
                });

                setImmediate(async () => {
                    try {
                        this.invalidateChatListCache();
                        const chat = await waClient.client.getChatById(targetChatId);
                        const summary = await this.toChatSummary(chat, {
                            includeHeavyMeta: false,
                            tenantId,
                            scopeModuleId: String(moduleContext?.moduleId || '').trim().toLowerCase() || '',
                            scopeModuleName: String(moduleContext?.name || '').trim() || null,
                            scopeModuleImageUrl: String(moduleContext?.imageUrl || moduleContext?.logoUrl || '').trim() || null,
                            scopeChannelType: String(moduleContext?.channelType || '').trim().toLowerCase() || null,
                            scopeTransport: String(moduleContext?.transportMode || '').trim().toLowerCase() || null
                        });
                        if (summary) this.emitToRuntimeContext('chat_updated', summary);
                    } catch (_) { }
                });
            };
            const resolveScopedSendTarget = async ({ rawChatId = '', rawPhone = '', errorEvent = 'error', action = 'enviar mensajes' } = {}) => {
                const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const scopedTarget = resolveScopedChatTarget(String(rawChatId || '').trim(), selectedScopeModuleId);
                let scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                let moduleContext = socket?.data?.waModule || null;

                if (scopeModuleId) {
                    const currentModuleId = normalizeScopedModuleId(moduleContext?.moduleId || socket?.data?.waModuleId || '');
                    if (!currentModuleId || currentModuleId !== scopeModuleId) {
                        const moduleContextPayload = await resolveSocketModuleContext(tenantId, authContext, scopeModuleId);
                        moduleContext = moduleContextPayload?.selected || null;
                        const resolvedModuleId = normalizeScopedModuleId(moduleContext?.moduleId || '');
                        if (!resolvedModuleId || resolvedModuleId !== scopeModuleId) {
                            socket.emit(errorEvent, 'No tienes acceso al modulo solicitado para ' + action + '.');
                            return { ok: false };
                        }
                        await transportOrchestrator.ensureTransportForSelectedModule(moduleContext);
                    }
                }

                if (!scopeModuleId) {
                    scopeModuleId = normalizeScopedModuleId(moduleContext?.moduleId || socket?.data?.waModuleId || '');
                }

                const runtime = this.getWaRuntime();
                const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
                const targetPhone = coerceHumanPhone(rawPhone || '');
                let targetChatId = String(scopedTarget.baseChatId || '').trim();

                if (activeTransport === 'cloud') {
                    const resolvedCloudChatId = resolveCloudDestinationChatId(targetChatId, targetPhone);
                    if (!resolvedCloudChatId) {
                        socket.emit(errorEvent, 'No se pudo resolver un numero WhatsApp valido para este chat en Cloud API. Abre chat por numero real.');
                        return { ok: false };
                    }
                    targetChatId = resolvedCloudChatId;
                }

                if (!targetChatId) {
                    socket.emit(errorEvent, 'Datos invalidos para ' + action + '.');
                    return { ok: false };
                }

                return {
                    ok: true,
                    activeTransport,
                    targetPhone,
                    targetChatId,
                    moduleContext,
                    scopeModuleId,
                    scopedChatId: buildScopedChatId(targetChatId, scopeModuleId || '')
                };
            };

            socket.on('send_message', async ({ to, toPhone, body, quotedMessageId }) => {
                if (!guardRateLimit(socket, 'send_message')) return;
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar mensajes', errorEvent: 'error' })) return;
                try {
                    const text = String(body || '');
                    const quoted = String(quotedMessageId || '').trim();
                    if (!text.trim()) {
                        socket.emit('error', 'Datos invalidos para enviar mensaje.');
                        return;
                    }

                    const target = await resolveScopedSendTarget({
                        rawChatId: to,
                        rawPhone: toPhone,
                        errorEvent: 'error',
                        action: 'enviar mensajes'
                    });
                    if (!target?.ok) return;

                    const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                    let sentMessage = null;

                    if (quoted) {
                        let quotedTargetChatId = target.targetChatId;
                        try {
                            const quotedMsg = await waClient.getMessageById(quoted);
                            const fromQuoted = String(quotedMsg?.fromMe ? quotedMsg?.to : quotedMsg?.from || '').trim();
                            if (fromQuoted && isVisibleChatId(fromQuoted)) {
                                quotedTargetChatId = String(parseScopedChatId(fromQuoted).chatId || fromQuoted).trim();
                            }
                            if (target.activeTransport === 'cloud' && isLidIdentifier(quotedTargetChatId)) {
                                quotedTargetChatId = target.targetChatId;
                            }
                        } catch (resolveQuotedError) {
                        }

                        try {
                            sentMessage = await waClient.sendMessage(quotedTargetChatId, text, { quotedMessageId: quoted });
                        } catch (sendWithQuoteError) {
                            sentMessage = await waClient.replyToMessage(quotedTargetChatId, quoted, text);
                        }
                    } else {
                        sentMessage = await waClient.sendMessage(target.targetChatId, text);
                    }

                    const sentMessageId = getSerializedMessageId(sentMessage);
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }

                    await emitRealtimeOutgoingMessage({
                        sentMessage,
                        fallbackChatId: target.targetChatId,
                        fallbackBody: text,
                        quotedMessageId: quoted,
                        moduleContext,
                        agentMeta,
                        mediaPayload: null
                    });

                    await recordConversationEvent({
                        chatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId,
                        eventType: 'chat.message.outgoing.text',
                        eventSource: 'socket',
                        payload: {
                            messageId: sentMessageId || null,
                            quotedMessageId: quoted || null,
                            length: text.length,
                            hasQuote: Boolean(quoted)
                        }
                    });
                } catch (e) {
                    const detail = String(e?.message || e || 'Failed to send message.');
                    console.warn('[WA][SendMessage] ' + detail);
                    socket.emit('error', detail);
                }
            });
            socket.on('edit_message', async ({ chatId, messageId, body }) => {
                if (!guardRateLimit(socket, 'edit_message')) return;
                if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'edit_message_error', action: 'editar mensajes' })) return;
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'editar mensajes', errorEvent: 'edit_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageEdit) {
                    socket.emit('edit_message_error', 'La edicion de mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const targetChatId = String(chatId || '').trim();
                    const targetMessageId = String(messageId || '').trim();
                    const nextBody = String(body || '').trim();

                    if (!targetChatId || !targetMessageId || !nextBody) {
                        socket.emit('edit_message_error', 'Datos invalidos para editar el mensaje.');
                        return;
                    }

                    const chat = await waClient.client.getChatById(targetChatId);
                    const candidates = await chat.fetchMessages({ limit: 150 });
                    const targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId);
                    if (!targetMessage) {
                        socket.emit('edit_message_error', 'No se encontro el mensaje para editar.');
                        return;
                    }

                    if (!targetMessage.fromMe) {
                        socket.emit('edit_message_error', 'Solo puedes editar mensajes enviados por ti.');
                        return;
                    }

                    if (typeof targetMessage.edit !== 'function') {
                        socket.emit('edit_message_error', 'Esta version de WhatsApp Web no permite editar mensajes por API.');
                        return;
                    }


                    const canEditNow = await waClient.canEditMessageById(targetMessageId);
                    if (!canEditNow) {
                        socket.emit('edit_message_error', 'WhatsApp no permite editar este mensaje (tipo o tiempo).');
                        return;
                    }

                    const editedMessage = await targetMessage.edit(nextBody);
                    if (!editedMessage) {
                        socket.emit('edit_message_error', 'WhatsApp no permitio editar el mensaje.');
                        return;
                    }

                    this.emitMessageEditability(targetMessageId, targetChatId);
                    await authzAudit.auditSocketAction('message.edited', {
                        resourceType: 'message',
                        resourceId: targetMessageId,
                        payload: { chatId: targetChatId }
                    });
                } catch (e) {
                    const detail = String(e?.message || '').toLowerCase();
                    if (detail.includes('revoke') || detail.includes('time') || detail.includes('edit')) {
                        socket.emit('edit_message_error', 'No se pudo editar: WhatsApp puede limitar la edicion por tiempo.');
                    } else {
                        socket.emit('edit_message_error', 'No se pudo editar el mensaje.');
                    }
                }
            });
            socket.on('send_media_message', async (data) => {
                if (!guardRateLimit(socket, 'send_media_message')) return;
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar adjuntos', errorEvent: 'error' })) return;
                try {
                    const { to, toPhone, body, mediaData, mimetype, filename, isPtt, quotedMessageId } = data || {};
                    if (isPtt) {
                        socket.emit('error', 'El envio de notas de voz esta deshabilitado temporalmente.');
                        return;
                    }

                    const caption = String(body || '');
                    const quoted = String(quotedMessageId || '').trim();
                    if (!String(mediaData || '').trim()) {
                        socket.emit('error', 'Datos invalidos para enviar adjunto.');
                        return;
                    }

                    const target = await resolveScopedSendTarget({
                        rawChatId: to,
                        rawPhone: toPhone,
                        errorEvent: 'error',
                        action: 'enviar adjuntos'
                    });
                    if (!target?.ok) return;

                    const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                    const sentMessage = await waClient.sendMedia(target.targetChatId, mediaData, mimetype, filename, caption, isPtt, quoted || null);
                    const sentMessageId = getSerializedMessageId(sentMessage);
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }

                    await emitRealtimeOutgoingMessage({
                        sentMessage,
                        fallbackChatId: target.targetChatId,
                        fallbackBody: caption,
                        quotedMessageId: quoted,
                        moduleContext,
                        agentMeta,
                        mediaPayload: {
                            data: String(mediaData || ''),
                            mimetype: String(mimetype || '').trim() || null,
                            filename: String(filename || '').trim() || null,
                            fileSizeBytes: null
                        }
                    });
                    await recordConversationEvent({
                        chatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId,
                        eventType: 'chat.message.outgoing.media',
                        eventSource: 'socket',
                        payload: {
                            messageId: sentMessageId || null,
                            quotedMessageId: quoted || null,
                            mimetype: String(mimetype || '').trim() || null,
                            filename: String(filename || '').trim() || null,
                            hasCaption: Boolean(caption.trim())
                        }
                    });
                } catch (e) {
                    const detail = String(e?.message || e || 'Failed to send media.');
                    console.warn('[WA][SendMedia] ' + detail);
                    socket.emit('error', detail);
                }
            });

            socket.on('forward_message', async ({ messageId, toChatId }) => {
                if (!guardRateLimit(socket, 'forward_message')) return;
                if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'forward_message_error', action: 'reenviar mensajes' })) return;
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'reenviar mensajes', errorEvent: 'forward_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageForward) {
                    socket.emit('forward_message_error', 'Reenviar mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const sourceMessageId = String(messageId || '').trim();
                    const targetChatId = String(toChatId || '').trim();
                    if (!sourceMessageId || !targetChatId) {
                        socket.emit('forward_message_error', 'Datos invalidos para reenviar.');
                        return;
                    }

                    await waClient.forwardMessage(sourceMessageId, targetChatId);
                    socket.emit('message_forwarded', {
                        messageId: sourceMessageId,
                        toChatId: targetChatId
                    });
                    await authzAudit.auditSocketAction('message.forwarded', {
                        resourceType: 'message',
                        resourceId: sourceMessageId,
                        payload: { toChatId: targetChatId }
                    });
                } catch (e) {
                    socket.emit('forward_message_error', 'No se pudo reenviar el mensaje en esta version de WhatsApp.');
                }
            });

            socket.on('delete_message', async ({ chatId, messageId }) => {
                if (!guardRateLimit(socket, 'delete_message')) return;
                if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'delete_message_error', action: 'eliminar mensajes' })) return;
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'eliminar mensajes', errorEvent: 'delete_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageDelete) {
                    socket.emit('delete_message_error', 'Eliminar mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const targetMessageId = String(messageId || '').trim();
                    const incomingChatId = String(chatId || '').trim();
                    if (!targetMessageId) {
                        socket.emit('delete_message_error', 'Datos invalidos para eliminar mensaje.');
                        return;
                    }

                    let targetMessage = await waClient.getMessageById(targetMessageId);
                    if ((!targetMessage || typeof targetMessage.delete !== 'function')) {
                        const safeChatId = incomingChatId;
                        if (!safeChatId) {
                            if (!targetMessage) {
                                socket.emit('delete_message_error', 'No se encontro el chat del mensaje.');
                                return;
                            }
                        } else {
                            const chat = await waClient.client.getChatById(safeChatId);
                            const candidates = await chat.fetchMessages({ limit: 250 });
                            targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId) || targetMessage;
                        }
                    }

                    if (!targetMessage) {
                        socket.emit('delete_message_error', 'No se encontro el mensaje para eliminar.');
                        return;
                    }

                    if (typeof targetMessage.delete !== 'function') {
                        socket.emit('delete_message_error', 'Esta version no permite eliminar mensajes por API.');
                        return;
                    }

                    const targetChatId = String(incomingChatId || (targetMessage.fromMe ? targetMessage.to : targetMessage.from) || '').trim();
                    const attemptDeleteForEveryone = Boolean(targetMessage.fromMe);

                    try {
                        await targetMessage.delete(attemptDeleteForEveryone);
                    } catch (deleteErr) {
                        if (!attemptDeleteForEveryone) throw deleteErr;
                        // Fallback to local delete when revoke-for-everyone is no longer allowed.
                        await targetMessage.delete(false);
                    }

                    this.io.emit('message_deleted', {
                        chatId: targetChatId,
                        messageId: targetMessageId
                    });
                    await authzAudit.auditSocketAction('message.deleted', {
                        resourceType: 'message',
                        resourceId: targetMessageId,
                        payload: { chatId: targetChatId }
                    });
                } catch (e) {
                    socket.emit('delete_message_error', 'No se pudo eliminar el mensaje.');
                }
            });
            socket.on('send_catalog_product', async (payload = {}) => {
                if (!guardRateLimit(socket, 'send_catalog_product')) return;
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar productos de catalogo', errorEvent: 'error' })) return;
                const catalogEnabled = await this.isFeatureEnabledForTenant(tenantId, 'catalog');
                if (!catalogEnabled) {
                    socket.emit('error', 'Catalogo deshabilitado para esta empresa o plan.');
                    return;
                }
                try {
                    const target = await resolveScopedSendTarget({
                        rawChatId: payload?.to,
                        rawPhone: payload?.toPhone,
                        errorEvent: 'error',
                        action: 'enviar productos de catalogo'
                    });
                    if (!target?.ok) return;

                    const product = payload?.product && typeof payload.product === 'object' ? payload.product : {};
                    const caption = buildCatalogProductCaption(product);
                    const imageUrl = String(product?.imageUrl || product?.image || '').trim();
                    const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));

                    let sentWithImage = false;
                    let sentResponse = null;
                    let catalogMediaPayload = null;
                    if (imageUrl) {
                        const maxCatalogImageBytes = Number(process.env.CATALOG_IMAGE_MAX_BYTES || 4 * 1024 * 1024);
                        const media = await fetchCatalogProductImage(imageUrl, {
                            maxBytes: maxCatalogImageBytes,
                            timeoutMs: Number(process.env.CATALOG_IMAGE_TIMEOUT_MS || 7000)
                        });
                        const compatibleMedia = await ensureCloudApiCompatibleCatalogImage(media, {
                            maxBytes: maxCatalogImageBytes
                        });

                        if (compatibleMedia) {
                            const baseName = slugifyFileName(product?.title || product?.name || 'producto');
                            const filename = String(baseName || 'producto') + '.' + String(compatibleMedia.extension || 'jpg');
                            sentResponse = await waClient.sendMedia(
                                target.targetChatId,
                                compatibleMedia.mediaData,
                                compatibleMedia.mimetype,
                                filename,
                                caption,
                                false
                            );
                            sentWithImage = true;
                            catalogMediaPayload = {
                                mimetype: compatibleMedia.mimetype,
                                filename,
                                fileSizeBytes: Number(compatibleMedia?.fileSizeBytes || 0) || null,
                                mediaUrl: String(compatibleMedia?.publicUrl || compatibleMedia?.sourceUrl || imageUrl || '').trim() || null,
                                mediaPath: String(compatibleMedia?.relativePath || '').trim() || null
                            };
                        } else if (media?.mimetype) {
                            console.warn('[WA][SendCatalogProduct] media no compatible para Cloud API (' + String(media.mimetype) + '), se enviara solo texto.');
                        }
                    }

                    if (!sentWithImage) {
                        sentResponse = await waClient.sendMessage(target.targetChatId, caption);
                    }


                    const sentMessageId = getSerializedMessageId(sentResponse)
                        || String(sentResponse?.messages?.[0]?.id || sentResponse?.message_id || '').trim();
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }
                    await emitRealtimeOutgoingMessage({
                        sentMessage: sentResponse || {
                            id: sentMessageId ? { _serialized: sentMessageId } : null,
                            to: target.targetChatId,
                            body: caption,
                            fromMe: true,
                            timestamp: Math.floor(Date.now() / 1000),
                            ack: 1,
                            hasMedia: sentWithImage,
                            type: sentWithImage ? 'image' : 'chat'
                        },
                        fallbackChatId: target.targetChatId,
                        fallbackBody: caption,
                        moduleContext,
                        agentMeta,
                        mediaPayload: catalogMediaPayload
                    });
                    await recordConversationEvent({
                        chatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId,
                        eventType: 'chat.message.outgoing.catalog_product',
                        eventSource: 'socket',
                        payload: {
                            messageId: sentMessageId || null,
                            productId: String(product?.id || product?.productId || '').trim() || null,
                            productTitle: String(product?.title || product?.name || '').trim() || null,
                            withImage: sentWithImage,
                            mediaUrl: String(catalogMediaPayload?.mediaUrl || '').trim() || null,
                            catalogId: String(product?.catalogId || '').trim() || null
                        }
                    });

                    socket.emit('catalog_product_sent', {
                        to: target.scopedChatId || target.targetChatId,
                        baseChatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId || null,
                        title: String(product?.title || product?.name || 'Producto'),
                        withImage: sentWithImage
                    });
                } catch (e) {
                    const detail = String(e?.message || e || 'No se pudo enviar el producto del catalogo.');
                    console.warn('[WA][SendCatalogProduct] ' + detail);
                    socket.emit('error', detail);
                }
            });

            socket.on('mark_chat_read', async (chatId) => {
                try {
                    const requestedChatId = String(chatId || '').trim();
                    if (!requestedChatId) return;
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedTarget = resolveScopedChatTarget(requestedChatId, selectedScopeModuleId);
                    const safeChatId = String(scopedTarget.baseChatId || '').trim();
                    if (!safeChatId) return;
                    await waClient.markAsRead(safeChatId);
                } catch (e) { }
            });

            // --- AI ---
            socket.on('get_ai_chat_history', async (payload = {}) => {
                try {
                    const safePayload = payload && typeof payload === 'object'
                        ? payload
                        : { chatId: String(payload || '').trim() };
                    const requestSeq = Number(safePayload?.requestSeq || 0) || null;
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const historyScope = resolveAiHistoryScope({
                        chatId: safePayload.chatId || safePayload.scopeChatId || safePayload.scopedChatId || '',
                        scopeModuleId: safePayload.scopeModuleId || safePayload.moduleId || selectedScopeModuleId || '',
                        runtimeContext: safePayload.runtimeContext && typeof safePayload.runtimeContext === 'object'
                            ? safePayload.runtimeContext
                            : null
                    }, selectedScopeModuleId);

                    if (!historyScope.scopeChatId) {
                        socket.emit('ai_chat_history', {
                            requestSeq,
                            scopeChatId: null,
                            baseChatId: null,
                            scopeModuleId: historyScope.scopeModuleId || null,
                            items: []
                        });
                        return;
                    }

                    const rawLimit = Number(safePayload.limit || 80);
                    const limit = Number.isFinite(rawLimit)
                        ? Math.min(200, Math.max(20, Math.floor(rawLimit)))
                        : 80;

                    const items = await aiChatHistoryService.listEntries(tenantId, {
                        scopeChatId: historyScope.scopeChatId,
                        limit,
                        beforeTimestamp: Number(safePayload.beforeTimestamp || 0) || null
                    });

                    socket.emit('ai_chat_history', {
                        requestSeq,
                        scopeChatId: historyScope.scopeChatId,
                        baseChatId: historyScope.baseChatId || null,
                        scopeModuleId: historyScope.scopeModuleId || null,
                        items: Array.isArray(items) ? items : []
                    });
                } catch (error) {
                    socket.emit('ai_chat_history', {
                        requestSeq: Number(payload?.requestSeq || 0) || null,
                        scopeChatId: null,
                        baseChatId: null,
                        scopeModuleId: null,
                        items: [],
                        error: 'No se pudo cargar historial IA.'
                    });
                }
            });
            socket.on('request_ai_suggestion', (payload) => {
                if (!guardRateLimit(socket, 'request_ai_suggestion')) return;
                const { contextText, customPrompt, businessContext, moduleId, runtimeContext } = payload || {};
                // Defer to avoid blocking the event loop (prevents 'click handler took Xms' violations)
                setImmediate(async () => {
                    try {
                        const quota = await this.reserveAiQuota(tenantId, { socket });
                        if (!quota?.ok) {
                            socket.emit('ai_suggestion_complete');
                            return;
                        }

                        const requestedModuleId = normalizeSocketModuleId(moduleId || '');
                        let aiModuleContext = socket?.data?.waModule || null;
                        const activeModuleId = normalizeSocketModuleId(aiModuleContext?.moduleId || socket?.data?.waModuleId || '');
                        if (requestedModuleId && requestedModuleId !== activeModuleId) {
                            const contextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId).catch(() => null);
                            if (contextPayload?.selected) {
                                aiModuleContext = contextPayload.selected;
                            }
                        }
                        const moduleAssistantId = String(aiModuleContext?.metadata?.moduleSettings?.aiAssistantId || '').trim().toUpperCase();
                        const safeRuntimeContext = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : null;
                        const aiText = await getChatSuggestion(contextText, customPrompt, (chunk) => {
                            socket.emit('ai_suggestion_chunk', chunk);
                        }, businessContext, {
                            tenantId,
                            moduleAssistantId,
                            runtimeContext: safeRuntimeContext,
                            moduleContext: aiModuleContext && typeof aiModuleContext === 'object' ? aiModuleContext : null
                        });
                        if (typeof aiText === 'string' && aiText.startsWith('Error IA:')) {
                            socket.emit('ai_error', aiText);
                        } else {
                            const historyScope = resolveAiHistoryScope({
                                chatId: safeRuntimeContext?.chat?.chatId || '',
                                scopeModuleId: safeRuntimeContext?.module?.moduleId || requestedModuleId || activeModuleId || '',
                                runtimeContext: safeRuntimeContext
                            }, normalizeSocketModuleId(aiModuleContext?.moduleId || requestedModuleId || activeModuleId || ''));
                            const suggestionPrompt = String(contextText || customPrompt || '').trim();
                            if (historyScope.scopeChatId && suggestionPrompt && String(aiText || '').trim()) {
                                try {
                                    await aiChatHistoryService.appendInteraction(tenantId, {
                                        scopeChatId: historyScope.scopeChatId,
                                        baseChatId: historyScope.baseChatId,
                                        scopeModuleId: historyScope.scopeModuleId,
                                        mode: 'suggestion',
                                        assistantId: moduleAssistantId || null,
                                        userId: String(authContext?.userId || authContext?.id || '').trim() || null,
                                        userName: String(authContext?.name || authContext?.displayName || authContext?.email || '').trim() || null,
                                        query: suggestionPrompt,
                                        response: String(aiText || '').trim(),
                                        runtimeContext: safeRuntimeContext
                                    });
                                } catch (_) { }
                            }
                        }
                        socket.emit('ai_suggestion_complete');
                    } catch (e) {
                        console.error('AI suggestion error:', e);
                        socket.emit('ai_error', 'Error IA: no se pudo generar sugerencia.');
                        socket.emit('ai_suggestion_complete');
                    }
                });
            });

            socket.on('internal_ai_query', (payload) => {
                if (!guardRateLimit(socket, 'internal_ai_query')) return;
                const { query, businessContext, moduleId, runtimeContext } = typeof payload === 'string'
                    ? { query: payload, businessContext: null, moduleId: '', runtimeContext: null }
                    : (payload || {});
                // Defer to avoid blocking the event loop
                setImmediate(async () => {
                    try {
                        const quota = await this.reserveAiQuota(tenantId, { socket });
                        if (!quota?.ok) {
                            socket.emit('internal_ai_complete');
                            return;
                        }

                        const requestedModuleId = normalizeSocketModuleId(moduleId || '');
                        let aiModuleContext = socket?.data?.waModule || null;
                        const activeModuleId = normalizeSocketModuleId(aiModuleContext?.moduleId || socket?.data?.waModuleId || '');
                        if (requestedModuleId && requestedModuleId !== activeModuleId) {
                            const contextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId).catch(() => null);
                            if (contextPayload?.selected) {
                                aiModuleContext = contextPayload.selected;
                            }
                        }
                        const moduleAssistantId = String(aiModuleContext?.metadata?.moduleSettings?.aiAssistantId || '').trim().toUpperCase();
                        const safeRuntimeContext = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : null;
                        const copilotText = await askInternalCopilot(query, (chunk) => {
                            socket.emit('internal_ai_chunk', chunk);
                        }, businessContext, {
                            tenantId,
                            moduleAssistantId,
                            runtimeContext: safeRuntimeContext,
                            moduleContext: aiModuleContext && typeof aiModuleContext === 'object' ? aiModuleContext : null
                        });
                        if (typeof copilotText === 'string' && copilotText.startsWith('Error IA:')) {
                            socket.emit('internal_ai_error', copilotText);
                        } else {
                            const historyScope = resolveAiHistoryScope({
                                chatId: safeRuntimeContext?.chat?.chatId || '',
                                scopeModuleId: safeRuntimeContext?.module?.moduleId || requestedModuleId || activeModuleId || '',
                                runtimeContext: safeRuntimeContext
                            }, normalizeSocketModuleId(aiModuleContext?.moduleId || requestedModuleId || activeModuleId || ''));
                            const cleanQuery = String(query || '').trim();
                            const cleanCopilotText = String(copilotText || '').trim();
                            if (historyScope.scopeChatId && cleanQuery && cleanCopilotText) {
                                try {
                                    await aiChatHistoryService.appendInteraction(tenantId, {
                                        scopeChatId: historyScope.scopeChatId,
                                        baseChatId: historyScope.baseChatId,
                                        scopeModuleId: historyScope.scopeModuleId,
                                        mode: 'copilot',
                                        assistantId: moduleAssistantId || null,
                                        userId: String(authContext?.userId || authContext?.id || '').trim() || null,
                                        userName: String(authContext?.name || authContext?.displayName || authContext?.email || '').trim() || null,
                                        query: cleanQuery,
                                        response: cleanCopilotText,
                                        runtimeContext: safeRuntimeContext
                                    });
                                } catch (_) { }
                            }
                        }
                        socket.emit('internal_ai_complete');
                    } catch (e) {
                        console.error('Copilot error:', e);
                        socket.emit('internal_ai_error', 'Error IA: no se pudo responder en copiloto.');
                        socket.emit('internal_ai_complete');
                    }
                });
            });
            socket.on('get_business_catalog', async ({ moduleId, catalogId, requestSeq } = {}) => {
                try {
                    const catalogScope = await resolveCatalogScope({
                        requestedModuleId: moduleId,
                        requestedCatalogId: catalogId
                    });
                    const scopedCatalog = await loadScopedLocalCatalog(catalogScope, {
                        requestedCatalogId: catalogId
                    });
                    socket.emit('business_data_catalog', {
                        scope: {
                            ...catalogScope,
                            catalogIds: scopedCatalog.selection.catalogIds,
                            catalogId: scopedCatalog.selection.primaryCatalogId,
                            catalogs: scopedCatalog.selection.catalogs || []
                        },
                        source: 'local',
                        requestSeq: Number(requestSeq || 0) || null,
                        items: scopedCatalog.items
                    });
                } catch (error) {
                    socket.emit('error', String(error?.message || 'No se pudo cargar el catalogo del modulo.'));
                }
            });

            socket.on('get_business_data', async (scopeRequest = {}) => {
                const requestSeq = scopeRequest && typeof scopeRequest === 'object'
                    ? (Number(scopeRequest?.requestSeq || 0) || null)
                    : null;
                try {
                    const requestedModuleId = scopeRequest && typeof scopeRequest === 'object' ? scopeRequest?.moduleId : '';
                    const requestedCatalogId = scopeRequest && typeof scopeRequest === 'object' ? scopeRequest?.catalogId : '';
                    const catalogScope = await resolveCatalogScope({
                        requestedModuleId,
                        requestedCatalogId
                    });
                    const requestedModuleScopeId = normalizeSocketModuleId(catalogScope?.moduleId || requestedModuleId);
                    const availableSocketModules = Array.isArray(socket?.data?.waModules) ? socket.data.waModules : [];
                    const selectedModuleContext = requestedModuleScopeId
                        ? (availableSocketModules.find((entry) => normalizeSocketModuleId(entry?.moduleId) === requestedModuleScopeId) || socket?.data?.waModule || null)
                        : (socket?.data?.waModule || null);
                    const resolvedCatalogSelection = await resolveCatalogSelection(catalogScope);

                    if (!transportOrchestrator.ensureTransportReady(socket, { action: 'cargar datos del negocio', errorEvent: 'error' })) {
                        const scopedLocalFallback = await loadScopedLocalCatalog(catalogScope);
                        socket.emit('business_data', {
                            profile: null,
                            labels: [],
                            catalog: scopedLocalFallback.items,
                            requestSeq,
                            catalogMeta: {
                                source: 'local',
                                nativeAvailable: false,
                                wooConfigured: false,
                                wooAvailable: false,
                                scope: {
                                    ...catalogScope,
                                    catalogIds: scopedLocalFallback.selection.catalogIds,
                                    catalogId: scopedLocalFallback.selection.primaryCatalogId
                                }
                            }
                        });
                        return;
                    }
                    const me = waClient.client.info;
                    const meId = me.wid._serialized;

                                        // Real profile from WA account info
                    let meContact = null;
                    let profilePicUrl = null;
                    let businessProfile = null;
                    let aboutStatus = null;
                    try {
                        if (meId) meContact = await waClient.client.getContactById(meId);
                    } catch (e) { }
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                            me?.wid?.user,
                            meContact?.id?._serialized,
                            meContact?.number
                        ]);
                    } catch (e) { }
                    try { businessProfile = await waClient.getBusinessProfile(meId); } catch (e) { }
                    try {
                        if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(meContact);
                    const profile = {
                        name: me?.pushname || meContact?.name || meContact?.pushname || 'Mi Negocio',
                        pushname: me?.pushname || meContact?.pushname || null,
                        shortName: meContact?.shortName || null,
                        verifiedName: meContact?._data?.verifiedName || null,
                        verifiedLevel: meContact?._data?.verifiedLevel || null,
                        phone: me?.wid?.user || meContact?.number || null,
                        id: meId || null,
                        platform: me?.platform || null,
                        isBusiness: Boolean(meContact?.isBusiness ?? true),
                        isEnterprise: Boolean(meContact?.isEnterprise),
                        isMyContact: Boolean(meContact?.isMyContact),
                        isMe: Boolean(meContact?.isMe ?? true),
                        isWAContact: Boolean(meContact?.isWAContact ?? true),
                        status: aboutStatus || null,
                        profilePicUrl,
                        businessHours: businessDetails?.businessHours || null,
                        category: businessDetails?.category || null,
                        email: businessDetails?.email || null,
                        website: businessDetails?.website || null,
                        websites: businessDetails?.websites || [],
                        address: businessDetails?.address || null,
                        description: businessDetails?.description || null,
                        businessDetails,
                        whatsappInfo: snapshotSerializable(me),
                        contactSnapshot
                    };

                    // Labels desde store tenant (Postgres/file), no desde WhatsApp Web.
                    let labels = [];
                    try {
                        labels = await tenantLabelService.listLabels({ tenantId, includeInactive: false });
                        profile.labelsCount = Array.isArray(labels) ? labels.length : 0;
                    } catch (e) {
                        labels = [];
                    }

                    const tenantSettings = await tenantSettingsService.getTenantSettings(tenantId);
                    const tenantIntegrations = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
                    const activeCatalogId = normalizeSocketCatalogId(catalogScope?.catalogId || resolvedCatalogSelection?.primaryCatalogId || '');
                    const activeCatalogConfig = (Array.isArray(resolvedCatalogSelection?.catalogs) ? resolvedCatalogSelection.catalogs : [])
                        .find((entry) => normalizeSocketCatalogId(entry?.catalogId) === activeCatalogId) || null;
                    const activeCatalogSourceType = String(activeCatalogConfig?.sourceType || '').trim().toLowerCase();

                    const moduleCatalogMode = String(selectedModuleContext?.metadata?.moduleSettings?.catalogMode || '').trim().toLowerCase();
                    const configuredCatalogMode = String(tenantIntegrations?.catalog?.mode || tenantSettings?.catalogMode || 'hybrid').trim().toLowerCase();
                    const forcedCatalogMode = activeCatalogSourceType === 'local'
                        ? 'local_only'
                        : (activeCatalogSourceType === 'woocommerce'
                            ? 'woo_only'
                            : (activeCatalogSourceType === 'meta' ? 'meta_only' : ''));
                    const catalogMode = forcedCatalogMode
                        || (moduleCatalogMode && moduleCatalogMode !== 'inherit'
                            ? moduleCatalogMode
                            : configuredCatalogMode);

                    const wooConfig = {
                        ...(tenantIntegrations?.catalog?.providers?.woocommerce || {}),
                        enabled: tenantIntegrations?.catalog?.providers?.woocommerce?.enabled !== false
                    };
                    const wooConfigured = isWooConfigured(wooConfig);
                    const tenantPlan = tenantService.findTenantById(tenantId) || tenantService.DEFAULT_TENANT;
                    const catalogEnabled = planLimitsService.isFeatureEnabledForTenant('catalog', tenantPlan, tenantSettings);
                    if (!catalogEnabled) {
                        socket.emit('business_data', {
                            profile,
                            labels,
                            catalog: [],
                            catalogMeta: {
                                source: 'disabled',
                                mode: catalogMode,
                                selectedCatalogSource: activeCatalogSourceType || null,
                                nativeAvailable: false,
                                wooConfigured,
                                wooAvailable: false,
                                disabledReason: 'catalog_module_disabled',
                                categories: []
                            },
                            tenantSettings,
                            integrations: tenantIntegrations
                        });
                        return;
                    }

                    let catalog = [];
                    let catalogMeta = {
                        source: 'native',
                        mode: catalogMode,
                        selectedCatalogSource: activeCatalogSourceType || null,
                        nativeAvailable: false,
                        wooConfigured,
                        wooAvailable: false,
                        wooSource: null,
                        wooStatus: null,
                        wooReason: null
                    };

                    const enableNative = catalogMode === 'hybrid' || catalogMode === 'meta_only';
                    const enableWoo = catalogMode === 'hybrid' || catalogMode === 'woo_only';
                    const enableLocal = catalogMode === 'hybrid' || catalogMode === 'local_only';
                    let scopedLocalCatalogResult = null;
                    // En modo hibrido priorizamos catalogo local del modulo si existe.
                    // Esto evita que Woo/Meta pisen catalogos separados por modulo.
                    if (enableLocal) {
                        scopedLocalCatalogResult = await loadScopedLocalCatalog(catalogScope);
                        const localCatalog = scopedLocalCatalogResult.items;
                        if (Array.isArray(localCatalog) && localCatalog.length > 0) {
                            catalog = localCatalog;
                            catalogMeta = {
                                ...catalogMeta,
                                source: 'local',
                                nativeAvailable: false,
                                wooConfigured,
                                wooAvailable: false,
                                scope: {
                                    ...catalogScope,
                                    catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                                    catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                                    catalogs: scopedLocalCatalogResult.selection.catalogs || []
                                }
                            };
                        }
                    }
                    if (!catalog.length && enableNative) {
                        try {
                            const nativeProducts = await waClient.getCatalog(meId);
                            if (nativeProducts && nativeProducts.length > 0) {
                                catalog = nativeProducts.map((p) => ({
                                    id: p.id,
                                    title: p.name,
                                    price: p.price ? Number.parseFloat(String(p.price)).toFixed(2) : '0.00',
                                    description: p.description,
                                    imageUrl: p.imageUrls ? p.imageUrls[0] : null,
                                    source: 'meta'
                                }));
                                catalogMeta = {
                                    ...catalogMeta,
                                    source: 'meta',
                                    nativeAvailable: true,
                                    wooAvailable: false
                                };
                            }
                        } catch (_) {
                            // noop
                        }
                    }

                    if (!catalog.length && enableWoo) {
                        const wooResult = await getWooCatalog({ config: wooConfig });
                        if (wooResult.products.length > 0) {
                            catalog = wooResult.products;
                            catalogMeta = {
                                ...catalogMeta,
                                source: 'woocommerce',
                                nativeAvailable: false,
                                wooAvailable: true,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                        } else {
                            catalogMeta = {
                                ...catalogMeta,
                                wooConfigured,
                                wooAvailable: false,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                        }
                    }

                    if (!catalog.length && enableLocal) {
                        if (!scopedLocalCatalogResult) {
                            scopedLocalCatalogResult = await loadScopedLocalCatalog(catalogScope);
                        }
                        catalog = scopedLocalCatalogResult.items;
                        catalogMeta = {
                            ...catalogMeta,
                            source: 'local',
                            nativeAvailable: false,
                            wooConfigured,
                            wooAvailable: false,
                            scope: {
                                ...catalogScope,
                                catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                                catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                                    catalogs: scopedLocalCatalogResult.selection.catalogs || []
                                }
                        };
                    }

                    const catalogCategories = Array.from(new Set(
                        (catalog || [])
                            .flatMap((item) => extractCatalogItemCategories(item))
                            .map((entry) => String(entry || '').trim())
                            .filter(Boolean)
                    )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
                    const resolvedScope = scopedLocalCatalogResult?.selection
                        ? {
                            ...catalogScope,
                            catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                            catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                                    catalogs: scopedLocalCatalogResult.selection.catalogs || []
                                }
                        : {
                            ...catalogScope,
                            catalogIds: resolvedCatalogSelection.catalogIds,
                            catalogId: resolvedCatalogSelection.primaryCatalogId,
                            catalogs: resolvedCatalogSelection.catalogs || []
                        };
                    catalogMeta = {
                        ...catalogMeta,
                        categories: catalogCategories,
                        scope: resolvedScope
                    };
                    logCatalogDebugSnapshot({ catalog, catalogMeta });
                    socket.emit('business_data', { profile, labels, catalog, catalogMeta, tenantSettings, integrations: tenantIntegrations, requestSeq });
                } catch (e) {
                    console.error('Error fetching business data:', e);
                    const fallbackCatalogScope = getActiveCatalogScope();
                    const fallbackCatalog = await loadScopedLocalCatalog(fallbackCatalogScope);
                    socket.emit('business_data', {
                        profile: null,
                        labels: [],
                        catalog: fallbackCatalog.items,
                        requestSeq,
                        catalogMeta: {
                            source: 'local',
                            mode: 'hybrid',
                            nativeAvailable: false,
                            wooConfigured: false,
                            wooAvailable: false,
                            wooSource: null,
                            wooStatus: 'error',
                            wooReason: 'Error al obtener datos de negocio',
                            scope: {
                                ...fallbackCatalogScope,
                                catalogIds: fallbackCatalog.selection.catalogIds,
                                catalogId: fallbackCatalog.selection.primaryCatalogId,
                                catalogs: fallbackCatalog.selection.catalogs || []
                            }
                        },
                        tenantSettings: await tenantSettingsService.getTenantSettings(tenantId),
                        integrations: await tenantIntegrationsService.getTenantIntegrations(tenantId)
                    });
                }
            });

            // --- Catalog CRUD ---
            socket.on('add_product', async () => {
                socket.emit('error', 'La edicion de productos desde chat esta deshabilitada. Gestiona el catalogo desde Panel SaaS.');
            });

            socket.on('update_product', async () => {
                socket.emit('error', 'La edicion de productos desde chat esta deshabilitada. Gestiona el catalogo desde Panel SaaS.');
            });

            socket.on('delete_product', async () => {
                socket.emit('error', 'La edicion de productos desde chat esta deshabilitada. Gestiona el catalogo desde Panel SaaS.');
            });
            socket.on('get_my_profile', async () => {
                try {
                    if (!transportOrchestrator.ensureTransportReady(socket, { action: 'cargar perfil de empresa', errorEvent: 'error' })) {
                        socket.emit('my_profile', null);
                        return;
                    }
                    const me = waClient.client.info || {};
                    const meId = me?.wid?._serialized || null;
                    let meContact = null;
                    let profilePicUrl = null;
                    let businessProfile = null;
                    let aboutStatus = null;

                    try {
                        if (meId) meContact = await waClient.client.getContactById(meId);
                    } catch (e) { }
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                            me?.wid?.user,
                            meContact?.id?._serialized,
                            meContact?.number
                        ]);
                    } catch (e) { }
                    try {
                        businessProfile = await waClient.getBusinessProfile(meId);
                    } catch (e) { }
                    try {
                        if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(meContact);

                    socket.emit('my_profile', {
                        name: me?.pushname || meContact?.name || meContact?.pushname || null,
                        pushname: me?.pushname || meContact?.pushname || null,
                        shortName: meContact?.shortName || null,
                        verifiedName: meContact?._data?.verifiedName || null,
                        verifiedLevel: meContact?._data?.verifiedLevel || null,
                        phone: me?.wid?.user || meContact?.number || null,
                        id: meId,
                        platform: me?.platform || null,
                        profilePicUrl,
                        status: aboutStatus || null,
                        isBusiness: Boolean(meContact?.isBusiness ?? true),
                        isEnterprise: Boolean(meContact?.isEnterprise),
                        isMyContact: Boolean(meContact?.isMyContact),
                        isMe: Boolean(meContact?.isMe ?? true),
                        isWAContact: Boolean(meContact?.isWAContact ?? true),
                        category: businessDetails?.category || null,
                        email: businessDetails?.email || null,
                        website: businessDetails?.website || null,
                        websites: businessDetails?.websites || [],
                        address: businessDetails?.address || null,
                        description: businessDetails?.description || null,
                        businessHours: businessDetails?.businessHours || null,
                        businessDetails,
                        whatsappInfo: snapshotSerializable(me),
                        contactSnapshot
                    });
                } catch (e) {
                    console.error('Error fetching my profile:', e);
                }
            });

            socket.on('get_contact_info', async (contactId) => {
                try {
                    if (!transportOrchestrator.ensureTransportReady(socket, { action: 'cargar perfil de contacto', errorEvent: 'error' })) {
                        return;
                    }
                    const requestedContactId = String(contactId || '').trim();
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedContactTarget = resolveScopedChatTarget(requestedContactId, selectedScopeModuleId);
                    const safeContactId = String(scopedContactTarget.baseChatId || '').trim();
                    if (!safeContactId) return;

                    const contact = await waClient.client.getContactById(safeContactId);
                    let chat = null;
                    let profilePicUrl = null;
                    let status = null;
                    let businessProfile = null;

                    try {
                        chat = await waClient.client.getChatById(safeContactId);
                    } catch (e) { }

                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, safeContactId, [
                            contact?.id?._serialized,
                            contact?.number,
                            contact?.number ? `${contact.number}@c.us` : null,
                            chat?.id?._serialized,
                            chat?.contact?.id?._serialized
                        ]);
                    } catch (e) { }
                    try {
                        const statusObj = await contact.getAbout();
                        status = statusObj;
                    } catch (e) { }
                    try {
                        if (contact?.isBusiness) {
                            businessProfile = await waClient.getBusinessProfile(safeContactId);
                        }
                    } catch (e) { }

                    let labels = [];
                    try {
                        labels = await tenantLabelService.listChatLabels({
                            tenantId,
                            chatId: safeContactId,
                            scopeModuleId: String(scopedContactTarget?.moduleId || '').trim().toLowerCase(),
                            includeInactive: false
                        });
                    } catch (e) { }

                    const isGroupChat = safeContactId.includes('@g.us') || Boolean(contact?.isGroup) || Boolean(chat?.isGroup);
                    let groupParticipants = [];
                    if (isGroupChat) {
                        groupParticipants = extractGroupParticipants(chat);
                        if (groupParticipants.length === 0) {
                            groupParticipants = await fetchGroupParticipantsFromStore(waClient.client, safeContactId);
                        }
                        groupParticipants = await hydrateGroupParticipantsWithContacts(waClient.client, groupParticipants);
                    }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(contact);
                    const chatSnapshot = extractChatSnapshot(chat);
                    const participantsCount = isGroupChat
                        ? (groupParticipants.length || Number(chatSnapshot?.participantsCount || 0) || 0)
                        : (chatSnapshot?.participantsCount ?? null);
                    const hydratedChatSnapshot = chatSnapshot
                        ? { ...chatSnapshot, participantsCount }
                        : null;

                    socket.emit('contact_info', {
                        id: scopedContactTarget.scopedChatId || buildScopedChatId(safeContactId, scopedContactTarget.moduleId || ''),
                        baseChatId: safeContactId,
                        scopeModuleId: scopedContactTarget.moduleId || null,
                        name: contact?.name || contact?.pushname || contact?.number || null,
                        phone: contact?.number || null,
                        number: contact?.number || null,
                        user: contact?.id?.user || null,
                        server: contact?.id?.server || null,
                        pushname: contact?.pushname || null,
                        shortName: contact?.shortName || null,
                        verifiedName: contact?._data?.verifiedName || null,
                        verifiedLevel: contact?._data?.verifiedLevel || null,
                        profilePicUrl,
                        hasProfilePic: Boolean(profilePicUrl),
                        status,
                        isBusiness: Boolean(contact?.isBusiness),
                        isEnterprise: Boolean(contact?.isEnterprise),
                        isMyContact: Boolean(contact?.isMyContact),
                        isWAContact: Boolean(contact?.isWAContact),
                        isBlocked: Boolean(contact?.isBlocked),
                        isMe: Boolean(contact?.isMe),
                        isUser: Boolean(contact?.isUser),
                        isGroup: isGroupChat,
                        isPSA: Boolean(contact?.isPSA),
                        participants: participantsCount,
                        participantsList: isGroupChat ? groupParticipants : [],
                        labels,
                        chatState: hydratedChatSnapshot,
                        businessDetails,
                        contactSnapshot,
                        raw: {
                            contact: contactSnapshot?.rawData || null,
                            chat: hydratedChatSnapshot?.rawData || null,
                            business: businessDetails?.raw || null
                        }
                    });
                } catch (e) {
                    console.error('Error fetching contact info:', e);
                }
            });

            socket.on('logout_whatsapp', async () => {
                if (!authzAudit.requireRole(['owner', 'admin'], { errorEvent: 'error', action: 'cerrar sesion de WhatsApp' })) return;
                try {
                    await waClient.client.logout();
                } catch (e) {
                    console.error('logout_whatsapp error:', e.message);
                }
                try {
                    waClient.isReady = false;
                    await waClient.initialize();
                } catch (e) {
                    console.error('reinitialize after logout failed:', e.message);
                }
                socket.emit('logout_done', { ok: true });
                await authzAudit.auditSocketAction('wa.logout.requested', {
                    resourceType: 'wa_runtime',
                    resourceId: 'logout',
                    payload: {}
                });
            });

            socket.on('disconnect', () => {
                console.log('Web client disconnected:', socket.id);
            });
        });
    }

    setupWAClientEvents() {
        const waEventsBridge = createSocketWaEventsBridgeService({
            waClient,
            mediaManager,
            emitToRuntimeContext: this.emitToRuntimeContext.bind(this),
            getWaCapabilities: this.getWaCapabilities.bind(this),
            getWaRuntime: this.getWaRuntime.bind(this),
            enforceRuntimeWebjsPhonePolicy: this.enforceRuntimeWebjsPhonePolicy.bind(this),
            resolveHistoryTenantId: this.resolveHistoryTenantId.bind(this),
            resolveHistoryModuleContext: this.resolveHistoryModuleContext.bind(this),
            persistMessageHistory: this.persistMessageHistory.bind(this),
            persistMessageEdit: this.persistMessageEdit.bind(this),
            persistMessageAck: this.persistMessageAck.bind(this),
            invalidateChatListCache: this.invalidateChatListCache.bind(this),
            toChatSummary: this.toChatSummary.bind(this),
            emitMessageEditability: this.emitMessageEditability.bind(this),
            scheduleEditabilityRefresh: this.scheduleEditabilityRefresh.bind(this),
            isStatusOrSystemMessage,
            isVisibleChatId,
            getSerializedMessageId,
            mergeAgentMeta,
            getOutgoingAgentMeta,
            buildEffectiveModuleContext,
            buildModuleAttributionMeta,
            normalizeScopedModuleId,
            buildScopedChatId,
            resolveMessageSenderMeta,
            extractMessageFileMeta,
            extractQuotedMessageInfo,
            extractOrderInfo,
            extractLocationInfo
        });
        waEventsBridge.registerWaProviderEvents();
    }
}


module.exports = SocketManager;








