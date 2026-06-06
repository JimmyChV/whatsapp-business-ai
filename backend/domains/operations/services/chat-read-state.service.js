const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');
const { assertValidTenant } = require('../../tenant/helpers/tenant-guard.helpers');
const {
    buildScopedChatId,
    normalizeScopedModuleId,
    parseScopedChatId
} = require('../../channels/helpers/chat-scope.helpers');

const HISTORY_FILE = 'message_history.json';
const presenceBySocketId = new Map();
let postgresChatReadColumnsReadyPromise = null;

function toText(value = '') {
    return String(value ?? '').trim();
}

function toTenantId(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function toBaseChatId(value = '') {
    const parsed = parseScopedChatId(value || '');
    return toText(parsed.chatId || value);
}

function toScopedModuleId(value = '') {
    return normalizeScopedModuleId(value || '');
}

function normalizeTarget({ chatId = '', baseChatId = '', scopeModuleId = '' } = {}) {
    const parsed = parseScopedChatId(chatId || baseChatId || '');
    const cleanBaseChatId = toText(baseChatId || parsed.chatId || chatId);
    const cleanScopeModuleId = toScopedModuleId(scopeModuleId || parsed.moduleId || '');
    return {
        chatId: cleanBaseChatId,
        baseChatId: cleanBaseChatId,
        scopeModuleId: cleanScopeModuleId || null,
        scopedChatId: buildScopedChatId(cleanBaseChatId, cleanScopeModuleId || '') || cleanBaseChatId
    };
}

function normalizeStateRow(tenantId = DEFAULT_TENANT_ID, target = {}, row = {}) {
    const normalizedTarget = normalizeTarget(target);
    const manualFromColumn = row?.manually_marked_unread;
    const manualFromMetadata = row?.manual_unread ?? row?.metadata?.manuallyMarkedUnread;
    const manuallyMarkedUnread = manualFromColumn === true
        || manualFromColumn === 'true'
        || manualFromMetadata === true
        || manualFromMetadata === 'true';
    const manuallyMarkedUnreadAt = toText(
        row?.manually_marked_unread_at
        || row?.manual_unread_at
        || row?.metadata?.manuallyMarkedUnreadAt
        || ''
    ) || null;
    return {
        tenantId: toTenantId(tenantId),
        chatId: normalizedTarget.scopedChatId,
        baseChatId: normalizedTarget.baseChatId,
        scopeModuleId: normalizedTarget.scopeModuleId,
        unreadCount: Math.max(0, Number(row?.unread_count || row?.unreadCount || 0) || 0),
        manuallyMarkedUnread,
        manuallyMarkedUnreadAt
    };
}

async function ensurePostgresChatReadColumns() {
    if (postgresChatReadColumnsReadyPromise) return postgresChatReadColumnsReadyPromise;

    postgresChatReadColumnsReadyPromise = Promise.resolve();

    try {
        await postgresChatReadColumnsReadyPromise;
    } catch (error) {
        postgresChatReadColumnsReadyPromise = null;
        throw error;
    }
}

async function loadFileStore(tenantId = DEFAULT_TENANT_ID) {
    const parsed = await readTenantJsonFile(HISTORY_FILE, {
        tenantId,
        defaultValue: {
            chats: {},
            messages: {},
            messageOrderByChat: {}
        }
    });
    return {
        chats: parsed?.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
        messages: parsed?.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
        messageOrderByChat: parsed?.messageOrderByChat && typeof parsed.messageOrderByChat === 'object'
            ? parsed.messageOrderByChat
            : {}
    };
}

async function saveFileStore(tenantId = DEFAULT_TENANT_ID, store = {}) {
    await writeTenantJsonFile(HISTORY_FILE, store, { tenantId });
}

async function getUnreadState(tenantId = DEFAULT_TENANT_ID, target = {}) {
    const cleanTenant = toTenantId(tenantId);
    assertValidTenant(cleanTenant, 'chat-read-state.getUnreadState');
    const normalizedTarget = normalizeTarget(target);
    if (!normalizedTarget.baseChatId) return null;

    if (getStorageDriver() === 'postgres') {
        await ensurePostgresChatReadColumns();
        const { rows } = await queryPostgres(
            `SELECT chat_id,
                    unread_count,
                    manually_marked_unread,
                    manually_marked_unread_at,
                    metadata->>'manuallyMarkedUnread' AS manual_unread,
                    metadata->>'manuallyMarkedUnreadAt' AS manual_unread_at
               FROM tenant_chats
              WHERE tenant_id = $1
                AND chat_id = $2
              LIMIT 1`,
            [cleanTenant, normalizedTarget.baseChatId]
        );
        return normalizeStateRow(cleanTenant, normalizedTarget, rows?.[0] || {});
    }

    const store = await loadFileStore(cleanTenant);
    const chat = store.chats[normalizedTarget.baseChatId] || {};
    return normalizeStateRow(cleanTenant, normalizedTarget, {
        unreadCount: Number(chat?.unreadCount || 0) || 0,
        manual_unread: chat?.metadata?.manuallyMarkedUnread === true ? 'true' : 'false',
        manual_unread_at: chat?.metadata?.manuallyMarkedUnreadAt || null
    });
}

async function clearUnread(tenantId = DEFAULT_TENANT_ID, target = {}) {
    const cleanTenant = toTenantId(tenantId);
    assertValidTenant(cleanTenant, 'chat-read-state.clearUnread');
    const normalizedTarget = normalizeTarget(target);
    if (!normalizedTarget.baseChatId) return null;

    if (getStorageDriver() === 'postgres') {
        await ensurePostgresChatReadColumns();
        const { rows } = await queryPostgres(
            `UPDATE tenant_chats
                SET unread_count = 0,
                    manually_marked_unread = FALSE,
                    manually_marked_unread_at = NULL,
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'manuallyMarkedUnread', false
                    ) - 'manuallyMarkedUnreadAt',
                    updated_at = NOW()
              WHERE tenant_id = $1
                AND chat_id = $2
              RETURNING chat_id,
                        unread_count,
                        manually_marked_unread,
                        manually_marked_unread_at`,
            [cleanTenant, normalizedTarget.baseChatId]
        );
        return normalizeStateRow(cleanTenant, normalizedTarget, rows?.[0] || { unread_count: 0 });
    }

    const store = await loadFileStore(cleanTenant);
    const current = store.chats[normalizedTarget.baseChatId] || { id: normalizedTarget.baseChatId };
    store.chats[normalizedTarget.baseChatId] = {
        ...current,
        unreadCount: 0,
        metadata: {
            ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
            manuallyMarkedUnread: false,
            manuallyMarkedUnreadAt: null
        },
        updatedAt: new Date().toISOString()
    };
    await saveFileStore(cleanTenant, store);
    return normalizeStateRow(cleanTenant, normalizedTarget, store.chats[normalizedTarget.baseChatId]);
}

async function clearUnreadForActor(tenantId = DEFAULT_TENANT_ID, target = {}, {
    userId = '',
    conversationOpsService = null
} = {}) {
    const cleanTenant = toTenantId(tenantId);
    assertValidTenant(cleanTenant, 'chat-read-state.clearUnreadForActor');
    const normalizedTarget = normalizeTarget(target);
    const cleanUserId = toText(userId);
    if (!cleanUserId || !normalizedTarget.baseChatId) {
        return { ok: false, reason: 'invalid_actor_or_chat', item: null };
    }
    const assignment = await resolveAssignment(conversationOpsService, cleanTenant, normalizedTarget);
    const assigneeUserId = toText(assignment?.assigneeUserId || assignment?.assignee_user_id || assignment?.assignedUserId || '');
    const canClear = assignmentIsActive(assignment) && assigneeUserId === cleanUserId;
    const item = canClear
        ? await clearUnread(cleanTenant, normalizedTarget)
        : await getUnreadState(cleanTenant, normalizedTarget);
    return {
        ok: canClear,
        reason: canClear ? 'cleared' : 'not_assigned_to_user',
        assignment,
        item
    };
}

async function clearManualUnreadFlag(tenantId = DEFAULT_TENANT_ID, target = {}) {
    const cleanTenant = toTenantId(tenantId);
    assertValidTenant(cleanTenant, 'chat-read-state.clearManualUnreadFlag');
    const normalizedTarget = normalizeTarget(target);
    if (!normalizedTarget.baseChatId) return null;

    if (getStorageDriver() === 'postgres') {
        await ensurePostgresChatReadColumns();
        const { rows } = await queryPostgres(
            `UPDATE tenant_chats
                SET manually_marked_unread = FALSE,
                    manually_marked_unread_at = NULL,
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'manuallyMarkedUnread', false
                    ) - 'manuallyMarkedUnreadAt'
              WHERE tenant_id = $1
                AND chat_id = $2
              RETURNING chat_id,
                        unread_count,
                        manually_marked_unread,
                        manually_marked_unread_at`,
            [cleanTenant, normalizedTarget.baseChatId]
        );
        return normalizeStateRow(cleanTenant, normalizedTarget, rows?.[0] || {});
    }

    const store = await loadFileStore(cleanTenant);
    const current = store.chats[normalizedTarget.baseChatId] || { id: normalizedTarget.baseChatId };
    store.chats[normalizedTarget.baseChatId] = {
        ...current,
        metadata: {
            ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
            manuallyMarkedUnread: false,
            manuallyMarkedUnreadAt: null
        }
    };
    await saveFileStore(cleanTenant, store);
    return getUnreadState(cleanTenant, normalizedTarget);
}

async function markUnread(tenantId = DEFAULT_TENANT_ID, targets = []) {
    const cleanTenant = toTenantId(tenantId);
    assertValidTenant(cleanTenant, 'chat-read-state.markUnread');
    const normalizedTargets = (Array.isArray(targets) ? targets : [targets])
        .map((target) => normalizeTarget(target))
        .filter((target) => target.baseChatId);
    if (!normalizedTargets.length) return [];

    if (getStorageDriver() === 'postgres') {
        await ensurePostgresChatReadColumns();
        const baseChatIds = Array.from(new Set(normalizedTargets.map((target) => target.baseChatId)));
        const { rows } = await queryPostgres(
            `UPDATE tenant_chats
                SET unread_count = 0,
                    manually_marked_unread = TRUE,
                    manually_marked_unread_at = NOW(),
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'manuallyMarkedUnread', true,
                        'manuallyMarkedUnreadAt', NOW()::text
                    ),
                    updated_at = NOW()
              WHERE tenant_id = $1
                AND chat_id = ANY($2::text[])
              RETURNING chat_id,
                        unread_count,
                        manually_marked_unread,
                        manually_marked_unread_at`,
            [cleanTenant, baseChatIds]
        );
        const rowByChatId = new Map((Array.isArray(rows) ? rows : []).map((row) => [toText(row.chat_id), row]));
        return normalizedTargets
            .filter((target) => rowByChatId.has(target.baseChatId))
            .map((target) => normalizeStateRow(cleanTenant, target, rowByChatId.get(target.baseChatId)));
    }

    const store = await loadFileStore(cleanTenant);
    const nowIso = new Date().toISOString();
    const items = [];
    normalizedTargets.forEach((target) => {
        const current = store.chats[target.baseChatId] || { id: target.baseChatId };
        store.chats[target.baseChatId] = {
            ...current,
            unreadCount: 0,
            metadata: {
                ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
                manuallyMarkedUnread: true,
                manuallyMarkedUnreadAt: nowIso
            },
            updatedAt: nowIso
        };
        items.push(normalizeStateRow(cleanTenant, target, store.chats[target.baseChatId]));
    });
    await saveFileStore(cleanTenant, store);
    return items;
}

async function getInboundUnreadSnapshot(tenantId = DEFAULT_TENANT_ID, target = {}) {
    const cleanTenant = toTenantId(tenantId);
    const normalizedTarget = normalizeTarget(target);
    if (!normalizedTarget.baseChatId) return null;
    const exactScope = normalizedTarget.scopeModuleId || '';
    const scopeCandidates = Array.from(new Set([exactScope, '']));
    const { rows } = await queryPostgres(
        `SELECT tc.chat_id,
                tc.unread_count,
                tc.manually_marked_unread,
                tc.manually_marked_unread_at,
                tca.assignee_user_id,
                tca.status AS assignment_status,
                tca.scope_module_id AS assignment_scope_module_id
           FROM tenant_chats tc
           LEFT JOIN LATERAL (
                SELECT assignee_user_id, status, scope_module_id
                  FROM tenant_chat_assignments
                 WHERE tenant_id = tc.tenant_id
                   AND chat_id = tc.chat_id
                   AND scope_module_id = ANY($3::text[])
                 ORDER BY CASE WHEN scope_module_id = $4 THEN 0 ELSE 1 END
                 LIMIT 1
           ) tca ON TRUE
          WHERE tc.tenant_id = $1
            AND tc.chat_id = $2
          LIMIT 1`,
        [cleanTenant, normalizedTarget.baseChatId, scopeCandidates, exactScope]
    );
    return rows?.[0] || null;
}

async function incrementUnreadForInbound({
    tenantId = DEFAULT_TENANT_ID,
    chatId = '',
    scopeModuleId = '',
    conversationOpsService = null
} = {}) {
    const cleanTenant = toTenantId(tenantId);
    assertValidTenant(cleanTenant, 'chat-read-state.incrementUnreadForInbound');
    const target = normalizeTarget({ chatId, scopeModuleId });
    if (!target.baseChatId) return null;

    if (getStorageDriver() === 'postgres') {
        const snapshot = await getInboundUnreadSnapshot(cleanTenant, target);
        if (!snapshot) return null;
        const assignment = snapshot.assignee_user_id
            ? {
                assigneeUserId: snapshot.assignee_user_id,
                status: snapshot.assignment_status || 'active'
            }
            : null;
        const assigneeUserId = toText(assignment?.assigneeUserId || '');
        const assignedUserIsViewing = assignmentIsActive(assignment) && isAssignedUserViewing({
            tenantId: cleanTenant,
            chatId: target.baseChatId,
            scopeModuleId: target.scopeModuleId || '',
            assigneeUserId
        });

        if (assignedUserIsViewing) {
            const hasUnreadState = (Number(snapshot.unread_count || 0) || 0) > 0
                || snapshot.manually_marked_unread === true
                || snapshot.manually_marked_unread === 'true';
            return hasUnreadState
                ? clearUnread(cleanTenant, target)
                : normalizeStateRow(cleanTenant, target, snapshot);
        }

        const { rows } = await queryPostgres(
            `UPDATE tenant_chats
                SET unread_count = COALESCE(unread_count, 0) + 1,
                    manually_marked_unread = FALSE,
                    manually_marked_unread_at = NULL,
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                        'manuallyMarkedUnread', false
                    ) - 'manuallyMarkedUnreadAt',
                    updated_at = NOW()
              WHERE tenant_id = $1
                AND chat_id = $2
              RETURNING chat_id,
                        unread_count,
                        manually_marked_unread,
                        manually_marked_unread_at`,
            [cleanTenant, target.baseChatId]
        );
        return normalizeStateRow(cleanTenant, target, rows?.[0] || {});
    }

    const assignment = await resolveAssignment(conversationOpsService, cleanTenant, target);
    const assigneeUserId = toText(assignment?.assigneeUserId || assignment?.assignee_user_id || assignment?.assignedUserId || '');
    const assignedUserIsViewing = assignmentIsActive(assignment) && isAssignedUserViewing({
        tenantId: cleanTenant,
        chatId: target.baseChatId,
        scopeModuleId: target.scopeModuleId || '',
        assigneeUserId
    });
    if (assignedUserIsViewing) {
        return clearUnread(cleanTenant, target);
    }

    const store = await loadFileStore(cleanTenant);
    const current = store.chats[target.baseChatId] || { id: target.baseChatId };
    const nextUnreadCount = (Number(current.unreadCount || 0) || 0) + 1;
    store.chats[target.baseChatId] = {
        ...current,
        unreadCount: nextUnreadCount,
        metadata: {
            ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
            manuallyMarkedUnread: false,
            manuallyMarkedUnreadAt: null
        },
        updatedAt: new Date().toISOString()
    };
    await saveFileStore(cleanTenant, store);
    return normalizeStateRow(cleanTenant, target, store.chats[target.baseChatId]);
}

function assignmentIsActive(assignment = null) {
    if (!assignment || typeof assignment !== 'object') return false;
    const status = toText(assignment.status || 'active').toLowerCase();
    return status && status !== 'released';
}

async function resolveAssignment(conversationOpsService = null, tenantId = DEFAULT_TENANT_ID, target = {}) {
    if (!conversationOpsService || typeof conversationOpsService.getChatAssignment !== 'function') return null;
    const normalizedTarget = normalizeTarget(target);
    const scopes = Array.from(new Set([normalizedTarget.scopeModuleId || '', '']));
    for (const scopeModuleId of scopes) {
        const assignment = await conversationOpsService.getChatAssignment(tenantId, {
            chatId: normalizedTarget.baseChatId,
            scopeModuleId
        });
        if (assignment) return assignment;
    }
    return null;
}

function focusChat({
    socketId = '',
    tenantId = DEFAULT_TENANT_ID,
    userId = '',
    chatId = '',
    scopeModuleId = ''
} = {}) {
    const cleanSocketId = toText(socketId);
    const cleanTenant = toTenantId(tenantId);
    const cleanUserId = toText(userId);
    const normalizedTarget = normalizeTarget({ chatId, scopeModuleId });
    if (!cleanSocketId || !cleanTenant || !cleanUserId || !normalizedTarget.baseChatId) return null;
    const state = {
        socketId: cleanSocketId,
        tenantId: cleanTenant,
        userId: cleanUserId,
        chatId: normalizedTarget.baseChatId,
        scopeModuleId: normalizedTarget.scopeModuleId || '',
        focusedAt: Date.now()
    };
    presenceBySocketId.set(cleanSocketId, state);
    return state;
}

function blurChat({ socketId = '', chatId = '', scopeModuleId = '' } = {}) {
    const cleanSocketId = toText(socketId);
    if (!cleanSocketId || !presenceBySocketId.has(cleanSocketId)) return false;
    if (!chatId) {
        presenceBySocketId.delete(cleanSocketId);
        return true;
    }
    const current = presenceBySocketId.get(cleanSocketId);
    const target = normalizeTarget({ chatId, scopeModuleId });
    if (current?.chatId === target.baseChatId) {
        presenceBySocketId.delete(cleanSocketId);
        return true;
    }
    return false;
}

function clearSocketPresence(socketId = '') {
    const cleanSocketId = toText(socketId);
    if (!cleanSocketId) return false;
    return presenceBySocketId.delete(cleanSocketId);
}

function isAssignedUserViewing({
    tenantId = DEFAULT_TENANT_ID,
    chatId = '',
    scopeModuleId = '',
    assigneeUserId = ''
} = {}) {
    const cleanTenant = toTenantId(tenantId);
    const cleanAssignee = toText(assigneeUserId);
    const target = normalizeTarget({ chatId, scopeModuleId });
    if (!cleanTenant || !cleanAssignee || !target.baseChatId) return false;
    return Array.from(presenceBySocketId.values()).some((entry) => (
        entry.tenantId === cleanTenant
        && entry.userId === cleanAssignee
        && entry.chatId === target.baseChatId
        && (!target.scopeModuleId || !entry.scopeModuleId || entry.scopeModuleId === target.scopeModuleId)
    ));
}

async function shouldIncrementInbound({
    tenantId = DEFAULT_TENANT_ID,
    chatId = '',
    scopeModuleId = '',
    conversationOpsService = null
} = {}) {
    const cleanTenant = toTenantId(tenantId);
    const target = normalizeTarget({ chatId, scopeModuleId });
    if (!target.baseChatId) return true;
    const assignment = await resolveAssignment(conversationOpsService, cleanTenant, target);
    if (!assignmentIsActive(assignment)) return true;
    const assigneeUserId = toText(assignment.assigneeUserId || assignment.assignee_user_id || assignment.assignedUserId || '');
    if (!assigneeUserId) return true;
    return !isAssignedUserViewing({
        tenantId: cleanTenant,
        chatId: target.baseChatId,
        scopeModuleId: target.scopeModuleId || '',
        assigneeUserId
    });
}

function buildUnreadStatePayload(tenantId = DEFAULT_TENANT_ID, items = []) {
    const safeItems = (Array.isArray(items) ? items : [items]).filter(Boolean);
    return {
        tenantId: toTenantId(tenantId),
        chatIds: safeItems.map((item) => item.chatId).filter(Boolean),
        items: safeItems
    };
}

function emitUnreadState({
    emitToTenant = null,
    tenantId = DEFAULT_TENANT_ID,
    items = []
} = {}) {
    if (typeof emitToTenant !== 'function') return;
    const payload = buildUnreadStatePayload(tenantId, items);
    if (!payload.items.length) return;
    emitToTenant(payload.tenantId, 'chat_unread_state_updated', payload);
}

function getUserIdFromSocket(socket = null, authContext = {}) {
    return toText(
        socket?.data?.userId
        || socket?.data?.user?.userId
        || authContext?.userId
        || authContext?.user?.userId
        || authContext?.user?.id
        || ''
    );
}

function registerSocketHandlers({
    socket = null,
    tenantId = DEFAULT_TENANT_ID,
    authContext = {},
    conversationOpsService = null,
    emitToTenant = null
} = {}) {
    if (!socket || typeof socket.on !== 'function') return;
    const cleanTenant = toTenantId(tenantId || socket?.data?.tenantId || DEFAULT_TENANT_ID);
    assertValidTenant(cleanTenant, 'chat-read-state.registerSocketHandlers');

    socket.on('chat_focus', async (payload = {}) => {
        try {
            const source = toText(payload?.source || '').toLowerCase();
            if (source === 'active_inbound') return;
            const userId = getUserIdFromSocket(socket, authContext);
            const target = normalizeTarget({
                chatId: payload?.chatId || payload?.baseChatId || '',
                scopeModuleId: payload?.scopeModuleId || payload?.moduleId || ''
            });
            focusChat({
                socketId: socket.id,
                tenantId: cleanTenant,
                userId,
                chatId: target.baseChatId,
                scopeModuleId: target.scopeModuleId || ''
            });
            const result = await clearUnreadForActor(cleanTenant, target, {
                userId,
                conversationOpsService
            });
            if (result?.item) {
                emitUnreadState({
                    emitToTenant,
                    tenantId: cleanTenant,
                    items: [result.item]
                });
            }
        } catch (error) {
            console.warn('[ChatReadState] chat_focus fallo:', error?.message || error);
        }
    });

    socket.on('chat_blur', (payload = {}) => {
        blurChat({
            socketId: socket.id,
            chatId: payload?.chatId || payload?.baseChatId || '',
            scopeModuleId: payload?.scopeModuleId || payload?.moduleId || ''
        });
    });

    socket.on('disconnect', () => {
        clearSocketPresence(socket.id);
    });
}

module.exports = {
    ensurePostgresChatReadColumns,
    getUnreadState,
    clearUnread,
    clearUnreadForActor,
    clearManualUnreadFlag,
    markUnread,
    incrementUnreadForInbound,
    focusChat,
    blurChat,
    clearSocketPresence,
    isAssignedUserViewing,
    shouldIncrementInbound,
    buildUnreadStatePayload,
    emitUnreadState,
    registerSocketHandlers
};
