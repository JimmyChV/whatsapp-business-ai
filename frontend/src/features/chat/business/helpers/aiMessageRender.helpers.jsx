import React from 'react';
import { MessageSquare, Send } from 'lucide-react';

export const renderAiMessageWithSendAction = (content = '', onSendToClient, repairMojibakeFn) => {
    const safeRepair = typeof repairMojibakeFn === 'function' ? repairMojibakeFn : (value) => String(value || '');
    const parts = safeRepair(content).split(/(\[MENSAJE:[\s\S]*?\])/g);
    return parts.map((part, index) => {
        const match = part.match(/\[MENSAJE:\s*([\s\S]+?)\]/);
        if (match) {
            const message = String(match[1] || '').trim();
            return (
                <div
                    key={index}
                    style={{
                        marginTop: '8px',
                        background: 'rgba(0,168,132,0.12)',
                        border: '1px solid rgba(0,168,132,0.3)',
                        borderRadius: '8px',
                        padding: '10px 12px'
                    }}
                >
                    <div
                        style={{
                            fontSize: '0.78rem',
                            color: '#00a884',
                            marginBottom: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
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
                    <button
                        onClick={() => onSendToClient?.(message)}
                        style={{
                            marginTop: '8px',
                            background: '#00a884',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
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
