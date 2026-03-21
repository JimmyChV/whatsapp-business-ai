import {
    buildQuickReplyItemPayload,
    buildQuickReplyLibraryPayload,
    normalizeQuickReplyItem,
    normalizeQuickReplyLibraryItem,
    normalizeQuickReplyMediaAssets
} from '../helpers';
import {
    createQuickReplyItem,
    createQuickReplyLibrary,
    deactivateQuickReplyItem as deactivateQuickReplyItemRequest,
    deactivateQuickReplyLibrary as deactivateQuickReplyLibraryRequest,
    fetchQuickReplyItems,
    fetchQuickReplyLibraries,
    updateQuickReplyItem,
    updateQuickReplyLibrary
} from '../services';

export default function useQuickReplyAdminActions({
    requestJson,
    settingsTenantId = '',
    waModules = [],
    selectedQuickReplyLibrary = null,
    selectedQuickReplyLibraryId = '',
    selectedQuickReplyItem = null,
    selectedQuickReplyItemId = '',
    quickReplyScopeModuleId = '',
    quickReplyLibraryForm = {},
    quickReplyItemForm = {},
    quickReplyLibraryPanelMode = 'view',
    quickReplyItemPanelMode = 'view',
    emptyQuickReplyLibraryForm = {},
    emptyQuickReplyItemForm = {},
    setQuickReplyLibraries,
    setQuickReplyItems,
    setSelectedQuickReplyLibraryId,
    setSelectedQuickReplyItemId,
    setQuickReplyModuleFilterId,
    setQuickReplyLibraryForm,
    setQuickReplyItemForm,
    setQuickReplyLibraryPanelMode,
    setQuickReplyItemPanelMode,
    setLoadingQuickReplies,
} = {}) {
    const loadQuickReplyData = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setQuickReplyLibraries([]);
            setQuickReplyItems([]);
            setSelectedQuickReplyLibraryId('');
            setSelectedQuickReplyItemId('');
            setQuickReplyModuleFilterId('');
            setQuickReplyLibraryForm({ ...emptyQuickReplyLibraryForm });
            setQuickReplyItemForm({ ...emptyQuickReplyItemForm });
            setQuickReplyLibraryPanelMode('view');
            setQuickReplyItemPanelMode('view');
            return;
        }

        setLoadingQuickReplies(true);
        try {
            const [librariesPayload, itemsPayload] = await Promise.all([
                requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries?includeInactive=true`),
                requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items?includeInactive=true`)
            ]);

            const libraries = (Array.isArray(librariesPayload?.items) ? librariesPayload.items : [])
                .map((entry) => normalizeQuickReplyLibraryItem(entry))
                .filter(Boolean)
                .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' }));

            const items = (Array.isArray(itemsPayload?.items) ? itemsPayload.items : [])
                .map((entry) => normalizeQuickReplyItem(entry))
                .filter(Boolean);

            setQuickReplyLibraries(libraries);
            setQuickReplyItems(items);
            setQuickReplyModuleFilterId((prev) => {
                const cleanPrev = String(prev || '').trim().toLowerCase();
                if (!cleanPrev) return cleanPrev;
                const exists = (waModules || []).some((entry) => String(entry?.moduleId || '').trim().toLowerCase() === cleanPrev);
                return exists ? cleanPrev : '';
            });
            setSelectedQuickReplyLibraryId((prev) => {
                const cleanPrev = String(prev || '').trim().toUpperCase();
                if (cleanPrev && libraries.some((entry) => entry.libraryId === cleanPrev)) return cleanPrev;
                return String(libraries[0]?.libraryId || '').trim().toUpperCase();
            });
            setSelectedQuickReplyItemId((prev) => {
                const cleanPrev = String(prev || '').trim().toUpperCase();
                if (!cleanPrev) return '';
                return items.some((entry) => entry.itemId === cleanPrev) ? cleanPrev : '';
            });
        } finally {
            setLoadingQuickReplies(false);
        }
    };

    const openQuickReplyLibraryCreate = () => {
        const moduleIds = quickReplyScopeModuleId ? [quickReplyScopeModuleId] : [];
        setQuickReplyLibraryForm({ ...emptyQuickReplyLibraryForm, moduleIds });
        setQuickReplyLibraryPanelMode('create');
    };

    const openQuickReplyLibraryEdit = () => {
        if (!selectedQuickReplyLibrary) return;
        setQuickReplyLibraryForm({
            libraryId: selectedQuickReplyLibrary.libraryId,
            name: selectedQuickReplyLibrary.name || '',
            description: selectedQuickReplyLibrary.description || '',
            isShared: selectedQuickReplyLibrary.isShared === true,
            isActive: selectedQuickReplyLibrary.isActive !== false,
            sortOrder: String(selectedQuickReplyLibrary.sortOrder || 100),
            moduleIds: Array.isArray(selectedQuickReplyLibrary.moduleIds) ? [...selectedQuickReplyLibrary.moduleIds] : []
        });
        setQuickReplyLibraryPanelMode('edit');
    };

    const cancelQuickReplyLibraryEdit = () => {
        if (selectedQuickReplyLibrary) {
            setQuickReplyLibraryForm({
                libraryId: selectedQuickReplyLibrary.libraryId,
                name: selectedQuickReplyLibrary.name || '',
                description: selectedQuickReplyLibrary.description || '',
                isShared: selectedQuickReplyLibrary.isShared === true,
                isActive: selectedQuickReplyLibrary.isActive !== false,
                sortOrder: String(selectedQuickReplyLibrary.sortOrder || 100),
                moduleIds: Array.isArray(selectedQuickReplyLibrary.moduleIds) ? [...selectedQuickReplyLibrary.moduleIds] : []
            });
        } else {
            setQuickReplyLibraryForm({ ...emptyQuickReplyLibraryForm });
        }
        setQuickReplyLibraryPanelMode('view');
    };

    const toggleModuleInQuickReplyLibraryForm = (moduleId) => {
        const clean = String(moduleId || '').trim().toLowerCase();
        if (!clean) return;
        setQuickReplyLibraryForm((prev) => {
            const current = Array.isArray(prev?.moduleIds) ? prev.moduleIds : [];
            const exists = current.includes(clean);
            return {
                ...prev,
                moduleIds: exists ? current.filter((entry) => entry !== clean) : [...current, clean]
            };
        });
    };

    const saveQuickReplyLibrary = async () => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        if (!cleanTenantId) throw new Error('Selecciona una empresa para gestionar bibliotecas.');
        const payload = buildQuickReplyLibraryPayload(quickReplyLibraryForm);
        if (!String(payload.name || '').trim()) throw new Error('Nombre de biblioteca requerido.');

        if (quickReplyLibraryPanelMode === 'create') {
            const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries`, {
                method: 'POST',
                body: payload
            });
            const createdId = String(created?.item?.libraryId || '').trim().toUpperCase();
            await loadQuickReplyData(cleanTenantId);
            if (createdId) setSelectedQuickReplyLibraryId(createdId);
            setQuickReplyLibraryPanelMode('view');
            return;
        }

        const cleanLibraryId = String(payload.libraryId || selectedQuickReplyLibraryId || '').trim().toUpperCase();
        if (!cleanLibraryId) throw new Error('Selecciona una biblioteca para actualizar.');
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries/${encodeURIComponent(cleanLibraryId)}`, {
            method: 'PUT',
            body: payload
        });
        await loadQuickReplyData(cleanTenantId);
        setSelectedQuickReplyLibraryId(cleanLibraryId);
        setQuickReplyLibraryPanelMode('view');
    };

    const deactivateQuickReplyLibrary = async (libraryId) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanLibraryId = String(libraryId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanLibraryId) return;
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries/${encodeURIComponent(cleanLibraryId)}/deactivate`, {
            method: 'POST',
            body: {}
        });
        await loadQuickReplyData(cleanTenantId);
        setQuickReplyLibraryPanelMode('view');
    };

    const openQuickReplyItemCreate = () => {
        if (!selectedQuickReplyLibrary) return;
        setSelectedQuickReplyItemId('');
        setQuickReplyItemForm({
            ...emptyQuickReplyItemForm,
            libraryId: selectedQuickReplyLibrary.libraryId,
            isActive: true,
            sortOrder: '100'
        });
        setQuickReplyItemPanelMode('create');
    };

    const openQuickReplyItemEdit = () => {
        if (!selectedQuickReplyItem) return;
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
        setQuickReplyItemPanelMode('edit');
    };

    const cancelQuickReplyItemEdit = () => {
        if (selectedQuickReplyItem) {
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
        } else {
            setQuickReplyItemForm({
                ...emptyQuickReplyItemForm,
                libraryId: String(selectedQuickReplyLibrary?.libraryId || '').trim().toUpperCase()
            });
        }
        setQuickReplyItemPanelMode('view');
    };

    const saveQuickReplyItem = async () => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const libraryId = String(quickReplyItemForm.libraryId || selectedQuickReplyLibrary?.libraryId || '').trim().toUpperCase();
        if (!cleanTenantId || !libraryId) throw new Error('Selecciona biblioteca antes de guardar respuesta rapida.');

        const payload = buildQuickReplyItemPayload(quickReplyItemForm, { libraryId });
        if (!payload.label) throw new Error('Etiqueta requerida.');
        if (!payload.text && (!Array.isArray(payload.mediaAssets) || payload.mediaAssets.length === 0) && !payload.mediaUrl) {
            throw new Error('Debes registrar texto o adjunto.');
        }

        if (quickReplyItemPanelMode === 'create') {
            const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items`, {
                method: 'POST',
                body: payload
            });
            const createdId = String(created?.item?.itemId || '').trim().toUpperCase();
            await loadQuickReplyData(cleanTenantId);
            if (createdId) setSelectedQuickReplyItemId(createdId);
            setQuickReplyItemPanelMode('view');
            return;
        }

        const cleanItemId = String(payload.itemId || selectedQuickReplyItemId || '').trim().toUpperCase();
        if (!cleanItemId) throw new Error('Selecciona una respuesta para actualizar.');
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items/${encodeURIComponent(cleanItemId)}`, {
            method: 'PUT',
            body: payload
        });
        await loadQuickReplyData(cleanTenantId);
        setSelectedQuickReplyItemId(cleanItemId);
        setQuickReplyItemPanelMode('view');
    };

    const deactivateQuickReplyItem = async (itemId) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanItemId = String(itemId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanItemId) return;
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items/${encodeURIComponent(cleanItemId)}/deactivate`, {
            method: 'POST',
            body: {}
        });
        await loadQuickReplyData(cleanTenantId);
        setQuickReplyItemPanelMode('view');
    };

    return {
        loadQuickReplyData,
        openQuickReplyLibraryCreate,
        openQuickReplyLibraryEdit,
        cancelQuickReplyLibraryEdit,
        toggleModuleInQuickReplyLibraryForm,
        saveQuickReplyLibrary,
        deactivateQuickReplyLibrary,
        openQuickReplyItemCreate,
        openQuickReplyItemEdit,
        cancelQuickReplyItemEdit,
        saveQuickReplyItem,
        deactivateQuickReplyItem
    };
}

