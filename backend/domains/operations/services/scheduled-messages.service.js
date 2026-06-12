const crypto = require('crypto');
const {
    getStorageDriver,
    queryPostgres
} = require('../../../config/persistence-runtime');
const { parseScopedChatId } = require('../../channels/helpers/chat-scope.helpers');

const STATUS_PENDING = 'pending';
const STATUS_SENT = 'sent';
const STATUS_CANCELLED = 'cancelled';
const STATUS_FAILED = 'failed';
const SCHEDULE_ABSOLUTE = 'absolute';
const SCHEDULE_BEFORE_WINDOW = 'before_window_expiry';
const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;

function assertPostgresScheduledMessages() {
    if (getStorageDriver() !== 'postgres') {
        throw new Error('Los mensajes programados requieren SAAS_STORAGE_DRIVER=postgres.');
    }
}

function text(value = '') {
    return String(value ?? '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function toIsoDate(value = null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseDateOrThrow(value, fieldName = 'fecha') {
    const iso = toIsoDate(value);
    if (!iso) throw new Error(`${fieldName} invalida.`);
    return iso;
}

function normalizeVariables(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeMediaAssets(value = [], fallback = {}) {
    const source = Array.isArray(value) ? value : [];
    const items = source
        .map((entry) => {
            const asset = entry && typeof entry === 'object' ? entry : {};
            const url = text(asset.url || asset.mediaUrl || asset.dataUrl || '');
            if (!url) return null;
            return {
                url,
                mimeType: lower(asset.mimeType || asset.mediaMimeType || ''),
                fileName: text(asset.fileName || asset.mediaFileName || asset.filename || ''),
                sizeBytes: Number.isFinite(Number(asset.sizeBytes || asset.mediaSizeBytes))
                    ? Number(asset.sizeBytes || asset.mediaSizeBytes)
                    : null
            };
        })
        .filter(Boolean);
    if (items.length > 0) return items;
    const fallbackUrl = text(fallback.url || fallback.mediaUrl || '');
    if (!fallbackUrl) return [];
    return [{
        url: fallbackUrl,
        mimeType: lower(fallback.mimeType || fallback.mediaMimeType || ''),
        fileName: text(fallback.fileName || fallback.mediaFileName || ''),
        sizeBytes: Number.isFinite(Number(fallback.sizeBytes || fallback.mediaSizeBytes))
            ? Number(fallback.sizeBytes || fallback.mediaSizeBytes)
            : null
    }];
}

function resolveChatScope(chatId = '', scopeModuleId = '') {
    const parsed = parseScopedChatId(chatId || '');
    return {
        chatId: text(parsed.chatId || chatId || ''),
        scopeModuleId: lower(scopeModuleId || parsed.moduleId || '')
    };
}

function makeMessageId() {
    return `sch_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function normalizeRow(row = {}) {
    return {
        messageId: row.message_id,
        tenantId: row.tenant_id,
        chatId: row.chat_id,
        scopeModuleId: row.scope_module_id || '',
        createdByUserId: row.created_by_user_id || '',
        messageText: row.message_text || '',
        variables: row.variables && typeof row.variables === 'object' ? row.variables : {},
        mediaAssets: Array.isArray(row.media_assets) ? row.media_assets : [],
        mediaUrl: row.media_url || null,
        mediaMimeType: row.media_mime_type || null,
        mediaFileName: row.media_file_name || null,
        scheduleType: row.schedule_type || SCHEDULE_ABSOLUTE,
        scheduledFor: row.scheduled_for || null,
        minutesBeforeWindow: Number.isFinite(Number(row.minutes_before_window)) ? Number(row.minutes_before_window) : null,
        windowExpiresAtAtSchedule: row.window_expires_at_at_schedule || null,
        cancelOnCustomerReply: row.cancel_on_customer_reply !== false,
        lastCustomerMessageAtSchedule: row.last_customer_message_at_schedule || null,
        status: row.status || STATUS_PENDING,
        sentAt: row.sent_at || null,
        sentMessageId: row.sent_message_id || null,
        cancelledAt: row.cancelled_at || null,
        cancelReason: row.cancel_reason || null,
        failedAt: row.failed_at || null,
        failReason: row.fail_reason || null,
        attempts: Number(row.attempts || 0),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    };
}

function renderMessageText(template = '', variables = {}) {
    const source = String(template || '');
    const vars = normalizeVariables(variables);
    return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
        const value = key.split('.').reduce((acc, part) => (
            acc && Object.prototype.hasOwnProperty.call(acc, part) ? acc[part] : undefined
        ), vars);
        if (value === null || value === undefined) return match;
        return String(value);
    });
}

async function getLatestInboundAt(tenantId = '', chatId = '', scopeModuleId = '') {
    const params = [tenantId, chatId];
    let scopeSql = '';
    if (scopeModuleId) {
        params.push(scopeModuleId);
        scopeSql = `AND LOWER(COALESCE(wa_module_id, '')) = LOWER($${params.length})`;
    }
    const { rows } = await queryPostgres(
        `SELECT timestamp_unix, created_at
           FROM tenant_messages
          WHERE tenant_id = $1
            AND chat_id = $2
            AND from_me = FALSE
            ${scopeSql}
          ORDER BY COALESCE(timestamp_unix, 0) DESC, created_at DESC
          LIMIT 1`,
        params
    );
    const row = rows?.[0];
    if (!row) return null;
    const timestampUnix = Number(row.timestamp_unix || 0);
    if (Number.isFinite(timestampUnix) && timestampUnix > 0) {
        return new Date(timestampUnix * 1000).toISOString();
    }
    return toIsoDate(row.created_at);
}

async function getWindowExpiresAt(tenantId = '', chatId = '', scopeModuleId = '') {
    const { rows } = await queryPostgres(
        `SELECT metadata
           FROM tenant_chats
          WHERE tenant_id = $1
            AND chat_id = $2
          LIMIT 1`,
        [tenantId, chatId]
    );
    const metadata = rows?.[0]?.metadata && typeof rows[0].metadata === 'object' ? rows[0].metadata : {};
    const persisted = toIsoDate(metadata.windowExpiresAt || metadata.window_expires_at || null);
    if (persisted) return persisted;

    const inboundAt = await getLatestInboundAt(tenantId, chatId, scopeModuleId);
    if (!inboundAt) return null;
    return new Date(new Date(inboundAt).getTime() + CUSTOMER_WINDOW_MS).toISOString();
}

async function resolveSchedule({ tenantId, chatId, scopeModuleId, scheduleType, scheduledFor, minutesBeforeWindow, windowExpiresAt }) {
    if (scheduleType === SCHEDULE_BEFORE_WINDOW) {
        const minutes = Math.max(1, Number(minutesBeforeWindow || 0));
        if (!Number.isFinite(minutes)) throw new Error('minutesBeforeWindow invalido.');
        const expiresAt = parseDateOrThrow(windowExpiresAt || await getWindowExpiresAt(tenantId, chatId, scopeModuleId), 'windowExpiresAt');
        const dueAt = new Date(new Date(expiresAt).getTime() - minutes * 60 * 1000);
        return {
            scheduledFor: dueAt.toISOString(),
            minutesBeforeWindow: minutes,
            windowExpiresAtAtSchedule: expiresAt
        };
    }

    return {
        scheduledFor: parseDateOrThrow(scheduledFor, 'scheduledFor'),
        minutesBeforeWindow: null,
        windowExpiresAtAtSchedule: toIsoDate(windowExpiresAt)
    };
}

async function createScheduledMessage(tenantId, payload = {}) {
    assertPostgresScheduledMessages();
    const cleanTenantId = text(tenantId);
    const { chatId, scopeModuleId } = resolveChatScope(payload.chatId || payload.chat_id || '', payload.scopeModuleId || payload.scope_module_id || '');
    const messageText = text(payload.messageText || payload.message_text || '');
    const createdByUserId = text(payload.createdByUserId || payload.created_by_user_id || '');
    const scheduleType = lower(payload.scheduleType || payload.schedule_type || SCHEDULE_ABSOLUTE) === SCHEDULE_BEFORE_WINDOW
        ? SCHEDULE_BEFORE_WINDOW
        : SCHEDULE_ABSOLUTE;

    if (!cleanTenantId) throw new Error('tenantId requerido.');
    if (!chatId) throw new Error('chatId requerido.');
    if (!createdByUserId) throw new Error('createdByUserId requerido.');

    const schedule = await resolveSchedule({
        tenantId: cleanTenantId,
        chatId,
        scopeModuleId,
        scheduleType,
        scheduledFor: payload.scheduledFor || payload.scheduled_for,
        minutesBeforeWindow: payload.minutesBeforeWindow || payload.minutes_before_window,
        windowExpiresAt: payload.windowExpiresAt || payload.window_expires_at
    });
    if (new Date(schedule.scheduledFor).getTime() < Date.now() - 60_000) {
        throw new Error('La fecha programada ya paso.');
    }

    const lastInboundAt = toIsoDate(payload.lastCustomerMessageAtSchedule || payload.last_customer_message_at_schedule)
        || await getLatestInboundAt(cleanTenantId, chatId, scopeModuleId);
    const variables = normalizeVariables(payload.variables);
    const mediaAssets = normalizeMediaAssets(payload.mediaAssets || payload.media_assets, {
        mediaUrl: payload.mediaUrl || payload.media_url,
        mediaMimeType: payload.mediaMimeType || payload.media_mime_type,
        mediaFileName: payload.mediaFileName || payload.media_file_name,
        mediaSizeBytes: payload.mediaSizeBytes || payload.media_size_bytes
    });
    const primaryMedia = mediaAssets[0] || null;
    if (!messageText && mediaAssets.length === 0) throw new Error('messageText o adjunto requerido.');
    const messageId = makeMessageId();
    const { rows } = await queryPostgres(
        `INSERT INTO tenant_scheduled_messages (
            message_id, tenant_id, chat_id, scope_module_id, created_by_user_id,
            message_text, variables, media_assets, media_url, media_mime_type, media_file_name,
            schedule_type, scheduled_for, minutes_before_window,
            window_expires_at_at_schedule, cancel_on_customer_reply,
            last_customer_message_at_schedule, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7::jsonb, $8::jsonb, $9, $10, $11,
            $12, $13::timestamptz, $14,
            $15::timestamptz, $16,
            $17::timestamptz, NOW(), NOW()
        )
        RETURNING *`,
        [
            messageId,
            cleanTenantId,
            chatId,
            scopeModuleId,
            createdByUserId,
            messageText,
            JSON.stringify(variables),
            JSON.stringify(mediaAssets),
            primaryMedia?.url || null,
            primaryMedia?.mimeType || null,
            primaryMedia?.fileName || null,
            scheduleType,
            schedule.scheduledFor,
            schedule.minutesBeforeWindow,
            schedule.windowExpiresAtAtSchedule,
            payload.cancelOnCustomerReply !== false && payload.cancel_on_customer_reply !== false,
            lastInboundAt
        ]
    );
    return normalizeRow(rows[0]);
}

async function listScheduledMessageCounts(tenantId) {
    assertPostgresScheduledMessages();
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId) throw new Error('tenantId requerido.');
    const { rows } = await queryPostgres(
        `SELECT
            chat_id,
            LOWER(COALESCE(scope_module_id, '')) AS scope_module_id,
            COUNT(*)::int AS pending_count
           FROM tenant_scheduled_messages
          WHERE tenant_id = $1
            AND status = $2
          GROUP BY chat_id, LOWER(COALESCE(scope_module_id, ''))
          ORDER BY pending_count DESC, chat_id ASC`,
        [cleanTenantId, STATUS_PENDING]
    );
    return (Array.isArray(rows) ? rows : []).map((row) => {
        const chatId = text(row.chat_id);
        const scopeModuleId = lower(row.scope_module_id || '');
        return {
            chatId,
            scopeModuleId,
            scopedChatId: scopeModuleId ? `${chatId}::mod::${scopeModuleId}` : chatId,
            pendingCount: Number(row.pending_count || 0) || 0
        };
    }).filter((row) => row.chatId && row.pendingCount > 0);
}

async function listScheduledMessages(tenantId, { chatId = '', scopeModuleId = '', limit = 50 } = {}) {
    assertPostgresScheduledMessages();
    const cleanTenantId = text(tenantId);
    const scope = resolveChatScope(chatId, scopeModuleId);
    if (!cleanTenantId || !scope.chatId) return [];
    const params = [cleanTenantId, scope.chatId];
    let scopeSql = '';
    if (scope.scopeModuleId) {
        params.push(scope.scopeModuleId);
        scopeSql = `AND LOWER(COALESCE(scope_module_id, '')) = LOWER($${params.length})`;
    }
    params.push(Math.min(100, Math.max(1, Number(limit) || 50)));
    const { rows } = await queryPostgres(
        `SELECT *
           FROM tenant_scheduled_messages
          WHERE tenant_id = $1
            AND chat_id = $2
            ${scopeSql}
          ORDER BY
            CASE status WHEN 'pending' THEN 0 WHEN 'failed' THEN 1 WHEN 'cancelled' THEN 2 ELSE 3 END,
            scheduled_for ASC
          LIMIT $${params.length}`,
        params
    );
    return rows.map(normalizeRow);
}

async function cancelScheduledMessage(tenantId, messageId, reason = 'manual') {
    assertPostgresScheduledMessages();
    const { rows } = await queryPostgres(
        `UPDATE tenant_scheduled_messages
            SET status = 'cancelled',
                cancelled_at = NOW(),
                cancel_reason = $3,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND message_id = $2
            AND status = 'pending'
          RETURNING *`,
        [text(tenantId), text(messageId), text(reason) || 'manual']
    );
    return rows[0] ? normalizeRow(rows[0]) : null;
}

async function updateScheduledMessage(tenantId, messageId, patch = {}) {
    assertPostgresScheduledMessages();
    const cleanTenantId = text(tenantId);
    const cleanMessageId = text(messageId);
    const currentResult = await queryPostgres(
        `SELECT *
           FROM tenant_scheduled_messages
          WHERE tenant_id = $1 AND message_id = $2
          LIMIT 1`,
        [cleanTenantId, cleanMessageId]
    );
    const current = currentResult.rows?.[0];
    if (!current) return null;
    if (current.status !== STATUS_PENDING) throw new Error('Solo se puede editar un mensaje pendiente.');

    const scheduleType = lower(patch.scheduleType || patch.schedule_type || current.schedule_type) === SCHEDULE_BEFORE_WINDOW
        ? SCHEDULE_BEFORE_WINDOW
        : SCHEDULE_ABSOLUTE;
    const schedule = await resolveSchedule({
        tenantId: cleanTenantId,
        chatId: current.chat_id,
        scopeModuleId: current.scope_module_id || '',
        scheduleType,
        scheduledFor: patch.scheduledFor || patch.scheduled_for || current.scheduled_for,
        minutesBeforeWindow: patch.minutesBeforeWindow || patch.minutes_before_window || current.minutes_before_window,
        windowExpiresAt: patch.windowExpiresAt || patch.window_expires_at || current.window_expires_at_at_schedule
    });
    const messageText = Object.prototype.hasOwnProperty.call(patch, 'messageText') || Object.prototype.hasOwnProperty.call(patch, 'message_text')
        ? text(patch.messageText || patch.message_text || '')
        : current.message_text;

    const variables = Object.prototype.hasOwnProperty.call(patch, 'variables')
        ? normalizeVariables(patch.variables)
        : normalizeVariables(current.variables);
    const mediaAssets = (Object.prototype.hasOwnProperty.call(patch, 'mediaAssets')
        || Object.prototype.hasOwnProperty.call(patch, 'media_assets')
        || Object.prototype.hasOwnProperty.call(patch, 'mediaUrl')
        || Object.prototype.hasOwnProperty.call(patch, 'media_url'))
        ? normalizeMediaAssets(patch.mediaAssets || patch.media_assets, {
            mediaUrl: patch.mediaUrl || patch.media_url,
            mediaMimeType: patch.mediaMimeType || patch.media_mime_type,
            mediaFileName: patch.mediaFileName || patch.media_file_name,
            mediaSizeBytes: patch.mediaSizeBytes || patch.media_size_bytes
        })
        : normalizeMediaAssets(current.media_assets, {
            mediaUrl: current.media_url,
            mediaMimeType: current.media_mime_type,
            mediaFileName: current.media_file_name
        });
    const primaryMedia = mediaAssets[0] || null;
    if (!messageText && mediaAssets.length === 0) throw new Error('messageText o adjunto requerido.');
    const cancelOnCustomerReply = Object.prototype.hasOwnProperty.call(patch, 'cancelOnCustomerReply')
        ? patch.cancelOnCustomerReply !== false
        : Object.prototype.hasOwnProperty.call(patch, 'cancel_on_customer_reply')
            ? patch.cancel_on_customer_reply !== false
            : current.cancel_on_customer_reply !== false;

    const { rows } = await queryPostgres(
        `UPDATE tenant_scheduled_messages
            SET message_text = $3,
                variables = $4::jsonb,
                media_assets = $5::jsonb,
                media_url = $6,
                media_mime_type = $7,
                media_file_name = $8,
                schedule_type = $9,
                scheduled_for = $10::timestamptz,
                minutes_before_window = $11,
                window_expires_at_at_schedule = $12::timestamptz,
                cancel_on_customer_reply = $13,
                processing_started_at = NULL,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND message_id = $2
            AND status = 'pending'
          RETURNING *`,
        [
            cleanTenantId,
            cleanMessageId,
            messageText,
            JSON.stringify(variables),
            JSON.stringify(mediaAssets),
            primaryMedia?.url || null,
            primaryMedia?.mimeType || null,
            primaryMedia?.fileName || null,
            scheduleType,
            schedule.scheduledFor,
            schedule.minutesBeforeWindow,
            schedule.windowExpiresAtAtSchedule,
            cancelOnCustomerReply
        ]
    );
    return rows[0] ? normalizeRow(rows[0]) : null;
}

async function cancelByChatInbound(tenantId, chatId, scopeModuleId = '') {
    assertPostgresScheduledMessages();
    const scope = resolveChatScope(chatId, scopeModuleId);
    if (!tenantId || !scope.chatId) return { cancelled: 0 };
    const params = [text(tenantId), scope.chatId];
    let scopeSql = '';
    if (scope.scopeModuleId) {
        params.push(scope.scopeModuleId);
        scopeSql = `AND LOWER(COALESCE(scope_module_id, '')) = LOWER($${params.length})`;
    }
    const result = await queryPostgres(
        `UPDATE tenant_scheduled_messages
            SET status = 'cancelled',
                cancelled_at = NOW(),
                cancel_reason = 'customer_replied',
                updated_at = NOW()
          WHERE tenant_id = $1
            AND chat_id = $2
            ${scopeSql}
            AND status = 'pending'
            AND cancel_on_customer_reply = TRUE`,
        params
    );
    return { cancelled: Number(result?.rowCount || 0) };
}

async function markFailed(tenantId, messageId, reason = 'failed') {
    await queryPostgres(
        `UPDATE tenant_scheduled_messages
            SET status = 'failed',
                failed_at = NOW(),
                fail_reason = $3,
                processing_started_at = NULL,
                updated_at = NOW()
          WHERE tenant_id = $1 AND message_id = $2`,
        [tenantId, messageId, reason]
    );
}

async function markSent(tenantId, messageId, sentMessageId = '') {
    await queryPostgres(
        `UPDATE tenant_scheduled_messages
            SET status = 'sent',
                sent_at = NOW(),
                sent_message_id = NULLIF($3, ''),
                processing_started_at = NULL,
                updated_at = NOW()
          WHERE tenant_id = $1 AND message_id = $2`,
        [tenantId, messageId, text(sentMessageId)]
    );
}

async function processOne(row = {}, { waClient, logger } = {}) {
    const item = normalizeRow(row);
    const latestInboundAt = await getLatestInboundAt(item.tenantId, item.chatId, item.scopeModuleId);
    if (item.cancelOnCustomerReply && latestInboundAt) {
        const baseline = new Date(item.lastCustomerMessageAtSchedule || item.createdAt || 0).getTime();
        const latest = new Date(latestInboundAt).getTime();
        if (Number.isFinite(latest) && latest > baseline + 1000) {
            await cancelScheduledMessage(item.tenantId, item.messageId, 'customer_replied');
            return { status: STATUS_CANCELLED, reason: 'customer_replied' };
        }
    }

    const windowExpiresAt = await getWindowExpiresAt(item.tenantId, item.chatId, item.scopeModuleId)
        || item.windowExpiresAtAtSchedule;
    if (!windowExpiresAt || new Date(windowExpiresAt).getTime() <= Date.now()) {
        await markFailed(item.tenantId, item.messageId, 'window_expired');
        return { status: STATUS_FAILED, reason: 'window_expired' };
    }

    const body = renderMessageText(item.messageText, item.variables);
    const mediaEntry = normalizeMediaAssets(item.mediaAssets, {
        mediaUrl: item.mediaUrl,
        mediaMimeType: item.mediaMimeType,
        mediaFileName: item.mediaFileName
    })[0] || null;
    if (!body.trim() && !mediaEntry?.url) {
        await markFailed(item.tenantId, item.messageId, 'empty_message');
        return { status: STATUS_FAILED, reason: 'empty_message' };
    }
    if (!waClient?.sendMessage) {
        await markFailed(item.tenantId, item.messageId, 'transport_unavailable');
        return { status: STATUS_FAILED, reason: 'transport_unavailable' };
    }

    try {
        const metadata = {
            tenantId: item.tenantId,
            chatId: item.chatId,
            scopeModuleId: item.scopeModuleId || '',
            scheduledMessageId: item.messageId
        };
        let sent = null;
        if (mediaEntry?.url) {
            if (!String(mediaEntry.url).startsWith('data:') || !waClient?.sendMedia) {
                await markFailed(item.tenantId, item.messageId, 'media_unavailable');
                return { status: STATUS_FAILED, reason: 'media_unavailable' };
            }
            sent = await waClient.sendMedia(
                item.chatId,
                mediaEntry.url,
                mediaEntry.mimeType || 'application/octet-stream',
                mediaEntry.fileName || 'adjunto',
                body,
                false,
                null,
                metadata
            );
        } else {
            sent = await waClient.sendMessage(item.chatId, body, { metadata });
        }
        const sentId = text(sent?.id?._serialized || sent?.id || sent?.messageId || '');
        await markSent(item.tenantId, item.messageId, sentId);
        return { status: STATUS_SENT, sentMessageId: sentId || null };
    } catch (error) {
        const reason = text(error?.message || error || 'send_failed').slice(0, 500);
        logger?.warn?.('[ScheduledMessages] send failed: ' + reason);
        await markFailed(item.tenantId, item.messageId, reason || 'send_failed');
        return { status: STATUS_FAILED, reason };
    }
}

async function processPendingMessages({ waClient, logger, limit = 25 } = {}) {
    assertPostgresScheduledMessages();
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const { rows } = await queryPostgres(
        `WITH picked AS (
             SELECT tenant_id, message_id
               FROM tenant_scheduled_messages
              WHERE status = 'pending'
                AND scheduled_for <= NOW()
                AND (
                    processing_started_at IS NULL
                    OR processing_started_at < NOW() - INTERVAL '5 minutes'
                )
              ORDER BY scheduled_for ASC
              LIMIT $1
              FOR UPDATE SKIP LOCKED
         )
         UPDATE tenant_scheduled_messages sm
            SET processing_started_at = NOW(),
                attempts = attempts + 1,
                updated_at = NOW()
           FROM picked
          WHERE sm.tenant_id = picked.tenant_id
            AND sm.message_id = picked.message_id
          RETURNING sm.*`,
        [safeLimit]
    );
    const results = [];
    for (const row of rows) {
        results.push(await processOne(row, { waClient, logger }));
    }
    return { processed: results.length, results };
}

module.exports = {
    createScheduledMessage,
    listScheduledMessages,
    listScheduledMessageCounts,
    cancelScheduledMessage,
    updateScheduledMessage,
    cancelByChatInbound,
    processPendingMessages,
    renderMessageText
};
