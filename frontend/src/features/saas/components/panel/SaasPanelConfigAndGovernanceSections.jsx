import {
    AutomationSection,
    CatalogSection,
    CommercialIntelligenceSection,
    ModulesConfigSection,
    PlansSection,
    ReportsDashboardPage,
    RoleProfilesSection,
    SchedulesSection
} from '../../sections';

export default function SaasPanelConfigAndGovernanceSections(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const sectionLoaderContext = {
        ensureSectionData: context.ensureSectionData,
        isLoaded: context.isLoaded,
        isLoading: context.isLoading,
        getError: context.getError,
        getReloadToken: context.getReloadToken,
        forceReload: context.forceReload
    };
    const modulesConfigContext = {
        ...sectionLoaderContext,
        isGeneralConfigSection: context.isGeneralConfigSection,
        isModulesSection: context.isModulesSection,
        isSuperAdmin: context.isSuperAdmin,
        currentUser: context.currentUser,
        userRole: context.userRole,
        settingsTenantId: context.settingsTenantId,
        loadTenantSettings: context.loadTenantSettings,
        loadWaModules: context.loadWaModules,
        toTenantDisplayName: context.toTenantDisplayName,
        tenantOptions: context.tenantOptions,
        busy: context.busy,
        canViewModules: context.canViewModules,
        canViewTenantSettings: context.canViewTenantSettings,
        canEditTenantSettings: context.canEditTenantSettings,
        canEditModules: context.canEditModules,
        canViewOwnDevices: context.canViewOwnDevices,
        canRevokeOwnDevices: context.canRevokeOwnDevices,
        canViewAllDevices: context.canViewAllDevices,
        canRevokeAllDevices: context.canRevokeAllDevices,
        canViewAuditLogs: context.canViewAuditLogs,
        canViewEmailTemplates: context.canViewEmailTemplates,
        canManageEmailTemplates: context.canManageEmailTemplates,
        canViewBrand: context.canViewBrand,
        canManageBrand: context.canManageBrand,
        roleLabelMap: context.roleLabelMap,
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
        toggleWaModuleActive: context.toggleWaModuleActive,
        runAction: context.runAction,
        runSectionAction: context.runSectionAction,
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
        schedules: context.schedules,
        moduleQuickReplyLibraryDraft: context.moduleQuickReplyLibraryDraft,
        activeQuickReplyLibraries: context.activeQuickReplyLibraries,
        toggleQuickReplyLibraryForModuleDraft: context.toggleQuickReplyLibraryForModuleDraft,
        moduleUserPickerId: context.moduleUserPickerId,
        setModuleUserPickerId: context.setModuleUserPickerId,
        syncQuickReplyLibrariesForModule: context.syncQuickReplyLibrariesForModule,
        handleFormImageUpload: context.handleFormImageUpload,
        setWaModulePanelMode: context.setWaModulePanelMode,
        setSelectedWaModuleId: context.setSelectedWaModuleId,
        setSelectedConfigKey: context.setSelectedConfigKey,
        saveWaModule: context.saveWaModule
    };

    const catalogContext = {
        ...sectionLoaderContext,
        isCatalogSection: context.isCatalogSection,
        busy: context.busy,
        settingsTenantId: context.settingsTenantId,
        loadingTenantCatalogs: context.loadingTenantCatalogs,
        loadTenantCatalogs: context.loadTenantCatalogs,
        canViewCatalog: context.canViewCatalog,
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
        runSectionAction: context.runSectionAction,
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

    const automationContext = {
        ...sectionLoaderContext,
        selectedSectionId: context.selectedSectionId,
        isAutomationSection: context.isAutomationSection,
        settingsTenantId: context.settingsTenantId,
        tenantScopeLocked: context.tenantScopeLocked,
        busy: context.busy,
        requestJson: context.requestJson,
        runAction: context.runAction,
        runSectionAction: context.runSectionAction,
        waModules: context.waModules,
        metaTemplatesController: context.metaTemplatesController,
        automationRules: context.automationRules,
        loadingAutomations: context.loadingAutomations,
        loadAutomations: context.loadAutomations,
        createAutomationRule: context.createAutomationRule,
        updateAutomationRule: context.updateAutomationRule,
        deleteAutomationRule: context.deleteAutomationRule,
        quickReplyItems: context.quickReplyItems,
        quickReplyLibraries: context.quickReplyLibraries,
        loadingQuickReplies: context.loadingQuickReplies,
        canViewAutomations: context.canViewAutomations,
        canManageAutomations: context.canManageAutomations,
        formatDateTimeLabel: context.formatDateTimeLabel
    };

    const commercialIntelligenceContext = {
        ...sectionLoaderContext,
        isCommercialIntelligenceSection: context.isCommercialIntelligenceSection,
        settingsTenantId: context.settingsTenantId,
        tenantScopeLocked: context.tenantScopeLocked,
        busy: context.busy,
        requestJson: context.requestJson,
        runAction: context.runAction,
        runSectionAction: context.runSectionAction,
        canViewCommercialIntelligence: context.canViewCommercialIntelligence,
        canManageCommercialIntelligence: context.canManageCommercialIntelligence,
        activeCatalogOptions: context.activeCatalogOptions
    };

    const reportsContext = {
        selectedSectionId: context.selectedSectionId,
        isReportsSection: context.isReportsSection,
        settingsTenantId: context.settingsTenantId,
        tenantScopeId: context.tenantScopeId,
        tenantScopeLocked: context.tenantScopeLocked,
        activeTenantLabel: context.activeTenantLabel,
        busy: context.busy,
        requestJson: context.requestJson,
        canViewReports: context.canViewOperations,
        users: context.scopedUsers || context.usersForSettingsTenant || [],
        waModules: context.waModules || [],
        toUserDisplayName: context.toUserDisplayName
    };

    const schedulesContext = {
        ...sectionLoaderContext,
        selectedSectionId: context.selectedSectionId,
        isSchedulesSection: context.isSchedulesSection,
        settingsTenantId: context.settingsTenantId,
        tenantScopeLocked: context.tenantScopeLocked,
        busy: context.busy,
        requestJson: context.requestJson,
        runAction: context.runAction,
        runSectionAction: context.runSectionAction,
        schedules: context.schedules,
        loadingSchedules: context.loadingSchedules,
        loadSchedules: context.loadSchedules,
        createSchedule: context.createSchedule,
        updateSchedule: context.updateSchedule,
        deleteSchedule: context.deleteSchedule,
        canViewSchedules: context.canViewSchedules,
        canManageSchedules: context.canManageSchedules
    };

    const rolesContext = {
        ...sectionLoaderContext,
        isRolesSection: context.isRolesSection,
        loadAccessCatalog: context.loadAccessCatalog,
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
        cancelRoleEdit: context.cancelRoleEdit,
        setSelectedRoleKey: context.setSelectedRoleKey,
        setRolePanelMode: context.setRolePanelMode
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
        runSectionAction: context.runSectionAction,
        requestJson: context.requestJson,
        setPlanPanelMode: context.setPlanPanelMode,
        cancelPlanEdit: context.cancelPlanEdit,
        setSelectedPlanId: context.setSelectedPlanId
    };
    return (
        <>
            <ModulesConfigSection context={modulesConfigContext} />

            <CatalogSection context={catalogContext} />

            <CommercialIntelligenceSection context={commercialIntelligenceContext} />

            <ReportsDashboardPage context={reportsContext} />

            <AutomationSection context={automationContext} />

            <SchedulesSection context={schedulesContext} />

            <RoleProfilesSection context={rolesContext} />

            <PlansSection context={plansContext} />
        </>
    );
}
