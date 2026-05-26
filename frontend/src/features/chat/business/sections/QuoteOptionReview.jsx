import React, { useEffect, useState } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

function formatMoney1(value = 0) {
    const amount = Number(value) || 0;
    return amount.toFixed(1);
}

function buildDefaultMessage(options = [], total = 0) {
    const safeOptions = Array.isArray(options) ? options : [];
    const lines = safeOptions.map((option) => {
        const items = Array.isArray(option?.items)
            ? option.items.map((item) => `- ${item.title || 'Producto'} x${item.qty || 1} - S/ ${formatMoney1(item.lineTotal || 0)}`).join('\n')
            : '';
        const delivery = option?.summary?.deliveryFree
            ? 'Gratis'
            : `S/ ${formatMoney1(option?.summary?.deliveryAmount || 0)}`;
        return `*Opcion ${option?.optionNumber || 1} - S/ ${formatMoney1(option?.summary?.totalPayable || 0)}*\n${items}\nDelivery: ${delivery}`;
    }).join('\n\n');

    return `Hola! Te preparo ${total || safeOptions.length} opciones:\n\n${lines}\n\nCual te interesa?`;
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

    useEffect(() => {
        setFinalMessage(buildDefaultMessage(options, totalOptions));
    }, [options, totalOptions]);

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
        socket.emit('send_option_group', {
            chatId,
            tenantId,
            options,
            finalMessage
        }, (ack = {}) => {
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

            {options.map((option) => (
                <div key={`review_option_${option.optionNumber}`} style={{ background: 'var(--chat-card-surface-alt)', border: '1px solid var(--chat-card-border)', borderRadius: '10px', padding: '10px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                        <strong style={{ color: 'var(--text-primary)', display: 'block' }}>Opcion {option.optionNumber}</strong>
                        <div style={{ color: 'var(--chat-control-text-soft)', fontSize: '0.75rem', marginTop: '4px' }}>{Array.isArray(option.items) ? option.items.length : 0} producto(s)</div>
                    </div>
                    <span style={{ color: 'var(--chat-price-text)', fontWeight: 900 }}>S/ {formatMoney1(option?.summary?.totalPayable || 0)}</span>
                </div>
            ))}

            <textarea
                rows={8}
                value={finalMessage}
                onChange={(event) => setFinalMessage(event.target.value)}
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
