import React, { useState, useRef, useEffect } from 'react';
import { Search, MoreVertical, Smile, Bot, Sparkles, X, Paperclip, Send, ShoppingCart, ChevronUp, ChevronDown, Tag, MapPin, Share2 } from 'lucide-react';
import MessageBubble from './MessageBubble';
import moment from 'moment';
import EmojiPicker from 'emoji-picker-react';
import ChannelBrandIcon from './ChannelBrandIcon';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const normalizeModuleImageUrl = (rawUrl = '') => {
    const value = String(rawUrl || '').trim();
    if (!value) return null;
    if (value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${API_URL}${value}`;
    return `${API_URL}/${value}`;
};

const normalizeQuickReplyAssetPreviewUrl = (rawUrl = '') => {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    if (value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${API_URL}${value}`;
    return `${API_URL}/${value.replace(/^\/+/, '')}`;
};

const isImageQuickReplyAsset = (asset = {}) => {
    const mimeType = String(asset?.mimeType || '').trim().toLowerCase();
    if (mimeType.startsWith('image/')) return true;
    const fileName = String(asset?.fileName || '').trim().toLowerCase();
    return /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(fileName);
};

const formatAssetBytes = (value) => {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const ChatInput = ({
    inputText, setInputText, onSendMessage, onKeyDown, onFileClick,
    attachment, attachmentPreview, removeAttachment, isAiLoading,

    onRequestAiSuggestion, aiPrompt, setAiPrompt, quickReplies = [], onSendQuickReply = null,
    quickReplyDraft = null, onClearQuickReplyDraft = null,
    editingMessage, onCancelEditMessage,
    replyingMessage, onCancelReplyMessage,
    onOpenMapPicker,
    buildApiHeaders
}) => {
    const [showEmoji, setShowEmoji] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [linkPreview, setLinkPreview] = useState(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [selectionState, setSelectionState] = useState(null);
    const inputRef = useRef(null);
    const chatInputRef = useRef(null);
    const draftQuickReplyLabel = String(quickReplyDraft?.label || '').trim();
    const draftQuickReplyText = String(quickReplyDraft?.text || '').trim();
    const draftQuickReplyAssets = Array.isArray(quickReplyDraft?.mediaAssets)
        ? quickReplyDraft.mediaAssets.filter((asset) => asset && typeof asset === 'object' && String(asset?.url || '').trim())
        : [];
    const draftQuickReplyPreviewAssets = draftQuickReplyAssets.map((asset, index) => {
        const previewUrl = normalizeQuickReplyAssetPreviewUrl(asset?.url || '');
        return {
            ...asset,
            previewUrl,
            isImage: isImageQuickReplyAsset(asset),
            name: String(asset?.fileName || `adjunto_${index + 1}`).trim() || `adjunto_${index + 1}`
        };
    });
    const hasDraftQuickReply = Boolean(quickReplyDraft && (draftQuickReplyText || draftQuickReplyAssets.length > 0 || draftQuickReplyLabel));

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputText(val);
        setShowCommands(val.startsWith('/'));
        if (showEmoji) setShowEmoji(false);
    };

    const updateSelectionState = () => {
        const el = inputRef.current;
        if (!el) {
            setSelectionState(null);
            return;
        }
        const start = Number(el.selectionStart || 0);
        const end = Number(el.selectionEnd || 0);
        if (end > start) {
            setSelectionState({ start, end });
            return;
        }
        setSelectionState(null);
    };

    const insertEmoji = (emoji) => {
        const el = inputRef.current;
        if (!el) {
            setInputText(prev => `${prev}${emoji}`);
            setShowEmoji(false);
            return;
        }
        const start = Number(el.selectionStart || 0);
        const end = Number(el.selectionEnd || 0);
        const current = String(inputText || '');
        const next = `${current.slice(0, start)}${emoji}${current.slice(end)}`;
        setInputText(next);
        setShowEmoji(false);
        requestAnimationFrame(() => {
            if (!inputRef.current) return;
            const cursor = start + emoji.length;
            inputRef.current.focus();
            inputRef.current.setSelectionRange(cursor, cursor);
            setSelectionState(null);
        });
    };

    const applyInlineFormat = (openToken, closeToken = openToken) => {
        const el = inputRef.current;
        if (!el) return;
        const start = Number(el.selectionStart || 0);
        const end = Number(el.selectionEnd || 0);
        if (end <= start) return;
        const current = String(inputText || '');
        const selected = current.slice(start, end);
        const wrapped = `${openToken}${selected}${closeToken}`;
        const next = `${current.slice(0, start)}${wrapped}${current.slice(end)}`;
        setInputText(next);
        requestAnimationFrame(() => {
            if (!inputRef.current) return;
            const selStart = start + openToken.length;
            const selEnd = selStart + selected.length;
            inputRef.current.focus();
            inputRef.current.setSelectionRange(selStart, selEnd);
            setSelectionState({ start: selStart, end: selEnd });
        });
    };

    const applyLinePrefixFormat = (mode) => {
        const el = inputRef.current;
        if (!el) return;
        const start = Number(el.selectionStart || 0);
        const end = Number(el.selectionEnd || 0);
        if (end <= start) return;

        const current = String(inputText || '');
        const blockStart = current.lastIndexOf('\n', start - 1) + 1;
        const nextBreak = current.indexOf('\n', end);
        const blockEnd = nextBreak === -1 ? current.length : nextBreak;
        const block = current.slice(blockStart, blockEnd);

        const formattedBlock = block
            .split('\n')
            .map((line, idx) => {
                const cleanLine = line.replace(/^\s*(?:>\s+|[-*]\s+|\d+\.\s+)/, '').trimEnd();
                if (mode === 'number') return `${idx + 1}. ${cleanLine}`;
                if (mode === 'quote') return `> ${cleanLine}`;
                return `- ${cleanLine}`;
            })
            .join('\n');

        const next = `${current.slice(0, blockStart)}${formattedBlock}${current.slice(blockEnd)}`;
        setInputText(next);
        requestAnimationFrame(() => {
            if (!inputRef.current) return;
            inputRef.current.focus();
            inputRef.current.setSelectionRange(blockStart, blockStart + formattedBlock.length);
            setSelectionState({ start: blockStart, end: blockStart + formattedBlock.length });
        });
    };

    const applyCodeBlockFormat = () => {
        const el = inputRef.current;
        if (!el) return;
        const start = Number(el.selectionStart || 0);
        const end = Number(el.selectionEnd || 0);
        if (end <= start) return;

        const current = String(inputText || '');
        const selected = current.slice(start, end);
        const wrapped = `\`\`\`\n${selected}\n\`\`\``;
        const next = `${current.slice(0, start)}${wrapped}${current.slice(end)}`;
        setInputText(next);
        requestAnimationFrame(() => {
            if (!inputRef.current) return;
            inputRef.current.focus();
            inputRef.current.setSelectionRange(start, start + wrapped.length);
            setSelectionState({ start, end: start + wrapped.length });
        });
    };

    const continueListOnShiftEnter = () => {
        const el = inputRef.current;
        if (!el) return false;
        const start = Number(el.selectionStart || 0);
        const end = Number(el.selectionEnd || 0);
        if (start !== end) return false;

        const current = String(inputText || '');
        const lineStart = current.lastIndexOf('\n', start - 1) + 1;
        const nextBreak = current.indexOf('\n', start);
        const lineEnd = nextBreak === -1 ? current.length : nextBreak;
        const line = current.slice(lineStart, lineEnd);

        const bulletMatch = line.match(/^(\s*[-*]\s+)/);
        const numberedMatch = line.match(/^(\s*)(\d+)\.\s+/);

        let continuation = '';
        if (bulletMatch) {
            continuation = bulletMatch[1];
        } else if (numberedMatch) {
            const indent = numberedMatch[1] || '';
            const currentNumber = Number(numberedMatch[2] || 0);
            continuation = `${indent}${currentNumber + 1}. `;
        }
        if (!continuation) return false;

        const insertion = `\n${continuation}`;
        const next = `${current.slice(0, start)}${insertion}${current.slice(end)}`;
        const nextCursor = start + insertion.length;
        setInputText(next);
        requestAnimationFrame(() => {
            if (!inputRef.current) return;
            inputRef.current.focus();
            inputRef.current.setSelectionRange(nextCursor, nextCursor);
            setSelectionState(null);
        });
        return true;
    };

    const normalizedSlashQuery = String(inputText || '').startsWith('/')
        ? String(inputText || '').slice(1).trim().toLowerCase()
        : '';
    const slashTokens = normalizedSlashQuery
        ? normalizedSlashQuery.split(/\s+/).map((entry) => entry.trim()).filter(Boolean)
        : [];

    const filteredQuickReplies = (Array.isArray(quickReplies) ? quickReplies : [])
        .map((item) => {
            const label = String(item?.label || '').trim().toLowerCase();
            const text = String(item?.text || '').trim().toLowerCase();
            const libraryName = String(item?.libraryName || '').trim().toLowerCase();
            const haystack = `${label} ${libraryName} ${text}`.trim();
            if (!slashTokens.length) {
                return {
                    item,
                    rank: Number(label.length > 0) * 100 + Number(libraryName.length > 0) * 10
                };
            }
            const containsAll = slashTokens.every((token) => haystack.includes(token));
            if (!containsAll) return null;

            let rank = 0;
            if (normalizedSlashQuery && label.startsWith(normalizedSlashQuery)) rank += 400;
            if (normalizedSlashQuery && libraryName.startsWith(normalizedSlashQuery)) rank += 280;
            if (normalizedSlashQuery && text.startsWith(normalizedSlashQuery)) rank += 220;
            slashTokens.forEach((token) => {
                if (label.includes(token)) rank += 80;
                if (libraryName.includes(token)) rank += 50;
                if (text.includes(token)) rank += 20;
            });

            return { item, rank };
        })
        .filter(Boolean)
        .sort((left, right) => {
            const rankDelta = Number(right?.rank || 0) - Number(left?.rank || 0);
            if (rankDelta !== 0) return rankDelta;
            const leftLabel = String(left?.item?.label || '').trim();
            const rightLabel = String(right?.item?.label || '').trim();
            return leftLabel.localeCompare(rightLabel, 'es', { sensitivity: 'base' });
        })
        .slice(0, 10)
        .map((entry) => entry.item);

    const selectQuickReply = (item = {}) => {
        const entry = item && typeof item === 'object' ? item : null;
        if (!entry) return;
        if (typeof onSendQuickReply === 'function') onSendQuickReply(entry);
        else setInputText(String(entry?.text || '').trim());
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
        if (!selectionState) return;
        const inputLen = String(inputText || '').length;
        if (selectionState.start >= inputLen || selectionState.end > inputLen) {
            setSelectionState(null);
        }
    }, [inputText, selectionState]);

    useEffect(() => {
        if (!showEmoji) return;
        const onOutside = (event) => {
            if (!chatInputRef.current) return;
            if (chatInputRef.current.contains(event.target)) return;
            setShowEmoji(false);
        };
        document.addEventListener('mousedown', onOutside);
        return () => document.removeEventListener('mousedown', onOutside);
    }, [showEmoji]);

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
                const resp = await fetch(`${API_URL}/api/link-preview?url=${encoded}`, {
                    headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
                });
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
        <div className="chat-input-area chat-input-area-pro" style={{ position: 'relative' }} ref={chatInputRef}>
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

            {!editingMessage?.id && replyingMessage?.id && (
                <div style={{
                    position: 'absolute',
                    left: '12px',
                    right: '12px',
                    bottom: '100%',
                    marginBottom: '8px',
                    border: '1px solid rgba(124, 200, 255, 0.45)',
                    background: '#1b2831',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    zIndex: 39
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.72rem', color: '#7cc8ff', fontWeight: 700, marginBottom: '2px' }}>
                            Respondiendo {replyingMessage?.fromMe ? 'tu mensaje' : 'mensaje del cliente'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#b6c7cf', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(replyingMessage?.body || '').trim() || 'Mensaje sin texto'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onCancelReplyMessage && onCancelReplyMessage()}
                        style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: '#d8e3e8', borderRadius: '8px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                </div>
            )}

            {!editingMessage?.id && hasDraftQuickReply && (
                <div style={{
                    position: 'absolute',
                    left: '12px',
                    right: '12px',
                    bottom: '100%',
                    marginBottom: replyingMessage?.id ? '74px' : '8px',
                    border: '1px solid rgba(0, 168, 132, 0.55)',
                    background: '#173138',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    zIndex: 38
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.72rem', color: '#00d4aa', fontWeight: 700, marginBottom: '2px' }}>
                            Respuesta rapida cargada{draftQuickReplyLabel ? `: ${draftQuickReplyLabel}` : ''}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#d4e2e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {draftQuickReplyText || `Adjuntos: ${draftQuickReplyAssets.length}`}
                        </div>
                        {draftQuickReplyPreviewAssets.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                {draftQuickReplyPreviewAssets.slice(0, 3).map((asset, assetIdx) => (
                                    <div key={`draft_qr_preview_${assetIdx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.18)', maxWidth: '230px' }}>
                                        {asset.isImage ? (
                                            <img src={asset.previewUrl} alt={asset.name} style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                                        ) : (
                                            <span style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#b8ccd8', flexShrink: 0 }}>
                                                {String(asset?.mimeType || 'file').split('/')[1] || 'file'}
                                            </span>
                                        )}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '0.72rem', color: '#d4e2e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {asset.name}
                                            </div>
                                            <div style={{ fontSize: '0.66rem', color: '#9fb6c1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {(asset.mimeType || 'archivo').replace('application/', '')}
                                                {asset.sizeBytes ? ` | ${formatAssetBytes(asset.sizeBytes)}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {draftQuickReplyPreviewAssets.length > 3 && (
                                    <div style={{ fontSize: '0.68rem', color: '#9fb6c1' }}>+{draftQuickReplyPreviewAssets.length - 3} adjuntos</div>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onClearQuickReplyDraft && onClearQuickReplyDraft()}
                        style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: '#d8e3e8', borderRadius: '8px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                        Limpiar
                    </button>
                </div>
            )}

            {/* Commands popover */}
            {showCommands && (
                <div className="floating-panel commands-panel">
                    <div style={{ padding: '6px 14px', color: '#00a884', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' }}>RESPUESTAS RAPIDAS</div>
                    {filteredQuickReplies.length === 0 && (
                        <div style={{ padding: '10px 14px', color: '#9db0ba', fontSize: '0.78rem' }}>
                            No hay respuestas rapidas para este modulo.
                        </div>
                    )}
                    {filteredQuickReplies.map((item) => (
                        <div key={String(item?.id || item?.label || Math.random())} onClick={() => selectQuickReply(item)}
                            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <Sparkles size={15} color="#00a884" />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {String(item?.label || 'Respuesta rapida')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {String(item?.text || item?.mediaFileName || 'Adjunto').split('\n')[0]}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Emoji Picker */}
            {showEmoji && (
                <div className="floating-panel emoji-panel">
                    <EmojiPicker
                        onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                        width="100%"
                        height={430}
                        lazyLoadEmojis
                        skinTonesDisabled={false}
                        searchDisabled={false}
                        previewConfig={{ showPreview: false }}
                        theme="dark"
                    />
                </div>
            )}

            {selectionState && (
                <div className="input-format-toolbar">
                    {[
                        { label: 'B', title: 'Negrita', wrap: ['*', '*'] },
                        { label: 'I', title: 'Cursiva', wrap: ['_', '_'] },
                        { label: 'S', title: 'Tachado', wrap: ['~', '~'] },
                        { label: '</>', title: 'Monoespaciado', wrap: ['`', '`'] },
                        { label: '"', title: 'Cita', mode: 'quote' },
                        { label: '\u2022', title: 'Vinetas', mode: 'bullet' },
                        { label: '1.', title: 'Numeracion', mode: 'number' },
                        { label: '```', title: 'Bloque de codigo', mode: 'codeblock' },
                    ].map((fmt) => (
                        <button
                            key={fmt.title}
                            type="button"
                            className="input-format-btn"
                            title={fmt.title}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                if (fmt.mode === 'quote') return applyLinePrefixFormat('quote');
                                if (fmt.mode === 'bullet') return applyLinePrefixFormat('bullet');
                                if (fmt.mode === 'number') return applyLinePrefixFormat('number');
                                if (fmt.mode === 'codeblock') return applyCodeBlockFormat();
                                return applyInlineFormat(fmt.wrap[0], fmt.wrap[1]);
                            }}
                        >
                            {fmt.label}
                        </button>
                    ))}
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
                <button
                    className="btn-icon ui-icon-btn"
                    onClick={() => onOpenMapPicker && onOpenMapPicker()}
                    title="Buscar o compartir ubicacion"
                    disabled={Boolean(editingMessage?.id)}
                    style={{ opacity: editingMessage?.id ? 0.45 : 1, cursor: editingMessage?.id ? 'not-allowed' : 'pointer' }}
                >
                    <MapPin size={24} />
                </button>
            </div>

            <div className="input-container chat-composer-field">
                <textarea
                    ref={inputRef}
                    className="message-input"
                    placeholder={editingMessage?.id ? 'Edita el mensaje y presiona Enter...' : (replyingMessage?.id ? 'Escribe tu respuesta y presiona Enter...' : 'Escribe un mensaje...')}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                        if (editingMessage?.id && e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            onCancelEditMessage && onCancelEditMessage();
                            return;
                        }
                        if (!editingMessage?.id && replyingMessage?.id && e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            onCancelReplyMessage && onCancelReplyMessage();
                            return;
                        }
                        if (!editingMessage?.id && !replyingMessage?.id && hasDraftQuickReply && e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            onClearQuickReplyDraft && onClearQuickReplyDraft();
                            return;
                        }
                        if (e.key === 'Enter' && e.shiftKey && continueListOnShiftEnter()) {
                            e.preventDefault();
                            return;
                        }
                        if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
                            e.preventDefault();
                            onSendMessage();
                            return;
                        }
                        onKeyDown && onKeyDown(e);
                    }}
                    rows={1}
                    style={{ padding: '4px 0', minHeight: '24px', maxHeight: '220px', resize: 'none', overflowY: 'auto' }}
                    onClick={() => { setShowEmoji(false); updateSelectionState(); }}
                    onSelect={updateSelectionState}
                    onKeyUp={updateSelectionState}
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

                    title={editingMessage?.id ? 'Guardar edicion' : (replyingMessage?.id ? 'Enviar respuesta' : 'Enviar')}
                    disabled={!inputText.trim() && !attachment && !hasDraftQuickReply}
                    style={{
                        opacity: (!inputText.trim() && !attachment && !hasDraftQuickReply) ? 0.55 : 1,
                        cursor: (!inputText.trim() && !attachment && !hasDraftQuickReply) ? 'not-allowed' : 'pointer'
                    }}
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
    onToggleChatPinned,
    onEditMessage,
    onReplyMessage,
    onForwardMessage,
    onDeleteMessage,
    forwardChatOptions = [],

    canEditMessages = true,
    buildApiHeaders,
    waModules = [],
    ...inputProps
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [chatSearch, setChatSearch] = useState('');
    const [showLabelMenu, setShowLabelMenu] = useState(false);
    const [activeMatchIdx, setActiveMatchIdx] = useState(0);
    const [lightboxMedia, setLightboxMedia] = useState(null);
    const [showMapModal, setShowMapModal] = useState(false);
    const [mapQuery, setMapQuery] = useState('');
    const [mapEmbedUrl, setMapEmbedUrl] = useState('');
    const [mapSuggestions, setMapSuggestions] = useState([]);
    const [mapSuggestionsLoading, setMapSuggestionsLoading] = useState(false);
    const [mapResolveLoading, setMapResolveLoading] = useState(false);
    const [selectedMapSuggestion, setSelectedMapSuggestion] = useState(null);
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
            if (event.key === 'Escape') { setLightboxMedia(null); setShowMapModal(false); }
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, []);

    const avatarColor = (name) => {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
        if (!name) return colors[0];
        return colors[name.charCodeAt(0) % colors.length];
    };

    const getChannelMarker = (channelType = '') => {
        const clean = String(channelType || '').trim().toLowerCase();
        if (!clean) return { key: 'generic', short: 'CH', label: 'Canal' };
        if (clean === 'whatsapp') return { key: 'whatsapp', short: 'WA', label: 'WhatsApp' };
        if (clean === 'instagram') return { key: 'instagram', short: 'IG', label: 'Instagram' };
        if (clean === 'messenger') return { key: 'messenger', short: 'MS', label: 'Messenger' };
        if (clean === 'facebook') return { key: 'facebook', short: 'FB', label: 'Facebook' };
        if (clean === 'webchat') return { key: 'webchat', short: 'WEB', label: 'Webchat' };
        return { key: 'generic', short: clean.slice(0, 3).toUpperCase(), label: clean.toUpperCase() };
    };

    const formatHeaderPhone = (phoneValue) => {
        const raw = String(phoneValue || '').trim();
        if (!raw) return '';
        const normalized = raw.replace(/[^\d+]/g, '');
        if (!normalized) return '';
        return normalized.startsWith('+') ? normalized : `+${normalized}`;
    };

    const headerPhone = formatHeaderPhone(activeChatDetails?.phone);
    const headerParticipantsCount = Number(
        activeChatDetails?.participants
        || activeChatDetails?.chatState?.participantsCount
        || (Array.isArray(activeChatDetails?.participantsList) ? activeChatDetails.participantsList.length : 0)
        || 0
    ) || 0;
    const headerSubline = activeChatDetails?.isGroup
        ? `${headerParticipantsCount} participantes`
        : (headerPhone || 'Sin numero visible');
    const headerHint = activeChatDetails?.isGroup
        ? 'Grupo'
        : (activeChatDetails?.pushname ? `Pushname: ${activeChatDetails.pushname}` : 'Haz clic para ver el perfil');
    const normalizeModuleKey = (value = '') => String(value || '').trim().toLowerCase();
    const headerModuleId = String(activeChatDetails?.scopeModuleId || activeChatDetails?.lastMessageModuleId || '').trim().toUpperCase();
    const normalizedHeaderModuleId = normalizeModuleKey(activeChatDetails?.scopeModuleId || activeChatDetails?.lastMessageModuleId || '');
    const headerRawModuleName = String(activeChatDetails?.lastMessageModuleName || '').trim();
    const normalizedHeaderModuleName = String(headerRawModuleName || '').trim().toLowerCase();
    const modulePool = Array.isArray(waModules) ? waModules : [];
    const headerModuleConfig = modulePool.find((moduleEntry) => normalizeModuleKey(moduleEntry?.moduleId || moduleEntry?.id || '') === normalizedHeaderModuleId)
        || modulePool.find((moduleEntry) => normalizedHeaderModuleName && String(moduleEntry?.name || '').trim().toLowerCase() === normalizedHeaderModuleName)
        || null;
    const headerModuleName = headerRawModuleName || String(headerModuleConfig?.name || '').trim() || headerModuleId;
    const headerModuleChannelType = String(activeChatDetails?.lastMessageChannelType || headerModuleConfig?.channelType || '').trim().toLowerCase();
    const headerModuleChannel = headerModuleChannelType ? headerModuleChannelType.toUpperCase() : '';
    const headerModuleImageUrl = normalizeModuleImageUrl(
        activeChatDetails?.lastMessageModuleImageUrl
        || headerModuleConfig?.imageUrl
        || headerModuleConfig?.logoUrl
        || ''
    );
    const showHeaderModule = Boolean(headerModuleName || headerModuleChannel);
    const headerChannelMarker = getChannelMarker(headerModuleChannelType);
    const headerAvatarImageUrl = headerModuleImageUrl || null;
    const headerAvatarFallback = headerChannelMarker.short || (headerModuleName ? String(headerModuleName).charAt(0).toUpperCase() : (activeChatDetails?.name?.charAt(0)?.toUpperCase() || '?'));
    const normalizeSenderDigits = (value = '') => String(value || '').replace(/\D/g, '');
    const participantRecords = Array.isArray(activeChatDetails?.participantsList) ? activeChatDetails.participantsList : [];
    const participantNameById = new Map();
    const participantNameByPhone = new Map();

    participantRecords.forEach((participant) => {
        if (!participant || typeof participant !== 'object') return;
        const id = String(participant.id || '').trim();
        const name = String(participant.displayName || participant.name || participant.pushname || participant.shortName || '').trim();
        const phoneDigits = normalizeSenderDigits(participant.phone || id.split('@')[0] || '');
        if (id && name) participantNameById.set(id, name);
        if (phoneDigits && name) participantNameByPhone.set(phoneDigits, name);
    });

    const isHumanSenderLabel = (value = '') => {
        const label = String(value || '').trim();
        if (!label) return false;
        if (label.includes('@')) return false;
        if (/^\+?\d{8,}$/.test(label)) return false;
        if (/^\d{14,}$/.test(label)) return false;
        return true;
    };

    const resolveGroupSenderName = (msg = {}) => {
        if (!activeChatDetails?.isGroup || msg?.fromMe) return '';

        const senderId = String(msg?.senderId || msg?.author || '').trim();
        if (senderId && participantNameById.has(senderId)) return participantNameById.get(senderId);

        const senderDigits = normalizeSenderDigits(msg?.senderPhone || senderId.split('@')[0] || '');
        if (senderDigits && participantNameByPhone.has(senderDigits)) return participantNameByPhone.get(senderDigits);

        const notifyName = String(msg?.notifyName || '').trim();
        if (isHumanSenderLabel(notifyName)) return notifyName;

        const senderPushname = String(msg?.senderPushname || '').trim();
        if (isHumanSenderLabel(senderPushname)) return senderPushname;

        if (senderDigits) return `+${senderDigits}`;
        return 'Participante';
    };
    const formatDayLabel = (unixTs) => {
        const m = moment.unix(unixTs || 0);
        if (!m.isValid()) return '';
        if (m.isSame(moment(), 'day')) return 'Hoy';
        if (m.isSame(moment().subtract(1, 'day'), 'day')) return 'Ayer';
        return m.format('dddd, D [de] MMMM');
    };

    const parseMapCoord = (value) => Number.parseFloat(String(value ?? '').replace(',', '.'));
    const isValidMapLat = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
    const isValidMapLng = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

    const extractCoordsToken = (value = '') => {
        const source = String(value || '');
        if (!source) return null;
        const patterns = [
            /@(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
            /[?&](?:q|query|ll|sll|destination|daddr)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
            /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
        ];
        for (const pattern of patterns) {
            const match = source.match(pattern);
            if (!match) continue;
            const lat = parseMapCoord(match[1]);
            const lng = parseMapCoord(match[2]);
            if (isValidMapLat(lat) && isValidMapLng(lng)) return { lat, lng };
        }
        return null;
    };

    const normalizeMapSeed = (seed = '') => {
        const raw = String(seed || '').trim();
        if (!raw) return '';
        if (!/^https?:\/\//i.test(raw)) return raw;

        const normalizedUrl = raw.replace(/[),.;!?]+$/g, '');
        try {
            const parsed = new URL(normalizedUrl);
            for (const key of ['q', 'query', 'll', 'sll', 'destination', 'daddr']) {
                const fromParam = parsed.searchParams.get(key);
                if (!fromParam) continue;
                const trimmed = String(fromParam).trim();
                if (!trimmed) continue;
                const coords = extractCoordsToken(trimmed);
                if (coords) return `${coords.lat},${coords.lng}`;
                return trimmed;
            }

            const decodedPath = decodeURIComponent(`${parsed.pathname || ''}${parsed.hash || ''}`);
            const pathCoords = extractCoordsToken(decodedPath);
            if (pathCoords) return `${pathCoords.lat},${pathCoords.lng}`;

            const placeMatch = decodedPath.match(/\/place\/([^/]+)/i);
            if (placeMatch?.[1]) return String(placeMatch[1]).replace(/\+/g, ' ');

            const searchMatch = decodedPath.match(/\/search\/([^/]+)/i);
            if (searchMatch?.[1]) return String(searchMatch[1]).replace(/\+/g, ' ');

            return normalizedUrl;
        } catch (e) {
            return normalizedUrl;
        }
    };

    const buildMapEmbedUrl = (seed = '') => {
        const normalized = normalizeMapSeed(seed);
        if (!normalized) return '';
        return `https://www.google.com/maps?q=${encodeURIComponent(normalized)}&output=embed`;
    };

    const buildExternalMapUrl = (seed = '') => {
        const raw = String(seed || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        const normalized = normalizeMapSeed(raw);
        if (!normalized) return '';
        return `https://www.google.com/maps?q=${encodeURIComponent(normalized)}`;
    };

    const toSuggestionItem = (item = {}) => {
        const latitude = parseMapCoord(item?.latitude);
        const longitude = parseMapCoord(item?.longitude);
        const hasCoords = isValidMapLat(latitude) && isValidMapLng(longitude);
        const label = String(item?.label || '').trim();
        const mapUrl = String(item?.mapUrl || '').trim();
        if (!label && !hasCoords && !mapUrl) return null;
        const seed = hasCoords ? `${latitude},${longitude}` : (normalizeMapSeed(mapUrl || label) || label);
        return {
            id: String(item?.id || seed || label || Date.now()),
            label: label || (hasCoords ? `${latitude}, ${longitude}` : 'Ubicacion'),
            latitude: hasCoords ? latitude : null,
            longitude: hasCoords ? longitude : null,
            seed,
            mapUrl: mapUrl || buildExternalMapUrl(seed)
        };
    };

    const resolveMapUrlViaApi = async (rawUrl = '') => {
        const cleanUrl = String(rawUrl || '').trim();
        if (!/^https?:\/\//i.test(cleanUrl)) return null;
        try {
            const encoded = encodeURIComponent(cleanUrl);
            const response = await fetch(`${API_URL}/api/map-resolve?url=${encoded}`, {
                headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
            });
            const payload = await response.json();
            if (!payload?.ok) return null;
            return {
                seed: String(payload.seed || '').trim(),
                latitude: parseMapCoord(payload.latitude),
                longitude: parseMapCoord(payload.longitude),
                mapUrl: String(payload.resolvedUrl || cleanUrl).trim()
            };
        } catch (e) {
            return null;
        }
    };

    const selectMapSuggestion = (item = null) => {
        const suggestion = toSuggestionItem(item);
        if (!suggestion) return;
        setSelectedMapSuggestion(suggestion);
        setMapQuery(suggestion.label);
        setMapEmbedUrl(buildMapEmbedUrl(suggestion.seed));
        setMapSuggestions([]);
    };

    const openMapModal = async ({ query = '', mapUrl = '', latitude = null, longitude = null } = {}) => {
        const lat = parseMapCoord(latitude);
        const lng = parseMapCoord(longitude);
        const hasCoords = isValidMapLat(lat) && isValidMapLng(lng);

        const initialSeed = hasCoords
            ? `${lat},${lng}`
            : String(mapUrl || query || '').trim();
        const normalizedSeed = normalizeMapSeed(initialSeed);

        setShowMapModal(true);
        setSelectedMapSuggestion(null);
        setMapSuggestions([]);
        setMapQuery(normalizedSeed || initialSeed || '');
        setMapEmbedUrl(buildMapEmbedUrl(normalizedSeed || initialSeed));

        if (/^https?:\/\//i.test(initialSeed)) {
            setMapResolveLoading(true);
            const resolved = await resolveMapUrlViaApi(initialSeed);
            setMapResolveLoading(false);
            if (!resolved) return;

            const resolvedSeed = normalizeMapSeed(resolved.seed || resolved.mapUrl || initialSeed);
            const resolvedSuggestion = toSuggestionItem({
                id: resolved.mapUrl || resolvedSeed,
                label: resolvedSeed || initialSeed,
                latitude: resolved.latitude,
                longitude: resolved.longitude,
                mapUrl: resolved.mapUrl
            });

            if (resolvedSuggestion) {
                setSelectedMapSuggestion(resolvedSuggestion);
                setMapQuery(resolvedSuggestion.label);
                setMapEmbedUrl(buildMapEmbedUrl(resolvedSuggestion.seed));
            }
        }
    };

    const submitMapSearch = async (event) => {
        event.preventDefault();
        if (selectedMapSuggestion) {
            setMapEmbedUrl(buildMapEmbedUrl(selectedMapSuggestion.seed));
            return;
        }

        const currentQuery = String(mapQuery || '').trim();
        if (!currentQuery) {
            setMapEmbedUrl('');
            return;
        }

        if (/^https?:\/\//i.test(currentQuery)) {
            setMapResolveLoading(true);
            const resolved = await resolveMapUrlViaApi(currentQuery);
            setMapResolveLoading(false);
            if (resolved) {
                const suggestion = toSuggestionItem({
                    id: resolved.mapUrl || resolved.seed,
                    label: normalizeMapSeed(resolved.seed || resolved.mapUrl || currentQuery) || currentQuery,
                    latitude: resolved.latitude,
                    longitude: resolved.longitude,
                    mapUrl: resolved.mapUrl
                });
                if (suggestion) {
                    setSelectedMapSuggestion(suggestion);
                    setMapQuery(suggestion.label);
                    setMapEmbedUrl(buildMapEmbedUrl(suggestion.seed));
                    return;
                }
            }
        }

        setMapEmbedUrl(buildMapEmbedUrl(currentQuery));
    };

    useEffect(() => {
        if (!showMapModal) {
            setMapSuggestions([]);
            setMapSuggestionsLoading(false);
            return;
        }

        const query = String(mapQuery || '').trim();
        if (!query || query.length < 2 || /^https?:\/\//i.test(query)) {
            setMapSuggestions([]);
            setMapSuggestionsLoading(false);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setMapSuggestionsLoading(true);
                const encoded = encodeURIComponent(query);
                const response = await fetch(`${API_URL}/api/map-suggest?q=${encoded}&limit=8`, {
                    headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
                });
                const payload = await response.json();
                if (cancelled) return;
                const items = Array.isArray(payload?.items)
                    ? payload.items.map((item) => toSuggestionItem(item)).filter(Boolean)
                    : [];
                setMapSuggestions(items);
            } catch (e) {
                if (!cancelled) setMapSuggestions([]);
            } finally {
                if (!cancelled) setMapSuggestionsLoading(false);
            }
        }, 260);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [mapQuery, showMapModal]);

    const mapExternalUrl = selectedMapSuggestion?.mapUrl
        || (mapEmbedUrl ? buildExternalMapUrl(mapQuery) : '');

    const shareMapSelection = () => {
        const selected = selectedMapSuggestion;
        const externalUrl = selected?.mapUrl || mapExternalUrl;
        if (!externalUrl) return;

        const header = selected?.label ? `${selected.label}\n` : '';
        const composed = `${header}${externalUrl}`.trim();
        if (typeof inputProps?.setInputText === 'function') {
            inputProps.setInputText(composed);
        }
        setShowMapModal(false);
    };

    const canShareLocation = Boolean(selectedMapSuggestion?.mapUrl || mapExternalUrl);

    return (
        <div
            className={`chat-window drop-zone ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Chat Header */}
            <div className="chat-header chat-header-pro" onClick={() => setShowClientProfile(v => !v)}>
                <div
                    className="chat-header-avatar chat-header-avatar--module"
                    style={{
                        background: headerAvatarImageUrl
                            ? `url(${headerAvatarImageUrl}) center/cover`
                            : avatarColor(headerModuleName || activeChatDetails?.name),
                    }}
                >
                    {!headerAvatarImageUrl && headerAvatarFallback}
                    <span
                        className={`chat-header-avatar-channel chat-header-avatar-channel--${headerChannelMarker.key}`}
                        title={headerChannelMarker.label}
                    >
                        <ChannelBrandIcon
                            channelType={headerChannelMarker.key}
                            className="chat-header-avatar-channel-icon"
                            size={10}
                            title={headerChannelMarker.label}
                        />
                    </span>
                </div>
                <div className="chat-header-meta">
                    <div className="chat-header-title-row">
                        <h3 className="chat-header-name">{activeChatDetails?.name || 'Sin nombre'}</h3>
                        {activeChatDetails?.isBusiness && <span className="chat-header-pill">Business</span>}
                        {showHeaderModule && (
                            <span className="chat-header-module-pill" title={headerModuleName || 'Modulo'}>
                                {headerModuleImageUrl
                                    ? <img src={headerModuleImageUrl} alt={headerModuleName || 'Modulo'} className="chat-header-module-avatar" />
                                    : <span className="chat-header-module-dot" aria-hidden="true" />}
                                <span className="chat-header-module-name">{headerModuleName || 'MODULO'}</span>
                                {headerModuleChannel && (
                                    <span className="chat-header-module-channel">
                                        <ChannelBrandIcon
                                            channelType={headerModuleChannelType}
                                            className="chat-header-module-channel-icon"
                                            size={10}
                                            title={headerModuleChannel}
                                        />
                                        {headerModuleChannel}
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                    <div className="chat-header-subline">
                        <span className="chat-header-primary">{headerSubline}</span>
                        <span className="chat-header-dot">|</span>
                        <span className="chat-header-secondary">{headerHint}</span>
                    </div>
                    {!!activeChatDetails?.labels?.length && (
                        <div className="chat-header-labels">
                            {activeChatDetails.labels.slice(0, 3).map((l, i) => (
                                <span
                                    key={i}
                                    className="chat-header-label-chip"
                                    style={{ '--label-color': l.color || '#7a8f9a' }}
                                >
                                    {l.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="chat-header-actions" onClick={e => e.stopPropagation()}>
                    <button className={`btn-icon ui-icon-btn chat-header-action-btn ${searchVisible ? 'active' : ''}`}
                        onClick={() => setSearchVisible(v => !v)} title="Buscar en chat">
                        <Search size={20} />
                    </button>
                    <button className={`btn-icon ui-icon-btn chat-header-action-btn ${showMapModal ? 'active' : ''}`}
                        onClick={() => openMapModal({ query: '' })}
                        title="Abrir mapa">
                        <MapPin size={20} />
                    </button>
                    <div className="chat-header-menu-wrap">
                        <button className={`btn-icon ui-icon-btn chat-header-action-btn ${showLabelMenu ? 'active' : ''}`}
                            onClick={() => setShowLabelMenu(v => !v)} title="Etiquetas">
                            <Tag size={20} />
                        </button>
                        {showLabelMenu && (
                            <div className="chat-header-popover chat-header-label-popover">
                                <div className="chat-header-popover-title">Etiquetas del tenant (CRM)</div>
                                {labelDefinitions.length === 0 && <div className="chat-header-popover-empty">No hay etiquetas disponibles.</div>}
                                {labelDefinitions.map((label) => {
                                    const isActive = (activeChatDetails?.labels || []).some((l) => String(l.id) === String(label.id));
                                    return (
                                        <label key={label.id || label.name} className="chat-header-label-option">
                                            <input type="checkbox" checked={isActive} onChange={() => onToggleChatLabel?.(activeChatDetails?.id, label.id)} />
                                            <span className="chat-header-label-color" style={{ background: label.color || '#8696a0' }} />
                                            <span className="chat-header-label-name">{label.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="chat-header-menu-wrap">
                        <button className="btn-icon ui-icon-btn chat-header-action-btn"
                            onClick={() => setShowMenu(v => !v)} title="Mas opciones">
                            <MoreVertical size={20} />
                        </button>
                        {showMenu && (
                            <div className="chat-header-popover chat-header-actions-popover">
                                {[
                                    { label: 'Ver perfil del contacto', action: () => setShowClientProfile(true) },
                                    { label: 'Buscar mensajes', action: () => setSearchVisible(true) },
                                    {
                                        label: activeChatDetails?.pinned ? 'Desfijar chat' : 'Fijar chat',
                                        action: () => onToggleChatPinned?.(activeChatDetails?.id, !Boolean(activeChatDetails?.pinned))
                                    },
                                    { label: 'Modo Copiloto IA', action: () => setIsCopilotMode(v => !v) },
                                ].map((item, i) => (
                                    <div key={i}
                                        onClick={() => { item.action(); setShowMenu(false); }}
                                        className="chat-header-action-item"
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
                    const senderDisplayName = resolveGroupSenderName(msg);
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
                                    onLoadOrderToCart={inputProps?.onLoadOrderToCart}
                                    onOpenMedia={setLightboxMedia}
                                    onOpenMap={openMapModal}
                                    onOpenPhoneChat={inputProps?.onStartNewChat}
                                    onEditMessage={onEditMessage}
                                    onReplyMessage={onReplyMessage}
                                    onForwardMessage={onForwardMessage}
                                    onDeleteMessage={onDeleteMessage}
                                    forwardChatOptions={forwardChatOptions}
                                    activeChatId={activeChatDetails?.id}
                                    showSenderName={Boolean(activeChatDetails?.isGroup && !msg?.fromMe)}
                                    senderDisplayName={senderDisplayName}
                                    canEditMessages={canEditMessages}
                                    buildApiHeaders={buildApiHeaders}
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

            {showMapModal && (
                <div className="chat-lightbox" onClick={() => setShowMapModal(false)}>
                    <div className="chat-lightbox-content map-lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="chat-lightbox-close" onClick={() => setShowMapModal(false)} aria-label="Cerrar mapa">
                            <X size={20} />
                        </button>

                        <form className="map-search-form" onSubmit={submitMapSearch}>
                            <input
                                className="map-search-input"
                                placeholder="Busca una direccion o pega un link de mapa"
                                value={mapQuery}
                                onChange={(e) => {
                                    setMapQuery(e.target.value);
                                    setSelectedMapSuggestion(null);
                                }}
                            />
                            <button type="submit" className="map-search-btn" disabled={mapResolveLoading}>
                                {mapResolveLoading ? 'Resolviendo...' : 'Buscar'}
                            </button>
                            {mapExternalUrl && (
                                <a
                                    className="map-open-external"
                                    href={mapExternalUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Abrir
                                </a>
                            )}
                            <button
                                type="button"
                                className="map-share-btn"
                                onClick={shareMapSelection}
                                disabled={!canShareLocation}
                                title="Copiar ubicacion al mensaje"
                            >
                                <Share2 size={14} /> Compartir
                            </button>
                        </form>

                        {(mapSuggestionsLoading || mapSuggestions.length > 0) && (
                            <div className="map-suggest-list">
                                {mapSuggestionsLoading && <div className="map-suggest-empty">Buscando lugares...</div>}
                                {!mapSuggestionsLoading && mapSuggestions.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`map-suggest-item ${selectedMapSuggestion?.id === item.id ? 'active' : ''}`}
                                        onClick={() => selectMapSuggestion(item)}
                                    >
                                        <span className="map-suggest-title">{item.label}</span>
                                        {(item.latitude !== null && item.longitude !== null) && (
                                            <span className="map-suggest-coords">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {mapEmbedUrl ? (
                            <iframe
                                title="Mapa"
                                src={mapEmbedUrl}
                                className="map-lightbox-iframe"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        ) : (
                            <div className="map-lightbox-empty">Busca y selecciona un lugar para previsualizarlo.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <ChatInput {...inputProps} replyingMessage={inputProps?.replyingMessage} onCancelReplyMessage={inputProps?.onCancelReplyMessage} onOpenMapPicker={() => openMapModal({ query: '' })} buildApiHeaders={buildApiHeaders} />
        </div>
    );
};

export { ChatInput };
export default ChatWindow;

