function createSocketChatHistoryMediaService({
    waClient,
    mediaManager,
    messageHistoryService,
    normalizeScopedModuleId,
    resolveScopedChatTarget,
    buildScopedChatId,
    normalizePhoneDigits,
    extractPhoneFromChat,
    isStatusOrSystemMessage,
    getSerializedMessageId,
    resolveMessageSenderMeta,
    extractMessageFileMeta,
    extractQuotedMessageInfo,
    extractOrderInfo,
    extractLocationInfo,
    getOutgoingAgentMeta,
    mergeAgentMeta,
    getSortedVisibleChats
} = {}) {
    const toHistoryMessagePayload = (row = {}, chatId = '') => {
        const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        const senderId = String(row?.senderId || row?.authorId || '').trim() || null;
        const senderPhone = String(row?.senderPhone || (senderId ? senderId.split('@')[0] : '') || '').trim() || null;
        const timestamp = Number(row?.timestampUnix || 0) || Math.floor(Date.now() / 1000);
        const type = String(row?.messageType || 'chat').trim() || 'chat';
        const fromMe = Boolean(row?.fromMe);

        return {
            id: String(row?.messageId || '').trim(),
            from: fromMe ? 'me@localhost' : (senderId || chatId),
            to: fromMe ? chatId : null,
            body: row?.body === null || row?.body === undefined ? '' : String(row.body),
            timestamp,
            fromMe,
            hasMedia: Boolean(row?.hasMedia),
            mediaData: null,
            mimetype: row?.mediaMime || null,
            filename: row?.mediaFilename || null,
            fileSizeBytes: Number.isFinite(Number(row?.mediaSizeBytes)) ? Number(row.mediaSizeBytes) : null,
            mediaUrl: String(metadata?.media?.url || '').trim() || null,
            mediaPath: String(metadata?.media?.path || '').trim() || null,
            type,
            author: row?.authorId || null,
            notifyName: String(metadata?.notifyName || '').trim() || null,
            senderPhone,
            senderId,
            senderPushname: String(metadata?.senderPushname || '').trim() || null,
            isGroupMessage: Boolean(metadata?.isGroupMessage || String(chatId || '').endsWith('@g.us')),
            sentByUserId: String(metadata?.sentByUserId || '').trim() || null,
            sentByName: String(metadata?.sentByName || '').trim() || null,
            sentByEmail: String(metadata?.sentByEmail || '').trim() || null,
            sentByRole: String(metadata?.sentByRole || '').trim() || null,
            sentViaModuleId: String(row?.waModuleId || metadata?.sentViaModuleId || '').trim() || null,
            sentViaPhoneNumber: String(row?.waPhoneNumber || '').trim() || null,
            sentViaModuleName: String(metadata?.sentViaModuleName || '').trim() || null,
            sentViaModuleImageUrl: String(metadata?.sentViaModuleImageUrl || '').trim() || null,
            sentViaTransport: String(metadata?.sentViaTransport || '').trim() || null,
            sentViaChannelType: String(metadata?.sentViaChannelType || '').trim() || null,
            ack: Number.isFinite(Number(row?.ack)) ? Number(row.ack) : 0,
            edited: Boolean(row?.edited),
            editedAt: Number(row?.editedAtUnix || 0) || null,
            canEdit: false,
            order: row?.orderPayload && typeof row.orderPayload === 'object' ? row.orderPayload : null,
            location: row?.locationPayload && typeof row.locationPayload === 'object' ? row.locationPayload : null,
            quotedMessage: row?.quotedMessageId ? { id: String(row.quotedMessageId), body: '', fromMe: false } : null,
            reactions: Array.isArray(metadata?.reactions) ? metadata.reactions : []
        };
    };

    const getHistoryChatHistory = async (tenantId, { chatId = '', limit = 60, scopeModuleId = '' } = {}) => {
        const requestedChatId = String(chatId || '').trim();
        const safeLimit = Number.isFinite(Number(limit)) ? Math.min(300, Math.max(20, Math.floor(Number(limit)))) : 60;
        const normalizedScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');

        const filterRowsByScope = (rows = []) => {
            const source = Array.isArray(rows) ? rows : [];
            if (!normalizedScopeModuleId) return source;
            const withScope = source.filter((row) => {
                const rowScope = normalizeScopedModuleId(row?.waModuleId || row?.metadata?.sentViaModuleId || '');
                return !rowScope || rowScope === normalizedScopeModuleId;
            });
            return withScope;
        };

        let resolvedChatId = requestedChatId;
        let rows = requestedChatId
            ? await messageHistoryService.listMessages(tenantId, { chatId: requestedChatId, limit: safeLimit })
            : [];
        rows = filterRowsByScope(rows);

        if ((!Array.isArray(rows) || rows.length === 0) && requestedChatId) {
            const digits = normalizePhoneDigits(requestedChatId.split('@')[0] || '');
            if (digits) {
                const candidates = await messageHistoryService.listChats(tenantId, { limit: 500, offset: 0 });
                const candidate = (Array.isArray(candidates) ? candidates : []).find((entry) => {
                    if (normalizedScopeModuleId) {
                        const candidateModuleId = normalizeScopedModuleId(entry?.lastMessageModuleId || entry?.metadata?.sentViaModuleId || '');
                        if (candidateModuleId && candidateModuleId !== normalizedScopeModuleId) return false;
                    }
                    const phoneDigits = normalizePhoneDigits(entry?.phone || '');
                    const idDigits = normalizePhoneDigits(String(entry?.chatId || '').split('@')[0] || '');
                    return (phoneDigits && (phoneDigits === digits || phoneDigits.endsWith(digits) || digits.endsWith(phoneDigits)))
                        || (idDigits && (idDigits === digits || idDigits.endsWith(digits) || digits.endsWith(idDigits)));
                });
                if (candidate?.chatId) {
                    resolvedChatId = String(candidate.chatId);
                    rows = await messageHistoryService.listMessages(tenantId, { chatId: resolvedChatId, limit: safeLimit });
                    rows = filterRowsByScope(rows);
                }
            }
        }

        const messages = (Array.isArray(rows) ? rows : [])
            .slice()
            .sort((a, b) => {
                const aTs = Number(a?.timestampUnix || 0);
                const bTs = Number(b?.timestampUnix || 0);
                if (aTs !== bTs) return aTs - bTs;
                return String(a?.messageId || '').localeCompare(String(b?.messageId || ''));
            })
            .map((row) => toHistoryMessagePayload(row, resolvedChatId || requestedChatId))
            .filter((msg) => Boolean(msg?.id));

        return {
            chatId: resolvedChatId || requestedChatId,
            requestedChatId,
            scopeModuleId: normalizedScopeModuleId || null,
            messages,
            source: 'history_fallback'
        };
    };

    const registerChatHistoryHandlers = ({
        socket,
        tenantId = 'default',
        transportOrchestrator
    } = {}) => {
        socket.on('get_chat_history', async (chatId) => {
            try {
                const requestedRawChatId = String(chatId || '').trim();
                const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const scopedTarget = resolveScopedChatTarget(requestedRawChatId, selectedScopeModuleId);
                const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                const requestedScopedChatId = scopedTarget.scopedChatId
                    || buildScopedChatId(String(scopedTarget.baseChatId || requestedRawChatId || '').trim(), scopeModuleId || '');
                let historyChatId = String(scopedTarget.baseChatId || requestedRawChatId || '').trim();

                if (!historyChatId) {
                    socket.emit('chat_history', {
                        chatId: requestedScopedChatId || requestedRawChatId,
                        requestedChatId: requestedRawChatId,
                        baseChatId: null,
                        scopeModuleId: scopeModuleId || null,
                        messages: []
                    });
                    return;
                }

                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'abrir historial', errorEvent: 'transport_info' })) {
                    const fallbackHistory = await getHistoryChatHistory(tenantId, {
                        chatId: historyChatId,
                        limit: 60,
                        scopeModuleId
                    });
                    socket.emit('chat_history', {
                        ...fallbackHistory,
                        chatId: requestedScopedChatId || fallbackHistory?.chatId || historyChatId,
                        requestedChatId: requestedRawChatId,
                        baseChatId: fallbackHistory?.chatId || historyChatId,
                        scopeModuleId: scopeModuleId || null
                    });
                    return;
                }

                let messages = [];
                try {
                    messages = await waClient.getMessages(historyChatId, 30);
                } catch (directErr) {
                    const requestedDigits = normalizePhoneDigits(historyChatId.split('@')[0] || '');
                    if (requestedDigits) {
                        const visibleChats = await getSortedVisibleChats({ forceRefresh: true });
                        const byPhone = visibleChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === requestedDigits);
                        if (byPhone?.id?._serialized) {
                            historyChatId = byPhone.id._serialized;
                            messages = await waClient.getMessages(historyChatId, 30);
                        } else {
                            throw directErr;
                        }
                    } else {
                        throw directErr;
                    }
                }

                const visible = messages.filter((m) => !isStatusOrSystemMessage(m));
                const outgoingIds = visible
                    .filter((m) => Boolean(m?.fromMe))
                    .map((m) => String(m?.id?._serialized || ''))
                    .filter(Boolean);
                const editableMap = outgoingIds.length > 0
                    ? await waClient.getMessagesEditability(outgoingIds)
                    : {};

                let historyMetaByMessageId = new Map();
                try {
                    const persistedRows = await messageHistoryService.listMessages(tenantId, { chatId: historyChatId, limit: 500 });
                    historyMetaByMessageId = new Map(
                        (Array.isArray(persistedRows) ? persistedRows : [])
                            .map((row) => {
                                const key = String(row?.messageId || '').trim();
                                if (!key) return null;
                                const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
                                return [key, {
                                    metadata,
                                    waModuleId: String(row?.waModuleId || '').trim().toLowerCase() || null,
                                    waPhoneNumber: String(row?.waPhoneNumber || '').trim() || null,
                                    orderPayload: row?.orderPayload && typeof row.orderPayload === 'object' ? row.orderPayload : null
                                }];
                            })
                            .filter(Boolean)
                    );
                } catch (_) { }

                const formattedAll = await Promise.all(visible.map(async (m) => {
                    const senderMeta = await resolveMessageSenderMeta(m);
                    const fileMeta = extractMessageFileMeta(m);
                    const messageId = String(m?.id?._serialized || '').trim();
                    const persistedEntry = historyMetaByMessageId.get(messageId) || null;
                    const persistedMeta = persistedEntry?.metadata || null;
                    const persistedModuleId = normalizeScopedModuleId(persistedEntry?.waModuleId || persistedMeta?.sentViaModuleId || '');
                    const pendingAgentMeta = m?.fromMe ? getOutgoingAgentMeta(messageId) : null;
                    const agentMeta = mergeAgentMeta(persistedMeta, pendingAgentMeta);
                    const resolvedMessageModuleId = normalizeScopedModuleId(
                        agentMeta?.sentViaModuleId
                        || persistedModuleId
                        || (m?.fromMe ? scopeModuleId : '')
                        || ''
                    ) || null;

                    return ({
                        id: m.id._serialized,
                        from: m.from,
                        to: m.to,
                        body: m.body,
                        timestamp: m.timestamp,
                        fromMe: m.fromMe,
                        hasMedia: m.hasMedia,
                        mediaData: null,
                        mimetype: null,
                        filename: fileMeta.filename,
                        fileSizeBytes: fileMeta.fileSizeBytes,
                        mediaUrl: fileMeta.mediaUrl || null,
                        mediaPath: fileMeta.mediaPath || null,
                        type: m.type,
                        author: m?.author || m?._data?.author || null,
                        notifyName: senderMeta.notifyName,
                        senderPhone: senderMeta.senderPhone,
                        senderId: senderMeta.senderId,
                        senderPushname: senderMeta.senderPushname,
                        isGroupMessage: senderMeta.isGroupMessage,
                        ack: Number.isFinite(Number(m.ack)) ? Number(m.ack) : 0,
                        edited: Boolean(m?._data?.latestEditMsgKey || m?._data?.latestEditSenderTimestampMs || m?._data?.edited),
                        editedAt: Number(m?._data?.latestEditSenderTimestampMs || 0) > 0 ? Math.floor(Number(m._data.latestEditSenderTimestampMs) / 1000) : null,
                        canEdit: Boolean(editableMap[String(m?.id?._serialized || '')]),
                        order: extractOrderInfo(m) || (persistedEntry?.orderPayload && typeof persistedEntry.orderPayload === 'object' ? persistedEntry.orderPayload : null),
                        location: extractLocationInfo(m),
                        quotedMessage: await extractQuotedMessageInfo(m),
                        reactions: Array.isArray(persistedMeta?.reactions) ? persistedMeta.reactions : [],
                        ...(agentMeta || {}),
                        sentViaModuleId: resolvedMessageModuleId,
                        sentViaModuleName: String(agentMeta?.sentViaModuleName || '').trim() || null,
                        sentViaModuleImageUrl: String(agentMeta?.sentViaModuleImageUrl || '').trim() || null,
                        sentViaTransport: String(agentMeta?.sentViaTransport || '').trim().toLowerCase() || null,
                        sentViaPhoneNumber: String(agentMeta?.sentViaPhoneNumber || persistedEntry?.waPhoneNumber || '').trim() || null,
                        sentViaChannelType: String(agentMeta?.sentViaChannelType || '').trim().toLowerCase() || null
                    });
                }));

                const formatted = scopeModuleId
                    ? (() => {
                        const scopedOnly = formattedAll.filter((entry) => {
                            const entryScope = normalizeScopedModuleId(entry?.sentViaModuleId || '');
                            return !entryScope || entryScope === scopeModuleId;
                        });
                        return scopedOnly;
                    })()
                    : formattedAll;

                const historyFallback = await getHistoryChatHistory(tenantId, {
                    chatId: historyChatId,
                    limit: 60,
                    scopeModuleId
                });
                const fallbackMessages = Array.isArray(historyFallback?.messages) ? historyFallback.messages : [];
                const useFallback = fallbackMessages.length > formatted.length;
                const selectedMessages = useFallback ? fallbackMessages : formatted;
                const selectedBaseChatId = useFallback
                    ? (historyFallback?.chatId || historyChatId)
                    : historyChatId;

                socket.emit('chat_history', {
                    chatId: requestedScopedChatId || selectedBaseChatId,
                    requestedChatId: requestedRawChatId,
                    baseChatId: selectedBaseChatId,
                    scopeModuleId: scopeModuleId || null,
                    messages: selectedMessages
                });

                // Avoid blocking chat open while media is downloaded/cached.
                visible
                    .filter((m) => m.hasMedia)
                    .slice(-12)
                    .forEach(async (m) => {
                        try {
                            const media = await mediaManager.processMessageMedia(m);
                            if (!media) return;
                            const mediaMeta = extractMessageFileMeta(m, media);
                            socket.emit('chat_media', {
                                chatId: requestedScopedChatId || historyChatId,
                                baseChatId: historyChatId,
                                scopeModuleId: scopeModuleId || null,
                                messageId: m.id._serialized,
                                mediaData: media.data,
                                mimetype: media.mimetype,
                                filename: mediaMeta.filename,
                                fileSizeBytes: mediaMeta.fileSizeBytes
                            });
                        } catch (mediaErr) { }
                    });
            } catch (e) {
                console.error('Error fetching history:', e);
                try {
                    const requestedRawChatId = String(chatId || '').trim();
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedTarget = resolveScopedChatTarget(requestedRawChatId, selectedScopeModuleId);
                    const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                    const fallbackHistory = await getHistoryChatHistory(tenantId, {
                        chatId: String(scopedTarget.baseChatId || requestedRawChatId || '').trim(),
                        limit: 60,
                        scopeModuleId
                    });
                    const requestedScopedChatId = scopedTarget.scopedChatId
                        || buildScopedChatId(String(scopedTarget.baseChatId || requestedRawChatId || '').trim(), scopeModuleId || '');
                    socket.emit('chat_history', {
                        ...fallbackHistory,
                        chatId: requestedScopedChatId || fallbackHistory?.chatId || scopedTarget.baseChatId || requestedRawChatId,
                        requestedChatId: requestedRawChatId,
                        baseChatId: fallbackHistory?.chatId || scopedTarget.baseChatId || requestedRawChatId,
                        scopeModuleId: scopeModuleId || null
                    });
                } catch (historyErr) {
                    socket.emit('chat_history', {
                        chatId: String(chatId || ''),
                        requestedChatId: String(chatId || ''),
                        baseChatId: String(resolveScopedChatTarget(String(chatId || ''), '').baseChatId || chatId || ''),
                        scopeModuleId: normalizeScopedModuleId(resolveScopedChatTarget(String(chatId || ''), '').moduleId || '') || null,
                        messages: [],
                        source: 'history_fallback'
                    });
                }
            }
        });
    };

    return {
        registerChatHistoryHandlers,
        getHistoryChatHistory,
        toHistoryMessagePayload
    };
}

module.exports = {
    createSocketChatHistoryMediaService
};
