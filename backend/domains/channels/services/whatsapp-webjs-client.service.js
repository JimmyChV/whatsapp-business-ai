const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const TRANSIENT_PROTOCOL_PATTERNS = [
    'Promise was collected',
    'Execution context was destroyed',
    'Cannot find context with specified id',
    'Target closed',
    'Session closed',
];

const BROWSER_LOCK_PATTERNS = [
    'browser is already running for',
    'Failed to launch the browser process',
    'SingletonLock'
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const isTransientProtocolError = (error) => {
    const message = String(error?.message || error || '');
    if (!message) return false;
    return TRANSIENT_PROTOCOL_PATTERNS.some((pattern) => message.includes(pattern));
};

const isBrowserLockError = (error) => {
    const message = String(error?.message || error || '').toLowerCase();
    if (!message) return false;
    return BROWSER_LOCK_PATTERNS.some((pattern) => message.includes(String(pattern || '').toLowerCase()));
};

const normalizeSessionNamespace = (value = 'default') => {
    const cleaned = String(value || 'default')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);
    return cleaned || 'default';
};

class WhatsAppClient extends EventEmitter {
    constructor() {
        super();
        this.capabilityWarnings = new Set();
        this.authDataPath = path.resolve(process.cwd(), 'wwebjs_auth');
        this.sessionNamespace = normalizeSessionNamespace(process.env.WA_WEBJS_SESSION_NAMESPACE || 'default');
        this.clientConfig = this.buildClientConfig(this.sessionNamespace);
        this.client = null;
        this.isReady = false;
        this.initializePromise = null;
        this.lastQr = null;
        this.createClient();
    }
    buildClientConfig(namespace = this.sessionNamespace) {
        const cleanNamespace = normalizeSessionNamespace(namespace);
        return {
            authStrategy: new LocalAuth({ dataPath: this.authDataPath, clientId: cleanNamespace }),
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
        };
    }

    async setSessionNamespace(namespace = 'default') {
        const cleanNamespace = normalizeSessionNamespace(namespace);
        if (cleanNamespace === this.sessionNamespace) return false;

        await this.shutdown({ recreate: false, emitDisconnected: false, reason: 'session_namespace_switch' });
        this.sessionNamespace = cleanNamespace;
        this.clientConfig = this.buildClientConfig(cleanNamespace);
        this.createClient();
        return true;
    }

    createClient() {
        if (this.client && typeof this.client.removeAllListeners === 'function') {
            try { this.client.removeAllListeners(); } catch (_) { }
        }
        this.client = new Client(this.clientConfig);
        this.setupEventListeners(this.client);
    }

    cleanupChromiumSingletonLocks() {
        const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
        let sessionDirs = [];

        try {
            const entries = fs.readdirSync(this.authDataPath, { withFileTypes: true });
            sessionDirs = entries
                .filter((entry) => entry.isDirectory() && String(entry.name || '').startsWith('session'))
                .map((entry) => path.resolve(this.authDataPath, entry.name));
        } catch (_) {
            sessionDirs = [path.resolve(this.authDataPath, 'session')];
        }

        sessionDirs.forEach((sessionDir) => {
            lockFiles.forEach((fileName) => {
                try {
                    const filePath = path.resolve(sessionDir, fileName);
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                } catch (_) { }
            });
        });
    }

    warnCapabilityOnce(key, message) {
        if (this.capabilityWarnings.has(key)) return;
        this.capabilityWarnings.add(key);
        console.warn(message);
    }

    setupEventListeners(client = this.client) {
        if (!client || typeof client.on !== 'function') return;
        client.on('qr', (qr) => {
            console.log(`[${new Date().toISOString()}] New QR Received`);
            qrcode.generate(qr, { small: true });
            this.lastQr = qr;
            this.emit('qr', qr);
        });

        client.on('ready', () => {
            console.log(`[${new Date().toISOString()}] WhatsApp Client is ready!`);
            this.isReady = true;
            this.lastQr = null;
            this.emit('ready');
        });

        client.on('authenticated', () => {
            console.log(`[${new Date().toISOString()}] WhatsApp Client authenticated!`);
            this.emit('authenticated');
        });

        client.on('auth_failure', (msg) => {
            console.error(`[${new Date().toISOString()}] Auth failure:`, msg);
            this.emit('auth_failure', msg);
        });

        client.on('disconnected', (reason) => {
            console.error(`[${new Date().toISOString()}] Disconnected:`, reason);
            this.isReady = false;
            this.emit('disconnected', reason);
        });

        client.on('loading_screen', (percent, message) => {
            console.log(`[${new Date().toISOString()}] Loading: ${percent}% - ${message}`);
            this.emit('loading', { percent, message });
        });

        client.on('message', async (message) => {
            this.emit('message', message);
        });

        client.on('message_create', async (message) => {
            if (message.fromMe) {
                this.emit('message_sent', message);
            }
        });

        client.on('message_ack', (message, ack) => {
            this.emit('message_ack', { message, ack });
        });

        client.on('message_edit', (message, newBody, prevBody) => {
            this.emit('message_edit', { message, newBody, prevBody });
        });
    }

    async initialize() {
        if (this.initializePromise) return this.initializePromise;

        const maxAttempts = Math.max(1, Number(process.env.WA_INIT_RETRIES || 5));
        const baseWaitMs = Math.max(250, Number(process.env.WA_INIT_RETRY_BASE_MS || 1200));

        this.initializePromise = (async () => {
            console.log(`[${new Date().toISOString()}] Initializing WhatsApp Client (2.2412.54 forced fallback removed)...`);

            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                try {
                    await this.client.initialize();
                    return true;
                } catch (error) {
                    const message = String(error?.message || error || 'unknown error');
                    const transient = isTransientProtocolError(error);
                    const lockError = isBrowserLockError(error);
                    const canRetry = (transient || lockError) && attempt < maxAttempts;

                    if (!canRetry) {
                        console.error(`[WA] initialize failed (${attempt}/${maxAttempts}): ${message}`);
                        throw error;
                    }

                    if (lockError) {
                        console.warn(`[WA] browser lock detected (${attempt}/${maxAttempts}): ${message}. Cleaning lock and recreating client...`);
                        await this.shutdown({ recreate: true, emitDisconnected: false, reason: 'lock_recovery' });
                        this.cleanupChromiumSingletonLocks();
                    }

                    const waitMs = Math.min(10000, baseWaitMs * attempt);
                    console.warn(`[WA] initialize retry (${attempt}/${maxAttempts}) in ${waitMs}ms...`);
                    await wait(waitMs);
                }
            }

            return false;
        })();

        try {
            return await this.initializePromise;
        } finally {
            this.initializePromise = null;
        }
    }

    async shutdown({ recreate = true, emitDisconnected = true, reason = 'shutdown' } = {}) {
        this.isReady = false;
        this.lastQr = null;
        this.initializePromise = null;

        const currentClient = this.client;
        if (currentClient) {
            try {
                await Promise.race([
                    currentClient.destroy(),
                    wait(Number(process.env.WA_DESTROY_TIMEOUT_MS || 6000))
                ]);
            } catch (_) { }

            try {
                const browser = currentClient?.pupBrowser;
                if (browser && typeof browser.isConnected === 'function' && browser.isConnected()) {
                    await browser.close();
                }
            } catch (_) { }
        }

        this.cleanupChromiumSingletonLocks();

        if (recreate) {
            this.createClient();
        }

        if (emitDisconnected) {
            this.emit('disconnected', reason);
        }

        return true;
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
            messageForward: true,
            messageDelete: true,
            messageReply: true,
            quickReplies: quickRepliesNative,
            quickRepliesRead: quickRepliesNative,
            quickRepliesWrite: quickRepliesNative
        };
    }

    async sendMessage(to, body, options = {}) {
        if (!this.isReady) throw new Error('Client not ready');
        return await this.client.sendMessage(to, body, options);
    }

    async getMessageById(messageId) {
        if (!this.isReady) return null;
        const cleanId = String(messageId || '').trim();
        if (!cleanId) return null;

        if (typeof this.client?.getMessageById === 'function') {
            try {
                return await this.client.getMessageById(cleanId);
            } catch (e) {
            }
        }

        if (!this.client?.pupPage?.evaluate) return null;

        try {
            const raw = await this.client.pupPage.evaluate(async (targetId) => {
                try {
                    const store = window.Store || {};
                    const msgStore = store.Msg;
                    if (!msgStore) return null;
                    const existing = msgStore.get(targetId);
                    if (existing && typeof existing.serialize === 'function') return existing.serialize();
                    const loaded = await msgStore.getMessagesById([targetId]);
                    const msg = loaded?.messages?.[0];
                    if (!msg) return null;
                    return typeof msg.serialize === 'function' ? msg.serialize() : null;
                } catch (e) {
                    return null;
                }
            }, cleanId);
            return raw || null;
        } catch (e) {
            return null;
        }
    }

    async replyToMessage(chatId, quotedMessageId, body) {
        if (!this.isReady) throw new Error('Client not ready');
        const targetChatId = String(chatId || '').trim();
        const targetQuotedId = String(quotedMessageId || '').trim();
        const nextBody = String(body || '');
        if (!targetChatId || !targetQuotedId) throw new Error('reply parameters missing');

        const quoted = await this.getMessageById(targetQuotedId);
        if (quoted && typeof quoted.reply === 'function') {
            return await quoted.reply(nextBody, targetChatId);
        }
        return await this.client.sendMessage(targetChatId, nextBody, { quotedMessageId: targetQuotedId });
    }

    async forwardMessage(messageId, toChatId) {
        if (!this.isReady) throw new Error('Client not ready');
        const sourceMessageId = String(messageId || '').trim();
        const targetChatId = String(toChatId || '').trim();
        if (!sourceMessageId || !targetChatId) throw new Error('forward parameters missing');

        const sourceMessage = await this.getMessageById(sourceMessageId);
        if (!sourceMessage) throw new Error('source message not found');

        if (typeof sourceMessage.forward === 'function') {
            return await sourceMessage.forward(targetChatId);
        }

        const targetChat = await this.client.getChatById(targetChatId);
        if (targetChat && typeof targetChat.forwardMessages === 'function') {
            return await targetChat.forwardMessages([sourceMessage]);
        }

        throw new Error('forward is not supported in this WhatsApp Web version');
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

    async sendMedia(to, mediaData, mimetype, filename, caption, isPtt = false, quotedMessageId = null) {
        if (!this.isReady) throw new Error('Client not ready');
        const media = new MessageMedia(mimetype, mediaData, filename || 'adjunto');
        const quoted = String(quotedMessageId || '').trim();
        return await this.client.sendMessage(to, media, {
            caption,
            sendAudioAsVoice: isPtt,
            ...(quoted ? { quotedMessageId: quoted } : {})
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
                    return products;
                }
            } catch (e) {
                const message = String(e?.message || e || '');
                if (/not available|not a function|missing/i.test(message)) continue;
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


