const asNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};

export const floorMoney1 = (value = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.floor((num + 1e-8) * 10) / 10;
};

export const formatQuoteMoney1 = (value = 0) => `S/ ${floorMoney1(value).toFixed(1)}`;

export const normalizeDiscountType = (value = 'percent') => {
    const raw = String(value || '').trim().toLowerCase();
    return raw === 'amount' || raw === 'fixed' || raw === 's/' || raw === 'soles'
        ? 'amount'
        : 'percent';
};

export const calcQuoteItem = (item = {}) => {
    const source = item && typeof item === 'object' ? item : {};
    const qty = Math.max(1, Math.trunc(asNumber(source.qty ?? source.quantity, 1)) || 1);
    const unitPrice = asNumber(source.unitPrice ?? source.price, 0);
    const regularPrice = asNumber(source.regularPrice ?? source.regular_price, unitPrice);
    const base = floorMoney1(unitPrice);
    const linDiscountType = normalizeDiscountType(source.linDiscountType ?? source.lineDiscountType ?? source.discountType);
    const rawDiscountValue = asNumber(
        linDiscountType === 'amount'
            ? (source.linDiscountAmt ?? source.lineDiscountUnitAmount ?? source.lineDiscountValue ?? 0)
            : (source.linDiscountPct
                ?? source.lineDiscountPct
                ?? (source.lineDiscountType === 'percent' || source.lineDiscountEnabled ? source.lineDiscountValue : 0)),
        0
    );
    const linDiscountPct = linDiscountType === 'amount'
        ? (base > 0 ? floorMoney1(Math.min(100, Math.max(0, (Math.min(base, Math.max(0, rawDiscountValue)) / base) * 100))) : 0)
        : Math.min(100, Math.max(0, rawDiscountValue));
    const descAmt = linDiscountType === 'amount'
        ? floorMoney1(Math.min(base, Math.max(0, rawDiscountValue)))
        : floorMoney1(base * linDiscountPct / 100);
    const finalPrice = floorMoney1(Math.max(0, base - descAmt));
    const subtotal = floorMoney1(finalPrice * qty);

    return {
        ...source,
        qty,
        quantity: qty,
        base,
        unitPrice: base,
        regularPrice: floorMoney1(regularPrice || unitPrice),
        linDiscountType: linDiscountType === 'amount' ? 'fixed' : 'pct',
        lineDiscountType: linDiscountType,
        lineDiscountValue: linDiscountType === 'amount' ? descAmt : linDiscountPct,
        linDiscountPct,
        linDiscountAmt: descAmt,
        descAmt,
        finalPrice,
        subtotal,
        excludeFromGlobal: source.excludeFromGlobal === true
    };
};

export const calcQuoteTotals = (items = [], globalDiscValue = 0, globalOnRegular = false, delivery = 0, globalDiscType = 'percent') => {
    const calcedItems = (Array.isArray(items) ? items : []).map(calcQuoteItem);
    const participants = calcedItems.filter((item) => !item.excludeFromGlobal);
    const excluded = calcedItems.filter((item) => item.excludeFromGlobal);
    const safeGlobalType = normalizeDiscountType(globalDiscType);
    const safeGlobalValue = Math.max(0, asNumber(globalDiscValue, 0));

    const baseGlobal = globalOnRegular
        ? floorMoney1(participants.reduce((acc, item) => acc + floorMoney1((item.regularPrice || item.unitPrice) * item.qty), 0))
        : floorMoney1(participants.reduce((acc, item) => acc + item.subtotal, 0));

    const globalDiscPct = safeGlobalType === 'amount'
        ? (baseGlobal > 0 ? floorMoney1(Math.min(100, Math.max(0, (Math.min(baseGlobal, safeGlobalValue) / baseGlobal) * 100))) : 0)
        : Math.min(100, safeGlobalValue);
    const globalDiscAmt = safeGlobalType === 'amount'
        ? floorMoney1(Math.min(baseGlobal, safeGlobalValue))
        : floorMoney1(baseGlobal * globalDiscPct / 100);
    const subtotalParticipants = globalOnRegular
        ? baseGlobal
        : floorMoney1(participants.reduce((acc, item) => acc + item.subtotal, 0));
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
        globalDiscPct,
        globalDiscType: safeGlobalType === 'amount' ? 'fixed' : 'pct',
        globalDiscountType: safeGlobalType,
        globalDiscountValue: safeGlobalType === 'amount' ? globalDiscAmt : globalDiscPct,
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
    const lineDiscountType = normalizeDiscountType(safeItem.linDiscountType ?? safeItem.lineDiscountType);
    const lineDiscountValue = lineDiscountType === 'amount'
        ? Math.max(0, parseMoney(safeItem.linDiscountAmt ?? safeItem.lineDiscountValue, 0))
        : clampNumber(parseMoney(
            safeItem.linDiscountPct
            ?? safeItem.lineDiscountPct
            ?? (safeItem.lineDiscountEnabled ? safeItem.lineDiscountValue : 0),
            0
        ), 0, 100);
    const calced = calcQuoteItem({
        ...safeItem,
        unitPrice,
        regularPrice: regularUnit || unitPrice,
        linDiscountType: lineDiscountType === 'amount' ? 'fixed' : 'pct',
        lineDiscountType,
        lineDiscountValue
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
        linDiscountType: calced.linDiscountType,
        lineDiscountType: calced.lineDiscountType,
        lineDiscountValue: calced.lineDiscountValue,
        lineDiscountPct: calced.linDiscountPct,
        lineDiscountUnitAmount: calced.linDiscountAmt,
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

    const normalizedGlobalDiscountType = normalizeDiscountType(globalDiscountType);
    const normalizedGlobalDiscountValue = globalDiscountEnabled
        ? (normalizedGlobalDiscountType === 'amount'
            ? Math.max(0, parseMoney(globalDiscountValue, 0))
            : clampNumber(parseMoney(globalDiscountValue, 0), 0, 100))
        : 0;
    const safeDeliveryAmount = Math.max(0, parseMoney(deliveryAmount, 0));
    const deliveryFee = deliveryType === 'amount' ? roundMoney(safeDeliveryAmount) : 0;
    const totals = calcQuoteTotals(
        lineBreakdowns.map(({ item, ...line }) => ({
            ...item,
            qty: line.qty,
            unitPrice: line.unitPrice,
            regularPrice: line.regularUnit,
            linDiscountType: line.linDiscountType,
            lineDiscountType: line.lineDiscountType,
            lineDiscountValue: line.lineDiscountValue,
            linDiscountPct: line.lineDiscountPct,
            linDiscountAmt: line.lineDiscountUnitAmount,
            excludeFromGlobal: line.excludeFromGlobal
        })),
        normalizedGlobalDiscountValue,
        Boolean(globalOnRegular),
        deliveryFee,
        normalizedGlobalDiscountType
    );
    const regularSubtotalTotal = roundMoney(lineBreakdowns.reduce((sum, line) => sum + line.regularSubtotal, 0));
    const subtotalProducts = totals.subtotal;
    const globalDiscountApplied = totals.globalDiscAmt;
    const subtotalAfterGlobal = roundMoney(subtotalProducts - globalDiscountApplied);
    const cartTotal = totals.total;
    const totalBeforeDelivery = Math.max(0, cartTotal - deliveryFee);
    const totalDiscountForQuote = roundMoney(Math.max(0, regularSubtotalTotal - totalBeforeDelivery));

    return {
        lineBreakdowns,
        regularSubtotalTotal,
        subtotalProducts,
        rawGlobalDiscountValue: normalizedGlobalDiscountValue,
        normalizedGlobalDiscountValue,
        normalizedGlobalDiscountType,
        globalDiscountApplied,
        globalDiscPct: totals.globalDiscPct,
        globalDiscType: totals.globalDiscType,
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

const roundPercent1 = (value = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 10) / 10;
};

const snapLikelyIntegerPercent = (value = 0) => {
    const rounded = roundPercent1(value);
    const nearestInteger = Math.round(rounded);
    return Math.abs(rounded - nearestInteger) <= 0.15 ? nearestInteger : rounded;
};

export const resolveImportedGlobalDiscount = ({
    summary = {},
    cart = [],
    fallbackGlobalAmount = 0,
    parseMoney = asNumber
} = {}) => {
    const safeSummary = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {};
    const globalDiscount = safeSummary.globalDiscount && typeof safeSummary.globalDiscount === 'object' && !Array.isArray(safeSummary.globalDiscount)
        ? safeSummary.globalDiscount
        : {};
    const rawType = String(safeSummary.globalDiscType ?? globalDiscount.type ?? '').trim().toLowerCase();
    const hasExplicitType = rawType === 'pct'
        || rawType === 'percent'
        || rawType === 'percentage'
        || rawType === 'amount'
        || rawType === 'fixed'
        || rawType === 's/';
    const hasPctField = safeSummary.globalDiscPct !== null
        && safeSummary.globalDiscPct !== undefined
        && Number.isFinite(asNumber(safeSummary.globalDiscPct, NaN));
    const globalDiscountType = normalizeDiscountType(hasExplicitType ? rawType : (hasPctField ? 'percent' : 'amount'));
    const globalOnRegular = Boolean(safeSummary.globalOnRegular ?? globalDiscount.onRegular);
    const explicitGlobalAmount = Math.max(0, asNumber(
        safeSummary.globalDiscAmt
        ?? globalDiscount.applied
        ?? (globalDiscountType === 'amount' ? globalDiscount.value : null)
        ?? fallbackGlobalAmount,
        0
    ));

    if (globalDiscountType === 'amount') {
        return {
            enabled: explicitGlobalAmount > 0,
            type: 'amount',
            value: floorMoney1(explicitGlobalAmount),
            onRegular: globalOnRegular
        };
    }

    const totalsWithoutGlobal = calcQuoteTotals(cart, 0, globalOnRegular, 0, 'percent');
    const baseGlobal = Math.max(0, Number(totalsWithoutGlobal.baseGlobal || 0) || 0);
    const derivedPctFromAmount = baseGlobal > 0 && explicitGlobalAmount > 0
        ? snapLikelyIntegerPercent((explicitGlobalAmount / baseGlobal) * 100)
        : 0;
    const candidatePct = asNumber(
        safeSummary.globalDiscPct
        ?? globalDiscount.value,
        0
    );
    const candidateLooksLikeAmount = explicitGlobalAmount > 0
        && candidatePct > 0
        && Math.abs(candidatePct - explicitGlobalAmount) <= 0.11
        && derivedPctFromAmount > 0
        && Math.abs(candidatePct - derivedPctFromAmount) > 0.5;
    const resolvedPct = candidateLooksLikeAmount
        ? derivedPctFromAmount
        : (candidatePct > 0 ? Math.min(100, Math.max(0, candidatePct)) : derivedPctFromAmount);

    return {
        enabled: resolvedPct > 0,
        type: 'percent',
        value: resolvedPct,
        onRegular: globalOnRegular
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
    normalizedGlobalDiscountType = 'percent',
    globalOnRegular = false
} = {}) => ({
    chatId: String(activeChatId || '').trim() || null,
    items: (Array.isArray(lineBreakdowns) ? lineBreakdowns : []).map(({ item, qty, unitPrice, regularUnit, linDiscountType, lineDiscountType, lineDiscountValue, lineDiscountPct, lineDiscountUnitAmount, additionalDiscountApplied, finalPrice, subtotal, excludeFromGlobal }) => ({
        id: item?.id || null,
        title: item?.title || null,
        qty,
        price: Number(unitPrice || 0),
        regularPrice: Number(parseMoney(item?.regularPrice, regularUnit || unitPrice) || 0),
        category: item?.category || item?.categoryName || null,
        lineDiscountEnabled: Number(lineDiscountPct || 0) > 0,
        linDiscountType: linDiscountType || 'pct',
        lineDiscountType: lineDiscountType || 'percent',
        lineDiscountValue: Number(lineDiscountValue || 0),
        linDiscountPct: Number(lineDiscountPct || 0),
        linDiscountAmt: Number(lineDiscountUnitAmount || 0),
        lineDiscountAmount: Number(additionalDiscountApplied || 0),
        finalPrice: Number(finalPrice || 0),
        subtotal: Number(subtotal || 0),
        excludeFromGlobal: Boolean(excludeFromGlobal)
    })),
    subtotal: Number(subtotalProducts || 0),
    discount: Number(totalDiscountForQuote || 0),
    total: Number(cartTotal || 0),
    delivery: Number(deliveryFee || 0),
    currency: 'PEN',
    notes: `delivery=${deliveryType}; globalDiscount=${globalDiscountEnabled ? `${normalizeDiscountType(normalizedGlobalDiscountType)}:${normalizedGlobalDiscountValue}` : 'none'}; globalOnRegular=${Boolean(globalOnRegular)}`
});

export const buildQuoteMessageFromCart = ({
    cart = [],
    getLineBreakdown,
    regularSubtotalTotal = 0,
    totalDiscountForQuote = 0,
    globalDiscountApplied = 0,
    normalizedGlobalDiscountValue = 0,
    globalDiscountType = 'percent',
    globalOnRegular = false,
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
        const unitForCustomer = Number(line.regularUnit ?? item?.regularPrice ?? line.unitPrice ?? item?.price ?? 0) || 0;
        const lineSubtotalForCustomer = floorMoney1(unitForCustomer * (Number(line.qty || item?.qty || 1) || 1));
        const rows = [
            `*${formatTitle(item?.title)}*`,
            `${line.qty} x S/ ${moneyCompact(unitForCustomer)} = S/ ${moneyCompact(lineSubtotalForCustomer)}`
        ];
        return rows;
    });

    const paymentRows = [
        `Subtotal:     S/ ${moneyCompact(regularSubtotalTotal || subtotalProducts)}`,
    ];

    if (Number(totalDiscountForQuote || 0) > 0) {
        paymentRows.push(`Descuento:    -S/ ${moneyCompact(totalDiscountForQuote)}`);
    }

    paymentRows.push(`Delivery: ${deliveryFee > 0 ? `S/ ${moneyCompact(deliveryFee)}` : 'Gratuito'}`);
    paymentRows.push(`*TOTAL A PAGAR: S/ ${moneyCompact(cartTotal)}*`);

    return [
        quoteId ? `*COTIZACION ${String(quoteId).toUpperCase()}*` : '*COTIZACION*',
        separator,
        '',
        ...productRows,
        '',
        separator,
        ...paymentRows,
        separator,
        '',
        separator,
        '_Lavitat(R) - La confianza que abraza tu hogar_',
    ].join('\n');
};
