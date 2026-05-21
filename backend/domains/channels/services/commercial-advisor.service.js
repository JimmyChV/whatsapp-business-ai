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

function tokenizeNormalized(value = '') {
    return normalizeLookup(value)
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean);
}

function textContainsNormalized(text = '', needle = '') {
    const normalizedText = normalizeLookup(text);
    const normalizedNeedle = normalizeLookup(needle);
    if (!normalizedText || !normalizedNeedle) return false;
    return ` ${normalizedText} `.includes(` ${normalizedNeedle} `);
}

function getCommercialConfig(commercialProfile = null) {
    if (!commercialProfile || typeof commercialProfile !== 'object') return {};
    return isPlainObject(commercialProfile.config) ? commercialProfile.config : {};
}

function getProfileCategories(commercialProfile = null) {
    const config = getCommercialConfig(commercialProfile);
    return ensureArray(config.categories)
        .map((entry) => (isPlainObject(entry) ? entry : {}))
        .map((entry) => ({
            id: toText(entry.id || entry.categoryId || entry.name),
            name: toText(entry.name || entry.label || entry.id || entry.categoryId)
        }))
        .filter((entry) => entry.id || entry.name);
}

function getProductRoleMap(commercialProfile = null) {
    const config = getCommercialConfig(commercialProfile);
    return isPlainObject(config.productRoles) ? config.productRoles : {};
}

function normalizeCatalogItem(item = {}) {
    const source = isPlainObject(item) ? item : {};
    const metadata = isPlainObject(source.metadata) ? source.metadata : {};
    const role = isPlainObject(source.assignedRole)
        ? source.assignedRole
        : (isPlainObject(source.role) ? source.role : null);
    const sku = normalizeSku(
        source.sku
        || source.itemId
        || source.item_id
        || source.productId
        || source.product_id
        || source.id
    );
    const title = toText(source.title || source.name || source.productName || source.product_name);
    const categories = [
        ...ensureArray(source.categories),
        ...ensureArray(source.wooCategories).map((entry) => (isPlainObject(entry) ? (entry.name || entry.slug) : entry)),
        ...ensureArray(metadata.categories),
        ...ensureArray(metadata.wooCategories).map((entry) => (isPlainObject(entry) ? (entry.name || entry.slug) : entry)),
        role?.category
    ]
        .map(toText)
        .filter(Boolean);
    return {
        ...source,
        sku,
        title,
        categories,
        role
    };
}

function resolveSynonyms(text = '', synonyms = []) {
    const matches = [];
    const seen = new Set();
    ensureArray(synonyms).forEach((entry = {}) => {
        const term = toText(entry.term);
        const mapsTo = toText(entry.mapsTo || entry.maps_to);
        const mapsToType = toText(entry.mapsToType || entry.maps_to_type || 'category').toLowerCase() || 'category';
        if (!term || !mapsTo) return;
        if (!textContainsNormalized(text, term)) return;
        const key = `${normalizeLookup(term)}:${normalizeLookup(mapsTo)}:${mapsToType}`;
        if (seen.has(key)) return;
        seen.add(key);
        matches.push({
            original: term,
            mapsTo,
            mapsToType
        });
    });
    return matches;
}

function detectIntent(lastMessage = '', history = []) {
    const text = normalizeLookup(lastMessage);
    const previousText = ensureArray(history)
        .slice(-6)
        .map((entry) => normalizeLookup(entry?.text || entry?.body || entry?.message || entry))
        .filter(Boolean)
        .join(' ');
    const combined = `${previousText} ${text}`.trim();

    if (/\b(te aviso|luego veo|despues veo|mas tarde|te escribo|lo pienso|vere luego|avisare)\b/.test(text)) {
        return 'soft_pause';
    }
    if (/\b(caro|muy caro|precio alto|no tengo tanto|se me escapa|muy costoso|costoso)\b/.test(text)) {
        return 'objection_price';
    }
    if (/\b(si|sí|dale|ok|okay|ya|eso quiero|lo quiero|confirmo|confirmar|de acuerdo)\b/.test(text) && text.length <= 40) {
        return 'confirm';
    }
    if (/\b(envio|delivery|reparto|entrega|cobertura|llegan|llega|despacho|despachan|contraentrega|contra entrega)\b/.test(text)) {
        return 'ask_delivery';
    }
    if (/\b(promocion|promociones|promo|oferta|ofertas|kit|kits|combo|combos|paquete|paquetes)\b/.test(text)) {
        return 'ask_promotions';
    }
    if (/\b(comparar|comparame|diferencia|cual conviene|cual me recomiendas|mejor opcion|opciones)\b/.test(text)) {
        return 'compare';
    }
    if (/\b(precio|cuanto|cuanto cuesta|cuesta|sale|valor|total|cuanto me sale)\b/.test(text)) {
        return 'ask_price';
    }
    if (/\b(que productos|productos tienen|que tienen|catalogo|catalogo|opciones|que venden|tienes algo|tienen algo)\b/.test(text)) {
        return 'ask_products';
    }
    if (/\b(quiero|quisiera|necesito|me interesa|comprar|pedido|llevo|agregar|cotizar|cotizame)\b/.test(text)) {
        return 'buy_direct';
    }
    if (/\b(producto|productos|detergente|suavizante|lavavajillas|limpiador)\b/.test(combined) && /\b(quiero|necesito|me interesa)\b/.test(text)) {
        return 'buy_direct';
    }
    return 'unknown';
}

function detectNeeds(text = '', synonymsResolved = [], catalogItems = [], commercialProfile = null) {
    const needs = [];
    const seen = new Set();
    const addNeed = (need = {}) => {
        const inputText = toText(need.inputText || need.resolvedSku || need.resolvedCategory);
        const key = [
            normalizeLookup(inputText),
            normalizeLookup(need.resolvedCategory || ''),
            normalizeSku(need.resolvedSku || '')
        ].join(':');
        if (!inputText || seen.has(key)) return;
        seen.add(key);
        needs.push({
            inputText,
            resolvedCategory: toText(need.resolvedCategory || '') || null,
            resolvedSku: normalizeSku(need.resolvedSku || '') || null,
            confidence: ['high', 'medium', 'low'].includes(need.confidence) ? need.confidence : 'medium'
        });
    };

    ensureArray(synonymsResolved).forEach((match) => {
        if (!match) return;
        if (match.mapsToType === 'product') {
            addNeed({
                inputText: match.original,
                resolvedSku: match.mapsTo,
                confidence: 'medium'
            });
            return;
        }
        addNeed({
            inputText: match.original,
            resolvedCategory: match.mapsTo,
            confidence: match.mapsToType === 'category' ? 'high' : 'medium'
        });
    });

    getProfileCategories(commercialProfile).forEach((category) => {
        const id = category.id || category.name;
        const name = category.name || category.id;
        if (textContainsNormalized(text, id) || textContainsNormalized(text, name)) {
            addNeed({
                inputText: name,
                resolvedCategory: id,
                confidence: 'high'
            });
        }
    });

    const roleMap = getProductRoleMap(commercialProfile);
    ensureArray(catalogItems).map(normalizeCatalogItem).forEach((item) => {
        const role = isPlainObject(roleMap[item.sku]) ? roleMap[item.sku] : item.role;
        const terms = [
            item.sku,
            item.title,
            ...ensureArray(item.categories),
            ...ensureArray(item.wooTags),
            ...ensureArray(item.tags)
        ].filter(Boolean);
        const matchedTerm = terms.find((term) => textContainsNormalized(text, term));
        if (matchedTerm && item.sku) {
            addNeed({
                inputText: matchedTerm,
                resolvedCategory: role?.category || item.categories[0] || null,
                resolvedSku: item.sku,
                confidence: matchedTerm === item.sku || matchedTerm === item.title ? 'high' : 'medium'
            });
            return;
        }
        if (role?.category && textContainsNormalized(text, role.category)) {
            addNeed({
                inputText: role.category,
                resolvedCategory: role.category,
                resolvedSku: null,
                confidence: 'medium'
            });
        }
    });

    if (needs.length === 0) {
        tokenizeNormalized(text).forEach((token) => {
            if (token.length >= 5) {
                const product = ensureArray(catalogItems).map(normalizeCatalogItem).find((item) => normalizeLookup(item.title).split(' ').includes(token));
                if (product?.sku) {
                    addNeed({
                        inputText: token,
                        resolvedCategory: product.role?.category || product.categories?.[0] || null,
                        resolvedSku: product.sku,
                        confidence: 'low'
                    });
                }
            }
        });
    }

    return needs;
}

function determineSalesStage(intent = 'unknown', history = [], currentSalesState = {}) {
    const state = isPlainObject(currentSalesState) ? currentSalesState : {};
    if (intent === 'soft_pause') return 'soft_pause';
    if (intent === 'objection_price') return 'objection';
    if (intent === 'confirm') {
        if (state.proposedOptions && !state.chosenOption) return 'option_selection';
        return 'closing';
    }
    if (state.chosenOption && !state.quantity) return 'quote_ready';
    if (state.proposedOptions && !state.chosenOption) return 'option_selection';
    if (['buy_direct', 'ask_price', 'ask_promotions', 'compare'].includes(intent)) return 'recommendation';
    if (intent === 'ask_products') return 'exploration';
    if (intent === 'ask_delivery') return state.stage || 'exploration';
    const recentHistory = ensureArray(history).slice(-8);
    if (recentHistory.some((entry) => normalizeLookup(entry?.text || entry?.body || entry).includes('opcion'))) {
        return 'option_selection';
    }
    return state.stage || 'exploration';
}

function buildForbiddenList(commercialProfile = null) {
    const config = getCommercialConfig(commercialProfile);
    const avoid = ensureArray(config?.brandPositioning?.avoid).map(toText).filter(Boolean);
    return Array.from(new Set([
        'inventar productos',
        'inventar precios',
        'inventar descuentos',
        'inventar cobertura',
        'inventar disponibilidad',
        ...avoid
    ]));
}

function resolveNextBestActionBase({ stage, intent, normalizedProducts, currentSalesState }) {
    const state = isPlainObject(currentSalesState) ? currentSalesState : {};
    if (state.proposedOptions && !state.chosenOption) return 'ask_which_option';
    if (stage === 'soft_pause') return 'soft_acknowledge';
    if (stage === 'objection') return 'handle_price_objection';
    if (intent === 'ask_delivery') return 'ask_delivery_first';
    if (intent === 'confirm') return 'confirm_closing';
    if (['buy_direct', 'ask_price', 'ask_promotions', 'compare'].includes(intent) && normalizedProducts.length > 0) {
        return 'present_three_options';
    }
    if (intent === 'ask_products') return 'present_categories';
    if (normalizedProducts.length > 0) return 'present_three_options';
    return 'ask_discovery_question';
}

async function analyzeSalesContext({
    tenantId = '',
    lastMessage = '',
    conversationHistory = [],
    catalogItems = [],
    commercialProfile = null,
    currentSalesState = {}
} = {}) {
    void tenantId;
    const config = getCommercialConfig(commercialProfile);
    const synonymsUsed = resolveSynonyms(lastMessage, config.synonyms || []);
    const intent = detectIntent(lastMessage, conversationHistory);
    const normalizedProducts = detectNeeds(lastMessage, synonymsUsed, catalogItems, commercialProfile);
    const understoodNeeds = Array.from(new Set(normalizedProducts
        .map((item) => item.resolvedCategory || item.resolvedSku || item.inputText)
        .map(toText)
        .filter(Boolean)));
    const stage = determineSalesStage(intent, conversationHistory, currentSalesState);
    const shouldBuildOptions = Boolean(
        config?.offerRules?.threeOptions !== false
        && ['recommendation', 'option_selection'].includes(stage)
        && understoodNeeds.length > 0
        && ['buy_direct', 'ask_price', 'ask_promotions', 'compare', 'unknown'].includes(intent)
    );
    const shouldAskQuantity = Boolean(
        stage === 'quote_ready'
        || (currentSalesState?.chosenOption && !currentSalesState?.quantity)
    );
    const shouldEscalate = false;
    const nextBestAction = resolveNextBestActionBase({
        stage,
        intent,
        normalizedProducts,
        currentSalesState
    });

    return {
        stage,
        intent,
        understoodNeeds,
        normalizedProducts,
        synonymsUsed,
        nextBestAction,
        forbidden: buildForbiddenList(commercialProfile),
        shouldBuildOptions,
        shouldAskQuantity,
        shouldEscalate
    };
}

module.exports = {
    analyzeSalesContext,
    resolveSynonyms,
    detectIntent,
    detectNeeds,
    determineSalesStage,
    normalizeLookup
};
