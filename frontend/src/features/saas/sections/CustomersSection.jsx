
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

const CUSTOMER_TABLE_COLUMNS = [
    { key: 'codigo', label: 'Codigo', width: '15%', type: 'text' },
    { key: 'nombreCompleto', label: 'Nombre completo', width: '22%', type: 'text' },
    { key: 'nombres', label: 'Nombres', width: '16%', type: 'text' },
    { key: 'apellidoPaterno', label: 'Apellido paterno', width: '16%', type: 'text' },
    { key: 'apellidoMaterno', label: 'Apellido materno', width: '16%', type: 'text' },
    { key: 'telefono', label: 'Telefono', width: '15%', type: 'text' },
    { key: 'telefonoAlt', label: 'Telefono alterno', width: '15%', type: 'text' },
    { key: 'email', label: 'Correo', width: '20%', type: 'text' },
    { key: 'tipoCliente', label: 'Tipo de cliente', width: '16%', type: 'option' },
    { key: 'tipoDocumento', label: 'Tipo documento', width: '16%', type: 'option' },
    { key: 'documento', label: 'Documento', width: '16%', type: 'text' },
    { key: 'idioma', label: 'Idioma', width: '10%', type: 'option' },
    { key: 'fuenteAdquisicion', label: 'Fuente', width: '16%', type: 'option' },
    { key: 'tratamiento', label: 'Tratamiento', width: '14%', type: 'option' },
    { key: 'etiquetas', label: 'Etiquetas', width: '20%', type: 'text' },
    { key: 'ultimaInteraccion', label: 'Ultima interaccion', width: '16%', type: 'date' },
    { key: 'actualizado', label: 'Actualizado', width: '16%', type: 'date' },
    { key: 'estado', label: 'Estado', width: '10%', type: 'option' }
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
const EMPTY_ADDRESS_FORM = {
    addressId: '',
    addressType: 'other',
    street: '',
    reference: '',
    mapsUrl: '',
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

function normalizeCatalogItems(items = []) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item = {}) => ({
            id: String(item.id || item.code || '').trim(),
            label: String(item.label || item.name || item.code || item.id || '').trim(),
            value: String(item.label || item.name || item.code || item.id || '').trim()
        }))
        .filter((item) => item.id && item.label);
}

function normalizeCatalogLookupKey(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d+$/.test(raw)) return String(Number(raw));
    return raw.toLowerCase();
}

function buildCatalogLabelMap(items = []) {
    return normalizeCatalogItems(items).reduce((acc, item) => {
        const rawId = String(item.id || '').trim();
        const normalizedId = normalizeCatalogLookupKey(rawId);
        if (rawId) acc[rawId] = item.label;
        if (normalizedId) acc[normalizedId] = item.label;
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

    return {
        ...customer,
        contactName: pickPatchedValue(sourcePayload, 'contactName', customer.contactName),
        phoneE164: pickPatchedValue(sourcePayload, 'phoneE164', customer.phoneE164),
        phoneAlt: pickPatchedValue(sourcePayload, 'phoneAlt', customer.phoneAlt),
        email: pickPatchedValue(sourcePayload, 'email', customer.email),
        isActive: pickPatchedValue(sourcePayload, 'isActive', customer.isActive),
        tags: Array.isArray(sourcePayload.tags) ? sourcePayload.tags : customer.tags,
        treatmentId: pickPatchedValue(sourcePayload, 'treatmentId', customer.treatmentId),
        treatment_id: pickPatchedValue(sourcePayload, 'treatment_id', customer.treatment_id),
        customerTypeId: pickPatchedValue(sourcePayload, 'customerTypeId', customer.customerTypeId),
        customer_type_id: pickPatchedValue(sourcePayload, 'customer_type_id', customer.customer_type_id),
        acquisitionSourceId: pickPatchedValue(sourcePayload, 'acquisitionSourceId', customer.acquisitionSourceId),
        acquisition_source_id: pickPatchedValue(sourcePayload, 'acquisition_source_id', customer.acquisition_source_id),
        documentTypeId: pickPatchedValue(sourcePayload, 'documentTypeId', customer.documentTypeId),
        document_type_id: pickPatchedValue(sourcePayload, 'document_type_id', customer.document_type_id),
        documentNumber: pickPatchedValue(sourcePayload, 'documentNumber', customer.documentNumber),
        document_number: pickPatchedValue(sourcePayload, 'document_number', customer.document_number),
        firstName: pickPatchedValue(sourcePayload, 'firstName', customer.firstName),
        first_name: pickPatchedValue(sourcePayload, 'first_name', customer.first_name),
        lastNamePaternal: pickPatchedValue(sourcePayload, 'lastNamePaternal', customer.lastNamePaternal),
        last_name_paternal: pickPatchedValue(sourcePayload, 'last_name_paternal', customer.last_name_paternal),
        lastNameMaternal: pickPatchedValue(sourcePayload, 'lastNameMaternal', customer.lastNameMaternal),
        last_name_maternal: pickPatchedValue(sourcePayload, 'last_name_maternal', customer.last_name_maternal),
        notes: pickPatchedValue(sourcePayload, 'notes', customer.notes),
        profile: {
            ...previousProfile,
            ...payloadProfile
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
    return {
        addressId: String(source.addressId || source.address_id || '').trim(),
        addressType: String(source.addressType || source.address_type || '').trim() || 'other',
        street: String(source.street || '').trim(),
        reference: String(source.reference || '').trim(),
        mapsUrl: String(source.mapsUrl || source.maps_url || '').trim(),
        latitude: String(source.latitude || '').trim(),
        longitude: String(source.longitude || '').trim(),
        districtName: String(source.districtName || source.district_name || '').trim(),
        provinceName: String(source.provinceName || source.province_name || '').trim(),
        departmentName: String(source.departmentName || source.department_name || '').trim(),
        isPrimary: Boolean(source.isPrimary || source.is_primary),
        updatedAt: String(source.updatedAt || source.updated_at || source.createdAt || source.created_at || '').trim()
    };
}

function buildAddressFormFromRecord(value = null) {
    const source = normalizeAddressRecord(value);
    return {
        addressId: String(source.addressId || '').trim(),
        addressType: String(source.addressType || 'other').trim() || 'other',
        street: String(source.street || '').trim(),
        reference: String(source.reference || '').trim(),
        mapsUrl: String(value?.mapsUrl || value?.maps_url || '').trim(),
        districtName: String(source.districtName || '').trim(),
        provinceName: String(source.provinceName || '').trim(),
        departmentName: String(source.departmentName || '').trim(),
        latitude: String(value?.latitude || '').trim(),
        longitude: String(value?.longitude || '').trim(),
        isPrimary: Boolean(source.isPrimary)
    };
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

function CustomersSection(props = {}) {
    const { notify } = useUiFeedback();
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
        openCustomerEdit,
        runAction,
        requestJson,
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
    const [headerFilter, setHeaderFilter] = useState({
        columnKey: '',
        operator: 'contains',
        value: ''
    });
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
    const [addressEditorMode, setAddressEditorMode] = useState('create');
    const [addressEditorOpen, setAddressEditorOpen] = useState(false);
    const [addressBusy, setAddressBusy] = useState(false);
    const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
    const [customerCatalogs, setCustomerCatalogs] = useState(EMPTY_CUSTOMER_CATALOGS);
    const [loadingCustomerCatalogs, setLoadingCustomerCatalogs] = useState(false);
    const [customerCatalogsError, setCustomerCatalogsError] = useState('');
    const [savingCustomer, setSavingCustomer] = useState(false);
    const [selectedCustomerLive, setSelectedCustomerLive] = useState(selectedCustomerContext || null);

    const defaultColumnKeys = useMemo(() => CUSTOMER_DEFAULT_COLUMN_KEYS, []);
    const columnPrefs = useSaasColumnPrefs('customers', defaultColumnKeys);

    useEffect(() => {
        setSelectedCustomerLive(selectedCustomerContext || null);
    }, [selectedCustomerContext]);

    const selectedCustomer = useMemo(
        () => selectedCustomerLive || selectedCustomerContext || null,
        [selectedCustomerContext, selectedCustomerLive]
    );

    const selectedCustomerIdResolved = useMemo(() => resolveCustomerId(selectedCustomer), [selectedCustomer]);

    const selectedPreferredLanguage = useMemo(() => {
        if (!selectedCustomerIdResolved) return normalizePreferredLanguage(selectedCustomer);
        const draft = String(languageDraftByCustomer[selectedCustomerIdResolved] || '').trim().toLowerCase();
        if (draft) return draft;
        return normalizePreferredLanguage(selectedCustomer);
    }, [selectedCustomer, selectedCustomerIdResolved, languageDraftByCustomer]);

    const moduleNameById = useMemo(() => {
        const map = {};
        (Array.isArray(waModules) ? waModules : []).forEach((moduleItem = {}) => {
            const moduleId = String(moduleItem.moduleId || moduleItem.module_id || '').trim();
            if (!moduleId) return;
            map[moduleId] = String(moduleItem.name || moduleItem.module_name || moduleId).trim() || moduleId;
        });
        return map;
    }, [waModules]);

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
        documentTypeById: buildCatalogLabelMap(documentTypeOptions),
        treatmentById: buildCatalogLabelMap(treatmentOptions),
        sourceById: buildCatalogLabelMap(sourceOptions)
    }), [customerTypeOptions, documentTypeOptions, treatmentOptions, sourceOptions]);

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

    const tableColumns = useMemo(
        () => CUSTOMER_TABLE_COLUMNS.map((column) => ({
            ...column,
            hidden: !columnPrefs.isColumnVisible(column.key)
        })),
        [columnPrefs, columnPrefs.visibleColumnKeys]
    );

    const tableRows = useMemo(() => {
        const source = Array.isArray(filteredCustomers) ? filteredCustomers : [];
        return source.map((customer = {}, index) => {
            const customerId = resolveCustomerId(customer);
            const safeId = customerId || String(customer.phoneE164 || customer.phone_e164 || customer.email || `customer-${index}`).trim();
            const nameParts = buildNamePartsFromCustomer(customer);
            const tags = Array.isArray(customer?.tags) ? customer.tags : [];
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
                etiquetas: tags.length ? tags.join(', ') : '-',
                ultimaInteraccion: formatDateTimeLabel(customer.lastInteractionAt || customer.last_interaction_at || ''),
                actualizado: formatDateTimeLabel(customer.updatedAt || customer.updated_at || ''),
                estado: customer.isActive === false ? 'Inactivo' : 'Activo',
                _raw: customer
            };
        });
    }, [customerLabelMaps, filteredCustomers, formatDateTimeLabel]);

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
    ), [customerTypeOptions, documentTypeOptions, sourceOptions, treatmentOptions]);
    const filterColumnByKey = useMemo(
        () => filterColumns.reduce((acc, column) => {
            acc[String(column.key || '').trim()] = column;
            return acc;
        }, {}),
        [filterColumns]
    );

    const sortedAndFilteredRows = useMemo(() => {
        const sourceRows = Array.isArray(tableRows) ? [...tableRows] : [];
        const filterColumnKey = String(headerFilter?.columnKey || '').trim();
        const filterOperator = String(headerFilter?.operator || 'contains').trim().toLowerCase();
        const filterValue = String(headerFilter?.value || '').trim().toLowerCase();
        const filterColumnType = String(filterColumnByKey[filterColumnKey]?.type || 'text').trim().toLowerCase();

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

        const matchValue = (candidateValueRaw) => {
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

        const filteredRows = filterColumnKey
            ? sourceRows.filter((row) => {
                if (filterColumnKey === 'actualizado') {
                    return matchValue(row?._raw?.updatedAt || row?.actualizado);
                }
                if (filterColumnKey === 'ultimaInteraccion') {
                    return matchValue(row?._raw?.lastInteractionAt || row?.ultimaInteraccion);
                }
                return matchValue(row?.[filterColumnKey]);
            })
            : sourceRows;

        const sortColumnKey = String(sortConfig?.columnKey || '').trim();
        const sortDirection = String(sortConfig?.direction || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
        if (!sortColumnKey) return filteredRows;

        const resolveSortValue = (row) => {
            if (sortColumnKey === 'actualizado') {
                return String(row?._raw?.updatedAt || row?.actualizado || '').trim();
            }
            if (sortColumnKey === 'ultimaInteraccion') {
                return String(row?._raw?.lastInteractionAt || row?.ultimaInteraccion || '').trim();
            }
            return row?.[sortColumnKey];
        };

        const sortedRows = [...filteredRows].sort((left, right) => {
            const leftValue = resolveSortValue(left);
            const rightValue = resolveSortValue(right);

            if (typeof leftValue === 'number' && typeof rightValue === 'number') {
                return leftValue - rightValue;
            }

            const leftText = String(leftValue ?? '').trim();
            const rightText = String(rightValue ?? '').trim();
            return leftText.localeCompare(rightText, 'es', { numeric: true, sensitivity: 'base' });
        });

        return sortDirection === 'desc' ? sortedRows.reverse() : sortedRows;
    }, [filterColumnByKey, headerFilter, sortConfig, tableRows]);

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
            return;
        }

        setAddressesLoading(true);
        setAddressesError('');
        try {
            const payload = await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/addresses`, { method: 'GET' });
            const items = Array.isArray(payload?.items) ? payload.items : [];
            const normalized = items.map((item) => normalizeAddressRecord(item));
            setCustomerAddresses(normalized);
        } catch (error) {
            setCustomerAddresses([]);
            setAddressesError(String(error?.message || 'No se pudieron cargar direcciones del cliente.'));
        } finally {
            setAddressesLoading(false);
        }
    }, [requestJson]);

    const loadCustomerCatalogs = useCallback(async () => {
        if (typeof requestJson !== 'function' || !isCustomersSection) return;
        setLoadingCustomerCatalogs(true);
        setCustomerCatalogsError('');
        try {
            const [treatmentsPayload, typesPayload, sourcesPayload, documentsPayload] = await Promise.all([
                requestJson('/api/tenant/customer-catalogs/treatments', { method: 'GET' }),
                requestJson('/api/tenant/customer-catalogs/types', { method: 'GET' }),
                requestJson('/api/tenant/customer-catalogs/sources', { method: 'GET' }),
                requestJson('/api/tenant/customer-catalogs/document-types', { method: 'GET' })
            ]);
            setCustomerCatalogs({
                treatments: normalizeCatalogItems(treatmentsPayload?.items || []),
                customerTypes: normalizeCatalogItems(typesPayload?.items || []),
                acquisitionSources: normalizeCatalogItems(sourcesPayload?.items || []),
                documentTypes: normalizeCatalogItems(documentsPayload?.items || [])
            });
        } catch (error) {
            setCustomerCatalogs(EMPTY_CUSTOMER_CATALOGS);
            setCustomerCatalogsError(String(error?.message || 'No se pudieron cargar catalogos de clientes.'));
        } finally {
            setLoadingCustomerCatalogs(false);
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
            openCustomerEdit();
        } finally {
            setEditClickBusy(false);
        }
    }, [editClickBusy, openCustomerEdit]);

    const handleCloseDetail = useCallback(() => {
        setSelectedCustomerId('');
        setCustomerPanelMode('view');
    }, [setCustomerPanelMode, setSelectedCustomerId]);

    const handleSoftDeleteCustomer = useCallback(() => {
        if (!selectedCustomer?.customerId) return;
        runAction('Cliente marcado como inactivo', async () => {
            await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/' + encodeURIComponent(selectedCustomer.customerId), {
                method: 'PUT',
                body: { isActive: false }
            });
            await loadCustomers(tenantScopeId);
        });
    }, [loadCustomers, requestJson, runAction, selectedCustomer, tenantScopeId]);

    const updateCustomersState = useCallback((customerItem = null) => {
        if (typeof setCustomers !== 'function') return;
        const safeItem = customerItem && typeof customerItem === 'object' ? customerItem : null;
        if (!safeItem) return;
        const safeItemId = resolveCustomerId(safeItem);
        setCustomers((prev) => upsertCustomerById(prev, safeItem));
        if (tenantScopeId && safeItemId && typeof patchCustomerInCache === 'function') {
            patchCustomerInCache(tenantScopeId, safeItemId, safeItem);
        }
        const currentSelectedId = String(selectedCustomerIdResolved || selectedCustomerId || '').trim();
        if (currentSelectedId && safeItemId && normalizeCatalogLookupKey(currentSelectedId) === normalizeCatalogLookupKey(safeItemId)) {
            setSelectedCustomerLive(safeItem);
        }
    }, [patchCustomerInCache, selectedCustomerId, selectedCustomerIdResolved, setCustomers, tenantScopeId]);

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
            notes
        };
    }, [
        buildCustomerPayloadFromForm,
        customerForm,
        firstNameValue,
        lastNamePaternalValue,
        lastNameMaternalValue,
        documentNumberValue,
        notesValue
    ]);

    const handleSaveCustomer = useCallback(() => {
        if (savingCustomer) return;
        const payload = buildCustomerSubmitPayload();
        const isCreate = customerPanelMode === 'create' || !selectedCustomer?.customerId;

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
                    if (createdItem) updateCustomersState(createdItem);
                    if (createdId) setSelectedCustomerId(createdId);
                    setCustomerPanelMode('view');
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

        const customerId = String(selectedCustomer?.customerId || '').trim();
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
        updateCustomersState
    ]);

    useEffect(() => {
        if (!isCustomersSection) return;
        loadCustomerCatalogs();
    }, [isCustomersSection, loadCustomerCatalogs]);

    useEffect(() => {
        const next = String(customerSearch || '');
        setSearchInput((prev) => (prev === next ? prev : next));
    }, [customerSearch]);

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

    const resetAddressEditor = useCallback(() => {
        setAddressEditorMode('create');
        setAddressEditorOpen(false);
        setAddressForm(EMPTY_ADDRESS_FORM);
    }, []);

    const handleStartCreateAddress = useCallback(() => {
        if (!selectedCustomerIdResolved) return;
        setAddressEditorMode('create');
        setAddressEditorOpen(true);
        setAddressForm({ ...EMPTY_ADDRESS_FORM });
        setAddressesError('');
    }, [selectedCustomerIdResolved]);

    const handleStartEditAddress = useCallback((address = {}) => {
        if (!selectedCustomerIdResolved) return;
        setAddressEditorMode('edit');
        setAddressEditorOpen(true);
        setAddressForm(buildAddressFormFromRecord(address));
        setAddressesError('');
    }, [selectedCustomerIdResolved]);

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
            if (addressEditorMode === 'edit' && String(addressForm.addressId || '').trim()) {
                await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/addresses/${encodeURIComponent(String(addressForm.addressId || '').trim())}`, {
                    method: 'PUT',
                    body: payload
                });
            } else {
                await requestJson(`/api/tenant/customers/${encodeURIComponent(customerId)}/addresses`, {
                    method: 'POST',
                    body: payload
                });
            }
            await loadCustomerAddressesByCustomer(customerId);
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
        } catch (error) {
            setAddressesError(String(error?.message || 'No se pudo eliminar la direccion.'));
        } finally {
            setAddressBusy(false);
        }
    }, [addressForm.addressId, loadCustomerAddressesByCustomer, requestJson, resetAddressEditor, selectedCustomerIdResolved]);

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
            resetAddressEditor();
            return;
        }

        if (!selectedCustomerIdResolved) {
            setModuleContexts([]);
            setModuleContextsError('');
            setModuleConsentDraftByModuleId({});
            setCustomerAddresses([]);
            setAddressesError('');
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
        const profileAddresses = (() => {
            const profile = selectedCustomer?.profile && typeof selectedCustomer.profile === 'object' ? selectedCustomer.profile : {};
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
                        updatedAt: String(entry?.updatedAt || selectedCustomer?.updatedAt || '').trim()
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
                    updatedAt: String(selectedCustomer?.updatedAt || '').trim()
                });
            }
            return items;
        })();

        const effectiveAddresses = customerAddresses.length > 0 ? customerAddresses : profileAddresses;

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
                    {addressEditorOpen ? (
                        <button
                            type="button"
                            disabled={busy || addressBusy}
                            onClick={resetAddressEditor}
                        >
                            Cancelar edicion
                        </button>
                    ) : null}
                </div>
                {addressEditorOpen ? (
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
                            <input
                                value={addressForm.districtName}
                                onChange={(event) => setAddressForm((prev) => ({ ...prev, districtName: event.target.value }))}
                                placeholder="Distrito"
                                disabled={busy || addressBusy}
                            />
                            <input
                                value={addressForm.provinceName}
                                onChange={(event) => setAddressForm((prev) => ({ ...prev, provinceName: event.target.value }))}
                                placeholder="Provincia"
                                disabled={busy || addressBusy}
                            />
                        </div>
                        <div className="saas-admin-form-row">
                            <input
                                value={addressForm.departmentName}
                                onChange={(event) => setAddressForm((prev) => ({ ...prev, departmentName: event.target.value }))}
                                placeholder="Departamento"
                                disabled={busy || addressBusy}
                            />
                            <input
                                value={addressForm.mapsUrl}
                                onChange={(event) => setAddressForm((prev) => ({ ...prev, mapsUrl: event.target.value }))}
                                placeholder="URL Google Maps"
                                disabled={busy || addressBusy}
                            />
                        </div>
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
                        <div className="saas-customers-address-toolbar">
                            <button
                                type="button"
                                disabled={busy || addressBusy || !String(addressForm.street || '').trim()}
                                onClick={handleSaveAddress}
                            >
                                {addressEditorMode === 'edit' ? 'Actualizar direccion' : 'Guardar direccion'}
                            </button>
                        </div>
                    </div>
                ) : null}
                {addressesError ? (
                    <div className="saas-admin-inline-feedback error">{addressesError}</div>
                ) : null}
                {hasAddresses ? (
                    <div className="saas-customers-address-list">
                        {effectiveAddresses.map((address, index) => {
                            const locationLabel = [address.districtName, address.provinceName, address.departmentName].filter(Boolean).join(', ');
                            return (
                                <div key={address.addressId || `address-${index}`} className="saas-customers-address-item">
                                    <div className="saas-customers-address-item__header">
                                        <strong>{address.addressType || 'other'}</strong>
                                        {address.isPrimary ? <small>Principal</small> : null}
                                    </div>
                                    <p>{address.street || '-'}</p>
                                    {address.reference ? <p>{address.reference}</p> : null}
                                    {locationLabel ? <p>{locationLabel}</p> : null}
                                    <div className="saas-customers-address-item__actions">
                                        <button
                                            type="button"
                                            disabled={busy || addressBusy}
                                            onClick={() => handleStartEditAddress(address)}
                                        >
                                            Editar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || addressBusy}
                                            onClick={() => handleDeleteAddress(address.addressId)}
                                        >
                                            Eliminar
                                        </button>
                                        {!address.isPrimary ? (
                                            <button
                                                type="button"
                                                disabled={busy || addressBusy}
                                                onClick={() => handleSetPrimaryAddress(address.addressId)}
                                            >
                                                Marcar principal
                                            </button>
                                        ) : null}
                                    </div>
                                    <small>Actualizado: {formatDateTimeLabel(address.updatedAt)}</small>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="saas-customers-address-editor-wrap">
                        <p>Este cliente no tiene direcciones registradas.</p>
                    </div>
                )}
            </div>
        );
    };

    const headerActions = [
        {
            key: 'add-customer',
            label: 'Agregar cliente',
            onClick: openCustomerCreate,
            variant: 'primary',
            disabled: busy || tenantScopeLocked
        },
        {
            key: 'toggle-columns',
            label: 'Columnas',
            onClick: () => setShowColumnsMenu((prev) => !prev),
            variant: 'secondary',
            disabled: busy || tenantScopeLocked
        }
    ];

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
            actions={headerActions}
            filters={{
                columns: headerFilterColumns,
                value: headerFilter,
                onChange: setHeaderFilter,
                onClear: () => setHeaderFilter({
                    columnKey: '',
                    operator: 'contains',
                    value: ''
                })
            }}
            sortConfig={{
                ...sortConfig,
                columns: headerFilterColumns
            }}
            onSortChange={setSortConfig}
            extra={(
                <div className="saas-customers-header-extra">
                    {(customersLoadingBatch || savingCustomer) ? (
                        <div className="saas-admin-inline-feedback">
                            {customersLoadingBatch ? `Cargando clientes... ${Math.max(0, Math.min(100, Number(customersLoadProgress) || 0))}%` : null}
                            {customersLoadingBatch && savingCustomer ? ' • ' : null}
                            {savingCustomer ? 'Guardando cliente...' : null}
                        </div>
                    ) : null}
                    {showColumnsMenu ? (
                        <div className="saas-customers-columns-menu">
                            {CUSTOMER_TABLE_COLUMNS.map((column) => (
                                <label key={column.key} className="saas-customers-columns-menu__item">
                                    <input
                                        type="checkbox"
                                        checked={columnPrefs.isColumnVisible(column.key)}
                                        onChange={() => columnPrefs.toggleColumn(column.key)}
                                    />
                                    <span>{column.label}</span>
                                    <small>{column.width || 'auto'}</small>
                                </label>
                            ))}
                            <div className="saas-customers-columns-menu__actions">
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
        />
    );

    const leftPane = (
        <div className="saas-customers-pane">
            <SaasDataTable
                columns={tableColumns}
                rows={tenantScopeLocked ? [] : visibleTableRows}
                selectedId={tableSelectedId}
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
            {customerPanelMode === 'view' && selectedCustomer ? (
            <SaasDetailPanel
                title={selectedCustomer?.contactName || selectedCustomer?.customerId || 'Cliente'}
                subtitle={`Codigo: ${selectedCustomer?.customerId || '-'}`}
                className="saas-customers-detail-panel"
                actions={(
                    <div className="saas-customers-detail-actions">
                        <button type="button" disabled={editClickBusy} onClick={handleOpenCustomerEdit}>Editar</button>
                        <button type="button" disabled={busy} onClick={handleSoftDeleteCustomer}>Eliminar</button>
                        <button type="button" disabled={busy} onClick={handleCloseDetail}>Cerrar</button>
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
                        <div><span>Documento</span><strong>{readProfileValue(selectedCustomer?.profile, 'documentNumber', 'numeroDocumentoIdentidad', 'document_number') || selectedCustomer?.documentNumber || '-'}</strong></div>
                        <div><span>Tipo documento</span><strong>{buildDocumentTypeLabel(selectedCustomer, customerLabelMaps)}</strong></div>
                        <div><span>Notas</span><strong>{readProfileValue(selectedCustomer?.profile, 'notes', 'observacionCliente', 'observacion_cliente') || selectedCustomer?.notes || '-'}</strong></div>
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
                actions={(
                    <div className="saas-customers-detail-actions">
                        <button
                            type="button"
                            disabled={busy || savingCustomer || !customerForm.contactName.trim() || !customerForm.phoneE164.trim()}
                            onClick={handleSaveCustomer}
                        >
                            {customerPanelMode === 'create' ? 'Guardar cliente' : 'Actualizar cliente'}
                        </button>
                        <button type="button" disabled={busy} onClick={cancelCustomerEdit}>Cancelar</button>
                        <button type="button" disabled={busy} onClick={handleCloseDetail}>Cerrar</button>
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
                                <option key={`customer-treatment-${item.id}`} value={item.id}>{item.label}</option>
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
                                <option key={`customer-document-${item.id}`} value={item.id}>{item.label}</option>
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

    return (
        <section id="saas_clientes" className="saas-admin-card saas-admin-card--full">
            <SaasTableDetailLayout
                selectedId={layoutSelectedId}
                className="saas-customers-td-layout"
                header={headerElement}
                left={leftPane}
                right={rightPane}
            />
        </section>
    );
}

export default React.memo(CustomersSection);
