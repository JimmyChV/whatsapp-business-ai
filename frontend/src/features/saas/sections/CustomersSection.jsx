import React, { useCallback, useEffect, useMemo, useState } from 'react';

function resolveCustomerId(value = null) {
    if (!value || typeof value !== 'object') return '';
    return String(value.customerId || value.customer_id || value.id || '').trim();
}

function normalizeMarketingConsentStatus(customer = null) {
    if (!customer || typeof customer !== 'object') return 'unknown';
    const direct = String(customer.marketingOptInStatus || customer.marketing_opt_in_status || '').trim().toLowerCase();
    const fromMetadata = String(customer?.metadata?.marketingOptInStatus || '').trim().toLowerCase();
    const normalized = direct || fromMetadata;
    if (normalized === 'opted_in' || normalized === 'opted_out') return normalized;
    return 'unknown';
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
    const [consentDraftByCustomer, setConsentDraftByCustomer] = useState({});
    const [languageDraftByCustomer, setLanguageDraftByCustomer] = useState({});
    const [consentBusy, setConsentBusy] = useState(false);
    const [languageBusy, setLanguageBusy] = useState(false);
    const [moduleContexts, setModuleContexts] = useState([]);
    const [moduleContextsLoading, setModuleContextsLoading] = useState(false);
    const [moduleContextsError, setModuleContextsError] = useState('');
    const [moduleConsentDraftByModuleId, setModuleConsentDraftByModuleId] = useState({});
    const [moduleConsentBusyByModuleId, setModuleConsentBusyByModuleId] = useState({});
    const [editClickBusy, setEditClickBusy] = useState(false);

    const selectedCustomerIdResolved = useMemo(() => resolveCustomerId(selectedCustomer), [selectedCustomer]);
    const moduleNameById = useMemo(() => {
        const map = {};
        (Array.isArray(waModules) ? waModules : []).forEach((moduleItem = {}) => {
            const moduleId = String(moduleItem.moduleId || moduleItem.module_id || '').trim();
            if (!moduleId) return;
            map[moduleId] = String(moduleItem.name || moduleItem.module_name || moduleId).trim() || moduleId;
        });
        return map;
    }, [waModules]);
    const selectedConsentStatus = useMemo(() => {
        if (!selectedCustomerIdResolved) return normalizeMarketingConsentStatus(selectedCustomer);
        const draft = String(consentDraftByCustomer[selectedCustomerIdResolved] || '').trim().toLowerCase();
        if (draft) return draft;
        return normalizeMarketingConsentStatus(selectedCustomer);
    }, [selectedCustomer, selectedCustomerIdResolved, consentDraftByCustomer]);
    const selectedPreferredLanguage = useMemo(() => {
        if (!selectedCustomerIdResolved) return normalizePreferredLanguage(selectedCustomer);
        const draft = String(languageDraftByCustomer[selectedCustomerIdResolved] || '').trim().toLowerCase();
        if (draft) return draft;
        return normalizePreferredLanguage(selectedCustomer);
    }, [selectedCustomer, selectedCustomerIdResolved, languageDraftByCustomer]);

    const handleConsentChange = useCallback(async (nextStatusRaw = '') => {
        const customerId = selectedCustomerIdResolved;
        const nextStatus = String(nextStatusRaw || '').trim().toLowerCase();
        if (!customerId) return;

        setConsentDraftByCustomer((prev) => ({ ...prev, [customerId]: nextStatus || 'unknown' }));
        if (nextStatus !== 'opted_in' && nextStatus !== 'opted_out') return;

        setConsentBusy(true);
        try {
            await requestJson('/api/tenant/customers/' + encodeURIComponent(customerId) + '/consent', {
                method: 'PATCH',
                body: {
                    consentType: 'marketing',
                    status: nextStatus,
                    source: 'manual',
                    proofPayload: {
                        ui: 'saas_customers_section'
                    }
                }
            });
            await loadCustomers(tenantScopeId);
        } finally {
            setConsentBusy(false);
        }
    }, [loadCustomers, requestJson, selectedCustomerIdResolved, tenantScopeId]);

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
        console.log('[customers][edit-click]', {
            busy,
            customerPanelMode,
            hasSelectedCustomer: Boolean(selectedCustomer),
            selectedCustomerId: resolveCustomerId(selectedCustomer)
        });
        if (editClickBusy) return;
        setEditClickBusy(true);
        try {
            openCustomerEdit();
        } finally {
            setEditClickBusy(false);
        }
    }, [busy, customerPanelMode, editClickBusy, openCustomerEdit, selectedCustomer]);

    useEffect(() => {
        if (!isCustomersSection || customerPanelMode === 'create') {
            setModuleContexts([]);
            setModuleContextsError('');
            setModuleConsentDraftByModuleId({});
            return;
        }

        if (!selectedCustomerIdResolved) {
            setModuleContexts([]);
            setModuleContextsError('');
            setModuleConsentDraftByModuleId({});
            return;
        }

        loadModuleContextsByCustomer(selectedCustomerIdResolved);
    }, [customerPanelMode, isCustomersSection, loadModuleContextsByCustomer, selectedCustomerIdResolved]);

    if (!isCustomersSection) {
        return null;
    }

    return (
                    <section id="saas_clientes" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Clientes ({filteredCustomers.length})</h3>
                                        <small>Base de clientes por empresa y modulo.</small>
                                    </div>
                                    <button type="button" disabled={busy || tenantScopeLocked} onClick={openCustomerCreate}>Agregar cliente</button>
                                </div>

                                <div className="saas-admin-form-row">
                                    <input
                                        value={customerSearch}
                                        onChange={(event) => setCustomerSearch(event.target.value)}
                                        placeholder="Buscar por codigo, nombre, telefono, email o documento"
                                        disabled={busy || tenantScopeLocked}
                                    />
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {tenantScopeLocked && (
                                        <div className="saas-admin-empty-state">
                                            <p>Selecciona una empresa para ver clientes.</p>
                                        </div>
                                    )}
                                    {!tenantScopeLocked && filteredCustomers.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>No hay clientes para esta empresa.</p>
                                        </div>
                                    )}
                                    {!tenantScopeLocked && filteredCustomers.map((customer, index) => {
                                        const customerId = resolveCustomerId(customer);
                                        return (
                                            <button
                                                key={customerId || customer.phoneE164 || customer.email || customer.contactName || `customer-item-${index}`}
                                                type="button"
                                                className={("saas-admin-list-item saas-admin-list-item--button " + ((selectedCustomerId === customerId && customerPanelMode !== 'create') ? 'active' : '')).trim()}
                                                onClick={() => openCustomerView(customerId || customer)}
                                            >
                                                <strong>{customer.contactName || customerId || '-'}</strong>
                                                <small>{customer.phoneE164 || customer.email || '-'}</small>
                                                <small>{customer.moduleId ? ('Modulo: ' + customer.moduleId) : 'Sin modulo'} | {customer.isActive === false ? 'inactivo' : 'activo'}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {tenantScopeLocked && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Los clientes estan aislados por tenant.</p>
                                    </div>
                                )}

                                {!tenantScopeLocked && !selectedCustomer && customerPanelMode !== 'create' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona un cliente</h4>
                                        <p>El detalle se muestra en este panel derecho.</p>
                                    </div>
                                )}

                                {!tenantScopeLocked && (selectedCustomer || customerPanelMode === 'create') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{customerPanelMode === 'create' ? 'Nuevo cliente' : (customerPanelMode === 'edit' ? 'Editando cliente' : (selectedCustomer?.contactName || selectedCustomer?.customerId || 'Cliente'))}</h3>
                                                <small>{customerPanelMode === 'view' ? 'Vista bloqueada.' : 'Edicion activa.'}</small>
                                            </div>
                                            {customerPanelMode === 'view' && selectedCustomer && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={editClickBusy} onClick={handleOpenCustomerEdit}>Editar</button>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => runAction('Estado de cliente actualizado', async () => {
                                                            await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/' + encodeURIComponent(selectedCustomer.customerId), {
                                                                method: 'PUT',
                                                                body: { isActive: selectedCustomer.isActive === false }
                                                            });
                                                            await loadCustomers(tenantScopeId);
                                                        })}
                                                    >
                                                        {selectedCustomer.isActive === false ? 'Activar' : 'Desactivar'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {customerPanelMode === 'view' && selectedCustomer && (
                                            <>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedCustomer.customerId || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Nombre contacto</span><strong>{selectedCustomer.contactName || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Telefono</span><strong>{selectedCustomer.phoneE164 || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Telefono 2</span><strong>{selectedCustomer.phoneAlt || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Email</span><strong>{selectedCustomer.email || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Modulo</span><strong>{selectedCustomer.moduleId || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedCustomer.isActive === false ? 'Inactivo' : 'Activo'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedCustomer.updatedAt)}</strong></div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Perfil cliente</h4>
                                                    <div className="saas-admin-related-list">
                                                        <div className="saas-admin-related-row" role="status"><span>Nombres</span><small>{selectedCustomer?.profile?.firstNames || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Apellido paterno</span><small>{selectedCustomer?.profile?.lastNamePaternal || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Apellido materno</span><small>{selectedCustomer?.profile?.lastNameMaternal || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Documento</span><small>{selectedCustomer?.profile?.documentNumber || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Observacion</span><small>{selectedCustomer?.profile?.notes || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Etiquetas</span><small>{Array.isArray(selectedCustomer?.tags) ? selectedCustomer.tags.join(', ') : '-'}</small></div>
                                                    </div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Marketing y preferencias</h4>
                                                    <div className="saas-admin-form-row">
                                                        <label className="saas-admin-module-toggle" style={{ minWidth: 220 }}>
                                                            <span>Consentimiento marketing (resumen)</span>
                                                        </label>
                                                        <select
                                                            value={selectedConsentStatus}
                                                            onChange={() => {}}
                                                            disabled
                                                        >
                                                            <option value="unknown">Sin definir</option>
                                                            <option value="opted_in">Opted in</option>
                                                            <option value="opted_out">Opted out</option>
                                                        </select>
                                                    </div>
                                                    <div className="saas-admin-related-row" role="status">
                                                        <span>Nota</span>
                                                        <small>El consentimiento editable se gestiona por modulo en el panel inferior.</small>
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
                                                            disabled={busy || consentBusy || languageBusy}
                                                        >
                                                            <option value="es">Español (es)</option>
                                                            <option value="en">Ingles (en)</option>
                                                            <option value="pt">Portugues (pt)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Contextos por modulo</h4>
                                                    {moduleContextsLoading && (
                                                        <div className="saas-admin-empty-state">
                                                            <p>Cargando contextos por modulo...</p>
                                                        </div>
                                                    )}
                                                    {!moduleContextsLoading && moduleContextsError && (
                                                        <div className="saas-admin-empty-state">
                                                            <p>{moduleContextsError}</p>
                                                        </div>
                                                    )}
                                                    {!moduleContextsLoading && !moduleContextsError && moduleContexts.length === 0 && (
                                                        <div className="saas-admin-empty-state">
                                                            <p>Este cliente aun no tiene contextos por modulo registrados.</p>
                                                        </div>
                                                    )}
                                                    {!moduleContextsLoading && !moduleContextsError && moduleContexts.length > 0 && (
                                                        <div className="saas-admin-related-list">
                                                            {moduleContexts.map((moduleContext, contextIndex) => {
                                                                const moduleId = String(moduleContext.moduleId || '').trim();
                                                                const moduleLabel = moduleNameById[moduleId] || moduleId || 'Sin modulo';
                                                                const consentValue = String(moduleConsentDraftByModuleId[moduleId] || moduleContext.marketingOptInStatus || 'unknown').trim().toLowerCase();
                                                                const consentBusyForModule = Boolean(moduleConsentBusyByModuleId[moduleId]);
                                                                const labels = Array.isArray(moduleContext.labels) ? moduleContext.labels : [];
                                                                return (
                                                                    <div
                                                                        key={moduleId || `customer-module-context-${contextIndex}`}
                                                                        className="saas-admin-related-list"
                                                                        style={{
                                                                            border: '1px solid rgba(148, 163, 184, 0.25)',
                                                                            borderRadius: 10,
                                                                            padding: '10px 12px',
                                                                            marginBottom: 10
                                                                        }}
                                                                    >
                                                                        <div className="saas-admin-related-row" role="status"><span>Modulo</span><small>{moduleLabel}</small></div>
                                                                        <div className="saas-admin-related-row" role="status"><span>Estado comercial</span><small>{moduleContext.commercialStatus || 'unknown'}</small></div>
                                                                        <div className="saas-admin-related-row" role="status"><span>Vendedora asignada</span><small>{moduleContext.assignmentUserId || '-'}</small></div>
                                                                        <div className="saas-admin-related-row" role="status"><span>Etiquetas</span><small>{labels.length > 0 ? labels.join(', ') : '-'}</small></div>
                                                                        <div className="saas-admin-related-row" role="status"><span>Primera interaccion</span><small>{formatDateTimeLabel(moduleContext.firstInteractionAt)}</small></div>
                                                                        <div className="saas-admin-related-row" role="status"><span>Ultima interaccion</span><small>{formatDateTimeLabel(moduleContext.lastInteractionAt)}</small></div>
                                                                        <div className="saas-admin-form-row">
                                                                            <label className="saas-admin-module-toggle" style={{ minWidth: 220 }}>
                                                                                <span>Consentimiento marketing</span>
                                                                            </label>
                                                                            <select
                                                                                value={consentValue}
                                                                                onChange={(event) => {
                                                                                    handleModuleConsentChange(moduleId, event.target.value);
                                                                                }}
                                                                                disabled={busy || consentBusy || languageBusy || consentBusyForModule || !moduleId}
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
                                                    )}
                                                </div>
                                                </>
                                        )}

                                        {customerPanelMode !== 'view' && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input value={customerForm.contactName} onChange={(event) => setCustomerForm((prev) => ({ ...prev, contactName: event.target.value }))} placeholder="Nombre contacto" disabled={busy} />
                                                    <input value={customerForm.email} onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Correo" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input value={customerForm.phoneE164} onChange={(event) => setCustomerForm((prev) => ({ ...prev, phoneE164: event.target.value }))} placeholder="Telefono principal (+51...)" disabled={busy} />
                                                    <input value={customerForm.phoneAlt} onChange={(event) => setCustomerForm((prev) => ({ ...prev, phoneAlt: event.target.value }))} placeholder="Telefono alterno" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <select value={customerForm.moduleId} onChange={(event) => setCustomerForm((prev) => ({ ...prev, moduleId: event.target.value }))} disabled={busy}>
                                                        <option value="">Sin modulo</option>
                                                        {waModules.map((moduleItem) => (
                                                            <option key={moduleItem.moduleId} value={moduleItem.moduleId}>{moduleItem.name || moduleItem.moduleId}</option>
                                                        ))}
                                                    </select>
                                                    <input value={customerForm.tagsText} onChange={(event) => setCustomerForm((prev) => ({ ...prev, tagsText: event.target.value }))} placeholder="Etiquetas separadas por coma" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input value={customerForm.profileFirstNames} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileFirstNames: event.target.value }))} placeholder="Nombres" disabled={busy} />
                                                    <input value={customerForm.profileLastNamePaternal} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileLastNamePaternal: event.target.value }))} placeholder="Apellido paterno" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input value={customerForm.profileLastNameMaternal} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileLastNameMaternal: event.target.value }))} placeholder="Apellido materno" disabled={busy} />
                                                    <input value={customerForm.profileDocumentNumber} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileDocumentNumber: event.target.value }))} placeholder="Documento" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <textarea value={customerForm.profileNotes} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileNotes: event.target.value }))} placeholder="Observaciones" rows={3} style={{ width: '100%' }} disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <label className="saas-admin-module-toggle">
                                                        <input type="checkbox" checked={customerForm.isActive !== false} onChange={(event) => setCustomerForm((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                                                        <span>Cliente activo</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
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
                                                </div>
                                            </>
                                        )}

                                        <div className="saas-admin-related-block">
                                            <h4>Importacion masiva CSV</h4>
                                            <div className="saas-admin-form-row">
                                                <select value={customerImportModuleId} onChange={(event) => setCustomerImportModuleId(String(event.target.value || '').trim())} disabled={busy}>
                                                    <option value="">Sin modulo por defecto</option>
                                                    {waModules.map((moduleItem) => (
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
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
    );
}

export default React.memo(CustomersSection);
