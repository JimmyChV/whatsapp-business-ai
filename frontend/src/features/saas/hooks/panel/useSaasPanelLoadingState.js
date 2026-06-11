import { useMemo } from 'react';

export default function useSaasPanelLoadingState({
    busy = false,
    overview = null,
} = {}) {
    const showPanelLoading = useMemo(() => {
        return Boolean(busy);
    }, [busy]);

    const aiUsageByTenant = useMemo(() => {
        const map = new Map();
        (overview?.aiUsage || []).forEach((entry) => {
            const tenantId = String(entry?.tenantId || '').trim();
            if (!tenantId) return;
            map.set(tenantId, Number(entry?.requests || 0) || 0);
        });
        return map;
    }, [overview]);

    return {
        showPanelLoading,
        aiUsageByTenant
    };
}
