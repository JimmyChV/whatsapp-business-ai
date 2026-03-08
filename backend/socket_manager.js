const { getChatSuggestion, askInternalCopilot } = require('./ai_service');
const waClient = require('./wa_provider');
const mediaManager = require('./media_manager');
const { loadCatalog, addProduct, updateProduct, deleteProduct } = require('./catalog_manager');
const { getWooCatalog, isWooConfigured } = require('./woocommerce_service');
const { listQuickReplies, addQuickReply, updateQuickReply, deleteQuickReply } = require('./quick_replies_manager');
const RateLimiter = require('./rate_limiter');
const { URL } = require('url');
const { resolveAndValidatePublicHost } = require('./security_utils');

const eventRateLimiter = new RateLimiter({
    windowMs: Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS || 10000),
    max: Number(process.env.SOCKET_RATE_LIMIT_MAX || 30)
});
const orderDebugSeen = new Set();
const ORDER_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.ORDER_DEBUG || '').trim().toLowerCase());
const ORDER_DEBUG_VERBOSE = ['1', 'true', 'yes', 'on'].includes(String(process.env.ORDER_DEBUG_VERBOSE || '').trim().toLowerCase());
const CATALOG_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.CATALOG_DEBUG || '').trim().toLowerCase());
const ORDER_DEBUG_MISSING_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.ORDER_DEBUG_MISSING || process.env.ORDER_DEBUG || '').trim().toLowerCase());
const CATALOG_DEBUG_MAX_ITEMS = Math.max(1, Number(process.env.CATALOG_DEBUG_MAX_ITEMS || 120));
let catalogDebugLastSignature = '';
const SENDER_META_TTL_MS = Math.max(60 * 1000, Number(process.env.SENDER_META_TTL_MS || (10 * 60 * 1000)));
const senderMetaCache = new Map();
const GROUP_PARTICIPANT_CONTACT_TTL_MS = Math.max(5 * 60 * 1000, Number(process.env.GROUP_PARTICIPANT_CONTACT_TTL_MS || (30 * 60 * 1000)));
const groupParticipantContactCache = new Map();

function guardRateLimit(socket, eventName) {
    const key = `${socket.id}:${eventName}`;
    const result = eventRateLimiter.check(key);
    if (!result.allowed) {
        socket.emit('error', `Rate limit excedido para ${eventName}. Intenta en unos segundos.`);
        return false;
    }
    return true;
}

function parseOrderNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const source = String(value || '').trim();
    if (!source) return null;

    let cleaned = source.replace(/[^\d.,-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') return null;

    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');

    if (hasComma && hasDot) {
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
    } else if (hasComma) {
        const commaCount = (cleaned.match(/,/g) || []).length;
        cleaned = commaCount > 1 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
    }

    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOrderCurrencyAmount(value, { scaleHint = '' } = {}) {
    const parsed = parseOrderNumber(value);
    if (!Number.isFinite(parsed)) return null;

    const hint = String(scaleHint || '').toLowerCase();
    let amount = parsed;
    if (hint.includes('1000')) {
        amount = parsed / 1000;
    } else if (hint.includes('minor') || hint.includes('cent')) {
        amount = parsed / 100;
    }

    return Math.round(amount * 100) / 100;
}

function normalizeOrderSku(value = '') {
    const raw = String(value || '').trim();
    return raw || null;
}

function normalizeOrderSkuKey(value = '') {
    const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return normalized || null;
}

function parseOrderLineFromObject(input = {}, indexHint = 1) {
    if (!input || typeof input !== 'object') return null;

    const rawName = String(
        input.name
        || input.title
        || input.productName
        || input.product_name
        || input.display_name
        || ''
    ).trim();

    const rawSku = normalizeOrderSku(
        input.sku
        || input.retailer_id
        || input.product_retailer_id
        || input.retailerId
        || input.productSku
        || input.seller_sku
    );

    const quantityRaw = input.quantity ?? input.qty ?? input.count ?? input.item_count ?? input.productQuantity ?? 1;
    const quantityParsed = parseOrderNumber(quantityRaw);
    const quantity = Number.isFinite(quantityParsed) && quantityParsed > 0
        ? Math.max(1, Math.round(quantityParsed * 1000) / 1000)
        : 1;

    const priceCandidates = [
        ['itemPriceAmount1000', input.itemPriceAmount1000],
        ['priceAmount1000', input.priceAmount1000],
        ['unit_price_amount_1000', input.unit_price_amount_1000],
        ['item_price', input.item_price],
        ['unit_price', input.unit_price],
        ['unitPrice', input.unitPrice],
        ['price', input.price],
        ['amount', input.amount],
    ];
    const lineTotalCandidates = [
        ['lineTotalAmount1000', input.lineTotalAmount1000],
        ['totalAmount1000', input.totalAmount1000],
        ['line_total_amount_1000', input.line_total_amount_1000],
        ['lineTotal', input.lineTotal],
        ['line_total', input.line_total],
        ['total', input.total],
        ['subtotal', input.subtotal],
    ];

    let price = null;
    for (const [hint, rawValue] of priceCandidates) {
        const parsed = normalizeOrderCurrencyAmount(rawValue, { scaleHint: hint });
        if (Number.isFinite(parsed)) {
            price = parsed;
            break;
        }
    }

    let lineTotal = null;
    for (const [hint, rawValue] of lineTotalCandidates) {
        const parsed = normalizeOrderCurrencyAmount(rawValue, { scaleHint: hint });
        if (Number.isFinite(parsed)) {
            lineTotal = parsed;
            break;
        }
    }

    const hasIdentity = Boolean(rawName || rawSku);
    const hasLineData = Number.isFinite(quantityParsed) || Number.isFinite(price) || Number.isFinite(lineTotal) || Boolean(rawSku);
    if (!hasIdentity || !hasLineData) return null;

    return {
        name: rawName || (rawSku ? `SKU ${rawSku}` : `Producto ${indexHint}`),
        quantity,
        price: Number.isFinite(price) ? price : null,
        lineTotal: Number.isFinite(lineTotal) ? lineTotal : (Number.isFinite(price) ? Math.round((price * quantity) * 100) / 100 : null),
        sku: rawSku
    };
}

function dedupeOrderProducts(items = []) {
    const map = new Map();
    items.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const skuKey = normalizeOrderSkuKey(item.sku);
        const nameKey = String(item.name || '').trim().toLowerCase();
        const key = skuKey ? `sku:${skuKey}` : `name:${nameKey || idx}`;

        const quantityParsed = parseOrderNumber(item.quantity);
        const quantity = Number.isFinite(quantityParsed) ? Math.max(1, quantityParsed) : 1;
        const price = normalizeOrderCurrencyAmount(item.price, { scaleHint: 'price' });
        const lineTotal = normalizeOrderCurrencyAmount(item.lineTotal, { scaleHint: 'lineTotal' });

        if (!map.has(key)) {
            map.set(key, {
                name: String(item.name || '').trim() || (item.sku ? `SKU ${item.sku}` : `Producto ${idx + 1}`),
                quantity,
                price: Number.isFinite(price) ? price : null,
                lineTotal: Number.isFinite(lineTotal) ? lineTotal : null,
                sku: normalizeOrderSku(item.sku)
            });
            return;
        }

        const current = map.get(key);
        const nextQuantity = Math.max(1, (Number(current.quantity) || 1) + (Number(quantity) || 0));
        const nextLineTotal = Number.isFinite(current.lineTotal) && Number.isFinite(lineTotal)
            ? Math.round((current.lineTotal + lineTotal) * 100) / 100
            : (Number.isFinite(current.lineTotal) ? current.lineTotal : lineTotal);

        map.set(key, {
            ...current,
            name: current.name.startsWith('SKU ') && item.name ? String(item.name).trim() : current.name,
            quantity: nextQuantity,
            price: Number.isFinite(current.price) ? current.price : (Number.isFinite(price) ? price : null),
            lineTotal: Number.isFinite(nextLineTotal) ? nextLineTotal : null,
            sku: current.sku || normalizeOrderSku(item.sku)
        });
    });

    return Array.from(map.values()).slice(0, 40);
}

function collectProductsFromUnknownShape(input, depth = 0, found = []) {
    if (!input || depth > 6) return found;

    if (Array.isArray(input)) {
        input.forEach((entry) => collectProductsFromUnknownShape(entry, depth + 1, found));
        return found;
    }

    if (typeof input !== 'object') return found;

    const line = parseOrderLineFromObject(input, found.length + 1);
    if (line) found.push(line);

    Object.values(input).forEach((value) => collectProductsFromUnknownShape(value, depth + 1, found));
    return found;
}

function parseProductsFromBodyText(body = '') {
    const text = String(body || '').trim();
    if (!text) return [];

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed = [];

    const linePattern = /^(?:[-\u2022*]\s*)?(\d+(?:[.,]\d+)?)\s*(?:x|X)\s+(.+?)(?:\s+[-\u2013\u2014]\s*(?:S\/|PEN\s*)?(\d+(?:[.,]\d+)?))?$/;
    for (const line of lines) {
        const m = line.match(linePattern);
        if (!m) continue;
        const quantity = parseOrderNumber(m[1]) || 1;
        const unitPrice = m[3] ? normalizeOrderCurrencyAmount(m[3], { scaleHint: 'price' }) : null;
        parsed.push({
            name: m[2].trim(),
            quantity: Math.max(1, quantity),
            price: Number.isFinite(unitPrice) ? unitPrice : null,
            lineTotal: Number.isFinite(unitPrice) ? Math.round((unitPrice * quantity) * 100) / 100 : null,
            sku: null
        });
    }

    return parsed;
}

function parseProductsFromOrderTitle(orderTitle = '') {
    const text = String(orderTitle || '').trim();
    if (!text) return [];

    const segments = text
        .replace(/[\r\n]+/g, ',')
        .replace(/[|;]/g, ',')
        .split(',')
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    if (segments.length === 0) return [];

    return segments.map((segment, idx) => {
        let name = segment.replace(/^[-\u2022*]+\s*/, '').trim();
        if (!name) return null;

        let quantity = 1;
        const quantityMatch = name.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|X)\s+(.+)$/);
        if (quantityMatch) {
            const parsedQty = parseOrderNumber(quantityMatch[1]);
            quantity = Number.isFinite(parsedQty) && parsedQty > 0
                ? Math.max(1, Math.round(parsedQty * 1000) / 1000)
                : 1;
            name = String(quantityMatch[2] || '').trim();
        }

        name = name.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (!name) return null;

        return {
            name,
            quantity,
            price: null,
            lineTotal: null,
            sku: null,
            source: 'order_title',
            index: idx + 1
        };
    }).filter(Boolean);
}


function buildOrderDebugKey(orderId, data = {}, msg = {}) {
    return String(orderId || data?.orderToken || data?.token || msg?.id?._serialized || msg?.from || msg?.to || 'unknown');
}

function pickOrderDebugData(data = {}) {
    const preferredKeys = [
        'type', 'orderId', 'orderToken', 'token', 'itemCount', 'orderItemCount',
        'totalAmount1000', 'subtotalAmount1000', 'priceTotalAmount1000',
        'totalAmount', 'subtotal', 'total', 'currency', 'sellerJid',
        'title', 'orderTitle', 'body'
    ];

    const output = {};
    for (const key of preferredKeys) {
        const value = data?.[key];
        if (value === null || value === undefined || value === '') continue;
        output[key] = value;
    }

    if (Object.keys(output).length > 0) return output;

    const fallbackKeys = Object.keys(data || {}).slice(0, 35);
    fallbackKeys.forEach((key) => {
        const value = data?.[key];
        if (value === null || value === undefined) return;
        if (typeof value === 'object') {
            output[key] = Array.isArray(value) ? `[array:${value.length}]` : '[object]';
            return;
        }
        output[key] = value;
    });
    return output;
}

function safeOrderDebugJson(value, maxLen = 2200) {
    try {
        const text = JSON.stringify(value, (key, val) => {
            if (typeof val === 'string') {
                return val.length > 360 ? `${val.slice(0, 360)}...` : val;
            }
            if (Array.isArray(val)) {
                if (val.length > 25) {
                    return [...val.slice(0, 25), `[+${val.length - 25} more]`];
                }
                return val;
            }
            return val;
        });
        if (!text) return '';
        return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
    } catch (e) {
        return '[unserializable-order-payload]';
    }
}

function logOrderDebug({ msg, data, orderId, products, subtotal, subtotalFrom1000, subtotalFallback, currency, rawPreview }) {
    const key = buildOrderDebugKey(orderId, data, msg);
    const hasLines = Array.isArray(products) && products.length > 0;
    const seenKey = `${hasLines ? 'ok' : 'missing'}:${key}`;

    if (orderDebugSeen.has(seenKey)) return;
    orderDebugSeen.add(seenKey);

    const summary = {
        key,
        type: msg?.type || data?.type || null,
        orderId: orderId || null,
        productsCount: Array.isArray(products) ? products.length : 0,
        itemCount: rawPreview?.itemCount || null,
        subtotalFrom1000,
        subtotalFallback,
        subtotal,
        currency,
        hasMsgOrder: Boolean(msg?.order),
        hasMsgOrderProducts: Array.isArray(msg?.orderProducts) ? msg.orderProducts.length : Boolean(msg?.orderProducts),
        dataKeys: Object.keys(data || {}).slice(0, 60)
    };

    if (!hasLines) {
        if (ORDER_DEBUG_MISSING_ENABLED) {
            console.warn('[OrderDebug] Pedido detectado SIN lineas de producto:', summary);
        }
    } else if (ORDER_DEBUG_ENABLED) {
        console.log('[OrderDebug] Pedido parseado:', summary);
    }

    if (ORDER_DEBUG_VERBOSE || (!hasLines && ORDER_DEBUG_MISSING_ENABLED)) {
        const preview = safeOrderDebugJson({
            msgOrder: msg?.order,
            msgOrderProducts: msg?.orderProducts,
            data: pickOrderDebugData(data),
            body: msg?.body || data?.body || null
        });
        if (preview) console.log('[OrderDebug] Payload preview:', preview);
    }
}

function extractCatalogItemCategories(item = {}) {
    const raw = [];
    if (Array.isArray(item?.categories)) raw.push(...item.categories);
    else if (typeof item?.categories === 'string') raw.push(...String(item.categories).split(','));
    if (item?.category) raw.push(item.category);
    if (item?.categoryName) raw.push(item.categoryName);
    if (item?.category_slug) raw.push(item.category_slug);

    return Array.from(new Set(raw
        .map((entry) => (typeof entry === 'string' ? entry : (entry?.name || entry?.slug || entry?.title || entry?.label || '')))
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)));
}

function buildCatalogDebugLine(item = {}, index = 0) {
    const categories = extractCatalogItemCategories(item);
    const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
    const id = clean(item?.id || `item_${index + 1}`);
    const sku = clean(item?.sku || '-');
    const title = clean(item?.title || item?.name || `Producto ${index + 1}`);
    const categoryText = categories.length > 0 ? categories.join(' | ') : '(sin categoria)';
    return `[CatalogDebug][${index + 1}] id=${id} sku=${sku} title=${title} categories=${categoryText}`;
}

function logCatalogDebugSnapshot({ catalog = [], catalogMeta = {} } = {}) {
    if (!CATALOG_DEBUG_ENABLED) return;

    const safeCatalog = Array.isArray(catalog) ? catalog : [];
    const categories = Array.isArray(catalogMeta?.categories)
        ? catalogMeta.categories.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];

    const signature = JSON.stringify({
        source: String(catalogMeta?.source || 'unknown'),
        totalProducts: safeCatalog.length,
        categories,
        sample: safeCatalog.slice(0, 40).map((item) => [
            String(item?.id || ''),
            String(item?.sku || ''),
            extractCatalogItemCategories(item).join('|')
        ])
    });

    if (signature === catalogDebugLastSignature) return;
    catalogDebugLastSignature = signature;

    console.log(`[CatalogDebug] source=${String(catalogMeta?.source || 'unknown')} totalProducts=${safeCatalog.length} totalCategories=${categories.length}`);
    if (categories.length > 0) {
        console.log(`[CatalogDebug] categories=${categories.join(' | ')}`);
    }

    const maxLines = Math.min(Math.max(1, CATALOG_DEBUG_MAX_ITEMS), safeCatalog.length);
    for (let i = 0; i < maxLines; i += 1) {
        console.log(buildCatalogDebugLine(safeCatalog[i], i));
    }

    if (safeCatalog.length > maxLines) {
        console.log(`[CatalogDebug] ... +${safeCatalog.length - maxLines} productos adicionales`);
    }
}
function parseLocationNumber(value) {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}

function extractFirstUrlFromText(text = '') {
    const match = String(text || '').match(/https?:\/\/[^\s]+/i);
    return match ? String(match[0]).replace(/[),.;!?]+$/g, '') : null;
}

function extractMapUrlFromText(text = '') {
    const matches = String(text || '').match(/https?:\/\/[^\s]+/gi) || [];
    for (const raw of matches) {
        const candidate = String(raw || '').replace(/[),.;!?]+$/g, '');
        if (isLikelyMapUrl(candidate)) return candidate;
    }
    return null;
}

function isLikelyMapUrl(value = '') {
    const candidate = String(value || '').trim().replace(/[),.;!?]+$/g, '');
    if (!candidate) return false;
    try {
        const parsed = new URL(candidate);
        const host = String(parsed.hostname || '').toLowerCase();
        const path = String(parsed.pathname || '').toLowerCase();
        if (host.includes('maps.app.goo.gl')) return true;
        if (host === 'goo.gl' && path.startsWith('/maps')) return true;
        if (host.startsWith('maps.google.')) return true;
        if (host === 'maps.google.com') return true;
        if (host.includes('google.') && path.startsWith('/maps')) return true;
        return false;
    } catch (e) {
        return /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|google\.[^\s/]+\/maps/i.test(candidate);
    }
}

function extractCoordsFromText(text = '') {
    const raw = String(text || '');
    if (!raw) return null;
    let value = raw;
    try {
        value = decodeURIComponent(raw);
    } catch (e) { }

    const patterns = [
        /geo:\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (!match) continue;
        const lat = parseLocationNumber(match[1]);
        const lng = parseLocationNumber(match[2]);
        if (isValidLatitude(lat) && isValidLongitude(lng)) {
            return { latitude: lat, longitude: lng };
        }
    }

    return null;
}

function extractLocationInfo(msg) {
    try {
        const data = msg?._data || {};
        const type = String(msg?.type || data?.type || '').toLowerCase();
        const body = String(msg?.body || data?.body || '').trim();
        const rawLocation = msg?.location || data?.location || data?.loc || {};
        const locationObj = rawLocation && typeof rawLocation === 'object' ? rawLocation : {};

        const directLat = parseLocationNumber(
            locationObj?.latitude
            ?? locationObj?.lat
            ?? data?.latitude
            ?? data?.lat
            ?? data?.latDegrees
        );
        const directLng = parseLocationNumber(
            locationObj?.longitude
            ?? locationObj?.lng
            ?? locationObj?.lon
            ?? data?.longitude
            ?? data?.lng
            ?? data?.lon
            ?? data?.lngDegrees
        );

        let latitude = isValidLatitude(directLat) ? directLat : null;
        let longitude = isValidLongitude(directLng) ? directLng : null;

        const urlFromData = String(
            locationObj?.url
            || data?.clientUrl
            || data?.url
            || ''
        ).trim();
        const urlFromBody = extractMapUrlFromText(body);
        const candidateUrl = isLikelyMapUrl(urlFromData)
            ? urlFromData.replace(/[),.;!?]+$/g, '')
            : (isLikelyMapUrl(urlFromBody || '') ? String(urlFromBody || '').replace(/[),.;!?]+$/g, '') : '');

        if ((latitude === null || longitude === null) && candidateUrl) {
            const fromUrl = extractCoordsFromText(candidateUrl);
            if (fromUrl) {
                latitude = fromUrl.latitude;
                longitude = fromUrl.longitude;
            }
        }

        let bodyCoords = null;
        if ((latitude === null || longitude === null) && body) {
            const fromBody = extractCoordsFromText(body);
            if (fromBody) {
                bodyCoords = fromBody;
                latitude = fromBody.latitude;
                longitude = fromBody.longitude;
            }
        }

        const label = truncateDisplayValue(
            String(
                locationObj?.description
                || locationObj?.name
                || data?.address
                || data?.name
                || ''
            ).trim(),
            180
        ) || null;

        const mapUrl = candidateUrl
            || ((latitude !== null && longitude !== null)
                ? `https://www.google.com/maps?q=${latitude},${longitude}`
                : null);

        if (type !== 'location' && !label && !mapUrl && (latitude === null || longitude === null)) {
            return null;
        }

        return {
            latitude: latitude,
            longitude: longitude,
            label: label,
            mapUrl: mapUrl,
            text: label || ((latitude !== null && longitude !== null) ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'Ubicacion compartida'),
            source: type === 'location' ? 'native' : ((candidateUrl || bodyCoords) ? 'link' : 'native')
        };
    } catch (e) {
        return null;
    }
}
function getMessageTypePreviewLabel(type = '') {
    const value = String(type || '').toLowerCase();
    if (!value) return 'Mensaje';
    if (value === 'image') return 'Imagen';
    if (value === 'video') return 'Video';
    if (value === 'audio') return 'Audio';
    if (value === 'ptt') return 'Nota de voz';
    if (value === 'document') return 'Documento';
    if (value === 'sticker') return 'Sticker';
    if (value === 'location') return 'Ubicacion';
    if (value === 'vcard') return 'Contacto';
    if (value === 'revoked') return 'Mensaje eliminado';
    if (value === 'order') return 'Pedido';
    if (value === 'product') return 'Producto';
    return 'Mensaje';
}


function guessFileExtensionFromMime(mimetype = '') {
    const type = String(mimetype || '').toLowerCase();
    if (!type) return '';
    if (type.includes('pdf')) return 'pdf';
    if (type.includes('wordprocessingml')) return 'docx';
    if (type.includes('msword')) return 'doc';
    if (type.includes('spreadsheetml')) return 'xlsx';
    if (type.includes('ms-excel') || type.includes('excel')) return 'xls';
    if (type.includes('presentationml')) return 'pptx';
    if (type.includes('ms-powerpoint') || type.includes('powerpoint')) return 'ppt';
    if (type.includes('text/plain')) return 'txt';
    if (type.includes('csv')) return 'csv';
    if (type.includes('json')) return 'json';
    if (type.includes('xml')) return 'xml';
    if (type.includes('zip')) return 'zip';
    if (type.includes('rar')) return 'rar';
    if (type.includes('7z')) return '7z';
    if (type.includes('jpeg')) return 'jpg';
    if (type.includes('png')) return 'png';
    if (type.includes('webp')) return 'webp';
    if (type.includes('gif')) return 'gif';
    if (type.includes('mp4')) return 'mp4';
    if (type.includes('audio/mpeg')) return 'mp3';
    if (type.includes('audio/ogg')) return 'ogg';
    return '';
}

function sanitizeFilenameCandidate(value = '') {
    let text = String(value || '').trim();
    if (!text) return null;

    if (/^https?:\/\//i.test(text)) {
        try {
            const parsed = new URL(text);
            const fromPath = String(parsed.pathname || '').split('/').filter(Boolean).pop() || '';
            text = fromPath || text;
        } catch (e) { }
    }

    text = text
        .replace(/^['\"]+|['\"]+$/g, '')
        .replace(/\\/g, '/');
    if (text.includes('/')) text = text.split('/').pop() || text;
    text = text.split('?')[0].split('#')[0];

    try {
        text = decodeURIComponent(text);
    } catch (e) { }

    text = text
        .replace(/[\u0000-\u001F]/g, '')
        .replace(/[<>:\"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+|\.+$/g, '')
        .trim();

    if (!text) return null;
    if (/^(null|undefined|\[object object\]|unknown)$/i.test(text)) return null;
    return text;
}

function getFilenameExtension(filename = '') {
    const name = String(filename || '').trim();
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx <= 0 || dotIdx >= name.length - 1) return '';
    const ext = name.slice(dotIdx + 1).toLowerCase();
    if (!/^[a-z0-9]{1,8}$/.test(ext)) return '';
    return ext;
}

function isGenericFilename(filename = '') {
    const base = String(filename || '')
        .trim()
        .toLowerCase()
        .replace(/\.[a-z0-9]{1,8}$/i, '');
    if (!base) return true;
    return ['archivo', 'file', 'adjunto', 'attachment', 'document', 'documento', 'media', 'unknown', 'download', 'descarga'].includes(base);
}

function isMachineLikeFilename(filename = '') {
    const base = String(filename || '')
        .trim()
        .replace(/\.[a-z0-9]{1,8}$/i, '')
        .replace(/\s+/g, '');
    if (!base) return true;

    if (/^\d{8,}$/.test(base)) return true;
    if (/^[a-f0-9]{16,}$/i.test(base)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) return true;
    if (/^3EB0[A-F0-9]{8,}$/i.test(base)) return true;

    return false;
}

function looksLikeBodyFilename(value = '') {
    const text = String(value || '').trim();
    if (!text || text.length > 180) return false;
    if (/[\r\n]/.test(text)) return false;
    if (/^[A-Za-z0-9+/=]{160,}$/.test(text)) return false;
    if (/^https?:\/\//i.test(text)) return true;
    return /\.[A-Za-z0-9]{1,8}$/.test(text);
}

function extractMessageFileMeta(msg = {}, downloadedMedia = null) {
    const raw = msg?._data || {};
    const nestedDocumentName =
        raw?.message?.documentMessage?.fileName
        || raw?.message?.documentWithCaptionMessage?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessage?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessageV2?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessageV2Extension?.message?.documentMessage?.fileName
        || null;

    const bodyCandidateRaw = String(msg?.body || raw?.body || '').trim();
    const bodyCandidate = looksLikeBodyFilename(bodyCandidateRaw) ? bodyCandidateRaw : null;

    const candidateNames = [
        msg?.filename,
        raw?.filename,
        raw?.fileName,
        raw?.file_name,
        raw?.mediaData?.filename,
        raw?.mediaData?.fileName,
        raw?.mediaData?.file_name,
        nestedDocumentName,
        downloadedMedia?.filename,
        downloadedMedia?.fileName,
        raw?.title,
        bodyCandidate
    ];

    let filename = null;
    let fallbackFilename = null;
    for (const candidate of candidateNames) {
        const safeName = sanitizeFilenameCandidate(candidate);
        if (!safeName) continue;
        if (!fallbackFilename) fallbackFilename = safeName;
        const ext = getFilenameExtension(safeName);
        if (!isGenericFilename(safeName) && !isMachineLikeFilename(safeName) && ext) {
            filename = safeName;
            break;
        }
        if (!filename && !isGenericFilename(safeName) && !isMachineLikeFilename(safeName)) {
            filename = safeName;
        }
    }
    if (!filename) filename = fallbackFilename;

    const mimetype = String(
        msg?.mimetype
        || raw?.mimetype
        || raw?.mediaData?.mimetype
        || downloadedMedia?.mimetype
        || ''
    ).trim();
    const mimeExt = guessFileExtensionFromMime(mimetype);
    const hasAttachment = Boolean(msg?.hasMedia || raw?.hasMedia || mimetype || downloadedMedia);

    if (filename && !getFilenameExtension(filename) && mimeExt) {
        filename = `${filename}.${mimeExt}`;
    }
    if (filename && (isGenericFilename(filename) || isMachineLikeFilename(filename)) && mimeExt) {
        filename = `documento.${mimeExt}`;
    }
    if (!filename && hasAttachment && mimeExt) {
        filename = `documento.${mimeExt}`;
    }
    if (!filename && hasAttachment && String(msg?.type || '').toLowerCase() === 'document') {
        filename = 'documento';
    }

    const sizeCandidates = [
        raw?.size,
        raw?.fileSize,
        raw?.fileLength,
        raw?.mediaData?.size,
        downloadedMedia?.filesize,
        downloadedMedia?.fileSize,
        downloadedMedia?.size
    ];

    let fileSizeBytes = null;
    for (const candidate of sizeCandidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed) && parsed > 0) {
            fileSizeBytes = Math.round(parsed);
            break;
        }
    }
    if (!fileSizeBytes && downloadedMedia?.data) {
        const base64Length = String(downloadedMedia.data || '').length;
        if (base64Length > 0) {
            fileSizeBytes = Math.round((base64Length * 3) / 4);
        }
    }

    return {
        filename,
        fileSizeBytes
    };
}

function normalizeQuotedPayload(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;

    const rawId = raw?.id?._serialized || raw?.id || raw?.quotedStanzaID || raw?.quotedMsgId || raw?.quotedMsgKey || null;
    const id = rawId ? String(rawId).trim() : null;
    const body = truncateDisplayValue(String(raw?.body || raw?.caption || raw?.text || '').trim(), 180);
    const type = String(raw?.type || '').trim() || null;
    const fromMe = Boolean(raw?.fromMe || raw?.id?.fromMe || raw?.isFromMe);
    const timestamp = Number(raw?.timestamp || raw?.t || 0) || null;
    const hasMedia = Boolean(raw?.hasMedia || raw?.mimetype || raw?.mediaData || raw?.isMedia);

    if (!id && !body && !type && !hasMedia) return null;

    const preview = body || getMessageTypePreviewLabel(type);
    return {
        id: id || null,
        body: preview,
        type: type || 'chat',
        fromMe,
        timestamp,
        hasMedia
    };
}

async function extractQuotedMessageInfo(msg) {
    try {
        if (!msg) return null;
        const data = msg?._data || {};
        const quick = normalizeQuotedPayload({
            id: data?.quotedStanzaID,
            body: data?.quotedMsg?.body || data?.quotedMsg?.caption,
            type: data?.quotedMsg?.type,
            fromMe: data?.quotedMsg?.id?.fromMe || data?.quotedMsg?.fromMe,
            timestamp: data?.quotedMsg?.t,
            hasMedia: data?.quotedMsg?.isMedia || data?.quotedMsg?.mediaData || data?.quotedMsg?.mimetype
        });

        if (quick && quick.body && quick.id) return quick;

        if (msg?.hasQuotedMsg && typeof msg.getQuotedMessage === 'function') {
            try {
                const quoted = await msg.getQuotedMessage();
                const parsedQuoted = normalizeQuotedPayload({
                    id: quoted?.id?._serialized,
                    body: quoted?.body,
                    caption: quoted?._data?.caption,
                    type: quoted?.type,
                    fromMe: quoted?.fromMe,
                    timestamp: quoted?.timestamp,
                    hasMedia: quoted?.hasMedia
                });

                if (parsedQuoted) {
                    if (quick?.id && !parsedQuoted.id) parsedQuoted.id = quick.id;
                    return parsedQuoted;
                }
            } catch (e) {
            }
        }

        return quick;
    } catch (e) {
        return null;
    }
}

function extractOrderInfo(msg) {
    try {
        const data = msg?._data || {};
        const orderTitle = data?.orderTitle || data?.title || msg?.orderTitle || msg?.title || msg?.order?.order_title || msg?.order?.catalog_name || msg?.order?.text || '';
        let products = collectProductsFromUnknownShape({
            msgOrder: msg?.order,
            msgOrderProducts: msg?.orderProducts,
            native: msg,
            raw: data
        });

        if (!products.length) {
            products = parseProductsFromBodyText(msg?.body || data?.body || '');
        }
        if (!products.length) {
            products = parseProductsFromOrderTitle(orderTitle);
        }
        products = dedupeOrderProducts(products);

        const orderId = msg?.orderId || msg?.order?.id || msg?.order?.order_id || data?.orderId || data?.orderToken || data?.token || null;
        const subtotalFrom1000 = normalizeOrderCurrencyAmount(
            msg?.totalAmount1000
            ?? msg?.order?.total_amount_1000
            ?? msg?.order?.subtotal_amount_1000
            ?? msg?.order?.total_amount
            ?? data?.totalAmount1000
            ?? data?.total_amount_1000
            ?? data?.subtotalAmount1000
            ?? data?.subtotal_amount_1000
            ?? data?.priceTotalAmount1000,
            { scaleHint: '1000' }
        );
        const subtotalFallback = normalizeOrderCurrencyAmount(
            msg?.subtotal
            ?? msg?.order?.subtotal
            ?? msg?.order?.total
            ?? msg?.total
            ?? data?.subtotal
            ?? data?.total
            ?? data?.totalAmount,
            { scaleHint: 'subtotal' }
        );
        const subtotal = Number.isFinite(subtotalFrom1000) ? subtotalFrom1000 : subtotalFallback;
        const currency = msg?.currency || msg?.order?.currency || msg?.order?.currency_code || data?.totalCurrencyCode || data?.currency || 'PEN';

        const maybeOrderType = String(msg?.type || '').toLowerCase().includes('order')
            || String(data?.type || '').toLowerCase().includes('order')
            || String(msg?.type || '').toLowerCase().includes('product')
            || String(data?.type || '').toLowerCase().includes('product')
            || products.length > 0
            || Boolean(orderId)
            || Boolean(msg?.order);

        if (!maybeOrderType) return null;

        const rawPreview = {
            type: msg?.type || data?.type || null,
            body: msg?.body || data?.body || null,
            title: orderTitle || null,
            itemCount: data?.itemCount || data?.orderItemCount || msg?.itemCount || msg?.order?.item_count || products.length || null,
            sellerJid: data?.sellerJid || msg?.order?.seller_jid || null,
            token: data?.orderToken || data?.token || msg?.order?.token || null
        };

        logOrderDebug({
            msg,
            data,
            orderId,
            products,
            subtotal: Number.isFinite(subtotal) ? subtotal : null,
            subtotalFrom1000,
            subtotalFallback,
            currency,
            rawPreview
        });

        return {
            orderId,
            currency,
            subtotal: Number.isFinite(subtotal) ? subtotal : null,
            products,
            rawPreview
        };
    } catch (error) {
        return null;
    }
}

const CATALOG_IMAGE_EXT_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

function slugifyFileName(value = 'producto') {
    const clean = String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return clean || 'producto';
}

function buildCatalogProductCaption(product = {}) {
    const title = String(product?.title || product?.name || 'Producto').trim() || 'Producto';

    const parsePrice = (value, fallback = 0) => {
        const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
        return Number.isFinite(fallback) ? fallback : 0;
    };

    const finalPrice = parsePrice(product?.price, 0);
    const regularPrice = parsePrice(product?.regularPrice ?? product?.regular_price, finalPrice);

    const lines = [`*${title}*`];

    if (regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice) {
        const discountAmount = Math.max(regularPrice - finalPrice, 0);
        lines.push(`Precio regular: S/ ${regularPrice.toFixed(2)}`);
        lines.push(`*Descuento: S/ ${discountAmount.toFixed(2)}*`);
        lines.push(`*PRECIO FINAL: S/ ${finalPrice.toFixed(2)}*`);
    } else if (finalPrice > 0) {
        lines.push(`*PRECIO FINAL: S/ ${finalPrice.toFixed(2)}*`);
    } else {
        lines.push('*PRECIO FINAL: CONSULTAR*');
    }

    const description = String(product?.description || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (description) {
        lines.push('');
        lines.push(`Detalle: ${description.length > 280 ? `${description.slice(0, 277)}...` : description}`);
    }

    return lines.join('\n');
}

async function fetchCatalogProductImage(imageUrl, { maxBytes = 4 * 1024 * 1024, timeoutMs = 7000 } = {}) {
    const rawUrl = String(imageUrl || '').trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return null;

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (e) {
        return null;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) return null;

    try {
        await resolveAndValidatePublicHost(parsed.hostname);
    } catch (e) {
        return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
        response = await fetch(parsed.toString(), {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Catalog Fetcher)' },
            signal: controller.signal
        });
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timeout);
    }

    if (!response?.ok) return null;

    const contentTypeRaw = String(response.headers.get('content-type') || '').toLowerCase();
    const contentType = contentTypeRaw.split(';')[0] || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > maxBytes) return null;

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (!imageBuffer.length || imageBuffer.length > maxBytes) return null;

    return {
        mediaData: imageBuffer.toString('base64'),
        mimetype: contentType,
        extension: CATALOG_IMAGE_EXT_BY_MIME[contentType] || 'jpg'
    };
}

function resolveChatDisplayName(chat) {
    if (!chat) return 'Sin nombre';

    const contact = chat.contact || null;
    const chatId = String(chat?.id?._serialized || '');
    const candidates = [
        String(chat.name || '').trim(),
        String(chat.formattedTitle || '').trim(),
        String(contact?.name || '').trim(),
        String(contact?.pushname || '').trim(),
        String(contact?.shortName || '').trim(),
    ].filter(Boolean);

    const bestHuman = candidates.find((name) => !name.includes('@') && !/^\d{14,}$/.test(name));
    if (bestHuman) return bestHuman;

    const fallbackPhone = coerceHumanPhone(
        contact?.number
        || contact?.phoneNumber
        || (!isLidIdentifier(chatId) ? (contact?.id?.user || chat?.id?.user || String(chatId).split('@')[0] || '') : '')
    );
    if (fallbackPhone) return `+${fallbackPhone}`;

    return 'Sin nombre';
}

function buildProfilePicCandidates(rawId, extraCandidates = []) {
    const out = [];
    const push = (value) => {
        const text = String(value || '').trim();
        if (!text) return;
        if (!out.includes(text)) out.push(text);
        if (!text.includes('@')) {
            const digits = text.replace(/\D/g, '');
            if (digits && !out.includes(`${digits}@c.us`)) out.push(`${digits}@c.us`);
        } else {
            const localPart = text.split('@')[0] || '';
            const digits = localPart.replace(/\D/g, '');
            if (digits && !out.includes(`${digits}@c.us`)) out.push(`${digits}@c.us`);
        }
    };

    push(rawId);
    (Array.isArray(extraCandidates) ? extraCandidates : []).forEach(push);
    return out;
}

async function resolveProfilePic(client, chatOrContactId, extraCandidates = []) {
    const candidates = buildProfilePicCandidates(chatOrContactId, extraCandidates);

    for (const candidate of candidates) {
        try {
            const direct = await client.getProfilePicUrl(candidate);
            if (direct) return direct;
        } catch (e) { }
    }

    for (const candidate of candidates) {
        try {
            const contact = await client.getContactById(candidate);
            if (contact?.getProfilePicUrl) {
                const fromContact = await contact.getProfilePicUrl();
                if (fromContact) return fromContact;
            }
        } catch (e) { }
    }

    for (const candidate of candidates) {
        try {
            const chat = await client.getChatById(candidate);
            if (chat?.contact?.getProfilePicUrl) {
                const fromChatContact = await chat.contact.getProfilePicUrl();
                if (fromChatContact) return fromChatContact;
            }
        } catch (e) { }
    }

    return null;
}

function truncateDisplayValue(value = '', maxLen = 260) {
    const text = String(value ?? '');
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

function snapshotSerializable(input, depth = 0, seen = new WeakSet()) {
    if (depth > 3) return undefined;
    if (input === null || input === undefined) return input;

    const t = typeof input;
    if (t === 'string') return truncateDisplayValue(input);
    if (t === 'number' || t === 'boolean') return input;
    if (t === 'bigint') return String(input);
    if (t === 'function' || t === 'symbol') return undefined;

    if (Array.isArray(input)) {
        return input
            .slice(0, 30)
            .map((entry) => snapshotSerializable(entry, depth + 1, seen))
            .filter((entry) => entry !== undefined);
    }

    if (input instanceof Date) return input.toISOString();
    if (Buffer.isBuffer(input)) return `[buffer:${input.length}]`;

    if (t === 'object') {
        if (seen.has(input)) return '[circular]';
        seen.add(input);
        const out = {};
        const keys = Object.keys(input).slice(0, 80);
        for (const key of keys) {
            const value = snapshotSerializable(input[key], depth + 1, seen);
            if (value !== undefined && value !== '') out[key] = value;
        }
        return out;
    }

    return undefined;
}

function normalizeBusinessDetailsSnapshot(businessProfile = null) {
    if (!businessProfile) return null;
    const websites = Array.isArray(businessProfile?.website)
        ? businessProfile.website.filter(Boolean)
        : (businessProfile?.website ? [businessProfile.website] : []);

    return {
        category: businessProfile?.category || null,
        description: businessProfile?.description || null,
        email: businessProfile?.email || null,
        website: websites[0] || null,
        websites,
        address: businessProfile?.address || null,
        businessHours: businessProfile?.business_hours || businessProfile?.businessHours || null,
        raw: snapshotSerializable(businessProfile)
    };
}

function extractContactSnapshot(contact = null) {
    if (!contact) return null;
    const raw = contact?._data || {};
    return {
        id: contact?.id?._serialized || null,
        user: contact?.id?.user || null,
        server: contact?.id?.server || null,
        number: contact?.number || raw?.userid || null,
        name: contact?.name || null,
        pushname: contact?.pushname || null,
        shortName: contact?.shortName || null,
        verifiedName: raw?.verifiedName || null,
        verifiedLevel: raw?.verifiedLevel || null,
        statusMute: raw?.statusMute || null,
        type: raw?.type || null,
        isBusiness: Boolean(contact?.isBusiness),
        isEnterprise: Boolean(contact?.isEnterprise),
        isMyContact: Boolean(contact?.isMyContact),
        isMe: Boolean(contact?.isMe),
        isUser: Boolean(contact?.isUser),
        isGroup: Boolean(contact?.isGroup),
        isWAContact: Boolean(contact?.isWAContact),
        isBlocked: Boolean(contact?.isBlocked),
        isPSA: Boolean(contact?.isPSA),
        rawData: snapshotSerializable(raw)
    };
}

function extractChatSnapshot(chat = null) {
    if (!chat) return null;
    return {
        id: chat?.id?._serialized || null,
        archived: Boolean(chat?.archived),
        pinned: Boolean(chat?.pinned),
        isMuted: Boolean(chat?.isMuted),
        muteExpiration: Number(chat?.muteExpiration || 0) || null,
        unreadCount: Number(chat?.unreadCount || 0) || 0,
        timestamp: Number(chat?.timestamp || 0) || null,
        isGroup: Boolean(chat?.isGroup),
        participantsCount: Boolean(chat?.isGroup) ? (extractGroupParticipants(chat).length || 0) : null,
        rawData: snapshotSerializable(chat?._data || null)
    };
}




function toParticipantArray(rawParticipants) {
    if (!rawParticipants) return [];
    if (Array.isArray(rawParticipants)) return rawParticipants;
    if (Array.isArray(rawParticipants?._models)) return rawParticipants._models;
    if (Array.isArray(rawParticipants?.models)) return rawParticipants.models;
    if (typeof rawParticipants?.serialize === 'function') {
        try {
            const serialized = rawParticipants.serialize();
            if (Array.isArray(serialized)) return serialized;
        } catch (e) { }
    }
    if (rawParticipants?._map && typeof rawParticipants._map.forEach === 'function') {
        const models = [];
        rawParticipants._map.forEach((value) => models.push(value));
        return models;
    }
    return [];
}

function normalizeGroupParticipant(participant = {}) {
    const idFromObject = participant?.id && typeof participant.id === 'object'
        ? (participant.id?._serialized || ((participant.id.user && participant.id.server) ? `${participant.id.user}@${participant.id.server}` : null))
        : null;
    const rawId = idFromObject
        || participant?.id
        || participant?.wid?._serialized
        || participant?.wid
        || participant?._serialized
        || participant?.participant
        || null;
    const id = String(rawId || '').trim();
    if (!id) return null;

    const isSuperAdmin = Boolean(participant?.isSuperAdmin || participant?.superadmin);
    const isAdmin = isSuperAdmin || Boolean(participant?.isAdmin || participant?.admin);
    const phone = coerceHumanPhone(
        participant?.number
        || participant?.phone
        || participant?.id?.user
        || String(id).split('@')[0]
        || ''
    );

    const name = String(
        participant?.formattedShortName
        || participant?.shortName
        || participant?.name
        || participant?.pushname
        || participant?.notify
        || ''
    ).trim();

    return {
        id,
        phone: phone || null,
        name: name || null,
        isAdmin,
        isSuperAdmin,
        isMe: Boolean(participant?.isMe),
        role: isSuperAdmin ? 'superadmin' : (isAdmin ? 'admin' : 'member')
    };
}

function isInternalLikeName(value = '') {
    const text = String(value || '').trim();
    if (!text) return true;
    return text.includes('@') || /^\d{14,}$/.test(text);
}

function getGroupParticipantContactCache(key = '') {
    const safeKey = String(key || '').trim();
    if (!safeKey) return null;
    const hit = groupParticipantContactCache.get(safeKey);
    if (!hit) return null;
    if (Date.now() - Number(hit.updatedAt || 0) > GROUP_PARTICIPANT_CONTACT_TTL_MS) {
        groupParticipantContactCache.delete(safeKey);
        return null;
    }
    return hit.value || null;
}

function setGroupParticipantContactCache(keys = [], value = null) {
    const payload = value && typeof value === 'object' ? value : null;
    if (!payload) return;
    const now = Date.now();
    keys.forEach((key) => {
        const safeKey = String(key || '').trim();
        if (!safeKey) return;
        groupParticipantContactCache.set(safeKey, { value: payload, updatedAt: now });
    });
}

async function resolveGroupParticipantContact(client, participant = {}) {
    const participantId = String(participant?.id || '').trim();
    const phone = coerceHumanPhone(participant?.phone || participantId.split('@')[0] || '');

    const cacheKeys = [
        participantId,
        phone ? `phone:${phone}` : ''
    ].filter(Boolean);

    for (const key of cacheKeys) {
        const cached = getGroupParticipantContactCache(key);
        if (cached) return cached;
    }

    if (!client?.getContactById) return null;

    const candidateIds = [
        participantId,
        phone ? `${phone}@c.us` : '',
        phone ? `${phone}@s.whatsapp.net` : '',
        phone ? `${phone}@lid` : ''
    ].filter(Boolean);

    const tried = new Set();
    for (const candidateId of candidateIds) {
        if (tried.has(candidateId)) continue;
        tried.add(candidateId);

        try {
            const contact = await client.getContactById(candidateId);
            const raw = contact?._data || {};
            const resolved = {
                name: String(contact?.name || contact?.pushname || contact?.shortName || raw?.verifiedName || '').trim() || null,
                pushname: String(contact?.pushname || raw?.notifyName || '').trim() || null,
                shortName: String(contact?.shortName || '').trim() || null,
                phone: coerceHumanPhone(contact?.number || raw?.userid || phone || '') || phone || null
            };

            setGroupParticipantContactCache([...cacheKeys, candidateId], resolved);
            return resolved;
        } catch (e) { }
    }

    return null;
}

async function hydrateGroupParticipantsWithContacts(client, participants = []) {
    if (!Array.isArray(participants) || participants.length === 0) return [];

    const hydrated = [];
    const maxItems = Math.min(participants.length, 256);
    for (let idx = 0; idx < maxItems; idx += 1) {
        const current = participants[idx];
        if (!current || typeof current !== 'object') continue;

        const next = { ...current };
        const hasUsefulName = Boolean(next.name && !isInternalLikeName(next.name));

        if (!hasUsefulName || !next.phone) {
            const resolved = await resolveGroupParticipantContact(client, next);
            if (resolved) {
                const resolvedName = String(resolved.name || resolved.pushname || resolved.shortName || '').trim();
                if (!hasUsefulName && resolvedName && !isInternalLikeName(resolvedName)) {
                    next.name = resolvedName;
                }
                next.pushname = resolved.pushname || next.pushname || null;
                next.shortName = resolved.shortName || next.shortName || null;
                if (!next.phone && resolved.phone) next.phone = resolved.phone;
            }
        }

        hydrated.push(next);
    }

    return hydrated;
}

function extractGroupParticipants(chat = null) {
    const participants = [];
    const seen = new Set();
    const sources = [
        chat?.participants,
        chat?.groupMetadata?.participants,
        chat?._data?.groupMetadata?.participants,
        chat?._data?.participants
    ];

    sources.forEach((source) => {
        const models = toParticipantArray(source);
        models.forEach((model) => {
            const normalized = normalizeGroupParticipant(model);
            if (!normalized || seen.has(normalized.id)) return;
            seen.add(normalized.id);
            participants.push(normalized);
        });
    });

    return participants;
}

async function fetchGroupParticipantsFromStore(client, groupId = '') {
    if (!client?.pupPage?.evaluate || !groupId) return [];
    try {
        const raw = await client.pupPage.evaluate(async (targetGroupId) => {
            try {
                const widFactory = window.Store?.WidFactory;
                const chatStore = window.Store?.Chat;
                if (!widFactory || !chatStore) return [];

                const groupWid = widFactory.createWid(targetGroupId);
                const chat = chatStore.get(groupWid) || await chatStore.find(groupWid);
                if (!chat) return [];

                try {
                    const groupMetadataStore = window.Store?.GroupMetadata || window.Store?.WAWebGroupMetadataCollection;
                    if (groupMetadataStore?.update) {
                        await groupMetadataStore.update(groupWid);
                    }
                } catch (e) { }

                const participantsCollection = chat?.groupMetadata?.participants || [];
                const models = Array.isArray(participantsCollection)
                    ? participantsCollection
                    : (participantsCollection?._models || participantsCollection?.models || []);

                return models.map((participant) => ({
                    id: participant?.id?._serialized || participant?.id || null,
                    phone: participant?.id?.user || null,
                    name: participant?.formattedShortName || participant?.name || participant?.notify || participant?.pushname || null,
                    isAdmin: Boolean(participant?.isAdmin || participant?.isSuperAdmin || participant?.admin || participant?.superadmin),
                    isSuperAdmin: Boolean(participant?.isSuperAdmin || participant?.superadmin),
                    isMe: Boolean(participant?.isMe)
                })).filter((entry) => Boolean(entry?.id));
            } catch (e) {
                return [];
            }
        }, groupId);

        if (!Array.isArray(raw)) return [];
        return raw.map((participant) => normalizeGroupParticipant(participant)).filter(Boolean);
    } catch (e) {
        return [];
    }
}
function getSenderMetaCache(key = '') {
    const safeKey = String(key || '').trim();
    if (!safeKey) return null;
    const hit = senderMetaCache.get(safeKey);
    if (!hit) return null;
    if (Date.now() - Number(hit.updatedAt || 0) > SENDER_META_TTL_MS) {
        senderMetaCache.delete(safeKey);
        return null;
    }
    return hit.value || null;
}

function setSenderMetaCache(keys = [], value = null) {
    const payload = value && typeof value === 'object' ? value : null;
    if (!payload) return;
    const now = Date.now();
    keys.forEach((key) => {
        const safeKey = String(key || '').trim();
        if (!safeKey) return;
        senderMetaCache.set(safeKey, { value: payload, updatedAt: now });
    });
}

async function resolveMessageSenderMeta(msg) {
    try {
        const base = {
            notifyName: null,
            senderPhone: null,
            senderId: null,
            senderPushname: null,
            isGroupMessage: false
        };
        if (!msg || msg.fromMe) return base;

        const fromId = String(msg?.from || '').trim();
        const authorId = String(msg?.author || msg?._data?.author || '').trim();
        const isGroupMessage = fromId.endsWith('@g.us');
        const senderId = String((isGroupMessage ? authorId : fromId) || '').trim() || null;
        const senderPhone = coerceHumanPhone(
            (senderId || '').split('@')[0]
            || authorId.split('@')[0]
            || fromId.split('@')[0]
            || msg?._data?.sender?.id?.user
            || ''
        );

        const cacheKeys = [
            senderId,
            senderPhone ? `phone:${senderPhone}` : '',
            fromId,
            authorId
        ].filter(Boolean);
        for (const key of cacheKeys) {
            const cached = getSenderMetaCache(key);
            if (cached) return { ...cached, isGroupMessage };
        }

        let notifyName = String(msg?._data?.notifyName || msg?._data?.senderObj?.pushname || '').trim() || null;
        let senderPushname = String(msg?._data?.senderObj?.pushname || '').trim() || null;

        const candidateIds = [
            senderId,
            authorId,
            senderPhone ? `${senderPhone}@c.us` : '',
            senderPhone ? `${senderPhone}@s.whatsapp.net` : '',
            senderPhone ? `${senderPhone}@lid` : ''
        ].filter(Boolean);

        const tried = new Set();
        for (const candidateId of candidateIds) {
            if (tried.has(candidateId)) continue;
            tried.add(candidateId);
            try {
                const contact = await waClient.client.getContactById(candidateId);
                const raw = contact?._data || {};
                notifyName = String(contact?.name || contact?.pushname || contact?.shortName || raw?.verifiedName || notifyName || '').trim() || notifyName;
                senderPushname = String(contact?.pushname || raw?.notifyName || senderPushname || '').trim() || senderPushname;
                if (notifyName || senderPushname) break;
            } catch (e) { }
        }

        if (!notifyName) {
            try {
                const fallbackContact = await msg.getContact();
                notifyName = String(fallbackContact?.name || fallbackContact?.pushname || fallbackContact?.shortName || '').trim() || null;
                senderPushname = String(fallbackContact?.pushname || senderPushname || '').trim() || senderPushname;
            } catch (e) { }
        }

        const resolved = {
            notifyName: notifyName || senderPushname || null,
            senderPhone: senderPhone || null,
            senderId,
            senderPushname: senderPushname || null,
            isGroupMessage
        };
        setSenderMetaCache(cacheKeys, resolved);
        return resolved;
    } catch (e) {
        return {
            notifyName: null,
            senderPhone: null,
            senderId: null,
            senderPushname: null,
            isGroupMessage: false
        };
    }
}

function isStatusOrSystemMessage(msg) {
    const from = String(msg?.from || '');
    const to = String(msg?.to || '');
    const type = String(msg?.type || '').toLowerCase();

    if (from.includes('status@broadcast') || to.includes('status@broadcast')) return true;
    if (from.endsWith('@broadcast') || to.endsWith('@broadcast')) return true;

    const blockedTypes = new Set([
        'e2e_notification',
        'notification',
        'ciphertext',
        'revoked'
    ]);

    return blockedTypes.has(type);
}

function isVisibleChatId(chatId) {
    const id = String(chatId || '');
    if (!id) return false;
    if (id.includes('status@broadcast')) return false;
    if (id.endsWith('@broadcast')) return false;
    return true;
}

function normalizePhoneDigits(raw = '') {
    return String(raw || '').replace(/\D/g, '');
}

function formatPhoneForDisplay(raw = '') {
    const digits = normalizePhoneDigits(raw);
    if (digits.length < 8 || digits.length > 15) return null;
    return digits;
}

function isLikelyHumanPhoneDigits(raw = '') {
    const digits = normalizePhoneDigits(raw);
    if (digits.length < 8 || digits.length > 12) return false;
    if (/^0+$/.test(digits)) return false;
    return true;
}

function coerceHumanPhone(raw = '') {
    const digits = formatPhoneForDisplay(raw);
    if (!digits) return null;
    return isLikelyHumanPhoneDigits(digits) ? digits : null;
}

function isLidIdentifier(value = '') {
    return String(value || '').trim().endsWith('@lid');
}

function extractPhoneFromText(value = '') {
    const text = String(value || '');
    if (!text) return null;
    const matches = text.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
    for (const token of matches) {
        const phone = formatPhoneForDisplay(token);
        if (phone) return phone;
    }
    return null;
}

function extractPhoneFromContactLike(contact = {}, options = {}) {
    const skipDirectNumber = Boolean(options?.skipDirectNumber);
    const serialized = String(contact?.id?._serialized || '');
    const isLid = isLidIdentifier(serialized);
    const candidates = [
        skipDirectNumber ? null : contact?.number,
        contact?.phoneNumber,
        (!isLid ? contact?.id?.user : null),
        (!isLid ? (serialized.split('@')[0] || '') : null),
        contact?.userid,
        contact?.pn,
        contact?.lid
    ];
    for (const candidate of candidates) {
        const phone = coerceHumanPhone(candidate);
        if (phone) return phone;
    }
    const fromText = extractPhoneFromText(
        `${contact?.name || ''} ${contact?.pushname || ''} ${contact?.shortName || ''}`
    );
    if (fromText && isLikelyHumanPhoneDigits(fromText)) return fromText;
    return null;
}

function extractPhoneFromChat(chat = {}) {
    const chatId = String(chat?.id?._serialized || '');
    const contact = chat?.contact || null;
    const isLid = isLidIdentifier(chatId);
    const fromMetaText = extractPhoneFromText(
        `${chat?.name || ''} ${chat?.formattedTitle || ''} ${contact?.name || ''} ${contact?.pushname || ''} ${contact?.shortName || ''}`
    );
    if (isLid && fromMetaText && isLikelyHumanPhoneDigits(fromMetaText)) return fromMetaText;

    const fromContact = extractPhoneFromContactLike(contact || {}, { skipDirectNumber: isLid });
    if (fromContact) return fromContact;
    if (fromMetaText && isLikelyHumanPhoneDigits(fromMetaText)) return fromMetaText;

    if (!isLid && chatId.endsWith('@c.us')) {
        const fromCUs = coerceHumanPhone(chat?.id?.user || chatId.split('@')[0] || '');
        if (fromCUs) return fromCUs;
    }

    if (!isLid) {
        const fromUser = coerceHumanPhone(chat?.id?.user || '');
        if (fromUser) return fromUser;
    }

    if (isLid) return null;
    return coerceHumanPhone(chatId.split('@')[0] || '');
}
function extractPhoneFromSummary(summary = {}) {
    const id = String(summary?.id || '');
    const isLid = isLidIdentifier(id);

    const fromSubtitle = extractPhoneFromText(summary?.subtitle || '');
    if (fromSubtitle && isLikelyHumanPhoneDigits(fromSubtitle)) return fromSubtitle;

    const fromStatus = extractPhoneFromText(summary?.status || '');
    if (fromStatus && isLikelyHumanPhoneDigits(fromStatus)) return fromStatus;

    const explicitPhone = coerceHumanPhone(summary?.phone || '');
    if (explicitPhone) return explicitPhone;

    if (!isLid && id.endsWith('@c.us')) {
        const fromCUs = coerceHumanPhone(id.split('@')[0] || '');
        if (fromCUs) return fromCUs;
    }

    if (isLid) return null;
    return coerceHumanPhone(id.split('@')[0] || '');
}

function buildChatIdentityKeyFromSummary(summary = {}) {
    const id = String(summary?.id || '');
    const phone = extractPhoneFromSummary(summary);
    if (phone) return 'phone:' + phone;
    return 'id:' + id;
}

function pickPreferredSummary(prevItem = {}, incoming = {}) {
    const prevTs = Number(prevItem?.timestamp || 0);
    const incomingTs = Number(incoming?.timestamp || 0);

    const incomingHasFreshPayload = Boolean(incoming?.lastMessage) && !Boolean(prevItem?.lastMessage);
    const pickIncoming = incomingTs > prevTs || (incomingTs === prevTs && incomingHasFreshPayload);
    const primary = pickIncoming ? incoming : prevItem;
    const secondary = pickIncoming ? prevItem : incoming;

    const merged = {
        ...secondary,
        ...primary,
        phone: primary?.phone || secondary?.phone || null,
        subtitle: primary?.subtitle || secondary?.subtitle || null,
        isMyContact: Boolean(primary?.isMyContact ?? secondary?.isMyContact),
        lastMessage: primary?.lastMessage || secondary?.lastMessage || '',
        timestamp: Math.max(prevTs, incomingTs),
        labels: Array.isArray(primary?.labels) && primary.labels.length > 0
            ? primary.labels
            : (Array.isArray(secondary?.labels) ? secondary.labels : [])
    };

    const primaryName = String(primary?.name || '').trim();
    const secondaryName = String(secondary?.name || '').trim();
    const primaryLooksInternal = primaryName.includes('@') || /^\d{14,}$/.test(primaryName);
    merged.name = (!primaryLooksInternal && primaryName) ? primaryName : (secondaryName || primaryName || 'Sin nombre');

    return merged;
}

function resolveLastMessagePreview(chat = {}) {
    const last = chat?.lastMessage;
    if (!last) return '';

    const type = String(last?.type || last?._data?.type || '').toLowerCase();
    if (type === 'location') {
        const location = extractLocationInfo(last);
        if (location?.label) return `Ubicacion: ${location.label}`;
        return 'Ubicacion';
    }

    const mediaMap = {
        image: 'Imagen',
        video: 'Video',
        audio: 'Audio',
        ptt: 'Nota de voz',
        document: 'Documento',
        sticker: 'Sticker',
        vcard: 'Contacto',
        order: 'Pedido',
        revoked: 'Mensaje eliminado'
    };

    if (type && type !== 'chat' && mediaMap[type]) {
        return mediaMap[type];
    }

    const body = String(last?.body || '').trim();
    if (body) {
        const possibleCoords = extractCoordsFromText(body);
        const hasMapUrl = /https?:\/\/(?:www\.)?(?:google\.[^\s/]+\/maps|maps\.app\.goo\.gl|maps\.google\.com)/i.test(body);
        if (possibleCoords || hasMapUrl) return 'Ubicacion';
        return body;
    }

    return 'Mensaje';
}

function defaultCountryCode() {
    return normalizePhoneDigits(process.env.WA_DEFAULT_COUNTRY_CODE || process.env.DEFAULT_COUNTRY_CODE || '51');
}

function buildPhoneCandidates(rawPhone) {
    const clean = normalizePhoneDigits(rawPhone);
    if (!clean) return [];

    const cc = defaultCountryCode();
    const trimmed = clean.replace(/^0+/, '') || clean;
    const candidates = [];

    const push = (v) => {
        const digits = normalizePhoneDigits(v);
        if (!digits) return;
        if (!candidates.includes(digits)) candidates.push(digits);
    };

    const isLikelyLocal = trimmed.length <= 10;
    if (isLikelyLocal && cc && !trimmed.startsWith(cc)) push(`${cc}${trimmed}`);
    push(trimmed);
    if (cc && trimmed.startsWith(cc)) push(trimmed.slice(cc.length));

    return candidates;
}

async function resolveRegisteredNumber(client, rawPhone) {
    const candidates = buildPhoneCandidates(rawPhone);
    for (const cand of candidates) {
        try {
            const numberId = await client.getNumberId(cand);
            if (!numberId) continue;

            const candDigits = coerceHumanPhone(cand);
            const byUser = coerceHumanPhone(numberId.user || '');
            const serialized = String(numberId._serialized || '');
            const bySerialized = coerceHumanPhone(serialized.split('@')[0] || '');

            const looksLikeSameNumber = (a, b) => {
                if (!a || !b) return false;
                return a === b || a.endsWith(b) || b.endsWith(a);
            };

            if (byUser && candDigits && looksLikeSameNumber(byUser, candDigits)) return byUser;
            if (bySerialized && candDigits && looksLikeSameNumber(bySerialized, candDigits)) return bySerialized;
            if (candDigits) return candDigits;
            if (byUser) return byUser;
            if (bySerialized) return bySerialized;
        } catch (e) { }
    }
    return null;
}

function normalizeFilterToken(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeFilterTokens(tokens = []) {
    if (!Array.isArray(tokens)) return [];
    const seen = new Set();
    const normalized = [];
    for (const token of tokens) {
        const clean = normalizeFilterToken(token);
        if (!clean) continue;
        if (seen.has(clean)) continue;
        seen.add(clean);
        normalized.push(clean);
    }
    return normalized;
}

function toLabelTokenSet(labels = []) {
    const tokens = new Set();
    if (!Array.isArray(labels)) return tokens;
    for (const label of labels) {
        const id = normalizeFilterToken(label?.id);
        if (id) tokens.add(`id:${id}`);
        const name = normalizeFilterToken(label?.name);
        if (name) tokens.add(`name:${name}`);
    }
    return tokens;
}

function matchesTokenSet(labelTokenSet, selectedTokens) {
    if (!(labelTokenSet instanceof Set)) return false;
    if (!Array.isArray(selectedTokens) || selectedTokens.length === 0) return true;
    return selectedTokens.some((token) => {
        const clean = normalizeFilterToken(token);
        if (!clean) return false;
        if (labelTokenSet.has(clean)) return true;
        if (clean.startsWith('id:')) {
            const value = clean.slice(3);
            return value ? labelTokenSet.has(value) : false;
        }
        if (clean.startsWith('name:')) {
            const value = clean.slice(5);
            return value ? labelTokenSet.has(value) : false;
        }
        return labelTokenSet.has(`id:${clean}`) || labelTokenSet.has(`name:${clean}`);
    });
}

async function runWithConcurrency(items, limit, worker) {
    if (!Array.isArray(items) || items.length === 0) return;
    const max = Math.max(1, Math.floor(Number(limit) || 1));
    let cursor = 0;

    const runners = Array.from({ length: Math.min(max, items.length) }, async () => {
        while (true) {
            const idx = cursor++;
            if (idx >= items.length) return;
            await worker(items[idx], idx);
        }
    });

    await Promise.all(runners);
}
class SocketManager {
    constructor(io) {
        this.io = io;
        this.chatMetaCache = new Map();
        this.chatMetaTtlMs = Number(process.env.CHAT_META_TTL_MS || 10 * 60 * 1000);
        this.chatListCache = { items: [], updatedAt: 0 };
        this.chatListTtlMs = Number(process.env.CHAT_LIST_TTL_MS || 15000);
        this.contactListCache = { items: [], updatedAt: 0 };
        this.contactListTtlMs = Number(process.env.CONTACT_LIST_TTL_MS || 60 * 1000);
        this.setupSocketEvents();
        this.setupWAClientEvents();
    }


    getWaRuntime() {
        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : {};
        return {
            requestedTransport: String(runtime?.requestedTransport || process.env.WA_TRANSPORT || 'idle').toLowerCase(),
            activeTransport: String(runtime?.activeTransport || 'idle').toLowerCase(),
            cloudRequested: Boolean(runtime?.cloudRequested),
            cloudConfigured: Boolean(runtime?.cloudConfigured),
            cloudReady: Boolean(runtime?.cloudReady),
            availableTransports: Array.isArray(runtime?.availableTransports) ? runtime.availableTransports : ['webjs', 'cloud'],
            migrationReady: runtime?.migrationReady !== false
        };
    }

    getWaCapabilities() {
        const caps = waClient.getCapabilities();
        const runtime = this.getWaRuntime();
        return {
            messageEdit: Boolean(caps?.messageEdit),
            messageEditSync: Boolean(caps?.messageEditSync),
            messageForward: Boolean(caps?.messageForward),
            messageDelete: Boolean(caps?.messageDelete),
            messageReply: Boolean(caps?.messageReply),
            quickReplies: Boolean(caps?.quickReplies),
            quickRepliesRead: Boolean(caps?.quickRepliesRead),
            quickRepliesWrite: Boolean(caps?.quickRepliesWrite),
            transport: runtime.activeTransport,
            requestedTransport: runtime.requestedTransport,
            cloudConfigured: runtime.cloudConfigured,
            cloudReady: runtime.cloudReady,
            availableTransports: runtime.availableTransports,
            migrationReady: runtime.migrationReady
        };
    }

    emitWaCapabilities(socket) {
        socket.emit('wa_capabilities', this.getWaCapabilities());

        socket.emit('wa_runtime', this.getWaRuntime());
    }


    ensureTransportReady(socket, {
        action = 'completar la operacion',
        errorEvent = 'error',
        requireReady = true
    } = {}) {
        const runtime = this.getWaRuntime();
        const activeTransport = String(runtime?.activeTransport || 'idle').toLowerCase();

        if (activeTransport === 'idle') {
            socket.emit(errorEvent, `Selecciona un modo de transporte antes de ${action}.`);
            socket.emit('wa_runtime', runtime);
            return false;
        }

        if (requireReady && !waClient.isReady) {
            const message = activeTransport === 'webjs'
                ? `WhatsApp aun no esta listo. Escanea el QR y espera sincronizacion para ${action}.`
                : `Cloud API aun no esta lista para ${action}.`;
            socket.emit(errorEvent, message);
            if (activeTransport === 'webjs' && waClient.lastQr) {
                socket.emit('qr', waClient.lastQr);
            }
            socket.emit('wa_runtime', runtime);
            return false;
        }

        return true;
    }

    async emitMessageEditability(messageId, chatId) {
        const id = String(messageId || '').trim();
        if (!id) return;
        try {
            const canEdit = await waClient.canEditMessageById(id);
            this.io.emit('message_editability', {
                id,
                chatId: String(chatId || ''),
                canEdit
            });
        } catch (e) { }
    }

    scheduleEditabilityRefresh(messageId, chatId, delaysMs = [1200, 3200, 7000]) {
        const id = String(messageId || '').trim();
        if (!id) return;
        const normalizedChatId = String(chatId || '');
        (Array.isArray(delaysMs) ? delaysMs : []).forEach((delay) => {
            const waitMs = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
            setTimeout(() => {
                this.emitMessageEditability(id, normalizedChatId);
            }, waitMs);
        });
    }

    invalidateChatListCache() {
        this.chatListCache = { items: [], updatedAt: 0 };
    }

    async getSortedVisibleChats({ forceRefresh = false } = {}) {
        const cacheAge = Date.now() - (this.chatListCache?.updatedAt || 0);
        if (!forceRefresh && this.chatListCache.items.length > 0 && cacheAge <= this.chatListTtlMs) {
            return this.chatListCache.items;
        }

        let chats = [];
        try {
            chats = await waClient.getChats();
        } catch (error) {
            if (this.chatListCache.items.length > 0) {
                console.warn(`[WA] getChats failed; using cache (${this.chatListCache.items.length} chats).`, String(error?.message || error));
                return this.chatListCache.items;
            }
            throw error;
        }

        const sortedChats = [...chats]
            .filter((c) => isVisibleChatId(c?.id?._serialized))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        this.chatListCache = {
            items: sortedChats,
            updatedAt: Date.now()
        };
        return sortedChats;
    }
    getCachedChatMeta(chatId) {
        const key = String(chatId || '');
        const cached = this.chatMetaCache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.updatedAt > this.chatMetaTtlMs) return null;
        return cached;
    }

    async hydrateChatMeta(chat) {
        const chatId = chat?.id?._serialized;
        if (!chatId || !isVisibleChatId(chatId)) return { labels: [], profilePicUrl: null };

        const cached = this.getCachedChatMeta(chatId);
        if (cached) return { labels: cached.labels, profilePicUrl: cached.profilePicUrl };

        let labels = [];
        let profilePicUrl = null;
        try { labels = await chat.getLabels(); } catch (e) { }
        try { profilePicUrl = await resolveProfilePic(waClient.client, chatId); } catch (e) { }

        const normalized = {
            labels: (labels || []).map((l) => ({ id: l.id, name: l.name, color: l.color })),
            profilePicUrl,
            updatedAt: Date.now()
        };
        this.chatMetaCache.set(chatId, normalized);
        return normalized;
    }

    async getSearchableContacts({ forceRefresh = false } = {}) {
        const cacheAge = Date.now() - (this.contactListCache?.updatedAt || 0);
        if (!forceRefresh && this.contactListCache.items.length > 0 && cacheAge <= this.contactListTtlMs) {
            return this.contactListCache.items;
        }

        let contacts = [];
        try {
            contacts = await waClient.client.getContacts();
        } catch (e) {
            contacts = [];
        }

        const mapped = contacts
            .filter((c) => {
                const serialized = String(c?.id?._serialized || '');
                return serialized.endsWith('@c.us') || serialized.endsWith('@lid');
            })
            .map((c) => {
                const serialized = String(c?.id?._serialized || '');
                const phone = coerceHumanPhone(c?.number || c?.id?.user || serialized.split('@')[0] || '');
                if (!phone) return null;

                const displayNameCandidate = String(c?.name || c?.pushname || c?.shortName || '').trim();
                const displayName = (displayNameCandidate && !displayNameCandidate.includes('@') && !/^\d{14,}$/.test(displayNameCandidate))
                    ? displayNameCandidate
                    : ('+' + phone);

                const subtitleCandidate = String(c?.pushname || c?.shortName || c?.name || '').trim();
                const subtitle = subtitleCandidate && subtitleCandidate !== displayName ? subtitleCandidate : null;

                return {
                    id: `${phone}@c.us`,
                    name: displayName,
                    phone,
                    subtitle,
                    unreadCount: 0,
                    timestamp: 0,
                    lastMessage: '',
                    lastMessageFromMe: false,
                    ack: 0,
                    labels: [],
                    profilePicUrl: null,
                    isMyContact: Boolean(c?.isMyContact)
                };
            })
            .filter(Boolean);

        const dedupMap = new Map();
        for (const item of mapped) {
            const key = buildChatIdentityKeyFromSummary(item);
            if (!dedupMap.has(key)) {
                dedupMap.set(key, item);
            }
        }
        const deduped = Array.from(dedupMap.values());

        this.contactListCache = {
            items: deduped,
            updatedAt: Date.now()
        };
        return deduped;
    }
    async getChatLabelTokenSet(chat) {
        const chatId = String(chat?.id?._serialized || '');
        if (!chatId || !isVisibleChatId(chatId)) return new Set();

        let labels = this.getCachedChatMeta(chatId)?.labels;
        if (!Array.isArray(labels)) {
            const hydrated = await this.hydrateChatMeta(chat);
            labels = hydrated?.labels || [];
        }

        return toLabelTokenSet(labels);
    }

    async applyAdvancedChatFilters(chats = [], filters = {}) {
        if (!Array.isArray(chats) || chats.length === 0) return [];

        const selectedTokens = normalizeFilterTokens(filters?.labelTokens);
        const unreadOnly = Boolean(filters?.unreadOnly);
        const unlabeledOnly = Boolean(filters?.unlabeledOnly);
        const contactMode = ['all', 'my', 'unknown'].includes(String(filters?.contactMode || 'all'))
            ? String(filters?.contactMode || 'all')
            : 'all';
        const archivedMode = ['all', 'archived', 'active'].includes(String(filters?.archivedMode || 'all'))
            ? String(filters?.archivedMode || 'all')
            : 'all';

        const needsLabelFiltering = unlabeledOnly || selectedTokens.length > 0;
        if (!unreadOnly && !needsLabelFiltering && contactMode === 'all' && archivedMode === 'all') return chats;

        const included = new Array(chats.length).fill(false);
        const labelConcurrency = Math.max(2, Number(process.env.LABEL_FILTER_CONCURRENCY || 10));

        await runWithConcurrency(chats, labelConcurrency, async (chat, idx) => {
            const unreadCount = Number(chat?.unreadCount || 0);
            if (unreadOnly && unreadCount <= 0) return;

            const isMyContact = Boolean(chat?.contact?.isMyContact);
            if (contactMode === 'my' && !isMyContact) return;
            if (contactMode === 'unknown' && isMyContact) return;
            const isArchived = Boolean(chat?.archived);
            if (archivedMode === 'archived' && !isArchived) return;
            if (archivedMode === 'active' && isArchived) return;

            if (needsLabelFiltering) {
                const labelTokenSet = await this.getChatLabelTokenSet(chat);
                const hasAnyLabel = labelTokenSet.size > 0;
                if (unlabeledOnly && hasAnyLabel) return;
                if (!unlabeledOnly && selectedTokens.length > 0 && !matchesTokenSet(labelTokenSet, selectedTokens)) {
                    return;
                }
            }

            included[idx] = true;
        });

        return chats.filter((_, idx) => included[idx]);
    }
    async toChatSummary(chat, { includeHeavyMeta = false } = {}) {
        const chatId = chat?.id?._serialized;
        if (!isVisibleChatId(chatId)) return null;

        const cached = this.getCachedChatMeta(chatId);
        let labels = cached?.labels || [];
        let profilePicUrl = cached?.profilePicUrl || null;

        if (includeHeavyMeta || !cached) {
            const hydrated = await this.hydrateChatMeta(chat);
            labels = hydrated.labels;
            profilePicUrl = hydrated.profilePicUrl;
        }

        let contact = chat?.contact || null;
        const isGroup = String(chatId || '').endsWith('@g.us');
        const shouldHydrateContact = !isGroup && (!extractPhoneFromChat(chat) || isLidIdentifier(chatId));
        if (shouldHydrateContact) {
            try {
                const hydratedContact = await waClient.client.getContactById(chatId);
                if (hydratedContact) {
                    contact = {
                        ...(chat?.contact || {}),
                        ...hydratedContact
                    };
                }
            } catch (e) { }
        }

        const effectiveChat = { ...chat, contact };
        const phone = isGroup ? null : extractPhoneFromChat(effectiveChat);
        const subtitle = contact?.pushname || contact?.shortName || contact?.name || null;

        return {
            id: chatId,
            name: resolveChatDisplayName(effectiveChat),
            phone,
            subtitle,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            lastMessage: resolveLastMessagePreview(chat),
            lastMessageFromMe: chat.lastMessage ? chat.lastMessage.fromMe : false,
            ack: chat.lastMessage ? chat.lastMessage.ack : 0,
            labels,
            profilePicUrl,
            isMyContact: Boolean(contact?.isMyContact),
            archived: Boolean(chat?.archived)
        };
    }

    setupSocketEvents() {

        this.io.on('connection', (socket) => {
            const tenantId = String(socket?.data?.tenantId || 'default');
            const authContext = socket?.data?.authContext || null;
            console.log('Web client connected:', socket.id, '| tenant:', tenantId);
            socket.emit('tenant_context', {
                tenantId,
                user: authContext ? {
                    userId: authContext.userId,
                    email: authContext.email,
                    role: authContext.role,
                    tenantId: authContext.tenantId
                } : null
            });

            if (waClient.isReady) {
                socket.emit('ready', { message: 'WhatsApp is ready' });
            } else if (waClient.lastQr) {
                socket.emit('qr', waClient.lastQr);
            }
            this.emitWaCapabilities(socket);

            socket.on('get_wa_capabilities', () => {
                this.emitWaCapabilities(socket);
            });

            socket.on('set_transport_mode', async ({ mode } = {}) => {
                try {
                    const nextMode = String(mode || '').trim().toLowerCase();
                    if (!nextMode) {
                        socket.emit('transport_mode_error', 'Debes seleccionar un modo de transporte.');
                        return;
                    }

                    const runtime = await waClient.setTransportMode(nextMode);
                    this.invalidateChatListCache();
                    this.contactListCache = { items: [], updatedAt: 0 };
                    this.emitWaCapabilities(socket);
                    socket.emit('transport_mode_set', runtime);

                    if (waClient.isReady) {
                        socket.emit('ready', { message: 'WhatsApp transport listo' });
                    } else if (waClient.lastQr) {
                        socket.emit('qr', waClient.lastQr);
                    }
                } catch (error) {
                    socket.emit('transport_mode_error', String(error?.message || 'No se pudo cambiar el modo de transporte.'));
                    this.emitWaCapabilities(socket);
                }
            });

            // --- Chat info ---
            socket.on('get_chats', async (payload = {}) => {
                try {
                    const rawOffset = Number(payload?.offset ?? 0);
                    const rawLimit = Number(payload?.limit ?? 80);
                    const reset = Boolean(payload?.reset);
                    const query = String(payload?.query || '').trim();
                    const filterKey = String(payload?.filterKey || '').trim();
                    const incomingFilters = payload?.filters || {};
                    const queryLower = query.toLowerCase();
                    const queryDigits = normalizePhoneDigits(query);
                    const activeFilters = {
                        labelTokens: normalizeFilterTokens(incomingFilters?.labelTokens),
                        unreadOnly: Boolean(incomingFilters?.unreadOnly),
                        unlabeledOnly: Boolean(incomingFilters?.unlabeledOnly),
                        contactMode: ['all', 'my', 'unknown'].includes(String(incomingFilters?.contactMode || 'all'))
                            ? String(incomingFilters?.contactMode || 'all')
                            : 'all',
                        archivedMode: ['all', 'archived', 'active'].includes(String(incomingFilters?.archivedMode || 'all'))
                            ? String(incomingFilters?.archivedMode || 'all')
                            : 'all'
                    };

                    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
                    const limit = Number.isFinite(rawLimit)
                        ? Math.min(250, Math.max(20, Math.floor(rawLimit)))
                        : 80;

                    if (!this.ensureTransportReady(socket, { action: 'cargar chats', errorEvent: 'error' })) {
                        socket.emit('chats', {
                            items: [],
                            offset,
                            limit,
                            total: 0,
                            hasMore: false,
                            nextOffset: 0,
                            query,
                            filters: activeFilters,
                            filterKey
                        });
                        return;
                    }


                    const hasActiveFilters = activeFilters.unreadOnly || activeFilters.unlabeledOnly || activeFilters.contactMode !== 'all' || activeFilters.archivedMode !== 'all' || activeFilters.labelTokens.length > 0;
                    let sortedChats = await this.getSortedVisibleChats({ forceRefresh: reset || Boolean(query) || hasActiveFilters });
                    if (!queryLower && !reset && offset >= sortedChats.length) {
                        sortedChats = await this.getSortedVisibleChats({ forceRefresh: true });
                    }
                    let filtered = sortedChats;

                    if (queryLower) {
                        filtered = sortedChats.filter((c) => {
                            const name = resolveChatDisplayName(c).toLowerCase();
                            const lastMessage = String(c?.lastMessage?.body || '').toLowerCase();
                            const phone = normalizePhoneDigits(extractPhoneFromChat(c) || '');
                            const contact = c?.contact || {};
                            const subtitle = `${contact?.pushname || ''} ${contact?.name || ''} ${contact?.shortName || ''}`.toLowerCase();

                            if (queryDigits) {
                                return phone.includes(queryDigits);
                            }
                            return name.includes(queryLower) || lastMessage.includes(queryLower) || subtitle.includes(queryLower);
                        });
                    }

                    filtered = await this.applyAdvancedChatFilters(filtered, activeFilters);

                    const page = filtered.slice(offset, offset + limit);
                    const scannedCount = page.length;
                    const formatted = await Promise.all(page.map((c) => this.toChatSummary(c, { includeHeavyMeta: false })));

                    let items = formatted.filter(Boolean);
                    if (queryLower && offset === 0 && items.length < limit && !hasActiveFilters) {
                        const existingIds = new Set(items.map((it) => it.id));
                        const existingPhones = new Set(items.map((it) => normalizePhoneDigits(it.phone || '')).filter(Boolean));
                        const phoneToExistingChatId = new Map();
                        for (const chat of sortedChats) {
                            const phone = normalizePhoneDigits(extractPhoneFromChat(chat) || '');
                            const serializedId = chat?.id?._serialized;
                            if (!phone || !serializedId || phoneToExistingChatId.has(phone)) continue;
                            phoneToExistingChatId.set(phone, serializedId);
                        }

                        const contacts = await this.getSearchableContacts();
                        const contactMatches = contacts
                            .map((c) => {
                                const phone = normalizePhoneDigits(c?.phone || '');
                                const canonicalId = phone ? phoneToExistingChatId.get(phone) : null;
                                return canonicalId ? { ...c, id: canonicalId } : c;
                            })
                            .filter((c) => {
                                if (!c?.id || existingIds.has(c.id)) return false;
                                const contactPhone = normalizePhoneDigits(c.phone || '');
                                if (contactPhone && existingPhones.has(contactPhone)) return false;
                                const name = String(c.name || '').toLowerCase();
                                const subtitle = String(c.subtitle || '').toLowerCase();
                                const phone = normalizePhoneDigits(c.phone || '');
                                if (queryDigits) return phone.includes(queryDigits);
                                return name.includes(queryLower) || subtitle.includes(queryLower);
                            });

                        const remaining = Math.max(0, limit - items.length);
                        items = [...items, ...contactMatches.slice(0, remaining)];
                    }
                    if (queryDigits && offset === 0 && items.length === 0 && !hasActiveFilters) {
                        const registeredUser = await resolveRegisteredNumber(waClient.client, queryDigits);
                        if (registeredUser) {
                            const normalizedRegistered = normalizePhoneDigits(registeredUser);
                            let canonicalChatId = `${registeredUser}@c.us`;

                            const existingChat = sortedChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === normalizedRegistered);
                            if (existingChat?.id?._serialized) {
                                canonicalChatId = existingChat.id._serialized;
                            }

                            try {
                                const chat = await waClient.client.getChatById(canonicalChatId);
                                const summary = await this.toChatSummary(chat, { includeHeavyMeta: true });
                                if (summary) items = [summary];
                            } catch (e) {
                                items = [{
                                    id: canonicalChatId,
                                    name: `+${registeredUser}`,
                                    phone: registeredUser,
                                    subtitle: null,
                                    unreadCount: 0,
                                    timestamp: 0,
                                    lastMessage: '',
                                    lastMessageFromMe: false,
                                    ack: 0,
                                    labels: [],
                                    profilePicUrl: null,
                                    isMyContact: false
                                }];
                            }
                        }
                    }

                    const dedupMap = new Map();
                    for (const item of items) {
                        if (!item) continue;
                        const key = buildChatIdentityKeyFromSummary(item);
                        if (!dedupMap.has(key)) {
                            dedupMap.set(key, item);
                            continue;
                        }

                        const prevItem = dedupMap.get(key);
                        dedupMap.set(key, pickPreferredSummary(prevItem, item));
                    }
                    items = Array.from(dedupMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                    const nextOffset = offset + scannedCount;
                    const total = filtered.length;
                    const hasMore = nextOffset < total;
                    socket.emit('chats', {
                        items,
                        offset,
                        limit,
                        total,
                        hasMore,
                        nextOffset,
                        query,
                        filters: activeFilters,
                        filterKey
                    });

                    // Hydrate photos/labels progressively in background to keep first paint fast.
                    const pendingMetaChats = page
                        .filter((chat) => {
                            const chatId = String(chat?.id?._serialized || '');
                            if (!chatId || !isVisibleChatId(chatId)) return false;
                            const cached = this.getCachedChatMeta(chatId);
                            if (!cached) return true;
                            return !cached.profilePicUrl || !Array.isArray(cached.labels);
                        })
                        .slice(0, 24);

                    if (pendingMetaChats.length > 0) {
                        setImmediate(async () => {
                            for (const chat of pendingMetaChats) {
                                try {
                                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: true });
                                    if (summary) socket.emit('chat_updated', summary);
                                } catch (_) { }
                            }
                        });
                    }
                } catch (e) {
                    console.error('Error fetching chats:', e);
                }
            });

            socket.on('get_chat_history', async (chatId) => {
                try {
                    let historyChatId = String(chatId || '');

                    if (!this.ensureTransportReady(socket, { action: 'abrir historial', errorEvent: 'error' })) {
                        socket.emit('chat_history', { chatId: historyChatId, requestedChatId: chatId, messages: [] });
                        return;
                    }

                    let messages = [];
                    try {
                        messages = await waClient.getMessages(historyChatId, 30);
                    } catch (directErr) {
                        const requestedDigits = normalizePhoneDigits(historyChatId.split('@')[0] || '');
                        if (requestedDigits) {
                            const visibleChats = await this.getSortedVisibleChats({ forceRefresh: true });
                            const byPhone = visibleChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === requestedDigits);
                            if (byPhone?.id?._serialized) {
                                historyChatId = byPhone.id._serialized;
                                messages = await waClient.getMessages(historyChatId, 30);
                            } else {
                                throw directErr;
                            }
                        } else {
                            throw directErr;
                        }
                    }
                    const visible = messages.filter((m) => !isStatusOrSystemMessage(m));
                    const outgoingIds = visible
                        .filter((m) => Boolean(m?.fromMe))
                        .map((m) => String(m?.id?._serialized || ''))
                        .filter(Boolean);
                    const editableMap = outgoingIds.length > 0
                        ? await waClient.getMessagesEditability(outgoingIds)
                        : {};

                    const formatted = await Promise.all(visible.map(async (m) => {
                        const senderMeta = await resolveMessageSenderMeta(m);
                        const fileMeta = extractMessageFileMeta(m);
                        return ({
                        id: m.id._serialized,
                        from: m.from,
                        to: m.to,
                        body: m.body,
                        timestamp: m.timestamp,
                        fromMe: m.fromMe,
                        hasMedia: m.hasMedia,
                        mediaData: null,
                        mimetype: null,
                        filename: fileMeta.filename,
                        fileSizeBytes: fileMeta.fileSizeBytes,
                        type: m.type,
                        author: m?.author || m?._data?.author || null,
                        notifyName: senderMeta.notifyName,
                        senderPhone: senderMeta.senderPhone,
                        senderId: senderMeta.senderId,
                        senderPushname: senderMeta.senderPushname,
                        isGroupMessage: senderMeta.isGroupMessage,
                        ack: Number.isFinite(Number(m.ack)) ? Number(m.ack) : 0,
                        edited: Boolean(m?._data?.latestEditMsgKey || m?._data?.latestEditSenderTimestampMs || m?._data?.edited),
                        editedAt: Number(m?._data?.latestEditSenderTimestampMs || 0) > 0 ? Math.floor(Number(m._data.latestEditSenderTimestampMs) / 1000) : null,
                        canEdit: Boolean(editableMap[String(m?.id?._serialized || '')]),
                        order: extractOrderInfo(m),
                        location: extractLocationInfo(m),
                        quotedMessage: await extractQuotedMessageInfo(m)
                        });
                    }));
                    socket.emit('chat_history', { chatId: historyChatId, requestedChatId: chatId, messages: formatted });

                    // Avoid blocking chat open while media is downloaded/cached.
                    visible
                        .filter((m) => m.hasMedia)
                        .slice(-12)
                        .forEach(async (m) => {
                            try {
                                const media = await mediaManager.processMessageMedia(m);
                                if (!media) return;
                                const mediaMeta = extractMessageFileMeta(m, media);
                                socket.emit('chat_media', {
                                    chatId: historyChatId,
                                    messageId: m.id._serialized,
                                    mediaData: media.data,
                                    mimetype: media.mimetype,
                                    filename: mediaMeta.filename,
                                    fileSizeBytes: mediaMeta.fileSizeBytes
                                });
                            } catch (mediaErr) { }
                        });
                } catch (e) {
                    console.error('Error fetching history:', e);
                }
            });

            socket.on('start_new_chat', async ({ phone, firstMessage }) => {
                try {
                    if (!this.ensureTransportReady(socket, { action: 'abrir un chat nuevo', errorEvent: 'start_new_chat_error' })) {
                        return;
                    }
                    const clean = normalizePhoneDigits(phone);
                    if (!clean) {
                        socket.emit('start_new_chat_error', 'Numero invalido.');
                        return;
                    }

                    const registeredUser = await resolveRegisteredNumber(waClient.client, clean);
                    if (!registeredUser) {
                        socket.emit('start_new_chat_error', 'El numero no esta registrado en WhatsApp.');
                        return;
                    }

                    const normalizedRegistered = normalizePhoneDigits(registeredUser);
                    const directChatId = `${registeredUser}@c.us`;
                    let canonicalChatId = directChatId;

                    try {
                        const visibleChats = await this.getSortedVisibleChats({ forceRefresh: true });
                        const existingChat = visibleChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === normalizedRegistered);
                        if (existingChat?.id?._serialized) {
                            canonicalChatId = existingChat.id._serialized;
                        }
                    } catch (e) { }

                    if (firstMessage && String(firstMessage).trim()) {
                        await waClient.sendMessage(directChatId, String(firstMessage).trim());
                    }

                    try {
                        const chat = await waClient.client.getChatById(canonicalChatId);
                        const summary = await this.toChatSummary(chat, { includeHeavyMeta: true });
                        if (summary) {
                            canonicalChatId = summary.id || canonicalChatId;
                            this.io.emit('chat_updated', summary);
                        }
                    } catch (e) {
                        try {
                            const fallbackChat = await waClient.client.getChatById(directChatId);
                            const fallbackSummary = await this.toChatSummary(fallbackChat, { includeHeavyMeta: true });
                            if (fallbackSummary) {
                                canonicalChatId = fallbackSummary.id || directChatId;
                                this.io.emit('chat_updated', fallbackSummary);
                            }
                        } catch (fallbackErr) { }
                    }

                    socket.emit('chat_opened', { chatId: canonicalChatId, phone: registeredUser });
                } catch (e) {
                    console.error('start_new_chat error:', e.message);
                    socket.emit('start_new_chat_error', 'No se pudo iniciar el chat.');
                }
            });

            socket.on('set_chat_labels', async ({ chatId, labelIds }) => {
                try {
                    if (!this.ensureTransportReady(socket, { action: 'gestionar etiquetas', errorEvent: 'chat_labels_error' })) {
                        return;
                    }
                    if (!chatId) {
                        socket.emit('chat_labels_error', 'Chat invalido para etiquetar.');
                        return;
                    }

                    const ids = Array.isArray(labelIds)
                        ? labelIds.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').map((v) => Number.isNaN(Number(v)) ? String(v) : Number(v))
                        : [];

                    const chat = await waClient.client.getChatById(chatId);
                    if (chat?.changeLabels) {
                        await chat.changeLabels(ids);
                    } else if (waClient.client?.addOrRemoveLabels) {
                        await waClient.client.addOrRemoveLabels(ids, [chatId]);
                    }

                    let updatedLabels = [];
                    try {
                        updatedLabels = await chat.getLabels();
                    } catch (e) { }

                    const payload = {
                        chatId,
                        labels: (updatedLabels || []).map((l) => ({ id: l.id, name: l.name, color: l.color }))
                    };
                    const cachedMeta = this.getCachedChatMeta(chatId) || {};
                    this.chatMetaCache.set(String(chatId), {
                        labels: payload.labels,
                        profilePicUrl: cachedMeta.profilePicUrl || null,
                        updatedAt: Date.now()
                    });
                    this.io.emit('chat_labels_updated', payload);
                    socket.emit('chat_labels_saved', { chatId, ok: true });
                } catch (e) {
                    console.error('set_chat_labels error:', e.message);
                    socket.emit('chat_labels_error', 'No se pudieron actualizar las etiquetas en WhatsApp.');
                }
            });

            socket.on('create_label', async ({ name }) => {
                try {
                    const clean = String(name || '').trim();
                    if (!clean) {
                        socket.emit('chat_labels_error', 'Nombre de etiqueta invalido.');
                        return;
                    }
                    socket.emit('chat_labels_error', 'WhatsApp Web no permite crear etiquetas por API en esta version. Creala en WhatsApp y aqui se sincronizara al recargar.');
                } catch (e) {
                    console.error('create_label error:', e.message);
                    socket.emit('chat_labels_error', 'No se pudo crear la etiqueta.');
                }
            });
            socket.on('get_quick_replies', async () => {
                try {

                    const caps = this.getWaCapabilities();
                    if (!caps.quickRepliesRead || typeof waClient.client?.getQuickReplies !== 'function') {
                        socket.emit('quick_replies', { items: [], source: 'unsupported' });
                        return;
                    }
                    const nativeItems = await waClient.client.getQuickReplies();
                    socket.emit('quick_replies', { items: Array.isArray(nativeItems) ? nativeItems : [], source: 'native' });
                } catch (e) {
                    socket.emit('quick_reply_error', 'No se pudieron cargar las respuestas rapidas nativas.');
                }
            });

            socket.on('add_quick_reply', async () => {
                socket.emit('quick_reply_error', 'WhatsApp Web no expone crear respuestas rapidas por API en esta version.');
            });

            socket.on('update_quick_reply', async () => {
                socket.emit('quick_reply_error', 'WhatsApp Web no expone editar respuestas rapidas por API en esta version.');
            });

            socket.on('delete_quick_reply', async () => {
                socket.emit('quick_reply_error', 'WhatsApp Web no expone eliminar respuestas rapidas por API en esta version.');
            });

            // --- Messaging ---
            socket.on('send_message', async ({ to, body, quotedMessageId }) => {
                if (!guardRateLimit(socket, 'send_message')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar mensajes', errorEvent: 'error' })) return;
                try {
                    const targetChatId = String(to || '').trim();
                    const text = String(body || '');
                    const quoted = String(quotedMessageId || '').trim();
                    if (!targetChatId || !text.trim()) {
                        socket.emit('error', 'Datos invalidos para enviar mensaje.');
                        return;
                    }

                    if (quoted) {
                        let quotedTargetChatId = targetChatId;
                        try {
                            const quotedMsg = await waClient.getMessageById(quoted);
                            const fromQuoted = String(quotedMsg?.fromMe ? quotedMsg?.to : quotedMsg?.from || '').trim();
                            if (fromQuoted && isVisibleChatId(fromQuoted)) {
                                quotedTargetChatId = fromQuoted;
                            }
                        } catch (resolveQuotedError) {
                        }

                        try {
                            // Prefer native quotedMessageId path so replies stay linked on WhatsApp mobile.
                            await waClient.sendMessage(quotedTargetChatId, text, { quotedMessageId: quoted });
                        } catch (sendWithQuoteError) {
                            // Fallback for runtime variants where quotedMessageId is not accepted directly.
                            await waClient.replyToMessage(quotedTargetChatId, quoted, text);
                        }
                    } else {
                        await waClient.sendMessage(targetChatId, text);
                    }
                } catch (e) {
                    socket.emit('error', 'Failed to send message.');
                }
            });
            socket.on('edit_message', async ({ chatId, messageId, body }) => {
                if (!guardRateLimit(socket, 'edit_message')) return;
                if (!this.ensureTransportReady(socket, { action: 'editar mensajes', errorEvent: 'edit_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageEdit) {
                    socket.emit('edit_message_error', 'La edicion de mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const targetChatId = String(chatId || '').trim();
                    const targetMessageId = String(messageId || '').trim();
                    const nextBody = String(body || '').trim();

                    if (!targetChatId || !targetMessageId || !nextBody) {
                        socket.emit('edit_message_error', 'Datos invalidos para editar el mensaje.');
                        return;
                    }

                    const chat = await waClient.client.getChatById(targetChatId);
                    const candidates = await chat.fetchMessages({ limit: 150 });
                    const targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId);
                    if (!targetMessage) {
                        socket.emit('edit_message_error', 'No se encontro el mensaje para editar.');
                        return;
                    }

                    if (!targetMessage.fromMe) {
                        socket.emit('edit_message_error', 'Solo puedes editar mensajes enviados por ti.');
                        return;
                    }

                    if (typeof targetMessage.edit !== 'function') {
                        socket.emit('edit_message_error', 'Esta version de WhatsApp Web no permite editar mensajes por API.');
                        return;
                    }


                    const canEditNow = await waClient.canEditMessageById(targetMessageId);
                    if (!canEditNow) {
                        socket.emit('edit_message_error', 'WhatsApp no permite editar este mensaje (tipo o tiempo).');
                        return;
                    }

                    const editedMessage = await targetMessage.edit(nextBody);
                    if (!editedMessage) {
                        socket.emit('edit_message_error', 'WhatsApp no permitio editar el mensaje.');
                        return;
                    }

                    this.emitMessageEditability(targetMessageId, targetChatId);
                } catch (e) {
                    const detail = String(e?.message || '').toLowerCase();
                    if (detail.includes('revoke') || detail.includes('time') || detail.includes('edit')) {
                        socket.emit('edit_message_error', 'No se pudo editar: WhatsApp puede limitar la edicion por tiempo.');
                    } else {
                        socket.emit('edit_message_error', 'No se pudo editar el mensaje.');
                    }
                }
            });
            socket.on('send_media_message', async (data) => {
                if (!guardRateLimit(socket, 'send_media_message')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar adjuntos', errorEvent: 'error' })) return;
                try {
                    const { to, body, mediaData, mimetype, filename, isPtt, quotedMessageId } = data;
                    if (isPtt) {
                        socket.emit('error', 'El envio de notas de voz esta deshabilitado temporalmente.');
                        return;
                    }
                    await waClient.sendMedia(to, mediaData, mimetype, filename, body, isPtt, quotedMessageId);
                } catch (e) {
                    socket.emit('error', 'Failed to send media.');
                }
            });

            socket.on('forward_message', async ({ messageId, toChatId }) => {
                if (!guardRateLimit(socket, 'forward_message')) return;
                if (!this.ensureTransportReady(socket, { action: 'reenviar mensajes', errorEvent: 'forward_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageForward) {
                    socket.emit('forward_message_error', 'Reenviar mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const sourceMessageId = String(messageId || '').trim();
                    const targetChatId = String(toChatId || '').trim();
                    if (!sourceMessageId || !targetChatId) {
                        socket.emit('forward_message_error', 'Datos invalidos para reenviar.');
                        return;
                    }

                    await waClient.forwardMessage(sourceMessageId, targetChatId);
                    socket.emit('message_forwarded', {
                        messageId: sourceMessageId,
                        toChatId: targetChatId
                    });
                } catch (e) {
                    socket.emit('forward_message_error', 'No se pudo reenviar el mensaje en esta version de WhatsApp.');
                }
            });

            socket.on('delete_message', async ({ chatId, messageId }) => {
                if (!guardRateLimit(socket, 'delete_message')) return;
                if (!this.ensureTransportReady(socket, { action: 'eliminar mensajes', errorEvent: 'delete_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageDelete) {
                    socket.emit('delete_message_error', 'Eliminar mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const targetMessageId = String(messageId || '').trim();
                    const incomingChatId = String(chatId || '').trim();
                    if (!targetMessageId) {
                        socket.emit('delete_message_error', 'Datos invalidos para eliminar mensaje.');
                        return;
                    }

                    let targetMessage = await waClient.getMessageById(targetMessageId);
                    if ((!targetMessage || typeof targetMessage.delete !== 'function')) {
                        const safeChatId = incomingChatId;
                        if (!safeChatId) {
                            if (!targetMessage) {
                                socket.emit('delete_message_error', 'No se encontro el chat del mensaje.');
                                return;
                            }
                        } else {
                            const chat = await waClient.client.getChatById(safeChatId);
                            const candidates = await chat.fetchMessages({ limit: 250 });
                            targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId) || targetMessage;
                        }
                    }

                    if (!targetMessage) {
                        socket.emit('delete_message_error', 'No se encontro el mensaje para eliminar.');
                        return;
                    }

                    if (typeof targetMessage.delete !== 'function') {
                        socket.emit('delete_message_error', 'Esta version no permite eliminar mensajes por API.');
                        return;
                    }

                    const targetChatId = String(incomingChatId || (targetMessage.fromMe ? targetMessage.to : targetMessage.from) || '').trim();
                    const attemptDeleteForEveryone = Boolean(targetMessage.fromMe);

                    try {
                        await targetMessage.delete(attemptDeleteForEveryone);
                    } catch (deleteErr) {
                        if (!attemptDeleteForEveryone) throw deleteErr;
                        // Fallback to local delete when revoke-for-everyone is no longer allowed.
                        await targetMessage.delete(false);
                    }

                    this.io.emit('message_deleted', {
                        chatId: targetChatId,
                        messageId: targetMessageId
                    });
                } catch (e) {
                    socket.emit('delete_message_error', 'No se pudo eliminar el mensaje.');
                }
            });
            socket.on('send_catalog_product', async (payload = {}) => {
                if (!guardRateLimit(socket, 'send_catalog_product')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar productos de catalogo', errorEvent: 'error' })) return;
                try {
                    const to = String(payload?.to || '').trim();
                    if (!to) {
                        socket.emit('error', 'Selecciona un chat antes de enviar producto.');
                        return;
                    }

                    const product = payload?.product && typeof payload.product === 'object' ? payload.product : {};
                    const caption = buildCatalogProductCaption(product);
                    const imageUrl = String(product?.imageUrl || product?.image || '').trim();

                    let sentWithImage = false;
                    if (imageUrl) {
                        const media = await fetchCatalogProductImage(imageUrl, {
                            maxBytes: Number(process.env.CATALOG_IMAGE_MAX_BYTES || 4 * 1024 * 1024),
                            timeoutMs: Number(process.env.CATALOG_IMAGE_TIMEOUT_MS || 7000)
                        });
                        if (media) {
                            const baseName = slugifyFileName(product?.title || product?.name || 'producto');
                            const filename = `${baseName}.${media.extension}`;
                            await waClient.sendMedia(to, media.mediaData, media.mimetype, filename, caption, false);
                            sentWithImage = true;
                        }
                    }

                    if (!sentWithImage) {
                        await waClient.sendMessage(to, caption);
                    }

                    socket.emit('catalog_product_sent', {
                        to,
                        title: String(product?.title || product?.name || 'Producto'),
                        withImage: sentWithImage
                    });
                } catch (e) {
                    socket.emit('error', 'No se pudo enviar el producto del catalogo.');
                }
            });

            socket.on('mark_chat_read', async (chatId) => {
                try {
                    await waClient.markAsRead(chatId);
                } catch (e) { }
            });

            // --- AI ---
            socket.on('request_ai_suggestion', (payload) => {
                if (!guardRateLimit(socket, 'request_ai_suggestion')) return;
                const { contextText, customPrompt, businessContext } = payload || {};
                // Defer to avoid blocking the event loop (prevents 'click handler took Xms' violations)
                setImmediate(async () => {
                    try {
                        const aiText = await getChatSuggestion(contextText, customPrompt, (chunk) => {
                            socket.emit('ai_suggestion_chunk', chunk);
                        }, businessContext);
                        if (typeof aiText === 'string' && aiText.startsWith('Error IA:')) {
                            socket.emit('ai_error', aiText);
                        }
                        socket.emit('ai_suggestion_complete');
                    } catch (e) {
                        console.error('AI suggestion error:', e);
                        socket.emit('ai_error', 'Error IA: no se pudo generar sugerencia.');
                        socket.emit('ai_suggestion_complete');
                    }
                });
            });

            socket.on('internal_ai_query', (payload) => {
                if (!guardRateLimit(socket, 'internal_ai_query')) return;
                const { query, businessContext } = typeof payload === 'string'
                    ? { query: payload, businessContext: null }
                    : (payload || {});
                // Defer to avoid blocking the event loop
                setImmediate(async () => {
                    try {
                        const copilotText = await askInternalCopilot(query, (chunk) => {
                            socket.emit('internal_ai_chunk', chunk);
                        }, businessContext);
                        if (typeof copilotText === 'string' && copilotText.startsWith('Error IA:')) {
                            socket.emit('internal_ai_error', copilotText);
                        }
                        socket.emit('internal_ai_complete');
                    } catch (e) {
                        console.error('Copilot error:', e);
                        socket.emit('internal_ai_error', 'Error IA: no se pudo responder en copiloto.');
                        socket.emit('internal_ai_complete');
                    }
                });
            });

            socket.on('get_business_data', async () => {
                try {
                    if (!this.ensureTransportReady(socket, { action: 'cargar datos del negocio', errorEvent: 'error' })) {
                        socket.emit('business_data', {
                            profile: null,
                            labels: [],
                            catalog: loadCatalog(),
                            catalogMeta: { source: 'local', nativeAvailable: false, wooConfigured: isWooConfigured(), wooAvailable: false }
                        });
                        return;
                    }
                    const me = waClient.client.info;
                    const meId = me.wid._serialized;

                                        // Real profile from WA account info
                    let meContact = null;
                    let profilePicUrl = null;
                    let businessProfile = null;
                    let aboutStatus = null;
                    try {
                        if (meId) meContact = await waClient.client.getContactById(meId);
                    } catch (e) { }
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                            me?.wid?.user,
                            meContact?.id?._serialized,
                            meContact?.number
                        ]);
                    } catch (e) { }
                    try { businessProfile = await waClient.getBusinessProfile(meId); } catch (e) { }
                    try {
                        if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(meContact);
                    const profile = {
                        name: me?.pushname || meContact?.name || meContact?.pushname || 'Mi Negocio',
                        pushname: me?.pushname || meContact?.pushname || null,
                        shortName: meContact?.shortName || null,
                        verifiedName: meContact?._data?.verifiedName || null,
                        verifiedLevel: meContact?._data?.verifiedLevel || null,
                        phone: me?.wid?.user || meContact?.number || null,
                        id: meId || null,
                        platform: me?.platform || null,
                        isBusiness: Boolean(meContact?.isBusiness ?? true),
                        isEnterprise: Boolean(meContact?.isEnterprise),
                        isMyContact: Boolean(meContact?.isMyContact),
                        isMe: Boolean(meContact?.isMe ?? true),
                        isWAContact: Boolean(meContact?.isWAContact ?? true),
                        status: aboutStatus || null,
                        profilePicUrl,
                        businessHours: businessDetails?.businessHours || null,
                        category: businessDetails?.category || null,
                        email: businessDetails?.email || null,
                        website: businessDetails?.website || null,
                        websites: businessDetails?.websites || [],
                        address: businessDetails?.address || null,
                        description: businessDetails?.description || null,
                        businessDetails,
                        whatsappInfo: snapshotSerializable(me),
                        contactSnapshot
                    };

                    // Real labels from WA
                    let labels = [];
                    try {
                        const raw = await waClient.getLabels();
                        labels = raw.map(l => ({ id: l.id, name: l.name, color: l.color }));
                        profile.labelsCount = labels.length;
                    } catch (e) { console.log('Labels:', e.message); }

                    // Catalog priority: WhatsApp native -> WooCommerce -> local file fallback.
                    let catalog = [];
                    let catalogMeta = {
                        source: 'native',
                        nativeAvailable: false,
                        wooConfigured: isWooConfigured(),
                        wooAvailable: false,
                        wooSource: null,
                        wooStatus: null,
                        wooReason: null
                    };

                    try {
                        const nativeProducts = await waClient.getCatalog(meId);
                        if (nativeProducts && nativeProducts.length > 0) {
                            catalog = nativeProducts.map(p => ({
                                id: p.id,
                                title: p.name,
                                price: p.price ? Number.parseFloat(String(p.price)).toFixed(2) : '0.00',
                                description: p.description,
                                imageUrl: p.imageUrls ? p.imageUrls[0] : null,
                                source: 'native'
                            }));
                            catalogMeta = {
                                source: 'native',
                                nativeAvailable: true,
                                wooConfigured: isWooConfigured(),
                                wooAvailable: false
                            };
                        }
                    } catch (e) {
                    }

                    if (!catalog.length) {
                        const wooResult = await getWooCatalog();
                        if (wooResult.products.length > 0) {
                            catalog = wooResult.products;
                            catalogMeta = {
                                source: 'woocommerce',
                                nativeAvailable: false,
                                wooConfigured: isWooConfigured(),
                                wooAvailable: true,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                        } else {
                            catalogMeta = {
                                ...catalogMeta,
                                wooConfigured: isWooConfigured(),
                                wooAvailable: false,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                        }
                    }

                    if (!catalog.length) {
                        catalog = loadCatalog();
                        catalogMeta = {
                            ...catalogMeta,
                            source: 'local',
                            nativeAvailable: false,
                            wooConfigured: isWooConfigured(),
                            wooAvailable: false
                        };
                    }


                    const catalogCategories = Array.from(new Set(
                        (catalog || [])
                            .flatMap((item) => extractCatalogItemCategories(item))
                            .map((entry) => String(entry || '').trim())
                            .filter(Boolean)
                    )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
                    catalogMeta = {
                        ...catalogMeta,
                        categories: catalogCategories
                    };
                    logCatalogDebugSnapshot({ catalog, catalogMeta });
                    socket.emit('business_data', { profile, labels, catalog, catalogMeta });
                } catch (e) {
                    console.error('Error fetching business data:', e);
                    socket.emit('business_data', {
                        profile: null,
                        labels: [],
                        catalog: loadCatalog(),
                        catalogMeta: { source: 'local', nativeAvailable: false, wooConfigured: isWooConfigured(), wooAvailable: false, wooSource: null, wooStatus: 'error', wooReason: 'Error al obtener datos de negocio' }
                    });
                }
            });

            // --- Catalog CRUD ---
            socket.on('add_product', (product) => {
                try {
                    const newProduct = addProduct(product);
                    this.io.emit('business_data_catalog', loadCatalog());
                    socket.emit('product_added', newProduct);
                } catch (e) { console.error('add_product error:', e); }
            });

            socket.on('update_product', ({ id, updates }) => {
                try {
                    const updated = updateProduct(id, updates);
                    this.io.emit('business_data_catalog', loadCatalog());
                    socket.emit('product_updated', updated);
                } catch (e) { console.error('update_product error:', e); }
            });

            socket.on('delete_product', (id) => {
                try {
                    deleteProduct(id);
                    this.io.emit('business_data_catalog', loadCatalog());
                } catch (e) { console.error('delete_product error:', e); }
            });

            socket.on('get_my_profile', async () => {
                try {
                    if (!this.ensureTransportReady(socket, { action: 'cargar perfil de empresa', errorEvent: 'error' })) {
                        socket.emit('my_profile', null);
                        return;
                    }
                    const me = waClient.client.info || {};
                    const meId = me?.wid?._serialized || null;
                    let meContact = null;
                    let profilePicUrl = null;
                    let businessProfile = null;
                    let aboutStatus = null;

                    try {
                        if (meId) meContact = await waClient.client.getContactById(meId);
                    } catch (e) { }
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                            me?.wid?.user,
                            meContact?.id?._serialized,
                            meContact?.number
                        ]);
                    } catch (e) { }
                    try {
                        businessProfile = await waClient.getBusinessProfile(meId);
                    } catch (e) { }
                    try {
                        if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(meContact);

                    socket.emit('my_profile', {
                        name: me?.pushname || meContact?.name || meContact?.pushname || null,
                        pushname: me?.pushname || meContact?.pushname || null,
                        shortName: meContact?.shortName || null,
                        verifiedName: meContact?._data?.verifiedName || null,
                        verifiedLevel: meContact?._data?.verifiedLevel || null,
                        phone: me?.wid?.user || meContact?.number || null,
                        id: meId,
                        platform: me?.platform || null,
                        profilePicUrl,
                        status: aboutStatus || null,
                        isBusiness: Boolean(meContact?.isBusiness ?? true),
                        isEnterprise: Boolean(meContact?.isEnterprise),
                        isMyContact: Boolean(meContact?.isMyContact),
                        isMe: Boolean(meContact?.isMe ?? true),
                        isWAContact: Boolean(meContact?.isWAContact ?? true),
                        category: businessDetails?.category || null,
                        email: businessDetails?.email || null,
                        website: businessDetails?.website || null,
                        websites: businessDetails?.websites || [],
                        address: businessDetails?.address || null,
                        description: businessDetails?.description || null,
                        businessHours: businessDetails?.businessHours || null,
                        businessDetails,
                        whatsappInfo: snapshotSerializable(me),
                        contactSnapshot
                    });
                } catch (e) {
                    console.error('Error fetching my profile:', e);
                }
            });

            socket.on('get_contact_info', async (contactId) => {
                try {
                    if (!this.ensureTransportReady(socket, { action: 'cargar perfil de contacto', errorEvent: 'error' })) {
                        return;
                    }
                    const safeContactId = String(contactId || '').trim();
                    if (!safeContactId) return;

                    const contact = await waClient.client.getContactById(safeContactId);
                    let chat = null;
                    let profilePicUrl = null;
                    let status = null;
                    let businessProfile = null;

                    try {
                        chat = await waClient.client.getChatById(safeContactId);
                    } catch (e) { }

                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, safeContactId, [
                            contact?.id?._serialized,
                            contact?.number,
                            contact?.number ? `${contact.number}@c.us` : null,
                            chat?.id?._serialized,
                            chat?.contact?.id?._serialized
                        ]);
                    } catch (e) { }
                    try {
                        const statusObj = await contact.getAbout();
                        status = statusObj;
                    } catch (e) { }
                    try {
                        if (contact?.isBusiness) {
                            businessProfile = await waClient.getBusinessProfile(safeContactId);
                        }
                    } catch (e) { }

                    let labels = [];
                    try {
                        const chatRef = chat || await waClient.client.getChatById(safeContactId);
                        const chatLabels = await chatRef.getLabels();
                        labels = chatLabels.map((l) => ({ id: l.id, name: l.name, color: l.color }));
                    } catch (e) { }

                    const isGroupChat = safeContactId.includes('@g.us') || Boolean(contact?.isGroup) || Boolean(chat?.isGroup);
                    let groupParticipants = [];
                    if (isGroupChat) {
                        groupParticipants = extractGroupParticipants(chat);
                        if (groupParticipants.length === 0) {
                            groupParticipants = await fetchGroupParticipantsFromStore(waClient.client, safeContactId);
                        }
                        groupParticipants = await hydrateGroupParticipantsWithContacts(waClient.client, groupParticipants);
                    }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(contact);
                    const chatSnapshot = extractChatSnapshot(chat);
                    const participantsCount = isGroupChat
                        ? (groupParticipants.length || Number(chatSnapshot?.participantsCount || 0) || 0)
                        : (chatSnapshot?.participantsCount ?? null);
                    const hydratedChatSnapshot = chatSnapshot
                        ? { ...chatSnapshot, participantsCount }
                        : null;

                    socket.emit('contact_info', {
                        id: safeContactId,
                        name: contact?.name || contact?.pushname || contact?.number || null,
                        phone: contact?.number || null,
                        number: contact?.number || null,
                        user: contact?.id?.user || null,
                        server: contact?.id?.server || null,
                        pushname: contact?.pushname || null,
                        shortName: contact?.shortName || null,
                        verifiedName: contact?._data?.verifiedName || null,
                        verifiedLevel: contact?._data?.verifiedLevel || null,
                        profilePicUrl,
                        hasProfilePic: Boolean(profilePicUrl),
                        status,
                        isBusiness: Boolean(contact?.isBusiness),
                        isEnterprise: Boolean(contact?.isEnterprise),
                        isMyContact: Boolean(contact?.isMyContact),
                        isWAContact: Boolean(contact?.isWAContact),
                        isBlocked: Boolean(contact?.isBlocked),
                        isMe: Boolean(contact?.isMe),
                        isUser: Boolean(contact?.isUser),
                        isGroup: isGroupChat,
                        isPSA: Boolean(contact?.isPSA),
                        participants: participantsCount,
                        participantsList: isGroupChat ? groupParticipants : [],
                        labels,
                        chatState: hydratedChatSnapshot,
                        businessDetails,
                        contactSnapshot,
                        raw: {
                            contact: contactSnapshot?.rawData || null,
                            chat: hydratedChatSnapshot?.rawData || null,
                            business: businessDetails?.raw || null
                        }
                    });
                } catch (e) {
                    console.error('Error fetching contact info:', e);
                }
            });

            socket.on('logout_whatsapp', async () => {
                try {
                    await waClient.client.logout();
                } catch (e) {
                    console.error('logout_whatsapp error:', e.message);
                }
                try {
                    waClient.isReady = false;
                    await waClient.initialize();
                } catch (e) {
                    console.error('reinitialize after logout failed:', e.message);
                }
                socket.emit('logout_done', { ok: true });
            });

            socket.on('disconnect', () => {
                console.log('Web client disconnected:', socket.id);
            });
        });
    }

    setupWAClientEvents() {
        waClient.on('qr', (qr) => this.io.emit('qr', qr));
        waClient.on('ready', () => {
            this.io.emit('ready', { message: 'WhatsApp Ready' });
            this.io.emit('wa_capabilities', this.getWaCapabilities());

            this.io.emit('wa_runtime', this.getWaRuntime());
        });
        waClient.on('authenticated', () => this.io.emit('authenticated'));
        waClient.on('auth_failure', (msg) => this.io.emit('auth_failure', msg));
        waClient.on('disconnected', (reason) => this.io.emit('disconnected', reason));

        waClient.on('message', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;

            const media = await mediaManager.processMessageMedia(msg);
            const senderMeta = await resolveMessageSenderMeta(msg);
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            this.io.emit('message', {
                id: msg.id._serialized,
                from: msg.from,
                to: msg.to,
                body: msg.body,
                timestamp: msg.timestamp,
                fromMe: msg.fromMe,
                hasMedia: msg.hasMedia,
                mediaData: media ? media.data : null,
                mimetype: media ? media.mimetype : null,
                filename: fileMeta.filename,
                fileSizeBytes: fileMeta.fileSizeBytes,
                ack: msg.ack,
                type: msg.type,
                author: msg?.author || msg?._data?.author || null,
                notifyName: senderMeta.notifyName,
                senderPhone: senderMeta.senderPhone,
                senderId: senderMeta.senderId,
                senderPushname: senderMeta.senderPushname,
                isGroupMessage: senderMeta.isGroupMessage,
                canEdit: false,
                order: extractOrderInfo(msg),
                location: extractLocationInfo(msg),
                quotedMessage
            });

            try {
                const relatedChatId = msg.fromMe ? msg.to : msg.from;
                if (isVisibleChatId(relatedChatId)) {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatId);
                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: false });
                    if (summary) this.io.emit('chat_updated', summary);
                }
            } catch (e) {
                // silent: message delivery should not fail by chat refresh issues
            }
        });
        waClient.on('message_sent', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;
            // Emite de vuelta para confirmar en UI si se envio desde otro lugar
            const media = await mediaManager.processMessageMedia(msg);
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            this.io.emit('message', {
                id: msg.id._serialized,
                from: msg.from,
                to: msg.to,
                body: msg.body,
                timestamp: msg.timestamp,
                fromMe: true,
                hasMedia: msg.hasMedia,
                mediaData: media ? media.data : null,
                mimetype: media ? media.mimetype : null,
                filename: fileMeta.filename,
                fileSizeBytes: fileMeta.fileSizeBytes,
                ack: msg.ack,
                type: msg.type,
                author: msg?.author || msg?._data?.author || null,
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: String(msg?.to || msg?.from || '').includes('@g.us'),
                canEdit: false,
                order: extractOrderInfo(msg),
                location: extractLocationInfo(msg),
                quotedMessage
            });

            this.emitMessageEditability(msg.id._serialized, msg.to || msg.from);
            this.scheduleEditabilityRefresh(msg.id._serialized, msg.to || msg.from);

            try {
                const relatedChatId = msg.to || msg.from;
                if (isVisibleChatId(relatedChatId)) {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatId);
                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: false });
                    if (summary) this.io.emit('chat_updated', summary);
                }
            } catch (e) { }
        });
        waClient.on('message_edit', async ({ message, newBody, prevBody }) => {
            if (!message || isStatusOrSystemMessage(message)) return;
            const chatId = message.fromMe ? message.to : message.from;
            if (!isVisibleChatId(chatId)) return;

            const messageId = message?.id?._serialized;
            if (!messageId) return;

            let canEdit = false;
            try {
                canEdit = await waClient.canEditMessageById(messageId);
            } catch (e) { }

            const editedAtMs = Number(message?.latestEditSenderTimestampMs || message?._data?.latestEditSenderTimestampMs || 0);
            const editedAt = editedAtMs > 0 ? Math.floor(editedAtMs / 1000) : Math.floor(Date.now() / 1000);

            this.io.emit('message_edited', {
                chatId,
                messageId,
                body: String(newBody ?? message.body ?? ''),
                prevBody: String(prevBody ?? ''),
                edited: true,
                editedAt,
                fromMe: Boolean(message.fromMe),
                canEdit
            });

            try {
                this.invalidateChatListCache();
                const refreshedChat = await waClient.client.getChatById(chatId);
                const summary = await this.toChatSummary(refreshedChat, { includeHeavyMeta: false });
                if (summary) this.io.emit('chat_updated', summary);
            } catch (e) { }
        });

        waClient.on('message_ack', async ({ message, ack }) => {
            const messageId = message?.id?._serialized;
            const chatId = message?.to || message?.from || '';
            const isFromMe = Boolean(message?.fromMe);

            let canEdit;
            if (isFromMe && messageId) {
                try {
                    canEdit = await waClient.canEditMessageById(messageId);
                } catch (e) { }
            }

            this.io.emit('message_ack', {
                id: messageId,
                chatId,
                ack: ack,
                canEdit
            });

            if (isFromMe && messageId) {
                this.scheduleEditabilityRefresh(messageId, chatId, [900, 2600]);
            }
        });
    }
}


module.exports = SocketManager;
