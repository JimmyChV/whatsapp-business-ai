export const createCatalogProductEmptyForm = () => ({
    title: '',
    price: '',
    regularPrice: '',
    salePrice: '',
    description: '',
    imageUrl: '',
    sku: '',
    stockStatus: 'instock',
    stockQuantity: '',
    categories: '',
    url: '',
    brand: ''
});

export const toCatalogPriceString = (value = '') => {
    const clean = String(value ?? '').trim();
    if (!clean) return '';
    const parsed = Number.parseFloat(clean.replace(',', '.'));
    if (!Number.isFinite(parsed)) return clean;
    return parsed.toFixed(2);
};

const normalizeCategoriesInput = (value = '') => String(value || '')
    .split(',')
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

export const buildCatalogProductPayloadFromForm = (input = {}, { activeCatalogModuleId = '', activeCatalogId = '' } = {}) => {
    const categories = normalizeCategoriesInput(input.categories);
    const price = toCatalogPriceString(input.price);
    const regularPrice = toCatalogPriceString(input.regularPrice || input.price);
    const salePrice = toCatalogPriceString(input.salePrice);
    const stockQuantity = String(input.stockQuantity || '').trim();

    return {
        title: String(input.title || '').trim(),
        price,
        regularPrice,
        salePrice: salePrice || null,
        description: String(input.description || '').trim(),
        imageUrl: String(input.imageUrl || '').trim() || null,
        sku: String(input.sku || '').trim() || null,
        stockStatus: String(input.stockStatus || '').trim().toLowerCase() || null,
        stockQuantity: stockQuantity ? Number.parseInt(stockQuantity, 10) : null,
        categories,
        category: categories[0] || null,
        url: String(input.url || '').trim() || null,
        brand: String(input.brand || '').trim() || null,
        moduleId: activeCatalogModuleId || null,
        catalogId: activeCatalogId || null
    };
};

export const buildCatalogFormDataFromProduct = (product = {}) => {
    const categories = Array.isArray(product?.categories)
        ? product.categories
        : (product?.category ? [product.category] : []);

    return {
        title: String(product?.title || '').trim(),
        price: toCatalogPriceString(product?.price || ''),
        regularPrice: toCatalogPriceString(product?.regularPrice || product?.price || ''),
        salePrice: toCatalogPriceString(product?.salePrice || ''),
        description: String(product?.description || '').trim(),
        imageUrl: String(product?.imageUrl || '').trim(),
        sku: String(product?.sku || '').trim(),
        stockStatus: String(product?.stockStatus || 'instock').trim().toLowerCase() || 'instock',
        stockQuantity: Number.isFinite(Number(product?.stockQuantity)) ? String(product.stockQuantity) : '',
        categories: categories.join(', '),
        url: String(product?.url || product?.permalink || product?.productUrl || product?.link || '').trim(),
        brand: String(product?.brand || '').trim()
    };
};

export const extractCatalogCategoryLabels = (itemOrValue) => {
    if (!itemOrValue) return [];
    const source = itemOrValue && typeof itemOrValue === 'object' && !Array.isArray(itemOrValue)
        ? itemOrValue
        : { categories: itemOrValue };

    const raw = [];
    if (Array.isArray(source.categories)) raw.push(...source.categories);
    else if (typeof source.categories === 'string') raw.push(...source.categories.split(','));

    ['category', 'categoryName', 'category_slug', 'categorySlug'].forEach((key) => {
        if (source[key]) raw.push(source[key]);
    });

    const unique = new Set();
    raw.forEach((entry) => {
        const label = typeof entry === 'string'
            ? entry
            : (entry?.name || entry?.slug || entry?.title || entry?.label || '');
        const clean = String(label || '').trim();
        if (clean) unique.add(clean);
    });

    return Array.from(unique);
};

export const normalizeCatalogCategoryKey = (value = '', normalizer = null) => {
    const clean = String(value || '').trim();
    if (typeof normalizer === 'function') return normalizer(clean);
    return clean.toLowerCase();
};
