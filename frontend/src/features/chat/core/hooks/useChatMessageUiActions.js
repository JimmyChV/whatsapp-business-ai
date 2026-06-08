import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

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
  const { confirm, notify } = useUiFeedback();
    const handleEditMessage = (messageId, currentBody) => {
    if (!waCapabilities.messageEdit) {
      notify({ type: 'warn', message: 'La edicion de mensajes no esta disponible en esta sesion de WhatsApp.' });
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

  const handleForwardMessage = (messageIds, targetChatIds) => {
    if (!waCapabilities.messageForward) return;
    const sourceMessageIds = (Array.isArray(messageIds) ? messageIds : [messageIds])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    const targetIds = (Array.isArray(targetChatIds) ? targetChatIds : [targetChatIds])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    if (sourceMessageIds.length === 0 || targetIds.length === 0) return;
    socket.emit('forward_message', {
      messageIds: sourceMessageIds,
      targetChatIds: targetIds
    });
  };

  const handleDeleteMessage = async (payload = {}) => {
    if (!waCapabilities.messageDelete) return;
    const messageId = String(payload?.id || '').trim();
    const resolvedChatId = String(payload?.chatId || activeChatIdRef?.current || '').trim();
    if (!messageId || !resolvedChatId) return;

    const ok = await confirm({
      title: 'Eliminar mensaje',
      message: 'WhatsApp solo permite eliminar en algunos casos.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      tone: 'danger'
    });
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
