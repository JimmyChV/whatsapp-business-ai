export default function useSaasQuickRepliesController(input = {}) {
    const {
        panelCoreState = {},
        panelDerivedData = {},
        quickReplyAdminActions = null,
        quickReplyAssetsUploadState = null
    } = input;

    const quickRepliesState = {
        quickReplyModuleFilterId: panelCoreState.quickReplyModuleFilterId,
        setQuickReplyModuleFilterId: panelCoreState.setQuickReplyModuleFilterId,
        quickReplyLibraries: panelCoreState.quickReplyLibraries,
        setQuickReplyLibraries: panelCoreState.setQuickReplyLibraries,
        quickReplyItems: panelCoreState.quickReplyItems,
        setQuickReplyItems: panelCoreState.setQuickReplyItems,
        selectedQuickReplyLibraryId: panelCoreState.selectedQuickReplyLibraryId,
        setSelectedQuickReplyLibraryId: panelCoreState.setSelectedQuickReplyLibraryId,
        selectedQuickReplyItemId: panelCoreState.selectedQuickReplyItemId,
        setSelectedQuickReplyItemId: panelCoreState.setSelectedQuickReplyItemId,
        quickReplyLibraryForm: panelCoreState.quickReplyLibraryForm,
        setQuickReplyLibraryForm: panelCoreState.setQuickReplyLibraryForm,
        quickReplyItemForm: panelCoreState.quickReplyItemForm,
        setQuickReplyItemForm: panelCoreState.setQuickReplyItemForm,
        quickReplyLibraryPanelMode: panelCoreState.quickReplyLibraryPanelMode,
        setQuickReplyLibraryPanelMode: panelCoreState.setQuickReplyLibraryPanelMode,
        quickReplyItemPanelMode: panelCoreState.quickReplyItemPanelMode,
        setQuickReplyItemPanelMode: panelCoreState.setQuickReplyItemPanelMode,
        quickReplyLibrarySearch: panelCoreState.quickReplyLibrarySearch,
        setQuickReplyLibrarySearch: panelCoreState.setQuickReplyLibrarySearch,
        quickReplyItemSearch: panelCoreState.quickReplyItemSearch,
        setQuickReplyItemSearch: panelCoreState.setQuickReplyItemSearch,
        loadingQuickReplies: panelCoreState.loadingQuickReplies,
        setLoadingQuickReplies: panelCoreState.setLoadingQuickReplies
    };

    const quickRepliesDerived = {
        quickReplyScopeModuleId: panelDerivedData.quickReplyScopeModuleId,
        quickReplyLibrariesByScope: panelDerivedData.quickReplyLibrariesByScope,
        selectedQuickReplyLibrary: panelDerivedData.selectedQuickReplyLibrary,
        quickReplyItemsForSelectedLibrary: panelDerivedData.quickReplyItemsForSelectedLibrary,
        selectedQuickReplyItem: panelDerivedData.selectedQuickReplyItem,
        selectedQuickReplyItemMediaAssets: panelDerivedData.selectedQuickReplyItemMediaAssets,
        quickReplyItemFormAssets: panelDerivedData.quickReplyItemFormAssets,
        visibleQuickReplyLibraries: panelDerivedData.visibleQuickReplyLibraries,
        visibleQuickReplyItemsForSelectedLibrary: panelDerivedData.visibleQuickReplyItemsForSelectedLibrary,
        quickReplyTenantPlanId: panelDerivedData.quickReplyTenantPlanId,
        quickReplyUploadMaxMb: panelDerivedData.quickReplyUploadMaxMb,
        quickReplyStorageQuotaMb: panelDerivedData.quickReplyStorageQuotaMb,
        quickReplyUploadMaxBytes: panelDerivedData.quickReplyUploadMaxBytes
    };

    return {
        quickRepliesState,
        quickRepliesDerived,
        quickRepliesActions: quickReplyAdminActions,
        quickRepliesUploadState: quickReplyAssetsUploadState
    };
}
