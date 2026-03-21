import React from 'react';

function CustomersSection({
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
}) {
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
                                    {!tenantScopeLocked && filteredCustomers.map((customer) => (
                                        <button
                                            key={customer.customerId}
                                            type="button"
                                            className={("saas-admin-list-item saas-admin-list-item--button " + ((selectedCustomerId === customer.customerId && customerPanelMode !== 'create') ? 'active' : '')).trim()}
                                            onClick={() => openCustomerView(customer.customerId)}
                                        >
                                            <strong>{customer.contactName || customer.customerId}</strong>
                                            <small>{customer.phoneE164 || customer.email || '-'}</small>
                                            <small>{customer.moduleId ? ('Modulo: ' + customer.moduleId) : 'Sin modulo'} | {customer.isActive === false ? 'inactivo' : 'activo'}</small>
                                        </button>
                                    ))}
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
                                                    <button type="button" disabled={busy} onClick={openCustomerEdit}>Editar</button>
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
