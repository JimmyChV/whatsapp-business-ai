import { useEffect } from 'react';

export default function useSaasPanelFormSyncEffects({
    isOpen = false,
    settingsTenantId = '',
    selectedTenant = null,
    tenantPanelMode = 'view',
    selectedUser = null,
    userPanelMode = 'view',
    selectedCustomer = null,
    customerPanelMode = 'view',
    selectedAiAssistant = null,
    aiAssistantPanelMode = 'view',
    selectedTenantCatalog = null,
    catalogPanelMode = 'view',
    selectedWaModule = null,
    selectedQuickReplyLibrary = null,
    quickReplyLibraryPanelMode = 'view',
    selectedQuickReplyItem = null,
    selectedQuickReplyLibraryEntity = null,
    quickReplyItemPanelMode = 'view',
    quickReplyScopeModuleId = '',
    emptyTenantForm,
    emptyUserForm,
    emptyCustomerForm,
    emptyAiAssistantForm,
    emptyTenantCatalogForm,
    emptyCatalogProductForm,
    emptyQuickReplyLibraryForm,
    emptyQuickReplyItemForm,
    buildTenantFormFromItem,
    buildUserFormFromItem,
    normalizeCustomerFormFromItem,
    buildAiAssistantFormFromItem,
    buildTenantCatalogFormFromItem,
    normalizeQuickReplyMediaAssets,
    loadTenantCatalogProducts,
    setError,
    resetWaModuleForm,
    openWaModuleEditor,
    setTenantForm,
    setUserForm,
    setCustomerForm,
    setAiAssistantForm,
    setTenantCatalogForm,
    setTenantCatalogProducts,
    setSelectedCatalogProductId,
    setCatalogProductForm,
    setCatalogProductPanelMode,
    setCatalogProductImageError,
    setQuickReplyLibraryForm,
    setQuickReplyItemForm
} = {}) {
    useEffect(() => {
        if (tenantPanelMode === 'create') return;
        if (!selectedTenant) {
            setTenantForm(emptyTenantForm);
            return;
        }
        setTenantForm(buildTenantFormFromItem(selectedTenant));
    }, [buildTenantFormFromItem, emptyTenantForm, selectedTenant, setTenantForm, tenantPanelMode]);

    useEffect(() => {
        if (userPanelMode === 'create') return;
        if (!selectedUser) {
            setUserForm(emptyUserForm);
            return;
        }
        setUserForm(buildUserFormFromItem(selectedUser));
    }, [buildUserFormFromItem, emptyUserForm, selectedUser, setUserForm, userPanelMode]);

    useEffect(() => {
        if (customerPanelMode === 'create') return;
        if (!selectedCustomer) {
            setCustomerForm(emptyCustomerForm);
            return;
        }
        setCustomerForm(normalizeCustomerFormFromItem(selectedCustomer));
    }, [customerPanelMode, emptyCustomerForm, normalizeCustomerFormFromItem, selectedCustomer, setCustomerForm]);

    useEffect(() => {
        if (aiAssistantPanelMode === 'create') return;
        if (!selectedAiAssistant) {
            setAiAssistantForm({ ...emptyAiAssistantForm });
            return;
        }
        setAiAssistantForm(buildAiAssistantFormFromItem(selectedAiAssistant));
    }, [aiAssistantPanelMode, buildAiAssistantFormFromItem, emptyAiAssistantForm, selectedAiAssistant, setAiAssistantForm]);

    useEffect(() => {
        if (catalogPanelMode === 'create') return;
        if (!selectedTenantCatalog) {
            setTenantCatalogForm(emptyTenantCatalogForm);
            return;
        }
        setTenantCatalogForm(buildTenantCatalogFormFromItem(selectedTenantCatalog));
    }, [buildTenantCatalogFormFromItem, catalogPanelMode, emptyTenantCatalogForm, selectedTenantCatalog, setTenantCatalogForm]);

    useEffect(() => {
        if (!isOpen || !settingsTenantId || !selectedTenantCatalog || selectedTenantCatalog.sourceType !== 'local') {
            setTenantCatalogProducts([]);
            setSelectedCatalogProductId('');
            setCatalogProductForm({ ...emptyCatalogProductForm });
            setCatalogProductPanelMode('view');
            setCatalogProductImageError('');
            return;
        }
        loadTenantCatalogProducts(settingsTenantId, selectedTenantCatalog.catalogId)
            .catch((err) => setError(String(err?.message || err || 'No se pudieron cargar productos del catalogo.')));
    }, [
        emptyCatalogProductForm,
        isOpen,
        loadTenantCatalogProducts,
        selectedTenantCatalog,
        setCatalogProductForm,
        setCatalogProductImageError,
        setCatalogProductPanelMode,
        setError,
        setSelectedCatalogProductId,
        setTenantCatalogProducts,
        settingsTenantId
    ]);

    useEffect(() => {
        if (!selectedWaModule) {
            resetWaModuleForm();
            return;
        }
        openWaModuleEditor(selectedWaModule);
    }, [openWaModuleEditor, resetWaModuleForm, selectedWaModule]);

    useEffect(() => {
        if (!selectedQuickReplyLibrary) {
            setQuickReplyLibraryForm({ ...emptyQuickReplyLibraryForm, moduleIds: quickReplyScopeModuleId ? [quickReplyScopeModuleId] : [] });
            return;
        }
        if (quickReplyLibraryPanelMode === 'create') return;
        setQuickReplyLibraryForm({
            libraryId: selectedQuickReplyLibrary.libraryId,
            name: selectedQuickReplyLibrary.name || '',
            description: selectedQuickReplyLibrary.description || '',
            isShared: selectedQuickReplyLibrary.isShared === true,
            isActive: selectedQuickReplyLibrary.isActive !== false,
            sortOrder: String(selectedQuickReplyLibrary.sortOrder || 100),
            moduleIds: Array.isArray(selectedQuickReplyLibrary.moduleIds) ? [...selectedQuickReplyLibrary.moduleIds] : []
        });
    }, [
        emptyQuickReplyLibraryForm,
        quickReplyLibraryPanelMode,
        quickReplyScopeModuleId,
        selectedQuickReplyLibrary,
        setQuickReplyLibraryForm
    ]);

    useEffect(() => {
        if (!selectedQuickReplyItem) {
            setQuickReplyItemForm((prev) => ({
                ...emptyQuickReplyItemForm,
                libraryId: String(selectedQuickReplyLibraryEntity?.libraryId || prev?.libraryId || '').trim().toUpperCase()
            }));
            return;
        }
        if (quickReplyItemPanelMode === 'create') return;
        setQuickReplyItemForm({
            itemId: selectedQuickReplyItem.itemId,
            libraryId: selectedQuickReplyItem.libraryId,
            label: selectedQuickReplyItem.label || '',
            text: selectedQuickReplyItem.text || '',
            mediaAssets: normalizeQuickReplyMediaAssets(selectedQuickReplyItem.mediaAssets, {
                url: selectedQuickReplyItem.mediaUrl || '',
                mimeType: selectedQuickReplyItem.mediaMimeType || '',
                fileName: selectedQuickReplyItem.mediaFileName || '',
                sizeBytes: selectedQuickReplyItem.mediaSizeBytes
            }),
            mediaUrl: selectedQuickReplyItem.mediaUrl || '',
            mediaMimeType: selectedQuickReplyItem.mediaMimeType || '',
            mediaFileName: selectedQuickReplyItem.mediaFileName || '',
            isActive: selectedQuickReplyItem.isActive !== false,
            sortOrder: String(selectedQuickReplyItem.sortOrder || 100)
        });
    }, [
        emptyQuickReplyItemForm,
        normalizeQuickReplyMediaAssets,
        quickReplyItemPanelMode,
        selectedQuickReplyItem,
        selectedQuickReplyLibraryEntity,
        setQuickReplyItemForm
    ]);
}
