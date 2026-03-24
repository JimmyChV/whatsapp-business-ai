import {
    CatalogSection,
    ModulesConfigSection,
    PlansSection,
    RoleProfilesSection
} from '../../sections';

export default function SaasPanelConfigAndGovernanceSections(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const modulesConfigContext = {
        isGeneralConfigSection: context.isGeneralConfigSection,
        isModulesSection: context.isModulesSection,
        settingsTenantId: context.settingsTenantId,
        toTenantDisplayName: context.toTenantDisplayName,
        tenantOptions: context.tenantOptions,
        busy: context.busy,
        canEditModules: context.canEditModules,
        openConfigModuleCreate: context.openConfigModuleCreate,
        openConfigSettingsView: context.openConfigSettingsView,
        clearConfigSelection: context.clearConfigSelection,
        tenantSettings: context.tenantSettings,
        MODULE_KEYS: context.MODULE_KEYS,
        waModules: context.waModules,
        selectedConfigKey: context.selectedConfigKey,
        openConfigModuleView: context.openConfigModuleView,
        waModulePanelMode: context.waModulePanelMode,
        selectedConfigModule: context.selectedConfigModule,
        assignedModuleUsers: context.assignedModuleUsers,
        toUserDisplayName: context.toUserDisplayName,
        usersForSettingsTenant: context.usersForSettingsTenant,
        normalizeCatalogIdsList: context.normalizeCatalogIdsList,
        activeCatalogLabelMap: context.activeCatalogLabelMap,
        sanitizeAiAssistantCode: context.sanitizeAiAssistantCode,
        aiAssistantLabelMap: context.aiAssistantLabelMap,
        handleOpenOperation: context.handleOpenOperation,
        openConfigModuleEdit: context.openConfigModuleEdit,
        runAction: context.runAction,
        requestJson: context.requestJson,
        tenantSettingsPanelMode: context.tenantSettingsPanelMode,
        CATALOG_MODE_OPTIONS: context.CATALOG_MODE_OPTIONS,
        formatDateTimeLabel: context.formatDateTimeLabel,
        buildInitials: context.buildInitials,
        waModuleForm: context.waModuleForm,
        setWaModuleForm: context.setWaModuleForm,
        availableUsersForModulePicker: context.availableUsersForModulePicker,
        toggleAssignedUserForModule: context.toggleAssignedUserForModule,
        activeCatalogOptions: context.activeCatalogOptions,
        toggleCatalogForModule: context.toggleCatalogForModule,
        activeAiAssistantOptions: context.activeAiAssistantOptions,
        moduleQuickReplyLibraryDraft: context.moduleQuickReplyLibraryDraft,
        activeQuickReplyLibraries: context.activeQuickReplyLibraries,
        toggleQuickReplyLibraryForModuleDraft: context.toggleQuickReplyLibraryForModuleDraft,
        moduleUserPickerId: context.moduleUserPickerId,
        setModuleUserPickerId: context.setModuleUserPickerId,
        syncQuickReplyLibrariesForModule: context.syncQuickReplyLibrariesForModule,
        handleFormImageUpload: context.handleFormImageUpload,
        setWaModulePanelMode: context.setWaModulePanelMode,
        setSelectedWaModuleId: context.setSelectedWaModuleId,
        setSelectedConfigKey: context.setSelectedConfigKey
    };

    const catalogContext = {
        isCatalogSection: context.isCatalogSection,
        busy: context.busy,
        settingsTenantId: context.settingsTenantId,
        loadingTenantCatalogs: context.loadingTenantCatalogs,
        loadTenantCatalogs: context.loadTenantCatalogs,
        canEditCatalog: context.canEditCatalog,
        openCatalogCreate: context.openCatalogCreate,
        tenantCatalogItems: context.tenantCatalogItems,
        selectedTenantCatalog: context.selectedTenantCatalog,
        openCatalogView: context.openCatalogView,
        catalogPanelMode: context.catalogPanelMode,
        setCatalogPanelMode: context.setCatalogPanelMode,
        setTenantCatalogForm: context.setTenantCatalogForm,
        EMPTY_TENANT_CATALOG_FORM: context.EMPTY_TENANT_CATALOG_FORM,
        cancelCatalogEdit: context.cancelCatalogEdit,
        formatDateTimeLabel: context.formatDateTimeLabel,
        openCatalogEdit: context.openCatalogEdit,
        requestJson: context.requestJson,
        runAction: context.runAction,
        buildTenantCatalogPayload: context.buildTenantCatalogPayload,
        selectedCatalogProductId: context.selectedCatalogProductId,
        setSelectedCatalogProductId: context.setSelectedCatalogProductId,
        loadTenantCatalogProducts: context.loadTenantCatalogProducts,
        tenantCatalogProducts: context.tenantCatalogProducts,
        loadingCatalogProducts: context.loadingCatalogProducts,
        setCatalogProductPanelMode: context.setCatalogProductPanelMode,
        openCatalogProductCreate: context.openCatalogProductCreate,
        selectedCatalogProduct: context.selectedCatalogProduct,
        catalogProductPanelMode: context.catalogProductPanelMode,
        openCatalogProductEdit: context.openCatalogProductEdit,
        deactivateCatalogProduct: context.deactivateCatalogProduct,
        setCatalogProductForm: context.setCatalogProductForm,
        buildCatalogProductFormFromItem: context.buildCatalogProductFormFromItem,
        catalogProductForm: context.catalogProductForm,
        setCatalogProductImageError: context.setCatalogProductImageError,
        handleCatalogProductImageUpload: context.handleCatalogProductImageUpload,
        catalogProductImageUploading: context.catalogProductImageUploading,
        catalogProductImageError: context.catalogProductImageError,
        saveCatalogProduct: context.saveCatalogProduct,
        cancelCatalogProductEdit: context.cancelCatalogProductEdit,
        setSelectedCatalogId: context.setSelectedCatalogId,
        tenantCatalogForm: context.tenantCatalogForm
    };

    const rolesContext = {
        isRolesSection: context.isRolesSection,
        busy: context.busy,
        canManageRoles: context.canManageRoles,
        openRoleCreate: context.openRoleCreate,
        roleProfiles: context.roleProfiles,
        selectedRoleKey: context.selectedRoleKey,
        rolePanelMode: context.rolePanelMode,
        openRoleView: context.openRoleView,
        selectedRoleProfile: context.selectedRoleProfile,
        openRoleEdit: context.openRoleEdit,
        permissionLabelMap: context.permissionLabelMap,
        rolePermissionOptions: context.rolePermissionOptions,
        roleForm: context.roleForm,
        setRoleForm: context.setRoleForm,
        sanitizeRoleCode: context.sanitizeRoleCode,
        toggleRolePermission: context.toggleRolePermission,
        saveRoleProfile: context.saveRoleProfile,
        cancelRoleEdit: context.cancelRoleEdit
    };

    const plansContext = {
        isPlansSection: context.isPlansSection,
        busy: context.busy,
        loadingPlans: context.loadingPlans,
        loadPlanMatrix: context.loadPlanMatrix,
        planIds: context.planIds,
        selectedPlanId: context.selectedPlanId,
        planMatrix: context.planMatrix,
        openPlanView: context.openPlanView,
        selectedPlan: context.selectedPlan,
        planPanelMode: context.planPanelMode,
        openPlanEdit: context.openPlanEdit,
        PLAN_LIMIT_KEYS: context.PLAN_LIMIT_KEYS,
        PLAN_FEATURE_KEYS: context.PLAN_FEATURE_KEYS,
        planForm: context.planForm,
        setPlanForm: context.setPlanForm,
        chunkItems: context.chunkItems,
        runAction: context.runAction,
        requestJson: context.requestJson,
        setPlanPanelMode: context.setPlanPanelMode,
        cancelPlanEdit: context.cancelPlanEdit
    };
    return (
        <>
            <ModulesConfigSection context={modulesConfigContext} />

            <CatalogSection context={catalogContext} />

            <RoleProfilesSection context={rolesContext} />

            <PlansSection context={plansContext} />
        </>
    );
}
