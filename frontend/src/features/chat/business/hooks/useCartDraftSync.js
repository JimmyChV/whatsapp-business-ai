import { useEffect } from 'react';

export const useCartDraftSync = ({
    activeChatId = '',
    cartDraftsByChat = {},
    cartDraftSignaturesRef,
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
        if (!activeChatId) return;

        cartDraftSignaturesRef.current[activeChatId] = '';

        const draft = cartDraftsByChat[activeChatId];
        if (draft) {
            setCart(draft.cart || []);
            setShowOrderAdjustments(Boolean(draft.showOrderAdjustments || false));
            setGlobalDiscountEnabled(Boolean(draft.globalDiscountEnabled || false));
            setGlobalDiscountType(draft.globalDiscountType || 'percent');
            setGlobalDiscountValue(draft.globalDiscountValue || 0);
            setDeliveryType(draft.deliveryType || 'free');
            setDeliveryAmount(draft.deliveryAmount || 0);
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
        setOrderImportStatus(null);
    }, [
        activeChatId,
        cartDraftsByChat,
        cartDraftSignaturesRef,
        setCart,
        setShowOrderAdjustments,
        setGlobalDiscountEnabled,
        setGlobalDiscountType,
        setGlobalDiscountValue,
        setDeliveryType,
        setDeliveryAmount,
        setShowCartTotalsBreakdown,
        setOrderImportStatus
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
