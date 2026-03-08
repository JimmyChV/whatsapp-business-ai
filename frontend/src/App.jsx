import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

import Sidebar from './components/Sidebar';
import BusinessSidebar, { ClientProfilePanel } from './components/BusinessSidebar';
import ChatWindow from './components/ChatWindow';

import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SOCKET_AUTH_TOKEN = import.meta.env.VITE_SOCKET_AUTH_TOKEN || '';
const SAAS_SESSION_STORAGE_KEY = 'wa_saas_session_v1';

const socket = io(API_URL, {
  autoConnect: false,
  auth: SOCKET_AUTH_TOKEN ? { token: SOCKET_AUTH_TOKEN } : undefined
});

const loadStoredSaasSession = () => {
  try {
    const raw = localStorage.getItem(SAAS_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const accessToken = String(parsed.accessToken || '').trim();
    const refreshToken = String(parsed.refreshToken || '').trim();
    if (!accessToken || !refreshToken) return null;
    return {
      accessToken,
      refreshToken,
      tokenType: String(parsed.tokenType || 'Bearer').trim() || 'Bearer',
      accessExpiresAtUnix: Number(parsed.accessExpiresAtUnix || 0) || 0,
      refreshExpiresAtUnix: Number(parsed.refreshExpiresAtUnix || 0) || 0,
      user: parsed.user && typeof parsed.user === 'object' ? parsed.user : null
    };
  } catch (error) {
    return null;
  }
};

const persistSaasSession = (session = null) => {
  try {
    if (!session) {
      localStorage.removeItem(SAAS_SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SAAS_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    // ignore storage errors
  }
};
const normalizeCatalogItem = (item = {}, index = 0) => {
  const safeItem = item && typeof item === 'object' ? item : {};
  const rawTitle = safeItem.title || safeItem.name || safeItem.nombre || safeItem.productName || safeItem.sku || '';

  const parsePrice = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
  };

  const priceNum = parsePrice(safeItem.price ?? safeItem.regular_price ?? safeItem.sale_price ?? safeItem.amount ?? safeItem.precio, 0);
  const regularNum = parsePrice(safeItem.regularPrice ?? safeItem.regular_price ?? safeItem.price ?? safeItem.amount ?? safeItem.precio, priceNum);
  const saleNum = parsePrice(safeItem.salePrice ?? safeItem.sale_price, priceNum);
  const baseFinal = saleNum > 0 && saleNum < regularNum ? saleNum : priceNum;
  const finalNum = baseFinal > 0 ? baseFinal : regularNum;
  const computedDiscount = regularNum > 0 && finalNum > 0 && finalNum < regularNum
    ? Number((((regularNum - finalNum) / regularNum) * 100).toFixed(1))
    : 0;
  const rawDiscount = Number.parseFloat(String(safeItem.discountPct ?? safeItem.discount_pct ?? computedDiscount).replace(',', '.'));
  const discountPct = Number.isFinite(rawDiscount) ? Math.max(0, rawDiscount) : 0;
  const rawCategories = Array.isArray(safeItem.categories)
    ? safeItem.categories
    : (typeof safeItem.categories === 'string'
      ? safeItem.categories.split(',')
      : (safeItem.category
        ? [safeItem.category]
        : (safeItem.categoryName
          ? [safeItem.categoryName]
          : (safeItem.category_slug ? [safeItem.category_slug] : []))));
  const categories = rawCategories
    .map((entry) => (typeof entry === 'string' ? entry : (entry?.name || entry?.slug || entry?.title || '')))
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  return {
    id: safeItem.id || safeItem.product_id || `catalog_${index}`,
    title: String(rawTitle || `Producto ${index + 1}`).trim(),
    price: Number.isFinite(finalNum) ? finalNum.toFixed(2) : '0.00',
    regularPrice: Number.isFinite(regularNum) ? regularNum.toFixed(2) : (Number.isFinite(finalNum) ? finalNum.toFixed(2) : '0.00'),
    salePrice: Number.isFinite(saleNum) && saleNum > 0 ? saleNum.toFixed(2) : null,
    discountPct,
    description: safeItem.description || safeItem.short_description || safeItem.descripcion || '',
    imageUrl: safeItem.imageUrl || safeItem.image || safeItem.image_url || safeItem.images?.[0]?.src || null,
    source: safeItem.source || 'unknown',
    sku: safeItem.sku || null,
    stockStatus: safeItem.stockStatus || safeItem.stock_status || null,
    categories
  };
};

const normalizeProfilePhotoUrl = (rawUrl = '') => {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;

  if (value.includes('/api/profile-photo?url=')) {
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${API_URL}${value}`;
    return `${API_URL}/${value}`;
  }

  if (!/^https?:\/\//i.test(value)) return value;
  return `${API_URL}/api/profile-photo?url=${encodeURIComponent(value)}`;
};

const normalizeProfilePayload = (profile = null) => {
  if (!profile || typeof profile !== 'object') return null;
  return {
    ...profile,
    profilePicUrl: normalizeProfilePhotoUrl(profile.profilePicUrl)
  };
};

const normalizeBusinessDataPayload = (data = {}) => {
  const rawCatalog = Array.isArray(data.catalog) ? data.catalog : [];
  const catalog = rawCatalog.map((item, idx) => normalizeCatalogItem(item, idx));
  return {
    profile: normalizeProfilePayload(data.profile || null),
    labels: Array.isArray(data.labels) ? data.labels : [],
    catalog,
    catalogMeta: data.catalogMeta || { source: 'local', nativeAvailable: false }
  };
};

const normalizeChatLabels = (labels = []) => (Array.isArray(labels) ? labels.map((l) => ({ id: l?.id, name: l?.name || '', color: l?.color || null })) : []);

const cleanLooseText = (value = '') => String(value || '')
  .replace(/\uFFFD/g, '')
  .replace(/[\u0000-\u001F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');
const isLikelyPhoneDigits = (digits = '') => {
  const d = normalizeDigits(digits);
  return d.length >= 8 && d.length <= 12;
};

const extractPhoneFromText = (value = '') => {
  const text = String(value || '');
  if (!text) return null;
  const matches = text.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
  for (const token of matches) {
    const digits = normalizeDigits(token);
    if (isLikelyPhoneDigits(digits)) return digits;
  }
  return null;
};

const getBestChatPhone = (chat = {}) => {
  const direct = normalizeDigits(chat?.phone || '');
  if (isLikelyPhoneDigits(direct)) return direct;

  const fromSubtitle = extractPhoneFromText(chat?.subtitle || '');
  if (fromSubtitle) return fromSubtitle;

  const fromStatus = extractPhoneFromText(chat?.status || '');
  if (fromStatus) return fromStatus;

  const id = String(chat?.id || '');
  if (id.endsWith('@lid')) return null;
  const idUser = normalizeDigits(id.split('@')[0] || '');
  if (id.endsWith('@c.us') && isLikelyPhoneDigits(idUser)) return idUser;
  if (isLikelyPhoneDigits(idUser)) return idUser;

  return null;
};

const repairMojibake = (value = '') => {
  let text = String(value || '');
  if (!text) return '';
  try {
    const decoded = decodeURIComponent(escape(text));
    const cleanDecoded = decoded.replace(/\uFFFD/g, '');
    const cleanOriginal = text.replace(/\uFFFD/g, '');
    if (decoded && decoded !== text && cleanDecoded.length >= Math.floor(cleanOriginal.length * 0.8)) {
      text = decoded;
    }
  } catch (e) { }
  return text.replace(/\uFFFD/g, '');
};

const sanitizeDisplayText = (value = '') => repairMojibake(value)
  .replace(/[\u0000-\u001F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeMessageFilename = (value = '') => {
  let name = String(value || '').trim();
  if (!name) return null;
  name = name
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop() || '';
  name = name.split('?')[0].split('#')[0].trim();
  name = repairMojibake(name)
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim();
  if (!name) return null;
  return name;
};

const isGenericFilename = (value = '') => {
  const base = String(value || '').trim().toLowerCase().replace(/\.[a-z0-9]{1,8}$/i, '');
  if (!base) return true;
  return ['archivo', 'file', 'adjunto', 'attachment', 'document', 'documento', 'media', 'download', 'descarga', 'unknown'].includes(base);
};

const isMachineLikeFilename = (value = '') => {
  const base = String(value || '').trim().replace(/\.[a-z0-9]{1,8}$/i, '').replace(/\s+/g, '');
  if (!base) return true;
  if (/^\d{8,}$/.test(base)) return true;
  if (/^[a-f0-9]{16,}$/i.test(base)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) return true;
  if (/^3EB0[A-F0-9]{8,}$/i.test(base)) return true;
  return false;
};

const normalizeParticipantList = (participants = []) => {
  if (!Array.isArray(participants)) return [];

  const seen = new Set();
  const normalized = [];
  for (const entry of participants) {
    if (!entry || typeof entry !== 'object') continue;
    const id = String(entry.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const pushname = sanitizeDisplayText(entry.pushname || '');
    const shortName = sanitizeDisplayText(entry.shortName || '');
    const displayName = sanitizeDisplayText(entry.displayName || '');
    const name = sanitizeDisplayText(entry.name || displayName || pushname || shortName || '');
    const phoneDigits = normalizeDigits(entry.phone || id.split('@')[0] || '');
    const phone = isLikelyPhoneDigits(phoneDigits) ? phoneDigits : '';
    const isSuperAdmin = Boolean(entry.isSuperAdmin);
    const isAdmin = Boolean(entry.isAdmin || isSuperAdmin);

    normalized.push({
      id,
      name: name || null,
      displayName: displayName || name || null,
      pushname: pushname || null,
      shortName: shortName || null,
      phone: phone || null,
      isAdmin,
      isSuperAdmin,
      isMe: Boolean(entry.isMe),
      role: isSuperAdmin ? 'superadmin' : (isAdmin ? 'admin' : 'member')
    });
  }

  return normalized.sort((a, b) => {
    if (a.isSuperAdmin !== b.isSuperAdmin) return a.isSuperAdmin ? -1 : 1;
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    const aLabel = sanitizeDisplayText(a.displayName || a.name || a.phone || '').toLowerCase();
    const bLabel = sanitizeDisplayText(b.displayName || b.name || b.phone || '').toLowerCase();
    return aLabel.localeCompare(bLabel, 'es', { sensitivity: 'base' });
  });
};

const normalizeMessageLocation = (location = null) => {
  if (!location || typeof location !== 'object') return null;

  const parseCoord = (value) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const latitude = parseCoord(location?.latitude);
  const longitude = parseCoord(location?.longitude);
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

  const rawMapUrl = String(location?.mapUrl || location?.url || '').trim();
  const mapUrl = /^https?:\/\//i.test(rawMapUrl)
    ? rawMapUrl
    : (hasCoords ? `https://www.google.com/maps?q=${latitude},${longitude}` : null);

  const label = sanitizeDisplayText(location?.label || '');
  const text = sanitizeDisplayText(location?.text || '');

  if (!label && !text && !mapUrl && !hasCoords) return null;

  return {
    latitude: hasCoords ? latitude : null,
    longitude: hasCoords ? longitude : null,
    label: label || null,
    text: text || null,
    mapUrl: mapUrl || null
  };
};

const normalizeQuotedMessage = (quoted = null) => {
  if (!quoted || typeof quoted !== 'object') return null;
  const id = String(quoted?.id || '').trim();
  const body = sanitizeDisplayText(quoted?.body || '');
  const type = String(quoted?.type || 'chat').trim() || 'chat';
  const fromMe = Boolean(quoted?.fromMe);
  const hasMedia = Boolean(quoted?.hasMedia);
  const timestamp = Number(quoted?.timestamp || 0) || null;

  if (!id && !body && !hasMedia) return null;

  const preview = body || (hasMedia ? 'Adjunto' : 'Mensaje');
  return {
    id: id || null,
    body: preview,
    type,
    fromMe,
    hasMedia,
    timestamp
  };
};
const getMessagePreviewText = (msg = {}) => {
  const type = String(msg?.type || '').toLowerCase();
  const location = normalizeMessageLocation(msg?.location);

  if (type === 'location') {
    if (location?.label) return 'Ubicacion: ' + location.label;
    if (location?.text) return 'Ubicacion: ' + location.text;
    return 'Ubicacion';
  }

  const body = sanitizeDisplayText(msg?.body || '');
  if (body) {
    const looksLikeMaps = /https?:\/\/(?:www\.)?(?:google\.[^\s/]+\/maps|maps\.app\.goo\.gl|maps\.google\.com)|geo:/i.test(body);
    if (looksLikeMaps) return 'Ubicacion';
    return body;
  }

  const fallbackByType = {
    image: 'Imagen',
    video: 'Video',
    audio: 'Audio',
    ptt: 'Nota de voz',
    document: 'Documento',
    sticker: 'Sticker',
    location: 'Ubicacion',
    vcard: 'Contacto',
    order: 'Pedido',
    revoked: 'Mensaje eliminado'
  };

  return fallbackByType[type] || 'Mensaje';
};
const isInternalIdentifier = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  return text.includes('@') || /^\d{14,}$/.test(text);
};

const normalizeDisplayNameKey = (value = '') => sanitizeDisplayText(value)
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const isPlaceholderChat = (chat = {}) => {
  const ts = Number(chat?.timestamp || 0);
  const lastMessage = sanitizeDisplayText(chat?.lastMessage || '');
  return ts <= 0 && !lastMessage;
};

const chatIdentityKey = (chat = {}) => {
  const id = String(chat?.id || '').trim();
  const phone = getBestChatPhone(chat);
  if (phone) return `phone:${phone}`;
  return `id:${id}`;
};

const dedupeChats = (list = []) => {
  const seen = new Set();
  const deduped = [];
  for (const chat of list) {
    const key = chatIdentityKey(chat);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(chat);
  }

  const namesWithHistory = new Set(
    deduped
      .filter((chat) => !isPlaceholderChat(chat))
      .map((chat) => normalizeDisplayNameKey(chat?.name || ''))
      .filter(Boolean)
  );

  return deduped.filter((chat) => {
    if (!isPlaceholderChat(chat)) return true;
    const nameKey = normalizeDisplayNameKey(chat?.name || '');
    if (!nameKey) return true;
    return !namesWithHistory.has(nameKey);
  });
};

const chatMatchesQuery = (chat = {}, query = '') => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const qDigits = normalizeDigits(q);
  const name = String(chat?.name || '').toLowerCase();
  const subtitle = String(chat?.subtitle || '').toLowerCase();
  const lastMessage = String(chat?.lastMessage || '').toLowerCase();
  const phone = getBestChatPhone(chat) || '';

  if (qDigits) return phone.includes(qDigits);
  return name.includes(q) || subtitle.includes(q) || lastMessage.includes(q);
};
const normalizeFilterToken = (value = '') => String(value || '').trim().toLowerCase();

const normalizeChatFilters = (filters = {}) => {
  const rawTokens = Array.isArray(filters?.labelTokens) ? filters.labelTokens : [];
  const seen = new Set();
  const labelTokens = [];
  for (const token of rawTokens) {
    const clean = normalizeFilterToken(token);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    labelTokens.push(clean);
  }

  const contactMode = ['all', 'my', 'unknown'].includes(String(filters?.contactMode || 'all'))
    ? String(filters?.contactMode || 'all')
    : 'all';
  const archivedMode = ['all', 'archived', 'active'].includes(String(filters?.archivedMode || 'all'))
    ? String(filters?.archivedMode || 'all')
    : 'all';

  return {
    labelTokens,
    unreadOnly: Boolean(filters?.unreadOnly),
    unlabeledOnly: Boolean(filters?.unlabeledOnly),
    contactMode,
    archivedMode,
  };
};

const buildFiltersKey = (filters = {}) => {
  const normalized = normalizeChatFilters(filters);
  return JSON.stringify({
    ...normalized,
    labelTokens: [...normalized.labelTokens].sort(),
  });
};

const chatLabelTokenSet = (chat = {}) => {
  const set = new Set();
  const labels = Array.isArray(chat?.labels) ? chat.labels : [];
  for (const label of labels) {
    const id = normalizeFilterToken(label?.id);
    if (id) set.add(`id:${id}`);
    const name = normalizeFilterToken(label?.name);
    if (name) set.add(`name:${name}`);
  }
  return set;
};

const chatMatchesFilters = (chat = {}, filters = {}) => {
  const normalized = normalizeChatFilters(filters);

  if (normalized.unreadOnly && Number(chat?.unreadCount || 0) <= 0) return false;

  const isMyContact = Boolean(chat?.isMyContact);
  if (normalized.contactMode === 'my' && !isMyContact) return false;
  if (normalized.contactMode === 'unknown' && isMyContact) return false;
  const isArchived = Boolean(chat?.archived);
  if (normalized.archivedMode === 'archived' && !isArchived) return false;
  if (normalized.archivedMode === 'active' && isArchived) return false;

  const labelSet = chatLabelTokenSet(chat);
  if (normalized.unlabeledOnly && labelSet.size > 0) return false;

  if (!normalized.unlabeledOnly && normalized.labelTokens.length > 0) {
    const hasLabel = normalized.labelTokens.some((token) => {
      const clean = normalizeFilterToken(token);
      if (!clean) return false;
      if (labelSet.has(clean)) return true;
      if (clean.startsWith('id:')) {
        const val = clean.slice(3);
        return val ? labelSet.has(val) : false;
      }
      if (clean.startsWith('name:')) {
        const val = clean.slice(5);
        return val ? labelSet.has(val) : false;
      }
      return labelSet.has(`id:${clean}`) || labelSet.has(`name:${clean}`);
    });
    if (!hasLabel) return false;
  }

  return true;
};
const isVisibleChatId = (chatId = '') => {
  const id = String(chatId || '');
  if (!id) return false;
  if (id.includes('status@broadcast')) return false;
  if (id.endsWith('@broadcast')) return false;
  return true;
};

const upsertAndSortChat = (list = [], incoming = null) => {
  if (!incoming?.id) return list;
  const incomingKey = chatIdentityKey(incoming);
  const without = list.filter((c) => c.id !== incoming.id && chatIdentityKey(c) !== incomingKey);
  const merged = [incoming, ...without].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return dedupeChats(merged);
};

const CHAT_PAGE_SIZE = 80;
const TRANSPORT_STORAGE_KEY = 'wa_transport_mode';
const LABEL_DEFS_STORAGE_PREFIX = 'wa_custom_label_defs';

const buildScopedStorageKey = (prefix = '', scope = 'default') => {
  const cleanPrefix = String(prefix || '').trim();
  const cleanScope = String(scope || 'default').trim().toLowerCase() || 'default';
  return `${cleanPrefix}:${cleanScope}`;
};

function App() {
  // --------------------------------------------------------------
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [isClientReady, setIsClientReady] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState(() => {
    const saved = String(localStorage.getItem(TRANSPORT_STORAGE_KEY) || '').trim().toLowerCase();
    return (saved === 'webjs' || saved === 'cloud') ? saved : '';
  });
  const [waRuntime, setWaRuntime] = useState({ requestedTransport: 'idle', activeTransport: 'idle', cloudConfigured: false, cloudReady: false, availableTransports: ['webjs', 'cloud'] });
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
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTenantId, setLoginTenantId] = useState('');
  const tenantScopeId = String(saasSession?.user?.tenantId || saasRuntime?.tenant?.id || 'default').trim() || 'default';
  const labelDefsStorageKey = buildScopedStorageKey(LABEL_DEFS_STORAGE_PREFIX, tenantScopeId);

  // --------------------------------------------------------------
  const [chats, setChats] = useState([]);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [chatsHasMore, setChatsHasMore] = useState(true);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatFilters, setChatFilters] = useState({ labelTokens: [], unreadOnly: false, unlabeledOnly: false, contactMode: 'all', archivedMode: 'all' });
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
  const [labelDefinitions, setLabelDefinitions] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);

  const [waCapabilities, setWaCapabilities] = useState({ messageEdit: true, messageEditSync: true, messageForward: true, messageDelete: true, messageReply: true, quickReplies: false, quickRepliesRead: false, quickRepliesWrite: false });
  const [toasts, setToasts] = useState([]);
  const [pendingOrderCartLoad, setPendingOrderCartLoad] = useState(null);

  // --------------------------------------------------------------
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);
  const clientProfilePanelRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const chatsRef = useRef([]);
  const chatSearchRef = useRef('');
  const chatFiltersRef = useRef(normalizeChatFilters({ labelTokens: [], unreadOnly: false, unlabeledOnly: false, contactMode: 'all', archivedMode: 'all' }));
  const chatPagingRef = useRef({ offset: 0, hasMore: true, loading: false });
  const shouldInstantScrollRef = useRef(false);
  const prevMessagesMetaRef = useRef({ count: 0, lastId: '' });
  const suppressSmoothScrollUntilRef = useRef(0);
  const selectedTransportRef = useRef(selectedTransport);
  const saasSessionRef = useRef(saasSession);
  const saasRuntimeRef = useRef(saasRuntime);
  const labelDefsPersistenceStateRef = useRef({ key: '', loaded: false });
  const tenantScopeRef = useRef(tenantScopeId);

  // --------------------------------------------------------------
  // Notifications
  // --------------------------------------------------------------
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    try {
      const scopedRaw = localStorage.getItem(labelDefsStorageKey);
      const legacyRaw = localStorage.getItem(LABEL_DEFS_STORAGE_PREFIX);
      const rawToUse = scopedRaw ?? legacyRaw ?? '[]';
      const parsed = JSON.parse(rawToUse);
      labelDefsPersistenceStateRef.current = { key: labelDefsStorageKey, loaded: true };
      setLabelDefinitions(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      labelDefsPersistenceStateRef.current = { key: labelDefsStorageKey, loaded: true };
      setLabelDefinitions([]);
      console.warn('No se pudieron leer etiquetas locales', error?.message || error);
    }
  }, [labelDefsStorageKey]);

  useEffect(() => {
    const persistence = labelDefsPersistenceStateRef.current;
    if (!persistence?.loaded || persistence.key !== labelDefsStorageKey) return;
    try {
      localStorage.setItem(labelDefsStorageKey, JSON.stringify(Array.isArray(labelDefinitions) ? labelDefinitions : []));
    } catch (error) {
      console.warn('No se pudieron guardar etiquetas locales', error?.message || error);
    }
  }, [labelDefinitions, labelDefsStorageKey]);

  const buildApiHeaders = useCallback((options = {}) => {
    const includeJson = Boolean(options?.includeJson);
    const tokenOverride = String(options?.tokenOverride || '').trim();
    const tenantIdOverride = String(options?.tenantIdOverride || '').trim();

    const session = saasSessionRef.current;
    const runtime = saasRuntimeRef.current;
    const accessToken = tokenOverride || String(session?.accessToken || '').trim();
    const tenantId = tenantIdOverride || String(session?.user?.tenantId || runtime?.tenant?.id || '').trim();

    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
    return headers;
  }, []);

  const normalizeSaasSessionPayload = useCallback((payload = {}, previousSession = null) => {
    const accessToken = String(payload?.accessToken || '').trim();
    const refreshToken = String(payload?.refreshToken || '').trim() || String(previousSession?.refreshToken || '').trim();
    if (!accessToken || !refreshToken) return null;

    const now = Math.floor(Date.now() / 1000);
    const accessExpiresIn = Number(payload?.expiresInSec || 0);
    const accessExpiresAtUnix = accessExpiresIn > 0 ? (now + accessExpiresIn) : (Number(previousSession?.accessExpiresAtUnix || 0) || 0);
    const refreshExpiresAtUnix = Number(payload?.refreshExpiresAtUnix || 0)
      || (Number(payload?.refreshExpiresInSec || 0) > 0 ? (now + Number(payload.refreshExpiresInSec)) : 0)
      || (Number(previousSession?.refreshExpiresAtUnix || 0) || 0);

    return {
      accessToken,
      refreshToken,
      tokenType: String(payload?.tokenType || previousSession?.tokenType || 'Bearer').trim() || 'Bearer',
      accessExpiresAtUnix,
      refreshExpiresAtUnix,
      user: payload?.user && typeof payload.user === 'object'
        ? payload.user
        : (previousSession?.user && typeof previousSession.user === 'object' ? previousSession.user : null)
    };
  }, []);

  const refreshSaasSession = useCallback(async (refreshTokenOverride = '') => {
    const current = saasSessionRef.current;
    const refreshToken = String(refreshTokenOverride || current?.refreshToken || '').trim();
    if (!refreshToken) throw new Error('No hay refresh token disponible.');

    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: buildApiHeaders({ includeJson: true, tokenOverride: String(current?.accessToken || '').trim() }),
      body: JSON.stringify({ refreshToken })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      throw new Error(String(payload?.error || 'No se pudo renovar sesion.'));
    }

    const nextSession = normalizeSaasSessionPayload(payload, current);
    if (!nextSession) throw new Error('Sesion renovada invalida.');
    setSaasSession(nextSession);
    return nextSession;
  }, [buildApiHeaders, normalizeSaasSessionPayload]);

  useEffect(() => {
    let cancelled = false;

    const fetchRuntime = async (tokenOverride = '') => {
      try {
        const response = await fetch(`${API_URL}/api/saas/runtime`, {
          headers: buildApiHeaders({ tokenOverride })
        });
        const payload = await response.json().catch(() => ({}));
        return {
          ok: response.ok,
          payload: payload && typeof payload === 'object' ? payload : {},
          error: String(payload?.error || '')
        };
      } catch (error) {
        return {
          ok: false,
          payload: {},
          error: String(error?.message || 'No se pudo cargar runtime SaaS.')
        };
      }
    };

    (async () => {
      setSaasAuthBusy(true);
      setSaasAuthError('');

      const existing = saasSessionRef.current;
      let nextSession = existing;

      let runtimeResult = await fetchRuntime(String(existing?.accessToken || ''));
      let runtimePayload = runtimeResult.payload || {};
      const authEnabled = Boolean(runtimePayload?.authEnabled);
      const runtimeAuthed = Boolean(runtimePayload?.authContext?.isAuthenticated && runtimePayload?.authContext?.user);

      if (authEnabled) {
        if (runtimeAuthed && existing?.accessToken) {
          nextSession = { ...existing, user: runtimePayload.authContext.user };
        } else if (existing?.refreshToken) {
          try {
            const refreshed = await refreshSaasSession(existing.refreshToken);
            nextSession = refreshed;
            runtimeResult = await fetchRuntime(String(refreshed?.accessToken || ''));
            runtimePayload = runtimeResult.payload || runtimePayload;
            if (runtimePayload?.authContext?.isAuthenticated && runtimePayload?.authContext?.user) {
              nextSession = { ...refreshed, user: runtimePayload.authContext.user };
            }
          } catch (_error) {
            nextSession = null;
          }
        } else {
          nextSession = null;
        }
      }

      if (cancelled) return;

      const runtimeTenant = runtimePayload?.tenant || null;
      const runtimeUser = runtimePayload?.authContext?.user || nextSession?.user || null;
      setSaasSession(nextSession);
      setSaasRuntime({
        loaded: true,
        authEnabled,
        tenant: runtimeTenant,
        tenants: Array.isArray(runtimePayload?.tenants) ? runtimePayload.tenants : [],
        authContext: {
          enabled: authEnabled,
          isAuthenticated: Boolean(runtimePayload?.authContext?.isAuthenticated),
          user: runtimeUser
        }
      });

      const suggestedTenant = String(runtimeTenant?.id || runtimeUser?.tenantId || '').trim();
      if (suggestedTenant) setLoginTenantId((prev) => prev || suggestedTenant);
      const suggestedEmail = String(runtimeUser?.email || '').trim();
      if (suggestedEmail) setLoginEmail((prev) => prev || suggestedEmail);

      if (!runtimeResult.ok) {
        setSaasAuthError(runtimeResult.error || 'No se pudo cargar runtime SaaS.');
      }
      setSaasAuthBusy(false);
    })().catch((error) => {
      if (cancelled) return;
      setSaasRuntime((prev) => ({ ...prev, loaded: true }));
      setSaasAuthBusy(false);
      setSaasAuthError(String(error?.message || 'No se pudo inicializar SaaS.'));
    });

    return () => {
      cancelled = true;
    };
  }, [buildApiHeaders, refreshSaasSession]);

  useEffect(() => {
    if (!saasRuntime?.authEnabled) return;
    if (!saasSession?.refreshToken) return;
    if (!Number.isFinite(Number(saasSession?.accessExpiresAtUnix)) || Number(saasSession.accessExpiresAtUnix) <= 0) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const expiresAt = Number(saasSessionRef.current?.accessExpiresAtUnix || 0);
      const now = Math.floor(Date.now() / 1000);
      if (!expiresAt || (expiresAt - now) > 120) return;

      try {
        await refreshSaasSession();
      } catch (_error) {
        if (cancelled) return;
        setSaasSession(null);
        setSaasAuthError('Sesion expirada. Inicia sesion nuevamente.');
      }
    };

    const interval = setInterval(tick, 30000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [saasRuntime?.authEnabled, saasSession?.refreshToken, saasSession?.accessExpiresAtUnix, refreshSaasSession]);

  useEffect(() => {
    if (!saasRuntime?.loaded) return;

    const authRequired = Boolean(saasRuntime?.authEnabled);
    const accessToken = String(saasSession?.accessToken || '').trim();
    const tenantId = String(saasSession?.user?.tenantId || saasRuntime?.tenant?.id || '').trim();

    if (authRequired && !accessToken) {
      if (socket.connected) socket.disconnect();
      setIsConnected(false);
      setIsClientReady(false);
      return;
    }

    const auth = {};
    if (SOCKET_AUTH_TOKEN) auth.token = SOCKET_AUTH_TOKEN;
    if (accessToken) auth.accessToken = accessToken;
    if (tenantId) auth.tenantId = tenantId;
    socket.auth = Object.keys(auth).length > 0 ? auth : undefined;

    if (!socket.connected) socket.connect();
  }, [saasRuntime?.loaded, saasRuntime?.authEnabled, saasRuntime?.tenant?.id, saasSession?.accessToken, saasSession?.user?.tenantId]);

  // --------------------------------------------------------------
  // Auto-scroll
  // --------------------------------------------------------------
  useLayoutEffect(() => {
    const endNode = messagesEndRef.current;
    if (!endNode) return;
    const messagesContainer = endNode.parentElement;
    if (!messagesContainer) return;

    const nextCount = Array.isArray(messages) ? messages.length : 0;
    const nextLastId = nextCount > 0 ? String(messages[nextCount - 1]?.id || '') : '';
    const prevMeta = prevMessagesMetaRef.current || { count: 0, lastId: '' };
    const isNewMessageAppend = nextCount > prevMeta.count;
    const shouldForceScroll = shouldInstantScrollRef.current || isNewMessageAppend;

    if (shouldForceScroll) {
      const inQuietWindow = Date.now() < suppressSmoothScrollUntilRef.current;
      const behavior = (shouldInstantScrollRef.current || inQuietWindow || !isNewMessageAppend) ? 'auto' : 'smooth';
      const targetTop = messagesContainer.scrollHeight;
      if (behavior === 'smooth') {
        messagesContainer.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        messagesContainer.scrollTop = targetTop;
      }
    }

    if (shouldInstantScrollRef.current) shouldInstantScrollRef.current = false;
    prevMessagesMetaRef.current = { count: nextCount, lastId: nextLastId };
  }, [messages]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    chatSearchRef.current = String(chatSearchQuery || '').trim();
  }, [chatSearchQuery]);

  useEffect(() => {
    chatFiltersRef.current = normalizeChatFilters(chatFilters);
  }, [chatFilters]);

  useEffect(() => {
    selectedTransportRef.current = selectedTransport;
    if (selectedTransport) localStorage.setItem(TRANSPORT_STORAGE_KEY, selectedTransport);
    else localStorage.removeItem(TRANSPORT_STORAGE_KEY);
  }, [selectedTransport]);

  useEffect(() => {
    saasSessionRef.current = saasSession;
    persistSaasSession(saasSession);
  }, [saasSession]);

  useEffect(() => {
    saasRuntimeRef.current = saasRuntime;
  }, [saasRuntime]);

  useEffect(() => {
    if (selectedTransport !== 'cloud') return;
    if (waRuntime?.activeTransport !== 'cloud') return;
    if (waRuntime?.cloudConfigured) return;
    setIsClientReady(false);
    setTransportError('Cloud API no configurada en backend/.env.');
  }, [selectedTransport, waRuntime]);

  useEffect(() => {
    if (!showClientProfile) return;
    const handleOutsideClick = (event) => {
      const target = event.target;
      if (clientProfilePanelRef.current?.contains(target)) return;
      setShowClientProfile(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showClientProfile]);

  useEffect(() => {
    if (!isClientReady) return;
    const timer = setTimeout(() => {
      requestChatsPage({ reset: true });
    }, 180);
    return () => clearTimeout(timer);
  }, [chatSearchQuery, chatFilters, isClientReady]);

  // --------------------------------------------------------------
  const requestChatsPage = ({ reset = false } = {}) => {
    if (chatPagingRef.current.loading && !reset) return;
    if (!reset && !chatPagingRef.current.hasMore) return;

    const offset = reset ? 0 : chatPagingRef.current.offset;
    const query = chatSearchRef.current;
    const filters = chatFiltersRef.current;
    chatPagingRef.current.loading = true;
    if (reset) {
      chatPagingRef.current.offset = 0;
      chatPagingRef.current.hasMore = true;
      setChatsHasMore(true);
      setChatsTotal(0);
    }
    setIsLoadingMoreChats(true);
    socket.emit('get_chats', { offset, limit: CHAT_PAGE_SIZE, reset, query, filters, filterKey: buildFiltersKey(filters) });
  };

  // Socket Events
  // --------------------------------------------------------------
  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true);
      setTransportError('');
      const mode = selectedTransportRef.current;
      setIsSwitchingTransport(true);
      socket.emit('set_transport_mode', { mode: mode || 'idle' });
      socket.emit('get_wa_capabilities');
    });
    socket.on('connect_error', (error) => {
      setIsConnected(false);
      const message = String(error?.message || '').trim();
      if (saasRuntimeRef.current?.authEnabled && /unauthorized/i.test(message)) {
        setSaasSession(null);
        setSaasAuthError('Sesion SaaS expirada o invalida. Inicia sesion nuevamente.');
      }
    });

    socket.on('tenant_context', (ctx) => {
      if (!ctx || typeof ctx !== 'object') return;
      const tenantId = String(ctx?.tenantId || '').trim();
      const authUser = ctx?.auth?.user && typeof ctx.auth.user === 'object' ? ctx.auth.user : null;

      if (tenantId) {
        setSaasRuntime((prev) => ({
          ...prev,
          tenant: {
            ...(prev?.tenant || {}),
            id: tenantId,
            slug: prev?.tenant?.slug || tenantId,
            name: prev?.tenant?.name || tenantId,
            active: prev?.tenant?.active !== false,
            plan: prev?.tenant?.plan || 'starter'
          }
        }));
      }

      if (authUser && saasSessionRef.current?.accessToken) {
        setSaasSession((prev) => prev ? ({ ...prev, user: authUser }) : prev);
      }
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
      socket.emit('get_business_data');
      socket.emit('get_my_profile');

      socket.emit('get_wa_capabilities');
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
        quickReplies: Boolean(caps?.quickReplies),
        quickRepliesRead: Boolean(caps?.quickRepliesRead),
        quickRepliesWrite: Boolean(caps?.quickRepliesWrite),
      };
      setWaCapabilities(nextCaps);
      if (nextCaps.quickRepliesRead) {
        socket.emit('get_quick_replies');
      } else {
        setQuickReplies([]);
      }
    });

    socket.on('wa_runtime', (runtime) => {
      const nextRuntime = runtime && typeof runtime === 'object' ? runtime : {};
      setWaRuntime((prev) => ({
        ...prev,
        ...nextRuntime,
        availableTransports: Array.isArray(nextRuntime?.availableTransports) ? nextRuntime.availableTransports : (prev?.availableTransports || ['webjs', 'cloud'])
      }));
    });

    socket.on('transport_mode_set', (runtime) => {
      const nextRuntime = runtime && typeof runtime === 'object' ? runtime : {};
      setWaRuntime((prev) => ({
        ...prev,
        ...nextRuntime,
        availableTransports: Array.isArray(nextRuntime?.availableTransports) ? nextRuntime.availableTransports : (prev?.availableTransports || ['webjs', 'cloud'])
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
      const hydrated = rawItems
        .filter((chat) => chat?.id && isVisibleChatId(chat.id))
        .map((chat) => ({
          ...chat,
          name: sanitizeDisplayText(chat?.name || ''),
          subtitle: sanitizeDisplayText(chat?.subtitle || ''),
          status: sanitizeDisplayText(chat?.status || ''),
          phone: getBestChatPhone(chat),
          lastMessage: sanitizeDisplayText(chat?.lastMessage || ''),
          labels: normalizeChatLabels(chat.labels),
          profilePicUrl: normalizeProfilePhotoUrl(chat?.profilePicUrl),
          isMyContact: chat?.isMyContact === true,
          archived: Boolean(chat?.archived)
        }))
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
      const hydrated = {
        ...chat,
        name: sanitizeDisplayText(chat?.name || ''),
        subtitle: sanitizeDisplayText(chat?.subtitle || ''),
        status: sanitizeDisplayText(chat?.status || ''),
        phone: getBestChatPhone(chat),
        lastMessage: sanitizeDisplayText(chat?.lastMessage || ''),
        labels: normalizeChatLabels(chat.labels),
        profilePicUrl: normalizeProfilePhotoUrl(chat?.profilePicUrl),
        isMyContact: chat?.isMyContact === true,
        archived: Boolean(chat?.archived)
      };

      if (!chatMatchesQuery(hydrated, chatSearchRef.current) || !chatMatchesFilters(hydrated, chatFiltersRef.current)) {
        setChats((prev) => prev.filter((c) => chatIdentityKey(c) !== chatIdentityKey(hydrated) && c.id !== hydrated.id));
        return;
      }

      setChats((prev) => upsertAndSortChat(prev, hydrated));
    });

    socket.on('chat_opened', ({ chatId, phone }) => {
      if (!chatId) {
        requestChatsPage({ reset: true });
        return;
      }

      const normalizedPhone = normalizeDigits(phone || '');
      let targetChatId = chatId;

      if (normalizedPhone) {
        const existing = chatsRef.current.find((c) => normalizeDigits(c?.phone || '') === normalizedPhone || chatIdentityKey(c) === ('phone:' + normalizedPhone));
        if (existing?.id) targetChatId = existing.id;
      }

      if (targetChatId !== chatId) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
      }

      handleChatSelect(targetChatId, { clearSearch: true });
    });

    socket.on('start_new_chat_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('chat_labels_updated', ({ chatId, labels }) => {
      setChats((prev) => {
        const next = prev.map((chat) => chat.id === chatId ? { ...chat, labels: normalizeChatLabels(labels) } : chat);
        return next.filter((chat) => chatMatchesQuery(chat, chatSearchRef.current) && chatMatchesFilters(chat, chatFiltersRef.current));
      });
      if (chatId === activeChatIdRef.current) socket.emit('get_contact_info', chatId);
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

      const sanitizedMessages = Array.isArray(data.messages)
        ? data.messages.map((m) => ({
          ...m,
          body: repairMojibake(m?.body || ''),
          location: normalizeMessageLocation(m?.location),
          filename: normalizeMessageFilename(m?.filename),
          fileSizeBytes: Number.isFinite(Number(m?.fileSizeBytes)) ? Number(m.fileSizeBytes) : null,
          ack: Number.isFinite(Number(m?.ack)) ? Number(m.ack) : 0,
          edited: Boolean(m?.edited),

          editedAt: Number(m?.editedAt || 0) || null,
          canEdit: Boolean(m?.canEdit),
          quotedMessage: normalizeQuotedMessage(m?.quotedMessage)
        }))
        : [];
      setMessages(sanitizedMessages);
    });

    socket.on('chat_media', ({ chatId, messageId, mediaData, mimetype, filename, fileSizeBytes }) => {
      const active = String(activeChatIdRef.current || '');
      const incoming = String(chatId || '');
      if (incoming !== active) {
        const incomingDigits = normalizeDigits(incoming.split('@')[0] || '');
        const activeDigits = normalizeDigits(active.split('@')[0] || '');
        const sameByDigits = incomingDigits && activeDigits && (
          incomingDigits === activeDigits || incomingDigits.endsWith(activeDigits) || activeDigits.endsWith(incomingDigits)
        );
        if (!sameByDigits) return;
      }
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
        const existing = prev.find((c) => c.id === contactId || (contactPhone && getBestChatPhone(c) === contactPhone));
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
      const relatedChatId = msg.fromMe ? msg.to : msg.from;
      if (!isVisibleChatId(relatedChatId)) return;

      if (!msg.fromMe && Notification.permission === 'granted') {
        new Notification(msg.notifyName || 'Nuevo mensaje', {
          body: getMessagePreviewText(msg),
          icon: '/favicon.ico'
        });
      }

      if (!msg.fromMe && relatedChatId !== activeChatIdRef.current) {
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

        const incomingIdentity = chatIdentityKey({ id: relatedChatId, phone: fallbackDigits, subtitle: fallbackName });
        const existing = prev.find((c) => c.id === relatedChatId || chatIdentityKey(c) === incomingIdentity);
        const canonicalId = existing?.id || relatedChatId;
        const nextChat = {
          ...(existing || { id: canonicalId, name: safeName, phone: isLikelyPhoneDigits(fallbackDigits) ? fallbackDigits : null, subtitle: null, labels: [] }),
          id: canonicalId,
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
          unreadCount: msg.fromMe ? (existing?.unreadCount || 0) : (canonicalId === activeChatIdRef.current ? 0 : (existing?.unreadCount || 0) + 1),
        };

        if (!chatMatchesQuery(nextChat, chatSearchRef.current) || !chatMatchesFilters(nextChat, chatFiltersRef.current)) {
          return prev.filter((c) => c.id !== canonicalId && chatIdentityKey(c) !== incomingIdentity);
        }
        return upsertAndSortChat(prev, nextChat);
      });

      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;

        const activeId = String(activeChatIdRef.current || '');
        const incomingChatId = String((msg.fromMe ? msg.to : msg.from) || '');
        const activeIdDigits = normalizeDigits(activeId.split('@')[0] || '');
        const incomingDigits = normalizeDigits(incomingChatId.split('@')[0] || '');
        const activeChat = chatsRef.current.find((c) => c.id === activeId);
        const activePhoneDigits = normalizeDigits(activeChat?.phone || '');

        const sameById = incomingChatId === activeId;
        const sameByIdDigits = activeIdDigits && incomingDigits && (
          activeIdDigits === incomingDigits
          || activeIdDigits.endsWith(incomingDigits)
          || incomingDigits.endsWith(activeIdDigits)
        );
        const sameByPhone = activePhoneDigits && incomingDigits && (
          activePhoneDigits === incomingDigits
          || activePhoneDigits.endsWith(incomingDigits)
          || incomingDigits.endsWith(activePhoneDigits)
        );

        const shouldAdd = sameById || sameByIdDigits || sameByPhone;
        if (!shouldAdd) return prev;
        return [...prev, {
          ...msg,
          body: repairMojibake(msg?.body || ''),
          location: normalizeMessageLocation(msg?.location),
          filename: normalizeMessageFilename(msg?.filename),
          fileSizeBytes: Number.isFinite(Number(msg?.fileSizeBytes)) ? Number(msg.fileSizeBytes) : null,
          canEdit: Boolean(msg?.canEdit),
          quotedMessage: normalizeQuotedMessage(msg?.quotedMessage)
        }];
      });
    });

    socket.on('business_data', (data) => {
      const normalized = normalizeBusinessDataPayload(data);
      setBusinessData(normalized);
      setLabelDefinitions(normalizeChatLabels(normalized.labels));
    });

    socket.on('business_data_catalog', (catalog) => {
      const normalizedCatalog = Array.isArray(catalog) ? catalog.map((item, idx) => normalizeCatalogItem(item, idx)) : [];
      const normalizedCategories = Array.from(new Set(
        normalizedCatalog
          .flatMap((item) => (Array.isArray(item?.categories) ? item.categories : []))
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      setBusinessData(prev => ({
        ...prev,
        catalog: normalizedCatalog,
        catalogMeta: {
          ...(prev?.catalogMeta || { source: 'local', nativeAvailable: false }),
          categories: normalizedCategories
        }
      }));
    });
    socket.on('quick_replies', (payload) => {
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const normalized = items
        .map((item, idx) => ({
          id: String(item?.id || ('qr_' + (idx + 1))),
          label: sanitizeDisplayText(item?.label || 'Respuesta rapida'),
          text: repairMojibake(item?.text || '')
        }))
        .filter((item) => item.id && item.text);
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


    socket.on('message_ack', ({ id, ack, chatId, canEdit }) => {
      setMessages(prev => prev.map((m) => (
        m.id === id
          ? { ...m, ack, canEdit: typeof canEdit === 'boolean' ? canEdit : m.canEdit }
          : m
      )));
      const ackChatId = String(chatId || '');
      const ackDigits = normalizeDigits(ackChatId.split('@')[0] || '');
      setChats(prev => prev.map((c) => {
        const chatDigits = normalizeDigits(c?.phone || c?.id || '');
        const sameChat = c.id === ackChatId || (ackDigits && chatDigits && (chatDigits === ackDigits || chatDigits.endsWith(ackDigits) || ackDigits.endsWith(chatDigits)));
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
      alert('Sesion de WhatsApp cerrada. Escanea nuevamente el QR.');
    });

    if (socket.connected) {
      setIsConnected(true);
      const mode = selectedTransportRef.current;
      setIsSwitchingTransport(true);
      socket.emit('set_transport_mode', { mode: mode || 'idle' });
      socket.emit('get_wa_capabilities');
    }

    return () => {
      ['connect', 'connect_error', 'tenant_context', 'disconnect', 'qr', 'ready', 'my_profile', 'wa_capabilities', 'wa_runtime', 'transport_mode_set', 'transport_mode_error', 'chats', 'chat_updated', 'chat_history', 'chat_media',
        'chat_opened', 'start_new_chat_error', 'chat_labels_updated', 'chat_labels_error', 'chat_labels_saved',
        'contact_info', 'message', 'business_data', 'error', 'business_data_catalog', 'quick_replies', 'quick_reply_error',
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

  const handleSaasLogin = async (event) => {
    event?.preventDefault();
    const email = String(loginEmail || '').trim().toLowerCase();
    const password = String(loginPassword || '');
    const tenantId = String(loginTenantId || '').trim();

    if (!email || !password) {
      setSaasAuthError('Ingresa correo y contrasena para continuar.');
      return;
    }

    setSaasAuthBusy(true);
    setSaasAuthError('');

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: buildApiHeaders({ includeJson: true, tenantIdOverride: tenantId }),
        body: JSON.stringify({ email, password, tenantId: tenantId || undefined })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || 'No se pudo iniciar sesion.'));
      }

      const session = normalizeSaasSessionPayload(payload, null);
      if (!session) throw new Error('Respuesta de autenticacion invalida.');
      if (payload?.user && typeof payload.user === 'object') {
        session.user = payload.user;
      }
      setSaasSession(session);
      setLoginPassword('');
      setLoginEmail(String(payload?.user?.email || email));
      if (payload?.user?.tenantId) setLoginTenantId(String(payload.user.tenantId));
    } catch (error) {
      setSaasAuthError(String(error?.message || 'No se pudo iniciar sesion.'));
    } finally {
      setSaasAuthBusy(false);
    }
  };

  const handleSaasLogout = async () => {
    if (!window.confirm('Cerrar sesion SaaS de esta empresa?')) return;
    const current = saasSessionRef.current;
    try {
      if (current?.accessToken || current?.refreshToken) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: buildApiHeaders({ includeJson: true, tokenOverride: String(current?.accessToken || '') }),
          body: JSON.stringify({
            accessToken: String(current?.accessToken || ''),
            refreshToken: String(current?.refreshToken || '')
          })
        });
      }
    } catch (_error) {
      // best effort
    }
    setSaasSession(null);
    setSaasAuthError('');
    if (socket.connected) socket.disconnect();
    setIsConnected(false);
    resetWorkspaceState();
  };

  const handleChatSelect = (chatId, options = {}) => {
    if (!chatId) return;
    const clearSearch = Boolean(options?.clearSearch);
    if (clearSearch && chatSearchRef.current) {
      chatSearchRef.current = '';
      setChatSearchQuery('');
      requestChatsPage({ reset: true });
    }

    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
    shouldInstantScrollRef.current = true;
    suppressSmoothScrollUntilRef.current = Date.now() + 2200;
    prevMessagesMetaRef.current = { count: 0, lastId: '' };
    setMessages([]);
    setEditingMessage(null);
    setReplyingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    socket.emit('get_chat_history', chatId);
    socket.emit('mark_chat_read', chatId);
    socket.emit('get_contact_info', chatId);
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c));
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

    if (!text && !attachment) return;

    // Command: /ayudar
    if (text === '/ayudar') {
      requestAiSuggestion();
      setInputText('');
      return;
    }

    const quotedMessageId = String(replyingMessage?.id || '').trim() || null;

    if (attachment) {
      socket.emit('send_media_message', {
        to: activeChatId,
        body: inputText,
        mediaData: attachment.data,
        mimetype: attachment.mimetype,
        filename: attachment.filename,
        quotedMessageId
      });
      removeAttachment();
    } else {
      socket.emit('send_message', { to: activeChatId, body: inputText, quotedMessageId });
    }
    setInputText('');
    setReplyingMessage(null);
  };

  const handleLogoutWhatsapp = () => {
    if (!window.confirm('Cerrar sesion de WhatsApp en este equipo?')) return;
    socket.emit('logout_whatsapp');
  };

  const handleSelectTransport = (mode) => {
    const safeMode = String(mode || '').trim().toLowerCase();
    if (safeMode !== 'webjs' && safeMode !== 'cloud') return;

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
    setIsSwitchingTransport(false);
    setIsClientReady(false);
    setQrCode('');
    setWaRuntime({ requestedTransport: 'idle', activeTransport: 'idle', cloudConfigured: false, cloudReady: false, availableTransports: ['webjs', 'cloud'] });
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
    const name = window.prompt('Nombre de etiqueta para WhatsApp Business:');
    if (!name?.trim()) return;
    socket.emit('create_label', { name: name.trim() });
  };

  const handleOpenCompanyProfile = () => {
    setOpenCompanyProfileToken((prev) => prev + 1);
  };

  const handleToggleChatLabel = (chatId, labelId) => {
    if (!chatId || labelId === undefined || labelId === null || labelId === '') return;
    const chat = chats.find((c) => c.id === chatId);
    const current = Array.isArray(chat?.labels) ? chat.labels : [];

    const idStr = String(labelId);
    const has = current.some((l) => String(l.id) === idStr);
    const nextIds = has
      ? current.filter((l) => String(l.id) !== idStr).map((l) => l.id).filter(Boolean)
      : [...current.map((l) => l.id).filter(Boolean), labelId];

    socket.emit('set_chat_labels', { chatId, labelIds: nextIds });
  };

  const handleStartNewChat = (phoneArg, firstMessageArg = '') => {
    const phone = phoneArg || window.prompt('Numero del cliente (con codigo de pais, sin +):');
    if (!phone) return;
    const normalizedPhone = normalizeDigits(phone);
    if (!normalizedPhone) return;
    const firstMessage = typeof firstMessageArg === 'string' ? firstMessageArg : (window.prompt('Mensaje inicial (opcional):') || '');

    const candidates = chatsRef.current
      .filter((c) => {
        const chatPhone = normalizeDigits(c?.phone || c?.id || '');
        if (!chatPhone) return false;
        return chatPhone === normalizedPhone || chatPhone.endsWith(normalizedPhone) || normalizedPhone.endsWith(chatPhone);
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (candidates.length > 0) {
      const best = candidates[0];
      if (best?.id) {
        handleChatSelect(best.id, { clearSearch: true });
        if (firstMessage?.trim()) {
          socket.emit('send_message', { to: best.id, body: firstMessage.trim() });
        }
        return;
      }
    }

    socket.emit('start_new_chat', { phone: normalizedPhone, firstMessage });
  };


  const handleEditMessage = (messageId, currentBody) => {
    if (!waCapabilities.messageEdit) {
      alert('La edicion de mensajes no esta disponible en esta sesion de WhatsApp.');
      return;
    }
    removeAttachment();
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

  const handleCreateQuickReply = ({ label, text }) => {
    if (!waCapabilities.quickRepliesWrite) return;
    socket.emit('add_quick_reply', { label, text });
  };

  const handleUpdateQuickReply = ({ id, label, text }) => {

    if (!waCapabilities.quickRepliesWrite) return;
    socket.emit('update_quick_reply', { id, label, text });
  };

  const handleDeleteQuickReply = (id) => {

    if (!waCapabilities.quickRepliesWrite) return;
    socket.emit('delete_quick_reply', { id });
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

    const businessContext = `
Eres un asistente de ventas experto en Lavitat Peru. Ayuda al vendedor a responder con precision tecnica, enfoque comercial y cierres claros.

PERFIL DEL NEGOCIO:
${businessData.profile?.name || 'Negocio'}
${businessData.profile?.description || ''}
${businessData.profile?.address ? 'Direccion: ' + businessData.profile.address : ''}

CATALOGO DE PRODUCTOS:
${businessData.catalog.length > 0
        ? businessData.catalog.map((p, idx) => `${idx + 1}. ${p.title} | Precio: S/ ${p.price || 'consultar'}${p.description ? ` | ${p.description}` : ''}`).join('\n')
        : '(sin productos registrados)'
      }

INSTRUCCION: ${customPrompt || 'Basandote en la conversacion reciente, genera la respuesta mas adecuada, profesional y persuasiva que el vendedor deberia enviar.'}

REGLA CRITICA:
- NO INVENTES PRODUCTOS, tamanos o precios.
- Usa solamente productos presentes en el catalogo listado arriba.
- Si no existe el dato exacto, responde: "Te confirmo ese detalle en un momento".
    `.trim();

    const recentMessages = messages.slice(-12)
      .map(m => `${m.fromMe ? 'VENDEDOR' : 'CLIENTE'}: ${m.body}`)
      .join('\n');

    socket.emit('request_ai_suggestion', {
      contextText: recentMessages,
      businessContext,
      customPrompt: customPrompt || aiPrompt,
    });
  };
  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result.split(',')[1];
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
  const selectedModeLabel = selectedTransport === 'cloud' ? 'WhatsApp Cloud API' : 'WhatsApp Web.js';
  const saasAuthEnabled = Boolean(saasRuntime?.authEnabled);
  const isSaasAuthenticated = !saasAuthEnabled || Boolean(saasSession?.accessToken);
  const loginTenantOptions = Array.isArray(saasRuntime?.tenants) ? saasRuntime.tenants : [];

  if (!saasRuntime?.loaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111b21', gap: '20px' }}>
        <div className='loader' />
        <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>Inicializando plataforma SaaS...</p>
      </div>
    );
  }

  if (saasAuthEnabled && !isSaasAuthenticated) {
    return (
      <div className='login-screen'>
        <form onSubmit={handleSaasLogin} style={{ width: '100%', maxWidth: '460px', background: '#1f2c33', border: '1px solid rgba(134,150,160,0.28)', borderRadius: '16px', padding: '24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 500, color: '#e9edef', marginBottom: '6px' }}>Acceso de empresa</div>
            <p style={{ color: '#9eb2bf', fontSize: '0.86rem', margin: 0 }}>Inicia sesion para continuar con tu tenant SaaS.</p>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#9eb2bf', fontSize: '0.78rem' }}>
            Correo
            <input
              type='email'
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              autoComplete='username'
              style={{ borderRadius: '10px', border: '1px solid rgba(134,150,160,0.25)', background: '#101a21', color: '#e9edef', padding: '10px 12px', outline: 'none' }}
              placeholder='usuario@empresa.com'
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#9eb2bf', fontSize: '0.78rem' }}>
            Contrasena
            <input
              type='password'
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete='current-password'
              style={{ borderRadius: '10px', border: '1px solid rgba(134,150,160,0.25)', background: '#101a21', color: '#e9edef', padding: '10px 12px', outline: 'none' }}
              placeholder='********'
            />
          </label>

          {loginTenantOptions.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#9eb2bf', fontSize: '0.78rem' }}>
              Empresa
              <select
                value={loginTenantId}
                onChange={(e) => setLoginTenantId(e.target.value)}
                style={{ borderRadius: '10px', border: '1px solid rgba(134,150,160,0.25)', background: '#101a21', color: '#e9edef', padding: '10px 12px', outline: 'none' }}
              >
                <option value=''>Seleccionar empresa</option>
                {loginTenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.id}</option>
                ))}
              </select>
            </label>
          )}

          {saasAuthError && (
            <div style={{ borderRadius: '10px', border: '1px solid rgba(255,113,113,0.35)', background: 'rgba(255,113,113,0.08)', color: '#ffd1d1', padding: '8px 10px', fontSize: '0.8rem' }}>
              {saasAuthError}
            </div>
          )}

          <button
            type='submit'
            disabled={saasAuthBusy}
            style={{ marginTop: '4px', border: 'none', borderRadius: '10px', background: '#00a884', color: '#fff', padding: '10px 12px', fontWeight: 700, cursor: saasAuthBusy ? 'not-allowed' : 'pointer', opacity: saasAuthBusy ? 0.7 : 1 }}
          >
            {saasAuthBusy ? 'Ingresando...' : 'Iniciar sesion'}
          </button>
        </form>
      </div>
    );
  }


  // --------------------------------------------------------------
  // Render: Reconnecting
  // --------------------------------------------------------------
  if (!isConnected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111b21', gap: '20px' }}>
        <div className="loader" />
        <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>Conectando con el servidor...</p>
      </div>
    );
  }

  // --------------------------------------------------------------
  // Render: Transport Selector
  // --------------------------------------------------------------
  if (!selectedTransport) {
    return (
      <div className="login-screen">
        <div style={{ width: '100%', maxWidth: '700px', background: '#1f2c33', border: '1px solid rgba(134,150,160,0.28)', borderRadius: '16px', padding: '26px', boxSizing: 'border-box' }}>
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 300, color: '#e9edef', marginBottom: '8px' }}>Modo de conexion</div>
            <p style={{ color: '#9eb2bf', fontSize: '0.9rem' }}>Selecciona como quieres operar WhatsApp en esta sesion.</p>
            {saasAuthEnabled && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ color: '#8ca3b3', fontSize: '0.78rem' }}>
                  Tenant: <strong style={{ color: '#d3e6f3' }}>{saasSession?.user?.tenantId || saasRuntime?.tenant?.id || 'default'}</strong>
                </span>
                <button
                  type='button'
                  onClick={handleSaasLogout}
                  style={{ background: 'transparent', border: '1px solid rgba(255,113,113,0.45)', color: '#ffd1d1', borderRadius: '999px', padding: '4px 10px', fontSize: '0.74rem', cursor: 'pointer' }}
                >
                  Cerrar sesion SaaS
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
            <button
              type="button"
              onClick={() => handleSelectTransport('webjs')}
              style={{ textAlign: 'left', padding: '16px', borderRadius: '12px', border: '1px solid rgba(0,168,132,0.45)', background: '#0f191f', color: '#e9edef', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>WhatsApp Web.js</div>
              <div style={{ fontSize: '0.82rem', color: '#9eb2bf', lineHeight: 1.5 }}>Ideal para mantener todas las funciones existentes con QR y sincronia del celular.</div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTransport('cloud')}
              style={{ textAlign: 'left', padding: '16px', borderRadius: '12px', border: cloudConfigured ? '1px solid rgba(124,200,255,0.45)' : '1px solid rgba(255,170,0,0.45)', background: '#0f191f', color: '#e9edef', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>WhatsApp Cloud API</div>
              <div style={{ fontSize: '0.82rem', color: '#9eb2bf', lineHeight: 1.5 }}>Escalable y estable para produccion. {cloudConfigured ? 'Configurada en backend.' : 'Faltan variables META_* en backend/.env.'}</div>
            </button>
          </div>

          {transportError && (
            <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,113,113,0.4)', background: 'rgba(255,113,113,0.08)', color: '#ffd1d1', fontSize: '0.82rem' }}>
              {transportError}
            </div>
          )}

          {activeTransport !== 'idle' && (
            <div style={{ marginTop: '12px', fontSize: '0.78rem', color: '#8ca3b3' }}>
              Transporte activo en backend: <strong style={{ color: '#d3e6f3' }}>{activeTransport}</strong>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------
  // Render: Transport Bootstrap
  // --------------------------------------------------------------
  if (!isClientReady) {
    const isCloudMode = selectedTransport === 'cloud';
    const showCloudConfigError = isCloudMode && activeTransport === 'cloud' && !cloudConfigured;

    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', maxWidth: '520px', width: '100%' }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 300, color: '#e9edef', marginBottom: '10px' }}>WhatsApp Business Pro</div>
            <p style={{ color: '#9eb2bf', fontSize: '0.9rem' }}>Conectando con <strong style={{ color: '#e9edef' }}>{selectedModeLabel}</strong>.</p>
          </div>

          {isSwitchingTransport && (
            <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(124,200,255,0.35)', background: 'rgba(124,200,255,0.08)', color: '#cdeaff', fontSize: '0.82rem' }}>
              Cambiando transporte...
            </div>
          )}

          {isCloudMode ? (
            showCloudConfigError ? (
              <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,170,0,0.4)', background: 'rgba(255,170,0,0.08)', color: '#ffe1a3', textAlign: 'left', fontSize: '0.83rem', lineHeight: 1.6 }}>
                Falta configurar Cloud API en backend/.env.<br />
                Variables minimas: <strong>META_APP_ID</strong>, <strong>META_SYSTEM_USER_TOKEN</strong>, <strong>META_WABA_PHONE_NUMBER_ID</strong>.
              </div>
            ) : (
              <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid rgba(124,200,255,0.35)', background: '#202c33' }}>
                <div className="loader" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: '#9eb2bf', fontSize: '0.86rem', margin: 0 }}>Esperando inicializacion de Cloud API...</p>
              </div>
            )
          ) : (
            <>
              <div style={{ background: 'white', padding: '24px', borderRadius: '16px', display: 'inline-block', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
                {qrCode
                  ? <QRCodeSVG value={qrCode} size={260} level="H" includeMargin={true} className="fade-in" />
                  : <div style={{ width: '260px', height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loader" /></div>
                }
              </div>
              <div style={{ marginTop: '20px', padding: '20px', background: '#202c33', borderRadius: '12px', textAlign: 'left' }}>
                <p style={{ color: '#8696a0', fontSize: '0.85rem', lineHeight: '1.8' }}>
                  1. Abre <strong style={{ color: '#e9edef' }}>WhatsApp</strong> en tu telefono<br />
                  2. Toca <strong style={{ color: '#e9edef' }}>Menu (...)</strong> o <strong style={{ color: '#e9edef' }}>Configuracion</strong><br />
                  3. Selecciona <strong style={{ color: '#e9edef' }}>Dispositivos vinculados</strong><br />
                  4. Toca <strong style={{ color: '#e9edef' }}>Vincular un dispositivo</strong> y escanea
                </p>
              </div>
            </>
          )}

          {transportError && (
            <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,113,113,0.4)', background: 'rgba(255,113,113,0.08)', color: '#ffd1d1', fontSize: '0.82rem' }}>
              {transportError}
            </div>
          )}

          <button
            type="button"
            onClick={handleResetTransportSelection}
            style={{ marginTop: '16px', background: 'transparent', border: '1px solid rgba(134,150,160,0.4)', color: '#c9d5de', borderRadius: '999px', padding: '7px 16px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Cambiar modo
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------
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

  return (
    <div className="app-container">
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
              onEditMessage={handleEditMessage}
              onReplyMessage={waCapabilities.messageReply ? handleReplyMessage : null}
              onForwardMessage={waCapabilities.messageForward ? handleForwardMessage : null}
              onDeleteMessage={waCapabilities.messageDelete ? handleDeleteMessage : null}
              forwardChatOptions={forwardChatOptions}
              onLoadOrderToCart={handleLoadOrderToCart}
              onStartNewChat={handleStartNewChat}
              onCancelEditMessage={handleCancelEditMessage}
              onCancelReplyMessage={handleCancelReplyMessage}
              editingMessage={editingMessage}
              replyingMessage={replyingMessage}
              buildApiHeaders={buildApiHeaders}
              canEditMessages={waCapabilities.messageEdit}
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
            socket={socket}
            myProfile={myProfile || businessData?.profile}
            onLogout={handleLogoutWhatsapp}
            quickReplies={quickReplies}
            onCreateQuickReply={handleCreateQuickReply}
            onUpdateQuickReply={handleUpdateQuickReply}
            onDeleteQuickReply={handleDeleteQuickReply}
            pendingOrderCartLoad={pendingOrderCartLoad}
            waCapabilities={waCapabilities}
            openCompanyProfileToken={openCompanyProfileToken}
          />
        )}
      </div>
    </div>
  );
}

export default App;
