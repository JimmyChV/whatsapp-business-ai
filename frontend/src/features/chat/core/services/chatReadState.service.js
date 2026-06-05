import { API_URL } from '../../../../config/runtime';

const trimText = (value = '') => String(value || '').trim();

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
    const baseChatId = trimText(chat?.baseChatId || '');
    const match = safeItems.find((item) => {
      if (typeof chatIdsReferSameScope === 'function' && item.chatId && chatId && chatIdsReferSameScope(chatId, item.chatId)) {
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
