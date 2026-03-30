import { lazy, useEffect, useRef, useCallback } from 'react';

import { API_URL } from './config/runtime';
import { persistSaasSession } from './features/auth/helpers/saasSessionStorage';
import {
  useOperationWorkspaceState,
  normalizeWaModules,
  resolveSelectedWaModule,
  chatIdsReferSameScope
} from './features/chat/core';
import OperationPage from './pages/OperationPage';
import { APP_RUNTIME_GATES } from './app/helpers/runtimeGate.helpers';
import {
  useAppSessionTransportState,
  useAppRuntimeGate,
  useAppPagePropsComposer,
  useAppSocketChatController,
  useAppOperationHandlers,
  useAppRuntimeSessionController
} from './app/hooks';
import { appSocketSingleton } from './app/hooks/useAppSocketChatController';
import AppRuntimeGate from './app/components/AppRuntimeGate';

import './index.css';

const SaasPanelPage = lazy(() => import('./pages/SaasPanelPage'));

function App() {
  const {
    isConnected,
    setIsConnected,
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
    chatsLoaded,
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

  const sessionStateBlock = {
    isConnected,
    setIsConnected,
    setQrCode,
    isClientReady,
    setIsClientReady,
    selectedTransport,
    setSelectedTransport,
    waRuntime,
    setWaRuntime,
    setTransportError,
    setIsSwitchingTransport,
    saasRuntime,
    setSaasRuntime,
    saasSession,
    setSaasSession,
    setSaasAuthBusy,
    setSaasAuthError,
    setTenantSwitchBusy,
    setTenantSwitchError,
    showSaasAdminPanel,
    setShowSaasAdminPanel,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    setSaasAuthNotice,
    setForceOperationLaunchBypass,
    forceOperationLaunch,
    requestedWaTenantFromUrl,
    tenantScopeId
  };

  const workspaceSessionRefsBlock = {
    setWaModules,
    setSelectedWaModule,
    setSelectedCatalogModuleId,
    setWaModuleError,
    setAiSuggestion,
    setIsAiLoading,
    saasSessionRef,
    saasRuntimeRef,
    canManageSaasRef,
    requestedWaTenantFromUrlRef,
    launchTenantAppliedRef,
    saasAdminAutoOpenRef,
    tenantScopeRef
  };

  const sessionControllerInput = {
    sessionStateBlock,
    workspaceSessionRefsBlock,
    socketLifecycleBlock: {
      socket: appSocketSingleton,
      resetWorkspaceState
    },
    normalizersBlock: {
      apiUrl: API_URL,
      normalizeWaModules,
      resolveSelectedWaModule
    }
  };

  const {
    apiSessionExports,
    sessionActions,
    tenantScopeExports,
    recoveryExports,
    sessionRuntimeBlock: appSessionRuntimeBlock
  } = useAppRuntimeSessionController(sessionControllerInput);
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
    setChatsLoaded,
    chatIdsReferSameScope,
    setAiSuggestion,
    setIsAiLoading,
    setQrCode,
    setReplyingMessage,
    setActiveChatId,
    fileInputRef
  };

  const callbacksBlock = {
    resolveSessionSenderIdentity: apiSessionExports.resolveSessionSenderIdentity,
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

  const saasAuthEnabled = Boolean(saasRuntime?.authEnabled);
  const isSaasAuthenticated = !saasAuthEnabled || Boolean(saasSession?.accessToken);
  const {
    availableTenantOptions,
    canSwitchTenant,
    saasUserRole,
    canManageSaas
  } = tenantScopeExports;

  const socketOpsBlock = {
    socket,
    requestChatsPage,
    emitScopedBusinessDataRequest,
    handleChatSelectRef
  };

  const workspaceStateBlock = {
    chats,
    setChats,
    chatsLoaded,
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
    buildApiHeaders: apiSessionExports.buildApiHeaders
  };

  const recoveryBlock = {
    openRecoveryFlow: recoveryExports.openRecoveryFlow,
    handleRecoveryRequest: recoveryExports.handleRecoveryRequest,
    handleRecoveryVerify: recoveryExports.handleRecoveryVerify,
    handleRecoveryReset: recoveryExports.handleRecoveryReset,
    resetRecoveryFlow: recoveryExports.resetRecoveryFlow
  };

  const {
    handlersBlock: operationHandlersBlock,
    sessionActionExports,
    uiDerivedExports
  } = useAppOperationHandlers({
    socketOpsBlock,
    sessionRuntimeBlock: appSessionRuntimeBlock,
    workspaceStateBlock,
    navigationHelpersBlock,
    recoveryBlock
  });

  useEffect(() => {
    resetWorkspaceStateRef.current = uiDerivedExports.resetWorkspaceState;
  }, [uiDerivedExports.resetWorkspaceState]);

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
    buildApiHeaders: apiSessionExports.buildApiHeaders,
    handleSaasLogin: sessionActionExports.handleSaasLogin,
    handleSaasLogout: sessionActionExports.handleSaasLogout,
    handleSwitchTenant: sessionActionExports.handleSwitchTenant,
    recoveryStep: recoveryExports.recoveryStep,
    recoveryBusy: recoveryExports.recoveryBusy,
    recoveryError: recoveryExports.recoveryError,
    recoveryNotice: recoveryExports.recoveryNotice,
    recoveryDebugCode: recoveryExports.recoveryDebugCode,
    recoveryEmail: recoveryExports.recoveryEmail,
    setRecoveryEmail: recoveryExports.setRecoveryEmail,
    recoveryCode: recoveryExports.recoveryCode,
    setRecoveryCode: recoveryExports.setRecoveryCode,
    recoveryPassword: recoveryExports.recoveryPassword,
    setRecoveryPassword: recoveryExports.setRecoveryPassword,
    recoveryPasswordConfirm: recoveryExports.recoveryPasswordConfirm,
    setRecoveryPasswordConfirm: recoveryExports.setRecoveryPasswordConfirm,
    showRecoveryPassword: recoveryExports.showRecoveryPassword,
    setShowRecoveryPassword: recoveryExports.setShowRecoveryPassword,
    openRecoveryFlow: recoveryExports.openRecoveryFlow,
    handleRecoveryRequest: recoveryExports.handleRecoveryRequest,
    handleRecoveryVerify: recoveryExports.handleRecoveryVerify,
    handleRecoveryReset: recoveryExports.handleRecoveryReset,
    resetRecoveryFlow: recoveryExports.resetRecoveryFlow,
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
    chatsLoaded,
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

  const appContent = runtimeGate !== APP_RUNTIME_GATES.MAIN
    ? (
      <AppRuntimeGate
        gateMode={runtimeGate}
        loginProps={loginScreenProps}
        saasPanelNode={saasPanelGateNode}
        transportBootstrapProps={transportBootstrapProps}
      />
    )
    : (
      <OperationPage {...operationPageProps} />
    );

  // Render: Main App
  // --------------------------------------------------------------
  return appContent;
}

export default App;


