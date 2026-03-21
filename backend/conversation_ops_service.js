const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');
const {
    resolveTenantId,
    toText,
    toLower,
    normalizeChatId,
    normalizeScopeModuleId,
    normalizeEventType,
    normalizeEventSource,
    normalizeMode,
    normalizeStatus,
    normalizeLimit,
    normalizeOffset,
    normalizeObject,
    createId,
    trimArrayRight,
    normalizeEventRecord,
    normalizeAssignmentRecord,
    normalizeAssignmentEventRecord,
    normalizeStore,
    assignmentKey,
    missingRelation,
    nowIso
} = require('./domains/operations/conversation-ops.helpers');
const { ensureConversationOpsSchema } = require('./domains/operations/conversation-ops.schema');

const STORE_FILE = 'conversation_ops.json';
const EVENTS_FILE_LIMIT = Math.max(500, Number(process.env.CONVERSATION_EVENTS_FILE_LIMIT || 5000));
const ASSIGNMENT_EVENTS_FILE_LIMIT = Math.max(500, Number(process.env.ASSIGNMENT_EVENTS_FILE_LIMIT || 5000));

async function listConversationEvents(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(options.chatId || '');
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    const eventTypes = Array.isArray(options.eventTypes)
        ? options.eventTypes.map((entry) => normalizeEventType(entry)).filter(Boolean)
        : [];
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.events
            .filter((entry) => !chatId || entry.chatId === chatId)
            .filter((entry) => !scopeModuleId || entry.scopeModuleId === scopeModuleId)
            .filter((entry) => eventTypes.length === 0 || eventTypes.includes(entry.eventType))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

        const items = filtered.slice(offset, offset + limit);
        return { items, total: filtered.length, limit, offset };
    }

    try {
        await ensureConversationOpsSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];

        if (chatId) {
            params.push(chatId);
            where.push(`chat_id = $${params.length}`);
        }
        if (scopeModuleId) {
            params.push(scopeModuleId);
            where.push(`scope_module_id = $${params.length}`);
        }
        if (eventTypes.length > 0) {
            params.push(eventTypes);
            where.push(`event_type = ANY($${params.length}::text[])`);
        }

        const whereSql = where.join(' AND ');

        const totalResult = await queryPostgres(
            `SELECT COUNT(*)::BIGINT AS total
               FROM tenant_conversation_events
              WHERE ${whereSql}`,
            params
        );

        const rowParams = [...params, limit, offset];
        const rowsResult = await queryPostgres(
            `SELECT event_id, chat_id, scope_module_id, customer_id, actor_user_id, actor_role, event_type, event_source, payload, created_at
               FROM tenant_conversation_events
              WHERE ${whereSql}
              ORDER BY created_at DESC
              LIMIT $${rowParams.length - 1}
              OFFSET $${rowParams.length}`,
            rowParams
        );

        const items = (Array.isArray(rowsResult.rows) ? rowsResult.rows : []).map((row) => ({
            eventId: toText(row.event_id),
            chatId: toText(row.chat_id),
            scopeModuleId: normalizeScopeModuleId(row.scope_module_id),
            customerId: toText(row.customer_id) || null,
            actorUserId: toText(row.actor_user_id) || null,
            actorRole: toLower(row.actor_role) || null,
            eventType: normalizeEventType(row.event_type),
            eventSource: normalizeEventSource(row.event_source),
            payload: normalizeObject(row.payload),
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
        }));

        const total = Number(totalResult?.rows?.[0]?.total || 0);
        return { items, total, limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function recordConversationEvent(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const clean = normalizeEventRecord({
        ...payload,
        eventId: toText(payload.eventId || '') || createId('EVT')
    });

    if (!clean.chatId) throw new Error('chatId requerido para evento de conversacion.');
    if (!clean.eventType) throw new Error('eventType requerido.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const outEvents = [...store.events, clean];
        const nextStore = {
            ...store,
            events: trimArrayRight(outEvents, EVENTS_FILE_LIMIT)
        };
        await writeTenantJsonFile(STORE_FILE, nextStore, { tenantId: cleanTenantId });
        return clean;
    }

    await ensureConversationOpsSchema();
    await queryPostgres(
        `INSERT INTO tenant_conversation_events (
            tenant_id, event_id, chat_id, scope_module_id, customer_id, actor_user_id, actor_role, event_type, event_source, payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())`,
        [
            cleanTenantId,
            clean.eventId,
            clean.chatId,
            clean.scopeModuleId || '',
            clean.customerId,
            clean.actorUserId,
            clean.actorRole,
            clean.eventType,
            clean.eventSource,
            JSON.stringify(clean.payload || {})
        ]
    );
    return clean;
}

async function getChatAssignment(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(options.chatId || options);
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    if (!chatId) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = assignmentKey(chatId, scopeModuleId);
        const match = store.assignments.find((entry) => assignmentKey(entry.chatId, entry.scopeModuleId) === key);
        return match ? { ...match } : null;
    }

    try {
        await ensureConversationOpsSchema();
        const { rows } = await queryPostgres(
            `SELECT chat_id, scope_module_id, assignee_user_id, assignee_role, assigned_by_user_id,
                    assignment_mode, assignment_reason, metadata, status, created_at, updated_at
               FROM tenant_chat_assignments
              WHERE tenant_id = $1
                AND chat_id = $2
                AND scope_module_id = $3
              LIMIT 1`,
            [cleanTenantId, chatId, scopeModuleId]
        );

        const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (!row) return null;
        return normalizeAssignmentRecord({
            chat_id: row.chat_id,
            scope_module_id: row.scope_module_id,
            assignee_user_id: row.assignee_user_id,
            assignee_role: row.assignee_role,
            assigned_by_user_id: row.assigned_by_user_id,
            assignment_mode: row.assignment_mode,
            assignment_reason: row.assignment_reason,
            metadata: row.metadata,
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at
        });
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function listChatAssignments(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const assigneeUserId = toText(options.assigneeUserId || '');
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    const status = toLower(options.status || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.assignments
            .filter((entry) => !assigneeUserId || toText(entry.assigneeUserId) === assigneeUserId)
            .filter((entry) => !scopeModuleId || normalizeScopeModuleId(entry.scopeModuleId) === scopeModuleId)
            .filter((entry) => !status || normalizeStatus(entry.status) === status)
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        const items = filtered.slice(offset, offset + limit).map((entry) => ({ ...entry }));
        return { items, total: filtered.length, limit, offset };
    }

    try {
        await ensureConversationOpsSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];

        if (assigneeUserId) {
            params.push(assigneeUserId);
            where.push(`assignee_user_id = $${params.length}`);
        }
        if (scopeModuleId) {
            params.push(scopeModuleId);
            where.push(`scope_module_id = $${params.length}`);
        }
        if (status) {
            params.push(normalizeStatus(status));
            where.push(`status = $${params.length}`);
        }

        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(
            `SELECT COUNT(*)::BIGINT AS total
               FROM tenant_chat_assignments
              WHERE ${whereSql}`,
            params
        );

        const rowParams = [...params, limit, offset];
        const rowsResult = await queryPostgres(
            `SELECT chat_id, scope_module_id, assignee_user_id, assignee_role, assigned_by_user_id,
                    assignment_mode, assignment_reason, metadata, status, created_at, updated_at
               FROM tenant_chat_assignments
              WHERE ${whereSql}
              ORDER BY updated_at DESC
              LIMIT $${rowParams.length - 1}
              OFFSET $${rowParams.length}`,
            rowParams
        );

        const items = (Array.isArray(rowsResult.rows) ? rowsResult.rows : []).map((row) => normalizeAssignmentRecord(row));
        const total = Number(totalResult?.rows?.[0]?.total || 0);
        return { items, total, limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function listChatAssignmentEvents(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(options.chatId || '');
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.assignmentEvents
            .filter((entry) => !chatId || entry.chatId === chatId)
            .filter((entry) => !scopeModuleId || entry.scopeModuleId === scopeModuleId)
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const items = filtered.slice(offset, offset + limit).map((entry) => ({ ...entry }));
        return { items, total: filtered.length, limit, offset };
    }

    try {
        await ensureConversationOpsSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];

        if (chatId) {
            params.push(chatId);
            where.push(`chat_id = $${params.length}`);
        }
        if (scopeModuleId) {
            params.push(scopeModuleId);
            where.push(`scope_module_id = $${params.length}`);
        }

        const whereSql = where.join(' AND ');

        const totalResult = await queryPostgres(
            `SELECT COUNT(*)::BIGINT AS total
               FROM tenant_chat_assignment_events
              WHERE ${whereSql}`,
            params
        );

        const rowParams = [...params, limit, offset];
        const rowsResult = await queryPostgres(
            `SELECT assignment_event_id, chat_id, scope_module_id, previous_assignee_user_id, next_assignee_user_id,
                    next_assignee_role, assigned_by_user_id, assignment_mode, assignment_reason, payload, created_at
               FROM tenant_chat_assignment_events
              WHERE ${whereSql}
              ORDER BY created_at DESC
              LIMIT $${rowParams.length - 1}
              OFFSET $${rowParams.length}`,
            rowParams
        );

        const items = (Array.isArray(rowsResult.rows) ? rowsResult.rows : []).map((row) => normalizeAssignmentEventRecord(row));
        const total = Number(totalResult?.rows?.[0]?.total || 0);
        return { items, total, limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function upsertChatAssignment(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(payload.chatId || '');
    const scopeModuleId = normalizeScopeModuleId(payload.scopeModuleId || '');
    const assigneeUserId = toText(payload.assigneeUserId || '') || null;
    const assigneeRole = assigneeUserId ? (toLower(payload.assigneeRole || '') || null) : null;
    const assignedByUserId = toText(payload.assignedByUserId || '') || null;
    const assignmentMode = normalizeMode(payload.assignmentMode || 'manual');
    const assignmentReason = toText(payload.assignmentReason || '') || null;
    const metadata = normalizeObject(payload.metadata);
    const status = normalizeStatus(payload.status || (assigneeUserId ? 'active' : 'released'));
    const now = nowIso();

    if (!chatId) throw new Error('chatId requerido para asignacion.');

    const previous = await getChatAssignment(cleanTenantId, { chatId, scopeModuleId });

    const nextRecord = normalizeAssignmentRecord({
        chatId,
        scopeModuleId,
        assigneeUserId,
        assigneeRole,
        assignedByUserId,
        assignmentMode,
        assignmentReason,
        metadata,
        status,
        createdAt: previous?.createdAt || now,
        updatedAt: now
    });

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = assignmentKey(chatId, scopeModuleId);
        const index = store.assignments.findIndex((entry) => assignmentKey(entry.chatId, entry.scopeModuleId) === key);

        if (index >= 0) store.assignments[index] = nextRecord;
        else store.assignments.push(nextRecord);

        const assignmentEvent = normalizeAssignmentEventRecord({
            assignmentEventId: createId('ASG'),
            chatId,
            scopeModuleId,
            previousAssigneeUserId: previous?.assigneeUserId || null,
            nextAssigneeUserId: nextRecord.assigneeUserId,
            nextAssigneeRole: nextRecord.assigneeRole,
            assignedByUserId: nextRecord.assignedByUserId,
            assignmentMode,
            assignmentReason,
            payload: metadata,
            createdAt: now
        });

        store.assignmentEvents.push(assignmentEvent);
        store.assignmentEvents = trimArrayRight(store.assignmentEvents, ASSIGNMENT_EVENTS_FILE_LIMIT);
        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });

        await recordConversationEvent(cleanTenantId, {
            eventType: 'chat.assignment.changed',
            eventSource: 'system',
            chatId,
            scopeModuleId,
            actorUserId: assignedByUserId,
            actorRole: null,
            payload: {
                previousAssigneeUserId: previous?.assigneeUserId || null,
                nextAssigneeUserId: nextRecord.assigneeUserId,
                nextAssigneeRole: nextRecord.assigneeRole,
                assignmentMode,
                assignmentReason
            }
        });

        return { assignment: nextRecord, previous, changed: (previous?.assigneeUserId || null) !== (nextRecord.assigneeUserId || null) };
    }

    await ensureConversationOpsSchema();

    await queryPostgres(
        `INSERT INTO tenant_chat_assignments (
            tenant_id, chat_id, scope_module_id, assignee_user_id, assignee_role, assigned_by_user_id,
            assignment_mode, assignment_reason, metadata, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW(), NOW())
        ON CONFLICT (tenant_id, chat_id, scope_module_id)
        DO UPDATE SET
            assignee_user_id = EXCLUDED.assignee_user_id,
            assignee_role = EXCLUDED.assignee_role,
            assigned_by_user_id = EXCLUDED.assigned_by_user_id,
            assignment_mode = EXCLUDED.assignment_mode,
            assignment_reason = EXCLUDED.assignment_reason,
            metadata = COALESCE(tenant_chat_assignments.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            status = EXCLUDED.status,
            updated_at = NOW()`,
        [
            cleanTenantId,
            chatId,
            scopeModuleId,
            nextRecord.assigneeUserId,
            nextRecord.assigneeRole,
            nextRecord.assignedByUserId,
            nextRecord.assignmentMode,
            nextRecord.assignmentReason,
            JSON.stringify(nextRecord.metadata || {}),
            nextRecord.status
        ]
    );

    await queryPostgres(
        `INSERT INTO tenant_chat_assignment_events (
            tenant_id, assignment_event_id, chat_id, scope_module_id, previous_assignee_user_id, next_assignee_user_id,
            next_assignee_role, assigned_by_user_id, assignment_mode, assignment_reason, payload, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())`,
        [
            cleanTenantId,
            createId('ASG'),
            chatId,
            scopeModuleId,
            previous?.assigneeUserId || null,
            nextRecord.assigneeUserId,
            nextRecord.assigneeRole,
            nextRecord.assignedByUserId,
            nextRecord.assignmentMode,
            nextRecord.assignmentReason,
            JSON.stringify(nextRecord.metadata || {})
        ]
    );

    await recordConversationEvent(cleanTenantId, {
        eventType: 'chat.assignment.changed',
        eventSource: 'system',
        chatId,
        scopeModuleId,
        actorUserId: assignedByUserId,
        actorRole: null,
        payload: {
            previousAssigneeUserId: previous?.assigneeUserId || null,
            nextAssigneeUserId: nextRecord.assigneeUserId,
            nextAssigneeRole: nextRecord.assigneeRole,
            assignmentMode,
            assignmentReason
        }
    });

    return { assignment: nextRecord, previous, changed: (previous?.assigneeUserId || null) !== (nextRecord.assigneeUserId || null) };
}

async function clearChatAssignment(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    return upsertChatAssignment(tenantId, {
        ...payload,
        assigneeUserId: null,
        assigneeRole: null,
        status: 'released'
    });
}

module.exports = {
    recordConversationEvent,
    listConversationEvents,
    getChatAssignment,
    listChatAssignments,
    listChatAssignmentEvents,
    upsertChatAssignment,
    clearChatAssignment
};



