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

  // Socket Events
  // --------------------------------------------------------------
  useEffect(() => {
    socket.on('chats', (payload) => {
      const isLegacy = Array.isArray(payload);
      const page = isLegacy
        ? { items: payload, offset: 0, total: payload.length, hasMore: false }
        : (payload || {});

      const incomingQuery = String(page.query || '').trim();
      if (incomingQuery !== chatSearchRef.current) return;
      const incomingFilterKey = String(page.filterKey || '').trim();
      if (incomingFilterKey && incomingFilterKey !== buildFiltersKey(chatFiltersRef.current)) return;

      const rawItems = Array.isArray(page.items) ? page.items : [];
      const previousById = new Map(
        (Array.isArray(chatsRef.current) ? chatsRef.current : [])
          .filter((chat) => chat?.id)
          .map((chat) => [String(chat.id), chat])
      );
      const hydrated = rawItems
        .filter((chat) => chat?.id && isVisibleChatId(chat.id))
        .map((chat) => {
          const incomingScopeModuleId = String(chat?.scopeModuleId || chat?.lastMessageModuleId || chat?.sentViaModuleId || '').trim().toLowerCase();
          const incomingChatId = String(chat?.id || '').trim();
          const normalizedIncomingId = normalizeChatScopedId(incomingChatId, incomingScopeModuleId || '');
          const previous = previousById.get(String(normalizedIncomingId || '')) || previousById.get(incomingChatId) || null;
          const previousScopeModuleId = String(previous?.scopeModuleId || previous?.lastMessageModuleId || '').trim().toLowerCase();
          const finalId = normalizeChatScopedId(normalizedIncomingId || incomingChatId, incomingScopeModuleId || previousScopeModuleId || '');
          const parsedFinal = parseScopedChatId(finalId || incomingChatId);
          const scopeModuleId = String(parsedFinal?.scopeModuleId || incomingScopeModuleId || previousScopeModuleId || '').trim().toLowerCase() || null;
          const baseChatId = String(parsedFinal?.baseChatId || chat?.baseChatId || previous?.baseChatId || incomingChatId).trim() || null;
          return {
            ...chat,
            id: finalId || incomingChatId,
            baseChatId,
            scopeModuleId,
            name: sanitizeDisplayText(chat?.name || ''),
            subtitle: sanitizeDisplayText(chat?.subtitle || ''),
            status: sanitizeDisplayText(chat?.status || ''),
            phone: getBestChatPhone(chat),
            lastMessage: sanitizeDisplayText(chat?.lastMessage || ''),
            labels: normalizeChatLabels(chat.labels),
            profilePicUrl: normalizeProfilePhotoUrl(chat?.profilePicUrl),
            isMyContact: chat?.isMyContact === true,
            archived: Boolean(chat?.archived),
            pinned: Boolean(chat?.pinned),
            lastMessageModuleId: String(chat?.lastMessageModuleId || chat?.sentViaModuleId || scopeModuleId || previous?.lastMessageModuleId || '').trim().toLowerCase() || null,
            lastMessageModuleName: String(chat?.lastMessageModuleName || chat?.sentViaModuleName || previous?.lastMessageModuleName || '').trim() || null,
            lastMessageModuleImageUrl: normalizeModuleImageUrl(chat?.lastMessageModuleImageUrl || chat?.sentViaModuleImageUrl || previous?.lastMessageModuleImageUrl || '') || null,
            lastMessageTransport: String(chat?.lastMessageTransport || chat?.sentViaTransport || previous?.lastMessageTransport || '').trim().toLowerCase() || null,
            lastMessageChannelType: String(chat?.lastMessageChannelType || chat?.sentViaChannelType || previous?.lastMessageChannelType || '').trim().toLowerCase() || null
          };
        })
        .filter((chat) => chatMatchesFilters(chat, chatFiltersRef.current));

      const pageOffset = Number.isFinite(Number(page.offset)) ? Number(page.offset) : 0;
      const total = Number.isFinite(Number(page.total)) ? Number(page.total) : hydrated.length;
      const hasMore = Boolean(page.hasMore);

      setChats((prev) => {
        if (pageOffset <= 0) {
          return dedupeChats(hydrated).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
        return dedupeChats([...prev, ...hydrated]).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      });

      chatPagingRef.current.offset = Number.isFinite(Number(page.nextOffset)) ? Number(page.nextOffset) : (pageOffset + rawItems.length);
      chatPagingRef.current.hasMore = hasMore;
      chatPagingRef.current.loading = false;
      setChatsTotal(total);
      setChatsHasMore(hasMore);
      setIsLoadingMoreChats(false);
    });

    socket.on('chat_updated', (chat) => {
      if (!chat?.id || !isVisibleChatId(chat.id)) return;
            const incomingScopeModuleId = String(chat?.scopeModuleId || chat?.lastMessageModuleId || chat?.sentViaModuleId || '').trim().toLowerCase();
      const incomingChatId = String(chat?.id || '').trim();
      const normalizedIncomingId = normalizeChatScopedId(incomingChatId, incomingScopeModuleId || '');
      const previous = (Array.isArray(chatsRef.current) ? chatsRef.current : []).find((entry) => {
        if (!entry?.id) return false;
        if (String(entry.id) === String(normalizedIncomingId || incomingChatId)) return true;
        return chatIdsReferSameScope(String(entry.id), String(normalizedIncomingId || incomingChatId));
      }) || null;
      const previousScopeModuleId = String(previous?.scopeModuleId || previous?.lastMessageModuleId || '').trim().toLowerCase();
      const finalId = normalizeChatScopedId(normalizedIncomingId || incomingChatId, incomingScopeModuleId || previousScopeModuleId || '');
      const parsedFinal = parseScopedChatId(finalId || incomingChatId);
      const scopeModuleId = String(parsedFinal?.scopeModuleId || incomingScopeModuleId || previousScopeModuleId || '').trim().toLowerCase() || null;
      const baseChatId = String(parsedFinal?.baseChatId || chat?.baseChatId || previous?.baseChatId || incomingChatId).trim() || null;
      const hydrated = {
        ...chat,
        id: finalId || incomingChatId,
        baseChatId,
        scopeModuleId,
        name: sanitizeDisplayText(chat?.name || ''),
        subtitle: sanitizeDisplayText(chat?.subtitle || ''),
        status: sanitizeDisplayText(chat?.status || ''),
        phone: getBestChatPhone(chat),
        lastMessage: sanitizeDisplayText(chat?.lastMessage || ''),
        labels: normalizeChatLabels(chat.labels),
        profilePicUrl: normalizeProfilePhotoUrl(chat?.profilePicUrl),
        isMyContact: chat?.isMyContact === true,
        archived: Boolean(chat?.archived),
        pinned: Boolean(chat?.pinned),
        lastMessageModuleId: String(chat?.lastMessageModuleId || chat?.sentViaModuleId || scopeModuleId || previous?.lastMessageModuleId || '').trim().toLowerCase() || null,
        lastMessageModuleName: String(chat?.lastMessageModuleName || chat?.sentViaModuleName || previous?.lastMessageModuleName || '').trim() || null,
        lastMessageModuleImageUrl: normalizeModuleImageUrl(chat?.lastMessageModuleImageUrl || chat?.sentViaModuleImageUrl || previous?.lastMessageModuleImageUrl || '') || null,
        lastMessageTransport: String(chat?.lastMessageTransport || chat?.sentViaTransport || previous?.lastMessageTransport || '').trim().toLowerCase() || null,
        lastMessageChannelType: String(chat?.lastMessageChannelType || chat?.sentViaChannelType || previous?.lastMessageChannelType || '').trim().toLowerCase() || null
      };

      if (!chatMatchesQuery(hydrated, chatSearchRef.current) || !chatMatchesFilters(hydrated, chatFiltersRef.current)) {
        setChats((prev) => prev.filter((c) => chatIdentityKey(c) !== chatIdentityKey(hydrated) && c.id !== hydrated.id));
        return;
      }

      setChats((prev) => upsertAndSortChat(prev, hydrated));
    });

    socket.on('chat_opened', ({ chatId, baseChatId, moduleId, phone }) => {
      const targetChatId = String(chatId || '').trim();
      if (!targetChatId) {
        requestChatsPage({ reset: true });
        return;
      }

      const parsed = parseScopedChatId(targetChatId);
      const scopeModuleId = String(parsed?.scopeModuleId || moduleId || '').trim().toLowerCase() || null;
      const safeBaseChatId = String(parsed?.baseChatId || baseChatId || targetChatId).trim();
      const safePhone = normalizeDigits(phone || '');

      setChats((prev) => {
        if ((Array.isArray(prev) ? prev : []).some((entry) => chatIdsReferSameScope(String(entry?.id || ''), targetChatId))) {
          return prev;
        }

        const moduleConfig = normalizeWaModules(waModulesRef.current || [])
          .find((entry) => String(entry?.moduleId || '').trim().toLowerCase() === String(scopeModuleId || '').trim().toLowerCase()) || null;

        const placeholder = {
          id: targetChatId,
          baseChatId: safeBaseChatId || null,
          scopeModuleId,
          name: safePhone ? ('+' + safePhone) : 'Nuevo chat',
          phone: safePhone || null,
          subtitle: null,
          unreadCount: 0,
          timestamp: Math.floor(Date.now() / 1000),
          lastMessage: '',
          lastMessageFromMe: false,
          ack: 0,
          labels: [],
          archived: false,
          pinned: false,
          isMyContact: false,
          lastMessageModuleId: scopeModuleId,
          lastMessageModuleName: String(moduleConfig?.name || '').trim() || (scopeModuleId ? String(scopeModuleId || '').toUpperCase() : null),
          lastMessageModuleImageUrl: normalizeModuleImageUrl(moduleConfig?.imageUrl || moduleConfig?.logoUrl || '') || null,
          lastMessageChannelType: String(moduleConfig?.channelType || '').trim().toLowerCase() || null,
          lastMessageTransport: String(moduleConfig?.transportMode || '').trim().toLowerCase() || null
        };

        return upsertAndSortChat(prev, placeholder);
      });

      handleChatSelect(targetChatId, { clearSearch: true });
    });

    socket.on('start_new_chat_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('chat_labels_updated', ({ chatId, baseChatId, scopeModuleId, labels }) => {
      const incomingScopedId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
      const normalizedLabels = normalizeChatLabels(labels);

      setChats((prev) => {
        const next = prev.map((chat) => {
          const sameScope = chatIdsReferSameScope(String(chat?.id || ''), incomingScopedId);
          if (!sameScope) return chat;
          return { ...chat, labels: normalizedLabels };
        });
        return next.filter((chat) => chatMatchesQuery(chat, chatSearchRef.current) && chatMatchesFilters(chat, chatFiltersRef.current));
      });

      const active = String(activeChatIdRef.current || '');
      if (active && chatIdsReferSameScope(active, incomingScopedId)) {
        socket.emit('get_contact_info', active);
      }
    });

    socket.on('chat_labels_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('chat_labels_saved', ({ chatId }) => {
      requestChatsPage({ reset: true });
      if (chatId === activeChatIdRef.current) socket.emit('get_contact_info', chatId);
    });

    socket.on('chat_history', (data) => {

      shouldInstantScrollRef.current = true;
      suppressSmoothScrollUntilRef.current = Date.now() + 2200;
      prevMessagesMetaRef.current = { count: 0, lastId: '' };
      const requestedChatId = String(data?.requestedChatId || '');
      const resolvedChatId = String(data?.chatId || requestedChatId || '');
      const active = String(activeChatIdRef.current || '');
      if (resolvedChatId !== active && requestedChatId !== active) return;

      if (resolvedChatId && resolvedChatId !== active) {
        activeChatIdRef.current = resolvedChatId;
        setActiveChatId(resolvedChatId);
        socket.emit('mark_chat_read', resolvedChatId);
        socket.emit('get_contact_info', resolvedChatId);
      }

      const sessionSenderIdentity = resolveSessionSenderIdentity();
      const sessionSenderId = String(sessionSenderIdentity?.id || '').trim();
      const sessionSenderName = String(sessionSenderIdentity?.name || '').trim();
      const sessionSenderEmail = String(sessionSenderIdentity?.email || '').trim();
      const sessionSenderRole = String(sessionSenderIdentity?.role || '').trim().toLowerCase();
      const sanitizedMessages = Array.isArray(data.messages)
        ? data.messages.map((m) => {
          const normalizedMessage = {
            ...m,
            body: repairMojibake(m?.body || ''),
            location: normalizeMessageLocation(m?.location),
            filename: normalizeMessageFilename(m?.filename),
            fileSizeBytes: Number.isFinite(Number(m?.fileSizeBytes)) ? Number(m.fileSizeBytes) : null,
            ack: Number.isFinite(Number(m?.ack)) ? Number(m.ack) : 0,
            edited: Boolean(m?.edited),
            editedAt: Number(m?.editedAt || 0) || null,
            canEdit: Boolean(m?.canEdit),
            quotedMessage: normalizeQuotedMessage(m?.quotedMessage),
            sentViaModuleImageUrl: normalizeModuleImageUrl(m?.sentViaModuleImageUrl || '') || null
          };

          if (!normalizedMessage?.fromMe) return normalizedMessage;

          return {
            ...normalizedMessage,
            sentByUserId: String(normalizedMessage?.sentByUserId || sessionSenderId || '').trim() || null,
            sentByName: String(normalizedMessage?.sentByName || normalizedMessage?.sentByEmail || sessionSenderName || '').trim() || null,
            sentByEmail: String(normalizedMessage?.sentByEmail || sessionSenderEmail || '').trim() || null,
            sentByRole: String(normalizedMessage?.sentByRole || sessionSenderRole || '').trim() || null
          };
        })
        : [];
      setMessages(sanitizedMessages);
    });

    socket.on('chat_media', ({ chatId, messageId, mediaData, mimetype, filename, fileSizeBytes }) => {
      const active = String(activeChatIdRef.current || '');
      const incoming = String(chatId || '').trim();
      if (!incoming || !chatIdsReferSameScope(incoming, active)) return;
      if (!messageId || !mediaData) return;
      const nextFilename = normalizeMessageFilename(filename);
      const nextSize = Number.isFinite(Number(fileSizeBytes)) ? Number(fileSizeBytes) : null;
      setMessages((prev) => prev.map((m) => {
        if (m.id !== messageId) return m;
        const currentFilename = normalizeMessageFilename(m?.filename);
        const shouldReplaceFilename = Boolean(nextFilename) && (!currentFilename || isGenericFilename(currentFilename) || isMachineLikeFilename(currentFilename));
        return {
          ...m,
          mediaData,
          mimetype: mimetype || m.mimetype,
          filename: shouldReplaceFilename ? nextFilename : currentFilename,
          fileSizeBytes: Number.isFinite(nextSize) ? nextSize : (Number.isFinite(Number(m?.fileSizeBytes)) ? Number(m.fileSizeBytes) : null)
        };
      }));
    });

    socket.on('contact_info', (contact) => {
      const participantsList = normalizeParticipantList(contact?.participantsList);
      const participantsCount = Number(contact?.participants || contact?.chatState?.participantsCount || participantsList.length || 0) || 0;
      const normalizedContact = {
        ...contact,
        name: sanitizeDisplayText(contact?.name || ''),
        pushname: sanitizeDisplayText(contact?.pushname || ''),
        shortName: sanitizeDisplayText(contact?.shortName || ''),
        profilePicUrl: normalizeProfilePhotoUrl(contact?.profilePicUrl),
        status: repairMojibake(contact?.status || ''),
        participants: participantsCount,
        participantsList,
        chatState: {
          ...(contact?.chatState || {}),
          participantsCount
        }
      };
      setClientContact(normalizedContact);

      const contactId = String(contact?.id || '');
      if (!contactId) return;

      const contactPhone = getBestChatPhone({
        id: contactId,
        phone: contact?.phone || '',
        subtitle: String(contact?.pushname || '') + ' ' + String(contact?.shortName || '') + ' ' + String(contact?.name || ''),
        status: contact?.status || ''
      });

      setChats((prev) => {
        const existing = prev.find((c) => chatIdsReferSameScope(String(c?.id || ''), contactId));
        if (!existing) return prev;

        const fallbackName = sanitizeDisplayText(contact?.name || contact?.pushname || contact?.shortName || existing?.name || '');
        const subtitleName = sanitizeDisplayText(contact?.pushname || contact?.shortName || contact?.name || '');
        const nextChat = {
          ...existing,
          id: existing.id || contactId,
          phone: contactPhone || existing?.phone || null,
          isMyContact: contact?.isMyContact === true,
          name: fallbackName && !isInternalIdentifier(fallbackName)
            ? fallbackName
            : (existing?.name || (contactPhone ? ('+' + contactPhone) : 'Contacto')),
          subtitle: subtitleName || existing?.subtitle || null,
          status: normalizedContact.status || existing?.status || '',
          profilePicUrl: normalizedContact.profilePicUrl || existing?.profilePicUrl || null,
          participants: normalizedContact.participants || existing?.participants || 0,
          participantsList: normalizedContact.participantsList || existing?.participantsList || []
        };

        if (!chatMatchesQuery(nextChat, chatSearchRef.current) || !chatMatchesFilters(nextChat, chatFiltersRef.current)) {
          return prev.filter((c) => c.id !== nextChat.id && chatIdentityKey(c) !== chatIdentityKey(nextChat));
        }

        return upsertAndSortChat(prev, nextChat);
      });
    });

    socket.on('message', (msg) => {
      const relatedChatId = String(msg?.chatId || (msg.fromMe ? msg.to : msg.from) || '').trim();
      if (!isVisibleChatId(relatedChatId)) return;

      if (!msg.fromMe && Notification.permission === 'granted') {
        new Notification(msg.notifyName || 'Nuevo mensaje', {
          body: getMessagePreviewText(msg),
          icon: '/favicon.ico'
        });
      }

      if (!msg.fromMe && !chatIdsReferSameScope(relatedChatId, String(activeChatIdRef.current || ''))) {
        const toastId = String(msg.id || Date.now());
        setToasts((prev) => [...prev, {
          id: toastId,
          chatId: relatedChatId,
          title: sanitizeDisplayText(msg.notifyName || msg.from || 'Nuevo mensaje'),
          body: getMessagePreviewText(msg)
        }].slice(-3));

        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 5000);
      }

      setChats((prev) => {
        const senderDigits = normalizeDigits(msg.senderPhone || '');
        const idDigits = normalizeDigits(String(relatedChatId || '').split('@')[0] || '');
        const fallbackDigits = isLikelyPhoneDigits(senderDigits)
          ? senderDigits
          : (isLikelyPhoneDigits(idDigits) ? idDigits : '');
        const fallbackName = sanitizeDisplayText(msg.notifyName || '');
        const safeName = fallbackName && !isInternalIdentifier(fallbackName)
          ? fallbackName
          : (isLikelyPhoneDigits(fallbackDigits) ? ('+' + fallbackDigits) : 'Contacto');

                const incomingScopeModuleId = String(msg?.scopeModuleId || msg?.sentViaModuleId || '').trim().toLowerCase();
        const incomingIdentity = `id:${normalizeChatScopedId(relatedChatId, incomingScopeModuleId || '')}`;
        const existing = prev.find((c) => chatIdsReferSameScope(String(c?.id || ''), relatedChatId));
        const canonicalId = normalizeChatScopedId(existing?.id || relatedChatId, incomingScopeModuleId || '');
        const parsedCanonicalId = parseScopedChatId(canonicalId);
        const canonicalScopeModuleId = String(parsedCanonicalId?.scopeModuleId || incomingScopeModuleId || existing?.scopeModuleId || existing?.lastMessageModuleId || '').trim().toLowerCase() || null;
        const baseChatId = String(parsedCanonicalId?.baseChatId || existing?.baseChatId || relatedChatId).trim() || null;
        const nextChat = {
          ...(existing || { id: canonicalId, baseChatId, scopeModuleId: canonicalScopeModuleId, name: safeName, phone: isLikelyPhoneDigits(fallbackDigits) ? fallbackDigits : null, subtitle: null, labels: [] }),
          id: canonicalId,
          baseChatId,
          scopeModuleId: canonicalScopeModuleId,
          name: sanitizeDisplayText(existing?.name || '') && !isInternalIdentifier(existing?.name || '')
            ? existing.name
            : safeName,
          phone: existing?.phone || (isLikelyPhoneDigits(fallbackDigits) ? fallbackDigits : null),
          subtitle: sanitizeDisplayText(existing?.subtitle || fallbackName || '') || existing?.subtitle || null,
          timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
          lastMessage: getMessagePreviewText(msg),
          lastMessageFromMe: !!msg.fromMe,
          ack: msg.ack || 0,
          isMyContact: existing?.isMyContact === true,
          unreadCount: msg.fromMe ? (existing?.unreadCount || 0) : (chatIdsReferSameScope(canonicalId, String(activeChatIdRef.current || '')) ? 0 : (existing?.unreadCount || 0) + 1),
          lastMessageModuleId: String(msg?.sentViaModuleId || canonicalScopeModuleId || existing?.lastMessageModuleId || '').trim().toLowerCase() || null,
          lastMessageModuleName: String(msg?.sentViaModuleName || existing?.lastMessageModuleName || '').trim() || null,
          lastMessageModuleImageUrl: normalizeModuleImageUrl(msg?.sentViaModuleImageUrl || existing?.lastMessageModuleImageUrl || '') || null,
          lastMessageTransport: String(msg?.sentViaTransport || existing?.lastMessageTransport || '').trim().toLowerCase() || null,
          lastMessageChannelType: String(msg?.sentViaChannelType || existing?.lastMessageChannelType || '').trim().toLowerCase() || null,
        };

        if (!chatMatchesQuery(nextChat, chatSearchRef.current) || !chatMatchesFilters(nextChat, chatFiltersRef.current)) {
          return prev.filter((c) => c.id !== canonicalId && chatIdentityKey(c) !== incomingIdentity);
        }
        return upsertAndSortChat(prev, nextChat);
      });

      const sessionSenderIdentity = resolveSessionSenderIdentity();
      setMessages((prev) => {
        const normalizedIncoming = {
          ...msg,
          body: repairMojibake(msg?.body || ''),
          location: normalizeMessageLocation(msg?.location),
          filename: normalizeMessageFilename(msg?.filename),
          fileSizeBytes: Number.isFinite(Number(msg?.fileSizeBytes)) ? Number(msg.fileSizeBytes) : null,
          canEdit: Boolean(msg?.canEdit),
          quotedMessage: normalizeQuotedMessage(msg?.quotedMessage)
        };

        const fallbackSessionName = normalizedIncoming?.fromMe
          ? String(sessionSenderIdentity?.name || '').trim()
          : '';
        const fallbackSessionEmail = normalizedIncoming?.fromMe
          ? String(sessionSenderIdentity?.email || '').trim()
          : '';
        const fallbackSessionRole = normalizedIncoming?.fromMe
          ? String(sessionSenderIdentity?.role || '').trim().toLowerCase()
          : '';

        const incomingId = String(normalizedIncoming?.id || '').trim();
        if (incomingId) {
          const existingIndex = prev.findIndex((m) => String(m?.id || '').trim() === incomingId);
          if (existingIndex >= 0) {
            const existing = prev[existingIndex] || {};
            const merged = {
              ...existing,
              ...normalizedIncoming,
              sentByUserId: String(normalizedIncoming?.sentByUserId || existing?.sentByUserId || (normalizedIncoming?.fromMe ? (sessionSenderIdentity?.id || '') : '')).trim() || null,
              sentByName: String(normalizedIncoming?.sentByName || normalizedIncoming?.sentByEmail || existing?.sentByName || existing?.sentByEmail || fallbackSessionName).trim() || null,
              sentByEmail: String(normalizedIncoming?.sentByEmail || existing?.sentByEmail || fallbackSessionEmail).trim() || null,
              sentByRole: String(normalizedIncoming?.sentByRole || existing?.sentByRole || fallbackSessionRole).trim() || null,
              sentViaModuleId: String(normalizedIncoming?.sentViaModuleId || existing?.sentViaModuleId || '').trim() || null,
              sentViaModuleName: String(normalizedIncoming?.sentViaModuleName || existing?.sentViaModuleName || '').trim() || null,
              sentViaModuleImageUrl: normalizeModuleImageUrl(normalizedIncoming?.sentViaModuleImageUrl || existing?.sentViaModuleImageUrl || '') || null,
              sentViaTransport: String(normalizedIncoming?.sentViaTransport || existing?.sentViaTransport || '').trim() || null,
              quotedMessage: normalizeQuotedMessage(normalizedIncoming?.quotedMessage || existing?.quotedMessage)
            };
            const next = [...prev];
            next[existingIndex] = merged;
            return next;
          }
        }

        const activeId = String(activeChatIdRef.current || '');
        const incomingChatId = String(normalizedIncoming?.chatId || (normalizedIncoming.fromMe ? normalizedIncoming.to : normalizedIncoming.from) || '').trim();
        if (!chatIdsReferSameScope(incomingChatId, activeId)) return prev;

        const enrichedIncoming = {
          ...normalizedIncoming,
          sentByUserId: String(normalizedIncoming?.sentByUserId || (normalizedIncoming?.fromMe ? (sessionSenderIdentity?.id || '') : '')).trim() || null,
          sentByName: String(normalizedIncoming?.sentByName || normalizedIncoming?.sentByEmail || fallbackSessionName).trim() || null,
          sentByEmail: String(normalizedIncoming?.sentByEmail || fallbackSessionEmail).trim() || null,
          sentByRole: String(normalizedIncoming?.sentByRole || fallbackSessionRole).trim() || null,
          sentViaModuleImageUrl: normalizeModuleImageUrl(normalizedIncoming?.sentViaModuleImageUrl || '') || null
        };

        return [...prev, enrichedIncoming];
      });
    });

    socket.on('error', (msg) => {
      if (typeof msg === 'string' && msg.trim()) alert(msg);
    });


    return () => {
      ['tenant_context', 'wa_module_context', 'wa_module_selected', 'wa_module_error', 'chats', 'chat_updated', 'chat_history', 'chat_media',
        'chat_opened', 'start_new_chat_error', 'chat_labels_updated', 'chat_labels_error', 'chat_labels_saved',
        'contact_info', 'message', 'error'
      ].forEach(ev => socket.off(ev));
    };
  }, []);

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


