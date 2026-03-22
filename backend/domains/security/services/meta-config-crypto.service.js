const crypto = require('crypto');

const ENCRYPTION_PREFIX = 'encv1:';
let cachedKey = null;
let cachedRaw = null;

function resolveKey() {
    const raw = String(process.env.META_CONFIG_ENCRYPTION_KEY || process.env.SAAS_AUTH_SECRET || '').trim();
    if (!raw) return null;
    if (cachedKey && cachedRaw === raw) return cachedKey;
    cachedRaw = raw;

    try {
        if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
            cachedKey = Buffer.from(raw, 'hex');
            return cachedKey;
        }

        const maybeBase64 = raw.replace(/\s+/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(maybeBase64) && maybeBase64.length >= 43) {
            const decoded = Buffer.from(maybeBase64, 'base64');
            if (decoded.length >= 32) {
                cachedKey = decoded.subarray(0, 32);
                return cachedKey;
            }
        }
    } catch (_) {
        // fallback to hash-based key
    }

    cachedKey = crypto.createHash('sha256').update(raw, 'utf8').digest();
    return cachedKey;
}

function isEncryptedValue(value = '') {
    return String(value || '').startsWith(ENCRYPTION_PREFIX);
}

function encryptSecret(value = '') {
    const text = String(value || '').trim();
    if (!text) return null;

    const key = resolveKey();
    if (!key) return text;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTION_PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptSecret(value = '') {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!isEncryptedValue(text)) return text;

    const key = resolveKey();
    if (!key) return '';

    const raw = text.slice(ENCRYPTION_PREFIX.length);
    const parts = raw.split('.');
    if (parts.length !== 3) return '';

    try {
        const iv = Buffer.from(parts[0], 'base64');
        const tag = Buffer.from(parts[1], 'base64');
        const payload = Buffer.from(parts[2], 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const out = Buffer.concat([decipher.update(payload), decipher.final()]);
        return out.toString('utf8');
    } catch (_) {
        return '';
    }
}

function decryptSecretFully(value = '', maxLayers = 8) {
    let current = String(value || '').trim();
    if (!current) return '';

    for (let depth = 0; depth < maxLayers; depth += 1) {
        if (!isEncryptedValue(current)) return current;
        const next = decryptSecret(current);
        if (!next) return '';
        if (next === current) break;
        current = String(next).trim();
    }

    return isEncryptedValue(current) ? '' : current;
}

function maskSecret(value = '') {
    const clean = String(value || '').trim();
    if (!clean) return null;
    if (clean.length <= 8) return '*'.repeat(clean.length);
    return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function normalizePlain(value = '') {
    const text = String(value || '').trim();
    return text || null;
}

function normalizeBoolean(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const text = value.trim().toLowerCase();
        if (['true', 'yes', 'on'].includes(text)) return true;
        if (['false', 'no', 'off'].includes(text)) return false;
    }
    return fallback !== false;
}

function normalizeSecretForStorage(incomingValue, currentValue) {
    const incoming = String(incomingValue || '').trim();
    if (incoming) {
        if (isEncryptedValue(incoming)) return incoming;
        return encryptSecret(incoming);
    }
    const current = String(currentValue || '').trim();
    return current || null;
}

function normalizeCloudConfigPublic(cloud = {}) {
    const source = cloud && typeof cloud === 'object' ? cloud : {};
    const appSecretRaw = String(source.appSecret || source.app_secret || '').trim();
    const tokenRaw = String(source.systemUserToken || source.system_user_token || '').trim();
    const appSecretPlain = decryptSecretFully(appSecretRaw);
    const tokenPlain = decryptSecretFully(tokenRaw);

    return {
        appId: normalizePlain(source.appId || source.app_id),
        wabaId: normalizePlain(source.wabaId || source.waba_id),
        phoneNumberId: normalizePlain(source.phoneNumberId || source.phone_number_id),
        verifyToken: normalizePlain(source.verifyToken || source.verify_token),
        graphVersion: normalizePlain(source.graphVersion || source.graph_version),
        displayPhoneNumber: normalizePlain(source.displayPhoneNumber || source.display_phone_number),
        businessName: normalizePlain(source.businessName || source.business_name),
        enforceSignature: normalizeBoolean(source.enforceSignature, true),
        hasSystemUserToken: Boolean(tokenRaw),
        hasAppSecret: Boolean(appSecretRaw),
        systemUserTokenMasked: tokenPlain ? maskSecret(tokenPlain) : null,
        appSecretMasked: appSecretPlain ? maskSecret(appSecretPlain) : null
    };
}

function normalizeCloudConfigRuntime(cloud = {}) {
    const source = cloud && typeof cloud === 'object' ? cloud : {};
    return {
        appId: normalizePlain(source.appId || source.app_id),
        appSecret: normalizePlain(decryptSecretFully(source.appSecret || source.app_secret)),
        systemUserToken: normalizePlain(decryptSecretFully(source.systemUserToken || source.system_user_token)),
        wabaId: normalizePlain(source.wabaId || source.waba_id),
        phoneNumberId: normalizePlain(source.phoneNumberId || source.phone_number_id),
        verifyToken: normalizePlain(source.verifyToken || source.verify_token),
        graphVersion: normalizePlain(source.graphVersion || source.graph_version),
        displayPhoneNumber: normalizePlain(source.displayPhoneNumber || source.display_phone_number),
        businessName: normalizePlain(source.businessName || source.business_name),
        enforceSignature: normalizeBoolean(source.enforceSignature, true)
    };
}

function prepareModuleMetadataForSave(nextMetadata = {}, existingMetadata = {}) {
    const current = existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
        ? existingMetadata
        : {};
    const incoming = nextMetadata && typeof nextMetadata === 'object' && !Array.isArray(nextMetadata)
        ? nextMetadata
        : {};

    const merged = {
        ...current,
        ...incoming
    };

    const currentCloud = current.cloudConfig && typeof current.cloudConfig === 'object' ? current.cloudConfig : {};
    const incomingCloud = incoming.cloudConfig && typeof incoming.cloudConfig === 'object' ? incoming.cloudConfig : {};

    const hasIncomingCloud = Object.keys(incomingCloud).length > 0;
    const cloudSource = hasIncomingCloud ? { ...currentCloud, ...incomingCloud } : currentCloud;

    const nextCloud = {
        appId: normalizePlain(cloudSource.appId || cloudSource.app_id),
        appSecret: normalizeSecretForStorage(
            incomingCloud.appSecret || incomingCloud.app_secret,
            currentCloud.appSecret || currentCloud.app_secret
        ),
        systemUserToken: normalizeSecretForStorage(
            incomingCloud.systemUserToken || incomingCloud.system_user_token,
            currentCloud.systemUserToken || currentCloud.system_user_token
        ),
        wabaId: normalizePlain(cloudSource.wabaId || cloudSource.waba_id),
        phoneNumberId: normalizePlain(cloudSource.phoneNumberId || cloudSource.phone_number_id),
        verifyToken: normalizePlain(cloudSource.verifyToken || cloudSource.verify_token),
        graphVersion: normalizePlain(cloudSource.graphVersion || cloudSource.graph_version),
        displayPhoneNumber: normalizePlain(cloudSource.displayPhoneNumber || cloudSource.display_phone_number),
        businessName: normalizePlain(cloudSource.businessName || cloudSource.business_name),
        enforceSignature: normalizeBoolean(cloudSource.enforceSignature, true)
    };

    merged.cloudConfig = nextCloud;
    return merged;
}

function sanitizeModuleMetadataForPublic(metadata = {}) {
    const source = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {};

    const out = {
        ...source,
        cloudConfig: normalizeCloudConfigPublic(source.cloudConfig)
    };

    return out;
}

function resolveCloudConfigFromMetadata(metadata = {}) {
    const source = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {};
    return normalizeCloudConfigRuntime(source.cloudConfig);
}

module.exports = {
    ENCRYPTION_PREFIX,
    isEncryptedValue,
    encryptSecret,
    decryptSecret,
    decryptSecretFully,
    maskSecret,
    prepareModuleMetadataForSave,
    sanitizeModuleMetadataForPublic,
    resolveCloudConfigFromMetadata
};

