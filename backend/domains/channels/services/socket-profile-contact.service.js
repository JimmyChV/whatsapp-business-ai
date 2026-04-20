function createSocketProfileContactService({
    waClient,
    tenantLabelService,
    customerService,
    customerAddressesService,
    messageHistoryService,
    resolveProfilePic,
    normalizeBusinessDetailsSnapshot,
    extractContactSnapshot,
    extractChatSnapshot,
    extractGroupParticipants,
    fetchGroupParticipantsFromStore,
    hydrateGroupParticipantsWithContacts,
    normalizeScopedModuleId,
    resolveScopedChatTarget,
    buildScopedChatId,
    snapshotSerializable
} = {}) {
    const MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

    const buildConversationWindowState = async (tenantId = 'default', chatId = '') => {
        const safeChatId = String(chatId || '').trim();
        if (!safeChatId || !messageHistoryService || typeof messageHistoryService.listMessages !== 'function') {
            return { windowOpen: false, windowExpiresAt: null };
        }
        try {
            const rows = await messageHistoryService.listMessages(tenantId, { chatId: safeChatId, limit: 100 });
            const lastInbound = (Array.isArray(rows) ? rows : []).find((message) => message?.fromMe === false);
            const lastInboundTs = Number(lastInbound?.timestampUnix || 0) || 0;
            if (!lastInboundTs) {
                return { windowOpen: false, windowExpiresAt: null };
            }
            const windowExpiresAtMs = (lastInboundTs * 1000) + MESSAGE_WINDOW_MS;
            return {
                windowOpen: windowExpiresAtMs > Date.now(),
                windowExpiresAt: new Date(windowExpiresAtMs).toISOString()
            };
        } catch (_) {
            return { windowOpen: false, windowExpiresAt: null };
        }
    };

    const registerProfileContactHandlers = ({
        socket,
        tenantId = 'default',
        transportOrchestrator
    } = {}) => {
        socket.on('get_my_profile', async () => {
            try {
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'cargar perfil de empresa', errorEvent: 'error' })) {
                    socket.emit('my_profile', null);
                    return;
                }
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
                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'cargar perfil de contacto', errorEvent: 'error' })) {
                    return;
                }
                const requestedContactId = String(contactId || '').trim();
                const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const scopedContactTarget = resolveScopedChatTarget(requestedContactId, selectedScopeModuleId);
                const safeContactId = String(scopedContactTarget.baseChatId || '').trim();
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
                    labels = await tenantLabelService.listChatLabels({
                        tenantId,
                        chatId: safeContactId,
                        scopeModuleId: String(scopedContactTarget?.moduleId || '').trim().toLowerCase(),
                        includeInactive: false
                    });
                } catch (e) { }

                let erpCustomer = null;
                try {
                    if (customerService && typeof customerService.getCustomerByPhoneWithAddresses === 'function') {
                        erpCustomer = await customerService.getCustomerByPhoneWithAddresses(tenantId, contact?.number || '', {
                            customerAddressesService
                        });
                    }
                } catch (e) { }

                const isGroupChat = safeContactId.includes('@g.us') || Boolean(contact?.isGroup) || Boolean(chat?.isGroup);
                let groupParticipants = [];
                if (isGroupChat) {
                    groupParticipants = await fetchGroupParticipantsFromStore(waClient.client, safeContactId);
                    if (groupParticipants.length === 0) {
                        groupParticipants = extractGroupParticipants(chat);
                    }
                    groupParticipants = await hydrateGroupParticipantsWithContacts(waClient.client, groupParticipants);
                }

                const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                const contactSnapshot = extractContactSnapshot(contact);
                const chatSnapshot = extractChatSnapshot(chat);
                const participantsCount = isGroupChat
                    ? (groupParticipants.length || Number(chatSnapshot?.participantsCount || 0) || 0)
                    : (chatSnapshot?.participantsCount ?? null);
                const hydratedChatSnapshot = chatSnapshot
                    ? { ...chatSnapshot, participantsCount }
                    : null;
                const conversationWindow = await buildConversationWindowState(tenantId, safeContactId);

                socket.emit('contact_info', {
                    id: scopedContactTarget.scopedChatId || buildScopedChatId(safeContactId, scopedContactTarget.moduleId || ''),
                    baseChatId: safeContactId,
                    scopeModuleId: scopedContactTarget.moduleId || null,
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
                    isGroup: isGroupChat,
                    isPSA: Boolean(contact?.isPSA),
                    participants: participantsCount,
                    participantsList: isGroupChat ? groupParticipants : [],
                    windowOpen: Boolean(conversationWindow?.windowOpen),
                    windowExpiresAt: conversationWindow?.windowExpiresAt || null,
                    labels,
                    erpCustomer,
                    chatState: hydratedChatSnapshot,
                    businessDetails,
                    contactSnapshot,
                    raw: {
                        contact: contactSnapshot?.rawData || null,
                        chat: hydratedChatSnapshot?.rawData || null,
                        business: businessDetails?.raw || null
                    }
                });
            } catch (e) {
                console.error('Error fetching contact info:', e);
            }
        });
    };

    return {
        registerProfileContactHandlers
    };
}

module.exports = {
    createSocketProfileContactService
};
