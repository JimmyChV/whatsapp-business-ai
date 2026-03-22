import { useMemo } from 'react';

export default function useSaasPanelLoadingState({
    busy = false,
    error = '',
    overview = null,
    pendingRequests = 0
} = {}) {
    const showPanelLoading = useMemo(() => {
        const hasOverviewData = (Array.isArray(overview?.tenants) && overview.tenants.length > 0)
            || (Array.isArray(overview?.users) && overview.users.length > 0);
        return Boolean(busy || (!error && !hasOverviewData && pendingRequests > 0));
    }, [busy, error, overview, pendingRequests]);

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
