const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const AUDIT_FILE = 'audit_logs.json';
const TECHNICAL_AUDIT_ACTIONS = new Set([
    'wa.transport_mode.changed',
    'wa.transport_mode.autoset_by_module',
    'auth.refresh.success',
    'auth.refresh.failed'
]);

function resolveTenantId(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function nowIso() {
    return new Date().toISOString();
}

function toText(value = '', fallback = null) {
    const clean = String(value ?? '').trim();
    return clean || fallback;
}

function toSafePayload(value = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
}

function normalizeRole(value = '') {
    const role = String(value || '').trim().toLowerCase();
    if (['owner', 'admin', 'seller', 'superadmin'].includes(role)) return role;
    return 'seller';
}

function getRequestIp(req = {}) {
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || toText(req?.ip || req?.socket?.remoteAddress);
}

function getRequestUser(req = {}) {
    return req?.authContext?.user || req?.user || {};
}

function getRequestTenantId(req = {}, fallbackTenantId = null) {
    const user = getRequestUser(req);
    return toText(
        fallbackTenantId
        || req?.tenantContext?.id
        || req?.tenantId
        || user?.tenantId
        || user?.tenant_id
        || DEFAULT_TENANT_ID,
        DEFAULT_TENANT_ID
    );
}

function isTechnicalAuditAction(action = '') {
    return TECHNICAL_AUDIT_ACTIONS.has(toText(action, ''));
}

function getRequestRole(req = {}) {
    const user = getRequestUser(req);
    if (user?.isSuperAdmin) return 'superadmin';
    return normalizeRole(user?.role || user?.primaryRole);
}

async function writeRequestAuditLog(req = {}, {
    tenantId = null,
    action = 'unknown_action',
    resourceType = null,
    resourceId = null,
    oldValue = null,
    newValue = null,
    payload = null,
    source = 'api'
} = {}) {
    try {
        const user = getRequestUser(req);
        return await writeAuditLog(getRequestTenantId(req, tenantId), {
            userId: toText(user?.userId || user?.id),
            userEmail: toText(user?.email),
            role: getRequestRole(req),
            action,
            resourceType,
            resourceId,
            source,
            ip: getRequestIp(req),
            userAgent: toText(req?.headers?.['user-agent']),
            payload: {
                ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
                oldValue: oldValue || null,
                newValue: newValue || null
            }
        });
    } catch (error) {
        console.warn('[audit] no se pudo registrar evento:', String(error?.message || error));
        return null;
    }
}

function getAuditFileLimit() {
    const raw = Number(process.env.SAAS_AUDIT_FILE_LIMIT || 5000);
    if (!Number.isFinite(raw) || raw < 200) return 5000;
    return Math.floor(raw);
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

function normalizeDateFilter(value = '') {
    const text = toText(value);
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function buildPostgresFilters(cleanTenant, filters = {}) {
    const isGlobalScope = !cleanTenant || cleanTenant === DEFAULT_TENANT_ID;
    const includeUserGlobalLogs = Boolean(filters.includeUserGlobalLogs);
    const currentUserId = toText(filters.currentUserId);
    const clauses = [];
    const joins = [];
    const params = [];
    if (isGlobalScope) {
        params.push(DEFAULT_TENANT_ID);
        clauses.push('(audit_logs.tenant_id IS NULL OR audit_logs.tenant_id = $1)');
    } else if (includeUserGlobalLogs && currentUserId) {
        params.push(cleanTenant, currentUserId);
        clauses.push('(audit_logs.tenant_id = $1 OR (audit_logs.tenant_id IS NULL AND audit_logs.user_id = $2))');
    } else {
        params.push(cleanTenant);
        clauses.push('audit_logs.tenant_id = $1');
    }
    const userSearch = toText(filters.userSearch || filters.userId);
    const action = toText(filters.action);
    const fromDate = normalizeDateFilter(filters.from);
    const toDate = normalizeDateFilter(filters.to);

    if (userSearch) {
        params.push(`%${userSearch}%`);
        const partialIndex = params.length;
        params.push(userSearch);
        const exactIndex = params.length;
        joins.push('LEFT JOIN users u ON u.user_id = audit_logs.user_id');
        clauses.push(`(
            u.email ILIKE $${partialIndex}
            OR u.display_name ILIKE $${partialIndex}
            OR audit_logs.user_id = $${exactIndex}
        )`);
    }
    if (action) {
        params.push(action);
        clauses.push(`audit_logs.action = $${params.length}`);
    }
    if (fromDate) {
        params.push(fromDate.toISOString());
        clauses.push(`audit_logs.created_at >= $${params.length}`);
    }
    if (toDate) {
        params.push(toDate.toISOString());
        clauses.push(`audit_logs.created_at <= $${params.length}`);
    }

    const blockedActionPlaceholders = Array.from(TECHNICAL_AUDIT_ACTIONS).map((blockedAction) => {
        params.push(blockedAction);
        return `$${params.length}`;
    });
    clauses.push(`audit_logs.action NOT IN (${blockedActionPlaceholders.join(', ')})`);

    return { clauses, joins, params };
}

function matchesFileFilters(item = {}, filters = {}) {
    const userSearch = toText(filters.userSearch || filters.userId);
    const action = toText(filters.action);
    const fromDate = normalizeDateFilter(filters.from);
    const toDate = normalizeDateFilter(filters.to);
    const createdAt = normalizeDateFilter(item.createdAt);
    const displayName = toText(item?.payload?.displayName || item?.payload?.userDisplayName || '', '');
    const userEmail = toText(item.userEmail || item?.payload?.userEmail || '', '');

    if (isTechnicalAuditAction(item?.action)) return false;
    if (userSearch) {
        const search = userSearch.toLowerCase();
        const exactUserId = toText(item.userId);
        const matchesPartial = userEmail.toLowerCase().includes(search) || displayName.toLowerCase().includes(search);
        if (!matchesPartial && exactUserId !== userSearch) return false;
    }
    if (action && toText(item.action) !== action) return false;
    if (fromDate && (!createdAt || createdAt < fromDate)) return false;
    if (toDate && (!createdAt || createdAt > toDate)) return false;
    return true;
}

async function writeAuditLog(tenantId = DEFAULT_TENANT_ID, entry = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    if (isTechnicalAuditAction(entry?.action)) {
        return {
            skipped: true,
            reason: 'technical_audit_action',
            action: toText(entry?.action, 'unknown_action'),
            tenantId: cleanTenant
        };
    }
    const record = {
        id: toText(entry.id) || `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        tenantId: cleanTenant,
        userId: toText(entry.userId),
        userEmail: toText(entry.userEmail),
        role: normalizeRole(entry.role),
        action: toText(entry.action, 'unknown_action'),
        resourceType: toText(entry.resourceType),
        resourceId: toText(entry.resourceId),
        source: toText(entry.source, 'api'),
        socketId: toText(entry.socketId),
        ip: toText(entry.ip || entry.ipAddress),
        payload: toSafePayload(entry.payload),
        createdAt: toText(entry.createdAt, nowIso())
    };

    if (getStorageDriver() === 'postgres') {
        try {
            const { rows } = await queryPostgres(
                `INSERT INTO audit_logs (
                    tenant_id, user_id, action, resource_type, resource_id, payload, ip_address, user_agent, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW()
                )
                RETURNING id, created_at`,
                [
                    cleanTenant,
                    record.userId,
                    record.action,
                    record.resourceType,
                    record.resourceId,
                    JSON.stringify({
                        source: record.source,
                        socketId: record.socketId,
                        userEmail: record.userEmail,
                        role: record.role,
                        ip: record.ip,
                        data: record.payload
                    }),
                    record.ip,
                    toText(entry.userAgent)
                ]
            );

            return {
                ...record,
                id: String(rows?.[0]?.id || record.id),
                createdAt: rows?.[0]?.created_at ? new Date(rows[0].created_at).toISOString() : record.createdAt,
                driver: 'postgres'
            };
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const current = await readTenantJsonFile(AUDIT_FILE, {
        tenantId: cleanTenant,
        defaultValue: []
    });
    const items = Array.isArray(current) ? current : [];
    items.unshift(record);
    const limit = getAuditFileLimit();
    await writeTenantJsonFile(AUDIT_FILE, items.slice(0, limit), { tenantId: cleanTenant });
    return { ...record, driver: 'file' };
}

async function logAction({
    tenantId = DEFAULT_TENANT_ID,
    userId = null,
    action = 'unknown_action',
    entityType = null,
    entityId = null,
    oldValue = null,
    newValue = null,
    ipAddress = null,
    userAgent = null
} = {}) {
    return writeAuditLog(tenantId, {
        userId,
        action,
        resourceType: entityType,
        resourceId: entityId,
        ipAddress,
        userAgent,
        payload: {
            oldValue: oldValue || null,
            newValue: newValue || null
        }
    });
}

async function listAuditLogs(tenantId = DEFAULT_TENANT_ID, {
    limit = 100,
    offset = 0,
    userId = '',
    userSearch = '',
    action = '',
    from = '',
    to = '',
    currentUserId = '',
    includeUserGlobalLogs = false
} = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const filters = { userId, userSearch, action, from, to, currentUserId, includeUserGlobalLogs };

    if (getStorageDriver() === 'postgres') {
        try {
            const { clauses, joins, params } = buildPostgresFilters(cleanTenant, filters);
            params.push(safeLimit, safeOffset);
            const limitIndex = params.length - 1;
            const offsetIndex = params.length;
            const { rows } = await queryPostgres(
                `SELECT
                        audit_logs.id,
                        audit_logs.tenant_id,
                        audit_logs.user_id,
                        audit_logs.action,
                        audit_logs.resource_type,
                        audit_logs.resource_id,
                        audit_logs.payload,
                        audit_logs.created_at
                   FROM audit_logs
                   ${joins.join(' ')}
                  WHERE ${clauses.join(' AND ')}
                  ORDER BY audit_logs.created_at DESC
                  LIMIT $${limitIndex}
                 OFFSET $${offsetIndex}`,
                params
            );

            return (rows || []).map((row) => {
                const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
                return {
                    id: String(row.id || ''),
                    tenantId: String(row.tenant_id || cleanTenant),
                    userId: toText(row.user_id),
                    userEmail: toText(payload.userEmail),
                    role: normalizeRole(payload.role),
                    action: toText(row.action, 'unknown_action'),
                    resourceType: toText(row.resource_type),
                    resourceId: toText(row.resource_id),
                    source: toText(payload.source, 'api'),
                    socketId: toText(payload.socketId),
                    ip: toText(payload.ip),
                    payload: toSafePayload(payload.data),
                    createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso()
                };
            });
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const current = await readTenantJsonFile(AUDIT_FILE, {
        tenantId: cleanTenant,
        defaultValue: []
    });
    const items = Array.isArray(current) ? current : [];
    return items.filter((item) => matchesFileFilters(item, filters)).slice(safeOffset, safeOffset + safeLimit);
}

async function searchAuditUsers(tenantId = DEFAULT_TENANT_ID, {
    search = '',
    limit = 8
} = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const cleanSearch = toText(search);
    const safeLimit = Math.min(10, Math.max(1, Number(limit) || 8));
    if (!cleanTenant || cleanTenant === DEFAULT_TENANT_ID || !cleanSearch) return [];
    if (getStorageDriver() !== 'postgres') return [];

    try {
        const partial = `%${cleanSearch}%`;
        const { rows } = await queryPostgres(
            `SELECT DISTINCT
                    u.user_id,
                    u.email,
                    COALESCE(NULLIF(BTRIM(u.display_name), ''), u.email, u.user_id) AS display_name
               FROM memberships m
               JOIN users u
                 ON u.user_id = m.user_id
              WHERE m.tenant_id = $1
                AND m.is_active = TRUE
                AND u.is_active = TRUE
                AND (
                    u.email ILIKE $2
                    OR u.display_name ILIKE $2
                    OR u.user_id = $3
                )
              ORDER BY CASE WHEN u.user_id = $3 THEN 0 ELSE 1 END,
                       LOWER(COALESCE(NULLIF(BTRIM(u.display_name), ''), u.email, u.user_id)) ASC
              LIMIT $4`,
            [cleanTenant, partial, cleanSearch, safeLimit]
        );

        return (rows || []).map((row) => ({
            userId: toText(row.user_id),
            email: toText(row.email),
            displayName: toText(row.display_name || row.email || row.user_id)
        })).filter((item) => item.userId);
    } catch (error) {
        if (!missingRelation(error)) throw error;
        return [];
    }
}

module.exports = {
    writeAuditLog,
    writeRequestAuditLog,
    logAction,
    listAuditLogs,
    searchAuditUsers
};


