import React from 'react';

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
    waModules,
    quickReplyLibrarySearch,
    setQuickReplyLibrarySearch,
    visibleQuickReplyLibraries,
    selectedQuickReplyLibrary,
    quickReplyLibraryPanelMode,
    openQuickReplyLibraryEdit,
    runAction,
    deactivateQuickReplyLibrary,
    quickReplyLibraryForm,
    setQuickReplyLibraryForm,
    toggleModuleInQuickReplyLibraryForm,
    saveQuickReplyLibrary,
    cancelQuickReplyLibraryEdit,
    QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
    visibleQuickReplyItemsForSelectedLibrary,
    quickReplyUploadMaxMb,
    quickReplyStorageQuotaMb,
    quickReplyItemSearch,
    setQuickReplyItemSearch,
    normalizeQuickReplyMediaAssets,
    selectedQuickReplyItem,
    quickReplyItemPanelMode,
    openQuickReplyItemEdit,
    deactivateQuickReplyItem,
    selectedQuickReplyItemMediaAssets,
    formatDateTimeLabel,
    resolveQuickReplyAssetPreviewUrl,
    getQuickReplyAssetDisplayName,
    isQuickReplyImageAsset,
    getQuickReplyAssetTypeLabel,
    formatBytes,
    quickReplyItemForm,
    setQuickReplyItemForm,
    uploadingQuickReplyAssets,
    QUICK_REPLY_ACCEPT_VALUE,
    handleQuickReplyAssetSelection,
    quickReplyItemFormAssets,
    removeQuickReplyAssetAt,
    saveQuickReplyItem,
    cancelQuickReplyItemEdit,
    openQuickReplyItemCreate
    } = context;

    React.useEffect(() => {
        const handleEscape = (event) => {
            if (event.key !== 'Escape') return;
            if (quickReplyItemPanelMode === 'create' || quickReplyItemPanelMode === 'edit') {
                cancelQuickReplyItemEdit?.();
                return;
            }
            if (quickReplyLibraryPanelMode === 'create' || quickReplyLibraryPanelMode === 'edit') {
                cancelQuickReplyLibraryEdit?.();
                return;
            }
            setSelectedQuickReplyItemId?.('');
            setSelectedQuickReplyLibraryId?.('');
            setQuickReplyItemPanelMode?.('view');
            setQuickReplyLibraryPanelMode?.('view');
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [
        cancelQuickReplyItemEdit,
        cancelQuickReplyLibraryEdit,
        quickReplyItemPanelMode,
        quickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryPanelMode,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId
    ]);

    return (
                    <section id="saas_quick_replies" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail saas-admin-master-detail--td-pattern">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Respuestas rapidas</h3>
                                        <small>Gestiona bibliotecas y plantillas reutilizables por empresa/modulo.</small>
                                    </div>
                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                        <button
                                            type="button"
                                            disabled={busy || loadingQuickReplies || !settingsTenantId}
                                            onClick={() => settingsTenantId && loadQuickReplyData(settingsTenantId).catch((err) => setError(String(err?.message || err || 'No se pudo recargar respuestas rapidas.')))}
                                        >
                                            Recargar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || !canManageQuickReplies || !settingsTenantId}
                                            onClick={openQuickReplyLibraryCreate}
                                        >
                                            Nueva biblioteca
                                        </button>
                                    </div>
                                </div>

                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Primero elige una empresa para gestionar respuestas rapidas.</p>
                                    </div>
                                )}

                                {settingsTenantId && (
                                    <>
                                        <div className="saas-admin-form-row">
                                            <select
                                                value={quickReplyModuleFilterId}
                                                onChange={(event) => {
                                                    const nextModuleId = String(event.target.value || '').trim().toLowerCase();
                                                    setQuickReplyModuleFilterId(nextModuleId);
                                                    setSelectedQuickReplyLibraryId('');
                                                    setSelectedQuickReplyItemId('');
                                                    setQuickReplyLibraryPanelMode('view');
                                                    setQuickReplyItemPanelMode('view');
                                                }}
                                                disabled={loadingQuickReplies}
                                            >
                                                <option value="">Todas las bibliotecas (sin filtro de modulo)</option>
                                                {waModules.map((moduleItem) => {
                                                    const moduleId = String(moduleItem?.moduleId || '').trim().toLowerCase();
                                                    return (
                                                        <option key={`qr_scope_${moduleId}`} value={moduleId}>
                                                            {moduleItem?.name || moduleId}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                        <div className="saas-admin-form-row">
                                            <input
                                                value={quickReplyLibrarySearch}
                                                onChange={(event) => setQuickReplyLibrarySearch(event.target.value)}
                                                placeholder="Filtrar bibliotecas por nombre, codigo o descripcion"
                                                disabled={loadingQuickReplies}
                                            />
                                        </div>

                                        <div className="saas-admin-list saas-admin-list--compact">
                                            {visibleQuickReplyLibraries.length === 0 && (
                                                <div className="saas-admin-empty-state">
                                                    <h4>Sin bibliotecas</h4>
                                                    <p>Crea una biblioteca para empezar.</p>
                                                </div>
                                            )}
                                            {visibleQuickReplyLibraries.map((library) => (
                                                <button
                                                    key={`qr_library_list_${library.libraryId}`}
                                                    type="button"
                                                    className={`saas-admin-list-item saas-admin-list-item--button ${selectedQuickReplyLibrary?.libraryId === library.libraryId ? 'active' : ''}`.trim()}
                                                    onClick={() => {
                                                        setSelectedQuickReplyLibraryId(String(library.libraryId || '').trim().toUpperCase());
                                                        setSelectedQuickReplyItemId('');
                                                        setQuickReplyLibraryPanelMode('view');
                                                        setQuickReplyItemPanelMode('view');
                                                    }}
                                                >
                                                    <strong>{library.name || library.libraryId}</strong>
                                                    <small>{library.libraryId}</small>
                                                    <small>{library.isShared ? 'Compartida' : 'Asignada por modulo'} | {library.isActive === false ? 'inactiva' : 'activa'}</small>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Elige una empresa para administrar bibliotecas y respuestas rapidas.</p>
                                    </div>
                                )}
                                {settingsTenantId && !selectedQuickReplyLibrary && quickReplyLibraryPanelMode === 'view' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una biblioteca</h4>
                                        <p>Elige una biblioteca para ver y editar todas sus plantillas.</p>
                                    </div>
                                )}
                                {settingsTenantId && (selectedQuickReplyLibrary || quickReplyLibraryPanelMode === 'create') && (
                                    <div className="saas-admin-related-block" style={{ marginTop: '10px' }}>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h4>{quickReplyLibraryPanelMode === 'create' ? 'Nueva biblioteca' : (selectedQuickReplyLibrary?.name || selectedQuickReplyLibrary?.libraryId || 'Biblioteca de respuestas')}</h4>
                                                <small>{quickReplyLibraryPanelMode === 'create' ? 'Define tipo, alcance y modulos asignados' : (selectedQuickReplyLibrary?.libraryId || 'Biblioteca de respuestas')}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                {quickReplyLibraryPanelMode === 'view' && (
                                                    <>
                                                        <button type="button" disabled={busy || !canManageQuickReplies || !selectedQuickReplyLibrary} onClick={openQuickReplyLibraryEdit}>Editar biblioteca</button>
                                                        <button
                                                            type="button"
                                                            disabled={busy || !canManageQuickReplies || !selectedQuickReplyLibrary}
                                                            onClick={() => runAction('Biblioteca desactivada', async () => {
                                                                await deactivateQuickReplyLibrary(selectedQuickReplyLibrary?.libraryId);
                                                            })}
                                                        >
                                                            Desactivar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {(quickReplyLibraryPanelMode === 'create' || quickReplyLibraryPanelMode === 'edit') && (
                                            <div className="saas-admin-related-block" style={{ marginBottom: '10px' }}>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={quickReplyLibraryForm.name}
                                                        onChange={(event) => setQuickReplyLibraryForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre de biblioteca"
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        value={quickReplyLibraryForm.description}
                                                        onChange={(event) => setQuickReplyLibraryForm((prev) => ({ ...prev, description: event.target.value }))}
                                                        placeholder="Descripcion (opcional)"
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-modules">
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={quickReplyLibraryForm.isShared === true}
                                                            onChange={(event) => setQuickReplyLibraryForm((prev) => ({ ...prev, isShared: event.target.checked }))}
                                                            disabled={busy}
                                                        />
                                                        <span>Biblioteca compartida</span>
                                                    </label>
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={quickReplyLibraryForm.isActive !== false}
                                                            onChange={(event) => setQuickReplyLibraryForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                            disabled={busy}
                                                        />
                                                        <span>Biblioteca activa</span>
                                                    </label>
                                                </div>

                                                {!quickReplyLibraryForm.isShared && (
                                                    <div className="saas-admin-modules">
                                                        {waModules.map((moduleItem) => {
                                                            const moduleId = String(moduleItem?.moduleId || '').trim().toLowerCase();
                                                            const checked = Array.isArray(quickReplyLibraryForm.moduleIds) && quickReplyLibraryForm.moduleIds.includes(moduleId);
                                                            return (
                                                                <label key={
                                                                    'qr_library_module_' + moduleId
                                                                } className="saas-admin-module-toggle">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleModuleInQuickReplyLibraryForm(moduleId)}
                                                                        disabled={busy}
                                                                    />
                                                                    <span>{moduleItem?.name || moduleId}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={busy || !canManageQuickReplies || !String(quickReplyLibraryForm.name || '').trim()}
                                                        onClick={() => runAction(
                                                            quickReplyLibraryPanelMode === 'create' ? 'Biblioteca creada' : 'Biblioteca actualizada',
                                                            async () => { await saveQuickReplyLibrary(); }
                                                        )}
                                                    >
                                                        {quickReplyLibraryPanelMode === 'create' ? 'Guardar biblioteca' : 'Actualizar biblioteca'}
                                                    </button>
                                                    <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelQuickReplyLibraryEdit}>Cancelar</button>
                                                </div>
                                            </div>
                                        )}


                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h4>Plantillas</h4>
                                                <small>Listado completo editable. Usa texto y/o adjuntos ({QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}).</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemCreate}>Nueva respuesta</button>
                                            </div>
                                        </div>

                                        <div className="saas-admin-detail-grid" style={{ marginBottom: '10px' }}>
                                            <div className="saas-admin-detail-field"><span>Biblioteca</span><strong>{selectedQuickReplyLibrary?.name || selectedQuickReplyLibrary?.libraryId || '-'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Plantillas visibles</span><strong>{visibleQuickReplyItemsForSelectedLibrary.length}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Max por archivo</span><strong>{quickReplyUploadMaxMb} MB</strong></div>
                                            <div className="saas-admin-detail-field"><span>Cuota plan</span><strong>{quickReplyStorageQuotaMb} MB</strong></div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <input
                                                value={quickReplyItemSearch}
                                                onChange={(event) => setQuickReplyItemSearch(event.target.value)}
                                                placeholder="Filtrar respuestas por etiqueta, contenido o archivo"
                                                disabled={loadingQuickReplies}
                                            />
                                        </div>

                                        <div className="saas-admin-catalog-products-layout">
                                            <div className="saas-admin-catalog-products-list">
                                                {visibleQuickReplyItemsForSelectedLibrary.length === 0 && (
                                                    <div className="saas-admin-empty-state">
                                                        <h4>Sin plantillas</h4>
                                                        <p>Crea tu primera respuesta rapida para esta biblioteca.</p>
                                                    </div>
                                                )}
                                                {visibleQuickReplyItemsForSelectedLibrary.map((item) => {
                                                    const itemAssets = normalizeQuickReplyMediaAssets(item?.mediaAssets, {
                                                        url: item?.mediaUrl || '',
                                                        mimeType: item?.mediaMimeType || '',
                                                        fileName: item?.mediaFileName || '',
                                                        sizeBytes: item?.mediaSizeBytes
                                                    });
                                                    return (
                                                        <button
                                                            key={`qr_item_row_${item.itemId}`}
                                                            type="button"
                                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedQuickReplyItem?.itemId === item.itemId ? 'active' : ''}`.trim()}
                                                            onClick={() => {
                                                                setSelectedQuickReplyItemId(String(item?.itemId || '').trim().toUpperCase());
                                                                setQuickReplyItemPanelMode('view');
                                                            }}
                                                        >
                                                            <strong>{item.label || item.itemId}</strong>
                                                            <small>{String(item.text || '').trim().slice(0, 96) || 'Solo adjuntos'}</small>
                                                            <small>{itemAssets.length} adjunto(s) | {item.isActive === false ? 'inactiva' : 'activa'}</small>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <div className="saas-admin-catalog-product-detail">
                                                {!selectedQuickReplyItem && quickReplyItemPanelMode === 'view' && (
                                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                                        <h4>Selecciona una plantilla</h4>
                                                        <p>Haz clic en una fila para ver detalle y editar.</p>
                                                    </div>
                                                )}

                                                {selectedQuickReplyItem && quickReplyItemPanelMode === 'view' && (
                                                    <>
                                                        <div className="saas-admin-pane-header">
                                                            <div>
                                                                <h4>{selectedQuickReplyItem.label || selectedQuickReplyItem.itemId}</h4>
                                                                <small>{selectedQuickReplyItem.itemId}</small>
                                                            </div>
                                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemEdit}>Editar respuesta</button>
                                                                <button
                                                                    type="button"
                                                                    disabled={busy || !canManageQuickReplies}
                                                                    onClick={() => runAction('Respuesta rapida desactivada', async () => {
                                                                        await deactivateQuickReplyItem(selectedQuickReplyItem?.itemId);
                                                                    })}
                                                                >
                                                                    Desactivar
                                                                </button>
                                                            </div>
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

                                                        {selectedQuickReplyItemMediaAssets.length > 0 && (
                                                            <div className="saas-admin-related-block">
                                                                <h4>Adjuntos</h4>
                                                                <div className="saas-admin-related-list">
                                                                    {selectedQuickReplyItemMediaAssets.map((asset, assetIdx) => {
                                                                        const previewUrl = resolveQuickReplyAssetPreviewUrl(asset?.url || '');
                                                                        const fileLabel = getQuickReplyAssetDisplayName(asset, assetIdx);
                                                                        const isImage = isQuickReplyImageAsset(asset);
                                                                        return (
                                                                            <div key={`qr_item_asset_view_${assetIdx}`} className="saas-admin-related-row" role="status" style={{ alignItems: 'flex-start' }}>
                                                                                {isImage ? (
                                                                                    <a href={previewUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', width: '68px', height: '68px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', marginRight: '10px', flexShrink: 0 }}>
                                                                                        <img src={previewUrl} alt={fileLabel} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                    </a>
                                                                                ) : (
                                                                                    <div style={{ width: '68px', height: '68px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.22)', marginRight: '10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#8fb6c9', fontWeight: 700, fontSize: '0.78rem' }}>
                                                                                        {String(getQuickReplyAssetTypeLabel(asset) || 'file').toUpperCase()}
                                                                                    </div>
                                                                                )}
                                                                                <div style={{ minWidth: 0, display: 'grid', gap: '2px' }}>
                                                                                    <span>{fileLabel}</span>
                                                                                    <small>
                                                                                        <a href={previewUrl || '#'} target="_blank" rel="noreferrer">Abrir</a>
                                                                                        {' | '}{asset.mimeType || 'archivo'}
                                                                                        {asset.sizeBytes ? ` | ${formatBytes(asset.sizeBytes)}` : ''}
                                                                                    </small>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                )}

                                                {(quickReplyItemPanelMode === 'create' || quickReplyItemPanelMode === 'edit') && (
                                                    <div className="saas-admin-related-block">
                                                        <div className="saas-admin-pane-header">
                                                            <div>
                                                                <h4>{quickReplyItemPanelMode === 'create' ? 'Nueva respuesta' : 'Editar respuesta'}</h4>
                                                                <small>Permite texto y multiples adjuntos.</small>
                                                            </div>
                                                        </div>

                                                        <div className="saas-admin-form-row">
                                                            <input
                                                                value={quickReplyItemForm.label}
                                                                onChange={(event) => setQuickReplyItemForm((prev) => ({ ...prev, label: event.target.value }))}
                                                                placeholder="Etiqueta de respuesta"
                                                                disabled={busy || uploadingQuickReplyAssets}
                                                            />
                                                        </div>
                                                        <textarea
                                                            value={quickReplyItemForm.text}
                                                            onChange={(event) => setQuickReplyItemForm((prev) => ({ ...prev, text: event.target.value }))}
                                                            rows={5}
                                                            placeholder="Texto rapido (puede quedar vacio si solo envias adjuntos)"
                                                            disabled={busy || uploadingQuickReplyAssets}
                                                        />

                                                        <div className="saas-admin-form-row">
                                                            <input
                                                                value={quickReplyItemForm.mediaUrl}
                                                                onChange={(event) => setQuickReplyItemForm((prev) => ({ ...prev, mediaUrl: event.target.value, mediaMimeType: prev.mediaMimeType || '' }))}
                                                                placeholder="URL principal (opcional, auto al subir)"
                                                                disabled={busy || uploadingQuickReplyAssets}
                                                            />
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
                                                                            await handleQuickReplyAssetSelection(files);
                                                                        } catch (uploadError) {
                                                                            setError(String(uploadError?.message || uploadError || 'No se pudo subir adjunto de respuesta rapida.'));
                                                                        }
                                                                    }}
                                                                />
                                                                <strong>{uploadingQuickReplyAssets ? 'Subiendo adjuntos...' : 'Subir adjuntos (multiple)'}</strong>
                                                                <small>{QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL} | max archivo {quickReplyUploadMaxMb} MB | cuota {quickReplyStorageQuotaMb} MB</small>
                                                            </label>
                                                        </div>

                                                        {quickReplyItemFormAssets.length > 0 && (
                                                            <div className="saas-admin-related-block">
                                                                <h4>Adjuntos de esta respuesta ({quickReplyItemFormAssets.length})</h4>
                                                                <div className="saas-admin-related-list">
                                                                    {quickReplyItemFormAssets.map((asset, assetIdx) => {
                                                                        const previewUrl = resolveQuickReplyAssetPreviewUrl(asset?.url || '');
                                                                        const fileLabel = getQuickReplyAssetDisplayName(asset, assetIdx);
                                                                        const isImage = isQuickReplyImageAsset(asset);
                                                                        return (
                                                                            <div key={`qr_item_asset_edit_${assetIdx}`} className="saas-admin-related-row" role="status" style={{ alignItems: 'flex-start' }}>
                                                                                {isImage ? (
                                                                                    <a href={previewUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', marginRight: '10px', flexShrink: 0 }}>
                                                                                        <img src={previewUrl} alt={fileLabel} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                    </a>
                                                                                ) : (
                                                                                    <div style={{ width: '64px', height: '64px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.22)', marginRight: '10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#8fb6c9', fontWeight: 700, fontSize: '0.75rem' }}>
                                                                                        {String(getQuickReplyAssetTypeLabel(asset) || 'file').toUpperCase()}
                                                                                    </div>
                                                                                )}
                                                                                <div style={{ minWidth: 0, display: 'grid', gap: '2px', flex: 1 }}>
                                                                                    <span>{fileLabel}</span>
                                                                                    <small>
                                                                                        {asset.mimeType || 'archivo'}
                                                                                        {asset.sizeBytes ? ` | ${formatBytes(asset.sizeBytes)}` : ''}
                                                                                    </small>
                                                                                    <div>
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={busy || uploadingQuickReplyAssets}
                                                                                            onClick={() => removeQuickReplyAssetAt(assetIdx)}
                                                                                        >
                                                                                            Quitar
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="saas-admin-modules">
                                                            <label className="saas-admin-module-toggle">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={quickReplyItemForm.isActive !== false}
                                                                    onChange={(event) => setQuickReplyItemForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                                    disabled={busy || uploadingQuickReplyAssets}
                                                                />
                                                                <span>Respuesta activa</span>
                                                            </label>
                                                        </div>

                                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                            <button
                                                                type="button"
                                                                disabled={busy || uploadingQuickReplyAssets || !canManageQuickReplies || !String(quickReplyItemForm.label || '').trim() || (!String(quickReplyItemForm.text || '').trim() && quickReplyItemFormAssets.length === 0 && !String(quickReplyItemForm.mediaUrl || '').trim())}
                                                                onClick={() => runAction(
                                                                    quickReplyItemPanelMode === 'create' ? 'Respuesta rapida creada' : 'Respuesta rapida actualizada',
                                                                    async () => { await saveQuickReplyItem(); }
                                                                )}
                                                            >
                                                                {quickReplyItemPanelMode === 'create' ? 'Guardar respuesta' : 'Actualizar respuesta'}
                                                            </button>
                                                            <button type="button" className="saas-btn-cancel" disabled={busy || uploadingQuickReplyAssets} onClick={cancelQuickReplyItemEdit}>Cancelar</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
        </section>
    );
}
