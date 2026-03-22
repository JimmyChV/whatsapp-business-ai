import { useCallback } from 'react';

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
    if (chatPagingRef.current.loading && !reset) return;
    if (!reset && !chatPagingRef.current.hasMore) return;

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
    socket.emit('get_chats', {
      offset,
      limit: chatPageSize,
      reset,
      query,
      filters,
      filterKey: buildFiltersKey(filters)
    });
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
