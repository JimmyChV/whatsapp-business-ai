const { getChatSuggestion, askInternalCopilot } = require('./ai_service');
const waClient = require('./whatsapp_client');
const mediaManager = require('./media_manager');
const { loadCatalog, addProduct, updateProduct, deleteProduct } = require('./catalog_manager');
const { getWooCatalog, isWooConfigured } = require('./woocommerce_service');
const RateLimiter = require('./rate_limiter');

const eventRateLimiter = new RateLimiter({
    windowMs: Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS || 10000),
    max: Number(process.env.SOCKET_RATE_LIMIT_MAX || 30)
});

function guardRateLimit(socket, eventName) {
    const key = `${socket.id}:${eventName}`;
    const result = eventRateLimiter.check(key);
    if (!result.allowed) {
        socket.emit('error', `Rate limit excedido para ${eventName}. Intenta en unos segundos.`);
        return false;
    }
    return true;
}

function collectProductsFromUnknownShape(input, depth = 0, found = []) {
    if (!input || depth > 4) return found;

    if (Array.isArray(input)) {
        input.forEach((entry) => collectProductsFromUnknownShape(entry, depth + 1, found));
        return found;
    }

    if (typeof input !== 'object') return found;

    const looksLikeLine = (
        input.name || input.title || input.productName || input.id
    ) && (
        input.quantity || input.qty || input.amount || input.price || input.unitPrice || input.retailer_id
    );

    if (looksLikeLine) {
        found.push({
            name: input.name || input.title || input.productName || `Producto ${found.length + 1}`,
            quantity: input.quantity || input.qty || 1,
            price: input.price || input.amount || input.unitPrice || null,
            sku: input.sku || input.retailer_id || null
        });
    }

    Object.values(input).forEach((value) => collectProductsFromUnknownShape(value, depth + 1, found));
    return found;
}


function parseProductsFromBodyText(body = '') {
    const text = String(body || '').trim();
    if (!text) return [];

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed = [];

    const linePattern = /^(?:[-•*]\s*)?(\d+(?:[.,]\d+)?)\s*(?:x|X)\s+(.+?)(?:\s+[-–—]\s*(?:S\/|PEN\s*)?(\d+(?:[.,]\d+)?))?$/;
    for (const line of lines) {
        const m = line.match(linePattern);
        if (!m) continue;
        parsed.push({
            name: m[2].trim(),
            quantity: Number.parseFloat(m[1].replace(',', '.')) || 1,
            price: m[3] ? m[3].replace(',', '.') : null,
            sku: null
        });
    }

    return parsed;
}

function extractOrderInfo(msg) {
    try {
        const data = msg?._data || {};
        let products = collectProductsFromUnknownShape({
            msgOrder: msg?.order,
            msgOrderProducts: msg?.orderProducts,
            native: msg,
            raw: data
        }).slice(0, 25);

        if (!products.length) {
            products = parseProductsFromBodyText(msg?.body || data?.body || '');
        }

        const orderId = msg?.orderId || data?.orderId || data?.orderToken || data?.token || null;
        const subtotal = msg?.subtotal || data?.subtotal || data?.totalAmount1000 || data?.total || null;
        const currency = msg?.currency || data?.currency || 'PEN';

        const maybeOrderType = String(msg?.type || '').toLowerCase().includes('order')
            || String(data?.type || '').toLowerCase().includes('order')
            || products.length > 0
            || Boolean(orderId);

        if (!maybeOrderType) return null;

        const rawPreview = {
            type: msg?.type || data?.type || null,
            body: msg?.body || data?.body || null,
            title: data?.title || data?.orderTitle || null,
            itemCount: data?.itemCount || data?.orderItemCount || null,
            sellerJid: data?.sellerJid || null,
            token: data?.orderToken || data?.token || null
        };

        return {
            orderId,
            currency,
            subtotal,
            products,
            rawPreview
        };
    } catch (error) {
        return null;
    }
}



function resolveChatDisplayName(chat) {
    if (!chat) return 'Sin nombre';
    const directName = chat.name || chat.formattedTitle || null;
    const contact = chat.contact || null;
    const contactName = contact?.name || contact?.pushname || contact?.shortName || null;
    const idUser = chat?.id?.user || String(chat?.id?._serialized || '').split('@')[0] || null;
    return directName || contactName || idUser || 'Sin nombre';
}

async function resolveProfilePic(client, chatOrContactId) {
    try {
        const direct = await client.getProfilePicUrl(chatOrContactId);
        if (direct) return direct;
    } catch (e) { }

    try {
        const contact = await client.getContactById(chatOrContactId);
        if (contact?.getProfilePicUrl) {
            const fromContact = await contact.getProfilePicUrl();
            if (fromContact) return fromContact;
        }
    } catch (e) { }

    return null;
}




async function resolveMessageSenderMeta(msg) {
    try {
        if (!msg || msg.fromMe) return { notifyName: null, senderPhone: null };
        const senderPhone = String(msg.from || '').split('@')[0] || null;
        let notifyName = msg?._data?.notifyName || null;
        try {
            const contact = await msg.getContact();
            notifyName = contact?.name || contact?.pushname || notifyName;
        } catch (e) { }
        return { notifyName, senderPhone };
    } catch (e) {
        return { notifyName: null, senderPhone: null };
    }
}

function isStatusOrSystemMessage(msg) {
    const from = String(msg?.from || '');
    const to = String(msg?.to || '');
    const type = String(msg?.type || '').toLowerCase();

    if (from.includes('status@broadcast') || to.includes('status@broadcast')) return true;
    if (from.endsWith('@broadcast') || to.endsWith('@broadcast')) return true;

    const blockedTypes = new Set([
        'e2e_notification',
        'notification',
        'ciphertext',
        'revoked'
    ]);

    return blockedTypes.has(type);
}

function isVisibleChatId(chatId) {
    const id = String(chatId || '');
    if (!id) return false;
    if (id.includes('status@broadcast')) return false;
    if (id.endsWith('@broadcast')) return false;
    return true;
}

class SocketManager {
    constructor(io) {
        this.io = io;
        this.chatMetaCache = new Map();
        this.chatMetaTtlMs = Number(process.env.CHAT_META_TTL_MS || 10 * 60 * 1000);
        this.chatListCache = { items: [], updatedAt: 0 };
        this.chatListTtlMs = Number(process.env.CHAT_LIST_TTL_MS || 15000);
        this.setupSocketEvents();
        this.setupWAClientEvents();
    }

    invalidateChatListCache() {
        this.chatListCache = { items: [], updatedAt: 0 };
    }

    async getSortedVisibleChats({ forceRefresh = false } = {}) {
        const cacheAge = Date.now() - (this.chatListCache?.updatedAt || 0);
        if (!forceRefresh && this.chatListCache.items.length > 0 && cacheAge <= this.chatListTtlMs) {
            return this.chatListCache.items;
        }

        const chats = await waClient.getChats();
        const sortedChats = [...chats]
            .filter((c) => isVisibleChatId(c?.id?._serialized))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        this.chatListCache = {
            items: sortedChats,
            updatedAt: Date.now()
        };
        return sortedChats;
    }

    getCachedChatMeta(chatId) {
        const key = String(chatId || '');
        const cached = this.chatMetaCache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.updatedAt > this.chatMetaTtlMs) return null;
        return cached;
    }

    async hydrateChatMeta(chat) {
        const chatId = chat?.id?._serialized;
        if (!chatId || !isVisibleChatId(chatId)) return { labels: [], profilePicUrl: null };

        const cached = this.getCachedChatMeta(chatId);
        if (cached) return { labels: cached.labels, profilePicUrl: cached.profilePicUrl };

        let labels = [];
        let profilePicUrl = null;
        try { labels = await chat.getLabels(); } catch (e) { }
        try { profilePicUrl = await resolveProfilePic(waClient.client, chatId); } catch (e) { }

        const normalized = {
            labels: (labels || []).map((l) => ({ id: l.id, name: l.name, color: l.color })),
            profilePicUrl,
            updatedAt: Date.now()
        };
        this.chatMetaCache.set(chatId, normalized);
        return normalized;
    }

    async toChatSummary(chat, { includeHeavyMeta = false } = {}) {
        const chatId = chat?.id?._serialized;
        if (!isVisibleChatId(chatId)) return null;

        const cached = this.getCachedChatMeta(chatId);
        let labels = cached?.labels || [];
        let profilePicUrl = cached?.profilePicUrl || null;

        if (includeHeavyMeta || !cached) {
            const hydrated = await this.hydrateChatMeta(chat);
            labels = hydrated.labels;
            profilePicUrl = hydrated.profilePicUrl;
        }

        return {
            id: chatId,
            name: resolveChatDisplayName(chat),
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            lastMessage: chat.lastMessage ? chat.lastMessage.body : '',
            lastMessageFromMe: chat.lastMessage ? chat.lastMessage.fromMe : false,
            ack: chat.lastMessage ? chat.lastMessage.ack : 0,
            labels,
            profilePicUrl
        };
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
            socket.on('get_chats', async (payload = {}) => {
                try {
                    const rawOffset = Number(payload?.offset ?? 0);
                    const rawLimit = Number(payload?.limit ?? 80);
                    const reset = Boolean(payload?.reset);
                    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
                    const limit = Number.isFinite(rawLimit)
                        ? Math.min(250, Math.max(20, Math.floor(rawLimit)))
                        : 80;

                    const sortedChats = await this.getSortedVisibleChats({ forceRefresh: reset });
                    const page = sortedChats.slice(offset, offset + limit);
                    const formatted = await Promise.all(page.map((c, index) => {
                        const includeHeavyMeta = (offset + index) < 25;
                        return this.toChatSummary(c, { includeHeavyMeta });
                    }));

                    const items = formatted.filter(Boolean);
                    const nextOffset = offset + items.length;
                    socket.emit('chats', {
                        items,
                        offset,
                        limit,
                        total: sortedChats.length,
                        hasMore: nextOffset < sortedChats.length
                    });
                } catch (e) {
                    console.error('Error fetching chats:', e);
                }
            });

            socket.on('get_chat_history', async (chatId) => {
                try {
                    const messages = await waClient.getMessages(chatId, 50);
                    const visible = messages.filter((m) => !isStatusOrSystemMessage(m));
                    const formatted = visible.map((m) => ({
                        id: m.id._serialized,
                        from: m.from,
                        to: m.to,
                        body: m.body,
                        timestamp: m.timestamp,
                        fromMe: m.fromMe,
                        hasMedia: m.hasMedia,
                        mediaData: null,
                        mimetype: null,
                        type: m.type,
                        order: extractOrderInfo(m)
                    }));
                    socket.emit('chat_history', { chatId, messages: formatted });

                    // Avoid blocking chat open while media is downloaded/cached.
                    visible
                        .filter((m) => m.hasMedia)
                        .slice(-12)
                        .forEach(async (m) => {
                            try {
                                const media = await mediaManager.processMessageMedia(m);
                                if (!media) return;
                                socket.emit('chat_media', {
                                    chatId,
                                    messageId: m.id._serialized,
                                    mediaData: media.data,
                                    mimetype: media.mimetype
                                });
                            } catch (mediaErr) { }
                        });
                } catch (e) {
                    console.error('Error fetching history:', e);
                }
            });

            socket.on('start_new_chat', async ({ phone, firstMessage }) => {
                try {
                    const clean = String(phone || '').replace(/\D/g, '');
                    if (!clean) {
                        socket.emit('start_new_chat_error', 'Número inválido.');
                        return;
                    }

                    const numberId = await waClient.client.getNumberId(clean);
                    if (!numberId?.user) {
                        socket.emit('start_new_chat_error', 'El número no está registrado en WhatsApp.');
                        return;
                    }

                    const chatId = `${numberId.user}@c.us`;
                    if (firstMessage && String(firstMessage).trim()) {
                        await waClient.sendMessage(chatId, String(firstMessage).trim());
                    }

                    socket.emit('chat_opened', { chatId });
                } catch (e) {
                    console.error('start_new_chat error:', e.message);
                    socket.emit('start_new_chat_error', 'No se pudo iniciar el chat.');
                }
            });

            socket.on('set_chat_labels', async ({ chatId, labelIds }) => {
                try {
                    if (!chatId) {
                        socket.emit('chat_labels_error', 'Chat inválido para etiquetar.');
                        return;
                    }

                    const ids = Array.isArray(labelIds)
                        ? labelIds.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').map((v) => Number.isNaN(Number(v)) ? String(v) : Number(v))
                        : [];

                    const chat = await waClient.client.getChatById(chatId);
                    if (chat?.changeLabels) {
                        await chat.changeLabels(ids);
                    } else if (waClient.client?.addOrRemoveLabels) {
                        await waClient.client.addOrRemoveLabels(ids, [chatId]);
                    }

                    let updatedLabels = [];
                    try {
                        updatedLabels = await chat.getLabels();
                    } catch (e) { }

                    const payload = {
                        chatId,
                        labels: (updatedLabels || []).map((l) => ({ id: l.id, name: l.name, color: l.color }))
                    };
                    this.io.emit('chat_labels_updated', payload);
                    socket.emit('chat_labels_saved', { chatId, ok: true });
                } catch (e) {
                    console.error('set_chat_labels error:', e.message);
                    socket.emit('chat_labels_error', 'No se pudieron actualizar las etiquetas en WhatsApp.');
                }
            });

            socket.on('create_label', async ({ name }) => {
                try {
                    const clean = String(name || '').trim();
                    if (!clean) {
                        socket.emit('chat_labels_error', 'Nombre de etiqueta inválido.');
                        return;
                    }
                    socket.emit('chat_labels_error', 'WhatsApp Web no permite crear etiquetas por API en esta versión. Créala en WhatsApp y aquí se sincronizará al recargar.');
                } catch (e) {
                    console.error('create_label error:', e.message);
                    socket.emit('chat_labels_error', 'No se pudo crear la etiqueta.');
                }
            });

            // --- Messaging ---
            socket.on('send_message', async ({ to, body }) => {
                if (!guardRateLimit(socket, 'send_message')) return;
                try {
                    await waClient.sendMessage(to, body);
                } catch (e) {
                    socket.emit('error', 'Failed to send message.');
                }
            });

            socket.on('send_media_message', async (data) => {
                if (!guardRateLimit(socket, 'send_media_message')) return;
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
                if (!guardRateLimit(socket, 'request_ai_suggestion')) return;
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
                if (!guardRateLimit(socket, 'internal_ai_query')) return;
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
                    let businessProfile = null;
                    try { profilePicUrl = await waClient.client.getProfilePicUrl(meId); } catch (e) { }
                    try { businessProfile = await waClient.getBusinessProfile(meId); } catch (e) { }
                    const profile = {
                        name: me.pushname,
                        phone: me.wid.user,
                        id: meId,
                        platform: me.platform || null,
                        isBusiness: true,
                        profilePicUrl,
                        businessHours: businessProfile?.business_hours || null,
                        category: businessProfile?.category || null,
                        email: businessProfile?.email || null,
                        website: businessProfile?.website || null,
                        address: businessProfile?.address || null,
                        description: businessProfile?.description || null,
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
                    let businessProfile = null;
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, me.wid._serialized);
                    } catch (e) { }
                    try {
                        businessProfile = await waClient.getBusinessProfile(me.wid._serialized);
                    } catch (e) { }
                    socket.emit('my_profile', {
                        pushname: me.pushname,
                        phone: me.wid.user,
                        id: me.wid._serialized,
                        platform: me.platform || null,
                        profilePicUrl,
                        category: businessProfile?.category || null,
                        email: businessProfile?.email || null,
                        website: businessProfile?.website || null,
                        address: businessProfile?.address || null,
                        description: businessProfile?.description || null,
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
                    let businessProfile = null;
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, contactId);
                    } catch (e) { }
                    try {
                        const statusObj = await contact.getAbout();
                        status = statusObj;
                    } catch (e) { }
                    try {
                        if (contact?.isBusiness) {
                            businessProfile = await waClient.getBusinessProfile(contactId);
                        }
                    } catch (e) { }
                    let labels = [];
                    try {
                        const chat = await waClient.client.getChatById(contactId);
                        const chatLabels = await chat.getLabels();
                        labels = chatLabels.map(l => ({ id: l.id, name: l.name, color: l.color }));
                    } catch (e) { }
                    socket.emit('contact_info', {
                        id: contactId,
                        name: contact.name || contact.pushname || contact.number,
                        phone: contact.number,
                        pushname: contact.pushname || null,
                        shortName: contact.shortName || null,
                        profilePicUrl,
                        status,
                        isBusiness: contact.isBusiness,
                        isEnterprise: contact.isEnterprise || false,
                        isMyContact: contact.isMyContact || false,
                        isWAContact: contact.isWAContact || false,
                        isBlocked: contact.isBlocked || false,
                        isGroup: contactId.includes('@g.us'),
                        labels,
                        businessDetails: businessProfile ? {
                            category: businessProfile?.category || null,
                            email: businessProfile?.email || null,
                            website: businessProfile?.website || null,
                            address: businessProfile?.address || null,
                            description: businessProfile?.description || null,
                        } : null,
                    });
                } catch (e) {
                    console.error('Error fetching contact info:', e);
                }
            });

            socket.on('logout_whatsapp', async () => {
                try {
                    await waClient.client.logout();
                } catch (e) {
                    console.error('logout_whatsapp error:', e.message);
                }
                try {
                    waClient.isReady = false;
                    waClient.client.initialize();
                } catch (e) {
                    console.error('reinitialize after logout failed:', e.message);
                }
                socket.emit('logout_done', { ok: true });
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
            if (isStatusOrSystemMessage(msg)) return;

            const media = await mediaManager.processMessageMedia(msg);
            const senderMeta = await resolveMessageSenderMeta(msg);
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
                ack: msg.ack,
                type: msg.type,
                notifyName: senderMeta.notifyName,
                senderPhone: senderMeta.senderPhone,
                order: extractOrderInfo(msg)
            });

            try {
                const relatedChatId = msg.fromMe ? msg.to : msg.from;
                if (isVisibleChatId(relatedChatId)) {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatId);
                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: false });
                    if (summary) this.io.emit('chat_updated', summary);
                }
            } catch (e) {
                // silent: message delivery should not fail by chat refresh issues
            }
        });

        waClient.on('message_sent', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;
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
                ack: msg.ack,
                type: msg.type,
                notifyName: null,
                senderPhone: null,
                order: extractOrderInfo(msg)
            });

            try {
                const relatedChatId = msg.to || msg.from;
                if (isVisibleChatId(relatedChatId)) {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatId);
                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: false });
                    if (summary) this.io.emit('chat_updated', summary);
                }
            } catch (e) { }
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

