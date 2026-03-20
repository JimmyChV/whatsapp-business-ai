import { useEffect, useRef } from 'react';

function isObjectLike(value) {
    return value !== null && typeof value === 'object';
}

function isDeepEqual(left, right) {
    if (Object.is(left, right)) return true;

    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) return false;
        if (left.length !== right.length) return false;
        for (let index = 0; index < left.length; index += 1) {
            if (!isDeepEqual(left[index], right[index])) return false;
        }
        return true;
    }

    if (!isObjectLike(left) || !isObjectLike(right)) return false;

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;

    for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
        if (!isDeepEqual(left[key], right[key])) return false;
    }

    return true;
}

function setIfChanged(setter, nextValue) {
    setter((previousValue) => (isDeepEqual(previousValue, nextValue) ? previousValue : nextValue));
}

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
    const fnRef = useRef({
        emptyCatalogProductForm,
        loadTenantCatalogProducts,
        setError,
        resetWaModuleForm,
        openWaModuleEditor,
        setTenantCatalogProducts,
        setSelectedCatalogProductId,
        setCatalogProductForm,
        setCatalogProductPanelMode,
        setCatalogProductImageError
    });

    fnRef.current = {
        emptyCatalogProductForm,
        loadTenantCatalogProducts,
        setError,
        resetWaModuleForm,
        openWaModuleEditor,
        setTenantCatalogProducts,
        setSelectedCatalogProductId,
        setCatalogProductForm,
        setCatalogProductPanelMode,
        setCatalogProductImageError
    };

    useEffect(() => {
        if (!isOpen) return;
        if (tenantPanelMode === 'create') return;
        if (!selectedTenant) {
            setIfChanged(setTenantForm, emptyTenantForm);
            return;
        }
        setIfChanged(setTenantForm, buildTenantFormFromItem(selectedTenant));
    }, [buildTenantFormFromItem, emptyTenantForm, isOpen, selectedTenant, setTenantForm, tenantPanelMode]);

    useEffect(() => {
        if (!isOpen) return;
        if (userPanelMode === 'create') return;
        if (!selectedUser) {
            setIfChanged(setUserForm, emptyUserForm);
            return;
        }
        setIfChanged(setUserForm, buildUserFormFromItem(selectedUser));
    }, [buildUserFormFromItem, emptyUserForm, isOpen, selectedUser, setUserForm, userPanelMode]);

    useEffect(() => {
        if (!isOpen) return;
        if (customerPanelMode === 'create') return;
        if (!selectedCustomer) {
            setIfChanged(setCustomerForm, emptyCustomerForm);
            return;
        }
        setIfChanged(setCustomerForm, normalizeCustomerFormFromItem(selectedCustomer));
    }, [customerPanelMode, emptyCustomerForm, isOpen, normalizeCustomerFormFromItem, selectedCustomer, setCustomerForm]);

    useEffect(() => {
        if (!isOpen) return;
        if (aiAssistantPanelMode === 'create') return;
        if (!selectedAiAssistant) {
            setIfChanged(setAiAssistantForm, { ...emptyAiAssistantForm });
            return;
        }
        setIfChanged(setAiAssistantForm, buildAiAssistantFormFromItem(selectedAiAssistant));
    }, [aiAssistantPanelMode, buildAiAssistantFormFromItem, emptyAiAssistantForm, isOpen, selectedAiAssistant, setAiAssistantForm]);

    useEffect(() => {
        if (!isOpen) return;
        if (catalogPanelMode === 'create') return;
        if (!selectedTenantCatalog) {
            setIfChanged(setTenantCatalogForm, emptyTenantCatalogForm);
            return;
        }
        setIfChanged(setTenantCatalogForm, buildTenantCatalogFormFromItem(selectedTenantCatalog));
    }, [buildTenantCatalogFormFromItem, catalogPanelMode, emptyTenantCatalogForm, isOpen, selectedTenantCatalog, setTenantCatalogForm]);

    const catalogProductsSyncRef = useRef('');
    useEffect(() => {
        const tenantId = String(settingsTenantId || '').trim();
        const catalogId = String(selectedTenantCatalog?.catalogId || '').trim();
        const sourceType = String(selectedTenantCatalog?.sourceType || '').trim().toLowerCase();
        const shouldLoad = Boolean(isOpen && tenantId && catalogId && sourceType === 'local');

        if (!shouldLoad) {
            if (catalogProductsSyncRef.current === 'reset') return;
            catalogProductsSyncRef.current = 'reset';
            const {
                setTenantCatalogProducts: setProducts,
                setSelectedCatalogProductId: setSelectedProductId,
                setCatalogProductForm: setProductForm,
                setCatalogProductPanelMode: setProductPanelMode,
                setCatalogProductImageError: setProductImageError,
                emptyCatalogProductForm: emptyProductForm
            } = fnRef.current;
            setProducts((previousValue) => (Array.isArray(previousValue) && previousValue.length === 0 ? previousValue : []));
            setSelectedProductId((previousValue) => (previousValue ? '' : previousValue));
            setProductForm((previousValue) => {
                const nextValue = { ...emptyProductForm };
                return isDeepEqual(previousValue, nextValue) ? previousValue : nextValue;
            });
            setProductPanelMode((previousValue) => (previousValue === 'view' ? previousValue : 'view'));
            setProductImageError((previousValue) => (previousValue ? '' : previousValue));
            return;
        }

        const loadKey = `${tenantId}:${catalogId}`;
        if (catalogProductsSyncRef.current === loadKey) return;
        catalogProductsSyncRef.current = loadKey;

        const {
            loadTenantCatalogProducts: loadProducts,
            setError: setPanelError
        } = fnRef.current;
        Promise.resolve(loadProducts(tenantId, catalogId))
            .catch((err) => setPanelError(String(err?.message || err || 'No se pudieron cargar productos del catalogo.')));
    }, [isOpen, settingsTenantId, selectedTenantCatalog?.catalogId, selectedTenantCatalog?.sourceType]);

    const waModuleSyncRef = useRef('');
    useEffect(() => {
        if (!isOpen) return;
        const moduleId = String(selectedWaModule?.moduleId || '').trim();
        const {
            resetWaModuleForm: resetModuleForm,
            openWaModuleEditor: openModuleEditor
        } = fnRef.current;

        if (!moduleId) {
            if (waModuleSyncRef.current === 'reset') return;
            waModuleSyncRef.current = 'reset';
            resetModuleForm();
            return;
        }

        if (waModuleSyncRef.current === moduleId) return;
        waModuleSyncRef.current = moduleId;
        openModuleEditor(selectedWaModule);
    }, [isOpen, selectedWaModule]);

    useEffect(() => {
        if (!isOpen) return;
        if (!selectedQuickReplyLibrary) {
            setIfChanged(setQuickReplyLibraryForm, {
                ...emptyQuickReplyLibraryForm,
                moduleIds: quickReplyScopeModuleId ? [quickReplyScopeModuleId] : []
            });
            return;
        }
        if (quickReplyLibraryPanelMode === 'create') return;
        setIfChanged(setQuickReplyLibraryForm, {
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
        isOpen,
        quickReplyLibraryPanelMode,
        quickReplyScopeModuleId,
        selectedQuickReplyLibrary,
        setQuickReplyLibraryForm
    ]);

    useEffect(() => {
        if (!isOpen) return;
        if (!selectedQuickReplyItem) {
            setQuickReplyItemForm((previousValue) => {
                const nextValue = {
                    ...emptyQuickReplyItemForm,
                    libraryId: String(selectedQuickReplyLibraryEntity?.libraryId || previousValue?.libraryId || '').trim().toUpperCase()
                };
                return isDeepEqual(previousValue, nextValue) ? previousValue : nextValue;
            });
            return;
        }
        if (quickReplyItemPanelMode === 'create') return;
        setIfChanged(setQuickReplyItemForm, {
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
        isOpen,
        normalizeQuickReplyMediaAssets,
        quickReplyItemPanelMode,
        selectedQuickReplyItem,
        selectedQuickReplyLibraryEntity,
        setQuickReplyItemForm
    ]);
}
