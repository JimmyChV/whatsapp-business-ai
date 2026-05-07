import { useEffect, useRef } from 'react';
import { getMessagePreviewText as getMessagePreviewTextFallback } from '../helpers/appChat.helpers';
import { openOrFocusWorkspaceTab } from '../helpers/workspaceTabs.helpers';
import { queueChatNotificationOpenRequest } from '../helpers/notificationWorkspace.helpers';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import {
    patchCachedMessages,
    replaceMessageByClientTempId,
    upsertMessageById,
    writeCachedMessages
} from '../helpers/messageCache.helpers';
import { mergeTemplateMessageContent } from '../helpers/templateMessages.helpers';

function toTitleCaseChatText(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function isBusinessErpCustomer(customer = null) {
    if (!customer || typeof customer !== 'object') return false;
    const documentType = String(customer?.documentType || customer?.document_type || '').trim().toUpperCase();
    const customerType = String(customer?.customerType || customer?.customer_type || '').trim().toUpperCase();
    const documentNumber = String(customer?.taxId || customer?.tax_id || customer?.documentNumber || customer?.document_number || '').trim();
    return documentType === 'RUC' || customerType.includes('JURIDICA') || documentNumber.length === 11;
}

function buildErpChatDisplayName(customer = null) {
    if (!customer || typeof customer !== 'object') return '';
    if (isBusinessErpCustomer(customer)) {
        return toTitleCaseChatText(customer?.lastNamePaternal || customer?.last_name_paternal || '');
    }
    return [
        toTitleCaseChatText(customer?.firstName || customer?.first_name || ''),
        toTitleCaseChatText(customer?.lastNamePaternal || customer?.last_name_paternal || ''),
        toTitleCaseChatText(customer?.lastNameMaternal || customer?.last_name_maternal || '')
    ].filter(Boolean).join(' ')
        || toTitleCaseChatText(customer?.contactName || customer?.contact_name || '');
}

function buildErpPrimaryLocation(customer = null) {
    const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
    const primary = addresses.find((address) => address?.isPrimary === true || address?.is_primary === true) || addresses[0] || null;
    if (!primary) return '';
    const districtName = toTitleCaseChatText(primary?.districtName || primary?.district_name || '');
    const provinceName = toTitleCaseChatText(primary?.provinceName || primary?.province_name || '');
    const departmentName = toTitleCaseChatText(primary?.departmentName || primary?.department_name || '');
    return [districtName, provinceName, departmentName].filter(Boolean).join(' - ');
}

function resolveQuotedMessagePreview(quotedMessage = null, fallbackMessage = null) {
    const normalizedQuoted = quotedMessage && typeof quotedMessage === 'object' ? quotedMessage : null;
    if (!normalizedQuoted) return null;
    const previewBody = String(normalizedQuoted?.body || '').trim();
    if (previewBody && previewBody.toLowerCase() !== 'mensaje') return normalizedQuoted;
    const safeFallbackMessage = fallbackMessage && typeof fallbackMessage === 'object' ? fallbackMessage : null;
    if (!safeFallbackMessage) return normalizedQuoted;
    const fallbackBody = String(safeFallbackMessage?.body || '').trim()
        || (safeFallbackMessage?.hasMedia ? 'Adjunto' : 'Mensaje');
    return {
        ...normalizedQuoted,
        body: fallbackBody,
        fromMe: Boolean(safeFallbackMessage?.fromMe),
        hasMedia: Boolean(safeFallbackMessage?.hasMedia),
        type: String(normalizedQuoted?.type || safeFallbackMessage?.type || 'chat').trim() || 'chat'
    };
}

function resolveHighestAck(nextAck = 0, currentAck = 0) {
    const safeNext = Number.isFinite(Number(nextAck)) ? Number(nextAck) : 0;
    const safeCurrent = Number.isFinite(Number(currentAck)) ? Number(currentAck) : 0;
    return Math.max(safeNext, safeCurrent);
}

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
    messagesCacheRef,
    pendingOutgoingByChatRef,
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
    setToasts,
    tenantScopeId = ''
}) {
    const { notify } = useUiFeedback();
    const recentInboundNotificationsRef = useRef(new Map());
    const windowFocusedRef = useRef(true);
    const pageVisibleRef = useRef(true);
    const desktopNotificationSummaryRef = useRef({
        totalMessages: 0,
        chats: new Map(),
        latestChatId: '',
        latestModuleId: '',
        latestTitle: '',
        latestPreview: ''
    });
    useEffect(() => {
        const syncWindowAttentionState = () => {
            try {
                pageVisibleRef.current = typeof document !== 'undefined'
                    ? document.visibilityState !== 'hidden'
                    : true;
            } catch (_) {
                pageVisibleRef.current = true;
            }
            try {
                windowFocusedRef.current = typeof document !== 'undefined' && typeof document.hasFocus === 'function'
                    ? Boolean(document.hasFocus())
                    : true;
            } catch (_) {
                windowFocusedRef.current = true;
            }
        };

        const handleWindowFocus = () => {
            windowFocusedRef.current = true;
            syncWindowAttentionState();
            desktopNotificationSummaryRef.current = {
                totalMessages: 0,
                chats: new Map(),
                latestChatId: '',
                latestModuleId: '',
                latestTitle: '',
                latestPreview: ''
            };
        };
        const handleWindowBlur = () => {
            windowFocusedRef.current = false;
            syncWindowAttentionState();
        };
        const handleVisibilityChange = () => {
            syncWindowAttentionState();
        };

        syncWindowAttentionState();
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', handleWindowFocus);
            window.addEventListener('blur', handleWindowBlur);
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        const pruneRecentNotifications = (now = Date.now()) => {
            const cache = recentInboundNotificationsRef.current;
            if (!(cache instanceof Map) || cache.size === 0) return;
            for (const [key, timestamp] of cache.entries()) {
                if (!key || !Number.isFinite(Number(timestamp)) || (now - Number(timestamp)) > 15000) {
                    cache.delete(key);
                }
            }
        };

        const buildIncomingNotificationKey = (msg = {}, relatedChatId = '') => {
            const explicitId = String(msg?.id || '').trim();
            if (explicitId) return `id:${explicitId}`;
            const from = String(msg?.from || '').trim();
            const preview = getMessagePreviewText(msg);
            const timestamp = Number(msg?.timestamp || 0) || 0;
            return `sig:${String(relatedChatId || '').trim()}|${from}|${timestamp}|${preview}`;
        };

        const shouldNotifyIncomingMessage = (msg = {}, relatedChatId = '') => {
            const key = buildIncomingNotificationKey(msg, relatedChatId);
            if (!key) return true;
            const now = Date.now();
            pruneRecentNotifications(now);
            const cache = recentInboundNotificationsRef.current;
            const previousTimestamp = Number(cache.get(key) || 0);
            if (previousTimestamp > 0 && (now - previousTimestamp) < 5000) {
                return false;
            }
            cache.set(key, now);
            return true;
        };

        const pushGroupedToast = ({
            toastId = '',
            chatId = '',
            title = '',
            subtitle = '',
            body = ''
        } = {}) => {
            const safeToastId = String(toastId || '').trim();
            const safeChatId = String(chatId || '').trim();
            if (!safeToastId || !safeChatId) return;

            const toastUpdatedAt = Date.now();
            setToasts((prev) => {
                const previousItems = Array.isArray(prev) ? prev : [];
                const existingToast = previousItems.find((toast) => String(toast?.id || '') === safeToastId);
                const nextToast = {
                    id: safeToastId,
                    chatId: safeChatId,
                    title: sanitizeDisplayText(title || 'Nuevo mensaje'),
                    subtitle: sanitizeDisplayText(subtitle || ''),
                    body: String(body || '').trim(),
                    count: Math.max(1, Number(existingToast?.count || 0) + 1),
                    updatedAt: toastUpdatedAt
                };
                const nextItems = [
                    nextToast,
                    ...previousItems.filter((toast) => String(toast?.id || '') !== safeToastId)
                ];
                return nextItems.slice(0, 4);
            });

            setTimeout(() => {
                setToasts((prev) => (Array.isArray(prev) ? prev : []).filter((toast) => !(
                    String(toast?.id || '') === safeToastId
                    && Number(toast?.updatedAt || 0) === toastUpdatedAt
                )));
            }, 6500);
        };

        const syncActiveMessages = (chatId, updater) => {
            const activeChatId = String(activeChatIdRef.current || '').trim();
            if (!chatId || !activeChatId || !chatIdsReferSameScope(chatId, activeChatId)) return;
            setMessages((prev) => {
                const next = typeof updater === 'function' ? updater(Array.isArray(prev) ? prev : []) : prev;
                return Array.isArray(next) ? next : prev;
            });
        };
        const buildRetryPayloadSignature = (retryPayload = {}) => {
            const payload = retryPayload && typeof retryPayload === 'object' ? retryPayload : {};
            const eventName = String(payload?.eventName || '').trim();
            const data = payload?.payload && typeof payload.payload === 'object' ? payload.payload : {};
            const product = data?.product && typeof data.product === 'object' ? data.product : {};
            const quickReply = data?.quickReply && typeof data.quickReply === 'object' ? data.quickReply : {};
            const parsePrice = (value, fallback = 0) => {
                const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
                if (Number.isFinite(parsed)) return parsed;
                return Number.isFinite(fallback) ? fallback : 0;
            };
            const buildCatalogCaption = (catalogProduct = {}) => {
                const title = String(catalogProduct?.title || catalogProduct?.name || 'Producto').trim() || 'Producto';
                const finalPrice = parsePrice(catalogProduct?.price, 0);
                const regularPrice = parsePrice(catalogProduct?.regularPrice ?? catalogProduct?.regular_price, finalPrice);
                const lines = [`*${title}*`];

                if (regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice) {
                    const discountAmount = Math.max(regularPrice - finalPrice, 0);
                    lines.push(`Precio regular: S/ ${regularPrice.toFixed(2)}`);
                    lines.push(`*Descuento: S/ ${discountAmount.toFixed(2)}*`);
                    lines.push(`*PRECIO FINAL: S/ ${finalPrice.toFixed(2)}*`);
                } else if (finalPrice > 0) {
                    lines.push(`*PRECIO FINAL: S/ ${finalPrice.toFixed(2)}*`);
                } else {
                    lines.push('*PRECIO FINAL: CONSULTAR*');
                }

                const description = String(catalogProduct?.description || '').replace(/\s+/g, ' ').trim();
                if (description) {
                    lines.push('');
                    lines.push(`Detalle: ${description.length > 280 ? `${description.slice(0, 277)}...` : description}`);
                }
                return lines.join('\n');
            };
            const normalizedBody = String(
                eventName === 'send_catalog_product'
                    ? buildCatalogCaption(product)
                    : (data?.body || quickReply?.text || '')
            ).trim();
            const mediaUrl = String(
                data?.mediaUrl
                || product?.imageUrl
                || product?.image
                || quickReply?.mediaUrl
                || quickReply?.mediaAssets?.[0]?.url
                || ''
            ).trim() || null;
            const hasMedia = Boolean(
                data?.mediaData
                || data?.mediaUrl
                || data?.mimetype
                || data?.filename
                || product?.imageUrl
                || product?.image
                || quickReply?.mediaUrl
                || quickReply?.mediaMimeType
                || quickReply?.mediaFileName
                || (Array.isArray(quickReply?.mediaAssets) && quickReply.mediaAssets.length > 0)
            );

            return {
                eventName,
                body: normalizedBody,
                hasMedia,
                mediaUrl,
                title: String(product?.title || product?.name || '').trim() || null
            };
        };
        const normalizeComparableBody = (value = '') => String(value || '')
            .replace(/\*/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const consumePendingOutgoing = (chatId, incomingMessage = {}) => {
            const safeChatId = String(chatId || '').trim();
            const pendingByChat = pendingOutgoingByChatRef?.current instanceof Map
                ? pendingOutgoingByChatRef.current.get(safeChatId)
                : null;
            if (!(pendingByChat instanceof Map) || pendingByChat.size === 0) return null;

            const incomingBody = String(incomingMessage?.body || '').trim();
            const incomingHasMedia = Boolean(incomingMessage?.hasMedia);
            const normalizedIncomingBody = normalizeComparableBody(incomingBody);
            const incomingMediaUrl = String(incomingMessage?.mediaUrl || '').trim() || null;
            for (const [clientTempId, entry] of pendingByChat.entries()) {
                const retrySignature = buildRetryPayloadSignature(entry?.retryPayload);
                const retryBody = String(retrySignature?.body || '').trim();
                const normalizedRetryBody = normalizeComparableBody(retryBody);
                const retryHasMedia = Boolean(retrySignature?.hasMedia);
                const sameBody = normalizedRetryBody === normalizedIncomingBody;
                const bodyContained = Boolean(
                    normalizedRetryBody
                    && normalizedIncomingBody
                    && (
                        normalizedIncomingBody.includes(normalizedRetryBody)
                        || normalizedRetryBody.includes(normalizedIncomingBody)
                    )
                );
                const sameMediaUrl = Boolean(
                    retrySignature?.mediaUrl
                    && incomingMediaUrl
                    && retrySignature.mediaUrl === incomingMediaUrl
                );
                const sameCatalogTitle = Boolean(
                    retrySignature?.eventName === 'send_catalog_product'
                    && retrySignature?.title
                    && normalizedIncomingBody.includes(normalizeComparableBody(retrySignature.title))
                );
                const sameMediaKind = retryHasMedia === incomingHasMedia;
                if (!sameBody && !bodyContained && !sameMediaUrl && !sameCatalogTitle && !(incomingHasMedia && !incomingBody && retryHasMedia)) continue;
                if (!sameMediaKind) continue;
                if (entry?.timeoutId) clearTimeout(entry.timeoutId);
                pendingByChat.delete(clientTempId);
                if (pendingByChat.size === 0) {
                    pendingOutgoingByChatRef.current.delete(safeChatId);
                }
                return clientTempId;
            }
            return null;
        };

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
                        reactions: Array.isArray(m?.reactions) ? m.reactions : [],
                        sentViaModuleImageUrl: normalizeModuleImageUrl(m?.sentViaModuleImageUrl || '') || null
                    };

                    if (!normalizedMessage?.fromMe) return normalizedMessage;

                    return {
                        ...normalizedMessage,
                        sentByUserId: String(normalizedMessage?.sentByUserId || '').trim() || null,
                        sentByName: String(normalizedMessage?.sentByName || normalizedMessage?.sentByEmail || '').trim() || null,
                        sentByEmail: String(normalizedMessage?.sentByEmail || '').trim() || null,
                        sentByRole: String(normalizedMessage?.sentByRole || '').trim() || null
                    };
                })
                : [];
            const normalizedMessagesById = new Map(
                normalizedMessages
                    .map((message) => [String(message?.id || '').trim(), message])
                    .filter(([id]) => Boolean(id))
            );
            const hydratedMessages = normalizedMessages.map((message) => {
                const quotedId = String(message?.quotedMessage?.id || '').trim();
                if (!quotedId) return message;
                return {
                    ...message,
                    quotedMessage: resolveQuotedMessagePreview(message?.quotedMessage, normalizedMessagesById.get(quotedId) || null)
                };
            });
            setMessages((prev) => {
                const previous = Array.isArray(prev) ? prev : [];
                if (previous.length === 0) return hydratedMessages;
                if (hydratedMessages.length === 0) return previous;

                const mergedById = new Map(
                    previous
                        .map((m) => [String(m?.id || '').trim(), m])
                        .filter(([id]) => Boolean(id))
                );

                hydratedMessages.forEach((message) => {
                    const id = String(message?.id || '').trim();
                    if (!id) return;
                    const existing = mergedById.get(id);
                    mergedById.set(id, existing ? {
                        ...existing,
                        ...message,
                        ack: resolveHighestAck(message?.ack, existing?.ack)
                    } : message);
                });

                const merged = Array.from(mergedById.values());
                merged.sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));
                return merged;
            });
            const activeChatId = String(activeChatIdRef.current || '').trim();
            if (activeChatId) {
                writeCachedMessages(messagesCacheRef, activeChatId, hydratedMessages);
            }
            const nextWindowOpen = Boolean(data?.windowOpen);
            const nextWindowExpiresAt = String(data?.windowExpiresAt || '').trim() || null;
            setChats((prev) => prev.map((chat) => (
                chatIdsReferSameScope(String(chat?.id || ''), resolvedChatId)
                    ? {
                        ...chat,
                        windowOpen: nextWindowOpen,
                        windowExpiresAt: nextWindowExpiresAt
                    }
                    : chat
            )));
        });

        socket.on('chat_media', ({ chatId, messageId, mediaData, mimetype, filename, fileSizeBytes }) => {
            const active = String(activeChatIdRef.current || '');
            const incoming = String(chatId || '').trim();
            if (!incoming || !chatIdsReferSameScope(incoming, active)) return;
            if (!messageId || !mediaData) return;
            const nextFilename = normalizeMessageFilename(filename);
            const nextSize = Number.isFinite(Number(fileSizeBytes)) ? Number(fileSizeBytes) : null;
            syncActiveMessages(incoming, (prev) => prev.map((m) => {
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
            patchCachedMessages(messagesCacheRef, incoming, (prev) => prev.map((m) => {
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

        socket.on('message_updated', ({ id, chatId, scopeModuleId, mediaUrl, mediaPath, mimetype, filename, fileSizeBytes, mediaData, hasMedia, updatedAt, quotedMessage, deliveryError }) => {
            const messageId = String(id || '').trim();
            if (!messageId) return;

            const incomingChatId = normalizeChatScopedId(chatId || '', scopeModuleId || '');
            const active = String(activeChatIdRef.current || '');
            if (incomingChatId && active && !chatIdsReferSameScope(incomingChatId, active)) return;

            const nextFilename = normalizeMessageFilename(filename);
            const nextSize = Number.isFinite(Number(fileSizeBytes)) ? Number(fileSizeBytes) : null;

            syncActiveMessages(incomingChatId, (prev) => prev.map((message) => {
                if (String(message?.id || '').trim() !== messageId) return message;

                const currentFilename = normalizeMessageFilename(message?.filename);
                const shouldReplaceFilename = Boolean(nextFilename) && (!currentFilename || isGenericFilename(currentFilename) || isMachineLikeFilename(currentFilename));

                return {
                    ...message,
                    hasMedia: hasMedia !== false,
                    mediaUrl: String(mediaUrl || '').trim() || message?.mediaUrl || null,
                    mediaPath: String(mediaPath || '').trim() || message?.mediaPath || null,
                    mediaData: mediaData || message?.mediaData || null,
                    mimetype: String(mimetype || '').trim() || message?.mimetype || null,
                    filename: shouldReplaceFilename ? nextFilename : currentFilename,
                    fileSizeBytes: Number.isFinite(nextSize) ? nextSize : (Number.isFinite(Number(message?.fileSizeBytes)) ? Number(message.fileSizeBytes) : null),
                    quotedMessage: resolveQuotedMessagePreview(
                        normalizeQuotedMessage(quotedMessage || message?.quotedMessage),
                        message
                    ),
                    deliveryError: deliveryError && typeof deliveryError === 'object'
                        ? {
                            code: Number.isFinite(Number(deliveryError?.code)) ? Number(deliveryError.code) : null,
                            message: String(deliveryError?.message || '').trim() || message?.deliveryError?.message || 'Meta rechazo la entrega del mensaje.'
                        }
                        : (message?.deliveryError || null),
                    updatedAt: String(updatedAt || '').trim() || message?.updatedAt || null
                };
            }));
            patchCachedMessages(messagesCacheRef, incomingChatId, (prev) => prev.map((message) => {
                if (String(message?.id || '').trim() !== messageId) return message;
                const currentFilename = normalizeMessageFilename(message?.filename);
                const shouldReplaceFilename = Boolean(nextFilename) && (!currentFilename || isGenericFilename(currentFilename) || isMachineLikeFilename(currentFilename));
                return {
                    ...message,
                    hasMedia: hasMedia !== false,
                    mediaUrl: String(mediaUrl || '').trim() || message?.mediaUrl || null,
                    mediaPath: String(mediaPath || '').trim() || message?.mediaPath || null,
                    mediaData: mediaData || message?.mediaData || null,
                    mimetype: String(mimetype || '').trim() || message?.mimetype || null,
                    filename: shouldReplaceFilename ? nextFilename : currentFilename,
                    fileSizeBytes: Number.isFinite(nextSize) ? nextSize : (Number.isFinite(Number(message?.fileSizeBytes)) ? Number(message.fileSizeBytes) : null),
                    quotedMessage: resolveQuotedMessagePreview(
                        normalizeQuotedMessage(quotedMessage || message?.quotedMessage),
                        message
                    ),
                    deliveryError: deliveryError && typeof deliveryError === 'object'
                        ? {
                            code: Number.isFinite(Number(deliveryError?.code)) ? Number(deliveryError.code) : null,
                            message: String(deliveryError?.message || '').trim() || message?.deliveryError?.message || 'Meta rechazo la entrega del mensaje.'
                        }
                        : (message?.deliveryError || null),
                    updatedAt: String(updatedAt || '').trim() || message?.updatedAt || null
                };
            }));
        });

        socket.on('message_reaction', ({ messageId, emoji, senderId, chatId, baseChatId, scopeModuleId, timestamp }) => {
            const safeMessageId = String(messageId || '').trim();
            const safeEmoji = String(emoji || '').trim();
            if (!safeMessageId || !safeEmoji) return;

            const incomingChatId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
            const active = String(activeChatIdRef.current || '');
            if (incomingChatId && active && !chatIdsReferSameScope(incomingChatId, active)) return;

            syncActiveMessages(incomingChatId, (prev) => prev.map((message) => {
                if (String(message?.id || '').trim() !== safeMessageId) return message;

                const existingReactions = Array.isArray(message?.reactions) ? message.reactions : [];
                const safeSenderId = String(senderId || '').trim() || null;
                const nextReaction = {
                    emoji: safeEmoji,
                    senderId: safeSenderId,
                    timestamp: Number(timestamp || 0) || Math.floor(Date.now() / 1000)
                };

                const deduped = existingReactions.filter((reaction) => {
                    const reactionSenderId = String(reaction?.senderId || '').trim() || null;
                    if (!safeSenderId) return true;
                    return reactionSenderId !== safeSenderId;
                });

                return {
                    ...message,
                    reactions: [...deduped, nextReaction]
                };
            }));
            patchCachedMessages(messagesCacheRef, incomingChatId, (prev) => prev.map((message) => {
                if (String(message?.id || '').trim() !== safeMessageId) return message;
                const existingReactions = Array.isArray(message?.reactions) ? message.reactions : [];
                const safeSenderId = String(senderId || '').trim() || null;
                const nextReaction = {
                    emoji: safeEmoji,
                    senderId: safeSenderId,
                    timestamp: Number(timestamp || 0) || Math.floor(Date.now() / 1000)
                };
                const deduped = existingReactions.filter((reaction) => {
                    const reactionSenderId = String(reaction?.senderId || '').trim() || null;
                    if (!safeSenderId) return true;
                    return reactionSenderId !== safeSenderId;
                });
                return {
                    ...message,
                    reactions: [...deduped, nextReaction]
                };
            }));
        });
        socket.on('reaction_sent', ({ messageId, emoji, chatId, baseChatId, scopeModuleId, timestamp }) => {
            const safeMessageId = String(messageId || '').trim();
            const safeEmoji = String(emoji || '').trim();
            if (!safeMessageId || !safeEmoji) return;

            const incomingChatId = normalizeChatScopedId(chatId || baseChatId || '', scopeModuleId || '');
            const active = String(activeChatIdRef.current || '');
            if (incomingChatId && active && !chatIdsReferSameScope(incomingChatId, active)) return;

            const sessionSenderIdentity = resolveSessionSenderIdentity();
            const safeSenderId = String(
                sessionSenderIdentity?.id
                || sessionSenderIdentity?.email
                || sessionSenderIdentity?.name
                || 'self'
            ).trim() || 'self';

            syncActiveMessages(incomingChatId, (prev) => prev.map((message) => {
                if (String(message?.id || '').trim() !== safeMessageId) return message;

                const existingReactions = Array.isArray(message?.reactions) ? message.reactions : [];
                const nextReaction = {
                    emoji: safeEmoji,
                    senderId: safeSenderId,
                    timestamp: Number(timestamp || 0) || Math.floor(Date.now() / 1000)
                };

                const deduped = existingReactions.filter((reaction) => {
                    const reactionSenderId = String(reaction?.senderId || '').trim() || null;
                    return reactionSenderId !== safeSenderId;
                });

                return {
                    ...message,
                    reactions: [...deduped, nextReaction]
                };
            }));
            patchCachedMessages(messagesCacheRef, incomingChatId, (prev) => prev.map((message) => {
                if (String(message?.id || '').trim() !== safeMessageId) return message;
                const existingReactions = Array.isArray(message?.reactions) ? message.reactions : [];
                const nextReaction = {
                    emoji: safeEmoji,
                    senderId: safeSenderId,
                    timestamp: Number(timestamp || 0) || Math.floor(Date.now() / 1000)
                };
                const deduped = existingReactions.filter((reaction) => {
                    const reactionSenderId = String(reaction?.senderId || '').trim() || null;
                    return reactionSenderId !== safeSenderId;
                });
                return {
                    ...message,
                    reactions: [...deduped, nextReaction]
                };
            }));
        });

        socket.on('contact_info', (contact) => {
            const participantsList = normalizeParticipantList(contact?.participantsList);
            const participantsCount = Number(contact?.participants || contact?.chatState?.participantsCount || participantsList.length || 0) || 0;
            const erpCustomer = contact?.erpCustomer && typeof contact.erpCustomer === 'object'
                ? {
                    ...contact.erpCustomer,
                    contactName: sanitizeDisplayText(contact?.erpCustomer?.contactName || ''),
                    firstName: sanitizeDisplayText(contact?.erpCustomer?.firstName || contact?.erpCustomer?.first_name || ''),
                    lastNamePaternal: sanitizeDisplayText(contact?.erpCustomer?.lastNamePaternal || contact?.erpCustomer?.last_name_paternal || ''),
                    lastNameMaternal: sanitizeDisplayText(contact?.erpCustomer?.lastNameMaternal || contact?.erpCustomer?.last_name_maternal || ''),
                    email: sanitizeDisplayText(contact?.erpCustomer?.email || ''),
                    preferredLanguage: sanitizeDisplayText(contact?.erpCustomer?.preferredLanguage || ''),
                    tags: Array.isArray(contact?.erpCustomer?.tags)
                        ? contact.erpCustomer.tags.map((entry) => sanitizeDisplayText(entry || '')).filter(Boolean)
                        : [],
                    addresses: Array.isArray(contact?.erpCustomer?.addresses)
                        ? contact.erpCustomer.addresses.map((address = {}) => ({
                            ...address,
                            street: sanitizeDisplayText(address?.street || ''),
                            districtName: sanitizeDisplayText(address?.districtName || ''),
                            provinceName: sanitizeDisplayText(address?.provinceName || ''),
                            departmentName: sanitizeDisplayText(address?.departmentName || '')
                        }))
                        : []
                }
                : null;
            const erpDisplayName = buildErpChatDisplayName(erpCustomer);
            const erpLocation = buildErpPrimaryLocation(erpCustomer);
            const whatsappContactName = toTitleCaseChatText(contact?.pushname || contact?.name || contact?.shortName || '');
            const subtitleParts = [];
            if (whatsappContactName && whatsappContactName.toLowerCase() !== erpDisplayName.toLowerCase()) {
                subtitleParts.push(whatsappContactName);
            }
            if (erpLocation) {
                subtitleParts.push(erpLocation);
            }
            const resolvedSubtitle = subtitleParts.join(' • ') || whatsappContactName || erpLocation || '';
            const normalizedContact = {
                ...contact,
                name: sanitizeDisplayText(erpDisplayName || toTitleCaseChatText(contact?.name || contact?.pushname || '')),
                pushname: sanitizeDisplayText(toTitleCaseChatText(contact?.pushname || '')),
                shortName: sanitizeDisplayText(toTitleCaseChatText(contact?.shortName || '')),
                profilePicUrl: normalizeProfilePhotoUrl(contact?.profilePicUrl),
                status: repairMojibake(contact?.status || ''),
                windowOpen: Boolean(contact?.windowOpen),
                windowExpiresAt: String(contact?.windowExpiresAt || '').trim() || null,
                participants: participantsCount,
                participantsList,
                erpCustomer,
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
                subtitle: resolvedSubtitle,
                status: contact?.status || ''
            });

            setChats((prev) => {
                const existing = prev.find((c) => chatIdsReferSameScope(String(c?.id || ''), contactId));
                if (!existing) return prev;

                const fallbackName = sanitizeDisplayText(erpDisplayName || toTitleCaseChatText(contact?.name || contact?.pushname || contact?.shortName || existing?.name || ''));
                const subtitleName = sanitizeDisplayText(resolvedSubtitle);
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
                    participantsList: normalizedContact.participantsList || existing?.participantsList || [],
                    customerId: erpCustomer?.customerId || existing?.customerId || null,
                    erpCustomerName: erpDisplayName || existing?.erpCustomerName || null,
                    firstName: erpCustomer?.firstName || erpCustomer?.first_name || existing?.firstName || existing?.first_name || null,
                    lastNamePaternal: erpCustomer?.lastNamePaternal || erpCustomer?.last_name_paternal || existing?.lastNamePaternal || existing?.last_name_paternal || null,
                    lastNameMaternal: erpCustomer?.lastNameMaternal || erpCustomer?.last_name_maternal || existing?.lastNameMaternal || existing?.last_name_maternal || null,
                    contactName: erpCustomer?.contactName || erpCustomer?.contact_name || existing?.contactName || existing?.contact_name || null,
                    erpCustomer: erpCustomer || existing?.erpCustomer || null,
                    windowOpen: typeof normalizedContact?.windowOpen === 'boolean' ? normalizedContact.windowOpen : existing?.windowOpen,
                    windowExpiresAt: normalizedContact?.windowExpiresAt || existing?.windowExpiresAt || null
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
            const relatedWindowExpiresAt = !msg?.fromMe && Number(msg?.timestamp || 0) > 0
                ? new Date((Number(msg.timestamp) * 1000) + (24 * 60 * 60 * 1000)).toISOString()
                : null;
            const shouldRaiseIncomingNotification = !msg?.fromMe
                ? shouldNotifyIncomingMessage(msg, relatedChatId)
                : false;

            const isAttentionOutsideApp = !pageVisibleRef.current || !windowFocusedRef.current;
            const incomingPreview = getMessagePreviewText(msg);
            const existingChat = (Array.isArray(chatsRef.current) ? chatsRef.current : []).find((chat) => (
                chatIdsReferSameScope(String(chat?.id || ''), relatedChatId)
            )) || null;
            const toastId = String(relatedChatId || msg?.from || msg?.id || Date.now()).trim();
            const toastTitle = sanitizeDisplayText(
                existingChat?.name
                || msg?.notifyName
                || msg?.senderPushname
                || msg?.from
                || 'Nuevo mensaje'
            );
            const toastSubtitle = sanitizeDisplayText(existingChat?.subtitle || '');
            const notificationModuleId = String(
                existingChat?.scopeModuleId
                || existingChat?.lastMessageModuleId
                || msg?.scopeModuleId
                || msg?.sentViaModuleId
                || ''
            ).trim().toLowerCase();

            if (
                !msg.fromMe
                && shouldRaiseIncomingNotification
                && isAttentionOutsideApp
            ) {
                const canUseDesktopNotifications = typeof Notification !== 'undefined' && Notification.permission === 'granted';
                const desktopSummary = desktopNotificationSummaryRef.current || {
                    totalMessages: 0,
                    chats: new Map(),
                    latestChatId: '',
                    latestModuleId: '',
                    latestTitle: '',
                    latestPreview: ''
                };
                const chatCounts = desktopSummary.chats instanceof Map ? desktopSummary.chats : new Map();
                chatCounts.set(toastId, Math.max(1, Number(chatCounts.get(toastId) || 0) + 1));
                desktopSummary.chats = chatCounts;
                desktopSummary.totalMessages = Math.max(1, Number(desktopSummary.totalMessages || 0) + 1);
                desktopSummary.latestChatId = relatedChatId;
                desktopSummary.latestModuleId = notificationModuleId;
                desktopSummary.latestTitle = toastTitle || 'Nuevo mensaje';
                desktopSummary.latestPreview = incomingPreview;
                desktopNotificationSummaryRef.current = desktopSummary;

                if (canUseDesktopNotifications) {
                    const distinctChats = chatCounts.size;
                    const totalMessages = Math.max(1, Number(desktopSummary.totalMessages || 0));
                    const notificationTitle = distinctChats > 1
                        ? `${distinctChats} chats nuevos`
                        : (toastTitle || 'Nuevo mensaje');
                    const notificationBody = distinctChats > 1
                        ? `${totalMessages} mensajes nuevos. Ultimo: ${desktopSummary.latestTitle}: ${incomingPreview}`
                        : incomingPreview;
                    const desktopNotification = new Notification(notificationTitle, {
                        body: notificationBody,
                        icon: '/favicon.ico',
                        tag: `lavitat_desktop_${String(tenantScopeId || 'default').trim().toLowerCase() || 'default'}`,
                        renotify: true
                    });

                    desktopNotification.onclick = () => {
                        const targetTenantId = String(tenantScopeId || '').trim();
                        const targetChatId = String(desktopSummary.latestChatId || relatedChatId || '').trim();
                        const targetModuleId = String(desktopSummary.latestModuleId || notificationModuleId || '').trim().toLowerCase();
                        if (targetTenantId && targetChatId) {
                            queueChatNotificationOpenRequest({
                                tenantId: targetTenantId,
                                chatId: targetChatId,
                                moduleId: targetModuleId,
                                source: 'desktop_notification'
                            });
                            openOrFocusWorkspaceTab({
                                mode: 'operation',
                                tenantId: targetTenantId,
                                moduleId: targetModuleId,
                                source: 'notification'
                            });
                        }
                        try {
                            window.focus?.();
                        } catch (_) { }
                        if (chatIdsReferSameScope(String(activeChatIdRef.current || ''), targetChatId)) {
                            handleChatSelect?.(targetChatId, { clearSearch: true });
                        }
                        desktopNotificationSummaryRef.current = {
                            totalMessages: 0,
                            chats: new Map(),
                            latestChatId: '',
                            latestModuleId: '',
                            latestTitle: '',
                            latestPreview: ''
                        };
                        desktopNotification.close?.();
                    };
                }

                pushGroupedToast({
                    toastId,
                    chatId: relatedChatId,
                    title: toastTitle,
                    subtitle: toastSubtitle,
                    body: incomingPreview
                });
            } else if (
                !msg.fromMe
                && shouldRaiseIncomingNotification
                && !chatIdsReferSameScope(relatedChatId, String(activeChatIdRef.current || ''))
            ) {
                pushGroupedToast({
                    toastId,
                    chatId: relatedChatId,
                    title: toastTitle,
                    subtitle: toastSubtitle,
                    body: incomingPreview
                });
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
                    windowOpen: msg.fromMe ? existing?.windowOpen : true,
                    windowExpiresAt: msg.fromMe ? (existing?.windowExpiresAt || null) : relatedWindowExpiresAt,
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
            const normalizedIncoming = {
                ...msg,
                body: repairMojibake(msg?.body || ''),
                location: normalizeMessageLocation(msg?.location),
                filename: normalizeMessageFilename(msg?.filename),
                fileSizeBytes: Number.isFinite(Number(msg?.fileSizeBytes)) ? Number(msg.fileSizeBytes) : null,
                canEdit: Boolean(msg?.canEdit),
                quotedMessage: resolveQuotedMessagePreview(normalizeQuotedMessage(msg?.quotedMessage), null),
                reactions: Array.isArray(msg?.reactions) ? msg.reactions : []
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

            const enrichedIncoming = {
                ...normalizedIncoming,
                sentByUserId: String(normalizedIncoming?.sentByUserId || '').trim() || null,
                sentByName: String(normalizedIncoming?.sentByName || normalizedIncoming?.sentByEmail || '').trim() || null,
                sentByEmail: String(normalizedIncoming?.sentByEmail || '').trim() || null,
                sentByRole: String(normalizedIncoming?.sentByRole || '').trim() || null,
                sentViaModuleImageUrl: normalizeModuleImageUrl(normalizedIncoming?.sentViaModuleImageUrl || '') || null
            };
            const matchedClientTempId = enrichedIncoming?.fromMe
                ? consumePendingOutgoing(relatedChatId, enrichedIncoming)
                : null;
            const explicitClientTempId = String(enrichedIncoming?.clientTempId || '').trim();
            const replacementClientTempId = matchedClientTempId || explicitClientTempId || null;
            const reconciledIncoming = {
                ...enrichedIncoming,
                clientTempId: replacementClientTempId,
                optimistic: false,
                status: Number(enrichedIncoming?.ack || 0) >= 3 ? 'read' : Number(enrichedIncoming?.ack || 0) >= 2 ? 'delivered' : Number(enrichedIncoming?.ack || 0) >= 1 ? 'sent' : 'sending'
            };

            if (!msg?.fromMe && chatIdsReferSameScope(relatedChatId, String(activeChatIdRef.current || ''))) {
                setClientContact((prev) => {
                    const safePrev = prev && typeof prev === 'object' ? prev : {};
                    return {
                        ...safePrev,
                        windowOpen: true,
                        windowExpiresAt: relatedWindowExpiresAt
                    };
                });
            }

            patchCachedMessages(messagesCacheRef, relatedChatId, (prev) => {
                const incomingId = String(reconciledIncoming?.id || '').trim();
                if (!incomingId) return prev;
                if (replacementClientTempId) {
                    const existing = (Array.isArray(prev) ? prev : []).find((message) => String(message?.clientTempId || '').trim() === replacementClientTempId);
                    return replaceMessageByClientTempId(prev, replacementClientTempId, mergeTemplateMessageContent(existing, reconciledIncoming));
                }
                const existing = (Array.isArray(prev) ? prev : []).find((message) => String(message?.id || '').trim() === incomingId);
                return upsertMessageById(prev, mergeTemplateMessageContent(existing, reconciledIncoming));
            });

            syncActiveMessages(relatedChatId, (prev) => {
                const normalizedIncoming = {
                    ...reconciledIncoming
                };

                const incomingId = String(normalizedIncoming?.id || '').trim();
                if (incomingId) {
                    const existingIndex = prev.findIndex((m) => String(m?.id || '').trim() === incomingId);
                    if (existingIndex >= 0) {
                        const existing = prev[existingIndex] || {};
                        const preserveOptimisticAttribution = Boolean(existing?.optimistic);
                        const existingOrder = existing?.order && typeof existing.order === 'object' ? existing.order : null;
                        const incomingOrder = normalizedIncoming?.order && typeof normalizedIncoming.order === 'object'
                            ? normalizedIncoming.order
                            : null;
                        const merged = {
                            ...existing,
                            ...normalizedIncoming,
                            ack: resolveHighestAck(normalizedIncoming?.ack, existing?.ack),
                            sentByUserId: String(
                                normalizedIncoming?.sentByUserId
                                || (preserveOptimisticAttribution ? existing?.sentByUserId : '')
                            ).trim() || null,
                            sentByName: String(
                                normalizedIncoming?.sentByName
                                || normalizedIncoming?.sentByEmail
                                || (preserveOptimisticAttribution ? (existing?.sentByName || existing?.sentByEmail) : '')
                            ).trim() || null,
                            sentByEmail: String(
                                normalizedIncoming?.sentByEmail
                                || (preserveOptimisticAttribution ? existing?.sentByEmail : '')
                            ).trim() || null,
                            sentByRole: String(
                                normalizedIncoming?.sentByRole
                                || (preserveOptimisticAttribution ? existing?.sentByRole : '')
                            ).trim() || null,
                            sentViaModuleId: String(normalizedIncoming?.sentViaModuleId || existing?.sentViaModuleId || '').trim() || null,
                            sentViaModuleName: String(normalizedIncoming?.sentViaModuleName || existing?.sentViaModuleName || '').trim() || null,
                            sentViaModuleImageUrl: normalizeModuleImageUrl(normalizedIncoming?.sentViaModuleImageUrl || existing?.sentViaModuleImageUrl || '') || null,
                            sentViaTransport: String(normalizedIncoming?.sentViaTransport || existing?.sentViaTransport || '').trim() || null,
                            quotedMessage: resolveQuotedMessagePreview(
                                normalizeQuotedMessage(normalizedIncoming?.quotedMessage || existing?.quotedMessage),
                                existing
                            ),
                            status: resolveHighestAck(normalizedIncoming?.ack, existing?.ack) >= 3
                                ? 'read'
                                : resolveHighestAck(normalizedIncoming?.ack, existing?.ack) >= 2
                                    ? 'delivered'
                                    : resolveHighestAck(normalizedIncoming?.ack, existing?.ack) >= 1
                                        ? 'sent'
                                        : 'sending',
                            reactions: Array.isArray(normalizedIncoming?.reactions) && normalizedIncoming.reactions.length > 0
                                ? normalizedIncoming.reactions
                                : (Array.isArray(existing?.reactions) ? existing.reactions : []),
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
                        next[existingIndex] = mergeTemplateMessageContent(existing, merged);
                        return next;
                    }
                }

                if (replacementClientTempId) {
                    const existing = prev.find((message) => String(message?.clientTempId || '').trim() === replacementClientTempId);
                    return replaceMessageByClientTempId(prev, replacementClientTempId, mergeTemplateMessageContent(existing, normalizedIncoming));
                }
                return [...prev, mergeTemplateMessageContent(null, normalizedIncoming)];
            });
        });

        socket.on('quote_sent', (event = {}) => {
            const messageId = String(event?.messageId || '').trim();
            const quoteId = String(event?.quoteId || '').trim();
            if (!messageId || !quoteId) return;

            const incomingChatId = String(event?.chatId || event?.baseChatId || event?.to || '').trim();
            const activeChatId = String(activeChatIdRef.current || '').trim();
            if (incomingChatId && activeChatId && !chatIdsReferSameScope(incomingChatId, activeChatId)) return;

            const updateQuoteMessage = (prev) => {
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
            };
            if (activeChatId && (!incomingChatId || chatIdsReferSameScope(incomingChatId, activeChatId))) {
                setMessages(updateQuoteMessage);
            }
            patchCachedMessages(messagesCacheRef, incomingChatId || activeChatId, updateQuoteMessage);
        });

        socket.on('error', (msg) => {
            if (typeof msg === 'string' && msg.trim()) notify({ type: 'error', message: msg });
        });

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('focus', handleWindowFocus);
                window.removeEventListener('blur', handleWindowBlur);
            }
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
            [
                'tenant_context',
                'wa_module_context',
                'wa_module_selected',
                'wa_module_error',
                'chats',
                'chat_updated',
                'chat_history',
                'chat_media',
                'message_updated',
                'message_reaction',
                'reaction_sent',
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
