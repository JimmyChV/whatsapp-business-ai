import { useEffect } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import { patchCachedMessages, replaceMessageByClientTempId, upsertMessageById } from '../helpers/messageCache.helpers';
import { mergeTemplateMessageContent } from '../helpers/templateMessages.helpers';

export default function useSocketMessageLifecycleEvents({
    socket,
    activeChatIdRef,
    messagesCacheRef,
    pendingOutgoingByChatRef,
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
        const ackToStatus = (ackValue) => {
            const ack = Number.isFinite(Number(ackValue)) ? Number(ackValue) : 0;
            if (ack === -1) return 'failed';
            if (ack >= 3) return 'read';
            if (ack >= 2) return 'delivered';
            if (ack >= 1) return 'sent';
            return 'sending';
        };
        const clearPendingOutgoing = (chatId, clientTempId) => {
            const safeChatId = String(chatId || '').trim();
            const safeClientTempId = String(clientTempId || '').trim();
            const pendingByChat = pendingOutgoingByChatRef?.current instanceof Map
                ? pendingOutgoingByChatRef.current.get(safeChatId)
                : null;
            if (!(pendingByChat instanceof Map) || !safeClientTempId) return;
            const entry = pendingByChat.get(safeClientTempId);
            if (entry?.timeoutId) clearTimeout(entry.timeoutId);
            pendingByChat.delete(safeClientTempId);
            if (pendingByChat.size === 0) pendingOutgoingByChatRef.current.delete(safeChatId);
        };
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
            const ackChatId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
            let resolvedClientTempId = '';
            setMessages((prev) => prev.map((m) => {
                if (m.id !== id) return m;
                resolvedClientTempId = String(m?.clientTempId || '').trim();
                return {
                    ...m,
                    ack,
                    status: ackToStatus(ack),
                    canEdit: typeof canEdit === 'boolean' ? canEdit : m.canEdit
                };
            }));
            const cachedMessages = patchCachedMessages(messagesCacheRef, ackChatId, (prev) => prev.map((m) => (
                m.id === id
                    ? {
                        ...m,
                        ack,
                        status: ackToStatus(ack),
                        canEdit: typeof canEdit === 'boolean' ? canEdit : m.canEdit
                    }
                    : m
            )));
            if (!resolvedClientTempId && Array.isArray(cachedMessages)) {
                const matched = cachedMessages.find((message) => String(message?.id || '').trim() === String(id || '').trim());
                resolvedClientTempId = String(matched?.clientTempId || '').trim();
            }
            if (resolvedClientTempId && ackChatId && ack >= 1) {
                clearPendingOutgoing(ackChatId, resolvedClientTempId);
            }
            setChats((prev) => prev.map((c) => {
                const sameChat = ackChatId ? chatIdsReferSameScope(String(c?.id || ''), ackChatId) : false;
                if (!sameChat || !c.lastMessageFromMe) return c;
                return { ...c, ack };
            }));
        });

        socket.on('template_message_sent', ({
            chatId,
            baseChatId,
            scopeModuleId,
            templateName,
            templateLanguage,
            previewText,
            templateComponents,
            clientTempId,
            messageId,
            timestamp
        }) => {
            const active = String(activeChatIdRef.current || '');
            const relatedChatId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
            if (relatedChatId && active && !chatIdsReferSameScope(relatedChatId, active)) return;

            const safeClientTempId = String(clientTempId || '').trim();
            const confirmedTemplateMessage = {
                id: String(messageId || safeClientTempId || `template_${Date.now().toString(36)}`).trim(),
                clientTempId: safeClientTempId || null,
                chatId: relatedChatId || null,
                baseChatId: String(baseChatId || '').trim() || null,
                scopeModuleId: String(scopeModuleId || '').trim() || null,
                fromMe: true,
                body: String(previewText || `Template: ${String(templateName || 'template')}`).trim(),
                timestamp: Number(timestamp || 0) || Math.floor(Date.now() / 1000),
                ack: 1,
                status: 'sent',
                optimistic: false,
                type: 'template',
                hasMedia: false,
                canEdit: false,
                templateName: String(templateName || '').trim() || null,
                templateLanguage: String(templateLanguage || '').trim() || null,
                templatePreviewText: String(previewText || '').trim() || null,
                templateComponents: Array.isArray(templateComponents) ? templateComponents : [],
                reactions: []
            };

            if (relatedChatId && safeClientTempId) {
                patchCachedMessages(messagesCacheRef, relatedChatId, (prev) => {
                    const existing = (Array.isArray(prev) ? prev : []).find((message) => String(message?.clientTempId || '').trim() === safeClientTempId);
                    return replaceMessageByClientTempId(prev, safeClientTempId, mergeTemplateMessageContent(existing, confirmedTemplateMessage));
                });
                if (active && chatIdsReferSameScope(relatedChatId, active)) {
                    setMessages((prev) => {
                        const existing = (Array.isArray(prev) ? prev : []).find((message) => String(message?.clientTempId || '').trim() === safeClientTempId);
                        return replaceMessageByClientTempId(prev, safeClientTempId, mergeTemplateMessageContent(existing, confirmedTemplateMessage));
                    });
                }
                clearPendingOutgoing(relatedChatId, safeClientTempId);
            } else if (relatedChatId) {
                patchCachedMessages(messagesCacheRef, relatedChatId, (prev) => {
                    const existing = (Array.isArray(prev) ? prev : []).find((message) => String(message?.id || '').trim() === String(confirmedTemplateMessage?.id || '').trim());
                    return upsertMessageById(prev, mergeTemplateMessageContent(existing, confirmedTemplateMessage));
                });
                if (active && chatIdsReferSameScope(relatedChatId, active)) {
                    setMessages((prev) => {
                        const existing = (Array.isArray(prev) ? prev : []).find((message) => String(message?.id || '').trim() === String(confirmedTemplateMessage?.id || '').trim());
                        return upsertMessageById(prev, mergeTemplateMessageContent(existing, confirmedTemplateMessage));
                    });
                }
            }

            setSendTemplateSubmitting?.(false);
            setSendTemplateOpen?.(false);
            setSelectedSendTemplate?.(null);
            setSelectedSendTemplatePreview?.(null);
            setSelectedSendTemplatePreviewError?.('');
            if (relatedChatId) {
                setChats((prev) => (Array.isArray(prev) ? prev : []).map((chat) => (
                    chatIdsReferSameScope(String(chat?.id || ''), relatedChatId)
                        ? {
                            ...chat,
                            lastMessage: String(previewText || `Template: ${String(templateName || 'template')}`).trim(),
                            lastMessageFromMe: true
                        }
                        : chat
                )));
            }
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
