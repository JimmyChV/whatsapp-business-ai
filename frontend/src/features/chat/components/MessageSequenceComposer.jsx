import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Box, Check, Clock3, Copy, FileText, Image, Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import AutoMessageEditor from '../../saas/components/AutoMessageEditor';
import {
    QUICK_REPLY_ACCEPT_VALUE,
    QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
    QUICK_REPLY_ALLOWED_MIME_TYPES,
    QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB,
    QUICK_REPLY_EXT_TO_MIME,
    getQuickReplyAssetDisplayName,
    isQuickReplyImageAsset,
    normalizeQuickReplyMediaAssets,
    resolveQuickReplyAssetPreviewUrl
} from '../../saas/helpers/quickReplies.helpers';
import {
    buildDataUrlWithMime,
    resolveQuickReplyMimeType
} from '../../saas/helpers/assets.helpers';

function text(value = '') {
    return String(value ?? '').trim();
}

function createBlockId() {
    return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeAttachment(entry = {}) {
    const source = entry && typeof entry === 'object' ? entry : {};
    const url = text(source.url || source.mediaUrl || source.dataUrl || '');
    if (!url) return null;
    const mimeType = text(source.mimeType || source.mediaMimeType || '').toLowerCase();
    const fileName = text(source.fileName || source.mediaFileName || source.filename || '');
    const sizeBytes = Number.isFinite(Number(source.sizeBytes || source.mediaSizeBytes))
        ? Number(source.sizeBytes || source.mediaSizeBytes)
        : null;
    const type = text(source.type || source.kind || (
        mimeType.startsWith('image/') ? 'image'
            : mimeType.startsWith('audio/') ? 'audio'
                : mimeType.startsWith('video/') ? 'video'
                    : 'document'
    )).toLowerCase() || 'document';
    return { type, url, mimeType, fileName, sizeBytes };
}

function normalizeBlock(block = {}, index = 0) {
    const source = block && typeof block === 'object' ? block : {};
    const type = text(source.type || 'message').toLowerCase();
    const id = text(source.id || source.blockId || '') || createBlockId();
    if (type === 'delay') {
        return {
            id,
            type: 'delay',
            delaySeconds: Math.min(30, Math.max(1, Number(source.delaySeconds || source.delay_seconds || 3) || 3))
        };
    }
    if (type === 'catalog') {
        return { id, type: 'catalog', text: text(source.text || '') };
    }
    if (type === 'product') {
        return {
            id,
            type: 'product',
            sku: text(source.sku || source.productRetailerId || ''),
            productTitle: text(source.productTitle || source.title || source.name || ''),
            productImageUrl: text(source.productImageUrl || source.imageUrl || ''),
            productPrice: text(source.productPrice || source.price || '')
        };
    }
    return {
        id: id || `blk_${index + 1}`,
        type: 'message',
        text: String(source.text ?? source.bodyText ?? source.body ?? ''),
        attachments: normalizeQuickReplyMediaAssets(source.attachments || source.mediaAssets)
            .map(normalizeAttachment)
            .filter(Boolean)
    };
}

export function buildMessageBlocksFromLegacy({ messageText = '', mediaAssets = [], mediaUrl = '', mediaMimeType = '', mediaFileName = '', mediaSizeBytes = null } = {}) {
    const attachments = normalizeQuickReplyMediaAssets(mediaAssets, {
        url: mediaUrl,
        mimeType: mediaMimeType,
        fileName: mediaFileName,
        sizeBytes: mediaSizeBytes
    }).map(normalizeAttachment).filter(Boolean);
    if (!text(messageText) && attachments.length === 0) {
        return [normalizeBlock({ type: 'message', text: '', attachments: [] })];
    }
    return [normalizeBlock({ type: 'message', text: messageText, attachments })];
}

export function normalizeMessageBlocksForComposer(value = [], fallback = {}) {
    const source = Array.isArray(value) ? value : [];
    const normalized = source.map(normalizeBlock);
    return normalized.length > 0 ? normalized : buildMessageBlocksFromLegacy(fallback);
}

function formatBytes(value = 0) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function blockIcon(type = '') {
    if (type === 'delay') return <Clock3 size={16} />;
    if (type === 'catalog') return <Archive size={16} />;
    if (type === 'product') return <Box size={16} />;
    return <FileText size={16} />;
}

function summarizeBlock(block = {}) {
    if (block.type === 'delay') return `Esperar ${Number(block.delaySeconds || 3)}s`;
    if (block.type === 'catalog') return 'Catalogo nativo WhatsApp';
    if (block.type === 'product') return block.productTitle ? `${block.productTitle} (${block.sku || 'sin SKU'})` : block.sku ? `Producto ${block.sku}` : 'Producto por SKU';
    const body = text(block.text);
    if (body) return body;
    if (block.attachments?.length) return `${block.attachments.length} adjunto(s)`;
    return 'Mensaje vacio';
}

function normalizeCatalogProduct(item = {}, index = 0) {
    const source = item && typeof item === 'object' ? item : {};
    const sku = text(
        source.productRetailerId
        || source.product_retailer_id
        || source.retailerId
        || source.retailer_id
        || source.itemId
        || source.item_id
        || source.sku
        || source.productId
        || source.product_id
        || source.id
    );
    const title = text(source.title || source.name || source.productName || source.product_name || source.nombre || sku || `Producto ${index + 1}`);
    const price = text(source.price || source.regularPrice || source.salePrice || source.priceLabel || '');
    const imageUrl = text(source.imageUrl || source.image_url || source.thumbnailUrl || source.thumbnail || '');
    const description = text(source.description || source.shortDescription || source.short_description || '');
    if (!sku && !title) return null;
    return {
        id: text(source.id || source.productId || source.product_id || source.itemId || source.item_id || sku || `product_${index}`),
        sku,
        title,
        price,
        imageUrl,
        description,
        searchText: `${sku} ${title} ${description}`.toLowerCase()
    };
}

export default function MessageSequenceComposer({
    value = [],
    onChange,
    tenantId = '',
    catalogProducts = [],
    disabled = false,
    capabilities = {
        message: true,
        media: true,
        delay: true,
        catalog: true,
        product: true
    }
}) {
    const { confirm } = useUiFeedback();
    const blocks = useMemo(() => normalizeMessageBlocksForComposer(value), [value]);
    const [selectedId, setSelectedId] = useState(() => blocks[0]?.id || '');
    const [editingId, setEditingId] = useState(() => blocks[0]?.id || '');
    const [productSearch, setProductSearch] = useState('');
    const selectedBlock = blocks.find((block) => block.id === selectedId) || blocks[0] || null;
    const editingBlock = blocks.find((block) => block.id === editingId) || null;
    const productOptions = useMemo(() => (
        (Array.isArray(catalogProducts) ? catalogProducts : [])
            .map(normalizeCatalogProduct)
            .filter(Boolean)
    ), [catalogProducts]);
    const filteredProductOptions = useMemo(() => {
        const query = text(productSearch || editingBlock?.productTitle || editingBlock?.sku).toLowerCase();
        const source = productOptions;
        if (!query) return source.slice(0, 8);
        return source.filter((item) => item.searchText.includes(query)).slice(0, 10);
    }, [editingBlock?.productTitle, editingBlock?.sku, productOptions, productSearch]);

    const commit = (nextBlocks) => {
        const normalized = normalizeMessageBlocksForComposer(nextBlocks);
        onChange?.(normalized);
        if (!normalized.some((block) => block.id === selectedId)) {
            setSelectedId(normalized[0]?.id || '');
        }
    };

    const updateBlock = (blockId, patch) => {
        commit(blocks.map((block) => block.id === blockId ? normalizeBlock({ ...block, ...patch }) : block));
    };

    const addBlock = (type) => {
        const nextBlock = normalizeBlock(
            type === 'delay' ? { type: 'delay', delaySeconds: 3 }
                : type === 'catalog' ? { type: 'catalog' }
                    : type === 'product' ? { type: 'product', sku: '' }
                        : { type: 'message', text: '', attachments: [] }
        );
        commit([...blocks, nextBlock]);
        setSelectedId(nextBlock.id);
        setEditingId(nextBlock.id);
    };

    const removeBlock = (blockId) => {
        if (blocks.length <= 1) {
            commit([normalizeBlock({ type: 'message', text: '', attachments: [] })]);
            setEditingId('');
            return;
        }
        commit(blocks.filter((block) => block.id !== blockId));
        if (editingId === blockId) setEditingId('');
    };

    const moveBlock = (blockId, direction) => {
        const index = blocks.findIndex((block) => block.id === blockId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= blocks.length) return;
        const next = [...blocks];
        [next[index], next[target]] = [next[target], next[index]];
        commit(next);
    };

    const duplicateBlock = (blockId) => {
        const index = blocks.findIndex((block) => block.id === blockId);
        if (index < 0) return;
        const copy = normalizeBlock({ ...blocks[index], id: createBlockId() });
        const next = [...blocks];
        next.splice(index + 1, 0, copy);
        commit(next);
        setSelectedId(copy.id);
    };

    const uploadFiles = async (fileList) => {
        const files = Array.from(fileList || []).filter(Boolean);
        const targetBlock = editingBlock || selectedBlock;
        if (!targetBlock || targetBlock.type !== 'message' || files.length === 0) return;
        const maxBytes = QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB * 1024 * 1024;
        const uploadedAssets = [];
        for (const file of files) {
            const mimeType = resolveQuickReplyMimeType(file, {
                allowedMimeTypes: QUICK_REPLY_ALLOWED_MIME_TYPES,
                extToMime: QUICK_REPLY_EXT_TO_MIME
            });
            if (!QUICK_REPLY_ALLOWED_MIME_TYPES.includes(mimeType)) {
                throw new Error(`Formato no permitido para ${String(file?.name || 'adjunto')}. Usa ${QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}.`);
            }
            if (Number(file?.size || 0) > maxBytes) {
                throw new Error(`El archivo ${String(file?.name || 'adjunto')} supera el maximo de ${QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB} MB.`);
            }
            uploadedAssets.push({
                type: mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('video/') ? 'video' : 'document',
                url: await buildDataUrlWithMime(file, mimeType),
                mimeType,
                fileName: String(file?.name || 'adjunto').trim() || 'adjunto',
                sizeBytes: Number(file?.size || 0) || null
            });
        }
        updateBlock(targetBlock.id, {
            attachments: [...(targetBlock.attachments || []), ...uploadedAssets]
        });
    };

    const removeAssetAt = (index = -1) => {
        const targetBlock = editingBlock || selectedBlock;
        if (!targetBlock || targetBlock.type !== 'message') return;
        updateBlock(targetBlock.id, {
            attachments: (targetBlock.attachments || []).filter((_asset, assetIndex) => assetIndex !== index)
        });
    };

    const activeEditBlock = editingBlock || selectedBlock;
    const selectedForm = activeEditBlock?.type === 'message'
        ? {
            mediaAssets: activeEditBlock.attachments || [],
            mediaUrl: activeEditBlock.attachments?.[0]?.url || '',
            mediaMimeType: activeEditBlock.attachments?.[0]?.mimeType || '',
            mediaFileName: activeEditBlock.attachments?.[0]?.fileName || '',
            mediaSizeBytes: activeEditBlock.attachments?.[0]?.sizeBytes || null
        }
        : {};

    const setSelectedForm = (updater) => {
        if (!activeEditBlock || activeEditBlock.type !== 'message') return;
        const nextForm = typeof updater === 'function' ? updater(selectedForm) : updater;
        const nextAssets = normalizeQuickReplyMediaAssets(nextForm?.mediaAssets, {
            url: nextForm?.mediaUrl,
            mimeType: nextForm?.mediaMimeType,
            fileName: nextForm?.mediaFileName,
            sizeBytes: nextForm?.mediaSizeBytes
        }).map(normalizeAttachment).filter(Boolean);
        updateBlock(activeEditBlock.id, { attachments: nextAssets });
    };

    const closeEditor = useCallback(async ({ confirmClose = true } = {}) => {
        if (!editingBlock) return;
        if (confirmClose) {
            const shouldClose = await confirm({
                title: 'Salir del editor',
                message: 'Estas saliendo del editor del bloque. Si vuelves a la secuencia, los cambios ya escritos quedan en el bloque, pero seguiras editando desde la lista.',
                confirmText: 'Volver a la secuencia',
                cancelText: 'Seguir editando',
                tone: 'warn'
            });
            if (!shouldClose) return;
        }
        setEditingId('');
    }, [confirm, editingBlock]);

    useEffect(() => {
        if (!editingBlock) return undefined;
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            void closeEditor({ confirmClose: true });
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [closeEditor, editingBlock]);

    const editorModal = editingBlock ? createPortal((
        <div className="message-sequence-composer__editor-overlay" onClick={() => { void closeEditor({ confirmClose: true }); }}>
            <div className="message-sequence-composer__editor-modal" onClick={(event) => event.stopPropagation()}>
                <div className="message-sequence-composer__editor-head">
                    <div>
                        <strong>{blockIcon(editingBlock.type)} Configurando {summarizeBlock(editingBlock)}</strong>
                        <small>Guarda el bloque para volver a la secuencia.</small>
                    </div>
                    <div className="message-sequence-composer__editor-actions">
                        <button type="button" className="saas-btn saas-btn--primary message-sequence-composer__done" onClick={() => { void closeEditor({ confirmClose: false }); }} disabled={disabled}>
                            <Check size={15} /> Guardar bloque
                        </button>
                        <button type="button" className="saas-btn saas-btn--secondary message-sequence-composer__close-editor" onClick={() => { void closeEditor({ confirmClose: true }); }} disabled={disabled} aria-label="Cerrar editor de bloque">
                            <X size={17} />
                        </button>
                    </div>
                </div>

                <div className="message-sequence-composer__editor-content">
                    {editingBlock.type === 'message' ? (
                        <AutoMessageEditor
                            key={editingBlock.id}
                            value={editingBlock.text || ''}
                            onChange={(nextText) => updateBlock(editingBlock.id, { text: nextText })}
                            disabled={disabled}
                            placeholder="Escribe este bloque. Puedes usar variables y adjuntos."
                            showMediaUpload={capabilities.media !== false}
                            showPreview={false}
                            tenantId={tenantId}
                            form={selectedForm}
                            setForm={setSelectedForm}
                            acceptValue={QUICK_REPLY_ACCEPT_VALUE}
                            mediaAssets={editingBlock.attachments || []}
                            mediaUrl={selectedForm.mediaUrl}
                            onMediaUrlChange={(url) => setSelectedForm((prev) => ({ ...prev, mediaUrl: url }))}
                            onUploadFiles={uploadFiles}
                            onUploadError={(err) => console.warn('[MessageSequenceComposer] upload error:', err?.message || err)}
                            showFlowNote={false}
                            removeAssetAt={removeAssetAt}
                            getAssetDisplayName={getQuickReplyAssetDisplayName}
                            formatBytes={formatBytes}
                            resolveAssetPreviewUrl={resolveQuickReplyAssetPreviewUrl}
                            isImageAsset={isQuickReplyImageAsset}
                            hasRequiredContent={true}
                            saveDisabled={false}
                            initialShowVariablesPanel={true}
                            initialVariableGroupsExpanded={false}
                        />
                    ) : null}

                    {editingBlock.type === 'delay' ? (
                        <div className="message-sequence-composer__simple-editor">
                            <strong>Delay entre bloques</strong>
                            <small>Pausa corta. Maximo 30 segundos.</small>
                            <input
                                type="number"
                                min="1"
                                max="30"
                                value={editingBlock.delaySeconds || 3}
                                onChange={(event) => updateBlock(editingBlock.id, { delaySeconds: event.target.value })}
                                className="saas-input"
                                style={{ width: '140px' }}
                            />
                            <div className="message-sequence-composer__presets">
                                {[3, 5, 10].map((seconds) => (
                                    <button key={seconds} type="button" className="message-sequence-composer__chip" onClick={() => updateBlock(editingBlock.id, { delaySeconds: seconds })}>{seconds}s</button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {editingBlock.type === 'product' ? (
                        <div className="message-sequence-composer__simple-editor">
                            <strong>Producto nativo por SKU</strong>
                            <small>Busca por nombre o SKU y selecciona el producto correcto del catalogo.</small>
                            <input
                                value={productSearch || editingBlock.productTitle || editingBlock.sku || ''}
                                onChange={(event) => setProductSearch(event.target.value)}
                                className="saas-input"
                                placeholder="Buscar producto por nombre o SKU"
                            />
                            {editingBlock.sku ? (
                                <div className="message-sequence-composer__selected-product">
                                    <span>Seleccionado</span>
                                    <strong>{editingBlock.productTitle || editingBlock.sku}</strong>
                                    <small>SKU: {editingBlock.sku}</small>
                                </div>
                            ) : null}
                            <div className="message-sequence-composer__product-results">
                                {filteredProductOptions.length === 0 ? (
                                    <small>{productOptions.length === 0 ? 'El catalogo aun no esta disponible para seleccionar productos.' : 'Sin coincidencias.'}</small>
                                ) : filteredProductOptions.map((product) => (
                                    <button
                                        key={`${product.id}_${product.sku}`}
                                        type="button"
                                        className={String(editingBlock.sku || '').trim() === product.sku ? 'is-selected' : ''}
                                        onClick={() => {
                                            updateBlock(editingBlock.id, {
                                                sku: product.sku,
                                                productTitle: product.title,
                                                productImageUrl: product.imageUrl,
                                                productPrice: product.price
                                            });
                                            setProductSearch('');
                                        }}
                                    >
                                        {product.imageUrl ? <img src={product.imageUrl} alt={product.title} loading="lazy" decoding="async" /> : <span>{product.title.slice(0, 2).toUpperCase()}</span>}
                                        <div>
                                            <strong>{product.title}</strong>
                                            <small>{product.sku}{product.price ? ` - ${product.price}` : ''}</small>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {editingBlock.type === 'catalog' ? (
                        <div className="message-sequence-composer__simple-editor">
                            <strong>Catalogo nativo WhatsApp</strong>
                            <small>Este bloque abre el catalogo nativo asociado al modulo.</small>
                            <input
                                value={editingBlock.text || ''}
                                onChange={(event) => updateBlock(editingBlock.id, { text: event.target.value })}
                                className="saas-input"
                                placeholder="Texto del catalogo (opcional)"
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    ), document.body) : null;

    return (
        <div className="message-sequence-composer">
            <div className="message-sequence-composer__toolbar">
                {capabilities.message !== false ? <button type="button" className="message-sequence-composer__tool" disabled={disabled} onClick={() => addBlock('message')}><Plus size={14} /> Texto</button> : null}
                {capabilities.media !== false ? <button type="button" className="message-sequence-composer__tool" disabled={disabled} onClick={() => addBlock('message')}><Image size={14} /> Adjunto</button> : null}
                {capabilities.product !== false ? <button type="button" className="message-sequence-composer__tool" disabled={disabled} onClick={() => addBlock('product')}><Box size={14} /> Producto</button> : null}
                {capabilities.catalog !== false ? <button type="button" className="message-sequence-composer__tool" disabled={disabled} onClick={() => addBlock('catalog')}><Archive size={14} /> Catalogo</button> : null}
                {capabilities.delay !== false ? <button type="button" className="message-sequence-composer__tool" disabled={disabled} onClick={() => addBlock('delay')}><Clock3 size={14} /> Delay</button> : null}
            </div>

            <div className="message-sequence-composer__body">
                <div className="message-sequence-composer__list">
                    {blocks.map((block, index) => (
                        <button
                            key={block.id}
                            type="button"
                            className={`message-sequence-composer__block ${block.id === selectedBlock?.id ? 'is-selected' : ''}`}
                            onClick={() => {
                                setSelectedId(block.id);
                                setEditingId(block.id);
                            }}
                        >
                            <span className="message-sequence-composer__block-title">
                                {blockIcon(block.type)} Bloque {index + 1}
                            </span>
                            <small className="message-sequence-composer__block-summary">
                                {summarizeBlock(block)}
                            </small>
                            <span className="message-sequence-composer__block-actions">
                                <span role="button" tabIndex={0} aria-label="Editar bloque" onClick={(event) => { event.stopPropagation(); setSelectedId(block.id); setEditingId(block.id); }}>Editar</span>
                                <span role="button" tabIndex={0} aria-label="Subir bloque" onClick={(event) => { event.stopPropagation(); moveBlock(block.id, -1); }}><ChevronUp size={15} /></span>
                                <span role="button" tabIndex={0} aria-label="Bajar bloque" onClick={(event) => { event.stopPropagation(); moveBlock(block.id, 1); }}><ChevronDown size={15} /></span>
                                <span role="button" tabIndex={0} aria-label="Duplicar bloque" onClick={(event) => { event.stopPropagation(); duplicateBlock(block.id); }}><Copy size={14} /></span>
                                <span role="button" tabIndex={0} aria-label="Eliminar bloque" onClick={(event) => { event.stopPropagation(); removeBlock(block.id); }}><Trash2 size={14} /></span>
                            </span>
                        </button>
                    ))}
                </div>

            </div>
            {editorModal}
        </div>
    );
}
