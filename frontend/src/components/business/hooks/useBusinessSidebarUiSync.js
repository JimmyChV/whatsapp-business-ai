import { useEffect } from 'react';

export const useBusinessSidebarUiSync = ({
    aiEndRef,
    aiMessages = [],
    activeTab = 'ai',
    quickRepliesEnabled = false,
    cart = [],
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
        if (activeTab === 'cart' && cart.length === 0) {
            setActiveTab('catalog');
        }
    }, [activeTab, cart.length, setActiveTab]);
};
