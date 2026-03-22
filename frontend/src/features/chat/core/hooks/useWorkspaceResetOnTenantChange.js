import { useCallback, useEffect } from 'react';

export default function useWorkspaceResetOnTenantChange({
  tenantScopeId = 'default',
  tenantScopeRef,
  setIsClientReady,
  setQrCode,
  setSelectedTransport,
  setWaModules,
  setSelectedWaModule,
  setSelectedCatalogModuleId,
  setSelectedCatalogId,
  setChats,
  setChatsTotal,
  setChatsHasMore,
  chatPagingRef,
  setIsLoadingMoreChats,
  setMessages,
  setActiveChatId,
  activeChatIdRef,
  setEditingMessage,
  setReplyingMessage,
  setShowClientProfile,
  setClientContact,
  setBusinessData,
  setQuickReplies,
  setWaModuleError,
  setPendingOrderCartLoad,
  setToasts,
  setInputText,
  setAttachment,
  setAttachmentPreview,
  setIsDragOver,
} = {}) {
  const resetWorkspaceState = useCallback(() => {
    setIsClientReady(false);
    setQrCode('');
    setSelectedTransport('');
    setWaModules([]);
    setSelectedWaModule(null);
    setSelectedCatalogModuleId('');
    setSelectedCatalogId('');
    setChats([]);
    setChatsTotal(0);
    setChatsHasMore(true);
    if (chatPagingRef?.current) {
      chatPagingRef.current = { offset: 0, hasMore: true, loading: false };
    }
    setIsLoadingMoreChats(false);
    setMessages([]);
    setActiveChatId(null);
    if (activeChatIdRef) activeChatIdRef.current = null;
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    setBusinessData({ profile: null, labels: [], catalog: [], catalogMeta: { source: 'local', nativeAvailable: false } });
    setQuickReplies([]);
    setWaModuleError('');
    setPendingOrderCartLoad(null);
    setToasts([]);
    setInputText('');
    setAttachment(null);
    setAttachmentPreview(null);
    setIsDragOver(false);
  }, [
    setIsClientReady,
    setQrCode,
    setSelectedTransport,
    setWaModules,
    setSelectedWaModule,
    setSelectedCatalogModuleId,
    setSelectedCatalogId,
    setChats,
    setChatsTotal,
    setChatsHasMore,
    chatPagingRef,
    setIsLoadingMoreChats,
    setMessages,
    setActiveChatId,
    activeChatIdRef,
    setEditingMessage,
    setReplyingMessage,
    setShowClientProfile,
    setClientContact,
    setBusinessData,
    setQuickReplies,
    setWaModuleError,
    setPendingOrderCartLoad,
    setToasts,
    setInputText,
    setAttachment,
    setAttachmentPreview,
    setIsDragOver
  ]);

  useEffect(() => {
    const previousTenant = String(tenantScopeRef?.current || '').trim() || 'default';
    if (previousTenant === tenantScopeId) return;
    if (tenantScopeRef) tenantScopeRef.current = tenantScopeId;
    resetWorkspaceState();
  }, [tenantScopeId, tenantScopeRef, resetWorkspaceState]);

  return { resetWorkspaceState };
}
