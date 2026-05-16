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
const waClient = require('./wa-provider.service');

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_ASSISTANT_NAME = 'Patty';

function text(value = '') {
    return String(value ?? '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function normalizeChatId(value = '') {
    return text(value).split('::mod::')[0].trim();
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
    const { rows } = await pgQuery(
        `SELECT module_id, name, metadata
           FROM wa_modules
          WHERE tenant_id = $1
            AND LOWER(module_id) = LOWER($2)
          LIMIT 1`,
        [cleanTenantId, cleanModuleId]
    );
    const row = rows?.[0];
    if (!row) return null;
    const metadata = safeJsonObject(row.metadata);
    const aiConfig = safeJsonObject(metadata.aiConfig);
    return {
        moduleId: text(row.module_id) || cleanModuleId,
        name: text(row.name),
        metadata,
        scheduleId: text(metadata.scheduleId || metadata.schedule_id),
        aiConfig: Object.keys(aiConfig).length ? aiConfig : null
    };
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

async function callAnthropic({ system, userMessage }) {
    const apiKey = text(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
    if (!apiKey) {
        console.warn('[Patty] ANTHROPIC_API_KEY missing; suggestion skipped.');
        return '';
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: text(process.env.PATTY_ANTHROPIC_MODEL) || DEFAULT_MODEL,
            max_tokens: 400,
            system,
            messages: [{ role: 'user', content: userMessage }]
        })
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Anthropic ${response.status}: ${detail.slice(0, 240)}`);
    }
    const data = await response.json();
    return (Array.isArray(data?.content) ? data.content : [])
        .map((part) => part?.type === 'text' ? part.text : '')
        .join('\n')
        .trim();
}

async function generatePattySuggestion(tenantId, moduleId, chatId) {
    const context = await buildPattyContext(tenantId, moduleId, chatId);
    const suggestion = await callAnthropic({
        system: context.system,
        userMessage: context.lastCustomerMessage
    });
    return { ...context, suggestion };
}

async function hasOutboundAfter(tenantId, moduleId, chatId, sinceIso) {
    if (!sinceIso) return false;
    const { rows } = await pgQuery(
        `SELECT message_id
           FROM tenant_messages
          WHERE tenant_id = $1
            AND chat_id = $2
            AND from_me = TRUE
            AND created_at > $4::timestamptz
            AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
          LIMIT 1`,
        [tenantId, normalizeChatId(chatId), lower(moduleId), sinceIso]
    );
    return rows.length > 0;
}

function emitSuggestion(socketEmitter, tenantId, payload) {
    if (typeof socketEmitter === 'function') {
        socketEmitter('patty_suggestion', payload);
        return;
    }
    if (socketEmitter?.to && typeof socketEmitter.to === 'function') {
        socketEmitter.to(tenantId).emit('patty_suggestion', payload);
    }
}

async function tryPattyIntervention(tenantId, moduleId, chatId, socketEmitter, options = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    const cleanChatId = normalizeChatId(chatId);
    const moduleConfig = await getModuleConfig(cleanTenantId, cleanModuleId);
    const aiConfig = moduleConfig?.aiConfig;
    if (!aiConfig) return;

    const scheduleState = await resolveScheduleState(cleanTenantId, moduleConfig);
    const mode = scheduleState.open
        ? lower(aiConfig.withinHoursMode || aiConfig.within_hours_mode || 'off')
        : lower(aiConfig.outsideHoursMode || aiConfig.outside_hours_mode || 'off');
    if (!['review', 'autonomous'].includes(mode)) return;

    const waitMinutes = Math.max(1, Math.min(60, Number(aiConfig.waitMinutes || aiConfig.wait_minutes || 5) || 5));
    const inboundAt = text(options.inboundAt) || new Date().toISOString();
    const timer = setTimeout(async () => {
        try {
            if (await hasOutboundAfter(cleanTenantId, cleanModuleId, cleanChatId, inboundAt)) return;
            const result = await generatePattySuggestion(cleanTenantId, cleanModuleId, cleanChatId);
            if (!result.suggestion) return;
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
        } catch (error) {
            console.warn('[Patty] intervention skipped:', error?.message || error);
        }
    }, waitMinutes * 60 * 1000);
    if (typeof timer.unref === 'function') timer.unref();
}

module.exports = {
    buildPattyContext,
    generatePattySuggestion,
    tryPattyIntervention
};
