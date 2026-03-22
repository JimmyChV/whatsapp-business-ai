import React from 'react';
import { Bot, Sparkles, Send, X } from 'lucide-react';
import moment from 'moment';

const CopilotView = ({
    messages,
    inputText,
    setInputText,
    onSendMessage,
    onClose,
    messagesEndRef
}) => {
    return (
        <div className="copilot-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)' }}>
            <div style={{ padding: '15px 20px', background: 'var(--ai-bg)', borderBottom: '1px solid var(--ai-accent)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={18} color="var(--ai-accent)" />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Copiloto de Inventario</span>
                <button
                    onClick={onClose}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                    <X size={20} />
                </button>
            </div>
            <div className="chat-messages">
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                        <Bot size={48} style={{ opacity: 0.2, marginBottom: '10px' }} />
                        <p>Pregúntame sobre el catálogo o pide 3 opciones para un problema de un cliente.</p>
                    </div>
                )}
                {messages.map((m, idx) => (
                    <div
                        key={idx}
                        className={`message ${m.from === 'me' ? 'out' : 'in'}`}
                        style={m.from === 'ai' ? { background: 'rgba(138,43,226,0.15)', borderLeft: '3px solid var(--ai-accent)' } : {}}
                    >
                        <div className="message-body" style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                        <span className="message-time">{moment.unix(m.timestamp).format('HH:mm')}</span>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="chat-input-area" style={{ background: 'transparent' }}>
                <div className="input-container">
                    <input
                        className="message-input"
                        placeholder="Pregunta algo al copiloto..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onSendMessage()}
                    />
                </div>
                <button className="send-button" style={{ background: 'var(--ai-accent)' }} onClick={onSendMessage}>
                    <Send size={20} />
                </button>
            </div>
        </div>
    );
};

export default CopilotView;
