const parseMoney = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};

export const toMoney1 = (value) => Math.ceil((Number(value) || 0) * 10) / 10;

export const buildQuoteItemFromCartLine = ({ item = {}, line = {}, index = 0, currency = 'PEN' } = {}) => {
    const safeItem = item && typeof item === 'object' ? item : {};
    const safeLine = line && typeof line === 'object' ? line : {};
    const normalizedCurrency = String(currency || 'PEN').trim() || 'PEN';

    const itemId = String(
        safeItem.itemId
        || safeItem.id
        || safeItem.productId
        || ('item_' + String(index + 1))
    ).trim();

    const productIdRaw = String(safeItem.productId || safeItem.id || '').trim();
    const skuRaw = String(safeItem.sku || '').trim();
    const titleRaw = String(safeItem.title || safeItem.name || 'Producto').trim();
    const unitRaw = String(safeItem.unit || 'unidad').trim();

    const qty = Math.max(1, Math.trunc(parseMoney(safeLine.qty, 1)) || 1);
    const unitPrice = toMoney1(parseMoney(safeLine.unitPrice, 0));
    const lineSubtotal = toMoney1(parseMoney(safeLine.regularSubtotal, 0));

    const lineDiscountEnabled = Boolean(safeLine.lineDiscountEnabled);
    const lineDiscountType = lineDiscountEnabled
        ? (safeLine.lineDiscountType === 'amount' ? 'amount' : 'percent')
        : null;
    const lineDiscountValue = lineDiscountEnabled ? toMoney1(parseMoney(safeLine.lineDiscountValue, 0)) : 0;

    const includedDiscount = parseMoney(safeLine.includedDiscount, 0);
    const additionalDiscountApplied = parseMoney(safeLine.additionalDiscountApplied, 0);
    const lineDiscountAmount = toMoney1(Math.max(0, includedDiscount + additionalDiscountApplied));
    const lineTotal = toMoney1(parseMoney(safeLine.lineFinal, 0));

    return {
        itemId,
        productId: productIdRaw || null,
        sku: skuRaw || null,
        title: titleRaw || 'Producto',
        unit: unitRaw || 'unidad',
        qty,
        unitPrice,
        lineSubtotal,
        lineDiscountType,
        lineDiscountValue,
        lineDiscountAmount,
        lineTotal,
        currency: normalizedCurrency,
        metadata: {
            catalogId: String(safeItem.catalogId || '').trim() || null,
            moduleId: String(safeItem.moduleId || '').trim() || null,
            category: String(safeItem.category || safeItem.categoryName || '').trim() || null
        }
    };
};

export const buildQuoteSummaryFromCart = ({
    cart = [],
    regularSubtotalTotal = 0,
    totalDiscountForQuote = 0,
    subtotalAfterGlobal = 0,
    deliveryFee = 0,
    cartTotal = 0,
    deliveryType = 'none',
    currency = 'PEN'
} = {}) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    const normalizedCurrency = String(currency || 'PEN').trim() || 'PEN';
    const normalizedDeliveryType = String(deliveryType || 'none').trim().toLowerCase() || 'none';
    const normalizedDeliveryAmount = toMoney1(parseMoney(deliveryFee, 0));

    return {
        itemCount: safeCart.length,
        subtotal: toMoney1(parseMoney(regularSubtotalTotal, 0)),
        discount: toMoney1(parseMoney(totalDiscountForQuote, 0)),
        totalAfterDiscount: toMoney1(parseMoney(subtotalAfterGlobal, 0)),
        deliveryAmount: normalizedDeliveryAmount,
        deliveryFree: normalizedDeliveryType !== 'amount' || normalizedDeliveryAmount <= 0,
        totalPayable: toMoney1(parseMoney(cartTotal, 0)),
        currency: normalizedCurrency,
        metadata: {
            deliveryType: normalizedDeliveryType,
            source: 'business_sidebar_cart'
        }
    };
};

export const buildStructuredQuotePayloadFromCart = ({
    activeChatId = '',
    activeChatPhone = '',
    cart = [],
    regularSubtotalTotal = 0,
    totalDiscountForQuote = 0,
    subtotalAfterGlobal = 0,
    deliveryFee = 0,
    cartTotal = 0,
    deliveryType = 'none',
    getLineBreakdown = null,
    buildQuoteMessageFromCart = null,
    formatQuoteProductTitle = null,
    formatMoneyCompact = null,
    quoteId = null,
    currency = 'PEN',
    notes = null,
    metadata = {}
} = {}) => {
    const to = String(activeChatId || '').trim();
    if (!to) return null;

    const safeCart = Array.isArray(cart) ? cart : [];
    if (safeCart.length === 0) return null;

    const normalizedCurrency = String(currency || 'PEN').trim() || 'PEN';
    const items = safeCart.map((item, index) => {
        const line = typeof getLineBreakdown === 'function' ? getLineBreakdown(item) : {};
        const safeItem = item && typeof item === 'object' ? item : {};
        const formattedTitle = typeof formatQuoteProductTitle === 'function'
            ? formatQuoteProductTitle(safeItem.title || safeItem.name || 'Producto')
            : String(safeItem.title || safeItem.name || 'Producto').trim() || 'Producto';

        return buildQuoteItemFromCartLine({
            item: {
                ...safeItem,
                title: formattedTitle
            },
            line,
            index,
            currency: normalizedCurrency
        });
    });

    const summary = buildQuoteSummaryFromCart({
        cart: safeCart,
        regularSubtotalTotal,
        totalDiscountForQuote,
        subtotalAfterGlobal,
        deliveryFee,
        cartTotal,
        deliveryType,
        currency: normalizedCurrency
    });

    const body = typeof buildQuoteMessageFromCart === 'function'
        ? String(buildQuoteMessageFromCart({
            cart: safeCart,
            getLineBreakdown,
            regularSubtotalTotal,
            totalDiscountForQuote,
            subtotalAfterGlobal,
            deliveryFee,
            cartTotal,
            quoteId,
            formatMoneyCompact,
            formatQuoteProductTitle
        }) || '').trim()
        : '';

    return {
        to,
        toPhone: String(activeChatPhone || '').trim() || null,
        body,
        quote: {
            quoteId: String(quoteId || '').trim() || null,
            currency: normalizedCurrency,
            items,
            summary,
            notes: String(notes || '').trim() || null,
            metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
        }
    };
};
