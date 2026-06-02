import React from 'react';
import { SaasEntityPage } from '../components/layout';
import AuditSettingsDetailPane from './modules-config/AuditSettingsDetailPane';
import DeviceAuthorizersSettingsDetailPane from './modules-config/DeviceAuthorizersSettingsDetailPane';
import DevicesSettingsDetailPane from './modules-config/DevicesSettingsDetailPane';
import GeneralSettingsDetailPane from './modules-config/GeneralSettingsDetailPane';
import ModulesConfigModuleDetailPane from './modules-config/ModulesConfigModuleDetailPane';
import SmtpSettingsDetailPane from './modules-config/SmtpSettingsDetailPane';

const CONFIG_KEYS = {
    TENANT_SETTINGS: 'tenant_settings',
    AUTH_DEVICES: 'auth_devices',
    SMTP_EMAIL: 'smtp_email',
    DEVICE_AUTHORIZERS: 'device_authorizers',
    AUDIT_LOGS: 'audit_logs'
};

function ModulesConfigSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
    isGeneralConfigSection,
    isModulesSection,
    settingsTenantId,
    loadTenantSettings,
    loadWaModules,
    requestJson,
    toTenantDisplayName,
    tenantOptions,
    busy,
    canEditModules,
    canViewModules = canEditModules,
    canViewTenantSettings = true,
    canViewOwnDevices = true,
    canRevokeOwnDevices = true,
    canViewAllDevices = false,
    canRevokeAllDevices = false,
    canViewAuditLogs = false,
    ensureSectionData = null,
    isLoading = null,
    getError = null,
    getReloadToken = null,
    forceReload = null,
    openConfigModuleCreate,
    openConfigSettingsView,
    setSelectedConfigKey,
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
    schedules,
    moduleQuickReplyLibraryDraft,
    activeQuickReplyLibraries,
    toggleQuickReplyLibraryForModuleDraft,
    moduleUserPickerId,
    setModuleUserPickerId,
    saveWaModule,
    handleFormImageUpload
    } = context;

    const lazySectionId = isModulesSection ? 'modules' : 'settings';
    const sectionReloadToken = typeof getReloadToken === 'function' ? getReloadToken(lazySectionId) : 0;
    const sectionLoading = typeof isLoading === 'function' && isLoading(lazySectionId);
    const sectionError = typeof getError === 'function' ? getError(lazySectionId) : '';
    const rows = React.useMemo(() => {
        if (isGeneralConfigSection) {
            return [{
                id: CONFIG_KEYS.TENANT_SETTINGS,
                name: 'Configuración general',
                phone: tenantSettings?.contactPhone || '-',
                status: tenantSettings?.enabled === false ? 'Inactiva' : 'Activa',
                channel: 'General',
                defaultLabel: 'Sí',
                assignedUsers: '-',
                updatedAt: formatDateTimeLabel?.(tenantSettings?.updatedAt) || '-'
            }, canViewOwnDevices ? {
                id: CONFIG_KEYS.AUTH_DEVICES,
                name: canViewAllDevices ? 'Dispositivos' : 'Mis dispositivos',
                phone: 'Sesion segura',
                status: 'Activa',
                channel: 'Seguridad',
                defaultLabel: 'No',
                assignedUsers: '-',
                updatedAt: '-'
            } : null, {
                id: CONFIG_KEYS.SMTP_EMAIL,
                name: 'Correo',
                phone: 'SMTP por tenant',
                status: 'Configurable',
                channel: 'Email',
                defaultLabel: 'No',
                assignedUsers: '-',
                updatedAt: '-'
            }, {
                id: CONFIG_KEYS.DEVICE_AUTHORIZERS,
                name: 'Autorizadores de acceso',
                phone: 'OTP por tenant',
                status: 'Configurable',
                channel: 'Seguridad',
                defaultLabel: 'No',
                assignedUsers: '-',
                updatedAt: '-'
            }, canViewAuditLogs ? {
                id: CONFIG_KEYS.AUDIT_LOGS,
                name: 'Auditoria',
                phone: 'Eventos de seguridad',
                status: 'Solo lectura',
                channel: 'Seguridad',
                defaultLabel: 'No',
                assignedUsers: '-',
                updatedAt: '-'
            } : null].filter(Boolean);
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
    }, [MODULE_KEYS, canViewAuditLogs, canViewOwnDevices, formatDateTimeLabel, isGeneralConfigSection, tenantSettings, waModules]);

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
            if (canViewTenantSettings && typeof loadTenantSettings === 'function') {
                await loadTenantSettings(settingsTenantId);
            }
            return;
        }
        if (isModulesSection) {
            const tasks = [];
            if (canViewTenantSettings && typeof loadTenantSettings === 'function') {
                tasks.push(loadTenantSettings(settingsTenantId));
            }
            if (canViewModules && typeof loadWaModules === 'function') {
                tasks.push(loadWaModules(settingsTenantId));
            }
            if (tasks.length > 0) await Promise.all(tasks);
        }
    }, [
        canViewModules,
        canViewTenantSettings,
        isGeneralConfigSection,
        isModulesSection,
        loadTenantSettings,
        loadWaModules,
        settingsTenantId
    ]);

    React.useEffect(() => {
        if (!(isGeneralConfigSection || isModulesSection)) return;
        if (typeof ensureSectionData !== 'function') {
            reloadSection().catch(() => {});
            return;
        }
        void ensureSectionData(
            lazySectionId,
            () => reloadSection(),
            {
                canLoad: Boolean(settingsTenantId && (isModulesSection ? canViewModules : canViewTenantSettings)),
                forceReload: sectionReloadToken > 0,
                reloadToken: sectionReloadToken,
                deps: [settingsTenantId, lazySectionId]
            }
        );
    }, [
        canViewModules,
        canViewTenantSettings,
        ensureSectionData,
        isGeneralConfigSection,
        isModulesSection,
        lazySectionId,
        reloadSection,
        sectionReloadToken,
        settingsTenantId
    ]);

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

            {canViewOwnDevices ? (
                <DevicesSettingsDetailPane
                    isGeneralConfigSection={isGeneralConfigSection}
                    selectedConfigKey={selectedConfigKey}
                    requestJson={requestJson}
                    formatDateTimeLabel={formatDateTimeLabel}
                    canRevokeOwnDevices={canRevokeOwnDevices}
                    canViewAllDevices={canViewAllDevices}
                    canRevokeAllDevices={canRevokeAllDevices}
                />
            ) : null}

            <SmtpSettingsDetailPane
                settingsTenantId={settingsTenantId}
                isGeneralConfigSection={isGeneralConfigSection}
                selectedConfigKey={selectedConfigKey}
                requestJson={requestJson}
            />

            <DeviceAuthorizersSettingsDetailPane
                settingsTenantId={settingsTenantId}
                isGeneralConfigSection={isGeneralConfigSection}
                selectedConfigKey={selectedConfigKey}
                requestJson={requestJson}
            />

            <AuditSettingsDetailPane
                settingsTenantId={settingsTenantId}
                isGeneralConfigSection={isGeneralConfigSection}
                selectedConfigKey={selectedConfigKey}
                requestJson={requestJson}
                formatDateTimeLabel={formatDateTimeLabel}
                canViewAuditLogs={canViewAuditLogs}
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
                    requestJson,
                    toggleCatalogForModule,
                    activeAiAssistantOptions,
                    schedules,
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
        canRevokeAllDevices,
        canRevokeOwnDevices,
        canViewAllDevices,
        canViewAuditLogs,
        canViewOwnDevices,
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
        requestJson,
        sanitizeAiAssistantCode,
        saveWaModule,
        selectedConfigKey,
        selectedConfigModule,
        setModuleUserPickerId,
        setWaModuleForm,
        settingsTenantId,
        schedules,
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
                {canEditModules ? (
                    <>
                        <button type="button" disabled={busy} onClick={openConfigModuleEdit}>
                            Editar
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleWaModuleActive(selectedConfigModule)}
                        >
                            {selectedConfigModule.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                    </>
                ) : null}
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
                if (isGeneralConfigSection) {
                    if (row?.id === CONFIG_KEYS.AUTH_DEVICES && canViewOwnDevices) {
                        setSelectedConfigKey?.(CONFIG_KEYS.AUTH_DEVICES);
                    } else if (row?.id === CONFIG_KEYS.SMTP_EMAIL) {
                        setSelectedConfigKey?.(CONFIG_KEYS.SMTP_EMAIL);
                    } else if (row?.id === CONFIG_KEYS.DEVICE_AUTHORIZERS) {
                        setSelectedConfigKey?.(CONFIG_KEYS.DEVICE_AUTHORIZERS);
                    } else if (row?.id === CONFIG_KEYS.AUDIT_LOGS && canViewAuditLogs) {
                        setSelectedConfigKey?.(CONFIG_KEYS.AUDIT_LOGS);
                    } else {
                        openConfigSettingsView?.();
                    }
                }
                else openConfigModuleView?.(row?.id);
            }}
            onClose={clearConfigSelection}
            renderDetail={renderDetail}
            renderForm={renderDetail}
            mode={isModulesSection && waModulePanelMode !== 'view' ? 'form' : 'detail'}
            dirty={isModulesSection && waModulePanelMode !== 'view'}
            requestJson={context.requestJson}
            loading={sectionLoading || (busy && rows.length === 0)}
            searchPlaceholder={isModulesSection ? 'Buscar módulo por nombre, código o teléfono...' : 'Buscar configuración...'}
            filters={filters}
            emptyText={sectionError || (isModulesSection ? 'No hay modulos registrados.' : 'No hay configuracion disponible.')}
            actions={[
                { label: sectionError ? 'Reintentar' : 'Recargar', onClick: () => { if (typeof forceReload === 'function') forceReload(lazySectionId); else void reloadSection(); }, disabled: busy || sectionLoading || !settingsTenantId },
                isModulesSection && canEditModules
                    ? { label: 'Nuevo', onClick: openConfigModuleCreate, disabled: busy || !settingsTenantId }
                    : null,
                isGeneralConfigSection
                    ? { label: 'Configuración general', onClick: openConfigSettingsView, disabled: busy || !settingsTenantId }
                    : null,
                isGeneralConfigSection && canViewOwnDevices
                    ? { label: canViewAllDevices ? 'Dispositivos' : 'Mis dispositivos', onClick: () => setSelectedConfigKey?.(CONFIG_KEYS.AUTH_DEVICES), disabled: busy }
                    : null,
                isGeneralConfigSection
                    ? { label: 'Correo', onClick: () => setSelectedConfigKey?.(CONFIG_KEYS.SMTP_EMAIL), disabled: busy || !settingsTenantId }
                    : null,
                isGeneralConfigSection
                    ? { label: 'Autorizadores', onClick: () => setSelectedConfigKey?.(CONFIG_KEYS.DEVICE_AUTHORIZERS), disabled: busy || !settingsTenantId }
                    : null,
                isGeneralConfigSection && canViewAuditLogs
                    ? { label: 'Auditoria', onClick: () => setSelectedConfigKey?.(CONFIG_KEYS.AUDIT_LOGS), disabled: busy || !settingsTenantId }
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



