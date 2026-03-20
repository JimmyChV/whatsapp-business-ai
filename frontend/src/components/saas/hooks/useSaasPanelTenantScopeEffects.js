import { useEffect } from 'react';

export default function useSaasPanelTenantScopeEffects({
    isOpen = false,
    tenantScopeId = '',
    requiresTenantSelection = false,
    settingsTenantId = '',
    activeTenantId = '',
    tenantOptions = [],
    launchSource = '',
    preferredTenantId = '',
    emptyTenantCatalogForm,
    emptyCatalogProductForm,
    emptyAiAssistantForm,
    emptyQuickReplyLibraryForm,
    emptyQuickReplyItemForm,
    emptyLabelForm,
    resetOperationsState,
    setWaModules,
    setSelectedWaModuleId,
    setTenantCatalogs,
    setSelectedCatalogId,
    setTenantCatalogForm,
    setTenantCatalogProducts,
    setSelectedCatalogProductId,
    setCatalogProductForm,
    setCatalogProductPanelMode,
    setCatalogProductImageError,
    setTenantAiAssistants,
    setSelectedAiAssistantId,
    setAiAssistantForm,
    setAiAssistantPanelMode,
    setQuickReplyLibraries,
    setQuickReplyItems,
    setSelectedQuickReplyLibraryId,
    setSelectedQuickReplyItemId,
    setQuickReplyModuleFilterId,
    setQuickReplyLibraryForm,
    setQuickReplyItemForm,
    setQuickReplyLibraryPanelMode,
    setQuickReplyItemPanelMode,
    setTenantLabels,
    setSelectedLabelId,
    setLabelForm,
    setLabelPanelMode,
    setSelectedConfigKey,
    setSelectedRoleKey,
    setTenantSettingsPanelMode,
    setWaModulePanelMode,
    setCatalogPanelMode,
    setModuleUserPickerId,
    setSelectedCustomerId,
    setCustomerPanelMode,
    setCustomerSearch,
    setCustomerCsvText,
    setLabelSearch,
    setSettingsTenantId,
    setSelectedTenantId,
    setCurrentSection
} = {}) {
    useEffect(() => {
        if (!isOpen) return;
        if (String(tenantScopeId || '').trim()) return;
        setWaModules([]);
        setSelectedWaModuleId('');
        setTenantCatalogs([]);
        setSelectedCatalogId('');
        setTenantCatalogForm(emptyTenantCatalogForm);
        setTenantCatalogProducts([]);
        setSelectedCatalogProductId('');
        setCatalogProductForm(emptyCatalogProductForm);
        setCatalogProductPanelMode('view');
        setCatalogProductImageError('');
        setTenantAiAssistants([]);
        setSelectedAiAssistantId('');
        setAiAssistantForm(emptyAiAssistantForm);
        setAiAssistantPanelMode('view');
        setQuickReplyLibraries([]);
        setQuickReplyItems([]);
        setSelectedQuickReplyLibraryId('');
        setSelectedQuickReplyItemId('');
        setQuickReplyModuleFilterId('');
        setQuickReplyLibraryForm(emptyQuickReplyLibraryForm);
        setQuickReplyItemForm(emptyQuickReplyItemForm);
        setQuickReplyLibraryPanelMode('view');
        setQuickReplyItemPanelMode('view');
        setTenantLabels([]);
        setSelectedLabelId('');
        setLabelForm(emptyLabelForm);
        setLabelPanelMode('view');
        resetOperationsState();
    }, [
        emptyAiAssistantForm,
        emptyCatalogProductForm,
        emptyLabelForm,
        emptyQuickReplyItemForm,
        emptyQuickReplyLibraryForm,
        emptyTenantCatalogForm,
        isOpen,
        resetOperationsState,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setCatalogProductForm,
        setCatalogProductImageError,
        setCatalogProductPanelMode,
        setLabelForm,
        setLabelPanelMode,
        setQuickReplyItemForm,
        setQuickReplyItemPanelMode,
        setQuickReplyItems,
        setQuickReplyLibraryForm,
        setQuickReplyLibraryPanelMode,
        setQuickReplyLibraries,
        setQuickReplyModuleFilterId,
        setSelectedAiAssistantId,
        setSelectedCatalogId,
        setSelectedCatalogProductId,
        setSelectedLabelId,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId,
        setSelectedWaModuleId,
        setTenantAiAssistants,
        setTenantCatalogForm,
        setTenantCatalogProducts,
        setTenantCatalogs,
        setTenantLabels,
        setWaModules,
        tenantScopeId
    ]);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedConfigKey('');
        setSelectedRoleKey('');
        setSelectedWaModuleId('');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setCatalogPanelMode('view');
        setModuleUserPickerId('');
        setSelectedCustomerId('');
        setCustomerPanelMode('view');
        setCustomerSearch('');
        setCustomerCsvText('');
        setSelectedAiAssistantId('');
        setAiAssistantPanelMode('view');
        setAiAssistantForm(emptyAiAssistantForm);
        setSelectedQuickReplyLibraryId('');
        setSelectedQuickReplyItemId('');
        setQuickReplyModuleFilterId('');
        setQuickReplyLibraryPanelMode('view');
        setQuickReplyItemPanelMode('view');
        setSelectedLabelId('');
        setLabelPanelMode('view');
        setLabelForm(emptyLabelForm);
        setLabelSearch('');
    }, [
        emptyAiAssistantForm,
        emptyLabelForm,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setCatalogPanelMode,
        setCustomerCsvText,
        setCustomerPanelMode,
        setCustomerSearch,
        setLabelForm,
        setLabelPanelMode,
        setLabelSearch,
        setModuleUserPickerId,
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryPanelMode,
        setQuickReplyModuleFilterId,
        setSelectedAiAssistantId,
        setSelectedConfigKey,
        setSelectedCustomerId,
        setSelectedLabelId,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId,
        setSelectedRoleKey,
        setSelectedWaModuleId,
        setTenantSettingsPanelMode,
        setWaModulePanelMode,
        isOpen,
        tenantScopeId
    ]);

    useEffect(() => {
        if (!isOpen) return;
        if (requiresTenantSelection || settingsTenantId) return;
        const fallbackTenantId = String(activeTenantId || tenantOptions[0]?.id || '').trim();
        if (!fallbackTenantId) return;
        setSettingsTenantId(fallbackTenantId);
    }, [activeTenantId, isOpen, requiresTenantSelection, setSettingsTenantId, settingsTenantId, tenantOptions]);

    useEffect(() => {
        if (!isOpen) return;
        if (!requiresTenantSelection) return;
        if (String(settingsTenantId || '').trim()) return;
        if (String(launchSource || '').trim().toLowerCase() !== 'chat') return;

        const requestedTenantId = String(preferredTenantId || '').trim();
        if (!requestedTenantId) return;

        const exists = tenantOptions.some((tenant) => String(tenant?.id || '').trim() === requestedTenantId);
        if (!exists) return;

        setSettingsTenantId(requestedTenantId);
        setSelectedTenantId(requestedTenantId);
    }, [
        isOpen,
        launchSource,
        preferredTenantId,
        requiresTenantSelection,
        setSelectedTenantId,
        setSettingsTenantId,
        settingsTenantId,
        tenantOptions
    ]);

    useEffect(() => {
        if (!isOpen) return;
        if (!requiresTenantSelection || tenantScopeId) return;
        setCurrentSection('saas_empresas');
    }, [isOpen, requiresTenantSelection, setCurrentSection, tenantScopeId]);
}
