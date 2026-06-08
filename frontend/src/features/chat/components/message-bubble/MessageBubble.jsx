import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { Check, CheckCheck, ShoppingBag, Pencil, MapPin, ExternalLink, Reply, Forward, MoreHorizontal, Download, SmilePlus, Clock3, AlertCircle, RotateCcw, AlertTriangle, Copy } from 'lucide-react';
import {
    renderWhatsAppFormattedText,
    formatOrderMoney,
    isLikelyBinaryBody,
    extractFirstNonMapUrlFromText,
    renderAttachmentIcon,
    extractPhoneCandidatesFromText
} from './helpers';
import useMessageBubbleAttachmentActions from './hooks/useMessageBubbleAttachmentActions';
import useMessageBubbleLinkPreview from './hooks/useMessageBubbleLinkPreview';
import useMessageBubbleDerivedModel from './hooks/useMessageBubbleDerivedModel';
import { buildRenderedTemplateMessage } from '../../core/helpers/templateMessages.helpers';
import { API_URL } from '../../../../config/runtime';
import {
    CoverageMap,
    coordPair,
    useGoogleMapsLoader
} from '../../business/sections/BusinessCoverageTabSection';

const GLOBAL_SKIN_TONE_STORAGE_KEY = 'chat-emoji-skin-tone:global';
let locationMapsApiKeyPromise = null;
let locationMapsApiKeyCache = '';
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

const isRenderableTemplateHeaderImageSrc = (value = '') => /^(https?:\/\/|data:image\/|blob:|\/)/i.test(String(value || '').trim());

const parseCatalogMoney = (value = 0) => {
    const cleaned = String(value ?? '')
        .replace(/[^0-9,.-]/g, '')
        .replace(',', '.');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
};

const cleanCatalogText = (value = '') => String(value || '')
    .replace(/\*/g, '')
    .replace(/\r/g, '')
    .trim();

const extractCatalogProductNameFromText = (value = '') => {
    const lines = cleanCatalogText(value)
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    return lines.find((line) => !/^(precio|descuento|precio final|detalle)\s*:/i.test(line)) || '';
};

const extractCatalogFinalPriceLabel = (value = '') => {
    const clean = cleanCatalogText(value);
    const finalMatch = clean.match(/(?:^|\n)\s*precio\s+final\s*:\s*(?:s\/\s*)?([0-9][0-9.,]*)/i);
    if (finalMatch) return `S/ ${finalMatch[1]}`;
    const priceMatch = clean.match(/(?:^|\n)\s*precio\s*:\s*(?:s\/\s*)?([0-9][0-9.,]*)/i);
    return priceMatch ? `S/ ${priceMatch[1]}` : '';
};

const isCatalogProductCaption = (value = '') => {
    const clean = cleanCatalogText(value);
    return /(?:^|\n)\s*precio\s+final\s*:/i.test(clean)
        && /(?:^|\n)\s*(precio|descuento|precio\s+final)\s*:/i.test(clean);
};

const loadLocationMapsApiKey = async (buildApiHeaders) => {
    if (locationMapsApiKeyCache) return locationMapsApiKeyCache;
    if (!locationMapsApiKeyPromise) {
        locationMapsApiKeyPromise = fetch(`${API_URL}/api/tenant/config/maps-api-key`, {
            headers: typeof buildApiHeaders === 'function' ? buildApiHeaders({ includeJson: true }) : undefined
        })
            .then((response) => response.json().then((body) => ({ response, body })).catch(() => ({ response, body: {} })))
            .then(({ response, body }) => {
                if (!response.ok || body?.ok === false) return '';
                locationMapsApiKeyCache = String(body?.apiKey || '').trim();
                return locationMapsApiKeyCache;
            })
            .catch(() => '');
    }
    return locationMapsApiKeyPromise;
};

const MessageBubble = ({
    msg,
    onPrefillMessage,
    onLoadOrderToCart,
    onCreateOrderFromCatalog,
    isHighlighted = false,
    isCurrentHighlighted = false,
    onOpenMedia,
    onOpenMap,
    onOpenPhoneChat,
    onEditMessage,
    onReplyMessage,
    onStartForwardMode,
    onToggleForwardMessage,
    onSendReaction,
    onRetryMessage,
    onJumpToMessage,
    activeChatId = null,
    forwardMode = false,
    isForwardSelected = false,
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
        isUnrecognizedOrderPayload,
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
        isAutoMessage,
        autoMessageType,
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
    const rawMessageType = String(msg?.type || msg?.messageType || msg?.message_type || '').trim().toLowerCase();
    const isMessageFromMe = Boolean(msg?.fromMe === true || msg?.from_me === true || isOut);
    const isExplicitCatalogProduct = rawMessageType === 'catalog_product';
    const isCatalogCaptionProduct = Boolean(
        isMessageFromMe
        && !isCatalogItem
        && !hasOrder
        && !isOrderActionable
        && !isQuotePayload
        && !isProductPayload
        && !isOrderPayload
        && isCatalogProductCaption(messageBodyText)
    );
    const catalogOrderProductName = String(
        productTitle
        || msg?.productName
        || msg?.product_name
        || msg?.productTitle
        || msg?.product_title
        || extractCatalogProductNameFromText(messageBodyText)
        || 'Producto del catalogo'
    ).trim();
    const catalogOrderPriceLabel = productPrice || extractCatalogFinalPriceLabel(messageBodyText);
    const canCreateCatalogOrder = Boolean(
        isMessageFromMe
        && typeof onCreateOrderFromCatalog === 'function'
        && (isCatalogItem || isExplicitCatalogProduct || isCatalogCaptionProduct)
    );
    const handleCreateCatalogOrder = () => {
        if (!canCreateCatalogOrder) return;
        onCreateOrderFromCatalog({
            messageId: String(msg?.id || '').trim() || null,
            productId: String(msg?.productId || msg?.product_id || msg?.metadata?.productId || msg?.metadata?.product_id || '').trim() || null,
            productName: catalogOrderProductName || 'Producto del catalogo',
            unitPrice: parseCatalogMoney(catalogOrderPriceLabel),
            sourceBody: messageBodyText
        });
    };
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
    const isOptionQuote = Boolean(
        actionOrder?.isOptionMode
        || actionOrder?.is_option_mode
        || actionOrder?.rawPreview?.isOptionMode
        || actionOrder?.rawPreview?.is_option_mode
        || quoteMetadata?.isOptionMode
        || quoteMetadata?.is_option_mode
    );
    const optionNumber = Number(
        actionOrder?.optionNumber
        ?? actionOrder?.option_number
        ?? actionOrder?.rawPreview?.optionNumber
        ?? actionOrder?.rawPreview?.option_number
        ?? quoteMetadata?.optionNumber
        ?? quoteMetadata?.option_number
        ?? 0
    );
    const quoteNumber = Number(
        actionOrder?.quoteNumber
        ?? actionOrder?.quote_number
        ?? actionOrder?.rawPreview?.quoteNumber
        ?? actionOrder?.rawPreview?.quote_number
        ?? quoteMetadata?.quoteNumber
        ?? quoteMetadata?.quote_number
        ?? 0
    );
    const revisionNumber = Number(
        actionOrder?.revisionNumber
        ?? actionOrder?.revision_number
        ?? actionOrder?.rawPreview?.revisionNumber
        ?? actionOrder?.rawPreview?.revision_number
        ?? quoteMetadata?.revisionNumber
        ?? quoteMetadata?.revision_number
        ?? 0
    );
    const quoteCardNumberLabel = Number.isFinite(quoteNumber) && quoteNumber > 0
        ? ` ${Math.trunc(quoteNumber)}${Number.isFinite(revisionNumber) && revisionNumber > 1 ? ` (Rev. ${Math.trunc(revisionNumber)})` : ''}`
        : '';
    const optionCardNumberLabel = Number.isFinite(optionNumber) && optionNumber > 0 ? ` ${Math.trunc(optionNumber)}` : '';
    const quoteCardTitle = quoteSourceType === 'order' || quoteHasSourceOrder
        ? '🛒 Resumen De Pedido'
        : `📋 Cotización${quoteCardNumberLabel}`;
    const displayQuoteCardTitle = isOptionQuote ? `Opcion${optionCardNumberLabel}` : quoteCardTitle;
    const [selectedLocationText, setSelectedLocationText] = useState('');
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [copyOk, setCopyOk] = useState(false);
    const [preferredSkinTone, setPreferredSkinTone] = useState('neutral');
    const [mediaImageFailed, setMediaImageFailed] = useState(false);
    const [templateHeaderImageFailed, setTemplateHeaderImageFailed] = useState(false);
    const [locationMapsApiKey, setLocationMapsApiKey] = useState(locationMapsApiKeyCache);
    const bubbleRef = useRef(null);
    const longPressTimerRef = useRef(null);
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
        if (!showActionsMenu && !showReactionPicker) return;

        const handleOutsideClick = (event) => {
            if (!bubbleRef.current) return;
            if (bubbleRef.current.contains(event.target)) return;
            setShowActionsMenu(false);
            setShowReactionPicker(false);
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setShowActionsMenu(false);
                setShowReactionPicker(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [showActionsMenu, showReactionPicker]);

    useEffect(() => () => {
        if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

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

    useEffect(() => {
        setTemplateHeaderImageFailed(false);
    }, [msg?.id, msg?.templateHeaderImageUrl, msg?.templateHeaderType]);

    useEffect(() => {
        setMediaImageFailed(false);
    }, [msg?.id, mediaImageSrc]);

    const hasLocationCoords = Number.isFinite(locationData?.latitude) && Number.isFinite(locationData?.longitude);
    const locationMapQuery = hasLocationCoords
        ? `${locationData.latitude},${locationData.longitude}`
        : String(locationData?.mapUrl || locationData?.label || '');
    const locationPreviewCoords = coordPair({
        lat: locationData?.latitude,
        lng: locationData?.longitude
    });
    const locationMapsState = useGoogleMapsLoader(isLocationMessage && hasLocationCoords ? locationMapsApiKey : '');
    const locationPreviewGoogle = locationMapsState.loaded ? window.google : null;

    useEffect(() => {
        let cancelled = false;
        if (!isLocationMessage || !hasLocationCoords || locationMapsApiKey) return undefined;
        loadLocationMapsApiKey(buildApiHeaders).then((apiKey) => {
            if (!cancelled) setLocationMapsApiKey(apiKey);
        });
        return () => {
            cancelled = true;
        };
    }, [buildApiHeaders, hasLocationCoords, isLocationMessage, locationMapsApiKey]);

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
    const shouldRenderTemplateBubble = renderedTemplate.isTemplateMessage && !isCatalogItem && !isOrderActionable;
    const shouldRenderStandaloneMedia = msg.hasMedia && !renderedTemplate.isTemplateMessage;
    const templateHeaderImageSrc = isRenderableTemplateHeaderImageSrc(renderedTemplate.headerImageUrl)
        ? renderedTemplate.headerImageUrl
        : '';
    const shouldRenderTemplateHeaderImage = shouldRenderTemplateBubble
        && renderedTemplate.headerType === 'IMAGE'
        && Boolean(templateHeaderImageSrc)
        && !templateHeaderImageFailed;
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
    const sourceMessageId = String(
        msg?.id
        || msg?.messageId
        || msg?.message_id
        || msg?._id
        || ''
    ).trim();
    const copyableText = String(
        messageTextToRender
        || messageBodyText
        || msg?.body
        || msg?.text
        || msg?.message
        || msg?.caption
        || ''
    ).trim();
    const canCopyMessage = Boolean(copyableText);
    const hasForwardableImage = Boolean(
        isImageMedia
        || (/image/i.test(String(msg?.mimetype || msg?.mimeType || '')) && (msg?.hasMedia || mediaImageSrc || mediaDataUrl || mediaUrl))
        || /\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(String(mediaUrl || msg?.mediaUrl || msg?.media_url || ''))
    );
    const canForwardContent = Boolean(
        copyableText
        || hasForwardableImage
    );
    const isForwardBlockedPayload = Boolean(
        isAutoMessage
        || isCatalogItem
        || isExplicitCatalogProduct
        || isCatalogCaptionProduct
        || hasOrder
        || isOrderActionable
        || isProductPayload
        || isOrderPayload
        || isQuotePayload
        || isUnrecognizedOrderPayload
        || shouldRenderTemplateBubble
    );
    const canForwardMessage = canForwardMessageBase
        && sourceMessageId
        && typeof onStartForwardMode === 'function'
        && canForwardContent
        && !isForwardBlockedPayload;

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
    const hasMenuActions = Boolean(canReplyMessage || canForwardMessage || canEditMessage || canCopyMessage || canSendReaction);
    const actionPreviewMediaSrc = isImageMedia ? (mediaImageSrc || mediaDataUrl || mediaUrl || '') : '';
    const actionPreviewText = copyableText || (actionPreviewMediaSrc ? 'Imagen' : (isVideoMedia ? 'Video' : 'Mensaje'));
    const isMobileViewport = () => (
        typeof window !== 'undefined'
        && typeof window.innerWidth === 'number'
        && window.innerWidth < 769
    );
    const isInteractiveTarget = (target) => Boolean(
        target?.closest?.('button,a,input,textarea,select,[role="button"],.message-action-sheet,.message-reaction-picker')
    );
    const clearMobileLongPress = () => {
        if (longPressTimerRef.current && typeof window !== 'undefined') {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };
    const openMobileActionSheet = () => {
        if (!hasMenuActions || forwardMode) return;
        setShowReactionPicker(false);
        setShowActionsMenu(true);
    };
    const handleBubblePointerDown = (event) => {
        if (!hasMenuActions || forwardMode || !isMobileViewport()) return;
        if (event.pointerType && event.pointerType !== 'touch') return;
        if (isInteractiveTarget(event.target)) return;
        clearMobileLongPress();
        longPressTimerRef.current = window.setTimeout(openMobileActionSheet, 500);
    };
    const handleBubbleContextMenu = (event) => {
        if (!hasMenuActions || forwardMode || !isMobileViewport()) return;
        event.preventDefault();
        clearMobileLongPress();
        openMobileActionSheet();
    };
    const handleBubbleClick = (event) => {
        if (!forwardMode || !canForwardMessage) return;
        if (isInteractiveTarget(event.target)) return;
        event.stopPropagation();
        if (typeof onToggleForwardMessage === 'function') onToggleForwardMessage(msg);
    };
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
    };
    const handleReactionMenuClick = () => {
        if (!canSendReaction) return;
        setShowActionsMenu((prev) => (isMobileViewport() ? prev : false));
        setShowReactionPicker((prev) => !prev);
    };

    const handleForwardClick = () => {
        if (!canForwardMessage) return;
        if (typeof onStartForwardMode === 'function') {
            onStartForwardMode(msg);
        }
        setShowActionsMenu(false);
    };
    const handleCopyClick = async () => {
        if (!canCopyMessage) return;
        try {
            if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(copyableText);
            } else if (typeof document !== 'undefined') {
                const textarea = document.createElement('textarea');
                textarea.value = copyableText;
                textarea.setAttribute('readonly', 'true');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setCopyOk(true);
            setTimeout(() => setCopyOk(false), 1200);
        } catch (_) {
            setCopyOk(false);
        } finally {
            setShowActionsMenu(false);
        }
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
        setShowActionsMenu(false);
    };

    return (
        <div
            ref={bubbleRef}
            className={`message ${isOut ? 'out' : 'in'}${hasMenuActions ? ' has-menu-actions' : ''}${hasReactionSummary ? ' has-reactions' : ''}${forwardMode ? ' forward-selectable' : ''}${isForwardSelected ? ' forward-selected' : ''}`}
            style={isHighlighted ? { outline: `2px solid ${isCurrentHighlighted ? '#00a884' : 'rgba(0,168,132,0.35)'}`, borderRadius: '10px', padding: '2px' } : undefined}
            onPointerDown={handleBubblePointerDown}
            onPointerUp={clearMobileLongPress}
            onPointerLeave={clearMobileLongPress}
            onPointerCancel={clearMobileLongPress}
            onContextMenu={handleBubbleContextMenu}
            onClick={handleBubbleClick}
        >
            {forwardMode && canForwardMessage && sourceMessageId && (
                <button
                    type="button"
                    className={`message-forward-checkbox ${isForwardSelected ? 'checked' : ''}`}
                    aria-label={isForwardSelected ? 'Quitar de reenvio' : 'Seleccionar para reenviar'}
                    onClick={(event) => {
                        event.stopPropagation();
                        if (typeof onToggleForwardMessage === 'function') onToggleForwardMessage(msg);
                    }}
                >
                    {isForwardSelected ? <Check size={13} /> : null}
                </button>
            )}
            {isCatalogItem && (
                <div className="catalog-card">
                    <div style={{ width: '100%', height: '72px', background: 'linear-gradient(120deg,#233138,#1a252b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingBag size={20} color="#9db0ba" />
                    </div>
                    <div className="catalog-card-info">
                        <div className="catalog-card-title">{productTitle}</div>
                        <div className="catalog-card-price">{productPrice}</div>
                    </div>
                    {isOut ? (
                        <button
                            className="catalog-card-btn"
                            disabled={!canCreateCatalogOrder}
                            onClick={handleCreateCatalogOrder}
                        >
                            <ShoppingBag size={16} /> Cliente acepto
                        </button>
                    ) : (
                        <button className="catalog-card-btn" onClick={() => onPrefillMessage && onPrefillMessage(`Hola, me interesa ${productTitle || 'el producto del catalogo'}. Me confirmas stock y precio final?`)}>
                            <ShoppingBag size={16} /> Pedir cotizacion
                        </button>
                    )}
                </div>
            )}

            {shouldRenderStandaloneMedia && mediaImageSrc && (isImageMedia || isGifMedia) && !mediaImageFailed && (
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
                    onError={() => setMediaImageFailed(true)}
                    onClick={() => onOpenMedia && onOpenMedia({ src: mediaImageSrc, mimetype: msg.mimetype, messageId: msg.id })}
                />
            )}

            {shouldRenderStandaloneMedia && mediaImageSrc && (isImageMedia || isGifMedia) && mediaImageFailed && (
                <div
                    className="message-media message-media--unavailable"
                    style={{
                        borderRadius: '8px',
                        marginBottom: '4px',
                        maxWidth: 'min(320px, 56vw)',
                        minHeight: '120px',
                        display: 'grid',
                        placeItems: 'center',
                        padding: '14px',
                        background: 'rgba(17, 24, 39, 0.08)',
                        color: 'var(--chat-control-text-soft)',
                        fontSize: '0.82rem',
                        textAlign: 'center'
                    }}
                >
                    Imagen no disponible
                </div>
            )}

            {shouldRenderStandaloneMedia && inlineVideoSrc && isVideoMedia && !isGifMedia && (
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

            {shouldRenderStandaloneMedia && msg.mediaData && msg.mimetype?.startsWith('audio/') && (
                <audio
                    src={mediaDataUrl}
                    controls
                    className="media-audio"
                    style={{ marginBottom: '4px' }}
                />
            )}

            {shouldRenderStandaloneMedia && hasBinaryAttachment && attachmentMeta && (
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
                        {isProductPayload ? 'Producto compartido' : (isQuotePayload ? displayQuoteCardTitle : '🛒 Pedido del cliente')}
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
                                const quoteProductsForCart = orderItems.length > 0 ? orderItems : quoteItemsFromBody;
                                const orderForCart = actionOrder && typeof actionOrder === 'object'
                                    ? (isQuotePayload
                                        ? {
                                            ...actionOrder,
                                            products: Array.isArray(actionOrder?.products) && actionOrder.products.length > 0
                                                ? actionOrder.products
                                                : quoteProductsForCart,
                                            sourceType: 'quote',
                                            quoteId: String(actionOrder?.quoteId || actionOrder?.rawPreview?.quoteId || '').trim() || null,
                                            quoteNumber: Number.isFinite(quoteNumber) && quoteNumber > 0 ? Math.trunc(quoteNumber) : null,
                                            revisionNumber: Number.isFinite(revisionNumber) && revisionNumber > 0 ? Math.trunc(revisionNumber) : null,
                                            sourceQuoteMessageId: String(msg?.id || '').trim() || actionOrder?.sourceQuoteMessageId || null,
                                            rawPreview: actionOrder?.rawPreview && typeof actionOrder.rawPreview === 'object'
                                                ? {
                                                    ...actionOrder.rawPreview,
                                                    type: 'quote',
                                                    sourceType: 'quote',
                                                    quoteId: String(actionOrder?.quoteId || actionOrder.rawPreview.quoteId || '').trim() || null,
                                                    quoteNumber: Number.isFinite(quoteNumber) && quoteNumber > 0 ? Math.trunc(quoteNumber) : null,
                                                    revisionNumber: Number.isFinite(revisionNumber) && revisionNumber > 0 ? Math.trunc(revisionNumber) : null,
                                                    products: Array.isArray(actionOrder?.rawPreview?.products) && actionOrder.rawPreview.products.length > 0
                                                        ? actionOrder.rawPreview.products
                                                        : quoteProductsForCart,
                                                    quoteSummary: actionOrder?.rawPreview?.quoteSummary || quoteSummaryRaw || null
                                                }
                                                : { type: 'quote', sourceType: 'quote', products: quoteProductsForCart, quoteSummary: quoteSummaryRaw || null }
                                        }
                                        : {
                                            ...actionOrder,
                                            products: Array.isArray(actionOrder?.products) && actionOrder.products.length > 0
                                                ? actionOrder.products
                                                : orderItems,
                                            sourceMessageId: sourceMessageId || actionOrder?.sourceMessageId || null
                                        })
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

            {isUnrecognizedOrderPayload && !/^opci[oó]n\s+\d+/i.test(String(msg?.body || '').trim()) && (
                <div className="message-order-card__hint">
                    Formato de pedido no reconocido. Se muestra el contenido original.
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
                        background: 'rgba(255,255,255,0.72)',
                        borderRadius: '9px',
                        padding: '8px',
                        marginBottom: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00c7a0', fontSize: '0.78rem', fontWeight: 700 }}>
                            <MapPin size={14} /> Ubicacion compartida
                        </div>

                        {hasLocationCoords && (
                            <button
                                type="button"
                                onClick={() => openMapPopup({ mode: 'location', query: locationData?.label || locationMapQuery, mapUrl: locationData?.mapUrl, latitude: locationData?.latitude, longitude: locationData?.longitude })}
                                style={{
                                    marginTop: '7px',
                                    width: '100%',
                                    border: '1px solid rgba(124,200,255,0.35)',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    padding: 0,
                                    cursor: 'pointer',
                                    background: '#eef7f2'
                                }}
                            >
                                {locationPreviewCoords && locationPreviewGoogle?.maps ? (
                                    <CoverageMap
                                        google={locationPreviewGoogle}
                                        coords={locationPreviewCoords}
                                        agencies={[]}
                                        className="location-message-mini-map"
                                    />
                                ) : (
                                    <div className="location-message-mini-fallback">
                                        <MapPin size={22} />
                                        <span>Ubicacion compartida</span>
                                        <small>{locationMapQuery}</small>
                                    </div>
                                )}
                            </button>
                        )}

                        <div style={{ fontSize: '0.84rem', color: '#1f2937', marginTop: '6px', fontWeight: 700 }}>
                            {locationData?.label || 'Ubicacion'}
                        </div>
                        {(locationData?.latitude !== null && locationData?.longitude !== null) && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                                {locationData.latitude.toFixed(6)}, {locationData.longitude.toFixed(6)}
                            </div>
                        )}
                        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => openMapPopup({ mode: 'location', query: locationData?.label || locationMapQuery, mapUrl: locationData?.mapUrl, latitude: locationData?.latitude, longitude: locationData?.longitude })}
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
                        {shouldRenderTemplateHeaderImage ? (
                            <img
                                src={templateHeaderImageSrc}
                                className="message-media message-template-preview__image"
                                alt="Header del template"
                                style={{
                                    borderRadius: '8px',
                                    marginBottom: '4px',
                                    maxWidth: 'min(320px, 56vw)',
                                    maxHeight: '260px',
                                    objectFit: 'cover',
                                    cursor: onOpenMedia ? 'zoom-in' : 'default',
                                    display: 'block'
                                }}
                                onError={() => setTemplateHeaderImageFailed(true)}
                                onClick={() => {
                                    if (!onOpenMedia) return;
                                    onOpenMedia({
                                        src: templateHeaderImageSrc,
                                        mimetype: 'image/*',
                                        messageId: msg.id
                                    });
                                }}
                            />
                        ) : null}
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

                {!isCatalogItem && canCreateCatalogOrder && (
                    <button
                        type="button"
                        className="catalog-card-btn"
                        onClick={handleCreateCatalogOrder}
                        style={{
                            marginTop: '8px',
                            alignSelf: isOut ? 'flex-end' : 'flex-start',
                            width: 'auto'
                        }}
                    >
                        <ShoppingBag size={16} /> Cliente acepto
                    </button>
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
                {hasMenuActions && (
                    <div className={`message-actions-anchor ${showActionsMenu ? 'open' : ''}`}>
                        <div className={`message-actions-rail ${isOut ? 'out' : 'in'}`}>
                            <button
                                type="button"
                                className={`message-actions-toggle ${showActionsMenu ? 'open' : ''}`}
                                title="Opciones"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setShowReactionPicker(false);
                                    setShowActionsMenu((prev) => !prev);
                                }}
                            >
                                <MoreHorizontal size={14} />
                            </button>
                        </div>
                        {showActionsMenu && (
                            <div className={`message-actions-menu ${isOut ? 'out' : 'in'}`} onClick={(event) => event.stopPropagation()}>
                                {canReplyMessage && (
                                    <button type="button" className="message-actions-item" onClick={handleReplyClick}>
                                        <Reply size={13} /> Responder
                                    </button>
                                )}
                                {canCopyMessage && (
                                    <button type="button" className="message-actions-item" onClick={handleCopyClick}>
                                        <Copy size={13} /> {copyOk ? 'Copiado' : 'Copiar'}
                                    </button>
                                )}
                                {canSendReaction && (
                                    <button type="button" className="message-actions-item" onClick={handleReactionMenuClick}>
                                        <SmilePlus size={13} /> Reaccionar
                                    </button>
                                )}
                                {canForwardMessage && (
                                    <button
                                        type="button"
                                        className="message-actions-item"
                                        onClick={handleForwardClick}
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
                {showActionsMenu && (
                    <div
                        className="message-action-sheet-overlay"
                        onClick={(event) => {
                            event.stopPropagation();
                            setShowActionsMenu(false);
                            setShowReactionPicker(false);
                        }}
                    >
                        <div
                            className="message-action-sheet"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Acciones del mensaje"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="message-action-sheet__handle" />
                            <div className="message-action-sheet__preview">
                                {actionPreviewMediaSrc ? (
                                    <img src={actionPreviewMediaSrc} alt="Vista previa del mensaje" />
                                ) : (
                                    <span>{actionPreviewText}</span>
                                )}
                            </div>
                            <div className="message-action-sheet__actions">
                                {canReplyMessage && (
                                    <button type="button" className="message-action-sheet__item" onClick={handleReplyClick}>
                                        <Reply size={18} /> Responder
                                    </button>
                                )}
                                {canCopyMessage && (
                                    <button type="button" className="message-action-sheet__item" onClick={handleCopyClick}>
                                        <Copy size={18} /> {copyOk ? 'Copiado' : 'Copiar'}
                                    </button>
                                )}
                                {canSendReaction && (
                                    <>
                                        <button type="button" className="message-action-sheet__item" onClick={handleReactionMenuClick}>
                                            <SmilePlus size={18} /> Reaccionar
                                        </button>
                                        {showReactionPicker && (
                                            <div className="message-action-sheet__reactions">
                                                {reactionOptions.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        className="message-reaction-option"
                                                        title={`Reaccionar con ${emoji}`}
                                                        onClick={() => handleReactionSelect(emoji)}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                                {canForwardMessage && (
                                    <button type="button" className="message-action-sheet__item" onClick={handleForwardClick}>
                                        <Forward size={18} /> Reenviar
                                    </button>
                                )}
                                {canEditMessage && (
                                    <button
                                        type="button"
                                        className="message-action-sheet__item"
                                        onClick={() => {
                                            handleEditClick();
                                            setShowActionsMenu(false);
                                        }}
                                    >
                                        <Pencil size={18} /> Editar
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                className="message-action-sheet__cancel"
                                onClick={() => {
                                    setShowActionsMenu(false);
                                    setShowReactionPicker(false);
                                }}
                            >
                                Cancelar
                            </button>
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
                        {isAutoMessage && (
                            <span
                                className={`message-outgoing-attribution__auto ${autoMessageType === 'away' ? 'is-away' : 'is-welcome'}`}
                                title={autoMessageType === 'away' ? 'Mensaje automatico fuera de horario' : 'Mensaje automatico de bienvenida'}
                            >
                                Auto
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
