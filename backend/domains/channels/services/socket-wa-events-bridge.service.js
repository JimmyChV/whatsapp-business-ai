function createSocketWaEventsBridgeService({
    waClient,
    mediaManager,
    conversationOpsService,
    chatAssignmentRouterService,
    chatCommercialStatusService,
    emitToRuntimeContext,
    emitCommercialStatusUpdated,
    getWaCapabilities,
    getWaRuntime,
    resolveHistoryTenantId,
    resolveHistoryModuleContext,
    persistMessageHistory,
    persistMessageEdit,
    persistMessageAck,
    invalidateChatListCache,
    toChatSummary,
    emitMessageEditability,
    scheduleEditabilityRefresh,
    isStatusOrSystemMessage,
    isVisibleChatId,
    getSerializedMessageId,
    mergeAgentMeta,
    getOutgoingAgentMeta,
    buildEffectiveModuleContext,
    buildModuleAttributionMeta,
    normalizeScopedModuleId,
    buildScopedChatId,
    resolveMessageSenderMeta,
    extractMessageFileMeta,
    extractQuotedMessageInfo,
    extractOrderInfo,
    extractLocationInfo
} = {}) {
    const registerWaProviderEvents = () => {
        waClient.on('qr', (qr) => emitToRuntimeContext('qr', qr));
        waClient.on('ready', async () => {
            emitToRuntimeContext('ready', { message: 'WhatsApp Ready' });
            emitToRuntimeContext('wa_capabilities', getWaCapabilities());
            emitToRuntimeContext('wa_runtime', getWaRuntime());
        });
        waClient.on('authenticated', () => emitToRuntimeContext('authenticated'));
        waClient.on('auth_failure', (msg) => emitToRuntimeContext('auth_failure', msg));
        waClient.on('disconnected', (reason) => emitToRuntimeContext('disconnected', reason));

        waClient.on('message', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;

            const historyTenantId = resolveHistoryTenantId();
            const runtimeModuleContext = resolveHistoryModuleContext();
            const relatedChatIdBase = String(msg?.fromMe ? msg?.to : msg?.from || '').trim();
            const messageId = getSerializedMessageId(msg);
            const agentMeta = msg?.fromMe ? mergeAgentMeta(getOutgoingAgentMeta(messageId)) : null;
            const effectiveModuleContext = buildEffectiveModuleContext(runtimeModuleContext, agentMeta);
            const moduleAttributionMeta = buildModuleAttributionMeta(effectiveModuleContext);
            const scopeModuleId = normalizeScopedModuleId(
                effectiveModuleContext?.moduleId
                || moduleAttributionMeta?.sentViaModuleId
                || ''
            );
            const cleanScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
            const scopedChatId = buildScopedChatId(relatedChatIdBase, scopeModuleId || '');
            const media = await mediaManager.processMessageMedia(msg, {
                tenantId: historyTenantId,
                moduleId: scopeModuleId || '',
                contactId: relatedChatIdBase,
                timestampUnix: Number(msg?.timestamp || 0) || null
            });
            const senderMeta = await resolveMessageSenderMeta(msg);
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            const order = extractOrderInfo(msg);
            const location = extractLocationInfo(msg);
            await persistMessageHistory(historyTenantId, {
                msg,
                senderMeta,
                fileMeta,
                order,
                location,
                quotedMessage,
                agentMeta,
                moduleContext: effectiveModuleContext
            });

            if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase && chatCommercialStatusService) {
                try {
                    const eventUnixTs = Number(msg?.timestamp || 0);
                    const activityAtIso = eventUnixTs > 0
                        ? new Date(eventUnixTs * 1000).toISOString()
                        : new Date().toISOString();
                    const inboundResult = await chatCommercialStatusService.markInboundCustomerFirstContact(historyTenantId, {
                        chatId: relatedChatIdBase,
                        scopeModuleId: cleanScopeModuleId,
                        source: 'webhook',
                        reason: 'first_inbound_customer_message',
                        changedByUserId: null,
                        at: activityAtIso,
                        metadata: {
                            trigger: 'incoming_message',
                            messageId
                        }
                    });
                    if (inboundResult?.changed) {
                        emitCommercialStatusUpdated?.({
                            tenantId: historyTenantId,
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            result: inboundResult,
                            source: 'wa_events_bridge.inbound'
                        });
                    }
                } catch (_) {
                    // silent: inbound processing should not fail by commercial status lifecycle issues
                }
            }

            if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase) {
                try {
                    const eventUnixTs = Number(msg?.timestamp || 0);
                    const activityAtIso = eventUnixTs > 0
                        ? new Date(eventUnixTs * 1000).toISOString()
                        : new Date().toISOString();
                    const assignmentScopeModuleId = cleanScopeModuleId;

                    const touchedAssignment = await conversationOpsService.touchChatAssignmentActivity(historyTenantId, {
                        chatId: relatedChatIdBase,
                        scopeModuleId: assignmentScopeModuleId,
                        fromCustomer: true,
                        at: activityAtIso
                    });
                    const currentAssignment = touchedAssignment || await conversationOpsService.getChatAssignment(historyTenantId, {
                        chatId: relatedChatIdBase,
                        scopeModuleId: assignmentScopeModuleId
                    });

                    if (currentAssignment?.status === 'en_espera') {
                        const reactivationResult = await conversationOpsService.reactivateChatAssignmentOnCustomerReply(historyTenantId, {
                            chatId: relatedChatIdBase,
                            scopeModuleId: assignmentScopeModuleId,
                            at: activityAtIso,
                            metadata: {
                                trigger: 'incoming_message'
                            }
                        });

                        if (reactivationResult?.shouldAutoAssign) {
                            await chatAssignmentRouterService.autoAssignChat(historyTenantId, {
                                chatId: relatedChatIdBase,
                                scopeModuleId: assignmentScopeModuleId,
                                actorUserId: null,
                                trigger: 'customer_reply_after_waiting',
                                assignmentReason: 'customer_reply_after_waiting'
                            });
                        }
                    } else {
                        const hasAssignee = Boolean(String(currentAssignment?.assigneeUserId || '').trim());
                        const isActive = String(currentAssignment?.status || '').trim().toLowerCase() === 'active';
                        if (!hasAssignee || !isActive) {
                            await chatAssignmentRouterService.autoAssignChat(historyTenantId, {
                                chatId: relatedChatIdBase,
                                scopeModuleId: assignmentScopeModuleId,
                                actorUserId: null,
                                trigger: 'incoming_message_unassigned',
                                assignmentReason: 'incoming_message_unassigned'
                            });
                        }
                    }
                } catch (_) {
                    // silent: inbound processing should not fail by assignment lifecycle issues
                }
            }

            emitToRuntimeContext('message', {
                id: messageId,
                chatId: scopedChatId || relatedChatIdBase,
                baseChatId: relatedChatIdBase || null,
                scopeModuleId: scopeModuleId || null,
                from: String(msg?.from || '').trim() || null,
                to: String(msg?.fromMe ? (scopedChatId || msg?.to) : msg?.to || '').trim() || null,
                body: msg?.body,
                timestamp: msg?.timestamp,
                fromMe: msg?.fromMe,
                hasMedia: msg?.hasMedia,
                mediaData: media ? media.data : null,
                mimetype: media ? media.mimetype : null,
                filename: fileMeta.filename,
                fileSizeBytes: fileMeta.fileSizeBytes,
                mediaUrl: fileMeta.mediaUrl || null,
                mediaPath: fileMeta.mediaPath || null,
                ack: msg?.ack,
                type: msg?.type,
                author: msg?.author || msg?._data?.author || null,
                notifyName: senderMeta.notifyName,
                senderPhone: senderMeta.senderPhone,
                senderId: senderMeta.senderId,
                senderPushname: senderMeta.senderPushname,
                isGroupMessage: senderMeta.isGroupMessage,
                canEdit: false,
                order,
                location,
                quotedMessage,
                sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || null,
                sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || null,
                sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || null,
                sentViaTransport: moduleAttributionMeta?.sentViaTransport || null,
                sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || null,
                sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                ...(agentMeta || {})
            });

            try {
                if (isVisibleChatId(relatedChatIdBase)) {
                    invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatIdBase);
                    const summary = await toChatSummary(chat, {
                        includeHeavyMeta: false,
                        tenantId: historyTenantId,
                        scopeModuleId: String(effectiveModuleContext?.moduleId || '').trim().toLowerCase() || '',
                        scopeModuleName: String(effectiveModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(effectiveModuleContext?.imageUrl || effectiveModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(effectiveModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(effectiveModuleContext?.transportMode || '').trim().toLowerCase() || null
                    });
                    if (summary) emitToRuntimeContext('chat_updated', summary);
                }
            } catch (e) {
                // silent: message delivery should not fail by chat refresh issues
            }
        });

        waClient.on('message_sent', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;
            const historyTenantId = resolveHistoryTenantId();
            const runtimeModuleContext = resolveHistoryModuleContext();
            const relatedChatIdBase = String(msg?.to || msg?.from || '').trim();
            const messageId = getSerializedMessageId(msg);
            const agentMeta = msg?.fromMe ? mergeAgentMeta(getOutgoingAgentMeta(messageId)) : null;
            const effectiveModuleContext = buildEffectiveModuleContext(runtimeModuleContext, agentMeta);
            const moduleAttributionMeta = buildModuleAttributionMeta(effectiveModuleContext);
            const scopeModuleId = normalizeScopedModuleId(
                effectiveModuleContext?.moduleId
                || moduleAttributionMeta?.sentViaModuleId
                || ''
            );
            const cleanScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
            const scopedChatId = buildScopedChatId(relatedChatIdBase, scopeModuleId || '');
            const media = await mediaManager.processMessageMedia(msg, {
                tenantId: historyTenantId,
                moduleId: scopeModuleId || '',
                contactId: relatedChatIdBase,
                timestampUnix: Number(msg?.timestamp || 0) || null
            });
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            const order = extractOrderInfo(msg);
            const location = extractLocationInfo(msg);
            await persistMessageHistory(historyTenantId, {
                msg,
                senderMeta: null,
                fileMeta,
                order,
                location,
                quotedMessage,
                agentMeta,
                moduleContext: effectiveModuleContext
            });
            if (historyTenantId && relatedChatIdBase && chatCommercialStatusService) {
                try {
                    const eventUnixTs = Number(msg?.timestamp || 0);
                    const activityAtIso = eventUnixTs > 0
                        ? new Date(eventUnixTs * 1000).toISOString()
                        : new Date().toISOString();
                    const outboundResult = await chatCommercialStatusService.markFirstAgentReply(historyTenantId, {
                        chatId: relatedChatIdBase,
                        scopeModuleId: cleanScopeModuleId,
                        source: 'socket',
                        reason: 'first_outbound_agent_message',
                        changedByUserId: String(agentMeta?.sentByUserId || '').trim() || null,
                        at: activityAtIso,
                        metadata: {
                            trigger: 'message_sent',
                            messageId
                        }
                    });
                    if (outboundResult?.changed) {
                        emitCommercialStatusUpdated?.({
                            tenantId: historyTenantId,
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            result: outboundResult,
                            source: 'wa_events_bridge.message_sent'
                        });
                    }
                } catch (_) {
                    // silent: outbound processing should not fail by commercial status lifecycle issues
                }
            }
            emitToRuntimeContext('message', {
                id: messageId,
                chatId: scopedChatId || relatedChatIdBase,
                baseChatId: relatedChatIdBase || null,
                scopeModuleId: scopeModuleId || null,
                from: String(msg?.from || '').trim() || null,
                to: String(scopedChatId || msg?.to || '').trim() || null,
                body: msg?.body,
                timestamp: msg?.timestamp,
                fromMe: true,
                hasMedia: msg?.hasMedia,
                mediaData: media ? media.data : null,
                mimetype: media ? media.mimetype : null,
                filename: fileMeta.filename,
                fileSizeBytes: fileMeta.fileSizeBytes,
                mediaUrl: fileMeta.mediaUrl || null,
                mediaPath: fileMeta.mediaPath || null,
                ack: msg?.ack,
                type: msg?.type,
                author: msg?.author || msg?._data?.author || null,
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: String(msg?.to || msg?.from || '').includes('@g.us'),
                canEdit: false,
                order,
                location,
                quotedMessage,
                sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || null,
                sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || null,
                sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || null,
                sentViaTransport: moduleAttributionMeta?.sentViaTransport || null,
                sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || null,
                sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                ...(agentMeta || {})
            });

            if (messageId) {
                emitMessageEditability(messageId, scopedChatId || relatedChatIdBase);
                scheduleEditabilityRefresh(messageId, scopedChatId || relatedChatIdBase);
            }

            try {
                if (isVisibleChatId(relatedChatIdBase)) {
                    invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatIdBase);
                    const summary = await toChatSummary(chat, {
                        includeHeavyMeta: false,
                        tenantId: historyTenantId,
                        scopeModuleId: String(effectiveModuleContext?.moduleId || '').trim().toLowerCase() || '',
                        scopeModuleName: String(effectiveModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(effectiveModuleContext?.imageUrl || effectiveModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(effectiveModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(effectiveModuleContext?.transportMode || '').trim().toLowerCase() || null
                    });
                    if (summary) emitToRuntimeContext('chat_updated', summary);
                }
            } catch (e) { }
        });

        waClient.on('message_edit', async ({ message, newBody, prevBody }) => {
            if (!message || isStatusOrSystemMessage(message)) return;
            const chatId = message.fromMe ? message.to : message.from;

            const messageId = getSerializedMessageId(message);
            if (!messageId) return;

            let canEdit = false;
            try {
                canEdit = await waClient.canEditMessageById(messageId);
            } catch (e) { }

            const editedAtMs = Number(message?.latestEditSenderTimestampMs || message?._data?.latestEditSenderTimestampMs || 0);
            const editedAt = editedAtMs > 0 ? Math.floor(editedAtMs / 1000) : Math.floor(Date.now() / 1000);
            await persistMessageEdit(resolveHistoryTenantId(), {
                messageId,
                chatId,
                body: String(newBody ?? message.body ?? ''),
                editedAtUnix: editedAt
            });

            if (!isVisibleChatId(chatId)) return;

            emitToRuntimeContext('message_edited', {
                chatId,
                messageId,
                body: String(newBody ?? message.body ?? ''),
                prevBody: String(prevBody ?? ''),
                edited: true,
                editedAt,
                fromMe: Boolean(message.fromMe),
                canEdit
            });

            try {
                invalidateChatListCache();
                const refreshedChat = await waClient.client.getChatById(chatId);
                const runtimeModuleContext = resolveHistoryModuleContext();
                const summary = await toChatSummary(refreshedChat, {
                    includeHeavyMeta: false,
                    tenantId: resolveHistoryTenantId(),
                    scopeModuleId: String(runtimeModuleContext?.moduleId || '').trim().toLowerCase() || '',
                    scopeModuleName: String(runtimeModuleContext?.name || '').trim() || null,
                    scopeModuleImageUrl: String(runtimeModuleContext?.imageUrl || runtimeModuleContext?.logoUrl || '').trim() || null,
                    scopeChannelType: String(runtimeModuleContext?.channelType || '').trim().toLowerCase() || null,
                    scopeTransport: String(runtimeModuleContext?.transportMode || '').trim().toLowerCase() || null
                });
                if (summary) emitToRuntimeContext('chat_updated', summary);
            } catch (e) { }
        });

        waClient.on('message_ack', async ({ message, ack }) => {
            const messageId = getSerializedMessageId(message);
            const baseChatId = String(message?.to || message?.from || '').trim();
            const isFromMe = Boolean(message?.fromMe);
            const runtimeModuleContext = resolveHistoryModuleContext();
            const scopeModuleId = normalizeScopedModuleId(runtimeModuleContext?.moduleId || '');
            const scopedChatId = buildScopedChatId(baseChatId, scopeModuleId || '');
            await persistMessageAck(resolveHistoryTenantId(), {
                messageId,
                chatId: baseChatId,
                ack
            });

            let canEdit;
            if (isFromMe && messageId) {
                try {
                    canEdit = await waClient.canEditMessageById(messageId);
                } catch (e) { }
            }

            emitToRuntimeContext('message_ack', {
                id: messageId,
                chatId: scopedChatId || baseChatId,
                baseChatId: baseChatId || null,
                scopeModuleId: scopeModuleId || null,
                ack: ack,
                canEdit
            });

            if (isFromMe && messageId) {
                scheduleEditabilityRefresh(messageId, scopedChatId || baseChatId, [900, 2600]);
            }
        });
    };

    return {
        registerWaProviderEvents
    };
}

module.exports = {
    createSocketWaEventsBridgeService
};
