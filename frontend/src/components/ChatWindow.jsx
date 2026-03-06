import React, { useState, useRef, useEffect } from 'react';
import { Search, MoreVertical, Smile, Bot, Sparkles, X, Paperclip, Send, ShoppingCart, ChevronUp, ChevronDown, Tag } from 'lucide-react';
import MessageBubble from './MessageBubble';
import moment from 'moment';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Common emojis for the picker
const EMOJI_LIST = [
    ':)', ':D', ';)', ':P', ':-(', ':-|', ':O', '<3',
    ':+1:', ':ok:', ':fire:', ':sparkles:', ':star:', ':100:', ':wave:', ':clap:'
];

const ChatInput = ({
    inputText, setInputText, onSendMessage, onKeyDown, onFileClick,
    attachment, attachmentPreview, removeAttachment, isAiLoading,
    onRequestAiSuggestion, aiPrompt, setAiPrompt,
    editingMessage, onCancelEditMessage
}) => {
    const [showEmoji, setShowEmoji] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [linkPreview, setLinkPreview] = useState(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const inputRef = useRef(null);

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
        const el = inputRef.current;
        if (!el) return;
        el.style.height = '24px';
        const next = Math.min(el.scrollHeight, 220);
        el.style.height = `${next}px`;
    }, [inputText]);
    useEffect(() => {
        if (!editingMessage?.id) return;
        const timer = setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                const len = inputRef.current.value.length;
                inputRef.current.setSelectionRange(len, len);
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [editingMessage?.id]);


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
                const resp = await fetch(`${API_URL}/api/link-preview?url=${encoded}`);
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
        <div className="chat-input-area chat-input-area-pro" style={{ position: 'relative' }}>
            {editingMessage?.id && (
                <div style={{
                    position: 'absolute',
                    left: '12px',
                    right: '12px',
                    bottom: '100%',
                    marginBottom: '8px',
                    border: '1px solid rgba(0, 168, 132, 0.45)',
                    background: '#1f2c34',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    zIndex: 40
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.72rem', color: '#00a884', fontWeight: 700, marginBottom: '2px' }}>Editando mensaje</div>
                        <div style={{ fontSize: '0.78rem', color: '#b6c7cf', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(editingMessage?.originalBody || '').trim() || 'Mensaje sin texto'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onCancelEditMessage && onCancelEditMessage()}
                        style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: '#d8e3e8', borderRadius: '8px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                </div>
            )}

            {/* Commands popover */}
            {showCommands && (
                <div className="floating-panel commands-panel">
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
                <div className="floating-panel emoji-panel">
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
                <div className="floating-panel link-preview-panel">
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
                            Archivo: {attachment.filename}
                        </div>
                    )}
                </div>
            )}

            <div className="chat-input-left-actions">
                <button className={`btn-icon ui-icon-btn ${showEmoji ? 'active' : ''}`} onClick={() => setShowEmoji(v => !v)} title="Emojis">
                    <Smile size={26} />
                </button>
                <button className="btn-icon ui-icon-btn" onClick={onFileClick} title="Adjuntar archivo" disabled={Boolean(editingMessage?.id)} style={{ opacity: editingMessage?.id ? 0.45 : 1, cursor: editingMessage?.id ? 'not-allowed' : 'pointer' }}>
                    <Paperclip size={26} />
                </button>
            </div>

            <div className="input-container chat-composer-field">
                <textarea
                    ref={inputRef}
                    className="message-input"
                    placeholder={editingMessage?.id ? 'Edita el mensaje y presiona Enter...' : 'Escribe un mensaje...'}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                        if (editingMessage?.id && e.key === 'Escape') {
                            e.preventDefault();
                            onCancelEditMessage && onCancelEditMessage();
                            return;
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSendMessage();
                            return;
                        }
                        onKeyDown && onKeyDown(e);
                    }}
                    rows={1}
                    style={{ padding: '4px 0', minHeight: '24px', maxHeight: '220px', resize: 'none', overflowY: 'auto' }}
                    onClick={() => { setShowEmoji(false); }}
                />
            </div>

            <div className="chat-input-right-actions">
                {/* AI button */}
                <button
                    className="btn-icon"
                    style={{ color: isAiLoading ? '#8a2be2' : '#8696a0', animation: isAiLoading ? 'spin 2s linear infinite' : 'none' }}
                    onClick={onRequestAiSuggestion}
                    title="Sugerencia IA (/ayudar)"
                >
                    <Bot size={22} />
                </button>
                {/* Send button */}
                <button
                    className="send-button send-button-modern"
                    onClick={onSendMessage}
                    title={editingMessage?.id ? 'Guardar edicion' : 'Enviar'}
                    disabled={!inputText.trim() && !attachment}
                    style={{ opacity: (!inputText.trim() && !attachment) ? 0.55 : 1, cursor: (!inputText.trim() && !attachment) ? 'not-allowed' : 'pointer' }}
                >
                    <Send size={26} />
                </button>
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
    onEditMessage,
    canEditMessages = true,
    ...inputProps
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [chatSearch, setChatSearch] = useState('');
    const [showLabelMenu, setShowLabelMenu] = useState(false);
    const [activeMatchIdx, setActiveMatchIdx] = useState(0);
    const [lightboxMedia, setLightboxMedia] = useState(null);
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

    useEffect(() => {
        const onEsc = (event) => {
            if (event.key === 'Escape') setLightboxMedia(null);
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, []);

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
            <div className="chat-header chat-header-pro" onClick={() => setShowClientProfile(v => !v)}>
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
                <div className="chat-header-meta">
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
                <div className="chat-header-actions" onClick={e => e.stopPropagation()}>
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
                                            <input type="checkbox" checked={isActive} onChange={() => onToggleChatLabel?.(activeChatDetails?.id, label.id)} />
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
                            onClick={() => setShowMenu(v => !v)} title="Mas opciones">
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
                <div className="chat-searchbar">
                    <Search size={16} color="#8696a0" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Buscar en esta conversacion..."
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
                    <div className="chat-empty-state-pill">
                        No hay mensajes en esta conversacion.
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
                                <div className="chat-day-separator">
                                    {formatDayLabel(msg.timestamp)}
                                </div>
                            )}
                            <div ref={(el) => { if (el) messageRefs.current[messageKey] = el; }}>
                                <MessageBubble
                                    msg={msg}
                                    isHighlighted={isHighlighted}
                                    isCurrentHighlighted={isCurrentHighlighted}
                                    onPrefillMessage={(text) => inputProps?.setInputText && inputProps.setInputText(text)}
                                    onOpenMedia={setLightboxMedia}
                                    onEditMessage={onEditMessage}
                                    canEditMessages={canEditMessages}
                                />
                            </div>
                        </React.Fragment>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {lightboxMedia?.src && (
                <div className="chat-lightbox" onClick={() => setLightboxMedia(null)}>
                    <div className="chat-lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="chat-lightbox-close" onClick={() => setLightboxMedia(null)} aria-label="Cerrar vista previa">
                            <X size={20} />
                        </button>
                        <img src={lightboxMedia.src} alt="Vista previa" className="chat-lightbox-image" />
                    </div>
                </div>
            )}

            {/* Input Area */}
            <ChatInput {...inputProps} />
        </div>
    );
};

export { ChatInput };
export default ChatWindow;





