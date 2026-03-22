const crypto = require('crypto');
const authSessionService = require('./auth-session.service');
const saasControlService = require('../../tenant/services/tenant-control.service');
const emailService = require('./email.service');
const {
    DEFAULT_TENANT_ID,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');

const STORE_FILE = 'auth_recovery_store.json';
const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

function parseBooleanEnv(value, defaultValue = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function parseNumberEnv(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.floor(parsed);
    if (Number.isFinite(min) && rounded < min) return min;
    if (Number.isFinite(max) && rounded > max) return max;
    return rounded;
}

const RECOVERY_CODE_TTL_SEC = parseNumberEnv(process.env.AUTH_RECOVERY_CODE_TTL_SEC, 600, 120, 1800);
const RECOVERY_TOKEN_TTL_SEC = parseNumberEnv(process.env.AUTH_RECOVERY_TOKEN_TTL_SEC, 900, 300, 3600);
const RECOVERY_MAX_REQUESTS_PER_WINDOW = parseNumberEnv(process.env.AUTH_RECOVERY_MAX_REQUESTS_PER_WINDOW, 5, 1, 20);
const RECOVERY_REQUEST_WINDOW_SEC = parseNumberEnv(process.env.AUTH_RECOVERY_REQUEST_WINDOW_SEC, 3600, 60, 86400);
const RECOVERY_MAX_VERIFY_ATTEMPTS = parseNumberEnv(process.env.AUTH_RECOVERY_MAX_VERIFY_ATTEMPTS, 5, 2, 15);
const RECOVERY_CODE_LENGTH = parseNumberEnv(process.env.AUTH_RECOVERY_CODE_LENGTH, 6, 6, 8);
const ALLOW_DEBUG_CODE = parseBooleanEnv(process.env.AUTH_RECOVERY_DEBUG_CODE, !isProduction);

function nowEpochSeconds() {
    return Math.floor(Date.now() / 1000);
}

function normalizeEmail(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeCode(value = '') {
    return String(value || '').trim().replace(/\s+/g, '');
}

function normalizeResetToken(value = '') {
    return String(value || '').trim();
}

function buildPepper() {
    const custom = String(process.env.AUTH_RECOVERY_PEPPER || '').trim();
    if (custom) return custom;
    const authSecret = String(process.env.SAAS_AUTH_SECRET || '').trim();
    if (authSecret) return authSecret;
    return 'recovery_default_pepper';
}

function sha256Hex(value = '') {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function safeEqual(left = '', right = '') {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(a, b);
    } catch (_) {
        return false;
    }
}

function hashRecoveryValue(label = '', email = '', value = '') {
    const pepper = buildPepper();
    return sha256Hex(`${pepper}|${String(label || '')}|${normalizeEmail(email)}|${String(value || '')}`);
}

function generateNumericCode(length = RECOVERY_CODE_LENGTH) {
    const digits = Math.max(6, Number(length) || 6);
    const max = Number('9'.repeat(digits));
    const min = Number('1'.padEnd(digits, '0'));
    const value = crypto.randomInt(min, max + 1);
    return String(value).padStart(digits, '0');
}

function generateResetToken() {
    return crypto.randomBytes(24).toString('hex');
}

function maskEmail(email = '') {
    const safeEmail = normalizeEmail(email);
    const atIndex = safeEmail.indexOf('@');
    if (atIndex <= 1) return safeEmail;
    const local = safeEmail.slice(0, atIndex);
    const domain = safeEmail.slice(atIndex + 1);
    const maskedLocal = local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local[local.length - 1];
    return `${maskedLocal}@${domain}`;
}

function isStrongPassword(password = '') {
    const value = String(password || '');
    if (value.length < 10) return false;
    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasDigit = /\d/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);
    return hasLower && hasUpper && hasDigit && hasSpecial;
}

function normalizeStore(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return {
        challengesByEmail: source.challengesByEmail && typeof source.challengesByEmail === 'object'
            ? source.challengesByEmail
            : {},
        resetTokensByEmail: source.resetTokensByEmail && typeof source.resetTokensByEmail === 'object'
            ? source.resetTokensByEmail
            : {},
        requestLogByEmail: source.requestLogByEmail && typeof source.requestLogByEmail === 'object'
            ? source.requestLogByEmail
            : {}
    };
}

function cleanupStore(store = {}, nowSec = nowEpochSeconds()) {
    const next = normalizeStore(store);

    Object.entries(next.challengesByEmail).forEach(([email, challenge]) => {
        const expiresAt = Number(challenge?.expiresAtUnix || 0);
        if (!expiresAt || expiresAt <= nowSec) {
            delete next.challengesByEmail[email];
        }
    });

    Object.entries(next.resetTokensByEmail).forEach(([email, token]) => {
        const expiresAt = Number(token?.expiresAtUnix || 0);
        const usedAt = Number(token?.usedAtUnix || 0);
        if ((expiresAt && expiresAt <= nowSec) || usedAt > 0) {
            delete next.resetTokensByEmail[email];
        }
    });

    Object.entries(next.requestLogByEmail).forEach(([email, entries]) => {
        const safeEntries = (Array.isArray(entries) ? entries : [])
            .map((item) => Number(item || 0))
            .filter((item) => Number.isFinite(item) && item > nowSec - RECOVERY_REQUEST_WINDOW_SEC);
        if (safeEntries.length === 0) {
            delete next.requestLogByEmail[email];
            return;
        }
        next.requestLogByEmail[email] = safeEntries;
    });

    return next;
}

async function loadStore() {
    const parsed = await readTenantJsonFile(STORE_FILE, {
        tenantId: DEFAULT_TENANT_ID,
        defaultValue: {
            challengesByEmail: {},
            resetTokensByEmail: {},
            requestLogByEmail: {}
        }
    });
    return normalizeStore(parsed);
}

async function saveStore(store = {}) {
    await writeTenantJsonFile(STORE_FILE, normalizeStore(store), {
        tenantId: DEFAULT_TENANT_ID
    });
}

async function requestPasswordRecovery({ email = '', requestIp = '', requestId = '' } = {}) {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) {
        throw new Error('Correo invalido.');
    }

    await saasControlService.ensureLoaded();

    const nowSec = nowEpochSeconds();
    const store = cleanupStore(await loadStore(), nowSec);
    const recentRequests = Array.isArray(store.requestLogByEmail[cleanEmail])
        ? store.requestLogByEmail[cleanEmail]
        : [];

    if (recentRequests.length >= RECOVERY_MAX_REQUESTS_PER_WINDOW) {
        await saveStore(store);
        return {
            ok: true,
            accepted: true,
            maskedEmail: maskEmail(cleanEmail),
            expiresInSec: RECOVERY_CODE_TTL_SEC,
            delivery: 'accepted'
        };
    }

    store.requestLogByEmail[cleanEmail] = [...recentRequests, nowSec];

    const user = saasControlService.findUserByEmailSync(cleanEmail);
    if (!user || user.active === false) {
        await saveStore(store);
        return {
            ok: true,
            accepted: true,
            maskedEmail: maskEmail(cleanEmail),
            expiresInSec: RECOVERY_CODE_TTL_SEC,
            delivery: 'accepted'
        };
    }

    const code = generateNumericCode(RECOVERY_CODE_LENGTH);
    store.challengesByEmail[cleanEmail] = {
        email: cleanEmail,
        userId: String(user.id || '').trim(),
        tenantId: String(user.memberships?.[0]?.tenantId || user.tenantId || 'default').trim() || 'default',
        codeHash: hashRecoveryValue('code', cleanEmail, code),
        createdAtUnix: nowSec,
        expiresAtUnix: nowSec + RECOVERY_CODE_TTL_SEC,
        attempts: 0,
        maxAttempts: RECOVERY_MAX_VERIFY_ATTEMPTS,
        requestIp: String(requestIp || '').trim() || null,
        requestId: String(requestId || '').trim() || null
    };

    await saveStore(store);

    let delivery = 'email';
    let debugCode = null;
    try {
        const subject = 'Codigo de seguridad para recuperar tu acceso';
        const text = [
            'Recibimos una solicitud para restablecer tu contrasena.',
            `Tu codigo de verificacion es: ${code}`,
            `Este codigo vence en ${Math.floor(RECOVERY_CODE_TTL_SEC / 60)} minutos.`,
            'Si no solicitaste este cambio, ignora este correo.'
        ].join('\n');

        const html = [
            '<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a">',
            '<h2 style="margin:0 0 8px">Recuperacion de acceso</h2>',
            '<p style="margin:0 0 10px">Usa este codigo para continuar tu recuperacion:</p>',
            `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:0 0 12px">${code}</p>`,
            `<p style="margin:0 0 8px">Vence en ${Math.floor(RECOVERY_CODE_TTL_SEC / 60)} minutos.</p>`,
            '<p style="margin:0;color:#64748b">Si no solicitaste este cambio, ignora este correo.</p>',
            '</div>'
        ].join('');

        await emailService.sendEmail({
            to: cleanEmail,
            subject,
            text,
            html
        });
    } catch (error) {
        delivery = 'accepted';
        if (ALLOW_DEBUG_CODE) {
            debugCode = code;
        }
    }

    return {
        ok: true,
        accepted: true,
        maskedEmail: maskEmail(cleanEmail),
        expiresInSec: RECOVERY_CODE_TTL_SEC,
        delivery,
        debugCode
    };
}

async function verifyPasswordRecoveryCode({ email = '', code = '' } = {}) {
    const cleanEmail = normalizeEmail(email);
    const cleanCode = normalizeCode(code);
    if (!cleanEmail || !cleanCode) {
        throw new Error('Codigo invalido o expirado.');
    }

    const nowSec = nowEpochSeconds();
    const store = cleanupStore(await loadStore(), nowSec);
    const challenge = store.challengesByEmail[cleanEmail];
    if (!challenge) {
        await saveStore(store);
        throw new Error('Codigo invalido o expirado.');
    }

    if (Number(challenge.expiresAtUnix || 0) <= nowSec) {
        delete store.challengesByEmail[cleanEmail];
        await saveStore(store);
        throw new Error('Codigo invalido o expirado.');
    }

    const nextAttempts = Number(challenge.attempts || 0) + 1;
    const maxAttempts = Number(challenge.maxAttempts || RECOVERY_MAX_VERIFY_ATTEMPTS);

    const expectedHash = hashRecoveryValue('code', cleanEmail, cleanCode);
    if (!safeEqual(String(challenge.codeHash || ''), expectedHash)) {
        if (nextAttempts >= maxAttempts) {
            delete store.challengesByEmail[cleanEmail];
        } else {
            store.challengesByEmail[cleanEmail] = {
                ...challenge,
                attempts: nextAttempts
            };
        }
        await saveStore(store);
        throw new Error('Codigo invalido o expirado.');
    }

    const resetToken = generateResetToken();
    store.resetTokensByEmail[cleanEmail] = {
        email: cleanEmail,
        userId: String(challenge.userId || '').trim() || null,
        tokenHash: hashRecoveryValue('token', cleanEmail, resetToken),
        createdAtUnix: nowSec,
        expiresAtUnix: nowSec + RECOVERY_TOKEN_TTL_SEC,
        usedAtUnix: 0
    };
    delete store.challengesByEmail[cleanEmail];

    await saveStore(store);

    return {
        ok: true,
        resetToken,
        expiresInSec: RECOVERY_TOKEN_TTL_SEC
    };
}

async function resetPasswordWithRecoveryToken({ email = '', resetToken = '', newPassword = '' } = {}) {
    const cleanEmail = normalizeEmail(email);
    const cleanToken = normalizeResetToken(resetToken);
    const password = String(newPassword || '');

    if (!cleanEmail || !cleanToken) {
        throw new Error('Token de recuperacion invalido.');
    }
    if (!isStrongPassword(password)) {
        throw new Error('La nueva contrasena debe tener minimo 10 caracteres e incluir mayuscula, minuscula, numero y simbolo.');
    }

    await saasControlService.ensureLoaded();

    const nowSec = nowEpochSeconds();
    const store = cleanupStore(await loadStore(), nowSec);
    const tokenEntry = store.resetTokensByEmail[cleanEmail];
    if (!tokenEntry) {
        await saveStore(store);
        throw new Error('Token de recuperacion invalido o expirado.');
    }

    if (Number(tokenEntry.expiresAtUnix || 0) <= nowSec) {
        delete store.resetTokensByEmail[cleanEmail];
        await saveStore(store);
        throw new Error('Token de recuperacion invalido o expirado.');
    }

    const expectedHash = hashRecoveryValue('token', cleanEmail, cleanToken);
    if (!safeEqual(String(tokenEntry.tokenHash || ''), expectedHash)) {
        await saveStore(store);
        throw new Error('Token de recuperacion invalido o expirado.');
    }

    const user = saasControlService.findUserByEmailSync(cleanEmail);
    if (!user || !user.id) {
        delete store.resetTokensByEmail[cleanEmail];
        await saveStore(store);
        throw new Error('No se encontro el usuario asociado al correo.');
    }

    await saasControlService.updateUser(String(user.id || '').trim(), {
        password
    });

    tokenEntry.usedAtUnix = nowSec;
    store.resetTokensByEmail[cleanEmail] = tokenEntry;
    delete store.resetTokensByEmail[cleanEmail];
    delete store.requestLogByEmail[cleanEmail];
    await saveStore(store);

    const revoked = await authSessionService.revokeUserRefreshSessionsGlobally({
        userId: String(user.id || '').trim(),
        email: cleanEmail,
        reason: 'password_reset'
    });

    return {
        ok: true,
        userId: String(user.id || '').trim(),
        revokedSessions: revoked
    };
}

module.exports = {
    maskEmail,
    requestPasswordRecovery,
    verifyPasswordRecoveryCode,
    resetPasswordWithRecoveryToken
};


