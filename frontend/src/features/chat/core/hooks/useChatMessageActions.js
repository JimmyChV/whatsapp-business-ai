import { useCallback } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

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
  setInputText,
  removeAttachment
} = {}) {
  const { notify } = useUiFeedback();
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
    setInputText,
    removeAttachment
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

    const activeChatForSend = chatsRef.current.find((chat) => String(chat?.id || '') === String(activeChatId || ''));
    const activeChatPhone = normalizeDigits(activeChatForSend?.phone || '');
    const toPhone = activeChatPhone || null;

    const draftQuickReply = normalizeQuickReplyDraft(quickReplyDraft);
    if (draftQuickReply && !attachment) {
      const outboundText = String(text || draftQuickReply.text || '').trim();
      const draftMediaAssets = Array.isArray(draftQuickReply.mediaAssets) ? draftQuickReply.mediaAssets : [];
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
      socket.emit('send_media_message', {
        to: activeChatId,
        toPhone,
        body: inputText,
        mediaData: attachment.data,
        mimetype: attachment.mimetype,
        filename: attachment.filename,
        quotedMessageId
      });
      removeAttachment();
    } else {
      socket.emit('send_message', { to: activeChatId, toPhone, body: inputText, quotedMessageId });
    }
    setInputText('');
    setReplyingMessage(null);
  }, [
    activeChatId,
    activeChatIdRef,
    attachment,
    chatsRef,
    editingMessage,
    inputText,
    normalizeDigits,
    normalizeQuickReplyDraft,
    quickReplyDraft,
    removeAttachment,
    replyingMessage,
    requestAiSuggestion,
    setEditingMessage,
    setInputText,
    setQuickReplyDraft,
    setReplyingMessage,
    socket,
    waCapabilities.messageEdit
  ]);

  return {
    handleExitActiveChat,
    handleSendMessage
  };
}
