const crypto = require('crypto');

const HASH_PREFIX = 'pbkdf2_sha512';
const DEFAULT_ITERATIONS = Math.max(120000, Number(process.env.SAAS_PASSWORD_HASH_ITERATIONS || 210000));
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function toBase64Url(buffer) {
    return Buffer.from(buffer)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(value = '') {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (normalized.length % 4)) % 4;
    return Buffer.from(normalized + '='.repeat(pad), 'base64');
}

function sha256Hex(value = '') {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function isLegacySha256Hash(value = '') {
    return /^[a-f0-9]{64}$/i.test(String(value || '').trim());
}

function normalizeStoredHash(value = '') {
    const clean = String(value || '').trim();
    if (!clean) return '';
    if (clean.startsWith(`${HASH_PREFIX}$`)) return clean;
    if (isLegacySha256Hash(clean)) return clean.toLowerCase();
    return clean;
}

function parsePbkdf2Hash(value = '') {
    const clean = String(value || '').trim();
    const [prefix, iterRaw, saltRaw, hashRaw] = clean.split('$');
    if (prefix !== HASH_PREFIX) return null;
    const iterations = Number(iterRaw);
    if (!Number.isInteger(iterations) || iterations < 10000) return null;

    try {
        const salt = fromBase64Url(saltRaw || '');
        const hash = fromBase64Url(hashRaw || '');
        if (!salt.length || !hash.length) return null;
        return { iterations, salt, hash };
    } catch (_) {
        return null;
    }
}

function safeEqual(left, right) {
    const a = Buffer.isBuffer(left) ? left : Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.isBuffer(right) ? right : Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(a, b);
    } catch (_) {
        return false;
    }
}

function hashPassword(rawPassword = '') {
    const password = String(rawPassword || '');
    if (!password) return '';

    const salt = crypto.randomBytes(SALT_BYTES);
    const derived = crypto.pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, KEY_BYTES, 'sha512');
    return `${HASH_PREFIX}$${DEFAULT_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

function verifyPassword(rawPassword = '', storedHash = '') {
    const password = String(rawPassword || '');
    const cleanHash = normalizeStoredHash(storedHash);
    if (!password || !cleanHash) return false;

    if (isLegacySha256Hash(cleanHash)) {
        return safeEqual(sha256Hex(password), cleanHash.toLowerCase());
    }

    const parsed = parsePbkdf2Hash(cleanHash);
    if (!parsed) return false;

    const computed = crypto.pbkdf2Sync(password, parsed.salt, parsed.iterations, parsed.hash.length, 'sha512');
    return safeEqual(computed, parsed.hash);
}

module.exports = {
    hashPassword,
    verifyPassword,
    normalizeStoredHash,
    isLegacySha256Hash,
    HASH_PREFIX
};
