import { useEffect } from 'react';

export const useCartDraftSync = ({
    activeChatId = '',
    cartDraftsByChat = {},
    cartDraftSignaturesRef,
    parseMoney,
    cart = [],
    showOrderAdjustments = false,
    globalDiscountEnabled = false,
    globalDiscountType = 'percent',
    globalDiscountValue = 0,
    deliveryType = 'free',
    deliveryAmount = 0,
    showCartTotalsBreakdown = true,
    setOrderImportStatus,
    setCart,
    setShowOrderAdjustments,
    setGlobalDiscountEnabled,
    setGlobalDiscountType,
    setGlobalDiscountValue,
    setDeliveryType,
    setDeliveryAmount,
    setShowCartTotalsBreakdown,
    setCartDraftsByChat
} = {}) => {
    useEffect(() => {
        setOrderImportStatus(null);
        if (!activeChatId) return;
        // TODO(bug): carrito parpadea al cambiar de chat — revisar sincronizacion de draft/import entre chats
        cartDraftSignaturesRef.current[activeChatId] = '';

        const draft = cartDraftsByChat[activeChatId];
        if (draft) {
            const legacyPct = parseMoney(draft.globalDiscountPct ?? draft.discount ?? 0, 0);
            const legacyAmount = parseMoney(draft.globalDiscountAmount ?? 0, 0);
            const hasLegacyDiscount = legacyPct > 0 || legacyAmount > 0;
            const resolvedDiscountType = draft.globalDiscountType || (legacyAmount > 0 ? 'amount' : 'percent');
            const resolvedDiscountValue = parseMoney(
                draft.globalDiscountValue ?? (resolvedDiscountType === 'amount' ? legacyAmount : legacyPct),
                0
            );

            let resolvedDeliveryType = draft.deliveryType;
            if (!resolvedDeliveryType) {
                const legacyDeliveryEnabled = Boolean(draft.deliveryEnabled ?? false);
                const legacyDeliveryAmount = parseMoney(draft.deliveryAmount ?? 0, 0);
                resolvedDeliveryType = legacyDeliveryEnabled && legacyDeliveryAmount > 0 ? 'amount' : 'free';
            }

            setCart(draft.cart || []);
            setShowOrderAdjustments(Boolean(draft.showOrderAdjustments ?? false));
            setGlobalDiscountEnabled(Boolean(draft.globalDiscountEnabled ?? hasLegacyDiscount));
            setGlobalDiscountType(resolvedDiscountType === 'amount' ? 'amount' : 'percent');
            setGlobalDiscountValue(Math.max(0, resolvedDiscountValue));
            setDeliveryType(resolvedDeliveryType === 'amount' ? 'amount' : 'free');
            setDeliveryAmount(Math.max(0, parseMoney(draft.deliveryAmount ?? 0, 0)));
            setShowCartTotalsBreakdown(Boolean(draft.showCartTotalsBreakdown ?? true));
        } else {
            setCart([]);
            setShowOrderAdjustments(false);
            setGlobalDiscountEnabled(false);
            setGlobalDiscountType('percent');
            setGlobalDiscountValue(0);
            setDeliveryType('free');
            setDeliveryAmount(0);
            setShowCartTotalsBreakdown(true);
        }
    }, [
        activeChatId,
        cartDraftsByChat,
        cartDraftSignaturesRef,
        parseMoney,
        setOrderImportStatus,
        setCart,
        setShowOrderAdjustments,
        setGlobalDiscountEnabled,
        setGlobalDiscountType,
        setGlobalDiscountValue,
        setDeliveryType,
        setDeliveryAmount,
        setShowCartTotalsBreakdown
    ]);

    useEffect(() => {
        if (!activeChatId) return;
        const nextDraft = {
            cart,
            showOrderAdjustments,
            globalDiscountEnabled,
            globalDiscountType,
            globalDiscountValue,
            deliveryType,
            deliveryAmount,
            showCartTotalsBreakdown
        };

        const nextSignature = JSON.stringify(nextDraft);
        if (cartDraftSignaturesRef.current[activeChatId] === nextSignature) return;

        cartDraftSignaturesRef.current[activeChatId] = nextSignature;
        setCartDraftsByChat((prev) => {
            const previousDraft = prev?.[activeChatId] || null;
            if (previousDraft && JSON.stringify(previousDraft) === nextSignature) return prev;
            return {
                ...prev,
                [activeChatId]: nextDraft
            };
        });
    }, [
        activeChatId,
        cart,
        showOrderAdjustments,
        globalDiscountEnabled,
        globalDiscountType,
        globalDiscountValue,
        deliveryType,
        deliveryAmount,
        showCartTotalsBreakdown,
        cartDraftSignaturesRef,
        setCartDraftsByChat
    ]);
};
