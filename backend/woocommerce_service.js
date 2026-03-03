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

function normalizeWooProduct(product) {
    const basePrice = product?.price || product?.regular_price || '0';
    const price = Number.parseFloat(basePrice);
    const normalizedPrice = Number.isFinite(price) ? price.toFixed(2) : '0.00';

    return {
        id: `woo_${product.id}`,
        title: product?.name || `Producto ${product?.id || ''}`.trim(),
        price: normalizedPrice,
        description: product?.short_description || product?.description || '',
        imageUrl: product?.images?.[0]?.src || null,
        sku: product?.sku || null,
        stockStatus: product?.stock_status || null,
        source: 'woocommerce'
    };
}

async function fetchWooProductsPage(page = 1) {
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
    const response = await fetch(endpoint);
    const payload = await response.json();

    if (!response.ok) {
        const message = payload?.message || payload?.code || `WooCommerce error ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return Array.isArray(payload) ? payload : [];
}

async function getWooCatalog() {
    if (!isWooConfigured()) return [];

    const all = [];
    for (let page = 1; page <= WC_MAX_PAGES; page += 1) {
        const pageProducts = await fetchWooProductsPage(page);
        if (!pageProducts.length) break;
        all.push(...pageProducts);
        if (pageProducts.length < WC_PER_PAGE) break;
    }

    const filtered = WC_INCLUDE_OUT_OF_STOCK
        ? all
        : all.filter((p) => p?.stock_status !== 'outofstock');

    return filtered.map(normalizeWooProduct);
}

module.exports = {
    isWooConfigured,
    getWooCatalog
};
