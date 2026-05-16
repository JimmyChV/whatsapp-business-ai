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

function formatMoney(value, fallback = '0.00') {
    const parsed = money(value);
    return parsed === null ? fallback : parsed.toFixed(2);
}

function firstPhoneE164FromChatId(chatId = '') {
    const digits = normalizeChatId(chatId).split('@')[0].replace(/[^\d]/g, '');
    return digits ? `+${digits}` : '';
}

function lineList(lines = [], fallback = 'Sin datos disponibles.') {
    const clean = lines.map((item) => text(item)).filter(Boolean);
    return clean.length ? clean.join('\n') : fallback;
}

function sleep(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function safeJsonObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function extractJsonObject(value = '') {
    const raw = text(value);
    if (!raw) return null;
    const candidates = [
        raw,
        raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    ];
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.push(raw.slice(firstBrace, lastBrace + 1));
    }
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch (error) {
            // Try the next candidate.
        }
    }
    return null;
}

function normalizePattyMessages(rawSuggestion = '') {
    const parsed = extractJsonObject(rawSuggestion);
    const rawMessages = Array.isArray(parsed?.messages) ? parsed.messages : [];
    const messages = rawMessages
        .map((item) => ({
            text: text(item?.text).slice(0, 2000),
            quotedMessageId: text(item?.quotedMessageId || item?.quoted_message_id) || null
        }))
        .filter((item) => item.text)
        .slice(0, 3);
    if (messages.length) return messages;
    const fallback = text(rawSuggestion);
    return fallback ? [{ text: fallback, quotedMessageId: null }] : [];
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
    const phoneE164 = firstPhoneE164FromChatId(chatId);
    if (!phoneE164) return { summary: 'CLIENTE: Prospecto nuevo (no registrado en BD)', customerId: null };
    try {
        const { rows } = await pgQuery(
            `SELECT customer_id, contact_name, first_name, last_name_paternal, phone_e164,
                    segmento, compras_total, monto_acumulado, primera_fecha_compra,
                    cadencia_prom_dias, dias_ultima_compra, rango_compras
               FROM tenant_customers
              WHERE tenant_id = $1
                AND phone_e164 = $2
                AND (module_id IS NULL OR module_id = '' OR LOWER(module_id) = LOWER($3))
              ORDER BY updated_at DESC NULLS LAST
              LIMIT 1`,
            [tenantId, phoneE164, lower(moduleId)]
        );
        const row = rows?.[0];
        if (!row) return { summary: 'CLIENTE: Prospecto nuevo (no registrado en BD)', customerId: null };
        const name = text([row.first_name, row.last_name_paternal].filter(Boolean).join(' '))
            || text(row.contact_name)
            || 'Cliente registrado';
        const lines = [
            'CLIENTE REGISTRADO:',
            `- Nombre: ${name}`,
            `- Segmento: ${text(row.segmento) || 'Sin segmento'}`,
            `- Total compras: ${row.compras_total ?? 0}`,
            `- Monto acumulado: S/ ${formatMoney(row.monto_acumulado)}`,
            `- Primera compra: ${text(row.primera_fecha_compra) || 'Sin fecha registrada'}`,
            row.dias_ultima_compra !== null && row.dias_ultima_compra !== undefined
                ? `- Ultima compra: hace ${row.dias_ultima_compra} dias`
                : '- Ultima compra: Sin fecha registrada',
            row.cadencia_prom_dias !== null && row.cadencia_prom_dias !== undefined
                ? `- Cadencia promedio: cada ${row.cadencia_prom_dias} dias`
                : '- Cadencia promedio: Sin datos',
            `- Rango de compras: ${text(row.rango_compras) || 'Sin rango'}`
        ];
        return { summary: lines.join('\n'), customerId: text(row.customer_id) || null };
    } catch (error) {
        return { summary: 'CLIENTE: Prospecto nuevo (no registrado en BD)', customerId: null };
    }
}

async function getCustomerLabelsContext(tenantId, customerId) {
    if (!customerId) return '';
    try {
        const { rows } = await pgQuery(
            `SELECT COALESCE(gl.name, tzr.name, tcl.label_id) AS label_name,
                    COALESCE(tzr.name, '') AS zone_name,
                    tcl.source,
                    tcl.created_at
               FROM tenant_customer_labels tcl
          LEFT JOIN global_labels gl ON gl.id = tcl.label_id
          LEFT JOIN tenant_zone_rules tzr ON tzr.rule_id = tcl.label_id
              WHERE tcl.tenant_id = $1
                AND tcl.customer_id = $2
              ORDER BY tcl.created_at DESC NULLS LAST
              LIMIT 20`,
            [tenantId, customerId]
        );
        if (!rows.length) return '';
        const lifecycleNames = new Set(['PROSPECTO', 'CLIENTE NUEVO', 'CLIENTE RECURRENTE']);
        const labels = [];
        let zone = '';
        rows.forEach((row) => {
            const label = text(row.label_name);
            if (!label) return;
            if (lifecycleNames.has(label.toUpperCase())) labels.push(label.toUpperCase());
            if (!zone && text(row.zone_name)) zone = text(row.zone_name);
        });
        const lines = [];
        if (labels.length) lines.push(`ETIQUETAS: ${Array.from(new Set(labels)).join(' / ')}`);
        if (zone) lines.push(`ZONA ASIGNADA: ${zone}`);
        return lines.join('\n');
    } catch (error) {
        return '';
    }
}

async function getCommercialStatusContext(tenantId, moduleId, chatId) {
    try {
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
        return `ESTADO COMERCIAL: ${text(rows?.[0]?.status) || 'sin_estado'}`;
    } catch (error) {
        return '';
    }
}

async function getOriginContext(tenantId, moduleId, chatId) {
    const cleanChatId = normalizeChatId(chatId);
    const phoneE164 = firstPhoneE164FromChatId(chatId);
    try {
        const { rows } = await pgQuery(
            `SELECT metadata
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND from_me = FALSE
                AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
              ORDER BY created_at ASC
              LIMIT 1`,
            [tenantId, cleanChatId, lower(moduleId)]
        );
        const metadata = safeJsonObject(rows?.[0]?.metadata);
        const referral = safeJsonObject(metadata.referral || metadata.rawReferral || metadata.raw_referral);
        const ctwaClid = text(metadata.ctwaClid || metadata.ctwa_clid || referral.ctwaClid || referral.ctwa_clid);
        if (Object.keys(referral).length || ctwaClid) {
            return [
                'ORIGEN: Anuncio Meta',
                `- Titulo del anuncio: ${text(referral.headline || referral.title) || 'Sin titulo registrado'}`,
                `- Texto: ${text(referral.body || referral.description) || 'Sin texto registrado'}`
            ].join('\n');
        }
    } catch (error) {
        // Omit referral origin and continue with campaign/direct fallbacks.
    }

    try {
        const phones = phoneCandidatesFromChatId(chatId);
        const { rows } = await pgQuery(
            `SELECT c.campaign_name, c.template_name
               FROM tenant_campaign_recipients r
          LEFT JOIN tenant_campaigns c
                 ON c.tenant_id = r.tenant_id
                AND c.campaign_id = r.campaign_id
              WHERE r.tenant_id = $1
                AND r.phone = ANY($2::text[])
                AND r.sent_at >= NOW() - INTERVAL '7 days'
                AND (r.module_id IS NULL OR r.module_id = '' OR LOWER(r.module_id) = LOWER($3))
              ORDER BY r.sent_at DESC NULLS LAST
              LIMIT 1`,
            [tenantId, phones.length ? phones : [phoneE164].filter(Boolean), lower(moduleId)]
        );
        const row = rows?.[0];
        if (row) {
            return [
                `ORIGEN: Respuesta a campaña "${text(row.campaign_name) || 'Campaña sin nombre'}"`,
                `Template enviado: ${text(row.template_name) || 'Sin template registrado'}`
            ].join('\n');
        }
    } catch (error) {
        // Omit campaign origin and continue with direct fallback.
    }

    return 'ORIGEN: Contacto directo';
}

async function getConversationContext(tenantId, moduleId, chatId) {
    const { rows } = await pgQuery(
        `SELECT message_id, from_me, body, message_type, order_payload, created_at
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
        const messageId = text(row.message_id);
        const body = text(row.body) || (lower(row.message_type) === 'order' ? '[Pedido catalogo]' : `[${text(row.message_type) || 'mensaje'}]`);
        const time = row.created_at ? new Date(row.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '';
        return `[${who}${messageId ? ` id=${messageId}` : ''}]: ${body}${time ? ` (${time})` : ''}`;
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
    try {
        const { rows } = await pgQuery(
            `SELECT quote_id, status, items_json, summary_json, sent_at
               FROM tenant_quotes
              WHERE tenant_id = $1
                AND chat_id = $2
                AND status IN ('sent', 'draft')
                AND (scope_module_id IS NULL OR scope_module_id = '' OR LOWER(scope_module_id) = LOWER($3))
              ORDER BY sent_at DESC NULLS LAST, updated_at DESC NULLS LAST
              LIMIT 1`,
            [tenantId, normalizeChatId(chatId), lower(moduleId)]
        );
        const row = rows?.[0];
        if (!row) return '';
        const items = Array.isArray(row.items_json) ? row.items_json : [];
        const summary = safeJsonObject(row.summary_json);
        const products = items
            .map((item) => text(item.title || item.name || item.productName || item.sku))
            .filter(Boolean)
            .join(', ');
        const total = money(summary.totalPayable ?? summary.total_payable ?? summary.total);
        return [
            'COTIZACION ACTIVA:',
            `- ID: ${text(row.quote_id)}`,
            `- Estado: ${text(row.status) || 'sin_estado'}`,
            `- Total: S/ ${formatMoney(total)}`,
            `- Productos: ${products || 'Sin productos legibles'}`,
            `- Enviada: ${text(row.sent_at) || 'No enviada aun'}`
        ].join('\n');
    } catch (error) {
        return '';
    }
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
        'DATOS DEL CLIENTE:',
        customer.summary,
        labels ? `\n${labels}` : '',
        commercialStatus ? `\n${commercialStatus}` : '',
        quote ? `\n${quote}` : '',
        '',
        'ORIGEN DEL CONTACTO:',
        origin,
        '',
        'CONVERSACION RECIENTE:',
        lineList(conversation.lines),
        recentOrder ? `\n${recentOrder}` : '',
        '',
        'INSTRUCCIONES:',
        '- Devuelve exclusivamente JSON valido, sin markdown, sin texto adicional.',
        '- Formato obligatorio: {"messages":[{"text":"texto del mensaje","quotedMessageId":"message_id inbound relevante o null"}]}.',
        '- Si el cliente envio multiples mensajes sobre temas distintos, responde cada tema en un mensaje separado.',
        '- Cada mensaje debe tener maximo 3 lineas.',
        '- quotedMessageId debe ser el message_id del mensaje CLIENTE mas relevante para esa respuesta.',
        '- Si solo hay un tema, usa un array con un solo mensaje. Maximo 3 mensajes por respuesta.',
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
    const rawSuggestion = await getChatSuggestion(
        context.system,
        [
            `Ultimo mensaje del cliente: ${context.lastCustomerMessage}`,
            '',
            'Responde con JSON valido exactamente en este formato:',
            '{"messages":[{"text":"texto listo para enviar por WhatsApp","quotedMessageId":"message_id inbound relevante o null"}]}'
        ].join('\n'),
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
    const messages = normalizePattyMessages(rawSuggestion);
    const suggestion = messages.map((item) => item.text).join('\n\n');
    console.log('[Patty] suggestion generated', {
        tenantId: context.tenantId,
        moduleId: context.moduleId,
        chatId: context.chatId,
        suggestionChars: text(suggestion).length,
        messageCount: messages.length,
        isAiError: text(rawSuggestion).startsWith('Error IA:') || lower(rawSuggestion).includes('ia no configurada')
    });
    return { ...context, suggestion, messages, rawSuggestion };
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
            suggestionChars: text(payload?.suggestion).length,
            messageCount: Array.isArray(payload?.messages) ? payload.messages.length : 0
        });
        return;
    }
    if (socketEmitter?.to && typeof socketEmitter.to === 'function') {
        socketEmitter.to(tenantId).emit('patty_suggestion', payload);
        console.log('[Patty] emitted suggestion via socket room', {
            tenantId,
            chatId: payload?.chatId,
            moduleId: payload?.moduleId,
            suggestionChars: text(payload?.suggestion).length,
            messageCount: Array.isArray(payload?.messages) ? payload.messages.length : 0
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
            const messages = Array.isArray(result.messages) && result.messages.length
                ? result.messages
                : normalizePattyMessages(result.suggestion);
            if (!messages.length) {
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
                    messages,
                    assistantName,
                    timestamp: Date.now()
                });
                return;
            }
            console.log('[Patty] sending autonomous message', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                suggestionChars: text(result.suggestion).length,
                messageCount: messages.length
            });
            for (let index = 0; index < messages.length; index += 1) {
                const msg = messages[index];
                await waClient.sendMessage(cleanChatId, msg.text, {
                    quotedMessageId: msg.quotedMessageId || null,
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
                if (index < messages.length - 1) await sleep(1500);
            }
            console.log('[Patty] autonomous message sent', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                messageCount: messages.length
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
