import React from 'react';
import { SaasEntityPage } from '../components/layout';

const text = (value) => String(value ?? '').trim();

export default function QuickRepliesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        busy,
        loadingQuickReplies,
        settingsTenantId,
        loadQuickReplyData,
        setError,
        canManageQuickReplies,
        openQuickReplyLibraryCreate,
        quickReplyModuleFilterId,
        setQuickReplyModuleFilterId,
        setSelectedQuickReplyLibraryId,
        setSelectedQuickReplyItemId,
        setQuickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode,
        waModules = [],
        visibleQuickReplyLibraries = [],
        selectedQuickReplyLibrary,
        quickReplyLibraryPanelMode,
        openQuickReplyLibraryEdit,
        runAction,
        deactivateQuickReplyLibrary,
        quickReplyLibraryForm = {},
        setQuickReplyLibraryForm,
        toggleModuleInQuickReplyLibraryForm,
        saveQuickReplyLibrary,
        cancelQuickReplyLibraryEdit,
        QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
        visibleQuickReplyItemsForSelectedLibrary = [],
        quickReplyUploadMaxMb,
        quickReplyStorageQuotaMb,
        normalizeQuickReplyMediaAssets,
        selectedQuickReplyItem,
        quickReplyItemPanelMode,
        openQuickReplyItemEdit,
        deactivateQuickReplyItem,
        selectedQuickReplyItemMediaAssets = [],
        formatDateTimeLabel = (value) => value || '-',
        resolveQuickReplyAssetPreviewUrl = (value) => value,
        getQuickReplyAssetDisplayName = (asset, index) => asset?.filename || asset?.name || `Adjunto ${index + 1}`,
        isQuickReplyImageAsset = () => false,
        getQuickReplyAssetTypeLabel = () => 'file',
        formatBytes = (value) => value,
        quickReplyItemForm = {},
        setQuickReplyItemForm,
        uploadingQuickReplyAssets,
        QUICK_REPLY_ACCEPT_VALUE,
        handleQuickReplyAssetSelection,
        quickReplyItemFormAssets = [],
        removeQuickReplyAssetAt,
        saveQuickReplyItem,
        cancelQuickReplyItemEdit,
        openQuickReplyItemCreate
    } = context;

    const isLibraryEditing = quickReplyLibraryPanelMode === 'create' || quickReplyLibraryPanelMode === 'edit';
    const isItemEditing = quickReplyItemPanelMode === 'create' || quickReplyItemPanelMode === 'edit';
    const selectedId = quickReplyLibraryPanelMode === 'create'
        ? '__create_quick_reply_library__'
        : text(selectedQuickReplyLibrary?.libraryId);

    const rows = React.useMemo(() => visibleQuickReplyLibraries.map((library) => ({
        id: text(library?.libraryId).toUpperCase(),
        name: library?.name || library?.libraryId || '-',
        scope: library?.isShared ? 'Compartida' : 'Por modulo',
        status: library?.isActive === false ? 'Inactiva' : 'Activa',
        modules: Array.isArray(library?.moduleIds) ? String(library.moduleIds.length) : '0',
        raw: library
    })), [visibleQuickReplyLibraries]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Biblioteca', width: '30%', sortable: true },
        { key: 'scope', label: 'Alcance', width: '20%', sortable: true },
        { key: 'modules', label: 'Modulos', width: '14%', sortable: true },
        { key: 'status', label: 'Estado', width: '16%', sortable: true },
        { key: 'id', label: 'Codigo', width: '20%', sortable: true }
    ], []);

    const filters = React.useMemo(() => [
        {
            key: 'scope',
            label: 'Alcance',
            type: 'select',
            options: [
                { value: 'Compartida', label: 'Compartida' },
                { value: 'Por modulo', label: 'Por modulo' }
            ]
        },
        {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'Activa', label: 'Activa' },
                { value: 'Inactiva', label: 'Inactiva' }
            ]
        }
    ], []);

    const close = React.useCallback(() => {
        if (isItemEditing) {
            cancelQuickReplyItemEdit?.();
            return;
        }
        if (isLibraryEditing) {
            cancelQuickReplyLibraryEdit?.();
            return;
        }
        setSelectedQuickReplyItemId?.('');
        setSelectedQuickReplyLibraryId?.('');
        setQuickReplyItemPanelMode?.('view');
        setQuickReplyLibraryPanelMode?.('view');
    }, [
        cancelQuickReplyItemEdit,
        cancelQuickReplyLibraryEdit,
        isItemEditing,
        isLibraryEditing,
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryPanelMode,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId
    ]);

    const selectLibrary = React.useCallback((libraryId) => {
        setSelectedQuickReplyLibraryId?.(text(libraryId).toUpperCase());
        setSelectedQuickReplyItemId?.('');
        setQuickReplyLibraryPanelMode?.('view');
        setQuickReplyItemPanelMode?.('view');
    }, [
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryPanelMode,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId
    ]);

    const renderLibraryForm = React.useCallback(() => (
        <div className="saas-admin-related-block">
            <div className="saas-admin-form-row">
                <input value={quickReplyLibraryForm.name || ''} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre de biblioteca" disabled={busy} />
                <input value={quickReplyLibraryForm.description || ''} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descripcion" disabled={busy} />
            </div>
            <div className="saas-admin-modules">
                <label className="saas-admin-module-toggle">
                    <input type="checkbox" checked={quickReplyLibraryForm.isShared === true} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, isShared: event.target.checked }))} disabled={busy} />
                    <span>Biblioteca compartida</span>
                </label>
                <label className="saas-admin-module-toggle">
                    <input type="checkbox" checked={quickReplyLibraryForm.isActive !== false} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                    <span>Biblioteca activa</span>
                </label>
            </div>
            {!quickReplyLibraryForm.isShared ? (
                <div className="saas-admin-modules">
                    {waModules.map((moduleItem) => {
                        const moduleId = text(moduleItem?.moduleId).toLowerCase();
                        const checked = Array.isArray(quickReplyLibraryForm.moduleIds) && quickReplyLibraryForm.moduleIds.includes(moduleId);
                        return (
                            <label key={`qr_library_module_${moduleId}`} className="saas-admin-module-toggle">
                                <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggleModuleInQuickReplyLibraryForm?.(moduleId)} />
                                <span>{moduleItem?.name || moduleId}</span>
                            </label>
                        );
                    })}
                </div>
            ) : null}
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !canManageQuickReplies || !text(quickReplyLibraryForm.name)} onClick={() => runAction?.(quickReplyLibraryPanelMode === 'create' ? 'Biblioteca creada' : 'Biblioteca actualizada', async () => saveQuickReplyLibrary?.())}>
                    {quickReplyLibraryPanelMode === 'create' ? 'Guardar biblioteca' : 'Actualizar biblioteca'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelQuickReplyLibraryEdit}>Cancelar</button>
            </div>
        </div>
    ), [
        busy,
        canManageQuickReplies,
        cancelQuickReplyLibraryEdit,
        quickReplyLibraryForm,
        quickReplyLibraryPanelMode,
        runAction,
        saveQuickReplyLibrary,
        setQuickReplyLibraryForm,
        toggleModuleInQuickReplyLibraryForm,
        waModules
    ]);

    const renderItemForm = React.useCallback(() => (
        <div className="saas-admin-related-block">
            <h4>{quickReplyItemPanelMode === 'create' ? 'Nueva respuesta' : 'Editar respuesta'}</h4>
            <div className="saas-admin-form-row">
                <input value={quickReplyItemForm.label || ''} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, label: event.target.value }))} placeholder="Etiqueta de respuesta" disabled={busy || uploadingQuickReplyAssets} />
            </div>
            <textarea value={quickReplyItemForm.text || ''} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, text: event.target.value }))} rows={5} placeholder="Texto rapido" disabled={busy || uploadingQuickReplyAssets} />
            <div className="saas-admin-form-row">
                <input value={quickReplyItemForm.mediaUrl || ''} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, mediaUrl: event.target.value, mediaMimeType: prev.mediaMimeType || '' }))} placeholder="URL principal (opcional)" disabled={busy || uploadingQuickReplyAssets} />
                <label className={`saas-admin-dropzone ${busy || uploadingQuickReplyAssets ? 'is-disabled' : ''}`.trim()} style={{ minHeight: 'auto', padding: '10px 12px' }}>
                    <input
                        type="file"
                        multiple
                        accept={QUICK_REPLY_ACCEPT_VALUE}
                        disabled={busy || uploadingQuickReplyAssets}
                        onChange={async (event) => {
                            const files = Array.from(event.target.files || []);
                            event.target.value = '';
                            if (files.length === 0) return;
                            try {
                                await handleQuickReplyAssetSelection?.(files);
                            } catch (uploadError) {
                                setError?.(String(uploadError?.message || uploadError || 'No se pudo subir adjunto de respuesta rapida.'));
                            }
                        }}
                    />
                    <strong>{uploadingQuickReplyAssets ? 'Subiendo adjuntos...' : 'Subir adjuntos'}</strong>
                    <small>{QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL} | max {quickReplyUploadMaxMb} MB | cuota {quickReplyStorageQuotaMb} MB</small>
                </label>
            </div>
            {quickReplyItemFormAssets.length > 0 ? (
                <div className="saas-admin-related-block">
                    <h4>Adjuntos ({quickReplyItemFormAssets.length})</h4>
                    <div className="saas-admin-related-list">
                        {quickReplyItemFormAssets.map((asset, assetIdx) => {
                            const fileLabel = getQuickReplyAssetDisplayName(asset, assetIdx);
                            return (
                                <div key={`qr_item_asset_edit_${assetIdx}`} className="saas-admin-related-row" role="status">
                                    <span>{fileLabel}</span>
                                    <small>{asset.mimeType || 'archivo'}{asset.sizeBytes ? ` | ${formatBytes(asset.sizeBytes)}` : ''}</small>
                                    <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => removeQuickReplyAssetAt?.(assetIdx)}>Quitar</button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}
            <label className="saas-admin-module-toggle">
                <input type="checkbox" checked={quickReplyItemForm.isActive !== false} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy || uploadingQuickReplyAssets} />
                <span>Respuesta activa</span>
            </label>
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button
                    type="button"
                    disabled={busy || uploadingQuickReplyAssets || !canManageQuickReplies || !text(quickReplyItemForm.label) || (!text(quickReplyItemForm.text) && quickReplyItemFormAssets.length === 0 && !text(quickReplyItemForm.mediaUrl))}
                    onClick={() => runAction?.(quickReplyItemPanelMode === 'create' ? 'Respuesta rapida creada' : 'Respuesta rapida actualizada', async () => saveQuickReplyItem?.())}
                >
                    {quickReplyItemPanelMode === 'create' ? 'Guardar respuesta' : 'Actualizar respuesta'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy || uploadingQuickReplyAssets} onClick={cancelQuickReplyItemEdit}>Cancelar</button>
            </div>
        </div>
    ), [
        QUICK_REPLY_ACCEPT_VALUE,
        QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
        busy,
        canManageQuickReplies,
        cancelQuickReplyItemEdit,
        formatBytes,
        getQuickReplyAssetDisplayName,
        handleQuickReplyAssetSelection,
        quickReplyItemForm,
        quickReplyItemFormAssets,
        quickReplyItemPanelMode,
        quickReplyStorageQuotaMb,
        quickReplyUploadMaxMb,
        removeQuickReplyAssetAt,
        runAction,
        saveQuickReplyItem,
        setError,
        setQuickReplyItemForm,
        uploadingQuickReplyAssets
    ]);

    const renderDetail = React.useCallback(() => {
        if (!settingsTenantId) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona una empresa</h4>
                    <p>Elige una empresa para administrar bibliotecas y respuestas rapidas.</p>
                </div>
            );
        }
        if (isLibraryEditing) return renderLibraryForm();
        if (!selectedQuickReplyLibrary) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona una biblioteca</h4>
                    <p>Elige una biblioteca para ver y editar todas sus plantillas.</p>
                </div>
            );
        }
        return (
            <>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedQuickReplyLibrary.libraryId}</strong></div>
                    <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedQuickReplyLibrary.name || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Alcance</span><strong>{selectedQuickReplyLibrary.isShared ? 'Compartida' : 'Por modulo'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedQuickReplyLibrary.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Respuestas</h4>
                    <div className="saas-admin-related-list">
                        {visibleQuickReplyItemsForSelectedLibrary.length === 0 ? <div className="saas-admin-empty-inline">Sin respuestas registradas.</div> : null}
                        {visibleQuickReplyItemsForSelectedLibrary.map((item) => (
                            <button
                                key={`qr_item_${item.itemId}`}
                                type="button"
                                className={`saas-admin-related-row ${selectedQuickReplyItem?.itemId === item.itemId && quickReplyItemPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                onClick={() => {
                                    setSelectedQuickReplyItemId?.(text(item.itemId).toUpperCase());
                                    setQuickReplyItemPanelMode?.('view');
                                }}
                            >
                                <span>{item.label || item.itemId}</span>
                                <small>{item.isActive === false ? 'Inactiva' : 'Activa'} | {item.text || 'Solo adjuntos'}</small>
                            </button>
                        ))}
                    </div>
                </div>
                {selectedQuickReplyItem && quickReplyItemPanelMode === 'view' ? (
                    <div className="saas-admin-related-block">
                        <div className="saas-admin-list-actions saas-admin-list-actions--row">
                            <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemEdit}>Editar respuesta</button>
                            <button type="button" disabled={busy || !canManageQuickReplies} onClick={() => runAction?.('Respuesta rapida desactivada', async () => deactivateQuickReplyItem?.(selectedQuickReplyItem?.itemId))}>Desactivar</button>
                        </div>
                        <div className="saas-admin-detail-grid">
                            <div className="saas-admin-detail-field"><span>Etiqueta</span><strong>{selectedQuickReplyItem.label || '-'}</strong></div>
                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedQuickReplyItem.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                            <div className="saas-admin-detail-field"><span>Adjuntos</span><strong>{selectedQuickReplyItemMediaAssets.length}</strong></div>
                            <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedQuickReplyItem.updatedAt)}</strong></div>
                        </div>
                        <div className="saas-admin-related-row" role="status" style={{ alignItems: 'flex-start' }}>
                            <span>Texto</span>
                            <small style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{selectedQuickReplyItem.text || 'Sin texto. Solo adjuntos.'}</small>
                        </div>
                        {selectedQuickReplyItemMediaAssets.length > 0 ? (
                            <div className="saas-admin-related-list">
                                {selectedQuickReplyItemMediaAssets.map((asset, idx) => {
                                    const previewUrl = resolveQuickReplyAssetPreviewUrl(asset?.url || '');
                                    const fileLabel = getQuickReplyAssetDisplayName(asset, idx);
                                    return (
                                        <div key={`qr_item_asset_view_${idx}`} className="saas-admin-related-row" role="status">
                                            <span>{fileLabel}</span>
                                            <small>
                                                <a href={previewUrl || '#'} target="_blank" rel="noreferrer">Abrir</a>
                                                {' | '}{getQuickReplyAssetTypeLabel(asset)}
                                                {isQuickReplyImageAsset(asset) ? ' | imagen' : ''}
                                            </small>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {isItemEditing ? renderItemForm() : null}
            </>
        );
    }, [
        busy,
        canManageQuickReplies,
        deactivateQuickReplyItem,
        deactivateQuickReplyLibrary,
        formatDateTimeLabel,
        getQuickReplyAssetDisplayName,
        getQuickReplyAssetTypeLabel,
        isItemEditing,
        isLibraryEditing,
        isQuickReplyImageAsset,
        openQuickReplyItemCreate,
        openQuickReplyItemEdit,
        openQuickReplyLibraryEdit,
        quickReplyItemPanelMode,
        renderItemForm,
        renderLibraryForm,
        resolveQuickReplyAssetPreviewUrl,
        runAction,
        selectedQuickReplyItem,
        selectedQuickReplyItemMediaAssets,
        selectedQuickReplyLibrary,
        setQuickReplyItemPanelMode,
        setSelectedQuickReplyItemId,
        settingsTenantId,
        visibleQuickReplyItemsForSelectedLibrary
    ]);

    const detailActions = React.useMemo(() => {
        if (!selectedQuickReplyLibrary || isLibraryEditing || isItemEditing) return null;
        return (
            <>
                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyLibraryEdit}>Editar biblioteca</button>
                <button type="button" disabled={busy || !canManageQuickReplies} onClick={() => runAction?.('Biblioteca desactivada', async () => deactivateQuickReplyLibrary?.(selectedQuickReplyLibrary?.libraryId))}>Desactivar</button>
                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemCreate}>Nueva respuesta</button>
            </>
        );
    }, [
        busy,
        canManageQuickReplies,
        deactivateQuickReplyLibrary,
        isItemEditing,
        isLibraryEditing,
        openQuickReplyItemCreate,
        openQuickReplyLibraryEdit,
        runAction,
        selectedQuickReplyLibrary
    ]);

    return (
        <SaasEntityPage
            id="saas_quick_replies"
            sectionKey="saas_quick_replies"
            title="Respuestas rapidas"
            rows={rows}
            columns={columns}
            selectedId={selectedId}
            onSelect={(row) => selectLibrary(row?.id)}
            onClose={close}
            renderDetail={renderDetail}
            renderForm={renderDetail}
            mode={isLibraryEditing || isItemEditing ? 'form' : 'detail'}
            dirty={isLibraryEditing || isItemEditing}
            requestJson={context.requestJson}
            loading={loadingQuickReplies}
            emptyText={settingsTenantId ? 'Sin bibliotecas registradas.' : 'Selecciona una empresa para gestionar respuestas rapidas.'}
            searchPlaceholder="Buscar biblioteca por nombre, codigo, alcance o estado"
            filters={filters}
            extra={settingsTenantId ? (
                <select
                    value={quickReplyModuleFilterId}
                    onChange={(event) => {
                        const nextModuleId = text(event.target.value).toLowerCase();
                        setQuickReplyModuleFilterId?.(nextModuleId);
                        setSelectedQuickReplyLibraryId?.('');
                        setSelectedQuickReplyItemId?.('');
                        setQuickReplyLibraryPanelMode?.('view');
                        setQuickReplyItemPanelMode?.('view');
                    }}
                    disabled={loadingQuickReplies}
                >
                    <option value="">Todos los modulos</option>
                    {waModules.map((moduleItem) => {
                        const moduleId = text(moduleItem?.moduleId).toLowerCase();
                        return <option key={`qr_scope_${moduleId}`} value={moduleId}>{moduleItem?.name || moduleId}</option>;
                    })}
                </select>
            ) : null}
            actions={[
                {
                    label: 'Recargar',
                    onClick: () => settingsTenantId && loadQuickReplyData?.(settingsTenantId).catch((err) => setError?.(String(err?.message || err || 'No se pudo recargar respuestas rapidas.'))),
                    disabled: busy || loadingQuickReplies || !settingsTenantId
                },
                {
                    label: 'Nueva biblioteca',
                    onClick: openQuickReplyLibraryCreate,
                    disabled: busy || !canManageQuickReplies || !settingsTenantId
                }
            ]}
            detailTitle={quickReplyLibraryPanelMode === 'create' ? 'Nueva biblioteca' : (selectedQuickReplyLibrary?.name || 'Biblioteca de respuestas')}
            detailSubtitle={quickReplyLibraryPanelMode === 'create' ? 'Define tipo, alcance y modulos asignados.' : (selectedQuickReplyLibrary?.libraryId || '')}
            detailActions={detailActions}
        />
    );
}
