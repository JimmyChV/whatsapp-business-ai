import React from 'react';

function formatNumber(value = 0) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '0';
    return numeric.toLocaleString('es-PE');
}

function CampaignsSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isCampaignsSection = false,
        tenantScopeLocked = false,
        campaignsController = null
    } = context;

    if (!isCampaignsSection) return null;

    const campaigns = Array.isArray(campaignsController?.campaigns) ? campaignsController.campaigns : [];
    const selectedCampaign = campaignsController?.selectedCampaign || null;
    const loading = campaignsController?.loading === true;

    return (
        <section id="saas_campaigns" className="saas-admin-card saas-admin-card--full">
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Campanas</h3>
                    <small>Seguimiento de campanas masivas de WhatsApp.</small>
                </div>
            </div>

            {tenantScopeLocked && (
                <div className="saas-admin-empty-state">
                    <p>Selecciona una empresa para gestionar campanas.</p>
                </div>
            )}

            {!tenantScopeLocked && loading && (
                <div className="saas-admin-empty-state">
                    <p>Cargando campanas...</p>
                </div>
            )}

            {!tenantScopeLocked && !loading && !campaignsController && (
                <div className="saas-admin-empty-state">
                    <p>Campanas restaurado en navegacion. El controlador se conectara en el siguiente paso.</p>
                </div>
            )}

            {!tenantScopeLocked && !loading && campaignsController && campaigns.length === 0 && (
                <div className="saas-admin-empty-state">
                    <p>No hay campanas creadas para este tenant.</p>
                </div>
            )}

            {!tenantScopeLocked && !loading && campaignsController && campaigns.length > 0 && (
                <div className="saas-admin-related-list">
                    {campaigns.map((item = {}, index) => {
                        const campaignId = String(item.campaignId || item.campaign_id || `campaign-${index}`).trim();
                        const status = String(item.status || '').trim() || 'draft';
                        const eligible = Number(item.eligibleCount || item.eligible_count || 0) || 0;
                        const sent = Number(item.sentCount || item.sent_count || 0) || 0;
                        return (
                            <div key={campaignId} className="saas-admin-related-row" role="status">
                                <span>{item.name || campaignId}</span>
                                <small>{status} | {formatNumber(sent)}/{formatNumber(eligible)}</small>
                            </div>
                        );
                    })}
                </div>
            )}

            {!tenantScopeLocked && selectedCampaign && (
                <div className="saas-admin-related-block">
                    <h4>Detalle</h4>
                    <div className="saas-admin-related-row" role="status">
                        <span>Campana seleccionada</span>
                        <small>{selectedCampaign?.name || selectedCampaign?.campaignId || '-'}</small>
                    </div>
                </div>
            )}
        </section>
    );
}

export default React.memo(CampaignsSection);
