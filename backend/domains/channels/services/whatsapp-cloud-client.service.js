const EventEmitter = require('events');
const crypto = require('crypto');

function normalizeDigits(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function defaultCountryCode() {
    return normalizeDigits(process.env.WA_DEFAULT_COUNTRY_CODE || process.env.DEFAULT_COUNTRY_CODE || '51');
}

function withDefaultCountryCode(value = '') {
    const digits = normalizeDigits(value);
    if (!digits) return '';
    const cc = defaultCountryCode();
    const trimmed = digits.replace(/^0+/, '') || digits;
    if (trimmed.length <= 10 && cc && !trimmed.startsWith(cc)) {
        return cc + trimmed;
    }
    return trimmed;
}

function toChatId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw;
    const digits = normalizeDigits(raw);
    return digits ? `${digits}@c.us` : '';
}

function toWaId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@lid')) return '';
    const base = raw.includes('@') ? normalizeDigits(raw.split('@')[0] || '') : normalizeDigits(raw);
    return withDefaultCountryCode(base);
}

function safeTimestamp(value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    return Math.floor(Date.now() / 1000);
}

function randomMessageId(prefix = 'cloud') {
    try {
        return `${prefix}_${crypto.randomUUID()}`;
    } catch (e) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

function ackFromCloudStatus(status = '') {
    const value = String(status || '').toLowerCase();
    if (value === 'read') return 3;
    if (value === 'delivered') return 2;
    if (value === 'sent') return 1;
    if (value === 'failed') return -1;
    return 0;
}

function parseMoneyLike(value, { scaleHint = '' } = {}) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        if (String(scaleHint || '').toLowerCase().includes('1000')) {
            return Math.round((value / 1000) * 100) / 100;
        }
        if (String(scaleHint || '').toLowerCase().includes('cent') || String(scaleHint || '').toLowerCase().includes('minor')) {
            return Math.round((value / 100) * 100) / 100;
        }
        return Math.round(value * 100) / 100;
    }

    const text = String(value || '').trim();
    if (!text) return null;

    let normalized = text.replace(/[^\d.,-]/g, '');
    if (!normalized || normalized === '-' || normalized === '.' || normalized === ',') return null;

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    if (hasComma && hasDot) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
    } else if (hasComma) {
        const commaCount = (normalized.match(/,/g) || []).length;
        normalized = commaCount > 1 ? normalized.replace(/,/g, '') : normalized.replace(',', '.');
    }

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) return null;

    const hint = String(scaleHint || '').toLowerCase();
    if (hint.includes('1000')) return Math.round((parsed / 1000) * 100) / 100;
    if (hint.includes('cent') || hint.includes('minor')) return Math.round((parsed / 100) * 100) / 100;

    // Heuristic fallback for Cloud payloads that sometimes deliver x1000 values without explicit suffix.
    if (!hint && Math.abs(parsed) >= 100000) {
        return Math.round((parsed / 1000) * 100) / 100;
    }

    return Math.round(parsed * 100) / 100;
}

function parseQuantityLike(value, fallback = 1) {
    const parsed = parseMoneyLike(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.max(1, Math.round(parsed * 1000) / 1000);
}

function buildOrderLineFromCloud(item = {}, idx = 1, fallbackCurrency = 'PEN') {
    if (!item || typeof item !== 'object') return null;

    const sku = String(item?.product_retailer_id || item?.retailer_id || item?.sku || '').trim() || null;
    const name = String(item?.name || item?.title || item?.product_name || sku || `Producto ${idx}`).trim();
    const quantity = parseQuantityLike(item?.quantity ?? item?.qty ?? 1, 1);

    const unitPrice =
        parseMoneyLike(item?.item_price_amount_1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.itemPriceAmount1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.price_amount_1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.item_price)
        ?? parseMoneyLike(item?.unit_price)
        ?? parseMoneyLike(item?.price);

    const lineTotal =
        parseMoneyLike(item?.line_total_amount_1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.total_amount_1000, { scaleHint: '1000' })
        ?? parseMoneyLike(item?.line_total)
        ?? parseMoneyLike(item?.total)
        ?? (Number.isFinite(unitPrice) ? Math.round((unitPrice * quantity) * 100) / 100 : null);

    return {
        name,
        quantity,
        sku,
        price: Number.isFinite(unitPrice) ? unitPrice : null,
        lineTotal: Number.isFinite(lineTotal) ? lineTotal : null,
        currency: String(item?.currency || fallbackCurrency || 'PEN').trim() || 'PEN'
    };
}

function compactObject(input = {}) {
    const out = {};
    Object.entries(input || {}).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        out[key] = value;
    });
    return out;
}

function normalizeRuntimeCloudConfig(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const normalized = {
        appId: String(source.appId || source.app_id || '').trim() || null,
        appSecret: String(source.appSecret || source.app_secret || '').trim() || null,
        systemUserToken: String(source.systemUserToken || source.system_user_token || '').trim() || null,
        wabaId: String(source.wabaId || source.waba_id || '').trim() || null,
        phoneNumberId: String(source.phoneNumberId || source.phone_number_id || '').trim() || null,
        verifyToken: String(source.verifyToken || source.verify_token || '').trim() || null,
        graphVersion: String(source.graphVersion || source.graph_version || '').trim() || null,
        displayPhoneNumber: String(source.displayPhoneNumber || source.display_phone_number || '').trim() || null,
        businessName: String(source.businessName || source.business_name || '').trim() || null
    };

    return compactObject(normalized);
}

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
        const timestamp = safeTimestamp(existing?.timestamp);
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
            hasQuotedMsg: Boolean(raw.quotedMessageId),
            getQuotedMessage: async () => {
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

    async sendMedia(to, mediaData, mimetype, filename, caption, isPtt = false, quotedMessageId = null) {
        if (!this.isReady) throw new Error('Cloud client not ready');
        if (isPtt) throw new Error('PTT is not supported in cloud transport');

        const waId = await this.resolveSendWaId(to);

        const mediaId = await this.uploadMedia(mediaData, mimetype, filename || 'adjunto');
        if (!mediaId) throw new Error('Media upload failed');

        const mime = String(mimetype || '').toLowerCase();
        let type = 'document';
        if (mime.startsWith('image/')) type = 'image';
        else if (mime.startsWith('video/')) type = 'video';
        else if (mime.startsWith('audio/')) type = 'audio';

        const mediaPayload = { id: mediaId };
        if (type === 'document') {
            mediaPayload.filename = String(filename || 'documento').trim() || 'documento';
        }
        if ((type === 'image' || type === 'video' || type === 'document') && String(caption || '').trim()) {
            mediaPayload.caption = String(caption || '');
        }

        const payload = {
            messaging_product: 'whatsapp',
            to: waId,
            type,
            [type]: mediaPayload
        };

        const quoted = String(quotedMessageId || '').trim();
        if (quoted) payload.context = { message_id: quoted };

        const response = await this.graphJson(`/${this.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

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

    ingestInboundMessage(msg = {}, contactsByWaId = new Map()) {
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
            quotedMessageId: String(msg?.context?.id || '').trim() || null,
            order: null,
            orderProducts: null,
            location: null,
            rawData: null
        };

        if (type === 'text') {
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
            base.type = 'video';
            base.body = String(msg?.video?.caption || '').trim();
            base.hasMedia = true;
            base.mediaId = String(msg?.video?.id || '').trim() || null;
            base.mimetype = String(msg?.video?.mime_type || 'video/mp4').trim();
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
                const interactiveText = String(
                    msg?.interactive?.button_reply?.title
                    || msg?.interactive?.list_reply?.title
                    || msg?.interactive?.nfm_reply?.name
                    || msg?.interactive?.nfm_reply?.body
                    || ''
                ).trim();
                base.type = 'chat';
                base.body = interactiveText || String(msg?.text?.body || '').trim();
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
        const mappedChatId = this.outboundMessageToChat.get(messageId);
        const recipient = toWaId(status?.recipient_id || '');
        const chatId = mappedChatId || (recipient ? `${recipient}@c.us` : '');

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
            ack
        });
    }

    async handleWebhookPayload(payload = {}) {
        const entries = Array.isArray(payload?.entry) ? payload.entry : [];
        if (entries.length === 0) return false;

        for (const entry of entries) {
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
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
                    this.ingestInboundMessage(msg, contactsByWaId);
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
