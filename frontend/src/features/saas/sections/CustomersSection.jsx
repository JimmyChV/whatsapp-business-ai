
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    SaasDataTable,
    SaasDetailPanel,
    SaasDetailPanelSection,
    SaasTableDetailLayout,
    useSaasColumnPrefs
} from '../components/layout';

const CUSTOMER_TABLE_COLUMNS = [
    { key: 'codigo', label: 'Codigo', width: '15%' },
    { key: 'nombreCompleto', label: 'Nombre completo', width: '24%' },
    { key: 'telefono', label: 'Telefono', width: '15%' },
    { key: 'tipoCliente', label: 'Tipo de cliente', width: '16%' },
    { key: 'modulo', label: 'Modulo', width: '15%' },
    { key: 'estado', label: 'Estado', width: '15%' }
];

function resolveCustomerId(value = null) {
    if (!value || typeof value !== 'object') return '';
    return String(value.customerId || value.customer_id || value.id || '').trim();
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
        districtName: String(source.districtName || source.district_name || '').trim(),
        provinceName: String(source.provinceName || source.province_name || '').trim(),
        departmentName: String(source.departmentName || source.department_name || '').trim(),
        isPrimary: Boolean(source.isPrimary || source.is_primary),
        updatedAt: String(source.updatedAt || source.updated_at || source.createdAt || source.created_at || '').trim()
    };
}

function buildCustomerDisplayName(customer = null) {
    if (!customer || typeof customer !== 'object') return '-';
    const contactName = String(customer.contactName || '').trim();
    if (contactName) return contactName;

    const segments = [
        String(customer.firstName || customer.first_name || customer.profile?.firstNames || '').trim(),
        String(customer.lastNamePaternal || customer.last_name_paternal || customer.profile?.lastNamePaternal || '').trim(),
        String(customer.lastNameMaternal || customer.last_name_maternal || customer.profile?.lastNameMaternal || '').trim()
    ].filter(Boolean);

    if (segments.length) return segments.join(' ');
    return String(customer.customerId || customer.customer_id || '-').trim() || '-';
}

function buildCustomerTypeLabel(customer = null) {
    if (!customer || typeof customer !== 'object') return '-';
    return String(
        customer.customerTypeLabel
        || customer.customer_type_label
        || customer.customerType
        || customer.customer_type
        || customer?.profile?.customerType
        || '-'
    ).trim() || '-';
}

function CustomersSection(props = {}) {
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
        selectedCustomer,
        openCustomerEdit,
        runAction,
        requestJson,
        tenantScopeId,
        loadCustomers,
        formatDateTimeLabel,
        customerForm,
        setCustomerForm,
        waModules,
        buildCustomerPayloadFromForm,
        setSelectedCustomerId,
        setCustomerPanelMode,
        cancelCustomerEdit,
        customerImportModuleId,
        setCustomerImportModuleId,
        customerCsvText,
        setCustomerCsvText
    } = context;

    const [showColumnsMenu, setShowColumnsMenu] = useState(false);
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

    const defaultColumnKeys = useMemo(() => CUSTOMER_TABLE_COLUMNS.map((column) => column.key), []);
    const columnPrefs = useSaasColumnPrefs('customers', defaultColumnKeys);

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
            return {
                id: safeId,
                codigo: customerId || '-',
                nombreCompleto: buildCustomerDisplayName(customer),
                telefono: String(customer.phoneE164 || customer.phone_e164 || '-').trim() || '-',
                tipoCliente: buildCustomerTypeLabel(customer),
                modulo: String(customer.moduleId || customer.module_id || '').trim() || 'Sin modulo',
                estado: customer.isActive === false ? 'Inactivo' : 'Activo',
                _raw: customer
            };
        });
    }, [filteredCustomers]);

    const tableSelectedId = useMemo(() => {
        if (customerPanelMode === 'create') return '';
        return String(selectedCustomerIdResolved || selectedCustomerId || '').trim();
    }, [customerPanelMode, selectedCustomerId, selectedCustomerIdResolved]);

    const layoutSelectedId = useMemo(() => {
        if (customerPanelMode === 'create') return '__create__';
        return String(selectedCustomerIdResolved || selectedCustomerId || '').trim();
    }, [customerPanelMode, selectedCustomerId, selectedCustomerIdResolved]);

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

    useEffect(() => {
        if (!isCustomersSection || customerPanelMode === 'create') {
            setModuleContexts([]);
            setModuleContextsError('');
            setModuleConsentDraftByModuleId({});
            setCustomerAddresses([]);
            setAddressesError('');
            return;
        }

        if (!selectedCustomerIdResolved) {
            setModuleContexts([]);
            setModuleContextsError('');
            setModuleConsentDraftByModuleId({});
            setCustomerAddresses([]);
            setAddressesError('');
            return;
        }

        loadModuleContextsByCustomer(selectedCustomerIdResolved);
        loadCustomerAddressesByCustomer(selectedCustomerIdResolved);
    }, [
        customerPanelMode,
        isCustomersSection,
        loadCustomerAddressesByCustomer,
        loadModuleContextsByCustomer,
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
        if (addressesLoading) {
            return <p>Cargando direcciones...</p>;
        }
        if (addressesError) {
            return <p>{addressesError}</p>;
        }
        if (customerAddresses.length === 0) {
            return <p>Este cliente no tiene direcciones registradas.</p>;
        }
        return (
            <div className="saas-customers-address-list">
                {customerAddresses.map((address, index) => {
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
                            <small>Actualizado: {formatDateTimeLabel(address.updatedAt)}</small>
                        </div>
                    );
                })}
            </div>
        );
    };

    const leftPane = (
        <div className="saas-customers-pane">
            <div className="saas-customers-toolbar">
                <div>
                    <h3>Clientes ({Array.isArray(filteredCustomers) ? filteredCustomers.length : 0})</h3>
                    <small>Base de clientes por empresa y modulo.</small>
                </div>
                <div className="saas-customers-toolbar-actions">
                    <button type="button" disabled={busy || tenantScopeLocked} onClick={openCustomerCreate}>Agregar cliente</button>
                    <button type="button" disabled={busy || tenantScopeLocked} onClick={() => setShowColumnsMenu((prev) => !prev)}>Columnas</button>
                </div>
            </div>

            {showColumnsMenu && (
                <div className="saas-customers-columns-menu">
                    {CUSTOMER_TABLE_COLUMNS.map((column) => (
                        <label key={column.key} className="saas-customers-columns-menu__item">
                            <input
                                type="checkbox"
                                checked={columnPrefs.isColumnVisible(column.key)}
                                onChange={() => columnPrefs.toggleColumn(column.key)}
                            />
                            <span>{column.label}</span>
                        </label>
                    ))}
                    <div className="saas-customers-columns-menu__actions">
                        <button type="button" onClick={columnPrefs.resetColumns}>Restablecer</button>
                        <button type="button" onClick={() => setShowColumnsMenu(false)}>Cerrar</button>
                    </div>
                </div>
            )}

            <div className="saas-admin-form-row saas-customers-search-row">
                <input
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Buscar por codigo, nombre, telefono, email o documento"
                    disabled={busy || tenantScopeLocked}
                />
            </div>

            <SaasDataTable
                columns={tableColumns}
                rows={tenantScopeLocked ? [] : tableRows}
                selectedId={tableSelectedId}
                onSelect={(row) => {
                    if (tenantScopeLocked) return;
                    openCustomerView(row?.id || row?._raw);
                }}
                loading={busy && !tenantScopeLocked}
                emptyText={tenantScopeLocked ? 'Selecciona una empresa para ver clientes.' : 'No hay clientes para esta empresa.'}
            />

            <div className="saas-customers-import-block">
                <h4>Importacion masiva CSV</h4>
                <div className="saas-admin-form-row">
                    <select value={customerImportModuleId} onChange={(event) => setCustomerImportModuleId(String(event.target.value || '').trim())} disabled={busy}>
                        <option value="">Sin modulo por defecto</option>
                        {(Array.isArray(waModules) ? waModules : []).map((moduleItem) => (
                            <option key={'import_module_' + moduleItem.moduleId} value={moduleItem.moduleId}>{moduleItem.name || moduleItem.moduleId}</option>
                        ))}
                    </select>
                </div>
                <div className="saas-admin-form-row">
                    <textarea
                        value={customerCsvText}
                        onChange={(event) => setCustomerCsvText(event.target.value)}
                        placeholder="Pega CSV con encabezados (IdCliente,Contacto,Telefono,CorreoElectronico,...)"
                        rows={6}
                        style={{ width: '100%' }}
                        disabled={busy}
                    />
                </div>
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button
                        type="button"
                        disabled={busy || !customerCsvText.trim()}
                        onClick={() => runAction('Importacion de clientes ejecutada', async () => {
                            await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/import-csv', {
                                method: 'POST',
                                body: {
                                    csvText: customerCsvText,
                                    moduleId: customerImportModuleId || undefined
                                }
                            });
                            setCustomerCsvText('');
                            await loadCustomers(tenantScopeId);
                        })}
                    >
                        Importar CSV
                    </button>
                </div>
            </div>
        </div>
    );

    const rightPane = (!tenantScopeLocked && (selectedCustomer || customerPanelMode === 'create')) ? (
        customerPanelMode === 'view' && selectedCustomer ? (
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
                    <div className="saas-customers-kv-grid">
                        <div><span>Nombre completo</span><strong>{buildCustomerDisplayName(selectedCustomer)}</strong></div>
                        <div><span>Nombres</span><strong>{selectedCustomer?.profile?.firstNames || selectedCustomer?.firstName || '-'}</strong></div>
                        <div><span>Apellido paterno</span><strong>{selectedCustomer?.profile?.lastNamePaternal || selectedCustomer?.lastNamePaternal || '-'}</strong></div>
                        <div><span>Apellido materno</span><strong>{selectedCustomer?.profile?.lastNameMaternal || selectedCustomer?.lastNameMaternal || '-'}</strong></div>
                        <div><span>Tipo de cliente</span><strong>{buildCustomerTypeLabel(selectedCustomer)}</strong></div>
                        <div><span>Estado</span><strong>{selectedCustomer?.isActive === false ? 'Inactivo' : 'Activo'}</strong></div>
                    </div>
                </SaasDetailPanelSection>

                <SaasDetailPanelSection title="Contacto" defaultOpen>
                    <div className="saas-customers-kv-grid">
                        <div><span>Telefono</span><strong>{selectedCustomer?.phoneE164 || '-'}</strong></div>
                        <div><span>Telefono 2</span><strong>{selectedCustomer?.phoneAlt || '-'}</strong></div>
                        <div><span>Email</span><strong>{selectedCustomer?.email || '-'}</strong></div>
                        <div><span>Modulo</span><strong>{selectedCustomer?.moduleId || 'Sin modulo'}</strong></div>
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
                        <div><span>Documento</span><strong>{selectedCustomer?.profile?.documentNumber || selectedCustomer?.documentNumber || '-'}</strong></div>
                        <div><span>Tipo documento</span><strong>{selectedCustomer?.documentTypeLabel || selectedCustomer?.documentType || '-'}</strong></div>
                        <div><span>Notas</span><strong>{selectedCustomer?.profile?.notes || selectedCustomer?.notes || '-'}</strong></div>
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
                            disabled={busy || !customerForm.contactName.trim() || !customerForm.phoneE164.trim()}
                            onClick={() => runAction(customerPanelMode === 'create' ? 'Cliente creado' : 'Cliente actualizado', async () => {
                                const payload = buildCustomerPayloadFromForm(customerForm);
                                if (customerPanelMode === 'create' || !selectedCustomer?.customerId) {
                                    const created = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers', {
                                        method: 'POST',
                                        body: payload
                                    });
                                    const createdId = String(created?.item?.customerId || '').trim();
                                    if (createdId) setSelectedCustomerId(createdId);
                                    setCustomerPanelMode('view');
                                    await loadCustomers(tenantScopeId);
                                    return;
                                }

                                await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/' + encodeURIComponent(selectedCustomer.customerId), {
                                    method: 'PUT',
                                    body: payload
                                });
                                setCustomerPanelMode('view');
                                await loadCustomers(tenantScopeId);
                            })}
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
                        <input value={customerForm.profileFirstNames} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileFirstNames: event.target.value }))} placeholder="Nombres" disabled={busy} />
                    </div>
                    <div className="saas-admin-form-row">
                        <input value={customerForm.profileLastNamePaternal} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileLastNamePaternal: event.target.value }))} placeholder="Apellido paterno" disabled={busy} />
                        <input value={customerForm.profileLastNameMaternal} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileLastNameMaternal: event.target.value }))} placeholder="Apellido materno" disabled={busy} />
                    </div>
                </SaasDetailPanelSection>

                <SaasDetailPanelSection title="Contacto" defaultOpen>
                    <div className="saas-admin-form-row">
                        <input value={customerForm.phoneE164} onChange={(event) => setCustomerForm((prev) => ({ ...prev, phoneE164: event.target.value }))} placeholder="Telefono principal (+51...)" disabled={busy} />
                        <input value={customerForm.phoneAlt} onChange={(event) => setCustomerForm((prev) => ({ ...prev, phoneAlt: event.target.value }))} placeholder="Telefono alterno" disabled={busy} />
                    </div>
                    <div className="saas-admin-form-row">
                        <input value={customerForm.email} onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Correo" disabled={busy} />
                        <select value={customerForm.moduleId} onChange={(event) => setCustomerForm((prev) => ({ ...prev, moduleId: event.target.value }))} disabled={busy}>
                            <option value="">Sin modulo</option>
                            {(Array.isArray(waModules) ? waModules : []).map((moduleItem) => (
                                <option key={moduleItem.moduleId} value={moduleItem.moduleId}>{moduleItem.name || moduleItem.moduleId}</option>
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
                        <input value={customerForm.profileDocumentNumber} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileDocumentNumber: event.target.value }))} placeholder="Documento" disabled={busy} />
                    </div>
                    <div className="saas-admin-form-row">
                        <textarea value={customerForm.profileNotes} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileNotes: event.target.value }))} placeholder="Observaciones" rows={3} style={{ width: '100%' }} disabled={busy} />
                    </div>
                </SaasDetailPanelSection>

                <SaasDetailPanelSection title="Direcciones" defaultOpen>
                    {selectedCustomer ? renderAddressesContent() : <p>Guarda el cliente para gestionar direcciones.</p>}
                </SaasDetailPanelSection>

                <SaasDetailPanelSection title="Contextos por modulo" defaultOpen>
                    {selectedCustomer ? renderModuleContextsContent() : <p>Guarda el cliente para ver contextos por modulo.</p>}
                </SaasDetailPanelSection>
            </SaasDetailPanel>
        )
    ) : null;

    return (
        <section id="saas_clientes" className="saas-admin-card saas-admin-card--full">
            <SaasTableDetailLayout
                selectedId={layoutSelectedId}
                className="saas-customers-td-layout"
                left={leftPane}
                right={rightPane}
            />
        </section>
    );
}

export default React.memo(CustomersSection);
