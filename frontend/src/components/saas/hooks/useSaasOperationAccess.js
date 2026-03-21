import { useMemo } from 'react';

export default function useSaasOperationAccess({
    requiresTenantSelection = false,
    settingsTenantId = '',
    tenantScopeId = '',
    activeTenantId = '',
    waModules = [],
    onOpenWhatsAppOperation
} = {}) {
    const operationTenantId = useMemo(() => {
        if (requiresTenantSelection) return String(settingsTenantId || '').trim();
        return String(tenantScopeId || settingsTenantId || activeTenantId || '').trim();
    }, [activeTenantId, requiresTenantSelection, settingsTenantId, tenantScopeId]);

    const hasActiveModuleForOperation = useMemo(() => Boolean(
        (Array.isArray(waModules) ? waModules : []).some((moduleItem) =>
            String(moduleItem?.moduleId || '').trim() && moduleItem?.isActive !== false
        )
    ), [waModules]);

    const canOpenOperation = useMemo(() => Boolean(
        typeof onOpenWhatsAppOperation === 'function'
        && operationTenantId
        && hasActiveModuleForOperation
    ), [hasActiveModuleForOperation, onOpenWhatsAppOperation, operationTenantId]);

    return {
        operationTenantId,
        hasActiveModuleForOperation,
        canOpenOperation
    };
}
