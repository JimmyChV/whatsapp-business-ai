import { useCallback } from 'react';

const perfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.round(performance.now());
  }
  return Date.now();
};

export default function useChatPaginationRequester({
  socket,
  chatPagingRef,
  chatSearchRef,
  chatFiltersRef,
  chatPageSize,
  buildFiltersKey,
  setChatsHasMore,
  setChatsTotal,
  setIsLoadingMoreChats
}) {
  const requestChatsPage = useCallback(({ reset = false } = {}) => {
    console.log('[perf requestChatsPage call]', {
      t: perfNow(),
      at: Date.now(),
      reset,
      connected: Boolean(socket?.connected),
      loading: Boolean(chatPagingRef.current.loading),
      offset: Number(chatPagingRef.current.offset || 0),
      hasMore: Boolean(chatPagingRef.current.hasMore)
    });
    if (!socket?.connected) {
      console.log('[perf requestChatsPage skip]', { t: perfNow(), at: Date.now(), reason: 'socket_not_connected' });
      return;
    }
    if (chatPagingRef.current.loading && reset && Number(chatPagingRef.current.offset || 0) === 0) {
      console.log('[perf requestChatsPage skip]', { t: perfNow(), at: Date.now(), reason: 'loading_initial_reset' });
      return;
    }
    if (chatPagingRef.current.loading && !reset) {
      console.log('[perf requestChatsPage skip]', { t: perfNow(), at: Date.now(), reason: 'loading_next_page' });
      return;
    }
    if (!reset && !chatPagingRef.current.hasMore) {
      console.log('[perf requestChatsPage skip]', { t: perfNow(), at: Date.now(), reason: 'no_more_pages' });
      return;
    }

    const offset = reset ? 0 : chatPagingRef.current.offset;
    const query = chatSearchRef.current;
    const filters = chatFiltersRef.current;
    chatPagingRef.current.loading = true;
    if (reset) {
      chatPagingRef.current.offset = 0;
      chatPagingRef.current.hasMore = true;
      setChatsHasMore(true);
      setChatsTotal(0);
    }
    setIsLoadingMoreChats(true);
    const payload = {
      offset,
      limit: chatPageSize,
      reset,
      query,
      filters,
      filterKey: buildFiltersKey(filters)
    };
    console.log('[perf emit get_chats]', {
      t: perfNow(),
      at: Date.now(),
      connected: Boolean(socket?.connected),
      payload
    });
    socket.emit('get_chats', payload);
  }, [
    buildFiltersKey,
    chatFiltersRef,
    chatPageSize,
    chatPagingRef,
    chatSearchRef,
    setChatsHasMore,
    setChatsTotal,
    setIsLoadingMoreChats,
    socket
  ]);

  return {
    requestChatsPage
  };
}
