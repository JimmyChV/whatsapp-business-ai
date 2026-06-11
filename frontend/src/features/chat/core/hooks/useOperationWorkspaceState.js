import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeChatFilters } from '../helpers/appChat.helpers';
import {
  getChats as getCachedChats,
  init as initChatLocalCache,
  saveChats as saveCachedChats,
  saveMessages as saveCachedMessages,
  saveMeta as saveCacheMeta,
  getMeta as getCacheMeta,
  clearAll as clearChatLocalCache
} from '../services/chatLocalCache.service';

const DEFAULT_CHAT_FILTERS = {
  labelTokens: [],
  unreadOnly: false,
  unlabeledOnly: false,
  onlyAssignedToMe: false,
  contactMode: 'all',
  archivedMode: 'all',
  pinnedMode: 'all',
  windowFilter: 'all',
  windowFilterCustomMinutes: 0
};

export default function useOperationWorkspaceState({
  selectedTransport,
  saasSession,
  saasRuntime,
  forceOperationLaunch,
  requestedWaModuleFromUrl,
  requestedWaTenantFromUrl,
  tenantScopeId
}) {
  const [chats, setChats] = useState([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [chatsHasMore, setChatsHasMore] = useState(true);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatFilters, setChatFilters] = useState(DEFAULT_CHAT_FILTERS);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingMessage, setReplyingMessage] = useState(null);

  const [myProfile, setMyProfile] = useState(null);

  const [showClientProfile, setShowClientProfile] = useState(false);
  const [clientContact, setClientContact] = useState(null);
  const [openCompanyProfileToken, setOpenCompanyProfileToken] = useState(0);

  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const fileInputRef = useRef(null);

  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isCopilotMode, setIsCopilotMode] = useState(false);

  const [businessData, setBusinessData] = useState({
    profile: null,
    labels: [],
    catalog: [],
    catalogMeta: { source: 'local', nativeAvailable: false }
  });
  const [activeCartSnapshot, setActiveCartSnapshot] = useState(null);
  const [labelDefinitions, setLabelDefinitions] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [quickReplyDraft, setQuickReplyDraft] = useState(null);
  const [sendTemplateOpen, setSendTemplateOpen] = useState(false);
  const [sendTemplateOptions, setSendTemplateOptions] = useState([]);
  const [sendTemplateOptionsLoading, setSendTemplateOptionsLoading] = useState(false);
  const [sendTemplateOptionsError, setSendTemplateOptionsError] = useState('');
  const [selectedSendTemplate, setSelectedSendTemplate] = useState(null);
  const [selectedSendTemplatePreview, setSelectedSendTemplatePreview] = useState(null);
  const [selectedSendTemplatePreviewLoading, setSelectedSendTemplatePreviewLoading] = useState(false);
  const [selectedSendTemplatePreviewError, setSelectedSendTemplatePreviewError] = useState('');
  const [sendTemplateSubmitting, setSendTemplateSubmitting] = useState(false);
  const [waModules, setWaModules] = useState([]);
  const [selectedWaModule, setSelectedWaModule] = useState(null);
  const [selectedCatalogModuleId, setSelectedCatalogModuleId] = useState('');
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [waModuleError, setWaModuleError] = useState('');
  const [waCapabilities, setWaCapabilities] = useState({
    messageEdit: false,
    messageEditSync: false,
    messageForward: false,
    messageDelete: false,
    messageReply: true,
    quickReplies: false,
    quickRepliesRead: false,
    quickRepliesWrite: false
  });
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

  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);
  const clientProfilePanelRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const chatsRef = useRef([]);
  const chatSearchRef = useRef('');
  const chatFiltersRef = useRef(normalizeChatFilters(DEFAULT_CHAT_FILTERS));
  const chatPagingRef = useRef({ offset: 0, hasMore: true, loading: false });
  const messagesCacheRef = useRef(new Map());
  const pendingOutgoingByChatRef = useRef(new Map());
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

  useEffect(() => {
    let cancelled = false;
    const accessToken = String(saasSession?.accessToken || '').trim();
    const safeTenantId = String(tenantScopeId || '').trim();

    (async () => {
      if (!accessToken || !safeTenantId || safeTenantId === 'default') {
        if (!cancelled) setIsCacheLoaded(true);
        return;
      }

      await initChatLocalCache(accessToken, safeTenantId);
      const cachedTenantId = String(await getCacheMeta('activeTenantId') || '').trim();
      if (cachedTenantId && cachedTenantId !== safeTenantId) {
        await clearChatLocalCache();
        await initChatLocalCache(accessToken, safeTenantId);
        if (!cancelled) setIsCacheLoaded(true);
        return;
      }

      const cachedChats = await getCachedChats();
      if (cancelled) return;
      const tenantChats = cachedChats.filter((chat) => {
        const cacheTenantId = String(chat?.tenantId || chat?.cacheTenantId || '').trim();
        return cacheTenantId === safeTenantId;
      });
      if (tenantChats.length > 0) {
        setChats(tenantChats);
        setChatsLoaded(true);
        setChatsTotal((prev) => Math.max(Number(prev || 0), tenantChats.length));
      }
      setIsCacheLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [saasSession?.accessToken, tenantScopeId]);

  useEffect(() => {
    if (!isCacheLoaded || !Array.isArray(chats) || chats.length === 0) return;
    const safeTenantId = String(tenantScopeId || '').trim();
    if (!safeTenantId || safeTenantId === 'default') return;
    saveCacheMeta('activeTenantId', safeTenantId);
    saveCachedChats(chats.map((chat) => ({ ...chat, tenantId: safeTenantId, cacheTenantId: safeTenantId })));
  }, [chats, isCacheLoaded, tenantScopeId]);

  useEffect(() => {
    const safeActiveChatId = String(activeChatId || '').trim();
    if (!isCacheLoaded || !safeActiveChatId || !Array.isArray(messages) || messages.length === 0) return;
    const realMessages = messages.filter((message) => !message?.optimistic);
    if (realMessages.length === 0) return;
    const safeTenantId = String(tenantScopeId || '').trim();
    if (!safeTenantId || safeTenantId === 'default') return;
    saveCachedMessages(safeActiveChatId, realMessages.map((message) => ({ ...message, tenantId: safeTenantId })));
  }, [activeChatId, isCacheLoaded, messages, tenantScopeId]);

  return {
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
    setActiveCartSnapshot,
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
  };
}
