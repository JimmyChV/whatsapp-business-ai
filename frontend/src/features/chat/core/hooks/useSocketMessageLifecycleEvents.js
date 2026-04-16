import { useEffect } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

export default function useSocketMessageLifecycleEvents({
    socket,
    activeChatIdRef,
    setMessages,
    repairMojibake,
    setEditingMessage,
    setChats,
    normalizeChatScopedId,
    chatIdsReferSameScope,
    setSendTemplateSubmitting,
    setSendTemplateOpen,
    setSelectedSendTemplate,
    setSelectedSendTemplatePreview,
    setSelectedSendTemplatePreviewError
}) {
    const { notify } = useUiFeedback();
    useEffect(() => {
        socket.on('message_edited', ({ chatId, messageId, body, edited, editedAt, canEdit }) => {
            const targetChatId = String(chatId || '');
            const active = String(activeChatIdRef.current || '');
            if (targetChatId && active && targetChatId !== active) return;

            setMessages((prev) => prev.map((m) => (
                String(m?.id || '') === String(messageId || '')
                    ? {
                        ...m,
                        body: repairMojibake(body || ''),
                        edited: edited !== false,
                        editedAt: Number(editedAt || 0) || Math.floor(Date.now() / 1000),
                        canEdit: typeof canEdit === 'boolean' ? canEdit : Boolean(m?.canEdit)
                    }
                    : m
            )));
            setEditingMessage((prev) => (prev && String(prev.id || '') === String(messageId || '') ? null : prev));
        });

        socket.on('edit_message_error', (msg) => {
            if (msg) notify({ type: 'error', message: msg });
        });

        socket.on('message_forwarded', () => {
            // El mensaje reenviado llega por el evento message cuando WhatsApp lo confirma.
        });

        socket.on('forward_message_error', (msg) => {
            if (msg) notify({ type: 'error', message: msg });
        });

        socket.on('message_deleted', ({ chatId, messageId }) => {
            const deletedId = String(messageId || '').trim();
            if (!deletedId) return;

            const incomingChatId = String(chatId || '');
            const active = String(activeChatIdRef.current || '');
            if (incomingChatId && active && incomingChatId !== active) return;

            setMessages((prev) => prev.map((m) => (
                String(m?.id || '') === deletedId
                    ? {
                        ...m,
                        type: 'revoked',
                        body: 'Mensaje eliminado',
                        hasMedia: false,
                        mediaData: null,
                        mimetype: null,
                        edited: false
                    }
                    : m
            )));
        });

        socket.on('delete_message_error', (msg) => {
            if (msg) notify({ type: 'error', message: msg });
        });

        socket.on('message_editability', ({ id, chatId, canEdit }) => {
            if (!id || typeof canEdit !== 'boolean') return;
            const active = String(activeChatIdRef.current || '');
            const incomingChatId = String(chatId || '');
            if (incomingChatId && active && incomingChatId !== active) return;
            setMessages((prev) => prev.map((m) => (
                m.id === id ? { ...m, canEdit } : m
            )));
        });

        socket.on('message_ack', ({ id, ack, chatId, baseChatId, scopeModuleId, canEdit }) => {
            setMessages((prev) => prev.map((m) => (
                m.id === id
                    ? { ...m, ack, canEdit: typeof canEdit === 'boolean' ? canEdit : m.canEdit }
                    : m
            )));

            const ackChatId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
            setChats((prev) => prev.map((c) => {
                const sameChat = ackChatId ? chatIdsReferSameScope(String(c?.id || ''), ackChatId) : false;
                if (!sameChat || !c.lastMessageFromMe) return c;
                return { ...c, ack };
            }));
        });

        socket.on('template_message_sent', ({ chatId, baseChatId, scopeModuleId, templateName }) => {
            const active = String(activeChatIdRef.current || '');
            const relatedChatId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
            if (relatedChatId && active && !chatIdsReferSameScope(relatedChatId, active)) return;

            setSendTemplateSubmitting?.(false);
            setSendTemplateOpen?.(false);
            setSelectedSendTemplate?.(null);
            setSelectedSendTemplatePreview?.(null);
            setSelectedSendTemplatePreviewError?.('');
            notify({ type: 'info', message: `Template enviado: ${String(templateName || 'template')}` });
        });

        socket.on('template_message_error', (msg) => {
            setSendTemplateSubmitting?.(false);
            if (typeof msg === 'string' && msg.trim()) {
                setSelectedSendTemplatePreviewError?.(msg);
                notify({ type: 'error', message: msg });
            }
        });

        return () => {
            [
                'message_edited',
                'edit_message_error',
                'message_forwarded',
                'forward_message_error',
                'message_deleted',
                'delete_message_error',
                'message_editability',
                'message_ack',
                'template_message_sent',
                'template_message_error'
            ].forEach((eventName) => socket.off(eventName));
        };
    }, []);
}
