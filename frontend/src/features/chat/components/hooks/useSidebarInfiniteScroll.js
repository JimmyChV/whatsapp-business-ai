const useSidebarInfiniteScroll = ({
  onLoadMoreChats,
  chatsHasMore = false,
  isLoadingMoreChats = false
} = {}) => {
  const handleChatListScroll = (e) => {
    if (!onLoadMoreChats || !chatsHasMore || isLoadingMoreChats) return;
    const el = e.currentTarget;
    const nearBottom = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 120);
    if (nearBottom) onLoadMoreChats();
  };

  return {
    handleChatListScroll
  };
};

export default useSidebarInfiniteScroll;
