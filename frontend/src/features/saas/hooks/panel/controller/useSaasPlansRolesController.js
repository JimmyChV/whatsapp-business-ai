export default function useSaasPlansRolesController(input = {}) {
    const {
        panelCoreState = {},
        saasAccessControl = {},
        plansRolesActions = null
    } = input;

    const plansRolesState = {
        planMatrix: panelCoreState.planMatrix,
        setPlanMatrix: panelCoreState.setPlanMatrix,
        selectedPlanId: panelCoreState.selectedPlanId,
        setSelectedPlanId: panelCoreState.setSelectedPlanId,
        planForm: panelCoreState.planForm,
        setPlanForm: panelCoreState.setPlanForm,
        planPanelMode: panelCoreState.planPanelMode,
        setPlanPanelMode: panelCoreState.setPlanPanelMode,
        accessCatalog: panelCoreState.accessCatalog,
        setAccessCatalog: panelCoreState.setAccessCatalog,
        loadingAccessCatalog: panelCoreState.loadingAccessCatalog,
        setLoadingAccessCatalog: panelCoreState.setLoadingAccessCatalog,
        selectedRoleKey: panelCoreState.selectedRoleKey,
        setSelectedRoleKey: panelCoreState.setSelectedRoleKey,
        roleForm: panelCoreState.roleForm,
        setRoleForm: panelCoreState.setRoleForm,
        rolePanelMode: panelCoreState.rolePanelMode,
        setRolePanelMode: panelCoreState.setRolePanelMode,
        loadingPlans: panelCoreState.loadingPlans,
        setLoadingPlans: panelCoreState.setLoadingPlans
    };

    const plansRolesDerived = {
        canManageRoles: saasAccessControl.canManageRoles,
        canActorManageRoleChanges: saasAccessControl.canActorManageRoleChanges,
        canEditOptionalAccess: saasAccessControl.canEditOptionalAccess,
        roleOptions: saasAccessControl.roleOptions,
        roleProfiles: saasAccessControl.roleProfiles,
        roleLabelMap: saasAccessControl.roleLabelMap,
        selectedRoleProfile: saasAccessControl.selectedRoleProfile,
        permissionLabelMap: saasAccessControl.permissionLabelMap,
        rolePermissionOptions: saasAccessControl.rolePermissionOptions,
        hasAccessCatalogData: saasAccessControl.hasAccessCatalogData,
        accessPackOptions: saasAccessControl.accessPackOptions,
        accessPackLabelMap: saasAccessControl.accessPackLabelMap,
        getOptionalPermissionKeysForRole: saasAccessControl.getOptionalPermissionKeysForRole,
        getAllowedPackIdsForRole: saasAccessControl.getAllowedPackIdsForRole
    };

    return {
        plansRolesState,
        plansRolesDerived,
        plansRolesActions
    };
}
