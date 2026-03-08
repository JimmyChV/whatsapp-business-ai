const crypto = require('crypto');

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

function sanitizeUser(user = {}) {
    return {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        name: user.name
    };
}

function login({ email = '', password = '', tenantId = '', tenantSlug = '' } = {}) {
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

    const now = nowEpochSeconds();
    const ttl = getTokenTtlSec();
    const payload = {
        sub: target.id,
        email: target.email,
        tenantId: target.tenantId,
        role: target.role,
        name: target.name,
        iat: now,
        exp: now + ttl
    };

    const accessToken = buildAccessToken(payload);
    return {
        accessToken,
        tokenType: 'Bearer',
        expiresInSec: ttl,
        user: sanitizeUser(target)
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
        role: String(payload.role || 'seller').trim().toLowerCase(),
        name: String(payload.name || '').trim() || null,
        exp: Number(payload.exp || 0),
        iat: Number(payload.iat || 0)
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

module.exports = {
    isAuthEnabled,
    login,
    verifyAccessToken,
    getTokenFromRequest,
    getRequestAuthContext
};
