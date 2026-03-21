import { useEffect, useRef } from 'react';
import { isDeepEqual, setIfChanged } from './formSync.helpers';


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
    const selectedTenantId = String(selectedTenant?.id || '').trim();
    const selectedUserId = String(selectedUser?.id || '').trim();
    const selectedCustomerId = String(selectedCustomer?.customerId || '').trim();
    const selectedAiAssistantId = String(selectedAiAssistant?.assistantId || selectedAiAssistant?.id || '').trim().toUpperCase();
    const selectedTenantCatalogId = String(selectedTenantCatalog?.catalogId || '').trim().toUpperCase();
    const selectedTenantCatalogSourceType = String(selectedTenantCatalog?.sourceType || '').trim().toLowerCase();
    const selectedWaModuleId = String(selectedWaModule?.moduleId || '').trim().toLowerCase();
    const selectedQuickReplyLibraryId = String(selectedQuickReplyLibrary?.libraryId || '').trim().toUpperCase();
    const selectedQuickReplyItemId = String(selectedQuickReplyItem?.itemId || '').trim().toUpperCase();

    const refs = useRef({});
    refs.current = {
        emptyCatalogProductForm,
        loadTenantCatalogProducts,
        setError,
        resetWaModuleForm,
        openWaModuleEditor,
        setTenantCatalogProducts,
        setSelectedCatalogProductId,
        setCatalogProductForm,
        setCatalogProductPanelMode,
        setCatalogProductImageError,
        selectedTenant,
        selectedUser,
        selectedCustomer,
        selectedAiAssistant,
        selectedTenantCatalog,
        selectedWaModule,
        selectedQuickReplyLibrary,
        selectedQuickReplyItem,
        selectedQuickReplyLibraryEntity,
        buildTenantFormFromItem,
        buildUserFormFromItem,
        normalizeCustomerFormFromItem,
        buildAiAssistantFormFromItem,
        buildTenantCatalogFormFromItem,
        normalizeQuickReplyMediaAssets
    };

    useEffect(() => {
        if (!isOpen) return;
        if (tenantPanelMode === 'create') return;
        const { selectedTenant: selectedTenantValue, buildTenantFormFromItem: buildTenantForm } = refs.current;
        if (!selectedTenantId) {
            setIfChanged(setTenantForm, emptyTenantForm);
            return;
        }
        setIfChanged(setTenantForm, buildTenantForm(selectedTenantValue));
    }, [emptyTenantForm, isOpen, selectedTenantId, setTenantForm, tenantPanelMode]);

    useEffect(() => {
        if (!isOpen) return;
        if (userPanelMode === 'create') return;
        const { selectedUser: selectedUserValue, buildUserFormFromItem: buildUserForm } = refs.current;
        if (!selectedUserId) {
            setIfChanged(setUserForm, emptyUserForm);
            return;
        }
        setIfChanged(setUserForm, buildUserForm(selectedUserValue));
    }, [emptyUserForm, isOpen, selectedUserId, setUserForm, userPanelMode]);

    useEffect(() => {
        if (!isOpen) return;
        if (customerPanelMode === 'create') return;
        const {
            selectedCustomer: selectedCustomerValue,
            normalizeCustomerFormFromItem: normalizeCustomerForm
        } = refs.current;
        if (!selectedCustomerId) {
            setIfChanged(setCustomerForm, emptyCustomerForm);
            return;
        }
        setIfChanged(setCustomerForm, normalizeCustomerForm(selectedCustomerValue));
    }, [customerPanelMode, emptyCustomerForm, isOpen, selectedCustomerId, setCustomerForm]);

    useEffect(() => {
        if (!isOpen) return;
        if (aiAssistantPanelMode === 'create') return;
        const {
            selectedAiAssistant: selectedAiAssistantValue,
            buildAiAssistantFormFromItem: buildAiAssistantForm
        } = refs.current;
        if (!selectedAiAssistantId) {
            setIfChanged(setAiAssistantForm, { ...emptyAiAssistantForm });
            return;
        }
        setIfChanged(setAiAssistantForm, buildAiAssistantForm(selectedAiAssistantValue));
    }, [aiAssistantPanelMode, emptyAiAssistantForm, isOpen, selectedAiAssistantId, setAiAssistantForm]);

    useEffect(() => {
        if (!isOpen) return;
        if (catalogPanelMode === 'create') return;
        const {
            selectedTenantCatalog: selectedTenantCatalogValue,
            buildTenantCatalogFormFromItem: buildTenantCatalogForm
        } = refs.current;
        if (!selectedTenantCatalogId) {
            setIfChanged(setTenantCatalogForm, emptyTenantCatalogForm);
            return;
        }
        setIfChanged(setTenantCatalogForm, buildTenantCatalogForm(selectedTenantCatalogValue));
    }, [catalogPanelMode, emptyTenantCatalogForm, isOpen, selectedTenantCatalogId, setTenantCatalogForm]);

    const catalogProductsSyncRef = useRef('');
    useEffect(() => {
        const tenantId = String(settingsTenantId || '').trim();
        const catalogId = selectedTenantCatalogId;
        const sourceType = selectedTenantCatalogSourceType;
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
            } = refs.current;
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
        } = refs.current;
        Promise.resolve(loadProducts(tenantId, catalogId))
            .catch((err) => setPanelError(String(err?.message || err || 'No se pudieron cargar productos del catalogo.')));
    }, [isOpen, settingsTenantId, selectedTenantCatalogId, selectedTenantCatalogSourceType]);

    const waModuleSyncRef = useRef('');
    useEffect(() => {
        if (!isOpen) return;
        const moduleId = selectedWaModuleId;
        const {
            resetWaModuleForm: resetModuleForm,
            openWaModuleEditor: openModuleEditor,
            selectedWaModule: selectedWaModuleValue
        } = refs.current;

        if (!moduleId) {
            if (waModuleSyncRef.current === 'reset') return;
            waModuleSyncRef.current = 'reset';
            resetModuleForm();
            return;
        }

        if (waModuleSyncRef.current === moduleId) return;
        waModuleSyncRef.current = moduleId;
        openModuleEditor(selectedWaModuleValue);
    }, [isOpen, selectedWaModuleId]);

    useEffect(() => {
        if (!isOpen) return;
        const { selectedQuickReplyLibrary: selectedLibraryValue } = refs.current;
        if (!selectedQuickReplyLibraryId) {
            setIfChanged(setQuickReplyLibraryForm, {
                ...emptyQuickReplyLibraryForm,
                moduleIds: quickReplyScopeModuleId ? [quickReplyScopeModuleId] : []
            });
            return;
        }
        if (quickReplyLibraryPanelMode === 'create') return;
        setIfChanged(setQuickReplyLibraryForm, {
            libraryId: selectedLibraryValue.libraryId,
            name: selectedLibraryValue.name || '',
            description: selectedLibraryValue.description || '',
            isShared: selectedLibraryValue.isShared === true,
            isActive: selectedLibraryValue.isActive !== false,
            sortOrder: String(selectedLibraryValue.sortOrder || 100),
            moduleIds: Array.isArray(selectedLibraryValue.moduleIds) ? [...selectedLibraryValue.moduleIds] : []
        });
    }, [
        emptyQuickReplyLibraryForm,
        isOpen,
        quickReplyLibraryPanelMode,
        quickReplyScopeModuleId,
        selectedQuickReplyLibraryId,
        setQuickReplyLibraryForm
    ]);

    useEffect(() => {
        if (!isOpen) return;
        const {
            selectedQuickReplyItem: selectedItemValue,
            selectedQuickReplyLibraryEntity: selectedLibraryEntityValue,
            normalizeQuickReplyMediaAssets: normalizeQuickReplyMedia
        } = refs.current;

        if (!selectedQuickReplyItemId) {
            setQuickReplyItemForm((previousValue) => {
                const nextValue = {
                    ...emptyQuickReplyItemForm,
                    libraryId: String(selectedLibraryEntityValue?.libraryId || previousValue?.libraryId || '').trim().toUpperCase()
                };
                return isDeepEqual(previousValue, nextValue) ? previousValue : nextValue;
            });
            return;
        }
        if (quickReplyItemPanelMode === 'create') return;
        setIfChanged(setQuickReplyItemForm, {
            itemId: selectedItemValue.itemId,
            libraryId: selectedItemValue.libraryId,
            label: selectedItemValue.label || '',
            text: selectedItemValue.text || '',
            mediaAssets: normalizeQuickReplyMedia(selectedItemValue.mediaAssets, {
                url: selectedItemValue.mediaUrl || '',
                mimeType: selectedItemValue.mediaMimeType || '',
                fileName: selectedItemValue.mediaFileName || '',
                sizeBytes: selectedItemValue.mediaSizeBytes
            }),
            mediaUrl: selectedItemValue.mediaUrl || '',
            mediaMimeType: selectedItemValue.mediaMimeType || '',
            mediaFileName: selectedItemValue.mediaFileName || '',
            isActive: selectedItemValue.isActive !== false,
            sortOrder: String(selectedItemValue.sortOrder || 100)
        });
    }, [
        emptyQuickReplyItemForm,
        isOpen,
        quickReplyItemPanelMode,
        selectedQuickReplyItemId,
        setQuickReplyItemForm
    ]);
}

