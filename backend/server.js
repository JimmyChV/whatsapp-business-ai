const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });
const logger = require('./logger');
const { parseCsvEnv, resolveAndValidatePublicHost } = require('./security_utils');
const RateLimiter = require('./rate_limiter');
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
    tenantLabelService,
    waModuleService,
    customerService,
    quickReplyLibrariesService,
    aiUsageService,
    registerTenantCustomerHttpRoutes,
    registerTenantWaModuleAdminHttpRoutes,
    registerTenantRuntimeSettingsHttpRoutes,
    registerTenantLabelsQuickRepliesHttpRoutes,
    registerTenantAdminConfigCatalogHttpRoutes
} = require('./domains/tenant');
const {
    messageHistoryService,
    conversationOpsService,
    assignmentRulesService,
    chatAssignmentRouterService,
    operationsKpiService,
    opsTelemetry,
    registerOperationsHttpRoutes,
    registerOperationsUtilityHttpRoutes
} = require('./domains/operations');
const {
    invalidateWebhookCloudRegistryCache,
    registerCloudWebhookHttpRoutes
} = require('./domains/channels');
const { loadCatalog, addProduct, updateProduct } = require('./catalog_manager');

const waClient = require('./wa_provider');
const SocketManager = require('./socket_manager');

function parseBooleanEnv(value, defaultValue = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
const allowedOrigins = parseCsvEnv(process.env.ALLOWED_ORIGINS);
const allowEmptyOriginsInProd = parseBooleanEnv(process.env.CORS_ALLOW_EMPTY_IN_PROD, false);
const securityHeadersEnabled = parseBooleanEnv(process.env.SECURITY_HEADERS_ENABLED, true);
const socketAuthRequired = parseBooleanEnv(process.env.SOCKET_AUTH_REQUIRED, isProduction);
const httpRateLimitEnabled = parseBooleanEnv(process.env.HTTP_RATE_LIMIT_ENABLED, true);
const trustProxyEnabled = parseBooleanEnv(process.env.TRUST_PROXY, false);
const saasSocketAuthRequired = parseBooleanEnv(process.env.SAAS_SOCKET_AUTH_REQUIRED, parseBooleanEnv(process.env.SAAS_AUTH_ENABLED, false));
const opsApiToken = String(process.env.OPS_API_TOKEN || '').trim();
const opsReadyRequireWa = parseBooleanEnv(process.env.OPS_READY_REQUIRE_WA, false);
const httpRateLimiter = new RateLimiter({
    windowMs: Number(process.env.HTTP_RATE_LIMIT_WINDOW_MS || 10000),
    max: Number(process.env.HTTP_RATE_LIMIT_MAX || 120)
});

function isCorsOriginAllowed(origin) {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (allowedOrigins.length === 0) {
        if (isProduction && !allowEmptyOriginsInProd) return false;
        return true;
    }
    return false;
}

const app = express();
app.disable('x-powered-by');
const JSON_BODY_LIMIT_MB = Math.max(12, Math.min(256, Number(process.env.API_JSON_BODY_LIMIT_MB || 80) || 80));

const UPLOADS_ROOT = path.resolve(String(process.env.SAAS_UPLOADS_DIR || path.join(__dirname, 'uploads')).trim() || path.join(__dirname, 'uploads'));
const ADMIN_ASSET_UPLOAD_MAX_BYTES = Math.max(200 * 1024, Number(process.env.ADMIN_ASSET_UPLOAD_MAX_BYTES || 2 * 1024 * 1024));
const ADMIN_ASSET_QUICK_REPLY_MAX_BYTES = Math.max(500 * 1024, Number(process.env.ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || 50 * 1024 * 1024));
const ADMIN_ASSET_ALLOWED_MIME_TYPES_IMAGE = new Set((() => {
    const configured = parseCsvEnv(process.env.ADMIN_ASSET_ALLOWED_MIME_TYPES);
    const base = configured.length > 0 ? configured : ['image/jpeg', 'image/png', 'image/webp'];
    return base
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean);
})());
const ADMIN_ASSET_ALLOWED_MIME_TYPES_QUICK_REPLY = new Set((() => {
    const configured = parseCsvEnv(process.env.ADMIN_ASSET_QUICK_REPLY_ALLOWED_MIME_TYPES);
    const base = configured.length > 0
        ? configured
        : [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'application/pdf',
            'text/plain',
            'text/csv',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/zip',
            'application/x-zip-compressed',
            'audio/mpeg',
            'audio/ogg',
            'video/mp4'
        ];
    return base
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean);
})());
if (!fs.existsSync(UPLOADS_ROOT)) {
    fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

app.use('/uploads', express.static(UPLOADS_ROOT, {
    fallthrough: true,
    maxAge: isProduction ? '30d' : 0
}));

function sanitizeStorageSegment(value = '', fallback = 'default') {
    const source = String(value || fallback || '').trim();
    if (!source) return fallback;
    const clean = source.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return clean || fallback;
}

function getRequestOrigin(req = {}) {
    const protoRaw = String(req.headers?.['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const hostRaw = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
    const proto = protoRaw || 'http';
    if (!hostRaw) return '';
    return proto + '://' + hostRaw;
}

function normalizeAssetExtension(fileName = '', mimeType = '') {
    const fromName = String(fileName || '').trim().split('.').pop();
    const cleanNameExt = String(fromName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanNameExt && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'mp3', 'ogg', 'mp4'].includes(cleanNameExt)) {
        return cleanNameExt === 'jpg' ? 'jpeg' : cleanNameExt;
    }

    const mime = String(mimeType || '').trim().toLowerCase().split(';')[0];
    const map = {
        'image/png': 'png',
        'image/jpeg': 'jpeg',
        'image/jpg': 'jpeg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'application/pdf': 'pdf',
        'text/plain': 'txt',
        'text/csv': 'csv',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'application/zip': 'zip',
        'application/x-zip-compressed': 'zip',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
        'video/mp4': 'mp4'
    };
    return map[mime] || 'bin';
}

function normalizeAssetUploadKind(value = '') {
    const clean = String(value || '').trim().toLowerCase();
    if (clean === 'quick_reply' || clean === 'quickreply' || clean === 'quick-reply') return 'quick_reply';
    return 'image';
}

function parseAssetUploadPayload(body = {}, options = {}) {
    const source = body && typeof body === 'object' ? body : {};
    const dataUrl = String(source.dataUrl || source.data || '').trim();
    const base64Raw = String(source.base64 || '').trim();

    if (!dataUrl && !base64Raw) {
        throw new Error('No se recibio archivo para subir.');
    }

    let mimeType = String(source.mimeType || source.contentType || '').trim().toLowerCase();
    const kind = normalizeAssetUploadKind(source.kind || source.assetKind || source.scopeKind || '');
    let base64Data = base64Raw;

    if (dataUrl) {
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
        if (!match) {
            throw new Error('Formato dataUrl invalido.');
        }
        mimeType = String(match[1] || mimeType || '').trim().toLowerCase();
        base64Data = String(match[2] || '').trim();
    }

    const allowedMimes = kind === 'quick_reply'
        ? (options.allowedQuickReplyMimes || ADMIN_ASSET_ALLOWED_MIME_TYPES_QUICK_REPLY)
        : ADMIN_ASSET_ALLOWED_MIME_TYPES_IMAGE;
    const fallbackQuickReplyMaxBytes = Math.max(500 * 1024, Number(options.fallbackQuickReplyMaxBytes || ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || 8 * 1024 * 1024));
    const configuredQuickReplyMaxBytes = Math.max(500 * 1024, Number(options.maxQuickReplyBytes || fallbackQuickReplyMaxBytes || 8 * 1024 * 1024));
    const maxBytes = kind === 'quick_reply'
        ? configuredQuickReplyMaxBytes
        : ADMIN_ASSET_UPLOAD_MAX_BYTES;

    if (!allowedMimes.has(mimeType)) {
        if (kind === 'quick_reply') {
            throw new Error('Formato no permitido para respuestas rapidas.');
        }
        throw new Error('Formato de imagen no permitido. Usa JPG, PNG o WEBP.');
    }

    let buffer;
    try {
        buffer = Buffer.from(base64Data, 'base64');
    } catch (_) {
        throw new Error('El archivo no es base64 valido.');
    }

    if (!buffer || !buffer.length) {
        throw new Error('El archivo esta vacio.');
    }

    if (buffer.length > maxBytes) {
        throw new Error('El archivo supera el tamano permitido.');
    }

    return {
        kind,
        mimeType,
        buffer,
        fileName: String(source.fileName || source.filename || '').trim() || 'archivo'
    };
}

async function saveAssetFile({ tenantId = 'default', scope = 'general', mimeType = 'image/png', fileName = 'archivo', buffer = Buffer.alloc(0) } = {}) {
    const cleanTenant = sanitizeStorageSegment(tenantId, 'default');
    const cleanScope = sanitizeStorageSegment(scope, 'general');
    const ext = normalizeAssetExtension(fileName, mimeType);
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const baseName = sanitizeStorageSegment(path.parse(fileName).name || 'archivo', 'archivo').slice(0, 32);
    const suffix = crypto.randomBytes(5).toString('hex');
    const outName = baseName + '_' + suffix + '.' + ext;

    const relativeParts = ['saas-assets', cleanTenant, cleanScope, yyyy, mm, dd, outName];
    const relativePath = relativeParts.join('/');
    const absolutePath = path.join(UPLOADS_ROOT, ...relativeParts);

    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, buffer);

    return {
        relativePath,
        relativeUrl: '/uploads/' + relativePath,
        absolutePath
    };
}

function resolveTenantQuickReplyAssetLimits(tenantId = 'default') {
    const tenant = tenantService.findTenantById(tenantId) || tenantService.DEFAULT_TENANT || { plan: 'starter' };
    const limits = planLimitsService.getTenantPlanLimits(tenant) || {};
    const fallbackUploadMb = Math.max(1, Math.floor((ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || (8 * 1024 * 1024)) / (1024 * 1024)));
    const maxUploadMb = Math.max(1, Math.min(1024, Number(limits.quickReplyMaxUploadMb || fallbackUploadMb) || fallbackUploadMb));
    const storageQuotaMbRaw = Number(limits.quickReplyStorageQuotaMb || 0);
    const storageQuotaMb = Number.isFinite(storageQuotaMbRaw) ? Math.max(0, Math.floor(storageQuotaMbRaw)) : 0;
    return {
        maxUploadMb,
        maxUploadBytes: Math.max(500 * 1024, Math.floor(maxUploadMb * 1024 * 1024)),
        storageQuotaMb,
        storageQuotaBytes: storageQuotaMb > 0 ? Math.floor(storageQuotaMb * 1024 * 1024) : 0
    };
}

async function estimateDirectorySizeBytes(dirPath = '') {
    const cleanDirPath = String(dirPath || '').trim();
    if (!cleanDirPath) return 0;
    let entries = [];
    try {
        entries = await fs.promises.readdir(cleanDirPath, { withFileTypes: true });
    } catch (_) {
        return 0;
    }
    let total = 0;
    for (const entry of entries) {
        if (!entry) continue;
        const absolute = path.join(cleanDirPath, entry.name);
        if (entry.isDirectory()) {
            total += await estimateDirectorySizeBytes(absolute);
            continue;
        }
        if (!entry.isFile()) continue;
        try {
            const stats = await fs.promises.stat(absolute);
            total += Number(stats?.size || 0) || 0;
        } catch (_) {
            // ignore unreadable file and continue
        }
    }
    return total;
}

function resolveRequestId(req = {}) {
    const fromHeader = String(req.headers?.['x-request-id'] || req.headers?.['x-correlation-id'] || '').trim();
    if (fromHeader) return fromHeader;
    try {
        return crypto.randomUUID();
    } catch (_) {
        return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    }
}

function getOpsTokenFromRequest(req = {}) {
    const fromHeader = String(req.headers?.['x-ops-token'] || '').trim();
    if (fromHeader) return fromHeader;
    const authHeader = String(req.headers?.authorization || '').trim();
    if (/^bearer\s+/i.test(authHeader)) return authHeader.replace(/^bearer\s+/i, '').trim();
    return '';
}

function hasOpsAccess(req = {}) {
    if (!opsApiToken) return true;
    const incoming = getOpsTokenFromRequest(req);
    if (!incoming) return false;
    const left = Buffer.from(opsApiToken, 'utf8');
    const right = Buffer.from(incoming, 'utf8');
    if (left.length !== right.length) return false;
    try {
        return crypto.timingSafeEqual(left, right);
    } catch (_) {
        return false;
    }
}

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
const socketManager = new SocketManager(io);

// Basic Route
app.get('/', (req, res) => {
    res.send('WhatsApp Business API V4 - Robust & Modular');
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

app.get('/api/ops/health', (req, res) => {
    if (!hasOpsAccess(req)) return res.status(401).json({ ok: false, error: 'No autorizado para operacion.' });
    const runtime = typeof waClient.getRuntimeInfo === 'function'
        ? waClient.getRuntimeInfo()
        : { requestedTransport: 'idle', activeTransport: 'idle' };

    return res.json({
        ok: true,
        requestId: req.requestId || null,
        now: new Date().toISOString(),
        uptimeSec: Math.max(0, Math.floor(process.uptime())),
        runtime,
        waReady: Boolean(waClient.isReady)
    });
});

app.get('/api/ops/ready', (req, res) => {
    if (!hasOpsAccess(req)) return res.status(401).json({ ok: false, error: 'No autorizado para operacion.' });

    const runtime = typeof waClient.getRuntimeInfo === 'function'
        ? waClient.getRuntimeInfo()
        : { requestedTransport: 'idle', activeTransport: 'idle' };
    const waReady = Boolean(waClient.isReady);
    const ready = opsReadyRequireWa ? waReady : true;

    return res.status(ready ? 200 : 503).json({
        ok: ready,
        requestId: req.requestId || null,
        ready,
        checks: {
            process: true,
            wa: waReady,
            waReady,
            waRequired: Boolean(opsReadyRequireWa)
        },
        runtime
    });
});

app.get('/api/ops/metrics', (req, res) => {
    if (!hasOpsAccess(req)) return res.status(401).json({ ok: false, error: 'No autorizado para operacion.' });

    const runtime = typeof waClient.getRuntimeInfo === 'function'
        ? waClient.getRuntimeInfo()
        : { requestedTransport: 'idle', activeTransport: 'idle' };
    const snapshot = opsTelemetry.buildSnapshot({
        waRuntime: runtime,
        waReady: Boolean(waClient.isReady),
        saasEnabled: tenantService.isSaasEnabled(),
        authEnabled: authService.isAuthEnabled()
    });

    return res.json({ ok: true, requestId: req.requestId || null, ...snapshot });
});

app.get('/api/saas/runtime', async (req, res) => {
    const authContext = req.authContext || { enabled: false, isAuthenticated: false, user: null };
    const authEnabled = authService.isAuthEnabled();
    const isAuthenticated = Boolean(authContext?.isAuthenticated && authContext?.user);

    const allTenants = tenantService.getTenants();
    const allowedTenants = isAuthenticated
        ? authService.getAllowedTenantsForUser(authContext?.user || {}, allTenants)
        : allTenants;

    // Avoid exposing tenant/company data before login when SaaS auth is enabled.
    const exposeTenantData = !authEnabled || isAuthenticated;
    const runtimeTenants = exposeTenantData ? allowedTenants : [];

    const requestedTenantId = String(req?.tenantContext?.id || '').trim();
    const fallbackTenant = req.tenantContext || tenantService.DEFAULT_TENANT;
    const effectiveTenant = exposeTenantData
        ? (runtimeTenants.find((tenant) => String(tenant?.id || '').trim() === requestedTenantId)
            || runtimeTenants[0]
            || fallbackTenant)
        : fallbackTenant;

    const tenantId = String(effectiveTenant?.id || 'default');
    const authUser = authContext?.user && typeof authContext.user === 'object' ? authContext.user : null;
    const runtimeUserId = String(authUser?.userId || authUser?.id || '').trim();

    let tenantSettings = null;
    let waModules = [];
    let selectedWaModule = null;

    if (exposeTenantData) {
        tenantSettings = await tenantSettingsService.getTenantSettings(tenantId);
        waModules = await waModuleService.listModules(tenantId, {
            includeInactive: false,
            userId: runtimeUserId
        });
        selectedWaModule = await waModuleService.getSelectedModule(tenantId, {
            userId: runtimeUserId
        });
    }

    return res.json({
        ok: true,
        saasEnabled: tenantService.isSaasEnabled(),
        authEnabled,
        socketAuthRequired: saasSocketAuthRequired,
        tenant: exposeTenantData ? toPublicTenant(effectiveTenant) : null,
        tenantSettings: exposeTenantData ? tenantSettings : null,
        waModules: exposeTenantData ? waModules : [],
        selectedWaModule: exposeTenantData ? selectedWaModule : null,
        tenants: exposeTenantData ? (runtimeTenants || []).map(toPublicTenant).filter(Boolean) : [],
        authContext: {
            enabled: Boolean(authContext.enabled),
            isAuthenticated: Boolean(authContext.isAuthenticated),
            user: authContext.user || null
        }
    });
});

registerSecurityAuthHttpRoutes({
    app,
    isProduction,
    authService,
    authRecoveryService,
    auditLogService,
    tenantService,
    toPublicTenant
});
registerSecurityAccessControlHttpRoutes({
    app,
    saasControlService,
    aiUsageService,
    accessPolicyService,
    planLimitsService,
    planLimitsStoreService,
    hasSaasControlReadAccess,
    hasSaasControlWriteAccess,
    getAuthRole,
    filterAdminOverviewByScope,
    sanitizeObjectPayload
});

function getAuthRole(req = {}) {
    return accessPolicyService.normalizeRole(req?.authContext?.user?.role || 'seller');
}

function getUserPermissions(req = {}) {
    const raw = Array.isArray(req?.authContext?.user?.permissions)
        ? req.authContext.user.permissions
        : [];
    return new Set(
        raw
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
    );
}

function hasPermission(req = {}, permission = '') {
    const key = String(permission || '').trim();
    if (!key) return false;
    if (!authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) return false;
    if (authContext.user?.isSuperAdmin) return true;
    return getUserPermissions(req).has(key);
}

function hasAnyPermission(req = {}, permissions = []) {
    const source = Array.isArray(permissions) ? permissions : [];
    return source.some((permission) => hasPermission(req, permission));
}

function getAllowedTenantIdsFromAuth(req = {}) {
    const memberships = Array.isArray(req?.authContext?.user?.memberships)
        ? req.authContext.user.memberships
        : [];
    const allowed = memberships
        .filter((membership) => membership?.active !== false)
        .map((membership) => String(membership?.tenantId || '').trim())
        .filter(Boolean);

    if (!allowed.length) {
        const fallback = String(req?.authContext?.user?.tenantId || req?.tenantContext?.id || '').trim();
        if (fallback) return [fallback];
    }

    return Array.from(new Set(allowed));
}

function hasSaasControlReadAccess(req = {}, { requireSuperAdmin = false } = {}) {
    if (requireSuperAdmin) {
        return Boolean(req?.authContext?.user?.isSuperAdmin);
    }

    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.PLATFORM_OVERVIEW_READ,
        accessPolicyService.PERMISSIONS.TENANT_OVERVIEW_READ
    ]);
}

function hasSaasControlWriteAccess(req = {}, { requireSuperAdmin = false } = {}) {
    if (!authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) return false;

    if (requireSuperAdmin) return Boolean(authContext.user?.isSuperAdmin);

    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.PLATFORM_TENANTS_MANAGE,
        accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE
    ]);
}

function hasTenantAdminWriteAccess(req = {}) {
    return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_USERS_MANAGE);
}

function isTenantAllowedForUser(req = {}, tenantId = '') {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) return false;
    if (req?.authContext?.user?.isSuperAdmin) return true;
    const allowed = getAllowedTenantIdsFromAuth(req);
    return allowed.includes(cleanTenantId);
}

function hasTenantModuleReadAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!isTenantAllowedForUser(req, tenantId)) return false;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_MODULES_READ,
        accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_READ
    ]);
}

function hasTenantModuleWriteAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!isTenantAllowedForUser(req, tenantId)) return false;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE,
        accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE
    ]);
}

function hasConversationEventsReadAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!isTenantAllowedForUser(req, tenantId)) return false;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_CONVERSATION_EVENTS_READ,
        accessPolicyService.PERMISSIONS.TENANT_CHAT_OPERATE,
        accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
    ]);
}

function hasChatAssignmentsReadAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!isTenantAllowedForUser(req, tenantId)) return false;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_READ,
        accessPolicyService.PERMISSIONS.TENANT_CHAT_OPERATE,
        accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
    ]);
}

function hasChatAssignmentsWriteAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!isTenantAllowedForUser(req, tenantId)) return false;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_MANAGE,
        accessPolicyService.PERMISSIONS.TENANT_USERS_MANAGE
    ]);
}

function hasAssignmentRulesReadAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!isTenantAllowedForUser(req, tenantId)) return false;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_ASSIGNMENT_RULES_READ,
        accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_READ,
        accessPolicyService.PERMISSIONS.TENANT_CHAT_OPERATE,
        accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
    ]);
}

function hasAssignmentRulesWriteAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!isTenantAllowedForUser(req, tenantId)) return false;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_ASSIGNMENT_RULES_MANAGE,
        accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_MANAGE,
        accessPolicyService.PERMISSIONS.TENANT_USERS_MANAGE
    ]);
}

function hasOperationsKpiReadAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!isTenantAllowedForUser(req, tenantId)) return false;
    return hasAnyPermission(req, [
        accessPolicyService.PERMISSIONS.TENANT_KPIS_READ,
        accessPolicyService.PERMISSIONS.TENANT_CONVERSATION_EVENTS_READ,
        accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_READ,
        accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
    ]);
}

function normalizeScopeModuleId(value = '') {
    return String(value || '').trim().toLowerCase();
}
function resolvePrimaryRoleFromMemberships(memberships = [], fallbackRole = 'seller') {
    const list = Array.isArray(memberships) ? memberships : [];
    const primary = list.find((item) => item?.active !== false) || list[0] || null;
    const role = String(primary?.role || fallbackRole || 'seller').trim().toLowerCase();
    return accessPolicyService.normalizeRole(role);
}

function canActorAssignRole(req = {}, targetRole = 'seller') {
    return accessPolicyService.canAssignRole({
        actorRole: getAuthRole(req),
        isActorSuperAdmin: Boolean(req?.authContext?.user?.isSuperAdmin),
        targetRole
    });
}

function canActorEditOptionalAccess(req = {}) {
    return accessPolicyService.canEditOptionalAccess({
        actorRole: getAuthRole(req),
        isActorSuperAdmin: Boolean(req?.authContext?.user?.isSuperAdmin)
    });
}

const ROLE_PRIORITY = Object.freeze({
    seller: 1,
    admin: 2,
    owner: 3,
    superadmin: 4
});

function getRolePriority(role = 'seller') {
    const cleanRole = String(role || '').trim().toLowerCase();
    return ROLE_PRIORITY[cleanRole] || ROLE_PRIORITY.seller;
}

function getAuthUserId(req = {}) {
    return String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim();
}

function isSelfUserAction(req = {}, targetUserId = '') {
    const actorUserId = getAuthUserId(req);
    const cleanTargetUserId = String(targetUserId || '').trim();
    return Boolean(actorUserId && cleanTargetUserId && actorUserId === cleanTargetUserId);
}

function getUserPrimaryRole(user = {}) {
    const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
    return resolvePrimaryRoleFromMemberships(memberships, user?.role || 'seller');
}

function isActorSuperiorToRole(req = {}, targetRole = 'seller') {
    if (req?.authContext?.user?.isSuperAdmin) return true;
    const actorRole = getAuthRole(req);
    return getRolePriority(actorRole) > getRolePriority(targetRole);
}

function canActorManageRoleChanges(req = {}) {
    if (req?.authContext?.user?.isSuperAdmin) return true;
    const actorRole = getAuthRole(req);
    if (actorRole === 'owner') return true;
    if (actorRole === 'admin') {
        return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_USERS_OWNER_ASSIGN);
    }
    return false;
}
function hasAnyAccessOverride(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const hasGrants = Object.prototype.hasOwnProperty.call(source, 'permissionGrants');
    const hasPacks = Object.prototype.hasOwnProperty.call(source, 'permissionPacks');
    if (!hasGrants && !hasPacks) return false;
    const grants = Array.isArray(source.permissionGrants) ? source.permissionGrants : [];
    const packs = Array.isArray(source.permissionPacks) ? source.permissionPacks : [];
    return grants.length > 0 || packs.length > 0;
}

function filterAdminOverviewByScope(req = {}, overview = {}) {
    if (req?.authContext?.user?.isSuperAdmin) return overview;

    const allowed = new Set(getAllowedTenantIdsFromAuth(req));
    const tenants = Array.isArray(overview?.tenants)
        ? overview.tenants.filter((tenant) => allowed.has(String(tenant?.id || '').trim()))
        : [];
    const users = Array.isArray(overview?.users)
        ? overview.users.filter((user) => (Array.isArray(user?.memberships) ? user.memberships : []).some((membership) => allowed.has(String(membership?.tenantId || '').trim())))
        : [];
    const metrics = Array.isArray(overview?.metrics)
        ? overview.metrics.filter((item) => allowed.has(String(item?.tenantId || '').trim()))
        : [];

    return { tenants, users, metrics };
}

function sanitizeMembershipPayload(memberships = []) {
    const source = Array.isArray(memberships) ? memberships : [];
    const normalized = source
        .map((item) => ({
            tenantId: String(item?.tenantId || item?.tenant || item?.id || '').trim(),
            role: String(item?.role || 'seller').trim().toLowerCase() || 'seller',
            active: item?.active !== false
        }))
        .filter((item) => Boolean(item.tenantId));

    if (!normalized.length) return [];
    const primary = normalized.find((item) => item.active !== false) || normalized[0];
    return [primary];
}


function sanitizeObjectPayload(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function sanitizeUrlValue(value = '') {
    const textValue = String(value || '').trim();
    if (!textValue) return null;
    return /^https?:\/\//i.test(textValue) ? textValue : null;
}

function sanitizeTenantPayload(payload = {}) {
    const source = sanitizeObjectPayload(payload);
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(source, 'id') || Object.prototype.hasOwnProperty.call(source, 'tenantId')) {
        const id = String(source.id || source.tenantId || '').trim();
        if (id) patch.id = id;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'slug')) patch.slug = String(source.slug || '').trim();
    if (Object.prototype.hasOwnProperty.call(source, 'name')) patch.name = String(source.name || '').trim();
    if (Object.prototype.hasOwnProperty.call(source, 'plan')) patch.plan = String(source.plan || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(source, 'active')) patch.active = source.active !== false;
    if (Object.prototype.hasOwnProperty.call(source, 'logoUrl') || Object.prototype.hasOwnProperty.call(source, 'logo_url')) {
        patch.logoUrl = sanitizeUrlValue(source.logoUrl || source.logo_url);
    }
    if (Object.prototype.hasOwnProperty.call(source, 'coverImageUrl') || Object.prototype.hasOwnProperty.call(source, 'cover_image_url')) {
        patch.coverImageUrl = sanitizeUrlValue(source.coverImageUrl || source.cover_image_url);
    }

    return patch;
}

function sanitizeUserPayload(payload = {}, { allowMemberships = true } = {}) {
    const source = sanitizeObjectPayload(payload);
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(source, 'id') || Object.prototype.hasOwnProperty.call(source, 'userId')) {
        const id = String(source.id || source.userId || '').trim();
        if (id) patch.id = id;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'email')) patch.email = String(source.email || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(source, 'name')) patch.name = String(source.name || '').trim();
    if (Object.prototype.hasOwnProperty.call(source, 'password')) patch.password = String(source.password || '');
    if (Object.prototype.hasOwnProperty.call(source, 'active')) patch.active = source.active !== false;
    if (Object.prototype.hasOwnProperty.call(source, 'avatarUrl') || Object.prototype.hasOwnProperty.call(source, 'avatar_url')) {
        patch.avatarUrl = sanitizeUrlValue(source.avatarUrl || source.avatar_url);
    }
    if (Object.prototype.hasOwnProperty.call(source, 'permissionGrants')) {
        patch.permissionGrants = accessPolicyService.normalizePermissionList(source.permissionGrants);
    }
    if (Object.prototype.hasOwnProperty.call(source, 'permissionPacks')) {
        patch.permissionPacks = accessPolicyService.normalizePackList(source.permissionPacks);
    }
    if (Object.prototype.hasOwnProperty.call(source, 'role')) {
        patch.role = accessPolicyService.normalizeRole(source.role || 'seller');
    }
    if (allowMemberships && Object.prototype.hasOwnProperty.call(source, 'memberships')) {
        patch.memberships = sanitizeMembershipPayload(source.memberships);
    }

    return patch;
}

function hasOwnerRoleMembership(memberships = []) {
    const source = Array.isArray(memberships) ? memberships : [];
    return source.some((item) => String(item?.role || '').trim().toLowerCase() === 'owner');
}

function sanitizeCatalogIdListPayload(value = []) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const out = [];
    source.forEach((entry) => {
        const clean = String(entry || '').trim().toUpperCase();
        if (!/^CAT-[A-Z0-9]{4,}$/.test(clean)) return;
        if (seen.has(clean)) return;
        seen.add(clean);
        out.push(clean);
    });
    return out;
}

function sanitizeAiAssistantIdPayload(value = '') {
    const clean = String(value || '').trim().toUpperCase();
    if (!clean) return null;
    return /^AIA-[A-Z0-9]{6}$/.test(clean) ? clean : null;
}

function sanitizeWaModulePayload(payload = {}, { allowModuleId = true } = {}) {
    const source = sanitizeObjectPayload(payload);
    const sourceMetadata = sanitizeObjectPayload(source.metadata);
    const topCloudConfig = sanitizeObjectPayload(source.cloudConfig);
    const nestedCloudConfig = sanitizeObjectPayload(sourceMetadata.cloudConfig);
    const cloudConfig = Object.keys(topCloudConfig).length > 0
        ? { ...nestedCloudConfig, ...topCloudConfig }
        : nestedCloudConfig;

    const metadataModuleSettings = sanitizeObjectPayload(sourceMetadata.moduleSettings);
    const incomingCatalogIds = sanitizeCatalogIdListPayload(
        Array.isArray(source.catalogIds)
            ? source.catalogIds
            : (Array.isArray(metadataModuleSettings.catalogIds) ? metadataModuleSettings.catalogIds : [])
    );
    const incomingAiAssistantId = sanitizeAiAssistantIdPayload(
        source.aiAssistantId
        || source.moduleAiAssistantId
        || metadataModuleSettings.aiAssistantId
    );

    const base = {
        name: String(source.name || '').trim(),
        phoneNumber: String(source.phoneNumber || source.phone || source.number || '').trim() || null,
        transportMode: String(source.transportMode || source.transport || source.mode || '').trim().toLowerCase() || 'cloud',
        imageUrl: sanitizeUrlValue(source.imageUrl || source.image_url || source.logoUrl || source.logo_url),
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        isSelected: source.isSelected === true,
        assignedUserIds: Array.isArray(source.assignedUserIds)
            ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [],
        metadata: {
            ...sourceMetadata,
            moduleSettings: {
                ...metadataModuleSettings,
                catalogIds: incomingCatalogIds,
                aiAssistantId: incomingAiAssistantId
            },
            cloudConfig
        }
    };

    if (allowModuleId) {
        const moduleId = String(source.moduleId || source.id || '').trim();
        if (moduleId) base.moduleId = moduleId;
    }

    return base;
}

function sanitizeAiAssistantPayload(payload = {}, { allowAssistantId = true } = {}) {
    const source = sanitizeObjectPayload(payload);
    const base = {
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        provider: String(source.provider || 'openai').trim().toLowerCase() || 'openai',
        model: String(source.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        systemPrompt: String(source.systemPrompt || '').trim() || null,
        temperature: Math.max(0, Math.min(2, Number(source.temperature ?? 0.7) || 0.7)),
        topP: Math.max(0, Math.min(1, Number(source.topP ?? 1) || 1)),
        maxTokens: Math.max(64, Math.min(4096, Number(source.maxTokens ?? 800) || 800)),
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true
    };

    const openaiApiKey = String(source.openaiApiKey || source.apiKey || '').trim();
    if (openaiApiKey) base.openaiApiKey = openaiApiKey;

    if (allowAssistantId) {
        const assistantId = sanitizeAiAssistantIdPayload(source.assistantId || source.id || '');
        if (assistantId) base.assistantId = assistantId;
    }

    return base;
}

function sanitizeQuickReplyLibraryPayload(payload = {}, { allowLibraryId = true } = {}) {
    const source = sanitizeObjectPayload(payload);
    const cleanLibraryId = quickReplyLibrariesService.normalizeLibraryId(source.libraryId || source.id || '');
    const moduleIds = Array.isArray(source.moduleIds)
        ? Array.from(new Set(source.moduleIds.map((entry) => quickReplyLibrariesService.normalizeModuleId(entry)).filter(Boolean)))
        : [];

    const parsedSortOrder = Number.parseInt(String(source.sortOrder ?? ''), 10);
    const sortOrder = Number.isFinite(parsedSortOrder) ? Math.max(1, parsedSortOrder) : 1000;
    const isShared = source.isShared !== false;

    const base = {
        name: String(source.name || source.libraryName || '').trim(),
        description: String(source.description || '').trim() || '',
        isShared,
        isActive: source.isActive !== false,
        sortOrder,
        moduleIds: isShared ? [] : moduleIds
    };

    if (allowLibraryId && cleanLibraryId) base.libraryId = cleanLibraryId;
    return base;
}

function normalizeQuickReplyMediaAsset(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const url = String(source.url || source.mediaUrl || source.media_url || '').trim();
    if (!url) return null;
    const mimeType = String(source.mimeType || source.mediaMimeType || source.media_mime_type || '').trim().toLowerCase() || null;
    const fileName = String(source.fileName || source.mediaFileName || source.media_file_name || source.filename || '').trim() || null;
    const sizeRaw = Number(source.sizeBytes ?? source.mediaSizeBytes ?? source.media_size_bytes);
    const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : null;
    return {
        url,
        mimeType,
        fileName,
        sizeBytes
    };
}

function normalizeQuickReplyMediaAssets(value = [], fallback = null) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const assets = source
        .map((entry) => normalizeQuickReplyMediaAsset(entry))
        .filter(Boolean)
        .filter((entry) => {
            const dedupeKey = `${String(entry.url || '').trim()}|${String(entry.fileName || '').trim()}|${String(entry.mimeType || '').trim()}`;
            if (!dedupeKey || seen.has(dedupeKey)) return false;
            seen.add(dedupeKey);
            return true;
        });
    if (assets.length > 0) return assets;
    const fallbackAsset = normalizeQuickReplyMediaAsset(fallback);
    return fallbackAsset ? [fallbackAsset] : [];
}

function sanitizeQuickReplyItemPayload(payload = {}, { allowItemId = true } = {}) {
    const source = sanitizeObjectPayload(payload);
    const cleanItemId = quickReplyLibrariesService.normalizeItemId(source.itemId || source.id || '');
    const cleanLibraryId = quickReplyLibrariesService.normalizeLibraryId(source.libraryId || source.library || quickReplyLibrariesService.DEFAULT_LIBRARY_ID || '');
    const parsedSortOrder = Number.parseInt(String(source.sortOrder ?? ''), 10);
    const sortOrder = Number.isFinite(parsedSortOrder) ? Math.max(1, parsedSortOrder) : 1000;
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? source.metadata
        : {};
    const mediaAssets = normalizeQuickReplyMediaAssets(source.mediaAssets || metadata.mediaAssets, {
        url: source.mediaUrl || source.media_url || '',
        mimeType: source.mediaMimeType || source.media_mime_type || '',
        fileName: source.mediaFileName || source.media_file_name || '',
        sizeBytes: source.mediaSizeBytes
    });
    const primaryMedia = mediaAssets[0] || null;

    const base = {
        libraryId: cleanLibraryId,
        label: String(source.label || '').trim(),
        text: String(source.text || source.bodyText || source.body || '').trim(),
        mediaAssets,
        mediaUrl: String(primaryMedia?.url || source.mediaUrl || source.media_url || '').trim() || null,
        mediaMimeType: String(primaryMedia?.mimeType || source.mediaMimeType || source.media_mime_type || '').trim().toLowerCase() || null,
        mediaFileName: String(primaryMedia?.fileName || source.mediaFileName || source.media_file_name || '').trim() || null,
        mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes)) ? Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes) : null,
        isActive: source.isActive !== false,
        sortOrder
    };

    if (allowItemId && cleanItemId) base.itemId = cleanItemId;
    return base;
}

function sanitizeTenantLabelPayload(payload = {}, { allowLabelId = true } = {}) {
    const source = sanitizeObjectPayload(payload);
    const cleanLabelId = tenantLabelService.normalizeLabelId(source.labelId || source.id || '');
    const parsedSortOrder = Number.parseInt(String(source.sortOrder ?? ''), 10);
    const sortOrder = Number.isFinite(parsedSortOrder) ? Math.max(1, parsedSortOrder) : 1000;
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? source.metadata
        : {};

    const base = {
        name: String(source.name || source.label || '').trim(),
        description: String(source.description || '').trim(),
        color: tenantLabelService.normalizeColor(source.color || source.hex || ''),
        isActive: source.isActive !== false,
        sortOrder,
        metadata
    };

    if (allowLabelId && cleanLabelId) base.labelId = cleanLabelId;
    return base;
}

app.post('/api/admin/saas/assets/upload', async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const uploadKind = normalizeAssetUploadKind(body.kind || body.assetKind || body.scopeKind || '');
        const canUploadGenericAssets = hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_ASSETS_UPLOAD);
        const canManageQuickReplies = hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE);
        const canUploadQuickReplyAssets = uploadKind === 'quick_reply' && canManageQuickReplies;
        if (!canUploadGenericAssets && !canUploadQuickReplyAssets) {
            return res.status(403).json({ ok: false, error: 'No autorizado para subir archivos.' });
        }
        const requestedTenantId = String(body.tenantId || req?.tenantContext?.id || 'default').trim() || 'default';
        const tenantId = sanitizeStorageSegment(requestedTenantId, 'default');

        if (!req?.authContext?.user?.isSuperAdmin && !isTenantAllowedForUser(req, requestedTenantId)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a ese tenant para subir archivos.' });
        }

        const quickReplyAssetLimits = uploadKind === 'quick_reply'
            ? resolveTenantQuickReplyAssetLimits(requestedTenantId)
            : null;
        const scope = sanitizeStorageSegment(body.scope || 'general', 'general');
        const parsed = parseAssetUploadPayload(body, {
            maxQuickReplyBytes: quickReplyAssetLimits?.maxUploadBytes,
            fallbackQuickReplyMaxBytes: ADMIN_ASSET_QUICK_REPLY_MAX_BYTES
        });

        if (parsed.kind === 'quick_reply' && quickReplyAssetLimits?.storageQuotaBytes > 0) {
            const tenantAssetsRoot = path.join(UPLOADS_ROOT, 'saas-assets', tenantId);
            const usedBytes = await estimateDirectorySizeBytes(tenantAssetsRoot);
            const incomingBytes = Number(parsed?.buffer?.length || 0) || 0;
            if ((usedBytes + incomingBytes) > quickReplyAssetLimits.storageQuotaBytes) {
                throw new Error('El tenant supero la cuota de almacenamiento para respuestas rapidas.' +
                    ` (plan: ${quickReplyAssetLimits.storageQuotaMb} MB).`);
            }
        }

        const stored = await saveAssetFile({
            tenantId,
            scope,
            mimeType: parsed.mimeType,
            fileName: parsed.fileName,
            buffer: parsed.buffer
        });

        const origin = getRequestOrigin(req);
        const publicUrl = origin ? origin + stored.relativeUrl : stored.relativeUrl;

        return res.status(201).json({
            ok: true,
            tenantId,
            scope,
            limits: parsed.kind === 'quick_reply' && quickReplyAssetLimits
                ? {
                    maxUploadMb: quickReplyAssetLimits.maxUploadMb,
                    storageQuotaMb: quickReplyAssetLimits.storageQuotaMb
                }
                : undefined,
            file: {
                url: publicUrl,
                relativeUrl: stored.relativeUrl,
                relativePath: stored.relativePath,
                mimeType: parsed.mimeType,
                sizeBytes: Number(parsed.buffer?.length || 0) || 0,
                fileName: path.basename(stored.absolutePath),
                kind: parsed.kind
            }
        });
    } catch (error) {
        const message = String(error?.message || 'No se pudo subir el archivo.');
        const status = /tamano|base64|imagen|archivo|formato/i.test(message) ? 400 : 500;
        return res.status(status).json({ ok: false, error: message });
    }
});
app.get('/api/admin/saas/tenants', async (req, res) => {
    try {
        if (!hasSaasControlReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        const tenants = await saasControlService.listTenants({ includeInactive: true });
        const scoped = req?.authContext?.user?.isSuperAdmin
            ? tenants
            : tenants.filter((tenant) => isTenantAllowedForUser(req, tenant.id));

        return res.json({ ok: true, items: scoped.map((tenant) => saasControlService.sanitizeTenantPublic(tenant)) });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudieron cargar las empresas.' });
    }
});

app.post('/api/admin/saas/tenants', async (req, res) => {
    try {
        if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) {
            return res.status(403).json({ ok: false, error: 'Solo superadmin puede crear empresas.' });
        }

        const payload = sanitizeTenantPayload(req.body);
        const snapshot = await saasControlService.createTenant(payload);
        const createdId = String(payload.id || payload.tenantId || '').trim();
        const tenant = Array.isArray(snapshot?.tenants) ? snapshot.tenants.find((item) => item.id === createdId) : null;

        return res.status(201).json({ ok: true, tenant: tenant ? saasControlService.sanitizeTenantPublic(tenant) : null });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear empresa.') });
    }
});

app.put('/api/admin/saas/tenants/:tenantId', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
    if (!hasSaasControlWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
    if (!isTenantAllowedForUser(req, tenantId) && !req?.authContext?.user?.isSuperAdmin) return res.status(403).json({ ok: false, error: 'No tienes acceso a esta empresa.' });

    try {
        const payload = sanitizeTenantPayload(req.body);
        const snapshot = await saasControlService.updateTenant(tenantId, payload);
        const tenant = Array.isArray(snapshot?.tenants) ? snapshot.tenants.find((item) => item.id === tenantId) : null;
        return res.json({ ok: true, tenant: tenant ? saasControlService.sanitizeTenantPublic(tenant) : null });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar empresa.') });
    }
});

app.delete('/api/admin/saas/tenants/:tenantId', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
    if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) return res.status(403).json({ ok: false, error: 'Solo superadmin puede desactivar empresas.' });

    try {
        await saasControlService.deleteTenant(tenantId);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar empresa.') });
    }
});

app.get('/api/admin/saas/users', async (req, res) => {
    try {
        if (!hasSaasControlReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

        const tenantId = String(req.query?.tenantId || '').trim();
        if (tenantId && !isTenantAllowedForUser(req, tenantId)) return res.status(403).json({ ok: false, error: 'No tienes acceso a ese tenant.' });

        const users = await saasControlService.listUsers({ includeInactive: true, tenantId: tenantId || '' });
        const scoped = req?.authContext?.user?.isSuperAdmin
            ? users
            : users.filter((user) => (Array.isArray(user?.memberships) ? user.memberships : []).some((membership) => isTenantAllowedForUser(req, membership?.tenantId)));

        return res.json({ ok: true, items: scoped.map((user) => saasControlService.sanitizeUserPublic(user)) });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudieron cargar usuarios.' });
    }
});

app.post('/api/admin/saas/users', async (req, res) => {
    try {
        if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para crear usuarios.' });

        const payload = sanitizeUserPayload(req.body, { allowMemberships: true });
        payload.memberships = sanitizeMembershipPayload(payload.memberships);

        if (!payload.memberships.length) {
            return res.status(400).json({ ok: false, error: 'Debes asignar al menos una empresa al usuario.' });
        }

        const targetRole = resolvePrimaryRoleFromMemberships(payload.memberships, payload.role || 'seller');
        if (!canActorAssignRole(req, targetRole)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para asignar ese rol.' });
        }

        if (!req?.authContext?.user?.isSuperAdmin) {
            const invalid = payload.memberships.some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
            if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar empresas fuera de tu alcance.' });
            if (hasAnyAccessOverride(payload) && !canActorEditOptionalAccess(req)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para editar accesos opcionales.' });
            }
        }

        delete payload.role;
        const snapshot = await saasControlService.createUser(payload);
        const createdId = String(payload.id || payload.userId || '').trim();
        const user = Array.isArray(snapshot?.users)
            ? snapshot.users.find((item) => {
                if (createdId && String(item?.id || '').trim() === createdId) return true;
                return String(item?.email || '').trim().toLowerCase() === String(payload.email || '').trim().toLowerCase();
            })
            : null;
        return res.status(201).json({ ok: true, user: user ? saasControlService.sanitizeUserPublic(user) : null });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear usuario.') });
    }
});

app.put('/api/admin/saas/users/:userId', async (req, res) => {
    try {
        if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para editar usuarios.' });
        const userId = String(req.params?.userId || '').trim();
        if (!userId) return res.status(400).json({ ok: false, error: 'userId invalido.' });

        const currentUsers = await saasControlService.listUsers({ includeInactive: true });
        const targetUser = (Array.isArray(currentUsers) ? currentUsers : []).find((item) => String(item?.id || '').trim() === userId) || null;
        if (!targetUser) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });

        const payload = sanitizeUserPayload(req.body, { allowMemberships: true });
        if (payload.memberships) payload.memberships = sanitizeMembershipPayload(payload.memberships);

        if (Object.prototype.hasOwnProperty.call(payload, 'role') && !Array.isArray(payload.memberships)) {
            const currentMemberships = sanitizeMembershipPayload(targetUser.memberships || []);
            const currentTenantId = String(currentMemberships[0]?.tenantId || '').trim();
            payload.memberships = sanitizeMembershipPayload([{ tenantId: currentTenantId, role: payload.role, active: true }]);
        }

        const resultingMemberships = Array.isArray(payload.memberships) && payload.memberships.length > 0
            ? payload.memberships
            : sanitizeMembershipPayload(targetUser.memberships || []);

        const targetRoleBefore = getUserPrimaryRole(targetUser);
        const targetRoleAfter = resolvePrimaryRoleFromMemberships(resultingMemberships, payload.role || targetRoleBefore || 'seller');
        const isSelf = isSelfUserAction(req, userId);
        const touchesRole = Boolean(Array.isArray(payload.memberships) || Object.prototype.hasOwnProperty.call(payload, 'role'));
        const touchesOptionalAccess = hasAnyAccessOverride(payload);

        if (!req?.authContext?.user?.isSuperAdmin) {
            const targetInScope = sanitizeMembershipPayload(targetUser.memberships || []).some((membership) => isTenantAllowedForUser(req, membership.tenantId));
            if (!targetInScope) {
                return res.status(403).json({ ok: false, error: 'No puedes editar usuarios fuera de tu alcance.' });
            }

            const invalid = resultingMemberships.some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
            if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar empresas fuera de tu alcance.' });

            if (!isSelf && !isActorSuperiorToRole(req, targetRoleBefore)) {
                return res.status(403).json({ ok: false, error: 'No puedes editar usuarios con rol igual o superior al tuyo.' });
            }

            if (touchesRole) {
                if (isSelf) {
                    return res.status(403).json({ ok: false, error: 'No puedes editar tu propio rol.' });
                }
                if (!canActorManageRoleChanges(req)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para editar roles de usuarios.' });
                }
                if (!canActorAssignRole(req, targetRoleAfter)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para administrar ese rol.' });
                }
            }

            if (touchesOptionalAccess) {
                if (isSelf) {
                    return res.status(403).json({ ok: false, error: 'No puedes editar tus propios accesos opcionales.' });
                }
                if (!canActorEditOptionalAccess(req)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para editar accesos opcionales.' });
                }
            }
        }

        delete payload.role;
        const snapshot = await saasControlService.updateUser(userId, payload);
        const user = Array.isArray(snapshot?.users) ? snapshot.users.find((item) => item.id === userId) : null;
        return res.json({ ok: true, user: user ? saasControlService.sanitizeUserPublic(user) : null });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar usuario.') });
    }
});

app.put('/api/admin/saas/users/:userId/memberships', async (req, res) => {
    try {
        if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para editar membresias.' });
        const userId = String(req.params?.userId || '').trim();
        if (!userId) return res.status(400).json({ ok: false, error: 'userId invalido.' });

        const memberships = sanitizeMembershipPayload(req.body?.memberships || []);
        if (!memberships.length) return res.status(400).json({ ok: false, error: 'Debes enviar al menos una membresia.' });

        const currentUsers = await saasControlService.listUsers({ includeInactive: true });
        const targetUser = (Array.isArray(currentUsers) ? currentUsers : []).find((item) => String(item?.id || '').trim() === userId) || null;
        if (!targetUser) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });

        const targetRoleBefore = getUserPrimaryRole(targetUser);
        const targetRole = resolvePrimaryRoleFromMemberships(memberships, targetRoleBefore || 'seller');
        const isSelf = isSelfUserAction(req, userId);

        if (!req?.authContext?.user?.isSuperAdmin) {
            const targetInScope = sanitizeMembershipPayload(targetUser.memberships || []).some((membership) => isTenantAllowedForUser(req, membership.tenantId));
            if (!targetInScope) return res.status(403).json({ ok: false, error: 'No puedes editar usuarios fuera de tu alcance.' });

            if (isSelf) return res.status(403).json({ ok: false, error: 'No puedes editar tu propio rol.' });
            if (!isActorSuperiorToRole(req, targetRoleBefore)) {
                return res.status(403).json({ ok: false, error: 'No puedes editar usuarios con rol igual o superior al tuyo.' });
            }
            if (!canActorManageRoleChanges(req)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para editar roles de usuarios.' });
            }

            const invalid = memberships.some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
            if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar empresas fuera de tu alcance.' });
        }

        if (!canActorAssignRole(req, targetRole)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para asignar ese rol.' });
        }

        const snapshot = await saasControlService.setUserMemberships(userId, memberships);
        const user = Array.isArray(snapshot?.users) ? snapshot.users.find((item) => item.id === userId) : null;
        return res.json({ ok: true, user: user ? saasControlService.sanitizeUserPublic(user) : null });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar membresias.') });
    }
});

app.delete('/api/admin/saas/users/:userId', async (req, res) => {
    try {
        if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para desactivar usuarios.' });
        const userId = String(req.params?.userId || '').trim();
        if (!userId) return res.status(400).json({ ok: false, error: 'userId invalido.' });

        const currentUsers = await saasControlService.listUsers({ includeInactive: true });
        const targetUser = (Array.isArray(currentUsers) ? currentUsers : []).find((item) => String(item?.id || '').trim() === userId) || null;
        if (!targetUser) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });

        const targetRole = getUserPrimaryRole(targetUser);
        const isSelf = isSelfUserAction(req, userId);

        if (!req?.authContext?.user?.isSuperAdmin) {
            const memberships = sanitizeMembershipPayload(targetUser.memberships || []);
            const targetInScope = memberships.some((membership) => isTenantAllowedForUser(req, membership.tenantId));
            if (!targetInScope) return res.status(403).json({ ok: false, error: 'No puedes desactivar usuarios fuera de tu alcance.' });

            if (isSelf) {
                return res.status(403).json({ ok: false, error: 'No puedes desactivar tu propio usuario.' });
            }

            if (!isActorSuperiorToRole(req, targetRole)) {
                return res.status(403).json({ ok: false, error: 'No puedes desactivar usuarios con rol igual o superior al tuyo.' });
            }

            if (!canActorAssignRole(req, targetRole)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para desactivar ese rol.' });
            }
        }

        await saasControlService.deleteUser(userId);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo desactivar usuario.') });
    }
});

app.get('/api/admin/saas/tenants/:tenantId/wa-modules', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
    if (!hasTenantModuleReadAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

    try {
        const items = await waModuleService.listModules(tenantId, { includeInactive: true });
        const selected = await waModuleService.getSelectedModule(tenantId);
        return res.json({ ok: true, tenantId, items, selected });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar modulos WA.') });
    }
});

registerTenantWaModuleAdminHttpRoutes({
    app,
    waModuleService,
    sanitizeWaModulePayload,
    invalidateWebhookCloudRegistryCache,
    hasTenantModuleWriteAccess
});
registerTenantCustomerHttpRoutes({
    app,
    authService,
    accessPolicyService,
    customerService,
    waModuleService,
    isTenantAllowedForUser,
    hasPermission
});
registerOperationsHttpRoutes({
    app,
    authService,
    auditLogService,
    conversationOpsService,
    assignmentRulesService,
    chatAssignmentRouterService,
    operationsKpiService,
    normalizeScopeModuleId,
    hasConversationEventsReadAccess,
    hasChatAssignmentsReadAccess,
    hasChatAssignmentsWriteAccess,
    hasAssignmentRulesReadAccess,
    hasAssignmentRulesWriteAccess,
    hasOperationsKpiReadAccess
});
registerTenantRuntimeSettingsHttpRoutes({
    app,
    authService,
    tenantService,
    tenantSettingsService,
    auditLogService,
    aiUsageService,
    waClient,
    accessPolicyService,
    isTenantAllowedForUser,
    hasPermission
});
registerTenantLabelsQuickRepliesHttpRoutes({
    app,
    accessPolicyService,
    tenantLabelService,
    quickReplyLibrariesService,
    isTenantAllowedForUser,
    hasAnyPermission,
    sanitizeTenantLabelPayload,
    sanitizeQuickReplyLibraryPayload,
    sanitizeQuickReplyItemPayload
});
registerTenantAdminConfigCatalogHttpRoutes({
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
    sanitizeAiAssistantIdPayload,
    sanitizeAiAssistantPayload,
    loadCatalog,
    addProduct,
    updateProduct
});
registerOperationsUtilityHttpRoutes({
    app,
    authService,
    tenantService,
    messageHistoryService,
    auditLogService,
    waClient,
    parseCsvEnv,
    resolveAndValidatePublicHost
});
registerCloudWebhookHttpRoutes({
    app,
    logger,
    saasControlService,
    waModuleService,
    waClient,
    socketManager
});
const scheduleWaInitialize = (delayMs = 0) => {
    const safeDelay = Math.max(0, Number(delayMs) || 0);
    setTimeout(() => {
        waClient.initialize().catch((error) => {
            const retryDelay = Math.max(2000, Number(process.env.WA_INIT_RESTART_DELAY_MS || 12000));
            opsTelemetry.recordInternalError('wa_initialize', error);
            logger.error(`[WA] initialize bootstrap error: ${String(error?.message || error)}`);
            logger.warn(`[WA] retrying initialize in ${retryDelay}ms...`);
            scheduleWaInitialize(retryDelay);
        });
    }, safeDelay);
};

function registerProcessHandlers() {
    process.on('uncaughtException', (error) => {
        opsTelemetry.recordInternalError('uncaught_exception', error);
        logger.error('[Process] uncaught exception: ' + String(error?.stack || error?.message || error));
    });

    process.on('unhandledRejection', (reason) => {
        opsTelemetry.recordInternalError('unhandled_rejection', reason);
        logger.error('[Process] unhandled rejection: ' + String(reason?.stack || reason?.message || reason));
    });

    const graceful = async (signal) => {
        logger.warn('[Process] graceful shutdown requested by ' + signal);
        try {
            if (typeof waClient.setTransportMode === 'function') {
                await waClient.setTransportMode('idle');
            }
        } catch (error) {
            logger.warn('[Process] failed to stop WA transport: ' + String(error?.message || error));
        }

        server.close(() => {
            logger.info('[Process] HTTP server closed.');
            process.exit(0);
        });

        setTimeout(() => {
            logger.warn('[Process] forced shutdown timeout reached.');
            process.exit(1);
        }, Number(process.env.SHUTDOWN_FORCE_TIMEOUT_MS || 10000)).unref();
    };

    process.on('SIGTERM', () => graceful('SIGTERM'));
    process.on('SIGINT', () => graceful('SIGINT'));
}

const PORT = process.env.PORT || 3001;

registerProcessHandlers();

saasControlService.ensureLoaded().catch((error) => {
    logger.warn('[SaaS] no se pudo precargar control plane: ' + String(error?.message || error));
});

planLimitsStoreService.initializePlanLimits().catch((error) => {
    logger.warn('[SaaS] no se pudo precargar limites de plan: ' + String(error?.message || error));
});

accessPolicyService.initializeAccessPolicy().catch((error) => {
    logger.warn('[SaaS] no se pudo precargar catalogo de accesos: ' + String(error?.message || error));
});

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    const runtime = typeof waClient.getRuntimeInfo === 'function'
        ? waClient.getRuntimeInfo()
        : { requestedTransport: 'idle', activeTransport: 'idle', cloudConfigured: false };
    logger.info(`[WA] transport requested=${runtime.requestedTransport} active=${runtime.activeTransport} cloudConfigured=${runtime.cloudConfigured}`);
    scheduleWaInitialize();
});











