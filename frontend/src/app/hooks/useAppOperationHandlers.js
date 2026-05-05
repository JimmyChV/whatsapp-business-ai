import { useCallback, useEffect } from 'react';
import { API_URL } from '../../config/runtime';
import {
  useNewChatDialog,
  useWorkspaceNavigation,
  useTransportSelectionActions,
  useChatMessageActions,
  useAttachmentActions,
  useChatSidebarActions,
  useChatMessageUiActions,
  useChatSelectionAction,
  useWorkspaceResetOnTenantChange,
  useAppDerivedChatState,
  useGlobalEscapeToCloseChat,
  requestAiSuggestionForChat,
  normalizeDigits,
  chatIdsReferSameScope,
  sanitizeDisplayText,
  normalizeChatFilters,
  normalizeQuickReplyDraft,
  parseScopedChatId
} from '../../features/chat/core';
import useUiFeedback from '../ui-feedback/useUiFeedback';

export default function useAppOperationHandlers({
  socketOpsBlock = {},
  sessionRuntimeBlock = {},
  workspaceStateBlock = {},
  navigationHelpersBlock = {},
  recoveryBlock = {}
} = {}) {
  void recoveryBlock;
  const { confirm } = useUiFeedback();

  const {
    socket,
    requestChatsPage,
    emitScopedBusinessDataRequest,
    handleChatSelectRef
  } = socketOpsBlock;

  const {
    tenantScopeId,
    tenantScopeRef,
    isConnected,
    selectedTransport,
    waRuntime,
    setIsConnected,
    setIsClientReady,
    setSelectedTransport,
    setTransportError,
    setIsSwitchingTransport,
    setWaRuntime,
    setShowSaasAdminPanel,
    canManageSaas,
    saasSessionRef,
    saasRuntimeRef,
    setAiSuggestion,
    setIsAiLoading,
    handleSaasLogin,
    handleSaasLogout,
    handleSwitchTenant
  } = sessionRuntimeBlock;

  const {
    chats,
    setChats,
    setChatsLoaded,
    chatsTotal,
    setChatsTotal,
    chatsHasMore,
    setChatsHasMore,
    isLoadingMoreChats,
    setIsLoadingMoreChats,
    chatSearchQuery,
    setChatSearchQuery,
    chatFilters,
    setChatFilters,
    activeChatId,
    setActiveChatId,
    messages,
    setMessages,
    inputText,
    setInputText,
    editingMessage,
    setEditingMessage,
    replyingMessage,
    setReplyingMessage,
    myProfile,
    showClientProfile,
    setShowClientProfile,
    clientContact,
    setClientContact,
    openCompanyProfileToken,
    setOpenCompanyProfileToken,
    attachment,
    setAttachment,
    attachmentPreview,
    setAttachmentPreview,
    aiPrompt,
    setAiPrompt,
    isCopilotMode,
    setIsCopilotMode,
    businessData,
    setBusinessData,
    activeCartSnapshot,
    labelDefinitions,
    setLabelDefinitions,
    quickReplies,
    setQuickReplies,
    quickReplyDraft,
    setQuickReplyDraft,
    sendTemplateOpen,
    setSendTemplateOpen,
    sendTemplateOptions,
    setSendTemplateOptions,
    sendTemplateOptionsLoading,
    setSendTemplateOptionsLoading,
    sendTemplateOptionsError,
    setSendTemplateOptionsError,
    selectedSendTemplate,
    setSelectedSendTemplate,
    selectedSendTemplatePreview,
    setSelectedSendTemplatePreview,
    selectedSendTemplatePreviewLoading,
    setSelectedSendTemplatePreviewLoading,
    selectedSendTemplatePreviewError,
    setSelectedSendTemplatePreviewError,
    sendTemplateSubmitting,
    setSendTemplateSubmitting,
    waModules,
    setWaModules,
    selectedWaModule,
    setSelectedWaModule,
    selectedCatalogModuleId,
    setSelectedCatalogModuleId,
    selectedCatalogId,
    setSelectedCatalogId,
    waModuleError,
    setWaModuleError,
    waCapabilities,
    setWaCapabilities,
    toasts,
    setToasts,
    pendingOrderCartLoad,
    setPendingOrderCartLoad,
    handleCartSnapshotChange,
    isDragOver,
    setIsDragOver,
    activeChatIdRef,
    chatsRef,
    chatSearchRef,
    chatFiltersRef,
    chatPagingRef,
    messagesCacheRef,
    pendingOutgoingByChatRef,
    shouldInstantScrollRef,
    prevMessagesMetaRef,
    suppressSmoothScrollUntilRef,
    selectedWaModuleRef,
    waModulesRef,
    selectedCatalogModuleIdRef,
    selectedCatalogIdRef,
    fileInputRef
  } = workspaceStateBlock;

  const { buildApiHeaders } = navigationHelpersBlock;

  const { resetWorkspaceState } = useWorkspaceResetOnTenantChange({
    tenantScopeId,
    tenantScopeRef,
    setIsClientReady,
    setSelectedTransport,
    setWaModules,
    setSelectedWaModule,
    setSelectedCatalogModuleId,
    setSelectedCatalogId,
    setChats,
    setChatsLoaded,
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
  });

  const chatDerivedState = useAppDerivedChatState({
    waRuntime,
    waModules,
    selectedCatalogModuleId,
    selectedCatalogId,
    selectedTransport,
    activeChatId,
    activeChatIdRef,
    chats
  });

  const requestAiSuggestion = useCallback((customPromptArg) => {
    requestAiSuggestionForChat({
      socket,
      activeChatId,
      activeChatDetails: chatDerivedState.activeChatDetails,
      clientContact,
      selectedWaModuleRef,
      selectedCatalogModuleIdRef,
      selectedCatalogIdRef,
      waModulesRef,
      businessData,
      messages,
      activeCartSnapshot,
      tenantScopeRef,
      saasRuntimeRef,
      aiPrompt,
      customPromptArg,
      setAiSuggestion,
      setIsAiLoading
    });
  }, [
    socket,
    activeChatId,
    chatDerivedState.activeChatDetails,
    clientContact,
    selectedWaModuleRef,
    selectedCatalogModuleIdRef,
    selectedCatalogIdRef,
    waModulesRef,
    businessData,
    messages,
    activeCartSnapshot,
    tenantScopeRef,
    saasRuntimeRef,
    aiPrompt,
    setAiSuggestion,
    setIsAiLoading
  ]);

  const { handleChatSelect } = useChatSelectionAction({
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
    isConnected,
    socket,
    emitScopedBusinessDataRequest,
    activeChatIdRef,
    setActiveChatId,
    shouldInstantScrollRef,
    suppressSmoothScrollUntilRef,
    prevMessagesMetaRef,
    messagesCacheRef,
    setMessages,
    setEditingMessage,
    setReplyingMessage,
    setShowClientProfile,
    setClientContact,
    setQuickReplyDraft,
    setChats,
    chatIdsReferSameScope
  });

  useEffect(() => {
    if (handleChatSelectRef) {
      handleChatSelectRef.current = handleChatSelect;
    }
  }, [handleChatSelect, handleChatSelectRef]);

  const {
    removeAttachment,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop
  } = useAttachmentActions({
    setAttachment,
    setAttachmentPreview,
    setIsDragOver
  });

  const {
    handleExitActiveChat,
    handleSendMessage,
    handleSendCatalogProduct,
    handleRetryMessage,
    handleSendReaction,
    handleOpenSendTemplate,
    handleCloseSendTemplate,
    handleSelectTemplatePreview,
    handleConfirmSendTemplate
  } = useChatMessageActions({
    socket,
    activeChatId,
    activeChatIdRef,
    chatsRef,
    inputText,
    editingMessage,
    waCapabilities,
    attachment,
    quickReplyDraft,
    replyingMessage,
    requestAiSuggestion,
    normalizeDigits,
    normalizeQuickReplyDraft,
    buildApiHeaders,
    activeChatScopeModuleId: chatDerivedState.activeChatDetails?.scopeModuleId || selectedWaModuleRef?.current?.moduleId || '',
    clientContact,
    prevMessagesMetaRef,
    suppressSmoothScrollUntilRef,
    messagesCacheRef,
    pendingOutgoingByChatRef,
    setActiveChatId,
    setMessages,
    setChats,
    setEditingMessage,
    setReplyingMessage,
    setShowClientProfile,
    setClientContact,
    setPendingOrderCartLoad,
    setQuickReplyDraft,
    setInputText,
    removeAttachment,
    setSendTemplateOpen,
    setSendTemplateOptions,
    setSendTemplateOptionsLoading,
    setSendTemplateOptionsError,
    selectedSendTemplate,
    setSelectedSendTemplate,
    selectedSendTemplatePreview,
    setSelectedSendTemplatePreview,
    setSelectedSendTemplatePreviewLoading,
    setSelectedSendTemplatePreviewError,
    setSendTemplateSubmitting
  });

  useGlobalEscapeToCloseChat({
    activeChatIdRef,
    handleExitActiveChat
  });

  const {
    openWhatsAppOperation: handleOpenWhatsAppOperation,
    openSaasAdminWorkspace: handleOpenSaasAdminWorkspace
  } = useWorkspaceNavigation({
    tenantScopeId,
    setShowSaasAdminPanel
  });

  const {
    handleSelectTransport
  } = useTransportSelectionActions({
    socket,
    isConnected,
    chatPagingRef,
    setSelectedTransport,
    setTransportError,
    setIsSwitchingTransport,
    setIsClientReady,
    setChats,
    setChatsLoaded,
    setChatsTotal,
    setChatsHasMore,
    setMessages,
    setActiveChatId,
    setEditingMessage,
    setReplyingMessage,
    setShowClientProfile,
    setClientContact,
    setWaModuleError,
    setWaRuntime
  });

  const {
    handleSelectCatalogModule,
    handleSelectCatalog,
    handleUploadCatalogImage,
    handleRefreshChats,
    handleChatSearchChange,
    handleChatFiltersChange,
    handleLoadMoreChats,
    handleCreateLabel,
    handleOpenCompanyProfile,
    handleToggleChatLabel,
    handleToggleChatPinned,
    handleLoadOrderToCart: loadOrderToCartForActiveChat
  } = useChatSidebarActions({
    waModules,
    setWaModuleError,
    setSelectedWaModule,
    setSelectedTransport,
    setTransportError,
    isConnected,
    socket,
    emitScopedBusinessDataRequest,
    selectedCatalogModuleIdRef,
    selectedCatalogIdRef,
    selectedWaModuleRef,
    setSelectedCatalogModuleId,
    setSelectedCatalogId,
    setBusinessData,
    handleSelectTransport,
    saasSessionRef,
    saasRuntimeRef,
    tenantScopeId,
    apiUrl: API_URL,
    buildApiHeaders,
    requestChatsPage,
    setChatSearchQuery,
    setChatFilters,
    normalizeChatFilters,
    canManageSaas,
    handleOpenSaasAdminWorkspace,
    setOpenCompanyProfileToken,
    chats,
    setPendingOrderCartLoad
  });

  const {
    newChatDialog,
    setNewChatDialog,
    newChatAvailableModules,
    handleStartNewChat,
    handleCancelNewChatDialog,
    handleConfirmNewChat
  } = useNewChatDialog({
    waModulesRef,
    selectedWaModuleRef,
    chatsRef,
    handleChatSelect,
    socket
  });

  const {
    handleEditMessage,
    handleCancelEditMessage,
    handleReplyMessage,
    handleCancelReplyMessage,
    handleForwardMessage,
    handleDeleteMessage,
    handleSendQuickReply: applyQuickReplyDraft
  } = useChatMessageUiActions({
    waCapabilities,
    removeAttachment,
    setQuickReplyDraft,
    setEditingMessage,
    setReplyingMessage,
    setInputText,
    setAttachment,
    setAttachmentPreview,
    sanitizeDisplayText,
    socket,
    activeChatIdRef
  });

  const handleSendQuickReply = useCallback((quickReply = null) => {
    applyQuickReplyDraft(quickReply, activeChatIdRef.current, normalizeQuickReplyDraft);
  }, [applyQuickReplyDraft, activeChatIdRef]);

  const handleLoadOrderToCart = useCallback((orderPayload) => {
    loadOrderToCartForActiveChat(activeChatIdRef.current, orderPayload);
  }, [activeChatIdRef, loadOrderToCartForActiveChat]);

  const handleLogoutWhatsapp = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Cerrar sesion WhatsApp',
      message: 'Cerrar sesion de WhatsApp en este equipo?',
      confirmText: 'Cerrar sesion',
      cancelText: 'Cancelar',
      tone: 'danger'
    });
    if (!confirmed) return;
    socket.emit('logout_whatsapp');
  }, [confirm, socket]);

  const handlersBlock = {
    handleChatSelect,
    handleSendMessage,
    handleSendCatalogProduct,
    handleRetryMessage,
    handleSendReaction,
    handleExitActiveChat,
    handleEditMessage,
    handleCancelEditMessage,
    handleReplyMessage,
    handleCancelReplyMessage,
    handleForwardMessage,
    handleDeleteMessage,
    handleSendQuickReply,
    handleOpenSendTemplate,
    handleCloseSendTemplate,
    handleSelectTemplatePreview,
    handleConfirmSendTemplate,
    requestAiSuggestion,
    handleRefreshChats,
    handleStartNewChat,
    handleConfirmNewChat,
    handleCancelNewChatDialog,
    handleChatSearchChange,
    handleChatFiltersChange,
    handleLoadMoreChats,
    handleOpenCompanyProfile,
    handleToggleChatLabel,
    handleToggleChatPinned,
    handleSelectCatalogModule,
    handleSelectCatalog,
    handleUploadCatalogImage,
    handleCreateLabel,
    handleLoadOrderToCart,
    handleOpenWhatsAppOperation,
    handleOpenSaasAdminWorkspace,
    handleLogoutWhatsapp,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeAttachment,
    handleCartSnapshotChange
  };

  const sessionActionExports = {
    handleSaasLogin,
    handleSaasLogout,
    handleSwitchTenant
  };

  const uiDerivedExports = {
    newChatDialog,
    setNewChatDialog,
    newChatAvailableModules,
    availableWaModules: chatDerivedState.availableWaModules,
    activeCatalogModuleId: chatDerivedState.activeCatalogModuleId,
    activeCatalogId: chatDerivedState.activeCatalogId,
    activeTransport: chatDerivedState.activeTransport,
    cloudConfigured: chatDerivedState.cloudConfigured,
    selectedModeLabel: chatDerivedState.selectedModeLabel,
    sendTemplateOpen,
    sendTemplateOptions,
    sendTemplateOptionsLoading,
    sendTemplateOptionsError,
    selectedSendTemplate,
    selectedSendTemplatePreview,
    selectedSendTemplatePreviewLoading,
    selectedSendTemplatePreviewError,
    sendTemplateSubmitting,
    resetWorkspaceState
  };

  return {
    handlersBlock,
    sessionActionExports,
    uiDerivedExports
  };
}
