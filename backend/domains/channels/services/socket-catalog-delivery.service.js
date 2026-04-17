function createSocketCatalogDeliveryService({
    waClient,
    fetchCatalogProductImage,
    ensureCloudApiCompatibleCatalogImage,
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
        socket.on('send_catalog_product', async (payload = {}) => {
            if (!guardRateLimit(socket, 'send_catalog_product')) return;
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

                let sentWithImage = false;
                let sentResponse = null;
                let catalogMediaPayload = null;

                if (imageUrl) {
                    const maxCatalogImageBytes = Number(process.env.CATALOG_IMAGE_MAX_BYTES || 4 * 1024 * 1024);
                    const media = await fetchCatalogProductImage(imageUrl, {
                        maxBytes: maxCatalogImageBytes,
                        timeoutMs: Number(process.env.CATALOG_IMAGE_TIMEOUT_MS || 7000)
                    });
                    const compatibleMedia = await ensureCloudApiCompatibleCatalogImage(media, {
                        maxBytes: maxCatalogImageBytes
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
                            false
                        );
                        sentWithImage = true;
                        catalogMediaPayload = {
                            mimetype: compatibleMedia.mimetype,
                            filename,
                            fileSizeBytes: Number(compatibleMedia?.fileSizeBytes || 0) || null,
                            mediaUrl: String(compatibleMedia?.publicUrl || compatibleMedia?.sourceUrl || imageUrl || '').trim() || null,
                            mediaPath: String(compatibleMedia?.relativePath || '').trim() || null
                        };
                    } else if (media?.mimetype) {
                        console.warn('[WA][SendCatalogProduct] media no compatible para Cloud API (' + String(media.mimetype) + '), se enviara solo texto.');
                    }
                }

                if (!sentWithImage) {
                    sentResponse = await waClient.sendMessage(target.targetChatId, caption);
                }

                const sentMessageId = getSerializedMessageId(sentResponse)
                    || String(sentResponse?.messages?.[0]?.id || sentResponse?.message_id || '').trim();
                if (sentMessageId && agentMeta) {
                    rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                }

                await emitRealtimeOutgoingMessage({
                    sentMessage: sentResponse || {
                        id: sentMessageId ? { _serialized: sentMessageId } : null,
                        to: target.targetChatId,
                        body: caption,
                        fromMe: true,
                        timestamp: Math.floor(Date.now() / 1000),
                        ack: 1,
                        hasMedia: sentWithImage,
                        type: sentWithImage ? 'image' : 'chat'
                    },
                    fallbackChatId: target.targetChatId,
                    fallbackBody: caption,
                    moduleContext,
                    agentMeta,
                    mediaPayload: catalogMediaPayload
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
    };

    return {
        registerCatalogDeliveryHandlers
    };
}

module.exports = {
    createSocketCatalogDeliveryService
};
