export default function useSaasAiController(input = {}) {
    const {
        panelCoreState = {},
        panelDerivedData = {},
        aiAssistantsAdminActions = null
    } = input;

    const aiState = {
        tenantAiAssistants: panelCoreState.tenantAiAssistants,
        setTenantAiAssistants: panelCoreState.setTenantAiAssistants,
        selectedAiAssistantId: panelCoreState.selectedAiAssistantId,
        setSelectedAiAssistantId: panelCoreState.setSelectedAiAssistantId,
        aiAssistantForm: panelCoreState.aiAssistantForm,
        setAiAssistantForm: panelCoreState.setAiAssistantForm,
        aiAssistantPanelMode: panelCoreState.aiAssistantPanelMode,
        setAiAssistantPanelMode: panelCoreState.setAiAssistantPanelMode,
        loadingAiAssistants: panelCoreState.loadingAiAssistants,
        setLoadingAiAssistants: panelCoreState.setLoadingAiAssistants
    };

    const aiDerived = {
        tenantAiAssistantItems: panelDerivedData.tenantAiAssistantItems,
        activeAiAssistantOptions: panelDerivedData.activeAiAssistantOptions,
        selectedAiAssistant: panelDerivedData.selectedAiAssistant,
        defaultAiAssistantId: panelDerivedData.defaultAiAssistantId,
        aiAssistantLabelMap: panelDerivedData.aiAssistantLabelMap
    };

    return {
        aiState,
        aiDerived,
        aiActions: aiAssistantsAdminActions
    };
}
