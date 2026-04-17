const {
    getStorageDriver,
    queryPostgres,
    readTenantJsonFile
} = require('../../../config/persistence-runtime');
const { customerModuleContextsService: customerModuleContextsServiceFallback } = require('../../operations/services');

function createSocketWaEventsBridgeService({
    waClient,
    mediaManager,
    conversationOpsService,
    chatAssignmentRouterService,
    chatCommercialStatusService,
    chatOriginService,
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
    extractLocationInfo,
    customerModuleContextsService = customerModuleContextsServiceFallback
} = {}) {
    const extractPhoneCandidatesFromChatId = (chatId = '') => {
        const clean = String(chatId || '').trim();
        const base = clean.split('@')[0].trim();
        const digits = base.replace(/[^\d]/g, '');
        const out = [];
        if (digits) {
            out.push(`+${digits}`);
            out.push(digits);
        }
        return out;
    };

    const resolveCustomerIdFromChat = async (tenantId = '', chatId = '', scopeModuleId = '') => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanChatId = String(chatId || '').trim();
        const cleanScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
        if (!cleanTenantId || !cleanChatId) return null;

        if (getStorageDriver() === 'postgres') {
            try {
                const params = [cleanTenantId, cleanChatId];
                let scopeSql = '';
                if (cleanScopeModuleId) {
                    params.push(cleanScopeModuleId);
                    scopeSql = ` AND LOWER(COALESCE(module_id, '')) = LOWER($${params.length})`;
                }
                const eventResult = await queryPostgres(
                    `SELECT customer_id
                       FROM tenant_channel_events
                      WHERE tenant_id = $1
                        AND chat_id = $2
                        AND COALESCE(customer_id, '') <> ''${scopeSql}
                      ORDER BY created_at DESC
                      LIMIT 1`,
                    params
                );
                const eventCustomerId = String(eventResult?.rows?.[0]?.customer_id || '').trim();
                if (eventCustomerId) return eventCustomerId;

                const phoneCandidates = extractPhoneCandidatesFromChatId(cleanChatId);
                for (const phone of phoneCandidates) {
                    const customerParams = [cleanTenantId, phone];
                    let moduleSql = '';
                    if (cleanScopeModuleId) {
                        customerParams.push(cleanScopeModuleId);
                        moduleSql = ` AND LOWER(COALESCE(module_id, '')) = LOWER($${customerParams.length})`;
                    }
                    const customerResult = await queryPostgres(
                        `SELECT customer_id
                           FROM tenant_customers
                          WHERE tenant_id = $1
                            AND phone_e164 = $2${moduleSql}
                          ORDER BY updated_at DESC
                          LIMIT 1`,
                        customerParams
                    );
                    const customerId = String(customerResult?.rows?.[0]?.customer_id || '').trim();
                    if (customerId) return customerId;
                }
            } catch (_) {
                return null;
            }
            return null;
        }

        try {
            const store = await readTenantJsonFile('customers.json', {
                tenantId: cleanTenantId,
                defaultValue: { items: [] }
            });
            const items = Array.isArray(store?.items) ? store.items : [];
            const phoneCandidates = extractPhoneCandidatesFromChatId(cleanChatId);
            const matched = items.find((entry) => {
                const customerPhone = String(entry?.phoneE164 || entry?.phone_e164 || '').trim();
                const customerModuleId = String(entry?.moduleId || entry?.module_id || '').trim().toLowerCase();
                const moduleMatch = !cleanScopeModuleId || customerModuleId === cleanScopeModuleId;
                return moduleMatch && phoneCandidates.some((phone) => customerPhone === phone);
            });
            return String(matched?.customerId || matched?.customer_id || '').trim() || null;
        } catch (_) {
            return null;
        }
    };

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

        waClient.on('message', (msg) => {
            if (isStatusOrSystemMessage(msg)) return;

            const historyTenantId = resolveHistoryTenantId();
            const runtimeModuleContext = resolveHistoryModuleContext();
            const relatedChatIdBase = String(msg?.fromMe ? msg?.to : msg?.from || '').trim();
            const messageId = getSerializedMessageId(msg);
            const eventUnixTs = Number(msg?.timestamp || 0);
            const activityAtIso = eventUnixTs > 0
                ? new Date(eventUnixTs * 1000).toISOString()
                : new Date().toISOString();
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
            const order = extractOrderInfo(msg);
            const location = extractLocationInfo(msg);
            const referral = msg?.referral && typeof msg.referral === 'object' ? msg.referral : null;
            const hasReferral = Boolean(referral && Object.keys(referral).length > 0);
            const inboundMessagePayload = {
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
                mediaData: null,
                mimetype: null,
                filename: null,
                fileSizeBytes: null,
                mediaUrl: null,
                mediaPath: null,
                ack: msg?.ack,
                type: msg?.type,
                author: msg?.author || msg?._data?.author || null,
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: String(msg?.from || msg?.to || '').includes('@g.us'),
                canEdit: false,
                referral: referral || null,
                order,
                location,
                quotedMessage: null,
                sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || null,
                sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || null,
                sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || null,
                sentViaTransport: moduleAttributionMeta?.sentViaTransport || null,
                sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || null,
                sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                ...(agentMeta || {})
            };

            emitToRuntimeContext('message', inboundMessagePayload);

            setImmediate(async () => {
                try {
                    const processedMedia = await mediaManager.processMessageMedia(msg, {
                        tenantId: historyTenantId,
                        moduleId: scopeModuleId || '',
                        contactId: relatedChatIdBase,
                        timestampUnix: Number(msg?.timestamp || 0) || null
                    });
                    if (processedMedia) {
                        emitToRuntimeContext('message_updated', {
                            id: messageId,
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            mediaUrl: processedMedia?.publicUrl || processedMedia?.url || null,
                            mediaPath: processedMedia?.relativePath || null,
                            mimetype: processedMedia?.mimetype || null,
                            filename: processedMedia?.filename || null,
                            fileSizeBytes: processedMedia?.fileSizeBytes || null,
                            mediaData: processedMedia?.mediaData || processedMedia?.data || null,
                            hasMedia: true,
                            updatedAt: new Date().toISOString()
                        });
                    }
                    const senderMeta = await resolveMessageSenderMeta(msg);
                    const fileMeta = extractMessageFileMeta(msg, processedMedia);
                    const quotedMessage = await extractQuotedMessageInfo(msg);
                    if (quotedMessage) {
                        emitToRuntimeContext('message_updated', {
                            id: messageId,
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            quotedMessage,
                            updatedAt: new Date().toISOString()
                        });
                    }

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

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase && cleanScopeModuleId && customerModuleContextsService) {
                        try {
                            const customerId = await resolveCustomerIdFromChat(historyTenantId, relatedChatIdBase, cleanScopeModuleId);
                            if (customerId) {
                                const existingContext = await customerModuleContextsService.getContext(historyTenantId, {
                                    customerId,
                                    moduleId: cleanScopeModuleId
                                });
                                await customerModuleContextsService.upsertContext(historyTenantId, {
                                    customerId,
                                    moduleId: cleanScopeModuleId,
                                    firstInteractionAt: existingContext?.firstInteractionAt || activityAtIso,
                                    lastInteractionAt: activityAtIso,
                                    metadata: {
                                        dualWriteSource: 'socket_wa_events_bridge.inbound',
                                        lastInboundMessageId: messageId
                                    }
                                });
                            }
                        } catch (_) {
                            // silent: dual-write must not interrupt inbound flow
                        }
                    }

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase && chatOriginService && hasReferral) {
                        try {
                            await chatOriginService.upsertChatOrigin(historyTenantId, {
                                chatId: relatedChatIdBase,
                                scopeModuleId: cleanScopeModuleId,
                                originType: 'meta_ad',
                                referralSourceUrl: String(referral?.sourceUrl || referral?.source_url || '').trim() || null,
                                referralSourceType: String(referral?.sourceType || referral?.source_type || '').trim() || null,
                                referralSourceId: String(referral?.sourceId || referral?.source_id || '').trim() || null,
                                referralHeadline: String(referral?.headline || '').trim() || null,
                                ctwaClid: String(referral?.ctwaClid || referral?.ctwa_clid || '').trim() || null,
                                campaignId: null,
                                rawReferral: referral,
                                detectedAt: activityAtIso
                            });
                        } catch (_) {
                            // silent: inbound processing should not fail by origin attribution persistence issues
                        }
                    }

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase && chatCommercialStatusService) {
                        try {
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
                } catch (backgroundError) {
                    console.warn('[WA][InboundBridge] deferred processing warning:', String(backgroundError?.message || backgroundError));
                }
            });
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

        waClient.on('message_reaction', ({ messageId, emoji, senderId, chatId, timestamp }) => {
            const cleanMessageId = String(messageId || '').trim();
            const cleanEmoji = String(emoji || '').trim();
            if (!cleanMessageId || !cleanEmoji) return;

            const runtimeModuleContext = resolveHistoryModuleContext();
            const scopeModuleId = normalizeScopedModuleId(runtimeModuleContext?.moduleId || '');
            const baseChatId = String(chatId || '').trim();
            const scopedChatId = buildScopedChatId(baseChatId, scopeModuleId || '');

            emitToRuntimeContext('message_reaction', {
                messageId: cleanMessageId,
                emoji: cleanEmoji,
                senderId: String(senderId || '').trim() || null,
                chatId: scopedChatId || baseChatId || null,
                baseChatId: baseChatId || null,
                scopeModuleId: scopeModuleId || null,
                timestamp: Number(timestamp || 0) || Math.floor(Date.now() / 1000)
            });
        });
    };

    return {
        registerWaProviderEvents
    };
}

module.exports = {
    createSocketWaEventsBridgeService
};
