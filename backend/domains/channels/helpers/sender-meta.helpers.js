function createSenderMetaHelpers({
    env = {},
    waClient,
    coerceHumanPhone,
    isInternalLikeName,
    toParticipantArray,
    normalizeGroupParticipant
} = {}) {
    const senderMetaTtlMs = Math.max(60 * 1000, Number(env.SENDER_META_TTL_MS || (10 * 60 * 1000)));
    const senderMetaCache = new Map();
    const groupParticipantContactTtlMs = Math.max(
        5 * 60 * 1000,
        Number(env.GROUP_PARTICIPANT_CONTACT_TTL_MS || (30 * 60 * 1000))
    );
    const groupParticipantContactCache = new Map();

    function getGroupParticipantContactCache(key = '') {
        const safeKey = String(key || '').trim();
        if (!safeKey) return null;
        const hit = groupParticipantContactCache.get(safeKey);
        if (!hit) return null;
        if (Date.now() - Number(hit.updatedAt || 0) > groupParticipantContactTtlMs) {
            groupParticipantContactCache.delete(safeKey);
            return null;
        }
        return hit.value || null;
    }

    function setGroupParticipantContactCache(keys = [], value = null) {
        const payload = value && typeof value === 'object' ? value : null;
        if (!payload) return;
        const now = Date.now();
        keys.forEach((key) => {
            const safeKey = String(key || '').trim();
            if (!safeKey) return;
            groupParticipantContactCache.set(safeKey, { value: payload, updatedAt: now });
        });
    }

    async function resolveGroupParticipantContact(client, participant = {}) {
        const participantId = String(participant?.id || '').trim();
        const phone = coerceHumanPhone(participant?.phone || participantId.split('@')[0] || '');

        const cacheKeys = [
            participantId,
            phone ? `phone:${phone}` : ''
        ].filter(Boolean);

        for (const key of cacheKeys) {
            const cached = getGroupParticipantContactCache(key);
            if (cached) return cached;
        }

        if (!client?.getContactById) return null;

        const candidateIds = [
            participantId,
            phone ? `${phone}@c.us` : '',
            phone ? `${phone}@s.whatsapp.net` : '',
            phone ? `${phone}@lid` : ''
        ].filter(Boolean);

        const tried = new Set();
        for (const candidateId of candidateIds) {
            if (tried.has(candidateId)) continue;
            tried.add(candidateId);

            try {
                const contact = await client.getContactById(candidateId);
                const raw = contact?._data || {};
                const resolved = {
                    name: String(contact?.name || contact?.pushname || contact?.shortName || raw?.verifiedName || '').trim() || null,
                    pushname: String(contact?.pushname || raw?.notifyName || '').trim() || null,
                    shortName: String(contact?.shortName || '').trim() || null,
                    phone: coerceHumanPhone(contact?.number || raw?.userid || phone || '') || phone || null
                };

                setGroupParticipantContactCache([...cacheKeys, candidateId], resolved);
                return resolved;
            } catch (e) {}
        }

        return null;
    }

    async function hydrateGroupParticipantsWithContacts(client, participants = []) {
        if (!Array.isArray(participants) || participants.length === 0) return [];

        const hydrated = [];
        const maxItems = Math.min(participants.length, 256);
        for (let idx = 0; idx < maxItems; idx += 1) {
            const current = participants[idx];
            if (!current || typeof current !== 'object') continue;

            const next = { ...current };
            const hasUsefulName = Boolean(next.name && !isInternalLikeName(next.name));

            if (!hasUsefulName || !next.phone) {
                const resolved = await resolveGroupParticipantContact(client, next);
                if (resolved) {
                    const resolvedName = String(resolved.name || resolved.pushname || resolved.shortName || '').trim();
                    if (!hasUsefulName && resolvedName && !isInternalLikeName(resolvedName)) {
                        next.name = resolvedName;
                    }
                    next.pushname = resolved.pushname || next.pushname || null;
                    next.shortName = resolved.shortName || next.shortName || null;
                    if (!next.phone && resolved.phone) next.phone = resolved.phone;
                }
            }

            hydrated.push(next);
        }

        return hydrated;
    }

    function extractGroupParticipants(chat = null) {
        const participants = [];
        const seen = new Set();
        const sources = [
            chat?.participants,
            chat?.groupMetadata?.participants,
            chat?._data?.groupMetadata?.participants,
            chat?._data?.participants
        ];

        sources.forEach((source) => {
            const models = toParticipantArray(source);
            models.forEach((model) => {
                const normalized = normalizeGroupParticipant(model);
                if (!normalized || seen.has(normalized.id)) return;
                seen.add(normalized.id);
                participants.push(normalized);
            });
        });

        return participants;
    }

    async function fetchGroupParticipantsFromStore(client, groupId = '') {
        if (!client?.pupPage?.evaluate || !groupId) return [];
        try {
            const raw = await client.pupPage.evaluate(async (targetGroupId) => {
                try {
                    const widFactory = window.Store?.WidFactory;
                    const chatStore = window.Store?.Chat;
                    if (!widFactory || !chatStore) return [];

                    const groupWid = widFactory.createWid(targetGroupId);
                    const chat = chatStore.get(groupWid) || await chatStore.find(groupWid);
                    if (!chat) return [];

                    try {
                        const groupMetadataStore = window.Store?.GroupMetadata || window.Store?.WAWebGroupMetadataCollection;
                        if (groupMetadataStore?.update) {
                            await groupMetadataStore.update(groupWid);
                        }
                    } catch (e) {}

                    const participantsCollection = chat?.groupMetadata?.participants || [];
                    const models = Array.isArray(participantsCollection)
                        ? participantsCollection
                        : (participantsCollection?._models || participantsCollection?.models || []);

                    return models.map((participant) => ({
                        id: participant?.id?._serialized || participant?.id || null,
                        phone: participant?.id?.user || null,
                        name: participant?.formattedShortName || participant?.name || participant?.notify || participant?.pushname || null,
                        isAdmin: Boolean(participant?.isAdmin || participant?.isSuperAdmin || participant?.admin || participant?.superadmin),
                        isSuperAdmin: Boolean(participant?.isSuperAdmin || participant?.superadmin),
                        isMe: Boolean(participant?.isMe)
                    })).filter((entry) => Boolean(entry?.id));
                } catch (e) {
                    return [];
                }
            }, groupId);

            if (!Array.isArray(raw)) return [];
            return raw.map((participant) => normalizeGroupParticipant(participant)).filter(Boolean);
        } catch (e) {
            return [];
        }
    }

    function getSenderMetaCache(key = '') {
        const safeKey = String(key || '').trim();
        if (!safeKey) return null;
        const hit = senderMetaCache.get(safeKey);
        if (!hit) return null;
        if (Date.now() - Number(hit.updatedAt || 0) > senderMetaTtlMs) {
            senderMetaCache.delete(safeKey);
            return null;
        }
        return hit.value || null;
    }

    function setSenderMetaCache(keys = [], value = null) {
        const payload = value && typeof value === 'object' ? value : null;
        if (!payload) return;
        const now = Date.now();
        keys.forEach((key) => {
            const safeKey = String(key || '').trim();
            if (!safeKey) return;
            senderMetaCache.set(safeKey, { value: payload, updatedAt: now });
        });
    }

    async function resolveMessageSenderMeta(msg) {
        try {
            const base = {
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: false
            };
            if (!msg || msg.fromMe) return base;

            const fromId = String(msg?.from || '').trim();
            const authorId = String(msg?.author || msg?._data?.author || '').trim();
            const isGroupMessage = fromId.endsWith('@g.us');
            const senderId = String((isGroupMessage ? authorId : fromId) || '').trim() || null;
            const senderPhone = coerceHumanPhone(
                (senderId || '').split('@')[0]
                || authorId.split('@')[0]
                || fromId.split('@')[0]
                || msg?._data?.sender?.id?.user
                || ''
            );

            const cacheKeys = [
                senderId,
                senderPhone ? `phone:${senderPhone}` : '',
                fromId,
                authorId
            ].filter(Boolean);
            for (const key of cacheKeys) {
                const cached = getSenderMetaCache(key);
                if (cached) return { ...cached, isGroupMessage };
            }

            let notifyName = String(msg?._data?.notifyName || msg?._data?.senderObj?.pushname || '').trim() || null;
            let senderPushname = String(msg?._data?.senderObj?.pushname || '').trim() || null;

            const candidateIds = [
                senderId,
                authorId,
                senderPhone ? `${senderPhone}@c.us` : '',
                senderPhone ? `${senderPhone}@s.whatsapp.net` : '',
                senderPhone ? `${senderPhone}@lid` : ''
            ].filter(Boolean);

            const tried = new Set();
            for (const candidateId of candidateIds) {
                if (tried.has(candidateId)) continue;
                tried.add(candidateId);
                try {
                    const contact = await waClient.client.getContactById(candidateId);
                    const raw = contact?._data || {};
                    notifyName = String(contact?.name || contact?.pushname || contact?.shortName || raw?.verifiedName || notifyName || '').trim() || notifyName;
                    senderPushname = String(contact?.pushname || raw?.notifyName || senderPushname || '').trim() || senderPushname;
                    if (notifyName || senderPushname) break;
                } catch (e) {}
            }

            if (!notifyName) {
                try {
                    const fallbackContact = await msg.getContact();
                    notifyName = String(fallbackContact?.name || fallbackContact?.pushname || fallbackContact?.shortName || '').trim() || null;
                    senderPushname = String(fallbackContact?.pushname || senderPushname || '').trim() || senderPushname;
                } catch (e) {}
            }

            const resolved = {
                notifyName: notifyName || senderPushname || null,
                senderPhone: senderPhone || null,
                senderId,
                senderPushname: senderPushname || null,
                isGroupMessage
            };
            setSenderMetaCache(cacheKeys, resolved);
            return resolved;
        } catch (e) {
            return {
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: false
            };
        }
    }

    return {
        extractGroupParticipants,
        fetchGroupParticipantsFromStore,
        hydrateGroupParticipantsWithContacts,
        resolveMessageSenderMeta
    };
}

module.exports = {
    createSenderMetaHelpers
};
