import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, ChevronDown, Clock, Trash2, Pencil } from 'lucide-react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import MessageSequenceComposer, { buildMessageBlocksFromLegacy, normalizeMessageBlocksForComposer } from './MessageSequenceComposer';
import {
    normalizeQuickReplyMediaAssets
} from '../../saas/helpers/quickReplies.helpers';
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

function getStatusLabel(status = '') {
    const value = text(status).toLowerCase();
    if (value === 'sent') return 'enviado';
    if (value === 'failed') return 'fallido';
    if (value === 'cancelled') return 'cancelado';
    return 'pendiente';
}

function formatScheduleButtonLabel({ scheduleType = 'absolute', scheduledFor = '', minutesBeforeWindow = 60, windowExpiresAt = null } = {}) {
    if (scheduleType === 'before_window_expiry') {
        if (!windowExpiresAt) return 'Sin ventana';
        return `${Number(minutesBeforeWindow || 0)} min antes de vencer`;
    }
    const isoDate = fromDateTimeLocal(scheduledFor);
    return isoDate ? formatSchedule(isoDate) : 'Elegir hora';
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
    catalogProducts = [],
    buildApiHeaders,
    activeTenantId = ''
}) => {
    const { confirm } = useUiFeedback();
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
    const [messageBlocks, setMessageBlocks] = useState(() => buildMessageBlocksFromLegacy());
    const [quickReplySearch, setQuickReplySearch] = useState('');
    const [quickReplyPickerOpen, setQuickReplyPickerOpen] = useState(false);
    const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);

    const normalizedBlocks = useMemo(() => normalizeMessageBlocksForComposer(messageBlocks), [messageBlocks]);
    const firstMessageBlock = useMemo(() => (
        normalizedBlocks.find((block) => block.type === 'message') || null
    ), [normalizedBlocks]);
    const mediaAssets = useMemo(() => normalizeQuickReplyMediaAssets(firstMessageBlock?.attachments || form.mediaAssets, {
        url: form.mediaUrl,
        mimeType: form.mediaMimeType,
        fileName: form.mediaFileName,
        sizeBytes: form.mediaSizeBytes
    }), [firstMessageBlock, form.mediaAssets, form.mediaFileName, form.mediaMimeType, form.mediaSizeBytes, form.mediaUrl]);
    const variables = useMemo(() => ({
        cliente: text(activeChat?.name || activeChat?.displayName || activeChat?.phone),
        modulo: text(activeChat?.moduleName),
        telefono: text(activeChat?.phone)
    }), [activeChat]);
    const pendingItems = useMemo(() => items.filter((item) => String(item?.status || '') === 'pending'), [items]);
    const historyItems = useMemo(() => items.slice(0, 10), [items]);
    const filteredQuickReplies = useMemo(() => {
        const source = Array.isArray(quickReplies) ? quickReplies : [];
        const query = text(quickReplySearch).toLowerCase();
        if (!query) return source;
        return source
            .filter((item) => [
                item?.label,
                item?.name,
                item?.title,
                item?.text,
                item?.shortcut,
                item?.category
            ].some((value) => text(value).toLowerCase().includes(query)));
    }, [quickReplies, quickReplySearch]);
    const scheduleButtonLabel = useMemo(() => formatScheduleButtonLabel({
        scheduleType,
        scheduledFor,
        minutesBeforeWindow,
        windowExpiresAt
    }), [scheduleType, scheduledFor, minutesBeforeWindow, windowExpiresAt]);
    const hasRequiredContent = normalizedBlocks.some((block) => {
        if (block.type === 'message') return Boolean(text(block.text) || block.attachments?.length);
        if (block.type === 'delay') return false;
        if (block.type === 'product') return Boolean(text(block.sku));
        return block.type === 'catalog';
    });
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
        setMessageBlocks(buildMessageBlocksFromLegacy());
        setQuickReplySearch('');
        setQuickReplyPickerOpen(false);
        setSchedulePopoverOpen(false);
    };

    const requestClose = useCallback(async () => {
        if (saving) return;
        const shouldClose = await confirm({
            title: 'Descartar programacion',
            message: 'Estas saliendo de la programacion. Si cierras ahora se descartaran los cambios no programados y volveras al chat actual.',
            confirmText: 'Descartar',
            cancelText: 'Seguir editando',
            tone: 'warn'
        });
        if (!shouldClose) return;
        setQuickReplyPickerOpen(false);
        setSchedulePopoverOpen(false);
        onClose?.();
    }, [confirm, onClose, saving]);

    useEffect(() => {
        if (!isOpen) return;
        resetForm();
        loadItems();
    }, [isOpen, chatId, scopeModuleId]);

    useEffect(() => {
        if (!isOpen || !quickReplyPickerOpen) return undefined;
        const handlePointerDown = (event) => {
            if (event.target?.closest?.('.scheduled-message-modal__quick-reply-search')) return;
            setQuickReplyPickerOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown, true);
        return () => document.removeEventListener('mousedown', handlePointerDown, true);
    }, [isOpen, quickReplyPickerOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            if (document.querySelector('.message-sequence-composer__editor-overlay')) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            if (quickReplyPickerOpen) {
                setQuickReplyPickerOpen(false);
                return;
            }
            if (schedulePopoverOpen) {
                setSchedulePopoverOpen(false);
                return;
            }
            void requestClose();
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, quickReplyPickerOpen, requestClose, schedulePopoverOpen]);

    if (!isOpen) return null;

    const loadQuickReplyIntoForm = (item = null) => {
        if (item) {
            const assets = normalizeQuickReplyMediaAssets(item.mediaAssets, {
                url: item.mediaUrl,
                mimeType: item.mediaMimeType,
                fileName: item.mediaFileName,
                sizeBytes: item.mediaSizeBytes
            });
            const primaryMedia = assets[0] || null;
            setMessageText(String(item?.text || '').trim());
            setMessageBlocks(buildMessageBlocksFromLegacy({
                messageText: String(item?.text || '').trim(),
                mediaAssets: assets
            }));
            setForm({
                mediaAssets: assets,
                mediaUrl: primaryMedia?.url || '',
                mediaMimeType: primaryMedia?.mimeType || '',
                mediaFileName: primaryMedia?.fileName || '',
                mediaSizeBytes: primaryMedia?.sizeBytes || null
            });
            setQuickReplySearch('');
            setQuickReplyPickerOpen(false);
        }
    };

    const submit = async () => {
        if (!hasRequiredContent) {
            setError('Agrega texto o un adjunto para programar.');
            return;
        }
        if (!cancelOnCustomerReply) {
            const shouldContinue = await confirm({
                title: 'Enviar aunque responda',
                message: 'Este mensaje se enviara aunque el cliente responda antes. Usalo solo si debe salir si o si.',
                confirmText: 'Programar igual',
                cancelText: 'Volver a editar',
                tone: 'warn'
            });
            if (!shouldContinue) return;
        }
        const primaryMedia = mediaAssets[0] || null;
        const legacyText = String(firstMessageBlock?.text || messageText || '').trim();
        const payload = {
            chatId,
            scopeModuleId,
            messageText: legacyText,
            variables,
            messageBlocks: normalizedBlocks,
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
        setMessageBlocks(normalizeMessageBlocksForComposer(item?.messageBlocks, {
            messageText: String(item?.messageText || ''),
            mediaAssets: assets,
            mediaUrl: item?.mediaUrl,
            mediaMimeType: item?.mediaMimeType,
            mediaFileName: item?.mediaFileName
        }));
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
            className="saas-quick-reply-builder-overlay scheduled-message-modal__overlay"
            onClick={() => { void requestClose(); }}
        >
            <div
                className="saas-quick-reply-builder-shell scheduled-message-modal__shell"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="saas-quick-reply-builder-header">
                    <div>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CalendarClock size={19} /> Programar respuesta
                        </h4>
                        <small>{variables.cliente || 'Chat activo'} - se cancela si el cliente responde antes, salvo que lo desactives.</small>
                    </div>
                    <button type="button" className="saas-btn saas-btn--secondary scheduled-message-modal__close" disabled={saving} onClick={() => { void requestClose(); }}>Cerrar</button>
                </div>

                {error ? <div className="saas-meta-template-error" style={{ margin: '0 18px 10px' }}>{error}</div> : null}

                <div className="scheduled-message-modal__content">
                    <div style={{ minWidth: 0 }}>
                        <div className="scheduled-message-modal__topbar">
                            <div className="scheduled-message-modal__quick-reply-search">
                                <input
                                    type="search"
                                    className="saas-input"
                                    value={quickReplySearch}
                                    onChange={(event) => {
                                        setQuickReplySearch(event.target.value);
                                        setQuickReplyPickerOpen(true);
                                    }}
                                    onFocus={() => setQuickReplyPickerOpen(true)}
                                    placeholder="Buscar respuesta rapida para editar..."
                                    autoComplete="off"
                                    style={{ minHeight: '36px', width: '100%' }}
                                />
                                {quickReplyPickerOpen ? (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: 0,
                                            right: 0,
                                            top: 'calc(100% + 4px)',
                                            zIndex: 2147483001,
                                            maxHeight: '320px',
                                            overflow: 'auto',
                                            border: '1px solid var(--chat-card-border, #d9d3ca)',
                                            borderRadius: '8px',
                                            background: 'var(--chat-card-surface, #fff)',
                                            boxShadow: '0 16px 36px rgba(15, 23, 42, 0.18)',
                                            padding: '6px'
                                        }}
                                    >
                                        {(Array.isArray(quickReplies) ? quickReplies : []).length === 0 ? (
                                            <div style={{ padding: '10px', color: '#6b7280', fontSize: '0.82rem' }}>
                                                No hay respuestas rapidas disponibles para este modulo.
                                            </div>
                                        ) : filteredQuickReplies.length === 0 ? (
                                            <div style={{ padding: '10px', color: '#6b7280', fontSize: '0.82rem' }}>
                                                No se encontraron respuestas con esa busqueda.
                                            </div>
                                        ) : (
                                            filteredQuickReplies.map((item) => {
                                                const label = text(item?.label || item?.name || item?.title || 'Respuesta');
                                                const preview = text(item?.text || item?.body || '');
                                                const assets = normalizeQuickReplyMediaAssets(item?.mediaAssets, {
                                                    url: item?.mediaUrl,
                                                    mimeType: item?.mediaMimeType,
                                                    fileName: item?.mediaFileName,
                                                    sizeBytes: item?.mediaSizeBytes
                                                });
                                                return (
                                                    <button
                                                        key={String(item?.id || item?.label || label)}
                                                        type="button"
                                                        onMouseDown={(event) => event.preventDefault()}
                                                        onClick={() => loadQuickReplyIntoForm(item)}
                                                        style={{
                                                            width: '100%',
                                                            display: 'grid',
                                                            gap: '3px',
                                                            padding: '9px 10px',
                                                            border: 'none',
                                                            borderRadius: '7px',
                                                            background: 'transparent',
                                                            textAlign: 'left',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <span style={{ fontWeight: 800, color: '#111827' }}>{label}</span>
                                                        <span style={{ fontSize: '0.76rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {preview || (assets.length > 0 ? `${assets.length} adjunto(s)` : 'Sin texto')}
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                ) : null}
                            </div>
                            <div className="scheduled-message-modal__schedule-popover-wrap">
                                <button
                                    type="button"
                                    className="scheduled-message-modal__schedule-trigger"
                                    onClick={() => setSchedulePopoverOpen((prev) => !prev)}
                                    disabled={saving}
                                >
                                    <Clock size={16} />
                                    <span>{scheduleButtonLabel}</span>
                                    <ChevronDown size={15} />
                                </button>
                                {schedulePopoverOpen ? (
                                    <div className="scheduled-message-modal__schedule-popover">
                                        <div className="scheduled-message-modal__schedule-popover-head">
                                            <strong>Programacion</strong>
                                            <button type="button" onClick={() => setSchedulePopoverOpen(false)}>Cerrar</button>
                                        </div>
                                        <div className="scheduled-message-modal__mode-switch">
                                            <button type="button" className={scheduleType === 'absolute' ? 'is-active' : ''} onClick={() => setScheduleType('absolute')}>
                                                Hora exacta
                                            </button>
                                            <button type="button" className={scheduleType === 'before_window_expiry' ? 'is-active' : ''} onClick={() => setScheduleType('before_window_expiry')} disabled={!windowExpiresAt}>
                                                Antes de vencer
                                            </button>
                                        </div>
                                        <div className="scheduled-message-modal__schedule-row scheduled-message-modal__schedule-row--popover">
                                            {scheduleType === 'absolute' ? (
                                                <input
                                                    type="datetime-local"
                                                    value={scheduledFor}
                                                    onChange={(event) => setScheduledFor(event.target.value)}
                                                    className="saas-input"
                                                />
                                            ) : (
                                                <>
                                                    <div className="scheduled-message-modal__preset-grid">
                                                        {RELATIVE_PRESETS.map((preset) => (
                                                            <button
                                                                key={preset.value}
                                                                type="button"
                                                                className={minutesBeforeWindow === preset.value ? 'scheduled-message-modal__preset is-active' : 'scheduled-message-modal__preset'}
                                                                onClick={() => setMinutesBeforeWindow(preset.value)}
                                                            >
                                                                {preset.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <small>Vence: {windowExpiresAt ? formatSchedule(windowExpiresAt) : 'sin dato'}</small>
                                                </>
                                            )}
                                        </div>
                                        <div className="scheduled-message-modal__schedule-popover-actions">
                                            <button type="button" className="saas-btn saas-btn--primary scheduled-message-modal__primary" onClick={() => setSchedulePopoverOpen(false)}>
                                                Aplicar
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                            <label className="saas-admin-module-toggle scheduled-message-modal__cancel-toggle" title="Si lo desmarcas, se pedira confirmacion porque el mensaje saldra aunque el cliente responda antes.">
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

                        <MessageSequenceComposer
                            value={normalizedBlocks}
                            onChange={setMessageBlocks}
                            tenantId={activeTenantId}
                            disabled={saving}
                            capabilities={{
                                message: true,
                                media: true,
                                delay: true,
                                catalog: true,
                                product: true
                            }}
                            catalogProducts={catalogProducts}
                        />
                        <div className="scheduled-message-modal__actions">
                            <button type="button" className="saas-btn saas-btn--primary scheduled-message-modal__primary" disabled={saving || !hasRequiredContent} onClick={submit}>
                                {editingId ? 'Guardar programacion' : 'Programar respuesta'}
                            </button>
                            <button type="button" className="saas-btn saas-btn--secondary scheduled-message-modal__secondary" disabled={saving} onClick={resetForm}>
                                Limpiar
                            </button>
                        </div>
                    </div>

                    <aside className="scheduled-message-modal__history">
                        <div className="scheduled-message-modal__history-title">
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
