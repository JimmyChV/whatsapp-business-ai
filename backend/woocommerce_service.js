require('dotenv').config();

const WC_BASE_URL = (process.env.WC_BASE_URL || '').replace(/\/+$/, '');
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY || '';
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET || '';
const WC_PER_PAGE = Number(process.env.WC_PER_PAGE || 100);
const WC_MAX_PAGES = Number(process.env.WC_MAX_PAGES || 10);
const WC_INCLUDE_OUT_OF_STOCK = String(process.env.WC_INCLUDE_OUT_OF_STOCK || 'true').toLowerCase() === 'true';

function isWooConfigured() {
    return Boolean(WC_BASE_URL && WC_CONSUMER_KEY && WC_CONSUMER_SECRET);
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

function parseStoreApiPrice(rawPrice) {
    const raw = rawPrice == null ? '' : String(rawPrice);
    if (!raw || raw === '0') return '0.00';
    // Store API may return integers in minor units (e.g., "12990" for 129.90)
    if (/^\d+$/.test(raw) && raw.length > 2) {
        return (Number(raw) / 100).toFixed(2);
    }
    const parsed = Number.parseFloat(raw);
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
        source: 'woocommerce'
    };
}

function normalizeStoreApiProduct(product) {
    const price = parseStoreApiPrice(product?.prices?.price);
    const regularPrice = parseStoreApiPrice(product?.prices?.regular_price || product?.prices?.price);
    const salePrice = parseStoreApiPrice(product?.prices?.sale_price || '0');

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

async function fetchWooV3ProductsPage(page = 1) {
    const params = new URLSearchParams({
        consumer_key: WC_CONSUMER_KEY,
        consumer_secret: WC_CONSUMER_SECRET,
        per_page: String(WC_PER_PAGE),
        page: String(page),
        status: 'publish',
        orderby: 'date',
        order: 'desc'
    });

    const endpoint = `${WC_BASE_URL}/wp-json/wc/v3/products?${params.toString()}`;
    const payload = await fetchJson(endpoint);
    return Array.isArray(payload) ? payload : [];
}

async function fetchStoreApiProductsPage(page = 1) {
    const params = new URLSearchParams({
        per_page: String(WC_PER_PAGE),
        page: String(page)
    });
    const endpoint = `${WC_BASE_URL}/wp-json/wc/store/v1/products?${params.toString()}`;
    const payload = await fetchJson(endpoint);
    return Array.isArray(payload) ? payload : [];
}

function applyStockFilter(products) {
    return WC_INCLUDE_OUT_OF_STOCK
        ? products
        : products.filter((p) => p?.stockStatus !== 'outofstock');
}

async function getWooCatalog() {
    if (!WC_BASE_URL) {
        return {
            products: [],
            source: 'none',
            status: 'missing_base_url',
            reason: 'WC_BASE_URL no configurado'
        };
    }

    if (isWooConfigured()) {
        try {
            const allV3 = [];
            for (let page = 1; page <= WC_MAX_PAGES; page += 1) {
                const pageProducts = await fetchWooV3ProductsPage(page);
                if (!pageProducts.length) break;
                allV3.push(...pageProducts);
                if (pageProducts.length < WC_PER_PAGE) break;
            }

            const normalized = applyStockFilter(allV3.map(normalizeWooV3Product));
            if (normalized.length > 0) {
                return { products: normalized, source: 'wc/v3', status: 'ok', reason: null };
            }

            console.log('[Catalog][Woo] wc/v3 returned 0 products, trying Store API fallback.');
        } catch (error) {
            console.log('[Catalog][Woo] wc/v3 failed, trying Store API fallback.', error.message);
        }
    } else {
        console.log('[Catalog][Woo] Credentials not configured; trying public Store API.');
    }

    try {
        const allStore = [];
        for (let page = 1; page <= WC_MAX_PAGES; page += 1) {
            const pageProducts = await fetchStoreApiProductsPage(page);
            if (!pageProducts.length) break;
            allStore.push(...pageProducts);
            if (pageProducts.length < WC_PER_PAGE) break;
        }

        const normalized = applyStockFilter(allStore.map(normalizeStoreApiProduct));
        return {
            products: normalized,
            source: 'wc/store/v1',
            status: normalized.length > 0 ? 'ok' : 'empty',
            reason: normalized.length > 0 ? null : 'Store API devolvió catálogo vacío'
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
    isWooConfigured,
    getWooCatalog
};
