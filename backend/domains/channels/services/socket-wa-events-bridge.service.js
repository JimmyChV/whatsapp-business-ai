const {
    getStorageDriver,
    queryPostgres,
    readTenantJsonFile
} = require('../../../config/persistence-runtime');
const {
    customerModuleContextsService: customerModuleContextsServiceFallback,
    customerConsentService: customerConsentServiceFallback
} = require('../../operations/services');
const catalogManagerService = require('../../tenant/services/catalog-manager.service');
const quotesService = require('../../tenant/services/quotes.service');
const pushNotificationServiceFallback = require('../../security/services/push-notifications.service');
const tenantScheduleServiceFallback = require('../../tenant/services/tenant-schedule.service');
const auditLogServiceFallback = require('../../security/services/audit-log.service');
const pattyService = require('./patty.service');
const { isValidOperationalTenant, warnInvalidTenant } = require('../../tenant/helpers/tenant-guard.helpers');

function createSocketWaEventsBridgeService({
    waClient,
    mediaManager,
    conversationOpsService,
    chatAssignmentRouterService,
    chatCommercialStatusService,
    chatOriginService,
    emitToRuntimeContext,
    emitCommercialStatusUpdated,
    getWaCapabilities,
    getWaRuntime,
    resolveHistoryTenantId,
    resolveHistoryModuleContext,
    persistMessageHistory,
    persistMessageEdit,
    persistMessageAck,
    persistMessageReaction,
    invalidateChatListCache,
    toChatSummary,
    emitMessageEditability,
    scheduleEditabilityRefresh,
    isStatusOrSystemMessage,
    isVisibleChatId,
    getSerializedMessageId,
    mergeAgentMeta,
    getOutgoingAgentMeta,
    buildEffectiveModuleContext,
    buildModuleAttributionMeta,
    normalizeScopedModuleId,
    buildScopedChatId,
    resolveMessageSenderMeta,
    extractMessageFileMeta,
    extractQuotedMessageInfo,
    extractOrderInfo,
    extractLocationInfo,
    customerModuleContextsService = customerModuleContextsServiceFallback,
    customerConsentService = customerConsentServiceFallback,
    pushNotificationService = pushNotificationServiceFallback,
    tenantScheduleService = tenantScheduleServiceFallback,
    auditLogService = auditLogServiceFallback
} = {}) {
    const text = (value = '') => String(value ?? '').trim();

    const extractPhoneCandidatesFromChatId = (chatId = '') => {
        const clean = String(chatId || '').trim();
        const base = clean.split('@')[0].trim();
        const digits = base.replace(/[^\d]/g, '');
        const out = [];
        if (digits) {
            out.push(`+${digits}`);
            out.push(digits);
        }
        return out;
    };

    const ORIGIN_KEYWORDS = [
        { source: 'instagram_bio', label: 'Instagram', keywords: ['instagram', ' ig ', 'reel', 'story', 'historia', 'perfil ig'] },
        { source: 'google_business', label: 'Google', keywords: ['google', 'maps', 'gmaps', 'busque', 'buscando', 'encontre'] },
        { source: 'ai_referral', label: 'Busqueda IA (ChatGPT/Gemini)', keywords: ['chatgpt', 'chat gpt', 'gpt', 'gemini', 'bard', 'copilot', 'inteligencia artificial', 'ia me'] },
        { source: 'tiktok', label: 'TikTok', keywords: ['tiktok', 'tik tok'] },
        { source: 'youtube', label: 'YouTube', keywords: ['youtube', 'you tube', 'video yt'] },
        { source: 'facebook_organic', label: 'Facebook', keywords: ['facebook', ' fb ', 'face book'] },
        { source: 'qr_product', label: 'QR en producto', keywords: ['qr', 'codigo qr', 'escanee', 'empaque', 'envase', 'etiqueta del producto'] },
        { source: 'qr_store', label: 'QR en tienda', keywords: ['qr tienda', 'qr local', 'qr establecimiento'] },
        { source: 'referral', label: 'Recomendacion', keywords: ['recomend', 'me dijeron', 'me pasaron', 'me compartieron', 'un amigo', 'una amiga', 'familiar', 'conocido', 'referido'] },
        { source: 'saved_contact', label: 'Contacto guardado', keywords: ['guarde tu numero', 'tenia tu numero', 'numero guardado'] }
    ];

    const normalizeOriginLookup = (value = '') => ` ${String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')} `;

    const detectKeywordOrigin = (body = '') => {
        const normalizedBody = normalizeOriginLookup(body);
        for (const entry of ORIGIN_KEYWORDS) {
            const matchedKeyword = entry.keywords.find((keyword) => normalizedBody.includes(normalizeOriginLookup(keyword)));
            if (matchedKeyword) {
                return {
                    originSource: entry.source,
                    originLabel: entry.label,
                    originDetail: { keyword_detected: matchedKeyword }
                };
            }
        }
        return {
            originSource: 'organic',
            originLabel: 'Directo / Organico',
            originDetail: {}
        };
    };

    const isOriginRecent = (origin = null, referenceIso = '') => {
        const detectedAtMs = Date.parse(origin?.detectedAt || origin?.detected_at || '');
        const referenceMs = Date.parse(referenceIso || '');
        if (!Number.isFinite(detectedAtMs) || !Number.isFinite(referenceMs)) return false;
        return (referenceMs - detectedAtMs) < (30 * 24 * 60 * 60 * 1000);
    };

    const hasRecentInboundBefore = async (tenantId = '', chatId = '', scopeModuleId = '', messageId = '', activityAtIso = '') => {
        if (getStorageDriver() !== 'postgres') return false;
        const cleanTenantId = String(tenantId || '').trim();
        const cleanChatId = String(chatId || '').trim();
        const cleanScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
        const activityAtMs = Date.parse(activityAtIso || '');
        if (!cleanTenantId || !cleanChatId || !Number.isFinite(activityAtMs)) return false;

        const activityUnix = Math.floor(activityAtMs / 1000);
        const cutoffUnix = activityUnix - (30 * 24 * 60 * 60);
        const params = [cleanTenantId, cleanChatId, String(messageId || '').trim(), cutoffUnix, activityUnix];
        let scopeSql = '';
        if (cleanScopeModuleId) {
            params.push(cleanScopeModuleId);
            scopeSql = ` AND LOWER(COALESCE(wa_module_id, '')) = LOWER($${params.length})`;
        }

        const { rows } = await queryPostgres(
            `SELECT 1
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND message_id <> $3
                AND from_me = FALSE
                AND COALESCE(timestamp_unix, 0) >= $4
                AND COALESCE(timestamp_unix, 0) <= $5${scopeSql}
              LIMIT 1`,
            params
        );
        return Boolean(rows?.[0]);
    };

    const resolveScheduleIdFromModule = (moduleContext = null) => text(
        moduleContext?.scheduleId
        || moduleContext?.schedule_id
        || moduleContext?.metadata?.scheduleId
        || moduleContext?.metadata?.schedule_id
    );

    const getRecentInboundCount = async ({
        tenantId = '',
        chatId = '',
        scopeModuleId = ''
    } = {}) => {
        if (getStorageDriver() !== 'postgres') return 0;
        const cleanTenantId = text(tenantId);
        const cleanChatId = text(chatId);
        const cleanScopeModuleId = text(scopeModuleId).toLowerCase();
        if (!cleanTenantId || !cleanChatId) return 0;

        const params = [cleanTenantId, cleanChatId];
        let scopeSql = '';
        if (cleanScopeModuleId) {
            params.push(cleanScopeModuleId);
            scopeSql = ` AND LOWER(COALESCE(wa_module_id, '')) = LOWER($${params.length})`;
        }
        const { rows } = await queryPostgres(
            `SELECT COUNT(*)::int AS total
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND COALESCE(from_me, FALSE) = FALSE
                AND created_at >= NOW() - INTERVAL '24 hours'
                ${scopeSql}`,
            params
        );
        return Number(rows?.[0]?.total || 0) || 0;
    };

    const hasRecentAutoMessage = async ({
        tenantId = '',
        chatId = '',
        scopeModuleId = '',
        type = '',
        windowMinutes = 5
    } = {}) => {
        if (getStorageDriver() !== 'postgres') return false;
        const cleanTenantId = text(tenantId);
        const cleanChatId = text(chatId);
        const cleanScopeModuleId = text(scopeModuleId).toLowerCase();
        const cleanType = text(type);
        const cleanWindowMinutes = Math.max(1, Number(windowMinutes || 5) || 5);
        if (!cleanTenantId || !cleanChatId || !cleanType) return false;

        const params = [cleanTenantId, cleanChatId, cleanType, cleanWindowMinutes];
        let scopeSql = '';
        if (cleanScopeModuleId) {
            params.push(cleanScopeModuleId);
            scopeSql = ` AND LOWER(COALESCE(wa_module_id, '')) = LOWER($${params.length})`;
        }
        const { rows } = await queryPostgres(
            `SELECT 1
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND COALESCE(from_me, FALSE) = TRUE
                AND metadata->>'autoMessageType' = $3
                AND created_at >= NOW() - ($4::int * INTERVAL '1 minute')
                ${scopeSql}
              LIMIT 1`,
            params
        );
        return Boolean(rows?.[0]);
    };

    const sendScheduleAutoMessage = async ({
        tenantId = '',
        chatId = '',
        moduleContext = null,
        scheduleId = '',
        body = '',
        type = ''
    } = {}) => {
        const cleanTenantId = text(tenantId);
        const cleanChatId = text(chatId);
        const cleanScheduleId = text(scheduleId);
        const cleanBody = text(body);
        const cleanType = text(type);
        if (!cleanTenantId || !cleanChatId || !cleanScheduleId || !cleanBody || !cleanType) return null;

        const moduleAttributionMeta = buildModuleAttributionMeta(moduleContext);
        const scopeModuleId = normalizeScopedModuleId(
            moduleContext?.moduleId
            || moduleAttributionMeta?.sentViaModuleId
            || ''
        );
        const agentMeta = {
            sentByUserId: 'system',
            sentByName: cleanType === 'away' ? 'Sistema (fuera de horario)' : 'Sistema',
            sentByRole: 'automation',
            sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || scopeModuleId || null,
            sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || text(moduleContext?.name) || null,
            sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || text(moduleContext?.imageUrl || moduleContext?.logoUrl) || null,
            sentViaTransport: moduleAttributionMeta?.sentViaTransport || text(moduleContext?.transportMode).toLowerCase() || null,
            sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || text(moduleContext?.phoneNumber || moduleContext?.phone) || null,
            sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || text(moduleContext?.channelType).toLowerCase() || null
        };
        const sentMessage = await waClient.sendMessage(cleanChatId, cleanBody, {
            metadata: {
                tenantId: cleanTenantId,
                chatId: cleanChatId,
                autoMessage: true,
                autoMessageType: cleanType,
                scheduleId: cleanScheduleId,
                automationSource: `schedule_${cleanType}`,
                agentMeta
            }
        });

        try {
            await auditLogService?.writeAuditLog?.(cleanTenantId, {
                userId: 'system',
                userEmail: null,
                role: 'admin',
                action: 'chat.auto_message.sent',
                resourceType: 'chat',
                resourceId: cleanChatId,
                source: 'socket',
                payload: {
                    type: cleanType,
                    scheduleId: cleanScheduleId,
                    moduleId: scopeModuleId || null,
                    messageId: getSerializedMessageId(sentMessage) || null
                }
            });
        } catch (auditError) {
            console.warn('[WA][AutoMessage] audit warning:', String(auditError?.message || auditError));
        }

        return sentMessage || null;
    };

    const maybeSendScheduleAutoMessages = async ({
        tenantId = '',
        chatId = '',
        scopeModuleId = '',
        moduleContext = null
    } = {}) => {
        let scheduleId = resolveScheduleIdFromModule(moduleContext);
        const cleanTenantId = text(tenantId);
        const cleanScopeModuleId = text(scopeModuleId).toLowerCase();
        if (!scheduleId && cleanTenantId && cleanScopeModuleId && getStorageDriver() === 'postgres') {
            const { rows } = await queryPostgres(
                `SELECT COALESCE(metadata->>'scheduleId', metadata->>'schedule_id') AS schedule_id
                   FROM wa_modules
                  WHERE tenant_id = $1
                    AND LOWER(module_id) = LOWER($2)
                  LIMIT 1`,
                [cleanTenantId, cleanScopeModuleId]
            );
            scheduleId = text(rows?.[0]?.schedule_id);
        }
        if (!scheduleId || !tenantScheduleService?.getSchedule || !tenantScheduleService?.isWithinSchedule) return;

        const schedule = await tenantScheduleService.getSchedule(tenantId, scheduleId);
        if (!schedule || schedule.isActive === false) return;

        const scheduleState = await tenantScheduleService.isWithinSchedule(tenantId, scheduleId, new Date());
        const isOpen = scheduleState?.open === true;
        const recentInboundCount = await getRecentInboundCount({ tenantId, chatId, scopeModuleId });
        const isFirstMessage = recentInboundCount === 1;
        const candidates = [];

        if (isOpen && schedule.welcomeEnabled && text(schedule.welcomeMessage) && isFirstMessage) {
            candidates.push({ type: 'welcome', body: schedule.welcomeMessage });
        }
        if (!isOpen && schedule.awayEnabled && text(schedule.awayMessage)) {
            candidates.push({ type: 'away', body: schedule.awayMessage, dedupeMinutes: 18 * 60 });
        }

        for (const candidate of candidates) {
            const alreadySent = await hasRecentAutoMessage({
                tenantId,
                chatId,
                scopeModuleId,
                type: candidate.type,
                windowMinutes: candidate.dedupeMinutes || 5
            });
            if (alreadySent) continue;
            await sendScheduleAutoMessage({
                tenantId,
                chatId,
                moduleContext,
                scheduleId,
                body: candidate.body,
                type: candidate.type
            });
        }
    };

    const findRecentCampaignOrigin = async (tenantId = '', chatId = '') => {
        if (getStorageDriver() !== 'postgres') return null;
        const cleanTenantId = String(tenantId || '').trim();
        const phoneCandidates = extractPhoneCandidatesFromChatId(chatId);
        if (!cleanTenantId || phoneCandidates.length === 0) return null;
        const { rows } = await queryPostgres(
            `SELECT cr.campaign_id, tc.campaign_name, cr.sent_at
               FROM tenant_campaign_recipients cr
               JOIN tenant_campaigns tc
                 ON tc.tenant_id = cr.tenant_id
                AND tc.campaign_id = cr.campaign_id
              WHERE cr.tenant_id = $1
                AND cr.phone = ANY($2::text[])
                AND cr.sent_at >= NOW() - INTERVAL '30 days'
                AND cr.status = 'sent'
              ORDER BY cr.sent_at DESC NULLS LAST
              LIMIT 1`,
            [cleanTenantId, phoneCandidates]
        );
        const row = rows?.[0] || null;
        if (!row) return null;
        const campaignName = String(row?.campaign_name || '').trim() || 'Campana sin nombre';
        return {
            originType: 'inbound',
            originSource: 'campaign',
            originLabel: campaignName,
            campaignId: String(row?.campaign_id || '').trim() || null,
            originDetail: {
                campaign_id: String(row?.campaign_id || '').trim() || null,
                campaign_name: campaignName,
                sent_at: row?.sent_at || null
            }
        };
    };

    const detectAndPersistChatOrigin = async ({
        tenantId = '',
        chatId = '',
        scopeModuleId = '',
        messageId = '',
        activityAtIso = '',
        referral = null,
        body = ''
    } = {}) => {
        if (!chatOriginService || !tenantId || !chatId) return;
        const existingOrigin = typeof chatOriginService.getChatOrigin === 'function'
            ? await chatOriginService.getChatOrigin(tenantId, { chatId, scopeModuleId })
            : null;
        if (existingOrigin && isOriginRecent(existingOrigin, activityAtIso)) return;

        const hasPreviousInbound = await hasRecentInboundBefore(tenantId, chatId, scopeModuleId, messageId, activityAtIso);
        if (hasPreviousInbound) return;

        const hasMetaReferral = Boolean(referral && typeof referral === 'object' && Object.keys(referral).length > 0);
        let payload = null;
        if (hasMetaReferral) {
            const referralHeadline = String(referral?.headline || '').trim();
            payload = {
                originType: 'meta_ad',
                originSource: 'meta_ad',
                originLabel: referralHeadline || 'Anuncio Meta',
                referralSourceUrl: String(referral?.sourceUrl || referral?.source_url || '').trim() || null,
                referralSourceType: String(referral?.sourceType || referral?.source_type || '').trim() || null,
                referralSourceId: String(referral?.sourceId || referral?.source_id || '').trim() || null,
                referralHeadline: referralHeadline || null,
                ctwaClid: String(referral?.ctwaClid || referral?.ctwa_clid || '').trim() || null,
                campaignId: null,
                rawReferral: referral,
                originDetail: {}
            };
        } else {
            payload = await findRecentCampaignOrigin(tenantId, chatId);
            if (!payload) {
                const keywordOrigin = detectKeywordOrigin(body);
                payload = {
                    originType: 'inbound',
                    originSource: keywordOrigin.originSource,
                    originLabel: keywordOrigin.originLabel,
                    originDetail: keywordOrigin.originDetail
                };
            }
        }

        await chatOriginService.upsertChatOrigin(tenantId, {
            chatId,
            scopeModuleId,
            ...payload,
            detectedAt: activityAtIso
        });
    };

    const resolveCustomerIdFromChat = async (tenantId = '', chatId = '', scopeModuleId = '') => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanChatId = String(chatId || '').trim();
        const cleanScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
        if (!cleanTenantId || !cleanChatId) return null;

        if (getStorageDriver() === 'postgres') {
            try {
                const params = [cleanTenantId, cleanChatId];
                let scopeSql = '';
                if (cleanScopeModuleId) {
                    params.push(cleanScopeModuleId);
                    scopeSql = ` AND LOWER(COALESCE(module_id, '')) = LOWER($${params.length})`;
                }
                const eventResult = await queryPostgres(
                    `SELECT customer_id
                       FROM tenant_channel_events
                      WHERE tenant_id = $1
                        AND chat_id = $2
                        AND COALESCE(customer_id, '') <> ''${scopeSql}
                      ORDER BY created_at DESC
                      LIMIT 1`,
                    params
                );
                const eventCustomerId = String(eventResult?.rows?.[0]?.customer_id || '').trim();
                if (eventCustomerId) return eventCustomerId;

                const phoneCandidates = extractPhoneCandidatesFromChatId(cleanChatId);
                for (const phone of phoneCandidates) {
                    const customerParams = [cleanTenantId, phone];
                    let moduleSql = '';
                    if (cleanScopeModuleId) {
                        customerParams.push(cleanScopeModuleId);
                        moduleSql = ` AND LOWER(COALESCE(module_id, '')) = LOWER($${customerParams.length})`;
                    }
                    const customerResult = await queryPostgres(
                        `SELECT customer_id
                           FROM tenant_customers
                          WHERE tenant_id = $1
                            AND phone_e164 = $2${moduleSql}
                          ORDER BY updated_at DESC
                          LIMIT 1`,
                        customerParams
                    );
                    const customerId = String(customerResult?.rows?.[0]?.customer_id || '').trim();
                    if (customerId) return customerId;
                }
            } catch (_) {
                return null;
            }
            return null;
        }

        try {
            const store = await readTenantJsonFile('customers.json', {
                tenantId: cleanTenantId,
                defaultValue: { items: [] }
            });
            const items = Array.isArray(store?.items) ? store.items : [];
            const phoneCandidates = extractPhoneCandidatesFromChatId(cleanChatId);
            const matched = items.find((entry) => {
                const customerPhone = String(entry?.phoneE164 || entry?.phone_e164 || '').trim();
                const customerModuleId = String(entry?.moduleId || entry?.module_id || '').trim().toLowerCase();
                const moduleMatch = !cleanScopeModuleId || customerModuleId === cleanScopeModuleId;
                return moduleMatch && phoneCandidates.some((phone) => customerPhone === phone);
            });
            return String(matched?.customerId || matched?.customer_id || '').trim() || null;
        } catch (_) {
            return null;
        }
    };

    const resolveCustomerNameFromChat = async (tenantId = '', chatId = '', scopeModuleId = '') => {
        if (getStorageDriver() !== 'postgres') return '';
        const customerId = await resolveCustomerIdFromChat(tenantId, chatId, scopeModuleId);
        if (!customerId) return '';
        try {
            const { rows } = await queryPostgres(
                `SELECT contact_name, first_name, last_name_paternal, last_name_maternal
                   FROM tenant_customers
                  WHERE tenant_id = $1
                    AND customer_id = $2
                  LIMIT 1`,
                [tenantId, customerId]
            );
            const row = rows?.[0] || null;
            return String(
                row?.contact_name
                || [row?.first_name, row?.last_name_paternal, row?.last_name_maternal].filter(Boolean).join(' ')
                || ''
            ).trim();
        } catch (_) {
            return '';
        }
    };

    const extractQuoteButtonReplyId = (msg = {}) => {
        const interactive = msg?.interactive && typeof msg.interactive === 'object'
            ? msg.interactive
            : (msg?._data?.interactive && typeof msg._data.interactive === 'object' ? msg._data.interactive : null);
        const buttonReply = interactive?.button_reply && typeof interactive.button_reply === 'object'
            ? interactive.button_reply
            : null;
        return String(buttonReply?.id || '').trim();
    };

    const handleQuoteButtonReply = async ({
        msg,
        tenantId,
        chatId,
        scopeModuleId,
        messageId,
        at
    } = {}) => {
        const buttonReplyId = extractQuoteButtonReplyId(msg);
        if (!buttonReplyId || !tenantId || !chatId) return false;

        const isConfirm = buttonReplyId.startsWith('quote_confirm_');
        const isChange = buttonReplyId.startsWith('quote_change_');
        if (!isConfirm && !isChange) return false;

        const quoteId = buttonReplyId
            .replace(/^quote_confirm_/, '')
            .replace(/^quote_change_/, '')
            .trim();
        if (!quoteId) return false;

        const cleanScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
        const eventName = isConfirm ? 'quote_confirmed' : 'quote_change_requested';
        const nextStatus = isConfirm ? 'aceptado' : 'en_conversacion';
        const eventMessage = isConfirm
            ? 'El cliente confirmo el pedido'
            : 'El cliente solicita cambios en su pedido';

        try {
            if (getStorageDriver() === 'postgres') {
                const quoteStatus = await queryPostgres(
                    `SELECT status
                       FROM tenant_quotes
                      WHERE tenant_id = $1
                        AND quote_id = $2
                      LIMIT 1`,
                    [tenantId, quoteId]
                );
                const currentQuoteStatus = String(quoteStatus?.rows?.[0]?.status || '').trim().toLowerCase();
                if (currentQuoteStatus === 'accepted') return true;

                const quoteUpdate = await queryPostgres(
                    `UPDATE tenant_quotes
                        SET status = $3,
                            updated_at = NOW(),
                            metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
                      WHERE tenant_id = $1
                        AND quote_id = $2
                      RETURNING quote_id`,
                    [
                        tenantId,
                        quoteId,
                        isConfirm ? 'accepted' : 'change_requested',
                        JSON.stringify({
                            lastButtonReplyId: buttonReplyId,
                            lastButtonReplyMessageId: messageId || null,
                            lastButtonReplyAt: at || new Date().toISOString()
                        })
                    ]
                );
                if (!quoteUpdate?.rows?.length) return false;
            }

            const commercialResult = await chatCommercialStatusService?.upsertChatCommercialStatus?.(tenantId, {
                chatId,
                scopeModuleId: cleanScopeModuleId,
                status: nextStatus,
                source: 'webhook',
                reason: isConfirm ? 'quote_confirm_button_reply' : 'quote_change_button_reply',
                changedByUserId: null,
                lastTransitionAt: at,
                metadata: {
                    trigger: 'button_reply',
                    quoteId,
                    buttonReplyId,
                    messageId: messageId || null
                }
            });

            if (commercialResult?.changed) {
                emitCommercialStatusUpdated?.({
                    tenantId,
                    chatId,
                    scopeModuleId: cleanScopeModuleId,
                    result: commercialResult,
                    source: 'wa_events_bridge.button_reply'
                });
            }

            const [assignment, customerName] = await Promise.all([
                conversationOpsService?.getChatAssignment?.(tenantId, { chatId, scopeModuleId: cleanScopeModuleId }),
                resolveCustomerNameFromChat(tenantId, chatId, cleanScopeModuleId)
            ]);
            const assigneeUserId = String(assignment?.assigneeUserId || '').trim() || null;
            const payload = {
                quoteId,
                chatId,
                scopeModuleId: cleanScopeModuleId || null,
                customerName: customerName || null,
                assigneeUserId,
                message: eventMessage,
                buttonReplyId,
                messageId: messageId || null,
                at: at || new Date().toISOString()
            };

            emitToRuntimeContext(eventName, payload);
            emitToRuntimeContext('quote_action_notification', {
                ...payload,
                event: eventName,
                title: isConfirm ? 'Pedido confirmado' : 'Cambios solicitados'
            });
            return true;
        } catch (error) {
            console.warn('[WA][QuoteButtonReply] handling failed:', String(error?.message || error));
            return false;
        }
    };

    const mapMetaDeliveryErrorToPhoneStatus = (errorCode = null) => {
        const numeric = Number(errorCode);
        if (!Number.isFinite(numeric)) return 'failed';
        if ([131026, 131028, 130472].includes(numeric)) return 'invalid';
        if (numeric === 131047) return 'blocked';
        return 'failed';
    };

    const updateCustomerPhoneStatusFromDeliveryError = ({
        tenantId = '',
        phone = '',
        errorCode = null
    } = {}) => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanPhone = String(phone || '').trim();
        if (!isValidOperationalTenant(cleanTenantId) || !cleanPhone || getStorageDriver() !== 'postgres') return Promise.resolve();
        const mappedStatus = mapMetaDeliveryErrorToPhoneStatus(errorCode);
        const normalizedErrorCode = Number.isFinite(Number(errorCode)) ? Number(errorCode) : null;
        return queryPostgres(
            `UPDATE tenant_customers
             SET phone_status = $3,
                 phone_status_checked_at = NOW(),
                 phone_status_error_code = $4,
                 updated_at = NOW()
             WHERE tenant_id = $1
               AND (phone_e164 = $2 OR phone_alt = $2)
               AND phone_status != 'blocked'`,
            [cleanTenantId, cleanPhone, mappedStatus, normalizedErrorCode]
        );
    };

    const updateCustomerPhoneStatusAsValid = ({
        tenantId = '',
        phone = ''
    } = {}) => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanPhone = String(phone || '').trim();
        if (!isValidOperationalTenant(cleanTenantId) || !cleanPhone || getStorageDriver() !== 'postgres') return Promise.resolve();
        return queryPostgres(
            `UPDATE tenant_customers
             SET phone_status = 'valid',
                 phone_status_checked_at = NOW(),
                 phone_status_error_code = NULL,
                 updated_at = NOW()
             WHERE tenant_id = $1
               AND (phone_e164 = $2 OR phone_alt = $2)`,
            [cleanTenantId, cleanPhone]
        );
    };

    async function enrichOrderProducts(tenantId, order) {
        if (!order || !Array.isArray(order.products) || !order.products.length) return order;
        try {
            const skus = order.products.map((p) => p.sku).filter(Boolean);
            if (!skus.length) return order;
            const catalogItems = await catalogManagerService.getCatalogItemsBySkus(tenantId, skus);
            if (!Array.isArray(catalogItems) || !catalogItems.length) return order;
            const catalogMap = new Map(
                catalogItems.map((ci) => [String(ci.id || '').trim().toUpperCase(), ci])
            );
            const enriched = order.products.map((p) => {
                const key = String(p.sku || '').trim().toUpperCase();
                const match = catalogMap.get(key);
                if (!match) return p;
                const updated = { ...p };
                if (match.title && !match.title.startsWith('SKU ')) {
                    updated.name = match.title;
                }
                const salePrice = match.metadata?.salePrice
                    ?? match.metadata?.sale_price
                    ?? match.metadata?.precio_oferta
                    ?? null;
                const saleParsed = salePrice !== null
                    ? Math.round(Number(salePrice) * 100) / 100 : null;
                const regularParsed = match.price
                    ? Math.round(Number(match.price) * 100) / 100 : null;
                const finalPrice = Number.isFinite(saleParsed) && saleParsed > 0
                    ? saleParsed
                    : (Number.isFinite(regularParsed) && regularParsed > 0
                        ? regularParsed : null);
                if (finalPrice) {
                    updated.price = finalPrice;
                    updated.lineTotal = Math.round((finalPrice * (p.quantity || 1)) * 100) / 100;
                }
                return updated;
            });
            return { ...order, products: enriched };
        } catch (err) {
            console.warn('[enrichOrderProducts] skipped:', err?.message);
            return order;
        }
    }

    const registerWaProviderEvents = () => {
        waClient.on('qr', (qr) => emitToRuntimeContext('qr', qr));
        waClient.on('ready', async () => {
            emitToRuntimeContext('ready', { message: 'WhatsApp Ready' });
            emitToRuntimeContext('wa_capabilities', getWaCapabilities());
            emitToRuntimeContext('wa_runtime', getWaRuntime());
        });
        waClient.on('authenticated', () => emitToRuntimeContext('authenticated'));
        waClient.on('auth_failure', (msg) => emitToRuntimeContext('auth_failure', msg));
        waClient.on('disconnected', (reason) => emitToRuntimeContext('disconnected', reason));

        waClient.on('message', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;

            const historyTenantId = resolveHistoryTenantId();
            if (!isValidOperationalTenant(historyTenantId)) {
                warnInvalidTenant(historyTenantId, 'socket-wa-events-bridge.message');
                return;
            }
            const runtimeModuleContext = resolveHistoryModuleContext();
            const relatedChatIdBase = String(msg?.fromMe ? msg?.to : msg?.from || '').trim();
            const messageId = getSerializedMessageId(msg);
            const eventUnixTs = Number(msg?.timestamp || 0);
            const activityAtIso = eventUnixTs > 0
                ? new Date(eventUnixTs * 1000).toISOString()
                : new Date().toISOString();
            const agentMeta = msg?.fromMe ? mergeAgentMeta(getOutgoingAgentMeta(messageId)) : null;
            const effectiveModuleContext = buildEffectiveModuleContext(runtimeModuleContext, agentMeta);
            const moduleAttributionMeta = buildModuleAttributionMeta(effectiveModuleContext);
            const scopeModuleId = normalizeScopedModuleId(
                effectiveModuleContext?.moduleId
                || moduleAttributionMeta?.sentViaModuleId
                || ''
            );
            const cleanScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
            const scopedChatId = buildScopedChatId(relatedChatIdBase, scopeModuleId || '');
            const order = extractOrderInfo(msg);
            const enrichedOrder = order
                ? await enrichOrderProducts(historyTenantId, order)
                : order;
            const location = extractLocationInfo(msg);
            const referral = msg?.referral && typeof msg.referral === 'object' ? msg.referral : null;
            const rawMessageData = msg?._data && typeof msg._data === 'object' ? msg._data : {};
            const rawMessageMetadata = rawMessageData?.metadata && typeof rawMessageData.metadata === 'object'
                ? rawMessageData.metadata
                : {};
            const templateName = String(rawMessageData?.templateName || rawMessageMetadata?.templateName || '').trim() || null;
            const templateLanguage = String(rawMessageData?.templateLanguage || rawMessageMetadata?.templateLanguage || '').trim() || null;
            const templatePreviewText = String(rawMessageMetadata?.previewText || rawMessageMetadata?.templatePreviewText || '').trim()
                || String(msg?.body || '').trim()
                || null;
            const templateComponents = Array.isArray(rawMessageData?.templateComponents) ? rawMessageData.templateComponents : [];
            const normalizedMessageType = (templateName || templatePreviewText || templateComponents.length > 0)
                ? 'template'
                : msg?.type;
            const quotedPreviewBody = String(
                msg?.quotedMsg?.body
                || msg?._data?.quotedMsg?.body
                || msg?._data?.quotedMsg?.caption
                || msg?._data?.quotedMsgObj?.body
                || msg?._data?.quotedMsgObj?.caption
                || ''
            ).trim();
            const quotedPreviewHasMedia = Boolean(
                msg?.quotedMsg?.hasMedia
                || msg?._data?.quotedMsg?.hasMedia
                || msg?._data?.quotedMsgObj?.hasMedia
            );
            const quotedPreviewId = String(
                msg?.quotedMsg?.id?._serialized
                || msg?.quotedMsg?.id
                || msg?._data?.quotedMsg?.id?._serialized
                || msg?._data?.quotedMsg?.id
                || msg?._data?.quotedStanzaID
                || ''
            ).trim();
            const inboundMessagePayload = {
                id: messageId,
                chatId: scopedChatId || relatedChatIdBase,
                baseChatId: relatedChatIdBase || null,
                scopeModuleId: scopeModuleId || null,
                from: String(msg?.from || '').trim() || null,
                to: String(msg?.fromMe ? (scopedChatId || msg?.to) : msg?.to || '').trim() || null,
                body: msg?.body,
                timestamp: msg?.timestamp,
                fromMe: msg?.fromMe,
                hasMedia: msg?.hasMedia,
                mediaData: null,
                mimetype: null,
                filename: null,
                fileSizeBytes: null,
                mediaUrl: null,
                mediaPath: null,
                ack: msg?.ack,
                type: normalizedMessageType,
                author: msg?.author || msg?._data?.author || null,
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: String(msg?.from || msg?.to || '').includes('@g.us'),
                canEdit: false,
                referral: referral || null,
                order: enrichedOrder,
                location,
                quotedMessage: quotedPreviewId
                    ? {
                        id: quotedPreviewId,
                        body: quotedPreviewBody || (quotedPreviewHasMedia ? 'Adjunto' : 'Mensaje'),
                        fromMe: false,
                        hasMedia: quotedPreviewHasMedia,
                        type: quotedPreviewHasMedia ? 'media' : 'chat'
                    }
                    : null,
                templateName,
                templateLanguage,
                templatePreviewText,
                templateComponents,
                sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || null,
                sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || null,
                sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || null,
                sentViaTransport: moduleAttributionMeta?.sentViaTransport || null,
                sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || null,
                sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                ...(agentMeta || {})
            };

            emitToRuntimeContext('message', inboundMessagePayload);

            setImmediate(async () => {
                try {
                    const processedMedia = await mediaManager.processMessageMedia(msg, {
                        tenantId: historyTenantId,
                        moduleId: scopeModuleId || '',
                        contactId: relatedChatIdBase,
                        timestampUnix: Number(msg?.timestamp || 0) || null
                    });
                    if (processedMedia) {
                        emitToRuntimeContext('message_updated', {
                            id: messageId,
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            mediaUrl: processedMedia?.publicUrl || processedMedia?.url || null,
                            mediaPath: processedMedia?.relativePath || null,
                            mimetype: processedMedia?.mimetype || null,
                            filename: processedMedia?.filename || null,
                            fileSizeBytes: processedMedia?.fileSizeBytes || null,
                            mediaData: processedMedia?.mediaData || processedMedia?.data || null,
                            hasMedia: true,
                            updatedAt: new Date().toISOString()
                        });
                    }
                    const senderMeta = await resolveMessageSenderMeta(msg);
                    const fileMeta = extractMessageFileMeta(msg, processedMedia);
                    const quotedMessage = await extractQuotedMessageInfo(msg);
                    let optionChoicePayload = null;
                    let effectiveQuotedMessage = quotedMessage;

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase) {
                        try {
                            const incomingText = String(
                                msg?.body
                                || msg?.text
                                || msg?.message
                                || msg?.caption
                                || msg?._data?.body
                                || ''
                            ).trim();
                            if (incomingText && typeof quotesService?.detectOptionChoice === 'function') {
                                optionChoicePayload = await quotesService.detectOptionChoice(historyTenantId, {
                                    chatId: relatedChatIdBase,
                                    text: incomingText
                                });
                                if (optionChoicePayload?.quotedMessage && typeof optionChoicePayload.quotedMessage === 'object') {
                                    effectiveQuotedMessage = optionChoicePayload.quotedMessage;
                                }
                            }
                        } catch (_) {
                            // silent: option choice detection must never block inbound flow
                        }
                    }

                    if (effectiveQuotedMessage) {
                        emitToRuntimeContext('message_updated', {
                            id: messageId,
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            quotedMessage: effectiveQuotedMessage,
                            updatedAt: new Date().toISOString()
                        });
                    }
                    await persistMessageHistory(historyTenantId, {
                        msg,
                        senderMeta,
                        fileMeta,
                        order: enrichedOrder,
                        location,
                        quotedMessage: effectiveQuotedMessage,
                        agentMeta,
                        moduleContext: effectiveModuleContext
                    });

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase) {
                        await handleQuoteButtonReply({
                            msg,
                            tenantId: historyTenantId,
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            messageId,
                            at: activityAtIso
                        });
                    }

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase && cleanScopeModuleId && customerModuleContextsService) {
                        try {
                            const customerId = await resolveCustomerIdFromChat(historyTenantId, relatedChatIdBase, cleanScopeModuleId);
                            if (customerId) {
                                const existingContext = await customerModuleContextsService.getContext(historyTenantId, {
                                    customerId,
                                    moduleId: cleanScopeModuleId
                                });
                                const previousOptInStatus = String(existingContext?.marketingOptInStatus || '').trim().toLowerCase();
                                const shouldAutoOptIn = previousOptInStatus !== 'opted_in';
                                await customerModuleContextsService.upsertContext(historyTenantId, {
                                    customerId,
                                    moduleId: cleanScopeModuleId,
                                    marketingOptInStatus: shouldAutoOptIn ? 'opted_in' : undefined,
                                    marketingOptInUpdatedAt: shouldAutoOptIn ? activityAtIso : undefined,
                                    marketingOptInSource: shouldAutoOptIn ? 'customer_inbound_message' : undefined,
                                    firstInteractionAt: existingContext?.firstInteractionAt || activityAtIso,
                                    lastInteractionAt: activityAtIso,
                                    metadata: {
                                        dualWriteSource: 'socket_wa_events_bridge.inbound',
                                        lastInboundMessageId: messageId,
                                        ...(shouldAutoOptIn
                                            ? {
                                                optInAutoGrantedAt: activityAtIso,
                                                optInAutoGrantedFromMessageId: messageId
                                            }
                                            : {})
                                    }
                                });

                                if (customerConsentService && typeof customerConsentService.grantConsent === 'function') {
                                    await customerConsentService.grantConsent(historyTenantId, {
                                        customerId,
                                        consentType: 'marketing',
                                        source: 'customer_inbound_message',
                                        grantedAt: activityAtIso,
                                        proofPayload: {
                                            moduleId: cleanScopeModuleId,
                                            chatId: relatedChatIdBase,
                                            messageId,
                                            syncedFrom: 'socket_wa_events_bridge.inbound'
                                        }
                                    });
                                }
                            }
                        } catch (_) {
                            // silent: dual-write must not interrupt inbound flow
                        }
                    }

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase && chatOriginService) {
                        try {
                            await detectAndPersistChatOrigin({
                                tenantId: historyTenantId,
                                chatId: relatedChatIdBase,
                                scopeModuleId: cleanScopeModuleId,
                                messageId,
                                activityAtIso,
                                referral,
                                body: String(
                                    msg?.body
                                    || msg?.text
                                    || msg?.message
                                    || msg?.caption
                                    || msg?._data?.body
                                    || ''
                                ).trim()
                            });
                        } catch (_) {
                            // silent: inbound processing should not fail by origin attribution persistence issues
                        }
                    }

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase && chatCommercialStatusService) {
                        try {
                            const inboundResult = await chatCommercialStatusService.markInboundCustomerFirstContact(historyTenantId, {
                                chatId: relatedChatIdBase,
                                scopeModuleId: cleanScopeModuleId,
                                source: 'webhook',
                                reason: 'first_inbound_customer_message',
                                changedByUserId: null,
                                at: activityAtIso,
                                metadata: {
                                    trigger: 'incoming_message',
                                    messageId
                                }
                            });
                            if (inboundResult?.changed) {
                                emitCommercialStatusUpdated?.({
                                    tenantId: historyTenantId,
                                    chatId: relatedChatIdBase,
                                    scopeModuleId: cleanScopeModuleId,
                                    result: inboundResult,
                                    source: 'wa_events_bridge.inbound'
                                });
                            }
                        } catch (_) {
                            // silent: inbound processing should not fail by commercial status lifecycle issues
                        }
                    }

                    if (msg?.fromMe !== true && historyTenantId && relatedChatIdBase) {
                        try {
                            await maybeSendScheduleAutoMessages({
                                tenantId: historyTenantId,
                                chatId: relatedChatIdBase,
                                scopeModuleId: cleanScopeModuleId,
                                moduleContext: effectiveModuleContext
                            });
                        } catch (autoMessageError) {
                            console.warn('[WA][AutoMessage] skipped:', String(autoMessageError?.message || autoMessageError));
                        }

                        if (optionChoicePayload) {
                            emitToRuntimeContext('quote_option_chosen', {
                                ...optionChoicePayload,
                                tenantId: historyTenantId,
                                chatId: buildScopedChatId(relatedChatIdBase, cleanScopeModuleId) || relatedChatIdBase,
                                baseChatId: relatedChatIdBase,
                                scopeModuleId: cleanScopeModuleId || null,
                                messageId
                            });
                        }
                        try {
                            if (cleanScopeModuleId && pattyService?.tryPattyIntervention) {
                                pattyService.tryPattyIntervention(
                                    historyTenantId,
                                    cleanScopeModuleId,
                                    relatedChatIdBase,
                                    emitToRuntimeContext,
                                    { inboundAt: activityAtIso, messageId, msg, emitCommercialStatusUpdated, persistMessageHistory }
                                ).catch((error) => {
                                    console.warn('[WA][Patty] intervention scheduling warning:', String(error?.message || error));
                                });
                            }
                        } catch (_) {
                            // silent: Patty must never block inbound message processing
                        }

                        try {
                            const assignmentScopeModuleId = cleanScopeModuleId;

                            const touchedAssignment = await conversationOpsService.touchChatAssignmentActivity(historyTenantId, {
                                chatId: relatedChatIdBase,
                                scopeModuleId: assignmentScopeModuleId,
                                fromCustomer: true,
                                at: activityAtIso
                            });
                            const currentAssignment = touchedAssignment || await conversationOpsService.getChatAssignment(historyTenantId, {
                                chatId: relatedChatIdBase,
                                scopeModuleId: assignmentScopeModuleId
                            });

                            if (currentAssignment?.status === 'en_espera') {
                                const reactivationResult = await conversationOpsService.reactivateChatAssignmentOnCustomerReply(historyTenantId, {
                                    chatId: relatedChatIdBase,
                                    scopeModuleId: assignmentScopeModuleId,
                                    at: activityAtIso,
                                    metadata: {
                                        trigger: 'incoming_message'
                                    }
                                });

                                if (reactivationResult?.shouldAutoAssign) {
                                    await chatAssignmentRouterService.autoAssignChat(historyTenantId, {
                                        chatId: relatedChatIdBase,
                                        scopeModuleId: assignmentScopeModuleId,
                                        actorUserId: null,
                                        trigger: 'customer_reply_after_waiting',
                                        assignmentReason: 'customer_reply_after_waiting'
                                    });
                                }
                            } else {
                                const hasAssignee = Boolean(String(currentAssignment?.assigneeUserId || '').trim());
                                const isActive = String(currentAssignment?.status || '').trim().toLowerCase() === 'active';
                                if (!hasAssignee || !isActive) {
                                    await chatAssignmentRouterService.autoAssignChat(historyTenantId, {
                                        chatId: relatedChatIdBase,
                                        scopeModuleId: assignmentScopeModuleId,
                                        actorUserId: null,
                                        trigger: 'incoming_message_unassigned',
                                        assignmentReason: 'incoming_message_unassigned'
                                    });
                                }
                            }
                        } catch (_) {
                            // silent: inbound processing should not fail by assignment lifecycle issues
                        }

                        try {
                            const preview = String(
                                msg?.body
                                || msg?._data?.body
                                || inboundMessagePayload?.body
                                || inboundMessagePayload?.text
                                || (msg?.hasMedia ? 'Adjunto recibido' : 'Nuevo mensaje')
                            ).trim();
                            const senderName = String(
                                senderMeta?.pushName
                                || senderMeta?.name
                                || msg?._data?.notifyName
                                || msg?._data?.sender?.pushname
                                || relatedChatIdBase.split('@')[0]
                                || ''
                            ).trim();
                            pushNotificationService?.sendInboundMessageNotification?.({
                                tenantId: historyTenantId,
                                chatId: relatedChatIdBase,
                                scopeModuleId: cleanScopeModuleId,
                                senderName,
                                preview,
                                iconUrl: String(effectiveModuleContext?.imageUrl || effectiveModuleContext?.logoUrl || '').trim() || null
                            }).catch((error) => {
                                console.warn('[Push] inbound notification warning:', String(error?.message || error));
                            });
                        } catch (_) {
                            // silent: push notifications must never block inbound processing
                        }
                    }

                    try {
                        if (isVisibleChatId(relatedChatIdBase)) {
                            invalidateChatListCache();
                            const chat = await waClient.client.getChatById(relatedChatIdBase);
                            const summary = await toChatSummary(chat, {
                                includeHeavyMeta: false,
                                tenantId: historyTenantId,
                                scopeModuleId: String(effectiveModuleContext?.moduleId || '').trim().toLowerCase() || '',
                                scopeModuleName: String(effectiveModuleContext?.name || '').trim() || null,
                                scopeModuleImageUrl: String(effectiveModuleContext?.imageUrl || effectiveModuleContext?.logoUrl || '').trim() || null,
                                scopeChannelType: String(effectiveModuleContext?.channelType || '').trim().toLowerCase() || null,
                                scopeTransport: String(effectiveModuleContext?.transportMode || '').trim().toLowerCase() || null
                            });
                            if (summary) emitToRuntimeContext('chat_updated', summary);
                        }
                    } catch (e) {
                        // silent: message delivery should not fail by chat refresh issues
                    }
                } catch (backgroundError) {
                    console.warn('[WA][InboundBridge] deferred processing warning:', String(backgroundError?.message || backgroundError));
                }
            });
        });

        waClient.on('message_sent', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;
            const historyTenantId = resolveHistoryTenantId();
            const runtimeModuleContext = resolveHistoryModuleContext();
            const relatedChatIdBase = String(msg?.to || msg?.from || '').trim();
            const messageId = getSerializedMessageId(msg);
            const rawData = msg?._data && typeof msg._data === 'object' ? msg._data : {};
            const rawMetadata = rawData?.metadata && typeof rawData.metadata === 'object' ? rawData.metadata : {};
            const agentMetaFromMetadata = rawMetadata?.agentMeta && typeof rawMetadata.agentMeta === 'object'
                ? rawMetadata.agentMeta
                : null;
            const agentMeta = msg?.fromMe ? mergeAgentMeta(getOutgoingAgentMeta(messageId), agentMetaFromMetadata) : null;
            const effectiveModuleContext = buildEffectiveModuleContext(runtimeModuleContext, agentMeta);
            const moduleAttributionMeta = buildModuleAttributionMeta(effectiveModuleContext);
            const scopeModuleId = normalizeScopedModuleId(
                effectiveModuleContext?.moduleId
                || moduleAttributionMeta?.sentViaModuleId
                || ''
            );
            const cleanScopeModuleId = String(scopeModuleId || '').trim().toLowerCase();
            const scopedChatId = buildScopedChatId(relatedChatIdBase, scopeModuleId || '');
            const media = await mediaManager.processMessageMedia(msg, {
                tenantId: historyTenantId,
                moduleId: scopeModuleId || '',
                contactId: relatedChatIdBase,
                timestampUnix: Number(msg?.timestamp || 0) || null
            });
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            const isInteractive = String(msg?.type || msg?._data?.type || '').toLowerCase() === 'interactive';
            const order = isInteractive ? null : extractOrderInfo(msg);
            const location = extractLocationInfo(msg);
            const enrichedOrder = order
                ? await enrichOrderProducts(historyTenantId, order)
                : order;
            await persistMessageHistory(historyTenantId, {
                msg,
                senderMeta: null,
                fileMeta,
                order: enrichedOrder,
                location,
                quotedMessage,
                agentMeta,
                moduleContext: effectiveModuleContext
            });
            if (historyTenantId && relatedChatIdBase && chatCommercialStatusService) {
                try {
                    const eventUnixTs = Number(msg?.timestamp || 0);
                    const activityAtIso = eventUnixTs > 0
                        ? new Date(eventUnixTs * 1000).toISOString()
                        : new Date().toISOString();
                    const outboundResult = await chatCommercialStatusService.markFirstAgentReply(historyTenantId, {
                        chatId: relatedChatIdBase,
                        scopeModuleId: cleanScopeModuleId,
                        source: 'socket',
                        reason: 'first_outbound_agent_message',
                        changedByUserId: String(agentMeta?.sentByUserId || '').trim() || null,
                        at: activityAtIso,
                        metadata: {
                            trigger: 'message_sent',
                            messageId
                        }
                    });
                    if (outboundResult?.changed) {
                        emitCommercialStatusUpdated?.({
                            tenantId: historyTenantId,
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            result: outboundResult,
                            source: 'wa_events_bridge.message_sent'
                        });
                    }
                } catch (_) {
                    // silent: outbound processing should not fail by commercial status lifecycle issues
                }
            }
            if (historyTenantId && relatedChatIdBase && cleanScopeModuleId && chatCommercialStatusService) {
                try {
                    const sentByRole = String(agentMeta?.sentByRole || '').trim().toLowerCase();
                    const sentByUserId = String(agentMeta?.sentByUserId || '').trim().toLowerCase();
                    const isPattyOrAutomation = ['assistant', 'automation'].includes(sentByRole)
                        || ['patty', 'automation'].includes(sentByUserId)
                        || Boolean(agentMeta?.patty)
                        || String(agentMeta?.automationSource || '').trim();
                    if (!isPattyOrAutomation && typeof chatCommercialStatusService.extendPattyReviewWindow === 'function') {
                        await chatCommercialStatusService.extendPattyReviewWindow(historyTenantId, {
                            chatId: relatedChatIdBase,
                            scopeModuleId: cleanScopeModuleId,
                            pattyTakenBy: String(agentMeta?.sentByUserId || '').trim() || null,
                            reason: 'advisor_outbound_message'
                        });
                    }
                } catch (_) {
                    // silent: Patty handoff state should not block outbound delivery
                }
            }
            emitToRuntimeContext('message', {
                id: messageId,
                chatId: scopedChatId || relatedChatIdBase,
                baseChatId: relatedChatIdBase || null,
                scopeModuleId: scopeModuleId || null,
                from: String(msg?.from || '').trim() || null,
                to: String(scopedChatId || msg?.to || '').trim() || null,
                body: msg?.body,
                timestamp: msg?.timestamp,
                fromMe: true,
                hasMedia: msg?.hasMedia,
                mediaData: media ? media.data : null,
                mimetype: media ? media.mimetype : null,
                filename: fileMeta.filename,
                fileSizeBytes: fileMeta.fileSizeBytes,
                mediaUrl: fileMeta.mediaUrl || null,
                mediaPath: fileMeta.mediaPath || null,
                ack: msg?.ack,
                type: msg?.type,
                templateName: String(rawData?.templateName || rawMetadata?.templateName || '').trim() || null,
                templateLanguage: String(rawData?.templateLanguage || rawMetadata?.templateLanguage || '').trim() || null,
                templatePreviewText: String(rawMetadata?.previewText || '').trim() || null,
                templateComponents: Array.isArray(rawData?.templateComponents) ? rawData.templateComponents : [],
                author: msg?.author || msg?._data?.author || null,
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: String(msg?.to || msg?.from || '').includes('@g.us'),
                canEdit: false,
                order: enrichedOrder,
                location,
                quotedMessage,
                sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || null,
                sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || null,
                sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || null,
	                sentViaTransport: moduleAttributionMeta?.sentViaTransport || null,
	                sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || null,
	                sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
	                autoMessage: rawMetadata?.autoMessage === true,
	                autoMessageType: String(rawMetadata?.autoMessageType || '').trim() || null,
	                scheduleId: String(rawMetadata?.scheduleId || '').trim() || null,
	                automationSource: String(rawMetadata?.automationSource || '').trim() || null,
	                ...(agentMeta || {})
	            });

            if (messageId) {
                emitMessageEditability(messageId, scopedChatId || relatedChatIdBase);
                scheduleEditabilityRefresh(messageId, scopedChatId || relatedChatIdBase);
            }

            try {
                if (isVisibleChatId(relatedChatIdBase)) {
                    invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatIdBase);
                    const summary = await toChatSummary(chat, {
                        includeHeavyMeta: false,
                        tenantId: historyTenantId,
                        scopeModuleId: String(effectiveModuleContext?.moduleId || '').trim().toLowerCase() || '',
                        scopeModuleName: String(effectiveModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(effectiveModuleContext?.imageUrl || effectiveModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(effectiveModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(effectiveModuleContext?.transportMode || '').trim().toLowerCase() || null
                    });
                    if (summary) emitToRuntimeContext('chat_updated', summary);
                }
            } catch (e) { }
        });

        waClient.on('message_edit', async ({ message, newBody, prevBody }) => {
            if (!message || isStatusOrSystemMessage(message)) return;
            const historyTenantId = resolveHistoryTenantId();
            if (!isValidOperationalTenant(historyTenantId)) {
                warnInvalidTenant(historyTenantId, 'socket-wa-events-bridge.message_edit');
                return;
            }
            const chatId = message.fromMe ? message.to : message.from;

            const messageId = getSerializedMessageId(message);
            if (!messageId) return;

            let canEdit = false;
            try {
                canEdit = await waClient.canEditMessageById(messageId);
            } catch (e) { }

            const editedAtMs = Number(message?.latestEditSenderTimestampMs || message?._data?.latestEditSenderTimestampMs || 0);
            const editedAt = editedAtMs > 0 ? Math.floor(editedAtMs / 1000) : Math.floor(Date.now() / 1000);
            await persistMessageEdit(historyTenantId, {
                messageId,
                chatId,
                body: String(newBody ?? message.body ?? ''),
                editedAtUnix: editedAt
            });

            if (!isVisibleChatId(chatId)) return;

            emitToRuntimeContext('message_edited', {
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
                invalidateChatListCache();
                const refreshedChat = await waClient.client.getChatById(chatId);
                const runtimeModuleContext = resolveHistoryModuleContext();
                const summary = await toChatSummary(refreshedChat, {
                    includeHeavyMeta: false,
                    tenantId: historyTenantId,
                    scopeModuleId: String(runtimeModuleContext?.moduleId || '').trim().toLowerCase() || '',
                    scopeModuleName: String(runtimeModuleContext?.name || '').trim() || null,
                    scopeModuleImageUrl: String(runtimeModuleContext?.imageUrl || runtimeModuleContext?.logoUrl || '').trim() || null,
                    scopeChannelType: String(runtimeModuleContext?.channelType || '').trim().toLowerCase() || null,
                    scopeTransport: String(runtimeModuleContext?.transportMode || '').trim().toLowerCase() || null
                });
                if (summary) emitToRuntimeContext('chat_updated', summary);
            } catch (e) { }
        });

        waClient.on('message_ack', async ({ message, ack, errors, status, recipientId }) => {
            const historyTenantId = resolveHistoryTenantId();
            if (!isValidOperationalTenant(historyTenantId)) {
                warnInvalidTenant(historyTenantId, 'socket-wa-events-bridge.message_ack');
                return;
            }
            const messageId = getSerializedMessageId(message);
            const baseChatId = String(message?.to || message?.from || '').trim();
            const isFromMe = Boolean(message?.fromMe);
            const runtimeModuleContext = resolveHistoryModuleContext();
            const scopeModuleId = normalizeScopedModuleId(runtimeModuleContext?.moduleId || '');
            const scopedChatId = buildScopedChatId(baseChatId, scopeModuleId || '');
            const normalizedErrors = Array.isArray(errors) ? errors : [];
            const statusValue = String(status || '').trim().toLowerCase();
            const primaryError = normalizedErrors[0] && typeof normalizedErrors[0] === 'object'
                ? normalizedErrors[0]
                : null;
            const deliveryError = primaryError
                ? {
                    code: Number.isFinite(Number(primaryError?.code)) ? Number(primaryError.code) : null,
                    message: String(primaryError?.message || primaryError?.details || '').trim() || 'Meta rechazo la entrega del mensaje.'
                }
                : null;
            await persistMessageAck(historyTenantId, {
                messageId,
                chatId: baseChatId,
                ack
            });

            let canEdit;
            if (isFromMe && messageId) {
                try {
                    canEdit = await waClient.canEditMessageById(messageId);
                } catch (e) { }
            }

            emitToRuntimeContext('message_ack', {
                id: messageId,
                chatId: scopedChatId || baseChatId,
                baseChatId: baseChatId || null,
                scopeModuleId: scopeModuleId || null,
                ack: ack,
                canEdit
            });

            if (messageId && deliveryError) {
                emitToRuntimeContext('message_updated', {
                    id: messageId,
                    chatId: scopedChatId || baseChatId,
                    baseChatId: baseChatId || null,
                    scopeModuleId: scopeModuleId || null,
                    deliveryError,
                    updatedAt: new Date().toISOString()
                });
            }

            const tenantId = String(historyTenantId || '').trim();
            const recipientPhoneDigits = String(recipientId || '').replace(/^\+/, '').trim();
            const recipientPhone = recipientPhoneDigits ? `+${recipientPhoneDigits}` : '';
            if (statusValue === 'failed' && recipientPhone) {
                updateCustomerPhoneStatusFromDeliveryError({
                    tenantId,
                    phone: recipientPhone,
                    errorCode: deliveryError?.code ?? null
                }).catch((err) => console.warn('[PHONE-STATUS] failed update:', err.message));
            }
            if ((statusValue === 'delivered' || statusValue === 'read') && recipientPhone) {
                updateCustomerPhoneStatusAsValid({
                    tenantId,
                    phone: recipientPhone
                }).catch((err) => console.warn('[PHONE-STATUS] valid update:', err.message));
            }

            if (isFromMe && messageId) {
                scheduleEditabilityRefresh(messageId, scopedChatId || baseChatId, [900, 2600]);
            }
        });

        waClient.on('message_reaction', ({ messageId, emoji, senderId, chatId, timestamp }) => {
            const historyTenantId = resolveHistoryTenantId();
            if (!isValidOperationalTenant(historyTenantId)) {
                warnInvalidTenant(historyTenantId, 'socket-wa-events-bridge.message_reaction');
                return;
            }
            const cleanMessageId = String(messageId || '').trim();
            const cleanEmoji = String(emoji || '').trim();
            if (!cleanMessageId || !cleanEmoji) return;

            const runtimeModuleContext = resolveHistoryModuleContext();
            const scopeModuleId = normalizeScopedModuleId(runtimeModuleContext?.moduleId || '');
            const baseChatId = String(chatId || '').trim();
            const scopedChatId = buildScopedChatId(baseChatId, scopeModuleId || '');

            emitToRuntimeContext('message_reaction', {
                messageId: cleanMessageId,
                emoji: cleanEmoji,
                senderId: String(senderId || '').trim() || null,
                chatId: scopedChatId || baseChatId || null,
                baseChatId: baseChatId || null,
                scopeModuleId: scopeModuleId || null,
                timestamp: Number(timestamp || 0) || Math.floor(Date.now() / 1000)
            });

            persistMessageReaction?.(historyTenantId, {
                messageId: cleanMessageId,
                chatId: baseChatId || null,
                emoji: cleanEmoji,
                senderId: String(senderId || '').trim() || null,
                timestamp: Number(timestamp || 0) || Math.floor(Date.now() / 1000)
            });
        });
    };

    return {
        registerWaProviderEvents
    };
}

module.exports = {
    createSocketWaEventsBridgeService
};
