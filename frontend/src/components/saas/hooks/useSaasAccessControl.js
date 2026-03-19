import { useCallback, useMemo } from 'react';

export default function useSaasAccessControl({
    userRole,
    isSuperAdmin,
    currentUser,
    accessCatalog,
    selectedRoleKey,
    baseRoleOptions,
    getRolePriority,
    permissionKeys
}) {
    const {
        PERMISSION_OWNER_ASSIGN,
        PERMISSION_PLATFORM_OVERVIEW_READ,
        PERMISSION_PLATFORM_TENANTS_MANAGE,
        PERMISSION_PLATFORM_PLANS_MANAGE,
        PERMISSION_TENANT_USERS_MANAGE,
        PERMISSION_TENANT_SETTINGS_READ,
        PERMISSION_TENANT_SETTINGS_MANAGE,
        PERMISSION_TENANT_MODULES_READ,
        PERMISSION_TENANT_MODULES_MANAGE,
        PERMISSION_TENANT_QUICK_REPLIES_READ,
        PERMISSION_TENANT_QUICK_REPLIES_MANAGE,
        PERMISSION_TENANT_LABELS_READ,
        PERMISSION_TENANT_LABELS_MANAGE,
        PERMISSION_TENANT_AI_READ,
        PERMISSION_TENANT_AI_MANAGE,
        PERMISSION_TENANT_CUSTOMERS_READ,
        PERMISSION_TENANT_CUSTOMERS_MANAGE,
        PERMISSION_TENANT_CATALOGS_MANAGE,
        PERMISSION_TENANT_CHAT_ASSIGNMENTS_READ,
        PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE,
        PERMISSION_TENANT_KPIS_READ,
        PERMISSION_TENANT_INTEGRATIONS_READ,
        PERMISSION_TENANT_INTEGRATIONS_MANAGE
    } = permissionKeys;

    const normalizedRole = String(userRole || '').trim().toLowerCase();
    const noRoleContext = !normalizedRole;

    const roleBasedCanManageTenants = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const roleBasedCanManageUsers = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageTenantSettings = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || noRoleContext);
    const roleBasedCanManageCatalog = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageRoles = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const roleBasedCanViewSuperAdminSections = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const roleBasedCanEditModules = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageQuickReplies = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageLabels = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageCustomers = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewAi = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageAi = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);

    const actorRoleForPolicy = isSuperAdmin || normalizedRole === 'superadmin' ? 'superadmin' : (normalizedRole || 'seller');
    const actorRolePriority = getRolePriority(actorRoleForPolicy);
    const currentUserId = String(currentUser?.userId || currentUser?.id || '').trim();

    const actorPermissionSet = useMemo(() => new Set(
        (Array.isArray(currentUser?.permissions) ? currentUser.permissions : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
    ), [currentUser?.permissions]);

    const hasPermissionContext = Boolean(
        isSuperAdmin
        || normalizedRole === 'superadmin'
        || actorPermissionSet.size > 0
    );

    const hasAnyActorPermission = useCallback((keys = []) => {
        if (isSuperAdmin || normalizedRole === 'superadmin') return true;
        const source = Array.isArray(keys) ? keys : [];
        return source.some((key) => actorPermissionSet.has(String(key || '').trim()));
    }, [actorPermissionSet, isSuperAdmin, normalizedRole]);

    const canManageTenants = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_PLATFORM_TENANTS_MANAGE])
        : roleBasedCanManageTenants;
    const canManageUsers = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_USERS_MANAGE])
        : roleBasedCanManageUsers;
    const canManageTenantSettings = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_SETTINGS_MANAGE])
        : roleBasedCanManageTenantSettings;
    const canViewTenantSettings = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_SETTINGS_READ, PERMISSION_TENANT_SETTINGS_MANAGE])
        : roleBasedCanManageTenantSettings;
    const canManageCatalog = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_CATALOGS_MANAGE])
        : roleBasedCanManageCatalog;
    const canManageRoles = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_PLATFORM_TENANTS_MANAGE, PERMISSION_PLATFORM_PLANS_MANAGE])
        : roleBasedCanManageRoles;
    const canViewSuperAdminSections = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_PLATFORM_OVERVIEW_READ, PERMISSION_PLATFORM_TENANTS_MANAGE, PERMISSION_PLATFORM_PLANS_MANAGE])
        : roleBasedCanViewSuperAdminSections;
    const canEditTenantSettings = canManageTenantSettings;
    const canEditModules = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_MODULES_MANAGE])
        : roleBasedCanEditModules;
    const canViewModules = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_MODULES_READ, PERMISSION_TENANT_MODULES_MANAGE])
        : roleBasedCanEditModules;
    const canManageQuickReplies = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_QUICK_REPLIES_MANAGE, PERMISSION_TENANT_MODULES_MANAGE])
        : roleBasedCanManageQuickReplies;
    const canViewQuickReplies = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_QUICK_REPLIES_READ,
            PERMISSION_TENANT_QUICK_REPLIES_MANAGE,
            PERMISSION_TENANT_MODULES_READ,
            PERMISSION_TENANT_MODULES_MANAGE
        ])
        : roleBasedCanManageQuickReplies;
    const canManageLabels = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_LABELS_MANAGE, PERMISSION_TENANT_MODULES_MANAGE])
        : roleBasedCanManageLabels;
    const canViewLabels = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_LABELS_READ,
            PERMISSION_TENANT_LABELS_MANAGE,
            PERMISSION_TENANT_MODULES_READ,
            PERMISSION_TENANT_MODULES_MANAGE
        ])
        : roleBasedCanManageLabels;
    const canViewAi = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_AI_READ,
            PERMISSION_TENANT_AI_MANAGE,
            PERMISSION_TENANT_INTEGRATIONS_READ,
            PERMISSION_TENANT_INTEGRATIONS_MANAGE
        ])
        : roleBasedCanViewAi;
    const canManageAi = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_AI_MANAGE, PERMISSION_TENANT_INTEGRATIONS_MANAGE])
        : roleBasedCanManageAi;
    const canViewCustomers = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_CUSTOMERS_READ, PERMISSION_TENANT_CUSTOMERS_MANAGE])
        : roleBasedCanManageCustomers;
    const canManageCustomers = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_CUSTOMERS_MANAGE])
        : roleBasedCanManageCustomers;
    const canViewOperations = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_KPIS_READ, PERMISSION_TENANT_CHAT_ASSIGNMENTS_READ, PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE])
        : Boolean(roleBasedCanManageTenantSettings || roleBasedCanManageUsers);
    const canManageAssignments = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE])
        : Boolean(roleBasedCanManageTenantSettings || roleBasedCanManageUsers);

    const canEditCatalog = canManageCatalog;
    const requiresTenantSelection = Boolean(isSuperAdmin || normalizedRole === 'superadmin');
    const canActorManageRoleChanges = Boolean(
        actorRoleForPolicy === 'superadmin'
        || actorRoleForPolicy === 'owner'
        || (actorRoleForPolicy === 'admin' && actorPermissionSet.has(PERMISSION_OWNER_ASSIGN))
    );

    const defaultRoleOptions = useMemo(() => {
        if (isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext) return baseRoleOptions;
        if (normalizedRole === 'owner') return baseRoleOptions.filter((role) => role !== 'owner');
        if (normalizedRole === 'admin') return ['seller'];
        return ['seller'];
    }, [baseRoleOptions, isSuperAdmin, normalizedRole, noRoleContext]);

    const roleOptions = useMemo(() => {
        const fromCatalog = Array.isArray(accessCatalog?.actor?.assignableRoles)
            ? accessCatalog.actor.assignableRoles
                .map((entry) => String(entry || '').trim().toLowerCase())
                .filter((entry) => Boolean(entry))
            : [];
        const merged = fromCatalog.length > 0 ? fromCatalog : defaultRoleOptions;
        return merged.length > 0 ? merged : ['seller'];
    }, [accessCatalog?.actor?.assignableRoles, defaultRoleOptions]);

    const canEditOptionalAccess = Boolean(
        accessCatalog?.actor?.canEditOptionalAccess
        || isSuperAdmin
        || normalizedRole === 'superadmin'
    );

    const accessPackOptions = useMemo(
        () => (Array.isArray(accessCatalog?.packs) ? accessCatalog.packs : []),
        [accessCatalog?.packs]
    );

    const accessPackLabelMap = useMemo(() => {
        const map = new Map();
        accessPackOptions.forEach((pack) => {
            const packId = String(pack?.id || '').trim();
            if (!packId) return;
            map.set(packId, String(pack?.label || packId));
        });
        return map;
    }, [accessPackOptions]);

    const getOptionalPermissionKeysForRole = useCallback((roleValue = 'seller') => {
        const cleanRole = String(roleValue || 'seller').trim().toLowerCase();
        const profiles = Array.isArray(accessCatalog?.roleProfiles) ? accessCatalog.roleProfiles : [];
        const profile = profiles.find((entry) => String(entry?.role || '').trim().toLowerCase() === cleanRole) || null;
        return new Set(
            (Array.isArray(profile?.optional) ? profile.optional : [])
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
        );
    }, [accessCatalog?.roleProfiles]);

    const getAllowedPackIdsForRole = useCallback((roleValue = 'seller') => {
        const optionalSet = getOptionalPermissionKeysForRole(roleValue);
        const packs = Array.isArray(accessCatalog?.packs) ? accessCatalog.packs : [];
        const allowedPackIds = new Set();
        packs.forEach((pack) => {
            const permissions = Array.isArray(pack?.permissions) ? pack.permissions : [];
            if (permissions.some((permission) => optionalSet.has(String(permission || '').trim()))) {
                allowedPackIds.add(String(pack?.id || '').trim());
            }
        });
        return allowedPackIds;
    }, [accessCatalog?.packs, getOptionalPermissionKeysForRole]);

    const roleProfiles = useMemo(() => {
        const source = Array.isArray(accessCatalog?.roleProfiles) ? accessCatalog.roleProfiles : [];
        return [...source].sort((left, right) => String(left?.label || left?.role || '').localeCompare(String(right?.label || right?.role || ''), 'es', { sensitivity: 'base' }));
    }, [accessCatalog?.roleProfiles]);

    const roleLabelMap = useMemo(() => {
        const map = new Map();
        roleProfiles.forEach((entry) => {
            const key = String(entry?.role || '').trim().toLowerCase();
            if (!key) return;
            map.set(key, String(entry?.label || key));
        });
        return map;
    }, [roleProfiles]);

    const selectedRoleProfile = useMemo(
        () => roleProfiles.find((entry) => String(entry?.role || '').trim().toLowerCase() === String(selectedRoleKey || '').trim().toLowerCase()) || null,
        [roleProfiles, selectedRoleKey]
    );

    const permissionLabelMap = useMemo(() => {
        const map = new Map();
        (Array.isArray(accessCatalog?.permissions) ? accessCatalog.permissions : []).forEach((entry) => {
            const key = String(entry?.key || '').trim();
            if (!key) return;
            map.set(key, String(entry?.label || key));
        });
        return map;
    }, [accessCatalog?.permissions]);

    const rolePermissionOptions = useMemo(() => {
        return (Array.isArray(accessCatalog?.permissions) ? accessCatalog.permissions : [])
            .map((entry) => ({
                key: String(entry?.key || '').trim(),
                label: String(entry?.label || entry?.key || '').trim()
            }))
            .filter((entry) => entry.key)
            .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
    }, [accessCatalog?.permissions]);

    const hasAccessCatalogData = Boolean(roleProfiles.length || accessPackOptions.length || rolePermissionOptions.length);

    return {
        normalizedRole,
        noRoleContext,
        actorRoleForPolicy,
        actorRolePriority,
        currentUserId,
        actorPermissionSet,
        hasPermissionContext,
        hasAnyActorPermission,
        canManageTenants,
        canManageUsers,
        canManageTenantSettings,
        canViewTenantSettings,
        canManageCatalog,
        canManageRoles,
        canViewSuperAdminSections,
        canEditTenantSettings,
        canEditModules,
        canViewModules,
        canManageQuickReplies,
        canViewQuickReplies,
        canManageLabels,
        canViewLabels,
        canViewAi,
        canManageAi,
        canViewCustomers,
        canManageCustomers,
        canViewOperations,
        canManageAssignments,
        canEditCatalog,
        requiresTenantSelection,
        canActorManageRoleChanges,
        defaultRoleOptions,
        roleOptions,
        canEditOptionalAccess,
        accessPackOptions,
        accessPackLabelMap,
        getOptionalPermissionKeysForRole,
        getAllowedPackIdsForRole,
        roleProfiles,
        roleLabelMap,
        selectedRoleProfile,
        permissionLabelMap,
        rolePermissionOptions,
        hasAccessCatalogData
    };
}
