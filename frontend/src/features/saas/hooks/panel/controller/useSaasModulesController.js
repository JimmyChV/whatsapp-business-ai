import { useCallback } from 'react';
import {
    CATALOG_MODE_OPTIONS,
    MODULE_KEYS,
    normalizeCatalogIdsList,
    sanitizeAiAssistantCode
} from '../../../helpers';

function toCleanCatalogIds(catalogIds = []) {
    return normalizeCatalogIdsList(catalogIds)
        .map((entry) => String(entry || '').trim().toUpperCase())
        .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry));
}

function buildWaModulePayload({
    waModuleForm = {},
    selectedConfigModule = null
} = {}) {
    const existingMetadata = selectedConfigModule?.metadata && typeof selectedConfigModule.metadata === 'object'
        ? selectedConfigModule.metadata
        : {};
    const existingCloudConfig = existingMetadata?.cloudConfig && typeof existingMetadata.cloudConfig === 'object'
        ? existingMetadata.cloudConfig
        : {};
    const catalogIds = toCleanCatalogIds(waModuleForm.catalogIds || []);

    return {
        name: String(waModuleForm.name || '').trim(),
        phoneNumber: String(waModuleForm.phoneNumber || '').trim(),
        transportMode: 'cloud',
        imageUrl: String(waModuleForm.imageUrl || '').trim() || null,
        assignedUserIds: (Array.isArray(waModuleForm.assignedUserIds) ? waModuleForm.assignedUserIds : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean),
        catalogIds,
        metadata: {
            ...existingMetadata,
            moduleSettings: {
                catalogMode: CATALOG_MODE_OPTIONS.includes(String(waModuleForm.moduleCatalogMode || '').trim())
                    ? String(waModuleForm.moduleCatalogMode || '').trim()
                    : 'inherit',
                catalogIds,
                aiAssistantId: sanitizeAiAssistantCode(waModuleForm.aiAssistantId || '') || null,
                enabledModules: {
                    aiPro: waModuleForm.moduleAiEnabled !== false,
                    catalog: waModuleForm.moduleCatalogEnabled !== false,
                    cart: waModuleForm.moduleCartEnabled !== false,
                    quickReplies: waModuleForm.moduleQuickRepliesEnabled !== false
                }
            },
            cloudConfig: {
                ...existingCloudConfig,
                appId: String(waModuleForm.cloudAppId || '').trim() || undefined,
                wabaId: String(waModuleForm.cloudWabaId || '').trim() || undefined,
                phoneNumberId: String(waModuleForm.cloudPhoneNumberId || '').trim() || undefined,
                verifyToken: String(waModuleForm.cloudVerifyToken || '').trim() || undefined,
                graphVersion: String(waModuleForm.cloudGraphVersion || '').trim() || undefined,
                displayPhoneNumber: String(waModuleForm.cloudDisplayPhoneNumber || '').trim() || undefined,
                businessName: String(waModuleForm.cloudBusinessName || '').trim() || undefined,
                appSecret: String(waModuleForm.cloudAppSecret || '').trim() || undefined,
                systemUserToken: String(waModuleForm.cloudSystemUserToken || '').trim() || undefined,
                enforceSignature: waModuleForm.cloudEnforceSignature !== false
            }
        }
    };
}

function normalizeQuickReplyLibraryDraft(libraryIds = []) {
    return Array.from(new Set(
        (Array.isArray(libraryIds) ? libraryIds : [])
            .map((entry) => String(entry || '').trim().toUpperCase())
            .filter(Boolean)
    ));
}

async function runWithFallback(runAction, label, action) {
    if (typeof runAction === 'function') {
        await runAction(label, action);
        return;
    }
    await action();
}

export default function useSaasModulesController({
    panelCoreState = {},
    panelDerivedData = {},
    moduleSectionActions = {},
    tenantController = {},
    usersController = {},
    catalogController = {},
    aiController = {},
    quickRepliesController = {},
    canEditModules = false,
    canEditTenantSettings = false,
    busy = false,
    runAction = null,
    requestJson = null,
    setError = null,
    handleFormImageUpload = null,
    handleOpenOperation = null,
    loadWaModules = null,
    handleSectionChange = null
} = {}) {
    const { handleSectionChange: _legacyHandleSectionChange, ...moduleActionsBase } = moduleSectionActions || {};
    void _legacyHandleSectionChange;

    const modulesState = {
        waModules: panelCoreState.waModules,
        setWaModules: panelCoreState.setWaModules,
        waModuleForm: panelCoreState.waModuleForm,
        setWaModuleForm: panelCoreState.setWaModuleForm,
        editingWaModuleId: panelCoreState.editingWaModuleId,
        setEditingWaModuleId: panelCoreState.setEditingWaModuleId,
        selectedWaModuleId: panelCoreState.selectedWaModuleId,
        setSelectedWaModuleId: panelCoreState.setSelectedWaModuleId,
        moduleQuickReplyLibraryDraft: panelCoreState.moduleQuickReplyLibraryDraft,
        setModuleQuickReplyLibraryDraft: panelCoreState.setModuleQuickReplyLibraryDraft,
        selectedConfigKey: panelCoreState.selectedConfigKey,
        setSelectedConfigKey: panelCoreState.setSelectedConfigKey,
        moduleUserPickerId: panelCoreState.moduleUserPickerId,
        setModuleUserPickerId: panelCoreState.setModuleUserPickerId,
        tenantSettingsPanelMode: panelCoreState.tenantSettingsPanelMode,
        setTenantSettingsPanelMode: panelCoreState.setTenantSettingsPanelMode,
        waModulePanelMode: panelCoreState.waModulePanelMode,
        setWaModulePanelMode: panelCoreState.setWaModulePanelMode
    };

    const modulesDerived = {
        selectedConfigModule: panelDerivedData.selectedConfigModule,
        activeQuickReplyLibraries: panelDerivedData.activeQuickReplyLibraries,
        moduleQuickReplySourceModuleId: panelDerivedData.moduleQuickReplySourceModuleId,
        moduleQuickReplyAssignedLibraries: panelDerivedData.moduleQuickReplyAssignedLibraries,
        moduleQuickReplyAssignedLibraryIds: panelDerivedData.moduleQuickReplyAssignedLibraryIds,
        usersForSettingsTenant: usersController?.usersDerived?.usersForSettingsTenant || [],
        assignedModuleUsers: usersController?.usersDerived?.assignedModuleUsers || [],
        availableUsersForModulePicker: usersController?.usersDerived?.availableUsersForModulePicker || [],
        activeCatalogOptions: catalogController?.catalogDerived?.activeCatalogOptions || [],
        activeCatalogLabelMap: catalogController?.catalogDerived?.activeCatalogLabelMap || new Map(),
        activeAiAssistantOptions: aiController?.aiDerived?.activeAiAssistantOptions || [],
        defaultAiAssistantId: aiController?.aiDerived?.defaultAiAssistantId || '',
        aiAssistantLabelMap: aiController?.aiDerived?.aiAssistantLabelMap || new Map(),
        quickReplyLibraries: quickRepliesController?.quickRepliesState?.quickReplyLibraries || [],
        tenantOptions: tenantController?.tenantDerived?.tenantOptions || [],
        settingsTenantId: tenantController?.tenantState?.settingsTenantId || '',
        moduleKeys: MODULE_KEYS
    };

    const saveWaModule = useCallback(async () => {
        const cleanTenantId = String(modulesDerived.settingsTenantId || '').trim();
        const mode = String(modulesState.waModulePanelMode || '').trim().toLowerCase();
        const moduleInDetail = modulesDerived.selectedConfigModule;
        if (!cleanTenantId || !canEditModules || typeof requestJson !== 'function') {
            return;
        }
        const payload = buildWaModulePayload({
            waModuleForm: modulesState.waModuleForm,
            selectedConfigModule: moduleInDetail
        });
        const quickReplyLibraryIds = normalizeQuickReplyLibraryDraft(modulesState.moduleQuickReplyLibraryDraft);
        const label = mode === 'create' ? 'Modulo WA creado' : 'Modulo WA actualizado';

        try {
            await runWithFallback(runAction, label, async () => {
                if (mode === 'edit' && moduleInDetail?.moduleId) {
                    const updateUrl = `/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/wa-modules/${encodeURIComponent(moduleInDetail.moduleId)}`;
                    const updatePayload = await requestJson(updateUrl, {
                        method: 'PUT',
                        body: payload
                    });
                    if (typeof moduleActionsBase.syncQuickReplyLibrariesForModule === 'function') {
                        await moduleActionsBase.syncQuickReplyLibrariesForModule(moduleInDetail.moduleId, quickReplyLibraryIds);
                    }
                    modulesState.setWaModulePanelMode('view');
                    modulesState.setSelectedConfigKey(`wa_module:${moduleInDetail.moduleId}`);
                    if (typeof loadWaModules === 'function') await loadWaModules(cleanTenantId);
                    return;
                }

                const createUrl = `/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/wa-modules`;
                const createPayload = await requestJson(createUrl, {
                    method: 'POST',
                    body: payload
                });
                const createdModuleId = String(createPayload?.item?.moduleId || '').trim();
                if (createdModuleId) {
                    if (typeof moduleActionsBase.syncQuickReplyLibrariesForModule === 'function') {
                        await moduleActionsBase.syncQuickReplyLibrariesForModule(createdModuleId, quickReplyLibraryIds);
                    }
                    modulesState.setSelectedWaModuleId(createdModuleId);
                    modulesState.setSelectedConfigKey(`wa_module:${createdModuleId}`);
                }
                modulesState.setWaModulePanelMode('view');
                if (typeof loadWaModules === 'function') await loadWaModules(cleanTenantId);
            });
        } catch (error) {
            throw error;
        }
    }, [
        canEditModules,
        loadWaModules,
        moduleActionsBase,
        modulesDerived.selectedConfigModule,
        modulesDerived.settingsTenantId,
        modulesState,
        requestJson,
        runAction
    ]);

    const toggleWaModuleActive = useCallback(async (moduleItem = null) => {
        const cleanTenantId = String(modulesDerived.settingsTenantId || '').trim();
        const targetModule = moduleItem && typeof moduleItem === 'object'
            ? moduleItem
            : modulesDerived.selectedConfigModule;
        const moduleId = String(targetModule?.moduleId || '').trim();
        if (!cleanTenantId || !moduleId || !canEditModules || typeof requestJson !== 'function') return;

        await runWithFallback(runAction, 'Estado de modulo actualizado', async () => {
            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/wa-modules/${encodeURIComponent(moduleId)}`, {
                method: 'PUT',
                body: {
                    isActive: targetModule?.isActive === false,
                    imageUrl: String(targetModule?.imageUrl || '').trim() || null
                }
            });
            if (typeof loadWaModules === 'function') await loadWaModules(cleanTenantId);
        });
    }, [
        canEditModules,
        loadWaModules,
        modulesDerived.selectedConfigModule,
        modulesDerived.settingsTenantId,
        requestJson,
        runAction
    ]);

    const modulesActions = {
        ...moduleActionsBase,
        saveWaModule,
        toggleWaModuleActive
    };

    // Border/runtime inputs intentionally stay outside modulesActions domain ownership.
    void canEditTenantSettings;
    void busy;
    void setError;
    void handleFormImageUpload;
    void handleOpenOperation;
    void handleSectionChange;

    return {
        modulesState,
        modulesActions,
        modulesDerived
    };
}
