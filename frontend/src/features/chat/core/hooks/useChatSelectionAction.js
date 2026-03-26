export default function useChatSelectionAction({
  chatsRef,
  chatSearchRef,
  setChatSearchQuery,
  requestChatsPage,
  parseScopedChatId,
  selectedCatalogModuleIdRef,
  selectedCatalogIdRef,
  selectedWaModuleRef,
  setSelectedCatalogModuleId,
  setSelectedCatalogId,
  isConnected = false,
  requestQuickRepliesForModule,
  socket,
  emitScopedBusinessDataRequest,
  activeChatIdRef,
  setActiveChatId,
  shouldInstantScrollRef,
  suppressSmoothScrollUntilRef,
  prevMessagesMetaRef,
  setMessages,
  setEditingMessage,
  setReplyingMessage,
  setShowClientProfile,
  setClientContact,
  setQuickReplyDraft,
  setChats,
  chatIdsReferSameScope
} = {}) {
  const emitQuickRepliesRequest = (moduleId = '') => {
    const cleanModuleId = String(moduleId || '').trim().toLowerCase();
    if (typeof requestQuickRepliesForModule === 'function') {
      requestQuickRepliesForModule(cleanModuleId);
      return;
    }
    if (!socket?.connected) return;
    socket.emit('get_quick_replies', cleanModuleId ? { moduleId: cleanModuleId } : {});
  };

  const handleChatSelect = (chatId, options = {}) => {
    if (!chatId) return;
    const clearSearch = Boolean(options?.clearSearch);
    if (clearSearch && chatSearchRef.current) {
      chatSearchRef.current = '';
      setChatSearchQuery('');
      requestChatsPage({ reset: true });
    }

    const requestedChatId = String(chatId || '').trim();
    let resolvedChatId = requestedChatId;
    let selectedChat = chatsRef.current.find((c) => String(c?.id || '') === requestedChatId) || null;
    let resolvedScopeModuleId = '';

    if (selectedChat) {
      const parsedSelected = parseScopedChatId(selectedChat?.id || '');
      const selectedScopeModuleId = String(parsedSelected?.scopeModuleId || selectedChat?.scopeModuleId || selectedChat?.lastMessageModuleId || '').trim().toLowerCase();
      resolvedScopeModuleId = selectedScopeModuleId;
      if (!selectedScopeModuleId) {
        const baseSelectedChatId = String(parsedSelected?.baseChatId || selectedChat?.baseChatId || selectedChat?.id || '').trim();
        if (baseSelectedChatId) {
          const scopedCandidates = chatsRef.current
            .filter((entry) => {
              const parsedEntry = parseScopedChatId(entry?.id || '');
              const entryBase = String(parsedEntry?.baseChatId || entry?.baseChatId || entry?.id || '').trim();
              const entryScope = String(parsedEntry?.scopeModuleId || entry?.scopeModuleId || entry?.lastMessageModuleId || '').trim().toLowerCase();
              return Boolean(entryBase && entryBase === baseSelectedChatId && entryScope);
            })
            .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
          if (scopedCandidates.length > 0) {
            selectedChat = scopedCandidates[0];
            resolvedChatId = String(selectedChat?.id || requestedChatId);
            const parsedResolved = parseScopedChatId(selectedChat?.id || '');
            resolvedScopeModuleId = String(parsedResolved?.scopeModuleId || selectedChat?.scopeModuleId || selectedChat?.lastMessageModuleId || '').trim().toLowerCase();
          }
        }
      }
    }

    if (resolvedScopeModuleId) {
      const currentCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
      const currentWaModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();

      if (resolvedScopeModuleId !== currentCatalogModuleId) {
        selectedCatalogModuleIdRef.current = resolvedScopeModuleId;
        selectedCatalogIdRef.current = '';
        setSelectedCatalogModuleId(resolvedScopeModuleId);
        setSelectedCatalogId('');
      }

      if (isConnected) {
        emitQuickRepliesRequest(resolvedScopeModuleId);
        if (resolvedScopeModuleId !== currentWaModuleId) {
          socket.emit('set_wa_module', { moduleId: resolvedScopeModuleId });
        } else {
          emitScopedBusinessDataRequest({ moduleId: resolvedScopeModuleId, catalogId: selectedCatalogIdRef.current || '' });
        }
      }
    }

    activeChatIdRef.current = resolvedChatId;
    setActiveChatId(resolvedChatId);
    shouldInstantScrollRef.current = true;
    suppressSmoothScrollUntilRef.current = Date.now() + 2200;
    prevMessagesMetaRef.current = { count: 0, lastId: '' };
    setMessages([]);
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    setQuickReplyDraft(null);
    socket.emit('get_chat_history', resolvedChatId);
    socket.emit('mark_chat_read', resolvedChatId);
    socket.emit('get_contact_info', resolvedChatId);
    setChats((prev) => prev.map((c) => chatIdsReferSameScope(String(c?.id || ''), resolvedChatId) ? { ...c, unreadCount: 0 } : c));
  };

  return { handleChatSelect };
}
