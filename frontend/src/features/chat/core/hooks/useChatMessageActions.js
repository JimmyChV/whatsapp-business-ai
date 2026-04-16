import { useCallback } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import { buildTemplateResolvedPreview } from '../helpers/templateMessages.helpers';
import { getTemplateVariablesPreview, listApprovedIndividualTemplates } from '../services/templateMessages.service';

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
  setActiveChatId,
  setMessages,
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
    handleSendMessage,
    handleOpenSendTemplate,
    handleCloseSendTemplate,
    handleSelectTemplatePreview,
    handleConfirmSendTemplate
  };
}
