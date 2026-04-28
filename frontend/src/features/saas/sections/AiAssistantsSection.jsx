import React from 'react';
import { SaasEntityPage } from '../components/layout';

const text = (value) => String(value ?? '').trim();

function AiAssistantsSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isAiSection,
        busy,
        loadingAiAssistants,
        settingsTenantId,
        loadTenantAiAssistants,
        openAiAssistantCreate,
        tenantAiAssistantItems = [],
        selectedAiAssistantId,
        aiAssistantPanelMode,
        openAiAssistantView,
        selectedAiAssistant,
        formatDateTimeLabel = (value) => value || '-',
        canManageAi,
        openAiAssistantEdit,
        markAiAssistantAsDefault,
        toggleAiAssistantActive,
        aiAssistantForm = {},
        setAiAssistantForm,
        AI_MODEL_OPTIONS = [],
        applyLavitatAssistantPreset,
        saveAiAssistant,
        cancelAiAssistantEdit,
        setSelectedAiAssistantId,
        setAiAssistantPanelMode,
        EMPTY_AI_ASSISTANT_FORM
    } = context;

    const isEditing = aiAssistantPanelMode === 'create' || aiAssistantPanelMode === 'edit';
    const selectedId = aiAssistantPanelMode === 'create' ? '__create_ai_assistant__' : selectedAiAssistantId;

    const rows = React.useMemo(() => tenantAiAssistantItems.map((assistant) => ({
        id: text(assistant?.assistantId),
        name: assistant?.name || assistant?.assistantId || '-',
        provider: assistant?.provider || '-',
        model: assistant?.model || '-',
        status: assistant?.isActive ? 'Activo' : 'Inactivo',
        defaultLabel: assistant?.isDefault ? 'Principal' : '-',
        raw: assistant
    })), [tenantAiAssistantItems]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Asistente', width: '28%', sortable: true },
        { key: 'model', label: 'Modelo', width: '20%', sortable: true },
        { key: 'provider', label: 'Proveedor', width: '16%', sortable: true },
        { key: 'defaultLabel', label: 'Principal', width: '16%', sortable: true },
        { key: 'status', label: 'Estado', width: '14%', sortable: true }
    ], []);

    const filters = React.useMemo(() => [
        {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'Activo', label: 'Activo' },
                { value: 'Inactivo', label: 'Inactivo' }
            ]
        },
        {
            key: 'defaultLabel',
            label: 'Principal',
            type: 'select',
            options: [{ value: 'Principal', label: 'Principal' }]
        }
    ], []);

    const close = React.useCallback(() => {
        if (isEditing) {
            cancelAiAssistantEdit?.();
            return;
        }
        setSelectedAiAssistantId?.('');
        setAiAssistantPanelMode?.('view');
        setAiAssistantForm?.({ ...EMPTY_AI_ASSISTANT_FORM });
    }, [
        EMPTY_AI_ASSISTANT_FORM,
        cancelAiAssistantEdit,
        isEditing,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setSelectedAiAssistantId
    ]);

    const renderDetail = React.useCallback(() => {
        if (!settingsTenantId) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Asistentes por empresa</h4>
                    <p>Selecciona una empresa para ver el detalle y la configuración de asistentes IA.</p>
                </div>
            );
        }
        if (!selectedAiAssistant) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Sin asistente seleccionado</h4>
                    <p>Selecciona un asistente de la lista o crea uno nuevo.</p>
                </div>
            );
        }
        return (
            <>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>Proveedor</span><strong>{selectedAiAssistant.provider}</strong></div>
                    <div className="saas-admin-detail-field"><span>Modelo</span><strong>{selectedAiAssistant.model}</strong></div>
                    <div className="saas-admin-detail-field"><span>Temperatura</span><strong>{selectedAiAssistant.temperature}</strong></div>
                    <div className="saas-admin-detail-field"><span>Top P</span><strong>{selectedAiAssistant.topP}</strong></div>
                    <div className="saas-admin-detail-field"><span>Máx. tokens</span><strong>{selectedAiAssistant.maxTokens}</strong></div>
                    <div className="saas-admin-detail-field"><span>API key</span><strong>{selectedAiAssistant.openAiApiKeyMasked || 'No configurada'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedAiAssistant.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Principal</span><strong>{selectedAiAssistant.isDefault ? 'Sí' : 'No'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ACTUALIZADO</span><strong>{formatDateTimeLabel(selectedAiAssistant.updatedAt)}</strong></div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Descripción</h4>
                    <div className="saas-admin-related-row" role="status"><span>{selectedAiAssistant.description || 'Sin descripción.'}</span></div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Prompt del sistema</h4>
                    <div className="saas-admin-detail-metadata">
                        <pre>{selectedAiAssistant.systemPrompt || 'Sin prompt configurado.'}</pre>
                    </div>
                </div>
            </>
        );
    }, [
        busy,
        canManageAi,
        formatDateTimeLabel,
        markAiAssistantAsDefault,
        openAiAssistantEdit,
        selectedAiAssistant,
        settingsTenantId,
        toggleAiAssistantActive
    ]);

    const detailActions = React.useMemo(() => {
        if (!selectedAiAssistant || isEditing) return null;
        return (
            <>
                <button type="button" disabled={busy || !canManageAi} onClick={openAiAssistantEdit}>Editar</button>
                <button
                    type="button"
                    disabled={busy || !canManageAi || selectedAiAssistant.isDefault || selectedAiAssistant.isActive === false}
                    onClick={() => markAiAssistantAsDefault?.(selectedAiAssistant.assistantId)}
                >
                    Marcar principal
                </button>
                <button type="button" disabled={busy || !canManageAi} onClick={() => toggleAiAssistantActive?.(selectedAiAssistant)}>
                    {selectedAiAssistant.isActive ? 'Desactivar' : 'Activar'}
                </button>
            </>
        );
    }, [
        busy,
        canManageAi,
        isEditing,
        markAiAssistantAsDefault,
        openAiAssistantEdit,
        selectedAiAssistant,
        toggleAiAssistantActive
    ]);

    const renderForm = React.useCallback(() => (
        <>
            {aiAssistantPanelMode === 'edit' ? (
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>CÓDIGO</span><strong>{aiAssistantForm.assistantId || '-'}</strong></div>
                </div>
            ) : null}
            <div className="saas-admin-form-row">
                <input value={aiAssistantForm.name || ''} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre del asistente" disabled={busy} />
                <select value={aiAssistantForm.model || ''} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, model: event.target.value }))} disabled={busy}>
                    {AI_MODEL_OPTIONS.map((model) => <option key={`ai_model_${model}`} value={model}>{model}</option>)}
                </select>
            </div>
            <div className="saas-admin-form-row">
                <div className="saas-admin-field">
                    <label>Temperatura (0-2)</label>
                    <input type="number" min="0" max="2" step="0.1" value={aiAssistantForm.temperature || ''} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, temperature: event.target.value }))} disabled={busy} />
                </div>
                <div className="saas-admin-field">
                    <label>Top P (0-1)</label>
                    <input type="number" min="0" max="1" step="0.05" value={aiAssistantForm.topP || ''} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, topP: event.target.value }))} disabled={busy} />
                </div>
                <div className="saas-admin-field">
                    <label>Máx. tokens</label>
                    <input type="number" min="64" max="4096" step="1" value={aiAssistantForm.maxTokens || ''} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, maxTokens: event.target.value }))} disabled={busy} />
                </div>
            </div>
            <div className="saas-admin-form-row">
                <textarea value={aiAssistantForm.description || ''} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, description: event.target.value }))} placeholder="descripción del asistente" rows={2} disabled={busy} />
            </div>
            <div className="saas-admin-form-row">
                <textarea value={aiAssistantForm.systemPrompt || ''} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, systemPrompt: event.target.value }))} placeholder="Prompt base del asistente" rows={8} disabled={busy} />
            </div>
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy} onClick={applyLavitatAssistantPreset}>Cargar plantilla Lavitat</button>
            </div>
            <div className="saas-admin-form-row">
                <input type="password" value={aiAssistantForm.openaiApiKey || ''} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, openaiApiKey: event.target.value }))} placeholder={aiAssistantForm.openAiApiKeyMasked || 'OpenAI API key (opcional si no se cambia)'} disabled={busy} />
            </div>
            <div className="saas-admin-modules">
                <label className="saas-admin-module-toggle">
                    <input type="checkbox" checked={aiAssistantForm.isActive !== false} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                    <span>Asistente activo</span>
                </label>
                <label className="saas-admin-module-toggle">
                    <input type="checkbox" checked={aiAssistantForm.isDefault === true} onChange={(event) => setAiAssistantForm?.((prev) => ({ ...prev, isDefault: event.target.checked }))} disabled={busy} />
                    <span>Asistente principal del tenant</span>
                </label>
            </div>
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !text(aiAssistantForm.name)} onClick={saveAiAssistant}>
                    {aiAssistantPanelMode === 'create' ? 'Guardar asistente' : 'Actualizar asistente'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelAiAssistantEdit}>CANCELAR</button>
            </div>
        </>
    ), [
        AI_MODEL_OPTIONS,
        aiAssistantForm,
        aiAssistantPanelMode,
        applyLavitatAssistantPreset,
        busy,
        cancelAiAssistantEdit,
        saveAiAssistant,
        setAiAssistantForm
    ]);

    if (!isAiSection) return null;

    return (
        <SaasEntityPage
            id="saas_ia"
            sectionKey="saas_ia"
            title="Asistentes IA"
            rows={rows}
            columns={columns}
            selectedId={selectedId}
            onSelect={(row) => openAiAssistantView?.(row?.id)}
            onClose={close}
            renderDetail={renderDetail}
            renderForm={renderForm}
            mode={isEditing ? 'form' : 'detail'}
            dirty={isEditing}
            requestJson={context.requestJson}
            loading={loadingAiAssistants}
            emptyText={settingsTenantId ? 'Sin asistentes IA registrados.' : 'Selecciona una empresa para administrar asistentes IA.'}
            searchPlaceholder="Buscar asistente por nombre, código, modelo o estado..."
            filters={filters}
            actions={[
                { label: 'Recargar', onClick: () => settingsTenantId && loadTenantAiAssistants?.(settingsTenantId), disabled: busy || !settingsTenantId || loadingAiAssistants },
                { label: 'Nuevo', onClick: openAiAssistantCreate, disabled: busy || !settingsTenantId || !canManageAi }
            ]}
            detailTitle={aiAssistantPanelMode === 'create' ? 'Nuevo asistente IA' : (selectedAiAssistant?.name || 'Detalle IA')}
            detailSubtitle={aiAssistantPanelMode === 'create' ? 'Define contexto y parametros de inferencia.' : (selectedAiAssistant?.assistantId || '')}
            detailActions={detailActions}
        />
    );
}

export default React.memo(AiAssistantsSection);
