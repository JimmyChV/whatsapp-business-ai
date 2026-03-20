import { Suspense, lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';

import Sidebar from './components/Sidebar';
import BusinessSidebar, { ClientProfilePanel } from './components/BusinessSidebar';
import ChatWindow from './components/ChatWindow';
import NewChatModal from './components/chat/NewChatModal';
import AppErrorBoundary from './components/shared/AppErrorBoundary';
import { API_URL, CHAT_PAGE_SIZE, SOCKET_AUTH_TOKEN, TRANSPORT_STORAGE_KEY } from './config/runtime';
import { loadStoredSaasSession, persistSaasSession } from './features/auth/helpers/saasSessionStorage';
import { createSocketClient } from './features/chat/services/socketClient';
import { useNewChatDialog } from './features/chat/hooks/useNewChatDialog';
import { useMessagesAutoScroll } from './features/chat/hooks/useMessagesAutoScroll';
import { useChatRuntimeSyncEffects } from './features/chat/hooks/useChatRuntimeSyncEffects';
import useScopedBusinessRequests from './features/chat/hooks/useScopedBusinessRequests';
import { useSocketConnectionAuthEffect } from './features/chat/hooks/useSocketConnectionAuthEffect';
import useChatPaginationRequester from './features/chat/hooks/useChatPaginationRequester';
import { readWaLaunchParams } from './features/chat/helpers/waLaunchParams';
import StatusScreen from './features/chat/components/StatusScreen';
import TransportBootstrapScreen from './features/chat/components/TransportBootstrapScreen';
import { useSaasRecoveryFlow } from './features/auth/hooks/useSaasRecoveryFlow';
import useSaasRuntimeBootstrap from './features/auth/hooks/useSaasRuntimeBootstrap';
import useSaasSessionAutoRefresh from './features/auth/hooks/useSaasSessionAutoRefresh';
import { useSaasSessionActions } from './features/auth/hooks/useSaasSessionActions';
import useSaasApiSessionHelpers from './features/auth/hooks/useSaasApiSessionHelpers';
import SaasLoginScreen from './features/auth/components/SaasLoginScreen';
import {
  normalizeCatalogItem,
  normalizeProfilePhotoUrl,
  normalizeModuleImageUrl,
  normalizeProfilePayload,
  normalizeBusinessDataPayload,
  normalizeWaModuleItem,
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
} from './features/chat/helpers/appChat.helpers';

import './index.css';

const SaasAdminPanel = lazy(() => import('./components/SaasAdminPanel'));
const PanelChunkFallback = () => (
  <div className='login-screen'>
    <div style={{ textAlign: 'center' }}>
      <div className='loader' style={{ margin: '0 auto 12px' }} />
      <p style={{ color: '#9eb2bf', fontSize: '0.86rem', margin: 0 }}>Cargando panel...</p>
    </div>
  </div>
);


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

  // Socket Events
  // --------------------------------------------------------------
  useEffect(() => {
    socket.on('wa_module_selected', (payload) => {
      const selected = normalizeWaModuleItem(payload?.selected || payload?.item || payload || null);
      if (!selected?.moduleId) return;
      const previousModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
      const selectedModuleId = String(selected?.moduleId || '').trim().toLowerCase();

      setWaModules((prev) => {
        const base = normalizeWaModules(prev || []);
        const hasExisting = base.some((item) => item.moduleId === selected.moduleId);
        const merged = hasExisting
          ? base.map((item) => (item.moduleId === selected.moduleId ? { ...item, ...selected, isSelected: true } : { ...item, isSelected: false }))
          : [{ ...selected, isSelected: true }, ...base.map((item) => ({ ...item, isSelected: false }))];
        return normalizeWaModules(merged);
      });
      setSelectedWaModule(selected);
      setWaModuleError('');

      const currentCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
      if (!currentCatalogModuleId && selectedModuleId) {
        setSelectedCatalogModuleId(selectedModuleId);
        selectedCatalogIdRef.current = '';
        setSelectedCatalogId('');
        if (socket.connected) {
          emitScopedBusinessDataRequest({ moduleId: selectedModuleId, catalogId: '' });
        }
      }

      const selectedId = String(selected?.moduleId || '').trim().toLowerCase();
      if (selectedId && selectedId === String(requestedWaModuleFromUrlRef.current || '').trim().toLowerCase()) {
        requestedWaModuleFromUrlRef.current = '';
      }

      const selectedMode = String(selected?.transportMode || '').trim().toLowerCase();
      const shouldAutoSelectTransport = forceOperationLaunchRef.current || !canManageSaasRef.current;
      if (shouldAutoSelectTransport && selectedMode === 'cloud') {
        setSelectedTransport(selectedMode);
      }

      if (selectedModuleId && selectedModuleId !== previousModuleId) {
        requestQuickRepliesForModule(selectedModuleId);
        emitScopedBusinessDataRequest({ moduleId: selectedModuleId || selectedCatalogModuleIdRef.current, catalogId: selectedCatalogIdRef.current || '' });
      }
    });

    socket.on('wa_module_error', (message) => {
      setWaModuleError(String(message || 'No se pudo actualizar el modulo WhatsApp.'));
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsSwitchingTransport(false);
      chatPagingRef.current.loading = false;
      setIsLoadingMoreChats(false);
    });

    socket.on('qr', (qr) => { setQrCode(qr); setIsClientReady(false); setIsSwitchingTransport(false); });

    socket.on('ready', () => {
      setIsClientReady(true);
      setIsSwitchingTransport(false);
      setQrCode('');
      requestChatsPage({ reset: true });
      emitScopedBusinessDataRequest({ moduleId: selectedCatalogModuleIdRef.current || selectedWaModuleRef.current?.moduleId || '', catalogId: selectedCatalogIdRef.current || '' });
      socket.emit('get_my_profile');

      socket.emit('get_wa_capabilities');
      socket.emit('get_wa_modules');
    });

    socket.on('my_profile', (profile) => {
      setMyProfile(normalizeProfilePayload(profile));
    });
    socket.on('wa_capabilities', (caps) => {
      const nextCaps = {
        messageEdit: Boolean(caps?.messageEdit),
        messageEditSync: Boolean(caps?.messageEditSync),
        messageForward: Boolean(caps?.messageForward),
        messageDelete: Boolean(caps?.messageDelete),
        messageReply: Boolean(caps?.messageReply),
      };
      setWaCapabilities((prev) => ({ ...prev, ...nextCaps }));
      requestQuickRepliesForModule(selectedCatalogModuleIdRef.current || selectedWaModuleRef.current?.moduleId || '');
    });

    socket.on('wa_runtime', (runtime) => {
      const nextRuntime = runtime && typeof runtime === 'object' ? runtime : {};
      setWaRuntime((prev) => ({
        ...prev,
        ...nextRuntime,
        availableTransports: Array.isArray(nextRuntime?.availableTransports) ? nextRuntime.availableTransports : (prev?.availableTransports || ['cloud'])
      }));
    });

    socket.on('transport_mode_set', (runtime) => {
      const nextRuntime = runtime && typeof runtime === 'object' ? runtime : {};
      setWaRuntime((prev) => ({
        ...prev,
        ...nextRuntime,
        availableTransports: Array.isArray(nextRuntime?.availableTransports) ? nextRuntime.availableTransports : (prev?.availableTransports || ['cloud'])
      }));
      setTransportError('');
      setIsSwitchingTransport(false);
    });

    socket.on('transport_mode_error', (msg) => {
      setIsSwitchingTransport(false);
      setIsClientReady(false);
      setQrCode('');
      setTransportError(String(msg || 'No se pudo cambiar el modo de transporte.'));
    });

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

    socket.on('business_data_labels', (payload = {}) => {
      const labels = Array.isArray(payload?.labels) ? payload.labels : [];
      setLabelDefinitions(normalizeChatLabels(labels));
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

    socket.on('business_data', (data) => {
      const normalized = normalizeBusinessDataPayload(data);
      const responseSeq = Number(data?.requestSeq || normalized?.requestSeq || 0);
      if (Number.isFinite(responseSeq) && responseSeq > 0) {
        if (responseSeq < (businessDataRequestSeqRef.current || 0)) return;
        businessDataResponseSeqRef.current = responseSeq;
      }

      const scope = (normalized?.catalogMeta?.scope && typeof normalized.catalogMeta.scope === 'object')
        ? normalized.catalogMeta.scope
        : null;
      const scopeModuleId = String(scope?.moduleId || '').trim().toLowerCase();
      const scopeCatalogId = String(scope?.catalogId || '').trim().toUpperCase();
      const scopeCatalogIds = Array.isArray(scope?.catalogIds)
        ? scope.catalogIds.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean)
        : [];
      const currentCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
      const currentCatalogId = String(selectedCatalogIdRef.current || '').trim().toUpperCase();
      const hasModuleSelection = Boolean(currentCatalogModuleId);

      if (hasModuleSelection && (!scopeModuleId || scopeModuleId !== currentCatalogModuleId)) {
        return;
      }
      if (scopeCatalogId && currentCatalogId && scopeCatalogId !== currentCatalogId && scopeCatalogIds.includes(currentCatalogId)) {
        return;
      }

      const normalizedBusinessData = {
        ...normalized,
        catalogMeta: normalized?.catalogMeta || { source: 'local', nativeAvailable: false }
      };
      setBusinessData(normalizedBusinessData);

      const cacheModuleId = String(scopeModuleId || currentCatalogModuleId || '').trim().toLowerCase();
      const cacheCatalogId = String(scopeCatalogId || currentCatalogId || '').trim().toUpperCase();
      if (cacheModuleId || cacheCatalogId) {
        businessDataScopeCacheRef.current.set(`${cacheModuleId}|${cacheCatalogId}`, {
          catalog: Array.isArray(normalizedBusinessData.catalog) ? normalizedBusinessData.catalog : [],
          catalogMeta: normalizedBusinessData.catalogMeta
        });
      }

      setLabelDefinitions(normalizeChatLabels(normalized.labels));

      if (scopeModuleId && !currentCatalogModuleId) {
        setSelectedCatalogModuleId(scopeModuleId);
      }

      let nextCatalogId = currentCatalogId;
      if (scopeCatalogId) {
        nextCatalogId = scopeCatalogId;
      } else if (scopeCatalogIds.length === 1) {
        nextCatalogId = scopeCatalogIds[0];
      } else if (currentCatalogId && scopeCatalogIds.includes(currentCatalogId)) {
        nextCatalogId = currentCatalogId;
      } else if (scopeCatalogIds.length > 0) {
        nextCatalogId = scopeCatalogIds[0];
      } else {
        nextCatalogId = '';
      }

      if (nextCatalogId !== currentCatalogId) {
        setSelectedCatalogId(nextCatalogId);
      }
    });

    socket.on('business_data_catalog', (payload) => {
      const scopedPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : null;
      const responseSeq = Number(scopedPayload?.requestSeq || payload?.requestSeq || 0);
      if (Number.isFinite(responseSeq) && responseSeq > 0) {
        if (responseSeq < (businessDataRequestSeqRef.current || 0)) return;
        businessDataResponseSeqRef.current = responseSeq;
      }

      const scope = scopedPayload?.scope && typeof scopedPayload.scope === 'object'
        ? scopedPayload.scope
        : null;
      const scopeModuleId = String(scope?.moduleId || '').trim().toLowerCase();
      const scopeCatalogId = String(scope?.catalogId || '').trim().toUpperCase();
      const scopeCatalogIds = Array.isArray(scope?.catalogIds)
        ? scope.catalogIds.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean)
        : [];
      const activeCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
      const activeCatalogId = String(selectedCatalogIdRef.current || '').trim().toUpperCase();

      if (scopeModuleId && activeCatalogModuleId && scopeModuleId !== activeCatalogModuleId) {
        return;
      }
      if (scopeCatalogId && activeCatalogId && scopeCatalogId !== activeCatalogId && scopeCatalogIds.includes(activeCatalogId)) {
        return;
      }

      const rawItems = Array.isArray(scopedPayload?.items)
        ? scopedPayload.items
        : (Array.isArray(payload) ? payload : []);
      const normalizedCatalog = rawItems.map((item, idx) => normalizeCatalogItem(item, idx));
      const normalizedCategories = Array.from(new Set(
        normalizedCatalog
          .flatMap((item) => (Array.isArray(item?.categories) ? item.categories : []))
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      const nextCatalogMeta = {
        ...(businessData?.catalogMeta || { source: 'local', nativeAvailable: false }),
        source: String(scopedPayload?.source || 'local').trim().toLowerCase() || 'local',
        categories: normalizedCategories,
        scope: scope || businessData?.catalogMeta?.scope || null
      };

      setBusinessData(prev => ({
        ...prev,
        catalog: normalizedCatalog,
        catalogMeta: {
          ...(prev?.catalogMeta || { source: 'local', nativeAvailable: false }),
          source: nextCatalogMeta.source,
          categories: normalizedCategories,
          scope: scope || prev?.catalogMeta?.scope || null
        }
      }));

      const cacheModuleId = String(scopeModuleId || activeCatalogModuleId || '').trim().toLowerCase();
      const cacheCatalogId = String(scopeCatalogId || activeCatalogId || '').trim().toUpperCase();
      if (cacheModuleId || cacheCatalogId) {
        businessDataScopeCacheRef.current.set(`${cacheModuleId}|${cacheCatalogId}`, {
          catalog: normalizedCatalog,
          catalogMeta: nextCatalogMeta
        });
      }

      if (scopeModuleId && !activeCatalogModuleId) {
        setSelectedCatalogModuleId(scopeModuleId);
      }

      let nextCatalogId = activeCatalogId;
      if (scopeCatalogId) {
        nextCatalogId = scopeCatalogId;
      } else if (scopeCatalogIds.length === 1) {
        nextCatalogId = scopeCatalogIds[0];
      } else if (activeCatalogId && scopeCatalogIds.includes(activeCatalogId)) {
        nextCatalogId = activeCatalogId;
      } else if (scopeCatalogIds.length > 0) {
        nextCatalogId = scopeCatalogIds[0];
      } else {
        nextCatalogId = '';
      }

      if (nextCatalogId !== activeCatalogId) {
        setSelectedCatalogId(nextCatalogId);
      }
    });
    socket.on('quick_replies', (payload) => {
      const enabled = payload?.enabled !== false;
      const writable = payload?.writable !== false;
      setWaCapabilities((prev) => ({
        ...prev,
        quickReplies: enabled,
        quickRepliesRead: enabled,
        quickRepliesWrite: enabled && writable
      }));

      const items = Array.isArray(payload?.items) ? payload.items : [];
      const normalized = items
        .map((item, idx) => {
          const mediaAssets = Array.isArray(item?.mediaAssets)
            ? item.mediaAssets
              .map((asset) => ({
                url: String(asset?.url || asset?.mediaUrl || '').trim() || null,
                mimeType: String(asset?.mimeType || asset?.mediaMimeType || '').trim().toLowerCase() || null,
                fileName: String(asset?.fileName || asset?.mediaFileName || '').trim() || null,
                sizeBytes: Number.isFinite(Number(asset?.sizeBytes ?? asset?.mediaSizeBytes)) ? Number(asset?.sizeBytes ?? asset?.mediaSizeBytes) : null
              }))
              .filter((asset) => Boolean(asset.url))
            : [];
          const mediaUrl = String(item?.mediaUrl || mediaAssets[0]?.url || '').trim() || null;
          const mediaMimeType = String(item?.mediaMimeType || mediaAssets[0]?.mimeType || '').trim().toLowerCase() || null;
          const mediaFileName = String(item?.mediaFileName || mediaAssets[0]?.fileName || '').trim() || null;
          const mediaSizeBytes = Number.isFinite(Number(item?.mediaSizeBytes))
            ? Number(item.mediaSizeBytes)
            : (Number.isFinite(Number(mediaAssets[0]?.sizeBytes)) ? Number(mediaAssets[0].sizeBytes) : null);

          return {
            id: String(item?.id || ('qr_' + (idx + 1))),
            label: sanitizeDisplayText(item?.label || 'Respuesta rapida'),
            text: repairMojibake(item?.text || ''),
            mediaAssets,
            mediaUrl,
            mediaMimeType,
            mediaFileName,
            mediaSizeBytes,
            libraryId: String(item?.libraryId || '').trim() || null,
            libraryName: String(item?.libraryName || '').trim() || null,
            isShared: item?.isShared !== false
          };
        })
        .filter((item) => item.id && (item.text || item.mediaUrl || (Array.isArray(item.mediaAssets) && item.mediaAssets.length > 0)));
      setQuickReplies(normalized);
    });

    socket.on('quick_reply_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('error', (msg) => {
      if (typeof msg === 'string' && msg.trim()) alert(msg);
    });


    socket.on('message_edited', ({ chatId, messageId, body, edited, editedAt, canEdit }) => {
      const targetChatId = String(chatId || '');
      const active = String(activeChatIdRef.current || '');
      if (targetChatId && active && targetChatId !== active) return;

      setMessages((prev) => prev.map((m) => (
        String(m?.id || '') === String(messageId || '')
          ? {
            ...m,
            body: repairMojibake(body || ''),
            edited: edited !== false,

            editedAt: Number(editedAt || 0) || Math.floor(Date.now() / 1000),
            canEdit: typeof canEdit === 'boolean' ? canEdit : Boolean(m?.canEdit)
          }
          : m
      )));
      setEditingMessage((prev) => (prev && String(prev.id || '') === String(messageId || '') ? null : prev));
    });

    socket.on('edit_message_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('message_forwarded', () => {
      // El mensaje reenviado llega por el evento message cuando WhatsApp lo confirma.
    });

    socket.on('forward_message_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('message_deleted', ({ chatId, messageId }) => {
      const deletedId = String(messageId || '').trim();
      if (!deletedId) return;

      const incomingChatId = String(chatId || '');
      const active = String(activeChatIdRef.current || '');
      if (incomingChatId && active && incomingChatId !== active) return;

      setMessages((prev) => prev.map((m) => (
        String(m?.id || '') === deletedId
          ? {
            ...m,
            type: 'revoked',
            body: 'Mensaje eliminado',
            hasMedia: false,
            mediaData: null,
            mimetype: null,
            edited: false
          }
          : m
      )));
    });

    socket.on('delete_message_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('message_editability', ({ id, chatId, canEdit }) => {
      if (!id || typeof canEdit !== 'boolean') return;
      const active = String(activeChatIdRef.current || '');
      const incomingChatId = String(chatId || '');
      if (incomingChatId && active && incomingChatId !== active) return;
      setMessages((prev) => prev.map((m) => (
        m.id === id ? { ...m, canEdit } : m
      )));
    });
    socket.on('ai_suggestion_chunk', (chunk) => {
      setAiSuggestion(prev => prev + chunk);
    });

    socket.on('ai_suggestion_complete', () => {
      setIsAiLoading(false);
    });

    socket.on('ai_error', (msg) => {
      setIsAiLoading(false);
      if (msg) alert(msg);
    });


    socket.on('message_ack', ({ id, ack, chatId, baseChatId, scopeModuleId, canEdit }) => {
      setMessages(prev => prev.map((m) => (
        m.id === id
          ? { ...m, ack, canEdit: typeof canEdit === 'boolean' ? canEdit : m.canEdit }
          : m
      )));
            const ackChatId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
      setChats(prev => prev.map((c) => {
        const sameChat = ackChatId ? chatIdsReferSameScope(String(c?.id || ''), ackChatId) : false;
        if (!sameChat || !c.lastMessageFromMe) return c;
        return { ...c, ack };
      }));
    });

    socket.on('authenticated', () => {
      console.log('WhatsApp authenticated');
    });

    socket.on('auth_failure', (msg) => {
      alert('Error de autenticacion. Por favor recarga la pagina y escanea de nuevo.\n\nDetalle: ' + msg);
    });

    socket.on('disconnected', (reason) => {
      if (reason !== 'NAVIGATION') {
        setIsClientReady(false);
        setQrCode('');
      }
    });

    socket.on('logout_done', () => {
      setIsClientReady(false);
      setQrCode('');
      setChats([]);
      setChatsTotal(0);
      setChatsHasMore(false);
      chatPagingRef.current = { offset: 0, hasMore: false, loading: false };
      setIsLoadingMoreChats(false);
      setMessages([]);
      setEditingMessage(null);
      setReplyingMessage(null);
      setActiveChatId(null);
      alert('Sesion de WhatsApp cerrada. Vuelve a iniciar para reconectar Cloud API.');
    });

    if (socket.connected) {
      setIsConnected(true);
      const mode = selectedTransportRef.current;
      setIsSwitchingTransport(true);
      socket.emit('set_transport_mode', { mode: mode || 'idle' });
      socket.emit('get_wa_capabilities');
      socket.emit('get_wa_modules');
    }

    return () => {
      ['connect', 'connect_error', 'tenant_context', 'wa_module_context', 'wa_module_selected', 'wa_module_error', 'disconnect', 'qr', 'ready', 'my_profile', 'wa_capabilities', 'wa_runtime', 'transport_mode_set', 'transport_mode_error', 'chats', 'chat_updated', 'chat_history', 'chat_media',
        'chat_opened', 'start_new_chat_error', 'chat_labels_updated', 'chat_labels_error', 'chat_labels_saved',
        'contact_info', 'message', 'business_data', 'business_data_labels', 'error', 'business_data_catalog', 'quick_replies', 'quick_reply_error',
        'ai_suggestion_chunk',

        'ai_suggestion_complete', 'ai_error', 'message_ack', 'message_editability', 'message_edited', 'edit_message_error', 'message_forwarded', 'forward_message_error', 'message_deleted', 'delete_message_error', 'authenticated', 'auth_failure', 'disconnected', 'logout_done'
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
  const resetWorkspaceState = () => {
    setIsClientReady(false);
    setQrCode('');
    setSelectedTransport('');
    setWaModules([]);
    setSelectedWaModule(null);
    setSelectedCatalogModuleId('');
    setSelectedCatalogId('');
    setChats([]);
    setChatsTotal(0);
    setChatsHasMore(true);
    chatPagingRef.current = { offset: 0, hasMore: true, loading: false };
    setIsLoadingMoreChats(false);
    setMessages([]);
    setActiveChatId(null);
    activeChatIdRef.current = null;
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    setBusinessData({ profile: null, labels: [], catalog: [], catalogMeta: { source: 'local', nativeAvailable: false } });
    setQuickReplies([]);
    setWaModuleError('');
    setPendingOrderCartLoad(null);
    setToasts([]);
    setInputText('');
    removeAttachment();
  };

  useEffect(() => {
    const previousTenant = String(tenantScopeRef.current || '').trim() || 'default';
    if (previousTenant === tenantScopeId) return;
    tenantScopeRef.current = tenantScopeId;
    resetWorkspaceState();
  }, [tenantScopeId]);

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

  const handleChatSelect = (chatId, options = {}) => {
    if (!chatId) return;
    const clearSearch = Boolean(options?.clearSearch);
    if (clearSearch && chatSearchRef.current) {
      chatSearchRef.current = '';
      setChatSearchQuery('');
      requestChatsPage({ reset: true });
    }

    const requestedChatId = String(chatId || '').trim();
    let resolvedChatId = requestedChatId;
    let selectedChat = chatsRef.current.find((c) => String(c?.id || '') === requestedChatId) || null;
    let resolvedScopeModuleId = '';

    if (selectedChat) {
      const parsedSelected = parseScopedChatId(selectedChat?.id || '');
      const selectedScopeModuleId = String(parsedSelected?.scopeModuleId || selectedChat?.scopeModuleId || selectedChat?.lastMessageModuleId || '').trim().toLowerCase();
      resolvedScopeModuleId = selectedScopeModuleId;
      if (!selectedScopeModuleId) {
        const baseSelectedChatId = String(parsedSelected?.baseChatId || selectedChat?.baseChatId || selectedChat?.id || '').trim();
        if (baseSelectedChatId) {
          const scopedCandidates = chatsRef.current
            .filter((entry) => {
              const parsedEntry = parseScopedChatId(entry?.id || '');
              const entryBase = String(parsedEntry?.baseChatId || entry?.baseChatId || entry?.id || '').trim();
              const entryScope = String(parsedEntry?.scopeModuleId || entry?.scopeModuleId || entry?.lastMessageModuleId || '').trim().toLowerCase();
              return Boolean(entryBase && entryBase === baseSelectedChatId && entryScope);
            })
            .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
          if (scopedCandidates.length > 0) {
            selectedChat = scopedCandidates[0];
            resolvedChatId = String(selectedChat?.id || requestedChatId);
            const parsedResolved = parseScopedChatId(selectedChat?.id || '');
            resolvedScopeModuleId = String(parsedResolved?.scopeModuleId || selectedChat?.scopeModuleId || selectedChat?.lastMessageModuleId || '').trim().toLowerCase();
          }
        }
      }
    }

    if (resolvedScopeModuleId) {
      const currentCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
      const currentWaModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();

      if (resolvedScopeModuleId !== currentCatalogModuleId) {
        selectedCatalogModuleIdRef.current = resolvedScopeModuleId;
        selectedCatalogIdRef.current = '';
        setSelectedCatalogModuleId(resolvedScopeModuleId);
        setSelectedCatalogId('');
      }

      if (isConnected) {
        requestQuickRepliesForModule(resolvedScopeModuleId);
        if (resolvedScopeModuleId !== currentWaModuleId) {
          socket.emit('set_wa_module', { moduleId: resolvedScopeModuleId });
        } else {
          emitScopedBusinessDataRequest({ moduleId: resolvedScopeModuleId, catalogId: selectedCatalogIdRef.current || '' });
        }
      }
    }

    activeChatIdRef.current = resolvedChatId;
    setActiveChatId(resolvedChatId);
    shouldInstantScrollRef.current = true;
    suppressSmoothScrollUntilRef.current = Date.now() + 2200;
    prevMessagesMetaRef.current = { count: 0, lastId: '' };
    setMessages([]);
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    setQuickReplyDraft(null);
    socket.emit('get_chat_history', resolvedChatId);
    socket.emit('mark_chat_read', resolvedChatId);
    socket.emit('get_contact_info', resolvedChatId);
    setChats((prev) => prev.map((c) => chatIdsReferSameScope(String(c?.id || ''), resolvedChatId) ? { ...c, unreadCount: 0 } : c));
  };
  const handleExitActiveChat = () => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    prevMessagesMetaRef.current = { count: 0, lastId: '' };
    suppressSmoothScrollUntilRef.current = 0;
    setMessages([]);
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    setPendingOrderCartLoad(null);
    setQuickReplyDraft(null);
    setInputText('');
    removeAttachment();
  };

  const handleSendMessage = (e) => {
    e?.preventDefault();
    const text = inputText.trim();

    if (editingMessage?.id) {
      if (!waCapabilities.messageEdit) {
        alert('La edicion de mensajes no esta disponible en esta sesion de WhatsApp.');
        return;
      }
      if (attachment) {
        alert('No puedes adjuntar archivos mientras editas un mensaje.');
        return;
      }
      if (!text) return;

      const original = String(editingMessage.originalBody || '').trim();
      if (text === original) {
        setEditingMessage(null);
        setInputText('');
        return;
      }

      const activeId = String(activeChatIdRef.current || '');
      if (!activeId) return;
      socket.emit('edit_message', { chatId: activeId, messageId: String(editingMessage.id), body: text });
      setEditingMessage(null);
      setInputText('');
      return;
    }

    if (!text && !attachment && !quickReplyDraft) return;

    // Command: /ayudar
    if (text === '/ayudar') {
      requestAiSuggestion();
      setInputText('');
      return;
    }

    const quotedMessageId = String(replyingMessage?.id || '').trim() || null;

    const activeChatForSend = chatsRef.current.find((c) => String(c?.id || '') === String(activeChatId || ''));
    const activeChatPhone = normalizeDigits(activeChatForSend?.phone || '');
    const toPhone = activeChatPhone || null;


    const draftQuickReply = normalizeQuickReplyDraft(quickReplyDraft);
    if (draftQuickReply && !attachment) {
      const outboundText = String(text || draftQuickReply.text || '').trim();
      const draftMediaAssets = Array.isArray(draftQuickReply.mediaAssets) ? draftQuickReply.mediaAssets : [];
      socket.emit('send_quick_reply', {
        quickReplyId: draftQuickReply.id || undefined,
        quickReply: {
          id: draftQuickReply.id || undefined,
          label: draftQuickReply.label || undefined,
          text: outboundText,
          mediaAssets: draftMediaAssets,
          mediaUrl: String(draftQuickReply.mediaUrl || draftMediaAssets[0]?.url || '').trim() || null,
          mediaMimeType: String(draftQuickReply.mediaMimeType || draftMediaAssets[0]?.mimeType || '').trim().toLowerCase() || null,
          mediaFileName: String(draftQuickReply.mediaFileName || draftMediaAssets[0]?.fileName || '').trim() || null
        },
        to: activeChatId,
        toPhone,
        quotedMessageId
      });
      setQuickReplyDraft(null);
      setInputText('');
      setReplyingMessage(null);
      return;
    }

    if (attachment) {
      socket.emit('send_media_message', {
        to: activeChatId,
        toPhone,
        body: inputText,
        mediaData: attachment.data,
        mimetype: attachment.mimetype,
        filename: attachment.filename,
        quotedMessageId
      });
      removeAttachment();
    } else {
      socket.emit('send_message', { to: activeChatId, toPhone, body: inputText, quotedMessageId });
    }
    setInputText('');
    setReplyingMessage(null);
  };

  const handleLogoutWhatsapp = () => {
    if (!window.confirm('Cerrar sesion de WhatsApp en este equipo?')) return;
    socket.emit('logout_whatsapp');
  };

  const handleSelectWaModule = (moduleId = '') => {
    const safeModuleId = String(moduleId || '').trim();
    if (!safeModuleId) return;

    const nextModule = (Array.isArray(waModules) ? waModules : [])
      .find((item) => String(item?.moduleId || '').trim() === safeModuleId);
    if (!nextModule) {
      setWaModuleError('No se encontro el modulo seleccionado.');
      return;
    }

    const moduleTransport = String(nextModule?.transportMode || '').trim().toLowerCase();
    const normalizedTransport = moduleTransport === 'cloud' ? 'cloud' : 'cloud';

    setSelectedWaModule(nextModule);
    setSelectedTransport(normalizedTransport);
    setTransportError('');
    setWaModuleError('');

    if (isConnected) {
      requestQuickRepliesForModule(nextModule.moduleId);
      socket.emit('set_wa_module', { moduleId: nextModule.moduleId });
      return;
    }

    handleSelectTransport(normalizedTransport);
  };

  const handleSelectCatalogModule = (moduleId = '') => {
    const safeModuleId = String(moduleId || '').trim().toLowerCase();
    if (!safeModuleId) return;

    const moduleExists = (Array.isArray(waModules) ? waModules : [])
      .some((item) => String(item?.moduleId || '').trim().toLowerCase() === safeModuleId && item?.isActive !== false);
    if (!moduleExists) {
      setWaModuleError('No se encontro el modulo para ese catalogo.');
      return;
    }

    selectedCatalogModuleIdRef.current = safeModuleId;
    selectedCatalogIdRef.current = '';
    setSelectedCatalogModuleId(safeModuleId);
    setSelectedCatalogId('');
    setBusinessData((prev) => ({
      ...prev,
      catalog: [],
      catalogMeta: {
        ...(prev?.catalogMeta || { source: 'local', nativeAvailable: false }),
        scope: {
          ...(prev?.catalogMeta?.scope || {}),
          moduleId: safeModuleId,
          catalogId: ''
        }
      }
    }));
    if (isConnected) {
      requestQuickRepliesForModule(safeModuleId);
      emitScopedBusinessDataRequest({ moduleId: safeModuleId, catalogId: '' });
    }
  };

  const handleSelectCatalog = (catalogId = '') => {
    const safeCatalogId = String(catalogId || '').trim().toUpperCase();
    const safeModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
    if (!safeModuleId) return;
    selectedCatalogIdRef.current = safeCatalogId;
    setSelectedCatalogId(safeCatalogId);
    setBusinessData((prev) => ({
      ...prev,
      catalog: [],
      catalogMeta: {
        ...(prev?.catalogMeta || { source: 'local', nativeAvailable: false }),
        scope: {
          ...(prev?.catalogMeta?.scope || {}),
          moduleId: safeModuleId,
          catalogId: safeCatalogId || ''
        }
      }
    }));
    if (isConnected) {
      emitScopedBusinessDataRequest({
        moduleId: safeModuleId,
        catalogId: safeCatalogId || ''
      });
    }
  };
  const handleUploadCatalogImage = async ({ dataUrl, fileName, scope = '' } = {}) => {
    const safeDataUrl = String(dataUrl || '').trim();
    if (!safeDataUrl) throw new Error('No se recibio imagen para subir.');

    const tenantId = String(saasSessionRef.current?.user?.tenantId || saasRuntimeRef.current?.tenant?.id || tenantScopeId || 'default').trim() || 'default';
    const moduleId = String(selectedCatalogModuleIdRef.current || selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
    const scopeSuffix = moduleId ? `catalog-${moduleId}` : 'catalog';
    const safeScope = String(scope || scopeSuffix).trim() || scopeSuffix;

    const response = await fetch(`${API_URL}/api/admin/saas/assets/upload`, {
      method: 'POST',
      headers: buildApiHeaders({ includeJson: true }),
      body: JSON.stringify({
        tenantId,
        scope: safeScope,
        fileName: String(fileName || 'producto').trim() || 'producto',
        dataUrl: safeDataUrl
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(String(payload?.error || 'No se pudo subir la imagen.'));
    }

    const url = String(payload?.file?.url || payload?.file?.relativeUrl || '').trim();
    if (!url) throw new Error('El servidor no devolvio URL para la imagen.');
    return {
      url,
      relativeUrl: String(payload?.file?.relativeUrl || '').trim() || null,
      mimeType: String(payload?.file?.mimeType || '').trim() || null,
      sizeBytes: Number(payload?.file?.sizeBytes || 0) || 0
    };
  };
  const sanitizeWorkspaceKey = (value = '') => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_') || 'default';

  const buildWorkspaceUrl = ({ mode = 'operation', tenantId = '', moduleId = '', source = '', section = '' } = {}) => {
    const nextUrl = new URL(window.location.href);
    const cleanTenantId = String(tenantId || '').trim();
    const cleanModuleId = String(moduleId || '').trim().toLowerCase();
    const cleanMode = String(mode || '').trim().toLowerCase();
    const cleanSource = String(source || '').trim().toLowerCase();

    if (cleanMode === 'operation') {
      nextUrl.searchParams.set('wa_launch', 'operation');
      if (cleanModuleId) nextUrl.searchParams.set('wa_module', cleanModuleId);
      else nextUrl.searchParams.delete('wa_module');
      nextUrl.searchParams.delete('wa_section');
    } else {
      nextUrl.searchParams.delete('wa_launch');
      nextUrl.searchParams.delete('wa_module');
      const cleanSection = String(section || '').trim().toLowerCase();
      if (cleanSection) nextUrl.searchParams.set('wa_section', cleanSection);
      else nextUrl.searchParams.delete('wa_section');
    }

    if (cleanTenantId) nextUrl.searchParams.set('wa_tenant', cleanTenantId);
    else nextUrl.searchParams.delete('wa_tenant');

    if (cleanSource) nextUrl.searchParams.set('wa_from', cleanSource);
    else nextUrl.searchParams.delete('wa_from');

    return nextUrl;
  };

  const isWorkspaceTabAligned = (rawHref = '', { mode = 'operation', tenantId = '', section = '' } = {}) => {
    try {
      const current = new URL(String(rawHref || ''));
      const currentMode = String(current.searchParams.get('wa_launch') || '').trim().toLowerCase() === 'operation'
        ? 'operation'
        : 'panel';
      const currentTenant = String(current.searchParams.get('wa_tenant') || '').trim();
      const currentSection = String(current.searchParams.get('wa_section') || '').trim().toLowerCase();
      const expectedMode = String(mode || '').trim().toLowerCase() === 'operation' ? 'operation' : 'panel';
      const expectedTenant = String(tenantId || '').trim();
      const expectedSection = String(section || '').trim().toLowerCase();
      if (currentMode !== expectedMode) return false;
      if (currentTenant !== expectedTenant) return false;
      if (expectedMode === 'panel' && expectedSection) return currentSection === expectedSection;
      return true;
    } catch (_) {
      return false;
    }
  };

  const openOrFocusWorkspaceTab = ({ mode = 'operation', tenantId = '', moduleId = '', source = '', section = '' } = {}) => {
    const cleanTenantId = String(tenantId || '').trim();
    const cleanMode = String(mode || '').trim().toLowerCase() === 'operation' ? 'operation' : 'panel';
    const targetUrl = buildWorkspaceUrl({ mode: cleanMode, tenantId: cleanTenantId, moduleId, source, section });
    const targetName = cleanMode === 'operation'
      ? `lavitat_chat_${sanitizeWorkspaceKey(cleanTenantId)}`
      : `lavitat_panel_${sanitizeWorkspaceKey(cleanTenantId)}`;

    let targetWindow = null;
    try {
      targetWindow = window.open('', targetName);
    } catch (_) {
      targetWindow = null;
    }

    if (!targetWindow) {
      window.location.assign(targetUrl.toString());
      return;
    }

    let mustNavigate = true;
    try {
      const currentHref = String(targetWindow.location?.href || '').trim();
      if (currentHref && currentHref !== 'about:blank') {
        mustNavigate = !isWorkspaceTabAligned(currentHref, { mode: cleanMode, tenantId: cleanTenantId, section });
      }
    } catch (_) {
      mustNavigate = true;
    }

    if (mustNavigate) {
      targetWindow.location.href = targetUrl.toString();
    }
    targetWindow.focus();
  };

  const handleOpenWhatsAppOperation = (moduleId = '', options = {}) => {
    const preferredModuleId = String(moduleId || '').trim();
    const targetTenantId = String(options?.tenantId || tenantScopeId || '').trim();
    if (!targetTenantId) return;

    setShowSaasAdminPanel(false);
    openOrFocusWorkspaceTab({
      mode: 'operation',
      tenantId: targetTenantId,
      moduleId: preferredModuleId,
      source: 'panel'
    });
  };

  const handleOpenSaasAdminWorkspace = (options = {}) => {
    const targetTenantId = String(options?.tenantId || tenantScopeId || '').trim();
    const targetSectionId = String(options?.section || '').trim().toLowerCase();
    if (!targetTenantId) return;

    setShowSaasAdminPanel(false);
    openOrFocusWorkspaceTab({
      mode: 'panel',
      tenantId: targetTenantId,
      source: 'chat',
      section: targetSectionId
    });
  };

  const handleSelectTransport = (mode) => {
    const safeMode = String(mode || '').trim().toLowerCase();
    if (safeMode !== 'cloud') return;

    setSelectedTransport(safeMode);
    setTransportError('');
    setIsSwitchingTransport(true);
    setIsClientReady(false);
    setQrCode('');

    setChats([]);
    setChatsTotal(0);
    setChatsHasMore(true);
    chatPagingRef.current = { offset: 0, hasMore: true, loading: false };
    setMessages([]);
    setActiveChatId(null);
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);

    if (isConnected) {
      socket.emit('set_transport_mode', { mode: safeMode });
    }
  };

  const handleResetTransportSelection = () => {
    if (isConnected) {
      socket.emit('set_transport_mode', { mode: 'idle' });
    }
    setSelectedTransport('');
    setTransportError('');
    setWaModuleError('');
    setIsSwitchingTransport(false);
    setIsClientReady(false);
    setQrCode('');
    setWaRuntime({ requestedTransport: 'idle', activeTransport: 'idle', cloudConfigured: false, cloudReady: false, availableTransports: ['cloud'] });
    setChats([]);
    setChatsTotal(0);
    setChatsHasMore(true);
    chatPagingRef.current = { offset: 0, hasMore: true, loading: false };
    setMessages([]);
    setActiveChatId(null);
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    setInputText('');
    removeAttachment();
  };
  const handleRefreshChats = () => {
    requestChatsPage({ reset: true });
  };

  const handleChatSearchChange = (value) => {
    setChatSearchQuery(String(value || ''));
  };

  const handleChatFiltersChange = (nextFilters = {}) => {
    setChatFilters(normalizeChatFilters(nextFilters));
  };

  const handleLoadMoreChats = () => {
    requestChatsPage({ reset: false });
  };

  const handleCreateLabel = () => {
    if (!canManageSaas) {
      alert('No tienes permisos para gestionar etiquetas.');
      return;
    }
    handleOpenSaasAdminWorkspace({ tenantId: tenantScopeId, section: 'saas_etiquetas' });
  };

  const handleOpenCompanyProfile = () => {
    setOpenCompanyProfileToken((prev) => prev + 1);
  };

  const handleToggleChatLabel = (chatId, labelId) => {
    if (!chatId || labelId === undefined || labelId === null || labelId === '') return;
    const chat = chats.find((c) => c.id === chatId);
    const current = Array.isArray(chat?.labels) ? chat.labels : [];

    const idStr = String(labelId);
    const has = current.some((l) => String(l?.id || l?.labelId || '') === idStr);
    const nextIds = has
      ? current
        .filter((l) => String(l?.id || l?.labelId || '') !== idStr)
        .map((l) => String(l?.id || l?.labelId || '').trim())
        .filter(Boolean)
      : [
        ...current
          .map((l) => String(l?.id || l?.labelId || '').trim())
          .filter(Boolean),
        idStr
      ];

    socket.emit('set_chat_labels', { chatId, labelIds: nextIds });
  };

  const handleToggleChatPinned = (chatId, nextPinned) => {
    if (!chatId || typeof nextPinned !== 'boolean') return;
    socket.emit('set_chat_state', { chatId, pinned: nextPinned });
  };

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

  const handleEditMessage = (messageId, currentBody) => {
    if (!waCapabilities.messageEdit) {
      alert('La edicion de mensajes no esta disponible en esta sesion de WhatsApp.');
      return;
    }
    removeAttachment();
    setQuickReplyDraft(null);
    const cleanId = String(messageId || '').trim();
    if (!cleanId) return;
    const body = String(currentBody || '');
    setReplyingMessage(null);
    setEditingMessage({ id: cleanId, originalBody: body });
    setInputText(body);
  };

  const handleCancelEditMessage = () => {
    setEditingMessage(null);
    setInputText('');
  };

  const handleReplyMessage = (message = null) => {
    const cleanId = String(message?.id || '').trim();
    if (!cleanId) return;

    const bodyText = sanitizeDisplayText(message?.body || '');
    const hasMedia = Boolean(message?.hasMedia);
    const preview = bodyText || (hasMedia ? 'Adjunto' : 'Mensaje');

    setEditingMessage(null);
    setReplyingMessage({
      id: cleanId,
      body: preview,
      fromMe: Boolean(message?.fromMe),
      type: String(message?.type || 'chat')
    });
  };

  const handleCancelReplyMessage = () => {
    setReplyingMessage(null);
  };

  const handleForwardMessage = (messageId, toChatId) => {
    const sourceMessageId = String(messageId || '').trim();
    const targetChatId = String(toChatId || '').trim();
    if (!sourceMessageId || !targetChatId) return;
    socket.emit('forward_message', {
      messageId: sourceMessageId,
      toChatId: targetChatId
    });
  };
  const handleDeleteMessage = (payload = {}) => {
    const messageId = String(payload?.id || '').trim();
    if (!messageId || !activeChatIdRef.current) return;

    const ok = window.confirm('Eliminar este mensaje? WhatsApp solo lo permite en algunos casos.');
    if (!ok) return;

    socket.emit('delete_message', {
      chatId: String(payload?.chatId || activeChatIdRef.current || '').trim(),
      messageId
    });
  };
  const handleLoadOrderToCart = (orderPayload) => {
    if (!activeChatIdRef.current || !orderPayload || typeof orderPayload !== 'object') return;
    const token = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setPendingOrderCartLoad({
      token,
      chatId: String(activeChatIdRef.current),
      order: orderPayload
    });
  };

  const handleSendQuickReply = (quickReply = null) => {
    if (!waCapabilities.quickRepliesRead) return;
    const activeId = String(activeChatIdRef.current || '').trim();
    if (!activeId) return;

    const draft = normalizeQuickReplyDraft(quickReply);
    if (!draft) return;

    setEditingMessage(null);
    setAttachment(null);
    setAttachmentPreview(null);
    setQuickReplyDraft(draft);
    setInputText(String(draft.text || '').trim());
  };
  useEffect(() => {
    const onGlobalKeyDown = (event) => {
      if (event.key !== 'Escape' || event.repeat) return;
      if (!activeChatIdRef.current) return;
      event.preventDefault();
      handleExitActiveChat();
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  const requestAiSuggestion = (customPromptArg) => {
    if (!activeChatId) return;
    const customPrompt = typeof customPromptArg === 'string' ? customPromptArg : null;
    setAiSuggestion('');
    setIsAiLoading(true);

    const normalizeModuleId = (value = '') => String(value || '').trim().toLowerCase();
    const normalizeCatalogId = (value = '') => String(value || '').trim().toUpperCase();

    const catalogScope = (businessData?.catalogMeta?.scope && typeof businessData.catalogMeta.scope === 'object')
      ? businessData.catalogMeta.scope
      : {};
    const aiModuleId = normalizeModuleId(activeChatDetails?.scopeModuleId || selectedWaModuleRef.current?.moduleId || selectedCatalogModuleIdRef.current || '');
    const moduleRows = normalizeWaModules(waModulesRef.current || []);
    const moduleRow = moduleRows.find((entry) => normalizeModuleId(entry?.moduleId) === aiModuleId) || null;

    const selectedCatalog = normalizeCatalogId(selectedCatalogIdRef.current || catalogScope.catalogId || '');
    const scopeCatalogIds = Array.isArray(catalogScope.catalogIds)
      ? catalogScope.catalogIds.map((entry) => normalizeCatalogId(entry)).filter(Boolean)
      : [];
    const catalogIds = Array.from(new Set([
      selectedCatalog,
      ...scopeCatalogIds
    ].filter(Boolean)));

    const e164Phone = (() => {
      const digits = String(activeChatDetails?.phone || clientContact?.phone || '').replace(/\D/g, '');
      if (!digits) return '';
      return '+' + digits;
    })();

    const recentMessagesRows = messages.slice(-18).map((entry) => ({
      fromMe: entry?.fromMe === true,
      body: String(entry?.body || '').trim(),
      type: String(entry?.type || '').trim().toLowerCase() || 'chat',
      timestamp: Number(entry?.timestamp || 0) || null
    }));

    const runtimeContext = {
      tenant: {
        id: String(tenantScopeRef.current || 'default').trim() || 'default',
        name: String(saasRuntimeRef.current?.tenant?.name || businessData?.profile?.name || '').trim() || null,
        plan: String(saasRuntimeRef.current?.tenant?.plan || '').trim() || null
      },
      module: {
        moduleId: aiModuleId || null,
        name: String(moduleRow?.name || activeChatDetails?.moduleName || '').trim() || null,
        channelType: String(moduleRow?.channelType || activeChatDetails?.channelType || 'whatsapp').trim().toLowerCase() || 'whatsapp',
        transportMode: 'cloud'
      },
      catalog: {
        catalogId: selectedCatalog || null,
        catalogIds,
        source: String(businessData?.catalogMeta?.source || '').trim().toLowerCase() || 'local',
        items: (Array.isArray(businessData?.catalog) ? businessData.catalog : []).slice(0, 70).map((item) => ({
          id: item?.id || null,
          title: item?.title || null,
          price: item?.price || null,
          regularPrice: item?.regularPrice || null,
          salePrice: item?.salePrice || null,
          discountPct: Number(item?.discountPct || 0) || 0,
          description: item?.description || '',
          category: item?.category || item?.categoryName || null,
          categories: Array.isArray(item?.categories) ? item.categories : [],
          catalogId: item?.catalogId || selectedCatalog || null,
          catalogName: item?.catalogName || null,
          source: item?.source || null,
          sku: item?.sku || null,
          stockStatus: item?.stockStatus || null,
          imageUrl: item?.imageUrl || null,
          presentation: item?.presentation || item?.metadata?.presentation || item?.metadata?.presentacion || null,
          aroma: item?.aroma || item?.metadata?.aroma || item?.metadata?.scent || null,
          hypoallergenic: typeof item?.metadata?.hypoallergenic === 'boolean' ? item.metadata.hypoallergenic : null,
          petFriendly: typeof item?.metadata?.petFriendly === 'boolean' ? item.metadata.petFriendly : (typeof item?.metadata?.pet_friendly === 'boolean' ? item.metadata.pet_friendly : null)
        }))
      },
      cart: (() => {
        const snapshot = activeCartSnapshot && typeof activeCartSnapshot === 'object' ? activeCartSnapshot : null;
        const sameChat = String(snapshot?.chatId || '').trim() === String(activeChatId || '').trim();
        if (!snapshot || !sameChat) {
          return {
            items: [],
            subtotal: 0,
            discount: 0,
            total: 0,
            delivery: 0,
            currency: 'PEN',
            notes: null
          };
        }
        return {
          items: Array.isArray(snapshot.items) ? snapshot.items : [],
          subtotal: Number(snapshot.subtotal || 0),
          discount: Number(snapshot.discount || 0),
          total: Number(snapshot.total || 0),
          delivery: Number(snapshot.delivery || 0),
          currency: String(snapshot.currency || 'PEN').trim() || 'PEN',
          notes: String(snapshot.notes || '').trim() || null
        };
      })(),
      chat: {
        chatId: String(activeChatId || '').trim(),
        phone: e164Phone || null,
        recentMessages: recentMessagesRows
      },
      customer: {
        customerId: String(clientContact?.customerId || activeChatDetails?.customerId || '').trim() || null,
        phoneE164: e164Phone || null,
        name: String(activeChatDetails?.name || clientContact?.name || activeChatDetails?.pushname || '').trim() || null
      },
      ui: {
        contextSource: 'chat_window'
      }
    };

    const businessContext = `Contexto dinamico enviado en runtimeContext. Usa este bloque solo como fallback.`;

    const recentMessages = recentMessagesRows
      .map((entry) => `${entry.fromMe ? 'VENDEDOR' : 'CLIENTE'}: ${entry.body || '[sin texto]'}`)
      .join('\n');

    socket.emit('request_ai_suggestion', {
      contextText: recentMessages,
      businessContext,
      customPrompt: customPrompt || aiPrompt,
      moduleId: aiModuleId || undefined,
      runtimeContext
    });
  };
  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result.split(',')[1];
      setQuickReplyDraft(null);
      setAttachment({ data: base64Data, mimetype: file.type, filename: file.name });
      setAttachmentPreview(file.type.startsWith('image/') ? event.target.result : 'document');
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = () => { setAttachment(null); setAttachmentPreview(null); };

  const handleFileChange = (e) => {
    if (e.target.files[0]) processFile(e.target.files[0]);
    e.target.value = null;
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  };

  const activeTransport = String(waRuntime?.activeTransport || 'idle').toLowerCase();
  const cloudConfigured = Boolean(waRuntime?.cloudConfigured);
  const selectedModeLabel = 'WhatsApp Cloud API';
  const saasAuthEnabled = Boolean(saasRuntime?.authEnabled);
  const isSaasAuthenticated = !saasAuthEnabled || Boolean(saasSession?.accessToken);
  const runtimeTenantOptions = Array.isArray(saasRuntime?.tenants) ? saasRuntime.tenants : [];
  const sessionMemberships = Array.isArray(saasSession?.user?.memberships) ? saasSession.user.memberships : [];
  const tenantOptionsById = new Map();
  runtimeTenantOptions.forEach((tenant) => {
    const tenantId = String(tenant?.id || '').trim();
    if (!tenantId) return;
    tenantOptionsById.set(tenantId, tenant);
  });
  sessionMemberships.forEach((membership) => {
    const tenantId = String(membership?.tenantId || '').trim();
    if (!tenantId || tenantOptionsById.has(tenantId)) return;
    tenantOptionsById.set(tenantId, { id: tenantId, slug: tenantId, name: tenantId, active: true, plan: 'starter' });
  });
  const availableTenantOptions = Array.from(tenantOptionsById.values());
  const canSwitchTenant = saasAuthEnabled && isSaasAuthenticated && availableTenantOptions.length > 1;
  const saasUserRole = String(saasSession?.user?.role || '').trim().toLowerCase();
  const canManageSaas = !saasAuthEnabled || Boolean(saasSession?.user?.canManageSaas || saasSession?.user?.isSuperAdmin || saasUserRole === 'owner' || saasUserRole === 'admin' || saasUserRole === 'superadmin');
  const availableWaModules = normalizeWaModules(waModules).filter((module) => module.isActive !== false);
  const hasModuleCatalog = availableWaModules.length > 0;
  const activeCatalogModuleId = String(selectedCatalogModuleId || '').trim();
  const activeCatalogId = String(selectedCatalogId || '').trim().toUpperCase();

  useEffect(() => {
    canManageSaasRef.current = canManageSaas;
  }, [canManageSaas]);

  useEffect(() => {
    if (canManageSaas) return;
    if (showSaasAdminPanel) setShowSaasAdminPanel(false);
  }, [canManageSaas, showSaasAdminPanel]);

  useEffect(() => {
    if (!saasRuntime?.loaded) return;
    if (!saasAuthEnabled || !isSaasAuthenticated) return;
    if (!canManageSaas) return;
    if (forceOperationLaunch) return;
    if (selectedTransport) return;

    const tenantKey = String(saasSession?.user?.tenantId || saasRuntime?.tenant?.id || 'default').trim() || 'default';
    const userKey = String(saasSession?.user?.id || saasSession?.user?.email || '').trim() || 'manager';
    const sessionKey = `${tenantKey}:${userKey}`;
    if (saasAdminAutoOpenRef.current === sessionKey) return;

    saasAdminAutoOpenRef.current = sessionKey;
    setShowSaasAdminPanel(true);
  }, [
    saasRuntime?.loaded,
    saasRuntime?.tenant?.id,
    saasAuthEnabled,
    isSaasAuthenticated,
    canManageSaas,
    selectedTransport,
    saasSession?.user?.tenantId,
    saasSession?.user?.id,
    saasSession?.user?.email
  ]);

  useEffect(() => {
    if (isSaasAuthenticated) return;
    saasAdminAutoOpenRef.current = '';
  }, [isSaasAuthenticated]);

  useEffect(() => {
    if (!forceOperationLaunch) return;
    if (!isSaasAuthenticated) return;

    const requestedTenantId = String(requestedWaTenantFromUrlRef.current || '').trim();
    if (!requestedTenantId) return;
    if (requestedTenantId === tenantScopeId) {
      requestedWaTenantFromUrlRef.current = '';
      return;
    }

    const isAllowedTenant = availableTenantOptions.some((entry) => String(entry?.id || '').trim() === requestedTenantId);
    if (!isAllowedTenant) {
      requestedWaTenantFromUrlRef.current = '';
      return;
    }

    const marker = `${requestedTenantId}:${String(saasSession?.user?.id || saasSession?.user?.email || '')}`;
    if (launchTenantAppliedRef.current === marker) return;
    launchTenantAppliedRef.current = marker;

    Promise.resolve(handleSwitchTenant(requestedTenantId))
      .catch(() => { })
      .finally(() => {
        requestedWaTenantFromUrlRef.current = '';
      });
  }, [
    forceOperationLaunch,
    isSaasAuthenticated,
    tenantScopeId,
    availableTenantOptions,
    handleSwitchTenant,
    saasSession?.user?.id,
    saasSession?.user?.email
  ]);

  useEffect(() => {
    if (selectedTransport) return;
    if (!saasRuntime?.loaded) return;
    if (forceOperationLaunch || !canManageSaas) {
      setShowSaasAdminPanel(false);
      setSelectedTransport('cloud');
    }
  }, [selectedTransport, saasRuntime?.loaded, forceOperationLaunch, canManageSaas]);

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
        <Suspense fallback={<PanelChunkFallback />}>
          <AppErrorBoundary
            fallbackTitle='Error en Panel SaaS'
            fallbackMessage='Se detecto un error al cargar el panel. Puedes reintentar sin salir de sesion.'
            resetKeys={[tenantScopeId, saasSession?.user?.userId, requestedWaTenantFromUrl, requestedLaunchSource]}
            onError={(error) => {
              console.error('[SaaSPanelBoundary]', error);
            }}
          >
            <SaasAdminPanel
              isOpen
              onClose={handleSaasLogout}
              onLogout={handleSaasLogout}
              closeLabel='Cerrar sesion'
              onOpenWhatsAppOperation={handleOpenWhatsAppOperation}
              buildApiHeaders={buildApiHeaders}
              activeTenantId={tenantScopeId}
              canManageSaas={canManageSaas}
              userRole={saasUserRole}
              isSuperAdmin={Boolean(saasSession?.user?.isSuperAdmin)}
              currentUser={saasSession?.user || null}
              preferredTenantId={requestedWaTenantFromUrl || ''}
              launchSource={requestedLaunchSource || ''}
            />
          </AppErrorBoundary>
        </Suspense>
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
  const activeChatDetails = chats.find(c => c.id === activeChatId) || null;
  const forwardChatOptions = chats
    .filter((chat) => chat?.id && String(chat.id) !== String(activeChatId || ''))
    .map((chat) => ({
      id: chat.id,
      name: sanitizeDisplayText(chat?.name || '') || 'Contacto',
      phone: sanitizeDisplayText(chat?.phone || ''),
      subtitle: sanitizeDisplayText(chat?.subtitle || ''),
      timestamp: Number(chat?.timestamp || 0) || 0
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const appContainerClassName = forceOperationLaunch ? 'app-container app-container--operation' : 'app-container';

  return (
    <div className={appContainerClassName}>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
      />

      {/* Sidebar - Chat List */}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onChatSelect={handleChatSelect}
        myProfile={myProfile || businessData?.profile}
        onLogout={handleLogoutWhatsapp}
        onRefreshChats={handleRefreshChats}
        onStartNewChat={handleStartNewChat}
        labelDefinitions={labelDefinitions}
        onCreateLabel={handleCreateLabel}
        onLoadMoreChats={handleLoadMoreChats}
        chatsHasMore={chatsHasMore}
        chatsLoadingMore={isLoadingMoreChats}
        chatsTotal={chatsTotal}
        searchQuery={chatSearchQuery}
        onSearchQueryChange={handleChatSearchChange}
        activeFilters={chatFilters}
        onFiltersChange={handleChatFiltersChange}
        onOpenCompanyProfile={handleOpenCompanyProfile}
        saasAuthEnabled={saasAuthEnabled}
        tenantOptions={availableTenantOptions}
        activeTenantId={tenantScopeId}
        tenantSwitchError={tenantSwitchError}
        onSaasLogout={handleSaasLogout}
        canManageSaas={canManageSaas}
        onOpenSaasAdmin={() => handleOpenSaasAdminWorkspace({ tenantId: tenantScopeId })}
        waModules={availableWaModules}
        showBackToPanel={Boolean(forceOperationLaunch && canManageSaas)}
        onBackToPanel={() => handleOpenSaasAdminWorkspace({ tenantId: tenantScopeId })}
      />

      {/* Main Content Area */}
      <div className="main-workspace">
        {activeChatId ? (
          <div className="conversation-pane-shell">
            {/* Chat Window */}
            <ChatWindow
              activeChatDetails={{ ...activeChatDetails, ...clientContact }}
              messages={messages}
              messagesEndRef={messagesEndRef}
              isDragOver={isDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              showClientProfile={showClientProfile}
              setShowClientProfile={setShowClientProfile}
              /* ChatInput props */
              inputText={inputText}
              setInputText={setInputText}
              onSendMessage={handleSendMessage}
              onFileClick={() => fileInputRef.current?.click()}
              attachment={attachment}
              attachmentPreview={attachmentPreview}
              removeAttachment={removeAttachment}
              isAiLoading={isAiLoading}
              onRequestAiSuggestion={requestAiSuggestion}
              aiPrompt={aiPrompt}
              setAiPrompt={setAiPrompt}
              isCopilotMode={isCopilotMode}
              setIsCopilotMode={setIsCopilotMode}
              labelDefinitions={labelDefinitions}
              onToggleChatLabel={handleToggleChatLabel}
              onToggleChatPinned={handleToggleChatPinned}
              onEditMessage={handleEditMessage}
              onReplyMessage={waCapabilities.messageReply ? handleReplyMessage : null}
              onForwardMessage={waCapabilities.messageForward ? handleForwardMessage : null}
              onDeleteMessage={waCapabilities.messageDelete ? handleDeleteMessage : null}
              forwardChatOptions={forwardChatOptions}
              quickReplies={quickReplies}
              onSendQuickReply={handleSendQuickReply}
              quickReplyDraft={quickReplyDraft}
              onClearQuickReplyDraft={() => setQuickReplyDraft(null)}
              onLoadOrderToCart={handleLoadOrderToCart}
              onStartNewChat={handleStartNewChat}
              onCancelEditMessage={handleCancelEditMessage}
              onCancelReplyMessage={handleCancelReplyMessage}
              editingMessage={editingMessage}
              replyingMessage={replyingMessage}
              buildApiHeaders={buildApiHeaders}
              canEditMessages={waCapabilities.messageEdit}
              waModules={availableWaModules}
            />

            {/* Client Profile Panel (slides in from right) */}
            {showClientProfile && (
              <ClientProfilePanel
                contact={{ ...activeChatDetails, ...clientContact }}
                chats={chats}
                onClose={() => setShowClientProfile(false)}
                onQuickAiAction={requestAiSuggestion}
                panelRef={clientProfilePanelRef}
              />
            )}
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#222e35',
          }}>
            <div className="conversation-empty-card">
              <div className="conversation-empty-icon">WA</div>
              <h1 className="conversation-empty-title">
                WhatsApp Business Pro
              </h1>
              <p className="conversation-empty-text">
                Selecciona un chat para comenzar a vender.<br />
                Usa los botones de IA para cerrar mas ventas con OpenAI.
              </p>
              <div className="conversation-empty-features">
                <strong>Funciones IA disponibles:</strong><br />
                Sugerencia de respuesta automatica<br />
                Recomendacion de producto<br />
                Tecnicas de cierre de venta<br />
                Manejo de objeciones
              </div>
            </div>
          </div>
        )}

        {toasts.length > 0 && (
          <div className="in-app-toast-stack">
            {toasts.map((toast) => (
              <button key={toast.id} className="in-app-toast" onClick={() => { handleChatSelect(toast.chatId); setToasts((prev) => prev.filter((t) => t.id !== toast.id)); }}>
                <strong>{toast.title || 'Nuevo mensaje'}</strong>
                <span>{toast.body}</span>
              </button>
            ))}
          </div>
        )}

        {/* Business Sidebar - AI and Catalog */}
        {activeChatId && (
          <BusinessSidebar
            tenantScopeKey={tenantScopeId}
            setInputText={setInputText}
            businessData={businessData}
            messages={messages}
            activeChatId={activeChatId}
            activeChatPhone={activeChatDetails?.phone || clientContact?.phone || ''}
            activeChatDetails={activeChatDetails ? { ...activeChatDetails, ...clientContact } : (clientContact || null)}
            socket={socket}
            myProfile={myProfile || businessData?.profile}
            onLogout={handleLogoutWhatsapp}
            quickReplies={quickReplies}
            onSendQuickReply={handleSendQuickReply}
            pendingOrderCartLoad={pendingOrderCartLoad}
            waCapabilities={waCapabilities}
            openCompanyProfileToken={openCompanyProfileToken}
            waModules={availableWaModules}
            selectedCatalogModuleId={activeCatalogModuleId}
            selectedCatalogId={activeCatalogId}
            activeModuleId={String(activeChatDetails?.scopeModuleId || selectedWaModule?.moduleId || '').trim().toLowerCase()}
            onSelectCatalogModule={handleSelectCatalogModule}
            onSelectCatalog={handleSelectCatalog}
            onUploadCatalogImage={handleUploadCatalogImage}
            onCartSnapshotChange={handleCartSnapshotChange}
          />
        )}
      </div>

      <NewChatModal
        isOpen={newChatDialog.open}
        dialog={newChatDialog}
        availableModules={newChatAvailableModules}
        onChange={(patch) => setNewChatDialog((prev) => ({ ...prev, ...patch }))}
        onConfirm={handleConfirmNewChat}
        onCancel={handleCancelNewChatDialog}
      />
      <Suspense fallback={null}>
        <AppErrorBoundary
          fallbackTitle='Error en Panel SaaS'
          fallbackMessage='El panel tuvo un error inesperado. Puedes reintentar sin perder la sesion activa.'
          resetKeys={[showSaasAdminPanel, tenantScopeId, saasSession?.user?.userId, requestedWaSectionFromUrl]}
          onError={(error) => {
            console.error('[SaaSPanelModalBoundary]', error);
          }}
        >
          <SaasAdminPanel
            isOpen={showSaasAdminPanel}
            onClose={() => setShowSaasAdminPanel(false)}
            onLogout={handleSaasLogout}
            closeLabel='Cerrar sesion'
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
          />
        </AppErrorBoundary>
      </Suspense>
    </div>
  );
}

export default App;













































