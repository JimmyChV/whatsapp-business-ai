import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock, X, Sparkles, Trash2, Pencil } from 'lucide-react';
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

const VARIABLE_CHIPS = [
    { label: 'Nombre', token: '{{cliente}}' },
    { label: 'Modulo', token: '{{modulo}}' },
    { label: 'Telefono', token: '{{telefono}}' }
];

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

function resolvePreview(text = '', variables = {}) {
    return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
        const value = variables[key];
        return value === null || value === undefined || value === '' ? match : String(value);
    });
}

const ScheduledMessageModal = ({
    isOpen,
    onClose,
    activeChat,
    quickReplies = [],
    buildApiHeaders
}) => {
    const chatId = String(activeChat?.id || '').trim();
    const scopeModuleId = String(activeChat?.scopeModuleId || '').trim().toLowerCase();
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

    const variables = useMemo(() => ({
        cliente: String(activeChat?.name || activeChat?.displayName || activeChat?.phone || '').trim(),
        modulo: String(activeChat?.moduleName || '').trim(),
        telefono: String(activeChat?.phone || '').trim()
    }), [activeChat]);
    const preview = useMemo(() => resolvePreview(messageText, variables), [messageText, variables]);
    const pendingItems = useMemo(() => items.filter((item) => String(item?.status || '') === 'pending'), [items]);

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

    useEffect(() => {
        if (!isOpen) return;
        setEditingId('');
        setMessageText('');
        setScheduleType('absolute');
        setScheduledFor(toDateTimeLocal());
        setMinutesBeforeWindow(60);
        setCancelOnCustomerReply(true);
        loadItems();
    }, [isOpen, chatId, scopeModuleId]);

    if (!isOpen) return null;

    const insertToken = (token = '') => setMessageText((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);
    const selectQuickReply = (event) => {
        const id = String(event.target.value || '');
        if (!id) return;
        const item = quickReplies.find((entry) => String(entry?.id || entry?.label || '') === id);
        if (item) setMessageText(String(item?.text || '').trim());
        event.target.value = '';
    };

    const resetForm = () => {
        setEditingId('');
        setMessageText('');
        setScheduleType('absolute');
        setScheduledFor(toDateTimeLocal());
        setMinutesBeforeWindow(60);
        setCancelOnCustomerReply(true);
    };

    const submit = async () => {
        if (!messageText.trim()) {
            setError('Escribe el mensaje a programar.');
            return;
        }
        const payload = {
            chatId,
            scopeModuleId,
            messageText,
            variables,
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
            await loadItems();
        } catch (err) {
            setError(String(err?.message || err));
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (item) => {
        setEditingId(String(item?.messageId || ''));
        setMessageText(String(item?.messageText || ''));
        setScheduleType(String(item?.scheduleType || 'absolute'));
        setScheduledFor(toDateTimeLocal(item?.scheduledFor));
        setMinutesBeforeWindow(Number(item?.minutesBeforeWindow || 60));
        setCancelOnCustomerReply(item?.cancelOnCustomerReply !== false);
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

    return (
        <div className="chat-lightbox" onClick={onClose} style={{ zIndex: 90 }}>
            <div
                className="chat-lightbox-content"
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: 'min(720px, calc(100vw - 28px))',
                    maxHeight: 'min(760px, calc(100vh - 28px))',
                    overflow: 'auto',
                    padding: 0,
                    background: '#fff',
                    color: '#111827',
                    borderRadius: '8px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CalendarClock size={22} />
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1rem' }}>Programar respuesta</div>
                            <div style={{ color: '#6b7280', fontSize: '0.82rem' }}>{variables.cliente || 'Chat activo'}</div>
                        </div>
                    </div>
                    <button type="button" className="btn-icon" onClick={onClose} title="Cerrar">
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: 'grid', gap: '14px', padding: '16px 18px' }}>
                    {error && <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', fontSize: '0.84rem' }}>{error}</div>}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select onChange={selectQuickReply} defaultValue="" style={{ minHeight: '36px', borderRadius: '8px', border: '1px solid #d1d5db', padding: '0 10px' }}>
                            <option value="">Usar respuesta rapida...</option>
                            {quickReplies.map((item) => (
                                <option key={String(item?.id || item?.label)} value={String(item?.id || item?.label || '')}>
                                    {String(item?.label || 'Respuesta')}
                                </option>
                            ))}
                        </select>
                        {VARIABLE_CHIPS.map((chip) => (
                            <button
                                key={chip.token}
                                type="button"
                                onClick={() => insertToken(chip.token)}
                                style={{ border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer' }}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>

                    <textarea
                        value={messageText}
                        onChange={(event) => setMessageText(event.target.value)}
                        rows={5}
                        placeholder="Escribe el mensaje que se enviara despues..."
                        style={{ width: '100%', resize: 'vertical', borderRadius: '8px', border: '1px solid #d1d5db', padding: '12px', font: 'inherit' }}
                    />

                    <div style={{ padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', whiteSpace: 'pre-wrap', color: '#374151', fontSize: '0.88rem' }}>
                        {preview || 'Vista previa'}
                    </div>

                    <div style={{ display: 'grid', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setScheduleType('absolute')}
                                style={{ border: '1px solid #d1d5db', background: scheduleType === 'absolute' ? '#dcfce7' : '#fff', borderRadius: '8px', padding: '9px 12px', cursor: 'pointer' }}
                            >
                                Hora exacta
                            </button>
                            <button
                                type="button"
                                onClick={() => setScheduleType('before_window_expiry')}
                                disabled={!windowExpiresAt}
                                style={{ border: '1px solid #d1d5db', background: scheduleType === 'before_window_expiry' ? '#dcfce7' : '#fff', borderRadius: '8px', padding: '9px 12px', cursor: windowExpiresAt ? 'pointer' : 'not-allowed', opacity: windowExpiresAt ? 1 : 0.55 }}
                            >
                                Antes de vencer
                            </button>
                        </div>

                        {scheduleType === 'absolute' ? (
                            <input
                                type="datetime-local"
                                value={scheduledFor}
                                onChange={(event) => setScheduledFor(event.target.value)}
                                style={{ width: 'fit-content', minHeight: '38px', borderRadius: '8px', border: '1px solid #d1d5db', padding: '0 10px' }}
                            />
                        ) : (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {RELATIVE_PRESETS.map((preset) => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        onClick={() => setMinutesBeforeWindow(preset.value)}
                                        style={{ border: '1px solid #d1d5db', background: minutesBeforeWindow === preset.value ? '#dcfce7' : '#fff', borderRadius: '8px', padding: '9px 12px', cursor: 'pointer' }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                                <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>
                                    Vence: {windowExpiresAt ? formatSchedule(windowExpiresAt) : 'sin dato'}
                                </span>
                            </div>
                        )}
                    </div>

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                        <input
                            type="checkbox"
                            checked={cancelOnCustomerReply}
                            onChange={(event) => setCancelOnCustomerReply(event.target.checked)}
                        />
                        Cancelar si el cliente responde antes
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        {editingId && (
                            <button type="button" onClick={resetForm} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer' }}>
                                Nuevo
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={submit}
                            disabled={saving || !messageText.trim()}
                            style={{ border: '1px solid #16a34a', background: '#16a34a', color: '#fff', borderRadius: '8px', padding: '10px 16px', cursor: saving ? 'wait' : 'pointer', opacity: saving || !messageText.trim() ? 0.65 : 1 }}
                        >
                            {editingId ? 'Guardar cambios' : 'Programar'}
                        </button>
                    </div>

                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 800 }}>
                            <Clock size={17} /> Pendientes ({pendingItems.length})
                        </div>
                        {loading ? (
                            <div style={{ color: '#6b7280', fontSize: '0.86rem' }}>Cargando...</div>
                        ) : pendingItems.length === 0 ? (
                            <div style={{ color: '#6b7280', fontSize: '0.86rem' }}>No hay mensajes pendientes para este chat.</div>
                        ) : (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {pendingItems.map((item) => (
                                    <div key={item.messageId} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', display: 'grid', gap: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                            <strong style={{ fontSize: '0.88rem' }}>{formatSchedule(item.scheduledFor)}</strong>
                                            <span style={{ color: '#16a34a', fontSize: '0.78rem', fontWeight: 800 }}>pendiente</span>
                                        </div>
                                        <div style={{ color: '#374151', fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {item.messageText}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button type="button" onClick={() => startEdit(item)} title="Reprogramar" style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer' }}>
                                                <Pencil size={15} />
                                            </button>
                                            <button type="button" onClick={() => cancelItem(item)} title="Cancelar programacion" style={{ border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer' }}>
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduledMessageModal;
