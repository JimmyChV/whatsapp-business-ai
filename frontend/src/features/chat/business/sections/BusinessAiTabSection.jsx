import { useCallback, useEffect, useMemo, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { API_URL } from '../../../../config/runtime';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

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

function normalizePattyMode(value = '') {
    const mode = String(value || '').trim().toLowerCase();
    return ['autonomous', 'review', 'off'].includes(mode) ? mode : '';
}

function firstPattyMode(...values) {
    for (const value of values) {
        const mode = normalizePattyMode(value);
        if (mode) return mode;
    }
    return '';
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
    enableCopilot = true,
    activeTenantId = '',
    activeChatId = '',
    activeScopeModuleId = '',
    activeChatAssignment = null,
    activeChatCommercialStatus = null,
    activeAiConfig = {},
    chatAssignmentState = null,
    buildApiHeaders = null
}) {
    const { notify } = useUiFeedback();
    const pattyEnabled = enablePatty !== false;
    const copilotEnabled = enableCopilot !== false;
    const visiblePattyMessages = useMemo(() => normalizePattyMessages(pattySuggestion), [pattySuggestion]);
    const hasPattySuggestion = visiblePattyMessages.length > 0;
    const hasQuoteRequest = Boolean(pattySuggestion?.quoteRequest);
    const showTabs = pattyEnabled && copilotEnabled;
    const [activeInnerTab, setActiveInnerTab] = useState(pattyEnabled ? 'patty' : 'copilot');
    const [pattyModePayload, setPattyModePayload] = useState(null);
    const [pattyModeLoading, setPattyModeLoading] = useState(false);
    const [pattyModeSaving, setPattyModeSaving] = useState(false);

    const baseChatId = useMemo(
        () => String(activeChatId || '').split('::mod::')[0] || String(activeChatId || '').trim(),
        [activeChatId]
    );
    const scopeModuleId = String(activeScopeModuleId || activeChatAssignment?.scopeModuleId || '').trim().toLowerCase();
    const isAssignedToMe = typeof chatAssignmentState?.isAssignedToMe === 'function'
        ? chatAssignmentState.isAssignedToMe(activeChatId)
        : false;
    const globalWithinMode = normalizePattyMode(activeAiConfig?.withinHoursMode || activeAiConfig?.within_hours_mode);
    const globalOutsideMode = normalizePattyMode(activeAiConfig?.outsideHoursMode || activeAiConfig?.outside_hours_mode);
    const scheduleOpenValue = activeAiConfig?.isWithinSchedule
        ?? activeAiConfig?.withinSchedule
        ?? activeAiConfig?.isWithinBusinessHours
        ?? activeAiConfig?.scheduleOpen
        ?? null;
    const hasScheduleSignal = typeof scheduleOpenValue === 'boolean';
    const modulePattyMode = firstPattyMode(
        pattyModePayload?.effectiveMode,
        pattyModePayload?.modulePattyMode,
        pattyModePayload?.globalMode,
        activeChatCommercialStatus?.effectivePattyMode,
        activeChatCommercialStatus?.modulePattyMode,
        activeChatCommercialStatus?.globalPattyMode,
        activeAiConfig?.effectiveMode,
        activeAiConfig?.currentMode,
        activeAiConfig?.mode,
        hasScheduleSignal ? (scheduleOpenValue ? globalWithinMode : globalOutsideMode) : '',
        globalWithinMode && globalWithinMode === globalOutsideMode ? globalWithinMode : '',
        globalOutsideMode,
        globalWithinMode,
        'off'
    );
    const selectedOverrideMode = firstPattyMode(
        pattyModePayload
            ? (pattyModePayload.mode || '')
            : (activeChatCommercialStatus?.pattyMode || activeChatCommercialStatus?.patty_mode || '')
    );
    const effectiveMode = selectedOverrideMode || modulePattyMode;
    const canReleaseChat = isAssignedToMe && effectiveMode === 'autonomous';

    const modeMeta = useMemo(() => {
        if (effectiveMode === 'autonomous') return { label: 'Autonoma', color: '#22c55e' };
        if (effectiveMode === 'review') return { label: 'Sugerencias', color: '#f5b301' };
        if (effectiveMode === 'off') return { label: 'Desactivada', color: '#8a8f98' };
        return { label: 'Modo global', color: '#8a8f98' };
    }, [effectiveMode]);

    const buildJsonHeaders = useCallback(() => {
        const headers = typeof buildApiHeaders === 'function'
            ? (buildApiHeaders({ includeJson: true }) || {})
            : { 'Content-Type': 'application/json' };
        const nextHeaders = { 'Content-Type': 'application/json', ...headers };
        if (activeTenantId) nextHeaders['x-tenant-id'] = String(activeTenantId).trim();
        return nextHeaders;
    }, [activeTenantId, buildApiHeaders]);

    useEffect(() => {
        if (activeInnerTab === 'patty' && !pattyEnabled) setActiveInnerTab('copilot');
        if (activeInnerTab === 'copilot' && !copilotEnabled) setActiveInnerTab('patty');
    }, [activeInnerTab, copilotEnabled, pattyEnabled]);

    useEffect(() => {
        setPattyModePayload(null);
        if (!baseChatId || !activeTenantId) return undefined;
        let cancelled = false;
        const run = async () => {
            try {
                setPattyModeLoading(true);
                const response = await fetch(`${API_URL}/api/tenant/chats/${encodeURIComponent(baseChatId)}/patty-mode?scopeModuleId=${encodeURIComponent(scopeModuleId || '')}`, {
                    headers: buildJsonHeaders()
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload?.ok === false) throw new Error(String(payload?.error || 'No se pudo cargar modo Patty.'));
                if (!cancelled) setPattyModePayload(payload);
            } catch (_) {
                if (!cancelled) setPattyModePayload(null);
            } finally {
                if (!cancelled) setPattyModeLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [activeTenantId, baseChatId, buildJsonHeaders, scopeModuleId]);

    const updatePattyMode = useCallback(async (mode = '') => {
        if (!baseChatId) return;
        try {
            setPattyModeSaving(true);
            const payloadMode = mode ? String(mode).trim().toLowerCase() : null;
            const response = await fetch(`${API_URL}/api/tenant/chats/${encodeURIComponent(baseChatId)}/patty-mode`, {
                method: 'POST',
                headers: buildJsonHeaders(),
                body: JSON.stringify({
                    mode: payloadMode,
                    scopeModuleId: scopeModuleId || ''
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) throw new Error(String(payload?.error || 'No se pudo actualizar modo Patty.'));
            setPattyModePayload(payload);
            const label = payloadMode === 'review'
                ? 'Sugerencias'
                : payloadMode === 'autonomous'
                    ? 'Autonoma'
                    : payloadMode === 'off'
                        ? 'Desactivada'
                        : 'Modo global';
            notify({ type: 'info', message: `Modo Patty: ${label}.` });
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'No se pudo actualizar modo Patty.') });
        } finally {
            setPattyModeSaving(false);
        }
    }, [baseChatId, buildJsonHeaders, notify, scopeModuleId]);

    const releaseChat = useCallback(async () => {
        if (!baseChatId || !canReleaseChat) return;
        try {
            setPattyModeSaving(true);
            const response = await fetch(`${API_URL}/api/tenant/chats/${encodeURIComponent(baseChatId)}/assignment?scopeModuleId=${encodeURIComponent(scopeModuleId || '')}`, {
                method: 'DELETE',
                headers: buildJsonHeaders()
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) throw new Error(String(payload?.error || 'No se pudo dejar el chat.'));
            setPattyModePayload(null);
            notify({ type: 'info', message: 'Chat liberado. Patty vuelve a la configuracion global.' });
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'No se pudo dejar el chat.') });
        } finally {
            setPattyModeSaving(false);
        }
    }, [baseChatId, buildJsonHeaders, canReleaseChat, notify, scopeModuleId]);

    const renderPattyModeControl = () => (
        <div
            style={{
                border: '1px solid var(--chat-card-border)',
                background: 'var(--chat-card-surface)',
                color: 'var(--text-primary)',
                borderRadius: '16px',
                padding: '12px',
                boxShadow: '0 10px 24px rgba(0,0,0,0.06)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 900 }}>
                    <Sparkles size={15} />
                    <span>Patty IA</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--chat-control-text-soft)' }}>
                    Modo:
                    <select
                        value={selectedOverrideMode || ''}
                        onChange={(event) => updatePattyMode(event.target.value)}
                        disabled={pattyModeLoading || pattyModeSaving || !baseChatId}
                        style={{
                            border: '1px solid var(--chat-card-border)',
                            background: 'var(--chat-control-surface-strong)',
                            color: 'var(--text-primary)',
                            borderRadius: '999px',
                            padding: '6px 9px',
                            fontWeight: 800,
                            outline: 'none'
                        }}
                    >
                        <option value="">Modo global</option>
                        <option value="review">Sugerencias</option>
                        <option value="autonomous">Autonoma</option>
                        <option value="off">Desactivada</option>
                    </select>
                </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.78rem', color: 'var(--chat-control-text-soft)' }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: modeMeta.color, display: 'inline-block', boxShadow: `0 0 0 3px color-mix(in srgb, ${modeMeta.color} 18%, transparent)` }} />
                    <strong style={{ color: 'var(--text-primary)' }}>{selectedOverrideMode ? modeMeta.label : `Global: ${modeMeta.label}`}</strong>
                    {!selectedOverrideMode && globalWithinMode !== globalOutsideMode && (
                        <span title="Modo global definido por horario">
                            Dentro: {globalWithinMode || 'off'} · Fuera: {globalOutsideMode || 'off'}
                        </span>
                    )}
                </div>
                {isAssignedToMe && (
                    <button
                        type="button"
                        onClick={releaseChat}
                        disabled={pattyModeSaving || !canReleaseChat}
                        title={canReleaseChat ? 'Dejar chat' : 'Cambia a Autonoma para poder dejar el chat'}
                        style={{
                            border: '1px solid var(--chat-card-border)',
                            background: canReleaseChat ? 'var(--chat-card-surface)' : 'var(--chat-control-disabled)',
                            color: canReleaseChat ? 'var(--text-primary)' : 'var(--chat-control-text-soft)',
                            borderRadius: '999px',
                            padding: '6px 10px',
                            cursor: canReleaseChat ? 'pointer' : 'not-allowed',
                            fontWeight: 800,
                            fontSize: '0.74rem',
                            opacity: canReleaseChat ? 1 : 0.75
                        }}
                    >
                        Dejar chat
                    </button>
                )}
            </div>
        </div>
    );

    const renderPattyPanel = () => (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {renderPattyModeControl()}
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
