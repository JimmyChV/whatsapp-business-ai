import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  chatIdsReferSameScope as chatIdsReferSameScopeFallback,
  normalizeChatScopedId as normalizeChatScopedIdFallback
} from '../helpers/appChat.helpers';

const asText = (value = '') => String(value || '').trim();
const asScope = (value = '') => String(value || '').trim().toLowerCase();

const normalizeAssignmentRecord = (assignment = null, fallbackChatId = '', fallbackScopeModuleId = '') => {
  if (!assignment || typeof assignment !== 'object') return null;
  const normalizedChatId = asText(assignment.chatId || fallbackChatId);
  if (!normalizedChatId) return null;

  const normalizedScopeModuleId = asScope(assignment.scopeModuleId || fallbackScopeModuleId);

  return {
    ...assignment,
    chatId: normalizedChatId,
    scopeModuleId: normalizedScopeModuleId,
    assigneeUserId: asText(assignment.assigneeUserId || ''),
    assignedByUserId: asText(assignment.assignedByUserId || ''),
    assigneeRole: asScope(assignment.assigneeRole || ''),
    assignmentMode: asScope(assignment.assignmentMode || ''),
    assignmentReason: asText(assignment.assignmentReason || ''),
    status: asScope(assignment.status || 'active') || 'active'
  };
};

export default function useChatAssignmentState({
  socket,
  activeChatId,
  normalizeChatScopedId = normalizeChatScopedIdFallback,
  chatIdsReferSameScope = chatIdsReferSameScopeFallback,
  currentUserId = ''
} = {}) {
  const [assignmentsByChatId, setAssignmentsByChatId] = useState({});
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [takeChatPendingByChatId, setTakeChatPendingByChatId] = useState({});
  const [lastTakeChatResult, setLastTakeChatResult] = useState(null);

  const resolveAssignmentKey = useCallback((chatId = '', scopeModuleId = '') => {
    const safeChatId = asText(chatId);
    if (!safeChatId) return '';
    return normalizeChatScopedId(safeChatId, asScope(scopeModuleId));
  }, [normalizeChatScopedId]);

  const putAssignment = useCallback((chatId = '', scopeModuleId = '', assignment = null) => {
    const key = resolveAssignmentKey(chatId, scopeModuleId);
    const normalizedAssignment = normalizeAssignmentRecord(assignment, chatId, scopeModuleId);
    if (!key || !normalizedAssignment) return;
    setAssignmentsByChatId((prev) => ({ ...prev, [key]: normalizedAssignment }));
  }, [resolveAssignmentKey]);

  const clearTakePending = useCallback((chatId = '', scopeModuleId = '') => {
    const key = resolveAssignmentKey(chatId, scopeModuleId);
    if (!key) return;
    setTakeChatPendingByChatId((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [resolveAssignmentKey]);

  const getAssignment = useCallback((chatId = '') => {
    const safeChatId = asText(chatId);
    if (!safeChatId) return null;

    const directKey = resolveAssignmentKey(safeChatId, '');
    if (directKey && assignmentsByChatId[directKey]) {
      return assignmentsByChatId[directKey];
    }

    const keys = Object.keys(assignmentsByChatId);
    for (const key of keys) {
      if (chatIdsReferSameScope(key, safeChatId)) {
        return assignmentsByChatId[key];
      }
    }
    return null;
  }, [assignmentsByChatId, resolveAssignmentKey, chatIdsReferSameScope]);

  const activeChatAssignment = useMemo(
    () => getAssignment(activeChatId),
    [getAssignment, activeChatId]
  );

  const takeChat = useCallback((chatId = '', options = {}) => {
    if (!socket || typeof socket.emit !== 'function') return false;
    const safeChatId = asText(chatId || activeChatId);
    if (!safeChatId) return false;

    const safeScopeModuleId = asScope(options.scopeModuleId || '');
    const requestChatId = resolveAssignmentKey(safeChatId, safeScopeModuleId) || safeChatId;
    setTakeChatPendingByChatId((prev) => ({ ...prev, [requestChatId]: true }));

    socket.emit('take_chat', {
      chatId: requestChatId,
      scopeModuleId: safeScopeModuleId || undefined,
      assignmentReason: asText(options.assignmentReason || 'manual_take'),
      metadata: options.metadata && typeof options.metadata === 'object' ? options.metadata : {}
    });

    return true;
  }, [socket, activeChatId, resolveAssignmentKey]);

  const isAssignedToMe = useCallback((chatId = '') => {
    const assignment = getAssignment(chatId || activeChatId);
    const assigneeUserId = asText(assignment?.assigneeUserId || '');
    if (!assigneeUserId) return false;
    return assigneeUserId === asText(currentUserId || '');
  }, [getAssignment, activeChatId, currentUserId]);

  useEffect(() => {
    if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') return undefined;

    const handleBulkSnapshot = (payload = {}) => {
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const nextMap = {};
      items.forEach((item) => {
        const normalizedItem = normalizeAssignmentRecord(item, item?.chatId, item?.scopeModuleId);
        if (!normalizedItem?.chatId) return;
        const key = resolveAssignmentKey(normalizedItem.chatId, normalizedItem.scopeModuleId);
        if (!key) return;
        nextMap[key] = normalizedItem;
      });
      setAssignmentsByChatId(nextMap);
      setAssignmentsLoaded(true);
    };

    const handleAssignmentUpdated = (payload = {}) => {
      const incomingChatId = asText(payload?.chatId || payload?.assignment?.chatId || '');
      const incomingScopeModuleId = asScope(payload?.scopeModuleId || payload?.assignment?.scopeModuleId || '');
      const nextAssignment = normalizeAssignmentRecord(payload?.assignment, incomingChatId, incomingScopeModuleId);

      if (!incomingChatId && !nextAssignment?.chatId) return;
      const targetChatId = nextAssignment?.chatId || incomingChatId;
      const targetScopeModuleId = nextAssignment?.scopeModuleId || incomingScopeModuleId;
      const key = resolveAssignmentKey(targetChatId, targetScopeModuleId);
      if (!key) return;

      if (!nextAssignment) {
        setAssignmentsByChatId((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        setAssignmentsByChatId((prev) => ({ ...prev, [key]: nextAssignment }));
      }

      clearTakePending(targetChatId, targetScopeModuleId);
    };

    const handleTakeResult = (payload = {}) => {
      setLastTakeChatResult(payload);
      const incomingChatId = asText(payload?.chatId || payload?.baseChatId || payload?.assignment?.chatId || '');
      const incomingScopeModuleId = asScope(payload?.scopeModuleId || payload?.assignment?.scopeModuleId || '');
      clearTakePending(incomingChatId, incomingScopeModuleId);
      if (payload?.ok === true && payload?.assignment) {
        putAssignment(incomingChatId, incomingScopeModuleId, payload.assignment);
      }
    };

    socket.on('chat_assignment_bulk_snapshot', handleBulkSnapshot);
    socket.on('chat_assignment_updated', handleAssignmentUpdated);
    socket.on('chat_assignment_take_result', handleTakeResult);

    return () => {
      socket.off('chat_assignment_bulk_snapshot', handleBulkSnapshot);
      socket.off('chat_assignment_updated', handleAssignmentUpdated);
      socket.off('chat_assignment_take_result', handleTakeResult);
    };
  }, [socket, resolveAssignmentKey, putAssignment, clearTakePending]);

  return {
    assignmentsByChatId,
    assignmentsLoaded,
    activeChatAssignment,
    currentUserId: asText(currentUserId || ''),
    getAssignment,
    isAssignedToMe,
    takeChat,
    takeChatPendingByChatId,
    lastTakeChatResult
  };
}
