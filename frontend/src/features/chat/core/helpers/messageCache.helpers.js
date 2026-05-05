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

function getTimestampValue(message = null) {
  const timestamp = Number(message?.timestamp || 0);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function insertMessageSorted(messages = [], nextMessage = null) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeNextMessage = nextMessage && typeof nextMessage === 'object' ? nextMessage : null;
  if (!safeNextMessage) return safeMessages;
  if (safeMessages.length === 0) return [safeNextMessage];

  const nextTimestamp = getTimestampValue(safeNextMessage);
  const lastTimestamp = getTimestampValue(safeMessages[safeMessages.length - 1]);
  if (nextTimestamp >= lastTimestamp) {
    return [...safeMessages, safeNextMessage];
  }

  const firstTimestamp = getTimestampValue(safeMessages[0]);
  if (nextTimestamp <= firstTimestamp) {
    return [safeNextMessage, ...safeMessages];
  }

  let insertAt = safeMessages.length;
  for (let idx = safeMessages.length - 1; idx >= 0; idx -= 1) {
    if (getTimestampValue(safeMessages[idx]) <= nextTimestamp) {
      insertAt = idx + 1;
      break;
    }
  }

  return [
    ...safeMessages.slice(0, insertAt),
    safeNextMessage,
    ...safeMessages.slice(insertAt)
  ];
}

export function upsertMessageById(messages = [], nextMessage = null) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeNextMessage = nextMessage && typeof nextMessage === 'object' ? nextMessage : null;
  const nextId = String(safeNextMessage?.id || '').trim();
  if (!safeNextMessage || !nextId) return safeMessages;

  const existingIndex = safeMessages.findIndex((message) => String(message?.id || '').trim() === nextId);
  if (existingIndex < 0) {
    return insertMessageSorted(safeMessages, safeNextMessage);
  }

  const merged = [...safeMessages];
  const previousMessage = merged[existingIndex] || {};
  const mergedMessage = { ...previousMessage, ...safeNextMessage };
  const previousTimestamp = getTimestampValue(previousMessage);
  const nextTimestamp = getTimestampValue(mergedMessage);
  merged[existingIndex] = mergedMessage;
  if (previousTimestamp === nextTimestamp) {
    return merged;
  }
  const withoutCurrent = [...merged.slice(0, existingIndex), ...merged.slice(existingIndex + 1)];
  return insertMessageSorted(withoutCurrent, mergedMessage);
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
  const previousMessage = next[existingIndex] || {};
  const mergedMessage = { ...previousMessage, ...safeServerMessage };
  const previousTimestamp = getTimestampValue(previousMessage);
  const nextTimestamp = getTimestampValue(mergedMessage);
  next[existingIndex] = mergedMessage;
  if (previousTimestamp === nextTimestamp) {
    return next;
  }
  const withoutCurrent = [...next.slice(0, existingIndex), ...next.slice(existingIndex + 1)];
  return insertMessageSorted(withoutCurrent, mergedMessage);
}
