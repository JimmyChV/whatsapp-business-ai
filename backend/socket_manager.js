const { getChatSuggestion, askInternalCopilot } = require('./ai_service');
const waClient = require('./wa_provider');
const mediaManager = require('./media_manager');
const { loadCatalog, addProduct, updateProduct, deleteProduct } = require('./catalog_manager');
const { getWooCatalog, isWooConfigured } = require('./woocommerce_service');
const { listQuickReplies, addQuickReply, updateQuickReply, deleteQuickReply } = require('./quick_replies_manager');
const tenantSettingsService = require('./tenant_settings_service');
const tenantIntegrationsService = require('./tenant_integrations_service');
const tenantService = require('./tenant_service');
const planLimitsService = require('./plan_limits_service');
const aiUsageService = require('./ai_usage_service');
const messageHistoryService = require('./message_history_service');
const waModuleService = require('./wa_module_service');
const customerService = require('./customer_service');
const auditLogService = require('./audit_log_service');
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
const HISTORY_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.HISTORY_DEBUG || '').trim().toLowerCase());
const CATALOG_DEBUG_MAX_ITEMS = Math.max(1, Number(process.env.CATALOG_DEBUG_MAX_ITEMS || 120));
let catalogDebugLastSignature = '';
const SENDER_META_TTL_MS = Math.max(60 * 1000, Number(process.env.SENDER_META_TTL_MS || (10 * 60 * 1000)));
const senderMetaCache = new Map();
const GROUP_PARTICIPANT_CONTACT_TTL_MS = Math.max(5 * 60 * 1000, Number(process.env.GROUP_PARTICIPANT_CONTACT_TTL_MS || (30 * 60 * 1000)));
const groupParticipantContactCache = new Map();
const outgoingMessageAgentMeta = new Map();
const OUTGOING_AGENT_META_TTL_MS = Math.max(60 * 1000, Number(process.env.OUTGOING_AGENT_META_TTL_MS || (10 * 60 * 1000)));
const SOCKET_RBAC_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.SAAS_AUTH_ENABLED || '').trim().toLowerCase());
const WA_REQUIRE_SELECTED_MODULE = ['1', 'true', 'yes', 'on'].includes(String(process.env.WA_REQUIRE_SELECTED_MODULE || '').trim().toLowerCase());
const WA_ENFORCE_WEBJS_PHONE_MATCH = ['1', 'true', 'yes', 'on'].includes(String(process.env.WA_ENFORCE_WEBJS_PHONE_MATCH || '').trim().toLowerCase());

function guardRateLimit(socket, eventName) {
    const key = `${socket.id}:${eventName}`;
    const result = eventRateLimiter.check(key);
    if (!result.allowed) {
        socket.emit('error', `Rate limit excedido para ${eventName}. Intenta en unos segundos.`);
        return false;
    }
    return true;
}

function cleanupOutgoingAgentMeta() {
    const now = Date.now();
    for (const [messageId, entry] of outgoingMessageAgentMeta.entries()) {
        if (!entry || Number(entry.expiresAt || 0) <= now) {
            outgoingMessageAgentMeta.delete(messageId);
        }
    }
}

function rememberOutgoingAgentMeta(messageId = '', meta = null) {
    const safeId = String(messageId || '').trim();
    if (!safeId || !meta || typeof meta !== 'object') return;
    cleanupOutgoingAgentMeta();
    outgoingMessageAgentMeta.set(safeId, {
        meta,
        expiresAt: Date.now() + OUTGOING_AGENT_META_TTL_MS
    });
}

function getOutgoingAgentMeta(messageId = '') {
    const safeId = String(messageId || '').trim();
    if (!safeId) return null;
    const entry = outgoingMessageAgentMeta.get(safeId);
    if (!entry) return null;
    if (Number(entry.expiresAt || 0) <= Date.now()) {
        outgoingMessageAgentMeta.delete(safeId);
        return null;
    }
    return entry.meta && typeof entry.meta === 'object' ? entry.meta : null;
}

function getSerializedMessageId(message = null) {
    if (!message) return '';
    if (typeof message === 'string') return String(message).trim();

    const candidates = [
        message?.id?._serialized,
        message?.id?.id,
        message?.id,
        message?._data?.id,
        message?.key?.id,
        message?.messageId,
        message?.message_id,
        message?.messages?.[0]?.id
    ];

    for (const candidate of candidates) {
        const safe = String(candidate || '').trim();
        if (safe) return safe;
    }

    return '';
}

function buildSocketAgentMeta(authContext = null, moduleContext = null) {
    if (!authContext || typeof authContext !== 'object') return null;
    const userId = String(authContext?.userId || authContext?.id || '').trim();
    const email = String(authContext?.email || '').trim() || null;
    const role = String(authContext?.role || '').trim().toLowerCase() || null;
    const name = String(authContext?.name || authContext?.displayName || email || userId || '').trim() || null;
    if (!userId && !email && !name) return null;

    return {
        sentByUserId: userId || null,
        sentByName: name,
        sentByEmail: email,
        sentByRole: role,
        sentViaModuleId: String(moduleContext?.moduleId || '').trim() || null,
        sentViaModuleName: String(moduleContext?.name || '').trim() || null,
        sentViaTransport: String(moduleContext?.transportMode || '').trim().toLowerCase() || null,
        sentViaPhoneNumber: coerceHumanPhone(moduleContext?.phoneNumber || moduleContext?.phone || '') || null,
        sentViaChannelType: String(moduleContext?.channelType || '').trim().toLowerCase() || null
    };
}

function sanitizeAgentMeta(agentMeta = null) {
    if (!agentMeta || typeof agentMeta !== 'object') return null;
    const out = {};
    ['sentByUserId', 'sentByName', 'sentByEmail', 'sentByRole', 'sentViaModuleId', 'sentViaModuleName', 'sentViaTransport', 'sentViaPhoneNumber', 'sentViaChannelType'].forEach((key) => {
        const value = String(agentMeta?.[key] || '').trim();
        if (value) out[key] = value;
    });
    return Object.keys(out).length > 0 ? out : null;
}

function buildModuleAttributionMeta(moduleContext = null) {
    if (!moduleContext || typeof moduleContext !== 'object') return null;
    const sentViaModuleId = String(moduleContext?.moduleId || '').trim().toLowerCase() || null;
    const sentViaModuleName = String(moduleContext?.name || '').trim() || null;
    const sentViaTransport = String(moduleContext?.transportMode || '').trim().toLowerCase() || null;
    const sentViaPhoneNumber = coerceHumanPhone(
        moduleContext?.phoneNumber
        || moduleContext?.phone
        || ''
    ) || null;
    const sentViaChannelType = String(moduleContext?.channelType || '').trim().toLowerCase() || null;

    if (!sentViaModuleId && !sentViaModuleName && !sentViaTransport && !sentViaPhoneNumber && !sentViaChannelType) {
        return null;
    }

    return {
        sentViaModuleId,
        sentViaModuleName,
        sentViaTransport,
        sentViaPhoneNumber,
        sentViaChannelType
    };
}


async function resolveSocketModuleContext(tenantId = 'default', authContext = null, requestedModuleId = '') {
    const cleanTenantId = String(tenantId || 'default').trim() || 'default';
    const userId = String(authContext?.userId || authContext?.id || '').trim();
    const normalizedRequestedId = String(requestedModuleId || '').trim().toLowerCase();

    const modules = await waModuleService.listModules(cleanTenantId, {
        includeInactive: false,
        userId
    });

    if (!Array.isArray(modules) || modules.length === 0) {
        return { modules: [], selected: null };
    }

    let selected = null;
    if (normalizedRequestedId) {
        selected = modules.find((module) => String(module?.moduleId || '').trim().toLowerCase() === normalizedRequestedId) || null;
    }
    if (!selected) {
        selected = modules.find((module) => module?.isSelected) || modules.find((module) => module?.isDefault) || modules[0] || null;
    }

    return {
        modules,
        selected: selected || null
    };
}

function buildWebjsSessionNamespaceFromIds(tenantId = 'default', moduleId = 'default') {
    const cleanTenant = String(tenantId || 'default')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'default';
    const cleanModule = String(moduleId || 'default')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30) || 'default';
    return String(cleanTenant + '__' + cleanModule)
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'default';
}
function mergeAgentMeta(...candidates) {
    const merged = {};
    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') continue;
        const normalized = sanitizeAgentMeta(candidate);
        if (!normalized) continue;
        Object.assign(merged, normalized);
    }
    return Object.keys(merged).length > 0 ? merged : null;
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

    const mediaUrl = String(downloadedMedia?.publicUrl || downloadedMedia?.storedPublicUrl || '').trim() || null;
    const mediaPath = String(downloadedMedia?.relativePath || downloadedMedia?.storedRelativePath || '').trim() || null;

    return {
        filename,
        mimetype: mimetype || null,
        fileSizeBytes,
        mediaUrl,
        mediaPath
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

function looksLikeSamePhoneDigits(a = '', b = '') {
    const left = normalizePhoneDigits(a);
    const right = normalizePhoneDigits(b);
    if (!left || !right) return false;
    return left === right || left.endsWith(right) || right.endsWith(left);
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

function resolveCloudDestinationChatId(chatId = '', explicitPhone = '') {
    const byExplicit = coerceHumanPhone(explicitPhone || '');
    if (byExplicit) return `${byExplicit}@c.us`;

    const fromChatId = String(chatId || '').trim();
    const fromChatDigits = coerceHumanPhone(fromChatId.split('@')[0] || '');
    if (fromChatDigits) return `${fromChatDigits}@c.us`;

    return null;
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
        this.activeRuntimeContext = {
            tenantId: 'default',
            moduleId: 'default',
            transportMode: 'idle',
            webjsNamespace: typeof waClient.getWebjsSessionNamespace === 'function' ? waClient.getWebjsSessionNamespace() : null,
            updatedAt: Date.now()
        };
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
            availableTransports: Array.isArray(runtime?.availableTransports) ? runtime.availableTransports : ['cloud'],
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


    async isFeatureEnabledForTenant(tenantId = 'default', featureKey = '') {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const tenant = tenantService.findTenantById(cleanTenantId) || tenantService.DEFAULT_TENANT;
        const tenantSettings = await tenantSettingsService.getTenantSettings(cleanTenantId);
        return planLimitsService.isFeatureEnabledForTenant(featureKey, tenant, tenantSettings);
    }

    async reserveAiQuota(tenantId = 'default', { socket = null } = {}) {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const tenant = tenantService.findTenantById(cleanTenantId) || tenantService.DEFAULT_TENANT;
        const tenantSettings = await tenantSettingsService.getTenantSettings(cleanTenantId);

        const aiEnabled = planLimitsService.isFeatureEnabledForTenant('aiPro', tenant, tenantSettings);
        if (!aiEnabled) {
            if (socket) socket.emit('ai_error', 'La IA esta deshabilitada para esta empresa o plan.');
            return { ok: false, reason: 'disabled' };
        }

        const limits = planLimitsService.getTenantPlanLimits(tenant);
        const used = await aiUsageService.getMonthlyUsage(cleanTenantId);
        const limit = Number(limits?.maxMonthlyAiRequests || 0);

        if (Number.isFinite(limit) && limit > 0 && used >= limit) {
            if (socket) {
                socket.emit('ai_error', 'Se alcanzo el limite mensual de IA (' + limit + ') para el plan ' + (tenant.plan || 'starter') + '.');
            }
            return { ok: false, reason: 'quota_exceeded', used, limit };
        }

        const next = await aiUsageService.incrementMonthlyUsage(cleanTenantId, { incrementBy: 1 });
        return { ok: true, used: next, limit };
    }

    getTenantRoom(tenantId = 'default') {
        const cleanTenant = String(tenantId || 'default').trim() || 'default';
        return 'tenant:' + cleanTenant;
    }

    emitToTenant(tenantId, eventName, payload) {
        this.io.to(this.getTenantRoom(tenantId)).emit(eventName, payload);
    }

    getTenantModuleRoom(tenantId = 'default', moduleId = 'default') {
        const cleanTenant = String(tenantId || 'default').trim() || 'default';
        const cleanModule = String(moduleId || 'default').trim().toLowerCase() || 'default';
        return 'tenant:' + cleanTenant + ':module:' + cleanModule;
    }

    emitToTenantModule(tenantId, moduleId, eventName, payload) {
        this.io.to(this.getTenantModuleRoom(tenantId, moduleId)).emit(eventName, payload);
    }

        setActiveRuntimeContext({
        tenantId = 'default',
        moduleId = 'default',
        moduleName = null,
        modulePhone = null,
        channelType = null,
        transportMode = 'idle',
        webjsNamespace = null
    } = {}) {
        this.activeRuntimeContext = {
            tenantId: String(tenantId || 'default').trim() || 'default',
            moduleId: String(moduleId || 'default').trim().toLowerCase() || 'default',
            moduleName: String(moduleName || '').trim() || null,
            modulePhone: coerceHumanPhone(modulePhone || '') || null,
            channelType: String(channelType || '').trim().toLowerCase() || null,
            transportMode: String(transportMode || 'idle').trim().toLowerCase() || 'idle',
            webjsNamespace: String(webjsNamespace || '').trim() || null,
            updatedAt: Date.now()
        };
    }

    resolveRuntimeEventTarget() {
        const context = this.activeRuntimeContext && typeof this.activeRuntimeContext === 'object'
            ? this.activeRuntimeContext
            : null;

        if (context?.tenantId && context?.moduleId) {
            return { tenantId: context.tenantId, moduleId: context.moduleId };
        }

        const socketsMap = this.io?.sockets?.sockets;
        const sockets = socketsMap ? Array.from(socketsMap.values()) : [];
        const seen = new Set();
        let candidate = null;
        sockets.forEach((socket) => {
            const tenant = String(socket?.data?.tenantId || '').trim();
            const module = String(socket?.data?.waModuleId || '').trim().toLowerCase();
            if (!tenant || !module) return;
            const key = tenant + '::' + module;
            seen.add(key);
            if (!candidate) {
                candidate = { tenantId: tenant, moduleId: module };
            }
        });

        if (seen.size === 1 && candidate) return candidate;
        return candidate;
    }

    emitToRuntimeContext(eventName, payload) {
        const target = this.resolveRuntimeEventTarget();
        if (target?.tenantId) {
            this.emitToTenant(target.tenantId, eventName, payload);
            return;
        }
        this.io.emit(eventName, payload);
    }

    async enforceRuntimeWebjsPhonePolicy() {
        if (!WA_ENFORCE_WEBJS_PHONE_MATCH) return true;

        const runtime = this.getWaRuntime();
        const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
        if (activeTransport !== 'webjs') return true;

        const target = this.resolveRuntimeEventTarget();
        if (!target?.tenantId || !target?.moduleId) return true;

        const moduleConfig = await waModuleService.getModule(target.tenantId, target.moduleId).catch(() => null);
        const registeredPhone = normalizePhoneDigits(moduleConfig?.phoneNumber || '');
        if (!registeredPhone) return true;

        const connectedPhone = normalizePhoneDigits(waClient?.client?.info?.wid?.user || '');
        if (!connectedPhone) return true;

        if (looksLikeSamePhoneDigits(registeredPhone, connectedPhone)) return true;

        const warning = 'Numero no permitido para este modulo. Registrado: +' + registeredPhone + '. Escaneado: +' + connectedPhone + '.';
        this.emitToTenantModule(target.tenantId, target.moduleId, 'auth_failure', warning);

        try {
            await waClient.client.logout();
        } catch (_) { }

        try {
            waClient.isReady = false;
            await waClient.initialize();
        } catch (_) { }

        return false;
    }

    async persistMessageHistory(tenantId, {
        msg,
        senderMeta = null,
        fileMeta = null,
        order = null,
        location = null,
        quotedMessage = null,
        agentMeta = null,
        moduleContext = null
    } = {}) {
        try {
            if (!msg) return;
            const messageId = getSerializedMessageId(msg);
            const chatId = String(msg?.fromMe ? msg?.to : msg?.from || '').trim();
            if (!messageId || !chatId) return;

            const persistedAgentMeta = sanitizeAgentMeta(agentMeta);
            const historyModuleId = String(
                moduleContext?.moduleId
                || persistedAgentMeta?.sentViaModuleId
                || ''
            ).trim().toLowerCase() || null;
            const historyModulePhone = coerceHumanPhone(
                moduleContext?.phoneNumber
                || moduleContext?.phone
                || ''
            ) || null;
            const moduleAttributionMeta = buildModuleAttributionMeta(moduleContext);
            await messageHistoryService.upsertMessage(tenantId, {
                messageId,
                chatId,
                fromMe: Boolean(msg?.fromMe),
                senderId: senderMeta?.senderId || null,
                senderPhone: senderMeta?.senderPhone || null,
                waModuleId: historyModuleId,
                waPhoneNumber: historyModulePhone,
                authorId: String(msg?.author || msg?._data?.author || '').trim() || null,
                body: msg?.body || '',
                messageType: msg?.type || null,
                timestampUnix: Number(msg?.timestamp || 0) || Math.floor(Date.now() / 1000),
                ack: Number.isFinite(Number(msg?.ack)) ? Number(msg?.ack) : null,
                edited: false,
                hasMedia: Boolean(msg?.hasMedia),
                mediaMime: fileMeta?.mimetype || null,
                mediaFilename: fileMeta?.filename || null,
                mediaSizeBytes: Number(fileMeta?.fileSizeBytes || 0) || null,
                quotedMessageId: quotedMessage?.id || null,
                orderPayload: order && typeof order === 'object' ? order : null,
                locationPayload: location && typeof location === 'object' ? location : null,
                metadata: {
                    notifyName: senderMeta?.notifyName || null,
                    senderPushname: senderMeta?.senderPushname || null,
                    isGroupMessage: Boolean(senderMeta?.isGroupMessage),
                    media: {
                        url: fileMeta?.mediaUrl || null,
                        path: fileMeta?.mediaPath || null
                    },
                    sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || persistedAgentMeta?.sentViaModuleId || historyModuleId || null,
                    sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || persistedAgentMeta?.sentViaModuleName || null,
                    sentViaTransport: moduleAttributionMeta?.sentViaTransport || persistedAgentMeta?.sentViaTransport || null,
                    sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || historyModulePhone || null,
                    sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                    ...(persistedAgentMeta || {})
                },
                chat: {
                    id: chatId,
                    displayName: senderMeta?.notifyName || null,
                    phone: senderMeta?.senderPhone || null,
                    subtitle: senderMeta?.senderPushname || null
                }
            });

            const customerPhone = coerceHumanPhone(
                senderMeta?.senderPhone
                || chatId.split('@')[0]
                || ''
            );
            if (customerPhone) {
                await customerService.upsertFromInteraction(tenantId, {
                    moduleId: historyModuleId,
                    chatId,
                    phone: customerPhone,
                    contactName: senderMeta?.notifyName || senderMeta?.senderPushname || null,
                    direction: msg?.fromMe ? 'outbound' : 'inbound',
                    messageType: msg?.type || null,
                    lastMessageAt: new Date().toISOString(),
                    metadata: {
                        senderId: senderMeta?.senderId || null,
                        senderPushname: senderMeta?.senderPushname || null,
                        waPhoneNumber: historyModulePhone,
                        fromMe: Boolean(msg?.fromMe)
                    }
                });
            }
            if (HISTORY_DEBUG_ENABLED) {
                console.info('[History] persist message ok tenant=' + String(tenantId || 'default') + ' chat=' + String(chatId || '') + ' msg=' + String(messageId || '') + ' module=' + String(historyModuleId || 'n/a'));
            }
        } catch (error) {
            console.warn('[History] persistMessageHistory failed:', String(error?.message || error));
        }
    }
    async persistMessageEdit(tenantId, {
        messageId,
        chatId,
        body,
        editedAtUnix
    } = {}) {
        try {
            await messageHistoryService.updateMessageEdit(tenantId, {
                messageId,
                chatId,
                body,
                editedAtUnix
            });
        } catch (error) {
            console.warn('[History] persistMessageEdit failed:', String(error?.message || error));
        }
    }

    async persistMessageAck(tenantId, {
        messageId,
        chatId,
        ack
    } = {}) {
        try {
            await messageHistoryService.updateMessageAck(tenantId, {
                messageId,
                chatId,
                ack
            });
        } catch (error) {
            console.warn('[History] persistMessageAck failed:', String(error?.message || error));
        }
    }

    resolveHistoryTenantId() {
        try {
            const runtimeTarget = this.resolveRuntimeEventTarget();
            if (runtimeTarget?.tenantId) return runtimeTarget.tenantId;
            const socketsMap = this.io?.sockets?.sockets;
            const entries = socketsMap ? Array.from(socketsMap.values()) : [];
            if (!entries.length) return 'default';
            const tenants = new Set(entries.map((socket) => String(socket?.data?.tenantId || 'default').trim() || 'default'));
            if (tenants.size === 1) return Array.from(tenants)[0] || 'default';
            return String(this.activeRuntimeContext?.tenantId || 'default').trim() || 'default';
        } catch (error) {
            return 'default';
        }
    }

    resolveHistoryModuleContext() {
        const runtimeContext = this.activeRuntimeContext && typeof this.activeRuntimeContext === 'object'
            ? this.activeRuntimeContext
            : {};
        const runtimeTarget = this.resolveRuntimeEventTarget();
        const moduleId = String(runtimeTarget?.moduleId || runtimeContext?.moduleId || '').trim().toLowerCase() || null;
        const phoneNumber = coerceHumanPhone(runtimeContext?.modulePhone || '') || null;
        const moduleName = String(runtimeContext?.moduleName || '').trim() || null;
        const transportMode = String(runtimeContext?.transportMode || this.getWaRuntime()?.activeTransport || '').trim().toLowerCase() || null;
        const channelType = String(runtimeContext?.channelType || '').trim().toLowerCase() || null;

        return {
            moduleId,
            phoneNumber,
            name: moduleName,
            transportMode,
            channelType
        };
    }

    normalizeHistoryLabels(labels = []) {
        if (!Array.isArray(labels)) return [];
        const seen = new Set();
        const normalized = [];
        for (const label of labels) {
            if (!label) continue;
            const id = String(label?.id || '').trim();
            const name = String(label?.name || '').trim();
            const key = `${id}:${name}`.toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            normalized.push({
                id: id || null,
                name: name || (id || ''),
                color: label?.color || null
            });
        }
        return normalized;
    }

    toHistoryChatSummary(entry = {}) {
        const chatId = String(entry?.chatId || '').trim();
        if (!chatId || !isVisibleChatId(chatId)) return null;

        const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
        const subtitle = String(entry?.subtitle || metadata?.senderPushname || '').trim() || null;
        const explicitPhone = coerceHumanPhone(entry?.phone || '');
        const idPhone = isLidIdentifier(chatId) ? null : coerceHumanPhone(chatId.split('@')[0] || '');
        const subtitlePhone = coerceHumanPhone(extractPhoneFromText(subtitle || '') || '');
        const phone = explicitPhone || subtitlePhone || idPhone || null;

        const displayName = String(entry?.displayName || metadata?.notifyName || '').trim();
        const fallbackName = displayName || subtitle || (phone ? `+${phone}` : 'Contacto');

        const labels = this.normalizeHistoryLabels(metadata?.labels || []);
        const profilePicUrl = String(metadata?.profilePicUrl || '').trim() || null;

        const lastMessageModuleId = String(entry?.lastMessageModuleId || metadata?.sentViaModuleId || '').trim().toLowerCase() || null;
        const lastMessageModuleName = String(entry?.lastMessageModuleName || metadata?.sentViaModuleName || '').trim() || null;
        const lastMessageTransport = String(entry?.lastMessageTransport || metadata?.sentViaTransport || '').trim().toLowerCase() || null;
        const lastMessageChannelType = String(entry?.lastMessageChannelType || metadata?.sentViaChannelType || '').trim().toLowerCase() || null;

        return {
            id: chatId,
            name: fallbackName,
            phone,
            subtitle,
            unreadCount: Number(entry?.unreadCount || 0) || 0,
            timestamp: Number(entry?.lastMessageAt || 0) || 0,
            lastMessage: String(entry?.lastMessageBody || metadata?.lastMessage || '').trim(),
            lastMessageFromMe: Boolean(entry?.lastMessageFromMe),
            ack: Number.isFinite(Number(entry?.lastMessageAck)) ? Number(entry.lastMessageAck) : 0,
            labels,
            profilePicUrl,
            isMyContact: Boolean(metadata?.isMyContact),
            lastMessageModuleId,
            lastMessageModuleName,
            lastMessageTransport,
            lastMessageChannelType,
            archived: Boolean(entry?.archived)
        };
    }

    historySummaryMatches(summary = {}, { queryLower = '', queryDigits = '', filters = {} } = {}) {
        if (!summary || typeof summary !== 'object') return false;

        const name = String(summary?.name || '').toLowerCase();
        const subtitle = String(summary?.subtitle || '').toLowerCase();
        const lastMessage = String(summary?.lastMessage || '').toLowerCase();
        const phone = normalizePhoneDigits(summary?.phone || '');
        const idDigits = normalizePhoneDigits(String(summary?.id || '').split('@')[0] || '');

        if (queryDigits) {
            const byPhone = phone.includes(queryDigits);
            const byId = idDigits.includes(queryDigits);
            if (!byPhone && !byId) return false;
        } else if (queryLower) {
            const byText = name.includes(queryLower) || subtitle.includes(queryLower) || lastMessage.includes(queryLower);
            if (!byText) return false;
        }

        const unreadOnly = Boolean(filters?.unreadOnly);
        const unlabeledOnly = Boolean(filters?.unlabeledOnly);
        const contactMode = ['all', 'my', 'unknown'].includes(String(filters?.contactMode || 'all'))
            ? String(filters?.contactMode || 'all')
            : 'all';
        const archivedMode = ['all', 'archived', 'active'].includes(String(filters?.archivedMode || 'all'))
            ? String(filters?.archivedMode || 'all')
            : 'all';
        const labelTokens = normalizeFilterTokens(filters?.labelTokens);

        if (unreadOnly && Number(summary?.unreadCount || 0) <= 0) return false;
        if (contactMode === 'my' && !summary?.isMyContact) return false;
        if (contactMode === 'unknown' && summary?.isMyContact) return false;
        if (archivedMode === 'archived' && !summary?.archived) return false;
        if (archivedMode === 'active' && summary?.archived) return false;

        const labels = Array.isArray(summary?.labels) ? summary.labels : [];
        if (unlabeledOnly && labels.length > 0) return false;
        if (!unlabeledOnly && labelTokens.length > 0) {
            const labelTokenSet = toLabelTokenSet(labels);
            if (!matchesTokenSet(labelTokenSet, labelTokens)) return false;
        }

        return true;
    }

    async getHistoryChatsPage(tenantId, {
        offset = 0,
        limit = 80,
        query = '',
        filters = {},
        filterKey = ''
    } = {}) {
        const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
        const safeLimit = Number.isFinite(Number(limit)) ? Math.min(250, Math.max(20, Math.floor(Number(limit)))) : 80;
        const queryText = String(query || '').trim();
        const queryLower = queryText.toLowerCase();
        const queryDigits = normalizePhoneDigits(queryText);

        const allRows = [];
        let cursor = 0;
        const batchSize = 500;
        const maxRows = Math.max(1000, Number(process.env.HISTORY_FALLBACK_MAX_CHATS || 3000));

        while (allRows.length < maxRows) {
            const batch = await messageHistoryService.listChats(tenantId, { limit: batchSize, offset: cursor });
            if (!Array.isArray(batch) || batch.length === 0) break;
            allRows.push(...batch);
            cursor += batch.length;
            if (batch.length < batchSize) break;
        }

        const normalized = allRows
            .map((entry) => this.toHistoryChatSummary(entry))
            .filter(Boolean)
            .filter((summary) => this.historySummaryMatches(summary, {
                queryLower,
                queryDigits,
                filters
            }))
            .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)));

        const pageItems = normalized.slice(safeOffset, safeOffset + safeLimit);
        const nextOffset = safeOffset + pageItems.length;
        const total = normalized.length;
        const hasMore = nextOffset < total;

        return {
            items: pageItems,
            offset: safeOffset,
            limit: safeLimit,
            total,
            hasMore,
            nextOffset,
            query: queryText,
            filters,
            filterKey,
            source: 'history_fallback'
        };
    }

    toHistoryMessagePayload(row = {}, chatId = '') {
        const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        const senderId = String(row?.senderId || row?.authorId || '').trim() || null;
        const senderPhone = coerceHumanPhone(row?.senderPhone || (senderId ? senderId.split('@')[0] : '') || '') || null;
        const timestamp = Number(row?.timestampUnix || 0) || Math.floor(Date.now() / 1000);
        const type = String(row?.messageType || 'chat').trim() || 'chat';
        const fromMe = Boolean(row?.fromMe);

        return {
            id: String(row?.messageId || '').trim(),
            from: fromMe ? 'me@localhost' : (senderId || chatId),
            to: fromMe ? chatId : null,
            body: row?.body === null || row?.body === undefined ? '' : String(row.body),
            timestamp,
            fromMe,
            hasMedia: Boolean(row?.hasMedia),
            mediaData: null,
            mimetype: row?.mediaMime || null,
            filename: row?.mediaFilename || null,
            fileSizeBytes: Number.isFinite(Number(row?.mediaSizeBytes)) ? Number(row.mediaSizeBytes) : null,
            mediaUrl: String(metadata?.media?.url || '').trim() || null,
            mediaPath: String(metadata?.media?.path || '').trim() || null,
            type,
            author: row?.authorId || null,
            notifyName: String(metadata?.notifyName || '').trim() || null,
            senderPhone,
            senderId,
            senderPushname: String(metadata?.senderPushname || '').trim() || null,
            isGroupMessage: Boolean(metadata?.isGroupMessage || String(chatId || '').endsWith('@g.us')),
            sentByUserId: String(metadata?.sentByUserId || '').trim() || null,
            sentByName: String(metadata?.sentByName || '').trim() || null,
            sentByEmail: String(metadata?.sentByEmail || '').trim() || null,
            sentByRole: String(metadata?.sentByRole || '').trim() || null,
            sentViaModuleId: String(row?.waModuleId || metadata?.sentViaModuleId || '').trim() || null,
            sentViaPhoneNumber: String(row?.waPhoneNumber || '').trim() || null,
            sentViaModuleName: String(metadata?.sentViaModuleName || '').trim() || null,
            sentViaTransport: String(metadata?.sentViaTransport || '').trim() || null,
            sentViaChannelType: String(metadata?.sentViaChannelType || '').trim() || null,
            ack: Number.isFinite(Number(row?.ack)) ? Number(row.ack) : 0,
            edited: Boolean(row?.edited),
            editedAt: Number(row?.editedAtUnix || 0) || null,
            canEdit: false,
            order: row?.orderPayload && typeof row.orderPayload === 'object' ? row.orderPayload : null,
            location: row?.locationPayload && typeof row.locationPayload === 'object' ? row.locationPayload : null,
            quotedMessage: row?.quotedMessageId ? { id: String(row.quotedMessageId), body: '', fromMe: false } : null
        };
    }

    async getHistoryChatHistory(tenantId, { chatId = '', limit = 60 } = {}) {
        const requestedChatId = String(chatId || '').trim();
        const safeLimit = Number.isFinite(Number(limit)) ? Math.min(300, Math.max(20, Math.floor(Number(limit)))) : 60;

        let resolvedChatId = requestedChatId;
        let rows = requestedChatId
            ? await messageHistoryService.listMessages(tenantId, { chatId: requestedChatId, limit: safeLimit })
            : [];

        if ((!Array.isArray(rows) || rows.length === 0) && requestedChatId) {
            const digits = normalizePhoneDigits(requestedChatId.split('@')[0] || '');
            if (digits) {
                const candidates = await messageHistoryService.listChats(tenantId, { limit: 500, offset: 0 });
                const candidate = (Array.isArray(candidates) ? candidates : []).find((entry) => {
                    const phoneDigits = normalizePhoneDigits(entry?.phone || '');
                    const idDigits = normalizePhoneDigits(String(entry?.chatId || '').split('@')[0] || '');
                    return (phoneDigits && (phoneDigits === digits || phoneDigits.endsWith(digits) || digits.endsWith(phoneDigits)))
                        || (idDigits && (idDigits === digits || idDigits.endsWith(digits) || digits.endsWith(idDigits)));
                });
                if (candidate?.chatId) {
                    resolvedChatId = String(candidate.chatId);
                    rows = await messageHistoryService.listMessages(tenantId, { chatId: resolvedChatId, limit: safeLimit });
                }
            }
        }

        const messages = (Array.isArray(rows) ? rows : [])
            .slice()
            .sort((a, b) => {
                const aTs = Number(a?.timestampUnix || 0);
                const bTs = Number(b?.timestampUnix || 0);
                if (aTs !== bTs) return aTs - bTs;
                return String(a?.messageId || '').localeCompare(String(b?.messageId || ''));
            })
            .map((row) => this.toHistoryMessagePayload(row, resolvedChatId || requestedChatId))
            .filter((msg) => Boolean(msg?.id));

        return {
            chatId: resolvedChatId || requestedChatId,
            requestedChatId,
            messages,
            source: 'history_fallback'
        };
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
            const message = `Cloud API aun no esta lista para ${action}.`;
            socket.emit(errorEvent, message);
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
            this.emitToRuntimeContext('message_editability', {
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
            const userRole = String(authContext?.role || '').trim().toLowerCase() || 'seller';
            const roleWeight = { seller: 1, admin: 2, owner: 3 };
            const effectiveRoleWeight = roleWeight[userRole] || 0;

            const requireRole = (allowedRoles = [], {
                errorEvent = 'permission_error',
                action = 'realizar esta accion'
            } = {}) => {
                if (!SOCKET_RBAC_ENABLED) return true;
                const allowSet = new Set((Array.isArray(allowedRoles) ? allowedRoles : [])
                    .map((role) => String(role || '').trim().toLowerCase())
                    .filter(Boolean));
                if (allowSet.size === 0) return true;
                if (!authContext) {
                    socket.emit(errorEvent, 'No autorizado para ' + action + '. Inicia sesion nuevamente.');
                    return false;
                }
                const minimumWeight = Math.min(...Array.from(allowSet)
                    .map((role) => roleWeight[role] || 999)
                    .filter((weight) => Number.isFinite(weight)));
                if (effectiveRoleWeight >= minimumWeight) return true;
                socket.emit(errorEvent, 'No tienes permisos para ' + action + '.');
                return false;
            };

            const auditSocketAction = async (action = '', {
                resourceType = 'socket',
                resourceId = null,
                payload = {}
            } = {}) => {
                try {
                    await auditLogService.writeAuditLog(tenantId, {
                        userId: authContext?.userId || null,
                        userEmail: authContext?.email || null,
                        role: userRole,
                        action: String(action || '').trim() || 'socket.action',
                        resourceType,
                        resourceId,
                        source: 'socket',
                        socketId: socket.id,
                        payload
                    });
                } catch (_) { }
            };

            const normalizeSocketModuleId = (value = '') => String(value || '').trim().toLowerCase();
            const getRequestedModuleIdFromSocket = () => normalizeSocketModuleId(
                socket?.handshake?.auth?.waModuleId
                || socket?.handshake?.auth?.moduleId
                || socket?.handshake?.query?.waModuleId
                || socket?.handshake?.query?.moduleId
                || ''
            );

            const getActiveCatalogScope = () => {
                const selectedModuleContext = socket?.data?.waModule || null;
                return {
                    tenantId,
                    moduleId: String(selectedModuleContext?.moduleId || '').trim() || null,
                    channelType: String(selectedModuleContext?.channelType || '').trim().toLowerCase() || null
                };
            };

            const resolveCatalogScope = async ({ requestedModuleId = '' } = {}) => {
                const normalizedRequested = normalizeSocketModuleId(requestedModuleId);
                if (!normalizedRequested) return getActiveCatalogScope();

                const activeModuleId = normalizeSocketModuleId(
                    socket?.data?.waModule?.moduleId
                    || socket?.data?.waModuleId
                    || ''
                );
                if (activeModuleId && activeModuleId === normalizedRequested) {
                    return getActiveCatalogScope();
                }

                const userId = String(authContext?.userId || authContext?.id || '').trim();
                const allowedModules = await waModuleService.listModules(tenantId, {
                    includeInactive: false,
                    userId
                });
                const selected = (Array.isArray(allowedModules) ? allowedModules : [])
                    .find((entry) => normalizeSocketModuleId(entry?.moduleId) === normalizedRequested);
                if (!selected) {
                    throw new Error('No tienes acceso al modulo solicitado para catalogo.');
                }

                return {
                    tenantId,
                    moduleId: String(selected?.moduleId || '').trim() || null,
                    channelType: String(selected?.channelType || '').trim().toLowerCase() || null
                };
            };
            const emitWaModuleContext = async ({ requestedModuleId = '' } = {}) => {
                const cleanRequested = normalizeSocketModuleId(requestedModuleId || getRequestedModuleIdFromSocket());
                const moduleContext = await resolveSocketModuleContext(tenantId, authContext, cleanRequested);
                const selected = moduleContext?.selected || null;
                const modules = Array.isArray(moduleContext?.modules) ? moduleContext.modules : [];

                socket.data = socket.data || {};
                socket.data.waModule = selected;
                socket.data.waModuleId = selected?.moduleId || '';
                socket.data.waModules = modules;

                const previousModuleRoom = String(socket?.data?.waModuleRoom || '').trim();
                const nextModuleId = selected?.moduleId || 'default';
                const nextModuleRoom = this.getTenantModuleRoom(tenantId, nextModuleId);
                if (previousModuleRoom && previousModuleRoom !== nextModuleRoom) {
                    socket.leave(previousModuleRoom);
                }
                if (nextModuleRoom && previousModuleRoom !== nextModuleRoom) {
                    socket.join(nextModuleRoom);
                }
                socket.data.waModuleRoom = nextModuleRoom;

                const payload = {
                    tenantId,
                    items: modules,
                    selected
                };
                socket.emit('wa_module_context', payload);
                return payload;
            };

            const applyCloudConfigForModule = async (selectedModule = null) => {
                if (!selectedModule || typeof selectedModule !== 'object') return null;
                if (String(selectedModule?.transportMode || '').trim().toLowerCase() !== 'cloud') return null;
                if (typeof waModuleService.resolveModuleCloudConfig !== 'function') return null;
                if (typeof waClient.setCloudRuntimeConfig !== 'function') return null;

                let moduleForRuntime = selectedModule;
                try {
                    const moduleId = String(selectedModule?.moduleId || '').trim();
                    if (moduleId && typeof waModuleService.getModuleRuntime === 'function') {
                        const runtimeModule = await waModuleService.getModuleRuntime(tenantId, moduleId);
                        if (runtimeModule) moduleForRuntime = runtimeModule;
                    }
                } catch (_) {
                    // fallback: usar modulo actual de contexto
                }

                const runtimeCloudConfig = waModuleService.resolveModuleCloudConfig(moduleForRuntime);
                waClient.setCloudRuntimeConfig(runtimeCloudConfig || {});
                return runtimeCloudConfig || null;
            };

            const ensureTransportForSelectedModule = async (selectedModule = null) => {
                const moduleTransport = String(selectedModule?.transportMode || '').trim().toLowerCase();
                if (moduleTransport !== 'cloud') return null;
                await applyCloudConfigForModule(selectedModule);

                const namespaceChanged = false;

                let runtime = this.getWaRuntime();
                const activeTransport = String(runtime?.activeTransport || 'idle').trim().toLowerCase();

                if (activeTransport === moduleTransport) {
                    if (namespaceChanged) {
                        try {
                            await waClient.initialize();
                        } catch (_) { }
                        runtime = this.getWaRuntime();
                    }

                    this.invalidateChatListCache();
                    this.contactListCache = { items: [], updatedAt: 0 };
                    this.emitWaCapabilities(socket);
                    socket.emit('transport_mode_set', runtime);

                    if (waClient.isReady) {
                        socket.emit('ready', { message: 'WhatsApp transport listo' });
                    }

                    this.setActiveRuntimeContext({
                        tenantId,
                        moduleId: selectedModule?.moduleId || 'default',
                        moduleName: selectedModule?.name || null,
                        modulePhone: selectedModule?.phoneNumber || null,
                        channelType: selectedModule?.channelType || null,
                        transportMode: moduleTransport,
                        webjsNamespace: null
                    });

                    return runtime;
                }

                const nextRuntime = await waClient.setTransportMode(moduleTransport);
                this.invalidateChatListCache();
                this.contactListCache = { items: [], updatedAt: 0 };
                this.emitWaCapabilities(socket);
                socket.emit('transport_mode_set', nextRuntime);
                await auditSocketAction('wa.transport_mode.autoset_by_module', {
                    resourceType: 'wa_module',
                    resourceId: selectedModule?.moduleId || null,
                    payload: { moduleTransport, runtime: nextRuntime, namespaceChanged }
                });

                if (waClient.isReady) {
                    socket.emit('ready', { message: 'WhatsApp transport listo' });
                }

                this.setActiveRuntimeContext({
                    tenantId,
                    moduleId: selectedModule?.moduleId || 'default',
                    moduleName: selectedModule?.name || null,
                    modulePhone: selectedModule?.phoneNumber || null,
                    channelType: selectedModule?.channelType || null,
                    transportMode: moduleTransport,
                    webjsNamespace: null
                });

                return nextRuntime;
            };

            console.log('Web client connected:', socket.id, '| tenant:', tenantId);
            socket.join(this.getTenantRoom(tenantId));
            socket.emit('tenant_context', {
                tenantId,
                user: authContext ? {
                    userId: authContext.userId,
                    name: authContext.name || null,
                    email: authContext.email,
                    role: authContext.role,
                    tenantId: authContext.tenantId
                } : null
            });

            if (!WA_REQUIRE_SELECTED_MODULE) {
                if (waClient.isReady) {
                    socket.emit('ready', { message: 'WhatsApp is ready' });
                }
            }
            this.emitWaCapabilities(socket);
            emitWaModuleContext({ requestedModuleId: getRequestedModuleIdFromSocket() })
                .then(async (payload) => {
                    const selectedModule = payload?.selected || null;
                    if (WA_REQUIRE_SELECTED_MODULE && !selectedModule?.moduleId) {
                        socket.emit('wa_module_error', 'No hay un numero WhatsApp habilitado para tu usuario/empresa.');
                        socket.emit('transport_mode_set', this.getWaRuntime());
                        return null;
                    }
                    return await ensureTransportForSelectedModule(selectedModule);
                })
                .catch(() => { });

            socket.on('get_wa_capabilities', () => {
                this.emitWaCapabilities(socket);
            });

            socket.on('get_wa_modules', async () => {
                try {
                    await emitWaModuleContext({ requestedModuleId: socket?.data?.waModuleId || getRequestedModuleIdFromSocket() });
                } catch (error) {
                    socket.emit('wa_module_error', String(error?.message || 'No se pudieron cargar los modulos WhatsApp.'));
                }
            });

            socket.on('set_wa_module', async ({ moduleId } = {}) => {
                if (!guardRateLimit(socket, 'set_wa_module')) return;
                try {
                    const requestedModuleId = normalizeSocketModuleId(moduleId);
                    if (!requestedModuleId) {
                        socket.emit('wa_module_error', 'Selecciona un modulo valido.');
                        return;
                    }

                    const userId = String(authContext?.userId || authContext?.id || '').trim();
                    const allowedModules = await waModuleService.listModules(tenantId, {
                        includeInactive: false,
                        userId
                    });
                    const selected = (Array.isArray(allowedModules) ? allowedModules : [])
                        .find((entry) => normalizeSocketModuleId(entry?.moduleId) === requestedModuleId);

                    if (!selected) {
                        socket.emit('wa_module_error', 'No tienes acceso a ese modulo WhatsApp.');
                        return;
                    }

                    await waModuleService.setSelectedModule(tenantId, selected.moduleId);
                    const contextPayload = await emitWaModuleContext({ requestedModuleId: selected.moduleId });
                    socket.emit('wa_module_selected', {
                        tenantId,
                        selected: contextPayload?.selected || selected
                    });
                    await ensureTransportForSelectedModule(contextPayload?.selected || selected);
                    await auditSocketAction('wa.module.selected', {
                        resourceType: 'wa_module',
                        resourceId: selected.moduleId,
                        payload: { transportMode: selected.transportMode || null }
                    });
                } catch (error) {
                    socket.emit('wa_module_error', String(error?.message || 'No se pudo seleccionar el modulo WhatsApp.'));
                }
            });
            socket.on('set_transport_mode', async ({ mode } = {}) => {
                try {
                    const nextMode = String(mode || '').trim().toLowerCase();
                    if (!nextMode) {
                        socket.emit('transport_mode_error', 'Debes seleccionar un modo de transporte.');
                        return;
                    }

                    if (nextMode !== 'cloud' && nextMode !== 'idle') {
                        socket.emit('transport_mode_error', 'Modo de transporte invalido. Solo Cloud API esta permitido.');
                        return;
                    }

                    const selectedModule = socket?.data?.waModule || null;
                    if (WA_REQUIRE_SELECTED_MODULE && !selectedModule?.moduleId) {
                        socket.emit('transport_mode_error', 'Primero selecciona un numero/modulo WhatsApp permitido.');
                        return;
                    }
                    const forcedMode = String(selectedModule?.transportMode || '').trim().toLowerCase();
                    const hasForcedMode = forcedMode === 'cloud';

                    if (hasForcedMode && nextMode !== forcedMode) {
                        socket.emit('transport_mode_error', 'Este modulo exige modo ' + forcedMode + '. Cambia de modulo para usar otro transporte.');
                        return;
                    }

                    if (!hasForcedMode) {
                        if (!requireRole(['owner', 'admin'], { errorEvent: 'transport_mode_error', action: 'cambiar el modo de transporte' })) return;
                    }

                    if (nextMode === 'cloud' && selectedModule?.moduleId && typeof waModuleService.resolveModuleCloudConfig === 'function' && typeof waClient.setCloudRuntimeConfig === 'function') {
                        await applyCloudConfigForModule(selectedModule);
                    }
                    const runtime = await waClient.setTransportMode(nextMode);
                    this.invalidateChatListCache();
                    this.contactListCache = { items: [], updatedAt: 0 };
                    this.emitWaCapabilities(socket);
                    socket.emit('transport_mode_set', runtime);

                    this.setActiveRuntimeContext({
                        tenantId,
                        moduleId: selectedModule?.moduleId || socket?.data?.waModuleId || 'default',
                        moduleName: selectedModule?.name || null,
                        modulePhone: selectedModule?.phoneNumber || null,
                        channelType: selectedModule?.channelType || null,
                        transportMode: runtime?.activeTransport || nextMode,
                        webjsNamespace: null
                    });
                    await auditSocketAction('wa.transport_mode.changed', {
                        resourceType: hasForcedMode ? 'wa_module' : 'wa_runtime',
                        resourceId: hasForcedMode ? (selectedModule?.moduleId || null) : (runtime?.activeTransport || nextMode),
                        payload: {
                            requestedMode: nextMode,
                            effectiveMode: runtime?.activeTransport || nextMode,
                            selectedModuleId: selectedModule?.moduleId || null,
                            runtime
                        }
                    });

                    if (waClient.isReady) {
                        socket.emit('ready', { message: 'WhatsApp transport listo' });
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

                    if (!this.ensureTransportReady(socket, { action: 'cargar chats', errorEvent: 'transport_info' })) {
                        const fallbackPage = await this.getHistoryChatsPage(tenantId, {
                            offset,
                            limit,
                            query,
                            filters: activeFilters,
                            filterKey
                        });
                        socket.emit('chats', fallbackPage);
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

                    if (items.length === 0) {
                        const fallbackPageIfEmpty = await this.getHistoryChatsPage(tenantId, {
                            offset,
                            limit,
                            query,
                            filters: activeFilters,
                            filterKey
                        });
                        if (Array.isArray(fallbackPageIfEmpty?.items) && fallbackPageIfEmpty.items.length > 0) {
                            socket.emit('chats', fallbackPageIfEmpty);
                            return;
                        }
                    }

                    let historyTotalHint = 0;
                    const activeRuntime = this.getWaRuntime();
                    const activeTransportMode = String(activeRuntime?.activeTransport || 'idle').trim().toLowerCase();
                    if (activeTransportMode === 'cloud') {
                        try {
                            const cloudHistoryPage = await this.getHistoryChatsPage(tenantId, {
                                offset,
                                limit,
                                query,
                                filters: activeFilters,
                                filterKey
                            });

                            historyTotalHint = Math.max(0, Number(cloudHistoryPage?.total || 0));
                            if (Array.isArray(cloudHistoryPage?.items) && cloudHistoryPage.items.length > 0) {
                                const mergedMap = new Map();
                                for (const item of cloudHistoryPage.items) {
                                    if (!item) continue;
                                    const key = buildChatIdentityKeyFromSummary(item);
                                    if (!mergedMap.has(key)) mergedMap.set(key, item);
                                }
                                for (const item of items) {
                                    if (!item) continue;
                                    const key = buildChatIdentityKeyFromSummary(item);
                                    if (!mergedMap.has(key)) {
                                        mergedMap.set(key, item);
                                    } else {
                                        mergedMap.set(key, pickPreferredSummary(mergedMap.get(key), item));
                                    }
                                }

                                const mergedItems = Array.from(mergedMap.values())
                                    .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)))
                                    .slice(0, limit);

                                if (mergedItems.length > 0) {
                                    items = mergedItems;
                                }
                            }
                        } catch (historyMergeError) {
                            console.warn('[History] cloud chat merge failed:', String(historyMergeError?.message || historyMergeError));
                        }
                    }

                    const nextOffset = offset + items.length;
                    const total = Math.max(filtered.length, historyTotalHint, offset + items.length);
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
                    try {
                        const fallbackPage = await this.getHistoryChatsPage(tenantId, {
                            offset: Number(payload?.offset ?? 0),
                            limit: Number(payload?.limit ?? 80),
                            query: String(payload?.query || '').trim(),
                            filters: payload?.filters || {},
                            filterKey: String(payload?.filterKey || '').trim()
                        });
                        socket.emit('chats', fallbackPage);
                    } catch (historyErr) {
                        socket.emit('chats', {
                            items: [],
                            offset: Number(payload?.offset ?? 0) || 0,
                            limit: Number(payload?.limit ?? 80) || 80,
                            total: 0,
                            hasMore: false,
                            nextOffset: 0,
                            query: String(payload?.query || '').trim(),
                            filters: payload?.filters || {},
                            filterKey: String(payload?.filterKey || '').trim(),
                            source: 'history_fallback'
                        });
                    }
                }
            });

            socket.on('get_chat_history', async (chatId) => {
                try {
                    let historyChatId = String(chatId || '');

                    if (!this.ensureTransportReady(socket, { action: 'abrir historial', errorEvent: 'transport_info' })) {
                        const fallbackHistory = await this.getHistoryChatHistory(tenantId, {
                            chatId: historyChatId,
                            limit: 60
                        });
                        socket.emit('chat_history', fallbackHistory);
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

                    let historyMetaByMessageId = new Map();
                    try {
                        const persistedRows = await messageHistoryService.listMessages(tenantId, { chatId: historyChatId, limit: 500 });
                        historyMetaByMessageId = new Map(
                            (Array.isArray(persistedRows) ? persistedRows : [])
                                .map((row) => {
                                    const key = String(row?.messageId || '').trim();
                                    if (!key) return null;
                                    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
                                    return [key, metadata];
                                })
                                .filter(Boolean)
                        );
                    } catch (_) { }

                    const formatted = await Promise.all(visible.map(async (m) => {
                        const senderMeta = await resolveMessageSenderMeta(m);
                        const fileMeta = extractMessageFileMeta(m);
                        const messageId = String(m?.id?._serialized || '').trim();
                        const persistedAgentMeta = historyMetaByMessageId.get(messageId) || null;
                        const pendingAgentMeta = m?.fromMe ? getOutgoingAgentMeta(messageId) : null;
                        const agentMeta = mergeAgentMeta(persistedAgentMeta, pendingAgentMeta);
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
                        mediaUrl: fileMeta.mediaUrl || null,
                        mediaPath: fileMeta.mediaPath || null,
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
                        quotedMessage: await extractQuotedMessageInfo(m),
                        ...(agentMeta || {})
                        });
                    }));
                    if (formatted.length === 0) {
                        const historyFallbackIfEmpty = await this.getHistoryChatHistory(tenantId, {
                            chatId: historyChatId,
                            limit: 60
                        });
                        if (Array.isArray(historyFallbackIfEmpty?.messages) && historyFallbackIfEmpty.messages.length > 0) {
                            socket.emit('chat_history', historyFallbackIfEmpty);
                            return;
                        }
                    }
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
                    try {
                        const fallbackHistory = await this.getHistoryChatHistory(tenantId, {
                            chatId,
                            limit: 60
                        });
                        socket.emit('chat_history', fallbackHistory);
                    } catch (historyErr) {
                        socket.emit('chat_history', {
                            chatId: String(chatId || ''),
                            requestedChatId: String(chatId || ''),
                            messages: [],
                            source: 'history_fallback'
                        });
                    }
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

                    const runtime = this.getWaRuntime();
                    const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();

                    let registeredUser = null;
                    if (activeTransport === 'cloud') {
                        try {
                            if (waClient?.client && typeof waClient.client.getNumberId === 'function') {
                                const numberId = await waClient.client.getNumberId(clean);
                                const byUser = coerceHumanPhone(numberId?.user || '');
                                const bySerialized = coerceHumanPhone(String(numberId?._serialized || '').split('@')[0] || '');
                                registeredUser = byUser || bySerialized || null;
                            }
                        } catch (_) { }

                        if (!registeredUser) {
                            const candidates = buildPhoneCandidates(clean);
                            registeredUser = coerceHumanPhone(candidates[0] || clean);
                        }
                    } else {
                        registeredUser = await resolveRegisteredNumber(waClient.client, clean);
                        if (!registeredUser) {
                            socket.emit('start_new_chat_error', 'El numero no esta registrado en WhatsApp.');
                            return;
                        }
                    }

                    if (!registeredUser) {
                        socket.emit('start_new_chat_error', 'Numero invalido para abrir chat.');
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
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'chat_labels_error', action: 'gestionar etiquetas' })) return;
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
                    this.emitToTenant(tenantId, 'chat_labels_updated', payload);
                    socket.emit('chat_labels_saved', { chatId, ok: true });
                    await auditSocketAction('chat.labels.updated', {
                        resourceType: 'chat',
                        resourceId: chatId,
                        payload: { labelIds: ids, labels: payload.labels }
                    });
                } catch (e) {
                    console.error('set_chat_labels error:', e.message);
                    socket.emit('chat_labels_error', 'No se pudieron actualizar las etiquetas en WhatsApp.');
                }
            });

            socket.on('create_label', async ({ name }) => {
                if (!requireRole(['owner', 'admin'], { errorEvent: 'chat_labels_error', action: 'crear etiquetas' })) return;
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
                    const quickRepliesEnabled = await this.isFeatureEnabledForTenant(tenantId, 'quickReplies');
                    if (!quickRepliesEnabled) {
                        socket.emit('quick_replies', { items: [], source: 'disabled' });
                        return;
                    }

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
                const quickRepliesEnabled = await this.isFeatureEnabledForTenant(tenantId, 'quickReplies');
                if (!quickRepliesEnabled) {
                    socket.emit('quick_reply_error', 'Respuestas rapidas deshabilitadas para esta empresa o plan.');
                    return;
                }
                socket.emit('quick_reply_error', 'WhatsApp Web no expone crear respuestas rapidas por API en esta version.');
            });

            socket.on('update_quick_reply', async () => {
                const quickRepliesEnabled = await this.isFeatureEnabledForTenant(tenantId, 'quickReplies');
                if (!quickRepliesEnabled) {
                    socket.emit('quick_reply_error', 'Respuestas rapidas deshabilitadas para esta empresa o plan.');
                    return;
                }
                socket.emit('quick_reply_error', 'WhatsApp Web no expone editar respuestas rapidas por API en esta version.');
            });

            socket.on('delete_quick_reply', async () => {
                const quickRepliesEnabled = await this.isFeatureEnabledForTenant(tenantId, 'quickReplies');
                if (!quickRepliesEnabled) {
                    socket.emit('quick_reply_error', 'Respuestas rapidas deshabilitadas para esta empresa o plan.');
                    return;
                }
                socket.emit('quick_reply_error', 'WhatsApp Web no expone eliminar respuestas rapidas por API en esta version.');
            });

            // --- Messaging ---
            const emitRealtimeOutgoingMessage = async ({
                sentMessage = null,
                fallbackChatId = '',
                fallbackBody = '',
                quotedMessageId = '',
                moduleContext = null,
                agentMeta = null,
                mediaPayload = null
            } = {}) => {
                const safeSentMessage = sentMessage && typeof sentMessage === 'object' ? sentMessage : {};
                const messageId = getSerializedMessageId(safeSentMessage);
                const targetChatId = String(safeSentMessage?.to || fallbackChatId || '').trim();
                if (!messageId || !targetChatId || !isVisibleChatId(targetChatId)) return;

                const timestamp = Number(safeSentMessage?.timestamp || 0) || Math.floor(Date.now() / 1000);
                const ack = Number.isFinite(Number(safeSentMessage?.ack)) ? Number(safeSentMessage.ack) : 0;
                const quotedId = String(quotedMessageId || '').trim();
                const mediaData = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.data || '').trim() : '';
                const mediaMimetype = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mimetype || '').trim() : '';
                const mediaFilename = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.filename || '').trim() : '';
                const mediaSizeBytesRaw = mediaPayload && typeof mediaPayload === 'object' ? Number(mediaPayload?.fileSizeBytes) : null;
                const mediaSizeBytes = Number.isFinite(mediaSizeBytesRaw) ? mediaSizeBytesRaw : null;
                const moduleAttributionMeta = buildModuleAttributionMeta(moduleContext);

                const payload = {
                    id: messageId,
                    from: String(safeSentMessage?.from || '').trim() || null,
                    to: targetChatId,
                    body: String(safeSentMessage?.body ?? fallbackBody ?? ''),
                    timestamp,
                    fromMe: true,
                    hasMedia: Boolean(mediaData || safeSentMessage?.hasMedia),
                    mediaData: mediaData || null,
                    mimetype: mediaMimetype || null,
                    filename: mediaFilename || null,
                    fileSizeBytes: mediaSizeBytes,
                    ack,
                    type: String(safeSentMessage?.type || (mediaData ? 'media' : 'chat')),
                    author: String(safeSentMessage?.author || safeSentMessage?._data?.author || '').trim() || null,
                    notifyName: null,
                    senderPhone: null,
                    senderId: null,
                    senderPushname: null,
                    isGroupMessage: String(targetChatId || '').endsWith('@g.us'),
                    canEdit: false,
                    order: null,
                    location: null,
                    quotedMessage: quotedId ? { id: quotedId, body: '', fromMe: false, hasMedia: false, type: 'chat' } : null,
                    ...(agentMeta || {}),
                    sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || String(agentMeta?.sentViaModuleId || '').trim() || null,
                    sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || String(agentMeta?.sentViaModuleName || '').trim() || null,
                    sentViaTransport: moduleAttributionMeta?.sentViaTransport || String(agentMeta?.sentViaTransport || '').trim().toLowerCase() || null,
                    sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || String(agentMeta?.sentViaPhoneNumber || '').trim() || null,
                    sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || String(agentMeta?.sentViaChannelType || '').trim().toLowerCase() || null
                };

                const persistedMessage = {
                    ...safeSentMessage,
                    id: safeSentMessage?.id || { _serialized: messageId },
                    fromMe: true,
                    to: targetChatId,
                    body: payload.body,
                    timestamp,
                    hasMedia: payload.hasMedia,
                    type: payload.type,
                    ack
                };

                await this.persistMessageHistory(tenantId, {
                    msg: persistedMessage,
                    senderMeta: null,
                    fileMeta: {
                        mimetype: payload.mimetype,
                        filename: payload.filename,
                        fileSizeBytes: payload.fileSizeBytes
                    },
                    order: null,
                    location: null,
                    quotedMessage: payload.quotedMessage,
                    agentMeta,
                    moduleContext
                });

                this.emitToRuntimeContext('message', payload);

                try {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(targetChatId);
                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: false });
                    if (summary) this.emitToRuntimeContext('chat_updated', summary);
                } catch (_) { }
            };
            socket.on('send_message', async ({ to, toPhone, body, quotedMessageId }) => {
                if (!guardRateLimit(socket, 'send_message')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar mensajes', errorEvent: 'error' })) return;
                try {
                    let targetChatId = String(to || '').trim();
                    const targetPhone = coerceHumanPhone(toPhone || '');
                    const text = String(body || '');
                    const quoted = String(quotedMessageId || '').trim();
                    const runtime = this.getWaRuntime();
                    const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
                    if (activeTransport === 'cloud') {
                        const resolvedCloudChatId = resolveCloudDestinationChatId(targetChatId, targetPhone);
                        if (!resolvedCloudChatId) {
                            socket.emit('error', 'No se pudo resolver un numero WhatsApp valido para este chat en Cloud API. Abre chat por numero real.');
                            return;
                        }
                        targetChatId = resolvedCloudChatId;
                    }
                    if (!targetChatId || !text.trim()) {
                        socket.emit('error', 'Datos invalidos para enviar mensaje.');
                        return;
                    }

                    const moduleContext = socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                    let sentMessage = null;

                    if (quoted) {
                        let quotedTargetChatId = targetChatId;
                        try {
                            const quotedMsg = await waClient.getMessageById(quoted);
                            const fromQuoted = String(quotedMsg?.fromMe ? quotedMsg?.to : quotedMsg?.from || '').trim();
                            if (fromQuoted && isVisibleChatId(fromQuoted)) {
                                quotedTargetChatId = fromQuoted;
                            }
                            if (activeTransport === 'cloud' && isLidIdentifier(quotedTargetChatId)) {
                                quotedTargetChatId = targetChatId;
                            }
                        } catch (resolveQuotedError) {
                        }

                        try {
                            // Prefer native quotedMessageId path so replies stay linked on WhatsApp mobile.
                            sentMessage = await waClient.sendMessage(quotedTargetChatId, text, { quotedMessageId: quoted });
                        } catch (sendWithQuoteError) {
                            // Fallback for runtime variants where quotedMessageId is not accepted directly.
                            sentMessage = await waClient.replyToMessage(quotedTargetChatId, quoted, text);
                        }
                    } else {
                        sentMessage = await waClient.sendMessage(targetChatId, text);
                    }

                    const sentMessageId = getSerializedMessageId(sentMessage);
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }

                    await emitRealtimeOutgoingMessage({
                        sentMessage,
                        fallbackChatId: targetChatId,
                        fallbackBody: text,
                        quotedMessageId: quoted,
                        moduleContext,
                        agentMeta,
                        mediaPayload: null
                    });
                } catch (e) {
                    const detail = String(e?.message || e || 'Failed to send message.');
                    console.warn('[WA][SendMessage] ' + detail);
                    socket.emit('error', detail);
                }
            });
            socket.on('edit_message', async ({ chatId, messageId, body }) => {
                if (!guardRateLimit(socket, 'edit_message')) return;
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'edit_message_error', action: 'editar mensajes' })) return;
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
                    await auditSocketAction('message.edited', {
                        resourceType: 'message',
                        resourceId: targetMessageId,
                        payload: { chatId: targetChatId }
                    });
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
                    const { to, toPhone, body, mediaData, mimetype, filename, isPtt, quotedMessageId } = data || {};
                    if (isPtt) {
                        socket.emit('error', 'El envio de notas de voz esta deshabilitado temporalmente.');
                        return;
                    }

                    let targetChatId = String(to || '').trim();
                    const targetPhone = coerceHumanPhone(toPhone || '');
                    const caption = String(body || '');
                    const quoted = String(quotedMessageId || '').trim();
                    const runtime = this.getWaRuntime();
                    const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
                    if (activeTransport === 'cloud') {
                        const resolvedCloudChatId = resolveCloudDestinationChatId(targetChatId, targetPhone);
                        if (!resolvedCloudChatId) {
                            socket.emit('error', 'No se pudo resolver un numero WhatsApp valido para este chat en Cloud API. Abre chat por numero real.');
                            return;
                        }
                        targetChatId = resolvedCloudChatId;
                    }
                    if (!targetChatId || !String(mediaData || '').trim()) {
                        socket.emit('error', 'Datos invalidos para enviar adjunto.');
                        return;
                    }

                    const moduleContext = socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                    const sentMessage = await waClient.sendMedia(targetChatId, mediaData, mimetype, filename, caption, isPtt, quoted || null);
                    const sentMessageId = getSerializedMessageId(sentMessage);
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }

                    await emitRealtimeOutgoingMessage({
                        sentMessage,
                        fallbackChatId: targetChatId,
                        fallbackBody: caption,
                        quotedMessageId: quoted,
                        moduleContext,
                        agentMeta,
                        mediaPayload: {
                            data: String(mediaData || ''),
                            mimetype: String(mimetype || '').trim() || null,
                            filename: String(filename || '').trim() || null,
                            fileSizeBytes: null
                        }
                    });
                } catch (e) {
                    const detail = String(e?.message || e || 'Failed to send media.');
                    console.warn('[WA][SendMedia] ' + detail);
                    socket.emit('error', detail);
                }
            });

            socket.on('forward_message', async ({ messageId, toChatId }) => {
                if (!guardRateLimit(socket, 'forward_message')) return;
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'forward_message_error', action: 'reenviar mensajes' })) return;
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
                    await auditSocketAction('message.forwarded', {
                        resourceType: 'message',
                        resourceId: sourceMessageId,
                        payload: { toChatId: targetChatId }
                    });
                } catch (e) {
                    socket.emit('forward_message_error', 'No se pudo reenviar el mensaje en esta version de WhatsApp.');
                }
            });

            socket.on('delete_message', async ({ chatId, messageId }) => {
                if (!guardRateLimit(socket, 'delete_message')) return;
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'delete_message_error', action: 'eliminar mensajes' })) return;
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
                    await auditSocketAction('message.deleted', {
                        resourceType: 'message',
                        resourceId: targetMessageId,
                        payload: { chatId: targetChatId }
                    });
                } catch (e) {
                    socket.emit('delete_message_error', 'No se pudo eliminar el mensaje.');
                }
            });
            socket.on('send_catalog_product', async (payload = {}) => {
                if (!guardRateLimit(socket, 'send_catalog_product')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar productos de catalogo', errorEvent: 'error' })) return;
                const catalogEnabled = await this.isFeatureEnabledForTenant(tenantId, 'catalog');
                if (!catalogEnabled) {
                    socket.emit('error', 'Catalogo deshabilitado para esta empresa o plan.');
                    return;
                }
                try {
                    let to = String(payload?.to || '').trim();
                    const toPhone = coerceHumanPhone(payload?.toPhone || '');
                    const runtime = this.getWaRuntime();
                    const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
                    if (activeTransport === 'cloud') {
                        const resolvedCloudChatId = resolveCloudDestinationChatId(to, toPhone);
                        if (!resolvedCloudChatId) {
                            socket.emit('error', 'No se pudo resolver un numero WhatsApp valido para este chat en Cloud API. Abre chat por numero real.');
                            return;
                        }
                        to = resolvedCloudChatId;
                    }
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
                    const detail = String(e?.message || e || 'No se pudo enviar el producto del catalogo.');
                    console.warn('[WA][SendCatalogProduct] ' + detail);
                    socket.emit('error', detail);
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
                        const quota = await this.reserveAiQuota(tenantId, { socket });
                        if (!quota?.ok) {
                            socket.emit('ai_suggestion_complete');
                            return;
                        }

                        const aiText = await getChatSuggestion(contextText, customPrompt, (chunk) => {
                            socket.emit('ai_suggestion_chunk', chunk);
                        }, businessContext, { tenantId });
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
                        const quota = await this.reserveAiQuota(tenantId, { socket });
                        if (!quota?.ok) {
                            socket.emit('internal_ai_complete');
                            return;
                        }

                        const copilotText = await askInternalCopilot(query, (chunk) => {
                            socket.emit('internal_ai_chunk', chunk);
                        }, businessContext, { tenantId });
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
            socket.on('get_business_catalog', async ({ moduleId } = {}) => {
                try {
                    const catalogScope = await resolveCatalogScope({ requestedModuleId: moduleId });
                    const scopedCatalog = await loadCatalog(catalogScope);
                    socket.emit('business_data_catalog', {
                        scope: catalogScope,
                        items: scopedCatalog
                    });
                } catch (error) {
                    socket.emit('error', String(error?.message || 'No se pudo cargar el catalogo del modulo.'));
                }
            });

            socket.on('get_business_data', async () => {
                try {
                    const selectedModuleContext = socket?.data?.waModule || null;
                    const catalogScope = getActiveCatalogScope();

                    if (!this.ensureTransportReady(socket, { action: 'cargar datos del negocio', errorEvent: 'error' })) {
                        socket.emit('business_data', {
                            profile: null,
                            labels: [],
                            catalog: await loadCatalog(catalogScope),
                            catalogMeta: { source: 'local', nativeAvailable: false, wooConfigured: false, wooAvailable: false }
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

                    const tenantSettings = await tenantSettingsService.getTenantSettings(tenantId);
                    const tenantIntegrations = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
                    const moduleCatalogMode = String(selectedModuleContext?.metadata?.moduleSettings?.catalogMode || '').trim().toLowerCase();
                    const configuredCatalogMode = String(tenantIntegrations?.catalog?.mode || tenantSettings?.catalogMode || 'hybrid').trim().toLowerCase();
                    const catalogMode = moduleCatalogMode && moduleCatalogMode !== 'inherit'
                        ? moduleCatalogMode
                        : configuredCatalogMode;

                    const wooConfig = {
                        ...(tenantIntegrations?.catalog?.providers?.woocommerce || {}),
                        enabled: tenantIntegrations?.catalog?.providers?.woocommerce?.enabled !== false
                    };
                    const wooConfigured = isWooConfigured(wooConfig);
                    const tenantPlan = tenantService.findTenantById(tenantId) || tenantService.DEFAULT_TENANT;
                    const catalogEnabled = planLimitsService.isFeatureEnabledForTenant('catalog', tenantPlan, tenantSettings);
                    if (!catalogEnabled) {
                        socket.emit('business_data', {
                            profile,
                            labels,
                            catalog: [],
                            catalogMeta: {
                                source: 'disabled',
                                mode: catalogMode,
                                nativeAvailable: false,
                                wooConfigured,
                                wooAvailable: false,
                                disabledReason: 'catalog_module_disabled',
                                categories: []
                            },
                            tenantSettings,
                            integrations: tenantIntegrations
                        });
                        return;
                    }

                    let catalog = [];
                    let catalogMeta = {
                        source: 'native',
                        mode: catalogMode,
                        nativeAvailable: false,
                        wooConfigured,
                        wooAvailable: false,
                        wooSource: null,
                        wooStatus: null,
                        wooReason: null
                    };

                    const enableNative = catalogMode === 'hybrid' || catalogMode === 'meta_only';
                    const enableWoo = catalogMode === 'hybrid' || catalogMode === 'woo_only';
                    const enableLocal = catalogMode === 'hybrid' || catalogMode === 'local_only';

                    // En modo hibrido priorizamos catalogo local del modulo si existe.
                    // Esto evita que Woo/Meta "pisen" catalogos separados por modulo.
                    if (enableLocal) {
                        const localCatalog = await loadCatalog(catalogScope);
                        if (Array.isArray(localCatalog) && localCatalog.length > 0) {
                            catalog = localCatalog;
                            catalogMeta = {
                                ...catalogMeta,
                                source: 'local',
                                nativeAvailable: false,
                                wooConfigured,
                                wooAvailable: false
                            };
                        }
                    }

                    if (!catalog.length && enableNative) {
                        try {
                            const nativeProducts = await waClient.getCatalog(meId);
                            if (nativeProducts && nativeProducts.length > 0) {
                                catalog = nativeProducts.map((p) => ({
                                    id: p.id,
                                    title: p.name,
                                    price: p.price ? Number.parseFloat(String(p.price)).toFixed(2) : '0.00',
                                    description: p.description,
                                    imageUrl: p.imageUrls ? p.imageUrls[0] : null,
                                    source: 'meta'
                                }));
                                catalogMeta = {
                                    ...catalogMeta,
                                    source: 'meta',
                                    nativeAvailable: true,
                                    wooAvailable: false
                                };
                            }
                        } catch (_) {
                            // noop
                        }
                    }

                    if (!catalog.length && enableWoo) {
                        const wooResult = await getWooCatalog({ config: wooConfig });
                        if (wooResult.products.length > 0) {
                            catalog = wooResult.products;
                            catalogMeta = {
                                ...catalogMeta,
                                source: 'woocommerce',
                                nativeAvailable: false,
                                wooAvailable: true,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                        } else {
                            catalogMeta = {
                                ...catalogMeta,
                                wooConfigured,
                                wooAvailable: false,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                        }
                    }

                    if (!catalog.length && enableLocal) {
                        catalog = await loadCatalog(catalogScope);
                        catalogMeta = {
                            ...catalogMeta,
                            source: 'local',
                            nativeAvailable: false,
                            wooConfigured,
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
                        categories: catalogCategories,
                        scope: catalogScope
                    };
                    logCatalogDebugSnapshot({ catalog, catalogMeta });
                    socket.emit('business_data', { profile, labels, catalog, catalogMeta, tenantSettings, integrations: tenantIntegrations });
                } catch (e) {
                    console.error('Error fetching business data:', e);
                    const fallbackCatalogScope = getActiveCatalogScope();
                    socket.emit('business_data', {
                        profile: null,
                        labels: [],
                        catalog: await loadCatalog(fallbackCatalogScope),
                        catalogMeta: {
                            source: 'local',
                            mode: 'hybrid',
                            nativeAvailable: false,
                            wooConfigured: false,
                            wooAvailable: false,
                            wooSource: null,
                            wooStatus: 'error',
                            wooReason: 'Error al obtener datos de negocio',
                            scope: fallbackCatalogScope
                        },
                        tenantSettings: await tenantSettingsService.getTenantSettings(tenantId),
                        integrations: await tenantIntegrationsService.getTenantIntegrations(tenantId)
                    });
                }
            });

            // --- Catalog CRUD ---
            socket.on('add_product', async (product) => {
                if (!requireRole(['owner', 'admin'], { errorEvent: 'error', action: 'agregar productos al catalogo' })) return;
                try {
                    const catalogEnabled = await this.isFeatureEnabledForTenant(tenantId, 'catalog');
                    if (!catalogEnabled) {
                        socket.emit('error', 'Catalogo deshabilitado para esta empresa o plan.');
                        return;
                    }

                    const tenant = tenantService.findTenantById(tenantId) || tenantService.DEFAULT_TENANT;
                    const limits = planLimitsService.getTenantPlanLimits(tenant);
                    const catalogScope = await resolveCatalogScope({ requestedModuleId: product?.moduleId });
                    const currentCatalog = await loadCatalog(catalogScope);
                    const maxCatalogItems = Number(limits?.maxCatalogItems || 0);
                    if (Number.isFinite(maxCatalogItems) && maxCatalogItems > 0 && currentCatalog.length >= maxCatalogItems) {
                        socket.emit('error', 'No puedes agregar mas productos: limite del plan (' + maxCatalogItems + ').');
                        return;
                    }

                    const cleanProduct = product && typeof product === 'object' ? { ...product } : {};
                    delete cleanProduct.moduleId;
                    const newProduct = await addProduct(cleanProduct, catalogScope);
                    const scopedCatalog = await loadCatalog(catalogScope);
                    this.emitToTenant(tenantId, 'business_data_catalog', {
                        scope: catalogScope,
                        items: scopedCatalog
                    });
                    socket.emit('product_added', newProduct);
                    await auditSocketAction('catalog.product.added', {
                        resourceType: 'catalog_item',
                        resourceId: newProduct?.id || null,
                        payload: { title: newProduct?.title || null }
                    });
                } catch (e) { console.error('add_product error:', e); }
            });

            socket.on('update_product', async ({ id, updates, moduleId } = {}) => {
                if (!requireRole(['owner', 'admin'], { errorEvent: 'error', action: 'editar productos del catalogo' })) return;
                try {
                    const catalogEnabled = await this.isFeatureEnabledForTenant(tenantId, 'catalog');
                    if (!catalogEnabled) {
                        socket.emit('error', 'Catalogo deshabilitado para esta empresa o plan.');
                        return;
                    }

                    const catalogScope = await resolveCatalogScope({ requestedModuleId: moduleId || updates?.moduleId });
                    const safeUpdates = updates && typeof updates === 'object' ? { ...updates } : {};
                    delete safeUpdates.moduleId;
                    const updated = await updateProduct(id, safeUpdates, catalogScope);
                    const scopedCatalog = await loadCatalog(catalogScope);
                    this.emitToTenant(tenantId, 'business_data_catalog', {
                        scope: catalogScope,
                        items: scopedCatalog
                    });
                    socket.emit('product_updated', updated);
                    await auditSocketAction('catalog.product.updated', {
                        resourceType: 'catalog_item',
                        resourceId: updated?.id || id || null,
                        payload: { updates: safeUpdates }
                    });
                } catch (e) { console.error('update_product error:', e); }
            });

            socket.on('delete_product', async (payload) => {
                if (!requireRole(['owner', 'admin'], { errorEvent: 'error', action: 'eliminar productos del catalogo' })) return;
                try {
                    const catalogEnabled = await this.isFeatureEnabledForTenant(tenantId, 'catalog');
                    if (!catalogEnabled) {
                        socket.emit('error', 'Catalogo deshabilitado para esta empresa o plan.');
                        return;
                    }

                    const requestedId = payload && typeof payload === 'object'
                        ? String(payload?.id || '').trim()
                        : String(payload || '').trim();
                    if (!requestedId) {
                        socket.emit('error', 'Producto invalido para eliminar.');
                        return;
                    }
                    const requestedModuleId = payload && typeof payload === 'object' ? payload?.moduleId : '';
                    const catalogScope = await resolveCatalogScope({ requestedModuleId });
                    await deleteProduct(requestedId, catalogScope);
                    const scopedCatalog = await loadCatalog(catalogScope);
                    this.emitToTenant(tenantId, 'business_data_catalog', {
                        scope: catalogScope,
                        items: scopedCatalog
                    });
                    await auditSocketAction('catalog.product.deleted', {
                        resourceType: 'catalog_item',
                        resourceId: requestedId || null,
                        payload: {}
                    });
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
                if (!requireRole(['owner', 'admin'], { errorEvent: 'error', action: 'cerrar sesion de WhatsApp' })) return;
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
                await auditSocketAction('wa.logout.requested', {
                    resourceType: 'wa_runtime',
                    resourceId: 'logout',
                    payload: {}
                });
            });

            socket.on('disconnect', () => {
                console.log('Web client disconnected:', socket.id);
            });
        });
    }

    setupWAClientEvents() {
        waClient.on('qr', (qr) => this.emitToRuntimeContext('qr', qr));
        waClient.on('ready', async () => {
            const policyOk = await this.enforceRuntimeWebjsPhonePolicy();
            if (!policyOk) return;

            this.emitToRuntimeContext('ready', { message: 'WhatsApp Ready' });
            this.emitToRuntimeContext('wa_capabilities', this.getWaCapabilities());
            this.emitToRuntimeContext('wa_runtime', this.getWaRuntime());
        });
        waClient.on('authenticated', () => this.emitToRuntimeContext('authenticated'));
        waClient.on('auth_failure', (msg) => this.emitToRuntimeContext('auth_failure', msg));
        waClient.on('disconnected', (reason) => this.emitToRuntimeContext('disconnected', reason));

        waClient.on('message', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;

            const historyTenantId = this.resolveHistoryTenantId();
            const runtimeModuleContext = this.resolveHistoryModuleContext();
            const moduleAttributionMeta = buildModuleAttributionMeta(runtimeModuleContext);
            const media = await mediaManager.processMessageMedia(msg, {
                tenantId: historyTenantId,
                moduleId: runtimeModuleContext?.moduleId || '',
                contactId: msg?.fromMe ? msg?.to : msg?.from,
                timestampUnix: Number(msg?.timestamp || 0) || null
            });
            const senderMeta = await resolveMessageSenderMeta(msg);
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            const order = extractOrderInfo(msg);
            const location = extractLocationInfo(msg);
            const messageId = getSerializedMessageId(msg);
            const agentMeta = msg?.fromMe ? mergeAgentMeta(getOutgoingAgentMeta(messageId)) : null;
            await this.persistMessageHistory(historyTenantId, {
                msg,
                senderMeta,
                fileMeta,
                order,
                location,
                quotedMessage,
                agentMeta,
                moduleContext: runtimeModuleContext
            });
            this.emitToRuntimeContext('message', {
                id: messageId,
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
                        mediaUrl: fileMeta.mediaUrl || null,
                        mediaPath: fileMeta.mediaPath || null,
                ack: msg.ack,
                type: msg.type,
                author: msg?.author || msg?._data?.author || null,
                notifyName: senderMeta.notifyName,
                senderPhone: senderMeta.senderPhone,
                senderId: senderMeta.senderId,
                senderPushname: senderMeta.senderPushname,
                isGroupMessage: senderMeta.isGroupMessage,
                canEdit: false,
                order,
                location,
                quotedMessage,
                ...(moduleAttributionMeta || {}),
                ...(agentMeta || {})
            });

            try {
                const relatedChatId = msg.fromMe ? msg.to : msg.from;
                if (isVisibleChatId(relatedChatId)) {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatId);
                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: false });
                    if (summary) this.emitToRuntimeContext('chat_updated', summary);
                }
            } catch (e) {
                // silent: message delivery should not fail by chat refresh issues
            }
        });
        waClient.on('message_sent', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;
            // Emite de vuelta para confirmar en UI si se envio desde otro lugar
            const historyTenantId = this.resolveHistoryTenantId();
            const runtimeModuleContext = this.resolveHistoryModuleContext();
            const moduleAttributionMeta = buildModuleAttributionMeta(runtimeModuleContext);
            const media = await mediaManager.processMessageMedia(msg, {
                tenantId: historyTenantId,
                moduleId: runtimeModuleContext?.moduleId || '',
                contactId: msg?.fromMe ? msg?.to : msg?.from,
                timestampUnix: Number(msg?.timestamp || 0) || null
            });
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            const order = extractOrderInfo(msg);
            const location = extractLocationInfo(msg);
            const messageId = getSerializedMessageId(msg);
            const agentMeta = msg?.fromMe ? mergeAgentMeta(getOutgoingAgentMeta(messageId)) : null;
            await this.persistMessageHistory(historyTenantId, {
                msg,
                senderMeta: null,
                fileMeta,
                order,
                location,
                quotedMessage,
                agentMeta,
                moduleContext: runtimeModuleContext
            });
            this.emitToRuntimeContext('message', {
                id: messageId,
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
                        mediaUrl: fileMeta.mediaUrl || null,
                        mediaPath: fileMeta.mediaPath || null,
                ack: msg.ack,
                type: msg.type,
                author: msg?.author || msg?._data?.author || null,
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: String(msg?.to || msg?.from || '').includes('@g.us'),
                canEdit: false,
                order,
                location,
                quotedMessage,
                ...(moduleAttributionMeta || {}),
                ...(agentMeta || {})
            });

            if (messageId) {
                this.emitMessageEditability(messageId, msg.to || msg.from);
                this.scheduleEditabilityRefresh(messageId, msg.to || msg.from);
            }

            try {
                const relatedChatId = msg.to || msg.from;
                if (isVisibleChatId(relatedChatId)) {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatId);
                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: false });
                    if (summary) this.emitToRuntimeContext('chat_updated', summary);
                }
            } catch (e) { }
        });
        waClient.on('message_edit', async ({ message, newBody, prevBody }) => {
            if (!message || isStatusOrSystemMessage(message)) return;
            const chatId = message.fromMe ? message.to : message.from;

            const messageId = getSerializedMessageId(message);
            if (!messageId) return;

            let canEdit = false;
            try {
                canEdit = await waClient.canEditMessageById(messageId);
            } catch (e) { }

            const editedAtMs = Number(message?.latestEditSenderTimestampMs || message?._data?.latestEditSenderTimestampMs || 0);
            const editedAt = editedAtMs > 0 ? Math.floor(editedAtMs / 1000) : Math.floor(Date.now() / 1000);
            await this.persistMessageEdit(this.resolveHistoryTenantId(), {
                messageId,
                chatId,
                body: String(newBody ?? message.body ?? ''),
                editedAtUnix: editedAt
            });

            if (!isVisibleChatId(chatId)) return;

            this.emitToRuntimeContext('message_edited', {
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
                if (summary) this.emitToRuntimeContext('chat_updated', summary);
            } catch (e) { }
        });

        waClient.on('message_ack', async ({ message, ack }) => {
            const messageId = getSerializedMessageId(message);
            const chatId = message?.to || message?.from || '';
            const isFromMe = Boolean(message?.fromMe);
            await this.persistMessageAck(this.resolveHistoryTenantId(), {
                messageId,
                chatId,
                ack
            });

            let canEdit;
            if (isFromMe && messageId) {
                try {
                    canEdit = await waClient.canEditMessageById(messageId);
                } catch (e) { }
            }

            this.emitToRuntimeContext('message_ack', {
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
































