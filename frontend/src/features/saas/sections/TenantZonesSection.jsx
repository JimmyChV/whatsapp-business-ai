import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SaasDataTable, SaasDetailPanel, SaasDetailPanelSection, SaasEntityPage } from '../components/layout';
import {
    deleteTenantZoneRule,
    getCachedTenantZoneRules,
    hasCachedTenantZoneRules,
    loadCachedTenantZoneRules,
    normalizeTenantZonePaymentMethods,
    normalizeTenantZonePaymentModality,
    normalizeTenantZoneRule,
    normalizeTenantZoneShippingOptions,
    recalculateTenantZones,
    removeCachedTenantZoneRule,
    saveTenantZoneRule,
    setCachedTenantZoneRules,
    syncTenantLogisticsAgencies,
    syncTenantZonesFromWooCommerce,
    upsertCachedTenantZoneRule
} from '../services';

const EMPTY_PAYMENT_MODALITY = { advance: true, cash_on_delivery: false };
const EMPTY_ZONE = {
    ruleId: '',
    name: '',
    color: '#00A884',
    departments: [],
    provinces: [],
    districts: [],
    departmentId: '',
    provinceId: '',
    districtId: '',
    shippingOptions: [],
    paymentMethods: { yape: false, plin: false, bank_transfer: false, credit_card: false, cash: false },
    paymentModality: { ...EMPTY_PAYMENT_MODALITY },
    wooZoneId: null,
    postalCodes: [],
    wooPostalCodes: [],
    manualPostalCodes: [],
    postalCodeInput: '',
    ubigeoCodes: [],
    ubigeoLabels: {},
    wooRules: null,
    segmentKey: '',
    agenciesConfig: {},
    isActive: true
};
const LABEL_COLORS = ['#00A884', '#14B8A6', '#38BDF8', '#6366F1', '#8B5CF6', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#84CC16'];
const zoneGeoCache = new Map();

const text = (value = '') => String(value || '').trim();
const upper = (value = '') => text(value).toUpperCase();
const key = (value = '') => text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const uniq = (items = []) => Array.from(new Set((Array.isArray(items) ? items : []).map(text).filter(Boolean)));
const moneyValue = (value) => (value === null || value === undefined || value === '' ? '' : String(value));

const paymentMethodLabels = {
    yape: 'Yape',
    plin: 'Plin',
    bank_transfer: 'Transferencia bancaria',
    credit_card: 'Tarjeta de credito'
};
const paymentMethodEntries = () => [...Object.entries(paymentMethodLabels), ['cash', 'Efectivo']];
const paymentModalityLabels = { advance: 'Anticipado', cash_on_delivery: 'Contraentrega' };

const ZONE_TABLE_COLUMNS = [
    { key: 'color', label: '', width: '54px', render: (value) => <Dot color={value || '#00A884'} /> },
    { key: 'name', label: 'Nombre', minWidth: '220px', render: (value, row) => <strong>{value || row.code}</strong> },
    { key: 'code', label: 'Codigo', minWidth: '150px', hidden: true },
    { key: 'metaText', label: 'Alcance', minWidth: '170px' },
    { key: 'updatedAtText', label: 'Actualizado', minWidth: '170px', hidden: true },
    { key: 'statusText', label: 'Estado', width: '110px' }
];

const ZONE_FILTERS = [
    { key: 'name', label: 'Nombre', type: 'text' },
    { key: 'code', label: 'Codigo', type: 'text' },
    { key: 'metaText', label: 'Alcance', type: 'text' },
    { key: 'statusText', label: 'Estado', type: 'option', options: [{ value: 'Activa', label: 'Activa' }, { value: 'Inactiva', label: 'Inactiva' }] }
];

function Dot({ color = '#00A884' }) {
    return <span className="saas-label-color-dot" style={{ '--label-color': color }} />;
}

function ColorPicker({ value = '#00A884', onChange, disabled = false }) {
    const current = text(value || '#00A884') || '#00A884';
    return (
        <div className="saas-label-color-picker">
            <div className="saas-label-color-picker__preview" style={{ '--label-color': current }}>
                <span />
                <strong>{current}</strong>
                <input type="color" value={current} disabled={disabled} onChange={(event) => onChange?.(event.target.value)} aria-label="Color personalizado" />
            </div>
            <div className="saas-label-color-picker__swatches">
                {LABEL_COLORS.map((color) => (
                    <button
                        key={color}
                        type="button"
                        className={current.toLowerCase() === color.toLowerCase() ? 'active' : ''}
                        style={{ '--label-color': color }}
                        disabled={disabled}
                        onClick={() => onChange?.(color)}
                        aria-label={`Usar color ${color}`}
                    />
                ))}
            </div>
        </div>
    );
}

function Empty({ title, body }) {
    return <div className="saas-admin-empty-state saas-admin-empty-state--detail"><h4>{title}</h4><p>{body}</p></div>;
}

function useEscape(active, close) {
    useEffect(() => {
        if (!active) return undefined;
        const onKey = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close?.();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, close]);
}

function runZoneAction(runSectionAction, runAction, actionKey, label, action) {
    if (typeof runSectionAction === 'function') {
        return runSectionAction(actionKey, action, { successMessage: label, label: 'zona de envio' });
    }
    if (typeof runAction === 'function') return runAction(label, action);
    return action?.();
}

function Chips({ title, items = [], remove, readonly = false }) {
    return (
        <div className="saas-labels-zone-chip-block">
            <span>{title}</span>
            <div className="saas-labels-zone-chips">
                {items.length ? items.map((item) => (
                    <button key={`${title}_${item}`} type="button" disabled={readonly} onClick={() => remove?.(item)}>
                        {item}
                        {readonly ? null : <strong>x</strong>}
                    </button>
                )) : <small>Sin valores.</small>}
            </div>
        </div>
    );
}

function normGeo(item = {}, type = '') {
    const id = text(item.id || item[`${type}Id`] || item[`${type}_id`] || item.codigo || item.code || item.ubigeo || item.name);
    return {
        id,
        name: text(item.name || item.label || item.nombre || item.value || id),
        departmentId: text(item.departmentId || item.department_id || item.parentDepartmentId || item.parent_department_id),
        provinceId: text(item.provinceId || item.province_id || item.parentProvinceId || item.parent_province_id)
    };
}

function geoFieldForType(type = '') {
    const cleanType = text(type).toLowerCase();
    if (cleanType === 'department') return 'departments';
    if (cleanType === 'province') return 'provinces';
    if (cleanType === 'district') return 'districts';
    return '';
}

function geoNameForItem(item = {}) {
    const type = text(item.type).toLowerCase();
    if (type === 'department') return text(item.department || item.name || item.label);
    if (type === 'province') return text(item.province || item.name || item.label);
    if (type === 'district') return text(item.district || item.name || item.label);
    return text(item.name || item.label);
}

function geoLabelForItem(item = {}) {
    return text(item.label || [item.district, item.province, item.department].filter(Boolean).join(', ') || item.name || item.id);
}

function zoneForm(item = null) {
    if (!item) return { ...EMPTY_ZONE };
    const zone = normalizeTenantZoneRule(item);
    const rules = zone.rulesJson || {};
    const manualPostalCodes = uniq(rules.manualPostalCodes || []);
    const postalCodes = uniq(zone.postalCodes || []);
    const wooPostalCodes = postalCodes.filter((code) => !manualPostalCodes.includes(code));
    return {
        ...EMPTY_ZONE,
        ruleId: zone.ruleId,
        name: zone.name,
        color: zone.color,
        departments: uniq(rules.departments || rules.departmentNames || rules.departamentos || []),
        provinces: uniq(rules.provinces || rules.provinceNames || rules.provincias || []),
        districts: uniq(rules.districts || rules.districtNames || rules.distritos || []),
        shippingOptions: normalizeTenantZoneShippingOptions(zone.shippingOptions),
        paymentMethods: normalizeTenantZonePaymentMethods(zone.paymentMethods),
        paymentModality: normalizeTenantZonePaymentModality(zone.paymentModality),
        wooZoneId: zone.wooZoneId || null,
        postalCodes,
        wooPostalCodes,
        manualPostalCodes,
        ubigeoCodes: uniq(zone.ubigeoCodes || []),
        ubigeoLabels: rules.ubigeoLabels && typeof rules.ubigeoLabels === 'object' ? rules.ubigeoLabels : {},
        wooRules: rules.woo && typeof rules.woo === 'object' ? rules.woo : null,
        segmentKey: text(zone.segmentKey || ''),
        agenciesConfig: zone.agenciesConfig && typeof zone.agenciesConfig === 'object' ? zone.agenciesConfig : {},
        isActive: zone.isActive !== false
    };
}

function zoneFormToRule(form = {}, fallbackRuleId = '') {
    return normalizeTenantZoneRule({
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
            departmentNames: uniq(form.departments),
            manualPostalCodes: uniq(form.manualPostalCodes),
            ubigeoLabels: form.ubigeoLabels && typeof form.ubigeoLabels === 'object' ? form.ubigeoLabels : {},
            ...(form.wooRules ? { woo: form.wooRules } : {})
        },
        shippingOptions: normalizeTenantZoneShippingOptions(form.shippingOptions),
        paymentMethods: normalizeTenantZonePaymentMethods(form.paymentMethods),
        paymentModality: normalizeTenantZonePaymentModality(form.paymentModality),
        wooZoneId: form.wooZoneId || null,
        postalCodes: uniq([...(form.wooPostalCodes || []), ...(form.manualPostalCodes || [])]),
        ubigeoCodes: uniq(form.ubigeoCodes),
        segmentKey: text(form.segmentKey || ''),
        agenciesConfig: form.agenciesConfig && typeof form.agenciesConfig === 'object' ? form.agenciesConfig : {}
    });
}

function buildZoneRows(items = []) {
    return (Array.isArray(items) ? items : []).map((item) => {
        const zone = normalizeTenantZoneRule(item);
        return {
            ...zone,
            id: zone.ruleId,
            code: zone.ruleId,
            statusText: zone.isActive === false ? 'Inactiva' : 'Activa',
            metaText: 'Regla geografica',
            updatedAtText: text(item?.updatedAt || item?.updated_at || '-')
        };
    });
}

function ZonesTable({ items = [], selectedId = '', onSelect }) {
    const rows = buildZoneRows(items);
    return (
        <SaasDataTable
            columns={ZONE_TABLE_COLUMNS}
            rows={rows}
            selectedId={selectedId}
            onSelect={(row) => {
                const source = items.find((item) => upper(item?.ruleId || '') === upper(row?.id || '')) || row;
                onSelect?.(source);
            }}
            emptyText="No hay zonas para mostrar."
            enableInfinite={false}
        />
    );
}

export default function TenantZonesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        busy,
        requestJson,
        runAction,
        runSectionAction,
        setError,
        canManageZones,
        canViewZones = true,
        tenantScopeLocked,
        settingsTenantId,
        ensureSectionData,
        isLoading,
        getError,
        getReloadToken,
        forceReload,
        loadedSections
    } = context;

    const zoneCacheKey = text(settingsTenantId || '');
    const [items, setItems] = useState(() => getCachedTenantZoneRules(zoneCacheKey));
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [mode, setMode] = useState('list');
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState({ ...EMPTY_ZONE });
    const [geo, setGeo] = useState({ departments: [], provinces: [], districts: [] });
    const [geoLoading, setGeoLoading] = useState(false);
    const [geoSearch, setGeoSearch] = useState('');
    const [geoSearchResults, setGeoSearchResults] = useState([]);
    const [geoSearchLoading, setGeoSearchLoading] = useState(false);
    const [recalc, setRecalc] = useState(null);
    const [agencySync, setAgencySync] = useState(null);
    const lazySectionId = 'zones';
    const sectionReloadToken = typeof getReloadToken === 'function' ? getReloadToken(lazySectionId) : 0;
    const sectionLoading = (typeof isLoading === 'function' && isLoading(lazySectionId)) || loading;
    const sectionError = typeof getError === 'function' ? getError(lazySectionId) : '';

    const departments = useMemo(() => (Array.isArray(geo.departments) ? geo.departments : []).map((x) => normGeo(x, 'department')).filter((x) => x.id && x.name), [geo.departments]);
    const provinces = useMemo(() => (Array.isArray(geo.provinces) ? geo.provinces : []).map((x) => normGeo(x, 'province')).filter((x) => x.id && x.name), [geo.provinces]);
    const districts = useMemo(() => (Array.isArray(geo.districts) ? geo.districts : []).map((x) => normGeo(x, 'district')).filter((x) => x.id && x.name), [geo.districts]);
    const provinceOptions = useMemo(() => (form.departmentId ? provinces.filter((x) => !x.departmentId || x.departmentId === form.departmentId) : provinces), [form.departmentId, provinces]);
    const districtOptions = useMemo(() => (form.provinceId ? districts.filter((x) => !x.provinceId || x.provinceId === form.provinceId) : districts), [districts, form.provinceId]);
    const selected = useMemo(() => items.find((x) => x.ruleId === selectedId) || null, [items, selectedId]);
    const visible = useMemo(() => items.filter((x) => !key(search) || key(`${x.ruleId} ${x.name}`).includes(key(search))), [items, search]);
    const needsGeoCatalog = mode === 'create' || mode === 'edit';

    const close = useCallback(() => {
        setMode('list');
        setSelectedId('');
        setForm({ ...EMPTY_ZONE });
    }, []);
    useEscape(mode !== 'list', close);

    const setCachedItems = useCallback((nextItems) => {
        setItems(setCachedTenantZoneRules(zoneCacheKey, nextItems));
    }, [zoneCacheKey]);

    const load = useCallback(async ({ force = false } = {}) => {
        if (!requestJson || tenantScopeLocked || !settingsTenantId) return;
        if (!force && hasCachedTenantZoneRules(zoneCacheKey)) {
            setItems(getCachedTenantZoneRules(zoneCacheKey));
            return;
        }
        setLoading(true);
        try {
            const cached = await loadCachedTenantZoneRules(requestJson, {
                includeInactive: true,
                tenantId: zoneCacheKey,
                force
            });
            setItems(cached);
        } finally {
            setLoading(false);
        }
    }, [requestJson, settingsTenantId, tenantScopeLocked, zoneCacheKey]);

    useEffect(() => {
        if (!settingsTenantId || tenantScopeLocked) return;
        setItems(hasCachedTenantZoneRules(zoneCacheKey) ? getCachedTenantZoneRules(zoneCacheKey) : []);
    }, [loadedSections, sectionLoading, settingsTenantId, tenantScopeLocked, zoneCacheKey]);

    useEffect(() => {
        if (typeof ensureSectionData !== 'function') {
            load().catch((error) => setError?.(String(error?.message || error || 'No se pudieron cargar zonas.')));
            return;
        }
        void ensureSectionData(
            lazySectionId,
            () => load({ force: sectionReloadToken > 0 }),
            {
                canLoad: Boolean(canViewZones && settingsTenantId && !tenantScopeLocked),
                forceReload: sectionReloadToken > 0,
                reloadToken: sectionReloadToken,
                deps: [settingsTenantId]
            }
        );
    }, [canViewZones, ensureSectionData, load, sectionReloadToken, setError, settingsTenantId, tenantScopeLocked]);

    useEffect(() => {
        if (!requestJson || tenantScopeLocked || !settingsTenantId || !needsGeoCatalog) return undefined;
        const cachedGeo = zoneGeoCache.get(zoneCacheKey);
        if (cachedGeo) {
            setGeo(cachedGeo);
            return undefined;
        }
        let cancelled = false;
        setGeoLoading(true);
        requestJson('/api/tenant/customer-catalogs/geo', { method: 'GET' })
            .then((payload) => {
                if (cancelled) return;
                const nextGeo = {
                    departments: Array.isArray(payload?.departments) ? payload.departments : [],
                    provinces: Array.isArray(payload?.provinces) ? payload.provinces : [],
                    districts: Array.isArray(payload?.districts) ? payload.districts : []
                };
                zoneGeoCache.set(zoneCacheKey, nextGeo);
                setGeo(nextGeo);
            })
            .catch(() => {
                if (!cancelled) setGeo({ departments: [], provinces: [], districts: [] });
            })
            .finally(() => {
                if (!cancelled) setGeoLoading(false);
            });
        return () => { cancelled = true; };
    }, [needsGeoCatalog, requestJson, settingsTenantId, tenantScopeLocked, zoneCacheKey]);

    useEffect(() => {
        if (!requestJson || tenantScopeLocked || !settingsTenantId || !needsGeoCatalog) return undefined;
        const cleanQuery = text(geoSearch);
        if (cleanQuery.length < 2) {
            setGeoSearchResults([]);
            setGeoSearchLoading(false);
            return undefined;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            setGeoSearchLoading(true);
            requestJson(`/api/tenant/geo/search?q=${encodeURIComponent(cleanQuery)}&type=all&limit=20`, { method: 'GET' })
                .then((payload) => {
                    if (cancelled) return;
                    setGeoSearchResults(Array.isArray(payload?.items) ? payload.items : []);
                })
                .catch(() => {
                    if (!cancelled) setGeoSearchResults([]);
                })
                .finally(() => {
                    if (!cancelled) setGeoSearchLoading(false);
                });
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [geoSearch, needsGeoCatalog, requestJson, settingsTenantId, tenantScopeLocked]);

    if (tenantScopeLocked || !settingsTenantId) {
        return <Empty title="Selecciona una empresa" body="Las reglas de zona pertenecen a un tenant." />;
    }

    const openCreate = () => {
        if (!canManageZones) return;
        setMode('create');
        setSelectedId('__create_zone');
        setForm({ ...EMPTY_ZONE });
    };
    const openDetail = (item) => {
        setMode('detail');
        setSelectedId(item.ruleId);
        setForm(zoneForm(item));
    };
    const openEdit = () => {
        if (selected && canManageZones) {
            setMode('edit');
            setForm(zoneForm(selected));
        }
    };
    const addGeoRuleValue = (field, item = {}) => {
        const cleanName = geoNameForItem({ ...item, type: field === 'departments' ? 'department' : field === 'provinces' ? 'province' : 'district' });
        const id = text(item.id || item.locationId || item.code || '');
        const expectedPrefix = field === 'departments' ? 'DEP_' : field === 'provinces' ? 'PROV_' : field === 'districts' ? 'DIST_' : '';
        const shouldPersistId = Boolean(id && expectedPrefix && id.startsWith(expectedPrefix));
        if (!cleanName) return;
        setForm((previous) => ({
            ...previous,
            [field]: uniq([...(previous[field] || []), cleanName]),
            ubigeoCodes: shouldPersistId ? uniq([...(previous.ubigeoCodes || []), id]) : previous.ubigeoCodes,
            ubigeoLabels: shouldPersistId ? {
                ...(previous.ubigeoLabels || {}),
                [id]: geoLabelForItem({ ...item, name: cleanName })
            } : previous.ubigeoLabels
        }));
    };
    const removeValue = (field, value) => setForm((previous) => {
        const normalizedValue = key(value);
        const prefix = field === 'departments' ? 'DEP_' : field === 'provinces' ? 'PROV_' : field === 'districts' ? 'DIST_' : '';
        const sourceCatalog = field === 'departments' ? departments : field === 'provinces' ? provinces : field === 'districts' ? districts : [];
        const matchingIds = new Set(sourceCatalog
            .filter((item) => key(item.name) === normalizedValue)
            .map((item) => text(item.id))
            .filter(Boolean));
        const nextLabels = { ...(previous.ubigeoLabels || {}) };
        const nextCodes = (previous.ubigeoCodes || []).filter((code) => {
            const label = nextLabels[code] || '';
            const labelHead = key(label.split(',')[0] || label);
            const codeMatchesField = !prefix || text(code).startsWith(prefix);
            const shouldRemove = normalizedValue && codeMatchesField && (labelHead === normalizedValue || matchingIds.has(text(code)));
            if (shouldRemove) delete nextLabels[code];
            return !shouldRemove;
        });
        return {
            ...previous,
            [field]: (previous[field] || []).filter((item) => item !== value),
            ubigeoCodes: nextCodes,
            ubigeoLabels: nextLabels
        };
    });
    const addManualPostalCode = () => {
        const clean = text(form.postalCodeInput);
        if (!clean) return;
        setForm((previous) => ({
            ...previous,
            postalCodeInput: '',
            manualPostalCodes: uniq([...(previous.manualPostalCodes || []), clean])
        }));
    };
    const removeManualPostalCode = (value) => setForm((previous) => ({
        ...previous,
        manualPostalCodes: (previous.manualPostalCodes || []).filter((item) => item !== value)
    }));
    const addUbigeoCode = (item = {}) => {
        const id = text(item.id || item.locationId || item.code || '');
        if (!id) return;
        const label = geoLabelForItem(item);
        const field = geoFieldForType(item.type);
        const name = geoNameForItem(item);
        setForm((previous) => ({
            ...previous,
            ...(field && name ? { [field]: uniq([...(previous[field] || []), name]) } : {}),
            ubigeoCodes: uniq([...(previous.ubigeoCodes || []), id]),
            ubigeoLabels: {
                ...(previous.ubigeoLabels || {}),
                [id]: label
            }
        }));
        setGeoSearch('');
        setGeoSearchResults([]);
    };
    const removeUbigeoCode = (value) => setForm((previous) => {
        const nextLabels = { ...(previous.ubigeoLabels || {}) };
        delete nextLabels[value];
        return {
            ...previous,
            ubigeoCodes: (previous.ubigeoCodes || []).filter((item) => item !== value),
            ubigeoLabels: nextLabels
        };
    });
    const addShippingOption = () => setForm((previous) => ({
        ...previous,
        shippingOptions: [...normalizeTenantZoneShippingOptions(previous.shippingOptions), { type: 'delivery', label: 'Delivery propio', cost: 0, free_from: null, estimated_time: '', is_active: true }]
    }));
    const updateShippingOption = (index, patch) => setForm((previous) => ({
        ...previous,
        shippingOptions: normalizeTenantZoneShippingOptions(previous.shippingOptions).map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }));
    const removeShippingOption = (index) => setForm((previous) => ({
        ...previous,
        shippingOptions: normalizeTenantZoneShippingOptions(previous.shippingOptions).filter((_, itemIndex) => itemIndex !== index)
    }));
    const togglePaymentMethod = (method) => setForm((previous) => ({
        ...previous,
        paymentMethods: {
            ...normalizeTenantZonePaymentMethods(previous.paymentMethods),
            [method]: !normalizeTenantZonePaymentMethods(previous.paymentMethods)[method]
        }
    }));
    const togglePaymentModality = (modality) => setForm((previous) => ({
        ...previous,
        paymentModality: {
            ...normalizeTenantZonePaymentModality(previous.paymentModality),
            [modality]: !normalizeTenantZonePaymentModality(previous.paymentModality)[modality]
        }
    }));

    const shippingOptions = normalizeTenantZoneShippingOptions(form.shippingOptions);
    const paymentMethods = normalizeTenantZonePaymentMethods(form.paymentMethods);
    const paymentModality = normalizeTenantZonePaymentModality(form.paymentModality);
    const wooPostalCodes = uniq(form.wooPostalCodes || []);
    const manualPostalCodes = uniq(form.manualPostalCodes || []);
    const ubigeoCodes = uniq(form.ubigeoCodes || []);
    const detail = mode === 'detail' && selected;
    const right = (
        <SaasDetailPanel
            title={detail ? selected.name || 'Zona' : mode === 'create' ? 'Nueva zona' : 'Editar zona'}
            subtitle={detail ? 'Regla geografica del tenant.' : 'Agrega departamentos, provincias y distritos con selectores jerarquicos.'}
            className="saas-labels-detail-panel saas-zones-detail-panel"
            bodyClassName="saas-zones-detail-panel__body"
            actions={<>{detail && canManageZones ? <button type="button" disabled={busy} onClick={openEdit}>Editar</button> : null}<button type="button" className="saas-btn-cancel" disabled={busy} onClick={close}>Volver</button></>}
        >
            {detail ? (
                <>
                    <SaasDetailPanelSection title="Detalle">
                        <div className="saas-admin-detail-grid">
                            <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selected.ruleId}</strong></div>
                            <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selected.name || '-'}</strong></div>
                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selected.isActive ? 'Activa' : 'Inactiva'}</strong></div>
                            <div className="saas-admin-detail-field"><span>Color</span><strong><Dot color={selected.color} />{selected.color}</strong></div>
                        </div>
                        <div className="saas-labels-zone-readonly">
                            <Chips title="Departamentos" items={form.departments} readonly />
                            <Chips title="Provincias" items={form.provinces} readonly />
                            <Chips title="Distritos" items={form.districts} readonly />
                        </div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Cobertura geografica">
                        <div className="saas-labels-zone-readonly">
                            <Chips title="Codigos postales Woo" items={wooPostalCodes} readonly />
                            <Chips title="Codigos postales manuales" items={manualPostalCodes} readonly />
                            <Chips title="Ubigeos" items={ubigeoCodes.map((code) => form.ubigeoLabels?.[code] || code)} readonly />
                        </div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Opciones de envio">
                        <div className="saas-admin-related-list">
                            {shippingOptions.length ? shippingOptions.map((option, index) => (
                                <div key={`shipping_read_${index}`} className="saas-admin-detail-field">
                                    <span>{option.type === 'courier' ? `Courier ${option.label}` : option.label}</span>
                                    <strong>{option.is_active === false ? 'Inactivo' : `S/ ${Number(option.cost || 0).toFixed(2)}${option.free_from ? ` - gratis desde S/ ${Number(option.free_from).toFixed(2)}` : ''}${option.estimated_time ? ` - ${option.estimated_time}` : ''}`}</strong>
                                </div>
                            )) : <small>Sin opciones de envio configuradas.</small>}
                        </div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Metodos de pago">
                        <div className="saas-admin-detail-grid">{paymentMethodEntries().map(([method, label]) => <div key={`payment_read_${method}`} className="saas-admin-detail-field"><span>{label}</span><strong>{paymentMethods[method] ? 'Activo' : 'Inactivo'}</strong></div>)}</div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Modalidad de pago">
                        <div className="saas-admin-detail-grid">{Object.entries(paymentModalityLabels).map(([method, label]) => <div key={`payment_modality_read_${method}`} className="saas-admin-detail-field"><span>{label}</span><strong>{paymentModality[method] ? 'Activo' : 'Inactivo'}</strong></div>)}</div>
                    </SaasDetailPanelSection>
                </>
            ) : (
                <>
                    <SaasDetailPanelSection title="Datos base">
                        <div className="saas-admin-form-row">
                            <input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="Nombre de zona" disabled={busy} />
                            <ColorPicker value={form.color} disabled={busy} onChange={(color) => setForm((previous) => ({ ...previous, color }))} />
                        </div>
                        <label className="saas-admin-module-toggle">
                            <input type="checkbox" checked={form.isActive !== false} onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))} disabled={busy} />
                            <span>Zona activa</span>
                        </label>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Cobertura geografica">
                        <div className="saas-admin-related-list">
                            <div className="saas-admin-related-block">
                                <strong>Codigos postales</strong>
                                <Chips title="WooCommerce" items={wooPostalCodes} readonly />
                                <div className="saas-admin-form-row">
                                    <input value={form.postalCodeInput || ''} onChange={(event) => setForm((previous) => ({ ...previous, postalCodeInput: event.target.value }))} placeholder="Agregar codigo postal manual" disabled={busy} />
                                    <button type="button" className="saas-btn-cancel" disabled={busy || !text(form.postalCodeInput)} onClick={addManualPostalCode}>Agregar CP</button>
                                </div>
                                <Chips title="Manuales" items={manualPostalCodes} remove={removeManualPostalCode} />
                            </div>
                            <div className="saas-admin-related-block">
                                <strong>Ubigeos / mapeo manual</strong>
                                <div className="saas-admin-form-row">
                                    <input value={geoSearch} onChange={(event) => setGeoSearch(event.target.value)} placeholder="Buscar distrito, provincia o departamento" disabled={busy} />
                                    <span>{geoSearchLoading ? 'Buscando...' : 'Selecciona un resultado para agregarlo'}</span>
                                </div>
                                {geoSearchResults.length ? (
                                    <div className="saas-admin-related-list">
                                        {geoSearchResults.map((item) => (
                                            <button key={item.id} type="button" className="saas-btn-cancel" disabled={busy} onClick={() => addUbigeoCode(item)}>
                                                {item.label || item.name} - {item.type}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="saas-labels-zone-chips">
                                    {ubigeoCodes.length ? ubigeoCodes.map((code) => (
                                        <button key={`ubigeo_${code}`} type="button" disabled={busy} onClick={() => removeUbigeoCode(code)}>
                                            {form.ubigeoLabels?.[code] || code}
                                            <strong>x</strong>
                                        </button>
                                    )) : <small>Sin ubigeos manuales.</small>}
                                </div>
                            </div>
                        </div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Reglas geograficas">
                        <div className="saas-labels-zone-picker"><label><span>Departamento</span><select value={form.departmentId} disabled={busy || geoLoading} onChange={(event) => setForm((previous) => ({ ...previous, departmentId: event.target.value, provinceId: '', districtId: '' }))}><option value="">{geoLoading ? 'Cargando...' : 'Selecciona departamento'}</option>{departments.map((item) => <option key={`dep_${item.id}`} value={item.id}>{item.name}</option>)}</select></label><button type="button" disabled={!form.departmentId} onClick={() => addGeoRuleValue('departments', { ...departments.find((item) => item.id === form.departmentId), type: 'department' })}>Agregar departamento</button></div>
                        <div className="saas-labels-zone-picker"><label><span>Provincia</span><select value={form.provinceId} disabled={busy || geoLoading} onChange={(event) => setForm((previous) => ({ ...previous, provinceId: event.target.value, districtId: '' }))}><option value="">Selecciona provincia</option>{provinceOptions.map((item) => <option key={`prov_${item.id}`} value={item.id}>{item.name}</option>)}</select></label><button type="button" disabled={!form.provinceId} onClick={() => addGeoRuleValue('provinces', { ...provinces.find((item) => item.id === form.provinceId), type: 'province' })}>Agregar provincia</button></div>
                        <div className="saas-labels-zone-picker"><label><span>Distrito</span><select value={form.districtId} disabled={busy || geoLoading} onChange={(event) => setForm((previous) => ({ ...previous, districtId: event.target.value }))}><option value="">Selecciona distrito</option>{districtOptions.map((item) => <option key={`dist_${item.id}`} value={item.id}>{item.name}</option>)}</select></label><button type="button" disabled={!form.districtId} onClick={() => addGeoRuleValue('districts', { ...districts.find((item) => item.id === form.districtId), type: 'district' })}>Agregar distrito</button></div>
                        <Chips title="Departamentos" items={form.departments} remove={(value) => removeValue('departments', value)} />
                        <Chips title="Provincias" items={form.provinces} remove={(value) => removeValue('provinces', value)} />
                        <Chips title="Distritos" items={form.districts} remove={(value) => removeValue('districts', value)} />
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Opciones de envio">
                        <div className="saas-admin-related-list">
                            {shippingOptions.map((option, index) => (
                                <div key={`shipping_edit_${index}`} className="saas-admin-related-block">
                                    <div className="saas-admin-form-row">
                                        <select value={option.type} disabled={busy} onChange={(event) => updateShippingOption(index, { type: event.target.value, label: event.target.value === 'courier' && option.label === 'Delivery propio' ? 'Shalom' : option.label })}><option value="delivery">Delivery propio</option><option value="courier">Courier</option></select>
                                        <input value={option.label} onChange={(event) => updateShippingOption(index, { label: event.target.value })} placeholder={option.type === 'courier' ? 'Nombre del courier, ej: Shalom' : 'Nombre / label'} disabled={busy} />
                                    </div>
                                    <div className="saas-admin-form-row">
                                        <input type="number" min="0" step="0.1" value={moneyValue(option.cost)} onChange={(event) => updateShippingOption(index, { cost: event.target.value })} placeholder="Costo S/" disabled={busy} />
                                        <input type="number" min="0" step="0.1" value={moneyValue(option.free_from)} onChange={(event) => updateShippingOption(index, { free_from: event.target.value })} placeholder="Gratis desde S/ (opcional)" disabled={busy} />
                                    </div>
                                    <div className="saas-admin-form-row">
                                        <input value={option.estimated_time} onChange={(event) => updateShippingOption(index, { estimated_time: event.target.value })} placeholder="Tiempo estimado, ej: 1-2 dias habiles" disabled={busy} />
                                        <label className="saas-admin-module-toggle"><input type="checkbox" checked={option.is_active !== false} onChange={(event) => updateShippingOption(index, { is_active: event.target.checked })} disabled={busy} /><span>Activo</span></label>
                                        <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => removeShippingOption(index)}>Eliminar</button>
                                    </div>
                                </div>
                            ))}
                            {shippingOptions.length === 0 ? <small>Sin opciones. Agrega delivery propio o courier segun la zona.</small> : null}
                            <div className="saas-admin-form-row"><button type="button" className="saas-btn-cancel" disabled={busy} onClick={addShippingOption}>+ Agregar opcion de envio</button></div>
                        </div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Metodos de pago">
                        <div className="saas-admin-modules">{paymentMethodEntries().map(([method, label]) => <label key={`payment_edit_${method}`} className="saas-admin-module-toggle"><input type="checkbox" checked={paymentMethods[method] === true} onChange={() => togglePaymentMethod(method)} disabled={busy} /><span>{label}{method === 'credit_card' ? ' - Se acepta si el cliente lo solicita' : ''}</span></label>)}</div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Modalidad de pago">
                        <div className="saas-admin-modules">{Object.entries(paymentModalityLabels).map(([method, label]) => <label key={`payment_modality_edit_${method}`} className="saas-admin-module-toggle"><input type="checkbox" checked={paymentModality[method] === true} onChange={() => togglePaymentModality(method)} disabled={busy} /><span>{label}</span></label>)}</div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Acciones">
                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                            <button type="button" disabled={busy || !canManageZones || !text(form.name)} onClick={() => runZoneAction(runSectionAction, runAction, 'save_zone', 'Zona guardada', async () => {
                                const payload = {
                                    ruleId: form.ruleId || undefined,
                                    name: form.name,
                                    color: form.color,
                                    isActive: form.isActive !== false,
                                    rulesJson: {
                                        districts: uniq(form.districts),
                                        districtNames: uniq(form.districts),
                                        provinces: uniq(form.provinces),
                                        provinceNames: uniq(form.provinces),
                                        departments: uniq(form.departments),
                                        departmentNames: uniq(form.departments),
                                        manualPostalCodes: uniq(form.manualPostalCodes),
                                        ubigeoLabels: form.ubigeoLabels && typeof form.ubigeoLabels === 'object' ? form.ubigeoLabels : {},
                                        ...(form.wooRules ? { woo: form.wooRules } : {})
                                    },
                                    shippingOptions: normalizeTenantZoneShippingOptions(form.shippingOptions),
                                    paymentMethods: normalizeTenantZonePaymentMethods(form.paymentMethods),
                                    paymentModality: normalizeTenantZonePaymentModality(form.paymentModality),
                                    wooZoneId: form.wooZoneId || null,
                                    postalCodes: uniq([...(form.wooPostalCodes || []), ...(form.manualPostalCodes || [])]),
                                    ubigeoCodes: uniq(form.ubigeoCodes),
                                    segmentKey: text(form.segmentKey || ''),
                                    agenciesConfig: form.agenciesConfig && typeof form.agenciesConfig === 'object' ? form.agenciesConfig : {}
                                };
                                const saved = await saveTenantZoneRule(requestJson, payload, { tenantId: zoneCacheKey });
                                const savedRule = normalizeTenantZoneRule(saved?.item || saved?.rule || saved?.zoneRule || { ...payload, ruleId: form.ruleId });
                                const next = upper(savedRule.ruleId || form.ruleId || '');
                                if (next) {
                                    const optimisticRule = zoneFormToRule(form, next);
                                    const mergedRule = normalizeTenantZoneRule({ ...optimisticRule, ...savedRule, ruleId: next });
                                    upsertCachedTenantZoneRule(zoneCacheKey, mergedRule);
                                    setCachedItems(getCachedTenantZoneRules(zoneCacheKey));
                                    setSelectedId(next);
                                    setForm(zoneForm(mergedRule));
                                    setMode('detail');
                                } else close();
                            })}>Guardar zona</button>
                            {form.ruleId ? <button type="button" className="danger" disabled={busy || !canManageZones} onClick={() => runZoneAction(runSectionAction, runAction, 'delete_zone', 'Zona eliminada', async () => {
                                await deleteTenantZoneRule(requestJson, form.ruleId, { tenantId: zoneCacheKey });
                                removeCachedTenantZoneRule(zoneCacheKey, form.ruleId);
                                setItems(getCachedTenantZoneRules(zoneCacheKey));
                                close();
                            })}>Eliminar</button> : null}
                            <button type="button" className="saas-btn-cancel" disabled={busy} onClick={close}>Cancelar</button>
                        </div>
                    </SaasDetailPanelSection>
                </>
            )}
        </SaasDetailPanel>
    );

    return (
        <SaasEntityPage
            id="saas_zonas"
            title="Zonas"
            sectionKey="tenant_zone_rules_inner"
            rows={buildZoneRows(visible)}
            columns={ZONE_TABLE_COLUMNS}
            selectedId={mode === 'list' ? '' : selectedId}
            onSelect={(row) => openDetail(row)}
            onClose={close}
            renderDetail={() => right}
            renderForm={() => right}
            mode={mode === 'create' || mode === 'edit' ? 'form' : 'detail'}
            dirty={mode === 'create' || mode === 'edit'}
            requestJson={requestJson}
            loading={sectionLoading}
            emptyText={sectionError || 'No hay zonas para mostrar.'}
            searchPlaceholder="Buscar zona"
            actions={[
                ...(canManageZones ? [
                    { key: 'sync_woo_zones', label: 'Importar desde WooCommerce', onClick: () => runZoneAction(runSectionAction, runAction, 'sync_woo_zones', 'Zonas importadas desde WooCommerce', async () => {
                        const result = await syncTenantZonesFromWooCommerce(requestJson, { tenantId: zoneCacheKey });
                        if (Array.isArray(result?.zones) && result.zones.length) {
                            const synced = setCachedTenantZoneRules(zoneCacheKey, result.zones);
                            setItems(synced);
                        }
                        const cached = await loadCachedTenantZoneRules(requestJson, {
                            includeInactive: true,
                            tenantId: zoneCacheKey,
                            force: true
                        });
                        setItems(cached);
                        setCachedTenantZoneRules(zoneCacheKey, cached);
                        if (selectedId) {
                            const refreshed = cached.find((item) => item.ruleId === selectedId);
                            if (refreshed) setForm(zoneForm(refreshed));
                        }
                        return result;
                    }), disabled: busy || sectionLoading },
                    { key: 'sync_agencies', label: agencySync ? `Agencias: ${agencySync.synced || 0}` : 'Sincronizar agencias', onClick: () => runZoneAction(runSectionAction, runAction, 'sync_agencies', 'Agencias sincronizadas', async () => {
                        const result = await syncTenantLogisticsAgencies(requestJson, { tenantId: zoneCacheKey });
                        setAgencySync(result);
                        return result;
                    }), disabled: busy || sectionLoading },
                    { key: 'recalculate', label: recalc ? `Recalc: ${recalc.assigned || 0}` : 'Recalcular zonas', onClick: () => runZoneAction(runSectionAction, runAction, 'recalculate_zones', 'Zonas recalculadas', async () => setRecalc(await recalculateTenantZones(requestJson, { tenantId: zoneCacheKey }))), disabled: busy },
                    { key: 'create', label: 'Nuevo', onClick: openCreate, disabled: busy }
                ] : []),
                { key: 'reload', label: sectionError ? 'Reintentar' : 'Recargar', onClick: () => (typeof forceReload === 'function' ? forceReload(lazySectionId) : load({ force: true }).catch((error) => setError?.(String(error?.message || error)))), disabled: busy || sectionLoading }
            ]}
            filters={ZONE_FILTERS}
            layoutClassName="saas-labels-layout"
            detailShell={false}
            hideCloseButton
        />
    );
}
