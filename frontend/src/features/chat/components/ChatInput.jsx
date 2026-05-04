import React, { startTransition, useState, useRef, useEffect, useMemo } from 'react';
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
    windowOpen = true
}) => {
    const [showEmoji, setShowEmoji] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [linkPreview, setLinkPreview] = useState(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [selectionState, setSelectionState] = useState(null);
    const [preferredSkinTone, setPreferredSkinTone] = useState(SkinTones.NEUTRAL);
    const [emojiTheme, setEmojiTheme] = useState(() => (
        typeof document !== 'undefined' && document.documentElement?.getAttribute('data-theme') === 'light'
            ? Theme.LIGHT
            : Theme.DARK
    ));
    const inputRef = useRef(null);
    const chatInputRef = useRef(null);
    // localText drives the controlled textarea so the 'input' handler stays fast.
    // setInputText (parent state) is deferred via startTransition so expensive
    // ancestor re-renders don't block the keystroke paint.
    const lastUserInputRef = useRef(inputText);
    const [localText, setLocalText] = useState(() => inputText);
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
    const canSendFreeform = !isTemplateOnlyMode && (Boolean(localText.trim()) || Boolean(attachment) || Boolean(hasDraftQuickReply));

    const handleInputChange = (e) => {
        const val = e.target.value;
        lastUserInputRef.current = val;
        setLocalText(val);                          // fast — only re-renders ChatInput
        setShowCommands(val.startsWith('/'));
        if (showEmoji) setShowEmoji(false);
    };

    // Used by one-off format actions (emoji, bold, etc.) to keep the local draft in sync.
    const setTextBoth = (val) => {
        lastUserInputRef.current = val;
        setLocalText(val);
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
            setTextBoth(`${localText}${emoji}`);
            setShowEmoji(false);
            return;
        }
        const start = Number(el.selectionStart || 0);
        const end = Number(el.selectionEnd || 0);
        const current = el.value;
        const next = `${current.slice(0, start)}${emoji}${current.slice(end)}`;
        setTextBoth(next);
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
        const current = el.value;
        const selected = current.slice(start, end);
        const wrapped = `${openToken}${selected}${closeToken}`;
        const next = `${current.slice(0, start)}${wrapped}${current.slice(end)}`;
        setTextBoth(next);
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

        const current = el.value;
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
        setTextBoth(next);
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

        const current = el.value;
        const selected = current.slice(start, end);
        const wrapped = `\`\`\`\n${selected}\n\`\`\``;
        const next = `${current.slice(0, start)}${wrapped}${current.slice(end)}`;
        setTextBoth(next);
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

        const current = el.value;
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
        setTextBoth(next);
        requestAnimationFrame(() => {
            if (!inputRef.current) return;
            inputRef.current.focus();
            inputRef.current.setSelectionRange(nextCursor, nextCursor);
            setSelectionState(null);
        });
        return true;
    };

    const normalizedSlashQuery = useMemo(() =>
        String(localText || '').startsWith('/')
            ? String(localText || '').slice(1).trim().toLowerCase()
            : '',
    [localText]);

    const slashTokens = useMemo(() =>
        normalizedSlashQuery
            ? normalizedSlashQuery.split(/\s+/).map((entry) => entry.trim()).filter(Boolean)
            : [],
    [normalizedSlashQuery]);

    const filteredQuickReplies = useMemo(() =>
        (Array.isArray(quickReplies) ? quickReplies : [])
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
            .map((entry) => entry.item),
    [quickReplies, slashTokens, normalizedSlashQuery]);

    const selectQuickReply = (item = {}) => {
        const entry = item && typeof item === 'object' ? item : null;
        if (!entry) return;
        if (typeof onSendQuickReply === 'function') onSendQuickReply(entry);
        else setTextBoth(String(entry?.text || '').trim());
        setShowCommands(false);
    };

    const extractFirstUrl = (text) => {
        const match = String(text || '').match(/https?:\/\/[^\s]+/i);
        return match ? match[0] : null;
    };


    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        // Defer the reflow to the next animation frame so it doesn't block the keystroke paint.
        const raf = requestAnimationFrame(() => {
            el.style.height = '24px';
            const next = Math.min(el.scrollHeight, 220);
            el.style.height = `${next}px`;
        });
        return () => cancelAnimationFrame(raf);
    }, [localText]);

    useEffect(() => {
        if (localText === inputText) return undefined;
        const timer = setTimeout(() => {
            startTransition(() => setInputText(localText));
        }, 180);
        return () => clearTimeout(timer);
    }, [inputText, localText, setInputText]);

    // Sync localText when the parent changes inputText externally (AI suggestion,
    // reply prefill, chat switch clearing the field, etc.).
    // Skip if the change came from our own typing (lastUserInputRef tracks that).
    useEffect(() => {
        if (inputText === lastUserInputRef.current) return;
        lastUserInputRef.current = inputText;
        setLocalText(inputText);
    }, [inputText]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const inputLen = String(localText || '').length;
        if (selectionState.start >= inputLen || selectionState.end > inputLen) {
            setSelectionState(null);
        }
    }, [localText, selectionState]);

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
        if (typeof document === 'undefined') return undefined;
        const root = document.documentElement;
        if (!root) return undefined;
        const syncTheme = () => {
            setEmojiTheme(root.getAttribute('data-theme') === 'light' ? Theme.LIGHT : Theme.DARK);
        };
        syncTheme();
        const observer = new MutationObserver(syncTheme);
        observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const url = extractFirstUrl(localText);
        if (!url) {
            setLinkPreview(prev => (prev !== null ? null : prev));
            setIsLoadingPreview(prev => (prev ? false : prev));
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
    }, [localText]);

    return (
        <div className="chat-input-area chat-input-area-pro" style={{ position: 'relative' }} ref={chatInputRef}>
            {editingMessage?.id && (
                <div className="chat-draft-banner chat-draft-banner--edit" style={{
                    position: 'absolute',
                    left: '12px',
                    right: '12px',
                    bottom: '100%',
                    marginBottom: '8px',
                    border: '1px solid var(--chat-success-border)',
                    background: 'var(--chat-success-surface)',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    zIndex: 40
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div className="chat-draft-banner__title" style={{ fontSize: '0.72rem', color: 'var(--chat-success-text)', fontWeight: 700, marginBottom: '2px' }}>Editando mensaje</div>
                        <div className="chat-draft-banner__text" style={{ fontSize: '0.78rem', color: 'var(--chat-control-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(editingMessage?.originalBody || '').trim() || 'Mensaje sin texto'}
                        </div>
                    </div>
                    <button
                        type="button"
                        className="chat-draft-banner__action"
                        onClick={() => onCancelEditMessage && onCancelEditMessage()}
                        style={{ border: '1px solid var(--chat-card-border)', background: 'transparent', color: 'var(--chat-control-text)', borderRadius: '8px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
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
                    marginBottom: '8px',
                    border: '1px solid var(--chat-info-border)',
                    background: 'var(--chat-info-surface)',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    zIndex: 39
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div className="chat-draft-banner__title" style={{ fontSize: '0.72rem', color: 'var(--chat-info-text)', fontWeight: 700, marginBottom: '2px' }}>
                            Respondiendo {replyingMessage?.fromMe ? 'tu mensaje' : 'mensaje del cliente'}
                        </div>
                        <div className="chat-draft-banner__text" style={{ fontSize: '0.78rem', color: 'var(--chat-control-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {String(replyingMessage?.body || '').trim() || 'Mensaje sin texto'}
                        </div>
                    </div>
                    <button
                        type="button"
                        className="chat-draft-banner__action"
                        onClick={() => onCancelReplyMessage && onCancelReplyMessage()}
                        style={{ border: '1px solid var(--chat-card-border)', background: 'transparent', color: 'var(--chat-control-text)', borderRadius: '8px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                </div>
            )}

            {!editingMessage?.id && hasDraftQuickReply && (
                <div className="chat-draft-banner chat-draft-banner--quick-reply" style={{
                    position: 'absolute',
                    left: '12px',
                    right: '12px',
                    bottom: '100%',
                    marginBottom: replyingMessage?.id ? '74px' : '8px',
                    border: '1px solid var(--chat-success-border)',
                    background: 'var(--chat-success-surface)',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    zIndex: 38
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div className="chat-draft-banner__title" style={{ fontSize: '0.72rem', color: 'var(--chat-success-text)', fontWeight: 700, marginBottom: '2px' }}>
                            Respuesta rapida cargada{draftQuickReplyLabel ? `: ${draftQuickReplyLabel}` : ''}
                        </div>
                        <div className="chat-draft-banner__text" style={{ fontSize: '0.78rem', color: 'var(--chat-control-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {draftQuickReplyText || `Adjuntos: ${draftQuickReplyAssets.length}`}
                        </div>
                        {draftQuickReplyPreviewAssets.length > 0 && (
                            <div className="chat-draft-banner__attachments" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                {draftQuickReplyPreviewAssets.slice(0, 3).map((asset, assetIdx) => (
                                    <div key={`draft_qr_preview_${assetIdx}`} className="chat-draft-banner__attachment" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--chat-card-border)', background: 'var(--chat-card-surface-alt)', maxWidth: '230px' }}>
                                        {asset.isImage ? (
                                            <img src={asset.previewUrl} alt={asset.name} style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                                        ) : (
                                            <span style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px dashed var(--chat-card-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--chat-control-text-soft)', flexShrink: 0 }}>
                                                {String(asset?.mimeType || 'file').split('/')[1] || 'file'}
                                            </span>
                                        )}
                                        <div style={{ minWidth: 0 }}>
                                            <div className="chat-draft-banner__attachment-name" style={{ fontSize: '0.72rem', color: 'var(--chat-control-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {asset.name}
                                            </div>
                                            <div className="chat-draft-banner__attachment-meta" style={{ fontSize: '0.66rem', color: 'var(--chat-control-text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {(asset.mimeType || 'archivo').replace('application/', '')}
                                                {asset.sizeBytes ? ` | ${formatAssetBytes(asset.sizeBytes)}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {draftQuickReplyPreviewAssets.length > 3 && (
                                    <div style={{ fontSize: '0.68rem', color: 'var(--chat-control-text-soft)' }}>+{draftQuickReplyPreviewAssets.length - 3} adjuntos</div>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="chat-draft-banner__action"
                        onClick={() => onClearQuickReplyDraft && onClearQuickReplyDraft()}
                        style={{ border: '1px solid var(--chat-card-border)', background: 'transparent', color: 'var(--chat-control-text)', borderRadius: '8px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                        Limpiar
                    </button>
                </div>
            )}

            {/* Commands popover */}
            {showCommands && (
                <div className="floating-panel commands-panel">
                    <div style={{ padding: '6px 14px', color: 'var(--chat-success-text)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' }}>RESPUESTAS RAPIDAS</div>
                    {filteredQuickReplies.length === 0 && (
                        <div style={{ padding: '10px 14px', color: 'var(--chat-control-text-soft)', fontSize: '0.78rem' }}>
                            No hay respuestas rapidas para este modulo.
                        </div>
                    )}
                    {filteredQuickReplies.map((item) => (
                        <div key={String(item?.id || item?.label || Math.random())} onClick={() => selectQuickReply(item)}
                            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--chat-button-ghost-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <Sparkles size={15} color="var(--chat-success-text)" />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {String(item?.label || 'Respuesta rapida')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--chat-control-text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                        theme={emojiTheme}
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
                        <div style={{ fontSize: '0.72rem', color: 'var(--chat-success-text)', marginBottom: '2px' }}>
                            {isLoadingPreview ? 'Cargando vista previa...' : 'Vista previa del enlace'}
                        </div>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {linkPreview?.title || linkPreview?.siteName || linkPreview?.url}
                        </div>
                        {linkPreview?.description && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--chat-control-text-soft)', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
                        <div style={{ padding: '15px', background: 'var(--chat-card-surface-alt)', border: '1px solid var(--chat-card-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--chat-control-text)' }}>
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
                    value={localText}
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
                            const didSend = onSendMessage(localText);
                            if (didSend !== false) {
                                lastUserInputRef.current = '';
                                setLocalText('');
                                setShowCommands(false);
                            }
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
                    style={{ color: isAiLoading ? 'var(--saas-accent-info)' : 'var(--chat-control-text-soft)', animation: isAiLoading ? 'spin 2s linear infinite' : 'none' }}
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
                        const didSend = onSendMessage(localText);
                        if (didSend !== false) {
                            lastUserInputRef.current = '';
                            setLocalText('');
                            setShowCommands(false);
                        }
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
