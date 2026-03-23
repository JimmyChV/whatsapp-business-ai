export default function useSaasPanelSectionContextsInput(input = {}) {
    const {
        panelCoreState = {},
        saasAccessControl = {},
        operationsPanelState = {},
        panelLoadingState = {},
        tenantScopeState = {},
        tenantDataLoaders = {},
        panelUserScopeState = {},
        panelDerivedData = {},
        tenantUsersState = {},
        quickReplyAssetsUploadState = {},
        quickReplyAdminActions = {},
        tenantLabelsAdminActions = {},
        catalogAdminActions = {},
        aiAssistantsAdminActions = {},
        plansRolesActions = {},
        tenantsUsersActions = {},
        customersAdminActions = {},
        panelNavigation = {},
        operationAccess = {},
        moduleSectionActions = {},
        extras = {}
    } = input;

    return {
        ...panelCoreState,
        ...saasAccessControl,
        ...operationsPanelState,
        ...panelLoadingState,
        ...tenantScopeState,
        ...tenantDataLoaders,
        ...panelUserScopeState,
        ...panelDerivedData,
        ...tenantUsersState,
        ...quickReplyAssetsUploadState,
        ...quickReplyAdminActions,
        ...tenantLabelsAdminActions,
        ...catalogAdminActions,
        ...aiAssistantsAdminActions,
        ...plansRolesActions,
        ...tenantsUsersActions,
        ...customersAdminActions,
        ...panelNavigation,
        ...operationAccess,
        ...moduleSectionActions,
        ...extras
    };
}
