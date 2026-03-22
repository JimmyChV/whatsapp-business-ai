import { useEffect } from 'react';

export default function useSocketAiAndSessionEvents({
    socket,
    setAiSuggestion,
    setIsAiLoading,
    setIsClientReady,
    setQrCode,
    setChats,
    setChatsTotal,
    setChatsHasMore,
    chatPagingRef,
    setIsLoadingMoreChats,
    setMessages,
    setEditingMessage,
    setReplyingMessage,
    setActiveChatId
}) {
    useEffect(() => {
        socket.on('ai_suggestion_chunk', (chunk) => {
            setAiSuggestion((prev) => prev + chunk);
        });

        socket.on('ai_suggestion_complete', () => {
            setIsAiLoading(false);
        });

        socket.on('ai_error', (msg) => {
            setIsAiLoading(false);
            if (msg) alert(msg);
        });

        socket.on('authenticated', () => {
            console.log('WhatsApp authenticated');
        });

        socket.on('auth_failure', (msg) => {
            alert('Error de autenticacion. Por favor recarga la pagina y escanea de nuevo.\n\nDetalle: ' + msg);
        });

        socket.on('disconnected', (reason) => {
            if (reason !== 'NAVIGATION') {
                setIsClientReady(false);
                setQrCode('');
            }
        });

        socket.on('logout_done', () => {
            setIsClientReady(false);
            setQrCode('');
            setChats([]);
            setChatsTotal(0);
            setChatsHasMore(false);
            chatPagingRef.current = { offset: 0, hasMore: false, loading: false };
            setIsLoadingMoreChats(false);
            setMessages([]);
            setEditingMessage(null);
            setReplyingMessage(null);
            setActiveChatId(null);
            alert('Sesion de WhatsApp cerrada. Vuelve a iniciar para reconectar Cloud API.');
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
