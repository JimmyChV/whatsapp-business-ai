import { useCallback } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import { buildTemplateResolvedPreview } from '../helpers/templateMessages.helpers';
import { getTemplateVariablesPreview, listApprovedIndividualTemplates } from '../services/templateMessages.service';
import { patchCachedMessages } from '../helpers/messageCache.helpers';

export default function useChatMessageActions({
  socket,
  activeChatId,
  activeChatIdRef,
  chatsRef,
  inputText,
  editingMessage,
  waCapabilities,
  attachment,
  quickReplyDraft,
  replyingMessage,
  requestAiSuggestion,
  normalizeDigits,
  normalizeQuickReplyDraft,
  buildApiHeaders,
  activeChatScopeModuleId,
  clientContact,
  prevMessagesMetaRef,
  suppressSmoothScrollUntilRef,
  messagesCacheRef,
  pendingOutgoingByChatRef,
  setActiveChatId,
  setMessages,
  setChats,
  setEditingMessage,
  setReplyingMessage,
  setShowClientProfile,
  setClientContact,
  setPendingOrderCartLoad,
  setQuickReplyDraft,
  setInputText,
  removeAttachment,
  setSendTemplateOpen,
  setSendTemplateOptions,
  setSendTemplateOptionsLoading,
  setSendTemplateOptionsError,
  selectedSendTemplate,
  setSelectedSendTemplate,
  setSelectedSendTemplatePreview,
  setSelectedSendTemplatePreviewLoading,
  setSelectedSendTemplatePreviewError,
  setSendTemplateSubmitting
} = {}) {
  const { notify } = useUiFeedback();

  const markOptimisticMessageStatus = useCallback((chatId, clientTempId, patch = {}) => {
    const safeChatId = String(chatId || '').trim();
    const safeClientTempId = String(clientTempId || '').trim();
    if (!safeChatId || !safeClientTempId) return;

    const applyPatch = (prev) => (Array.isArray(prev) ? prev : []).map((message) => (
      String(message?.clientTempId || '').trim() === safeClientTempId
        ? { ...message, ...patch }
        : message
    ));

    patchCachedMessages(messagesCacheRef, safeChatId, applyPatch);
    if (String(activeChatIdRef.current || '').trim() === safeChatId) {
      setMessages(applyPatch);
    }
  }, [activeChatIdRef, messagesCacheRef, setMessages]);

  const rememberPendingOutgoing = useCallback((chatId, clientTempId, retryPayload = {}) => {
    const safeChatId = String(chatId || '').trim();
    const safeClientTempId = String(clientTempId || '').trim();
    if (!safeChatId || !safeClientTempId) return;

    const currentMap = pendingOutgoingByChatRef?.current instanceof Map
      ? pendingOutgoingByChatRef.current
      : null;
    if (!currentMap) return;

    const existing = currentMap.get(safeChatId);
    const nextById = existing instanceof Map ? new Map(existing) : new Map();
    const previousEntry = nextById.get(safeClientTempId);
    if (previousEntry?.timeoutId) clearTimeout(previousEntry.timeoutId);

    const timeoutId = setTimeout(() => {
      markOptimisticMessageStatus(safeChatId, safeClientTempId, {
        status: 'failed',
        ack: -1,
        errorMessage: 'No se recibio confirmacion de envio. Puedes reintentar.'
      });
      const activePending = pendingOutgoingByChatRef?.current?.get?.(safeChatId);
      if (activePending instanceof Map) {
        activePending.delete(safeClientTempId);
        if (activePending.size === 0) pendingOutgoingByChatRef.current.delete(safeChatId);
      }
    }, 15000);

    nextById.set(safeClientTempId, {
      retryPayload,
      timeoutId,
      createdAt: Date.now()
    });
    currentMap.set(safeChatId, nextById);
  }, [markOptimisticMessageStatus, pendingOutgoingByChatRef]);

  const emitOutgoingRetryPayload = useCallback((payload = null) => {
    const safePayload = payload && typeof payload === 'object' ? payload : null;
    if (!safePayload || !socket || typeof socket.emit !== 'function') return false;
    const eventName = String(safePayload.eventName || '').trim();
    if (!eventName) return false;
    socket.emit(eventName, safePayload.payload || {});
    return true;
  }, [socket]);

  const insertOptimisticOutgoing = useCallback(({
    chatId,
    body = '',
    hasMedia = false,
    type = 'chat',
    mimetype = null,
    filename = null,
    mediaData = null,
    quotedMessage = null,
    retryPayload = null
  } = {}) => {
    const safeChatId = String(chatId || '').trim();
    if (!safeChatId) return null;

    const clientTempId = `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const optimisticMessage = {
      id: clientTempId,
      clientTempId,
      chatId: safeChatId,
      fromMe: true,
      body: String(body || ''),
      timestamp,
      ack: 0,
      type: String(type || (hasMedia ? 'media' : 'chat')).trim() || 'chat',
      status: 'sending',
      optimistic: true,
      hasMedia: Boolean(hasMedia),
      mimetype: mimetype || null,
      filename: filename || null,
      mediaData: mediaData || null,
      canEdit: false,
      quotedMessage: quotedMessage || null,
      reactions: [],
      retryPayload: retryPayload && typeof retryPayload === 'object' ? retryPayload : null
    };

    patchCachedMessages(messagesCacheRef, safeChatId, (prev) => [...(Array.isArray(prev) ? prev : []), optimisticMessage]);
    if (String(activeChatIdRef.current || '').trim() === safeChatId) {
      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), optimisticMessage]);
    }
    setChats?.((prev) => prev.map((chat) => (
      String(chat?.id || '').trim() === safeChatId
        ? {
          ...chat,
          lastMessage: hasMedia ? (String(body || '').trim() || 'Adjunto') : String(body || '').trim(),
          lastMessageFromMe: true,
          timestamp
        }
        : chat
    )));
    rememberPendingOutgoing(safeChatId, clientTempId, retryPayload);
    return optimisticMessage;
  }, [activeChatIdRef, messagesCacheRef, rememberPendingOutgoing, setChats, setMessages]);

  const buildQuotedMessagePayload = useCallback(() => {
    if (!replyingMessage?.id) return null;
    return {
      id: replyingMessage.id,
      body: String(replyingMessage?.body || '').trim(),
      fromMe: Boolean(replyingMessage?.fromMe),
      hasMedia: Boolean(replyingMessage?.hasMedia),
      type: String(replyingMessage?.type || 'chat')
    };
  }, [replyingMessage]);

  const resolveOptimisticMediaType = useCallback((mimetype = '', fileName = '') => {
    const safeMime = String(mimetype || '').trim().toLowerCase();
    const safeFileName = String(fileName || '').trim().toLowerCase();
    if (safeMime.startsWith('image/')) return 'image';
    if (safeMime.startsWith('video/')) return 'video';
    if (safeMime.startsWith('audio/')) return 'audio';
    if (safeMime === 'application/pdf') return 'document';
    if (safeMime || safeFileName) return 'document';
    return 'media';
  }, []);

  const handleExitActiveChat = useCallback(() => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    prevMessagesMetaRef.current = { count: 0, lastId: '' };
    suppressSmoothScrollUntilRef.current = 0;
    setMessages([]);
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    setPendingOrderCartLoad(null);
    setQuickReplyDraft(null);
    setSendTemplateOpen(false);
    setSendTemplateOptions([]);
    setSendTemplateOptionsLoading(false);
    setSendTemplateOptionsError('');
    setSelectedSendTemplate(null);
    setSelectedSendTemplatePreview(null);
    setSelectedSendTemplatePreviewLoading(false);
    setSelectedSendTemplatePreviewError('');
    setSendTemplateSubmitting(false);
    setInputText('');
    removeAttachment();
  }, [
    activeChatIdRef,
    prevMessagesMetaRef,
    suppressSmoothScrollUntilRef,
    setActiveChatId,
    setMessages,
    setEditingMessage,
    setReplyingMessage,
    setShowClientProfile,
    setClientContact,
    setPendingOrderCartLoad,
    setQuickReplyDraft,
    setSendTemplateOpen,
    setSendTemplateOptions,
    setSendTemplateOptionsLoading,
    setSendTemplateOptionsError,
    setSelectedSendTemplate,
    setSelectedSendTemplatePreview,
    setSelectedSendTemplatePreviewLoading,
    setSelectedSendTemplatePreviewError,
    setSendTemplateSubmitting,
    setInputText,
    removeAttachment
  ]);

  const handleCloseSendTemplate = useCallback(() => {
    setSendTemplateOpen(false);
    setSendTemplateOptionsError('');
    setSelectedSendTemplate(null);
    setSelectedSendTemplatePreview(null);
    setSelectedSendTemplatePreviewLoading(false);
    setSelectedSendTemplatePreviewError('');
    setSendTemplateSubmitting(false);
  }, [
    setSendTemplateOpen,
    setSendTemplateOptionsError,
    setSelectedSendTemplate,
    setSelectedSendTemplatePreview,
    setSelectedSendTemplatePreviewLoading,
    setSelectedSendTemplatePreviewError,
    setSendTemplateSubmitting
  ]);

  const handleRetryMessage = useCallback((message = null) => {
    const retryPayload = message?.retryPayload && typeof message.retryPayload === 'object'
      ? message.retryPayload
      : null;
    const clientTempId = String(message?.clientTempId || message?.id || '').trim();
    const chatId = String(message?.chatId || activeChatIdRef.current || '').trim();
    if (!retryPayload || !clientTempId || !chatId) return;

    markOptimisticMessageStatus(chatId, clientTempId, {
      status: 'sending',
      ack: 0,
      errorMessage: ''
    });
    rememberPendingOutgoing(chatId, clientTempId, retryPayload);
    emitOutgoingRetryPayload(retryPayload);
  }, [activeChatIdRef, emitOutgoingRetryPayload, markOptimisticMessageStatus, rememberPendingOutgoing]);

  const handleOpenSendTemplate = useCallback(async () => {
    const activeId = String(activeChatIdRef.current || activeChatId || '').trim();
    if (!activeId) return;

    setEditingMessage(null);
    setReplyingMessage(null);
    setQuickReplyDraft(null);
    removeAttachment();
    setSendTemplateOpen(true);
    setSendTemplateOptionsLoading(true);
    setSendTemplateOptionsError('');
    setSelectedSendTemplate(null);
    setSelectedSendTemplatePreview(null);
    setSelectedSendTemplatePreviewError('');

    try {
      const templates = await listApprovedIndividualTemplates(buildApiHeaders, {
        moduleId: String(activeChatScopeModuleId || '').trim().toLowerCase()
      });
      setSendTemplateOptions(templates);
      if (!Array.isArray(templates) || templates.length === 0) {
        notify({ type: 'info', message: 'No hay templates individuales aprobados para este chat.' });
      }
    } catch (error) {
      const message = String(error?.message || 'No se pudieron cargar templates.');
      setSendTemplateOptions([]);
      setSendTemplateOptionsError(message);
      notify({ type: 'error', message });
    } finally {
      setSendTemplateOptionsLoading(false);
    }
  }, [
    activeChatId,
    activeChatIdRef,
    activeChatScopeModuleId,
    buildApiHeaders,
    notify,
    removeAttachment,
    setEditingMessage,
    setReplyingMessage,
    setQuickReplyDraft,
    setSendTemplateOpen,
    setSendTemplateOptions,
    setSendTemplateOptionsError,
    setSendTemplateOptionsLoading,
    setSelectedSendTemplate,
    setSelectedSendTemplatePreview,
    setSelectedSendTemplatePreviewError
  ]);

  const handleSelectTemplatePreview = useCallback(async (template = null) => {
    const entry = template && typeof template === 'object' ? template : null;
    if (!entry) return;

    const activeId = String(activeChatIdRef.current || activeChatId || '').trim();
    const customerId = String(clientContact?.customerId || '').trim();

    setSelectedSendTemplate(entry);
    setSelectedSendTemplatePreview(null);
    setSelectedSendTemplatePreviewLoading(true);
    setSelectedSendTemplatePreviewError('');

    try {
      const previewPayload = await getTemplateVariablesPreview(buildApiHeaders, {
        chatId: activeId,
        customerId
      });
      const resolvedPreview = buildTemplateResolvedPreview(entry, previewPayload);
      setSelectedSendTemplatePreview({
        ...resolvedPreview,
        payload: previewPayload
      });
    } catch (error) {
      const message = String(error?.message || 'No se pudo resolver la preview del template.');
      setSelectedSendTemplatePreviewError(message);
      notify({ type: 'error', message });
    } finally {
      setSelectedSendTemplatePreviewLoading(false);
    }
  }, [
    activeChatId,
    activeChatIdRef,
    buildApiHeaders,
    clientContact?.customerId,
    notify,
    setSelectedSendTemplate,
    setSelectedSendTemplatePreview,
    setSelectedSendTemplatePreviewError,
    setSelectedSendTemplatePreviewLoading
  ]);

  const handleConfirmSendTemplate = useCallback(() => {
    const activeId = String(activeChatIdRef.current || activeChatId || '').trim();
    const template = selectedSendTemplate && typeof selectedSendTemplate === 'object' ? selectedSendTemplate : null;
    if (!activeId || !template || !socket || typeof socket.emit !== 'function') return;

    const activeChatForSend = chatsRef.current.find((chat) => String(chat?.id || '') === String(activeChatId || activeId));
    const activeChatPhone = normalizeDigits(activeChatForSend?.phone || '');
    const toPhone = activeChatPhone || null;

    setSendTemplateSubmitting(true);
    socket.emit('send_template_message', {
      to: activeId,
      toPhone,
      chatId: activeId,
      customerId: String(clientContact?.customerId || '').trim() || null,
      moduleId: String(activeChatScopeModuleId || '').trim() || null,
      templateId: String(template?.templateId || '').trim() || null,
      templateName: String(template?.templateName || '').trim(),
      templateLanguage: String(template?.templateLanguage || 'es').trim().toLowerCase() || 'es'
    });
  }, [
    activeChatId,
    activeChatIdRef,
    activeChatScopeModuleId,
    chatsRef,
    clientContact?.customerId,
    normalizeDigits,
    selectedSendTemplate,
    setSendTemplateSubmitting,
    socket
  ]);

  const handleSendReaction = useCallback((messageId, emoji) => {
    const activeId = String(activeChatIdRef.current || activeChatId || '').trim();
    const targetMessageId = String(messageId || '').trim();
    const safeEmoji = String(emoji || '').trim();
    if (!activeId || !targetMessageId || !safeEmoji || !socket || typeof socket.emit !== 'function') return;

    const activeChatForSend = chatsRef.current.find((chat) => String(chat?.id || '') === String(activeChatId || activeId));
    const activeChatPhone = normalizeDigits(activeChatForSend?.phone || '');
    const toPhone = activeChatPhone || null;

    socket.emit('send_reaction', {
      to: activeId,
      toPhone,
      messageId: targetMessageId,
      emoji: safeEmoji
    });
  }, [
    activeChatId,
    activeChatIdRef,
    chatsRef,
    normalizeDigits,
    socket
  ]);

  const handleSendMessage = useCallback((event) => {
    event?.preventDefault();
    const text = inputText.trim();

    if (editingMessage?.id) {
      if (!waCapabilities.messageEdit) {
        notify({ type: 'warn', message: 'La edicion de mensajes no esta disponible en esta sesion de WhatsApp.' });
        return;
      }
      if (attachment) {
        notify({ type: 'warn', message: 'No puedes adjuntar archivos mientras editas un mensaje.' });
        return;
      }
      if (!text) return;

      const original = String(editingMessage.originalBody || '').trim();
      if (text === original) {
        setEditingMessage(null);
        setInputText('');
        return;
      }

      const activeId = String(activeChatIdRef.current || '');
      if (!activeId) return;
      socket.emit('edit_message', { chatId: activeId, messageId: String(editingMessage.id), body: text });
      setEditingMessage(null);
      setInputText('');
      return;
    }

    if (!text && !attachment && !quickReplyDraft) return;

    if (text === '/ayudar') {
      requestAiSuggestion();
      setInputText('');
      return;
    }

    const quotedMessageId = String(replyingMessage?.id || '').trim() || null;
    const quotedMessage = buildQuotedMessagePayload();

    const activeChatForSend = chatsRef.current.find((chat) => String(chat?.id || '') === String(activeChatId || ''));
    const activeChatPhone = normalizeDigits(activeChatForSend?.phone || '');
    const toPhone = activeChatPhone || null;

    const draftQuickReply = normalizeQuickReplyDraft(quickReplyDraft);
    if (draftQuickReply && !attachment) {
      const outboundText = String(text || draftQuickReply.text || '').trim();
      const draftMediaAssets = Array.isArray(draftQuickReply.mediaAssets) ? draftQuickReply.mediaAssets : [];
      const primaryAsset = draftMediaAssets[0] || null;
      const primaryMimeType = String(draftQuickReply.mediaMimeType || primaryAsset?.mimeType || '').trim().toLowerCase();
      const primaryFileName = String(draftQuickReply.mediaFileName || primaryAsset?.fileName || '').trim();
      if (draftMediaAssets.length > 0) {
        insertOptimisticOutgoing({
          chatId: activeChatId,
          body: outboundText || primaryFileName || 'Adjunto',
          hasMedia: true,
          type: resolveOptimisticMediaType(primaryMimeType, primaryFileName),
          mimetype: primaryMimeType || null,
          filename: primaryFileName || null,
          quotedMessage,
          retryPayload: {
            eventName: 'send_quick_reply',
            payload: {
              quickReplyId: draftQuickReply.id || undefined,
              quickReply: {
                id: draftQuickReply.id || undefined,
                label: draftQuickReply.label || undefined,
                text: outboundText,
                mediaAssets: draftMediaAssets,
                mediaUrl: String(draftQuickReply.mediaUrl || primaryAsset?.url || '').trim() || null,
                mediaMimeType: primaryMimeType || null,
                mediaFileName: primaryFileName || null
              },
              to: activeChatId,
              toPhone,
              quotedMessageId
            }
          }
        });
      }
      socket.emit('send_quick_reply', {
        quickReplyId: draftQuickReply.id || undefined,
        quickReply: {
          id: draftQuickReply.id || undefined,
          label: draftQuickReply.label || undefined,
          text: outboundText,
          mediaAssets: draftMediaAssets,
          mediaUrl: String(draftQuickReply.mediaUrl || draftMediaAssets[0]?.url || '').trim() || null,
          mediaMimeType: String(draftQuickReply.mediaMimeType || draftMediaAssets[0]?.mimeType || '').trim().toLowerCase() || null,
          mediaFileName: String(draftQuickReply.mediaFileName || draftMediaAssets[0]?.fileName || '').trim() || null
        },
        to: activeChatId,
        toPhone,
        quotedMessageId
      });
      setQuickReplyDraft(null);
      setInputText('');
      setReplyingMessage(null);
      return;
    }

    if (attachment) {
      const sendPayload = {
        to: activeChatId,
        toPhone,
        body: inputText,
        mediaData: attachment.data,
        mimetype: attachment.mimetype,
        filename: attachment.filename,
        quotedMessageId
      };
      insertOptimisticOutgoing({
        chatId: activeChatId,
        body: String(inputText || '').trim() || String(attachment.filename || '').trim() || 'Adjunto',
        hasMedia: true,
        type: resolveOptimisticMediaType(attachment.mimetype, attachment.filename),
        mimetype: attachment.mimetype,
        filename: attachment.filename,
        mediaData: attachment.data,
        quotedMessage,
        retryPayload: {
          eventName: 'send_media_message',
          payload: sendPayload
        }
      });
      socket.emit('send_media_message', sendPayload);
      removeAttachment();
    } else {
      const sendPayload = { to: activeChatId, toPhone, body: inputText, quotedMessageId };
      insertOptimisticOutgoing({
        chatId: activeChatId,
        body: inputText,
        quotedMessage,
        retryPayload: {
          eventName: 'send_message',
          payload: sendPayload
        }
      });
      socket.emit('send_message', sendPayload);
    }
    setInputText('');
    setReplyingMessage(null);
  }, [
    activeChatId,
    activeChatIdRef,
    attachment,
    buildQuotedMessagePayload,
    chatsRef,
    editingMessage,
    inputText,
    insertOptimisticOutgoing,
    normalizeDigits,
    normalizeQuickReplyDraft,
    resolveOptimisticMediaType,
    quickReplyDraft,
    removeAttachment,
    replyingMessage,
    requestAiSuggestion,
    setEditingMessage,
    setInputText,
    setQuickReplyDraft,
    setReplyingMessage,
    socket,
    waCapabilities.messageEdit,
    notify
  ]);

  return {
    handleExitActiveChat,
    handleSendMessage,
    handleRetryMessage,
    handleSendReaction,
    handleOpenSendTemplate,
    handleCloseSendTemplate,
    handleSelectTemplatePreview,
    handleConfirmSendTemplate
  };
}
