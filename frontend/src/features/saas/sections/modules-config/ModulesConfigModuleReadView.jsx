import React from 'react';

export default function ModulesConfigModuleReadView({
    moduleInDetail,
    assignedLabels,
    moduleCatalogLabels,
    moduleAssistantLabel,
    moduleCloudConfig,
    buildInitials,
    formatDateTimeLabel
}) {
    if (!moduleInDetail) {
        return null;
    }

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
                <div className="saas-admin-detail-field"><span>Codigo</span><strong>{moduleInDetail.moduleId || '-'}</strong></div>
                <div className="saas-admin-detail-field"><span>Transporte</span><strong>Cloud API</strong></div>
                <div className="saas-admin-detail-field"><span>Telefono</span><strong>{moduleInDetail.phoneNumber || 'Sin numero'}</strong></div>
                <div className="saas-admin-detail-field"><span>Estado</span><strong>{moduleInDetail.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                <div className="saas-admin-detail-field"><span>Usuarios asignados</span><strong>{assignedLabels.length}</strong></div>
                <div className="saas-admin-detail-field"><span>Catalogos asignados</span><strong>{moduleCatalogLabels.length}</strong></div>
                <div className="saas-admin-detail-field"><span>Asistente IA</span><strong>{moduleAssistantLabel}</strong></div>
                <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(moduleInDetail.updatedAt)}</strong></div>
            </div>

            {moduleInDetail.imageUrl && (
                <div className="saas-admin-preview-strip">
                    <img src={moduleInDetail.imageUrl} alt={moduleInDetail.name || 'Modulo'} className="saas-admin-preview-thumb" />
                </div>
            )}

            <div className="saas-admin-related-block">
                <h4>Usuarios del modulo</h4>
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
                <h4>Catalogos del modulo</h4>
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
                <h4>Configuracion Meta Cloud</h4>
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
