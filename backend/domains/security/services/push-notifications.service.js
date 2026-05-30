const webPush = require('web-push');
const { getStorageDriver, queryPostgres } = require('../../../config/persistence-runtime');

const VALID_ROLES_FOR_UNASSIGNED = ['seller', 'admin', 'owner'];

let vapidConfigured = false;

function text(value = '') {
    return String(value || '').trim();
}

function normalizeDeviceType(value = '') {
    const clean = text(value).toLowerCase();
    if (['mobile', 'desktop', 'tablet'].includes(clean)) return clean;
    return null;
}

function truncate(value = '', max = 100) {
    const clean = text(value).replace(/\s+/g, ' ');
    if (clean.length <= max) return clean;
    return clean.slice(0, max - 1).trimEnd() + '…';
}

function ensureVapidConfigured() {
    if (vapidConfigured) return true;
    const publicKey = text(process.env.VAPID_PUBLIC_KEY);
    const privateKey = text(process.env.VAPID_PRIVATE_KEY);
    const email = text(process.env.VAPID_EMAIL) || 'mailto:soporte@cleaning.com.pe';
    if (!publicKey || !privateKey) return false;
    webPush.setVapidDetails(email, publicKey, privateKey);
    vapidConfigured = true;
    return true;
}

function isConfigured() {
    return ensureVapidConfigured();
}

async function saveSubscription({ userId, tenantId, deviceId, endpoint, p256dh, authKey, deviceType } = {}) {
    const cleanUserId = text(userId);
    const cleanTenantId = text(tenantId);
    const cleanEndpoint = text(endpoint);
    const cleanP256dh = text(p256dh);
    const cleanAuthKey = text(authKey);
    if (!cleanUserId || !cleanTenantId || !cleanEndpoint || !cleanP256dh || !cleanAuthKey) {
        throw new Error('Suscripcion push incompleta.');
    }
    if (getStorageDriver() !== 'postgres') {
        return { ok: true, skipped: true, reason: 'push_requires_postgres' };
    }

    const result = await queryPostgres(
        `INSERT INTO push_subscriptions (
            user_id, tenant_id, device_id, endpoint, p256dh, auth_key, device_type, is_active, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
         ON CONFLICT (user_id, endpoint)
         DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            device_id = EXCLUDED.device_id,
            p256dh = EXCLUDED.p256dh,
            auth_key = EXCLUDED.auth_key,
            device_type = EXCLUDED.device_type,
            is_active = TRUE,
            updated_at = NOW()
         RETURNING id`,
        [
            cleanUserId,
            cleanTenantId,
            text(deviceId) || null,
            cleanEndpoint,
            cleanP256dh,
            cleanAuthKey,
            normalizeDeviceType(deviceType),
        ]
    );
    return { ok: true, id: result.rows?.[0]?.id || null };
}

async function deactivateSubscription({ userId, endpoint } = {}) {
    const cleanUserId = text(userId);
    const cleanEndpoint = text(endpoint);
    if (!cleanUserId || !cleanEndpoint || getStorageDriver() !== 'postgres') {
        return { ok: true, skipped: true };
    }
    await queryPostgres(
        `UPDATE push_subscriptions
            SET is_active = FALSE, updated_at = NOW()
          WHERE user_id = $1 AND endpoint = $2`,
        [cleanUserId, cleanEndpoint]
    );
    return { ok: true };
}

async function markSubscriptionInactive(subscriptionId) {
    const cleanId = Number(subscriptionId);
    if (!Number.isFinite(cleanId) || cleanId <= 0 || getStorageDriver() !== 'postgres') return;
    await queryPostgres(
        `UPDATE push_subscriptions
            SET is_active = FALSE, updated_at = NOW()
          WHERE id = $1`,
        [cleanId]
    );
}

async function listActiveSubscriptions(userId, tenantId) {
    const cleanUserId = text(userId);
    const cleanTenantId = text(tenantId);
    if (!cleanUserId || !cleanTenantId || getStorageDriver() !== 'postgres') return [];
    const result = await queryPostgres(
        `SELECT id, endpoint, p256dh, auth_key
           FROM push_subscriptions
          WHERE user_id = $1
            AND tenant_id = $2
            AND is_active = TRUE`,
        [cleanUserId, cleanTenantId]
    );
    return result.rows || [];
}

async function sendPushNotification(userId, tenantId, payload = {}) {
    const cleanUserId = text(userId);
    const cleanTenantId = text(tenantId);
    if (!cleanUserId || !cleanTenantId) return { ok: false, skipped: true, reason: 'missing_target' };
    if (!ensureVapidConfigured()) return { ok: false, skipped: true, reason: 'vapid_not_configured' };

    const subscriptions = await listActiveSubscriptions(cleanUserId, cleanTenantId);
    if (!subscriptions.length) return { ok: true, sent: 0 };

    let sent = 0;
    await Promise.all(subscriptions.map(async (row) => {
        const subscription = {
            endpoint: row.endpoint,
            keys: {
                p256dh: row.p256dh,
                auth: row.auth_key,
            },
        };
        try {
            await webPush.sendNotification(subscription, JSON.stringify(payload || {}));
            sent += 1;
        } catch (error) {
            const status = Number(error?.statusCode || error?.status || 0);
            if (status === 404 || status === 410) {
                await markSubscriptionInactive(row.id);
                return;
            }
            console.warn('[Push] send warning:', String(error?.message || error));
        }
    }));
    return { ok: true, sent };
}

async function sendToUsers(userIds = [], tenantId = '', payload = {}) {
    const uniqueUsers = [...new Set((userIds || []).map(text).filter(Boolean))];
    const cleanTenantId = text(tenantId);
    if (!uniqueUsers.length || !cleanTenantId) return { ok: true, sent: 0 };
    const results = await Promise.all(uniqueUsers.map((userId) => sendPushNotification(userId, cleanTenantId, payload)));
    return {
        ok: true,
        sent: results.reduce((total, result) => total + (Number(result?.sent) || 0), 0),
        skipped: results.filter((result) => result?.skipped).length,
    };
}

async function getAssignedUserId(tenantId = '', chatId = '', scopeModuleId = '') {
    const cleanTenantId = text(tenantId);
    const cleanChatId = text(chatId);
    const cleanScopeModuleId = text(scopeModuleId).toLowerCase();
    if (!cleanTenantId || !cleanChatId || getStorageDriver() !== 'postgres') return null;

    const params = [cleanTenantId, cleanChatId];
    let scopeSql = '';
    if (cleanScopeModuleId) {
        params.push(cleanScopeModuleId);
        scopeSql = ` AND LOWER(COALESCE(scope_module_id, '')) = LOWER($${params.length})`;
    }
    const result = await queryPostgres(
        `SELECT assignee_user_id
           FROM tenant_chat_assignments
          WHERE tenant_id = $1
            AND chat_id = $2
            ${scopeSql}
            AND LOWER(COALESCE(status, 'active')) = 'active'
            AND assignee_user_id IS NOT NULL
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1`,
        params
    );
    return text(result.rows?.[0]?.assignee_user_id) || null;
}

async function listUsersForUnassignedChat(tenantId = '') {
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId || getStorageDriver() !== 'postgres') return [];
    const result = await queryPostgres(
        `SELECT DISTINCT u.user_id
           FROM memberships m
           JOIN users u ON u.user_id = m.user_id
          WHERE m.tenant_id = $1
            AND COALESCE(m.is_active, TRUE) = TRUE
            AND COALESCE(u.is_active, TRUE) = TRUE
            AND LOWER(COALESCE(m.role, '')) = ANY($2::text[])`,
        [cleanTenantId, VALID_ROLES_FOR_UNASSIGNED]
    );
    return (result.rows || []).map((row) => text(row.user_id)).filter(Boolean);
}

async function sendInboundMessageNotification({
    tenantId,
    chatId,
    scopeModuleId,
    senderName,
    preview,
} = {}) {
    const cleanTenantId = text(tenantId);
    const cleanChatId = text(chatId);
    if (!cleanTenantId || !cleanChatId) return { ok: false, skipped: true, reason: 'missing_chat' };

    const assignedUserId = await getAssignedUserId(cleanTenantId, cleanChatId, scopeModuleId);
    const recipients = assignedUserId
        ? [assignedUserId]
        : await listUsersForUnassignedChat(cleanTenantId);

    const titleName = text(senderName) || cleanChatId.split('@')[0] || 'cliente';
    const payload = {
        title: `Nuevo mensaje de ${titleName}`,
        body: truncate(preview || 'Tienes un nuevo mensaje.', 100),
        chatId: cleanChatId,
        url: `/?chat=${encodeURIComponent(cleanChatId)}`,
    };
    return sendToUsers(recipients, cleanTenantId, payload);
}

module.exports = {
    isConfigured,
    saveSubscription,
    deactivateSubscription,
    sendPushNotification,
    sendToUsers,
    sendInboundMessageNotification,
    listUsersForUnassignedChat,
};
