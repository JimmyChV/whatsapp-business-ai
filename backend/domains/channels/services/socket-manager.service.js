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
const quotesService = require('../../tenant/services/quotes.service');
const saasControlService = require('../../tenant/services/tenant-control.service');
const conversationOpsService = require('../../operations/services/conversation-ops.service');
const chatCommercialStatusService = require('../../operations/services/chat-commercial-status.service');
const campaignsService = require('../../operations/services/campaigns.service');
const metaTemplatesService = require('../../operations/services/meta-templates.service');
const customerConsentService = require('../../operations/services/customer-consent.service');
const chatOriginService = require('../../operations/services/chat-origin.service');
const templateWebhookEventsService = require('../../operations/services/template-webhook-events.service');
const chatAssignmentRouterService = require('../../operations/services/chat-assignment-router.service');
const chatAssignmentPolicyService = require('../../operations/services/chat-assignment-policy.service');
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
const { createSocketQuoteDeliveryService } = require('./socket-quote-delivery.service');
const { createMessageDeliveryConsentPolicyService } = require('./message-delivery-consent-policy.service');
const { createSocketAiAssistantService } = require('./socket-ai-assistant.service');
const { createSocketProfileContactService } = require('./socket-profile-contact.service');
const { createSocketBusinessDataService } = require('./socket-business-data.service');
const { createSocketSessionPresenceService } = require('./socket-session-presence.service');
const {
    createGuardRateLimit,
    createLazySharpLoader
} = require('../helpers/socket-runtime-bootstrap.helpers');
const fs = require('fs');
const path = require('path');

const eventRateLimiter = new RateLimiter({
    windowMs: Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS || 10000),
    max: Number(process.env.SOCKET_RATE_LIMIT_MAX || 30)
});
const HISTORY_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.HISTORY_DEBUG || '').trim().toLowerCase());
const SOCKET_RBAC_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.SAAS_AUTH_ENABLED || '').trim().toLowerCase());
const WA_REQUIRE_SELECTED_MODULE = ['1', 'true', 'yes', 'on'].includes(String(process.env.WA_REQUIRE_SELECTED_MODULE || '').trim().toLowerCase());
const QUICK_REPLY_MEDIA_MAX_BYTES = Math.max(
    256 * 1024,
    Number(process.env.QUICK_REPLY_MEDIA_MAX_BYTES || process.env.ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || (50 * 1024 * 1024))
);
const QUICK_REPLY_MEDIA_TIMEOUT_MS = Math.max(
    2000,
    Number(process.env.QUICK_REPLY_MEDIA_TIMEOUT_MS || 15000)
);
const ASSIGNMENT_BULK_SNAPSHOT_LIMIT = Math.max(
    50,
    Number(process.env.CHAT_ASSIGNMENT_BULK_SNAPSHOT_LIMIT || 500)
);
const COMMERCIAL_STATUS_BULK_SNAPSHOT_LIMIT = Math.max(
    50,
    Number(process.env.CHAT_COMMERCIAL_STATUS_BULK_SNAPSHOT_LIMIT || 500)
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
    constructor(io, deps = {}) {
        this.io = io;
        this.campaignsService = deps?.campaignsService || campaignsService;
        this.metaTemplatesService = deps?.metaTemplatesService || metaTemplatesService;
        this.templateWebhookEventsService = deps?.templateWebhookEventsService || templateWebhookEventsService;
        this.runtimeStore = createSocketRuntimeContextStore({
            io,
            initialRuntimeContext: {
                tenantId: 'default',
                moduleId: 'default',
                transportMode: 'idle',
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
        this.messageDeliveryConsentPolicyService = createMessageDeliveryConsentPolicyService({
            customerService,
            customerConsentService
        });
        this.quoteDeliveryService = createSocketQuoteDeliveryService({
            waClient,
            getSerializedMessageId,
            buildSocketAgentMeta,
            sanitizeAgentMeta,
            rememberOutgoingAgentMeta,
            chatCommercialStatusService,
            quotesService
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
        this.aiAssistantService = createSocketAiAssistantService({
            getChatSuggestion,
            askInternalCopilot,
            aiChatHistoryService,
            resolveAiHistoryScope
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
        this.sessionPresenceService = createSocketSessionPresenceService({
            waClient
        });
        this.unsubscribeAssignmentChanged = null;
        if (typeof conversationOpsService?.onChatAssignmentChanged === 'function') {
            this.unsubscribeAssignmentChanged = conversationOpsService.onChatAssignmentChanged((event = {}) => {
                try {
                    const eventTenantId = String(event?.tenantId || event?.assignment?.tenantId || 'default').trim() || 'default';
                    const assignment = this.enrichAssignmentDisplay(
                        eventTenantId,
                        event?.assignment && typeof event.assignment === 'object' ? event.assignment : null
                    );
                    const previousAssignment = this.enrichAssignmentDisplay(
                        eventTenantId,
                        event?.previousAssignment && typeof event.previousAssignment === 'object' ? event.previousAssignment : null
                    );
                    const chatId = String(event?.chatId || assignment?.chatId || '').trim();
                    const scopeModuleId = String(event?.scopeModuleId || assignment?.scopeModuleId || '').trim().toLowerCase();
                    if (!chatId) return;
                    this.emitToTenant(eventTenantId, 'chat_assignment_updated', {
                        tenantId: eventTenantId,
                        chatId,
                        scopeModuleId: scopeModuleId || '',
                        assignment,
                        previousAssignment,
                        changed: Boolean(event?.changed),
                        assignmentMode: String(event?.assignmentMode || assignment?.assignmentMode || '').trim().toLowerCase() || null,
                        assignmentReason: String(event?.assignmentReason || assignment?.assignmentReason || '').trim() || null,
                        generatedAt: new Date().toISOString()
                    });
                } catch (_) { }
            });
        }
        this.unsubscribeCampaignUpdated = null;
        if (typeof this.campaignsService?.onCampaignUpdated === 'function') {
            this.unsubscribeCampaignUpdated = this.campaignsService.onCampaignUpdated((event = {}) => {
                try {
                    const eventTenantId = String(event?.tenantId || event?.campaign?.tenantId || 'default').trim() || 'default';
                    const campaign = event?.campaign && typeof event.campaign === 'object' ? event.campaign : null;
                    const previousCampaign = event?.previousCampaign && typeof event.previousCampaign === 'object'
                        ? event.previousCampaign
                        : null;
                    const campaignId = String(event?.campaignId || campaign?.campaignId || previousCampaign?.campaignId || '').trim();
                    if (!campaignId) return;

                    const payload = {
                        tenantId: eventTenantId,
                        campaignId,
                        campaign,
                        previousCampaign,
                        status: String(event?.status || campaign?.status || '').trim().toLowerCase() || null,
                        previousStatus: String(event?.previousStatus || previousCampaign?.status || '').trim().toLowerCase() || null,
                        reason: String(event?.reason || '').trim() || null,
                        source: String(event?.source || '').trim() || null,
                        generatedAt: String(event?.generatedAt || '').trim() || new Date().toISOString()
                    };

                    if (String(event?.type || '').trim().toLowerCase() === 'progress') {
                        this.emitToTenant(eventTenantId, 'campaign_progress_updated', {
                            ...payload,
                            recipient: event?.recipient && typeof event.recipient === 'object' ? event.recipient : null,
                            recipientStatus: String(event?.recipientStatus || event?.recipient?.status || '').trim().toLowerCase() || null
                        });
                        return;
                    }

                    this.emitToTenant(eventTenantId, 'campaign_status_updated', payload);
                } catch (_) { }
            });
        }

        this.setupSocketEvents();
        this.setupWAClientEvents();
    }

    resolveAssigneeName(tenantId = 'default', assignment = null) {
        if (!assignment || typeof assignment !== 'object') return '';
        const directName = String(assignment?.assigneeName || assignment?.assigneeDisplayName || assignment?.metadata?.assigneeName || '').trim();
        if (directName) return directName;

        const assigneeUserId = String(assignment?.assigneeUserId || '').trim();
        if (!assigneeUserId) return '';

        const user = typeof saasControlService?.findUserByIdSync === 'function'
            ? saasControlService.findUserByIdSync(assigneeUserId)
            : null;
        if (!user || typeof user !== 'object') return assigneeUserId;

        const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
        const cleanTenantId = String(tenantId || '').trim();
        const hasTenantMembership = memberships.some((entry) =>
            String(entry?.tenantId || '').trim() === cleanTenantId && entry?.active !== false
        );
        if (!hasTenantMembership) return assigneeUserId;

        const displayName = String(user?.name || user?.displayName || '').trim();
        if (displayName) return displayName;

        const email = String(user?.email || '').trim();
        if (email) return email;

        return assigneeUserId;
    }

    enrichAssignmentDisplay(tenantId = 'default', assignment = null) {
        if (!assignment || typeof assignment !== 'object') return assignment;
        const assigneeName = this.resolveAssigneeName(tenantId, assignment);
        if (!assigneeName) return assignment;
        return {
            ...assignment,
            assigneeName,
            assigneeDisplayName: assigneeName
        };
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

    emitCommercialStatusUpdated({
        tenantId = 'default',
        chatId = '',
        scopeModuleId = '',
        result = null,
        source = 'socket'
    } = {}) {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const cleanChatId = String(chatId || result?.status?.chatId || '').trim();
        if (!cleanChatId) return;
        const status = result?.status && typeof result.status === 'object' ? result.status : null;
        const previousStatus = result?.previous && typeof result.previous === 'object' ? result.previous : null;
        const cleanScopeModuleId = String(scopeModuleId || status?.scopeModuleId || '').trim().toLowerCase();

        this.emitToTenant(cleanTenantId, 'chat_commercial_status_updated', {
            tenantId: cleanTenantId,
            chatId: cleanChatId,
            scopeModuleId: cleanScopeModuleId || '',
            status,
            previousStatus,
            changed: Boolean(result?.changed),
            source: String(source || 'socket').trim().toLowerCase() || 'socket',
            generatedAt: new Date().toISOString()
        });
    }

    emitMetaTemplateStatusUpdated({
        tenantId = 'default',
        scopeModuleId = '',
        event = null,
        source = 'cloud_webhook'
    } = {}) {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const cleanScopeModuleId = String(scopeModuleId || event?.scopeModuleId || '').trim().toLowerCase();
        const normalizedEvent = event && typeof event === 'object' ? event : null;
        if (!normalizedEvent) return;
        this.emitToTenant(cleanTenantId, 'meta_template_status_updated', {
            tenantId: cleanTenantId,
            scopeModuleId: cleanScopeModuleId || '',
            event: normalizedEvent,
            source: String(source || 'cloud_webhook').trim().toLowerCase() || 'cloud_webhook',
            generatedAt: new Date().toISOString()
        });
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
        transportMode = 'idle'
    } = {}) {
        return this.runtimeStore.set('runtimeContext', {
            tenantId: String(tenantId || 'default').trim() || 'default',
            moduleId: String(moduleId || 'default').trim().toLowerCase() || 'default',
            moduleName: String(moduleName || '').trim() || null,
            modulePhone: coerceHumanPhone(modulePhone || '') || null,
            channelType: String(channelType || '').trim().toLowerCase() || null,
            transportMode: String(transportMode || 'idle').trim().toLowerCase() || 'idle',
            updatedAt: Date.now()
        });
    }

    resolveRuntimeEventTarget() {
        return this.runtimeStore.resolveTarget();
    }

    emitToRuntimeContext(eventName, payload) {
        this.runtimeStore.emitToRuntimeContext(eventName, payload);
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

        const historySummaries = allRows
            .map((entry) => this.toHistoryChatSummary(entry))
            .filter(Boolean);

        let summariesWithLabels = historySummaries;
        if (historySummaries.length > 0 && typeof tenantLabelService?.listChatLabelsMap === 'function') {
            const buildLabelMapKey = (chatId = '', scopedModuleId = '') => `${String(chatId || '')}::${normalizeScopedModuleId(scopedModuleId || '')}`;
            const historyChatIds = Array.from(new Set(
                historySummaries
                    .map((summary) => String(summary?.baseChatId || parseScopedChatId(summary?.id || '').chatId || '').trim())
                    .filter((chatId) => Boolean(chatId))
            ));

            if (historyChatIds.length > 0) {
                let labelsMap = {};
                try {
                    labelsMap = await tenantLabelService.listChatLabelsMap({
                        tenantId,
                        chatKeys: historyChatIds.map((chatId) => ({ chatId, scopeModuleId: normalizedScopeModuleId })),
                        includeInactive: false
                    }) || {};
                } catch (_) {
                    labelsMap = {};
                }

                if (normalizedScopeModuleId) {
                    const missingChatIds = historyChatIds.filter((chatId) => {
                        const scopedKey = buildLabelMapKey(chatId, normalizedScopeModuleId);
                        const scopedLabels = labelsMap?.[scopedKey];
                        return !Array.isArray(scopedLabels) || scopedLabels.length === 0;
                    });

                    if (missingChatIds.length > 0) {
                        try {
                            const fallbackMap = await tenantLabelService.listChatLabelsMap({
                                tenantId,
                                chatKeys: missingChatIds.map((chatId) => ({ chatId, scopeModuleId: '' })),
                                includeInactive: false
                            }) || {};

                            for (const chatId of missingChatIds) {
                                const scopedKey = buildLabelMapKey(chatId, normalizedScopeModuleId);
                                const fallbackKey = buildLabelMapKey(chatId, '');
                                if ((!Array.isArray(labelsMap?.[scopedKey]) || labelsMap[scopedKey].length === 0) && Array.isArray(fallbackMap?.[fallbackKey])) {
                                    labelsMap[scopedKey] = fallbackMap[fallbackKey];
                                }
                            }
                        } catch (_) { }
                    }
                }

                summariesWithLabels = historySummaries.map((summary) => {
                    const baseChatId = String(summary?.baseChatId || parseScopedChatId(summary?.id || '').chatId || '').trim();
                    if (!baseChatId) return summary;
                    const labelKey = buildLabelMapKey(baseChatId, normalizedScopeModuleId);
                    const labels = Array.isArray(labelsMap?.[labelKey]) ? labelsMap[labelKey] : (Array.isArray(summary?.labels) ? summary.labels : []);
                    return {
                        ...summary,
                        labels: this.normalizeHistoryLabels(labels)
                    };
                });
            }
        }

        const normalized = summariesWithLabels
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
            const buildPolicyRequestContext = () => {
                const memberships = Array.isArray(authContext?.memberships)
                    ? authContext.memberships
                    : (Array.isArray(authContext?.user?.memberships) ? authContext.user.memberships : []);
                const userId = String(authContext?.userId || authContext?.user?.userId || authContext?.user?.id || '').trim() || null;
                return {
                    authContext: {
                        user: {
                            userId,
                            id: userId,
                            role: String(authContext?.role || authContext?.user?.role || authzAudit?.actorContext?.userRole || 'seller').trim().toLowerCase() || 'seller',
                            memberships,
                            isSystem: Boolean(authContext?.isSystem || authContext?.user?.isSystem)
                        }
                    }
                };
            };
            const emitAssignmentBulkSnapshot = async () => {
                try {
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const result = await conversationOpsService.listChatAssignments(tenantId, {
                        scopeModuleId: selectedScopeModuleId || '',
                        limit: ASSIGNMENT_BULK_SNAPSHOT_LIMIT,
                        offset: 0
                    });
                    const items = Array.isArray(result?.items)
                        ? result.items.map((entry) => this.enrichAssignmentDisplay(tenantId, entry))
                        : [];
                    socket.emit('chat_assignment_bulk_snapshot', {
                        ok: true,
                        tenantId,
                        scopeModuleId: selectedScopeModuleId || '',
                        items,
                        total: Number(result?.total || 0),
                        limit: Number(result?.limit || ASSIGNMENT_BULK_SNAPSHOT_LIMIT),
                        offset: Number(result?.offset || 0),
                        generatedAt: new Date().toISOString()
                    });
                } catch (error) {
                    socket.emit('chat_assignment_bulk_snapshot', {
                        ok: false,
                        tenantId,
                        scopeModuleId: '',
                        items: [],
                        total: 0,
                        limit: ASSIGNMENT_BULK_SNAPSHOT_LIMIT,
                        offset: 0,
                        error: String(error?.message || 'No se pudo cargar snapshot de asignaciones.'),
                        generatedAt: new Date().toISOString()
                    });
                }
            };
            const emitCommercialStatusBulkSnapshot = async () => {
                try {
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const result = await chatCommercialStatusService.listCommercialStatuses(tenantId, {
                        scopeModuleId: selectedScopeModuleId || '',
                        limit: COMMERCIAL_STATUS_BULK_SNAPSHOT_LIMIT,
                        offset: 0
                    });
                    const items = Array.isArray(result?.items) ? result.items : [];
                    socket.emit('chat_commercial_status_bulk_snapshot', {
                        ok: true,
                        tenantId,
                        scopeModuleId: selectedScopeModuleId || '',
                        items,
                        total: Number(result?.total || 0),
                        limit: Number(result?.limit || COMMERCIAL_STATUS_BULK_SNAPSHOT_LIMIT),
                        offset: Number(result?.offset || 0),
                        generatedAt: new Date().toISOString()
                    });
                } catch (error) {
                    socket.emit('chat_commercial_status_bulk_snapshot', {
                        ok: false,
                        tenantId,
                        scopeModuleId: '',
                        items: [],
                        total: 0,
                        limit: COMMERCIAL_STATUS_BULK_SNAPSHOT_LIMIT,
                        offset: 0,
                        error: String(error?.message || 'No se pudo cargar snapshot de estado comercial.'),
                        generatedAt: new Date().toISOString()
                    });
                }
            };
            const normalizeSocketModuleId = (value = '') => String(value || '').trim().toLowerCase();
            transportOrchestrator.registerTransportHandlers();

            // Register core chat handlers before async bootstrap to avoid dropping early client emits.
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

            await transportOrchestrator.bootstrapTransportContext();
            await emitAssignmentBulkSnapshot();
            await emitCommercialStatusBulkSnapshot();

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
                checkOutboundConsent: (...args) => this.messageDeliveryConsentPolicyService.checkOutboundConsent(...args),
                isFeatureEnabledForTenant: this.isFeatureEnabledForTenant.bind(this),
                resolveScopedSendTarget: (...args) => messageDeliveryRuntime.resolveScopedSendTarget(...args),
                emitRealtimeOutgoingMessage: (...args) => messageDeliveryRuntime.emitRealtimeOutgoingMessage(...args),
                recordConversationEvent
            });
            this.quoteDeliveryService.registerQuoteDeliveryHandlers({
                socket,
                tenantId,
                authContext,
                guardRateLimit,
                transportOrchestrator,
                checkOutboundConsent: (...args) => this.messageDeliveryConsentPolicyService.checkOutboundConsent(...args),
                resolveScopedSendTarget: (...args) => messageDeliveryRuntime.resolveScopedSendTarget(...args),
                emitRealtimeOutgoingMessage: (...args) => messageDeliveryRuntime.emitRealtimeOutgoingMessage(...args),
                emitCommercialStatusUpdated: (...args) => this.emitCommercialStatusUpdated(...args),
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

            socket.on('take_chat', async (payload = {}) => {
                if (!guardRateLimit(socket, 'take_chat')) return;
                const requestedChatId = String(payload?.chatId || '').trim();
                if (!requestedChatId) {
                    socket.emit('chat_assignment_take_result', {
                        ok: false,
                        error: 'chatId invalido.'
                    });
                    return;
                }

                const actorUserId = String(authContext?.userId || authContext?.user?.userId || authContext?.user?.id || '').trim() || null;
                if (!actorUserId) {
                    socket.emit('chat_assignment_take_result', {
                        ok: false,
                        error: 'No autenticado.'
                    });
                    return;
                }

                const policyReq = buildPolicyRequestContext();
                const policyResult = chatAssignmentPolicyService.assertTakeChatAllowed({ req: policyReq, tenantId });
                if (!policyResult?.ok) {
                    socket.emit('chat_assignment_take_result', {
                        ok: false,
                        error: String(policyResult?.error || 'No autorizado.')
                    });
                    return;
                }

                const parsedChat = parseScopedChatId(requestedChatId);
                const baseChatId = String(parsedChat?.chatId || requestedChatId).trim();
                if (!baseChatId) {
                    socket.emit('chat_assignment_take_result', {
                        ok: false,
                        error: 'chatId invalido.'
                    });
                    return;
                }

                const scopeModuleId = normalizeScopedModuleId(
                    payload?.scopeModuleId
                    || parsedChat?.scopeModuleId
                    || socket?.data?.waModule?.moduleId
                    || socket?.data?.waModuleId
                    || ''
                );
                const actorRole = String(chatAssignmentPolicyService.resolveActorTenantRole({ req: policyReq, tenantId }) || authzAudit?.actorContext?.userRole || 'seller').trim().toLowerCase() || 'seller';
                const assignmentReason = String(payload?.assignmentReason || '').trim() || 'take_chat';
                const metadata = payload?.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
                    ? payload.metadata
                    : {};

                try {
                    const result = await conversationOpsService.upsertChatAssignment(tenantId, {
                        chatId: baseChatId,
                        scopeModuleId,
                        assigneeUserId: actorUserId,
                        assigneeRole: actorRole,
                        assignedByUserId: actorUserId,
                        assignmentMode: 'take',
                        assignmentReason,
                        metadata,
                        status: 'active'
                    });

                    await authzAudit.auditSocketAction('chat.assignment.taken', {
                        resourceType: 'chat',
                        resourceId: baseChatId,
                        payload: {
                            scopeModuleId,
                            previousAssigneeUserId: result?.previous?.assigneeUserId || null,
                            nextAssigneeUserId: result?.assignment?.assigneeUserId || null,
                            changed: Boolean(result?.changed)
                        }
                    });

                    socket.emit('chat_assignment_take_result', {
                        ok: true,
                        tenantId,
                        chatId: buildScopedChatId(baseChatId, scopeModuleId || '') || baseChatId,
                        baseChatId,
                        scopeModuleId: scopeModuleId || '',
                        changed: Boolean(result?.changed),
                        previousAssignment: result?.previous || null,
                        assignment: result?.assignment || null
                    });
                } catch (error) {
                    socket.emit('chat_assignment_take_result', {
                        ok: false,
                        tenantId,
                        chatId: buildScopedChatId(baseChatId, scopeModuleId || '') || baseChatId,
                        baseChatId,
                        scopeModuleId: scopeModuleId || '',
                        error: String(error?.message || 'No se pudo tomar el chat.')
                    });
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
            this.aiAssistantService.registerAiAssistantHandlers({
                socket,
                tenantId,
                authContext,
                guardRateLimit,
                normalizeSocketModuleId,
                resolveSocketModuleContext,
                reserveAiQuota: (...args) => this.reserveAiQuota(...args)
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
            this.sessionPresenceService.registerSessionPresenceHandlers({
                socket,
                authzAudit
            });
        });
    }

    setupWAClientEvents() {
        const waEventsBridge = createSocketWaEventsBridgeService({
            waClient,
            mediaManager,
            conversationOpsService,
            chatAssignmentRouterService,
            chatCommercialStatusService,
            chatOriginService,
            emitToRuntimeContext: this.emitToRuntimeContext.bind(this),
            emitCommercialStatusUpdated: (...args) => this.emitCommercialStatusUpdated(...args),
            getWaCapabilities: this.getWaCapabilities.bind(this),
            getWaRuntime: this.getWaRuntime.bind(this),
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
        waClient.on('template_webhook_event', async (event = {}) => {
            try {
                const tenantId = String(
                    event?.tenantId
                    || this.resolveHistoryTenantId()
                    || 'default'
                ).trim() || 'default';
                const fallbackModuleId = this.resolveHistoryModuleContext()?.moduleId || '';
                const scopeModuleId = normalizeScopedModuleId(
                    event?.scopeModuleId
                    || event?.moduleId
                    || fallbackModuleId
                );
                const templateName = String(
                    event?.templateName
                    || event?.template?.name
                    || event?.name
                    || ''
                ).trim();
                const newStatus = String(
                    event?.newStatus
                    || event?.status
                    || event?.templateStatus
                    || ''
                ).trim().toLowerCase();
                const previousStatus = String(
                    event?.previousStatus
                    || event?.oldStatus
                    || ''
                ).trim().toLowerCase() || null;
                const reason = String(
                    event?.reason
                    || event?.errorMessage
                    || event?.rejectionReason
                    || ''
                ).trim() || null;
                const wabaId = String(
                    event?.wabaId
                    || event?.whatsappBusinessAccountId
                    || event?.cloudConfig?.wabaId
                    || ''
                ).trim() || null;
                const eventType = String(
                    event?.eventType
                    || event?.type
                    || 'status_update'
                ).trim().toLowerCase() || 'status_update';
                const rawPayload = event?.rawPayload && typeof event.rawPayload === 'object'
                    ? event.rawPayload
                    : event;

                let persistedEvent = null;
                if (typeof this.templateWebhookEventsService?.recordTemplateWebhookEvent === 'function') {
                    persistedEvent = await this.templateWebhookEventsService.recordTemplateWebhookEvent(tenantId, {
                        scopeModuleId: scopeModuleId || '',
                        wabaId,
                        templateName,
                        eventType,
                        previousStatus,
                        newStatus,
                        reason,
                        rawPayload
                    });
                }

                let reconciliation = null;
                if (
                    typeof this.metaTemplatesService?.applyTemplateWebhookStatusUpdate === 'function'
                    && templateName
                    && newStatus
                ) {
                    reconciliation = await this.metaTemplatesService.applyTemplateWebhookStatusUpdate(tenantId, {
                        templateName,
                        newStatus,
                        reason,
                        wabaId,
                        rawPayload
                    });
                }

                this.emitToTenant(tenantId, 'meta_template_status_updated', {
                    tenantId,
                    scopeModuleId: scopeModuleId || '',
                    templateName: templateName || null,
                    eventType,
                    previousStatus,
                    newStatus: newStatus || null,
                    reason,
                    wabaId,
                    reconciliation,
                    event: persistedEvent,
                    generatedAt: new Date().toISOString()
                });
            } catch (error) {
                console.warn('[WA][Cloud] template_webhook_event handling failed:', String(error?.message || error));
            }
        });
    }
}


module.exports = SocketManager;










