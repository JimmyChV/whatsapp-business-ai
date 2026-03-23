import React from 'react';
import ModulesConfigMasterPane from './modules-config/ModulesConfigMasterPane';
import GeneralSettingsDetailPane from './modules-config/GeneralSettingsDetailPane';
import ModulesConfigModuleDetailPane from './modules-config/ModulesConfigModuleDetailPane';
import ModulesConfigDetailEmptyState from './modules-config/ModulesConfigDetailEmptyState';

function ModulesConfigSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
    isGeneralConfigSection,
    isModulesSection,
    settingsTenantId,
    toTenantDisplayName,
    tenantOptions,
    busy,
    canEditModules,
    openConfigModuleCreate,
    openConfigSettingsView,
    clearConfigSelection,
    tenantSettings,
    MODULE_KEYS,
    waModules,
    selectedConfigKey,
    openConfigModuleView,
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
    runAction,
    requestJson,
    tenantSettingsPanelMode,
    CATALOG_MODE_OPTIONS,
    formatDateTimeLabel,
    buildInitials,
    waModuleForm,
    setWaModuleForm,
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
    syncQuickReplyLibrariesForModule,
    handleFormImageUpload,
    setWaModulePanelMode,
    setSelectedWaModuleId,
    setSelectedConfigKey
    } = context;
    if (!(isGeneralConfigSection || isModulesSection)) {
        return null;
    }

    return (
        <section id={isModulesSection ? 'saas_modulos' : 'saas_config'} className="saas-admin-card saas-admin-card--full">
            <div className="saas-admin-master-detail">
                <ModulesConfigMasterPane
                    isModulesSection={isModulesSection}
                    isGeneralConfigSection={isGeneralConfigSection}
                    settingsTenantId={settingsTenantId}
                    toTenantDisplayName={toTenantDisplayName}
                    tenantOptions={tenantOptions}
                    busy={busy}
                    canEditModules={canEditModules}
                    openConfigModuleCreate={openConfigModuleCreate}
                    openConfigSettingsView={openConfigSettingsView}
                    clearConfigSelection={clearConfigSelection}
                    tenantSettings={tenantSettings}
                    MODULE_KEYS={MODULE_KEYS}
                    waModules={waModules}
                    selectedConfigKey={selectedConfigKey}
                    openConfigModuleView={openConfigModuleView}
                />

                <div className="saas-admin-detail-pane">
                    <ModulesConfigDetailEmptyState
                        settingsTenantId={settingsTenantId}
                        isModulesSection={isModulesSection}
                        isGeneralConfigSection={isGeneralConfigSection}
                        selectedConfigKey={selectedConfigKey}
                        waModulePanelMode={waModulePanelMode}
                    />

                    <GeneralSettingsDetailPane
                        settingsTenantId={settingsTenantId}
                        isGeneralConfigSection={isGeneralConfigSection}
                        selectedConfigKey={selectedConfigKey}
                        tenantSettingsPanelMode={tenantSettingsPanelMode}
                        tenantSettings={tenantSettings}
                        MODULE_KEYS={MODULE_KEYS}
                    />

                    <ModulesConfigModuleDetailPane
                        context={{
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
                            runAction,
                            requestJson,
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
                            syncQuickReplyLibrariesForModule,
                            handleFormImageUpload,
                            setWaModulePanelMode,
                            setSelectedWaModuleId,
                            setSelectedConfigKey,
                            openConfigModuleView,
                            clearConfigSelection
                        }}
                    />
                </div>
            </div>
        </section>
    );
}

export default React.memo(ModulesConfigSection);



