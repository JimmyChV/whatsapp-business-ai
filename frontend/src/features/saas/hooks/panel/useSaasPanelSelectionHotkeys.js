import { useEffect } from 'react';

export default function useSaasPanelSelectionHotkeys({
    isOpen = false,
    hasSelection = false,
    clearPanelSelection
} = {}) {
    useEffect(() => {
        if (!isOpen) return;
        clearPanelSelection?.();
    }, [clearPanelSelection, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event) => {
            if (event.key !== 'Escape' || event.repeat) return;
            const escapeEvent = new CustomEvent('saas-panel-escape', {
                cancelable: true,
                detail: {
                    hasSelection
                }
            });
            window.dispatchEvent(escapeEvent);
            if (escapeEvent.defaultPrevented) {
                event.preventDefault();
                return;
            }
            if (!hasSelection) return;
            event.preventDefault();
            clearPanelSelection?.();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [clearPanelSelection, hasSelection, isOpen]);
}
