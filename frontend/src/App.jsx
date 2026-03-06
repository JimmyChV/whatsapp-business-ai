import { useState, useEffect, useRef } from 'react';
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
  const rawPrice = safeItem.price ?? safeItem.regular_price ?? safeItem.sale_price ?? safeItem.amount ?? safeItem.precio ?? 0;
  const parsedPrice = Number.parseFloat(String(rawPrice).replace(',', '.'));

  return {
    id: safeItem.id || safeItem.product_id || `catalog_${index}`,
    title: String(rawTitle || `Producto ${index + 1}`).trim(),
    price: Number.isFinite(parsedPrice) ? parsedPrice.toFixed(2) : '0.00',
    description: safeItem.description || safeItem.short_description || safeItem.descripcion || '',
    imageUrl: safeItem.imageUrl || safeItem.image || safeItem.image_url || safeItem.images?.[0]?.src || null,
    source: safeItem.source || 'unknown',
    sku: safeItem.sku || null,
    stockStatus: safeItem.stockStatus || safeItem.stock_status || null
  };
};

const normalizeBusinessDataPayload = (data = {}) => {
  const rawCatalog = Array.isArray(data.catalog) ? data.catalog : [];
  const catalog = rawCatalog.map((item, idx) => normalizeCatalogItem(item, idx));
  return {
    profile: data.profile || null,
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
  // ─── Connection State ────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [isClientReady, setIsClientReady] = useState(false);

  // ─── Chat State ──────────────────────────────────────────────
  const [chats, setChats] = useState([]);
  const [chatsTotal, setChatsTotal] = useState(0);
  const [chatsHasMore, setChatsHasMore] = useState(true);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');

  // ─── My Profile (the logged-in WA Business Account) ─────────
  const [myProfile, setMyProfile] = useState(null);

  // ─── Client Profile Panel ───────────────────────────────────
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [clientContact, setClientContact] = useState(null);

  // ─── Media State ─────────────────────────────────────────────
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const fileInputRef = useRef(null);

  // ─── AI State ────────────────────────────────────────────────
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isCopilotMode, setIsCopilotMode] = useState(false);

  // ─── Voice Note State ────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const recordingStartRef = useRef(0);

  // ─── Business Data (Real from WA) ────────────────────────────
  const [businessData, setBusinessData] = useState({ profile: null, labels: [], catalog: [], catalogMeta: { source: 'local', nativeAvailable: false } });
  const [labelDefinitions, setLabelDefinitions] = useState([]);
  const [toasts, setToasts] = useState([]);

  // ─── Other ───────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const chatsRef = useRef([]);
  const chatSearchRef = useRef('');
  const chatPagingRef = useRef({ offset: 0, hasMore: true, loading: false });

  // ──────────────────────────────────────────────────────────────
  // Notifications
  // ──────────────────────────────────────────────────────────────
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

  // ──────────────────────────────────────────────────────────────
  // Auto-scroll
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (!isClientReady) return;
    const timer = setTimeout(() => {
      requestChatsPage({ reset: true });
    }, 180);
    return () => clearTimeout(timer);
  }, [chatSearchQuery, isClientReady]);

  // ──────────────────────────────────────────────────────────────
  const requestChatsPage = ({ reset = false } = {}) => {
    if (chatPagingRef.current.loading && !reset) return;
    if (!reset && !chatPagingRef.current.hasMore) return;

    const offset = reset ? 0 : chatPagingRef.current.offset;
    const query = chatSearchRef.current;
    chatPagingRef.current.loading = true;
    if (reset) {
      chatPagingRef.current.offset = 0;
      chatPagingRef.current.hasMore = true;
      setChatsHasMore(true);
      setChatsTotal(0);
    }
    setIsLoadingMoreChats(true);
    socket.emit('get_chats', { offset, limit: CHAT_PAGE_SIZE, reset, query });
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
    });

    socket.on('my_profile', (profile) => {
      setMyProfile(profile);
    });

    socket.on('chats', (payload) => {
      const isLegacy = Array.isArray(payload);
      const page = isLegacy
        ? { items: payload, offset: 0, total: payload.length, hasMore: false }
        : (payload || {});

      const incomingQuery = String(page.query || '').trim();
      if (incomingQuery !== chatSearchRef.current) return;

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
          isMyContact: chat?.isMyContact === true
        }));

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
        isMyContact: chat?.isMyContact === true
      };

      if (!chatMatchesQuery(hydrated, chatSearchRef.current)) {
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
      setChats((prev) => prev.map((chat) => chat.id === chatId ? { ...chat, labels: normalizeChatLabels(labels) } : chat));
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
      if (data.chatId !== activeChatIdRef.current) return;
      const sanitizedMessages = Array.isArray(data.messages)
        ? data.messages.map((m) => ({ ...m, body: repairMojibake(m?.body || '') }))
        : [];
      setMessages(sanitizedMessages);
    });

    socket.on('chat_media', ({ chatId, messageId, mediaData, mimetype }) => {
      if (chatId !== activeChatIdRef.current) return;
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
          status: normalizedContact.status || existing?.status || ''
        };

        return upsertAndSortChat(prev, nextChat);
      });
    });

    socket.on('message', (msg) => {
      const relatedChatId = msg.fromMe ? msg.to : msg.from;
      if (!isVisibleChatId(relatedChatId)) return;

      if (!msg.fromMe && Notification.permission === 'granted') {
        new Notification(msg.notifyName || 'Nuevo mensaje', {
          body: msg.body || 'Nuevo mensaje',
          icon: '/favicon.ico'
        });
      }

      if (!msg.fromMe && relatedChatId !== activeChatIdRef.current) {
        const toastId = String(msg.id || Date.now());
        setToasts((prev) => [...prev, {
          id: toastId,
          chatId: relatedChatId,
          title: sanitizeDisplayText(msg.notifyName || msg.from || 'Nuevo mensaje'),
          body: sanitizeDisplayText(msg.body || 'Nuevo mensaje')
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
          lastMessage: sanitizeDisplayText(msg.body || '') || (msg.type === 'image' ? 'Imagen' : 'Mensaje'),
          lastMessageFromMe: !!msg.fromMe,
          ack: msg.ack || 0,
          isMyContact: existing?.isMyContact === true,
          unreadCount: msg.fromMe ? (existing?.unreadCount || 0) : (canonicalId === activeChatIdRef.current ? 0 : (existing?.unreadCount || 0) + 1),
        };

        if (!chatMatchesQuery(nextChat, chatSearchRef.current)) return prev;
        return upsertAndSortChat(prev, nextChat);
      });

      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        const shouldAdd = (msg.fromMe && msg.to === activeChatIdRef.current) || (!msg.fromMe && msg.from === activeChatIdRef.current);
        if (!shouldAdd) return prev;
        return [...prev, { ...msg, body: repairMojibake(msg?.body || '') }];
      });
    });

    socket.on('business_data', (data) => {
      const normalized = normalizeBusinessDataPayload(data);
      setBusinessData(normalized);
      setLabelDefinitions(normalizeChatLabels(normalized.labels));
    });

    socket.on('business_data_catalog', (catalog) => {
      const normalizedCatalog = Array.isArray(catalog) ? catalog.map((item, idx) => normalizeCatalogItem(item, idx)) : [];
      setBusinessData(prev => ({ ...prev, catalog: normalizedCatalog }));
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

    socket.on('message_ack', ({ id, ack }) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, ack } : m));
      setChats(prev => prev.map(c => c.lastMessageFromMe && c.id === activeChatIdRef.current ? { ...c, ack } : c));
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
      setActiveChatId(null);
      alert('Sesion de WhatsApp cerrada. Escanea nuevamente el QR.');
    });

    return () => {
      ['connect', 'disconnect', 'qr', 'ready', 'my_profile', 'chats', 'chat_updated', 'chat_history', 'chat_media',
        'chat_opened', 'start_new_chat_error', 'chat_labels_updated', 'chat_labels_error', 'chat_labels_saved',
        'contact_info', 'message', 'business_data', 'business_data_catalog', 'ai_suggestion_chunk',
        'ai_suggestion_complete', 'ai_error', 'message_ack', 'authenticated', 'auth_failure', 'disconnected', 'logout_done'
      ].forEach(ev => socket.off(ev));
    };
  }, []);

  // ──────────────────────────────────────────────────────────────
  // Apply AI suggestion to input
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (aiSuggestion && !isAiLoading) {
      setInputText(aiSuggestion);
      setAiSuggestion('');
    }
  }, [isAiLoading, aiSuggestion]);

  // ──────────────────────────────────────────────────────────────
  // Handlers
  // ──────────────────────────────────────────────────────────────
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
    setMessages([]);
    setShowClientProfile(false);
    setClientContact(null);
    socket.emit('get_chat_history', chatId);
    socket.emit('mark_chat_read', chatId);
    socket.emit('get_contact_info', chatId);
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c));
  };

  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!inputText.trim() && !attachment) return;

    const text = inputText.trim();

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
    if (!window.confirm('¿Cerrar sesión de WhatsApp en este equipo?')) return;
    socket.emit('logout_whatsapp');
  };

  const handleRefreshChats = () => {
    requestChatsPage({ reset: true });
  };

  const handleChatSearchChange = (value) => {
    setChatSearchQuery(String(value || ''));
  };

  const handleLoadMoreChats = () => {
    requestChatsPage({ reset: false });
  };

  const handleCreateLabel = () => {
    const name = window.prompt('Nombre de etiqueta para WhatsApp Business:');
    if (!name?.trim()) return;
    socket.emit('create_label', { name: name.trim() });
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
    socket.emit('start_new_chat', { phone: normalizedPhone, firstMessage });
  };

  const requestAiSuggestion = (customPromptArg) => {
    if (!activeChatId) return;
    const customPrompt = typeof customPromptArg === 'string' ? customPromptArg : null;
    setAiSuggestion('');
    setIsAiLoading(true);

    const businessContext = `
Eres un asistente de ventas experto en Lávitat Perú. Ayuda al vendedor a responder con precisión técnica, enfoque comercial y cierres claros.

PERFIL DEL NEGOCIO:
${businessData.profile?.name || 'Negocio'}
${businessData.profile?.description || ''}
${businessData.profile?.address ? 'Dirección: ' + businessData.profile.address : ''}

CATÁLOGO DE PRODUCTOS:
${businessData.catalog.length > 0
        ? businessData.catalog.map((p, idx) => `${idx + 1}. ${p.title} | Precio: S/ ${p.price || 'consultar'}${p.sku ? ` | SKU: ${p.sku}` : ''}${p.description ? ` | ${p.description}` : ''}`).join('\n')
        : '(sin productos registrados)'
      }

INSTRUCCIÓN: ${customPrompt || 'Basándote en la conversación reciente, genera la respuesta más adecuada, profesional y persuasiva que el vendedor debería enviar.'}

REGLA CRÍTICA:
- NO INVENTES PRODUCTOS, tamaños o precios.
- Usa solamente productos presentes en el catálogo listado arriba.
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

  const startRecording = async () => {
    if (isRecording || !activeChatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = 'audio/ogg; codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm; codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      chunksRef.current = [];
      recordingStartRef.current = Date.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        try {
          streamRef.current?.getTracks()?.forEach((t) => t.stop());
        } catch (_) { }

        const elapsedMs = Date.now() - recordingStartRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });

        if (elapsedMs < 350 || !blob || blob.size < 800) {
          alert('Nota de voz muy corta o vacía. Mantén presionado un poco más para grabar.');
          chunksRef.current = [];
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = String(reader.result || '');
          const base64 = result.includes(',') ? result.split(',')[1] : null;
          if (!base64) {
            alert('No se pudo procesar la nota de voz. Intenta nuevamente.');
            return;
          }
          const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
          socket.emit('send_media_message', {
            to: activeChatId,
            body: '',
            mediaData: base64,
            mimetype: mimeType,
            filename: `voice-note.${extension}`,
            isPtt: true,
          });
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start(200);
      setRecorder(mediaRecorder);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
    } catch (err) {
      console.error('Mic error:', err);
      alert('No se pudo acceder al micrófono. Verifica permisos del navegador y vuelve a intentar.');
    }
  };

  const stopRecording = () => {
    if (!recorder) return;
    try {
      if (recorder.state === 'recording') {
        try { recorder.requestData(); } catch (_) { }
        recorder.stop();
      }
    } catch (_) { }
    setRecorder(null);
    setIsRecording(false);
    clearInterval(timerRef.current);
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

  // ──────────────────────────────────────────────────────────────
  // Render: Reconnecting
  // ──────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111b21', gap: '20px' }}>
        <div className="loader" />
        <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>Conectando con el servidor...</p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Render: QR Screen
  // ──────────────────────────────────────────────────────────────
  if (!isClientReady) {
    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ marginBottom: '30px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 300, color: '#e9edef', marginBottom: '10px' }}>WhatsApp Business Pro</div>
            <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>Escanea el código QR con tu teléfono para comenzar</p>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '16px', display: 'inline-block', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
            {qrCode
              ? <QRCodeSVG value={qrCode} size={260} level="H" includeMargin={true} className="fade-in" />
              : <div style={{ width: '260px', height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loader" /></div>
            }
          </div>
          <div style={{ marginTop: '30px', padding: '20px', background: '#202c33', borderRadius: '12px', textAlign: 'left' }}>
            <p style={{ color: '#8696a0', fontSize: '0.85rem', lineHeight: '1.8' }}>
              1. Abre <strong style={{ color: '#e9edef' }}>WhatsApp</strong> en tu teléfono<br />
              2. Toca <strong style={{ color: '#e9edef' }}>Menú (⋮)</strong> o <strong style={{ color: '#e9edef' }}>Configuración</strong><br />
              3. Selecciona <strong style={{ color: '#e9edef' }}>Dispositivos vinculados</strong><br />
              4. Toca <strong style={{ color: '#e9edef' }}>Vincular un dispositivo</strong> y escanea
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Render: Main App
  // ──────────────────────────────────────────────────────────────
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

      {/* Sidebar — Chat List */}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onChatSelect={handleChatSelect}
        myProfile={myProfile}
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
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', background: '#0b141a', position: 'relative', overflow: 'hidden' }}>
        {activeChatId ? (
          <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
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
              isRecording={isRecording}
              recordingTime={recordingTime}
              startRecording={startRecording}
              stopRecording={stopRecording}
              isCopilotMode={isCopilotMode}
              setIsCopilotMode={setIsCopilotMode}
              labelDefinitions={labelDefinitions}
              onToggleChatLabel={handleToggleChatLabel}
            />

            {/* Client Profile Panel (slides in from right) */}
            {showClientProfile && (
              <ClientProfilePanel
                contact={{ ...activeChatDetails, ...clientContact }}
                onClose={() => setShowClientProfile(false)}
                onQuickAiAction={requestAiSuggestion}
              />
            )}
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#222e35',
          }}>
            <div style={{ textAlign: 'center', padding: '40px', maxWidth: '450px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '20px' }}>💬</div>
              <h1 style={{ fontSize: '2rem', fontWeight: 300, color: '#e9edef', marginBottom: '15px' }}>
                WhatsApp Business Pro
              </h1>
              <p style={{ color: '#8696a0', fontSize: '0.9rem', lineHeight: '1.6' }}>
                Selecciona un chat para comenzar a vender.<br />
                Usa los botones de IA para cerrar más ventas con OpenAI.
              </p>
              <div style={{ marginTop: '30px', padding: '16px 20px', background: '#2a3942', borderRadius: '12px', textAlign: 'left', fontSize: '0.85rem', color: '#8696a0', lineHeight: '1.8' }}>
                <strong style={{ color: '#00a884' }}>Funciones IA disponibles:</strong><br />
                ✨ Sugerencia de respuesta automática<br />
                📦 Recomendación de producto<br />
                💰 Técnicas de cierre de venta<br />
                🔄 Manejo de objeciones
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

        {/* Business Sidebar — AI & Catalog (always visible) */}
        <BusinessSidebar
          setInputText={setInputText}
          businessData={businessData}
          messages={messages}
          activeChatId={activeChatId}
          socket={socket}
          myProfile={myProfile}
          onLogout={handleLogoutWhatsapp}
        />
      </div>
    </div>
  );
}

export default App;


