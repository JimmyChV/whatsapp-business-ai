const { coerceHumanPhone, isLidIdentifier } = require('./chat-scope.helpers');

function toText(value = '') {
    return String(value ?? '').trim();
}

function toTitleCase(value = '') {
    return toText(value)
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function isBusinessCustomer(customer = null) {
    if (!customer || typeof customer !== 'object') return false;
    const documentType = toText(customer.documentType || customer.document_type).toUpperCase();
    const customerType = toText(customer.customerType || customer.customer_type).toUpperCase();
    const taxId = toText(customer.taxId || customer.tax_id || customer.documentNumber || customer.document_number);
    return documentType === 'RUC' || customerType.includes('JURIDICA') || taxId.length === 11;
}

function getPrimaryCustomerAddress(customer = null) {
    const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
    return addresses.find((entry) => entry?.isPrimary === true || entry?.is_primary === true) || addresses[0] || null;
}

function buildPrimaryLocationLabel(customer = null) {
    const address = getPrimaryCustomerAddress(customer);
    if (!address || typeof address !== 'object') return '';
    const districtName = toTitleCase(address.districtName || address.district_name);
    const provinceName = toTitleCase(address.provinceName || address.province_name);
    return [districtName, provinceName].filter(Boolean).join(' - ');
}

function buildErpCustomerDisplayName(customer = null) {
    if (!customer || typeof customer !== 'object') return '';

    if (isBusinessCustomer(customer)) {
        const businessName = toTitleCase(customer.lastNamePaternal || customer.last_name_paternal);
        if (businessName) return businessName;
    } else {
        const fullName = [
            toTitleCase(customer.firstName || customer.first_name),
            toTitleCase(customer.lastNamePaternal || customer.last_name_paternal),
            toTitleCase(customer.lastNameMaternal || customer.last_name_maternal)
        ].filter(Boolean).join(' ');
        if (fullName) return fullName;
    }

    return toTitleCase(customer.contactName || customer.contact_name);
}

function resolveChatSubtitle(chat) {
    const contact = chat?.contact || null;
    const erpCustomer = chat?.erpCustomer && typeof chat.erpCustomer === 'object' ? chat.erpCustomer : null;
    const primaryName = toText(resolveChatDisplayName(chat));
    const whatsappContactName = toTitleCase(contact?.pushname || contact?.name || contact?.shortName || '');
    const locationLabel = buildPrimaryLocationLabel(erpCustomer);
    const subtitleParts = [];

    if (whatsappContactName && whatsappContactName.toLowerCase() !== primaryName.toLowerCase()) {
        subtitleParts.push(whatsappContactName);
    }
    if (locationLabel) {
        subtitleParts.push(locationLabel);
    }

    return subtitleParts.join(' • ') || whatsappContactName || locationLabel || null;
}

function resolveChatDisplayName(chat) {
    if (!chat) return 'Sin nombre';

    const contact = chat.contact || null;
    const chatId = String(chat?.id?._serialized || '');
    const erpCustomer = chat?.erpCustomer && typeof chat.erpCustomer === 'object' ? chat.erpCustomer : null;
    const candidates = [
        buildErpCustomerDisplayName(erpCustomer),
        toTitleCase(chat.name || ''),
        toTitleCase(chat.formattedTitle || ''),
        toTitleCase(contact?.name || ''),
        toTitleCase(contact?.pushname || ''),
        toTitleCase(contact?.shortName || ''),
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
        } catch (e) {}
    }

    for (const candidate of candidates) {
        try {
            const contact = await client.getContactById(candidate);
            if (contact?.getProfilePicUrl) {
                const fromContact = await contact.getProfilePicUrl();
                if (fromContact) return fromContact;
            }
        } catch (e) {}
    }

    for (const candidate of candidates) {
        try {
            const chat = await client.getChatById(candidate);
            if (chat?.contact?.getProfilePicUrl) {
                const fromChatContact = await chat.contact.getProfilePicUrl();
                if (fromChatContact) return fromChatContact;
            }
        } catch (e) {}
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
        timestamp: Number(chat?.timestamp || 0) || null,
        archived: Boolean(chat?.archived),
        unreadCount: Number(chat?.unreadCount || 0) || 0,
        isGroup: Boolean(chat?.isGroup),
        isMuted: Boolean(chat?.isMuted),
        name: chat?.name || null,
        formattedTitle: chat?.formattedTitle || null,
        rawData: snapshotSerializable(chat?._data || null)
    };
}

function toParticipantArray(rawParticipants) {
    if (!rawParticipants) return [];
    if (Array.isArray(rawParticipants)) return rawParticipants;
    if (typeof rawParticipants.values === 'function') {
        try {
            return Array.from(rawParticipants.values());
        } catch (e) {
            return [];
        }
    }
    return [];
}

function normalizeGroupParticipant(participant = {}) {
    if (!participant || typeof participant !== 'object') return null;

    const id = participant?.id?._serialized
        || participant?.id
        || participant?.wid?._serialized
        || participant?.wid
        || '';
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;

    const directPhone = coerceHumanPhone(participant?.phone || participant?.id?.user || normalizedId.split('@')[0] || '');
    const fallbackName = String(participant?.name || participant?.pushname || participant?.shortName || '').trim();
    const isAdmin = Boolean(participant?.isAdmin || participant?.admin || participant?.isSuperAdmin);
    const isSuperAdmin = Boolean(participant?.isSuperAdmin || participant?.superAdmin);

    return {
        id: normalizedId,
        user: String(participant?.id?.user || normalizedId.split('@')[0] || '').trim() || null,
        phone: directPhone || null,
        name: fallbackName || null,
        isAdmin,
        isSuperAdmin,
        raw: snapshotSerializable(participant)
    };
}

function isInternalLikeName(value = '') {
    const text = String(value || '').trim();
    if (!text) return true;
    return text.includes('@') || /^\d{14,}$/.test(text);
}

module.exports = {
    buildErpCustomerDisplayName,
    buildPrimaryLocationLabel,
    resolveChatDisplayName,
    resolveChatSubtitle,
    buildProfilePicCandidates,
    resolveProfilePic,
    truncateDisplayValue,
    snapshotSerializable,
    normalizeBusinessDetailsSnapshot,
    extractContactSnapshot,
    extractChatSnapshot,
    toParticipantArray,
    normalizeGroupParticipant,
    isInternalLikeName
};
