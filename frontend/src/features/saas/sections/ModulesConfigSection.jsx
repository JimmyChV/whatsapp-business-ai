import React from 'react';
import { SaasEntityPage } from '../components/layout';
import GeneralSettingsDetailPane from './modules-config/GeneralSettingsDetailPane';
import ModulesConfigModuleDetailPane from './modules-config/ModulesConfigModuleDetailPane';

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
    toggleWaModuleActive,
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
    saveWaModule,
    handleFormImageUpload
    } = context;

    const rows = React.useMemo(() => {
        if (isGeneralConfigSection) {
            return [{
                id: MODULE_KEYS?.GENERAL || 'general',
                name: 'Configuracion general',
                phone: tenantSettings?.contactPhone || '-',
                status: tenantSettings?.enabled === false ? 'Inactiva' : 'Activa',
                type: 'General'
            }];
        }
        return (Array.isArray(waModules) ? waModules : []).map((module) => ({
            id: module?.moduleId || module?.id || module?.code,
            name: module?.name || module?.moduleName || module?.moduleId || '-',
            phone: module?.phoneE164 || module?.phone || '-',
            status: module?.isActive === false || module?.active === false ? 'Inactivo' : 'Activo',
            type: module?.catalogMode || module?.mode || 'Modulo',
            raw: module
        }));
    }, [MODULE_KEYS, isGeneralConfigSection, tenantSettings, waModules]);

    const columns = React.useMemo(() => [
        { key: 'name', label: isGeneralConfigSection ? 'Configuracion' : 'Modulo', width: '32%', minWidth: '240px', sortable: true },
        { key: 'phone', label: 'Telefono', width: '24%', minWidth: '180px', sortable: true },
        { key: 'type', label: 'Tipo', width: '20%', minWidth: '160px', sortable: true },
        { key: 'status', label: 'Estado', width: '18%', minWidth: '120px', sortable: true }
    ], [isGeneralConfigSection]);

    const filters = React.useMemo(() => [
        {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'Activo', label: 'Activo' },
                { value: 'Inactivo', label: 'Inactivo' }
            ]
        }
    ], []);

    const selectedEntityId = React.useMemo(() => {
        if (isModulesSection && waModulePanelMode === 'create') return '__create_module__';
        return selectedConfigKey || '';
    }, [isModulesSection, selectedConfigKey, waModulePanelMode]);

    const renderDetail = React.useCallback(() => (
        <>
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
                }}
            />
        </>
    ), [
        CATALOG_MODE_OPTIONS,
        MODULE_KEYS,
        activeAiAssistantOptions,
        activeCatalogLabelMap,
        activeCatalogOptions,
        activeQuickReplyLibraries,
        aiAssistantLabelMap,
        assignedModuleUsers,
        availableUsersForModulePicker,
        buildInitials,
        busy,
        canEditModules,
        clearConfigSelection,
        formatDateTimeLabel,
        handleFormImageUpload,
        handleOpenOperation,
        isGeneralConfigSection,
        isModulesSection,
        moduleQuickReplyLibraryDraft,
        moduleUserPickerId,
        normalizeCatalogIdsList,
        openConfigModuleEdit,
        openConfigModuleView,
        sanitizeAiAssistantCode,
        saveWaModule,
        selectedConfigKey,
        selectedConfigModule,
        setModuleUserPickerId,
        setWaModuleForm,
        settingsTenantId,
        tenantSettings,
        tenantSettingsPanelMode,
        toUserDisplayName,
        toggleAssignedUserForModule,
        toggleCatalogForModule,
        toggleQuickReplyLibraryForModuleDraft,
        toggleWaModuleActive,
        usersForSettingsTenant,
        waModuleForm,
        waModulePanelMode
    ]);
    const detailActions = React.useMemo(() => {
        if (!isModulesSection || waModulePanelMode !== 'view' || !selectedConfigModule) return null;
        return (
            <>
                <button
                    type="button"
                    disabled={busy || !selectedConfigModule.isActive}
                    onClick={() => handleOpenOperation()}
                >
                    Ir a operacion
                </button>
                <button type="button" disabled={busy || !canEditModules} onClick={openConfigModuleEdit}>
                    Editar
                </button>
                <button
                    type="button"
                    disabled={busy || !canEditModules}
                    onClick={() => toggleWaModuleActive(selectedConfigModule)}
                >
                    {selectedConfigModule.isActive ? 'Desactivar' : 'Activar'}
                </button>
            </>
        );
    }, [
        busy,
        canEditModules,
        handleOpenOperation,
        isModulesSection,
        openConfigModuleEdit,
        selectedConfigModule,
        toggleWaModuleActive,
        waModulePanelMode
    ]);

    if (!(isGeneralConfigSection || isModulesSection)) {
        return null;
    }

    return (
        <SaasEntityPage
            id={isModulesSection ? 'saas_modulos' : 'saas_config'}
            sectionKey={isModulesSection ? 'saas_modulos' : 'saas_config'}
            title={isModulesSection ? 'Modulos' : 'Configuracion'}
            rows={rows}
            columns={columns}
            selectedId={selectedEntityId}
            onSelect={(row) => {
                if (isGeneralConfigSection) openConfigSettingsView?.();
                else openConfigModuleView?.(row?.id);
            }}
            onClose={clearConfigSelection}
            renderDetail={renderDetail}
            renderForm={renderDetail}
            mode={isModulesSection && waModulePanelMode !== 'view' ? 'form' : 'detail'}
            dirty={isModulesSection && waModulePanelMode !== 'view'}
            requestJson={context.requestJson}
            loading={busy && rows.length === 0}
            searchPlaceholder={isModulesSection ? 'Buscar modulo por nombre, codigo o telefono' : 'Buscar configuracion'}
            filters={filters}
            emptyText={isModulesSection ? 'No hay modulos registrados.' : 'No hay configuracion disponible.'}
            actions={[
                isModulesSection && canEditModules
                    ? { label: 'Nuevo modulo', onClick: openConfigModuleCreate, disabled: busy || !settingsTenantId }
                    : null,
                isGeneralConfigSection
                    ? { label: 'Configuracion general', onClick: openConfigSettingsView, disabled: busy || !settingsTenantId }
                    : null
            ].filter(Boolean)}
            detailTitle={isModulesSection
                ? (waModulePanelMode === 'create' ? 'Nuevo modulo' : (selectedConfigModule?.name || 'Detalle de modulo'))
                : 'Configuracion general'}
            detailSubtitle={settingsTenantId
                ? `Empresa: ${toTenantDisplayName?.(tenantOptions?.find((tenant) => tenant.id === settingsTenantId) || {}) || settingsTenantId}`
                : 'Selecciona una empresa para continuar.'}
            detailActions={detailActions}
        />
    );
}

export default React.memo(ModulesConfigSection);



