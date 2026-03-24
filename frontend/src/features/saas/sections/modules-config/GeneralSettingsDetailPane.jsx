import React from 'react';

export default function GeneralSettingsDetailPane({
    settingsTenantId,
    isGeneralConfigSection,
    selectedConfigKey,
    tenantSettingsPanelMode,
    tenantSettings,
    MODULE_KEYS
}) {
    if (!(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'tenant_settings')) {
        return null;
    }

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Perfil de empresa</h3>
                    <small>{tenantSettingsPanelMode === 'edit' ? 'Edicion activa' : 'Vista de solo lectura'}</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row" />
            </div>

            {tenantSettingsPanelMode === 'view' && (
                <>
                    <div className="saas-admin-detail-grid">
                        <div className="saas-admin-detail-field"><span>Catalogo</span><strong>{tenantSettings.catalogMode}</strong></div>
                        <div className="saas-admin-detail-field"><span>Modulos habilitados</span><strong>{MODULE_KEYS.filter((entry) => tenantSettings?.enabledModules?.[entry.key] !== false).length}</strong></div>
                    </div>
                    <div className="saas-admin-related-block">
                        <h4>Estado funcional</h4>
                        <div className="saas-admin-related-list">
                            {MODULE_KEYS.map((entry) => (
                                <div key={`cfg_enabled_${entry.key}`} className="saas-admin-related-row" role="status">
                                    <span>{entry.label}</span>
                                    <small>{tenantSettings?.enabledModules?.[entry.key] !== false ? 'Habilitado' : 'Deshabilitado'}</small>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
