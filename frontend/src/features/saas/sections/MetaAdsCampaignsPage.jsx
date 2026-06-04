import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Columns3, RotateCcw } from 'lucide-react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { SaasEntityPage } from '../components/entity';
import { SaasDataTable, SaasViewHeader, useSaasViewPreferences } from '../components/layout';
import {
    applyEntityFilters,
    createEmptyFilterItem,
    normalizeFilterDefinitions,
    normalizeFilterItems
} from '../components/layout/filterUtils';
import { applyMultiSort, normalizeSortState } from '../components/layout/sortUtils';

const META_ADS_DATE_RANGE_STORAGE_PREFIX = 'saas.metaAds.dateRange';
const META_ADS_STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'ACTIVE' },
    { value: 'PAUSED', label: 'PAUSED' },
    { value: 'ARCHIVED', label: 'ARCHIVED' },
    { value: 'DELETED', label: 'DELETED' }
];

const META_ADS_COLUMNS = [
    { key: 'campaign_name', label: 'Campaña', minWidth: '220px', type: 'text', filterable: true },
    { key: 'adset_name', label: 'Conjunto', minWidth: '220px', type: 'text', filterable: true },
    { key: 'ad_name', label: 'Anuncio', minWidth: '240px', type: 'text', filterable: true },
    {
        key: 'ad_status',
        label: 'Estado',
        minWidth: '110px',
        type: 'option',
        filterable: true,
        options: META_ADS_STATUS_OPTIONS,
        render: (value, row) => {
            if (row?.isSummary) return <strong>{String(value || 'Resumen')}</strong>;
            const status = String(value || '').trim().toUpperCase();
            const statusClass = status === 'ACTIVE' ? 'saas-campaigns-status--running' : 'saas-campaigns-status--paused';
            return <span className={`saas-campaigns-status ${statusClass}`}>{status || '-'}</span>;
        }
    },
    {
        key: 'spend',
        label: 'Inversión S/',
        minWidth: '130px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatCurrency(value)
    },
    {
        key: 'impressions',
        label: 'Impresiones',
        minWidth: '120px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatInteger(value)
    },
    {
        key: 'reach',
        label: 'Alcance',
        minWidth: '120px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatInteger(value)
    },
    {
        key: 'clicks',
        label: 'Clics',
        minWidth: '100px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatInteger(value)
    },
    {
        key: 'ctr',
        label: 'CTR %',
        minWidth: '100px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatRatio(value)
    },
    {
        key: 'cpc',
        label: 'CPC S/',
        minWidth: '110px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatRatio(value)
    },
    {
        key: 'cpm',
        label: 'CPM S/',
        minWidth: '110px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatRatio(value)
    },
    {
        key: 'frequency',
        label: 'Frecuencia',
        minWidth: '110px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatRatio(value)
    },
    {
        key: 'messaging_conversations',
        label: 'Conversaciones',
        minWidth: '130px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatInteger(value)
    },
    {
        key: 'cost_per_conversation',
        label: 'Costo/conv S/',
        minWidth: '130px',
        align: 'right',
        type: 'number',
        filterable: true,
        render: (value) => formatRatio(value)
    }
];

function toDateInputValue(value) {
    const safeDate = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(safeDate.getTime())) return '';
    return safeDate.toISOString().slice(0, 10);
}

function buildDefaultDateRange() {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return {
        dateStart: toDateInputValue(start),
        dateStop: toDateInputValue(today)
    };
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value) {
    return Math.round(toNumber(value)).toLocaleString('es-PE');
}

function formatCurrency(value, fractionDigits = 2) {
    const safe = toNumber(value);
    return safe.toLocaleString('es-PE', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    });
}

function formatRatio(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe)) return '-';
    return safe.toLocaleString('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function normalizeDateRange(dateRange = null) {
    const fallback = buildDefaultDateRange();
    const source = dateRange && typeof dateRange === 'object' ? dateRange : {};
    const dateStart = String(source.dateStart || '').trim();
    const dateStop = String(source.dateStop || '').trim();
    return {
        dateStart: dateStart || fallback.dateStart,
        dateStop: dateStop || fallback.dateStop
    };
}

function getDateRangeStorageKey(tenantId = '') {
    const safeTenantId = String(tenantId || '').trim() || 'global';
    return `${META_ADS_DATE_RANGE_STORAGE_PREFIX}.${safeTenantId}`;
}

function readStoredDateRange(tenantId = '') {
    const fallback = buildDefaultDateRange();
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(getDateRangeStorageKey(tenantId));
        if (!raw) return fallback;
        return normalizeDateRange(JSON.parse(raw));
    } catch {
        return fallback;
    }
}

function writeStoredDateRange(tenantId = '', dateRange = null) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(getDateRangeStorageKey(tenantId), JSON.stringify(normalizeDateRange(dateRange)));
    } catch {
        // local persistence is best-effort
    }
}

function normalizeInsightItems(payload) {
    const source = Array.isArray(payload?.items) ? payload.items : [];
    return source.map((item, index) => ({
        id: `${String(item?.ad_id || item?.adset_id || item?.campaign_id || index)}:${String(item?.date_start || index)}`,
        aggregateKey: String(item?.ad_id || item?.adset_id || item?.campaign_id || `row_${index}`),
        campaign_id: String(item?.campaign_id || '').trim(),
        adset_id: String(item?.adset_id || '').trim(),
        ad_id: String(item?.ad_id || '').trim(),
        campaign_name: String(item?.campaign_name || '-').trim() || '-',
        adset_name: String(item?.adset_name || '-').trim() || '-',
        ad_name: String(item?.ad_name || '-').trim() || '-',
        ad_status: String(item?.ad_status || '-').trim().toUpperCase() || '-',
        spend: toNumber(item?.spend),
        impressions: toNumber(item?.impressions),
        reach: toNumber(item?.reach),
        clicks: toNumber(item?.clicks),
        ctr: Number(item?.ctr),
        cpc: Number(item?.cpc),
        cpm: Number(item?.cpm),
        frequency: Number(item?.frequency),
        messaging_conversations: toNumber(item?.messaging_conversations),
        date_start: String(item?.date_start || '').trim(),
        date_stop: String(item?.date_stop || '').trim()
    }));
}

function pickBestLabel(...values) {
    return values
        .map((value) => String(value || '').trim())
        .find((value) => value && value !== '-') || '-';
}

function aggregateInsightRows(items = []) {
    const grouped = new Map();

    items.forEach((item) => {
        const key = String(item?.aggregateKey || '').trim();
        if (!key) return;
        const current = grouped.get(key) || {
            id: key,
            campaign_id: '',
            adset_id: '',
            ad_id: '',
            campaign_name: '-',
            adset_name: '-',
            ad_name: '-',
            ad_status: '-',
            spend: 0,
            impressions: 0,
            reach: 0,
            clicks: 0,
            messaging_conversations: 0,
            date_start: '',
            date_stop: ''
        };

        current.campaign_id = String(item?.campaign_id || current.campaign_id || '').trim();
        current.adset_id = String(item?.adset_id || current.adset_id || '').trim();
        current.ad_id = String(item?.ad_id || current.ad_id || '').trim();
        current.campaign_name = pickBestLabel(current.campaign_name, item?.campaign_name);
        current.adset_name = pickBestLabel(current.adset_name, item?.adset_name);
        current.ad_name = pickBestLabel(current.ad_name, item?.ad_name);
        current.ad_status = pickBestLabel(item?.ad_status, current.ad_status);
        current.spend += toNumber(item?.spend);
        current.impressions += toNumber(item?.impressions);
        current.reach += toNumber(item?.reach);
        current.clicks += toNumber(item?.clicks);
        current.messaging_conversations += toNumber(item?.messaging_conversations);
        current.date_start = current.date_start && item?.date_start
            ? (current.date_start < item.date_start ? current.date_start : item.date_start)
            : String(current.date_start || item?.date_start || '').trim();
        current.date_stop = current.date_stop && item?.date_stop
            ? (current.date_stop > item.date_stop ? current.date_stop : item.date_stop)
            : String(current.date_stop || item?.date_stop || '').trim();

        grouped.set(key, current);
    });

    return [...grouped.values()].map((item) => {
        const ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : null;
        const cpc = item.clicks > 0 ? item.spend / item.clicks : null;
        const cpm = item.impressions > 0 ? (item.spend / item.impressions) * 1000 : null;
        const frequency = item.reach > 0 ? item.impressions / item.reach : null;
        const costPerConversation = item.messaging_conversations > 0
            ? item.spend / item.messaging_conversations
            : null;

        return {
            ...item,
            ctr,
            cpc,
            cpm,
            frequency,
            cost_per_conversation: costPerConversation
        };
    });
}

function buildSummaryRow(rows = []) {
    const totals = rows.reduce((acc, row) => {
        acc.spend += toNumber(row?.spend);
        acc.impressions += toNumber(row?.impressions);
        acc.reach += toNumber(row?.reach);
        acc.clicks += toNumber(row?.clicks);
        acc.messaging_conversations += toNumber(row?.messaging_conversations);
        return acc;
    }, {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        messaging_conversations: 0
    });

    return {
        id: 'meta-ads-summary',
        isSummary: true,
        campaign_name: 'Resumen',
        adset_name: `${rows.length.toLocaleString('es-PE')} filas`,
        ad_name: '-',
        ad_status: 'Resumen',
        spend: totals.spend,
        impressions: totals.impressions,
        reach: totals.reach,
        clicks: totals.clicks,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
        cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
        cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
        frequency: totals.reach > 0 ? totals.impressions / totals.reach : null,
        messaging_conversations: totals.messaging_conversations,
        cost_per_conversation: totals.messaging_conversations > 0 ? totals.spend / totals.messaging_conversations : null
    };
}

function applySearch(rows = [], search = '') {
    const query = String(search || '').trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
        const haystack = [
            row?.campaign_name,
            row?.adset_name,
            row?.ad_name,
            row?.ad_status
        ].map((value) => String(value || '').trim().toLowerCase()).join(' ');
        return haystack.includes(query);
    });
}

function normalizeColumns(columns = [], visibleColumnKeys = [], columnOrder = []) {
    const safeColumns = Array.isArray(columns) ? columns.filter((column) => column && column.key) : [];
    const order = Array.isArray(columnOrder) ? columnOrder : [];
    const configurableColumns = safeColumns.filter((column) => column.configurable !== false);
    const fixedColumns = safeColumns.filter((column) => column.configurable === false);
    const orderedConfigurable = [
        ...order.map((key) => configurableColumns.find((column) => column.key === key)).filter(Boolean),
        ...configurableColumns.filter((column) => !order.includes(column.key))
    ];
    const visible = new Set(Array.isArray(visibleColumnKeys) ? visibleColumnKeys : []);

    return [
        ...fixedColumns,
        ...orderedConfigurable
    ].map((column) => ({
        ...column,
        hidden: column.configurable === false
            ? column.hidden
            : (visible.size > 0 ? !visible.has(column.key) : column.hidden)
    }));
}

function getColumnTextLabel(column = {}) {
    const rawLabel = column.menuLabel ?? column.sortLabel ?? column.label ?? column.key;
    const normalized = String(rawLabel || '').trim();
    if (!normalized) return String(column.key || '');
    return normalized
        .toLocaleLowerCase('es')
        .split(' ')
        .map((word) => (word ? `${word.charAt(0).toLocaleUpperCase('es')}${word.slice(1)}` : word))
        .join(' ');
}

function getConfigurableColumns(columns = []) {
    return (Array.isArray(columns) ? columns : [])
        .filter((column) => column && column.key && column.configurable !== false);
}

function ColumnMenu({ columns = [], preferences = null, disabled = false }) {
    const [open, setOpen] = useState(false);
    const menuColumns = useMemo(() => getConfigurableColumns(columns), [columns]);
    const visible = new Set(preferences?.visibleColumnKeys || []);

    return (
        <div className="saas-entity-columns">
            <button
                type="button"
                className="saas-btn saas-header-btn saas-header-btn--secondary saas-btn-columns"
                onClick={() => setOpen((prev) => !prev)}
                disabled={disabled}
            >
                <Columns3 size={15} strokeWidth={2} />
                <span className="saas-btn-text">Columnas</span>
            </button>
            {open ? (
                <div className="saas-entity-columns__menu">
                    {menuColumns.map((column) => (
                        <label key={column.key} className="saas-entity-columns__item">
                            <input
                                type="checkbox"
                                checked={visible.has(column.key)}
                                onChange={() => preferences?.toggleColumn?.(column.key)}
                            />
                            <span>{getColumnTextLabel(column)}</span>
                        </label>
                    ))}
                    <div className="saas-entity-columns__actions">
                        <button type="button" onClick={() => preferences?.setVisibleColumnKeys?.(menuColumns.map((column) => column.key))}>
                            <CheckSquare size={14} strokeWidth={2} />
                            <span>Todas</span>
                        </button>
                        <button type="button" onClick={preferences?.resetColumns}>
                            <RotateCcw size={14} strokeWidth={2} />
                            <span>Restablecer</span>
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function MetaAdsCampaignsPage({ context = {} }) {
    const { notify } = useUiFeedback();
    const requestJson = typeof context?.requestJson === 'function' ? context.requestJson : null;
    const runSectionAction = typeof context?.runSectionAction === 'function' ? context.runSectionAction : null;
    const tenantId = String(context?.settingsTenantId || context?.selectedTenantId || context?.tenantScopeId || '').trim();
    const tenantScopeLocked = context?.tenantScopeLocked === true;
    const canManageMetaAds = context?.canManageMetaAds === true;
    const currentUser = context?.currentUser && typeof context.currentUser === 'object' ? context.currentUser : {};
    const normalizedUserRole = String(context?.normalizedRole || context?.userRole || currentUser?.role || '').trim().toLowerCase();
    const isOwnerUser = currentUser?.isSuperAdmin === true
        || normalizedUserRole === 'owner'
        || (Array.isArray(currentUser?.memberships) ? currentUser.memberships : []).some((membership) => (
            membership?.active !== false
            && String(membership?.role || '').trim().toLowerCase() === 'owner'
            && (!tenantId || String(membership?.tenantId || membership?.tenant_id || '').trim() === tenantId)
        ));
    const columnPrefs = useSaasViewPreferences('meta_ads_campaigns', META_ADS_COLUMNS, { requestJson });
    const [dateRange, setDateRange] = useState(() => readStoredDateRange(tenantId));
    const [searchValue, setSearchValue] = useState('');
    const [activeFilters, setActiveFilters] = useState([createEmptyFilterItem()]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncingCreatives, setSyncingCreatives] = useState(false);
    const [error, setError] = useState('');
    const [syncMessage, setSyncMessage] = useState('');
    const syncBusy = syncing || syncingCreatives;

    useEffect(() => {
        setDateRange(readStoredDateRange(tenantId));
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId) return;
        writeStoredDateRange(tenantId, dateRange);
    }, [dateRange, tenantId]);

    const loadInsights = useCallback(async ({ silent = false } = {}) => {
        if (!requestJson || !tenantId || !dateRange.dateStart || !dateRange.dateStop) {
            setRows([]);
            return;
        }
        if (!silent) setLoading(true);
        setError('');
        try {
            const query = new URLSearchParams({
                tenantId,
                dateStart: dateRange.dateStart,
                dateStop: dateRange.dateStop
            });
            const payload = await requestJson(`/api/meta-ads/insights?${query.toString()}`, { tenantIdOverride: tenantId });
            setRows(aggregateInsightRows(normalizeInsightItems(payload)));
        } catch (loadError) {
            setRows([]);
            setError(String(loadError?.message || 'No se pudieron cargar las campañas Meta Ads.'));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [dateRange.dateStart, dateRange.dateStop, requestJson, tenantId]);

    useEffect(() => {
        if (tenantScopeLocked) {
            setRows([]);
            setError('');
            return;
        }
        void loadInsights();
    }, [loadInsights, tenantScopeLocked]);

    const filterDefinitions = useMemo(
        () => normalizeFilterDefinitions(META_ADS_COLUMNS, META_ADS_COLUMNS),
        []
    );

    const effectiveColumns = useMemo(
        () => normalizeColumns(META_ADS_COLUMNS, columnPrefs.visibleColumnKeys, columnPrefs.columnOrder),
        [columnPrefs.columnOrder, columnPrefs.visibleColumnKeys]
    );

    const filteredRows = useMemo(() => {
        const searchedRows = applySearch(rows, searchValue);
        return applyEntityFilters(searchedRows, activeFilters, filterDefinitions);
    }, [activeFilters, filterDefinitions, rows, searchValue]);

    const sortedRows = useMemo(
        () => applyMultiSort(filteredRows, columnPrefs.sort),
        [columnPrefs.sort, filteredRows]
    );

    const visibleRows = useMemo(() => {
        if (sortedRows.length === 0) return sortedRows;
        return [...sortedRows, buildSummaryRow(sortedRows)];
    }, [sortedRows]);

    const handleSync = useCallback(async () => {
        if (!requestJson || !tenantId) return;
        const executeSync = async () => {
            setSyncing(true);
            setLoading(true);
            setError('');
            setSyncMessage('');
            try {
                const payload = await requestJson('/api/meta-ads/sync', {
                    method: 'POST',
                    tenantIdOverride: tenantId,
                    headers: { 'Content-Type': 'application/json' },
                    body: { tenantId }
                });
                const nextMessage = `${Number(payload?.adsCount || 0).toLocaleString('es-PE')} ads y ${Number(payload?.insightsCount || 0).toLocaleString('es-PE')} insights sincronizados.`;
                setSyncMessage(nextMessage);
                await loadInsights({ silent: true });
                return { ...payload, message: nextMessage };
            } catch (syncError) {
                const nextError = String(syncError?.message || 'No se pudo sincronizar Meta Ads.');
                setError(nextError);
                throw syncError;
            } finally {
                setSyncing(false);
                setLoading(false);
            }
        };

        if (runSectionAction) {
            return runSectionAction('sync_meta_ads', executeSync, {
                label: 'campañas Meta',
                successMessage: '',
                onSuccess: (payload) => {
                    const nextMessage = String(payload?.message || '').trim();
                    if (nextMessage) notify({ type: 'info', message: nextMessage });
                }
            });
        }

        try {
            const payload = await executeSync();
            if (payload?.message) notify({ type: 'info', message: payload.message });
            return payload;
        } catch (syncError) {
            const nextError = String(syncError?.message || 'No se pudo sincronizar Meta Ads.');
            notify({ type: 'error', message: nextError });
            return undefined;
        }
    }, [loadInsights, notify, requestJson, runSectionAction, tenantId]);

    const handleSyncCreatives = useCallback(async () => {
        if (!requestJson || !tenantId) return;
        const executeSync = async () => {
            setSyncingCreatives(true);
            setError('');
            setSyncMessage('');
            try {
                const payload = await requestJson('/api/meta-ads/sync', {
                    method: 'POST',
                    tenantIdOverride: tenantId,
                    headers: { 'Content-Type': 'application/json' },
                    body: { tenantId, mode: 'creatives' }
                });
                const nextMessage = `${Number(payload?.creativesCount || 0).toLocaleString('es-PE')} creativos Meta sincronizados.`;
                setSyncMessage(nextMessage);
                return { ...payload, message: nextMessage };
            } catch (syncError) {
                const nextError = String(syncError?.message || 'No se pudieron sincronizar creativos Meta.');
                setError(nextError);
                throw syncError;
            } finally {
                setSyncingCreatives(false);
            }
        };

        if (runSectionAction) {
            return runSectionAction('sync_meta_ads_creatives', executeSync, {
                label: 'creativos Meta',
                successMessage: '',
                onSuccess: (payload) => {
                    const nextMessage = String(payload?.message || '').trim();
                    if (nextMessage) notify({ type: 'info', message: nextMessage });
                }
            });
        }

        try {
            const payload = await executeSync();
            if (payload?.message) notify({ type: 'info', message: payload.message });
            return payload;
        } catch (syncError) {
            const nextError = String(syncError?.message || 'No se pudieron sincronizar creativos Meta.');
            notify({ type: 'error', message: nextError });
            return undefined;
        }
    }, [notify, requestJson, runSectionAction, tenantId]);

    const headerElement = (
        <SaasViewHeader
            title="Campañas Meta"
            count={filteredRows.length}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Buscar campaña, conjunto o anuncio..."
            searchDisabled={tenantScopeLocked || loading || syncBusy}
            actions={[{
                key: 'sync',
                label: syncing ? 'Sincronizando...' : 'Sincronizar',
                onClick: handleSync,
                disabled: tenantScopeLocked || syncBusy || loading || !tenantId || !canManageMetaAds
            }, ...(isOwnerUser ? [{
                key: 'sync_creatives',
                label: syncingCreatives ? 'Creativos...' : 'Sincronizar creativos',
                variant: 'secondary',
                onClick: handleSyncCreatives,
                disabled: tenantScopeLocked || syncBusy || loading || !tenantId || !canManageMetaAds
            }] : [])]}
            actionsExtra={<ColumnMenu columns={META_ADS_COLUMNS} preferences={columnPrefs} disabled={tenantScopeLocked || loading || syncBusy} />}
            filters={{
                columns: filterDefinitions,
                items: activeFilters,
                onItemsChange: (nextFilters) => setActiveFilters(normalizeFilterItems(nextFilters)),
                onClear: () => setActiveFilters([createEmptyFilterItem()])
            }}
            sortConfig={{
                columns: META_ADS_COLUMNS,
                ...normalizeSortState(columnPrefs.sort)
            }}
            onSortChange={columnPrefs.setSort}
            extra={(
                <>
                    <div className="saas-admin-form-row">
                        <div className="saas-admin-field">
                            <label htmlFor="meta-ads-date-start">Desde</label>
                            <input
                                id="meta-ads-date-start"
                                type="date"
                                value={dateRange.dateStart}
                                disabled={tenantScopeLocked || loading || syncBusy}
                                onChange={(event) => setDateRange((current) => ({ ...current, dateStart: event.target.value }))}
                            />
                        </div>
                        <div className="saas-admin-field">
                            <label htmlFor="meta-ads-date-stop">Hasta</label>
                            <input
                                id="meta-ads-date-stop"
                                type="date"
                                value={dateRange.dateStop}
                                disabled={tenantScopeLocked || loading || syncBusy}
                                onChange={(event) => setDateRange((current) => ({ ...current, dateStop: event.target.value }))}
                            />
                        </div>
                    </div>
                    {syncMessage ? (
                        <div className="saas-admin-list-actions">
                            <small>{syncMessage}</small>
                        </div>
                    ) : null}
                </>
            )}
        />
    );

    const leftPane = tenantScopeLocked ? (
        <div className="saas-admin-empty-state">
            <p>Selecciona una empresa para revisar campañas Meta Ads.</p>
        </div>
    ) : error && !loading ? (
        <div className="saas-admin-empty-state">
            <p>{error}</p>
        </div>
    ) : (
        <div className="saas-campaigns-pane">
            <SaasDataTable
                columns={effectiveColumns}
                rows={visibleRows}
                loading={loading}
                emptyText="No hay campañas Meta Ads para este rango."
                enableInfinite={false}
                sortConfig={columnPrefs.sort}
                onSortChange={columnPrefs.setSort}
            />
        </div>
    );

    return (
        <SaasEntityPage
            id="saas_meta_ads_campaigns"
            sectionKey="meta_ads_campaigns"
            header={headerElement}
            left={leftPane}
            className="saas-entity-page--campaigns"
        />
    );
}
