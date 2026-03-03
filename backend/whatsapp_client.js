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
        try {
            return await this.client.getBusinessProfile(contactId);
        } catch (e) {
            console.error('Error fetching business profile:', e);
            return null;
        }
    }

    async getCatalog(contactId) {
        if (!this.isReady) return [];
        try {
            // Try fetching own catalog first (no args or undefined)
            let products = [];
            try {
                products = await this.client.getProducts(undefined);
                console.log(`[Catalog] getProducts(undefined) returned ${products.length} products`);
            } catch (e1) {
                console.log('[Catalog] getProducts(undefined) failed:', e1.message);
                try {
                    products = await this.client.getProducts(contactId);
                    console.log(`[Catalog] getProducts(contactId) returned ${products.length} products`);
                } catch (e2) {
                    console.log('[Catalog] getProducts(contactId) failed:', e2.message);
                    // Last ditch effort: try getBusinessProfile if it has products? No, but let's try calling getProducts on a Contact
                    try {
                        const me = await this.client.getContactById(this.client.info.wid._serialized);
                        if (me.getProducts) {
                            products = await me.getProducts();
                            console.log(`[Catalog] contact.getProducts() returned ${products.length} products`);
                        }
                    } catch (e3) { }
                }
            }
            if (products.length > 0) {
                console.log('[Catalog] First product sample:', JSON.stringify(products[0]).substring(0, 200));
            }
            return products;
        } catch (e) {
            console.error('Error fetching catalog:', e);
            return [];
        }
    }

    async downloadMedia(message) {
        if (message.hasMedia) {
            return await message.downloadMedia();
        }
        return null;
    }
}

module.exports = new WhatsAppClient();
