const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres
} = require('../../../config/persistence-runtime');
const tenantIntegrationsService = require('../../tenant/services/integrations.service');
const tenantScheduleService = require('../../tenant/services/tenant-schedule.service');
const quickRepliesManagerService = require('../../tenant/services/quick-replies-manager.service');
const tenantZoneRulesService = require('../../tenant/services/tenant-zone-rules.service');
const waModulesService = require('../../tenant/services/wa-modules.service');
const { getChatSuggestion } = require('../../operations/services/ai.service');
const waClient = require('./wa-provider.service');

const DEFAULT_ASSISTANT_NAME = 'Patty';
const DEFAULT_WAIT_SECONDS = 15;
const MIN_WAIT_SECONDS = 5;
const MAX_WAIT_SECONDS = 300;
const pattyChatDebounce = new Map();

function text(value = '') {
    return String(value ?? '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function normalizeChatId(value = '') {
    return text(value).split('::mod::')[0].trim();
}

function buildDebounceKey(tenantId, moduleId, chatId) {
    return [
        normalizeTenantId(tenantId || DEFAULT_TENANT_ID),
        lower(moduleId),
        normalizeChatId(chatId)
    ].join('::');
}

function clampWaitSeconds(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_WAIT_SECONDS;
    return Math.max(MIN_WAIT_SECONDS, Math.min(MAX_WAIT_SECONDS, parsed));
}

function resolveWaitSeconds(aiConfig = {}) {
    const directSeconds = Number.parseInt(String(aiConfig.waitSeconds ?? aiConfig.wait_seconds ?? ''), 10);
    if (Number.isFinite(directSeconds)) return clampWaitSeconds(directSeconds);

    const legacyMinutes = Number.parseFloat(String(aiConfig.waitMinutes ?? aiConfig.wait_minutes ?? ''));
    if (Number.isFinite(legacyMinutes) && legacyMinutes > 0) {
        return clampWaitSeconds(Math.round(legacyMinutes * 60));
    }

    return DEFAULT_WAIT_SECONDS;
}

function phoneCandidatesFromChatId(chatId = '') {
    const digits = normalizeChatId(chatId).split('@')[0].replace(/[^\d]/g, '');
    if (!digits) return [];
    return [`+${digits}`, digits];
}

function money(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function lineList(lines = [], fallback = 'Sin datos disponibles.') {
    const clean = lines.map((item) => text(item)).filter(Boolean);
    return clean.length ? clean.join('\n') : fallback;
}

function safeJsonObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function pgQuery(sql, params = []) {
    if (getStorageDriver() !== 'postgres') return { rows: [] };
    try {
        return await queryPostgres(sql, params);
    } catch (error) {
        const msg = lower(error?.message || error);
        if (msg.includes('does not exist') || msg.includes('no existe')) return { rows: [] };
        console.warn('[Patty] context query skipped:', error?.message || error);
        return { rows: [] };
    }
}

async function getModuleConfig(tenantId, moduleId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    if (!cleanTenantId || !cleanModuleId) return null;
    try {
        const modules = await waModulesService.listModules(cleanTenantId, { includeInactive: true, userId: '' });
        const module = (Array.isArray(modules) ? modules : [])
            .find((item) => lower(item?.moduleId) === cleanModuleId) || null;
        if (module) {
            const metadata = safeJsonObject(module.metadata);
            const aiConfig = safeJsonObject(module.aiConfig || metadata.aiConfig);
            if (!Object.keys(aiConfig).length) {
                console.log('[Patty] module found without aiConfig from waModulesService', {
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    metadataKeys: Object.keys(metadata)
                });
            }
            return {
                moduleId: text(module.moduleId) || cleanModuleId,
                name: text(module.name),
                metadata: {
                    ...metadata,
                    aiConfig,
                    scheduleId: text(module.scheduleId || metadata.scheduleId || metadata.schedule_id) || null
                },
                scheduleId: text(module.scheduleId || metadata.scheduleId || metadata.schedule_id),
                aiConfig: Object.keys(aiConfig).length ? aiConfig : null
            };
        }
        console.log('[Patty] module not found through waModulesService; trying direct query', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId
        });
    } catch (error) {
        console.warn('[Patty] waModulesService.getModule failed; trying direct query', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            error: error?.message || String(error)
        });
    }

    if (getStorageDriver() !== 'postgres') return null;
    try {
        const { rows } = await queryPostgres(
            `SELECT module_id, module_name, metadata
               FROM wa_modules
              WHERE tenant_id = $1
                AND LOWER(module_id) = LOWER($2)
              LIMIT 1`,
            [cleanTenantId, cleanModuleId]
        );
        const row = rows?.[0];
        if (!row) {
            console.log('[Patty] module direct query returned no rows', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId
            });
            return null;
        }
        const metadata = safeJsonObject(row.metadata);
        const aiConfig = safeJsonObject(metadata.aiConfig);
        if (!Object.keys(aiConfig).length) {
            console.log('[Patty] module direct query found row without aiConfig', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                metadataKeys: Object.keys(metadata)
            });
        }
        return {
            moduleId: text(row.module_id) || cleanModuleId,
            name: text(row.module_name),
            metadata,
            scheduleId: text(metadata.scheduleId || metadata.schedule_id),
            aiConfig: Object.keys(aiConfig).length ? aiConfig : null
        };
    } catch (error) {
        console.warn('[Patty] module direct query failed', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            error: error?.message || String(error)
        });
        return null;
    }
}

function getAssistantNameFromModule(moduleConfig = {}) {
    return text(moduleConfig?.aiConfig?.assistantName) || DEFAULT_ASSISTANT_NAME;
}

async function resolveScheduleState(tenantId, moduleConfig) {
    const scheduleId = text(moduleConfig?.scheduleId);
    if (!scheduleId) return { open: true, label: 'Sin horario asignado' };
    try {
        const result = await tenantScheduleService.isWithinSchedule(tenantId, scheduleId, new Date());
        return {
            open: result?.open === true,
            label: result?.open === true ? 'Ahora: ABIERTO' : 'Ahora: CERRADO'
        };
    } catch (error) {
        console.warn('[Patty] schedule check skipped:', error?.message || error);
        return { open: true, label: 'Horario no disponible' };
    }
}

async function getBasePrompt(tenantId) {
    try {
        const integrations = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
        const ai = safeJsonObject(integrations?.ai);
        const assistants = Array.isArray(ai.assistants) ? ai.assistants : [];
        const defaultId = text(ai.defaultAssistantId);
        const assistant = assistants.find((item) => text(item?.assistantId) === defaultId && item?.isActive !== false)
            || assistants.find((item) => item?.isDefault === true && item?.isActive !== false)
            || assistants.find((item) => item?.isActive !== false)
            || null;
        return text(assistant?.systemPrompt || ai.systemPrompt);
    } catch (error) {
        console.warn('[Patty] base prompt unavailable:', error?.message || error);
        return '';
    }
}

async function getCatalogContext(tenantId) {
    const { rows } = await pgQuery(
        `SELECT item_id, title, price, metadata
           FROM catalog_items
          WHERE tenant_id = $1
          LIMIT 120`,
        [tenantId]
    );
    return rows
        .map((row) => {
            const metadata = safeJsonObject(row.metadata);
            const sale = money(metadata.salePrice ?? metadata.sale_price ?? metadata.precio_oferta);
            const regular = money(row.price ?? metadata.regularPrice ?? metadata.regular_price);
            const display = sale || regular;
            if (!text(row.title) || !display) return null;
            return {
                score: display,
                line: `- ${text(row.title)}: S/ ${display.toFixed(2)}${regular && sale && regular > sale ? ` (regular S/ ${regular.toFixed(2)})` : ''}`
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((item) => item.line);
}

async function getQuickRepliesContext(tenantId, moduleId) {
    try {
        const items = await quickRepliesManagerService.listQuickReplies({ tenantId, moduleId });
        return (Array.isArray(items) ? items : [])
            .slice(0, 20)
            .map((item) => `[${text(item.label) || text(item.id) || 'Respuesta'}]: ${text(item.text).replace(/\s+/g, ' ')}`)
            .filter((line) => line.length > 4);
    } catch (error) {
        console.warn('[Patty] quick replies unavailable:', error?.message || error);
        return [];
    }
}

async function getZonesContext(tenantId) {
    try {
        const rules = await tenantZoneRulesService.listZoneRules(tenantId, { includeInactive: false });
        return (Array.isArray(rules) ? rules : [])
            .slice(0, 20)
            .map((rule) => {
                const meta = safeJsonObject(rule.rulesJson || rule.rules_json || rule.metadata);
                return `- ${text(rule.name)}${text(meta.description || meta.notes) ? `: ${text(meta.description || meta.notes)}` : ''}`;
            })
            .filter(Boolean);
    } catch (error) {
        console.warn('[Patty] zones unavailable:', error?.message || error);
        return [];
    }
}

async function getCustomerContext(tenantId, moduleId, chatId) {
    const phones = phoneCandidatesFromChatId(chatId);
    if (!phones.length) return { summary: 'Cliente nuevo / Prospecto', customerId: null };
    const { rows } = await pgQuery(
        `SELECT customer_id, contact_name, first_name, last_name, phone_e164, email,
                segmento, compras_total, monto_acumulado, primera_fecha_compra,
                cadencia_prom_dias, dias_ultima_compra, rango_compras
           FROM tenant_customers
          WHERE tenant_id = $1
            AND (phone_e164 = ANY($2::text[]) OR phone_alt = ANY($2::text[]))
            AND (module_id IS NULL OR module_id = '' OR LOWER(module_id) = LOWER($3))
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1`,
        [tenantId, phones, lower(moduleId)]
    );
    const row = rows?.[0];
    if (!row) return { summary: 'Cliente nuevo / Prospecto', customerId: null };
    const name = text(row.contact_name || [row.first_name, row.last_name].filter(Boolean).join(' ')) || 'Cliente registrado';
    const lines = [
        `Nombre: ${name}`,
        row.segmento ? `Segmento: ${row.segmento}` : '',
        row.compras_total !== null && row.compras_total !== undefined ? `Compras total: ${row.compras_total}` : '',
        row.monto_acumulado !== null && row.monto_acumulado !== undefined ? `Monto acumulado: S/ ${row.monto_acumulado}` : '',
        row.primera_fecha_compra ? `Primera compra: ${row.primera_fecha_compra}` : '',
        row.cadencia_prom_dias !== null && row.cadencia_prom_dias !== undefined ? `Cadencia promedio: ${row.cadencia_prom_dias} dias` : '',
        row.dias_ultima_compra !== null && row.dias_ultima_compra !== undefined ? `Dias desde ultima compra: ${row.dias_ultima_compra}` : '',
        row.rango_compras ? `Rango compras: ${row.rango_compras}` : ''
    ].filter(Boolean);
    return { summary: lines.join('\n'), customerId: text(row.customer_id) || null };
}

async function getCustomerLabelsContext(tenantId, customerId) {
    if (!customerId) return [];
    const { rows } = await pgQuery(
        `SELECT COALESCE(gl.name, tzr.name, tcl.label_id) AS label_name, tcl.source
           FROM tenant_customer_labels tcl
      LEFT JOIN global_labels gl ON gl.id = tcl.label_id
      LEFT JOIN tenant_zone_rules tzr ON tzr.rule_id = tcl.label_id
          WHERE tcl.tenant_id = $1
            AND tcl.customer_id = $2
          ORDER BY tcl.assigned_at DESC NULLS LAST
          LIMIT 20`,
        [tenantId, customerId]
    );
    return rows.map((row) => `- ${text(row.label_name)}${text(row.source) ? ` (${text(row.source)})` : ''}`).filter(Boolean);
}

async function getCommercialStatusContext(tenantId, moduleId, chatId) {
    const { rows } = await pgQuery(
        `SELECT status
           FROM tenant_chat_commercial_status
          WHERE tenant_id = $1
            AND chat_id = $2
            AND (scope_module_id IS NULL OR scope_module_id = '' OR LOWER(scope_module_id) = LOWER($3))
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1`,
        [tenantId, normalizeChatId(chatId), lower(moduleId)]
    );
    return text(rows?.[0]?.status) || 'sin_estado';
}

async function getOriginContext(tenantId, moduleId, chatId) {
    const { rows } = await pgQuery(
        `SELECT origin_type, referral_headline, raw_referral, campaign_id
           FROM tenant_chat_origins
          WHERE tenant_id = $1
            AND chat_id = $2
            AND (scope_module_id IS NULL OR scope_module_id = '' OR LOWER(scope_module_id) = LOWER($3))
          ORDER BY detected_at ASC NULLS LAST
          LIMIT 1`,
        [tenantId, normalizeChatId(chatId), lower(moduleId)]
    );
    const row = rows?.[0];
    if (!row) return 'Contacto directo';
    const raw = safeJsonObject(row.raw_referral);
    if (lower(row.origin_type) === 'meta_ad' || text(row.referral_headline)) {
        return `Llego por anuncio Meta: ${text(row.referral_headline || raw.headline) || 'Anuncio'}${text(raw.body) ? ` - ${text(raw.body)}` : ''}`;
    }
    if (text(row.campaign_id)) return `Responde a campana: ${text(row.campaign_id)}`;
    return text(row.origin_type) || 'Contacto directo';
}

async function getConversationContext(tenantId, moduleId, chatId) {
    const { rows } = await pgQuery(
        `SELECT from_me, body, message_type, order_payload, created_at
           FROM tenant_messages
          WHERE tenant_id = $1
            AND chat_id = $2
            AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
          ORDER BY created_at DESC
          LIMIT 20`,
        [tenantId, normalizeChatId(chatId), lower(moduleId)]
    );
    const ordered = [...rows].reverse();
    const lines = ordered.map((row) => {
        const who = row.from_me ? 'ASESOR' : 'CLIENTE';
        const body = text(row.body) || (lower(row.message_type) === 'order' ? '[Pedido catalogo]' : `[${text(row.message_type) || 'mensaje'}]`);
        const time = row.created_at ? new Date(row.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '';
        return `[${who}]: ${body}${time ? ` (${time})` : ''}`;
    });
    const lastInbound = [...rows].find((row) => row.from_me !== true && text(row.body));
    const recentOrder = rows.find((row) => row.order_payload && Object.keys(safeJsonObject(row.order_payload)).length > 0);
    return {
        lines,
        lastCustomerMessage: text(lastInbound?.body) || '',
        recentOrder: recentOrder?.order_payload || null
    };
}

async function getActiveQuoteContext(tenantId, moduleId, chatId) {
    const { rows } = await pgQuery(
        `SELECT quote_id, items_json, summary_json
           FROM tenant_quotes
          WHERE tenant_id = $1
            AND chat_id = $2
            AND status = 'sent'
            AND (scope_module_id IS NULL OR scope_module_id = '' OR LOWER(scope_module_id) = LOWER($3))
          ORDER BY sent_at DESC NULLS LAST, updated_at DESC NULLS LAST
          LIMIT 1`,
        [tenantId, normalizeChatId(chatId), lower(moduleId)]
    );
    const row = rows?.[0];
    if (!row) return '';
    const items = Array.isArray(row.items_json) ? row.items_json : [];
    const summary = safeJsonObject(row.summary_json);
    const products = items.map((item) => `${text(item.title || item.name)} x${item.quantity || 1}`).filter(Boolean).join(', ');
    const total = money(summary.totalPayable ?? summary.total_payable ?? summary.total);
    return `Cotizacion enviada (${text(row.quote_id)}): ${products || 'productos'}${total ? ` Total: S/ ${total.toFixed(2)}` : ''}`;
}

function formatOrderContext(orderPayload) {
    const order = safeJsonObject(orderPayload);
    const products = Array.isArray(order.products) ? order.products : [];
    if (!products.length) return '';
    const lines = products.map((item) => `${text(item.name || item.title || item.sku)} x${item.quantity || 1}`).filter(Boolean);
    const total = money(order.total || order.totalPayable || order.summary?.totalPayable || products.reduce((acc, item) => acc + (money(item.lineTotal) || 0), 0));
    return `Pedido del catalogo: ${lines.join(', ')}${total ? ` Total: S/ ${total.toFixed(2)}` : ''}`;
}

async function buildPattyContext(tenantId, moduleId, chatId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    const cleanChatId = normalizeChatId(chatId);
    const moduleConfig = await getModuleConfig(cleanTenantId, cleanModuleId);
    const assistantName = getAssistantNameFromModule(moduleConfig || {});
    const [scheduleState, basePrompt, catalog, quickReplies, zones, customer, commercialStatus, origin, conversation, quote] = await Promise.all([
        resolveScheduleState(cleanTenantId, moduleConfig || {}),
        getBasePrompt(cleanTenantId),
        getCatalogContext(cleanTenantId),
        getQuickRepliesContext(cleanTenantId, cleanModuleId),
        getZonesContext(cleanTenantId),
        getCustomerContext(cleanTenantId, cleanModuleId, cleanChatId),
        getCommercialStatusContext(cleanTenantId, cleanModuleId, cleanChatId),
        getOriginContext(cleanTenantId, cleanModuleId, cleanChatId),
        getConversationContext(cleanTenantId, cleanModuleId, cleanChatId),
        getActiveQuoteContext(cleanTenantId, cleanModuleId, cleanChatId)
    ]);
    const labels = await getCustomerLabelsContext(cleanTenantId, customer.customerId);
    const recentOrder = formatOrderContext(conversation.recentOrder);
    const system = [
        basePrompt || 'Eres una asesora comercial experta de WhatsApp. Responde de forma breve, clara, humana y orientada a venta consultiva.',
        '',
        `Tu nombre visible es: ${assistantName}.`,
        `Modulo: ${moduleConfig?.name || cleanModuleId || 'sin modulo'}. ${scheduleState.label}.`,
        '',
        'NEGOCIO / CATALOGO:',
        lineList(catalog),
        '',
        'RESPUESTAS RAPIDAS DISPONIBLES:',
        lineList(quickReplies),
        '',
        'ZONAS DE DELIVERY:',
        lineList(zones),
        '',
        'CLIENTE:',
        customer.summary,
        `Estado comercial actual: ${commercialStatus}`,
        `Etiquetas: ${labels.length ? labels.join(', ') : 'sin etiquetas'}`,
        '',
        'ORIGEN:',
        origin,
        '',
        'CONVERSACION RECIENTE:',
        lineList(conversation.lines),
        quote ? `\n${quote}` : '',
        recentOrder ? `\n${recentOrder}` : '',
        '',
        'INSTRUCCIONES:',
        '- Devuelve solo el texto exacto listo para enviar al cliente.',
        '- No digas "Sugerencia", no expliques tu razonamiento y no inventes datos.',
        '- Si falta informacion, pregunta de forma breve y amable.',
        '- Mantén el tono comercial, cercano y natural.'
    ].filter((part) => part !== null && part !== undefined).join('\n');

    return {
        tenantId: cleanTenantId,
        moduleId: cleanModuleId,
        chatId: cleanChatId,
        moduleConfig,
        assistantName,
        system,
        lastCustomerMessage: conversation.lastCustomerMessage || 'Continua la conversacion con el cliente.'
    };
}

async function generatePattySuggestion(tenantId, moduleId, chatId) {
    const context = await buildPattyContext(tenantId, moduleId, chatId);
    const moduleAssistantId = text(context.moduleConfig?.metadata?.moduleSettings?.aiAssistantId).toUpperCase();
    console.log('[Patty] generating suggestion', {
        tenantId: context.tenantId,
        moduleId: context.moduleId,
        chatId: context.chatId,
        moduleAssistantId: moduleAssistantId || null,
        contextChars: context.system.length,
        lastCustomerMessageChars: context.lastCustomerMessage.length
    });
    const suggestion = await getChatSuggestion(
        context.system,
        `Ultimo mensaje del cliente: ${context.lastCustomerMessage}\n\nResponde solo con el texto listo para enviar por WhatsApp.`,
        null,
        null,
        {
            tenantId: context.tenantId,
            moduleAssistantId,
            runtimeContext: {
                chat: { chatId: context.chatId },
                module: {
                    moduleId: context.moduleId,
                    name: context.moduleConfig?.name || context.moduleId
                }
            },
            moduleContext: context.moduleConfig
                ? {
                    moduleId: context.moduleConfig.moduleId,
                    name: context.moduleConfig.name,
                    metadata: context.moduleConfig.metadata
                }
                : null
        }
    );
    console.log('[Patty] suggestion generated', {
        tenantId: context.tenantId,
        moduleId: context.moduleId,
        chatId: context.chatId,
        suggestionChars: text(suggestion).length,
        isAiError: text(suggestion).startsWith('Error IA:') || lower(suggestion).includes('ia no configurada')
    });
    return { ...context, suggestion };
}

async function hasOutboundAfter(tenantId, moduleId, chatId, sinceIso) {
    if (!sinceIso) return { hasOutbound: false, latest: null };
    const { rows } = await pgQuery(
        `SELECT message_id, created_at, body
           FROM tenant_messages
          WHERE tenant_id = $1
            AND chat_id = $2
            AND from_me = TRUE
            AND created_at > $4::timestamptz
            AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
          ORDER BY created_at DESC
          LIMIT 1`,
        [tenantId, normalizeChatId(chatId), lower(moduleId), sinceIso]
    );
    const latest = rows?.[0] || null;
    return {
        hasOutbound: Boolean(latest),
        latest: latest
            ? {
                messageId: text(latest.message_id),
                createdAt: latest.created_at,
                bodyPreview: text(latest.body).slice(0, 80)
            }
            : null
    };
}

function emitSuggestion(socketEmitter, tenantId, payload) {
    if (typeof socketEmitter === 'function') {
        socketEmitter('patty_suggestion', payload);
        console.log('[Patty] emitted suggestion via runtime context', {
            tenantId,
            chatId: payload?.chatId,
            moduleId: payload?.moduleId,
            suggestionChars: text(payload?.suggestion).length
        });
        return;
    }
    if (socketEmitter?.to && typeof socketEmitter.to === 'function') {
        socketEmitter.to(tenantId).emit('patty_suggestion', payload);
        console.log('[Patty] emitted suggestion via socket room', {
            tenantId,
            chatId: payload?.chatId,
            moduleId: payload?.moduleId,
            suggestionChars: text(payload?.suggestion).length
        });
        return;
    }
    console.warn('[Patty] could not emit suggestion: socket emitter unavailable', {
        tenantId,
        chatId: payload?.chatId,
        moduleId: payload?.moduleId
    });
}

async function tryPattyIntervention(tenantId, moduleId, chatId, socketEmitter, options = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    const cleanChatId = normalizeChatId(chatId);
    const moduleConfig = await getModuleConfig(cleanTenantId, cleanModuleId);
    const aiConfig = moduleConfig?.aiConfig;
    if (!aiConfig) {
        console.log('[Patty] skipped: module has no aiConfig', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId
        });
        return;
    }

    const scheduleState = await resolveScheduleState(cleanTenantId, moduleConfig);
    const mode = scheduleState.open
        ? lower(aiConfig.withinHoursMode || aiConfig.within_hours_mode || 'off')
        : lower(aiConfig.outsideHoursMode || aiConfig.outside_hours_mode || 'off');
    if (!['review', 'autonomous'].includes(mode)) {
        console.log('[Patty] skipped: mode off or unsupported', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            scheduleOpen: scheduleState.open,
            mode
        });
        return;
    }

    const waitSeconds = resolveWaitSeconds(aiConfig);
    const inboundAt = text(options.inboundAt) || new Date().toISOString();
    const debounceKey = buildDebounceKey(cleanTenantId, cleanModuleId, cleanChatId);
    const previousTimer = pattyChatDebounce.get(debounceKey);
    if (previousTimer) {
        clearTimeout(previousTimer);
        console.log('[Patty] debounce reset: previous timer cancelled', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            waitSeconds
        });
    }
    console.log('[Patty] scheduled intervention', {
        tenantId: cleanTenantId,
        moduleId: cleanModuleId,
        chatId: cleanChatId,
        mode,
        waitSeconds,
        inboundAt,
        scheduleOpen: scheduleState.open
    });
    const timer = setTimeout(async () => {
        try {
            if (pattyChatDebounce.get(debounceKey) === timer) {
                pattyChatDebounce.delete(debounceKey);
            }
            console.log('[Patty] timer fired', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                mode,
                inboundAt
            });
            const outboundCheck = await hasOutboundAfter(cleanTenantId, cleanModuleId, cleanChatId, inboundAt);
            if (outboundCheck.hasOutbound) {
                console.log('[Patty] cancelled: outbound response found after inbound', {
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    chatId: cleanChatId,
                    inboundAt,
                    latestOutbound: outboundCheck.latest
                });
                return;
            }
            const result = await generatePattySuggestion(cleanTenantId, cleanModuleId, cleanChatId);
            if (!result.suggestion) {
                console.log('[Patty] skipped: empty suggestion', {
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    chatId: cleanChatId
                });
                return;
            }
            const assistantName = result.assistantName || DEFAULT_ASSISTANT_NAME;
            if (mode === 'review') {
                emitSuggestion(socketEmitter, cleanTenantId, {
                    chatId: cleanChatId,
                    moduleId: cleanModuleId,
                    suggestion: result.suggestion,
                    assistantName,
                    timestamp: Date.now()
                });
                return;
            }
            console.log('[Patty] sending autonomous message', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                suggestionChars: text(result.suggestion).length
            });
            await waClient.sendMessage(cleanChatId, result.suggestion, {
                metadata: {
                    agentMeta: {
                        sentByUserId: 'patty',
                        sentByName: assistantName,
                        sentByRole: 'assistant',
                        sentViaModuleId: cleanModuleId
                    },
                    patty: true,
                    automationSource: 'patty_autonomous'
                }
            });
            console.log('[Patty] autonomous message sent', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId
            });
        } catch (error) {
            if (pattyChatDebounce.get(debounceKey) === timer) {
                pattyChatDebounce.delete(debounceKey);
            }
            console.warn('[Patty] intervention skipped:', error?.message || error);
        }
    }, waitSeconds * 1000);
    pattyChatDebounce.set(debounceKey, timer);
    if (typeof timer.unref === 'function') timer.unref();
}

module.exports = {
    buildPattyContext,
    generatePattySuggestion,
    tryPattyIntervention
};
