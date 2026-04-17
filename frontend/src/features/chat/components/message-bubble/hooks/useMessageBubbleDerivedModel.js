import { useMemo } from 'react';
import {
    parseOrderMoneyValue,
    formatOrderMoney,
    isLikelyBinaryBody,
    normalizeSearchText,
    parseQuoteItemsFromBody,
    parseQuotePaymentFromBody,
    resolveLocationData,
    getGroupSenderColor,
    buildAttachmentMeta
} from '../helpers';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function useMessageBubbleDerivedModel({
    msg,
    senderDisplayName,
    canEditMessages,
    activeChatId
}) {
    return useMemo(() => {
        const safeMsg = msg && typeof msg === 'object' ? msg : {};

        // Bloque 1: identidad del mensaje (depende solo de msg)
        const isOut = Boolean(safeMsg.fromMe);
        const messageBodyText = String(safeMsg.body || '');
        const isCatalogItem = messageBodyText.includes('REF:');

        // Bloque 2: orden/cotizacion (depende solo de msg)
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
        const hasOrder = Boolean(safeMsg.order);
        const actionOrder = hasOrder ? safeMsg.order : quoteOrderPayload;
        const orderRawType = String(actionOrder?.rawPreview?.type || safeMsg.type || '').toLowerCase();
        const orderItems = Array.isArray(actionOrder?.products) ? actionOrder.products : [];
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

        // Bloque 3: media y ubicacion (depende de msg + API_URL constante)
        const locationData = resolveLocationData(safeMsg);
        const isLocationMessage = Boolean(locationData);
        const mediaDataUrl = safeMsg.hasMedia && safeMsg.mediaData
            ? `data:${safeMsg.mimetype || 'application/octet-stream'};base64,${safeMsg.mediaData}`
            : null;
        const rawMediaUrl = safeMsg.hasMedia ? String(safeMsg?.mediaUrl || '').trim() : '';
        const mediaUrl = (() => {
            if (!rawMediaUrl) return '';
            if (/^https?:\/\//i.test(rawMediaUrl)) return rawMediaUrl;
            if (/^data:/i.test(rawMediaUrl)) return rawMediaUrl;
            const normalizedPath = rawMediaUrl.startsWith('/') ? rawMediaUrl : `/${rawMediaUrl}`;
            return `${String(API_URL || '').replace(/\/+$/, '')}${normalizedPath}`;
        })();
        const mediaImageSrc = mediaDataUrl || (mediaUrl || null);
        const mediaLooksImageByUrl = Boolean(mediaUrl && /\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(mediaUrl));
        const isImageMedia = Boolean(String(safeMsg?.mimetype || '').trim().toLowerCase().startsWith('image/')) || mediaLooksImageByUrl;
        const isVideoMedia = Boolean(String(safeMsg?.mimetype || '').trim().toLowerCase().startsWith('video/'));
        const hasBinaryAttachment = Boolean(
            safeMsg.hasMedia
            && safeMsg.mediaData
            && !safeMsg.mimetype?.startsWith('image/')
            && !safeMsg.mimetype?.startsWith('audio/')
            && !safeMsg.mimetype?.startsWith('video/')
        );
        const attachmentMeta = hasBinaryAttachment ? buildAttachmentMeta(safeMsg) : null;

        // Bloque 4: atribucion y permisos (depende de msg + senderDisplayName + canEditMessages)
        const messageSenderName = String(senderDisplayName || safeMsg?.notifyName || safeMsg?.senderPushname || '').trim();
        const senderIdentityKey = String(
            safeMsg?.senderId
            || safeMsg?.author
            || safeMsg?.senderPhone
            || messageSenderName
            || ''
        ).trim().toLowerCase();
        const senderNameColor = getGroupSenderColor(senderIdentityKey);
        const sentByName = String(safeMsg?.sentByName || safeMsg?.sentByEmail || '').trim();
        const sentByRole = String(safeMsg?.sentByRole || '').trim();
        const sentViaModuleName = String(safeMsg?.sentViaModuleName || '').trim();
        const safeSentByName = sentByName.replace(/\s+/g, ' ').trim();
        const roleLabelMap = {
            superadmin: 'Superadmin',
            owner: 'Owner',
            admin: 'Admin',
            seller: 'Vendedor'
        };
        const safeRoleLabel = roleLabelMap[String(sentByRole || '').trim().toLowerCase()] || '';
        const fallbackSentByUserId = String(safeMsg?.sentByUserId || '').trim();
        const displaySentByName = String(safeSentByName || safeRoleLabel || fallbackSentByUserId || 'Operador').trim();
        const safeSentViaLabel = String(sentViaModuleName || sentByRole || '')
            .replace(/[\u25C6\u25C8\u2022\u00B7\uFFFD<>|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const showOutgoingAttribution = Boolean(isOut && (displaySentByName || safeSentViaLabel));
        const canEditMessage = Boolean(
            canEditMessages
            && isOut
            && !safeMsg?.hasMedia
            && String(safeMsg?.body || '').trim()
            && safeMsg?.canEdit === true
        );
        const canReplyMessage = Boolean(safeMsg?.id);
        const canForwardMessage = Boolean(safeMsg?.id);

        void activeChatId;

        return {
            // Bloque 1: identidad del mensaje (depende solo de msg)
            isOut,
            isCatalogItem,
            messageBodyText,

            // Bloque 2: orden/cotizacion (depende solo de msg)
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

            // Bloque 3: media y ubicacion (depende de msg + API_URL constante)
            mediaUrl,
            mediaImageSrc,
            isImageMedia,
            isVideoMedia,
            hasBinaryAttachment,
            attachmentMeta,
            locationData,
            isLocationMessage,

            // Bloque 4: atribucion y permisos (depende de msg + senderDisplayName + canEditMessages)
            messageSenderName,
            senderNameColor,
            displaySentByName,
            safeRoleLabel,
            safeSentViaLabel,
            showOutgoingAttribution,
            canEditMessage,
            canReplyMessage,
            canForwardMessage
        };
    }, [msg, senderDisplayName, canEditMessages, activeChatId]);
}
