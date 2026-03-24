import React from 'react';

export default function ModulesConfigMasterPane({
    isModulesSection,
    isGeneralConfigSection,
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
    openConfigModuleView
}) {
    return (
        <aside className="saas-admin-master-pane">
            <div className="saas-admin-pane-header">
                <h3>{isModulesSection ? 'Modulos' : 'Configuracion general'}</h3>
                <small>
                    {settingsTenantId
                        ? `Empresa: ${toTenantDisplayName(tenantOptions.find((tenant) => tenant.id === settingsTenantId) || {})}`
                        : 'Selecciona una empresa para administrar su panel.'}
                </small>
            </div>

            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                {isModulesSection && (
                    <button type="button" disabled={busy || !settingsTenantId || !canEditModules} onClick={openConfigModuleCreate}>
                        Nuevo modulo
                    </button>
                )}
                {isGeneralConfigSection && (
                    <button type="button" disabled={busy || !settingsTenantId} onClick={openConfigSettingsView}>
                        Abrir configuracion general
                    </button>
                )}
                <button type="button" disabled={busy} onClick={clearConfigSelection}>
                    Deseleccionar
                </button>
            </div>

            <div className="saas-admin-list saas-admin-list--compact">
                {!settingsTenantId && (
                    <div className="saas-admin-empty-state">
                        <h4>Sin empresa seleccionada</h4>
                        <p>Elige una empresa para ver su configuracion.</p>
                    </div>
                )}

                {settingsTenantId && isGeneralConfigSection && (
                    <button
                        type="button"
                        className={`saas-admin-list-item saas-admin-list-item--button ${selectedConfigKey === 'tenant_settings' ? 'active' : ''}`.trim()}
                        onClick={openConfigSettingsView}
                    >
                        <strong>Perfil de empresa</strong>
                        <small>Catalogo: {tenantSettings.catalogMode}</small>
                        <small>Modulos habilitados: {MODULE_KEYS.filter((entry) => tenantSettings?.enabledModules?.[entry.key] !== false).length}/{MODULE_KEYS.length}</small>
                    </button>
                )}

                {settingsTenantId && isModulesSection && waModules.length === 0 && (
                    <div className="saas-admin-empty-inline">Sin modulos WhatsApp configurados.</div>
                )}

                {settingsTenantId && isModulesSection && waModules.map((moduleItem) => (
                    <button
                        key={moduleItem.moduleId}
                        type="button"
                        className={`saas-admin-list-item saas-admin-list-item--button ${selectedConfigKey === `wa_module:${moduleItem.moduleId}` ? 'active' : ''}`.trim()}
                        onClick={() => openConfigModuleView(moduleItem.moduleId)}
                    >
                        <strong>{moduleItem.name || 'Modulo sin nombre'}</strong>
                        <small>Cloud API | {moduleItem.isActive ? 'activo' : 'inactivo'}</small>
                        <small>{moduleItem.phoneNumber ? `Numero: ${moduleItem.phoneNumber}` : 'Numero sin configurar'}</small>
                    </button>
                ))}
            </div>
        </aside>
    );
}

