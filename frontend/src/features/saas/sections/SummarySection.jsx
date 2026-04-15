import React, { useMemo } from 'react';

function startOfCurrentWeek() {
    const now = new Date();
    const result = new Date(now);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() + diff);
    return result;
}

function SummarySection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        selectedSectionId,
        currentUserAvatarUrl,
        buildInitials,
        currentUserDisplayName,
        currentUserRoleLabel,
        currentUserEmail,
        activeTenantLabel,
        currentUserTenantCount,
        currentUserCapabilities,
        tenantScopeLocked,
        tenantScopeId,
        tenantOptions,
        customers = [],
        operationsSnapshot = {},
        campaignsController = null,
        metaTemplatesController = null,
        busy,
        isSectionEnabled,
        handleSectionChange
    } = context;

    if (selectedSectionId !== 'saas_resumen') {
        return null;
    }

    const customersCreatedThisWeek = useMemo(() => {
        const weekStart = startOfCurrentWeek().getTime();
        return (Array.isArray(customers) ? customers : []).filter((customer) => {
            const createdAt = Date.parse(customer?.createdAt || customer?.created_at || '');
            return Number.isFinite(createdAt) && createdAt >= weekStart;
        }).length;
    }, [customers]);

    const activeCampaignsCount = useMemo(() => {
        const items = Array.isArray(campaignsController?.campaigns)
            ? campaignsController.campaigns
            : Array.isArray(campaignsController?.items)
                ? campaignsController.items
                : [];
        return items.filter((campaign) => String(campaign?.status || '').trim().toLowerCase() === 'running').length;
    }, [campaignsController]);

    const approvedTemplatesCount = useMemo(() => {
        const items = Array.isArray(metaTemplatesController?.filteredItems)
            ? metaTemplatesController.filteredItems
            : [];
        return items.filter((template) => String(template?.status || '').trim().toLowerCase() === 'approved').length;
    }, [metaTemplatesController]);

    const activeChatsToday = Number(operationsSnapshot?.activeAssignments || 0);

    return (
        <section id="saas_resumen" className="saas-admin-card saas-admin-card--full saas-admin-flow-card">
            <div className="saas-admin-summary-top">
                <section className="saas-admin-profile-summary" aria-label="Resumen del usuario actual">
                    <div className="saas-admin-profile-summary__head">
                        <div className="saas-admin-profile-summary__avatar">
                            {currentUserAvatarUrl
                                ? <img src={currentUserAvatarUrl} alt={currentUserDisplayName} className="saas-admin-inline-avatar" />
                                : buildInitials(currentUserDisplayName)}
                        </div>
                        <div className="saas-admin-profile-summary__meta">
                            <strong>{currentUserDisplayName}</strong>
                            <span>{currentUserEmail}</span>
                        </div>
                    </div>
                    <div className="saas-admin-profile-summary__stats">
                        <div><small>Rol</small><strong>{currentUserRoleLabel}</strong></div>
                        <div><small>Empresas</small><strong>{currentUserTenantCount}</strong></div>
                        <div><small>Empresa activa</small><strong>{activeTenantLabel}</strong></div>
                    </div>
                    <div className="saas-admin-profile-summary__caps">
                        {currentUserCapabilities.length === 0 && <span className="saas-admin-profile-chip">Vista basica</span>}
                        {currentUserCapabilities.map((capability) => (
                            <span key={`user_cap_${capability}`} className="saas-admin-profile-chip">{capability}</span>
                        ))}
                    </div>
                </section>

                <section className="saas-admin-summary-focus" aria-label="Estado operativo">
                    <h3>Contexto operativo</h3>
                    <div className="saas-admin-summary-focus-grid">
                        <div className="saas-admin-detail-field">
                            <span>Alcance actual</span>
                            <strong>{tenantScopeLocked ? 'Seleccion pendiente' : activeTenantLabel}</strong>
                        </div>
                        <div className="saas-admin-detail-field">
                            <span>Plan</span>
                            <strong>{tenantOptions.find((tenant) => String(tenant?.id || '').trim() === tenantScopeId)?.plan || '-'}</strong>
                        </div>
                        <div className="saas-admin-detail-field">
                            <span>Estado del panel</span>
                            <strong>{tenantScopeLocked ? 'Bloqueado por tenant' : 'Listo para operar'}</strong>
                        </div>
                    </div>
                </section>
            </div>

            <div className="saas-admin-kpis saas-admin-kpis--embedded">
                <div className="saas-admin-kpi">
                    <small>Chats activos hoy</small>
                    <strong>{tenantScopeLocked ? 0 : activeChatsToday}</strong>
                </div>
                <div className="saas-admin-kpi">
                    <small>Clientes nuevos esta semana</small>
                    <strong>{tenantScopeLocked ? 0 : customersCreatedThisWeek}</strong>
                </div>
                <div className="saas-admin-kpi">
                    <small>Campanas activas</small>
                    <strong>{tenantScopeLocked ? 0 : activeCampaignsCount}</strong>
                </div>
                <div className="saas-admin-kpi">
                    <small>Templates aprobados</small>
                    <strong>{tenantScopeLocked ? 0 : approvedTemplatesCount}</strong>
                </div>
            </div>

            <div className="saas-admin-related-block">
                <h4>Acciones rapidas</h4>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={busy || !isSectionEnabled('saas_empresas')} onClick={() => handleSectionChange('saas_empresas')}>Gestionar empresas</button>
                    <button type="button" disabled={busy || !isSectionEnabled('saas_usuarios')} onClick={() => handleSectionChange('saas_usuarios')}>Gestionar usuarios</button>
                    <button type="button" disabled={busy || !isSectionEnabled('saas_modulos')} onClick={() => handleSectionChange('saas_modulos')}>Gestionar modulos</button>
                    <button type="button" disabled={busy || !isSectionEnabled('saas_config')} onClick={() => handleSectionChange('saas_config')}>Configuracion general</button>
                </div>
            </div>
        </section>
    );
}

export default React.memo(SummarySection);
