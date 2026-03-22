// Chat normalization and filtering helpers extracted from App.jsx for maintainability.

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

