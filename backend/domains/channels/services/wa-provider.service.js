const EventEmitter = require('events');
const cloudClient = require('./whatsapp-cloud-client.service');

const ACTIVE_TRANSPORTS = new Set(['cloud']);
const TRANSPORTS = new Set(['cloud', 'idle']);
const DUAL_MODE_ALIASES = new Set(['dual', 'both', 'selection', 'select', 'idle']);
const CLOUD_WEBHOOK_AUTO_ACTIVATE = String(process.env.WA_CLOUD_WEBHOOK_AUTO_ACTIVATE || 'true').trim().toLowerCase() !== 'false';

function normalizeMode(value = '') {
    const mode = String(value || '').trim().toLowerCase();
    if (!mode) return '';
    if (mode === 'webjs') return 'cloud';
    if (DUAL_MODE_ALIASES.has(mode)) return 'idle';
    if (mode === 'cloud' || mode === 'idle') return mode;
    return '';
}

class WAProvider extends EventEmitter {
    constructor() {
        super();
        this.adapters = {
            cloud: cloudClient
        };

        this.requestedTransport = normalizeMode(process.env.WA_TRANSPORT || 'dual') || 'idle';
        this.activeTransport = 'idle';
        this.activeAdapter = null;
        this.boundEvents = [];
        this.client = null;
        this.transportSwitchPromise = Promise.resolve();

        if (ACTIVE_TRANSPORTS.has(this.requestedTransport)) {
            if (this.requestedTransport === 'cloud' && !cloudClient.isConfigured()) {
                console.warn('[WA][Provider] WA_TRANSPORT=cloud requested but cloud variables are incomplete. Waiting for transport selection.');
            } else {
                this.useTransport(this.requestedTransport);
            }
        }
    }

    bindAdapterEvents(adapter) {
        this.unbindAdapterEvents();
        if (!adapter || typeof adapter.on !== 'function') return;

        const events = ['qr', 'ready', 'authenticated', 'auth_failure', 'disconnected', 'message', 'message_sent', 'message_ack', 'message_edit', 'message_reaction'];
        events.forEach((eventName) => {
            const handler = (...args) => this.emit(eventName, ...args);
            adapter.on(eventName, handler);
            this.boundEvents.push({ adapter, eventName, handler });
        });
    }

    unbindAdapterEvents() {
        this.boundEvents.forEach(({ adapter, eventName, handler }) => {
            try {
                if (adapter && typeof adapter.off === 'function') {
                    adapter.off(eventName, handler);
                } else if (adapter && typeof adapter.removeListener === 'function') {
                    adapter.removeListener(eventName, handler);
                }
            } catch (e) { }
        });
        this.boundEvents = [];
    }

    useTransport(mode) {
        const safeMode = normalizeMode(mode);
        if (!ACTIVE_TRANSPORTS.has(safeMode)) {
            throw new Error(`Unsupported transport mode: ${mode}`);
        }

        const adapter = this.adapters[safeMode];
        if (!adapter) throw new Error(`Adapter not found for transport: ${safeMode}`);

        this.activeTransport = safeMode;
        this.activeAdapter = adapter;
        this.client = adapter.client;
        this.bindAdapterEvents(adapter);
        return adapter;
    }

    deactivateTransport() {
        this.unbindAdapterEvents();
        this.activeTransport = 'idle';
        this.activeAdapter = null;
        this.client = null;
    }

    async stopAdapter(adapter, reason = 'transport_switch') {
        if (!adapter) return;

        if (typeof adapter.shutdown === 'function') {
            try {
                await adapter.shutdown({ recreate: true, emitDisconnected: false, reason });
                return;
            } catch (error) {
                console.warn('[WA][Provider] adapter shutdown warning:', String(error?.message || error));
            }
        }

        try {
            if (adapter?.client && typeof adapter.client.logout === 'function') {
                await adapter.client.logout();
            }
        } catch (_) { }

        try {
            if (adapter?.client && typeof adapter.client.destroy === 'function') {
                await adapter.client.destroy();
            }
        } catch (_) { }

        if (Object.prototype.hasOwnProperty.call(adapter || {}, 'isReady')) {
            adapter.isReady = false;
        }
    }

    async setTransportMode(mode) {
        const execute = async () => {
            const safeMode = normalizeMode(mode);
            if (!TRANSPORTS.has(safeMode)) {
                throw new Error('Modo de transporte invalido. Usa cloud.');
            }

            if (safeMode === 'cloud' && !cloudClient.isConfigured()) {
                throw new Error('Cloud API no configurada. Completa META_* en backend/.env.');
            }

            this.requestedTransport = safeMode;

            if (safeMode === 'idle') {
                await this.stopAdapter(this.activeAdapter, 'transport_idle');
                this.deactivateTransport();
                return this.getRuntimeInfo();
            }

            if (this.activeTransport !== safeMode) {
                await this.stopAdapter(this.activeAdapter, 'transport_switch');
                this.useTransport(safeMode);
            }

            if (this.activeAdapter?.isReady !== true) {
                await this.initialize();
            }

            return this.getRuntimeInfo();
        };

        this.transportSwitchPromise = this.transportSwitchPromise.then(execute, execute);
        return this.transportSwitchPromise;
    }
    setCloudRuntimeConfig(config = {}) {
        if (typeof cloudClient.setRuntimeConfig !== 'function') return {};
        return cloudClient.setRuntimeConfig(config || {});
    }

    clearCloudRuntimeConfig() {
        if (typeof cloudClient.clearRuntimeConfig !== 'function') return {};
        return cloudClient.clearRuntimeConfig();
    }

    getCloudRuntimeConfigPublic() {
        if (typeof cloudClient.getRuntimeConfigPublic !== 'function') return {};
        return cloudClient.getRuntimeConfigPublic();
    }
    async initialize() {
        if (!this.activeAdapter || this.activeTransport === 'idle') return false;
        if (typeof this.activeAdapter.initialize !== 'function') return false;
        return await this.activeAdapter.initialize();
    }

    async handleWebhookPayload(payload = {}) {
        if (this.activeTransport !== 'cloud') {
            const canAutoActivateCloud =
                CLOUD_WEBHOOK_AUTO_ACTIVATE
                && this.activeTransport === 'idle'
                && cloudClient.isConfigured();

            if (canAutoActivateCloud) {
                try {
                    await this.setTransportMode('cloud');
                } catch (error) {
                    console.warn('[WA][Provider] cloud auto-activation on webhook failed:', String(error?.message || error));
                }
            }
        }

        if (this.activeTransport !== 'cloud') return false;
        if (typeof cloudClient.handleWebhookPayload !== 'function') return false;
        return await cloudClient.handleWebhookPayload(payload);
    }

    getCapabilities() {
        if (!this.activeAdapter || typeof this.activeAdapter.getCapabilities !== 'function') {
            return {
                messageEdit: false,
                messageEditSync: false,
                messageForward: false,
                messageDelete: false,
                messageReply: false,
                quickReplies: false,
                quickRepliesRead: false,
                quickRepliesWrite: false
            };
        }
        return this.activeAdapter.getCapabilities();
    }

    getRuntimeInfo() {
        const cloudConfigured = cloudClient.isConfigured();
        return {
            requestedTransport: this.requestedTransport || 'idle',
            activeTransport: this.activeTransport || 'idle',
            cloudRequested: this.requestedTransport === 'cloud',
            cloudConfigured,
            cloudReady: this.activeTransport === 'cloud' && Boolean(this.activeAdapter?.isReady),
            runtimeCloudConfig: this.getCloudRuntimeConfigPublic(),
            availableTransports: ['cloud'],
            migrationReady: true
        };
    }

    getTransportMode() {
        return this.activeTransport || 'idle';
    }

    getRequestedTransport() {
        return this.requestedTransport || 'idle';
    }

    get isReady() {
        return Boolean(this.activeAdapter?.isReady);
    }

    set isReady(value) {
        if (!this.activeAdapter) return;
        this.activeAdapter.isReady = Boolean(value);
    }

    get lastQr() {
        return this.activeAdapter?.lastQr || null;
    }

    async getChats() {
        if (!this.activeAdapter?.getChats) return [];
        return await this.activeAdapter.getChats();
    }

    async getMessages(chatId, limit = 40) {
        if (!this.activeAdapter?.getMessages) return [];
        return await this.activeAdapter.getMessages(chatId, limit);
    }

    async sendMessage(to, body, options = {}) {
        if (!this.activeAdapter?.sendMessage) throw new Error('Transport not available');
        return await this.activeAdapter.sendMessage(to, body, options);
    }

    async sendTemplateMessage(to, payload = {}) {
        if (!this.activeAdapter?.sendTemplateMessage) {
            throw new Error('Template send is not supported in this transport.');
        }
        return await this.activeAdapter.sendTemplateMessage(to, payload);
    }

    async sendReaction(to, payload = {}) {
        if (!this.activeAdapter?.sendReaction) {
            throw new Error('Reaction send is not supported in this transport.');
        }
        return await this.activeAdapter.sendReaction(to, payload);
    }

    async getMessageById(messageId) {
        if (!this.activeAdapter?.getMessageById) return null;
        return await this.activeAdapter.getMessageById(messageId);
    }

    async replyToMessage(chatId, quotedMessageId, body) {
        if (!this.activeAdapter?.replyToMessage) throw new Error('Reply is not supported in this transport.');
        return await this.activeAdapter.replyToMessage(chatId, quotedMessageId, body);
    }

    async forwardMessage(messageId, toChatId) {
        if (!this.activeAdapter?.forwardMessage) throw new Error('Forward is not supported in this transport.');
        return await this.activeAdapter.forwardMessage(messageId, toChatId);
    }

    async getMessagesEditability(messageIds = []) {
        if (!this.activeAdapter?.getMessagesEditability) {
            const fallback = {};
            (Array.isArray(messageIds) ? messageIds : []).forEach((id) => {
                fallback[String(id || '').trim()] = false;
            });
            return fallback;
        }
        return await this.activeAdapter.getMessagesEditability(messageIds);
    }

    async canEditMessageById(messageId) {
        if (!this.activeAdapter?.canEditMessageById) return false;
        return await this.activeAdapter.canEditMessageById(messageId);
    }

    async sendMedia(to, mediaData, mimetype, filename, caption, isPtt = false, quotedMessageId = null) {
        if (!this.activeAdapter?.sendMedia) throw new Error('Media send is not supported in this transport.');
        return await this.activeAdapter.sendMedia(to, mediaData, mimetype, filename, caption, isPtt, quotedMessageId);
    }

    async markAsRead(chatId) {
        if (!this.activeAdapter?.markAsRead) return;
        return await this.activeAdapter.markAsRead(chatId);
    }

    async getLabels() {
        if (!this.activeAdapter?.getLabels) return [];
        return await this.activeAdapter.getLabels();
    }

    async getChatLabels(chatId) {
        if (!this.activeAdapter?.getChatLabels) return [];
        return await this.activeAdapter.getChatLabels(chatId);
    }

    async getBusinessProfile(contactId) {
        if (!this.activeAdapter?.getBusinessProfile) return null;
        return await this.activeAdapter.getBusinessProfile(contactId);
    }

    async getCatalog(contactId) {
        if (!this.activeAdapter?.getCatalog) return [];
        return await this.activeAdapter.getCatalog(contactId);
    }

    async downloadMedia(message) {
        if (!this.activeAdapter?.downloadMedia) return null;
        return await this.activeAdapter.downloadMedia(message);
    }
}

module.exports = new WAProvider();




