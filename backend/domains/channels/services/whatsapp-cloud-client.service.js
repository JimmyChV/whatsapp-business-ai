const EventEmitter = require('events');
const crypto = require('crypto');
const { queryPostgres } = require('../../../config/persistence-runtime');
const {
    normalizeDigits,
    toChatId,
    toWaId,
    safeTimestamp,
    randomMessageId,
    ackFromCloudStatus,
    parseMoneyLike,
    parseQuantityLike,
    buildOrderLineFromCloud,
    compactObject,
    normalizeRuntimeCloudConfig
} = require('../helpers/cloud-runtime.helpers');

class WhatsAppCloudClient extends EventEmitter {
    constructor() {
        super();
        this.isReady = false;
        this.lastQr = null;

        this.chats = new Map();
        this.contacts = new Map();
        this.messagesByChat = new Map();
        this.messageById = new Map();
        this.outboundMessageToChat = new Map();
        this.runtimeConfig = {};
        this.mediaIdCache = new Map();

        this.client = this.createClientFacade();
        this.refreshClientInfo();
    }

    get graphVersion() {
        return String(this.runtimeConfig?.graphVersion || 'v22.0').trim();
    }

    get graphBaseUrl() {
        return `https://graph.facebook.com/${this.graphVersion}`;
    }

    get accessToken() {
        return String(this.runtimeConfig?.systemUserToken || '').trim();
    }

    get phoneNumberId() {
        return String(this.runtimeConfig?.phoneNumberId || '').trim();
    }

    get appId() {
        return String(this.runtimeConfig?.appId || '').trim();
    }

    get appSecret() {
        return String(this.runtimeConfig?.appSecret || '').trim();
    }

    get selfDigits() {
        const digits = normalizeDigits(
            this.runtimeConfig?.displayPhoneNumber
            || this.phoneNumberId
            || ''
        );
        return digits || '0000000000';
    }

    get selfChatId() {
        return `${this.selfDigits}@c.us`;
    }

    get runtimeTenantId() {
        return String(this.runtimeConfig?.tenantId || 'default').trim() || 'default';
    }

    isConfigured() {
        return Boolean(this.phoneNumberId && this.accessToken && this.appId);
    }

    refreshClientInfo() {
        this.client.info = {
            wid: {
                _serialized: this.selfChatId,
                user: this.selfDigits,
                server: 'c.us'
            },
            pushname: String(this.runtimeConfig?.businessName || 'Cloud API'),
            platform: 'cloud'
        };
    }

    createClientFacade() {
        const facade = {
            info: null,
            getContacts: async () => this.getContacts(),
            getContactById: async (id) => this.getContactById(id),
            getChatById: async (id) => this.getChatById(id),
            getProfilePicUrl: async (id) => {
                const contact = await this.getContactById(id);
                return contact?.profilePicUrl || null;
            },
            getNumberId: async (phone) => this.getNumberId(phone),
            addOrRemoveLabels: async () => [],
            logout: async () => {
                this.isReady = false;
                this.emit('disconnected', 'CLOUD_LOGOUT');
            }
        };
        return facade;
    }

    setRuntimeConfig(config = {}) {
        this.runtimeConfig = normalizeRuntimeCloudConfig(config);
        this.refreshClientInfo();
        return this.getRuntimeConfigPublic();
    }

    clearRuntimeConfig() {
        this.runtimeConfig = {};
        this.refreshClientInfo();
        return this.getRuntimeConfigPublic();
    }

    getRuntimeConfigPublic() {
        return {
            tenantId: String(this.runtimeConfig?.tenantId || '').trim() || null,
            appId: String(this.runtimeConfig?.appId || '').trim() || null,
            wabaId: String(this.runtimeConfig?.wabaId || '').trim() || null,
            phoneNumberId: String(this.runtimeConfig?.phoneNumberId || '').trim() || null,
            verifyToken: String(this.runtimeConfig?.verifyToken || '').trim() || null,
            graphVersion: String(this.runtimeConfig?.graphVersion || '').trim() || null,
            displayPhoneNumber: String(this.runtimeConfig?.displayPhoneNumber || '').trim() || null,
            businessName: String(this.runtimeConfig?.businessName || '').trim() || null,
            hasSystemUserToken: Boolean(this.runtimeConfig?.systemUserToken),
            hasAppSecret: Boolean(this.runtimeConfig?.appSecret)
        };
    }

    getCapabilities() {
        return {
            messageEdit: false,
            messageEditSync: false,
            messageForward: false,
            messageDelete: false,
            messageReply: true,
            quickReplies: false,
            quickRepliesRead: false,
            quickRepliesWrite: false
        };
    }

    async initialize() {
        this.refreshClientInfo();
        if (!this.isConfigured()) {
            const msg = '[WA][Cloud] META_* credentials are missing. Cloud transport cannot start.';
            this.emit('auth_failure', msg);
            throw new Error(msg);
        }
        if (this.isReady) return true;

        this.isReady = true;
        this.lastQr = null;
        this.emit('authenticated');
        this.emit('ready');
        return true;
    }

    async graphJson(path, options = {}) {
        const execute = async (includeProof = false) => {
            const url = this.buildGraphUrl(path, { includeAppSecretProof: includeProof });
            const response = await fetch(url, {
                ...options,
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    ...(options.headers || {})
                }
            });

            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            const payload = contentType.includes('application/json')
                ? await response.json().catch(() => ({}))
                : await response.text().catch(() => '');

            const detail = typeof payload === 'string'
                ? payload
                : (payload?.error?.message || JSON.stringify(payload || {}));

            return { response, payload, detail };
        };

        const first = await execute(false);
        if (first.response.ok) {
            return first.payload;
        }

        const needsProof = /appsecret_proof|requires appsecret|an appsecret proof/i.test(String(first.detail || ''));
        if (needsProof && this.appSecret) {
            console.warn('[WA][Cloud] Graph requires appsecret_proof; retrying with proof.');
            const retry = await execute(true);
            if (retry.response.ok) {
                return retry.payload;
            }
            const retryError = new Error(`Cloud API error ${retry.response.status}: ${retry.detail}. Verifica que META_APP_SECRET corresponda al token de sistema del modulo.`);
            retryError.status = retry.response.status;
            retryError.payload = retry.payload;
            throw retryError;
        }

        const error = new Error(`Cloud API error ${first.response.status}: ${first.detail}`);
        error.status = first.response.status;
        error.payload = first.payload;
        throw error;
    }

    async graphRaw(path, options = {}) {
        const url = this.buildGraphUrl(path);
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                ...(options.headers || {})
            }
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            const error = new Error(`Cloud API raw error ${response.status}: ${detail}`);
            error.status = response.status;
            throw error;
        }
        return response;
    }

    buildGraphUrl(path = '', { includeAppSecretProof = false } = {}) {
        const baseUrl = `${this.graphBaseUrl}${path}`;
        const token = this.accessToken;
        const secret = this.appSecret;
        if (!includeAppSecretProof || !token || !secret) return baseUrl;

        let proof = '';
        try {
            proof = crypto.createHmac('sha256', secret).update(token).digest('hex');
        } catch (_) {
            return baseUrl;
        }

        if (!proof) return baseUrl;

        try {
            const url = new URL(baseUrl);
            if (!url.searchParams.has('appsecret_proof')) {
                url.searchParams.set('appsecret_proof', proof);
            }
            return url.toString();
        } catch (_) {
            const glue = baseUrl.includes('?') ? '&' : '?';
            return `${baseUrl}${glue}appsecret_proof=${encodeURIComponent(proof)}`;
        }
    }

    buildGraphUrlWithToken(path = '', {
        token = '',
        includeAppSecretProof = false,
        query = null
    } = {}) {
        const normalizedPath = String(path || '').startsWith('/')
            ? String(path || '')
            : `/${String(path || '')}`;
        const url = new URL(`${this.graphBaseUrl}${normalizedPath}`);
        const queryObject = query && typeof query === 'object' && !Array.isArray(query) ? query : {};
        Object.entries(queryObject).forEach(([key, value]) => {
            const cleanKey = String(key || '').trim();
            if (!cleanKey) return;
            if (value === null || value === undefined) return;
            const cleanValue = String(value).trim();
            if (!cleanValue) return;
            url.searchParams.set(cleanKey, cleanValue);
        });

        const cleanToken = String(token || '').trim();
        const secret = this.appSecret;
        if (includeAppSecretProof && cleanToken && secret) {
            try {
                const proof = crypto.createHmac('sha256', secret).update(cleanToken).digest('hex');
                if (proof) {
                    url.searchParams.set('appsecret_proof', proof);
                }
            } catch (_) { }
        }

        return url.toString();
    }

    normalizeGraphError(payload = {}, status = 0) {
        const envelope = payload && typeof payload === 'object' ? payload : {};
        const errorObj = envelope?.error && typeof envelope.error === 'object' ? envelope.error : envelope;
        const codeRaw = Number(errorObj?.code);
        const subcodeRaw = Number(errorObj?.error_subcode ?? errorObj?.errorSubcode);
        const code = Number.isFinite(codeRaw) ? codeRaw : null;
        const errorSubcode = Number.isFinite(subcodeRaw) ? subcodeRaw : null;
        const errorUserTitle = String(errorObj?.error_user_title || '').trim() || null;
        const errorUserMsg = String(errorObj?.error_user_msg || '').trim() || null;
        const message = String(errorObj?.message || '').trim() || `Cloud API error ${Number(status || 0) || 0}`;

        return {
            code,
            error_subcode: errorSubcode,
            error_user_title: errorUserTitle,
            error_user_msg: errorUserMsg,
            message
        };
    }

    createGraphRequestError({ status = 0, payload = {}, detail = '', context = 'Cloud API error' } = {}) {
        const normalized = this.normalizeGraphError(payload, status);
        const normalizedDetail = String(detail || normalized.message || '').trim();
        const error = new Error(`${context} ${Number(status || 0)}: ${normalizedDetail}`);
        error.status = Number(status || 0) || 0;
        error.payload = payload;
        error.code = normalized.code;
        error.error_subcode = normalized.error_subcode;
        error.error_user_title = normalized.error_user_title;
        error.error_user_msg = normalized.error_user_msg;
        error.messageDetail = normalized.message;
        return error;
    }

    async graphJsonWithToken(path, {
        method = 'GET',
        headers = null,
        body = null,
        query = null,
        systemUserToken = ''
    } = {}) {
        const token = String(systemUserToken || this.accessToken).trim();
        if (!token) {
            throw new Error('Cloud API token is missing.');
        }

        const execute = async (includeProof = false) => {
            const url = this.buildGraphUrlWithToken(path, {
                token,
                includeAppSecretProof: includeProof,
                query
            });
            const requestHeaders = headers && typeof headers === 'object' ? { ...headers } : {};
            if (systemUserToken) {
                requestHeaders['Authorization'] = `Bearer ${systemUserToken}`;
            }
            const response = await fetch(url, {
                method,
                headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
                body
            });
            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            const payload = contentType.includes('application/json')
                ? await response.json().catch(() => ({}))
                : await response.text().catch(() => '');
            const detail = typeof payload === 'string'
                ? payload
                : String(payload?.error?.message || JSON.stringify(payload || {}));
            return { response, payload, detail };
        };

        const first = await execute(false);
        if (first.response.ok) {
            return first.payload;
        }

        const needsProof = /appsecret_proof|requires appsecret|an appsecret proof/i.test(String(first.detail || ''));
        if (needsProof && this.appSecret) {
            console.warn('[WA][Cloud] Graph requires appsecret_proof; retrying with proof.');
            const retry = await execute(true);
            if (retry.response.ok) {
                return retry.payload;
            }
            throw this.createGraphRequestError({
                status: retry.response.status,
                payload: retry.payload,
                detail: retry.detail,
                context: 'Cloud API error'
            });
        }

        throw this.createGraphRequestError({
            status: first.response.status,
            payload: first.payload,
            detail: first.detail,
            context: 'Cloud API error'
        });
    }

    async createMessageTemplate(wabaId, templatePayload, { systemUserToken } = {}) {
        const safeWabaId = String(wabaId || '').trim();
        if (!safeWabaId) throw new Error('wabaId is required.');
        if (!templatePayload || typeof templatePayload !== 'object' || Array.isArray(templatePayload)) {
            throw new Error('templatePayload must be a plain object.');
        }

        return this.graphJsonWithToken(`/${encodeURIComponent(safeWabaId)}/message_templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templatePayload),
            systemUserToken
        });
    }

    async listMessageTemplates(wabaId, {
        systemUserToken,
        fields = '',
        limit = null,
        after = ''
    } = {}) {
        const safeWabaId = String(wabaId || '').trim();
        if (!safeWabaId) throw new Error('wabaId is required.');

        const query = {};
        const normalizedFields = Array.isArray(fields)
            ? fields.map((item) => String(item || '').trim()).filter(Boolean).join(',')
            : String(fields || '').trim();
        if (normalizedFields) query.fields = normalizedFields;

        const numericLimit = Number(limit);
        if (Number.isFinite(numericLimit) && numericLimit > 0) {
            query.limit = String(Math.floor(numericLimit));
        }

        const cursor = String(after || '').trim();
        if (cursor) query.after = cursor;

        return this.graphJsonWithToken(`/${encodeURIComponent(safeWabaId)}/message_templates`, {
            method: 'GET',
            query,
            systemUserToken
        });
    }

    async deleteMessageTemplate(wabaId, templateName, { systemUserToken } = {}) {
        const safeWabaId = String(wabaId || '').trim();
        if (!safeWabaId) throw new Error('wabaId is required.');
        const safeTemplateName = String(templateName || '').trim();
        if (!safeTemplateName) throw new Error('templateName is required.');

        return this.graphJsonWithToken(`/${encodeURIComponent(safeWabaId)}/message_templates`, {
            method: 'DELETE',
            query: { name: safeTemplateName },
            systemUserToken
        });
    }

    ensureContact(chatId, { name = '', pushname = '', profilePicUrl = null } = {}) {
        const safeChatId = toChatId(chatId);
        if (!safeChatId) return null;

        const existing = this.contacts.get(safeChatId);
        const user = toWaId(safeChatId);
        const displayName = String(name || pushname || existing?.name || '').trim() || `+${user}`;
        const next = {
            id: {
                _serialized: safeChatId,
                user,
                server: 'c.us'
            },
            number: user,
            phoneNumber: user,
            name: displayName,
            pushname: String(pushname || name || existing?.pushname || '').trim() || displayName,
            shortName: String(name || pushname || existing?.shortName || '').trim() || displayName,
            isBusiness: Boolean(existing?.isBusiness),
            isEnterprise: Boolean(existing?.isEnterprise),
            isMyContact: Boolean(existing?.isMyContact),
            isWAContact: true,
            isBlocked: false,
            isMe: safeChatId === this.selfChatId,
            isUser: true,
            isGroup: false,
            isPSA: false,
            profilePicUrl: profilePicUrl || existing?.profilePicUrl || null,
            _about: existing?._about || null,
            getAbout: async () => existing?._about || null,
            getProfilePicUrl: async () => profilePicUrl || existing?.profilePicUrl || null
        };

        this.contacts.set(safeChatId, next);
        return next;
    }

    ensureChat(chatId, contact = null) {
        const safeChatId = toChatId(chatId);
        if (!safeChatId) return null;

        const existing = this.chats.get(safeChatId);
        const chatContact = contact || this.ensureContact(safeChatId);
        const existingTimestamp = Number(existing?.timestamp || 0);
        const timestamp = Number.isFinite(existingTimestamp) && existingTimestamp > 0
            ? Math.floor(existingTimestamp)
            : 0;
        const next = {
            id: {
                _serialized: safeChatId,
                user: toWaId(safeChatId),
                server: 'c.us'
            },
            name: chatContact?.name || existing?.name || `+${toWaId(safeChatId)}`,
            formattedTitle: chatContact?.name || existing?.formattedTitle || `+${toWaId(safeChatId)}`,
            contact: chatContact,
            unreadCount: Number(existing?.unreadCount || 0) || 0,
            timestamp,
            archived: Boolean(existing?.archived),
            lastMessage: existing?.lastMessage || null,
            labels: []
        };

        this.chats.set(safeChatId, next);
        if (!this.messagesByChat.has(safeChatId)) {
            this.messagesByChat.set(safeChatId, []);
        }
        return next;
    }

    createMessageModel(raw = {}) {
        const messageId = String(raw.id || randomMessageId()).trim();
        const chatId = toChatId(raw.chatId || (raw.fromMe ? raw.to : raw.from));
        const hasMedia = Boolean(raw.hasMedia || raw.mediaId);

        const message = {
            id: { _serialized: messageId },
            from: String(raw.from || ''),
            to: String(raw.to || ''),
            body: String(raw.body || ''),
            timestamp: safeTimestamp(raw.timestamp),
            fromMe: Boolean(raw.fromMe),
            hasMedia,
            ack: Number.isFinite(Number(raw.ack)) ? Number(raw.ack) : 0,
            type: String(raw.type || 'chat'),
            author: raw.author || null,
            _data: {
                id: messageId,
                from: String(raw.from || ''),
                to: String(raw.to || ''),
                body: String(raw.body || ''),
                type: String(raw.type || 'chat'),
                timestamp: safeTimestamp(raw.timestamp),
                ack: Number.isFinite(Number(raw.ack)) ? Number(raw.ack) : 0,
                filename: raw.filename || null,
                mimetype: raw.mimetype || null,
                size: Number.isFinite(Number(raw.fileSizeBytes)) ? Number(raw.fileSizeBytes) : null,
                mediaId: raw.mediaId || null,
                ...compactObject(raw.rawData || {}),
                latestEditMsgKey: null,
                latestEditSenderTimestampMs: null
            },
            order: raw.order || null,
            orderProducts: Array.isArray(raw.orderProducts) ? raw.orderProducts : null,
            location: raw.location || null,
            referral: raw.referral || null,
            rawReferral: raw.rawReferral || null,
            quotedMessage: raw.quotedMessage || null,
            hasQuotedMsg: Boolean(raw.quotedMessageId),
            getQuotedMessage: async () => {
                if (raw.quotedMessage) {
                    return {
                        id: { _serialized: raw.quotedMessage.id },
                        body: raw.quotedMessage.body,
                        fromMe: Boolean(raw.quotedMessage.fromMe),
                        hasMedia: Boolean(raw.quotedMessage.hasMedia),
                        type: raw.quotedMessage.type || 'chat',
                        _data: {
                            caption: raw.quotedMessage.body,
                            quotedStanzaID: raw.quotedMessage.id,
                            quotedMsg: {
                                body: raw.quotedMessage.body,
                                type: raw.quotedMessage.type || 'chat',
                                fromMe: Boolean(raw.quotedMessage.fromMe),
                                isMedia: Boolean(raw.quotedMessage.hasMedia)
                            }
                        }
                    };
                }
                if (!raw.quotedMessageId) return null;
                return this.getMessageById(raw.quotedMessageId);
            },
            downloadMedia: async () => {
                if (!raw.mediaId) return null;
                const media = await this.downloadMediaById(raw.mediaId, raw.mimetype);
                if (!media) return null;
                return {
                    data: media.data,
                    mimetype: media.mimetype || raw.mimetype || 'application/octet-stream',
                    filename: raw.filename || 'documento'
                };
            }
        };

        message.chatId = chatId;
        message.filename = raw.filename || null;
        message.fileSizeBytes = Number.isFinite(Number(raw.fileSizeBytes)) ? Number(raw.fileSizeBytes) : null;
        message.mimetype = raw.mimetype || null;
        message.mediaId = raw.mediaId || null;

        return message;
    }

    async buildButtonReplyQuotedMessage(contextMessageId = '') {
        const messageId = String(contextMessageId || '').trim();
        if (!messageId) return null;

        let body = '[Cotización]';
        try {
            const { rows } = await queryPostgres(
                'SELECT message_id FROM tenant_messages WHERE message_id = $1 LIMIT 1',
                [messageId]
            );
            if (Array.isArray(rows) && rows.length > 0) {
                body = '[Cotización Lávitat®]';
            }
        } catch (error) {
            body = '[Cotización]';
        }

        return {
            id: messageId,
            body,
            fromMe: true,
            hasMedia: false,
            type: 'interactive'
        };
    }

    upsertMessage(raw = {}, { incoming = false, emitEvent = null } = {}) {
        const message = this.createMessageModel(raw);
        const chatId = toChatId(message.chatId || (message.fromMe ? message.to : message.from));
        if (!chatId) return null;

        const chat = this.ensureChat(chatId, this.ensureContact(chatId));
        const current = this.messagesByChat.get(chatId) || [];
        const existingIdx = current.findIndex((m) => String(m?.id?._serialized || '') === String(message.id._serialized));
        if (existingIdx >= 0) {
            current[existingIdx] = message;
        } else {
            current.push(message);
            current.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
        }
        this.messagesByChat.set(chatId, current);
        this.messageById.set(message.id._serialized, message);

        chat.timestamp = message.timestamp;
        chat.lastMessage = message;
        if (incoming) {
            chat.unreadCount = Math.max(0, Number(chat.unreadCount || 0) + 1);
            chat.lastIncomingMessageId = message.id._serialized;
        }

        if (message.fromMe) {
            this.outboundMessageToChat.set(message.id._serialized, chatId);
        }

        if (emitEvent === 'message') {
            this.emit('message', message);
        } else if (emitEvent === 'message_sent') {
            this.emit('message_sent', message);
        }

        return message;
    }

    getChatModel(chatId) {
        const safeChatId = toChatId(chatId);
        const chat = this.ensureChat(safeChatId, this.ensureContact(safeChatId));
        if (!chat) return null;

        return {
            id: chat.id,
            name: chat.name,
            formattedTitle: chat.formattedTitle,
            contact: chat.contact,
            unreadCount: Number(chat.unreadCount || 0),
            timestamp: Number(chat.timestamp || 0),
            archived: Boolean(chat.archived),
            lastMessage: chat.lastMessage,
            getLabels: async () => [],
            changeLabels: async () => false,
            fetchMessages: async ({ limit = 40 } = {}) => {
                const max = Math.max(1, Number(limit || 40));
                const rows = this.messagesByChat.get(safeChatId) || [];
                return rows.slice(-max);
            },
            sendSeen: async () => {
                await this.markAsRead(safeChatId);
                return true;
            }
        };
    }

    async getChats() {
        if (!this.isReady) return [];
        return Array.from(this.chats.values())
            .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
            .map((chat) => this.getChatModel(chat.id._serialized));
    }

    async getChatById(chatId) {
        const safeChatId = toChatId(chatId);
        if (!safeChatId) throw new Error('Invalid chat id');
        return this.getChatModel(safeChatId);
    }

    async getContacts() {
        return Array.from(this.contacts.values())
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
    }

    async getContactById(contactId) {
        const safeChatId = toChatId(contactId);
        if (!safeChatId) throw new Error('Invalid contact id');
        const existing = this.contacts.get(safeChatId);
        if (existing) return existing;
        return this.ensureContact(safeChatId);
    }

    async getMessages(chatId, limit = 40) {
        const safeChatId = toChatId(chatId);
        if (!safeChatId) return [];
        this.ensureChat(safeChatId, this.ensureContact(safeChatId));
        const rows = this.messagesByChat.get(safeChatId) || [];
        const max = Math.max(1, Number(limit || 40));
        return rows.slice(-max);
    }

    async getMessageById(messageId) {
        const id = String(messageId || '').trim();
        if (!id) return null;
        return this.messageById.get(id) || null;
    }

    async getMessagesEditability(messageIds = []) {
        const output = {};
        (Array.isArray(messageIds) ? messageIds : []).forEach((id) => {
            output[String(id || '').trim()] = false;
        });
        return output;
    }

    async canEditMessageById() {
        return false;
    }

    async getNumberId(phone) {
        const digits = withDefaultCountryCode(phone);
        if (!digits || digits.length < 8) return null;

        if (!this.isConfigured()) {
            return { user: digits, _serialized: `${digits}@c.us` };
        }

        try {
            const payload = await this.graphJson(`/${this.phoneNumberId}/contacts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    blocking: 'wait',
                    force_check: true,
                    contacts: [digits]
                })
            });

            const contact = Array.isArray(payload?.contacts) ? payload.contacts[0] : null;
            const status = String(contact?.status || '').toLowerCase();
            const waId = normalizeDigits(contact?.wa_id || '');
            if (status === 'valid' && waId) {
                return { user: waId, _serialized: `${waId}@c.us` };
            }
            return null;
        } catch (error) {
            const code = Number(error?.code || 0);
            const subcode = Number(error?.errorSubcode || error?.error_subcode || 0);
            const detail = String(error?.message || '').toLowerCase();
            const unsupportedContacts = code === 100 && (subcode === 33 || detail.includes('unsupported post request'));
            if (unsupportedContacts) {
                return { user: digits, _serialized: `${digits}@c.us` };
            }
            return null;
        }
    }

    async resolveSendWaId(to) {
        const waId = toWaId(to);
        if (!waId) throw new Error('Invalid destination');
        return waId;
    }

    async sendMessage(to, body, options = {}) {
        if (!this.isReady) throw new Error('Cloud client not ready');
        const waId = await this.resolveSendWaId(to);

        const payload = {
            messaging_product: 'whatsapp',
            to: waId,
            type: 'text',
            text: { body: String(body || '') }
        };

        const quotedMessageId = String(options?.quotedMessageId || '').trim();
        if (quotedMessageId) {
            payload.context = { message_id: quotedMessageId };
        }

        const response = await this.graphJson(`/${this.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const messageId = String(response?.messages?.[0]?.id || randomMessageId('cloud_out'));
        const chatId = `${waId}@c.us`;
        const message = this.upsertMessage({
            id: messageId,
            chatId,
            from: this.selfChatId,
            to: chatId,
            body: String(body || ''),
            fromMe: true,
            type: 'chat',
            ack: 1,
            quotedMessageId,
            timestamp: safeTimestamp(),
            hasMedia: false
        }, { incoming: false, emitEvent: 'message_sent' });

        if (message) {
            this.emit('message_ack', { message, ack: 1 });
        }

        return response;
    }

    async sendTemplateMessage(to, { templateName, languageCode = 'es', components = [], metadata = {} } = {}) {
        if (!this.isReady) throw new Error('Cloud client not ready');
        const waId = await this.resolveSendWaId(to);
        const safeTemplateName = String(templateName || '').trim();
        if (!safeTemplateName) throw new Error('templateName requerido para enviar template.');
        const metadataObj = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

        const payload = {
            messaging_product: 'whatsapp',
            to: waId,
            type: 'template',
            template: {
                name: safeTemplateName,
                language: {
                    code: String(languageCode || 'es').trim() || 'es'
                }
            }
        };

        if (Array.isArray(components) && components.length > 0) {
            payload.template.components = components;
        }

        const response = await this.graphJson(`/${this.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const messageId = String(response?.messages?.[0]?.id || randomMessageId('cloud_out_template'));
        const chatId = `${waId}@c.us`;
        const templateBody = String(metadataObj?.previewText || `Template: ${safeTemplateName}`).trim();
        const message = this.upsertMessage({
            id: messageId,
            chatId,
            from: this.selfChatId,
            to: chatId,
            body: templateBody,
            fromMe: true,
            type: 'template',
            ack: 1,
            timestamp: safeTimestamp(),
            hasMedia: false,
            rawData: compactObject({
                templateName: safeTemplateName,
                templateLanguage: payload.template?.language?.code || 'es',
                templateComponents: Array.isArray(metadataObj?.templateComponents) ? metadataObj.templateComponents : (Array.isArray(components) ? components : []),
                metadata: metadataObj
            })
        }, { incoming: false, emitEvent: 'message_sent' });

        if (message) {
            this.emit('message_ack', { message, ack: 1 });
        }

        return response;
    }

    async sendInteractiveMessage(to, interactive = {}, options = {}) {
        if (!this.isReady) throw new Error('Cloud client not ready');
        const waId = await this.resolveSendWaId(to);
        const safeInteractive = interactive && typeof interactive === 'object' && !Array.isArray(interactive)
            ? interactive
            : null;
        if (!safeInteractive) throw new Error('interactive requerido para enviar mensaje interactivo.');

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: waId,
            type: 'interactive',
            interactive: safeInteractive
        };
        const quotedMessageId = String(options?.quotedMessageId || '').trim();
        if (quotedMessageId) {
            payload.context = { message_id: quotedMessageId };
        }

        const response = await this.graphJson(`/${this.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const messageId = String(response?.messages?.[0]?.id || randomMessageId('cloud_out_interactive'));
        const chatId = `${waId}@c.us`;
        const interactiveBody = String(safeInteractive?.body?.text || '').trim();
        const message = this.upsertMessage({
            id: messageId,
            chatId,
            from: this.selfChatId,
            to: chatId,
            body: interactiveBody,
            fromMe: true,
            type: 'interactive',
            ack: 1,
            timestamp: safeTimestamp(),
            hasMedia: false,
            quotedMessageId,
            rawData: compactObject({
                interactive: safeInteractive,
                interactiveType: String(safeInteractive?.type || '').trim() || null
            })
        }, { incoming: false, emitEvent: 'message_sent' });

        if (message) {
            this.emit('message_ack', { message, ack: 1 });
        }

        return messageId;
    }

    async sendReaction(to, { messageId, emoji } = {}) {
        if (!this.isReady) throw new Error('Cloud client not ready');
        const waId = await this.resolveSendWaId(to);
        const safeMessageId = String(messageId || '').trim();
        const safeEmoji = String(emoji || '').trim();
        if (!safeMessageId || !safeEmoji) {
            throw new Error('messageId y emoji son requeridos para enviar reaccion.');
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: waId,
            type: 'reaction',
            reaction: {
                message_id: safeMessageId,
                emoji: safeEmoji
            }
        };

        return await this.graphJson(`/${this.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    }

    async uploadMedia(mediaData, mimetype, filename = 'adjunto') {
        const safeMime = String(mimetype || 'application/octet-stream').trim() || 'application/octet-stream';
        const safeName = String(filename || 'adjunto').trim() || 'adjunto';
        const buffer = Buffer.from(String(mediaData || ''), 'base64');

        const blob = new Blob([buffer], { type: safeMime });
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('type', safeMime);
        form.append('file', blob, safeName);

        const payload = await this.graphJson(`/${this.phoneNumberId}/media`, {
            method: 'POST',
            body: form
        });

        return String(payload?.id || '').trim() || null;
    }

    buildMediaIdCacheKey(contentHash = '') {
        const safeHash = String(contentHash || '').trim().toLowerCase();
        if (!safeHash) return '';
        return `${this.runtimeTenantId}:${safeHash}`;
    }

    buildMediaContentHash(mediaData = '') {
        const cleanMediaData = String(mediaData || '').trim();
        if (!cleanMediaData) return '';
        try {
            return crypto.createHash('sha256').update(cleanMediaData).digest('hex');
        } catch (_) {
            return '';
        }
    }

    getCachedMediaId(contentHash = '') {
        const cacheKey = this.buildMediaIdCacheKey(contentHash);
        if (!cacheKey) return null;
        const existing = this.mediaIdCache.get(cacheKey);
        if (!existing || typeof existing !== 'object') return null;
        return {
            mediaId: String(existing.mediaId || '').trim() || null,
            mimetype: String(existing.mimetype || '').trim() || null,
            filename: String(existing.filename || '').trim() || null,
            createdAt: Number(existing.createdAt || 0) || null,
            lastUsedAt: Number(existing.lastUsedAt || 0) || null
        };
    }

    setCachedMediaId(contentHash = '', payload = {}) {
        const cacheKey = this.buildMediaIdCacheKey(contentHash);
        const mediaId = String(payload?.mediaId || '').trim();
        if (!cacheKey || !mediaId) return null;
        const nextEntry = {
            mediaId,
            mimetype: String(payload?.mimetype || '').trim() || null,
            filename: String(payload?.filename || '').trim() || null,
            createdAt: Number(payload?.createdAt || Date.now()) || Date.now(),
            lastUsedAt: Number(payload?.lastUsedAt || Date.now()) || Date.now()
        };
        this.mediaIdCache.set(cacheKey, nextEntry);
        return { ...nextEntry };
    }

    deleteCachedMediaId(contentHash = '') {
        const cacheKey = this.buildMediaIdCacheKey(contentHash);
        if (!cacheKey) return false;
        return this.mediaIdCache.delete(cacheKey);
    }

    isInvalidCachedMediaIdError(error = null) {
        const message = String(error?.message || '').trim().toLowerCase();
        const detail = String(error?.messageDetail || '').trim().toLowerCase();
        const code = Number(error?.code || 0);
        const subcode = Number(error?.error_subcode || 0);
        if (code === 100 || subcode === 33) return true;
        if (message.includes('media handle is invalid') || detail.includes('media handle is invalid')) return true;
        if (message.includes('invalid media id') || detail.includes('invalid media id')) return true;
        if (message.includes('no media found') || detail.includes('no media found')) return true;
        return false;
    }

    async sendMediaMessageByMediaId(waId, type, mediaId, { filename = '', caption = '', quotedMessageId = null } = {}) {
        const safeType = String(type || 'document').trim().toLowerCase() || 'document';
        const safeMediaId = String(mediaId || '').trim();
        if (!waId || !safeMediaId) throw new Error('mediaId is required');

        const mediaPayload = { id: safeMediaId };
        if (safeType === 'document') {
            mediaPayload.filename = String(filename || 'documento').trim() || 'documento';
        }
        if ((safeType === 'image' || safeType === 'video' || safeType === 'document') && String(caption || '').trim()) {
            mediaPayload.caption = String(caption || '');
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: waId,
            type: safeType,
            [safeType]: mediaPayload
        };

        const quoted = String(quotedMessageId || '').trim();
        if (quoted) payload.context = { message_id: quoted };

        return await this.graphJson(`/${this.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    }

    async sendMedia(to, mediaData, mimetype, filename, caption, isPtt = false, quotedMessageId = null) {
        if (!this.isReady) throw new Error('Cloud client not ready');
        if (isPtt) throw new Error('PTT is not supported in cloud transport');

        const waId = await this.resolveSendWaId(to);

        const mime = String(mimetype || '').toLowerCase();
        let type = 'document';
        if (mime.startsWith('image/')) type = 'image';
        else if (mime.startsWith('video/')) type = 'video';
        else if (mime.startsWith('audio/')) type = 'audio';
        const quoted = String(quotedMessageId || '').trim();
        const contentHash = this.buildMediaContentHash(mediaData);
        const cachedMedia = this.getCachedMediaId(contentHash);

        let mediaId = String(cachedMedia?.mediaId || '').trim();
        let response = null;

        if (mediaId) {
            try {
                response = await this.sendMediaMessageByMediaId(waId, type, mediaId, {
                    filename,
                    caption,
                    quotedMessageId: quoted
                });
                this.setCachedMediaId(contentHash, {
                    mediaId,
                    mimetype,
                    filename,
                    createdAt: cachedMedia?.createdAt || Date.now(),
                    lastUsedAt: Date.now()
                });
            } catch (cachedSendError) {
                if (!this.isInvalidCachedMediaIdError(cachedSendError)) throw cachedSendError;
                this.deleteCachedMediaId(contentHash);
                mediaId = '';
            }
        }

        if (!response) {
            mediaId = await this.uploadMedia(mediaData, mimetype, filename || 'adjunto');
            if (!mediaId) throw new Error('Media upload failed');
            response = await this.sendMediaMessageByMediaId(waId, type, mediaId, {
                filename,
                caption,
                quotedMessageId: quoted
            });
            if (contentHash) {
                this.setCachedMediaId(contentHash, {
                    mediaId,
                    mimetype,
                    filename,
                    createdAt: Date.now(),
                    lastUsedAt: Date.now()
                });
            }
        }

        const messageId = String(response?.messages?.[0]?.id || randomMessageId('cloud_out_media'));
        const chatId = `${waId}@c.us`;
        const message = this.upsertMessage({
            id: messageId,
            chatId,
            from: this.selfChatId,
            to: chatId,
            body: String(caption || ''),
            fromMe: true,
            type,
            ack: 1,
            timestamp: safeTimestamp(),
            hasMedia: true,
            mediaId,
            filename: filename || null,
            mimetype: mimetype || null,
            quotedMessageId: quoted || null
        }, { incoming: false, emitEvent: 'message_sent' });

        if (message) {
            this.emit('message_ack', { message, ack: 1 });
        }

        return response;
    }

    async replyToMessage(chatId, quotedMessageId, body) {
        return this.sendMessage(chatId, body, { quotedMessageId });
    }

    async forwardMessage() {
        throw new Error('Forward is not supported in cloud transport.');
    }

    async markAsRead(chatId) {
        const safeChatId = toChatId(chatId);
        const chat = this.chats.get(safeChatId);
        if (!chat) return;

        chat.unreadCount = 0;
        const messageId = String(chat.lastIncomingMessageId || '').trim();
        if (!messageId || !this.isConfigured()) return;

        try {
            await this.graphJson(`/${this.phoneNumberId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    status: 'read',
                    message_id: messageId
                })
            });
        } catch (e) { }
    }

    async getLabels() {
        return [];
    }

    async getChatLabels() {
        return [];
    }

    async getBusinessProfile() {
        if (!this.isConfigured()) return null;
        try {
            const payload = await this.graphJson(`/${this.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`);
            const row = Array.isArray(payload?.data) ? payload.data[0] : null;
            if (!row) return null;
            return {
                category: row.vertical || null,
                description: row.description || row.about || null,
                email: row.email || null,
                website: Array.isArray(row.websites) ? row.websites[0] : null,
                websites: Array.isArray(row.websites) ? row.websites : [],
                address: row.address || null,
                profile_picture_url: row.profile_picture_url || null
            };
        } catch (e) {
            return null;
        }
    }

    async getCatalog() {
        return [];
    }

    async downloadMediaById(mediaId, fallbackMime = '') {
        const id = String(mediaId || '').trim();
        if (!id || !this.isConfigured()) return null;

        try {
            const metadata = await this.graphJson(`/${id}`);
            const mediaUrl = String(metadata?.url || '').trim();
            if (!mediaUrl) return null;

            const binaryResponse = await fetch(mediaUrl, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`
                }
            });
            if (!binaryResponse.ok) return null;

            const arrayBuffer = await binaryResponse.arrayBuffer();
            const mimetype = String(metadata?.mime_type || fallbackMime || 'application/octet-stream');
            return {
                data: Buffer.from(arrayBuffer).toString('base64'),
                mimetype,
                fileSizeBytes: Number.isFinite(Number(metadata?.file_size)) ? Number(metadata.file_size) : null
            };
        } catch (error) {
            return null;
        }
    }

    async downloadMedia(message) {
        if (!message) return null;
        if (typeof message.downloadMedia === 'function') {
            return await message.downloadMedia();
        }
        const mediaId = String(message?.mediaId || message?._data?.mediaId || '').trim();
        if (!mediaId) return null;
        const mime = String(message?.mimetype || message?._data?.mimetype || '');
        const filename = String(message?.filename || message?._data?.filename || 'documento').trim() || 'documento';
        const media = await this.downloadMediaById(mediaId, mime);
        if (!media) return null;
        return {
            data: media.data,
            mimetype: media.mimetype || mime || 'application/octet-stream',
            filename
        };
    }

    normalizeReferralPayload(referral = {}) {
        if (!referral || typeof referral !== 'object') return null;
        const sourceType = String(referral?.source_type || '').trim().toLowerCase();
        const sourceId = String(referral?.source_id || '').trim();
        const sourceUrl = String(referral?.source_url || '').trim();
        const headline = String(referral?.headline || '').trim();
        const body = String(referral?.body || '').trim();
        const ctwaClid = String(referral?.ctwa_clid || '').trim();
        const mediaType = String(referral?.media_type || '').trim().toLowerCase();
        const imageUrl = String(referral?.image_url || '').trim();
        const videoUrl = String(referral?.video_url || '').trim();
        const thumbnailUrl = String(referral?.thumbnail_url || '').trim();

        const normalized = compactObject({
            sourceType: sourceType || null,
            sourceId: sourceId || null,
            sourceUrl: sourceUrl || null,
            headline: headline || null,
            body: body || null,
            ctwaClid: ctwaClid || null,
            mediaType: mediaType || null,
            imageUrl: imageUrl || null,
            videoUrl: videoUrl || null,
            thumbnailUrl: thumbnailUrl || null
        });
        if (Object.keys(normalized).length === 0) return null;
        return normalized;
    }

    extractInboundReferral(msg = {}) {
        const referral = msg?.referral && typeof msg.referral === 'object' ? msg.referral : null;
        if (!referral) return null;
        return this.normalizeReferralPayload(referral);
    }

    normalizeStatusErrors(errors = []) {
        const source = Array.isArray(errors) ? errors : [];
        return source
            .map((item) => {
                const current = item && typeof item === 'object' ? item : {};
                const details = String(current?.error_data?.details || current?.details || '').trim();
                return compactObject({
                    code: Number.isFinite(Number(current?.code)) ? Number(current.code) : null,
                    title: String(current?.title || '').trim() || null,
                    message: String(current?.message || '').trim() || null,
                    details: details || null,
                    href: String(current?.href || '').trim() || null
                });
            })
            .filter((entry) => Object.keys(entry || {}).length > 0);
    }

    normalizeTemplateWebhookEvent(change = {}, entry = {}) {
        const field = String(change?.field || '').trim().toLowerCase();
        const eventTypeByField = {
            message_template_status_update: 'status_update',
            message_template_quality_update: 'quality_update',
            template_category_update: 'category_update'
        };
        const eventType = eventTypeByField[field] || null;
        if (!eventType) return null;

        const value = change?.value && typeof change.value === 'object' ? change.value : {};
        const payload = value?.[field] && typeof value[field] === 'object' ? value[field] : value;
        const reasonRaw = payload?.reason || payload?.rejection_reason || payload?.disable_info || payload?.event;
        const reason = typeof reasonRaw === 'string'
            ? String(reasonRaw).trim()
            : (reasonRaw && typeof reasonRaw === 'object'
                ? String(reasonRaw?.description || reasonRaw?.reason || '').trim()
                : '');

        return compactObject({
            field,
            eventType,
            wabaId: String(entry?.id || value?.metadata?.waba_id || payload?.waba_id || '').trim() || null,
            phoneNumberId: String(value?.metadata?.phone_number_id || value?.phone_number_id || '').trim() || null,
            templateName: String(payload?.message_template_name || payload?.template_name || payload?.name || '').trim() || null,
            templateId: String(payload?.message_template_id || payload?.template_id || payload?.id || '').trim() || null,
            previousStatus: String(payload?.previous_status || payload?.old_status || payload?.prior_status || '').trim() || null,
            newStatus: String(payload?.event || payload?.new_status || payload?.status || '').trim() || null,
            reason: reason || null,
            raw: payload
        });
    }

    async ingestInboundMessage(msg = {}, contactsByWaId = new Map()) {
        const fromWa = normalizeDigits(msg?.from || '');
        if (!fromWa) return null;

        const chatId = `${fromWa}@c.us`;
        const selfChatId = this.selfChatId;
        const contactPayload = contactsByWaId.get(fromWa) || {};
        const profileName = String(contactPayload?.profile?.name || '').trim();
        const contact = this.ensureContact(chatId, {
            name: profileName || `+${fromWa}`,
            pushname: profileName || `+${fromWa}`,
            profilePicUrl: null
        });

        this.ensureChat(chatId, contact);

        const type = String(msg?.type || 'text').toLowerCase();
        const base = {
            id: String(msg?.id || randomMessageId('cloud_in')),
            chatId,
            from: chatId,
            to: selfChatId,
            fromMe: false,
            timestamp: safeTimestamp(msg?.timestamp),
            ack: 0,
            type: 'chat',
            body: '',
            hasMedia: false,
            mediaId: null,
            mimetype: null,
            filename: null,
            fileSizeBytes: null,
            quotedMessageId: String(msg?.context?.id || msg?.context?.message_id || '').trim() || null,
            order: null,
            orderProducts: null,
            location: null,
            referral: null,
            rawReferral: null,
            rawData: null
        };

        const inboundReferral = this.extractInboundReferral(msg);
        if (inboundReferral) {
            base.referral = inboundReferral;
            base.rawReferral = msg?.referral || null;
            base.rawData = compactObject({
                ...(base.rawData || {}),
                referral: inboundReferral,
                rawReferral: msg?.referral || null
            });
        }

        if (type === 'reaction') {
            const reaction = msg?.reaction && typeof msg.reaction === 'object' ? msg.reaction : {};
            const emoji = String(reaction?.emoji || '').trim();
            const targetMessageId = String(reaction?.message_id || reaction?.messageId || '').trim();
            if (emoji && targetMessageId) {
                this.emit('message_reaction', {
                    chatId,
                    messageId: targetMessageId,
                    emoji,
                    senderId: chatId,
                    timestamp: safeTimestamp(msg?.timestamp)
                });
            }
            return null;
        } else if (type === 'text') {
            base.type = 'chat';
            base.body = String(msg?.text?.body || '').trim();
        } else if (type === 'image') {
            base.type = 'image';
            base.body = String(msg?.image?.caption || '').trim();
            base.hasMedia = true;
            base.mediaId = String(msg?.image?.id || '').trim() || null;
            base.mimetype = String(msg?.image?.mime_type || 'image/jpeg').trim();
            base.fileSizeBytes = Number.isFinite(Number(msg?.image?.file_size)) ? Number(msg.image.file_size) : null;
        } else if (type === 'document') {
            base.type = 'document';
            base.body = String(msg?.document?.caption || '').trim();
            base.hasMedia = true;
            base.mediaId = String(msg?.document?.id || '').trim() || null;
            base.mimetype = String(msg?.document?.mime_type || 'application/octet-stream').trim();
            base.filename = String(msg?.document?.filename || '').trim() || null;
            base.fileSizeBytes = Number.isFinite(Number(msg?.document?.file_size)) ? Number(msg.document.file_size) : null;
        } else if (type === 'video') {
            const videoMime = String(msg?.video?.mime_type || 'video/mp4').trim();
            const isGifVideo = String(videoMime || '').toLowerCase().includes('gif');
            base.type = isGifVideo ? 'image' : 'video';
            base.body = String(msg?.video?.caption || '').trim();
            base.hasMedia = true;
            base.mediaId = String(msg?.video?.id || '').trim() || null;
            base.mimetype = videoMime;
            base.fileSizeBytes = Number.isFinite(Number(msg?.video?.file_size)) ? Number(msg.video.file_size) : null;
        } else if (type === 'audio') {
            const isVoice = Boolean(msg?.audio?.voice);
            base.type = isVoice ? 'ptt' : 'audio';
            base.body = '';
            base.hasMedia = true;
            base.mediaId = String(msg?.audio?.id || '').trim() || null;
            base.mimetype = String(msg?.audio?.mime_type || 'audio/ogg').trim();
            base.fileSizeBytes = Number.isFinite(Number(msg?.audio?.file_size)) ? Number(msg.audio.file_size) : null;
        } else if (type === 'sticker') {
            base.type = 'sticker';
            base.body = '';
            base.hasMedia = true;
            base.mediaId = String(msg?.sticker?.id || '').trim() || null;
            base.mimetype = String(msg?.sticker?.mime_type || 'image/webp').trim();
            base.fileSizeBytes = Number.isFinite(Number(msg?.sticker?.file_size)) ? Number(msg.sticker.file_size) : null;
        } else if (type === 'location') {
            base.type = 'location';
            const lat = Number(msg?.location?.latitude);
            const lng = Number(msg?.location?.longitude);
            const label = String(msg?.location?.name || msg?.location?.address || '').trim();
            base.body = label || ((Number.isFinite(lat) && Number.isFinite(lng)) ? `${lat},${lng}` : 'Ubicacion');
            base.location = {
                latitude: Number.isFinite(lat) ? lat : null,
                longitude: Number.isFinite(lng) ? lng : null,
                label: label || null,
                text: String(msg?.location?.address || '').trim() || null,
                mapUrl: Number.isFinite(lat) && Number.isFinite(lng)
                    ? `https://www.google.com/maps?q=${lat},${lng}`
                    : null
            };
        } else if (type === 'order') {
            console.log('[ORDER RAW]', JSON.stringify(msg.order, null, 2));
            console.log('[ORDER ITEMS]', JSON.stringify(msg.order?.product_items, null, 2));
            const orderPayload = msg?.order && typeof msg.order === 'object' ? msg.order : {};
            const fallbackTitle = String(
                orderPayload?.order_title
                || orderPayload?.catalog_name
                || orderPayload?.text
                || msg?.order_title
                || msg?.orderTitle
                || ''
            ).trim();
            const rawItems = [
                ...(Array.isArray(orderPayload?.product_items) ? orderPayload.product_items : []),
                ...(Array.isArray(orderPayload?.products) ? orderPayload.products : []),
                ...(Array.isArray(msg?.product_items) ? msg.product_items : []),
                ...(Array.isArray(msg?.products) ? msg.products : [])
            ];
            const currency = String(
                orderPayload?.currency
                || orderPayload?.currency_code
                || msg?.currency
                || msg?.currency_code
                || 'PEN'
            ).trim() || 'PEN';

            let products = rawItems
                .map((item, idx) => buildOrderLineFromCloud(item, idx + 1, currency))
                .filter(Boolean);

            if (products.length === 0 && fallbackTitle) {
                products = fallbackTitle
                    .split(',')
                    .map((entry) => String(entry || '').trim())
                    .filter(Boolean)
                    .map((name, idx) => ({
                        name,
                        quantity: 1,
                        sku: null,
                        price: null,
                        lineTotal: null,
                        currency
                    }));
            }

            const itemCountRaw = orderPayload?.item_count ?? msg?.item_count ?? msg?.itemCount ?? products.length;
            const itemCount = parseQuantityLike(itemCountRaw, products.length || 1);
            const subtotalFrom1000 =
                parseMoneyLike(orderPayload?.total_amount_1000, { scaleHint: '1000' })
                ?? parseMoneyLike(orderPayload?.subtotal_amount_1000, { scaleHint: '1000' })
                ?? parseMoneyLike(orderPayload?.total_amount, { scaleHint: '1000' })
                ?? parseMoneyLike(msg?.total_amount_1000, { scaleHint: '1000' })
                ?? parseMoneyLike(msg?.totalAmount1000, { scaleHint: '1000' });
            const subtotal = subtotalFrom1000
                ?? parseMoneyLike(orderPayload?.subtotal)
                ?? parseMoneyLike(orderPayload?.total)
                ?? parseMoneyLike(msg?.subtotal)
                ?? parseMoneyLike(msg?.total);

            const orderId = String(orderPayload?.id || orderPayload?.order_id || msg?.order_id || msg?.orderId || '').trim() || null;
            const token = String(orderPayload?.token || msg?.token || '').trim() || null;
            const sellerJid = String(orderPayload?.seller_jid || orderPayload?.sellerJid || msg?.sellerJid || '').trim() || null;

            base.type = 'order';
            base.body = String(orderPayload?.text || fallbackTitle || 'Pedido de catalogo').trim();
            base.order = orderPayload;
            base.orderProducts = products;
            base.rawData = compactObject({
                type: 'order',
                orderId,
                token,
                itemCount: Math.max(1, Math.round(itemCount)),
                orderTitle: fallbackTitle || base.body,
                totalAmount1000: Number.isFinite(subtotalFrom1000) ? Math.round(subtotalFrom1000 * 1000) : null,
                totalCurrencyCode: currency,
                currency,
                subtotal,
                sellerJid
            });
        } else if (type === 'product' || msg?.product || msg?.product_id || msg?.productId || msg?.price_amount_1000 || msg?.priceAmount1000) {
            const productPayload = msg?.product && typeof msg.product === 'object' ? msg.product : {};
            const title = String(
                productPayload?.title
                || productPayload?.name
                || msg?.title
                || msg?.product_name
                || 'Producto compartido'
            ).trim();
            const sku = String(
                productPayload?.product_retailer_id
                || productPayload?.retailer_id
                || msg?.product_retailer_id
                || msg?.sku
                || ''
            ).trim() || null;
            const currency = String(
                productPayload?.currency
                || productPayload?.currency_code
                || msg?.currency
                || msg?.currency_code
                || 'PEN'
            ).trim() || 'PEN';
            const price =
                parseMoneyLike(productPayload?.price_amount_1000, { scaleHint: '1000' })
                ?? parseMoneyLike(msg?.price_amount_1000, { scaleHint: '1000' })
                ?? parseMoneyLike(msg?.priceAmount1000, { scaleHint: '1000' })
                ?? parseMoneyLike(productPayload?.price)
                ?? parseMoneyLike(msg?.price)
                ?? null;

            base.type = 'product';
            base.body = title || 'Producto compartido';
            base.order = compactObject({
                productId: productPayload?.id || msg?.product_id || msg?.productId || null,
                title,
                sku,
                currency,
                price
            });
            base.orderProducts = [{
                name: title || (sku ? `SKU ${sku}` : 'Producto compartido'),
                quantity: 1,
                sku,
                price,
                lineTotal: price,
                currency
            }];
            base.rawData = compactObject({
                type: 'product',
                title,
                description: String(productPayload?.description || msg?.description || '').trim() || null,
                productId: productPayload?.id || msg?.product_id || msg?.productId || null,
                sku,
                currencyCode: currency,
                priceAmount1000: Number.isFinite(price) ? Math.round(price * 1000) : null,
                url: String(productPayload?.url || msg?.url || '').trim() || null
            });
        } else {
            if (type === 'interactive') {
                const interactive = msg?.interactive && typeof msg.interactive === 'object' ? msg.interactive : null;
                const interactiveType = String(interactive?.type || '').trim().toLowerCase();
                const interactiveText = String(
                    interactive?.button_reply?.title
                    || interactive?.list_reply?.title
                    || interactive?.nfm_reply?.name
                    || interactive?.nfm_reply?.body
                    || ''
                ).trim();
                base.type = 'chat';
                base.body = interactiveText || String(msg?.text?.body || '').trim();
                if (interactiveType === 'button_reply' && base.quotedMessageId) {
                    base.quotedMessage = await this.buildButtonReplyQuotedMessage(base.quotedMessageId);
                }
                base.rawData = compactObject({
                    ...(base.rawData || {}),
                    interactive,
                    interactiveType: String(interactive?.type || '').trim() || null
                });
            } else {
                const fallbackBody = String(msg?.[type]?.caption || msg?.[type]?.text || msg?.text?.body || '').trim();
                base.type = type || 'chat';
                base.body = fallbackBody;
            }
        }

        return this.upsertMessage(base, { incoming: true, emitEvent: 'message' });
    }
    ingestStatus(status = {}) {
        const messageId = String(status?.id || '').trim();
        if (!messageId) return;

        const ack = ackFromCloudStatus(status?.status);
        const statusValue = String(status?.status || '').trim().toLowerCase() || null;
        const mappedChatId = this.outboundMessageToChat.get(messageId);
        const recipient = toWaId(status?.recipient_id || '');
        const chatId = mappedChatId || (recipient ? `${recipient}@c.us` : '');
        const errorsNormalized = this.normalizeStatusErrors(status?.errors);
        const conversation = compactObject({
            id: String(status?.conversation?.id || '').trim() || null,
            originType: String(status?.conversation?.origin?.type || '').trim().toLowerCase() || null,
            expirationTimestamp: status?.conversation?.expiration_timestamp
                ? safeTimestamp(status.conversation.expiration_timestamp)
                : null
        });
        const pricing = compactObject({
            billable: typeof status?.pricing?.billable === 'boolean' ? status.pricing.billable : null,
            pricingModel: String(status?.pricing?.pricing_model || '').trim().toLowerCase() || null,
            category: String(status?.pricing?.category || '').trim().toLowerCase() || null
        });

        const message = this.messageById.get(messageId) || null;
        if (message) {
            message.ack = ack;
            if (message._data) message._data.ack = ack;

            const existingChat = this.chats.get(chatId);
            if (existingChat && existingChat.lastMessage && String(existingChat.lastMessage?.id?._serialized || '') === messageId) {
                existingChat.lastMessage.ack = ack;
            }
        }

        const fallbackMessage = message || {
            id: { _serialized: messageId },
            fromMe: true,
            from: this.selfChatId,
            to: chatId || this.selfChatId,
            body: '',
            timestamp: safeTimestamp(status?.timestamp),
            ack,
            type: 'chat'
        };

        this.emit('message_ack', {
            message: fallbackMessage,
            ack,
            status: statusValue,
            recipientId: recipient || null,
            conversation,
            pricing,
            errors: errorsNormalized,
            hasErrors: errorsNormalized.length > 0
        });
    }

    async handleWebhookPayload(payload = {}) {
        const entries = Array.isArray(payload?.entry) ? payload.entry : [];
        if (entries.length === 0) return false;

        for (const entry of entries) {
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
                const templateEvent = this.normalizeTemplateWebhookEvent(change, entry);
                if (templateEvent) {
                    this.emit('template_webhook_event', templateEvent);
                }
                const value = change?.value || {};
                const contactsList = Array.isArray(value?.contacts) ? value.contacts : [];
                const contactsByWaId = new Map();
                contactsList.forEach((item) => {
                    const waId = normalizeDigits(item?.wa_id || '');
                    if (!waId) return;
                    contactsByWaId.set(waId, item);
                });

                const messages = Array.isArray(value?.messages) ? value.messages : [];
                for (const msg of messages) {
                    await this.ingestInboundMessage(msg, contactsByWaId);
                }

                const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
                for (const status of statuses) {
                    this.ingestStatus(status);
                }
            }
        }

        return true;
    }
}

module.exports = new WhatsAppCloudClient();


