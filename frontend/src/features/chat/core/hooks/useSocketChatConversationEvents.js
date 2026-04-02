import { useEffect } from 'react';
import { getMessagePreviewText as getMessagePreviewTextFallback } from '../helpers/appChat.helpers';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

export default function useSocketChatConversationEvents({
    socket,
    chatSearchRef,
    buildFiltersKey,
    chatFiltersRef,
    chatsRef,
    isVisibleChatId,
    normalizeChatScopedId,
    parseScopedChatId,
    sanitizeDisplayText,
    getMessagePreviewText = getMessagePreviewTextFallback,
    getBestChatPhone,
    normalizeChatLabels,
    normalizeProfilePhotoUrl,
    normalizeModuleImageUrl,
    chatMatchesFilters,
    setChats,
    setChatsLoaded,
    dedupeChats,
    chatPagingRef,
    setChatsTotal,
    setChatsHasMore,
    setIsLoadingMoreChats,
    chatIdsReferSameScope,
    chatMatchesQuery,
    chatIdentityKey,
    upsertAndSortChat,
    requestChatsPage,
    normalizeDigits,
    isLikelyPhoneDigits,
    normalizeWaModules,
    waModulesRef,
    handleChatSelect,
    activeChatIdRef,
    setActiveChatId,
    shouldInstantScrollRef,
    suppressSmoothScrollUntilRef,
    prevMessagesMetaRef,
    resolveSessionSenderIdentity,
    repairMojibake,
    normalizeMessageLocation,
    normalizeMessageFilename,
    normalizeQuotedMessage,
    setMessages,
    isGenericFilename,
    isMachineLikeFilename,
    normalizeParticipantList,
    setClientContact,
    isInternalIdentifier,
    setToasts
}) {
    const { notify } = useUiFeedback();
    useEffect(() => {
        socket.on('chats', (payload) => {
            const isLegacy = Array.isArray(payload);
            const page = isLegacy
                ? { items: payload, offset: 0, total: payload.length, hasMore: false }
                : (payload || {});

            const incomingQuery = String(page.query || '').trim();
            if (incomingQuery !== chatSearchRef.current) {
                chatPagingRef.current.loading = false;
                setIsLoadingMoreChats(false);
                return;
            }
            const incomingFilterKey = String(page.filterKey || '').trim();
            if (incomingFilterKey && incomingFilterKey !== buildFiltersKey(chatFiltersRef.current)) {
                chatPagingRef.current.loading = false;
                setIsLoadingMoreChats(false);
                return;
            }

            const rawItems = Array.isArray(page.items) ? page.items : [];
            const previousById = new Map(
                (Array.isArray(chatsRef.current) ? chatsRef.current : [])
                    .filter((chat) => chat?.id)
                    .map((chat) => [String(chat.id), chat])
            );
            const hydrated = rawItems
                .filter((chat) => chat?.id && isVisibleChatId(chat.id))
                .map((chat) => {
                    const incomingScopeModuleId = String(chat?.scopeModuleId || chat?.lastMessageModuleId || chat?.sentViaModuleId || '').trim().toLowerCase();
                    const incomingChatId = String(chat?.id || '').trim();
                    const normalizedIncomingId = normalizeChatScopedId(incomingChatId, incomingScopeModuleId || '');
                    const previous = previousById.get(String(normalizedIncomingId || '')) || previousById.get(incomingChatId) || null;
                    const previousScopeModuleId = String(previous?.scopeModuleId || previous?.lastMessageModuleId || '').trim().toLowerCase();
                    const finalId = normalizeChatScopedId(normalizedIncomingId || incomingChatId, incomingScopeModuleId || previousScopeModuleId || '');
                    const parsedFinal = parseScopedChatId(finalId || incomingChatId);
                    const scopeModuleId = String(parsedFinal?.scopeModuleId || incomingScopeModuleId || previousScopeModuleId || '').trim().toLowerCase() || null;
                    const baseChatId = String(parsedFinal?.baseChatId || chat?.baseChatId || previous?.baseChatId || incomingChatId).trim() || null;
                    return {
                        ...chat,
                        id: finalId || incomingChatId,
                        baseChatId,
                        scopeModuleId,
                        name: sanitizeDisplayText(chat?.name || ''),
                        subtitle: sanitizeDisplayText(chat?.subtitle || ''),
                        status: sanitizeDisplayText(chat?.status || ''),
                        phone: getBestChatPhone(chat),
                        lastMessage: sanitizeDisplayText(chat?.lastMessage || ''),
                        labels: (() => {
                            const hasIncomingLabels = Object.prototype.hasOwnProperty.call(chat || {}, 'labels');
                            const incoming = hasIncomingLabels ? normalizeChatLabels(chat.labels) : null;
                            if (Array.isArray(incoming) && incoming.length > 0) return incoming;
                            const existing = previous?.labels;
                            if (Array.isArray(existing) && existing.length > 0) return existing;
                            return Array.isArray(incoming) ? incoming : [];
                        })(),
                        profilePicUrl: normalizeProfilePhotoUrl(chat?.profilePicUrl),
                        isMyContact: chat?.isMyContact === true,
                        archived: Boolean(chat?.archived),
                        pinned: Boolean(chat?.pinned),
                        lastMessageModuleId: String(chat?.lastMessageModuleId || chat?.sentViaModuleId || scopeModuleId || previous?.lastMessageModuleId || '').trim().toLowerCase() || null,
                        lastMessageModuleName: String(chat?.lastMessageModuleName || chat?.sentViaModuleName || previous?.lastMessageModuleName || '').trim() || null,
                        lastMessageModuleImageUrl: normalizeModuleImageUrl(chat?.lastMessageModuleImageUrl || chat?.sentViaModuleImageUrl || previous?.lastMessageModuleImageUrl || '') || null,
                        lastMessageTransport: String(chat?.lastMessageTransport || chat?.sentViaTransport || previous?.lastMessageTransport || '').trim().toLowerCase() || null,
                        lastMessageChannelType: String(chat?.lastMessageChannelType || chat?.sentViaChannelType || previous?.lastMessageChannelType || '').trim().toLowerCase() || null
                    };
                })
                .filter((chat) => chatMatchesFilters(chat, chatFiltersRef.current));

            const pageOffset = Number.isFinite(Number(page.offset)) ? Number(page.offset) : 0;
            const total = Number.isFinite(Number(page.total)) ? Number(page.total) : hydrated.length;
            const hasMore = Boolean(page.hasMore);

            setChats((prev) => {
                if (pageOffset <= 0) {
                    return dedupeChats(hydrated).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                }
                return dedupeChats([...prev, ...hydrated]).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });
            if (pageOffset <= 0) {
                setChatsLoaded(true);
            }

            chatPagingRef.current.offset = Number.isFinite(Number(page.nextOffset)) ? Number(page.nextOffset) : (pageOffset + rawItems.length);
            chatPagingRef.current.hasMore = hasMore;
            chatPagingRef.current.loading = false;
            setChatsTotal(total);
            setChatsHasMore(hasMore);
            setIsLoadingMoreChats(false);
        });

        socket.on('chat_updated', (chat) => {
            if (!chat?.id || !isVisibleChatId(chat.id)) return;
            const incomingScopeModuleId = String(chat?.scopeModuleId || chat?.lastMessageModuleId || chat?.sentViaModuleId || '').trim().toLowerCase();
            const incomingChatId = String(chat?.id || '').trim();
            const normalizedIncomingId = normalizeChatScopedId(incomingChatId, incomingScopeModuleId || '');
            const previous = (Array.isArray(chatsRef.current) ? chatsRef.current : []).find((entry) => {
                if (!entry?.id) return false;
                if (String(entry.id) === String(normalizedIncomingId || incomingChatId)) return true;
                return chatIdsReferSameScope(String(entry.id), String(normalizedIncomingId || incomingChatId));
            }) || null;
            const previousScopeModuleId = String(previous?.scopeModuleId || previous?.lastMessageModuleId || '').trim().toLowerCase();
            const finalId = normalizeChatScopedId(normalizedIncomingId || incomingChatId, incomingScopeModuleId || previousScopeModuleId || '');
            const parsedFinal = parseScopedChatId(finalId || incomingChatId);
            const scopeModuleId = String(parsedFinal?.scopeModuleId || incomingScopeModuleId || previousScopeModuleId || '').trim().toLowerCase() || null;
            const baseChatId = String(parsedFinal?.baseChatId || chat?.baseChatId || previous?.baseChatId || incomingChatId).trim() || null;
            const hydrated = {
                ...chat,
                id: finalId || incomingChatId,
                baseChatId,
                scopeModuleId,
                name: sanitizeDisplayText(chat?.name || ''),
                subtitle: sanitizeDisplayText(chat?.subtitle || ''),
                status: sanitizeDisplayText(chat?.status || ''),
                phone: getBestChatPhone(chat),
                lastMessage: sanitizeDisplayText(chat?.lastMessage || ''),
                labels: normalizeChatLabels(chat.labels),
                profilePicUrl: normalizeProfilePhotoUrl(chat?.profilePicUrl),
                isMyContact: chat?.isMyContact === true,
                archived: Boolean(chat?.archived),
                pinned: Boolean(chat?.pinned),
                lastMessageModuleId: String(chat?.lastMessageModuleId || chat?.sentViaModuleId || scopeModuleId || previous?.lastMessageModuleId || '').trim().toLowerCase() || null,
                lastMessageModuleName: String(chat?.lastMessageModuleName || chat?.sentViaModuleName || previous?.lastMessageModuleName || '').trim() || null,
                lastMessageModuleImageUrl: normalizeModuleImageUrl(chat?.lastMessageModuleImageUrl || chat?.sentViaModuleImageUrl || previous?.lastMessageModuleImageUrl || '') || null,
                lastMessageTransport: String(chat?.lastMessageTransport || chat?.sentViaTransport || previous?.lastMessageTransport || '').trim().toLowerCase() || null,
                lastMessageChannelType: String(chat?.lastMessageChannelType || chat?.sentViaChannelType || previous?.lastMessageChannelType || '').trim().toLowerCase() || null
            };

            if (!chatMatchesQuery(hydrated, chatSearchRef.current) || !chatMatchesFilters(hydrated, chatFiltersRef.current)) {
                setChats((prev) => prev.filter((c) => chatIdentityKey(c) !== chatIdentityKey(hydrated) && c.id !== hydrated.id));
                return;
            }

            setChats((prev) => upsertAndSortChat(prev, hydrated));
        });

        socket.on('chat_opened', ({ chatId, baseChatId, moduleId, phone }) => {
            const targetChatId = String(chatId || '').trim();
            if (!targetChatId) {
                requestChatsPage({ reset: true });
                return;
            }

            const parsed = parseScopedChatId(targetChatId);
            const scopeModuleId = String(parsed?.scopeModuleId || moduleId || '').trim().toLowerCase() || null;
            const safeBaseChatId = String(parsed?.baseChatId || baseChatId || targetChatId).trim();
            const safePhone = normalizeDigits(phone || '');

            setChats((prev) => {
                if ((Array.isArray(prev) ? prev : []).some((entry) => chatIdsReferSameScope(String(entry?.id || ''), targetChatId))) {
                    return prev;
                }

                const moduleConfig = normalizeWaModules(waModulesRef.current || [])
                    .find((entry) => String(entry?.moduleId || '').trim().toLowerCase() === String(scopeModuleId || '').trim().toLowerCase()) || null;

                const placeholder = {
                    id: targetChatId,
                    baseChatId: safeBaseChatId || null,
                    scopeModuleId,
                    name: safePhone ? ('+' + safePhone) : 'Nuevo chat',
                    phone: safePhone || null,
                    subtitle: null,
                    unreadCount: 0,
                    timestamp: Math.floor(Date.now() / 1000),
                    lastMessage: '',
                    lastMessageFromMe: false,
                    ack: 0,
                    labels: [],
                    archived: false,
                    pinned: false,
                    isMyContact: false,
                    lastMessageModuleId: scopeModuleId,
                    lastMessageModuleName: String(moduleConfig?.name || '').trim() || (scopeModuleId ? String(scopeModuleId || '').toUpperCase() : null),
                    lastMessageModuleImageUrl: normalizeModuleImageUrl(moduleConfig?.imageUrl || moduleConfig?.logoUrl || '') || null,
                    lastMessageChannelType: String(moduleConfig?.channelType || '').trim().toLowerCase() || null,
                    lastMessageTransport: String(moduleConfig?.transportMode || '').trim().toLowerCase() || null
                };

                return upsertAndSortChat(prev, placeholder);
            });

            handleChatSelect(targetChatId, { clearSearch: true });
        });

        socket.on('start_new_chat_error', (msg) => {
            if (msg) notify({ type: 'error', message: msg });
        });

        socket.on('chat_labels_updated', ({ chatId, baseChatId, scopeModuleId, labels }) => {
            const incomingScopedId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
            const normalizedLabels = normalizeChatLabels(labels);

            setChats((prev) => {
                const next = prev.map((chat) => {
                    const sameScope = chatIdsReferSameScope(String(chat?.id || ''), incomingScopedId);
                    if (!sameScope) return chat;
                    return { ...chat, labels: normalizedLabels };
                });
                return next.filter((chat) => chatMatchesQuery(chat, chatSearchRef.current) && chatMatchesFilters(chat, chatFiltersRef.current));
            });

            const active = String(activeChatIdRef.current || '');
            if (active && chatIdsReferSameScope(active, incomingScopedId)) {
                socket.emit('get_contact_info', active);
            }
        });

        socket.on('chat_labels_error', (msg) => {
            if (msg) notify({ type: 'error', message: msg });
        });

        socket.on('chat_labels_saved', ({ chatId }) => {
            requestChatsPage({ reset: true });
            if (chatId === activeChatIdRef.current) socket.emit('get_contact_info', chatId);
        });

        socket.on('chat_history', (data) => {
            shouldInstantScrollRef.current = true;
            suppressSmoothScrollUntilRef.current = Date.now() + 2200;
            prevMessagesMetaRef.current = { count: 0, lastId: '' };
            const requestedChatId = String(data?.requestedChatId || '');
            const resolvedChatId = String(data?.chatId || requestedChatId || '');
            const active = String(activeChatIdRef.current || '');
            const matchesActiveByScope = chatIdsReferSameScope(resolvedChatId, active)
                || chatIdsReferSameScope(requestedChatId, active);
            if (!matchesActiveByScope) return;

            if (resolvedChatId && !chatIdsReferSameScope(resolvedChatId, active)) {
                activeChatIdRef.current = resolvedChatId;
                setActiveChatId(resolvedChatId);
                socket.emit('mark_chat_read', resolvedChatId);
                socket.emit('get_contact_info', resolvedChatId);
            }

            const sessionSenderIdentity = resolveSessionSenderIdentity();
            const sessionSenderId = String(sessionSenderIdentity?.id || '').trim();
            const sessionSenderName = String(sessionSenderIdentity?.name || '').trim();
            const sessionSenderEmail = String(sessionSenderIdentity?.email || '').trim();
            const sessionSenderRole = String(sessionSenderIdentity?.role || '').trim().toLowerCase();
            const normalizedMessages = Array.isArray(data.messages)
                ? data.messages.map((m) => {
                    const normalizedMessage = {
                        ...m,
                        body: repairMojibake(m?.body || ''),
                        location: normalizeMessageLocation(m?.location),
                        filename: normalizeMessageFilename(m?.filename),
                        fileSizeBytes: Number.isFinite(Number(m?.fileSizeBytes)) ? Number(m.fileSizeBytes) : null,
                        ack: Number.isFinite(Number(m?.ack)) ? Number(m.ack) : 0,
                        edited: Boolean(m?.edited),
                        editedAt: Number(m?.editedAt || 0) || null,
                        canEdit: Boolean(m?.canEdit),
                        quotedMessage: normalizeQuotedMessage(m?.quotedMessage),
                        sentViaModuleImageUrl: normalizeModuleImageUrl(m?.sentViaModuleImageUrl || '') || null
                    };

                    if (!normalizedMessage?.fromMe) return normalizedMessage;

                    return {
                        ...normalizedMessage,
                        sentByUserId: String(normalizedMessage?.sentByUserId || sessionSenderId || '').trim() || null,
                        sentByName: String(normalizedMessage?.sentByName || normalizedMessage?.sentByEmail || sessionSenderName || '').trim() || null,
                        sentByEmail: String(normalizedMessage?.sentByEmail || sessionSenderEmail || '').trim() || null,
                        sentByRole: String(normalizedMessage?.sentByRole || sessionSenderRole || '').trim() || null
                    };
                })
                : [];
            setMessages((prev) => {
                const previous = Array.isArray(prev) ? prev : [];
                if (previous.length === 0) return normalizedMessages;
                if (normalizedMessages.length === 0) return previous;

                const mergedById = new Map(
                    previous
                        .map((m) => [String(m?.id || '').trim(), m])
                        .filter(([id]) => Boolean(id))
                );

                normalizedMessages.forEach((message) => {
                    const id = String(message?.id || '').trim();
                    if (!id) return;
                    const existing = mergedById.get(id);
                    mergedById.set(id, existing ? { ...existing, ...message } : message);
                });

                const merged = Array.from(mergedById.values());
                merged.sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));
                return merged;
            });
        });

        socket.on('chat_media', ({ chatId, messageId, mediaData, mimetype, filename, fileSizeBytes }) => {
            const active = String(activeChatIdRef.current || '');
            const incoming = String(chatId || '').trim();
            if (!incoming || !chatIdsReferSameScope(incoming, active)) return;
            if (!messageId || !mediaData) return;
            const nextFilename = normalizeMessageFilename(filename);
            const nextSize = Number.isFinite(Number(fileSizeBytes)) ? Number(fileSizeBytes) : null;
            setMessages((prev) => prev.map((m) => {
                if (m.id !== messageId) return m;
                const currentFilename = normalizeMessageFilename(m?.filename);
                const shouldReplaceFilename = Boolean(nextFilename) && (!currentFilename || isGenericFilename(currentFilename) || isMachineLikeFilename(currentFilename));
                return {
                    ...m,
                    mediaData,
                    mimetype: mimetype || m.mimetype,
                    filename: shouldReplaceFilename ? nextFilename : currentFilename,
                    fileSizeBytes: Number.isFinite(nextSize) ? nextSize : (Number.isFinite(Number(m?.fileSizeBytes)) ? Number(m.fileSizeBytes) : null)
                };
            }));
        });

        socket.on('contact_info', (contact) => {
            const participantsList = normalizeParticipantList(contact?.participantsList);
            const participantsCount = Number(contact?.participants || contact?.chatState?.participantsCount || participantsList.length || 0) || 0;
            const normalizedContact = {
                ...contact,
                name: sanitizeDisplayText(contact?.name || ''),
                pushname: sanitizeDisplayText(contact?.pushname || ''),
                shortName: sanitizeDisplayText(contact?.shortName || ''),
                profilePicUrl: normalizeProfilePhotoUrl(contact?.profilePicUrl),
                status: repairMojibake(contact?.status || ''),
                participants: participantsCount,
                participantsList,
                chatState: {
                    ...(contact?.chatState || {}),
                    participantsCount
                }
            };
            setClientContact(normalizedContact);

            const contactId = String(contact?.id || '');
            if (!contactId) return;

            const contactPhone = getBestChatPhone({
                id: contactId,
                phone: contact?.phone || '',
                subtitle: String(contact?.pushname || '') + ' ' + String(contact?.shortName || '') + ' ' + String(contact?.name || ''),
                status: contact?.status || ''
            });

            setChats((prev) => {
                const existing = prev.find((c) => chatIdsReferSameScope(String(c?.id || ''), contactId));
                if (!existing) return prev;

                const fallbackName = sanitizeDisplayText(contact?.name || contact?.pushname || contact?.shortName || existing?.name || '');
                const subtitleName = sanitizeDisplayText(contact?.pushname || contact?.shortName || contact?.name || '');
                const nextChat = {
                    ...existing,
                    id: existing.id || contactId,
                    phone: contactPhone || existing?.phone || null,
                    isMyContact: contact?.isMyContact === true,
                    name: fallbackName && !isInternalIdentifier(fallbackName)
                        ? fallbackName
                        : (existing?.name || (contactPhone ? ('+' + contactPhone) : 'Contacto')),
                    subtitle: subtitleName || existing?.subtitle || null,
                    status: normalizedContact.status || existing?.status || '',
                    profilePicUrl: normalizedContact.profilePicUrl || existing?.profilePicUrl || null,
                    participants: normalizedContact.participants || existing?.participants || 0,
                    participantsList: normalizedContact.participantsList || existing?.participantsList || []
                };

                if (!chatMatchesQuery(nextChat, chatSearchRef.current) || !chatMatchesFilters(nextChat, chatFiltersRef.current)) {
                    return prev.filter((c) => c.id !== nextChat.id && chatIdentityKey(c) !== chatIdentityKey(nextChat));
                }

                return upsertAndSortChat(prev, nextChat);
            });
        });

        socket.on('message', (msg) => {
            const relatedChatId = String(msg?.chatId || (msg.fromMe ? msg.to : msg.from) || '').trim();
            if (!isVisibleChatId(relatedChatId)) return;

            if (!msg.fromMe && Notification.permission === 'granted') {
                new Notification(msg.notifyName || 'Nuevo mensaje', {
                    body: getMessagePreviewText(msg),
                    icon: '/favicon.ico'
                });
            }

            if (!msg.fromMe && !chatIdsReferSameScope(relatedChatId, String(activeChatIdRef.current || ''))) {
                const toastId = String(msg.id || Date.now());
                setToasts((prev) => [...prev, {
                    id: toastId,
                    chatId: relatedChatId,
                    title: sanitizeDisplayText(msg.notifyName || msg.from || 'Nuevo mensaje'),
                    body: getMessagePreviewText(msg)
                }].slice(-3));

                setTimeout(() => {
                    setToasts((prev) => prev.filter((t) => t.id !== toastId));
                }, 5000);
            }

            setChats((prev) => {
                const senderDigits = normalizeDigits(msg.senderPhone || '');
                const idDigits = normalizeDigits(String(relatedChatId || '').split('@')[0] || '');
                const fallbackDigits = isLikelyPhoneDigits(senderDigits)
                    ? senderDigits
                    : (isLikelyPhoneDigits(idDigits) ? idDigits : '');
                const fallbackName = sanitizeDisplayText(msg.notifyName || '');
                const safeName = fallbackName && !isInternalIdentifier(fallbackName)
                    ? fallbackName
                    : (isLikelyPhoneDigits(fallbackDigits) ? ('+' + fallbackDigits) : 'Contacto');

                const incomingScopeModuleId = String(msg?.scopeModuleId || msg?.sentViaModuleId || '').trim().toLowerCase();
                const incomingIdentity = `id:${normalizeChatScopedId(relatedChatId, incomingScopeModuleId || '')}`;
                const existing = prev.find((c) => chatIdsReferSameScope(String(c?.id || ''), relatedChatId));
                const canonicalId = normalizeChatScopedId(existing?.id || relatedChatId, incomingScopeModuleId || '');
                const parsedCanonicalId = parseScopedChatId(canonicalId);
                const canonicalScopeModuleId = String(parsedCanonicalId?.scopeModuleId || incomingScopeModuleId || existing?.scopeModuleId || existing?.lastMessageModuleId || '').trim().toLowerCase() || null;
                const baseChatId = String(parsedCanonicalId?.baseChatId || existing?.baseChatId || relatedChatId).trim() || null;
                const nextChat = {
                    ...(existing || { id: canonicalId, baseChatId, scopeModuleId: canonicalScopeModuleId, name: safeName, phone: isLikelyPhoneDigits(fallbackDigits) ? fallbackDigits : null, subtitle: null, labels: [] }),
                    id: canonicalId,
                    baseChatId,
                    scopeModuleId: canonicalScopeModuleId,
                    name: sanitizeDisplayText(existing?.name || '') && !isInternalIdentifier(existing?.name || '')
                        ? existing.name
                        : safeName,
                    phone: existing?.phone || (isLikelyPhoneDigits(fallbackDigits) ? fallbackDigits : null),
                    subtitle: sanitizeDisplayText(existing?.subtitle || fallbackName || '') || existing?.subtitle || null,
                    timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
                    lastMessage: getMessagePreviewText(msg),
                    lastMessageFromMe: !!msg.fromMe,
                    ack: msg.ack || 0,
                    isMyContact: existing?.isMyContact === true,
                    unreadCount: msg.fromMe ? (existing?.unreadCount || 0) : (chatIdsReferSameScope(canonicalId, String(activeChatIdRef.current || '')) ? 0 : (existing?.unreadCount || 0) + 1),
                    lastMessageModuleId: String(msg?.sentViaModuleId || canonicalScopeModuleId || existing?.lastMessageModuleId || '').trim().toLowerCase() || null,
                    lastMessageModuleName: String(msg?.sentViaModuleName || existing?.lastMessageModuleName || '').trim() || null,
                    lastMessageModuleImageUrl: normalizeModuleImageUrl(msg?.sentViaModuleImageUrl || existing?.lastMessageModuleImageUrl || '') || null,
                    lastMessageTransport: String(msg?.sentViaTransport || existing?.lastMessageTransport || '').trim().toLowerCase() || null,
                    lastMessageChannelType: String(msg?.sentViaChannelType || existing?.lastMessageChannelType || '').trim().toLowerCase() || null
                };

                if (!chatMatchesQuery(nextChat, chatSearchRef.current) || !chatMatchesFilters(nextChat, chatFiltersRef.current)) {
                    return prev.filter((c) => c.id !== canonicalId && chatIdentityKey(c) !== incomingIdentity);
                }
                return upsertAndSortChat(prev, nextChat);
            });

            const sessionSenderIdentity = resolveSessionSenderIdentity();
            setMessages((prev) => {
                const normalizedIncoming = {
                    ...msg,
                    body: repairMojibake(msg?.body || ''),
                    location: normalizeMessageLocation(msg?.location),
                    filename: normalizeMessageFilename(msg?.filename),
                    fileSizeBytes: Number.isFinite(Number(msg?.fileSizeBytes)) ? Number(msg.fileSizeBytes) : null,
                    canEdit: Boolean(msg?.canEdit),
                    quotedMessage: normalizeQuotedMessage(msg?.quotedMessage)
                };

                const fallbackSessionName = normalizedIncoming?.fromMe
                    ? String(sessionSenderIdentity?.name || '').trim()
                    : '';
                const fallbackSessionEmail = normalizedIncoming?.fromMe
                    ? String(sessionSenderIdentity?.email || '').trim()
                    : '';
                const fallbackSessionRole = normalizedIncoming?.fromMe
                    ? String(sessionSenderIdentity?.role || '').trim().toLowerCase()
                    : '';

                const incomingId = String(normalizedIncoming?.id || '').trim();
                if (incomingId) {
                    const existingIndex = prev.findIndex((m) => String(m?.id || '').trim() === incomingId);
                    if (existingIndex >= 0) {
                        const existing = prev[existingIndex] || {};
                        const existingOrder = existing?.order && typeof existing.order === 'object' ? existing.order : null;
                        const incomingOrder = normalizedIncoming?.order && typeof normalizedIncoming.order === 'object'
                            ? normalizedIncoming.order
                            : null;
                        const merged = {
                            ...existing,
                            ...normalizedIncoming,
                            sentByUserId: String(normalizedIncoming?.sentByUserId || existing?.sentByUserId || (normalizedIncoming?.fromMe ? (sessionSenderIdentity?.id || '') : '')).trim() || null,
                            sentByName: String(normalizedIncoming?.sentByName || normalizedIncoming?.sentByEmail || existing?.sentByName || existing?.sentByEmail || fallbackSessionName).trim() || null,
                            sentByEmail: String(normalizedIncoming?.sentByEmail || existing?.sentByEmail || fallbackSessionEmail).trim() || null,
                            sentByRole: String(normalizedIncoming?.sentByRole || existing?.sentByRole || fallbackSessionRole).trim() || null,
                            sentViaModuleId: String(normalizedIncoming?.sentViaModuleId || existing?.sentViaModuleId || '').trim() || null,
                            sentViaModuleName: String(normalizedIncoming?.sentViaModuleName || existing?.sentViaModuleName || '').trim() || null,
                            sentViaModuleImageUrl: normalizeModuleImageUrl(normalizedIncoming?.sentViaModuleImageUrl || existing?.sentViaModuleImageUrl || '') || null,
                            sentViaTransport: String(normalizedIncoming?.sentViaTransport || existing?.sentViaTransport || '').trim() || null,
                            quotedMessage: normalizeQuotedMessage(normalizedIncoming?.quotedMessage || existing?.quotedMessage),
                            order: incomingOrder
                                ? {
                                    ...(existingOrder || {}),
                                    ...incomingOrder,
                                    rawPreview: incomingOrder?.rawPreview && typeof incomingOrder.rawPreview === 'object'
                                        ? {
                                            ...((existingOrder?.rawPreview && typeof existingOrder.rawPreview === 'object') ? existingOrder.rawPreview : {}),
                                            ...incomingOrder.rawPreview
                                        }
                                        : (existingOrder?.rawPreview || null)
                                }
                                : existingOrder
                        };
                        const next = [...prev];
                        next[existingIndex] = merged;
                        return next;
                    }
                }

                const activeId = String(activeChatIdRef.current || '');
                const incomingChatId = String(normalizedIncoming?.chatId || (normalizedIncoming.fromMe ? normalizedIncoming.to : normalizedIncoming.from) || '').trim();
                if (!chatIdsReferSameScope(incomingChatId, activeId)) return prev;

                const enrichedIncoming = {
                    ...normalizedIncoming,
                    sentByUserId: String(normalizedIncoming?.sentByUserId || (normalizedIncoming?.fromMe ? (sessionSenderIdentity?.id || '') : '')).trim() || null,
                    sentByName: String(normalizedIncoming?.sentByName || normalizedIncoming?.sentByEmail || fallbackSessionName).trim() || null,
                    sentByEmail: String(normalizedIncoming?.sentByEmail || fallbackSessionEmail).trim() || null,
                    sentByRole: String(normalizedIncoming?.sentByRole || fallbackSessionRole).trim() || null,
                    sentViaModuleImageUrl: normalizeModuleImageUrl(normalizedIncoming?.sentViaModuleImageUrl || '') || null
                };

                return [...prev, enrichedIncoming];
            });
        });

        socket.on('quote_sent', (event = {}) => {
            const messageId = String(event?.messageId || '').trim();
            const quoteId = String(event?.quoteId || '').trim();
            if (!messageId || !quoteId) return;

            const incomingChatId = String(event?.chatId || event?.baseChatId || event?.to || '').trim();
            const activeChatId = String(activeChatIdRef.current || '').trim();
            if (incomingChatId && activeChatId && !chatIdsReferSameScope(incomingChatId, activeChatId)) return;

            setMessages((prev) => {
                const safePrev = Array.isArray(prev) ? prev : [];
                return safePrev.map((message) => {
                    if (String(message?.id || '').trim() !== messageId) return message;
                    const previousOrder = message?.order && typeof message.order === 'object' ? message.order : {};
                    const previousRawPreview = previousOrder?.rawPreview && typeof previousOrder.rawPreview === 'object'
                        ? previousOrder.rawPreview
                        : {};
                    return {
                        ...message,
                        order: {
                            ...previousOrder,
                            type: 'quote',
                            quoteId,
                            rawPreview: {
                                ...previousRawPreview,
                                type: 'quote',
                                quoteSummary: event?.summary && typeof event.summary === 'object'
                                    ? event.summary
                                    : (previousRawPreview?.quoteSummary || null)
                            }
                        }
                    };
                });
            });
        });

        socket.on('error', (msg) => {
            if (typeof msg === 'string' && msg.trim()) notify({ type: 'error', message: msg });
        });

        return () => {
            [
                'tenant_context',
                'wa_module_context',
                'wa_module_selected',
                'wa_module_error',
                'chats',
                'chat_updated',
                'chat_history',
                'chat_media',
                'chat_opened',
                'start_new_chat_error',
                'chat_labels_updated',
                'chat_labels_error',
                'chat_labels_saved',
                'contact_info',
                'message',
                'quote_sent',
                'error'
            ].forEach((eventName) => socket.off(eventName));
        };
    }, []);
}
