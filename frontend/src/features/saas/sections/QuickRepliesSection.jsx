import React from 'react';
import { SaasEntityPage } from '../components/layout';

const text = (value) => String(value ?? '').trim();

function renderWhatsAppFormattedText(value) {
    const raw = String(value || '');
    if (!raw) return <span className="saas-quick-reply-preview-muted">El texto aparecera aqui...</span>;
    const tokenRegex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
    return raw.split('\n').map((line, lineIndex) => {
        const parts = [];
        let lastIndex = 0;
        line.replace(tokenRegex, (match, _token, offset) => {
            if (offset > lastIndex) parts.push(line.slice(lastIndex, offset));
            const content = match.slice(1, -1);
            const key = `qr_fmt_${lineIndex}_${offset}`;
            if (match.startsWith('*')) parts.push(<strong key={key}>{content}</strong>);
            else if (match.startsWith('_')) parts.push(<em key={key}>{content}</em>);
            else if (match.startsWith('~')) parts.push(<del key={key}>{content}</del>);
            else parts.push(<code key={key}>{content}</code>);
            lastIndex = offset + match.length;
            return match;
        });
        if (lastIndex < line.length) parts.push(line.slice(lastIndex));
        return (
            <React.Fragment key={`qr_fmt_line_${lineIndex}`}>
                {parts.length > 0 ? parts : ' '}
                {lineIndex < raw.split('\n').length - 1 ? <br /> : null}
            </React.Fragment>
        );
    });
}

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
    const quickReplyTextRef = React.useRef(null);
    const selectedId = quickReplyLibraryPanelMode === 'create'
        ? '__create_quick_reply_library__'
        : text(selectedQuickReplyLibrary?.libraryId);

    const rows = React.useMemo(() => visibleQuickReplyLibraries.map((library) => ({
        id: text(library?.libraryId).toUpperCase(),
        name: library?.name || library?.libraryId || '-',
        textPreview: library?.description || '-',
        sortOrder: String(library?.sortOrder ?? '-'),
        scope: library?.isShared ? 'Compartida' : 'Por módulo',
        status: library?.isActive === false ? 'Inactiva' : 'Activa',
        modules: Array.isArray(library?.moduleIds) ? String(library.moduleIds.length) : '0',
        updatedAt: formatDateTimeLabel(library?.updatedAt),
        raw: library
    })), [formatDateTimeLabel, visibleQuickReplyLibraries]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Etiqueta', width: '24%', sortable: true },
        { key: 'textPreview', label: 'Texto', width: '30%', sortable: true, hidden: true },
        { key: 'sortOrder', label: 'Orden', width: '12%', sortable: true, hidden: true },
        { key: 'updatedAt', label: 'Actualizado', width: '18%', sortable: true, hidden: true },
        { key: 'scope', label: 'Alcance', width: '18%', sortable: true, hidden: true },
        { key: 'modules', label: 'Módulos', width: '14%', sortable: true, hidden: true },
        { key: 'status', label: 'Estado', width: '16%', sortable: true },
        { key: 'id', label: 'Código', width: '20%', sortable: true, hidden: true }
    ], []);

    const filters = React.useMemo(() => [
        {
            key: 'scope',
            label: 'Alcance',
            type: 'select',
            options: [
                { value: 'Compartida', label: 'Compartida' },
                { value: 'Por módulo', label: 'Por módulo' }
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

    const renderLibraryForm = React.useCallback(({ close: requestClose } = {}) => (
        <div className="saas-admin-related-block">
            <div className="saas-admin-form-row">
                <input value={quickReplyLibraryForm.name || ''} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre de biblioteca" disabled={busy} />
                <input value={quickReplyLibraryForm.description || ''} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, description: event.target.value }))} placeholder="descripción" disabled={busy} />
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
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void requestClose?.(); }}>Cancelar</button>
            </div>
        </div>
    ), [
        busy,
        canManageQuickReplies,
        quickReplyLibraryForm,
        quickReplyLibraryPanelMode,
        runAction,
        saveQuickReplyLibrary,
        setQuickReplyLibraryForm,
        toggleModuleInQuickReplyLibraryForm,
        waModules
    ]);

    const quickReplyFormButtons = React.useMemo(() => {
        const source = Array.isArray(quickReplyItemForm.buttons) ? quickReplyItemForm.buttons : [];
        return source
            .map((button, index) => ({
                id: text(button?.id) || `btn_${index + 1}`,
                title: text(button?.title || button?.label || button?.text).slice(0, 20)
            }))
            .slice(0, 3);
    }, [quickReplyItemForm.buttons]);

    const setQuickReplyButtons = React.useCallback((updater) => {
        setQuickReplyItemForm?.((prev) => {
            const current = Array.isArray(prev.buttons) ? prev.buttons : [];
            const next = typeof updater === 'function' ? updater(current) : updater;
            return {
                ...prev,
                buttons: (Array.isArray(next) ? next : [])
                    .map((button, index) => ({
                        id: text(button?.id) || `btn_${index + 1}`,
                        title: text(button?.title || button?.label || button?.text).slice(0, 20)
                    }))
                    .slice(0, 3)
            };
        });
    }, [setQuickReplyItemForm]);

    const addQuickReplyButton = React.useCallback(() => {
        setQuickReplyButtons((current) => {
            if (current.length >= 3) return current;
            return [...current, { id: `btn_${current.length + 1}`, title: '' }];
        });
    }, [setQuickReplyButtons]);

    const updateQuickReplyButtonTitle = React.useCallback((buttonIndex, title) => {
        setQuickReplyItemForm?.((prev) => {
            const current = Array.isArray(prev.buttons) ? prev.buttons : [];
            const next = current.map((button, index) => ({
                id: text(button?.id) || `btn_${index + 1}`,
                title: index === buttonIndex ? String(title || '').slice(0, 20) : text(button?.title || button?.label || button?.text).slice(0, 20)
            }));
            return { ...prev, buttons: next.slice(0, 3) };
        });
    }, [setQuickReplyItemForm]);

    const removeQuickReplyButton = React.useCallback((buttonIndex) => {
        setQuickReplyButtons((current) => current
            .filter((_, index) => index !== buttonIndex)
            .map((button, index) => ({ ...button, id: `btn_${index + 1}` })));
    }, [setQuickReplyButtons]);

    const wrapQuickReplySelection = React.useCallback((prefix, suffix = prefix) => {
        const markerStart = String(prefix || '');
        const markerEnd = String(suffix || markerStart);
        const input = quickReplyTextRef.current;
        const currentText = String(quickReplyItemForm.text || '');
        const start = Number(input?.selectionStart ?? currentText.length);
        const end = Number(input?.selectionEnd ?? currentText.length);
        const selectedText = currentText.slice(start, end);
        const nextText = `${currentText.slice(0, start)}${markerStart}${selectedText}${markerEnd}${currentText.slice(end)}`;
        setQuickReplyItemForm?.((prev) => ({ ...prev, text: nextText }));
        window.requestAnimationFrame?.(() => {
            const nextInput = quickReplyTextRef.current;
            if (!nextInput) return;
            nextInput.focus();
            const cursorStart = selectedText ? start : start + markerStart.length;
            const cursorEnd = selectedText ? end + markerStart.length + markerEnd.length : cursorStart;
            nextInput.setSelectionRange(cursorStart, cursorEnd);
        });
    }, [quickReplyItemForm.text, setQuickReplyItemForm]);

    const renderItemForm = React.useCallback(({ close: requestClose } = {}) => (
        <div className="saas-admin-related-block">
            <h4>{quickReplyItemPanelMode === 'create' ? 'Nueva respuesta' : 'Editar respuesta'}</h4>
            <div className="saas-quick-reply-editor-layout">
                <div className="saas-quick-reply-editor-main">
                    <div className="saas-admin-form-row">
                        <input value={quickReplyItemForm.label || ''} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, label: event.target.value }))} placeholder="Etiqueta de respuesta" disabled={busy || uploadingQuickReplyAssets} />
                    </div>
                    <textarea ref={quickReplyTextRef} value={quickReplyItemForm.text || ''} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, text: event.target.value }))} rows={5} placeholder="Texto rapido" disabled={busy || uploadingQuickReplyAssets} />
                    <div className="saas-quick-reply-format-toolbar" aria-label="Formato WhatsApp">
                        <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => wrapQuickReplySelection('*')}><strong>B</strong></button>
                        <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => wrapQuickReplySelection('_')}><em>I</em></button>
                        <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => wrapQuickReplySelection('~')}><del>S</del></button>
                        <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => wrapQuickReplySelection('`')}><code>M</code></button>
                    </div>
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
                            <small>JPEG o PNG recomendado para WhatsApp. Max 50 MB.</small>
                        </label>
                    </div>
                    <div className="saas-quick-reply-buttons-block">
                        <div className="saas-quick-reply-buttons-header">
                            <span>Botones de respuesta (max 3)</span>
                            <button type="button" disabled={busy || uploadingQuickReplyAssets || quickReplyFormButtons.length >= 3} onClick={addQuickReplyButton}>+ Agregar boton</button>
                        </div>
                        {quickReplyFormButtons.length === 0 ? (
                            <small className="saas-quick-reply-preview-muted">Sin botones. Se enviara como respuesta rapida normal.</small>
                        ) : null}
                        {quickReplyFormButtons.map((button, buttonIndex) => (
                            <div key={`qr_button_edit_${button.id}_${buttonIndex}`} className="saas-quick-reply-button-row">
                                <input
                                    value={button.title}
                                    maxLength={20}
                                    placeholder={`Boton ${buttonIndex + 1}`}
                                    disabled={busy || uploadingQuickReplyAssets}
                                    onChange={(event) => updateQuickReplyButtonTitle(buttonIndex, event.target.value)}
                                />
                                <small>{button.title.length}/20</small>
                                <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => removeQuickReplyButton(buttonIndex)}>Eliminar</button>
                            </div>
                        ))}
                    </div>
                </div>
                <aside className="saas-quick-reply-preview" aria-label="Preview WhatsApp">
                    <h5>Preview WhatsApp</h5>
                    <div className="saas-quick-reply-preview-phone">
                        <div className="saas-quick-reply-preview-bubble">
                            {(quickReplyItemFormAssets.length > 0 || text(quickReplyItemForm.mediaUrl)) ? (
                                <div className="saas-quick-reply-preview-image">Imagen</div>
                            ) : null}
                            <div className="saas-quick-reply-preview-text">
                                {renderWhatsAppFormattedText(quickReplyItemForm.text)}
                            </div>
                        </div>
                        {quickReplyFormButtons.length > 0 ? (
                            <div className="saas-quick-reply-preview-buttons">
                                {quickReplyFormButtons.map((button, index) => (
                                    <button key={`qr_button_preview_${button.id}_${index}`} type="button" disabled>{button.title}</button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </aside>
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
                <button type="button" className="saas-btn-cancel" disabled={busy || uploadingQuickReplyAssets} onClick={() => { void requestClose?.(); }}>Cancelar</button>
            </div>
        </div>
    ), [
        QUICK_REPLY_ACCEPT_VALUE,
        addQuickReplyButton,
        QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
        busy,
        canManageQuickReplies,
        formatBytes,
        getQuickReplyAssetDisplayName,
        handleQuickReplyAssetSelection,
        quickReplyItemForm,
        quickReplyItemFormAssets,
        quickReplyItemPanelMode,
        quickReplyFormButtons,
        quickReplyStorageQuotaMb,
        quickReplyUploadMaxMb,
        removeQuickReplyAssetAt,
        removeQuickReplyButton,
        runAction,
        saveQuickReplyItem,
        setError,
        setQuickReplyItemForm,
        updateQuickReplyButtonTitle,
        uploadingQuickReplyAssets,
        wrapQuickReplySelection
    ]);

    const renderDetail = React.useCallback(() => {
        if (!settingsTenantId) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona una empresa</h4>
                    <p>Elige una empresa para administrar bibliotecas y respuestas rápidas.</p>
                </div>
            );
        }
        if (isLibraryEditing) return renderLibraryForm({ close });
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
                    <div className="saas-admin-detail-field"><span>CÓDIGO</span><strong>{selectedQuickReplyLibrary.libraryId}</strong></div>
                    <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedQuickReplyLibrary.name || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ALCANCE</span><strong>{selectedQuickReplyLibrary.isShared ? 'Compartida' : 'Por módulo'}</strong></div>
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
                            <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemEdit}>Editar</button>
                            <button type="button" disabled={busy || !canManageQuickReplies} onClick={() => runAction?.('Respuesta rápida desactivada', async () => deactivateQuickReplyItem?.(selectedQuickReplyItem?.itemId))}>Desactivar</button>
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
                {isItemEditing ? renderItemForm({ close }) : null}
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
                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyLibraryEdit}>Editar</button>
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
            title="RESPUESTAS RÁPIDAS"
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
            emptyText={settingsTenantId ? 'Sin bibliotecas registradas.' : 'Selecciona una empresa para gestionar respuestas rápidas.'}
            searchPlaceholder="Buscar biblioteca por nombre, código, alcance o estado..."
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
                    <option value="">Todos los módulos</option>
                    {waModules.map((moduleItem) => {
                        const moduleId = text(moduleItem?.moduleId).toLowerCase();
                        return <option key={`qr_scope_${moduleId}`} value={moduleId}>{moduleItem?.name || moduleId}</option>;
                    })}
                </select>
            ) : null}
            actions={[
                {
                    label: 'Recargar',
                    onClick: () => settingsTenantId && loadQuickReplyData?.(settingsTenantId).catch((err) => setError?.(String(err?.message || err || 'No se pudo recargar respuestas rápidas.'))),
                    disabled: busy || loadingQuickReplies || !settingsTenantId
                },
                {
                    label: 'Nuevo',
                    onClick: openQuickReplyLibraryCreate,
                    disabled: busy || !canManageQuickReplies || !settingsTenantId
                }
            ]}
            detailTitle={quickReplyLibraryPanelMode === 'create' ? 'Nueva biblioteca' : (selectedQuickReplyLibrary?.name || 'Biblioteca de respuestas')}
            detailSubtitle={quickReplyLibraryPanelMode === 'create' ? 'Define tipo, alcance y módulos asignados.' : (selectedQuickReplyLibrary?.libraryId || '')}
            detailActions={detailActions}
        />
    );
}
