import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SaasDataTable, SaasDetailPanel, SaasDetailPanelSection, SaasEntityPage, SaasTableDetailLayout, SaasViewHeader } from '../components/layout';
import { deleteGlobalLabel, deleteTenantZoneRule, fetchTenantZoneRules, getCachedGlobalLabels, hasCachedGlobalLabels, loadCachedGlobalLabels, normalizeGlobalLabel, recalculateTenantZones, removeCachedGlobalLabel, saveGlobalLabel, saveTenantZoneRule, upsertCachedGlobalLabel } from '../services';

const EMPTY_GLOBAL = { id: '', name: '', color: '#00A884', description: '', commercialStatusKey: '', sortOrder: '100', isActive: true };
const EMPTY_ZONE = { ruleId: '', name: '', color: '#00A884', departments: [], provinces: [], districts: [], departmentId: '', provinceId: '', districtId: '', isActive: true };
const LABEL_COLORS = ['#00A884', '#14B8A6', '#38BDF8', '#6366F1', '#8B5CF6', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#84CC16'];
const zoneRulesCache = new Map();
const zoneGeoCache = new Map();
const text = (v = '') => String(v || '').trim();
const upper = (v = '') => text(v).toUpperCase();
const key = (v = '') => text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const uniq = (arr = []) => Array.from(new Set((Array.isArray(arr) ? arr : []).map(text).filter(Boolean)));

function normGlobal(item = {}) {
    return normalizeGlobalLabel(item);
}
function normZone(item = {}) {
    const rules = item.rulesJson || item.rules_json || {};
    return { ruleId: upper(item.ruleId || item.rule_id || ''), name: text(item.name), color: text(item.color || '#00A884') || '#00A884', rulesJson: rules && typeof rules === 'object' && !Array.isArray(rules) ? rules : {}, isActive: item.isActive !== false && item.is_active !== false };
}
function normGeo(item = {}, type = '') {
    const id = text(item.id || item[`${type}Id`] || item[`${type}_id`] || item.codigo || item.code || item.ubigeo || item.name);
    return { id, name: text(item.name || item.label || item.nombre || item.value || id), departmentId: text(item.departmentId || item.department_id || item.parentDepartmentId || item.parent_department_id), provinceId: text(item.provinceId || item.province_id || item.parentProvinceId || item.parent_province_id) };
}
function globalForm(item = null) {
    if (!item) return { ...EMPTY_GLOBAL };
    const g = normGlobal(item);
    return { id: g.id, name: g.name, color: g.color, description: g.description, commercialStatusKey: g.commercialStatusKey, sortOrder: String(g.sortOrder || 100), isActive: g.isActive !== false };
}
function zoneForm(item = null) {
    if (!item) return { ...EMPTY_ZONE };
    const z = normZone(item);
    const r = z.rulesJson || {};
    return { ...EMPTY_ZONE, ruleId: z.ruleId, name: z.name, color: z.color, departments: uniq(r.departments || r.departmentNames || r.departamentos || []), provinces: uniq(r.provinces || r.provinceNames || r.provincias || []), districts: uniq(r.districts || r.districtNames || r.distritos || []), isActive: z.isActive !== false };
}
function zoneFormToRule(form = {}, fallbackRuleId = '') {
    return normZone({
        ruleId: form.ruleId || fallbackRuleId,
        name: form.name,
        color: form.color,
        isActive: form.isActive !== false,
        rulesJson: {
            districts: uniq(form.districts),
            districtNames: uniq(form.districts),
            provinces: uniq(form.provinces),
            provinceNames: uniq(form.provinces),
            departments: uniq(form.departments),
            departmentNames: uniq(form.departments)
        }
    });
}
function upsertById(items = [], item = {}, idField = 'ruleId') {
    const id = upper(item?.[idField] || '');
    if (!id) return items;
    const normalized = { ...item, [idField]: id };
    const exists = items.some((entry) => upper(entry?.[idField] || '') === id);
    return exists ? items.map((entry) => (upper(entry?.[idField] || '') === id ? normalized : entry)) : [normalized, ...items];
}
function Dot({ color = '#00A884' }) { return <span className="saas-label-color-dot" style={{ '--label-color': color }} />; }
function ColorPicker({ value = '#00A884', onChange, disabled = false }) {
    const current = text(value || '#00A884') || '#00A884';
    return <div className="saas-label-color-picker"><div className="saas-label-color-picker__preview" style={{ '--label-color': current }}><span /> <strong>{current}</strong><input type="color" value={current} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} aria-label="Color personalizado" /></div><div className="saas-label-color-picker__swatches">{LABEL_COLORS.map((color) => <button key={color} type="button" className={current.toLowerCase() === color.toLowerCase() ? 'active' : ''} style={{ '--label-color': color }} disabled={disabled} onClick={() => onChange?.(color)} aria-label={`Usar color ${color}`} />)}</div></div>;
}
function Empty({ title, body }) { return <div className="saas-admin-empty-state saas-admin-empty-state--detail"><h4>{title}</h4><p>{body}</p></div>; }
function useEscape(active, close) {
    useEffect(() => {
        if (!active) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); close?.(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, close]);
}
function Chips({ title, items = [], remove, readonly = false }) {
    return <div className="saas-labels-zone-chip-block"><span>{title}</span><div className="saas-labels-zone-chips">{items.length ? items.map((item) => <button key={`${title}_${item}`} type="button" disabled={readonly} onClick={() => remove?.(item)}>{item}{readonly ? null : <strong>x</strong>}</button>) : <small>Sin valores.</small>}</div></div>;
}
const LABEL_TABLE_COLUMNS = [
    { key: 'color', label: '', width: '54px', render: (value) => <Dot color={value || '#00A884'} /> },
    { key: 'name', label: 'Nombre', minWidth: '220px', render: (value, row) => <strong>{value || row.code}</strong> },
    { key: 'code', label: 'Código', minWidth: '150px', hidden: true },
    { key: 'typeText', label: 'Tipo', minWidth: '150px', hidden: true },
    { key: 'colorText', label: 'Color', minWidth: '140px', hidden: true },
    { key: 'metaText', label: 'Alcance', minWidth: '170px' },
    { key: 'sortOrderText', label: 'Orden', minWidth: '100px', hidden: true },
    { key: 'updatedAtText', label: 'Actualizado', minWidth: '170px', hidden: true },
    { key: 'statusText', label: 'Estado', width: '110px' }
];
function buildLabelRows(items = [], idField = 'id', kind = 'label') {
    return (Array.isArray(items) ? items : []).map((item) => {
        const rowId = upper(item?.[idField] || item?.id || item?.ruleId || item?.labelId || '');
        const moduleCount = Array.isArray(item?.moduleIds) ? item.moduleIds.length : 0;
        return {
            ...item,
            id: rowId,
            code: rowId,
            typeText: kind === 'global' ? 'Global' : kind === 'zone' ? 'Zona' : 'Operativa',
            colorText: text(item?.color || '#00A884') || '#00A884',
            statusText: item?.isActive === false ? 'Inactiva' : 'Activa',
            metaText: kind === 'global'
                ? (item?.commercialStatusKey || 'Sin estado comercial')
                : kind === 'zone'
                    ? 'Regla geografica'
                    : moduleCount > 0 ? `${moduleCount} modulo${moduleCount === 1 ? '' : 's'}` : 'Compartida',
            sortOrderText: String(item?.sortOrder ?? '-'),
            updatedAtText: text(item?.updatedAt || item?.updated_at || '-')
        };
    });
}
function LabelsTable({ items = [], selectedId = '', idField = 'id', kind = 'label', emptyText = 'No hay etiquetas para mostrar.', onSelect }) {
    const rows = buildLabelRows(items, idField, kind);
    const columns = LABEL_TABLE_COLUMNS.map((column) => column.key === 'metaText' ? { ...column, label: kind === 'global' ? 'Estado Comercial' : 'Alcance' } : column);
    return <SaasDataTable columns={columns} rows={rows} selectedId={selectedId} onSelect={(row) => { const source = items.find((item) => upper(item?.[idField] || '') === upper(row?.id || '')) || row; onSelect?.(source); }} emptyText={emptyText} enableInfinite={false} />;
}

const GLOBAL_LABEL_FILTERS = [
    { key: 'name', label: 'Nombre', type: 'text' },
    { key: 'code', label: 'Código', type: 'text' },
    { key: 'metaText', label: 'Estado Comercial', type: 'text' },
    { key: 'statusText', label: 'Estado', type: 'option', options: [{ value: 'Activa', label: 'Activa' }, { value: 'Inactiva', label: 'Inactiva' }] }
];

const ZONE_FILTERS = [
    { key: 'name', label: 'Nombre', type: 'text' },
    { key: 'code', label: 'Código', type: 'text' },
    { key: 'metaText', label: 'Alcance', type: 'text' },
    { key: 'statusText', label: 'Estado', type: 'option', options: [{ value: 'Activa', label: 'Activa' }, { value: 'Inactiva', label: 'Inactiva' }] }
];

const OPERATIONAL_LABEL_FILTERS = [
    { key: 'name', label: 'Nombre', type: 'text' },
    { key: 'code', label: 'Código', type: 'text' },
    { key: 'metaText', label: 'Alcance', type: 'text' },
    { key: 'statusText', label: 'Estado', type: 'option', options: [{ value: 'Activa', label: 'Activa' }, { value: 'Inactiva', label: 'Inactiva' }] }
];

function GlobalPanel({ busy, requestJson, runAction, setError, isSuperAdmin }) {
    const [items, setItems] = useState(() => getCachedGlobalLabels());
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [mode, setMode] = useState('list');
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState({ ...EMPTY_GLOBAL });
    const selected = useMemo(() => items.find((x) => x.id === selectedId) || null, [items, selectedId]);
    const visible = useMemo(() => items.filter((x) => !key(search) || key(`${x.id} ${x.name} ${x.commercialStatusKey}`).includes(key(search))), [items, search]);
    const globalColumns = React.useMemo(
        () => LABEL_TABLE_COLUMNS.map((column) =>
            column.key === 'metaText'
                ? { ...column, label: 'Estado Comercial' }
                : column
        ),
        []
    );
    const close = useCallback(() => { setMode('list'); setSelectedId(''); setForm({ ...EMPTY_GLOBAL }); }, []);
    useEscape(mode !== 'list', close);
    const load = useCallback(async ({ force = false } = {}) => {
        if (!isSuperAdmin || !requestJson) return;
        if (!force && hasCachedGlobalLabels()) {
            setItems(getCachedGlobalLabels());
            return;
        }
        setLoading(true);
        try {
            const cached = await loadCachedGlobalLabels(requestJson, { force, includeInactive: true });
            setItems(cached);
        } finally { setLoading(false); }
    }, [isSuperAdmin, requestJson]);
    useEffect(() => { load().catch((e) => setError?.(String(e?.message || e || 'No se pudieron cargar etiquetas globales.'))); }, [load, setError]);
    if (!isSuperAdmin) return <Empty title="Globales solo para superadmin" body="Estas etiquetas comerciales se comparten como catalogo central del sistema." />;
    const openCreate = () => { setMode('create'); setSelectedId('__create_global'); setForm({ ...EMPTY_GLOBAL }); };
    const openDetail = (item) => { setMode('detail'); setSelectedId(item.id); setForm(globalForm(item)); };
    const openEdit = () => { if (selected) { setMode('edit'); setForm(globalForm(selected)); } };
    const renderDetail = () => selected ? (
        <SaasDetailPanelSection title="Detalle">
            <div className="saas-admin-detail-grid">
                <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selected.id}</strong></div>
                <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selected.name || '-'}</strong></div>
                <div className="saas-admin-detail-field"><span>Estado comercial</span><strong>{selected.commercialStatusKey || '-'}</strong></div>
                <div className="saas-admin-detail-field"><span>Orden</span><strong>{selected.sortOrder}</strong></div>
                <div className="saas-admin-detail-field"><span>Estado</span><strong>{selected.isActive ? 'Activa' : 'Inactiva'}</strong></div>
                <div className="saas-admin-detail-field"><span>Color</span><strong><Dot color={selected.color} />{selected.color}</strong></div>
            </div>
            {selected.description ? <p className="saas-labels-detail-description">{selected.description}</p> : null}
        </SaasDetailPanelSection>
    ) : <Empty title="Selecciona una etiqueta global" body="El detalle se mostrara aqui con cabecera fija y scroll propio." />;
    const renderForm = () => (
        <SaasDetailPanelSection title="Formulario">
            <div className="saas-admin-form-row">
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre" disabled={busy} />
                <input value={form.commercialStatusKey} onChange={(e) => setForm((p) => ({ ...p, commercialStatusKey: e.target.value }))} placeholder="Estado comercial: nuevo, cotizado..." disabled={busy} />
            </div>
            <div className="saas-admin-form-row">
                <ColorPicker value={form.color} disabled={busy} onChange={(color) => setForm((p) => ({ ...p, color }))} />
                <input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} placeholder="Orden" disabled={busy} />
            </div>
            <textarea className="saas-labels-textarea" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descripcion" disabled={busy} />
            <label className="saas-admin-module-toggle">
                <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} disabled={busy} />
                <span>Activa</span>
            </label>
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !text(form.name)} onClick={() => runAction?.('Etiqueta global guardada', async () => { const saved = await saveGlobalLabel(requestJson, { id: form.id || undefined, name: form.name, color: form.color, description: form.description, commercialStatusKey: form.commercialStatusKey, sortOrder: Number(form.sortOrder || 100) || 100, isActive: form.isActive !== false }); const savedItem = normGlobal(saved?.item || { ...form, id: form.id }); const next = upper(savedItem.id || form.id || ''); if (next) { const cached = upsertCachedGlobalLabel(savedItem); setItems(cached); setSelectedId(next); setForm(globalForm(savedItem)); setMode('detail'); } else close(); })}>Guardar global</button>
                {form.id ? <button type="button" className="danger" disabled={busy} onClick={() => runAction?.('Etiqueta global eliminada', async () => { await deleteGlobalLabel(requestJson, form.id); const cached = removeCachedGlobalLabel(form.id); setItems(cached); close(); })}>Eliminar</button> : null}
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={close}>Cancelar</button>
            </div>
        </SaasDetailPanelSection>
    );
    return <SaasEntityPage title="Globales comerciales" sectionKey="global_labels_inner" rows={buildLabelRows(visible, 'id', 'global')} columns={globalColumns} selectedId={mode === 'list' ? '' : selectedId} onSelect={(row) => openDetail(row)} onClose={close} renderDetail={renderDetail} renderForm={renderForm} mode={mode === 'create' || mode === 'edit' ? 'form' : 'detail'} dirty={mode === 'create' || mode === 'edit'} requestJson={requestJson} loading={loading} emptyText="No hay etiquetas globales para mostrar." searchPlaceholder="Buscar etiqueta global" actions={[{ key: 'reload', label: 'Recargar', onClick: () => load({ force: true }).catch((e) => setError?.(String(e?.message || e))), disabled: busy || loading }, { key: 'create', label: 'Nuevo', onClick: openCreate, disabled: busy }]} filters={GLOBAL_LABEL_FILTERS} layoutClassName="saas-labels-layout" detailTitle={mode === 'create' ? 'Nueva global' : mode === 'edit' ? 'Editar global' : selected?.name || 'Etiqueta global'} detailSubtitle={mode === 'detail' ? 'Etiqueta comercial global.' : 'Define nombre, color, orden y estado comercial asociado.'} detailActions={mode === 'detail' && selected ? <button type="button" disabled={busy} onClick={openEdit}>Editar</button> : null} />;
}

function ZonePanel({ busy, requestJson, runAction, setError, canManageLabels, tenantScopeLocked, settingsTenantId }) {
    const zoneCacheKey = text(settingsTenantId || 'default');
    const [items, setItems] = useState(() => zoneRulesCache.get(zoneCacheKey) || []);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [mode, setMode] = useState('list');
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState({ ...EMPTY_ZONE });
    const [geo, setGeo] = useState({ departments: [], provinces: [], districts: [] });
    const [geoLoading, setGeoLoading] = useState(false);
    const [recalc, setRecalc] = useState(null);
    const departments = useMemo(() => (Array.isArray(geo.departments) ? geo.departments : []).map((x) => normGeo(x, 'department')).filter((x) => x.id && x.name), [geo.departments]);
    const provinces = useMemo(() => (Array.isArray(geo.provinces) ? geo.provinces : []).map((x) => normGeo(x, 'province')).filter((x) => x.id && x.name), [geo.provinces]);
    const districts = useMemo(() => (Array.isArray(geo.districts) ? geo.districts : []).map((x) => normGeo(x, 'district')).filter((x) => x.id && x.name), [geo.districts]);
    const provinceOptions = useMemo(() => (form.departmentId ? provinces.filter((x) => !x.departmentId || x.departmentId === form.departmentId) : provinces), [form.departmentId, provinces]);
    const districtOptions = useMemo(() => (form.provinceId ? districts.filter((x) => !x.provinceId || x.provinceId === form.provinceId) : districts), [districts, form.provinceId]);
    const selected = useMemo(() => items.find((x) => x.ruleId === selectedId) || null, [items, selectedId]);
    const visible = useMemo(() => items.filter((x) => !key(search) || key(`${x.ruleId} ${x.name}`).includes(key(search))), [items, search]);
    const close = useCallback(() => { setMode('list'); setSelectedId(''); setForm({ ...EMPTY_ZONE }); }, []);
    useEscape(mode !== 'list', close);
    const needsGeoCatalog = mode === 'create' || mode === 'edit';
    const setCachedItems = useCallback((nextItems) => {
        const normalized = (Array.isArray(nextItems) ? nextItems : []).map(normZone);
        zoneRulesCache.set(zoneCacheKey, normalized);
        setItems(normalized);
    }, [zoneCacheKey]);
    const load = useCallback(async ({ force = false } = {}) => {
        if (!requestJson || tenantScopeLocked || !settingsTenantId) return;
        const cached = zoneRulesCache.get(zoneCacheKey);
        if (!force && cached) {
            setItems(cached);
            return;
        }
        setLoading(true);
        try { const payload = await fetchTenantZoneRules(requestJson, { includeInactive: true }); setCachedItems(Array.isArray(payload?.items) ? payload.items : []); } finally { setLoading(false); }
    }, [requestJson, setCachedItems, settingsTenantId, tenantScopeLocked, zoneCacheKey]);
    useEffect(() => {
        if (!settingsTenantId || tenantScopeLocked) return;
        const cached = zoneRulesCache.get(zoneCacheKey);
        if (cached) {
            setItems(cached);
        } else {
            setItems([]);
        }
    }, [settingsTenantId, tenantScopeLocked, zoneCacheKey]);
    useEffect(() => { load().catch((e) => setError?.(String(e?.message || e || 'No se pudieron cargar zonas.'))); }, [load, setError]);
    useEffect(() => {
        if (!requestJson || tenantScopeLocked || !settingsTenantId || !needsGeoCatalog) return;
        const cachedGeo = zoneGeoCache.get(zoneCacheKey);
        if (cachedGeo) {
            setGeo(cachedGeo);
            return undefined;
        }
        let cancelled = false;
        setGeoLoading(true);
        requestJson('/api/tenant/customer-catalogs/geo', { method: 'GET' }).then((payload) => {
            if (cancelled) return;
            const nextGeo = {
                departments: Array.isArray(payload?.departments) ? payload.departments : [],
                provinces: Array.isArray(payload?.provinces) ? payload.provinces : [],
                districts: Array.isArray(payload?.districts) ? payload.districts : []
            };
            zoneGeoCache.set(zoneCacheKey, nextGeo);
            setGeo(nextGeo);
        }).catch(() => { if (!cancelled) setGeo({ departments: [], provinces: [], districts: [] }); }).finally(() => { if (!cancelled) setGeoLoading(false); });
        return () => { cancelled = true; };
    }, [needsGeoCatalog, requestJson, settingsTenantId, tenantScopeLocked, zoneCacheKey]);
    if (tenantScopeLocked || !settingsTenantId) return <Empty title="Selecciona una empresa" body="Las reglas de zona pertenecen a un tenant. Las etiquetas globales siguen disponibles en la pestana Globales." />;
    const openCreate = () => { setMode('create'); setSelectedId('__create_zone'); setForm({ ...EMPTY_ZONE }); };
    const openDetail = (item) => { setMode('detail'); setSelectedId(item.ruleId); setForm(zoneForm(item)); };
    const openEdit = () => { if (selected) { setMode('edit'); setForm(zoneForm(selected)); } };
    const addValue = (field, value) => { const clean = text(value); if (clean) setForm((p) => ({ ...p, [field]: uniq([...(p[field] || []), clean]) })); };
    const removeValue = (field, value) => setForm((p) => ({ ...p, [field]: (p[field] || []).filter((x) => x !== value) }));
    const left = <div className="saas-labels-pane"><LabelsTable kind="zone" items={visible} selectedId={selectedId} idField="ruleId" emptyText="No hay zonas para mostrar." onSelect={openDetail} /></div>;
    const detail = mode === 'detail' && selected;
    const right = <SaasDetailPanel title={detail ? selected.name || 'Zona' : mode === 'create' ? 'Nueva zona' : 'Editar zona'} subtitle={detail ? 'Regla geografica del tenant.' : 'Agrega departamentos, provincias y distritos con selectores jerarquicos.'} className="saas-labels-detail-panel" actions={<>{detail ? <button type="button" disabled={busy || !canManageLabels} onClick={openEdit}>Editar</button> : null}<button type="button" className="saas-btn-cancel" disabled={busy} onClick={close}>Volver</button></>}>
        {detail ? <SaasDetailPanelSection title="Detalle"><div className="saas-admin-detail-grid"><div className="saas-admin-detail-field"><span>Codigo</span><strong>{selected.ruleId}</strong></div><div className="saas-admin-detail-field"><span>Nombre</span><strong>{selected.name || '-'}</strong></div><div className="saas-admin-detail-field"><span>Estado</span><strong>{selected.isActive ? 'Activa' : 'Inactiva'}</strong></div><div className="saas-admin-detail-field"><span>Color</span><strong><Dot color={selected.color} />{selected.color}</strong></div></div><div className="saas-labels-zone-readonly"><Chips title="Departamentos" items={form.departments} readonly /><Chips title="Provincias" items={form.provinces} readonly /><Chips title="Distritos" items={form.districts} readonly /></div></SaasDetailPanelSection> : <>
            <SaasDetailPanelSection title="Datos base"><div className="saas-admin-form-row"><input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre de zona" disabled={busy} /><ColorPicker value={form.color} disabled={busy} onChange={(color) => setForm((p) => ({ ...p, color }))} /></div><label className="saas-admin-module-toggle"><input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} disabled={busy} /><span>Zona activa</span></label></SaasDetailPanelSection>
            <SaasDetailPanelSection title="Reglas geograficas"><div className="saas-labels-zone-picker"><label><span>Departamento</span><select value={form.departmentId} disabled={busy || geoLoading} onChange={(e) => setForm((p) => ({ ...p, departmentId: e.target.value, provinceId: '', districtId: '' }))}><option value="">{geoLoading ? 'Cargando...' : 'Selecciona departamento'}</option>{departments.map((x) => <option key={`dep_${x.id}`} value={x.id}>{x.name}</option>)}</select></label><button type="button" disabled={!form.departmentId} onClick={() => addValue('departments', departments.find((x) => x.id === form.departmentId)?.name || '')}>Agregar departamento</button></div><div className="saas-labels-zone-picker"><label><span>Provincia</span><select value={form.provinceId} disabled={busy || geoLoading} onChange={(e) => setForm((p) => ({ ...p, provinceId: e.target.value, districtId: '' }))}><option value="">Selecciona provincia</option>{provinceOptions.map((x) => <option key={`prov_${x.id}`} value={x.id}>{x.name}</option>)}</select></label><button type="button" disabled={!form.provinceId} onClick={() => addValue('provinces', provinces.find((x) => x.id === form.provinceId)?.name || '')}>Agregar provincia</button></div><div className="saas-labels-zone-picker"><label><span>Distrito</span><select value={form.districtId} disabled={busy || geoLoading} onChange={(e) => setForm((p) => ({ ...p, districtId: e.target.value }))}><option value="">Selecciona distrito</option>{districtOptions.map((x) => <option key={`dist_${x.id}`} value={x.id}>{x.name}</option>)}</select></label><button type="button" disabled={!form.districtId} onClick={() => addValue('districts', districts.find((x) => x.id === form.districtId)?.name || '')}>Agregar distrito</button></div><Chips title="Departamentos" items={form.departments} remove={(x) => removeValue('departments', x)} /><Chips title="Provincias" items={form.provinces} remove={(x) => removeValue('provinces', x)} /><Chips title="Distritos" items={form.districts} remove={(x) => removeValue('districts', x)} /></SaasDetailPanelSection>
            <SaasDetailPanelSection title="Acciones"><div className="saas-admin-form-row saas-admin-form-row--actions"><button type="button" disabled={busy || !canManageLabels || !text(form.name)} onClick={() => runAction?.('Zona guardada', async () => { const payload = { ruleId: form.ruleId || undefined, name: form.name, color: form.color, isActive: form.isActive !== false, rulesJson: { districts: uniq(form.districts), districtNames: uniq(form.districts), provinces: uniq(form.provinces), provinceNames: uniq(form.provinces), departments: uniq(form.departments), departmentNames: uniq(form.departments) } }; const saved = await saveTenantZoneRule(requestJson, payload); const savedRule = normZone(saved?.item || saved?.rule || saved?.zoneRule || { ...payload, ruleId: form.ruleId }); const next = upper(savedRule.ruleId || form.ruleId || ''); if (next) { const optimisticRule = zoneFormToRule(form, next); const mergedRule = normZone({ ...optimisticRule, ...savedRule, ruleId: next }); setCachedItems(upsertById(items, mergedRule, 'ruleId')); setSelectedId(next); setForm(zoneForm(mergedRule)); setMode('detail'); } else close(); })}>Guardar zona</button>{form.ruleId ? <button type="button" className="danger" disabled={busy || !canManageLabels} onClick={() => runAction?.('Zona eliminada', async () => { await deleteTenantZoneRule(requestJson, form.ruleId); const nextItems = items.filter((item) => upper(item.ruleId) !== upper(form.ruleId)); setCachedItems(nextItems); close(); })}>Eliminar</button> : null}<button type="button" className="saas-btn-cancel" disabled={busy} onClick={close}>Cancelar</button></div></SaasDetailPanelSection>
        </>}
    </SaasDetailPanel>;
    return <SaasEntityPage title="Zonas" sectionKey="tenant_zone_rules_inner" rows={buildLabelRows(visible, 'ruleId', 'zone')} columns={LABEL_TABLE_COLUMNS} selectedId={mode === 'list' ? '' : selectedId} onSelect={(row) => openDetail(row)} onClose={close} renderDetail={() => right} renderForm={() => right} mode={mode === 'create' || mode === 'edit' ? 'form' : 'detail'} dirty={mode === 'create' || mode === 'edit'} requestJson={requestJson} loading={loading} emptyText="No hay zonas para mostrar." searchPlaceholder="Buscar zona" actions={[{ key: 'recalculate', label: recalc ? `Recalc: ${recalc.assigned || 0}` : 'Recalcular zonas', onClick: () => runAction?.('Zonas recalculadas', async () => setRecalc(await recalculateTenantZones(requestJson))), disabled: busy || !canManageLabels }, { key: 'reload', label: 'Recargar', onClick: () => load({ force: true }).catch((e) => setError?.(String(e?.message || e))), disabled: busy || loading }, { key: 'create', label: 'Nuevo', onClick: openCreate, disabled: busy || !canManageLabels }]} filters={ZONE_FILTERS} layoutClassName="saas-labels-layout" detailShell={false} hideCloseButton />;
}

function OperationalPanel({ context }) {
    const { busy, loadingLabels, settingsTenantId, loadTenantLabels, setError, canManageLabels, openTenantLabelCreate, labelSearch, setLabelSearch, visibleTenantLabels, selectedTenantLabel, labelPanelMode, setSelectedLabelId, setLabelPanelMode, openTenantLabelEdit, runAction, deactivateTenantLabel, waModules, labelForm, setLabelForm, normalizeTenantLabelColor, DEFAULT_LABEL_COLORS, toggleModuleInLabelForm, saveTenantLabel, cancelTenantLabelEdit } = context;
    const close = useCallback(() => {
        if (labelPanelMode === 'create' || labelPanelMode === 'edit') cancelTenantLabelEdit?.();
        else { setSelectedLabelId?.(''); setLabelPanelMode?.('list'); }
    }, [cancelTenantLabelEdit, labelPanelMode, setLabelPanelMode, setSelectedLabelId]);
    useEscape(labelPanelMode === 'create' || labelPanelMode === 'edit' || Boolean(selectedTenantLabel), close);
    return <div className="saas-admin-master-detail saas-labels-operational"><aside className="saas-admin-master-pane"><div className="saas-admin-pane-header"><div><h3>Operativas</h3><small>Etiquetas actuales para clasificar chats por modulo.</small></div><div className="saas-admin-list-actions saas-admin-list-actions--row"><button type="button" disabled={busy || loadingLabels || !settingsTenantId} onClick={() => settingsTenantId && loadTenantLabels(settingsTenantId).catch((e) => setError(String(e?.message || e || 'No se pudieron recargar etiquetas.')))}>Recargar</button><button type="button" disabled={busy || !canManageLabels || !settingsTenantId} onClick={openTenantLabelCreate}>Nueva etiqueta</button></div></div>{!settingsTenantId ? <div className="saas-admin-empty-state"><h4>Selecciona una empresa</h4><p>Primero elige una empresa para administrar etiquetas operativas.</p></div> : <><div className="saas-admin-form-row"><input value={labelSearch} onChange={(e) => setLabelSearch(e.target.value)} placeholder="Filtrar etiquetas" disabled={loadingLabels} /></div><div className="saas-admin-list saas-admin-list--compact saas-labels-scroll-list">{visibleTenantLabels.length === 0 ? <div className="saas-admin-empty-state"><h4>Sin etiquetas</h4><p>Crea tu primera etiqueta para clasificar chats.</p></div> : visibleTenantLabels.map((label) => <button key={`tenant_label_${label.labelId}`} type="button" className={`saas-admin-list-item saas-admin-list-item--button ${(selectedTenantLabel?.labelId === label.labelId && labelPanelMode !== 'create') ? 'active' : ''}`.trim()} onClick={() => { setSelectedLabelId(String(label.labelId || '').trim().toUpperCase()); setLabelPanelMode('view'); }}><strong><Dot color={label.color || '#00A884'} />{label.name || label.labelId}</strong><small>{label.labelId}</small><small>{label.moduleIds.length > 0 ? `Modulos: ${label.moduleIds.length}` : 'Compartida'} | {label.isActive === false ? 'inactiva' : 'activa'}</small></button>)}</div></>}</aside><div className="saas-admin-detail-pane">{settingsTenantId && (selectedTenantLabel || labelPanelMode === 'create') ? <><div className="saas-admin-pane-header"><div><h3>{labelPanelMode === 'create' ? 'Nueva etiqueta' : labelPanelMode === 'edit' ? 'Editando etiqueta' : selectedTenantLabel?.name || selectedTenantLabel?.labelId || 'Etiqueta'}</h3><small>{labelPanelMode === 'view' ? 'Vista bloqueada' : 'Edicion activa'} | Escape cierra este panel.</small></div><div className="saas-admin-list-actions saas-admin-list-actions--row">{labelPanelMode === 'view' && selectedTenantLabel && canManageLabels ? <><button type="button" disabled={busy} onClick={openTenantLabelEdit}>Editar</button><button type="button" disabled={busy} onClick={() => runAction('Etiqueta desactivada', async () => deactivateTenantLabel(selectedTenantLabel?.labelId))}>Desactivar</button></> : null}<button type="button" className="saas-btn-cancel" disabled={busy} onClick={close}>Volver</button></div></div>{labelPanelMode === 'view' && selectedTenantLabel ? <div className="saas-admin-detail-grid"><div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedTenantLabel.labelId || '-'}</strong></div><div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedTenantLabel.name || '-'}</strong></div><div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenantLabel.isActive === false ? 'Inactiva' : 'Activa'}</strong></div><div className="saas-admin-detail-field"><span>Color</span><strong><Dot color={selectedTenantLabel.color || '#00A884'} />{selectedTenantLabel.color || '#00A884'}</strong></div></div> : null}{(labelPanelMode === 'create' || labelPanelMode === 'edit') ? <><div className="saas-admin-form-row"><input value={labelForm.name} onChange={(e) => setLabelForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre de etiqueta" disabled={busy} /><input value={labelForm.labelId} onChange={(e) => setLabelForm((p) => ({ ...p, labelId: String(e.target.value || '').trim().toUpperCase() }))} placeholder="Codigo" disabled={busy || labelPanelMode === 'edit'} /></div><div className="saas-admin-form-row"><input value={labelForm.description} onChange={(e) => setLabelForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descripcion" disabled={busy} /><input type="number" min="1" value={labelForm.sortOrder} onChange={(e) => setLabelForm((p) => ({ ...p, sortOrder: e.target.value }))} placeholder="Orden" disabled={busy} /></div><div className="saas-admin-form-row"><input type="color" value={normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0])} onChange={(e) => setLabelForm((p) => ({ ...p, color: e.target.value }))} disabled={busy} /><label className="saas-admin-module-toggle"><input type="checkbox" checked={labelForm.isActive !== false} onChange={(e) => setLabelForm((p) => ({ ...p, isActive: e.target.checked }))} disabled={busy} /><span>Activa</span></label></div><div className="saas-admin-related-block"><h4>Asignacion por modulo</h4><div className="saas-admin-modules" style={{ marginTop: '8px' }}>{waModules.map((m) => { const moduleId = String(m?.moduleId || '').trim().toLowerCase(); const checked = Array.isArray(labelForm.moduleIds) && labelForm.moduleIds.includes(moduleId); return <label key={`assignment_module_${moduleId}`} className="saas-admin-module-toggle"><input type="checkbox" checked={checked} onChange={() => toggleModuleInLabelForm(moduleId)} disabled={busy} /><span>{m?.name || moduleId}</span></label>; })}</div></div><div className="saas-admin-form-row saas-admin-form-row--actions"><button type="button" disabled={busy || !canManageLabels || !String(labelForm.name || '').trim()} onClick={() => runAction(labelPanelMode === 'create' ? 'Etiqueta creada' : 'Etiqueta actualizada', async () => saveTenantLabel())}>{labelPanelMode === 'create' ? 'Guardar etiqueta' : 'Actualizar etiqueta'}</button><button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelTenantLabelEdit}>Cancelar</button></div></> : null}</> : <Empty title="Selecciona una etiqueta" body="El detalle se muestra en este panel." />}</div></div>;
}

function OperationalPanelUnified({ context }) {
    const { busy, loadingLabels, settingsTenantId, loadTenantLabels, setError, canManageLabels, openTenantLabelCreate, labelSearch, setLabelSearch, visibleTenantLabels, selectedTenantLabel, labelPanelMode, setSelectedLabelId, setLabelPanelMode, openTenantLabelEdit, runAction, deactivateTenantLabel, waModules, labelForm, setLabelForm, normalizeTenantLabelColor, DEFAULT_LABEL_COLORS, toggleModuleInLabelForm, saveTenantLabel, cancelTenantLabelEdit } = context;
    const selectedId = labelPanelMode === 'create' ? '__create_operational' : selectedTenantLabel?.labelId || '';
    const close = useCallback(() => {
        if (labelPanelMode === 'create' || labelPanelMode === 'edit') cancelTenantLabelEdit?.();
        else { setSelectedLabelId?.(''); setLabelPanelMode?.('list'); }
    }, [cancelTenantLabelEdit, labelPanelMode, setLabelPanelMode, setSelectedLabelId]);
    useEscape(labelPanelMode === 'create' || labelPanelMode === 'edit' || Boolean(selectedTenantLabel), close);

    if (!settingsTenantId) return <Empty title="Selecciona una empresa" body="Primero elige una empresa para administrar etiquetas operativas." />;

    const openDetail = (label) => {
        setSelectedLabelId?.(String(label.labelId || '').trim().toUpperCase());
        setLabelPanelMode?.('view');
    };
    const left = <div className="saas-labels-pane"><LabelsTable kind="operational" items={visibleTenantLabels} selectedId={selectedId} idField="labelId" emptyText="No hay etiquetas operativas para mostrar." onSelect={openDetail} /></div>;
    const isEditing = labelPanelMode === 'create' || labelPanelMode === 'edit';
    const right = <SaasDetailPanel title={labelPanelMode === 'create' ? 'Nueva operativa' : labelPanelMode === 'edit' ? 'Editar operativa' : selectedTenantLabel?.name || 'Etiqueta operativa'} subtitle={isEditing ? 'Configura la etiqueta, color, orden y modulos donde aplica.' : 'Etiqueta operativa del tenant.'} className="saas-labels-detail-panel" actions={<>{labelPanelMode === 'view' && selectedTenantLabel && canManageLabels ? <><button type="button" disabled={busy} onClick={openTenantLabelEdit}>Editar</button><button type="button" className="danger" disabled={busy} onClick={() => runAction?.('Etiqueta desactivada', async () => deactivateTenantLabel(selectedTenantLabel?.labelId))}>Desactivar</button></> : null}<button type="button" className="saas-btn-cancel" disabled={busy} onClick={close}>Volver</button></>}>
        {labelPanelMode === 'view' && selectedTenantLabel ? <SaasDetailPanelSection title="Detalle"><div className="saas-admin-detail-grid"><div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedTenantLabel.labelId || '-'}</strong></div><div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedTenantLabel.name || '-'}</strong></div><div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenantLabel.isActive === false ? 'Inactiva' : 'Activa'}</strong></div><div className="saas-admin-detail-field"><span>Color</span><strong><Dot color={selectedTenantLabel.color || '#00A884'} />{selectedTenantLabel.color || '#00A884'}</strong></div><div className="saas-admin-detail-field"><span>Modulos</span><strong>{selectedTenantLabel.moduleIds?.length ? selectedTenantLabel.moduleIds.length : 'Compartida'}</strong></div></div>{selectedTenantLabel.description ? <p className="saas-labels-detail-description">{selectedTenantLabel.description}</p> : null}</SaasDetailPanelSection> : null}
        {isEditing ? <><SaasDetailPanelSection title="Datos base"><div className="saas-admin-form-row"><input value={labelForm.name} onChange={(e) => setLabelForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre de etiqueta" disabled={busy} /><input value={labelForm.labelId} onChange={(e) => setLabelForm((p) => ({ ...p, labelId: String(e.target.value || '').trim().toUpperCase() }))} placeholder="Codigo" disabled={busy || labelPanelMode === 'edit'} /></div><div className="saas-admin-form-row"><input value={labelForm.description} onChange={(e) => setLabelForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descripcion" disabled={busy} /><input type="number" min="1" value={labelForm.sortOrder} onChange={(e) => setLabelForm((p) => ({ ...p, sortOrder: e.target.value }))} placeholder="Orden" disabled={busy} /></div><div className="saas-admin-form-row"><ColorPicker value={normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0])} disabled={busy} onChange={(color) => setLabelForm((p) => ({ ...p, color }))} /><label className="saas-admin-module-toggle"><input type="checkbox" checked={labelForm.isActive !== false} onChange={(e) => setLabelForm((p) => ({ ...p, isActive: e.target.checked }))} disabled={busy} /><span>Activa</span></label></div></SaasDetailPanelSection><SaasDetailPanelSection title="Asignacion por modulo"><div className="saas-admin-modules">{waModules.map((m) => { const moduleId = String(m?.moduleId || '').trim().toLowerCase(); const checked = Array.isArray(labelForm.moduleIds) && labelForm.moduleIds.includes(moduleId); return <label key={`assignment_module_${moduleId}`} className="saas-admin-module-toggle"><input type="checkbox" checked={checked} onChange={() => toggleModuleInLabelForm(moduleId)} disabled={busy} /><span>{m?.name || moduleId}</span></label>; })}</div></SaasDetailPanelSection><SaasDetailPanelSection title="Acciones"><div className="saas-admin-form-row saas-admin-form-row--actions"><button type="button" disabled={busy || !canManageLabels || !String(labelForm.name || '').trim()} onClick={() => runAction?.(labelPanelMode === 'create' ? 'Etiqueta creada' : 'Etiqueta actualizada', async () => saveTenantLabel())}>{labelPanelMode === 'create' ? 'Guardar etiqueta' : 'Actualizar etiqueta'}</button><button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelTenantLabelEdit}>Cancelar</button></div></SaasDetailPanelSection></> : null}
    </SaasDetailPanel>;
    return <SaasEntityPage title="Operativas" sectionKey="tenant_operational_labels_inner" rows={buildLabelRows(visibleTenantLabels, 'labelId', 'operational')} columns={LABEL_TABLE_COLUMNS} selectedId={selectedId} onSelect={(row) => openDetail(row)} onClose={close} renderDetail={() => right} renderForm={() => right} mode={isEditing ? 'form' : 'detail'} dirty={isEditing} loading={loadingLabels} emptyText="No hay etiquetas operativas para mostrar." searchPlaceholder="Buscar etiqueta operativa" actions={[{ key: 'reload', label: 'Recargar', onClick: () => settingsTenantId && loadTenantLabels(settingsTenantId).catch((e) => setError?.(String(e?.message || e || 'No se pudieron recargar etiquetas.'))), disabled: busy || loadingLabels || !settingsTenantId }, { key: 'create', label: 'Nuevo', onClick: openTenantLabelCreate, disabled: busy || !canManageLabels || !settingsTenantId }]} filters={OPERATIONAL_LABEL_FILTERS} layoutClassName="saas-labels-layout" detailShell={false} hideCloseButton />;
}

export default function TenantLabelsSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const normalizedRole = String(context?.normalizedRole || context?.userRole || context?.currentUser?.role || '').trim().toLowerCase();
    const actorRole = String(context?.actorRoleForPolicy || '').trim().toLowerCase();
    const isSuperAdmin = Boolean(context?.isSuperAdmin || normalizedRole === 'superadmin' || actorRole === 'superadmin' || context?.canViewSuperAdminSections);
    const labelsScope = String(context?.labelsScope || 'tenant').trim().toLowerCase();
    const isGlobalScope = labelsScope === 'global';
    const tenantAvailable = Boolean(context?.settingsTenantId) && !context?.tenantScopeLocked;
    const [tenantTab, setTenantTab] = useState('zones');
    useEffect(() => {
        context?.setSelectedLabelId?.('');
        context?.setLabelPanelMode?.('view');
    }, [context?.setLabelPanelMode, context?.setSelectedLabelId, labelsScope, tenantTab]);
    const tabLabel = isGlobalScope ? 'Globales' : tenantTab === 'zones' ? 'Zonas' : 'Operativas';
    return <SaasEntityPage
        id="saas_etiquetas"
        sectionKey={isGlobalScope ? 'global_labels' : `tenant_labels_${tenantTab}`}
        selectedId=""
        className="saas-entity-page--labels saas-labels-section"
    >
        <div className="saas-admin-pane-header saas-labels-header"><div><h3>{isGlobalScope ? 'Etiquetas globales' : 'Etiquetas del tenant'}</h3><small>{isGlobalScope ? 'Catalogo comercial global administrado por superadmin.' : 'Zonas y etiquetas operativas propias de la empresa seleccionada.'}</small></div><span className="saas-labels-current-pill">{tabLabel}</span></div>{isGlobalScope ? <GlobalPanel {...context} isSuperAdmin={isSuperAdmin} /> : <>{!tenantAvailable ? <div className="saas-labels-tenant-hint">Selecciona una empresa para administrar zonas y etiquetas operativas.</div> : null}<div className="saas-admin-tabs saas-admin-tabs--secondary"><button type="button" className={tenantTab === 'zones' ? 'active' : ''} onClick={() => setTenantTab('zones')}>Zonas</button><button type="button" className={tenantTab === 'operational' ? 'active' : ''} onClick={() => setTenantTab('operational')}>Operativas</button></div>{tenantTab === 'zones' ? <ZonePanel {...context} /> : <OperationalPanelUnified context={context} />}</>}
    </SaasEntityPage>;
}
