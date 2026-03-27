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
const { createSocketChatStateLabelsService } = require('./socket-chat-state-labels.service');
const { createSocketQuickRepliesService } = require('./socket-quick-replies.service');
const { createSocketMessageDeliveryService } = require('./socket-message-delivery.service');
const { createSocketCatalogDeliveryService } = require('./socket-catalog-delivery.service');
const { createSocketProfileContactService } = require('./socket-profile-contact.service');
const { createSocketBusinessDataService } = require('./socket-business-data.service');
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
        this.chatStateLabelsService = createSocketChatStateLabelsService({
            messageHistoryService,
            tenantLabelService,
            normalizeScopedModuleId,
            resolveScopedChatTarget,
            buildScopedChatId,
            getSortedVisibleChats: this.getSortedVisibleChats.bind(this),
            toChatSummary: this.toChatSummary.bind(this),
            toHistoryChatSummary: this.toHistoryChatSummary.bind(this),
            emitToTenant: this.emitToTenant.bind(this)
        });
        this.quickRepliesService = createSocketQuickRepliesService({
            waClient,
            listQuickReplies,
            fetchQuickReplyMedia,
            normalizeScopedModuleId,
            pathModule: path,
            getSerializedMessageId,
            sanitizeAgentMeta,
            buildSocketAgentMeta,
            rememberOutgoingAgentMeta
        });
        this.messageDeliveryService = createSocketMessageDeliveryService({
            waClient,
            normalizeScopedModuleId,
            resolveScopedChatTarget,
            buildScopedChatId,
            parseScopedChatId,
            resolveCloudDestinationChatId,
            coerceHumanPhone,
            isVisibleChatId,
            isLidIdentifier,
            getSerializedMessageId,
            buildSocketAgentMeta,
            sanitizeAgentMeta,
            rememberOutgoingAgentMeta,
            buildModuleAttributionMeta
        });
        this.catalogDeliveryService = createSocketCatalogDeliveryService({
            waClient,
            fetchCatalogProductImage,
            ensureCloudApiCompatibleCatalogImage,
            slugifyFileName,
            buildCatalogProductCaption,
            getSerializedMessageId,
            buildSocketAgentMeta,
            sanitizeAgentMeta,
            rememberOutgoingAgentMeta
        });
        this.profileContactService = createSocketProfileContactService({
            waClient,
            tenantLabelService,
            resolveProfilePic,
            normalizeBusinessDetailsSnapshot,
            extractContactSnapshot,
            extractChatSnapshot,
            extractGroupParticipants,
            fetchGroupParticipantsFromStore,
            hydrateGroupParticipantsWithContacts,
            normalizeScopedModuleId,
            resolveScopedChatTarget,
            buildScopedChatId,
            snapshotSerializable
        });
        this.businessDataService = createSocketBusinessDataService({
            waClient,
            waModuleService,
            tenantCatalogService,
            tenantLabelService,
            tenantSettingsService,
            tenantIntegrationsService,
            tenantService,
            planLimitsService,
            loadCatalog,
            getWooCatalog,
            isWooConfigured,
            resolveProfilePic,
            normalizeBusinessDetailsSnapshot,
            extractContactSnapshot,
            snapshotSerializable,
            extractCatalogItemCategories,
            logCatalogDebugSnapshot
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

            this.chatStateLabelsService.registerChatStateLabelHandlers({
                socket,
                tenantId,
                authzAudit,
                recordConversationEvent
            });
            const messageDeliveryRuntime = this.messageDeliveryService.registerMessageDeliveryHandlers({
                socket,
                io: this.io,
                tenantId,
                authContext,
                authzAudit,
                guardRateLimit,
                transportOrchestrator,
                resolveSocketModuleContext,
                getWaCapabilities: this.getWaCapabilities.bind(this),
                getWaRuntime: this.getWaRuntime.bind(this),
                emitToRuntimeContext: this.emitToRuntimeContext.bind(this),
                persistMessageHistory: this.persistMessageHistory.bind(this),
                invalidateChatListCache: this.invalidateChatListCache.bind(this),
                toChatSummary: this.toChatSummary.bind(this),
                emitMessageEditability: this.emitMessageEditability.bind(this),
                recordConversationEvent
            });
            this.catalogDeliveryService.registerCatalogDeliveryHandlers({
                socket,
                tenantId,
                authContext,
                guardRateLimit,
                transportOrchestrator,
                isFeatureEnabledForTenant: this.isFeatureEnabledForTenant.bind(this),
                resolveScopedSendTarget: (...args) => messageDeliveryRuntime.resolveScopedSendTarget(...args),
                emitRealtimeOutgoingMessage: (...args) => messageDeliveryRuntime.emitRealtimeOutgoingMessage(...args),
                recordConversationEvent
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
                        await messageDeliveryRuntime.emitRealtimeOutgoingMessage({
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

            this.quickRepliesService.registerQuickReplyHandlers({
                socket,
                tenantId,
                authContext,
                guardRateLimit,
                transportOrchestrator,
                isFeatureEnabledForTenant: this.isFeatureEnabledForTenant.bind(this),
                resolveScopedSendTarget: (...args) => messageDeliveryRuntime.resolveScopedSendTarget(...args),
                emitRealtimeOutgoingMessage: (...args) => messageDeliveryRuntime.emitRealtimeOutgoingMessage(...args),
                quickReplyMediaMaxBytes: QUICK_REPLY_MEDIA_MAX_BYTES,
                quickReplyMediaTimeoutMs: QUICK_REPLY_MEDIA_TIMEOUT_MS
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
            this.businessDataService.registerBusinessDataHandlers({
                socket,
                tenantId,
                authContext,
                transportOrchestrator,
                normalizeSocketModuleId
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
            this.profileContactService.registerProfileContactHandlers({
                socket,
                tenantId,
                transportOrchestrator
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










