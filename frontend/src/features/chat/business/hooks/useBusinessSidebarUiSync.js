import { useEffect } from 'react';

export const useBusinessSidebarUiSync = ({
    aiEndRef,
    aiMessages = [],
    activeTab = 'ai',
    quickRepliesEnabled = false,
    cart = [],
    allowEmptyCartTab = false,
    isImportingCart = null,
    setActiveTab
} = {}) => {
    useEffect(() => {
        aiEndRef?.current?.scrollIntoView({ behavior: 'smooth' });
    }, [aiMessages, aiEndRef]);

    useEffect(() => {
        if (activeTab === 'quick' && !quickRepliesEnabled) {
            setActiveTab('ai');
        }
    }, [activeTab, quickRepliesEnabled, setActiveTab]);

    useEffect(() => {
        if (activeTab === 'quotes') return;
        if (
            activeTab === 'cart'
            && cart.length === 0
            && !allowEmptyCartTab
            && !isImportingCart?.current
        ) {
            setActiveTab('catalog');
        }
    }, [activeTab, allowEmptyCartTab, cart.length, isImportingCart, setActiveTab]);
};
