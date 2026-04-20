import { Send, Sparkles } from 'lucide-react';

const QUICK_PROMPTS = [
    'Dame 3 respuestas sugeridas para este cliente',
    'Genera 3 cotizaciones con enfoque: entrada, equilibrio y premium',
    'Recomienda upsell y cross sell segun este contexto',
    'Maneja objecion de precio enfocando valor y rendimiento',
    'Propone un cierre elegante para concretar hoy'
];

export default function BusinessAiTabSection({
    aiMessages = [],
    isAiLoading = false,
    sendToClient,
    renderAiMessageWithSendAction,
    repairMojibake,
    aiEndRef,
    setAiInput,
    sendAiMessage,
    aiInput = '',
    canWriteByAssignment = false
}) {
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="ai-thread-pro" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {aiMessages.map((msg, idx) => (
                    <div key={idx} className={`ai-row-pro ${msg.role === 'user' ? 'user' : 'assistant'}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div
                            className={`ai-bubble-pro ${msg.role === 'user' ? 'user' : 'assistant'}`}
                            style={{
                                maxWidth: '92%',
                                padding: '9px 12px',
                                borderRadius: msg.role === 'user' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                                background: msg.role === 'user' ? '#005c4b' : '#202c33',
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                lineHeight: '1.45',
                                position: 'relative'
                            }}
                        >
                            {msg.role === 'assistant'
                                ? renderAiMessageWithSendAction(msg.content, sendToClient, repairMojibake)
                                : msg.content}
                            {msg.streaming && (
                                <span style={{ display: 'inline-block', width: '6px', height: '12px', background: 'var(--text-primary)', marginLeft: '3px', animation: 'blink 0.8s step-end infinite' }} />
                            )}
                            {msg.role === 'assistant' && !msg.streaming && msg.content.length > 30 && !msg.content.includes('[MENSAJE:') && (
                                <button
                                    onClick={() => sendToClient(msg.content)}
                                    title="Enviar este mensaje al cliente"
                                    className="ai-use-reply-btn"
                                    disabled={!canWriteByAssignment}
                                    style={{ opacity: canWriteByAssignment ? 1 : 0.7, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
                                >
                                    <Send size={10} /> Usar como respuesta
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {isAiLoading && aiMessages[aiMessages.length - 1]?.role !== 'assistant' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{ background: '#202c33', borderRadius: '2px 12px 12px 12px', padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out infinite' }} />
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out 0.2s infinite' }} />
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out 0.4s infinite' }} />
                            </div>
                        </div>
                    </div>
                )}
                <div ref={aiEndRef} />
            </div>

            <div className="ai-quick-prompts ai-quick-prompts-pro" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '6px', flexShrink: 0 }}>
                <div className="ai-quick-prompts-title">
                    <Sparkles size={12} />
                    Atajos IA
                </div>
                {QUICK_PROMPTS.map((chip, i) => (
                    <button
                        key={i}
                        className="ai-prompt-chip ai-prompt-chip-pro"
                        onClick={() => { setAiInput(chip); }}
                        disabled={!canWriteByAssignment}
                        style={{ background: '#202c33', border: '1px solid var(--border-color)', color: '#8696a0', padding: '4px 9px', borderRadius: '14px', fontSize: '0.72rem', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', opacity: canWriteByAssignment ? 1 : 0.75 }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#00a884'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                    >
                        {chip}
                    </button>
                ))}
            </div>

            <div className="ai-assistant-input-row ai-input-row-pro" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, background: '#202c33' }}>
                <input
                    type="text"
                    placeholder="Pregunta algo a la IA..."
                    value={aiInput}
                    disabled={!canWriteByAssignment}
                    onChange={e => setAiInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAiMessage()}
                    className="ai-assistant-input ai-assistant-input-pro"
                    style={{ flex: 1, background: '#2a3942', border: 'none', outline: 'none', color: 'var(--text-primary)', borderRadius: '20px', padding: '8px 14px', fontSize: '0.82rem' }}
                />
                <button
                    onClick={sendAiMessage}
                    disabled={!canWriteByAssignment || isAiLoading || !aiInput.trim()}
                    className="ai-assistant-send ai-assistant-send-pro"
                    style={{ background: !canWriteByAssignment ? '#3f474b' : (isAiLoading ? '#3b4a54' : '#00a884'), border: 'none', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!canWriteByAssignment || isAiLoading) ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: canWriteByAssignment ? 1 : 0.75 }}
                >
                    <Send size={16} color="white" />
                </button>
            </div>
        </div>
    );
}
