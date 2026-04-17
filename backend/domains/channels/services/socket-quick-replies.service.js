function createSocketQuickRepliesService({
    waClient,
    listQuickReplies,
    fetchQuickReplyMedia,
    normalizeScopedModuleId,
    pathModule,
    getSerializedMessageId,
    sanitizeAgentMeta,
    buildSocketAgentMeta,
    rememberOutgoingAgentMeta
} = {}) {
    const normalizeQuickReplyAssetEntry = (entry = {}) => ({
        url: String(entry?.url || entry?.mediaUrl || '').trim(),
        mimeType: String(entry?.mimeType || entry?.mediaMimeType || '').trim().toLowerCase() || '',
        fileName: String(entry?.fileName || entry?.mediaFileName || entry?.filename || '').trim() || '',
        sizeBytes: Number(entry?.sizeBytes ?? entry?.mediaSizeBytes) || null
    });

    const buildQuickReplySentPayload = ({
        replyPayload,
        quickReplyId,
        target
    }) => {
        const id = String(replyPayload?.id || quickReplyId || '').trim() || null;
        const label = String(replyPayload?.label || '').trim() || null;
        const chatId = target.scopedChatId || target.targetChatId;
        return {
            ok: true,
            id,
            label,
            to: chatId,
            baseChatId: target.targetChatId,
            scopeModuleId: target.scopeModuleId || null,
            quickReplyId: id,
            quickReplyLabel: label,
            chatId
        };
    };

    const registerQuickReplyHandlers = ({
        socket,
        tenantId = 'default',
        authContext,
        guardRateLimit,
        transportOrchestrator,
        isFeatureEnabledForTenant,
        resolveScopedSendTarget,
        emitRealtimeOutgoingMessage,
        quickReplyMediaMaxBytes,
        quickReplyMediaTimeoutMs
    } = {}) => {
        socket.on('get_quick_replies', async (payload = {}) => {
            try {
                const quickRepliesEnabled = await isFeatureEnabledForTenant(tenantId, 'quickReplies');
                if (!quickRepliesEnabled) {
                    socket.emit('quick_replies', { items: [], source: 'disabled', enabled: false, writable: false });
                    return;
                }

                const payloadModuleId = String(payload?.moduleId || '').trim().toLowerCase();
                const selectedModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const moduleId = payloadModuleId || selectedModuleId || '';
                const items = await listQuickReplies({ tenantId, moduleId });
                socket.emit('quick_replies', {
                    items: Array.isArray(items) ? items : [],
                    source: 'db',
                    enabled: true,
                    writable: false
                });
            } catch (_) {
                socket.emit('quick_reply_error', 'No se pudieron cargar las respuestas rapidas.');
            }
        });

        socket.on('send_quick_reply', async (payload = {}) => {
            if (!guardRateLimit(socket, 'send_quick_reply')) return;
            if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar respuestas rapidas', errorEvent: 'error' })) return;
            try {
                const quickRepliesEnabled = await isFeatureEnabledForTenant(tenantId, 'quickReplies');
                if (!quickRepliesEnabled) {
                    socket.emit('error', 'Respuestas rapidas deshabilitadas para esta empresa o plan.');
                    return;
                }

                const quoted = String(payload?.quotedMessageId || '').trim();
                const target = await resolveScopedSendTarget({
                    rawChatId: payload?.to,
                    rawPhone: payload?.toPhone,
                    errorEvent: 'error',
                    action: 'enviar respuestas rapidas'
                });
                if (!target?.ok) return;

                const moduleId = normalizeScopedModuleId(target.scopeModuleId || socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const quickReplyId = String(payload?.quickReplyId || payload?.id || '').trim();

                let replyPayload = null;
                if (quickReplyId) {
                    const scopedReplies = await listQuickReplies({ tenantId, moduleId });
                    replyPayload = (Array.isArray(scopedReplies) ? scopedReplies : [])
                        .find((entry) => String(entry?.id || '').trim() === quickReplyId) || null;
                }

                if (!replyPayload && payload?.quickReply && typeof payload.quickReply === 'object') {
                    replyPayload = payload.quickReply;
                }

                if (!replyPayload) {
                    socket.emit('error', 'Respuesta rapida no encontrada para este modulo.');
                    return;
                }

                const bodyText = String(replyPayload?.text || replyPayload?.bodyText || replyPayload?.body || '').trim();
                const rawMediaAssets = Array.isArray(replyPayload?.mediaAssets) ? replyPayload.mediaAssets : [];
                const mediaAssets = rawMediaAssets
                    .map(normalizeQuickReplyAssetEntry)
                    .filter((entry) => Boolean(entry.url));

                const legacyMediaUrl = String(replyPayload?.mediaUrl || '').trim();
                const legacyMediaMimeType = String(replyPayload?.mediaMimeType || '').trim().toLowerCase();
                const legacyMediaFileName = String(replyPayload?.mediaFileName || replyPayload?.filename || '').trim();
                if (legacyMediaUrl && !mediaAssets.some((entry) => entry.url === legacyMediaUrl)) {
                    mediaAssets.push({
                        url: legacyMediaUrl,
                        mimeType: legacyMediaMimeType,
                        fileName: legacyMediaFileName,
                        sizeBytes: null
                    });
                }

                if (!bodyText && mediaAssets.length === 0) {
                    socket.emit('error', 'La respuesta rapida no tiene contenido para enviar.');
                    return;
                }

                const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));

                let sentMessage = null;
                let mediaPayload = null;

                if (mediaAssets.length > 0) {
                    const sentMediaPayloads = [];
                    for (let index = 0; index < mediaAssets.length; index += 1) {
                        const mediaEntry = mediaAssets[index] || null;
                        if (!mediaEntry?.url) continue;

                        const fetchedMedia = await fetchQuickReplyMedia(mediaEntry.url, {
                            tenantId,
                            maxBytes: quickReplyMediaMaxBytes,
                            timeoutMs: quickReplyMediaTimeoutMs,
                            mimeHint: mediaEntry.mimeType || legacyMediaMimeType,
                            fileNameHint: mediaEntry.fileName || legacyMediaFileName
                        });

                        if (!fetchedMedia || !fetchedMedia.mediaData) {
                            socket.emit('error', 'No se pudo procesar el adjunto de la respuesta rapida.');
                            return;
                        }

                        const fileNameBase = mediaEntry.fileName || legacyMediaFileName || pathModule.basename(String(fetchedMedia.filename || '').trim() || '') || ('adjunto-' + Date.now());
                        const safeFileName = String(fileNameBase || '').trim() || ('adjunto-' + Date.now());
                        const captionText = index === 0 ? bodyText : '';
                        const quotedMessageId = index === 0 ? (quoted || null) : null;
                        const sentAssetMessage = await waClient.sendMedia(
                            target.targetChatId,
                            fetchedMedia.mediaData,
                            fetchedMedia.mimetype || mediaEntry.mimeType || legacyMediaMimeType || 'application/octet-stream',
                            safeFileName,
                            captionText,
                            false,
                            quotedMessageId
                        );

                        if (!sentMessage) sentMessage = sentAssetMessage;
                        const currentMediaPayload = {
                            mimetype: fetchedMedia.mimetype || mediaEntry.mimeType || legacyMediaMimeType || null,
                            filename: safeFileName,
                            fileSizeBytes: Number(fetchedMedia?.fileSizeBytes || mediaEntry?.sizeBytes || 0) || null,
                            mediaUrl: String(fetchedMedia?.publicUrl || fetchedMedia?.sourceUrl || mediaEntry.url || '').trim() || null,
                            mediaPath: String(fetchedMedia?.relativePath || '').trim() || null
                        };
                        sentMediaPayloads.push(currentMediaPayload);

                        const sentAssetMessageId = getSerializedMessageId(sentAssetMessage);
                        if (sentAssetMessageId && agentMeta) rememberOutgoingAgentMeta(sentAssetMessageId, agentMeta);

                        await emitRealtimeOutgoingMessage({
                            sentMessage: sentAssetMessage,
                            fallbackChatId: target.targetChatId,
                            fallbackBody: captionText,
                            quotedMessageId: quotedMessageId || '',
                            moduleContext,
                            agentMeta,
                            mediaPayload: currentMediaPayload
                        });
                    }
                    if (sentMediaPayloads.length > 0) {
                        mediaPayload = {
                            ...sentMediaPayloads[0],
                            mediaAssets: sentMediaPayloads
                        };
                    }
                } else {
                    if (quoted) {
                        sentMessage = await waClient.sendMessage(target.targetChatId, bodyText, { quotedMessageId: quoted });
                    } else {
                        sentMessage = await waClient.sendMessage(target.targetChatId, bodyText);
                    }
                    const sentMessageId = getSerializedMessageId(sentMessage);
                    if (sentMessageId && agentMeta) rememberOutgoingAgentMeta(sentMessageId, agentMeta);

                    await emitRealtimeOutgoingMessage({
                        sentMessage,
                        fallbackChatId: target.targetChatId,
                        fallbackBody: bodyText,
                        quotedMessageId: quoted,
                        moduleContext,
                        agentMeta,
                        mediaPayload
                    });
                }

                socket.emit('quick_reply_sent', buildQuickReplySentPayload({
                    replyPayload,
                    quickReplyId,
                    target
                }));
            } catch (error) {
                socket.emit('error', String(error?.message || 'No se pudo enviar la respuesta rapida.'));
            }
        });
    };

    return {
        registerQuickReplyHandlers
    };
}

module.exports = {
    createSocketQuickRepliesService
};
