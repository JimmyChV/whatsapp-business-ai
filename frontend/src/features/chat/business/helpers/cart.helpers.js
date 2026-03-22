const asNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};

export const getCartLineBreakdown = (
    item = {},
    {
        parseMoney = asNumber,
        roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100,
        clampNumber = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0))
    } = {}
) => {
    const qty = Math.max(1, Math.trunc(parseMoney(item.qty, 1)) || 1);
    const unitPrice = Math.max(0, parseMoney(item.price, 0));
    const regularUnitCandidate = Math.max(0, parseMoney(item.regularPrice, unitPrice));
    const regularUnit = regularUnitCandidate > 0 ? regularUnitCandidate : unitPrice;

    const regularSubtotal = roundMoney(regularUnit * qty);
    const baseSubtotal = roundMoney(unitPrice * qty);
    const includedDiscount = roundMoney(Math.max(regularSubtotal - baseSubtotal, 0));

    const lineDiscountEnabled = Boolean(item.lineDiscountEnabled);
    const lineDiscountType = item.lineDiscountType === 'amount' ? 'amount' : 'percent';
    const rawLineDiscountValue = Math.max(0, parseMoney(item.lineDiscountValue, 0));
    const normalizedLineDiscountValue = lineDiscountType === 'percent'
        ? clampNumber(rawLineDiscountValue, 0, 100)
        : rawLineDiscountValue;

    const additionalDiscountApplied = lineDiscountEnabled
        ? (lineDiscountType === 'amount'
            ? Math.min(baseSubtotal, normalizedLineDiscountValue)
            : baseSubtotal * (normalizedLineDiscountValue / 100))
        : 0;

    const lineFinal = roundMoney(Math.max(0, baseSubtotal - additionalDiscountApplied));

    return {
        qty,
        unitPrice,
        regularUnit,
        regularSubtotal,
        baseSubtotal,
        includedDiscount,
        lineDiscountEnabled,
        lineDiscountType,
        lineDiscountValue: normalizedLineDiscountValue,
        additionalDiscountApplied: roundMoney(additionalDiscountApplied),
        lineFinal
    };
};

export const calculateCartPricing = ({
    cart = [],
    globalDiscountEnabled = false,
    globalDiscountType = 'percent',
    globalDiscountValue = 0,
    deliveryType = 'free',
    deliveryAmount = 0,
    parseMoney = asNumber,
    roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100,
    clampNumber = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0))
} = {}) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    const lineBreakdowns = safeCart.map((item) => ({
        item,
        ...getCartLineBreakdown(item, { parseMoney, roundMoney, clampNumber })
    }));

    const regularSubtotalTotal = roundMoney(lineBreakdowns.reduce((sum, line) => sum + line.regularSubtotal, 0));
    const subtotalProducts = roundMoney(lineBreakdowns.reduce((sum, line) => sum + line.lineFinal, 0));

    const rawGlobalDiscountValue = Math.max(0, parseMoney(globalDiscountValue, 0));
    const normalizedGlobalDiscountValue = globalDiscountType === 'amount'
        ? rawGlobalDiscountValue
        : clampNumber(rawGlobalDiscountValue, 0, 100);

    const globalDiscountApplied = globalDiscountEnabled
        ? roundMoney(Math.min(
            subtotalProducts,
            globalDiscountType === 'amount'
                ? normalizedGlobalDiscountValue
                : subtotalProducts * (normalizedGlobalDiscountValue / 100)
        ))
        : 0;

    const subtotalAfterGlobal = roundMoney(subtotalProducts - globalDiscountApplied);
    const totalDiscountForQuote = roundMoney(Math.max(0, regularSubtotalTotal - subtotalAfterGlobal));

    const safeDeliveryAmount = Math.max(0, parseMoney(deliveryAmount, 0));
    const deliveryFee = deliveryType === 'amount' ? safeDeliveryAmount : 0;
    const cartTotal = roundMoney(subtotalAfterGlobal + deliveryFee);

    return {
        lineBreakdowns,
        regularSubtotalTotal,
        subtotalProducts,
        rawGlobalDiscountValue,
        normalizedGlobalDiscountValue,
        globalDiscountApplied,
        subtotalAfterGlobal,
        totalDiscountForQuote,
        safeDeliveryAmount,
        deliveryFee,
        cartTotal
    };
};

export const buildCartSnapshotPayload = ({
    activeChatId = '',
    lineBreakdowns = [],
    parseMoney = asNumber,
    subtotalProducts = 0,
    totalDiscountForQuote = 0,
    cartTotal = 0,
    deliveryFee = 0,
    deliveryType = 'free',
    globalDiscountEnabled = false,
    globalDiscountType = 'percent',
    normalizedGlobalDiscountValue = 0
} = {}) => ({
    chatId: String(activeChatId || '').trim() || null,
    items: (Array.isArray(lineBreakdowns) ? lineBreakdowns : []).map(({ item, qty, unitPrice, lineDiscountEnabled, lineDiscountType, lineDiscountValue }) => ({
        id: item?.id || null,
        title: item?.title || null,
        qty,
        price: Number(unitPrice || 0),
        regularPrice: Number(parseMoney(item?.regularPrice, unitPrice) || 0),
        category: item?.category || item?.categoryName || null,
        lineDiscountEnabled: Boolean(lineDiscountEnabled),
        lineDiscountType: lineDiscountType === 'amount' ? 'amount' : 'percent',
        lineDiscountValue: Number(lineDiscountValue || 0)
    })),
    subtotal: Number(subtotalProducts || 0),
    discount: Number(totalDiscountForQuote || 0),
    total: Number(cartTotal || 0),
    delivery: Number(deliveryFee || 0),
    currency: 'PEN',
    notes: `delivery=${deliveryType}; globalDiscount=${globalDiscountEnabled ? `${globalDiscountType}:${normalizedGlobalDiscountValue}` : 'none'}`
});

export const buildQuoteMessageFromCart = ({
    cart = [],
    getLineBreakdown,
    regularSubtotalTotal = 0,
    totalDiscountForQuote = 0,
    subtotalAfterGlobal = 0,
    deliveryFee = 0,
    cartTotal = 0,
    formatMoneyCompact,
    formatQuoteProductTitle
} = {}) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    if (safeCart.length === 0) return '';

    const moneyCompact = typeof formatMoneyCompact === 'function'
        ? formatMoneyCompact
        : ((value) => Number(value || 0).toFixed(2));
    const formatTitle = typeof formatQuoteProductTitle === 'function'
        ? formatQuoteProductTitle
        : ((value) => String(value || 'Producto'));

    const separator = '---------------------------------------------';
    const productRows = safeCart.map((item) => {
        const line = typeof getLineBreakdown === 'function' ? getLineBreakdown(item) : { qty: Math.max(1, Number(item?.qty || 1)) };
        return `? *${line.qty}* ${formatTitle(item?.title)}`;
    });

    const paymentRows = [
        `? Subtotal: S/ ${moneyCompact(regularSubtotalTotal)}`,
    ];

    if (Number(totalDiscountForQuote || 0) > 0) {
        paymentRows.push(`? *DESCUENTO: S/ ${moneyCompact(totalDiscountForQuote)}*`);
        paymentRows.push(`? Total con Descuento: S/ ${moneyCompact(subtotalAfterGlobal)}`);
    }

    paymentRows.push(`? Delivery: ${deliveryFee > 0 ? `S/ ${moneyCompact(deliveryFee)}` : 'Gratuito'}`);
    paymentRows.push(`? *TOTAL A PAGAR: S/ ${moneyCompact(cartTotal)}*`);

    return [
        '*? COTIZACION ?*',
        separator,
        '*_DETALLE DE PRODUCTOS:_*',
        separator,
        ...productRows,
        separator,
        '*_DETALLE DE PAGO:_*',
        separator,
        ...paymentRows,
        separator,
    ].join('\n');
};