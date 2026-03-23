import {
    CatalogSection,
    ModulesConfigSection,
    PlansSection,
    RoleProfilesSection
} from '../../sections';

export default function SaasPanelConfigAndGovernanceSections({
    isGeneralConfigSection = false,
    isModulesSection = false,
    settingsTenantId = '',
    toTenantDisplayName,
    tenantOptions = [],
    busy = false,
    canEditModules = false,
    openConfigModuleCreate,
    openConfigSettingsView,
    clearConfigSelection,
    tenantSettings = {},
    MODULE_KEYS = [],
    waModules = [],
    selectedConfigKey = '',
    openConfigModuleView,
    waModulePanelMode = 'view',
    selectedConfigModule = null,
    assignedModuleUsers = [],
    toUserDisplayName,
    usersForSettingsTenant = [],
    normalizeCatalogIdsList,
    activeCatalogLabelMap = {},
    sanitizeAiAssistantCode,
    aiAssistantLabelMap = {},
    handleOpenOperation,
    openConfigModuleEdit,
    runAction,
    requestJson,
    setTenantSettingsPanelMode,
    loadTenantSettings,
    setBusy,
    setError,
    loadingSettings = false,
    tenantSettingsPanelMode = 'view',
    setTenantSettings,
    CATALOG_MODE_OPTIONS = [],
    formatDateTimeLabel,
    buildInitials,
    waModuleForm = {},
    setWaModuleForm,
    availableUsersForModulePicker = [],
    toggleAssignedUserForModule,
    activeCatalogOptions = [],
    toggleCatalogForModule,
    activeAiAssistantOptions = [],
    moduleQuickReplyLibraryDraft = {},
    activeQuickReplyLibraries = [],
    toggleQuickReplyLibraryForModuleDraft,
    moduleUserPickerId = '',
    setModuleUserPickerId,
    syncQuickReplyLibrariesForModule,
    handleFormImageUpload,
    canEditTenantSettings = false,
    setWaModulePanelMode,
    setSelectedWaModuleId,
    setSelectedConfigKey,
    isCatalogSection = false,
    loadingTenantCatalogs = false,
    loadTenantCatalogs,
    canEditCatalog = false,
    openCatalogCreate,
    tenantCatalogItems = [],
    selectedTenantCatalog = null,
    openCatalogView,
    catalogPanelMode = 'view',
    setCatalogPanelMode,
    setTenantCatalogForm,
    EMPTY_TENANT_CATALOG_FORM = {},
    cancelCatalogEdit,
    openCatalogEdit,
    buildTenantCatalogPayload,
    selectedCatalogProductId = '',
    setSelectedCatalogProductId,
    loadTenantCatalogProducts,
    tenantCatalogProducts = [],
    loadingCatalogProducts = false,
    setCatalogProductPanelMode,
    openCatalogProductCreate,
    selectedCatalogProduct = null,
    catalogProductPanelMode = 'view',
    openCatalogProductEdit,
    deactivateCatalogProduct,
    setCatalogProductForm,
    buildCatalogProductFormFromItem,
    catalogProductForm = {},
    setCatalogProductImageError,
    handleCatalogProductImageUpload,
    catalogProductImageUploading = false,
    catalogProductImageError = '',
    saveCatalogProduct,
    cancelCatalogProductEdit,
    setSelectedCatalogId,
    tenantCatalogForm = {},
    isRolesSection = false,
    canManageRoles = false,
    openRoleCreate,
    roleProfiles = [],
    selectedRoleKey = '',
    rolePanelMode = 'view',
    openRoleView,
    selectedRoleProfile = null,
    openRoleEdit,
    permissionLabelMap = {},
    rolePermissionOptions = [],
    roleForm = {},
    setRoleForm,
    sanitizeRoleCode,
    toggleRolePermission,
    saveRoleProfile,
    cancelRoleEdit,
    isPlansSection = false,
    loadingPlans = false,
    loadPlanMatrix,
    planIds = [],
    selectedPlanId = '',
    planMatrix = {},
    openPlanView,
    selectedPlan = null,
    planPanelMode = 'view',
    openPlanEdit,
    PLAN_LIMIT_KEYS = [],
    PLAN_FEATURE_KEYS = [],
    planForm = {},
    setPlanForm,
    chunkItems,
    setPlanPanelMode,
    cancelPlanEdit
}) {
    return (
        <>
            <ModulesConfigSection
                isGeneralConfigSection={isGeneralConfigSection}
                isModulesSection={isModulesSection}
                settingsTenantId={settingsTenantId}
                toTenantDisplayName={toTenantDisplayName}
                tenantOptions={tenantOptions}
                busy={busy}
                canEditModules={canEditModules}
                openConfigModuleCreate={openConfigModuleCreate}
                openConfigSettingsView={openConfigSettingsView}
                clearConfigSelection={clearConfigSelection}
                tenantSettings={tenantSettings}
                MODULE_KEYS={MODULE_KEYS}
                waModules={waModules}
                selectedConfigKey={selectedConfigKey}
                openConfigModuleView={openConfigModuleView}
                waModulePanelMode={waModulePanelMode}
                selectedConfigModule={selectedConfigModule}
                assignedModuleUsers={assignedModuleUsers}
                toUserDisplayName={toUserDisplayName}
                usersForSettingsTenant={usersForSettingsTenant}
                normalizeCatalogIdsList={normalizeCatalogIdsList}
                activeCatalogLabelMap={activeCatalogLabelMap}
                sanitizeAiAssistantCode={sanitizeAiAssistantCode}
                aiAssistantLabelMap={aiAssistantLabelMap}
                handleOpenOperation={handleOpenOperation}
                openConfigModuleEdit={openConfigModuleEdit}
                runAction={runAction}
                requestJson={requestJson}
                setTenantSettingsPanelMode={setTenantSettingsPanelMode}
                loadTenantSettings={loadTenantSettings}
                setBusy={setBusy}
                setError={setError}
                loadingSettings={loadingSettings}
                tenantSettingsPanelMode={tenantSettingsPanelMode}
                setTenantSettings={setTenantSettings}
                CATALOG_MODE_OPTIONS={CATALOG_MODE_OPTIONS}
                formatDateTimeLabel={formatDateTimeLabel}
                buildInitials={buildInitials}
                waModuleForm={waModuleForm}
                setWaModuleForm={setWaModuleForm}
                availableUsersForModulePicker={availableUsersForModulePicker}
                toggleAssignedUserForModule={toggleAssignedUserForModule}
                activeCatalogOptions={activeCatalogOptions}
                toggleCatalogForModule={toggleCatalogForModule}
                activeAiAssistantOptions={activeAiAssistantOptions}
                moduleQuickReplyLibraryDraft={moduleQuickReplyLibraryDraft}
                activeQuickReplyLibraries={activeQuickReplyLibraries}
                toggleQuickReplyLibraryForModuleDraft={toggleQuickReplyLibraryForModuleDraft}
                moduleUserPickerId={moduleUserPickerId}
                setModuleUserPickerId={setModuleUserPickerId}
                syncQuickReplyLibrariesForModule={syncQuickReplyLibrariesForModule}
                handleFormImageUpload={handleFormImageUpload}
                canEditTenantSettings={canEditTenantSettings}
                setWaModulePanelMode={setWaModulePanelMode}
                setSelectedWaModuleId={setSelectedWaModuleId}
                setSelectedConfigKey={setSelectedConfigKey}
            />

            <CatalogSection
                isCatalogSection={isCatalogSection}
                busy={busy}
                settingsTenantId={settingsTenantId}
                loadingTenantCatalogs={loadingTenantCatalogs}
                loadTenantCatalogs={loadTenantCatalogs}
                canEditCatalog={canEditCatalog}
                openCatalogCreate={openCatalogCreate}
                tenantCatalogItems={tenantCatalogItems}
                selectedTenantCatalog={selectedTenantCatalog}
                openCatalogView={openCatalogView}
                catalogPanelMode={catalogPanelMode}
                setCatalogPanelMode={setCatalogPanelMode}
                setTenantCatalogForm={setTenantCatalogForm}
                EMPTY_TENANT_CATALOG_FORM={EMPTY_TENANT_CATALOG_FORM}
                cancelCatalogEdit={cancelCatalogEdit}
                formatDateTimeLabel={formatDateTimeLabel}
                openCatalogEdit={openCatalogEdit}
                requestJson={requestJson}
                runAction={runAction}
                buildTenantCatalogPayload={buildTenantCatalogPayload}
                selectedCatalogProductId={selectedCatalogProductId}
                setSelectedCatalogProductId={setSelectedCatalogProductId}
                loadTenantCatalogProducts={loadTenantCatalogProducts}
                tenantCatalogProducts={tenantCatalogProducts}
                loadingCatalogProducts={loadingCatalogProducts}
                setCatalogProductPanelMode={setCatalogProductPanelMode}
                openCatalogProductCreate={openCatalogProductCreate}
                selectedCatalogProduct={selectedCatalogProduct}
                catalogProductPanelMode={catalogProductPanelMode}
                openCatalogProductEdit={openCatalogProductEdit}
                deactivateCatalogProduct={deactivateCatalogProduct}
                setCatalogProductForm={setCatalogProductForm}
                buildCatalogProductFormFromItem={buildCatalogProductFormFromItem}
                catalogProductForm={catalogProductForm}
                setCatalogProductImageError={setCatalogProductImageError}
                handleCatalogProductImageUpload={handleCatalogProductImageUpload}
                catalogProductImageUploading={catalogProductImageUploading}
                catalogProductImageError={catalogProductImageError}
                saveCatalogProduct={saveCatalogProduct}
                cancelCatalogProductEdit={cancelCatalogProductEdit}
                setSelectedCatalogId={setSelectedCatalogId}
                tenantCatalogForm={tenantCatalogForm}
            />

            <RoleProfilesSection
                isRolesSection={isRolesSection}
                busy={busy}
                canManageRoles={canManageRoles}
                openRoleCreate={openRoleCreate}
                roleProfiles={roleProfiles}
                selectedRoleKey={selectedRoleKey}
                rolePanelMode={rolePanelMode}
                openRoleView={openRoleView}
                selectedRoleProfile={selectedRoleProfile}
                openRoleEdit={openRoleEdit}
                permissionLabelMap={permissionLabelMap}
                rolePermissionOptions={rolePermissionOptions}
                roleForm={roleForm}
                setRoleForm={setRoleForm}
                sanitizeRoleCode={sanitizeRoleCode}
                toggleRolePermission={toggleRolePermission}
                saveRoleProfile={saveRoleProfile}
                cancelRoleEdit={cancelRoleEdit}
            />

            <PlansSection
                isPlansSection={isPlansSection}
                busy={busy}
                loadingPlans={loadingPlans}
                loadPlanMatrix={loadPlanMatrix}
                planIds={planIds}
                selectedPlanId={selectedPlanId}
                planMatrix={planMatrix}
                openPlanView={openPlanView}
                selectedPlan={selectedPlan}
                planPanelMode={planPanelMode}
                openPlanEdit={openPlanEdit}
                PLAN_LIMIT_KEYS={PLAN_LIMIT_KEYS}
                PLAN_FEATURE_KEYS={PLAN_FEATURE_KEYS}
                planForm={planForm}
                setPlanForm={setPlanForm}
                chunkItems={chunkItems}
                runAction={runAction}
                requestJson={requestJson}
                setPlanPanelMode={setPlanPanelMode}
                cancelPlanEdit={cancelPlanEdit}
            />
        </>
    );
}
