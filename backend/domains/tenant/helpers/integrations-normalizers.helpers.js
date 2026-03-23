const crypto = require('crypto');
const {
    encryptSecret,
    decryptSecret,
    isEncryptedValue
} = require('../../security/services/meta-config-crypto.service');

const ALLOWED_CATALOG_MODES_SET = new Set(['hybrid', 'meta_only', 'woo_only', 'local_only']);
const ALLOWED_AI_PROVIDERS_SET = new Set(['openai']);
const ASSISTANT_ID_PATTERN = /^AIA-[A-Z0-9]{6}$/;

const DEFAULT_INTEGRATIONS = Object.freeze({
    catalog: {
        mode: 'hybrid',
        providers: {
            meta: { enabled: true },
            woocommerce: {
                enabled: true,
                baseUrl: null,
                perPage: 100,
                maxPages: 10,
                includeOutOfStock: true,
                consumerKey: null,
                consumerSecret: null
            },
            local: { enabled: true }
        }
    },
    ai: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        openaiApiKey: null,
        defaultAssistantId: null,
        assistants: []
    },
    appearance: {
        brandName: null,
        primaryColor: '#12d2a6',
        secondaryColor: '#0b1f2e',
        accentColor: '#1ea7ff',
        surfaceColor: '#102433',
        backgroundColor: '#061520'
    },
    updatedAt: null
});

function cloneDefaultIntegrations() {
    return JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS));
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toBool(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const text = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(text)) return true;
        if (['false', '0', 'no', 'off'].includes(text)) return false;
    }
    return Boolean(fallback);
}

function normalizeText(value = '') {
    const text = String(value || '').trim();
    return text || null;
}

function normalizePositiveInteger(value, fallback = 1, { min = 1, max = 1000 } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.floor(parsed);
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
}

function normalizeCatalogMode(value = '', fallback = 'hybrid') {
    const mode = String(value || '').trim().toLowerCase();
    if (ALLOWED_CATALOG_MODES_SET.has(mode)) return mode;
    return ALLOWED_CATALOG_MODES_SET.has(fallback) ? fallback : 'hybrid';
}

function normalizeAiProvider(value = '', fallback = 'openai') {
    const provider = String(value || '').trim().toLowerCase();
    if (ALLOWED_AI_PROVIDERS_SET.has(provider)) return provider;
    return ALLOWED_AI_PROVIDERS_SET.has(fallback) ? fallback : 'openai';
}

function normalizeAiAssistantId(value = '', fallback = '') {
    const clean = String(value || fallback || '').trim().toUpperCase();
    return ASSISTANT_ID_PATTERN.test(clean) ? clean : '';
}

function randomAssistantSuffix(size = 6) {
    const safeSize = Math.max(4, Math.floor(Number(size) || 6));
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(safeSize * 2);
    let out = '';
    for (let i = 0; i < bytes.length && out.length < safeSize; i += 1) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out.slice(0, safeSize);
}

function createUniqueAssistantId(items = []) {
    const existing = new Set(
        (Array.isArray(items) ? items : [])
            .map((entry) => normalizeAiAssistantId(entry?.assistantId || entry?.id || ''))
            .filter(Boolean)
    );

    for (let i = 0; i < 1000; i += 1) {
        const candidate = `AIA-${randomAssistantSuffix(6)}`;
        if (!existing.has(candidate)) return candidate;
    }

    const fallback = Date.now()
        .toString(36)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(-6)
        .padStart(6, '0');
    return `AIA-${fallback}`;
}

function createStableAssistantId(seed = '', usedIds = []) {
    const blocked = new Set(
        (Array.isArray(usedIds) ? usedIds : [])
            .map((entry) => normalizeAiAssistantId(entry || ''))
            .filter(Boolean)
    );
    const safeSeed = String(seed || '').trim() || 'assistant';

    for (let i = 0; i < 256; i += 1) {
        const digest = crypto.createHash('sha1').update(`${safeSeed}|${i}`).digest('hex').toUpperCase();
        const suffix = String(digest || '').replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');
        const candidate = `AIA-${suffix}`;
        if (!blocked.has(candidate)) return candidate;
    }

    return createUniqueAssistantId(Array.from(blocked).map((assistantId) => ({ assistantId })));
}

function normalizeFloatInRange(value, fallback = 1, { min = 0, max = 1, decimals = 2 } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const clamped = Math.min(max, Math.max(min, parsed));
    const multiplier = 10 ** Math.max(0, Math.floor(Number(decimals) || 0));
    return Math.round(clamped * multiplier) / multiplier;
}

function normalizeColor(value = '', fallback = '#12d2a6') {
    const text = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
    return fallback;
}

function normalizeSecretForStorage(value, fallback = null) {
    if (value === undefined) return fallback;
    if (value === null) return null;
    const text = String(value || '').trim();
    if (!text) return null;
    if (isEncryptedValue(text)) return text;
    return encryptSecret(text);
}

function resolveSecretPlain(value = '') {
    const text = String(value || '').trim();
    if (!text) return null;
    const plain = decryptSecret(text);
    const out = String(plain || '').trim();
    return out || null;
}

module.exports = {
    ALLOWED_CATALOG_MODES_SET,
    DEFAULT_INTEGRATIONS,
    cloneDefaultIntegrations,
    isPlainObject,
    toBool,
    normalizeText,
    normalizePositiveInteger,
    normalizeCatalogMode,
    normalizeAiProvider,
    normalizeAiAssistantId,
    createUniqueAssistantId,
    createStableAssistantId,
    normalizeFloatInRange,
    normalizeColor,
    normalizeSecretForStorage,
    resolveSecretPlain
};
