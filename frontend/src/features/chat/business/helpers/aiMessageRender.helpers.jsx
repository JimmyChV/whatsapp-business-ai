import React from 'react';
import { MessageSquare, Send } from 'lucide-react';

export const renderAiMessageWithSendAction = (content = '', onSendToClient, repairMojibakeFn) => {
    const panelStyle = {
        marginTop: '8px',
        background: 'var(--chat-success-surface)',
        border: '1px solid var(--chat-success-border)',
        borderRadius: '8px',
        padding: '10px 12px'
    };
    const headerStyle = {
        fontSize: '0.78rem',
        color: 'var(--chat-success-text)',
        marginBottom: '6px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontWeight: 700
    };
    const buttonStyle = {
        marginTop: '8px',
        background: 'var(--saas-accent-primary)',
        color: 'var(--saas-accent-primary-text)',
        border: '1px solid color-mix(in srgb, var(--saas-accent-primary) 70%, transparent)',
        borderRadius: '8px',
        padding: '7px 14px',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 10px 22px color-mix(in srgb, var(--saas-accent-primary) 18%, transparent)'
    };
    const safeRepair = typeof repairMojibakeFn === 'function' ? repairMojibakeFn : (value) => String(value || '');
    const parts = safeRepair(content).split(/(\[MENSAJE:[\s\S]*?\])/g);
    return parts.map((part, index) => {
        const match = part.match(/\[MENSAJE:\s*([\s\S]+?)\]/);
        if (match) {
            const message = String(match[1] || '').trim();
            return (
                <div key={index} style={panelStyle}>
                    <div style={headerStyle}>
                        <MessageSquare size={11} /> MENSAJE LISTO PARA ENVIAR
                    </div>
                    <div
                        style={{
                            fontSize: '0.85rem',
                            color: 'var(--text-primary)',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.4'
                        }}
                    >
                        {message}
                    </div>
                    <button onClick={() => onSendToClient?.(message)} style={buttonStyle}>
                        <Send size={13} /> Enviar al cliente
                    </button>
                </div>
            );
        }
        return (
            <span key={index} style={{ whiteSpace: 'pre-wrap' }}>
                {part}
            </span>
        );
    });
};
