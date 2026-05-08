export function normalizeMessageCacheChatId(chatId = '') {
  return String(chatId || '').trim();
}

export function getCachedMessages(cacheRef, chatId) {
  const safeChatId = normalizeMessageCacheChatId(chatId);
  if (!safeChatId || !cacheRef?.current || typeof cacheRef.current.get !== 'function') {
    return [];
  }
  const cached = cacheRef.current.get(safeChatId);
  return Array.isArray(cached) ? cached : [];
}

export function writeCachedMessages(cacheRef, chatId, messages = []) {
  const safeChatId = normalizeMessageCacheChatId(chatId);
  if (!safeChatId || !cacheRef?.current || typeof cacheRef.current.set !== 'function') {
    return [];
  }
  const safeMessages = Array.isArray(messages) ? messages : [];
  cacheRef.current.set(safeChatId, safeMessages);
  return safeMessages;
}

export function patchCachedMessages(cacheRef, chatId, updater) {
  const safeChatId = normalizeMessageCacheChatId(chatId);
  if (!safeChatId || !cacheRef?.current || typeof cacheRef.current.get !== 'function' || typeof cacheRef.current.set !== 'function') {
    return [];
  }
  const current = getCachedMessages(cacheRef, safeChatId);
  const next = typeof updater === 'function' ? updater(current) : current;
  const safeNext = Array.isArray(next) ? next : current;
  cacheRef.current.set(safeChatId, safeNext);
  return safeNext;
}

export function upsertMessageById(messages = [], nextMessage = null) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeNextMessage = nextMessage && typeof nextMessage === 'object' ? nextMessage : null;
  const nextId = String(safeNextMessage?.id || '').trim();
  if (!safeNextMessage || !nextId) return safeMessages;

  const existingIndex = safeMessages.findIndex((message) => String(message?.id || '').trim() === nextId);
  if (existingIndex < 0) {
    return [...safeMessages, safeNextMessage].sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));
  }

  const merged = [...safeMessages];
  const existingMessage = merged[existingIndex] && typeof merged[existingIndex] === 'object'
    ? merged[existingIndex]
    : {};
  const preservedClientTempId = String(safeNextMessage?.clientTempId || existingMessage?.clientTempId || '').trim() || null;
  merged[existingIndex] = { ...existingMessage, ...safeNextMessage, clientTempId: preservedClientTempId };
  return merged;
}

export function replaceMessageByClientTempId(messages = [], clientTempId = '', serverMessage = null) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeClientTempId = String(clientTempId || '').trim();
  const safeServerMessage = serverMessage && typeof serverMessage === 'object' ? serverMessage : null;
  if (!safeClientTempId || !safeServerMessage) return safeMessages;

  const existingIndex = safeMessages.findIndex((message) => String(message?.clientTempId || '').trim() === safeClientTempId);
  if (existingIndex < 0) {
    return upsertMessageById(safeMessages, safeServerMessage);
  }

  const next = [...safeMessages];
  const existingMessage = next[existingIndex] && typeof next[existingIndex] === 'object'
    ? next[existingIndex]
    : {};
  const preservedClientTempId = String(safeServerMessage?.clientTempId || existingMessage?.clientTempId || '').trim() || null;
  next[existingIndex] = { ...existingMessage, ...safeServerMessage, clientTempId: preservedClientTempId };
  return next;
}
