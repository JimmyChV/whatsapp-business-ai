const templateVariablesService = require('../../operations/services/template-variables.service');
const {
    executeMessageSequence,
    normalizeSequencePayload
} = require('../../operations/services/message-sequence.service');

function createSocketQuickRepliesService({
    waClient,
    listQuickReplies,
    normalizeScopedModuleId,
    resolveSocketModuleContext,
    getSerializedMessageId,
    sanitizeAgentMeta,
    buildSocketAgentMeta,
    rememberOutgoingAgentMeta
} = {}) {
    const resolveQuickReplyVariableMap = async ({
        tenantId,
        chatId,
        customerId = ''
    } = {}) => {
        try {
            const previewPayload = await templateVariablesService.getPreview(tenantId, {
                chatId,
                customerId
            });
            const variables = (Array.isArray(previewPayload?.categories) ? previewPayload.categories : [])
                .flatMap((category) => (Array.isArray(category?.variables) ? category.variables : []));
            return variables.reduce((acc, variable) => {
                const key = String(variable?.key || '').trim();
                if (!key) return acc;
                acc[key] = variable?.previewValue ?? '';
                acc[key.toLowerCase()] = variable?.previewValue ?? '';
                return acc;
            }, {});
        } catch (error) {
            console.warn('[quick-replies] could not resolve variables map:', error?.message);
            return {};
        }
    };

    const buildSyntheticInteractiveSentMessage = ({
        messageId,
        chatId,
        body,
        interactive,
        quotedMessageId = '',
        metadata = null
    } = {}) => {
        const safeMessageId = String(messageId || '').trim();
        if (!safeMessageId) return null;
        const safeChatId = String(chatId || '').trim();
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
            quotedMessageId: String(quotedMessageId || '').trim() || null,
            timestamp: Math.floor(Date.now() / 1000),
            hasMedia: false,
            rawData: { interactive, metadata: metadata && typeof metadata === 'object' ? metadata : null },
            _data: { interactive, metadata: metadata && typeof metadata === 'object' ? metadata : null }
        };
    };

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

    const resolveSentInteractiveId = (sentInteractive) => (
        getSerializedMessageId(sentInteractive)
        || String(sentInteractive?.messages?.[0]?.id || sentInteractive?.message_id || (typeof sentInteractive === 'string' ? sentInteractive : '')).trim()
    );

    const registerQuickReplyHandlers = ({
        socket,
        tenantId = 'default',
        authContext,
        guardRateLimit,
        transportOrchestrator,
        isFeatureEnabledForTenant,
        resolveScopedSendTarget,
        emitRealtimeOutgoingMessage
    } = {}) => {
        const ensurePayloadModuleTransport = async (payload = {}, errorEvent = 'error', action = 'enviar respuestas rapidas') => {
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
            if (!(await ensurePayloadModuleTransport(payload, 'error', 'enviar respuestas rapidas'))) return;
            if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar respuestas rapidas', errorEvent: 'error' })) return;
            try {
                const quickRepliesEnabled = await isFeatureEnabledForTenant(tenantId, 'quickReplies');
                if (!quickRepliesEnabled) {
                    socket.emit('error', 'Respuestas rapidas deshabilitadas para esta empresa o plan.');
                    return;
                }

                const quoted = String(payload?.quotedMessageId || '').trim();
                const clientTempId = String(payload?.clientTempId || '').trim();
                const quotedMessage = payload?.quotedMessage && typeof payload.quotedMessage === 'object'
                    ? payload.quotedMessage
                    : null;
                const target = await resolveScopedSendTarget({
                    rawChatId: payload?.to,
                    rawPhone: payload?.toPhone,
                    errorEvent: 'error',
                    action: 'enviar respuestas rapidas'
                });
                if (!target?.ok) return;

                const moduleId = normalizeScopedModuleId(target.scopeModuleId || socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const quickReplyId = String(payload?.quickReplyId || payload?.id || '').trim();
                const inlineQuickReply = payload?.quickReply && typeof payload.quickReply === 'object'
                    ? payload.quickReply
                    : null;

                let replyPayload = null;
                if (quickReplyId) {
                    const scopedReplies = await listQuickReplies({ tenantId, moduleId });
                    replyPayload = (Array.isArray(scopedReplies) ? scopedReplies : [])
                        .find((entry) => String(entry?.id || '').trim() === quickReplyId) || null;
                }

                if (replyPayload && inlineQuickReply) {
                    replyPayload = {
                        ...replyPayload,
                        ...inlineQuickReply,
                        id: replyPayload.id || inlineQuickReply.id,
                        itemId: replyPayload.itemId || inlineQuickReply.itemId,
                        label: inlineQuickReply.label || replyPayload.label,
                        metadata: {
                            ...(replyPayload.metadata && typeof replyPayload.metadata === 'object' && !Array.isArray(replyPayload.metadata)
                                ? replyPayload.metadata
                                : {}),
                            ...(inlineQuickReply.metadata && typeof inlineQuickReply.metadata === 'object' && !Array.isArray(inlineQuickReply.metadata)
                                ? inlineQuickReply.metadata
                                : {})
                        }
                    };
                } else if (!replyPayload && inlineQuickReply) {
                    replyPayload = inlineQuickReply;
                }

                if (!replyPayload) {
                    socket.emit('error', 'Respuesta rapida no encontrada para este modulo.');
                    return;
                }

                const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                const baseSendMetadata = {
                    tenantId,
                    chatId: target.targetChatId
                };
                const sequencePayload = normalizeSequencePayload(replyPayload);
                const sequenceBlocks = sequencePayload.messageBlocks;
                if (sequencePayload.hasContent && sequenceBlocks.length > 0) {
                    let firstRealtimeEmitted = false;
                    const variables = await resolveQuickReplyVariableMap({
                        tenantId,
                        chatId: target.scopedChatId || target.targetChatId,
                        customerId: payload?.customerId || payload?.customer_id || ''
                    });
                    const result = await executeMessageSequence({
                        tenantId,
                        chatId: target.targetChatId,
                        scopeModuleId: moduleId,
                        blocks: sequenceBlocks,
                        waClient,
                        variables,
                        metadata: {
                            ...baseSendMetadata,
                            quickReplyId: quickReplyId || replyPayload?.id || null,
                            quickReplyLabel: replyPayload?.label || null
                        },
                        quotedMessageId: quoted,
                        quotedMessage,
                        minDelayBetweenSendBlocksSeconds: 1,
                        maxDelaySeconds: 30,
                        logger: console,
                        onSentMessage: async ({
                            sentMessage,
                            fallbackBody = '',
                            quotedMessageId = '',
                            quotedMessage: sentQuotedMessage = null,
                            mediaPayload = null,
                            interactive = null
                        } = {}) => {
                            let realtimeSentMessage = sentMessage;
                            if (clientTempId && !firstRealtimeEmitted && realtimeSentMessage && typeof realtimeSentMessage === 'object') {
                                realtimeSentMessage.clientTempId = clientTempId;
                            }
                            if (interactive && (!realtimeSentMessage || typeof realtimeSentMessage !== 'object')) {
                                realtimeSentMessage = buildSyntheticInteractiveSentMessage({
                                    messageId: resolveSentInteractiveId(sentMessage),
                                    chatId: target.targetChatId,
                                    body: fallbackBody,
                                    interactive,
                                    quotedMessageId,
                                    metadata: baseSendMetadata
                                });
                                if (clientTempId && !firstRealtimeEmitted && realtimeSentMessage && typeof realtimeSentMessage === 'object') {
                                    realtimeSentMessage.clientTempId = clientTempId;
                                }
                            }
                            const sentMessageId = getSerializedMessageId(realtimeSentMessage) || resolveSentInteractiveId(realtimeSentMessage);
                            if (sentMessageId && agentMeta) rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                            await emitRealtimeOutgoingMessage({
                                sentMessage: realtimeSentMessage,
                                fallbackChatId: target.targetChatId,
                                fallbackBody,
                                quotedMessageId,
                                quotedMessage: sentQuotedMessage,
                                moduleContext,
                                agentMeta,
                                mediaPayload
                            });
                            firstRealtimeEmitted = true;
                        }
                    });

                    socket.emit('quick_reply_sent', {
                        ...buildQuickReplySentPayload({
                            replyPayload,
                            quickReplyId,
                            target
                        }),
                        sentBlocks: result.sentBlocks,
                        sentMessageIds: result.sentMessageIds
                    });
                    return;
                }

                socket.emit('error', 'La respuesta rapida no tiene contenido para enviar.');
                return;
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
