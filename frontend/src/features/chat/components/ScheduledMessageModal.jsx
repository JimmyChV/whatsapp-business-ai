import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Clock, Trash2, Pencil } from 'lucide-react';
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
import {
    cancelScheduledMessage,
    createScheduledMessage,
    listScheduledMessages,
    updateScheduledMessage
} from '../core/services/scheduledMessages.service';

const RELATIVE_PRESETS = [
    { label: '30 min antes', value: 30 },
    { label: '1 h antes', value: 60 },
    { label: '2 h antes', value: 120 },
    { label: '4 h antes', value: 240 }
];

function text(value = '') {
    return String(value ?? '').trim();
}

function toDateTimeLocal(value = null) {
    const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value = '') {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatSchedule(value = '') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-PE', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

function formatBytes(value = 0) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusLabel(status = '') {
    const value = text(status).toLowerCase();
    if (value === 'sent') return 'enviado';
    if (value === 'failed') return 'fallido';
    if (value === 'cancelled') return 'cancelado';
    return 'pendiente';
}

function getStatusColor(status = '') {
    const value = text(status).toLowerCase();
    if (value === 'sent') return '#16a34a';
    if (value === 'failed') return '#dc2626';
    if (value === 'cancelled') return '#6b7280';
    return '#ca8a04';
}

const ScheduledMessageModal = ({
    isOpen,
    onClose,
    activeChat,
    quickReplies = [],
    buildApiHeaders,
    activeTenantId = ''
}) => {
    const chatId = text(activeChat?.id);
    const scopeModuleId = text(activeChat?.scopeModuleId).toLowerCase();
    const windowExpiresAt = activeChat?.windowExpiresAt || null;
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState('');
    const [messageText, setMessageText] = useState('');
    const [scheduleType, setScheduleType] = useState('absolute');
    const [scheduledFor, setScheduledFor] = useState(() => toDateTimeLocal());
    const [minutesBeforeWindow, setMinutesBeforeWindow] = useState(60);
    const [cancelOnCustomerReply, setCancelOnCustomerReply] = useState(true);
    const [form, setForm] = useState({ mediaUrl: '', mediaAssets: [] });

    const mediaAssets = useMemo(() => normalizeQuickReplyMediaAssets(form.mediaAssets, {
        url: form.mediaUrl,
        mimeType: form.mediaMimeType,
        fileName: form.mediaFileName,
        sizeBytes: form.mediaSizeBytes
    }), [form.mediaAssets, form.mediaFileName, form.mediaMimeType, form.mediaSizeBytes, form.mediaUrl]);
    const variables = useMemo(() => ({
        cliente: text(activeChat?.name || activeChat?.displayName || activeChat?.phone),
        modulo: text(activeChat?.moduleName),
        telefono: text(activeChat?.phone)
    }), [activeChat]);
    const pendingItems = useMemo(() => items.filter((item) => String(item?.status || '') === 'pending'), [items]);
    const historyItems = useMemo(() => items.slice(0, 10), [items]);
    const hasRequiredContent = Boolean(messageText.trim() || mediaAssets.length > 0 || text(form.mediaUrl));

    const loadItems = async () => {
        if (!chatId) return;
        setLoading(true);
        setError('');
        try {
            const next = await listScheduledMessages({ chatId, scopeModuleId, buildApiHeaders });
            setItems(next);
        } catch (err) {
            setError(String(err?.message || err));
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEditingId('');
        setMessageText('');
        setScheduleType('absolute');
        setScheduledFor(toDateTimeLocal());
        setMinutesBeforeWindow(60);
        setCancelOnCustomerReply(true);
        setForm({ mediaUrl: '', mediaAssets: [] });
    };

    useEffect(() => {
        if (!isOpen) return;
        resetForm();
        loadItems();
    }, [isOpen, chatId, scopeModuleId]);

    if (!isOpen) return null;

    const handleQuickReplySelection = (event) => {
        const id = text(event.target.value);
        if (!id) return;
        const item = quickReplies.find((entry) => String(entry?.id || entry?.label || '') === id);
        if (item) {
            const assets = normalizeQuickReplyMediaAssets(item.mediaAssets, {
                url: item.mediaUrl,
                mimeType: item.mediaMimeType,
                fileName: item.mediaFileName,
                sizeBytes: item.mediaSizeBytes
            });
            const primaryMedia = assets[0] || null;
            setMessageText(String(item?.text || '').trim());
            setForm({
                mediaAssets: assets,
                mediaUrl: primaryMedia?.url || '',
                mediaMimeType: primaryMedia?.mimeType || '',
                mediaFileName: primaryMedia?.fileName || '',
                mediaSizeBytes: primaryMedia?.sizeBytes || null
            });
        }
        event.target.value = '';
    };

    const handleUploadFiles = async (fileList) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (files.length === 0) return;
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
            const dataUrl = await buildDataUrlWithMime(file, mimeType);
            uploadedAssets.push({
                url: dataUrl,
                mimeType,
                fileName: String(file?.name || 'adjunto').trim() || 'adjunto',
                sizeBytes: Number(file?.size || 0) || null
            });
        }
        setForm((prev) => {
            const mergedAssets = normalizeQuickReplyMediaAssets([
                ...(Array.isArray(prev?.mediaAssets) ? prev.mediaAssets : []),
                ...uploadedAssets
            ]);
            const primaryMedia = mergedAssets[0] || null;
            return {
                ...prev,
                mediaAssets: mergedAssets,
                mediaUrl: primaryMedia?.url || '',
                mediaMimeType: primaryMedia?.mimeType || '',
                mediaFileName: primaryMedia?.fileName || '',
                mediaSizeBytes: primaryMedia?.sizeBytes || null
            };
        });
    };

    const removeAssetAt = (index = -1) => {
        const targetIndex = Number(index);
        if (!Number.isInteger(targetIndex) || targetIndex < 0) return;
        setForm((prev) => {
            const nextAssets = normalizeQuickReplyMediaAssets(prev?.mediaAssets, {
                url: prev?.mediaUrl,
                mimeType: prev?.mediaMimeType,
                fileName: prev?.mediaFileName,
                sizeBytes: prev?.mediaSizeBytes
            }).filter((_asset, assetIndex) => assetIndex !== targetIndex);
            const primaryMedia = nextAssets[0] || null;
            return {
                ...prev,
                mediaAssets: nextAssets,
                mediaUrl: primaryMedia?.url || '',
                mediaMimeType: primaryMedia?.mimeType || '',
                mediaFileName: primaryMedia?.fileName || '',
                mediaSizeBytes: primaryMedia?.sizeBytes || null
            };
        });
    };

    const submit = async () => {
        if (!hasRequiredContent) {
            setError('Agrega texto o un adjunto para programar.');
            return;
        }
        if (!cancelOnCustomerReply) {
            const shouldContinue = globalThis.confirm(
                'Este mensaje se enviara aunque el cliente responda antes. ' +
                'Aceptar: programarlo para enviar siempre. Cancelar: volver y marcar "No enviar si responde".'
            );
            if (!shouldContinue) return;
        }
        const primaryMedia = mediaAssets[0] || null;
        const payload = {
            chatId,
            scopeModuleId,
            messageText,
            variables,
            mediaAssets,
            mediaUrl: primaryMedia?.url || '',
            mediaMimeType: primaryMedia?.mimeType || '',
            mediaFileName: primaryMedia?.fileName || '',
            scheduleType,
            scheduledFor: scheduleType === 'absolute' ? fromDateTimeLocal(scheduledFor) : undefined,
            minutesBeforeWindow: scheduleType === 'before_window_expiry' ? minutesBeforeWindow : undefined,
            windowExpiresAt,
            cancelOnCustomerReply
        };
        setSaving(true);
        setError('');
        try {
            if (editingId) {
                await updateScheduledMessage({ messageId: editingId, payload, buildApiHeaders });
            } else {
                await createScheduledMessage({ payload, buildApiHeaders });
            }
            resetForm();
            onClose?.();
        } catch (err) {
            setError(String(err?.message || err));
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (item) => {
        const assets = normalizeQuickReplyMediaAssets(item?.mediaAssets, {
            url: item?.mediaUrl,
            mimeType: item?.mediaMimeType,
            fileName: item?.mediaFileName
        });
        const primaryMedia = assets[0] || null;
        setEditingId(String(item?.messageId || ''));
        setMessageText(String(item?.messageText || ''));
        setScheduleType(String(item?.scheduleType || 'absolute'));
        setScheduledFor(toDateTimeLocal(item?.scheduledFor));
        setMinutesBeforeWindow(Number(item?.minutesBeforeWindow || 60));
        setCancelOnCustomerReply(item?.cancelOnCustomerReply !== false);
        setForm({
            mediaAssets: assets,
            mediaUrl: primaryMedia?.url || '',
            mediaMimeType: primaryMedia?.mimeType || '',
            mediaFileName: primaryMedia?.fileName || '',
            mediaSizeBytes: primaryMedia?.sizeBytes || null
        });
    };

    const cancelItem = async (item) => {
        const messageId = String(item?.messageId || '');
        if (!messageId) return;
        setSaving(true);
        setError('');
        try {
            await cancelScheduledMessage({ messageId, buildApiHeaders });
            if (editingId === messageId) resetForm();
            await loadItems();
        } catch (err) {
            setError(String(err?.message || err));
        } finally {
            setSaving(false);
        }
    };

    const modal = (
        <div
            className="saas-quick-reply-builder-overlay"
            onClick={onClose}
            style={{ zIndex: 2147483000, alignItems: 'flex-start', paddingTop: '34px' }}
        >
            <div
                className="saas-quick-reply-builder-shell"
                onClick={(event) => event.stopPropagation()}
                style={{ width: 'min(1180px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)' }}
            >
                <div className="saas-quick-reply-builder-header">
                    <div>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CalendarClock size={19} /> Programar respuesta
                        </h4>
                        <small>{variables.cliente || 'Chat activo'} · se cancela si el cliente responde antes, salvo que lo desactives.</small>
                    </div>
                    <button type="button" className="saas-btn-cancel" disabled={saving} onClick={onClose}>Cerrar</button>
                </div>

                {error ? <div className="saas-meta-template-error" style={{ margin: '0 18px 10px' }}>{error}</div> : null}

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: '14px', padding: '0 18px 18px', overflow: 'auto' }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
                            <select onChange={handleQuickReplySelection} defaultValue="" className="saas-input" style={{ minHeight: '36px', minWidth: '300px' }}>
                                <option value="">Cargar respuesta rapida para editar...</option>
                                {quickReplies.map((item) => (
                                    <option key={String(item?.id || item?.label)} value={String(item?.id || item?.label || '')}>
                                        {String(item?.label || 'Respuesta')}
                                    </option>
                                ))}
                            </select>
                            <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button type="button" className={scheduleType === 'absolute' ? '' : 'saas-btn-cancel'} onClick={() => setScheduleType('absolute')}>
                                    Hora exacta
                                </button>
                                <button type="button" className={scheduleType === 'before_window_expiry' ? '' : 'saas-btn-cancel'} onClick={() => setScheduleType('before_window_expiry')} disabled={!windowExpiresAt}>
                                    Antes de vencer
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
                            {scheduleType === 'absolute' ? (
                                <input
                                    type="datetime-local"
                                    value={scheduledFor}
                                    onChange={(event) => setScheduledFor(event.target.value)}
                                    className="saas-input"
                                    style={{ width: 'fit-content' }}
                                />
                            ) : (
                                <>
                                    {RELATIVE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.value}
                                            type="button"
                                            className={minutesBeforeWindow === preset.value ? '' : 'saas-btn-cancel'}
                                            onClick={() => setMinutesBeforeWindow(preset.value)}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                    <small>Vence: {windowExpiresAt ? formatSchedule(windowExpiresAt) : 'sin dato'}</small>
                                </>
                            )}
                            <label className="saas-admin-module-toggle" style={{ marginLeft: 'auto' }} title="Si lo desmarcas, se pedira confirmacion porque el mensaje saldra aunque el cliente responda antes.">
                                <input
                                    type="checkbox"
                                    checked={cancelOnCustomerReply}
                                    onChange={(event) => setCancelOnCustomerReply(event.target.checked)}
                                />
                                <span>No enviar si responde</span>
                            </label>
                        </div>
                        {!cancelOnCustomerReply ? (
                            <div className="saas-alert-warning" style={{ marginBottom: '10px' }}>
                                Este mensaje se enviara aunque el cliente responda antes. Al programarlo te pedire confirmacion.
                            </div>
                        ) : null}

                        <AutoMessageEditor
                            value={messageText}
                            onChange={setMessageText}
                            disabled={saving}
                            placeholder="Escribe el mensaje programado. Puedes usar variables y adjuntos."
                            showMediaUpload={true}
                            showPreview={true}
                            tenantId={activeTenantId}
                            form={form}
                            setForm={setForm}
                            acceptValue={QUICK_REPLY_ACCEPT_VALUE}
                            mediaAssets={mediaAssets}
                            mediaUrl={form.mediaUrl}
                            onMediaUrlChange={(url) => setForm((prev) => ({ ...prev, mediaUrl: url }))}
                            onUploadFiles={handleUploadFiles}
                            onUploadError={(err) => setError(String(err?.message || err || 'No se pudo adjuntar archivo.'))}
                            showFlowNote={false}
                            removeAssetAt={removeAssetAt}
                            getAssetDisplayName={getQuickReplyAssetDisplayName}
                            formatBytes={formatBytes}
                            resolveAssetPreviewUrl={resolveQuickReplyAssetPreviewUrl}
                            isImageAsset={isQuickReplyImageAsset}
                            hasRequiredContent={hasRequiredContent}
                            saveDisabled={saving || !hasRequiredContent}
                            mode={editingId ? 'edit' : 'create'}
                        />
                        <div className="saas-admin-form-row saas-admin-form-row--actions saas-quick-reply-builder-actions" style={{ marginTop: '12px' }}>
                            <button type="button" disabled={saving || !hasRequiredContent} onClick={submit}>
                                {editingId ? 'Guardar programacion' : 'Programar respuesta'}
                            </button>
                            <button type="button" className="saas-btn-cancel" disabled={saving} onClick={resetForm}>
                                Limpiar
                            </button>
                        </div>
                    </div>

                    <aside style={{ border: '1px solid var(--chat-card-border, #e5e7eb)', borderRadius: '8px', padding: '12px', background: 'var(--chat-card-surface, #fff)', alignSelf: 'start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 800 }}>
                            <Clock size={17} /> Programados ({pendingItems.length})
                        </div>
                        {loading ? (
                            <small>Cargando...</small>
                        ) : historyItems.length === 0 ? (
                            <small>No hay mensajes programados para este chat.</small>
                        ) : (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {historyItems.map((item) => (
                                    <div key={item.messageId} style={{ border: '1px solid var(--chat-card-border, #e5e7eb)', borderRadius: '8px', padding: '10px', display: 'grid', gap: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                                            <strong style={{ fontSize: '0.82rem' }}>{formatSchedule(item.scheduledFor)}</strong>
                                            <span style={{ color: getStatusColor(item.status), fontSize: '0.72rem', fontWeight: 800 }}>
                                                {getStatusLabel(item.status)}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                                            {item.messageText || (item.mediaUrl ? 'Adjunto programado' : 'Sin texto')}
                                        </div>
                                        {item.status === 'failed' && item.failReason ? (
                                            <small style={{ color: '#b91c1c' }}>Error: {item.failReason}</small>
                                        ) : null}
                                        {item.status === 'cancelled' && item.cancelReason ? (
                                            <small style={{ color: '#6b7280' }}>Cancelado: {item.cancelReason}</small>
                                        ) : null}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                            {item.status === 'pending' ? (
                                                <>
                                                    <button type="button" className="saas-btn-cancel" onClick={() => startEdit(item)} title="Reprogramar">
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button type="button" className="saas-btn-cancel" onClick={() => cancelItem(item)} title="Cancelar programacion">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
};

export default ScheduledMessageModal;
