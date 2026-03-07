import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

import Sidebar from './components/Sidebar';
import BusinessSidebar, { ClientProfilePanel } from './components/BusinessSidebar';
import ChatWindow from './components/ChatWindow';

import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SOCKET_AUTH_TOKEN = import.meta.env.VITE_SOCKET_AUTH_TOKEN || '';

export const socket = io(API_URL, {
  auth: SOCKET_AUTH_TOKEN ? { token: SOCKET_AUTH_TOKEN } : undefined
});

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

const getMessagePreviewText = (msg = {}) => {
  const type = String(msg?.type || '').toLowerCase();
  const location = normalizeMessageLocation(msg?.location);

  if (type === 'location') {
    if (location?.label) return `📍 ${location.label}`;
    if (location?.text) return `📍 ${location.text}`;
    return '📍 Ubicacion';
  }

  const body = sanitizeDisplayText(msg?.body || '');
  if (body) {
    const looksLikeMaps = /https?:\/\/(?:www\.)?(?:google\.[^\s/]+\/maps|maps\.app\.goo\.gl|maps\.google\.com)|geo:/i.test(body);
    if (looksLikeMaps) return '📍 Ubicacion';
    return body;
  }

  const fallbackByType = {
    image: 'Imagen',
    video: 'Video',
    audio: 'Audio',
    ptt: 'Nota de voz',
    document: 'Documento',
    sticker: 'Sticker',
    location: '📍 Ubicacion',
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

function App() {
  // --------------------------------------------------------------
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [isClientReady, setIsClientReady] = useState(false);

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

  const [waCapabilities, setWaCapabilities] = useState({ messageEdit: true, messageEditSync: true, quickReplies: false, quickRepliesRead: false, quickRepliesWrite: false });
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

  // --------------------------------------------------------------
  // Notifications
  // --------------------------------------------------------------
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    try {
      const savedDefs = JSON.parse(localStorage.getItem('wa_custom_label_defs') || '[]');
      if (Array.isArray(savedDefs)) setLabelDefinitions(savedDefs);
    } catch (e) {
      console.warn('No se pudieron leer etiquetas locales', e.message);
    }
  }, []);

  // --------------------------------------------------------------
  // Auto-scroll
  // --------------------------------------------------------------
  useLayoutEffect(() => {
    if (!messagesEndRef.current) return;
    const behavior = shouldInstantScrollRef.current ? 'auto' : 'smooth';
    messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    if (shouldInstantScrollRef.current) shouldInstantScrollRef.current = false;
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
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => {
      setIsConnected(false);
      chatPagingRef.current.loading = false;
      setIsLoadingMoreChats(false);
    });

    socket.on('qr', (qr) => { setQrCode(qr); setIsClientReady(false); });

    socket.on('ready', () => {
      setIsClientReady(true);
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
          ack: Number.isFinite(Number(m?.ack)) ? Number(m.ack) : 0,
          edited: Boolean(m?.edited),

          editedAt: Number(m?.editedAt || 0) || null,
          canEdit: Boolean(m?.canEdit)
        }))
        : [];
      setMessages(sanitizedMessages);
    });

    socket.on('chat_media', ({ chatId, messageId, mediaData, mimetype }) => {
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
      setMessages((prev) => prev.map((m) => (
        m.id === messageId ? { ...m, mediaData, mimetype: mimetype || m.mimetype } : m
      )));
    });

    socket.on('contact_info', (contact) => {
      const normalizedContact = {
        ...contact,
        name: sanitizeDisplayText(contact?.name || ''),
        pushname: sanitizeDisplayText(contact?.pushname || ''),
        shortName: sanitizeDisplayText(contact?.shortName || ''),
        profilePicUrl: normalizeProfilePhotoUrl(contact?.profilePicUrl),
        status: repairMojibake(contact?.status || '')
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
          profilePicUrl: normalizedContact.profilePicUrl || existing?.profilePicUrl || null
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
        return [...prev, { ...msg, body: repairMojibake(msg?.body || ''), location: normalizeMessageLocation(msg?.location), canEdit: Boolean(msg?.canEdit) }];
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
      setActiveChatId(null);
      alert('Sesion de WhatsApp cerrada. Escanea nuevamente el QR.');
    });

    return () => {
      ['connect', 'disconnect', 'qr', 'ready', 'my_profile', 'wa_capabilities', 'chats', 'chat_updated', 'chat_history', 'chat_media',
        'chat_opened', 'start_new_chat_error', 'chat_labels_updated', 'chat_labels_error', 'chat_labels_saved',
        'contact_info', 'message', 'business_data', 'business_data_catalog', 'quick_replies', 'quick_reply_error',
        'ai_suggestion_chunk',

        'ai_suggestion_complete', 'ai_error', 'message_ack', 'message_editability', 'message_edited', 'edit_message_error', 'authenticated', 'auth_failure', 'disconnected', 'logout_done'
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
    setMessages([]);
    setEditingMessage(null);
    setShowClientProfile(false);
    setClientContact(null);
    socket.emit('get_chat_history', chatId);
    socket.emit('mark_chat_read', chatId);
    socket.emit('get_contact_info', chatId);
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c));
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

    if (attachment) {
      socket.emit('send_media_message', {
        to: activeChatId,
        body: inputText,
        mediaData: attachment.data,
        mimetype: attachment.mimetype,
        filename: attachment.filename,
      });
      removeAttachment();
    } else {
      socket.emit('send_message', { to: activeChatId, body: inputText });
    }
    setInputText('');
  };

  const handleLogoutWhatsapp = () => {
    if (!window.confirm('Cerrar sesion de WhatsApp en este equipo?')) return;
    socket.emit('logout_whatsapp');
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
    setEditingMessage({ id: cleanId, originalBody: body });
    setInputText(body);
  };

  const handleCancelEditMessage = () => {
    setEditingMessage(null);
    setInputText('');
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
  // Render: QR Screen
  // --------------------------------------------------------------
  if (!isClientReady) {
    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ marginBottom: '30px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 300, color: '#e9edef', marginBottom: '10px' }}>WhatsApp Business Pro</div>
            <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>Escanea el codigo QR con tu telefono para comenzar</p>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '16px', display: 'inline-block', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
            {qrCode
              ? <QRCodeSVG value={qrCode} size={260} level="H" includeMargin={true} className="fade-in" />
              : <div style={{ width: '260px', height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loader" /></div>
            }
          </div>
          <div style={{ marginTop: '30px', padding: '20px', background: '#202c33', borderRadius: '12px', textAlign: 'left' }}>
            <p style={{ color: '#8696a0', fontSize: '0.85rem', lineHeight: '1.8' }}>
              1. Abre <strong style={{ color: '#e9edef' }}>WhatsApp</strong> en tu telefono<br />
              2. Toca <strong style={{ color: '#e9edef' }}>Menu (...)</strong> o <strong style={{ color: '#e9edef' }}>Configuracion</strong><br />
              3. Selecciona <strong style={{ color: '#e9edef' }}>Dispositivos vinculados</strong><br />
              4. Toca <strong style={{ color: '#e9edef' }}>Vincular un dispositivo</strong> y escanea
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------
  // Render: Main App
  // --------------------------------------------------------------
  const activeChatDetails = chats.find(c => c.id === activeChatId) || null;

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
              onLoadOrderToCart={handleLoadOrderToCart}
              onCancelEditMessage={handleCancelEditMessage}
              editingMessage={editingMessage}
              canEditMessages={waCapabilities.messageEdit}
            />

            {/* Client Profile Panel (slides in from right) */}
            {showClientProfile && (
              <ClientProfilePanel
                contact={{ ...activeChatDetails, ...clientContact }}
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
        <BusinessSidebar
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
      </div>
    </div>
  );
}

export default App;

