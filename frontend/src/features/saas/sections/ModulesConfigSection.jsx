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
    loadTenantSettings,
    loadWaModules,
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
                name: 'Configuración general',
                phone: tenantSettings?.contactPhone || '-',
                status: tenantSettings?.enabled === false ? 'Inactiva' : 'Activa',
                channel: 'General',
                defaultLabel: 'Sí',
                assignedUsers: '-',
                updatedAt: formatDateTimeLabel?.(tenantSettings?.updatedAt) || '-'
            }];
        }
        return (Array.isArray(waModules) ? waModules : []).map((module) => ({
            id: module?.moduleId || module?.id || module?.code,
            name: module?.name || module?.moduleName || module?.moduleId || '-',
            phone: module?.phoneE164 || module?.phone || '-',
            status: module?.isActive === false || module?.active === false ? 'Inactivo' : 'Activo',
            channel: module?.channel || module?.type || module?.catalogMode || module?.mode || 'Módulo',
            defaultLabel: module?.isDefault ? 'Sí' : 'No',
            assignedUsers: String((Array.isArray(module?.assignedUserIds) ? module.assignedUserIds.length : Array.isArray(module?.userIds) ? module.userIds.length : 0)),
            updatedAt: formatDateTimeLabel?.(module?.updatedAt) || '-',
            raw: module
        }));
    }, [MODULE_KEYS, formatDateTimeLabel, isGeneralConfigSection, tenantSettings, waModules]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Nombre', width: '32%', minWidth: '240px', sortable: true },
        { key: 'phone', label: 'Teléfono', width: '24%', minWidth: '180px', sortable: true },
        { key: 'channel', label: 'Canal', width: '20%', minWidth: '160px', sortable: true },
        { key: 'status', label: 'Estado', width: '18%', minWidth: '120px', sortable: true },
        { key: 'defaultLabel', label: 'Por Defecto', width: '16%', minWidth: '140px', sortable: true, hidden: true },
        { key: 'assignedUsers', label: 'Usuarios Asignados', width: '18%', minWidth: '170px', sortable: true, hidden: true },
        { key: 'updatedAt', label: 'Actualizado', width: '18%', minWidth: '160px', sortable: true, hidden: true }
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

    const reloadSection = React.useCallback(async () => {
        if (!settingsTenantId) return;
        if (isGeneralConfigSection) {
            await loadTenantSettings?.(settingsTenantId);
            return;
        }
        if (isModulesSection) {
            await Promise.all([
                loadTenantSettings?.(settingsTenantId),
                loadWaModules?.(settingsTenantId)
            ]);
        }
    }, [isGeneralConfigSection, isModulesSection, loadTenantSettings, loadWaModules, settingsTenantId]);

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
            title={isModulesSection ? 'MÓDULOS' : 'CONFIGURACIÓN'}
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
            searchPlaceholder={isModulesSection ? 'Buscar módulo por nombre, código o teléfono...' : 'Buscar configuración...'}
            filters={filters}
            emptyText={isModulesSection ? 'No hay modulos registrados.' : 'No hay configuracion disponible.'}
            actions={[
                { label: 'Recargar', onClick: () => { void reloadSection(); }, disabled: busy || !settingsTenantId },
                isModulesSection && canEditModules
                    ? { label: 'Nuevo', onClick: openConfigModuleCreate, disabled: busy || !settingsTenantId }
                    : null,
                isGeneralConfigSection
                    ? { label: 'Configuración general', onClick: openConfigSettingsView, disabled: busy || !settingsTenantId }
                    : null
            ].filter(Boolean)}
            detailTitle={isModulesSection
                ? (waModulePanelMode === 'create' ? 'Nuevo modulo' : (selectedConfigModule?.name || 'Detalle de modulo'))
                : 'Configuración general'}
            detailSubtitle={settingsTenantId
                ? `Empresa: ${toTenantDisplayName?.(tenantOptions?.find((tenant) => tenant.id === settingsTenantId) || {}) || settingsTenantId}`
                : 'Selecciona una empresa para continuar.'}
            detailActions={detailActions}
        />
    );
}

export default React.memo(ModulesConfigSection);



