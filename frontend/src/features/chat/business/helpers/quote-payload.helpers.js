import { floorMoney1 } from './cart.helpers';

const parseMoney = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};

export const toMoney1 = floorMoney1;

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
    const titleRaw = String(safeItem.title || safeItem.name || safeItem.productName || 'Producto').trim();
    const unitRaw = String(safeItem.unit || 'unidad').trim();
    const qty = Math.max(1, Math.trunc(parseMoney(safeLine.qty ?? safeItem.qty, 1)) || 1);
    const unitPrice = toMoney1(parseMoney(safeLine.unitPrice ?? safeItem.price ?? safeItem.unitPrice, 0));
    const regularPrice = toMoney1(parseMoney(safeLine.regularUnit ?? safeItem.regularPrice, unitPrice));
    const linDiscountPct = Math.max(0, Math.min(100, parseMoney(safeLine.lineDiscountPct ?? safeLine.lineDiscountValue ?? safeItem.linDiscountPct, 0)));
    const linDiscountAmt = toMoney1(parseMoney(safeLine.lineDiscountAmount ?? safeLine.additionalDiscountApplied, 0) / qty);
    const finalPrice = toMoney1(parseMoney(safeLine.finalPrice, unitPrice - linDiscountAmt));
    const subtotal = toMoney1(parseMoney(safeLine.subtotal ?? safeLine.lineFinal, finalPrice * qty));

    return {
        itemId,
        productId: productIdRaw || null,
        productName: titleRaw || 'Producto',
        sku: skuRaw || null,
        title: titleRaw || 'Producto',
        unit: unitRaw || 'unidad',
        quantity: qty,
        qty,
        unitPrice,
        regularPrice,
        linDiscountPct,
        linDiscountAmt,
        finalPrice,
        subtotal,
        excludeFromGlobal: safeLine.excludeFromGlobal === true || safeItem.excludeFromGlobal === true,
        lineSubtotal: toMoney1(regularPrice * qty),
        lineDiscountType: linDiscountPct > 0 ? 'percent' : null,
        lineDiscountValue: linDiscountPct,
        lineDiscountAmount: toMoney1(linDiscountAmt * qty),
        lineTotal: subtotal,
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
    subtotalProducts = 0,
    globalDiscountApplied = 0,
    subtotalAfterGlobal = 0,
    deliveryFee = 0,
    cartTotal = 0,
    deliveryType = 'none',
    globalDiscountEnabled = false,
    globalDiscountValue = 0,
    globalOnRegular = false,
    currency = 'PEN'
} = {}) => {
    const safeCart = Array.isArray(cart) ? cart : [];
    const normalizedCurrency = String(currency || 'PEN').trim() || 'PEN';
    const normalizedDeliveryType = String(deliveryType || 'none').trim().toLowerCase() || 'none';
    const normalizedDeliveryAmount = toMoney1(parseMoney(deliveryFee, 0));
    const globalPct = globalDiscountEnabled ? Math.max(0, Math.min(100, parseMoney(globalDiscountValue, 0))) : 0;
    const globalDiscAmt = toMoney1(parseMoney(globalDiscountApplied, 0));

    return {
        itemCount: safeCart.length,
        subtotal: toMoney1(parseMoney(subtotalProducts, 0)),
        globalDiscPct: globalPct,
        globalDiscAmt,
        globalOnRegular: Boolean(globalOnRegular),
        deliveryType: normalizedDeliveryType === 'amount' ? 'amount' : 'gratuito',
        deliveryAmt: normalizedDeliveryAmount,
        totalPayable: toMoney1(parseMoney(cartTotal, 0)),
        discount: globalDiscAmt,
        totalAfterDiscount: toMoney1(parseMoney(subtotalAfterGlobal, 0)),
        deliveryAmount: normalizedDeliveryAmount,
        deliveryFree: normalizedDeliveryType !== 'amount' || normalizedDeliveryAmount <= 0,
        globalDiscount: {
            enabled: Boolean(globalDiscountEnabled),
            type: globalDiscountEnabled ? 'percent' : 'none',
            value: globalPct,
            applied: globalDiscAmt,
            onRegular: Boolean(globalOnRegular)
        },
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
    subtotalProducts = 0,
    totalDiscountForQuote = 0,
    globalDiscountApplied = 0,
    subtotalAfterGlobal = 0,
    deliveryFee = 0,
    cartTotal = 0,
    deliveryType = 'none',
    globalDiscountEnabled = false,
    globalDiscountType = 'percent',
    globalDiscountValue = 0,
    globalOnRegular = false,
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
        subtotalProducts,
        globalDiscountApplied,
        subtotalAfterGlobal,
        deliveryFee,
        cartTotal,
        deliveryType,
        globalDiscountEnabled,
        globalDiscountType,
        globalDiscountValue,
        globalOnRegular,
        currency: normalizedCurrency
    });

    const body = typeof buildQuoteMessageFromCart === 'function'
        ? String(buildQuoteMessageFromCart({
            cart: safeCart,
            getLineBreakdown,
            subtotalProducts,
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
