import { lazy, useEffect, useRef, useCallback } from 'react';

import { API_URL } from './config/runtime';
import { persistSaasSession } from './features/auth/helpers/saasSessionStorage';
import {
  useOperationWorkspaceState,
  normalizeWaModules,
  resolveSelectedWaModule,
  chatIdsReferSameScope
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
  useAppSocketChatController,
  useAppOperationHandlers
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
  const resetWorkspaceStateRef = useRef(() => {});
  const resetWorkspaceState = useCallback((...args) => {
    if (typeof resetWorkspaceStateRef.current === 'function') {
      resetWorkspaceStateRef.current(...args);
    }
  }, []);

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
    isClientReady,
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

  const socketOpsBlock = {
    socket,
    requestChatsPage,
    emitScopedBusinessDataRequest,
    handleChatSelectRef
  };

  const sessionRuntimeBlock = {
    tenantScopeId,
    tenantScopeRef,
    isConnected,
    selectedTransport,
    waRuntime,
    setIsConnected,
    setIsClientReady,
    setQrCode,
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
  };

  const workspaceStateBlock = {
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
    shouldInstantScrollRef,
    prevMessagesMetaRef,
    suppressSmoothScrollUntilRef,
    selectedWaModuleRef,
    waModulesRef,
    selectedCatalogModuleIdRef,
    selectedCatalogIdRef
  };

  const navigationHelpersBlock = {
    buildApiHeaders
  };

  const recoveryBlock = {
    openRecoveryFlow,
    handleRecoveryRequest,
    handleRecoveryVerify,
    handleRecoveryReset,
    resetRecoveryFlow
  };

  const {
    handlersBlock: operationHandlersBlock,
    sessionActionExports,
    uiDerivedExports
  } = useAppOperationHandlers({
    socketOpsBlock,
    sessionRuntimeBlock,
    workspaceStateBlock,
    navigationHelpersBlock,
    recoveryBlock
  });

  useEffect(() => {
    resetWorkspaceStateRef.current = uiDerivedExports.resetWorkspaceState;
  }, [uiDerivedExports.resetWorkspaceState]);

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
    handleSwitchTenant: sessionActionExports.handleSwitchTenant,
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
    handleSaasLogin: sessionActionExports.handleSaasLogin,
    handleSaasLogout: sessionActionExports.handleSaasLogout,
    handleSwitchTenant: sessionActionExports.handleSwitchTenant,
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
    newChatDialog: uiDerivedExports.newChatDialog,
    setNewChatDialog: uiDerivedExports.setNewChatDialog,
    newChatAvailableModules: uiDerivedExports.newChatAvailableModules,
    availableWaModules: uiDerivedExports.availableWaModules,
    activeCatalogModuleId: uiDerivedExports.activeCatalogModuleId,
    activeCatalogId: uiDerivedExports.activeCatalogId,
    activeTransport: uiDerivedExports.activeTransport,
    cloudConfigured: uiDerivedExports.cloudConfigured,
    selectedModeLabel: uiDerivedExports.selectedModeLabel,
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
    handlersBlock: operationHandlersBlock,
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


