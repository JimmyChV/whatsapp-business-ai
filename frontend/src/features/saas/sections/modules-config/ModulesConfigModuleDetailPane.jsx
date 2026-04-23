import React from 'react';
import ModulesConfigModuleReadView from './ModulesConfigModuleReadView';
import ModulesConfigModuleEditForm from './ModulesConfigModuleEditForm';

export default function ModulesConfigModuleDetailPane({ context = {} }) {
    const {
        settingsTenantId,
        isModulesSection,
        waModulePanelMode,
        selectedConfigModule,
        assignedModuleUsers,
        toUserDisplayName,
        usersForSettingsTenant,
        normalizeCatalogIdsList,
        activeCatalogLabelMap,
        sanitizeAiAssistantCode,
        aiAssistantLabelMap,
        handleOpenOperation,
        openConfigModuleEdit,
        toggleWaModuleActive,
        busy,
        canEditModules,
        buildInitials,
        formatDateTimeLabel,
        waModuleForm,
        setWaModuleForm,
        CATALOG_MODE_OPTIONS,
        availableUsersForModulePicker,
        toggleAssignedUserForModule,
        activeCatalogOptions,
        toggleCatalogForModule,
        activeAiAssistantOptions,
        moduleQuickReplyLibraryDraft,
        activeQuickReplyLibraries,
        toggleQuickReplyLibraryForModuleDraft,
        moduleUserPickerId,
        setModuleUserPickerId,
        saveWaModule,
        handleFormImageUpload,
        openConfigModuleView,
        clearConfigSelection
    } = context;

    if (!(settingsTenantId && isModulesSection && (waModulePanelMode === 'create' || selectedConfigModule))) {
        return null;
    }

    const moduleInDetail = waModulePanelMode === 'create' ? null : selectedConfigModule;
    const isModuleEditing = waModulePanelMode === 'edit' || waModulePanelMode === 'create';
    const assignedLabels = isModuleEditing
        ? assignedModuleUsers.map((user) => toUserDisplayName(user))
        : (moduleInDetail?.assignedUserIds || []).map((userId) => {
            const match = usersForSettingsTenant.find((user) => String(user?.id || '').trim() === String(userId || '').trim());
            return match ? toUserDisplayName(match) : 'Usuario no disponible';
        });
    const moduleCloudConfig = moduleInDetail?.cloudConfig && typeof moduleInDetail.cloudConfig === 'object'
        ? moduleInDetail.cloudConfig
        : {};
    const moduleCatalogIds = normalizeCatalogIdsList(moduleInDetail?.catalogIds || []);
    const moduleCatalogLabels = moduleCatalogIds.map((catalogId) => activeCatalogLabelMap.get(catalogId) || catalogId);
    const moduleAssistantId = sanitizeAiAssistantCode(moduleInDetail?.moduleAiAssistantId || '');
    const moduleAssistantLabel = moduleAssistantId
        ? (aiAssistantLabelMap.get(moduleAssistantId) || moduleAssistantId)
        : 'Asistente principal del tenant';

    return (
        <>
            {!isModuleEditing && moduleInDetail && (
                <ModulesConfigModuleReadView
                    moduleInDetail={moduleInDetail}
                    assignedLabels={assignedLabels}
                    moduleCatalogLabels={moduleCatalogLabels}
                    moduleAssistantLabel={moduleAssistantLabel}
                    moduleCloudConfig={moduleCloudConfig}
                    buildInitials={buildInitials}
                    formatDateTimeLabel={formatDateTimeLabel}
                />
            )}

            {isModuleEditing && (
                <ModulesConfigModuleEditForm
                    settingsTenantId={settingsTenantId}
                    busy={busy}
                    canEditModules={canEditModules}
                    waModuleForm={waModuleForm}
                    setWaModuleForm={setWaModuleForm}
                    CATALOG_MODE_OPTIONS={CATALOG_MODE_OPTIONS}
                    sanitizeAiAssistantCode={sanitizeAiAssistantCode}
                    activeAiAssistantOptions={activeAiAssistantOptions}
                    activeCatalogOptions={activeCatalogOptions}
                    normalizeCatalogIdsList={normalizeCatalogIdsList}
                    toggleCatalogForModule={toggleCatalogForModule}
                    activeQuickReplyLibraries={activeQuickReplyLibraries}
                    moduleQuickReplyLibraryDraft={moduleQuickReplyLibraryDraft}
                    toggleQuickReplyLibraryForModuleDraft={toggleQuickReplyLibraryForModuleDraft}
                    handleFormImageUpload={handleFormImageUpload}
                    moduleUserPickerId={moduleUserPickerId}
                    setModuleUserPickerId={setModuleUserPickerId}
                    availableUsersForModulePicker={availableUsersForModulePicker}
                    toUserDisplayName={toUserDisplayName}
                    toggleAssignedUserForModule={toggleAssignedUserForModule}
                    assignedModuleUsers={assignedModuleUsers}
                    waModulePanelMode={waModulePanelMode}
                    moduleInDetail={moduleInDetail}
                    saveWaModule={saveWaModule}
                    openConfigModuleView={openConfigModuleView}
                    clearConfigSelection={clearConfigSelection}
                />
            )}
        </>
    );
}
