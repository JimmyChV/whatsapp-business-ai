import { useEffect, useMemo, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';

const QUICK_PROMPTS = [
    'Dame 3 respuestas sugeridas para este cliente',
    'Genera 3 cotizaciones con enfoque: entrada, equilibrio y premium',
    'Recomienda upsell y cross sell segun este contexto',
    'Maneja objecion de precio enfocando valor y rendimiento',
    'Propone un cierre elegante para concretar hoy'
];

function normalizePattyMessages(pattySuggestion = null) {
    const pattyMessages = Array.isArray(pattySuggestion?.messages)
        ? pattySuggestion.messages
            .map((item) => ({
                text: String(item?.text || '').trim(),
                quotedMessageId: String(item?.quotedMessageId || '').trim() || null
            }))
            .filter((item) => item.text)
        : [];
    const fallbackSuggestion = String(pattySuggestion?.suggestion || '').trim();
    return pattyMessages.length
        ? pattyMessages
        : (fallbackSuggestion ? [{ text: fallbackSuggestion, quotedMessageId: null }] : []);
}

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
    canWriteByAssignment = false,
    pattySuggestion = null,
    onUsePattySuggestion = null,
    onUsePattySuggestionMessage = null,
    onDismissPattySuggestion = null,
    onGeneratePattyQuote = null,
    enablePatty = true,
    enableCopilot = true
}) {
    const pattyEnabled = enablePatty !== false;
    const copilotEnabled = enableCopilot !== false;
    const visiblePattyMessages = useMemo(() => normalizePattyMessages(pattySuggestion), [pattySuggestion]);
    const hasPattySuggestion = visiblePattyMessages.length > 0;
    const hasQuoteRequest = Boolean(pattySuggestion?.quoteRequest);
    const showTabs = pattyEnabled && copilotEnabled;
    const [activeInnerTab, setActiveInnerTab] = useState(pattyEnabled ? 'patty' : 'copilot');

    useEffect(() => {
        if (activeInnerTab === 'patty' && !pattyEnabled) setActiveInnerTab('copilot');
        if (activeInnerTab === 'copilot' && !copilotEnabled) setActiveInnerTab('patty');
    }, [activeInnerTab, copilotEnabled, pattyEnabled]);

    const renderPattyPanel = () => (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!hasPattySuggestion && (
                <div
                    style={{
                        border: '1px dashed var(--chat-card-border)',
                        background: 'var(--chat-card-surface)',
                        color: 'var(--chat-control-text-soft)',
                        borderRadius: '16px',
                        padding: '18px 14px',
                        fontSize: '0.82rem',
                        textAlign: 'center'
                    }}
                >
                    Esperando mensaje del cliente...
                </div>
            )}
            {hasPattySuggestion && (
                <div
                    style={{
                        padding: '12px',
                        borderRadius: '16px',
                        border: '1px solid var(--saas-accent-primary)',
                        background: 'color-mix(in srgb, var(--saas-accent-primary) 10%, var(--chat-card-surface))',
                        boxShadow: '0 10px 24px rgba(0,0,0,0.08)',
                        color: 'var(--text-primary)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.78rem', marginBottom: '8px' }}>
                        <Sparkles size={14} />
                        {pattySuggestion.assistantName || 'Patty'} sugiere{visiblePattyMessages.length > 1 ? ` (${visiblePattyMessages.length} mensajes)` : ''}:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {visiblePattyMessages.map((message, index) => (
                            <div
                                key={`${message.quotedMessageId || 'patty'}-${index}`}
                                style={{
                                    padding: '9px 10px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--chat-card-border)',
                                    background: 'var(--chat-card-surface)',
                                    fontSize: '0.82rem',
                                    lineHeight: 1.45,
                                    whiteSpace: 'pre-wrap',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <div>{message.text}</div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => onUsePattySuggestionMessage?.(index)}
                                        disabled={!canWriteByAssignment}
                                        style={{
                                            border: '1px solid var(--saas-accent-primary)',
                                            background: 'var(--chat-card-surface)',
                                            color: 'var(--saas-accent-primary)',
                                            borderRadius: '999px',
                                            padding: '4px 9px',
                                            cursor: canWriteByAssignment ? 'pointer' : 'not-allowed',
                                            fontWeight: 800,
                                            fontSize: '0.7rem',
                                            opacity: canWriteByAssignment ? 1 : 0.7
                                        }}
                                    >
                                        Usar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={onDismissPattySuggestion}
                            style={{
                                border: '1px solid var(--chat-card-border)',
                                background: 'var(--chat-card-surface)',
                                color: 'var(--chat-control-text-soft)',
                                borderRadius: '999px',
                                padding: '5px 10px',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.72rem'
                            }}
                        >
                            Descartar
                        </button>
                        {hasQuoteRequest && (
                            <button
                                type="button"
                                onClick={onGeneratePattyQuote}
                                disabled={!canWriteByAssignment}
                                style={{
                                    border: '1px solid var(--saas-accent-primary)',
                                    background: canWriteByAssignment ? 'var(--saas-accent-primary)' : 'var(--chat-control-disabled)',
                                    color: 'white',
                                    borderRadius: '999px',
                                    padding: '5px 10px',
                                    cursor: canWriteByAssignment ? 'pointer' : 'not-allowed',
                                    fontWeight: 800,
                                    fontSize: '0.72rem',
                                    opacity: canWriteByAssignment ? 1 : 0.75
                                }}
                            >
                                Generar cotizacion
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onUsePattySuggestion}
                            disabled={!canWriteByAssignment}
                            style={{
                                border: '1px solid var(--saas-accent-primary)',
                                background: canWriteByAssignment ? 'var(--saas-accent-primary)' : 'var(--chat-control-disabled)',
                                color: 'white',
                                borderRadius: '999px',
                                padding: '5px 10px',
                                cursor: canWriteByAssignment ? 'pointer' : 'not-allowed',
                                fontWeight: 800,
                                fontSize: '0.72rem',
                                opacity: canWriteByAssignment ? 1 : 0.75
                            }}
                        >
                            {visiblePattyMessages.length > 1 ? 'Usar todos' : 'Usar respuesta'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    const renderCopilotPanel = () => (
        <>
            <div className="ai-thread-pro" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {aiMessages.map((msg, idx) => (
                    <div key={idx} className={`ai-row-pro ${msg.role === 'user' ? 'user' : 'assistant'}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div
                            className={`ai-bubble-pro ${msg.role === 'user' ? 'user' : 'assistant'}`}
                            style={{
                                maxWidth: '92%',
                                padding: '9px 12px',
                                borderRadius: msg.role === 'user' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                                background: msg.role === 'user' ? 'var(--outgoing-msg-bg)' : 'var(--chat-card-surface)',
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
                        <div style={{ background: 'var(--chat-card-surface)', borderRadius: '2px 12px 12px 12px', padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--chat-control-text-soft)', animation: 'bounce 1.4s ease-in-out infinite' }} />
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--chat-control-text-soft)', animation: 'bounce 1.4s ease-in-out 0.2s infinite' }} />
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--chat-control-text-soft)', animation: 'bounce 1.4s ease-in-out 0.4s infinite' }} />
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
                        style={{ background: 'var(--chat-card-surface)', border: '1px solid var(--chat-card-border)', color: 'var(--chat-control-text-soft)', padding: '4px 9px', borderRadius: '14px', fontSize: '0.72rem', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', opacity: canWriteByAssignment ? 1 : 0.75 }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--saas-accent-primary)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                    >
                        {chip}
                    </button>
                ))}
            </div>

            <div className="ai-assistant-input-row ai-input-row-pro" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, background: 'var(--chat-card-surface)' }}>
                <input
                    type="text"
                    placeholder="Pregunta algo a la IA..."
                    value={aiInput}
                    disabled={!canWriteByAssignment}
                    onChange={e => setAiInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAiMessage()}
                    className="ai-assistant-input ai-assistant-input-pro"
                    style={{ flex: 1, background: 'var(--chat-control-surface-strong)', border: '1px solid var(--chat-card-border)', outline: 'none', color: 'var(--text-primary)', borderRadius: '20px', padding: '8px 14px', fontSize: '0.82rem' }}
                />
                <button
                    onClick={sendAiMessage}
                    disabled={!canWriteByAssignment || isAiLoading || !aiInput.trim()}
                    className="ai-assistant-send ai-assistant-send-pro"
                    style={{ background: !canWriteByAssignment ? 'var(--chat-control-disabled)' : (isAiLoading ? 'var(--chat-control-surface)' : 'var(--saas-accent-primary)'), border: 'none', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!canWriteByAssignment || isAiLoading) ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: canWriteByAssignment ? 1 : 0.75 }}
                >
                    <Send size={16} color="white" />
                </button>
            </div>
        </>
    );

    return (
        <div className="ai-tab-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {showTabs && (
                <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', borderBottom: '1px solid var(--border-color)', background: 'var(--chat-card-surface)' }}>
                    <button
                        type="button"
                        onClick={() => setActiveInnerTab('patty')}
                        style={{
                            flex: 1,
                            border: `1px solid ${activeInnerTab === 'patty' ? 'var(--saas-accent-primary)' : 'var(--chat-card-border)'}`,
                            background: activeInnerTab === 'patty' ? 'color-mix(in srgb, var(--saas-accent-primary) 13%, var(--chat-card-surface))' : 'var(--chat-card-surface)',
                            color: 'var(--text-primary)',
                            borderRadius: '999px',
                            padding: '7px 10px',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}
                    >
                        💡 Patty
                        {hasPattySuggestion && (
                            <span style={{ marginLeft: '6px', background: 'var(--saas-accent-primary)', color: 'white', borderRadius: '999px', padding: '1px 6px', fontSize: '0.68rem' }}>
                                {visiblePattyMessages.length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveInnerTab('copilot')}
                        style={{
                            flex: 1,
                            border: `1px solid ${activeInnerTab === 'copilot' ? 'var(--saas-accent-primary)' : 'var(--chat-card-border)'}`,
                            background: activeInnerTab === 'copilot' ? 'color-mix(in srgb, var(--saas-accent-primary) 13%, var(--chat-card-surface))' : 'var(--chat-card-surface)',
                            color: 'var(--text-primary)',
                            borderRadius: '999px',
                            padding: '7px 10px',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}
                    >
                        💬 Copiloto
                    </button>
                </div>
            )}
            {pattyEnabled && (!showTabs || activeInnerTab === 'patty') && renderPattyPanel()}
            {copilotEnabled && (!showTabs || activeInnerTab === 'copilot') && renderCopilotPanel()}
        </div>
    );
}
