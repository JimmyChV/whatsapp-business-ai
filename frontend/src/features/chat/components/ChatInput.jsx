import React, { useState, useRef, useEffect } from 'react';
import { Smile, Bot, Sparkles, X, Paperclip, Send, MapPin, LayoutTemplate } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { EmojiStyle, SkinTonePickerLocation, SkinTones, SuggestionMode, Theme } from 'emoji-picker-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const GLOBAL_SKIN_TONE_STORAGE_KEY = 'chat-emoji-skin-tone:global';

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
    onOpenSendTemplate,
    buildApiHeaders,
    windowOpen = true,
    focusChatKey = ''
}) => {
    const [showEmoji, setShowEmoji] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [linkPreview, setLinkPreview] = useState(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [selectionState, setSelectionState] = useState(null);
    const [preferredSkinTone, setPreferredSkinTone] = useState(SkinTones.NEUTRAL);
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
    const isTemplateOnlyMode = windowOpen === false;
    const isBlockedByEditState = Boolean(editingMessage?.id);
    const disableFreeformComposer = isTemplateOnlyMode || isBlockedByEditState;
    const canSendFreeform = !isTemplateOnlyMode && (Boolean(inputText.trim()) || Boolean(attachment) || Boolean(hasDraftQuickReply));

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

    const handleSkinToneChange = (skinTone) => {
        const safeSkinTone = Object.values(SkinTones).includes(skinTone) ? skinTone : SkinTones.NEUTRAL;
        setPreferredSkinTone(safeSkinTone);
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(GLOBAL_SKIN_TONE_STORAGE_KEY, safeSkinTone);
        } catch (_) { }
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
        if (!focusChatKey || disableFreeformComposer) return;
        const timer = setTimeout(() => {
            if (!inputRef.current || document.activeElement === inputRef.current) return;
            inputRef.current.focus();
            const len = String(inputRef.current.value || '').length;
            inputRef.current.setSelectionRange(len, len);
        }, 0);
        return () => clearTimeout(timer);
    }, [disableFreeformComposer, focusChatKey]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            setPreferredSkinTone(SkinTones.NEUTRAL);
            return;
        }
        try {
            const stored = String(window.localStorage.getItem(GLOBAL_SKIN_TONE_STORAGE_KEY) || '').trim();
            if (Object.values(SkinTones).includes(stored)) {
                setPreferredSkinTone(stored);
                return;
            }
        } catch (_) { }
        setPreferredSkinTone(SkinTones.NEUTRAL);
    }, []);

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
                <div className="chat-draft-banner chat-draft-banner--reply" style={{
                    position: 'absolute',
                    left: '12px',
                    right: '12px',
                    bottom: '100%',
                    marginBottom: '4px',
                    zIndex: 39
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div className="chat-draft-banner__title">
                            Respondiendo {replyingMessage?.fromMe ? 'tu mensaje' : 'mensaje del cliente'}
                        </div>
                        <div className="chat-draft-banner__text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(replyingMessage?.body || '').trim() || 'Mensaje sin texto'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onCancelReplyMessage && onCancelReplyMessage()}
                        className="chat-draft-banner__action"
                        style={{ borderRadius: '8px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
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
                    marginBottom: replyingMessage?.id ? '62px' : '8px',
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
                        onSkinToneChange={handleSkinToneChange}
                        width="100%"
                        height={430}
                        lazyLoadEmojis
                        skinTonesDisabled={false}
                        searchDisabled={false}
                        searchPlaceHolder="Buscar emoji o gesto"
                        defaultSkinTone={preferredSkinTone}
                        suggestedEmojisMode={SuggestionMode.FREQUENT}
                        skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
                        emojiStyle={EmojiStyle.APPLE}
                        previewConfig={{ showPreview: false }}
                        theme={Theme.DARK}
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
                <button
                    className={`btn-icon ui-icon-btn ${showEmoji ? 'active' : ''}`}
                    onClick={() => setShowEmoji(v => !v)}
                    title="Emojis"
                    disabled={isTemplateOnlyMode}
                    style={{ opacity: isTemplateOnlyMode ? 0.45 : 1, cursor: isTemplateOnlyMode ? 'not-allowed' : 'pointer' }}
                >
                    <Smile size={26} />
                </button>
                <button className="btn-icon ui-icon-btn" onClick={onFileClick} title="Adjuntar archivo" disabled={disableFreeformComposer} style={{ opacity: disableFreeformComposer ? 0.45 : 1, cursor: disableFreeformComposer ? 'not-allowed' : 'pointer' }}>
                    <Paperclip size={26} />
                </button>
                <button
                    className="btn-icon ui-icon-btn"
                    onClick={() => onOpenMapPicker && onOpenMapPicker()}
                    title="Buscar o compartir ubicacion"
                    disabled={disableFreeformComposer}
                    style={{ opacity: disableFreeformComposer ? 0.45 : 1, cursor: disableFreeformComposer ? 'not-allowed' : 'pointer' }}
                >
                    <MapPin size={24} />
                </button>
                <button
                    className={`btn-icon ui-icon-btn ${isTemplateOnlyMode ? 'active chat-input-template-primary' : ''}`}
                    onClick={() => onOpenSendTemplate && onOpenSendTemplate()}
                    title="Enviar template"
                    disabled={Boolean(editingMessage?.id)}
                    style={{ opacity: editingMessage?.id ? 0.45 : 1, cursor: editingMessage?.id ? 'not-allowed' : 'pointer' }}
                >
                    <LayoutTemplate size={23} />
                </button>
            </div>

            <div className="input-container chat-composer-field">
                <textarea
                    ref={inputRef}
                    className="message-input"
                    placeholder={
                        isTemplateOnlyMode
                            ? 'Usa un template aprobado para contactar a este cliente...'
                            : (editingMessage?.id ? 'Edita el mensaje y presiona Enter...' : (replyingMessage?.id ? 'Escribe tu respuesta y presiona Enter...' : 'Escribe un mensaje...'))
                    }
                    value={inputText}
                    onChange={handleInputChange}
                    disabled={isTemplateOnlyMode}
                    onKeyDown={(e) => {
                        if (isTemplateOnlyMode && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
                            e.preventDefault();
                            return;
                        }
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
                            if (isTemplateOnlyMode) return;
                            onSendMessage();
                            return;
                        }
                        onKeyDown && onKeyDown(e);
                    }}
                    rows={1}
                    style={{ padding: '6px 12px', minHeight: '24px', maxHeight: '220px', resize: 'none', overflowY: 'auto' }}
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
                    disabled={isTemplateOnlyMode}
                >
                    <Bot size={22} />
                </button>
                {/* Send button */}
                <button
                    className="send-button send-button-modern"
                    onClick={() => {
                        if (!canSendFreeform) return;
                        onSendMessage();
                    }}

                    title={editingMessage?.id ? 'Guardar edicion' : (replyingMessage?.id ? 'Enviar respuesta' : 'Enviar')}
                    disabled={!canSendFreeform}
                    style={{
                        opacity: canSendFreeform ? 1 : 0.55,
                        cursor: canSendFreeform ? 'pointer' : 'not-allowed'
                    }}
                >
                    <Send size={26} />
                </button>
            </div>
        </div>
    );
};

export default ChatInput;
