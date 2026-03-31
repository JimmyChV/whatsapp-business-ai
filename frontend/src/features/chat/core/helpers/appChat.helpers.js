import { API_URL } from '../../../../config/runtime';

export const normalizeCatalogItem = (item = {}, index = 0) => {
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

export const normalizeProfilePhotoUrl = (rawUrl = '') => {
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

export const normalizeModuleImageUrl = (rawUrl = '') => {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${API_URL}${value}`;
  return `${API_URL}/${value}`;
};
export const normalizeProfilePayload = (profile = null) => {
  if (!profile || typeof profile !== 'object') return null;
  return {
    ...profile,
    profilePicUrl: normalizeProfilePhotoUrl(profile.profilePicUrl)
  };
};

export const normalizeBusinessDataPayload = (data = {}) => {
  const rawCatalog = Array.isArray(data.catalog) ? data.catalog : [];
  const catalog = rawCatalog.map((item, idx) => normalizeCatalogItem(item, idx));
  return {
    profile: normalizeProfilePayload(data.profile || null),
    labels: Array.isArray(data.labels) ? data.labels : [],
    catalog,
    catalogMeta: data.catalogMeta || { source: 'local', nativeAvailable: false }
  };
};

export const normalizeWaModuleItem = (item = {}) => {
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

export const normalizeWaModules = (items = []) => {
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

export const resolveSelectedWaModule = (items = [], preferred = null) => {
  const modules = normalizeWaModules(items);
  if (!modules.length) return null;
  const preferredId = String(preferred?.moduleId || preferred?.id || '').trim().toLowerCase();
  if (preferredId) {
    const byId = modules.find((module) => module.moduleId === preferredId);
    if (byId) return byId;
  }
  return modules.find((module) => module.isSelected) || modules.find((module) => module.isDefault) || modules[0];
};
export const normalizeChatLabels = (labels = []) => (
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

export const cleanLooseText = (value = '') => String(value || '')
  .replace(/\uFFFD/g, '')
  .replace(/[\u0000-\u001F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');
export const isLikelyPhoneDigits = (digits = '') => {
  const d = normalizeDigits(digits);
  return d.length >= 8 && d.length <= 12;
};

export const CHAT_SCOPE_SEPARATOR = '::mod::';
export const normalizeScopedModuleId = (value = '') => String(value || '').trim().toLowerCase();
export const parseScopedChatId = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return { baseChatId: '', scopeModuleId: '' };
  const idx = raw.lastIndexOf(CHAT_SCOPE_SEPARATOR);
  if (idx < 0) return { baseChatId: raw, scopeModuleId: '' };
  const baseChatId = String(raw.slice(0, idx) || '').trim();
  const scopeModuleId = normalizeScopedModuleId(raw.slice(idx + CHAT_SCOPE_SEPARATOR.length));
  if (!baseChatId || !scopeModuleId) return { baseChatId: raw, scopeModuleId: '' };
  return { baseChatId, scopeModuleId };
};
export const buildScopedChatId = (baseChatId = '', scopeModuleId = '') => {
  const base = String(baseChatId || '').trim();
  const scope = normalizeScopedModuleId(scopeModuleId);
  if (!base || !scope) return base;
  return `${base}${CHAT_SCOPE_SEPARATOR}${scope}`;
};
export const normalizeChatScopedId = (chatId = '', fallbackModuleId = '') => {
  const parsed = parseScopedChatId(chatId);
  const base = String(parsed.baseChatId || chatId || '').trim();
  const scope = parsed.scopeModuleId || normalizeScopedModuleId(fallbackModuleId);
  return buildScopedChatId(base, scope) || base;
};
export const chatIdsReferSameScope = (left = '', right = '') => {
  const l = parseScopedChatId(left);
  const r = parseScopedChatId(right);
  const leftBase = String(l.baseChatId || left || '').trim();
  const rightBase = String(r.baseChatId || right || '').trim();
  if (!leftBase || !rightBase) return false;
  if (leftBase !== rightBase) return false;
  return String(l.scopeModuleId || '') === String(r.scopeModuleId || '');
};
export const extractPhoneFromText = (value = '') => {
  const text = String(value || '');
  if (!text) return null;
  const matches = text.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
  for (const token of matches) {
    const digits = normalizeDigits(token);
    if (isLikelyPhoneDigits(digits)) return digits;
  }
  return null;
};

export const getBestChatPhone = (chat = {}) => {
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

export const repairMojibake = (value = '') => {
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

export const sanitizeDisplayText = (value = '') => repairMojibake(value)
  .replace(/[\u0000-\u001F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const normalizeMessageFilename = (value = '') => {
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

export const isGenericFilename = (value = '') => {
  const base = String(value || '').trim().toLowerCase().replace(/\.[a-z0-9]{1,8}$/i, '');
  if (!base) return true;
  return ['archivo', 'file', 'adjunto', 'attachment', 'document', 'documento', 'media', 'download', 'descarga', 'unknown'].includes(base);
};

export const isMachineLikeFilename = (value = '') => {
  const base = String(value || '').trim().replace(/\.[a-z0-9]{1,8}$/i, '').replace(/\s+/g, '');
  if (!base) return true;
  if (/^\d{8,}$/.test(base)) return true;
  if (/^[a-f0-9]{16,}$/i.test(base)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) return true;
  if (/^3EB0[A-F0-9]{8,}$/i.test(base)) return true;
  return false;
};

export const normalizeParticipantList = (participants = []) => {
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

export const normalizeMessageLocation = (location = null) => {
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

export const normalizeQuotedMessage = (quoted = null) => {
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
export const getMessagePreviewText = (msg = {}) => {
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
export const isInternalIdentifier = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  return text.includes('@') || /^\d{14,}$/.test(text);
};

export const normalizeDisplayNameKey = (value = '') => sanitizeDisplayText(value)
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export const isPlaceholderChat = (chat = {}) => {
  const ts = Number(chat?.timestamp || 0);
  const lastMessage = sanitizeDisplayText(chat?.lastMessage || '');
  return ts <= 0 && !lastMessage;
};

export const chatIdentityKey = (chat = {}) => {
  const scopedId = normalizeChatScopedId(
    chat?.id || '',
    chat?.scopeModuleId || chat?.lastMessageModuleId || ''
  );
  if (scopedId) return `id:${scopedId}`;
  const phone = getBestChatPhone(chat);
  if (phone) return `phone:${phone}`;
  return 'id:';
};

export const dedupeChats = (list = []) => {
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

export const chatMatchesQuery = (chat = {}, query = '') => {
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
export const normalizeFilterToken = (value = '') => String(value || '').trim().toLowerCase();

export const normalizeChatFilters = (filters = {}) => {
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
    onlyAssignedToMe: Boolean(filters?.onlyAssignedToMe),
    assigneeUserId: String(filters?.assigneeUserId || '').trim(),
    contactMode,
    archivedMode,
    pinnedMode,
  };
};

export const buildFiltersKey = (filters = {}) => {
  const normalized = normalizeChatFilters(filters);
  return JSON.stringify({
    ...normalized,
    labelTokens: [...normalized.labelTokens].sort(),
  });
};

export const chatLabelTokenSet = (chat = {}) => {
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

export const chatMatchesFilters = (chat = {}, filters = {}) => {
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
export const normalizeQuickReplyDraft = (value = null) => {
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

export const isVisibleChatId = (chatId = '') => {
  const id = String(chatId || '');
  if (!id) return false;
  if (id.includes('status@broadcast')) return false;
  if (id.endsWith('@broadcast')) return false;
  return true;
};

export const upsertAndSortChat = (list = [], incoming = null) => {
  if (!incoming?.id) return list;
  const incomingKey = chatIdentityKey(incoming);
  const without = list.filter((c) => c.id !== incoming.id && chatIdentityKey(c) !== incomingKey);
  const merged = [incoming, ...without].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return dedupeChats(merged);
};

export const CHAT_PAGE_SIZE = 80;
export const TRANSPORT_STORAGE_KEY = 'wa_transport_mode';
