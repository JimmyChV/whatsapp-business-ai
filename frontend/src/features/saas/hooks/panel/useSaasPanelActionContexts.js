import useAiAssistantsAdminActions from '../useAiAssistantsAdminActions';
import useCatalogAdminActions from '../useCatalogAdminActions';
import useCustomersAdminActions from '../useCustomersAdminActions';
import usePlansRolesAdminActions from '../usePlansRolesAdminActions';
import useQuickReplyAdminActions from '../useQuickReplyAdminActions';
import useQuickReplyAssetsUpload from '../useQuickReplyAssetsUpload';
import useSaasModuleSectionActions from '../useSaasModuleSectionActions';
import useSaasOperationAccess from '../useSaasOperationAccess';
import useTenantLabelsActions from '../useTenantLabelsActions';
import useTenantsUsersAdminActions from '../useTenantsUsersAdminActions';
import useSaasPanelLifecycle from './useSaasPanelLifecycle';
import useSaasPanelNavigation from './useSaasPanelNavigation';
import useSaasRunActionBridge from './useSaasRunActionBridge';

export default function useSaasPanelActionContexts(input = {}) {
    const c = input;

    const quickReplyAssetsUploadState = useQuickReplyAssetsUpload({
        requestJson: c.requestJson,
        settingsTenantId: c.settingsTenantId,
        selectedQuickReplyLibrary: c.selectedQuickReplyLibrary,
        quickReplyUploadMaxBytes: c.quickReplyUploadMaxBytes,
        quickReplyUploadMaxMb: c.quickReplyUploadMaxMb,
        setQuickReplyItemForm: c.setQuickReplyItemForm
    });

    const quickReplyAdminActions = useQuickReplyAdminActions({
        requestJson: c.requestJson,
        settingsTenantId: c.settingsTenantId,
        waModules: c.waModules,
        selectedQuickReplyLibrary: c.selectedQuickReplyLibrary,
        selectedQuickReplyLibraryId: c.selectedQuickReplyLibraryId,
        selectedQuickReplyItem: c.selectedQuickReplyItem,
        selectedQuickReplyItemId: c.selectedQuickReplyItemId,
        quickReplyScopeModuleId: c.quickReplyScopeModuleId,
        quickReplyLibraryForm: c.quickReplyLibraryForm,
        quickReplyItemForm: c.quickReplyItemForm,
        quickReplyLibraryPanelMode: c.quickReplyLibraryPanelMode,
        quickReplyItemPanelMode: c.quickReplyItemPanelMode,
        emptyQuickReplyLibraryForm: c.emptyQuickReplyLibraryForm,
        emptyQuickReplyItemForm: c.emptyQuickReplyItemForm,
        setQuickReplyLibraries: c.setQuickReplyLibraries,
        setQuickReplyItems: c.setQuickReplyItems,
        setSelectedQuickReplyLibraryId: c.setSelectedQuickReplyLibraryId,
        setSelectedQuickReplyItemId: c.setSelectedQuickReplyItemId,
        setQuickReplyModuleFilterId: c.setQuickReplyModuleFilterId,
        setQuickReplyLibraryForm: c.setQuickReplyLibraryForm,
        setQuickReplyItemForm: c.setQuickReplyItemForm,
        setQuickReplyLibraryPanelMode: c.setQuickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode: c.setQuickReplyItemPanelMode,
        setLoadingQuickReplies: c.setLoadingQuickReplies
    });

    const tenantLabelsAdminActions = useTenantLabelsActions({
        requestJson: c.requestJson,
        settingsTenantId: c.settingsTenantId,
        selectedTenantLabel: c.selectedTenantLabel,
        selectedLabelId: c.selectedLabelId,
        labelForm: c.labelForm,
        labelPanelMode: c.labelPanelMode,
        emptyLabelForm: c.emptyLabelForm,
        defaultLabelColors: c.defaultLabelColors,
        setTenantLabels: c.setTenantLabels,
        setSelectedLabelId: c.setSelectedLabelId,
        setLabelForm: c.setLabelForm,
        setLabelPanelMode: c.setLabelPanelMode,
        setLoadingLabels: c.setLoadingLabels
    });

    const { runActionProxy, setRunAction } = useSaasRunActionBridge();

    const catalogAdminActions = useCatalogAdminActions({
        requestJson: c.requestJson,
        settingsTenantId: c.settingsTenantId,
        canEditCatalog: c.canEditCatalog,
        selectedTenantCatalog: c.selectedTenantCatalog,
        selectedCatalogProduct: c.selectedCatalogProduct,
        selectedCatalogProductId: c.selectedCatalogProductId,
        catalogProductForm: c.catalogProductForm,
        catalogProductPanelMode: c.catalogProductPanelMode,
        emptyCatalogProductForm: c.emptyCatalogProductForm,
        emptyTenantCatalogForm: c.emptyTenantCatalogForm,
        setTenantCatalogs: c.setTenantCatalogs,
        setSelectedCatalogId: c.setSelectedCatalogId,
        setTenantCatalogForm: c.setTenantCatalogForm,
        setTenantCatalogProducts: c.setTenantCatalogProducts,
        setSelectedCatalogProductId: c.setSelectedCatalogProductId,
        setCatalogProductForm: c.setCatalogProductForm,
        setCatalogProductPanelMode: c.setCatalogProductPanelMode,
        setCatalogProductImageError: c.setCatalogProductImageError,
        setCatalogProductImageUploading: c.setCatalogProductImageUploading,
        setLoadingTenantCatalogs: c.setLoadingTenantCatalogs,
        setLoadingCatalogProducts: c.setLoadingCatalogProducts,
        setCatalogPanelMode: c.setCatalogPanelMode
    });

    const aiAssistantsAdminActions = useAiAssistantsAdminActions({
        requestJson: c.requestJson,
        settingsTenantId: c.settingsTenantId,
        canManageAi: c.canManageAi,
        selectedAiAssistant: c.selectedAiAssistant,
        selectedAiAssistantId: c.selectedAiAssistantId,
        aiAssistantForm: c.aiAssistantForm,
        aiAssistantPanelMode: c.aiAssistantPanelMode,
        tenantIntegrations: c.tenantIntegrations,
        emptyAiAssistantForm: c.emptyAiAssistantForm,
        setLoadingAiAssistants: c.setLoadingAiAssistants,
        setTenantAiAssistants: c.setTenantAiAssistants,
        setSelectedAiAssistantId: c.setSelectedAiAssistantId,
        setAiAssistantForm: c.setAiAssistantForm,
        setAiAssistantPanelMode: c.setAiAssistantPanelMode,
        runAction: runActionProxy
    });

    const plansRolesActions = usePlansRolesAdminActions({
        requestJson: c.requestJson,
        canManageRoles: c.canManageRoles,
        selectedRoleProfile: c.selectedRoleProfile,
        selectedRoleKey: c.selectedRoleKey,
        roleForm: c.roleForm,
        rolePanelMode: c.rolePanelMode,
        selectedPlanId: c.selectedPlanId,
        planMatrix: c.planMatrix,
        planOptions: c.planOptions,
        emptyRoleForm: c.emptyRoleForm,
        setLoadingPlans: c.setLoadingPlans,
        setPlanMatrix: c.setPlanMatrix,
        setSelectedPlanId: c.setSelectedPlanId,
        setPlanForm: c.setPlanForm,
        setPlanPanelMode: c.setPlanPanelMode,
        setRolePanelMode: c.setRolePanelMode,
        setLoadingAccessCatalog: c.setLoadingAccessCatalog,
        setAccessCatalog: c.setAccessCatalog,
        setSelectedRoleKey: c.setSelectedRoleKey,
        setRoleForm: c.setRoleForm,
        runAction: runActionProxy
    });

    const tenantsUsersActions = useTenantsUsersAdminActions({
        loadingAccessCatalog: c.loadingAccessCatalog,
        accessCatalog: c.accessCatalog,
        canEditSelectedUser: c.canEditSelectedUser,
        selectedTenant: c.selectedTenant,
        selectedUser: c.selectedUser,
        tenantScopeId: c.tenantScopeId,
        selectedTenantId: c.selectedTenantId,
        tenantOptions: c.tenantOptions,
        roleOptions: c.roleOptions,
        emptyTenantForm: c.emptyTenantForm,
        emptyUserForm: c.emptyUserForm,
        setTenantPanelMode: c.setTenantPanelMode,
        setSelectedTenantId: c.setSelectedTenantId,
        setSettingsTenantId: c.setSettingsTenantId,
        setTenantForm: c.setTenantForm,
        setUserPanelMode: c.setUserPanelMode,
        setSelectedUserId: c.setSelectedUserId,
        setMembershipDraft: c.setMembershipDraft,
        setUserForm: c.setUserForm,
        loadAccessCatalog: plansRolesActions.loadAccessCatalog
    });

    const customersAdminActions = useCustomersAdminActions({
        selectedCustomer: c.selectedCustomer,
        customerImportModuleId: c.customerImportModuleId,
        emptyCustomerForm: c.emptyCustomerForm,
        setSelectedCustomerId: c.setSelectedCustomerId,
        setCustomerPanelMode: c.setCustomerPanelMode,
        setCustomerForm: c.setCustomerForm
    });

    const panelNavigation = useSaasPanelNavigation({
        navItems: c.navItems,
        currentSection: c.currentSection,
        activeSection: c.activeSection,
        initialSection: c.initialSection,
        canManageTenants: c.canManageTenants,
        canManageUsers: c.canManageUsers,
        canViewCustomers: c.canViewCustomers,
        canViewOperations: c.canViewOperations,
        canViewAi: c.canViewAi,
        canViewLabels: c.canViewLabels,
        canViewQuickReplies: c.canViewQuickReplies,
        canViewModules: c.canViewModules,
        canManageCatalog: c.canManageCatalog,
        canViewSuperAdminSections: c.canViewSuperAdminSections,
        canViewTenantSettings: c.canViewTenantSettings
    });

    const assignmentRoleOptions = ['seller', 'admin', 'owner'];

    const operationAccess = useSaasOperationAccess({
        requiresTenantSelection: c.requiresTenantSelection,
        settingsTenantId: c.settingsTenantId,
        tenantScopeId: c.tenantScopeId,
        activeTenantId: c.activeTenantId,
        waModules: c.waModules,
        onOpenWhatsAppOperation: c.onOpenWhatsAppOperation
    });

    const moduleSectionActions = useSaasModuleSectionActions({
        waModuleEditor: {
            quickReplyLibraries: c.quickReplyLibraries,
            emptyWaModuleForm: c.emptyWaModuleForm,
            emptyIntegrationsForm: c.emptyIntegrationsForm,
            emptyTenantCatalogForm: c.emptyTenantCatalogForm,
            emptyCustomerForm: c.emptyCustomerForm,
            emptyAiAssistantForm: c.emptyAiAssistantForm,
            emptyRoleForm: c.emptyRoleForm,
            normalizePlanForm: c.normalizePlanForm,
            setWaModuleForm: c.setWaModuleForm,
            setTenantIntegrations: c.setTenantIntegrations,
            setTenantCatalogForm: c.setTenantCatalogForm,
            setSelectedPlanId: c.setSelectedPlanId,
            setPlanForm: c.setPlanForm,
            setRoleForm: c.setRoleForm,
            setEditingWaModuleId: c.setEditingWaModuleId,
            setModuleUserPickerId: c.setModuleUserPickerId,
            setModuleQuickReplyLibraryDraft: c.setModuleQuickReplyLibraryDraft,
            setSelectedCustomerId: c.setSelectedCustomerId,
            setCustomerPanelMode: c.setCustomerPanelMode,
            setCustomerForm: c.setCustomerForm,
            setCustomerSearch: c.setCustomerSearch,
            setCustomerCsvText: c.setCustomerCsvText,
            setSelectedAiAssistantId: c.setSelectedAiAssistantId,
            setAiAssistantPanelMode: c.setAiAssistantPanelMode,
            setAiAssistantForm: c.setAiAssistantForm,
            setCustomerImportModuleId: c.setCustomerImportModuleId,
            setSelectedWaModuleId: c.setSelectedWaModuleId
        },
        moduleConfig: {
            requestJson: c.requestJson,
            settingsTenantId: c.settingsTenantId,
            canEditTenantSettings: c.canEditTenantSettings,
            canEditModules: c.canEditModules,
            waModules: c.waModules,
            selectedConfigModule: c.selectedConfigModule,
            quickReplyLibraries: c.quickReplyLibraries,
            activeCatalogOptions: c.activeCatalogOptions,
            defaultAiAssistantId: c.defaultAiAssistantId,
            setSelectedConfigKey: c.setSelectedConfigKey,
            setSelectedRoleKey: c.setSelectedRoleKey,
            setSelectedWaModuleId: c.setSelectedWaModuleId,
            setTenantSettingsPanelMode: c.setTenantSettingsPanelMode,
            setWaModulePanelMode: c.setWaModulePanelMode,
            setCatalogPanelMode: c.setCatalogPanelMode,
            setModuleUserPickerId: c.setModuleUserPickerId,
            setModuleQuickReplyLibraryDraft: c.setModuleQuickReplyLibraryDraft,
            setWaModuleForm: c.setWaModuleForm
        },
        sectionChange: {
            isSectionEnabled: panelNavigation.isSectionEnabled,
            setSelectedTenantId: c.setSelectedTenantId,
            setTenantPanelMode: c.setTenantPanelMode,
            setSelectedUserId: c.setSelectedUserId,
            setUserPanelMode: c.setUserPanelMode,
            setMembershipDraft: c.setMembershipDraft,
            setSelectedRoleKey: c.setSelectedRoleKey,
            setRolePanelMode: c.setRolePanelMode,
            setRoleForm: c.setRoleForm,
            emptyRoleForm: c.emptyRoleForm,
            setSelectedCustomerId: c.setSelectedCustomerId,
            setCustomerPanelMode: c.setCustomerPanelMode,
            setSelectedAiAssistantId: c.setSelectedAiAssistantId,
            setAiAssistantPanelMode: c.setAiAssistantPanelMode,
            setAiAssistantForm: c.setAiAssistantForm,
            emptyAiAssistantForm: c.emptyAiAssistantForm,
            setSelectedLabelId: c.setSelectedLabelId,
            setLabelPanelMode: c.setLabelPanelMode,
            setLabelForm: c.setLabelForm,
            emptyLabelForm: c.emptyLabelForm,
            setSelectedQuickReplyLibraryId: c.setSelectedQuickReplyLibraryId,
            setSelectedQuickReplyItemId: c.setSelectedQuickReplyItemId,
            setQuickReplyModuleFilterId: c.setQuickReplyModuleFilterId,
            setQuickReplyLibraryPanelMode: c.setQuickReplyLibraryPanelMode,
            setQuickReplyItemPanelMode: c.setQuickReplyItemPanelMode,
            setQuickReplyLibraryForm: c.setQuickReplyLibraryForm,
            emptyQuickReplyLibraryForm: c.emptyQuickReplyLibraryForm,
            setQuickReplyItemForm: c.setQuickReplyItemForm,
            emptyQuickReplyItemForm: c.emptyQuickReplyItemForm,
            setCurrentSection: c.setCurrentSection
        }
    });

    const lifecycleState = useSaasPanelLifecycle({
        bootstrap: {
            actions: {
                requestJson: c.requestJson,
                onOpenWhatsAppOperation: c.onOpenWhatsAppOperation,
                operationTenantId: operationAccess.operationTenantId,
                tenantScopeId: c.tenantScopeId,
                activeTenantId: c.activeTenantId,
                selectedTenantId: c.selectedTenantId,
                setError: c.setError,
                setBusy: c.setBusy,
                refreshOverview: c.refreshOverview,
                settingsTenantId: c.settingsTenantId,
                loadTenantSettings: c.loadTenantSettings,
                loadWaModules: c.loadWaModules,
                loadTenantCatalogs: catalogAdminActions.loadTenantCatalogs,
                loadTenantAiAssistants: aiAssistantsAdminActions.loadTenantAiAssistants,
                loadQuickReplyData: quickReplyAdminActions.loadQuickReplyData,
                loadTenantLabels: tenantLabelsAdminActions.loadTenantLabels
            },
            loadEffects: {
                isOpen: c.isOpen,
                canManageSaas: c.canManageSaas,
                canViewSuperAdminSections: c.canViewSuperAdminSections,
                tenantScopeId: c.tenantScopeId,
                refreshOverview: c.refreshOverview,
                loadAccessCatalog: plansRolesActions.loadAccessCatalog,
                loadPlanMatrix: plansRolesActions.loadPlanMatrix,
                loadTenantSettings: c.loadTenantSettings,
                loadWaModules: c.loadWaModules,
                loadTenantCatalogs: catalogAdminActions.loadTenantCatalogs,
                loadTenantAiAssistants: aiAssistantsAdminActions.loadTenantAiAssistants,
                loadTenantIntegrations: c.loadTenantIntegrations,
                loadCustomers: c.loadCustomers,
                loadQuickReplyData: quickReplyAdminActions.loadQuickReplyData,
                loadTenantLabels: tenantLabelsAdminActions.loadTenantLabels,
                loadTenantAssignmentRules: c.loadTenantAssignmentRules,
                loadTenantOperationsKpis: c.loadTenantOperationsKpis,
                setError: c.setError
            },
            setRunAction
        },
        selection: c.selection,
        hotkeys: {
            isOpen: c.isOpen
        },
        tenantScopeEffects: c.tenantScopeEffects,
        sectionSyncEffects: c.sectionSyncEffects,
        formSyncEffects: c.formSyncEffects,
        crossNavigation: c.crossNavigation
    });

    return {
        quickReplyAssetsUploadState,
        quickReplyAdminActions,
        tenantLabelsAdminActions,
        catalogAdminActions,
        aiAssistantsAdminActions,
        plansRolesActions,
        tenantsUsersActions,
        customersAdminActions,
        panelNavigation,
        assignmentRoleOptions,
        operationAccess,
        moduleSectionActions,
        lifecycleState
    };
}
