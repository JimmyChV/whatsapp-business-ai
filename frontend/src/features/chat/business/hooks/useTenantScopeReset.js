import { useEffect } from 'react';

export const useTenantScopeReset = ({
    normalizedTenantScopeKey = 'default',
    tenantScopeRef,
    resetAiScopeState,
    setActiveTab,
    setShowCompanyProfile,
    setAiInput,
    setCartDraftsByChat,
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
        setCartDraftsByChat({});
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
        setCartDraftsByChat,
        setQuickSearch,
        setOrderImportStatus,
        lastImportedOrderRef
    ]);
};
