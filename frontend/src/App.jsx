import { lazy, useEffect, useRef, useCallback, useState } from 'react';

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
import PushNotificationPrompt from './features/push/components/PushNotificationPrompt';
import { queueChatNotificationOpenRequest } from './features/chat/core/helpers/notificationWorkspace.helpers';

import './index.css';

const SaasPanelPage = lazy(() => import('./pages/SaasPanelPage'));

const isMobileOperationViewport = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(max-width: 768px)')?.matches
);

function App() {
  const {
    isConnected,
    setIsConnected,
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
  const [forceMobileOperation, setForceMobileOperation] = useState(() => isMobileOperationViewport());
  const effectiveForceOperationLaunch = forceOperationLaunch || forceMobileOperation;
  const foregroundSyncRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 768px)');
    const updateMobileOperationMode = () => setForceMobileOperation(query.matches);
    updateMobileOperationMode();
    query.addEventListener?.('change', updateMobileOperationMode);
    return () => query.removeEventListener?.('change', updateMobileOperationMode);
  }, []);

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
    isCacheLoaded,
    setIsCacheLoaded,
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
    messagesEndRef,
    clientProfilePanelRef,
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
    forceOperationLaunch: effectiveForceOperationLaunch,
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const setRealViewportHeight = () => {
      document.documentElement.style.setProperty('--real-vh', `${window.innerHeight * 0.01}px`);
    };

    setRealViewportHeight();
    window.addEventListener('resize', setRealViewportHeight);
    window.addEventListener('orientationchange', setRealViewportHeight);
    window.addEventListener('pageshow', setRealViewportHeight);
    document.addEventListener('visibilitychange', setRealViewportHeight);

    return () => {
      window.removeEventListener('resize', setRealViewportHeight);
      window.removeEventListener('orientationchange', setRealViewportHeight);
      window.removeEventListener('pageshow', setRealViewportHeight);
      document.removeEventListener('visibilitychange', setRealViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const queueChatOpen = (payload = {}) => {
      const chatId = String(payload?.chatId || '').trim();
      if (!chatId) return;
      queueChatNotificationOpenRequest({
        tenantId: String(payload?.tenantId || tenantScopeId || '').trim(),
        chatId,
        moduleId: String(payload?.moduleId || '').trim().toLowerCase(),
        source: String(payload?.source || 'push_notification').trim(),
        focusInput: payload?.focusInput === true || String(payload?.focus || '').trim().toLowerCase() === 'input'
      });
    };

    const handleServiceWorkerMessage = (event) => {
      if (event?.data?.type !== 'NOTIFICATION_CLICK') return;
      queueChatOpen(event.data);
    };

    navigator.serviceWorker?.addEventListener?.('message', handleServiceWorkerMessage);

    try {
      const params = new URLSearchParams(window.location.search || '');
      const chatId = String(params.get('chat') || params.get('chatId') || '').trim();
      if (chatId) {
        queueChatOpen({
          chatId,
          tenantId: params.get('tenantId') || tenantScopeId,
          moduleId: params.get('moduleId') || '',
          source: 'push_url',
          focusInput: String(params.get('focus') || '').trim().toLowerCase() === 'input'
        });
        params.delete('chat');
        params.delete('chatId');
        params.delete('tenantId');
        params.delete('moduleId');
        params.delete('focus');
        const nextSearch = params.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
        window.history.replaceState(window.history.state, '', nextUrl);
      }
    } catch (_) {
      // keep notification navigation best-effort
    }

    return () => {
      navigator.serviceWorker?.removeEventListener?.('message', handleServiceWorkerMessage);
    };
  }, [tenantScopeId]);

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
    forceOperationLaunch: effectiveForceOperationLaunch,
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
    setTransportError,
    tenantScopeId
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
    forceOperationLaunch: effectiveForceOperationLaunch,
    forceOperationLaunchRef,
    waRuntime,
    showClientProfile,
    clientProfilePanelRef,
    setShowClientProfile,
    chatPagingRef,
    messagesCacheRef,
    pendingOutgoingByChatRef,
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
    setSendTemplateSubmitting,
    setSendTemplateOpen,
    setSelectedSendTemplate,
    setSelectedSendTemplatePreview,
    setSelectedSendTemplatePreviewError,
    setMessages,
    setEditingMessage,
    setChats,
    setChatsLoaded,
    chatIdsReferSameScope,
    setAiSuggestion,
    setIsAiLoading,
    setReplyingMessage,
    setActiveChatId,
    fileInputRef
  };

  const callbacksBlock = {
    resolveSessionSenderIdentity: apiSessionExports.resolveSessionSenderIdentity,
    setClientContact,
    setToasts,
    buildApiHeaders: apiSessionExports.buildApiHeaders
  };

  const {
    socket,
    fileInputRef: socketFileInputRef,
    messagesEndRef: socketMessagesEndRef,
    clientProfilePanelRef: socketClientProfilePanelRef,
    requestChatsPage,
    emitScopedBusinessDataRequest,
    chatAssignmentState,
    chatCommercialStatusState
  } = useAppSocketChatController({
    runtimeBlock,
    businessScopeBlock,
    chatRuntimeBlock,
    callbacksBlock,
    handleChatSelectRef
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const handleForegroundSync = async () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (foregroundSyncRef.current && now - foregroundSyncRef.current < 5000) return;
      foregroundSyncRef.current = now;

      try {
        if (socket && !socket.connected && typeof socket.connect === 'function') {
          socket.connect();
        }

        const expiresAt = Number(saasSessionRef.current?.accessExpiresAtUnix || 0) || 0;
        const nowUnix = Math.floor(Date.now() / 1000);
        if (expiresAt && expiresAt - nowUnix <= 120) {
          await apiSessionExports.refreshSaasSession?.();
        }

        requestChatsPage?.({ reset: true });
      } catch (_) {
        // Foreground resume should never block the cached UI.
      }
    };

    document.addEventListener('visibilitychange', handleForegroundSync);
    window.addEventListener('pageshow', handleForegroundSync);
    window.addEventListener('focus', handleForegroundSync);

    return () => {
      document.removeEventListener('visibilitychange', handleForegroundSync);
      window.removeEventListener('pageshow', handleForegroundSync);
      window.removeEventListener('focus', handleForegroundSync);
    };
  }, [apiSessionExports.refreshSaasSession, requestChatsPage, saasSessionRef, socket]);

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
    isCacheLoaded,
    setIsCacheLoaded,
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
    forceOperationLaunch: effectiveForceOperationLaunch,
    transportError,
    waModuleError,
    saasRuntime,
    availableTenantOptions,
    canSwitchTenant,
    saasUserRole,
    canManageSaas,
    buildApiHeaders: apiSessionExports.buildApiHeaders,
    refreshCurrentUserPermissions: apiSessionExports.refreshCurrentUserPermissions,
    handleSaasLogin: sessionActions.handleSaasLogin,
    handleSaasLogout: sessionActions.handleSaasLogout,
    handleSwitchTenant: sessionActions.handleSwitchTenant,
    deviceAuthStep: sessionActions.deviceAuthStep,
    pendingDeviceAuth: sessionActions.pendingDeviceAuth,
    otpCode: sessionActions.otpCode,
    setOtpCode: sessionActions.setOtpCode,
    deviceName: sessionActions.deviceName,
    setDeviceName: sessionActions.setDeviceName,
    otpResendAvailableAt: sessionActions.otpResendAvailableAt,
    handleOtpBack: sessionActions.handleOtpBack,
    handleOtpContinue: sessionActions.handleOtpContinue,
    handleVerifyDeviceOtp: sessionActions.handleVerifyDeviceOtp,
    handleResendDeviceOtp: sessionActions.handleResendDeviceOtp,
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
    sendTemplateOpen,
    sendTemplateOptions,
    sendTemplateOptionsLoading,
    sendTemplateOptionsError,
    selectedSendTemplate,
    selectedSendTemplatePreview,
    selectedSendTemplatePreviewLoading,
    selectedSendTemplatePreviewError,
    sendTemplateSubmitting,
    waModules,
    selectedWaModule,
    selectedCatalogModuleId,
    selectedCatalogId,
    chatAssignmentState,
    chatCommercialStatusState,
    waCapabilities,
    toasts,
    setToasts,
    pendingOrderCartLoad,
    isDragOver,
    isCacheLoaded,
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
    allowOfflineOperation: forceMobileOperation,
    selectedTransport,
    canManageSaas,
    forceOperationLaunch: effectiveForceOperationLaunch,
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
  return (
    <>
      {appContent}
      <PushNotificationPrompt
        isAuthenticated={isSaasAuthenticated}
        buildApiHeaders={apiSessionExports.buildApiHeaders}
      />
    </>
  );
}

export default App;
