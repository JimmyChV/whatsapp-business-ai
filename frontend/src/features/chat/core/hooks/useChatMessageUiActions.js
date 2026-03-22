export default function useChatMessageUiActions({
  waCapabilities = {},
  removeAttachment,
  setQuickReplyDraft,
  setEditingMessage,
  setReplyingMessage,
  setInputText,
  setAttachment,
  setAttachmentPreview,
  sanitizeDisplayText,
  socket,
  activeChatIdRef
} = {}) {
  const handleEditMessage = (messageId, currentBody) => {
    if (!waCapabilities.messageEdit) {
      alert('La edicion de mensajes no esta disponible en esta sesion de WhatsApp.');
      return;
    }
    removeAttachment();
    setQuickReplyDraft(null);
    const cleanId = String(messageId || '').trim();
    if (!cleanId) return;
    const body = String(currentBody || '');
    setReplyingMessage(null);
    setEditingMessage({ id: cleanId, originalBody: body });
    setInputText(body);
  };

  const handleCancelEditMessage = () => {
    setEditingMessage(null);
    setInputText('');
  };

  const handleReplyMessage = (message = null) => {
    const cleanId = String(message?.id || '').trim();
    if (!cleanId) return;

    const bodyText = sanitizeDisplayText(message?.body || '');
    const hasMedia = Boolean(message?.hasMedia);
    const preview = bodyText || (hasMedia ? 'Adjunto' : 'Mensaje');

    setEditingMessage(null);
    setReplyingMessage({
      id: cleanId,
      body: preview,
      fromMe: Boolean(message?.fromMe),
      type: String(message?.type || 'chat')
    });
  };

  const handleCancelReplyMessage = () => {
    setReplyingMessage(null);
  };

  const handleForwardMessage = (messageId, toChatId) => {
    const sourceMessageId = String(messageId || '').trim();
    const targetChatId = String(toChatId || '').trim();
    if (!sourceMessageId || !targetChatId) return;
    socket.emit('forward_message', {
      messageId: sourceMessageId,
      toChatId: targetChatId
    });
  };

  const handleDeleteMessage = (payload = {}) => {
    const messageId = String(payload?.id || '').trim();
    const resolvedChatId = String(payload?.chatId || activeChatIdRef?.current || '').trim();
    if (!messageId || !resolvedChatId) return;

    const ok = window.confirm('Eliminar este mensaje? WhatsApp solo lo permite en algunos casos.');
    if (!ok) return;

    socket.emit('delete_message', {
      chatId: resolvedChatId,
      messageId
    });
  };

  const handleSendQuickReply = (quickReply = null, activeChatId, normalizeQuickReplyDraftFn) => {
    if (!waCapabilities.quickRepliesRead) return;
    const activeId = String(activeChatId || '').trim();
    if (!activeId) return;
    if (typeof normalizeQuickReplyDraftFn !== 'function') return;

    const draft = normalizeQuickReplyDraftFn(quickReply);
    if (!draft) return;

    setEditingMessage(null);
    setAttachment(null);
    setAttachmentPreview(null);
    setQuickReplyDraft(draft);
    setInputText(String(draft.text || '').trim());
  };

  return {
    handleEditMessage,
    handleCancelEditMessage,
    handleReplyMessage,
    handleCancelReplyMessage,
    handleForwardMessage,
    handleDeleteMessage,
    handleSendQuickReply
  };
}
