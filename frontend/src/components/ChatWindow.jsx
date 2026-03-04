import React, { useState, useRef, useEffect } from 'react';
import { Search, MoreVertical, Mic, Smile, Bot, Sparkles, X, Paperclip, Send, ShoppingCart, ChevronUp, ChevronDown, Tag } from 'lucide-react';
import MessageBubble from './MessageBubble';
import moment from 'moment';

// Common emojis for the picker
const EMOJI_LIST = [
    '😊', '😂', '❤️', '👍', '🙏', '😍', '😭', '😁', '🥰', '🤣',
    '👏', '🔥', '💪', '✅', '⭐', '🎉', '💯', '🤝', '📦', '💰',
    '📱', '✨', '🙌', '💬', '👋', '🤔', '😮', '💎', '🛒', '📸',
    '✔️', '🚀', '💡', '⚡', '🎯', '📞', '📩', '🔔', '📝', '👀',
];

const ChatInput = ({
    inputText, setInputText, onSendMessage, onKeyDown, onFileClick,
    attachment, attachmentPreview, removeAttachment, isAiLoading,
    onRequestAiSuggestion, aiPrompt, setAiPrompt, isRecording,
    recordingTime, startRecording, stopRecording
}) => {
    const [showEmoji, setShowEmoji] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [linkPreview, setLinkPreview] = useState(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputText(val);
        setShowCommands(val.startsWith('/'));
        if (showEmoji) setShowEmoji(false);
    };

    const insertEmoji = (emoji) => {
        setInputText(prev => prev + emoji);
        setShowEmoji(false);
    };

    const selectCommand = (cmd) => {
        if (cmd === '/ayudar') onRequestAiSuggestion();
        else setInputText(cmd + ' ');
        setShowCommands(false);
    };

    const extractFirstUrl = (text) => {
        const match = String(text || '').match(/https?:\/\/[^\s]+/i);
        return match ? match[0] : null;
    };

    useEffect(() => {
        const url = extractFirstUrl(inputText);
        if (!url) {
            setLinkPreview(null);
            setIsLoadingPreview(false);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setIsLoadingPreview(true);
                const encoded = encodeURIComponent(url);
                const resp = await fetch(`http://localhost:3001/api/link-preview?url=${encoded}`);
                const data = await resp.json();
                if (!cancelled) setLinkPreview(data?.ok ? data : { ok: false, url });
            } catch (e) {
                if (!cancelled) setLinkPreview({ ok: false, url });
            } finally {
                if (!cancelled) setIsLoadingPreview(false);
            }
        }, 350);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [inputText]);

    return (
        <div className="chat-input-area" style={{ position: 'relative' }}>
            {/* Commands popover */}
            {showCommands && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: '10px',
                    background: '#1f2937', borderRadius: '10px', padding: '8px 0',
                    width: '260px', boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
                    marginBottom: '8px', zIndex: 200, border: '1px solid rgba(255,255,255,0.08)'
                }}>
                    <div style={{ padding: '6px 14px', color: '#00a884', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' }}>COMANDOS IA</div>
                    {[
                        { cmd: '/ayudar', icon: <Sparkles size={15} color="#8a2be2" />, desc: 'Genera respuesta inteligente' },
                        { cmd: '/vender', icon: <ShoppingCart size={15} color="#00a884" />, desc: 'Busca y cotiza producto' },
                    ].map(({ cmd, icon, desc }) => (
                        <div key={cmd} onClick={() => selectCommand(cmd)}
                            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            {icon}
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{cmd}</div>
                                <div style={{ fontSize: '0.75rem', color: '#8696a0' }}>{desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Emoji Picker */}
            {showEmoji && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: '0px',
                    background: '#1f2937', borderRadius: '10px', padding: '12px',
                    width: '300px', boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
                    marginBottom: '8px', zIndex: 200, border: '1px solid rgba(255,255,255,0.08)'
                }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {EMOJI_LIST.map(e => (
                            <span key={e} onClick={() => insertEmoji(e)}
                                style={{ fontSize: '1.4rem', cursor: 'pointer', padding: '4px', borderRadius: '6px', transition: 'background 0.1s' }}
                                onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                            >{e}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Link Preview (before send) */}
            {linkPreview && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: '70px', right: '70px',
                    background: '#1f2c34', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px', padding: '10px', marginBottom: '8px', zIndex: 150,
                    display: 'flex', gap: '10px', alignItems: 'flex-start'
                }}>
                    {linkPreview?.image && (
                        <img src={linkPreview.image} alt="preview" style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.72rem', color: '#00a884', marginBottom: '2px' }}>
                            {isLoadingPreview ? 'Cargando vista previa...' : 'Vista previa del enlace'}
                        </div>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {linkPreview?.title || linkPreview?.siteName || linkPreview?.url}
                        </div>
                        {linkPreview?.description && (
                            <div style={{ fontSize: '0.75rem', color: '#8696a0', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {linkPreview.description}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Attachment Preview */}
            {attachment && (
                <div className="attachment-preview" style={{ bottom: '75px', right: '15px' }}>
                    <button className="attachment-close" onClick={removeAttachment}><X size={14} /></button>
                    {attachmentPreview !== 'document' ? (
                        <img src={attachmentPreview} alt="Preview" style={{ maxWidth: '160px', maxHeight: '160px', borderRadius: '8px' }} />
                    ) : (
                        <div style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.8rem' }}>
                            📄 {attachment.filename}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: '15px', padding: '0 5px', alignItems: 'center' }}>
                <button className="btn-icon" style={{ color: showEmoji ? '#00a884' : '#8696a0' }} onClick={() => setShowEmoji(v => !v)} title="Emojis">
                    <Smile size={26} />
                </button>
                <button className="btn-icon" onClick={onFileClick} style={{ color: '#8696a0' }} title="Adjuntar archivo">
                    <Paperclip size={26} />
                </button>
            </div>

            <div className="input-container" style={{ margin: '0 5px' }}>
                <textarea
                    className="message-input"
                    placeholder="Escribe un mensaje..."
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendMessage(); }
                        onKeyDown && onKeyDown(e);
                    }}
                    rows={1}
                    style={{ padding: '4px 0', minHeight: '24px', resize: 'none' }}
                    onClick={() => { setShowEmoji(false); }}
                />
            </div>

            <div style={{ display: 'flex', gap: '12px', padding: '0 10px', alignItems: 'center' }}>
                {/* AI button */}
                <button
                    className="btn-icon"
                    style={{ color: isAiLoading ? '#8a2be2' : '#8696a0', animation: isAiLoading ? 'spin 2s linear infinite' : 'none' }}
                    onClick={onRequestAiSuggestion}
                    title="Sugerencia IA (/ayudar)"
                >
                    <Bot size={22} />
                </button>
                {/* Send or Mic */}
                {inputText.trim() || attachment ? (
                    <button className="send-button" onClick={onSendMessage} style={{ background: 'none', color: '#00a884' }} title="Enviar">
                        <Send size={26} />
                    </button>
                ) : (
                    <button
                        className={`send-button ${isRecording ? 'pulse' : ''}`}
                        style={{ background: 'none', color: isRecording ? '#da3633' : '#8696a0' }}
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onMouseLeave={isRecording ? stopRecording : undefined}
                        onTouchStart={startRecording}
                        onTouchEnd={stopRecording}
                        title={isRecording ? 'Suelta para enviar' : 'Mantén para grabar voz'}
                    >
                        {isRecording
                            ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#da3633' }}>🔴 {recordingTime}s</span>
                            : <Mic size={26} />
                        }
                    </button>
                )}
            </div>
        </div>
    );
};

// ============================================================
// ChatWindow - Full component with Profile Panel
// ============================================================
const ChatWindow = ({
    activeChatDetails,
    messages,
    messagesEndRef,
    isCopilotMode,
    setIsCopilotMode,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    showClientProfile,
    setShowClientProfile,
    labelDefinitions = [],
    onToggleChatLabel,
    ...inputProps
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [chatSearch, setChatSearch] = useState('');
    const [showLabelMenu, setShowLabelMenu] = useState(false);
    const [activeMatchIdx, setActiveMatchIdx] = useState(0);
    const messageRefs = useRef({});

    const searchTerm = chatSearch.trim().toLowerCase();
    const matchIndexes = searchTerm
        ? messages.reduce((acc, msg, idx) => (String(msg.body || '').toLowerCase().includes(searchTerm) ? [...acc, idx] : acc), [])
        : [];

    const jumpToMatch = (idx) => {
        const targetMessageIdx = matchIndexes[idx];
        if (targetMessageIdx === undefined) return;
        const messageId = messages[targetMessageIdx]?.id || `idx_${targetMessageIdx}`;
        const node = messageRefs.current[messageId];
        if (node?.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    useEffect(() => {
        if (!matchIndexes.length) {
            setActiveMatchIdx(0);
            return;
        }
        setActiveMatchIdx(0);
        setTimeout(() => jumpToMatch(0), 0);
    }, [chatSearch, messages.length]);

    const avatarColor = (name) => {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
        if (!name) return colors[0];
        return colors[name.charCodeAt(0) % colors.length];
    };

    const formatDayLabel = (unixTs) => {
        const m = moment.unix(unixTs || 0);
        if (!m.isValid()) return '';
        if (m.isSame(moment(), 'day')) return 'Hoy';
        if (m.isSame(moment().subtract(1, 'day'), 'day')) return 'Ayer';
        return m.format('dddd, D [de] MMMM');
    };

    return (
        <div
            className={`chat-window drop-zone ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Chat Header */}
            <div className="chat-header" style={{ cursor: 'pointer' }} onClick={() => setShowClientProfile(v => !v)}>
                <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: activeChatDetails?.profilePicUrl
                        ? `url(${activeChatDetails.profilePicUrl}) center/cover`
                        : avatarColor(activeChatDetails?.name),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem', color: 'white', fontWeight: 500, flexShrink: 0, overflow: 'hidden'
                }}>
                    {!activeChatDetails?.profilePicUrl && activeChatDetails?.name?.charAt(0)?.toUpperCase()}
                </div>
                <div style={{ marginLeft: '15px', flex: 1 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-primary)' }}>{activeChatDetails?.name}</h3>
                    <span style={{ fontSize: '0.78rem', color: '#8696a0' }}>
                        {activeChatDetails?.isGroup ? `${activeChatDetails?.participants || 0} participantes` : (activeChatDetails?.phone ? `+${activeChatDetails.phone}` : 'Haz clic para ver el perfil')}
                    </span>
                    {!!activeChatDetails?.labels?.length && (
                        <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {activeChatDetails.labels.slice(0, 3).map((l, i) => (
                                <span key={i} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.08)', color: l.color || '#9bb0ba' }}>{l.name}</span>
                            ))}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                    <button className="btn-icon" style={{ color: searchVisible ? '#00a884' : '#8696a0' }}
                        onClick={() => setSearchVisible(v => !v)} title="Buscar en chat">
                        <Search size={20} />
                    </button>
                    <div style={{ position: 'relative' }}>
                        <button className="btn-icon" style={{ color: showLabelMenu ? '#00a884' : '#8696a0' }}
                            onClick={() => setShowLabelMenu(v => !v)} title="Etiquetas">
                            <Tag size={20} />
                        </button>
                        {showLabelMenu && (
                            <div style={{ position: 'absolute', top: '30px', right: 0, background: '#233138', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', minWidth: '220px', zIndex: 1000, overflow: 'hidden', padding: '8px' }}>
                                <div style={{ fontSize: '0.72rem', color: '#9db0ba', marginBottom: '8px' }}>Etiquetas sincronizadas con WhatsApp</div>
                                {labelDefinitions.length === 0 && <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>No hay etiquetas disponibles.</div>}
                                {labelDefinitions.map((label) => {
                                    const isActive = (activeChatDetails?.labels || []).some((l) => String(l.id) === String(label.id));
                                    return (
                                        <label key={label.id || label.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', cursor: 'pointer', fontSize: '0.82rem' }}>
                                            <input type="checkbox" checked={isActive} onChange={() => onToggleChatLabel?.(activeChatDetails?.id, label.name)} />
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: label.color || '#8696a0' }} />
                                            <span style={{ color: 'var(--text-primary)' }}>{label.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button className="btn-icon" style={{ color: '#8696a0' }}
                            onClick={() => setShowMenu(v => !v)} title="Más opciones">
                            <MoreVertical size={20} />
                        </button>
                        {showMenu && (
                            <div style={{
                                position: 'absolute', top: '30px', right: 0,
                                background: '#233138', borderRadius: '8px',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                minWidth: '200px', zIndex: 1000, overflow: 'hidden'
                            }}>
                                {[
                                    { label: 'Ver perfil del contacto', action: () => setShowClientProfile(true) },
                                    { label: 'Buscar mensajes', action: () => setSearchVisible(true) },
                                    { label: 'Modo Copiloto IA', action: () => setIsCopilotMode(v => !v) },
                                ].map((item, i) => (
                                    <div key={i}
                                        onClick={() => { item.action(); setShowMenu(false); }}
                                        style={{ padding: '13px 20px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {item.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* In-chat Search Bar */}
            {searchVisible && (
                <div style={{ background: '#1f2937', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)' }}>
                    <Search size={16} color="#8696a0" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Buscar en esta conversación..."
                        value={chatSearch}
                        onChange={e => setChatSearch(e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                    />
                    {matchIndexes.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#9db0ba' }}>{activeMatchIdx + 1}/{matchIndexes.length}</span>
                    )}
                    <button disabled={matchIndexes.length === 0} onClick={() => {
                        if (!matchIndexes.length) return;
                        const next = (activeMatchIdx - 1 + matchIndexes.length) % matchIndexes.length;
                        setActiveMatchIdx(next);
                        jumpToMatch(next);
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: matchIndexes.length ? 1 : 0.4 }}><ChevronUp size={16} color="#8696a0" /></button>
                    <button disabled={matchIndexes.length === 0} onClick={() => {
                        if (!matchIndexes.length) return;
                        const next = (activeMatchIdx + 1) % matchIndexes.length;
                        setActiveMatchIdx(next);
                        jumpToMatch(next);
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: matchIndexes.length ? 1 : 0.4 }}><ChevronDown size={16} color="#8696a0" /></button>
                    <button onClick={() => { setSearchVisible(false); setChatSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={16} color="#8696a0" />
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="chat-messages" onClick={() => { setShowMenu(false); setShowLabelMenu(false); }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', margin: 'auto', background: 'var(--system-message-bg)', padding: '5px 12px', borderRadius: '7px', fontSize: '0.8rem', color: '#8696a0', boxShadow: '0 1px 0.5px rgba(11,20,26,.13)' }}>
                        No hay mensajes en esta conversación.
                    </div>
                )}
                {messages.map((msg, idx) => {
                    const currentDay = moment.unix(msg.timestamp || 0).format('YYYY-MM-DD');
                    const prevDay = idx > 0 ? moment.unix(messages[idx - 1].timestamp || 0).format('YYYY-MM-DD') : null;
                    const showDay = idx === 0 || currentDay !== prevDay;
                    const matchIdx = matchIndexes.indexOf(idx);
                    const isHighlighted = matchIdx !== -1;
                    const isCurrentHighlighted = isHighlighted && matchIdx === activeMatchIdx;
                    const messageKey = msg.id || `idx_${idx}`;
                    return (
                        <React.Fragment key={messageKey}>
                            {showDay && (
                                <div style={{ textAlign: 'center', margin: '8px auto', background: 'rgba(255,255,255,0.08)', color: '#9db0ba', fontSize: '0.74rem', borderRadius: '8px', padding: '4px 10px', width: 'fit-content' }}>
                                    {formatDayLabel(msg.timestamp)}
                                </div>
                            )}
                            <div ref={(el) => { if (el) messageRefs.current[messageKey] = el; }}>
                                <MessageBubble
                                    msg={msg}
                                    isHighlighted={isHighlighted}
                                    isCurrentHighlighted={isCurrentHighlighted}
                                    onPrefillMessage={(text) => inputProps?.setInputText && inputProps.setInputText(text)}
                                />
                            </div>
                        </React.Fragment>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <ChatInput {...inputProps} />
        </div>
    );
};

export { ChatInput };
export default ChatWindow;
