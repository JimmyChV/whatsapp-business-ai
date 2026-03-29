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
  setQrCode,
  setReplyingMessage,
  setActiveChatId,

  handleChatSelect,
  resolveSessionSenderIdentity,
  setClientContact,
  setToasts
}) {
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

  const lastSearchQueryRef = useRef('');
  const lastFilterKeyRef = useRef('');
  const wasClientReadyRef = useRef(Boolean(isClientReady));

  useEffect(() => {
    const wasReady = Boolean(wasClientReadyRef.current);
    wasClientReadyRef.current = Boolean(isClientReady);
    if (!isClientReady) return;

    const normalizedQuery = String(chatSearchQuery || '').trim();
    const normalizedFilters = normalizeChatFilters(chatFilters);
    const nextFilterKey = buildFiltersKey(normalizedFilters);
    const queryChanged = normalizedQuery !== lastSearchQueryRef.current;
    const filtersChanged = nextFilterKey !== lastFilterKeyRef.current;
    const reconnected = !wasReady && Boolean(isClientReady);

    if (!queryChanged && !filtersChanged && !reconnected) return;

    let debounceMs = 120;
    if (!reconnected) {
      if (queryChanged) debounceMs = 260;
      else if (filtersChanged) debounceMs = 140;
    }

    const timer = setTimeout(() => {
      lastSearchQueryRef.current = normalizedQuery;
      lastFilterKeyRef.current = nextFilterKey;
      requestChatsPage({ reset: true });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [chatSearchQuery, chatFilters, isClientReady, requestChatsPage]);

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
    setQrCode,
    setIsClientReady,
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
    setQrCode,
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

  return {
    requestChatsPage
  };
}
