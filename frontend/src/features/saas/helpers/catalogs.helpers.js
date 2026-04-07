export const EMPTY_TENANT_CATALOG_FORM = {
    catalogId: '',
    name: '',
    description: '',
    sourceType: 'local',
    isActive: true,
    isDefault: false,
    wooBaseUrl: '',
    wooPerPage: 100,
    wooMaxPages: 10,
    wooIncludeOutOfStock: true,
    wooConsumerKey: '',
    wooConsumerSecret: '',
    wooConsumerKeyMasked: '',
    wooConsumerSecretMasked: ''
};

export const EMPTY_CATALOG_PRODUCT_FORM = {
    productId: '',
    title: '',
    price: '',
    regularPrice: '',
    salePrice: '',
    description: '',
    imageUrl: '',
    sku: '',
    stockStatus: 'instock',
    stockQuantity: '',
    categoriesText: '',
    url: '',
    brand: '',
    isActive: true
};

export function normalizeCatalogProductItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const productId = String(source.id || source.productId || '').trim();
    if (!productId) return null;
    const categories = Array.isArray(source.categories)
        ? source.categories
        : String(source.category || '').split(',');
    const cleanCategories = categories
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
    const isActive = metadata?.isActive !== false && String(source.stockStatus || source.stock_status || '').trim().toLowerCase() !== 'outofstock';

    return {
        productId,
        title: String(source.title || source.name || '').trim() || productId,
        price: String(source.price || '').trim(),
        regularPrice: String(source.regularPrice || source.regular_price || '').trim(),
        salePrice: String(source.salePrice || source.sale_price || '').trim(),
        description: String(source.description || '').trim(),
        imageUrl: String(source.imageUrl || source.image || '').trim(),
        sku: String(source.sku || '').trim(),
        stockStatus: String(source.stockStatus || source.stock_status || '').trim().toLowerCase() || 'instock',
        stockQuantity: Number.isFinite(Number(source.stockQuantity)) ? String(source.stockQuantity) : '',
        categories: cleanCategories,
        categoriesText: cleanCategories.join(', '),
        url: String(source.url || source.permalink || source.productUrl || source.link || '').trim(),
        brand: String(source.brand || '').trim(),
        moduleId: String(source.moduleId || '').trim().toLowerCase(),
        catalogId: String(source.catalogId || '').trim().toUpperCase(),
        createdAt: String(source.createdAt || '').trim(),
        isActive
    };
}

export function buildCatalogProductFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return { ...EMPTY_CATALOG_PRODUCT_FORM };
    return {
        productId: String(item.productId || item.id || '').trim(),
        title: String(item.title || '').trim(),
        price: String(item.price || '').trim(),
        regularPrice: String(item.regularPrice || '').trim(),
        salePrice: String(item.salePrice || '').trim(),
        description: String(item.description || '').trim(),
        imageUrl: String(item.imageUrl || '').trim(),
        sku: String(item.sku || '').trim(),
        stockStatus: String(item.stockStatus || 'instock').trim().toLowerCase() || 'instock',
        stockQuantity: String(item.stockQuantity || '').trim(),
        categoriesText: String(item.categoriesText || '').trim(),
        url: String(item.url || '').trim(),
        brand: String(item.brand || '').trim(),
        isActive: item.isActive !== false
    };
}

export function buildCatalogProductPayload(form = {}, { moduleId = '', catalogId = '' } = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const categories = String(source.categoriesText || '')
        .split(',')
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    return {
        title: String(source.title || '').trim(),
        price: String(source.price || '').trim(),
        regularPrice: String(source.regularPrice || '').trim(),
        salePrice: String(source.salePrice || '').trim(),
        description: String(source.description || '').trim(),
        imageUrl: String(source.imageUrl || '').trim(),
        sku: String(source.sku || '').trim(),
        stockStatus: String(source.stockStatus || '').trim().toLowerCase(),
        stockQuantity: String(source.stockQuantity || '').trim(),
        categories,
        category: categories[0] || '',
        url: String(source.url || '').trim(),
        brand: String(source.brand || '').trim(),
        moduleId: String(moduleId || '').trim().toLowerCase(),
        catalogId: String(catalogId || '').trim().toUpperCase()
    };
}

export function normalizeCatalogIdsList(value = []) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    return source
        .map((entry) => String(entry || '').trim().toUpperCase())
        .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry))
        .filter((entry) => {
            if (seen.has(entry)) return false;
            seen.add(entry);
            return true;
        });
}

export function normalizeTenantCatalogItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const config = source?.config && typeof source.config === 'object' ? source.config : {};
    const woo = config?.woocommerce && typeof config.woocommerce === 'object' ? config.woocommerce : {};
    const catalogId = String(source.catalogId || source.id || '').trim().toUpperCase();
    if (!catalogId) return null;
    return {
        catalogId,
        name: String(source.name || catalogId).trim() || catalogId,
        description: String(source.description || '').trim() || '',
        sourceType: ['local', 'woocommerce', 'meta'].includes(String(source.sourceType || '').trim().toLowerCase())
            ? String(source.sourceType || '').trim().toLowerCase()
            : 'local',
        isActive: source.is_active !== false && source.isActive !== false,
        isDefault: source.isDefault === true,
        wooBaseUrl: String(woo.baseUrl || woo.base_url || '').trim(),
        wooPerPage: Number(woo.perPage || 100) || 100,
        wooMaxPages: Number(woo.maxPages || 10) || 10,
        wooIncludeOutOfStock: woo.includeOutOfStock !== false,
        wooHasConsumerKey: woo.hasConsumerKey === true || Boolean(String(woo.consumerKey || '').trim()),
        wooHasConsumerSecret: woo.hasConsumerSecret === true || Boolean(String(woo.consumerSecret || '').trim()),
        wooConsumerKeyMasked: String(woo.consumerKeyMasked || '').trim(),
        wooConsumerSecretMasked: String(woo.consumerSecretMasked || '').trim(),
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function buildTenantCatalogFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return EMPTY_TENANT_CATALOG_FORM;
    return {
        catalogId: String(item.catalogId || '').trim().toUpperCase(),
        name: String(item.name || '').trim(),
        description: String(item.description || '').trim(),
        sourceType: ['local', 'woocommerce', 'meta'].includes(String(item.sourceType || '').trim().toLowerCase())
            ? String(item.sourceType || '').trim().toLowerCase()
            : 'local',
        isActive: item.isActive !== false,
        isDefault: item.isDefault === true,
        wooBaseUrl: String(item.wooBaseUrl || '').trim(),
        wooPerPage: Number(item.wooPerPage || 100) || 100,
        wooMaxPages: Number(item.wooMaxPages || 10) || 10,
        wooIncludeOutOfStock: item.wooIncludeOutOfStock !== false,
        wooConsumerKey: '',
        wooConsumerSecret: '',
        wooConsumerKeyMasked: String(item.wooConsumerKeyMasked || '').trim(),
        wooConsumerSecretMasked: String(item.wooConsumerSecretMasked || '').trim()
    };
}

export function buildTenantCatalogPayload(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const payload = {
        catalogId: String(source.catalogId || '').trim().toUpperCase() || undefined,
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        sourceType: ['local', 'woocommerce', 'meta'].includes(String(source.sourceType || '').trim().toLowerCase())
            ? String(source.sourceType || '').trim().toLowerCase()
            : 'local',
        isDefault: source.isDefault === true,
        config: {
            woocommerce: {
                baseUrl: String(source.wooBaseUrl || '').trim() || null,
                perPage: Math.max(10, Math.min(500, Number(source.wooPerPage || 100) || 100)),
                maxPages: Math.max(1, Math.min(100, Number(source.wooMaxPages || 10) || 10)),
                includeOutOfStock: source.wooIncludeOutOfStock !== false,
                consumerKey: String(source.wooConsumerKey || '').trim() || undefined,
                consumerSecret: String(source.wooConsumerSecret || '').trim() || undefined
            }
        }
    };

    if (!payload.config.woocommerce.consumerKey) delete payload.config.woocommerce.consumerKey;
    if (!payload.config.woocommerce.consumerSecret) delete payload.config.woocommerce.consumerSecret;

    return payload;
}

