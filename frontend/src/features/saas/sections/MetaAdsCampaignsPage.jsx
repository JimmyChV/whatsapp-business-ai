import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { SaasEntityPage } from '../components/entity';
import { SaasDataTable, SaasViewHeader } from '../components/layout';

const META_ADS_COLUMNS = [
    { key: 'campaign_name', label: 'Campaña', minWidth: '200px' },
    { key: 'adset_name', label: 'Conjunto', minWidth: '180px' },
    { key: 'ad_name', label: 'Anuncio', minWidth: '220px' },
    {
        key: 'ad_status',
        label: 'Estado',
        minWidth: '110px',
        render: (value, row) => {
            if (row?.isSummary) return <strong>{String(value || 'Resumen')}</strong>;
            const status = String(value || '').trim().toUpperCase();
            const statusClass = status === 'ACTIVE' ? 'saas-campaigns-status--running' : 'saas-campaigns-status--paused';
            return <span className={`saas-campaigns-status ${statusClass}`}>{status || '-'}</span>;
        }
    },
    { key: 'spend', label: 'Inversión S/', minWidth: '120px', align: 'right' },
    { key: 'impressions', label: 'Impresiones', minWidth: '120px', align: 'right' },
    { key: 'reach', label: 'Alcance', minWidth: '120px', align: 'right' },
    { key: 'clicks', label: 'Clics', minWidth: '100px', align: 'right' },
    { key: 'ctr', label: 'CTR %', minWidth: '100px', align: 'right' },
    { key: 'cpc', label: 'CPC S/', minWidth: '110px', align: 'right' },
    { key: 'cpm', label: 'CPM S/', minWidth: '110px', align: 'right' },
    { key: 'frequency', label: 'Frecuencia', minWidth: '110px', align: 'right' },
    { key: 'messaging_conversations', label: 'Conversaciones', minWidth: '130px', align: 'right' },
    { key: 'cost_per_conversation', label: 'Costo/conv S/', minWidth: '130px', align: 'right' }
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

function toIntegerLabel(value) {
    return Math.round(toNumber(value)).toLocaleString('es-PE');
}

function toCurrencyLabel(value, fractionDigits = 2) {
    const safe = toNumber(value);
    return safe.toLocaleString('es-PE', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    });
}

function toRatioLabel(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe)) return '-';
    return safe.toLocaleString('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function normalizeItems(payload) {
    const source = Array.isArray(payload?.items) ? payload.items : [];
    return source.map((item, index) => {
        const messagingConversations = toNumber(item?.messaging_conversations);
        const spend = toNumber(item?.spend);
        const costPerConversation = messagingConversations > 0
            ? spend / messagingConversations
            : toNumber(item?.cost_per_conversation);
        return {
            id: `${String(item?.ad_id || item?.adset_id || item?.campaign_id || index)}`,
            campaign_name: String(item?.campaign_name || '-').trim() || '-',
            adset_name: String(item?.adset_name || '-').trim() || '-',
            ad_name: String(item?.ad_name || '-').trim() || '-',
            ad_status: String(item?.ad_status || '-').trim().toUpperCase() || '-',
            spend: toCurrencyLabel(spend),
            impressions: toIntegerLabel(item?.impressions),
            reach: toIntegerLabel(item?.reach),
            clicks: toIntegerLabel(item?.clicks),
            ctr: toRatioLabel(item?.ctr),
            cpc: toRatioLabel(item?.cpc),
            cpm: toRatioLabel(item?.cpm),
            frequency: toRatioLabel(item?.frequency),
            messaging_conversations: toIntegerLabel(messagingConversations),
            cost_per_conversation: messagingConversations > 0 ? toRatioLabel(costPerConversation) : '-',
            __raw: {
                spend,
                impressions: toNumber(item?.impressions),
                reach: toNumber(item?.reach),
                clicks: toNumber(item?.clicks),
                ctr: Number(item?.ctr),
                cpc: Number(item?.cpc),
                cpm: Number(item?.cpm),
                frequency: Number(item?.frequency),
                messaging_conversations: messagingConversations,
                cost_per_conversation: messagingConversations > 0 ? costPerConversation : Number(item?.cost_per_conversation)
            }
        };
    });
}

function buildSummaryRow(rows = []) {
    const totals = rows.reduce((acc, row) => {
        const raw = row?.__raw || {};
        acc.spend += toNumber(raw.spend);
        acc.impressions += toNumber(raw.impressions);
        acc.reach += toNumber(raw.reach);
        acc.clicks += toNumber(raw.clicks);
        acc.messaging_conversations += toNumber(raw.messaging_conversations);
        if (Number.isFinite(raw.ctr)) {
            acc.ctrTotal += raw.ctr;
            acc.ctrCount += 1;
        }
        if (Number.isFinite(raw.cpc)) {
            acc.cpcTotal += raw.cpc;
            acc.cpcCount += 1;
        }
        if (Number.isFinite(raw.cpm)) {
            acc.cpmTotal += raw.cpm;
            acc.cpmCount += 1;
        }
        if (Number.isFinite(raw.frequency)) {
            acc.frequencyTotal += raw.frequency;
            acc.frequencyCount += 1;
        }
        if (Number.isFinite(raw.cost_per_conversation)) {
            acc.costPerConversationTotal += raw.cost_per_conversation;
            acc.costPerConversationCount += 1;
        }
        return acc;
    }, {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        messaging_conversations: 0,
        ctrTotal: 0,
        ctrCount: 0,
        cpcTotal: 0,
        cpcCount: 0,
        cpmTotal: 0,
        cpmCount: 0,
        frequencyTotal: 0,
        frequencyCount: 0,
        costPerConversationTotal: 0,
        costPerConversationCount: 0
    });

    const average = (total, count) => (count > 0 ? total / count : null);
    return {
        id: 'meta-ads-summary',
        isSummary: true,
        campaign_name: 'Resumen',
        adset_name: `${rows.length.toLocaleString('es-PE')} filas`,
        ad_name: '-',
        ad_status: 'Resumen',
        spend: toCurrencyLabel(totals.spend),
        impressions: toIntegerLabel(totals.impressions),
        reach: toIntegerLabel(totals.reach),
        clicks: toIntegerLabel(totals.clicks),
        ctr: toRatioLabel(average(totals.ctrTotal, totals.ctrCount)),
        cpc: toRatioLabel(average(totals.cpcTotal, totals.cpcCount)),
        cpm: toRatioLabel(average(totals.cpmTotal, totals.cpmCount)),
        frequency: toRatioLabel(average(totals.frequencyTotal, totals.frequencyCount)),
        messaging_conversations: toIntegerLabel(totals.messaging_conversations),
        cost_per_conversation: toRatioLabel(average(totals.costPerConversationTotal, totals.costPerConversationCount))
    };
}

export default function MetaAdsCampaignsPage({ context = {} }) {
    const { notify } = useUiFeedback();
    const requestJson = typeof context?.requestJson === 'function' ? context.requestJson : null;
    const tenantId = String(context?.settingsTenantId || context?.selectedTenantId || context?.tenantScopeId || '').trim();
    const tenantScopeLocked = context?.tenantScopeLocked === true;
    const [dateRange, setDateRange] = useState(() => buildDefaultDateRange());
    const [searchValue, setSearchValue] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');
    const [syncMessage, setSyncMessage] = useState('');

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
            const payload = await requestJson(`/api/meta-ads/insights?${query.toString()}`);
            setRows(normalizeItems(payload));
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

    const filteredRows = useMemo(() => {
        const query = String(searchValue || '').trim().toLowerCase();
        if (!query) return rows;
        return rows.filter((row) => {
            const haystack = [
                row?.campaign_name,
                row?.adset_name,
                row?.ad_name
            ].map((value) => String(value || '').trim().toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }, [rows, searchValue]);

    const visibleRows = useMemo(() => {
        if (filteredRows.length === 0) return filteredRows;
        return [...filteredRows, buildSummaryRow(filteredRows)];
    }, [filteredRows]);

    const handleSync = useCallback(async () => {
        if (!requestJson || !tenantId) return;
        setSyncing(true);
        setLoading(true);
        setError('');
        setSyncMessage('');
        try {
            const payload = await requestJson('/api/meta-ads/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId })
            });
            const nextMessage = `${Number(payload?.adsCount || 0).toLocaleString('es-PE')} ads y ${Number(payload?.insightsCount || 0).toLocaleString('es-PE')} insights sincronizados.`;
            setSyncMessage(nextMessage);
            notify({ type: 'info', message: nextMessage });
            await loadInsights({ silent: true });
        } catch (syncError) {
            const nextError = String(syncError?.message || 'No se pudo sincronizar Meta Ads.');
            setError(nextError);
            notify({ type: 'error', message: nextError });
        } finally {
            setSyncing(false);
            setLoading(false);
        }
    }, [loadInsights, notify, requestJson, tenantId]);

    const headerElement = (
        <SaasViewHeader
            title="Campañas Meta"
            count={filteredRows.length}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Buscar campaña, conjunto o anuncio..."
            searchDisabled={tenantScopeLocked || loading || syncing}
            actions={[{
                key: 'sync',
                label: syncing ? 'Sincronizando...' : 'Sincronizar',
                onClick: handleSync,
                disabled: tenantScopeLocked || syncing || loading || !tenantId
            }]}
            extra={(
                <>
                    <div className="saas-admin-form-row">
                        <div className="saas-admin-field">
                            <label htmlFor="meta-ads-date-start">Desde</label>
                            <input
                                id="meta-ads-date-start"
                                type="date"
                                value={dateRange.dateStart}
                                disabled={tenantScopeLocked || loading || syncing}
                                onChange={(event) => setDateRange((current) => ({ ...current, dateStart: event.target.value }))}
                            />
                        </div>
                        <div className="saas-admin-field">
                            <label htmlFor="meta-ads-date-stop">Hasta</label>
                            <input
                                id="meta-ads-date-stop"
                                type="date"
                                value={dateRange.dateStop}
                                disabled={tenantScopeLocked || loading || syncing}
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
                columns={META_ADS_COLUMNS}
                rows={visibleRows}
                loading={loading}
                emptyText="No hay campañas Meta Ads para este rango."
                enableInfinite={false}
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
