const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const EventEmitter = require('events');

const TRANSIENT_PROTOCOL_PATTERNS = [
    'Promise was collected',
    'Execution context was destroyed',
    'Cannot find context with specified id',
    'Target closed',
    'Session closed',
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const isTransientProtocolError = (error) => {
    const message = String(error?.message || error || '');
    if (!message) return false;
    return TRANSIENT_PROTOCOL_PATTERNS.some((pattern) => message.includes(pattern));
};

class WhatsAppClient extends EventEmitter {
    constructor() {
        super();
        this.capabilityWarnings = new Set();
        this.client = new Client({
            authStrategy: new LocalAuth(),
            authTimeoutMs: 120000,
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-extensions',
                    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                ]
            }
        });
        this.isReady = false;
        this.setupEventListeners();
    }

    warnCapabilityOnce(key, message) {
        if (this.capabilityWarnings.has(key)) return;
        this.capabilityWarnings.add(key);
        console.warn(message);
    }

    setupEventListeners() {
        this.client.on('qr', (qr) => {
            console.log(`[${new Date().toISOString()}] New QR Received`);
            qrcode.generate(qr, { small: true });
            this.lastQr = qr;
            this.emit('qr', qr);
        });

        this.client.on('ready', () => {
            console.log(`[${new Date().toISOString()}] WhatsApp Client is ready!`);
            this.isReady = true;
            this.lastQr = null;
            this.emit('ready');
        });

        this.client.on('authenticated', () => {
            console.log(`[${new Date().toISOString()}] WhatsApp Client authenticated!`);
            this.emit('authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            console.error(`[${new Date().toISOString()}] Auth failure:`, msg);
            this.emit('auth_failure', msg);
        });

        this.client.on('disconnected', (reason) => {
            console.error(`[${new Date().toISOString()}] Disconnected:`, reason);
            this.isReady = false;
            this.emit('disconnected', reason);
        });

        this.client.on('loading_screen', (percent, message) => {
            console.log(`[${new Date().toISOString()}] Loading: ${percent}% - ${message}`);
            this.emit('loading', { percent, message });
        });

        this.client.on('message', async (message) => {
            this.emit('message', message);
        });

        this.client.on('message_create', async (message) => {
            if (message.fromMe) {
                this.emit('message_sent', message);
            }
        });

        this.client.on('message_ack', (message, ack) => {
            this.emit('message_ack', { message, ack });
        });

        this.client.on('message_edit', (message, newBody, prevBody) => {
            this.emit('message_edit', { message, newBody, prevBody });
        });
    }

    initialize() {
        console.log(`[${new Date().toISOString()}] Initializing WhatsApp Client (2.2412.54 forced fallback removed)...`);
        this.client.initialize();
    }

    async getChats() {
        if (!this.isReady) return [];
        const maxAttempts = Math.max(1, Number(process.env.WA_GET_CHATS_RETRIES || 3));
        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                return await this.client.getChats();
            } catch (error) {
                lastError = error;
                const shouldRetry = isTransientProtocolError(error) && attempt < maxAttempts;
                if (!shouldRetry) throw error;
                const waitMs = Math.min(1800, 250 * attempt);
                console.warn(`[WA] getChats transient failure (${attempt}/${maxAttempts}): ${String(error?.message || error)}. Retrying in ${waitMs}ms...`);
                await wait(waitMs);
            }
        }

        throw lastError;
    }
    async getMessages(chatId, limit = 40) {
        if (!this.isReady) return [];
        const chat = await this.client.getChatById(chatId);
        return await chat.fetchMessages({ limit });
    }

    getCapabilities() {
        const quickRepliesNative = Boolean(
            typeof this.client?.getQuickReplies === 'function'
            || typeof this.client?.listQuickReplies === 'function'
            || typeof this.client?.getQuickReplyTemplates === 'function'
        );

        return {
            messageEdit: true,
            messageEditSync: true,
            quickReplies: quickRepliesNative,
            quickRepliesRead: quickRepliesNative,
            quickRepliesWrite: quickRepliesNative
        };
    }

    async sendMessage(to, body) {
        if (!this.isReady) throw new Error('Client not ready');
        return await this.client.sendMessage(to, body);
    }

    async getMessagesEditability(messageIds = []) {
        const ids = Array.isArray(messageIds)
            ? messageIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        const fallback = {};
        ids.forEach((id) => { fallback[id] = false; });

        if (!ids.length) return fallback;
        if (!this.isReady || typeof this.client?.pupPage?.evaluate !== 'function') return fallback;

        try {
            const result = await this.client.pupPage.evaluate(async (idList) => {
                const output = {};
                for (const messageId of idList) {
                    try {
                        const store = window.Store || {};
                        const msgStore = store.Msg;
                        const checks = store.MsgActionChecks;
                        if (!msgStore || !checks) {
                            output[messageId] = false;
                            continue;
                        }
                        const msg = msgStore.get(messageId)
                            || (await msgStore.getMessagesById([messageId]))?.messages?.[0];
                        if (!msg) {
                            output[messageId] = false;
                            continue;
                        }
                        const canEditText = typeof checks.canEditText === 'function' && checks.canEditText(msg);
                        const canEditCaption = typeof checks.canEditCaption === 'function' && checks.canEditCaption(msg);
                        output[messageId] = Boolean(canEditText || canEditCaption);
                    } catch (e) {
                        output[messageId] = false;
                    }
                }
                return output;
            }, ids);

            if (!result || typeof result !== 'object') return fallback;
            const normalized = { ...fallback };
            ids.forEach((id) => {
                normalized[id] = result[id] === true;
            });
            return normalized;
        } catch (e) {
            this.warnCapabilityOnce(
                'message_editability_eval_failed',
                '[WA] No se pudo evaluar canEdit por mensaje; se usara fallback sin edicion visible.'
            );
            return fallback;
        }
    }

    async canEditMessageById(messageId) {
        const cleanId = String(messageId || '').trim();
        if (!cleanId) return false;
        const map = await this.getMessagesEditability([cleanId]);
        return map[cleanId] === true;
    }

    async sendMedia(to, mediaData, mimetype, filename, caption, isPtt = false) {
        if (!this.isReady) throw new Error('Client not ready');
        const media = new MessageMedia(mimetype, mediaData, filename || 'adjunto');
        return await this.client.sendMessage(to, media, {
            caption,
            sendAudioAsVoice: isPtt
        });
    }

    async markAsRead(chatId) {
        if (!this.isReady) return;
        const chat = await this.client.getChatById(chatId);
        return await chat.sendSeen();
    }

    async getLabels() {
        if (!this.isReady) return [];
        return await this.client.getLabels();
    }

    async getChatLabels(chatId) {
        if (!this.isReady) return [];
        return await this.client.getChatLabels(chatId);
    }

    async getBusinessProfile(contactId) {
        if (!this.isReady) return null;
        if (typeof this.client.getBusinessProfile !== 'function') {
            return null;
        }
        try {
            return await this.client.getBusinessProfile(contactId);
        } catch (e) {
            const msg = String(e?.message || e || '');
            if (/not a function|not available|unsupported/i.test(msg)) {
                return null;
            }
            return null;
        }
    }

    async getCatalog(contactId) {
        if (!this.isReady) return [];

        const attempts = [];
        const pushAttempt = (label, fn) => attempts.push({ label, fn });

        pushAttempt('contact.getProducts(contactId)', async () => {
            if (!contactId) return [];
            const contact = await this.client.getContactById(contactId);
            if (!contact || typeof contact.getProducts !== 'function') return [];
            const products = await contact.getProducts();
            return Array.isArray(products) ? products : [];
        });

        pushAttempt('contact.getProducts(me)', async () => {
            const meId = this.client?.info?.wid?._serialized;
            if (!meId) return [];
            const me = await this.client.getContactById(meId);
            if (!me || typeof me.getProducts !== 'function') return [];
            const products = await me.getProducts();
            return Array.isArray(products) ? products : [];
        });

        if (typeof this.client.getProducts === 'function') {
            pushAttempt('client.getProducts(contactId)', async () => {
                const products = await this.client.getProducts(contactId);
                return Array.isArray(products) ? products : [];
            });
        }

        for (const attempt of attempts) {
            try {
                const products = await attempt.fn();
                if (products.length > 0) {
                    console.log(`[Catalog] ${attempt.label} returned ${products.length} products`);
                    return products;
                }
            } catch (e) {
                const message = String(e?.message || e || '');
                if (/not available|not a function|missing/i.test(message)) continue;
                console.log(`[Catalog] ${attempt.label} failed: ${message}`);
            }
        }

        return [];
    }

    async downloadMedia(message) {
        if (message.hasMedia) {
            return await message.downloadMedia();
        }
        return null;
    }
}

module.exports = new WhatsAppClient();

