import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';

import Sidebar from './components/Sidebar';
import BusinessSidebar, { ClientProfilePanel } from './components/BusinessSidebar';
import ChatWindow from './components/ChatWindow';
import SaasAdminPanel from './components/SaasAdminPanel';

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
    moduleId: String(safeItem.moduleId || safeItem.module_id || '').trim().toLowerCase() || null,
    catalogId: String(safeItem.catalogId || safeItem.catalog_id || '').trim().toUpperCase() || null,
    catalogName: String(safeItem.catalogName || safeItem.catalog_name || safeItem.catalogId || safeItem.catalog_id || '').trim() || null,
    channelType: String(safeItem.channelType || safeItem.channel_type || '').trim().toLowerCase() || null,
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

const normalizeModuleImageUrl = (rawUrl = '') => {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${API_URL}${value}`;
  return `${API_URL}/${value}`;
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

const normalizeWaModuleItem = (item = {}) => {
  const source = item && typeof item === 'object' ? item : {};
  const moduleId = String(source.moduleId || source.id || '').trim().toLowerCase();
  if (!moduleId) return null;
  const transportMode = String(source.transportMode || source.transport || source.mode || '').trim().toLowerCase();
  return {
    moduleId,
    name: String(source.name || moduleId).trim() || moduleId,
    phoneNumber: String(source.phoneNumber || source.phone || '').trim() || null,
    transportMode: 'cloud',
    isActive: source.isActive !== false,
    isDefault: source.isDefault === true,
    isSelected: source.isSelected === true,
    channelType: String(source.channelType || source.channel || '').trim().toLowerCase() || null,
    imageUrl: normalizeModuleImageUrl(source.imageUrl || source.logoUrl || source.avatarUrl || '') || null,
    logoUrl: normalizeModuleImageUrl(source.logoUrl || source.imageUrl || source.avatarUrl || '') || null,
    assignedUserIds: Array.isArray(source.assignedUserIds)
      ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
      : []
  };
};

const normalizeWaModules = (items = []) => {
  const source = Array.isArray(items) ? items : [];
  const seen = new Set();
  return source
    .map(normalizeWaModuleItem)
    .filter((module) => {
      if (!module?.moduleId) return false;
      if (seen.has(module.moduleId)) return false;
      seen.add(module.moduleId);
      return true;
    });
};

const resolveSelectedWaModule = (items = [], preferred = null) => {
  const modules = normalizeWaModules(items);
  if (!modules.length) return null;
  const preferredId = String(preferred?.moduleId || preferred?.id || '').trim().toLowerCase();
  if (preferredId) {
    const byId = modules.find((module) => module.moduleId === preferredId);
    if (byId) return byId;
  }
  return modules.find((module) => module.isSelected) || modules.find((module) => module.isDefault) || modules[0];
};
const normalizeChatLabels = (labels = []) => (
  Array.isArray(labels)
    ? labels
      .map((l) => {
        const id = String(l?.id || l?.labelId || '').trim();
        if (!id) return null;
        return {
          id,
          labelId: id,
          name: l?.name || '',
          color: l?.color || null,
        };
      })
      .filter(Boolean)
    : []
);

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

const CHAT_SCOPE_SEPARATOR = '::mod::';
const normalizeScopedModuleId = (value = '') => String(value || '').trim().toLowerCase();
const parseScopedChatId = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return { baseChatId: '', scopeModuleId: '' };
  const idx = raw.lastIndexOf(CHAT_SCOPE_SEPARATOR);
  if (idx < 0) return { baseChatId: raw, scopeModuleId: '' };
  const baseChatId = String(raw.slice(0, idx) || '').trim();
  const scopeModuleId = normalizeScopedModuleId(raw.slice(idx + CHAT_SCOPE_SEPARATOR.length));
  if (!baseChatId || !scopeModuleId) return { baseChatId: raw, scopeModuleId: '' };
  return { baseChatId, scopeModuleId };
};
const buildScopedChatId = (baseChatId = '', scopeModuleId = '') => {
  const base = String(baseChatId || '').trim();
  const scope = normalizeScopedModuleId(scopeModuleId);
  if (!base || !scope) return base;
  return `${base}${CHAT_SCOPE_SEPARATOR}${scope}`;
};
const normalizeChatScopedId = (chatId = '', fallbackModuleId = '') => {
  const parsed = parseScopedChatId(chatId);
  const base = String(parsed.baseChatId || chatId || '').trim();
  const scope = parsed.scopeModuleId || normalizeScopedModuleId(fallbackModuleId);
  return buildScopedChatId(base, scope) || base;
};
const chatIdsReferSameScope = (left = '', right = '') => {
  const l = parseScopedChatId(left);
  const r = parseScopedChatId(right);
  const leftBase = String(l.baseChatId || left || '').trim();
  const rightBase = String(r.baseChatId || right || '').trim();
  if (!leftBase || !rightBase) return false;
  if (leftBase !== rightBase) return false;
  return String(l.scopeModuleId || '') === String(r.scopeModuleId || '');
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
  const scopedId = normalizeChatScopedId(
    chat?.id || '',
    chat?.scopeModuleId || chat?.lastMessageModuleId || ''
  );
  if (scopedId) return `id:${scopedId}`;
  const phone = getBestChatPhone(chat);
  if (phone) return `phone:${phone}`;
  return 'id:';
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

  const scopedBases = new Set(
    deduped
      .map((chat) => parseScopedChatId(chat?.id || ''))
      .filter((parsed) => Boolean(parsed?.baseChatId) && Boolean(parsed?.scopeModuleId))
      .map((parsed) => String(parsed.baseChatId || '').trim())
      .filter(Boolean)
  );

  const scopeFiltered = deduped.filter((chat) => {
    const parsed = parseScopedChatId(chat?.id || '');
    const baseChatId = String(parsed?.baseChatId || chat?.baseChatId || chat?.id || '').trim();
    if (!baseChatId) return true;
    if (!parsed?.scopeModuleId && scopedBases.has(baseChatId)) return false;
    return true;
  });

  const namesWithHistory = new Set(
    scopeFiltered
      .filter((chat) => !isPlaceholderChat(chat))
      .map((chat) => normalizeDisplayNameKey(chat?.name || ''))
      .filter(Boolean)
  );

  return scopeFiltered.filter((chat) => {
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
  const pinnedMode = ['all', 'pinned', 'unpinned'].includes(String(filters?.pinnedMode || 'all'))
    ? String(filters?.pinnedMode || 'all')
    : 'all';

  return {
    labelTokens,
    unreadOnly: Boolean(filters?.unreadOnly),
    unlabeledOnly: Boolean(filters?.unlabeledOnly),
    contactMode,
    archivedMode,
    pinnedMode,
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
  const isPinned = Boolean(chat?.pinned);
  if (normalized.pinnedMode === 'pinned' && !isPinned) return false;
  if (normalized.pinnedMode === 'unpinned' && isPinned) return false;

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
const normalizeQuickReplyDraft = (value = null) => {
  if (!value || typeof value !== 'object') return null;
  const id = String(value?.id || '').trim();
  const label = sanitizeDisplayText(value?.label || '');
  const textBody = repairMojibake(value?.text || '').trim();
  const mediaAssets = Array.isArray(value?.mediaAssets)
    ? value.mediaAssets
      .map((asset) => ({
        url: String(asset?.url || asset?.mediaUrl || '').trim() || null,
        mimeType: String(asset?.mimeType || asset?.mediaMimeType || '').trim().toLowerCase() || null,
        fileName: String(asset?.fileName || asset?.mediaFileName || '').trim() || null,
        sizeBytes: Number.isFinite(Number(asset?.sizeBytes ?? asset?.mediaSizeBytes)) ? Number(asset?.sizeBytes ?? asset?.mediaSizeBytes) : null
      }))
      .filter((asset) => Boolean(asset.url))
    : [];
  const mediaUrl = String(value?.mediaUrl || mediaAssets[0]?.url || '').trim() || null;
  const mediaMimeType = String(value?.mediaMimeType || mediaAssets[0]?.mimeType || '').trim().toLowerCase() || null;
  const mediaFileName = String(value?.mediaFileName || mediaAssets[0]?.fileName || '').trim() || null;
  const hasPayload = Boolean(textBody || mediaUrl || mediaAssets.length > 0 || id);
  if (!hasPayload) return null;
  return {
    id: id || null,
    label: label || null,
    text: textBody,
    mediaAssets,
    mediaUrl,
    mediaMimeType,
    mediaFileName
  };
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
  const [recoveryStep, setRecoveryStep] = useState('idle');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryResetToken, setRecoveryResetToken] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [recoveryDebugCode, setRecoveryDebugCode] = useState('');
  const [forceOperationLaunchBypass, setForceOperationLaunchBypass] = useState(false);
  const waLaunchParams = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const launch = String(params.get('wa_launch') || '').trim().toLowerCase() === 'operation';
      const moduleId = String(params.get('wa_module') || '').trim().toLowerCase();
      const tenantId = String(params.get('wa_tenant') || '').trim();
      const sectionId = String(params.get('wa_section') || '').trim().toLowerCase();
      const source = String(params.get('wa_from') || '').trim().toLowerCase();
      return {
        forceOperationLaunch: launch,
        requestedWaModuleId: moduleId || '',
        requestedWaTenantId: tenantId || '',
        requestedWaSectionId: sectionId || '',
        requestedLaunchSource: source || ''
      };
    } catch (_) {
      return {
        forceOperationLaunch: false,
        requestedWaModuleId: '',
        requestedWaTenantId: '',
        requestedWaSectionId: '',
        requestedLaunchSource: ''
      };
    }
  }, []);
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
  const [newChatDialog, setNewChatDialog] = useState({
    open: false,
    phone: '',
    firstMessage: '',
    moduleId: '',
    error: ''
  });

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

  const resolveSessionSenderIdentity = useCallback(() => {
    const sessionUser = (saasSessionRef.current?.user && typeof saasSessionRef.current.user === 'object')
      ? saasSessionRef.current.user
      : null;
    const runtimeAuthUser = (saasRuntimeRef.current?.authContext?.user && typeof saasRuntimeRef.current.authContext.user === 'object')
      ? saasRuntimeRef.current.authContext.user
      : null;
    const user = sessionUser || runtimeAuthUser;
    const id = String(user?.id || user?.userId || '').trim();
    const email = String(user?.email || '').trim();
    const role = String(user?.role || '').trim().toLowerCase();
    const explicitName = String(user?.name || user?.displayName || user?.fullName || '').trim();
    const name = String(explicitName || email || id || '').trim();
    return {
      id: id || null,
      email: email || null,
      role: role || null,
      name: name || null
    };
  }, []);

  const requestQuickRepliesForModule = useCallback((moduleId = '') => {
    if (!socket.connected) return;
    const cleanModuleId = String(
      moduleId
      || selectedCatalogModuleIdRef.current
      || selectedWaModuleRef.current?.moduleId
      || ''
    ).trim().toLowerCase();
    const now = Date.now();
    const cache = quickRepliesRequestRef.current || { key: '', at: 0 };
    if (cache.key === cleanModuleId && (now - cache.at) < 250) return;
    quickRepliesRequestRef.current = { key: cleanModuleId, at: now };
    socket.emit('get_quick_replies', cleanModuleId ? { moduleId: cleanModuleId } : {});
  }, []);

  const emitScopedBusinessDataRequest = useCallback((scope = {}) => {
    if (!socket.connected) return;
    const requestedModuleId = String(
      scope?.moduleId
      || selectedCatalogModuleIdRef.current
      || selectedWaModuleRef.current?.moduleId
      || ''
    ).trim().toLowerCase();
    const requestedCatalogId = String(
      scope?.catalogId
      || selectedCatalogIdRef.current
      || ''
    ).trim().toUpperCase();
    const dedupeKey = `${requestedModuleId}|${requestedCatalogId}`;
    const now = Date.now();
    const dedupe = businessDataRequestDebounceRef.current || { key: '', at: 0 };
    if (dedupe.key === dedupeKey && (now - dedupe.at) < 220) return;
    businessDataRequestDebounceRef.current = { key: dedupeKey, at: now };

    const cachedScope = businessDataScopeCacheRef.current.get(dedupeKey);
    if (cachedScope && Array.isArray(cachedScope.catalog)) {
      setBusinessData((prev) => ({
        ...prev,
        catalog: cachedScope.catalog,
        catalogMeta: cachedScope.catalogMeta || prev?.catalogMeta || { source: 'local', nativeAvailable: false }
      }));
    }

    const payload = {};
    if (requestedModuleId) payload.moduleId = requestedModuleId;
    if (requestedCatalogId) payload.catalogId = requestedCatalogId;
    const requestSeq = (businessDataRequestSeqRef.current || 0) + 1;
    businessDataRequestSeqRef.current = requestSeq;
    payload.requestSeq = requestSeq;
    socket.emit('get_business_data', payload);
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
      const runtimeModules = normalizeWaModules(runtimePayload?.waModules || []);
      const runtimeSelectedModule = resolveSelectedWaModule(runtimeModules, runtimePayload?.selectedWaModule || null);

      setSaasSession(nextSession);
      setWaModules(runtimeModules);
      setSelectedWaModule(runtimeSelectedModule);
      setWaModuleError('');
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
      const suggestedEmail = String(runtimeUser?.email || '').trim();
      if (suggestedEmail) setLoginEmail((prev) => prev || suggestedEmail);

      if (!runtimeResult.ok) {
        setSaasAuthError(runtimeResult.error || 'No se pudo cargar runtime SaaS.');
      }
      setSaasAuthBusy(false);
    })().catch((error) => {
      if (cancelled) return;
      setSaasRuntime((prev) => ({ ...prev, loaded: true }));
      setWaModules([]);
      setSelectedWaModule(null);
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
    const selectedModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim();
    if (selectedModuleId) auth.waModuleId = selectedModuleId;
    socket.auth = Object.keys(auth).length > 0 ? auth : undefined;

    if (!socket.connected) socket.connect();
  }, [saasRuntime?.loaded, saasRuntime?.authEnabled, saasRuntime?.tenant?.id, saasSession?.accessToken, saasSession?.user?.tenantId, selectedWaModule?.moduleId]);

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
    try {
      localStorage.removeItem(TRANSPORT_STORAGE_KEY);
    } catch (_) { }
  }, [selectedTransport]);

  useEffect(() => {
    selectedWaModuleRef.current = selectedWaModule;
  }, [selectedWaModule]);

  useEffect(() => {
    waModulesRef.current = Array.isArray(waModules) ? waModules : [];
  }, [waModules]);

  useEffect(() => {
    selectedCatalogModuleIdRef.current = String(selectedCatalogModuleId || '').trim().toLowerCase();
  }, [selectedCatalogModuleId]);

  useEffect(() => {
    selectedCatalogIdRef.current = String(selectedCatalogId || '').trim().toUpperCase();
  }, [selectedCatalogId]);

  useEffect(() => {
    saasSessionRef.current = saasSession;
    persistSaasSession(saasSession);
  }, [saasSession]);

  useEffect(() => {
    saasRuntimeRef.current = saasRuntime;
  }, [saasRuntime]);

  useEffect(() => {
    forceOperationLaunchRef.current = forceOperationLaunch;
  }, [forceOperationLaunch]);

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
      socket.emit('get_wa_modules');
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
      const authUser = (ctx?.auth?.user && typeof ctx.auth.user === 'object')
        ? ctx.auth.user
        : (ctx?.user && typeof ctx.user === 'object' ? ctx.user : null);

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
        setSaasSession((prev) => prev ? ({ ...prev, user: { ...(prev?.user || {}), ...authUser } }) : prev);
      }
    });

    socket.on('wa_module_context', (payload) => {
      const items = normalizeWaModules(payload?.items || []);
      const previousModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
      const selected = resolveSelectedWaModule(items, payload?.selected || selectedWaModuleRef.current);
      const selectedModuleId = String(selected?.moduleId || '').trim().toLowerCase();
      setWaModules(items);
      setSelectedWaModule(selected);
      setWaModuleError('');

      const previousCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
      const selectedCatalogExists = previousCatalogModuleId
        ? items.some((item) => String(item?.moduleId || '').trim().toLowerCase() === previousCatalogModuleId)
        : false;
      const nextCatalogModuleId = selectedCatalogExists
        ? previousCatalogModuleId
        : (selectedModuleId || String(items[0]?.moduleId || '').trim().toLowerCase());
      setSelectedCatalogModuleId(nextCatalogModuleId || '');
      if (nextCatalogModuleId !== previousCatalogModuleId) {
        selectedCatalogIdRef.current = '';
        setSelectedCatalogId('');
      }
      if (nextCatalogModuleId && socket.connected) {
        const nextCatalogId = nextCatalogModuleId === previousCatalogModuleId
          ? (selectedCatalogIdRef.current || '')
          : '';
        emitScopedBusinessDataRequest({ moduleId: nextCatalogModuleId, catalogId: nextCatalogId });
      }

      const requestedModuleId = String(requestedWaModuleFromUrlRef.current || '').trim().toLowerCase();
      if (requestedModuleId) {
        const requestedMatch = items.find((item) => String(item?.moduleId || '').trim().toLowerCase() === requestedModuleId);
        if (requestedMatch && String(selected?.moduleId || '').trim().toLowerCase() !== requestedModuleId) {
          socket.emit('set_wa_module', { moduleId: requestedMatch.moduleId });
          return;
        }
        requestedWaModuleFromUrlRef.current = '';
      }

      const selectedMode = String(selected?.transportMode || '').trim().toLowerCase();
      const shouldAutoSelectTransport = forceOperationLaunchRef.current || !canManageSaasRef.current;
      if (shouldAutoSelectTransport && selectedMode === 'cloud' && selectedMode !== selectedTransportRef.current) {
        setSelectedTransport(selectedMode);
      }

      if (selectedModuleId && selectedModuleId !== previousModuleId) {
        requestQuickRepliesForModule(selectedModuleId);
        emitScopedBusinessDataRequest({ moduleId: selectedModuleId || selectedCatalogModuleIdRef.current, catalogId: selectedCatalogIdRef.current || '' });
      }
    });

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

  const handleSaasLogin = async (event) => {
    event?.preventDefault();
    if (recoveryStep !== 'idle') return;
    const email = String(loginEmail || '').trim().toLowerCase();
    const password = String(loginPassword || '');

    if (!email || !password) {
      setSaasAuthError('Ingresa correo y contrasena para continuar.');
      return;
    }

    setSaasAuthBusy(true);
    setSaasAuthError('');
    setSaasAuthNotice('');
    setTenantSwitchError('');
    setRecoveryError('');

    try {
      const response = await fetch(API_URL + '/api/auth/login', {
        method: 'POST',
        headers: buildApiHeaders({ includeJson: true }),
        body: JSON.stringify({ email, password })
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

      try {
        const meResponse = await fetch(`${API_URL}/api/auth/me`, {
          method: 'GET',
          headers: buildApiHeaders({
            tokenOverride: String(session?.accessToken || ''),
            tenantIdOverride: String(session?.user?.tenantId || '')
          })
        });
        const mePayload = await meResponse.json().catch(() => ({}));
        if (meResponse.ok && mePayload?.ok && mePayload?.user && typeof mePayload.user === 'object') {
          session.user = { ...(session.user || {}), ...mePayload.user };
        }
      } catch (_) {
        // best effort: seguimos con lo recibido en login
      }

      const loginRole = String(session?.user?.role || '').trim().toLowerCase();
      const loginCanManageSaas = Boolean(
        session?.user?.canManageSaas
        || session?.user?.isSuperAdmin
        || loginRole === 'owner'
        || loginRole === 'admin'
        || loginRole === 'superadmin'
      );
      setSaasSession(session);
      setForceOperationLaunchBypass(loginCanManageSaas);
      if (loginCanManageSaas) {
        try {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('wa_launch');
          cleanUrl.searchParams.delete('wa_module');
          cleanUrl.searchParams.delete('wa_tenant');
          window.history.replaceState({}, '', cleanUrl.toString());
        } catch (_) {
          // no-op
        }
        setSelectedTransport('');
        setShowSaasAdminPanel(true);
      } else {
        setShowSaasAdminPanel(false);
        setSelectedTransport('cloud');
      }
      setLoginPassword('');
      setLoginEmail(String(session?.user?.email || payload?.user?.email || email));
      setRecoveryStep('idle');
    } catch (error) {
      setSaasAuthError(String(error?.message || 'No se pudo iniciar sesion.'));
    } finally {
      setSaasAuthBusy(false);
    }
  };

  const resetRecoveryFlow = () => {
    setRecoveryStep('idle');
    setRecoveryCode('');
    setRecoveryResetToken('');
    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
    setRecoveryBusy(false);
    setRecoveryError('');
    setRecoveryNotice('');
    setRecoveryDebugCode('');
    setShowRecoveryPassword(false);
  };

  const openRecoveryFlow = () => {
    const emailSeed = String(loginEmail || '').trim().toLowerCase();
    setRecoveryEmail(emailSeed);
    setRecoveryStep('request');
    setRecoveryCode('');
    setRecoveryResetToken('');
    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
    setRecoveryError('');
    setRecoveryNotice('');
    setRecoveryDebugCode('');
    setSaasAuthNotice('');
  };

  const handleRecoveryRequest = async (event) => {
    event?.preventDefault();
    const email = String(recoveryEmail || '').trim().toLowerCase();
    if (!email) {
      setRecoveryError('Ingresa tu correo para recuperar acceso.');
      return;
    }

    setRecoveryBusy(true);
    setRecoveryError('');
    setRecoveryNotice('');
    try {
      const response = await fetch(`${API_URL}/api/auth/recovery/request`, {
        method: 'POST',
        headers: buildApiHeaders({ includeJson: true }),
        body: JSON.stringify({ email })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || 'No se pudo iniciar la recuperacion.'));
      }
      setRecoveryNotice(String(payload?.message || 'Si el correo existe, enviaremos un codigo de recuperacion.'));
      setRecoveryDebugCode(String(payload?.debugCode || ''));
      setRecoveryStep('verify');
    } catch (error) {
      setRecoveryError(String(error?.message || 'No se pudo iniciar la recuperacion.'));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleRecoveryVerify = async (event) => {
    event?.preventDefault();
    const email = String(recoveryEmail || '').trim().toLowerCase();
    const code = String(recoveryCode || '').trim();
    if (!email || !code) {
      setRecoveryError('Ingresa correo y codigo de verificacion.');
      return;
    }

    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      const response = await fetch(`${API_URL}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: buildApiHeaders({ includeJson: true }),
        body: JSON.stringify({ email, code })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || 'Codigo invalido o expirado.'));
      }
      setRecoveryResetToken(String(payload?.resetToken || ''));
      setRecoveryStep('reset');
      setRecoveryNotice('Codigo validado. Ahora crea tu nueva contrasena.');
    } catch (error) {
      setRecoveryError(String(error?.message || 'No se pudo validar el codigo.'));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleRecoveryReset = async (event) => {
    event?.preventDefault();
    const email = String(recoveryEmail || '').trim().toLowerCase();
    const resetToken = String(recoveryResetToken || '').trim();
    const newPassword = String(recoveryPassword || '');
    if (!email || !resetToken) {
      setRecoveryError('Sesion de recuperacion expirada. Solicita un nuevo codigo.');
      return;
    }
    if (!newPassword || newPassword.length < 10) {
      setRecoveryError('Usa una contrasena segura (minimo 10 caracteres).');
      return;
    }
    if (newPassword !== String(recoveryPasswordConfirm || '')) {
      setRecoveryError('Las contrasenas no coinciden.');
      return;
    }

    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      const response = await fetch(`${API_URL}/api/auth/recovery/reset`, {
        method: 'POST',
        headers: buildApiHeaders({ includeJson: true }),
        body: JSON.stringify({ email, resetToken, newPassword })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || 'No se pudo actualizar la contrasena.'));
      }
      setLoginEmail(email);
      setLoginPassword('');
      resetRecoveryFlow();
      setSaasAuthNotice(String(payload?.message || 'Contrasena actualizada. Inicia sesion con la nueva clave.'));
    } catch (error) {
      setRecoveryError(String(error?.message || 'No se pudo actualizar la contrasena.'));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleSaasLogout = async () => {
    if (!window.confirm('Cerrar sesion de tu cuenta SaaS?')) return;
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
    setSelectedTransport('');
    setShowSaasAdminPanel(false);
    setForceOperationLaunchBypass(false);
    setSaasAuthError('');
    setTenantSwitchError('');
    setTenantSwitchBusy(false);
    setWaModules([]);
    setSelectedWaModule(null);
    setSelectedCatalogModuleId('');
    if (socket.connected) socket.disconnect();
    setIsConnected(false);
    resetWorkspaceState();
  };

  const handleSwitchTenant = async (nextTenantId = '') => {
    if (!saasRuntimeRef.current?.authEnabled) return;
    const current = saasSessionRef.current;
    if (!current?.accessToken || !current?.refreshToken) return;

    const targetTenantId = String(nextTenantId || '').trim();
    const currentTenantId = String(current?.user?.tenantId || saasRuntimeRef.current?.tenant?.id || '').trim();
    if (!targetTenantId || targetTenantId === currentTenantId) return;

    setTenantSwitchError('');
    setTenantSwitchBusy(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/switch-tenant`, {
        method: 'POST',
        headers: buildApiHeaders({ includeJson: true, tokenOverride: String(current?.accessToken || ''), tenantIdOverride: currentTenantId }),
        body: JSON.stringify({
          targetTenantId,
          refreshToken: String(current?.refreshToken || '')
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || 'No se pudo cambiar de empresa.'));
      }

      const nextSession = normalizeSaasSessionPayload(payload, current);
      if (!nextSession) throw new Error('Sesion invalida al cambiar de empresa.');
      if (payload?.user && typeof payload.user === 'object') nextSession.user = payload.user;

      const targetTenant = (Array.isArray(saasRuntimeRef.current?.tenants) ? saasRuntimeRef.current.tenants : [])
        .find((item) => String(item?.id || '').trim() === targetTenantId) || null;

      setSaasSession(nextSession);
      setSaasRuntime((prev) => ({
        ...prev,
        tenant: targetTenant || { id: targetTenantId, slug: targetTenantId, name: targetTenantId, active: true, plan: prev?.tenant?.plan || 'starter' },
        authContext: {
          ...(prev?.authContext || {}),
          enabled: true,
          isAuthenticated: true,
          user: nextSession.user || prev?.authContext?.user || null
        }
      }));

      setWaModules([]);
      setSelectedWaModule(null);
      setWaModuleError('');
      if (socket.connected) socket.disconnect();
      setIsConnected(false);
      resetWorkspaceState();
    } catch (error) {
      setTenantSwitchError(String(error?.message || 'No se pudo cambiar de empresa.'));
    } finally {
      setTenantSwitchBusy(false);
    }
  };

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

  const resolveNewChatAvailableModules = useCallback(() => (
    normalizeWaModules(waModulesRef.current).filter((module) => module.isActive !== false)
  ), []);

  const resolveDefaultNewChatModuleId = useCallback((availableModules = []) => {
    const preferredModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
    if (availableModules.length === 1) {
      return String(availableModules[0]?.moduleId || '').trim().toLowerCase();
    }
    if (preferredModuleId) {
      const preferred = availableModules.find((module) => String(module?.moduleId || '').trim().toLowerCase() === preferredModuleId);
      if (preferred?.moduleId) return String(preferred.moduleId || '').trim().toLowerCase();
    }
    return String(availableModules[0]?.moduleId || '').trim().toLowerCase();
  }, []);

  const resetNewChatDialog = useCallback(() => {
    setNewChatDialog({
      open: false,
      phone: '',
      firstMessage: '',
      moduleId: '',
      error: ''
    });
  }, []);

  const executeStartNewChat = useCallback(({ normalizedPhone = '', firstMessage = '', targetModuleId = '' } = {}) => {
    const cleanPhone = normalizeDigits(normalizedPhone);
    const cleanModuleId = String(targetModuleId || '').trim().toLowerCase();
    if (!cleanPhone) return;

    const candidates = chatsRef.current
      .filter((c) => {
        const chatPhone = normalizeDigits(getBestChatPhone(c) || '');
        if (!chatPhone || chatPhone !== cleanPhone) return false;
        if (!cleanModuleId) return true;
        const scoped = parseScopedChatId(c?.id || '');
        const chatModuleId = String(scoped.scopeModuleId || c?.lastMessageModuleId || '').trim().toLowerCase();
        return chatModuleId === cleanModuleId;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (candidates.length > 0) {
      const best = candidates[0];
      if (best?.id) {
        handleChatSelect(best.id, { clearSearch: true });
        if (String(firstMessage || '').trim()) {
          socket.emit('send_message', {
            to: best.id,
            toPhone: cleanPhone,
            body: String(firstMessage || '').trim()
          });
        }
        return;
      }
    }

    socket.emit('start_new_chat', {
      phone: cleanPhone,
      firstMessage: String(firstMessage || '').trim(),
      moduleId: cleanModuleId || undefined
    });
  }, [handleChatSelect]);

  const openStartNewChatDialog = useCallback((phoneArg = '', firstMessageArg = '') => {
    const availableModules = resolveNewChatAvailableModules();
    const defaultModuleId = resolveDefaultNewChatModuleId(availableModules);
    setNewChatDialog({
      open: true,
      phone: String(phoneArg || '').trim(),
      firstMessage: typeof firstMessageArg === 'string' ? firstMessageArg : '',
      moduleId: defaultModuleId || '',
      error: ''
    });
  }, [resolveDefaultNewChatModuleId, resolveNewChatAvailableModules]);

  const handleStartNewChat = useCallback((phoneArg = '', firstMessageArg = '') => {
    openStartNewChatDialog(phoneArg, firstMessageArg);
  }, [openStartNewChatDialog]);

  const handleCancelNewChatDialog = useCallback(() => {
    resetNewChatDialog();
  }, [resetNewChatDialog]);

  const handleConfirmNewChat = useCallback(() => {
    const normalizedPhone = normalizeDigits(newChatDialog.phone || '');
    if (!normalizedPhone || normalizedPhone.length < 8) {
      setNewChatDialog((prev) => ({ ...prev, error: 'Ingresa un numero valido con codigo de pais.' }));
      return;
    }

    const availableModules = resolveNewChatAvailableModules();
    const selectedModuleId = String(newChatDialog.moduleId || '').trim().toLowerCase();
    const defaultModuleId = resolveDefaultNewChatModuleId(availableModules);
    let targetModuleId = selectedModuleId || defaultModuleId;

    if (availableModules.length > 0) {
      const moduleIsValid = availableModules.some((module) => String(module?.moduleId || '').trim().toLowerCase() === targetModuleId);
      if (!moduleIsValid) {
        setNewChatDialog((prev) => ({ ...prev, error: 'Selecciona un modulo activo para iniciar el chat.' }));
        return;
      }
    } else {
      const preferredModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim().toLowerCase();
      targetModuleId = preferredModuleId || '';
    }

    executeStartNewChat({
      normalizedPhone,
      firstMessage: newChatDialog.firstMessage || '',
      targetModuleId
    });
    resetNewChatDialog();
  }, [executeStartNewChat, newChatDialog.firstMessage, newChatDialog.moduleId, newChatDialog.phone, resetNewChatDialog, resolveDefaultNewChatModuleId, resolveNewChatAvailableModules]);
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
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111b21', gap: '20px' }}>
        <div className='loader' />
        <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>Inicializando plataforma SaaS...</p>
      </div>
    );
  }

  if (saasAuthEnabled && !isSaasAuthenticated) {
    return (
      <div className='login-screen login-screen--saas'>
        <div className='login-ambient' aria-hidden='true' />
        <form onSubmit={handleSaasLogin} className='saas-login-card fade-in'>
          <div className='saas-login-head'>
            <span className='saas-login-kicker'>Control plane</span>
            <div className='saas-login-title'>Acceso seguro</div>
            <p>Inicia sesion con usuario y contrasena. La empresa se asigna automaticamente segun tus permisos.</p>
          </div>

          <label className='saas-login-field'>
            <span>Usuario o correo</span>
            <input
              type='text'
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              autoComplete='username'
              placeholder='usuario@empresa.com o user_id'
              disabled={saasAuthBusy || recoveryBusy}
            />
          </label>

          <label className='saas-login-field'>
            <span>Contrasena</span>
            <div className='saas-login-password-wrap'>
              <input
                type={showLoginPassword ? 'text' : 'password'}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete='current-password'
                placeholder='********'
                disabled={saasAuthBusy || recoveryBusy}
              />
              <button
                type='button'
                className='saas-login-visibility'
                onClick={() => setShowLoginPassword((prev) => !prev)}
                disabled={saasAuthBusy || recoveryBusy}
                aria-label={showLoginPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                {showLoginPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </label>

          {saasAuthError && (
            <div className='saas-login-error'>
              {saasAuthError}
            </div>
          )}
          {saasAuthNotice && (
            <div className='saas-login-notice'>
              {saasAuthNotice}
            </div>
          )}

          {recoveryStep === 'idle' ? (
            <>
              <button
                type='submit'
                disabled={saasAuthBusy || recoveryBusy}
                className='saas-login-submit'
              >
                {saasAuthBusy ? 'Ingresando...' : 'Iniciar sesion'}
              </button>
              <button
                type='button'
                className='saas-login-link'
                onClick={openRecoveryFlow}
                disabled={saasAuthBusy || recoveryBusy}
              >
                Olvide mi contrasena
              </button>
            </>
          ) : (
            <div className='saas-recovery-box'>
              <div className='saas-recovery-head'>
                <strong>Recuperar acceso</strong>
                <small>Paso seguro en 2 etapas con codigo por correo.</small>
              </div>

              {recoveryNotice && <div className='saas-login-notice'>{recoveryNotice}</div>}
              {recoveryError && <div className='saas-login-error'>{recoveryError}</div>}

              {recoveryStep === 'request' && (
                <div className='saas-recovery-form'>
                  <label className='saas-login-field'>
                    <span>Correo</span>
                    <input
                      type='email'
                      value={recoveryEmail}
                      onChange={(event) => setRecoveryEmail(event.target.value)}
                      placeholder='usuario@empresa.com'
                      autoComplete='email'
                      disabled={recoveryBusy}
                    />
                  </label>
                  <button
                    type='button'
                    disabled={recoveryBusy}
                    className='saas-login-submit'
                    onClick={handleRecoveryRequest}
                  >
                    {recoveryBusy ? 'Enviando...' : 'Enviar codigo'}
                  </button>
                </div>
              )}

              {recoveryStep === 'verify' && (
                <div className='saas-recovery-form'>
                  <label className='saas-login-field'>
                    <span>Correo</span>
                    <input type='email' value={recoveryEmail} disabled />
                  </label>
                  <label className='saas-login-field'>
                    <span>Codigo de verificacion</span>
                    <input
                      type='text'
                      value={recoveryCode}
                      onChange={(event) => setRecoveryCode(event.target.value)}
                      placeholder='000000'
                      autoComplete='one-time-code'
                      disabled={recoveryBusy}
                    />
                  </label>
                  <button
                    type='button'
                    disabled={recoveryBusy}
                    className='saas-login-submit'
                    onClick={handleRecoveryVerify}
                  >
                    {recoveryBusy ? 'Validando...' : 'Validar codigo'}
                  </button>
                  {recoveryDebugCode && (
                    <div className='saas-login-debug'>
                      Codigo debug (solo entorno local): <strong>{recoveryDebugCode}</strong>
                    </div>
                  )}
                </div>
              )}

              {recoveryStep === 'reset' && (
                <div className='saas-recovery-form'>
                  <label className='saas-login-field'>
                    <span>Nueva contrasena</span>
                    <input
                      type={showRecoveryPassword ? 'text' : 'password'}
                      value={recoveryPassword}
                      onChange={(event) => setRecoveryPassword(event.target.value)}
                      placeholder='Minimo 10 caracteres, mayuscula, numero y simbolo'
                      autoComplete='new-password'
                      disabled={recoveryBusy}
                    />
                  </label>
                  <label className='saas-login-field'>
                    <span>Confirmar contrasena</span>
                    <input
                      type={showRecoveryPassword ? 'text' : 'password'}
                      value={recoveryPasswordConfirm}
                      onChange={(event) => setRecoveryPasswordConfirm(event.target.value)}
                      placeholder='Repite la nueva contrasena'
                      autoComplete='new-password'
                      disabled={recoveryBusy}
                    />
                  </label>
                  <label className='saas-login-check'>
                    <input
                      type='checkbox'
                      checked={showRecoveryPassword}
                      onChange={(event) => setShowRecoveryPassword(event.target.checked)}
                      disabled={recoveryBusy}
                    />
                    <span>Mostrar contrasena</span>
                  </label>
                  <button
                    type='button'
                    disabled={recoveryBusy}
                    className='saas-login-submit'
                    onClick={handleRecoveryReset}
                  >
                    {recoveryBusy ? 'Actualizando...' : 'Actualizar contrasena'}
                  </button>
                </div>
              )}

              <button
                type='button'
                className='saas-login-link'
                onClick={resetRecoveryFlow}
                disabled={recoveryBusy}
              >
                Volver al inicio de sesion
              </button>
            </div>
          )}
        </form>
      </div>
    );
  }

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
    if (canManageSaas && !forceOperationLaunch) {
      return (
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
    const showCloudConfigError = activeTransport === 'cloud' && !cloudConfigured;

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

          {showCloudConfigError ? (
            <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,170,0,0.4)', background: 'rgba(255,170,0,0.08)', color: '#ffe1a3', textAlign: 'left', fontSize: '0.83rem', lineHeight: 1.6 }}>
              Falta configurar Cloud API en backend/.env.<br />
              Variables minimas: <strong>META_APP_ID</strong>, <strong>META_SYSTEM_USER_TOKEN</strong>, <strong>META_WABA_PHONE_NUMBER_ID</strong>.
            </div>
          ) : (
            <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid rgba(124,200,255,0.35)', background: '#202c33' }}>
              <div className="loader" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: '#9eb2bf', fontSize: '0.86rem', margin: 0 }}>Esperando inicializacion de Cloud API...</p>
            </div>
          )}

          {waModuleError && (
            <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,153,102,0.45)', background: 'rgba(255,153,102,0.08)', color: '#ffd9c2', fontSize: '0.82rem' }}>
              {waModuleError}
            </div>
          )}

          {transportError && (
            <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,113,113,0.4)', background: 'rgba(255,113,113,0.08)', color: '#ffd1d1', fontSize: '0.82rem' }}>
              {transportError}
            </div>
          )}
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

  const newChatAvailableModules = resolveNewChatAvailableModules();
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
            onCartSnapshotChange={setActiveCartSnapshot}
          />
        )}
      </div>

      {newChatDialog.open && (
        <div className="new-chat-modal-overlay" onClick={handleCancelNewChatDialog}>
          <div className="new-chat-modal-card" role="dialog" aria-modal="true" aria-label="Nuevo chat" onClick={(event) => event.stopPropagation()}>
            <div className="new-chat-modal-header">
              <h3>Nuevo chat</h3>
              <button type="button" className="new-chat-modal-close" onClick={handleCancelNewChatDialog} aria-label="Cerrar">x</button>
            </div>
            <p className="new-chat-modal-subtitle">Selecciona el modulo y abre una conversacion sin mezclar chats entre canales.</p>

            <label className="new-chat-modal-label" htmlFor="new-chat-phone">Numero (con codigo de pais)</label>
            <input
              id="new-chat-phone"
              type="text"
              value={newChatDialog.phone}
              onChange={(event) => setNewChatDialog((prev) => ({ ...prev, phone: event.target.value, error: '' }))}
              onKeyDown={(event) => { if (event.key === 'Enter') handleConfirmNewChat(); }}
              className="new-chat-modal-input"
              placeholder="Ej: 51955123456"
              autoFocus
            />

            <label className="new-chat-modal-label" htmlFor="new-chat-module">Modulo</label>
            <select
              id="new-chat-module"
              value={newChatDialog.moduleId}
              onChange={(event) => setNewChatDialog((prev) => ({ ...prev, moduleId: event.target.value, error: '' }))}
              className="new-chat-modal-select"
              disabled={newChatAvailableModules.length === 0}
            >
              {newChatAvailableModules.length === 0 && <option value="">Sin modulos activos</option>}
              {newChatAvailableModules.map((module) => (
                <option key={`new_chat_module_${module.moduleId}`} value={module.moduleId}>
                  {module.name}
                </option>
              ))}
            </select>

            <label className="new-chat-modal-label" htmlFor="new-chat-first-message">Mensaje inicial (opcional)</label>
            <textarea
              id="new-chat-first-message"
              value={newChatDialog.firstMessage}
              onChange={(event) => setNewChatDialog((prev) => ({ ...prev, firstMessage: event.target.value, error: '' }))}
              className="new-chat-modal-textarea"
              rows={3}
              placeholder="Escribe un mensaje de apertura"
            />

            {newChatDialog.error && <div className="new-chat-modal-error">{newChatDialog.error}</div>}

            <div className="new-chat-modal-actions">
              <button type="button" className="new-chat-modal-btn new-chat-modal-btn--ghost" onClick={handleCancelNewChatDialog}>Cancelar</button>
              <button type="button" className="new-chat-modal-btn new-chat-modal-btn--primary" onClick={handleConfirmNewChat}>Iniciar chat</button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}

export default App;



