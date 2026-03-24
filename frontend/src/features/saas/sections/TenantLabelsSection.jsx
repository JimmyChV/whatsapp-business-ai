import React from 'react';

export default function TenantLabelsSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
    busy,
    loadingLabels,
    settingsTenantId,
    loadTenantLabels,
    setError,
    canManageLabels,
    openTenantLabelCreate,
    labelSearch,
    setLabelSearch,
    visibleTenantLabels,
    selectedTenantLabel,
    labelPanelMode,
    setSelectedLabelId,
    setLabelPanelMode,
    openTenantLabelEdit,
    runAction,
    deactivateTenantLabel,
    requestJson,
    buildTenantLabelPayload,
    waModules,
    labelForm,
    setLabelForm,
    normalizeTenantLabelColor,
    DEFAULT_LABEL_COLORS,
    toggleModuleInLabelForm,
    saveTenantLabel,
    cancelTenantLabelEdit
    } = context;
    return (
                    <section id="saas_etiquetas" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Etiquetas de chat</h3>
                                        <small>Define etiquetas visuales por empresa, color y alcance por modulo.</small>
                                    </div>
                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                        <button
                                            type="button"
                                            disabled={busy || loadingLabels || !settingsTenantId}
                                            onClick={() => settingsTenantId && loadTenantLabels(settingsTenantId).catch((err) => setError(String(err?.message || err || 'No se pudieron recargar etiquetas.')))}
                                        >
                                            Recargar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || !canManageLabels || !settingsTenantId}
                                            onClick={openTenantLabelCreate}
                                        >
                                            Nueva etiqueta
                                        </button>
                                    </div>
                                </div>

                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Primero elige una empresa para administrar etiquetas.</p>
                                    </div>
                                )}

                                {settingsTenantId && (
                                    <>
                                        <div className="saas-admin-form-row">
                                            <input
                                                value={labelSearch}
                                                onChange={(event) => setLabelSearch(event.target.value)}
                                                placeholder="Filtrar etiquetas por nombre o codigo"
                                                disabled={loadingLabels}
                                            />
                                        </div>

                                        <div className="saas-admin-list saas-admin-list--compact">
                                            {visibleTenantLabels.length === 0 && (
                                                <div className="saas-admin-empty-state">
                                                    <h4>Sin etiquetas</h4>
                                                    <p>Crea tu primera etiqueta para clasificar chats.</p>
                                                </div>
                                            )}
                                            {visibleTenantLabels.map((label) => (
                                                <button
                                                    key={`tenant_label_${label.labelId}`}
                                                    type="button"
                                                    className={`saas-admin-list-item saas-admin-list-item--button ${(selectedTenantLabel?.labelId === label.labelId && labelPanelMode !== 'create') ? 'active' : ''}`.trim()}
                                                    onClick={() => {
                                                        setSelectedLabelId(String(label.labelId || '').trim().toUpperCase());
                                                        setLabelPanelMode('view');
                                                    }}
                                                >
                                                    <strong>{label.name || label.labelId}</strong>
                                                    <small>{label.labelId}</small>
                                                    <small>{label.moduleIds.length > 0 ? `Modulos: ${label.moduleIds.length}` : 'Compartida (todos los modulos)'} | {label.isActive === false ? 'inactiva' : 'activa'}</small>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Sin empresa seleccionada</h4>
                                        <p>Selecciona una empresa para ver y gestionar sus etiquetas.</p>
                                    </div>
                                )}

                                {settingsTenantId && !selectedTenantLabel && labelPanelMode === 'view' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una etiqueta</h4>
                                        <p>El detalle de la etiqueta se muestra en este panel derecho.</p>
                                    </div>
                                )}

                                {settingsTenantId && (selectedTenantLabel || labelPanelMode === 'create') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{labelPanelMode === 'create' ? 'Nueva etiqueta' : (labelPanelMode === 'edit' ? 'Editando etiqueta' : (selectedTenantLabel?.name || selectedTenantLabel?.labelId || 'Etiqueta'))}</h3>
                                                <small>{labelPanelMode === 'view' ? 'Vista bloqueada' : 'Edicion activa'}</small>
                                            </div>
                                            {labelPanelMode === 'view' && selectedTenantLabel && canManageLabels && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy} onClick={openTenantLabelEdit}>Editar</button>
                                                    {selectedTenantLabel?.isActive !== false ? (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => runAction('Etiqueta desactivada', async () => {
                                                                await deactivateTenantLabel(selectedTenantLabel?.labelId);
                                                            })}
                                                        >
                                                            Desactivar
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => runAction('Etiqueta reactivada', async () => {
                                                                const cleanLabelId = String(selectedTenantLabel?.labelId || '').trim().toUpperCase();
                                                                if (!cleanLabelId) return;
                                                                await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/labels/${encodeURIComponent(cleanLabelId)}`, {
                                                                    method: 'PUT',
                                                                    body: {
                                                                        ...buildTenantLabelPayload(selectedTenantLabel, { allowLabelId: false }),
                                                                        isActive: true
                                                                    }
                                                                });
                                                                await loadTenantLabels(settingsTenantId);
                                                            })}
                                                        >
                                                            Reactivar
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {labelPanelMode === 'view' && selectedTenantLabel && (
                                            <>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedTenantLabel.labelId || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedTenantLabel.name || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenantLabel.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Orden</span><strong>{selectedTenantLabel.sortOrder || 100}</strong></div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Color visual</h4>
                                                    <div className="saas-admin-related-list">
                                                        <div className="saas-admin-related-row" role="status">
                                                            <span>Hex</span>
                                                            <small>{selectedTenantLabel.color || '#00A884'}</small>
                                                        </div>
                                                        <div className="saas-admin-related-row" role="status">
                                                            <span>Muestra</span>
                                                            <small>
                                                                <span className="chat-header-label-chip" style={{ '--label-color': selectedTenantLabel.color || '#00A884' }}>{selectedTenantLabel.name || 'Etiqueta'}</span>
                                                            </small>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Alcance por modulo</h4>
                                                    <div className="saas-admin-related-list">
                                                        {selectedTenantLabel.moduleIds.length === 0 && (
                                                            <div className="saas-admin-related-row" role="status"><span>Alcance</span><small>Compartida para todos los modulos</small></div>
                                                        )}
                                                        {selectedTenantLabel.moduleIds.map((moduleId) => {
                                                            const moduleMatch = waModules.find((entry) => String(entry?.moduleId || '').trim().toLowerCase() === moduleId);
                                                            return (
                                                                <div key={`label_view_module_${moduleId}`} className="saas-admin-related-row" role="status">
                                                                    <span>{moduleMatch?.name || moduleId}</span>
                                                                    <small>{moduleId}</small>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {(labelPanelMode === 'create' || labelPanelMode === 'edit') && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={labelForm.name}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre de etiqueta"
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        value={labelForm.labelId}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, labelId: String(event.target.value || '').trim().toUpperCase() }))}
                                                        placeholder="Codigo (opcional, auto si vacio)"
                                                        disabled={busy || labelPanelMode === 'edit'}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={labelForm.description}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, description: event.target.value }))}
                                                        placeholder="Descripcion (opcional)"
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="9999"
                                                        value={labelForm.sortOrder}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                                                        placeholder="Orden"
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        type="color"
                                                        value={normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0])}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, color: event.target.value }))}
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        value={normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0])}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, color: event.target.value }))}
                                                        placeholder="#00A884"
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-modules">
                                                    {DEFAULT_LABEL_COLORS.map((colorValue) => (
                                                        <button
                                                            key={`label_color_${colorValue}`}
                                                            type="button"
                                                            className="saas-admin-color-chip"
                                                            style={{ background: colorValue, borderColor: colorValue }}
                                                            title={colorValue}
                                                            disabled={busy}
                                                            onClick={() => setLabelForm((prev) => ({ ...prev, color: colorValue }))}
                                                        >
                                                            {normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0]) === colorValue ? 'ok' : ''}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="saas-admin-modules">
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={labelForm.isActive !== false}
                                                            onChange={(event) => setLabelForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                            disabled={busy}
                                                        />
                                                        <span>Etiqueta activa</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Asignacion por modulo</h4>
                                                    <small>Si no marcas modulos, la etiqueta queda compartida para todos.</small>
                                                    <div className="saas-admin-modules" style={{ marginTop: '8px' }}>
                                                        {waModules.length === 0 && (
                                                            <div className="saas-admin-empty-inline">No hay modulos configurados para esta empresa.</div>
                                                        )}
                                                        {waModules.map((moduleItem) => {
                                                            const moduleId = String(moduleItem?.moduleId || '').trim().toLowerCase();
                                                            const checked = Array.isArray(labelForm.moduleIds) && labelForm.moduleIds.includes(moduleId);
                                                            return (
                                                                <label key={`assignment_module_${moduleId}`} className="saas-admin-module-toggle">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleModuleInLabelForm(moduleId)}
                                                                        disabled={busy}
                                                                    />
                                                                    <span>{moduleItem?.name || moduleId}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={busy || !canManageLabels || !String(labelForm.name || '').trim()}
                                                        onClick={() => runAction(labelPanelMode === 'create' ? 'Etiqueta creada' : 'Etiqueta actualizada', async () => {
                                                            await saveTenantLabel();
                                                        })}
                                                    >
                                                        {labelPanelMode === 'create' ? 'Guardar etiqueta' : 'Actualizar etiqueta'}
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={cancelTenantLabelEdit}>Cancelar</button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
        </section>
    );
}
