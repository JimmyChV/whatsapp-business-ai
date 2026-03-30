import { useEffect } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

export default function useSocketAiAndSessionEvents({
    socket,
    setAiSuggestion,
    setIsAiLoading,
    setIsClientReady,
    setChats,
    setChatsLoaded,
    setChatsTotal,
    setChatsHasMore,
    chatPagingRef,
    setIsLoadingMoreChats,
    setMessages,
    setEditingMessage,
    setReplyingMessage,
    setActiveChatId
}) {
    const { notify } = useUiFeedback();
    useEffect(() => {
        socket.on('ai_suggestion_chunk', (chunk) => {
            setAiSuggestion((prev) => prev + chunk);
        });

        socket.on('ai_suggestion_complete', () => {
            setIsAiLoading(false);
        });

        socket.on('ai_error', (msg) => {
            setIsAiLoading(false);
            if (msg) notify({ type: 'error', message: msg });
        });

        socket.on('authenticated', () => {
            console.log('WhatsApp authenticated');
        });

        socket.on('auth_failure', (msg) => {
            notify({ type: 'error', message: 'Error de autenticacion. Por favor recarga la pagina y reconecta Cloud API.\n\nDetalle: ' + msg });
        });

        socket.on('disconnected', (reason) => {
            if (reason !== 'NAVIGATION') {
                setIsClientReady(false);
            }
        });

        socket.on('logout_done', () => {
            setIsClientReady(false);
            setChats([]);
            setChatsLoaded(false);
            setChatsTotal(0);
            setChatsHasMore(false);
            chatPagingRef.current = { offset: 0, hasMore: false, loading: false };
            setIsLoadingMoreChats(false);
            setMessages([]);
            setEditingMessage(null);
            setReplyingMessage(null);
            setActiveChatId(null);
            notify({ type: 'info', message: 'Sesion de WhatsApp cerrada. Vuelve a iniciar para reconectar Cloud API.' });
        });

        return () => {
            [
                'ai_suggestion_chunk',
                'ai_suggestion_complete',
                'ai_error',
                'authenticated',
                'auth_failure',
                'disconnected',
                'logout_done'
            ].forEach((eventName) => socket.off(eventName));
        };
    }, []);
}
