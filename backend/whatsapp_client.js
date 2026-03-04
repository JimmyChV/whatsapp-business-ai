const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const EventEmitter = require('events');

class WhatsAppClient extends EventEmitter {
    constructor() {
        super();
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
        this.warnedNoBusinessProfileApi = false;
        this.setupEventListeners();
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
    }

    initialize() {
        console.log(`[${new Date().toISOString()}] Initializing WhatsApp Client (2.2412.54 forced fallback removed)...`);
        this.client.initialize();
    }

    async getChats() {
        if (!this.isReady) return [];
        return await this.client.getChats();
    }

    async getMessages(chatId, limit = 40) {
        if (!this.isReady) return [];
        const chat = await this.client.getChatById(chatId);
        return await chat.fetchMessages({ limit });
    }

    async sendMessage(to, body) {
        if (!this.isReady) throw new Error('Client not ready');
        return await this.client.sendMessage(to, body);
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
            if (!this.warnedNoBusinessProfileApi) {
                console.warn('[BusinessProfile] getBusinessProfile() is not available in this whatsapp-web.js version; using null fallback.');
                this.warnedNoBusinessProfileApi = true;
            }
            return null;
        }

        try {
            return await this.client.getBusinessProfile(contactId);
        } catch (e) {
            console.warn('[BusinessProfile] Error fetching business profile:', e?.message || e);
            return null;
        }
    }

    async getCatalog(contactId) {
        if (!this.isReady) return [];

        const attempts = [];
        const pushAttempt = (label, fn) => attempts.push({ label, fn });

        // 1) Preferred path for current whatsapp-web.js: Contact.getProducts()
        pushAttempt('contact.getProducts(contactId)', async () => {
            if (!contactId) throw new Error('Missing contactId');
            const contact = await this.client.getContactById(contactId);
            if (!contact?.getProducts) throw new Error('contact.getProducts not available');
            return await contact.getProducts();
        });

        // 2) Try my own contact as fallback
        pushAttempt('contact.getProducts(me)', async () => {
            const meId = this.client?.info?.wid?._serialized;
            if (!meId) throw new Error('Missing own contact id');
            const me = await this.client.getContactById(meId);
            if (!me?.getProducts) throw new Error('me.getProducts not available');
            return await me.getProducts();
        });

        // 3) Legacy path (older snippets use client.getProducts)
        pushAttempt('client.getProducts(contactId)', async () => {
            if (typeof this.client.getProducts !== 'function') {
                throw new Error('client.getProducts is not available in this version');
            }
            return await this.client.getProducts(contactId);
        });

        for (const attempt of attempts) {
            try {
                const products = await attempt.fn();
                if (Array.isArray(products) && products.length > 0) {
                    console.log(`[Catalog] ${attempt.label} returned ${products.length} products`);
                    console.log('[Catalog] First product sample:', JSON.stringify(products[0]).substring(0, 250));
                    return products;
                }
                console.log(`[Catalog] ${attempt.label} returned 0 products`);
            } catch (e) {
                console.log(`[Catalog] ${attempt.label} failed: ${e.message}`);
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
