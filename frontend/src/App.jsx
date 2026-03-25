import { lazy, useState, useEffect, useRef } from 'react';

import { API_URL } from './config/runtime';
import { persistSaasSession } from './features/auth/helpers/saasSessionStorage';
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
  useOperationWorkspaceState,
  requestAiSuggestionForChat,
  normalizeWaModules,
  resolveSelectedWaModule,
  normalizeDigits,
  parseScopedChatId,
  chatIdsReferSameScope,
  sanitizeDisplayText,
  normalizeChatFilters,
  normalizeQuickReplyDraft
} from './features/chat/core';
import { useSaasRecoveryFlow } from './features/auth/hooks/useSaasRecoveryFlow';
import useSaasRuntimeBootstrap from './features/auth/hooks/useSaasRuntimeBootstrap';
import useSaasSessionAutoRefresh from './features/auth/hooks/useSaasSessionAutoRefresh';
import { useSaasSessionActions } from './features/auth/hooks/useSaasSessionActions';
import useSaasApiSessionHelpers from './features/auth/hooks/useSaasApiSessionHelpers';
import OperationPage from './pages/OperationPage';
import { useSaasPanelVisibilityController } from './features/saas/hooks';
import { useSaasTenantScopeContext } from './features/saas/hooks/domains/tenants/useSaasTenantScopeContext';
import { APP_RUNTIME_GATES } from './app/helpers/runtimeGate.helpers';
import {
  useAppSessionTransportState,
  useAppRuntimeGate,
  useAppPagePropsComposer,
  useAppSocketChatController
} from './app/hooks';
import AppRuntimeGate from './app/components/AppRuntimeGate';

import './index.css';

const SaasPanelPage = lazy(() => import('./pages/SaasPanelPage'));

function App() {
  const {
    isConnected,
    setIsConnected,
    qrCode,
    setQrCode,
    isClientReady,
    setIsClientReady,
    selectedTransport,
    setSelectedTransport,
    waRuntime,
    setWaRuntime,
    transportError,
    setTransportError,
    isSwitchingTransport,
    setIsSwitchingTransport,
    saasRuntime,
    setSaasRuntime,
    saasSession,
    setSaasSession,
    saasAuthBusy,
    setSaasAuthBusy,
    saasAuthError,
    setSaasAuthError,
    tenantSwitchBusy,
    setTenantSwitchBusy,
    tenantSwitchError,
    setTenantSwitchError,
    showSaasAdminPanel,
    setShowSaasAdminPanel,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    showLoginPassword,
    setShowLoginPassword,
    saasAuthNotice,
    setSaasAuthNotice,
    setForceOperationLaunchBypass,
    forceOperationLaunch,
    requestedWaModuleFromUrl,
    requestedWaTenantFromUrl,
    requestedWaSectionFromUrl,
    requestedLaunchSource,
    tenantScopeId
  } = useAppSessionTransportState();

  const {
    chats,
    setChats,
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
    setMyProfile,
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
    fileInputRef,
    aiSuggestion,
    setAiSuggestion,
    isAiLoading,
    setIsAiLoading,
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
    messagesEndRef,
    clientProfilePanelRef,
    activeChatIdRef,
    chatsRef,
    chatSearchRef,
    chatFiltersRef,
    chatPagingRef,
    shouldInstantScrollRef,
    prevMessagesMetaRef,
    suppressSmoothScrollUntilRef,
    selectedTransportRef,
    selectedWaModuleRef,
    waModulesRef,
    selectedCatalogModuleIdRef,
    selectedCatalogIdRef,
    saasSessionRef,
    saasRuntimeRef,
    forceOperationLaunchRef,
    canManageSaasRef,
    requestedWaModuleFromUrlRef,
    requestedWaTenantFromUrlRef,
    launchTenantAppliedRef,
    saasAdminAutoOpenRef,
    tenantScopeRef,
    businessDataRequestSeqRef,
    businessDataResponseSeqRef,
    businessDataScopeCacheRef,
    businessDataRequestDebounceRef,
    quickRepliesRequestRef
  } = useOperationWorkspaceState({
    selectedTransport,
    saasSession,
    saasRuntime,
    forceOperationLaunch,
    requestedWaModuleFromUrl,
    requestedWaTenantFromUrl,
    tenantScopeId
  });
  const handleChatSelectRef = useRef(null);

  // --------------------------------------------------------------
  // Notifications
  // --------------------------------------------------------------
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);


  const {
    buildApiHeaders,
    resolveSessionSenderIdentity,
    normalizeSaasSessionPayload,
    refreshSaasSession
  } = useSaasApiSessionHelpers({
    apiUrl: API_URL,
    saasSessionRef,
    saasRuntimeRef,
    setSaasSession
  });

  const {
    recoveryStep,
    recoveryEmail,
    setRecoveryEmail,
    recoveryCode,
    setRecoveryCode,
    recoveryPassword,
    setRecoveryPassword,
    recoveryPasswordConfirm,
    setRecoveryPasswordConfirm,
    showRecoveryPassword,
    setShowRecoveryPassword,
    recoveryBusy,
    recoveryError,
    setRecoveryError,
    recoveryNotice,
    recoveryDebugCode,
    resetRecoveryFlow,
    openRecoveryFlow,
    handleRecoveryRequest,
    handleRecoveryVerify,
    handleRecoveryReset
  } = useSaasRecoveryFlow({
    loginEmail,
    setLoginEmail,
    setLoginPassword,
    setSaasAuthNotice,
    buildApiHeaders
  });

  useSaasRuntimeBootstrap({
    apiUrl: API_URL,
    buildApiHeaders,
    refreshSaasSession,
    saasSessionRef,
    normalizeWaModules,
    resolveSelectedWaModule,
    setSaasSession,
    setWaModules,
    setSelectedWaModule,
    setWaModuleError,
    setSaasRuntime,
    setLoginEmail,
    setSaasAuthBusy,
    setSaasAuthError
  });

  useSaasSessionAutoRefresh({
    authEnabled: Boolean(saasRuntime?.authEnabled),
    refreshToken: String(saasSession?.refreshToken || ''),
    accessExpiresAtUnix: Number(saasSession?.accessExpiresAtUnix || 0),
    saasSessionRef,
    refreshSaasSession,
    setSaasSession,
    setSaasAuthError
  });
  const runtimeBlock = {
    saasRuntime,
    saasSession,
    setIsConnected,
    setIsClientReady,
    setIsSwitchingTransport,
    setTransportError
  };

  const businessScopeBlock = {
    selectedCatalogModuleIdRef,
    selectedWaModuleRef,
    selectedCatalogIdRef,
    quickRepliesRequestRef,
    businessDataRequestDebounceRef,
    businessDataScopeCacheRef,
    businessDataRequestSeqRef,
    setBusinessData
  };

  const chatRuntimeBlock = {
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
    showClientProfile,
    clientProfilePanelRef,
    setShowClientProfile,
    chatPagingRef,
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
    chatIdsReferSameScope,
    setAiSuggestion,
    setIsAiLoading,
    setQrCode,
    setReplyingMessage,
    setActiveChatId,
    fileInputRef
  };

  const callbacksBlock = {
    resolveSessionSenderIdentity,
    setClientContact,
    setToasts
  };

  const {
    socket,
    fileInputRef: socketFileInputRef,
    messagesEndRef: socketMessagesEndRef,
    clientProfilePanelRef: socketClientProfilePanelRef,
    requestChatsPage,
    emitScopedBusinessDataRequest
  } = useAppSocketChatController({
    runtimeBlock,
    businessScopeBlock,
    chatRuntimeBlock,
    callbacksBlock,
    handleChatSelectRef
  });

  // --------------------------------------------------------------
  // Apply AI suggestion to input
  // --------------------------------------------------------------
  useEffect(() => {
    if (aiSuggestion && !isAiLoading) {
      setInputText(aiSuggestion);
      setAiSuggestion('');
    }
  }, [isAiLoading, aiSuggestion]);

  // --------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------
  const { resetWorkspaceState } = useWorkspaceResetOnTenantChange({
    tenantScopeId,
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
    setIsDragOver
  });

  const {
    handleSaasLogin,
    handleSaasLogout,
    handleSwitchTenant
  } = useSaasSessionActions({
    recoveryStep,
    loginEmail,
    loginPassword,
    buildApiHeaders,
    normalizeSaasSessionPayload,
    setSaasAuthBusy,
    setSaasAuthError,
    setSaasAuthNotice,
    setTenantSwitchError,
    setRecoveryError,
    setSaasSession,
    setForceOperationLaunchBypass,
    setSelectedTransport,
    setShowSaasAdminPanel,
    setLoginPassword,
    setLoginEmail,
    resetRecoveryFlow,
    saasSessionRef,
    saasRuntimeRef,
    setTenantSwitchBusy,
    setWaModules,
    setSelectedWaModule,
    setSelectedCatalogModuleId,
    socket,
    setIsConnected,
    resetWorkspaceState,
    setWaModuleError,
    setSaasRuntime
  });

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
    handleChatSelectRef.current = handleChatSelect;
  }, [handleChatSelect]);

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
    handleSendMessage
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
    prevMessagesMetaRef,
    suppressSmoothScrollUntilRef,
    setActiveChatId,
    setMessages,
    setEditingMessage,
    setReplyingMessage,
    setShowClientProfile,
    setClientContact,
    setPendingOrderCartLoad,
    setQuickReplyDraft,
    setInputText,
    removeAttachment
  });

  const handleLogoutWhatsapp = () => {
    if (!window.confirm('Cerrar sesion de WhatsApp en este equipo?')) return;
    socket.emit('logout_whatsapp');
  };

  const {
    openWhatsAppOperation: handleOpenWhatsAppOperation,
    openSaasAdminWorkspace: handleOpenSaasAdminWorkspace
  } = useWorkspaceNavigation({
    tenantScopeId,
    setShowSaasAdminPanel
  });
  const saasAuthEnabled = Boolean(saasRuntime?.authEnabled);
  const isSaasAuthenticated = !saasAuthEnabled || Boolean(saasSession?.accessToken);
  const {
    availableTenantOptions,
    canSwitchTenant,
    saasUserRole,
    canManageSaas,
  } = useSaasTenantScopeContext({
    saasRuntime,
    saasSession,
    saasAuthEnabled,
    isSaasAuthenticated,
  });

  const {
    handleSelectTransport,
    handleResetTransportSelection
  } = useTransportSelectionActions({
    socket,
    isConnected,
    chatPagingRef,
    setSelectedTransport,
    setTransportError,
    setIsSwitchingTransport,
    setIsClientReady,
    setQrCode,
    setChats,
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
    handleSelectWaModule,
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
  const handleLoadOrderToCart = (orderPayload) => {
    loadOrderToCartForActiveChat(activeChatIdRef.current, orderPayload);
  };

  const handleSendQuickReply = (quickReply = null) => {
    applyQuickReplyDraft(quickReply, activeChatIdRef.current, normalizeQuickReplyDraft);
  };
  const {
    activeTransport,
    cloudConfigured,
    selectedModeLabel,
    availableWaModules,
    hasModuleCatalog,
    activeCatalogModuleId,
    activeCatalogId,
    activeChatDetails
  } = useAppDerivedChatState({
    waRuntime,
    waModules,
    selectedCatalogModuleId,
    selectedCatalogId,
    selectedTransport,
    activeChatId,
    activeChatIdRef,
    chats
  });

  useGlobalEscapeToCloseChat({
    activeChatIdRef,
    handleExitActiveChat
  });

  function requestAiSuggestion(customPromptArg) {
    requestAiSuggestionForChat({
      socket,
      activeChatId,
      activeChatDetails,
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
  };

  useSaasPanelVisibilityController({
    canManageSaasRef,
    canManageSaas,
    showSaasAdminPanel,
    setShowSaasAdminPanel,
    saasRuntimeLoaded: saasRuntime?.loaded,
    saasRuntimeTenantId: saasRuntime?.tenant?.id,
    saasAuthEnabled,
    isSaasAuthenticated,
    forceOperationLaunch,
    selectedTransport,
    setSelectedTransport,
    saasSessionUserTenantId: saasSession?.user?.tenantId,
    saasSessionUserId: saasSession?.user?.id,
    saasSessionUserEmail: saasSession?.user?.email,
    saasAdminAutoOpenRef,
    requestedWaTenantFromUrlRef,
    tenantScopeId,
    availableTenantOptions,
    handleSwitchTenant,
    launchTenantAppliedRef,
  });

  const sessionBlock = {
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    showLoginPassword,
    setShowLoginPassword,
    saasAuthBusy,
    saasAuthError,
    saasAuthNotice,
    tenantSwitchError,
    showSaasAdminPanel,
    setShowSaasAdminPanel,
    requestedWaTenantFromUrl,
    requestedLaunchSource,
    requestedWaSectionFromUrl,
    forceOperationLaunch,
    transportError,
    waModuleError,
    saasRuntime,
    availableTenantOptions,
    canSwitchTenant,
    saasUserRole,
    canManageSaas,
    buildApiHeaders,
    handleSaasLogin,
    handleSaasLogout,
    handleSwitchTenant,
    recoveryStep,
    recoveryBusy,
    recoveryError,
    recoveryNotice,
    recoveryDebugCode,
    recoveryEmail,
    setRecoveryEmail,
    recoveryCode,
    setRecoveryCode,
    recoveryPassword,
    setRecoveryPassword,
    recoveryPasswordConfirm,
    setRecoveryPasswordConfirm,
    showRecoveryPassword,
    setShowRecoveryPassword,
    openRecoveryFlow,
    handleRecoveryRequest,
    handleRecoveryVerify,
    handleRecoveryReset,
    resetRecoveryFlow,
    saasAuthEnabled,
    isSaasAuthenticated,
    saasSession,
    tenantScopeId,
    SaasPanelComponent: SaasPanelPage
  };

  const socketBlock = {
    // TODO: mover a socketBlock desde useAppSocketChatController en el siguiente corte
    socket,
    fileInputRef: socketFileInputRef,
    messagesEndRef: socketMessagesEndRef,
    clientProfilePanelRef: socketClientProfilePanelRef
  };

  const handlersBlock = {
    handleChatSelect,
    handleSendMessage,
    handleExitActiveChat,
    handleEditMessage,
    handleCancelEditMessage,
    handleReplyMessage,
    handleCancelReplyMessage,
    handleForwardMessage,
    handleDeleteMessage,
    handleSendQuickReply,
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

  const uiStateBlock = {
    chats,
    chatsTotal,
    chatsHasMore,
    isLoadingMoreChats,
    chatSearchQuery,
    chatFilters,
    activeChatId,
    messages,
    inputText,
    setInputText,
    editingMessage,
    replyingMessage,
    myProfile,
    showClientProfile,
    setShowClientProfile,
    clientContact,
    openCompanyProfileToken,
    attachment,
    attachmentPreview,
    isAiLoading,
    aiPrompt,
    setAiPrompt,
    isCopilotMode,
    setIsCopilotMode,
    businessData,
    labelDefinitions,
    quickReplies,
    quickReplyDraft,
    setQuickReplyDraft,
    waModules,
    selectedWaModule,
    selectedCatalogModuleId,
    selectedCatalogId,
    waCapabilities,
    toasts,
    setToasts,
    pendingOrderCartLoad,
    isDragOver,
    newChatDialog,
    setNewChatDialog,
    newChatAvailableModules,
    availableWaModules,
    activeCatalogModuleId,
    activeCatalogId,
    activeTransport,
    cloudConfigured,
    selectedModeLabel,
    isSwitchingTransport
  };

  const {
    operationPageProps,
    loginScreenProps,
    transportBootstrapProps,
    saasPanelGateNode
  } = useAppPagePropsComposer({
    sessionBlock,
    socketBlock,
    handlersBlock,
    uiStateBlock
  });

  const runtimeGate = useAppRuntimeGate({
    saasRuntimeLoaded: Boolean(saasRuntime?.loaded),
    saasAuthEnabled,
    isSaasAuthenticated,
    isConnected,
    selectedTransport,
    canManageSaas,
    forceOperationLaunch,
    isClientReady
  });

  if (runtimeGate !== APP_RUNTIME_GATES.MAIN) {
    return (
      <AppRuntimeGate
        gateMode={runtimeGate}
        loginProps={loginScreenProps}
        saasPanelNode={saasPanelGateNode}
        transportBootstrapProps={transportBootstrapProps}
      />
    );
  }

  // Render: Main App
  // --------------------------------------------------------------
  return (
    <OperationPage {...operationPageProps} />
    );
}

export default App;


