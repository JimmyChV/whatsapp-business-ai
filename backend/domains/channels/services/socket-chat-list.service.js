const { queryPostgres } = require('../../../config/persistence-runtime');

function createSocketChatListService({
    runtimeStore,
    waClient,
    tenantLabelService,
    conversationOpsService,
    tenantScheduleService,
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
    coerceHumanPhone,
    resolveRegisteredNumber,
    toLabelTokenSet,
    matchesTokenSet,
    runWithConcurrency,
    getWaRuntime
} = {}) {
    const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

    const invalidateChatListCache = () => {
        runtimeStore.set('chatListCache', { items: [], updatedAt: 0 });
    };

    const getActiveTenantSchedule = async (tenantId = 'default') => {
        const cacheKey = `activeSchedule::${String(tenantId || 'default').trim() || 'default'}`;
        const scheduleCache = runtimeStore.get('scheduleCache', new Map());
        const cached = scheduleCache.get(cacheKey);
        const cacheTtlMs = 60 * 1000;
        if (cached && (Date.now() - Number(cached.updatedAt || 0)) <= cacheTtlMs) {
            return cached.value || null;
        }

        let schedule = null;
        try {
            if (typeof tenantScheduleService?.getActiveSchedule === 'function') {
                schedule = await tenantScheduleService.getActiveSchedule(tenantId);
            } else if (typeof tenantScheduleService?.listSchedules === 'function') {
                const items = await tenantScheduleService.listSchedules(tenantId);
                schedule = (Array.isArray(items) ? items : []).find((item) => item?.isActive !== false) || null;
            }
        } catch (_) {
            schedule = null;
        }

        scheduleCache.set(cacheKey, { value: schedule || null, updatedAt: Date.now() });
        runtimeStore.set('scheduleCache', scheduleCache);
        return schedule || null;
    };

    const toIsoFromUnixSeconds = (timestampUnix = null, fallbackDate = null) => {
        const unixSeconds = Number(timestampUnix || 0);
        if (Number.isFinite(unixSeconds) && unixSeconds > 0) {
            return new Date(unixSeconds * 1000).toISOString();
        }
        const fallback = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
        if (Number.isFinite(fallback.getTime())) return fallback.toISOString();
        return null;
    };

    const normalizeWindowStatus = (value = '') => {
        const status = String(value || '').trim().toLowerCase();
        return ['open', 'expires_outside_hours', 'expired'].includes(status) ? status : null;
    };

    const resolveLaboralWindowDisplay = (activeSchedule = null, windowExpiresAt = null, measuredAt = new Date()) => {
        if (typeof tenantScheduleService?.getRemainingLaboralMinutes !== 'function') {
            return { laboralMinutesRemaining: null, windowStatus: null };
        }
        const result = tenantScheduleService.getRemainingLaboralMinutes(activeSchedule, windowExpiresAt, measuredAt);
        if (result && typeof result === 'object') {
            return {
                laboralMinutesRemaining: Number.isFinite(Number(result.minutes))
                    ? Math.max(0, Math.floor(Number(result.minutes)))
                    : null,
                windowStatus: normalizeWindowStatus(result.status)
            };
        }
        return {
            laboralMinutesRemaining: Number.isFinite(Number(result))
                ? Math.max(0, Math.floor(Number(result)))
                : null,
            windowStatus: null
        };
    };

    const persistWindowMetadataBatch = async (tenantId = 'default', items = []) => {
        const resolvedTenantId = String(tenantId || 'default').trim() || 'default';
        const payload = (Array.isArray(items) ? items : [])
            .map((item) => ({
                chat_id: String(item?.baseChatId || resolveBaseChatIdFromSummary(item) || '').trim(),
                window_expires_at: item?.windowExpiresAt || null,
                window_open: typeof item?.windowOpen === 'boolean' ? item.windowOpen : false,
                window_status: normalizeWindowStatus(item?.windowStatus),
                last_customer_message_at: item?.lastCustomerMessageAt || null,
                laboral_minutes_remaining: Number.isFinite(Number(item?.laboralMinutesRemaining))
                    ? Math.max(0, Math.floor(Number(item.laboralMinutesRemaining)))
                    : null,
                laboral_window_measured_at: item?.laboralWindowMeasuredAt || null
            }))
            .filter((item) => item.chat_id);
        if (!payload.length) return;

        try {
            await queryPostgres(
                `WITH incoming AS (
                    SELECT *
                      FROM jsonb_to_recordset($2::jsonb) AS x(
                        chat_id text,
                        window_expires_at text,
                        window_open boolean,
                        window_status text,
                        last_customer_message_at text,
                        laboral_minutes_remaining integer,
                        laboral_window_measured_at text
                      )
                 )
                 UPDATE tenant_chats c
                    SET metadata = COALESCE(c.metadata, '{}'::jsonb) || jsonb_build_object(
                            'windowExpiresAt', incoming.window_expires_at,
                            'windowOpen', incoming.window_open,
                            'windowStatus', incoming.window_status,
                            'lastCustomerMessageAt', incoming.last_customer_message_at,
                            'laboralMinutesRemaining', incoming.laboral_minutes_remaining,
                            'laboralWindowMeasuredAt', incoming.laboral_window_measured_at
                        ),
                        updated_at = NOW()
                   FROM incoming
                  WHERE c.tenant_id = $1
                    AND c.chat_id = incoming.chat_id`,
                [resolvedTenantId, JSON.stringify(payload)]
            );
        } catch (_) {
            // Window metadata is an optimization for cache recovery; socket payloads remain authoritative.
        }
    };

    const resolveLastInboundMessageAt = async ({
        tenantId = 'default',
        chatId = ''
    } = {}) => {
        const safeTenantId = String(tenantId || 'default').trim() || 'default';
        const safeChatId = String(chatId || '').trim();
        if (!safeChatId) return null;
        try {
            const { rows } = await queryPostgres(
                `SELECT timestamp_unix, created_at
                   FROM tenant_messages
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND from_me = false
               ORDER BY COALESCE(timestamp_unix, EXTRACT(EPOCH FROM created_at)) DESC,
                        created_at DESC
                  LIMIT 1`,
                [safeTenantId, safeChatId]
            );
            const value = toIsoFromUnixSeconds(rows?.[0]?.timestamp_unix, rows?.[0]?.created_at);
            return value || null;
        } catch (_) {
            return null;
        }
    };

    const resolveBaseChatIdFromSummary = (item = {}) => {
        const explicitBaseChatId = String(item?.baseChatId || '').trim();
        if (explicitBaseChatId) return explicitBaseChatId;
        const rawId = String(item?.id || '').trim();
        if (!rawId) return '';
        const scopeSeparator = '::mod::';
        const separatorIndex = rawId.lastIndexOf(scopeSeparator);
        if (separatorIndex < 0) return rawId;
        return String(rawId.slice(0, separatorIndex) || '').trim() || rawId;
    };

    const enrichWithWindowData = async (item = null, tenantId = 'default', scopeModuleId = '') => {
        if (!item || typeof item !== 'object') return item;
        const resolvedTenantId = String(tenantId || 'default').trim() || 'default';
        const resolvedScopeModuleId = normalizeScopedModuleId(
            scopeModuleId
            || item?.scopeModuleId
            || item?.lastMessageModuleId
            || ''
        );
        const baseChatId = resolveBaseChatIdFromSummary(item);
        if (!baseChatId) {
            return {
                ...item,
                lastCustomerMessageAt: null,
                windowExpiresAt: null,
                laboralMinutesRemaining: null,
                windowStatus: null,
                laboralWindowMeasuredAt: null
            };
        }

        const lastCustomerMessageAt = await resolveLastCustomerMessageAt({
            tenantId: resolvedTenantId,
            chatId: baseChatId,
            scopeModuleId: resolvedScopeModuleId
        });
        const lastCustomerDate = lastCustomerMessageAt ? new Date(lastCustomerMessageAt) : null;
        const hasValidLastCustomerDate = Boolean(lastCustomerDate) && Number.isFinite(lastCustomerDate.getTime());
        const windowExpiresAt = hasValidLastCustomerDate
            ? new Date(lastCustomerDate.getTime() + DAY_WINDOW_MS).toISOString()
            : null;
        const activeSchedule = lastCustomerMessageAt ? await getActiveTenantSchedule(resolvedTenantId) : null;
        const laboralWindowMeasuredAt = hasValidLastCustomerDate ? new Date().toISOString() : null;
        const windowOpen = hasValidLastCustomerDate
            ? lastCustomerDate.getTime() + DAY_WINDOW_MS > Date.now()
            : false;
        const laboralDisplay = hasValidLastCustomerDate
            ? resolveLaboralWindowDisplay(activeSchedule, windowExpiresAt, laboralWindowMeasuredAt)
            : { laboralMinutesRemaining: null, windowStatus: null };

        const enrichedItem = {
            ...item,
            baseChatId: baseChatId || item?.baseChatId || null,
            scopeModuleId: resolvedScopeModuleId || item?.scopeModuleId || null,
            lastCustomerMessageAt,
            windowOpen,
            windowExpiresAt,
            laboralMinutesRemaining: laboralDisplay.laboralMinutesRemaining,
            windowStatus: laboralDisplay.windowStatus,
            laboralWindowMeasuredAt
        };
        return enrichedItem;
    };

    const resolveLastCustomerMessageMap = async ({
        tenantId = 'default',
        chatIds = [],
        scopeModuleId = ''
    } = {}) => {
        const resolvedTenantId = String(tenantId || 'default').trim() || 'default';
        const resolvedScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');
        const cleanChatIds = Array.from(new Set(
            (Array.isArray(chatIds) ? chatIds : [])
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
        ));
        const resultMap = new Map();
        if (!cleanChatIds.length) return resultMap;

        try {
            const { rows } = await queryPostgres(
                `SELECT DISTINCT ON (chat_id)
                        chat_id,
                        timestamp_unix,
                        created_at
                   FROM tenant_messages
                  WHERE tenant_id = $1
                    AND chat_id = ANY($2::text[])
                    AND from_me = false
               ORDER BY chat_id,
                        COALESCE(timestamp_unix, EXTRACT(EPOCH FROM created_at)) DESC,
                        created_at DESC`,
                [resolvedTenantId, cleanChatIds]
            );
            (Array.isArray(rows) ? rows : []).forEach((row) => {
                const chatId = String(row?.chat_id || '').trim();
                const value = toIsoFromUnixSeconds(row?.timestamp_unix, row?.created_at);
                if (chatId && value) resultMap.set(chatId, value);
            });
        } catch (_) { }

        const missingChatIds = cleanChatIds.filter((chatId) => !resultMap.has(chatId));
        if (missingChatIds.length > 0) {
            try {
                const { rows } = await queryPostgres(
                    `WITH ranked_assignments AS (
                    SELECT chat_id,
                           EXTRACT(EPOCH FROM last_customer_message_at) AS last_customer_message_ts,
                           last_customer_message_at,
                           ROW_NUMBER() OVER (
                               PARTITION BY chat_id
                               ORDER BY
                                   CASE
                                       WHEN scope_module_id = $3 THEN 0
                                       WHEN scope_module_id = '' THEN 1
                                       ELSE 2
                                   END,
                                   updated_at DESC
                           ) AS rn
                      FROM tenant_chat_assignments
                     WHERE tenant_id = $1
                       AND chat_id = ANY($2::text[])
                       AND ($3 = '' OR scope_module_id = $3 OR scope_module_id = '')
                       AND last_customer_message_at IS NOT NULL
                 )
                 SELECT chat_id, last_customer_message_ts, last_customer_message_at
                   FROM ranked_assignments
                  WHERE rn = 1`,
                    [resolvedTenantId, missingChatIds, resolvedScopeModuleId]
                );
                (Array.isArray(rows) ? rows : []).forEach((row) => {
                    const chatId = String(row?.chat_id || '').trim();
                    const value = toIsoFromUnixSeconds(row?.last_customer_message_ts, row?.last_customer_message_at);
                    if (chatId && value) resultMap.set(chatId, value);
                });
            } catch (_) {
                // Some local databases may be missing lifecycle columns; tenant_messages is the primary source.
            }
        }

        return resultMap;
    };

    const enrichItemsWithWindowData = async (items = [], tenantId = 'default', scopeModuleId = '') => {
        const safeItems = Array.isArray(items) ? items : [];
        if (!safeItems.length) return [];

        const resolvedTenantId = String(tenantId || 'default').trim() || 'default';
        const resolvedScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');
        const baseChatIds = safeItems
            .map((item) => resolveBaseChatIdFromSummary(item))
            .filter(Boolean);
        const lastCustomerMessageMap = await resolveLastCustomerMessageMap({
            tenantId: resolvedTenantId,
            chatIds: baseChatIds,
            scopeModuleId: resolvedScopeModuleId
        });
        const activeSchedule = lastCustomerMessageMap.size > 0
            ? await getActiveTenantSchedule(resolvedTenantId)
            : null;
        const measuredAt = new Date().toISOString();

        return safeItems.map((item) => {
            if (!item || typeof item !== 'object') return item;
            const itemScopeModuleId = normalizeScopedModuleId(
                resolvedScopeModuleId
                || item?.scopeModuleId
                || item?.lastMessageModuleId
                || ''
            );
            const baseChatId = resolveBaseChatIdFromSummary(item);
            if (!baseChatId) {
                return {
                    ...item,
                    lastCustomerMessageAt: null,
                    windowExpiresAt: null,
                    laboralMinutesRemaining: null,
                    windowStatus: null,
                    laboralWindowMeasuredAt: null
                };
            }

            const lastCustomerMessageAt = lastCustomerMessageMap.get(baseChatId) || null;
            const lastCustomerDate = lastCustomerMessageAt ? new Date(lastCustomerMessageAt) : null;
            const hasValidLastCustomerDate = Boolean(lastCustomerDate) && Number.isFinite(lastCustomerDate.getTime());
            const windowExpiresAt = hasValidLastCustomerDate
                ? new Date(lastCustomerDate.getTime() + DAY_WINDOW_MS).toISOString()
                : null;
            const windowOpen = hasValidLastCustomerDate
                ? lastCustomerDate.getTime() + DAY_WINDOW_MS > Date.now()
                : false;
            const laboralDisplay = hasValidLastCustomerDate
                ? resolveLaboralWindowDisplay(activeSchedule, windowExpiresAt, measuredAt)
                : { laboralMinutesRemaining: null, windowStatus: null };

            return {
                ...item,
                baseChatId: baseChatId || item?.baseChatId || null,
                scopeModuleId: itemScopeModuleId || item?.scopeModuleId || null,
                lastCustomerMessageAt,
                windowOpen,
                windowExpiresAt,
                laboralMinutesRemaining: laboralDisplay.laboralMinutesRemaining,
                windowStatus: laboralDisplay.windowStatus,
                laboralWindowMeasuredAt: hasValidLastCustomerDate ? measuredAt : null
            };
        });
    };

    const loadPersistedChatStateMap = async (tenantId = 'default', chatIds = []) => {
        const resolvedTenantId = String(tenantId || 'default').trim() || 'default';
        const baseChatIds = Array.from(new Set((Array.isArray(chatIds) ? chatIds : [])
            .map((chatId) => String(chatId || '').trim())
            .filter(Boolean)));
        const persistedByChatId = new Map();
        if (!baseChatIds.length) return persistedByChatId;

        try {
            const { rows } = await queryPostgres(
                `SELECT chat_id,
                        unread_count,
                        archived,
                        pinned,
                        (COALESCE(manually_marked_unread, FALSE)
                            OR COALESCE(metadata->>'manuallyMarkedUnread', 'false') = 'true') AS manually_marked_unread,
                        COALESCE(manually_marked_unread_at::text, metadata->>'manuallyMarkedUnreadAt') AS manually_marked_unread_at
                   FROM tenant_chats
                  WHERE tenant_id = $1
                    AND chat_id = ANY($2::text[])`,
                [resolvedTenantId, baseChatIds]
            );
            (Array.isArray(rows) ? rows : []).forEach((row) => {
                const chatId = String(row?.chat_id || '').trim();
                if (!chatId) return;
                persistedByChatId.set(chatId, {
                    unreadCount: Number(row?.unread_count || 0) || 0,
                    archived: Boolean(row?.archived),
                    pinned: Boolean(row?.pinned),
                    manuallyMarkedUnread: Boolean(row?.manually_marked_unread),
                    manuallyMarkedUnreadAt: String(row?.manually_marked_unread_at || '').trim() || null
                });
            });
        } catch (_) {
            return new Map();
        }
        return persistedByChatId;
    };

    const enrichItemsWithPersistedChatState = async (items = [], tenantId = 'default') => {
        const safeItems = Array.isArray(items) ? items : [];
        if (!safeItems.length) return [];

        const baseChatIds = safeItems
            .map((item) => resolveBaseChatIdFromSummary(item))
            .filter(Boolean);
        const persistedByChatId = await loadPersistedChatStateMap(tenantId, baseChatIds);

        if (!persistedByChatId.size) return safeItems;
        return safeItems.map((item) => {
            const baseChatId = resolveBaseChatIdFromSummary(item);
            const persisted = persistedByChatId.get(baseChatId);
            if (!persisted) return item;
            return {
                ...item,
                unreadCount: Math.max(0, Number(persisted.unreadCount || 0) || 0),
                archived: Boolean(item?.archived || persisted.archived),
                pinned: Boolean(item?.pinned || persisted.pinned),
                manuallyMarkedUnread: Boolean(persisted.manuallyMarkedUnread),
                manuallyMarkedUnreadAt: persisted.manuallyMarkedUnreadAt || null
            };
        });
    };

    const enrichWithAdOrigin = async (item = null, tenantId = 'default', scopeModuleId = '') => {
        if (!item || typeof item !== 'object') return item;
        const resolvedTenantId = String(tenantId || 'default').trim() || 'default';
        const resolvedScopeModuleId = normalizeScopedModuleId(
            scopeModuleId
            || item?.scopeModuleId
            || item?.lastMessageModuleId
            || ''
        );
        const baseChatId = resolveBaseChatIdFromSummary(item);
        if (!baseChatId) return item;

        try {
            const { rows } = await queryPostgres(
                `SELECT origin_type,
                        referral_source_id,
                        referral_headline,
                        referral_source_type,
                        ctwa_clid
                   FROM tenant_chat_origins
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND ($3 = '' OR scope_module_id = $3 OR scope_module_id = '')
               ORDER BY CASE WHEN scope_module_id = $3 THEN 0 ELSE 1 END,
                        created_at DESC
                  LIMIT 1`,
                [resolvedTenantId, baseChatId, resolvedScopeModuleId || '']
            );
            const origin = rows?.[0] || null;
            if (!origin || String(origin.origin_type || '').trim().toLowerCase() !== 'meta_ad') {
                return item;
            }

            let adName = '';
            const sourceId = String(origin.referral_source_id || '').trim();
            if (sourceId) {
                try {
                    const adResult = await queryPostgres(
                        `SELECT object_name
                           FROM tenant_meta_ads_structure
                          WHERE tenant_id = $1
                            AND object_id = $2
                            AND object_type = 'ad'
                          LIMIT 1`,
                        [resolvedTenantId, sourceId]
                    );
                    adName = String(adResult?.rows?.[0]?.object_name || '').trim();
                } catch (_) {
                    adName = '';
                }
            }

            const fallbackName = String(origin.referral_headline || '').trim() || 'Anuncio Meta';
            return {
                ...item,
                adOrigin: {
                    type: 'meta_ad',
                    adName: adName || fallbackName,
                    sourceId: sourceId || null,
                    sourceType: String(origin.referral_source_type || '').trim() || null,
                    ctwaClid: String(origin.ctwa_clid || '').trim() || null
                }
            };
        } catch (_) {
            return item;
        }
    };

    const enrichWithChatListData = async (item = null, tenantId = 'default', scopeModuleId = '') => {
        const withWindowData = await enrichWithWindowData(item, tenantId, scopeModuleId);
        return enrichWithAdOrigin(withWindowData, tenantId, scopeModuleId);
    };

    const enrichItemsWithChatListData = async (items = [], tenantId = 'default', scopeModuleId = '') => {
        const withPersistedState = await enrichItemsWithPersistedChatState(items, tenantId);
        const withWindowData = await enrichItemsWithWindowData(withPersistedState, tenantId, scopeModuleId);
        void persistWindowMetadataBatch(tenantId, withWindowData);
        return Promise.all(withWindowData.map((item) => enrichWithAdOrigin(item, tenantId, scopeModuleId)));
    };

    const enrichChatPageWithWindowData = async (page = null, tenantId = 'default', scopeModuleId = '') => {
        const safePage = page && typeof page === 'object' ? page : {};
        const rawItems = Array.isArray(safePage.items) ? safePage.items : [];
        const items = await enrichItemsWithChatListData(rawItems, tenantId, scopeModuleId);
        return {
            ...safePage,
            items
        };
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
        if (!chatId || !isVisibleChatId(chatId)) return { labels: [] };

        const cached = getCachedChatMeta(chatId);
        if (cached) return { labels: Array.isArray(cached.labels) ? cached.labels : [] };

        const normalized = {
            labels: [],
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

    const resolveLastCustomerMessageAt = async ({
        tenantId = 'default',
        chatId = '',
        scopeModuleId = ''
    } = {}) => {
        const safeTenantId = String(tenantId || 'default').trim() || 'default';
        const safeChatId = String(chatId || '').trim();
        const safeScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');
        if (!safeChatId) return null;

        try {
            const lastInboundMessageAt = await resolveLastInboundMessageAt({
                tenantId: safeTenantId,
                chatId: safeChatId
            });
            if (lastInboundMessageAt) return lastInboundMessageAt;
            if (typeof conversationOpsService?.getChatAssignment !== 'function') return null;

            const scopedAssignment = await conversationOpsService.getChatAssignment(safeTenantId, {
                chatId: safeChatId,
                scopeModuleId: safeScopeModuleId
            });
            const scopedLastCustomerMessageAt = String(scopedAssignment?.lastCustomerMessageAt || '').trim();
            if (scopedLastCustomerMessageAt) return scopedLastCustomerMessageAt;

            if (!safeScopeModuleId) return null;
            const fallbackAssignment = await conversationOpsService.getChatAssignment(safeTenantId, {
                chatId: safeChatId,
                scopeModuleId: ''
            });
            const fallbackLastCustomerMessageAt = String(fallbackAssignment?.lastCustomerMessageAt || '').trim();
            if (fallbackLastCustomerMessageAt) return fallbackLastCustomerMessageAt;
            return await resolveLastInboundMessageAt({
                tenantId: safeTenantId,
                chatId: safeChatId
            });
        } catch (_) {
            return await resolveLastInboundMessageAt({
                tenantId: safeTenantId,
                chatId: safeChatId
            });
        }
    };

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
        const chatIdsForPersistedState = chats
            .map((chat) => String(chat?.id?._serialized || '').trim())
            .filter((chatId) => Boolean(chatId) && isVisibleChatId(chatId));
        const persistedStateByChatId = (unreadOnly || archivedMode !== 'all' || pinnedMode !== 'all')
            ? await loadPersistedChatStateMap(safeTenantId, chatIdsForPersistedState)
            : new Map();
        const labelTokenSetByChatId = new Map();
        if (needsLabelFiltering) {
            const labelsMap = await listChatLabelsMapWithScopeFallback({
                tenantId: safeTenantId,
                chatIds: chatIdsForPersistedState,
                scopeModuleId: safeScopeModuleId,
                includeInactive: false
            });
            chatIdsForPersistedState.forEach((chatId) => {
                const labels = labelsMap?.[buildLabelMapKey(chatId, safeScopeModuleId)] || [];
                labelTokenSetByChatId.set(chatId, toLabelTokenSet(labels));
            });
        }

        const included = new Array(chats.length).fill(false);
        const labelConcurrency = Math.max(2, Number(process.env.LABEL_FILTER_CONCURRENCY || 10));

        await runWithConcurrency(chats, labelConcurrency, async (chat, idx) => {
            const chatId = String(chat?.id?._serialized || '').trim();
            const hasPersisted = persistedStateByChatId.has(chatId);
            const persisted = persistedStateByChatId.get(chatId) || {};
            const unreadCount = hasPersisted
                ? Number(persisted?.unreadCount || 0) || 0
                : 0;
            const manuallyMarkedUnread = hasPersisted
                ? Boolean(persisted?.manuallyMarkedUnread)
                : false;
            if (unreadOnly && unreadCount <= 0 && !manuallyMarkedUnread) return;

            // El filtro Guardados/No guardados depende del vínculo CRM enriquecido
            // que resolvemos después en el summary; aquí no filtramos todavía para
            // no perder chats que sí están guardados en BD pero no vienen como
            // isMyContact desde el runtime.
            const isArchived = Boolean(chat?.archived || persisted?.archived);
            if (archivedMode === 'archived' && !isArchived) return;
            if (archivedMode === 'active' && isArchived) return;
            const isPinned = Boolean(chat?.pinned || persisted?.pinned);
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

        if (includeHeavyMeta || !cached) {
            await hydrateChatMeta(chat);
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
            timestamp: chat.timestamp,
            lastMessage: resolveLastMessagePreview(chat),
            lastMessageFromMe: chat.lastMessage ? chat.lastMessage.fromMe : false,
            ack: chat.lastMessage ? chat.lastMessage.ack : 0,
            labels,
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
                    const enrichedFallbackPage = await enrichChatPageWithWindowData(fallbackPage, tenantId, activeScopeModuleId || '');
                    socket.emit('chats', enrichedFallbackPage);
                    return;
                }

                const activeRuntime = getWaRuntime();
                const activeTransportMode = String(activeRuntime?.activeTransport || 'idle').trim().toLowerCase();
                if (activeTransportMode === 'cloud') {
                    const historyPage = await getHistoryChatsPage(tenantId, {
                        offset,
                        limit,
                        query,
                        filters: activeFilters,
                        filterKey,
                        scopeModuleId: activeScopeModuleId || ''
                    });
                    socket.emit('chats', historyPage);
                    const enrichedPage = await enrichChatPageWithWindowData(historyPage, tenantId, activeScopeModuleId || '');
                    socket.emit('chats', enrichedPage);
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
                        const enrichedFallbackPageIfEmpty = await enrichChatPageWithWindowData(fallbackPageIfEmpty, tenantId, activeScopeModuleId || '');
                        socket.emit('chats', enrichedFallbackPageIfEmpty);
                        return;
                    }
                }

                let historyTotalHint = 0;
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
                            const runtimeByKey = new Map();
                            for (const item of items) {
                                if (!item) continue;
                                const key = buildChatIdentityKeyFromSummary(item);
                                if (!runtimeByKey.has(key)) {
                                    runtimeByKey.set(key, item);
                                } else {
                                    runtimeByKey.set(key, pickPreferredSummary(runtimeByKey.get(key), item));
                                }
                            }

                            const mergedItems = [];
                            for (const historyItem of cloudHistoryPage.items) {
                                if (!historyItem) continue;
                                const key = buildChatIdentityKeyFromSummary(historyItem);
                                const runtimeItem = runtimeByKey.get(key) || null;
                                mergedItems.push(runtimeItem ? pickPreferredSummary(historyItem, runtimeItem) : historyItem);
                                runtimeByKey.delete(key);
                            }

                            if (runtimeByKey.size > 0) {
                                mergedItems.push(...Array.from(runtimeByKey.values()));
                            }

                            items = mergedItems
                                .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)))
                                .slice(0, limit);
                        }
                    } catch (historyMergeError) {
                        console.warn('[History] cloud chat merge failed:', String(historyMergeError?.message || historyMergeError));
                    }
                }

                items = await enrichItemsWithChatListData(items, tenantId, activeScopeModuleId || '');

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

                // Hydrate tenant labels progressively in background to keep first paint fast.
                const pendingMetaChats = page
                    .filter((chat) => {
                        const chatId = String(chat?.id?._serialized || '');
                        if (!chatId || !isVisibleChatId(chatId)) return false;
                        const cached = getCachedChatMeta(chatId);
                        if (!cached) return true;
                        return !Array.isArray(cached.labels);
                    })
                    .slice(0, 24);

                if (pendingMetaChats.length > 0) {
                    setImmediate(async () => {
                        for (const chat of pendingMetaChats) {
                            try {
                                const summary = await toChatSummary(chat, { includeHeavyMeta: true, ...summaryScopeOptions });
                                if (summary) {
                                    const enrichedSummary = await enrichWithChatListData(summary, tenantId, activeScopeModuleId || '');
                                    const chatUpdatedSummary = { ...enrichedSummary };
                                    delete chatUpdatedSummary.unreadCount;
                                    delete chatUpdatedSummary.manuallyMarkedUnread;
                                    delete chatUpdatedSummary.manuallyMarkedUnreadAt;
                                    socket.emit('chat_updated', chatUpdatedSummary);
                                }
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
                    const fallbackScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '') || '';
                    const enrichedFallbackPage = await enrichChatPageWithWindowData(fallbackPage, tenantId, fallbackScopeModuleId);
                    socket.emit('chats', enrichedFallbackPage);
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
