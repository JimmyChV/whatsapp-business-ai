import useAiAssistantsAdminActions from '../../domains/ai/useAiAssistantsAdminActions';
import useCatalogAdminActions from '../../domains/catalogs/useCatalogAdminActions';
import useCustomersAdminActions from '../../domains/customers/useCustomersAdminActions';
import usePlansRolesAdminActions from '../../usePlansRolesAdminActions';
import useQuickReplyAdminActions from '../../domains/quickReplies/useQuickReplyAdminActions';
import useQuickReplyAssetsUpload from '../../domains/quickReplies/useQuickReplyAssetsUpload';
import useTenantLabelsActions from '../../domains/labels/useTenantLabelsActions';
import useTenantsUsersAdminActions from '../../domains/tenants/useTenantsUsersAdminActions';
import useSaasRunActionBridge from '../useSaasRunActionBridge';

export default function useSaasPanelAdminDomainActions(input = {}) {
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

    return {
        quickReplyAssetsUploadState,
        quickReplyAdminActions,
        tenantLabelsAdminActions,
        catalogAdminActions,
        aiAssistantsAdminActions,
        plansRolesActions,
        tenantsUsersActions,
        customersAdminActions,
        setRunAction
    };
}
