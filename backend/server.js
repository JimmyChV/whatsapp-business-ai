const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });
const logger = require('./config/logger');
const { createServerLifecycleHandlers } = require('./config/bootstrap/server-lifecycle');
const { registerHttpRoutes } = require('./config/bootstrap/http-routes');
const { preloadRuntimeServices } = require('./config/bootstrap/runtime-preload');
const { parseCsvEnv, resolveAndValidatePublicHost } = require('./domains/security/helpers/security-utils');
const RateLimiter = require('./config/rate-limiter');
const { resolveRuntimeFlags, createCorsOriginChecker } = require('./config/runtime-flags');
const {
    authService,
    authRecoveryService,
    accessPolicyService,
    planLimitsService,
    planLimitsStoreService,
    auditLogService,
    registerSecurityAuthHttpRoutes,
    registerSecurityAccessControlHttpRoutes
} = require('./domains/security');
const {
    tenantService,
    tenantSettingsService,
    saasControlService,
    tenantIntegrationsService,
    tenantCatalogService,
    catalogManagerService,
    tenantLabelService,
    tenantZoneRulesService,
    saasUserUiPreferencesService,
    waModuleService,
    customerService,
    customerAddressesService,
    customerCatalogsService,
    quickReplyLibrariesService,
    tenantAutomationService,
    tenantScheduleService,
    aiUsageService,
    registerTenantCustomerHttpRoutes,
    registerTenantWaModuleAdminHttpRoutes,
    registerTenantRuntimeSettingsHttpRoutes,
    registerTenantLabelsQuickRepliesHttpRoutes,
    registerTenantAdminConfigCatalogHttpRoutes,
    registerTenantAdminAutomationHttpRoutes,
    registerTenantAdminScheduleHttpRoutes,
    registerTenantAdminTenantsUsersHttpRoutes,
    registerTenantAssetsUploadHttpRoutes,
    registerTenantRuntimePublicHttpRoutes
} = require('./domains/tenant');
const {
    messageHistoryService,
    conversationOpsService,
    customerConsentService,
    templateWebhookEventsService,
    templateVariablesService,
    campaignsService,
    campaignQueueService,
    campaignDispatcherJobService,
    chatCommercialStatusService,
    customerModuleContextsService,
    metaTemplatesService,
    chatAssignmentPolicyService,
    assignmentRulesService,
    chatAssignmentRouterService,
    chatAssignmentInactivityJobService,
    quoteExpiryJobService,
    operationsKpiService,
    globalLabelsService,
    opsTelemetry,
    registerOperationsHttpRoutes,
    registerOperationsUtilityHttpRoutes,
    registerOperationsHealthHttpRoutes
} = require('./domains/operations');
const { createRequestOpsHelpers } = require('./domains/operations/helpers/request-ops.helpers');
const {
    waProvider: waClient,
    socketManager: SocketManager,
    invalidateWebhookCloudRegistryCache,
    registerCloudWebhookHttpRoutes
} = require('./domains/channels');
const { createTenantAdminPayloadSanitizers } = require('./domains/tenant/helpers/admin-payload-sanitizers');
const { createTenantAssetUploadHelpers } = require('./domains/tenant/helpers/asset-upload.helpers');
const { createRequestAccessHelpers } = require('./domains/security/helpers/request-access.helpers');
const { loadCatalog, addProduct, updateProduct } = catalogManagerService;
const {
    isProduction,
    allowedOrigins,
    allowEmptyOriginsInProd,
    securityHeadersEnabled,
    socketAuthRequired,
    httpRateLimitEnabled,
    trustProxyEnabled,
    saasSocketAuthRequired,
    opsApiToken,
    opsReadyRequireWa
} = resolveRuntimeFlags({ env: process.env, parseCsvEnv });
const httpRateLimiter = new RateLimiter({
    windowMs: Number(process.env.HTTP_RATE_LIMIT_WINDOW_MS || 10000),
    max: Number(process.env.HTTP_RATE_LIMIT_MAX || 120)
});
const isCorsOriginAllowed = createCorsOriginChecker({
    allowedOrigins,
    isProduction,
    allowEmptyOriginsInProd
});
const {
    resolveRequestId,
    hasOpsAccess
} = createRequestOpsHelpers({
    crypto,
    opsApiToken
});

const app = express();
app.disable('x-powered-by');
const JSON_BODY_LIMIT_MB = Math.max(12, Math.min(256, Number(process.env.API_JSON_BODY_LIMIT_MB || 80) || 80));

const {
    uploadsRoot: UPLOADS_ROOT,
    adminAssetQuickReplyMaxBytes: ADMIN_ASSET_QUICK_REPLY_MAX_BYTES,
    normalizeAssetUploadKind,
    sanitizeStorageSegment,
    resolveTenantQuickReplyAssetLimits,
    parseAssetUploadPayload,
    estimateDirectorySizeBytes,
    saveAssetFile,
    getRequestOrigin
} = createTenantAssetUploadHelpers({
    env: process.env,
    uploadsBaseDir: __dirname,
    parseCsvEnv,
    fs,
    path,
    crypto,
    tenantService,
    planLimitsService
});

app.use('/uploads', express.static(UPLOADS_ROOT, {
    fallthrough: true,
    maxAge: isProduction ? '30d' : 0
}));

app.use((req, res, next) => {
    const startedNs = process.hrtime.bigint();
    const requestId = resolveRequestId(req);
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedNs) / 1e6;
        opsTelemetry.recordHttpRequest({
            method: req.method,
            route: req.originalUrl || req.url || '/',
            statusCode: res.statusCode,
            durationMs,
            tenantId: String(req?.tenantContext?.id || 'default')
        });
    });

    next();
});


if (trustProxyEnabled) {
    app.set('trust proxy', 1);
}

if (securityHeadersEnabled) {
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

        const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
        if (isProduction && (req.secure || forwardedProto === 'https')) {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        next();
    });
}

app.use(express.json({
    limit: String(JSON_BODY_LIMIT_MB) + 'mb',
    verify: (req, _res, buf) => {
        req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || '');
    }
}));
app.use(cors({
    origin(origin, callback) {
        if (isCorsOriginAllowed(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    }
}));

app.use(async (req, res, next) => {
    try {
        const authContext = await authService.getRequestAuthContextAsync(req);
        const tenant = tenantService.resolveTenantForRequest(req, authContext?.user || null);
        req.authContext = authContext;
        req.tenantContext = tenant;
        res.setHeader('X-Tenant-Id', String(tenant?.id || 'default'));
        next();
    } catch (error) {
        logger.warn('[Auth] request middleware failed: ' + String(error?.message || error));
        req.authContext = { enabled: authService.isAuthEnabled(), tokenPresent: false, isAuthenticated: false, user: null };
        req.tenantContext = tenantService.DEFAULT_TENANT;
        res.setHeader('X-Tenant-Id', String(tenantService.DEFAULT_TENANT?.id || 'default'));
        next();
    }
});

if (httpRateLimitEnabled) {
    app.use('/api', (req, res, next) => {
        const key = String(req.ip || 'unknown') + ':' + req.method + ':' + req.path;
        const result = httpRateLimiter.check(key);
        res.setHeader('X-RateLimit-Limit', String(httpRateLimiter.max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, Number(result.remaining) || 0)));

        if (result.allowed) return next();

        const retryAfterSec = Math.max(1, Math.ceil((Number(result.retryAfterMs) || 1000) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            ok: false,
            error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.'
        });
    });
}

if (isProduction && allowedOrigins.length === 0 && !allowEmptyOriginsInProd) {
    logger.warn('ALLOWED_ORIGINS vacio en produccion; CORS bloqueara origenes de navegador hasta que lo configures.');
}

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100MB
    cors: {
        origin(origin, callback) {
            if (isCorsOriginAllowed(origin)) {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        },
        methods: ["GET", "POST"]
    }
});

let socketAuthBypassLogged = false;
let socketAuthRejectLogged = false;
let saasSocketAuthRejectLogged = false;
io.use((socket, next) => {
    (async () => {
        const expectedToken = String(process.env.SOCKET_AUTH_TOKEN || '').trim();
        const legacyToken = socket.handshake?.auth?.token || socket.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, '');

        if (!expectedToken) {
            if (socketAuthRequired) {
                if (!socketAuthRejectLogged) {
                    logger.warn('SOCKET_AUTH_REQUIRED activo y SOCKET_AUTH_TOKEN vacio; conexiones Socket.IO seran rechazadas.');
                    socketAuthRejectLogged = true;
                }
                opsTelemetry.recordSocketReject('legacy_token_required');
                return next(new Error('Unauthorized'));
            }

            if (!socketAuthBypassLogged) {
                logger.info('SOCKET_AUTH_TOKEN not configured; Socket.IO auth is bypassed.');
                socketAuthBypassLogged = true;
            }
        } else if (!(legacyToken && legacyToken === expectedToken)) {
            opsTelemetry.recordSocketReject('legacy_token_invalid');
            return next(new Error('Unauthorized'));
        }

        const accessToken = String(
            socket.handshake?.auth?.accessToken
            || socket.handshake?.auth?.jwt
            || socket.handshake?.headers?.['x-access-token']
            || ''
        ).trim();
        const authContext = accessToken
            ? await authService.verifyAccessTokenAsync(accessToken)
            : null;

        if (saasSocketAuthRequired && !authContext) {
            if (!saasSocketAuthRejectLogged) {
                logger.warn('SAAS_SOCKET_AUTH_REQUIRED activo y no se recibio un token SaaS valido en el socket.');
                saasSocketAuthRejectLogged = true;
            }
            opsTelemetry.recordSocketReject('saas_token_missing_or_invalid');
            return next(new Error('Unauthorized'));
        }

        const tenant = tenantService.resolveTenantForSocket(socket, authContext || null);
        if (saasSocketAuthRequired && authContext?.tenantId && authContext.tenantId !== tenant.id) {
            opsTelemetry.recordSocketReject('tenant_mismatch');
            return next(new Error('Unauthorized'));
        }

        socket.data = socket.data || {};
        socket.data.tenantId = String(tenant?.id || 'default');
        socket.data.tenant = tenant;
        socket.data.authContext = authContext || null;
        return next();
    })().catch((error) => {
        logger.warn('[Auth] socket middleware failed: ' + String(error?.message || error));
        opsTelemetry.recordSocketReject('middleware_error');
        return next(new Error('Unauthorized'));
    });
});

io.on('connection', (socket) => {
    opsTelemetry.recordSocketConnect();
    socket.on('disconnect', () => {
        opsTelemetry.recordSocketDisconnect();
    });
});

// Initialize Managers
const socketManager = new SocketManager(io, {
    metaTemplatesService
});

function toPublicTenant(tenant = null) {
    if (!tenant || typeof tenant !== 'object') return null;
    const logoUrl = String(tenant?.logoUrl || tenant?.logo_url || '').trim();
    const coverImageUrl = String(tenant?.coverImageUrl || tenant?.cover_image_url || '').trim();

    return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        active: tenant.active,
        plan: tenant.plan,
        logoUrl: /^https?:\/\//i.test(logoUrl) ? logoUrl : null,
        coverImageUrl: /^https?:\/\//i.test(coverImageUrl) ? coverImageUrl : null
    };
}
const {
    sanitizeMembershipPayload,
    sanitizeObjectPayload,
    sanitizeUrlValue,
    sanitizeTenantPayload,
    sanitizeUserPayload,
    hasOwnerRoleMembership,
    sanitizeCatalogIdListPayload,
    sanitizeAiAssistantIdPayload,
    sanitizeWaModulePayload,
    sanitizeAiAssistantPayload,
    sanitizeQuickReplyLibraryPayload,
    normalizeQuickReplyMediaAsset,
    normalizeQuickReplyMediaAssets,
    sanitizeQuickReplyItemPayload,
    sanitizeTenantLabelPayload
} = createTenantAdminPayloadSanitizers({
    accessPolicyService,
    quickReplyLibrariesService,
    tenantLabelService
});
const {
    getAuthRole,
    hasPermission,
    hasAnyPermission,
    hasSaasControlReadAccess,
    hasSaasControlWriteAccess,
    hasTenantAdminWriteAccess,
    isTenantAllowedForUser,
    hasTenantModuleReadAccess,
    hasTenantModuleWriteAccess,
    hasConversationEventsReadAccess,
    hasChatAssignmentsReadAccess,
    hasChatAssignmentsWriteAccess,
    hasAssignmentRulesReadAccess,
    hasAssignmentRulesWriteAccess,
    hasOperationsKpiReadAccess,
    normalizeScopeModuleId,
    resolvePrimaryRoleFromMemberships,
    canActorAssignRole,
    hasAnyAccessOverride,
    canActorEditOptionalAccess,
    getUserPrimaryRole,
    isSelfUserAction,
    isActorSuperiorToRole,
    canActorManageRoleChanges,
    filterAdminOverviewByScope
} = createRequestAccessHelpers({
    accessPolicyService,
    authService
});
registerHttpRoutes({
    app,
    hasOpsAccess,
    waClient,
    opsTelemetry,
    tenantService,
    authService,
    opsReadyRequireWa,
    registerOperationsHealthHttpRoutes,
    registerTenantRuntimePublicHttpRoutes,
    registerSecurityAuthHttpRoutes,
    registerSecurityAccessControlHttpRoutes,
    registerTenantAssetsUploadHttpRoutes,
    registerTenantAdminTenantsUsersHttpRoutes,
    registerTenantWaModuleAdminHttpRoutes,
    registerTenantCustomerHttpRoutes,
    registerOperationsHttpRoutes,
    registerTenantRuntimeSettingsHttpRoutes,
    registerTenantLabelsQuickRepliesHttpRoutes,
    registerTenantAdminConfigCatalogHttpRoutes,
    registerTenantAdminAutomationHttpRoutes,
    registerTenantAdminScheduleHttpRoutes,
    registerOperationsUtilityHttpRoutes,
    registerCloudWebhookHttpRoutes,
    isProduction,
    authRecoveryService,
    auditLogService,
    toPublicTenant,
    saasControlService,
    aiUsageService,
    accessPolicyService,
    planLimitsService,
    planLimitsStoreService,
    hasSaasControlReadAccess,
    hasSaasControlWriteAccess,
    getAuthRole,
    filterAdminOverviewByScope,
    sanitizeObjectPayload,
    tenantLabelService,
    tenantZoneRulesService,
    saasUserUiPreferencesService,
    quickReplyLibrariesService,
    tenantAutomationService,
    tenantScheduleService,
    customerService,
    customerAddressesService,
    customerCatalogsService,
    waModuleService,
    hasPermission,
    hasAnyPermission,
    isTenantAllowedForUser,
    normalizeAssetUploadKind,
    sanitizeStorageSegment,
    resolveTenantQuickReplyAssetLimits,
    parseAssetUploadPayload,
    adminAssetQuickReplyMaxBytes: ADMIN_ASSET_QUICK_REPLY_MAX_BYTES,
    estimateDirectorySizeBytes,
    uploadsRoot: UPLOADS_ROOT,
    path,
    saveAssetFile,
    getRequestOrigin,
    hasTenantAdminWriteAccess,
    hasTenantModuleReadAccess,
    sanitizeTenantPayload,
    sanitizeUserPayload,
    sanitizeMembershipPayload,
    resolvePrimaryRoleFromMemberships,
    canActorAssignRole,
    hasAnyAccessOverride,
    canActorEditOptionalAccess,
    getUserPrimaryRole,
    isSelfUserAction,
    isActorSuperiorToRole,
    canActorManageRoleChanges,
    sanitizeWaModulePayload,
    invalidateWebhookCloudRegistryCache,
    hasTenantModuleWriteAccess,
    conversationOpsService,
    customerConsentService,
    customerModuleContextsService,
    templateWebhookEventsService,
    templateVariablesService,
    campaignsService,
    chatCommercialStatusService,
    metaTemplatesService,
    chatAssignmentPolicyService,
    assignmentRulesService,
    chatAssignmentRouterService,
    operationsKpiService,
    globalLabelsService,
    normalizeScopeModuleId,
    hasConversationEventsReadAccess,
    hasChatAssignmentsReadAccess,
    hasChatAssignmentsWriteAccess,
    hasAssignmentRulesReadAccess,
    hasAssignmentRulesWriteAccess,
    hasOperationsKpiReadAccess,
    tenantSettingsService,
    tenantIntegrationsService,
    tenantCatalogService,
    sanitizeAiAssistantIdPayload,
    sanitizeAiAssistantPayload,
    loadCatalog,
    addProduct,
    updateProduct,
    messageHistoryService,
    parseCsvEnv,
    resolveAndValidatePublicHost,
    logger,
    socketManager,
    sanitizeTenantLabelPayload,
    sanitizeQuickReplyLibraryPayload,
    sanitizeQuickReplyItemPayload,
    saasSocketAuthRequired
});
const { scheduleWaInitialize, registerProcessHandlers } = createServerLifecycleHandlers({
    waClient,
    opsTelemetry,
    logger,
    server,
    waInitRestartDelayMs: Number(process.env.WA_INIT_RESTART_DELAY_MS || 12000),
    shutdownForceTimeoutMs: Number(process.env.SHUTDOWN_FORCE_TIMEOUT_MS || 10000)
});

const PORT = process.env.PORT || 3001;
const chatAssignmentInactivityJob = chatAssignmentInactivityJobService.createChatAssignmentInactivityJob({
    conversationOpsService,
    tenantService,
    logger,
    opsTelemetry
});
const campaignDispatcherJob = campaignDispatcherJobService.createCampaignDispatcherJob({
    campaignQueueService,
    campaignsService,
    customerConsentService,
    tenantService,
    waModuleService,
    waClient,
    metaTemplatesService,
    logger,
    opsTelemetry
});
const quoteExpiryJob = quoteExpiryJobService.createQuoteExpiryJob({
    tenantService,
    logger,
    opsTelemetry
});

registerProcessHandlers();

async function startServer() {
    await preloadRuntimeServices({
        saasControlService,
        planLimitsStoreService,
        accessPolicyService,
        customerService,
        logger
    });

    server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : { requestedTransport: 'idle', activeTransport: 'idle', cloudConfigured: false };
        logger.info(`[WA] transport requested=${runtime.requestedTransport} active=${runtime.activeTransport} cloudConfigured=${runtime.cloudConfigured}`);
        chatAssignmentInactivityJob.start();
        campaignDispatcherJob.start();
        quoteExpiryJob.start();
        scheduleWaInitialize();
    });
}

startServer().catch((error) => {
    logger.error('[Startup] failed to preload runtime services: ' + String(error?.stack || error?.message || error));
    process.exit(1);
});























