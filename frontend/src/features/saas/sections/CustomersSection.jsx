
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import SendTemplateModal from '../../chat/components/SendTemplateModal';
import { buildTemplateResolvedPreview } from '../../chat/core/helpers/templateMessages.helpers';
import { normalizeCustomerFormFromItem } from '../helpers';
import { isTemplateAllowedInCampaigns, isTemplateAllowedInIndividual, normalizeTemplateUseCase } from '../helpers/templateUseCase.helpers';
import {
    SaasDataTable,
    SaasDetailPanel,
    SaasDetailPanelSection,
    SaasEntityPage,
    SaasTableDetailLayout,
    SaasViewHeader,
    useSaasColumnPrefs
} from '../components/layout';
import { normalizeSortState } from '../components/layout/sortUtils';
import { createCampaign as createCampaignApi, startCampaign as startCampaignApi } from '../services/campaigns.service';
import { fetchTenantCustomerLabels, fetchTenantZoneRules } from '../services/labels.service';
import { listMetaTemplates } from '../services/metaTemplates.service';

const CUSTOMER_TABLE_COLUMNS = [
    { key: 'codigo', label: 'Código', width: '132px', minWidth: '120px', maxWidth: '152px', type: 'text' },
    { key: 'nombreCompleto', label: 'Nombre Completo', width: '208px', minWidth: '160px', maxWidth: '260px', type: 'text' },
    { key: 'nombres', label: 'Nombres', width: '176px', minWidth: '140px', maxWidth: '220px', type: 'text' },
    { key: 'apellidoPaterno', label: 'Apellido Paterno', width: '176px', minWidth: '140px', maxWidth: '220px', type: 'text' },
    { key: 'apellidoMaterno', label: 'Apellido Materno', width: '176px', minWidth: '140px', maxWidth: '220px', type: 'text' },
    { key: 'telefono', label: 'Teléfono', width: '156px', minWidth: '132px', maxWidth: '190px', type: 'text' },
    { key: 'telefonoAlt', label: 'Teléfono Alterno', width: '168px', minWidth: '140px', maxWidth: '208px', type: 'text' },
    { key: 'email', label: 'Correo', width: '220px', minWidth: '180px', maxWidth: '280px', type: 'text' },
    { key: 'tipoCliente', label: 'Tipo De Cliente', width: '146px', minWidth: '124px', maxWidth: '196px', type: 'option' },
    { key: 'tipoDocumento', label: 'Tipo De Documento', width: '162px', minWidth: '136px', maxWidth: '216px', type: 'option' },
    { key: 'documento', label: 'Documento', width: '150px', minWidth: '130px', maxWidth: '190px', type: 'text' },
    { key: 'idioma', label: 'Idioma', width: '118px', minWidth: '100px', maxWidth: '150px', type: 'option' },
    { key: 'fuenteAdquisicion', label: 'Fuente', width: '146px', minWidth: '124px', maxWidth: '196px', type: 'option' },
    { key: 'tratamiento', label: 'Tratamiento', width: '146px', minWidth: '124px', maxWidth: '196px', type: 'option' },
    { key: 'zona', label: 'Zona', width: '154px', minWidth: '130px', maxWidth: '210px', type: 'option' },
    { key: 'etiquetas', label: 'Etiquetas', width: '220px', minWidth: '180px', maxWidth: '300px', type: 'text' },
    { key: 'estadoComercial', label: 'Estado Comercial', width: '160px', minWidth: '136px', maxWidth: '210px', type: 'option' },
    { key: 'ultimaInteraccion', label: 'Última Interacción', width: '166px', minWidth: '144px', maxWidth: '220px', type: 'date' },
    { key: 'actualizado', label: 'Actualizado', width: '166px', minWidth: '144px', maxWidth: '220px', type: 'date' },
    { key: 'estado', label: 'Estado', width: '116px', minWidth: '96px', maxWidth: '146px', type: 'option' }
];

const CUSTOMER_DEFAULT_COLUMN_KEYS = [
    'codigo',
    'nombreCompleto',
    'telefono',
    'email',
    'tipoCliente',
    'estado'
];
const CUSTOMER_DEFAULT_SORT = {
    columnKey: 'actualizado',
    direction: 'desc'
};
const EMPTY_CUSTOMER_CATALOGS = {
    treatments: [],
    customerTypes: [],
    acquisitionSources: [],
    documentTypes: []
};
const EMPTY_GEO_CATALOG = {
    departments: [],
    provinces: [],
    districts: []
};
const EMPTY_ADDRESS_FORM = {
    addressId: '',
    addressType: 'other',
    street: '',
    reference: '',
    mapsUrl: '',
    departmentId: '',
    provinceId: '',
    districtId: '',
    districtName: '',
    provinceName: '',
    departmentName: '',
    latitude: '',
    longitude: '',
    isPrimary: false
};
const ADDRESS_TYPE_OPTIONS = [
    { value: 'fiscal', label: 'Fiscal' },
    { value: 'delivery', label: 'Entrega' },
    { value: 'other', label: 'Otro' }
];
const ADDRESS_TYPE_LABEL_BY_VALUE = ADDRESS_TYPE_OPTIONS.reduce((acc, option) => {
    const key = String(option?.value || '').trim().toLowerCase();
    if (!key) return acc;
    acc[key] = String(option?.label || key).trim() || key;
    return acc;
}, {});
const FORM_LANGUAGE_OPTIONS = [
    { value: 'es', label: 'Espanol (es)' },
    { value: 'en', label: 'Ingles (en)' },
    { value: 'pt', label: 'Portugues (pt)' }
];

function normalizeGeoNumericId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (!/^\d+$/.test(raw)) return raw;
    return String(Number(raw));
}

function normalizeGeoDistrictId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (!/^\d+$/.test(raw)) return raw;
    return raw.padStart(6, '0');
}

function normalizeGeoNameKey(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function isLikelyGeoCode(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return false;
    return /^\d{1,6}$/.test(raw);
}

function normalizeGeoCatalogItems(items = [], type = 'department') {
    if (!Array.isArray(items)) return [];
    return items.map((item = {}) => {
        if (type === 'department') {
            return {
                id: normalizeGeoNumericId(item.id || item.departmentId || item.department_id),
                name: String(item.name || item.departmentName || item.department_name || '').trim()
            };
        }
        if (type === 'province') {
            return {
                id: normalizeGeoNumericId(item.id || item.provinceId || item.province_id),
                departmentId: normalizeGeoNumericId(item.departmentId || item.department_id),
                name: String(item.name || item.provinceName || item.province_name || '').trim()
            };
        }
        return {
            id: normalizeGeoDistrictId(item.id || item.districtId || item.district_id),
            provinceId: normalizeGeoNumericId(item.provinceId || item.province_id),
            departmentId: normalizeGeoNumericId(item.departmentId || item.department_id),
            name: String(item.name || item.districtName || item.district_name || '').trim()
        };
    }).filter((item) => item.id && item.name);
}

function normalizeCatalogItems(items = []) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item = {}) => ({
            id: String(item.id || item.code || '').trim(),
            label: String(item.label || item.name || item.code || item.id || '').trim(),
            value: String(item.label || item.name || item.code || item.id || '').trim(),
            abbreviation: String(item.abbreviation || '').trim()
        }))
        .filter((item) => item.id && item.label);
}

function normalizeCatalogLookupKey(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d+$/.test(raw)) return String(Number(raw));
    return raw.toLowerCase();
}

function buildCatalogLabelMap(items = [], preferredField = 'label') {
    return normalizeCatalogItems(items).reduce((acc, item) => {
        const rawId = String(item.id || '').trim();
        const normalizedId = normalizeCatalogLookupKey(rawId);
        const preferredValue = String(item?.[preferredField] || item.label || '').trim() || item.label;
        if (rawId) acc[rawId] = preferredValue;
        if (normalizedId) acc[normalizedId] = preferredValue;
        return acc;
    }, {});
}

function resolveCatalogLabel(rawId = '', map = {}) {
    const directId = String(rawId || '').trim();
    if (!directId) return '';
    const direct = String(map?.[directId] || '').trim();
    if (direct) return direct;
    const normalized = normalizeCatalogLookupKey(directId);
    if (!normalized) return '';
    return String(map?.[normalized] || '').trim();
}

function readProfileValue(profile = {}, ...keys) {
    const source = profile && typeof profile === 'object' ? profile : {};
    for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && String(value).trim()) {
            return String(value).trim();
        }
    }
    return '';
}

function resolveCatalogSelectValue(value = '', options = []) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (options.some((item) => String(item?.id || '').trim() === raw)) return raw;
    const normalized = normalizeCatalogLookupKey(raw);
    const match = options.find((item) => normalizeCatalogLookupKey(item?.id || '') === normalized);
    return String(match?.id || raw).trim();
}

function resolveCustomerId(value = null) {
    if (!value || typeof value !== 'object') return '';
    return String(value.customerId || value.customer_id || value.id || '').trim();
}

function hasOwn(source, key) {
    return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function pickPatchedValue(source = {}, key, fallback) {
    return hasOwn(source, key) ? source[key] : fallback;
}

function upsertCustomerById(items = [], customer = null) {
    const source = Array.isArray(items) ? items : [];
    const candidate = customer && typeof customer === 'object' ? customer : null;
    const candidateId = resolveCustomerId(candidate);
    if (!candidateId) return source;

    let matched = false;
    const next = source.map((item) => {
        const itemId = resolveCustomerId(item);
        if (itemId !== candidateId) return item;
        matched = true;
        return candidate;
    });

    if (!matched) next.unshift(candidate);
    return next;
}

function cloneCustomerSnapshot(customer = null) {
    if (!customer || typeof customer !== 'object') return null;
    const profile = customer.profile && typeof customer.profile === 'object' ? { ...customer.profile } : {};
    const metadata = customer.metadata && typeof customer.metadata === 'object' ? { ...customer.metadata } : {};
    const tags = Array.isArray(customer.tags) ? [...customer.tags] : customer.tags;
    return {
        ...customer,
        profile,
        metadata,
        tags
    };
}

function buildOptimisticCustomerFromPayload(customer = null, payload = {}) {
    if (!customer || typeof customer !== 'object') return customer;
    const sourcePayload = payload && typeof payload === 'object' ? payload : {};
    const payloadProfile = sourcePayload.profile && typeof sourcePayload.profile === 'object' ? sourcePayload.profile : {};
    const previousProfile = customer.profile && typeof customer.profile === 'object' ? customer.profile : {};
    const nowIso = new Date().toISOString();
    const nextFirstName = pickPatchedValue(sourcePayload, 'firstName', customer.firstName);
    const nextLastNamePaternal = pickPatchedValue(sourcePayload, 'lastNamePaternal', customer.lastNamePaternal);
    const nextLastNameMaternal = pickPatchedValue(sourcePayload, 'lastNameMaternal', customer.lastNameMaternal);
    const nextTreatmentId = pickPatchedValue(sourcePayload, 'treatmentId', customer.treatmentId);
    const nextDocumentTypeId = pickPatchedValue(sourcePayload, 'documentTypeId', customer.documentTypeId);
    const nextDocumentNumber = pickPatchedValue(sourcePayload, 'documentNumber', customer.documentNumber);
    const nextCustomerTypeId = pickPatchedValue(sourcePayload, 'customerTypeId', customer.customerTypeId);
    const nextAcquisitionSourceId = pickPatchedValue(sourcePayload, 'acquisitionSourceId', customer.acquisitionSourceId);
    const nextNotes = pickPatchedValue(sourcePayload, 'notes', customer.notes);
    const nextPreferredLanguage = String(
        pickPatchedValue(
            sourcePayload,
            'preferredLanguage',
            customer.preferredLanguage || customer.preferred_language || customer?.metadata?.preferredLanguage || 'es'
        ) || 'es'
    ).trim().toLowerCase();

    return {
        ...customer,
        contactName: pickPatchedValue(sourcePayload, 'contactName', customer.contactName),
        phoneE164: pickPatchedValue(sourcePayload, 'phoneE164', customer.phoneE164),
        phoneAlt: pickPatchedValue(sourcePayload, 'phoneAlt', customer.phoneAlt),
        email: pickPatchedValue(sourcePayload, 'email', customer.email),
        isActive: pickPatchedValue(sourcePayload, 'isActive', customer.isActive),
        tags: Array.isArray(sourcePayload.tags) ? sourcePayload.tags : customer.tags,
        treatmentId: nextTreatmentId,
        treatment_id: pickPatchedValue(sourcePayload, 'treatment_id', customer.treatment_id),
        customerTypeId: nextCustomerTypeId,
        customer_type_id: pickPatchedValue(sourcePayload, 'customer_type_id', customer.customer_type_id),
        acquisitionSourceId: nextAcquisitionSourceId,
        acquisition_source_id: pickPatchedValue(sourcePayload, 'acquisition_source_id', customer.acquisition_source_id),
        documentTypeId: nextDocumentTypeId,
        document_type_id: pickPatchedValue(sourcePayload, 'document_type_id', customer.document_type_id),
        documentNumber: nextDocumentNumber,
        document_number: pickPatchedValue(sourcePayload, 'document_number', customer.document_number),
        firstName: nextFirstName,
        first_name: pickPatchedValue(sourcePayload, 'first_name', customer.first_name),
        lastNamePaternal: nextLastNamePaternal,
        last_name_paternal: pickPatchedValue(sourcePayload, 'last_name_paternal', customer.last_name_paternal),
        lastNameMaternal: nextLastNameMaternal,
        last_name_maternal: pickPatchedValue(sourcePayload, 'last_name_maternal', customer.last_name_maternal),
        notes: nextNotes,
        preferredLanguage: nextPreferredLanguage,
        preferred_language: nextPreferredLanguage,
        profile: {
            ...previousProfile,
            ...payloadProfile,
            firstNames: nextFirstName,
            lastNamePaternal: nextLastNamePaternal,
            lastNameMaternal: nextLastNameMaternal,
            treatmentId: nextTreatmentId,
            documentTypeId: nextDocumentTypeId,
            documentNumber: nextDocumentNumber,
            customerTypeId: nextCustomerTypeId,
            sourceId: nextAcquisitionSourceId,
            notes: nextNotes
        },
        metadata: {
            ...(customer?.metadata && typeof customer.metadata === 'object' ? customer.metadata : {}),
            preferredLanguage: nextPreferredLanguage
        },
        updatedAt: nowIso,
        updated_at: nowIso
    };
}

function normalizePreferredLanguage(customer = null) {
    if (!customer || typeof customer !== 'object') return 'es';
    const direct = String(customer.preferredLanguage || customer.preferred_language || '').trim().toLowerCase();
    const fromMetadata = String(customer?.metadata?.preferredLanguage || '').trim().toLowerCase();
    const normalized = direct || fromMetadata;
    if (normalized === 'en' || normalized === 'pt') return normalized;
    return 'es';
}

function normalizeModuleContextConsent(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'opted_in' || normalized === 'opted_out') return normalized;
    return 'unknown';
}

function normalizeModuleContextStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['nuevo', 'en_conversacion', 'cotizado', 'vendido', 'perdido'].includes(normalized)) return normalized;
    return 'unknown';
}

function normalizeModuleContextRecord(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    const labels = Array.isArray(source.labels) ? source.labels.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
    return {
        moduleId: String(source.moduleId || source.module_id || '').trim(),
        marketingOptInStatus: normalizeModuleContextConsent(source.marketingOptInStatus || source.marketing_opt_in_status),
        commercialStatus: normalizeModuleContextStatus(source.commercialStatus || source.commercial_status),
        labels,
        assignmentUserId: String(source.assignmentUserId || source.assignment_user_id || '').trim(),
        firstInteractionAt: String(source.firstInteractionAt || source.first_interaction_at || '').trim(),
        lastInteractionAt: String(source.lastInteractionAt || source.last_interaction_at || '').trim(),
        updatedAt: String(source.updatedAt || source.updated_at || '').trim()
    };
}

function normalizeAddressRecord(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    const districtName = String(source.districtName || source.district_name || '').trim();
    const provinceName = String(source.provinceName || source.province_name || '').trim();
    const departmentName = String(source.departmentName || source.department_name || '').trim();
    const districtId = String(source.districtId || source.district_id || '').trim();
    const locationLabel = [districtName, provinceName, departmentName]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .join(' - ');
    return {
        addressId: String(source.addressId || source.address_id || '').trim(),
        addressType: String(source.addressType || source.address_type || '').trim() || 'other',
        street: String(source.street || '').trim(),
        reference: String(source.reference || '').trim(),
        mapsUrl: String(source.mapsUrl || source.maps_url || '').trim(),
        latitude: String(source.latitude || '').trim(),
        longitude: String(source.longitude || '').trim(),
        districtId,
        districtName,
        provinceName,
        departmentName,
        locationLabel: locationLabel || '-',
        isPrimary: Boolean(source.isPrimary || source.is_primary),
        updatedAt: String(source.updatedAt || source.updated_at || source.createdAt || source.created_at || '').trim()
    };
}

function buildAddressFormFromRecord(value = null) {
    const source = normalizeAddressRecord(value);
    const raw = value && typeof value === 'object' ? value : {};
    return {
        addressId: String(source.addressId || '').trim(),
        addressType: String(source.addressType || 'other').trim() || 'other',
        street: String(source.street || '').trim(),
        reference: String(source.reference || '').trim(),
        mapsUrl: String(value?.mapsUrl || value?.maps_url || '').trim(),
        departmentId: normalizeGeoNumericId(raw.departmentId || raw.department_id || ''),
        provinceId: normalizeGeoNumericId(raw.provinceId || raw.province_id || ''),
        districtId: normalizeGeoDistrictId(source.districtId || (isLikelyGeoCode(source.districtName) ? source.districtName : '')),
        districtName: String(source.districtName || '').trim(),
        provinceName: String(source.provinceName || '').trim(),
        departmentName: String(source.departmentName || '').trim(),
        latitude: String(value?.latitude || '').trim(),
        longitude: String(value?.longitude || '').trim(),
        isPrimary: Boolean(source.isPrimary)
    };
}

function resolveAddressTypeLabel(value = '') {
    const key = String(value || '').trim().toLowerCase();
    return ADDRESS_TYPE_LABEL_BY_VALUE[key] || key || '-';
}

function buildAddressLocationLabel(address = {}) {
    const source = address && typeof address === 'object' ? address : {};
    const resolved = [
        String(source.districtName || source.district_name || '').trim(),
        String(source.provinceName || source.province_name || '').trim(),
        String(source.departmentName || source.department_name || '').trim()
    ].filter(Boolean).join(' - ');
    if (resolved) return resolved;
    return String(source.locationLabel || '').trim() || '-';
}

function serializeCustomerFormForDirty(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    return JSON.stringify({
        contactName: String(source.contactName || '').trim(),
        phoneE164: String(source.phoneE164 || '').trim(),
        phoneAlt: String(source.phoneAlt || '').trim(),
        email: String(source.email || '').trim(),
        tagsText: String(source.tagsText || '').trim(),
        isActive: source.isActive !== false,
        treatmentId: String(source.treatmentId || source.treatment_id || '').trim(),
        firstName: String(source.firstName || source.first_name || source.profileFirstNames || '').trim(),
        lastNamePaternal: String(source.lastNamePaternal || source.last_name_paternal || source.profileLastNamePaternal || '').trim(),
        lastNameMaternal: String(source.lastNameMaternal || source.last_name_maternal || source.profileLastNameMaternal || '').trim(),
        documentTypeId: String(source.documentTypeId || source.document_type_id || '').trim(),
        documentNumber: String(source.documentNumber || source.document_number || source.profileDocumentNumber || '').trim(),
        customerTypeId: String(source.customerTypeId || source.customer_type_id || '').trim(),
        acquisitionSourceId: String(source.acquisitionSourceId || source.acquisition_source_id || '').trim(),
        notes: String(source.notes || source.profileNotes || '').trim(),
        preferredLanguage: String(source.preferredLanguage || source.preferred_language || 'es').trim().toLowerCase() || 'es'
    });
}

function serializeAddressFormForDirty(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    return JSON.stringify({
        addressType: String(source.addressType || 'other').trim() || 'other',
        street: String(source.street || '').trim(),
        reference: String(source.reference || '').trim(),
        mapsUrl: String(source.mapsUrl || '').trim(),
        departmentId: normalizeGeoNumericId(source.departmentId || ''),
        provinceId: normalizeGeoNumericId(source.provinceId || ''),
        districtId: normalizeGeoDistrictId(source.districtId || ''),
        departmentName: String(source.departmentName || '').trim(),
        provinceName: String(source.provinceName || '').trim(),
        districtName: String(source.districtName || '').trim(),
        latitude: String(source.latitude || '').trim(),
        longitude: String(source.longitude || '').trim(),
        isPrimary: Boolean(source.isPrimary)
    });
}

function buildProfileAddressesFromCustomer(customer = null) {
    const profile = customer?.profile && typeof customer.profile === 'object' ? customer.profile : {};
    const items = [];
    if (Array.isArray(profile.addresses)) {
        profile.addresses.forEach((entry = {}, index) => {
            const street = String(entry?.street || entry?.direccion || '').trim();
            if (!street) return;
            items.push({
                addressId: String(entry?.addressId || `profile-address-${index + 1}`),
                addressType: String(entry?.addressType || entry?.tipo || 'other').trim() || 'other',
                street,
                reference: String(entry?.reference || entry?.referencia || '').trim(),
                mapsUrl: String(entry?.mapsUrl || entry?.maps_url || entry?.googleMapsUrl || '').trim(),
                latitude: String(entry?.latitude || '').trim(),
                longitude: String(entry?.longitude || '').trim(),
                districtName: String(entry?.districtName || entry?.distrito || '').trim(),
                provinceName: String(entry?.provinceName || entry?.provincia || '').trim(),
                departmentName: String(entry?.departmentName || entry?.departamento || '').trim(),
                isPrimary: Boolean(entry?.isPrimary || entry?.principal),
                updatedAt: String(entry?.updatedAt || customer?.updatedAt || '').trim()
            });
        });
    }
    const fiscalAddress = String(profile.fiscalAddress || '').trim();
    if (fiscalAddress && !items.some((item) => String(item.street || '').trim().toLowerCase() === fiscalAddress.toLowerCase())) {
        items.unshift({
            addressId: 'profile-fiscal',
            addressType: 'fiscal',
            street: fiscalAddress,
            reference: '',
            districtName: '',
            provinceName: '',
            departmentName: '',
            isPrimary: true,
            updatedAt: String(customer?.updatedAt || '').trim()
        });
    }
    return items;
}

function buildCustomerDisplayName(customer = null) {
    if (!customer || typeof customer !== 'object') return '-';
    const contactName = String(customer.contactName || '').trim();
    if (contactName) return contactName;
    const profile = customer?.profile && typeof customer.profile === 'object' ? customer.profile : {};

    const segments = [
        String(customer.firstName || customer.first_name || readProfileValue(profile, 'firstNames', 'nombres', 'first_name') || '').trim(),
        String(customer.lastNamePaternal || customer.last_name_paternal || readProfileValue(profile, 'lastNamePaternal', 'apellidoPaterno', 'apellido_paterno') || '').trim(),
        String(customer.lastNameMaternal || customer.last_name_maternal || readProfileValue(profile, 'lastNameMaternal', 'apellidoMaterno', 'apellido_materno') || '').trim()
    ].filter(Boolean);

    if (segments.length) return segments.join(' ');
    return String(customer.customerId || customer.customer_id || '-').trim() || '-';
}

function buildNamePartsFromCustomer(customer = null) {
    const profile = customer?.profile && typeof customer.profile === 'object' ? customer.profile : {};
    const explicitFirstName = String(
        customer?.firstName
        || customer?.first_name
        || readProfileValue(profile, 'firstNames', 'nombres', 'first_name')
        || ''
    ).trim();
    const explicitLastNamePaternal = String(
        customer?.lastNamePaternal
        || customer?.last_name_paternal
        || readProfileValue(profile, 'lastNamePaternal', 'apellidoPaterno', 'apellido_paterno')
        || ''
    ).trim();
    const explicitLastNameMaternal = String(
        customer?.lastNameMaternal
        || customer?.last_name_maternal
        || readProfileValue(profile, 'lastNameMaternal', 'apellidoMaterno', 'apellido_materno')
        || ''
    ).trim();

    if (explicitFirstName || explicitLastNamePaternal || explicitLastNameMaternal) {
        return {
            firstName: explicitFirstName || '-',
            lastNamePaternal: explicitLastNamePaternal || '-',
            lastNameMaternal: explicitLastNameMaternal || '-'
        };
    }

    const contactName = String(customer?.contactName || '').trim();
    const tokens = contactName.split(/\s+/).map((entry) => String(entry || '').trim()).filter(Boolean);
    if (tokens.length === 0) {
        return {
            firstName: '-',
            lastNamePaternal: '-',
            lastNameMaternal: '-'
        };
    }
    if (tokens.length === 1) {
        return {
            firstName: tokens[0],
            lastNamePaternal: '-',
            lastNameMaternal: '-'
        };
    }
    if (tokens.length === 2) {
        return {
            firstName: tokens[0],
            lastNamePaternal: tokens[1],
            lastNameMaternal: '-'
        };
    }
    return {
        firstName: tokens[0],
        lastNamePaternal: tokens[1],
        lastNameMaternal: tokens.slice(2).join(' ')
    };
}

function buildCustomerTypeLabel(customer = null, labelMaps = {}) {
    if (!customer || typeof customer !== 'object') return '-';
    const profile = customer?.profile && typeof customer.profile === 'object' ? customer.profile : {};
    const typeId = String(customer.customerTypeId || customer.customer_type_id || readProfileValue(profile, 'customerTypeId', 'idTipoCliente', 'id_tipo_cliente') || '').trim();
    const mappedLabel = typeId ? resolveCatalogLabel(typeId, labelMaps.customerTypeById) : '';
    return String(
        mappedLabel
        || customer.customerTypeLabel
        || customer.customer_type_label
        || customer.customerType
        || customer.customer_type
        || customer?.profile?.customerType
        || '-'
    ).trim() || '-';
}

function buildDocumentTypeLabel(customer = null, labelMaps = {}) {
    if (!customer || typeof customer !== 'object') return '-';
    const profile = customer?.profile && typeof customer.profile === 'object' ? customer.profile : {};
    const documentTypeId = String(customer.documentTypeId || customer.document_type_id || readProfileValue(profile, 'documentTypeId', 'idDocumentoIdentidad', 'id_documento_identidad') || '').trim();
    const mappedLabel = documentTypeId ? resolveCatalogLabel(documentTypeId, labelMaps.documentTypeById) : '';
    return String(
        mappedLabel
        || customer.documentTypeName
        || customer.documentTypeLabel
        || customer.document_type_label
        || customer.documentType
        || customer.document_type
        || customer?.profile?.documentTypeLabel
        || customer?.profile?.documentTypeId
        || '-'
    ).trim() || '-';
}

function buildDocumentNumber(customer = null) {
    if (!customer || typeof customer !== 'object') return '-';
    const profile = customer?.profile && typeof customer.profile === 'object' ? customer.profile : {};
    return String(
        customer.documentNumber
        || customer.document_number
        || readProfileValue(profile, 'documentNumber', 'numeroDocumentoIdentidad', 'document_number')
        || '-'
    ).trim() || '-';
}

function buildLanguageLabel(customer = null) {
    const value = normalizePreferredLanguage(customer);
    if (value === 'en') return 'Ingles';
    if (value === 'pt') return 'Portugues';
    return 'Espanol';
}

function buildAcquisitionSourceLabel(customer = null, labelMaps = {}) {
    if (!customer || typeof customer !== 'object') return '-';
    const profile = customer?.profile && typeof customer.profile === 'object' ? customer.profile : {};
    const sourceId = String(
        customer.acquisitionSourceId
        || customer.acquisition_source_id
        || customer.sourceId
        || customer.source_id
        || readProfileValue(profile, 'sourceId', 'idFuenteCliente', 'id_fuente_cliente')
        || ''
    ).trim();
    const mappedLabel = sourceId ? resolveCatalogLabel(sourceId, labelMaps.sourceById) : '';
    return String(
        mappedLabel
        || customer.acquisitionSourceName
        || customer.acquisitionSourceLabel
        || customer.acquisition_source_label
        || customer.sourceLabel
        || customer.source_label
        || customer.sourceId
        || customer.source_id
        || customer?.profile?.sourceLabel
        || customer?.profile?.sourceId
        || '-'
    ).trim() || '-';
}

function buildTreatmentLabel(customer = null, labelMaps = {}) {
    if (!customer || typeof customer !== 'object') return '-';
    const profile = customer?.profile && typeof customer.profile === 'object' ? customer.profile : {};
    const treatmentId = String(
        customer.treatmentId
        || customer.treatment_id
        || readProfileValue(profile, 'treatmentId', 'idTratamientoCliente', 'id_tratamiento_cliente')
        || ''
    ).trim();
    const mappedLabel = treatmentId ? resolveCatalogLabel(treatmentId, labelMaps.treatmentById) : '';
    return String(
        mappedLabel
        || customer.treatmentName
        || customer.treatmentLabel
        || customer.treatment_label
        || customer.treatmentId
        || customer.treatment_id
        || customer?.profile?.treatmentLabel
        || customer?.profile?.treatmentId
        || '-'
    ).trim() || '-';
}

function resolveUpdatedAtTimestamp(item = null) {
    if (!item || typeof item !== 'object') return 0;
    const raw = String(item.updatedAt || item.updated_at || '').trim();
    if (!raw) return 0;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeModuleLookupId(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizePhoneLookupDigits(value = '') {
    return String(value || '').replace(/\D+/g, '');
}

function extractCustomerModuleCandidates(customer = null) {
    if (!customer || typeof customer !== 'object') return [];
    const rawCandidates = [
        customer.moduleId,
        customer.module_id,
        customer?.metadata?.moduleId,
        customer?.metadata?.module_id,
        customer?.profile?.moduleId,
        customer?.profile?.module_id,
        customer?.metadata?.moduleIds,
        customer?.metadata?.module_ids,
        customer?.metadata?.assignedModules,
        customer?.metadata?.assigned_modules,
        customer?.profile?.moduleIds,
        customer?.profile?.module_ids
    ].filter(Boolean);

    return rawCandidates.flatMap((value) => {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') {
            return [
                value.moduleId,
                value.module_id,
                value.id
            ];
        }
        return [value];
    });
}

function customerBelongsToModule(customer = null, moduleId = '') {
    if (!customer || typeof customer !== 'object') return false;
    const target = normalizeModuleLookupId(moduleId);
    if (!target) return false;

    const candidates = extractCustomerModuleCandidates(customer);
    return candidates.some((value) => normalizeModuleLookupId(value) === target);
}

function extractPhoneCandidatesFromChatEvent(payload = null) {
    if (!payload || typeof payload !== 'object') return [];
    const source = payload;
    const rawValues = [
        source.senderPhone,
        source.phone,
        source.phoneE164,
        source.phone_e164,
        source.notifyPhone,
        source.from,
        source.to,
        source.chatId,
        source.baseChatId,
        source?.contact?.phone,
        source?.contact?.phoneE164,
        source?.contact?.phone_e164
    ];

    return rawValues
        .map((value) => {
            const clean = String(value || '').trim();
            if (!clean) return '';
            const base = clean.split('@')[0] || clean;
            return normalizePhoneLookupDigits(base);
        })
        .filter(Boolean);
}

function customerMatchesAnyPhone(customer = null, phoneCandidates = []) {
    if (!customer || typeof customer !== 'object') return false;
    const targetSet = new Set((Array.isArray(phoneCandidates) ? phoneCandidates : []).filter(Boolean));
    if (!targetSet.size) return false;

    const customerPhones = [
        customer.phone,
        customer.phoneE164,
        customer.phone_e164,
        customer.mobilePhone,
        customer.mobile_phone,
        customer.whatsappPhone,
        customer.whatsapp_phone,
        customer?.profile?.phone,
        customer?.profile?.phoneE164,
        customer?.profile?.phone_e164
    ]
        .map((value) => normalizePhoneLookupDigits(value))
        .filter(Boolean);

    return customerPhones.some((value) => targetSet.has(value));
}

function buildImportErrorsCsv(errors = []) {
    const rows = [['fila', 'erp_id', 'campo', 'motivo']];
    (Array.isArray(errors) ? errors : []).forEach((item = {}) => {
        rows.push([
            String(item?.row ?? '').trim(),
            String(item?.erp_id ?? '').trim(),
            String(item?.field ?? '').trim(),
            String(item?.message ?? item?.motivo ?? '').trim()
        ]);
    });
    return rows.map((row) => row.map((cell) => {
        const value = String(cell ?? '');
        if (/[",\n]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }).join(',')).join('\n');
}

function CustomersSection(props = {}) {
    const { confirm, notify } = useUiFeedback();
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isCustomersSection,
        filteredCustomers,
        busy,
        tenantScopeLocked,
        openCustomerCreate,
        customerSearch,
        setCustomerSearch,
        selectedCustomerId,
        customerPanelMode,
        openCustomerView,
        selectedCustomer: selectedCustomerContext,
        runAction,
        requestJson,
        socket,
        tenantScopeId,
        loadCustomers,
        syncCustomersDelta,
        maxCustomersUpdatedAt,
        patchCustomerInCache,
        customersLoadProgress = 0,
        customersLoadingBatch = false,
        formatDateTimeLabel,
        customerForm,
        setCustomerForm,
        setCustomers,
        waModules,
        buildCustomerPayloadFromForm,
        setSelectedCustomerId,
        setCustomerPanelMode,
        cancelCustomerEdit
    } = context;

    const [showColumnsMenu, setShowColumnsMenu] = useState(false);
    const [searchInput, setSearchInput] = useState(String(customerSearch || ''));
    const [headerFilters, setHeaderFilters] = useState([{ id: 'customers_filter_1', columnKey: '', operator: 'contains', value: '' }]);
    const [sortConfig, setSortConfig] = useState(CUSTOMER_DEFAULT_SORT);
    const [languageDraftByCustomer, setLanguageDraftByCustomer] = useState({});
    const [languageBusy, setLanguageBusy] = useState(false);
    const [moduleContexts, setModuleContexts] = useState([]);
    const [moduleContextsLoading, setModuleContextsLoading] = useState(false);
    const [moduleContextsError, setModuleContextsError] = useState('');
    const [moduleConsentDraftByModuleId, setModuleConsentDraftByModuleId] = useState({});
    const [moduleConsentBusyByModuleId, setModuleConsentBusyByModuleId] = useState({});
    const [editClickBusy, setEditClickBusy] = useState(false);
    const [customerAddresses, setCustomerAddresses] = useState([]);
    const [addressesLoading, setAddressesLoading] = useState(false);
    const [addressesError, setAddressesError] = useState('');
    const [selectedAddressId, setSelectedAddressId] = useState('');
    const [addressPanelMode, setAddressPanelMode] = useState('customer');
    const [addressEditorMode, setAddressEditorMode] = useState('create');
    const [addressEditorOpen, setAddressEditorOpen] = useState(false);
    const [addressBusy, setAddressBusy] = useState(false);
    const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
    const [customerCatalogs, setCustomerCatalogs] = useState(EMPTY_CUSTOMER_CATALOGS);
    const [loadingCustomerCatalogs, setLoadingCustomerCatalogs] = useState(false);
    const [customerCatalogsError, setCustomerCatalogsError] = useState('');
    const [geoCatalog, setGeoCatalog] = useState(EMPTY_GEO_CATALOG);
    const [loadingGeoCatalog, setLoadingGeoCatalog] = useState(false);
    const [geoCatalogError, setGeoCatalogError] = useState('');
    const [savingCustomer, setSavingCustomer] = useState(false);
    const [selectedCustomerLive, setSelectedCustomerLive] = useState(selectedCustomerContext || null);
    const [customerOverridesById, setCustomerOverridesById] = useState({});
    const [showCustomerSynced, setShowCustomerSynced] = useState(false);
    const [campaignSelectionMode, setCampaignSelectionMode] = useState(false);
    const [selectedCustomerIdsForCampaign, setSelectedCustomerIdsForCampaign] = useState([]);
    const [outreachModuleId, setOutreachModuleId] = useState('');
    const [outreachMode, setOutreachMode] = useState('eligible');
    const [outreachEligibilityLoading, setOutreachEligibilityLoading] = useState(false);
    const [outreachEligibilityError, setOutreachEligibilityError] = useState('');
    const [outreachEligibleCustomerIds, setOutreachEligibleCustomerIds] = useState([]);
    const [outreachNonEligibleCustomerIds, setOutreachNonEligibleCustomerIds] = useState([]);
    const [sendTemplateOpen, setSendTemplateOpen] = useState(false);
    const [sendTemplateOptions, setSendTemplateOptions] = useState([]);
    const [sendTemplateOptionsLoading, setSendTemplateOptionsLoading] = useState(false);
    const [sendTemplateOptionsError, setSendTemplateOptionsError] = useState('');
    const [selectedSendTemplate, setSelectedSendTemplate] = useState(null);
    const [selectedSendTemplatePreview, setSelectedSendTemplatePreview] = useState(null);
    const [selectedSendTemplatePreviewLoading, setSelectedSendTemplatePreviewLoading] = useState(false);
    const [selectedSendTemplatePreviewError, setSelectedSendTemplatePreviewError] = useState('');
    const [sendTemplateSubmitting, setSendTemplateSubmitting] = useState(false);
    const [campaignTemplateModalOpen, setCampaignTemplateModalOpen] = useState(false);
    const [campaignTemplateOptions, setCampaignTemplateOptions] = useState([]);
    const [campaignTemplateOptionsLoading, setCampaignTemplateOptionsLoading] = useState(false);
    const [campaignTemplateOptionsError, setCampaignTemplateOptionsError] = useState('');
    const [selectedCampaignTemplate, setSelectedCampaignTemplate] = useState(null);
    const [selectedCampaignTemplatePreview, setSelectedCampaignTemplatePreview] = useState(null);
    const [selectedCampaignTemplatePreviewLoading, setSelectedCampaignTemplatePreviewLoading] = useState(false);
    const [selectedCampaignTemplatePreviewError, setSelectedCampaignTemplatePreviewError] = useState('');
    const [campaignTemplateSubmitting, setCampaignTemplateSubmitting] = useState(false);
    const [zoneRules, setZoneRules] = useState([]);
    const [customerZoneLabels, setCustomerZoneLabels] = useState([]);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importStep, setImportStep] = useState(1);
    const [importFileClientes, setImportFileClientes] = useState(null);
    const [importFileDirecciones, setImportFileDirecciones] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [importResult, setImportResult] = useState(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importModuleId, setImportModuleId] = useState('');
    const [showAllImportErrors, setShowAllImportErrors] = useState(false);
    const syncedIndicatorTimeoutRef = useRef(null);
    const customersRealtimeSyncTimeoutRef = useRef(null);
    const customersRealtimeSyncInFlightRef = useRef(false);

    const defaultColumnKeys = useMemo(() => CUSTOMER_DEFAULT_COLUMN_KEYS, []);
    const columnPrefs = useSaasColumnPrefs('customers', defaultColumnKeys, {
        requestJson,
        availableColumns: CUSTOMER_TABLE_COLUMNS
    });

    useEffect(() => {
        setSelectedCustomerLive((prev) => {
            if (!selectedCustomerContext) return null;
            if (!prev) return selectedCustomerContext;

            const prevId = resolveCustomerId(prev);
            const nextId = resolveCustomerId(selectedCustomerContext);
            if (
                prevId
                && nextId
                && normalizeCatalogLookupKey(prevId) !== normalizeCatalogLookupKey(nextId)
            ) {
                return selectedCustomerContext;
            }

            const prevTs = resolveUpdatedAtTimestamp(prev);
            const nextTs = resolveUpdatedAtTimestamp(selectedCustomerContext);
            if (!prevTs && nextTs) return selectedCustomerContext;
            if (nextTs >= prevTs && nextTs > 0) return selectedCustomerContext;
            return prev;
        });
    }, [selectedCustomerContext]);

    useEffect(() => {
        return () => {
            if (syncedIndicatorTimeoutRef.current) {
                clearTimeout(syncedIndicatorTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!showImportModal) return;
        if (importModuleId) return;
        const defaultModuleId = String(outreachModuleOptions?.[0]?.moduleId || '').trim();
        if (defaultModuleId) {
            setImportModuleId(defaultModuleId);
        }
    }, [importModuleId, outreachModuleOptions, showImportModal]);

    const getCustomerOverride = useCallback((customerId = '') => {
        const normalizedId = normalizeCatalogLookupKey(customerId);
        if (!normalizedId) return null;
        const found = customerOverridesById[normalizedId];
        return found && typeof found === 'object' ? found : null;
    }, [customerOverridesById]);

    const selectedCustomer = useMemo(
        () => {
            const base = selectedCustomerLive || selectedCustomerContext || null;
            const selectedId = resolveCustomerId(base) || selectedCustomerId || '';
            const override = getCustomerOverride(selectedId);
            return override || base;
        },
        [getCustomerOverride, selectedCustomerContext, selectedCustomerId, selectedCustomerLive]
    );

    const selectedCustomerIdResolved = useMemo(() => resolveCustomerId(selectedCustomer), [selectedCustomer]);
    const selectedCustomerPhone = useMemo(
        () => String(selectedCustomer?.phoneE164 || selectedCustomer?.phone || '').trim(),
        [selectedCustomer]
    );
    const profileAddresses = useMemo(
        () => buildProfileAddressesFromCustomer(selectedCustomer),
        [selectedCustomer]
    );
    const effectiveAddresses = useMemo(
        () => (customerAddresses.length > 0 ? customerAddresses : profileAddresses),
        [customerAddresses, profileAddresses]
    );
    const selectedAddress = useMemo(() => {
        const selectedId = String(selectedAddressId || '').trim();
        if (!selectedId) return null;
        return effectiveAddresses.find((item) => String(item?.addressId || '').trim() === selectedId) || null;
    }, [effectiveAddresses, selectedAddressId]);

    const selectedPreferredLanguage = useMemo(() => {
        if (!selectedCustomerIdResolved) return normalizePreferredLanguage(selectedCustomer);
        const draft = String(languageDraftByCustomer[selectedCustomerIdResolved] || '').trim().toLowerCase();
        if (draft) return draft;
        return normalizePreferredLanguage(selectedCustomer);
    }, [selectedCustomer, selectedCustomerIdResolved, languageDraftByCustomer]);

    const moduleNameById = useMemo(() => {
        const map = {};
        (Array.isArray(waModules) ? waModules : []).forEach((moduleItem = {}) => {
            const moduleId = String(moduleItem.moduleId || moduleItem.module_id || '').trim().toLowerCase();
            if (!moduleId) return;
            map[moduleId] = String(moduleItem.name || moduleItem.module_name || moduleId).trim() || moduleId;
        });
        return map;
    }, [waModules]);
    const outreachModuleOptions = useMemo(
        () => (Array.isArray(waModules) ? waModules : [])
            .map((moduleItem = {}) => ({
                moduleId: String(moduleItem.moduleId || moduleItem.module_id || '').trim().toLowerCase(),
                label: String(moduleItem.name || moduleItem.module_name || moduleItem.moduleId || '').trim()
            }))
            .filter((moduleItem) => moduleItem.moduleId),
        [waModules]
    );
    const importErrorsVisible = useMemo(() => {
        const items = Array.isArray(importPreview?.errors) ? importPreview.errors : [];
        return showAllImportErrors ? items : items.slice(0, 10);
    }, [importPreview?.errors, showAllImportErrors]);
    const selectedCustomerPreferredModuleIds = useMemo(
        () => Array.from(new Set(
            (Array.isArray(moduleContexts) ? moduleContexts : [])
                .map((item) => String(item?.moduleId || '').trim())
                .filter(Boolean)
        )),
        [moduleContexts]
    );

    const customerTypeOptions = useMemo(
        () => normalizeCatalogItems(customerCatalogs.customerTypes),
        [customerCatalogs.customerTypes]
    );
    const documentTypeOptions = useMemo(
        () => normalizeCatalogItems(customerCatalogs.documentTypes),
        [customerCatalogs.documentTypes]
    );
    const treatmentOptions = useMemo(
        () => normalizeCatalogItems(customerCatalogs.treatments),
        [customerCatalogs.treatments]
    );
    const sourceOptions = useMemo(
        () => normalizeCatalogItems(customerCatalogs.acquisitionSources),
        [customerCatalogs.acquisitionSources]
    );
    const customerLabelMaps = useMemo(() => ({
        customerTypeById: buildCatalogLabelMap(customerTypeOptions),
        documentTypeById: buildCatalogLabelMap(documentTypeOptions, 'abbreviation'),
        treatmentById: buildCatalogLabelMap(treatmentOptions, 'abbreviation'),
        sourceById: buildCatalogLabelMap(sourceOptions)
    }), [customerTypeOptions, documentTypeOptions, treatmentOptions, sourceOptions]);
    const geoDepartmentOptions = useMemo(
        () => normalizeGeoCatalogItems(geoCatalog.departments, 'department'),
        [geoCatalog.departments]
    );
    const geoProvinceOptionsAll = useMemo(
        () => normalizeGeoCatalogItems(geoCatalog.provinces, 'province'),
        [geoCatalog.provinces]
    );
    const geoDistrictOptionsAll = useMemo(
        () => normalizeGeoCatalogItems(geoCatalog.districts, 'district'),
        [geoCatalog.districts]
    );
    const geoProvinceById = useMemo(() => {
        const map = new Map();
        geoProvinceOptionsAll.forEach((entry) => map.set(String(entry.id || '').trim(), entry));
        return map;
    }, [geoProvinceOptionsAll]);
    const geoDepartmentById = useMemo(() => {
        const map = new Map();
        geoDepartmentOptions.forEach((entry) => map.set(String(entry.id || '').trim(), entry));
        return map;
    }, [geoDepartmentOptions]);
    const geoDistrictById = useMemo(() => {
        const map = new Map();
        geoDistrictOptionsAll.forEach((entry) => map.set(String(entry.id || '').trim(), entry));
        return map;
    }, [geoDistrictOptionsAll]);
    const geoDepartmentByName = useMemo(() => {
        const map = new Map();
        geoDepartmentOptions.forEach((entry) => {
            const key = normalizeGeoNameKey(entry?.name || '');
            if (!key) return;
            map.set(key, entry);
        });
        return map;
    }, [geoDepartmentOptions]);
    const geoProvinceByName = useMemo(() => {
        const map = new Map();
        geoProvinceOptionsAll.forEach((entry) => {
            const key = normalizeGeoNameKey(entry?.name || '');
            if (!key) return;
            const list = map.get(key) || [];
            list.push(entry);
            map.set(key, list);
        });
        return map;
    }, [geoProvinceOptionsAll]);
    const geoDistrictByName = useMemo(() => {
        const map = new Map();
        geoDistrictOptionsAll.forEach((entry) => {
            const key = normalizeGeoNameKey(entry?.name || '');
            if (!key) return;
            const list = map.get(key) || [];
            list.push(entry);
            map.set(key, list);
        });
        return map;
    }, [geoDistrictOptionsAll]);

    const zoneOptions = useMemo(() => (
        (Array.isArray(zoneRules) ? zoneRules : [])
            .filter((item) => item?.isActive !== false)
            .map((item) => ({
                value: String(item?.ruleId || item?.rule_id || '').trim().toUpperCase(),
                label: String(item?.name || '').trim()
            }))
            .filter((item) => item.value && item.label)
            .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
    ), [zoneRules]);

    const zoneNameById = useMemo(() => {
        const map = new Map();
        zoneOptions.forEach((item) => map.set(item.value, item.label));
        return map;
    }, [zoneOptions]);

    const zoneByCustomerId = useMemo(() => {
        const map = new Map();
        (Array.isArray(customerZoneLabels) ? customerZoneLabels : []).forEach((assignment = {}) => {
            const source = String(assignment.source || '').trim().toLowerCase();
            if (source && source !== 'zone') return;
            const customerId = String(assignment.customerId || assignment.customer_id || '').trim();
            const labelId = String(assignment.labelId || assignment.label_id || '').trim().toUpperCase();
            if (!customerId || !labelId) return;
            const label = zoneNameById.get(labelId);
            if (!label) return;
            map.set(customerId, { labelId, label });
        });
        return map;
    }, [customerZoneLabels, zoneNameById]);
    const addressProvinceOptions = useMemo(() => {
        const departmentId = normalizeGeoNumericId(addressForm.departmentId || '');
        if (!departmentId) return [];
        return geoProvinceOptionsAll.filter((entry) => String(entry.departmentId || '').trim() === departmentId);
    }, [addressForm.departmentId, geoProvinceOptionsAll]);
    const addressDistrictOptions = useMemo(() => {
        const provinceId = normalizeGeoNumericId(addressForm.provinceId || '');
        if (!provinceId) return [];
        return geoDistrictOptionsAll.filter((entry) => String(entry.provinceId || '').trim() === provinceId);
    }, [addressForm.provinceId, geoDistrictOptionsAll]);

    const firstNameValue = String(
        customerForm?.first_name
        ?? customerForm?.firstName
        ?? customerForm?.profileFirstNames
        ?? ''
    );
    const lastNamePaternalValue = String(
        customerForm?.last_name_paternal
        ?? customerForm?.lastNamePaternal
        ?? customerForm?.profileLastNamePaternal
        ?? ''
    );
    const lastNameMaternalValue = String(
        customerForm?.last_name_maternal
        ?? customerForm?.lastNameMaternal
        ?? customerForm?.profileLastNameMaternal
        ?? ''
    );
    const documentNumberValue = String(
        customerForm?.document_number
        ?? customerForm?.documentNumber
        ?? customerForm?.profileDocumentNumber
        ?? ''
    );
    const notesValue = String(
        customerForm?.notes
        ?? customerForm?.profileNotes
        ?? ''
    );
    const formPreferredLanguageValue = useMemo(() => {
        const direct = String(customerForm?.preferredLanguage || customerForm?.preferred_language || '').trim().toLowerCase();
        if (direct === 'en' || direct === 'pt' || direct === 'es') return direct;
        if (selectedCustomer && customerPanelMode !== 'create') return normalizePreferredLanguage(selectedCustomer);
        return 'es';
    }, [customerForm?.preferredLanguage, customerForm?.preferred_language, customerPanelMode, selectedCustomer]);

    const customerFormBaseline = useMemo(() => {
        if (customerPanelMode === 'create') {
            return serializeCustomerFormForDirty({
                contactName: '',
                phoneE164: '',
                phoneAlt: '',
                email: '',
                tagsText: '',
                isActive: true,
                treatmentId: '',
                firstName: '',
                lastNamePaternal: '',
                lastNameMaternal: '',
                documentTypeId: '',
                documentNumber: '',
                customerTypeId: '',
                acquisitionSourceId: '',
                notes: '',
                preferredLanguage: 'es'
            });
        }
        if (selectedCustomer) {
            return serializeCustomerFormForDirty({
                ...normalizeCustomerFormFromItem(selectedCustomer),
                preferredLanguage: normalizePreferredLanguage(selectedCustomer)
            });
        }
        return '';
    }, [customerPanelMode, selectedCustomer]);

    const customerFormDraft = useMemo(() => {
        return serializeCustomerFormForDirty({
            ...customerForm,
            firstName: firstNameValue,
            lastNamePaternal: lastNamePaternalValue,
            lastNameMaternal: lastNameMaternalValue,
            documentNumber: documentNumberValue,
            notes: notesValue,
            preferredLanguage: formPreferredLanguageValue
        });
    }, [
        customerForm,
        documentNumberValue,
        firstNameValue,
        formPreferredLanguageValue,
        lastNameMaternalValue,
        lastNamePaternalValue,
        notesValue
    ]);

    const isCustomerFormDirty = useMemo(() => {
        if (customerPanelMode !== 'create' && customerPanelMode !== 'edit') return false;
        return customerFormDraft !== customerFormBaseline;
    }, [customerFormBaseline, customerFormDraft, customerPanelMode]);

    const addressFormBaseline = useMemo(() => {
        if (addressEditorMode === 'edit' && selectedAddress) {
            return serializeAddressFormForDirty(buildAddressFormFromRecord(selectedAddress));
        }
        return serializeAddressFormForDirty(EMPTY_ADDRESS_FORM);
    }, [addressEditorMode, selectedAddress]);

    const addressFormDraft = useMemo(
        () => serializeAddressFormForDirty(addressForm),
        [addressForm]
    );

    const isAddressFormDirty = useMemo(() => {
        if (addressPanelMode !== 'address-edit') return false;
        return addressFormDraft !== addressFormBaseline;
    }, [addressFormBaseline, addressFormDraft, addressPanelMode]);

    useEffect(() => {
        if (customerPanelMode !== 'create') return;
        if (String(customerForm?.preferredLanguage || customerForm?.preferred_language || '').trim()) return;
        setCustomerForm((prev) => ({
            ...prev,
            preferredLanguage: 'es'
        }));
    }, [customerForm?.preferredLanguage, customerForm?.preferred_language, customerPanelMode, setCustomerForm]);

    const selectedCustomerIdsForCampaignSet = useMemo(
        () => new Set((Array.isArray(selectedCustomerIdsForCampaign) ? selectedCustomerIdsForCampaign : []).map((item) => String(item || '').trim()).filter(Boolean)),
        [selectedCustomerIdsForCampaign]
    );
    const outreachEligibleCustomerIdsSet = useMemo(
        () => new Set((Array.isArray(outreachEligibleCustomerIds) ? outreachEligibleCustomerIds : []).map((item) => String(item || '').trim()).filter(Boolean)),
        [outreachEligibleCustomerIds]
    );
    const outreachNonEligibleCustomerIdsSet = useMemo(
        () => new Set((Array.isArray(outreachNonEligibleCustomerIds) ? outreachNonEligibleCustomerIds : []).map((item) => String(item || '').trim()).filter(Boolean)),
        [outreachNonEligibleCustomerIds]
    );
    const filteredCustomersLive = useMemo(() => {
        const source = Array.isArray(filteredCustomers) ? filteredCustomers : [];
        return source.map((item) => {
            const itemId = resolveCustomerId(item);
            if (!itemId) return item;
            const override = getCustomerOverride(itemId);
            return override || item;
        });
    }, [filteredCustomers, getCustomerOverride]);
    const outreachFilteredCustomers = useMemo(() => {
        const source = Array.isArray(filteredCustomersLive) ? filteredCustomersLive : [];
        if (!campaignSelectionMode || !outreachModuleId) return source;
        if (outreachMode === 'assign') {
            return source.filter((item) => outreachNonEligibleCustomerIdsSet.has(resolveCustomerId(item)));
        }
        return source.filter((item) => outreachEligibleCustomerIdsSet.has(resolveCustomerId(item)));
    }, [
        campaignSelectionMode,
        filteredCustomersLive,
        outreachEligibleCustomerIdsSet,
        outreachMode,
        outreachModuleId,
        outreachNonEligibleCustomerIdsSet
    ]);
    const campaignSelectableCustomerIds = useMemo(
        () => {
            const source = Array.isArray(filteredCustomersLive) ? filteredCustomersLive : [];
            const scoped = (!campaignSelectionMode || !outreachModuleId)
                ? source
                : (outreachMode === 'assign'
                    ? source.filter((item) => outreachNonEligibleCustomerIdsSet.has(resolveCustomerId(item)))
                    : source.filter((item) => outreachEligibleCustomerIdsSet.has(resolveCustomerId(item))));
            return scoped.map((item) => resolveCustomerId(item)).filter(Boolean);
        },
        [
            campaignSelectionMode,
            filteredCustomersLive,
            outreachEligibleCustomerIdsSet,
            outreachMode,
            outreachModuleId,
            outreachNonEligibleCustomerIdsSet
        ]
    );
    const allCampaignSelectableCustomersSelected = useMemo(
        () => campaignSelectableCustomerIds.length > 0 && campaignSelectableCustomerIds.every((customerId) => selectedCustomerIdsForCampaignSet.has(customerId)),
        [campaignSelectableCustomerIds, selectedCustomerIdsForCampaignSet]
    );

    const tableColumns = useMemo(
        () => ([
            ...(campaignSelectionMode ? [{
                key: 'selectForCampaign',
                configurable: false,
                sortable: false,
                label: (
                    <span className="saas-customers-select-cell">
                        <input
                            type="checkbox"
                            checked={allCampaignSelectableCustomersSelected}
                            onChange={() => {
                                setSelectedCustomerIdsForCampaign((prev) => {
                                    const current = new Set((Array.isArray(prev) ? prev : []).map((item) => String(item || '').trim()).filter(Boolean));
                                    if (campaignSelectableCustomerIds.length > 0 && campaignSelectableCustomerIds.every((customerId) => current.has(customerId))) {
                                        campaignSelectableCustomerIds.forEach((customerId) => current.delete(customerId));
                                    } else {
                                        campaignSelectableCustomerIds.forEach((customerId) => current.add(customerId));
                                    }
                                    return Array.from(current);
                                });
                            }}
                            onClick={(event) => event.stopPropagation()}
                            aria-label="Seleccionar clientes visibles para campaña"
                        />
                    </span>
                ),
                width: '54px',
                minWidth: '54px',
                maxWidth: '54px',
                align: 'center',
                render: (_, row) => {
                    const customerId = String(row?._raw?.customerId || row?.id || '').trim();
                    const checked = selectedCustomerIdsForCampaignSet.has(customerId);
                    return (
                        <span className="saas-customers-select-cell">
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                    setSelectedCustomerIdsForCampaign((prev) => {
                                        const current = Array.isArray(prev) ? prev : [];
                                        if (current.includes(customerId)) {
                                            return current.filter((item) => item !== customerId);
                                        }
                                        return [...current, customerId];
                                    });
                                }}
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Seleccionar ${String(row?.nombreCompleto || customerId || 'cliente')}`}
                            />
                        </span>
                    );
                }
            }] : []),
            ...CUSTOMER_TABLE_COLUMNS.map((column) => ({
                ...column,
                hidden: !columnPrefs.isColumnVisible(column.key)
            }))
        ]),
        [
            campaignSelectionMode,
            allCampaignSelectableCustomersSelected,
            campaignSelectableCustomerIds,
            columnPrefs,
            columnPrefs.visibleColumnKeys,
            selectedCustomerIdsForCampaignSet
        ]
    );

    const tableRows = useMemo(() => {
        const source = Array.isArray(outreachFilteredCustomers) ? outreachFilteredCustomers : [];
        return source.map((customer = {}, index) => {
            const customerId = resolveCustomerId(customer);
            const safeId = customerId || String(customer.phoneE164 || customer.phone_e164 || customer.email || `customer-${index}`).trim();
            const nameParts = buildNamePartsFromCustomer(customer);
            const tags = Array.isArray(customer?.tags) ? customer.tags : [];
            const zone = zoneByCustomerId.get(customerId);
            return {
                id: safeId,
                codigo: customerId || '-',
                nombreCompleto: buildCustomerDisplayName(customer),
                nombres: nameParts.firstName || '-',
                apellidoPaterno: nameParts.lastNamePaternal || '-',
                apellidoMaterno: nameParts.lastNameMaternal || '-',
                telefono: String(customer.phoneE164 || customer.phone_e164 || '-').trim() || '-',
                telefonoAlt: String(customer.phoneAlt || customer.phone_alt || '-').trim() || '-',
                email: String(customer.email || '-').trim() || '-',
                tipoCliente: buildCustomerTypeLabel(customer, customerLabelMaps),
                tipoDocumento: buildDocumentTypeLabel(customer, customerLabelMaps),
                documento: buildDocumentNumber(customer),
                idioma: buildLanguageLabel(customer),
                fuenteAdquisicion: buildAcquisitionSourceLabel(customer, customerLabelMaps),
                tratamiento: buildTreatmentLabel(customer, customerLabelMaps),
                zona: zone?.label || '-',
                etiquetas: tags.length ? tags.join(', ') : '-',
                estadoComercial: String(customer.commercialStatus || customer.commercial_status || '-').trim() || '-',
                ultimaInteraccion: formatDateTimeLabel(customer.lastInteractionAt || customer.last_interaction_at || ''),
                actualizado: formatDateTimeLabel(customer.updatedAt || customer.updated_at || ''),
                estado: customer.isActive === false ? 'Inactivo' : 'Activo',
                _raw: customer
            };
        });
    }, [customerLabelMaps, formatDateTimeLabel, outreachFilteredCustomers, zoneByCustomerId]);

    const visibleColumns = useMemo(
        () => tableColumns.filter((column) => column && column.hidden !== true),
        [tableColumns]
    );
    const filterColumns = useMemo(() => (
        CUSTOMER_TABLE_COLUMNS.map((column) => {
            if (column.key === 'tipoCliente') return { ...column, options: customerTypeOptions };
            if (column.key === 'tipoDocumento') return { ...column, options: documentTypeOptions };
            if (column.key === 'fuenteAdquisicion') return { ...column, options: sourceOptions };
            if (column.key === 'tratamiento') return { ...column, options: treatmentOptions };
            if (column.key === 'zona') return { ...column, options: zoneOptions };
            if (column.key === 'estadoComercial') return {
                ...column,
                options: [
                    { value: 'nuevo', label: 'Nuevo' },
                    { value: 'en_conversacion', label: 'En conversación' },
                    { value: 'cotizado', label: 'Cotizado' },
                    { value: 'vendido', label: 'Vendido' },
                    { value: 'perdido', label: 'Perdido' }
                ]
            };
            if (column.key === 'idioma') return {
                ...column,
                options: [
                    { value: 'Espanol', label: 'Espanol' },
                    { value: 'Ingles', label: 'Ingles' },
                    { value: 'Portugues', label: 'Portugues' }
                ]
            };
            if (column.key === 'estado') return {
                ...column,
                options: [
                    { value: 'Activo', label: 'Activo' },
                    { value: 'Inactivo', label: 'Inactivo' }
                ]
            };
            return { ...column };
        })
    ), [customerTypeOptions, documentTypeOptions, sourceOptions, treatmentOptions, zoneOptions]);
    const filterColumnByKey = useMemo(
        () => filterColumns.reduce((acc, column) => {
            acc[String(column.key || '').trim()] = column;
            return acc;
        }, {}),
        [filterColumns]
    );

    const sortedAndFilteredRows = useMemo(() => {
        const sourceRows = Array.isArray(tableRows) ? [...tableRows] : [];
        const toDateTimestamp = (value) => {
            const raw = String(value || '').trim();
            if (!raw || raw === '-') return NaN;
            const parsed = new Date(raw);
            if (Number.isNaN(parsed.getTime())) return NaN;
            return parsed.getTime();
        };
        const toNumberValue = (value) => {
            const text = String(value ?? '').replace(/,/g, '.').replace(/[^\d.-]/g, '').trim();
            const parsed = Number(text);
            return Number.isFinite(parsed) ? parsed : NaN;
        };

        const matchValue = (candidateValueRaw, filterItem = {}) => {
            const filterColumnKey = String(filterItem?.columnKey || '').trim();
            const filterOperator = String(filterItem?.operator || 'contains').trim().toLowerCase();
            const filterValue = String(filterItem?.value || '').trim().toLowerCase();
            const filterColumnType = String(filterColumnByKey[filterColumnKey]?.type || 'text').trim().toLowerCase();
            const candidateValue = String(candidateValueRaw ?? '').trim().toLowerCase();
            if (!filterColumnKey) return true;
            if (filterOperator === 'is_empty') return candidateValue.length === 0 || candidateValue === '-';
            if (filterOperator === 'not_empty') return candidateValue.length > 0 && candidateValue !== '-';
            if (!filterValue) return true;
            if (filterOperator === 'not_equals') return candidateValue !== filterValue;
            if (filterColumnType === 'number') {
                const left = toNumberValue(candidateValueRaw);
                const right = toNumberValue(filterValue);
                if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
                if (filterOperator === 'gt') return left > right;
                if (filterOperator === 'gte') return left >= right;
                if (filterOperator === 'lt') return left < right;
                if (filterOperator === 'lte') return left <= right;
                return left === right;
            }
            if (filterColumnType === 'date') {
                const left = toDateTimestamp(candidateValueRaw);
                const right = toDateTimestamp(filterValue);
                if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
                if (filterOperator === 'before') return left < right;
                if (filterOperator === 'after') return left > right;
                const leftDate = new Date(left).toISOString().slice(0, 10);
                const rightDate = new Date(right).toISOString().slice(0, 10);
                return leftDate === rightDate;
            }
            if (filterOperator === 'equals') return candidateValue === filterValue;
            if (filterOperator === 'starts_with') return candidateValue.startsWith(filterValue);
            if (filterOperator === 'ends_with') return candidateValue.endsWith(filterValue);
            return candidateValue.includes(filterValue);
        };

        const activeHeaderFilters = (Array.isArray(headerFilters) ? headerFilters : []).filter((filterItem) => {
            const columnKey = String(filterItem?.columnKey || '').trim();
            const operator = String(filterItem?.operator || 'contains').trim().toLowerCase();
            if (!columnKey) return false;
            if (operator === 'is_empty' || operator === 'not_empty') return true;
            return Boolean(String(filterItem?.value || '').trim());
        });

        const filteredRows = activeHeaderFilters.reduce((currentRows, filterItem) => {
            const filterColumnKey = String(filterItem?.columnKey || '').trim();
            return currentRows.filter((row) => {
                if (filterColumnKey === 'actualizado') return matchValue(row?._raw?.updatedAt || row?.actualizado, filterItem);
                if (filterColumnKey === 'ultimaInteraccion') return matchValue(row?._raw?.lastInteractionAt || row?.ultimaInteraccion, filterItem);
                return matchValue(row?.[filterColumnKey], filterItem);
            });
        }, sourceRows);

        const activeSortItems = normalizeSortState(sortConfig).activeItems;
        if (activeSortItems.length === 0) return filteredRows;

        const resolveSortValue = (row, sortColumnKey) => {
            if (sortColumnKey === 'actualizado') {
                return String(row?._raw?.updatedAt || row?.actualizado || '').trim();
            }
            if (sortColumnKey === 'ultimaInteraccion') {
                return String(row?._raw?.lastInteractionAt || row?.ultimaInteraccion || '').trim();
            }
            return row?.[sortColumnKey];
        };

        return [...filteredRows].sort((left, right) => {
            for (const item of activeSortItems) {
                const sortColumnKey = String(item?.columnKey || '').trim();
                if (!sortColumnKey) continue;
                const leftValue = resolveSortValue(left, sortColumnKey);
                const rightValue = resolveSortValue(right, sortColumnKey);
                let comparison = 0;

                if (typeof leftValue === 'number' && typeof rightValue === 'number') {
                    comparison = leftValue - rightValue;
                } else {
                    const leftText = String(leftValue ?? '').trim();
                    const rightText = String(rightValue ?? '').trim();
                    comparison = leftText.localeCompare(rightText, 'es', { numeric: true, sensitivity: 'base' });
                }

                if (comparison !== 0) {
                    return comparison * (String(item?.direction || 'asc').trim().toLowerCase() === 'desc' ? -1 : 1);
                }
            }
            return 0;
        });
    }, [filterColumnByKey, headerFilters, sortConfig, tableRows]);

    const visibleCustomerIdsForCampaign = useMemo(
        () => sortedAndFilteredRows
            .map((row) => String(row?._raw?.customerId || row?.id || '').trim())
            .filter(Boolean),
        [sortedAndFilteredRows]
    );
    const allVisibleCustomersSelectedForCampaign = useMemo(
        () => visibleCustomerIdsForCampaign.length > 0 && visibleCustomerIdsForCampaign.every((customerId) => selectedCustomerIdsForCampaignSet.has(customerId)),
        [selectedCustomerIdsForCampaignSet, visibleCustomerIdsForCampaign]
    );

    const tableSelectedId = useMemo(() => {
        if (customerPanelMode === 'create') return '';
        return String(selectedCustomerIdResolved || selectedCustomerId || '').trim();
    }, [customerPanelMode, selectedCustomerId, selectedCustomerIdResolved]);

    const layoutSelectedId = useMemo(() => {
        if (customerPanelMode === 'create') return '__create__';
        return String(selectedCustomerIdResolved || selectedCustomerId || '').trim();
    }, [customerPanelMode, selectedCustomerId, selectedCustomerIdResolved]);

    const visibleTableRows = useMemo(
        () => (Array.isArray(sortedAndFilteredRows) ? sortedAndFilteredRows : []),
        [sortedAndFilteredRows]
    );
    const firstSelectedCustomerIdForCampaign = useMemo(
        () => String(selectedCustomerIdsForCampaign[0] || '').trim(),
        [selectedCustomerIdsForCampaign]
    );

    const handlePreferredLanguageChange = useCallback(async (nextLanguageRaw = '') => {
        const customerId = selectedCustomerIdResolved;
        const nextLanguage = String(nextLanguageRaw || '').trim().toLowerCase();
        if (!customerId) return;

        const normalized = nextLanguage === 'en' || nextLanguage === 'pt' ? nextLanguage : 'es';
        setLanguageDraftByCustomer((prev) => ({ ...prev, [customerId]: normalized }));
        setLanguageBusy(true);
        try {
            await requestJson('/api/tenant/customers/' + encodeURIComponent(customerId) + '/language', {
                method: 'PATCH',
                body: { preferredLanguage: normalized }
            });
            await loadCustomers(tenantScopeId);
        } finally {
            setLanguageBusy(false);
        }
    }, [loadCustomers, requestJson, selectedCustomerIdResolved, tenantScopeId]);

    const loadModuleContextsByCustomer = useCallback(async (customerIdRaw = '') => {
        const customerId = String(customerIdRaw || '').trim();
        if (!customerId) {
            setModuleContexts([]);
            setModuleContextsError('');
            setModuleConsentDraftByModuleId({});
            return;
        }

        setModuleContextsLoading(true);
        setModuleContextsError('');
        try {
            const payload = await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/module-contexts?limit=500`, {
                method: 'GET'
            });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            const normalized = items
                .map((item) => normalizeModuleContextRecord(item))
                .sort((left, right) => String(right.lastInteractionAt || right.updatedAt || '').localeCompare(String(left.lastInteractionAt || left.updatedAt || '')));
            setModuleContexts(normalized);
            setModuleConsentDraftByModuleId((prev) => {
                const next = {};
                normalized.forEach((contextItem) => {
                    const moduleId = String(contextItem.moduleId || '').trim();
                    if (!moduleId) return;
                    next[moduleId] = String(prev[moduleId] || contextItem.marketingOptInStatus || 'unknown').trim().toLowerCase();
                });
                return next;
            });
        } catch (error) {
            setModuleContexts([]);
            setModuleContextsError(String(error?.message || 'No se pudieron cargar contextos por modulo.'));
        } finally {
            setModuleContextsLoading(false);
        }
    }, [requestJson]);

    const loadCustomerAddressesByCustomer = useCallback(async (customerIdRaw = '') => {
        const customerId = String(customerIdRaw || '').trim();
        if (!customerId) {
            setCustomerAddresses([]);
            setAddressesError('');
            setSelectedAddressId('');
            return;
        }

        setAddressesLoading(true);
        setAddressesError('');
        try {
            const payload = await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/addresses`, { method: 'GET' });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            const normalized = items.map((item) => normalizeAddressRecord(item));
            setCustomerAddresses(normalized);
            setSelectedAddressId((previous) => {
                const previousId = String(previous || '').trim();
                if (previousId && normalized.some((item) => String(item?.addressId || '').trim() === previousId)) {
                    return previousId;
                }
                return '';
            });
        } catch (error) {
            setCustomerAddresses([]);
            setAddressesError(String(error?.message || 'No se pudieron cargar direcciones del cliente.'));
            setSelectedAddressId('');
        } finally {
            setAddressesLoading(false);
        }
    }, [requestJson]);

    const loadCustomerCatalogs = useCallback(async () => {
        if (typeof requestJson !== 'function' || !isCustomersSection) return;
        setLoadingCustomerCatalogs(true);
        setLoadingGeoCatalog(true);
        setCustomerCatalogsError('');
        setGeoCatalogError('');
        try {
            const [treatmentsPayload, typesPayload, sourcesPayload, documentsPayload, geoPayload] = await Promise.all([
                requestJson('/api/tenant/customer-catalogs/treatments', { method: 'GET' }),
                requestJson('/api/tenant/customer-catalogs/types', { method: 'GET' }),
                requestJson('/api/tenant/customer-catalogs/sources', { method: 'GET' }),
                requestJson('/api/tenant/customer-catalogs/document-types', { method: 'GET' }),
                requestJson('/api/tenant/customer-catalogs/geo', { method: 'GET' })
            ]);
            setCustomerCatalogs({
                treatments: normalizeCatalogItems(treatmentsPayload?.items || []),
                customerTypes: normalizeCatalogItems(typesPayload?.items || []),
                acquisitionSources: normalizeCatalogItems(sourcesPayload?.items || []),
                documentTypes: normalizeCatalogItems(documentsPayload?.items || [])
            });
            setGeoCatalog({
                departments: Array.isArray(geoPayload?.departments) ? geoPayload.departments : [],
                provinces: Array.isArray(geoPayload?.provinces) ? geoPayload.provinces : [],
                districts: Array.isArray(geoPayload?.districts) ? geoPayload.districts : []
            });
        } catch (error) {
            setCustomerCatalogs(EMPTY_CUSTOMER_CATALOGS);
            setCustomerCatalogsError(String(error?.message || 'No se pudieron cargar catalogos de clientes.'));
            setGeoCatalog(EMPTY_GEO_CATALOG);
            setGeoCatalogError(String(error?.message || 'No se pudo cargar el catalogo geografico.'));
        } finally {
            setLoadingCustomerCatalogs(false);
            setLoadingGeoCatalog(false);
        }
    }, [isCustomersSection, requestJson]);

    const handleModuleConsentChange = useCallback(async (moduleIdRaw = '', nextStatusRaw = '') => {
        const moduleId = String(moduleIdRaw || '').trim();
        const customerId = selectedCustomerIdResolved;
        if (!customerId || !moduleId) return;

        const nextStatus = normalizeModuleContextConsent(nextStatusRaw);
        setModuleConsentDraftByModuleId((prev) => ({ ...prev, [moduleId]: nextStatus }));
        if (nextStatus !== 'opted_in' && nextStatus !== 'opted_out') return;

        setModuleConsentBusyByModuleId((prev) => ({ ...prev, [moduleId]: true }));
        try {
            await requestJson('/api/tenant/customers/' + encodeURIComponent(customerId) + '/consent', {
                method: 'PATCH',
                body: {
                    consentType: 'marketing',
                    status: nextStatus,
                    source: 'manual',
                    moduleId,
                    proofPayload: {
                        ui: 'saas_customers_section_module_context'
                    }
                }
            });
            await Promise.all([
                loadCustomers(tenantScopeId),
                loadModuleContextsByCustomer(customerId)
            ]);
        } catch (error) {
            setModuleContextsError(String(error?.message || 'No se pudo actualizar consentimiento por modulo.'));
        } finally {
            setModuleConsentBusyByModuleId((prev) => ({ ...prev, [moduleId]: false }));
        }
    }, [loadCustomers, loadModuleContextsByCustomer, requestJson, selectedCustomerIdResolved, tenantScopeId]);

    const handleOpenCustomerEdit = useCallback(() => {
        if (editClickBusy) return;
        setEditClickBusy(true);
        try {
            if (selectedCustomer) {
                setCustomerForm({
                    ...normalizeCustomerFormFromItem(selectedCustomer),
                    preferredLanguage: normalizePreferredLanguage(selectedCustomer)
                });
            }
            setCustomerPanelMode('edit');
        } finally {
            setEditClickBusy(false);
        }
    }, [editClickBusy, selectedCustomer, setCustomerForm, setCustomerPanelMode]);

    const handleCloseDetail = useCallback(() => {
        setSelectedCustomerId('');
        setCustomerPanelMode('view');
        setAddressPanelMode('customer');
        setAddressEditorOpen(false);
    }, [setAddressEditorOpen, setAddressPanelMode, setCustomerPanelMode, setSelectedCustomerId]);

    const handleRequestCancelCustomerEdit = useCallback(async () => {
        if (isCustomerFormDirty) {
            const ok = await confirm({
                title: 'Descartar cambios',
                message: 'Hay cambios sin guardar en el cliente. Si continuas, se perderan.',
                confirmText: 'Descartar',
                cancelText: 'Seguir editando',
                tone: 'warn'
            });
            if (!ok) return;
        }
        cancelCustomerEdit?.();
    }, [cancelCustomerEdit, confirm, isCustomerFormDirty]);

    const handleRequestCancelAddressEdit = useCallback(async () => {
        if (isAddressFormDirty) {
            const ok = await confirm({
                title: 'Descartar cambios',
                message: 'Hay cambios sin guardar en la direccion. Si continuas, se perderan.',
                confirmText: 'Descartar',
                cancelText: 'Seguir editando',
                tone: 'warn'
            });
            if (!ok) return;
        }
        const hasSelectedAddress = String(selectedAddressId || '').trim();
        setAddressEditorMode('create');
        setAddressEditorOpen(false);
        setAddressForm(EMPTY_ADDRESS_FORM);
        setAddressPanelMode(hasSelectedAddress ? 'address-detail' : 'customer');
        setAddressesError('');
    }, [confirm, isAddressFormDirty, selectedAddressId]);

    const handleRequestCloseCustomersPanel = useCallback(async () => {
        if (showColumnsMenu) {
            setShowColumnsMenu(false);
            return;
        }
        if (addressPanelMode === 'address-edit') {
            await handleRequestCancelAddressEdit();
            return;
        }
        if (customerPanelMode === 'create' || customerPanelMode === 'edit') {
            await handleRequestCancelCustomerEdit();
            return;
        }
        if (addressPanelMode === 'address-detail') {
            setAddressPanelMode('customer');
            setAddressEditorOpen(false);
            setAddressEditorMode('create');
            setAddressForm(EMPTY_ADDRESS_FORM);
            setAddressesError('');
            return;
        }
        if (selectedCustomer || selectedCustomerId) {
            handleCloseDetail();
        }
    }, [
        addressPanelMode,
        customerPanelMode,
        handleCloseDetail,
        handleRequestCancelAddressEdit,
        handleRequestCancelCustomerEdit,
        selectedCustomer,
        selectedCustomerId,
        showColumnsMenu
    ]);

    useEffect(() => {
        if (!isCustomersSection) return undefined;
        const onPanelEscape = (event) => {
            const hasOpenState = Boolean(
                showColumnsMenu
                || addressPanelMode === 'address-edit'
                || addressPanelMode === 'address-detail'
                || customerPanelMode === 'create'
                || customerPanelMode === 'edit'
                || selectedCustomer
                || selectedCustomerId
            );
            if (!hasOpenState) return;
            event.preventDefault();
            void handleRequestCloseCustomersPanel();
        };
        window.addEventListener('saas-panel-escape', onPanelEscape);
        return () => window.removeEventListener('saas-panel-escape', onPanelEscape);
    }, [
        addressPanelMode,
        customerPanelMode,
        handleRequestCloseCustomersPanel,
        isCustomersSection,
        selectedCustomer,
        selectedCustomerId,
        showColumnsMenu
    ]);

    const handleSoftDeleteCustomer = useCallback(() => {
        const customerId = resolveCustomerId(selectedCustomer);
        if (!customerId) return;
        runAction('Cliente marcado como inactivo', async () => {
            await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/' + encodeURIComponent(customerId), {
                method: 'PUT',
                body: { isActive: false }
            });
            await loadCustomers(tenantScopeId);
        });
    }, [loadCustomers, requestJson, runAction, selectedCustomer, tenantScopeId]);

    const resetSendTemplateFlow = useCallback(() => {
        setSendTemplateOpen(false);
        setSendTemplateOptions([]);
        setSendTemplateOptionsLoading(false);
        setSendTemplateOptionsError('');
        setSelectedSendTemplate(null);
        setSelectedSendTemplatePreview(null);
        setSelectedSendTemplatePreviewLoading(false);
        setSelectedSendTemplatePreviewError('');
        setSendTemplateSubmitting(false);
    }, []);

    const handleSelectDirectTemplate = useCallback(async (template = null) => {
        const entry = template && typeof template === 'object' ? template : null;
        if (!entry) return;

        setSelectedSendTemplate(entry);
        setSelectedSendTemplatePreview(null);
        setSelectedSendTemplatePreviewLoading(true);
        setSelectedSendTemplatePreviewError('');

        try {
            const previewPayload = await requestJson(`/api/tenant/template-variables/preview?customerId=${encodeURIComponent(selectedCustomerIdResolved)}`, {
                method: 'GET'
            });
            const resolvedPreview = buildTemplateResolvedPreview(entry, previewPayload);
            setSelectedSendTemplatePreview({
                ...resolvedPreview,
                payload: previewPayload
            });
        } catch (error) {
            const message = String(error?.message || 'No se pudo resolver la preview del template.');
            setSelectedSendTemplatePreviewError(message);
            notify({ type: 'error', message });
        } finally {
            setSelectedSendTemplatePreviewLoading(false);
        }
    }, [notify, requestJson, selectedCustomerIdResolved]);

    const handleOpenDirectTemplateModal = useCallback(async () => {
        if (!selectedCustomerIdResolved) {
            notify({ type: 'error', message: 'Selecciona un cliente para iniciar la conversacion.' });
            return;
        }
        if (!selectedCustomerPhone) {
            notify({ type: 'error', message: 'El cliente no tiene telefono principal para enviar templates.' });
            return;
        }

        setSendTemplateOpen(true);
        setSendTemplateOptions([]);
        setSendTemplateOptionsLoading(true);
        setSendTemplateOptionsError('');
        setSelectedSendTemplate(null);
        setSelectedSendTemplatePreview(null);
        setSelectedSendTemplatePreviewError('');

        try {
            const response = await listMetaTemplates(requestJson, {
                status: 'approved',
                limit: 200
            });
            const preferredModules = new Set(selectedCustomerPreferredModuleIds);
            const items = (Array.isArray(response?.items) ? response.items : [])
                .filter((item) => isTemplateAllowedInIndividual(item?.useCase))
                .map((item) => ({
                    ...item,
                    templateId: String(item?.templateId || item?.metaTemplateId || item?.templateName || '').trim(),
                    templateName: String(item?.templateName || '').trim(),
                    templateLanguage: String(item?.templateLanguage || 'es').trim().toLowerCase() || 'es',
                    moduleId: String(item?.moduleId || '').trim(),
                    useCase: String(item?.useCase || 'both').trim().toLowerCase() || 'both'
                }))
                .filter((item) => item.templateId && item.templateName)
                .sort((left, right) => {
                    const leftPreferred = preferredModules.has(left.moduleId) ? 0 : 1;
                    const rightPreferred = preferredModules.has(right.moduleId) ? 0 : 1;
                    if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
                    const moduleCompare = String(moduleNameById[left.moduleId] || left.moduleId || '').localeCompare(
                        String(moduleNameById[right.moduleId] || right.moduleId || ''),
                        'es',
                        { sensitivity: 'base' }
                    );
                    if (moduleCompare !== 0) return moduleCompare;
                    return String(left.templateName || '').localeCompare(String(right.templateName || ''), 'es', { sensitivity: 'base' });
                });

            setSendTemplateOptions(items);
            if (items.length > 0) {
                await handleSelectDirectTemplate(items[0]);
            }
        } catch (error) {
            const message = String(error?.message || 'No se pudieron cargar templates para iniciar la conversacion.');
            setSendTemplateOptionsError(message);
            notify({ type: 'error', message });
        } finally {
            setSendTemplateOptionsLoading(false);
        }
    }, [
        handleSelectDirectTemplate,
        moduleNameById,
        notify,
        requestJson,
        selectedCustomerIdResolved,
        selectedCustomerPhone,
        selectedCustomerPreferredModuleIds
    ]);

    const handleConfirmDirectTemplateSend = useCallback(() => {
        const template = selectedSendTemplate && typeof selectedSendTemplate === 'object' ? selectedSendTemplate : null;
        if (!template || !socket || typeof socket.emit !== 'function') return;
        if (!selectedCustomerPhone) {
            notify({ type: 'error', message: 'El cliente no tiene telefono valido para enviar el template.' });
            return;
        }

        setSendTemplateSubmitting(true);
        socket.emit('send_template_message', {
            toPhone: selectedCustomerPhone,
            customerId: selectedCustomerIdResolved || null,
            moduleId: String(template?.moduleId || '').trim() || null,
            templateId: String(template?.templateId || '').trim() || null,
            templateName: String(template?.templateName || '').trim(),
            templateLanguage: String(template?.templateLanguage || 'es').trim().toLowerCase() || 'es'
        });
    }, [notify, selectedCustomerIdResolved, selectedCustomerPhone, selectedSendTemplate, socket]);

    const resetCampaignTemplateFlow = useCallback(() => {
        setCampaignTemplateModalOpen(false);
        setCampaignTemplateOptions([]);
        setCampaignTemplateOptionsLoading(false);
        setCampaignTemplateOptionsError('');
        setSelectedCampaignTemplate(null);
        setSelectedCampaignTemplatePreview(null);
        setSelectedCampaignTemplatePreviewLoading(false);
        setSelectedCampaignTemplatePreviewError('');
        setCampaignTemplateSubmitting(false);
    }, []);

    const resetImportFlow = useCallback(() => {
        setShowImportModal(false);
        setImportStep(1);
        setImportFileClientes(null);
        setImportFileDirecciones(null);
        setImportPreview(null);
        setImportResult(null);
        setImportLoading(false);
        setImportModuleId('');
        setShowAllImportErrors(false);
    }, []);

    const refreshCustomersView = useCallback(async ({ forceFullReload = false, silent = false } = {}) => {
        if (tenantScopeLocked) return;
        const cleanTenantId = String(tenantScopeId || '').trim();
        if (!cleanTenantId) return;
        try {
            if (forceFullReload || typeof syncCustomersDelta !== 'function') {
                if (typeof loadCustomers === 'function') {
                    await loadCustomers(cleanTenantId);
                }
            } else {
                await syncCustomersDelta(cleanTenantId, {
                    updatedSince: typeof maxCustomersUpdatedAt === 'function'
                        ? maxCustomersUpdatedAt(cleanTenantId)
                        : ''
                });
            }
        } catch (error) {
            if (!silent) {
                notify({ type: 'error', message: String(error?.message || 'No se pudieron actualizar los clientes.') });
            }
            throw error;
        }
    }, [loadCustomers, maxCustomersUpdatedAt, notify, syncCustomersDelta, tenantScopeId, tenantScopeLocked]);

    const handleCloseImportModal = useCallback(async () => {
        resetImportFlow();
        if (tenantScopeLocked || !tenantScopeId) return;
        try {
            await refreshCustomersView({ forceFullReload: true, silent: true });
        } catch {
            // no-op on close
        }
    }, [refreshCustomersView, resetImportFlow, tenantScopeId, tenantScopeLocked]);

    const handleAnalyzeImport = useCallback(async () => {
        if (!tenantScopeId) return;
        if (!importFileClientes) {
            notify({ type: 'error', message: 'Selecciona el archivo TbClientes.csv antes de analizar.' });
            return;
        }

        const formData = new FormData();
        formData.append('file_clientes', importFileClientes);
        if (importFileDirecciones) {
            formData.append('file_direcciones', importFileDirecciones);
        }
        formData.append('moduleId', String(importModuleId || '').trim());
        formData.append('mode', 'preview');

        setImportLoading(true);
        setShowAllImportErrors(false);
        try {
            const response = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/import-erp', {
                method: 'POST',
                body: formData
            });
            setImportPreview(response || null);
            setImportResult(null);
            setImportStep(2);
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'No se pudo analizar el archivo ERP.') });
        } finally {
            setImportLoading(false);
        }
    }, [importFileClientes, importFileDirecciones, importModuleId, notify, requestJson, tenantScopeId]);

    const handleConfirmImport = useCallback(async () => {
        if (!tenantScopeId) return;
        if (!importFileClientes) {
            notify({ type: 'error', message: 'Selecciona el archivo TbClientes.csv antes de confirmar.' });
            return;
        }

        const validCount = Number(importPreview?.summary?.valid || 0);
        if (validCount <= 0) {
            notify({ type: 'error', message: 'No hay clientes validos para importar.' });
            return;
        }

        const formData = new FormData();
        formData.append('file_clientes', importFileClientes);
        if (importFileDirecciones) {
            formData.append('file_direcciones', importFileDirecciones);
        }
        formData.append('moduleId', String(importModuleId || '').trim());
        formData.append('mode', 'commit');

        setImportLoading(true);
        try {
            const response = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/import-erp', {
                method: 'POST',
                body: formData
            });
            setImportResult(response || null);
            setImportStep(3);
            await refreshCustomersView({ forceFullReload: true, silent: false });
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'No se pudo completar la importacion ERP.') });
        } finally {
            setImportLoading(false);
        }
    }, [importFileClientes, importFileDirecciones, importModuleId, importPreview?.summary?.valid, notify, refreshCustomersView, requestJson, tenantScopeId]);

    const handleDownloadImportErrorsCsv = useCallback(() => {
        const errors = Array.isArray(importPreview?.errors) ? importPreview.errors : [];
        if (!errors.length) {
            notify({ type: 'error', message: 'No hay errores para exportar.' });
            return;
        }
        const blob = new Blob([buildImportErrorsCsv(errors)], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'importacion_erp_errores.csv';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [importPreview?.errors, notify]);

    const scheduleRealtimeCustomersSync = useCallback((delayMs = 700) => {
        if (!isCustomersSection || tenantScopeLocked) return;
        if (customersRealtimeSyncTimeoutRef.current) {
            clearTimeout(customersRealtimeSyncTimeoutRef.current);
        }
        customersRealtimeSyncTimeoutRef.current = setTimeout(async () => {
            customersRealtimeSyncTimeoutRef.current = null;
            if (customersRealtimeSyncInFlightRef.current) return;
            customersRealtimeSyncInFlightRef.current = true;
            try {
                await refreshCustomersView({ forceFullReload: false, silent: true });
            } catch {
                // silent realtime refresh failure; manual refresh remains available
            } finally {
                customersRealtimeSyncInFlightRef.current = false;
            }
        }, Math.max(150, Number(delayMs) || 700));
    }, [isCustomersSection, refreshCustomersView, tenantScopeLocked]);

    const loadOutreachEligibility = useCallback(async () => {
        if (!campaignSelectionMode || !outreachModuleId) {
            setOutreachEligibilityError('');
            setOutreachEligibleCustomerIds([]);
            setOutreachNonEligibleCustomerIds([]);
            return;
        }

        const customerIds = (Array.isArray(filteredCustomersLive) ? filteredCustomersLive : [])
            .map((item) => resolveCustomerId(item))
            .filter(Boolean);

        if (customerIds.length === 0) {
            setOutreachEligibilityError('');
            setOutreachEligibleCustomerIds([]);
            setOutreachNonEligibleCustomerIds([]);
            return;
        }

        setOutreachEligibilityLoading(true);
        setOutreachEligibilityError('');
        try {
            const eligibleIds = [];
            const nonEligibleIds = [];
            (Array.isArray(filteredCustomersLive) ? filteredCustomersLive : []).forEach((customer) => {
                const customerId = resolveCustomerId(customer);
                if (!customerId) return;
                if (customerBelongsToModule(customer, outreachModuleId)) eligibleIds.push(customerId);
                else nonEligibleIds.push(customerId);
            });
            setOutreachEligibleCustomerIds(eligibleIds);
            setOutreachNonEligibleCustomerIds(nonEligibleIds);
        } catch (error) {
            setOutreachEligibilityError(String(error?.message || 'No se pudo calcular elegibilidad por modulo.'));
            setOutreachEligibleCustomerIds([]);
            setOutreachNonEligibleCustomerIds([]);
        } finally {
            setOutreachEligibilityLoading(false);
        }
    }, [campaignSelectionMode, filteredCustomersLive, outreachModuleId]);

    const exitCampaignSelectionMode = useCallback(() => {
        setCampaignSelectionMode(false);
        setSelectedCustomerIdsForCampaign([]);
        setOutreachModuleId('');
        setOutreachMode('eligible');
        setOutreachEligibilityError('');
        setOutreachEligibleCustomerIds([]);
        setOutreachNonEligibleCustomerIds([]);
    }, []);

    const handleSelectCampaignTemplate = useCallback(async (template = null) => {
        const entry = template && typeof template === 'object' ? template : null;
        if (!entry) return;

        setSelectedCampaignTemplate(entry);
        setSelectedCampaignTemplatePreview(null);
        setSelectedCampaignTemplatePreviewLoading(true);
        setSelectedCampaignTemplatePreviewError('');

        try {
            const suffix = firstSelectedCustomerIdForCampaign
                ? `?customerId=${encodeURIComponent(firstSelectedCustomerIdForCampaign)}`
                : '';
            const previewPayload = await requestJson(`/api/tenant/template-variables/preview${suffix}`, { method: 'GET' });
            const resolvedPreview = buildTemplateResolvedPreview(entry, previewPayload);
            setSelectedCampaignTemplatePreview({
                ...resolvedPreview,
                payload: previewPayload
            });
        } catch (error) {
            const message = String(error?.message || 'No se pudo resolver la preview del template de campaña.');
            setSelectedCampaignTemplatePreviewError(message);
            notify({ type: 'error', message });
        } finally {
            setSelectedCampaignTemplatePreviewLoading(false);
        }
    }, [firstSelectedCustomerIdForCampaign, notify, requestJson]);

    const handleOpenCampaignTemplateModal = useCallback(async () => {
        if (selectedCustomerIdsForCampaign.length === 0) {
            notify({ type: 'error', message: 'Selecciona al menos un cliente para la campaña express.' });
            return;
        }
        if (!outreachModuleId) {
            notify({ type: 'error', message: 'Selecciona un modulo antes de continuar.' });
            return;
        }

        setCampaignTemplateModalOpen(true);
        setCampaignTemplateOptions([]);
        setCampaignTemplateOptionsLoading(true);
        setCampaignTemplateOptionsError('');
        setSelectedCampaignTemplate(null);
        setSelectedCampaignTemplatePreview(null);
        setSelectedCampaignTemplatePreviewError('');

        try {
            const response = await listMetaTemplates(requestJson, {
                status: 'approved',
                limit: 200
            });
            const items = (Array.isArray(response?.items) ? response.items : [])
                .filter((item) => isTemplateAllowedInCampaigns(item?.useCase))
                .map((item) => ({
                    ...item,
                    templateId: String(item?.templateId || item?.metaTemplateId || item?.templateName || '').trim(),
                    templateName: String(item?.templateName || '').trim(),
                    templateLanguage: String(item?.templateLanguage || 'es').trim().toLowerCase() || 'es',
                    moduleId: String(item?.moduleId || '').trim().toLowerCase(),
                    useCase: String(item?.useCase || 'both').trim().toLowerCase() || 'both'
                }))
                .filter((item) => {
                    if (!item.templateId || !item.templateName) return false;
                    if (String(item.moduleId || '').trim().toLowerCase() !== String(outreachModuleId || '').trim().toLowerCase()) return false;
                    const useCase = normalizeTemplateUseCase(item.useCase || 'both');
                    return outreachMode === 'assign'
                        ? useCase === 'optin'
                        : isTemplateAllowedInCampaigns(useCase);
                })
                .sort((left, right) => {
                    const moduleCompare = String(moduleNameById[left.moduleId] || left.moduleId || '').localeCompare(
                        String(moduleNameById[right.moduleId] || right.moduleId || ''),
                        'es',
                        { sensitivity: 'base' }
                    );
                    if (moduleCompare !== 0) return moduleCompare;
                    return String(left.templateName || '').localeCompare(String(right.templateName || ''), 'es', { sensitivity: 'base' });
                });

            setCampaignTemplateOptions(items);
            if (items.length > 0) {
                await handleSelectCampaignTemplate(items[0]);
            }
        } catch (error) {
            const message = String(error?.message || 'No se pudieron cargar templates para outreach.');
            setCampaignTemplateOptionsError(message);
            notify({ type: 'error', message });
        } finally {
            setCampaignTemplateOptionsLoading(false);
        }
    }, [handleSelectCampaignTemplate, moduleNameById, notify, outreachMode, outreachModuleId, requestJson, selectedCustomerIdsForCampaign.length]);

    const handleConfirmExpressCampaign = useCallback(async () => {
        const template = selectedCampaignTemplate && typeof selectedCampaignTemplate === 'object' ? selectedCampaignTemplate : null;
        if (!template) return;
        if (selectedCustomerIdsForCampaign.length === 0) {
            notify({ type: 'error', message: 'Selecciona al menos un cliente para la campaña express.' });
            return;
        }

        const moduleId = String(outreachModuleId || template?.moduleId || '').trim();
        if (!moduleId) {
            notify({ type: 'error', message: 'El template seleccionado no tiene modulo asociado.' });
            return;
        }

        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        setCampaignTemplateSubmitting(true);
        try {
            if (outreachMode === 'assign') {
                await requestJson('/api/tenant/customers/outreach/assign-module', {
                    method: 'POST',
                    body: {
                        moduleId,
                        customerIds: selectedCustomerIdsForCampaign
                    }
                });
            }

            const createdResponse = await createCampaignApi(requestJson, {
                scopeModuleId: moduleId,
                moduleId,
                templateId: String(template?.templateId || '').trim() || null,
                templateName: String(template?.templateName || '').trim(),
                templateLanguage: String(template?.templateLanguage || 'es').trim().toLowerCase() || 'es',
                campaignName: `${outreachMode === 'assign' ? 'Opt-in masivo' : 'Campana express'} · ${String(template?.templateName || 'template').trim() || 'template'} · ${timestamp}`,
                campaignDescription: outreachMode === 'assign'
                    ? `Asignacion al modulo y envio opt-in desde Clientes para ${selectedCustomerIdsForCampaign.length} destinatario(s).`
                    : `Campana express creada desde Clientes para ${selectedCustomerIdsForCampaign.length} destinatario(s).`,
                audienceFiltersJson: {
                    customerIds: selectedCustomerIdsForCampaign
                },
                audienceSelectionJson: {
                    excludedCustomerIds: []
                },
                variablesPreviewJson: selectedCampaignTemplatePreview?.payload || {}
            });
            const campaignId = String(createdResponse?.campaign?.campaignId || '').trim();
            if (!campaignId) throw new Error('No se pudo obtener el campaignId de la campaña express.');

            await startCampaignApi(requestJson, { campaignId });
            notify({
                type: 'info',
                message: outreachMode === 'assign'
                    ? `Clientes asignados al modulo y envio opt-in iniciado para ${selectedCustomerIdsForCampaign.length} cliente(s).`
                    : `Campana express iniciada para ${selectedCustomerIdsForCampaign.length} cliente(s).`
            });
            setSelectedCustomerIdsForCampaign([]);
            resetCampaignTemplateFlow();
            void loadOutreachEligibility();
        } catch (error) {
            notify({
                type: 'error',
                message: String(error?.message || 'No se pudo completar outreach desde clientes.')
            });
            setCampaignTemplateSubmitting(false);
        }
    }, [
        loadOutreachEligibility,
        notify,
        outreachMode,
        outreachModuleId,
        requestJson,
        resetCampaignTemplateFlow,
        selectedCampaignTemplate,
        selectedCampaignTemplatePreview?.payload,
        selectedCustomerIdsForCampaign
    ]);

    const updateCustomersState = useCallback((customerItem = null) => {
        if (typeof setCustomers !== 'function') return;
        const safeItem = customerItem && typeof customerItem === 'object' ? customerItem : null;
        if (!safeItem) return;
        const safeItemId = resolveCustomerId(safeItem);
        if (safeItemId) {
            const normalizedId = normalizeCatalogLookupKey(safeItemId);
            if (normalizedId) {
                setCustomerOverridesById((prev) => ({
                    ...(prev && typeof prev === 'object' ? prev : {}),
                    [normalizedId]: safeItem
                }));
            }
        }
        setCustomers((prev) => upsertCustomerById(prev, safeItem));
        if (tenantScopeId && safeItemId && typeof patchCustomerInCache === 'function') {
            patchCustomerInCache(tenantScopeId, safeItemId, safeItem);
        }
        const currentSelectedId = String(selectedCustomerIdResolved || selectedCustomerId || '').trim();
        if (!safeItemId) return;
        if (!currentSelectedId) {
            setSelectedCustomerLive(safeItem);
            return;
        }
        if (normalizeCatalogLookupKey(currentSelectedId) === normalizeCatalogLookupKey(safeItemId)) {
            setSelectedCustomerLive(safeItem);
        }
    }, [patchCustomerInCache, selectedCustomerId, selectedCustomerIdResolved, setCustomers, tenantScopeId]);

    const patchCustomerActivityFromEvent = useCallback((payload = null) => {
        const phoneCandidates = extractPhoneCandidatesFromChatEvent(payload);
        if (!phoneCandidates.length) return false;
        const rawActivityAt = payload?.updatedAt ?? payload?.lastInteractionAt ?? payload?.timestamp ?? '';
        const numericActivityAt = Number(rawActivityAt);
        const parsedActivityAt = Number.isFinite(numericActivityAt) && numericActivityAt > 0
            ? new Date(numericActivityAt * 1000)
            : new Date(String(rawActivityAt || '').trim() || Date.now());
        const activityIso = Number.isFinite(parsedActivityAt.getTime())
            ? parsedActivityAt.toISOString()
            : new Date().toISOString();

        let matchedCustomer = null;
        setCustomers((prev) => {
            const source = Array.isArray(prev) ? prev : [];
            let changed = false;
            const next = source.map((customer) => {
                if (!customerMatchesAnyPhone(customer, phoneCandidates)) return customer;
                const nextCustomer = {
                    ...customer,
                    lastInteractionAt: activityIso,
                    last_interaction_at: activityIso,
                    updatedAt: activityIso,
                    updated_at: activityIso
                };
                changed = true;
                matchedCustomer = nextCustomer;
                return nextCustomer;
            });
            return changed ? next : source;
        });

        const matchedCustomerId = resolveCustomerId(matchedCustomer);
        if (!matchedCustomerId || !matchedCustomer) return false;

        const normalizedId = normalizeCatalogLookupKey(matchedCustomerId);
        if (normalizedId) {
            setCustomerOverridesById((prev) => ({
                ...(prev && typeof prev === 'object' ? prev : {}),
                [normalizedId]: matchedCustomer
            }));
        }
        if (tenantScopeId && typeof patchCustomerInCache === 'function') {
            patchCustomerInCache(tenantScopeId, matchedCustomerId, matchedCustomer);
        }

        const currentSelectedId = String(selectedCustomerIdResolved || selectedCustomerId || '').trim();
        if (!currentSelectedId || normalizeCatalogLookupKey(currentSelectedId) === normalizeCatalogLookupKey(matchedCustomerId)) {
            setSelectedCustomerLive(matchedCustomer);
        }
        return true;
    }, [patchCustomerInCache, selectedCustomerId, selectedCustomerIdResolved, setCustomers, tenantScopeId]);

    const showSyncedIndicator = useCallback(() => {
        setShowCustomerSynced(true);
        if (syncedIndicatorTimeoutRef.current) {
            clearTimeout(syncedIndicatorTimeoutRef.current);
        }
        syncedIndicatorTimeoutRef.current = setTimeout(() => {
            setShowCustomerSynced(false);
            syncedIndicatorTimeoutRef.current = null;
        }, 2000);
    }, []);

    const buildCustomerSubmitPayload = useCallback(() => {
        const basePayload = buildCustomerPayloadFromForm(customerForm);
        const firstName = String(firstNameValue || '').trim() || null;
        const lastNamePaternal = String(lastNamePaternalValue || '').trim() || null;
        const lastNameMaternal = String(lastNameMaternalValue || '').trim() || null;
        const treatmentId = String(customerForm?.treatmentId || '').trim() || null;
        const documentTypeId = String(customerForm?.documentTypeId || '').trim() || null;
        const documentNumber = String(documentNumberValue || '').trim() || null;
        const customerTypeId = String(customerForm?.customerTypeId || '').trim() || null;
        const acquisitionSourceId = String(customerForm?.acquisitionSourceId || '').trim() || null;
        const notes = String(notesValue || '').trim() || null;
        const preferredLanguage = String(formPreferredLanguageValue || '').trim().toLowerCase() || 'es';
        return {
            ...basePayload,
            treatmentId,
            treatment_id: treatmentId,
            firstName,
            first_name: firstName,
            lastNamePaternal,
            last_name_paternal: lastNamePaternal,
            lastNameMaternal,
            last_name_maternal: lastNameMaternal,
            documentTypeId,
            document_type_id: documentTypeId,
            documentNumber,
            document_number: documentNumber,
            customerTypeId,
            customer_type_id: customerTypeId,
            acquisitionSourceId,
            acquisition_source_id: acquisitionSourceId,
            notes,
            preferredLanguage
        };
    }, [
        buildCustomerPayloadFromForm,
        customerForm,
        firstNameValue,
        lastNamePaternalValue,
        lastNameMaternalValue,
        documentNumberValue,
        notesValue,
        formPreferredLanguageValue
    ]);

    const handleSaveCustomer = useCallback(() => {
        if (savingCustomer) return;
        setShowCustomerSynced(false);
        const payload = buildCustomerSubmitPayload();
        const selectedCustomerIdForSave = resolveCustomerId(selectedCustomer);
        const isCreate = customerPanelMode === 'create' || !selectedCustomerIdForSave;

        if (isCreate) {
            setSavingCustomer(true);
            void (async () => {
                try {
                    const created = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers', {
                        method: 'POST',
                        body: payload
                    });
                    const createdItem = created?.item && typeof created.item === 'object' ? created.item : null;
                    const createdId = String(createdItem?.customerId || created?.item?.customer_id || '').trim();
                    const preferredLanguage = String(payload?.preferredLanguage || 'es').trim().toLowerCase() || 'es';
                    if (createdItem) updateCustomersState(createdItem);
                    if (createdId) {
                        await requestJson('/api/tenant/customers/' + encodeURIComponent(createdId) + '/language', {
                            method: 'PATCH',
                            body: { preferredLanguage }
                        });
                    }
                    if (createdId) setSelectedCustomerId(createdId);
                    setCustomerPanelMode('view');
                    showSyncedIndicator();
                } catch (error) {
                    notify({
                        type: 'error',
                        body: String(error?.message || 'No se pudo guardar el cliente.')
                    });
                } finally {
                    setSavingCustomer(false);
                }
            })();
            return;
        }

        const customerId = String(selectedCustomerIdForSave || '').trim();
        if (!customerId) return;
        const snapshot = cloneCustomerSnapshot(selectedCustomer);
        const optimisticItem = buildOptimisticCustomerFromPayload(snapshot, payload);
        if (optimisticItem) updateCustomersState(optimisticItem);
        setCustomerPanelMode('view');
        setSavingCustomer(true);

        void (async () => {
            try {
                const response = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/' + encodeURIComponent(customerId), {
                    method: 'PUT',
                    body: payload
                });
                const preferredLanguage = String(payload?.preferredLanguage || 'es').trim().toLowerCase() || 'es';
                await requestJson('/api/tenant/customers/' + encodeURIComponent(customerId) + '/language', {
                    method: 'PATCH',
                    body: { preferredLanguage }
                });
                const serverItem = response?.item && typeof response.item === 'object' ? response.item : null;
                if (serverItem) {
                    updateCustomersState(serverItem);
                } else if (typeof syncCustomersDelta === 'function') {
                    await syncCustomersDelta(tenantScopeId, {
                        updatedSince: typeof maxCustomersUpdatedAt === 'function'
                            ? maxCustomersUpdatedAt(tenantScopeId)
                            : ''
                    });
                }
                showSyncedIndicator();
            } catch (error) {
                if (snapshot) updateCustomersState(snapshot);
                notify({
                    type: 'error',
                    body: 'No se pudo guardar el cliente. Se revirtieron los cambios locales.'
                });
            } finally {
                setSavingCustomer(false);
            }
        })();
    }, [
        buildCustomerSubmitPayload,
        customerPanelMode,
        maxCustomersUpdatedAt,
        notify,
        requestJson,
        savingCustomer,
        selectedCustomer,
        setCustomerPanelMode,
        setSelectedCustomerId,
        syncCustomersDelta,
        tenantScopeId,
        updateCustomersState,
        showSyncedIndicator
    ]);

    useEffect(() => {
        if (!isCustomersSection) return;
        loadCustomerCatalogs();
    }, [isCustomersSection, loadCustomerCatalogs]);

    useEffect(() => {
        if (!isCustomersSection || tenantScopeLocked || !tenantScopeId || typeof requestJson !== 'function') return;
        let cancelled = false;
        void (async () => {
            try {
                const [rulesPayload, labelsPayload] = await Promise.all([
                    fetchTenantZoneRules(requestJson, { includeInactive: false }),
                    fetchTenantCustomerLabels(requestJson, { source: 'zone' })
                ]);
                if (cancelled) return;
                setZoneRules(Array.isArray(rulesPayload?.items) ? rulesPayload.items : []);
                setCustomerZoneLabels(Array.isArray(labelsPayload?.items) ? labelsPayload.items : []);
            } catch {
                if (!cancelled) {
                    setZoneRules([]);
                    setCustomerZoneLabels([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isCustomersSection, requestJson, tenantScopeId, tenantScopeLocked]);

    useEffect(() => {
        const next = String(customerSearch || '');
        setSearchInput((prev) => (prev === next ? prev : next));
    }, [customerSearch]);

    useEffect(() => {
        if (!campaignSelectionMode) return;
        void loadOutreachEligibility();
    }, [campaignSelectionMode, loadOutreachEligibility]);

    useEffect(() => {
        if (!isCustomersSection || !campaignSelectionMode) return undefined;
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            exitCampaignSelectionMode();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [campaignSelectionMode, exitCampaignSelectionMode, isCustomersSection]);

    useEffect(() => {
        const timer = setTimeout(() => {
            const normalized = String(searchInput || '');
            if (normalized === String(customerSearch || '')) return;
            if (typeof setCustomerSearch === 'function') {
                setCustomerSearch(normalized);
            }
        }, 150);

        return () => clearTimeout(timer);
    }, [customerSearch, searchInput, setCustomerSearch]);

    useEffect(() => {
        if (!isCustomersSection) return undefined;
        if (tenantScopeLocked) return undefined;
        const cleanTenantId = String(tenantScopeId || '').trim();
        if (!cleanTenantId) return undefined;
        if (typeof syncCustomersDelta !== 'function') return undefined;

        const syncTick = async () => {
            try {
                await syncCustomersDelta(cleanTenantId, {
                    updatedSince: typeof maxCustomersUpdatedAt === 'function'
                        ? maxCustomersUpdatedAt(cleanTenantId)
                        : ''
                });
            } catch {
                // silent sync tick failure; next interval retries
            }
        };

        const intervalId = setInterval(() => {
            void syncTick();
        }, 60000);

        return () => clearInterval(intervalId);
    }, [
        isCustomersSection,
        maxCustomersUpdatedAt,
        syncCustomersDelta,
        tenantScopeId,
        tenantScopeLocked
    ]);

    useEffect(() => {
        if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') return undefined;
        const handleRealtimeCustomerTouch = (payload = null) => {
            patchCustomerActivityFromEvent(payload);
            scheduleRealtimeCustomersSync(600);
        };
        socket.on('message', handleRealtimeCustomerTouch);
        socket.on('chat_updated', handleRealtimeCustomerTouch);
        socket.on('template_message_sent', handleRealtimeCustomerTouch);
        return () => {
            socket.off('message', handleRealtimeCustomerTouch);
            socket.off('chat_updated', handleRealtimeCustomerTouch);
            socket.off('template_message_sent', handleRealtimeCustomerTouch);
        };
    }, [patchCustomerActivityFromEvent, scheduleRealtimeCustomersSync, socket]);

    useEffect(() => () => {
        if (customersRealtimeSyncTimeoutRef.current) {
            clearTimeout(customersRealtimeSyncTimeoutRef.current);
            customersRealtimeSyncTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!addressEditorOpen) return;
        setAddressForm((prev) => {
            const next = { ...prev };
            let changed = false;

            const districtId = normalizeGeoDistrictId(prev.districtId || '');
            const provinceId = normalizeGeoNumericId(prev.provinceId || '');
            const departmentId = normalizeGeoNumericId(prev.departmentId || '');
            const districtNameKey = normalizeGeoNameKey(prev.districtName || '');
            const provinceNameKey = normalizeGeoNameKey(prev.provinceName || '');
            const departmentNameKey = normalizeGeoNameKey(prev.departmentName || '');

            let department = departmentId ? geoDepartmentById.get(departmentId) || null : null;
            if (!department && departmentNameKey) {
                department = geoDepartmentByName.get(departmentNameKey) || null;
                if (department && !departmentId) {
                    next.departmentId = String(department.id || '').trim();
                    changed = true;
                }
            }

            let province = provinceId ? geoProvinceById.get(provinceId) || null : null;
            if (!province && provinceNameKey) {
                const candidates = geoProvinceByName.get(provinceNameKey) || [];
                const scoped = department
                    ? candidates.find((entry) => String(entry.departmentId || '').trim() === String(department.id || '').trim())
                    : candidates[0] || null;
                province = scoped || null;
                if (province && !provinceId) {
                    next.provinceId = String(province.id || '').trim();
                    changed = true;
                }
                if (province && !next.departmentId) {
                    next.departmentId = String(province.departmentId || '').trim();
                    changed = true;
                }
            }

            let district = districtId ? geoDistrictById.get(districtId) || null : null;
            if (!district && districtNameKey) {
                const candidates = geoDistrictByName.get(districtNameKey) || [];
                const scoped = province
                    ? candidates.find((entry) => String(entry.provinceId || '').trim() === String(province.id || '').trim())
                    : candidates[0] || null;
                district = scoped || null;
                if (district && !districtId) {
                    next.districtId = String(district.id || '').trim();
                    changed = true;
                }
            }

            if (!district && next.districtId) {
                district = geoDistrictById.get(normalizeGeoDistrictId(next.districtId)) || null;
            }
            if (!province && district) {
                province = geoProvinceById.get(String(district.provinceId || '').trim()) || null;
            }
            if (!department && district) {
                department = geoDepartmentById.get(String(district.departmentId || '').trim()) || null;
            }
            if (!department && province) {
                department = geoDepartmentById.get(String(province.departmentId || '').trim()) || null;
            }

            if (district) {
                const nextDistrictName = String(district.name || '').trim();
                if (nextDistrictName && next.districtName !== nextDistrictName) {
                    next.districtName = nextDistrictName;
                    changed = true;
                }
                const nextProvinceId = String(district.provinceId || '').trim();
                if (nextProvinceId && next.provinceId !== nextProvinceId) {
                    next.provinceId = nextProvinceId;
                    changed = true;
                }
                const nextDepartmentId = String(district.departmentId || '').trim();
                if (nextDepartmentId && next.departmentId !== nextDepartmentId) {
                    next.departmentId = nextDepartmentId;
                    changed = true;
                }
            }

            if (province) {
                const nextProvinceName = String(province.name || '').trim();
                if (nextProvinceName && next.provinceName !== nextProvinceName) {
                    next.provinceName = nextProvinceName;
                    changed = true;
                }
            }

            if (department) {
                const nextDepartmentName = String(department.name || '').trim();
                if (nextDepartmentName && next.departmentName !== nextDepartmentName) {
                    next.departmentName = nextDepartmentName;
                    changed = true;
                }
            }

            return changed ? next : prev;
        });
    }, [
        addressEditorOpen,
        geoDepartmentById,
        geoDepartmentByName,
        geoDistrictById,
        geoDistrictByName,
        geoProvinceById,
        geoProvinceByName
    ]);

    useEffect(() => {
        if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') return undefined;

        const handleTemplateMessageSent = () => {
            setSendTemplateSubmitting(false);
            resetSendTemplateFlow();
        };

        const handleTemplateMessageError = () => {
            setSendTemplateSubmitting(false);
        };

        socket.on('template_message_sent', handleTemplateMessageSent);
        socket.on('template_message_error', handleTemplateMessageError);
        return () => {
            socket.off('template_message_sent', handleTemplateMessageSent);
            socket.off('template_message_error', handleTemplateMessageError);
        };
    }, [resetSendTemplateFlow, socket]);

    useEffect(() => {
        resetSendTemplateFlow();
    }, [resetSendTemplateFlow, selectedCustomerIdResolved]);

    useEffect(() => {
        resetCampaignTemplateFlow();
    }, [resetCampaignTemplateFlow, firstSelectedCustomerIdForCampaign]);

    useEffect(() => {
        const validIds = new Set(
            (Array.isArray(filteredCustomersLive) ? filteredCustomersLive : [])
                .map((item) => resolveCustomerId(item))
                .filter(Boolean)
        );
        setSelectedCustomerIdsForCampaign((prev) => (
            (Array.isArray(prev) ? prev : []).filter((customerId) => validIds.has(String(customerId || '').trim()))
        ));
    }, [filteredCustomersLive]);

    useEffect(() => {
        if (campaignSelectionMode) return;
        if (selectedCustomerIdsForCampaign.length === 0) return;
        setSelectedCustomerIdsForCampaign([]);
    }, [campaignSelectionMode, selectedCustomerIdsForCampaign.length]);

    const handleAddressDepartmentChange = useCallback((nextDepartmentIdRaw = '') => {
        const departmentId = normalizeGeoNumericId(nextDepartmentIdRaw);
        const department = geoDepartmentOptions.find((item) => item.id === departmentId) || null;
        setAddressForm((prev) => ({
            ...prev,
            departmentId,
            departmentName: String(department?.name || '').trim(),
            provinceId: '',
            provinceName: '',
            districtId: '',
            districtName: ''
        }));
    }, [geoDepartmentOptions]);

    const handleAddressProvinceChange = useCallback((nextProvinceIdRaw = '') => {
        const provinceId = normalizeGeoNumericId(nextProvinceIdRaw);
        const province = geoProvinceById.get(provinceId) || null;
        setAddressForm((prev) => ({
            ...prev,
            provinceId,
            provinceName: String(province?.name || '').trim(),
            districtId: '',
            districtName: ''
        }));
    }, [geoProvinceById]);

    const handleAddressDistrictChange = useCallback((nextDistrictIdRaw = '') => {
        const districtId = normalizeGeoDistrictId(nextDistrictIdRaw);
        const district = geoDistrictById.get(districtId) || null;
        const province = district ? geoProvinceById.get(String(district.provinceId || '').trim()) || null : null;
        const department = district
            ? geoDepartmentOptions.find((item) => item.id === String(district.departmentId || '').trim()) || null
            : null;
        setAddressForm((prev) => ({
            ...prev,
            districtId,
            districtName: String(district?.name || '').trim(),
            provinceId: String(district?.provinceId || prev.provinceId || '').trim(),
            provinceName: String(province?.name || prev.provinceName || '').trim(),
            departmentId: String(district?.departmentId || prev.departmentId || '').trim(),
            departmentName: String(department?.name || prev.departmentName || '').trim()
        }));
    }, [geoDepartmentOptions, geoDistrictById, geoProvinceById]);

    const resolveAddressLocationLabel = useCallback((address = {}) => {
        const source = address && typeof address === 'object' ? address : {};
        const rawDistrictName = String(source.districtName || source.district_name || '').trim();
        const rawProvinceName = String(source.provinceName || source.province_name || '').trim();
        const rawDepartmentName = String(source.departmentName || source.department_name || '').trim();
        const districtId = normalizeGeoDistrictId(
            source.districtId
            || source.district_id
            || (isLikelyGeoCode(rawDistrictName) ? rawDistrictName : '')
        );

        if (districtId) {
            const district = geoDistrictById.get(districtId) || null;
            if (district) {
                const province = geoProvinceById.get(String(district.provinceId || '').trim()) || null;
                const department = geoDepartmentById.get(String(district.departmentId || '').trim()) || null;
                const resolved = [
                    String(district.name || '').trim(),
                    String(province?.name || '').trim(),
                    String(department?.name || '').trim()
                ].filter(Boolean).join(' - ');
                if (resolved) return resolved;
            }
        }

        const fromNames = [rawDistrictName, rawProvinceName, rawDepartmentName]
            .filter((entry) => entry && !isLikelyGeoCode(entry))
            .join(' - ');
        if (fromNames) return fromNames;

        const generic = buildAddressLocationLabel(source);
        return generic || '-';
    }, [geoDepartmentById, geoDistrictById, geoProvinceById]);

    const resetAddressEditor = useCallback(() => {
        setAddressEditorMode('create');
        setAddressEditorOpen(false);
        setAddressForm(EMPTY_ADDRESS_FORM);
    }, []);

    const handleSelectAddress = useCallback((address = {}) => {
        const addressId = String(address?.addressId || '').trim();
        if (!addressId) return;
        setSelectedAddressId(addressId);
        setAddressPanelMode('address-detail');
        setAddressEditorOpen(false);
        setAddressEditorMode('create');
        setAddressForm(EMPTY_ADDRESS_FORM);
        setAddressesError('');
    }, []);

    const handleStartCreateAddress = useCallback(() => {
        if (!selectedCustomerIdResolved) return;
        setAddressPanelMode('address-edit');
        setAddressEditorMode('create');
        setAddressEditorOpen(true);
        setAddressForm({ ...EMPTY_ADDRESS_FORM });
        setAddressesError('');
        setSelectedAddressId('');
    }, [selectedCustomerIdResolved]);

    const handleStartEditAddress = useCallback((address = {}) => {
        if (!selectedCustomerIdResolved) return;
        const addressId = String(address?.addressId || '').trim();
        setAddressPanelMode('address-edit');
        setAddressEditorMode('edit');
        setAddressEditorOpen(true);
        setAddressForm(buildAddressFormFromRecord(address));
        setAddressesError('');
        setSelectedAddressId(addressId);
    }, [selectedCustomerIdResolved]);

    const handleBackToCustomerDetail = useCallback(() => {
        setAddressPanelMode('customer');
        setAddressEditorOpen(false);
        setAddressEditorMode('create');
        setAddressForm(EMPTY_ADDRESS_FORM);
        setAddressesError('');
    }, []);

    const handleSaveAddress = useCallback(async () => {
        const customerId = selectedCustomerIdResolved;
        if (!customerId) return;
        const street = String(addressForm.street || '').trim();
        if (!street) {
            setAddressesError('La direccion (street) es obligatoria.');
            return;
        }
        const payload = {
            addressType: String(addressForm.addressType || 'other').trim() || 'other',
            street,
            reference: String(addressForm.reference || '').trim(),
            mapsUrl: String(addressForm.mapsUrl || '').trim(),
            districtId: normalizeGeoDistrictId(addressForm.districtId || ''),
            districtName: String(addressForm.districtName || '').trim(),
            provinceName: String(addressForm.provinceName || '').trim(),
            departmentName: String(addressForm.departmentName || '').trim(),
            latitude: String(addressForm.latitude || '').trim(),
            longitude: String(addressForm.longitude || '').trim(),
            isPrimary: Boolean(addressForm.isPrimary)
        };
        setAddressBusy(true);
        setAddressesError('');
        try {
            let savedAddressId = '';
            if (addressEditorMode === 'edit' && String(addressForm.addressId || '').trim()) {
                await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(String(addressForm.addressId || '').trim())}`, {
                    method: 'PUT',
                    body: payload
                });
                savedAddressId = String(addressForm.addressId || '').trim();
            } else {
                const createdPayload = await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/addresses`, {
                    method: 'POST',
                    body: payload
                });
                savedAddressId = String(createdPayload?.item?.addressId || createdPayload?.item?.address_id || '').trim();
            }
            await loadCustomerAddressesByCustomer(customerId);
            if (savedAddressId) {
                setSelectedAddressId(savedAddressId);
                setAddressPanelMode('address-detail');
            } else {
                setAddressPanelMode('customer');
            }
            resetAddressEditor();
        } catch (error) {
            setAddressesError(String(error?.message || 'No se pudo guardar la direccion.'));
        } finally {
            setAddressBusy(false);
        }
    }, [addressEditorMode, addressForm, loadCustomerAddressesByCustomer, requestJson, resetAddressEditor, selectedCustomerIdResolved]);

    const handleDeleteAddress = useCallback(async (addressIdRaw = '') => {
        const customerId = selectedCustomerIdResolved;
        const addressId = String(addressIdRaw || '').trim();
        if (!customerId || !addressId) return;
        setAddressBusy(true);
        setAddressesError('');
        try {
            await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(addressId)}`, {
                method: 'DELETE'
            });
            await loadCustomerAddressesByCustomer(customerId);
            if (String(addressForm.addressId || '').trim() === addressId) {
                resetAddressEditor();
            }
            const previousSelectedId = String(selectedAddressId || '').trim();
            if (previousSelectedId === addressId) {
                setSelectedAddressId('');
                setAddressPanelMode('customer');
            }
        } catch (error) {
            setAddressesError(String(error?.message || 'No se pudo eliminar la direccion.'));
        } finally {
            setAddressBusy(false);
        }
    }, [addressForm.addressId, loadCustomerAddressesByCustomer, requestJson, resetAddressEditor, selectedAddressId, selectedCustomerIdResolved]);

    const handleSetPrimaryAddress = useCallback(async (addressIdRaw = '') => {
        const customerId = selectedCustomerIdResolved;
        const addressId = String(addressIdRaw || '').trim();
        if (!customerId || !addressId) return;
        setAddressBusy(true);
        setAddressesError('');
        try {
            await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(addressId)}/set-primary`, {
                method: 'PATCH'
            });
            await loadCustomerAddressesByCustomer(customerId);
        } catch (error) {
            setAddressesError(String(error?.message || 'No se pudo actualizar direccion principal.'));
        } finally {
            setAddressBusy(false);
        }
    }, [loadCustomerAddressesByCustomer, requestJson, selectedCustomerIdResolved]);

    useEffect(() => {
        if (!isCustomersSection || customerPanelMode === 'create') {
            setModuleContexts([]);
            setModuleContextsError('');
            setModuleConsentDraftByModuleId({});
            setCustomerAddresses([]);
            setAddressesError('');
            setSelectedAddressId('');
            setAddressPanelMode('customer');
            resetAddressEditor();
            return;
        }

        if (!selectedCustomerIdResolved) {
            setModuleContexts([]);
            setModuleContextsError('');
            setModuleConsentDraftByModuleId({});
            setCustomerAddresses([]);
            setAddressesError('');
            setSelectedAddressId('');
            setAddressPanelMode('customer');
            resetAddressEditor();
            return;
        }

        loadModuleContextsByCustomer(selectedCustomerIdResolved);
        loadCustomerAddressesByCustomer(selectedCustomerIdResolved);
    }, [
        customerPanelMode,
        isCustomersSection,
        loadCustomerAddressesByCustomer,
        loadModuleContextsByCustomer,
        resetAddressEditor,
        selectedCustomerIdResolved
    ]);

    useEffect(() => {
        setAddressPanelMode('customer');
        setSelectedAddressId('');
        resetAddressEditor();
    }, [resetAddressEditor, selectedCustomerIdResolved]);

    if (!isCustomersSection) {
        return null;
    }

    const renderModuleContextsContent = () => {
        if (moduleContextsLoading) {
            return <p>Cargando contextos por modulo...</p>;
        }
        if (moduleContextsError) {
            return <p>{moduleContextsError}</p>;
        }
        if (moduleContexts.length === 0) {
            return <p>Este cliente aun no tiene contextos por modulo registrados.</p>;
        }
        return (
            <div className="saas-customers-context-list">
                {moduleContexts.map((moduleContext, contextIndex) => {
                    const moduleId = String(moduleContext.moduleId || '').trim();
                    const moduleLabel = moduleNameById[moduleId] || moduleId || 'Sin modulo';
                    const consentValue = String(moduleConsentDraftByModuleId[moduleId] || moduleContext.marketingOptInStatus || 'unknown').trim().toLowerCase();
                    const consentBusyForModule = Boolean(moduleConsentBusyByModuleId[moduleId]);
                    const labels = Array.isArray(moduleContext.labels) ? moduleContext.labels : [];
                    return (
                        <div key={moduleId || `customer-module-context-${contextIndex}`} className="saas-customers-context-item">
                            <div className="saas-customers-kv-grid">
                                <div><span>Modulo</span><strong>{moduleLabel}</strong></div>
                                <div><span>Estado comercial</span><strong>{moduleContext.commercialStatus || 'unknown'}</strong></div>
                                <div><span>Vendedora asignada</span><strong>{moduleContext.assignmentUserId || '-'}</strong></div>
                                <div><span>Etiquetas</span><strong>{labels.length > 0 ? labels.join(', ') : '-'}</strong></div>
                                <div><span>Primera interaccion</span><strong>{formatDateTimeLabel(moduleContext.firstInteractionAt)}</strong></div>
                                <div><span>Ultima interaccion</span><strong>{formatDateTimeLabel(moduleContext.lastInteractionAt)}</strong></div>
                            </div>
                            <div className="saas-admin-form-row">
                                <label className="saas-admin-module-toggle" style={{ minWidth: 220 }}>
                                    <span>Consentimiento marketing</span>
                                </label>
                                <select
                                    value={consentValue}
                                    onChange={(event) => {
                                        handleModuleConsentChange(moduleId, event.target.value);
                                    }}
                                    disabled={busy || languageBusy || consentBusyForModule || !moduleId}
                                >
                                    <option value="unknown">Sin definir</option>
                                    <option value="opted_in">Opted in</option>
                                    <option value="opted_out">Opted out</option>
                                </select>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderAddressesContent = () => {
        if (addressesLoading) {
            return <p>Cargando direcciones...</p>;
        }
        const hasAddresses = effectiveAddresses.length > 0;
        return (
            <div className="saas-customers-addresses-wrap">
                <div className="saas-customers-address-toolbar">
                    <button
                        type="button"
                        disabled={busy || addressBusy || !selectedCustomerIdResolved}
                        onClick={handleStartCreateAddress}
                    >
                        Agregar direccion
                    </button>
                </div>
                {addressesError ? (
                    <div className="saas-admin-inline-feedback error">{addressesError}</div>
                ) : null}
                {hasAddresses ? (
                    <div className="saas-customers-address-table-wrap">
                        <SaasDataTable
                            columns={[
                                { key: 'tipo', label: 'Tipo', width: '12%' },
                                { key: 'direccion', label: 'Direccion', width: '34%' },
                                { key: 'referencia', label: 'Referencia', width: '22%' },
                                { key: 'ubicacion', label: 'Ubicacion', width: '24%' },
                                { key: 'principal', label: 'Principal', width: '8%', align: 'center' }
                            ]}
                            rows={effectiveAddresses.map((address, index) => ({
                                id: String(address?.addressId || `address-${index}`).trim(),
                                tipo: resolveAddressTypeLabel(address?.addressType),
                                direccion: String(address?.street || '-').trim() || '-',
                                referencia: String(address?.reference || '-').trim() || '-',
                                ubicacion: resolveAddressLocationLabel(address),
                                principal: address?.isPrimary ? 'Si' : 'No',
                                _raw: address
                            }))}
                            loading={Boolean(addressesLoading)}
                            emptyText="No hay direcciones registradas."
                            enableInfinite={false}
                            selectedId={String(selectedAddressId || '').trim() || null}
                            onSelect={(row) => handleSelectAddress(row?._raw)}
                        />
                    </div>
                ) : (
                    <div className="saas-customers-address-editor-wrap">
                        <p>Este cliente no tiene direcciones registradas.</p>
                    </div>
                )}
            </div>
        );
    };

    const renderAddressEditorContent = () => (
        <div className="saas-customers-address-editor">
            <div className="saas-admin-form-row">
                <select
                    value={addressForm.addressType}
                    onChange={(event) => setAddressForm((prev) => ({ ...prev, addressType: event.target.value }))}
                    disabled={busy || addressBusy}
                >
                    {ADDRESS_TYPE_OPTIONS.map((option) => (
                        <option key={`address-type-${option.value}`} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <label className="saas-admin-module-toggle">
                    <input
                        type="checkbox"
                        checked={Boolean(addressForm.isPrimary)}
                        onChange={(event) => setAddressForm((prev) => ({ ...prev, isPrimary: event.target.checked }))}
                        disabled={busy || addressBusy}
                    />
                    <span>Principal</span>
                </label>
            </div>
            <div className="saas-admin-form-row">
                <input
                    value={addressForm.street}
                    onChange={(event) => setAddressForm((prev) => ({ ...prev, street: event.target.value }))}
                    placeholder="Direccion"
                    disabled={busy || addressBusy}
                />
                <input
                    value={addressForm.reference}
                    onChange={(event) => setAddressForm((prev) => ({ ...prev, reference: event.target.value }))}
                    placeholder="Referencia"
                    disabled={busy || addressBusy}
                />
            </div>
            <div className="saas-admin-form-row">
                <select
                    value={String(addressForm.departmentId || '').trim()}
                    onChange={(event) => handleAddressDepartmentChange(event.target.value)}
                    disabled={busy || addressBusy || loadingGeoCatalog}
                >
                    <option value="">
                        {loadingGeoCatalog ? 'Cargando departamentos...' : 'Departamento'}
                    </option>
                    {geoDepartmentOptions.map((entry) => (
                        <option key={`geo-dep-${entry.id}`} value={entry.id}>{entry.name}</option>
                    ))}
                </select>
                <select
                    value={String(addressForm.provinceId || '').trim()}
                    onChange={(event) => handleAddressProvinceChange(event.target.value)}
                    disabled={busy || addressBusy || !String(addressForm.departmentId || '').trim()}
                >
                    <option value="">
                        {String(addressForm.departmentId || '').trim() ? 'Provincia' : 'Selecciona departamento'}
                    </option>
                    {addressProvinceOptions.map((entry) => (
                        <option key={`geo-prov-${entry.id}`} value={entry.id}>{entry.name}</option>
                    ))}
                </select>
            </div>
            <div className="saas-admin-form-row">
                <select
                    value={String(addressForm.districtId || '').trim()}
                    onChange={(event) => handleAddressDistrictChange(event.target.value)}
                    disabled={busy || addressBusy || !String(addressForm.provinceId || '').trim()}
                >
                    <option value="">
                        {String(addressForm.provinceId || '').trim() ? 'Distrito' : 'Selecciona provincia'}
                    </option>
                    {addressDistrictOptions.map((entry) => (
                        <option key={`geo-dist-${entry.id}`} value={entry.id}>{entry.name}</option>
                    ))}
                </select>
                <input
                    value={addressForm.mapsUrl}
                    onChange={(event) => setAddressForm((prev) => ({ ...prev, mapsUrl: event.target.value }))}
                    placeholder="URL Google Maps"
                    disabled={busy || addressBusy}
                />
            </div>
            {geoCatalogError ? (
                <div className="saas-admin-inline-feedback error">{geoCatalogError}</div>
            ) : null}
            <div className="saas-admin-form-row">
                <input
                    value={addressForm.latitude}
                    onChange={(event) => setAddressForm((prev) => ({ ...prev, latitude: event.target.value }))}
                    placeholder="Latitud"
                    disabled={busy || addressBusy}
                />
                <input
                    value={addressForm.longitude}
                    onChange={(event) => setAddressForm((prev) => ({ ...prev, longitude: event.target.value }))}
                    placeholder="Longitud"
                    disabled={busy || addressBusy}
                />
            </div>
            {addressesError ? (
                <div className="saas-admin-inline-feedback error">{addressesError}</div>
            ) : null}
        </div>
    );

    const renderAddressDetailContent = () => {
        if (!selectedAddress) {
            return <p>No se encontro la direccion seleccionada.</p>;
        }
        return (
            <div className="saas-customers-address-detail">
                <div className="saas-customers-kv-grid">
                    <div><span>Tipo</span><strong>{resolveAddressTypeLabel(selectedAddress.addressType)}</strong></div>
                    <div><span>Principal</span><strong>{selectedAddress.isPrimary ? 'Si' : 'No'}</strong></div>
                    <div><span>Direccion</span><strong>{selectedAddress.street || '-'}</strong></div>
                    <div><span>Referencia</span><strong>{selectedAddress.reference || '-'}</strong></div>
                    <div><span>Ubicacion</span><strong>{resolveAddressLocationLabel(selectedAddress)}</strong></div>
                    <div><span>Google Maps</span><strong>{selectedAddress.mapsUrl || '-'}</strong></div>
                    <div><span>Latitud</span><strong>{selectedAddress.latitude || '-'}</strong></div>
                    <div><span>Longitud</span><strong>{selectedAddress.longitude || '-'}</strong></div>
                </div>
                {addressesError ? (
                    <div className="saas-admin-inline-feedback error">{addressesError}</div>
                ) : null}
            </div>
        );
    };

    const headerActions = [
        {
            key: 'add-customer',
            label: 'Agregar',
            onClick: openCustomerCreate,
            variant: 'primary',
            disabled: busy || tenantScopeLocked
        },
        {
            key: 'import-erp',
            label: 'Importar ERP',
            onClick: () => setShowImportModal(true),
            variant: 'primary',
            disabled: busy || tenantScopeLocked
        },
        {
            key: 'toggle-selection',
            label: campaignSelectionMode ? 'Cancelar seleccion' : 'Seleccionar clientes',
            onClick: () => {
                if (campaignSelectionMode) {
                    exitCampaignSelectionMode();
                    return;
                }
                setCampaignSelectionMode(true);
            },
            variant: 'secondary',
            disabled: busy || tenantScopeLocked
        },
        campaignSelectionMode && selectedCustomerIdsForCampaign.length > 0 && outreachMode === 'eligible' ? {
            key: 'send-template',
            label: `Enviar campaña${selectedCustomerIdsForCampaign.length > 0 ? ` (${selectedCustomerIdsForCampaign.length})` : ''}`,
            onClick: () => { void handleOpenCampaignTemplateModal(); },
            variant: 'secondary',
            disabled: busy || tenantScopeLocked || !outreachModuleId
        } : null,
        campaignSelectionMode && selectedCustomerIdsForCampaign.length > 0 && outreachMode === 'assign' ? {
            key: 'assign-module',
            label: `Asignar al modulo${selectedCustomerIdsForCampaign.length > 0 ? ` (${selectedCustomerIdsForCampaign.length})` : ''}`,
            onClick: () => { void handleOpenCampaignTemplateModal(); },
            variant: 'secondary',
            disabled: busy || tenantScopeLocked || !outreachModuleId
        } : null,
        {
            key: 'refresh-customers',
            label: 'Recargar',
            onClick: () => { void refreshCustomersView({ forceFullReload: false, silent: false }); },
            variant: 'secondary',
            disabled: busy || tenantScopeLocked || customersLoadingBatch
        },
        {
            key: 'toggle-columns',
            label: 'Columnas',
            onClick: () => setShowColumnsMenu((prev) => !prev),
            variant: 'secondary',
            disabled: busy || tenantScopeLocked
        }
    ].filter(Boolean);

    const headerFilterColumns = filterColumns.map((column) => ({
        key: column.key,
        label: column.label || column.key,
        type: column.type || 'text',
        options: Array.isArray(column.options) ? column.options : []
    }));

    const headerElement = (
        <SaasViewHeader
            title="Clientes"
            count={tenantScopeLocked ? 0 : sortedAndFilteredRows.length}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Buscar por codigo, nombre, telefono, email o documento"
            searchDisabled={busy || tenantScopeLocked}
            actions={headerActions.filter((action) => action.key !== 'toggle-columns')}
            actionsExtra={(
                <div className="saas-entity-columns">
                    <button type="button" className="saas-header-btn saas-header-btn--secondary saas-btn-columns" onClick={() => setShowColumnsMenu((prev) => !prev)} disabled={busy || tenantScopeLocked}>
                        Columnas
                    </button>
                    {showColumnsMenu ? (
                        <div className="saas-entity-columns__menu">
                            {CUSTOMER_TABLE_COLUMNS.map((column) => (
                                <label key={column.key} className="saas-entity-columns__item">
                                    <input
                                        type="checkbox"
                                        checked={columnPrefs.isColumnVisible(column.key)}
                                        onChange={() => columnPrefs.toggleColumn(column.key)}
                                    />
                                    <span>{column.label}</span>
                                </label>
                            ))}
                            <div className="saas-entity-columns__actions">
                                <button type="button" onClick={() => columnPrefs.setVisibleColumnKeys(CUSTOMER_TABLE_COLUMNS.map((column) => column.key))}>
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
                columns: headerFilterColumns,
                items: headerFilters,
                onItemsChange: setHeaderFilters,
                onClear: () => setHeaderFilters([{ id: 'customers_filter_1', columnKey: '', operator: 'contains', value: '' }])
            }}
            sortConfig={{
                ...sortConfig,
                columns: headerFilterColumns
            }}
            onSortChange={setSortConfig}
            extra={(
                <div className="saas-customers-header-extra">
                    {campaignSelectionMode ? (
                        <div className="saas-customers-outreach-toolbar">
                            <label className="saas-customers-outreach-toolbar__field">
                                <span>Modulo</span>
                                <select value={outreachModuleId} onChange={(event) => {
                                    setOutreachModuleId(String(event.target.value || '').trim().toLowerCase());
                                    setSelectedCustomerIdsForCampaign([]);
                                }}>
                                    <option value="">Selecciona modulo</option>
                                    {outreachModuleOptions.map((moduleItem) => (
                                        <option key={`customers_outreach_module_${moduleItem.moduleId}`} value={moduleItem.moduleId}>
                                            {moduleItem.label}
                                        </option>
                                    ))}
                                </select>
                                <small>Trabaja por ID de modulo normalizado para evitar cruces por mayusculas o nombre.</small>
                            </label>
                            <label className="saas-customers-outreach-toolbar__field">
                                <span>Modo</span>
                                <select value={outreachMode} onChange={(event) => {
                                    setOutreachMode(String(event.target.value || 'eligible').trim() || 'eligible');
                                    setSelectedCustomerIdsForCampaign([]);
                                }} disabled={!outreachModuleId}>
                                    <option value="eligible">Seleccionar elegibles</option>
                                    <option value="assign">Asignar al modulo</option>
                                </select>
                                <small>{outreachMode === 'assign' ? 'Muestra clientes fuera del modulo para asignarlos y enviar opt-in.' : 'Muestra solo clientes que ya pertenecen al modulo elegido.'}</small>
                            </label>
                        </div>
                    ) : null}
                    {campaignSelectionMode ? (
                        <div className="saas-customers-selection-pill">
                            {selectedCustomerIdsForCampaign.length > 0
                                ? `${selectedCustomerIdsForCampaign.length} cliente${selectedCustomerIdsForCampaign.length === 1 ? '' : 's'} seleccionado${selectedCustomerIdsForCampaign.length === 1 ? '' : 's'}`
                                : !outreachModuleId
                                    ? 'Selecciona un modulo para preparar outreach.'
                                    : outreachEligibilityLoading
                                        ? 'Calculando elegibilidad por modulo...'
                                        : outreachMode === 'assign'
                                            ? `${outreachNonEligibleCustomerIds.length} cliente(s) fuera del modulo listos para asignacion`
                                            : `${outreachEligibleCustomerIds.length} cliente(s) elegibles en el modulo`}
                        </div>
                    ) : null}
                    {campaignSelectionMode && outreachEligibilityError ? (
                        <div className="saas-admin-inline-feedback error">{outreachEligibilityError}</div>
                    ) : null}
                    {(customersLoadingBatch || savingCustomer) ? (
                        <div className="saas-admin-inline-feedback">
                            {customersLoadingBatch ? `Cargando clientes... ${Math.max(0, Math.min(100, Number(customersLoadProgress) || 0))}%` : null}
                            {customersLoadingBatch && savingCustomer ? ' | ' : null}
                            {savingCustomer ? 'Guardando cliente...' : null}
                        </div>
                    ) : null}
                    {(savingCustomer || showCustomerSynced) ? (
                        <div className={`saas-customers-sync-indicator${savingCustomer ? ' is-saving' : ' is-synced'}`}>
                            <span className="saas-customers-sync-indicator__dot" />
                            <span>{savingCustomer ? 'Guardando...' : 'Sincronizado'}</span>
                        </div>
                    ) : null}
                </div>
            )}
        />
    );

    const leftPane = (
        <div className="saas-customers-pane">
            <SaasDataTable
                columns={tableColumns}
                rows={tenantScopeLocked ? [] : visibleTableRows}
                selectedId={tableSelectedId}
                sortConfig={sortConfig}
                onSortChange={setSortConfig}
                onSelect={(row) => {
                    if (tenantScopeLocked) return;
                    openCustomerView(row?.id || row?._raw);
                }}
                loading={busy && !tenantScopeLocked}
                emptyText={tenantScopeLocked ? 'Selecciona una empresa para ver clientes.' : 'No hay clientes para esta empresa.'}
            />
        </div>
    );

    const rightPane = (!tenantScopeLocked && (selectedCustomer || customerPanelMode === 'create')) ? (
        <div className="saas-customers-right-shell">
            {customerPanelMode === 'view' && selectedCustomer && addressPanelMode === 'address-detail' ? (
                <SaasDetailPanel
                    title="Detalle de direccion"
                    subtitle={`${selectedCustomer?.contactName || selectedCustomer?.customerId || 'Cliente'}${selectedAddress ? ` · ${resolveAddressTypeLabel(selectedAddress?.addressType)}` : ''}`}
                    className="saas-customers-detail-panel"
                    bodyClassName="saas-customers-detail-panel__body"
                    actions={(
                        <div className="saas-customers-detail-actions">
                            <button type="button" disabled={busy || addressBusy || !selectedAddress} onClick={() => handleStartEditAddress(selectedAddress || {})}>Editar direccion</button>
                            <button type="button" disabled={busy || addressBusy || !selectedAddress || Boolean(selectedAddress?.isPrimary)} onClick={() => handleSetPrimaryAddress(selectedAddress?.addressId || '')}>Marcar principal</button>
                            <button type="button" disabled={busy || addressBusy || !selectedAddress} onClick={() => handleDeleteAddress(selectedAddress?.addressId || '')}>Eliminar direccion</button>
                            <button type="button" disabled={busy || addressBusy} onClick={handleBackToCustomerDetail}>Volver al cliente</button>
                        </div>
                    )}
                >
                    <SaasDetailPanelSection title="Datos de direccion" defaultOpen>
                        {renderAddressDetailContent()}
                    </SaasDetailPanelSection>
                </SaasDetailPanel>
            ) : customerPanelMode === 'view' && selectedCustomer && addressPanelMode === 'address-edit' ? (
                <SaasDetailPanel
                    title={addressEditorMode === 'edit' ? 'Editar direccion' : 'Nueva direccion'}
                    subtitle={`${selectedCustomer?.contactName || selectedCustomer?.customerId || 'Cliente'}`}
                    className="saas-customers-detail-panel"
                    bodyClassName="saas-customers-detail-panel__body"
                    actions={(
                        <div className="saas-customers-detail-actions">
                            <button
                                type="button"
                                disabled={busy || addressBusy || !selectedCustomerIdResolved}
                                onClick={handleSaveAddress}
                            >
                                {addressEditorMode === 'edit' ? 'Actualizar direccion' : 'Guardar direccion'}
                            </button>
                            <button type="button" className="saas-btn-cancel" disabled={busy || addressBusy} onClick={() => { void handleRequestCancelAddressEdit(); }}>Cancelar</button>
                            <button type="button" className="saas-btn-close" disabled={busy || addressBusy} onClick={() => { void handleRequestCancelAddressEdit(); }}>Volver al cliente</button>
                        </div>
                    )}
                >
                    <SaasDetailPanelSection title="Formulario de direccion" defaultOpen>
                        {renderAddressEditorContent()}
                    </SaasDetailPanelSection>
                </SaasDetailPanel>
            ) : customerPanelMode === 'view' && selectedCustomer ? (
                <SaasDetailPanel
                    title={selectedCustomer?.contactName || selectedCustomer?.customerId || 'Cliente'}
                    subtitle={`Codigo: ${selectedCustomer?.customerId || '-'}`}
                    className="saas-customers-detail-panel"
                    bodyClassName="saas-customers-detail-panel__body"
                    actions={(
                        <div className="saas-customers-detail-actions">
                            <button type="button" disabled={busy || !selectedCustomerPhone} onClick={() => { void handleOpenDirectTemplateModal(); }}>
                                Iniciar conversacion
                            </button>
                            <button type="button" disabled={editClickBusy} onClick={handleOpenCustomerEdit}>Editar</button>
                            <button type="button" disabled={busy} onClick={handleSoftDeleteCustomer}>Eliminar</button>
                            <button type="button" className="saas-btn-close" disabled={busy} onClick={() => { void handleRequestCloseCustomersPanel(); }}>Volver</button>
                        </div>
                    )}
                >
                    <SaasDetailPanelSection title="Datos personales" defaultOpen>
                        {(() => {
                            const nameParts = buildNamePartsFromCustomer(selectedCustomer);
                            return (
                                <div className="saas-customers-kv-grid">
                                    <div><span>Nombre completo</span><strong>{buildCustomerDisplayName(selectedCustomer)}</strong></div>
                                    <div><span>Nombres</span><strong>{nameParts.firstName || '-'}</strong></div>
                                    <div><span>Apellido paterno</span><strong>{nameParts.lastNamePaternal || '-'}</strong></div>
                                    <div><span>Apellido materno</span><strong>{nameParts.lastNameMaternal || '-'}</strong></div>
                                    <div><span>Tipo de cliente</span><strong>{buildCustomerTypeLabel(selectedCustomer, customerLabelMaps)}</strong></div>
                                    <div><span>Fuente</span><strong>{buildAcquisitionSourceLabel(selectedCustomer, customerLabelMaps)}</strong></div>
                                    <div><span>Tratamiento</span><strong>{buildTreatmentLabel(selectedCustomer, customerLabelMaps)}</strong></div>
                                    <div><span>Estado</span><strong>{selectedCustomer?.isActive === false ? 'Inactivo' : 'Activo'}</strong></div>
                                </div>
                            );
                        })()}
                    </SaasDetailPanelSection>

                    <SaasDetailPanelSection title="Contacto" defaultOpen>
                        <div className="saas-customers-kv-grid">
                            <div><span>Telefono</span><strong>{selectedCustomer?.phoneE164 || '-'}</strong></div>
                            <div><span>Telefono 2</span><strong>{selectedCustomer?.phoneAlt || '-'}</strong></div>
                            <div><span>Email</span><strong>{selectedCustomer?.email || '-'}</strong></div>
                            <div><span>Etiquetas</span><strong>{Array.isArray(selectedCustomer?.tags) ? selectedCustomer.tags.join(', ') : '-'}</strong></div>
                            <div><span>Actualizado</span><strong>{formatDateTimeLabel(selectedCustomer?.updatedAt)}</strong></div>
                        </div>
                        <div className="saas-admin-form-row">
                            <label className="saas-admin-module-toggle" style={{ minWidth: 220 }}>
                                <span>Idioma preferido</span>
                            </label>
                            <select
                                value={selectedPreferredLanguage}
                                onChange={(event) => {
                                    handlePreferredLanguageChange(event.target.value);
                                }}
                                disabled={busy || languageBusy}
                            >
                                <option value="es">Espanol (es)</option>
                                <option value="en">Ingles (en)</option>
                                <option value="pt">Portugues (pt)</option>
                            </select>
                        </div>
                    </SaasDetailPanelSection>

                    <SaasDetailPanelSection title="Documento" defaultOpen>
                        <div className="saas-customers-kv-grid">
                            <div><span>Documento</span><strong>{selectedCustomer?.documentNumber || readProfileValue(selectedCustomer?.profile, 'documentNumber', 'numeroDocumentoIdentidad', 'document_number') || '-'}</strong></div>
                            <div><span>Tipo documento</span><strong>{buildDocumentTypeLabel(selectedCustomer, customerLabelMaps)}</strong></div>
                            <div><span>Notas</span><strong>{selectedCustomer?.notes || readProfileValue(selectedCustomer?.profile, 'notes', 'observacionCliente', 'observacion_cliente') || '-'}</strong></div>
                        </div>
                    </SaasDetailPanelSection>

                    <SaasDetailPanelSection title="Direcciones" defaultOpen>
                        {renderAddressesContent()}
                    </SaasDetailPanelSection>

                    <SaasDetailPanelSection title="Contextos por modulo" defaultOpen>
                        {renderModuleContextsContent()}
                    </SaasDetailPanelSection>
                </SaasDetailPanel>
            ) : (
                <SaasDetailPanel
                    title={customerPanelMode === 'create' ? 'Nuevo cliente' : 'Editando cliente'}
                    subtitle="Completa los datos y guarda cambios."
                    className="saas-customers-detail-panel"
                    bodyClassName="saas-customers-detail-panel__body"
                    actions={(
                        <div className="saas-customers-detail-actions">
                            <button
                                type="button"
                                disabled={busy || savingCustomer || !customerForm.contactName.trim() || !customerForm.phoneE164.trim()}
                                onClick={handleSaveCustomer}
                            >
                                {customerPanelMode === 'create' ? 'Guardar cliente' : 'Actualizar cliente'}
                            </button>
                            <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void handleRequestCancelCustomerEdit(); }}>Cancelar</button>
                            <button type="button" className="saas-btn-close" disabled={busy} onClick={() => { void handleRequestCloseCustomersPanel(); }}>Volver</button>
                        </div>
                    )}
                >
                    <SaasDetailPanelSection title="Datos personales" defaultOpen>
                    <div className="saas-admin-form-row">
                        <input value={customerForm.contactName} onChange={(event) => setCustomerForm((prev) => ({ ...prev, contactName: event.target.value }))} placeholder="Nombre contacto" disabled={busy} />
                        <input
                            value={firstNameValue}
                            onChange={(event) => setCustomerForm((prev) => ({
                                ...prev,
                                firstName: event.target.value,
                                first_name: event.target.value,
                                profileFirstNames: event.target.value
                            }))}
                            placeholder="Nombres"
                            disabled={busy}
                        />
                    </div>
                    <div className="saas-admin-form-row">
                        <input
                            value={lastNamePaternalValue}
                            onChange={(event) => setCustomerForm((prev) => ({
                                ...prev,
                                lastNamePaternal: event.target.value,
                                last_name_paternal: event.target.value,
                                profileLastNamePaternal: event.target.value
                            }))}
                            placeholder="Apellido paterno"
                            disabled={busy}
                        />
                        <input
                            value={lastNameMaternalValue}
                            onChange={(event) => setCustomerForm((prev) => ({
                                ...prev,
                                lastNameMaternal: event.target.value,
                                last_name_maternal: event.target.value,
                                profileLastNameMaternal: event.target.value
                            }))}
                            placeholder="Apellido materno"
                            disabled={busy}
                        />
                    </div>
                    <div className="saas-admin-form-row">
                        <select
                            value={resolveCatalogSelectValue(customerForm.customerTypeId, customerTypeOptions)}
                            onChange={(event) => setCustomerForm((prev) => ({ ...prev, customerTypeId: event.target.value }))}
                            disabled={busy || loadingCustomerCatalogs}
                        >
                            <option value="">{loadingCustomerCatalogs ? 'Cargando tipos...' : 'Tipo de cliente'}</option>
                            {customerTypeOptions.map((item) => (
                                <option key={`customer-type-${item.id}`} value={item.id}>{item.label}</option>
                            ))}
                        </select>
                        <select
                            value={resolveCatalogSelectValue(customerForm.treatmentId, treatmentOptions)}
                            onChange={(event) => setCustomerForm((prev) => ({ ...prev, treatmentId: event.target.value }))}
                            disabled={busy || loadingCustomerCatalogs}
                        >
                            <option value="">{loadingCustomerCatalogs ? 'Cargando tratamientos...' : 'Tratamiento'}</option>
                            {treatmentOptions.map((item) => (
                                <option key={`customer-treatment-${item.id}`} value={item.id}>{item.abbreviation || item.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="saas-admin-form-row">
                        <select
                            value={resolveCatalogSelectValue(customerForm.acquisitionSourceId, sourceOptions)}
                            onChange={(event) => setCustomerForm((prev) => ({ ...prev, acquisitionSourceId: event.target.value }))}
                            disabled={busy || loadingCustomerCatalogs}
                        >
                            <option value="">{loadingCustomerCatalogs ? 'Cargando fuentes...' : 'Fuente de adquisicion'}</option>
                            {sourceOptions.map((item) => (
                                <option key={`customer-source-${item.id}`} value={item.id}>{item.label}</option>
                            ))}
                        </select>
                    </div>
                </SaasDetailPanelSection>

                <SaasDetailPanelSection title="Contacto" defaultOpen>
                    <div className="saas-admin-form-row">
                        <input value={customerForm.phoneE164} onChange={(event) => setCustomerForm((prev) => ({ ...prev, phoneE164: event.target.value }))} placeholder="Telefono principal (+51...)" disabled={busy} />
                        <input value={customerForm.phoneAlt} onChange={(event) => setCustomerForm((prev) => ({ ...prev, phoneAlt: event.target.value }))} placeholder="Telefono alterno" disabled={busy} />
                    </div>
                    <div className="saas-admin-form-row">
                        <input value={customerForm.email} onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Correo" disabled={busy} />
                        <select
                            value={formPreferredLanguageValue}
                            onChange={(event) => setCustomerForm((prev) => ({ ...prev, preferredLanguage: event.target.value }))}
                            disabled={busy}
                        >
                            {FORM_LANGUAGE_OPTIONS.map((option) => (
                                <option key={`customer-form-lang-${option.value}`} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="saas-admin-form-row">
                        <input value={customerForm.tagsText} onChange={(event) => setCustomerForm((prev) => ({ ...prev, tagsText: event.target.value }))} placeholder="Etiquetas separadas por coma" disabled={busy} />
                    </div>
                    <div className="saas-admin-form-row">
                        <label className="saas-admin-module-toggle">
                            <input type="checkbox" checked={customerForm.isActive !== false} onChange={(event) => setCustomerForm((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                            <span>Cliente activo</span>
                        </label>
                    </div>
                </SaasDetailPanelSection>

                <SaasDetailPanelSection title="Documento" defaultOpen>
                    <div className="saas-admin-form-row">
                        <select
                            value={resolveCatalogSelectValue(customerForm.documentTypeId, documentTypeOptions)}
                            onChange={(event) => setCustomerForm((prev) => ({ ...prev, documentTypeId: event.target.value }))}
                            disabled={busy || loadingCustomerCatalogs}
                        >
                            <option value="">{loadingCustomerCatalogs ? 'Cargando tipos documento...' : 'Tipo de documento'}</option>
                            {documentTypeOptions.map((item) => (
                                <option key={`customer-document-${item.id}`} value={item.id}>{item.abbreviation || item.label}</option>
                            ))}
                        </select>
                        <input
                            value={documentNumberValue}
                            onChange={(event) => setCustomerForm((prev) => ({
                                ...prev,
                                documentNumber: event.target.value,
                                document_number: event.target.value,
                                profileDocumentNumber: event.target.value
                            }))}
                            placeholder="Documento"
                            disabled={busy}
                        />
                    </div>
                    <div className="saas-admin-form-row">
                        <textarea
                            value={notesValue}
                            onChange={(event) => setCustomerForm((prev) => ({
                                ...prev,
                                notes: event.target.value,
                                profileNotes: event.target.value
                            }))}
                            placeholder="Observaciones"
                            rows={3}
                            style={{ width: '100%' }}
                            disabled={busy}
                        />
                    </div>
                    {customerCatalogsError ? (
                        <div className="saas-admin-inline-feedback error">{customerCatalogsError}</div>
                    ) : null}
                </SaasDetailPanelSection>

                <SaasDetailPanelSection title="Direcciones" defaultOpen>
                    {selectedCustomer ? renderAddressesContent() : <p>Guarda el cliente para gestionar direcciones.</p>}
                </SaasDetailPanelSection>

                <SaasDetailPanelSection title="Contextos por modulo" defaultOpen>
                    {selectedCustomer ? renderModuleContextsContent() : <p>Guarda el cliente para ver contextos por modulo.</p>}
                </SaasDetailPanelSection>
                </SaasDetailPanel>
            )}
        </div>
    ) : null;

    const entityHeaderExtra = (
        <div className="saas-customers-header-extra">
            {campaignSelectionMode ? (
                <div className="saas-customers-outreach-toolbar">
                    <label className="saas-customers-outreach-toolbar__field">
                        <span>Modulo</span>
                        <select value={outreachModuleId} onChange={(event) => {
                            setOutreachModuleId(String(event.target.value || '').trim().toLowerCase());
                            setSelectedCustomerIdsForCampaign([]);
                        }}>
                            <option value="">Selecciona modulo</option>
                            {outreachModuleOptions.map((moduleItem) => (
                                <option key={`customers_outreach_module_entity_${moduleItem.moduleId}`} value={moduleItem.moduleId}>
                                    {moduleItem.label}
                                </option>
                            ))}
                        </select>
                        <small>Trabaja por ID de modulo normalizado para evitar cruces por mayusculas o nombre.</small>
                    </label>
                    <label className="saas-customers-outreach-toolbar__field">
                        <span>Modo</span>
                        <select value={outreachMode} onChange={(event) => {
                            setOutreachMode(String(event.target.value || 'eligible').trim() || 'eligible');
                            setSelectedCustomerIdsForCampaign([]);
                        }} disabled={!outreachModuleId}>
                            <option value="eligible">Seleccionar elegibles</option>
                            <option value="assign">Asignar al modulo</option>
                        </select>
                        <small>{outreachMode === 'assign' ? 'Muestra clientes fuera del modulo para asignarlos y enviar opt-in.' : 'Muestra solo clientes que ya pertenecen al modulo elegido.'}</small>
                    </label>
                </div>
            ) : null}
            {campaignSelectionMode ? (
                <div className="saas-customers-selection-pill">
                    {selectedCustomerIdsForCampaign.length > 0
                        ? `${selectedCustomerIdsForCampaign.length} cliente${selectedCustomerIdsForCampaign.length === 1 ? '' : 's'} seleccionado${selectedCustomerIdsForCampaign.length === 1 ? '' : 's'}`
                        : !outreachModuleId
                            ? 'Selecciona un modulo para preparar outreach.'
                            : outreachEligibilityLoading
                                ? 'Calculando elegibilidad por modulo...'
                                : outreachMode === 'assign'
                                    ? `${outreachNonEligibleCustomerIds.length} cliente(s) fuera del modulo listos para asignacion`
                                    : `${outreachEligibleCustomerIds.length} cliente(s) elegibles en el modulo`}
                </div>
            ) : null}
            {campaignSelectionMode && outreachEligibilityError ? (
                <div className="saas-admin-inline-feedback error">{outreachEligibilityError}</div>
            ) : null}
            {(customersLoadingBatch || savingCustomer) ? (
                <div className="saas-admin-inline-feedback">
                    {customersLoadingBatch ? `Cargando clientes... ${Math.max(0, Math.min(100, Number(customersLoadProgress) || 0))}%` : null}
                    {customersLoadingBatch && savingCustomer ? ' | ' : null}
                    {savingCustomer ? 'Guardando cliente...' : null}
                </div>
            ) : null}
            {(savingCustomer || showCustomerSynced) ? (
                <div className={`saas-customers-sync-indicator${savingCustomer ? ' is-saving' : ' is-synced'}`}>
                    <span className="saas-customers-sync-indicator__dot" />
                    <span>{savingCustomer ? 'Guardando...' : 'Sincronizado'}</span>
                </div>
            ) : null}
        </div>
    );

    const importModal = showImportModal ? (
        <div className="saas-template-builder-modal-overlay" onClick={resetImportFlow}>
            <div className="saas-template-builder-modal-shell saas-customers-import-shell" onClick={(event) => event.stopPropagation()}>
                <SaasDetailPanel
                    title="Importar clientes desde ERP"
                    subtitle="Carga TbClientes.csv y, si lo tienes, TbDirecciones.csv para validar antes de escribir."
                    className="saas-template-builder-modal-panel saas-customers-import-panel"
                    bodyClassName="saas-template-builder-modal-panel__body saas-customers-import-panel__body"
                    actions={(
                        <div className="saas-admin-list-actions saas-admin-list-actions--row">
                            {importStep === 1 ? (
                                <>
                                    <button type="button" className="saas-btn saas-btn--secondary saas-btn-cancel" onClick={resetImportFlow} disabled={importLoading}>
                                        Cancelar
                                    </button>
                                    <button type="button" className="saas-btn saas-btn--primary" onClick={() => { void handleAnalyzeImport(); }} disabled={importLoading || !importFileClientes}>
                                        {importLoading ? 'Analizando...' : 'Analizar'}
                                    </button>
                                </>
                            ) : null}
                            {importStep === 2 ? (
                                <>
                                    <button type="button" className="saas-btn saas-btn--secondary" onClick={() => setImportStep(1)} disabled={importLoading}>
                                        Volver
                                    </button>
                                    <button
                                        type="button"
                                        className="saas-btn saas-btn--primary"
                                        onClick={() => { void handleConfirmImport(); }}
                                        disabled={importLoading || Number(importPreview?.summary?.valid || 0) <= 0}
                                    >
                                        {importLoading ? 'Importando...' : 'Confirmar importacion'}
                                    </button>
                                </>
                            ) : null}
                            {importStep === 3 ? (
                                <>
                                    {(Array.isArray(importPreview?.errors) ? importPreview.errors.length : 0) > 0 ? (
                                        <button type="button" className="saas-btn saas-btn--secondary" onClick={handleDownloadImportErrorsCsv}>
                                            Descargar reporte de errores CSV
                                        </button>
                                    ) : null}
                                    <button type="button" className="saas-btn saas-btn--primary" onClick={() => { void handleCloseImportModal(); }}>
                                        Cerrar
                                    </button>
                                </>
                            ) : null}
                        </div>
                    )}
                >
                    <div className="saas-campaigns-wizard-progress saas-customers-import-progress">
                        {[1, 2, 3].map((step) => (
                            <div
                                key={`customers_import_step_${step}`}
                                className={`saas-campaigns-wizard-progress__item${importStep === step ? ' is-current' : ''}${importStep > step ? ' is-complete' : ''}`}
                            >
                                <span>Paso {step}</span>
                                <strong>{step === 1 ? 'Archivos' : step === 2 ? 'Vista previa' : 'Resultado'}</strong>
                            </div>
                        ))}
                    </div>

                    {importStep === 1 ? (
                        <div className="saas-campaigns-wizard-step saas-customers-import-step">
                            <SaasDetailPanelSection title="Archivos" defaultOpen>
                                <div className="saas-customers-import-grid">
                                    <label className="saas-customers-import-upload">
                                        <span>Archivo de clientes (TbClientes.csv)</span>
                                        <input
                                            type="file"
                                            accept=".csv"
                                            onChange={(event) => setImportFileClientes(event.target.files?.[0] || null)}
                                            disabled={importLoading}
                                        />
                                        <small>{importFileClientes ? `✓ ${importFileClientes.name}` : 'Selecciona el CSV principal de clientes.'}</small>
                                    </label>
                                    <label className="saas-customers-import-upload">
                                        <span>Archivo de direcciones - opcional (TbDirecciones.csv)</span>
                                        <input
                                            type="file"
                                            accept=".csv"
                                            onChange={(event) => setImportFileDirecciones(event.target.files?.[0] || null)}
                                            disabled={importLoading}
                                        />
                                        <small>{importFileDirecciones ? `✓ ${importFileDirecciones.name}` : 'Puedes omitirlo si solo quieres clientes.'}</small>
                                    </label>
                                </div>
                                <div className="saas-admin-form-row">
                                    <label className="saas-customers-outreach-toolbar__field">
                                        <span>Modulo</span>
                                        <select value={importModuleId} onChange={(event) => setImportModuleId(String(event.target.value || '').trim())} disabled={importLoading}>
                                            <option value="">Sin modulo</option>
                                            {outreachModuleOptions.map((moduleItem) => (
                                                <option key={`customers_import_module_${moduleItem.moduleId}`} value={moduleItem.moduleId}>
                                                    {moduleItem.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </SaasDetailPanelSection>
                        </div>
                    ) : null}

                    {importStep === 2 ? (
                        <div className="saas-campaigns-wizard-step saas-customers-import-step">
                            <SaasDetailPanelSection title="Resumen" defaultOpen>
                                <div className="saas-customers-import-chip-row">
                                    <span className="saas-admin-profile-chip">{Number(importPreview?.summary?.valid || 0)} validos</span>
                                    <span className="saas-admin-profile-chip">{Number(importPreview?.summary?.updates || 0)} actualizaciones</span>
                                    <span className="saas-admin-profile-chip">{Number(importPreview?.summary?.inserts || 0)} inserciones</span>
                                    <span className="saas-admin-profile-chip">{Number(importPreview?.summary?.errors || 0)} errores</span>
                                    <span className="saas-admin-profile-chip">
                                        {Number(importPreview?.addressSummary?.matched || 0)} direcciones con match / {Number(importPreview?.addressSummary?.unmatched || 0)} sin match
                                    </span>
                                </div>
                            </SaasDetailPanelSection>

                            {(Array.isArray(importPreview?.errors) ? importPreview.errors.length : 0) > 0 ? (
                                <SaasDetailPanelSection title="Errores detectados" defaultOpen>
                                    <div className="saas-customers-import-table-wrap">
                                        <table className="saas-data-table">
                                            <thead>
                                                <tr>
                                                    <th>Fila</th>
                                                    <th>ERP ID</th>
                                                    <th>Campo</th>
                                                    <th>Motivo</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importErrorsVisible.map((item, index) => (
                                                    <tr key={`customers_import_error_${index}`}>
                                                        <td>{item?.row || '-'}</td>
                                                        <td>{item?.erp_id || '-'}</td>
                                                        <td>{item?.field || '-'}</td>
                                                        <td>{item?.message || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {(Array.isArray(importPreview?.errors) ? importPreview.errors.length : 0) > 10 ? (
                                        <button type="button" className="saas-btn saas-btn--secondary" onClick={() => setShowAllImportErrors((prev) => !prev)}>
                                            {showAllImportErrors
                                                ? 'Mostrar menos errores'
                                                : `Ver todos los errores (${importPreview.errors.length})`}
                                        </button>
                                    ) : null}
                                </SaasDetailPanelSection>
                            ) : null}

                            <SaasDetailPanelSection title="Preview de clientes validos" defaultOpen>
                                <div className="saas-customers-import-table-wrap">
                                    <table className="saas-data-table">
                                        <thead>
                                            <tr>
                                                <th>Nombre completo</th>
                                                <th>Telefono</th>
                                                <th>Tipo</th>
                                                <th>Fuente</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(Array.isArray(importPreview?.preview) ? importPreview.preview : []).map((item, index) => (
                                                <tr key={`customers_import_preview_${index}`}>
                                                    <td>{item?.nombre_completo || '-'}</td>
                                                    <td>{item?.telefono || '-'}</td>
                                                    <td>{item?.tipo_cliente || '-'}</td>
                                                    <td>{item?.fuente || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </SaasDetailPanelSection>
                        </div>
                    ) : null}

                    {importStep === 3 ? (
                        <div className="saas-campaigns-wizard-step saas-customers-import-step saas-customers-import-step--result">
                            <SaasDetailPanelSection title="Importacion completada" defaultOpen>
                                <div className="saas-admin-empty-state saas-customers-import-success">
                                    <div className="saas-customers-import-success__icon">✓</div>
                                    <h4>Importacion completada</h4>
                                    <p>Los clientes y sus direcciones ya fueron procesados.</p>
                                </div>
                                <div className="saas-customers-import-chip-row">
                                    <span className="saas-admin-profile-chip">
                                        Clientes: {Number(importResult?.customers?.inserted || 0)} insertados · {Number(importResult?.customers?.updated || 0)} actualizados · {Number(importResult?.customers?.errors || 0)} con error
                                    </span>
                                    <span className="saas-admin-profile-chip">
                                        Direcciones: {Number(importResult?.addresses?.inserted || 0)} insertadas · {Number(importResult?.addresses?.updated || 0)} actualizadas · {Number(importResult?.addresses?.unmatched || 0)} sin match
                                    </span>
                                </div>
                            </SaasDetailPanelSection>
                        </div>
                    ) : null}
                </SaasDetailPanel>
            </div>
        </div>
    ) : null;

    return (
        <div className="saas-admin-grid">
        <SaasEntityPage
            id="saas_clientes"
            sectionKey="customers"
            selectedId={layoutSelectedId}
            header={headerElement}
            left={leftPane}
            right={rightPane}
            className="saas-entity-page--customers"
        >
            <SendTemplateModal
                isOpen={sendTemplateOpen}
                templates={sendTemplateOptions}
                templatesLoading={sendTemplateOptionsLoading}
                templatesError={sendTemplateOptionsError}
                selectedTemplate={selectedSendTemplate}
                preview={selectedSendTemplatePreview}
                previewLoading={selectedSendTemplatePreviewLoading}
                previewError={selectedSendTemplatePreviewError}
                confirmDisabled={!selectedSendTemplate || sendTemplateSubmitting || !selectedCustomerPhone}
                confirmBusy={sendTemplateSubmitting}
                onClose={resetSendTemplateFlow}
                onSelectTemplate={(template) => { void handleSelectDirectTemplate(template); }}
                onConfirm={handleConfirmDirectTemplateSend}
            />
            <SendTemplateModal
                isOpen={campaignTemplateModalOpen}
                templates={campaignTemplateOptions}
                templatesLoading={campaignTemplateOptionsLoading}
                templatesError={campaignTemplateOptionsError}
                selectedTemplate={selectedCampaignTemplate}
                preview={selectedCampaignTemplatePreview}
                previewLoading={selectedCampaignTemplatePreviewLoading}
                previewError={selectedCampaignTemplatePreviewError}
                confirmLabel={`${outreachMode === 'assign' ? 'Asignar y enviar opt-in' : 'Lanzar campaña'}${selectedCustomerIdsForCampaign.length > 0 ? ` (${selectedCustomerIdsForCampaign.length})` : ''}`}
                confirmDisabled={!selectedCampaignTemplate || campaignTemplateSubmitting || selectedCustomerIdsForCampaign.length === 0}
                confirmBusy={campaignTemplateSubmitting}
                onClose={resetCampaignTemplateFlow}
                onSelectTemplate={(template) => { void handleSelectCampaignTemplate(template); }}
                onConfirm={() => { void handleConfirmExpressCampaign(); }}
            />
            {importModal}
        </SaasEntityPage>
        </div>
    );
}

export default React.memo(CustomersSection);
