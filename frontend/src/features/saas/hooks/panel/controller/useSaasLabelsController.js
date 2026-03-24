export default function useSaasLabelsController(input = {}) {
    const {
        panelCoreState = {},
        panelDerivedData = {},
        tenantLabelsAdminActions = null,
        settingsTenantId = '',
        waModules = [],
        canManageLabels = false,
        runAction = null,
        requestJson = null,
        setError = null,
        busy = false
    } = input;

    const labelsState = {
        tenantLabels: panelCoreState.tenantLabels,
        setTenantLabels: panelCoreState.setTenantLabels,
        selectedLabelId: panelCoreState.selectedLabelId,
        setSelectedLabelId: panelCoreState.setSelectedLabelId,
        labelForm: panelCoreState.labelForm,
        setLabelForm: panelCoreState.setLabelForm,
        labelPanelMode: panelCoreState.labelPanelMode,
        setLabelPanelMode: panelCoreState.setLabelPanelMode,
        labelSearch: panelCoreState.labelSearch,
        setLabelSearch: panelCoreState.setLabelSearch,
        loadingLabels: panelCoreState.loadingLabels,
        setLoadingLabels: panelCoreState.setLoadingLabels
    };

    const labelsDerived = {
        tenantLabelItems: panelDerivedData.tenantLabelItems,
        selectedTenantLabel: panelDerivedData.selectedTenantLabel,
        visibleTenantLabels: panelDerivedData.visibleTenantLabels
    };

    const labelsActions = tenantLabelsAdminActions;

    const labelsRuntime = {
        settingsTenantId,
        waModules,
        canManageLabels,
        runAction,
        requestJson,
        setError,
        busy
    };

    return {
        labelsState,
        labelsActions,
        labelsDerived,
        labelsRuntime
    };
}
