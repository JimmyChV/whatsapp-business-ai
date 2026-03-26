import useSaasPanelDerivedData from '../useSaasPanelDerivedData';
import useSaasPanelUserScopeState from '../useSaasPanelUserScopeState';
import useSaasTenantDataLoaders from '../../domains/tenants/useSaasTenantDataLoaders';
import useSaasTenantScope from '../../domains/tenants/useSaasTenantScope';
import useSaasTenantUsers from '../../domains/tenants/useSaasTenantUsers';

export default function useSaasPanelDataContexts(input = {}) {
    const c = input;

    const tenantScopeState = useSaasTenantScope({
        overviewTenants: c.overviewTenants,
        selectedTenantId: c.selectedTenantId,
        settingsTenantId: c.settingsTenantId,
        requiresTenantSelection: c.requiresTenantSelection,
        activeTenantId: c.activeTenantId,
        toTenantDisplayName: c.toTenantDisplayName,
        currentUser: c.currentUser,
        actorRoleForPolicy: c.actorRoleForPolicy
    });

    const tenantDataLoaders = useSaasTenantDataLoaders({
        requestJson: c.requestJson,
        requiresTenantSelection: c.requiresTenantSelection,
        activeTenantId: c.activeTenantId,
        setOverview: c.setOverview,
        setSelectedTenantId: c.setSelectedTenantId,
        setSettingsTenantId: c.setSettingsTenantId,
        setSelectedUserId: c.setSelectedUserId,
        setLoadingSettings: c.setLoadingSettings,
        setTenantSettings: c.setTenantSettings,
        setLoadingIntegrations: c.setLoadingIntegrations,
        setTenantIntegrations: c.setTenantIntegrations,
        setWaModules: c.setWaModules,
        setSelectedWaModuleId: c.setSelectedWaModuleId,
        setCustomers: c.setCustomers,
        setSelectedCustomerId: c.setSelectedCustomerId
    });

    const panelUserScopeState = useSaasPanelUserScopeState({
        overviewUsers: c.overviewUsers,
        tenantScopeId: tenantScopeState.tenantScopeId,
        selectedUserId: c.selectedUserId,
        currentUserId: c.currentUserId,
        actorRoleForPolicy: c.actorRoleForPolicy,
        actorRolePriority: c.actorRolePriority,
        canManageUsers: c.canManageUsers,
        canActorManageRoleChanges: c.canActorManageRoleChanges,
        canEditOptionalAccess: c.canEditOptionalAccess,
        userPanelMode: c.userPanelMode,
        userFormRole: c.userFormRole,
        canManageTenants: c.canManageTenants,
        canManageCatalog: c.canManageCatalog,
        canManageLabels: c.canManageLabels,
        canManageTenantSettings: c.canManageTenantSettings,
        canEditModules: c.canEditModules,
        canViewSuperAdminSections: c.canViewSuperAdminSections,
        resolvePrimaryRoleFromMemberships: c.resolvePrimaryRoleFromMemberships,
        sanitizeMemberships: c.sanitizeMemberships,
        getRolePriority: c.getRolePriority,
        getOptionalPermissionKeysForRole: c.getOptionalPermissionKeysForRole,
        getAllowedPackIdsForRole: c.getAllowedPackIdsForRole
    });

    const panelDerivedData = useSaasPanelDerivedData({
        customerSearch: c.customerSearch,
        customers: c.customers,
        selectedCustomerId: c.selectedCustomerId,
        waModules: c.waModules,
        selectedWaModuleId: c.selectedWaModuleId,
        quickReplyModuleFilterId: c.quickReplyModuleFilterId,
        quickReplyLibraries: c.quickReplyLibraries,
        selectedQuickReplyLibraryId: c.selectedQuickReplyLibraryId,
        quickReplyItems: c.quickReplyItems,
        selectedQuickReplyItemId: c.selectedQuickReplyItemId,
        quickReplyItemForm: c.quickReplyItemForm,
        quickReplyLibrarySearch: c.quickReplyLibrarySearch,
        quickReplyItemSearch: c.quickReplyItemSearch,
        tenantLabels: c.tenantLabels,
        selectedLabelId: c.selectedLabelId,
        labelSearch: c.labelSearch,
        tenantOptions: tenantScopeState.tenantOptions,
        settingsTenantId: c.settingsTenantId,
        planMatrix: c.planMatrix,
        quickReplyDefaultMaxUploadMb: c.quickReplyDefaultMaxUploadMb,
        quickReplyDefaultStorageMb: c.quickReplyDefaultStorageMb,
        selectedConfigKey: c.selectedConfigKey,
        waModuleForm: c.waModuleForm,
        tenantCatalogs: c.tenantCatalogs,
        selectedCatalogId: c.selectedCatalogId,
        tenantCatalogProducts: c.tenantCatalogProducts,
        selectedCatalogProductId: c.selectedCatalogProductId,
        tenantAiAssistants: c.tenantAiAssistants,
        selectedAiAssistantId: c.selectedAiAssistantId,
        selectedPlanId: c.selectedPlanId,
        planOptions: c.planOptions
    });

    const tenantUsersState = useSaasTenantUsers({
        overviewUsers: c.overviewUsers,
        settingsTenantId: c.settingsTenantId,
        waModuleForm: c.waModuleForm,
        toUserDisplayName: c.toUserDisplayName
    });

    return {
        tenantScopeState,
        tenantDataLoaders,
        panelUserScopeState,
        panelDerivedData,
        tenantUsersState
    };
}
