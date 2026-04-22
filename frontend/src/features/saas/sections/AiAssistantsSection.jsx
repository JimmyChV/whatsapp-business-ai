import React from 'react';

function AiAssistantsSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
    isAiSection,
    busy,
    loadingAiAssistants,
    settingsTenantId,
    loadTenantAiAssistants,
    openAiAssistantCreate,
    tenantAiAssistantItems,
    selectedAiAssistantId,
    aiAssistantPanelMode,
    openAiAssistantView,
    selectedAiAssistant,
    formatDateTimeLabel,
    canManageAi,
    openAiAssistantEdit,
    markAiAssistantAsDefault,
    toggleAiAssistantActive,
    aiAssistantForm,
    setAiAssistantForm,
    AI_MODEL_OPTIONS,
    applyLavitatAssistantPreset,
    saveAiAssistant,
    cancelAiAssistantEdit,
    setSelectedAiAssistantId,
    setAiAssistantPanelMode,
    EMPTY_AI_ASSISTANT_FORM
    } = context;
    const [assistantSearch, setAssistantSearch] = React.useState('');
    const filteredAiAssistants = React.useMemo(() => {
        const query = assistantSearch.trim().toLowerCase();
        if (!query) return tenantAiAssistantItems;
        return tenantAiAssistantItems.filter((assistant) => [
            assistant?.name,
            assistant?.assistantId,
            assistant?.model,
            assistant?.provider,
            assistant?.isActive ? 'activo' : 'inactivo',
            assistant?.isDefault ? 'principal' : ''
        ].some((value) => String(value || '').toLowerCase().includes(query)));
    }, [assistantSearch, tenantAiAssistantItems]);

    React.useEffect(() => {
        if (!isAiSection) return undefined;
        const handleEscape = (event) => {
            if (event.key !== 'Escape') return;
            if (aiAssistantPanelMode === 'create' || aiAssistantPanelMode === 'edit') {
                cancelAiAssistantEdit?.();
                return;
            }
            setSelectedAiAssistantId?.('');
            setAiAssistantPanelMode?.('view');
            setAiAssistantForm?.({ ...EMPTY_AI_ASSISTANT_FORM });
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [
        EMPTY_AI_ASSISTANT_FORM,
        aiAssistantPanelMode,
        cancelAiAssistantEdit,
        isAiSection,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setSelectedAiAssistantId
    ]);

    if (!isAiSection) {
        return null;
    }

    return (
                    <section id="saas_ia" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail saas-admin-master-detail--td-pattern">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Asistentes IA</h3>
                                        <small>{settingsTenantId ? 'Define asistentes por empresa y asignalos por modulo.' : 'Selecciona una empresa para administrar asistentes IA.'}</small>
                                    </div>
                                </div>

                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    <button type="button" disabled={busy || !settingsTenantId || loadingAiAssistants} onClick={() => settingsTenantId && loadTenantAiAssistants(settingsTenantId)}>
                                        Recargar
                                    </button>
                                    <button type="button" disabled={busy || !settingsTenantId || !canManageAi} onClick={openAiAssistantCreate}>
                                        Nuevo asistente
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => { setSelectedAiAssistantId(''); setAiAssistantPanelMode('view'); setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM }); }}>
                                        Deseleccionar
                                    </button>
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    <div className="saas-admin-master-toolbar">
                                        <input
                                            value={assistantSearch}
                                            onChange={(event) => setAssistantSearch(event.target.value)}
                                            placeholder="Buscar asistente por nombre, codigo, modelo o estado"
                                            disabled={loadingAiAssistants}
                                        />
                                        <button type="button">Columnas</button>
                                    </div>
                                    <div className="saas-admin-list-table-head saas-admin-list-table-head--assistants">
                                        <span>Asistente</span>
                                        <span>Modelo</span>
                                        <span>Estado</span>
                                    </div>
                                    {!settingsTenantId && (
                                        <div className="saas-admin-empty-state">
                                            <h4>Sin empresa seleccionada</h4>
                                            <p>Elige una empresa para administrar asistentes IA.</p>
                                        </div>
                                    )}

                                    {settingsTenantId && tenantAiAssistantItems.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <h4>Sin asistentes IA</h4>
                                            <p>Crea el primer asistente para definir contexto por modulo.</p>
                                        </div>
                                    )}

                                    {settingsTenantId && tenantAiAssistantItems.length > 0 && filteredAiAssistants.length === 0 && (
                                        <div className="saas-admin-empty-inline">No hay asistentes para esta busqueda.</div>
                                    )}

                                    {settingsTenantId && filteredAiAssistants.map((assistant) => (
                                        <button
                                            key={`assistant_${assistant.assistantId}`}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button saas-admin-list-item--table saas-admin-list-item--assistants ${selectedAiAssistantId === assistant.assistantId && aiAssistantPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                            onClick={() => openAiAssistantView(assistant.assistantId)}
                                        >
                                            <strong>{assistant.name || assistant.assistantId}</strong>
                                            <span>{assistant.model || '-'}</span>
                                            <small>{assistant.isActive ? 'Activo' : 'Inactivo'}{assistant.isDefault ? ' | Principal' : ''}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Asistentes por empresa</h4>
                                        <p>Selecciona una empresa para ver detalle y configuracion IA.</p>
                                    </div>
                                )}

                                {settingsTenantId && aiAssistantPanelMode === 'view' && !selectedAiAssistant && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Sin asistente seleccionado</h4>
                                        <p>Selecciona un asistente de la lista o crea uno nuevo.</p>
                                    </div>
                                )}

                                {settingsTenantId && aiAssistantPanelMode === 'view' && selectedAiAssistant && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{selectedAiAssistant.name || selectedAiAssistant.assistantId}</h3>
                                                <small>{selectedAiAssistant.assistantId}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" disabled={busy || !canManageAi} onClick={openAiAssistantEdit}>Editar</button>
                                                <button
                                                    type="button"
                                                    disabled={busy || !canManageAi || selectedAiAssistant.isDefault || selectedAiAssistant.isActive === false}
                                                    onClick={() => markAiAssistantAsDefault(selectedAiAssistant.assistantId)}
                                                >
                                                    Marcar principal
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy || !canManageAi}
                                                    onClick={() => toggleAiAssistantActive(selectedAiAssistant)}
                                                    >
                                                        {selectedAiAssistant.isActive ? 'Desactivar' : 'Activar'}
                                                    </button>
                                                    <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { setSelectedAiAssistantId(''); setAiAssistantPanelMode('view'); setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM }); }}>
                                                        Cerrar
                                                    </button>
                                                </div>
                                            </div>

                                        <div className="saas-admin-detail-grid">
                                            <div className="saas-admin-detail-field"><span>Proveedor</span><strong>{selectedAiAssistant.provider}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Modelo</span><strong>{selectedAiAssistant.model}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Temperatura</span><strong>{selectedAiAssistant.temperature}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Top P</span><strong>{selectedAiAssistant.topP}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Max tokens</span><strong>{selectedAiAssistant.maxTokens}</strong></div>
                                            <div className="saas-admin-detail-field"><span>API key</span><strong>{selectedAiAssistant.openAiApiKeyMasked || 'No configurada'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedAiAssistant.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Principal</span><strong>{selectedAiAssistant.isDefault ? 'Si' : 'No'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedAiAssistant.updatedAt)}</strong></div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Descripcion</h4>
                                            <div className="saas-admin-related-list">
                                                <div className="saas-admin-related-row" role="status">
                                                    <span>{selectedAiAssistant.description || 'Sin descripcion.'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>System prompt</h4>
                                            <div className="saas-admin-detail-metadata">
                                                <pre>{selectedAiAssistant.systemPrompt || 'Sin prompt configurado.'}</pre>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {settingsTenantId && (aiAssistantPanelMode === 'create' || aiAssistantPanelMode === 'edit') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{aiAssistantPanelMode === 'create' ? 'Nuevo asistente IA' : 'Editar asistente IA'}</h3>
                                                <small>{aiAssistantPanelMode === 'create' ? 'Define contexto y parametros de inferencia.' : 'Actualiza los campos necesarios y guarda.'}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelAiAssistantEdit}>
                                                    Cerrar
                                                </button>
                                            </div>
                                        </div>

                                        {aiAssistantPanelMode === 'edit' && (
                                            <div className="saas-admin-detail-grid">
                                                <div className="saas-admin-detail-field">
                                                    <span>Codigo</span>
                                                    <strong>{aiAssistantForm.assistantId || '-'}</strong>
                                                </div>
                                            </div>
                                        )}

                                        <div className="saas-admin-form-row">
                                            <input
                                                value={aiAssistantForm.name}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, name: event.target.value }))}
                                                placeholder="Nombre del asistente"
                                                disabled={busy}
                                            />
                                            <select
                                                value={aiAssistantForm.model}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, model: event.target.value }))}
                                                disabled={busy}
                                            >
                                                {AI_MODEL_OPTIONS.map((model) => (
                                                    <option key={`ai_model_${model}`} value={model}>{model}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <div className="saas-admin-field">
                                                <label>Temperatura (0-2)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="2"
                                                    step="0.1"
                                                    value={aiAssistantForm.temperature}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, temperature: event.target.value }))}
                                                    disabled={busy}
                                                />
                                            </div>
                                            <div className="saas-admin-field">
                                                <label>Top P (0-1)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="1"
                                                    step="0.05"
                                                    value={aiAssistantForm.topP}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, topP: event.target.value }))}
                                                    disabled={busy}
                                                />
                                            </div>
                                            <div className="saas-admin-field">
                                                <label>Max tokens</label>
                                                <input
                                                    type="number"
                                                    min="64"
                                                    max="4096"
                                                    step="1"
                                                    value={aiAssistantForm.maxTokens}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, maxTokens: event.target.value }))}
                                                    disabled={busy}
                                                />
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <textarea
                                                value={aiAssistantForm.description}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, description: event.target.value }))}
                                                placeholder="Descripcion del asistente"
                                                rows={2}
                                                disabled={busy}
                                            />
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <textarea
                                                value={aiAssistantForm.systemPrompt}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, systemPrompt: event.target.value }))}
                                                placeholder="Prompt base del asistente (contexto, tono, reglas, etc.)"
                                                rows={8}
                                                disabled={busy}
                                            />
                                        </div>

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button type="button" disabled={busy} onClick={applyLavitatAssistantPreset}>
                                                Cargar plantilla Lavitat
                                            </button>
                                        </div>
                                        <div className="saas-admin-form-row">
                                            <input
                                                type="password"
                                                value={aiAssistantForm.openaiApiKey}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, openaiApiKey: event.target.value }))}
                                                placeholder={aiAssistantForm.openAiApiKeyMasked || 'OpenAI API key (opcional si no se cambia)'}
                                                disabled={busy}
                                            />
                                        </div>

                                        <div className="saas-admin-modules">
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={aiAssistantForm.isActive !== false}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                    disabled={busy}
                                                />
                                                <span>Asistente activo</span>
                                            </label>
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={aiAssistantForm.isDefault === true}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
                                                    disabled={busy}
                                                />
                                                <span>Asistente principal del tenant</span>
                                            </label>
                                        </div>

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button
                                                type="button"
                                                disabled={busy || !String(aiAssistantForm.name || '').trim()}
                                                onClick={saveAiAssistant}
                                            >
                                                {aiAssistantPanelMode === 'create' ? 'Guardar asistente' : 'Actualizar asistente'}
                                            </button>
                                            <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelAiAssistantEdit}>Cancelar</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
    );
}

export default React.memo(AiAssistantsSection);
