const crypto = require('crypto');

function normalizeDigits(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function defaultCountryCode() {
    return normalizeDigits(process.env.WA_DEFAULT_COUNTRY_CODE || process.env.DEFAULT_COUNTRY_CODE || '51');
}

function withDefaultCountryCode(value = '') {
    const digits = normalizeDigits(value);
    if (!digits) return '';
    const cc = defaultCountryCode();
    const trimmed = digits.replace(/^0+/, '') || digits;
    if (trimmed.length <= 10 && cc && !trimmed.startsWith(cc)) {
        return cc + trimmed;
    }
    return trimmed;
}

function toChatId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw;
    const digits = normalizeDigits(raw);
    return digits ? `${digits}@c.us` : '';
}

function toWaId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@lid')) return '';
    const base = raw.includes('@') ? normalizeDigits(raw.split('@')[0] || '') : normalizeDigits(raw);
    return withDefaultCountryCode(base);
}

function safeTimestamp(value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    return Math.floor(Date.now() / 1000);
}

function randomMessageId(prefix = 'cloud') {
    try {
        return `${prefix}_${crypto.randomUUID()}`;
    } catch (e) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

function ackFromCloudStatus(status = '') {
    const value = String(status || '').toLowerCase();
    if (value === 'read') return 3;
    if (value === 'delivered') return 2;
    if (value === 'sent') return 1;
    if (value === 'failed') return -1;
    return 0;
}

function parseMoneyLike(value, { scaleHint = '' } = {}) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        if (String(scaleHint || '').toLowerCase().includes('1000')) {
            return Math.round((value / 1000) * 100) / 100;
        }
        if (String(scaleHint || '').toLowerCase().includes('cent') || String(scaleHint || '').toLowerCase().includes('minor')) {
            return Math.round((value / 100) * 100) / 100;
        }
        return Math.round(value * 100) / 100;
    }

    const text = String(value || '').trim();
    if (!text) return null;

    let normalized = text.replace(/[^\d.,-]/g, '');
    if (!normalized || normalized === '-' || normalized === '.' || normalized === ',') return null;

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
    } else if (hasComma) {
        const commaCount = (normalized.match(/,/g) || []).length;
        normalized = commaCount > 1 ? normalized.replace(/,/g, '') : normalized.replace(',', '.');
    }

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) return null;

    const hint = String(scaleHint || '').toLowerCase();
    if (hint.includes('1000')) return Math.round((parsed / 1000) * 100) / 100;
    if (hint.includes('cent') || hint.includes('minor')) return Math.round((parsed / 100) * 100) / 100;

    // Heuristic fallback for Cloud payloads that sometimes deliver x1000 values without explicit suffix.
    if (!hint && Math.abs(parsed) >= 100000) {
        return Math.round((parsed / 1000) * 100) / 100;
    }

    return Math.round(parsed * 100) / 100;
}

function parseQuantityLike(value, fallback = 1) {
    const parsed = parseMoneyLike(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.max(1, Math.round(parsed * 1000) / 1000);
}

function buildOrderLineFromCloud(item = {}, idx = 1, fallbackCurrency = 'PEN') {
    if (!item || typeof item !== 'object') return null;

    const sku = String(item?.product_retailer_id || item?.retailer_id || item?.sku || '').trim() || null;
    const name = String(item?.name || item?.title || item?.product_name || sku || `Producto ${idx}`).trim();
    const quantity = parseQuantityLike(item?.quantity ?? item?.qty ?? 1, 1);

    const unitPrice =
        parseMoneyLike(item?.item_price_amount_1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.itemPriceAmount1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.price_amount_1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.item_price)
        ?? parseMoneyLike(item?.unit_price)
        ?? parseMoneyLike(item?.price);

    const lineTotal =
        parseMoneyLike(item?.line_total_amount_1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.total_amount_1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.line_total)
        ?? parseMoneyLike(item?.total)
        ?? (Number.isFinite(unitPrice) ? Math.round((unitPrice * quantity) * 100) / 100 : null);

    return {
        name,
        quantity,
        sku,
        price: Number.isFinite(unitPrice) ? unitPrice : null,
        lineTotal: Number.isFinite(lineTotal) ? lineTotal : null,
        currency: String(item?.currency || fallbackCurrency || 'PEN').trim() || 'PEN'
    };
}

function compactObject(input = {}) {
    const out = {};
    Object.entries(input || {}).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        out[key] = value;
    });
    return out;
}

function normalizeRuntimeCloudConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const normalized = {
        appId: String(source.appId || source.app_id || '').trim() || null,
        appSecret: String(source.appSecret || source.app_secret || '').trim() || null,
        systemUserToken: String(source.systemUserToken || source.system_user_token || '').trim() || null,
        wabaId: String(source.wabaId || source.waba_id || '').trim() || null,
        phoneNumberId: String(source.phoneNumberId || source.phone_number_id || '').trim() || null,
        verifyToken: String(source.verifyToken || source.verify_token || '').trim() || null,
        graphVersion: String(source.graphVersion || source.graph_version || '').trim() || null,
        displayPhoneNumber: String(source.displayPhoneNumber || source.display_phone_number || '').trim() || null,
        businessName: String(source.businessName || source.business_name || '').trim() || null
    };

    return compactObject(normalized);
}

module.exports = {
    normalizeDigits,
    defaultCountryCode,
    withDefaultCountryCode,
    toChatId,
    toWaId,
    safeTimestamp,
    randomMessageId,
    ackFromCloudStatus,
    parseMoneyLike,
    parseQuantityLike,
    buildOrderLineFromCloud,
    compactObject,
    normalizeRuntimeCloudConfig
};

