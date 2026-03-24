import {
    AiAssistantsSection,
    OperationsSection,
    QuickRepliesSection,
    TenantLabelsSection
} from '../../sections';

export default function SaasPanelOpsAndAutomationSections(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const isOperationsSection = context?.isOperationsSection === true;
    const isLabelsSection = context?.isLabelsSection === true;
    const isQuickRepliesSection = context?.isQuickRepliesSection === true;
    const operationsContext = {
        tenantScopeLocked: context.tenantScopeLocked,
        busy: context.busy,
        loadingAssignmentRules: context.loadingAssignmentRules,
        loadingOperationsKpis: context.loadingOperationsKpis,
        canManageAssignments: context.canManageAssignments,
        canViewOperations: context.canViewOperations,
        assignmentRules: context.assignmentRules,
        assignmentRoleOptions: context.assignmentRoleOptions,
        operationsSnapshot: context.operationsSnapshot,
        activeTenantChatCandidates: context.activeTenantChatCandidates,
        tenantScopeId: context.tenantScopeId,
        setAssignmentRules: context.setAssignmentRules,
        runAction: context.runAction,
        saveAssignmentRules: context.saveAssignmentRules,
        loadTenantOperationsKpis: context.loadTenantOperationsKpis,
        triggerAutoAssignPreview: context.triggerAutoAssignPreview,
        formatDateTimeLabel: context.formatDateTimeLabel
    };
    const aiAssistantsContext = {
        isAiSection: context.isAiSection,
        busy: context.busy,
        loadingAiAssistants: context.loadingAiAssistants,
        settingsTenantId: context.settingsTenantId,
        loadTenantAiAssistants: context.loadTenantAiAssistants,
        openAiAssistantCreate: context.openAiAssistantCreate,
        tenantAiAssistantItems: context.tenantAiAssistantItems,
        selectedAiAssistantId: context.selectedAiAssistantId,
        aiAssistantPanelMode: context.aiAssistantPanelMode,
        openAiAssistantView: context.openAiAssistantView,
        selectedAiAssistant: context.selectedAiAssistant,
        formatDateTimeLabel: context.formatDateTimeLabel,
        canManageAi: context.canManageAi,
        openAiAssistantEdit: context.openAiAssistantEdit,
        markAiAssistantAsDefault: context.markAiAssistantAsDefault,
        toggleAiAssistantActive: context.toggleAiAssistantActive,
        aiAssistantForm: context.aiAssistantForm,
        setAiAssistantForm: context.setAiAssistantForm,
        AI_MODEL_OPTIONS: context.AI_MODEL_OPTIONS,
        applyLavitatAssistantPreset: context.applyLavitatAssistantPreset,
        saveAiAssistant: context.saveAiAssistant,
        cancelAiAssistantEdit: context.cancelAiAssistantEdit,
        setSelectedAiAssistantId: context.setSelectedAiAssistantId,
        setAiAssistantPanelMode: context.setAiAssistantPanelMode,
        EMPTY_AI_ASSISTANT_FORM: context.EMPTY_AI_ASSISTANT_FORM
    };
    const tenantLabelsContext = {
        busy: context.busy,
        loadingLabels: context.loadingLabels,
        settingsTenantId: context.settingsTenantId,
        loadTenantLabels: context.loadTenantLabels,
        setError: context.setError,
        canManageLabels: context.canManageLabels,
        openTenantLabelCreate: context.openTenantLabelCreate,
        labelSearch: context.labelSearch,
        setLabelSearch: context.setLabelSearch,
        visibleTenantLabels: context.visibleTenantLabels,
        selectedTenantLabel: context.selectedTenantLabel,
        labelPanelMode: context.labelPanelMode,
        setSelectedLabelId: context.setSelectedLabelId,
        setLabelPanelMode: context.setLabelPanelMode,
        openTenantLabelEdit: context.openTenantLabelEdit,
        runAction: context.runAction,
        deactivateTenantLabel: context.deactivateTenantLabel,
        requestJson: context.requestJson,
        buildTenantLabelPayload: context.buildTenantLabelPayload,
        waModules: context.waModules,
        labelForm: context.labelForm,
        setLabelForm: context.setLabelForm,
        normalizeTenantLabelColor: context.normalizeTenantLabelColor,
        DEFAULT_LABEL_COLORS: context.DEFAULT_LABEL_COLORS,
        toggleModuleInLabelForm: context.toggleModuleInLabelForm,
        saveTenantLabel: context.saveTenantLabel,
        cancelTenantLabelEdit: context.cancelTenantLabelEdit
    };
    const quickRepliesContext = {
        busy: context.busy,
        loadingQuickReplies: context.loadingQuickReplies,
        settingsTenantId: context.settingsTenantId,
        loadQuickReplyData: context.loadQuickReplyData,
        setError: context.setError,
        canManageQuickReplies: context.canManageQuickReplies,
        openQuickReplyLibraryCreate: context.openQuickReplyLibraryCreate,
        quickReplyModuleFilterId: context.quickReplyModuleFilterId,
        setQuickReplyModuleFilterId: context.setQuickReplyModuleFilterId,
        setSelectedQuickReplyLibraryId: context.setSelectedQuickReplyLibraryId,
        setSelectedQuickReplyItemId: context.setSelectedQuickReplyItemId,
        setQuickReplyLibraryPanelMode: context.setQuickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode: context.setQuickReplyItemPanelMode,
        waModules: context.waModules,
        quickReplyLibrarySearch: context.quickReplyLibrarySearch,
        setQuickReplyLibrarySearch: context.setQuickReplyLibrarySearch,
        visibleQuickReplyLibraries: context.visibleQuickReplyLibraries,
        selectedQuickReplyLibrary: context.selectedQuickReplyLibrary,
        quickReplyLibraryPanelMode: context.quickReplyLibraryPanelMode,
        openQuickReplyLibraryEdit: context.openQuickReplyLibraryEdit,
        runAction: context.runAction,
        deactivateQuickReplyLibrary: context.deactivateQuickReplyLibrary,
        quickReplyLibraryForm: context.quickReplyLibraryForm,
        setQuickReplyLibraryForm: context.setQuickReplyLibraryForm,
        toggleModuleInQuickReplyLibraryForm: context.toggleModuleInQuickReplyLibraryForm,
        saveQuickReplyLibrary: context.saveQuickReplyLibrary,
        cancelQuickReplyLibraryEdit: context.cancelQuickReplyLibraryEdit,
        QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL: context.QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
        visibleQuickReplyItemsForSelectedLibrary: context.visibleQuickReplyItemsForSelectedLibrary,
        quickReplyUploadMaxMb: context.quickReplyUploadMaxMb,
        quickReplyStorageQuotaMb: context.quickReplyStorageQuotaMb,
        quickReplyItemSearch: context.quickReplyItemSearch,
        setQuickReplyItemSearch: context.setQuickReplyItemSearch,
        normalizeQuickReplyMediaAssets: context.normalizeQuickReplyMediaAssets,
        selectedQuickReplyItem: context.selectedQuickReplyItem,
        quickReplyItemPanelMode: context.quickReplyItemPanelMode,
        openQuickReplyItemEdit: context.openQuickReplyItemEdit,
        deactivateQuickReplyItem: context.deactivateQuickReplyItem,
        selectedQuickReplyItemMediaAssets: context.selectedQuickReplyItemMediaAssets,
        formatDateTimeLabel: context.formatDateTimeLabel,
        resolveQuickReplyAssetPreviewUrl: context.resolveQuickReplyAssetPreviewUrl,
        getQuickReplyAssetDisplayName: context.getQuickReplyAssetDisplayName,
        isQuickReplyImageAsset: context.isQuickReplyImageAsset,
        getQuickReplyAssetTypeLabel: context.getQuickReplyAssetTypeLabel,
        formatBytes: context.formatBytes,
        quickReplyItemForm: context.quickReplyItemForm,
        setQuickReplyItemForm: context.setQuickReplyItemForm,
        uploadingQuickReplyAssets: context.uploadingQuickReplyAssets,
        QUICK_REPLY_ACCEPT_VALUE: context.QUICK_REPLY_ACCEPT_VALUE,
        handleQuickReplyAssetSelection: context.handleQuickReplyAssetSelection,
        quickReplyItemFormAssets: context.quickReplyItemFormAssets,
        removeQuickReplyAssetAt: context.removeQuickReplyAssetAt,
        saveQuickReplyItem: context.saveQuickReplyItem,
        cancelQuickReplyItemEdit: context.cancelQuickReplyItemEdit,
        openQuickReplyItemCreate: context.openQuickReplyItemCreate
    };
    return (
        <>
            {isOperationsSection && (
                <OperationsSection context={operationsContext} />
            )}

            <AiAssistantsSection context={aiAssistantsContext} />

            {isLabelsSection && (
                <TenantLabelsSection context={tenantLabelsContext} />
            )}

            {isQuickRepliesSection && (
                <QuickRepliesSection context={quickRepliesContext} />
            )}
        </>
    );
}
