import { useCallback, useMemo } from 'react';

export default function useSaasPanelSelectionState({
    selectedTenantId = '',
    selectedUserId = '',
    selectedWaModuleId = '',
    selectedCatalogId = '',
    selectedCatalogProductId = '',
    selectedConfigKey = '',
    selectedRoleKey = '',
    selectedPlanId = '',
    selectedCustomerId = '',
    selectedAiAssistantId = '',
    selectedLabelId = '',
    tenantPanelMode = 'view',
    userPanelMode = 'view',
    tenantSettingsPanelMode = 'view',
    waModulePanelMode = 'view',
    catalogPanelMode = 'view',
    catalogProductPanelMode = 'view',
    planPanelMode = 'view',
    rolePanelMode = 'view',
    customerPanelMode = 'view',
    aiAssistantPanelMode = 'view',
    labelPanelMode = 'view',
    emptyTenantForm,
    emptyUserForm,
    emptyWaModuleForm,
    emptyIntegrationsForm,
    emptyTenantCatalogForm,
    emptyCatalogProductForm,
    emptyAiAssistantForm,
    emptyQuickReplyLibraryForm,
    emptyQuickReplyItemForm,
    emptyLabelForm,
    emptyRoleForm,
    normalizePlanForm,
    setSelectedTenantId,
    setSelectedUserId,
    setSelectedWaModuleId,
    setSelectedCatalogId,
    setSelectedCatalogProductId,
    setSelectedConfigKey,
    setTenantPanelMode,
    setUserPanelMode,
    setTenantSettingsPanelMode,
    setWaModulePanelMode,
    setCatalogPanelMode,
    setCatalogProductPanelMode,
    setPlanPanelMode,
    setRolePanelMode,
    setMembershipDraft,
    setTenantForm,
    setUserForm,
    setWaModuleForm,
    setTenantIntegrations,
    setTenantCatalogForm,
    setTenantCatalogProducts,
    setCatalogProductForm,
    setCatalogProductImageError,
    setSelectedAiAssistantId,
    setAiAssistantForm,
    setAiAssistantPanelMode,
    setSelectedQuickReplyLibraryId,
    setSelectedQuickReplyItemId,
    setQuickReplyModuleFilterId,
    setQuickReplyLibraryForm,
    setQuickReplyItemForm,
    setQuickReplyLibraryPanelMode,
    setQuickReplyItemPanelMode,
    setSelectedLabelId,
    setLabelForm,
    setLabelPanelMode,
    setLabelSearch,
    setSelectedPlanId,
    setPlanForm,
    setRoleForm,
    setEditingWaModuleId,
    setModuleUserPickerId,
    setModuleQuickReplyLibraryDraft
} = {}) {
    const clearPanelSelection = useCallback(() => {
        setSelectedTenantId('');
        setSelectedUserId('');
        setSelectedWaModuleId('');
        setSelectedCatalogId('');
        setSelectedCatalogProductId('');
        setSelectedConfigKey('');
        setTenantPanelMode('view');
        setUserPanelMode('view');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setCatalogPanelMode('view');
        setCatalogProductPanelMode('view');
        setPlanPanelMode('view');
        setRolePanelMode('view');
        setMembershipDraft([]);
        setTenantForm(emptyTenantForm);
        setUserForm(emptyUserForm);
        setWaModuleForm(emptyWaModuleForm);
        setTenantIntegrations(emptyIntegrationsForm);
        setTenantCatalogForm(emptyTenantCatalogForm);
        setTenantCatalogProducts([]);
        setCatalogProductForm({ ...emptyCatalogProductForm });
        setCatalogProductImageError('');
        setSelectedAiAssistantId('');
        setAiAssistantForm({ ...emptyAiAssistantForm });
        setAiAssistantPanelMode('view');
        setSelectedQuickReplyLibraryId('');
        setSelectedQuickReplyItemId('');
        setQuickReplyModuleFilterId('');
        setQuickReplyLibraryForm({ ...emptyQuickReplyLibraryForm });
        setQuickReplyItemForm({ ...emptyQuickReplyItemForm });
        setQuickReplyLibraryPanelMode('view');
        setQuickReplyItemPanelMode('view');
        setSelectedLabelId('');
        setLabelForm({ ...emptyLabelForm });
        setLabelPanelMode('view');
        setLabelSearch('');
        setSelectedPlanId('');
        setPlanForm(normalizePlanForm('starter', {}));
        setRoleForm(emptyRoleForm);
        setEditingWaModuleId('');
        setModuleUserPickerId('');
        setModuleQuickReplyLibraryDraft([]);
    }, [
        emptyAiAssistantForm,
        emptyCatalogProductForm,
        emptyIntegrationsForm,
        emptyLabelForm,
        emptyRoleForm,
        emptyQuickReplyItemForm,
        emptyQuickReplyLibraryForm,
        emptyTenantCatalogForm,
        emptyTenantForm,
        emptyUserForm,
        emptyWaModuleForm,
        normalizePlanForm,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setCatalogPanelMode,
        setCatalogProductForm,
        setCatalogProductImageError,
        setCatalogProductPanelMode,
        setEditingWaModuleId,
        setLabelForm,
        setLabelPanelMode,
        setLabelSearch,
        setMembershipDraft,
        setModuleQuickReplyLibraryDraft,
        setModuleUserPickerId,
        setPlanForm,
        setPlanPanelMode,
        setQuickReplyItemForm,
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryForm,
        setQuickReplyLibraryPanelMode,
        setQuickReplyModuleFilterId,
        setRoleForm,
        setRolePanelMode,
        setSelectedAiAssistantId,
        setSelectedCatalogId,
        setSelectedCatalogProductId,
        setSelectedConfigKey,
        setSelectedLabelId,
        setSelectedPlanId,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId,
        setSelectedTenantId,
        setSelectedUserId,
        setSelectedWaModuleId,
        setTenantCatalogForm,
        setTenantCatalogProducts,
        setTenantForm,
        setTenantIntegrations,
        setTenantPanelMode,
        setTenantSettingsPanelMode,
        setUserForm,
        setUserPanelMode,
        setWaModuleForm,
        setWaModulePanelMode
    ]);

    const panelHasSelection = useMemo(() => Boolean(
        selectedTenantId
        || selectedUserId
        || selectedWaModuleId
        || selectedCatalogId
        || selectedCatalogProductId
        || selectedConfigKey
        || selectedRoleKey
        || tenantPanelMode !== 'view'
        || userPanelMode !== 'view'
        || tenantSettingsPanelMode !== 'view'
        || waModulePanelMode !== 'view'
        || catalogPanelMode !== 'view'
        || catalogProductPanelMode !== 'view'
        || planPanelMode !== 'view'
        || rolePanelMode !== 'view'
        || selectedPlanId
        || selectedCustomerId
        || customerPanelMode !== 'view'
        || selectedAiAssistantId
        || aiAssistantPanelMode !== 'view'
        || selectedLabelId
        || labelPanelMode !== 'view'
    ), [
        aiAssistantPanelMode,
        catalogPanelMode,
        catalogProductPanelMode,
        customerPanelMode,
        labelPanelMode,
        planPanelMode,
        rolePanelMode,
        selectedAiAssistantId,
        selectedCatalogId,
        selectedCatalogProductId,
        selectedConfigKey,
        selectedCustomerId,
        selectedLabelId,
        selectedPlanId,
        selectedRoleKey,
        selectedTenantId,
        selectedUserId,
        selectedWaModuleId,
        tenantPanelMode,
        tenantSettingsPanelMode,
        userPanelMode,
        waModulePanelMode
    ]);

    return {
        clearPanelSelection,
        panelHasSelection
    };
}

