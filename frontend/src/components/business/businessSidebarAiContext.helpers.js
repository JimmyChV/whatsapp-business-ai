const normalizeModuleId = (value = '') => String(value || '').trim().toLowerCase();
const normalizeCatalogId = (value = '') => String(value || '').trim().toUpperCase();

export const buildBusinessContextPrompt = ({ catalog = [], profile = null, messages = [], cart = [], formatMoney }) => {
    const moneyFormatter = typeof formatMoney === 'function' ? formatMoney : (value) => Number(value || 0).toFixed(2);
    const safeCatalog = Array.isArray(catalog) ? catalog : [];
    const safeMessages = Array.isArray(messages) ? messages : [];
    const safeCart = Array.isArray(cart) ? cart : [];

    const catalogText = safeCatalog.length > 0
        ? safeCatalog.map((p, idx) => `${idx + 1}. ${p.title} | Precio: S/ ${p.price || 'consultar'}${p.description ? ` | ${p.description}` : ''}`).join('\n')
        : '(sin productos en catalogo)';

    const conversationText = safeMessages
        .slice(-15)
        .map((message) => `${message?.fromMe ? 'VENDEDOR' : 'CLIENTE'}: ${message?.body || '[media]'}`)
        .join('\n');

    const cartText = safeCart.length > 0
        ? safeCart
            .map((item, idx) => `- ${idx + 1}) ${item.title} | qty ${item.qty} | precio base S/ ${moneyFormatter(item.price)}${item.lineDiscountEnabled ? ` | desc ${item.lineDiscountType === 'amount' ? 'monto' : '%'} ${moneyFormatter(item.lineDiscountValue)}` : ''}`)
            .join('\n')
        : '(carrito vacio)';

    return `
Eres el copiloto comercial experto de Lavitat en Peru.
Habla con seguridad, sin justificar precio, resaltando formulacion, rendimiento y beneficio tecnico.

NEGOCIO: ${profile?.name || profile?.pushname || 'Lavitat'}
${profile?.description ? `Descripcion: ${profile.description}` : ''}

CATALOGO DISPONIBLE:
${catalogText}

CONVERSACION ACTUAL CON EL CLIENTE:
${conversationText || '(sin mensajes aun)'}

CARRITO ACTUAL (si ya agregaste productos):
${cartText}

INSTRUCCIONES OBLIGATORIAS:
- Si te piden opciones/cotizacion, da 3 alternativas: entrada, equilibrio y premium.
- NO inventes productos, presentaciones ni precios. Usa solo el catalogo listado.
- Si hay carrito con productos, arma 3 cotizaciones separadas usando ese carrito como base.
- Siempre que sea posible, incluye upsell complementario.
- En objecion de precio: responder por formulacion/rendimiento, no por descuento defensivo.
- Para mensajes listos para enviar al cliente, usa [MENSAJE: ...].
- Se claro, breve y vendedor (tono WhatsApp profesional).
    `.trim();
};

export const buildAiRuntimeContext = ({
    activeModuleId = '',
    selectedCatalogModuleId = '',
    waModules = [],
    businessData = {},
    selectedCatalogId = '',
    activeChatPhone = '',
    activeChatDetails = null,
    activeTenantScopeId = 'default',
    profile = null,
    catalog = [],
    lineBreakdowns = [],
    parseMoney,
    subtotalProducts = 0,
    totalDiscountForQuote = 0,
    cartTotal = 0,
    deliveryFee = 0,
    deliveryType = 'free',
    globalDiscountEnabled = false,
    globalDiscountType = 'percent',
    normalizedGlobalDiscountValue = 0,
    messages = [],
    currentAiScopeChatId = '',
    activeChatId = '',
    activeAiScope = null
} = {}) => {
    const parseMoneySafe = typeof parseMoney === 'function'
        ? parseMoney
        : ((value, fallback = 0) => {
            const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
            if (Number.isFinite(parsed)) return parsed;
            return Number.isFinite(fallback) ? fallback : 0;
        });

    const activeModuleIdClean = normalizeModuleId(activeModuleId || selectedCatalogModuleId);
    const modules = Array.isArray(waModules) ? waModules : [];
    const activeModule = modules.find((entry) => normalizeModuleId(entry?.moduleId || entry?.id || '') === activeModuleIdClean) || null;
    const scope = businessData?.catalogMeta?.scope && typeof businessData.catalogMeta.scope === 'object'
        ? businessData.catalogMeta.scope
        : {};

    const selectedCatalog = normalizeCatalogId(selectedCatalogId || scope.catalogId || '');
    const scopeCatalogIds = Array.isArray(scope.catalogIds)
        ? scope.catalogIds.map((entry) => normalizeCatalogId(entry)).filter(Boolean)
        : [];

    const catalogIds = Array.from(new Set([
        selectedCatalog,
        ...scopeCatalogIds
    ].filter(Boolean)));

    const e164Phone = (() => {
        const digits = String(activeChatPhone || activeChatDetails?.phone || '').replace(/\D/g, '');
        if (!digits) return '';
        return `+${digits}`;
    })();

    const customerName = String(
        activeChatDetails?.name
        || activeChatDetails?.pushname
        || activeChatDetails?.shortName
        || ''
    ).trim();

    return {
        tenant: {
            id: String(activeTenantScopeId || 'default').trim() || 'default',
            name: String(profile?.name || profile?.pushname || '').trim() || null,
            plan: null
        },
        module: {
            moduleId: activeModuleIdClean || null,
            name: String(activeModule?.name || '').trim() || null,
            channelType: String(activeModule?.channelType || '').trim().toLowerCase() || 'whatsapp',
            transportMode: 'cloud'
        },
        catalog: {
            catalogId: selectedCatalog || null,
            catalogIds,
            source: String(businessData?.catalogMeta?.source || '').trim().toLowerCase() || 'local',
            items: (Array.isArray(catalog) ? catalog : []).slice(0, 70).map((item) => ({
                id: item.id || null,
                title: item.title || null,
                price: item.price || null,
                regularPrice: item.regularPrice || null,
                salePrice: item.salePrice || null,
                discountPct: Number(item.discountPct || 0) || 0,
                description: item.description || '',
                category: item.category || item.categoryName || null,
                categories: Array.isArray(item.categories) ? item.categories : [],
                catalogId: item.catalogId || selectedCatalog || null,
                catalogName: item.catalogName || null,
                source: item.source || null,
                sku: item.sku || null,
                stockStatus: item.stockStatus || null,
                imageUrl: item.imageUrl || null,
                presentation: item.presentation || item?.metadata?.presentation || item?.metadata?.presentacion || null,
                aroma: item.aroma || item?.metadata?.aroma || item?.metadata?.scent || null,
                hypoallergenic: typeof item?.metadata?.hypoallergenic === 'boolean' ? item.metadata.hypoallergenic : null,
                petFriendly: typeof item?.metadata?.petFriendly === 'boolean'
                    ? item.metadata.petFriendly
                    : (typeof item?.metadata?.pet_friendly === 'boolean' ? item.metadata.pet_friendly : null)
            }))
        },
        cart: {
            items: (Array.isArray(lineBreakdowns) ? lineBreakdowns : []).map(({ item, qty, unitPrice }) => ({
                id: item?.id || null,
                title: item?.title || null,
                qty,
                price: Number(unitPrice || 0),
                regularPrice: Number(parseMoneySafe(item?.regularPrice, unitPrice) || 0),
                category: item?.category || item?.categoryName || null,
                lineDiscountEnabled: Boolean(item?.lineDiscountEnabled),
                lineDiscountType: item?.lineDiscountType === 'amount' ? 'amount' : 'percent',
                lineDiscountValue: Number(parseMoneySafe(item?.lineDiscountValue, 0) || 0)
            })),
            subtotal: Number(subtotalProducts || 0),
            discount: Number(totalDiscountForQuote || 0),
            total: Number(cartTotal || 0),
            delivery: Number(deliveryFee || 0),
            currency: 'PEN',
            notes: `delivery=${deliveryType}; globalDiscount=${globalDiscountEnabled ? `${globalDiscountType}:${normalizedGlobalDiscountValue}` : 'none'}`
        },
        chat: {
            chatId: String(currentAiScopeChatId || activeChatId || '').trim(),
            scopeModuleId: activeAiScope?.scopeModuleId || null,
            phone: e164Phone || null,
            recentMessages: (Array.isArray(messages) ? messages : []).slice(-18).map((entry) => ({
                fromMe: entry?.fromMe === true,
                body: String(entry?.body || '').trim(),
                type: String(entry?.type || '').trim().toLowerCase() || 'chat',
                timestamp: Number(entry?.timestamp || 0) || null
            }))
        },
        customer: {
            customerId: String(activeChatDetails?.customerId || '').trim() || null,
            phoneE164: e164Phone || null,
            name: customerName || null
        },
        ui: {
            contextSource: 'business_sidebar'
        }
    };
};