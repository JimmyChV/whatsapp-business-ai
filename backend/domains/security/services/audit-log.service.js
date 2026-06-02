const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const AUDIT_FILE = 'audit_logs.json';

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
    const clauses = [isGlobalScope ? '(tenant_id IS NULL OR tenant_id = $1)' : 'tenant_id = $1'];
    const params = [isGlobalScope ? DEFAULT_TENANT_ID : cleanTenant];
    const userId = toText(filters.userId);
    const action = toText(filters.action);
    const fromDate = normalizeDateFilter(filters.from);
    const toDate = normalizeDateFilter(filters.to);

    if (userId) {
        params.push(userId);
        clauses.push(`user_id = $${params.length}`);
    }
    if (action) {
        params.push(action);
        clauses.push(`action = $${params.length}`);
    }
    if (fromDate) {
        params.push(fromDate.toISOString());
        clauses.push(`created_at >= $${params.length}`);
    }
    if (toDate) {
        params.push(toDate.toISOString());
        clauses.push(`created_at <= $${params.length}`);
    }

    return { clauses, params };
}

function matchesFileFilters(item = {}, filters = {}) {
    const userId = toText(filters.userId);
    const action = toText(filters.action);
    const fromDate = normalizeDateFilter(filters.from);
    const toDate = normalizeDateFilter(filters.to);
    const createdAt = normalizeDateFilter(item.createdAt);

    if (userId && toText(item.userId) !== userId) return false;
    if (action && toText(item.action) !== action) return false;
    if (fromDate && (!createdAt || createdAt < fromDate)) return false;
    if (toDate && (!createdAt || createdAt > toDate)) return false;
    return true;
}

async function writeAuditLog(tenantId = DEFAULT_TENANT_ID, entry = {}) {
    const cleanTenant = resolveTenantId(tenantId);
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

async function listAuditLogs(tenantId = DEFAULT_TENANT_ID, { limit = 100, offset = 0, userId = '', action = '', from = '', to = '' } = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const filters = { userId, action, from, to };

    if (getStorageDriver() === 'postgres') {
        try {
            const { clauses, params } = buildPostgresFilters(cleanTenant, filters);
            params.push(safeLimit, safeOffset);
            const limitIndex = params.length - 1;
            const offsetIndex = params.length;
            const { rows } = await queryPostgres(
                `SELECT id, tenant_id, user_id, action, resource_type, resource_id, payload, created_at
                   FROM audit_logs
                  WHERE ${clauses.join(' AND ')}
                  ORDER BY created_at DESC
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

module.exports = {
    writeAuditLog,
    writeRequestAuditLog,
    logAction,
    listAuditLogs
};


