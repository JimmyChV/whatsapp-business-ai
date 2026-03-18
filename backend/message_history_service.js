const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

const HISTORY_FILE = 'message_history.json';
let postgresMessageColumnsReadyPromise = null;

function parseBoolean(value, defaultValue = true) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function isHistoryEnabled() {
    return parseBoolean(process.env.HISTORY_PERSISTENCE_ENABLED, true);
}

function toSafeString(value = '') {
    const text = String(value ?? '').trim();
    return text || null;
}

function toSafeNumber(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string' && !value.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
}

function toSafeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    return Boolean(fallback);
}

function resolveTenantId(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function normalizeChatPatch(chat = {}) {
    if (!chat || typeof chat !== 'object') return null;
    return {
        id: toSafeString(chat.id),
        displayName: toSafeString(chat.displayName || chat.name),
        phone: toSafeString(chat.phone),
        subtitle: toSafeString(chat.subtitle),
        unreadCount: Math.max(0, Math.floor(toSafeNumber(chat.unreadCount, 0) || 0)),
        archived: toSafeBoolean(chat.archived, false),
        pinned: toSafeBoolean(chat.pinned, false),
        metadata: chat.metadata && typeof chat.metadata === 'object' ? chat.metadata : {}
    };
}

function normalizeMessageRecord(input = {}) {
    const messageId = toSafeString(input.messageId || input.id);
    const chatId = toSafeString(input.chatId);
    if (!messageId || !chatId) return null;

    const timestampUnix = toSafeNumber(input.timestampUnix ?? input.timestamp, null);

    return {
        messageId,
        chatId,
        fromMe: toSafeBoolean(input.fromMe, false),
        senderId: toSafeString(input.senderId || input.from),
        senderPhone: toSafeString(input.senderPhone),
        waModuleId: toSafeString(input.waModuleId || input.moduleId || input.sentViaModuleId),
        waPhoneNumber: toSafeString(input.waPhoneNumber || input.modulePhone || input.sentViaPhone || input.chatPhone),
        authorId: toSafeString(input.authorId || input.author),
        body: input.body === null || input.body === undefined ? null : String(input.body),
        messageType: toSafeString(input.messageType || input.type),
        timestampUnix,
        ack: toSafeNumber(input.ack, null),
        edited: toSafeBoolean(input.edited, false),
        editedAtUnix: toSafeNumber(input.editedAtUnix, null),
        hasMedia: toSafeBoolean(input.hasMedia, false),
        mediaMime: toSafeString(input.mediaMime || input.mimetype),
        mediaFilename: toSafeString(input.mediaFilename || input.filename),
        mediaSizeBytes: toSafeNumber(input.mediaSizeBytes || input.fileSizeBytes, null),
        quotedMessageId: toSafeString(input.quotedMessageId),
        orderPayload: input.orderPayload && typeof input.orderPayload === 'object' ? input.orderPayload : null,
        locationPayload: input.locationPayload && typeof input.locationPayload === 'object' ? input.locationPayload : null,
        metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
        chat: normalizeChatPatch(input.chat || { id: chatId })
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

function missingColumn(error, column = '') {
    const code = String(error?.code || '').trim();
    if (code === '42703') return true;
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('column') || !message.includes('does not exist')) return false;
    if (!column) return true;
    return message.includes(String(column || '').toLowerCase());
}

async function ensurePostgresMessageColumns() {
    if (postgresMessageColumnsReadyPromise) return postgresMessageColumnsReadyPromise;

    postgresMessageColumnsReadyPromise = (async () => {
        await queryPostgres('ALTER TABLE IF EXISTS tenant_messages ADD COLUMN IF NOT EXISTS wa_module_id TEXT');
        await queryPostgres('ALTER TABLE IF EXISTS tenant_messages ADD COLUMN IF NOT EXISTS wa_phone_number TEXT');
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_tenant_messages_module_ts
             ON tenant_messages(tenant_id, wa_module_id, timestamp_unix DESC)`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_tenant_messages_phone_ts
             ON tenant_messages(tenant_id, wa_phone_number, timestamp_unix DESC)`
        );
    })();

    try {
        await postgresMessageColumnsReadyPromise;
    } catch (error) {
        postgresMessageColumnsReadyPromise = null;
        throw error;
    }
}
async function loadStore(tenantId) {
    const parsed = await readTenantJsonFile(HISTORY_FILE, {
        tenantId,
        defaultValue: {
            chats: {},
            messages: {},
            messageOrderByChat: {}
        }
    });

    return {
        chats: parsed?.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
        messages: parsed?.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
        messageOrderByChat: parsed?.messageOrderByChat && typeof parsed.messageOrderByChat === 'object'
            ? parsed.messageOrderByChat
            : {}
    };
}

async function saveStore(tenantId, store) {
    await writeTenantJsonFile(HISTORY_FILE, store, { tenantId });
}

function applyChatPatch(current = {}, patch = {}, fallbackMessage = null) {
    const next = {
        id: patch.id || current.id,
        displayName: patch.displayName || current.displayName || null,
        phone: patch.phone || current.phone || null,
        subtitle: patch.subtitle || current.subtitle || null,
        unreadCount: Number.isFinite(patch.unreadCount) ? patch.unreadCount : (Number(current.unreadCount) || 0),
        archived: typeof patch.archived === 'boolean' ? patch.archived : Boolean(current.archived),
        pinned: typeof patch.pinned === 'boolean' ? patch.pinned : Boolean(current.pinned),
        lastMessageId: current.lastMessageId || null,
        lastMessageAt: Number(current.lastMessageAt) || null,
        metadata: {
            ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
            ...(patch.metadata && typeof patch.metadata === 'object' ? patch.metadata : {})
        },
        updatedAt: new Date().toISOString(),
        createdAt: current.createdAt || new Date().toISOString()
    };

    if (fallbackMessage) {
        const incomingTs = Number(fallbackMessage.timestampUnix) || 0;
        const currentTs = Number(next.lastMessageAt) || 0;
        if (incomingTs >= currentTs) {
            next.lastMessageAt = incomingTs || currentTs || null;
            next.lastMessageId = fallbackMessage.messageId || next.lastMessageId;
        }
    }

    return next;
}

function upsertMessageInMemory(store, record) {
    const nowIso = new Date().toISOString();
    const existing = store.messages[record.messageId] || null;

    const mergedMessage = {
        messageId: record.messageId,
        chatId: record.chatId,
        fromMe: record.fromMe,
        senderId: record.senderId,
        senderPhone: record.senderPhone,
        waModuleId: record.waModuleId,
        waPhoneNumber: record.waPhoneNumber,
        authorId: record.authorId,
        body: record.body,
        messageType: record.messageType,
        timestampUnix: record.timestampUnix,
        ack: record.ack,
        edited: Boolean(record.edited || existing?.edited),
        editedAtUnix: record.editedAtUnix || existing?.editedAtUnix || null,
        hasMedia: record.hasMedia,
        mediaMime: record.mediaMime,
        mediaFilename: record.mediaFilename,
        mediaSizeBytes: record.mediaSizeBytes,
        quotedMessageId: record.quotedMessageId,
        orderPayload: record.orderPayload,
        locationPayload: record.locationPayload,
        metadata: {
            ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
            ...(record.metadata && typeof record.metadata === 'object' ? record.metadata : {})
        },
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso
    };

    store.messages[record.messageId] = mergedMessage;

    const chatPatch = record.chat || { id: record.chatId };
    const currentChat = store.chats[record.chatId] || { id: record.chatId };
    store.chats[record.chatId] = applyChatPatch(currentChat, chatPatch, record);

    const rawOrder = Array.isArray(store.messageOrderByChat[record.chatId])
        ? store.messageOrderByChat[record.chatId]
        : [];
    const dedup = rawOrder.filter((id) => id && id !== record.messageId);
    dedup.unshift(record.messageId);
    dedup.sort((leftId, rightId) => {
        const leftTs = Number(store.messages[leftId]?.timestampUnix || 0);
        const rightTs = Number(store.messages[rightId]?.timestampUnix || 0);
        if (rightTs !== leftTs) return rightTs - leftTs;
        return String(rightId).localeCompare(String(leftId));
    });
    store.messageOrderByChat[record.chatId] = dedup.slice(0, 5000);
}

async function upsertChatPostgres(tenantId, chatPatch = {}, fallbackMessage = null) {
    const safeChatId = toSafeString(chatPatch?.id);
    if (!safeChatId) return;

    const incomingTs = Number(fallbackMessage?.timestampUnix || 0) || null;
    const incomingMessageId = toSafeString(fallbackMessage?.messageId);

    await queryPostgres(
        `INSERT INTO tenant_chats (
            tenant_id, chat_id, display_name, phone, subtitle, unread_count, archived, pinned,
            last_message_id, last_message_at, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW(), NOW())
        ON CONFLICT (tenant_id, chat_id)
        DO UPDATE SET
            display_name = COALESCE(EXCLUDED.display_name, tenant_chats.display_name),
            phone = COALESCE(EXCLUDED.phone, tenant_chats.phone),
            subtitle = COALESCE(EXCLUDED.subtitle, tenant_chats.subtitle),
            unread_count = COALESCE(EXCLUDED.unread_count, tenant_chats.unread_count),
            archived = COALESCE(EXCLUDED.archived, tenant_chats.archived),
            pinned = COALESCE(EXCLUDED.pinned, tenant_chats.pinned),
            last_message_id = CASE
                WHEN COALESCE(EXCLUDED.last_message_at, 0) >= COALESCE(tenant_chats.last_message_at, 0)
                    THEN COALESCE(EXCLUDED.last_message_id, tenant_chats.last_message_id)
                ELSE tenant_chats.last_message_id
            END,
            last_message_at = GREATEST(COALESCE(tenant_chats.last_message_at, 0), COALESCE(EXCLUDED.last_message_at, 0)),
            metadata = COALESCE(tenant_chats.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_at = NOW()`,
        [
            tenantId,
            safeChatId,
            chatPatch.displayName || null,
            chatPatch.phone || null,
            chatPatch.subtitle || null,
            Number.isFinite(chatPatch.unreadCount) ? chatPatch.unreadCount : 0,
            typeof chatPatch.archived === 'boolean' ? chatPatch.archived : false,
            typeof chatPatch.pinned === 'boolean' ? chatPatch.pinned : false,
            incomingMessageId,
            incomingTs,
            JSON.stringify(chatPatch.metadata || {})
        ]
    );
}

async function upsertMessagePostgres(tenantId, record, { schemaEnsured = false } = {}) {
    try {
        await ensurePostgresMessageColumns();
        await queryPostgres(
            `INSERT INTO tenant_messages (
                tenant_id, message_id, chat_id, from_me, sender_id, sender_phone, author_id,
                wa_module_id, wa_phone_number,
                body, message_type, timestamp_unix, ack, edited, edited_at_unix, has_media,
                media_mime, media_filename, media_size_bytes, quoted_message_id,
                order_payload, location_payload, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9,
                $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20,
                $21::jsonb, $22::jsonb, $23::jsonb, NOW(), NOW()
            )
            ON CONFLICT (tenant_id, message_id)
            DO UPDATE SET
                chat_id = EXCLUDED.chat_id,
                from_me = EXCLUDED.from_me,
                sender_id = COALESCE(EXCLUDED.sender_id, tenant_messages.sender_id),
                sender_phone = COALESCE(EXCLUDED.sender_phone, tenant_messages.sender_phone),
                author_id = COALESCE(EXCLUDED.author_id, tenant_messages.author_id),
                wa_module_id = COALESCE(EXCLUDED.wa_module_id, tenant_messages.wa_module_id),
                wa_phone_number = COALESCE(EXCLUDED.wa_phone_number, tenant_messages.wa_phone_number),
                body = COALESCE(EXCLUDED.body, tenant_messages.body),
                message_type = COALESCE(EXCLUDED.message_type, tenant_messages.message_type),
                timestamp_unix = COALESCE(EXCLUDED.timestamp_unix, tenant_messages.timestamp_unix),
                ack = COALESCE(EXCLUDED.ack, tenant_messages.ack),
                edited = COALESCE(EXCLUDED.edited, tenant_messages.edited),
                edited_at_unix = COALESCE(EXCLUDED.edited_at_unix, tenant_messages.edited_at_unix),
                has_media = COALESCE(EXCLUDED.has_media, tenant_messages.has_media),
                media_mime = COALESCE(EXCLUDED.media_mime, tenant_messages.media_mime),
                media_filename = COALESCE(EXCLUDED.media_filename, tenant_messages.media_filename),
                media_size_bytes = COALESCE(EXCLUDED.media_size_bytes, tenant_messages.media_size_bytes),
                quoted_message_id = COALESCE(EXCLUDED.quoted_message_id, tenant_messages.quoted_message_id),
                order_payload = COALESCE(EXCLUDED.order_payload, tenant_messages.order_payload),
                location_payload = COALESCE(EXCLUDED.location_payload, tenant_messages.location_payload),
                metadata = COALESCE(tenant_messages.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
                updated_at = NOW()`,
            [
                tenantId,
                record.messageId,
                record.chatId,
                record.fromMe,
                record.senderId,
                record.senderPhone,
                record.authorId,
                record.waModuleId,
                record.waPhoneNumber,
                record.body,
                record.messageType,
                record.timestampUnix,
                record.ack,
                record.edited,
                record.editedAtUnix,
                record.hasMedia,
                record.mediaMime,
                record.mediaFilename,
                record.mediaSizeBytes,
                record.quotedMessageId,
                JSON.stringify(record.orderPayload || null),
                JSON.stringify(record.locationPayload || null),
                JSON.stringify(record.metadata || {})
            ]
        );
    } catch (error) {
        if (!schemaEnsured && missingColumn(error, 'wa_module_id')) {
            await ensurePostgresMessageColumns();
            await upsertMessagePostgres(tenantId, record, { schemaEnsured: true });
            return;
        }
        throw error;
    }
}
async function upsertMessage(tenantId = DEFAULT_TENANT_ID, input = {}) {
    if (!isHistoryEnabled()) return { ok: false, skipped: 'disabled' };

    const cleanTenant = resolveTenantId(tenantId);
    const record = normalizeMessageRecord(input);
    if (!record) return { ok: false, skipped: 'invalid_record' };

    if (getStorageDriver() === 'postgres') {
        await upsertChatPostgres(cleanTenant, record.chat, record);
        await upsertMessagePostgres(cleanTenant, record);
        return { ok: true, driver: 'postgres', messageId: record.messageId };
    }

    const store = await loadStore(cleanTenant);
    upsertMessageInMemory(store, record);
    await saveStore(cleanTenant, store);
    return { ok: true, driver: 'file', messageId: record.messageId };
}


async function updateChatState(tenantId = DEFAULT_TENANT_ID, {
    chatId,
    archived,
    pinned,
    metadata = null
} = {}) {
    if (!isHistoryEnabled()) return { ok: false, skipped: 'disabled' };

    const cleanTenant = resolveTenantId(tenantId);
    const safeChatId = toSafeString(chatId);
    if (!safeChatId) return { ok: false, skipped: 'invalid_chat_id' };

    const hasArchived = typeof archived === 'boolean';
    const hasPinned = typeof pinned === 'boolean';
    const hasMetadata = metadata && typeof metadata === 'object';
    if (!hasArchived && !hasPinned && !hasMetadata) {
        return { ok: false, skipped: 'empty_patch' };
    }

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresMessageColumns();
            const setClauses = ['updated_at = NOW()'];
            const params = [cleanTenant, safeChatId];
            let idx = 2;
            if (hasArchived) {
                idx += 1;
                setClauses.push(`archived = $${idx}`);
                params.push(Boolean(archived));
            }
            if (hasPinned) {
                idx += 1;
                setClauses.push(`pinned = $${idx}`);
                params.push(Boolean(pinned));
            }
            if (hasMetadata) {
                idx += 1;
                setClauses.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${idx}::jsonb`);
                params.push(JSON.stringify(metadata || {}));
            }

            const sql = `UPDATE tenant_chats
                            SET ${setClauses.join(', ')}
                          WHERE tenant_id = $1
                            AND chat_id = $2
                        RETURNING chat_id, archived, pinned, metadata`;
            const { rows } = await queryPostgres(sql, params);
            if (!rows.length) return { ok: false, skipped: 'not_found' };

            const row = rows[0] || {};
            return {
                ok: true,
                driver: 'postgres',
                chatId: String(row.chat_id || safeChatId),
                archived: Boolean(row.archived),
                pinned: Boolean(row.pinned),
                metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
            };
        } catch (error) {
            if (missingRelation(error)) return { ok: false, skipped: 'schema_missing' };
            throw error;
        }
    }

    const store = await loadStore(cleanTenant);
    const currentChat = store.chats[safeChatId];
    if (!currentChat) return { ok: false, skipped: 'not_found' };

    store.chats[safeChatId] = {
        ...currentChat,
        archived: hasArchived ? Boolean(archived) : Boolean(currentChat.archived),
        pinned: hasPinned ? Boolean(pinned) : Boolean(currentChat.pinned),
        metadata: {
            ...(currentChat.metadata && typeof currentChat.metadata === 'object' ? currentChat.metadata : {}),
            ...(hasMetadata ? metadata : {})
        },
        updatedAt: new Date().toISOString()
    };
    await saveStore(cleanTenant, store);
    return {
        ok: true,
        driver: 'file',
        chatId: safeChatId,
        archived: Boolean(store.chats[safeChatId]?.archived),
        pinned: Boolean(store.chats[safeChatId]?.pinned),
        metadata: store.chats[safeChatId]?.metadata && typeof store.chats[safeChatId].metadata === 'object'
            ? store.chats[safeChatId].metadata
            : {}
    };
}
async function updateMessageAck(tenantId = DEFAULT_TENANT_ID, { messageId, chatId, ack } = {}) {
    if (!isHistoryEnabled()) return { ok: false, skipped: 'disabled' };

    const cleanTenant = resolveTenantId(tenantId);
    const safeId = toSafeString(messageId);
    if (!safeId) return { ok: false, skipped: 'invalid_message_id' };
    const safeAck = toSafeNumber(ack, null);

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresMessageColumns();
            await queryPostgres(
                `UPDATE tenant_messages
                    SET ack = COALESCE($3, ack), updated_at = NOW()
                  WHERE tenant_id = $1
                    AND message_id = $2`,
                [cleanTenant, safeId, safeAck]
            );
            return { ok: true, driver: 'postgres', messageId: safeId };
        } catch (error) {
            if (missingRelation(error)) return { ok: false, skipped: 'schema_missing' };
            throw error;
        }
    }

    const store = await loadStore(cleanTenant);
    const existing = store.messages[safeId];
    if (!existing) return { ok: false, skipped: 'not_found' };

    store.messages[safeId] = {
        ...existing,
        ack: safeAck,
        updatedAt: new Date().toISOString()
    };
    if (chatId && store.chats[chatId]) {
        store.chats[chatId] = {
            ...store.chats[chatId],
            updatedAt: new Date().toISOString()
        };
    }
    await saveStore(cleanTenant, store);
    return { ok: true, driver: 'file', messageId: safeId };
}

async function updateMessageEdit(tenantId = DEFAULT_TENANT_ID, { messageId, chatId, body, editedAtUnix } = {}) {
    if (!isHistoryEnabled()) return { ok: false, skipped: 'disabled' };

    const cleanTenant = resolveTenantId(tenantId);
    const safeId = toSafeString(messageId);
    if (!safeId) return { ok: false, skipped: 'invalid_message_id' };

    const safeBody = body === null || body === undefined ? null : String(body);
    const safeEditedAt = toSafeNumber(editedAtUnix, null);

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresMessageColumns();
            await queryPostgres(
                `UPDATE tenant_messages
                    SET body = COALESCE($3, body), edited = TRUE, edited_at_unix = COALESCE($4, edited_at_unix), updated_at = NOW()
                  WHERE tenant_id = $1
                    AND message_id = $2`,
                [cleanTenant, safeId, safeBody, safeEditedAt]
            );
            return { ok: true, driver: 'postgres', messageId: safeId };
        } catch (error) {
            if (missingRelation(error)) return { ok: false, skipped: 'schema_missing' };
            throw error;
        }
    }

    const store = await loadStore(cleanTenant);
    const existing = store.messages[safeId];
    if (!existing) return { ok: false, skipped: 'not_found' };

    store.messages[safeId] = {
        ...existing,
        body: safeBody !== null ? safeBody : existing.body,
        edited: true,
        editedAtUnix: safeEditedAt || existing.editedAtUnix || null,
        updatedAt: new Date().toISOString()
    };
    if (chatId && store.chats[chatId]) {
        store.chats[chatId] = {
            ...store.chats[chatId],
            updatedAt: new Date().toISOString()
        };
    }
    await saveStore(cleanTenant, store);
    return { ok: true, driver: 'file', messageId: safeId };
}

async function listChats(tenantId = DEFAULT_TENANT_ID, { limit = 100, offset = 0 } = {}) {
    if (!isHistoryEnabled()) return [];
    const cleanTenant = resolveTenantId(tenantId);
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const safeOffset = Math.max(0, Number(offset) || 0);

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresMessageColumns();
            const { rows } = await queryPostgres(
                `WITH latest_by_scope AS (
                     SELECT DISTINCT ON (
                                m.chat_id,
                                COALESCE(NULLIF(LOWER(TRIM(m.wa_module_id)), ''), '__default__')
                            )
                            m.chat_id,
                            COALESCE(NULLIF(LOWER(TRIM(m.wa_module_id)), ''), '') AS scope_module_id,
                            m.message_id,
                            m.timestamp_unix,
                            m.body,
                            m.from_me,
                            m.ack,
                            m.wa_module_id,
                            m.wa_phone_number,
                            m.metadata AS last_message_metadata
                       FROM tenant_messages m
                      WHERE m.tenant_id = $1
                      ORDER BY
                            m.chat_id,
                            COALESCE(NULLIF(LOWER(TRIM(m.wa_module_id)), ''), '__default__'),
                            COALESCE(m.timestamp_unix, 0) DESC,
                            m.created_at DESC
                 )
                 SELECT
                        l.chat_id,
                        c.display_name,
                        c.phone,
                        c.subtitle,
                        c.unread_count,
                        c.archived,
                        c.pinned,
                        l.message_id AS last_message_id,
                        l.timestamp_unix AS last_message_at,
                        l.body AS last_message_body,
                        l.from_me AS last_message_from_me,
                        l.ack AS last_message_ack,
                        l.wa_module_id AS last_message_module_id,
                        l.wa_phone_number AS last_message_phone_number,
                        l.last_message_metadata,
                        c.metadata
                   FROM latest_by_scope l
                   LEFT JOIN tenant_chats c
                     ON c.tenant_id = $1
                    AND c.chat_id = l.chat_id
                  ORDER BY COALESCE(l.timestamp_unix, 0) DESC, c.updated_at DESC NULLS LAST
                  LIMIT $2 OFFSET $3`,
                [cleanTenant, safeLimit, safeOffset]
            );

            return rows.map((row) => {
                const chatMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
                const lastMessageMetadata = row.last_message_metadata && typeof row.last_message_metadata === 'object'
                    ? row.last_message_metadata
                    : {};
                const lastMessageModuleId = toSafeString(row.last_message_module_id || lastMessageMetadata.sentViaModuleId)?.toLowerCase() || null;
                const lastMessageModuleName = toSafeString(lastMessageMetadata.sentViaModuleName) || null;
                const lastMessageModuleImageUrl = toSafeString(lastMessageMetadata.sentViaModuleImageUrl) || null;
                const lastMessageTransport = toSafeString(lastMessageMetadata.sentViaTransport)?.toLowerCase() || null;
                const lastMessageChannelType = toSafeString(lastMessageMetadata.sentViaChannelType)?.toLowerCase() || null;

                return {
                    chatId: row.chat_id,
                    displayName: row.display_name,
                    phone: row.phone,
                    subtitle: row.subtitle,
                    unreadCount: Number(row.unread_count || 0),
                    archived: Boolean(row.archived),
                    pinned: Boolean(row.pinned),
                    lastMessageId: row.last_message_id,
                    lastMessageAt: Number(row.last_message_at || 0) || null,
                    lastMessageBody: row.last_message_body || '',
                    lastMessageFromMe: Boolean(row.last_message_from_me),
                    lastMessageAck: Number.isFinite(Number(row.last_message_ack)) ? Number(row.last_message_ack) : 0,
                    lastMessageModuleId,
                    lastMessageModuleName,
                    lastMessageModuleImageUrl,
                    lastMessageTransport,
                    lastMessageChannelType,
                    metadata: chatMetadata
                };
            });
        } catch (error) {
            if (missingRelation(error) || missingColumn(error, 'wa_module_id')) return [];
            throw error;
        }
    }

    const store = await loadStore(cleanTenant);
    const scopedRows = [];
    const chats = Object.values(store.chats || {});

    for (const chat of chats) {
        const orderedIds = Array.isArray(store.messageOrderByChat?.[chat?.id]) ? store.messageOrderByChat[chat.id] : [];
        const latestByScope = new Map();

        orderedIds.forEach((messageId) => {
            const message = store.messages?.[messageId];
            if (!message) return;
            const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
            const scopeModuleId = toSafeString(message?.waModuleId || metadata?.sentViaModuleId)?.toLowerCase() || '';
            const scopeKey = scopeModuleId || '__default__';
            const current = latestByScope.get(scopeKey);
            const messageTs = Number(message?.timestampUnix || 0) || 0;
            const currentTs = Number(current?.timestampUnix || 0) || 0;
            if (!current || messageTs >= currentTs) {
                latestByScope.set(scopeKey, message);
            }
        });

        if (latestByScope.size === 0) {
            latestByScope.set('__default__', chat?.lastMessageId ? store.messages?.[chat.lastMessageId] || null : null);
        }

        for (const lastMessageValue of latestByScope.values()) {
            const lastMessage = lastMessageValue && typeof lastMessageValue === 'object' ? lastMessageValue : null;
            const lastMessageMetadata = lastMessage?.metadata && typeof lastMessage.metadata === 'object'
                ? lastMessage.metadata
                : {};
            const lastMessageModuleId = toSafeString(lastMessage?.waModuleId || lastMessageMetadata.sentViaModuleId)?.toLowerCase() || null;
            const lastMessageModuleName = toSafeString(lastMessageMetadata.sentViaModuleName) || null;
            const lastMessageModuleImageUrl = toSafeString(lastMessageMetadata.sentViaModuleImageUrl) || null;
            const lastMessageTransport = toSafeString(lastMessageMetadata.sentViaTransport)?.toLowerCase() || null;
            const lastMessageChannelType = toSafeString(lastMessageMetadata.sentViaChannelType)?.toLowerCase() || null;

            scopedRows.push({
                chatId: chat.id,
                displayName: chat.displayName || null,
                phone: chat.phone || null,
                subtitle: chat.subtitle || null,
                unreadCount: Number(chat.unreadCount || 0),
                archived: Boolean(chat.archived),
                pinned: Boolean(chat.pinned),
                lastMessageId: lastMessage?.messageId || chat.lastMessageId || null,
                lastMessageAt: Number(lastMessage?.timestampUnix || chat.lastMessageAt || 0) || null,
                lastMessageBody: String(lastMessage?.body || ''),
                lastMessageFromMe: Boolean(lastMessage?.fromMe),
                lastMessageAck: Number.isFinite(Number(lastMessage?.ack)) ? Number(lastMessage.ack) : 0,
                lastMessageModuleId,
                lastMessageModuleName,
                lastMessageModuleImageUrl,
                lastMessageTransport,
                lastMessageChannelType,
                metadata: chat.metadata && typeof chat.metadata === 'object' ? chat.metadata : {}
            });
        }
    }

    return scopedRows
        .sort((a, b) => (Number(b?.lastMessageAt || 0) - Number(a?.lastMessageAt || 0)))
        .slice(safeOffset, safeOffset + safeLimit);
}
async function listMessages(tenantId = DEFAULT_TENANT_ID, {
    chatId = '',
    limit = 200,
    beforeTimestamp = null
} = {}) {
    if (!isHistoryEnabled()) return [];

    const cleanTenant = resolveTenantId(tenantId);
    const safeChatId = toSafeString(chatId);
    if (!safeChatId) return [];
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    const safeBefore = toSafeNumber(beforeTimestamp, null);

    if (getStorageDriver() === 'postgres') {
        try {
            await ensurePostgresMessageColumns();
            const params = [cleanTenant, safeChatId, safeLimit];
            let filter = '';
            if (Number.isFinite(safeBefore)) {
                params.splice(2, 0, safeBefore);
                filter = 'AND COALESCE(timestamp_unix, 0) < $3';
            }

            const sql = Number.isFinite(safeBefore)
                ? `SELECT message_id, chat_id, from_me, sender_id, sender_phone, author_id, wa_module_id, wa_phone_number, body,
                          message_type, timestamp_unix, ack, edited, edited_at_unix, has_media,
                          media_mime, media_filename, media_size_bytes, quoted_message_id,
                          order_payload, location_payload, metadata
                     FROM tenant_messages
                    WHERE tenant_id = $1
                      AND chat_id = $2
                      ${filter}
                    ORDER BY timestamp_unix DESC NULLS LAST, created_at DESC
                    LIMIT $4`
                : `SELECT message_id, chat_id, from_me, sender_id, sender_phone, author_id, wa_module_id, wa_phone_number, body,
                          message_type, timestamp_unix, ack, edited, edited_at_unix, has_media,
                          media_mime, media_filename, media_size_bytes, quoted_message_id,
                          order_payload, location_payload, metadata
                     FROM tenant_messages
                    WHERE tenant_id = $1
                      AND chat_id = $2
                    ORDER BY timestamp_unix DESC NULLS LAST, created_at DESC
                    LIMIT $3`;

            const { rows } = await queryPostgres(sql, params);
            return rows.map((row) => ({
                messageId: row.message_id,
                chatId: row.chat_id,
                fromMe: Boolean(row.from_me),
                senderId: row.sender_id,
                senderPhone: row.sender_phone,
                waModuleId: row.wa_module_id || null,
                waPhoneNumber: row.wa_phone_number || null,
                authorId: row.author_id,
                body: row.body,
                messageType: row.message_type,
                timestampUnix: Number(row.timestamp_unix || 0) || null,
                ack: Number.isFinite(Number(row.ack)) ? Number(row.ack) : null,
                edited: Boolean(row.edited),
                editedAtUnix: Number(row.edited_at_unix || 0) || null,
                hasMedia: Boolean(row.has_media),
                mediaMime: row.media_mime,
                mediaFilename: row.media_filename,
                mediaSizeBytes: Number(row.media_size_bytes || 0) || null,
                quotedMessageId: row.quoted_message_id,
                orderPayload: row.order_payload && typeof row.order_payload === 'object' ? row.order_payload : null,
                locationPayload: row.location_payload && typeof row.location_payload === 'object' ? row.location_payload : null,
                metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
            }));
        } catch (error) {
            if (missingRelation(error) || missingColumn(error, 'wa_module_id')) return [];
            throw error;
        }
    }

    const store = await loadStore(cleanTenant);
    const orderedIds = Array.isArray(store.messageOrderByChat[safeChatId])
        ? store.messageOrderByChat[safeChatId]
        : [];

    const rows = orderedIds
        .map((id) => store.messages[id])
        .filter(Boolean)
        .filter((message) => {
            if (!Number.isFinite(safeBefore)) return true;
            return Number(message.timestampUnix || 0) < safeBefore;
        })
        .slice(0, safeLimit)
        .map((item) => ({ ...item }));

    return rows;
}

module.exports = {
    isHistoryEnabled,
    normalizeMessageRecord,
        updateChatState,
updateMessageAck,
    updateMessageEdit,
    listChats,
    listMessages
};
