export const CHAT_NOTIFICATION_OPEN_REQUEST_KEY = 'lavitat_chat_notification_open_request';
export const CHAT_NOTIFICATION_OPEN_EVENT = 'lavitat:chat-notification-open';

const normalizeRequest = (request = null) => {
  if (!request || typeof request !== 'object') return null;
  const tenantId = String(request?.tenantId || '').trim();
  const chatId = String(request?.chatId || '').trim();
  const moduleId = String(request?.moduleId || '').trim().toLowerCase();
  const source = String(request?.source || 'notification').trim().toLowerCase() || 'notification';
  const requestedAt = Number(request?.requestedAt || Date.now());

  if (!tenantId || !chatId) return null;

  return {
    tenantId,
    chatId,
    moduleId,
    source,
    requestedAt: Number.isFinite(requestedAt) ? requestedAt : Date.now()
  };
};

export const queueChatNotificationOpenRequest = (request = null) => {
  const normalized = normalizeRequest(request);
  if (!normalized) return null;

  try {
    window.localStorage.setItem(CHAT_NOTIFICATION_OPEN_REQUEST_KEY, JSON.stringify(normalized));
  } catch (_) {
    // ignore storage failures
  }

  try {
    window.dispatchEvent(new CustomEvent(CHAT_NOTIFICATION_OPEN_EVENT, { detail: normalized }));
  } catch (_) {
    // ignore custom event failures
  }

  return normalized;
};

export const readChatNotificationOpenRequest = () => {
  try {
    return normalizeRequest(JSON.parse(window.localStorage.getItem(CHAT_NOTIFICATION_OPEN_REQUEST_KEY) || 'null'));
  } catch (_) {
    return null;
  }
};

export const clearChatNotificationOpenRequest = () => {
  try {
    window.localStorage.removeItem(CHAT_NOTIFICATION_OPEN_REQUEST_KEY);
  } catch (_) {
    // ignore storage failures
  }
};
