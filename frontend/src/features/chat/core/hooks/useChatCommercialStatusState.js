import { useCallback, useEffect, useMemo, useState } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import {
  chatIdsReferSameScope as chatIdsReferSameScopeFallback,
  normalizeChatScopedId as normalizeChatScopedIdFallback,
  parseScopedChatId as parseScopedChatIdFallback
} from '../helpers/appChat.helpers';

const asText = (value = '') => String(value || '').trim();
const asScope = (value = '') => String(value || '').trim().toLowerCase();

const normalizeCommercialStatusRecord = (status = null, fallbackChatId = '', fallbackScopeModuleId = '') => {
  if (!status || typeof status !== 'object') return null;
  const normalizedChatId = asText(status.chatId || fallbackChatId);
  if (!normalizedChatId) return null;

  const normalizedScopeModuleId = asScope(status.scopeModuleId || fallbackScopeModuleId);

  return {
    ...status,
    chatId: normalizedChatId,
    scopeModuleId: normalizedScopeModuleId,
    status: asScope(status.status || 'nuevo') || 'nuevo',
    source: asScope(status.source || 'system') || 'system',
    reason: asText(status.reason || ''),
    changedByUserId: asText(status.changedByUserId || ''),
    firstCustomerMessageAt: asText(status.firstCustomerMessageAt || ''),
    firstAgentResponseAt: asText(status.firstAgentResponseAt || ''),
    quotedAt: asText(status.quotedAt || ''),
    soldAt: asText(status.soldAt || ''),
    lostAt: asText(status.lostAt || ''),
    lastTransitionAt: asText(status.lastTransitionAt || ''),
    updatedAt: asText(status.updatedAt || ''),
    createdAt: asText(status.createdAt || '')
  };
};

const MANUAL_ALLOWED_STATUSES = new Set(['vendido', 'perdido']);

export default function useChatCommercialStatusState({
  socket,
  activeChatId,
  baseApiUrl = '',
  buildApiHeaders = null,
  activeTenantId = '',
  normalizeChatScopedId = normalizeChatScopedIdFallback,
  parseScopedChatId = parseScopedChatIdFallback,
  chatIdsReferSameScope = chatIdsReferSameScopeFallback
} = {}) {
  const { notify } = useUiFeedback();
  const [commercialStatusesByChatId, setCommercialStatusesByChatId] = useState({});
  const [statusesLoaded, setStatusesLoaded] = useState(false);

  const resolveCommercialStatusKey = useCallback((chatId = '', scopeModuleId = '') => {
    const safeChatId = asText(chatId);
    if (!safeChatId) return '';
    return normalizeChatScopedId(safeChatId, asScope(scopeModuleId));
  }, [normalizeChatScopedId]);

  const putCommercialStatus = useCallback((chatId = '', scopeModuleId = '', status = null) => {
    const key = resolveCommercialStatusKey(chatId, scopeModuleId);
    const normalizedStatus = normalizeCommercialStatusRecord(status, chatId, scopeModuleId);
    if (!key || !normalizedStatus) return;
    setCommercialStatusesByChatId((prev) => ({ ...prev, [key]: normalizedStatus }));
  }, [resolveCommercialStatusKey]);

  const getCommercialStatus = useCallback((chatId = '') => {
    const safeChatId = asText(chatId);
    if (!safeChatId) return null;

    const directKey = resolveCommercialStatusKey(safeChatId, '');
    if (directKey && commercialStatusesByChatId[directKey]) {
      return commercialStatusesByChatId[directKey];
    }

    const parsedSafe = parseScopedChatId(safeChatId);
    const baseChatId = asText(parsedSafe?.baseChatId || safeChatId);
    if (baseChatId) {
      const baseKey = resolveCommercialStatusKey(baseChatId, '');
      if (baseKey && commercialStatusesByChatId[baseKey]) {
        return commercialStatusesByChatId[baseKey];
      }
    }

    const keys = Object.keys(commercialStatusesByChatId);
    let baseFallback = null;
    for (const key of keys) {
      if (chatIdsReferSameScope(key, safeChatId)) {
        return commercialStatusesByChatId[key];
      }
      if (!baseChatId) continue;
      const keyBase = asText(parseScopedChatId(key)?.baseChatId || key);
      if (keyBase === baseChatId && !baseFallback) {
        baseFallback = commercialStatusesByChatId[key];
      }
    }
    return baseFallback || null;
  }, [commercialStatusesByChatId, resolveCommercialStatusKey, parseScopedChatId, chatIdsReferSameScope]);

  const activeCommercialStatus = useMemo(
    () => getCommercialStatus(activeChatId),
    [getCommercialStatus, activeChatId]
  );

  const setManualCommercialStatus = useCallback(async (chatId = '', status = '') => {
    const safeStatus = asScope(status);
    if (!MANUAL_ALLOWED_STATUSES.has(safeStatus)) {
      notify({
        type: 'warn',
        message: 'Estado comercial invalido. Solo permitido: vendido o perdido.'
      });
      return { ok: false, error: 'invalid_status' };
    }

    const safeChatId = asText(chatId || activeChatId);
    if (!safeChatId) {
      notify({ type: 'warn', message: 'Selecciona un chat valido para actualizar el estado comercial.' });
      return { ok: false, error: 'invalid_chat' };
    }

    const parsed = parseScopedChatId(safeChatId);
    const baseChatId = asText(parsed?.baseChatId || safeChatId);
    const scopeModuleId = asScope(parsed?.scopeModuleId || '');
    if (!baseApiUrl || !baseChatId) {
      notify({ type: 'error', message: 'No se pudo resolver el endpoint para actualizar estado comercial.' });
      return { ok: false, error: 'missing_endpoint' };
    }

    const headers = typeof buildApiHeaders === 'function' ? (buildApiHeaders() || {}) : {};
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (activeTenantId) {
      requestHeaders['x-tenant-id'] = String(activeTenantId).trim();
    }

    try {
      const response = await fetch(
        `${String(baseApiUrl || '').replace(/\/$/, '')}/api/tenant/chats/${encodeURIComponent(baseChatId)}/commercial-status`,
        {
          method: 'PUT',
          headers: requestHeaders,
          body: JSON.stringify({
            status: safeStatus,
            scopeModuleId: scopeModuleId || ''
          })
        }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.ok === false) {
        const detail = asText(payload?.error || payload?.message || `HTTP ${response.status}`);
        notify({ type: 'error', message: detail || 'No se pudo actualizar el estado comercial.' });
        return { ok: false, error: detail || 'request_failed' };
      }

      const nextStatus = normalizeCommercialStatusRecord(payload?.commercialStatus, baseChatId, scopeModuleId);
      if (nextStatus) {
        putCommercialStatus(baseChatId, scopeModuleId, nextStatus);
      }
      notify({
        type: 'info',
        message: `Estado comercial actualizado a ${safeStatus.replace('_', ' ')}.`
      });
      return { ok: true, status: nextStatus, changed: payload?.changed !== false };
    } catch (error) {
      const detail = asText(error?.message || 'No se pudo actualizar el estado comercial.');
      notify({ type: 'error', message: detail });
      return { ok: false, error: detail };
    }
  }, [activeChatId, parseScopedChatId, baseApiUrl, buildApiHeaders, activeTenantId, putCommercialStatus, notify]);

  useEffect(() => {
    if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') return undefined;

    const handleBulkSnapshot = (payload = {}) => {
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const nextMap = {};
      items.forEach((item) => {
        const normalizedStatus = normalizeCommercialStatusRecord(item, item?.chatId, item?.scopeModuleId);
        if (!normalizedStatus?.chatId) return;
        const key = resolveCommercialStatusKey(normalizedStatus.chatId, normalizedStatus.scopeModuleId);
        if (!key) return;
        nextMap[key] = normalizedStatus;
      });
      setCommercialStatusesByChatId(nextMap);
      setStatusesLoaded(true);
    };

    const handleCommercialStatusUpdated = (payload = {}) => {
      const incomingChatId = asText(payload?.chatId || payload?.status?.chatId || '');
      const incomingScopeModuleId = asScope(payload?.scopeModuleId || payload?.status?.scopeModuleId || '');
      const nextStatus = normalizeCommercialStatusRecord(payload?.status, incomingChatId, incomingScopeModuleId);
      if (!incomingChatId && !nextStatus?.chatId) return;
      const targetChatId = nextStatus?.chatId || incomingChatId;
      const targetScopeModuleId = nextStatus?.scopeModuleId || incomingScopeModuleId;
      const key = resolveCommercialStatusKey(targetChatId, targetScopeModuleId);
      if (!key || !nextStatus) return;
      setCommercialStatusesByChatId((prev) => ({ ...prev, [key]: nextStatus }));
    };

    socket.on('chat_commercial_status_bulk_snapshot', handleBulkSnapshot);
    socket.on('chat_commercial_status_updated', handleCommercialStatusUpdated);

    return () => {
      socket.off('chat_commercial_status_bulk_snapshot', handleBulkSnapshot);
      socket.off('chat_commercial_status_updated', handleCommercialStatusUpdated);
    };
  }, [socket, resolveCommercialStatusKey]);

  return {
    commercialStatusesByChatId,
    statusesLoaded,
    activeCommercialStatus,
    getCommercialStatus,
    setManualCommercialStatus
  };
}
