import useSaasModuleSectionActions from '../../domains/modules/useSaasModuleSectionActions';
import useSaasOperationAccess from '../../useSaasOperationAccess';
import useSaasPanelLifecycle from '../useSaasPanelLifecycle';
import useSaasPanelNavigation from '../useSaasPanelNavigation';
import useSaasPanelAdminDomainActions from './useSaasPanelAdminDomainActions';

export default function useSaasPanelActionContexts(input = {}) {
    const c = input;
    const {
        quickReplyAssetsUploadState,
        quickReplyAdminActions,
        tenantLabelsAdminActions,
        catalogAdminActions,
        aiAssistantsAdminActions,
        plansRolesActions,
        tenantsUsersActions,
        customersAdminActions,
        setRunAction
    } = useSaasPanelAdminDomainActions(c);

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
