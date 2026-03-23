import { useMemo } from 'react';

export default function useSaasTenantScope({
    overviewTenants,
    selectedTenantId,
    settingsTenantId,
    requiresTenantSelection,
    activeTenantId,
    toTenantDisplayName,
    currentUser,
    actorRoleForPolicy
}) {
    const tenantOptions = useMemo(() => {
        return [...(overviewTenants || [])].sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || ''), 'es', { sensitivity: 'base' }));
    }, [overviewTenants]);

    const selectedTenant = useMemo(
        () => tenantOptions.find((tenant) => String(tenant?.id || '') === String(selectedTenantId || '')) || null,
        [tenantOptions, selectedTenantId]
    );

    const tenantScopeId = useMemo(() => {
        const configuredTenantId = String(settingsTenantId || '').trim();
        if (configuredTenantId) return configuredTenantId;
        if (requiresTenantSelection) return '';
        const activeTenant = String(activeTenantId || '').trim();
        if (activeTenant) return activeTenant;
        if (tenantOptions.length === 1) return String(tenantOptions[0]?.id || '').trim();
        return '';
    }, [settingsTenantId, requiresTenantSelection, activeTenantId, tenantOptions]);

    const tenantScopeLocked = requiresTenantSelection && !tenantScopeId;

    const activeTenantLabel = useMemo(() => {
        if (!tenantScopeId) return requiresTenantSelection ? 'Seleccion pendiente' : '-';
        const match = tenantOptions.find((tenant) => String(tenant?.id || '').trim() === tenantScopeId);
        return match ? toTenantDisplayName(match) : tenantScopeId;
    }, [requiresTenantSelection, tenantOptions, tenantScopeId, toTenantDisplayName]);

    const currentUserDisplayName = String(currentUser?.name || currentUser?.email || currentUser?.userId || 'Usuario actual').trim() || 'Usuario actual';
    const currentUserEmail = String(currentUser?.email || '-').trim() || '-';
    const currentUserAvatarUrl = String(currentUser?.avatarUrl || '').trim();
    const currentUserRole = String(currentUser?.role || actorRoleForPolicy || 'seller').trim().toLowerCase();
    const currentUserRoleLabel = String(currentUser?.roleLabel || currentUserRole || '-').trim() || '-';
    const currentUserTenantCount = Array.isArray(currentUser?.memberships) ? currentUser.memberships.length : 0;

    return {
        tenantOptions,
        selectedTenant,
        tenantScopeId,
        tenantScopeLocked,
        activeTenantLabel,
        currentUserDisplayName,
        currentUserEmail,
        currentUserAvatarUrl,
        currentUserRole,
        currentUserRoleLabel,
        currentUserTenantCount
    };
}
