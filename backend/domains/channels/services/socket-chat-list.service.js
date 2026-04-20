function createSocketChatListService({
    runtimeStore,
    waClient,
    tenantLabelService,
    customerService,
    customerAddressesService,
    normalizeScopedModuleId,
    normalizePhoneDigits,
    normalizeFilterTokens,
    buildScopedChatId,
    buildChatIdentityKeyFromSummary,
    pickPreferredSummary,
    resolveChatDisplayName,
    resolveChatSubtitle,
    resolveLastMessagePreview,
    extractPhoneFromChat,
    isVisibleChatId,
    isLidIdentifier,
    resolveProfilePic,
    coerceHumanPhone,
    resolveRegisteredNumber,
    toLabelTokenSet,
    matchesTokenSet,
    runWithConcurrency,
    getWaRuntime
} = {}) {
    const invalidateChatListCache = () => {
        runtimeStore.set('chatListCache', { items: [], updatedAt: 0 });
    };

    const getSortedVisibleChats = async ({ forceRefresh = false } = {}) => {
        const chatListCache = runtimeStore.get('chatListCache', { items: [], updatedAt: 0 });
        const ttl = runtimeStore.get('ttl', {});
        const chatListTtlMs = Number(ttl?.chatListTtlMs || 15000);
        const cacheAge = Date.now() - (chatListCache?.updatedAt || 0);
        if (!forceRefresh && chatListCache.items.length > 0 && cacheAge <= chatListTtlMs) {
            return chatListCache.items;
        }

        let chats = [];
        try {
            chats = await waClient.getChats();
        } catch (error) {
            if (chatListCache.items.length > 0) {
                console.warn(`[WA] getChats failed; using cache (${chatListCache.items.length} chats).`, String(error?.message || error));
                return chatListCache.items;
            }
            throw error;
        }

        const sortedChats = [...chats]
            .filter((c) => isVisibleChatId(c?.id?._serialized))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        runtimeStore.set('chatListCache', {
            items: sortedChats,
            updatedAt: Date.now()
        });
        return sortedChats;
    };

    const getCachedChatMeta = (chatId) => {
        const key = String(chatId || '');
        const chatMetaCache = runtimeStore.get('chatMetaCache', new Map());
        const ttl = runtimeStore.get('ttl', {});
        const chatMetaTtlMs = Number(ttl?.chatMetaTtlMs || 10 * 60 * 1000);
        const cached = chatMetaCache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.updatedAt > chatMetaTtlMs) return null;
        return cached;
    };

    const hydrateChatMeta = async (chat) => {
        const chatId = chat?.id?._serialized;
        if (!chatId || !isVisibleChatId(chatId)) return { labels: [], profilePicUrl: null };

        const cached = getCachedChatMeta(chatId);
        if (cached) return { labels: Array.isArray(cached.labels) ? cached.labels : [], profilePicUrl: cached.profilePicUrl };

        let profilePicUrl = null;
        try { profilePicUrl = await resolveProfilePic(waClient.client, chatId); } catch (e) { }

        const normalized = {
            labels: [],
            profilePicUrl,
            updatedAt: Date.now()
        };
        const chatMetaCache = runtimeStore.get('chatMetaCache', new Map());
        chatMetaCache.set(chatId, normalized);
        runtimeStore.set('chatMetaCache', chatMetaCache);
        return normalized;
    };

    const getSearchableContacts = async ({ forceRefresh = false } = {}) => {
        const contactListCache = runtimeStore.get('contactListCache', { items: [], updatedAt: 0 });
        const ttl = runtimeStore.get('ttl', {});
        const contactListTtlMs = Number(ttl?.contactListTtlMs || 60 * 1000);
        const cacheAge = Date.now() - (contactListCache?.updatedAt || 0);
        if (!forceRefresh && contactListCache.items.length > 0 && cacheAge <= contactListTtlMs) {
            return contactListCache.items;
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

        runtimeStore.set('contactListCache', {
            items: deduped,
            updatedAt: Date.now()
        });
        return deduped;
    };

    const buildLabelMapKey = (chatId = '', scopeModuleId = '') => `${String(chatId || '')}::${normalizeScopedModuleId(scopeModuleId || '')}`;

    const listChatLabelsMapWithScopeFallback = async ({
        tenantId = 'default',
        chatIds = [],
        scopeModuleId = '',
        includeInactive = false
    } = {}) => {
        const safeTenantId = String(tenantId || 'default').trim() || 'default';
        const safeScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');
        const cleanChatIds = Array.from(new Set(
            (Array.isArray(chatIds) ? chatIds : [])
                .map((entry) => String(entry || '').trim())
                .filter((entry) => Boolean(entry) && isVisibleChatId(entry))
        ));
        if (!cleanChatIds.length) return {};
        if (typeof tenantLabelService?.listChatLabelsMap !== 'function') return {};

        let labelsMap = {};
        try {
            labelsMap = await tenantLabelService.listChatLabelsMap({
                tenantId: safeTenantId,
                chatKeys: cleanChatIds.map((chatId) => ({ chatId, scopeModuleId: safeScopeModuleId })),
                includeInactive
            }) || {};
        } catch (error) {
            labelsMap = {};
        }

        if (safeScopeModuleId) {
            const missingChatIds = cleanChatIds.filter((chatId) => {
                const scopedKey = buildLabelMapKey(chatId, safeScopeModuleId);
                const scopedLabels = labelsMap?.[scopedKey];
                return !Array.isArray(scopedLabels) || scopedLabels.length === 0;
            });

            if (missingChatIds.length > 0) {
                try {
                    const fallbackMap = await tenantLabelService.listChatLabelsMap({
                        tenantId: safeTenantId,
                        chatKeys: missingChatIds.map((chatId) => ({ chatId, scopeModuleId: '' })),
                        includeInactive
                    }) || {};
                    for (const chatId of missingChatIds) {
                        const scopedKey = buildLabelMapKey(chatId, safeScopeModuleId);
                        const fallbackKey = buildLabelMapKey(chatId, '');
                        if ((!Array.isArray(labelsMap?.[scopedKey]) || labelsMap[scopedKey].length === 0) && Array.isArray(fallbackMap?.[fallbackKey]) && fallbackMap[fallbackKey].length > 0) {
                            labelsMap[scopedKey] = fallbackMap[fallbackKey];
                        }
                    }
                } catch (error) { }
            }
        }

        cleanChatIds.forEach((chatId) => {
            const key = buildLabelMapKey(chatId, safeScopeModuleId);
            if (!Array.isArray(labelsMap?.[key])) labelsMap[key] = [];
        });

        return labelsMap;
    };

    const getChatLabelTokenSet = async (chat, { tenantId = 'default', scopeModuleId = '' } = {}) => {
        const chatId = String(chat?.id?._serialized || '');
        if (!chatId || !isVisibleChatId(chatId)) return new Set();

        try {
            const safeScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');
            const labelsMap = await listChatLabelsMapWithScopeFallback({
                tenantId,
                chatIds: [chatId],
                scopeModuleId: safeScopeModuleId,
                includeInactive: false
            });
            const labels = labelsMap?.[buildLabelMapKey(chatId, safeScopeModuleId)] || [];
            return toLabelTokenSet(labels);
        } catch (error) {
            return new Set();
        }
    };

    const applyAdvancedChatFilters = async (chats = [], filters = {}, { tenantId = 'default', scopeModuleId = '' } = {}) => {
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
        const pinnedMode = ['all', 'pinned', 'unpinned'].includes(String(filters?.pinnedMode || 'all'))
            ? String(filters?.pinnedMode || 'all')
            : 'all';

        const needsLabelFiltering = unlabeledOnly || selectedTokens.length > 0;
        if (!unreadOnly && !needsLabelFiltering && contactMode === 'all' && archivedMode === 'all' && pinnedMode === 'all') return chats;

        const safeTenantId = String(tenantId || 'default').trim() || 'default';
        const safeScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');
        const labelTokenSetByChatId = new Map();
        if (needsLabelFiltering) {
            const chatIds = chats
                .map((chat) => String(chat?.id?._serialized || '').trim())
                .filter((chatId) => Boolean(chatId) && isVisibleChatId(chatId));
            const labelsMap = await listChatLabelsMapWithScopeFallback({
                tenantId: safeTenantId,
                chatIds,
                scopeModuleId: safeScopeModuleId,
                includeInactive: false
            });
            chatIds.forEach((chatId) => {
                const labels = labelsMap?.[buildLabelMapKey(chatId, safeScopeModuleId)] || [];
                labelTokenSetByChatId.set(chatId, toLabelTokenSet(labels));
            });
        }

        const included = new Array(chats.length).fill(false);
        const labelConcurrency = Math.max(2, Number(process.env.LABEL_FILTER_CONCURRENCY || 10));

        await runWithConcurrency(chats, labelConcurrency, async (chat, idx) => {
            const chatId = String(chat?.id?._serialized || '').trim();
            const unreadCount = Number(chat?.unreadCount || 0);
            if (unreadOnly && unreadCount <= 0) return;

            const isMyContact = Boolean(chat?.contact?.isMyContact);
            if (contactMode === 'my' && !isMyContact) return;
            if (contactMode === 'unknown' && isMyContact) return;
            const isArchived = Boolean(chat?.archived);
            if (archivedMode === 'archived' && !isArchived) return;
            if (archivedMode === 'active' && isArchived) return;
            const isPinned = Boolean(chat?.pinned);
            if (pinnedMode === 'pinned' && !isPinned) return;
            if (pinnedMode === 'unpinned' && isPinned) return;

            if (needsLabelFiltering) {
                const labelTokenSet = labelTokenSetByChatId.get(chatId) || await getChatLabelTokenSet(chat, { tenantId: safeTenantId, scopeModuleId: safeScopeModuleId });
                const hasAnyLabel = labelTokenSet.size > 0;
                if (unlabeledOnly && hasAnyLabel) return;
                if (!unlabeledOnly && selectedTokens.length > 0 && !matchesTokenSet(labelTokenSet, selectedTokens)) {
                    return;
                }
            }

            included[idx] = true;
        });

        return chats.filter((_, idx) => included[idx]);
    };

    const toChatSummary = async (chat, {
        includeHeavyMeta = false,
        scopeModuleId = '',
        scopeModuleName = null,
        scopeModuleImageUrl = null,
        scopeChannelType = null,
        scopeTransport = null,
        tenantId = 'default'
    } = {}) => {
        const chatId = chat?.id?._serialized;
        if (!isVisibleChatId(chatId)) return null;

        const cached = getCachedChatMeta(chatId);
        let profilePicUrl = cached?.profilePicUrl || null;

        if (includeHeavyMeta || !cached) {
            const hydrated = await hydrateChatMeta(chat);
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
        const resolvedTenantId = String(tenantId || 'default').trim() || 'default';
        let erpCustomer = null;
        if (!isGroup && phone && customerService && typeof customerService.getCustomerByPhoneWithAddresses === 'function') {
            try {
                erpCustomer = await customerService.getCustomerByPhoneWithAddresses(resolvedTenantId, phone, {
                    customerAddressesService
                });
            } catch (_) {
                erpCustomer = null;
            }
        }
        const subtitle = resolveChatSubtitle({ ...effectiveChat, erpCustomer });
        const normalizedScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');
        const scopedSummaryId = buildScopedChatId(chatId, normalizedScopeModuleId);
        let labels = [];
        try {
            labels = await tenantLabelService.listChatLabels({
                tenantId: resolvedTenantId,
                chatId,
                scopeModuleId: normalizedScopeModuleId,
                includeInactive: false
            });
            if ((normalizedScopeModuleId && normalizedScopeModuleId !== '') && (!Array.isArray(labels) || labels.length === 0)) {
                labels = await tenantLabelService.listChatLabels({
                    tenantId: resolvedTenantId,
                    chatId,
                    scopeModuleId: '',
                    includeInactive: false
                });
            }
        } catch (error) {
            labels = [];
        }

        return {
            id: scopedSummaryId || chatId,
            baseChatId: chatId,
            scopeModuleId: normalizedScopeModuleId || null,
            name: resolveChatDisplayName({ ...effectiveChat, erpCustomer }),
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
            customerId: erpCustomer?.customerId || null,
            erpCustomerName: erpCustomer ? resolveChatDisplayName({ ...effectiveChat, erpCustomer }) : null,
            archived: Boolean(chat?.archived),
            lastMessageModuleId: normalizedScopeModuleId || null,
            lastMessageModuleName: String(scopeModuleName || '').trim() || null,
            lastMessageModuleImageUrl: String(scopeModuleImageUrl || '').trim() || null,
            lastMessageTransport: String(scopeTransport || '').trim().toLowerCase() || null,
            lastMessageChannelType: String(scopeChannelType || '').trim().toLowerCase() || null
        };
    };

    const registerChatListHandlers = ({
        socket,
        tenantId = 'default',
        transportOrchestrator,
        getHistoryChatsPage
    } = {}) => {
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
                        : 'all',
                    pinnedMode: ['all', 'pinned', 'unpinned'].includes(String(incomingFilters?.pinnedMode || 'all'))
                        ? String(incomingFilters?.pinnedMode || 'all')
                        : 'all'
                };

                const selectedModuleContext = socket?.data?.waModule || null;
                const activeScopeModuleId = normalizeScopedModuleId(selectedModuleContext?.moduleId || socket?.data?.waModuleId || '');
                const summaryScopeOptions = {
                    tenantId,
                    scopeModuleId: activeScopeModuleId || '',
                    scopeModuleName: String(selectedModuleContext?.name || '').trim() || null,
                    scopeModuleImageUrl: String(selectedModuleContext?.imageUrl || selectedModuleContext?.logoUrl || '').trim() || null,
                    scopeChannelType: String(selectedModuleContext?.channelType || '').trim().toLowerCase() || null,
                    scopeTransport: String(selectedModuleContext?.transportMode || '').trim().toLowerCase() || null
                };

                const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
                const limit = Number.isFinite(rawLimit)
                    ? Math.min(250, Math.max(20, Math.floor(rawLimit)))
                    : 80;

                if (!transportOrchestrator.ensureTransportReady(socket, { action: 'cargar chats', errorEvent: 'transport_info' })) {
                    const fallbackPage = await getHistoryChatsPage(tenantId, {
                        offset,
                        limit,
                        query,
                        filters: activeFilters,
                        filterKey,
                        scopeModuleId: activeScopeModuleId || ''
                    });
                    socket.emit('chats', fallbackPage);
                    return;
                }

                const hasActiveFilters = activeFilters.unreadOnly || activeFilters.unlabeledOnly || activeFilters.contactMode !== 'all' || activeFilters.archivedMode !== 'all' || activeFilters.pinnedMode !== 'all' || activeFilters.labelTokens.length > 0;
                let sortedChats = await getSortedVisibleChats({ forceRefresh: reset || Boolean(query) || hasActiveFilters });
                if (!queryLower && !reset && offset >= sortedChats.length) {
                    sortedChats = await getSortedVisibleChats({ forceRefresh: true });
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

                filtered = await applyAdvancedChatFilters(filtered, activeFilters, { tenantId, scopeModuleId: activeScopeModuleId });

                const page = filtered.slice(offset, offset + limit);
                const scannedCount = page.length;
                const formatted = await Promise.all(page.map((c) => toChatSummary(c, { includeHeavyMeta: false, ...summaryScopeOptions })));

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

                    const contacts = await getSearchableContacts();
                    const contactMatches = contacts
                        .map((c) => {
                            const phone = normalizePhoneDigits(c?.phone || '');
                            const canonicalId = phone ? phoneToExistingChatId.get(phone) : null;
                            const baseId = String(canonicalId || c?.id || '').trim();
                            const scopedId = buildScopedChatId(baseId, '');
                            return {
                                ...c,
                                id: scopedId || baseId,
                                baseChatId: baseId || null,
                                scopeModuleId: null,
                                lastMessageModuleId: null,
                                lastMessageModuleName: null,
                                lastMessageModuleImageUrl: null,
                                lastMessageTransport: null,
                                lastMessageChannelType: null
                            };
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
                            const summary = await toChatSummary(chat, { includeHeavyMeta: true, ...summaryScopeOptions });
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

                if (items.length === 0) {
                    const fallbackPageIfEmpty = await getHistoryChatsPage(tenantId, {
                        offset,
                        limit,
                        query,
                        filters: activeFilters,
                        filterKey,
                        scopeModuleId: activeScopeModuleId || ''
                    });
                    if (Array.isArray(fallbackPageIfEmpty?.items) && fallbackPageIfEmpty.items.length > 0) {
                        socket.emit('chats', fallbackPageIfEmpty);
                        return;
                    }
                }

                let historyTotalHint = 0;
                const activeRuntime = getWaRuntime();
                const activeTransportMode = String(activeRuntime?.activeTransport || 'idle').trim().toLowerCase();
                if (activeTransportMode === 'cloud') {
                    try {
                        const cloudHistoryPage = await getHistoryChatsPage(tenantId, {
                            offset,
                            limit,
                            query,
                            filters: activeFilters,
                            filterKey,
                            scopeModuleId: activeScopeModuleId
                        });

                        historyTotalHint = Math.max(0, Number(cloudHistoryPage?.total || 0));
                        if (Array.isArray(cloudHistoryPage?.items) && cloudHistoryPage.items.length > 0) {
                            const mergedMap = new Map();
                            for (const item of cloudHistoryPage.items) {
                                if (!item) continue;
                                const key = buildChatIdentityKeyFromSummary(item);
                                if (!mergedMap.has(key)) mergedMap.set(key, item);
                            }
                            for (const item of items) {
                                if (!item) continue;
                                const key = buildChatIdentityKeyFromSummary(item);
                                if (!mergedMap.has(key)) {
                                    mergedMap.set(key, item);
                                } else {
                                    mergedMap.set(key, pickPreferredSummary(mergedMap.get(key), item));
                                }
                            }

                            const mergedItems = Array.from(mergedMap.values())
                                .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)))
                                .slice(0, limit);

                            if (mergedItems.length > 0) {
                                items = mergedItems;
                            }
                        }
                    } catch (historyMergeError) {
                        console.warn('[History] cloud chat merge failed:', String(historyMergeError?.message || historyMergeError));
                    }
                }

                const nextOffset = offset + items.length;
                const total = Math.max(filtered.length, historyTotalHint, offset + items.length);
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
                        const cached = getCachedChatMeta(chatId);
                        if (!cached) return true;
                        return !cached.profilePicUrl || !Array.isArray(cached.labels);
                    })
                    .slice(0, 24);

                if (pendingMetaChats.length > 0) {
                    setImmediate(async () => {
                        for (const chat of pendingMetaChats) {
                            try {
                                const summary = await toChatSummary(chat, { includeHeavyMeta: true, ...summaryScopeOptions });
                                if (summary) socket.emit('chat_updated', summary);
                            } catch (_) { }
                        }
                    });
                }
            } catch (e) {
                console.error('Error fetching chats:', e);
                try {
                    const fallbackPage = await getHistoryChatsPage(tenantId, {
                        offset: Number(payload?.offset ?? 0),
                        limit: Number(payload?.limit ?? 80),
                        query: String(payload?.query || '').trim(),
                        filters: payload?.filters || {},
                        filterKey: String(payload?.filterKey || '').trim(),
                        scopeModuleId: normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '') || null
                    });
                    socket.emit('chats', fallbackPage);
                } catch (historyErr) {
                    socket.emit('chats', {
                        items: [],
                        offset: Number(payload?.offset ?? 0) || 0,
                        limit: Number(payload?.limit ?? 80) || 80,
                        total: 0,
                        hasMore: false,
                        nextOffset: 0,
                        query: String(payload?.query || '').trim(),
                        filters: payload?.filters || {},
                        filterKey: String(payload?.filterKey || '').trim(),
                        source: 'history_fallback'
                    });
                }
            }
        });
    };

    return {
        registerChatListHandlers,
        invalidateChatListCache,
        getSortedVisibleChats,
        getCachedChatMeta,
        hydrateChatMeta,
        getSearchableContacts,
        getChatLabelTokenSet,
        applyAdvancedChatFilters,
        toChatSummary
    };
}

module.exports = {
    createSocketChatListService
};
