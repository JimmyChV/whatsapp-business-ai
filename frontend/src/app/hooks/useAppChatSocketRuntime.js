import { useEffect, useRef } from 'react';

import {
  useMessagesAutoScroll,
  useChatRuntimeSyncEffects,
  useChatPaginationRequester,
  useWaModuleSocketEvents,
  useSocketConnectionRuntimeEvents,
  useSocketBusinessDataEvents,
  useSocketMessageLifecycleEvents,
  useSocketAiAndSessionEvents,
  useSocketChatConversationEvents,
  useChatAssignmentState,
  normalizeChatFilters,
  buildFiltersKey,
  isVisibleChatId,
  normalizeChatScopedId,
  parseScopedChatId,
  sanitizeDisplayText,
  getBestChatPhone,
  normalizeChatLabels,
  normalizeProfilePhotoUrl,
  normalizeModuleImageUrl,
  chatMatchesFilters,
  dedupeChats,
  chatMatchesQuery,
  chatIdentityKey,
  upsertAndSortChat,
  normalizeDigits,
  isLikelyPhoneDigits,
  normalizeWaModules,
  repairMojibake,
  normalizeMessageLocation,
  normalizeMessageFilename,
  normalizeQuotedMessage,
  isGenericFilename,
  isMachineLikeFilename,
  normalizeParticipantList,
  isInternalIdentifier,
  normalizeCatalogItem,
  resolveScopedCatalogSelection,
  normalizeBusinessDataPayload,
  normalizeQuickRepliesSocketPayload,
  normalizeProfilePayload
} from '../../features/chat/core';

export default function useAppChatSocketRuntime({
  socket,
  chatPageSize,
  requestQuickRepliesForModule,
  emitScopedBusinessDataRequest,

  messages,
  messagesEndRef,
  prevMessagesMetaRef,
  shouldInstantScrollRef,
  suppressSmoothScrollUntilRef,

  activeChatId,
  activeChatIdRef,
  chats,
  chatsRef,
  chatSearchQuery,
  chatSearchRef,
  chatFilters,
  chatFiltersRef,
  selectedTransport,
  selectedTransportRef,
  transportStorageKey,
  selectedWaModule,
  selectedWaModuleRef,
  waModules,
  waModulesRef,
  selectedCatalogModuleId,
  selectedCatalogModuleIdRef,
  selectedCatalogId,
  selectedCatalogIdRef,
  saasSession,
  saasSessionRef,
  persistSaasSession,
  saasRuntime,
  saasRuntimeRef,
  forceOperationLaunch,
  forceOperationLaunchRef,
  waRuntime,
  isClientReady,
  setIsConnected,
  setIsSwitchingTransport,
  setIsClientReady,
  setTransportError,
  showClientProfile,
  clientProfilePanelRef,
  setShowClientProfile,

  socketPagingRef,
  setChatsHasMore,
  setChatsTotal,
  setIsLoadingMoreChats,

  setWaModules,
  setSelectedWaModule,
  setWaModuleError,
  setSelectedCatalogModuleId,
  setSelectedCatalogId,
  setSelectedTransport,
  requestedWaModuleFromUrlRef,
  canManageSaasRef,

  setMyProfile,
  setWaCapabilities,
  setWaRuntime,

  businessDataRequestSeqRef,
  businessDataResponseSeqRef,
  businessDataScopeCacheRef,
  setBusinessData,
  setLabelDefinitions,
  businessData,
  setQuickReplies,

  setMessages,
  setEditingMessage,
  setChats,
  setChatsLoaded,
  chatIdsReferSameScope,

  setAiSuggestion,
  setIsAiLoading,
  setReplyingMessage,
  setActiveChatId,

  handleChatSelect,
  resolveSessionSenderIdentity,
  setClientContact,
  setToasts
}) {
  const isClientReadyRef = useRef(Boolean(isClientReady));

  useEffect(() => {
    isClientReadyRef.current = Boolean(isClientReady);
  }, [isClientReady]);

  useMessagesAutoScroll({
    messages,
    messagesEndRef,
    prevMessagesMetaRef,
    shouldInstantScrollRef,
    suppressSmoothScrollUntilRef
  });

  useChatRuntimeSyncEffects({
    activeChatId,
    activeChatIdRef,
    chats,
    chatsRef,
    chatSearchQuery,
    chatSearchRef,
    chatFilters,
    chatFiltersRef,
    normalizeChatFilters,
    selectedTransport,
    selectedTransportRef,
    transportStorageKey,
    selectedWaModule,
    selectedWaModuleRef,
    waModules,
    waModulesRef,
    selectedCatalogModuleId,
    selectedCatalogModuleIdRef,
    selectedCatalogId,
    selectedCatalogIdRef,
    saasSession,
    saasSessionRef,
    persistSaasSession,
    saasRuntime,
    saasRuntimeRef,
    forceOperationLaunch,
    forceOperationLaunchRef,
    waRuntime,
    setIsClientReady,
    setTransportError,
    showClientProfile,
    clientProfilePanelRef,
    setShowClientProfile
  });

  const { requestChatsPage } = useChatPaginationRequester({
    socket,
    chatPagingRef: socketPagingRef,
    chatSearchRef,
    chatFiltersRef,
    chatPageSize,
    buildFiltersKey,
    setChatsHasMore,
    setChatsTotal,
    setIsLoadingMoreChats
  });

  useEffect(() => {
    if (!isClientReady) return;
    const timer = setTimeout(() => {
      if (!isClientReadyRef.current) return;
      requestChatsPage({ reset: true });
    }, 600);
    return () => clearTimeout(timer);
  }, [chatSearchQuery, chatFilters, isClientReady]);

  useWaModuleSocketEvents({
    socket,
    selectedWaModuleRef,
    selectedCatalogModuleIdRef,
    selectedCatalogIdRef,
    requestedWaModuleFromUrlRef,
    forceOperationLaunchRef,
    canManageSaasRef,
    emitScopedBusinessDataRequest,
    requestQuickRepliesForModule,
    setWaModules,
    setSelectedWaModule,
    setWaModuleError,
    setSelectedCatalogModuleId,
    setSelectedCatalogId,
    setSelectedTransport
  });

  useSocketConnectionRuntimeEvents({
    socket,
    selectedTransportRef,
    setIsConnected,
    setIsSwitchingTransport,
    setIsLoadingMoreChats,
    chatPagingRef: socketPagingRef,
    setIsClientReady,
    requestChatsPage,
    emitScopedBusinessDataRequest,
    selectedCatalogModuleIdRef,
    selectedWaModuleRef,
    selectedCatalogIdRef,
    requestQuickRepliesForModule,
    normalizeProfilePayload,
    setMyProfile,
    setWaCapabilities,
    setWaRuntime,
    setTransportError
  });

  useSocketBusinessDataEvents({
    socket,
    normalizeBusinessDataPayload,
    businessDataRequestSeqRef,
    businessDataResponseSeqRef,
    businessDataScopeCacheRef,
    selectedCatalogModuleIdRef,
    selectedCatalogIdRef,
    resolveScopedCatalogSelection,
    setBusinessData,
    setLabelDefinitions,
    normalizeChatLabels,
    setSelectedCatalogModuleId,
    setSelectedCatalogId,
    normalizeCatalogItem,
    businessData,
    setWaCapabilities,
    normalizeQuickRepliesSocketPayload,
    setQuickReplies
  });

  useSocketMessageLifecycleEvents({
    socket,
    activeChatIdRef,
    setMessages,
    repairMojibake,
    setEditingMessage,
    setChats,
    normalizeChatScopedId,
    chatIdsReferSameScope
  });

  useSocketAiAndSessionEvents({
    socket,
    setAiSuggestion,
    setIsAiLoading,
    setIsClientReady,
    setChats,
    setChatsLoaded,
    setChatsTotal,
    setChatsHasMore,
    chatPagingRef: socketPagingRef,
    setIsLoadingMoreChats,
    setMessages,
    setEditingMessage,
    setReplyingMessage,
    setActiveChatId
  });

  useSocketChatConversationEvents({
    socket,
    chatSearchRef,
    buildFiltersKey,
    chatFiltersRef,
    chatsRef,
    isVisibleChatId,
    normalizeChatScopedId,
    parseScopedChatId,
    sanitizeDisplayText,
    getBestChatPhone,
    normalizeChatLabels,
    normalizeProfilePhotoUrl,
    normalizeModuleImageUrl,
    chatMatchesFilters,
    setChats,
    setChatsLoaded,
    dedupeChats,
    chatPagingRef: socketPagingRef,
    setChatsTotal,
    setChatsHasMore,
    setIsLoadingMoreChats,
    chatIdsReferSameScope,
    chatMatchesQuery,
    chatIdentityKey,
    upsertAndSortChat,
    requestChatsPage,
    normalizeDigits,
    isLikelyPhoneDigits,
    normalizeWaModules,
    waModulesRef,
    handleChatSelect,
    activeChatIdRef,
    setActiveChatId,
    shouldInstantScrollRef,
    suppressSmoothScrollUntilRef,
    prevMessagesMetaRef,
    resolveSessionSenderIdentity,
    repairMojibake,
    normalizeMessageLocation,
    normalizeMessageFilename,
    normalizeQuotedMessage,
    setMessages,
    isGenericFilename,
    isMachineLikeFilename,
    normalizeParticipantList,
    setClientContact,
    isInternalIdentifier,
    setToasts
  });

  const chatAssignmentState = useChatAssignmentState({
    socket,
    activeChatId,
    normalizeChatScopedId,
    chatIdsReferSameScope,
    currentUserId: String(saasSession?.user?.userId || saasSession?.user?.id || '').trim()
  });

  return {
    requestChatsPage,
    chatAssignmentState
  };
}
