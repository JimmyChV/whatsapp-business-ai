const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres
} = require('../../../config/persistence-runtime');
const tenantIntegrationsService = require('../../tenant/services/integrations.service');
const tenantScheduleService = require('../../tenant/services/tenant-schedule.service');
const tenantAutomationService = require('../../tenant/services/tenant-automation.service');
const quickRepliesManagerService = require('../../tenant/services/quick-replies-manager.service');
const tenantZoneRulesService = require('../../tenant/services/tenant-zone-rules.service');
const waModulesService = require('../../tenant/services/wa-modules.service');
const quotesService = require('../../tenant/services/quotes.service');
const chatCommercialStatusService = require('../../operations/services/chat-commercial-status.service');
const { getChatSuggestion } = require('../../operations/services/ai.service');
const waClient = require('./wa-provider.service');
const {
    buildScopedChatId
} = require('../helpers/chat-scope.helpers');
const {
    buildQuoteMessageBody,
    buildQuoteInteractiveMessage,
    buildOutgoingOrderPayload,
    buildSyntheticInteractiveSentMessage
} = require('./socket-quote-delivery.service');

const DEFAULT_ASSISTANT_NAME = 'Patty';
const DEFAULT_WAIT_SECONDS = 15;
const MIN_WAIT_SECONDS = 5;
const MAX_WAIT_SECONDS = 300;
const ACCEPTED_REOPEN_MINUTES = 30;
const pattyChatDebounce = new Map();

function text(value = '') {
    return String(value ?? '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function minutesSince(value) {
    const timestamp = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(timestamp)) return null;
    return Math.floor((Date.now() - timestamp) / 60000);
}

function normalizeProductLookupKey(value = '') {
    return lower(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function extractProductVolume(value = '') {
    const normalized = lower(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const match = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|mililitros?|l|lt|lts|litros?|kg|kilos?|g|gr|grs|gramos?)\b/i);
    if (!match) return null;
    const amount = Number.parseFloat(String(match[1]).replace(',', '.'));
    if (!Number.isFinite(amount)) return null;
    const rawUnit = lower(match[2]);
    if (rawUnit.startsWith('l') || rawUnit.startsWith('lt')) {
        return { unit: 'ml', amount: Math.round(amount * 1000) };
    }
    if (rawUnit.startsWith('kg') || rawUnit.startsWith('kilo')) {
        return { unit: 'g', amount: Math.round(amount * 1000) };
    }
    if (rawUnit.startsWith('g') || rawUnit.startsWith('gr')) {
        return { unit: 'g', amount: Math.round(amount) };
    }
    return { unit: 'ml', amount: Math.round(amount) };
}

function normalizeProductTitleForFuzzyMatch(value = '') {
    return lower(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b\d+(?:[.,]\d+)?\s*(ml|mililitros?|l|lt|lts|litros?|kg|kilos?|g|gr|grs|gramos?)\b/gi, ' ')
        .replace(/[®©™]/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function catalogRowMatchPrice(row = {}) {
    const metadata = safeJsonObject(row.metadata);
    const parsed = money(metadata.salePrice ?? metadata.sale_price ?? metadata.precio_oferta ?? row.price);
    return parsed === null ? Number.MAX_SAFE_INTEGER : parsed;
}

function compareCatalogCandidates(a, b, requestVolume) {
    if (requestVolume) {
        const aDistance = a.volume && a.volume.unit === requestVolume.unit
            ? Math.abs(a.volume.amount - requestVolume.amount)
            : Number.MAX_SAFE_INTEGER;
        const bDistance = b.volume && b.volume.unit === requestVolume.unit
            ? Math.abs(b.volume.amount - requestVolume.amount)
            : Number.MAX_SAFE_INTEGER;
        if (aDistance !== bDistance) return aDistance - bDistance;
    }
    if (a.price !== b.price) return a.price - b.price;
    return a.titleKey.length - b.titleKey.length;
}

function normalizeLocationLookup(value = '') {
    return normalizeProductLookupKey(value);
}

function findCatalogRowForQuoteProduct(requestItem = {}, catalogRows = [], catalogBySku = new Map(), catalogByTitle = new Map()) {
    const sku = text(requestItem?.sku).toUpperCase();
    const requestedTitle = text(requestItem?.title || requestItem?.name || requestItem?.productName || requestItem?.product_name);
    const lookupText = requestedTitle || sku;
    const normalizedLookup = normalizeProductLookupKey(lookupText);
    if (!normalizedLookup && !sku) return null;

    const exactTitleMatch = catalogByTitle.get(normalizedLookup);
    if (exactTitleMatch) return exactTitleMatch;

    const exactSkuMatch = sku ? catalogBySku.get(sku) : null;
    if (exactSkuMatch) return exactSkuMatch;

    const fuzzyLookup = normalizeProductTitleForFuzzyMatch(lookupText);
    const requestVolume = extractProductVolume(lookupText);
    const fuzzyCandidates = catalogRows
        .map((row) => {
            const titleKey = normalizeProductTitleForFuzzyMatch(row.title);
            return {
                row,
                titleKey,
                volume: extractProductVolume(row.title),
                price: catalogRowMatchPrice(row)
            };
        })
        .filter((candidate) => (
            candidate.titleKey
            && fuzzyLookup
            && (candidate.titleKey.includes(fuzzyLookup) || fuzzyLookup.includes(candidate.titleKey))
        ))
        .sort((a, b) => compareCatalogCandidates(a, b, requestVolume));
    if (fuzzyCandidates.length) return fuzzyCandidates[0].row;

    const containsCandidates = catalogRows
        .map((row) => {
            const titleKey = normalizeProductLookupKey(row.title);
            return {
                row,
                titleKey,
                volume: extractProductVolume(row.title),
                price: catalogRowMatchPrice(row)
            };
        })
        .filter((candidate) => (
            candidate.titleKey
            && normalizedLookup
            && (candidate.titleKey.includes(normalizedLookup) || normalizedLookup.includes(candidate.titleKey))
        ))
        .sort((a, b) => compareCatalogCandidates(a, b, requestVolume));
    if (containsCandidates.length) return containsCandidates[0].row;

    const usefulWords = normalizedLookup
        .split(' ')
        .map((word) => word.trim())
        .filter((word) => word.length >= 3);
    if (!usefulWords.length) return null;
    const wordCandidates = catalogRows
        .map((row) => {
            const titleKey = normalizeProductLookupKey(row.title);
            return {
                row,
                titleKey,
                volume: extractProductVolume(row.title),
                price: catalogRowMatchPrice(row)
            };
        })
        .filter((candidate) => candidate.titleKey && usefulWords.some((word) => candidate.titleKey.includes(word)))
        .sort((a, b) => compareCatalogCandidates(a, b, requestVolume));
    return wordCandidates[0]?.row || null;
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
    const stripped = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    const regexCandidate = raw.match(/\{[\s\S]*\}/)?.[0];
    const candidates = [
        raw,
        stripped,
        regexCandidate
    ].filter(Boolean);
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
    console.warn('[Patty] JSON parse failed, using raw text fallback', { raw });
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
    if (parsed) return [];
    const fallback = text(rawSuggestion);
    return fallback ? [{ text: fallback, quotedMessageId: null }] : [];
}

function normalizePattyQuoteRequest(rawSuggestion = '') {
    const parsed = extractJsonObject(rawSuggestion);
    const source = safeJsonObject(parsed?.quoteRequest || parsed?.quote_request);
    const products = Array.isArray(source.products) ? source.products : [];
    const normalizedProducts = products
        .map((item) => ({
            sku: text(item?.sku || item?.item_id || item?.productId || item?.product_id).toUpperCase(),
            title: text(item?.title || item?.name || item?.productName || item?.product_name),
            qty: Math.max(1, Number.parseInt(String(item?.qty ?? item?.quantity ?? 1), 10) || 1)
        }))
        .filter((item) => item.sku || item.title)
        .slice(0, 20);
    if (!normalizedProducts.length) return null;
    return {
        products: normalizedProducts
    };
}

function normalizePattyCatalogProducts(rawSuggestion = '') {
    const parsed = extractJsonObject(rawSuggestion);
    const source = Array.isArray(parsed?.catalogProducts)
        ? parsed.catalogProducts
        : (Array.isArray(parsed?.catalog_products) ? parsed.catalog_products : []);
    return Array.from(new Set(source
        .map((entry) => text(entry?.sku || entry?.itemId || entry?.item_id || entry).toUpperCase())
        .filter(Boolean)))
        .slice(0, 5);
}

function buildQuoteId() {
    return `quote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildQuoteLineId(index = 0) {
    return `line_${Date.now().toString(36)}_${index + 1}_${Math.random().toString(36).slice(2, 6)}`;
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

function formatAssistantDisplayName(value = '') {
    const clean = text(value);
    if (!clean) return 'Asistente Virtual';
    return /\bIA$/i.test(clean) ? clean : `${clean} IA`;
}

function getAssistantDisplayNameFromModule(moduleConfig = {}) {
    return formatAssistantDisplayName(getAssistantNameFromModule(moduleConfig));
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

function extractMentionedCatalogSkus(recentText = '', rows = []) {
    const source = String(recentText || '').toUpperCase();
    if (!source) return new Set();
    return new Set((Array.isArray(rows) ? rows : [])
        .map((row) => text(row.item_id).toUpperCase())
        .filter((sku) => sku && source.includes(sku)));
}

function buildCatalogProductDetails(row = {}) {
    const metadata = safeJsonObject(row.metadata);
    const details = [
        text(metadata.description || metadata.descripcion || metadata.shortDescription || metadata.short_description),
        text(metadata.variants || metadata.variantes),
        text(metadata.benefits || metadata.beneficios),
        text(metadata.usage || metadata.uso)
    ].filter(Boolean).join(' | ');
    const sku = text(row.item_id).toUpperCase();
    const title = text(row.title) || sku || 'Producto';
    return `  [${sku}] ${title}${details ? `: ${details}` : ': Sin detalle adicional registrado.'}`;
}

async function getCatalogContext(tenantId, recentConversationText = '') {
    const { rows } = await pgQuery(
        `SELECT item_id, title, price, metadata
           FROM catalog_items
          WHERE tenant_id = $1
          LIMIT 120`,
        [tenantId]
    );
    const mentionedSkus = extractMentionedCatalogSkus(recentConversationText, rows);
    const lines = rows
        .map((row) => {
            const metadata = safeJsonObject(row.metadata);
            const sale = money(metadata.salePrice ?? metadata.sale_price ?? metadata.precio_oferta);
            const regular = money(row.price ?? metadata.regularPrice ?? metadata.regular_price);
            const display = sale || regular;
            if (!text(row.title) || !display) return null;
            const sku = text(row.item_id).toUpperCase();
            return {
                score: display,
                line: `- [${sku}] ${text(row.title)}: S/ ${display.toFixed(2)}`
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((item) => item.line);
    const mentionedDetails = rows
        .filter((row) => mentionedSkus.has(text(row.item_id).toUpperCase()))
        .slice(0, 10)
        .map((row) => buildCatalogProductDetails(row));
    return { lines, mentionedDetails };
}

async function getCatalogItemsForQuoteRequest(tenantId, products = []) {
    const { rows } = await pgQuery(
        `SELECT item_id, title, price, metadata
           FROM catalog_items
          WHERE tenant_id = $1
          LIMIT 500`,
        [tenantId]
    );
    const catalogRows = Array.isArray(rows) ? rows : [];
    const catalogBySku = new Map(
        catalogRows
            .map((row) => [text(row.item_id).toUpperCase(), row])
            .filter(([sku]) => sku)
    );
    const catalogByTitle = new Map(
        catalogRows
            .map((row) => [normalizeProductLookupKey(row.title), row])
            .filter(([title]) => title)
    );
    return products
        .map((requestItem, index) => {
            const sku = text(requestItem?.sku).toUpperCase();
            const row = findCatalogRowForQuoteProduct(requestItem, catalogRows, catalogBySku, catalogByTitle);
            if (!row) return null;
            const metadata = safeJsonObject(row.metadata);
            const unitPrice = money(metadata.salePrice ?? metadata.sale_price ?? metadata.precio_oferta ?? row.price) || 0;
            const qty = Math.max(1, Number.parseInt(String(requestItem?.qty ?? 1), 10) || 1);
            const lineSubtotal = money(qty * unitPrice) || 0;
            return {
                lineId: buildQuoteLineId(index),
                productId: text(row.item_id) || sku,
                sku: text(row.item_id) || sku,
                title: text(row.title) || sku,
                unit: 'und',
                qty,
                unitPrice,
                lineSubtotal,
                lineDiscountType: 'none',
                lineDiscountValue: 0,
                lineDiscountAmount: 0,
                lineTotal: lineSubtotal,
                currency: 'PEN'
            };
        })
        .filter(Boolean);
}

function buildPattyCatalogProductCaption(row = {}) {
    const metadata = safeJsonObject(row.metadata);
    const title = text(row.title) || text(row.item_id).toUpperCase() || 'Producto';
    const sale = money(metadata.salePrice ?? metadata.sale_price ?? metadata.precio_oferta);
    const regular = money(row.price ?? metadata.regularPrice ?? metadata.regular_price);
    const finalPrice = sale || regular;
    const lines = [`*${title}*`];
    if (regular && finalPrice && sale && regular > finalPrice) {
        lines.push(`Precio regular: S/ ${regular.toFixed(2)}`);
        lines.push(`*Descuento: S/ ${(regular - finalPrice).toFixed(2)}*`);
        lines.push(`*PRECIO FINAL: S/ ${finalPrice.toFixed(2)}*`);
    } else if (finalPrice) {
        lines.push(`*PRECIO FINAL: S/ ${finalPrice.toFixed(2)}*`);
    } else {
        lines.push('*PRECIO FINAL: CONSULTAR*');
    }
    const description = text(metadata.description || metadata.descripcion || metadata.shortDescription || metadata.short_description);
    if (description) {
        lines.push('');
        lines.push(`Detalle: ${description.length > 280 ? `${description.slice(0, 277)}...` : description}`);
    }
    const sku = text(row.item_id).toUpperCase();
    if (sku) lines.push(`SKU: ${sku}`);
    return lines.join('\n');
}

async function getCatalogRowsBySkus(tenantId, skus = []) {
    const cleanSkus = Array.from(new Set((Array.isArray(skus) ? skus : [])
        .map((sku) => text(sku).toUpperCase())
        .filter(Boolean)))
        .slice(0, 5);
    if (!cleanSkus.length) return [];
    const placeholders = cleanSkus.map((_, index) => `$${index + 2}`).join(', ');
    const { rows } = await pgQuery(
        `SELECT item_id, title, price, metadata
           FROM catalog_items
          WHERE tenant_id = $1
            AND UPPER(item_id) IN (${placeholders})`,
        [tenantId, ...cleanSkus]
    );
    const bySku = new Map((rows || []).map((row) => [text(row.item_id).toUpperCase(), row]));
    return cleanSkus.map((sku) => bySku.get(sku)).filter(Boolean);
}

async function sendPattyCatalogProducts({ tenantId, moduleId = '', chatId, skus = [], assistantName = DEFAULT_ASSISTANT_NAME } = {}) {
    const assistantDisplayName = formatAssistantDisplayName(assistantName);
    const rows = await getCatalogRowsBySkus(tenantId, skus);
    if (!rows.length) return { sent: 0 };
    let sent = 0;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        await waClient.sendMessage(chatId, buildPattyCatalogProductCaption(row), {
            metadata: {
                agentMeta: {
                    sentByUserId: 'patty',
                    sentByName: assistantDisplayName,
                    sentByRole: 'assistant',
                    sentViaModuleId: lower(moduleId)
                },
                patty: true,
                automationSource: 'patty_catalog_product',
                catalogProduct: {
                    sku: text(row.item_id).toUpperCase(),
                    title: text(row.title)
                }
            }
        });
        sent += 1;
        if (index < rows.length - 1) await sleep(1200);
    }
    return { sent };
}

function buildPattyQuoteSummary(items = [], delivery = {}) {
    const subtotal = money(items.reduce((acc, item) => acc + (money(item.lineTotal) || 0), 0)) || 0;
    const deliveryAmount = money(delivery.deliveryAmount) || 0;
    const deliveryFree = delivery.deliveryFree !== false || deliveryAmount <= 0;
    const totalPayable = money(subtotal + (deliveryFree ? 0 : deliveryAmount)) || subtotal;
    return {
        schemaVersion: 1,
        currency: 'PEN',
        itemCount: items.reduce((acc, item) => acc + (Number(item.qty) || 0), 0),
        subtotal,
        discount: 0,
        totalAfterDiscount: subtotal,
        globalDiscount: 0,
        deliveryAmount: deliveryFree ? 0 : deliveryAmount,
        deliveryFree,
        totalPayable
    };
}

function collectZoneCoverageValues(rule = {}) {
    const meta = safeJsonObject(rule.rulesJson || rule.rules_json || rule.metadata);
    return [
        rule.name,
        meta.description,
        meta.notes,
        ...ensureTextArray(meta.districts || meta.districtNames || meta.distritos || meta.district),
        ...ensureTextArray(meta.provinces || meta.provinceNames || meta.provincias || meta.province),
        ...ensureTextArray(meta.departments || meta.departmentNames || meta.departamentos || meta.department),
        ...ensureTextArray(meta.cities || meta.cityNames || meta.ciudades || meta.city)
    ].map(normalizeLocationLookup).filter(Boolean);
}

function resolveZoneDelivery(rule = null, subtotal = 0) {
    if (!rule) return { deliveryAmount: 0, deliveryFree: true, zoneName: null };
    const options = Array.isArray(rule.shippingOptions || rule.shipping_options)
        ? (rule.shippingOptions || rule.shipping_options)
        : [];
    const activeDelivery = options.find((item) => {
        const type = lower(item?.type || '');
        return item && item.is_active !== false && item.isActive !== false && (!type || type === 'delivery');
    }) || options.find((item) => item && item.is_active !== false && item.isActive !== false);
    if (!activeDelivery) return { deliveryAmount: 0, deliveryFree: true, zoneName: text(rule.name) || null };
    const cost = money(activeDelivery.cost) || 0;
    const freeFrom = money(activeDelivery.free_from ?? activeDelivery.freeFrom);
    const isFree = cost <= 0 || (freeFrom !== null && subtotal >= freeFrom);
    return {
        deliveryAmount: isFree ? 0 : cost,
        deliveryFree: isFree,
        zoneName: text(rule.name) || null,
        shippingLabel: text(activeDelivery.label || activeDelivery.type || '')
    };
}

async function resolveDeliveryForChatQuote(tenantId, chatId, subtotal = 0) {
    try {
        const [{ rows }, rules] = await Promise.all([
            pgQuery(
                `SELECT body
                   FROM tenant_messages
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND COALESCE(from_me, FALSE) = FALSE
                  ORDER BY created_at DESC
                  LIMIT 20`,
                [tenantId, chatId]
            ),
            tenantZoneRulesService.listZoneRules(tenantId, { includeInactive: false })
        ]);
        const recentText = (rows || [])
            .map((row) => normalizeLocationLookup(row.body || ''))
            .filter(Boolean)
            .join(' ');
        if (!recentText) return { deliveryAmount: 0, deliveryFree: true, zoneName: null };
        const match = (Array.isArray(rules) ? rules : []).find((rule) => {
            const values = collectZoneCoverageValues(rule);
            return values.some((value) => value && (recentText.includes(value) || value.includes(recentText)));
        });
        return resolveZoneDelivery(match || null, subtotal);
    } catch (error) {
        console.warn('[Patty] zone delivery resolution skipped:', error?.message || error);
        return { deliveryAmount: 0, deliveryFree: true, zoneName: null };
    }
}

async function getQuickRepliesContext(tenantId, moduleId) {
    try {
        const items = await quickRepliesManagerService.listQuickReplies({ tenantId, moduleId });
        const grouped = new Map();
        (Array.isArray(items) ? items : [])
            .filter((item) => item?.availableForPatty === true || item?.available_for_patty === true || safeJsonObject(item?.metadata).availableForPatty === true)
            .forEach((item) => {
                const category = text(item.category || safeJsonObject(item?.metadata).category || 'general').toUpperCase() || 'GENERAL';
                if (!grouped.has(category)) grouped.set(category, []);
                grouped.get(category).push(`  - ${text(item.label || item.id) || 'Respuesta'}: ${text(item.text).replace(/\s+/g, ' ')}`);
            });
        return Array.from(grouped.entries())
            .map(([category, lines]) => [`[${category}]`, ...lines.slice(0, 12)].join('\n'));
    } catch (error) {
        console.warn('[Patty] quick replies unavailable:', error?.message || error);
        return [];
    }
}

function matchesZoneInRecentText(rule = {}, recentConversationText = '') {
    const normalizedRecent = normalizeLocationLookup(recentConversationText);
    if (!normalizedRecent) return false;
    return collectZoneCoverageValues(rule).some((value) => value && (normalizedRecent.includes(value) || value.includes(normalizedRecent)));
}

async function getZonesContext(tenantId, recentConversationText = '') {
    try {
        const rules = await tenantZoneRulesService.listZoneRules(tenantId, { includeInactive: false });
        const sourceRules = Array.isArray(rules) ? rules : [];
        const matchedRules = sourceRules.filter((rule) => matchesZoneInRecentText(rule, recentConversationText));
        if (!matchedRules.length) {
            const names = sourceRules.map((rule) => text(rule.name)).filter(Boolean).slice(0, 30);
            return names.length ? [`Zonas disponibles: ${names.join(', ')}`] : [];
        }
        return matchedRules
            .slice(0, 20)
            .map((rule) => {
                const meta = safeJsonObject(rule.rulesJson || rule.rules_json || rule.metadata);
                const coverageParts = [
                    ...ensureTextArray(meta.districts || meta.districtNames || meta.distritos),
                    ...ensureTextArray(meta.provinces || meta.provinceNames || meta.provincias),
                    ...ensureTextArray(meta.departments || meta.departmentNames || meta.departamentos)
                ];
                const coverage = text(meta.description || meta.notes)
                    || Array.from(new Set(coverageParts)).join(', ')
                    || 'Cobertura no detallada';
                const shippingOptions = Array.isArray(rule.shippingOptions || rule.shipping_options)
                    ? (rule.shippingOptions || rule.shipping_options)
                    : [];
                const shippingLines = shippingOptions
                    .filter((item) => item?.is_active !== false && item?.isActive !== false)
                    .map((item) => {
                        const type = lower(item.type) === 'courier' ? `Courier ${text(item.label) || 'Courier'}` : (text(item.label) || 'Delivery propio');
                        const cost = money(item.cost);
                        const freeFrom = money(item.free_from ?? item.freeFrom);
                        const estimatedTime = text(item.estimated_time || item.estimatedTime);
                        return [
                            `    - ${type}: ${cost !== null ? `S/ ${cost.toFixed(2)}` : 'Costo por confirmar'}`,
                            freeFrom !== null ? `      (gratis en pedidos +S/ ${freeFrom.toFixed(2)})` : '',
                            estimatedTime ? `      Tiempo: ${estimatedTime}` : ''
                        ].filter(Boolean).join('\n');
                    });
                const payments = safeJsonObject(rule.paymentMethods || rule.payment_methods);
                const paymentLabels = [
                    payments.yape ? 'Yape' : '',
                    payments.plin ? 'Plin' : '',
                    payments.bank_transfer || payments.bankTransfer ? 'Transferencia bancaria' : '',
                    payments.credit_card || payments.creditCard ? 'Tarjeta de credito' : ''
                ].filter(Boolean);
                return [
                    `${text(rule.name)}:`,
                    `  Cobertura: ${coverage}`,
                    '  Envio disponible:',
                    shippingLines.length ? shippingLines.join('\n') : '    - Sin opciones de envio configuradas',
                    `  Pagos aceptados: ${paymentLabels.length ? paymentLabels.join(', ') : 'No configurados'}`
                ].join('\n');
            })
            .filter(Boolean);
    } catch (error) {
        console.warn('[Patty] zones unavailable:', error?.message || error);
        return [];
    }
}

function ensureTextArray(value = []) {
    return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
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

async function getCurrentCommercialStatus(tenantId, moduleId, chatId) {
    const state = await getCurrentCommercialState(tenantId, moduleId, chatId);
    return state.status;
}

async function getCurrentCommercialState(tenantId, moduleId, chatId) {
    try {
        const { rows } = await pgQuery(
            `SELECT status, last_transition_at
               FROM tenant_chat_commercial_status
              WHERE tenant_id = $1
                AND chat_id = $2
                AND (scope_module_id IS NULL OR scope_module_id = '' OR LOWER(scope_module_id) = LOWER($3))
              ORDER BY updated_at DESC NULLS LAST
              LIMIT 1`,
            [tenantId, normalizeChatId(chatId), lower(moduleId)]
        );
        return {
            status: lower(rows?.[0]?.status),
            lastTransitionAt: rows?.[0]?.last_transition_at || null
        };
    } catch (error) {
        console.warn('[Patty] commercial status lookup skipped:', error?.message || error);
        return { status: '', lastTransitionAt: null };
    }
}

async function reopenAcceptedChatForQuote(tenantId, moduleId, chatId, state = {}) {
    try {
        await chatCommercialStatusService.upsertChatCommercialStatus(tenantId, {
            chatId: normalizeChatId(chatId),
            scopeModuleId: lower(moduleId),
            status: 'en_conversacion',
            source: 'system',
            reason: 'patty_reopen_after_accepted_window',
            changedByUserId: null,
            lastTransitionAt: new Date().toISOString(),
            metadata: {
                trigger: 'patty_quote_after_accepted_window',
                previousStatus: state.status || 'aceptado',
                previousLastTransitionAt: state.lastTransitionAt || null
            }
        });
        console.log('[Patty] accepted chat reopened before quote', {
            tenantId,
            moduleId: lower(moduleId),
            chatId: normalizeChatId(chatId),
            previousLastTransitionAt: state.lastTransitionAt || null
        });
    } catch (error) {
        console.warn('[Patty] accepted chat reopen failed:', error?.message || error);
    }
}

function getAutomationEventKeyForStatus(status = '') {
    const cleanStatus = lower(status);
    if (cleanStatus === 'aceptado') return 'quote_accepted';
    if (cleanStatus === 'programado') return 'order_programmed';
    if (cleanStatus === 'atendido') return 'order_attended';
    if (cleanStatus === 'vendido') return 'order_sold';
    if (cleanStatus === 'perdido') return 'order_lost';
    if (cleanStatus === 'expirado') return 'order_expired';
    return '';
}

async function hasActiveAutomationForStatus(tenantId, moduleId, status = '') {
    const eventKey = getAutomationEventKeyForStatus(status);
    if (!eventKey) return false;
    try {
        const rules = await tenantAutomationService.listActiveRulesForEvent(tenantId, eventKey, {
            moduleId: lower(moduleId)
        });
        return Array.isArray(rules) && rules.length > 0;
    } catch (error) {
        console.warn('[Patty] automation lookup skipped:', error?.message || error);
        return false;
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
          LIMIT 10`,
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
        const productLines = items
            .map((item) => {
                const sku = text(item.sku || item.productId || item.product_id || item.item_id).toUpperCase();
                const title = text(item.title || item.name || item.productName || item.sku) || sku || 'Producto';
                const qty = Math.max(1, Number.parseInt(String(item.qty ?? item.quantity ?? 1), 10) || 1);
                const lineTotal = money(item.lineTotal ?? item.line_total ?? item.lineSubtotal ?? item.line_subtotal);
                return `  - ${sku ? `[${sku}] ` : ''}${title} × ${qty}${lineTotal !== null ? ` = S/ ${lineTotal.toFixed(2)}` : ''}`;
            })
            .filter(Boolean);
        const products = productLines.length ? productLines.join('\n') : '  - Sin productos legibles';
        const total = money(summary.totalPayable ?? summary.total_payable ?? summary.total);
        const status = lower(row.status);
        if (status === 'sent') {
            return [
                '⚠️ COTIZACIÓN ACTIVA — GESTIONAR MODIFICACIONES:',
                `ID: ${text(row.quote_id)}`,
                'Productos actuales (usar estos como base):',
                products,
                `Total actual: S/ ${formatMoney(total)}`,
                `Enviada: ${text(row.sent_at) || 'No enviada aun'}`,
                '',
                'INSTRUCCIONES PARA MODIFICAR:',
                '  - AGREGAR producto: incluir productos actuales + nuevo',
                '  - QUITAR producto: incluir solo los que quedan',
                '  - CAMBIAR cantidad: incluir todos con cantidad actualizada',
                '  - REEMPLAZAR producto: quitar el anterior, agregar el nuevo',
                '  - Si el cliente confirma sin cambios: NO generar quoteRequest'
            ].join('\n');
        }
        return [
            'COTIZACION ACTIVA:',
            `- ID: ${text(row.quote_id)}`,
            `- Estado: ${text(row.status) || 'sin_estado'}`,
            `- Total: S/ ${formatMoney(total)}`,
            '- Productos:',
            products,
            `- Enviada: ${text(row.sent_at) || 'No enviada aun'}`
        ].join('\n');
    } catch (error) {
        return '';
    }
}

async function getRecentSentQuote(tenantId, moduleId, chatId) {
    try {
        const { rows } = await pgQuery(
            `SELECT quote_id, sent_at, updated_at
               FROM tenant_quotes
              WHERE tenant_id = $1
                AND chat_id = $2
                AND status = 'sent'
                AND COALESCE(sent_at, updated_at, created_at) >= NOW() - INTERVAL '5 minutes'
                AND (scope_module_id IS NULL OR scope_module_id = '' OR LOWER(scope_module_id) = LOWER($3))
              ORDER BY COALESCE(sent_at, updated_at, created_at) DESC
              LIMIT 1`,
            [tenantId, normalizeChatId(chatId), lower(moduleId)]
        );
        return rows?.[0] || null;
    } catch (error) {
        console.warn('[Patty] active quote guard skipped:', error?.message || error);
        return null;
    }
}

const QUOTE_CHANGE_WORDS = [
    'agrega',
    'anade',
    'incluye',
    'quita',
    'saca',
    'elimina',
    'retira',
    'borra',
    'descarta',
    'cancela',
    'cambia',
    'modifica',
    'actualiza',
    'tambien',
    'ademas',
    'sin',
    'diferente',
    'otro',
    'otra',
    'nueva',
    'cambios',
    'con',
    'mas',
    'falta',
    'suma',
    'incorpora',
    'no quiero',
    '2 unidades',
    'dos',
    'tres',
    'cuatro',
    'unidades',
    'cantidad',
    'junto',
    'anterior',
    'todo',
    'completo',
    'los otros',
    'los demas',
    'ambos',
    'combine',
    'todo junto',
    'lo anterior',
    'con los otros',
    'los mismos',
    'mejor',
    'prefiero',
    'en cambio',
    'mejor dame',
    'en vez',
    'en lugar',
    'cambia por',
    'reemplaza'
];

function hasQuoteChangeIntent(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return QUOTE_CHANGE_WORDS.some((word) => normalized.includes(word));
}

async function getLastInboundCustomerText(tenantId, moduleId, chatId) {
    try {
        const { rows } = await pgQuery(
            `SELECT body
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND COALESCE(from_me, FALSE) = FALSE
                AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
              ORDER BY created_at DESC
              LIMIT 1`,
            [tenantId, normalizeChatId(chatId), lower(moduleId)]
        );
        return text(rows?.[0]?.body);
    } catch (error) {
        console.warn('[Patty] last customer message unavailable for quote guard:', error?.message || error);
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

async function createAndSendPattyQuote({
    tenantId,
    moduleId,
    chatId,
    assistantName,
    quoteRequest,
    emitToRuntimeContext,
    emitCommercialStatusUpdated,
    persistMessageHistory
} = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    const cleanChatId = normalizeChatId(chatId);
    const request = quoteRequest && typeof quoteRequest === 'object' ? quoteRequest : null;
    if (!request || !Array.isArray(request.products) || !request.products.length) return null;

    const currentState = await getCurrentCommercialState(cleanTenantId, cleanModuleId, cleanChatId);
    if (currentState.status === 'aceptado') {
        const acceptedMinutes = minutesSince(currentState.lastTransitionAt);
        if (acceptedMinutes === null || acceptedMinutes < ACCEPTED_REOPEN_MINUTES) {
            console.log('[Patty] quote blocked: order recently accepted', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                lastTransitionAt: currentState.lastTransitionAt || null,
                minutesSinceAccepted: acceptedMinutes
            });
            return null;
        }
        await reopenAcceptedChatForQuote(cleanTenantId, cleanModuleId, cleanChatId, currentState);
    }
    if (currentState.status === 'cotizado') {
        const lastCustomerMessage = await getLastInboundCustomerText(cleanTenantId, cleanModuleId, cleanChatId);
        if (!hasQuoteChangeIntent(lastCustomerMessage)) {
            console.log('[Patty] quote blocked: awaiting client decision', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId
            });
            return null;
        }
    }

    const activeQuote = await getRecentSentQuote(cleanTenantId, cleanModuleId, cleanChatId);
    if (activeQuote) {
        const lastCustomerMessage = await getLastInboundCustomerText(cleanTenantId, cleanModuleId, cleanChatId);
        const allowQuoteChange = hasQuoteChangeIntent(lastCustomerMessage);
        if (!allowQuoteChange) {
            console.log('[Patty] quote blocked: active quote already exists', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                quoteId: text(activeQuote.quote_id || activeQuote.quoteId),
                sentAt: activeQuote.sent_at || activeQuote.sentAt || null
            });
            return null;
        }
        console.log('[Patty] quote change allowed: customer requested modifications', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            quoteId: text(activeQuote.quote_id || activeQuote.quoteId)
        });
    }

    const items = await getCatalogItemsForQuoteRequest(cleanTenantId, request.products);
    if (!items.length) {
        console.warn('[Patty] quote request skipped: no catalog matches', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            products: request.products.map((item) => ({
                sku: item.sku || null,
                title: item.title || null,
                qty: item.qty || 1
            }))
        });
        return null;
    }

    const quoteId = buildQuoteId();
    const subtotal = money(items.reduce((acc, item) => acc + (money(item.lineTotal) || 0), 0)) || 0;
    const delivery = await resolveDeliveryForChatQuote(cleanTenantId, cleanChatId, subtotal);
    const summary = buildPattyQuoteSummary(items, delivery);
    const metadata = {
        source: 'patty',
        sourceType: 'quote',
        assistantName: formatAssistantDisplayName(assistantName),
        ...(delivery.zoneName ? { deliveryZoneName: delivery.zoneName } : {})
    };
    const createdQuote = await quotesService.createQuoteRecord(cleanTenantId, {
        quoteId,
        chatId: cleanChatId,
        scopeModuleId: cleanModuleId,
        messageId: null,
        status: 'draft',
        currency: 'PEN',
        itemsJson: items,
        summaryJson: summary,
        notes: null,
        createdByUserId: null,
        updatedByUserId: null,
        sentAt: null,
        metadata
    });
    const effectiveQuoteId = text(createdQuote?.quoteId || quoteId);
    const normalizedQuote = {
        quoteId: effectiveQuoteId,
        currency: 'PEN',
        items,
        summary,
        metadata,
        notes: null
    };
    const quoteBody = buildQuoteMessageBody(normalizedQuote);

    let sentMessageId = null;
    const interactive = buildQuoteInteractiveMessage(effectiveQuoteId, quoteBody);
    if (typeof waClient?.sendInteractiveMessage === 'function') {
        sentMessageId = await waClient.sendInteractiveMessage(cleanChatId, interactive, {
            metadata: {
                agentMeta: {
                    sentByUserId: 'patty',
                    sentByName: metadata.assistantName,
                    sentByRole: 'assistant',
                    sentViaModuleId: cleanModuleId
                },
                patty: true,
                automationSource: 'patty_quote'
            }
        });
    }
    if (!sentMessageId) {
        const sentMessage = await waClient.sendMessage(cleanChatId, quoteBody, {
            metadata: {
                agentMeta: {
                    sentByUserId: 'patty',
                    sentByName: metadata.assistantName,
                    sentByRole: 'assistant',
                    sentViaModuleId: cleanModuleId
                },
                patty: true,
                automationSource: 'patty_quote'
            }
        });
        sentMessageId = text(sentMessage?.id?._serialized || sentMessage?.id || sentMessage?.messageId || sentMessage?.wamid);
    }

    const syntheticSentMessage = buildSyntheticInteractiveSentMessage({
        messageId: sentMessageId,
        chatId: cleanChatId,
        body: quoteBody,
        interactive,
        quotedMessageId: ''
    });
    const outgoingOrderPayload = buildOutgoingOrderPayload(normalizedQuote);

    if (typeof emitToRuntimeContext === 'function') {
        emitToRuntimeContext('message', {
            id: sentMessageId || `local_patty_quote_${Date.now().toString(36)}`,
            from: null,
            to: buildScopedChatId(cleanChatId, cleanModuleId) || cleanChatId,
            chatId: buildScopedChatId(cleanChatId, cleanModuleId) || cleanChatId,
            baseChatId: cleanChatId,
            scopeModuleId: cleanModuleId || null,
            body: quoteBody,
            timestamp: Number(syntheticSentMessage?.timestamp || 0) || Math.floor(Date.now() / 1000),
            fromMe: true,
            hasMedia: false,
            type: 'interactive',
            ack: Number(syntheticSentMessage?.ack || 1),
            order: outgoingOrderPayload,
            location: null,
            quotedMessage: null,
            sentByUserId: 'patty',
            sentByName: metadata.assistantName,
            sentByRole: 'assistant',
            sentViaModuleId: cleanModuleId || null,
            patty: true,
            automationSource: 'patty_quote'
        });
    }

    if (typeof persistMessageHistory === 'function') {
        try {
            await persistMessageHistory(cleanTenantId, {
                msg: syntheticSentMessage || {
                    id: { _serialized: sentMessageId },
                    to: cleanChatId,
                    body: quoteBody,
                    fromMe: true,
                    type: 'interactive',
                    ack: 1,
                    timestamp: Math.floor(Date.now() / 1000),
                    hasMedia: false,
                    _data: { interactive }
                },
                senderMeta: null,
                fileMeta: null,
                order: outgoingOrderPayload,
                location: null,
                quotedMessage: null,
                agentMeta: {
                    sentByUserId: 'patty',
                    sentByName: metadata.assistantName,
                    sentByRole: 'assistant',
                    sentViaModuleId: cleanModuleId
                },
                moduleContext: { moduleId: cleanModuleId }
            });
        } catch (persistError) {
            console.warn('[Patty] quote card persistence skipped:', persistError?.message || persistError);
        }
    }

    const sentAt = new Date().toISOString();
    await quotesService.markQuoteSent(cleanTenantId, {
        quoteId: effectiveQuoteId,
        messageId: sentMessageId || null,
        updatedByUserId: null,
        sentAt
    });
    try {
        console.log('[Patty] marking chat as cotizado', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            quoteId: effectiveQuoteId,
            messageId: sentMessageId || null
        });
        const commercialResult = await chatCommercialStatusService.markQuoteSent(cleanTenantId, {
            chatId: cleanChatId,
            scopeModuleId: cleanModuleId,
            source: 'socket',
            reason: 'send_structured_quote_success',
            changedByUserId: null,
            at: sentAt,
            metadata: {
                quoteId: effectiveQuoteId,
                messageId: sentMessageId || null
            }
        });
        console.log('[Patty] cotizado done', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            quoteId: effectiveQuoteId,
            changed: Boolean(commercialResult?.changed),
            status: commercialResult?.row?.status || commercialResult?.status || null
        });
        if (commercialResult?.changed && typeof emitCommercialStatusUpdated === 'function') {
            emitCommercialStatusUpdated({
                tenantId: cleanTenantId,
                chatId: cleanChatId,
                scopeModuleId: cleanModuleId,
                result: commercialResult,
                source: 'patty.quote_generated'
            });
        }
    } catch (error) {
        console.warn(`[Patty] cotizado failed: ${error?.message || error}`);
    }

    console.log('[Patty] quote generated and sent', {
        tenantId: cleanTenantId,
        moduleId: cleanModuleId,
        chatId: cleanChatId,
        quoteId: effectiveQuoteId,
        messageId: sentMessageId || null,
        itemCount: summary.itemCount,
        totalPayable: summary.totalPayable
    });
    return {
        quoteId: effectiveQuoteId,
        messageId: sentMessageId || null,
        items,
        summary
    };
}

async function buildPattyContext(tenantId, moduleId, chatId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    const cleanChatId = normalizeChatId(chatId);
    const moduleConfig = await getModuleConfig(cleanTenantId, cleanModuleId);
    const assistantName = getAssistantDisplayNameFromModule(moduleConfig || {});
    const [scheduleState, basePrompt, quickReplies, customer, commercialStatus, origin, conversation, quote] = await Promise.all([
        resolveScheduleState(cleanTenantId, moduleConfig || {}),
        getBasePrompt(cleanTenantId),
        getQuickRepliesContext(cleanTenantId, cleanModuleId),
        getCustomerContext(cleanTenantId, cleanModuleId, cleanChatId),
        getCommercialStatusContext(cleanTenantId, cleanModuleId, cleanChatId),
        getOriginContext(cleanTenantId, cleanModuleId, cleanChatId),
        getConversationContext(cleanTenantId, cleanModuleId, cleanChatId),
        getActiveQuoteContext(cleanTenantId, cleanModuleId, cleanChatId)
    ]);
    const recentConversationText = [
        ...(Array.isArray(conversation.lines) ? conversation.lines : []),
        conversation.lastCustomerMessage || ''
    ].join('\n');
    const [catalog, zones] = await Promise.all([
        getCatalogContext(cleanTenantId, recentConversationText),
        getZonesContext(cleanTenantId, recentConversationText)
    ]);
    const labels = await getCustomerLabelsContext(cleanTenantId, customer.customerId);
    const recentOrder = formatOrderContext(conversation.recentOrder);
    const catalogText = lineList(catalog.lines);
    const mentionedCatalogText = lineList(catalog.mentionedDetails, '');
    if (String(process.env.PATTY_DEBUG || '').trim().toLowerCase() === 'true') {
        console.log('[Patty] catalog context preview', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chars: catalogText.length,
            preview: catalogText.slice(0, 200)
        });
    }
    const system = [
        basePrompt || 'Eres una asesora comercial experta de WhatsApp. Responde de forma breve, clara, humana y orientada a venta consultiva.',
        '',
        `Tu nombre visible es: ${assistantName}.`,
        `Modulo: ${moduleConfig?.name || cleanModuleId || 'sin modulo'}. ${scheduleState.label}.`,
        '',
        'INSTRUCCIÓN CRÍTICA: Si el contexto incluye una sección "⚠️ COTIZACIÓN ACTIVA", NO incluyas quoteRequest salvo que el último mensaje del cliente pida cambios explícitos en productos, cantidades o reemplazos.',
        '',
        'NEGOCIO / CATALOGO:',
        catalogText,
        mentionedCatalogText ? '\nPRODUCTOS MENCIONADOS EN CONVERSACION:' : '',
        mentionedCatalogText,
        '',
        'RESPUESTAS RAPIDAS PARA PATTY:',
        lineList(quickReplies),
        '',
        'ZONAS DE COBERTURA Y ENVIO:',
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
        '- Si el cliente claramente acepta o pide una cotizacion, agrega quoteRequest con products usando el titulo EXACTO del catalogo: {"products":[{"title":"Nombre exacto del producto","qty":1}]}.',
        '- quoteRequest NO debe incluir campo note. Solo incluir: {"products":[{"title":"Nombre exacto del producto","qty":1}]}.',
        '- Cuando el cliente pida ver productos o el catalogo, incluye catalogProducts con los SKUs relevantes. Maximo 5 productos por respuesta.',
        '- Cuando generes quoteRequest, messages[] solo debe tener un mensaje corto de intro maximo 1 linea. No repitas productos ni precios en el texto.',
        '- Cuando generes quoteRequest para modificar una cotizacion existente, products[] debe incluir TODOS los productos del resultado final, no solo los cambios. Ejemplo: si hay 2 productos actuales y el cliente agrega 1, products[] debe tener 3 items.',
        '- El title debe copiarse del catalogo tal como aparece despues del SKU entre corchetes. No inventes SKUs ni codigos. Si incluyes sku, debe ser exactamente uno de los SKUs entre corchetes.',
        '- Incluye quoteRequest solo cuando haya una aceptacion o solicitud clara de cotizacion.',
        '- Cuando el cliente mencione su ubicacion, busca en las zonas de cobertura y responde con las opciones de envio y metodos de pago disponibles para esa zona. Si la ubicacion no esta en cobertura, dilo claramente.',
        '- Cuando el cliente indique su ubicacion, identifica su zona de cobertura y menciona el costo de envio y metodos de pago disponibles para esa zona.',
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
            'INSTRUCCIÓN CRÍTICA: Si el contexto incluye "⚠️ COTIZACIÓN ACTIVA", NO incluyas quoteRequest salvo que este último mensaje pida cambios explícitos en productos, cantidades o reemplazos.',
            '',
            'Responde con JSON valido exactamente en este formato:',
            '{"messages":[{"text":"texto listo para enviar por WhatsApp","quotedMessageId":"message_id inbound relevante o null"}],"quoteRequest":{"products":[{"title":"Nombre exacto del producto del catalogo","qty":1}]},"catalogProducts":["SKU1","SKU2"]}',
            'quoteRequest NO debe incluir campo note. Solo incluir products con title y qty.',
            'Cuando el cliente pida ver productos o catalogo, incluye catalogProducts con SKUs reales del catalogo. Maximo 5 productos por respuesta.',
            'Cuando incluyas quoteRequest, messages[] debe contener solo una intro corta de maximo 1 linea. No repitas productos ni precios en el texto.',
            'Si quoteRequest modifica una cotizacion existente, products[] debe incluir TODOS los productos del resultado final, no solo el producto agregado/quitado/cambiado.',
            'Para quoteRequest usa el title exacto del catalogo. No uses SKUs inventados; si agregas sku, debe existir exactamente entre corchetes en el catalogo.',
            'Omite quoteRequest si no corresponde generar cotizacion.'
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
    const quoteRequest = normalizePattyQuoteRequest(rawSuggestion);
    const catalogProducts = normalizePattyCatalogProducts(rawSuggestion);
    const suggestion = messages.map((item) => item.text).join('\n\n');
    console.log('[Patty] suggestion generated', {
        tenantId: context.tenantId,
        moduleId: context.moduleId,
        chatId: context.chatId,
        suggestionChars: text(suggestion).length,
        messageCount: messages.length,
        hasQuoteRequest: Boolean(quoteRequest),
        catalogProductCount: catalogProducts.length,
        isAiError: text(rawSuggestion).startsWith('Error IA:') || lower(rawSuggestion).includes('ia no configurada')
    });
    return { ...context, suggestion, messages, quoteRequest, catalogProducts, rawSuggestion };
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

function extractInteractiveButtonId(metadata = {}) {
    const source = safeJsonObject(metadata);
    const candidates = [
        source.buttonReplyId,
        source.button_reply_id,
        source.buttonId,
        source.button_id,
        source.interactive?.button_reply?.id,
        source.interactive?.buttonReply?.id,
        source.button_reply?.id,
        source.raw?.interactive?.button_reply?.id,
        source.rawInteractive?.button_reply?.id
    ];
    return text(candidates.find((entry) => text(entry))) || '';
}

async function isQuoteButtonReplyMessage(tenantId, moduleId, chatId, messageId = '') {
    const cleanMessageId = text(messageId);
    if (!cleanMessageId) return false;
    try {
        const { rows } = await pgQuery(
            `SELECT body, message_type, metadata
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND message_id = $3
                AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($4))
              ORDER BY created_at DESC
              LIMIT 1`,
            [tenantId, normalizeChatId(chatId), cleanMessageId, lower(moduleId)]
        );
        const row = rows?.[0];
        if (!row) return false;
        const metadata = safeJsonObject(row.metadata);
        const body = lower(row.body);
        const buttonId = lower(extractInteractiveButtonId(metadata));
        const metaType = lower(metadata.type || metadata.messageType || metadata.message_type || metadata.interactive?.type);
        const messageType = lower(row.message_type);
        const isQuoteButton = buttonId.startsWith('quote_confirm_')
            || buttonId.startsWith('quote_change_')
            || body.startsWith('quote_confirm_')
            || body.startsWith('quote_change_');
        if (isQuoteButton) return true;
        return (messageType === 'interactive' || metaType === 'interactive' || metaType === 'button_reply')
            && (body.includes('confirmar') || body.includes('cambios'));
    } catch (error) {
        console.warn('[Patty] button_reply guard skipped:', error?.message || error);
        return false;
    }
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
    const inboundMessageId = text(options.messageId || options.message_id || options.inboundMessageId || options.inbound_message_id);
    const currentState = await getCurrentCommercialState(cleanTenantId, cleanModuleId, cleanChatId);
    const currentStatus = currentState.status;
    if (currentStatus === 'aceptado') {
        const acceptedMinutes = minutesSince(currentState.lastTransitionAt);
        if (acceptedMinutes === null || acceptedMinutes < ACCEPTED_REOPEN_MINUTES) {
            console.log('[Patty] skipped: order recently accepted', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                lastTransitionAt: currentState.lastTransitionAt || null,
                minutesSinceAccepted: acceptedMinutes
            });
            return;
        }
        console.log('[Patty] accepted window elapsed; intervention allowed', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            lastTransitionAt: currentState.lastTransitionAt || null,
            minutesSinceAccepted: acceptedMinutes
        });
    }
    if (await isQuoteButtonReplyMessage(cleanTenantId, cleanModuleId, cleanChatId, inboundMessageId)) {
        const hasAutomation = await hasActiveAutomationForStatus(cleanTenantId, cleanModuleId, currentStatus);
        if (hasAutomation) {
            console.log('[Patty] skipped: quote button_reply handled by automation', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                messageId: inboundMessageId,
                status: currentStatus
            });
            return;
        }
        console.log('[Patty] quote button_reply has no automation; continuing intervention', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            messageId: inboundMessageId,
            status: currentStatus || 'sin_estado'
        });
    }
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
    if (aiConfig.enablePatty === false) {
        console.log('[Patty] skipped: Patty disabled for module', {
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

    const configuredWaitSeconds = resolveWaitSeconds(aiConfig);
    const waitSeconds = mode === 'review' ? 0 : configuredWaitSeconds;
    const inboundAt = text(options.inboundAt) || new Date().toISOString();
    const debounceKey = buildDebounceKey(cleanTenantId, cleanModuleId, cleanChatId);
    const previousTimer = pattyChatDebounce.get(debounceKey);
    if (previousTimer) {
        clearTimeout(previousTimer);
        console.log('[Patty] debounce reset: previous timer cancelled', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            configuredWaitSeconds,
            waitSeconds
        });
    }
    console.log('[Patty] scheduled intervention', {
        tenantId: cleanTenantId,
        moduleId: cleanModuleId,
        chatId: cleanChatId,
        mode,
        configuredWaitSeconds,
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
            const hasCatalogProducts = Array.isArray(result.catalogProducts) && result.catalogProducts.length > 0;
            if (!messages.length && !result.quoteRequest && !hasCatalogProducts) {
                console.log('[Patty] skipped: empty suggestion', {
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    chatId: cleanChatId
                });
                return;
            }
            const assistantName = formatAssistantDisplayName(result.assistantName || DEFAULT_ASSISTANT_NAME);
            if (mode === 'review') {
                emitSuggestion(socketEmitter, cleanTenantId, {
                    chatId: cleanChatId,
                    moduleId: cleanModuleId,
                    suggestion: result.suggestion,
                    messages,
                    quoteRequest: result.quoteRequest || null,
                    catalogProducts: Array.isArray(result.catalogProducts) ? result.catalogProducts : [],
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
            if (hasCatalogProducts) {
                try {
                    await sleep(1200);
                    const catalogResult = await sendPattyCatalogProducts({
                        tenantId: cleanTenantId,
                        moduleId: cleanModuleId,
                        chatId: cleanChatId,
                        skus: result.catalogProducts,
                        assistantName
                    });
                    console.log('[Patty] catalog products sent', {
                        tenantId: cleanTenantId,
                        moduleId: cleanModuleId,
                        chatId: cleanChatId,
                        requested: result.catalogProducts.length,
                        sent: catalogResult.sent
                    });
                } catch (catalogError) {
                    console.warn('[Patty] catalog products failed; text messages already sent:', catalogError?.message || catalogError);
                }
            }
            if (result.quoteRequest) {
                try {
                    await sleep(1500);
                    await createAndSendPattyQuote({
                        tenantId: cleanTenantId,
                        moduleId: cleanModuleId,
                        chatId: cleanChatId,
                        assistantName,
                        quoteRequest: result.quoteRequest,
                        emitToRuntimeContext: socketEmitter,
                        emitCommercialStatusUpdated: options.emitCommercialStatusUpdated,
                        persistMessageHistory: options.persistMessageHistory
                    });
                } catch (quoteError) {
                    console.warn('[Patty] quote request failed; text messages already sent:', quoteError?.message || quoteError);
                }
            }
            console.log('[Patty] autonomous message sent', {
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                messageCount: messages.length,
                hasQuoteRequest: Boolean(result.quoteRequest)
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
