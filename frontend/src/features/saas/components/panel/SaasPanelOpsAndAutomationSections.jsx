import {
    AiAssistantsSection,
    OperationsSection,
    QuickRepliesSection,
    TenantLabelsSection
} from '../../sections';

export default function SaasPanelOpsAndAutomationSections(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
    isOperationsSection = false,
    tenantScopeLocked = false,
    busy = false,
    loadingAssignmentRules = false,
    loadingOperationsKpis = false,
    canManageAssignments = false,
    canViewOperations = false,
    assignmentRules = {},
    assignmentRoleOptions = [],
    operationsSnapshot = {},
    activeTenantChatCandidates = [],
    tenantScopeId = '',
    setAssignmentRules,
    runAction,
    saveAssignmentRules,
    loadTenantOperationsKpis,
    triggerAutoAssignPreview,
    formatDateTimeLabel,
    isAiSection = false,
    loadingAiAssistants = false,
    settingsTenantId = '',
    loadTenantAiAssistants,
    openAiAssistantCreate,
    tenantAiAssistantItems = [],
    selectedAiAssistantId = '',
    aiAssistantPanelMode = 'view',
    openAiAssistantView,
    selectedAiAssistant = null,
    canManageAi = false,
    openAiAssistantEdit,
    markAiAssistantAsDefault,
    toggleAiAssistantActive,
    aiAssistantForm = {},
    setAiAssistantForm,
    AI_MODEL_OPTIONS = [],
    applyLavitatAssistantPreset,
    saveAiAssistant,
    cancelAiAssistantEdit,
    setSelectedAiAssistantId,
    setAiAssistantPanelMode,
    EMPTY_AI_ASSISTANT_FORM = {},
    isLabelsSection = false,
    loadingLabels = false,
    loadTenantLabels,
    setError,
    canManageLabels = false,
    openTenantLabelCreate,
    labelSearch = '',
    setLabelSearch,
    visibleTenantLabels = [],
    selectedTenantLabel = null,
    labelPanelMode = 'view',
    setSelectedLabelId,
    setLabelPanelMode,
    openTenantLabelEdit,
    deactivateTenantLabel,
    requestJson,
    buildTenantLabelPayload,
    labelForm = {},
    setLabelForm,
    normalizeTenantLabelColor,
    DEFAULT_LABEL_COLORS = [],
    toggleModuleInLabelForm,
    saveTenantLabel,
    cancelTenantLabelEdit,
    isQuickRepliesSection = false,
    loadingQuickReplies = false,
    loadQuickReplyData,
    canManageQuickReplies = false,
    openQuickReplyLibraryCreate,
    quickReplyModuleFilterId = '',
    setQuickReplyModuleFilterId,
    setSelectedQuickReplyLibraryId,
    setSelectedQuickReplyItemId,
    setQuickReplyLibraryPanelMode,
    setQuickReplyItemPanelMode,
    waModules = [],
    quickReplyLibrarySearch = '',
    setQuickReplyLibrarySearch,
    visibleQuickReplyLibraries = [],
    selectedQuickReplyLibrary = null,
    quickReplyLibraryPanelMode = 'view',
    openQuickReplyLibraryEdit,
    deactivateQuickReplyLibrary,
    quickReplyLibraryForm = {},
    setQuickReplyLibraryForm,
    toggleModuleInQuickReplyLibraryForm,
    saveQuickReplyLibrary,
    cancelQuickReplyLibraryEdit,
    QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL = '',
    visibleQuickReplyItemsForSelectedLibrary = [],
    quickReplyUploadMaxMb = 0,
    quickReplyStorageQuotaMb = 0,
    quickReplyItemSearch = '',
    setQuickReplyItemSearch,
    normalizeQuickReplyMediaAssets,
    selectedQuickReplyItem = null,
    quickReplyItemPanelMode = 'view',
    openQuickReplyItemEdit,
    deactivateQuickReplyItem,
    selectedQuickReplyItemMediaAssets = [],
    resolveQuickReplyAssetPreviewUrl,
    getQuickReplyAssetDisplayName,
    isQuickReplyImageAsset,
    getQuickReplyAssetTypeLabel,
    formatBytes,
    quickReplyItemForm = {},
    setQuickReplyItemForm,
    uploadingQuickReplyAssets = false,
    QUICK_REPLY_ACCEPT_VALUE = '',
    handleQuickReplyAssetSelection,
    quickReplyItemFormAssets = [],
    removeQuickReplyAssetAt,
    saveQuickReplyItem,
    cancelQuickReplyItemEdit,
    openQuickReplyItemCreate
    } = context;
    return (
        <>
            {isOperationsSection && (
                <OperationsSection
                    tenantScopeLocked={tenantScopeLocked}
                    busy={busy}
                    loadingAssignmentRules={loadingAssignmentRules}
                    loadingOperationsKpis={loadingOperationsKpis}
                    canManageAssignments={canManageAssignments}
                    canViewOperations={canViewOperations}
                    assignmentRules={assignmentRules}
                    assignmentRoleOptions={assignmentRoleOptions}
                    operationsSnapshot={operationsSnapshot}
                    activeTenantChatCandidates={activeTenantChatCandidates}
                    tenantScopeId={tenantScopeId}
                    setAssignmentRules={setAssignmentRules}
                    runAction={runAction}
                    saveAssignmentRules={saveAssignmentRules}
                    loadTenantOperationsKpis={loadTenantOperationsKpis}
                    triggerAutoAssignPreview={triggerAutoAssignPreview}
                    formatDateTimeLabel={formatDateTimeLabel}
                />
            )}

            <AiAssistantsSection
                isAiSection={isAiSection}
                busy={busy}
                loadingAiAssistants={loadingAiAssistants}
                settingsTenantId={settingsTenantId}
                loadTenantAiAssistants={loadTenantAiAssistants}
                openAiAssistantCreate={openAiAssistantCreate}
                tenantAiAssistantItems={tenantAiAssistantItems}
                selectedAiAssistantId={selectedAiAssistantId}
                aiAssistantPanelMode={aiAssistantPanelMode}
                openAiAssistantView={openAiAssistantView}
                selectedAiAssistant={selectedAiAssistant}
                formatDateTimeLabel={formatDateTimeLabel}
                canManageAi={canManageAi}
                openAiAssistantEdit={openAiAssistantEdit}
                markAiAssistantAsDefault={markAiAssistantAsDefault}
                toggleAiAssistantActive={toggleAiAssistantActive}
                aiAssistantForm={aiAssistantForm}
                setAiAssistantForm={setAiAssistantForm}
                AI_MODEL_OPTIONS={AI_MODEL_OPTIONS}
                applyLavitatAssistantPreset={applyLavitatAssistantPreset}
                saveAiAssistant={saveAiAssistant}
                cancelAiAssistantEdit={cancelAiAssistantEdit}
                setSelectedAiAssistantId={setSelectedAiAssistantId}
                setAiAssistantPanelMode={setAiAssistantPanelMode}
                EMPTY_AI_ASSISTANT_FORM={EMPTY_AI_ASSISTANT_FORM}
            />

            {isLabelsSection && (
                <TenantLabelsSection
                    busy={busy}
                    loadingLabels={loadingLabels}
                    settingsTenantId={settingsTenantId}
                    loadTenantLabels={loadTenantLabels}
                    setError={setError}
                    canManageLabels={canManageLabels}
                    openTenantLabelCreate={openTenantLabelCreate}
                    labelSearch={labelSearch}
                    setLabelSearch={setLabelSearch}
                    visibleTenantLabels={visibleTenantLabels}
                    selectedTenantLabel={selectedTenantLabel}
                    labelPanelMode={labelPanelMode}
                    setSelectedLabelId={setSelectedLabelId}
                    setLabelPanelMode={setLabelPanelMode}
                    openTenantLabelEdit={openTenantLabelEdit}
                    runAction={runAction}
                    deactivateTenantLabel={deactivateTenantLabel}
                    requestJson={requestJson}
                    buildTenantLabelPayload={buildTenantLabelPayload}
                    labelForm={labelForm}
                    setLabelForm={setLabelForm}
                    normalizeTenantLabelColor={normalizeTenantLabelColor}
                    DEFAULT_LABEL_COLORS={DEFAULT_LABEL_COLORS}
                    toggleModuleInLabelForm={toggleModuleInLabelForm}
                    saveTenantLabel={saveTenantLabel}
                    cancelTenantLabelEdit={cancelTenantLabelEdit}
                />
            )}

            {isQuickRepliesSection && (
                <QuickRepliesSection
                    busy={busy}
                    loadingQuickReplies={loadingQuickReplies}
                    settingsTenantId={settingsTenantId}
                    loadQuickReplyData={loadQuickReplyData}
                    setError={setError}
                    canManageQuickReplies={canManageQuickReplies}
                    openQuickReplyLibraryCreate={openQuickReplyLibraryCreate}
                    quickReplyModuleFilterId={quickReplyModuleFilterId}
                    setQuickReplyModuleFilterId={setQuickReplyModuleFilterId}
                    setSelectedQuickReplyLibraryId={setSelectedQuickReplyLibraryId}
                    setSelectedQuickReplyItemId={setSelectedQuickReplyItemId}
                    setQuickReplyLibraryPanelMode={setQuickReplyLibraryPanelMode}
                    setQuickReplyItemPanelMode={setQuickReplyItemPanelMode}
                    waModules={waModules}
                    quickReplyLibrarySearch={quickReplyLibrarySearch}
                    setQuickReplyLibrarySearch={setQuickReplyLibrarySearch}
                    visibleQuickReplyLibraries={visibleQuickReplyLibraries}
                    selectedQuickReplyLibrary={selectedQuickReplyLibrary}
                    quickReplyLibraryPanelMode={quickReplyLibraryPanelMode}
                    openQuickReplyLibraryEdit={openQuickReplyLibraryEdit}
                    runAction={runAction}
                    deactivateQuickReplyLibrary={deactivateQuickReplyLibrary}
                    quickReplyLibraryForm={quickReplyLibraryForm}
                    setQuickReplyLibraryForm={setQuickReplyLibraryForm}
                    toggleModuleInQuickReplyLibraryForm={toggleModuleInQuickReplyLibraryForm}
                    saveQuickReplyLibrary={saveQuickReplyLibrary}
                    cancelQuickReplyLibraryEdit={cancelQuickReplyLibraryEdit}
                    QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL={QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}
                    visibleQuickReplyItemsForSelectedLibrary={visibleQuickReplyItemsForSelectedLibrary}
                    quickReplyUploadMaxMb={quickReplyUploadMaxMb}
                    quickReplyStorageQuotaMb={quickReplyStorageQuotaMb}
                    quickReplyItemSearch={quickReplyItemSearch}
                    setQuickReplyItemSearch={setQuickReplyItemSearch}
                    normalizeQuickReplyMediaAssets={normalizeQuickReplyMediaAssets}
                    selectedQuickReplyItem={selectedQuickReplyItem}
                    quickReplyItemPanelMode={quickReplyItemPanelMode}
                    openQuickReplyItemEdit={openQuickReplyItemEdit}
                    deactivateQuickReplyItem={deactivateQuickReplyItem}
                    selectedQuickReplyItemMediaAssets={selectedQuickReplyItemMediaAssets}
                    formatDateTimeLabel={formatDateTimeLabel}
                    resolveQuickReplyAssetPreviewUrl={resolveQuickReplyAssetPreviewUrl}
                    getQuickReplyAssetDisplayName={getQuickReplyAssetDisplayName}
                    isQuickReplyImageAsset={isQuickReplyImageAsset}
                    getQuickReplyAssetTypeLabel={getQuickReplyAssetTypeLabel}
                    formatBytes={formatBytes}
                    quickReplyItemForm={quickReplyItemForm}
                    setQuickReplyItemForm={setQuickReplyItemForm}
                    uploadingQuickReplyAssets={uploadingQuickReplyAssets}
                    QUICK_REPLY_ACCEPT_VALUE={QUICK_REPLY_ACCEPT_VALUE}
                    handleQuickReplyAssetSelection={handleQuickReplyAssetSelection}
                    quickReplyItemFormAssets={quickReplyItemFormAssets}
                    removeQuickReplyAssetAt={removeQuickReplyAssetAt}
                    saveQuickReplyItem={saveQuickReplyItem}
                    cancelQuickReplyItemEdit={cancelQuickReplyItemEdit}
                    openQuickReplyItemCreate={openQuickReplyItemCreate}
                />
            )}
        </>
    );
}
