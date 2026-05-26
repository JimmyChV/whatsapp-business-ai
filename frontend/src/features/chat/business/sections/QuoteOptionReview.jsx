import React, { useEffect, useRef, useState } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

function formatMoney1(value = 0) {
    const amount = Number(value) || 0;
    return amount.toFixed(1);
}

function buildDefaultMessage(options = [], total = 0) {
    const safeOptions = Array.isArray(options) ? options : [];
    const count = total || safeOptions.length;
    return `Hola. Te preparé ${count} opciones para que elijas la que más te convenga.\n\nRevisa las alternativas y dime cuál prefieres tocando uno de los botones.`;
}

function formatDelivery(summary = {}) {
    return summary?.deliveryFree
        ? 'Gratis'
        : `S/ ${formatMoney1(summary?.deliveryAmount || 0)}`;
}

function formatDiscount(summary = {}) {
    const discount = Number(summary?.discount || summary?.globalDiscount?.applied || 0) || 0;
    return discount > 0 ? `S/ ${formatMoney1(discount)}` : 'Sin desc.';
}

export default function QuoteOptionReview({
    socket,
    options = [],
    totalOptions = 0,
    chatId = '',
    tenantId = 'default',
    onSent,
    onBack
}) {
    const { notify } = useUiFeedback();
    const [finalMessage, setFinalMessage] = useState(() => buildDefaultMessage(options, totalOptions));
    const [sending, setSending] = useState(false);
    const [expandedOption, setExpandedOption] = useState(() => Number(options?.[0]?.optionNumber || 1) || 1);
    const [messageTouched, setMessageTouched] = useState(false);
    const sendTimeoutRef = useRef(null);

    useEffect(() => {
        if (!messageTouched) {
            setFinalMessage(buildDefaultMessage(options, totalOptions));
        }
    }, [options, totalOptions, messageTouched]);

    useEffect(() => () => {
        if (sendTimeoutRef.current) {
            clearTimeout(sendTimeoutRef.current);
        }
    }, []);

    const handleSend = () => {
        if (!socket || typeof socket.emit !== 'function') {
            notify({ type: 'warn', message: 'El socket no esta disponible para enviar las opciones.' });
            return;
        }
        if (!String(chatId || '').trim()) {
            notify({ type: 'warn', message: 'Selecciona un chat antes de enviar las opciones.' });
            return;
        }
        if (!Array.isArray(options) || options.length === 0) {
            notify({ type: 'warn', message: 'No hay opciones listas para enviar.' });
            return;
        }

        setSending(true);
        if (sendTimeoutRef.current) {
            clearTimeout(sendTimeoutRef.current);
        }
        sendTimeoutRef.current = setTimeout(() => {
            setSending(false);
            notify({ type: 'warn', message: 'El envio demoro demasiado. Revisa el backend y vuelve a intentar.' });
        }, 15000);
        socket.emit('send_option_group', {
            chatId,
            tenantId,
            options,
            finalMessage
        }, (ack = {}) => {
            if (sendTimeoutRef.current) {
                clearTimeout(sendTimeoutRef.current);
                sendTimeoutRef.current = null;
            }
            setSending(false);
            if (!ack?.ok) {
                notify({ type: 'warn', message: String(ack?.error || 'No se pudieron enviar las opciones.') });
                return;
            }
            if (typeof onSent === 'function') onSent(ack);
        });
    };

    return (
        <div style={{ background: 'var(--chat-card-surface)', border: '1px solid var(--chat-card-border)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={onBack} style={{ border: '1px solid var(--chat-control-border)', background: 'var(--chat-control-surface)', color: 'var(--text-primary)', borderRadius: '999px', padding: '7px 11px', fontWeight: 700, cursor: 'pointer' }}>
                    Volver
                </button>
                <span style={{ color: 'var(--text-primary)', fontWeight: 900, fontSize: '0.9rem' }}>Revisar y enviar</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {options.map((option) => {
                    const optionNumber = Number(option?.optionNumber || 0) || 1;
                    const isExpanded = expandedOption === optionNumber;
                    const summary = option?.summary || {};
                    const items = Array.isArray(option?.items) ? option.items : [];
                    return (
                        <div key={`review_option_${optionNumber}`} style={{ background: 'var(--chat-card-surface-alt)', border: '1px solid var(--chat-card-border)', borderRadius: '12px', overflow: 'hidden' }}>
                            <button
                                type="button"
                                onClick={() => setExpandedOption((prev) => (prev === optionNumber ? 0 : optionNumber))}
                                style={{ width: '100%', border: 'none', background: 'transparent', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer', textAlign: 'left' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '10px' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <strong style={{ color: 'var(--text-primary)', display: 'block', fontSize: '0.9rem' }}>Opción {optionNumber}</strong>
                                        <div style={{ color: 'var(--chat-control-text-soft)', fontSize: '0.74rem', marginTop: '4px' }}>
                                            {items.length} producto(s)
                                        </div>
                                    </div>
                                    <span style={{ color: 'var(--chat-price-text)', fontWeight: 900, fontSize: '1rem' }}>
                                        S/ {formatMoney1(summary?.totalPayable || 0)}
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                                    <div style={{ background: 'var(--chat-control-surface-strong)', border: '1px solid var(--chat-control-border)', borderRadius: '10px', padding: '8px' }}>
                                        <div style={{ color: 'var(--chat-control-text-soft)', fontSize: '0.68rem', textTransform: 'uppercase' }}>Descuento</div>
                                        <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.78rem', marginTop: '4px' }}>{formatDiscount(summary)}</div>
                                    </div>
                                    <div style={{ background: 'var(--chat-control-surface-strong)', border: '1px solid var(--chat-control-border)', borderRadius: '10px', padding: '8px' }}>
                                        <div style={{ color: 'var(--chat-control-text-soft)', fontSize: '0.68rem', textTransform: 'uppercase' }}>Delivery</div>
                                        <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.78rem', marginTop: '4px' }}>{formatDelivery(summary)}</div>
                                    </div>
                                    <div style={{ background: 'var(--chat-control-surface-strong)', border: '1px solid var(--chat-control-border)', borderRadius: '10px', padding: '8px' }}>
                                        <div style={{ color: 'var(--chat-control-text-soft)', fontSize: '0.68rem', textTransform: 'uppercase' }}>Subtotal</div>
                                        <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.78rem', marginTop: '4px' }}>S/ {formatMoney1(summary?.subtotal || 0)}</div>
                                    </div>
                                </div>
                            </button>

                            {isExpanded && (
                                <div style={{ borderTop: '1px solid var(--chat-card-border)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {items.map((item, index) => (
                                        <div key={`option_${optionNumber}_item_${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px', alignItems: 'start' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.78rem', lineHeight: 1.35 }}>
                                                    {item?.title || 'Producto'}
                                                </div>
                                                <div style={{ color: 'var(--chat-control-text-soft)', fontSize: '0.72rem', marginTop: '3px' }}>
                                                    Cantidad: {item?.qty || 1}
                                                </div>
                                            </div>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                                                S/ {formatMoney1(item?.lineTotal || 0)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <textarea
                rows={8}
                value={finalMessage}
                onChange={(event) => {
                    setMessageTouched(true);
                    setFinalMessage(event.target.value);
                }}
                style={{ width: '100%', resize: 'vertical', minHeight: '160px', background: 'var(--chat-control-surface-strong)', border: '1px solid var(--chat-control-border)', color: 'var(--text-primary)', borderRadius: '12px', padding: '12px', fontSize: '0.8rem', lineHeight: 1.5, outline: 'none' }}
            />

            <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                style={{ width: '100%', border: '1px solid var(--saas-accent-primary)', background: 'var(--saas-accent-primary)', color: 'var(--saas-accent-primary-text)', borderRadius: '12px', padding: '11px 14px', fontWeight: 900, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.75 : 1 }}
            >
                {sending ? 'Enviando...' : `Enviar ${totalOptions || options.length} opciones al cliente`}
            </button>
        </div>
    );
}
