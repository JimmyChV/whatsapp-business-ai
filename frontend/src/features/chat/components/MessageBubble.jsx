import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { Check, CheckCheck, ShoppingBag, Pencil, MapPin, ExternalLink, Reply, Forward, ChevronDown, Download } from 'lucide-react';
import {
    renderWhatsAppFormattedText,
    parseOrderMoneyValue,
    formatOrderMoney,
    isLikelyBinaryBody,
    normalizeSearchText,
    parseQuoteItemsFromBody,
    parseQuotePaymentFromBody,
    resolveLocationData,
    extractFirstNonMapUrlFromText,
    getGroupSenderColor,
    buildAttachmentMeta,
    renderAttachmentIcon,
    extractPhoneCandidatesFromText
} from './messageBubble.helpers';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const linkPreviewCache = new Map();

const MessageBubble = ({
    msg,
    onPrefillMessage,
    onLoadOrderToCart,
    isHighlighted = false,
    isCurrentHighlighted = false,
    onOpenMedia,
    onOpenMap,
    onOpenPhoneChat,
    onEditMessage,
    onReplyMessage,
    onForwardMessage,
    forwardChatOptions = [],
    activeChatId = null,
    canEditMessages = true,
    showSenderName = false,
    senderDisplayName = '',
    buildApiHeaders,
}) => {
    const isOut = msg.fromMe;

    const isCatalogItem = msg.body && msg.body.includes('REF:');
    const catalogMatch = isCatalogItem ? msg.body.match(/REF: (.*)\nPrecio: (.*)/) : null;
    const productTitle = catalogMatch ? catalogMatch[1] : null;
    const productPrice = catalogMatch ? catalogMatch[2] : null;

    const messageBodyText = String(msg?.body || '');
    const quoteItemsFromBody = parseQuoteItemsFromBody(messageBodyText);
    const quotePaymentFromBody = parseQuotePaymentFromBody(messageBodyText);
    const quoteOrderPayload = quoteItemsFromBody.length > 0
        ? {
            orderId: null,
            currency: 'PEN',
            subtotal: Number.isFinite(quotePaymentFromBody?.subtotal)
                ? quotePaymentFromBody.subtotal
                : (Number.isFinite(quotePaymentFromBody?.totalAfterDiscount) ? quotePaymentFromBody.totalAfterDiscount : null),
            products: quoteItemsFromBody,
            rawPreview: {
                type: 'quote',
                itemCount: quoteItemsFromBody.length,
                title: 'Cotizacion',
                quoteSummary: quotePaymentFromBody || null
            }
        }
        : null;

    const hasOrder = Boolean(msg?.order);
    const actionOrder = hasOrder ? msg.order : quoteOrderPayload;
    const orderRawType = String(actionOrder?.rawPreview?.type || msg?.type || '').toLowerCase();
    const orderItems = Array.isArray(actionOrder?.products) ? actionOrder.products : [];
    const firstOrderItem = orderItems[0] || null;
    const rawItemCount = parseOrderMoneyValue(actionOrder?.rawPreview?.itemCount);
    const reportedItemCount = Number.isFinite(rawItemCount) ? Math.max(0, Math.round(rawItemCount)) : orderItems.length;
    const isProductPayload = orderRawType.includes('product');
    const isOrderPayload = orderRawType.includes('order') || Boolean(actionOrder?.orderId);
    const bodyNormalized = normalizeSearchText(messageBodyText);
    const isQuotePayload = orderRawType.includes('quote') || (bodyNormalized.includes('cotizacion') && orderItems.length > 0);
    const isOrderActionable = Boolean(actionOrder) && (isOrderPayload || isQuotePayload || isProductPayload);
    const orderActionLabel = isProductPayload ? 'Anadir al carrito' : 'Ver en carrito';
    const rawOrderNote = String(actionOrder?.rawPreview?.body || '').trim();
    const safeOrderNote = isLikelyBinaryBody(rawOrderNote) ? '' : rawOrderNote;
    const orderSubtotalLabel = formatOrderMoney(actionOrder?.subtotal, actionOrder?.currency || 'PEN');
    const quoteSummaryRaw = isQuotePayload
        ? (actionOrder?.rawPreview?.quoteSummary || quotePaymentFromBody || null)
        : null;
    const quoteCurrency = actionOrder?.currency || 'PEN';
    const quoteSubtotal = parseOrderMoneyValue(quoteSummaryRaw?.subtotal ?? actionOrder?.subtotal);
    const quoteDiscount = parseOrderMoneyValue(quoteSummaryRaw?.discount);
    const quoteTotalAfterDiscount = parseOrderMoneyValue(quoteSummaryRaw?.totalAfterDiscount)
        ?? ((Number.isFinite(quoteSubtotal) && Number.isFinite(quoteDiscount))
            ? Math.max(0, Math.round((quoteSubtotal - quoteDiscount) * 100) / 100)
            : null);
    const quoteDelivery = parseOrderMoneyValue(quoteSummaryRaw?.deliveryAmount);
    const quoteTotalPayable = parseOrderMoneyValue(quoteSummaryRaw?.totalPayable)
        ?? ((Number.isFinite(quoteTotalAfterDiscount) && Number.isFinite(quoteDelivery))
            ? Math.max(0, Math.round((quoteTotalAfterDiscount + quoteDelivery) * 100) / 100)
            : null);
    const quoteSubtotalLabel = formatOrderMoney(quoteSubtotal, quoteCurrency);
    const quoteDiscountLabel = formatOrderMoney(quoteDiscount, quoteCurrency);
    const quoteTotalAfterDiscountLabel = formatOrderMoney(quoteTotalAfterDiscount, quoteCurrency);
    const quoteDeliveryLabel = quoteSummaryRaw?.deliveryFree
        ? 'Gratuito'
        : formatOrderMoney(quoteDelivery, quoteCurrency);
    const quoteTotalPayableLabel = formatOrderMoney(quoteTotalPayable, quoteCurrency);
    const locationData = resolveLocationData(msg);
    const isLocationMessage = Boolean(locationData);
    const [selectedLocationText, setSelectedLocationText] = useState('');
    const [webPreview, setWebPreview] = useState(null);
    const [webPreviewLoading, setWebPreviewLoading] = useState(false);
    const [showForwardPicker, setShowForwardPicker] = useState(false);
    const [forwardSearch, setForwardSearch] = useState('');
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const bubbleRef = useRef(null);

    const shouldHideBodyForOrder = isQuotePayload || (hasOrder && isLikelyBinaryBody(messageBodyText));
    const messageTextToRender = isCatalogItem
        ? 'Te gustaria que te lo separemos?'
        : ((isLocationMessage && locationData?.source === 'native') ? '' : (shouldHideBodyForOrder ? '' : (msg.body || '')));
    const firstNonMapUrl = extractFirstNonMapUrlFromText(messageBodyText);
    const showWebPreview = Boolean(firstNonMapUrl && !isLocationMessage && !msg?.hasMedia && !hasOrder && !isCatalogItem && !isOrderActionable);
    const phoneCandidates = extractPhoneCandidatesFromText(messageTextToRender);

    useEffect(() => {
        if (!showWebPreview || !firstNonMapUrl) {
            setWebPreview(null);
            setWebPreviewLoading(false);
            return;
        }

        const cached = linkPreviewCache.get(firstNonMapUrl);
        if (cached) {
            setWebPreview(cached);
            setWebPreviewLoading(false);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setWebPreviewLoading(true);
                const encoded = encodeURIComponent(firstNonMapUrl);
                const response = await fetch(`${API_URL}/api/link-preview?url=${encoded}`, {
                    headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
                });
                const payload = await response.json();
                const nextPreview = payload?.ok
                    ? payload
                    : { ok: false, url: firstNonMapUrl, title: firstNonMapUrl };
                linkPreviewCache.set(firstNonMapUrl, nextPreview);
                if (!cancelled) setWebPreview(nextPreview);
            } catch (e) {
                const fallback = { ok: false, url: firstNonMapUrl, title: firstNonMapUrl };
                linkPreviewCache.set(firstNonMapUrl, fallback);
                if (!cancelled) setWebPreview(fallback);
            } finally {
                if (!cancelled) setWebPreviewLoading(false);
            }
        }, 180);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [firstNonMapUrl, showWebPreview]);

    useEffect(() => {
        if (!showActionsMenu && !showForwardPicker) return;

        const handleOutsideClick = (event) => {
            if (!bubbleRef.current) return;
            if (bubbleRef.current.contains(event.target)) return;
            setShowActionsMenu(false);
            setShowForwardPicker(false);
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setShowActionsMenu(false);
                setShowForwardPicker(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [showActionsMenu, showForwardPicker]);

    const hasLocationCoords = Number.isFinite(locationData?.latitude) && Number.isFinite(locationData?.longitude);
    const locationMapQuery = hasLocationCoords
        ? `${locationData.latitude},${locationData.longitude}`
        : String(locationData?.mapUrl || locationData?.label || '');
    const locationEmbedUrl = locationMapQuery
        ? `https://www.google.com/maps?q=${encodeURIComponent(locationMapQuery)}&output=embed`
        : '';

    const getAckLabel = (ackValue) => {
        const ack = Number.isFinite(Number(ackValue)) ? Number(ackValue) : 0;
        if (ack >= 4) return 'Reproducido';
        if (ack >= 3) return 'Leido';
        if (ack >= 2) return 'Entregado';
        if (ack >= 1) return 'Enviado';
        if (ack === -1) return 'Error';
        return 'Pendiente';
    };

    const renderStatus = () => {
        if (!isOut) return null;
        const ack = Number.isFinite(Number(msg.ack)) ? Number(msg.ack) : 0;
        const label = `Estado: ${getAckLabel(ack)}`;
        return (
            <span className={`message-ack ${ack >= 3 ? 'read' : ack >= 2 ? 'delivered' : ack >= 1 ? 'sent' : 'pending'}`} title={label} aria-label={label}>
                {ack >= 2 ? <CheckCheck size={16} /> : <Check size={16} />}
            </span>
        );
    };

    const mediaDataUrl = msg.hasMedia && msg.mediaData
        ? `data:${msg.mimetype || 'application/octet-stream'};base64,${msg.mediaData}`
        : null;
    const rawMediaUrl = msg.hasMedia ? String(msg?.mediaUrl || '').trim() : '';
    const mediaUrl = (() => {
        if (!rawMediaUrl) return '';
        if (/^https?:\/\//i.test(rawMediaUrl)) return rawMediaUrl;
        if (/^data:/i.test(rawMediaUrl)) return rawMediaUrl;
        const normalizedPath = rawMediaUrl.startsWith('/') ? rawMediaUrl : `/${rawMediaUrl}`;
        return `${String(API_URL || '').replace(/\/+$/, '')}${normalizedPath}`;
    })();
    const mediaImageSrc = mediaDataUrl || (mediaUrl || null);
    const mediaLooksImageByUrl = Boolean(mediaUrl && /\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(mediaUrl));
    const isImageMedia = Boolean(String(msg?.mimetype || '').trim().toLowerCase().startsWith('image/')) || mediaLooksImageByUrl;

    const hasBinaryAttachment = Boolean(
        msg.hasMedia
        && msg.mediaData
        && !msg.mimetype?.startsWith('image/')
        && !msg.mimetype?.startsWith('audio/')
    );
    const attachmentMeta = hasBinaryAttachment ? buildAttachmentMeta(msg) : null;
    const canOpenAttachmentAsPdf = Boolean(attachmentMeta && (((attachmentMeta.mimetype || msg?.mimetype || '').toLowerCase().includes('pdf')) || getFileExtensionFromName(attachmentMeta.downloadFilename || attachmentMeta.filename || '').toLowerCase() === 'pdf'));
    const normalizeBase64Payload = (value = '') => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const stripped = raw.replace(/^data:.*?;base64,/i, '');
        const cleaned = stripped.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
        const remainder = cleaned.length % 4;
        if (remainder === 0) return cleaned;
        if (remainder === 2) return `${cleaned}==`;
        if (remainder === 3) return `${cleaned}=`;
        return cleaned;
    };

    const getAttachmentObjectUrl = () => {
        if (!attachmentMeta || !msg?.mediaData) return null;
        try {
            const payload = normalizeBase64Payload(msg.mediaData);
            if (!payload) return null;
            const binary = window.atob(payload);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], {
                type: attachmentMeta.mimetype || msg?.mimetype || 'application/octet-stream'
            });
            return URL.createObjectURL(blob);
        } catch (e) {
            return null;
        }
    };

    const revokeObjectUrlLater = (url, delayMs = 120000) => {
        if (!url) return;
        window.setTimeout(() => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) { }
        }, delayMs);
    };

    const handleOpenAttachment = (event) => {
        event.preventDefault();
        if (!canOpenAttachmentAsPdf) {
            handleDownloadAttachment(event);
            return;
        }

        const objectUrl = getAttachmentObjectUrl();
        if (objectUrl) {
            const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
            if (!opened) {
                const link = document.createElement('a');
                link.href = objectUrl;
                link.target = '_blank';
                link.rel = 'noreferrer';
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
            revokeObjectUrlLater(objectUrl);
            return;
        }

        if (mediaDataUrl) {
            const fallback = document.createElement('a');
            fallback.href = mediaDataUrl;
            fallback.target = '_blank';
            fallback.rel = 'noreferrer';
            document.body.appendChild(fallback);
            fallback.click();
            fallback.remove();
        }
    };

    const handleDownloadAttachment = (event) => {
        event.preventDefault();
        const objectUrl = getAttachmentObjectUrl();
        const rawDownloadName = attachmentMeta?.downloadFilename || attachmentMeta?.filename || 'documento';
        const fallbackExt = getFileExtensionFromName(rawDownloadName) || guessExtensionFromMime(attachmentMeta?.mimetype || msg?.mimetype || '');
        const downloadName = (isGenericAttachmentFilename(rawDownloadName) || isMachineLikeAttachmentFilename(rawDownloadName))
            ? (fallbackExt ? `documento.${fallbackExt}` : 'documento')
            : rawDownloadName;

        if (objectUrl) {
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = downloadName;
            link.rel = 'noreferrer';
            document.body.appendChild(link);
            link.click();
            link.remove();
            revokeObjectUrlLater(objectUrl, 30000);
            return;
        }

        if (mediaDataUrl) {
            const fallback = document.createElement('a');
            fallback.href = mediaDataUrl;
            fallback.download = downloadName;
            fallback.rel = 'noreferrer';
            document.body.appendChild(fallback);
            fallback.click();
            fallback.remove();
        }
    };

    const messageSenderName = String(senderDisplayName || msg?.notifyName || msg?.senderPushname || '').trim();
    const senderIdentityKey = String(
        msg?.senderId
        || msg?.author
        || msg?.senderPhone
        || messageSenderName
        || ''
    ).trim().toLowerCase();
    const senderNameColor = getGroupSenderColor(senderIdentityKey);

    const sentByName = String(msg?.sentByName || msg?.sentByEmail || '').trim();
    const sentByRole = String(msg?.sentByRole || '').trim();
    const sentViaModuleName = String(msg?.sentViaModuleName || '').trim();
    const safeSentByName = sentByName.replace(/\s+/g, ' ').trim();
    const roleLabelMap = {
        superadmin: 'Superadmin',
        owner: 'Owner',
        admin: 'Admin',
        seller: 'Vendedor'
    };
    const safeRoleLabel = roleLabelMap[String(sentByRole || '').trim().toLowerCase()] || '';
    const fallbackSentByUserId = String(msg?.sentByUserId || '').trim();
    const displaySentByName = String(safeSentByName || safeRoleLabel || fallbackSentByUserId || 'Operador').trim();
    const safeSentViaLabel = String(sentViaModuleName || sentByRole || '')
        .replace(/[\u25C6\u25C8\u2022\u00B7\uFFFD<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const showOutgoingAttribution = Boolean(isOut && (displaySentByName || safeSentViaLabel));

    const canEditMessage = Boolean(
        canEditMessages
        && isOut
        && !msg?.hasMedia
        && String(msg?.body || '').trim()
        && msg?.canEdit === true
    );

    const handleEditClick = () => {
        if (!canEditMessage || typeof onEditMessage !== 'function') return;
        onEditMessage(msg?.id, String(msg?.body || ''));
    };

    const quotedMessage = msg?.quotedMessage && typeof msg.quotedMessage === 'object'
        ? {
            id: String(msg.quotedMessage?.id || '').trim() || null,
            body: String(msg.quotedMessage?.body || '').trim() || (msg.quotedMessage?.hasMedia ? 'Adjunto' : 'Mensaje'),
            fromMe: Boolean(msg.quotedMessage?.fromMe),
            hasMedia: Boolean(msg.quotedMessage?.hasMedia),
            type: String(msg.quotedMessage?.type || 'chat')
        }
        : null;

    const canReplyMessage = Boolean(msg?.id && typeof onReplyMessage === 'function');
    const canForwardMessage = Boolean(msg?.id && typeof onForwardMessage === 'function');
    const hasMenuActions = Boolean(canReplyMessage || canForwardMessage || canEditMessage);
    const forwardNeedle = normalizeSearchText(forwardSearch);
    const forwardCandidates = Array.isArray(forwardChatOptions)
        ? forwardChatOptions.filter((chat) => {
            const id = String(chat?.id || '').trim();
            if (!id) return false;
            if (id === String(activeChatId || '')) return false;
            if (!forwardNeedle) return true;
            const haystack = normalizeSearchText(`${chat?.name || ''} ${chat?.phone || ''} ${chat?.subtitle || ''}`);
            return haystack.includes(forwardNeedle);
        }).slice(0, 40)
        : [];

    const handleReplyClick = () => {
        if (!canReplyMessage) return;
        onReplyMessage({
            id: msg?.id,
            body: String(msg?.body || ''),
            hasMedia: Boolean(msg?.hasMedia),
            fromMe: Boolean(msg?.fromMe),
            type: String(msg?.type || 'chat')
        });
        setShowActionsMenu(false);
        setShowForwardPicker(false);
    };

    const handleForwardSelect = (targetChatId) => {
        if (!canForwardMessage) return;
        const sourceMessageId = String(msg?.id || '').trim();
        const chatId = String(targetChatId || '').trim();
        if (!sourceMessageId || !chatId) return;
        onForwardMessage(sourceMessageId, chatId);
        setShowForwardPicker(false);
        setShowActionsMenu(false);
        setForwardSearch('');
    };
    const openMapPopup = (payload = {}) => {
        if (typeof onOpenMap !== 'function') return;
        onOpenMap(payload);
    };

    return (
        <div
            ref={bubbleRef}
            className={`message ${isOut ? 'out' : 'in'}${hasMenuActions ? ' has-menu-actions' : ''}`}
            style={isHighlighted ? { outline: `2px solid ${isCurrentHighlighted ? '#00a884' : 'rgba(0,168,132,0.35)'}`, borderRadius: '10px', padding: '2px' } : undefined}
        >
            {isCatalogItem && (
                <div className="catalog-card">
                    <div style={{ width: '100%', height: '72px', background: 'linear-gradient(120deg,#233138,#1a252b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingBag size={20} color="#9db0ba" />
                    </div>
                    <div className="catalog-card-info">
                        <div className="catalog-card-title">{productTitle}</div>
                        <div className="catalog-card-price">{productPrice}</div>
                    </div>
                    <button className="catalog-card-btn" onClick={() => onPrefillMessage && onPrefillMessage(`Hola, me interesa ${productTitle || 'el producto del catalogo'}. Me confirmas stock y precio final?`)}>
                        <ShoppingBag size={16} /> Pedir cotizacion
                    </button>
                </div>
            )}

            {msg.hasMedia && mediaImageSrc && isImageMedia && (
                <img
                    src={mediaImageSrc}
                    className="message-media"
                    alt="Media"
                    style={{
                        borderRadius: '8px',
                        marginBottom: '4px',
                        maxWidth: 'min(320px, 56vw)',
                        maxHeight: '260px',
                        objectFit: 'cover',
                        cursor: 'zoom-in',
                        display: 'block'
                    }}
                    onClick={() => onOpenMedia && onOpenMedia({ src: mediaImageSrc, mimetype: msg.mimetype, messageId: msg.id })}
                />
            )}

            {msg.hasMedia && msg.mediaData && msg.mimetype?.startsWith('audio/') && (
                <audio
                    src={mediaDataUrl}
                    controls
                    className="media-audio"
                    style={{ marginBottom: '4px' }}
                />
            )}

            {hasBinaryAttachment && attachmentMeta && (
                <div className={`message-file-card ${attachmentMeta.accentClass}`}>
                    <div className="message-file-icon" aria-hidden="true">
                        {renderAttachmentIcon(attachmentMeta.icon)}
                    </div>

                    <div className="message-file-main">
                        <div className="message-file-topline">
                            <span className="message-file-badge">{attachmentMeta.extensionBadge}</span>
                            <span className="message-file-kind">{attachmentMeta.kindLabel}</span>
                        </div>
                        <div className="message-file-name" title={attachmentMeta.filename}>
                            {attachmentMeta.filename}
                        </div>
                        <div className="message-file-meta">
                            <span>{attachmentMeta.mimetype}</span>
                            {attachmentMeta.sizeLabel && <span>| {attachmentMeta.sizeLabel}</span>}
                        </div>
                    </div>

                    <div className="message-file-actions">
                        {canOpenAttachmentAsPdf && (
                            <button type="button" onClick={handleOpenAttachment} className="message-file-action">
                                Abrir
                            </button>
                        )}
                        <button type="button" onClick={handleDownloadAttachment} className="message-file-action secondary">
                            <Download size={13} /> Descargar
                        </button>
                    </div>
                </div>
            )}

            {isOrderActionable && (
                <div style={{
                    background: 'rgba(0,168,132,0.12)',
                    border: '1px solid rgba(0,168,132,0.3)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    marginBottom: '6px'
                }}>
                    <div style={{ fontSize: '0.78rem', color: '#00a884', fontWeight: 700, marginBottom: '4px' }}>
                        {isProductPayload ? 'Producto compartido' : (isQuotePayload ? 'Cotizacion' : 'Carrito/Pedido del cliente')}
                    </div>
                    {actionOrder?.orderId && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginBottom: '2px' }}>ID: {actionOrder.orderId}</div>
                    )}
                    {isProductPayload && firstOrderItem?.name && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: '4px', fontWeight: 600 }}>
                            {firstOrderItem.name}
                        </div>
                    )}
                    {orderSubtotalLabel && !isQuotePayload && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginBottom: '4px' }}>Subtotal: {orderSubtotalLabel}</div>
                    )}
                    {isProductPayload ? (
                        <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>
                            Puedes anadir este producto al carrito para cotizarlo.
                        </div>
                    ) : isQuotePayload ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '0.75rem', color: '#9bb0ba', marginTop: '1px' }}>Detalle de productos:</div>
                            {orderItems.length > 0 ? orderItems.slice(0, 40).map((item, idx) => {
                                const itemQty = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1;
                                return (
                                    <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                        - {itemQty} {item?.name || 'Producto'}
                                    </div>
                                );
                            }) : (
                                <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>No se pudo leer el detalle de productos.</div>
                            )}
                            {(quoteSubtotalLabel || quoteDiscountLabel || quoteTotalAfterDiscountLabel || quoteDeliveryLabel || quoteTotalPayableLabel) && (
                                <>
                                    <div style={{ fontSize: '0.75rem', color: '#9bb0ba', marginTop: '6px' }}>Detalle de pago:</div>
                                    {quoteSubtotalLabel && (
                                        <div style={{ fontSize: '0.79rem', color: '#d6e3eb', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Subtotal</span>
                                            <strong>{quoteSubtotalLabel}</strong>
                                        </div>
                                    )}
                                    {quoteDiscountLabel && (
                                        <div style={{ fontSize: '0.79rem', color: '#d6e3eb', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Descuento</span>
                                            <strong>- {quoteDiscountLabel}</strong>
                                        </div>
                                    )}
                                    {quoteTotalAfterDiscountLabel && (
                                        <div style={{ fontSize: '0.79rem', color: '#d6e3eb', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Total con descuento</span>
                                            <strong>{quoteTotalAfterDiscountLabel}</strong>
                                        </div>
                                    )}
                                    {quoteDeliveryLabel && (
                                        <div style={{ fontSize: '0.79rem', color: '#d6e3eb', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Delivery</span>
                                            <strong>{quoteDeliveryLabel}</strong>
                                        </div>
                                    )}
                                    {quoteTotalPayableLabel && (
                                        <div style={{ fontSize: '0.82rem', color: '#e8fbf3', display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
                                            <span style={{ fontWeight: 700 }}>TOTAL A PAGAR</span>
                                            <strong style={{ fontWeight: 800 }}>{quoteTotalPayableLabel}</strong>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : orderItems.length > 0 ? orderItems.slice(0, 16).map((item, idx) => {
                        const itemAmount = formatOrderMoney(item?.lineTotal ?? item?.price, actionOrder?.currency || 'PEN');
                        const itemQty = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1;
                        return (
                            <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>- {item?.name || 'Producto'} x{itemQty}{item?.sku ? ` (SKU: ${item.sku})` : ''}</span>
                                <span style={{ color: '#9bb0ba', flexShrink: 0 }}>{itemAmount || ''}</span>
                            </div>
                        );
                    }) : (
                        <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>Se recibio un pedido desde catalogo de WhatsApp.</div>
                    )}
                    {!isProductPayload && !isQuotePayload && safeOrderNote && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '6px' }}>
                            Nota cliente: {safeOrderNote}
                        </div>
                    )}
                    {!isProductPayload && !isQuotePayload && actionOrder?.rawPreview?.itemCount && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '2px' }}>
                            Items reportados: {actionOrder.rawPreview.itemCount}
                        </div>
                    )}
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => typeof onLoadOrderToCart === 'function' && onLoadOrderToCart(actionOrder || null)}
                            disabled={typeof onLoadOrderToCart !== 'function'}
                            style={{
                                background: '#17323f',
                                color: '#c7f1ff',
                                border: '1px solid rgba(124,200,255,0.45)',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                cursor: typeof onLoadOrderToCart === 'function' ? 'pointer' : 'not-allowed',
                                fontSize: '0.75rem',
                                opacity: typeof onLoadOrderToCart === 'function' ? 1 : 0.55
                            }}
                        >
                            {orderActionLabel}
                        </button>
                    </div>
                </div>
            )}

            
            <div className={`message-content ${canEditMessage ? 'can-edit' : ''}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {showSenderName && messageSenderName && (
                    <div className="message-sender-name" title={messageSenderName} style={{ color: senderNameColor }}>
                        {messageSenderName}
                    </div>
                )}
                {quotedMessage && (
                    <div style={{
                        borderLeft: '3px solid ' + (quotedMessage.fromMe ? '#73dbf8' : '#00a884'),
                        background: 'rgba(0,0,0,0.16)',
                        borderRadius: '8px',
                        padding: '6px 8px',
                        marginBottom: '6px'
                    }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: quotedMessage.fromMe ? '#9fe9ff' : '#72f3d3', marginBottom: '2px' }}>
                            {quotedMessage.fromMe ? 'Tu mensaje' : 'Mensaje respondido'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#c8d8e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {quotedMessage.body}
                        </div>
                    </div>
                )}
                {isLocationMessage && (
                    <div style={{
                        border: '1px solid rgba(0,168,132,0.38)',
                        background: 'rgba(0,0,0,0.16)',
                        borderRadius: '9px',
                        padding: '8px',
                        marginBottom: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00c7a0', fontSize: '0.78rem', fontWeight: 700 }}>
                            <MapPin size={14} /> Ubicacion compartida
                        </div>

                        {locationEmbedUrl && (
                            <button
                                type="button"
                                onClick={() => openMapPopup({ query: locationMapQuery, mapUrl: locationData?.mapUrl, latitude: locationData?.latitude, longitude: locationData?.longitude })}
                                style={{
                                    marginTop: '7px',
                                    width: '100%',
                                    border: '1px solid rgba(124,200,255,0.35)',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    padding: 0,
                                    cursor: 'pointer',
                                    background: '#17242d'
                                }}
                            >
                                <iframe
                                    title="Vista previa de ubicacion"
                                    src={locationEmbedUrl}
                                    style={{ width: '100%', height: '118px', border: 'none', pointerEvents: 'none' }}
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                />
                            </button>
                        )}

                        <div style={{ fontSize: '0.84rem', color: '#e4edf2', marginTop: '6px' }}>
                            {locationData?.label || 'Ubicacion'}
                        </div>
                        {(locationData?.latitude !== null && locationData?.longitude !== null) && (
                            <div style={{ fontSize: '0.72rem', color: '#97aab4', marginTop: '2px' }}>
                                {locationData.latitude.toFixed(6)}, {locationData.longitude.toFixed(6)}
                            </div>
                        )}
                        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => openMapPopup({ query: locationMapQuery, mapUrl: locationData?.mapUrl, latitude: locationData?.latitude, longitude: locationData?.longitude })}
                                style={{
                                    border: '1px solid rgba(124,200,255,0.45)',
                                    background: 'rgba(124,200,255,0.12)',
                                    color: '#cfefff',
                                    borderRadius: '999px',
                                    padding: '4px 10px',
                                    fontSize: '0.74rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                Ver en popup <ExternalLink size={12} />
                            </button>
                        </div>
                    </div>
                )}

                {showWebPreview && (webPreviewLoading || webPreview) && (
                    <a
                        href={webPreview?.url || firstNonMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            textDecoration: 'none',
                            color: 'inherit',
                            border: '1px solid rgba(124,200,255,0.26)',
                            background: 'rgba(16,26,34,0.72)',
                            borderRadius: '10px',
                            padding: '8px',
                            marginBottom: '6px'
                        }}
                    >
                        {webPreview?.image && (
                            <img
                                src={webPreview.image}
                                alt="Vista previa"
                                style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                            />
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.72rem', color: '#82d0ff', marginBottom: '2px' }}>
                                {webPreviewLoading ? 'Cargando vista previa...' : 'Enlace'}
                            </div>
                            <div style={{ fontSize: '0.84rem', color: '#e8f1f6', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {webPreview?.title || webPreview?.siteName || firstNonMapUrl}
                            </div>
                            {webPreview?.description && (
                                <div style={{ fontSize: '0.74rem', color: '#9cb1ba', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {webPreview.description}
                                </div>
                            )}
                        </div>
                    </a>
                )}

                {String(messageTextToRender).trim() && (
                    <span
                        style={{ fontSize: '0.9rem', wordBreak: 'break-word', whiteSpace: 'normal' }}
                        onMouseUp={() => {
                            const selected = String(window.getSelection?.()?.toString?.() || '').trim();
                            if (selected.length >= 4 && selected.length <= 180) {
                                setSelectedLocationText(selected);
                                return;
                            }
                            setSelectedLocationText('');
                        }}
                    >
                        {renderWhatsAppFormattedText(messageTextToRender)}
                    </span>
                )}

                {phoneCandidates.length > 0 && typeof onOpenPhoneChat === 'function' && (
                    <div className="message-phone-links">
                        {phoneCandidates.map((phone) => (
                            <button
                                key={phone}
                                type="button"
                                className="message-phone-link"
                                onClick={() => onOpenPhoneChat(phone, '')}
                            >
                                Abrir chat +{phone}
                            </button>
                        ))}
                    </div>
                )}
                {selectedLocationText && typeof onOpenMap === 'function' && (
                    <button
                        type="button"
                        onClick={() => {
                            openMapPopup({ query: selectedLocationText });
                            setSelectedLocationText('');
                        }}
                        style={{
                            marginTop: '6px',
                            border: '1px solid rgba(0,168,132,0.45)',
                            background: 'rgba(0,168,132,0.14)',
                            color: '#baf6e8',
                            borderRadius: '999px',
                            padding: '4px 10px',
                            fontSize: '0.73rem',
                            cursor: 'pointer',
                            alignSelf: 'flex-start'
                        }}
                    >
                        Buscar en mapa: "{selectedLocationText.slice(0, 60)}{selectedLocationText.length > 60 ? '...' : ''}"
                    </button>
                )}
                {hasMenuActions && (
                    <div className={`message-actions-anchor ${showActionsMenu ? 'open' : ''}`}>
                        <button
                            type="button"
                            className={`message-actions-toggle ${showActionsMenu ? 'open' : ''}`}
                            title="Opciones"
                            onClick={(event) => {
                                event.stopPropagation();
                                setShowActionsMenu((prev) => {
                                    const next = !prev;
                                    if (!next) setShowForwardPicker(false);
                                    return next;
                                });
                            }}
                        >
                            <ChevronDown size={13} />
                        </button>
                        {showActionsMenu && (
                            <div className="message-actions-menu" onClick={(event) => event.stopPropagation()}>
                                {canReplyMessage && (
                                    <button type="button" className="message-actions-item" onClick={handleReplyClick}>
                                        <Reply size={13} /> Responder
                                    </button>
                                )}
                                {canForwardMessage && (
                                    <button
                                        type="button"
                                        className="message-actions-item"
                                        onClick={() => {
                                            setShowForwardPicker((prev) => !prev);
                                            setShowActionsMenu(false);
                                        }}
                                    >
                                        <Forward size={13} /> Reenviar
                                    </button>
                                )}
                                {canEditMessage && (
                                    <button
                                        type="button"
                                        className="message-actions-item"
                                        onClick={() => {
                                            handleEditClick();
                                            setShowActionsMenu(false);
                                        }}
                                    >
                                        <Pencil size={13} /> Editar
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {showForwardPicker && canForwardMessage && (
                    <div style={{
                        marginTop: '6px',
                        border: '1px solid rgba(124,200,255,0.32)',
                        background: 'rgba(15,26,34,0.96)',
                        borderRadius: '10px',
                        padding: '8px',
                        minWidth: '220px',
                        maxWidth: '320px',
                        alignSelf: isOut ? 'flex-end' : 'flex-start'
                    }}>
                        <div style={{ fontSize: '0.72rem', color: '#7cc8ff', fontWeight: 700, marginBottom: '6px' }}>
                            Reenviar a...
                        </div>
                        <input
                            type="text"
                            value={forwardSearch}
                            onChange={(event) => setForwardSearch(event.target.value)}
                            placeholder="Buscar chat"
                            style={{
                                width: '100%',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.18)',
                                background: 'rgba(255,255,255,0.04)',
                                color: '#e8f1f6',
                                padding: '5px 8px',
                                fontSize: '0.75rem',
                                marginBottom: '6px'
                            }}
                        />
                        <div style={{ maxHeight: '170px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {forwardCandidates.length > 0 ? forwardCandidates.map((chat) => (
                                <button
                                    key={chat.id}
                                    type="button"
                                    onClick={() => handleForwardSelect(chat.id)}
                                    style={{
                                        textAlign: 'left',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.02)',
                                        color: '#e8f1f6',
                                        borderRadius: '8px',
                                        padding: '5px 7px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {chat.name || chat.phone || 'Chat'}
                                    </div>
                                    {(chat.phone || chat.subtitle) && (
                                        <div style={{ fontSize: '0.68rem', color: '#9db0ba', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {chat.phone || chat.subtitle}
                                        </div>
                                    )}
                                </button>
                            )) : (
                                <div style={{ fontSize: '0.72rem', color: '#9db0ba' }}>No se encontraron chats.</div>
                            )}
                        </div>
                    </div>
                )}

                {showOutgoingAttribution && (
                    <div style={{
                        marginTop: '4px',
                        marginBottom: '2px',
                        fontSize: '0.68rem',
                        color: 'rgba(214,231,240,0.82)',
                        alignSelf: 'flex-end',
                        textAlign: 'right'
                    }}>
                        Respondio: <strong style={{ color: '#e8f3f8', fontWeight: 600 }}>{displaySentByName}</strong>
                        {safeSentViaLabel && (
                            <span style={{ color: '#9eb2bf' }}>
                                {' - '}{safeSentViaLabel}
                            </span>
                        )}
                    </div>
                )}
                <div className="message-meta" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    marginTop: '2px',
                    minHeight: '16px'
                }}>
                    <span className="message-time-text">
                        {moment.unix(msg.timestamp).format('H:mm')}
                    </span>
                    {msg?.edited && <span className="message-edited-badge">editado</span>}
                    {renderStatus()}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
