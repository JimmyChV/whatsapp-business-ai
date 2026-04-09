export default function useSaasTenantController(input = {}) {
    const {
        panelCoreState = {},
        tenantScopeState = {},
        tenantDataLoaders = {}
    } = input;

    const tenantState = {
        overview: panelCoreState.overview,
        setOverview: panelCoreState.setOverview,
        tenantForm: panelCoreState.tenantForm,
        setTenantForm: panelCoreState.setTenantForm,
        settingsTenantId: panelCoreState.settingsTenantId,
        setSettingsTenantId: panelCoreState.setSettingsTenantId,
        tenantSettings: panelCoreState.tenantSettings,
        setTenantSettings: panelCoreState.setTenantSettings,
        selectedTenantId: panelCoreState.selectedTenantId,
        setSelectedTenantId: panelCoreState.setSelectedTenantId,
        tenantPanelMode: panelCoreState.tenantPanelMode,
        setTenantPanelMode: panelCoreState.setTenantPanelMode,
        tenantIntegrations: panelCoreState.tenantIntegrations,
        setTenantIntegrations: panelCoreState.setTenantIntegrations,
        customers: panelCoreState.customers,
        setCustomers: panelCoreState.setCustomers,
        loadingSettings: panelCoreState.loadingSettings,
        setLoadingSettings: panelCoreState.setLoadingSettings,
        loadingIntegrations: panelCoreState.loadingIntegrations,
        setLoadingIntegrations: panelCoreState.setLoadingIntegrations
    };

    const tenantDerived = {
        tenantOptions: tenantScopeState.tenantOptions,
        selectedTenant: tenantScopeState.selectedTenant,
        tenantScopeId: tenantScopeState.tenantScopeId,
        tenantScopeLocked: tenantScopeState.tenantScopeLocked,
        activeTenantLabel: tenantScopeState.activeTenantLabel,
        currentUserDisplayName: tenantScopeState.currentUserDisplayName,
        currentUserEmail: tenantScopeState.currentUserEmail,
        currentUserAvatarUrl: tenantScopeState.currentUserAvatarUrl,
        currentUserRole: tenantScopeState.currentUserRole,
        currentUserRoleLabel: tenantScopeState.currentUserRoleLabel,
        currentUserTenantCount: tenantScopeState.currentUserTenantCount
    };

    const tenantLoaders = {
        refreshOverview: tenantDataLoaders.refreshOverview,
        loadTenantSettings: tenantDataLoaders.loadTenantSettings,
        loadTenantIntegrations: tenantDataLoaders.loadTenantIntegrations,
        loadWaModules: tenantDataLoaders.loadWaModules,
        loadCustomers: tenantDataLoaders.loadCustomers,
        syncCustomersDelta: tenantDataLoaders.syncCustomersDelta,
        maxCustomersUpdatedAt: tenantDataLoaders.maxCustomersUpdatedAt
    };

    return {
        tenantState,
        tenantDerived,
        tenantLoaders
    };
}
