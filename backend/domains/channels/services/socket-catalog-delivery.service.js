const { getStorageDriver, queryPostgres } = require('../../../config/persistence-runtime');

function toCleanText(value = '') {
    return String(value || '').trim();
}

function isMetaCatalogId(value = '') {
    return /^\d{6,}$/.test(toCleanText(value));
}

function getProductMetadata(product = {}) {
    return product?.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
        ? product.metadata
        : {};
}

function firstCleanText(...values) {
    for (const value of values) {
        const text = toCleanText(value);
        if (text) return text;
    }
    return '';
}

function uniqueCleanTexts(...values) {
    const seen = new Set();
    return values
        .flat()
        .map((value) => toCleanText(value))
        .filter((value) => {
            if (!value) return false;
            const key = value.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function parseCatalogMoney(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
    }
    const normalized = String(value || '').trim().replace(/[^\d.,-]/g, '').replace(',', '.');
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

async function resolveCatalogItemByCandidates(tenantId = 'default', productSkuCandidates = []) {
    const safeTenantId = toCleanText(tenantId) || 'default';
    const candidates = uniqueCleanTexts(productSkuCandidates).flatMap((value) => uniqueCleanTexts(value, value.toUpperCase()));
    if (!candidates.length || getStorageDriver() !== 'postgres') return null;
    try {
        const result = await queryPostgres(
            `SELECT item_id, title, price, image_url,
                    metadata->>'regular_price' as regular_price,
                    metadata->>'sale_price' as sale_price
               FROM catalog_items
              WHERE tenant_id = $1
                AND item_id = ANY($2::text[])
              ORDER BY array_position($2::text[], item_id)
              LIMIT 1`,
            [safeTenantId, candidates]
        );
        const row = result?.rows?.[0] || null;
        if (!row) return null;
        const regularPrice = parseCatalogMoney(row.regular_price);
        const salePrice = parseCatalogMoney(row.sale_price);
        const price = parseCatalogMoney(row.price);
        const itemId = toCleanText(row.item_id);
        return {
            itemId,
            sku: itemId,
            name: toCleanText(row.title),
            title: toCleanText(row.title),
            price,
            salePrice,
            regularPrice: regularPrice ?? price,
            discountPct: regularPrice > 0 && salePrice > 0 && regularPrice - salePrice > 0.01
                ? Math.round(((regularPrice - salePrice) / regularPrice) * 1000) / 10
                : null,
            imageUrl: toCleanText(row.image_url)
        };
    } catch (error) {
        console.warn('[WA][CatalogNative][catalogItem] No se pudo resolver producto por SKU. ' + String(error?.message || error));
        return null;
    }
}

async function resolveCatalogItemBySku(tenantId = 'default', productSku = '') {
    return resolveCatalogItemByCandidates(tenantId, [productSku]);
}

function buildNativeProductOrderPayload(product = {}, catalogId = '', productRetailerId = '', catalogItem = null) {
    const metadata = getProductMetadata(product);
    const title = firstCleanText(
        catalogItem?.name,
        product?.title,
        product?.name,
        product?.productName,
        metadata.title,
        metadata.name,
        productRetailerId ? `SKU ${productRetailerId}` : 'Producto del catalogo Meta'
    );
    const price = parseCatalogMoney(
        catalogItem?.price
        ?? catalogItem?.salePrice
        ?? product?.price
        ?? product?.salePrice
        ?? product?.finalPrice
        ?? product?.regularPrice
        ?? metadata.price
        ?? metadata.salePrice
        ?? metadata.finalPrice
    );
    const regularPrice = parseCatalogMoney(
        catalogItem?.regularPrice
        ?? product?.regularPrice
        ?? product?.regular_price
        ?? metadata.regularPrice
        ?? metadata.regular_price
        ?? price
    );
    const salePrice = parseCatalogMoney(
        catalogItem?.salePrice
        ?? product?.salePrice
        ?? product?.sale_price
        ?? metadata.salePrice
        ?? metadata.sale_price
        ?? price
    );
    const discountPct = parseCatalogMoney(
        catalogItem?.discountPct
        ?? product?.discountPct
        ?? product?.discount_pct
        ?? metadata.discountPct
        ?? metadata.discount_pct
    );
    const imageUrl = firstCleanText(
        catalogItem?.imageUrl,
        product?.imageUrl,
        product?.image_url,
        product?.image,
        product?.thumbnailUrl,
        product?.thumbnail_url,
        metadata.imageUrl,
        metadata.image_url,
        metadata.image,
        metadata.thumbnailUrl,
        metadata.thumbnail_url
    );
    const productLine = {
        name: title,
        title,
        quantity: 1,
        sku: productRetailerId || null,
        productRetailerId: productRetailerId || null,
        catalogId: catalogId || null,
        imageUrl: imageUrl || null,
        price,
        salePrice,
        regularPrice,
        discountPct,
        lineTotal: price,
        currency: 'PEN'
    };

    return {
        type: 'product',
        sourceType: 'native_catalog_product',
        title,
        sku: productRetailerId || null,
        productRetailerId: productRetailerId || null,
        catalogId: catalogId || null,
        imageUrl: imageUrl || null,
        currency: 'PEN',
        price,
        salePrice,
        regularPrice,
        discountPct,
        subtotal: price,
        products: [productLine],
        rawPreview: {
            type: 'product',
            sourceType: 'native_catalog_product',
            title,
            body: '',
            sku: productRetailerId || null,
            productRetailerId: productRetailerId || null,
            catalogId: catalogId || null,
            imageUrl: imageUrl || null,
            price,
            salePrice,
            regularPrice,
            discountPct
        }
    };
}

function resolveProductRetailerId(product = {}) {
    return firstCleanText(...resolveProductRetailerIdCandidates(product));
}

function resolveProductRetailerIdCandidates(product = {}) {
    const metadata = getProductMetadata(product);
    return uniqueCleanTexts(
        product?.productRetailerId,
        product?.product_retailer_id,
        product?.retailerId,
        product?.retailer_id,
        product?.itemId,
        product?.item_id,
        product?.sku,
        metadata.productRetailerId,
        metadata.product_retailer_id,
        metadata.retailerId,
        metadata.retailer_id,
        metadata.itemId,
        metadata.item_id,
        metadata.sku,
        product?.id,
        product?.productId
    );
}

function resolveMetaCatalogId({
    product = {},
    payload = {},
    integrations = {},
    moduleContext = null
} = {}) {
    const metadata = getProductMetadata(product);
    const moduleMetadata = moduleContext?.metadata && typeof moduleContext.metadata === 'object'
        ? moduleContext.metadata
        : {};
    const candidates = [
        payload?.metaCatalogId,
        payload?.meta_catalog_id,
        payload?.nativeCatalogId,
        payload?.native_catalog_id,
        product?.metaCatalogId,
        product?.meta_catalog_id,
        product?.nativeCatalogId,
        product?.native_catalog_id,
        metadata.metaCatalogId,
        metadata.meta_catalog_id,
        metadata.nativeCatalogId,
        metadata.native_catalog_id,
        metadata.whatsappCatalogId,
        metadata.whatsapp_catalog_id,
        moduleMetadata.metaCatalogId,
        moduleMetadata.meta_catalog_id,
        moduleMetadata.nativeCatalogId,
        moduleMetadata.native_catalog_id,
        integrations?.metaAds?.catalogId,
        integrations?.metaAds?.catalog_id,
        integrations?.catalog?.metaCatalogId,
        integrations?.catalog?.meta_catalog_id,
        integrations?.catalog?.providers?.meta?.catalogId,
        integrations?.catalog?.providers?.meta?.catalog_id
    ];
    return candidates.map(toCleanText).find(isMetaCatalogId) || '';
}

function buildNativeProductInteractive(product = {}, catalogId = '', productRetailerId = '') {
    const interactive = {
        type: 'product',
        action: {
            catalog_id: catalogId,
            product_retailer_id: productRetailerId
        }
    };
    return interactive;
}

function buildNativeCatalogInteractive({
    bodyText = '',
    thumbnailProductRetailerId = ''
} = {}) {
    const action = { name: 'catalog_message' };
    const thumbnail = toCleanText(thumbnailProductRetailerId);
    if (thumbnail) {
        action.parameters = { thumbnail_product_retailer_id: thumbnail };
    }
    return {
        type: 'catalog_message',
        body: {
            text: firstCleanText(bodyText, 'Catalogo de productos Lavitat')
        },
        action
    };
}

function buildNativeCatalogPayload({
    catalogId = '',
    bodyText = '',
    thumbnailProductRetailerId = ''
} = {}) {
    return {
        type: 'native_catalog',
        sourceType: 'native_catalog_message',
        title: 'Catalogo de productos',
        body: firstCleanText(bodyText, 'Catalogo de productos'),
        catalogId: catalogId || null,
        thumbnailProductRetailerId: thumbnailProductRetailerId || null,
        rawPreview: {
            type: 'native_catalog',
            sourceType: 'native_catalog_message',
            title: 'Catalogo de productos',
            body: firstCleanText(bodyText, 'Catalogo de productos'),
            catalogId: catalogId || null,
            thumbnailProductRetailerId: thumbnailProductRetailerId || null
        }
    };
}

function buildSyntheticOutgoingMessage({
    messageId = '',
    chatId = '',
    body = '',
    type = 'chat',
    metadata = null
} = {}) {
    return {
        id: messageId ? { _serialized: messageId } : null,
        to: chatId,
        body,
        fromMe: true,
        timestamp: Math.floor(Date.now() / 1000),
        ack: 1,
        hasMedia: false,
        type,
        _data: metadata && typeof metadata === 'object' ? { metadata } : undefined
    };
}

function createSocketCatalogDeliveryService({
    waClient,
    tenantIntegrationsService,
    fetchCatalogProductImage,
    ensureCloudApiCompatibleCatalogImage,
    resolveSocketModuleContext,
    slugifyFileName,
    buildCatalogProductCaption,
    getSerializedMessageId,
    buildSocketAgentMeta,
    sanitizeAgentMeta,
    rememberOutgoingAgentMeta
} = {}) {
    const registerCatalogDeliveryHandlers = ({
        socket,
        tenantId = 'default',
        authContext,
        guardRateLimit,
        transportOrchestrator,
        checkOutboundConsent,
        isFeatureEnabledForTenant,
        resolveScopedSendTarget,
        emitRealtimeOutgoingMessage,
        recordConversationEvent
    } = {}) => {
        const ensurePayloadModuleTransport = async (payload = {}, errorEvent = 'error', action = 'enviar productos de catalogo') => {
            const requestedModuleId = String(payload?.moduleId || '').trim().toLowerCase();
            if (!requestedModuleId || typeof resolveSocketModuleContext !== 'function') return true;
            const moduleContextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId);
            const selectedModule = moduleContextPayload?.selected || null;
            if (!selectedModule?.moduleId || String(selectedModule.moduleId || '').trim().toLowerCase() !== requestedModuleId) {
                socket.emit(errorEvent, 'No tienes acceso al modulo solicitado para ' + action + '.');
                return false;
            }
            await transportOrchestrator.ensureTransportForSelectedModule(selectedModule);
            return true;
        };
        const loadRuntimeIntegrations = async () => {
            if (!tenantIntegrationsService || typeof tenantIntegrationsService.getTenantIntegrations !== 'function') return {};
            try {
                return await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
            } catch (error) {
                console.warn('[WA][CatalogNative][integrations] ' + String(error?.message || error));
                return {};
            }
        };

        const loadNativeCatalogIdFromDb = async () => {
            if (getStorageDriver() !== 'postgres') return '';
            try {
                const result = await queryPostgres(
                    `SELECT config_json->'metaAds'->>'catalogId' as catalog_id
                       FROM tenant_integrations
                      WHERE tenant_id = $1
                      LIMIT 1`,
                    [tenantId]
                );
                return toCleanText(result?.rows?.[0]?.catalog_id);
            } catch (error) {
                console.warn('[CatalogNative] No se pudo obtener catalogId: ' + String(error?.message || error));
                return '';
            }
        };

        socket.on('send_catalog_product', async (payload = {}) => {
            if (!guardRateLimit(socket, 'send_catalog_product')) return;
            if (!(await ensurePayloadModuleTransport(payload, 'error', 'enviar productos de catalogo'))) return;
            if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar productos de catalogo', errorEvent: 'error' })) return;

            const catalogEnabled = await isFeatureEnabledForTenant(tenantId, 'catalog');
            if (!catalogEnabled) {
                socket.emit('error', 'Catalogo deshabilitado para esta empresa o plan.');
                return;
            }

            try {
                const target = await resolveScopedSendTarget({
                    rawChatId: payload?.to,
                    rawPhone: payload?.toPhone,
                    errorEvent: 'error',
                    action: 'enviar productos de catalogo'
                });
                if (!target?.ok) return;

                if (typeof checkOutboundConsent === 'function') {
                    const consentResult = await checkOutboundConsent(tenantId, {
                        phone: target.targetPhone || target.targetChatId,
                        messageType: 'catalog'
                    });
                    if (!consentResult?.allowed) {
                        socket.emit('error', 'El cliente no tiene consentimiento de marketing para recibir catalogos.');
                        return;
                    }
                }

                const product = payload?.product && typeof payload.product === 'object' ? payload.product : {};
                const caption = buildCatalogProductCaption(product);
                const imageUrl = String(product?.imageUrl || product?.image || '').trim();
                const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                const baseSendMetadata = {
                    tenantId,
                    chatId: target.targetChatId,
                    sendIdempotencyType: 'catalog',
                    sendIdempotencyFingerprint: String(product?.id || product?.productId || imageUrl || caption).trim() || caption.slice(0, 50)
                };

                let sentWithImage = false;
                let sentNativeCatalog = false;
                let deliveryMode = 'fallback';
                let sentResponse = null;
                let catalogMediaPayload = null;
                let nativeCatalogId = '';
                let productRetailerId = '';
                let productRetailerIds = [];

                productRetailerIds = resolveProductRetailerIdCandidates(product);
                const integrations = await loadRuntimeIntegrations();
                nativeCatalogId = resolveMetaCatalogId({ product, payload, integrations, moduleContext });
                if (!nativeCatalogId) {
                    nativeCatalogId = await loadNativeCatalogIdFromDb();
                }
                productRetailerId = productRetailerIds[0] || '';
                const matchedCatalogItem = productRetailerIds.length
                    ? await resolveCatalogItemByCandidates(tenantId, productRetailerIds)
                    : null;
                productRetailerId = matchedCatalogItem?.itemId || productRetailerId;
                const finalOrderPayload = productRetailerId
                    ? buildNativeProductOrderPayload(product, nativeCatalogId || '', productRetailerId, matchedCatalogItem)
                    : null;
                const nativeProductOrderPayload = nativeCatalogId && productRetailerId
                    ? finalOrderPayload
                    : null;
                if (nativeCatalogId && productRetailerId && waClient && typeof waClient.sendInteractiveMessage === 'function') {
                    const nativeInteractive = buildNativeProductInteractive(product, nativeCatalogId, productRetailerId);
                    try {
                        sentResponse = await waClient.sendInteractiveMessage(target.targetChatId, nativeInteractive, {
                            metadata: {
                                ...baseSendMetadata,
                                deliveryMode: 'native_catalog_product',
                                metaCatalogId: nativeCatalogId,
                                productRetailerId,
                                productTitle: nativeProductOrderPayload?.title || firstCleanText(product?.title, product?.name),
                                productPrice: nativeProductOrderPayload?.price ?? null,
                                nativeProductOrderPayload
                            }
                        });
                        if (sentResponse) {
                            sentNativeCatalog = true;
                            deliveryMode = 'native_catalog_product';
                        }
                    } catch (nativeError) {
                        console.warn('[WA][SendCatalogProduct][native] Meta no acepto el producto nativo; se usara fallback. ' + String(nativeError?.message || nativeError));
                        sentResponse = null;
                    }
                }

                if (!sentNativeCatalog && imageUrl) {
                    const maxCatalogImageBytes = Number(process.env.CATALOG_IMAGE_MAX_BYTES || 4 * 1024 * 1024);
                    const compatibleMedia = await fetchCatalogProductImage(imageUrl, {
                        tenantId,
                        maxBytes: maxCatalogImageBytes,
                        timeoutMs: Number(process.env.CATALOG_IMAGE_TIMEOUT_MS || 7000)
                    });

                    if (compatibleMedia) {
                        const baseName = slugifyFileName(product?.title || product?.name || 'producto');
                        const filename = String(baseName || 'producto') + '.' + String(compatibleMedia.extension || 'jpg');
                        sentResponse = await waClient.sendMedia(
                            target.targetChatId,
                            compatibleMedia.mediaData,
                            compatibleMedia.mimetype,
                            filename,
                            caption,
                            false,
                            null,
                            {
                                ...baseSendMetadata,
                                mediaUrl: String(compatibleMedia?.publicUrl || compatibleMedia?.sourceUrl || imageUrl || '').trim() || null,
                                catalogProductOrderPayload: finalOrderPayload
                            }
                        );
                        if (!sentResponse) return;
                        sentWithImage = true;
                        deliveryMode = 'image_fallback';
                        catalogMediaPayload = {
                            mimetype: compatibleMedia.mimetype,
                            filename,
                            fileSizeBytes: Number(compatibleMedia?.fileSizeBytes || 0) || null,
                            mediaUrl: String(compatibleMedia?.publicUrl || compatibleMedia?.sourceUrl || imageUrl || '').trim() || null,
                            mediaPath: String(compatibleMedia?.relativePath || '').trim() || null
                        };
                    } else {
                        console.warn('[WA][SendCatalogProduct] no se pudo resolver media compatible; se enviara solo texto.');
                    }
                }

                if (!sentNativeCatalog && !sentWithImage) {
                    sentResponse = await waClient.sendMessage(target.targetChatId, caption, {
                        metadata: {
                            ...baseSendMetadata,
                            deliveryMode: 'text_fallback',
                            catalogProductOrderPayload: finalOrderPayload
                        }
                    });
                    deliveryMode = 'text_fallback';
                }
                if (!sentResponse) return;

                const sentMessageId = getSerializedMessageId(sentResponse)
                    || String(sentResponse?.messages?.[0]?.id || sentResponse?.message_id || (typeof sentResponse === 'string' ? sentResponse : '')).trim();
                if (sentMessageId && agentMeta) {
                    rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                }
                const syntheticMessage = buildSyntheticOutgoingMessage({
                    messageId: sentMessageId,
                    chatId: target.targetChatId,
                    body: sentNativeCatalog ? '' : '',
                    type: sentNativeCatalog ? 'product' : 'chat',
                    metadata: sentNativeCatalog || finalOrderPayload
                        ? {
                            ...baseSendMetadata,
                            deliveryMode,
                            metaCatalogId: nativeCatalogId || null,
                            productRetailerId: productRetailerId || null,
                            nativeProductOrderPayload: finalOrderPayload
                        }
                        : null
                });

                await emitRealtimeOutgoingMessage({
                    sentMessage: sentResponse && typeof sentResponse === 'object' ? sentResponse : syntheticMessage,
                    fallbackChatId: target.targetChatId,
                    fallbackBody: sentNativeCatalog ? '' : caption,
                    moduleContext,
                    agentMeta,
                    mediaPayload: catalogMediaPayload,
                    orderPayload: finalOrderPayload || null
                });

                const productId = String(product?.id || product?.productId || '').trim() || null;
                const catalogId = String(product?.catalogId || '').trim() || null;

                socket.emit('catalog_product_sent', {
                    to: target.scopedChatId || target.targetChatId,
                    chatId: target.scopedChatId || target.targetChatId,
                    baseChatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId || null,
                    title: String(product?.title || product?.name || 'Producto'),
                    withImage: sentWithImage,
                    nativeCatalog: sentNativeCatalog,
                    deliveryMode,
                    metaCatalogId: nativeCatalogId || null,
                    productRetailerId: productRetailerId || null,
                    productId,
                    catalogId
                });

                setImmediate(async () => {
                    try {
                        await recordConversationEvent({
                            chatId: target.targetChatId,
                            scopeModuleId: target.scopeModuleId,
                            eventType: 'chat.message.outgoing.catalog_product',
                            eventSource: 'socket',
                            payload: {
                                messageId: sentMessageId || null,
                                productId,
                                productTitle: String(product?.title || product?.name || '').trim() || null,
                                withImage: sentWithImage,
                                nativeCatalog: sentNativeCatalog,
                                deliveryMode,
                                metaCatalogId: nativeCatalogId || null,
                                productRetailerId: productRetailerId || null,
                                mediaUrl: String(catalogMediaPayload?.mediaUrl || '').trim() || null,
                                catalogId
                            }
                        });
                    } catch (recordError) {
                        console.warn('[WA][SendCatalogProduct][recordConversationEvent] ' + String(recordError?.message || recordError));
                    }
                });
            } catch (e) {
                const detail = String(e?.message || e || 'No se pudo enviar el producto del catalogo.');
                console.warn('[WA][SendCatalogProduct] ' + detail);
                socket.emit('error', detail);
            }
        });

        socket.on('send_native_catalog', async (payload = {}) => {
            if (!guardRateLimit(socket, 'send_native_catalog')) return;
            if (!(await ensurePayloadModuleTransport(payload, 'error', 'enviar catalogo nativo'))) return;
            if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar catalogo nativo', errorEvent: 'error' })) return;

            const catalogEnabled = await isFeatureEnabledForTenant(tenantId, 'catalog');
            if (!catalogEnabled) {
                socket.emit('error', 'Catalogo deshabilitado para esta empresa o plan.');
                return;
            }

            try {
                const target = await resolveScopedSendTarget({
                    rawChatId: payload?.to,
                    rawPhone: payload?.toPhone,
                    errorEvent: 'error',
                    action: 'enviar catalogo nativo'
                });
                if (!target?.ok) return;

                if (typeof checkOutboundConsent === 'function') {
                    const consentResult = await checkOutboundConsent(tenantId, {
                        phone: target.targetPhone || target.targetChatId,
                        messageType: 'catalog'
                    });
                    if (!consentResult?.allowed) {
                        socket.emit('error', 'El cliente no tiene consentimiento de marketing para recibir catalogos.');
                        return;
                    }
                }

                if (!waClient || typeof waClient.sendInteractiveMessage !== 'function') {
                    socket.emit('error', 'El envio de catalogo nativo no esta disponible en esta sesion.');
                    return;
                }

                const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                const integrations = await loadRuntimeIntegrations();
                const metaCatalogId = resolveMetaCatalogId({ payload, integrations, moduleContext });
                if (!metaCatalogId) {
                    socket.emit('error', 'No hay catalogo Meta configurado para enviar el catalogo nativo.');
                    return;
                }

                const thumbnailProductRetailerId = firstCleanText(
                    payload?.thumbnailProductRetailerId,
                    payload?.thumbnail_product_retailer_id,
                    payload?.productRetailerId,
                    payload?.product_retailer_id
                );
                const catalogBodyText = firstCleanText(payload?.bodyText, payload?.text, 'Catalogo de productos Lavitat');
                const interactive = buildNativeCatalogInteractive({
                    bodyText: catalogBodyText,
                    thumbnailProductRetailerId
                });
                const nativeCatalogPayload = buildNativeCatalogPayload({
                    catalogId: metaCatalogId,
                    bodyText: catalogBodyText,
                    thumbnailProductRetailerId
                });
                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                const sendMetadata = {
                    tenantId,
                    chatId: target.targetChatId,
                    sendIdempotencyType: 'native_catalog',
                    sendIdempotencyFingerprint: `${metaCatalogId}:${catalogBodyText}`,
                    deliveryMode: 'native_catalog_message',
                    metaCatalogId,
                    nativeCatalogPayload
                };

                const sentResponse = await waClient.sendInteractiveMessage(target.targetChatId, interactive, {
                    metadata: sendMetadata
                });
                if (!sentResponse) return;

                const sentMessageId = getSerializedMessageId(sentResponse)
                    || String(sentResponse?.messages?.[0]?.id || sentResponse?.message_id || (typeof sentResponse === 'string' ? sentResponse : '')).trim();
                if (sentMessageId && agentMeta) {
                    rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                }

                await emitRealtimeOutgoingMessage({
                    sentMessage: sentResponse && typeof sentResponse === 'object'
                        ? sentResponse
                        : buildSyntheticOutgoingMessage({
                            messageId: sentMessageId,
                            chatId: target.targetChatId,
                            body: '',
                            type: 'native_catalog',
                            metadata: sendMetadata
                        }),
                    fallbackChatId: target.targetChatId,
                    fallbackBody: '',
                    moduleContext,
                    agentMeta,
                    mediaPayload: null,
                    orderPayload: nativeCatalogPayload
                });

                socket.emit('native_catalog_sent', {
                    to: target.scopedChatId || target.targetChatId,
                    chatId: target.scopedChatId || target.targetChatId,
                    baseChatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId || null,
                    metaCatalogId
                });

                setImmediate(async () => {
                    try {
                        await recordConversationEvent({
                            chatId: target.targetChatId,
                            scopeModuleId: target.scopeModuleId,
                            eventType: 'chat.message.outgoing.native_catalog',
                            eventSource: 'socket',
                            payload: {
                                messageId: sentMessageId || null,
                                metaCatalogId,
                                bodyText: catalogBodyText
                            }
                        });
                    } catch (recordError) {
                        console.warn('[WA][SendNativeCatalog][recordConversationEvent] ' + String(recordError?.message || recordError));
                    }
                });
            } catch (e) {
                const detail = String(e?.message || e || 'No se pudo enviar el catalogo nativo.');
                console.warn('[WA][SendNativeCatalog] ' + detail);
                socket.emit('error', detail);
            }
        });
    };

    return {
        registerCatalogDeliveryHandlers
    };
}

module.exports = {
    createSocketCatalogDeliveryService
};
