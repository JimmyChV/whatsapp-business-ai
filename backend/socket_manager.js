const { getChatSuggestion, askInternalCopilot } = require('./ai_service');
const waClient = require('./wa_provider');
const mediaManager = require('./media_manager');
const { loadCatalog, addProduct, updateProduct, deleteProduct } = require('./catalog_manager');
const { getWooCatalog, isWooConfigured } = require('./woocommerce_service');
const { listQuickReplies, addQuickReply, updateQuickReply, deleteQuickReply } = require('./quick_replies_manager');
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

    const linePattern = /^(?:[-\u2022*]\s*)?(\d+(?:[.,]\d+)?)\s*(?:x|X)\s+(.+?)(?:\s+[-\u2013\u2014]\s*(?:S\/|PEN\s*)?(\d+(?:[.,]\d+)?))?$/;
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

    const contact = chat.contact || null;
    const chatId = String(chat?.id?._serialized || '');
    const candidates = [
        String(chat.name || '').trim(),
        String(chat.formattedTitle || '').trim(),
        String(contact?.name || '').trim(),
        String(contact?.pushname || '').trim(),
        String(contact?.shortName || '').trim(),
    ].filter(Boolean);

    const bestHuman = candidates.find((name) => !name.includes('@') && !/^\d{14,}$/.test(name));
    if (bestHuman) return bestHuman;

    const fallbackPhone = coerceHumanPhone(
        contact?.number
        || contact?.phoneNumber
        || (!isLidIdentifier(chatId) ? (contact?.id?.user || chat?.id?.user || String(chatId).split('@')[0] || '') : '')
    );
    if (fallbackPhone) return `+${fallbackPhone}`;

    return 'Sin nombre';
}

function buildProfilePicCandidates(rawId, extraCandidates = []) {
    const out = [];
    const push = (value) => {
        const text = String(value || '').trim();
        if (!text) return;
        if (!out.includes(text)) out.push(text);
        if (!text.includes('@')) {
            const digits = text.replace(/\D/g, '');
            if (digits && !out.includes(`${digits}@c.us`)) out.push(`${digits}@c.us`);
        } else {
            const localPart = text.split('@')[0] || '';
            const digits = localPart.replace(/\D/g, '');
            if (digits && !out.includes(`${digits}@c.us`)) out.push(`${digits}@c.us`);
        }
    };

    push(rawId);
    (Array.isArray(extraCandidates) ? extraCandidates : []).forEach(push);
    return out;
}

async function resolveProfilePic(client, chatOrContactId, extraCandidates = []) {
    const candidates = buildProfilePicCandidates(chatOrContactId, extraCandidates);

    for (const candidate of candidates) {
        try {
            const direct = await client.getProfilePicUrl(candidate);
            if (direct) return direct;
        } catch (e) { }
    }

    for (const candidate of candidates) {
        try {
            const contact = await client.getContactById(candidate);
            if (contact?.getProfilePicUrl) {
                const fromContact = await contact.getProfilePicUrl();
                if (fromContact) return fromContact;
            }
        } catch (e) { }
    }

    for (const candidate of candidates) {
        try {
            const chat = await client.getChatById(candidate);
            if (chat?.contact?.getProfilePicUrl) {
                const fromChatContact = await chat.contact.getProfilePicUrl();
                if (fromChatContact) return fromChatContact;
            }
        } catch (e) { }
    }

    return null;
}

function truncateDisplayValue(value = '', maxLen = 260) {
    const text = String(value ?? '');
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

function snapshotSerializable(input, depth = 0, seen = new WeakSet()) {
    if (depth > 3) return undefined;
    if (input === null || input === undefined) return input;

    const t = typeof input;
    if (t === 'string') return truncateDisplayValue(input);
    if (t === 'number' || t === 'boolean') return input;
    if (t === 'bigint') return String(input);
    if (t === 'function' || t === 'symbol') return undefined;

    if (Array.isArray(input)) {
        return input
            .slice(0, 30)
            .map((entry) => snapshotSerializable(entry, depth + 1, seen))
            .filter((entry) => entry !== undefined);
    }

    if (input instanceof Date) return input.toISOString();
    if (Buffer.isBuffer(input)) return `[buffer:${input.length}]`;

    if (t === 'object') {
        if (seen.has(input)) return '[circular]';
        seen.add(input);
        const out = {};
        const keys = Object.keys(input).slice(0, 80);
        for (const key of keys) {
            const value = snapshotSerializable(input[key], depth + 1, seen);
            if (value !== undefined && value !== '') out[key] = value;
        }
        return out;
    }

    return undefined;
}

function normalizeBusinessDetailsSnapshot(businessProfile = null) {
    if (!businessProfile) return null;
    const websites = Array.isArray(businessProfile?.website)
        ? businessProfile.website.filter(Boolean)
        : (businessProfile?.website ? [businessProfile.website] : []);

    return {
        category: businessProfile?.category || null,
        description: businessProfile?.description || null,
        email: businessProfile?.email || null,
        website: websites[0] || null,
        websites,
        address: businessProfile?.address || null,
        businessHours: businessProfile?.business_hours || businessProfile?.businessHours || null,
        raw: snapshotSerializable(businessProfile)
    };
}

function extractContactSnapshot(contact = null) {
    if (!contact) return null;
    const raw = contact?._data || {};
    return {
        id: contact?.id?._serialized || null,
        user: contact?.id?.user || null,
        server: contact?.id?.server || null,
        number: contact?.number || raw?.userid || null,
        name: contact?.name || null,
        pushname: contact?.pushname || null,
        shortName: contact?.shortName || null,
        verifiedName: raw?.verifiedName || null,
        verifiedLevel: raw?.verifiedLevel || null,
        statusMute: raw?.statusMute || null,
        type: raw?.type || null,
        isBusiness: Boolean(contact?.isBusiness),
        isEnterprise: Boolean(contact?.isEnterprise),
        isMyContact: Boolean(contact?.isMyContact),
        isMe: Boolean(contact?.isMe),
        isUser: Boolean(contact?.isUser),
        isGroup: Boolean(contact?.isGroup),
        isWAContact: Boolean(contact?.isWAContact),
        isBlocked: Boolean(contact?.isBlocked),
        isPSA: Boolean(contact?.isPSA),
        rawData: snapshotSerializable(raw)
    };
}

function extractChatSnapshot(chat = null) {
    if (!chat) return null;
    return {
        id: chat?.id?._serialized || null,
        archived: Boolean(chat?.archived),
        pinned: Boolean(chat?.pinned),
        isMuted: Boolean(chat?.isMuted),
        muteExpiration: Number(chat?.muteExpiration || 0) || null,
        unreadCount: Number(chat?.unreadCount || 0) || 0,
        timestamp: Number(chat?.timestamp || 0) || null,
        isGroup: Boolean(chat?.isGroup),
        participantsCount: Array.isArray(chat?.participants) ? chat.participants.length : null,
        rawData: snapshotSerializable(chat?._data || null)
    };
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

function normalizePhoneDigits(raw = '') {
    return String(raw || '').replace(/\D/g, '');
}

function formatPhoneForDisplay(raw = '') {
    const digits = normalizePhoneDigits(raw);
    if (digits.length < 8 || digits.length > 15) return null;
    return digits;
}

function isLikelyHumanPhoneDigits(raw = '') {
    const digits = normalizePhoneDigits(raw);
    if (digits.length < 8 || digits.length > 12) return false;
    if (/^0+$/.test(digits)) return false;
    return true;
}

function coerceHumanPhone(raw = '') {
    const digits = formatPhoneForDisplay(raw);
    if (!digits) return null;
    return isLikelyHumanPhoneDigits(digits) ? digits : null;
}

function isLidIdentifier(value = '') {
    return String(value || '').trim().endsWith('@lid');
}

function extractPhoneFromText(value = '') {
    const text = String(value || '');
    if (!text) return null;
    const matches = text.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
    for (const token of matches) {
        const phone = formatPhoneForDisplay(token);
        if (phone) return phone;
    }
    return null;
}

function extractPhoneFromContactLike(contact = {}, options = {}) {
    const skipDirectNumber = Boolean(options?.skipDirectNumber);
    const serialized = String(contact?.id?._serialized || '');
    const isLid = isLidIdentifier(serialized);
    const candidates = [
        skipDirectNumber ? null : contact?.number,
        contact?.phoneNumber,
        (!isLid ? contact?.id?.user : null),
        (!isLid ? (serialized.split('@')[0] || '') : null),
        contact?.userid,
        contact?.pn,
        contact?.lid
    ];
    for (const candidate of candidates) {
        const phone = coerceHumanPhone(candidate);
        if (phone) return phone;
    }
    const fromText = extractPhoneFromText(
        `${contact?.name || ''} ${contact?.pushname || ''} ${contact?.shortName || ''}`
    );
    if (fromText && isLikelyHumanPhoneDigits(fromText)) return fromText;
    return null;
}

function extractPhoneFromChat(chat = {}) {
    const chatId = String(chat?.id?._serialized || '');
    const contact = chat?.contact || null;
    const isLid = isLidIdentifier(chatId);
    const fromMetaText = extractPhoneFromText(
        `${chat?.name || ''} ${chat?.formattedTitle || ''} ${contact?.name || ''} ${contact?.pushname || ''} ${contact?.shortName || ''}`
    );
    if (isLid && fromMetaText && isLikelyHumanPhoneDigits(fromMetaText)) return fromMetaText;

    const fromContact = extractPhoneFromContactLike(contact || {}, { skipDirectNumber: isLid });
    if (fromContact) return fromContact;
    if (fromMetaText && isLikelyHumanPhoneDigits(fromMetaText)) return fromMetaText;

    if (!isLid && chatId.endsWith('@c.us')) {
        const fromCUs = coerceHumanPhone(chat?.id?.user || chatId.split('@')[0] || '');
        if (fromCUs) return fromCUs;
    }

    if (!isLid) {
        const fromUser = coerceHumanPhone(chat?.id?.user || '');
        if (fromUser) return fromUser;
    }

    if (isLid) return null;
    return coerceHumanPhone(chatId.split('@')[0] || '');
}
function extractPhoneFromSummary(summary = {}) {
    const id = String(summary?.id || '');
    const isLid = isLidIdentifier(id);

    const fromSubtitle = extractPhoneFromText(summary?.subtitle || '');
    if (fromSubtitle && isLikelyHumanPhoneDigits(fromSubtitle)) return fromSubtitle;

    const fromStatus = extractPhoneFromText(summary?.status || '');
    if (fromStatus && isLikelyHumanPhoneDigits(fromStatus)) return fromStatus;

    const explicitPhone = coerceHumanPhone(summary?.phone || '');
    if (explicitPhone) return explicitPhone;

    if (!isLid && id.endsWith('@c.us')) {
        const fromCUs = coerceHumanPhone(id.split('@')[0] || '');
        if (fromCUs) return fromCUs;
    }

    if (isLid) return null;
    return coerceHumanPhone(id.split('@')[0] || '');
}

function buildChatIdentityKeyFromSummary(summary = {}) {
    const id = String(summary?.id || '');
    const phone = extractPhoneFromSummary(summary);
    if (phone) return 'phone:' + phone;
    return 'id:' + id;
}

function pickPreferredSummary(prevItem = {}, incoming = {}) {
    const prevTs = Number(prevItem?.timestamp || 0);
    const incomingTs = Number(incoming?.timestamp || 0);

    const incomingHasFreshPayload = Boolean(incoming?.lastMessage) && !Boolean(prevItem?.lastMessage);
    const pickIncoming = incomingTs > prevTs || (incomingTs === prevTs && incomingHasFreshPayload);
    const primary = pickIncoming ? incoming : prevItem;
    const secondary = pickIncoming ? prevItem : incoming;

    const merged = {
        ...secondary,
        ...primary,
        phone: primary?.phone || secondary?.phone || null,
        subtitle: primary?.subtitle || secondary?.subtitle || null,
        isMyContact: Boolean(primary?.isMyContact ?? secondary?.isMyContact),
        lastMessage: primary?.lastMessage || secondary?.lastMessage || '',
        timestamp: Math.max(prevTs, incomingTs),
        labels: Array.isArray(primary?.labels) && primary.labels.length > 0
            ? primary.labels
            : (Array.isArray(secondary?.labels) ? secondary.labels : [])
    };

    const primaryName = String(primary?.name || '').trim();
    const secondaryName = String(secondary?.name || '').trim();
    const primaryLooksInternal = primaryName.includes('@') || /^\d{14,}$/.test(primaryName);
    merged.name = (!primaryLooksInternal && primaryName) ? primaryName : (secondaryName || primaryName || 'Sin nombre');

    return merged;
}

function resolveLastMessagePreview(chat = {}) {
    const last = chat?.lastMessage;
    if (!last) return '';

    const body = String(last?.body || '').trim();
    if (body) return body;

    const type = String(last?.type || last?._data?.type || '').toLowerCase();
    const map = {
        image: 'Imagen',
        video: 'Video',
        audio: 'Audio',
        ptt: 'Nota de voz',
        document: 'Documento',
        sticker: 'Sticker',
        location: 'Ubicacion',
        vcard: 'Contacto',
        order: 'Pedido',
        revoked: 'Mensaje eliminado'
    };

    return map[type] || 'Mensaje';
}

function defaultCountryCode() {
    return normalizePhoneDigits(process.env.WA_DEFAULT_COUNTRY_CODE || process.env.DEFAULT_COUNTRY_CODE || '51');
}

function buildPhoneCandidates(rawPhone) {
    const clean = normalizePhoneDigits(rawPhone);
    if (!clean) return [];

    const cc = defaultCountryCode();
    const trimmed = clean.replace(/^0+/, '') || clean;
    const candidates = [];

    const push = (v) => {
        const digits = normalizePhoneDigits(v);
        if (!digits) return;
        if (!candidates.includes(digits)) candidates.push(digits);
    };

    const isLikelyLocal = trimmed.length <= 10;
    if (isLikelyLocal && cc && !trimmed.startsWith(cc)) push(`${cc}${trimmed}`);
    push(trimmed);
    if (cc && trimmed.startsWith(cc)) push(trimmed.slice(cc.length));

    return candidates;
}

async function resolveRegisteredNumber(client, rawPhone) {
    const candidates = buildPhoneCandidates(rawPhone);
    for (const cand of candidates) {
        try {
            const numberId = await client.getNumberId(cand);
            if (!numberId) continue;

            const candDigits = coerceHumanPhone(cand);
            const byUser = coerceHumanPhone(numberId.user || '');
            const serialized = String(numberId._serialized || '');
            const bySerialized = coerceHumanPhone(serialized.split('@')[0] || '');

            const looksLikeSameNumber = (a, b) => {
                if (!a || !b) return false;
                return a === b || a.endsWith(b) || b.endsWith(a);
            };

            if (byUser && candDigits && looksLikeSameNumber(byUser, candDigits)) return byUser;
            if (bySerialized && candDigits && looksLikeSameNumber(bySerialized, candDigits)) return bySerialized;
            if (candDigits) return candDigits;
            if (byUser) return byUser;
            if (bySerialized) return bySerialized;
        } catch (e) { }
    }
    return null;
}

function normalizeFilterToken(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeFilterTokens(tokens = []) {
    if (!Array.isArray(tokens)) return [];
    const seen = new Set();
    const normalized = [];
    for (const token of tokens) {
        const clean = normalizeFilterToken(token);
        if (!clean) continue;
        if (seen.has(clean)) continue;
        seen.add(clean);
        normalized.push(clean);
    }
    return normalized;
}

function toLabelTokenSet(labels = []) {
    const tokens = new Set();
    if (!Array.isArray(labels)) return tokens;
    for (const label of labels) {
        const id = normalizeFilterToken(label?.id);
        if (id) tokens.add(`id:${id}`);
        const name = normalizeFilterToken(label?.name);
        if (name) tokens.add(`name:${name}`);
    }
    return tokens;
}

function matchesTokenSet(labelTokenSet, selectedTokens) {
    if (!(labelTokenSet instanceof Set)) return false;
    if (!Array.isArray(selectedTokens) || selectedTokens.length === 0) return true;
    return selectedTokens.some((token) => {
        const clean = normalizeFilterToken(token);
        if (!clean) return false;
        if (labelTokenSet.has(clean)) return true;
        if (clean.startsWith('id:')) {
            const value = clean.slice(3);
            return value ? labelTokenSet.has(value) : false;
        }
        if (clean.startsWith('name:')) {
            const value = clean.slice(5);
            return value ? labelTokenSet.has(value) : false;
        }
        return labelTokenSet.has(`id:${clean}`) || labelTokenSet.has(`name:${clean}`);
    });
}

async function runWithConcurrency(items, limit, worker) {
    if (!Array.isArray(items) || items.length === 0) return;
    const max = Math.max(1, Math.floor(Number(limit) || 1));
    let cursor = 0;

    const runners = Array.from({ length: Math.min(max, items.length) }, async () => {
        while (true) {
            const idx = cursor++;
            if (idx >= items.length) return;
            await worker(items[idx], idx);
        }
    });

    await Promise.all(runners);
}
class SocketManager {
    constructor(io) {
        this.io = io;
        this.chatMetaCache = new Map();
        this.chatMetaTtlMs = Number(process.env.CHAT_META_TTL_MS || 10 * 60 * 1000);
        this.chatListCache = { items: [], updatedAt: 0 };
        this.chatListTtlMs = Number(process.env.CHAT_LIST_TTL_MS || 15000);
        this.contactListCache = { items: [], updatedAt: 0 };
        this.contactListTtlMs = Number(process.env.CONTACT_LIST_TTL_MS || 60 * 1000);
        this.setupSocketEvents();
        this.setupWAClientEvents();
    }


    getWaRuntime() {
        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : {};
        return {
            requestedTransport: String(runtime?.requestedTransport || process.env.WA_TRANSPORT || 'webjs').toLowerCase(),
            activeTransport: String(runtime?.activeTransport || 'webjs').toLowerCase(),
            cloudRequested: Boolean(runtime?.cloudRequested),
            cloudConfigured: Boolean(runtime?.cloudConfigured),
            cloudReady: Boolean(runtime?.cloudReady),
            migrationReady: runtime?.migrationReady !== false
        };
    }

    getWaCapabilities() {
        const caps = waClient.getCapabilities();
        const runtime = this.getWaRuntime();
        return {
            messageEdit: Boolean(caps?.messageEdit),
            messageEditSync: Boolean(caps?.messageEditSync),
            quickReplies: Boolean(caps?.quickReplies),
            quickRepliesRead: Boolean(caps?.quickRepliesRead),

            quickRepliesWrite: Boolean(caps?.quickRepliesWrite),
            transport: runtime.activeTransport,
            requestedTransport: runtime.requestedTransport,
            cloudConfigured: runtime.cloudConfigured,
            migrationReady: runtime.migrationReady
        };
    }

    emitWaCapabilities(socket) {
        socket.emit('wa_capabilities', this.getWaCapabilities());

        socket.emit('wa_runtime', this.getWaRuntime());
    }

    async emitMessageEditability(messageId, chatId) {
        const id = String(messageId || '').trim();
        if (!id) return;
        try {
            const canEdit = await waClient.canEditMessageById(id);
            this.io.emit('message_editability', {
                id,
                chatId: String(chatId || ''),
                canEdit
            });
        } catch (e) { }
    }

    scheduleEditabilityRefresh(messageId, chatId, delaysMs = [1200, 3200, 7000]) {
        const id = String(messageId || '').trim();
        if (!id) return;
        const normalizedChatId = String(chatId || '');
        (Array.isArray(delaysMs) ? delaysMs : []).forEach((delay) => {
            const waitMs = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
            setTimeout(() => {
                this.emitMessageEditability(id, normalizedChatId);
            }, waitMs);
        });
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

    async getSearchableContacts({ forceRefresh = false } = {}) {
        const cacheAge = Date.now() - (this.contactListCache?.updatedAt || 0);
        if (!forceRefresh && this.contactListCache.items.length > 0 && cacheAge <= this.contactListTtlMs) {
            return this.contactListCache.items;
        }

        let contacts = [];
        try {
            contacts = await waClient.client.getContacts();
        } catch (e) {
            contacts = [];
        }

        const mapped = contacts
            .filter((c) => {
                const serialized = String(c?.id?._serialized || '');
                return serialized.endsWith('@c.us') || serialized.endsWith('@lid');
            })
            .map((c) => {
                const serialized = String(c?.id?._serialized || '');
                const phone = coerceHumanPhone(c?.number || c?.id?.user || serialized.split('@')[0] || '');
                if (!phone) return null;

                const displayNameCandidate = String(c?.name || c?.pushname || c?.shortName || '').trim();
                const displayName = (displayNameCandidate && !displayNameCandidate.includes('@') && !/^\d{14,}$/.test(displayNameCandidate))
                    ? displayNameCandidate
                    : ('+' + phone);

                const subtitleCandidate = String(c?.pushname || c?.shortName || c?.name || '').trim();
                const subtitle = subtitleCandidate && subtitleCandidate !== displayName ? subtitleCandidate : null;

                return {
                    id: `${phone}@c.us`,
                    name: displayName,
                    phone,
                    subtitle,
                    unreadCount: 0,
                    timestamp: 0,
                    lastMessage: '',
                    lastMessageFromMe: false,
                    ack: 0,
                    labels: [],
                    profilePicUrl: null,
                    isMyContact: Boolean(c?.isMyContact)
                };
            })
            .filter(Boolean);

        const dedupMap = new Map();
        for (const item of mapped) {
            const key = buildChatIdentityKeyFromSummary(item);
            if (!dedupMap.has(key)) {
                dedupMap.set(key, item);
            }
        }
        const deduped = Array.from(dedupMap.values());

        this.contactListCache = {
            items: deduped,
            updatedAt: Date.now()
        };
        return deduped;
    }
    async getChatLabelTokenSet(chat) {
        const chatId = String(chat?.id?._serialized || '');
        if (!chatId || !isVisibleChatId(chatId)) return new Set();

        let labels = this.getCachedChatMeta(chatId)?.labels;
        if (!Array.isArray(labels)) {
            const hydrated = await this.hydrateChatMeta(chat);
            labels = hydrated?.labels || [];
        }

        return toLabelTokenSet(labels);
    }

    async applyAdvancedChatFilters(chats = [], filters = {}) {
        if (!Array.isArray(chats) || chats.length === 0) return [];

        const selectedTokens = normalizeFilterTokens(filters?.labelTokens);
        const unreadOnly = Boolean(filters?.unreadOnly);
        const unlabeledOnly = Boolean(filters?.unlabeledOnly);
        const contactMode = ['all', 'my', 'unknown'].includes(String(filters?.contactMode || 'all'))
            ? String(filters?.contactMode || 'all')
            : 'all';
        const archivedMode = ['all', 'archived', 'active'].includes(String(filters?.archivedMode || 'all'))
            ? String(filters?.archivedMode || 'all')
            : 'all';

        const needsLabelFiltering = unlabeledOnly || selectedTokens.length > 0;
        if (!unreadOnly && !needsLabelFiltering && contactMode === 'all' && archivedMode === 'all') return chats;

        const included = new Array(chats.length).fill(false);
        const labelConcurrency = Math.max(2, Number(process.env.LABEL_FILTER_CONCURRENCY || 10));

        await runWithConcurrency(chats, labelConcurrency, async (chat, idx) => {
            const unreadCount = Number(chat?.unreadCount || 0);
            if (unreadOnly && unreadCount <= 0) return;

            const isMyContact = Boolean(chat?.contact?.isMyContact);
            if (contactMode === 'my' && !isMyContact) return;
            if (contactMode === 'unknown' && isMyContact) return;
            const isArchived = Boolean(chat?.archived);
            if (archivedMode === 'archived' && !isArchived) return;
            if (archivedMode === 'active' && isArchived) return;

            if (needsLabelFiltering) {
                const labelTokenSet = await this.getChatLabelTokenSet(chat);
                const hasAnyLabel = labelTokenSet.size > 0;
                if (unlabeledOnly && hasAnyLabel) return;
                if (!unlabeledOnly && selectedTokens.length > 0 && !matchesTokenSet(labelTokenSet, selectedTokens)) {
                    return;
                }
            }

            included[idx] = true;
        });

        return chats.filter((_, idx) => included[idx]);
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

        let contact = chat?.contact || null;
        const isGroup = String(chatId || '').endsWith('@g.us');
        const shouldHydrateContact = !isGroup && (!extractPhoneFromChat(chat) || isLidIdentifier(chatId));
        if (shouldHydrateContact) {
            try {
                const hydratedContact = await waClient.client.getContactById(chatId);
                if (hydratedContact) {
                    contact = {
                        ...(chat?.contact || {}),
                        ...hydratedContact
                    };
                }
            } catch (e) { }
        }

        const effectiveChat = { ...chat, contact };
        const phone = isGroup ? null : extractPhoneFromChat(effectiveChat);
        const subtitle = contact?.pushname || contact?.shortName || contact?.name || null;

        return {
            id: chatId,
            name: resolveChatDisplayName(effectiveChat),
            phone,
            subtitle,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            lastMessage: resolveLastMessagePreview(chat),
            lastMessageFromMe: chat.lastMessage ? chat.lastMessage.fromMe : false,
            ack: chat.lastMessage ? chat.lastMessage.ack : 0,
            labels,
            profilePicUrl,
            isMyContact: Boolean(contact?.isMyContact),
            archived: Boolean(chat?.archived)
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
            this.emitWaCapabilities(socket);

            socket.on('get_wa_capabilities', () => {
                this.emitWaCapabilities(socket);
            });

            // --- Chat info ---
            socket.on('get_chats', async (payload = {}) => {
                try {
                    const rawOffset = Number(payload?.offset ?? 0);
                    const rawLimit = Number(payload?.limit ?? 80);
                    const reset = Boolean(payload?.reset);
                    const query = String(payload?.query || '').trim();
                    const filterKey = String(payload?.filterKey || '').trim();
                    const incomingFilters = payload?.filters || {};
                    const queryLower = query.toLowerCase();
                    const queryDigits = normalizePhoneDigits(query);
                    const activeFilters = {
                        labelTokens: normalizeFilterTokens(incomingFilters?.labelTokens),
                        unreadOnly: Boolean(incomingFilters?.unreadOnly),
                        unlabeledOnly: Boolean(incomingFilters?.unlabeledOnly),
                        contactMode: ['all', 'my', 'unknown'].includes(String(incomingFilters?.contactMode || 'all'))
                            ? String(incomingFilters?.contactMode || 'all')
                            : 'all',
                        archivedMode: ['all', 'archived', 'active'].includes(String(incomingFilters?.archivedMode || 'all'))
                            ? String(incomingFilters?.archivedMode || 'all')
                            : 'all'
                    };

                    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
                    const limit = Number.isFinite(rawLimit)
                        ? Math.min(250, Math.max(20, Math.floor(rawLimit)))
                        : 80;

                    const hasActiveFilters = activeFilters.unreadOnly || activeFilters.unlabeledOnly || activeFilters.contactMode !== 'all' || activeFilters.archivedMode !== 'all' || activeFilters.labelTokens.length > 0;
                    let sortedChats = await this.getSortedVisibleChats({ forceRefresh: reset || Boolean(query) || hasActiveFilters });
                    if (!queryLower && !reset && offset >= sortedChats.length) {
                        sortedChats = await this.getSortedVisibleChats({ forceRefresh: true });
                    }
                    let filtered = sortedChats;

                    if (queryLower) {
                        filtered = sortedChats.filter((c) => {
                            const name = resolveChatDisplayName(c).toLowerCase();
                            const lastMessage = String(c?.lastMessage?.body || '').toLowerCase();
                            const phone = normalizePhoneDigits(extractPhoneFromChat(c) || '');
                            const contact = c?.contact || {};
                            const subtitle = `${contact?.pushname || ''} ${contact?.name || ''} ${contact?.shortName || ''}`.toLowerCase();

                            if (queryDigits) {
                                return phone.includes(queryDigits);
                            }
                            return name.includes(queryLower) || lastMessage.includes(queryLower) || subtitle.includes(queryLower);
                        });
                    }

                    filtered = await this.applyAdvancedChatFilters(filtered, activeFilters);

                    const page = filtered.slice(offset, offset + limit);
                    const scannedCount = page.length;
                    const formatted = await Promise.all(page.map((c) => this.toChatSummary(c, { includeHeavyMeta: false })));

                    let items = formatted.filter(Boolean);
                    if (queryLower && offset === 0 && items.length < limit && !hasActiveFilters) {
                        const existingIds = new Set(items.map((it) => it.id));
                        const existingPhones = new Set(items.map((it) => normalizePhoneDigits(it.phone || '')).filter(Boolean));
                        const phoneToExistingChatId = new Map();
                        for (const chat of sortedChats) {
                            const phone = normalizePhoneDigits(extractPhoneFromChat(chat) || '');
                            const serializedId = chat?.id?._serialized;
                            if (!phone || !serializedId || phoneToExistingChatId.has(phone)) continue;
                            phoneToExistingChatId.set(phone, serializedId);
                        }

                        const contacts = await this.getSearchableContacts();
                        const contactMatches = contacts
                            .map((c) => {
                                const phone = normalizePhoneDigits(c?.phone || '');
                                const canonicalId = phone ? phoneToExistingChatId.get(phone) : null;
                                return canonicalId ? { ...c, id: canonicalId } : c;
                            })
                            .filter((c) => {
                                if (!c?.id || existingIds.has(c.id)) return false;
                                const contactPhone = normalizePhoneDigits(c.phone || '');
                                if (contactPhone && existingPhones.has(contactPhone)) return false;
                                const name = String(c.name || '').toLowerCase();
                                const subtitle = String(c.subtitle || '').toLowerCase();
                                const phone = normalizePhoneDigits(c.phone || '');
                                if (queryDigits) return phone.includes(queryDigits);
                                return name.includes(queryLower) || subtitle.includes(queryLower);
                            });

                        const remaining = Math.max(0, limit - items.length);
                        items = [...items, ...contactMatches.slice(0, remaining)];
                    }
                    if (queryDigits && offset === 0 && items.length === 0 && !hasActiveFilters) {
                        const registeredUser = await resolveRegisteredNumber(waClient.client, queryDigits);
                        if (registeredUser) {
                            const normalizedRegistered = normalizePhoneDigits(registeredUser);
                            let canonicalChatId = `${registeredUser}@c.us`;

                            const existingChat = sortedChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === normalizedRegistered);
                            if (existingChat?.id?._serialized) {
                                canonicalChatId = existingChat.id._serialized;
                            }

                            try {
                                const chat = await waClient.client.getChatById(canonicalChatId);
                                const summary = await this.toChatSummary(chat, { includeHeavyMeta: true });
                                if (summary) items = [summary];
                            } catch (e) {
                                items = [{
                                    id: canonicalChatId,
                                    name: `+${registeredUser}`,
                                    phone: registeredUser,
                                    subtitle: null,
                                    unreadCount: 0,
                                    timestamp: 0,
                                    lastMessage: '',
                                    lastMessageFromMe: false,
                                    ack: 0,
                                    labels: [],
                                    profilePicUrl: null,
                                    isMyContact: false
                                }];
                            }
                        }
                    }

                    const dedupMap = new Map();
                    for (const item of items) {
                        if (!item) continue;
                        const key = buildChatIdentityKeyFromSummary(item);
                        if (!dedupMap.has(key)) {
                            dedupMap.set(key, item);
                            continue;
                        }

                        const prevItem = dedupMap.get(key);
                        dedupMap.set(key, pickPreferredSummary(prevItem, item));
                    }
                    items = Array.from(dedupMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                    const nextOffset = offset + scannedCount;
                    const total = filtered.length;
                    const hasMore = nextOffset < total;
                    socket.emit('chats', {
                        items,
                        offset,
                        limit,
                        total,
                        hasMore,
                        nextOffset,
                        query,
                        filters: activeFilters,
                        filterKey
                    });

                    // Hydrate photos/labels progressively in background to keep first paint fast.
                    const pendingMetaChats = page
                        .filter((chat) => {
                            const chatId = String(chat?.id?._serialized || '');
                            if (!chatId || !isVisibleChatId(chatId)) return false;
                            const cached = this.getCachedChatMeta(chatId);
                            if (!cached) return true;
                            return !cached.profilePicUrl || !Array.isArray(cached.labels);
                        })
                        .slice(0, 24);

                    if (pendingMetaChats.length > 0) {
                        setImmediate(async () => {
                            for (const chat of pendingMetaChats) {
                                try {
                                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: true });
                                    if (summary) socket.emit('chat_updated', summary);
                                } catch (_) { }
                            }
                        });
                    }
                } catch (e) {
                    console.error('Error fetching chats:', e);
                }
            });

            socket.on('get_chat_history', async (chatId) => {
                try {
                    let historyChatId = String(chatId || '');
                    let messages = [];
                    try {
                        messages = await waClient.getMessages(historyChatId, 30);
                    } catch (directErr) {
                        const requestedDigits = normalizePhoneDigits(historyChatId.split('@')[0] || '');
                        if (requestedDigits) {
                            const visibleChats = await this.getSortedVisibleChats({ forceRefresh: true });
                            const byPhone = visibleChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === requestedDigits);
                            if (byPhone?.id?._serialized) {
                                historyChatId = byPhone.id._serialized;
                                messages = await waClient.getMessages(historyChatId, 30);
                            } else {
                                throw directErr;
                            }
                        } else {
                            throw directErr;
                        }
                    }
                    const visible = messages.filter((m) => !isStatusOrSystemMessage(m));
                    const outgoingIds = visible
                        .filter((m) => Boolean(m?.fromMe))
                        .map((m) => String(m?.id?._serialized || ''))
                        .filter(Boolean);
                    const editableMap = outgoingIds.length > 0
                        ? await waClient.getMessagesEditability(outgoingIds)
                        : {};

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
                        ack: Number.isFinite(Number(m.ack)) ? Number(m.ack) : 0,
                        edited: Boolean(m?._data?.latestEditMsgKey || m?._data?.latestEditSenderTimestampMs || m?._data?.edited),
                        editedAt: Number(m?._data?.latestEditSenderTimestampMs || 0) > 0 ? Math.floor(Number(m._data.latestEditSenderTimestampMs) / 1000) : null,

                        canEdit: Boolean(editableMap[String(m?.id?._serialized || '')]),
                        order: extractOrderInfo(m)
                    }));
                    socket.emit('chat_history', { chatId: historyChatId, requestedChatId: chatId, messages: formatted });

                    // Avoid blocking chat open while media is downloaded/cached.
                    visible
                        .filter((m) => m.hasMedia)
                        .slice(-12)
                        .forEach(async (m) => {
                            try {
                                const media = await mediaManager.processMessageMedia(m);
                                if (!media) return;
                                socket.emit('chat_media', {
                                    chatId: historyChatId,
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
                    const clean = normalizePhoneDigits(phone);
                    if (!clean) {
                        socket.emit('start_new_chat_error', 'Numero invalido.');
                        return;
                    }

                    const registeredUser = await resolveRegisteredNumber(waClient.client, clean);
                    if (!registeredUser) {
                        socket.emit('start_new_chat_error', 'El numero no esta registrado en WhatsApp.');
                        return;
                    }

                    const normalizedRegistered = normalizePhoneDigits(registeredUser);
                    const directChatId = `${registeredUser}@c.us`;
                    let canonicalChatId = directChatId;

                    try {
                        const visibleChats = await this.getSortedVisibleChats({ forceRefresh: true });
                        const existingChat = visibleChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === normalizedRegistered);
                        if (existingChat?.id?._serialized) {
                            canonicalChatId = existingChat.id._serialized;
                        }
                    } catch (e) { }

                    if (firstMessage && String(firstMessage).trim()) {
                        await waClient.sendMessage(directChatId, String(firstMessage).trim());
                    }

                    try {
                        const chat = await waClient.client.getChatById(canonicalChatId);
                        const summary = await this.toChatSummary(chat, { includeHeavyMeta: true });
                        if (summary) {
                            canonicalChatId = summary.id || canonicalChatId;
                            this.io.emit('chat_updated', summary);
                        }
                    } catch (e) {
                        try {
                            const fallbackChat = await waClient.client.getChatById(directChatId);
                            const fallbackSummary = await this.toChatSummary(fallbackChat, { includeHeavyMeta: true });
                            if (fallbackSummary) {
                                canonicalChatId = fallbackSummary.id || directChatId;
                                this.io.emit('chat_updated', fallbackSummary);
                            }
                        } catch (fallbackErr) { }
                    }

                    socket.emit('chat_opened', { chatId: canonicalChatId, phone: registeredUser });
                } catch (e) {
                    console.error('start_new_chat error:', e.message);
                    socket.emit('start_new_chat_error', 'No se pudo iniciar el chat.');
                }
            });

            socket.on('set_chat_labels', async ({ chatId, labelIds }) => {
                try {
                    if (!chatId) {
                        socket.emit('chat_labels_error', 'Chat invalido para etiquetar.');
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
                    const cachedMeta = this.getCachedChatMeta(chatId) || {};
                    this.chatMetaCache.set(String(chatId), {
                        labels: payload.labels,
                        profilePicUrl: cachedMeta.profilePicUrl || null,
                        updatedAt: Date.now()
                    });
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
                        socket.emit('chat_labels_error', 'Nombre de etiqueta invalido.');
                        return;
                    }
                    socket.emit('chat_labels_error', 'WhatsApp Web no permite crear etiquetas por API en esta version. Creala en WhatsApp y aqui se sincronizara al recargar.');
                } catch (e) {
                    console.error('create_label error:', e.message);
                    socket.emit('chat_labels_error', 'No se pudo crear la etiqueta.');
                }
            });
            socket.on('get_quick_replies', async () => {
                try {

                    const caps = this.getWaCapabilities();
                    if (!caps.quickRepliesRead || typeof waClient.client?.getQuickReplies !== 'function') {
                        socket.emit('quick_replies', { items: [], source: 'unsupported' });
                        return;
                    }
                    const nativeItems = await waClient.client.getQuickReplies();
                    socket.emit('quick_replies', { items: Array.isArray(nativeItems) ? nativeItems : [], source: 'native' });
                } catch (e) {
                    socket.emit('quick_reply_error', 'No se pudieron cargar las respuestas rapidas nativas.');
                }
            });

            socket.on('add_quick_reply', async () => {
                socket.emit('quick_reply_error', 'WhatsApp Web no expone crear respuestas rapidas por API en esta version.');
            });

            socket.on('update_quick_reply', async () => {
                socket.emit('quick_reply_error', 'WhatsApp Web no expone editar respuestas rapidas por API en esta version.');
            });

            socket.on('delete_quick_reply', async () => {
                socket.emit('quick_reply_error', 'WhatsApp Web no expone eliminar respuestas rapidas por API en esta version.');
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

            socket.on('edit_message', async ({ chatId, messageId, body }) => {
                if (!guardRateLimit(socket, 'edit_message')) return;
                try {
                    const targetChatId = String(chatId || '').trim();
                    const targetMessageId = String(messageId || '').trim();
                    const nextBody = String(body || '').trim();

                    if (!targetChatId || !targetMessageId || !nextBody) {
                        socket.emit('edit_message_error', 'Datos invalidos para editar el mensaje.');
                        return;
                    }

                    const chat = await waClient.client.getChatById(targetChatId);
                    const candidates = await chat.fetchMessages({ limit: 150 });
                    const targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId);
                    if (!targetMessage) {
                        socket.emit('edit_message_error', 'No se encontro el mensaje para editar.');
                        return;
                    }

                    if (!targetMessage.fromMe) {
                        socket.emit('edit_message_error', 'Solo puedes editar mensajes enviados por ti.');
                        return;
                    }

                    if (typeof targetMessage.edit !== 'function') {
                        socket.emit('edit_message_error', 'Esta version de WhatsApp Web no permite editar mensajes por API.');
                        return;
                    }


                    const canEditNow = await waClient.canEditMessageById(targetMessageId);
                    if (!canEditNow) {
                        socket.emit('edit_message_error', 'WhatsApp no permite editar este mensaje (tipo o tiempo).');
                        return;
                    }

                    const editedMessage = await targetMessage.edit(nextBody);
                    if (!editedMessage) {
                        socket.emit('edit_message_error', 'WhatsApp no permitio editar el mensaje.');
                        return;
                    }

                    this.emitMessageEditability(targetMessageId, targetChatId);
                } catch (e) {
                    const detail = String(e?.message || '').toLowerCase();
                    if (detail.includes('revoke') || detail.includes('time') || detail.includes('edit')) {
                        socket.emit('edit_message_error', 'No se pudo editar: WhatsApp puede limitar la edicion por tiempo.');
                    } else {
                        socket.emit('edit_message_error', 'No se pudo editar el mensaje.');
                    }
                }
            });
            socket.on('send_media_message', async (data) => {
                if (!guardRateLimit(socket, 'send_media_message')) return;
                try {
                    const { to, body, mediaData, mimetype, filename, isPtt } = data;
                    if (isPtt) {
                        socket.emit('error', 'El envio de notas de voz esta deshabilitado temporalmente.');
                        return;
                    }
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
                    let meContact = null;
                    let profilePicUrl = null;
                    let businessProfile = null;
                    let aboutStatus = null;
                    try {
                        if (meId) meContact = await waClient.client.getContactById(meId);
                    } catch (e) { }
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                            me?.wid?.user,
                            meContact?.id?._serialized,
                            meContact?.number
                        ]);
                    } catch (e) { }
                    try { businessProfile = await waClient.getBusinessProfile(meId); } catch (e) { }
                    try {
                        if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(meContact);
                    const profile = {
                        name: me?.pushname || meContact?.name || meContact?.pushname || 'Mi Negocio',
                        pushname: me?.pushname || meContact?.pushname || null,
                        shortName: meContact?.shortName || null,
                        verifiedName: meContact?._data?.verifiedName || null,
                        verifiedLevel: meContact?._data?.verifiedLevel || null,
                        phone: me?.wid?.user || meContact?.number || null,
                        id: meId || null,
                        platform: me?.platform || null,
                        isBusiness: Boolean(meContact?.isBusiness ?? true),
                        isEnterprise: Boolean(meContact?.isEnterprise),
                        isMyContact: Boolean(meContact?.isMyContact),
                        isMe: Boolean(meContact?.isMe ?? true),
                        isWAContact: Boolean(meContact?.isWAContact ?? true),
                        status: aboutStatus || null,
                        profilePicUrl,
                        businessHours: businessDetails?.businessHours || null,
                        category: businessDetails?.category || null,
                        email: businessDetails?.email || null,
                        website: businessDetails?.website || null,
                        websites: businessDetails?.websites || [],
                        address: businessDetails?.address || null,
                        description: businessDetails?.description || null,
                        businessDetails,
                        whatsappInfo: snapshotSerializable(me),
                        contactSnapshot
                    };

                    // Real labels from WA
                    let labels = [];
                    try {
                        const raw = await waClient.getLabels();
                        labels = raw.map(l => ({ id: l.id, name: l.name, color: l.color }));
                        profile.labelsCount = labels.length;
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
                                price: p.price ? Number.parseFloat(String(p.price)).toFixed(2) : '0.00',
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
                    const me = waClient.client.info || {};
                    const meId = me?.wid?._serialized || null;
                    let meContact = null;
                    let profilePicUrl = null;
                    let businessProfile = null;
                    let aboutStatus = null;

                    try {
                        if (meId) meContact = await waClient.client.getContactById(meId);
                    } catch (e) { }
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                            me?.wid?.user,
                            meContact?.id?._serialized,
                            meContact?.number
                        ]);
                    } catch (e) { }
                    try {
                        businessProfile = await waClient.getBusinessProfile(meId);
                    } catch (e) { }
                    try {
                        if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(meContact);

                    socket.emit('my_profile', {
                        name: me?.pushname || meContact?.name || meContact?.pushname || null,
                        pushname: me?.pushname || meContact?.pushname || null,
                        shortName: meContact?.shortName || null,
                        verifiedName: meContact?._data?.verifiedName || null,
                        verifiedLevel: meContact?._data?.verifiedLevel || null,
                        phone: me?.wid?.user || meContact?.number || null,
                        id: meId,
                        platform: me?.platform || null,
                        profilePicUrl,
                        status: aboutStatus || null,
                        isBusiness: Boolean(meContact?.isBusiness ?? true),
                        isEnterprise: Boolean(meContact?.isEnterprise),
                        isMyContact: Boolean(meContact?.isMyContact),
                        isMe: Boolean(meContact?.isMe ?? true),
                        isWAContact: Boolean(meContact?.isWAContact ?? true),
                        category: businessDetails?.category || null,
                        email: businessDetails?.email || null,
                        website: businessDetails?.website || null,
                        websites: businessDetails?.websites || [],
                        address: businessDetails?.address || null,
                        description: businessDetails?.description || null,
                        businessHours: businessDetails?.businessHours || null,
                        businessDetails,
                        whatsappInfo: snapshotSerializable(me),
                        contactSnapshot
                    });
                } catch (e) {
                    console.error('Error fetching my profile:', e);
                }
            });

            socket.on('get_contact_info', async (contactId) => {
                try {
                    const safeContactId = String(contactId || '').trim();
                    if (!safeContactId) return;

                    const contact = await waClient.client.getContactById(safeContactId);
                    let chat = null;
                    let profilePicUrl = null;
                    let status = null;
                    let businessProfile = null;

                    try {
                        chat = await waClient.client.getChatById(safeContactId);
                    } catch (e) { }

                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, safeContactId, [
                            contact?.id?._serialized,
                            contact?.number,
                            contact?.number ? `${contact.number}@c.us` : null,
                            chat?.id?._serialized,
                            chat?.contact?.id?._serialized
                        ]);
                    } catch (e) { }
                    try {
                        const statusObj = await contact.getAbout();
                        status = statusObj;
                    } catch (e) { }
                    try {
                        if (contact?.isBusiness) {
                            businessProfile = await waClient.getBusinessProfile(safeContactId);
                        }
                    } catch (e) { }

                    let labels = [];
                    try {
                        const chatRef = chat || await waClient.client.getChatById(safeContactId);
                        const chatLabels = await chatRef.getLabels();
                        labels = chatLabels.map((l) => ({ id: l.id, name: l.name, color: l.color }));
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(contact);
                    const chatSnapshot = extractChatSnapshot(chat);

                    socket.emit('contact_info', {
                        id: safeContactId,
                        name: contact?.name || contact?.pushname || contact?.number || null,
                        phone: contact?.number || null,
                        number: contact?.number || null,
                        user: contact?.id?.user || null,
                        server: contact?.id?.server || null,
                        pushname: contact?.pushname || null,
                        shortName: contact?.shortName || null,
                        verifiedName: contact?._data?.verifiedName || null,
                        verifiedLevel: contact?._data?.verifiedLevel || null,
                        profilePicUrl,
                        hasProfilePic: Boolean(profilePicUrl),
                        status,
                        isBusiness: Boolean(contact?.isBusiness),
                        isEnterprise: Boolean(contact?.isEnterprise),
                        isMyContact: Boolean(contact?.isMyContact),
                        isWAContact: Boolean(contact?.isWAContact),
                        isBlocked: Boolean(contact?.isBlocked),
                        isMe: Boolean(contact?.isMe),
                        isUser: Boolean(contact?.isUser),
                        isGroup: safeContactId.includes('@g.us') || Boolean(contact?.isGroup),
                        isPSA: Boolean(contact?.isPSA),
                        labels,
                        chatState: chatSnapshot,
                        businessDetails,
                        contactSnapshot,
                        raw: {
                            contact: contactSnapshot?.rawData || null,
                            chat: chatSnapshot?.rawData || null,
                            business: businessDetails?.raw || null
                        }
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
        waClient.on('ready', () => {
            this.io.emit('ready', { message: 'WhatsApp Ready' });
            this.io.emit('wa_capabilities', this.getWaCapabilities());

            this.io.emit('wa_runtime', this.getWaRuntime());
        });
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
                canEdit: false,
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
            // Emite de vuelta para confirmar en UI si se envio desde otro lugar
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
                canEdit: false,
                order: extractOrderInfo(msg)
            });

            this.emitMessageEditability(msg.id._serialized, msg.to || msg.from);
            this.scheduleEditabilityRefresh(msg.id._serialized, msg.to || msg.from);

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

        waClient.on('message_edit', async ({ message, newBody, prevBody }) => {
            if (!message || isStatusOrSystemMessage(message)) return;
            const chatId = message.fromMe ? message.to : message.from;
            if (!isVisibleChatId(chatId)) return;

            const messageId = message?.id?._serialized;
            if (!messageId) return;

            let canEdit = false;
            try {
                canEdit = await waClient.canEditMessageById(messageId);
            } catch (e) { }

            const editedAtMs = Number(message?.latestEditSenderTimestampMs || message?._data?.latestEditSenderTimestampMs || 0);
            const editedAt = editedAtMs > 0 ? Math.floor(editedAtMs / 1000) : Math.floor(Date.now() / 1000);

            this.io.emit('message_edited', {
                chatId,
                messageId,
                body: String(newBody ?? message.body ?? ''),
                prevBody: String(prevBody ?? ''),
                edited: true,
                editedAt,
                fromMe: Boolean(message.fromMe),
                canEdit
            });

            try {
                this.invalidateChatListCache();
                const refreshedChat = await waClient.client.getChatById(chatId);
                const summary = await this.toChatSummary(refreshedChat, { includeHeavyMeta: false });
                if (summary) this.io.emit('chat_updated', summary);
            } catch (e) { }
        });

        waClient.on('message_ack', async ({ message, ack }) => {
            const messageId = message?.id?._serialized;
            const chatId = message?.to || message?.from || '';
            const isFromMe = Boolean(message?.fromMe);

            let canEdit;
            if (isFromMe && messageId) {
                try {
                    canEdit = await waClient.canEditMessageById(messageId);
                } catch (e) { }
            }

            this.io.emit('message_ack', {
                id: messageId,
                chatId,
                ack: ack,
                canEdit
            });

            if (isFromMe && messageId) {
                this.scheduleEditabilityRefresh(messageId, chatId, [900, 2600]);
            }
        });
    }
}


module.exports = SocketManager;








