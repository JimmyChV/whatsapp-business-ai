import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { isTemplateAllowedInCampaigns } from '../helpers/templateUseCase.helpers';
import { fetchTenantCustomerLabels, fetchTenantLabels, fetchTenantZoneRules } from '../services/labels.service';
import { fetchCampaignFilterOptions, fetchCampaignGeographyOptions, sendCampaignBlock } from '../services/campaigns.service';
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
    departments: [],
    provinces: [],
    districts: [],
    zone_label_ids: [],
    operational_label_ids: [],
    customer_type_ids: [],
    acquisition_source_ids: [],
    assigned_user_id: '',
    has_open_chat: '',
    has_phone: '',
    has_email: '',
    has_address: '',
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
        departments: Array.from(new Set((Array.isArray(source.departments) ? source.departments : []).map(toText).filter(Boolean))),
        provinces: Array.from(new Set((Array.isArray(source.provinces) ? source.provinces : []).map(toText).filter(Boolean))),
        districts: Array.from(new Set((Array.isArray(source.districts) ? source.districts : []).map(toText).filter(Boolean))),
        zone_label_ids: Array.from(new Set((Array.isArray(source.zone_label_ids) ? source.zone_label_ids : []).map(toUpper).filter(Boolean))),
        operational_label_ids: Array.from(new Set((Array.isArray(source.operational_label_ids) ? source.operational_label_ids : []).map(toUpper).filter(Boolean))),
        customer_type_ids: Array.from(new Set((Array.isArray(source.customer_type_ids) ? source.customer_type_ids : []).map(toText).filter(Boolean))),
        acquisition_source_ids: Array.from(new Set((Array.isArray(source.acquisition_source_ids) ? source.acquisition_source_ids : []).map(toText).filter(Boolean))),
        assigned_user_id: toText(source.assigned_user_id || ''),
        has_open_chat: source.has_open_chat === true || source.has_open_chat === false ? source.has_open_chat : '',
        has_phone: source.has_phone === true || source.has_phone === false ? source.has_phone : '',
        has_email: source.has_email === true || source.has_email === false ? source.has_email : '',
        has_address: source.has_address === true || source.has_address === false ? source.has_address : '',
        created_after: toText(source.created_after || ''),
        created_before: toText(source.created_before || '')
    };
}

function deepFiltersFromLegacy(filters = {}) {
    return normalizeDeepFilters({
        commercial_status: filters.commercial_status || filters.commercialStatuses || filters.commercialStatus || [],
        opt_in_status: filters.opt_in_status || filters.marketingStatus || [],
        departments: filters.departments || filters.departmentNames || [],
        provinces: filters.provinces || filters.provinceNames || [],
        districts: filters.districts || filters.districtNames || [],
        zone_label_ids: filters.zone_label_ids || filters.zoneLabelIds || [],
        operational_label_ids: filters.operational_label_ids || filters.operationalLabelIds || [],
        customer_type_ids: filters.customer_type_ids || filters.customerTypeIds || [],
        acquisition_source_ids: filters.acquisition_source_ids || filters.acquisitionSourceIds || [],
        assigned_user_id: filters.assigned_user_id || filters.assignedUserId || '',
        has_open_chat: filters.has_open_chat ?? filters.hasOpenChat ?? '',
        has_phone: filters.has_phone ?? filters.hasPhone ?? '',
        has_email: filters.has_email ?? filters.hasEmail ?? '',
        has_address: filters.has_address ?? filters.hasAddress ?? '',
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
        || f.departments.length > 0
        || f.provinces.length > 0
        || f.districts.length > 0
        || f.zone_label_ids.length > 0
        || f.operational_label_ids.length > 0
        || f.customer_type_ids.length > 0
        || f.acquisition_source_ids.length > 0
        || Boolean(f.assigned_user_id)
        || f.has_open_chat === true
        || f.has_open_chat === false
        || f.has_phone === true
        || f.has_phone === false
        || f.has_email === true
        || f.has_email === false
        || f.has_address === true
        || f.has_address === false
        || Boolean(f.created_after)
        || Boolean(f.created_before);
}

function countDeepFilterSelections(filters = {}) {
    const f = normalizeDeepFilters(filters);
    return f.commercial_status.length
        + f.opt_in_status.length
        + f.departments.length
        + f.provinces.length
        + f.districts.length
        + f.zone_label_ids.length
        + f.operational_label_ids.length
        + f.customer_type_ids.length
        + f.acquisition_source_ids.length
        + (f.assigned_user_id ? 1 : 0)
        + (f.has_open_chat === true || f.has_open_chat === false ? 1 : 0)
        + (f.has_phone === true || f.has_phone === false ? 1 : 0)
        + (f.has_email === true || f.has_email === false ? 1 : 0)
        + (f.has_address === true || f.has_address === false ? 1 : 0)
        + (f.created_after ? 1 : 0)
        + (f.created_before ? 1 : 0);
}

function getActiveCriteriaKeys(filters = {}) {
    const f = normalizeDeepFilters(filters);
    const keys = [];
    if (f.departments.length > 0) keys.push('departments');
    if (f.provinces.length > 0) keys.push('provinces');
    if (f.districts.length > 0) keys.push('districts');
    if (f.zone_label_ids.length > 0) keys.push('zone_label_ids');
    if (f.commercial_status.length > 0) keys.push('commercial_status');
    if (f.operational_label_ids.length > 0) keys.push('operational_label_ids');
    if (f.customer_type_ids.length > 0) keys.push('customer_type_ids');
    if (f.acquisition_source_ids.length > 0) keys.push('acquisition_source_ids');
    if (f.assigned_user_id) keys.push('assigned_user_id');
    if (f.created_after || f.created_before) keys.push('created_range');
    if (f.has_phone === true || f.has_phone === false) keys.push('has_phone');
    if (f.has_email === true || f.has_email === false) keys.push('has_email');
    if (f.has_address === true || f.has_address === false) keys.push('has_address');
    return keys;
}

function clearCriterionFromFilters(filters = {}, criterion = '') {
    const f = normalizeDeepFilters(filters);
    const next = { ...f };
    switch (criterion) {
    case 'departments':
        next.departments = [];
        next.provinces = [];
        next.districts = [];
        break;
    case 'provinces':
        next.provinces = [];
        next.districts = [];
        break;
    case 'districts':
        next.districts = [];
        break;
    case 'zone_label_ids':
    case 'commercial_status':
    case 'operational_label_ids':
    case 'customer_type_ids':
    case 'acquisition_source_ids':
        next[criterion] = [];
        break;
    case 'assigned_user_id':
        next.assigned_user_id = '';
        break;
    case 'created_range':
        next.created_after = '';
        next.created_before = '';
        break;
    case 'has_phone':
    case 'has_email':
    case 'has_address':
        next[criterion] = '';
        break;
    default:
        break;
    }
    return normalizeDeepFilters(next);
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
            ruleId: toUpper(item?.ruleId || item?.rule_id || item?.zone_id || item?.id || ''),
            name: toText(item?.name || item?.labelName || item?.label_name || item?.label || ''),
            color: toText(item?.color || '') || '#00A884',
            isActive: item?.isActive !== false && item?.is_active !== false
        }))
        .filter((item) => item.ruleId && item.name && item.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

function isZoneIdLike(value = '') {
    return /^ZONE[-_]/i.test(toText(value));
}

function buildGeographyOptionsFromAudience(items = []) {
    const departments = [];
    const departmentSet = new Set();
    const provinces = {};
    const districts = {};

    (Array.isArray(items) ? items : []).forEach((item) => {
        const entryDepartments = uniqueTextItems(item?.departments?.length > 0 ? item.departments : [item?.departmentName]);
        const entryProvinces = uniqueTextItems(item?.provinces?.length > 0 ? item.provinces : [item?.provinceName]);
        const entryDistricts = uniqueTextItems(item?.districts?.length > 0 ? item.districts : [item?.districtName]);

        entryDepartments.forEach((departmentName) => {
            if (!departmentSet.has(departmentName)) {
                departmentSet.add(departmentName);
                departments.push(departmentName);
            }

            const currentProvinces = provinces[departmentName] || [];
            entryProvinces.forEach((provinceName) => {
                if (!currentProvinces.includes(provinceName)) currentProvinces.push(provinceName);
                const districtKey = `${departmentName}-${provinceName}`;
                const currentDistricts = districts[districtKey] || [];
                entryDistricts.forEach((districtName) => {
                    if (!currentDistricts.includes(districtName)) currentDistricts.push(districtName);
                });
                districts[districtKey] = currentDistricts.sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
            });
            provinces[departmentName] = currentProvinces.sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
        });
    });

    return {
        departments: departments.sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
        provinces,
        districts
    };
}

function uniqueTextItems(items = []) {
    return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => toText(item)).filter(Boolean)));
}

function uniqueOptionObjects(items = [], idKey = 'id', nameKey = 'name') {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
        .filter(Boolean)
        .filter((item) => {
            const id = toText(item?.[idKey] || item?.key || item?.ruleId || item?.labelId);
            const name = toText(item?.[nameKey] || item?.label || item?.title || item?.name);
            if (!id || !name) return false;
            const compound = `${id}::${name}`;
            if (seen.has(compound)) return false;
            seen.add(compound);
            return true;
        });
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
    const inclusionFilters = normalizeDeepFilters(form?.inclusionFilters || {});
    return {
        commercialStatuses: normalizeCommercialStatuses(form?.commercialStatuses || []),
        preferredLanguage: toLower(form?.languageFilter || ''),
        marketingStatus: ['opted_in'],
        tagAny,
        zoneLabelIds,
        commercial_status: inclusionFilters.commercial_status,
        departments: inclusionFilters.departments,
        provinces: inclusionFilters.provinces,
        districts: inclusionFilters.districts,
        zone_label_ids: inclusionFilters.zone_label_ids,
        operational_label_ids: inclusionFilters.operational_label_ids,
        customer_type_ids: inclusionFilters.customer_type_ids,
        acquisition_source_ids: inclusionFilters.acquisition_source_ids,
        assigned_user_id: inclusionFilters.assigned_user_id || undefined,
        has_phone: inclusionFilters.has_phone === '' ? undefined : inclusionFilters.has_phone,
        has_email: inclusionFilters.has_email === '' ? undefined : inclusionFilters.has_email,
        has_address: inclusionFilters.has_address === '' ? undefined : inclusionFilters.has_address,
        created_after: inclusionFilters.created_after || undefined,
        created_before: inclusionFilters.created_before || undefined,
        search: toText(form?.searchText || '')
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
    const [localEstimate, setLocalEstimate] = useState(null);
    const [baseAudienceEstimate, setBaseAudienceEstimate] = useState(null);
    const [inclusionOnlyEstimate, setInclusionOnlyEstimate] = useState(null);
    const [excludedCustomerIds, setExcludedCustomerIds] = useState([]);
    const [manualExclusionSearch, setManualExclusionSearch] = useState('');
    const [zoneRules, setZoneRules] = useState([]);
    const [customerZoneLabels, setCustomerZoneLabels] = useState([]);
    const [tenantOperationalLabels, setTenantOperationalLabels] = useState([]);
    const [campaignGeographyOptions, setCampaignGeographyOptions] = useState({
        departments: [],
        provinces: {},
        districts: {}
    });
    const [activeInclusionCriteria, setActiveInclusionCriteria] = useState([]);
    const [activeExclusionCriteria, setActiveExclusionCriteria] = useState([]);
    const [campaignFilterOptions, setCampaignFilterOptions] = useState({
        commercial_statuses: [],
        zone_labels: [],
        operational_labels: [],
        customer_types: [],
        assigned_users: [],
        acquisition_sources: []
    });
    const audienceRequestRef = useRef(0);
    const estimateRequestRef = useRef({ base: 0, full: 0, inclusion: 0 });
    const requestJsonRef = useRef(requestJson);

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

    const effectiveOperationalLabels = useMemo(
        () => (tenantOperationalLabels.length > 0 ? tenantOperationalLabels : availableLabels),
        [availableLabels, tenantOperationalLabels]
    );
    const labelOptions = useMemo(() => buildLabelOptions(effectiveOperationalLabels), [effectiveOperationalLabels]);
    const zoneOptions = useMemo(() => (
        (Array.isArray(zoneRules) ? zoneRules : [])
            .filter((item) => item?.isActive !== false && item?.is_active !== false)
            .map((item) => ({
                ruleId: String(item?.ruleId || item?.rule_id || item?.id || '').trim().toUpperCase(),
                name: String(item?.name || item?.label || '').trim(),
                color: toText(item?.color || '') || '#00A884'
            }))
            .map((item) => ({
                ...item,
                value: item.ruleId,
                label: item.name
            }))
            .filter((item) => item.ruleId && item.name)
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    ), [zoneRules]);
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
    const acquisitionSourceOptions = useMemo(
        () => (Array.isArray(campaignFilterOptions.acquisition_sources) ? campaignFilterOptions.acquisition_sources : []).map((entry) => ({
            id: toText(entry.id),
            name: toText(entry.name)
        })).filter((entry) => entry.id && entry.name),
        [campaignFilterOptions.acquisition_sources]
    );
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

    useEffect(() => {
        requestJsonRef.current = requestJson;
    }, [requestJson]);

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
                email: toText(item?.email),
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
                zoneLabelNames: Array.isArray(item?.zoneLabelNames)
                    ? item.zoneLabelNames.map((entry) => toText(entry)).filter(Boolean)
                    : [],
                zoneLabels: Array.isArray(item?.zoneLabels)
                    ? item.zoneLabels.map((entry) => ({
                        id: toUpper(entry?.id || ''),
                        name: toText(entry?.name || ''),
                        color: toText(entry?.color || '#00A884') || '#00A884'
                    })).filter((entry) => entry.id)
                    : [],
                customerTypeId: toText(item?.customerTypeId),
                acquisitionSourceId: toText(item?.acquisitionSourceId),
                assignedUserId: toText(item?.assignedUserId),
                departmentName: toText(item?.departmentName),
                provinceName: toText(item?.provinceName),
                districtName: toText(item?.districtName),
                departments: uniqueTextItems(item?.departments),
                provinces: uniqueTextItems(item?.provinces),
                districts: uniqueTextItems(item?.districts),
                hasAddress: item?.hasAddress === true,
                preferredLanguage: toLower(item?.preferredLanguage || 'es') || 'es',
                marketingOptInStatus: toLower(item?.marketingOptInStatus || 'unknown') || 'unknown'
            }))
            .filter((item) => item.customerId)
    ), [reachEstimate]);
    const baseAudienceItems = useMemo(() => (
        (Array.isArray(baseAudienceEstimate?.items) ? baseAudienceEstimate.items : [])
            .map((item) => ({
                customerId: toText(item?.customerId),
                contactName: toText(item?.contactName) || 'Sin nombre',
                phone: toText(item?.phone) || '-',
                email: toText(item?.email),
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
                zoneLabelNames: Array.isArray(item?.zoneLabelNames)
                    ? item.zoneLabelNames.map((entry) => toText(entry)).filter(Boolean)
                    : [],
                zoneLabels: Array.isArray(item?.zoneLabels)
                    ? item.zoneLabels.map((entry) => ({
                        id: toUpper(entry?.id || ''),
                        name: toText(entry?.name || ''),
                        color: toText(entry?.color || '#00A884') || '#00A884'
                    })).filter((entry) => entry.id)
                    : [],
                customerTypeId: toText(item?.customerTypeId),
                acquisitionSourceId: toText(item?.acquisitionSourceId),
                assignedUserId: toText(item?.assignedUserId),
                departmentName: toText(item?.departmentName),
                provinceName: toText(item?.provinceName),
                districtName: toText(item?.districtName),
                departments: uniqueTextItems(item?.departments),
                provinces: uniqueTextItems(item?.provinces),
                districts: uniqueTextItems(item?.districts),
                hasAddress: item?.hasAddress === true,
                preferredLanguage: toLower(item?.preferredLanguage || 'es') || 'es',
                marketingOptInStatus: toLower(item?.marketingOptInStatus || 'unknown') || 'unknown'
            }))
            .filter((item) => item.customerId)
    ), [baseAudienceEstimate]);
    const inclusionOnlyAudienceItems = useMemo(() => (
        (Array.isArray(inclusionOnlyEstimate?.items) ? inclusionOnlyEstimate.items : [])
            .map((item) => ({
                customerId: toText(item?.customerId),
                contactName: toText(item?.contactName) || 'Sin nombre',
                phone: toText(item?.phone) || '-',
                email: toText(item?.email),
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
                zoneLabelNames: Array.isArray(item?.zoneLabelNames)
                    ? item.zoneLabelNames.map((entry) => toText(entry)).filter(Boolean)
                    : [],
                zoneLabels: Array.isArray(item?.zoneLabels)
                    ? item.zoneLabels.map((entry) => ({
                        id: toUpper(entry?.id || ''),
                        name: toText(entry?.name || ''),
                        color: toText(entry?.color || '#00A884') || '#00A884'
                    })).filter((entry) => entry.id)
                    : [],
                customerTypeId: toText(item?.customerTypeId),
                acquisitionSourceId: toText(item?.acquisitionSourceId),
                assignedUserId: toText(item?.assignedUserId),
                departmentName: toText(item?.departmentName),
                provinceName: toText(item?.provinceName),
                districtName: toText(item?.districtName),
                departments: uniqueTextItems(item?.departments),
                provinces: uniqueTextItems(item?.provinces),
                districts: uniqueTextItems(item?.districts),
                hasAddress: item?.hasAddress === true,
                preferredLanguage: toLower(item?.preferredLanguage || 'es') || 'es',
                marketingOptInStatus: toLower(item?.marketingOptInStatus || 'unknown') || 'unknown'
            }))
            .filter((item) => item.customerId)
    ), [inclusionOnlyEstimate]);
    const audienceItemsForSelectors = useMemo(() => {
        if (inclusionOnlyAudienceItems.length > 0) return inclusionOnlyAudienceItems;
        if (estimatedAudienceItems.length > 0) return estimatedAudienceItems;
        return baseAudienceItems;
    }, [baseAudienceItems, estimatedAudienceItems, inclusionOnlyAudienceItems]);
    const audienceGeographyOptions = useMemo(
        () => buildGeographyOptionsFromAudience(audienceItemsForSelectors),
        [audienceItemsForSelectors]
    );
    const zoneNameById = useMemo(() => {
        const map = new Map();
        zoneOptions.forEach((item) => {
            map.set(toUpper(item.value), {
                id: toUpper(item.value),
                name: toText(item.label) || toUpper(item.value),
                color: toText(item.color) || '#00A884'
            });
        });
        return map;
    }, [zoneOptions]);
    const zoneByCustomerId = useMemo(() => {
        const map = new Map();
        (Array.isArray(customerZoneLabels) ? customerZoneLabels : []).forEach((assignment = {}) => {
            const source = String(assignment?.source || '').trim().toLowerCase();
            if (source && source !== 'zone') return;
            const customerId = String(assignment?.customerId || assignment?.customer_id || '').trim();
            const labelId = String(assignment?.labelId || assignment?.label_id || '').trim().toUpperCase();
            const fallbackName = toText(assignment?.labelName || assignment?.label_name || assignment?.name || assignment?.label || '');
            if (!customerId || !labelId) return;
            const zone = zoneNameById.get(labelId) || (fallbackName
                ? {
                    id: labelId,
                    name: fallbackName,
                    color: toText(assignment?.color || '') || '#00A884'
                }
                : null);
            if (!zone) return;
            map.set(customerId, zone);
        });
        return map;
    }, [customerZoneLabels, zoneNameById]);
    const zoneFilterChipOptions = useMemo(() => {
        const directOptions = zoneOptions.map((item) => ({
            id: toUpper(item.value),
            name: toText(item.label) || toUpper(item.value),
            color: toText(item.color) || '#00A884'
        }));
        if (directOptions.length > 0) return directOptions;

        const derivedZoneMap = new Map();
        audienceItemsForSelectors.forEach((item) => {
            (Array.isArray(item?.zoneLabelIds) ? item.zoneLabelIds : []).forEach((zoneId, index) => {
                const id = toUpper(zoneId);
                if (!id || derivedZoneMap.has(id)) return;
                const configured = zoneNameById.get(id);
                derivedZoneMap.set(id, {
                    id,
                    name: toText(configured?.name || item?.zoneLabelNames?.[index] || item?.zoneLabels?.[index]?.name || '') || id,
                    color: toText(configured?.color || item?.zoneLabels?.[index]?.color || '#00A884') || '#00A884'
                });
            });
        });
        return Array.from(derivedZoneMap.values());
    }, [audienceItemsForSelectors, zoneNameById, zoneOptions]);
    const resolveZoneDisplayName = useCallback((zoneLabelId = '', fallbackName = '') => {
        const cleanZoneLabelId = toUpper(zoneLabelId);
        if (!cleanZoneLabelId) return toText(fallbackName);
        return toText(zoneNameById.get(cleanZoneLabelId)?.name || fallbackName || cleanZoneLabelId);
    }, [zoneNameById]);
    const geographyDepartments = useMemo(
        () => {
            const configured = (Array.isArray(campaignGeographyOptions.departments) ? campaignGeographyOptions.departments : []).map(toText).filter(Boolean);
            return configured.length > 0 ? configured : audienceGeographyOptions.departments;
        },
        [audienceGeographyOptions.departments, campaignGeographyOptions.departments]
    );
    const geographyProvinceMap = useMemo(
        () => {
            const configured = campaignGeographyOptions.provinces && typeof campaignGeographyOptions.provinces === 'object' ? campaignGeographyOptions.provinces : {};
            return Object.keys(configured).length > 0 ? configured : audienceGeographyOptions.provinces;
        },
        [audienceGeographyOptions.provinces, campaignGeographyOptions.provinces]
    );
    const geographyDistrictMap = useMemo(
        () => {
            const configured = campaignGeographyOptions.districts && typeof campaignGeographyOptions.districts === 'object' ? campaignGeographyOptions.districts : {};
            return Object.keys(configured).length > 0 ? configured : audienceGeographyOptions.districts;
        },
        [audienceGeographyOptions.districts, campaignGeographyOptions.districts]
    );
    const excludedCustomerIdSet = useMemo(() => (
        new Set((Array.isArray(excludedCustomerIds) ? excludedCustomerIds : []).map((entry) => toText(entry)).filter(Boolean))
    ), [excludedCustomerIds]);
    const manualExcludedAudienceItems = useMemo(() => {
        const audienceById = new Map(inclusionOnlyAudienceItems.map((item) => [item.customerId, item]));
        return excludedCustomerIds
            .map((customerId) => audienceById.get(toText(customerId)))
            .filter(Boolean);
    }, [excludedCustomerIds, inclusionOnlyAudienceItems]);
    const manualExclusionCandidates = useMemo(() => {
        const term = toLower(manualExclusionSearch);
        return inclusionOnlyAudienceItems
            .filter((item) => !excludedCustomerIdSet.has(item.customerId))
            .filter((item) => !term || `${toLower(item.contactName)} ${toLower(item.phone)}`.includes(term))
            .slice(0, 12);
    }, [excludedCustomerIdSet, inclusionOnlyAudienceItems, manualExclusionSearch]);
    const exclusionSummary = useMemo(() => {
        const included = inclusionOnlyAudienceItems.length;
        const finalRecipients = estimatedAudienceItems.length;
        const excluded = Math.max(0, included - finalRecipients);
        const eligible = included;
        return { eligible, excluded, finalRecipients };
    }, [estimatedAudienceItems.length, inclusionOnlyAudienceItems.length]);
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
    const inclusionProvinceOptions = useMemo(() => {
        if (form.inclusionFilters.departments.length === 0) {
            return uniqueTextItems(Object.values(geographyProvinceMap).flat());
        }
        return uniqueTextItems(
            form.inclusionFilters.departments.flatMap((department) => geographyProvinceMap[toText(department)] || [])
        );
    }, [form.inclusionFilters.departments, geographyProvinceMap]);
    const inclusionDistrictOptions = useMemo(() => {
        if (form.inclusionFilters.provinces.length === 0) {
            const keys = Object.keys(geographyDistrictMap);
            const byDepartments = form.inclusionFilters.departments.length === 0
                ? keys
                : keys.filter((key) => form.inclusionFilters.departments.some((department) => key.startsWith(`${toText(department)}-`)));
            return uniqueTextItems(byDepartments.flatMap((key) => geographyDistrictMap[key] || []));
        }
        return uniqueTextItems(
            form.inclusionFilters.provinces.flatMap((province) => {
                const matchingKeys = Object.keys(geographyDistrictMap).filter((key) => key.endsWith(`-${toText(province)}`));
                return matchingKeys.flatMap((key) => geographyDistrictMap[key] || []);
            })
        );
    }, [form.inclusionFilters.departments, form.inclusionFilters.provinces, geographyDistrictMap]);
    const inclusionCustomerTypeOptions = useMemo(
        () => uniqueOptionObjects(campaignFilterOptions.customer_types, 'id', 'name'),
        [campaignFilterOptions.customer_types]
    );
    const exclusionCustomerTypeOptions = useMemo(() => {
        const ids = new Set(inclusionOnlyAudienceItems.map((item) => toText(item.customerTypeId)).filter(Boolean));
        return inclusionCustomerTypeOptions.filter((option) => ids.has(toText(option.id)));
    }, [inclusionCustomerTypeOptions, inclusionOnlyAudienceItems]);
    const exclusionAcquisitionSourceOptions = useMemo(() => {
        const ids = new Set(inclusionOnlyAudienceItems.map((item) => toText(item.acquisitionSourceId)).filter(Boolean));
        return acquisitionSourceOptions.filter((option) => ids.has(toText(option.id)));
    }, [acquisitionSourceOptions, inclusionOnlyAudienceItems]);
    const exclusionAssignedUserOptions = useMemo(() => {
        const ids = new Set(inclusionOnlyAudienceItems.map((item) => toText(item.assignedUserId)).filter(Boolean));
        return campaignFilterOptions.assigned_users.filter((option) => ids.has(toText(option.id)));
    }, [campaignFilterOptions.assigned_users, inclusionOnlyAudienceItems]);
    const exclusionDepartments = useMemo(
        () => uniqueTextItems(inclusionOnlyAudienceItems.flatMap((item) => item.departments.length > 0 ? item.departments : [item.departmentName])),
        [inclusionOnlyAudienceItems]
    );
    const exclusionProvinces = useMemo(() => {
        const items = form.exclusionFilters.departments.length > 0
            ? inclusionOnlyAudienceItems.filter((item) => {
                const departments = item.departments.length > 0 ? item.departments : [item.departmentName];
                return departments.some((entry) => form.exclusionFilters.departments.includes(toText(entry)));
            })
            : inclusionOnlyAudienceItems;
        return uniqueTextItems(items.flatMap((item) => item.provinces.length > 0 ? item.provinces : [item.provinceName]));
    }, [form.exclusionFilters.departments, inclusionOnlyAudienceItems]);
    const exclusionDistricts = useMemo(() => {
        let items = inclusionOnlyAudienceItems;
        if (form.exclusionFilters.provinces.length > 0) {
            items = items.filter((item) => {
                const provinces = item.provinces.length > 0 ? item.provinces : [item.provinceName];
                return provinces.some((entry) => form.exclusionFilters.provinces.includes(toText(entry)));
            });
        } else if (form.exclusionFilters.departments.length > 0) {
            items = items.filter((item) => {
                const departments = item.departments.length > 0 ? item.departments : [item.departmentName];
                return departments.some((entry) => form.exclusionFilters.departments.includes(toText(entry)));
            });
        }
        return uniqueTextItems(items.flatMap((item) => item.districts.length > 0 ? item.districts : [item.districtName]));
    }, [form.exclusionFilters.departments, form.exclusionFilters.provinces, inclusionOnlyAudienceItems]);
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
        if (!isCampaignsSection || tenantScopeLocked || !settingsTenantId || typeof requestJsonRef.current !== 'function') {
            setZoneRules([]);
            setCustomerZoneLabels([]);
            return undefined;
        }
        let cancelled = false;
        void Promise.all([
            fetchTenantZoneRules(requestJsonRef.current, { includeInactive: false, tenantId: settingsTenantId }),
            fetchTenantCustomerLabels(requestJsonRef.current, { source: 'zone', tenantId: settingsTenantId })
        ])
            .then(([rulesPayload, labelsPayload]) => {
                if (cancelled) return;
                setZoneRules(Array.isArray(rulesPayload?.items) ? rulesPayload.items : []);
                setCustomerZoneLabels(Array.isArray(labelsPayload?.items) ? labelsPayload.items : []);
            })
            .catch(() => {
                if (!cancelled) {
                    setZoneRules([]);
                    setCustomerZoneLabels([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [isCampaignsSection, settingsTenantId, tenantScopeLocked]);

    useEffect(() => {
        const shouldLoadAudienceSelectors = isCampaignsSection
            && !tenantScopeLocked
            && Boolean(settingsTenantId)
            && typeof requestJsonRef.current === 'function'
            && (panelMode === 'create' || panelMode === 'edit')
            && wizardStep >= 2;
        if (!shouldLoadAudienceSelectors) {
            setCampaignFilterOptions({
                commercial_statuses: [],
                zone_labels: [],
                operational_labels: [],
                customer_types: [],
                assigned_users: [],
                acquisition_sources: []
            });
            setTenantOperationalLabels([]);
            setCampaignGeographyOptions({ departments: [], provinces: {}, districts: {} });
            return undefined;
        }
        let cancelled = false;
        const requestId = audienceRequestRef.current + 1;
        audienceRequestRef.current = requestId;
        Promise.allSettled([
            fetchCampaignFilterOptions(requestJsonRef.current, { tenantId: settingsTenantId }),
            fetchCampaignGeographyOptions(requestJsonRef.current, { tenantId: settingsTenantId }),
            fetchTenantLabels(requestJsonRef.current, settingsTenantId, { includeInactive: false }),
            fetchTenantZoneRules(requestJsonRef.current, { includeInactive: false, tenantId: settingsTenantId }),
            fetchTenantCustomerLabels(requestJsonRef.current, { source: 'zone', tenantId: settingsTenantId })
        ]).then(([filterResult, geographyResult, tenantLabelsResult, tenantZonesResult, tenantCustomerZoneLabelsResult]) => {
            if (cancelled || requestId !== audienceRequestRef.current) return;

            const filterPayload = filterResult.status === 'fulfilled' ? filterResult.value : null;
            const geographyPayload = geographyResult.status === 'fulfilled' ? geographyResult.value : null;
            const tenantLabelsPayload = tenantLabelsResult.status === 'fulfilled' ? tenantLabelsResult.value : null;
            const tenantZonesPayload = tenantZonesResult.status === 'fulfilled' ? tenantZonesResult.value : null;
            const tenantCustomerZoneLabelsPayload = tenantCustomerZoneLabelsResult.status === 'fulfilled' ? tenantCustomerZoneLabelsResult.value : null;

            const tenantLabelItems = Array.isArray(tenantLabelsPayload?.items) ? tenantLabelsPayload.items : [];
            const tenantZoneItems = Array.isArray(tenantZonesPayload?.items) ? tenantZonesPayload.items : [];
            const tenantCustomerZoneItems = Array.isArray(tenantCustomerZoneLabelsPayload?.items) ? tenantCustomerZoneLabelsPayload.items : [];
            const fallbackZoneLabels = buildZoneOptions(tenantZoneItems.length > 0 ? tenantZoneItems : zoneRules).map((item) => ({
                id: toUpper(item.ruleId || item.rule_id || item.zone_id || item.id || ''),
                name: toText(item.name || item.label || ''),
                color: toText(item.color) || '#00A884'
            }));
            const fallbackOperationalLabels = buildLabelOptions(tenantLabelItems.length > 0 ? tenantLabelItems : availableLabels).map((item) => ({
                id: toUpper(item.labelId),
                name: toText(item.name),
                color: toText(item.color) || '#00A884'
            }));

            setTenantOperationalLabels(tenantLabelItems);
            setZoneRules(tenantZoneItems);
            setCustomerZoneLabels(tenantCustomerZoneItems);

            const payload = filterPayload || {};
            const zoneFallbackById = new Map(fallbackZoneLabels.map((item) => [toUpper(item.id), item]));
            const normalizedZoneLabels = Array.isArray(payload?.zone_labels) && payload.zone_labels.length > 0
                ? payload.zone_labels.map((item) => {
                    const cleanId = toUpper(item?.id || item?.ruleId || item?.rule_id || '');
                    const fallback = zoneFallbackById.get(cleanId);
                    return {
                        id: cleanId,
                        name: toText(item?.name || item?.label || fallback?.name || cleanId),
                        color: toText(item?.color || fallback?.color || '#00A884') || '#00A884'
                    };
                }).filter((item) => item.id)
                : fallbackZoneLabels;

            setCampaignFilterOptions({
                commercial_statuses: Array.isArray(payload?.commercial_statuses) ? payload.commercial_statuses : [],
                zone_labels: normalizedZoneLabels,
                operational_labels: Array.isArray(payload?.operational_labels) && payload.operational_labels.length > 0 ? payload.operational_labels : fallbackOperationalLabels,
                customer_types: Array.isArray(payload?.customer_types) ? payload.customer_types : [],
                assigned_users: Array.isArray(payload?.assigned_users) ? payload.assigned_users : [],
                acquisition_sources: Array.isArray(payload?.acquisition_sources) ? payload.acquisition_sources : []
            });
            setCampaignGeographyOptions({
                departments: Array.isArray(geographyPayload?.departments) ? geographyPayload.departments : [],
                provinces: geographyPayload?.provinces && typeof geographyPayload.provinces === 'object' ? geographyPayload.provinces : {},
                districts: geographyPayload?.districts && typeof geographyPayload.districts === 'object' ? geographyPayload.districts : {}
            });
        });
        return () => {
            cancelled = true;
        };
    }, [isCampaignsSection, panelMode, settingsTenantId, tenantScopeLocked, wizardStep]);

    useEffect(() => {
        if (inclusionOnlyAudienceItems.length === 0) return;
        const validIds = new Set(inclusionOnlyAudienceItems.map((item) => item.customerId));
        setExcludedCustomerIds((prev) => prev.filter((customerId) => validIds.has(toText(customerId))));
    }, [inclusionOnlyAudienceItems]);

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

    useEffect(() => {
        if (panelMode !== 'create' && panelMode !== 'edit') {
            setActiveInclusionCriteria([]);
            setActiveExclusionCriteria([]);
            return;
        }
        setActiveInclusionCriteria((prev) => {
            const current = new Set([...(Array.isArray(prev) ? prev : []), ...getActiveCriteriaKeys(form.inclusionFilters)]);
            return Array.from(current);
        });
        setActiveExclusionCriteria((prev) => {
            const current = new Set([...(Array.isArray(prev) ? prev : []), ...getActiveCriteriaKeys(form.exclusionFilters)]);
            return Array.from(current);
        });
    }, [form.exclusionFilters, form.inclusionFilters, panelMode]);

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

    const setCriterionEnabled = useCallback((scope = 'inclusionFilters', criterion = '', enabled = true) => {
        const setter = scope === 'exclusionFilters' ? setActiveExclusionCriteria : setActiveInclusionCriteria;
        setter((prev) => {
            const current = new Set(Array.isArray(prev) ? prev : []);
            if (enabled) current.add(criterion);
            else current.delete(criterion);
            return Array.from(current);
        });
        if (!enabled) {
            setForm((prev) => ({
                ...prev,
                [scope]: clearCriterionFromFilters(prev?.[scope] || {}, criterion)
            }));
        }
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

    const removeFilterChip = useCallback((scope = 'inclusionFilters', chip = {}) => {
        if (Array.isArray(normalizeDeepFilters(form?.[scope] || {})[chip.keyName])) {
            removeDeepFilterValue(scope, chip.keyName, chip.value, chip.normalize || toText);
            return;
        }
        if (chip.keyName === 'created_range') {
            updateDeepFilter(scope, 'created_after', '');
            updateDeepFilter(scope, 'created_before', '');
            return;
        }
        updateDeepFilter(scope, chip.keyName, '');
    }, [form, removeDeepFilterValue, updateDeepFilter]);

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
        const requestId = estimateRequestRef.current.base + 1;
        estimateRequestRef.current.base = requestId;
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
        if (estimate && requestId === estimateRequestRef.current.base) {
            setBaseAudienceEstimate(estimate);
        }
    }, [buildEstimatePayload, estimateReachAction]);

    const runEstimate = useCallback(async () => {
        if (typeof estimateReachAction !== 'function') return;
        const requestId = estimateRequestRef.current.full + 1;
        estimateRequestRef.current.full = requestId;
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
        if (estimate && requestId === estimateRequestRef.current.full) {
            setLocalEstimate(estimate);
        }
    }, [buildEstimatePayload, estimateReachAction]);

    const runInclusionOnlyEstimate = useCallback(async () => {
        if (typeof estimateReachAction !== 'function') return;
        const requestId = estimateRequestRef.current.inclusion + 1;
        estimateRequestRef.current.inclusion = requestId;
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
        if (estimate && requestId === estimateRequestRef.current.inclusion) {
            setInclusionOnlyEstimate(estimate);
        }
    }, [buildEstimatePayload, estimateReachAction]);

    useEffect(() => {
        if (panelMode !== 'create' && panelMode !== 'edit') return undefined;
        if (!form.moduleId || !form.templateName) {
            estimateRequestRef.current.base += 1;
            estimateRequestRef.current.full += 1;
            estimateRequestRef.current.inclusion += 1;
            setLocalEstimate(null);
            setBaseAudienceEstimate(null);
            setInclusionOnlyEstimate(null);
            return undefined;
        }
        if (wizardStep < 2) {
            estimateRequestRef.current.base += 1;
            estimateRequestRef.current.full += 1;
            estimateRequestRef.current.inclusion += 1;
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
        const response = await sendCampaignBlock(requestJson, { campaignId: selectedCampaignId, blockIndex }, { tenantId: settingsTenantId });
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
                const fallbackLabel = keyName === 'zone_label_ids'
                    ? resolveZoneDisplayName(value)
                    : value;
                chips.push({ keyName, value, label: option?.[labelKey] || fallbackLabel, normalize });
            });
        };
        addList('commercial_status', commercialFilterOptions, 'name', 'key', toLower);
        addList('zone_label_ids', zoneFilterChipOptions, 'name', 'id', toUpper);
        addList('operational_label_ids', operationalFilterChipOptions, 'name', 'id', toUpper);
        addList('customer_type_ids', campaignFilterOptions.customer_types, 'name', 'id', toText);
        addList('acquisition_source_ids', acquisitionSourceOptions, 'name', 'id', toText);
        addList('departments', geographyDepartments.map((name) => ({ id: name, name })), 'name', 'id', toText);
        addList('provinces', uniqueTextItems(Object.values(geographyProvinceMap).flat()).map((name) => ({ id: name, name })), 'name', 'id', toText);
        addList('districts', uniqueTextItems(Object.values(geographyDistrictMap).flat()).map((name) => ({ id: name, name })), 'name', 'id', toText);
        if (filters.assigned_user_id) {
            const user = campaignFilterOptions.assigned_users.find((entry) => entry.id === filters.assigned_user_id);
            chips.push({ keyName: 'assigned_user_id', value: '', label: user?.name || filters.assigned_user_id, normalize: toText });
        }
        if (filters.created_after || filters.created_before) {
            chips.push({
                keyName: 'created_range',
                value: '',
                label: `Registro: ${filters.created_after || '...'} a ${filters.created_before || '...'}`,
                normalize: toText
            });
        }
        if (filters.has_phone === true) chips.push({ keyName: 'has_phone', value: '', label: 'Tiene telefono valido', normalize: toText });
        if (filters.has_email === true) chips.push({ keyName: 'has_email', value: '', label: 'Tiene email', normalize: toText });
        if (filters.has_address === true) chips.push({ keyName: 'has_address', value: '', label: 'Tiene direccion registrada', normalize: toText });
        if (chips.length === 0) return null;
        return (
            <div className="saas-campaigns-filter-chips">
                <strong>{title}:</strong>
                {chips.map((chip, index) => (
                    <button
                        key={`${scope}_${chip.keyName}_${chip.value}_${index}`}
                        type="button"
                        onClick={() => removeFilterChip(scope, chip)}
                    >
                        {chip.label}<span>x</span>
                    </button>
                ))}
            </div>
        );
    };

    const renderCriterionToggleList = (scope = 'inclusionFilters', groups = []) => {
        const activeCriteria = scope === 'exclusionFilters' ? activeExclusionCriteria : activeInclusionCriteria;
        return (
            <div className="saas-campaigns-criteria-panel">
                {groups.map((group) => (
                    <section key={`${scope}_${group.title}`} className="saas-campaigns-criteria-group">
                        <header>{group.title}</header>
                        <div className="saas-campaigns-criteria-list">
                            {group.items.map((criterion) => {
                                const enabled = activeCriteria.includes(criterion.key);
                                return (
                                    <label
                                        key={`${scope}_${criterion.key}`}
                                        className={`saas-campaigns-criteria-item ${enabled ? 'is-active' : ''}`}
                                    >
                                        <div>
                                            <strong>{criterion.label}</strong>
                                            {criterion.description ? <span>{criterion.description}</span> : null}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            onChange={(event) => setCriterionEnabled(scope, criterion.key, event.target.checked)}
                                        />
                                    </label>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        );
    };

    const renderAudienceChipGroup = (scope = 'inclusionFilters', keyName = '', label = '', options = [], normalize = toText, emptyText = '') => {
        const filters = normalizeDeepFilters(form?.[scope] || {});
        return (
            <div className="saas-admin-field">
                <label>{label}</label>
                <div className="saas-campaigns-chip-group">
                    {options.length === 0 ? <small className="saas-admin-empty-inline">{emptyText || `Sin ${toLower(label)}.`}</small> : options.map((option) => {
                        const optionValue = option?.id ?? option?.key;
                        const active = Array.isArray(filters[keyName]) && filters[keyName].includes(normalize(optionValue));
                        const accent = toText(option?.color || '');
                        return (
                            <button
                                key={`${scope}_${keyName}_${optionValue}`}
                                type="button"
                                className={`saas-campaigns-chip ${active ? 'active' : ''}`}
                                style={accent ? { '--campaign-chip-accent': accent } : undefined}
                                onClick={() => toggleDeepFilterValue(scope, keyName, optionValue, normalize)}
                            >
                                {keyName === 'zone_label_ids'
                                    ? resolveZoneDisplayName(optionValue, option.name)
                                    : option.name}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderAudienceCustomerRows = (items = [], limit = 50) => {
        const operationalById = new Map(operationalFilterChipOptions.map((item) => [toUpper(item.id), item]));
        const commercialByKey = new Map(commercialFilterOptions.map((item) => [toLower(item.key), item]));
        return (
            <div className="saas-campaigns-audience-live-list">
                {items.slice(0, limit).map((item) => {
                    const zone = zoneByCustomerId.get(toText(item.customerId)) || (
                        item.zoneLabelIds?.[0]
                            ? {
                                id: toUpper(item.zoneLabelIds[0]),
                                name: resolveZoneDisplayName(item.zoneLabelIds[0], toText(item.zoneLabelNames?.[0] || item.zoneLabels?.[0]?.name || ''))
                                    || item.zoneLabelIds[0],
                                color: toText(zoneNameById.get(toUpper(item.zoneLabelIds[0]))?.color || item.zoneLabels?.[0]?.color || '#00A884') || '#00A884'
                            }
                            : null
                    );
                    const operational = operationalById.get(toUpper(item.operationalLabelIds?.[0] || '')) || null;
                    const statusMetaItem = commercialByKey.get(toLower(item.commercialStatus)) || null;
                    return (
                        <article key={item.customerId} className="saas-campaigns-audience-live-item">
                            <div className="saas-campaigns-audience-live-item__main">
                                <strong>{item.contactName}</strong>
                                <span>{item.phone || 'Sin telefono'}</span>
                            </div>
                            <div className="saas-campaigns-audience-live-item__meta">
                                {statusMetaItem ? (
                                    <span className="saas-campaigns-chip active" style={{ '--campaign-chip-accent': statusMetaItem.color }}>{statusMetaItem.name}</span>
                                ) : null}
                                {zone ? (
                                    <span className="saas-campaigns-chip active" style={{ '--campaign-chip-accent': zone.color }}>{zone.name}</span>
                                ) : null}
                                {operational ? (
                                    <span className="saas-campaigns-chip active" style={{ '--campaign-chip-accent': operational.color }}>{operational.name}</span>
                                ) : null}
                            </div>
                        </article>
                    );
                })}
                {items.length > limit ? <div className="saas-campaigns-audience-live-more">y {items.length - limit} mas...</div> : null}
            </div>
        );
    };

    const renderAudienceStepPanel = ({ scope = 'inclusionFilters', baseCount = 0, filteredCount = 0, items = [], subtitle = '', activeCriteria = [], criteriaGroups = [], controls = null, bottomAction = null }) => (
        <div className="saas-campaigns-audience-step">
            <div className="saas-campaigns-audience-step__criteria">
                {renderCriterionToggleList(scope, criteriaGroups)}
            </div>
            <div className="saas-campaigns-audience-step__results">
                <div className="saas-campaigns-audience-step__results-header">
                    <div>
                        <strong>{filteredCount} clientes {scope === 'exclusionFilters' ? 'finales' : 'incluidos'}</strong>
                        <span>{subtitle || `de ${baseCount} base total del modulo`}</span>
                    </div>
                    {renderAudienceFilterChips(scope, scope === 'exclusionFilters' ? 'Excluir' : 'Incluir')}
                </div>
                <div className="saas-campaigns-audience-step__controls">
                    {activeCriteria.length > 0 ? controls : <p className="saas-campaigns-audience-empty">Sin filtros activos. Se incluiran todos los {baseCount} clientes base.</p>}
                </div>
                <div className="saas-campaigns-audience-step__list">
                    {activeCriteria.length > 0 && items.length > 0 ? renderAudienceCustomerRows(items, 50) : null}
                    {activeCriteria.length > 0 && items.length === 0 ? <p className="saas-campaigns-audience-empty">No hay clientes para los filtros seleccionados.</p> : null}
                </div>
                <div className="saas-campaigns-audience-step__footer">
                    {bottomAction}
                </div>
            </div>
        </div>
    );

    const inclusionCriteriaGroups = useMemo(() => {
        const customerItems = [];
        if (inclusionCustomerTypeOptions.length > 0) customerItems.push({ key: 'customer_type_ids', label: 'Tipo de cliente' });
        if (acquisitionSourceOptions.length > 0) customerItems.push({ key: 'acquisition_source_ids', label: 'Fuente de adquisicion' });
        customerItems.push({ key: 'assigned_user_id', label: 'Asignado a' });
        customerItems.push({ key: 'created_range', label: 'Fecha de registro' });
        return [
            {
                title: 'Geografia',
                items: [
                    { key: 'departments', label: 'Departamento' },
                    { key: 'provinces', label: 'Provincia' },
                    { key: 'districts', label: 'Distrito' },
                    { key: 'zone_label_ids', label: 'Zona' }
                ]
            },
            {
                title: 'Estado',
                items: [
                    { key: 'commercial_status', label: 'Estado comercial' },
                    { key: 'operational_label_ids', label: 'Etiqueta operativa' }
                ]
            },
            {
                title: 'Perfil del cliente',
                items: customerItems
            },
            {
                title: 'Datos completos',
                items: [
                    { key: 'has_phone', label: 'Tiene telefono valido' },
                    { key: 'has_email', label: 'Tiene email' },
                    { key: 'has_address', label: 'Tiene direccion registrada' }
                ]
            }
        ];
    }, [acquisitionSourceOptions.length, inclusionCustomerTypeOptions.length]);

    const exclusionCriteriaGroups = useMemo(() => {
        const groups = [];
        if (exclusionDepartments.length > 0 || exclusionProvinces.length > 0 || exclusionDistricts.length > 0 || exclusionAudienceOptions.zoneLabels.length > 0) {
            groups.push({
                title: 'Geografia',
                items: [
                    ...(exclusionDepartments.length > 0 ? [{ key: 'departments', label: 'Departamento' }] : []),
                    ...(exclusionProvinces.length > 0 ? [{ key: 'provinces', label: 'Provincia' }] : []),
                    ...(exclusionDistricts.length > 0 ? [{ key: 'districts', label: 'Distrito' }] : []),
                    ...(exclusionAudienceOptions.zoneLabels.length > 0 ? [{ key: 'zone_label_ids', label: 'Zona' }] : [])
                ]
            });
        }
        const stateItems = [];
        if (exclusionAudienceOptions.commercialStatuses.length > 0) stateItems.push({ key: 'commercial_status', label: 'Estado comercial' });
        if (exclusionAudienceOptions.operationalLabels.length > 0) stateItems.push({ key: 'operational_label_ids', label: 'Etiqueta operativa' });
        if (stateItems.length > 0) groups.push({ title: 'Estado', items: stateItems });
        const customerItems = [];
        if (exclusionCustomerTypeOptions.length > 0) customerItems.push({ key: 'customer_type_ids', label: 'Tipo de cliente' });
        if (exclusionAcquisitionSourceOptions.length > 0) customerItems.push({ key: 'acquisition_source_ids', label: 'Fuente de adquisicion' });
        if (exclusionAssignedUserOptions.length > 0) customerItems.push({ key: 'assigned_user_id', label: 'Asignado a' });
        customerItems.push({ key: 'created_range', label: 'Fecha de registro' });
        if (customerItems.length > 0) groups.push({ title: 'Perfil del cliente', items: customerItems });
        groups.push({
            title: 'Datos completos',
            items: [
                { key: 'has_phone', label: 'Tiene telefono valido' },
                { key: 'has_email', label: 'Tiene email' },
                { key: 'has_address', label: 'Tiene direccion registrada' },
                { key: 'manual_customers', label: 'Clientes especificos' }
            ]
        });
        return groups.filter((group) => group.items.length > 0);
    }, [
        exclusionAcquisitionSourceOptions.length,
        exclusionAssignedUserOptions.length,
        exclusionAudienceOptions.commercialStatuses.length,
        exclusionAudienceOptions.operationalLabels.length,
        exclusionAudienceOptions.zoneLabels.length,
        exclusionCustomerTypeOptions.length,
        exclusionDepartments.length,
        exclusionDistricts.length,
        exclusionProvinces.length
    ]);

    const renderAudienceStepControls = (scope = 'inclusionFilters') => {
        const filters = normalizeDeepFilters(form?.[scope] || {});
        const activeCriteria = scope === 'exclusionFilters' ? activeExclusionCriteria : activeInclusionCriteria;
        const statusOptions = scope === 'exclusionFilters' ? exclusionAudienceOptions.commercialStatuses : commercialFilterOptions;
        const zoneOptionsForScope = scope === 'exclusionFilters' ? exclusionAudienceOptions.zoneLabels : zoneFilterChipOptions;
        const operationalOptionsForScope = scope === 'exclusionFilters' ? exclusionAudienceOptions.operationalLabels : operationalFilterChipOptions;
        const customerTypeOptions = scope === 'exclusionFilters' ? exclusionCustomerTypeOptions : inclusionCustomerTypeOptions;
        const assignedUserOptions = scope === 'exclusionFilters' ? exclusionAssignedUserOptions : campaignFilterOptions.assigned_users;
        const acquisitionOptions = scope === 'exclusionFilters' ? exclusionAcquisitionSourceOptions : acquisitionSourceOptions;
        const departments = scope === 'exclusionFilters' ? exclusionDepartments : geographyDepartments;
        const provinces = scope === 'exclusionFilters' ? exclusionProvinces : inclusionProvinceOptions;
        const districts = scope === 'exclusionFilters' ? exclusionDistricts : inclusionDistrictOptions;
        return (
            <div className="saas-campaigns-audience-step__filters">
                {activeCriteria.includes('departments') ? (
                    <div className="saas-admin-field">
                        <label>Departamento</label>
                        <select
                            multiple
                            size={Math.min(Math.max(departments.length, 3), 8)}
                            value={filters.departments}
                            onChange={(event) => updateDeepFilter(scope, 'departments', Array.from(event.target.selectedOptions).map((option) => option.value))}
                        >
                            {departments.map((name) => <option key={`${scope}_dep_${name}`} value={name}>{name}</option>)}
                        </select>
                    </div>
                ) : null}
                {activeCriteria.includes('provinces') ? (
                    <div className="saas-admin-field">
                        <label>Provincia</label>
                        <select
                            multiple
                            size={Math.min(Math.max(provinces.length, 3), 8)}
                            value={filters.provinces}
                            onChange={(event) => updateDeepFilter(scope, 'provinces', Array.from(event.target.selectedOptions).map((option) => option.value))}
                        >
                            {provinces.map((name) => <option key={`${scope}_prov_${name}`} value={name}>{name}</option>)}
                        </select>
                    </div>
                ) : null}
                {activeCriteria.includes('districts') ? (
                    <div className="saas-admin-field">
                        <label>Distrito</label>
                        <select
                            multiple
                            size={Math.min(Math.max(districts.length, 3), 8)}
                            value={filters.districts}
                            onChange={(event) => updateDeepFilter(scope, 'districts', Array.from(event.target.selectedOptions).map((option) => option.value))}
                        >
                            {districts.map((name) => <option key={`${scope}_dist_${name}`} value={name}>{name}</option>)}
                        </select>
                    </div>
                ) : null}
                {activeCriteria.includes('zone_label_ids') ? renderAudienceChipGroup(scope, 'zone_label_ids', 'Zona', zoneOptionsForScope, toUpper, 'Sin zonas configuradas') : null}
                {activeCriteria.includes('commercial_status') ? renderAudienceChipGroup(scope, 'commercial_status', 'Estado comercial', statusOptions, toLower, 'Sin estados disponibles') : null}
                {activeCriteria.includes('operational_label_ids') ? renderAudienceChipGroup(scope, 'operational_label_ids', 'Etiqueta operativa', operationalOptionsForScope, toUpper, 'Sin etiquetas operativas') : null}
                {activeCriteria.includes('customer_type_ids') && customerTypeOptions.length > 0 ? (
                    <div className="saas-admin-field">
                        <label>Tipo de cliente</label>
                        <select
                            multiple
                            size={Math.min(Math.max(customerTypeOptions.length, 3), 8)}
                            value={filters.customer_type_ids}
                            onChange={(event) => updateDeepFilter(scope, 'customer_type_ids', Array.from(event.target.selectedOptions).map((option) => option.value))}
                        >
                            {customerTypeOptions.map((entry) => <option key={`${scope}_ctype_${entry.id}`} value={entry.id}>{entry.name}</option>)}
                        </select>
                    </div>
                ) : null}
                {activeCriteria.includes('acquisition_source_ids') && acquisitionOptions.length > 0 ? (
                    <div className="saas-admin-field">
                        <label>Fuente de adquisicion</label>
                        <select
                            multiple
                            size={Math.min(Math.max(acquisitionOptions.length, 3), 8)}
                            value={filters.acquisition_source_ids}
                            onChange={(event) => updateDeepFilter(scope, 'acquisition_source_ids', Array.from(event.target.selectedOptions).map((option) => option.value))}
                        >
                            {acquisitionOptions.map((entry) => <option key={`${scope}_src_${entry.id}`} value={entry.id}>{entry.name}</option>)}
                        </select>
                    </div>
                ) : null}
                {activeCriteria.includes('assigned_user_id') ? (
                    <div className="saas-admin-field">
                        <label>Asignado a</label>
                        <select value={filters.assigned_user_id || ''} onChange={(event) => updateDeepFilter(scope, 'assigned_user_id', event.target.value)}>
                            <option value="">Todos</option>
                            {assignedUserOptions.map((entry) => <option key={`${scope}_usr_${entry.id}`} value={entry.id}>{entry.name}</option>)}
                        </select>
                    </div>
                ) : null}
                {activeCriteria.includes('created_range') ? (
                    <div className="saas-campaigns-compact-filters">
                        <div className="saas-admin-field">
                            <label>Fecha de registro desde</label>
                            <input type="date" value={filters.created_after || ''} onChange={(event) => updateDeepFilter(scope, 'created_after', event.target.value)} />
                        </div>
                        <div className="saas-admin-field">
                            <label>Fecha de registro hasta</label>
                            <input type="date" value={filters.created_before || ''} onChange={(event) => updateDeepFilter(scope, 'created_before', event.target.value)} />
                        </div>
                    </div>
                ) : null}
                {activeCriteria.includes('has_phone') ? (
                    <label className="saas-campaigns-criteria-inline-toggle"><input type="checkbox" checked={filters.has_phone === true} onChange={(event) => updateDeepFilter(scope, 'has_phone', event.target.checked ? true : '')} />Tiene telefono valido</label>
                ) : null}
                {activeCriteria.includes('has_email') ? (
                    <label className="saas-campaigns-criteria-inline-toggle"><input type="checkbox" checked={filters.has_email === true} onChange={(event) => updateDeepFilter(scope, 'has_email', event.target.checked ? true : '')} />Tiene email</label>
                ) : null}
                {activeCriteria.includes('has_address') ? (
                    <label className="saas-campaigns-criteria-inline-toggle"><input type="checkbox" checked={filters.has_address === true} onChange={(event) => updateDeepFilter(scope, 'has_address', event.target.checked ? true : '')} />Tiene direccion registrada</label>
                ) : null}
                {scope === 'exclusionFilters' && activeCriteria.includes('manual_customers') ? (
                    <div className="saas-admin-field">
                        <label>Clientes especificos</label>
                        <input value={manualExclusionSearch} onChange={(event) => setManualExclusionSearch(event.target.value)} placeholder="Buscar por nombre o telefono" />
                        <div className="saas-campaigns-manual-exclusion-results">
                            {manualExclusionCandidates.length === 0 ? <small className="saas-admin-empty-inline">{inclusionOnlyAudienceItems.length === 0 ? 'No hay audiencia incluida para excluir.' : 'No hay coincidencias disponibles.'}</small> : manualExclusionCandidates.map((item) => (
                                <button key={`exclude_candidate_${item.customerId}`} type="button" className="saas-campaigns-manual-exclusion-item" onClick={() => toggleAudienceExclusion(item.customerId)}>
                                    <strong>{item.contactName}</strong>
                                    <span>{item.phone}</span>
                                </button>
                            ))}
                        </div>
                        <div className="saas-campaigns-filter-chips saas-campaigns-filter-chips--manual">
                            {manualExcludedAudienceItems.length === 0 ? <small className="saas-admin-empty-inline">Sin exclusiones manuales.</small> : manualExcludedAudienceItems.map((item) => (
                                <button key={`excluded_manual_${item.customerId}`} type="button" onClick={() => toggleAudienceExclusion(item.customerId)}>{item.contactName || item.phone}<span>x</span></button>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
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
                    {renderAudienceStepPanel({
                        scope: 'inclusionFilters',
                        baseCount: baseAudienceNumbers.eligible,
                        filteredCount: inclusionAudienceNumbers.eligible || baseAudienceNumbers.eligible,
                        items: inclusionOnlyAudienceItems,
                        subtitle: `de ${baseAudienceNumbers.eligible} base total del modulo`,
                        activeCriteria: activeInclusionCriteria,
                        criteriaGroups: inclusionCriteriaGroups,
                        controls: renderAudienceStepControls('inclusionFilters'),
                        bottomAction: (
                            <>
                                <span>{inclusionAudienceNumbers.eligible || baseAudienceNumbers.eligible} clientes incluidos</span>
                                <span>{inclusionSelectionCount} filtros activos</span>
                                <button type="button" disabled={!wizardCanAdvance || loading} onClick={goToNextWizardStep}>Siguiente →</button>
                            </>
                        )
                    })}
                </SaasDetailPanelSection>
            );
        case 3:
            return (
                <SaasDetailPanelSection title="Paso 3 - Exclusion">
                    {renderAudienceStepPanel({
                        scope: 'exclusionFilters',
                        baseCount: inclusionAudienceNumbers.eligible || inclusionOnlyAudienceItems.length,
                        filteredCount: exclusionSummary.finalRecipients,
                        items: estimatedAudienceItems,
                        subtitle: `${exclusionSummary.excluded} excluidos de ${inclusionAudienceNumbers.eligible || inclusionOnlyAudienceItems.length} incluidos`,
                        activeCriteria: activeExclusionCriteria,
                        criteriaGroups: exclusionCriteriaGroups,
                        controls: renderAudienceStepControls('exclusionFilters'),
                        bottomAction: (
                            <>
                                <span>Clientes incluidos: {exclusionSummary.eligible}</span>
                                <span>Excluidos: {exclusionSummary.excluded}</span>
                                <span>Clientes finales: {exclusionSummary.finalRecipients}</span>
                                <button type="button" disabled={!wizardCanAdvance || loading} onClick={goToNextWizardStep}>Siguiente →</button>
                            </>
                        )
                    })}
                </SaasDetailPanelSection>
            );
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
                                {toLower(selectedCampaign?.status) === 'draft' && <button type="button" disabled={loading || !canWrite} onClick={() => { setForm(mapCampaignToForm(selectedCampaign, labelOptions, zoneOptions)); setPanelMode('edit'); setWizardStep(1); setLocalEstimate(null); setInclusionOnlyEstimate(null); }}>Editar</button>}
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
