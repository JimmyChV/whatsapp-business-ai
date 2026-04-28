import React, { useMemo } from 'react';
import { SaasEntityPage } from '../components/layout';

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
        <SaasEntityPage
            id="saas_resumen"
            sectionKey="summary"
            className="saas-admin-flow-card saas-entity-page--summary"
        >
            <div className="saas-summary-shell">
                <div className="saas-summary-top">
                    <section className="saas-summary-card saas-summary-card--profile" aria-label="Resumen del usuario actual">
                        <div className="saas-summary-card__header">
                            <h3>Tu sesion</h3>
                            <span>Resumen del usuario y alcance actual.</span>
                        </div>
                        <div className="saas-summary-profile__head">
                            <div className="saas-summary-profile__avatar">
                                {currentUserAvatarUrl
                                    ? <img src={currentUserAvatarUrl} alt={currentUserDisplayName} className="saas-admin-inline-avatar" />
                                    : buildInitials(currentUserDisplayName)}
                            </div>
                            <div className="saas-summary-profile__meta">
                                <strong>{currentUserDisplayName}</strong>
                                <span>{currentUserEmail}</span>
                            </div>
                        </div>

                        <div className="saas-summary-profile__stats">
                            <div className="saas-summary-profile__stat">
                                <small>Rol</small>
                                <strong>{currentUserRoleLabel}</strong>
                            </div>
                            <div className="saas-summary-profile__stat">
                                <small>Empresas</small>
                                <strong>{currentUserTenantCount}</strong>
                            </div>
                            <div className="saas-summary-profile__stat saas-summary-profile__stat--span">
                                <small>Empresa activa</small>
                                <strong>{activeTenantLabel}</strong>
                            </div>
                        </div>

                        <div className="saas-summary-profile__caps">
                            {currentUserCapabilities.length === 0 && <span className="saas-admin-profile-chip">Vista basica</span>}
                            {currentUserCapabilities.map((capability) => (
                                <span key={`user_cap_${capability}`} className="saas-admin-profile-chip">{capability}</span>
                            ))}
                        </div>
                    </section>

                    <section className="saas-summary-card saas-summary-card--context" aria-label="Estado operativo">
                        <div className="saas-summary-card__header">
                            <h3>Contexto operativo</h3>
                            <span>Estado actual del panel y del tenant seleccionado.</span>
                        </div>
                        <div className="saas-summary-context-grid">
                            <div className="saas-summary-context-card">
                                <small>Alcance actual</small>
                                <strong>{tenantScopeLocked ? 'Seleccion pendiente' : activeTenantLabel}</strong>
                            </div>
                            <div className="saas-summary-context-card">
                                <small>Plan</small>
                                <strong>{tenantOptions.find((tenant) => String(tenant?.id || '').trim() === tenantScopeId)?.plan || '-'}</strong>
                            </div>
                            <div className="saas-summary-context-card">
                                <small>Estado del panel</small>
                                <strong>{tenantScopeLocked ? 'Bloqueado por tenant' : 'Listo para operar'}</strong>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="saas-summary-kpis">
                    <div className="saas-summary-kpi">
                        <small>Chats activos hoy</small>
                        <strong>{tenantScopeLocked ? 0 : activeChatsToday}</strong>
                    </div>
                    <div className="saas-summary-kpi">
                        <small>Clientes nuevos esta semana</small>
                        <strong>{tenantScopeLocked ? 0 : customersCreatedThisWeek}</strong>
                    </div>
                    <div className="saas-summary-kpi">
                        <small>Campañas activas</small>
                        <strong>{tenantScopeLocked ? 0 : activeCampaignsCount}</strong>
                    </div>
                    <div className="saas-summary-kpi">
                        <small>Templates aprobados</small>
                        <strong>{tenantScopeLocked ? 0 : approvedTemplatesCount}</strong>
                    </div>
                </div>

                <section className="saas-summary-card saas-summary-card--actions">
                    <div className="saas-summary-card__header">
                        <h3>ACCIONES RÁPIDAS</h3>
                        <span>Atajos a las secciones que mas se usan en el panel.</span>
                    </div>
                    <div className="saas-summary-actions">
                        <button type="button" disabled={busy || !isSectionEnabled('saas_empresas')} onClick={() => handleSectionChange('saas_empresas')}>Gestionar empresas</button>
                        <button type="button" disabled={busy || !isSectionEnabled('saas_usuarios')} onClick={() => handleSectionChange('saas_usuarios')}>Gestionar usuarios</button>
                        <button type="button" disabled={busy || !isSectionEnabled('saas_modulos')} onClick={() => handleSectionChange('saas_modulos')}>Gestionar módulos</button>
                        <button type="button" disabled={busy || !isSectionEnabled('saas_config')} onClick={() => handleSectionChange('saas_config')}>Configuración general</button>
                    </div>
                </section>
            </div>
        </SaasEntityPage>
    );
}

export default React.memo(SummarySection);
