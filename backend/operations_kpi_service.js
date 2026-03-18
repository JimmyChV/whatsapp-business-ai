const { DEFAULT_TENANT_ID, getStorageDriver, normalizeTenantId, queryPostgres } = require('./persistence_runtime');
const conversationOpsService = require('./conversation_ops_service');
const messageHistoryService = require('./message_history_service');

const CHAT_PAGE_LIMIT = 300;
const MESSAGE_PAGE_LIMIT = 500;
const MESSAGE_SCAN_LIMIT_PER_CHAT = 2500;

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeTenantIdSafe(value = '') {
    return normalizeTenantId(value || DEFAULT_TENANT_ID);
}

function normalizeScopeModuleId(value = '') {
    return toText(value).toLowerCase();
}

function toUnix(value = null) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return Math.floor(asNum);
    const asDate = Date.parse(String(value));
    if (Number.isFinite(asDate)) return Math.floor(asDate / 1000);
    return null;
}

function toIsoFromUnix(value = null) {
    if (!Number.isFinite(Number(value))) return null;
    return new Date(Number(value) * 1000).toISOString();
}

function withinWindow(ts = null, fromUnix = null, toUnix = null) {
    const value = Number(ts || 0);
    if (!Number.isFinite(value) || value <= 0) return false;
    if (Number.isFinite(fromUnix) && value < fromUnix) return false;
    if (Number.isFinite(toUnix) && value > toUnix) return false;
    return true;
}

function computeResponseMetrics(messages = []) {
    const incomingByChat = new Map();
    const outgoingByChat = new Map();

    (Array.isArray(messages) ? messages : []).forEach((entry) => {
        const chatId = toText(entry?.chatId);
        const ts = Number(entry?.timestampUnix || 0);
        if (!chatId || !Number.isFinite(ts) || ts <= 0) return;

        if (entry?.fromMe === false) {
            const previous = incomingByChat.get(chatId);
            if (!previous || ts < previous) incomingByChat.set(chatId, ts);
            return;
        }

        if (entry?.fromMe === true) {
            if (!outgoingByChat.has(chatId)) outgoingByChat.set(chatId, []);
            outgoingByChat.get(chatId).push(ts);
        }
    });

    const firstResponseSeconds = [];
    incomingByChat.forEach((incomingTs, chatId) => {
        const outgoing = (outgoingByChat.get(chatId) || [])
            .filter((ts) => ts >= incomingTs)
            .sort((a, b) => a - b)[0];

        if (Number.isFinite(outgoing)) {
            firstResponseSeconds.push(Math.max(0, outgoing - incomingTs));
        }
    });

    const avgFirstResponseSec = firstResponseSeconds.length > 0
        ? Number((firstResponseSeconds.reduce((sum, item) => sum + item, 0) / firstResponseSeconds.length).toFixed(2))
        : null;

    return {
        avgFirstResponseSec,
        respondedChats: firstResponseSeconds.length
    };
}

async function listAllMessagesForChat(tenantId = '', chatId = '', { fromUnix = null, toUnix = null } = {}) {
    const items = [];
    let beforeTimestamp = null;
    let guard = 0;
    let keepPaging = true;

    while (keepPaging && items.length < MESSAGE_SCAN_LIMIT_PER_CHAT && guard < 20) {
        guard += 1;
        const batch = await messageHistoryService.listMessages(tenantId, {
            chatId,
            limit: MESSAGE_PAGE_LIMIT,
            beforeTimestamp
        });

        const rows = Array.isArray(batch) ? batch : [];
        if (rows.length === 0) break;

        rows.forEach((entry) => {
            const ts = Number(entry?.timestampUnix || 0);
            if (withinWindow(ts, fromUnix, toUnix)) items.push(entry);
        });

        if (rows.length < MESSAGE_PAGE_LIMIT) break;

        const oldestTs = Number(rows[rows.length - 1]?.timestampUnix || 0);
        if (!Number.isFinite(oldestTs) || oldestTs <= 0) break;

        beforeTimestamp = Math.max(1, oldestTs - 1);
        if (Number.isFinite(fromUnix) && oldestTs < fromUnix) {
            keepPaging = false;
        }
    }

    return items;
}

async function getKpisFromFileDriver(tenantId = '', {
    fromUnix = null,
    toUnix = null,
    scopeModuleId = '',
    assigneeUserId = ''
} = {}) {
    const cleanAssigneeUserId = toText(assigneeUserId);
    const allChats = await messageHistoryService.listChats(tenantId, { limit: CHAT_PAGE_LIMIT, offset: 0 });
    const chatIds = new Set((Array.isArray(allChats) ? allChats : []).map((chat) => toText(chat?.chatId)).filter(Boolean));

    let assigneeChatIds = null;
    if (cleanAssigneeUserId) {
        const assigned = await conversationOpsService.listChatAssignments(tenantId, {
            assigneeUserId: cleanAssigneeUserId,
            scopeModuleId,
            status: 'active',
            limit: 500,
            offset: 0
        });
        assigneeChatIds = new Set((Array.isArray(assigned?.items) ? assigned.items : []).map((row) => toText(row?.chatId)).filter(Boolean));
    }

    const selectedChatIds = Array.from(chatIds).filter((chatId) => {
        if (!assigneeChatIds) return true;
        return assigneeChatIds.has(chatId);
    });

    const allMessages = [];
    for (const chatId of selectedChatIds) {
        const rows = await listAllMessagesForChat(tenantId, chatId, { fromUnix, toUnix });
        rows.forEach((entry) => {
            const moduleId = normalizeScopeModuleId(entry?.waModuleId || '');
            if (scopeModuleId && moduleId !== scopeModuleId) return;
            allMessages.push(entry);
        });
    }

    const incoming = allMessages.filter((entry) => entry?.fromMe === false);
    const outgoing = allMessages.filter((entry) => entry?.fromMe === true);
    const responseMetrics = computeResponseMetrics(allMessages);

    const activeAssignments = await conversationOpsService.listChatAssignments(tenantId, {
        assigneeUserId: cleanAssigneeUserId,
        scopeModuleId,
        status: 'active',
        limit: 500,
        offset: 0
    });

    const assignmentEvents = await conversationOpsService.listChatAssignmentEvents(tenantId, {
        scopeModuleId,
        limit: 500,
        offset: 0
    });

    const reassignedChats = (Array.isArray(assignmentEvents?.items) ? assignmentEvents.items : []).filter((event) => {
        const prev = toText(event?.previousAssigneeUserId);
        const next = toText(event?.nextAssigneeUserId);
        if (!prev || !next || prev === next) return false;
        if (cleanAssigneeUserId && prev !== cleanAssigneeUserId && next !== cleanAssigneeUserId) return false;
        return true;
    }).length;

    const activeAssignmentItems = Array.isArray(activeAssignments?.items) ? activeAssignments.items : [];
    const activeAssignmentKeys = new Set(activeAssignmentItems.map((item) => `${toText(item?.chatId)}::${normalizeScopeModuleId(item?.scopeModuleId || '')}`));
    const unassignedChats = cleanAssigneeUserId
        ? 0
        : selectedChatIds.filter((chatId) => !activeAssignmentKeys.has(`${chatId}::${scopeModuleId || ''}`) && !activeAssignmentKeys.has(`${chatId}::`)).length;

    return {
        window: {
            fromUnix,
            toUnix,
            fromIso: toIsoFromUnix(fromUnix),
            toIso: toIsoFromUnix(toUnix)
        },
        metrics: {
            incomingMessages: incoming.length,
            outgoingMessages: outgoing.length,
            activeAssignments: Number(activeAssignments?.total || 0),
            unassignedChats,
            reassignedChats,
            avgFirstResponseSec: responseMetrics.avgFirstResponseSec,
            respondedChats: responseMetrics.respondedChats,
            source: 'file'
        }
    };
}

async function listAssignedChatIds(tenantId = '', { scopeModuleId = '', assigneeUserId = '' } = {}) {
    const cleanTenantId = normalizeTenantIdSafe(tenantId);
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');
    const cleanAssigneeUserId = toText(assigneeUserId);
    if (!cleanAssigneeUserId) return null;

    const params = [cleanTenantId, cleanAssigneeUserId, 'active'];
    let whereSql = 'tenant_id = $1 AND assignee_user_id = $2 AND status = $3';
    if (cleanScopeModuleId) {
        params.push(cleanScopeModuleId);
        whereSql += ` AND scope_module_id = $${params.length}`;
    }

    const result = await queryPostgres(
        `SELECT DISTINCT chat_id
           FROM tenant_chat_assignments
          WHERE ${whereSql}`,
        params
    );

    const chatIds = (Array.isArray(result.rows) ? result.rows : [])
        .map((row) => toText(row.chat_id))
        .filter(Boolean);

    return chatIds;
}

async function getKpisFromPostgres(tenantId = '', {
    fromUnix = null,
    toUnix = null,
    scopeModuleId = '',
    assigneeUserId = ''
} = {}) {
    const cleanTenantId = normalizeTenantIdSafe(tenantId);
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');
    const cleanAssigneeUserId = toText(assigneeUserId);

    const assignedChatIds = await listAssignedChatIds(cleanTenantId, {
        scopeModuleId: cleanScopeModuleId,
        assigneeUserId: cleanAssigneeUserId
    });

    if (Array.isArray(assignedChatIds) && assignedChatIds.length === 0) {
        return {
            window: {
                fromUnix,
                toUnix,
                fromIso: toIsoFromUnix(fromUnix),
                toIso: toIsoFromUnix(toUnix)
            },
            metrics: {
                incomingMessages: 0,
                outgoingMessages: 0,
                activeAssignments: 0,
                unassignedChats: 0,
                reassignedChats: 0,
                avgFirstResponseSec: null,
                respondedChats: 0,
                source: 'postgres'
            }
        };
    }

    const commonParams = [
        cleanTenantId,
        Number.isFinite(fromUnix) ? fromUnix : null,
        Number.isFinite(toUnix) ? toUnix : null,
        cleanScopeModuleId,
        Array.isArray(assignedChatIds) ? assignedChatIds : null
    ];

    const countResult = await queryPostgres(
        `WITH filtered_messages AS (
            SELECT chat_id, from_me, timestamp_unix
              FROM tenant_messages
             WHERE tenant_id = $1
               AND ($2::BIGINT IS NULL OR COALESCE(timestamp_unix, 0) >= $2)
               AND ($3::BIGINT IS NULL OR COALESCE(timestamp_unix, 0) <= $3)
               AND ($4::TEXT = '' OR COALESCE(wa_module_id, '') = $4)
               AND ($5::TEXT[] IS NULL OR chat_id = ANY($5))
        )
        SELECT
            COUNT(*) FILTER (WHERE from_me = FALSE) AS incoming_messages,
            COUNT(*) FILTER (WHERE from_me = TRUE) AS outgoing_messages
        FROM filtered_messages`,
        commonParams
    );

    const responseResult = await queryPostgres(
        `WITH filtered_messages AS (
            SELECT chat_id, from_me, timestamp_unix
              FROM tenant_messages
             WHERE tenant_id = $1
               AND ($2::BIGINT IS NULL OR COALESCE(timestamp_unix, 0) >= $2)
               AND ($3::BIGINT IS NULL OR COALESCE(timestamp_unix, 0) <= $3)
               AND ($4::TEXT = '' OR COALESCE(wa_module_id, '') = $4)
               AND ($5::TEXT[] IS NULL OR chat_id = ANY($5))
        ),
        first_incoming AS (
            SELECT chat_id, MIN(timestamp_unix) AS incoming_ts
              FROM filtered_messages
             WHERE from_me = FALSE
               AND COALESCE(timestamp_unix, 0) > 0
             GROUP BY chat_id
        ),
        first_outgoing AS (
            SELECT fi.chat_id, MIN(fm.timestamp_unix) AS outgoing_ts
              FROM first_incoming fi
              JOIN filtered_messages fm
                ON fm.chat_id = fi.chat_id
               AND fm.from_me = TRUE
               AND COALESCE(fm.timestamp_unix, 0) >= fi.incoming_ts
             GROUP BY fi.chat_id
        )
        SELECT
            AVG(fo.outgoing_ts - fi.incoming_ts)::NUMERIC(12,2) AS avg_first_response_sec,
            COUNT(*)::BIGINT AS responded_chats
          FROM first_incoming fi
          JOIN first_outgoing fo ON fo.chat_id = fi.chat_id`,
        commonParams
    );

    const assignmentParams = [cleanTenantId, 'active'];
    let assignmentWhere = 'tenant_id = $1 AND status = $2';
    if (cleanScopeModuleId) {
        assignmentParams.push(cleanScopeModuleId);
        assignmentWhere += ` AND scope_module_id = $${assignmentParams.length}`;
    }
    if (cleanAssigneeUserId) {
        assignmentParams.push(cleanAssigneeUserId);
        assignmentWhere += ` AND assignee_user_id = $${assignmentParams.length}`;
    }

    const activeAssignmentsResult = await queryPostgres(
        `SELECT COUNT(*)::BIGINT AS total
           FROM tenant_chat_assignments
          WHERE ${assignmentWhere}`,
        assignmentParams
    );

    const reassignedParams = [
        cleanTenantId,
        Number.isFinite(fromUnix) ? toIsoFromUnix(fromUnix) : null,
        Number.isFinite(toUnix) ? toIsoFromUnix(toUnix) : null,
        cleanScopeModuleId,
        cleanAssigneeUserId || null
    ];

    const reassignedResult = await queryPostgres(
        `SELECT COUNT(*)::BIGINT AS total
           FROM tenant_chat_assignment_events
          WHERE tenant_id = $1
            AND ($2::TIMESTAMPTZ IS NULL OR created_at >= $2::TIMESTAMPTZ)
            AND ($3::TIMESTAMPTZ IS NULL OR created_at <= $3::TIMESTAMPTZ)
            AND ($4::TEXT = '' OR scope_module_id = $4)
            AND ($5::TEXT IS NULL OR next_assignee_user_id = $5 OR previous_assignee_user_id = $5)
            AND previous_assignee_user_id IS NOT NULL
            AND next_assignee_user_id IS NOT NULL
            AND previous_assignee_user_id <> next_assignee_user_id`,
        reassignedParams
    );

    const unassignedResult = await queryPostgres(
        `WITH filtered_chats AS (
            SELECT DISTINCT chat_id
              FROM tenant_messages
             WHERE tenant_id = $1
               AND ($2::BIGINT IS NULL OR COALESCE(timestamp_unix, 0) >= $2)
               AND ($3::BIGINT IS NULL OR COALESCE(timestamp_unix, 0) <= $3)
               AND ($4::TEXT = '' OR COALESCE(wa_module_id, '') = $4)
               AND ($5::TEXT[] IS NULL OR chat_id = ANY($5))
        )
        SELECT COUNT(*)::BIGINT AS total
          FROM filtered_chats c
         WHERE NOT EXISTS (
            SELECT 1
              FROM tenant_chat_assignments a
             WHERE a.tenant_id = $1
               AND a.chat_id = c.chat_id
               AND a.status = 'active'
               AND ($4::TEXT = '' OR a.scope_module_id = $4 OR a.scope_module_id = '')
         )`,
        commonParams
    );

    const countRow = countResult?.rows?.[0] || {};
    const responseRow = responseResult?.rows?.[0] || {};
    const assignmentRow = activeAssignmentsResult?.rows?.[0] || {};
    const reassignedRow = reassignedResult?.rows?.[0] || {};
    const unassignedRow = unassignedResult?.rows?.[0] || {};

    return {
        window: {
            fromUnix,
            toUnix,
            fromIso: toIsoFromUnix(fromUnix),
            toIso: toIsoFromUnix(toUnix)
        },
        metrics: {
            incomingMessages: Number(countRow.incoming_messages || 0),
            outgoingMessages: Number(countRow.outgoing_messages || 0),
            activeAssignments: Number(assignmentRow.total || 0),
            unassignedChats: cleanAssigneeUserId ? 0 : Number(unassignedRow.total || 0),
            reassignedChats: Number(reassignedRow.total || 0),
            avgFirstResponseSec: responseRow.avg_first_response_sec === null || responseRow.avg_first_response_sec === undefined
                ? null
                : Number(responseRow.avg_first_response_sec),
            respondedChats: Number(responseRow.responded_chats || 0),
            source: 'postgres'
        }
    };
}

async function getOperationsKpis(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenantIdSafe(tenantId);
    const fromUnixValue = toUnix(options.fromUnix || options.from || null);
    const toUnixValue = toUnix(options.toUnix || options.to || null);
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    const assigneeUserId = toText(options.assigneeUserId || '');

    if (getStorageDriver() !== 'postgres') {
        return getKpisFromFileDriver(cleanTenantId, { fromUnix: fromUnixValue, toUnix: toUnixValue, scopeModuleId, assigneeUserId });
    }

    return getKpisFromPostgres(cleanTenantId, { fromUnix: fromUnixValue, toUnix: toUnixValue, scopeModuleId, assigneeUserId });
}

module.exports = {
    getOperationsKpis
};
