const crypto = require('crypto');
const authSessionService = require('./auth_session_service');

function parseBooleanEnv(value, defaultValue = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function toBase64Url(input) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input || ''), 'utf8');
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(input = '') {
    const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const padSize = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padSize);
    return Buffer.from(padded, 'base64').toString('utf8');
}

function safeEqual(left = '', right = '') {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(a, b);
    } catch (error) {
        return false;
    }
}

function nowEpochSeconds() {
    return Math.floor(Date.now() / 1000);
}

function sha256Hex(value = '') {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function randomTokenId(prefix = 'tok') {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function parseUsersFromEnv() {
    const raw = String(process.env.SAAS_USERS_JSON || '').trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((entry, idx) => {
                if (!entry || typeof entry !== 'object') return null;
                const id = String(entry.id || `user_${idx + 1}`).trim();
                const email = String(entry.email || '').trim().toLowerCase();
                const tenantId = String(entry.tenantId || entry.tenant || 'default').trim();
                const role = String(entry.role || 'seller').trim().toLowerCase();
                const name = String(entry.name || entry.displayName || email || id).trim();
                const password = String(entry.password || '');
                const passwordHash = String(entry.passwordHash || entry.sha256 || '').trim().toLowerCase();
                if (!id || !email || !tenantId) return null;
                if (!password && !passwordHash) return null;
                return { id, email, tenantId, role, name, password, passwordHash };
            })
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

function getAuthSecret() {
    return String(process.env.SAAS_AUTH_SECRET || '').trim();
}

function isAuthEnabled() {
    return parseBooleanEnv(process.env.SAAS_AUTH_ENABLED, false);
}

function getTokenTtlSec() {
    const parsed = Number(process.env.SAAS_TOKEN_TTL_SEC || 8 * 60 * 60);
    if (!Number.isFinite(parsed) || parsed <= 60) return 8 * 60 * 60;
    return Math.floor(parsed);
}

function buildAccessToken(payload = {}) {
    const headerPart = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadPart = toBase64Url(JSON.stringify(payload));
    const secret = getAuthSecret();
    const signature = crypto.createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    return `${headerPart}.${payloadPart}.${signature}`;
}

function parseAccessToken(token = '') {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const [headerPart, payloadPart, signaturePart] = raw.split('.');
    if (!headerPart || !payloadPart || !signaturePart) return null;

    const secret = getAuthSecret();
    if (!secret) return null;

    const expectedSignature = crypto.createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    if (!safeEqual(expectedSignature, signaturePart)) return null;

    try {
        const payload = JSON.parse(fromBase64Url(payloadPart));
        if (!payload || typeof payload !== 'object') return null;
        const now = nowEpochSeconds();
        const exp = Number(payload.exp || 0);
        if (!Number.isFinite(exp) || exp <= now) return null;
        return payload;
    } catch (error) {
        return null;
    }
}

function verifyUserPassword(user = {}, password = '') {
    const plain = String(password || '');
    if (!plain) return false;

    if (user.password) {
        return safeEqual(user.password, plain);
    }

    if (user.passwordHash) {
        const computed = sha256Hex(plain);
        return safeEqual(user.passwordHash, computed);
    }

    return false;
}

function normalizeRole(value = '') {
    const role = String(value || '').trim().toLowerCase();
    if (['owner', 'admin', 'seller'].includes(role)) return role;
    return 'seller';
}

function sanitizeUser(user = {}) {
    return {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: normalizeRole(user.role),
        name: user.name
    };
}

function buildAccessSessionForUser(user = {}) {
    const now = nowEpochSeconds();
    const ttl = getTokenTtlSec();
    const payload = {
        sub: String(user.id || '').trim(),
        email: String(user.email || '').trim().toLowerCase(),
        tenantId: String(user.tenantId || 'default').trim(),
        role: normalizeRole(user.role),
        name: String(user.name || '').trim() || null,
        iat: now,
        exp: now + ttl,
        jti: randomTokenId('jti')
    };

    const accessToken = buildAccessToken(payload);
    return {
        accessToken,
        tokenType: 'Bearer',
        expiresInSec: ttl,
        payload
    };
}

async function login({ email = '', password = '', tenantId = '', tenantSlug = '' } = {}) {
    if (!isAuthEnabled()) {
        throw new Error('Autenticacion SaaS deshabilitada. Activa SAAS_AUTH_ENABLED=true.');
    }

    if (!getAuthSecret()) {
        throw new Error('Falta SAAS_AUTH_SECRET para generar tokens de acceso.');
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const users = parseUsersFromEnv();
    if (!users.length) {
        throw new Error('No hay usuarios configurados en SAAS_USERS_JSON.');
    }

    const candidates = users.filter((user) => user.email === cleanEmail);
    const tenantFilter = String(tenantId || '').trim();
    const tenantSlugFilter = String(tenantSlug || '').trim().toLowerCase();
    const filtered = candidates.filter((user) => {
        if (tenantFilter && user.tenantId !== tenantFilter) return false;
        if (tenantSlugFilter && user.tenantId.toLowerCase() !== tenantSlugFilter) return false;
        return true;
    });

    const target = (filtered[0] || candidates[0] || null);
    if (!target || !verifyUserPassword(target, password)) {
        throw new Error('Credenciales invalidas.');
    }

    const accessSession = buildAccessSessionForUser(target);
    const refresh = await authSessionService.issueRefreshSession({
        tenantId: target.tenantId,
        user: {
            id: target.id,
            email: target.email,
            role: target.role,
            name: target.name
        }
    });

    return {
        accessToken: accessSession.accessToken,
        tokenType: accessSession.tokenType,
        expiresInSec: accessSession.expiresInSec,
        refreshToken: refresh.refreshToken,
        refreshExpiresInSec: refresh.expiresInSec,
        refreshExpiresAtUnix: refresh.expiresAtUnix,
        user: sanitizeUser(target)
    };
}

async function refreshSession({ refreshToken = '' } = {}) {
    if (!isAuthEnabled()) {
        throw new Error('Autenticacion SaaS deshabilitada.');
    }

    if (!getAuthSecret()) {
        throw new Error('Falta SAAS_AUTH_SECRET para renovar sesion.');
    }

    const cleanRefreshToken = String(refreshToken || '').trim();
    if (!cleanRefreshToken) {
        throw new Error('Refresh token requerido.');
    }

    const rotated = await authSessionService.rotateRefreshSession(cleanRefreshToken);
    if (!rotated) {
        throw new Error('Refresh token invalido o expirado.');
    }

    const user = {
        id: rotated.userId,
        email: rotated.email,
        tenantId: rotated.tenantId,
        role: normalizeRole(rotated.role),
        name: null
    };
    const accessSession = buildAccessSessionForUser(user);

    return {
        accessToken: accessSession.accessToken,
        tokenType: accessSession.tokenType,
        expiresInSec: accessSession.expiresInSec,
        refreshToken: rotated.refreshToken,
        refreshExpiresInSec: rotated.refreshExpiresInSec,
        refreshExpiresAtUnix: rotated.refreshExpiresAtUnix,
        user: sanitizeUser(user)
    };
}

function getTokenFromRequest(req = {}) {
    const authHeader = String(req?.headers?.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }
    return String(req?.headers?.['x-access-token'] || '').trim();
}

function verifyAccessToken(token = '') {
    if (!isAuthEnabled()) return null;
    const payload = parseAccessToken(token);
    if (!payload) return null;
    return {
        userId: String(payload.sub || '').trim(),
        email: String(payload.email || '').trim().toLowerCase(),
        tenantId: String(payload.tenantId || 'default').trim(),
        role: normalizeRole(payload.role),
        name: String(payload.name || '').trim() || null,
        exp: Number(payload.exp || 0),
        iat: Number(payload.iat || 0),
        jti: String(payload.jti || '').trim() || null
    };
}

async function verifyAccessTokenAsync(token = '') {
    const cleanToken = String(token || '').trim();
    const auth = verifyAccessToken(cleanToken);
    if (!auth) return null;

    const revoked = await authSessionService.isAccessTokenRevoked({
        tenantId: auth.tenantId,
        tokenHash: authSessionService.buildAccessTokenHash(cleanToken),
        jti: auth.jti
    });
    if (revoked) return null;

    return auth;
}

async function logoutSession({ accessToken = '', refreshToken = '', reason = 'logout' } = {}) {
    const cleanAccessToken = String(accessToken || '').trim();
    const cleanRefreshToken = String(refreshToken || '').trim();

    let auth = null;
    if (cleanAccessToken) {
        auth = verifyAccessToken(cleanAccessToken);
    }

    let revokedAccess = false;
    if (auth && cleanAccessToken) {
        await authSessionService.revokeAccessToken({
            tenantId: auth.tenantId,
            accessToken: cleanAccessToken,
            jti: auth.jti,
            userId: auth.userId,
            expiresAtUnix: auth.exp,
            reason
        });
        revokedAccess = true;
    }

    let revokedRefresh = false;
    if (cleanRefreshToken) {
        const revoked = await authSessionService.revokeRefreshToken(cleanRefreshToken, { reason });
        revokedRefresh = Boolean(revoked?.ok && Number(revoked?.updated || 0) > 0);
    }

    if (!revokedAccess && !revokedRefresh) {
        return {
            ok: false,
            revokedAccess: false,
            revokedRefresh: false,
            user: auth
                ? {
                    id: auth.userId,
                    email: auth.email,
                    tenantId: auth.tenantId,
                    role: auth.role,
                    name: auth.name
                }
                : null
        };
    }

    return {
        ok: true,
        revokedAccess,
        revokedRefresh,
        user: auth
            ? {
                id: auth.userId,
                email: auth.email,
                tenantId: auth.tenantId,
                role: auth.role,
                name: auth.name
            }
            : null
    };
}

function getRequestAuthContext(req = {}) {
    const token = getTokenFromRequest(req);
    const auth = verifyAccessToken(token);
    return {
        enabled: isAuthEnabled(),
        tokenPresent: Boolean(token),
        isAuthenticated: Boolean(auth),
        user: auth
    };
}

async function getRequestAuthContextAsync(req = {}) {
    const token = getTokenFromRequest(req);
    const auth = await verifyAccessTokenAsync(token);
    return {
        enabled: isAuthEnabled(),
        tokenPresent: Boolean(token),
        isAuthenticated: Boolean(auth),
        user: auth
    };
}

module.exports = {
    isAuthEnabled,
    login,
    refreshSession,
    logoutSession,
    verifyAccessToken,
    verifyAccessTokenAsync,
    getTokenFromRequest,
    getRequestAuthContext,
    getRequestAuthContextAsync
};
