import React from 'react';

function SummarySection({
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
    overview,
    scopedUsers,
    waModules,
    busy,
    isSectionEnabled,
    handleSectionChange
}) {
    if (selectedSectionId !== 'saas_resumen') {
        return null;
    }

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
                    <small>Empresas activas</small>
                    <strong>{(overview.tenants || []).filter((tenant) => tenant.active !== false).length}</strong>
                </div>
                <div className="saas-admin-kpi">
                    <small>Usuarios activos (alcance)</small>
                    <strong>{(scopedUsers || []).filter((user) => user.active !== false).length}</strong>
                </div>
                <div className="saas-admin-kpi">
                    <small>Modulos WhatsApp</small>
                    <strong>{waModules.length}</strong>
                </div>
                <div className="saas-admin-kpi">
                    <small>Bandeja multicanal</small>
                    <strong>Todos los modulos</strong>
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
