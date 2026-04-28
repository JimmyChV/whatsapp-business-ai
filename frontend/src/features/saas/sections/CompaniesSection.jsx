import React from 'react';
import ImageDropInput from '../components/panel/ImageDropInput';
import { SaasEntityPage } from '../components/layout';

function CompaniesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        selectedSectionId,
        tenantOptions = [],
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
        PLAN_OPTIONS = [],
        tenantForm = {},
        handleFormImageUpload,
        buildInitials,
        toTenantDisplayName = (tenant) => tenant?.name || tenant?.id || '-',
        formatDateTimeLabel = (value) => value || '-',
        usersByTenant = new Map(),
        toUserDisplayName = (user) => user?.name || user?.email || user?.id || '-',
        openUserFromTenant,
        overview = {},
        aiUsageByTenant = new Map(),
        settingsTenantId
    } = context;

    const isEditing = tenantPanelMode === 'create' || tenantPanelMode === 'edit';
    const selectedId = tenantPanelMode === 'create' ? '__create_tenant' : selectedTenant?.id || selectedTenantId || '';

    const rows = React.useMemo(() => tenantOptions.map((tenant) => {
        const activeUsers = (overview.metrics || []).find((metric) => metric.tenantId === tenant.id)?.activeUsers || 0;
        const usage = aiUsageByTenant.get(tenant.id) || 0;
        return {
            id: tenant.id,
            name: toTenantDisplayName(tenant),
            slug: tenant.slug || '-',
            plan: tenant.plan || '-',
            status: tenant.active === false ? 'Inactiva' : 'Activa',
            activeUsers,
            aiUsage: usage,
            createdAt: formatDateTimeLabel(tenant.createdAt),
            updatedAt: formatDateTimeLabel(tenant.updatedAt),
            raw: tenant
        };
    }), [aiUsageByTenant, formatDateTimeLabel, overview.metrics, tenantOptions, toTenantDisplayName]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Nombre', width: '28%', minWidth: '240px', sortable: true },
        { key: 'slug', label: 'Código', width: '18%', minWidth: '160px', sortable: true, hidden: true },
        { key: 'plan', label: 'Plan', width: '14%', minWidth: '120px', sortable: true },
        { key: 'status', label: 'Estado', width: '14%', minWidth: '120px', sortable: true },
        { key: 'activeUsers', label: 'Usuarios', width: '12%', minWidth: '120px', sortable: true, hidden: true },
        { key: 'aiUsage', label: 'IA Mes', width: '12%', minWidth: '120px', sortable: true, hidden: true },
        { key: 'createdAt', label: 'Creado', width: '16%', minWidth: '150px', sortable: true, hidden: true },
        { key: 'updatedAt', label: 'Actualizado', width: '16%', minWidth: '150px', sortable: true, hidden: true }
    ], []);

    const close = React.useCallback(() => {
        if (isEditing) {
            cancelTenantEdit?.();
            return;
        }
        setSelectedTenantId?.('');
        setTenantPanelMode?.('view');
    }, [cancelTenantEdit, isEditing, setSelectedTenantId, setTenantPanelMode]);

    const renderDetail = React.useCallback(() => {
        if (!selectedTenant) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona una empresa</h4>
                    <p>El detalle se mostrará aquí en solo lectura. Editar se habilita solo por acción explícita.</p>
                </div>
            );
        }

        return (
            <>
                <div className="saas-admin-hero">
                    <div className="saas-admin-hero-media">
                        {(selectedTenant.coverImageUrl || selectedTenant.logoUrl)
                            ? <img src={selectedTenant.coverImageUrl || selectedTenant.logoUrl} alt={toTenantDisplayName(selectedTenant)} className="saas-admin-hero-image" />
                            : <div className="saas-admin-hero-placeholder">{buildInitials?.(toTenantDisplayName(selectedTenant || {}))}</div>}
                    </div>
                    <div className="saas-admin-hero-content">
                        <h4>{toTenantDisplayName(selectedTenant)}</h4>
                        <p>{selectedTenant.slug ? `slug: ${selectedTenant.slug}` : 'Sin slug configurado'}</p>
                    </div>
                </div>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>CÓDIGO</span><strong>{selectedTenant?.id || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Slug</span><strong>{selectedTenant.slug || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Plan</span><strong>{selectedTenant.plan || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ESTADO</span><strong>{selectedTenant.active === false ? 'Inactiva' : 'Activa'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ACTUALIZADO</span><strong>{formatDateTimeLabel(selectedTenant.updatedAt)}</strong></div>
                    <div className="saas-admin-detail-field"><span>Logo</span><strong>{selectedTenant.logoUrl ? 'Configurado' : 'Sin logo'}</strong></div>
                </div>
                {(selectedTenant.logoUrl || selectedTenant.coverImageUrl) ? (
                    <div className="saas-admin-preview-strip">
                        {selectedTenant.logoUrl ? <img src={selectedTenant.logoUrl} alt="Logo empresa" className="saas-admin-preview-thumb" /> : null}
                        {selectedTenant.coverImageUrl ? <img src={selectedTenant.coverImageUrl} alt="Portada empresa" className="saas-admin-preview-thumb saas-admin-preview-thumb--wide" /> : null}
                    </div>
                ) : null}
                <div className="saas-admin-related-block">
                    <h4>Usuarios de esta empresa</h4>
                    <div className="saas-admin-related-list">
                        {(usersByTenant.get(selectedTenant.id) || []).length === 0 ? (
                            <div className="saas-admin-empty-inline">Sin usuarios vinculados.</div>
                        ) : null}
                        {(usersByTenant.get(selectedTenant.id) || []).map((user) => (
                            <button key={`${selectedTenant.id}_${user.id}`} type="button" className="saas-admin-related-row" onClick={() => openUserFromTenant?.(user.id)}>
                                <span>{toUserDisplayName(user)}</span>
                                <small>{user.membershipRole || 'seller'}{user.membershipActive ? '' : ' (inactivo)'}</small>
                            </button>
                        ))}
                    </div>
                </div>
            </>
        );
    }, [buildInitials, formatDateTimeLabel, openUserFromTenant, selectedTenant, toTenantDisplayName, toUserDisplayName, usersByTenant]);

    const renderForm = React.useCallback(() => (
        <>
            <div className="saas-admin-form-row">
                <input
                    value={tenantForm.slug || ''}
                    onChange={(event) => setTenantForm?.((prev) => ({ ...prev, slug: event.target.value }))}
                    placeholder="slug"
                    disabled={busy}
                />
            </div>
            <div className="saas-admin-form-row">
                <input
                    value={tenantForm.name || ''}
                    onChange={(event) => setTenantForm?.((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Nombre"
                    disabled={busy}
                />
                <select value={tenantForm.plan || ''} onChange={(event) => setTenantForm?.((prev) => ({ ...prev, plan: event.target.value }))} disabled={busy}>
                    {PLAN_OPTIONS.map((plan) => (
                        <option key={plan} value={plan}>{plan}</option>
                    ))}
                </select>
            </div>
            <div className="saas-admin-form-row">
                <ImageDropInput
                    label="Reemplazar logo"
                    disabled={busy}
                    onFile={(file) => handleFormImageUpload?.({
                        file,
                        scope: 'tenant_logo',
                        tenantId: selectedTenant?.id || settingsTenantId || activeTenantId || 'default',
                        onUploaded: (url) => setTenantForm?.((prev) => ({ ...prev, logoUrl: url }))
                    })}
                />
                <ImageDropInput
                    label="Reemplazar portada"
                    disabled={busy}
                    onFile={(file) => handleFormImageUpload?.({
                        file,
                        scope: 'tenant_cover',
                        tenantId: selectedTenant?.id || settingsTenantId || activeTenantId || 'default',
                        onUploaded: (url) => setTenantForm?.((prev) => ({ ...prev, coverImageUrl: url }))
                    })}
                />
            </div>
            {(tenantForm.logoUrl || tenantForm.coverImageUrl) ? (
                <div className="saas-admin-preview-strip">
                    {tenantForm.logoUrl ? <img src={tenantForm.logoUrl} alt="Logo empresa" className="saas-admin-preview-thumb" /> : null}
                    {tenantForm.coverImageUrl ? <img src={tenantForm.coverImageUrl} alt="Portada empresa" className="saas-admin-preview-thumb saas-admin-preview-thumb--wide" /> : null}
                </div>
            ) : null}
            <div className="saas-admin-form-row">
                <label className="saas-admin-module-toggle">
                    <input
                        type="checkbox"
                        checked={tenantForm.active !== false}
                        onChange={(event) => setTenantForm?.((prev) => ({ ...prev, active: event.target.checked }))}
                        disabled={busy}
                    />
                    <span>Empresa activa</span>
                </label>
            </div>
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button
                    type="button"
                    disabled={busy || !String(tenantForm.name || '').trim()}
                    onClick={() => runAction?.(tenantPanelMode === 'create' ? 'Empresa creada' : 'Empresa actualizada', async () => {
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
                                setSelectedTenantId?.(createdId);
                                setSettingsTenantId?.(createdId);
                            }
                            setTenantPanelMode?.('view');
                            return;
                        }

                        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(selectedTenant.id)}`, {
                            method: 'PUT',
                            body: payload
                        });
                        setTenantPanelMode?.('view');
                    })}
                >
                    {tenantPanelMode === 'create' ? 'Guardar empresa' : 'Actualizar empresa'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelTenantEdit}>CANCELAR</button>
            </div>
        </>
    ), [
        PLAN_OPTIONS,
        activeTenantId,
        busy,
        cancelTenantEdit,
        handleFormImageUpload,
        requestJson,
        runAction,
        selectedTenant,
        setSelectedTenantId,
        setSettingsTenantId,
        setTenantForm,
        setTenantPanelMode,
        settingsTenantId,
        tenantForm,
        tenantPanelMode
    ]);

    const detailActions = React.useMemo(() => {
        if (tenantPanelMode !== 'view' || !selectedTenant || !canManageTenants) return null;
        return (
            <>
                <button type="button" disabled={busy} onClick={openTenantEdit}>EDITAR</button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction?.('Estado de empresa actualizado', async () => {
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
                    {selectedTenant.active === false ? 'ACTIVAR' : 'DESACTIVAR'}
                </button>
            </>
        );
    }, [busy, canManageTenants, openTenantEdit, requestJson, runAction, selectedTenant, tenantPanelMode]);

    if (selectedSectionId !== 'saas_empresas') return null;

    return (
        <div className="saas-admin-grid">
            <SaasEntityPage
                id="saas_empresas"
                sectionKey="companies"
                title="Empresas"
                rows={rows}
                columns={columns}
                selectedId={selectedId}
                onSelect={(row) => openTenantView?.(row?.id)}
                onClose={close}
                renderDetail={renderDetail}
                renderForm={renderForm}
                mode={isEditing ? 'form' : 'detail'}
                dirty={isEditing}
                requestJson={requestJson}
                emptyText="No hay empresas registradas."
                searchPlaceholder="Buscar empresa por nombre, slug, plan o estado..."
                actions={canManageTenants ? [{ key: 'create', label: 'Agregar empresa', onClick: openTenantCreate, disabled: busy }] : []}
                detailTitle={tenantPanelMode === 'create' ? 'Nueva empresa' : tenantPanelMode === 'edit' ? `Editando: ${toTenantDisplayName(selectedTenant || {})}` : toTenantDisplayName(selectedTenant || {})}
                detailSubtitle={tenantPanelMode === 'view' ? 'Campos bloqueados. Usa Editar para modificar.' : 'ID fijo después de crear. Ajusta solo campos permitidos.'}
                detailActions={detailActions}
            />
        </div>
    );
}

export default React.memo(CompaniesSection);
