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
            lineDiscountValue: Math.max(0, asNumber(safeItem.lineDiscountValue, 0))
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
            lineDiscountValue: isEnabled ? Math.max(0, parseMoney(entry.lineDiscountValue, 0)) : 0
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
                lineDiscountValue: 0
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
        return { ...entry, lineDiscountValue: safeValue };
    });
};