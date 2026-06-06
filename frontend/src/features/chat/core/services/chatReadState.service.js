import { API_URL } from '../../../../config/runtime';

const trimText = (value = '') => String(value || '').trim();
const CHAT_SCOPE_SEPARATOR = '::mod::';

function parseChatIdentity(value = '') {
  const raw = trimText(value);
  if (!raw) return { baseChatId: '', scopeModuleId: '' };
  const idx = raw.lastIndexOf(CHAT_SCOPE_SEPARATOR);
  if (idx < 0) return { baseChatId: raw, scopeModuleId: '' };
  const baseChatId = trimText(raw.slice(0, idx));
  const scopeModuleId = trimText(raw.slice(idx + CHAT_SCOPE_SEPARATOR.length)).toLowerCase();
  if (!baseChatId || !scopeModuleId) return { baseChatId: raw, scopeModuleId: '' };
  return { baseChatId, scopeModuleId };
}

function chatIdsReferSameConversation(left = '', right = '') {
  const leftBase = parseChatIdentity(left).baseChatId;
  const rightBase = parseChatIdentity(right).baseChatId;
  return Boolean(leftBase && rightBase && leftBase === rightBase);
}

export async function markChatsRead({
  baseApiUrl = API_URL,
  buildApiHeaders = null,
  tenantId = '',
  chatIds = []
} = {}) {
  if (typeof buildApiHeaders !== 'function') {
    throw new Error('Sesion no disponible para marcar el chat como leido.');
  }

  const safeChatIds = (Array.isArray(chatIds) ? chatIds : [chatIds])
    .map((entry) => (entry && typeof entry === 'object' && !Array.isArray(entry)
      ? entry
      : { chatId: entry }))
    .filter((entry) => trimText(entry?.chatId || entry?.baseChatId || entry?.id || ''));
  if (!safeChatIds.length) return { ok: true, items: [] };

  const headers = { ...(buildApiHeaders({ includeJson: true }) || {}) };
  const cleanTenantId = trimText(tenantId);
  if (cleanTenantId) headers['x-tenant-id'] = cleanTenantId;

  const response = await fetch(`${String(baseApiUrl || API_URL || '').replace(/\/$/, '')}/api/tenant/chats/bulk/mark-read`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ chatIds: safeChatIds })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || 'No se pudo marcar el chat como leido.'));
  }
  return payload;
}

export function applyReadItemsToChats(chats = [], items = [], chatIdsReferSameScope = null) {
  const safeItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      chatId: trimText(item?.chatId || item?.baseChatId || ''),
      baseChatId: trimText(item?.baseChatId || '')
    }))
    .filter((item) => item.chatId || item.baseChatId);
  if (!safeItems.length) return chats;

  return (Array.isArray(chats) ? chats : []).map((chat) => {
    const chatId = trimText(chat?.id || '');
    const baseChatId = trimText(chat?.baseChatId || parseChatIdentity(chatId).baseChatId || '');
    const match = safeItems.find((item) => {
      if (typeof chatIdsReferSameScope === 'function' && item.chatId && chatId && chatIdsReferSameScope(chatId, item.chatId)) {
        return true;
      }
      if (item.chatId && chatId && chatIdsReferSameConversation(chatId, item.chatId)) {
        return true;
      }
      return item.chatId === chatId
        || item.baseChatId === baseChatId
        || item.baseChatId === chatId
        || item.chatId === baseChatId;
    });
    if (!match) return chat;
    return {
      ...chat,
      unreadCount: 0,
      manuallyMarkedUnread: false,
      manuallyMarkedUnreadAt: null
    };
  });
}
