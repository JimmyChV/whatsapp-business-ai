const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
const { parseScopedChatId } = require('../../channels/helpers/chat-scope.helpers');

const CATALOG = Object.freeze([
    {
        id: 'cliente',
        label: 'Cliente',
        variables: [
            {
                key: 'nombre_cliente',
                label: 'Nombre del cliente',
                description: 'Nombre visible del cliente para saludo.',
                placeholderIndex: 1,
                exampleValue: 'Maria Perez',
                source: 'tenant_customers.contact_name || tenant_customers.profile.firstNames',
                requiresContext: ['customerId'],
                supportedIn: ['header', 'body', 'button']
            },
            {
                key: 'telefono_cliente',
                label: 'Telefono del cliente',
                description: 'Telefono principal en formato E.164.',
                placeholderIndex: 2,
                exampleValue: '+51941443776',
                source: 'tenant_customers.phone_e164',
                requiresContext: ['customerId'],
                supportedIn: ['body', 'button']
            },
            {
                key: 'email_cliente',
                label: 'Email del cliente',
                description: 'Email principal del cliente.',
                placeholderIndex: 3,
                exampleValue: 'cliente@correo.com',
                source: 'tenant_customers.email',
                requiresContext: ['customerId'],
                supportedIn: ['body']
            },
            {
                key: 'idioma_preferido_cliente',
                label: 'Idioma preferido',
                description: 'Idioma preferido para campanas/templates.',
                placeholderIndex: 4,
                exampleValue: 'es',
                source: 'tenant_customers.preferred_language',
                requiresContext: ['customerId'],
                supportedIn: ['body']
            },
            {
                key: 'tags_cliente_csv',
                label: 'Etiquetas del cliente',
                description: 'Etiquetas del cliente separadas por coma.',
                placeholderIndex: 5,
                exampleValue: 'cliente recurrente,premium',
                source: 'tenant_customers.tags[]',
                requiresContext: ['customerId'],
                supportedIn: ['body']
            },
            {
                key: 'customer_id',
                label: 'ID de cliente',
                description: 'Identificador interno del cliente.',
                placeholderIndex: 6,
                exampleValue: 'CUS-8K2M4P',
                source: 'tenant_customers.customer_id',
                requiresContext: ['customerId'],
                supportedIn: ['body']
            }
        ]
    },
    {
        id: 'agente',
        label: 'Agente',
        variables: [
            {
                key: 'nombre_agente',
                label: 'Nombre del agente asignado',
                description: 'Nombre del usuario asignado al chat.',
                placeholderIndex: 7,
                exampleValue: 'Owner Lavitat',
                source: 'tenant_chat_assignments.assignee_user_id -> users.name',
                requiresContext: ['chatId'],
                supportedIn: ['body', 'button']
            },
            {
                key: 'rol_agente',
                label: 'Rol del agente',
                description: 'Rol del agente asignado.',
                placeholderIndex: 8,
                exampleValue: 'seller',
                source: 'tenant_chat_assignments.assignee_role',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'agente_user_id',
                label: 'ID del agente',
                description: 'Identificador del usuario asignado.',
                placeholderIndex: 9,
                exampleValue: 'usr_123',
                source: 'tenant_chat_assignments.assignee_user_id',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'modulo_chat_id',
                label: 'Modulo del chat',
                description: 'ID del modulo/canal del chat.',
                placeholderIndex: 10,
                exampleValue: 'MOD-4Q8K5C',
                source: 'tenant_chat_assignments.scope_module_id || tenant_chats.metadata.scopeModuleId',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            }
        ]
    },
    {
        id: 'comercial',
        label: 'Comercial',
        variables: [
            {
                key: 'estado_comercial_chat',
                label: 'Estado comercial',
                description: 'Estado comercial actual del chat.',
                placeholderIndex: 11,
                exampleValue: 'cotizado',
                source: 'tenant_chat_commercial_status.status',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'estado_asignacion_chat',
                label: 'Estado de asignacion',
                description: 'Estado operativo de asignacion del chat.',
                placeholderIndex: 12,
                exampleValue: 'active',
                source: 'tenant_chat_assignments.status',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'primera_respuesta_agente_at',
                label: 'Primera respuesta del agente',
                description: 'Fecha/hora de primera respuesta del agente.',
                placeholderIndex: 13,
                exampleValue: '2026-04-02T15:12:00.000Z',
                source: 'tenant_chat_commercial_status.first_agent_response_at',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'vendido_at',
                label: 'Fecha de venta',
                description: 'Fecha/hora en que se marco como vendido.',
                placeholderIndex: 14,
                exampleValue: '2026-04-03T10:22:00.000Z',
                source: 'tenant_chat_commercial_status.sold_at',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            }
        ]
    },
    {
        id: 'cotizacion',
        label: 'Cotizacion',
        variables: [
            {
                key: 'ultima_cotizacion_id',
                label: 'ID de ultima cotizacion',
                description: 'ID de la ultima cotizacion enviada en el chat.',
                placeholderIndex: 15,
                exampleValue: 'quote_mnb9jysp_tg3fiy',
                source: 'tenant_quotes.quote_id (latest by sent_at/created_at)',
                requiresContext: ['chatId'],
                supportedIn: ['body', 'button']
            },
            {
                key: 'ultima_cotizacion_moneda',
                label: 'Moneda de ultima cotizacion',
                description: 'Codigo de moneda de la ultima cotizacion.',
                placeholderIndex: 16,
                exampleValue: 'PEN',
                source: 'tenant_quotes.currency (latest)',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'ultima_cotizacion_subtotal',
                label: 'Subtotal de ultima cotizacion',
                description: 'Subtotal de la ultima cotizacion.',
                placeholderIndex: 17,
                exampleValue: '224.3',
                source: 'tenant_quotes.summary_json.subtotal (latest)',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'ultima_cotizacion_descuento',
                label: 'Descuento de ultima cotizacion',
                description: 'Descuento total aplicado en la ultima cotizacion.',
                placeholderIndex: 18,
                exampleValue: '38.1',
                source: 'tenant_quotes.summary_json.discount (latest)',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'ultima_cotizacion_total',
                label: 'Total de ultima cotizacion',
                description: 'Total final de la ultima cotizacion.',
                placeholderIndex: 19,
                exampleValue: '186.2',
                source: 'tenant_quotes.summary_json.totalPayable (latest)',
                requiresContext: ['chatId'],
                supportedIn: ['header', 'body', 'button']
            },
            {
                key: 'ultima_cotizacion_items_count',
                label: 'Cantidad de items cotizados',
                description: 'Numero de items de la ultima cotizacion.',
                placeholderIndex: 20,
                exampleValue: '3',
                source: 'tenant_quotes.summary_json.itemCount (latest)',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            }
        ]
    },
    {
        id: 'origen',
        label: 'Origen',
        variables: [
            {
                key: 'origen_chat_tipo',
                label: 'Origen del chat',
                description: 'Origen detectado del chat.',
                placeholderIndex: 21,
                exampleValue: 'meta_ad',
                source: 'tenant_chat_origins.origin_type',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'origen_campana_id',
                label: 'ID de campana',
                description: 'ID de campana asociada al origen.',
                placeholderIndex: 22,
                exampleValue: 'camp_abril_2026_01',
                source: 'tenant_chat_origins.campaign_id',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'origen_referral_headline',
                label: 'Titular referral',
                description: 'Titular del anuncio/referral en Meta.',
                placeholderIndex: 23,
                exampleValue: 'Limpieza profunda Lavitat',
                source: 'tenant_chat_origins.referral_headline',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            },
            {
                key: 'origen_referral_source_url',
                label: 'URL del referral',
                description: 'URL de origen/reportada por referral.',
                placeholderIndex: 24,
                exampleValue: 'https://www.facebook.com/ads/...',
                source: 'tenant_chat_origins.referral_source_url',
                requiresContext: ['chatId'],
                supportedIn: ['body', 'button']
            },
            {
                key: 'origen_ctwa_clid',
                label: 'CTWA CLID',
                description: 'Identificador CTWA del click-to-WhatsApp.',
                placeholderIndex: 25,
                exampleValue: 'AQFhY2QxMjM0...',
                source: 'tenant_chat_origins.ctwa_clid',
                requiresContext: ['chatId'],
                supportedIn: ['body']
            }
        ]
    }
]);

function nowIso() {
    return new Date().toISOString();
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function asObject(value = null) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneCatalog() {
    return JSON.parse(JSON.stringify(CATALOG));
}

function normalizeChatContext(chatId = '') {
    const rawChatId = toText(chatId);
    const scoped = parseScopedChatId(rawChatId);
    const baseChatId = toText(scoped.chatId || rawChatId);
    const scopeModuleId = toLower(scoped.moduleId || '');
    return { rawChatId, baseChatId, scopeModuleId };
}

function extractDigitsFromChatId(chatId = '') {
    const source = toText(chatId);
    if (!source) return '';
    const userPart = source.includes('@') ? source.split('@')[0] : source;
    const digits = String(userPart || '').replace(/\D/g, '');
    return digits.length >= 8 ? digits : '';
}

function normalizePreviewValue(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.map((entry) => toText(entry)).filter(Boolean).join(',');
    if (typeof value === 'object') return JSON.stringify(value);
    const text = String(value);
    return text.trim() ? text : null;
}

async function queryUserDisplayName(userId = '') {
    const cleanUserId = toText(userId);
    if (!cleanUserId || getStorageDriver() !== 'postgres') return null;
    try {
        const result = await queryPostgres(
            `SELECT user_id, name, email
               FROM users
              WHERE user_id = $1
              LIMIT 1`,
            [cleanUserId]
        );
        const row = Array.isArray(result?.rows) ? result.rows[0] : null;
        if (!row) return null;
        return toText(row.name || row.email || row.user_id) || null;
    } catch (_) {
        return null;
    }
}

async function loadCustomerPostgres(tenantId = DEFAULT_TENANT_ID, { customerId = '', chatContext = null } = {}) {
    const cleanCustomerId = toText(customerId);
    const chat = chatContext || normalizeChatContext('');

    const readByCustomerId = async () => {
        if (!cleanCustomerId) return null;
        const result = await queryPostgres(
            `SELECT customer_id, contact_name, phone_e164, email, tags, profile, metadata,
                    preferred_language, marketing_opt_in_status
               FROM tenant_customers
              WHERE tenant_id = $1
                AND customer_id = $2
              LIMIT 1`,
            [tenantId, cleanCustomerId]
        );
        return Array.isArray(result?.rows) ? result.rows[0] : null;
    };

    const readByPhoneFromChat = async () => {
        const digits = extractDigitsFromChatId(chat.baseChatId || chat.rawChatId);
        if (!digits) return null;
        const result = await queryPostgres(
            `SELECT customer_id, contact_name, phone_e164, email, tags, profile, metadata,
                    preferred_language, marketing_opt_in_status
               FROM tenant_customers
              WHERE tenant_id = $1
                AND phone_e164 IS NOT NULL
                AND regexp_replace(phone_e164, '\\D', '', 'g') LIKE $2
              ORDER BY updated_at DESC
              LIMIT 1`,
            [tenantId, `%${digits}`]
        );
        return Array.isArray(result?.rows) ? result.rows[0] : null;
    };

    try {
        const byId = await readByCustomerId();
        if (byId) return byId;
        return await readByPhoneFromChat();
    } catch (_) {
        try {
            const result = cleanCustomerId
                ? await queryPostgres(
                    `SELECT customer_id, contact_name, phone_e164, email, tags, profile, metadata
                       FROM tenant_customers
                      WHERE tenant_id = $1
                        AND customer_id = $2
                      LIMIT 1`,
                    [tenantId, cleanCustomerId]
                )
                : null;
            const row = Array.isArray(result?.rows) ? result.rows[0] : null;
            return row || null;
        } catch (_) {
            return null;
        }
    }
}

function findByChatAndScope(items = [], chatId = '', scopeModuleId = '') {
    const cleanChatId = toText(chatId);
    const cleanScope = toLower(scopeModuleId);
    const source = Array.isArray(items) ? items : [];
    return source.find((entry) =>
        toText(entry?.chatId || entry?.chat_id) === cleanChatId
        && toLower(entry?.scopeModuleId || entry?.scope_module_id) === cleanScope
    ) || null;
}

async function loadPreviewContextFromFile(tenantId = DEFAULT_TENANT_ID, { chatId = '', customerId = '' } = {}) {
    const chat = normalizeChatContext(chatId);
    const customersStore = await readTenantJsonFile('customers.json', { tenantId, defaultValue: { items: [] } });
    const conversationStore = await readTenantJsonFile('conversation_ops.json', { tenantId, defaultValue: {} });
    const commercialStore = await readTenantJsonFile('chat_commercial_status.json', { tenantId, defaultValue: {} });
    const quotesStore = await readTenantJsonFile('quotes.json', { tenantId, defaultValue: {} });
    const originsStore = await readTenantJsonFile('chat_origins.json', { tenantId, defaultValue: {} });

    const customers = Array.isArray(customersStore?.items) ? customersStore.items : [];
    const customer = customers.find((entry) => toText(entry?.customerId) === toText(customerId)) || null;

    const assignments = Array.isArray(conversationStore?.assignments) ? conversationStore.assignments : [];
    const assignment = findByChatAndScope(assignments, chat.baseChatId, chat.scopeModuleId)
        || findByChatAndScope(assignments, chat.baseChatId, '')
        || findByChatAndScope(assignments, chat.rawChatId, chat.scopeModuleId)
        || null;

    const statuses = Array.isArray(commercialStore?.items) ? commercialStore.items : [];
    const commercial = findByChatAndScope(statuses, chat.baseChatId, chat.scopeModuleId)
        || findByChatAndScope(statuses, chat.baseChatId, '')
        || null;

    const quotes = Array.isArray(quotesStore?.items) ? quotesStore.items : [];
    const quoteCandidates = quotes
        .filter((entry) => toText(entry?.chatId) === chat.baseChatId || toText(entry?.chatId) === chat.rawChatId)
        .sort((a, b) => String(b?.sentAt || b?.createdAt || '').localeCompare(String(a?.sentAt || a?.createdAt || '')));
    const quote = quoteCandidates[0] || null;

    const origins = Array.isArray(originsStore?.items) ? originsStore.items : [];
    const origin = findByChatAndScope(origins, chat.baseChatId, chat.scopeModuleId)
        || findByChatAndScope(origins, chat.baseChatId, '')
        || null;

    return {
        chat,
        customer: customer ? {
            customerId: toText(customer.customerId),
            contactName: toText(customer.contactName || customer.contact_name) || null,
            phoneE164: toText(customer.phoneE164 || customer.phone_e164) || null,
            email: toText(customer.email) || null,
            tags: Array.isArray(customer.tags) ? customer.tags : [],
            profile: asObject(customer.profile),
            preferredLanguage: toText(customer.preferredLanguage || customer.preferred_language || asObject(customer.metadata).preferredLanguage) || null
        } : null,
        assignment: assignment ? {
            assigneeUserId: toText(assignment.assigneeUserId || assignment.assignee_user_id) || null,
            assigneeRole: toLower(assignment.assigneeRole || assignment.assignee_role) || null,
            status: toLower(assignment.status) || null,
            scopeModuleId: toLower(assignment.scopeModuleId || assignment.scope_module_id) || null,
            assigneeName: null
        } : null,
        commercial: commercial ? {
            status: toLower(commercial.status) || null,
            firstAgentResponseAt: toText(commercial.firstAgentResponseAt || commercial.first_agent_response_at) || null,
            soldAt: toText(commercial.soldAt || commercial.sold_at) || null
        } : null,
        quote: quote ? {
            quoteId: toText(quote.quoteId || quote.quote_id) || null,
            currency: toText(quote.currency) || null,
            summary: asObject(quote.summaryJson || quote.summary_json)
        } : null,
        origin: origin ? {
            originType: toLower(origin.originType || origin.origin_type) || null,
            campaignId: toText(origin.campaignId || origin.campaign_id) || null,
            referralHeadline: toText(origin.referralHeadline || origin.referral_headline) || null,
            referralSourceUrl: toText(origin.referralSourceUrl || origin.referral_source_url) || null,
            ctwaClid: toText(origin.ctwaClid || origin.ctwa_clid) || null
        } : null,
        chatMetadataScopeModuleId: null
    };
}

async function loadPreviewContextFromPostgres(tenantId = DEFAULT_TENANT_ID, { chatId = '', customerId = '' } = {}) {
    const chat = normalizeChatContext(chatId);
    const candidateChatIds = [chat.baseChatId, chat.rawChatId].filter(Boolean);
    const cleanScope = toLower(chat.scopeModuleId);

    const customerRow = await loadCustomerPostgres(tenantId, { customerId, chatContext: chat });
    const customer = customerRow ? {
        customerId: toText(customerRow.customer_id || customerRow.customerId),
        contactName: toText(customerRow.contact_name || customerRow.contactName) || null,
        phoneE164: toText(customerRow.phone_e164 || customerRow.phoneE164) || null,
        email: toText(customerRow.email) || null,
        tags: Array.isArray(customerRow.tags) ? customerRow.tags : [],
        profile: asObject(customerRow.profile),
        preferredLanguage: toText(customerRow.preferred_language || customerRow.preferredLanguage) || null
    } : null;

    const loadAssignment = async () => {
        for (const candidate of candidateChatIds) {
            if (!candidate) continue;
            const result = await queryPostgres(
                `SELECT assignee_user_id, assignee_role, status, scope_module_id
                   FROM tenant_chat_assignments
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND (scope_module_id = $3 OR scope_module_id = '')
                  ORDER BY CASE WHEN scope_module_id = $3 THEN 0 ELSE 1 END, updated_at DESC
                  LIMIT 1`,
                [tenantId, candidate, cleanScope]
            );
            const row = Array.isArray(result?.rows) ? result.rows[0] : null;
            if (!row) continue;
            const assigneeUserId = toText(row.assignee_user_id);
            return {
                assigneeUserId: assigneeUserId || null,
                assigneeRole: toLower(row.assignee_role) || null,
                status: toLower(row.status) || null,
                scopeModuleId: toLower(row.scope_module_id) || null,
                assigneeName: assigneeUserId ? await queryUserDisplayName(assigneeUserId) : null
            };
        }
        return null;
    };

    const loadCommercial = async () => {
        for (const candidate of candidateChatIds) {
            if (!candidate) continue;
            const result = await queryPostgres(
                `SELECT status, first_agent_response_at, sold_at
                   FROM tenant_chat_commercial_status
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND (scope_module_id = $3 OR scope_module_id = '')
                  ORDER BY CASE WHEN scope_module_id = $3 THEN 0 ELSE 1 END, updated_at DESC
                  LIMIT 1`,
                [tenantId, candidate, cleanScope]
            );
            const row = Array.isArray(result?.rows) ? result.rows[0] : null;
            if (!row) continue;
            return {
                status: toLower(row.status) || null,
                firstAgentResponseAt: row.first_agent_response_at ? new Date(row.first_agent_response_at).toISOString() : null,
                soldAt: row.sold_at ? new Date(row.sold_at).toISOString() : null
            };
        }
        return null;
    };

    const loadLatestQuote = async () => {
        for (const candidate of candidateChatIds) {
            if (!candidate) continue;
            const result = await queryPostgres(
                `SELECT quote_id, currency, summary_json
                   FROM tenant_quotes
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND (scope_module_id = $3 OR scope_module_id = '')
                  ORDER BY CASE WHEN scope_module_id = $3 THEN 0 ELSE 1 END,
                           COALESCE(sent_at, created_at) DESC
                  LIMIT 1`,
                [tenantId, candidate, cleanScope]
            );
            const row = Array.isArray(result?.rows) ? result.rows[0] : null;
            if (!row) continue;
            return {
                quoteId: toText(row.quote_id) || null,
                currency: toText(row.currency) || null,
                summary: asObject(row.summary_json)
            };
        }
        return null;
    };

    const loadOrigin = async () => {
        for (const candidate of candidateChatIds) {
            if (!candidate) continue;
            const result = await queryPostgres(
                `SELECT origin_type, campaign_id, referral_headline, referral_source_url, ctwa_clid
                   FROM tenant_chat_origins
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND (scope_module_id = $3 OR scope_module_id = '')
                  ORDER BY CASE WHEN scope_module_id = $3 THEN 0 ELSE 1 END, detected_at DESC
                  LIMIT 1`,
                [tenantId, candidate, cleanScope]
            );
            const row = Array.isArray(result?.rows) ? result.rows[0] : null;
            if (!row) continue;
            return {
                originType: toLower(row.origin_type) || null,
                campaignId: toText(row.campaign_id) || null,
                referralHeadline: toText(row.referral_headline) || null,
                referralSourceUrl: toText(row.referral_source_url) || null,
                ctwaClid: toText(row.ctwa_clid) || null
            };
        }
        return null;
    };

    const loadChatMetadataScope = async () => {
        for (const candidate of candidateChatIds) {
            if (!candidate) continue;
            const result = await queryPostgres(
                `SELECT metadata
                   FROM tenant_chats
                  WHERE tenant_id = $1
                    AND chat_id = $2
                  LIMIT 1`,
                [tenantId, candidate]
            );
            const row = Array.isArray(result?.rows) ? result.rows[0] : null;
            if (!row) continue;
            const metadata = asObject(row.metadata);
            const scopeFromMeta = toLower(metadata.scopeModuleId || metadata.moduleId || '');
            if (scopeFromMeta) return scopeFromMeta;
        }
        return null;
    };

    const [assignment, commercial, quote, origin, chatMetadataScopeModuleId] = await Promise.all([
        loadAssignment(),
        loadCommercial(),
        loadLatestQuote(),
        loadOrigin(),
        loadChatMetadataScope()
    ]);

    return { chat, customer, assignment, commercial, quote, origin, chatMetadataScopeModuleId };
}

async function loadPreviewContext(tenantId = DEFAULT_TENANT_ID, options = {}) {
    if (getStorageDriver() !== 'postgres') {
        return loadPreviewContextFromFile(tenantId, options);
    }
    return loadPreviewContextFromPostgres(tenantId, options);
}

function buildValueMap(context = {}) {
    const customer = context.customer || null;
    const assignment = context.assignment || null;
    const commercial = context.commercial || null;
    const quote = context.quote || null;
    const origin = context.origin || null;
    const quoteSummary = asObject(quote?.summary);

    return {
        nombre_cliente: customer?.contactName || toText(customer?.profile?.firstNames) || null,
        telefono_cliente: customer?.phoneE164 || null,
        email_cliente: customer?.email || null,
        idioma_preferido_cliente: customer?.preferredLanguage || null,
        tags_cliente_csv: Array.isArray(customer?.tags) ? customer.tags.join(',') : null,
        customer_id: customer?.customerId || null,

        nombre_agente: assignment?.assigneeName || assignment?.assigneeUserId || null,
        rol_agente: assignment?.assigneeRole || null,
        agente_user_id: assignment?.assigneeUserId || null,
        modulo_chat_id: assignment?.scopeModuleId || context.chatMetadataScopeModuleId || context.chat?.scopeModuleId || null,

        estado_comercial_chat: commercial?.status || null,
        estado_asignacion_chat: assignment?.status || null,
        primera_respuesta_agente_at: commercial?.firstAgentResponseAt || null,
        vendido_at: commercial?.soldAt || null,

        ultima_cotizacion_id: quote?.quoteId || null,
        ultima_cotizacion_moneda: quote?.currency || null,
        ultima_cotizacion_subtotal: quoteSummary.subtotal ?? null,
        ultima_cotizacion_descuento: quoteSummary.discount ?? null,
        ultima_cotizacion_total: quoteSummary.totalPayable ?? null,
        ultima_cotizacion_items_count: quoteSummary.itemCount ?? null,

        origen_chat_tipo: origin?.originType || null,
        origen_campana_id: origin?.campaignId || null,
        origen_referral_headline: origin?.referralHeadline || null,
        origen_referral_source_url: origin?.referralSourceUrl || null,
        origen_ctwa_clid: origin?.ctwaClid || null
    };
}

async function getCatalog(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    return {
        tenantId: cleanTenantId,
        generatedAt: nowIso(),
        placeholderFormat: '{{N}}',
        categories: cloneCatalog()
    };
}

async function getPreview(tenantId = DEFAULT_TENANT_ID, { chatId = '', customerId = '' } = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const context = await loadPreviewContext(cleanTenantId, { chatId, customerId });
    const valueMap = buildValueMap(context);
    const categories = cloneCatalog().map((category) => ({
        ...category,
        variables: Array.isArray(category.variables)
            ? category.variables.map((variable) => {
                const previewValue = normalizePreviewValue(valueMap[variable.key]);
                return {
                    ...variable,
                    previewValue,
                    resolved: previewValue !== null && previewValue !== undefined && String(previewValue).trim() !== ''
                };
            })
            : []
    }));

    return {
        tenantId: cleanTenantId,
        chatId: toText(context?.chat?.rawChatId || chatId) || null,
        customerId: toText(context?.customer?.customerId || customerId) || null,
        generatedAt: nowIso(),
        placeholderFormat: '{{N}}',
        categories
    };
}

module.exports = {
    getCatalog,
    getPreview
};

