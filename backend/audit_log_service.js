const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

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
    if (['owner', 'admin', 'seller'].includes(role)) return role;
    return 'seller';
}

function getAuditFileLimit() {
    const raw = Number(process.env.SAAS_AUDIT_FILE_LIMIT || 5000);
    if (!Number.isFinite(raw) || raw < 200) return 5000;
    return Math.floor(raw);
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
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
        ip: toText(entry.ip),
        payload: toSafePayload(entry.payload),
        createdAt: toText(entry.createdAt, nowIso())
    };

    if (getStorageDriver() === 'postgres') {
        try {
            const { rows } = await queryPostgres(
                `INSERT INTO audit_logs (
                    tenant_id, user_id, action, resource_type, resource_id, payload, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6::jsonb, NOW()
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
                    })
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

async function listAuditLogs(tenantId = DEFAULT_TENANT_ID, { limit = 100, offset = 0 } = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const safeOffset = Math.max(0, Number(offset) || 0);

    if (getStorageDriver() === 'postgres') {
        try {
            const { rows } = await queryPostgres(
                `SELECT id, tenant_id, user_id, action, resource_type, resource_id, payload, created_at
                   FROM audit_logs
                  WHERE tenant_id = $1
                  ORDER BY created_at DESC
                  LIMIT $2
                 OFFSET $3`,
                [cleanTenant, safeLimit, safeOffset]
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
    return items.slice(safeOffset, safeOffset + safeLimit);
}

module.exports = {
    writeAuditLog,
    listAuditLogs
};
