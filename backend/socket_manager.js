const { getChatSuggestion, askInternalCopilot } = require('./ai_service');
const waClient = require('./whatsapp_client');
const mediaManager = require('./media_manager');
const { loadCatalog, addProduct, updateProduct, deleteProduct } = require('./catalog_manager');
const { getWooCatalog, isWooConfigured } = require('./woocommerce_service');

class SocketManager {
    constructor(io) {
        this.io = io;
        this.setupSocketEvents();
        this.setupWAClientEvents();
    }

    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            console.log('Web client connected:', socket.id);

            if (waClient.isReady) {
                socket.emit('ready', { message: 'WhatsApp is ready' });
            } else if (waClient.lastQr) {
                socket.emit('qr', waClient.lastQr);
            }

            // --- Chat info ---
            socket.on('get_chats', async () => {
                try {
                    const chats = await waClient.getChats();
                    const formatted = await Promise.all(chats.slice(0, 40).map(async (c) => {
                        let labels = [];
                        try {
                            // Only try to fetch labels if it's potentially a business chat or a contact
                            labels = await c.getLabels();
                        } catch (e) {
                            // Ignore if not supported or fails
                        }

                        let profilePicUrl = null;
                        try {
                            profilePicUrl = await waClient.client.getProfilePicUrl(c.id._serialized);
                        } catch (e) { }

                        return {
                            id: c.id._serialized,
                            name: c.name,
                            unreadCount: c.unreadCount,
                            timestamp: c.timestamp,
                            lastMessage: c.lastMessage ? c.lastMessage.body : '',
                            lastMessageFromMe: c.lastMessage ? c.lastMessage.fromMe : false,
                            ack: c.lastMessage ? c.lastMessage.ack : 0,
                            labels: labels.map(l => ({ name: l.name, color: l.color })),
                            profilePicUrl
                        };
                    }));
                    socket.emit('chats', formatted);
                } catch (e) {
                    console.error('Error fetching chats:', e);
                }
            });

            socket.on('get_chat_history', async (chatId) => {
                try {
                    const messages = await waClient.getMessages(chatId, 50);
                    const formatted = await Promise.all(messages.map(async (m) => {
                        let media = null;
                        if (m.hasMedia) {
                            media = await mediaManager.processMessageMedia(m);
                        }
                        return {
                            id: m.id._serialized,
                            from: m.from,
                            to: m.to,
                            body: m.body,
                            timestamp: m.timestamp,
                            fromMe: m.fromMe,
                            hasMedia: m.hasMedia,
                            mediaData: media ? media.data : null,
                            mimetype: media ? media.mimetype : null
                        };
                    }));
                    socket.emit('chat_history', { chatId, messages: formatted });
                } catch (e) {
                    console.error('Error fetching history:', e);
                }
            });

            // --- Messaging ---
            socket.on('send_message', async ({ to, body }) => {
                try {
                    await waClient.sendMessage(to, body);
                } catch (e) {
                    socket.emit('error', 'Failed to send message.');
                }
            });

            socket.on('send_media_message', async (data) => {
                try {
                    const { to, body, mediaData, mimetype, filename, isPtt } = data;
                    await waClient.sendMedia(to, mediaData, mimetype, filename, body, isPtt);
                } catch (e) {
                    socket.emit('error', 'Failed to send media.');
                }
            });

            socket.on('mark_chat_read', async (chatId) => {
                try {
                    await waClient.markAsRead(chatId);
                } catch (e) { }
            });

            // --- AI ---
            socket.on('request_ai_suggestion', (payload) => {
                const { contextText, customPrompt, businessContext } = payload || {};
                // Defer to avoid blocking the event loop (prevents 'click handler took Xms' violations)
                setImmediate(async () => {
                    try {
                        const aiText = await getChatSuggestion(contextText, customPrompt, (chunk) => {
                            socket.emit('ai_suggestion_chunk', chunk);
                        }, businessContext);
                        if (typeof aiText === 'string' && aiText.startsWith('Error IA:')) {
                            socket.emit('ai_error', aiText);
                        }
                        socket.emit('ai_suggestion_complete');
                    } catch (e) {
                        console.error('AI suggestion error:', e);
                        socket.emit('ai_error', 'Error IA: no se pudo generar sugerencia.');
                        socket.emit('ai_suggestion_complete');
                    }
                });
            });

            socket.on('internal_ai_query', (payload) => {
                const { query, businessContext } = typeof payload === 'string'
                    ? { query: payload, businessContext: null }
                    : (payload || {});
                // Defer to avoid blocking the event loop
                setImmediate(async () => {
                    try {
                        const copilotText = await askInternalCopilot(query, (chunk) => {
                            socket.emit('internal_ai_chunk', chunk);
                        }, businessContext);
                        if (typeof copilotText === 'string' && copilotText.startsWith('Error IA:')) {
                            socket.emit('internal_ai_error', copilotText);
                        }
                        socket.emit('internal_ai_complete');
                    } catch (e) {
                        console.error('Copilot error:', e);
                        socket.emit('internal_ai_error', 'Error IA: no se pudo responder en copiloto.');
                        socket.emit('internal_ai_complete');
                    }
                });
            });

            socket.on('get_business_data', async () => {
                try {
                    const me = waClient.client.info;
                    const meId = me.wid._serialized;

                    // Real profile from WA account info
                    let profilePicUrl = null;
                    try { profilePicUrl = await waClient.client.getProfilePicUrl(meId); } catch (e) { }
                    const profile = {
                        name: me.pushname,
                        phone: me.wid.user,
                        profilePicUrl,
                    };

                    // Real labels from WA
                    let labels = [];
                    try {
                        const raw = await waClient.getLabels();
                        labels = raw.map(l => ({ id: l.id, name: l.name, color: l.color }));
                    } catch (e) { console.log('Labels:', e.message); }

                    // Catalog priority: WhatsApp native -> WooCommerce -> local file fallback.
                    let catalog = [];
                    let catalogMeta = {
                        source: 'native',
                        nativeAvailable: false,
                        wooConfigured: isWooConfigured(),
                        wooAvailable: false,
                        wooSource: null,
                        wooStatus: null,
                        wooReason: null
                    };

                    try {
                        const nativeProducts = await waClient.getCatalog(meId);
                        if (nativeProducts && nativeProducts.length > 0) {
                            catalog = nativeProducts.map(p => ({
                                id: p.id,
                                title: p.name,
                                price: p.price ? (p.price / 1000).toFixed(2) : '0.00',
                                description: p.description,
                                imageUrl: p.imageUrls ? p.imageUrls[0] : null,
                                source: 'native'
                            }));
                            catalogMeta = {
                                source: 'native',
                                nativeAvailable: true,
                                wooConfigured: isWooConfigured(),
                                wooAvailable: false
                            };
                            console.log(`[Catalog] Loaded ${catalog.length} native products.`);
                        }
                    } catch (e) {
                        console.log('[Catalog] Native fetch failed.', e.message);
                    }

                    if (!catalog.length) {
                        const wooResult = await getWooCatalog();
                        if (wooResult.products.length > 0) {
                            catalog = wooResult.products;
                            catalogMeta = {
                                source: 'woocommerce',
                                nativeAvailable: false,
                                wooConfigured: isWooConfigured(),
                                wooAvailable: true,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                            console.log(`[Catalog] Loaded ${catalog.length} products from WooCommerce (${wooResult.source}).`);
                        } else {
                            catalogMeta = {
                                ...catalogMeta,
                                wooConfigured: isWooConfigured(),
                                wooAvailable: false,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                            console.log(`[Catalog] WooCommerce unavailable/empty (${wooResult.source}): ${wooResult.reason || 'sin detalle'}`);
                        }
                    }

                    if (!catalog.length) {
                        catalog = loadCatalog();
                        catalogMeta = {
                            ...catalogMeta,
                            source: 'local',
                            nativeAvailable: false,
                            wooConfigured: isWooConfigured(),
                            wooAvailable: false
                        };
                        console.log('[Catalog] Using local catalog fallback.');
                    }

                    socket.emit('business_data', { profile, labels, catalog, catalogMeta });
                } catch (e) {
                    console.error('Error fetching business data:', e);
                    socket.emit('business_data', {
                        profile: null,
                        labels: [],
                        catalog: loadCatalog(),
                        catalogMeta: { source: 'local', nativeAvailable: false, wooConfigured: isWooConfigured(), wooAvailable: false, wooSource: null, wooStatus: 'error', wooReason: 'Error al obtener datos de negocio' }
                    });
                }
            });

            // --- Catalog CRUD ---
            socket.on('add_product', (product) => {
                try {
                    const newProduct = addProduct(product);
                    this.io.emit('business_data_catalog', loadCatalog());
                    socket.emit('product_added', newProduct);
                } catch (e) { console.error('add_product error:', e); }
            });

            socket.on('update_product', ({ id, updates }) => {
                try {
                    const updated = updateProduct(id, updates);
                    this.io.emit('business_data_catalog', loadCatalog());
                    socket.emit('product_updated', updated);
                } catch (e) { console.error('update_product error:', e); }
            });

            socket.on('delete_product', (id) => {
                try {
                    deleteProduct(id);
                    this.io.emit('business_data_catalog', loadCatalog());
                } catch (e) { console.error('delete_product error:', e); }
            });

            socket.on('get_my_profile', async () => {
                try {
                    const me = waClient.client.info;
                    let profilePicUrl = null;
                    try {
                        profilePicUrl = await waClient.client.getProfilePicUrl(me.wid._serialized);
                    } catch (e) { }
                    socket.emit('my_profile', {
                        pushname: me.pushname,
                        phone: me.wid.user,
                        id: me.wid._serialized,
                        profilePicUrl,
                    });
                } catch (e) {
                    console.error('Error fetching my profile:', e);
                }
            });

            socket.on('get_contact_info', async (contactId) => {
                try {
                    const contact = await waClient.client.getContactById(contactId);
                    let profilePicUrl = null;
                    let status = null;
                    try {
                        profilePicUrl = await waClient.client.getProfilePicUrl(contactId);
                    } catch (e) { }
                    try {
                        const statusObj = await contact.getAbout();
                        status = statusObj;
                    } catch (e) { }
                    let labels = [];
                    try {
                        const chat = await waClient.client.getChatById(contactId);
                        const chatLabels = await chat.getLabels();
                        labels = chatLabels.map(l => ({ name: l.name, color: l.color }));
                    } catch (e) { }
                    socket.emit('contact_info', {
                        id: contactId,
                        name: contact.name || contact.pushname || contact.number,
                        phone: contact.number,
                        profilePicUrl,
                        status,
                        isBusiness: contact.isBusiness,
                        isGroup: contactId.includes('@g.us'),
                        labels,
                    });
                } catch (e) {
                    console.error('Error fetching contact info:', e);
                }
            });

            socket.on('disconnect', () => {
                console.log('Web client disconnected:', socket.id);
            });
        });
    }

    setupWAClientEvents() {
        waClient.on('qr', (qr) => this.io.emit('qr', qr));
        waClient.on('ready', () => this.io.emit('ready', { message: 'WhatsApp Ready' }));
        waClient.on('authenticated', () => this.io.emit('authenticated'));
        waClient.on('auth_failure', (msg) => this.io.emit('auth_failure', msg));
        waClient.on('disconnected', (reason) => this.io.emit('disconnected', reason));
        waClient.on('message', async (msg) => {
            const media = await mediaManager.processMessageMedia(msg);
            this.io.emit('message', {
                id: msg.id._serialized,
                from: msg.from,
                to: msg.to,
                body: msg.body,
                timestamp: msg.timestamp,
                fromMe: msg.fromMe,
                hasMedia: msg.hasMedia,
                mediaData: media ? media.data : null,
                mimetype: media ? media.mimetype : null,
                ack: msg.ack
            });
            // Auto refresh chat list
            const chats = await waClient.getChats();
            const formatted = await Promise.all(chats.slice(0, 40).map(async (c) => {
                let labels = [];
                try { labels = await c.getLabels(); } catch (e) { }
                let profilePicUrl = null;
                try { profilePicUrl = await waClient.client.getProfilePicUrl(c.id._serialized); } catch (e) { }

                return {
                    id: c.id._serialized,
                    name: c.name,
                    unreadCount: c.unreadCount,
                    timestamp: c.timestamp,
                    lastMessage: c.lastMessage ? c.lastMessage.body : '',
                    lastMessageFromMe: c.lastMessage ? c.lastMessage.fromMe : false,
                    ack: c.lastMessage ? c.lastMessage.ack : 0,
                    labels: labels.map(l => ({ name: l.name, color: l.color })),
                    profilePicUrl
                };
            }));
            this.io.emit('chats', formatted);
        });

        waClient.on('message_sent', async (msg) => {
            // Emite de vuelta para confirmar en UI si se envió desde otro lugar
            const media = await mediaManager.processMessageMedia(msg);
            this.io.emit('message', {
                id: msg.id._serialized,
                from: msg.from,
                to: msg.to,
                body: msg.body,
                timestamp: msg.timestamp,
                fromMe: true,
                hasMedia: msg.hasMedia,
                mediaData: media ? media.data : null,
                mimetype: media ? media.mimetype : null,
                ack: msg.ack
            });
        });

        waClient.on('message_ack', ({ message, ack }) => {
            this.io.emit('message_ack', {
                id: message.id._serialized,
                chatId: message.to || message.from,
                ack: ack
            });
        });
    }
}

module.exports = SocketManager;
