import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import {
    SaasDataTable,
    SaasDetailPanel,
    SaasDetailPanelSection,
    SaasTableDetailLayout,
    SaasViewHeader,
    useSaasColumnPrefs
} from '../components/layout';

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
    commercialStatuses: [],
    selectedLabelIds: [],
    languageFilter: '',
    searchText: '',
    maxRecipients: ''
};

function toText(value = '') { return String(value || '').trim(); }
function toLower(value = '') { return toText(value).toLowerCase(); }
function toUpper(value = '') { return toText(value).toUpperCase(); }
function toNumber(value = 0, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

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

const COMMERCIAL_STATUS_OPTIONS = [
    { key: 'nuevo', label: 'Nuevo' },
    { key: 'en_conversacion', label: 'En conversacion' },
    { key: 'cotizado', label: 'Cotizado' },
    { key: 'vendido', label: 'Vendido' },
    { key: 'perdido', label: 'Perdido' }
];

const CAMPAIGN_TABLE_COLUMNS = [
    { key: 'campaignName', label: 'Nombre', width: '240px', minWidth: '220px', maxWidth: '320px', type: 'text' },
    { key: 'category', label: 'Categoria', width: '140px', minWidth: '124px', maxWidth: '180px', type: 'option' },
    { key: 'language', label: 'Idioma', width: '120px', minWidth: '108px', maxWidth: '144px', type: 'option' },
    { key: 'status', label: 'Estado', width: '132px', minWidth: '120px', maxWidth: '168px', type: 'option' },
    { key: 'moduleId', label: 'Modulo', width: '168px', minWidth: '144px', maxWidth: '220px', type: 'option' },
    { key: 'updatedAt', label: 'Actualizado', width: '168px', minWidth: '146px', maxWidth: '220px', type: 'date' }
];

const CAMPAIGN_DEFAULT_COLUMN_KEYS = ['campaignName', 'category', 'language', 'status', 'moduleId', 'updatedAt'];

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

function normalizeCommercialStatuses(value = []) {
    const source = Array.isArray(value) ? value : [];
    const allowed = new Set(COMMERCIAL_STATUS_OPTIONS.map((entry) => entry.key));
    return Array.from(new Set(source.map((entry) => toLower(entry)).filter((entry) => allowed.has(entry))));
}

function buildLabelOptions(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => ({
            labelId: toUpper(item?.labelId || item?.id || ''),
            name: toText(item?.name || item?.labelName || item?.label || ''),
            isActive: item?.isActive !== false
        }))
        .filter((item) => item.labelId && item.name && item.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

function mapCampaignToForm(campaign = {}, labelOptions = []) {
    const filters = campaign?.audienceFiltersJson && typeof campaign.audienceFiltersJson === 'object' ? campaign.audienceFiltersJson : {};
    const labelsByName = new Map(labelOptions.map((entry) => [toLower(entry.name), entry.labelId]));
    const labelsById = new Set(labelOptions.map((entry) => toUpper(entry.labelId)));
    const selectedLabelIds = (Array.isArray(filters?.tagAny) ? filters.tagAny : [])
        .map((entry) => {
            const raw = toText(entry);
            if (!raw) return '';
            const upper = toUpper(raw);
            if (labelsById.has(upper)) return upper;
            return labelsByName.get(toLower(raw)) || '';
        })
        .filter(Boolean);
    return {
        campaignName: toText(campaign?.campaignName),
        campaignDescription: toText(campaign?.campaignDescription),
        moduleId: toText(campaign?.moduleId),
        templateId: toText(campaign?.templateId),
        templateName: toText(campaign?.templateName),
        templateLanguage: toLower(campaign?.templateLanguage || 'es'),
        scheduledAt: toDateTimeLocal(campaign?.scheduledAt),
        commercialStatuses: normalizeCommercialStatuses(filters?.commercialStatuses || (filters?.commercialStatus ? [filters.commercialStatus] : [])),
        selectedLabelIds: Array.from(new Set(selectedLabelIds)),
        languageFilter: toLower(filters?.preferredLanguage || ''),
        searchText: toText(filters?.search),
        maxRecipients: filters?.maxRecipients ? String(filters.maxRecipients) : ''
    };
}

function buildAudienceFiltersFromForm(form = {}, labelOptions = []) {
    const labelsById = new Map(labelOptions.map((entry) => [toUpper(entry.labelId), entry]));
    const tagAny = (Array.isArray(form?.selectedLabelIds) ? form.selectedLabelIds : [])
        .map((labelId) => labelsById.get(toUpper(labelId)))
        .filter(Boolean)
        .map((entry) => toLower(entry.name))
        .filter(Boolean);
    const maxRecipients = Math.max(0, Math.floor(toNumber(form?.maxRecipients)));
    return {
        commercialStatuses: normalizeCommercialStatuses(form?.commercialStatuses || []),
        preferredLanguage: toLower(form?.languageFilter || ''),
        marketingStatus: ['opted_in'],
        tagAny,
        search: toText(form?.searchText || ''),
        maxRecipients: maxRecipients > 0 ? maxRecipients : undefined
    };
}

function getAudienceSelectionFromCampaign(campaign = {}) {
    const selection = campaign?.audienceSelectionJson && typeof campaign.audienceSelectionJson === 'object'
        ? campaign.audienceSelectionJson
        : {};
    return {
        excludedCustomerIds: Array.from(
            new Set(
                (Array.isArray(selection.excludedCustomerIds) ? selection.excludedCustomerIds : [])
                    .map((entry) => toText(entry))
                    .filter(Boolean)
            )
        )
    };
}

function serializeCampaignForm(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    return JSON.stringify({
        campaignName: toText(source.campaignName),
        campaignDescription: toText(source.campaignDescription),
        moduleId: toText(source.moduleId),
        templateId: toText(source.templateId),
        templateName: toText(source.templateName),
        templateLanguage: toLower(source.templateLanguage || 'es'),
        scheduledAt: toText(source.scheduledAt),
        commercialStatuses: normalizeCommercialStatuses(source.commercialStatuses || []),
        selectedLabelIds: Array.from(
            new Set((Array.isArray(source.selectedLabelIds) ? source.selectedLabelIds : []).map((entry) => toUpper(entry)))
        ).sort(),
        languageFilter: toLower(source.languageFilter || ''),
        searchText: toText(source.searchText),
        maxRecipients: toText(source.maxRecipients)
    });
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
        availableLabels: availableLabelsFromContext = [],
        reachEstimate: reachEstimateFromContext = null,
        estimating: estimatingFromContext = false,
        estimateReach: estimateReachFromContext = null,
        setError = null
    } = context;

    const [panelMode, setPanelMode] = useState('list');
    const [form, setForm] = useState(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [moduleFilter, setModuleFilter] = useState('');
    const [showColumnsMenu, setShowColumnsMenu] = useState(false);
    const [maxRecipientsTouched, setMaxRecipientsTouched] = useState(false);
    const [localEstimate, setLocalEstimate] = useState(null);
    const [excludedCustomerIds, setExcludedCustomerIds] = useState([]);

    const {
        campaigns = [],
        selectedCampaign = null,
        selectedCampaignId = '',
        recipients = [],
        events = [],
        loading = false,
        error = '',
        hasLoadedCampaigns = false,
        loadCampaigns,
        selectCampaign,
        createCampaign,
        updateCampaign,
        startCampaign,
        pauseCampaign,
        resumeCampaign,
        cancelCampaign,
        loadRecipients,
        loadEvents,
        availableLabels: availableLabelsFromController = [],
        reachEstimate: reachEstimateFromController = null,
        estimating: estimatingFromController = false,
        estimateReach: estimateReachFromController = null
    } = campaignsController || {};

    const { items: templateItems = [], loadTemplates } = metaTemplatesController || {};

    const availableLabels = useMemo(() => {
        if (Array.isArray(availableLabelsFromContext) && availableLabelsFromContext.length > 0) return availableLabelsFromContext;
        return availableLabelsFromController;
    }, [availableLabelsFromContext, availableLabelsFromController]);
    const reachEstimate = localEstimate || reachEstimateFromContext || reachEstimateFromController || null;
    const estimating = Boolean(estimatingFromContext || estimatingFromController);
    const estimateReachAction = estimateReachFromContext || estimateReachFromController;

    const labelOptions = useMemo(() => buildLabelOptions(availableLabels), [availableLabels]);
    const columnPrefs = useSaasColumnPrefs('campaigns', CAMPAIGN_DEFAULT_COLUMN_KEYS);

    const moduleOptions = useMemo(() => (Array.isArray(waModules) ? waModules : [])
        .map((item) => ({
            moduleId: toText(item?.moduleId || item?.id),
            label: toText(item?.name || item?.moduleId || item?.id),
            isActive: item?.isActive !== false && item?.active !== false && toLower(item?.status || '') !== 'inactive'
        }))
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

    const campaignTableColumns = useMemo(() => {
        const visible = new Set(columnPrefs.visibleColumnKeys);
        return CAMPAIGN_TABLE_COLUMNS.map((column) => ({
            ...column,
            hidden: !visible.has(column.key),
            options: column.key === 'status'
                ? Object.keys(STATUS_META).map((key) => ({ value: key, label: STATUS_META[key].label }))
                : (column.key === 'moduleId'
                    ? moduleOptions.map((item) => ({ value: item.moduleId, label: item.label }))
                    : undefined),
            render: column.key === 'status'
                ? (value) => {
                    const meta = statusMeta(value);
                    return <span className={`saas-campaigns-status ${meta.className}`}>{meta.label}</span>;
                }
                : (column.key === 'updatedAt'
                    ? (value) => formatDateTime(value)
                    : undefined)
        }));
    }, [columnPrefs.visibleColumnKeys, moduleOptions]);

    const campaignTableRows = useMemo(() => filteredCampaigns.map((campaign) => ({
        id: toText(campaign?.campaignId),
        campaignId: toText(campaign?.campaignId),
        campaignName: toText(campaign?.campaignName) || 'Campana sin nombre',
        category: toText(campaign?.templateCategory || campaign?.category || '-'),
        language: toUpper(campaign?.templateLanguage || campaign?.language || '-'),
        status: toLower(campaign?.status || ''),
        moduleId: toText(campaign?.moduleId || '-') || '-',
        updatedAt: toText(campaign?.updatedAt || campaign?.createdAt || '')
    })), [filteredCampaigns]);

    const templatesByModule = useMemo(() => {
        if (!form.moduleId) return approvedTemplates;
        return approvedTemplates.filter((entry) => !entry.moduleId || entry.moduleId === form.moduleId);
    }, [approvedTemplates, form.moduleId]);

    const selectedTemplate = useMemo(() => {
        const cleanTemplateId = toText(form.templateId);
        if (!cleanTemplateId) return null;
        return templatesByModule.find((entry) => entry.templateId === cleanTemplateId) || null;
    }, [form.templateId, templatesByModule]);

    const selectedModule = useMemo(() => {
        const cleanModuleId = toText(form.moduleId);
        if (!cleanModuleId) return null;
        return moduleOptions.find((entry) => entry.moduleId === cleanModuleId) || null;
    }, [form.moduleId, moduleOptions]);

    const estimateNumbers = useMemo(() => ({
        total: Math.max(0, toNumber(reachEstimate?.total)),
        eligible: Math.max(0, toNumber(reachEstimate?.eligible)),
        excluded: Math.max(0, toNumber(reachEstimate?.excluded))
    }), [reachEstimate]);
    const estimatedAudienceItems = useMemo(() => (
        (Array.isArray(reachEstimate?.items) ? reachEstimate.items : [])
            .map((item) => ({
                customerId: toText(item?.customerId),
                contactName: toText(item?.contactName) || 'Sin nombre',
                phone: toText(item?.phone) || '-',
                commercialStatus: toLower(item?.commercialStatus || 'unknown') || 'unknown',
                tags: Array.isArray(item?.tags)
                    ? item.tags.map((entry) => toText(entry)).filter(Boolean)
                    : [],
                preferredLanguage: toLower(item?.preferredLanguage || 'es') || 'es',
                marketingOptInStatus: toLower(item?.marketingOptInStatus || 'unknown') || 'unknown'
            }))
            .filter((item) => item.customerId)
    ), [reachEstimate]);
    const excludedCustomerIdSet = useMemo(() => (
        new Set((Array.isArray(excludedCustomerIds) ? excludedCustomerIds : []).map((entry) => toText(entry)).filter(Boolean))
    ), [excludedCustomerIds]);
    const exclusionSummary = useMemo(() => {
        const eligible = estimatedAudienceItems.length;
        const excluded = estimatedAudienceItems.filter((item) => excludedCustomerIdSet.has(item.customerId)).length;
        const finalRecipients = Math.max(0, eligible - excluded);
        return { eligible, excluded, finalRecipients };
    }, [estimatedAudienceItems, excludedCustomerIdSet]);
    const formBaseline = useMemo(() => {
        if (panelMode === 'edit' && selectedCampaign) {
            return serializeCampaignForm(mapCampaignToForm(selectedCampaign, labelOptions));
        }
        if (panelMode === 'create') {
            return serializeCampaignForm({ ...EMPTY_FORM, moduleId: moduleOptions[0]?.moduleId || '' });
        }
        return serializeCampaignForm(EMPTY_FORM);
    }, [labelOptions, moduleOptions, panelMode, selectedCampaign]);
    const formDraft = useMemo(() => serializeCampaignForm(form), [form]);
    const isCampaignFormDirty = useMemo(() => (
        (panelMode === 'create' || panelMode === 'edit') && formDraft !== formBaseline
    ), [formBaseline, formDraft, panelMode]);

    const canStartGuardrails = useMemo(() => {
        const templateApproved = Boolean(selectedTemplate?.templateId);
        const moduleActive = selectedModule ? selectedModule.isActive !== false : false;
        const hasEligibleAudience = estimateNumbers.eligible >= 1;
        return [
            {
                key: 'template',
                ok: templateApproved,
                label: 'Template aprobado',
                hint: templateApproved ? 'OK' : 'Selecciona un template en estado aprobado.'
            },
            {
                key: 'module',
                ok: moduleActive,
                label: 'Modulo activo',
                hint: moduleActive ? 'OK' : 'Selecciona un modulo activo.'
            },
            {
                key: 'eligible',
                ok: hasEligibleAudience,
                label: 'Destinatarios elegibles >= 1',
                hint: hasEligibleAudience ? `${estimateNumbers.eligible} elegibles` : (reachEstimate ? 'No hay elegibles para estos filtros.' : 'Primero estima el alcance.')
            }
        ];
    }, [estimateNumbers.eligible, reachEstimate, selectedModule, selectedTemplate]);
    const canStartWithGuardrails = canStartGuardrails.every((entry) => entry.ok);
    const maxRecipientsRange = Math.max(1, estimateNumbers.eligible || 1);
    const selectedLabels = useMemo(() => {
        const selected = new Set((Array.isArray(form.selectedLabelIds) ? form.selectedLabelIds : []).map((entry) => toUpper(entry)));
        return labelOptions.filter((entry) => selected.has(toUpper(entry.labelId)));
    }, [form.selectedLabelIds, labelOptions]);
    const selectedStatusKey = toLower(selectedCampaign?.status);
    const showsEstimatedAudienceInDetail = panelMode === 'detail' && ['draft', 'scheduled'].includes(selectedStatusKey);
    const detailAudienceTitle = showsEstimatedAudienceInDetail
        ? `Audiencia estimada (${estimateNumbers.eligible || estimatedAudienceItems.length})`
        : `Destinatarios (${recipients.length})`;

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
        if (!hasLoadedCampaigns) {
            loadCampaigns?.().catch(() => {});
        }
        if (!Array.isArray(templateItems) || templateItems.length === 0) {
            loadTemplates?.({ status: 'approved', limit: 300, offset: 0 }).catch(() => {});
        }
    }, [
        hasLoadedCampaigns,
        isCampaignsSection,
        loadCampaigns,
        loadTemplates,
        settingsTenantId,
        templateItems,
        tenantScopeLocked
    ]);

    useEffect(() => {
        if (panelMode !== 'create' && panelMode !== 'edit') return;
        if (maxRecipientsTouched) return;
        const eligible = estimateNumbers.eligible;
        if (!Number.isFinite(eligible) || eligible <= 0) return;
        setForm((prev) => ({ ...prev, maxRecipients: String(eligible) }));
    }, [estimateNumbers.eligible, maxRecipientsTouched, panelMode]);

    useEffect(() => {
        if (estimatedAudienceItems.length === 0) return;
        const validIds = new Set(estimatedAudienceItems.map((item) => item.customerId));
        setExcludedCustomerIds((prev) => prev.filter((customerId) => validIds.has(toText(customerId))));
    }, [estimatedAudienceItems]);

    useEffect(() => {
        if (panelMode !== 'edit' && panelMode !== 'detail') return;
        if (!selectedCampaign) return;
        setExcludedCustomerIds(getAudienceSelectionFromCampaign(selectedCampaign).excludedCustomerIds);
    }, [panelMode, selectedCampaign]);

    const toggleAudienceExclusion = useCallback((customerId = '') => {
        const cleanCustomerId = toText(customerId);
        if (!cleanCustomerId) return;
        setExcludedCustomerIds((prev) => {
            const current = new Set((Array.isArray(prev) ? prev : []).map((entry) => toText(entry)).filter(Boolean));
            if (current.has(cleanCustomerId)) current.delete(cleanCustomerId);
            else current.add(cleanCustomerId);
            return Array.from(current);
        });
    }, []);

    const toggleCommercialStatus = useCallback((statusKey = '') => {
        const cleanKey = toLower(statusKey);
        if (!cleanKey) return;
        setForm((prev) => {
            const current = new Set(normalizeCommercialStatuses(prev.commercialStatuses));
            if (current.has(cleanKey)) current.delete(cleanKey);
            else current.add(cleanKey);
            return { ...prev, commercialStatuses: Array.from(current) };
        });
    }, []);

    const toggleLabel = useCallback((labelId = '') => {
        const cleanLabelId = toUpper(labelId);
        if (!cleanLabelId) return;
        setForm((prev) => {
            const current = new Set((Array.isArray(prev.selectedLabelIds) ? prev.selectedLabelIds : []).map((entry) => toUpper(entry)));
            if (current.has(cleanLabelId)) current.delete(cleanLabelId);
            else current.add(cleanLabelId);
            return { ...prev, selectedLabelIds: Array.from(current) };
        });
    }, []);

    const buildCampaignPayload = useCallback(() => {
        const audienceFiltersJson = buildAudienceFiltersFromForm(form, labelOptions);
        return {
            moduleId: toText(form.moduleId),
            scopeModuleId: toLower(form.moduleId),
            templateId: toText(form.templateId) || null,
            templateName: toText(form.templateName),
            templateLanguage: toLower(form.templateLanguage || 'es'),
            campaignName: toText(form.campaignName),
            campaignDescription: toText(form.campaignDescription) || null,
            scheduledAt: toIsoDateTimeLocal(form.scheduledAt),
            audienceFiltersJson,
            audienceSelectionJson: {
                excludedCustomerIds: Array.from(
                    new Set((Array.isArray(excludedCustomerIds) ? excludedCustomerIds : []).map((entry) => toText(entry)).filter(Boolean))
                )
            },
            variablesPreviewJson: {}
        };
    }, [excludedCustomerIds, form, labelOptions]);

    const runEstimate = useCallback(async () => {
        if (typeof estimateReachAction !== 'function') return;
        const payload = buildCampaignPayload();
        if (!payload.moduleId) throw new Error('Selecciona un modulo antes de estimar alcance.');
        if (!payload.templateName) throw new Error('Selecciona un template aprobado antes de estimar alcance.');
        const response = await estimateReachAction({
            scopeModuleId: payload.scopeModuleId,
            moduleId: payload.moduleId,
            templateName: payload.templateName,
            templateLanguage: payload.templateLanguage,
            filters: payload.audienceFiltersJson
        });
        const estimate = response?.estimate && typeof response.estimate === 'object'
            ? response.estimate
            : null;
        if (estimate) {
            setLocalEstimate(estimate);
            setExcludedCustomerIds([]);
        }
    }, [buildCampaignPayload, estimateReachAction]);

    const runDetailEstimate = useCallback(async () => {
        if (typeof estimateReachAction !== 'function') return;
        if (!selectedCampaign) throw new Error('No hay campana seleccionada.');
        const detailForm = mapCampaignToForm(selectedCampaign, labelOptions);
        const audienceFiltersJson = buildAudienceFiltersFromForm(detailForm, labelOptions);
        const payload = {
            scopeModuleId: toLower(detailForm.moduleId),
            moduleId: toText(detailForm.moduleId),
            templateName: toText(detailForm.templateName),
            templateLanguage: toLower(detailForm.templateLanguage || 'es'),
            filters: audienceFiltersJson
        };
        if (!payload.moduleId) throw new Error('La campana no tiene modulo configurado.');
        if (!payload.templateName) throw new Error('La campana no tiene template configurado.');
        const response = await estimateReachAction(payload);
        const estimate = response?.estimate && typeof response.estimate === 'object'
            ? response.estimate
            : null;
        if (estimate) {
            setLocalEstimate(estimate);
            setExcludedCustomerIds(getAudienceSelectionFromCampaign(selectedCampaign).excludedCustomerIds);
        }
    }, [estimateReachAction, labelOptions, selectedCampaign]);

    const clearSelectedCampaign = useCallback(() => {
        if (typeof selectCampaign === 'function') {
            selectCampaign('').catch(() => {});
        }
    }, [selectCampaign]);

    const handleCloseCampaignDetail = useCallback(() => {
        setPanelMode('list');
        setLocalEstimate(null);
        setMaxRecipientsTouched(false);
        setExcludedCustomerIds([]);
        clearSelectedCampaign();
    }, [clearSelectedCampaign]);

    const handleRequestCancelCampaignEdit = useCallback(async () => {
        if (isCampaignFormDirty) {
            const ok = await confirm({
                title: 'Descartar cambios',
                message: 'Hay cambios sin guardar en la campana. Si continuas, se perderan.',
                confirmText: 'Descartar',
                cancelText: 'Seguir editando',
                tone: 'danger'
            });
            if (!ok) return;
        }

        setLocalEstimate(null);
        setMaxRecipientsTouched(false);
        setExcludedCustomerIds([]);
        if (panelMode === 'edit' && selectedCampaign) {
            setForm(mapCampaignToForm(selectedCampaign, labelOptions));
            setExcludedCustomerIds(getAudienceSelectionFromCampaign(selectedCampaign).excludedCustomerIds);
            setPanelMode('detail');
            return;
        }
        setForm({ ...EMPTY_FORM, moduleId: moduleOptions[0]?.moduleId || '' });
        setPanelMode('list');
        clearSelectedCampaign();
    }, [
        confirm,
        isCampaignFormDirty,
        labelOptions,
        moduleOptions,
        panelMode,
        clearSelectedCampaign,
        selectedCampaign
    ]);

    const handleRequestCloseCampaignPanel = useCallback(async () => {
        if (showColumnsMenu) {
            setShowColumnsMenu(false);
            return;
        }
        if (panelMode === 'create' || panelMode === 'edit') {
            await handleRequestCancelCampaignEdit();
            return;
        }
        if (selectedCampaignId) {
            handleCloseCampaignDetail();
        }
    }, [
        handleCloseCampaignDetail,
        handleRequestCancelCampaignEdit,
        panelMode,
        selectedCampaignId,
        showColumnsMenu
    ]);

    useEffect(() => {
        if (!isCampaignsSection) return undefined;
        const onPanelEscape = (event) => {
            const hasOpenState = Boolean(
                showColumnsMenu
                || panelMode === 'create'
                || panelMode === 'edit'
                || selectedCampaignId
            );
            if (!hasOpenState) return;
            event.preventDefault();
            void handleRequestCloseCampaignPanel();
        };
        window.addEventListener('saas-panel-escape', onPanelEscape);
        return () => window.removeEventListener('saas-panel-escape', onPanelEscape);
    }, [
        handleRequestCloseCampaignPanel,
        isCampaignsSection,
        panelMode,
        selectedCampaignId,
        showColumnsMenu
    ]);

    if (!isCampaignsSection) return null;

    const selectedMeta = statusMeta(selectedCampaign?.status);
    const selectedProgress = progress(selectedCampaign);
    const canWrite = !tenantScopeLocked;
    const layoutSelectedId = panelMode === 'create' ? '__create__' : (selectedCampaignId || '');

    const headerElement = (
        <SaasViewHeader
            title="Campanas"
            count={filteredCampaigns.length}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar campana por nombre, template o modulo"
            actions={[
                {
                    key: 'reload',
                    label: 'Recargar',
                    onClick: () => loadCampaigns?.().catch(() => {}),
                    disabled: loading || tenantScopeLocked
                },
                {
                    key: 'columns',
                    label: 'Columnas',
                    variant: 'secondary',
                    onClick: () => setShowColumnsMenu((prev) => !prev),
                    disabled: tenantScopeLocked
                },
                {
                    key: 'create',
                    label: 'Nueva',
                    onClick: () => {
                        setPanelMode('create');
                        clearSelectedCampaign();
                        setMaxRecipientsTouched(false);
                        setLocalEstimate(null);
                        setForm({ ...EMPTY_FORM, moduleId: moduleOptions[0]?.moduleId || '' });
                    },
                    disabled: loading || tenantScopeLocked
                }
            ]}
            filters={{
                columns: [
                    { key: 'status', label: 'Estado', type: 'option', options: Object.keys(STATUS_META).map((key) => ({ value: key, label: STATUS_META[key].label })) },
                    { key: 'moduleId', label: 'Modulo', type: 'option', options: moduleOptions.map((item) => ({ value: item.moduleId, label: item.label })) }
                ],
                value: {
                    columnKey: statusFilter ? 'status' : (moduleFilter ? 'moduleId' : ''),
                    operator: 'equals',
                    value: statusFilter || moduleFilter || ''
                },
                onChange: (next) => {
                    const columnKey = toText(next?.columnKey);
                    const value = toText(next?.value);
                    if (columnKey === 'status') {
                        setStatusFilter(value);
                        setModuleFilter('');
                        return;
                    }
                    if (columnKey === 'moduleId') {
                        setModuleFilter(value);
                        setStatusFilter('');
                        return;
                    }
                    setStatusFilter('');
                    setModuleFilter('');
                },
                onClear: () => {
                    setStatusFilter('');
                    setModuleFilter('');
                }
            }}
            extra={showColumnsMenu ? (
                <div className="saas-campaigns-columns-menu">
                    {CAMPAIGN_TABLE_COLUMNS.map((column) => {
                        const checked = columnPrefs.visibleColumnKeys.includes(column.key);
                        return (
                            <label key={column.key} className="saas-campaigns-columns-menu__item">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => columnPrefs.toggleColumn(column.key)}
                                />
                                <span>{column.label}</span>
                            </label>
                        );
                    })}
                </div>
            ) : null}
        />
    );

    const listPane = (
        <div className="saas-campaigns-pane">
            {tenantScopeLocked ? <div className="saas-admin-empty-state"><p>Selecciona una empresa para gestionar campanas.</p></div> : (
                <SaasDataTable
                    columns={campaignTableColumns}
                    rows={campaignTableRows}
                    selectedId={panelMode === 'create' ? '' : selectedCampaignId}
                    loading={loading}
                    emptyText="No hay campanas para estos filtros."
                    onSelect={(row) => runSafe(async () => {
                        await selectCampaign?.(row?.campaignId, { loadDetail: true });
                        await loadTracking(row?.campaignId);
                        setPanelMode('detail');
                    }, 'No se pudo abrir campana.')}
                />
            )}
        </div>
    );

    const rightPane = (
        <div className="saas-campaigns-right-shell">
            {tenantScopeLocked && <div className="saas-admin-empty-state saas-admin-empty-state--detail"><h4>Sin empresa activa</h4><p>Selecciona una empresa para continuar.</p></div>}
            {!tenantScopeLocked && (panelMode === 'create' || panelMode === 'edit') && (
                <SaasDetailPanel
                    title={panelMode === 'edit' ? (toText(form.campaignName) || 'Editar campana') : 'Nueva campana'}
                    subtitle={panelMode === 'edit' ? 'Actualiza segmentacion, template y programacion.' : 'Configura segmentacion, template y estimacion.'}
                    className="saas-campaigns-detail-panel saas-campaigns-detail-panel--builder"
                    bodyClassName="saas-campaigns-detail-panel__body"
                    actions={(
                        <>
                            <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(async () => {
                                const payload = buildCampaignPayload();
                                if (!payload.moduleId || !payload.templateName || !payload.campaignName) throw new Error('Nombre, modulo y template son obligatorios.');
                                const response = panelMode === 'edit' ? await updateCampaign?.({ campaignId: selectedCampaignId, patch: payload }) : await createCampaign?.(payload);
                                const campaign = response?.campaign || null;
                                if (!campaign) return;
                                await loadTracking(campaign.campaignId);
                                await loadCampaigns?.();
                                await selectCampaign?.(campaign.campaignId, { loadDetail: false });
                                setPanelMode('detail');
                                setLocalEstimate(null);
                                notify({ type: 'info', message: panelMode === 'edit' ? 'Campana actualizada.' : 'Campana creada.' });
                            }, 'No se pudo guardar campana.')}>Guardar borrador</button>
                            <button type="button" disabled={loading || estimating || !canWrite} onClick={() => runSafe(async () => {
                                await runEstimate();
                                notify({ type: 'info', message: 'Estimacion actualizada.' });
                            }, 'No se pudo estimar alcance.')}>Estimar alcance</button>
                            <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(async () => {
                                if (panelMode === 'create') {
                                    await (async () => {
                                        if (!canStartWithGuardrails) throw new Error('Debes cumplir las validaciones previas antes de iniciar la campana.');
                                        const payload = buildCampaignPayload();
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
                                    if (!canStartWithGuardrails) throw new Error('Debes cumplir las validaciones previas antes de iniciar la campana.');
                                    await startCampaign?.(selectedCampaignId);
                                    await loadCampaigns?.();
                                    await loadTracking(selectedCampaignId);
                                }
                                notify({ type: 'info', message: 'Campana iniciada.' });
                            }, 'No se pudo iniciar campana.')} className={canStartWithGuardrails ? '' : 'saas-campaigns-button-danger'}>Guardar e iniciar</button>
                            <button type="button" className="saas-btn-cancel" disabled={loading} onClick={() => { void handleRequestCancelCampaignEdit(); }}>Cancelar</button>
                        </>
                    )}
                >
                    <SaasDetailPanelSection title="Configuracion base">
                        <div className="saas-campaigns-builder saas-campaigns-builder--full">
                            <div className="saas-campaigns-builder__form">
                                <div className="saas-admin-form-row">
                                    <div className="saas-admin-field">
                                        <label>Nombre</label>
                                        <input value={form.campaignName} onChange={(e) => setForm((p) => ({ ...p, campaignName: e.target.value }))} />
                                    </div>
                                    <div className="saas-admin-field">
                                        <label>Modulo</label>
                                        <select value={form.moduleId} onChange={(e) => setForm((p) => ({ ...p, moduleId: e.target.value, templateId: '', templateName: '' }))}>
                                            <option value="">Selecciona modulo</option>
                                            {moduleOptions.map((m) => <option key={m.moduleId} value={m.moduleId}>{m.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="saas-admin-form-row">
                                    <div className="saas-admin-field">
                                        <label>Template aprobado</label>
                                        <select
                                            value={form.templateId}
                                            onChange={(e) => {
                                                const id = toText(e.target.value);
                                                const t = templatesByModule.find((x) => x.templateId === id) || null;
                                                setForm((p) => ({ ...p, templateId: id, templateName: t?.templateName || '', templateLanguage: t?.templateLanguage || 'es' }));
                                            }}
                                        >
                                            <option value="">Selecciona template</option>
                                            {templatesByModule.map((t) => <option key={t.templateId} value={t.templateId}>{`${t.templateName} (${toText(t.templateLanguage).toUpperCase()})`}</option>)}
                                        </select>
                                    </div>
                                    <div className="saas-admin-field">
                                        <label>Programada</label>
                                        <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="saas-admin-form-row saas-admin-form-row--single">
                                    <div className="saas-admin-field">
                                        <label>Descripcion</label>
                                        <textarea value={form.campaignDescription} onChange={(e) => setForm((p) => ({ ...p, campaignDescription: e.target.value }))} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Segmentacion y filtros">
                        <div className="saas-campaigns-builder saas-campaigns-builder--full">
                            <div className="saas-campaigns-builder__form">
                                <div className="saas-admin-form-row">
                                    <div className="saas-admin-field">
                                        <label>Estado comercial (multiseleccion)</label>
                                        <div className="saas-campaigns-chip-group">
                                            {COMMERCIAL_STATUS_OPTIONS.map((option) => {
                                                const active = normalizeCommercialStatuses(form.commercialStatuses).includes(option.key);
                                                return (
                                                    <button
                                                        key={option.key}
                                                        type="button"
                                                        className={`saas-campaigns-chip ${active ? 'active' : ''}`}
                                                        onClick={() => toggleCommercialStatus(option.key)}
                                                    >
                                                        {option.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="saas-admin-field">
                                        <label>Idioma</label>
                                        <select value={form.languageFilter} onChange={(e) => setForm((p) => ({ ...p, languageFilter: e.target.value }))}>
                                            <option value="">Todos</option>
                                            <option value="es">Espanol</option>
                                            <option value="en">English</option>
                                            <option value="pt">Portugues</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="saas-admin-form-row">
                                    <div className="saas-admin-field">
                                        <label>Etiquetas (multiseleccion)</label>
                                        <div className="saas-campaigns-chip-group">
                                            {labelOptions.length === 0 ? <small className="saas-admin-empty-inline">No hay etiquetas activas.</small> : labelOptions.map((entry) => {
                                                const active = selectedLabels.some((item) => item.labelId === entry.labelId);
                                                return (
                                                    <button
                                                        key={entry.labelId}
                                                        type="button"
                                                        className={`saas-campaigns-chip ${active ? 'active' : ''}`}
                                                        onClick={() => toggleLabel(entry.labelId)}
                                                    >
                                                        {entry.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="saas-admin-field">
                                        <label>Busqueda</label>
                                        <input value={form.searchText} onChange={(e) => setForm((p) => ({ ...p, searchText: e.target.value }))} placeholder="nombre o telefono" />
                                    </div>
                                </div>
                                <div className="saas-admin-form-row">
                                    <div className="saas-admin-field">
                                        <label>Opt-in marketing</label>
                                        <div className="saas-campaigns-fixed-info">Campanas de marketing usan solo clientes con opt-in: <strong>opted_in</strong>.</div>
                                    </div>
                                    <div className="saas-admin-field">
                                        <label>Max destinatarios</label>
                                        <div className="saas-campaigns-max-recipients">
                                            <input
                                                type="range"
                                                min={1}
                                                max={maxRecipientsRange}
                                                value={Math.max(1, Math.min(maxRecipientsRange, toNumber(form.maxRecipients || maxRecipientsRange)))}
                                                onChange={(e) => {
                                                    const value = Math.max(1, Math.min(maxRecipientsRange, Math.floor(toNumber(e.target.value, 1))));
                                                    setMaxRecipientsTouched(true);
                                                    setForm((p) => ({ ...p, maxRecipients: String(value) }));
                                                }}
                                                disabled={maxRecipientsRange <= 1}
                                            />
                                            <input
                                                type="number"
                                                min={1}
                                                max={maxRecipientsRange}
                                                value={form.maxRecipients}
                                                onChange={(e) => {
                                                    const raw = Math.floor(toNumber(e.target.value, 1));
                                                    const value = raw > 0 ? Math.min(maxRecipientsRange, raw) : '';
                                                    setMaxRecipientsTouched(true);
                                                    setForm((p) => ({ ...p, maxRecipients: value ? String(value) : '' }));
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </SaasDetailPanelSection>
                    <SaasDetailPanelSection title="Audiencia y validaciones">
                        <div className="saas-campaigns-builder saas-campaigns-builder--full">
                            <aside className="saas-campaigns-builder__summary">
                                <div className="saas-admin-related-block">
                                    <h4>Estimacion de alcance</h4>
                                    <div className="saas-campaigns-estimation-grid">
                                        <div><small>Total</small><strong>{estimateNumbers.total}</strong></div>
                                        <div><small>Elegibles</small><strong>{estimateNumbers.eligible}</strong></div>
                                        <div><small>Excluidos</small><strong>{estimateNumbers.excluded}</strong></div>
                                    </div>
                                    <span className="saas-campaigns-estimation-help">{reachEstimate ? 'Estimacion calculada con filtros actuales.' : 'Haz clic en \"Estimar alcance\" para precalcular audiencia.'}</span>
                                </div>
                                <div className="saas-admin-related-block">
                                    <h4>Validaciones antes de iniciar</h4>
                                    <div className="saas-campaigns-guardrails">
                                        {canStartGuardrails.map((check) => (
                                            <article key={check.key} className={`saas-campaigns-guardrail ${check.ok ? 'ok' : 'warn'}`}>
                                                <strong>{check.ok ? 'OK' : 'Pendiente'}: {check.label}</strong>
                                                <small>{check.hint}</small>
                                            </article>
                                        ))}
                                    </div>
                                </div>
                                <div className="saas-admin-related-block">
                                    <h4>Resumen</h4>
                                    <div className="saas-campaigns-builder-preview">
                                        <div><span>Template</span><strong>{toText(form.templateName) || '-'}</strong></div>
                                        <div><span>Idioma</span><strong>{toText(form.templateLanguage).toUpperCase() || '-'}</strong></div>
                                        <div><span>Programacion</span><strong>{form.scheduledAt ? formatDateTime(toIsoDateTimeLocal(form.scheduledAt)) : 'Inmediata'}</strong></div>
                                        <div><span>Etiquetas</span><strong>{selectedLabels.length > 0 ? selectedLabels.map((entry) => entry.name).join(', ') : 'Sin filtro'}</strong></div>
                                    </div>
                                </div>
                                <div className="saas-admin-related-block">
                                    <div className="saas-campaigns-audience-summary">
                                        <strong>{`${exclusionSummary.eligible} elegibles - ${exclusionSummary.excluded} excluidos = ${exclusionSummary.finalRecipients} destinatarios finales`}</strong>
                                        <span>{reachEstimate ? 'Lista generada con la estimacion actual.' : 'Haz clic en "Estimar alcance" para ver los clientes elegibles.'}</span>
                                    </div>
                                    <div className="saas-campaigns-audience-table-wrap">
                                        {estimatedAudienceItems.length === 0 ? (
                                            <div className="saas-admin-empty-inline">No hay clientes elegibles para mostrar.</div>
                                        ) : (
                                            <table className="saas-campaigns-audience-table">
                                                <thead>
                                                    <tr>
                                                        <th>Excluir</th>
                                                        <th>Nombre</th>
                                                        <th>Telefono</th>
                                                        <th>Estado comercial</th>
                                                        <th>Etiquetas</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {estimatedAudienceItems.map((item) => {
                                                        const isExcluded = excludedCustomerIdSet.has(item.customerId);
                                                        return (
                                                            <tr key={item.customerId} className={isExcluded ? 'is-excluded' : ''}>
                                                                <td className="is-center">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isExcluded}
                                                                        onChange={() => toggleAudienceExclusion(item.customerId)}
                                                                        aria-label={`Excluir ${item.contactName}`}
                                                                    />
                                                                </td>
                                                                <td>{item.contactName}</td>
                                                                <td>{item.phone}</td>
                                                                <td>{item.commercialStatus || '-'}</td>
                                                                <td>{item.tags.length > 0 ? item.tags.join(', ') : '-'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </SaasDetailPanelSection>
                </SaasDetailPanel>
            )}
            {!tenantScopeLocked && panelMode === 'detail' && (
                !selectedCampaignId ? <div className="saas-admin-empty-state saas-admin-empty-state--detail"><p>Selecciona una campana para ver tracking.</p></div> : (
                    <SaasDetailPanel
                        title={toText(selectedCampaign?.campaignName) || 'Campana'}
                        subtitle={toText(selectedCampaign?.templateName) || '-'}
                        className="saas-campaigns-detail-panel"
                        bodyClassName="saas-campaigns-detail-panel__body"
                        actions={(
                            <>
                                {toLower(selectedCampaign?.status) === 'draft' && <button type="button" disabled={loading || !canWrite} onClick={() => { setForm(mapCampaignToForm(selectedCampaign, labelOptions)); setPanelMode('edit'); setMaxRecipientsTouched(false); setLocalEstimate(null); }}>Editar</button>}
                                {toLower(selectedCampaign?.status) === 'running' && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => pauseCampaign?.(selectedCampaignId), 'No se pudo pausar campana.')}>Pausar</button>}
                                {toLower(selectedCampaign?.status) === 'paused' && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => resumeCampaign?.(selectedCampaignId), 'No se pudo reanudar campana.')}>Reanudar</button>}
                                {['draft', 'scheduled'].includes(toLower(selectedCampaign?.status)) && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => startCampaign?.(selectedCampaignId), 'No se pudo iniciar campana.')}>Iniciar</button>}
                                {!['cancelled', 'completed'].includes(toLower(selectedCampaign?.status)) && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(async () => { const ok = await confirm({ title: 'Cancelar campana', message: 'Esta accion detendra el procesamiento pendiente.', confirmText: 'Cancelar campana', cancelText: 'Volver', tone: 'danger' }); if (!ok) return; await cancelCampaign?.(selectedCampaignId, 'cancelled_by_user'); }, 'No se pudo cancelar campana.')}>Cancelar</button>}
                                <button type="button" disabled={loading} onClick={() => runSafe(async () => { await loadCampaigns?.(); await loadTracking(selectedCampaignId); }, 'No se pudo recargar tracking.')}>Recargar</button>
                                <button type="button" className="saas-btn-close" disabled={loading} onClick={() => { void handleRequestCloseCampaignPanel(); }}>Cerrar</button>
                            </>
                        )}
                    >
                        <SaasDetailPanelSection title="Resumen operativo">
                            <div className="saas-admin-detail-grid">
                                <div className="saas-admin-detail-field"><span>Estado</span><strong><span className={`saas-campaigns-status ${selectedMeta.className}`}>{selectedMeta.label}</span></strong></div>
                                <div className="saas-admin-detail-field"><span>Modulo</span><strong>{toText(selectedCampaign?.moduleId) || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Template</span><strong>{toText(selectedCampaign?.templateName) || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Programada</span><strong>{formatDateTime(selectedCampaign?.scheduledAt)}</strong></div>
                                <div className="saas-admin-detail-field"><span>Creada</span><strong>{formatDateTime(selectedCampaign?.createdAt)}</strong></div>
                                <div className="saas-admin-detail-field"><span>Actualizada</span><strong>{formatDateTime(selectedCampaign?.updatedAt)}</strong></div>
                            </div>
                        </SaasDetailPanelSection>
                        <SaasDetailPanelSection title="Metricas y progreso">
                            <div className="saas-admin-detail-grid">
                                <div className="saas-admin-detail-field"><span>Total</span><strong>{toNumber(selectedCampaign?.totalRecipients)}</strong></div>
                                <div className="saas-admin-detail-field"><span>Enviados</span><strong>{toNumber(selectedCampaign?.sentRecipients)}</strong></div>
                                <div className="saas-admin-detail-field"><span>Fallidos</span><strong>{toNumber(selectedCampaign?.failedRecipients)}</strong></div>
                                <div className="saas-admin-detail-field"><span>Omitidos</span><strong>{toNumber(selectedCampaign?.skippedRecipients)}</strong></div>
                            </div>
                            <div className="saas-campaigns-progress saas-campaigns-progress--detail"><div className="saas-campaigns-progress__track"><div className="saas-campaigns-progress__fill" style={{ width: `${selectedProgress}%` }} /></div><span>{selectedProgress}%</span></div>
                        </SaasDetailPanelSection>
                        <SaasDetailPanelSection title={detailAudienceTitle}>
                            {showsEstimatedAudienceInDetail ? (
                                <section className="saas-admin-related-block saas-campaigns-table-block">
                                    <div className="saas-campaigns-audience-summary">
                                        <strong>{`${exclusionSummary.eligible} elegibles - ${exclusionSummary.excluded} excluidos = ${exclusionSummary.finalRecipients} destinatarios finales`}</strong>
                                        <span>{reachEstimate ? 'Vista previa generada con la estimacion actual.' : 'Calcula la audiencia para ver los clientes elegibles de esta campana.'}</span>
                                    </div>
                                    <div className="saas-campaigns-actions-row">
                                        <button
                                            type="button"
                                            disabled={loading || estimating || !canWrite}
                                            onClick={() => runSafe(async () => {
                                                await runDetailEstimate();
                                                notify({ type: 'info', message: 'Audiencia estimada actualizada.' });
                                            }, 'No se pudo calcular la audiencia.')}
                                        >
                                            Calcular audiencia
                                        </button>
                                    </div>
                                    <div className="saas-campaigns-audience-table-wrap">
                                        {estimatedAudienceItems.length === 0 ? (
                                            <div className="saas-admin-empty-inline">No hay audiencia estimada disponible.</div>
                                        ) : (
                                            <table className="saas-campaigns-audience-table">
                                                <thead>
                                                    <tr>
                                                        <th>Nombre</th>
                                                        <th>Telefono</th>
                                                        <th>Estado comercial</th>
                                                        <th>Etiquetas</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {estimatedAudienceItems.map((item) => (
                                                        <tr key={item.customerId}>
                                                            <td>{item.contactName}</td>
                                                            <td>{item.phone}</td>
                                                            <td>{item.commercialStatus || '-'}</td>
                                                            <td>{item.tags.length > 0 ? item.tags.join(', ') : '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </section>
                            ) : (
                                <section className="saas-admin-related-block saas-campaigns-table-block">
                                    <div className="saas-campaigns-table-wrap"><table className="saas-campaigns-table"><thead><tr><th>Telefono</th><th>Cliente</th><th>Estado</th><th>Intentos</th><th>Actualizado</th><th>Error</th></tr></thead><tbody>{recipients.length === 0 ? <tr><td colSpan={6}>Sin destinatarios.</td></tr> : recipients.map((r) => { const m = statusMeta(r?.status); return <tr key={`${toText(r?.recipientId)}_${toText(r?.phone)}`}><td>{toText(r?.phone) || '-'}</td><td>{toText(r?.customerId) || '-'}</td><td><span className={`saas-campaigns-status ${m.className}`}>{m.label}</span></td><td>{toNumber(r?.attemptCount)} / {toNumber(r?.maxAttempts)}</td><td>{formatDateTime(r?.updatedAt)}</td><td>{toText(r?.lastError || r?.skipReason) || '-'}</td></tr>; })}</tbody></table></div>
                                </section>
                            )}
                        </SaasDetailPanelSection>
                        <SaasDetailPanelSection title={`Eventos (${events.length})`}>
                            <section className="saas-admin-related-block saas-campaigns-events-block"><div className="saas-campaigns-events-list">{events.length === 0 ? <div className="saas-admin-empty-inline">Sin eventos.</div> : events.map((ev) => <article key={toText(ev?.eventId)} className="saas-campaigns-event-item"><header><strong>{toText(ev?.eventType) || 'event'}</strong><span>{formatDateTime(ev?.createdAt)}</span></header><p>{toText(ev?.message || ev?.reason) || '-'}</p><small>{`Actor: ${toText(ev?.actorType) || 'system'} | Severidad: ${toText(ev?.severity) || '-'}`}</small></article>)}</div></section>
                        </SaasDetailPanelSection>
                    </SaasDetailPanel>
                )
            )}
            {error ? <div className="saas-meta-template-error">{error}</div> : null}
        </div>
    );

    return (
        <section id="saas_campaigns" className="saas-admin-card saas-admin-card--full">
            <SaasTableDetailLayout
                selectedId={layoutSelectedId}
                className={`saas-campaigns-td-layout ${panelMode === 'create' || panelMode === 'edit' ? 'saas-campaigns-td-layout--builder' : ''}`}
                header={headerElement}
                left={listPane}
                right={rightPane}
            />
        </section>
    );
});
