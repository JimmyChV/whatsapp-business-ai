import { useCallback } from 'react';
import {
    buildQuickReplyLibraryPayload,
    normalizeCatalogIdsList,
    resolveQuickReplyLibraryIdsForModule
} from '../../../helpers';
import { updateQuickReplyLibrary } from '../../../services';

export default function useModuleConfigActions({
    requestJson,
    settingsTenantId = '',
    canEditTenantSettings = false,
    canEditModules = false,
    waModules = [],
    selectedConfigModule = null,
    quickReplyLibraries = [],
    activeCatalogOptions = [],
    defaultAiAssistantId = '',
    setSelectedConfigKey,
    setSelectedRoleKey,
    setSelectedWaModuleId,
    setTenantSettingsPanelMode,
    setWaModulePanelMode,
    setCatalogPanelMode,
    setModuleUserPickerId,
    setModuleQuickReplyLibraryDraft,
    setWaModuleForm,
    openWaModuleEditor,
    resetWaModuleForm
} = {}) {
    const openConfigSettingsView = () => {
        setSelectedConfigKey('tenant_settings');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setSelectedWaModuleId('');
    };

    const openConfigSettingsEdit = () => {
        if (!settingsTenantId || !canEditTenantSettings) return;
        setSelectedConfigKey('tenant_settings');
        setTenantSettingsPanelMode('edit');
        setWaModulePanelMode('view');
        setSelectedWaModuleId('');
    };

    const openConfigModuleView = (moduleId) => {
        const cleanModuleId = String(moduleId || '').trim();
        if (!cleanModuleId) return;
        const moduleItem = waModules.find((item) => String(item?.moduleId || '').trim() === cleanModuleId);
        if (!moduleItem) return;
        setSelectedConfigKey(`wa_module:${cleanModuleId}`);
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        openWaModuleEditor(moduleItem);
    };

    const openConfigModuleCreate = () => {
        if (!canEditModules) return;
        setSelectedConfigKey('');
        setSelectedRoleKey('');
        setSelectedWaModuleId('');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('create');
        setModuleUserPickerId('');
        setModuleQuickReplyLibraryDraft([]);
        resetWaModuleForm();
        setWaModuleForm((prev) => ({
            ...prev,
            catalogIds: activeCatalogOptions.length > 0
                ? [String(activeCatalogOptions[0]?.catalogId || '').trim().toUpperCase()].filter(Boolean)
                : [],
            aiAssistantId: defaultAiAssistantId || '',
            scheduleId: '',
            aiAssistantName: 'Patty',
            aiWithinHoursMode: 'review',
            aiOutsideHoursMode: 'autonomous',
            aiWaitSeconds: 15
        }));
    };

    const openConfigModuleEdit = () => {
        if (!canEditModules) return;
        if (!selectedConfigModule) return;
        setSelectedConfigKey(`wa_module:${selectedConfigModule.moduleId}`);
        openWaModuleEditor(selectedConfigModule);
        setWaModulePanelMode('edit');
    };

    const clearConfigSelection = () => {
        setSelectedConfigKey('');
        setSelectedRoleKey('');
        setSelectedWaModuleId('');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setCatalogPanelMode('view');
        setModuleUserPickerId('');
        resetWaModuleForm();
    };

    const toggleAssignedUserForModule = (userId) => {
        const cleanUserId = String(userId || '').trim();
        if (!cleanUserId) return;
        setWaModuleForm((prev) => {
            const set = new Set(Array.isArray(prev.assignedUserIds) ? prev.assignedUserIds : []);
            if (set.has(cleanUserId)) {
                set.delete(cleanUserId);
            } else {
                set.add(cleanUserId);
            }
            return {
                ...prev,
                assignedUserIds: Array.from(set)
            };
        });
        setModuleUserPickerId('');
    };

    const toggleCatalogForModule = (catalogId) => {
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        if (!/^CAT-[A-Z0-9]{4,}$/.test(cleanCatalogId)) return;
        setWaModuleForm((prev) => {
            const current = normalizeCatalogIdsList(prev?.catalogIds || []);
            const set = new Set(current);
            if (set.has(cleanCatalogId)) set.delete(cleanCatalogId);
            else set.add(cleanCatalogId);
            return {
                ...prev,
                catalogIds: Array.from(set).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
            };
        });
    };

    const toggleQuickReplyLibraryForModuleDraft = (libraryId = '') => {
        const cleanLibraryId = String(libraryId || '').trim().toUpperCase();
        if (!cleanLibraryId) return;
        setModuleQuickReplyLibraryDraft((prev) => {
            const set = new Set((Array.isArray(prev) ? prev : []).map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean));
            if (set.has(cleanLibraryId)) set.delete(cleanLibraryId);
            else set.add(cleanLibraryId);
            return Array.from(set);
        });
    };

    const syncQuickReplyLibrariesForModule = useCallback(async (moduleId = '', selectedLibraryIds = []) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanModuleId = String(moduleId || '').trim().toLowerCase();
        if (!cleanTenantId || !cleanModuleId) return;

        const selectedSet = new Set((Array.isArray(selectedLibraryIds) ? selectedLibraryIds : [])
            .map((entry) => String(entry || '').trim().toUpperCase())
            .filter(Boolean));

        const mutableLibraries = (Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [])
            .filter((library) => library?.isShared !== true);

        for (const library of mutableLibraries) {
            const libraryId = String(library?.libraryId || '').trim().toUpperCase();
            if (!libraryId) continue;
            const currentSet = new Set((Array.isArray(library?.moduleIds) ? library.moduleIds : [])
                .map((entry) => String(entry || '').trim().toLowerCase())
                .filter(Boolean));
            const currentlyAssigned = currentSet.has(cleanModuleId);
            const shouldAssign = selectedSet.has(libraryId);
            if (currentlyAssigned === shouldAssign) continue;

            if (shouldAssign) currentSet.add(cleanModuleId);
            else currentSet.delete(cleanModuleId);

            const payload = buildQuickReplyLibraryPayload({
                ...library,
                moduleIds: Array.from(currentSet),
                isShared: false
            });

            await updateQuickReplyLibrary(requestJson, cleanTenantId, libraryId, payload);
        }
    }, [quickReplyLibraries, requestJson, settingsTenantId]);

    const getQuickReplyLibraryIdsForModule = useCallback((moduleId = '') => (
        resolveQuickReplyLibraryIdsForModule(moduleId, quickReplyLibraries)
    ), [quickReplyLibraries]);

    return {
        clearConfigSelection,
        getQuickReplyLibraryIdsForModule,
        openConfigModuleCreate,
        openConfigModuleEdit,
        openConfigModuleView,
        openConfigSettingsEdit,
        openConfigSettingsView,
        syncQuickReplyLibrariesForModule,
        toggleAssignedUserForModule,
        toggleCatalogForModule,
        toggleQuickReplyLibraryForModuleDraft
    };
}
