const safeId = (value = '') => String(value ?? '').trim();

const asNumber = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};

const clampNumber = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

export const addItemToCartState = (previous = [], item = {}, qtyToAdd = 1) => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const safeItem = item && typeof item === 'object' ? item : {};
    const safeIdValue = safeId(safeItem.id);
    const qtyDelta = Math.max(1, Math.trunc(Number(qtyToAdd) || 1));

    if (!safeIdValue) return safePrevious;

    const existing = safePrevious.find((entry) => safeId(entry?.id) === safeIdValue);
    if (existing) {
        return safePrevious.map((entry) => (
            safeId(entry?.id) === safeIdValue
                ? { ...entry, qty: Math.max(1, Number(entry.qty || 1) + qtyDelta) }
                : entry
        ));
    }

    return [
        ...safePrevious,
        {
            ...safeItem,
            qty: qtyDelta,
            lineDiscountEnabled: Boolean(safeItem.lineDiscountEnabled || false),
            lineDiscountType: safeItem.lineDiscountType === 'amount' ? 'amount' : 'percent',
            lineDiscountValue: Math.max(0, asNumber(safeItem.lineDiscountValue, 0)),
            linDiscountType: safeItem.lineDiscountType === 'amount' || safeItem.linDiscountType === 'fixed' ? 'fixed' : 'pct',
            linDiscountPct: Math.max(0, asNumber(safeItem.linDiscountPct, 0)),
            linDiscountAmt: Math.max(0, asNumber(safeItem.linDiscountAmt, 0))
        }
    ];
};

export const removeItemFromCartState = (previous = [], id = '') => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const targetId = safeId(id);
    if (!targetId) return safePrevious;
    return safePrevious.filter((entry) => safeId(entry?.id) !== targetId);
};

export const updateCartItemQtyState = (previous = [], id = '', delta = 0) => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const targetId = safeId(id);
    const safeDelta = Number(delta) || 0;
    if (!targetId || !safeDelta) return safePrevious;

    return safePrevious.flatMap((entry) => {
        if (safeId(entry?.id) !== targetId) return [entry];
        const nextQty = (Number(entry.qty) || 1) + safeDelta;
        if (nextQty <= 0) return [];
        return [{ ...entry, qty: nextQty }];
    });
};

export const setCartItemQtyState = (previous = [], id = '', quantity = 1) => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const targetId = safeId(id);
    const nextQty = Math.max(1, Math.trunc(Number(quantity) || 1));
    if (!targetId) return safePrevious;

    return safePrevious.map((entry) => (
        safeId(entry?.id) === targetId
            ? { ...entry, qty: nextQty }
            : entry
    ));
};

export const setCartItemDiscountEnabledState = (previous = [], id = '', enabled = false, parseMoney = asNumber) => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const targetId = safeId(id);
    if (!targetId) return safePrevious;
    const isEnabled = Boolean(enabled);

    return safePrevious.map((entry) => {
        if (safeId(entry?.id) !== targetId) return entry;
        return {
            ...entry,
            lineDiscountEnabled: isEnabled,
            lineDiscountValue: isEnabled ? Math.max(0, parseMoney(entry.lineDiscountValue, 0)) : 0,
            linDiscountPct: isEnabled ? Math.max(0, parseMoney(entry.linDiscountPct, 0)) : 0,
            linDiscountAmt: isEnabled ? Math.max(0, parseMoney(entry.linDiscountAmt, 0)) : 0
        };
    });
};

export const setCartItemDiscountTypeState = (previous = [], id = '', type = 'percent') => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const targetId = safeId(id);
    if (!targetId) return safePrevious;
    const safeType = type === 'amount' ? 'amount' : 'percent';

    return safePrevious.map((entry) => (
        safeId(entry?.id) === targetId
            ? {
                ...entry,
                lineDiscountType: safeType,
                lineDiscountValue: 0,
                linDiscountType: safeType === 'amount' ? 'fixed' : 'pct',
                linDiscountPct: 0,
                linDiscountAmt: 0
            }
            : entry
    ));
};

export const setCartItemDiscountValueState = (previous = [], id = '', value = 0, parseMoney = asNumber) => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const targetId = safeId(id);
    if (!targetId) return safePrevious;

    return safePrevious.map((entry) => {
        if (safeId(entry?.id) !== targetId) return entry;
        const safeType = entry.lineDiscountType === 'amount' ? 'amount' : 'percent';
        const rawValue = Math.max(0, parseMoney(value, 0));
        const safeValue = safeType === 'percent' ? clampNumber(rawValue, 0, 100) : rawValue;
        return {
            ...entry,
            lineDiscountValue: safeValue,
            linDiscountType: safeType === 'amount' ? 'fixed' : 'pct',
            linDiscountPct: safeType === 'percent' ? safeValue : 0,
            linDiscountAmt: safeType === 'amount' ? safeValue : 0
        };
    });
};

export const setCartItemDiscountConfigState = (previous = [], id = '', config = {}, parseMoney = asNumber) => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const targetId = safeId(id);
    if (!targetId) return safePrevious;
    const safeConfig = config && typeof config === 'object' ? config : {};
    const safeType = safeConfig.type === 'amount' ? 'amount' : 'percent';
    const rawValue = Math.max(0, parseMoney(safeConfig.value, 0));
    const safeValue = safeType === 'percent' ? clampNumber(rawValue, 0, 100) : rawValue;
    const isEnabled = safeConfig.enabled === undefined
        ? safeValue > 0
        : Boolean(safeConfig.enabled);

    return safePrevious.map((entry) => (
        safeId(entry?.id) === targetId
            ? {
                ...entry,
                lineDiscountEnabled: isEnabled,
                lineDiscountType: safeType,
                lineDiscountValue: isEnabled ? safeValue : 0,
                linDiscountType: safeType === 'amount' ? 'fixed' : 'pct',
                linDiscountPct: isEnabled && safeType === 'percent' ? safeValue : 0,
                linDiscountAmt: isEnabled && safeType === 'amount' ? safeValue : 0
            }
            : entry
    ));
};

export const setCartItemExcludeFromGlobalState = (previous = [], id = '', excluded = false) => {
    const safePrevious = Array.isArray(previous) ? previous : [];
    const targetId = safeId(id);
    if (!targetId) return safePrevious;
    return safePrevious.map((entry) => (
        safeId(entry?.id) === targetId
            ? { ...entry, excludeFromGlobal: Boolean(excluded) }
            : entry
    ));
};
