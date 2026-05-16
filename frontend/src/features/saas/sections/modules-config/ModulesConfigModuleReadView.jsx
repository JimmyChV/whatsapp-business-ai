import React from 'react';

export default function ModulesConfigModuleReadView({
    moduleInDetail,
    assignedLabels,
    moduleCatalogLabels,
    moduleAssistantLabel,
    moduleCloudConfig,
    selectedSchedule,
    buildInitials,
    formatDateTimeLabel
}) {
    if (!moduleInDetail) {
        return null;
    }

    const aiConfig = moduleInDetail.aiConfig && typeof moduleInDetail.aiConfig === 'object'
        ? moduleInDetail.aiConfig
        : {};
    const scheduleLabel = selectedSchedule?.name || (moduleInDetail.scheduleId ? 'Horario no disponible' : 'Sin horario asignado');
    const withinHoursModeLabel = aiConfig.withinHoursMode === 'autonomous'
        ? 'Autonomo (responde solo)'
        : (aiConfig.withinHoursMode === 'off' ? 'Desactivado' : 'Sugerencias (pendiente aprobacion)');
    const outsideHoursModeLabel = aiConfig.outsideHoursMode === 'autonomous'
        ? 'Autonomo (responde solo)'
        : (aiConfig.outsideHoursMode === 'off' ? 'Desactivado' : 'Sugerencias (pendiente aprobacion)');
    const waitSeconds = Number.isFinite(Number(aiConfig.waitSeconds))
        ? Math.max(5, Math.min(300, Number(aiConfig.waitSeconds)))
        : (Number.isFinite(Number(aiConfig.waitMinutes)) ? Math.max(5, Math.min(300, Number(aiConfig.waitMinutes) * 60)) : 15);

    return (
        <>
            <div className="saas-admin-hero">
                <div className="saas-admin-hero-media">
                    {moduleInDetail.imageUrl
                        ? <img src={moduleInDetail.imageUrl} alt={moduleInDetail.name || 'Modulo'} className="saas-admin-hero-image" />
                        : <div className="saas-admin-hero-placeholder">{buildInitials(moduleInDetail.name || moduleInDetail.moduleId)}</div>}
                </div>
                <div className="saas-admin-hero-content">
                    <h4>{moduleInDetail.name || 'Modulo sin nombre'}</h4>
                    <p>{moduleInDetail.phoneNumber || 'Sin numero vinculado'}</p>
                </div>
            </div>
            <div className="saas-admin-detail-grid">
                <div className="saas-admin-detail-field"><span>CODIGO</span><strong>{moduleInDetail.moduleId || '-'}</strong></div>
                <div className="saas-admin-detail-field"><span>TRANSPORTE</span><strong>Cloud API</strong></div>
                <div className="saas-admin-detail-field"><span>TELEFONO</span><strong>{moduleInDetail.phoneNumber || 'Sin numero'}</strong></div>
                <div className="saas-admin-detail-field"><span>ESTADO</span><strong>{moduleInDetail.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                <div className="saas-admin-detail-field"><span>USUARIOS ASIGNADOS</span><strong>{assignedLabels.length}</strong></div>
                <div className="saas-admin-detail-field"><span>CATALOGOS ASIGNADOS</span><strong>{moduleCatalogLabels.length}</strong></div>
                <div className="saas-admin-detail-field"><span>ASISTENTE IA</span><strong>{moduleAssistantLabel}</strong></div>
                <div className="saas-admin-detail-field"><span>HORARIO</span><strong>{scheduleLabel}</strong></div>
                <div className="saas-admin-detail-field"><span>ACTUALIZADO</span><strong>{formatDateTimeLabel(moduleInDetail.updatedAt)}</strong></div>
            </div>

            {moduleInDetail.imageUrl && (
                <div className="saas-admin-preview-strip">
                    <img src={moduleInDetail.imageUrl} alt={moduleInDetail.name || 'Modulo'} className="saas-admin-preview-thumb" />
                </div>
            )}

            <div className="saas-admin-related-block">
                <h4>USUARIOS DEL MODULO</h4>
                <div className="saas-admin-related-list">
                    {assignedLabels.length === 0 && <div className="saas-admin-empty-inline">Sin usuarios asignados.</div>}
                    {assignedLabels.map((label, index) => (
                        <div key={`assigned_label_${index}`} className="saas-admin-related-row" role="status">
                            <span>{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="saas-admin-related-block">
                <h4>CATALOGOS DEL MODULO</h4>
                <div className="saas-admin-related-list">
                    {moduleCatalogLabels.length === 0 && <div className="saas-admin-empty-inline">Sin catalogos asignados.</div>}
                    {moduleCatalogLabels.map((label, index) => (
                        <div key={`module_catalog_label_${index}`} className="saas-admin-related-row" role="status">
                            <span>{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="saas-admin-related-block">
                <h4>HORARIO DEL MODULO</h4>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>HORARIO ASIGNADO</span><strong>{selectedSchedule?.name || 'Sin horario asignado'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ESTADO ACTUAL</span><strong>{selectedSchedule ? 'Ahora: segun horario configurado' : '-'}</strong></div>
                </div>
            </div>

            <div className="saas-admin-related-block">
                <h4>ASISTENTE IA</h4>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>NOMBRE</span><strong>{aiConfig.assistantName || 'Patty'}</strong></div>
                    <div className="saas-admin-detail-field"><span>PATTY</span><strong>{aiConfig.enablePatty === false ? 'Desactivada' : 'Activa'}</strong></div>
                    <div className="saas-admin-detail-field"><span>COPILOTO</span><strong>{aiConfig.enableCopilot === false ? 'Desactivado' : 'Activo'}</strong></div>
                    <div className="saas-admin-detail-field"><span>DENTRO DE HORARIO</span><strong>{withinHoursModeLabel}</strong></div>
                    <div className="saas-admin-detail-field"><span>FUERA DE HORARIO</span><strong>{outsideHoursModeLabel}</strong></div>
                    <div className="saas-admin-detail-field"><span>TIEMPO DE ESPERA</span><strong>{waitSeconds} seg</strong></div>
                </div>
            </div>

            <div className="saas-admin-related-block">
                <h4>CONFIGURACION META CLOUD</h4>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>META_APP_ID</span><strong>{moduleCloudConfig.appId || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_WABA_ID</span><strong>{moduleCloudConfig.wabaId || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_WABA_PHONE_NUMBER_ID</span><strong>{moduleCloudConfig.phoneNumberId || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_VERIFY_TOKEN</span><strong>{moduleCloudConfig.verifyToken || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_GRAPH_VERSION</span><strong>{moduleCloudConfig.graphVersion || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_DISPLAY_PHONE_NUMBER</span><strong>{moduleCloudConfig.displayPhoneNumber || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_BUSINESS_NAME</span><strong>{moduleCloudConfig.businessName || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_ENFORCE_SIGNATURE</span><strong>{moduleCloudConfig.enforceSignature === false ? 'false' : 'true'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_APP_SECRET</span><strong>{moduleCloudConfig.appSecretMasked || 'No configurado'}</strong></div>
                    <div className="saas-admin-detail-field"><span>META_SYSTEM_USER_TOKEN</span><strong>{moduleCloudConfig.systemUserTokenMasked || 'No configurado'}</strong></div>
                </div>
            </div>
        </>
    );
}
