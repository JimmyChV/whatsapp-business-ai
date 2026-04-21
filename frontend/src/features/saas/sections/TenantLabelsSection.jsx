import React, { useEffect, useMemo, useState } from 'react';
import {
    deleteGlobalLabel,
    deleteTenantZoneRule,
    fetchGlobalLabels,
    fetchTenantZoneRules,
    recalculateTenantZones,
    saveGlobalLabel,
    saveTenantZoneRule
} from '../services';

const EMPTY_GLOBAL_FORM = {
    id: '',
    name: '',
    color: '#00A884',
    description: '',
    commercialStatusKey: '',
    sortOrder: '100',
    isActive: true
};

const EMPTY_ZONE_FORM = {
    ruleId: '',
    name: '',
    color: '#00A884',
    departments: '',
    provinces: '',
    districts: '',
    isActive: true
};

function toText(value = '') {
    return String(value || '').trim();
}

function toCsv(value = []) {
    return Array.isArray(value) ? value.map(toText).filter(Boolean).join(', ') : '';
}

function parseCsvList(value = '') {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeGlobalItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        id: toText(source.id || source.labelId || '').toUpperCase(),
        name: toText(source.name || ''),
        color: toText(source.color || '#00A884') || '#00A884',
        description: toText(source.description || ''),
        commercialStatusKey: toText(source.commercialStatusKey || source.commercial_status_key || ''),
        sortOrder: Number(source.sortOrder ?? source.sort_order ?? 100) || 100,
        isActive: source.isActive !== false && source.is_active !== false
    };
}

function normalizeZoneItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const rules = source.rulesJson || source.rules_json || {};
    return {
        ruleId: toText(source.ruleId || source.rule_id || '').toUpperCase(),
        name: toText(source.name || ''),
        color: toText(source.color || '#00A884') || '#00A884',
        rulesJson: rules && typeof rules === 'object' && !Array.isArray(rules) ? rules : {},
        isActive: source.isActive !== false && source.is_active !== false
    };
}

function buildZoneForm(item = null) {
    if (!item) return { ...EMPTY_ZONE_FORM };
    const zone = normalizeZoneItem(item);
    return {
        ruleId: zone.ruleId,
        name: zone.name,
        color: zone.color,
        departments: toCsv(zone.rulesJson.departments || zone.rulesJson.departamentos || []),
        provinces: toCsv(zone.rulesJson.provinces || zone.rulesJson.provincias || []),
        districts: toCsv(zone.rulesJson.districts || zone.rulesJson.distritos || []),
        isActive: zone.isActive !== false
    };
}

function buildGlobalForm(item = null) {
    if (!item) return { ...EMPTY_GLOBAL_FORM };
    const global = normalizeGlobalItem(item);
    return {
        id: global.id,
        name: global.name,
        color: global.color,
        description: global.description,
        commercialStatusKey: global.commercialStatusKey,
        sortOrder: String(global.sortOrder || 100),
        isActive: global.isActive !== false
    };
}

function GlobalLabelsPanel({
    busy,
    requestJson,
    runAction,
    setError,
    isSuperAdmin
}) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_GLOBAL_FORM });

    const load = async () => {
        if (!isSuperAdmin || !requestJson) return;
        setLoading(true);
        try {
            const payload = await fetchGlobalLabels(requestJson, { includeInactive: true });
            setItems((Array.isArray(payload?.items) ? payload.items : []).map(normalizeGlobalItem));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load().catch((error) => setError?.(String(error?.message || error || 'No se pudieron cargar etiquetas globales.')));
    }, [isSuperAdmin, requestJson]);

    if (!isSuperAdmin) {
        return (
            <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                <h4>Globales solo para superadmin</h4>
                <p>Estas etiquetas comerciales se comparten como catalogo central del sistema.</p>
            </div>
        );
    }

    return (
        <div className="saas-labels-grid">
            <aside className="saas-labels-list-card">
                <div className="saas-admin-pane-header">
                    <div>
                        <h3>Globales comerciales</h3>
                        <small>Catalogo central para estados comerciales.</small>
                    </div>
                    <button type="button" disabled={busy || loading} onClick={() => load().catch((err) => setError?.(String(err?.message || err)))}>Recargar</button>
                </div>
                <div className="saas-admin-list saas-admin-list--compact">
                    {items.length === 0 && <div className="saas-admin-empty-state"><h4>Sin globales</h4><p>Crea una etiqueta comercial.</p></div>}
                    {items.map((item) => (
                        <button key={item.id} type="button" className="saas-admin-list-item saas-admin-list-item--button" onClick={() => setForm(buildGlobalForm(item))}>
                            <strong><span className="saas-label-color-dot" style={{ '--label-color': item.color }} />{item.name || item.id}</strong>
                            <small>{item.commercialStatusKey || 'Sin estado comercial'} | Orden {item.sortOrder}</small>
                            <small>{item.isActive ? 'Activa' : 'Inactiva'}</small>
                        </button>
                    ))}
                </div>
            </aside>
            <div className="saas-labels-editor-card">
                <div className="saas-admin-pane-header">
                    <div>
                        <h3>{form.id ? 'Editar global' : 'Nueva global'}</h3>
                        <small>Asocia nombre, color y estado comercial automatico.</small>
                    </div>
                    <button type="button" disabled={busy} onClick={() => setForm({ ...EMPTY_GLOBAL_FORM })}>Nueva</button>
                </div>
                <div className="saas-admin-form-row">
                    <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre" disabled={busy} />
                    <input value={form.commercialStatusKey} onChange={(event) => setForm((prev) => ({ ...prev, commercialStatusKey: event.target.value }))} placeholder="Estado comercial: nuevo, cotizado..." disabled={busy} />
                </div>
                <div className="saas-admin-form-row">
                    <input type="color" value={form.color} onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))} disabled={busy} />
                    <input type="number" value={form.sortOrder} onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))} placeholder="Orden" disabled={busy} />
                </div>
                <div className="saas-admin-form-row">
                    <input value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descripcion" disabled={busy} />
                    <label className="saas-admin-module-toggle">
                        <input type="checkbox" checked={form.isActive !== false} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                        <span>Activa</span>
                    </label>
                </div>
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button
                        type="button"
                        disabled={busy || !toText(form.name)}
                        onClick={() => runAction?.('Etiqueta global guardada', async () => {
                            await saveGlobalLabel(requestJson, {
                                id: form.id || undefined,
                                name: form.name,
                                color: form.color,
                                description: form.description,
                                commercialStatusKey: form.commercialStatusKey,
                                sortOrder: Number(form.sortOrder || 100) || 100,
                                isActive: form.isActive !== false
                            });
                            setForm({ ...EMPTY_GLOBAL_FORM });
                            await load();
                        })}
                    >
                        Guardar global
                    </button>
                    {form.id ? (
                        <button
                            type="button"
                            className="danger"
                            disabled={busy}
                            onClick={() => runAction?.('Etiqueta global eliminada', async () => {
                                await deleteGlobalLabel(requestJson, form.id);
                                setForm({ ...EMPTY_GLOBAL_FORM });
                                await load();
                            })}
                        >
                            Eliminar
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function ZoneRulesPanel({ busy, requestJson, runAction, setError, canManageLabels }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_ZONE_FORM });
    const [recalcResult, setRecalcResult] = useState(null);

    const load = async () => {
        if (!requestJson) return;
        setLoading(true);
        try {
            const payload = await fetchTenantZoneRules(requestJson, { includeInactive: true });
            setItems((Array.isArray(payload?.items) ? payload.items : []).map(normalizeZoneItem));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load().catch((error) => setError?.(String(error?.message || error || 'No se pudieron cargar zonas.')));
    }, [requestJson]);

    return (
        <div className="saas-labels-grid">
            <aside className="saas-labels-list-card">
                <div className="saas-admin-pane-header">
                    <div>
                        <h3>Zonas</h3>
                        <small>Reglas por distrito, provincia o departamento.</small>
                    </div>
                    <button type="button" disabled={busy || loading} onClick={() => load().catch((err) => setError?.(String(err?.message || err)))}>Recargar</button>
                </div>
                <div className="saas-admin-list saas-admin-list--compact">
                    {items.length === 0 && <div className="saas-admin-empty-state"><h4>Sin zonas</h4><p>Crea reglas geograficas para segmentar clientes.</p></div>}
                    {items.map((item) => (
                        <button key={item.ruleId} type="button" className="saas-admin-list-item saas-admin-list-item--button" onClick={() => setForm(buildZoneForm(item))}>
                            <strong><span className="saas-label-color-dot" style={{ '--label-color': item.color }} />{item.name || item.ruleId}</strong>
                            <small>{item.ruleId}</small>
                            <small>{item.isActive ? 'Activa' : 'Inactiva'}</small>
                        </button>
                    ))}
                </div>
            </aside>
            <div className="saas-labels-editor-card">
                <div className="saas-admin-pane-header">
                    <div>
                        <h3>{form.ruleId ? 'Editar zona' : 'Nueva zona'}</h3>
                        <small>La prioridad de asignacion es distrito, luego provincia, luego departamento.</small>
                    </div>
                    <button type="button" disabled={busy} onClick={() => setForm({ ...EMPTY_ZONE_FORM })}>Nueva</button>
                </div>
                <div className="saas-admin-form-row">
                    <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre de zona" disabled={busy} />
                    <input type="color" value={form.color} onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))} disabled={busy} />
                </div>
                <textarea className="saas-labels-textarea" value={form.districts} onChange={(event) => setForm((prev) => ({ ...prev, districts: event.target.value }))} placeholder="Distritos separados por coma: Miraflores, San Isidro" disabled={busy} />
                <textarea className="saas-labels-textarea" value={form.provinces} onChange={(event) => setForm((prev) => ({ ...prev, provinces: event.target.value }))} placeholder="Provincias separadas por coma: Lima, Callao" disabled={busy} />
                <textarea className="saas-labels-textarea" value={form.departments} onChange={(event) => setForm((prev) => ({ ...prev, departments: event.target.value }))} placeholder="Departamentos separados por coma: Lima, Arequipa" disabled={busy} />
                <label className="saas-admin-module-toggle">
                    <input type="checkbox" checked={form.isActive !== false} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                    <span>Zona activa</span>
                </label>
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button
                        type="button"
                        disabled={busy || !canManageLabels || !toText(form.name)}
                        onClick={() => runAction?.('Zona guardada', async () => {
                            await saveTenantZoneRule(requestJson, {
                                ruleId: form.ruleId || undefined,
                                name: form.name,
                                color: form.color,
                                isActive: form.isActive !== false,
                                rulesJson: {
                                    districts: parseCsvList(form.districts),
                                    provinces: parseCsvList(form.provinces),
                                    departments: parseCsvList(form.departments)
                                }
                            });
                            setForm({ ...EMPTY_ZONE_FORM });
                            await load();
                        })}
                    >
                        Guardar zona
                    </button>
                    {form.ruleId ? (
                        <button
                            type="button"
                            className="danger"
                            disabled={busy || !canManageLabels}
                            onClick={() => runAction?.('Zona eliminada', async () => {
                                await deleteTenantZoneRule(requestJson, form.ruleId);
                                setForm({ ...EMPTY_ZONE_FORM });
                                await load();
                            })}
                        >
                            Eliminar
                        </button>
                    ) : null}
                    <button
                        type="button"
                        disabled={busy || !canManageLabels}
                        onClick={() => runAction?.('Zonas recalculadas', async () => {
                            const result = await recalculateTenantZones(requestJson);
                            setRecalcResult(result);
                        })}
                    >
                        Recalcular zonas
                    </button>
                </div>
                {recalcResult ? (
                    <div className="saas-admin-inline-feedback success">
                        Revisados: {recalcResult.scanned || 0}. Asignados: {recalcResult.assigned || 0}. Clientes: {recalcResult.totalCustomers || 0}.
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function OperationalLabelsPanel({ context }) {
    const {
        busy,
        loadingLabels,
        settingsTenantId,
        loadTenantLabels,
        setError,
        canManageLabels,
        openTenantLabelCreate,
        labelSearch,
        setLabelSearch,
        visibleTenantLabels,
        selectedTenantLabel,
        labelPanelMode,
        setSelectedLabelId,
        setLabelPanelMode,
        openTenantLabelEdit,
        runAction,
        deactivateTenantLabel,
        requestJson,
        buildTenantLabelPayload,
        waModules,
        labelForm,
        setLabelForm,
        normalizeTenantLabelColor,
        DEFAULT_LABEL_COLORS,
        toggleModuleInLabelForm,
        saveTenantLabel,
        cancelTenantLabelEdit
    } = context;

    return (
        <div className="saas-admin-master-detail saas-labels-operational">
            <aside className="saas-admin-master-pane">
                <div className="saas-admin-pane-header">
                    <div>
                        <h3>Operativas</h3>
                        <small>Etiquetas actuales para clasificar chats por modulo.</small>
                    </div>
                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                        <button type="button" disabled={busy || loadingLabels || !settingsTenantId} onClick={() => settingsTenantId && loadTenantLabels(settingsTenantId).catch((err) => setError(String(err?.message || err || 'No se pudieron recargar etiquetas.')))}>Recargar</button>
                        <button type="button" disabled={busy || !canManageLabels || !settingsTenantId} onClick={openTenantLabelCreate}>Nueva etiqueta</button>
                    </div>
                </div>
                {!settingsTenantId ? (
                    <div className="saas-admin-empty-state"><h4>Selecciona una empresa</h4><p>Primero elige una empresa para administrar etiquetas.</p></div>
                ) : (
                    <>
                        <div className="saas-admin-form-row">
                            <input value={labelSearch} onChange={(event) => setLabelSearch(event.target.value)} placeholder="Filtrar etiquetas" disabled={loadingLabels} />
                        </div>
                        <div className="saas-admin-list saas-admin-list--compact">
                            {visibleTenantLabels.length === 0 && <div className="saas-admin-empty-state"><h4>Sin etiquetas</h4><p>Crea tu primera etiqueta para clasificar chats.</p></div>}
                            {visibleTenantLabels.map((label) => (
                                <button key={`tenant_label_${label.labelId}`} type="button" className={`saas-admin-list-item saas-admin-list-item--button ${(selectedTenantLabel?.labelId === label.labelId && labelPanelMode !== 'create') ? 'active' : ''}`.trim()} onClick={() => {
                                    setSelectedLabelId(String(label.labelId || '').trim().toUpperCase());
                                    setLabelPanelMode('view');
                                }}>
                                    <strong><span className="saas-label-color-dot" style={{ '--label-color': label.color || '#00A884' }} />{label.name || label.labelId}</strong>
                                    <small>{label.labelId}</small>
                                    <small>{label.moduleIds.length > 0 ? `Modulos: ${label.moduleIds.length}` : 'Compartida'} | {label.isActive === false ? 'inactiva' : 'activa'}</small>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </aside>
            <div className="saas-admin-detail-pane">
                {settingsTenantId && (selectedTenantLabel || labelPanelMode === 'create') ? (
                    <>
                        <div className="saas-admin-pane-header">
                            <div>
                                <h3>{labelPanelMode === 'create' ? 'Nueva etiqueta' : (labelPanelMode === 'edit' ? 'Editando etiqueta' : (selectedTenantLabel?.name || selectedTenantLabel?.labelId || 'Etiqueta'))}</h3>
                                <small>{labelPanelMode === 'view' ? 'Vista bloqueada' : 'Edicion activa'}</small>
                            </div>
                            {labelPanelMode === 'view' && selectedTenantLabel && canManageLabels && (
                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    <button type="button" disabled={busy} onClick={openTenantLabelEdit}>Editar</button>
                                    <button type="button" disabled={busy} onClick={() => runAction('Etiqueta desactivada', async () => deactivateTenantLabel(selectedTenantLabel?.labelId))}>Desactivar</button>
                                </div>
                            )}
                        </div>
                        {labelPanelMode === 'view' && selectedTenantLabel && (
                            <div className="saas-admin-detail-grid">
                                <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedTenantLabel.labelId || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedTenantLabel.name || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenantLabel.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Color</span><strong>{selectedTenantLabel.color || '#00A884'}</strong></div>
                            </div>
                        )}
                        {(labelPanelMode === 'create' || labelPanelMode === 'edit') && (
                            <>
                                <div className="saas-admin-form-row">
                                    <input value={labelForm.name} onChange={(event) => setLabelForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre de etiqueta" disabled={busy} />
                                    <input value={labelForm.labelId} onChange={(event) => setLabelForm((prev) => ({ ...prev, labelId: String(event.target.value || '').trim().toUpperCase() }))} placeholder="Codigo" disabled={busy || labelPanelMode === 'edit'} />
                                </div>
                                <div className="saas-admin-form-row">
                                    <input value={labelForm.description} onChange={(event) => setLabelForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descripcion" disabled={busy} />
                                    <input type="number" min="1" value={labelForm.sortOrder} onChange={(event) => setLabelForm((prev) => ({ ...prev, sortOrder: event.target.value }))} placeholder="Orden" disabled={busy} />
                                </div>
                                <div className="saas-admin-form-row">
                                    <input type="color" value={normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0])} onChange={(event) => setLabelForm((prev) => ({ ...prev, color: event.target.value }))} disabled={busy} />
                                    <label className="saas-admin-module-toggle"><input type="checkbox" checked={labelForm.isActive !== false} onChange={(event) => setLabelForm((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} /><span>Activa</span></label>
                                </div>
                                <div className="saas-admin-related-block">
                                    <h4>Asignacion por modulo</h4>
                                    <div className="saas-admin-modules" style={{ marginTop: '8px' }}>
                                        {waModules.map((moduleItem) => {
                                            const moduleId = String(moduleItem?.moduleId || '').trim().toLowerCase();
                                            const checked = Array.isArray(labelForm.moduleIds) && labelForm.moduleIds.includes(moduleId);
                                            return (
                                                <label key={`assignment_module_${moduleId}`} className="saas-admin-module-toggle">
                                                    <input type="checkbox" checked={checked} onChange={() => toggleModuleInLabelForm(moduleId)} disabled={busy} />
                                                    <span>{moduleItem?.name || moduleId}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                    <button type="button" disabled={busy || !canManageLabels || !String(labelForm.name || '').trim()} onClick={() => runAction(labelPanelMode === 'create' ? 'Etiqueta creada' : 'Etiqueta actualizada', async () => saveTenantLabel())}>
                                        {labelPanelMode === 'create' ? 'Guardar etiqueta' : 'Actualizar etiqueta'}
                                    </button>
                                    <button type="button" disabled={busy} onClick={cancelTenantLabelEdit}>Cancelar</button>
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="saas-admin-empty-state saas-admin-empty-state--detail"><h4>Selecciona una etiqueta</h4><p>El detalle se muestra en este panel.</p></div>
                )}
            </div>
        </div>
    );
}

export default function TenantLabelsSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const [mainTab, setMainTab] = useState(context?.isSuperAdmin ? 'global' : 'tenant');
    const [tenantTab, setTenantTab] = useState('zones');
    const isSuperAdmin = Boolean(context?.isSuperAdmin);

    const tabLabel = useMemo(() => (
        mainTab === 'global' ? 'Globales' : tenantTab === 'zones' ? 'Zonas' : 'Operativas'
    ), [mainTab, tenantTab]);

    return (
        <section id="saas_etiquetas" className="saas-admin-card saas-admin-card--full">
            <div className="saas-admin-pane-header saas-labels-header">
                <div>
                    <h3>Etiquetas</h3>
                    <small>Sistema por niveles: global comercial, zonas por tenant y operativas.</small>
                </div>
                <span className="saas-labels-current-pill">{tabLabel}</span>
            </div>
            <div className="saas-admin-tabs">
                <button type="button" className={mainTab === 'global' ? 'active' : ''} disabled={!isSuperAdmin} onClick={() => setMainTab('global')}>Globales</button>
                <button type="button" className={mainTab === 'tenant' ? 'active' : ''} onClick={() => setMainTab('tenant')}>Del tenant</button>
            </div>

            {mainTab === 'global' ? (
                <GlobalLabelsPanel {...context} isSuperAdmin={isSuperAdmin} />
            ) : (
                <>
                    <div className="saas-admin-tabs saas-admin-tabs--secondary">
                        <button type="button" className={tenantTab === 'zones' ? 'active' : ''} onClick={() => setTenantTab('zones')}>Zonas</button>
                        <button type="button" className={tenantTab === 'operational' ? 'active' : ''} onClick={() => setTenantTab('operational')}>Operativas</button>
                    </div>
                    {tenantTab === 'zones' ? (
                        <ZoneRulesPanel {...context} />
                    ) : (
                        <OperationalLabelsPanel context={context} />
                    )}
                </>
            )}
        </section>
    );
}
