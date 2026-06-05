import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Columns3, RotateCcw } from 'lucide-react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { SaasEntityPage } from '../components/entity';
import { SaasDataTable, SaasDetailPanel, SaasViewHeader, useSaasViewPreferences } from '../components/layout';
import {
    applyEntityFilters,
    createEmptyFilterItem,
    normalizeFilterDefinitions,
    normalizeFilterItems
} from '../components/layout/filterUtils';
import { applyMultiSort, normalizeSortState } from '../components/layout/sortUtils';

const META_ADS_DATE_RANGE_STORAGE_PREFIX = 'saas.metaAds.dateRange';
const META_ADS_TIME_ZONE = 'America/Lima';
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

const META_ADS_TABLE_COLUMN_KEYS = new Set([
    'campaign_name',
    'adset_name',
    'ad_name',
    'ad_status',
    'spend',
    'impressions',
    'reach',
    'clicks',
    'ctr',
    'cpm',
    'cpc',
    'frequency',
    'messaging_conversations',
    'cost_per_conversation',
    'days_active',
    'date_start',
    'date_stop'
]);

const META_ADS_TABLE_LABELS = {
    campaign_name: 'CAMPAÑA',
    adset_name: 'CONJUNTO',
    ad_name: 'ANUNCIO',
    ad_status: 'ESTADO',
    spend: 'INVERSIÓN S/',
    impressions: 'IMPRESIONES',
    reach: 'ALCANCE',
    clicks: 'CLICKS',
    ctr: 'CTR',
    cpm: 'CPM',
    cpc: 'CPC',
    frequency: 'FREC.',
    messaging_conversations: 'CONVERSACIONES',
    cost_per_conversation: 'COSTO/CONV.',
    days_active: 'DÍAS',
    date_start: 'DESDE',
    date_stop: 'HASTA'
};

const META_ADS_TABLE_COLUMN_ORDER = [
    'campaign_name',
    'adset_name',
    'ad_name',
    'ad_status',
    'spend',
    'impressions',
    'reach',
    'clicks',
    'ctr',
    'cpm',
    'cpc',
    'frequency',
    'messaging_conversations',
    'cost_per_conversation',
    'days_active',
    'date_start',
    'date_stop'
];

const META_ADS_EXTRA_TABLE_COLUMNS = [
    { key: 'days_active', minWidth: '90px', align: 'right', type: 'number', filterable: true },
    { key: 'date_start', minWidth: '120px', type: 'text', filterable: true },
    { key: 'date_stop', minWidth: '120px', type: 'text', filterable: true }
];

function buildMetaAdsTableColumns() {
    const baseColumns = [...META_ADS_COLUMNS, ...META_ADS_EXTRA_TABLE_COLUMNS];
    const columnByKey = new Map(baseColumns.map((column) => [column.key, column]));
    return META_ADS_TABLE_COLUMN_ORDER
        .map((key) => columnByKey.get(key))
        .filter((column) => column && META_ADS_TABLE_COLUMN_KEYS.has(column.key))
        .map((column) => {
            if (column.key === 'ad_status') {
                return {
                    ...column,
                    label: META_ADS_TABLE_LABELS[column.key],
                    render: (value, row) => (row?.isSummary ? <strong>Total</strong> : <StatusBadge value={value} />)
                };
            }
            if (column.key === 'spend' || column.key === 'cpm' || column.key === 'cpc' || column.key === 'cost_per_conversation') {
                return { ...column, label: META_ADS_TABLE_LABELS[column.key], render: (value) => formatMetricCurrency(value) };
            }
            if (column.key === 'ctr') {
                return { ...column, label: META_ADS_TABLE_LABELS[column.key], render: (value) => formatMetricPercent(value) };
            }
            if (column.key === 'frequency') {
                return { ...column, label: META_ADS_TABLE_LABELS[column.key], render: (value) => formatMetricDecimal(value) };
            }
            if (column.key === 'messaging_conversations' || column.key === 'days_active') {
                return { ...column, label: META_ADS_TABLE_LABELS[column.key], render: (value) => formatMetricInteger(value) };
            }
            if (column.key === 'date_start' || column.key === 'date_stop') {
                return { ...column, label: META_ADS_TABLE_LABELS[column.key], render: (value) => formatDateLabel(value) };
            }
            return { ...column, label: META_ADS_TABLE_LABELS[column.key] || column.label };
        });
}

const META_ADS_TABLE_COLUMNS = buildMetaAdsTableColumns();

function toDateInputValue(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const safeDate = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(safeDate.getTime())) return '';
    return safeDate.toLocaleDateString('en-CA', { timeZone: META_ADS_TIME_ZONE });
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

function formatCurrencyLabel(value) {
    return `S/ ${formatCurrency(value)}`;
}

function formatRatio(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe)) return '-';
    return safe.toLocaleString('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function hasMetricValue(value) {
    const safe = Number(value);
    return Number.isFinite(safe) && safe > 0;
}

function formatMetricCurrency(value) {
    return hasMetricValue(value) ? formatCurrencyLabel(value) : '-';
}

function formatMetricPercent(value) {
    return hasMetricValue(value) ? `${formatRatio(value)}%` : '-';
}

function formatMetricDecimal(value) {
    return hasMetricValue(value) ? formatRatio(value) : '-';
}

function formatMetricInteger(value) {
    return hasMetricValue(value) ? formatInteger(value) : '-';
}

function formatDateLabel(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime())) return text;
    return parsed.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function parseButtonsJson(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
    if (!value) return [];
    try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
    } catch {
        return [];
    }
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
        creative_id: String(item?.creative_id || '').trim(),
        greeting_text: String(item?.greeting_text || '').trim(),
        is_manual_greeting: item?.is_manual_greeting === true,
        auto_greeting_text: String(item?.auto_greeting_text || '').trim(),
        autofill_message: String(item?.autofill_message || '').trim(),
        buttons_json: parseButtonsJson(item?.buttons_json),
        ctr: Number(item?.ctr),
        cpc: Number(item?.cpc),
        cpm: Number(item?.cpm),
        frequency: Number(item?.frequency),
        messaging_conversations: toNumber(item?.messaging_conversations),
        date_start: String(item?.date_start || '').trim(),
        date_stop: String(item?.date_stop || '').trim(),
        days_active: toNumber(item?.days_active)
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
            creative_id: '',
            greeting_text: '',
            is_manual_greeting: false,
            auto_greeting_text: '',
            autofill_message: '',
            buttons_json: [],
            date_start: '',
            date_stop: '',
            days_active: 0
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
        current.creative_id = String(current.creative_id || item?.creative_id || '').trim();
        current.greeting_text = String(current.greeting_text || item?.greeting_text || '').trim();
        current.is_manual_greeting = current.is_manual_greeting || item?.is_manual_greeting === true;
        current.auto_greeting_text = String(current.auto_greeting_text || item?.auto_greeting_text || '').trim();
        current.autofill_message = String(current.autofill_message || item?.autofill_message || '').trim();
        current.buttons_json = current.buttons_json?.length ? current.buttons_json : parseButtonsJson(item?.buttons_json);
        current.days_active = Math.max(toNumber(current.days_active), toNumber(item?.days_active));
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
    const totals = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
        acc.spend += toNumber(row?.spend);
        acc.impressions += toNumber(row?.impressions);
        acc.reach += toNumber(row?.reach);
        acc.clicks += toNumber(row?.clicks);
        acc.messaging_conversations += toNumber(row?.messaging_conversations);
        acc.days_active = Math.max(acc.days_active, toNumber(row?.days_active));
        const dateStart = String(row?.date_start || '').trim();
        const dateStop = String(row?.date_stop || '').trim();
        acc.date_start = acc.date_start && dateStart
            ? (acc.date_start < dateStart ? acc.date_start : dateStart)
            : (acc.date_start || dateStart);
        acc.date_stop = acc.date_stop && dateStop
            ? (acc.date_stop > dateStop ? acc.date_stop : dateStop)
            : (acc.date_stop || dateStop);
        return acc;
    }, {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        messaging_conversations: 0,
        days_active: 0,
        date_start: '',
        date_stop: ''
    });
    return {
        id: 'meta-ads-summary',
        isSummary: true,
        campaign_name: 'Total',
        adset_name: `${rows.length.toLocaleString('es-PE')} anuncios`,
        ad_name: 'Rango filtrado',
        ad_status: 'TOTAL',
        spend: totals.spend,
        impressions: totals.impressions,
        reach: totals.reach,
        clicks: totals.clicks,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
        cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
        cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
        frequency: totals.reach > 0 ? totals.impressions / totals.reach : null,
        messaging_conversations: totals.messaging_conversations,
        cost_per_conversation: totals.messaging_conversations > 0 ? totals.spend / totals.messaging_conversations : null,
        days_active: totals.days_active,
        date_start: totals.date_start,
        date_stop: totals.date_stop
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

function StatusBadge({ value = '' }) {
    const status = String(value || '').trim().toUpperCase();
    const statusClass = status === 'ACTIVE'
        ? 'saas-campaigns-status--running'
        : (status === 'ARCHIVED' ? 'saas-campaigns-status--cancelled' : 'saas-meta-ads-status--paused');
    return <span className={`saas-campaigns-status ${statusClass}`}>{status || '-'}</span>;
}

function MetaMetricCard({ label, value }) {
    return (
        <div className="saas-admin-kpi saas-meta-ad-metric-card">
            <small>{label}</small>
            <strong>{value}</strong>
        </div>
    );
}

function MetaAdGreetingModal({
    ad = null,
    value = '',
    saving = false,
    onChange = null,
    onCancel = null,
    onSave = null
}) {
    if (!ad) return null;
    return (
        <div className="saas-template-builder-modal-overlay saas-meta-ad-greeting-modal" role="presentation">
            <div className="saas-template-builder-modal-shell" role="dialog" aria-modal="true" aria-labelledby="meta-ad-greeting-title">
                <section className="saas-admin-related-block saas-admin-related-block--modal-form">
                    <div className="saas-admin-pane-header saas-admin-pane-header--modal">
                        <div>
                            <h3 id="meta-ad-greeting-title">Mensaje de bienvenida</h3>
                            <p>{ad.ad_name || '-'}</p>
                        </div>
                    </div>
                    <textarea
                        className="saas-input"
                        rows={10}
                        value={value}
                        disabled={saving}
                        onChange={(event) => onChange?.(event.target.value)}
                    />
                    <div className="saas-admin-alert saas-admin-alert--info">
                        Este texto se mostrara a las vendedoras como referencia del mensaje que recibio el cliente al hacer click en el anuncio. No modifica el anuncio en Meta.
                    </div>
                    <div className="saas-admin-form-row saas-admin-form-row--actions">
                        <button type="button" className="saas-btn saas-btn-outline" disabled={saving} onClick={onCancel}>Cancelar</button>
                        <button type="button" className="saas-btn" disabled={saving} onClick={onSave}>{saving ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                </section>
            </div>
        </div>
    );
}

function MetaAdDetail({
    ad = null,
    stats = null,
    statsLoading = false,
    onBack = null,
    onCopyAdId = null,
    onEditGreeting = null,
    onUseAutoGreeting = null,
    onOpenChats = null
}) {
    if (!ad) {
        return (
            <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                <p>Selecciona un anuncio para ver identificacion, metricas, greeting y conversiones.</p>
            </div>
        );
    }
    const buttons = parseButtonsJson(ad.buttons_json);
    const hasMetrics = ['spend', 'impressions', 'reach', 'clicks'].some((key) => toNumber(ad?.[key]) > 0);
    const sourceUrl = String(stats?.sourceUrl || '').trim();
    const totalConversations = Number(stats?.totalConversations || 0);
    const convertedConversations = Number(stats?.converted || 0);
    const autoGreetingText = String(ad.auto_greeting_text || '').trim();
    const greetingText = String(ad.greeting_text || '').trim();
    const showAutoGreeting = ad.is_manual_greeting === true
        && autoGreetingText
        && autoGreetingText !== greetingText;
    return (
        <div className="saas-meta-ad-detail">
            <button type="button" className="saas-btn saas-btn-outline saas-meta-ad-detail__back" onClick={onBack}>
                Volver a la lista
            </button>

            <section className="saas-admin-related-block">
                <h4>Identificacion</h4>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>CAMPAÑA</span><p>{ad.campaign_name || '-'}</p></div>
                    <div className="saas-admin-detail-field"><span>CONJUNTO</span><p>{ad.adset_name || '-'}</p></div>
                    <div className="saas-admin-detail-field"><span>ANUNCIO</span><p>{ad.ad_name || '-'}</p></div>
                    <div className="saas-admin-detail-field"><span>ESTADO</span><strong><StatusBadge value={ad.ad_status} /></strong></div>
                    <div className="saas-admin-detail-field saas-meta-ad-id-field">
                        <span>AD ID</span>
                        <strong>
                            <code>{ad.ad_id || '-'}</code>
                            <button type="button" className="saas-meta-ad-copy-button" onClick={() => onCopyAdId?.(ad.ad_id)} title="Copiar Ad ID">Copiar</button>
                        </strong>
                    </div>
                </div>
            </section>

            <section className="saas-admin-related-block">
                <h4>Metricas del periodo</h4>
                {hasMetrics ? (
                    <div className="saas-admin-kpis saas-meta-ad-metrics-grid">
                        <MetaMetricCard label="Inversion" value={formatMetricCurrency(ad.spend)} />
                        <MetaMetricCard label="Impresiones" value={formatInteger(ad.impressions)} />
                        <MetaMetricCard label="Alcance" value={formatInteger(ad.reach)} />
                        <MetaMetricCard label="Clicks" value={formatInteger(ad.clicks)} />
                        <MetaMetricCard label="CTR" value={formatMetricPercent(ad.ctr)} />
                        <MetaMetricCard label="CPM" value={formatMetricCurrency(ad.cpm)} />
                        <MetaMetricCard label="CPC" value={formatMetricCurrency(ad.cpc)} />
                        <MetaMetricCard label="Frec." value={formatMetricDecimal(ad.frequency)} />
                    </div>
                ) : (
                    <div className="saas-admin-empty-inline">Sin datos en este periodo</div>
                )}
            </section>

            <section className="saas-admin-related-block">
                <h4>Mensaje de bienvenida</h4>
                {ad.is_manual_greeting === true ? (
                    <span className="saas-meta-ad-manual-badge">✏️ Editado manualmente</span>
                ) : null}
                {ad.greeting_text ? (
                    <>
                        <pre className="saas-meta-ad-greeting-text">{ad.greeting_text}</pre>
                        {showAutoGreeting ? (
                            <div className="saas-meta-ad-auto-greeting">
                                <span>Meta tambien tiene:</span>
                                <pre>{autoGreetingText}</pre>
                                <button type="button" className="saas-btn saas-btn-outline" onClick={() => onUseAutoGreeting?.(ad)}>
                                    Usar el de Meta
                                </button>
                            </div>
                        ) : null}
                        {buttons.length ? (
                            <div className="saas-meta-ad-greeting-chips">
                                {buttons.map((button, index) => (
                                    <span key={`${button.title || 'button'}_${index}`}> {button.title || '-'}</span>
                                ))}
                            </div>
                        ) : null}
                        <button type="button" className="saas-btn saas-btn-outline" onClick={onEditGreeting}>Editar greeting</button>
                    </>
                ) : (
                    <>
                        <div className="saas-admin-empty-inline">No hay mensaje de bienvenida sincronizado desde Meta para este anuncio.</div>
                        <button type="button" className="saas-btn saas-btn-outline" onClick={onEditGreeting}>Agregar greeting manualmente</button>
                    </>
                )}
            </section>

            <section className="saas-admin-related-block">
                <h4>Conversaciones</h4>
                {statsLoading ? (
                    <div className="saas-admin-empty-inline">Cargando conversaciones...</div>
                ) : totalConversations > 0 ? (
                    <p className="saas-meta-ad-conversation-summary">
                        {`${formatInteger(totalConversations)} conversaciones · ${formatInteger(convertedConversations)} convertida${convertedConversations === 1 ? '' : 's'} · ${formatRatio(stats?.conversionRate || 0)}% conversion`}
                    </p>
                ) : (
                    <div className="saas-admin-empty-inline">Sin conversaciones registradas</div>
                )}
                {totalConversations > 0 ? (
                    <button type="button" className="saas-btn saas-btn-outline" onClick={() => onOpenChats?.(ad.ad_id)}>
                        Ver chats de este anuncio
                    </button>
                ) : null}
            </section>

            <section className="saas-admin-related-block">
                <h4>Informacion del anuncio</h4>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>Dias activo en el periodo</span><strong>{formatInteger(ad.days_active || 0)} dias</strong></div>
                    <div className="saas-admin-detail-field"><span>Fecha primer dato</span><strong>{formatDateLabel(ad.date_start)}</strong></div>
                    <div className="saas-admin-detail-field"><span>Fecha ultimo dato</span><strong>{formatDateLabel(ad.date_stop)}</strong></div>
                </div>
                {sourceUrl ? (
                    <button type="button" className="saas-btn saas-btn-outline" onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')}>
                        Ver anuncio en Meta
                    </button>
                ) : null}
            </section>
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
    const canSyncCreatives = context?.isSuperAdmin === true
        || currentUser?.isSuperAdmin === true
        || normalizedUserRole === 'superadmin'
        || normalizedUserRole === 'owner'
        || (Array.isArray(currentUser?.memberships) ? currentUser.memberships : []).some((membership) => (
            membership?.active !== false
            && String(membership?.role || '').trim().toLowerCase() === 'owner'
            && (!tenantId || String(membership?.tenantId || membership?.tenant_id || '').trim() === tenantId)
        ));
    const columnPrefs = useSaasViewPreferences('meta_ads_campaigns_expanded', META_ADS_TABLE_COLUMNS, { requestJson });
    const [dateRange, setDateRange] = useState(() => readStoredDateRange(tenantId));
    const [searchValue, setSearchValue] = useState('');
    const [activeFilters, setActiveFilters] = useState([createEmptyFilterItem()]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncingCreatives, setSyncingCreatives] = useState(false);
    const [error, setError] = useState('');
    const [syncMessage, setSyncMessage] = useState('');
    const [selectedAdId, setSelectedAdId] = useState('');
    const [adStats, setAdStats] = useState(null);
    const [adStatsLoading, setAdStatsLoading] = useState(false);
    const [greetingModalOpen, setGreetingModalOpen] = useState(false);
    const [greetingDraft, setGreetingDraft] = useState('');
    const [savingGreeting, setSavingGreeting] = useState(false);
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
        () => normalizeFilterDefinitions(META_ADS_TABLE_COLUMNS, META_ADS_TABLE_COLUMNS),
        []
    );

    const effectiveColumns = useMemo(
        () => normalizeColumns(META_ADS_TABLE_COLUMNS, columnPrefs.visibleColumnKeys, columnPrefs.columnOrder),
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

    const selectedAd = useMemo(
        () => sortedRows.find((row) => String(row?.ad_id || '').trim() === selectedAdId) || null,
        [selectedAdId, sortedRows]
    );

    useEffect(() => {
        if (!selectedAdId) return;
        if (selectedAd) return;
        setSelectedAdId('');
    }, [selectedAd, selectedAdId]);

    useEffect(() => {
        let cancelled = false;
        const adId = String(selectedAdId || '').trim();
        if (!requestJson || !tenantId || !adId) {
            setAdStats(null);
            setAdStatsLoading(false);
            return () => {
                cancelled = true;
            };
        }
        setAdStatsLoading(true);
        setAdStats(null);
        const query = new URLSearchParams({ tenantId });
        requestJson(`/api/tenant/meta-ads/ad-stats/${encodeURIComponent(adId)}?${query.toString()}`, { tenantIdOverride: tenantId })
            .then((payload) => {
                if (!cancelled) setAdStats(payload || null);
            })
            .catch((statsError) => {
                if (!cancelled) {
                    setAdStats(null);
                    notify({ type: 'error', message: String(statsError?.message || 'No se pudieron cargar conversaciones del anuncio.') });
                }
            })
            .finally(() => {
                if (!cancelled) setAdStatsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [notify, requestJson, selectedAdId, tenantId]);

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
                    body: {
                        tenantId,
                        dateStart: dateRange.dateStart,
                        dateStop: dateRange.dateStop
                    }
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
    }, [dateRange.dateStart, dateRange.dateStop, loadInsights, notify, requestJson, runSectionAction, tenantId]);

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

    const copyAdId = useCallback((adId = '') => {
        const cleanAdId = String(adId || '').trim();
        if (!cleanAdId) return;
        if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(cleanAdId).catch(() => {});
        }
        notify({ type: 'info', message: 'Ad ID copiado.' });
    }, [notify]);

    const openGreetingModal = useCallback(() => {
        if (!selectedAd) return;
        setGreetingDraft(String(selectedAd.greeting_text || ''));
        setGreetingModalOpen(true);
    }, [selectedAd]);

    const closeGreetingModal = useCallback(() => {
        if (savingGreeting) return;
        setGreetingModalOpen(false);
        setGreetingDraft('');
    }, [savingGreeting]);

    const saveGreeting = useCallback(async () => {
        if (!requestJson || !tenantId || !selectedAd?.ad_id) return;
        setSavingGreeting(true);
        try {
            await requestJson(`/api/tenant/meta-ads/creatives/${encodeURIComponent(selectedAd.ad_id)}`, {
                method: 'PATCH',
                tenantIdOverride: tenantId,
                headers: { 'Content-Type': 'application/json' },
                body: {
                    tenantId,
                    greetingText: greetingDraft
                }
            });
            setRows((currentRows) => currentRows.map((row) => (
                String(row?.ad_id || '').trim() === String(selectedAd.ad_id || '').trim()
                    ? { ...row, greeting_text: String(greetingDraft || '').trim(), is_manual_greeting: true }
                    : row
            )));
            setGreetingModalOpen(false);
            notify({ type: 'success', message: 'Greeting guardado.' });
        } catch (saveError) {
            notify({ type: 'error', message: String(saveError?.message || 'No se pudo guardar el greeting.') });
        } finally {
            setSavingGreeting(false);
        }
    }, [greetingDraft, notify, requestJson, selectedAd, tenantId]);

    const useAutoGreeting = useCallback(async (ad = null) => {
        const adId = String(ad?.ad_id || '').trim();
        if (!requestJson || !tenantId || !adId) return;
        const autoGreetingText = String(ad?.auto_greeting_text || '').trim();
        try {
            const payload = await requestJson(`/api/tenant/meta-ads/creatives/${encodeURIComponent(adId)}`, {
                method: 'PATCH',
                tenantIdOverride: tenantId,
                headers: { 'Content-Type': 'application/json' },
                body: {
                    tenantId,
                    useAutoGreeting: true
                }
            });
            const nextGreeting = String(payload?.greetingText || autoGreetingText || '').trim();
            setRows((currentRows) => currentRows.map((row) => (
                String(row?.ad_id || '').trim() === adId
                    ? { ...row, greeting_text: nextGreeting, is_manual_greeting: false }
                    : row
            )));
            notify({ type: 'success', message: 'Greeting restaurado desde Meta.' });
        } catch (saveError) {
            notify({ type: 'error', message: String(saveError?.message || 'No se pudo usar el greeting de Meta.') });
        }
    }, [notify, requestJson, tenantId]);

    const openChatsForAd = useCallback((adId = '') => {
        const cleanAdId = String(adId || '').trim();
        if (!cleanAdId) return;
        try {
            window.localStorage.setItem('chat.filter.metaAdId', cleanAdId);
            window.dispatchEvent(new CustomEvent('chat:filter-meta-ad', { detail: { adId: cleanAdId } }));
        } catch {
            // best-effort handoff to the operational chat.
        }
        notify({ type: 'info', message: 'Filtro de anuncio preparado para el chat operativo.' });
    }, [notify]);

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
            }, ...(canSyncCreatives ? [{
                key: 'sync_creatives',
                label: syncingCreatives ? 'Creativos...' : 'Sincronizar creativos',
                variant: 'secondary',
                title: 'Sincronizar mensajes de bienvenida de los anuncios activos',
                onClick: handleSyncCreatives,
                disabled: tenantScopeLocked || syncBusy || loading || !tenantId || !canManageMetaAds
            }] : [])]}
            actionsExtra={<ColumnMenu columns={META_ADS_TABLE_COLUMNS} preferences={columnPrefs} disabled={tenantScopeLocked || loading || syncBusy} />}
            filters={{
                columns: filterDefinitions,
                items: activeFilters,
                onItemsChange: (nextFilters) => setActiveFilters(normalizeFilterItems(nextFilters)),
                onClear: () => setActiveFilters([createEmptyFilterItem()])
            }}
            sortConfig={{
                columns: META_ADS_TABLE_COLUMNS,
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
                selectedId={selectedAdId}
                loading={loading}
                emptyText="No hay campañas Meta Ads para este rango."
                enableInfinite={false}
                sortConfig={columnPrefs.sort}
                onSortChange={columnPrefs.setSort}
                onSelect={(row, rowId) => {
                    if (row?.isSummary) return;
                    setSelectedAdId(String(row?.ad_id || rowId || '').trim());
                }}
            />
        </div>
    );

    const rightPane = selectedAd ? (
        <SaasDetailPanel
            title={selectedAd.ad_name || 'Detalle de anuncio'}
            subtitle={selectedAd.ad_id || ''}
            className="saas-entity-detail-panel saas-meta-ad-detail-panel"
            bodyClassName="saas-entity-detail-panel__body"
            actions={(
                <button type="button" className="saas-btn-cancel" onClick={() => setSelectedAdId('')}>
                    Volver
                </button>
            )}
        >
            <MetaAdDetail
                ad={selectedAd}
                stats={adStats}
                statsLoading={adStatsLoading}
                onBack={() => setSelectedAdId('')}
                onCopyAdId={copyAdId}
                onEditGreeting={openGreetingModal}
                onUseAutoGreeting={useAutoGreeting}
                onOpenChats={openChatsForAd}
            />
        </SaasDetailPanel>
    ) : (
        <SaasDetailPanel
            title="Detalle de anuncio"
            subtitle="Selecciona un anuncio"
            className="saas-entity-detail-panel saas-meta-ad-detail-panel"
            bodyClassName="saas-entity-detail-panel__body"
        >
            <MetaAdDetail />
        </SaasDetailPanel>
    );

    return (
        <>
            <SaasEntityPage
                id="saas_meta_ads_campaigns"
                sectionKey="meta_ads_campaigns"
                header={headerElement}
                left={leftPane}
                right={rightPane}
                selectedId={selectedAdId}
                layoutClassName="saas-entity-layout saas-meta-ads-detail-layout"
                className="saas-entity-page--campaigns saas-entity-page--meta-ads"
            />
            {greetingModalOpen ? (
                <MetaAdGreetingModal
                    ad={selectedAd}
                    value={greetingDraft}
                    saving={savingGreeting}
                    onChange={setGreetingDraft}
                    onCancel={closeGreetingModal}
                    onSave={saveGreeting}
                />
            ) : null}
        </>
    );
}
