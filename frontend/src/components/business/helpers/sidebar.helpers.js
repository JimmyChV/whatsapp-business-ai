import moment from 'moment';

export const repairMojibake = (value = '') => {
    let text = String(value || '');
    if (!text) return '';
    try {
        const decoded = decodeURIComponent(escape(text));
        const cleanDecoded = decoded.replace(/\uFFFD/g, '');
        const cleanOriginal = text.replace(/\uFFFD/g, '');
        if (decoded && decoded !== text && cleanDecoded.length >= Math.floor(cleanOriginal.length * 0.8)) {
            text = decoded;
        }
    } catch (e) { }
    return text.replace(/\uFFFD/g, '');
};

export const formatMoney = (value) => Number(value || 0).toFixed(2);

export const formatMoneyCompact = (value) => {
    const fixed = Number(value || 0).toFixed(2);
    return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

export const parseMoney = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const clampNumber = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

export const normalizeSkuKey = (value = '') => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const normalizeTextKey = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:litros?|lts?|lt|l)\b/g, '$1l')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:mililitros?|ml|cc|cm3)\b/g, '$1ml')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toSentenceCase = (value = '') => {
    const clean = String(value || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};

export const formatQuoteProductTitle = (value = '') => {
    const sentence = toSentenceCase(value);
    return sentence
        .replace(/(\d+(?:[.,]\d+)?)\s*l\b/gi, (_, qty) => `${String(qty).replace(',', '.')} Litros`)
        .replace(/(\d+(?:[.,]\d+)?)\s*ml\b/gi, (_, qty) => `${String(qty).replace(',', '.')} mL`) || 'Producto';
};

export const parseOrderTitleItems = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return [];

    return text
        .replace(/[\r\n]+/g, ',')
        .replace(/[|;]/g, ',')
        .split(',')
        .map((chunk) => String(chunk || '').trim())
        .filter(Boolean)
        .map((chunk, idx) => {
            let name = chunk.replace(/^[-\u2022*]+\s*/, '').trim();
            if (!name) return null;

            let quantity = 1;
            const qtyMatch = name.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|X)\s+(.+)$/);
            if (qtyMatch) {
                const parsedQty = parseMoney(qtyMatch[1], 1);
                quantity = Math.max(1, Math.round((Number.isFinite(parsedQty) ? parsedQty : 1) * 1000) / 1000);
                name = String(qtyMatch[2] || '').trim();
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
        })
        .filter(Boolean);
};

export const normalizeCatalogItem = (item = {}, index = 0) => {
    const safeItem = item && typeof item === 'object' ? item : {};
    const rawTitle = safeItem.title || safeItem.name || safeItem.nombre || safeItem.productName || safeItem.sku || '';

    const parsePrice = (value, fallback = 0) => {
        const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
        return Number.isFinite(fallback) ? fallback : 0;
    };

    const priceNum = parsePrice(safeItem.price ?? safeItem.regular_price ?? safeItem.sale_price ?? safeItem.amount ?? safeItem.precio, 0);
    const regularNum = parsePrice(safeItem.regularPrice ?? safeItem.regular_price ?? safeItem.price ?? safeItem.amount ?? safeItem.precio, priceNum);
    const saleNum = parsePrice(safeItem.salePrice ?? safeItem.sale_price, priceNum);
    const baseFinal = saleNum > 0 && saleNum < regularNum ? saleNum : priceNum;
    const finalNum = baseFinal > 0 ? baseFinal : regularNum;
    const computedDiscount = regularNum > 0 && finalNum > 0 && finalNum < regularNum
        ? Number((((regularNum - finalNum) / regularNum) * 100).toFixed(1))
        : 0;
    const rawDiscount = Number.parseFloat(String(safeItem.discountPct ?? safeItem.discount_pct ?? computedDiscount).replace(',', '.'));
    const discountPct = Number.isFinite(rawDiscount) ? Math.max(0, rawDiscount) : 0;
    const rawCategories = Array.isArray(safeItem.categories)
        ? safeItem.categories
        : (typeof safeItem.categories === 'string'
            ? safeItem.categories.split(',')
            : (safeItem.category
                ? [safeItem.category]
                : (safeItem.categoryName
                    ? [safeItem.categoryName]
                    : (safeItem.category_slug ? [safeItem.category_slug] : []))));
    const categories = rawCategories
        .map((entry) => (typeof entry === 'string' ? entry : (entry?.name || entry?.slug || entry?.title || '')))
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    return {
        id: safeItem.id || safeItem.product_id || `catalog_${index}`,
        title: String(rawTitle || `Producto ${index + 1}`).trim(),
        price: Number.isFinite(finalNum) ? finalNum.toFixed(2) : '0.00',
        regularPrice: Number.isFinite(regularNum) ? regularNum.toFixed(2) : (Number.isFinite(finalNum) ? finalNum.toFixed(2) : '0.00'),
        salePrice: Number.isFinite(saleNum) && saleNum > 0 ? saleNum.toFixed(2) : null,
        discountPct,
        description: safeItem.description || safeItem.short_description || safeItem.descripcion || '',
        imageUrl: safeItem.imageUrl || safeItem.image || safeItem.image_url || safeItem.images?.[0]?.src || null,
        source: safeItem.source || 'unknown',
        sku: safeItem.sku || null,
        stockStatus: safeItem.stockStatus || safeItem.stock_status || null,
        moduleId: String(safeItem.moduleId || safeItem.module_id || '').trim().toLowerCase() || null,
        catalogId: String(safeItem.catalogId || safeItem.catalog_id || '').trim().toUpperCase() || null,
        catalogName: String(safeItem.catalogName || safeItem.catalog_name || safeItem.catalogId || safeItem.catalog_id || '').trim() || null,
        channelType: String(safeItem.channelType || safeItem.channel_type || '').trim().toLowerCase() || null,
        categories
    };
};

export const sanitizeProfileText = (value = '') => repairMojibake(String(value || ''))
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const firstValue = (...values) => {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string') {
            const clean = sanitizeProfileText(value);
            if (clean) return clean;
            continue;
        }
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (Array.isArray(value) && value.length > 0) return value;
        if (typeof value === 'object' && Object.keys(value).length > 0) return value;
    }
    return '';
};

export const formatPhoneForDisplay = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return 'Sin numero visible';
    const normalized = raw.replace(/[^\d+]/g, '');
    if (!normalized) return 'Sin numero visible';
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
};

export const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');

export const isLikelyPhoneDigits = (value = '') => {
    const digits = normalizeDigits(value);
    return digits.length >= 8 && digits.length <= 15;
};

export const looksLikeInternalId = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return false;
    return text.includes('@') || /^\d{14,}$/.test(text);
};

export const formatBoolValue = (value) => (value ? 'Si' : 'No');

export const formatTimestampValue = (value) => {
    const unixValue = Number(value || 0);
    if (!Number.isFinite(unixValue) || unixValue <= 0) return '--';
    const m = moment.unix(unixValue);
    return m.isValid() ? m.format('YYYY-MM-DD HH:mm:ss') : '--';
};

export const avatarColorForName = (name) => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
    if (!name) return colors[0];
    return colors[name.charCodeAt(0) % colors.length];
};

export const AI_CHAT_SCOPE_SEPARATOR = '::mod::';

export const AI_DEFAULT_GREETING = 'Hola, soy tu copiloto comercial de Lavitat. Estoy viendo el contexto real del chat para ayudarte a vender mejor.\n\nPrueba: "Dame 3 respuestas sugeridas" o "Genera 3 cotizaciones con enfoque entrada, equilibrio y premium".';

export const buildDefaultAiThread = () => ([
    { role: 'assistant', content: AI_DEFAULT_GREETING }
]);

export const normalizeAiScopeModuleId = (value = '') => String(value || '').trim().toLowerCase();

export const parseAiScopedChatId = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return { baseChatId: '', scopeModuleId: '' };
    const idx = raw.lastIndexOf(AI_CHAT_SCOPE_SEPARATOR);
    if (idx < 0) return { baseChatId: raw, scopeModuleId: '' };
    const baseChatId = String(raw.slice(0, idx) || '').trim();
    const scopeModuleId = normalizeAiScopeModuleId(raw.slice(idx + AI_CHAT_SCOPE_SEPARATOR.length));
    if (!baseChatId || !scopeModuleId) return { baseChatId: raw, scopeModuleId: '' };
    return { baseChatId, scopeModuleId };
};

export const buildAiScopedChatId = (baseChatId = '', scopeModuleId = '') => {
    const safeBase = String(baseChatId || '').trim();
    const safeScope = normalizeAiScopeModuleId(scopeModuleId);
    if (!safeBase) return '';
    if (!safeScope) return safeBase;
    return `${safeBase}${AI_CHAT_SCOPE_SEPARATOR}${safeScope}`;
};

export const buildAiScopeInfo = (tenantId = 'default', chatId = '', fallbackModuleId = '') => {
    const safeTenant = String(tenantId || 'default').trim() || 'default';
    const parsed = parseAiScopedChatId(chatId);
    const scopeModuleId = normalizeAiScopeModuleId(parsed.scopeModuleId || fallbackModuleId || '');
    const baseChatId = String(parsed.baseChatId || chatId || '').trim();
    const scopeChatId = buildAiScopedChatId(baseChatId, scopeModuleId) || baseChatId;
    const scopeKey = scopeChatId
        ? `${safeTenant}::chat::${scopeChatId}`
        : `${safeTenant}::chat::__tenant__`;
    return {
        tenantId: safeTenant,
        baseChatId,
        scopeModuleId: scopeModuleId || null,
        scopeChatId: scopeChatId || '',
        scopeKey
    };
};