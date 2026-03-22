const AI_SOCKET_EVENTS = {
    HISTORY: 'ai_chat_history',
    HISTORY_REQUEST: 'get_ai_chat_history',
    CHUNK: 'internal_ai_chunk',
    COMPLETE: 'internal_ai_complete',
    ERROR: 'internal_ai_error',
    QUERY: 'internal_ai_query'
};

const canUseSocket = (socket) => Boolean(socket && typeof socket.emit === 'function');

export const emitAiHistoryRequest = (socket, payload = {}) => {
    if (!canUseSocket(socket)) return false;
    socket.emit(AI_SOCKET_EVENTS.HISTORY_REQUEST, payload);
    return true;
};

export const emitAiQuery = (socket, payload = {}) => {
    if (!canUseSocket(socket)) return false;
    socket.emit(AI_SOCKET_EVENTS.QUERY, payload);
    return true;
};

export const attachAiSocketListeners = (socket, handlers = {}) => {
    if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') {
        return () => {};
    }

    const listenerConfig = [
        [AI_SOCKET_EVENTS.HISTORY, handlers.onHistory],
        [AI_SOCKET_EVENTS.CHUNK, handlers.onChunk],
        [AI_SOCKET_EVENTS.COMPLETE, handlers.onComplete],
        [AI_SOCKET_EVENTS.ERROR, handlers.onError]
    ].filter(([, handler]) => typeof handler === 'function');

    listenerConfig.forEach(([eventName, handler]) => {
        socket.on(eventName, handler);
    });

    return () => {
        listenerConfig.forEach(([eventName, handler]) => {
            socket.off(eventName, handler);
        });
    };
};

export { AI_SOCKET_EVENTS };