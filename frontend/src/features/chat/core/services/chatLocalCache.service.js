const DB_NAME = 'wa-saas-cache';
const DB_VERSION = 1;
const CHAT_STORE = 'chats';
const MESSAGE_STORE = 'messages';
const META_STORE = 'meta';
const MAX_MESSAGES_PER_CHAT = 50;
let _cryptoKey = null;

function getIndexedDb() {
  if (typeof window === 'undefined') return null;
  return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || null;
}

function getKeyRange() {
  if (typeof window === 'undefined') return null;
  return window.IDBKeyRange || window.webkitIDBKeyRange || null;
}

function getCrypto() {
  if (typeof window === 'undefined') return null;
  return window.crypto?.subtle ? window.crypto : null;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value = '') {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(accessToken) {
  const cryptoApi = getCrypto();
  const safeToken = String(accessToken || '').trim();
  if (!cryptoApi || !safeToken) return null;

  const encoder = new TextEncoder();
  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    encoder.encode(safeToken.slice(0, 32)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('wa-saas-cache-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(data, key) {
  const cryptoApi = getCrypto();
  if (!cryptoApi || !key) return null;
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64(combined);
}

async function decrypt(encryptedData, key) {
  try {
    if (!key || !encryptedData) return null;
    const cryptoApi = getCrypto();
    if (!cryptoApi) return null;
    const combined = base64ToBytes(encryptedData);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (_error) {
    return null;
  }
}

async function maybeEncryptRecord(payload, publicFields = {}) {
  if (!_cryptoKey) return { ...payload, ...publicFields };
  const encryptedData = await encrypt(payload, _cryptoKey);
  if (!encryptedData) throw new Error('Unable to encrypt chat cache record');
  return { ...publicFields, encryptedData };
}

async function maybeDecryptRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (!record.encryptedData) return record;
  return decrypt(record.encryptedData, _cryptoKey);
}

function toTimestamp(value) {
  const numeric = Number(value || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeChat(chat = {}) {
  const id = String(chat?.id || chat?.chatId || '').trim();
  if (!id) return null;
  return {
    ...chat,
    id,
    name: String(chat?.name || ''),
    phone: String(chat?.phone || ''),
    subtitle: String(chat?.subtitle || ''),
    timestamp: toTimestamp(chat?.timestamp || chat?.lastMessageAt || chat?.updatedAt),
    lastMessage: chat?.lastMessage || chat?.lastMessageBody || '',
    labels: Array.isArray(chat?.labels) ? chat.labels : [],
    unreadCount: Number(chat?.unreadCount || 0) || 0,
    lastCustomerMessageAt: chat?.lastCustomerMessageAt || null,
    adOrigin: chat?.adOrigin && typeof chat.adOrigin === 'object' ? chat.adOrigin : null,
    cachedAt: Date.now()
  };
}

function normalizeMessage(chatId, message = {}) {
  const messageId = String(message?.messageId || message?.id || message?.clientTempId || '').trim();
  const safeChatId = String(chatId || message?.chatId || '').trim();
  if (!messageId || !safeChatId) return null;
  const timestamp = toTimestamp(message?.timestamp || message?.createdAt || message?.created_at);
  return {
    ...message,
    messageId,
    id: String(message?.id || messageId),
    chatId: safeChatId,
    body: String(message?.body || message?.text || ''),
    fromMe: Boolean(message?.fromMe ?? message?.from_me),
    messageType: String(message?.messageType || message?.type || message?.message_type || 'chat'),
    timestamp,
    createdAt: timestamp || Date.now(),
    cachedAt: Date.now()
  };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function openDB() {
  const indexedDb = getIndexedDb();
  if (!indexedDb) return null;

  try {
    return await new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CHAT_STORE)) {
          db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
          const messageStore = db.createObjectStore(MESSAGE_STORE, { keyPath: 'messageId' });
          messageStore.createIndex('chatId', 'chatId', { unique: false });
          messageStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    });
  } catch (_error) {
    return null;
  }
}

export async function init(accessToken = '') {
  try {
    _cryptoKey = await deriveKey(accessToken);
    return Boolean(_cryptoKey);
  } catch (_error) {
    _cryptoKey = null;
    return false;
  }
}

export async function saveChats(chats = []) {
  const safeChats = (Array.isArray(chats) ? chats : []).map(normalizeChat).filter(Boolean);
  if (safeChats.length === 0) return [];

  try {
    const records = await Promise.all(safeChats.map((chat) => maybeEncryptRecord(chat, {
      id: chat.id,
      timestamp: chat.timestamp,
      cachedAt: chat.cachedAt
    })));
    const db = await openDB();
    if (!db) return [];
    const tx = db.transaction(CHAT_STORE, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(CHAT_STORE);
    records.forEach((record) => store.put(record));
    await done;
    db.close();
    return safeChats;
  } catch (_error) {
    return [];
  }
}

export async function getChats() {
  try {
    const db = await openDB();
    if (!db) return [];
    const tx = db.transaction(CHAT_STORE, 'readonly');
    const store = tx.objectStore(CHAT_STORE);
    const records = await requestToPromise(store.getAll());
    db.close();
    const chats = await Promise.all((Array.isArray(records) ? records : []).map(maybeDecryptRecord));
    if (chats.some((chat) => !chat)) {
      await clearAll();
      return [];
    }
    return chats.sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
  } catch (_error) {
    return [];
  }
}

async function pruneMessagesForChat(db, chatId) {
  const keyRange = getKeyRange();
  if (!keyRange) return;

  const readTx = db.transaction(MESSAGE_STORE, 'readonly');
  const index = readTx.objectStore(MESSAGE_STORE).index('chatId');
  const request = index.getAll(keyRange.only(chatId));
  const messages = await requestToPromise(request);
  const sorted = (Array.isArray(messages) ? messages : [])
    .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
  const removable = sorted.slice(MAX_MESSAGES_PER_CHAT);
  if (removable.length === 0) return;

  const writeTx = db.transaction(MESSAGE_STORE, 'readwrite');
  const done = transactionDone(writeTx);
  const store = writeTx.objectStore(MESSAGE_STORE);
  removable.forEach((message) => {
    const messageId = String(message?.messageId || '').trim();
    if (messageId) store.delete(messageId);
  });
  await done;
}

export async function saveMessages(chatId = '', messages = []) {
  const safeChatId = String(chatId || '').trim();
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .map((message) => normalizeMessage(safeChatId, message))
    .filter(Boolean);
  if (!safeChatId || safeMessages.length === 0) return [];

  try {
    const records = await Promise.all(safeMessages.map((message) => maybeEncryptRecord(message, {
      messageId: message.messageId,
      chatId: message.chatId,
      createdAt: message.createdAt,
      timestamp: message.timestamp,
      cachedAt: message.cachedAt
    })));
    const db = await openDB();
    if (!db) return [];
    const tx = db.transaction(MESSAGE_STORE, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(MESSAGE_STORE);
    records.forEach((record) => store.put(record));
    await done;
    await pruneMessagesForChat(db, safeChatId);
    db.close();
    return safeMessages;
  } catch (_error) {
    return [];
  }
}

export async function getMessages(chatId = '') {
  const safeChatId = String(chatId || '').trim();
  if (!safeChatId) return [];

  try {
    const db = await openDB();
    const keyRange = getKeyRange();
    if (!db || !keyRange) return [];
    const tx = db.transaction(MESSAGE_STORE, 'readonly');
    const store = tx.objectStore(MESSAGE_STORE);
    const index = store.index('chatId');
    const records = await requestToPromise(index.getAll(keyRange.only(safeChatId)));
    db.close();
    const messages = await Promise.all((Array.isArray(records) ? records : []).map(maybeDecryptRecord));
    if (messages.some((message) => !message)) {
      await clearAll();
      return [];
    }
    return messages
      .sort((a, b) => Number(a?.timestamp || a?.createdAt || 0) - Number(b?.timestamp || b?.createdAt || 0));
  } catch (_error) {
    return [];
  }
}

export async function saveMeta(key = '', value = null) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;

  try {
    const payload = { key: safeKey, value, cachedAt: Date.now() };
    const record = await maybeEncryptRecord(payload, { key: safeKey, cachedAt: payload.cachedAt });
    const db = await openDB();
    if (!db) return null;
    const tx = db.transaction(META_STORE, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(META_STORE).put(record);
    await done;
    db.close();
    return value;
  } catch (_error) {
    return null;
  }
}

export async function getMeta(key = '') {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;

  try {
    const db = await openDB();
    if (!db) return null;
    const tx = db.transaction(META_STORE, 'readonly');
    const record = await requestToPromise(tx.objectStore(META_STORE).get(safeKey));
    db.close();
    const decrypted = await maybeDecryptRecord(record);
    if (record && !decrypted) {
      await clearAll();
      return null;
    }
    return decrypted?.value ?? null;
  } catch (_error) {
    return null;
  }
}

export async function clearAll() {
  _cryptoKey = null;
  try {
    const db = await openDB();
    if (!db) return false;
    const tx = db.transaction([CHAT_STORE, MESSAGE_STORE, META_STORE], 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(CHAT_STORE).clear();
    tx.objectStore(MESSAGE_STORE).clear();
    tx.objectStore(META_STORE).clear();
    await done;
    db.close();
    return true;
  } catch (_error) {
    return false;
  }
}

export default {
  init,
  openDB,
  saveChats,
  getChats,
  saveMessages,
  getMessages,
  saveMeta,
  getMeta,
  clearAll
};
