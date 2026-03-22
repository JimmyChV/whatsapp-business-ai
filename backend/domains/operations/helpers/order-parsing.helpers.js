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
        ['amount', input.amount]
    ];
    const lineTotalCandidates = [
        ['lineTotalAmount1000', input.lineTotalAmount1000],
        ['totalAmount1000', input.totalAmount1000],
        ['line_total_amount_1000', input.line_total_amount_1000],
        ['lineTotal', input.lineTotal],
        ['line_total', input.line_total],
        ['total', input.total],
        ['subtotal', input.subtotal]
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

module.exports = {
    parseOrderNumber,
    normalizeOrderCurrencyAmount,
    normalizeOrderSku,
    normalizeOrderSkuKey,
    parseOrderLineFromObject,
    dedupeOrderProducts,
    collectProductsFromUnknownShape,
    parseProductsFromBodyText,
    parseProductsFromOrderTitle,
    buildOrderDebugKey,
    pickOrderDebugData,
    safeOrderDebugJson,
    extractCatalogItemCategories,
    buildCatalogDebugLine
};

