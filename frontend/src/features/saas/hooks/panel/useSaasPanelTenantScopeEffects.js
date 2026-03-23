import { useEffect, useRef } from 'react';

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
    const refs = useRef({});
    refs.current = {
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
    };

    useEffect(() => {
        if (!isOpen) return;
        if (String(tenantScopeId || '').trim()) return;

        const {
            emptyTenantCatalogForm: emptyCatalogForm,
            emptyCatalogProductForm: emptyProductForm,
            emptyAiAssistantForm: emptyAiForm,
            emptyQuickReplyLibraryForm: emptyLibraryForm,
            emptyQuickReplyItemForm: emptyItemForm,
            emptyLabelForm: emptyChatLabelForm,
            resetOperationsState: resetOps,
            setWaModules: setModules,
            setSelectedWaModuleId: setModuleId,
            setTenantCatalogs: setCatalogs,
            setSelectedCatalogId: setCatalogId,
            setTenantCatalogForm: setCatalogForm,
            setTenantCatalogProducts: setCatalogProducts,
            setSelectedCatalogProductId: setCatalogProductId,
            setCatalogProductForm: setProductForm,
            setCatalogProductPanelMode: setProductMode,
            setCatalogProductImageError: setProductError,
            setTenantAiAssistants: setAssistants,
            setSelectedAiAssistantId: setAssistantId,
            setAiAssistantForm: setAssistantForm,
            setAiAssistantPanelMode: setAssistantMode,
            setQuickReplyLibraries: setLibraries,
            setQuickReplyItems: setItems,
            setSelectedQuickReplyLibraryId: setLibraryId,
            setSelectedQuickReplyItemId: setItemId,
            setQuickReplyModuleFilterId: setModuleFilter,
            setQuickReplyLibraryForm: setLibraryForm,
            setQuickReplyItemForm: setItemForm,
            setQuickReplyLibraryPanelMode: setLibraryMode,
            setQuickReplyItemPanelMode: setItemMode,
            setTenantLabels: setLabels,
            setSelectedLabelId: setLabelId,
            setLabelForm: setChatLabelForm,
            setLabelPanelMode: setChatLabelMode
        } = refs.current;

        setModules([]);
        setModuleId('');
        setCatalogs([]);
        setCatalogId('');
        setCatalogForm(emptyCatalogForm);
        setCatalogProducts([]);
        setCatalogProductId('');
        setProductForm(emptyProductForm);
        setProductMode('view');
        setProductError('');
        setAssistants([]);
        setAssistantId('');
        setAssistantForm(emptyAiForm);
        setAssistantMode('view');
        setLibraries([]);
        setItems([]);
        setLibraryId('');
        setItemId('');
        setModuleFilter('');
        setLibraryForm(emptyLibraryForm);
        setItemForm(emptyItemForm);
        setLibraryMode('view');
        setItemMode('view');
        setLabels([]);
        setLabelId('');
        setChatLabelForm(emptyChatLabelForm);
        setChatLabelMode('view');
        resetOps();
    }, [isOpen, tenantScopeId]);

    useEffect(() => {
        if (!isOpen) return;

        const {
            emptyAiAssistantForm: emptyAiForm,
            emptyLabelForm: emptyChatLabelForm,
            setSelectedConfigKey: setConfigKey,
            setSelectedRoleKey: setRoleKey,
            setSelectedWaModuleId: setModuleId,
            setTenantSettingsPanelMode: setTenantSettingsMode,
            setWaModulePanelMode: setModuleMode,
            setCatalogPanelMode: setCatalogMode,
            setModuleUserPickerId: setUserPicker,
            setSelectedCustomerId: setCustomerId,
            setCustomerPanelMode: setCustomerMode,
            setCustomerSearch: setCustomerQuery,
            setCustomerCsvText: setCustomerCsv,
            setSelectedAiAssistantId: setAssistantId,
            setAiAssistantPanelMode: setAssistantMode,
            setAiAssistantForm: setAssistantForm,
            setSelectedQuickReplyLibraryId: setLibraryId,
            setSelectedQuickReplyItemId: setItemId,
            setQuickReplyModuleFilterId: setModuleFilter,
            setQuickReplyLibraryPanelMode: setLibraryMode,
            setQuickReplyItemPanelMode: setItemMode,
            setSelectedLabelId: setLabelId,
            setLabelPanelMode: setLabelMode,
            setLabelForm: setChatLabelForm,
            setLabelSearch: setLabelQuery
        } = refs.current;

        setConfigKey('');
        setRoleKey('');
        setModuleId('');
        setTenantSettingsMode('view');
        setModuleMode('view');
        setCatalogMode('view');
        setUserPicker('');
        setCustomerId('');
        setCustomerMode('view');
        setCustomerQuery('');
        setCustomerCsv('');
        setAssistantId('');
        setAssistantMode('view');
        setAssistantForm(emptyAiForm);
        setLibraryId('');
        setItemId('');
        setModuleFilter('');
        setLibraryMode('view');
        setItemMode('view');
        setLabelId('');
        setLabelMode('view');
        setChatLabelForm(emptyChatLabelForm);
        setLabelQuery('');
    }, [isOpen, tenantScopeId]);

    useEffect(() => {
        if (!isOpen) return;
        if (requiresTenantSelection || settingsTenantId) return;
        const fallbackTenantId = String(activeTenantId || tenantOptions[0]?.id || '').trim();
        if (!fallbackTenantId) return;
        refs.current.setSettingsTenantId(fallbackTenantId);
    }, [activeTenantId, isOpen, requiresTenantSelection, settingsTenantId, tenantOptions]);

    useEffect(() => {
        if (!isOpen) return;
        if (!requiresTenantSelection) return;
        if (String(settingsTenantId || '').trim()) return;
        if (String(launchSource || '').trim().toLowerCase() !== 'chat') return;

        const requestedTenantId = String(preferredTenantId || '').trim();
        if (!requestedTenantId) return;

        const exists = tenantOptions.some((tenant) => String(tenant?.id || '').trim() === requestedTenantId);
        if (!exists) return;

        refs.current.setSettingsTenantId(requestedTenantId);
        refs.current.setSelectedTenantId(requestedTenantId);
    }, [
        isOpen,
        launchSource,
        preferredTenantId,
        requiresTenantSelection,
        settingsTenantId,
        tenantOptions
    ]);

    useEffect(() => {
        if (!isOpen) return;
        if (!requiresTenantSelection || tenantScopeId) return;
        refs.current.setCurrentSection('saas_empresas');
    }, [isOpen, requiresTenantSelection, tenantScopeId]);
}
