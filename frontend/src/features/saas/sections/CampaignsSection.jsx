import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { isTemplateAllowedInCampaigns } from '../helpers/templateUseCase.helpers';
import { fetchTenantZoneRules } from '../services/labels.service';
import { fetchCampaignFilterOptions, sendCampaignBlock } from '../services/campaigns.service';
import {
    SaasDataTable,
    SaasDetailPanel,
    SaasDetailPanelSection,
    SaasEntityPage,
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

const EMPTY_DEEP_FILTERS = {
    commercial_status: [],
    opt_in_status: [],
    zone_label_ids: [],
    operational_label_ids: [],
    customer_type_ids: [],
    assigned_user_id: '',
    has_open_chat: '',
    created_after: '',
    created_before: ''
};

const EMPTY_FORM = {
    campaignName: '',
    campaignDescription: '',
    moduleId: '',
    templateId: '',
    templateName: '',
    templateLanguage: 'es',
    scheduleMode: 'immediate',
    scheduledAt: '',
    validFrom: '',
    validTo: '',
    commercialStatuses: [],
    selectedLabelIds: [],
    selectedZoneRuleIds: [],
    languageFilter: '',
    searchText: '',
    maxRecipients: '',
    inclusionFilters: { ...EMPTY_DEEP_FILTERS },
    exclusionFilters: { ...EMPTY_DEEP_FILTERS },
    blocksEnabled: false,
    blockCount: 2
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

function toDateInputValue(value = '') {
    const raw = toText(value);
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return '';
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function toIsoDateBoundary(value = '', boundary = 'start') {
    const raw = toText(value);
    if (!raw) return null;
    const suffix = boundary === 'end' ? 'T23:59:59.999' : 'T00:00:00.000';
    const d = new Date(`${raw}${suffix}`);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

const COMMERCIAL_STATUS_OPTIONS = [
    { key: 'nuevo', label: 'Nuevo' },
    { key: 'en_conversacion', label: 'En conversacion' },
    { key: 'cotizado', label: 'Cotizado' },
    { key: 'vendido', label: 'Vendido' },
    { key: 'perdido', label: 'Perdido' }
];

const COMMERCIAL_STATUS_COLORS = {
    nuevo: '#7D8D95',
    en_conversacion: '#34B7F1',
    cotizado: '#FFB02E',
    vendido: '#00A884',
    perdido: '#FF5C5C'
};

const CAMPAIGN_TABLE_COLUMNS = [
    { key: 'campaignName', label: 'Nombre', width: '240px', minWidth: '220px', maxWidth: '320px', type: 'text' },
    { key: 'category', label: 'Categoria', width: '140px', minWidth: '124px', maxWidth: '180px', type: 'option' },
    { key: 'language', label: 'Idioma', width: '120px', minWidth: '108px', maxWidth: '144px', type: 'option' },
    { key: 'status', label: 'Estado', width: '132px', minWidth: '120px', maxWidth: '168px', type: 'option' },
    { key: 'moduleId', label: 'Modulo', width: '168px', minWidth: '144px', maxWidth: '220px', type: 'option' },
    { key: 'updatedAt', label: 'Actualizado', width: '168px', minWidth: '146px', maxWidth: '220px', type: 'date' }
];

const CAMPAIGN_DEFAULT_COLUMN_KEYS = ['campaignName', 'category', 'language', 'status', 'moduleId', 'updatedAt'];
const CAMPAIGN_WIZARD_STEPS = [
    { key: 'campaign', label: 'Datos de campana' },
    { key: 'inclusion', label: 'Inclusion' },
    { key: 'exclusion', label: 'Exclusion' },
    { key: 'review', label: 'Revision manual' },
    { key: 'delivery', label: 'Envio' },
    { key: 'summary', label: 'Resumen' }
];

function statusMeta(status = '') {
    const key = toLower(status);
    return STATUS_META[key] || { label: key || 'N/A', className: 'saas-campaigns-status--paused' };
}

function blockStatusMeta(status = '') {
    const key = toLower(status || 'pending');
    const map = {
        pending: { label: 'Pendiente', className: 'saas-campaigns-status--draft' },
        sending: { label: 'Enviando', className: 'saas-campaigns-status--running' },
        completed: { label: 'Completado', className: 'saas-campaigns-status--completed' },
        failed: { label: 'Fallido', className: 'saas-campaigns-status--failed' }
    };
    return map[key] || map.pending;
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

function normalizeDeepFilters(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        commercial_status: Array.from(new Set((Array.isArray(source.commercial_status) ? source.commercial_status : []).map(toLower).filter(Boolean))),
        opt_in_status: Array.from(new Set((Array.isArray(source.opt_in_status) ? source.opt_in_status : []).map(toLower).filter(Boolean))),
        zone_label_ids: Array.from(new Set((Array.isArray(source.zone_label_ids) ? source.zone_label_ids : []).map(toUpper).filter(Boolean))),
        operational_label_ids: Array.from(new Set((Array.isArray(source.operational_label_ids) ? source.operational_label_ids : []).map(toUpper).filter(Boolean))),
        customer_type_ids: Array.from(new Set((Array.isArray(source.customer_type_ids) ? source.customer_type_ids : []).map(toText).filter(Boolean))),
        assigned_user_id: toText(source.assigned_user_id || ''),
        has_open_chat: source.has_open_chat === true || source.has_open_chat === false ? source.has_open_chat : '',
        created_after: toText(source.created_after || ''),
        created_before: toText(source.created_before || '')
    };
}

function deepFiltersFromLegacy(filters = {}) {
    return normalizeDeepFilters({
        commercial_status: filters.commercial_status || filters.commercialStatuses || filters.commercialStatus || [],
        opt_in_status: filters.opt_in_status || filters.marketingStatus || [],
        zone_label_ids: filters.zone_label_ids || filters.zoneLabelIds || [],
        operational_label_ids: filters.operational_label_ids || filters.operationalLabelIds || [],
        customer_type_ids: filters.customer_type_ids || filters.customerTypeIds || [],
        assigned_user_id: filters.assigned_user_id || filters.assignedUserId || '',
        has_open_chat: filters.has_open_chat ?? filters.hasOpenChat ?? '',
        created_after: filters.created_after || filters.createdAfter || '',
        created_before: filters.created_before || filters.createdBefore || ''
    });
}

function toggleArrayValue(list = [], value = '', normalize = toText) {
    const cleanValue = normalize(value);
    if (!cleanValue) return Array.isArray(list) ? list : [];
    const current = new Set((Array.isArray(list) ? list : []).map(normalize).filter(Boolean));
    if (current.has(cleanValue)) current.delete(cleanValue);
    else current.add(cleanValue);
    return Array.from(current);
}

function hasDeepFilterValue(filters = {}) {
    const f = normalizeDeepFilters(filters);
    return f.commercial_status.length > 0
        || f.opt_in_status.length > 0
        || f.zone_label_ids.length > 0
        || f.operational_label_ids.length > 0
        || f.customer_type_ids.length > 0
        || Boolean(f.assigned_user_id)
        || f.has_open_chat === true
        || f.has_open_chat === false
        || Boolean(f.created_after)
        || Boolean(f.created_before);
}

function countDeepFilterSelections(filters = {}) {
    const f = normalizeDeepFilters(filters);
    return f.commercial_status.length
        + f.opt_in_status.length
        + f.zone_label_ids.length
        + f.operational_label_ids.length
        + f.customer_type_ids.length
        + (f.assigned_user_id ? 1 : 0)
        + (f.has_open_chat === true || f.has_open_chat === false ? 1 : 0)
        + (f.created_after ? 1 : 0)
        + (f.created_before ? 1 : 0);
}

function buildLabelOptions(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => ({
            labelId: toUpper(item?.labelId || item?.id || ''),
            name: toText(item?.name || item?.labelName || item?.label || ''),
            color: toText(item?.color || '') || '#00A884',
            isActive: item?.isActive !== false
        }))
        .filter((item) => item.labelId && item.name && item.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

function buildZoneOptions(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => ({
            ruleId: toUpper(item?.ruleId || item?.rule_id || item?.id || ''),
            name: toText(item?.name || item?.label || ''),
            color: toText(item?.color || '') || '#00A884',
            isActive: item?.isActive !== false
        }))
        .filter((item) => item.ruleId && item.name && item.isActive)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

function mapCampaignToForm(campaign = {}, labelOptions = [], zoneOptions = []) {
    const filters = campaign?.audienceFiltersJson && typeof campaign.audienceFiltersJson === 'object' ? campaign.audienceFiltersJson : {};
    const selection = campaign?.audienceSelectionJson && typeof campaign.audienceSelectionJson === 'object' ? campaign.audienceSelectionJson : {};
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
    const zoneIds = new Set(zoneOptions.map((entry) => toUpper(entry.ruleId)));
    const selectedZoneRuleIds = (Array.isArray(filters?.zoneLabelIds) ? filters.zoneLabelIds : (filters?.zoneLabelId ? [filters.zoneLabelId] : []))
        .map((entry) => toUpper(entry))
        .filter((entry) => entry && zoneIds.has(entry));
    return {
        campaignName: toText(campaign?.campaignName),
        campaignDescription: toText(campaign?.campaignDescription),
        moduleId: toText(campaign?.moduleId),
        templateId: toText(campaign?.templateId),
        templateName: toText(campaign?.templateName),
        templateLanguage: toLower(campaign?.templateLanguage || 'es'),
        scheduleMode: campaign?.scheduledAt ? 'scheduled' : 'immediate',
        scheduledAt: toDateTimeLocal(campaign?.scheduledAt),
        validFrom: toDateInputValue(campaign?.validFrom),
        validTo: toDateInputValue(campaign?.validTo),
        commercialStatuses: normalizeCommercialStatuses(filters?.commercialStatuses || (filters?.commercialStatus ? [filters.commercialStatus] : [])),
        selectedLabelIds: Array.from(new Set(selectedLabelIds)),
        selectedZoneRuleIds: Array.from(new Set(selectedZoneRuleIds)),
        languageFilter: toLower(filters?.preferredLanguage || ''),
        searchText: toText(filters?.search),
        maxRecipients: filters?.maxRecipients ? String(filters.maxRecipients) : '',
        inclusionFilters: deepFiltersFromLegacy(selection?.filters || filters),
        exclusionFilters: deepFiltersFromLegacy(selection?.exclusionFilters || selection?.exclusion_filters || {}),
        blocksEnabled: normalizeBlocksConfig(campaign?.blocksConfigJson)?.mode === 'blocks',
        blockCount: normalizeBlocksConfig(campaign?.blocksConfigJson)?.blocks?.length || 2
    };
}

function buildAudienceFiltersFromForm(form = {}, labelOptions = [], zoneOptions = []) {
    const labelsById = new Map(labelOptions.map((entry) => [toUpper(entry.labelId), entry]));
    const zoneIds = new Set(zoneOptions.map((entry) => toUpper(entry.ruleId)));
    const tagAny = (Array.isArray(form?.selectedLabelIds) ? form.selectedLabelIds : [])
        .map((labelId) => labelsById.get(toUpper(labelId)))
        .filter(Boolean)
        .map((entry) => toLower(entry.name))
        .filter(Boolean);
    const zoneLabelIds = (Array.isArray(form?.selectedZoneRuleIds) ? form.selectedZoneRuleIds : [])
        .map((entry) => toUpper(entry))
        .filter((entry) => entry && zoneIds.has(entry));
    const maxRecipients = Math.max(0, Math.floor(toNumber(form?.maxRecipients)));
    return {
        commercialStatuses: normalizeCommercialStatuses(form?.commercialStatuses || []),
        preferredLanguage: toLower(form?.languageFilter || ''),
        marketingStatus: ['opted_in'],
        tagAny,
        zoneLabelIds,
        search: toText(form?.searchText || ''),
        maxRecipients: maxRecipients > 0 ? maxRecipients : undefined
    };
}

function buildAudienceSelectionFromForm(form = {}, excludedCustomerIds = []) {
    return {
        excludedCustomerIds: Array.from(
            new Set((Array.isArray(excludedCustomerIds) ? excludedCustomerIds : []).map((entry) => toText(entry)).filter(Boolean))
        ),
        filters: normalizeDeepFilters(form?.inclusionFilters || {}),
        exclusionFilters: normalizeDeepFilters(form?.exclusionFilters || {})
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
        ),
        filters: deepFiltersFromLegacy(selection.filters || {}),
        exclusionFilters: deepFiltersFromLegacy(selection.exclusionFilters || selection.exclusion_filters || {})
    };
}

function normalizeBlocksConfig(value = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (toLower(value.mode || 'single') !== 'blocks') return null;
    const blocks = (Array.isArray(value.blocks) ? value.blocks : [])
        .map((block, index) => ({
            blockIndex: Math.max(0, Math.floor(toNumber(block?.blockIndex ?? block?.block_index ?? index, index))),
            size: Math.max(0, Math.floor(toNumber(block?.size, 0))),
            status: toLower(block?.status || 'pending') || 'pending',
            sentAt: toText(block?.sentAt || block?.sent_at || '')
        }))
        .sort((left, right) => left.blockIndex - right.blockIndex);
    return {
        mode: 'blocks',
        blocks,
        totalAudience: Math.max(0, Math.floor(toNumber(value.totalAudience ?? value.total_audience, 0)))
    };
}

function buildBlocksConfigFromForm(form = {}, totalAudience = 0) {
    if (!form?.blocksEnabled) return null;
    const blockCount = Math.max(2, Math.min(10, Math.floor(toNumber(form.blockCount, 2))));
    const cleanTotalAudience = Math.max(0, Math.floor(toNumber(totalAudience, 0)));
    const baseSize = Math.floor(cleanTotalAudience / blockCount);
    const remainder = cleanTotalAudience % blockCount;
    return {
        mode: 'blocks',
        blocks: Array.from({ length: blockCount }, (_, index) => ({
            blockIndex: index,
            size: index === blockCount - 1 ? baseSize + remainder : baseSize,
            status: 'pending',
            sentAt: null
        })),
        totalAudience: cleanTotalAudience
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
        scheduleMode: toText(source.scheduleMode || 'immediate') === 'scheduled' ? 'scheduled' : 'immediate',
        scheduledAt: toText(source.scheduledAt),
        validFrom: toText(source.validFrom),
        validTo: toText(source.validTo),
        commercialStatuses: normalizeCommercialStatuses(source.commercialStatuses || []),
        selectedLabelIds: Array.from(
            new Set((Array.isArray(source.selectedLabelIds) ? source.selectedLabelIds : []).map((entry) => toUpper(entry)))
        ).sort(),
        selectedZoneRuleIds: Array.from(
            new Set((Array.isArray(source.selectedZoneRuleIds) ? source.selectedZoneRuleIds : []).map((entry) => toUpper(entry)))
        ).sort(),
        languageFilter: toLower(source.languageFilter || ''),
        searchText: toText(source.searchText),
        maxRecipients: toText(source.maxRecipients),
        inclusionFilters: normalizeDeepFilters(source.inclusionFilters || {}),
        exclusionFilters: normalizeDeepFilters(source.exclusionFilters || {}),
        blocksEnabled: Boolean(source.blocksEnabled),
        blockCount: Math.max(2, Math.min(10, Math.floor(toNumber(source.blockCount, 2))))
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
        requestJson = null,
        setError = null
    } = context;

    const [panelMode, setPanelMode] = useState('list');
    const [wizardStep, setWizardStep] = useState(1);
    const [form, setForm] = useState(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [moduleFilter, setModuleFilter] = useState('');
    const [showColumnsMenu, setShowColumnsMenu] = useState(false);
    const [maxRecipientsTouched, setMaxRecipientsTouched] = useState(false);
    const [localEstimate, setLocalEstimate] = useState(null);
    const [baseAudienceEstimate, setBaseAudienceEstimate] = useState(null);
    const [inclusionOnlyEstimate, setInclusionOnlyEstimate] = useState(null);
    const [excludedCustomerIds, setExcludedCustomerIds] = useState([]);
    const [manualExclusionSearch, setManualExclusionSearch] = useState('');
    const [zoneRules, setZoneRules] = useState([]);
    const [campaignFilterOptions, setCampaignFilterOptions] = useState({
        commercial_statuses: [],
        zone_labels: [],
        operational_labels: [],
        customer_types: [],
        assigned_users: []
    });

    const {
        campaigns = [],
        selectedCampaign = null,
        selectedCampaignId = '',
        recipients = [],
        events = [],
        loading = false,
        loadingList = false,
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
    const zoneOptions = useMemo(() => buildZoneOptions(zoneRules), [zoneRules]);
    const zoneFilterChipOptions = useMemo(() => (
        campaignFilterOptions.zone_labels.length > 0
            ? campaignFilterOptions.zone_labels.map((item) => ({
                id: toUpper(item.id),
                name: toText(item.name),
                color: toText(item.color) || '#00A884'
            }))
            : zoneOptions.map((item) => ({
                id: toUpper(item.ruleId),
                name: item.name,
                color: item.color || '#00A884'
            }))
    ), [campaignFilterOptions.zone_labels, zoneOptions]);
    const operationalFilterChipOptions = useMemo(() => (
        campaignFilterOptions.operational_labels.length > 0
            ? campaignFilterOptions.operational_labels.map((item) => ({
                id: toUpper(item.id),
                name: toText(item.name),
                color: toText(item.color) || '#00A884'
            }))
            : labelOptions.map((item) => ({
                id: toUpper(item.labelId),
                name: item.name,
                color: item.color || '#00A884'
            }))
    ), [campaignFilterOptions.operational_labels, labelOptions]);
    const columnPrefs = useSaasColumnPrefs('campaigns', CAMPAIGN_DEFAULT_COLUMN_KEYS, {
        requestJson,
        availableColumns: CAMPAIGN_TABLE_COLUMNS
    });

    const moduleOptions = useMemo(() => (Array.isArray(waModules) ? waModules : [])
        .map((item) => ({
            moduleId: toText(item?.moduleId || item?.id),
            label: toText(item?.name || item?.moduleId || item?.id),
            isActive: item?.isActive !== false && item?.active !== false && toLower(item?.status || '') !== 'inactive'
        }))
        .filter((entry) => entry.moduleId && entry.label), [waModules]);

    const approvedTemplates = useMemo(() => (Array.isArray(templateItems) ? templateItems : [])
        .filter((entry) => toLower(entry?.status) === 'approved')
        .filter((entry) => isTemplateAllowedInCampaigns(entry?.useCase))
        .map((entry) => ({
            templateId: toText(entry?.templateId || entry?.metaTemplateId || entry?.templateName),
            templateName: toText(entry?.templateName),
            moduleId: toText(entry?.moduleId),
            templateLanguage: toLower(entry?.templateLanguage || 'es'),
            componentsJson: Array.isArray(entry?.componentsJson) ? entry.componentsJson : []
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

    const commercialFilterOptions = useMemo(() => (
        campaignFilterOptions.commercial_statuses.length > 0
            ? campaignFilterOptions.commercial_statuses.map((item) => ({
                key: toLower(item.key),
                name: toText(item.name),
                color: toText(item.color) || COMMERCIAL_STATUS_COLORS[toLower(item.key)] || '#7D8D95'
            }))
            : COMMERCIAL_STATUS_OPTIONS.map((item) => ({
                key: item.key,
                name: item.label,
                color: COMMERCIAL_STATUS_COLORS[item.key] || '#7D8D95'
            }))
    ), [campaignFilterOptions.commercial_statuses]);

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

    const selectedTemplatePreview = useMemo(() => {
        const components = Array.isArray(selectedTemplate?.componentsJson) ? selectedTemplate.componentsJson : [];
        const byType = (type) => components.find((component) => toUpper(component?.type) === type) || null;
        const header = byType('HEADER');
        const body = byType('BODY');
        const footer = byType('FOOTER');
        const buttons = byType('BUTTONS');
        const headerFormat = toLower(header?.format || '');
        const headerType = header
            ? (headerFormat === 'text' ? 'text' : (['image', 'video', 'document'].includes(headerFormat) ? headerFormat : 'none'))
            : 'none';
        return {
            headerType,
            headerText: toText(header?.text),
            bodyText: toText(body?.text),
            footerText: toText(footer?.text),
            buttons: Array.isArray(buttons?.buttons)
                ? buttons.buttons.map((button, index) => ({
                    id: `campaign_preview_btn_${index + 1}`,
                    type: toLower(button?.type || 'quick_reply'),
                    text: toText(button?.text) || `Boton ${index + 1}`
                }))
                : []
        };
    }, [selectedTemplate]);

    const estimateNumbers = useMemo(() => ({
        total: Math.max(0, toNumber(reachEstimate?.total)),
        eligible: Math.max(0, toNumber(reachEstimate?.eligible)),
        excluded: Math.max(0, toNumber(reachEstimate?.excluded))
    }), [reachEstimate]);
    const baseAudienceNumbers = useMemo(() => ({
        total: Math.max(0, toNumber(baseAudienceEstimate?.total)),
        eligible: Math.max(0, toNumber(baseAudienceEstimate?.eligible, Array.isArray(baseAudienceEstimate?.items) ? baseAudienceEstimate.items.length : 0)),
        excluded: Math.max(0, toNumber(baseAudienceEstimate?.excluded))
    }), [baseAudienceEstimate]);
    const inclusionAudienceNumbers = useMemo(() => ({
        total: Math.max(0, toNumber(inclusionOnlyEstimate?.total)),
        eligible: Math.max(0, toNumber(inclusionOnlyEstimate?.eligible, Array.isArray(inclusionOnlyEstimate?.items) ? inclusionOnlyEstimate.items.length : 0)),
        excluded: Math.max(0, toNumber(inclusionOnlyEstimate?.excluded))
    }), [inclusionOnlyEstimate]);
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
                operationalLabelIds: Array.isArray(item?.operationalLabelIds)
                    ? item.operationalLabelIds.map((entry) => toUpper(entry)).filter(Boolean)
                    : [],
                zoneLabelIds: Array.isArray(item?.zoneLabelIds)
                    ? item.zoneLabelIds.map((entry) => toUpper(entry)).filter(Boolean)
                    : [],
                preferredLanguage: toLower(item?.preferredLanguage || 'es') || 'es',
                marketingOptInStatus: toLower(item?.marketingOptInStatus || 'unknown') || 'unknown'
            }))
            .filter((item) => item.customerId)
    ), [reachEstimate]);
    const inclusionOnlyAudienceItems = useMemo(() => (
        (Array.isArray(inclusionOnlyEstimate?.items) ? inclusionOnlyEstimate.items : [])
            .map((item) => ({
                customerId: toText(item?.customerId),
                contactName: toText(item?.contactName) || 'Sin nombre',
                phone: toText(item?.phone) || '-',
                commercialStatus: toLower(item?.commercialStatus || 'unknown') || 'unknown',
                tags: Array.isArray(item?.tags)
                    ? item.tags.map((entry) => toText(entry)).filter(Boolean)
                    : [],
                operationalLabelIds: Array.isArray(item?.operationalLabelIds)
                    ? item.operationalLabelIds.map((entry) => toUpper(entry)).filter(Boolean)
                    : [],
                zoneLabelIds: Array.isArray(item?.zoneLabelIds)
                    ? item.zoneLabelIds.map((entry) => toUpper(entry)).filter(Boolean)
                    : [],
                preferredLanguage: toLower(item?.preferredLanguage || 'es') || 'es',
                marketingOptInStatus: toLower(item?.marketingOptInStatus || 'unknown') || 'unknown'
            }))
            .filter((item) => item.customerId)
    ), [inclusionOnlyEstimate]);
    const excludedCustomerIdSet = useMemo(() => (
        new Set((Array.isArray(excludedCustomerIds) ? excludedCustomerIds : []).map((entry) => toText(entry)).filter(Boolean))
    ), [excludedCustomerIds]);
    const manualExcludedAudienceItems = useMemo(() => {
        const audienceById = new Map(estimatedAudienceItems.map((item) => [item.customerId, item]));
        return excludedCustomerIds
            .map((customerId) => audienceById.get(toText(customerId)))
            .filter(Boolean);
    }, [estimatedAudienceItems, excludedCustomerIds]);
    const manualExclusionCandidates = useMemo(() => {
        const term = toLower(manualExclusionSearch);
        return estimatedAudienceItems
            .filter((item) => !excludedCustomerIdSet.has(item.customerId))
            .filter((item) => !term || `${toLower(item.contactName)} ${toLower(item.phone)}`.includes(term))
            .slice(0, 6);
    }, [estimatedAudienceItems, excludedCustomerIdSet, manualExclusionSearch]);
    const exclusionSummary = useMemo(() => {
        const eligible = estimatedAudienceItems.length;
        const excluded = estimatedAudienceItems.filter((item) => excludedCustomerIdSet.has(item.customerId)).length;
        const finalRecipients = Math.max(0, eligible - excluded);
        return { eligible, excluded, finalRecipients };
    }, [estimatedAudienceItems, excludedCustomerIdSet]);
    const blockPreview = useMemo(() => (
        buildBlocksConfigFromForm(form, exclusionSummary.finalRecipients || estimateNumbers.eligible || 0)
    ), [estimateNumbers.eligible, exclusionSummary.finalRecipients, form]);
    const formBaseline = useMemo(() => {
        if (panelMode === 'edit' && selectedCampaign) {
            return serializeCampaignForm(mapCampaignToForm(selectedCampaign, labelOptions, zoneOptions));
        }
        if (panelMode === 'create') {
            return serializeCampaignForm({ ...EMPTY_FORM, moduleId: moduleOptions[0]?.moduleId || '' });
        }
        return serializeCampaignForm(EMPTY_FORM);
    }, [labelOptions, moduleOptions, panelMode, selectedCampaign, zoneOptions]);
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
    const selectedZones = useMemo(() => {
        const selected = new Set((Array.isArray(form.selectedZoneRuleIds) ? form.selectedZoneRuleIds : []).map((entry) => toUpper(entry)));
        return zoneOptions.filter((entry) => selected.has(toUpper(entry.ruleId)));
    }, [form.selectedZoneRuleIds, zoneOptions]);
    const inclusionSelectionCount = useMemo(
        () => countDeepFilterSelections(form.inclusionFilters),
        [form.inclusionFilters]
    );
    const exclusionSelectionCount = useMemo(
        () => countDeepFilterSelections(form.exclusionFilters),
        [form.exclusionFilters]
    );
    const currentWizardStep = CAMPAIGN_WIZARD_STEPS[wizardStep - 1] || CAMPAIGN_WIZARD_STEPS[0];
    const wizardTitle = panelMode === 'edit'
        ? (toText(form.campaignName) || 'Editar campana')
        : (toText(form.campaignName) || 'Nueva campana');
    const wizardCanAdvance = useMemo(() => {
        if (wizardStep === 1) {
            return Boolean(toText(form.campaignName) && toText(form.moduleId) && toText(form.templateId || form.templateName));
        }
        if (wizardStep === 5 && form.blocksEnabled) {
            const count = Math.floor(toNumber(form.blockCount, 2));
            return count >= 2 && count <= 10;
        }
        return true;
    }, [form.blockCount, form.blocksEnabled, form.campaignName, form.moduleId, form.templateId, form.templateName, wizardStep]);
    const exclusionAudienceOptions = useMemo(() => {
        const fallbackOptInOptions = [
            { id: 'opted_in', name: 'Con opt-in', color: '#00A884' },
            { id: 'pending', name: 'Pendiente', color: '#FFB02E' },
            { id: 'opted_out', name: 'Sin opt-in', color: '#FF5C5C' }
        ];
        const source = inclusionOnlyAudienceItems;
        if (inclusionOnlyEstimate && source.length === 0) {
            return {
                commercialStatuses: [],
                optInStatuses: [],
                zoneLabels: [],
                operationalLabels: []
            };
        }
        if (source.length === 0) {
            return {
                commercialStatuses: commercialFilterOptions,
                optInStatuses: fallbackOptInOptions,
                zoneLabels: zoneFilterChipOptions,
                operationalLabels: operationalFilterChipOptions
            };
        }

        const commercialStatusSet = new Set(source.map((item) => toLower(item.commercialStatus)).filter(Boolean));
        const optInSet = new Set(source.map((item) => toLower(item.marketingOptInStatus)).filter(Boolean));
        const zoneSet = new Set(source.flatMap((item) => item.zoneLabelIds || []).map((entry) => toUpper(entry)).filter(Boolean));
        const operationalSet = new Set(source.flatMap((item) => item.operationalLabelIds || []).map((entry) => toUpper(entry)).filter(Boolean));

        return {
            commercialStatuses: commercialFilterOptions.filter((item) => commercialStatusSet.has(toLower(item.key))),
            optInStatuses: fallbackOptInOptions.filter((item) => optInSet.has(toLower(item.id))),
            zoneLabels: zoneFilterChipOptions.filter((item) => zoneSet.has(toUpper(item.id))),
            operationalLabels: operationalFilterChipOptions.filter((item) => operationalSet.has(toUpper(item.id)))
        };
    }, [commercialFilterOptions, inclusionOnlyAudienceItems, inclusionOnlyEstimate, operationalFilterChipOptions, zoneFilterChipOptions]);
    const selectedStatusKey = toLower(selectedCampaign?.status);
    const showsEstimatedAudienceInDetail = panelMode === 'detail' && ['draft', 'scheduled'].includes(selectedStatusKey);
    const detailAudienceTitle = showsEstimatedAudienceInDetail
        ? `Audiencia estimada (${estimateNumbers.eligible || estimatedAudienceItems.length})`
        : `Destinatarios (${recipients.length})`;
    const selectedBlocksConfig = useMemo(() => normalizeBlocksConfig(selectedCampaign?.blocksConfigJson), [selectedCampaign]);
    const selectedBlocks = selectedBlocksConfig?.blocks || [];
    const hasSendingBlock = selectedBlocks.some((block) => block.status === 'sending');
    const completedBlocksCount = selectedBlocks.filter((block) => block.status === 'completed').length;
    const blocksProgress = selectedBlocks.length > 0 ? Math.round((completedBlocksCount / selectedBlocks.length) * 100) : 0;

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
        if (!Array.isArray(templateItems) || templateItems.length === 0) {
            loadTemplates?.({ status: 'approved', limit: 300, offset: 0 }).catch(() => {});
        }
    }, [
        isCampaignsSection,
        loadTemplates,
        settingsTenantId,
        templateItems,
        tenantScopeLocked
    ]);

    useEffect(() => {
        if (!isCampaignsSection || tenantScopeLocked || !settingsTenantId || typeof requestJson !== 'function') {
            setZoneRules([]);
            return undefined;
        }
        let cancelled = false;
        void fetchTenantZoneRules(requestJson, { includeInactive: false })
            .then((payload) => {
                if (!cancelled) setZoneRules(Array.isArray(payload?.items) ? payload.items : []);
            })
            .catch(() => {
                if (!cancelled) setZoneRules([]);
            });
        return () => {
            cancelled = true;
        };
    }, [isCampaignsSection, requestJson, settingsTenantId, tenantScopeLocked]);

    useEffect(() => {
        if (!isCampaignsSection || tenantScopeLocked || !settingsTenantId || typeof requestJson !== 'function') {
            setCampaignFilterOptions({
                commercial_statuses: [],
                zone_labels: [],
                operational_labels: [],
                customer_types: [],
                assigned_users: []
            });
            return undefined;
        }
        let cancelled = false;
        void fetchCampaignFilterOptions(requestJson)
            .then((payload) => {
                if (cancelled) return;
                setCampaignFilterOptions({
                    commercial_statuses: Array.isArray(payload?.commercial_statuses) ? payload.commercial_statuses : [],
                    zone_labels: Array.isArray(payload?.zone_labels) ? payload.zone_labels : [],
                    operational_labels: Array.isArray(payload?.operational_labels) ? payload.operational_labels : [],
                    customer_types: Array.isArray(payload?.customer_types) ? payload.customer_types : [],
                    assigned_users: Array.isArray(payload?.assigned_users) ? payload.assigned_users : []
                });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [isCampaignsSection, requestJson, settingsTenantId, tenantScopeLocked]);

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
        if (panelMode !== 'create' && panelMode !== 'edit') {
            setManualExclusionSearch('');
        }
    }, [panelMode]);

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

    const toggleZone = useCallback((ruleId = '') => {
        const cleanRuleId = toUpper(ruleId);
        if (!cleanRuleId) return;
        setForm((prev) => {
            const current = new Set((Array.isArray(prev.selectedZoneRuleIds) ? prev.selectedZoneRuleIds : []).map((entry) => toUpper(entry)));
            if (current.has(cleanRuleId)) current.delete(cleanRuleId);
            else current.add(cleanRuleId);
            return { ...prev, selectedZoneRuleIds: Array.from(current) };
        });
    }, []);

    const updateDeepFilter = useCallback((scope = 'inclusionFilters', keyName = '', value) => {
        if (!keyName) return;
        setForm((prev) => ({
            ...prev,
            [scope]: normalizeDeepFilters({
                ...(prev?.[scope] || {}),
                [keyName]: value
            })
        }));
    }, []);

    const toggleDeepFilterValue = useCallback((scope = 'inclusionFilters', keyName = '', value = '', normalize = toText) => {
        if (!keyName) return;
        setForm((prev) => {
            const currentFilters = normalizeDeepFilters(prev?.[scope] || {});
            return {
                ...prev,
                [scope]: normalizeDeepFilters({
                    ...currentFilters,
                    [keyName]: toggleArrayValue(currentFilters[keyName], value, normalize)
                })
            };
        });
    }, []);

    const removeDeepFilterValue = useCallback((scope = 'inclusionFilters', keyName = '', value = '', normalize = toText) => {
        if (!keyName) return;
        const cleanValue = normalize(value);
        setForm((prev) => {
            const currentFilters = normalizeDeepFilters(prev?.[scope] || {});
            return {
                ...prev,
                [scope]: normalizeDeepFilters({
                    ...currentFilters,
                    [keyName]: Array.isArray(currentFilters[keyName])
                        ? currentFilters[keyName].filter((entry) => normalize(entry) !== cleanValue)
                        : ''
                })
            };
        });
    }, []);

    const buildCampaignPayload = useCallback(() => {
        const audienceFiltersJson = buildAudienceFiltersFromForm(form, labelOptions, zoneOptions);
        return {
            moduleId: toText(form.moduleId),
            scopeModuleId: toLower(form.moduleId),
            templateId: toText(form.templateId) || null,
            templateName: toText(form.templateName),
            templateLanguage: toLower(form.templateLanguage || 'es'),
            campaignName: toText(form.campaignName),
            campaignDescription: toText(form.campaignDescription) || null,
            scheduledAt: form.scheduleMode === 'scheduled' ? toIsoDateTimeLocal(form.scheduledAt) : null,
            validFrom: toIsoDateBoundary(form.validFrom, 'start'),
            validTo: toIsoDateBoundary(form.validTo, 'end'),
            audienceFiltersJson,
            audienceSelectionJson: buildAudienceSelectionFromForm(form, excludedCustomerIds),
            blocksConfigJson: blockPreview,
            variablesPreviewJson: {}
        };
    }, [blockPreview, excludedCustomerIds, form, labelOptions, zoneOptions]);

    const buildEstimatePayload = useCallback((options = {}) => {
        if (options?.baseOnly === true) {
            const baseForm = {
                ...form,
                commercialStatuses: [],
                selectedLabelIds: [],
                selectedZoneRuleIds: [],
                languageFilter: '',
                searchText: '',
                maxRecipients: '',
                inclusionFilters: { ...EMPTY_DEEP_FILTERS },
                exclusionFilters: { ...EMPTY_DEEP_FILTERS }
            };
            return {
                ...buildCampaignPayload(),
                audienceFiltersJson: buildAudienceFiltersFromForm(baseForm, labelOptions, zoneOptions),
                audienceSelectionJson: {
                    excludedCustomerIds: [],
                    filters: { ...EMPTY_DEEP_FILTERS },
                    exclusionFilters: { ...EMPTY_DEEP_FILTERS }
                }
            };
        }
        const payload = buildCampaignPayload();
        if (options?.inclusionOnly !== true) return payload;
        return {
            ...payload,
            audienceSelectionJson: {
                ...payload.audienceSelectionJson,
                excludedCustomerIds: [],
                exclusionFilters: { ...EMPTY_DEEP_FILTERS }
            }
        };
    }, [buildCampaignPayload, form, labelOptions, zoneOptions]);

    const runBaseAudienceEstimate = useCallback(async () => {
        if (typeof estimateReachAction !== 'function') return;
        const payload = buildEstimatePayload({ baseOnly: true });
        if (!payload.moduleId || !payload.templateName) return;
        const response = await estimateReachAction({
            scopeModuleId: payload.scopeModuleId,
            moduleId: payload.moduleId,
            templateName: payload.templateName,
            templateLanguage: payload.templateLanguage,
            filters: payload.audienceFiltersJson,
            audienceSelectionJson: payload.audienceSelectionJson
        });
        const estimate = response?.estimate && typeof response.estimate === 'object'
            ? response.estimate
            : null;
        if (estimate) {
            setBaseAudienceEstimate(estimate);
        }
    }, [buildEstimatePayload, estimateReachAction]);

    const runEstimate = useCallback(async () => {
        if (typeof estimateReachAction !== 'function') return;
        const payload = buildEstimatePayload();
        if (!payload.moduleId) throw new Error('Selecciona un modulo antes de estimar alcance.');
        if (!payload.templateName) throw new Error('Selecciona un template aprobado antes de estimar alcance.');
        const response = await estimateReachAction({
            scopeModuleId: payload.scopeModuleId,
            moduleId: payload.moduleId,
            templateName: payload.templateName,
            templateLanguage: payload.templateLanguage,
            filters: payload.audienceFiltersJson,
            audienceSelectionJson: payload.audienceSelectionJson
        });
        const estimate = response?.estimate && typeof response.estimate === 'object'
            ? response.estimate
            : null;
        if (estimate) {
            setLocalEstimate(estimate);
        }
    }, [buildEstimatePayload, estimateReachAction]);

    const runInclusionOnlyEstimate = useCallback(async () => {
        if (typeof estimateReachAction !== 'function') return;
        const payload = buildEstimatePayload({ inclusionOnly: true });
        if (!payload.moduleId || !payload.templateName) return;
        const response = await estimateReachAction({
            scopeModuleId: payload.scopeModuleId,
            moduleId: payload.moduleId,
            templateName: payload.templateName,
            templateLanguage: payload.templateLanguage,
            filters: payload.audienceFiltersJson,
            audienceSelectionJson: payload.audienceSelectionJson
        });
        const estimate = response?.estimate && typeof response.estimate === 'object'
            ? response.estimate
            : null;
        if (estimate) {
            setInclusionOnlyEstimate(estimate);
        }
    }, [buildEstimatePayload, estimateReachAction]);

    useEffect(() => {
        if (panelMode !== 'create' && panelMode !== 'edit') return undefined;
        if (!form.moduleId || !form.templateName) {
            setLocalEstimate(null);
            setBaseAudienceEstimate(null);
            setInclusionOnlyEstimate(null);
            return undefined;
        }
        if (wizardStep < 2) {
            setLocalEstimate(null);
            setBaseAudienceEstimate(null);
            setInclusionOnlyEstimate(null);
            return undefined;
        }
        const timer = setTimeout(() => {
            Promise.all([
                runBaseAudienceEstimate().catch(() => {}),
                runEstimate().catch(() => {}),
                runInclusionOnlyEstimate().catch(() => {})
            ]).catch(() => {});
        }, 400);
        return () => clearTimeout(timer);
    }, [
        excludedCustomerIds,
        form.exclusionFilters,
        form.inclusionFilters,
        form.moduleId,
        form.templateName,
        panelMode,
        runBaseAudienceEstimate,
        runEstimate,
        runInclusionOnlyEstimate,
        wizardStep
    ]);

    const runDetailEstimate = useCallback(async () => {
        if (typeof estimateReachAction !== 'function') return;
        if (!selectedCampaign) throw new Error('No hay campana seleccionada.');
        const detailForm = mapCampaignToForm(selectedCampaign, labelOptions, zoneOptions);
        const audienceFiltersJson = buildAudienceFiltersFromForm(detailForm, labelOptions, zoneOptions);
        const payload = {
            scopeModuleId: toLower(detailForm.moduleId),
            moduleId: toText(detailForm.moduleId),
            templateName: toText(detailForm.templateName),
            templateLanguage: toLower(detailForm.templateLanguage || 'es'),
            filters: audienceFiltersJson,
            audienceSelectionJson: buildAudienceSelectionFromForm(detailForm, getAudienceSelectionFromCampaign(selectedCampaign).excludedCustomerIds)
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
    }, [estimateReachAction, labelOptions, selectedCampaign, zoneOptions]);

    const handleSendCampaignBlock = useCallback(async (blockIndex) => {
        if (typeof requestJson !== 'function') throw new Error('Cliente HTTP no disponible.');
        if (!selectedCampaignId) throw new Error('Selecciona una campana.');
        const response = await sendCampaignBlock(requestJson, { campaignId: selectedCampaignId, blockIndex });
        const campaign = response?.campaign || null;
        if (campaign) {
            await selectCampaign?.(campaign.campaignId, { loadDetail: false });
            await loadTracking(campaign.campaignId);
        }
        return response;
    }, [loadTracking, requestJson, selectCampaign, selectedCampaignId]);

    const clearSelectedCampaign = useCallback(() => {
        if (typeof selectCampaign === 'function') {
            selectCampaign('').catch(() => {});
        }
    }, [selectCampaign]);

    const handleCloseCampaignDetail = useCallback(() => {
        setPanelMode('list');
        setLocalEstimate(null);
        setBaseAudienceEstimate(null);
        setInclusionOnlyEstimate(null);
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
        setBaseAudienceEstimate(null);
        setInclusionOnlyEstimate(null);
        setMaxRecipientsTouched(false);
        setExcludedCustomerIds([]);
        if (panelMode === 'edit' && selectedCampaign) {
            setForm(mapCampaignToForm(selectedCampaign, labelOptions, zoneOptions));
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
        selectedCampaign,
        zoneOptions
    ]);

    useEffect(() => {
        if (panelMode === 'create' || panelMode === 'edit') {
            setWizardStep(1);
        }
    }, [panelMode, selectedCampaignId]);

    const validateWizardStep = useCallback((step = wizardStep) => {
        if (step === 1) {
            if (!toText(form.campaignName)) {
                notify({ type: 'warn', message: 'Ingresa un nombre para la campana antes de continuar.' });
                return false;
            }
            if (!toText(form.moduleId)) {
                notify({ type: 'warn', message: 'Selecciona un modulo antes de continuar.' });
                return false;
            }
            if (!toText(form.templateId || form.templateName)) {
                notify({ type: 'warn', message: 'Selecciona un template aprobado antes de continuar.' });
                return false;
            }
        }
        if (step === 5 && form.blocksEnabled) {
            const count = Math.floor(toNumber(form.blockCount, 2));
            if (count < 2 || count > 10) {
                notify({ type: 'warn', message: 'El numero de bloques debe estar entre 2 y 10.' });
                return false;
            }
        }
        return true;
    }, [form.blockCount, form.blocksEnabled, form.campaignName, form.moduleId, form.templateId, form.templateName, notify, wizardStep]);

    const goToNextWizardStep = useCallback(() => {
        if (!validateWizardStep(wizardStep)) return;
        setWizardStep((prev) => Math.min(prev + 1, CAMPAIGN_WIZARD_STEPS.length));
    }, [validateWizardStep, wizardStep]);

    const goToPreviousWizardStep = useCallback(() => {
        setWizardStep((prev) => Math.max(prev - 1, 1));
    }, []);

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

    const handleSelectCampaignRow = useCallback((row = null) => {
        const campaignId = toText(row?.campaignId || '');
        if (!campaignId) return;
        selectCampaign?.(campaignId, { loadDetail: false }).catch(() => {});
        setPanelMode('detail');
        void runSafe(async () => {
            await Promise.all([
                selectCampaign?.(campaignId, { loadDetail: true }),
                loadTracking(campaignId)
            ]);
        }, 'No se pudo abrir campana.');
    }, [loadTracking, runSafe, selectCampaign]);

    const renderAudienceFilterChips = (scope = 'inclusionFilters', title = 'Incluir') => {
        const filters = normalizeDeepFilters(form?.[scope] || {});
        const chips = [];
        const addList = (keyName, options = [], labelKey = 'name', valueKey = 'id', normalize = toText) => {
            (Array.isArray(filters[keyName]) ? filters[keyName] : []).forEach((value) => {
                const option = options.find((entry) => normalize(entry?.[valueKey] || entry?.key) === normalize(value));
                chips.push({ keyName, value, label: option?.[labelKey] || value, normalize });
            });
        };
        addList('commercial_status', commercialFilterOptions, 'name', 'key', toLower);
        addList('opt_in_status', [{ id: 'opted_in', name: 'Opted in' }, { id: 'pending', name: 'Pendiente' }, { id: 'opted_out', name: 'Opted out' }], 'name', 'id', toLower);
        addList('zone_label_ids', zoneFilterChipOptions, 'name', 'id', toUpper);
        addList('operational_label_ids', operationalFilterChipOptions, 'name', 'id', toUpper);
        addList('customer_type_ids', campaignFilterOptions.customer_types, 'name', 'id', toText);
        if (filters.assigned_user_id) {
            const user = campaignFilterOptions.assigned_users.find((entry) => entry.id === filters.assigned_user_id);
            chips.push({ keyName: 'assigned_user_id', value: '', label: user?.name || filters.assigned_user_id, normalize: toText });
        }
        if (filters.created_after) chips.push({ keyName: 'created_after', value: '', label: `Desde ${filters.created_after}`, normalize: toText });
        if (filters.created_before) chips.push({ keyName: 'created_before', value: '', label: `Hasta ${filters.created_before}`, normalize: toText });
        if (chips.length === 0) return null;
        return (
            <div className="saas-campaigns-filter-chips">
                <strong>{title}:</strong>
                {chips.map((chip, index) => (
                    <button
                        key={`${scope}_${chip.keyName}_${chip.value}_${index}`}
                        type="button"
                        onClick={() => {
                            if (Array.isArray(filters[chip.keyName])) removeDeepFilterValue(scope, chip.keyName, chip.value, chip.normalize);
                            else updateDeepFilter(scope, chip.keyName, '');
                        }}
                    >
                        {chip.label}<span>x</span>
                    </button>
                ))}
            </div>
        );
    };

    const renderAudienceToggleGroup = (scope = 'inclusionFilters', keyName = '', label = '', options = [], normalize = toText, emptyText = '') => {
        const filters = normalizeDeepFilters(form?.[scope] || {});
        return (
            <div className="saas-admin-field">
                <label>{label}</label>
                <div className="saas-campaigns-chip-group">
                    {options.length === 0 ? <small className="saas-admin-empty-inline">{emptyText || `Sin ${toLower(label)}.`}</small> : options.map((option) => {
                        const optionValue = option?.id ?? option?.key;
                        const active = filters[keyName].includes(normalize(optionValue));
                        const accent = toText(option?.color || '');
                        return (
                            <button
                                key={`${scope}_${keyName}_${optionValue}`}
                                type="button"
                                className={`saas-campaigns-chip ${active ? 'active' : ''}`}
                                style={accent ? { '--campaign-chip-accent': accent } : undefined}
                                onClick={() => toggleDeepFilterValue(scope, keyName, optionValue, normalize)}
                            >
                                {option.name}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderAudienceFilterCard = (scope = 'inclusionFilters', title = 'Filtros', tone = 'include') => {
        const filters = normalizeDeepFilters(form?.[scope] || {});
        const optInOptions = scope === 'exclusionFilters'
            ? exclusionAudienceOptions.optInStatuses
            : [
            { id: 'opted_in', name: 'Con opt-in', color: '#00A884' },
            { id: 'pending', name: 'Pendiente', color: '#FFB02E' },
            { id: 'opted_out', name: 'Sin opt-in', color: '#FF5C5C' }
        ];
        const statusOptions = scope === 'exclusionFilters'
            ? exclusionAudienceOptions.commercialStatuses
            : commercialFilterOptions;
        const zoneOptionsForScope = scope === 'exclusionFilters'
            ? exclusionAudienceOptions.zoneLabels
            : zoneFilterChipOptions;
        const operationalOptionsForScope = scope === 'exclusionFilters'
            ? exclusionAudienceOptions.operationalLabels
            : operationalFilterChipOptions;
        const emptyText = scope === 'inclusionFilters' ? 'Todos los clientes' : 'Nadie excluido por filtros';
        return (
            <section className={`saas-campaigns-audience-card saas-campaigns-audience-card--${tone}`}>
                <div className="saas-campaigns-audience-card__header">
                    <div>
                        <h4>{title}</h4>
                        <p>{emptyText}</p>
                    </div>
                    <span className="saas-campaigns-audience-card__count">{countDeepFilterSelections(filters)} seleccionados</span>
                </div>
                <div className="saas-campaigns-audience-card__body">
                    {renderAudienceToggleGroup(scope, 'commercial_status', 'Estado comercial', statusOptions, toLower)}
                    {renderAudienceToggleGroup(scope, 'opt_in_status', 'Opt-in', optInOptions, toLower)}
                    {renderAudienceToggleGroup(scope, 'zone_label_ids', 'Zonas', zoneOptionsForScope, toUpper)}
                    {renderAudienceToggleGroup(scope, 'operational_label_ids', 'Etiquetas operativas', operationalOptionsForScope, toUpper)}
                    {scope === 'exclusionFilters' ? (
                        <div className="saas-admin-field">
                            <label>Exclusion manual por nombre o telefono</label>
                            <input
                                value={manualExclusionSearch}
                                onChange={(event) => setManualExclusionSearch(event.target.value)}
                                placeholder="Buscar en elegibles estimados"
                            />
                            <div className="saas-campaigns-manual-exclusion-results">
                                {manualExclusionCandidates.length === 0 ? (
                                    <small className="saas-admin-empty-inline">
                                        {estimatedAudienceItems.length === 0 ? 'Estima el alcance para buscar clientes.' : 'No hay coincidencias disponibles.'}
                                    </small>
                                ) : manualExclusionCandidates.map((item) => (
                                    <button
                                        key={`exclude_candidate_${item.customerId}`}
                                        type="button"
                                        className="saas-campaigns-manual-exclusion-item"
                                        onClick={() => toggleAudienceExclusion(item.customerId)}
                                    >
                                        <strong>{item.contactName}</strong>
                                        <span>{item.phone}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="saas-campaigns-filter-chips saas-campaigns-filter-chips--manual">
                                {manualExcludedAudienceItems.length === 0 ? (
                                    <small className="saas-admin-empty-inline">Sin exclusiones manuales.</small>
                                ) : manualExcludedAudienceItems.map((item) => (
                                    <button key={`excluded_manual_${item.customerId}`} type="button" onClick={() => toggleAudienceExclusion(item.customerId)}>
                                        {item.contactName || item.phone}<span>x</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </section>
        );
    };

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
    const renderWizardPlaceholder = (stepNumber, title, description) => (
        <SaasDetailPanelSection title={`Paso ${stepNumber} - ${title}`}>
            <div className="saas-campaigns-wizard-placeholder">
                <strong>{title}</strong>
                <p>{description}</p>
            </div>
        </SaasDetailPanelSection>
    );

    const renderWizardCollapsibleBlock = ({ title, subtitle, count = null, children, defaultOpen = true }) => (
        <details className="saas-campaigns-wizard-block" open={defaultOpen}>
            <summary className="saas-campaigns-wizard-block__summary">
                <div>
                    <strong>{title}</strong>
                    {subtitle ? <span>{subtitle}</span> : null}
                </div>
                {count !== null ? <small>{count}</small> : null}
            </summary>
            <div className="saas-campaigns-wizard-block__body">{children}</div>
        </details>
    );

    const renderWizardStepContent = () => {
        switch (wizardStep) {
        case 1:
            return (
                <SaasDetailPanelSection title="Paso 1 - Datos de campana">
                    <div className="saas-campaigns-wizard-step saas-campaigns-wizard-step--campaign">
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
                                    <label>Programacion</label>
                                    <select
                                        value={form.scheduleMode}
                                        onChange={(e) => setForm((p) => ({
                                            ...p,
                                            scheduleMode: e.target.value === 'scheduled' ? 'scheduled' : 'immediate',
                                            scheduledAt: e.target.value === 'scheduled' ? p.scheduledAt : ''
                                        }))}
                                    >
                                        <option value="immediate">Inmediata</option>
                                        <option value="scheduled">Fecha y hora futura</option>
                                    </select>
                                </div>
                            </div>
                            {form.scheduleMode === 'scheduled' ? (
                                <div className="saas-admin-form-row saas-admin-form-row--single">
                                    <div className="saas-admin-field">
                                        <label>Fecha y hora programada</label>
                                        <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))} />
                                    </div>
                                </div>
                            ) : null}
                            <div className="saas-admin-form-row">
                                <div className="saas-admin-field">
                                    <label>Vigencia desde</label>
                                    <input type="date" value={form.validFrom} onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))} />
                                </div>
                                <div className="saas-admin-field">
                                    <label>Vigencia hasta</label>
                                    <input type="date" value={form.validTo} onChange={(e) => setForm((p) => ({ ...p, validTo: e.target.value }))} />
                                </div>
                            </div>
                            <div className="saas-admin-form-row saas-admin-form-row--single">
                                <div className="saas-admin-field">
                                    <label>Descripcion</label>
                                    <textarea value={form.campaignDescription} onChange={(e) => setForm((p) => ({ ...p, campaignDescription: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                        <aside className="saas-campaigns-wizard-preview">
                            <div className="saas-campaigns-wizard-preview__header">
                                <h4>Preview del template</h4>
                                <small>{selectedTemplate ? `${selectedTemplate.templateName} (${toUpper(selectedTemplate.templateLanguage)})` : 'Selecciona un template para visualizar el mensaje.'}</small>
                            </div>
                            {selectedTemplate ? (
                                <div className="saas-campaigns-wizard-preview__body">
                                    <div className="saas-wa-preview">
                                        <div className="saas-wa-preview__chat-bg">
                                            <div className="saas-wa-preview__delivery-stack">
                                                <article className="saas-wa-preview__bubble">
                                                    {selectedTemplatePreview.headerType === 'text' && Boolean(selectedTemplatePreview.headerText) ? (
                                                        <div className="saas-wa-preview__header">{selectedTemplatePreview.headerText}</div>
                                                    ) : null}
                                                    {['image', 'video', 'document'].includes(selectedTemplatePreview.headerType) ? (
                                                        <div className="saas-wa-preview__media-placeholder">
                                                            <strong>{selectedTemplatePreview.headerType === 'image' ? 'Imagen' : selectedTemplatePreview.headerType === 'video' ? 'Video' : 'Documento'}</strong>
                                                            <small>El template usa un header multimedia definido en Meta.</small>
                                                        </div>
                                                    ) : null}
                                                    <div className="saas-wa-preview__body">{selectedTemplatePreview.bodyText || 'El cuerpo del template aparecera aqui.'}</div>
                                                    {selectedTemplatePreview.footerText ? (
                                                        <div className="saas-wa-preview__footer">{selectedTemplatePreview.footerText}</div>
                                                    ) : null}
                                                    <div className="saas-wa-preview__meta">
                                                        <span>{new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
                                                        <span className="saas-wa-preview__tick">{'\u2713\u2713'}</span>
                                                    </div>
                                                </article>
                                                {selectedTemplatePreview.buttons.length > 0 ? (
                                                    <div className="saas-wa-preview__template-buttons">
                                                        {selectedTemplatePreview.buttons.map((buttonRow) => (
                                                            <div className="saas-wa-preview__template-button" key={buttonRow.id}>
                                                                <span className="saas-wa-preview__template-button-meta">
                                                                    {buttonRow.type === 'url' ? 'Enlace' : buttonRow.type === 'phone' || buttonRow.type === 'phone_number' ? 'Llamar' : 'Respuesta'}
                                                                </span>
                                                                <span>{buttonRow.text}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="saas-campaigns-wizard-preview__meta">
                                        <span><strong>Modulo:</strong> {selectedModule?.label || '-'}</span>
                                        <span><strong>Vigencia:</strong> {form.validFrom || form.validTo ? `${form.validFrom || '-'} a ${form.validTo || '-'}` : 'Sin vigencia definida'}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="saas-campaigns-wizard-preview__empty">
                                    <strong>Preview no disponible</strong>
                                    <p>Selecciona un template aprobado para ver una simulacion de entrega en WhatsApp.</p>
                                </div>
                            )}
                        </aside>
                    </div>
                </SaasDetailPanelSection>
            );
        case 2:
            return (
                <SaasDetailPanelSection title="Paso 2 - Inclusion">
                    <div className="saas-campaigns-wizard-step">
                        <div className="saas-campaigns-wizard-metrics">
                            <div className="saas-campaigns-wizard-metric">
                                <small>Base inicial</small>
                                <strong>{baseAudienceNumbers.eligible}</strong>
                                <span>Clientes con opt-in dentro del modulo seleccionado.</span>
                            </div>
                            <div className="saas-campaigns-wizard-metric">
                                <small>Base filtrada</small>
                                <strong>{inclusionAudienceNumbers.eligible || baseAudienceNumbers.eligible}</strong>
                                <span>Resultado actual segun los filtros de inclusion.</span>
                            </div>
                            <div className="saas-campaigns-wizard-metric">
                                <small>Filtros activos</small>
                                <strong>{inclusionSelectionCount}</strong>
                                <span>{inclusionSelectionCount > 0 ? 'Se aplican sobre la base inicial.' : 'Sin filtros: entran todos los clientes elegibles del modulo.'}</span>
                            </div>
                        </div>
                        <div className="saas-campaigns-audience-summary">
                            <strong>Base inicial: {baseAudienceNumbers.eligible} clientes</strong>
                            <span>Base filtrada: {inclusionAudienceNumbers.eligible || baseAudienceNumbers.eligible} clientes</span>
                            {renderAudienceFilterChips('inclusionFilters', 'Activos') || <span>Todos los clientes</span>}
                        </div>
                        {renderWizardCollapsibleBlock({
                            title: 'Datos del cliente',
                            subtitle: 'Filtra por responsable, tipo y fecha de registro.',
                            count: [
                                form.inclusionFilters.assigned_user_id ? 1 : 0,
                                form.inclusionFilters.created_after ? 1 : 0,
                                form.inclusionFilters.created_before ? 1 : 0,
                                (Array.isArray(form.inclusionFilters.customer_type_ids) ? form.inclusionFilters.customer_type_ids.length : 0)
                            ].reduce((sum, value) => sum + value, 0),
                            children: (
                                <div className="saas-campaigns-compact-filters">
                                    <div className="saas-admin-field">
                                        <label>Asignado a</label>
                                        <select
                                            value={form.inclusionFilters.assigned_user_id || ''}
                                            onChange={(event) => updateDeepFilter('inclusionFilters', 'assigned_user_id', event.target.value)}
                                        >
                                            <option value="">Todos</option>
                                            {campaignFilterOptions.assigned_users.map((entry) => (
                                                <option key={entry.id} value={entry.id}>{entry.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {campaignFilterOptions.customer_types.length > 0 ? (
                                        <div className="saas-admin-field">
                                            <label>Tipo de cliente</label>
                                            <select
                                                value={form.inclusionFilters.customer_type_ids[0] || ''}
                                                onChange={(event) => updateDeepFilter('inclusionFilters', 'customer_type_ids', event.target.value ? [event.target.value] : [])}
                                            >
                                                <option value="">Todos</option>
                                                {campaignFilterOptions.customer_types.map((entry) => (
                                                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : null}
                                    <div className="saas-admin-field">
                                        <label>Fecha registro desde</label>
                                        <input
                                            type="date"
                                            value={form.inclusionFilters.created_after || ''}
                                            onChange={(event) => updateDeepFilter('inclusionFilters', 'created_after', event.target.value)}
                                        />
                                    </div>
                                    <div className="saas-admin-field">
                                        <label>Fecha registro hasta</label>
                                        <input
                                            type="date"
                                            value={form.inclusionFilters.created_before || ''}
                                            onChange={(event) => updateDeepFilter('inclusionFilters', 'created_before', event.target.value)}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                        {renderWizardCollapsibleBlock({
                            title: 'Etiquetas globales',
                            subtitle: 'Estados comerciales incluidos en la audiencia.',
                            count: Array.isArray(form.inclusionFilters.commercial_status) ? form.inclusionFilters.commercial_status.length : 0,
                            children: renderAudienceToggleGroup('inclusionFilters', 'commercial_status', 'Estados comerciales', commercialFilterOptions, toLower)
                        })}
                        {renderWizardCollapsibleBlock({
                            title: 'Zonas',
                            subtitle: 'Se incluyen todas si no seleccionas ninguna.',
                            count: Array.isArray(form.inclusionFilters.zone_label_ids) ? form.inclusionFilters.zone_label_ids.length : 0,
                            children: renderAudienceToggleGroup('inclusionFilters', 'zone_label_ids', 'Zonas', zoneFilterChipOptions, toUpper, 'Sin zonas configuradas')
                        })}
                        {renderWizardCollapsibleBlock({
                            title: 'Etiquetas operativas',
                            subtitle: 'Usa etiquetas internas del tenant para segmentar mejor.',
                            count: Array.isArray(form.inclusionFilters.operational_label_ids) ? form.inclusionFilters.operational_label_ids.length : 0,
                            children: renderAudienceToggleGroup('inclusionFilters', 'operational_label_ids', 'Etiquetas operativas', operationalFilterChipOptions, toUpper, 'Sin etiquetas operativas')
                        })}
                    </div>
                </SaasDetailPanelSection>
            );
        case 3:
            return renderWizardPlaceholder(3, 'Exclusiones', 'Aqui se mostraran las exclusiones dependientes de la inclusion y la exclusion manual por cliente.');
        case 4:
            return renderWizardPlaceholder(4, 'Revision manual', 'Aqui se mostrara la lista final de clientes antes del envio para excluirlos manualmente si hace falta.');
        case 5:
            return (
                <SaasDetailPanelSection title="Paso 5 - Envio">
                    <div className="saas-admin-related-block">
                        <div className="saas-campaigns-blocks-header">
                            <label className="saas-campaigns-block-toggle">
                                <input
                                    type="checkbox"
                                    checked={Boolean(form.blocksEnabled)}
                                    onChange={(event) => setForm((prev) => ({ ...prev, blocksEnabled: event.target.checked }))}
                                />
                                <span>Enviar en bloques</span>
                            </label>
                            <span className="saas-campaigns-estimation-help">Activalo para dividir la campana entre 2 y 10 bloques.</span>
                        </div>
                        {form.blocksEnabled ? (
                            <div className="saas-campaigns-blocks-config">
                                <div className="saas-admin-field">
                                    <label>Numero de bloques</label>
                                    <input
                                        type="number"
                                        min={2}
                                        max={10}
                                        value={form.blockCount}
                                        onChange={(event) => {
                                            const next = Math.max(2, Math.min(10, Math.floor(toNumber(event.target.value, 2))));
                                            setForm((prev) => ({ ...prev, blockCount: next }));
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <span className="saas-campaigns-estimation-help">La campana se enviara en una sola ejecucion.</span>
                        )}
                    </div>
                </SaasDetailPanelSection>
            );
        case 6:
        default:
            return renderWizardPlaceholder(6, 'Resumen final', 'El resumen de audiencia, bloques y acciones finales se completa en los siguientes commits del wizard.');
        }
    };

    const renderWizardActions = () => {
        if (wizardStep === 6) {
            return (
                <>
                    <button type="button" disabled={loading || form.blocksEnabled || !canWrite} onClick={() => runSafe(async () => {
                        const payload = buildCampaignPayload();
                        if (!payload.moduleId || !payload.templateName || !payload.campaignName) throw new Error('Nombre, modulo y template son obligatorios.');
                        const response = panelMode === 'edit' ? await updateCampaign?.({ campaignId: selectedCampaignId, patch: payload }) : await createCampaign?.(payload);
                        const campaign = response?.campaign || null;
                        if (!campaign) return;
                        await loadTracking(campaign.campaignId);
                        await selectCampaign?.(campaign.campaignId, { loadDetail: false });
                        setPanelMode('detail');
                        setLocalEstimate(null);
                        setBaseAudienceEstimate(null);
                        setInclusionOnlyEstimate(null);
                        notify({ type: 'info', message: panelMode === 'edit' ? 'Campana actualizada.' : 'Campana creada.' });
                    }, 'No se pudo guardar campana.')}>Guardar borrador</button>
                    <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(async () => {
                        if (panelMode === 'create') {
                            await (async () => {
                                if (!canStartWithGuardrails) throw new Error('Debes cumplir las validaciones previas antes de iniciar la campana.');
                                const payload = buildCampaignPayload();
                                const response = await createCampaign?.(payload);
                                const campaign = response?.campaign;
                                if (!campaign) throw new Error('No se pudo crear campana.');
                            await startCampaign?.(campaign.campaignId);
                            await selectCampaign?.(campaign.campaignId, { loadDetail: true });
                            await loadTracking(campaign.campaignId);
                            setPanelMode('detail');
                            setBaseAudienceEstimate(null);
                        })();
                        } else {
                            if (!canStartWithGuardrails) throw new Error('Debes cumplir las validaciones previas antes de iniciar la campana.');
                            await startCampaign?.(selectedCampaignId);
                            await loadTracking(selectedCampaignId);
                        }
                        notify({ type: 'info', message: 'Campana iniciada.' });
                    }, 'No se pudo iniciar campana.')} className={canStartWithGuardrails && !form.blocksEnabled ? '' : 'saas-campaigns-button-danger'}>{form.blocksEnabled ? 'Guardar y enviar bloques desde detalle' : 'Guardar e iniciar'}</button>
                    <button type="button" className="saas-btn-cancel" disabled={loading} onClick={() => { void handleRequestCancelCampaignEdit(); }}>Cancelar</button>
                </>
            );
        }
        return (
            <>
                <button type="button" disabled={loading || wizardStep <= 1} onClick={goToPreviousWizardStep}>Atras</button>
                <button type="button" disabled={loading || !wizardCanAdvance} onClick={goToNextWizardStep}>Siguiente</button>
                <button type="button" className="saas-btn-cancel" disabled={loading} onClick={() => { void handleRequestCancelCampaignEdit(); }}>Cancelar</button>
            </>
        );
    };

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
                    disabled: loadingList || loading || tenantScopeLocked
                },
                {
                    key: 'create',
                    label: 'Nueva',
                    onClick: () => {
                        setPanelMode('create');
                        setWizardStep(1);
                        clearSelectedCampaign();
                        setMaxRecipientsTouched(false);
                        setLocalEstimate(null);
                        setInclusionOnlyEstimate(null);
                        setForm({ ...EMPTY_FORM, moduleId: moduleOptions[0]?.moduleId || '' });
                    },
                    disabled: loading || tenantScopeLocked
                }
            ]}
            actionsExtra={(
                <div className="saas-entity-columns">
                    <button type="button" onClick={() => setShowColumnsMenu((prev) => !prev)} disabled={tenantScopeLocked}>
                        Columnas
                    </button>
                    {showColumnsMenu ? (
                        <div className="saas-entity-columns__menu">
                            {CAMPAIGN_TABLE_COLUMNS.map((column) => {
                                const checked = columnPrefs.visibleColumnKeys.includes(column.key);
                                return (
                                    <label key={column.key} className="saas-entity-columns__item">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => columnPrefs.toggleColumn(column.key)}
                                        />
                                        <span>{column.label}</span>
                                    </label>
                                );
                            })}
                            <div className="saas-entity-columns__actions">
                                <button type="button" onClick={() => columnPrefs.setVisibleColumnKeys(CAMPAIGN_TABLE_COLUMNS.map((column) => column.key))}>
                                    Mostrar todo
                                </button>
                                <button type="button" onClick={columnPrefs.resetColumns}>Restablecer</button>
                                <button type="button" onClick={() => setShowColumnsMenu(false)}>Cerrar</button>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
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
        />
    );

    const listPane = (
        <div className="saas-campaigns-pane">
            {tenantScopeLocked ? <div className="saas-admin-empty-state"><p>Selecciona una empresa para gestionar campanas.</p></div> : (
                <SaasDataTable
                    columns={campaignTableColumns}
                    rows={campaignTableRows}
                    selectedId={panelMode === 'create' ? '' : selectedCampaignId}
                    loading={loadingList}
                    emptyText="No hay campanas para estos filtros."
                    onSelect={handleSelectCampaignRow}
                />
            )}
        </div>
    );

    const rightPane = (
        <div className="saas-entity-slot-right saas-campaigns-right-shell">
            {tenantScopeLocked && <div className="saas-admin-empty-state saas-admin-empty-state--detail"><h4>Sin empresa activa</h4><p>Selecciona una empresa para continuar.</p></div>}
            {!tenantScopeLocked && (panelMode === 'create' || panelMode === 'edit') && (
                <SaasDetailPanel
                    title={wizardTitle}
                    subtitle={`Paso ${wizardStep} de ${CAMPAIGN_WIZARD_STEPS.length} - ${currentWizardStep.label}`}
                    className="saas-campaigns-detail-panel saas-campaigns-detail-panel--builder"
                    bodyClassName="saas-campaigns-detail-panel__body"
                    actions={renderWizardActions()}
                >
                    <div className="saas-campaigns-wizard-shell">
                        <div className="saas-campaigns-wizard-progress">
                            {CAMPAIGN_WIZARD_STEPS.map((step, index) => {
                                const stepNumber = index + 1;
                                const stateClass = stepNumber === wizardStep
                                    ? 'is-current'
                                    : (stepNumber < wizardStep ? 'is-complete' : '');
                                return (
                                    <div key={step.key} className={`saas-campaigns-wizard-progress__item ${stateClass}`.trim()}>
                                        <span>{stepNumber}</span>
                                        <strong>{step.label}</strong>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="saas-campaigns-wizard-content">
                            {renderWizardStepContent()}
                        </div>
                    </div>
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
                                {toLower(selectedCampaign?.status) === 'draft' && <button type="button" disabled={loading || !canWrite} onClick={() => { setForm(mapCampaignToForm(selectedCampaign, labelOptions, zoneOptions)); setPanelMode('edit'); setWizardStep(1); setMaxRecipientsTouched(false); setLocalEstimate(null); setInclusionOnlyEstimate(null); }}>Editar</button>}
                                {toLower(selectedCampaign?.status) === 'running' && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => pauseCampaign?.(selectedCampaignId), 'No se pudo pausar campana.')}>Pausar</button>}
                                {toLower(selectedCampaign?.status) === 'paused' && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => resumeCampaign?.(selectedCampaignId), 'No se pudo reanudar campana.')}>Reanudar</button>}
                                {['draft', 'scheduled'].includes(toLower(selectedCampaign?.status)) && !selectedBlocksConfig && <button type="button" disabled={loading || !canWrite} onClick={() => runSafe(() => startCampaign?.(selectedCampaignId), 'No se pudo iniciar campana.')}>Iniciar</button>}
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
                        {selectedBlocks.length > 0 ? (
                            <SaasDetailPanelSection title="Ejecucion por bloques">
                                <section className="saas-admin-related-block">
                                    <div className="saas-campaigns-audience-summary">
                                        <strong>{`${completedBlocksCount} de ${selectedBlocks.length} bloques completados`}</strong>
                                        <span>{`Audiencia congelada esperada: ${selectedBlocksConfig?.totalAudience || 0}`}</span>
                                    </div>
                                    <div className="saas-campaigns-progress saas-campaigns-progress--detail">
                                        <div className="saas-campaigns-progress__track"><div className="saas-campaigns-progress__fill" style={{ width: `${blocksProgress}%` }} /></div>
                                        <span>{blocksProgress}%</span>
                                    </div>
                                    <div className="saas-campaigns-block-preview saas-campaigns-block-preview--detail">
                                        <table>
                                            <thead>
                                                <tr><th>Bloque</th><th>Contactos</th><th>Estado</th><th>Completado</th><th>Accion</th></tr>
                                            </thead>
                                            <tbody>
                                                {selectedBlocks.map((block) => {
                                                    const meta = blockStatusMeta(block.status);
                                                    const canSendBlock = ['pending', 'failed'].includes(toLower(block.status)) && !hasSendingBlock && canWrite;
                                                    return (
                                                        <tr key={block.blockIndex}>
                                                            <td>{`Bloque ${block.blockIndex + 1}`}</td>
                                                            <td>{block.size}</td>
                                                            <td><span className={`saas-campaigns-status ${meta.className}`}>{meta.label}</span></td>
                                                            <td>{formatDateTime(block.sentAt)}</td>
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    disabled={loading || !canSendBlock}
                                                                    onClick={() => runSafe(async () => {
                                                                        await handleSendCampaignBlock(block.blockIndex);
                                                                        notify({ type: 'info', message: `Bloque ${block.blockIndex + 1} iniciado.` });
                                                                    }, 'No se pudo iniciar el bloque.')}
                                                                >
                                                                    {block.status === 'failed' ? 'Reintentar' : 'Enviar bloque'}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            </SaasDetailPanelSection>
                        ) : null}
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
        <SaasEntityPage
            id="saas_campaigns"
            sectionKey="campaigns"
            selectedId={layoutSelectedId}
            header={headerElement}
            left={listPane}
            right={rightPane}
            className="saas-entity-page--campaigns"
        />
    );
});
