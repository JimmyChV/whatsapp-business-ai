const asNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};

export const floorMoney1 = (value = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.floor(num * 10) / 10;
};

export const formatQuoteMoney1 = (value = 0) => `S/ ${floorMoney1(value).toFixed(1)}`;

export const calcQuoteItem = (item = {}) => {
    const source = item && typeof item === 'object' ? item : {};
    const qty = Math.max(1, Math.trunc(asNumber(source.qty ?? source.quantity, 1)) || 1);
    const unitPrice = asNumber(source.unitPrice ?? source.price, 0);
    const regularPrice = asNumber(source.regularPrice ?? source.regular_price, unitPrice);
    const base = floorMoney1(unitPrice);
    const linDiscountPct = Math.min(100, Math.max(0, asNumber(
        source.linDiscountPct
        ?? source.lineDiscountPct
        ?? (source.lineDiscountType === 'percent' || source.lineDiscountEnabled ? source.lineDiscountValue : 0),
        0
    )));
    const descAmt = floorMoney1(base * linDiscountPct / 100);
    const finalPrice = floorMoney1(Math.max(0, base - descAmt));
    const subtotal = floorMoney1(finalPrice * qty);

    return {
        ...source,
        qty,
        quantity: qty,
        base,
        unitPrice: base,
        regularPrice: floorMoney1(regularPrice || unitPrice),
        linDiscountPct,
        linDiscountAmt: descAmt,
        descAmt,
        finalPrice,
        subtotal,
        excludeFromGlobal: source.excludeFromGlobal === true
    };
};

export const calcQuoteTotals = (items = [], globalDiscPct = 0, globalOnRegular = false, delivery = 0) => {
    const calcedItems = (Array.isArray(items) ? items : []).map(calcQuoteItem);
    const participants = calcedItems.filter((item) => !item.excludeFromGlobal);
    const excluded = calcedItems.filter((item) => item.excludeFromGlobal);
    const safeGlobalPct = Math.min(100, Math.max(0, asNumber(globalDiscPct, 0)));

    const baseGlobal = globalOnRegular
        ? floorMoney1(participants.reduce((acc, item) => acc + floorMoney1((item.regularPrice || item.unitPrice) * item.qty), 0))
        : floorMoney1(participants.reduce((acc, item) => acc + item.subtotal, 0));

    const globalDiscAmt = floorMoney1(baseGlobal * safeGlobalPct / 100);
    const subtotalParticipants = floorMoney1(participants.reduce((acc, item) => acc + item.subtotal, 0));
    const subtotalExcluded = floorMoney1(excluded.reduce((acc, item) => acc + item.subtotal, 0));
    const subtotal = floorMoney1(subtotalParticipants + subtotalExcluded);
    const deliveryAmt = floorMoney1(delivery || 0);
    const total = floorMoney1(Math.max(0, subtotal - globalDiscAmt + deliveryAmt));

    return {
        calcedItems,
        participants,
        excluded,
        baseGlobal,
        subtotalParticipants,
        subtotalExcluded,
        subtotal,
        globalDiscPct: safeGlobalPct,
        globalDiscAmt,
        globalOnRegular: Boolean(globalOnRegular),
        deliveryAmt,
        total
    };
};

export const getCartLineBreakdown = (
    item = {},
    {
        parseMoney = asNumber,
        roundMoney = floorMoney1,
        clampNumber = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0))
    } = {}
) => {
    const safeItem = item && typeof item === 'object' ? item : {};
    const unitPrice = Math.max(0, parseMoney(safeItem.price ?? safeItem.unitPrice, 0));
    const regularUnit = Math.max(0, parseMoney(safeItem.regularPrice, unitPrice));
    const lineDiscountPct = clampNumber(parseMoney(
        safeItem.linDiscountPct
        ?? safeItem.lineDiscountPct
        ?? (safeItem.lineDiscountEnabled ? safeItem.lineDiscountValue : 0),
        0
    ), 0, 100);
    const calced = calcQuoteItem({
        ...safeItem,
        unitPrice,
        regularPrice: regularUnit || unitPrice,
        linDiscountPct: lineDiscountPct
    });
    const baseSubtotal = roundMoney(calced.base * calced.qty);
    const regularSubtotal = roundMoney(calced.regularPrice * calced.qty);
    const includedDiscount = roundMoney(Math.max(regularSubtotal - baseSubtotal, 0));
    const additionalDiscountApplied = roundMoney(calced.linDiscountAmt * calced.qty);

    return {
        qty: calced.qty,
        unitPrice: calced.base,
        regularUnit: calced.regularPrice,
        regularSubtotal,
        baseSubtotal,
        includedDiscount,
        lineDiscountEnabled: calced.linDiscountPct > 0,
        lineDiscountType: 'percent',
        lineDiscountValue: calced.linDiscountPct,
        lineDiscountPct: calced.linDiscountPct,
        lineDiscountAmount: additionalDiscountApplied,
        additionalDiscountApplied,
        lineFinal: calced.subtotal,
        finalPrice: calced.finalPrice,
        subtotal: calced.subtotal,
        excludeFromGlobal: calced.excludeFromGlobal
    };
};

export const calculateCartPricing = ({
    cart = [],
    globalDiscountEnabled = false,
    globalDiscountType = 'percent',
    globalDiscountValue = 0,
    globalOnRegular = false,
    deliveryType = 'free',
    deliveryAmount = 0,
    parseMoney = asNumber,
    roundMoney = floorMoney1,
    clampNumber = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0))
} = {}) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    const lineBreakdowns = safeCart.map((item) => ({
        item,
        ...getCartLineBreakdown(item, { parseMoney, roundMoney, clampNumber })
    }));

    const normalizedGlobalDiscountValue = globalDiscountEnabled
        ? clampNumber(parseMoney(globalDiscountValue, 0), 0, 100)
        : 0;
    const safeDeliveryAmount = Math.max(0, parseMoney(deliveryAmount, 0));
    const deliveryFee = deliveryType === 'amount' ? roundMoney(safeDeliveryAmount) : 0;
    const totals = calcQuoteTotals(
        lineBreakdowns.map(({ item, ...line }) => ({
            ...item,
            qty: line.qty,
            unitPrice: line.unitPrice,
            regularPrice: line.regularUnit,
            linDiscountPct: line.lineDiscountPct,
            excludeFromGlobal: line.excludeFromGlobal
        })),
        normalizedGlobalDiscountValue,
        Boolean(globalOnRegular),
        deliveryFee
    );
    const regularSubtotalTotal = roundMoney(lineBreakdowns.reduce((sum, line) => sum + line.regularSubtotal, 0));
    const subtotalProducts = totals.subtotal;
    const globalDiscountApplied = totals.globalDiscAmt;
    const subtotalAfterGlobal = roundMoney(subtotalProducts - globalDiscountApplied);
    const lineDiscountTotal = roundMoney(lineBreakdowns.reduce((sum, line) => sum + line.additionalDiscountApplied + line.includedDiscount, 0));
    const totalDiscountForQuote = roundMoney(lineDiscountTotal + globalDiscountApplied);
    const cartTotal = totals.total;

    return {
        lineBreakdowns,
        regularSubtotalTotal,
        subtotalProducts,
        rawGlobalDiscountValue: normalizedGlobalDiscountValue,
        normalizedGlobalDiscountValue,
        globalDiscountApplied,
        globalOnRegular: Boolean(globalOnRegular),
        subtotalParticipants: totals.subtotalParticipants,
        subtotalExcluded: totals.subtotalExcluded,
        baseGlobal: totals.baseGlobal,
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
    normalizedGlobalDiscountValue = 0,
    globalOnRegular = false
} = {}) => ({
    chatId: String(activeChatId || '').trim() || null,
    items: (Array.isArray(lineBreakdowns) ? lineBreakdowns : []).map(({ item, qty, unitPrice, regularUnit, lineDiscountPct, additionalDiscountApplied, finalPrice, subtotal, excludeFromGlobal }) => ({
        id: item?.id || null,
        title: item?.title || null,
        qty,
        price: Number(unitPrice || 0),
        regularPrice: Number(parseMoney(item?.regularPrice, regularUnit || unitPrice) || 0),
        category: item?.category || item?.categoryName || null,
        lineDiscountEnabled: Number(lineDiscountPct || 0) > 0,
        lineDiscountType: 'percent',
        lineDiscountValue: Number(lineDiscountPct || 0),
        linDiscountPct: Number(lineDiscountPct || 0),
        linDiscountAmt: Number(additionalDiscountApplied || 0),
        finalPrice: Number(finalPrice || 0),
        subtotal: Number(subtotal || 0),
        excludeFromGlobal: Boolean(excludeFromGlobal)
    })),
    subtotal: Number(subtotalProducts || 0),
    discount: Number(totalDiscountForQuote || 0),
    total: Number(cartTotal || 0),
    delivery: Number(deliveryFee || 0),
    currency: 'PEN',
    notes: `delivery=${deliveryType}; globalDiscount=${globalDiscountEnabled ? `percent:${normalizedGlobalDiscountValue}` : 'none'}; globalOnRegular=${Boolean(globalOnRegular)}`
});

export const buildQuoteMessageFromCart = ({
    cart = [],
    getLineBreakdown,
    regularSubtotalTotal = 0,
    totalDiscountForQuote = 0,
    subtotalProducts = 0,
    deliveryFee = 0,
    cartTotal = 0,
    quoteId = null,
    formatMoneyCompact,
    formatQuoteProductTitle
} = {}) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    if (safeCart.length === 0) return '';

    const moneyCompact = typeof formatMoneyCompact === 'function'
        ? formatMoneyCompact
        : ((value) => floorMoney1(value).toFixed(1).replace(/\.0$/, ''));
    const formatTitle = typeof formatQuoteProductTitle === 'function'
        ? formatQuoteProductTitle
        : ((value) => String(value || 'Producto'));

    const separator = '---------------------------------------------';
    const productRows = safeCart.flatMap((item) => {
        const line = typeof getLineBreakdown === 'function' ? getLineBreakdown(item) : { qty: Math.max(1, Number(item?.qty || 1)) };
        const rows = [
            `*${formatTitle(item?.title)}* x ${line.qty}        S/ ${moneyCompact(line.lineFinal || line.subtotal || 0)}`,
            item?.sku ? `SKU: ${String(item.sku).trim()}` : ''
        ].filter(Boolean);
        if (Number(line.lineDiscountPct || 0) > 0) {
            rows.push(`Desc. linea (${line.lineDiscountPct}%): -S/ ${moneyCompact(line.additionalDiscountApplied || line.lineDiscountAmount || 0)}`);
        }
        return rows;
    });

    const paymentRows = [
        `Subtotal: S/ ${moneyCompact(subtotalProducts || regularSubtotalTotal)}`,
    ];

    if (Number(totalDiscountForQuote || 0) > 0) {
        paymentRows.push(`Ahorro: -S/ ${moneyCompact(totalDiscountForQuote)}`);
    }

    paymentRows.push(`Delivery: ${deliveryFee > 0 ? `S/ ${moneyCompact(deliveryFee)}` : 'Gratuito'}`);
    paymentRows.push(`*TOTAL A PAGAR: S/ ${moneyCompact(cartTotal)}*`);

    return [
        quoteId ? `*COTIZACION ${String(quoteId).toUpperCase()}*` : '*COTIZACION*',
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
