import { lazy, useState, useEffect } from 'react';

import { API_URL, CHAT_PAGE_SIZE, SOCKET_AUTH_TOKEN, TRANSPORT_STORAGE_KEY } from './config/runtime';
import { persistSaasSession } from './features/auth/helpers/saasSessionStorage';
import {
  createSocketClient,
  useNewChatDialog,
  useScopedBusinessRequests,
  useSocketConnectionAuthEffect,
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
import { buildOperationPageProps } from './app/helpers/operationPageProps';
import { APP_RUNTIME_GATES } from './app/helpers/runtimeGate.helpers';
import { useAppSessionTransportState, useAppRuntimeGate, useAppChatSocketRuntime } from './app/hooks';
import AppRuntimeGate from './app/components/AppRuntimeGate';

import './index.css';

const SaasPanelPage = lazy(() => import('./pages/SaasPanelPage'));
const socket = createSocketClient(API_URL, SOCKET_AUTH_TOKEN);


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

  const {
    requestQuickRepliesForModule,
    emitScopedBusinessDataRequest
  } = useScopedBusinessRequests({
    socket,
    selectedCatalogModuleIdRef,
    selectedWaModuleRef,
    selectedCatalogIdRef,
    quickRepliesRequestRef,
    businessDataRequestDebounceRef,
    businessDataScopeCacheRef,
    businessDataRequestSeqRef,
    setBusinessData
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


  useSocketConnectionAuthEffect({
    socket,
    saasRuntime,
    saasSession,
    selectedWaModuleRef,
    selectedWaModuleId: selectedWaModule?.moduleId,
    socketAuthToken: SOCKET_AUTH_TOKEN,
    setIsConnected,
    setIsClientReady
  });

  const { requestChatsPage } = useAppChatSocketRuntime({
    socket,
    chatPageSize: CHAT_PAGE_SIZE,
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
    transportStorageKey: TRANSPORT_STORAGE_KEY,
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
    setIsConnected,
    setIsSwitchingTransport,
    setIsClientReady,
    setTransportError,
    showClientProfile,
    clientProfilePanelRef,
    setShowClientProfile,

    socketPagingRef: chatPagingRef,
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

    handleChatSelect,
    resolveSessionSenderIdentity,
    setClientContact,
    setToasts
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
  });

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
    requestQuickRepliesForModule,
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

  const operationPageProps = buildOperationPageProps({
    forceOperationLaunch,
    socket,
    fileInputRef,
    handleFileChange,
    chats,
    activeChatId,
    handleChatSelect,
    myProfile,
    businessData,
    handleLogoutWhatsapp,
    handleRefreshChats,
    handleStartNewChat,
    labelDefinitions,
    handleCreateLabel,
    handleLoadMoreChats,
    chatsHasMore,
    isLoadingMoreChats,
    chatsTotal,
    chatSearchQuery,
    handleChatSearchChange,
    chatFilters,
    handleChatFiltersChange,
    handleOpenCompanyProfile,
    saasAuthEnabled,
    availableTenantOptions,
    tenantScopeId,
    tenantSwitchError,
    handleSaasLogout,
    canManageSaas,
    handleOpenSaasAdminWorkspace,
    availableWaModules,
    clientContact,
    messages,
    messagesEndRef,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    showClientProfile,
    setShowClientProfile,
    inputText,
    setInputText,
    handleSendMessage,
    attachment,
    attachmentPreview,
    removeAttachment,
    isAiLoading,
    requestAiSuggestion,
    aiPrompt,
    setAiPrompt,
    isCopilotMode,
    setIsCopilotMode,
    handleToggleChatLabel,
    handleToggleChatPinned,
    handleEditMessage,
    waCapabilities,
    handleReplyMessage,
    handleForwardMessage,
    handleDeleteMessage,
    quickReplies,
    handleSendQuickReply,
    quickReplyDraft,
    setQuickReplyDraft,
    handleLoadOrderToCart,
    handleCancelEditMessage,
    handleCancelReplyMessage,
    editingMessage,
    replyingMessage,
    buildApiHeaders,
    clientProfilePanelRef,
    toasts,
    setToasts,
    pendingOrderCartLoad,
    openCompanyProfileToken,
    selectedCatalogModuleId: activeCatalogModuleId,
    activeCatalogId,
    selectedWaModule,
    handleSelectCatalogModule,
    handleSelectCatalog,
    handleUploadCatalogImage,
    handleCartSnapshotChange,
    newChatDialog,
    setNewChatDialog,
    newChatAvailableModules,
    handleConfirmNewChat,
    handleCancelNewChatDialog,
    showSaasAdminPanel,
    setShowSaasAdminPanel,
    handleOpenWhatsAppOperation,
    saasUserRole,
    saasSession,
    requestedWaTenantFromUrl,
    requestedLaunchSource,
    requestedWaSectionFromUrl,
    SaasPanelComponent: SaasPanelPage
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

  const loginScreenProps = {
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    showLoginPassword,
    setShowLoginPassword,
    saasAuthBusy,
    saasAuthError,
    saasAuthNotice,
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
    handleSaasLogin,
    openRecoveryFlow,
    handleRecoveryRequest,
    handleRecoveryVerify,
    handleRecoveryReset,
    resetRecoveryFlow
  };

  const saasPanelGateNode = (
    <SaasPanelPage
      isOpen
      onClose={handleSaasLogout}
      onLogout={handleSaasLogout}
      onOpenWhatsAppOperation={handleOpenWhatsAppOperation}
      buildApiHeaders={buildApiHeaders}
      activeTenantId={tenantScopeId}
      canManageSaas={canManageSaas}
      userRole={saasUserRole}
      isSuperAdmin={Boolean(saasSession?.user?.isSuperAdmin)}
      currentUser={saasSession?.user || null}
      preferredTenantId={requestedWaTenantFromUrl || ''}
      launchSource={requestedLaunchSource || ''}
      initialSection={requestedWaSectionFromUrl || 'saas_resumen'}
      resetKeys={[tenantScopeId, saasSession?.user?.userId, requestedWaTenantFromUrl, requestedLaunchSource]}
    />
  );

  const transportBootstrapProps = {
    selectedModeLabel,
    isSwitchingTransport,
    activeTransport,
    cloudConfigured,
    waModuleError,
    transportError
  };

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


