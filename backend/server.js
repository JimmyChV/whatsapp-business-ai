const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { URL } = require('url');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });
const logger = require('./logger');
const { parseCsvEnv, resolveAndValidatePublicHost } = require('./security_utils');
const RateLimiter = require('./rate_limiter');
const authService = require('./auth_service');
const authRecoveryService = require('./auth_recovery_service');
const auditLogService = require('./audit_log_service');
const tenantService = require('./tenant_service');
const tenantSettingsService = require('./tenant_settings_service');
const saasControlService = require('./saas_control_plane_service');
const planLimitsService = require('./plan_limits_service');
const aiUsageService = require('./ai_usage_service');
const messageHistoryService = require('./message_history_service');
const waModuleService = require('./wa_module_service');
const opsTelemetry = require('./ops_telemetry');

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

const UPLOADS_ROOT = path.resolve(String(process.env.SAAS_UPLOADS_DIR || path.join(__dirname, 'uploads')).trim() || path.join(__dirname, 'uploads'));
const ADMIN_ASSET_UPLOAD_MAX_BYTES = Math.max(200 * 1024, Number(process.env.ADMIN_ASSET_UPLOAD_MAX_BYTES || 2 * 1024 * 1024));
const ADMIN_ASSET_ALLOWED_MIME_TYPES = new Set((() => {
    const configured = parseCsvEnv(process.env.ADMIN_ASSET_ALLOWED_MIME_TYPES);
    const base = configured.length > 0 ? configured : ['image/jpeg', 'image/png', 'image/webp'];
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

function normalizeImageExtension(fileName = '', mimeType = '') {
    const fromName = String(fileName || '').trim().split('.').pop();
    const cleanNameExt = String(fromName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanNameExt && ['png', 'jpg', 'jpeg', 'webp'].includes(cleanNameExt)) {
        return cleanNameExt === 'jpg' ? 'jpeg' : cleanNameExt;
    }

    const mime = String(mimeType || '').trim().toLowerCase().split(';')[0];
    const map = {
        'image/png': 'png',
        'image/jpeg': 'jpeg',
        'image/jpg': 'jpeg',
        'image/webp': 'webp',
        
    };
    return map[mime] || 'png';
}

function parseImageUploadPayload(body = {}) {
    const source = body && typeof body === 'object' ? body : {};
    const dataUrl = String(source.dataUrl || source.data || '').trim();
    const base64Raw = String(source.base64 || '').trim();

    if (!dataUrl && !base64Raw) {
        throw new Error('No se recibio imagen para subir.');
    }

    let mimeType = String(source.mimeType || source.contentType || '').trim().toLowerCase();
    let base64Data = base64Raw;

    if (dataUrl) {
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
        if (!match) {
            throw new Error('Formato dataUrl invalido.');
        }
        mimeType = String(match[1] || mimeType || '').trim().toLowerCase();
        base64Data = String(match[2] || '').trim();
    }

    if (!mimeType.startsWith('image/')) {
        throw new Error('Solo se permiten imagenes.');
    }

    if (!ADMIN_ASSET_ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new Error('Formato de imagen no permitido. Usa JPG, PNG o WEBP.');
    }

    let buffer;
    try {
        buffer = Buffer.from(base64Data, 'base64');
    } catch (_) {
        throw new Error('La imagen no es base64 valido.');
    }

    if (!buffer || !buffer.length) {
        throw new Error('La imagen esta vacia.');
    }

    if (buffer.length > ADMIN_ASSET_UPLOAD_MAX_BYTES) {
        throw new Error('La imagen supera el tamano permitido.');
    }

    return {
        mimeType,
        buffer,
        fileName: String(source.fileName || source.filename || '').trim() || 'imagen'
    };
}

async function saveImageAssetFile({ tenantId = 'default', scope = 'general', mimeType = 'image/png', fileName = 'imagen', buffer = Buffer.alloc(0) } = {}) {
    const cleanTenant = sanitizeStorageSegment(tenantId, 'default');
    const cleanScope = sanitizeStorageSegment(scope, 'general');
    const ext = normalizeImageExtension(fileName, mimeType);
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const baseName = sanitizeStorageSegment(path.parse(fileName).name || 'imagen', 'imagen').slice(0, 32);
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
    limit: '12mb',
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
    const metadata = tenant?.metadata && typeof tenant.metadata === 'object' && !Array.isArray(tenant.metadata)
        ? tenant.metadata
        : {};

    return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        active: tenant.active,
        plan: tenant.plan,
        logoUrl: /^https?:\/\//i.test(logoUrl) ? logoUrl : null,
        coverImageUrl: /^https?:\/\//i.test(coverImageUrl) ? coverImageUrl : null,
        metadata
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

app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const tenantId = String(req.body?.tenantId || '').trim() || null;
    const tenantSlug = String(req.body?.tenantSlug || '').trim() || null;

    try {
        const password = String(req.body?.password || '');
        const session = await authService.login({ email, password, tenantId, tenantSlug });
        await auditLogService.writeAuditLog(session?.user?.tenantId || req?.tenantContext?.id || 'default', {
            userId: session?.user?.id || null,
            userEmail: session?.user?.email || email,
            role: session?.user?.role || 'seller',
            action: 'auth.login.success',
            resourceType: 'auth',
            resourceId: session?.user?.id || null,
            source: 'api',
            ip: String(req.ip || ''),
            payload: { tenantId: session?.user?.tenantId || tenantId || null, tenantSlug }
        });
        return res.json({ ok: true, ...session });
    } catch (error) {
        const message = String(error?.message || 'No se pudo iniciar sesion.');
        const status = message.toLowerCase().includes('inval') ? 401 : 400;
        await auditLogService.writeAuditLog(tenantId || req?.tenantContext?.id || 'default', {
            userId: null,
            userEmail: email,
            role: 'seller',
            action: 'auth.login.failed',
            resourceType: 'auth',
            resourceId: null,
            source: 'api',
            ip: String(req.ip || ''),
            payload: { tenantId, tenantSlug, reason: message }
        });
        return res.status(status).json({ ok: false, error: message });
    }
});

app.post('/api/auth/recovery/request', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({ ok: false, error: 'Correo requerido.' });
    }

    try {
        const result = await authRecoveryService.requestPasswordRecovery({
            email,
            requestIp: String(req.ip || ''),
            requestId: String(req.requestId || '')
        });

        await auditLogService.writeAuditLog(req?.tenantContext?.id || 'default', {
            userId: null,
            userEmail: email,
            role: 'seller',
            action: 'auth.recovery.request',
            resourceType: 'auth',
            resourceId: null,
            source: 'api',
            ip: String(req.ip || ''),
            payload: {
                accepted: Boolean(result?.accepted)
            }
        });

        const responsePayload = {
            ok: true,
            message: 'Si el correo existe, enviaremos un codigo de recuperacion.'
        };
        if (result?.maskedEmail) responsePayload.maskedEmail = result.maskedEmail;
        if (result?.expiresInSec) responsePayload.expiresInSec = result.expiresInSec;
        if (!isProduction && result?.debugCode) responsePayload.debugCode = result.debugCode;

        return res.json(responsePayload);
    } catch (error) {
        const message = String(error?.message || 'No se pudo iniciar recuperacion.');
        if (/correo requerido|correo invalido/i.test(message)) {
            return res.status(400).json({ ok: false, error: message });
        }
        return res.json({
            ok: true,
            message: 'Si el correo existe, enviaremos un codigo de recuperacion.'
        });
    }
});

app.post('/api/auth/recovery/verify', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();

    if (!email || !code) {
        return res.status(400).json({ ok: false, error: 'Correo y codigo son requeridos.' });
    }

    try {
        const result = await authRecoveryService.verifyPasswordRecoveryCode({ email, code });

        await auditLogService.writeAuditLog(req?.tenantContext?.id || 'default', {
            userId: null,
            userEmail: email,
            role: 'seller',
            action: 'auth.recovery.verify',
            resourceType: 'auth',
            resourceId: null,
            source: 'api',
            ip: String(req.ip || ''),
            payload: { ok: true }
        });

        return res.json({
            ok: true,
            resetToken: result.resetToken,
            expiresInSec: result.expiresInSec
        });
    } catch (error) {
        const message = String(error?.message || 'Codigo invalido o expirado.');
        const status = /codigo invalido|expirado/i.test(message) ? 400 : 500;
        return res.status(status).json({ ok: false, error: message });
    }
});

app.post('/api/auth/recovery/reset', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const resetToken = String(req.body?.resetToken || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!email || !resetToken || !newPassword) {
        return res.status(400).json({ ok: false, error: 'Correo, token y nueva contrasena son requeridos.' });
    }

    try {
        const result = await authRecoveryService.resetPasswordWithRecoveryToken({
            email,
            resetToken,
            newPassword
        });

        await auditLogService.writeAuditLog(req?.tenantContext?.id || 'default', {
            userId: result?.userId || null,
            userEmail: email,
            role: 'seller',
            action: 'auth.recovery.reset',
            resourceType: 'auth',
            resourceId: result?.userId || null,
            source: 'api',
            ip: String(req.ip || ''),
            payload: {
                revokedSessions: Number(result?.revokedSessions?.updated || 0) || 0
            }
        });

        return res.json({
            ok: true,
            message: 'Contrasena actualizada correctamente.'
        });
    } catch (error) {
        const message = String(error?.message || 'No se pudo actualizar la contrasena.');
        const status = /invalido|expirado|contrasena/i.test(message) ? 400 : 500;
        return res.status(status).json({ ok: false, error: message });
    }
});
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const refreshToken = String(req.body?.refreshToken || '').trim();
        if (!refreshToken) {
            return res.status(400).json({ ok: false, error: 'refreshToken es requerido.' });
        }

        const session = await authService.refreshSession({ refreshToken });
        await auditLogService.writeAuditLog(session?.user?.tenantId || req?.tenantContext?.id || 'default', {
            userId: session?.user?.id || null,
            userEmail: session?.user?.email || null,
            role: session?.user?.role || 'seller',
            action: 'auth.refresh.success',
            resourceType: 'auth',
            resourceId: session?.user?.id || null,
            source: 'api',
            ip: String(req.ip || ''),
            payload: {}
        });

        return res.json({ ok: true, ...session });
    } catch (error) {
        const message = String(error?.message || 'No se pudo renovar sesion.');
        return res.status(401).json({ ok: false, error: message });
    }
});

app.post('/api/auth/switch-tenant', async (req, res) => {
    try {
        const authContext = req.authContext || { isAuthenticated: false, user: null };
        if (authService.isAuthEnabled() && (!authContext.isAuthenticated || !authContext.user)) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        const accessToken = String(authService.getTokenFromRequest(req) || req.body?.accessToken || '').trim();
        const refreshToken = String(req.body?.refreshToken || '').trim();
        const targetTenantId = String(req.body?.targetTenantId || '').trim();

        if (!targetTenantId) {
            return res.status(400).json({ ok: false, error: 'targetTenantId es requerido.' });
        }

        const session = await authService.switchTenantSession({
            accessToken,
            refreshToken,
            targetTenantId
        });

        await auditLogService.writeAuditLog(targetTenantId, {
            userId: session?.user?.id || authContext?.user?.userId || null,
            userEmail: session?.user?.email || authContext?.user?.email || null,
            role: session?.user?.role || authContext?.user?.role || 'seller',
            action: 'auth.tenant.switch.success',
            resourceType: 'auth',
            resourceId: session?.user?.id || null,
            source: 'api',
            ip: String(req.ip || ''),
            payload: {
                fromTenantId: authContext?.user?.tenantId || null,
                toTenantId: targetTenantId
            }
        });

        return res.json({ ok: true, ...session });
    } catch (error) {
        const message = String(error?.message || 'No se pudo cambiar de empresa.');
        const status = /acceso|requerido|invalida|expirada/i.test(message) ? 400 : 500;
        return res.status(status).json({ ok: false, error: message });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        const accessTokenFromRequest = authService.getTokenFromRequest(req);
        const accessToken = String(req.body?.accessToken || accessTokenFromRequest || '').trim();
        const refreshToken = String(req.body?.refreshToken || '').trim();

        if (!accessToken && !refreshToken) {
            return res.status(400).json({ ok: false, error: 'Debes enviar access token o refresh token.' });
        }

        const result = await authService.logoutSession({
            accessToken,
            refreshToken,
            reason: 'api_logout'
        });

        if (!result.ok) {
            return res.status(400).json({ ok: false, error: 'No se pudo cerrar la sesion (tokens invalidos o expirados).' });
        }

        await auditLogService.writeAuditLog(result?.user?.tenantId || req?.tenantContext?.id || 'default', {
            userId: result?.user?.id || null,
            userEmail: result?.user?.email || null,
            role: result?.user?.role || 'seller',
            action: 'auth.logout.success',
            resourceType: 'auth',
            resourceId: result?.user?.id || null,
            source: 'api',
            ip: String(req.ip || ''),
            payload: {
                revokedAccess: Boolean(result.revokedAccess),
                revokedRefresh: Boolean(result.revokedRefresh)
            }
        });

        return res.json({ ok: true, ...result });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudo cerrar sesion.' });
    }
});

app.get('/api/auth/me', (req, res) => {
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) {
        return res.status(401).json({ ok: false, error: 'No autenticado.' });
    }

    const allowedTenants = authService
        .getAllowedTenantsForUser(authContext.user || {}, tenantService.getTenants())
        .map(toPublicTenant)
        .filter(Boolean);

    return res.json({
        ok: true,
        user: authContext.user,
        tenant: toPublicTenant(req.tenantContext || tenantService.DEFAULT_TENANT),
        tenants: allowedTenants
    });
});

app.get('/api/tenant/me', (req, res) => {
    return res.json({
        ok: true,
        tenant: req.tenantContext || tenantService.DEFAULT_TENANT
    });
});

function getAuthRole(req = {}) {
    return String(req?.authContext?.user?.role || '').trim().toLowerCase();
}

function getAllowedTenantIdsFromAuth(req = {}) {
    const memberships = Array.isArray(req?.authContext?.user?.memberships)
        ? req.authContext.user.memberships
        : [];
    const allowed = memberships
        .map((membership) => String(membership?.tenantId || '').trim())
        .filter(Boolean);

    if (!allowed.length) {
        const fallback = String(req?.authContext?.user?.tenantId || req?.tenantContext?.id || '').trim();
        if (fallback) return [fallback];
    }

    return Array.from(new Set(allowed));
}

function hasSaasControlReadAccess(req = {}) {
    if (!authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) return false;
    const role = getAuthRole(req);
    return Boolean(authContext.user?.isSuperAdmin || role === 'owner' || role === 'admin');
}

function hasSaasControlWriteAccess(req = {}, { requireSuperAdmin = false } = {}) {
    if (!authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) return false;

    if (requireSuperAdmin) return Boolean(authContext.user?.isSuperAdmin);
    if (authContext.user?.isSuperAdmin) return true;

    const role = getAuthRole(req);
    return role === 'owner';
}

function hasTenantAdminWriteAccess(req = {}) {
    if (!authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) return false;
    if (authContext.user?.isSuperAdmin) return true;
    const role = getAuthRole(req);
    return role === 'owner' || role === 'admin';
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
    if (!hasSaasControlReadAccess(req)) return false;
    return isTenantAllowedForUser(req, tenantId);
}

function hasTenantModuleWriteAccess(req = {}, tenantId = '') {
    if (!tenantId) return false;
    if (!hasTenantAdminWriteAccess(req)) return false;
    return isTenantAllowedForUser(req, tenantId);
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
    return source
        .map((item) => ({
            tenantId: String(item?.tenantId || item?.tenant || item?.id || '').trim(),
            role: String(item?.role || 'seller').trim().toLowerCase() || 'seller',
            active: item?.active !== false
        }))
        .filter((item) => Boolean(item.tenantId));
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
    if (Object.prototype.hasOwnProperty.call(source, 'metadata')) {
        patch.metadata = sanitizeObjectPayload(source.metadata);
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
    if (Object.prototype.hasOwnProperty.call(source, 'metadata')) {
        patch.metadata = sanitizeObjectPayload(source.metadata);
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

function sanitizeWaModulePayload(payload = {}, { allowModuleId = true } = {}) {
    const source = sanitizeObjectPayload(payload);
    const sourceMetadata = sanitizeObjectPayload(source.metadata);
    const topCloudConfig = sanitizeObjectPayload(source.cloudConfig);
    const nestedCloudConfig = sanitizeObjectPayload(sourceMetadata.cloudConfig);
    const cloudConfig = Object.keys(topCloudConfig).length > 0
        ? { ...nestedCloudConfig, ...topCloudConfig }
        : nestedCloudConfig;

    const base = {
        name: String(source.name || '').trim(),
        phoneNumber: String(source.phoneNumber || source.phone || source.number || '').trim() || null,
        transportMode: String(source.transportMode || source.transport || source.mode || '').trim().toLowerCase() || 'webjs',
        imageUrl: sanitizeUrlValue(source.imageUrl || source.image_url || source.logoUrl || source.logo_url),
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        isSelected: source.isSelected === true,
        assignedUserIds: Array.isArray(source.assignedUserIds)
            ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [],
        metadata: {
            ...sourceMetadata,
            cloudConfig
        }
    };

    if (allowModuleId) {
        const moduleId = String(source.moduleId || source.id || '').trim();
        if (moduleId) base.moduleId = moduleId;
    }

    return base;
}

app.post('/api/admin/saas/assets/upload', async (req, res) => {
    try {
        if (!hasTenantAdminWriteAccess(req)) {
            return res.status(403).json({ ok: false, error: 'No autorizado para subir archivos.' });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const requestedTenantId = String(body.tenantId || req?.tenantContext?.id || 'default').trim() || 'default';
        const tenantId = sanitizeStorageSegment(requestedTenantId, 'default');

        if (!req?.authContext?.user?.isSuperAdmin && !isTenantAllowedForUser(req, requestedTenantId)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a ese tenant para subir archivos.' });
        }

        const scope = sanitizeStorageSegment(body.scope || 'general', 'general');
        const parsed = parseImageUploadPayload(body);
        const stored = await saveImageAssetFile({
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
            file: {
                url: publicUrl,
                relativeUrl: stored.relativeUrl,
                relativePath: stored.relativePath,
                mimeType: parsed.mimeType,
                sizeBytes: Number(parsed.buffer?.length || 0) || 0,
                fileName: path.basename(stored.absolutePath)
            }
        });
    } catch (error) {
        const message = String(error?.message || 'No se pudo subir el archivo.');
        const status = /tamano|base64|imagen|formato/i.test(message) ? 400 : 500;
        return res.status(status).json({ ok: false, error: message });
    }
});
app.get('/api/admin/saas/overview', async (req, res) => {
    try {
        if (!hasSaasControlReadAccess(req)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para ver el panel SaaS.' });
        }

        const overview = await saasControlService.getAdminOverview();
        const scoped = filterAdminOverviewByScope(req, overview);
        const aiUsage = await Promise.all((scoped.tenants || []).map(async (tenant) => ({
            tenantId: tenant.id,
            monthKey: aiUsageService.currentMonthKey(),
            requests: await aiUsageService.getMonthlyUsage(tenant.id)
        })));

        return res.json({ ok: true, ...scoped, aiUsage });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudo cargar el panel SaaS.' });
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
    if (!hasSaasControlWriteAccess(req, { requireSuperAdmin: true })) return res.status(403).json({ ok: false, error: 'Solo superadmin puede eliminar empresas.' });

    try {
        await saasControlService.deleteTenant(tenantId);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar empresa.') });
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

        if (!req?.authContext?.user?.isSuperAdmin) {
            const invalid = (payload.memberships || []).some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
            if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar tenants fuera de tu alcance.' });
            if (hasOwnerRoleMembership(payload.memberships || [])) return res.status(403).json({ ok: false, error: 'No puedes asignar rol owner.' });
        }

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

        const payload = sanitizeUserPayload(req.body, { allowMemberships: true });
        if (payload.memberships) payload.memberships = sanitizeMembershipPayload(payload.memberships);

        if (!req?.authContext?.user?.isSuperAdmin && Array.isArray(payload.memberships)) {
            const invalid = payload.memberships.some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
            if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar tenants fuera de tu alcance.' });
            if (hasOwnerRoleMembership(payload.memberships)) return res.status(403).json({ ok: false, error: 'No puedes asignar rol owner.' });
        }

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

        if (!req?.authContext?.user?.isSuperAdmin) {
            const invalid = memberships.some((membership) => !isTenantAllowedForUser(req, membership.tenantId));
            if (invalid) return res.status(403).json({ ok: false, error: 'No puedes asignar tenants fuera de tu alcance.' });
            if (hasOwnerRoleMembership(memberships)) return res.status(403).json({ ok: false, error: 'No puedes asignar rol owner.' });
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
        if (!hasTenantAdminWriteAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado para eliminar usuarios.' });
        const userId = String(req.params?.userId || '').trim();
        if (!userId) return res.status(400).json({ ok: false, error: 'userId invalido.' });

        await saasControlService.deleteUser(userId);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar usuario.') });
    }
});

app.get('/api/admin/saas/plans', (req, res) => {
    if (!hasSaasControlReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
    return res.json({
        ok: true,
        plans: Object.keys(planLimitsService.DEFAULT_LIMITS).map((plan) => ({
            id: plan,
            limits: planLimitsService.getPlanLimits(plan)
        }))
    });
});

app.get('/api/admin/saas/tenants/:tenantId/settings', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
    if (!hasSaasControlReadAccess(req) || !isTenantAllowedForUser(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

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
    if (!hasTenantAdminWriteAccess(req) || !isTenantAllowedForUser(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

    try {
        const patch = req.body && typeof req.body === 'object' ? req.body : {};
        const settings = await tenantSettingsService.updateTenantSettings(tenantId, patch);
        return res.json({ ok: true, tenantId, settings });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar configuracion del tenant.') });
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

app.post('/api/admin/saas/tenants/:tenantId/wa-modules', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
    if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

    try {
        const payload = sanitizeWaModulePayload(req.body, { allowModuleId: true });
        const created = await waModuleService.createModule(tenantId, payload);
        return res.status(201).json({ ok: true, tenantId, item: created });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear el modulo WA.') });
    }
});

app.put('/api/admin/saas/tenants/:tenantId/wa-modules/:moduleId', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    const moduleId = String(req.params?.moduleId || '').trim();
    if (!tenantId || !moduleId) return res.status(400).json({ ok: false, error: 'tenantId/moduleId invalido.' });
    if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

    try {
        const patch = sanitizeWaModulePayload(req.body, { allowModuleId: true });
        const updated = await waModuleService.updateModule(tenantId, moduleId, patch);
        return res.json({ ok: true, tenantId, item: updated });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar el modulo WA.') });
    }
});

app.delete('/api/admin/saas/tenants/:tenantId/wa-modules/:moduleId', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    const moduleId = String(req.params?.moduleId || '').trim();
    if (!tenantId || !moduleId) return res.status(400).json({ ok: false, error: 'tenantId/moduleId invalido.' });
    if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

    try {
        await waModuleService.deleteModule(tenantId, moduleId);
        return res.json({ ok: true, tenantId, moduleId });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar el modulo WA.') });
    }
});

app.post('/api/admin/saas/tenants/:tenantId/wa-modules/:moduleId/select', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    const moduleId = String(req.params?.moduleId || '').trim();
    if (!tenantId || !moduleId) return res.status(400).json({ ok: false, error: 'tenantId/moduleId invalido.' });
    if (!hasTenantModuleWriteAccess(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

    try {
        const selected = await waModuleService.setSelectedModule(tenantId, moduleId);
        return res.json({ ok: true, tenantId, selected });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo seleccionar el modulo WA.') });
    }
});

app.get('/api/tenant/wa-modules', async (req, res) => {
    try {
        if (authService.isAuthEnabled() && !req?.authContext?.isAuthenticated) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
        const userId = String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim();
        const items = await waModuleService.listModules(tenantId, { includeInactive: false, userId });
        const selected = await waModuleService.getSelectedModule(tenantId, { userId });
        return res.json({ ok: true, tenantId, items, selected });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar modulos WA.') });
    }
});
app.get('/api/admin/saas/tenants/:tenantId/runtime', async (req, res) => {
    const tenantId = String(req.params?.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
    if (!hasSaasControlReadAccess(req) || !isTenantAllowedForUser(req, tenantId)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

    try {
        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : { requestedTransport: 'idle', activeTransport: 'idle' };
        const aiUsage = await aiUsageService.getMonthlyUsage(tenantId);
        return res.json({
            ok: true,
            tenantId,
            runtime,
            aiUsage: { monthKey: aiUsageService.currentMonthKey(), requests: aiUsage }
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudo obtener runtime del tenant.' });
    }
});

function hasTenantSettingsWriteAccess(req) {
    if (!authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) return false;
    const role = String(authContext.user.role || '').trim().toLowerCase();
    return role === 'owner' || role === 'admin';
}

app.get('/api/tenant/settings', async (req, res) => {
    try {
        const tenant = req.tenantContext || tenantService.DEFAULT_TENANT;
        const settings = await tenantSettingsService.getTenantSettings(tenant?.id || 'default');
        return res.json({
            ok: true,
            tenant,
            settings
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudo cargar la configuracion de la empresa.' });
    }
});

app.put('/api/tenant/settings', async (req, res) => {
    try {
        if (!hasTenantSettingsWriteAccess(req)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para editar configuracion de empresa.' });
        }

        const tenant = req.tenantContext || tenantService.DEFAULT_TENANT;
        const patch = req.body && typeof req.body === 'object' ? req.body : {};
        const settings = await tenantSettingsService.updateTenantSettings(tenant?.id || 'default', patch);

        await auditLogService.writeAuditLog(tenant?.id || 'default', {
            userId: req?.authContext?.user?.userId || null,
            userEmail: req?.authContext?.user?.email || null,
            role: req?.authContext?.user?.role || 'seller',
            action: 'tenant.settings.updated',
            resourceType: 'tenant_settings',
            resourceId: tenant?.id || 'default',
            source: 'api',
            ip: String(req.ip || ''),
            payload: { patch }
        });

        return res.json({
            ok: true,
            tenant,
            settings
        });
    } catch (error) {
        const message = String(error?.message || 'No se pudo actualizar configuracion de empresa.');
        return res.status(400).json({ ok: false, error: message });
    }
});

function hasTenantHistoryReadAccess(req) {
    if (!authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    return Boolean(authContext.isAuthenticated && authContext.user);
}

app.get('/api/history/chats', async (req, res) => {
    try {
        if (!hasTenantHistoryReadAccess(req)) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        const tenant = req.tenantContext || tenantService.DEFAULT_TENANT;
        const limit = Number(req.query.limit || 100);
        const offset = Number(req.query.offset || 0);
        const rows = await messageHistoryService.listChats(tenant?.id || 'default', { limit, offset });
        return res.json({ ok: true, tenant, items: rows });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudo cargar historial de chats.' });
    }
});

app.get('/api/history/messages', async (req, res) => {
    try {
        if (!hasTenantHistoryReadAccess(req)) {
            return res.status(401).json({ ok: false, error: 'No autenticado.' });
        }

        const tenant = req.tenantContext || tenantService.DEFAULT_TENANT;
        const chatId = String(req.query.chatId || '').trim();
        if (!chatId) {
            return res.status(400).json({ ok: false, error: 'chatId es requerido.' });
        }

        const limit = Number(req.query.limit || 200);
        const beforeTimestamp = req.query.beforeTimestamp ? Number(req.query.beforeTimestamp) : null;
        const rows = await messageHistoryService.listMessages(tenant?.id || 'default', {
            chatId,
            limit,
            beforeTimestamp
        });

        return res.json({ ok: true, tenant, chatId, items: rows });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudo cargar historial de mensajes.' });
    }
});

function hasAuditReadAccess(req) {
    if (!authService.isAuthEnabled()) return true;
    const authContext = req.authContext || { isAuthenticated: false, user: null };
    if (!authContext.isAuthenticated || !authContext.user) return false;
    const role = String(authContext.user.role || '').trim().toLowerCase();
    return role === 'owner' || role === 'admin';
}

app.get('/api/audit/logs', async (req, res) => {
    try {
        if (!hasAuditReadAccess(req)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para ver auditoria.' });
        }

        const tenant = req.tenantContext || tenantService.DEFAULT_TENANT;
        const limit = Number(req.query.limit || 100);
        const offset = Number(req.query.offset || 0);
        const items = await auditLogService.listAuditLogs(tenant?.id || 'default', { limit, offset });
        return res.json({ ok: true, tenant, items });
    } catch (error) {
        return res.status(500).json({ ok: false, error: 'No se pudo cargar la auditoria.' });
    }
});

app.get('/api/wa/runtime', (req, res) => {
    const runtime = typeof waClient.getRuntimeInfo === 'function'
        ? waClient.getRuntimeInfo()
        : { requestedTransport: 'idle', activeTransport: 'idle' };
    const capabilities = typeof waClient.getCapabilities === 'function'
        ? waClient.getCapabilities()
        : {};

    return res.json({
        ok: true,
        runtime,
        capabilities,
        ready: Boolean(waClient.isReady),
        hasQr: Boolean(waClient.lastQr)
    });
});

const PROFILE_PHOTO_ALLOWED_HOST_SUFFIXES = ['whatsapp.net', 'fbcdn.net', 'fbsbx.com'];

function isAllowedProfilePhotoHost(hostname = '') {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) return false;
    return PROFILE_PHOTO_ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

app.get('/api/profile-photo', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        return res.status(400).json({ error: 'URL de foto invalida. Usa http(s).' });
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (error) {
        return res.status(400).json({ error: 'URL de foto invalida.' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Solo se permiten protocolos http/https.' });
    }

    if (!isAllowedProfilePhotoHost(parsed.hostname)) {
        return res.status(403).json({ error: 'Host de imagen no permitido.' });
    }

    try {
        await resolveAndValidatePublicHost(parsed.hostname);

        const timeoutMs = Number(process.env.PROFILE_PHOTO_TIMEOUT_MS || 5000);
        const maxBytes = Number(process.env.PROFILE_PHOTO_MAX_BYTES || 2 * 1024 * 1024);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(parsed.toString(), {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Photo Proxy)'
                },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return res.status(response.status).json({ error: 'No se pudo descargar la foto de perfil.' });
        }

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('image/')) {
            return res.status(415).json({ error: 'El recurso no es una imagen.' });
        }

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength && contentLength > maxBytes) {
            return res.status(413).json({ error: 'La imagen excede el tamano permitido.' });
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer());
        if (imageBuffer.length > maxBytes) {
            return res.status(413).json({ error: 'La imagen excede el tamano permitido.' });
        }

        res.setHeader('Content-Type', contentType.split(';')[0] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(imageBuffer);
    } catch (error) {
        return res.status(502).json({ error: 'No se pudo cargar la foto de perfil.' });
    }
});
function extractMeta(html, property, nameFallback = null) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byProperty = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i').exec(html);
    if (byProperty?.[1]) return byProperty[1];
    if (nameFallback) {
        const escapedName = nameFallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const byName = new RegExp(`<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i').exec(html);
        if (byName?.[1]) return byName[1];
    }
    return null;
}

function parseMapCoordinates(value = '') {
    const source = String(value || '');
    if (!source) return null;

    const patterns = [
        /@(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /[?&](?:q|query|ll|sll|destination|daddr)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (!match) continue;
        const latitude = Number.parseFloat(match[1]);
        const longitude = Number.parseFloat(match[2]);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)
            && latitude >= -90 && latitude <= 90
            && longitude >= -180 && longitude <= 180) {
            return { latitude, longitude };
        }
    }

    return null;
}

function normalizeMapSeedFromUrl(rawUrl = '') {
    const value = String(rawUrl || '').trim();
    if (!value) return '';

    let parsed;
    try {
        parsed = new URL(value);
    } catch (error) {
        return value;
    }

    for (const key of ['q', 'query', 'll', 'sll', 'destination', 'daddr']) {
        const fromParam = String(parsed.searchParams.get(key) || '').trim();
        if (!fromParam) continue;
        const coords = parseMapCoordinates(fromParam);
        if (coords) return `${coords.latitude},${coords.longitude}`;
        return fromParam;
    }

    const decodedPath = decodeURIComponent(`${parsed.pathname || ''}${parsed.hash || ''}`);
    const pathCoords = parseMapCoordinates(decodedPath);
    if (pathCoords) return `${pathCoords.latitude},${pathCoords.longitude}`;

    const placeMatch = decodedPath.match(/\/place\/([^/]+)/i);
    if (placeMatch?.[1]) return String(placeMatch[1]).replace(/\+/g, ' ');

    const searchMatch = decodedPath.match(/\/search\/([^/]+)/i);
    if (searchMatch?.[1]) return String(searchMatch[1]).replace(/\+/g, ' ');

    return value;
}

function isAllowedMapHost(hostname = '') {
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) return false;

    if (host === 'maps.app.goo.gl') return true;
    if (host === 'goo.gl') return true;
    if (host === 'maps.google.com') return true;
    if (host.startsWith('maps.google.')) return true;
    if (host === 'www.google.com') return true;
    if (host.startsWith('www.google.')) return true;
    if (host.startsWith('m.google.')) return true;

    return false;
}

app.get('/api/link-preview', async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'URL invalida. Usa http(s).' });
    }

    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return res.status(400).json({ error: 'Solo se permiten protocolos http/https.' });
        }

        const blockedHosts = new Set(parseCsvEnv(process.env.LINK_PREVIEW_BLOCKED_HOSTS));
        if (blockedHosts.has(parsed.hostname)) {
            return res.status(403).json({ ok: false, url, error: 'Host bloqueado.' });
        }

        await resolveAndValidatePublicHost(parsed.hostname);

        const timeoutMs = Number(process.env.LINK_PREVIEW_TIMEOUT_MS || 5000);
        const maxBytes = Number(process.env.LINK_PREVIEW_MAX_BYTES || 1024 * 1024);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Preview Bot)'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html')) {
            return res.status(415).json({ ok: false, url, error: 'La URL no contiene HTML previsualizable.' });
        }

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength && contentLength > maxBytes) {
            return res.status(413).json({ ok: false, url, error: 'El contenido excede el tamano permitido para preview.' });
        }

        const html = (await response.text()).slice(0, maxBytes);
        const title = extractMeta(html, 'og:title') || (/<title>([^<]+)<\/title>/i.exec(html)?.[1] || null);
        const description = extractMeta(html, 'og:description', 'description');
        const image = extractMeta(html, 'og:image');
        const siteName = extractMeta(html, 'og:site_name');

        return res.json({
            url,
            ok: true,
            title,
            description,
            image,
            siteName
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            url,
            error: error.message || 'No se pudo generar vista previa del enlace.'
        });
    }
});

app.get('/api/map-resolve', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        return res.status(400).json({ ok: false, error: 'URL de mapa invalida.' });
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (error) {
        return res.status(400).json({ ok: false, error: 'URL de mapa invalida.' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ ok: false, error: 'Solo se permiten protocolos http/https.' });
    }

    if (!isAllowedMapHost(parsed.hostname)) {
        return res.status(403).json({ ok: false, error: 'Host de mapa no permitido.' });
    }

    try {
        await resolveAndValidatePublicHost(parsed.hostname);

        const timeoutMs = Number(process.env.MAP_RESOLVE_TIMEOUT_MS || 6000);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(parsed.toString(), {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Map Resolver)'
                },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        const resolvedUrl = String(response?.url || parsed.toString());
        const seed = normalizeMapSeedFromUrl(resolvedUrl);
        const coords = parseMapCoordinates(seed) || parseMapCoordinates(resolvedUrl);

        return res.json({
            ok: true,
            inputUrl: parsed.toString(),
            resolvedUrl,
            seed,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null
        });
    } catch (error) {
        return res.status(502).json({
            ok: false,
            error: error?.message || 'No se pudo resolver el enlace de mapa.'
        });
    }
});

app.get('/api/map-suggest', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
        return res.json({ ok: true, items: [] });
    }

    try {
        const timeoutMs = Number(process.env.MAP_SUGGEST_TIMEOUT_MS || 7000);
        const limit = Math.min(10, Math.max(3, Number.parseInt(String(req.query.limit || '8'), 10) || 8));

        const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
        nominatimUrl.searchParams.set('format', 'jsonv2');
        nominatimUrl.searchParams.set('addressdetails', '1');
        nominatimUrl.searchParams.set('limit', String(limit));
        nominatimUrl.searchParams.set('q', query);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(nominatimUrl.toString(), {
                headers: {
                    'User-Agent': 'WhatsApp Business Pro/1.0 (map-suggest)'
                },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return res.status(502).json({ ok: false, error: 'No se pudo obtener sugerencias de ubicacion.', items: [] });
        }

        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : [];
        const items = rows
            .map((row) => {
                const latitude = Number.parseFloat(String(row?.lat || ''));
                const longitude = Number.parseFloat(String(row?.lon || ''));
                const label = String(row?.display_name || '').trim();
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !label) return null;
                return {
                    id: String(row?.place_id || `${latitude},${longitude}`),
                    label,
                    latitude,
                    longitude,
                    mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}`
                };
            })
            .filter(Boolean)
            .slice(0, limit);

        return res.json({ ok: true, items });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: error?.message || 'Error consultando sugerencias de ubicacion.',
            items: []
        });
    }
});

const META_VERIFY_TOKEN = String(process.env.META_VERIFY_TOKEN || '').trim();
const META_APP_SECRET = String(process.env.META_APP_SECRET || '').trim();
const META_ENFORCE_SIGNATURE = String(process.env.META_ENFORCE_SIGNATURE || 'true').trim().toLowerCase() !== 'false';
const CLOUD_WEBHOOK_DEBUG = String(process.env.CLOUD_WEBHOOK_DEBUG || 'true').trim().toLowerCase() !== 'false';

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

function validateMetaWebhookSignature(req) {
    if (!META_ENFORCE_SIGNATURE) {
        return { ok: true, skipped: true };
    }

    if (!META_APP_SECRET) {
        return { ok: true, skipped: true };
    }

    const incoming = String(req.get('x-hub-signature-256') || '').trim();
    if (!incoming.startsWith('sha256=')) {
        return { ok: false, reason: 'missing_signature' };
    }

    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from('');
    const expectedHash = crypto
        .createHmac('sha256', META_APP_SECRET)
        .update(rawBody)
        .digest('hex');
    const expected = 'sha256=' + expectedHash;
    const ok = timingSafeEqualHex(expected, incoming);
    return { ok, reason: ok ? 'ok' : 'signature_mismatch' };
}

function handleMetaWebhookVerification(req, res) {
    const mode = String(req.query['hub.mode'] || '').trim();
    const token = String(req.query['hub.verify_token'] || '').trim();
    const challenge = String(req.query['hub.challenge'] || '').trim();

    if (mode === 'subscribe' && META_VERIFY_TOKEN && token === META_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
}

function summarizeMetaWebhookPayload(payload = {}) {
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    let changesCount = 0;
    let messagesCount = 0;
    let statusesCount = 0;

    entries.forEach((entry) => {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        changesCount += changes.length;
        changes.forEach((change) => {
            const value = change?.value || {};
            const messages = Array.isArray(value?.messages) ? value.messages : [];
            const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
            messagesCount += messages.length;
            statusesCount += statuses.length;
        });
    });

    return {
        object: String(payload?.object || '').trim() || null,
        entriesCount: entries.length,
        changesCount,
        messagesCount,
        statusesCount
    };
}

async function handleMetaWebhookEvent(req, res) {
    try {
        const signatureCheck = validateMetaWebhookSignature(req);
        if (!signatureCheck.ok) {
            logger.warn('[WA][Cloud] webhook signature rejected (' + String(signatureCheck.reason || 'invalid') + ').');
            return res.sendStatus(401);
        }

        const payload = req.body || {};
        const summary = summarizeMetaWebhookPayload(payload);
        const handled = typeof waClient.handleWebhookPayload === 'function'
            ? await waClient.handleWebhookPayload(payload)
            : false;

        if (CLOUD_WEBHOOK_DEBUG) {
            logger.info('[WA][Cloud] webhook received object=' + String(summary.object || 'n/a')
                + ' entries=' + String(summary.entriesCount)
                + ' changes=' + String(summary.changesCount)
                + ' messages=' + String(summary.messagesCount)
                + ' statuses=' + String(summary.statusesCount)
                + ' handled=' + String(Boolean(handled)));
        }

        if (!handled && (summary.messagesCount > 0 || summary.statusesCount > 0)) {
            const runtime = typeof waClient.getRuntimeInfo === 'function' ? waClient.getRuntimeInfo() : {};
            logger.warn('[WA][Cloud] webhook payload not processed by active transport. active=' + String(runtime?.activeTransport || 'unknown') + ', requested=' + String(runtime?.requestedTransport || 'unknown'));
        }

        return res.sendStatus(200);
    } catch (error) {
        logger.error(`[WA][Cloud] webhook processing failed: ${String(error?.message || error)}`);
        return res.sendStatus(500);
    }
}
app.get('/webhook', handleMetaWebhookVerification);
app.get('/webhook/whatsapp', handleMetaWebhookVerification);
app.post('/webhook', handleMetaWebhookEvent);
app.post('/webhook/whatsapp', handleMetaWebhookEvent);
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

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    const runtime = typeof waClient.getRuntimeInfo === 'function'
        ? waClient.getRuntimeInfo()
        : { requestedTransport: 'idle', activeTransport: 'idle', cloudConfigured: false };
    logger.info(`[WA] transport requested=${runtime.requestedTransport} active=${runtime.activeTransport} cloudConfigured=${runtime.cloudConfigured}`);
    scheduleWaInitialize();
});

