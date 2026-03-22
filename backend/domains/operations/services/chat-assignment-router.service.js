const { getStorageDriver, queryPostgres } = require('../../../persistence_runtime');
const assignmentRulesService = require('./assignment-rules.service');
const conversationOpsService = require('./conversation-ops.service');
const saasControlService = require('../../tenant/services/tenant-control.service');
const waModuleService = require('../../tenant/services/wa-modules.service');

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeScopeModuleId(value = '') {
    return toText(value).toLowerCase();
}

function normalizeTenantRole(value = '') {
    const role = toText(value).toLowerCase();
    if (['owner', 'admin', 'seller'].includes(role)) return role;
    return 'seller';
}

function resolveUserRoleForTenant(user = {}, tenantId = '') {
    const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
    const match = memberships.find((membership) =>
        String(membership?.tenantId || '').trim() === tenantId && membership?.active !== false
    );
    return normalizeTenantRole(match?.role || user?.role || 'seller');
}

async function resolveCandidateUsersForTenant(tenantId = '', {
    allowedRoles = [],
    scopeModuleId = ''
} = {}) {
    const cleanTenantId = toText(tenantId);
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');
    const allowedRoleSet = new Set((Array.isArray(allowedRoles) ? allowedRoles : [])
        .map((entry) => normalizeTenantRole(entry)));

    await saasControlService.ensureLoaded();

    const users = saasControlService.listUsersSync({ includeInactive: false, tenantId: cleanTenantId });
    const baseCandidates = (Array.isArray(users) ? users : [])
        .filter((user) => {
            const role = resolveUserRoleForTenant(user, cleanTenantId);
            if (allowedRoleSet.size > 0 && !allowedRoleSet.has(role)) return false;
            const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
            return memberships.some((membership) =>
                String(membership?.tenantId || '').trim() === cleanTenantId && membership?.active !== false
            );
        })
        .map((user) => ({
            userId: String(user?.id || '').trim(),
            role: resolveUserRoleForTenant(user, cleanTenantId),
            name: String(user?.name || '').trim() || String(user?.email || '').trim() || String(user?.id || '').trim()
        }))
        .filter((user) => Boolean(user.userId));

    if (!cleanScopeModuleId) return baseCandidates;

    const modules = await waModuleService.listModules(cleanTenantId, { includeInactive: false });
    const module = (Array.isArray(modules) ? modules : []).find((entry) =>
        String(entry?.moduleId || '').trim().toLowerCase() === cleanScopeModuleId
    );

    if (!module) return baseCandidates;

    const assignedUserIds = Array.isArray(module?.assignedUserIds)
        ? module.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];

    if (assignedUserIds.length === 0) return baseCandidates;
    const set = new Set(assignedUserIds);
    return baseCandidates.filter((entry) => set.has(entry.userId));
}

async function listOpenChatCounts(tenantId = '', { scopeModuleId = '' } = {}) {
    const cleanTenantId = toText(tenantId);
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');

    if (getStorageDriver() !== 'postgres') {
        const assignments = await conversationOpsService.listChatAssignments(cleanTenantId, {
            scopeModuleId: cleanScopeModuleId,
            status: 'active',
            limit: 500,
            offset: 0
        });

        const counts = new Map();
        const items = Array.isArray(assignments?.items) ? assignments.items : [];
        items.forEach((item) => {
            const userId = toText(item?.assigneeUserId);
            if (!userId) return;
            counts.set(userId, Number(counts.get(userId) || 0) + 1);
        });
        return counts;
    }

    const params = [cleanTenantId, 'active'];
    let whereSql = 'tenant_id = $1 AND status = $2';
    if (cleanScopeModuleId) {
        params.push(cleanScopeModuleId);
        whereSql += ` AND scope_module_id = $${params.length}`;
    }

    const result = await queryPostgres(
        `SELECT assignee_user_id, COUNT(*)::BIGINT AS total
           FROM tenant_chat_assignments
          WHERE ${whereSql}
            AND assignee_user_id IS NOT NULL
          GROUP BY assignee_user_id`,
        params
    );

    const counts = new Map();
    (Array.isArray(result.rows) ? result.rows : []).forEach((row) => {
        const userId = toText(row.assignee_user_id);
        if (!userId) return;
        counts.set(userId, Number(row.total || 0));
    });
    return counts;
}

function pickLeastLoadCandidate(candidates = [], counts = new Map(), maxOpenChatsPerUser = null) {
    const source = Array.isArray(candidates) ? candidates : [];
    const filtered = source
        .map((candidate) => ({ ...candidate, openChats: Number(counts.get(candidate.userId) || 0) }))
        .filter((candidate) => {
            if (!Number.isFinite(Number(maxOpenChatsPerUser)) || maxOpenChatsPerUser === null) return true;
            return candidate.openChats < Number(maxOpenChatsPerUser);
        })
        .sort((a, b) => {
            if (a.openChats !== b.openChats) return a.openChats - b.openChats;
            return String(a.userId || '').localeCompare(String(b.userId || ''), 'es', { sensitivity: 'base' });
        });

    return filtered[0] || null;
}

function pickRoundRobinCandidate(candidates = [], lastAssignedUserId = '', maxOpenChatsPerUser = null, counts = new Map()) {
    const source = (Array.isArray(candidates) ? candidates : [])
        .map((candidate) => ({ ...candidate, openChats: Number(counts.get(candidate.userId) || 0) }))
        .filter((candidate) => {
            if (!Number.isFinite(Number(maxOpenChatsPerUser)) || maxOpenChatsPerUser === null) return true;
            return candidate.openChats < Number(maxOpenChatsPerUser);
        })
        .sort((a, b) => String(a.userId || '').localeCompare(String(b.userId || ''), 'es', { sensitivity: 'base' }));

    if (source.length === 0) return null;

    const last = toText(lastAssignedUserId);
    if (!last) return source[0];

    const currentIndex = source.findIndex((entry) => entry.userId === last);
    if (currentIndex < 0) return source[0];

    const nextIndex = (currentIndex + 1) % source.length;
    return source[nextIndex];
}

async function autoAssignChat(tenantId = '', {
    chatId = '',
    scopeModuleId = '',
    actorUserId = null,
    trigger = 'manual',
    assignmentReason = ''
} = {}) {
    const cleanTenantId = toText(tenantId);
    const cleanChatId = toText(chatId);
    const cleanScopeModuleId = normalizeScopeModuleId(scopeModuleId || '');
    const cleanActorUserId = toText(actorUserId) || null;

    if (!cleanTenantId) throw new Error('tenantId requerido para autoasignar.');
    if (!cleanChatId) throw new Error('chatId requerido para autoasignar.');

    const existing = await conversationOpsService.getChatAssignment(cleanTenantId, {
        chatId: cleanChatId,
        scopeModuleId: cleanScopeModuleId
    });

    if (existing?.assigneeUserId && existing?.status === 'active') {
        return {
            ok: true,
            mode: 'existing',
            reused: true,
            assignment: existing,
            reason: 'already_assigned'
        };
    }

    const effective = await assignmentRulesService.getEffectiveRule(cleanTenantId, cleanScopeModuleId);
    const rule = effective?.rule || null;
    if (!rule || rule.enabled !== true) {
        return {
            ok: false,
            mode: 'disabled',
            reused: false,
            assignment: null,
            reason: 'rule_disabled',
            rule
        };
    }

    const candidates = await resolveCandidateUsersForTenant(cleanTenantId, {
        allowedRoles: rule.allowedRoles,
        scopeModuleId: cleanScopeModuleId
    });

    if (candidates.length === 0) {
        return {
            ok: false,
            mode: 'no_candidates',
            reused: false,
            assignment: null,
            reason: 'no_candidates',
            rule
        };
    }

    const counts = await listOpenChatCounts(cleanTenantId, { scopeModuleId: cleanScopeModuleId });
    let selected = null;

    if (rule.mode === 'round_robin') {
        selected = pickRoundRobinCandidate(candidates, String(rule?.metadata?.lastAssignedUserId || ''), rule.maxOpenChatsPerUser, counts);
    } else {
        selected = pickLeastLoadCandidate(candidates, counts, rule.maxOpenChatsPerUser);
    }

    if (!selected) {
        return {
            ok: false,
            mode: rule.mode,
            reused: false,
            assignment: null,
            reason: 'capacity_reached',
            rule
        };
    }

    const reason = toText(assignmentReason) || `auto:${toText(trigger) || 'manual'}`;
    const result = await conversationOpsService.upsertChatAssignment(cleanTenantId, {
        chatId: cleanChatId,
        scopeModuleId: cleanScopeModuleId,
        assigneeUserId: selected.userId,
        assigneeRole: selected.role,
        assignedByUserId: cleanActorUserId,
        assignmentMode: 'auto',
        assignmentReason: reason,
        metadata: {
            trigger: toText(trigger) || 'manual',
            openChatsAtAssign: Number(counts.get(selected.userId) || 0),
            candidateCount: candidates.length,
            ruleScope: effective?.sourceScopeModuleId || ''
        },
        status: 'active'
    });

    if (rule.mode === 'round_robin') {
        await assignmentRulesService.upsertRule(cleanTenantId, {
            scopeModuleId: effective?.sourceScopeModuleId || cleanScopeModuleId,
            enabled: rule.enabled,
            mode: rule.mode,
            allowedRoles: rule.allowedRoles,
            maxOpenChatsPerUser: rule.maxOpenChatsPerUser,
            updatedByUserId: cleanActorUserId,
            metadata: {
                ...(rule.metadata && typeof rule.metadata === 'object' ? rule.metadata : {}),
                lastAssignedUserId: selected.userId,
                lastAssignedAt: new Date().toISOString()
            }
        });
    }

    return {
        ok: true,
        mode: rule.mode,
        reused: false,
        assignment: result?.assignment || null,
        previous: result?.previous || null,
        changed: Boolean(result?.changed),
        selectedCandidate: selected,
        rule
    };
}

module.exports = {
    autoAssignChat,
    resolveCandidateUsersForTenant,
    listOpenChatCounts
};

