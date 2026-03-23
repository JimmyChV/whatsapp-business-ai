import React from 'react';
import ImageDropInput from '../components/panel/ImageDropInput';

function CompaniesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
    selectedSectionId,
    tenantOptions,
    busy,
    canManageTenants,
    openTenantCreate,
    selectedTenantId,
    openTenantView,
    selectedTenant,
    tenantPanelMode,
    openTenantEdit,
    runAction,
    requestJson,
    activeTenantId,
    setSettingsTenantId,
    setSelectedTenantId,
    setTenantPanelMode,
    setTenantForm,
    cancelTenantEdit,
    PLAN_OPTIONS,
    tenantForm,
    handleFormImageUpload,
    buildInitials,
    toTenantDisplayName,
    formatDateTimeLabel,
    usersByTenant,
    toUserDisplayName,
    openUserFromTenant,
    overview,
    aiUsageByTenant,
    settingsTenantId
    } = context;
    if (selectedSectionId !== 'saas_empresas') {
        return null;
    }

    return (
                    <section id="saas_empresas" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Empresas ({tenantOptions.length})</h3>
                                        <small>Listado operativo. Selecciona una empresa para ver detalle.</small>
                                    </div>
                                    {canManageTenants && (
                                        <button type="button" disabled={busy} onClick={openTenantCreate}>Agregar empresa</button>
                                    )}
                                </div>
                                <div className="saas-admin-list saas-admin-list--compact">
                                    {tenantOptions.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>No hay empresas registradas.</p>
                                            {canManageTenants && (
                                                <button type="button" disabled={busy} onClick={openTenantCreate}>Crear primera empresa</button>
                                            )}
                                        </div>
                                    )}
                                    {tenantOptions.map((tenant) => {
                                        const activeUsers = (overview.metrics || []).find((metric) => metric.tenantId === tenant.id)?.activeUsers || 0;
                                        const usage = aiUsageByTenant.get(tenant.id) || 0;
                                        return (
                                            <button
                                                key={tenant.id}
                                                type="button"
                                                className={`saas-admin-list-item saas-admin-list-item--button ${selectedTenantId === tenant.id && tenantPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                                onClick={() => openTenantView(tenant.id)}
                                            >
                                                <strong>{toTenantDisplayName(tenant)}</strong>
                                                <small>{tenant.plan} | {tenant.active === false ? 'inactiva' : 'activa'}</small>
                                                <small>Usuarios activos: {activeUsers} | IA mes: {usage}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!selectedTenant && tenantPanelMode !== 'create' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una empresa</h4>
                                        <p>El detalle se mostrara aqui en solo lectura. Editar se habilita solo por accion explicita.</p>
                                    </div>
                                )}

                                {(selectedTenant || tenantPanelMode === 'create') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>
                                                    {tenantPanelMode === 'create'
                                                        ? 'Nueva empresa'
                                                        : tenantPanelMode === 'edit'
                                                            ? `Editando: ${toTenantDisplayName(selectedTenant || {})}`
                                                            : toTenantDisplayName(selectedTenant || {})}
                                                </h3>
                                                <small>
                                                    {tenantPanelMode === 'view'
                                                        ? 'Campos bloqueados. Usa Editar para modificar.'
                                                        : 'ID fijo despues de crear. Ajusta solo campos permitidos.'}
                                                </small>
                                            </div>
                                            {tenantPanelMode === 'view' && selectedTenant && canManageTenants && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy} onClick={openTenantEdit}>Editar</button>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => runAction('Estado de empresa actualizado', async () => {
                                                            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(selectedTenant.id)}`, {
                                                                method: 'PUT',
                                                                body: {
                                                                    slug: selectedTenant.slug || undefined,
                                                                    name: selectedTenant.name,
                                                                    plan: selectedTenant.plan,
                                                                    active: selectedTenant.active === false,
                                                                    logoUrl: selectedTenant.logoUrl || null,
                                                                    coverImageUrl: selectedTenant.coverImageUrl || null
                                                                }
                                                            });
                                                        })}
                                                    >
                                                        {selectedTenant.active === false ? 'Activar' : 'Desactivar'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {tenantPanelMode === 'view' && selectedTenant && (
                                            <>
                                                <div className="saas-admin-hero">
                                                    <div className="saas-admin-hero-media">
                                                        {(selectedTenant.coverImageUrl || selectedTenant.logoUrl)
                                                            ? <img src={selectedTenant.coverImageUrl || selectedTenant.logoUrl} alt={toTenantDisplayName(selectedTenant)} className="saas-admin-hero-image" />
                                                            : <div className="saas-admin-hero-placeholder">{buildInitials(toTenantDisplayName(selectedTenant || {}))}</div>}
                                                    </div>
                                                    <div className="saas-admin-hero-content">
                                                        <h4>{toTenantDisplayName(selectedTenant)}</h4>
                                                        <p>{selectedTenant.slug ? `slug: ${selectedTenant.slug}` : 'Sin slug configurado'}</p>
                                                    </div>
                                                </div>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedTenant?.id || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Slug</span><strong>{selectedTenant.slug || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Plan</span><strong>{selectedTenant.plan || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenant.active === false ? 'Inactiva' : 'Activa'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedTenant.updatedAt)}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Logo</span><strong>{selectedTenant.logoUrl ? 'Configurado' : 'Sin logo'}</strong></div>
                                                </div>
                                                {(selectedTenant.logoUrl || selectedTenant.coverImageUrl) && (
                                                    <div className="saas-admin-preview-strip">
                                                        {selectedTenant.logoUrl && <img src={selectedTenant.logoUrl} alt="Logo empresa" className="saas-admin-preview-thumb" />}
                                                        {selectedTenant.coverImageUrl && <img src={selectedTenant.coverImageUrl} alt="Portada empresa" className="saas-admin-preview-thumb saas-admin-preview-thumb--wide" />}
                                                    </div>
                                                )}
                                                <div className="saas-admin-related-block">
                                                    <h4>Usuarios de esta empresa</h4>
                                                    <div className="saas-admin-related-list">
                                                        {((usersByTenant.get(selectedTenant.id) || []).length === 0) && (
                                                            <div className="saas-admin-empty-inline">Sin usuarios vinculados.</div>
                                                        )}
                                                        {(usersByTenant.get(selectedTenant.id) || []).map((user) => (
                                                            <button key={`${selectedTenant.id}_${user.id}`} type="button" className="saas-admin-related-row" onClick={() => openUserFromTenant(user.id)}>
                                                                <span>{toUserDisplayName(user)}</span>
                                                                <small>{user.membershipRole || 'seller'}{user.membershipActive ? '' : ' (inactivo)'}</small>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                </>
                                        )}

                                        {tenantPanelMode !== 'view' && canManageTenants && (
                                            <>
                                                    <div className="saas-admin-form-row">
                                                    <input
                                                        value={tenantForm.slug}
                                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, slug: event.target.value }))}
                                                        placeholder="slug"
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={tenantForm.name}
                                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre"
                                                        disabled={busy}
                                                    />
                                                    <select value={tenantForm.plan} onChange={(event) => setTenantForm((prev) => ({ ...prev, plan: event.target.value }))} disabled={busy}>
                                                        {PLAN_OPTIONS.map((plan) => (
                                                            <option key={plan} value={plan}>{plan}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <ImageDropInput
                                                        label="Reemplazar logo"
                                                        disabled={busy}
                                                        onFile={(file) => handleFormImageUpload({
                                                            file,
                                                            scope: 'tenant_logo',
                                                            tenantId: selectedTenant?.id || settingsTenantId || activeTenantId || 'default',
                                                            onUploaded: (url) => setTenantForm((prev) => ({ ...prev, logoUrl: url }))
                                                        })}
                                                    />
                                                    <ImageDropInput
                                                        label="Reemplazar portada"
                                                        disabled={busy}
                                                        onFile={(file) => handleFormImageUpload({
                                                            file,
                                                            scope: 'tenant_cover',
                                                            tenantId: selectedTenant?.id || settingsTenantId || activeTenantId || 'default',
                                                            onUploaded: (url) => setTenantForm((prev) => ({ ...prev, coverImageUrl: url }))
                                                        })}
                                                    />
                                                </div>
                                                {(tenantForm.logoUrl || tenantForm.coverImageUrl) && (
                                                    <div className="saas-admin-preview-strip">
                                                        {tenantForm.logoUrl && <img src={tenantForm.logoUrl} alt="Logo empresa" className="saas-admin-preview-thumb" />}
                                                        {tenantForm.coverImageUrl && <img src={tenantForm.coverImageUrl} alt="Portada empresa" className="saas-admin-preview-thumb saas-admin-preview-thumb--wide" />}
                                                    </div>
                                                )}
                                                <div className="saas-admin-form-row">
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={tenantForm.active !== false}
                                                            onChange={(event) => setTenantForm((prev) => ({ ...prev, active: event.target.checked }))}
                                                            disabled={busy}
                                                        />
                                                        <span>Empresa activa</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={busy || !tenantForm.name.trim()}
                                                        onClick={() => runAction(tenantPanelMode === 'create' ? 'Empresa creada' : 'Empresa actualizada', async () => {
                                                            const payload = {
                                                                slug: tenantForm.slug || undefined,
                                                                name: tenantForm.name,
                                                                plan: tenantForm.plan,
                                                                active: tenantForm.active !== false,
                                                                logoUrl: tenantForm.logoUrl || null,
                                                                coverImageUrl: tenantForm.coverImageUrl || null
                                                            };

                                                            if (tenantPanelMode === 'create' || !selectedTenant?.id) {
                                                                const createdPayload = await requestJson('/api/admin/saas/tenants', {
                                                                    method: 'POST',
                                                                    body: payload
                                                                });
                                                                const createdId = String(createdPayload?.tenant?.id || '').trim();
                                                                if (createdId) {
                                                                    setSelectedTenantId(createdId);
                                                                    setSettingsTenantId(createdId);
                                                                }
                                                                setTenantPanelMode('view');
                                                                return;
                                                            }

                                                            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(selectedTenant.id)}`, {
                                                                method: 'PUT',
                                                                body: payload
                                                            });
                                                            setTenantPanelMode('view');
                                                        })}
                                                    >
                                                        {tenantPanelMode === 'create' ? 'Guardar empresa' : 'Actualizar empresa'}
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={cancelTenantEdit}>Cancelar</button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
    );
}

export default React.memo(CompaniesSection);

