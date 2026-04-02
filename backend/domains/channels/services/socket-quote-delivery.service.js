const fallbackQuotesService = require('../../tenant/services/quotes.service');

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function toText(value = '') {
    return String(value || '').trim();
}

function toNullableText(value = '') {
    const text = toText(value);
    return text || null;
}

function toFiniteNumberOrNull(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeQuoteItem(item = {}, index = 0, currency = 'PEN') {
    const source = isPlainObject(item) ? item : {};
    const itemId = toNullableText(source.itemId || source.id || source.productId || ('item_' + (index + 1)));
    const productId = toNullableText(source.productId || source.id || source.itemId);
    const quantity = toFiniteNumberOrNull(source.qty ?? source.quantity) ?? 1;
    const unitPrice = toFiniteNumberOrNull(source.unitPrice ?? source.price) ?? 0;
    const lineSubtotal = toFiniteNumberOrNull(source.lineSubtotal ?? (quantity * unitPrice)) ?? 0;
    const lineDiscountValue = toFiniteNumberOrNull(source.lineDiscountValue) ?? 0;
    const lineDiscountAmount = toFiniteNumberOrNull(source.lineDiscountAmount) ?? 0;
    const lineTotal = toFiniteNumberOrNull(source.lineTotal ?? (lineSubtotal - lineDiscountAmount)) ?? 0;

    return {
        itemId,
        productId,
        sku: toNullableText(source.sku),
        title: toText(source.title || source.name || source.productName || 'Producto'),
        unit: toText(source.unit || 'unidad') || 'unidad',
        qty: quantity,
        unitPrice,
        lineSubtotal,
        lineDiscountType: toNullableText(source.lineDiscountType || source.discountType),
        lineDiscountValue,
        lineDiscountAmount,
        lineTotal,
        currency: toText(source.currency || currency || 'PEN') || 'PEN',
        metadata: isPlainObject(source.metadata) ? source.metadata : {}
    };
}

function normalizeQuoteSummary(summary = {}, items = [], currency = 'PEN') {
    const source = isPlainObject(summary) ? summary : {};
    const itemCount = Number.isInteger(Number(source.itemCount))
        ? Number(source.itemCount)
        : items.length;
    const subtotal = toFiniteNumberOrNull(source.subtotal)
        ?? items.reduce((acc, item) => acc + (toFiniteNumberOrNull(item?.lineSubtotal) || 0), 0);
    const discount = toFiniteNumberOrNull(source.discount) ?? 0;
    const totalAfterDiscount = toFiniteNumberOrNull(source.totalAfterDiscount)
        ?? Math.max(0, (subtotal || 0) - discount);
    const deliveryAmount = toFiniteNumberOrNull(source.deliveryAmount) ?? 0;
    const deliveryFree = Boolean(source.deliveryFree) || deliveryAmount <= 0;
    const totalPayable = toFiniteNumberOrNull(source.totalPayable)
        ?? Math.max(0, (totalAfterDiscount || 0) + (deliveryFree ? 0 : deliveryAmount));

    return {
        itemCount,
        subtotal,
        discount,
        totalAfterDiscount,
        deliveryAmount,
        deliveryFree,
        totalPayable,
        globalDiscount: isPlainObject(source.globalDiscount)
            ? {
                enabled: Boolean(source.globalDiscount.enabled),
                type: String(source.globalDiscount.type || 'none').trim().toLowerCase() || 'none',
                value: toFiniteNumberOrNull(source.globalDiscount.value) ?? 0,
                applied: toFiniteNumberOrNull(source.globalDiscount.applied) ?? 0
            }
            : { enabled: false, type: 'none', value: 0, applied: 0 },
        currency: toText(source.currency || currency || 'PEN') || 'PEN',
        metadata: isPlainObject(source.metadata) ? source.metadata : {}
    };
}

function normalizeStructuredQuote(payload = {}) {
    const source = isPlainObject(payload) ? payload : {};
    const currency = toText(source.currency || source?.summary?.currency || 'PEN') || 'PEN';
    const rawItems = Array.isArray(source.items) ? source.items : [];
    const items = rawItems.map((item, index) => normalizeQuoteItem(item, index, currency));

    return {
        quoteId: toNullableText(source.quoteId),
        currency,
        items,
        summary: normalizeQuoteSummary(source.summary, items, currency),
        notes: toNullableText(source.notes),
        metadata: isPlainObject(source.metadata) ? source.metadata : {}
    };
}

function buildQuoteMessageBody(quote = {}, fallbackBody = '') {
    const explicitBody = toText(fallbackBody);
    if (explicitBody) return explicitBody;

    const quoteIdLabel = quote?.quoteId ? ' #' + quote.quoteId : '';
    const itemCount = Number.isInteger(Number(quote?.summary?.itemCount))
        ? Number(quote.summary.itemCount)
        : Array.isArray(quote?.items)
            ? quote.items.length
            : 0;
    const totalPayable = toFiniteNumberOrNull(quote?.summary?.totalPayable);
    const currency = toText(quote?.currency || quote?.summary?.currency || 'PEN') || 'PEN';
    const totalLine = totalPayable !== null ? '\nTotal: ' + currency + ' ' + totalPayable.toFixed(1) : '';
    const notesLine = quote?.notes ? '\n' + quote.notes : '';

    return ('Cotizacion' + quoteIdLabel + '\nItems: ' + itemCount + totalLine + notesLine).trim();
}

function buildOutgoingOrderPayload(quote = {}) {
    const items = Array.isArray(quote?.items) ? quote.items : [];
    const summary = isPlainObject(quote?.summary) ? quote.summary : {};
    const currency = toText(quote?.currency || summary?.currency || 'PEN') || 'PEN';

    return {
        type: 'quote',
        quoteId: toNullableText(quote?.quoteId),
        currency,
        subtotal: toFiniteNumberOrNull(summary?.subtotal),
        products: items,
        rawPreview: {
            type: 'quote',
            itemCount: Number.isInteger(Number(summary?.itemCount)) ? Number(summary.itemCount) : items.length,
            currency,
            quoteSummary: {
                itemCount: Number.isInteger(Number(summary?.itemCount)) ? Number(summary.itemCount) : items.length,
                subtotal: toFiniteNumberOrNull(summary?.subtotal),
                discount: toFiniteNumberOrNull(summary?.discount),
                totalAfterDiscount: toFiniteNumberOrNull(summary?.totalAfterDiscount),
                deliveryAmount: toFiniteNumberOrNull(summary?.deliveryAmount),
                deliveryFree: Boolean(summary?.deliveryFree),
                totalPayable: toFiniteNumberOrNull(summary?.totalPayable),
                globalDiscount: summary?.globalDiscount && typeof summary.globalDiscount === 'object'
                    ? {
                        type: String(summary.globalDiscount.type || 'none').trim().toLowerCase() || 'none',
                        value: toFiniteNumberOrNull(summary.globalDiscount.value) ?? 0,
                        applied: toFiniteNumberOrNull(summary.globalDiscount.applied) ?? 0
                    }
                    : { type: 'none', value: 0, applied: 0 },
                currency
            }
        },
        notes: toNullableText(quote?.notes),
        metadata: isPlainObject(quote?.metadata) ? quote.metadata : {}
    };
}

function resolveActorUserId(authContext = null) {
    const user = isPlainObject(authContext?.user) ? authContext.user : {};
    return toNullableText(user.userId || user.id || authContext?.userId || '');
}

function createSocketQuoteDeliveryService({
    waClient,
    getSerializedMessageId,
    buildSocketAgentMeta,
    sanitizeAgentMeta,
    rememberOutgoingAgentMeta,
    chatCommercialStatusService = null,
    quotesService = fallbackQuotesService
} = {}) {
    const resolvedQuotesService = quotesService && typeof quotesService.createQuoteRecord === 'function'
        ? quotesService
        : fallbackQuotesService;

    const registerQuoteDeliveryHandlers = ({
        socket,
        tenantId = 'default',
        authContext,
        guardRateLimit,
        transportOrchestrator,
        resolveScopedSendTarget,
        emitRealtimeOutgoingMessage,
        emitCommercialStatusUpdated,
        recordConversationEvent
    } = {}) => {
        socket.on('send_structured_quote', async (payload = {}) => {
            if (!guardRateLimit(socket, 'send_structured_quote')) return;
            if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar cotizaciones', errorEvent: 'quote_error' })) return;

            try {
                const target = await resolveScopedSendTarget({
                    rawChatId: payload?.to,
                    rawPhone: payload?.toPhone,
                    errorEvent: 'quote_error',
                    action: 'enviar cotizaciones'
                });
                if (!target?.ok) return;

                const incomingQuote = normalizeStructuredQuote(
                    isPlainObject(payload?.quote)
                        ? payload.quote
                        : payload
                );

                if (!Array.isArray(incomingQuote.items) || incomingQuote.items.length === 0) {
                    socket.emit('quote_error', {
                        ok: false,
                        chatId: target.scopedChatId || target.targetChatId,
                        baseChatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId || null,
                        error: 'La cotizacion no tiene items validos para enviar.'
                    });
                    return;
                }

                const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                const actorUserId = resolveActorUserId(authContext);
                const quoteBody = buildQuoteMessageBody(incomingQuote, payload?.body || payload?.message || '');
                const quotedMessageId = toText(payload?.quotedMessageId || payload?.quoted || '');

                const createdQuote = await resolvedQuotesService.createQuoteRecord(tenantId, {
                    quoteId: incomingQuote.quoteId || undefined,
                    chatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId || '',
                    messageId: null,
                    status: 'draft',
                    currency: incomingQuote.currency,
                    itemsJson: incomingQuote.items,
                    summaryJson: incomingQuote.summary,
                    notes: incomingQuote.notes,
                    createdByUserId: actorUserId,
                    updatedByUserId: actorUserId,
                    sentAt: null,
                    metadata: {
                        ...(incomingQuote.metadata || {}),
                        source: 'socket.send_structured_quote'
                    }
                });

                const effectiveQuoteId = toNullableText(createdQuote?.quoteId || incomingQuote.quoteId);
                const normalizedQuote = {
                    ...incomingQuote,
                    quoteId: effectiveQuoteId || incomingQuote.quoteId || null
                };

                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));

                let sentMessage = null;
                if (quotedMessageId) {
                    try {
                        sentMessage = await waClient.sendMessage(target.targetChatId, quoteBody, { quotedMessageId });
                    } catch (_) {
                        sentMessage = await waClient.replyToMessage(target.targetChatId, quotedMessageId, quoteBody);
                    }
                } else {
                    sentMessage = await waClient.sendMessage(target.targetChatId, quoteBody);
                }

                const sentMessageId = getSerializedMessageId(sentMessage);
                if (sentMessageId && agentMeta) {
                    rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                }

                const outgoingOrderPayload = buildOutgoingOrderPayload(normalizedQuote);

                await emitRealtimeOutgoingMessage({
                    sentMessage,
                    fallbackChatId: target.targetChatId,
                    fallbackBody: quoteBody,
                    quotedMessageId,
                    moduleContext,
                    agentMeta,
                    mediaPayload: null,
                    orderPayload: outgoingOrderPayload
                });

                const sentAt = new Date().toISOString();
                const sentQuote = effectiveQuoteId
                    ? await resolvedQuotesService.markQuoteSent(tenantId, {
                        quoteId: effectiveQuoteId,
                        messageId: sentMessageId || null,
                        updatedByUserId: actorUserId,
                        sentAt
                    })
                    : null;

                if (chatCommercialStatusService && target?.targetChatId) {
                    try {
                        const commercialResult = await chatCommercialStatusService.markQuoteSent(tenantId, {
                            chatId: target.targetChatId,
                            scopeModuleId: String(target.scopeModuleId || '').trim().toLowerCase(),
                            source: 'socket',
                            reason: 'send_structured_quote_success',
                            changedByUserId: actorUserId,
                            at: sentAt,
                            metadata: {
                                quoteId: effectiveQuoteId || null,
                                messageId: sentMessageId || null
                            }
                        });
                        if (commercialResult?.changed) {
                            emitCommercialStatusUpdated?.({
                                tenantId,
                                chatId: target.targetChatId,
                                scopeModuleId: String(target.scopeModuleId || '').trim().toLowerCase(),
                                result: commercialResult,
                                source: 'quote_delivery.send_structured_quote'
                            });
                        }
                    } catch (_) {
                        // silent: quote delivery should not fail by commercial status lifecycle issues
                    }
                }

                await recordConversationEvent({
                    chatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId,
                    eventType: 'chat.message.outgoing.quote',
                    eventSource: 'socket',
                    payload: {
                        quoteId: effectiveQuoteId,
                        messageId: sentMessageId || null,
                        itemCount: normalizedQuote.summary?.itemCount || normalizedQuote.items.length,
                        totalPayable: normalizedQuote.summary?.totalPayable ?? null,
                        currency: normalizedQuote.currency
                    }
                });

                socket.emit('quote_sent', {
                    ok: true,
                    to: target.scopedChatId || target.targetChatId,
                    chatId: target.scopedChatId || target.targetChatId,
                    baseChatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId || null,
                    quoteId: effectiveQuoteId,
                    messageId: sentMessageId || null,
                    status: toText(sentQuote?.status || 'sent') || 'sent',
                    currency: normalizedQuote.currency,
                    items: normalizedQuote.items,
                    summary: normalizedQuote.summary,
                    notes: normalizedQuote.notes
                });
            } catch (error) {
                const detail = String(error?.message || error || 'No se pudo enviar la cotizacion.');
                console.warn('[WA][SendStructuredQuote] ' + detail);
                socket.emit('quote_error', {
                    ok: false,
                    error: detail
                });
            }
        });
    };

    return {
        registerQuoteDeliveryHandlers
    };
}

module.exports = {
    createSocketQuoteDeliveryService
};
