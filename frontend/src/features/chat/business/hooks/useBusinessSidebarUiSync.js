import { useEffect } from 'react';

export const useBusinessSidebarUiSync = ({
    aiEndRef,
    aiMessages = [],
    activeTab = 'ai',
    quickRepliesEnabled = false,
    cart = [],
    allowEmptyCartTab = false,
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
        if (activeTab === 'cart' && cart.length === 0 && !allowEmptyCartTab) {
            setActiveTab('catalog');
        }
    }, [activeTab, allowEmptyCartTab, cart.length, setActiveTab]);
};
