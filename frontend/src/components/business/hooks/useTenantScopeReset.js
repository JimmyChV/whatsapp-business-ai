import { useEffect } from 'react';

export const useTenantScopeReset = ({
    normalizedTenantScopeKey = 'default',
    tenantScopeRef,
    resetAiScopeState,
    setActiveTab,
    setShowCompanyProfile,
    setAiInput,
    setCart,
    setShowOrderAdjustments,
    setGlobalDiscountEnabled,
    setGlobalDiscountType,
    setGlobalDiscountValue,
    setDeliveryType,
    setDeliveryAmount,
    setShowCartTotalsBreakdown,
    setCartDraftsByChat,
    cartDraftSignaturesRef,
    setQuickSearch,
    setOrderImportStatus,
    lastImportedOrderRef
} = {}) => {
    useEffect(() => {
        const nextScope = normalizedTenantScopeKey;
        if (tenantScopeRef?.current === nextScope) return;
        if (tenantScopeRef) tenantScopeRef.current = nextScope;

        setActiveTab('ai');
        setShowCompanyProfile(false);
        resetAiScopeState();
        setAiInput('');
        setCart([]);
        setShowOrderAdjustments(false);
        setGlobalDiscountEnabled(false);
        setGlobalDiscountType('percent');
        setGlobalDiscountValue(0);
        setDeliveryType('free');
        setDeliveryAmount(0);
        setShowCartTotalsBreakdown(true);
        setCartDraftsByChat({});
        if (cartDraftSignaturesRef?.current) cartDraftSignaturesRef.current = {};
        setQuickSearch('');
        setOrderImportStatus(null);
        if (lastImportedOrderRef) lastImportedOrderRef.current = '';
    }, [
        normalizedTenantScopeKey,
        tenantScopeRef,
        resetAiScopeState,
        setActiveTab,
        setShowCompanyProfile,
        setAiInput,
        setCart,
        setShowOrderAdjustments,
        setGlobalDiscountEnabled,
        setGlobalDiscountType,
        setGlobalDiscountValue,
        setDeliveryType,
        setDeliveryAmount,
        setShowCartTotalsBreakdown,
        setCartDraftsByChat,
        cartDraftSignaturesRef,
        setQuickSearch,
        setOrderImportStatus,
        lastImportedOrderRef
    ]);
};
