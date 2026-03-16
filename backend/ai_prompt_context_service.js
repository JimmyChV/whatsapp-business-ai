const tenantService = require('./tenant_service');
const tenantSettingsService = require('./tenant_settings_service');
const tenantIntegrationsService = require('./tenant_integrations_service');
const tenantCatalogService = require('./tenant_catalog_service');
const messageHistoryService = require('./message_history_service');
const customerService = require('./customer_service');
const { loadCatalog } = require('./catalog_manager');

const MAX_CATALOG_PRODUCTS = 70;
const MAX_CHAT_MESSAGES = 18;
const MAX_TEXT_LEN = 380;

function toText(value = '') {
    return String(value || '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeCatalogId(value = '') {
    const clean = toText(value).toUpperCase();
    return /^CAT-[A-Z0-9]{4,}$/.test(clean) ? clean : '';
}

function normalizeAssistantId(value = '') {
    const clean = toText(value).toUpperCase();
    return /^AIA-[A-Z0-9]{6}$/.test(clean) ? clean : '';
}

function normalizeModuleId(value = '') {
    return toLower(value);
}

function normalizeScopedChatId(value = '') {
    const raw = toText(value);
    if (!raw) return '';
    const marker = '::mod::';
    const idx = raw.lastIndexOf(marker);
    if (idx < 0) return raw;
    return toText(raw.slice(0, idx));
}

function normalizePhone(value = '') {
    const digits = String(value || '').replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 15) return '';
    return '+' + digits;
}

function clipText(value = '', maxLen = MAX_TEXT_LEN) {
    const text = String(value || '');
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

function toBoolFromAny(value, fallback = null) {
    if (value === true || value === false) return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const lower = value.trim().toLowerCase();
        if (['true', 'yes', 'si', 'on'].includes(lower)) return true;
        if (['false', 'no', 'off'].includes(lower)) return false;
    }
    return fallback;
}

function normalizeCategoryList(item = {}) {
    const out = new Set();
    const source = item && typeof item === 'object' ? item : {};
    const categories = source.categories;
    if (Array.isArray(categories)) {
        categories.forEach((entry) => {
            const clean = toText(typeof entry === 'string' ? entry : (entry?.name || entry?.slug || entry?.label || entry?.title || ''));
            if (clean) out.add(clean);
        });
    } else if (typeof categories === 'string') {
        categories.split(',').forEach((entry) => {
            const clean = toText(entry);
            if (clean) out.add(clean);
        });
    }
    ['category', 'categoryName', 'category_slug', 'categorySlug'].forEach((key) => {
        const clean = toText(source[key]);
        if (clean) out.add(clean);
    });
    return Array.from(out);
}

function normalizeCatalogProduct(item = {}, fallbackCatalog = null) {
    const source = item && typeof item === 'object' ? item : {};
    const metadata = source?.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? source.metadata
        : {};
    const title = toText(source.title || source.name || metadata.title || metadata.name);
    if (!title) return null;

    const catalogId = normalizeCatalogId(source.catalogId || source.catalog_id || metadata.catalogId || metadata.catalog_id || fallbackCatalog?.catalogId || '');
    const categories = normalizeCategoryList({
        ...metadata,
        ...source,
        categories: source.categories || metadata.categories || source.category || metadata.category || null
    });
    const discountPct = toNumber(source.discountPct || source.discount_pct || metadata.discountPct || metadata.discount_pct, 0);
    const presentation = toText(source.presentation || source.presentacion || metadata.presentation || metadata.presentacion || metadata.size || metadata.capacity || metadata.variant || '');
    const aroma = toText(source.aroma || source.scent || metadata.aroma || metadata.scent || metadata.fragrance || '');
    const hypoallergenic = toBoolFromAny(source.hypoallergenic ?? metadata.hypoallergenic, null);
    const petFriendly = toBoolFromAny(source.petFriendly ?? source.pet_friendly ?? metadata.petFriendly ?? metadata.pet_friendly, null);
    const isActive = !(source.isActive === false || source.active === false || metadata.isActive === false || metadata.active === false);

    return {
        id: toText(source.id || source.product_id || source.sku || title).slice(0, 80),
        catalogId: catalogId || null,
        catalogName: toText(source.catalogName || source.catalog_name || metadata.catalogName || metadata.catalog_name || fallbackCatalog?.name || '') || null,
        sourceType: toLower(source.source || metadata.source || fallbackCatalog?.sourceType || 'local') || 'local',
        title,
        price: toText(source.price || source.amount || metadata.price || ''),
        regularPrice: toText(source.regularPrice || source.regular_price || metadata.regularPrice || metadata.regular_price || ''),
        salePrice: toText(source.salePrice || source.sale_price || metadata.salePrice || metadata.sale_price || ''),
        description: clipText(source.description || metadata.description || '', 220),
        category: categories[0] || null,
        categories,
        presentation: presentation || null,
        aroma: aroma || null,
        hypoallergenic,
        petFriendly,
        sku: toText(source.sku || metadata.sku || '') || null,
        brand: toText(source.brand || metadata.brand || '') || null,
        stockStatus: toText(source.stockStatus || source.stock_status || metadata.stockStatus || metadata.stock_status || '') || null,
        stockQuantity: Number.isFinite(Number(source.stockQuantity ?? metadata.stockQuantity))
            ? Number(source.stockQuantity ?? metadata.stockQuantity)
            : null,
        discountPct: Number.isFinite(discountPct) ? discountPct : 0,
        url: toText(source.url || source.permalink || source.productUrl || source.link || metadata.url || metadata.permalink || '') || null,
        imageUrl: toText(source.imageUrl || source.image_url || source.image || metadata.imageUrl || metadata.image_url || metadata.image || '') || null,
        isActive,
        metadata
    };
}

function normalizeChatMessage(message = {}, index = 0) {
    const source = message && typeof message === 'object' ? message : {};
    const body = toText(source.body || source.text || source.message || source.content || '');
    if (!body) return null;
    const fromRaw = String(source.from || source.role || '').trim().toLowerCase();
    const fromMe = source.fromMe === true
        || fromRaw === 'seller'
        || fromRaw === 'agent'
        || fromRaw === 'assistant'
        || fromRaw === 'vendedora'
        || fromRaw === 'vendedor'
        || fromRaw === 'me'
        || fromRaw === 'owner';
    const timestamp = Number(source.timestamp || source.timestampUnix || source.ts || 0) || null;
    return {
        idx: index + 1,
        from: fromMe ? 'VENDEDORA' : 'CLIENTE',
        body: clipText(body, 260),
        timestamp
    };
}

function parseContextTextToMessages(contextText = '') {
    const lines = String(contextText || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const out = [];
    lines.forEach((line, idx) => {
        const parts = line.split(':');
        if (parts.length > 1) {
            const left = toLower(parts[0]);
            const body = toText(parts.slice(1).join(':'));
            if (!body) return;
            const fromMe = ['vendedor', 'vendedora', 'agente', 'seller', 'assistant', 'ia'].includes(left);
            out.push({
                idx: idx + 1,
                from: fromMe ? 'VENDEDORA' : 'CLIENTE',
                body: clipText(body, 260),
                timestamp: null
            });
            return;
        }
        const body = toText(line);
        if (body) {
            out.push({
                idx: idx + 1,
                from: 'CLIENTE',
                body: clipText(body, 260),
                timestamp: null
            });
        }
    });
    return out.slice(-MAX_CHAT_MESSAGES);
}

function normalizeCartItem(item = {}, index = 0) {
    const source = item && typeof item === 'object' ? item : {};
    const title = toText(source.title || source.name);
    if (!title) return null;
    return {
        idx: index + 1,
        id: toText(source.id || title).slice(0, 80),
        title,
        qty: Math.max(1, Math.floor(toNumber(source.qty, 1))),
        unitPrice: Number(toNumber(source.price, 0).toFixed(2)),
        regularPrice: Number(toNumber(source.regularPrice || source.price, 0).toFixed(2)),
        lineDiscountEnabled: source.lineDiscountEnabled === true,
        lineDiscountType: toLower(source.lineDiscountType) === 'amount' ? 'amount' : 'percent',
        lineDiscountValue: Number(toNumber(source.lineDiscountValue, 0).toFixed(2)),
        category: toText(source.category || source.categoryName || '') || null
    };
}

function normalizeRuntimeContext(runtimeContext = {}) {
    const source = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : {};
    const catalogItems = toArray(source?.catalog?.items).map((item) => normalizeCatalogProduct(item)).filter(Boolean);
    const chatMessages = toArray(source?.chat?.recentMessages).map((entry, idx) => normalizeChatMessage(entry, idx)).filter(Boolean);
    const cartItems = toArray(source?.cart?.items).map((entry, idx) => normalizeCartItem(entry, idx)).filter(Boolean);

    return {
        tenant: {
            id: toText(source?.tenant?.id || source?.tenantId || ''),
            name: toText(source?.tenant?.name || ''),
            plan: toLower(source?.tenant?.plan || '')
        },
        module: {
            moduleId: normalizeModuleId(source?.module?.moduleId || source?.moduleId || ''),
            name: toText(source?.module?.name || ''),
            channelType: toLower(source?.module?.channelType || ''),
            transportMode: toLower(source?.module?.transportMode || '')
        },
        catalog: {
            catalogId: normalizeCatalogId(source?.catalog?.catalogId || ''),
            catalogIds: toArray(source?.catalog?.catalogIds).map((entry) => normalizeCatalogId(entry)).filter(Boolean),
            source: toLower(source?.catalog?.source || ''),
            items: catalogItems
        },
        cart: {
            exists: cartItems.length > 0,
            items: cartItems,
            subtotal: Number(toNumber(source?.cart?.subtotal, 0).toFixed(2)),
            discount: Number(toNumber(source?.cart?.discount, 0).toFixed(2)),
            total: Number(toNumber(source?.cart?.total, 0).toFixed(2)),
            delivery: Number(toNumber(source?.cart?.delivery, 0).toFixed(2)),
            currency: toText(source?.cart?.currency || 'PEN') || 'PEN',
            notes: clipText(source?.cart?.notes || '', 220) || null
        },
        chat: {
            chatId: normalizeScopedChatId(source?.chat?.chatId || source?.chatId || ''),
            phone: normalizePhone(source?.chat?.phone || source?.customer?.phoneE164 || source?.phone || ''),
            recentMessages: chatMessages
        },
        customer: {
            customerId: toText(source?.customer?.customerId || ''),
            phoneE164: normalizePhone(source?.customer?.phoneE164 || source?.chat?.phone || source?.phone || ''),
            name: toText(source?.customer?.name || source?.customer?.contactName || '')
        },
        ui: {
            contextSource: toText(source?.ui?.contextSource || source?.source || '')
        }
    };
}

function inferCommercialIntent({ query = '', recentMessages = [] } = {}) {
    const corpus = `${String(query || '').toLowerCase()} ${recentMessages.map((entry) => String(entry?.body || '').toLowerCase()).join(' ')}`;
    const has = (tokens = []) => tokens.some((token) => corpus.includes(token));
    if (has(['cotizacion', 'cotiza', 'propuesta', 'paquete', 'combo', 'presupuesto'])) return 'cotizacion';
    if (has(['precio', 'caro', 'costoso', 'barato', 'descuento'])) return 'objecion_precio';
    if (has(['delivery', 'entrega', 'despacho', 'llega', 'envio'])) return 'delivery';
    if (has(['aroma', 'fragancia', 'olor'])) return 'aroma';
    if (has(['alerg', 'bebe', 'piel sensible', 'mascota', 'pet'])) return 'sensibilidad';
    if (has(['compar', 'diferencia', 'cual me recomiendas', 'cual conviene'])) return 'comparacion';
    return 'consulta_general';
}

function listToBulletText(items = [], formatter) {
    return (Array.isArray(items) ? items : [])
        .map((entry, idx) => formatter(entry, idx))
        .filter(Boolean)
        .join('\n');
}

async function resolveServerCatalogSnapshot(tenantId, runtime = {}, moduleContext = null) {
    const cleanTenantId = toText(tenantId || 'default') || 'default';
    const moduleSettings = moduleContext?.metadata?.moduleSettings && typeof moduleContext.metadata.moduleSettings === 'object'
        ? moduleContext.metadata.moduleSettings
        : {};
    const moduleCatalogIds = toArray(moduleSettings.catalogIds).map((entry) => normalizeCatalogId(entry)).filter(Boolean);
    const runtimeCatalogIds = toArray(runtime?.catalog?.catalogIds).map((entry) => normalizeCatalogId(entry)).filter(Boolean);
    const requestedCatalogId = normalizeCatalogId(runtime?.catalog?.catalogId || '');
    const moduleId = normalizeModuleId(runtime?.module?.moduleId || moduleContext?.moduleId || '');

    const configuredCatalogs = await tenantCatalogService.ensureDefaultCatalog(cleanTenantId).catch(() => []);
    const activeCatalogs = toArray(configuredCatalogs)
        .filter((entry) => entry?.isActive !== false)
        .map((entry) => ({
            catalogId: normalizeCatalogId(entry?.catalogId || ''),
            name: toText(entry?.name || entry?.catalogId || ''),
            sourceType: toLower(entry?.sourceType || '')
        }))
        .filter((entry) => entry.catalogId);

    const activeCatalogIdSet = new Set(activeCatalogs.map((entry) => entry.catalogId));
    let candidateIds = [...moduleCatalogIds, ...runtimeCatalogIds];
    if (requestedCatalogId) candidateIds.unshift(requestedCatalogId);
    candidateIds = Array.from(new Set(candidateIds.filter((entry) => activeCatalogIdSet.has(entry))));
    if (!candidateIds.length) {
        candidateIds = activeCatalogs.slice(0, 3).map((entry) => entry.catalogId);
    }

    const byCatalog = [];
    for (const catalogId of candidateIds) {
        const catalogInfo = activeCatalogs.find((entry) => entry.catalogId === catalogId) || null;
        const rows = await loadCatalog({
            tenantId: cleanTenantId,
            moduleId: moduleId || null,
            catalogId,
            includeLegacyEmptyCatalogId: true
        }).catch(() => []);

        const normalized = toArray(rows)
            .map((item) => normalizeCatalogProduct(item, catalogInfo))
            .filter(Boolean);

        if (normalized.length > 0) {
            byCatalog.push({
                catalogId,
                name: catalogInfo?.name || catalogId,
                sourceType: catalogInfo?.sourceType || 'local',
                items: normalized
            });
        }
    }

    const runtimeCatalogItems = toArray(runtime?.catalog?.items)
        .map((item) => normalizeCatalogProduct(item))
        .filter(Boolean);

    const mergedItems = [];
    const seen = new Set();
    const pushUnique = (entry) => {
        if (!entry || entry.isActive === false) return;
        const key = `${entry.catalogId || 'GEN'}::${toText(entry.id || '').toUpperCase()}::${toLower(entry.title)}`;
        if (seen.has(key)) return;
        seen.add(key);
        mergedItems.push(entry);
    };

    byCatalog.forEach((catalogEntry) => {
        catalogEntry.items.forEach(pushUnique);
    });
    runtimeCatalogItems.forEach(pushUnique);

    return {
        configuredCatalogs: activeCatalogs,
        selectedCatalogIds: candidateIds,
        items: mergedItems.slice(0, MAX_CATALOG_PRODUCTS)
    };
}

async function resolveChatSnapshot(tenantId, runtime = {}, contextText = '', moduleContext = null) {
    const recentFromRuntime = toArray(runtime?.chat?.recentMessages).map((entry, idx) => normalizeChatMessage(entry, idx)).filter(Boolean);
    if (recentFromRuntime.length > 0) {
        return recentFromRuntime.slice(-MAX_CHAT_MESSAGES);
    }

    const chatId = normalizeScopedChatId(runtime?.chat?.chatId || '');
    if (chatId) {
        const rows = await messageHistoryService.listMessages(tenantId, { chatId, limit: MAX_CHAT_MESSAGES * 2 }).catch(() => []);
        const moduleId = normalizeModuleId(runtime?.module?.moduleId || moduleContext?.moduleId || '');
        const scopedRows = moduleId
            ? rows.filter((entry) => normalizeModuleId(entry?.waModuleId || '') === moduleId)
            : rows;
        if (scopedRows.length > 0) {
            return scopedRows
                .slice(0, MAX_CHAT_MESSAGES)
                .reverse()
                .map((entry, idx) => normalizeChatMessage({
                    fromMe: entry?.fromMe,
                    body: entry?.body || (entry?.hasMedia ? '[adjunto]' : ''),
                    timestamp: entry?.timestampUnix
                }, idx))
                .filter(Boolean);
        }
    }

    return parseContextTextToMessages(contextText).slice(-MAX_CHAT_MESSAGES);
}

async function resolveCustomerSnapshot(tenantId, runtime = {}) {
    const explicitName = toText(runtime?.customer?.name || '');
    const explicitPhone = normalizePhone(runtime?.customer?.phoneE164 || runtime?.chat?.phone || '');
    const customerId = toText(runtime?.customer?.customerId || '');

    let customer = null;
    if (customerId) {
        customer = await customerService.getCustomer(tenantId, customerId).catch(() => null);
    }

    if (!customer && explicitPhone) {
        const page = await customerService.listCustomers(tenantId, {
            query: explicitPhone.replace('+', ''),
            limit: 20,
            includeInactive: true
        }).catch(() => ({ items: [] }));
        customer = toArray(page?.items).find((entry) => normalizePhone(entry?.phoneE164 || '') === explicitPhone) || null;
    }

    return {
        customerId: toText(customer?.customerId || customerId || '') || null,
        name: toText(customer?.contactName || explicitName || '') || null,
        phoneE164: normalizePhone(customer?.phoneE164 || explicitPhone || '') || null,
        tags: toArray(customer?.tags).slice(0, 8),
        profile: customer?.profile && typeof customer.profile === 'object' ? customer.profile : null
    };
}

function buildLavitatPromptCore({ mode = 'internal_copilot', intent = 'consulta_general' } = {}) {
    const outputContract = mode === 'chat_suggestion'
        ? `SALIDA OBLIGATORIA:\n- Devuelve SOLO UN texto listo para enviar al cliente.\n- Maximo 120 palabras, sin comillas, sin markdown, sin encabezados.`
        : `SALIDA OBLIGATORIA PARA COPILOTO INTERNO:
1) SUGERENCIAS (3)
- Opcion 1:
  [MENSAJE: texto listo para WhatsApp]
- Opcion 2:
  [MENSAJE: texto listo para WhatsApp]
- Opcion 3:
  [MENSAJE: texto listo para WhatsApp]

2) RECOMENDACION COMERCIAL
- Producto principal:
- Complemento sugerido:
- Motivo:

3) CIERRE SUGERIDO
- [MENSAJE: texto final de cierre listo para WhatsApp]

4) COTIZACIONES (solo si aplica por consulta o carrito)
OPCION 1
- Productos
- Cantidades
- Subtotal / Total
- Beneficio comercial
- [MENSAJE: cotizacion resumida lista para WhatsApp]
OPCION 2
...
OPCION 3
...

Si cotizaciones no aplica, escribir exactamente: "COTIZACIONES: NO APLICA EN ESTE CONTEXTO".`;

    return `Eres el COPILOTO COMERCIAL INTERNO de Lavitat (Peru). Tu interlocutora es una vendedora, no el cliente final.

IDENTIDAD DE MARCA LAVITAT:
- Alta calidad, confiable, elegante, cercana, moderna y ordenada.
- Tono: amigable, claro, experto, seguro, calido y comercialmente efectivo.
- Evita tono suplicante, inseguro, vulgar o improvisado.
- Posicionamiento: mejor calidad/servicio que opciones economicas y mas accesible que marcas premium altas.

DIFERENCIALES A PRIORIZAR:
- Formula eficaz y cuidado de superficies/tejidos.
- Biodegradables cuando corresponda.
- Fragancias trabajadas.
- Atencion personalizada y puntualidad.
- Productos hipoalergenicos y pet friendly cuando aplique segun producto real.

GUIA TECNICA (usar solo si el producto existe en el catalogo activo):
- Detergente Concentrado Lavitat: formula netamente enzimatica, limpia y cuida tejidos, evita envejecimiento prematuro.
- Suavizante Concentrado Lavitat: complemento natural del detergente concentrado para experiencia premium de lavado.
- Quitamanchas Lavitat: ideal para reforzar remocion de manchas sin maltratar tejidos.
- Detergente Delicado Lavitat: hipoalergenico, ideal bebes/lenceria/piel sensible, mantiene pH ideal.
- Suavizante Delicado Lavitat: hipoalergenico, ideal bebes/lenceria/piel sensible, suavidad superior con aroma sutil.
- Lavavajillas Lavitat: resaltar eliminacion de grasa dificil.
- Saca Grasa Lavitat: enfocar potencia para grasa adherida en cocina, uso practico y efectivo.
- Limpiador Desinfectante Lavitat: limpia + desinfecta + aromatiza, apto superficies del hogar, pet friendly y uso sin guantes.
- Quitasarro Lavitat: consistencia gel para mayor rendimiento.
- Limpiavidrios Lavitat: acabado limpio, sin marcas, ideal para superficies de vidrio.
- Jabon liquido (avena y miel / frutos rojos): uso para manos y cuerpo segun variante cargada.

REGLAS INNEGOCIABLES:
- NUNCA mezcles datos entre tenants.
- NUNCA inventes productos, precios, promociones, stock, presentaciones ni aromas.
- Usa SOLO catalogos y datos de carrito provistos en el contexto.
- Si existe carrito, usalo como fuente principal para cotizar.
- Si no existe carrito, arma opciones desde catalogo activo del tenant.
- Si falta un dato, indicalo de forma ejecutiva: "Dato no disponible en sistema, confirmar antes de enviar."
- Si hay objecion de precio, responde por valor/rendimiento, no por descuento defensivo.
- Si corresponde, aplica upsell/cross-sell con criterio (no forzado).
- Intencion comercial detectada: ${intent}.

${outputContract}`;
}

function buildContextBlock(snapshot = {}, { query = '', customPrompt = '', contextText = '' } = {}) {
    const tenant = snapshot?.tenant || {};
    const moduleInfo = snapshot?.module || {};
    const catalog = snapshot?.catalog || {};
    const cart = snapshot?.cart || {};
    const customer = snapshot?.customer || {};
    const chat = snapshot?.chat || {};
    const settings = snapshot?.settings || {};
    const integrations = snapshot?.integrations || {};

    const catalogRows = listToBulletText(catalog.items || [], (item, idx) => {
        const categories = Array.isArray(item?.categories) && item.categories.length ? ` | Categoria: ${item.categories.join(' / ')}` : '';
        const attributes = [
            item?.presentation ? ` | Presentacion: ${item.presentation}` : '',
            item?.aroma ? ` | Aroma: ${item.aroma}` : '',
            item?.hypoallergenic === true ? ' | Hipoalergenico: si' : '',
            item?.petFriendly === true ? ' | Pet friendly: si' : ''
        ].join('');
        const extra = [
            item?.regularPrice ? ` | Precio regular: S/ ${item.regularPrice}` : '',
            item?.salePrice ? ` | Precio oferta: S/ ${item.salePrice}` : '',
            item?.discountPct ? ` | Desc: ${item.discountPct}%` : '',
            item?.stockStatus ? ` | Stock: ${item.stockStatus}` : ''
        ].join('');
        return `${idx + 1}. [${item.catalogId || 'GEN'}] ${item.title} | Precio: S/ ${item.price || 'N/D'}${categories}${attributes}${extra}`;
    }) || '(sin productos en contexto)';

    const cartRows = listToBulletText(cart.items || [], (line) => {
        const discount = line?.lineDiscountEnabled
            ? ` | desc ${line.lineDiscountType === 'amount' ? 'monto' : '%'} ${line.lineDiscountValue}`
            : '';
        return `- ${line.title} | qty ${line.qty} | unit S/ ${line.unitPrice}${discount}`;
    }) || '(carrito vacio)';

    const chatRows = listToBulletText(chat.recentMessages || [], (msg) => `- ${msg.from}: ${msg.body}`) || '(sin historial)';

    return `CONTEXTO REAL DEL SISTEMA (TENANT ACTIVO):

TENANT:
- tenant_id: ${tenant.id || 'default'}
- nombre_empresa: ${tenant.name || 'N/D'}
- plan: ${tenant.plan || 'starter'}

MODULO ACTIVO:
- module_id: ${moduleInfo.moduleId || 'N/D'}
- nombre: ${moduleInfo.name || 'N/D'}
- canal: ${moduleInfo.channelType || 'whatsapp'}
- transporte: ${moduleInfo.transportMode || 'cloud'}
- ai_assistant_id: ${moduleInfo.aiAssistantId || 'N/D'}

CONFIGURACION / MODULOS HABILITADOS:
- tenant.enabledModules.aiPro: ${settings?.enabledModules?.aiPro !== false}
- tenant.enabledModules.catalog: ${settings?.enabledModules?.catalog !== false}
- tenant.enabledModules.cart: ${settings?.enabledModules?.cart !== false}
- tenant.enabledModules.quickReplies: ${settings?.enabledModules?.quickReplies !== false}
- tenant.integrations.catalog.mode: ${integrations?.catalog?.mode || 'hybrid'}
- tenant.integrations.ai.defaultAssistantId: ${integrations?.ai?.defaultAssistantId || 'N/D'}

CLIENTE / CHAT:
- chat_id: ${chat.chatId || 'N/D'}
- telefono: ${customer.phoneE164 || chat.phone || 'N/D'}
- cliente_id: ${customer.customerId || 'N/D'}
- nombre_cliente: ${customer.name || 'N/D'}
- tags_cliente: ${Array.isArray(customer.tags) && customer.tags.length ? customer.tags.join(', ') : 'N/D'}

ULTIMOS MENSAJES RELEVANTES:
${chatRows}

CATALOGOS DISPONIBLES:
- catalog_ids_seleccionados: ${Array.isArray(catalog.selectedCatalogIds) && catalog.selectedCatalogIds.length ? catalog.selectedCatalogIds.join(', ') : 'N/D'}
- total_productos_contexto: ${Array.isArray(catalog.items) ? catalog.items.length : 0}
${catalogRows}

CARRITO ACTUAL:
- existe_carrito: ${cart.exists === true}
- subtotal: S/ ${Number(toNumber(cart.subtotal, 0)).toFixed(2)}
- descuento: S/ ${Number(toNumber(cart.discount, 0)).toFixed(2)}
- delivery: S/ ${Number(toNumber(cart.delivery, 0)).toFixed(2)}
- total: S/ ${Number(toNumber(cart.total, 0)).toFixed(2)}
- moneda: ${cart.currency || 'PEN'}
${cartRows}

SOLICITUD DE LA VENDEDORA:
- query: ${toText(query || '') || '(sin query)'}
- instruccion_custom: ${toText(customPrompt || '') || '(sin instruccion adicional)'}
- contexto_texto_legacy: ${toText(contextText || '') ? clipText(contextText, 480) : '(vacio)'}`;
}

async function buildAiPromptPackage({
    mode = 'internal_copilot',
    tenantId = 'default',
    query = '',
    customPrompt = '',
    contextText = '',
    runtimeContext = null,
    moduleContext = null
} = {}) {
    const cleanTenantId = toText(tenantId || 'default') || 'default';
    const runtime = normalizeRuntimeContext(runtimeContext || {});
    const tenantResolved = tenantService.findTenantById(cleanTenantId) || tenantService.DEFAULT_TENANT;
    const tenantSettings = await tenantSettingsService.getTenantSettings(cleanTenantId).catch(() => ({
        enabledModules: { aiPro: true, catalog: true, cart: true, quickReplies: true }
    }));
    const tenantIntegrations = await tenantIntegrationsService.getTenantIntegrations(cleanTenantId, { runtime: true }).catch(() => ({}));

    const moduleSettings = moduleContext?.metadata?.moduleSettings && typeof moduleContext.metadata.moduleSettings === 'object'
        ? moduleContext.metadata.moduleSettings
        : {};
    const moduleFeatures = moduleSettings?.enabledModules && typeof moduleSettings.enabledModules === 'object'
        ? moduleSettings.enabledModules
        : {};

    const [catalogSnapshot, chatSnapshot, customerSnapshot] = await Promise.all([
        resolveServerCatalogSnapshot(cleanTenantId, runtime, moduleContext),
        resolveChatSnapshot(cleanTenantId, runtime, contextText, moduleContext),
        resolveCustomerSnapshot(cleanTenantId, runtime)
    ]);

    const snapshot = {
        tenant: {
            id: cleanTenantId,
            name: tenantResolved?.name || runtime?.tenant?.name || cleanTenantId,
            plan: tenantResolved?.plan || runtime?.tenant?.plan || 'starter'
        },
        module: {
            moduleId: normalizeModuleId(runtime?.module?.moduleId || moduleContext?.moduleId || ''),
            name: toText(runtime?.module?.name || moduleContext?.name || ''),
            channelType: toLower(runtime?.module?.channelType || moduleContext?.channelType || ''),
            transportMode: toLower(runtime?.module?.transportMode || moduleContext?.transportMode || ''),
            aiAssistantId: normalizeAssistantId(moduleSettings?.aiAssistantId || '')
        },
        settings: {
            enabledModules: {
                aiPro: moduleFeatures?.aiPro !== false && tenantSettings?.enabledModules?.aiPro !== false,
                catalog: moduleFeatures?.catalog !== false && tenantSettings?.enabledModules?.catalog !== false,
                cart: moduleFeatures?.cart !== false && tenantSettings?.enabledModules?.cart !== false,
                quickReplies: moduleFeatures?.quickReplies !== false && tenantSettings?.enabledModules?.quickReplies !== false
            }
        },
        integrations: {
            catalog: {
                mode: toLower(tenantIntegrations?.catalog?.mode || '')
            },
            ai: {
                defaultAssistantId: normalizeAssistantId(tenantIntegrations?.ai?.defaultAssistantId || '')
            }
        },
        catalog: catalogSnapshot,
        cart: runtime?.cart || { exists: false, items: [] },
        customer: customerSnapshot,
        chat: {
            chatId: runtime?.chat?.chatId || '',
            phone: runtime?.chat?.phone || '',
            recentMessages: chatSnapshot
        }
    };

    const intent = inferCommercialIntent({
        query: query || customPrompt || contextText,
        recentMessages: snapshot?.chat?.recentMessages || []
    });
    const promptCore = buildLavitatPromptCore({ mode, intent });
    const contextBlock = buildContextBlock(snapshot, { query, customPrompt, contextText });

    const dynamicSystemPrompt = `${promptCore}

INSTRUCCION FINAL:
- Prioriza precision y utilidad para la vendedora.
- Si una accion depende de un modulo deshabilitado, indicalo claramente y da alternativa.`;

    const dynamicUserPrompt = `${contextBlock}

EJECUTA LA TAREA CON ESE CONTEXTO Y RESPETA EL FORMATO OBLIGATORIO.`;

    return {
        snapshot,
        dynamicSystemPrompt,
        dynamicUserPrompt,
        intent
    };
}

module.exports = {
    buildAiPromptPackage
};
