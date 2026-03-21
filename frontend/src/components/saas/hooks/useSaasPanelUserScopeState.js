import { useMemo } from 'react';

export default function useSaasPanelUserScopeState({
    overviewUsers = [],
    tenantScopeId = '',
    selectedUserId = '',
    currentUserId = '',
    actorRoleForPolicy = 'seller',
    actorRolePriority = 0,
    canManageUsers = false,
    canActorManageRoleChanges = false,
    canEditOptionalAccess = false,
    userPanelMode = 'view',
    userFormRole = 'seller',
    canManageTenants = false,
    canManageCatalog = false,
    canManageLabels = false,
    canManageTenantSettings = false,
    canEditModules = false,
    canViewSuperAdminSections = false,
    resolvePrimaryRoleFromMemberships,
    sanitizeMemberships,
    getRolePriority,
    getOptionalPermissionKeysForRole,
    getAllowedPackIdsForRole
} = {}) {
    const currentUserCapabilities = useMemo(() => {
        const capabilities = [];
        if (canManageTenants) capabilities.push('Gestion de empresas');
        if (canManageUsers) capabilities.push('Gestion de usuarios');
        if (canManageCatalog) capabilities.push('Gestion de catalogos');
        if (canManageLabels) capabilities.push('Etiquetas de chat');
        if (canManageTenantSettings) capabilities.push('Configuracion de empresa');
        if (canEditModules) capabilities.push('Modulos WhatsApp');
        if (canViewSuperAdminSections) capabilities.push('Planes y roles globales');
        if (canEditOptionalAccess) capabilities.push('Accesos opcionales');
        return capabilities;
    }, [
        canManageTenants,
        canManageUsers,
        canManageCatalog,
        canManageLabels,
        canManageTenantSettings,
        canEditModules,
        canViewSuperAdminSections,
        canEditOptionalAccess
    ]);

    const scopedUsers = useMemo(() => {
        if (!tenantScopeId) return [];
        return (overviewUsers || []).filter((user) => {
            const memberships = sanitizeMemberships(user?.memberships || []);
            return memberships.some((membership) => String(membership?.tenantId || '').trim() === tenantScopeId);
        });
    }, [overviewUsers, sanitizeMemberships, tenantScopeId]);

    const selectedUser = useMemo(
        () => scopedUsers.find((user) => String(user?.id || '') === String(selectedUserId || '')) || null,
        [scopedUsers, selectedUserId]
    );

    const selectedUserRole = useMemo(() => resolvePrimaryRoleFromMemberships(
        sanitizeMemberships(selectedUser?.memberships || []),
        selectedUser?.role || 'seller'
    ), [resolvePrimaryRoleFromMemberships, sanitizeMemberships, selectedUser]);

    const selectedUserRolePriority = getRolePriority(selectedUserRole);
    const selectedUserIsSelf = Boolean(selectedUser && currentUserId && String(selectedUser?.id || '').trim() === currentUserId);

    const canEditSelectedUser = Boolean(
        selectedUser
        && canManageUsers
        && (actorRoleForPolicy === 'superadmin' || selectedUserIsSelf || actorRolePriority > selectedUserRolePriority)
    );

    const canEditSelectedUserRole = Boolean(
        selectedUser
        && !selectedUserIsSelf
        && canEditSelectedUser
        && canActorManageRoleChanges
    );

    const canToggleSelectedUserStatus = Boolean(selectedUser && !selectedUserIsSelf && canEditSelectedUser);

    const canEditSelectedUserOptionalAccess = Boolean(
        selectedUser
        && !selectedUserIsSelf
        && canEditSelectedUser
        && canEditOptionalAccess
    );

    const canEditRoleInUserForm = userPanelMode === 'create' ? canManageUsers : canEditSelectedUserRole;
    const canEditScopeInUserForm = userPanelMode === 'create' ? canManageUsers : canEditSelectedUserRole;
    const canConfigureOptionalAccessInUserForm = userPanelMode === 'create' ? canEditOptionalAccess : canEditSelectedUserOptionalAccess;

    const allowedOptionalPermissionsForUserFormRole = useMemo(() => {
        return Array.from(getOptionalPermissionKeysForRole(userFormRole))
            .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
    }, [getOptionalPermissionKeysForRole, userFormRole]);

    const allowedPackIdsForUserFormRole = useMemo(
        () => getAllowedPackIdsForRole(userFormRole),
        [getAllowedPackIdsForRole, userFormRole]
    );

    return {
        currentUserCapabilities,
        scopedUsers,
        selectedUser,
        selectedUserRole,
        selectedUserRolePriority,
        selectedUserIsSelf,
        canEditSelectedUser,
        canEditSelectedUserRole,
        canToggleSelectedUserStatus,
        canEditSelectedUserOptionalAccess,
        canEditRoleInUserForm,
        canEditScopeInUserForm,
        canConfigureOptionalAccessInUserForm,
        allowedOptionalPermissionsForUserFormRole,
        allowedPackIdsForUserFormRole
    };
}
