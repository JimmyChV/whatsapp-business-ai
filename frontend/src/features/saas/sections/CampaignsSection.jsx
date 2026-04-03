import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';

const STATUS_META = {
    draft: { label: 'Borrador', className: 'saas-campaigns-status--draft' },
    scheduled: { label: 'Programada', className: 'saas-campaigns-status--scheduled' },
    running: { label: 'Corriendo', className: 'saas-campaigns-status--running' },
    paused: { label: 'Pausada', className: 'saas-campaigns-status--paused' },
    completed: { label: 'Completada', className: 'saas-campaigns-status--completed' },
    cancelled: { label: 'Cancelada', className: 'saas-campaigns-status--cancelled' },
    failed: { label: 'Fallida', className: 'saas-campaigns-status--failed' }
};

const EMPTY_FORM = {
    campaignName: '',
    campaignDescription: '',
    moduleId: '',
    templateId: '',
    templateName: '',
    templateLanguage: 'es',
    scheduledAt: '',
    commercialStatus: '',
    languageFilter: '',
    marketingOptIn: '',
    tagsAnyText: '',
    searchText: '',
    maxRecipients: ''
};

function toText(value = '') { return String(value || '').trim(); }
function toLower(value = '') { return toText(value).toLowerCase(); }
function toNumber(value = 0) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

function formatDateTime(value = '') {
    const raw = toText(value);
    if (!raw) return '-';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw;
    return d.toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toDateTimeLocal(value = '') {
    const raw = toText(value);
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return '';
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTimeLocal(value = '') {
    const raw = toText(value);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function parseComma(value = '') {
    return toText(value).split(/[,\n;]/g).map((entry) => toLower(entry)).filter(Boolean);
}

function statusMeta(status = '') {
    const key = toLower(status);
    return STATUS_META[key] || { label: key || 'N/A', className: 'saas-campaigns-status--paused' };
}

function progress(campaign = {}) {
    const total = Math.max(0, toNumber(campaign?.totalRecipients));
    if (!total) return 0;
    const done = Math.max(0, toNumber(campaign?.sentRecipients) + toNumber(campaign?.failedRecipients) + toNumber(campaign?.skippedRecipients));
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function mapCampaignToForm(campaign = {}) {
    const filters = campaign?.audienceFiltersJson && typeof campaign.audienceFiltersJson === 'object' ? campaign.audienceFiltersJson : {};
    return {
        campaignName: toText(campaign?.campaignName),
        campaignDescription: toText(campaign?.campaignDescription),
        moduleId: toText(campaign?.moduleId),
        templateId: toText(campaign?.templateId),
        templateName: toText(campaign?.templateName),
        templateLanguage: toLower(campaign?.templateLanguage || 'es'),
        scheduledAt: toDateTimeLocal(campaign?.scheduledAt),
        commercialStatus: toLower(filters?.commercialStatus || ''),
        languageFilter: toLower(filters?.preferredLanguage || ''),
        marketingOptIn: Array.isArray(filters?.marketingStatus) ? toLower(filters.marketingStatus[0] || '') : '',
        tagsAnyText: Array.isArray(filters?.tagAny) ? filters.tagAny.join(', ') : '',
        searchText: toText(filters?.search),
        maxRecipients: filters?.maxRecipients ? String(filters.maxRecipients) : ''
    };
}

export default React.memo(function CampaignsSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const { notify, confirm } = useUiFeedback();
    const {
        isCampaignsSection = false,
        tenantScopeLocked = true,
        settingsTenantId = '',
        waModules = [],
        campaignsController = null,
        metaTemplatesController = null,
        setError = null
    } = context;

    const [panelMode, setPanelMode] = useState('detail');
    const [form, setForm] = useState(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [moduleFilter, setModuleFilter] = useState('');

    const {
        campaigns = [],
        selectedCampaign = null,
        selectedCampaignId = '',
        recipients = [],
        events = [],
        loading = false,
        error = '',
        loadCampaigns,
        selectCampaign,
        createCampaign,
        updateCampaign,
        startCampaign,
        pauseCampaign,
        resumeCampaign,
        cancelCampaign,
        loadRecipients,
        loadEvents
    } = campaignsController || {};

    const { items: templateItems = [], loadTemplates } = metaTemplatesController || {};

    const moduleOptions = useMemo(() => (Array.isArray(waModules) ? waModules : [])
        .map((item) => ({ moduleId: toText(item?.moduleId || item?.id), label: toText(item?.name || item?.moduleId || item?.id) }))
        .filter((entry) => entry.moduleId && entry.label), [waModules]);

    const approvedTemplates = useMemo(() => (Array.isArray(templateItems) ? templateItems : [])
        .filter((entry) => toLower(entry?.status) === 'approved')
        .map((entry) => ({
            templateId: toText(entry?.templateId || entry?.metaTemplateId || entry?.templateName),
            templateName: toText(entry?.templateName),
            moduleId: toText(entry?.moduleId),
            templateLanguage: toLower(entry?.templateLanguage || 'es')
        }))
        .filter((entry) => entry.templateName), [templateItems]);

    const filteredCampaigns = useMemo(() => {
        const term = toLower(search);
        return campaigns.filter((item) => (!statusFilter || toLower(item?.status) === toLower(statusFilter))
            && (!moduleFilter || toText(item?.moduleId) === toText(moduleFilter))
            && (!term || `${toLower(item?.campaignName)} ${toLower(item?.templateName)} ${toLower(item?.moduleId)}`.includes(term)));
    }, [campaigns, moduleFilter, search, statusFilter]);

    const templatesByModule = useMemo(() => {
        if (!form.moduleId) return approvedTemplates;
        return approvedTemplates.filter((entry) => !entry.moduleId || entry.moduleId === form.moduleId);
    }, [approvedTemplates, form.moduleId]);

    const runSafe = useCallback(async (action, fallbackMessage) => {
        try {
            return await action();
        } catch (err) {
            const message = String(err?.message || fallbackMessage);
            notify({ type: 'error', message });
            setError?.(message);
            return null;
        }
    }, [notify, setError]);

    const loadTracking = useCallback(async (campaignId) => {
        const cleanId = toText(campaignId || selectedCampaignId);
        if (!cleanId) return;
        await Promise.all([
            typeof loadRecipients === 'function' ? loadRecipients({ campaignId: cleanId, limit: 120, offset: 0 }) : Promise.resolve(),
            typeof loadEvents === 'function' ? loadEvents({ campaignId: cleanId, limit: 120, offset: 0 }) : Promise.resolve()
        ]);
    }, [loadEvents, loadRecipients, selectedCampaignId]);

    useEffect(() => {
        if (!isCampaignsSection || tenantScopeLocked || !settingsTenantId) return;
        loadCampaigns?.().catch(() => {});
        loadTemplates?.({ status: 'approved', limit: 300, offset: 0 }).catch(() => {});
    }, [isCampaignsSection, loadCampaigns, loadTemplates, settingsTenantId, tenantScopeLocked]);

    useEffect(() => {
        if (!isCampaignsSection || tenantScopeLocked || panelMode === 'create') return;
        if (selectedCampaignId || !campaigns[0]?.campaignId) return;
        selectCampaign?.(campaigns[0].campaignId, { loadDetail: true }).then(() => loadTracking(campaigns[0].campaignId)).catch(() => {});
    }, [campaigns, isCampaignsSection, loadTracking, panelMode, selectCampaign, selectedCampaignId, tenantScopeLocked]);

    if (!isCampaignsSection) return null;

    const selectedMeta = statusMeta(selectedCampaign?.status);
    const selectedProgress = progress(selectedCampaign);
    const canWrite = !tenantScopeLocked;

    return (
        <section id="saas_campaigns" className="saas-admin-card saas-admin-card--full">
            <div className={`saas-admin-master-detail saas-campaigns-layout ${(panelMode === 'create' || panelMode === 'edit') ? 'saas-campaigns-layout--builder' : ''}`}>
                <aside className="saas-admin-master-pane saas-campaigns-list-pane">
                    <div className="saas-admin-pane-header">
                        <div><h3>Campanas</h3><small>Builder + lifecycle + tracking</small></div>
                        <div className="saas-admin-list-actions saas-admin-list-actions--row">
                            <button type="button" disabled={loading || tenantScopeLocked} onClick={() => loadCampaigns?.().catch(() => {})}>Recargar</button>
                            <button type="button" disabled={loading || tenantScopeLocked} onClick={() => { setPanelMode('create'); setForm({ ...EMPTY_FORM, moduleId: moduleOptions[0]?.moduleId || '' }); }}>Nueva</button>
                        </div>
                    </div>
                    {tenantScopeLocked ? <div className="saas-admin-empty-state"><p>Selecciona una empresa para gestionar campanas.</p></div> : (
                        <>
                            <div className="saas-campaigns-list-filters">
                                <input placeholder="Buscar campana" value={search} onChange={(e) => setSearch(e.target.value)} />
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todos</option>{Object.keys(STATUS_META).map((key) => <option key={key} value={key}>{STATUS_META[key].label}</option>)}</select>
                                <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}><option value="">Todos los modulos</option>{moduleOptions.map((item) => <option key={item.moduleId} value={item.moduleId}>{item.label}</option>)}</select>
                            </div>
                            <div className="saas-admin-list saas-admin-list--compact">
                                {filteredCampaigns.length === 0 ? <div className="saas-admin-empty-inline">No hay campanas para estos filtros.</div> : filteredCampaigns.map((campaign) => {
                                    const meta = statusMeta(campaign?.status);
                                    const isActive = toText(campaign?.campaignId) === selectedCampaignId;
                                    return (
                                        <button key={toText(campaign?.campaignId)} type="button" className={`saas-admin-list-item--button saas-campaigns-list-item ${isActive ? 'active' : ''}`} onClick={() => runSafe(async () => { await selectCampaign?.(campaign.campaignId, { loadDetail: true }); await loadTracking(campaign.campaignId); setPanelMode('detail'); }, 'No se pudo abrir campana.')}>
                                            <div className="saas-campaigns-list-item__head"><strong>{toText(campaign?.campaignName) || 'Campana sin nombre'}</strong><span className={`saas-campaigns-status ${meta.className}`}>{meta.label}</span></div>
                                            <small>{toText(campaign?.templateName) || 'Sin template'} | {toText(campaign?.moduleId) || '-'}</small>
                                            <div className="saas-campaigns-progress"><div className="saas-campaigns-progress__track"><div className="saas-campaigns-progress__fill" style={{ width: `${progress(campaign)}%` }} /></div><span>{progress(campaign)}%</span></div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </aside>
                <div className="saas-admin-detail-pane saas-campaigns-detail-pane">
                    {tenantScopeLocked && <div className="saas-admin-empty-state saas-admin-empty-state--detail"><h4>Sin empresa activa</h4><p>Selecciona una empresa para continuar.</p></div>}
                    {!tenantScopeLocked && (panelMode === 'create' || panelMode === 'edit') && (
                        <div className="saas-campaigns-builder">
                            <div className="saas-campaigns-builder__form">
                                <div className="saas-admin-form-row"><div className="saas-admin-field"><label>Nombre</label><input value={form.campaignName} onChange={(e) => setForm((p) => ({ ...p, campaignName: e.target.value }))} /></div><div className="saas-admin-field"><label>Modulo</label><select value={form.moduleId} onChange={(e) => setForm((p) => ({ ...p, moduleId: e.target.value }))}><option value="">Selecciona modulo</option>{moduleOptions.map((m) => <option key={m.moduleId} value={m.moduleId}>{m.label}</option>)}</select></div></div>
                                <div className="saas-admin-form-row"><div className="saas-admin-field"><label>Template aprobado</label><select value={form.templateId} onChange={(e) => { const id = toText(e.target.value); const t = templatesByModule.find((x) => x.templateId === id) || null; setForm((p) => ({ ...p, templateId: id, templateName: t?.templateName || '', templateLanguage: t?.templateLanguage || 'es' })); }}><option value="">Selecciona template</option>{templatesByModule.map((t) => <option key={t.templateId} value={t.templateId}>{`${t.templateName} (${toText(t.templateLanguage).toUpperCase()})`}</option>)}</select></div><div className="saas-admin-field"><label>Programada</label><input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))} /></div></div>
                                <div className="saas-admin-form-row saas-admin-form-row--single"><div className="saas-admin-field"><label>Descripcion</label><textarea value={form.campaignDescription} onChange={(e) => setForm((p) => ({ ...p, campaignDescription: e.target.value }))} /></div></div>
                                <div className="saas-admin-form-row"><div className="saas-admin-field"><label>Estado comercial</label><input value={form.commercialStatus} onChange={(e) => setForm((p) => ({ ...p, commercialStatus: e.target.value }))} placeholder="nuevo | cotizado | vendido" /></div><div className="saas-admin-field"><label>Idioma</label><select value={form.languageFilter} onChange={(e) => setForm((p) => ({ ...p, languageFilter: e.target.value }))}><option value="">Todos</option><option value="es">Espanol</option><option value="en">English</option><option value="pt">Portugues</option></select></div></div>
                                <div className="saas-admin-form-row"><div className="saas-admin-field"><label>Opt-in</label><select value={form.marketingOptIn} onChange={(e) => setForm((p) => ({ ...p, marketingOptIn: e.target.value }))}><option value="">Sin filtro</option><option value="opted_in">opted_in</option><option value="opted_out">opted_out</option><option value="unknown">unknown</option></select></div><div className="saas-admin-field"><label>Max destinatarios</label><input type="number" min={0} value={form.maxRecipients} onChange={(e) => setForm((p) => ({ ...p, maxRecipients: e.target.value }))} /></div></div>
                                <div className="saas-admin-form-row"><div className="saas-admin-field"><label>Etiquetas</label><input value={form.tagsAnyText} onChange={(e) => setForm((p) => ({ ...p, tagsAnyText: e.target.value }))} placeholder="vip, recompra" /></div><div className="saas-admin-field"><label>Busqueda</label><input value={form.searchText} onChange={(e) => setForm((p) => ({ ...p, searchText: e.target.value }))} placeholder="nombre o telefono" /></div></div>
                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                    <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(async () => {
                                        const payload = { moduleId: toText(form.moduleId), scopeModuleId: toLower(form.moduleId), templateId: toText(form.templateId) || null, templateName: toText(form.templateName), templateLanguage: toLower(form.templateLanguage || 'es'), campaignName: toText(form.campaignName), campaignDescription: toText(form.campaignDescription) || null, scheduledAt: toIsoDateTimeLocal(form.scheduledAt), audienceFiltersJson: { commercialStatus: toLower(form.commercialStatus), preferredLanguage: toLower(form.languageFilter), marketingStatus: toLower(form.marketingOptIn) ? [toLower(form.marketingOptIn)] : [], tagAny: parseComma(form.tagsAnyText), search: toText(form.searchText), maxRecipients: Math.max(0, Math.floor(toNumber(form.maxRecipients))) || undefined }, variablesPreviewJson: {} };
                                        if (!payload.moduleId || !payload.templateName || !payload.campaignName) throw new Error('Nombre, modulo y template son obligatorios.');
                                        const response = panelMode === 'edit' ? await updateCampaign?.({ campaignId: selectedCampaignId, patch: payload }) : await createCampaign?.(payload);
                                        const campaign = response?.campaign || null;
                                        if (!campaign) return;
                                        notify({ type: 'info', message: panelMode === 'edit' ? 'Campana actualizada.' : 'Campana creada.' });
                                        await loadCampaigns?.();
                                        await selectCampaign?.(campaign.campaignId, { loadDetail: true });
                                        await loadTracking(campaign.campaignId);
                                        setPanelMode('detail');
                                    }, 'No se pudo guardar campana.')}>Guardar borrador</button>
                                    <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(async () => {
                                        if (panelMode === 'create') {
                                            await (async () => {
                                                const payload = { moduleId: toText(form.moduleId), scopeModuleId: toLower(form.moduleId), templateId: toText(form.templateId) || null, templateName: toText(form.templateName), templateLanguage: toLower(form.templateLanguage || 'es'), campaignName: toText(form.campaignName), campaignDescription: toText(form.campaignDescription) || null, scheduledAt: toIsoDateTimeLocal(form.scheduledAt), audienceFiltersJson: { commercialStatus: toLower(form.commercialStatus), preferredLanguage: toLower(form.languageFilter), marketingStatus: toLower(form.marketingOptIn) ? [toLower(form.marketingOptIn)] : [], tagAny: parseComma(form.tagsAnyText), search: toText(form.searchText), maxRecipients: Math.max(0, Math.floor(toNumber(form.maxRecipients))) || undefined }, variablesPreviewJson: {} };
                                                const response = await createCampaign?.(payload);
                                                const campaign = response?.campaign;
                                                if (!campaign) throw new Error('No se pudo crear campana.');
                                                await startCampaign?.(campaign.campaignId);
                                                await loadCampaigns?.();
                                                await selectCampaign?.(campaign.campaignId, { loadDetail: true });
                                                await loadTracking(campaign.campaignId);
                                                setPanelMode('detail');
                                            })();
                                        } else {
                                            await startCampaign?.(selectedCampaignId);
                                            await loadCampaigns?.();
                                            await loadTracking(selectedCampaignId);
                                        }
                                        notify({ type: 'info', message: 'Campana iniciada.' });
                                    }, 'No se pudo iniciar campana.')}>Guardar e iniciar</button>
                                    <button type="button" disabled={loading} onClick={() => setPanelMode('detail')}>Cancelar</button>
                                </div>
                            </div>
                            <aside className="saas-campaigns-builder__summary">
                                <div className="saas-admin-related-block"><h4>Estimacion de alcance</h4><div className="saas-campaigns-estimation"><strong>{panelMode === 'edit' ? toNumber(selectedCampaign?.totalRecipients) : '-'}</strong><span>{panelMode === 'edit' ? 'Estimacion basada en la ultima corrida almacenada.' : 'Se calcula al iniciar la campana.'}</span></div></div>
                                <div className="saas-admin-related-block"><h4>Resumen</h4><div className="saas-campaigns-builder-preview"><div><span>Template</span><strong>{toText(form.templateName) || '-'}</strong></div><div><span>Idioma</span><strong>{toText(form.templateLanguage).toUpperCase() || '-'}</strong></div><div><span>Programacion</span><strong>{form.scheduledAt ? formatDateTime(toIsoDateTimeLocal(form.scheduledAt)) : 'Inmediata'}</strong></div></div></div>
                            </aside>
                        </div>
                    )}
                    {!tenantScopeLocked && panelMode === 'detail' && (
                        !selectedCampaignId ? <div className="saas-admin-empty-state saas-admin-empty-state--detail"><p>Selecciona una campana para ver tracking.</p></div> : (
                            <div className="saas-campaigns-tracking">
                                <div className="saas-admin-pane-header"><div><h3>{toText(selectedCampaign?.campaignName) || 'Campana'}</h3><small>{toText(selectedCampaign?.templateName) || '-'}</small></div><div className="saas-admin-list-actions saas-admin-list-actions--row">{toLower(selectedCampaign?.status) === 'draft' && <button type="button" disabled={loading || !canWrite} onClick={() => { setForm(mapCampaignToForm(selectedCampaign)); setPanelMode('edit'); }}>Editar</button>}{toLower(selectedCampaign?.status) === 'running' && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => pauseCampaign?.(selectedCampaignId), 'No se pudo pausar campana.')}>Pausar</button>}{toLower(selectedCampaign?.status) === 'paused' && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => resumeCampaign?.(selectedCampaignId), 'No se pudo reanudar campana.')}>Reanudar</button>}{['draft', 'scheduled'].includes(toLower(selectedCampaign?.status)) && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => startCampaign?.(selectedCampaignId), 'No se pudo iniciar campana.')}>Iniciar</button>}{!['cancelled', 'completed'].includes(toLower(selectedCampaign?.status)) && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(async () => { const ok = await confirm({ title: 'Cancelar campana', message: 'Esta accion detendra el procesamiento pendiente.', confirmText: 'Cancelar campana', cancelText: 'Volver', tone: 'danger' }); if (!ok) return; await cancelCampaign?.(selectedCampaignId, 'cancelled_by_user'); }, 'No se pudo cancelar campana.')}>Cancelar</button>}<button type="button" disabled={loading} onClick={() => runSafe(async () => { await loadCampaigns?.(); await loadTracking(selectedCampaignId); }, 'No se pudo recargar tracking.')}>Recargar tracking</button></div></div>
                                <div className="saas-admin-detail-grid"><div className="saas-admin-detail-field"><span>Estado</span><strong><span className={`saas-campaigns-status ${selectedMeta.className}`}>{selectedMeta.label}</span></strong></div><div className="saas-admin-detail-field"><span>Modulo</span><strong>{toText(selectedCampaign?.moduleId) || '-'}</strong></div><div className="saas-admin-detail-field"><span>Total</span><strong>{toNumber(selectedCampaign?.totalRecipients)}</strong></div><div className="saas-admin-detail-field"><span>Enviados</span><strong>{toNumber(selectedCampaign?.sentRecipients)}</strong></div><div className="saas-admin-detail-field"><span>Fallidos</span><strong>{toNumber(selectedCampaign?.failedRecipients)}</strong></div><div className="saas-admin-detail-field"><span>Omitidos</span><strong>{toNumber(selectedCampaign?.skippedRecipients)}</strong></div></div>
                                <div className="saas-campaigns-progress saas-campaigns-progress--detail"><div className="saas-campaigns-progress__track"><div className="saas-campaigns-progress__fill" style={{ width: `${selectedProgress}%` }} /></div><span>{selectedProgress}%</span></div>
                                <div className="saas-campaigns-two-columns">
                                    <section className="saas-admin-related-block saas-campaigns-table-block"><h4>Destinatarios ({recipients.length})</h4><div className="saas-campaigns-table-wrap"><table className="saas-campaigns-table"><thead><tr><th>Telefono</th><th>Cliente</th><th>Estado</th><th>Intentos</th><th>Actualizado</th><th>Error</th></tr></thead><tbody>{recipients.length === 0 ? <tr><td colSpan={6}>Sin destinatarios.</td></tr> : recipients.map((r) => { const m = statusMeta(r?.status); return <tr key={`${toText(r?.recipientId)}_${toText(r?.phone)}`}><td>{toText(r?.phone) || '-'}</td><td>{toText(r?.customerId) || '-'}</td><td><span className={`saas-campaigns-status ${m.className}`}>{m.label}</span></td><td>{toNumber(r?.attemptCount)} / {toNumber(r?.maxAttempts)}</td><td>{formatDateTime(r?.updatedAt)}</td><td>{toText(r?.lastError || r?.skipReason) || '-'}</td></tr>; })}</tbody></table></div></section>
                                    <section className="saas-admin-related-block saas-campaigns-events-block"><h4>Eventos ({events.length})</h4><div className="saas-campaigns-events-list">{events.length === 0 ? <div className="saas-admin-empty-inline">Sin eventos.</div> : events.map((ev) => <article key={toText(ev?.eventId)} className="saas-campaigns-event-item"><header><strong>{toText(ev?.eventType) || 'event'}</strong><span>{formatDateTime(ev?.createdAt)}</span></header><p>{toText(ev?.message || ev?.reason) || '-'}</p><small>{`Actor: ${toText(ev?.actorType) || 'system'} | Severidad: ${toText(ev?.severity) || '-'}`}</small></article>)}</div></section>
                                </div>
                            </div>
                        )
                    )}
                    {error ? <div className="saas-meta-template-error">{error}</div> : null}
                </div>
            </div>
        </section>
    );
});
