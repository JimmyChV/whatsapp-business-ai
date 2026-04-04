const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
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
} = require('../helpers/conversation-ops.helpers');
const { ensureConversationOpsSchema } = require('../helpers/conversation-ops.schema');
const customerModuleContextsService = require('./customer-module-contexts.service');

const STORE_FILE = 'conversation_ops.json';
const EVENTS_FILE_LIMIT = Math.max(500, Number(process.env.CONVERSATION_EVENTS_FILE_LIMIT || 5000));
const ASSIGNMENT_EVENTS_FILE_LIMIT = Math.max(500, Number(process.env.ASSIGNMENT_EVENTS_FILE_LIMIT || 5000));
const assignmentChangedListeners = new Set();

function extractPhoneCandidatesFromChatId(chatId = '') {
    const clean = toText(chatId);
    const base = clean.split('@')[0].trim();
    const digits = base.replace(/[^\d]/g, '');
    const out = [];
    if (digits) {
        out.push(`+${digits}`);
        out.push(digits);
    }
    return out;
}

async function resolveCustomerIdFromChat(tenantId = DEFAULT_TENANT_ID, { chatId = '', scopeModuleId = '' } = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const cleanChatId = normalizeChatId(chatId);
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');
    if (!cleanChatId) return null;

    if (getStorageDriver() === 'postgres') {
        try {
            const params = [cleanTenantId, cleanChatId];
            let scopeSql = '';
            if (cleanScopeModuleId) {
                params.push(cleanScopeModuleId);
                scopeSql = ` AND LOWER(COALESCE(module_id, '')) = LOWER($${params.length})`;
            }
            const eventResult = await queryPostgres(
                `SELECT customer_id
                   FROM tenant_channel_events
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND COALESCE(customer_id, '') <> ''${scopeSql}
                  ORDER BY created_at DESC
                  LIMIT 1`,
                params
            );
            const eventCustomerId = toText(eventResult?.rows?.[0]?.customer_id || '');
            if (eventCustomerId) return eventCustomerId;

            const phoneCandidates = extractPhoneCandidatesFromChatId(cleanChatId);
            for (const phone of phoneCandidates) {
                const customerParams = [cleanTenantId, phone];
                let moduleSql = '';
                if (cleanScopeModuleId) {
                    customerParams.push(cleanScopeModuleId);
                    moduleSql = ` AND LOWER(COALESCE(module_id, '')) = LOWER($${customerParams.length})`;
                }
                const customerResult = await queryPostgres(
                    `SELECT customer_id
                       FROM tenant_customers
                      WHERE tenant_id = $1
                        AND phone_e164 = $2${moduleSql}
                      ORDER BY updated_at DESC
                      LIMIT 1`,
                    customerParams
                );
                const customerId = toText(customerResult?.rows?.[0]?.customer_id || '');
                if (customerId) return customerId;
            }
        } catch (_) {
            return null;
        }
        return null;
    }

    try {
        const customersStore = await readTenantJsonFile('customers.json', {
            tenantId: cleanTenantId,
            defaultValue: { items: [] }
        });
        const items = Array.isArray(customersStore?.items) ? customersStore.items : [];
        const phoneCandidates = extractPhoneCandidatesFromChatId(cleanChatId);
        const matched = items.find((entry) => {
            const customerPhone = toText(entry?.phoneE164 || entry?.phone_e164 || '');
            const customerModuleId = toText(entry?.moduleId || entry?.module_id || '').toLowerCase();
            const moduleMatch = !cleanScopeModuleId || customerModuleId === cleanScopeModuleId;
            return moduleMatch && phoneCandidates.some((phone) => customerPhone === phone);
        });
        return toText(matched?.customerId || matched?.customer_id || '') || null;
    } catch (_) {
        return null;
    }
}

function emitChatAssignmentChanged(payload = {}) {
    assignmentChangedListeners.forEach((listener) => {
        try {
            listener(payload);
        } catch (_) { }
    });
}

function onChatAssignmentChanged(listener) {
    if (typeof listener !== 'function') return () => { };
    assignmentChangedListeners.add(listener);
    return () => {
        assignmentChangedListeners.delete(listener);
    };
}

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
                    assignment_mode, assignment_reason, metadata, status,
                    last_activity_at, last_customer_message_at, waiting_since,
                    created_at, updated_at
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
            last_activity_at: row.last_activity_at,
            last_customer_message_at: row.last_customer_message_at,
            waiting_since: row.waiting_since,
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
                    assignment_mode, assignment_reason, metadata, status,
                    last_activity_at, last_customer_message_at, waiting_since,
                    created_at, updated_at
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

async function markChatAssignmentWaiting(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(payload.chatId || '');
    const scopeModuleId = normalizeScopeModuleId(payload.scopeModuleId || '');
    if (!chatId) throw new Error('chatId requerido para marcar en espera.');

    const current = await getChatAssignment(cleanTenantId, { chatId, scopeModuleId });
    if (!current) return { assignment: null, previous: null, changed: false, reason: 'not_found' };
    if (current.status === 'en_espera') return { assignment: current, previous: current, changed: false, reason: 'already_waiting' };

    const at = toText(payload.at || '') || nowIso();
    const reason = toText(payload.reason || payload.assignmentReason || '') || 'inactive_48h';

    return upsertChatAssignment(cleanTenantId, {
        chatId,
        scopeModuleId,
        assigneeUserId: current.assigneeUserId,
        assigneeRole: current.assigneeRole,
        assignedByUserId: toText(payload.actorUserId || payload.assignedByUserId || '') || null,
        assignmentMode: 'auto',
        assignmentReason: reason,
        metadata: normalizeObject(payload.metadata),
        status: 'en_espera',
        lastActivityAt: current.lastActivityAt || at,
        lastCustomerMessageAt: current.lastCustomerMessageAt || null,
        waitingSince: at
    });
}

async function reactivateChatAssignmentOnCustomerReply(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(payload.chatId || '');
    const scopeModuleId = normalizeScopeModuleId(payload.scopeModuleId || '');
    if (!chatId) throw new Error('chatId requerido para reactivar asignacion.');

    const current = await getChatAssignment(cleanTenantId, { chatId, scopeModuleId });
    if (!current) return { shouldAutoAssign: true, assignment: null, previous: null, changed: false, reason: 'not_found' };
    if (current.status !== 'en_espera') return { shouldAutoAssign: false, assignment: current, previous: current, changed: false, reason: 'not_waiting' };

    const at = toText(payload.at || '') || nowIso();
    const result = await upsertChatAssignment(cleanTenantId, {
        chatId,
        scopeModuleId,
        assigneeUserId: null,
        assigneeRole: null,
        assignedByUserId: toText(payload.actorUserId || payload.assignedByUserId || '') || null,
        assignmentMode: 'auto',
        assignmentReason: 'customer_reply_after_waiting',
        metadata: normalizeObject(payload.metadata),
        status: 'released',
        lastActivityAt: at,
        lastCustomerMessageAt: at,
        waitingSince: null
    });

    return { ...result, shouldAutoAssign: true, reason: 'customer_reply_after_waiting' };
}

async function touchChatAssignmentActivity(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const chatId = normalizeChatId(payload.chatId || '');
    const scopeModuleId = normalizeScopeModuleId(payload.scopeModuleId || '');
    if (!chatId) throw new Error('chatId requerido para actualizar actividad.');

    const current = await getChatAssignment(cleanTenantId, { chatId, scopeModuleId });
    if (!current) return null;

    const at = toText(payload.at || '') || nowIso();
    const fromCustomer = payload.fromCustomer === true;
    const nextRecord = normalizeAssignmentRecord({
        ...current,
        lastActivityAt: at,
        lastCustomerMessageAt: fromCustomer ? at : current.lastCustomerMessageAt,
        waitingSince: current.waitingSince
    });

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = assignmentKey(chatId, scopeModuleId);
        const index = store.assignments.findIndex((entry) => assignmentKey(entry.chatId, entry.scopeModuleId) === key);
        if (index >= 0) {
            store.assignments[index] = nextRecord;
            await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        }
        return nextRecord;
    }

    await ensureConversationOpsSchema();
    await queryPostgres(
        `UPDATE tenant_chat_assignments
            SET last_activity_at = $4::timestamptz,
                last_customer_message_at = CASE
                    WHEN $5::boolean THEN $4::timestamptz
                    ELSE last_customer_message_at
                END,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND chat_id = $2
            AND scope_module_id = $3`,
        [cleanTenantId, chatId, scopeModuleId, at, fromCustomer]
    );

    return nextRecord;
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

    const isWaiting = status === 'en_espera';
    const incomingLastActivityAt = toText(payload.lastActivityAt || payload.last_activity_at) || null;
    const incomingLastCustomerMessageAt = toText(payload.lastCustomerMessageAt || payload.last_customer_message_at) || null;
    const incomingWaitingSince = toText(payload.waitingSince || payload.waiting_since) || null;

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
        lastActivityAt: incomingLastActivityAt || previous?.lastActivityAt || now,
        lastCustomerMessageAt: incomingLastCustomerMessageAt || previous?.lastCustomerMessageAt || null,
        waitingSince: isWaiting
            ? (incomingWaitingSince || previous?.waitingSince || now)
            : null,
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

        const changedAssignee = (previous?.assigneeUserId || null) !== (nextRecord.assigneeUserId || null);
        const changedStatus = normalizeStatus(previous?.status || 'active') !== normalizeStatus(nextRecord.status || 'active');
        const changed = changedAssignee || changedStatus;
        emitChatAssignmentChanged({
            tenantId: cleanTenantId,
            chatId,
            scopeModuleId,
            assignment: nextRecord,
            previousAssignment: previous || null,
            changed,
            assignmentMode,
            assignmentReason,
            source: 'conversation_ops.upsert'
        });
        try {
            const moduleId = toText(nextRecord.scopeModuleId || '');
            if (moduleId) {
                const customerId = await resolveCustomerIdFromChat(cleanTenantId, {
                    chatId,
                    scopeModuleId: moduleId
                });
                if (customerId) {
                    await customerModuleContextsService.upsertContext(cleanTenantId, {
                        customerId,
                        moduleId,
                        assignmentUserId: nextRecord.assigneeUserId || null,
                        lastInteractionAt: nextRecord.lastActivityAt || now,
                        metadata: {
                            dualWriteSource: 'conversation_ops.upsert'
                        }
                    });
                }
            }
        } catch (_) {
            // silent: dual-write must not interrupt assignment lifecycle
        }
        return { assignment: nextRecord, previous, changed };
    }

    await ensureConversationOpsSchema();

    await queryPostgres(
        `INSERT INTO tenant_chat_assignments (
            tenant_id, chat_id, scope_module_id, assignee_user_id, assignee_role, assigned_by_user_id,
            assignment_mode, assignment_reason, metadata, status,
            last_activity_at, last_customer_message_at, waiting_since,
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::timestamptz, $12::timestamptz, $13::timestamptz, NOW(), NOW())
        ON CONFLICT (tenant_id, chat_id, scope_module_id)
        DO UPDATE SET
            assignee_user_id = EXCLUDED.assignee_user_id,
            assignee_role = EXCLUDED.assignee_role,
            assigned_by_user_id = EXCLUDED.assigned_by_user_id,
            assignment_mode = EXCLUDED.assignment_mode,
            assignment_reason = EXCLUDED.assignment_reason,
            metadata = COALESCE(tenant_chat_assignments.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            status = EXCLUDED.status,
            last_activity_at = EXCLUDED.last_activity_at,
            last_customer_message_at = EXCLUDED.last_customer_message_at,
            waiting_since = EXCLUDED.waiting_since,
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
            nextRecord.status,
            nextRecord.lastActivityAt,
            nextRecord.lastCustomerMessageAt,
            nextRecord.waitingSince
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

    const changedAssignee = (previous?.assigneeUserId || null) !== (nextRecord.assigneeUserId || null);
    const changedStatus = normalizeStatus(previous?.status || 'active') !== normalizeStatus(nextRecord.status || 'active');
    const changed = changedAssignee || changedStatus;
    emitChatAssignmentChanged({
        tenantId: cleanTenantId,
        chatId,
        scopeModuleId,
        assignment: nextRecord,
        previousAssignment: previous || null,
        changed,
        assignmentMode,
        assignmentReason,
        source: 'conversation_ops.upsert'
    });
    try {
        const moduleId = toText(nextRecord.scopeModuleId || '');
        if (moduleId) {
            const customerId = await resolveCustomerIdFromChat(cleanTenantId, {
                chatId,
                scopeModuleId: moduleId
            });
            if (customerId) {
                await customerModuleContextsService.upsertContext(cleanTenantId, {
                    customerId,
                    moduleId,
                    assignmentUserId: nextRecord.assigneeUserId || null,
                    lastInteractionAt: nextRecord.lastActivityAt || now,
                    metadata: {
                        dualWriteSource: 'conversation_ops.upsert'
                    }
                });
            }
        }
    } catch (_) {
        // silent: dual-write must not interrupt assignment lifecycle
    }
    return { assignment: nextRecord, previous, changed };
}

async function clearChatAssignment(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    return upsertChatAssignment(tenantId, {
        ...payload,
        assigneeUserId: null,
        assigneeRole: null,
        status: 'released',
        waitingSince: null
    });
}

module.exports = {
    recordConversationEvent,
    listConversationEvents,
    getChatAssignment,
    listChatAssignments,
    listChatAssignmentEvents,
    onChatAssignmentChanged,
    markChatAssignmentWaiting,
    reactivateChatAssignmentOnCustomerReply,
    touchChatAssignmentActivity,
    upsertChatAssignment,
    clearChatAssignment
};





