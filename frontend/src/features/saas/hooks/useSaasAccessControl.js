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
        PERMISSION_TENANT_USERS_READ,
        PERMISSION_TENANT_USERS_MANAGE,
        PERMISSION_TENANT_SETTINGS_READ,
        PERMISSION_TENANT_SETTINGS_MANAGE,
        PERMISSION_TENANT_MODULES_READ,
        PERMISSION_TENANT_MODULES_MANAGE,
        PERMISSION_TENANT_QUICK_REPLIES_READ,
        PERMISSION_TENANT_QUICK_REPLIES_MANAGE,
        PERMISSION_TENANT_LABELS_READ,
        PERMISSION_TENANT_LABELS_MANAGE,
        PERMISSION_TENANT_ZONES_READ,
        PERMISSION_TENANT_ZONES_MANAGE,
        PERMISSION_TENANT_AI_READ,
        PERMISSION_TENANT_AI_MANAGE,
        PERMISSION_TENANT_COMMERCIAL_INTELLIGENCE_READ,
        PERMISSION_TENANT_COMMERCIAL_INTELLIGENCE_MANAGE,
        PERMISSION_TENANT_CUSTOMERS_READ,
        PERMISSION_TENANT_CUSTOMERS_MANAGE,
        PERMISSION_TENANT_CATALOGS_READ,
        PERMISSION_TENANT_CATALOGS_MANAGE,
        PERMISSION_TENANT_CAMPAIGNS_READ,
        PERMISSION_TENANT_CAMPAIGNS_MANAGE,
        PERMISSION_TENANT_META_ADS_READ,
        PERMISSION_TENANT_META_ADS_MANAGE,
        PERMISSION_TENANT_META_TEMPLATES_READ,
        PERMISSION_TENANT_META_TEMPLATES_MANAGE,
        PERMISSION_TENANT_AUTOMATIONS_READ,
        PERMISSION_TENANT_AUTOMATIONS_MANAGE,
        PERMISSION_TENANT_SCHEDULES_READ,
        PERMISSION_TENANT_SCHEDULES_MANAGE,
        PERMISSION_TENANT_AUDIT_READ,
        PERMISSION_TENANT_EMAIL_TEMPLATES_READ,
        PERMISSION_TENANT_EMAIL_TEMPLATES_MANAGE,
        PERMISSION_TENANT_BRAND_READ,
        PERMISSION_TENANT_BRAND_MANAGE,
        PERMISSION_TENANT_PROFILE_MANAGE,
        PERMISSION_TENANT_CHAT_OPERATE,
        PERMISSION_TENANT_CHAT_ASSIGN_AUTONOMOUS,
        PERMISSION_TENANT_CHAT_ASSIGNMENTS_READ,
        PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE,
        PERMISSION_TENANT_ASSIGNMENT_RULES_READ,
        PERMISSION_TENANT_ASSIGNMENT_RULES_MANAGE,
        PERMISSION_TENANT_KPIS_READ,
        PERMISSION_TENANT_INTEGRATIONS_READ,
        PERMISSION_TENANT_INTEGRATIONS_MANAGE,
        PERMISSION_DEVICES_VIEW_OWN,
        PERMISSION_DEVICES_REVOKE_OWN,
        PERMISSION_DEVICES_VIEW_ALL,
        PERMISSION_DEVICES_REVOKE_ALL
    } = permissionKeys;

    const normalizedRole = String(userRole || '').trim().toLowerCase();
    const normalizedCurrentUserRole = String(currentUser?.role || '').trim().toLowerCase();
    const normalizedCurrentUserRoleLabel = String(currentUser?.roleLabel || '').trim().toLowerCase();
    const effectiveIsSuperAdmin = Boolean(
        isSuperAdmin
        || normalizedRole === 'superadmin'
        || currentUser?.isSuperAdmin === true
        || normalizedCurrentUserRole === 'superadmin'
        || normalizedCurrentUserRoleLabel === 'superadmin'
    );
    const noRoleContext = !normalizedRole;

    const roleBasedCanManageTenants = Boolean(effectiveIsSuperAdmin || noRoleContext);
    const roleBasedCanViewUsers = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageUsers = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageTenantSettings = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || noRoleContext);
    const roleBasedCanViewCatalog = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'seller' || noRoleContext);
    const roleBasedCanManageCatalog = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageRoles = Boolean(effectiveIsSuperAdmin || noRoleContext);
    const roleBasedCanViewSuperAdminSections = Boolean(effectiveIsSuperAdmin || noRoleContext);
    const roleBasedCanEditModules = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageQuickReplies = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageLabels = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageZones = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageCustomers = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewAi = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageAi = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewCommercialIntelligence = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageCommercialIntelligence = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || noRoleContext);
    const roleBasedCanViewCampaigns = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageCampaigns = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewMetaAds = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageMetaAds = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewMetaTemplates = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageMetaTemplates = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewAutomations = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageAutomations = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewSchedules = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageSchedules = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewAuditLogs = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || noRoleContext);
    const roleBasedCanViewEmailTemplates = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageEmailTemplates = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewBrand = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageBrand = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || noRoleContext);
    const roleBasedCanManageOwnProfile = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'seller' || noRoleContext);
    const roleBasedCanAssignAutonomousPatty = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewOwnDevices = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'seller' || noRoleContext);
    const roleBasedCanRevokeOwnDevices = roleBasedCanViewOwnDevices;
    const roleBasedCanViewAllDevices = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanRevokeAllDevices = Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || noRoleContext);

    const actorRoleForPolicy = effectiveIsSuperAdmin ? 'superadmin' : (normalizedRole || 'seller');
    const actorRolePriority = getRolePriority(actorRoleForPolicy);
    const currentUserId = String(currentUser?.userId || currentUser?.id || '').trim();

    const actorPermissionSet = useMemo(() => new Set(
        (Array.isArray(currentUser?.permissions) ? currentUser.permissions : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
    ), [currentUser?.permissions]);

    const hasPermissionContext = Boolean(
        effectiveIsSuperAdmin
        || actorPermissionSet.size > 0
    );

    const hasAnyActorPermission = useCallback((keys = []) => {
        if (effectiveIsSuperAdmin) return true;
        const source = Array.isArray(keys) ? keys : [];
        return source.some((key) => actorPermissionSet.has(String(key || '').trim()));
    }, [actorPermissionSet, effectiveIsSuperAdmin]);

    const resolvePermissionFlag = useCallback((keys = [], roleFallback = false) => {
        if (!hasPermissionContext) return Boolean(roleFallback);
        return Boolean(roleFallback || hasAnyActorPermission(keys));
    }, [hasAnyActorPermission, hasPermissionContext]);

    const canManageTenants = resolvePermissionFlag([PERMISSION_PLATFORM_TENANTS_MANAGE], roleBasedCanManageTenants);
    const canManageUsers = resolvePermissionFlag([PERMISSION_TENANT_USERS_MANAGE], roleBasedCanManageUsers);
    const canViewUsers = resolvePermissionFlag(
        [PERMISSION_TENANT_USERS_READ, PERMISSION_TENANT_USERS_MANAGE],
        roleBasedCanViewUsers
    );
    const canManageTenantSettings = resolvePermissionFlag([PERMISSION_TENANT_SETTINGS_MANAGE], roleBasedCanManageTenantSettings);
    const canViewTenantSettings = resolvePermissionFlag(
        [PERMISSION_TENANT_SETTINGS_READ, PERMISSION_TENANT_SETTINGS_MANAGE],
        roleBasedCanManageTenantSettings
    );
    const canViewCatalog = resolvePermissionFlag(
        [PERMISSION_TENANT_CATALOGS_READ, PERMISSION_TENANT_CATALOGS_MANAGE],
        roleBasedCanViewCatalog
    );
    const canManageCatalog = resolvePermissionFlag([PERMISSION_TENANT_CATALOGS_MANAGE], roleBasedCanManageCatalog);
    const canManageRoles = resolvePermissionFlag(
        [PERMISSION_PLATFORM_TENANTS_MANAGE, PERMISSION_PLATFORM_PLANS_MANAGE],
        roleBasedCanManageRoles
    );
    const canViewSuperAdminSections = resolvePermissionFlag(
        [PERMISSION_PLATFORM_OVERVIEW_READ, PERMISSION_PLATFORM_TENANTS_MANAGE, PERMISSION_PLATFORM_PLANS_MANAGE],
        roleBasedCanViewSuperAdminSections
    );
    const canEditTenantSettings = canManageTenantSettings;
    const canEditModules = resolvePermissionFlag([PERMISSION_TENANT_MODULES_MANAGE], roleBasedCanEditModules);
    const canViewModules = resolvePermissionFlag(
        [PERMISSION_TENANT_MODULES_READ, PERMISSION_TENANT_MODULES_MANAGE],
        roleBasedCanEditModules
    );
    const canManageQuickReplies = resolvePermissionFlag([PERMISSION_TENANT_QUICK_REPLIES_MANAGE], roleBasedCanManageQuickReplies);
    const canViewQuickReplies = resolvePermissionFlag([
            PERMISSION_TENANT_QUICK_REPLIES_READ,
            PERMISSION_TENANT_QUICK_REPLIES_MANAGE,
            PERMISSION_TENANT_MODULES_READ,
            PERMISSION_TENANT_MODULES_MANAGE
        ],
        roleBasedCanManageQuickReplies
    );
    const canManageLabels = resolvePermissionFlag([PERMISSION_TENANT_LABELS_MANAGE], roleBasedCanManageLabels);
    const canViewLabels = resolvePermissionFlag([
            PERMISSION_TENANT_LABELS_READ,
            PERMISSION_TENANT_LABELS_MANAGE,
            PERMISSION_TENANT_MODULES_READ,
            PERMISSION_TENANT_MODULES_MANAGE
        ],
        roleBasedCanManageLabels
    );
    const canManageZones = resolvePermissionFlag([PERMISSION_TENANT_ZONES_MANAGE], roleBasedCanManageZones);
    const canViewZones = resolvePermissionFlag([
            PERMISSION_TENANT_ZONES_READ,
            PERMISSION_TENANT_ZONES_MANAGE
        ],
        roleBasedCanManageZones
    );
    const canViewAi = resolvePermissionFlag([
            PERMISSION_TENANT_AI_READ,
            PERMISSION_TENANT_AI_MANAGE,
            PERMISSION_TENANT_INTEGRATIONS_READ,
            PERMISSION_TENANT_INTEGRATIONS_MANAGE
        ],
        roleBasedCanViewAi
    );
    const canManageAi = resolvePermissionFlag(
        [PERMISSION_TENANT_AI_MANAGE, PERMISSION_TENANT_INTEGRATIONS_MANAGE],
        roleBasedCanManageAi
    );
    const canViewCommercialIntelligence = resolvePermissionFlag([
            PERMISSION_TENANT_COMMERCIAL_INTELLIGENCE_READ,
            PERMISSION_TENANT_COMMERCIAL_INTELLIGENCE_MANAGE
        ],
        roleBasedCanViewCommercialIntelligence
    );
    const canManageCommercialIntelligence = resolvePermissionFlag(
        [PERMISSION_TENANT_COMMERCIAL_INTELLIGENCE_MANAGE],
        roleBasedCanManageCommercialIntelligence
    );
    const canViewCampaigns = resolvePermissionFlag(
        [PERMISSION_TENANT_CAMPAIGNS_READ, PERMISSION_TENANT_CAMPAIGNS_MANAGE],
        roleBasedCanViewCampaigns
    );
    const canManageCampaigns = resolvePermissionFlag([PERMISSION_TENANT_CAMPAIGNS_MANAGE], roleBasedCanManageCampaigns);
    const canViewMetaAds = resolvePermissionFlag(
        [PERMISSION_TENANT_META_ADS_READ, PERMISSION_TENANT_META_ADS_MANAGE],
        roleBasedCanViewMetaAds
    );
    const canManageMetaAds = resolvePermissionFlag([PERMISSION_TENANT_META_ADS_MANAGE], roleBasedCanManageMetaAds);
    const canViewMetaTemplates = resolvePermissionFlag(
        [PERMISSION_TENANT_META_TEMPLATES_READ, PERMISSION_TENANT_META_TEMPLATES_MANAGE],
        roleBasedCanViewMetaTemplates
    );
    const canManageMetaTemplates = resolvePermissionFlag([PERMISSION_TENANT_META_TEMPLATES_MANAGE], roleBasedCanManageMetaTemplates);
    const canViewAutomations = resolvePermissionFlag(
        [PERMISSION_TENANT_AUTOMATIONS_READ, PERMISSION_TENANT_AUTOMATIONS_MANAGE],
        roleBasedCanViewAutomations
    );
    const canManageAutomations = resolvePermissionFlag([PERMISSION_TENANT_AUTOMATIONS_MANAGE], roleBasedCanManageAutomations);
    const canViewSchedules = resolvePermissionFlag(
        [PERMISSION_TENANT_SCHEDULES_READ, PERMISSION_TENANT_SCHEDULES_MANAGE],
        roleBasedCanViewSchedules
    );
    const canManageSchedules = resolvePermissionFlag([PERMISSION_TENANT_SCHEDULES_MANAGE], roleBasedCanManageSchedules);
    const canViewAuditLogs = resolvePermissionFlag([PERMISSION_TENANT_AUDIT_READ], roleBasedCanViewAuditLogs);
    const canViewEmailTemplates = resolvePermissionFlag(
        [PERMISSION_TENANT_EMAIL_TEMPLATES_READ, PERMISSION_TENANT_EMAIL_TEMPLATES_MANAGE],
        roleBasedCanViewEmailTemplates
    );
    const canManageEmailTemplates = resolvePermissionFlag(
        [PERMISSION_TENANT_EMAIL_TEMPLATES_MANAGE],
        roleBasedCanManageEmailTemplates
    );
    const canViewBrand = resolvePermissionFlag(
        [PERMISSION_TENANT_BRAND_READ, PERMISSION_TENANT_BRAND_MANAGE],
        roleBasedCanViewBrand
    );
    const canManageBrand = resolvePermissionFlag([PERMISSION_TENANT_BRAND_MANAGE], roleBasedCanManageBrand);
    const canManageOwnProfile = resolvePermissionFlag([PERMISSION_TENANT_PROFILE_MANAGE], roleBasedCanManageOwnProfile);
    const canAssignAutonomousPatty = resolvePermissionFlag(
        [PERMISSION_TENANT_CHAT_ASSIGN_AUTONOMOUS],
        roleBasedCanAssignAutonomousPatty
    );
    const canViewCustomers = resolvePermissionFlag(
        [PERMISSION_TENANT_CUSTOMERS_READ, PERMISSION_TENANT_CUSTOMERS_MANAGE],
        roleBasedCanManageCustomers
    );
    const canManageCustomers = resolvePermissionFlag([PERMISSION_TENANT_CUSTOMERS_MANAGE], roleBasedCanManageCustomers);
    const canSelectCustomersForCampaigns = resolvePermissionFlag([
            PERMISSION_TENANT_CAMPAIGNS_READ,
            PERMISSION_TENANT_CAMPAIGNS_MANAGE,
            PERMISSION_TENANT_CUSTOMERS_MANAGE
        ],
        Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || roleBasedCanManageCustomers)
    );
    const canViewOperations = resolvePermissionFlag([
            PERMISSION_TENANT_CHAT_OPERATE,
            PERMISSION_TENANT_KPIS_READ,
            PERMISSION_TENANT_CHAT_ASSIGNMENTS_READ,
            PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE,
            PERMISSION_TENANT_ASSIGNMENT_RULES_READ,
            PERMISSION_TENANT_ASSIGNMENT_RULES_MANAGE
        ],
        Boolean(roleBasedCanManageTenantSettings || roleBasedCanManageUsers)
    );
    const canOperateChat = resolvePermissionFlag(
        [PERMISSION_TENANT_CHAT_OPERATE, PERMISSION_TENANT_CHAT_ASSIGNMENTS_READ, PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE],
        Boolean(effectiveIsSuperAdmin || normalizedRole === 'owner' || normalizedRole === 'admin' || normalizedRole === 'seller' || noRoleContext)
    );
    const canManageAssignments = resolvePermissionFlag(
        [PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE],
        Boolean(roleBasedCanManageTenantSettings || roleBasedCanManageUsers)
    );
    const canManageAssignmentRules = resolvePermissionFlag(
        [PERMISSION_TENANT_ASSIGNMENT_RULES_MANAGE],
        Boolean(roleBasedCanManageTenantSettings || roleBasedCanManageUsers)
    );
    const canViewOwnDevices = resolvePermissionFlag([PERMISSION_DEVICES_VIEW_OWN], roleBasedCanViewOwnDevices);
    const canRevokeOwnDevices = resolvePermissionFlag([PERMISSION_DEVICES_REVOKE_OWN], roleBasedCanRevokeOwnDevices);
    const canViewAllDevices = resolvePermissionFlag([PERMISSION_DEVICES_VIEW_ALL], roleBasedCanViewAllDevices);
    const canRevokeAllDevices = resolvePermissionFlag([PERMISSION_DEVICES_REVOKE_ALL], roleBasedCanRevokeAllDevices);

    const canEditCatalog = canManageCatalog;
    const requiresTenantSelection = Boolean(effectiveIsSuperAdmin);
    const canActorManageRoleChanges = Boolean(
        actorRoleForPolicy === 'superadmin'
        || actorRoleForPolicy === 'owner'
        || (actorRoleForPolicy === 'admin' && actorPermissionSet.has(PERMISSION_OWNER_ASSIGN))
    );

    const defaultRoleOptions = useMemo(() => {
        if (effectiveIsSuperAdmin || noRoleContext) return baseRoleOptions;
        if (normalizedRole === 'owner') return baseRoleOptions.filter((role) => role !== 'owner');
        if (normalizedRole === 'admin') return ['seller'];
        return ['seller'];
    }, [baseRoleOptions, effectiveIsSuperAdmin, normalizedRole, noRoleContext]);

    const roleOptions = useMemo(() => {
        const fromCatalog = Array.isArray(accessCatalog?.actor?.assignableRoles)
            ? accessCatalog.actor.assignableRoles
                .map((entry) => String(entry || '').trim().toLowerCase())
                .filter((entry) => Boolean(entry))
            : [];
        const merged = new Set(fromCatalog.length > 0 ? fromCatalog : defaultRoleOptions);
        if (effectiveIsSuperAdmin || noRoleContext) {
            [...baseRoleOptions, 'owner', 'admin', 'seller']
                .map((entry) => String(entry || '').trim().toLowerCase())
                .filter(Boolean)
                .forEach((role) => merged.add(role));
        }
        return merged.size > 0 ? Array.from(merged) : ['seller'];
    }, [accessCatalog?.actor?.assignableRoles, baseRoleOptions, defaultRoleOptions, effectiveIsSuperAdmin, noRoleContext]);

    const canEditOptionalAccess = Boolean(
        accessCatalog?.actor?.canEditOptionalAccess
        || effectiveIsSuperAdmin
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
        canViewUsers,
        canManageTenantSettings,
        canViewTenantSettings,
        canManageCatalog,
        canViewCatalog,
        canManageRoles,
        canViewSuperAdminSections,
        canEditTenantSettings,
        canEditModules,
        canViewModules,
        canManageQuickReplies,
        canViewQuickReplies,
        canManageLabels,
        canViewLabels,
        canManageZones,
        canViewZones,
        canViewAi,
        canManageAi,
        canViewCommercialIntelligence,
        canManageCommercialIntelligence,
        canViewCampaigns,
        canManageCampaigns,
        canSelectCustomersForCampaigns,
        canViewMetaAds,
        canManageMetaAds,
        canViewMetaTemplates,
        canManageMetaTemplates,
        canViewAutomations,
        canManageAutomations,
        canViewSchedules,
        canManageSchedules,
        canViewAuditLogs,
        canViewEmailTemplates,
        canManageEmailTemplates,
        canViewBrand,
        canManageBrand,
        canManageOwnProfile,
        canAssignAutonomousPatty,
        canViewCustomers,
        canManageCustomers,
        canViewOperations,
        canOperateChat,
        canManageAssignments,
        canManageAssignmentRules,
        canViewOwnDevices,
        canRevokeOwnDevices,
        canViewAllDevices,
        canRevokeAllDevices,
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
