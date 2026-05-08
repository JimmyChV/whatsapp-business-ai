const { queryPostgres } = require('../../../config/persistence-runtime');

function createSocketMessageDeliveryService({
    waClient,
    normalizeScopedModuleId,
    resolveScopedChatTarget,
    buildScopedChatId,
    parseScopedChatId,
    resolveCloudDestinationChatId,
    coerceHumanPhone,
    isVisibleChatId,
    isLidIdentifier,
    getSerializedMessageId,
    buildSocketAgentMeta,
    sanitizeAgentMeta,
    rememberOutgoingAgentMeta,
    buildModuleAttributionMeta
} = {}) {
    const registerMessageDeliveryHandlers = ({
        socket,
        io,
        tenantId = 'default',
        authContext,
        authzAudit,
        guardRateLimit,
        transportOrchestrator,
        resolveSocketModuleContext,
        getWaCapabilities,
        getWaRuntime,
        emitToRuntimeContext,
        persistMessageHistory,
        persistMessageReaction,
        invalidateChatListCache,
        toChatSummary,
        emitMessageEditability,
        recordConversationEvent,
        listMessages
    } = {}) => {
        const MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

        const enrichAuthContextWithUserName = async (rawAuthContext = null) => {
            const safeAuthContext = rawAuthContext && typeof rawAuthContext === 'object'
                ? rawAuthContext
                : null;
            if (!safeAuthContext) return safeAuthContext;

            const existingName = String(safeAuthContext?.name || '').trim();
            const existingDisplayName = String(safeAuthContext?.displayName || '').trim();
            const userId = String(safeAuthContext?.userId || '').trim();
            if ((existingName || existingDisplayName) || !userId) {
                return safeAuthContext;
            }

            try {
                const userRow = await queryPostgres(
                    'SELECT display_name, email FROM users WHERE user_id = $1 LIMIT 1',
                    [userId]
                );
                const user = userRow?.rows?.[0] || null;
                if (!user) return safeAuthContext;

                const resolvedDisplayName = String(user?.display_name || '').trim();
                const resolvedEmail = String(user?.email || '').trim();
                return {
                    ...safeAuthContext,
                    name: resolvedDisplayName || resolvedEmail || existingName || null,
                    displayName: resolvedDisplayName || existingDisplayName || null
                };
            } catch (e) {
                console.warn('[AGENT-META] could not enrich authContext name:', e?.message || e);
                return safeAuthContext;
            }
        };

        const hasOpenCustomerCareWindow = async (chatId = '') => {
            const safeChatId = String(chatId || '').trim();
            if (!safeChatId || typeof listMessages !== 'function') return false;
            try {
                const rows = await listMessages(tenantId, {
                    chatId: safeChatId,
                    limit: 100
                });
                const lastInbound = (Array.isArray(rows) ? rows : []).find((message) => message?.fromMe === false);
                const lastInboundTs = Number(lastInbound?.timestampUnix || 0) || 0;
                if (!lastInboundTs) return false;
                return ((lastInboundTs * 1000) + MESSAGE_WINDOW_MS) > Date.now();
            } catch (_) {
                return false;
            }
        };

         const emitRealtimeOutgoingMessage = async ({
             sentMessage = null,
             fallbackChatId = '',
             fallbackBody = '',
             clientTempId = '',
             quotedMessageId = '',
             quotedMessage = null,
             moduleContext = null,
             agentMeta = null,
             mediaPayload = null,
             orderPayload = null
         } = {}) => {
             const safeSentMessage = sentMessage && typeof sentMessage === 'object' ? sentMessage : {};
             const serializedMessageId = getSerializedMessageId(safeSentMessage);
             const messageId = serializedMessageId || ('local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9));
             const targetChatId = String(safeSentMessage?.to || fallbackChatId || '').trim();
             if (!targetChatId || !isVisibleChatId(targetChatId)) return;
               const timestamp = Number(safeSentMessage?.timestamp || 0) || Math.floor(Date.now() / 1000);
             const ack = Number.isFinite(Number(safeSentMessage?.ack)) ? Number(safeSentMessage.ack) : 0;
             const quotedId = String(quotedMessageId || '').trim();
             const mediaData = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.data || '').trim() : '';
             const mediaMimetype = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mimetype || '').trim() : '';
             const mediaFilename = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.filename || '').trim() : '';
             const mediaUrl = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mediaUrl || mediaPayload?.url || '').trim() : '';
             const mediaPath = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mediaPath || mediaPayload?.path || '').trim() : '';
             const mediaSizeBytesRaw = mediaPayload && typeof mediaPayload === 'object' ? Number(mediaPayload?.fileSizeBytes) : null;
             const mediaSizeBytes = Number.isFinite(mediaSizeBytesRaw) ? mediaSizeBytesRaw : null;
             const normalizedOrderPayload = orderPayload && typeof orderPayload === 'object' && !Array.isArray(orderPayload)
                 ? orderPayload
                 : null;
             const safeRawData = safeSentMessage?._data && typeof safeSentMessage._data === 'object'
                 ? safeSentMessage._data
                 : (safeSentMessage?.rawData && typeof safeSentMessage.rawData === 'object' ? safeSentMessage.rawData : {});
             const safeRawMetadata = safeRawData?.metadata && typeof safeRawData.metadata === 'object'
                 ? safeRawData.metadata
                 : {};
             const templateName = String(safeSentMessage?.templateName || safeRawData?.templateName || safeRawMetadata?.templateName || '').trim() || null;
             const templateLanguage = String(safeSentMessage?.templateLanguage || safeRawData?.templateLanguage || safeRawMetadata?.templateLanguage || '').trim() || null;
             const templatePreviewText = String(safeSentMessage?.templatePreviewText || safeRawMetadata?.previewText || safeRawMetadata?.templatePreviewText || '').trim() || null;
             const templateComponents = Array.isArray(safeSentMessage?.templateComponents)
                 ? safeSentMessage.templateComponents
                 : (Array.isArray(safeRawData?.templateComponents) ? safeRawData.templateComponents : []);
             const moduleAttributionMeta = buildModuleAttributionMeta(moduleContext);
             const moduleScopeId = normalizeScopedModuleId(
                 moduleContext?.moduleId
                 || moduleAttributionMeta?.sentViaModuleId
                 || agentMeta?.sentViaModuleId
                 || ''
             );
             const normalizedQuotedMessage = quotedMessage && typeof quotedMessage === 'object'
                 ? {
                     id: String(quotedMessage?.id || quotedId || '').trim() || null,
                     body: String(quotedMessage?.body || '').trim() || '',
                     fromMe: Boolean(quotedMessage?.fromMe),
                     hasMedia: Boolean(quotedMessage?.hasMedia),
                     type: String(quotedMessage?.type || 'chat').trim() || 'chat'
                 }
                 : null;
             const scopedTargetChatId = buildScopedChatId(targetChatId, moduleScopeId || '');
               const payload = {
                 id: messageId,
                 from: String(safeSentMessage?.from || '').trim() || null,
                 to: scopedTargetChatId || targetChatId,
                 chatId: scopedTargetChatId || targetChatId,
                 baseChatId: targetChatId,
                 scopeModuleId: moduleScopeId || null,
                 body: String(safeSentMessage?.body ?? fallbackBody ?? ''),
                 timestamp,
                 fromMe: true,
                 hasMedia: Boolean(mediaData || mediaUrl || safeSentMessage?.hasMedia),
                 mediaData: mediaData || null,
                 mimetype: mediaMimetype || null,
                 filename: mediaFilename || null,
                 mediaUrl: mediaUrl || null,
                 mediaPath: mediaPath || null,
                 fileSizeBytes: mediaSizeBytes,
                 ack,
                 type: String(safeSentMessage?.type || ((mediaData || mediaUrl) ? 'media' : 'chat')),
                 author: String(safeSentMessage?.author || safeSentMessage?._data?.author || '').trim() || null,
                 notifyName: null,
                 senderPhone: null,
                 senderId: null,
                 senderPushname: null,
                 isGroupMessage: String(targetChatId || '').endsWith('@g.us'),
                 canEdit: false,
                 order: normalizedOrderPayload,
                 location: null,
                quotedMessage: normalizedQuotedMessage || (quotedId ? { id: quotedId, body: '', fromMe: false, hasMedia: false, type: 'chat' } : null),
                 clientTempId: String(clientTempId || safeSentMessage?.clientTempId || '').trim() || null,
                 templateName,
                 templateLanguage,
                 templatePreviewText,
                 templateComponents,
                 ...(agentMeta || {}),
                 sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || String(agentMeta?.sentViaModuleId || '').trim() || null,
                 sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || String(agentMeta?.sentViaModuleName || '').trim() || null,
                 sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || String(agentMeta?.sentViaModuleImageUrl || '').trim() || null,
                 sentViaTransport: moduleAttributionMeta?.sentViaTransport || String(agentMeta?.sentViaTransport || '').trim().toLowerCase() || null,
                 sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || String(agentMeta?.sentViaPhoneNumber || '').trim() || null,
                 sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || String(agentMeta?.sentViaChannelType || '').trim().toLowerCase() || null
             };
               const persistedMessage = {
                 ...safeSentMessage,
                 id: safeSentMessage?.id || { _serialized: messageId },
                 fromMe: true,
                 to: targetChatId,
                 body: payload.body,
                 timestamp,
                 hasMedia: payload.hasMedia,
                 type: payload.type,
                 ack,
                 _data: {
                     ...safeRawData,
                     templateName,
                     templateLanguage,
                     templateComponents,
                     metadata: {
                         ...safeRawMetadata,
                         templateName,
                         templateLanguage,
                         previewText: templatePreviewText,
                         templatePreviewText
                     }
                 }
             };
             emitToRuntimeContext('message', payload);
               setImmediate(async () => {
                 try {
                     await persistMessageHistory(tenantId, {
                         msg: persistedMessage,
                         senderMeta: null,
                         fileMeta: {
                             mimetype: payload.mimetype,
                             filename: payload.filename,
                             fileSizeBytes: payload.fileSizeBytes,
                             mediaUrl: payload.mediaUrl,
                             mediaPath: payload.mediaPath
                         },
                         order: normalizedOrderPayload,
                         location: null,
                         quotedMessage: payload.quotedMessage,
                         agentMeta,
                         moduleContext
                     });
                 } catch (persistError) {
                     console.warn('[WA][PersistOutgoing] ' + String(persistError?.message || persistError || 'No se pudo persistir mensaje saliente.'));
                 }
             });
               setImmediate(async () => {
                 try {
                     invalidateChatListCache();
                     const chat = await waClient.client.getChatById(targetChatId);
                     const summary = await toChatSummary(chat, {
                         includeHeavyMeta: false,
                         tenantId,
                         scopeModuleId: String(moduleContext?.moduleId || '').trim().toLowerCase() || '',
                         scopeModuleName: String(moduleContext?.name || '').trim() || null,
                         scopeModuleImageUrl: String(moduleContext?.imageUrl || moduleContext?.logoUrl || '').trim() || null,
                         scopeChannelType: String(moduleContext?.channelType || '').trim().toLowerCase() || null,
                         scopeTransport: String(moduleContext?.transportMode || '').trim().toLowerCase() || null
                     });
                     if (summary) emitToRuntimeContext('chat_updated', summary);
                 } catch (_) { }
             });
         };
         const resolveScopedSendTarget = async ({ rawChatId = '', rawPhone = '', errorEvent = 'error', action = 'enviar mensajes' } = {}) => {
             const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
             const scopedTarget = resolveScopedChatTarget(String(rawChatId || '').trim(), selectedScopeModuleId);
             let scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
             let moduleContext = socket?.data?.waModule || null;
               if (scopeModuleId) {
                 const currentModuleId = normalizeScopedModuleId(moduleContext?.moduleId || socket?.data?.waModuleId || '');
                 if (!currentModuleId || currentModuleId !== scopeModuleId) {
                     const moduleContextPayload = await resolveSocketModuleContext(tenantId, authContext, scopeModuleId);
                     moduleContext = moduleContextPayload?.selected || null;
                     const resolvedModuleId = normalizeScopedModuleId(moduleContext?.moduleId || '');
                     if (!resolvedModuleId || resolvedModuleId !== scopeModuleId) {
                         socket.emit(errorEvent, 'No tienes acceso al modulo solicitado para ' + action + '.');
                         return { ok: false };
                     }
                     await transportOrchestrator.ensureTransportForSelectedModule(moduleContext);
                 }
             }
               if (!scopeModuleId) {
                 scopeModuleId = normalizeScopedModuleId(moduleContext?.moduleId || socket?.data?.waModuleId || '');
             }
               const runtime = getWaRuntime();
             const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
             const targetPhone = coerceHumanPhone(rawPhone || '');
             let targetChatId = String(scopedTarget.baseChatId || '').trim();
               if (activeTransport === 'cloud') {
                 const resolvedCloudChatId = resolveCloudDestinationChatId(targetChatId, targetPhone);
                 if (!resolvedCloudChatId) {
                     socket.emit(errorEvent, 'No se pudo resolver un numero WhatsApp valido para este chat en Cloud API. Abre chat por numero real.');
                     return { ok: false };
                 }
                 targetChatId = resolvedCloudChatId;
             }
               if (!targetChatId) {
                 socket.emit(errorEvent, 'Datos invalidos para ' + action + '.');
                 return { ok: false };
             }
               return {
                 ok: true,
                 activeTransport,
                 targetPhone,
                 targetChatId,
                 moduleContext,
                 scopeModuleId,
                 scopedChatId: buildScopedChatId(targetChatId, scopeModuleId || '')
             };
         };
        socket.on('send_message', async ({ to, toPhone, body, quotedMessageId, quotedMessage, clientTempId }) => {
             if (!guardRateLimit(socket, 'send_message')) return;
             if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar mensajes', errorEvent: 'error' })) return;
             try {
                 const text = String(body || '');
                 const quoted = String(quotedMessageId || '').trim();
                 if (!text.trim()) {
                     socket.emit('error', 'Datos invalidos para enviar mensaje.');
                     return;
                 }
                   const target = await resolveScopedSendTarget({
                     rawChatId: to,
                     rawPhone: toPhone,
                     errorEvent: 'error',
                     action: 'enviar mensajes'
                 });
                if (!target?.ok) return;
                  const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                const enrichedAuthContext = await enrichAuthContextWithUserName(authContext);
                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(enrichedAuthContext, moduleContext));
                let sentMessage = null;
                const hasOpenWindow = await hasOpenCustomerCareWindow(target.targetChatId);
                if (!hasOpenWindow) {
                    socket.emit('error', 'No puedes enviar mensajes libres a este contacto. La ventana de 24 horas ha expirado. Usa un template aprobado.');
                    return;
                }
                  if (quoted) {
                     let quotedTargetChatId = target.targetChatId;
                     try {
                         const quotedMsg = await waClient.getMessageById(quoted);
                         const fromQuoted = String(quotedMsg?.fromMe ? quotedMsg?.to : quotedMsg?.from || '').trim();
                         if (fromQuoted && isVisibleChatId(fromQuoted)) {
                             quotedTargetChatId = String(parseScopedChatId(fromQuoted).chatId || fromQuoted).trim();
                         }
                         if (target.activeTransport === 'cloud' && isLidIdentifier(quotedTargetChatId)) {
                             quotedTargetChatId = target.targetChatId;
                         }
                     } catch (resolveQuotedError) {
                     }
                       try {
                         sentMessage = await waClient.sendMessage(quotedTargetChatId, text, { quotedMessageId: quoted });
                     } catch (sendWithQuoteError) {
                         sentMessage = await waClient.replyToMessage(quotedTargetChatId, quoted, text);
                     }
                 } else {
                     sentMessage = await waClient.sendMessage(target.targetChatId, text);
                 }
                   const sentMessageId = getSerializedMessageId(sentMessage);
                 if (sentMessageId && agentMeta) {
                     rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                 }
                await emitRealtimeOutgoingMessage({
                    sentMessage: sentMessage && typeof sentMessage === 'object'
                        ? { ...sentMessage, clientTempId: String(clientTempId || '').trim() || null }
                        : sentMessage,
                    fallbackChatId: target.targetChatId,
                    fallbackBody: text,
                    clientTempId,
                    quotedMessageId: quoted,
                    quotedMessage,
                    moduleContext,
                    agentMeta,
                    mediaPayload: null
                });
                   await recordConversationEvent({
                     chatId: target.targetChatId,
                     scopeModuleId: target.scopeModuleId,
                     eventType: 'chat.message.outgoing.text',
                     eventSource: 'socket',
                     payload: {
                         messageId: sentMessageId || null,
                         quotedMessageId: quoted || null,
                         length: text.length,
                         hasQuote: Boolean(quoted)
                     }
                 });
             } catch (e) {
                 const detail = String(e?.message || e || 'Failed to send message.');
                 console.warn('[WA][SendMessage] ' + detail);
                 socket.emit('error', detail);
             }
         });
         socket.on('edit_message', async ({ chatId, messageId, body }) => {
             if (!guardRateLimit(socket, 'edit_message')) return;
             if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'edit_message_error', action: 'editar mensajes' })) return;
             if (!transportOrchestrator.ensureTransportReady(socket, { action: 'editar mensajes', errorEvent: 'edit_message_error' })) return;
             const caps = getWaCapabilities();
             if (!caps.messageEdit) {
                 socket.emit('edit_message_error', 'La edicion de mensajes no esta disponible en este transporte.');
                 return;
             }
             try {
                 const targetChatId = String(chatId || '').trim();
                 const targetMessageId = String(messageId || '').trim();
                 const nextBody = String(body || '').trim();
                   if (!targetChatId || !targetMessageId || !nextBody) {
                     socket.emit('edit_message_error', 'Datos invalidos para editar el mensaje.');
                     return;
                 }
                   const chat = await waClient.client.getChatById(targetChatId);
                 const candidates = await chat.fetchMessages({ limit: 150 });
                 const targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId);
                 if (!targetMessage) {
                     socket.emit('edit_message_error', 'No se encontro el mensaje para editar.');
                     return;
                 }
                   if (!targetMessage.fromMe) {
                     socket.emit('edit_message_error', 'Solo puedes editar mensajes enviados por ti.');
                     return;
                 }
                   if (typeof targetMessage.edit !== 'function') {
                     socket.emit('edit_message_error', 'Esta version de WhatsApp Web no permite editar mensajes por API.');
                     return;
                 }
                     const canEditNow = await waClient.canEditMessageById(targetMessageId);
                 if (!canEditNow) {
                     socket.emit('edit_message_error', 'WhatsApp no permite editar este mensaje (tipo o tiempo).');
                     return;
                 }
                   const editedMessage = await targetMessage.edit(nextBody);
                 if (!editedMessage) {
                     socket.emit('edit_message_error', 'WhatsApp no permitio editar el mensaje.');
                     return;
                 }
                   emitMessageEditability(targetMessageId, targetChatId);
                 await authzAudit.auditSocketAction('message.edited', {
                     resourceType: 'message',
                     resourceId: targetMessageId,
                     payload: { chatId: targetChatId }
                 });
             } catch (e) {
                 const detail = String(e?.message || '').toLowerCase();
                 if (detail.includes('revoke') || detail.includes('time') || detail.includes('edit')) {
                     socket.emit('edit_message_error', 'No se pudo editar: WhatsApp puede limitar la edicion por tiempo.');
                 } else {
                     socket.emit('edit_message_error', 'No se pudo editar el mensaje.');
                 }
             }
         });
         socket.on('send_media_message', async (data) => {
             if (!guardRateLimit(socket, 'send_media_message')) return;
             if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar adjuntos', errorEvent: 'error' })) return;
             try {
                const { to, toPhone, body, mediaData, mimetype, filename, isPtt, quotedMessageId, quotedMessage, clientTempId } = data || {};
                 if (isPtt) {
                     socket.emit('error', 'El envio de notas de voz esta deshabilitado temporalmente.');
                     return;
                 }
                   const caption = String(body || '');
                 const quoted = String(quotedMessageId || '').trim();
                 if (!String(mediaData || '').trim()) {
                     socket.emit('error', 'Datos invalidos para enviar adjunto.');
                     return;
                 }
                   const target = await resolveScopedSendTarget({
                     rawChatId: to,
                     rawPhone: toPhone,
                     errorEvent: 'error',
                     action: 'enviar adjuntos'
                 });
                if (!target?.ok) return;
                  const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                 const enrichedAuthContext = await enrichAuthContextWithUserName(authContext);
                 const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(enrichedAuthContext, moduleContext));
                 const sentMessage = await waClient.sendMedia(target.targetChatId, mediaData, mimetype, filename, caption, isPtt, quoted || null);
                 const sentMessageId = getSerializedMessageId(sentMessage);
                 if (sentMessageId && agentMeta) {
                     rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                 }
                await emitRealtimeOutgoingMessage({
                    sentMessage: sentMessage && typeof sentMessage === 'object'
                        ? { ...sentMessage, clientTempId: String(clientTempId || '').trim() || null }
                        : sentMessage,
                    fallbackChatId: target.targetChatId,
                    fallbackBody: caption,
                    clientTempId,
                    quotedMessageId: quoted,
                    quotedMessage,
                    moduleContext,
                    agentMeta,
                    mediaPayload: {
                         data: String(mediaData || ''),
                         mimetype: String(mimetype || '').trim() || null,
                         filename: String(filename || '').trim() || null,
                         fileSizeBytes: null
                     }
                 });
                 await recordConversationEvent({
                     chatId: target.targetChatId,
                     scopeModuleId: target.scopeModuleId,
                     eventType: 'chat.message.outgoing.media',
                     eventSource: 'socket',
                     payload: {
                         messageId: sentMessageId || null,
                         quotedMessageId: quoted || null,
                         mimetype: String(mimetype || '').trim() || null,
                         filename: String(filename || '').trim() || null,
                         hasCaption: Boolean(caption.trim())
                     }
                 });
             } catch (e) {
                 const detail = String(e?.message || e || 'Failed to send media.');
                 console.warn('[WA][SendMedia] ' + detail);
                 socket.emit('error', detail);
             }
         });
         socket.on('send_reaction', async ({ to, toPhone, messageId, emoji }) => {
             if (!guardRateLimit(socket, 'send_reaction')) return;
             if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar reacciones', errorEvent: 'error' })) return;
             try {
                 const targetMessageId = String(messageId || '').trim();
                 const safeEmoji = String(emoji || '').trim();
                 if (!targetMessageId || !safeEmoji) {
                     socket.emit('error', 'Datos invalidos para enviar reaccion.');
                     return;
                 }

                 const target = await resolveScopedSendTarget({
                     rawChatId: to,
                     rawPhone: toPhone,
                     errorEvent: 'error',
                     action: 'enviar reacciones'
                 });
                 if (!target?.ok) return;

                 await waClient.sendReaction(target.targetChatId, {
                     messageId: targetMessageId,
                     emoji: safeEmoji
                 });

                 socket.emit('reaction_sent', {
                     chatId: target.scopedChatId || target.targetChatId,
                     baseChatId: target.targetChatId,
                     scopeModuleId: target.scopeModuleId || null,
                     messageId: targetMessageId,
                     emoji: safeEmoji
                 });

                 await persistMessageReaction?.(tenantId, {
                     messageId: targetMessageId,
                     chatId: target.targetChatId,
                     emoji: safeEmoji,
                     senderId: String(authContext?.userId || authContext?.email || authContext?.name || 'self').trim() || 'self',
                     timestamp: Math.floor(Date.now() / 1000)
                 });

                 await recordConversationEvent({
                     chatId: target.targetChatId,
                     scopeModuleId: target.scopeModuleId,
                     eventType: 'chat.message.outgoing.reaction',
                     eventSource: 'socket',
                     payload: {
                         messageId: targetMessageId,
                         emoji: safeEmoji
                     }
                 });
             } catch (e) {
                 const detail = String(e?.message || e || 'Failed to send reaction.');
                 console.warn('[WA][SendReaction] ' + detail);
                 socket.emit('error', detail);
             }
         });
           socket.on('forward_message', async ({ messageId, toChatId }) => {
             if (!guardRateLimit(socket, 'forward_message')) return;
             if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'forward_message_error', action: 'reenviar mensajes' })) return;
             if (!transportOrchestrator.ensureTransportReady(socket, { action: 'reenviar mensajes', errorEvent: 'forward_message_error' })) return;
             const caps = getWaCapabilities();
             if (!caps.messageForward) {
                 socket.emit('forward_message_error', 'Reenviar mensajes no esta disponible en este transporte.');
                 return;
             }
             try {
                 const sourceMessageId = String(messageId || '').trim();
                 const targetChatId = String(toChatId || '').trim();
                 if (!sourceMessageId || !targetChatId) {
                     socket.emit('forward_message_error', 'Datos invalidos para reenviar.');
                     return;
                 }
                   await waClient.forwardMessage(sourceMessageId, targetChatId);
                 socket.emit('message_forwarded', {
                     messageId: sourceMessageId,
                     toChatId: targetChatId
                 });
                 await authzAudit.auditSocketAction('message.forwarded', {
                     resourceType: 'message',
                     resourceId: sourceMessageId,
                     payload: { toChatId: targetChatId }
                 });
             } catch (e) {
                 socket.emit('forward_message_error', 'No se pudo reenviar el mensaje en esta version de WhatsApp.');
             }
         });
           socket.on('delete_message', async ({ chatId, messageId }) => {
             if (!guardRateLimit(socket, 'delete_message')) return;
             if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'delete_message_error', action: 'eliminar mensajes' })) return;
             if (!transportOrchestrator.ensureTransportReady(socket, { action: 'eliminar mensajes', errorEvent: 'delete_message_error' })) return;
             const caps = getWaCapabilities();
             if (!caps.messageDelete) {
                 socket.emit('delete_message_error', 'Eliminar mensajes no esta disponible en este transporte.');
                 return;
             }
             try {
                 const targetMessageId = String(messageId || '').trim();
                 const incomingChatId = String(chatId || '').trim();
                 if (!targetMessageId) {
                     socket.emit('delete_message_error', 'Datos invalidos para eliminar mensaje.');
                     return;
                 }
                   let targetMessage = await waClient.getMessageById(targetMessageId);
                 if ((!targetMessage || typeof targetMessage.delete !== 'function')) {
                     const safeChatId = incomingChatId;
                     if (!safeChatId) {
                         if (!targetMessage) {
                             socket.emit('delete_message_error', 'No se encontro el chat del mensaje.');
                             return;
                         }
                     } else {
                         const chat = await waClient.client.getChatById(safeChatId);
                         const candidates = await chat.fetchMessages({ limit: 250 });
                         targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId) || targetMessage;
                     }
                 }
                   if (!targetMessage) {
                     socket.emit('delete_message_error', 'No se encontro el mensaje para eliminar.');
                     return;
                 }
                   if (typeof targetMessage.delete !== 'function') {
                     socket.emit('delete_message_error', 'Esta version no permite eliminar mensajes por API.');
                     return;
                 }
                   const targetChatId = String(incomingChatId || (targetMessage.fromMe ? targetMessage.to : targetMessage.from) || '').trim();
                 const attemptDeleteForEveryone = Boolean(targetMessage.fromMe);
                   try {
                     await targetMessage.delete(attemptDeleteForEveryone);
                 } catch (deleteErr) {
                     if (!attemptDeleteForEveryone) throw deleteErr;
                     // Fallback to local delete when revoke-for-everyone is no longer allowed.
                     await targetMessage.delete(false);
                 }
                   io.emit('message_deleted', {
                     chatId: targetChatId,
                     messageId: targetMessageId
                 });
                 await authzAudit.auditSocketAction('message.deleted', {
                     resourceType: 'message',
                     resourceId: targetMessageId,
                     payload: { chatId: targetChatId }
                 });
             } catch (e) {
                 socket.emit('delete_message_error', 'No se pudo eliminar el mensaje.');
             }
         });
                 return {
            resolveScopedSendTarget,
            emitRealtimeOutgoingMessage
        };
    };
                 return {
        registerMessageDeliveryHandlers
    };
}

module.exports = {
    createSocketMessageDeliveryService
};

