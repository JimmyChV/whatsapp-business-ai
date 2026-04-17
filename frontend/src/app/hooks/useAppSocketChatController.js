import { API_URL, CHAT_PAGE_SIZE, SOCKET_AUTH_TOKEN, TRANSPORT_STORAGE_KEY } from '../../config/runtime';
import {
  createSocketClient,
  useScopedBusinessRequests,
  useSocketConnectionAuthEffect
} from '../../features/chat/core';
import useAppChatSocketRuntime from './useAppChatSocketRuntime';

// TODO: migrar este singleton al siguiente corte para aislar socket fuera del hook.
export const appSocketSingleton = createSocketClient(API_URL, SOCKET_AUTH_TOKEN);

export default function useAppSocketChatController({
  runtimeBlock = {},
  businessScopeBlock = {},
  chatRuntimeBlock = {},
  callbacksBlock = {},
  handleChatSelectRef
} = {}) {
  const { requestQuickRepliesForModule, emitScopedBusinessDataRequest } = useScopedBusinessRequests({
    socket: appSocketSingleton,
    selectedCatalogModuleIdRef: businessScopeBlock.selectedCatalogModuleIdRef,
    selectedWaModuleRef: businessScopeBlock.selectedWaModuleRef,
    selectedCatalogIdRef: businessScopeBlock.selectedCatalogIdRef,
    quickRepliesRequestRef: businessScopeBlock.quickRepliesRequestRef,
    businessDataRequestDebounceRef: businessScopeBlock.businessDataRequestDebounceRef,
    businessDataScopeCacheRef: businessScopeBlock.businessDataScopeCacheRef,
    businessDataRequestSeqRef: businessScopeBlock.businessDataRequestSeqRef,
    setBusinessData: businessScopeBlock.setBusinessData
  });

  useSocketConnectionAuthEffect({
    socket: appSocketSingleton,
    saasRuntime: runtimeBlock.saasRuntime,
    saasSession: runtimeBlock.saasSession,
    selectedWaModuleRef: chatRuntimeBlock.selectedWaModuleRef,
    selectedWaModuleId: chatRuntimeBlock.selectedWaModule?.moduleId,
    socketAuthToken: SOCKET_AUTH_TOKEN,
    setIsConnected: runtimeBlock.setIsConnected,
    setIsClientReady: runtimeBlock.setIsClientReady
  });

  const { requestChatsPage, chatAssignmentState, chatCommercialStatusState } = useAppChatSocketRuntime({
    socket: appSocketSingleton,
    chatPageSize: CHAT_PAGE_SIZE,
    requestQuickRepliesForModule,
    emitScopedBusinessDataRequest,

    messages: chatRuntimeBlock.messages,
    messagesEndRef: chatRuntimeBlock.messagesEndRef,
    prevMessagesMetaRef: chatRuntimeBlock.prevMessagesMetaRef,
    messagesCacheRef: chatRuntimeBlock.messagesCacheRef,
    shouldInstantScrollRef: chatRuntimeBlock.shouldInstantScrollRef,
    suppressSmoothScrollUntilRef: chatRuntimeBlock.suppressSmoothScrollUntilRef,

    activeChatId: chatRuntimeBlock.activeChatId,
    activeChatIdRef: chatRuntimeBlock.activeChatIdRef,
    chats: chatRuntimeBlock.chats,
    chatsRef: chatRuntimeBlock.chatsRef,
    chatSearchQuery: chatRuntimeBlock.chatSearchQuery,
    chatSearchRef: chatRuntimeBlock.chatSearchRef,
    chatFilters: chatRuntimeBlock.chatFilters,
    chatFiltersRef: chatRuntimeBlock.chatFiltersRef,
    selectedTransport: chatRuntimeBlock.selectedTransport,
    selectedTransportRef: chatRuntimeBlock.selectedTransportRef,
    transportStorageKey: TRANSPORT_STORAGE_KEY,
    selectedWaModule: chatRuntimeBlock.selectedWaModule,
    selectedWaModuleRef: chatRuntimeBlock.selectedWaModuleRef,
    waModules: chatRuntimeBlock.waModules,
    waModulesRef: chatRuntimeBlock.waModulesRef,
    selectedCatalogModuleId: chatRuntimeBlock.selectedCatalogModuleId,
    selectedCatalogModuleIdRef: chatRuntimeBlock.selectedCatalogModuleIdRef,
    selectedCatalogId: chatRuntimeBlock.selectedCatalogId,
    selectedCatalogIdRef: chatRuntimeBlock.selectedCatalogIdRef,
    saasSession: chatRuntimeBlock.saasSession,
    saasSessionRef: chatRuntimeBlock.saasSessionRef,
    persistSaasSession: chatRuntimeBlock.persistSaasSession,
    saasRuntime: chatRuntimeBlock.saasRuntime,
    saasRuntimeRef: chatRuntimeBlock.saasRuntimeRef,
    forceOperationLaunch: chatRuntimeBlock.forceOperationLaunch,
    forceOperationLaunchRef: chatRuntimeBlock.forceOperationLaunchRef,
    waRuntime: chatRuntimeBlock.waRuntime,
    isClientReady: runtimeBlock.isClientReady,
    setIsConnected: runtimeBlock.setIsConnected,
    setIsSwitchingTransport: runtimeBlock.setIsSwitchingTransport,
    setIsClientReady: runtimeBlock.setIsClientReady,
    setTransportError: runtimeBlock.setTransportError,
    showClientProfile: chatRuntimeBlock.showClientProfile,
    clientProfilePanelRef: chatRuntimeBlock.clientProfilePanelRef,
    setShowClientProfile: chatRuntimeBlock.setShowClientProfile,

    socketPagingRef: chatRuntimeBlock.chatPagingRef,
    setChatsHasMore: chatRuntimeBlock.setChatsHasMore,
    setChatsTotal: chatRuntimeBlock.setChatsTotal,
    setIsLoadingMoreChats: chatRuntimeBlock.setIsLoadingMoreChats,

    setWaModules: chatRuntimeBlock.setWaModules,
    setSelectedWaModule: chatRuntimeBlock.setSelectedWaModule,
    setWaModuleError: chatRuntimeBlock.setWaModuleError,
    setSelectedCatalogModuleId: chatRuntimeBlock.setSelectedCatalogModuleId,
    setSelectedCatalogId: chatRuntimeBlock.setSelectedCatalogId,
    setSelectedTransport: chatRuntimeBlock.setSelectedTransport,
    requestedWaModuleFromUrlRef: chatRuntimeBlock.requestedWaModuleFromUrlRef,
    canManageSaasRef: chatRuntimeBlock.canManageSaasRef,

    setMyProfile: chatRuntimeBlock.setMyProfile,
    setWaCapabilities: chatRuntimeBlock.setWaCapabilities,
    setWaRuntime: chatRuntimeBlock.setWaRuntime,

    businessDataRequestSeqRef: chatRuntimeBlock.businessDataRequestSeqRef,
    businessDataResponseSeqRef: chatRuntimeBlock.businessDataResponseSeqRef,
    businessDataScopeCacheRef: chatRuntimeBlock.businessDataScopeCacheRef,
    setBusinessData: chatRuntimeBlock.setBusinessData,
    setLabelDefinitions: chatRuntimeBlock.setLabelDefinitions,
    businessData: chatRuntimeBlock.businessData,
    setQuickReplies: chatRuntimeBlock.setQuickReplies,
    setSendTemplateSubmitting: chatRuntimeBlock.setSendTemplateSubmitting,
    setSendTemplateOpen: chatRuntimeBlock.setSendTemplateOpen,
    setSelectedSendTemplate: chatRuntimeBlock.setSelectedSendTemplate,
    setSelectedSendTemplatePreview: chatRuntimeBlock.setSelectedSendTemplatePreview,
    setSelectedSendTemplatePreviewError: chatRuntimeBlock.setSelectedSendTemplatePreviewError,

    setMessages: chatRuntimeBlock.setMessages,
    setEditingMessage: chatRuntimeBlock.setEditingMessage,
    setChats: chatRuntimeBlock.setChats,
    setChatsLoaded: chatRuntimeBlock.setChatsLoaded,
    chatIdsReferSameScope: chatRuntimeBlock.chatIdsReferSameScope,

    setAiSuggestion: chatRuntimeBlock.setAiSuggestion,
    setIsAiLoading: chatRuntimeBlock.setIsAiLoading,
    setReplyingMessage: chatRuntimeBlock.setReplyingMessage,
    setActiveChatId: chatRuntimeBlock.setActiveChatId,

    handleChatSelect: (...args) => handleChatSelectRef?.current?.(...args),
    resolveSessionSenderIdentity: callbacksBlock.resolveSessionSenderIdentity,
    setClientContact: callbacksBlock.setClientContact,
    setToasts: callbacksBlock.setToasts,
    baseApiUrl: API_URL,
    buildApiHeaders: callbacksBlock.buildApiHeaders,
    activeTenantId: runtimeBlock.tenantScopeId
  });

  return {
    socket: appSocketSingleton,
    fileInputRef: chatRuntimeBlock.fileInputRef,
    messagesEndRef: chatRuntimeBlock.messagesEndRef,
    clientProfilePanelRef: chatRuntimeBlock.clientProfilePanelRef,
    requestChatsPage,
    emitScopedBusinessDataRequest,
    chatAssignmentState,
    chatCommercialStatusState
  };
}
