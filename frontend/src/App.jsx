import { lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { API_URL, CHAT_PAGE_SIZE, SOCKET_AUTH_TOKEN, TRANSPORT_STORAGE_KEY } from './config/runtime';
import { loadStoredSaasSession, persistSaasSession } from './features/auth/helpers/saasSessionStorage';
import {
  createSocketClient,
  useNewChatDialog,
  useMessagesAutoScroll,
  useChatRuntimeSyncEffects,
  useScopedBusinessRequests,
  useSocketConnectionAuthEffect,
  useSocketConnectionRuntimeEvents,
  useSocketBusinessDataEvents,
  useSocketMessageLifecycleEvents,
  useSocketAiAndSessionEvents,
  useSocketChatConversationEvents,
  useChatPaginationRequester,
  useWaModuleSocketEvents,
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
  readWaLaunchParams,
  normalizeQuickRepliesSocketPayload,
  resolveScopedCatalogSelection,
  requestAiSuggestionForChat,
  normalizeCatalogItem,
  normalizeProfilePhotoUrl,
  normalizeModuleImageUrl,
  normalizeProfilePayload,
  normalizeBusinessDataPayload,
  normalizeWaModules,
  resolveSelectedWaModule,
  normalizeChatLabels,
  cleanLooseText,
  normalizeDigits,
  isLikelyPhoneDigits,
  normalizeScopedModuleId,
  parseScopedChatId,
  buildScopedChatId,
  normalizeChatScopedId,
  chatIdsReferSameScope,
  extractPhoneFromText,
  getBestChatPhone,
  repairMojibake,
  sanitizeDisplayText,
  normalizeMessageFilename,
  isGenericFilename,
  isMachineLikeFilename,
  normalizeParticipantList,
  normalizeMessageLocation,
  normalizeQuotedMessage,
  getMessagePreviewText,
  isInternalIdentifier,
  normalizeDisplayNameKey,
  isPlaceholderChat,
  chatIdentityKey,
  dedupeChats,
  chatMatchesQuery,
  normalizeFilterToken,
  normalizeChatFilters,
  buildFiltersKey,
  chatLabelTokenSet,
  chatMatchesFilters,
  normalizeQuickReplyDraft,
  isVisibleChatId,
  upsertAndSortChat
} from './features/chat/core';
import { StatusScreen, TransportBootstrapScreen } from './features/chat/components';
import { useSaasRecoveryFlow } from './features/auth/hooks/useSaasRecoveryFlow';
import useSaasRuntimeBootstrap from './features/auth/hooks/useSaasRuntimeBootstrap';
import useSaasSessionAutoRefresh from './features/auth/hooks/useSaasSessionAutoRefresh';
import { useSaasSessionActions } from './features/auth/hooks/useSaasSessionActions';
import useSaasApiSessionHelpers from './features/auth/hooks/useSaasApiSessionHelpers';
import SaasLoginScreen from './features/auth/components/SaasLoginScreen';
import OperationPage from './pages/OperationPage';
import { useSaasPanelVisibilityController, useSaasTenantScopeContext } from './features/saas/hooks';

import './index.css';

const SaasPanelPage = lazy(() => import('./pages/SaasPanelPage'));
const socket = createSocketClient(API_URL, SOCKET_AUTH_TOKEN);


function App() {
  // --------------------------------------------------------------
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [isClientReady, setIsClientReady] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState('');
  const [waRuntime, setWaRuntime] = useState({ requestedTransport: 'idle', activeTransport: 'idle', cloudConfigured: false, cloudReady: false, availableTransports: ['cloud'] });
  const [transportError, setTransportError] = useState('');
  const [isSwitchingTransport, setIsSwitchingTransport] = useState(false);

  const [saasRuntime, setSaasRuntime] = useState({
    loaded: false,
    authEnabled: false,
    tenant: null,
    tenants: [],
    authContext: { enabled: false, isAuthenticated: false, user: null }
  });
  const [saasSession, setSaasSession] = useState(() => loadStoredSaasSession());
  const [saasAuthBusy, setSaasAuthBusy] = useState(false);
  const [saasAuthError, setSaasAuthError] = useState('');
  const [tenantSwitchBusy, setTenantSwitchBusy] = useState(false);
  const [tenantSwitchError, setTenantSwitchError] = useState('');
  const [showSaasAdminPanel, setShowSaasAdminPanel] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [saasAuthNotice, setSaasAuthNotice] = useState('');
  const [forceOperationLaunchBypass, setForceOperationLaunchBypass] = useState(false);
  const waLaunchParams = useMemo(() => readWaLaunchParams(window.location.search || ''), []);
  const forceOperationLaunch = waLaunchParams.forceOperationLaunch && !forceOperationLaunchBypass;
  const requestedWaModuleFromUrl = waLaunchParams.requestedWaModuleId;
  const requestedWaTenantFromUrl = waLaunchParams.requestedWaTenantId;
  const requestedWaSectionFromUrl = waLaunchParams.requestedWaSectionId;
  const requestedLaunchSource = waLaunchParams.requestedLaunchSource;
  const tenantScopeId = String(saasSession?.user?.tenantId || saasRuntime?.tenant?.id || 'default').trim() || 'default';

  // --------------------------------------------------------------
  const [chats, setChats] = useState([]);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [chatsHasMore, setChatsHasMore] = useState(true);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatFilters, setChatFilters] = useState({ labelTokens: [], unreadOnly: false, unlabeledOnly: false, contactMode: 'all', archivedMode: 'all', pinnedMode: 'all' });
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingMessage, setReplyingMessage] = useState(null);

  // --------------------------------------------------------------
  const [myProfile, setMyProfile] = useState(null);

  // --------------------------------------------------------------
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [clientContact, setClientContact] = useState(null);
  const [openCompanyProfileToken, setOpenCompanyProfileToken] = useState(0);

  // --------------------------------------------------------------
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const fileInputRef = useRef(null);

  // --------------------------------------------------------------
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isCopilotMode, setIsCopilotMode] = useState(false);

  // --------------------------------------------------------------
  const [businessData, setBusinessData] = useState({ profile: null, labels: [], catalog: [], catalogMeta: { source: 'local', nativeAvailable: false } });
  const [activeCartSnapshot, setActiveCartSnapshot] = useState(null);
  const [labelDefinitions, setLabelDefinitions] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [quickReplyDraft, setQuickReplyDraft] = useState(null);
  const [waModules, setWaModules] = useState([]);
  const [selectedWaModule, setSelectedWaModule] = useState(null);
  const [selectedCatalogModuleId, setSelectedCatalogModuleId] = useState('');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [waModuleError, setWaModuleError] = useState('');
  const [waCapabilities, setWaCapabilities] = useState({ messageEdit: true, messageEditSync: true, messageForward: true, messageDelete: true, messageReply: true, quickReplies: false, quickRepliesRead: false, quickRepliesWrite: false });
  const [toasts, setToasts] = useState([]);
  const [pendingOrderCartLoad, setPendingOrderCartLoad] = useState(null);
  const activeCartSnapshotSignatureRef = useRef('');
  const handleCartSnapshotChange = useCallback((snapshot) => {
    const normalized = snapshot && typeof snapshot === 'object' ? snapshot : null;
    const signature = normalized ? JSON.stringify(normalized) : '';
    if (activeCartSnapshotSignatureRef.current === signature) return;
    activeCartSnapshotSignatureRef.current = signature;
    setActiveCartSnapshot(normalized);
  }, []);
  // --------------------------------------------------------------
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);
  const clientProfilePanelRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const chatsRef = useRef([]);
  const chatSearchRef = useRef('');
  const chatFiltersRef = useRef(normalizeChatFilters({ labelTokens: [], unreadOnly: false, unlabeledOnly: false, contactMode: 'all', archivedMode: 'all', pinnedMode: 'all' }));
  const chatPagingRef = useRef({ offset: 0, hasMore: true, loading: false });
  const shouldInstantScrollRef = useRef(false);
  const prevMessagesMetaRef = useRef({ count: 0, lastId: '' });
  const suppressSmoothScrollUntilRef = useRef(0);
  const selectedTransportRef = useRef(selectedTransport);
  const selectedWaModuleRef = useRef(selectedWaModule);
  const waModulesRef = useRef(waModules);
  const selectedCatalogModuleIdRef = useRef(selectedCatalogModuleId);
  const selectedCatalogIdRef = useRef(selectedCatalogId);
  const saasSessionRef = useRef(saasSession);
  const saasRuntimeRef = useRef(saasRuntime);
  const forceOperationLaunchRef = useRef(forceOperationLaunch);
  const canManageSaasRef = useRef(false);
  const requestedWaModuleFromUrlRef = useRef(requestedWaModuleFromUrl);
  const requestedWaTenantFromUrlRef = useRef(requestedWaTenantFromUrl);
  const launchTenantAppliedRef = useRef('');
  const saasAdminAutoOpenRef = useRef('');
  const tenantScopeRef = useRef(tenantScopeId);
  const businessDataRequestSeqRef = useRef(0);
  const businessDataResponseSeqRef = useRef(0);
  const businessDataScopeCacheRef = useRef(new Map());
  const businessDataRequestDebounceRef = useRef({ key: '', at: 0 });
  const quickRepliesRequestRef = useRef({ key: '', at: 0 });

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
    setIsClientReady,
    setTransportError,
    showClientProfile,
    clientProfilePanelRef,
    setShowClientProfile
  });

  useEffect(() => {
    if (!isClientReady) return;
    const timer = setTimeout(() => {
      requestChatsPage({ reset: true });
    }, 180);
    return () => clearTimeout(timer);
  }, [chatSearchQuery, chatFilters, isClientReady]);

  const { requestChatsPage } = useChatPaginationRequester({
    socket,
    chatPagingRef,
    chatSearchRef,
    chatFiltersRef,
    chatPageSize: CHAT_PAGE_SIZE,
    buildFiltersKey,
    setChatsHasMore,
    setChatsTotal,
    setIsLoadingMoreChats
  });


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
    chatPagingRef,
    setQrCode,
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
    setQrCode,
    setChats,
    setChatsTotal,
    setChatsHasMore,
    chatPagingRef,
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
    dedupeChats,
    chatPagingRef,
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

  if (!saasRuntime?.loaded) {
    return <StatusScreen message='Inicializando plataforma SaaS...' />;
  }

  if (saasAuthEnabled && !isSaasAuthenticated) {
    return (
      <SaasLoginScreen
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        showLoginPassword={showLoginPassword}
        setShowLoginPassword={setShowLoginPassword}
        saasAuthBusy={saasAuthBusy}
        saasAuthError={saasAuthError}
        saasAuthNotice={saasAuthNotice}
        recoveryStep={recoveryStep}
        recoveryBusy={recoveryBusy}
        recoveryError={recoveryError}
        recoveryNotice={recoveryNotice}
        recoveryDebugCode={recoveryDebugCode}
        recoveryEmail={recoveryEmail}
        setRecoveryEmail={setRecoveryEmail}
        recoveryCode={recoveryCode}
        setRecoveryCode={setRecoveryCode}
        recoveryPassword={recoveryPassword}
        setRecoveryPassword={setRecoveryPassword}
        recoveryPasswordConfirm={recoveryPasswordConfirm}
        setRecoveryPasswordConfirm={setRecoveryPasswordConfirm}
        showRecoveryPassword={showRecoveryPassword}
        setShowRecoveryPassword={setShowRecoveryPassword}
        handleSaasLogin={handleSaasLogin}
        openRecoveryFlow={openRecoveryFlow}
        handleRecoveryRequest={handleRecoveryRequest}
        handleRecoveryVerify={handleRecoveryVerify}
        handleRecoveryReset={handleRecoveryReset}
        resetRecoveryFlow={resetRecoveryFlow}
      />
    );
  }

  if (!isConnected) {
    return <StatusScreen message='Conectando con el servidor...' />;
  }
  // --------------------------------------------------------------

  // --------------------------------------------------------------
  // Render: Transport Selector
  // --------------------------------------------------------------
  if (!selectedTransport) {
    if (canManageSaas && !forceOperationLaunch) {
      return (
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
    }

    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', maxWidth: '520px', width: '100%' }}>
          <div className="loader" style={{ margin: '0 auto 14px' }} />
          <p style={{ color: '#9eb2bf', fontSize: '0.9rem', margin: 0 }}>
            Preparando operacion WhatsApp Cloud API...
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------
  // Render: Transport Bootstrap
  // --------------------------------------------------------------
  if (!isClientReady) {
    return (
      <TransportBootstrapScreen
        selectedModeLabel={selectedModeLabel}
        isSwitchingTransport={isSwitchingTransport}
        activeTransport={activeTransport}
        cloudConfigured={cloudConfigured}
        waModuleError={waModuleError}
        transportError={transportError}
      />
    );
  }

  // Render: Main App
  // --------------------------------------------------------------
  return (
    <OperationPage
      forceOperationLaunch={forceOperationLaunch}
      socket={socket}
      fileInputRef={fileInputRef}
      handleFileChange={handleFileChange}
      chats={chats}
      activeChatId={activeChatId}
      handleChatSelect={handleChatSelect}
      myProfile={myProfile}
      businessData={businessData}
      handleLogoutWhatsapp={handleLogoutWhatsapp}
      handleRefreshChats={handleRefreshChats}
      handleStartNewChat={handleStartNewChat}
      labelDefinitions={labelDefinitions}
      handleCreateLabel={handleCreateLabel}
      handleLoadMoreChats={handleLoadMoreChats}
      chatsHasMore={chatsHasMore}
      isLoadingMoreChats={isLoadingMoreChats}
      chatsTotal={chatsTotal}
      chatSearchQuery={chatSearchQuery}
      handleChatSearchChange={handleChatSearchChange}
      chatFilters={chatFilters}
      handleChatFiltersChange={handleChatFiltersChange}
      handleOpenCompanyProfile={handleOpenCompanyProfile}
      saasAuthEnabled={saasAuthEnabled}
      availableTenantOptions={availableTenantOptions}
      tenantScopeId={tenantScopeId}
      tenantSwitchError={tenantSwitchError}
      handleSaasLogout={handleSaasLogout}
      canManageSaas={canManageSaas}
      handleOpenSaasAdminWorkspace={handleOpenSaasAdminWorkspace}
      availableWaModules={availableWaModules}
      clientContact={clientContact}
      messages={messages}
      messagesEndRef={messagesEndRef}
      isDragOver={isDragOver}
      handleDragOver={handleDragOver}
      handleDragLeave={handleDragLeave}
      handleDrop={handleDrop}
      showClientProfile={showClientProfile}
      setShowClientProfile={setShowClientProfile}
      inputText={inputText}
      setInputText={setInputText}
      handleSendMessage={handleSendMessage}
      attachment={attachment}
      attachmentPreview={attachmentPreview}
      removeAttachment={removeAttachment}
      isAiLoading={isAiLoading}
      requestAiSuggestion={requestAiSuggestion}
      aiPrompt={aiPrompt}
      setAiPrompt={setAiPrompt}
      isCopilotMode={isCopilotMode}
      setIsCopilotMode={setIsCopilotMode}
      handleToggleChatLabel={handleToggleChatLabel}
      handleToggleChatPinned={handleToggleChatPinned}
      handleEditMessage={handleEditMessage}
      waCapabilities={waCapabilities}
      handleReplyMessage={handleReplyMessage}
      handleForwardMessage={handleForwardMessage}
      handleDeleteMessage={handleDeleteMessage}
      quickReplies={quickReplies}
      handleSendQuickReply={handleSendQuickReply}
      quickReplyDraft={quickReplyDraft}
      setQuickReplyDraft={setQuickReplyDraft}
      handleLoadOrderToCart={handleLoadOrderToCart}
      handleCancelEditMessage={handleCancelEditMessage}
      handleCancelReplyMessage={handleCancelReplyMessage}
      editingMessage={editingMessage}
      replyingMessage={replyingMessage}
      buildApiHeaders={buildApiHeaders}
      clientProfilePanelRef={clientProfilePanelRef}
      toasts={toasts}
      setToasts={setToasts}
      pendingOrderCartLoad={pendingOrderCartLoad}
      openCompanyProfileToken={openCompanyProfileToken}
      selectedCatalogModuleId={activeCatalogModuleId}
      activeCatalogId={activeCatalogId}
      selectedWaModule={selectedWaModule}
      handleSelectCatalogModule={handleSelectCatalogModule}
      handleSelectCatalog={handleSelectCatalog}
      handleUploadCatalogImage={handleUploadCatalogImage}
      handleCartSnapshotChange={handleCartSnapshotChange}
      newChatDialog={newChatDialog}
      setNewChatDialog={setNewChatDialog}
      newChatAvailableModules={newChatAvailableModules}
      handleConfirmNewChat={handleConfirmNewChat}
      handleCancelNewChatDialog={handleCancelNewChatDialog}
      showSaasAdminPanel={showSaasAdminPanel}
      setShowSaasAdminPanel={setShowSaasAdminPanel}
      handleOpenWhatsAppOperation={handleOpenWhatsAppOperation}
      saasUserRole={saasUserRole}
      saasSession={saasSession}
      requestedWaTenantFromUrl={requestedWaTenantFromUrl}
      requestedLaunchSource={requestedLaunchSource}
      requestedWaSectionFromUrl={requestedWaSectionFromUrl}
      SaasPanelComponent={SaasPanelPage}
    />
    );
}

export default App;


