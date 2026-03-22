function normalizeText(value = '') {
    const text = String(value || '').trim();
    return text || null;
}

function normalizePositive(value, fallback, { min = 1, max = 1000 } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.floor(parsed);
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
}

function normalizeWooConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const baseUrlRaw = normalizeText(source.baseUrl || source.url || source.storeUrl || '') || '';
    const baseUrl = baseUrlRaw.replace(/\/+$/, '');
    return {
        enabled: source.enabled !== false,
        baseUrl,
        consumerKey: normalizeText(source.consumerKey || source.key || ''),
        consumerSecret: normalizeText(source.consumerSecret || source.secret || ''),
        perPage: normalizePositive(source.perPage, 100, { min: 10, max: 500 }),
        maxPages: normalizePositive(source.maxPages, 10, { min: 1, max: 200 }),
        includeOutOfStock: source.includeOutOfStock !== false
    };
}

function isWooConfigured(config = {}) {
    const clean = normalizeWooConfig(config);
    return Boolean(clean.enabled && clean.baseUrl && clean.consumerKey && clean.consumerSecret);
}

function htmlToText(html) {
    if (!html) return '';
    return String(html)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function calcDiscountPct(regularPrice, salePrice) {
    const regular = Number.parseFloat(regularPrice);
    const sale = Number.parseFloat(salePrice);
    if (!Number.isFinite(regular) || regular <= 0 || !Number.isFinite(sale) || sale <= 0 || sale >= regular) return 0;
    return Number(((1 - (sale / regular)) * 100).toFixed(1));
}

function parseStoreApiPrice(rawPrice, minorUnit = null) {
    const raw = rawPrice == null ? '' : String(rawPrice).trim();
    if (!raw || raw === '0') return '0.00';

    const parsedMinor = Number.parseInt(String(minorUnit ?? ''), 10);
    const safeMinor = Number.isFinite(parsedMinor) && parsedMinor >= 0 && parsedMinor <= 4
        ? parsedMinor
        : null;

    if (/^-?\d+$/.test(raw)) {
        const intValue = Number(raw);
        if (!Number.isFinite(intValue)) return '0.00';
        if (safeMinor !== null && safeMinor > 0) {
            return (intValue / (10 ** safeMinor)).toFixed(2);
        }
        return intValue.toFixed(2);
    }

    const parsed = Number.parseFloat(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
}

function normalizeWooV3Product(product) {
    const salePriceRaw = product?.sale_price || null;
    const regularPriceRaw = product?.regular_price || product?.price || '0';
    const basePriceRaw = product?.price || regularPriceRaw || '0';

    const price = Number.parseFloat(basePriceRaw);
    const regularPrice = Number.parseFloat(regularPriceRaw);
    const salePrice = Number.parseFloat(salePriceRaw);

    const normalizedPrice = Number.isFinite(price) ? price.toFixed(2) : '0.00';
    const normalizedRegularPrice = Number.isFinite(regularPrice) ? regularPrice.toFixed(2) : normalizedPrice;
    const normalizedSalePrice = Number.isFinite(salePrice) && salePrice > 0 ? salePrice.toFixed(2) : null;
    const categories = Array.isArray(product?.categories)
        ? product.categories.map((c) => String(c?.name || c?.slug || '').trim()).filter(Boolean)
        : [];

    return {
        id: `woo_${product.id}`,
        title: product?.name || `Producto ${product?.id || ''}`.trim(),
        price: normalizedPrice,
        regularPrice: normalizedRegularPrice,
        salePrice: normalizedSalePrice,
        discountPct: calcDiscountPct(normalizedRegularPrice, normalizedSalePrice || normalizedPrice),
        description: htmlToText(product?.short_description || product?.description || ''),
        imageUrl: product?.images?.[0]?.src || null,
        sku: product?.sku || null,
        stockStatus: product?.stock_status || null,
        categories,
        source: 'woocommerce'
    };
}

function normalizeStoreApiProduct(product) {
    const minorUnit = product?.prices?.currency_minor_unit;
    const price = parseStoreApiPrice(product?.prices?.price, minorUnit);
    const regularPrice = parseStoreApiPrice(product?.prices?.regular_price || product?.prices?.price, minorUnit);
    const salePrice = parseStoreApiPrice(product?.prices?.sale_price || '0', minorUnit);
    const categories = Array.isArray(product?.categories)
        ? product.categories.map((c) => String(c?.name || c?.slug || '').trim()).filter(Boolean)
        : [];

    return {
        id: `woo_${product.id}`,
        title: product?.name || `Producto ${product?.id || ''}`.trim(),
        price,
        regularPrice,
        salePrice: salePrice === '0.00' ? null : salePrice,
        discountPct: calcDiscountPct(regularPrice, salePrice === '0.00' ? price : salePrice),
        description: htmlToText(product?.short_description || product?.description || ''),
        imageUrl: product?.images?.[0]?.src || null,
        sku: product?.sku || null,
        stockStatus: product?.is_in_stock === false ? 'outofstock' : 'instock',
        categories,
        source: 'woocommerce'
    };
}

async function fetchJson(endpoint) {
    const response = await fetch(endpoint);
    const payload = await response.json();

    if (!response.ok) {
        const message = payload?.message || payload?.code || `WooCommerce error ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return payload;
}

async function fetchWooV3ProductsPage(config, page = 1) {
    const params = new URLSearchParams({
        consumer_key: config.consumerKey,
        consumer_secret: config.consumerSecret,
        per_page: String(config.perPage),
        page: String(page),
        status: 'publish',
        orderby: 'date',
        order: 'desc'
    });

    const endpoint = `${config.baseUrl}/wp-json/wc/v3/products?${params.toString()}`;
    const payload = await fetchJson(endpoint);
    return Array.isArray(payload) ? payload : [];
}

async function fetchStoreApiProductsPage(config, page = 1) {
    const params = new URLSearchParams({
        per_page: String(config.perPage),
        page: String(page)
    });
    const endpoint = `${config.baseUrl}/wp-json/wc/store/v1/products?${params.toString()}`;
    const payload = await fetchJson(endpoint);
    return Array.isArray(payload) ? payload : [];
}

function applyStockFilter(products, config) {
    return config.includeOutOfStock
        ? products
        : products.filter((p) => p?.stockStatus !== 'outofstock');
}

async function getWooCatalog(options = {}) {
    const config = normalizeWooConfig(options?.config || options || {});
    if (!config.enabled) {
        return {
            products: [],
            source: 'none',
            status: 'disabled',
            reason: 'WooCommerce deshabilitado para este tenant'
        };
    }

    if (!config.baseUrl) {
        return {
            products: [],
            source: 'none',
            status: 'missing_base_url',
            reason: 'Base URL de WooCommerce no configurada'
        };
    }

    if (isWooConfigured(config)) {
        try {
            const allV3 = [];
            for (let page = 1; page <= config.maxPages; page += 1) {
                const pageProducts = await fetchWooV3ProductsPage(config, page);
                if (!pageProducts.length) break;
                allV3.push(...pageProducts);
                if (pageProducts.length < config.perPage) break;
            }

            const normalized = applyStockFilter(allV3.map(normalizeWooV3Product), config);
            if (normalized.length > 0) {
                return { products: normalized, source: 'wc/v3', status: 'ok', reason: null };
            }
        } catch (_) {
            // fallback a Store API
        }
    }

    try {
        const allStore = [];
        for (let page = 1; page <= config.maxPages; page += 1) {
            const pageProducts = await fetchStoreApiProductsPage(config, page);
            if (!pageProducts.length) break;
            allStore.push(...pageProducts);
            if (pageProducts.length < config.perPage) break;
        }

        const normalized = applyStockFilter(allStore.map(normalizeStoreApiProduct), config);
        return {
            products: normalized,
            source: 'wc/store/v1',
            status: normalized.length > 0 ? 'ok' : 'empty',
            reason: normalized.length > 0 ? null : 'Store API devolvio catalogo vacio'
        };
    } catch (error) {
        return {
            products: [],
            source: 'wc/store/v1',
            status: 'error',
            reason: error.message
        };
    }
}

module.exports = {
    normalizeWooConfig,
    isWooConfigured,
    getWooCatalog
};

