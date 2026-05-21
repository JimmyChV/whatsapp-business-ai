function toText(value = '') {
    return String(value ?? '').trim();
}

function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function normalizeLookup(value = '') {
    return toText(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeSku(value = '') {
    return toText(value).toUpperCase();
}

function parseMoney(value = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value * 100) / 100);
    const clean = toText(value).replace(/[^\d.,-]+/g, '').replace(',', '.');
    const parsed = Number(clean);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function getCommercialConfig(commercialProfile = null) {
    return isPlainObject(commercialProfile?.config) ? commercialProfile.config : {};
}

function normalizeCatalogItem(item = {}, productRoles = {}) {
    const source = isPlainObject(item) ? item : {};
    const metadata = isPlainObject(source.metadata) ? source.metadata : {};
    const sku = normalizeSku(
        source.sku
        || source.itemId
        || source.item_id
        || source.productId
        || source.product_id
        || source.id
    );
    const title = toText(source.title || source.name || source.productName || source.product_name);
    const role = isPlainObject(productRoles[sku])
        ? productRoles[sku]
        : (isPlainObject(source.assignedRole) ? source.assignedRole : {});
    const woo = isPlainObject(metadata.woo) ? metadata.woo : {};
    const categories = [
        role.category,
        ...ensureArray(source.categories),
        ...ensureArray(source.wooCategories).map((entry) => (isPlainObject(entry) ? (entry.name || entry.slug) : entry)),
        ...ensureArray(metadata.categories),
        ...ensureArray(metadata.wooCategories).map((entry) => (isPlainObject(entry) ? (entry.name || entry.slug) : entry)),
        ...ensureArray(woo.wooCategories).map((entry) => (isPlainObject(entry) ? (entry.name || entry.slug) : entry))
    ].map(toText).filter(Boolean);
    return {
        ...source,
        sku,
        title,
        unitPrice: parseMoney(source.price ?? source.finalPrice ?? source.final_price ?? source.unitPrice ?? source.unit_price),
        role: {
            category: toText(role.category),
            role: toText(role.role || 'core').toLowerCase() || 'core',
            priority: Number.isFinite(Number(role.priority)) ? Number(role.priority) : 50,
            rotationRank: Number.isFinite(Number(role.rotationRank ?? role.rotation_rank)) ? Number(role.rotationRank ?? role.rotation_rank) : null,
            complements: ensureArray(role.complements).map(normalizeSku).filter(Boolean),
            substituteSkus: ensureArray(role.substituteSkus || role.substitute_skus).map(normalizeSku).filter(Boolean),
            tags: ensureArray(role.tags).map(toText).filter(Boolean)
        },
        categories: Array.from(new Set(categories)),
        relatedSkus: ensureArray(source.relatedSkus || woo.relatedSkus).map(normalizeSku).filter(Boolean),
        upsellSkus: ensureArray(source.upsellSkus || woo.upsellSkus).map(normalizeSku).filter(Boolean),
        crossSellSkus: ensureArray(source.crossSellSkus || woo.crossSellSkus).map(normalizeSku).filter(Boolean)
    };
}

function productMatchesNeed(product = {}, need = '') {
    const normalizedNeed = normalizeLookup(need);
    if (!normalizedNeed) return true;
    if (normalizeLookup(product.sku) === normalizedNeed) return true;
    if (normalizeLookup(product.title).includes(normalizedNeed)) return true;
    if (normalizeLookup(product.role?.category) === normalizedNeed) return true;
    return ensureArray(product.categories).some((category) => {
        const normalizedCategory = normalizeLookup(category);
        return normalizedCategory === normalizedNeed || normalizedCategory.includes(normalizedNeed) || normalizedNeed.includes(normalizedCategory);
    });
}

function normalizeProducts(catalogItems = [], productRoles = {}) {
    const seen = new Set();
    return ensureArray(catalogItems)
        .map((item) => normalizeCatalogItem(item, productRoles))
        .filter((item) => item.sku && item.title && item.unitPrice > 0)
        .filter((item) => {
            if (seen.has(item.sku)) return false;
            seen.add(item.sku);
            return true;
        });
}

function getCandidateProducts(products = [], understoodNeeds = []) {
    const needs = ensureArray(understoodNeeds).map(toText).filter(Boolean);
    if (needs.length === 0) return products;
    const matched = products.filter((product) => needs.some((need) => productMatchesNeed(product, need)));
    return matched.length ? matched : products;
}

function findByRole(products = [], role = '') {
    const cleanRole = toText(role).toLowerCase();
    return products.filter((product) => toText(product.role?.role).toLowerCase() === cleanRole);
}

function sortByPriceAsc(products = []) {
    return [...products].sort((left, right) => left.unitPrice - right.unitPrice || String(left.title).localeCompare(String(right.title), 'es'));
}

function sortByPriceDesc(products = []) {
    return [...products].sort((left, right) => right.unitPrice - left.unitPrice || String(left.title).localeCompare(String(right.title), 'es'));
}

function sortByCommercialPriority(products = []) {
    return [...products].sort((left, right) => {
        const leftRank = Number.isFinite(Number(left.role?.rotationRank)) ? Number(left.role.rotationRank) : 9999;
        const rightRank = Number.isFinite(Number(right.role?.rotationRank)) ? Number(right.role.rotationRank) : 9999;
        if (leftRank !== rightRank) return leftRank - rightRank;
        const priorityDelta = Number(right.role?.priority || 0) - Number(left.role?.priority || 0);
        if (priorityDelta !== 0) return priorityDelta;
        return right.unitPrice - left.unitPrice;
    });
}

function getPrimaryShippingOption(zoneRule = null) {
    const options = ensureArray(zoneRule?.shippingOptions || zoneRule?.shipping_options);
    return options.find((option) => option?.is_active !== false && option?.isActive !== false) || options[0] || null;
}

function getFreeShippingThreshold(zoneRule = null) {
    const primary = getPrimaryShippingOption(zoneRule);
    const value = primary?.free_from ?? primary?.freeFrom;
    const parsed = parseMoney(value);
    return parsed > 0 ? parsed : null;
}

function buildLine(product = {}, qty = 1) {
    const cleanQty = Math.max(1, Math.floor(Number(qty) || 1));
    const unitPrice = parseMoney(product.unitPrice);
    return {
        sku: product.sku,
        title: product.title,
        qty: cleanQty,
        unitPrice,
        subtotal: Math.round(unitPrice * cleanQty * 100) / 100
    };
}

function aggregateLines(lines = []) {
    const bySku = new Map();
    ensureArray(lines).forEach((line) => {
        if (!line?.sku) return;
        const existing = bySku.get(line.sku);
        if (existing) {
            existing.qty += line.qty;
            existing.subtotal = Math.round(existing.qty * existing.unitPrice * 100) / 100;
            return;
        }
        bySku.set(line.sku, { ...line });
    });
    return Array.from(bySku.values());
}

function finalizeOption({ label, reason, lines, freeShippingThreshold }) {
    const products = aggregateLines(lines).filter((line) => line.sku && line.qty > 0 && line.unitPrice >= 0);
    const total = Math.round(products.reduce((sum, line) => sum + Number(line.subtotal || 0), 0) * 100) / 100;
    const shortfall = freeShippingThreshold && total < freeShippingThreshold
        ? Math.round((freeShippingThreshold - total) * 100) / 100
        : 0;
    return {
        label,
        reason,
        products,
        total,
        freeShipping: Boolean(freeShippingThreshold && total >= freeShippingThreshold),
        shortfall
    };
}

function findComplementProducts(baseProducts = [], allProducts = [], maxComplements = 2) {
    const bySku = new Map(allProducts.map((product) => [product.sku, product]));
    const complementSkus = new Set();
    baseProducts.forEach((product) => {
        [
            ...ensureArray(product.role?.complements),
            ...ensureArray(product.relatedSkus),
            ...ensureArray(product.crossSellSkus),
            ...ensureArray(product.upsellSkus)
        ].map(normalizeSku).filter(Boolean).forEach((sku) => complementSkus.add(sku));
    });
    const explicit = Array.from(complementSkus)
        .map((sku) => bySku.get(sku))
        .filter(Boolean);
    const roleComplements = findByRole(allProducts, 'complement');
    return [...explicit, ...roleComplements]
        .filter((product, index, source) => product?.sku && source.findIndex((entry) => entry?.sku === product.sku) === index)
        .filter((product) => !baseProducts.some((base) => base.sku === product.sku))
        .slice(0, Math.max(0, Number(maxComplements) || 2));
}

function buildEconomicOption(candidates = [], config = {}, freeShippingThreshold = null) {
    const economic = sortByPriceAsc(findByRole(candidates, 'economic'))[0] || sortByPriceAsc(candidates)[0];
    if (!economic) return null;
    const minimum = Number(config?.offerRules?.economicMinTotal || 0);
    const qty = minimum > 0 && economic.unitPrice > 0
        ? Math.max(1, Math.ceil(minimum / economic.unitPrice))
        : 1;
    return finalizeOption({
        label: 'Económica',
        reason: 'Cubre lo esencial al menor costo',
        lines: [buildLine(economic, qty)],
        freeShippingThreshold
    });
}

function buildRecommendedOption(candidates = [], freeShippingThreshold = null) {
    const recommended = sortByCommercialPriority([
        ...findByRole(candidates, 'core'),
        ...candidates
    ])[0] || sortByPriceAsc(candidates)[0];
    if (!recommended) return null;
    return finalizeOption({
        label: 'Recomendada',
        reason: 'Mejor balance calidad/precio',
        lines: [buildLine(recommended, 1)],
        freeShippingThreshold
    });
}

function buildCompleteOption(candidates = [], allProducts = [], config = {}, freeShippingThreshold = null) {
    const kit = sortByCommercialPriority(findByRole(candidates, 'kit'))[0];
    const base = kit || sortByCommercialPriority([
        ...findByRole(candidates, 'premium'),
        ...findByRole(candidates, 'core'),
        ...sortByPriceDesc(candidates)
    ])[0];
    if (!base) return null;
    const maxProducts = Math.max(1, Number(config?.offerRules?.maxProductsPerProposal || 5));
    const complements = kit ? [] : findComplementProducts([base], allProducts, Math.max(0, maxProducts - 1));
    let lines = [buildLine(base, 1), ...complements.map((product) => buildLine(product, 1))];
    const subtotal = lines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0);
    if (
        config?.offerRules?.freeShippingThresholdAware !== false
        && freeShippingThreshold
        && subtotal < freeShippingThreshold
        && (freeShippingThreshold - subtotal) <= Math.max(25, freeShippingThreshold * 0.25)
    ) {
        const addOn = sortByPriceAsc(allProducts)
            .find((product) => !lines.some((line) => line.sku === product.sku) && product.unitPrice <= (freeShippingThreshold - subtotal + 5));
        if (addOn && lines.length < maxProducts) lines.push(buildLine(addOn, 1));
    }
    return finalizeOption({
        label: 'Completa',
        reason: 'Incluye complementos para mayor ahorro',
        lines,
        freeShippingThreshold
    });
}

function ensureThreeOptions(options = [], candidates = [], freeShippingThreshold = null) {
    const valid = ensureArray(options).filter((option) => option && option.products?.length);
    const fallbackProducts = sortByPriceAsc(candidates);
    while (valid.length < 3 && fallbackProducts.length) {
        const product = fallbackProducts[Math.min(valid.length, fallbackProducts.length - 1)];
        const label = valid.length === 0 ? 'Económica' : valid.length === 1 ? 'Recomendada' : 'Completa';
        valid.push(finalizeOption({
            label,
            reason: label === 'Económica'
                ? 'Cubre lo esencial al menor costo'
                : label === 'Recomendada'
                    ? 'Mejor balance calidad/precio'
                    : 'Incluye una alternativa de mayor valor',
            lines: [buildLine(product, 1)],
            freeShippingThreshold
        }));
    }
    return valid.slice(0, 3);
}

async function buildThreeOptions({
    tenantId = '',
    understoodNeeds = [],
    catalogItems = [],
    commercialProfile = null,
    zoneRule = null
} = {}) {
    void tenantId;
    const config = getCommercialConfig(commercialProfile);
    const productRoles = isPlainObject(config.productRoles) ? config.productRoles : {};
    const allProducts = normalizeProducts(catalogItems, productRoles);
    const candidates = getCandidateProducts(allProducts, understoodNeeds);
    const freeShippingThreshold = getFreeShippingThreshold(zoneRule);
    if (!candidates.length) return [];

    const options = [
        buildEconomicOption(candidates, config, freeShippingThreshold),
        buildRecommendedOption(candidates, freeShippingThreshold),
        buildCompleteOption(candidates, allProducts, config, freeShippingThreshold)
    ];
    return ensureThreeOptions(options, candidates, freeShippingThreshold);
}

module.exports = {
    buildThreeOptions,
    normalizeCatalogItem,
    getFreeShippingThreshold,
    parseMoney
};
