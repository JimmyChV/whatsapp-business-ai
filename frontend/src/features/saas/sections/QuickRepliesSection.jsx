import React from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import MessageSequenceComposer, {
    normalizeMessageBlocksForComposer
} from '../../chat/components/MessageSequenceComposer';
import { SaasEntityPage } from '../components/layout';

const text = (value) => String(value ?? '').trim();
const QUICK_REPLY_CATEGORIES = Object.freeze([
    { value: 'general', label: 'General' },
    { value: 'informacion', label: 'Informacion' },
    { value: 'catalogo', label: 'Catalogo' },
    { value: 'cierre', label: 'Cierre' },
    { value: 'escalado', label: 'Escalado' }
]);

function normalizeQuickReplyCategory(value = 'general') {
    const clean = text(value).toLowerCase();
    return QUICK_REPLY_CATEGORIES.some((entry) => entry.value === clean) ? clean : 'general';
}

function getQuickReplyCategoryLabel(value = 'general') {
    const clean = normalizeQuickReplyCategory(value);
    return QUICK_REPLY_CATEGORIES.find((entry) => entry.value === clean)?.label || 'General';
}

function getQuickReplyFormBlocks(form = {}) {
    return normalizeMessageBlocksForComposer(form.messageBlocks, {
        messageText: form.text || '',
        mediaAssets: form.mediaAssets || [],
        mediaUrl: form.mediaUrl || '',
        mediaMimeType: form.mediaMimeType || '',
        mediaFileName: form.mediaFileName || '',
        mediaSizeBytes: form.mediaSizeBytes
    });
}

function serializeMessageBlocksForSignature(blocks = []) {
    return (Array.isArray(blocks) ? blocks : [])
        .map((block) => {
            const type = text(block?.type || 'message').toLowerCase();
            if (type === 'delay') {
                return {
                    type,
                    delaySeconds: Math.max(1, Math.min(30, Number(block?.delaySeconds || 3) || 3))
                };
            }
            if (type === 'product') {
                return {
                    type,
                    sku: text(block?.sku),
                    productTitle: text(block?.productTitle)
                };
            }
            if (type === 'catalog') {
                return {
                    type,
                    text: text(block?.text)
                };
            }
            return {
                type: 'message',
                text: String(block?.text || ''),
                attachments: (Array.isArray(block?.attachments) ? block.attachments : [])
                    .map((asset) => ({
                        url: text(asset?.url || asset?.mediaUrl),
                        mimeType: text(asset?.mimeType || asset?.mediaMimeType).toLowerCase(),
                        fileName: text(asset?.fileName || asset?.mediaFileName || asset?.filename),
                        sizeBytes: Number.isFinite(Number(asset?.sizeBytes ?? asset?.mediaSizeBytes)) ? Number(asset?.sizeBytes ?? asset?.mediaSizeBytes) : null
                    }))
                    .filter((asset) => asset.url)
            };
        });
}

function deriveLegacyFieldsFromBlocks(blocks = []) {
    const source = Array.isArray(blocks) ? blocks : [];
    const firstMessage = source.find((block) => text(block?.type || 'message').toLowerCase() === 'message') || null;
    const assets = (Array.isArray(firstMessage?.attachments) ? firstMessage.attachments : [])
        .map((asset) => ({
            url: text(asset?.url || asset?.mediaUrl),
            mimeType: text(asset?.mimeType || asset?.mediaMimeType).toLowerCase(),
            fileName: text(asset?.fileName || asset?.mediaFileName || asset?.filename),
            sizeBytes: Number.isFinite(Number(asset?.sizeBytes ?? asset?.mediaSizeBytes)) ? Number(asset?.sizeBytes ?? asset?.mediaSizeBytes) : null
        }))
        .filter((asset) => asset.url);
    const primary = assets[0] || null;
    return {
        text: String(firstMessage?.text || ''),
        mediaAssets: assets,
        mediaUrl: primary?.url || '',
        mediaMimeType: primary?.mimeType || '',
        mediaFileName: primary?.fileName || '',
        mediaSizeBytes: primary?.sizeBytes || null
    };
}

function hasUsableMessageBlocks(blocks = []) {
    return (Array.isArray(blocks) ? blocks : []).some((block) => {
        const type = text(block?.type || 'message').toLowerCase();
        if (type === 'message') {
            return Boolean(text(block?.text) || (Array.isArray(block?.attachments) && block.attachments.some((asset) => text(asset?.url || asset?.mediaUrl))));
        }
        if (type === 'product') return Boolean(text(block?.sku));
        if (type === 'catalog') return true;
        return false;
    });
}

export default function QuickRepliesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const { confirm } = useUiFeedback();
    const {
        busy,
        loadingQuickReplies,
        settingsTenantId,
        loadQuickReplyData,
        setError,
        canManageQuickReplies,
        canViewQuickReplies = canManageQuickReplies,
        ensureSectionData = null,
        isLoading = null,
        getError = null,
        getReloadToken = null,
        forceReload = null,
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
        runSectionAction,
        deactivateQuickReplyLibrary,
        quickReplyLibraryForm = {},
        setQuickReplyLibraryForm,
        toggleModuleInQuickReplyLibraryForm,
        saveQuickReplyLibrary,
        cancelQuickReplyLibraryEdit,
        visibleQuickReplyItemsForSelectedLibrary = [],
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
        tenantCatalogProducts = [],
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
    const lazySectionId = 'quick_replies';
    const sectionReloadToken = typeof getReloadToken === 'function' ? getReloadToken(lazySectionId) : 0;
    const sectionLoading = (typeof isLoading === 'function' && isLoading(lazySectionId)) || loadingQuickReplies;
    const sectionError = typeof getError === 'function' ? getError(lazySectionId) : '';

    React.useEffect(() => {
        if (typeof ensureSectionData !== 'function') {
            if (settingsTenantId && canViewQuickReplies) {
                loadQuickReplyData?.(settingsTenantId).catch((err) => setError?.(String(err?.message || err || 'No se pudo cargar respuestas rápidas.')));
            }
            return;
        }
        void ensureSectionData(
            lazySectionId,
            () => loadQuickReplyData?.(settingsTenantId),
            {
                canLoad: Boolean(settingsTenantId && canViewQuickReplies && typeof loadQuickReplyData === 'function'),
                forceReload: sectionReloadToken > 0,
                reloadToken: sectionReloadToken,
                deps: [settingsTenantId]
            }
        );
    }, [canViewQuickReplies, ensureSectionData, loadQuickReplyData, sectionReloadToken, setError, settingsTenantId]);

    const isLibraryEditing = quickReplyLibraryPanelMode === 'create' || quickReplyLibraryPanelMode === 'edit';
    const isItemEditing = quickReplyItemPanelMode === 'create' || quickReplyItemPanelMode === 'edit';
    const runQuickReplyAction = React.useCallback((actionKey, label, action) => {
        if (typeof runSectionAction === 'function') {
            return runSectionAction(actionKey, action, { successMessage: label });
        }
        return runAction?.(label, action);
    }, [runAction, runSectionAction]);
    const selectedId = quickReplyLibraryPanelMode === 'create'
        ? '__create_quick_reply_library__'
        : text(selectedQuickReplyLibrary?.libraryId);

    const quickReplyItemInitialSignature = React.useMemo(() => {
        if (quickReplyItemPanelMode === 'create') {
            return JSON.stringify({
                label: '',
                text: '',
                mediaUrl: '',
                buttons: [],
                messageBlocks: [],
                category: 'general',
                availableForPatty: false,
                isActive: true,
                assets: []
            });
        }
        const item = selectedQuickReplyItem || {};
        const assets = Array.isArray(selectedQuickReplyItemMediaAssets) ? selectedQuickReplyItemMediaAssets : [];
        return JSON.stringify({
            label: text(item.label),
            text: String(item.text || ''),
            mediaUrl: text(item.mediaUrl),
            messageBlocks: serializeMessageBlocksForSignature(Array.isArray(item.messageBlocks) ? item.messageBlocks : []),
            buttons: (Array.isArray(item.buttons) ? item.buttons : [])
                .map((button, index) => ({
                    id: text(button?.id) || `btn_${index + 1}`,
                    title: text(button?.title || button?.label || button?.text).slice(0, 20)
                }))
                .slice(0, 3),
            category: normalizeQuickReplyCategory(item.category),
            availableForPatty: item.availableForPatty === true,
            isActive: item.isActive !== false,
            assets: assets.map((asset) => text(asset?.url || asset?.mediaUrl || asset?.filename || asset?.fileName)).filter(Boolean)
        });
    }, [quickReplyItemPanelMode, selectedQuickReplyItem, selectedQuickReplyItemMediaAssets]);

    const quickReplyItemCurrentSignature = React.useMemo(() => JSON.stringify({
        label: text(quickReplyItemForm.label),
        text: String(quickReplyItemForm.text || ''),
        mediaUrl: text(quickReplyItemForm.mediaUrl),
        messageBlocks: serializeMessageBlocksForSignature(Array.isArray(quickReplyItemForm.messageBlocks) ? quickReplyItemForm.messageBlocks : []),
        buttons: (Array.isArray(quickReplyItemForm.buttons) ? quickReplyItemForm.buttons : [])
            .map((button, index) => ({
                id: text(button?.id) || `btn_${index + 1}`,
                title: text(button?.title || button?.label || button?.text).slice(0, 20)
            }))
            .slice(0, 3),
        category: normalizeQuickReplyCategory(quickReplyItemForm.category),
        availableForPatty: quickReplyItemForm.availableForPatty === true,
        isActive: quickReplyItemForm.isActive !== false,
        assets: (Array.isArray(quickReplyItemFormAssets) ? quickReplyItemFormAssets : [])
            .map((asset) => text(asset?.url || asset?.mediaUrl || asset?.filename || asset?.fileName))
            .filter(Boolean)
    }), [quickReplyItemForm, quickReplyItemFormAssets]);

    const quickReplyItemHasChanges = isItemEditing && quickReplyItemCurrentSignature !== quickReplyItemInitialSignature;

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
                <button type="button" disabled={busy || !canManageQuickReplies || !text(quickReplyLibraryForm.name)} onClick={() => runQuickReplyAction('save_qr', quickReplyLibraryPanelMode === 'create' ? 'Biblioteca creada' : 'Biblioteca actualizada', async () => saveQuickReplyLibrary?.())}>
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
        runQuickReplyAction,
        saveQuickReplyLibrary,
        setQuickReplyLibraryForm,
        toggleModuleInQuickReplyLibraryForm,
        waModules
    ]);

    const requestCloseQuickReplyItemBuilder = React.useCallback(async (requestClose = null) => {
        if (quickReplyItemHasChanges) {
            const ok = await confirm({
                title: 'Descartar cambios',
                message: '¿Descartar cambios en esta respuesta rápida?',
                confirmText: 'Descartar',
                cancelText: 'Seguir editando',
                tone: 'danger'
            });
            if (!ok) return;
        }
        await requestClose?.();
    }, [confirm, quickReplyItemHasChanges]);

    const renderItemForm = React.useCallback(({ close: requestClose } = {}) => {
        const messageBlocks = getQuickReplyFormBlocks(quickReplyItemForm);
        const hasRequiredContent = hasUsableMessageBlocks(messageBlocks)
            || Boolean(text(quickReplyItemForm.text) || quickReplyItemFormAssets.length > 0 || text(quickReplyItemForm.mediaUrl));
        const saveDisabled = busy || uploadingQuickReplyAssets || !canManageQuickReplies || !text(quickReplyItemForm.label) || !hasRequiredContent;
        const handleClose = () => { void requestCloseQuickReplyItemBuilder(requestClose); };
        const handleBlocksChange = (nextBlocks) => {
            const normalized = normalizeMessageBlocksForComposer(nextBlocks);
            const legacyFields = deriveLegacyFieldsFromBlocks(normalized);
            setQuickReplyItemForm?.((prev) => ({
                ...prev,
                ...legacyFields,
                messageBlocks: normalized
            }));
        };
        const handleSave = () => runQuickReplyAction(
            'save_qr',
            quickReplyItemPanelMode === 'create'
                ? 'Respuesta rapida creada'
                : 'Respuesta rapida actualizada',
            async () => saveQuickReplyItem?.()
        );

        return (
            <div className="saas-quick-reply-builder-overlay" onClick={handleClose}>
                <div className="saas-quick-reply-builder-shell" onClick={(event) => event.stopPropagation()}>
                    <div className="saas-quick-reply-builder-header">
                        <div>
                            <h4>{quickReplyItemPanelMode === 'create' ? 'Nueva respuesta rapida' : 'Editar respuesta rapida'}</h4>
                            <small>Construye una respuesta con formato, variables, adjuntos y botones.</small>
                        </div>
                        <button type="button" className="saas-btn-cancel" disabled={busy || uploadingQuickReplyAssets} onClick={handleClose}>Cerrar</button>
                    </div>
                    <div className="saas-quick-reply-sequence-shell">
                        <div className="saas-quick-reply-sequence-meta">
                            <label>
                                <span>Etiqueta</span>
                                <input
                                    value={quickReplyItemForm.label || ''}
                                    onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, label: event.target.value }))}
                                    placeholder="Ej: Saludo inicial"
                                    disabled={busy || uploadingQuickReplyAssets}
                                />
                            </label>
                            <label>
                                <span>Categoria</span>
                                <select
                                    value={normalizeQuickReplyCategory(quickReplyItemForm.category)}
                                    onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, category: normalizeQuickReplyCategory(event.target.value) }))}
                                    disabled={busy || uploadingQuickReplyAssets}
                                >
                                    {QUICK_REPLY_CATEGORIES.map((entry) => (
                                        <option key={entry.value} value={entry.value}>{entry.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="saas-admin-module-toggle">
                                <input
                                    type="checkbox"
                                    checked={quickReplyItemForm.availableForPatty === true}
                                    onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, availableForPatty: event.target.checked }))}
                                    disabled={busy || uploadingQuickReplyAssets || normalizeQuickReplyCategory(quickReplyItemForm.category) === 'general'}
                                />
                                <span>Disponible para Patty</span>
                            </label>
                            <label className="saas-admin-module-toggle">
                                <input
                                    type="checkbox"
                                    checked={quickReplyItemForm.isActive !== false}
                                    onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, isActive: event.target.checked }))}
                                    disabled={busy || uploadingQuickReplyAssets}
                                />
                                <span>Respuesta activa</span>
                            </label>
                        </div>
                        <MessageSequenceComposer
                            value={messageBlocks}
                            onChange={handleBlocksChange}
                            tenantId={settingsTenantId}
                            catalogProducts={tenantCatalogProducts}
                            disabled={busy || uploadingQuickReplyAssets}
                            capabilities={{
                                message: true,
                                media: true,
                                delay: true,
                                catalog: true,
                                product: true
                            }}
                        />
                        <div className="saas-quick-reply-sequence-actions">
                            <span className={!hasRequiredContent || !text(quickReplyItemForm.label) ? 'is-warning' : ''}>
                                {!text(quickReplyItemForm.label)
                                    ? 'Agrega una etiqueta para guardar la respuesta.'
                                    : !hasRequiredContent
                                        ? 'Agrega al menos un mensaje, adjunto, producto o catalogo.'
                                        : 'Lista para guardar como respuesta rapida reutilizable.'}
                            </span>
                            <button
                                type="button"
                                className="saas-btn saas-btn--secondary"
                                disabled={busy || uploadingQuickReplyAssets}
                                onClick={handleClose}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="saas-btn saas-btn--primary"
                                disabled={saveDisabled}
                                onClick={handleSave}
                            >
                                {quickReplyItemPanelMode === 'create' ? 'Guardar respuesta' : 'Actualizar respuesta'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }, [
        busy,
        canManageQuickReplies,
        quickReplyItemForm,
        quickReplyItemFormAssets,
        quickReplyItemPanelMode,
        settingsTenantId,
        requestCloseQuickReplyItemBuilder,
        runQuickReplyAction,
        saveQuickReplyItem,
        setQuickReplyItemForm,
        tenantCatalogProducts,
        uploadingQuickReplyAssets
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
                                <small>{getQuickReplyCategoryLabel(item.category)} | {item.availableForPatty ? 'Patty IA' : 'No Patty'} | {item.isActive === false ? 'Inactiva' : 'Activa'} | {item.text || 'Solo adjuntos'}</small>
                            </button>
                        ))}
                    </div>
                </div>
                {selectedQuickReplyItem && quickReplyItemPanelMode === 'view' ? (
                    <div className="saas-admin-related-block">
                        {canManageQuickReplies ? (
                        <div className="saas-admin-list-actions saas-admin-list-actions--row">
                            <button type="button" disabled={busy} onClick={openQuickReplyItemEdit}>Editar</button>
                            <button type="button" disabled={busy || !canManageQuickReplies} onClick={() => runQuickReplyAction('delete_qr_item', 'Respuesta rápida desactivada', async () => deactivateQuickReplyItem?.(selectedQuickReplyItem?.itemId))}>Desactivar</button>
                        </div>
                        ) : null}
                        <div className="saas-admin-detail-grid">
                            <div className="saas-admin-detail-field"><span>Etiqueta</span><strong>{selectedQuickReplyItem.label || '-'}</strong></div>
                            <div className="saas-admin-detail-field"><span>Categoría</span><strong>{getQuickReplyCategoryLabel(selectedQuickReplyItem.category)}</strong></div>
                            <div className="saas-admin-detail-field"><span>Patty</span><strong>{selectedQuickReplyItem.availableForPatty ? 'Disponible' : 'No disponible'}</strong></div>
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
        runQuickReplyAction,
        selectedQuickReplyItem,
        selectedQuickReplyItemMediaAssets,
        selectedQuickReplyLibrary,
        setQuickReplyItemPanelMode,
        setSelectedQuickReplyItemId,
        settingsTenantId,
        visibleQuickReplyItemsForSelectedLibrary
    ]);

    const detailActions = React.useMemo(() => {
        if (!selectedQuickReplyLibrary || isLibraryEditing || isItemEditing || !canManageQuickReplies) return null;
        return (
            <>
                <button type="button" disabled={busy} onClick={openQuickReplyLibraryEdit}>Editar</button>
                <button type="button" disabled={busy} onClick={() => runQuickReplyAction('delete_qr_library', 'Biblioteca desactivada', async () => deactivateQuickReplyLibrary?.(selectedQuickReplyLibrary?.libraryId))}>Desactivar</button>
                <button type="button" disabled={busy} onClick={openQuickReplyItemCreate}>Nueva respuesta</button>
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
        runQuickReplyAction,
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
            loading={sectionLoading}
            emptyText={sectionError || (settingsTenantId ? 'Sin bibliotecas registradas.' : 'Selecciona una empresa para gestionar respuestas rápidas.')}
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
                    label: sectionError ? 'Reintentar' : 'Recargar',
                    onClick: () => (typeof forceReload === 'function' ? forceReload(lazySectionId) : settingsTenantId && loadQuickReplyData?.(settingsTenantId).catch((err) => setError?.(String(err?.message || err || 'No se pudo recargar respuestas rápidas.')))),
                    disabled: busy || sectionLoading || !settingsTenantId
                },
                ...(canManageQuickReplies ? [{
                    label: 'Nuevo',
                    onClick: openQuickReplyLibraryCreate,
                    disabled: busy || !settingsTenantId
                }] : [])
            ]}
            detailTitle={quickReplyLibraryPanelMode === 'create' ? 'Nueva biblioteca' : (selectedQuickReplyLibrary?.name || 'Biblioteca de respuestas')}
            detailSubtitle={quickReplyLibraryPanelMode === 'create' ? 'Define tipo, alcance y módulos asignados.' : (selectedQuickReplyLibrary?.libraryId || '')}
            detailActions={detailActions}
        />
    );
}
