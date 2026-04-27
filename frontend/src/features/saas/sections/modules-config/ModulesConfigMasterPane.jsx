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
    const [search, setSearch] = React.useState('');
    const normalizedSearch = search.trim().toLowerCase();
    const filteredModules = React.useMemo(() => {
        if (!normalizedSearch) return waModules;
        return waModules.filter((moduleItem) => [
            moduleItem?.name,
            moduleItem?.moduleId,
            moduleItem?.phoneNumber,
            moduleItem?.isActive ? 'activo' : 'inactivo'
        ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)));
    }, [normalizedSearch, waModules]);

    return (
        <aside className="saas-admin-master-pane">
            <div className="saas-admin-pane-header">
                <h3>{isModulesSection ? 'MÓDULOS' : 'CONFIGURACIÓN GENERAL'}</h3>
                <small>
                    {settingsTenantId
                        ? `Empresa: ${toTenantDisplayName(tenantOptions.find((tenant) => tenant.id === settingsTenantId) || {})}`
                        : 'Selecciona una empresa para administrar su panel.'}
                </small>
            </div>

            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                {isModulesSection && (
                    <button type="button" disabled={busy || !settingsTenantId || !canEditModules} onClick={openConfigModuleCreate}>
                        Nuevo módulo
                    </button>
                )}
                {isGeneralConfigSection && (
                    <button type="button" disabled={busy || !settingsTenantId} onClick={openConfigSettingsView}>
                        Abrir configuración general
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
                        <p>Elige una empresa para ver su configuración.</p>
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
                        <small>Módulos habilitados: {MODULE_KEYS.filter((entry) => tenantSettings?.enabledModules?.[entry.key] !== false).length}/{MODULE_KEYS.length}</small>
                    </button>
                )}

                {settingsTenantId && isModulesSection && waModules.length === 0 && (
                    <div className="saas-admin-empty-inline">Sin modulos WhatsApp configurados.</div>
                )}

                {settingsTenantId && isModulesSection && waModules.length > 0 && (
                    <>
                        <div className="saas-admin-master-toolbar">
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Buscar módulo por nombre, código o teléfono..."
                            />
                            <button type="button">Columnas</button>
                        </div>
                        <div className="saas-admin-list-table-head saas-admin-list-table-head--modules">
                            <span>MÓDULO</span>
                            <span>TELÉFONO</span>
                            <span>ESTADO</span>
                        </div>
                        {filteredModules.length === 0 && (
                            <div className="saas-admin-empty-inline">No hay modulos para esta busqueda.</div>
                        )}
                        {filteredModules.map((moduleItem) => (
                            <button
                                key={moduleItem.moduleId}
                                type="button"
                                className={`saas-admin-list-item saas-admin-list-item--button saas-admin-list-item--table saas-admin-list-item--modules ${selectedConfigKey === `wa_module:${moduleItem.moduleId}` ? 'active' : ''}`.trim()}
                                onClick={() => openConfigModuleView(moduleItem.moduleId)}
                            >
                                <strong>{moduleItem.name || 'Módulo sin nombre'}</strong>
                                <span>{moduleItem.phoneNumber || '-'}</span>
                                <small>{moduleItem.isActive ? 'Activo' : 'Inactivo'}</small>
                            </button>
                        ))}
                    </>
                )}
            </div>
        </aside>
    );
}

