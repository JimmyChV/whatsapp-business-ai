const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    normalizeTenantId
} = require('../../persistence_runtime');

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

function nowIso() {
    return new Date().toISOString();
}

function resolveTenantId(input = null) {
    if (typeof input === 'string') return normalizeTenantId(input || DEFAULT_TENANT_ID);
    if (input && typeof input === 'object') return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    return DEFAULT_TENANT_ID;
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function normalizeChatId(value = '') {
    return toText(value);
}

function normalizeScopeModuleId(value = '') {
    return toLower(value);
}

function normalizeEventType(value = '') {
    return toLower(value).replace(/\s+/g, '_');
}

function normalizeEventSource(value = '') {
    const source = toLower(value);
    if (!source) return 'system';
    if (['socket', 'http', 'worker', 'system', 'webhook', 'automation'].includes(source)) return source;
    return 'system';
}

function normalizeMode(value = '') {
    const mode = toLower(value);
    if (mode === 'auto' || mode === 'automatic') return 'auto';
    if (mode === 'manual') return 'manual';
    if (mode === 'fallback') return 'fallback';
    return 'manual';
}

function normalizeStatus(value = '') {
    const status = toLower(value);
    if (['active', 'released', 'reassigned'].includes(status)) return status;
    return 'active';
}

function normalizeLimit(value = DEFAULT_LIMIT) {
    const parsed = Number(value || DEFAULT_LIMIT);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function normalizeOffset(value = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

function normalizeObject(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function createId(prefix = 'EVT') {
    const cleanPrefix = toText(prefix || 'EVT').toUpperCase() || 'EVT';
    const stamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${cleanPrefix}-${stamp}${random}`;
}

function trimArrayRight(items = [], maxSize = 1000) {
    const source = Array.isArray(items) ? items : [];
    if (source.length <= maxSize) return source;
    return source.slice(source.length - maxSize);
}

function normalizeEventRecord(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        eventId: toText(source.eventId || source.event_id || createId('EVT')),
        chatId: normalizeChatId(source.chatId || source.chat_id),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id),
        customerId: toText(source.customerId || source.customer_id) || null,
        actorUserId: toText(source.actorUserId || source.actor_user_id) || null,
        actorRole: toLower(source.actorRole || source.actor_role) || null,
        eventType: normalizeEventType(source.eventType || source.event_type || 'conversation.event'),
        eventSource: normalizeEventSource(source.eventSource || source.event_source || 'system'),
        payload: normalizeObject(source.payload),
        createdAt: toText(source.createdAt || source.created_at || nowIso()) || nowIso()
    };
}

function normalizeAssignmentRecord(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        chatId: normalizeChatId(source.chatId || source.chat_id),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id),
        assigneeUserId: toText(source.assigneeUserId || source.assignee_user_id) || null,
        assigneeRole: toLower(source.assigneeRole || source.assignee_role) || null,
        assignedByUserId: toText(source.assignedByUserId || source.assigned_by_user_id) || null,
        assignmentMode: normalizeMode(source.assignmentMode || source.assignment_mode || 'manual'),
        assignmentReason: toText(source.assignmentReason || source.assignment_reason) || null,
        metadata: normalizeObject(source.metadata),
        status: normalizeStatus(source.status || 'active'),
        createdAt: toText(source.createdAt || source.created_at || nowIso()) || nowIso(),
        updatedAt: toText(source.updatedAt || source.updated_at || nowIso()) || nowIso()
    };
}

function normalizeAssignmentEventRecord(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        assignmentEventId: toText(source.assignmentEventId || source.assignment_event_id || createId('ASG')),
        chatId: normalizeChatId(source.chatId || source.chat_id),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id),
        previousAssigneeUserId: toText(source.previousAssigneeUserId || source.previous_assignee_user_id) || null,
        nextAssigneeUserId: toText(source.nextAssigneeUserId || source.next_assignee_user_id) || null,
        nextAssigneeRole: toLower(source.nextAssigneeRole || source.next_assignee_role) || null,
        assignedByUserId: toText(source.assignedByUserId || source.assigned_by_user_id) || null,
        assignmentMode: normalizeMode(source.assignmentMode || source.assignment_mode || 'manual'),
        assignmentReason: toText(source.assignmentReason || source.assignment_reason) || null,
        payload: normalizeObject(source.payload),
        createdAt: toText(source.createdAt || source.created_at || nowIso()) || nowIso()
    };
}

function normalizeStore(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return {
        events: Array.isArray(source.events) ? source.events.map((entry) => normalizeEventRecord(entry)).filter((entry) => entry.chatId && entry.eventType) : [],
        assignments: Array.isArray(source.assignments) ? source.assignments.map((entry) => normalizeAssignmentRecord(entry)).filter((entry) => entry.chatId) : [],
        assignmentEvents: Array.isArray(source.assignmentEvents) ? source.assignmentEvents.map((entry) => normalizeAssignmentEventRecord(entry)).filter((entry) => entry.chatId) : []
    };
}

function assignmentKey(chatId = '', scopeModuleId = '') {
    return `${normalizeChatId(chatId)}::${normalizeScopeModuleId(scopeModuleId)}`;
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

module.exports = {
    DEFAULT_LIMIT,
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
};

