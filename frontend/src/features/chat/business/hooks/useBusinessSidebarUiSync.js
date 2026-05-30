import { useEffect } from 'react';

export const useBusinessSidebarUiSync = ({
    aiEndRef,
    aiMessages = [],
    activeTab = 'ai',
    quickRepliesEnabled = false,
    cart = [],
    cartOpenReason = null,
    setCartOpenReason = null,
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
        const keepEmptyCartOpen = ['import', 'quote-history'].includes(String(cartOpenReason || ''));
        if (
            activeTab === 'cart'
            && cart.length === 0
            && !keepEmptyCartOpen
        ) {
            if (typeof setCartOpenReason === 'function') {
                setCartOpenReason(null);
            }
            setActiveTab('catalog');
        }
    }, [activeTab, cart.length, cartOpenReason, setActiveTab, setCartOpenReason]);
};
