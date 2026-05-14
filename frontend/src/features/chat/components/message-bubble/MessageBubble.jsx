import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { Check, CheckCheck, ShoppingBag, Pencil, MapPin, ExternalLink, Reply, Forward, ChevronDown, Download, SmilePlus, Clock3, AlertCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import {
    renderWhatsAppFormattedText,
    formatOrderMoney,
    isLikelyBinaryBody,
    normalizeSearchText,
    extractFirstNonMapUrlFromText,
    renderAttachmentIcon,
    extractPhoneCandidatesFromText
} from './helpers';
import useMessageBubbleAttachmentActions from './hooks/useMessageBubbleAttachmentActions';
import useMessageBubbleLinkPreview from './hooks/useMessageBubbleLinkPreview';
import useMessageBubbleDerivedModel from './hooks/useMessageBubbleDerivedModel';
import { buildRenderedTemplateMessage } from '../../core/helpers/templateMessages.helpers';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const GLOBAL_SKIN_TONE_STORAGE_KEY = 'chat-emoji-skin-tone:global';
const REACTION_TONE_VARIANTS = {
    '👍': {
        '1f3fb': '👍🏻',
        '1f3fc': '👍🏼',
        '1f3fd': '👍🏽',
        '1f3fe': '👍🏾',
        '1f3ff': '👍🏿'
    },
    '🙏': {
        '1f3fb': '🙏🏻',
        '1f3fc': '🙏🏼',
        '1f3fd': '🙏🏽',
        '1f3fe': '🙏🏾',
        '1f3ff': '🙏🏿'
    }
};

const formatOrderCardTitle = (value = '') => {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean
        .toLocaleLowerCase('es-PE')
        .replace(/(^|[\s/.-])(\S)/g, (_, prefix, char) => `${prefix}${char.toLocaleUpperCase('es-PE')}`);
};

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
    onSendReaction,
    onRetryMessage,
    onJumpToMessage,
    forwardChatOptions = [],
    activeChatId = null,
    canEditMessages = false,
    showSenderName = false,
    senderDisplayName = '',
    catalog = [],
    buildApiHeaders,
}) => {
    const {
        isOut,
        isCatalogItem,
        messageBodyText,
        hasOrder,
        actionOrder,
        isOrderActionable,
        orderActionLabel,
        orderItems,
        reportedItemCount,
        isProductPayload,
        isOrderPayload,
        isQuotePayload,
        rawOrderNote,
        safeOrderNote,
        orderSubtotalLabel,
        quoteSummaryRaw,
        quoteCurrency,
        quoteSubtotal,
        quoteDiscount,
        quoteTotalAfterDiscount,
        quoteDelivery,
        quoteTotalPayable,
        quoteSubtotalLabel,
        quoteDiscountLabel,
        quoteTotalAfterDiscountLabel,
        quoteDeliveryLabel,
        quoteTotalPayableLabel,
        quoteOrderPayload,
        quoteItemsFromBody,
        quotePaymentFromBody,
        mediaUrl,
        mediaImageSrc,
        isImageMedia,
        isVideoMedia,
        hasBinaryAttachment,
        attachmentMeta,
        locationData,
        isLocationMessage,
        messageSenderName,
        senderNameColor,
        displaySentByName,
        safeRoleLabel,
        safeSentViaLabel,
        showOutgoingAttribution,
        canEditMessage,
        canReplyMessage: canReplyMessageBase,
        canForwardMessage: canForwardMessageBase
    } = useMessageBubbleDerivedModel({
        msg,
        senderDisplayName,
        canEditMessages,
        activeChatId
    });

    const catalogMatch = isCatalogItem ? messageBodyText.match(/REF: (.*)\nPrecio: (.*)/) : null;
    const productTitle = catalogMatch ? catalogMatch[1] : null;
    const productPrice = catalogMatch ? catalogMatch[2] : null;
    const firstOrderItem = orderItems[0] || null;
    const orderIdentifier = String(
        isQuotePayload
            ? (actionOrder?.quoteId || '')
            : (actionOrder?.orderId || actionOrder?.rawPreview?.token || '')
    ).trim();
    const quoteMetadata = actionOrder?.metadata && typeof actionOrder.metadata === 'object'
        ? actionOrder.metadata
        : {};
    const quoteSourceType = String(
        quoteMetadata?.sourceType
        || quoteMetadata?.source_type
        || actionOrder?.sourceType
        || actionOrder?.source_type
        || ''
    ).trim().toLowerCase();
    const quoteHasSourceOrder = Boolean(
        quoteMetadata?.sourceOrder
        || quoteMetadata?.source_order
        || actionOrder?.sourceOrder
        || actionOrder?.source_order
    );
    const quoteCardTitle = quoteSourceType === 'order' || quoteHasSourceOrder
        ? '🛒 Resumen De Pedido'
        : '📋 Cotización';
    const [selectedLocationText, setSelectedLocationText] = useState('');
    const [showForwardPicker, setShowForwardPicker] = useState(false);
    const [forwardSearch, setForwardSearch] = useState('');
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [preferredSkinTone, setPreferredSkinTone] = useState('neutral');
    const bubbleRef = useRef(null);
    const reactionOptions = ['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => {
        const variants = REACTION_TONE_VARIANTS[emoji];
        return variants?.[preferredSkinTone] || emoji;
    });

    const shouldHideBodyForOrder = isQuotePayload || (hasOrder && isOrderPayload) || (hasOrder && isLikelyBinaryBody(messageBodyText));
    const messageTextToRender = isCatalogItem
        ? 'Te gustaria que te lo separemos?'
        : ((isLocationMessage && locationData?.source === 'native') ? '' : (shouldHideBodyForOrder ? '' : (msg.body || '')));
    const firstNonMapUrl = extractFirstNonMapUrlFromText(messageBodyText);
    const showWebPreview = Boolean(firstNonMapUrl && !isLocationMessage && !msg?.hasMedia && !hasOrder && !isCatalogItem && !isOrderActionable);
    const phoneCandidates = extractPhoneCandidatesFromText(messageTextToRender);
    const catalogBySku = React.useMemo(() => {
        const map = new Map();
        (Array.isArray(catalog) ? catalog : []).forEach((item) => {
            const sku = String(item?.sku || item?.id || '').trim().toUpperCase();
            if (sku && !map.has(sku)) map.set(sku, item);
        });
        return map;
    }, [catalog]);
    const orderCardTotals = React.useMemo(() => {
        if (isProductPayload || isQuotePayload || !Array.isArray(orderItems) || orderItems.length === 0) {
            return { total: 0, savings: 0, totalLabel: '', savingsLabel: '' };
        }
        const parseOrderCardMoney = (value, fallback = 0) => {
            const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        const totals = orderItems.reduce((acc, item) => {
            const qty = Math.max(1, Number.isFinite(Number(item?.qty))
                ? Number(item.qty)
                : (Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1));
            const skuKey = String(item?.sku || item?.id || '').trim().toUpperCase();
            const matchedCatalogItem = skuKey ? catalogBySku.get(skuKey) : null;
            const finalUnit = Math.max(0, parseOrderCardMoney(item?.price ?? item?.unitPrice, 0));
            const finalLine = Math.max(0, parseOrderCardMoney(item?.lineTotal ?? item?.total, finalUnit * qty));
            const regularUnit = matchedCatalogItem
                ? Math.max(0, parseOrderCardMoney(matchedCatalogItem?.regularPrice ?? matchedCatalogItem?.regular_price, finalUnit))
                : finalUnit;
            const regularLine = regularUnit - finalUnit > 0.01 ? regularUnit * qty : finalLine;
            return {
                subtotal: acc.subtotal + regularLine,
                total: acc.total + finalLine,
                savings: acc.savings + Math.max(0, regularLine - finalLine)
            };
        }, { subtotal: 0, total: 0, savings: 0 });
        return {
            ...totals,
            subtotalLabel: totals.subtotal > 0 ? formatOrderMoney(totals.subtotal, actionOrder?.currency || 'PEN') : '',
            totalLabel: totals.total > 0 ? formatOrderMoney(totals.total, actionOrder?.currency || 'PEN') : '',
            savingsLabel: totals.savings > 0 ? formatOrderMoney(totals.savings, actionOrder?.currency || 'PEN') : ''
        };
    }, [actionOrder?.currency, catalogBySku, isProductPayload, isQuotePayload, orderItems]);
    const orderCatalogFooterText = React.useMemo(() => {
        const itemCount = Number(actionOrder?.rawPreview?.itemCount || reportedItemCount || 0);
        if (Number.isFinite(itemCount) && itemCount > 0) {
            return `Pedido via catalogo WhatsApp - ${itemCount} productos`;
        }
        return 'Pedido via catalogo WhatsApp';
    }, [actionOrder?.rawPreview?.itemCount, reportedItemCount]);
    const { webPreview, webPreviewLoading } = useMessageBubbleLinkPreview({
        showWebPreview,
        firstNonMapUrl,
        apiUrl: API_URL,
        buildApiHeaders
    });

    useEffect(() => {
        if (!showActionsMenu && !showForwardPicker && !showReactionPicker) return;

        const handleOutsideClick = (event) => {
            if (!bubbleRef.current) return;
            if (bubbleRef.current.contains(event.target)) return;
            setShowActionsMenu(false);
            setShowForwardPicker(false);
            setShowReactionPicker(false);
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setShowActionsMenu(false);
                setShowForwardPicker(false);
                setShowReactionPicker(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [showActionsMenu, showForwardPicker, showReactionPicker]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            setPreferredSkinTone('neutral');
            return;
        }
        try {
            const stored = String(window.localStorage.getItem(GLOBAL_SKIN_TONE_STORAGE_KEY) || '').trim();
            setPreferredSkinTone(stored || 'neutral');
        } catch (_) {
            setPreferredSkinTone('neutral');
        }
    }, []);

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
        const explicitStatus = String(msg?.status || '').trim().toLowerCase();
        const deliveryErrorMessage = String(msg?.deliveryError?.message || '').trim();
        const deliveryErrorCode = Number.isFinite(Number(msg?.deliveryError?.code)) ? Number(msg.deliveryError.code) : null;
        if (deliveryErrorMessage) {
            const label = deliveryErrorCode
                ? `Error de entrega de Meta (${deliveryErrorCode}): ${deliveryErrorMessage}`
                : `Error de entrega de Meta: ${deliveryErrorMessage}`;
            return (
                <span className="message-ack failed" title={label} aria-label={label}>
                    <AlertTriangle size={14} />
                </span>
            );
        }
        if (explicitStatus === 'failed') {
            return (
                <span className="message-ack failed" title="Estado: Error" aria-label="Estado: Error">
                    <AlertCircle size={14} />
                </span>
            );
        }
        const ack = Number.isFinite(Number(msg.ack)) ? Number(msg.ack) : 0;
        if (explicitStatus === 'sending' || ack <= 1) {
            const isSent = explicitStatus !== 'sending' && ack >= 1;
            const label = isSent ? 'Estado: Enviado' : 'Estado: Enviando';
            return (
                <span className={`message-ack ${isSent ? 'sent' : 'pending'} message-ack--stack`} title={label} aria-label={label}>
                    <span className={`message-ack-icon-slot ${isSent ? 'is-hidden' : 'is-visible'}`} aria-hidden="true">
                        <Clock3 size={16} />
                    </span>
                    <span className={`message-ack-icon-slot ${isSent ? 'is-visible' : 'is-hidden'}`} aria-hidden="true">
                        <Check size={16} />
                    </span>
                </span>
            );
        }
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
    const isGifMedia = /gif/i.test(String(msg?.mimetype || '')) || /\.gif(?:$|[?#])/i.test(String(mediaUrl || ''));
    const renderedTemplate = buildRenderedTemplateMessage(msg);
    const shouldRenderTemplateBubble = renderedTemplate.isTemplateMessage && !msg.hasMedia && !isCatalogItem && !isOrderActionable;
    const inlineVideoSrc = mediaDataUrl || (mediaUrl || null);
    const {
        canOpenAttachmentAsPdf,
        handleOpenAttachment,
        handleDownloadAttachment
    } = useMessageBubbleAttachmentActions({
        msg,
        attachmentMeta,
        mediaDataUrl
    });
    const canReplyMessage = canReplyMessageBase && typeof onReplyMessage === 'function';
    const canForwardMessage = canForwardMessageBase && typeof onForwardMessage === 'function';

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
    const reactionSummary = Array.isArray(msg?.reactions)
        ? Object.entries(
            msg.reactions.reduce((acc, reaction) => {
                const emoji = String(reaction?.emoji || '').trim();
                if (!emoji) return acc;
                acc[emoji] = (acc[emoji] || 0) + 1;
                return acc;
            }, {})
        )
        : [];
    const hasReactionSummary = reactionSummary.length > 0;
    const canSendReaction = typeof onSendReaction === 'function' && Boolean(String(msg?.id || '').trim());

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
    const handleJumpToQuotedMessage = () => {
        const quotedMessageId = String(quotedMessage?.id || '').trim();
        if (!quotedMessageId || typeof onJumpToMessage !== 'function') return;
        onJumpToMessage(quotedMessageId);
    };
    const handleReactionSelect = (emoji) => {
        const messageId = String(msg?.id || '').trim();
        const safeEmoji = String(emoji || '').trim();
        if (!messageId || !safeEmoji || typeof onSendReaction !== 'function') return;
        onSendReaction(messageId, safeEmoji);
        setShowReactionPicker(false);
    };

    return (
        <div
            ref={bubbleRef}
            className={`message ${isOut ? 'out' : 'in'}${hasMenuActions ? ' has-menu-actions' : ''}${hasReactionSummary ? ' has-reactions' : ''}`}
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

            {msg.hasMedia && mediaImageSrc && (isImageMedia || isGifMedia) && (
                <img
                    src={mediaImageSrc}
                    className="message-media"
                    alt={isGifMedia ? 'gif' : 'Media'}
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

            {msg.hasMedia && inlineVideoSrc && isVideoMedia && !isGifMedia && (
                <video
                    src={inlineVideoSrc}
                    controls
                    preload="metadata"
                    style={{
                        borderRadius: '8px',
                        marginBottom: '4px',
                        maxWidth: 'min(320px, 56vw)',
                        maxHeight: '260px',
                        display: 'block',
                        background: '#000'
                    }}
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
                    <div className="message-file-preview">
                        <div className="message-file-preview-badge">{attachmentMeta.extensionBadge}</div>
                        <div className="message-file-icon" aria-hidden="true">
                            {renderAttachmentIcon(attachmentMeta.icon)}
                        </div>
                    </div>

                    <div className="message-file-main">
                        <div className="message-file-topline">
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
                <div className={`message-order-card${isQuotePayload ? ' is-quote' : ''}${isProductPayload ? ' is-product' : ' is-order'}`}>
                    <div className="message-order-card__title">
                        {isProductPayload ? 'Producto compartido' : (isQuotePayload ? quoteCardTitle : '🛒 Pedido del cliente')}
                    </div>
                    {orderIdentifier && (
                        <div className="message-order-card__meta">ID: {orderIdentifier}</div>
                    )}
                    {isProductPayload && (firstOrderItem?.title || firstOrderItem?.name) && (
                        <div className="message-order-card__product-name">
                            {firstOrderItem?.title || firstOrderItem?.name}
                        </div>
                    )}
                    {orderSubtotalLabel && isProductPayload && (
                        <div className="message-order-card__meta">Subtotal: {orderSubtotalLabel}</div>
                    )}
                    {isProductPayload ? (
                        <div className="message-order-card__hint">
                            Puedes anadir este producto al carrito para cotizarlo.
                        </div>
                    ) : isQuotePayload ? (
                        <div className="message-order-card__quote-body">
                            <div className="message-order-card__section-label">Detalle de productos:</div>
                            {orderItems.length > 0 ? orderItems.slice(0, 40).map((item, idx) => {
                                const itemQty = Number.isFinite(Number(item?.qty)) ? Number(item.qty)
                                    : (Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1);
                                const itemTitle = formatOrderCardTitle(item?.name || item?.title || item?.sku || 'Producto') || 'Producto';
                                const itemAmount = formatOrderMoney(item?.lineTotal ?? item?.price ?? item?.unitPrice, quoteCurrency || actionOrder?.currency || 'PEN');
                                return (
                                    <div key={idx} className="message-order-card__line-item">
                                        <span className="message-order-card__line-item-name">
                                            <span>{itemTitle} × {itemQty}</span>
                                            {item?.sku ? (
                                                <small className="message-order-card__meta" style={{ display: 'block', marginTop: 2, opacity: 0.72 }}>
                                                    SKU: {item.sku}
                                                </small>
                                            ) : null}
                                        </span>
                                        <span className="message-order-card__line-item-amount">{itemAmount || ''}</span>
                                    </div>
                                );
                            }) : (
                                <div className="message-order-card__hint">No se pudo leer el detalle de productos.</div>
                            )}
                            {(quoteSubtotalLabel || quoteDiscountLabel || quoteTotalAfterDiscountLabel || quoteDeliveryLabel || quoteTotalPayableLabel) && (
                                <>
                                    <div className="message-order-card__section-label with-gap">Detalle de pago:</div>
                                    {quoteSubtotalLabel && (
                                        <div className="message-order-card__summary-row">
                                            <span>Subtotal</span>
                                            <strong>{quoteSubtotalLabel}</strong>
                                        </div>
                                    )}
                                    {quoteDiscountLabel && (
                                        <div className="message-order-card__summary-row">
                                            <span>Ahorro</span>
                                            <strong>- {quoteDiscountLabel}</strong>
                                        </div>
                                    )}
                                    {quoteDeliveryLabel && (
                                        <div className="message-order-card__summary-row">
                                            <span>Delivery</span>
                                            <strong>{quoteDeliveryLabel}</strong>
                                        </div>
                                    )}
                                    {quoteTotalPayableLabel && (
                                        <div className="message-order-card__summary-row total">
                                            <span>TOTAL A PAGAR</span>
                                            <strong>{quoteTotalPayableLabel}</strong>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="message-order-card__quote-body">
                            <div className="message-order-card__section-label">Detalle de productos:</div>
                            {orderItems.length > 0 ? orderItems.slice(0, 40).map((item, idx) => {
                        const itemAmount = formatOrderMoney(item?.lineTotal ?? item?.price, actionOrder?.currency || 'PEN');
                        const itemQty = Number.isFinite(Number(item?.qty)) ? Number(item.qty)
                            : (Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1);
                        const itemTitle = formatOrderCardTitle(item?.name || item?.title || item?.sku || 'Producto') || 'Producto';
                        return (
                            <div key={idx} className="message-order-card__line-item">
                                <span className="message-order-card__line-item-name">
                                    <span>{itemTitle} × {itemQty}</span>
                                    {item?.sku ? (
                                        <small className="message-order-card__meta" style={{ display: 'block', marginTop: 2, opacity: 0.72 }}>
                                            SKU: {item.sku}
                                        </small>
                                    ) : null}
                                </span>
                                <span className="message-order-card__line-item-amount">{itemAmount || ''}</span>
                            </div>
                        );
                            }) : (
                                <div className="message-order-card__hint">Se recibio un pedido desde catalogo de WhatsApp.</div>
                            )}
                            {orderItems.length > 0 && (
                                <>
                                    <div className="message-order-card__section-label with-gap">Detalle de pago:</div>
                                    {orderCardTotals.subtotalLabel && (
                                        <div className="message-order-card__summary-row">
                                            <span>Subtotal</span>
                                            <strong>{orderCardTotals.subtotalLabel}</strong>
                                        </div>
                                    )}
                                    {orderCardTotals.savingsLabel && (
                                        <div className="message-order-card__summary-row">
                                            <span>Descuento</span>
                                            <strong style={{ color: 'var(--saas-accent-primary)' }}>- {orderCardTotals.savingsLabel}</strong>
                                        </div>
                                    )}
                                    {orderCardTotals.totalLabel && (
                                        <div className="message-order-card__summary-row total">
                                            <span>TOTAL A PAGAR</span>
                                            <strong>{orderCardTotals.totalLabel}</strong>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                    <div className="message-order-card__actions">
                        <button
                            onClick={() => {
                                if (typeof onLoadOrderToCart !== 'function') return;
                                const orderForCart = actionOrder && typeof actionOrder === 'object'
                                    ? {
                                        ...actionOrder,
                                        sourceMessageId: String(msg?.id || '').trim() || actionOrder?.sourceMessageId || null
                                    }
                                    : null;
                                onLoadOrderToCart(orderForCart);
                            }}
                            disabled={typeof onLoadOrderToCart !== 'function'}
                            className="message-order-card__action-btn"
                        >
                            {orderActionLabel}
                        </button>
                    </div>
                </div>
            )}

            
            <div className={`message-content ${canEditMessage ? 'can-edit' : ''}${hasReactionSummary ? ' has-reactions' : ''}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {showReactionPicker && canSendReaction && (
                    <div className={`message-reaction-picker ${isOut ? 'out' : 'in'}`}>
                        {reactionOptions.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleReactionSelect(emoji);
                                }}
                                className="message-reaction-option"
                                title={`Reaccionar con ${emoji}`}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
                {showSenderName && messageSenderName && (
                    <div className="message-sender-name" title={messageSenderName} style={{ color: senderNameColor }}>
                        {messageSenderName}
                    </div>
                )}
                {quotedMessage && (
                    <div
                        className="message-quoted-context"
                        style={{
                            '--message-quoted-border': quotedMessage.fromMe ? '#73dbf8' : '#00a884',
                            '--message-quoted-label': quotedMessage.fromMe ? 'var(--chat-info-text)' : 'var(--chat-success-text)',
                            cursor: quotedMessage.id ? 'pointer' : 'default'
                        }}
                    >
                        <div
                            className="message-quoted-context__inner"
                            role={quotedMessage.id ? 'button' : undefined}
                            tabIndex={quotedMessage.id ? 0 : undefined}
                            onClick={handleJumpToQuotedMessage}
                            onKeyDown={(event) => {
                                if (!quotedMessage.id) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleJumpToQuotedMessage();
                                }
                            }}
                            style={{ outline: 'none' }}
                        >
                            <div className="message-quoted-context__label">
                                {quotedMessage.fromMe ? 'Tu mensaje' : 'Mensaje respondido'}
                            </div>
                            <div className="message-quoted-context__body">
                                {quotedMessage.body}
                            </div>
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

                {shouldRenderTemplateBubble && (
                    <div className="message-template-preview">
                        {renderedTemplate.templateName && (
                            <div className="message-template-preview__label">
                                Template: {renderedTemplate.templateName}
                            </div>
                        )}
                        {renderedTemplate.headerText ? (
                            <div className="message-template-preview__header">
                                {renderWhatsAppFormattedText(renderedTemplate.headerText)}
                            </div>
                        ) : null}
                        <div className="message-template-preview__body">
                            {renderWhatsAppFormattedText(renderedTemplate.bodyText || renderedTemplate.previewText)}
                        </div>
                        {renderedTemplate.footerText ? (
                            <div className="message-template-preview__footer">
                                {renderWhatsAppFormattedText(renderedTemplate.footerText)}
                            </div>
                        ) : null}
                    </div>
                )}

                {!shouldRenderTemplateBubble && String(messageTextToRender).trim() && (
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
                {isOut && String(msg?.status || '').trim().toLowerCase() === 'failed' && typeof onRetryMessage === 'function' && (
                    <button
                        type="button"
                        className="message-retry-btn"
                        onClick={() => onRetryMessage(msg)}
                    >
                        <RotateCcw size={12} /> Reintentar
                    </button>
                )}
                {(hasMenuActions || canSendReaction) && (
                    <div className={`message-actions-anchor ${showActionsMenu ? 'open' : ''}`}>
                        <div className={`message-actions-rail ${isOut ? 'out' : 'in'}`}>
                            {canSendReaction && (
                                <button
                                    type="button"
                                    className={`message-actions-toggle reaction ${showReactionPicker ? 'open' : ''}`}
                                    title="Reaccionar"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setShowActionsMenu(false);
                                        setShowForwardPicker(false);
                                        setShowReactionPicker((prev) => !prev);
                                    }}
                                >
                                    <SmilePlus size={13} />
                                </button>
                            )}
                            {hasMenuActions && (
                                <button
                                    type="button"
                                    className={`message-actions-toggle ${showActionsMenu ? 'open' : ''}`}
                                    title="Opciones"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setShowReactionPicker(false);
                                        setShowActionsMenu((prev) => {
                                            const next = !prev;
                                            if (!next) setShowForwardPicker(false);
                                            return next;
                                        });
                                    }}
                                >
                                    <ChevronDown size={13} />
                                </button>
                            )}
                        </div>
                        {showActionsMenu && (
                            <div className={`message-actions-menu ${isOut ? 'out' : 'in'}`} onClick={(event) => event.stopPropagation()}>
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
                    <div className="message-outgoing-attribution">
                        Respondio: <strong className="message-outgoing-attribution__name">{displaySentByName}</strong>
                        {safeSentViaLabel && (
                            <span className="message-outgoing-attribution__module">
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
                {hasReactionSummary && (
                    <div className={`message-reactions-stack ${isOut ? 'out' : 'in'}`}>
                        {reactionSummary.map(([emoji, count]) => (
                            <span key={emoji} className="message-reaction-chip">
                                <span>{emoji}</span>
                                {count > 1 && <span className="message-reaction-chip-count">{count}</span>}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessageBubble;
