const { randomUUID } = require('node:crypto');
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

function formatSoles(value) {
    return 'S/ ' + roundMoney(value).toFixed(1);
}

function roundMoney(value) {
    const num = toFiniteNumberOrNull(value) ?? 0;
    return Math.floor(num * 10) / 10;
}

function formatCompactSoles(value) {
    return `S/ ${roundMoney(value).toFixed(1)}`;
}

function toTitleCase(value = '') {
    return toText(value)
        .toLocaleLowerCase('es-PE')
        .replace(/(^|\s)(\S)/g, (_, space, letter) => `${space}${letter.toLocaleUpperCase('es-PE')}`);
}

function toPositiveIntOrNull(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const int = Math.trunc(num);
    return int > 0 ? int : null;
}

function buildQuoteHeader(quote = {}, sourceType = 'quote') {
    if (sourceType === 'order') return '🛒 *RESUMEN DE PEDIDO*';
    const quoteNumber = toPositiveIntOrNull(quote?.quoteNumber ?? quote?.quote_number);
    const revisionNumber = toPositiveIntOrNull(quote?.revisionNumber ?? quote?.revision_number);
    if (!quoteNumber) return '📋 *COTIZACIÓN*';
    const revisionLabel = revisionNumber && revisionNumber > 1 ? ` (Rev. ${revisionNumber})` : '';
    return `📋 *COTIZACIÓN ${quoteNumber}${revisionLabel}*`;
}

function resolveQuoteDisplayUnitPrice(item = {}, qty = 1) {
    const safeQty = Math.max(1, toFiniteNumberOrNull(qty) ?? 1);
    const lineSubtotal = toFiniteNumberOrNull(item?.subtotal ?? item?.lineSubtotal);
    if (lineSubtotal !== null && lineSubtotal > 0) {
        return roundMoney(lineSubtotal / safeQty);
    }
    return roundMoney(
        toFiniteNumberOrNull(
            item?.finalPrice
            ?? item?.unitPrice
            ?? item?.price
            ?? item?.regularPrice
            ?? item?.regular_price
            ?? item?.metadata?.regularPrice
            ?? item?.metadata?.regular_price
        ) ?? 0
    );
}

function calcQuoteItem(item = {}) {
    const source = isPlainObject(item) ? item : {};
    const quantity = Math.max(1, Math.trunc(toFiniteNumberOrNull(source.qty ?? source.quantity) ?? 1) || 1);
    const unitSource = toFiniteNumberOrNull(source.unitPrice ?? source.price) ?? 0;
    const regularSource = toFiniteNumberOrNull(source.regularPrice ?? source.regular_price) ?? unitSource;
    const unitPrice = roundMoney(unitSource);
    const regularPrice = roundMoney(regularSource || unitSource);
    const linDiscountPct = Math.min(100, Math.max(0, toFiniteNumberOrNull(
        source.linDiscountPct
        ?? source.lineDiscountPct
        ?? (source.lineDiscountType === 'percent' || source.lineDiscountEnabled ? source.lineDiscountValue : 0)
    ) ?? 0));
    const linDiscountAmt = roundMoney(unitPrice * linDiscountPct / 100);
    const finalPrice = roundMoney(Math.max(0, unitPrice - linDiscountAmt));
    const subtotal = roundMoney(finalPrice * quantity);

    return {
        quantity,
        unitPrice,
        regularPrice,
        linDiscountPct,
        linDiscountAmt,
        finalPrice,
        subtotal,
        excludeFromGlobal: source.excludeFromGlobal === true
    };
}

function calcQuoteTotals(items = [], globalDiscPct = 0, globalOnRegular = false, delivery = 0) {
    const normalizedItems = (Array.isArray(items) ? items : []).map(calcQuoteItem);
    const participants = normalizedItems.filter((item) => !item.excludeFromGlobal);
    const excluded = normalizedItems.filter((item) => item.excludeFromGlobal);
    const safeGlobalPct = Math.min(100, Math.max(0, toFiniteNumberOrNull(globalDiscPct) ?? 0));
    const baseGlobal = roundMoney(participants.reduce((sum, item) => {
        const base = globalOnRegular
            ? roundMoney((item.regularPrice || item.unitPrice) * item.quantity)
            : item.subtotal;
        return sum + base;
    }, 0));
    const globalDiscAmt = roundMoney(baseGlobal * safeGlobalPct / 100);
    const subtotalParticipants = roundMoney(participants.reduce((sum, item) => sum + item.subtotal, 0));
    const subtotalExcluded = roundMoney(excluded.reduce((sum, item) => sum + item.subtotal, 0));
    const subtotal = roundMoney(subtotalParticipants + subtotalExcluded);
    const deliveryAmt = roundMoney(delivery);
    const totalPayable = roundMoney(Math.max(0, subtotal - globalDiscAmt + deliveryAmt));

    return {
        subtotalParticipants,
        subtotalExcluded,
        subtotal,
        globalDiscPct: safeGlobalPct,
        globalDiscAmt,
        globalOnRegular: Boolean(globalOnRegular),
        deliveryAmt,
        totalPayable
    };
}

function normalizeQuoteItem(item = {}, index = 0, currency = 'PEN') {
    const source = isPlainObject(item) ? item : {};
    const itemId = toNullableText(source.itemId || source.id || source.productId || ('item_' + (index + 1)));
    const productId = toNullableText(source.productId || source.id || source.itemId);
    const calced = calcQuoteItem(source);
    const quantity = calced.quantity;
    const lineDiscountAmount = roundMoney(calced.linDiscountAmt * quantity);

    return {
        itemId,
        productId,
        sku: toNullableText(source.sku),
        productName: toText(source.productName || source.title || source.name || 'Producto'),
        title: toText(source.title || source.name || source.productName || 'Producto'),
        unit: toText(source.unit || 'unidad') || 'unidad',
        qty: quantity,
        quantity,
        unitPrice: calced.unitPrice,
        regularPrice: calced.regularPrice,
        linDiscountPct: calced.linDiscountPct,
        linDiscountAmt: calced.linDiscountAmt,
        finalPrice: calced.finalPrice,
        subtotal: calced.subtotal,
        excludeFromGlobal: calced.excludeFromGlobal,
        lineSubtotal: calced.subtotal,
        lineDiscountType: calced.linDiscountPct > 0 ? 'percent' : null,
        lineDiscountValue: calced.linDiscountPct,
        lineDiscountAmount,
        lineTotal: calced.subtotal,
        currency: toText(source.currency || currency || 'PEN') || 'PEN',
        metadata: isPlainObject(source.metadata) ? source.metadata : {}
    };
}

function normalizeQuoteSummary(summary = {}, items = [], currency = 'PEN') {
    const source = isPlainObject(summary) ? summary : {};
    const itemCount = Number.isInteger(Number(source.itemCount))
        ? Number(source.itemCount)
        : items.length;
    const globalDiscount = isPlainObject(source.globalDiscount) ? source.globalDiscount : {};
    const globalDiscPct = toFiniteNumberOrNull(source.globalDiscPct ?? globalDiscount.value) ?? 0;
    const deliveryType = toText(source.deliveryType || source.delivery_type || (source.deliveryFree ? 'gratuito' : 'amount')).toLowerCase();
    const deliveryAmount = toFiniteNumberOrNull(source.deliveryAmt ?? source.deliveryAmount) ?? 0;
    const deliveryAmt = deliveryType === 'amount' ? deliveryAmount : 0;
    const totals = calcQuoteTotals(
        items,
        globalDiscPct,
        Boolean(source.globalOnRegular ?? globalDiscount.onRegular),
        deliveryAmt
    );
    const subtotal = totals.subtotal;
    const globalDiscAmt = toFiniteNumberOrNull(source.globalDiscAmt ?? globalDiscount.applied) ?? totals.globalDiscAmt;
    const totalAfterDiscount = roundMoney(Math.max(0, subtotal - globalDiscAmt));
    const totalPayable = toFiniteNumberOrNull(source.totalPayable) ?? roundMoney(totalAfterDiscount + totals.deliveryAmt);
    const deliveryFree = deliveryType !== 'amount' || totals.deliveryAmt <= 0;

    return {
        itemCount,
        subtotal,
        globalDiscPct: totals.globalDiscPct,
        globalDiscAmt: roundMoney(globalDiscAmt),
        globalOnRegular: totals.globalOnRegular,
        deliveryType: deliveryFree ? 'gratuito' : 'amount',
        deliveryAmt: totals.deliveryAmt,
        totalPayable: roundMoney(totalPayable),
        discount: roundMoney(globalDiscAmt),
        totalAfterDiscount,
        deliveryAmount: totals.deliveryAmt,
        deliveryFree,
        globalDiscount: {
            enabled: totals.globalDiscPct > 0,
            type: totals.globalDiscPct > 0 ? 'percent' : 'none',
            value: totals.globalDiscPct,
            applied: roundMoney(globalDiscAmt),
            onRegular: totals.globalOnRegular
        },
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

function resolveQuoteSourceType(metadata = {}, payload = {}) {
    const rawType = toText(metadata?.sourceType || metadata?.source_type || metadata?.source || payload?.sourceType || payload?.source_type).toLowerCase();
    if (rawType.includes('quote')) return 'quote';
    if (rawType.includes('order')) return 'order';

    const sourceMessageId = toText(
        metadata?.sourceMessageId
        || metadata?.source_message_id
        || metadata?.orderMessageId
        || metadata?.order_message_id
        || metadata?.sourceOrder?.messageId
        || metadata?.sourceOrder?.message_id
        || payload?.sourceMessageId
        || payload?.source_message_id
        || payload?.orderMessageId
        || payload?.order_message_id
        || payload?.sourceOrder?.messageId
        || payload?.sourceOrder?.message_id
    );
    if (sourceMessageId) return 'order';

    return 'quote';
}

function resolveSourceOrder(metadata = {}, payload = {}) {
    const sourceType = resolveQuoteSourceType(metadata, payload);
    if (sourceType === 'quote') return null;

    const sourceOrder = isPlainObject(metadata?.sourceOrder)
        ? metadata.sourceOrder
        : (isPlainObject(payload?.sourceOrder) ? payload.sourceOrder : {});
    const orderId = toNullableText(
        sourceOrder?.orderId
        || sourceOrder?.order_id
        || metadata?.sourceOrderId
        || metadata?.source_order_id
        || metadata?.orderId
        || metadata?.order_id
        || payload?.sourceOrderId
        || payload?.source_order_id
        || payload?.orderId
        || payload?.order_id
    );
    const messageId = toNullableText(
        sourceOrder?.messageId
        || sourceOrder?.message_id
        || metadata?.sourceMessageId
        || metadata?.source_message_id
        || metadata?.orderMessageId
        || metadata?.order_message_id
        || payload?.sourceMessageId
        || payload?.source_message_id
        || payload?.orderMessageId
        || payload?.order_message_id
    );
    return (orderId || messageId) ? { orderId, messageId } : null;
}

function buildQuoteMessageBody(quote = {}, fallbackBody = '') {
    const sourceType = toText(quote?.metadata?.sourceType || quote?.metadata?.source_type).toLowerCase();
    const isOptionMode = quote?.isOptionMode === true || quote?.is_option_mode === true;
    const optionNumber = toPositiveIntOrNull(quote?.optionNumber ?? quote?.option_number);
    const header = isOptionMode
        ? `*OPCION ${optionNumber || 1}*`
        : buildQuoteHeader(quote, sourceType);
    const items = Array.isArray(quote?.items) ? quote.items : [];
    const summary = isPlainObject(quote?.summary) ? quote.summary : {};
    const lines = items.flatMap((item) => {
        const title = toTitleCase(item?.productName || item?.title || item?.name || item?.sku || 'Producto') || 'Producto';
        const qty = Math.max(1, toFiniteNumberOrNull(item?.qty ?? item?.quantity) ?? 1);
        const finalPrice = roundMoney(toFiniteNumberOrNull(item?.finalPrice) ?? resolveQuoteDisplayUnitPrice(item, qty));
        const lineSubtotal = roundMoney(toFiniteNumberOrNull(item?.subtotal ?? item?.lineTotal ?? item?.lineSubtotal) ?? (qty * finalPrice));
        const rows = [
            `*${title}*`,
            `${qty} x ${formatSoles(finalPrice)} = ${formatSoles(lineSubtotal)}`
        ];
        if (item?.sku) {
            rows.push(`SKU: ${toText(item.sku)}`);
        }
        if (Number(item?.linDiscountPct || item?.lineDiscountValue || 0) > 0) {
            rows.push(`Desc. linea: ${Number(item.linDiscountPct || item.lineDiscountValue || 0)}%`);
        }
        if (item?.excludeFromGlobal === true) {
            rows.push('No participa del descuento global');
        }
        return rows;
    });

    const subtotal = roundMoney(lines.length > 0
        ? items.reduce((acc, item) => {
            return acc + roundMoney(toFiniteNumberOrNull(item?.subtotal ?? item?.lineTotal ?? item?.lineSubtotal) ?? 0);
        }, 0)
        : (toFiniteNumberOrNull(summary?.subtotal) ?? 0));
    const discount = roundMoney(toFiniteNumberOrNull(summary?.globalDiscAmt ?? summary?.discount) ?? 0);
    const deliveryAmount = toFiniteNumberOrNull(summary?.deliveryAmt ?? summary?.deliveryAmount) ?? 0;
    const deliveryLabel = Boolean(summary?.deliveryFree) || summary?.deliveryType === 'gratuito' || deliveryAmount <= 0
        ? 'Gratuito'
        : formatSoles(deliveryAmount);
    const totalPayable = toFiniteNumberOrNull(summary?.totalPayable)
        ?? Math.max(0, subtotal - discount + (Boolean(summary?.deliveryFree) ? 0 : deliveryAmount));

    const separator = '---------------------------------------------';
    const totalLines = [
        separator,
        `Subtotal:         ${formatSoles(subtotal)}`
    ];
    if (discount > 0) {
        totalLines.push(`Ahorro global:    - ${formatSoles(discount)}`);
    }
    totalLines.push(`Delivery:         ${deliveryLabel}`);
    totalLines.push(separator);
    totalLines.push(`*TOTAL A PAGAR:   ${formatSoles(totalPayable)}*`);
    if (!isOptionMode) {
        totalLines.push('');
        totalLines.push(separator);
        totalLines.push('_Lavitat(R) - La confianza que abraza tu hogar_');
    }
    const notesLine = quote?.notes ? ['', toText(quote.notes)] : [];
    const fallbackLine = !items.length && toText(fallbackBody) ? ['', toText(fallbackBody)] : [];

    return [
        header,
        separator,
        '',
        ...lines,
        '',
        ...totalLines,
        ...notesLine,
        ...fallbackLine
    ].join('\n').trim();
}

function buildQuoteInteractiveMessage(quoteId, body) {
    const confirmTitle = '✓ Confirmar';
    const changeTitle = '✎ Cambios';
    if (confirmTitle.length > 20 || changeTitle.length > 20) {
        throw new Error('Los titulos de botones de cotizacion exceden 20 caracteres.');
    }

    const safeQuoteId = toText(quoteId);
    return {
        type: 'button',
        body: {
            text: String(body || '').trim()
        },
        action: {
            buttons: [
                {
                    type: 'reply',
                    reply: {
                        id: `quote_confirm_${safeQuoteId}`,
                        title: confirmTitle
                    }
                },
                {
                    type: 'reply',
                    reply: {
                        id: `quote_change_${safeQuoteId}`,
                        title: changeTitle
                    }
                }
            ]
        }
    };
}

function buildSyntheticInteractiveSentMessage({
    messageId,
    chatId,
    body,
    interactive,
    quotedMessageId = '',
    metadata = null
} = {}) {
    const safeMessageId = toText(messageId);
    if (!safeMessageId) return null;
    const safeChatId = toText(chatId);
    return {
        id: {
            _serialized: safeMessageId,
            id: safeMessageId
        },
        chatId: safeChatId,
        to: safeChatId,
        body: String(body || ''),
        fromMe: true,
        type: 'interactive',
        ack: 1,
        quotedMessageId: toNullableText(quotedMessageId),
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        rawData: {
            interactive,
            metadata: metadata && typeof metadata === 'object' ? metadata : null
        },
        _data: {
            interactive,
            metadata: metadata && typeof metadata === 'object' ? metadata : null
        }
    };
}

function buildSourceOrderQuotedMessage(sourceOrder = {}) {
    const messageId = toNullableText(sourceOrder?.messageId || sourceOrder?.message_id);
    if (!messageId) return null;
    return {
        id: messageId,
        body: '🛒 Pedido del cliente',
        fromMe: false,
        hasMedia: false,
        type: 'order'
    };
}

function buildOutgoingOrderPayload(quote = {}) {
    const items = Array.isArray(quote?.items) ? quote.items : [];
    const summary = isPlainObject(quote?.summary) ? quote.summary : {};
    const currency = toText(quote?.currency || summary?.currency || 'PEN') || 'PEN';
    const quoteId = toNullableText(quote?.quoteId);
    const quoteNumber = toPositiveIntOrNull(quote?.quoteNumber ?? quote?.quote_number);
    const revisionNumber = toPositiveIntOrNull(quote?.revisionNumber ?? quote?.revision_number);
    const parentQuoteId = toNullableText(quote?.parentQuoteId ?? quote?.parent_quote_id);
    const isOptionMode = quote?.isOptionMode === true || quote?.is_option_mode === true;
    const optionNumber = toPositiveIntOrNull(quote?.optionNumber ?? quote?.option_number);
    const optionGroupId = toNullableText(quote?.optionGroupId ?? quote?.option_group_id);
    const metadata = isPlainObject(quote?.metadata) ? quote.metadata : {};
    const sourceType = toText(metadata?.sourceType || metadata?.source_type || quote?.sourceType || 'quote').toLowerCase() || 'quote';
    const quoteSummary = {
        itemCount: Number.isInteger(Number(summary?.itemCount)) ? Number(summary.itemCount) : items.length,
        subtotal: toFiniteNumberOrNull(summary?.subtotal),
        globalDiscPct: toFiniteNumberOrNull(summary?.globalDiscPct) ?? toFiniteNumberOrNull(summary?.globalDiscount?.value) ?? 0,
        globalDiscAmt: toFiniteNumberOrNull(summary?.globalDiscAmt) ?? toFiniteNumberOrNull(summary?.globalDiscount?.applied) ?? 0,
        globalOnRegular: Boolean(summary?.globalOnRegular ?? summary?.globalDiscount?.onRegular),
        deliveryType: toText(summary?.deliveryType || (summary?.deliveryFree ? 'gratuito' : 'amount')) || 'gratuito',
        deliveryAmt: toFiniteNumberOrNull(summary?.deliveryAmt ?? summary?.deliveryAmount) ?? 0,
        discount: toFiniteNumberOrNull(summary?.discount ?? summary?.globalDiscAmt),
        totalAfterDiscount: toFiniteNumberOrNull(summary?.totalAfterDiscount),
        deliveryAmount: toFiniteNumberOrNull(summary?.deliveryAmount ?? summary?.deliveryAmt),
        deliveryFree: Boolean(summary?.deliveryFree),
        totalPayable: toFiniteNumberOrNull(summary?.totalPayable),
        globalDiscount: summary?.globalDiscount && typeof summary.globalDiscount === 'object'
            ? {
                type: String(summary.globalDiscount.type || 'none').trim().toLowerCase() || 'none',
                value: toFiniteNumberOrNull(summary.globalDiscount.value) ?? 0,
                applied: toFiniteNumberOrNull(summary.globalDiscount.applied) ?? 0,
                onRegular: Boolean(summary.globalDiscount.onRegular)
            }
            : { type: 'none', value: 0, applied: 0 },
        currency
    };

    return {
        type: 'quote',
        sourceType,
        quoteId,
        quoteNumber,
        revisionNumber,
        parentQuoteId,
        isOptionMode,
        optionNumber,
        optionGroupId,
        quote_number: quoteNumber,
        revision_number: revisionNumber,
        parent_quote_id: parentQuoteId,
        is_option_mode: isOptionMode,
        option_number: optionNumber,
        option_group_id: optionGroupId,
        currency,
        subtotal: toFiniteNumberOrNull(summary?.subtotal),
        products: items,
        rawPreview: {
            type: 'quote',
            sourceType,
            quoteId,
            quoteNumber,
            revisionNumber,
            parentQuoteId,
            isOptionMode,
            optionNumber,
            optionGroupId,
            quote_number: quoteNumber,
            revision_number: revisionNumber,
            parent_quote_id: parentQuoteId,
            is_option_mode: isOptionMode,
            option_number: optionNumber,
            option_group_id: optionGroupId,
            products: items,
            itemCount: quoteSummary.itemCount,
            currency,
            quoteSummary
        },
        notes: toNullableText(quote?.notes),
        metadata
    };
}

function resolveActorUserId(authContext = null) {
    const user = isPlainObject(authContext?.user) ? authContext.user : {};
    return toNullableText(user.userId || user.id || authContext?.userId || '');
}

function normalizeOptionQuote(option = {}) {
    const source = isPlainObject(option) ? option : {};
    const items = Array.isArray(source.items) ? source.items.map((item, index) => normalizeQuoteItem(item, index, source.currency || 'PEN')) : [];
    const summary = normalizeQuoteSummary(source.summary, items, source.currency || 'PEN');
    return {
        optionNumber: toPositiveIntOrNull(source.optionNumber ?? source.option_number),
        currency: toText(source.currency || summary.currency || 'PEN') || 'PEN',
        items,
        summary,
        notes: toNullableText(source.notes),
        metadata: isPlainObject(source.metadata) ? source.metadata : {}
    };
}

function buildOptionSelectionInteractiveMessage(body, options = []) {
    const buttons = options
        .slice(0, 3)
        .map((option, index) => {
            const optionNumber = toPositiveIntOrNull(option?.optionNumber ?? option?.option_number) || (index + 1);
            const totalPayable = toFiniteNumberOrNull(option?.summary?.totalPayable) ?? 0;
            const title = `Opción ${optionNumber} — ${formatCompactSoles(totalPayable)}`;
            if (title.length > 20) {
                throw new Error('Los titulos de botones de opciones exceden 20 caracteres.');
            }
            return {
                type: 'reply',
                reply: {
                    id: `option_${optionNumber}`,
                    title
                }
            };
        });
    if (buttons.length === 0) {
        throw new Error('No hay botones de opcion para construir el interactivo.');
    }
    return {
        type: 'button',
        body: {
            text: String(body || '').trim()
        },
        action: {
            buttons
        }
    };
}

function sleep(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        checkOutboundConsent,
        resolveScopedSendTarget,
        emitRealtimeOutgoingMessage,
        emitToRuntimeContext,
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

                if (typeof checkOutboundConsent === 'function') {
                    const consentResult = await checkOutboundConsent(tenantId, {
                        phone: target.targetPhone || target.targetChatId,
                        messageType: 'template'
                    });
                    if (!consentResult?.allowed) {
                        socket.emit('quote_error', {
                            ok: false,
                            chatId: target.scopedChatId || target.targetChatId,
                            baseChatId: target.targetChatId,
                            scopeModuleId: target.scopeModuleId || null,
                            error: 'El cliente no tiene consentimiento de marketing para recibir cotizaciones.',
                            reason: consentResult?.reason || 'marketing_consent_required',
                            consentStatus: consentResult?.status || 'unknown'
                        });
                        return;
                    }
                }

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
                const quoteSourceType = resolveQuoteSourceType(incomingQuote.metadata, payload);
                const sourceOrder = resolveSourceOrder(incomingQuote.metadata, payload);
                const sourceQuote = isPlainObject(incomingQuote.metadata?.sourceQuote)
                    ? incomingQuote.metadata.sourceQuote
                    : (isPlainObject(payload?.sourceQuote) ? payload.sourceQuote : null);
                const quoteSendMode = toText(
                    incomingQuote.metadata?.quoteSendMode
                    || incomingQuote.metadata?.quote_send_mode
                    || payload?.quoteSendMode
                    || payload?.quote_send_mode
                    || 'new'
                ).toLowerCase();
                const parentQuoteId = quoteSendMode === 'revision'
                    ? toNullableText(sourceQuote?.quoteId || sourceQuote?.quote_id || incomingQuote.metadata?.parentQuoteId || payload?.parentQuoteId)
                    : null;
                const quoteMetadata = {
                    ...(incomingQuote.metadata || {}),
                    source: 'socket.send_structured_quote',
                    sourceType: sourceOrder ? 'order' : quoteSourceType,
                    quoteSendMode,
                    ...(sourceQuote ? { sourceQuote } : {}),
                    ...(parentQuoteId ? { parentQuoteId } : {}),
                    ...(sourceOrder ? { sourceOrder } : {})
                };
                const sourceOrderQuotedMessageId = toText(sourceOrder?.messageId || sourceOrder?.message_id || '');
                const quotedMessageId = toText(payload?.quotedMessageId || payload?.quoted || sourceOrderQuotedMessageId || '');
                const quotedMessage = quotedMessageId && quotedMessageId === sourceOrderQuotedMessageId
                    ? buildSourceOrderQuotedMessage(sourceOrder)
                    : null;

                const createdQuote = await resolvedQuotesService.createQuoteRecord(tenantId, {
                    quoteId: parentQuoteId ? undefined : (incomingQuote.quoteId || undefined),
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
                    parentQuoteId,
                    metadata: quoteMetadata
                });

                const effectiveQuoteId = toNullableText(createdQuote?.quoteId || incomingQuote.quoteId);
                const normalizedQuote = {
                    ...incomingQuote,
                    quoteId: effectiveQuoteId || incomingQuote.quoteId || null,
                    quoteNumber: createdQuote?.quoteNumber || null,
                    revisionNumber: createdQuote?.revisionNumber || null,
                    parentQuoteId: createdQuote?.parentQuoteId || null,
                    metadata: quoteMetadata
                };
                const quoteBody = buildQuoteMessageBody(normalizedQuote, payload?.body || payload?.message || '');

                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                const baseSendMetadata = {
                    tenantId,
                    chatId: target.targetChatId,
                    sendIdempotencyFingerprint: `quote:${effectiveQuoteId || normalizedQuote.quoteNumber || quoteBody.slice(0, 50)}`
                };

                let sentMessage = null;
                const quoteInteractive = buildQuoteInteractiveMessage(normalizedQuote.quoteId, quoteBody);
                if (typeof waClient?.sendInteractiveMessage === 'function') {
                    const interactiveSendOptions = {
                        quotedMessageId,
                        metadata: {
                            ...baseSendMetadata
                        }
                    };
                    const interactiveMessageId = await waClient.sendInteractiveMessage(target.targetChatId, quoteInteractive, interactiveSendOptions);
                    if (interactiveMessageId) {
                        sentMessage = buildSyntheticInteractiveSentMessage({
                            messageId: interactiveMessageId,
                            chatId: target.targetChatId,
                            body: quoteBody,
                            interactive: quoteInteractive,
                            quotedMessageId,
                            metadata: interactiveSendOptions.metadata
                        });
                    }
                }

                if (!sentMessage) {
                    if (quotedMessageId) {
                        try {
                            sentMessage = await waClient.sendMessage(target.targetChatId, quoteBody, {
                                quotedMessageId,
                                metadata: {
                                    ...baseSendMetadata
                                }
                            });
                        } catch (_) {
                            sentMessage = await waClient.replyToMessage(target.targetChatId, quotedMessageId, quoteBody);
                        }
                    } else {
                        sentMessage = await waClient.sendMessage(target.targetChatId, quoteBody, {
                            metadata: {
                                ...baseSendMetadata
                            }
                        });
                    }
                }
                if (!sentMessage) return;

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
                    quotedMessage,
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
                        quoteNumber: normalizedQuote.quoteNumber || null,
                        revisionNumber: normalizedQuote.revisionNumber || null,
                        parentQuoteId: normalizedQuote.parentQuoteId || null,
                        messageId: sentMessageId || null,
                        itemCount: normalizedQuote.summary?.itemCount || normalizedQuote.items.length,
                        totalPayable: normalizedQuote.summary?.totalPayable ?? null,
                        currency: normalizedQuote.currency
                    }
                });

                const quoteSentPayload = {
                    ok: true,
                    to: target.scopedChatId || target.targetChatId,
                    chatId: target.scopedChatId || target.targetChatId,
                    baseChatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId || null,
                    quoteId: effectiveQuoteId,
                    quoteNumber: normalizedQuote.quoteNumber || null,
                    revisionNumber: normalizedQuote.revisionNumber || null,
                    parentQuoteId: normalizedQuote.parentQuoteId || null,
                    quote_number: normalizedQuote.quoteNumber || null,
                    revision_number: normalizedQuote.revisionNumber || null,
                    parent_quote_id: normalizedQuote.parentQuoteId || null,
                    messageId: sentMessageId || null,
                    status: toText(sentQuote?.status || 'sent') || 'sent',
                    currency: normalizedQuote.currency,
                    items: normalizedQuote.items,
                    summary: normalizedQuote.summary,
                    notes: normalizedQuote.notes
                };
                socket.emit('quote_sent', quoteSentPayload);
                if (typeof emitToRuntimeContext === 'function') {
                    emitToRuntimeContext('quote_sent', quoteSentPayload);
                }
            } catch (error) {
                const detail = String(error?.message || error || 'No se pudo enviar la cotizacion.');
                console.warn('[WA][SendStructuredQuote] ' + detail);
                socket.emit('quote_error', {
                    ok: false,
                    error: detail
                });
            }
        });

        socket.on('send_option_group', async (payload = {}, ack) => {
            if (typeof guardRateLimit === 'function' && !guardRateLimit(socket, 'send_option_group')) return;
            if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar opciones de cotizacion', errorEvent: 'quote_error' })) return;

            try {
                const target = await resolveScopedSendTarget({
                    rawChatId: payload?.chatId || payload?.to,
                    rawPhone: payload?.toPhone,
                    errorEvent: 'quote_error',
                    action: 'enviar opciones de cotizacion'
                });
                if (!target?.ok) {
                    ack?.({ ok: false, error: 'No se pudo resolver el chat destino.' });
                    return;
                }

                const options = Array.isArray(payload?.options)
                    ? payload.options.map(normalizeOptionQuote).filter((option) => Array.isArray(option.items) && option.items.length > 0)
                    : [];
                if (options.length === 0) {
                    const errorMessage = 'Debes enviar al menos una opcion valida.';
                    socket.emit('quote_error', { ok: false, error: errorMessage });
                    ack?.({ ok: false, error: errorMessage });
                    return;
                }

                if (typeof checkOutboundConsent === 'function') {
                    const consentResult = await checkOutboundConsent(tenantId, {
                        phone: target.targetPhone || target.targetChatId,
                        messageType: 'template'
                    });
                    if (!consentResult?.allowed) {
                        const errorMessage = 'El cliente no tiene consentimiento de marketing para recibir cotizaciones.';
                        socket.emit('quote_error', {
                            ok: false,
                            chatId: target.scopedChatId || target.targetChatId,
                            baseChatId: target.targetChatId,
                            scopeModuleId: target.scopeModuleId || null,
                            error: errorMessage,
                            reason: consentResult?.reason || 'marketing_consent_required',
                            consentStatus: consentResult?.status || 'unknown'
                        });
                        ack?.({ ok: false, error: errorMessage });
                        return;
                    }
                }

                const groupId = randomUUID();
                const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                const actorUserId = resolveActorUserId(authContext);
                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                const baseSendMetadata = {
                    tenantId,
                    chatId: target.targetChatId
                };
                const finalMessage = toText(payload?.finalMessage || '');

                for (let index = 0; index < options.length; index += 1) {
                    const option = options[index];
                    const optionMetadata = {
                        ...(option.metadata || {}),
                        source: 'socket.send_option_group',
                        sourceType: 'quote',
                        isOptionMode: true,
                        optionNumber: option.optionNumber,
                        optionGroupId: groupId
                    };
                    const createdQuote = await resolvedQuotesService.createQuoteRecord(tenantId, {
                        chatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId || '',
                        messageId: null,
                        status: 'draft',
                        currency: option.currency,
                        itemsJson: option.items,
                        summaryJson: option.summary,
                        notes: option.notes,
                        createdByUserId: actorUserId,
                        updatedByUserId: actorUserId,
                        sentAt: null,
                        isOptionMode: true,
                        optionNumber: option.optionNumber || (index + 1),
                        optionGroupId: groupId,
                        metadata: optionMetadata
                    });

                    const normalizedQuote = {
                        quoteId: createdQuote?.quoteId || null,
                        quoteNumber: createdQuote?.quoteNumber || null,
                        revisionNumber: createdQuote?.revisionNumber || null,
                        parentQuoteId: createdQuote?.parentQuoteId || null,
                        isOptionMode: true,
                        optionNumber: createdQuote?.optionNumber || option.optionNumber || (index + 1),
                        optionGroupId: createdQuote?.optionGroupId || groupId,
                        currency: option.currency,
                        items: option.items,
                        summary: option.summary,
                        notes: option.notes,
                        metadata: optionMetadata
                    };

                    const textBody = buildQuoteMessageBody(normalizedQuote, '');
                    const sentMessage = await waClient.sendMessage(target.targetChatId, textBody, {
                        metadata: {
                            ...baseSendMetadata,
                            sendIdempotencyFingerprint: `quote-option:${normalizedQuote.quoteId || normalizedQuote.optionGroupId || normalizedQuote.optionNumber || index + 1}`
                        }
                    });
                    if (!sentMessage) continue;
                    const sentMessageId = getSerializedMessageId(sentMessage);
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }

                    const outgoingOrderPayload = buildOutgoingOrderPayload(normalizedQuote);
                    await emitRealtimeOutgoingMessage({
                        sentMessage,
                        fallbackChatId: target.targetChatId,
                        fallbackBody: textBody,
                        quotedMessageId: '',
                        quotedMessage: null,
                        moduleContext,
                        agentMeta,
                        mediaPayload: null,
                        orderPayload: outgoingOrderPayload
                    });

                    const sentAt = new Date().toISOString();
                    const sentQuote = await resolvedQuotesService.markQuoteSent(tenantId, {
                        quoteId: normalizedQuote.quoteId,
                        messageId: sentMessageId || null,
                        updatedByUserId: actorUserId,
                        sentAt
                    });

                    await recordConversationEvent({
                        chatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId,
                        eventType: 'chat.message.outgoing.quote',
                        eventSource: 'socket',
                        payload: {
                            quoteId: normalizedQuote.quoteId,
                            quoteNumber: normalizedQuote.quoteNumber || null,
                            optionNumber: normalizedQuote.optionNumber || null,
                            optionGroupId: normalizedQuote.optionGroupId || null,
                            messageId: sentMessageId || null,
                            itemCount: normalizedQuote.summary?.itemCount || normalizedQuote.items.length,
                            totalPayable: normalizedQuote.summary?.totalPayable ?? null,
                            currency: normalizedQuote.currency
                        }
                    });

                    const quoteSentPayload = {
                        ok: true,
                        to: target.scopedChatId || target.targetChatId,
                        chatId: target.scopedChatId || target.targetChatId,
                        baseChatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId || null,
                        quoteId: normalizedQuote.quoteId,
                        quoteNumber: normalizedQuote.quoteNumber || null,
                        revisionNumber: normalizedQuote.revisionNumber || null,
                        parentQuoteId: normalizedQuote.parentQuoteId || null,
                        isOptionMode: true,
                        optionNumber: normalizedQuote.optionNumber || null,
                        optionGroupId: normalizedQuote.optionGroupId || null,
                        quote_number: normalizedQuote.quoteNumber || null,
                        revision_number: normalizedQuote.revisionNumber || null,
                        parent_quote_id: normalizedQuote.parentQuoteId || null,
                        is_option_mode: true,
                        option_number: normalizedQuote.optionNumber || null,
                        option_group_id: normalizedQuote.optionGroupId || null,
                        messageId: sentMessageId || null,
                        status: toText(sentQuote?.status || 'sent') || 'sent',
                        currency: normalizedQuote.currency,
                        items: normalizedQuote.items,
                        summary: normalizedQuote.summary,
                        notes: normalizedQuote.notes
                    };
                    socket.emit('quote_sent', quoteSentPayload);
                    if (typeof emitToRuntimeContext === 'function') {
                        emitToRuntimeContext('quote_sent', quoteSentPayload);
                    }

                    if (index < options.length - 1) {
                        await sleep(1500);
                    }
                }

                if (chatCommercialStatusService && target?.targetChatId) {
                    try {
                        const commercialResult = await chatCommercialStatusService.markQuoteSent(tenantId, {
                            chatId: target.targetChatId,
                            scopeModuleId: String(target.scopeModuleId || '').trim().toLowerCase(),
                            source: 'socket',
                            reason: 'send_option_group_success',
                            changedByUserId: actorUserId,
                            at: new Date().toISOString(),
                            metadata: {
                                optionGroupId: groupId,
                                optionsCount: options.length
                            }
                        });
                        if (commercialResult?.changed) {
                            emitCommercialStatusUpdated?.({
                                tenantId,
                                chatId: target.targetChatId,
                                scopeModuleId: String(target.scopeModuleId || '').trim().toLowerCase(),
                                result: commercialResult,
                                source: 'quote_delivery.send_option_group'
                            });
                        }
                    } catch (_) {
                        // silent: option quote delivery should not fail by commercial status lifecycle issues
                    }
                }

                if (finalMessage) {
                    let finalSentMessage = null;
                    const finalInteractive = buildOptionSelectionInteractiveMessage(finalMessage, options);
                    if (typeof waClient?.sendInteractiveMessage === 'function') {
                        try {
                            const interactiveSendOptions = {
                                metadata: {
                                    ...baseSendMetadata,
                                    sendIdempotencyFingerprint: `quote-option-final:${groupId}`
                                }
                            };
                            const interactiveMessageId = await waClient.sendInteractiveMessage(target.targetChatId, finalInteractive, interactiveSendOptions);
                            if (interactiveMessageId) {
                                finalSentMessage = buildSyntheticInteractiveSentMessage({
                                    messageId: interactiveMessageId,
                                    chatId: target.targetChatId,
                                    body: finalMessage,
                                    interactive: finalInteractive,
                                    quotedMessageId: '',
                                    metadata: interactiveSendOptions.metadata
                                });
                            }
                        } catch (interactiveError) {
                            console.warn('[WA][SendOptionGroup] interactive final fallback: ' + String(interactiveError?.message || interactiveError || 'interactive_send_failed'));
                        }
                    }
                    if (!finalSentMessage) {
                        finalSentMessage = await waClient.sendMessage(target.targetChatId, finalMessage, {
                            metadata: {
                                ...baseSendMetadata,
                                sendIdempotencyFingerprint: `quote-option-final:${groupId}`
                            }
                        });
                    }
                    if (finalSentMessage) {
                        const finalMessageId = getSerializedMessageId(finalSentMessage);
                        if (finalMessageId && agentMeta) {
                            rememberOutgoingAgentMeta(finalMessageId, agentMeta);
                        }
                        await emitRealtimeOutgoingMessage({
                            sentMessage: finalSentMessage,
                            fallbackChatId: target.targetChatId,
                            fallbackBody: finalMessage,
                            quotedMessageId: '',
                            quotedMessage: null,
                            moduleContext,
                            agentMeta,
                            mediaPayload: null,
                            orderPayload: null
                        });
                    }
                }

                ack?.({ ok: true, groupId });
            } catch (error) {
                const detail = String(error?.message || error || 'No se pudieron enviar las opciones.');
                console.warn('[WA][SendOptionGroup] ' + detail);
                socket.emit('quote_error', {
                    ok: false,
                    error: detail
                });
                ack?.({ ok: false, error: detail });
            }
        });

        socket.on('list_chat_quotes', async (payload = {}) => {
            if (typeof guardRateLimit === 'function' && !guardRateLimit(socket, 'list_chat_quotes')) return;
            try {
                const target = await resolveScopedSendTarget({
                    rawChatId: payload?.chatId || payload?.to,
                    rawPhone: payload?.toPhone,
                    errorEvent: 'chat_quotes',
                    action: 'listar cotizaciones'
                });
                if (!target?.ok) return;
                const quotes = typeof resolvedQuotesService.listQuotesByChat === 'function'
                    ? await resolvedQuotesService.listQuotesByChat(tenantId, {
                        chatId: target.targetChatId
                    })
                    : [];
                socket.emit('chat_quotes', {
                    ok: true,
                    chatId: target.scopedChatId || target.targetChatId,
                    baseChatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId || null,
                    quotes
                });
            } catch (error) {
                socket.emit('chat_quotes', {
                    ok: false,
                    error: String(error?.message || error || 'No se pudieron cargar las cotizaciones.')
                });
            }
        });
    };

    return {
        registerQuoteDeliveryHandlers
    };
}

module.exports = {
    createSocketQuoteDeliveryService,
    buildQuoteMessageBody,
    buildQuoteInteractiveMessage,
    buildOutgoingOrderPayload,
    buildSyntheticInteractiveSentMessage
};
