import React from 'react';

export default function ModulesConfigDetailEmptyState({
    settingsTenantId,
    isModulesSection,
    isGeneralConfigSection,
    selectedConfigKey,
    waModulePanelMode
}) {
    if (!settingsTenantId) {
        return (
            <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                <h4>{isModulesSection ? 'MÓDULOS POR EMPRESA' : 'CONFIGURACIÓN POR EMPRESA'}</h4>
                <p>Selecciona una empresa en el panel izquierdo para ver el detalle.</p>
            </div>
        );
    }

    if (selectedConfigKey || !(isGeneralConfigSection || (isModulesSection && waModulePanelMode !== 'create'))) {
        return null;
    }

    return (
        <div className="saas-admin-empty-state saas-admin-empty-state--detail">
            <h4>Sin elemento seleccionado</h4>
            <p>{isModulesSection ? 'Selecciona un modulo WhatsApp para ver su detalle.' : 'Selecciona el perfil de empresa para ver su detalle.'}</p>
        </div>
    );
}
