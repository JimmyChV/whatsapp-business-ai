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
const geoLocationService = require('../../tenant/services/geo-location.service');
const waModulesService = require('../../tenant/services/wa-modules.service');
const quotesService = require('../../tenant/services/quotes.service');
const chatCommercialStatusService = require('../../operations/services/chat-commercial-status.service');
const conversationOpsService = require('../../operations/services/conversation-ops.service');
const { getChatSuggestion } = require('../../operations/services/ai.service');
const waClient = require('./wa-provider.service');
const fs = require('fs');
const path = require('path');
const { resolveAndValidatePublicHost } = require('../../security/helpers/security-utils');
const { createMessageMediaAssetsHelpers } = require('../helpers/message-media-assets.helpers');
const { createLazySharpLoader } = require('../helpers/socket-runtime-bootstrap.helpers');
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
const LOCATION_DISAMBIGUATION_TTL_MS = 24 * 60 * 60 * 1000;
const PROGRAMMED_CHANGE_RESPONSE = 'Entendido, en un momento te confirmamos si podemos agregar eso a tu pedido 🙌';
const CREDIT_TOPIC_KEYWORDS = [
    'credito',
    'creditos',
    'cuota',
    'cuotas',
    'plazo',
    'plazos',
    'financiamiento',
    'fiado',
    'fin de mes',
    'resto',
    'abono',
    'abonos',
    'adelanto',
    'debe',
    'debo'
];
const UNVERIFIED_DATA_TOPIC_KEYWORDS = [
    'stock',
    'disponible',
    'disponibilidad',
    'queda',
    'quedan',
    'aroma',
    'aromas',
    'fragancia',
    'olor',
    'perfume',
    'descuento',
    'descuentos',
    'rebaja',
    'gratis',
    'sin costo',
    'precio especial',
    'fecha de llegada',
    'cuando llega',
    'cuando vuelve',
    'reposicion',
    'reingreso',
    'ingredientes',
    'composicion',
    'ficha tecnica',
    'caracteristicas'
];
const pattyChatDebounce = new Map();
const pattyInFlight = new Map();
const PATTY_UPLOADS_ROOT = path.resolve(String(process.env.SAAS_UPLOADS_DIR || path.resolve(__dirname, '../../../uploads')).trim());
const pattyProcessedMediaCache = new Map();
const {
    slugifyFileName,
    resolveCatalogProductMediaForSend
} = createMessageMediaAssetsHelpers({
    fs,
    path,
    URL,
    Buffer,
    resolveAndValidatePublicHost,
    getSharpImageProcessor: createLazySharpLoader(),
    SAAS_UPLOADS_ROOT: PATTY_UPLOADS_ROOT,
    QUICK_REPLY_MEDIA_MAX_BYTES: Math.max(256 * 1024, Number(process.env.QUICK_REPLY_MEDIA_MAX_BYTES || process.env.ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || (50 * 1024 * 1024))),
    QUICK_REPLY_MEDIA_TIMEOUT_MS: Math.max(2000, Number(process.env.QUICK_REPLY_MEDIA_TIMEOUT_MS || 15000)),
    processedMediaCache: pattyProcessedMediaCache
});

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

function formatElapsedSince(value) {
    const minutes = minutesSince(value);
    if (minutes === null) return 'sin fecha registrada';
    if (minutes < 1) return 'hace menos de 1 minuto';
    if (minutes < 60) return `hace ${minutes} minuto${minutes === 1 ? '' : 's'}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} hora${hours === 1 ? '' : 's'}`;
    const days = Math.floor(hours / 24);
    return `hace ${days} dia${days === 1 ? '' : 's'}`;
}

function normalizeProductLookupKey(value = '') {
    return lower(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

const CATALOG_QUERY_STOPWORDS = new Set([
    'hola',
    'buenas',
    'buenos',
    'dias',
    'tardes',
    'noches',
    'tienes',
    'tienen',
    'tendras',
    'tendra',
    'quiero',
    'quieres',
    'necesito',
    'necesita',
    'dame',
    'muestrame',
    'mostrar',
    'ver',
    'producto',
    'productos',
    'precio',
    'precios',
    'cuanto',
    'cuesta',
    'vale',
    'para',
    'con',
    'una',
    'uno',
    'unos',
    'unas',
    'los',
    'las',
    'del',
    'que',
    'hay',
    'por',
    'favor',
    'lavitat'
]);

const PRODUCT_TITLE_STOPWORDS = new Set([
    'lavitat',
    'producto',
    'productos',
    'pack',
    'und',
    'unidad',
    'unidades'
]);

function addCatalogKeywordVariant(out, value = '') {
    const clean = normalizeProductLookupKey(value);
    if (!clean || clean.length < 4 || CATALOG_QUERY_STOPWORDS.has(clean)) return;
    out.add(clean);
    if (clean.endsWith('es') && clean.length > 5) out.add(clean.slice(0, -2));
    if (clean.endsWith('s') && clean.length > 4) out.add(clean.slice(0, -1));
}

function extractCatalogSearchKeywords(value = '') {
    const normalized = normalizeProductLookupKey(value);
    const out = new Set();
    if (!normalized) return out;
    normalized.split(' ').forEach((word) => addCatalogKeywordVariant(out, word));
    if (normalized.includes('lava vajilla')) addCatalogKeywordVariant(out, 'lavavajillas');
    if (normalized.includes('quita mancha')) addCatalogKeywordVariant(out, 'quitamanchas');
    if (/\b(promocion|promociones|oferta|ofertas|kit|kits|combo|combos|paquete|paquetes)\b/.test(normalized)) {
        addCatalogKeywordVariant(out, 'kit');
        addCatalogKeywordVariant(out, 'combo');
        addCatalogKeywordVariant(out, 'paquete');
    }
    return out;
}

function isBroadCatalogQuestion(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    const broadCatalogIntent = normalized.includes('que productos')
        || normalized.includes('productos tiene')
        || normalized.includes('productos tienen')
        || normalized.includes('que venden')
        || normalized.includes('que manejan')
        || normalized.includes('catalogo')
        || normalized.includes('ver productos')
        || normalized.includes('muestrame productos')
        || normalized.includes('mostrarme productos');
    if (!broadCatalogIntent) return false;
    const specificProductIntent = /\b(detergente|lavavajillas|lavajillas|quitamanchas|quita\s+manchas|suavizante|sacagrasa|saca\s+grasa|limpiador|desinfectante|jabon|kit|ropa|cocina|bano|producto\s+\w{4,})\b/.test(normalized);
    return !specificProductIntent;
}

function extractProductSignificantWords(value = '') {
    return normalizeProductLookupKey(value)
        .split(' ')
        .map((word) => word.trim())
        .filter((word) => word.length >= 4 && !PRODUCT_TITLE_STOPWORDS.has(word));
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

function getLimaTimeOfDay(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Lima',
        hour: 'numeric',
        hour12: false
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    if (hour >= 5 && hour < 12) return 'mañana';
    if (hour >= 12 && hour < 18) return 'tarde';
    return 'noche';
}

function greetingTextForTimeOfDay(timeOfDay = '') {
    if (timeOfDay === 'mañana') return 'Buenos días';
    if (timeOfDay === 'tarde') return 'Buenas tardes';
    return 'Buenas noches';
}

function hasClientGreeting(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return /\b(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hi|hey|saludos|que tal|como estan|como estÃ¡n)\b/.test(normalized);
}

function isPureGreetingMessage(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized || !hasClientGreeting(value)) return false;
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length > 5) return false;
    if (mentionsProductIntent(value)) return false;
    if (isPureDeliveryOrPaymentQuestion(value)) return false;
    if (hasCoverageQuestionIntent(value)) return false;
    if (detectRequestedExternalCourier(value)) return false;
    if (isCreditOrInstallmentQuestion(value)) return false;
    return true;
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

function stripJsonCodeFences(value = '') {
    return text(value)
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
}

function repairKnownPattyJsonPatterns(value = '') {
    return repairMisplacedMessageFields(value)
        .replace(/("quotedMessageId"\s*:\s*(?:"[^"]*"|null|true|false|-?\d+(?:\.\d+)?))\s*\]/g, '$1}]')
        .replace(/("quoted_message_id"\s*:\s*(?:"[^"]*"|null|true|false|-?\d+(?:\.\d+)?))\s*\]/g, '$1}]');
}

function repairMisplacedMessageFields(value = '') {
    return text(value)
        .replace(/\}\s*,\s*"quotedMessageId"\s*:/g, ',"quotedMessageId":')
        .replace(/\}\s*,\s*"quoted_message_id"\s*:/g, ',"quoted_message_id":');
}

function extractBalancedJsonCandidate(value = '') {
    const raw = text(value);
    const start = raw.indexOf('{');
    if (start < 0) return '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
        const char = raw[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) return raw.slice(start, index + 1);
        }
    }
    return raw.slice(start).trim();
}

function balanceJsonObject(value = '') {
    return extractBalancedJsonCandidate(value);
}

function escapeControlCharsInsideStrings(value = '') {
    const raw = text(value);
    let out = '';
    let inString = false;
    let escaped = false;
    for (const char of raw) {
        if (!inString) {
            out += char;
            if (char === '"') inString = true;
            continue;
        }
        if (escaped) {
            out += char;
            escaped = false;
            continue;
        }
        if (char === '\\') {
            out += char;
            escaped = true;
            continue;
        }
        if (char === '"') {
            out += char;
            inString = false;
            continue;
        }
        if (char === '\n') out += '\\n';
        else if (char === '\r') out += '\\r';
        else if (char === '\t') out += '\\t';
        else if (char.charCodeAt(0) < 32) out += ' ';
        else out += char;
    }
    return out;
}

function repairJsonCandidate(value = '') {
    let candidate = repairKnownPattyJsonPatterns(stripJsonCodeFences(value)).replace(/,\s*([}\]])/g, '$1');
    if (!candidate) return '';
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const char of candidate) {
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            stack.push('}');
        } else if (char === '[') {
            stack.push(']');
        } else if ((char === '}' || char === ']') && stack[stack.length - 1] === char) {
            stack.pop();
        }
    }
    if (inString) candidate += '"';
    while (stack.length) candidate += stack.pop();
    return candidate;
}

function extractJsonObject(value = '') {
    const raw = text(value);
    if (!raw) return null;
    const stripped = stripJsonCodeFences(raw);
    const balancedCandidate = balanceJsonObject(stripped) || balanceJsonObject(raw);
    const regexCandidate = raw.match(/\{[\s\S]*\}/)?.[0];
    const sourceCandidates = [
        raw,
        stripped,
        balancedCandidate,
        regexCandidate
    ].filter(Boolean);
    const candidates = [];
    for (const source of sourceCandidates) {
        const repaired = repairKnownPattyJsonPatterns(source);
        const escaped = escapeControlCharsInsideStrings(source);
        const escapedRepaired = escapeControlCharsInsideStrings(repaired);
        candidates.push(
            source,
            repaired,
            escaped,
            escapedRepaired,
            balanceJsonObject(source),
            balanceJsonObject(repaired),
            repairJsonCandidate(source),
            repairJsonCandidate(repaired),
            repairJsonCandidate(escapedRepaired)
        );
    }
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        const sliced = raw.slice(firstBrace, lastBrace + 1);
        const repaired = repairKnownPattyJsonPatterns(sliced);
        candidates.push(sliced, repaired, escapeControlCharsInsideStrings(repaired), repairJsonCandidate(repaired));
    }
    for (const candidate of Array.from(new Set(candidates))) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch (error) {
            // Try the next candidate.
        }
    }
    console.warn('[Patty] JSON parse failed, using raw text fallback');
    console.warn('[Patty] JSON parse failed raw:', raw);
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

function normalizeQuoteIntroMessages(messages = []) {
    const first = Array.isArray(messages) ? messages.find((item) => text(item?.text)) : null;
    const firstLine = text(first?.text || '').split(/\r?\n/).map((line) => text(line)).filter(Boolean)[0] || '';
    const looksDetailed = /(?:^|\n)\s*[-*•]|\bS\/\s*\d|\bsubtotal\b|\btotal\b|\bprecio\b|\bproducto\b/i.test(text(first?.text || ''));
    const intro = firstLine && !looksDetailed
        ? firstLine.slice(0, 180)
        : 'Aquí va tu cotización actualizada 👇';
    return [{
        text: intro,
        quotedMessageId: first?.quotedMessageId || null
    }];
}

function sanitizePattyMessageQuotes(messages = [], pendingMessageIds = []) {
    const allowed = new Set((Array.isArray(pendingMessageIds) ? pendingMessageIds : []).map(text).filter(Boolean));
    const source = Array.isArray(messages) ? messages : [];
    if (source.length <= 1) {
        return source.map((item) => ({ ...item, quotedMessageId: null }));
    }
    return source.map((item) => {
        const quotedMessageId = text(item?.quotedMessageId || '');
        return {
            ...item,
            quotedMessageId: allowed.has(quotedMessageId) ? quotedMessageId : null
        };
    });
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

function getModuleDisplayNameFromConfig(moduleConfig = {}) {
    return text(
        moduleConfig?.name
        || moduleConfig?.moduleName
        || moduleConfig?.module_name
        || moduleConfig?.metadata?.moduleName
        || moduleConfig?.metadata?.module_name
        || moduleConfig?.moduleId
        || moduleConfig?.module_id
    );
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

function buildCatalogLine(row = {}) {
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
}

function buildCatalogProductDetails(row = {}) {
    const metadata = safeJsonObject(row.metadata);
    const details = [
        text(metadata.description || metadata.descripcion || metadata.shortDescription || metadata.short_description),
        text(metadata.components || metadata.componentes || metadata.includedItems || metadata.included_items || metadata.includes || metadata.incluye),
        text(metadata.variants || metadata.variantes),
        text(metadata.benefits || metadata.beneficios),
        text(metadata.usage || metadata.uso)
    ].filter(Boolean).join(' | ');
    const sku = text(row.item_id).toUpperCase();
    const title = text(row.title) || sku || 'Producto';
    return `  [${sku}] ${title}${details ? `: ${details}` : ': Sin detalle adicional registrado.'}`;
}

async function getRecentlySentCatalogSkuSet(tenantId, moduleId = '', chatId = '', catalogRows = []) {
    const cleanChatId = normalizeChatId(chatId);
    if (!cleanChatId || !Array.isArray(catalogRows) || !catalogRows.length) return new Set();
    try {
        const { rows } = await pgQuery(
            `SELECT body
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND COALESCE(from_me, FALSE) = TRUE
                AND created_at >= NOW() - INTERVAL '20 minutes'
                AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
              ORDER BY created_at DESC
              LIMIT 40`,
            [tenantId, cleanChatId, lower(moduleId)]
        );
        const recentTextUpper = (rows || []).map((row) => text(row.body).toUpperCase()).join('\n');
        const recentTextKey = normalizeProductLookupKey((rows || []).map((row) => text(row.body)).join('\n'));
        const sent = new Set();
        catalogRows.forEach((row) => {
            const sku = text(row.item_id).toUpperCase();
            const titleKey = normalizeProductLookupKey(row.title);
            if (!sku) return;
            if (recentTextUpper.includes(sku) || (titleKey && recentTextKey.includes(titleKey))) {
                sent.add(sku);
            }
        });
        return sent;
    } catch (error) {
        console.warn('[Patty] recent catalog dedupe skipped:', error?.message || error);
        return new Set();
    }
}

async function getCatalogContext(tenantId, recentConversationText = '', lastCustomerMessage = '') {
    const { rows } = await pgQuery(
        `SELECT item_id, title, price, metadata
           FROM catalog_items
          WHERE tenant_id = $1
          LIMIT 120`,
        [tenantId]
    );
    const intentKeywords = extractCatalogSearchKeywords(lastCustomerMessage || recentConversationText);
    let relevantRows = [];
    if (intentKeywords.size) {
        const keywords = Array.from(intentKeywords).slice(0, 8);
        const clauses = keywords.map((_, index) => `title ILIKE $${index + 2}`).join(' OR ');
        try {
            const relevantResult = await pgQuery(
                `SELECT item_id, title, price, metadata
                   FROM catalog_items
                  WHERE tenant_id = $1
                    AND (${clauses})
                  LIMIT 30`,
                [tenantId, ...keywords.map((keyword) => `%${keyword}%`)]
            );
            relevantRows = Array.isArray(relevantResult.rows) ? relevantResult.rows : [];
        } catch (error) {
            relevantRows = [];
        }
        const existing = new Set(relevantRows.map((row) => text(row.item_id).toUpperCase()).filter(Boolean));
        (Array.isArray(rows) ? rows : [])
            .filter((row) => {
                const titleKey = normalizeProductLookupKey(row.title);
                return titleKey && keywords.some((keyword) => titleKey.includes(keyword));
            })
            .forEach((row) => {
                const sku = text(row.item_id).toUpperCase();
                if (sku && !existing.has(sku)) {
                    relevantRows.push(row);
                    existing.add(sku);
                }
            });
    }
    const relevantLines = relevantRows
        .map((row) => buildCatalogLine(row))
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)
        .slice(0, 12)
        .map((item) => item.line);
    const mentionedSkus = extractMentionedCatalogSkus(recentConversationText, rows);
    const lines = rows
        .map((row) => buildCatalogLine(row))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((item) => item.line);
    const mentionedDetails = rows
        .filter((row) => mentionedSkus.has(text(row.item_id).toUpperCase()))
        .slice(0, 10)
        .map((row) => buildCatalogProductDetails(row));
    return { lines, relevantLines, mentionedDetails };
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
        `SELECT item_id, title, price, image_url, metadata
           FROM catalog_items
          WHERE tenant_id = $1
            AND UPPER(item_id) IN (${placeholders})`,
        [tenantId, ...cleanSkus]
    );
    const bySku = new Map((rows || []).map((row) => [text(row.item_id).toUpperCase(), row]));
    return cleanSkus.map((sku) => bySku.get(sku)).filter(Boolean);
}

async function filterCatalogProductsForContext(tenantId, skus = [], lastCustomerMessage = '', responseText = '', options = {}) {
    const cleanSkus = Array.from(new Set((Array.isArray(skus) ? skus : [])
        .map((sku) => text(sku).toUpperCase())
        .filter(Boolean)))
        .slice(0, 5);
    if (!cleanSkus.length) return [];
    if (isBroadCatalogQuestion(lastCustomerMessage)) {
        console.log('[Patty] catalog products skipped for broad catalog question', {
            tenantId,
            requested: cleanSkus,
            lastCustomerMessage: text(lastCustomerMessage).slice(0, 120)
        });
        return [];
    }
    const rows = await getCatalogRowsBySkus(tenantId, cleanSkus);
    if (!rows.length) return [];
    const lastMessageKeywords = extractCatalogSearchKeywords(lastCustomerMessage);
    const responseKey = normalizeProductLookupKey(responseText);
    const quotedReferenceUpper = text(options.quotedReferenceContext).toUpperCase();
    const recentlySent = await getRecentlySentCatalogSkuSet(tenantId, options.moduleId, options.chatId, rows);
    const allowed = [];
    const allowedSet = new Set();
    const skippedRepeated = [];
    rows.forEach((row) => {
        const sku = text(row.item_id).toUpperCase();
        const titleKey = normalizeProductLookupKey(row.title);
        const productWords = extractProductSignificantWords(row.title);
        const matchesLastMessage = Array.from(lastMessageKeywords).some((keyword) => titleKey.includes(keyword));
        const appearsInResponse = responseKey.includes(sku.toLowerCase())
            || productWords.some((word) => responseKey.includes(word));
        const alreadyReferenced = quotedReferenceUpper.includes(sku);
        const recentlySentSameProduct = recentlySent.has(sku);
        if (sku && (alreadyReferenced || recentlySentSameProduct)) {
            skippedRepeated.push(sku);
            return;
        }
        if (sku && !allowedSet.has(sku) && (matchesLastMessage || appearsInResponse)) {
            allowed.push(sku);
            allowedSet.add(sku);
        }
    });
    if (allowed.length !== cleanSkus.length) {
        console.log('[Patty] catalog products filtered', {
            tenantId,
            requested: cleanSkus,
            allowed
        });
    }
    if (skippedRepeated.length) {
        console.log('[Patty] catalog products deduped', {
            tenantId,
            requested: cleanSkus,
            skippedRepeated,
            allowed
        });
    }
    return allowed;
}

async function sendPattyCatalogProducts({ tenantId, moduleId = '', chatId, skus = [], assistantName = DEFAULT_ASSISTANT_NAME, moduleName = '' } = {}) {
    const assistantDisplayName = formatAssistantDisplayName(assistantName);
    const cleanModuleName = text(moduleName);
    const rows = await getCatalogRowsBySkus(tenantId, skus);
    if (!rows.length) return { sent: 0 };
    let sent = 0;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const caption = buildPattyCatalogProductCaption(row);
        const imageUrl = text(row.image_url || row.imageUrl || safeJsonObject(row.metadata).imageUrl || safeJsonObject(row.metadata).image_url);
        const metadata = {
            metadata: {
                agentMeta: {
                    sentByUserId: 'patty',
                    sentByName: assistantDisplayName,
                    sentByRole: 'assistant',
                    sentViaModuleId: lower(moduleId),
                    sentViaModuleName: cleanModuleName || null
                },
                patty: true,
                automationSource: 'patty_catalog_product',
                catalogProduct: {
                    sku: text(row.item_id).toUpperCase(),
                    title: text(row.title)
                }
            }
        };
        let sentWithImage = false;
        if (imageUrl) {
            try {
                const compatibleMedia = await resolveCatalogProductMediaForSend(imageUrl, {
                    tenantId,
                    maxBytes: Number(process.env.CATALOG_IMAGE_MAX_BYTES || 4 * 1024 * 1024),
                    timeoutMs: Number(process.env.CATALOG_IMAGE_TIMEOUT_MS || 7000)
                });
                if (compatibleMedia) {
                    const baseName = slugifyFileName(row.title || row.item_id || 'producto');
                    const filename = `${baseName || 'producto'}.${compatibleMedia.extension || 'jpg'}`;
                    await waClient.sendMedia(
                        chatId,
                        compatibleMedia.mediaData,
                        compatibleMedia.mimetype,
                        filename,
                        caption,
                        false,
                        null,
                        metadata
                    );
                    sentWithImage = true;
                }
            } catch (error) {
                console.warn('[Patty] catalog product image send skipped:', error?.message || error);
            }
        }
        if (!sentWithImage) {
            await waClient.sendMessage(chatId, caption, metadata);
        }
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

function getActiveShippingOptions(rule = {}) {
    const options = Array.isArray(rule.shippingOptions || rule.shipping_options)
        ? (rule.shippingOptions || rule.shipping_options)
        : [];
    return options.filter((item) => item && item.is_active !== false && item.isActive !== false);
}

function getPrimaryShippingOption(rule = {}) {
    const activeOptions = getActiveShippingOptions(rule);
    return activeOptions[0] || null;
}

function formatShippingOptionLabel(option = null) {
    if (!option) return 'Sin envio configurado';
    return lower(option.type) === 'courier'
        ? `Courier ${text(option.label) || 'Courier'}`
        : (text(option.label) || 'Delivery propio');
}

function getShippingType(option = null) {
    return lower(option?.type) === 'courier' ? 'courier' : 'delivery';
}

function getShippingDisplayName(option = null) {
    const clean = text(option?.label);
    if (clean) return clean;
    return getShippingType(option) === 'courier' ? 'Courier' : 'Delivery propio';
}

function formatDeliveryTimeLabel(value = '') {
    const clean = text(value);
    if (!clean) return 'Por confirmar';
    const normalized = normalizeLocationLookup(clean);
    if (/\b(dia|dias|habil|habiles|hora|horas)\b/.test(normalized)) return clean;
    if (/\d/.test(clean)) return `${clean} días hábiles`;
    return clean;
}

function getZonePaymentLabels(rule = {}) {
    const payments = safeJsonObject(rule.paymentMethods || rule.payment_methods);
    return [
        payments.yape ? 'Yape' : '',
        payments.plin ? 'Plin' : '',
        payments.bank_transfer || payments.bankTransfer ? 'Transferencia bancaria' : '',
        payments.credit_card || payments.creditCard ? 'Tarjeta de crédito' : '',
        payments.cash ? 'Efectivo' : ''
    ].filter(Boolean);
}

function getZonePaymentMethodFlags(rule = {}) {
    const payments = safeJsonObject(rule.paymentMethods || rule.payment_methods);
    return {
        yape: payments.yape === true,
        plin: payments.plin === true,
        bankTransfer: payments.bank_transfer === true || payments.bankTransfer === true,
        creditCard: payments.credit_card === true || payments.creditCard === true,
        cash: payments.cash === true
    };
}

function hasExplicitQuoteQuantity(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    if (/\b\d+\b/.test(normalized)) return true;
    return /\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|unidad|unidades|uds|und)\b/.test(normalized);
}

function isAmbiguousQuoteReference(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return isDeicticProductReference(normalized)
        || /\bme\s+interesa\b/.test(normalized)
        || /\blo\s+quiero\b/.test(normalized)
        || /\bla\s+quiero\b/.test(normalized);
}

function isDeicticProductReference(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return normalized === 'este'
        || normalized === 'ese'
        || normalized === 'esa'
        || normalized === 'esto'
        || normalized === 'eso'
        || /\b(este|ese|esa)\s+producto\b/.test(normalized)
        || /\b(esta|esa)\s+opcion\b/.test(normalized)
        || /\bel\s+primero\b/.test(normalized)
        || /\bla\s+primera\b/.test(normalized)
        || /\bel\s+segundo\b/.test(normalized)
        || /\bla\s+segunda\b/.test(normalized);
}

function shouldBlockQuoteForMissingQuantity(quoteRequest, lastCustomerMessage = '') {
    const products = Array.isArray(quoteRequest?.products) ? quoteRequest.products : [];
    if (!products.length) return false;
    if (!isAmbiguousQuoteReference(lastCustomerMessage)) return false;
    return !hasExplicitQuoteQuantity(lastCustomerMessage);
}

function getZonePaymentModalityFlags(rule = {}) {
    const modality = safeJsonObject(rule.paymentModality || rule.payment_modality);
    return {
        advance: modality.advance !== false,
        cashOnDelivery: modality.cash_on_delivery === true || modality.cashOnDelivery === true
    };
}

function getZonePaymentModalityText(rule = {}) {
    const modality = getZonePaymentModalityFlags(rule);
    const advance = modality.advance === true;
    const cashOnDelivery = modality.cashOnDelivery === true;
    if (advance && cashOnDelivery) return 'anticipado o contraentrega según tu preferencia';
    if (cashOnDelivery) return 'contraentrega';
    if (advance) return 'pago anticipado';
    return 'modalidad por confirmar';
}

function formatSpanishList(items = [], connector = 'o') {
    const cleanItems = (Array.isArray(items) ? items : []).map(text).filter(Boolean);
    if (!cleanItems.length) return '';
    if (cleanItems.length === 1) return cleanItems[0];
    if (cleanItems.length === 2) return `${cleanItems[0]} ${connector} ${cleanItems[1]}`;
    return `${cleanItems.slice(0, -1).join(', ')} ${connector} ${cleanItems[cleanItems.length - 1]}`;
}

function buildZonePaymentPhrase(summary = {}, { sentenceStart = true } = {}) {
    const paymentText = formatSpanishList(summary.paymentLabels || [], 'o') || 'métodos por confirmar';
    const modalityText = text(summary.paymentModalityText);
    const prefix = sentenceStart ? 'Puedes' : 'puedes';
    return `${prefix} pagar con ${paymentText}${modalityText ? `, ${modalityText}` : ''} 😊`;
}

function getZoneCoverageDescription(rule = {}) {
    const meta = safeJsonObject(rule.rulesJson || rule.rules_json || rule.metadata);
    const coverageParts = [
        ...ensureTextArray(meta.districts || meta.districtNames || meta.distritos),
        ...ensureTextArray(meta.provinces || meta.provinceNames || meta.provincias),
        ...ensureTextArray(meta.departments || meta.departmentNames || meta.departamentos)
    ];
    return text(meta.description || meta.notes)
        || Array.from(new Set(coverageParts)).join(', ')
        || 'Cobertura no detallada';
}

function buildZoneShippingSummary(rule = {}, subtotal = 0) {
    const primaryShipping = getPrimaryShippingOption(rule);
    const cost = primaryShipping ? money(primaryShipping.cost) : null;
    const freeFrom = primaryShipping ? money(primaryShipping.free_from ?? primaryShipping.freeFrom) : null;
    const deliveryCost = cost || 0;
    const isFree = deliveryCost <= 0 || (freeFrom !== null && subtotal >= freeFrom);
    return {
        zoneName: text(rule.name) || 'Zona',
        shippingType: getShippingType(primaryShipping),
        shippingDisplayName: getShippingDisplayName(primaryShipping),
        shippingLabel: formatShippingOptionLabel(primaryShipping),
        cost,
        costText: cost !== null ? `S/ ${cost.toFixed(2)}` : 'Por confirmar',
        freeFrom,
        freeFromText: freeFrom !== null ? `S/ ${freeFrom.toFixed(2)}` : 'No aplica',
        estimatedTime: formatDeliveryTimeLabel(primaryShipping?.estimated_time || primaryShipping?.estimatedTime || ''),
        paymentLabels: getZonePaymentLabels(rule),
        paymentMethods: getZonePaymentMethodFlags(rule),
        paymentModality: getZonePaymentModalityFlags(rule),
        paymentModalityText: getZonePaymentModalityText(rule),
        coverage: getZoneCoverageDescription(rule),
        activeShippingOptions: getActiveShippingOptions(rule),
        deliveryAmount: isFree ? 0 : deliveryCost,
        deliveryFree: isFree
    };
}

function resolveZoneDelivery(rule = null, subtotal = 0) {
    if (!rule) return { deliveryAmount: 0, deliveryFree: true, zoneName: null };
    const summary = buildZoneShippingSummary(rule, subtotal);
    return {
        deliveryAmount: summary.deliveryAmount,
        deliveryFree: summary.deliveryFree,
        zoneName: summary.zoneName,
        shippingLabel: summary.shippingLabel
    };
}

function formatResolvedLocation(location = {}) {
    const parts = [
        location?.district,
        location?.province,
        location?.department
    ].map(text).filter(Boolean);
    return parts.length ? parts.join(', ') : 'Ubicacion no reconocida';
}

function formatCustomerLocationLabel(location = {}, fallback = '') {
    const district = text(location?.district);
    const province = text(location?.province);
    const department = text(location?.department);
    const raw = district && province
        ? `${district}, ${province}`
        : (province && department
            ? `${province}, ${department}`
            : (department || text(fallback) || 'tu zona'));
    return raw
        .toLowerCase()
        .split(/\s+/)
        .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : '')
        .join(' ');
}

function formatLocationOptionPart(value = '') {
    return text(value)
        .toLowerCase()
        .split(/\s+/)
        .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : '')
        .join(' ');
}

function formatAmbiguousLocationCandidates(location = {}) {
    const candidates = Array.isArray(location?.candidates) ? location.candidates : [];
    if (!candidates.length) return '  - Sin candidatos detallados en el maestro geografico';
    return candidates
        .slice(0, 8)
        .map((candidate) => {
            const typeLabel = candidate.type === 'department'
                ? 'Departamento'
                : (candidate.type === 'province' ? 'Provincia' : 'Distrito');
            const parts = [
                candidate.district,
                candidate.province,
                candidate.department
            ].map(text).filter(Boolean);
            return `  - ${typeLabel}: ${parts.join(', ') || candidate.name || 'Ubicacion'}`;
        })
        .join('\n');
}

function normalizeLocationCandidate(candidate = {}) {
    return {
        district: text(candidate.district || (candidate.type === 'district' ? candidate.name : '')),
        province: text(candidate.province || (candidate.type === 'province' ? candidate.name : '')),
        department: text(candidate.department || (candidate.type === 'department' ? candidate.name : '')),
        locationId: text(candidate.locationId || candidate.location_id || candidate.id || ''),
        type: text(candidate.type || ''),
        name: text(candidate.name || ''),
        ubigeo: text(candidate.ubigeo || '')
    };
}

function normalizeLocationCandidates(candidates = []) {
    return (Array.isArray(candidates) ? candidates : [])
        .map(normalizeLocationCandidate)
        .filter((candidate) => candidate.district || candidate.province || candidate.department || candidate.name)
        .slice(0, 12);
}

function buildLocationFromCandidate(candidate = {}, matchedText = '') {
    const clean = normalizeLocationCandidate(candidate);
    return {
        district: clean.district || null,
        province: clean.province || null,
        department: clean.department || null,
        confidence: 'exact',
        matchedType: clean.district ? 'district' : (clean.province ? 'province' : (clean.department ? 'department' : null)),
        matchedText: text(matchedText || clean.name || clean.district || clean.province || clean.department) || null,
        locationId: clean.locationId || null,
        ubigeo: clean.ubigeo || null,
        candidates: []
    };
}

function formatDisambiguationCandidateLabel(candidate = {}) {
    const clean = normalizeLocationCandidate(candidate);
    const district = formatLocationOptionPart(clean.district || clean.name);
    const province = formatLocationOptionPart(clean.province);
    const department = formatLocationOptionPart(clean.department);
    const sameProvinceDepartment = province
        && department
        && normalizeLocationLookup(province) === normalizeLocationLookup(department);

    if (district) {
        if (province && department) {
            return sameProvinceDepartment
                ? `${district}, ${province}`
                : `${district}, ${province}, ${department}`;
        }
        if (province) return `${district}, ${province}`;
        if (department) return `${district}, ${department}`;
        return district;
    }
    if (province) {
        return department
            ? `Provincia de ${province}, ${department}`
            : `Provincia de ${province}`;
    }
    if (department) return `Departamento de ${department}`;
    return 'esa ubicacion';
}

function getAmbiguousLocationName(candidates = [], matchedText = '') {
    const cleanMatchedText = formatLocationOptionPart(matchedText);
    if (cleanMatchedText) return cleanMatchedText;
    const cleanCandidates = normalizeLocationCandidates(candidates);
    const names = cleanCandidates
        .map((candidate) => formatLocationOptionPart(candidate.district || candidate.name || candidate.province || candidate.department))
        .filter(Boolean);
    const first = names[0] || 'lugar';
    return names.every((name) => normalizeLocationLookup(name) === normalizeLocationLookup(first))
        ? first
        : first;
}

function formatDisambiguationProvinceContext(candidate = {}) {
    const clean = normalizeLocationCandidate(candidate);
    const province = formatLocationOptionPart(clean.province);
    const department = formatLocationOptionPart(clean.department);
    if (province && department && normalizeLocationLookup(province) !== normalizeLocationLookup(department)) {
        return `${province}, ${department}`;
    }
    return province || department || formatDisambiguationCandidateLabel(clean);
}

function getZoneRuleLocationValues(rule = {}, keys = []) {
    const meta = safeJsonObject(rule.rulesJson || rule.rules_json || rule.metadata);
    return keys
        .flatMap((key) => ensureTextArray(meta[key]))
        .map(normalizeLocationLookup)
        .filter(Boolean);
}

function candidateZoneRelevance(candidate = {}, zoneRules = []) {
    const clean = normalizeLocationCandidate(candidate);
    const district = normalizeLocationLookup(clean.district);
    const province = normalizeLocationLookup(clean.province);
    const department = normalizeLocationLookup(clean.department);
    let score = 0;
    (Array.isArray(zoneRules) ? zoneRules : []).forEach((rule) => {
        const districts = getZoneRuleLocationValues(rule, ['districts', 'districtNames', 'distritos', 'district']);
        const provinces = getZoneRuleLocationValues(rule, ['provinces', 'provinceNames', 'provincias', 'province']);
        const departments = getZoneRuleLocationValues(rule, ['departments', 'departmentNames', 'departamentos', 'department']);
        if (district && districts.includes(district)) score = Math.max(score, 30);
        if (province && provinces.includes(province)) score = Math.max(score, 20);
        if (department && departments.includes(department)) score = Math.max(score, 10);
    });
    return score;
}

function rankLocationDisambiguationCandidates(candidates = [], zoneRules = []) {
    return normalizeLocationCandidates(candidates)
        .map((candidate, index) => ({
            candidate,
            index,
            score: candidateZoneRelevance(candidate, zoneRules)
        }))
        .sort((a, b) => (b.score - a.score) || (a.index - b.index))
        .map((item) => item.candidate);
}

function buildLocationDisambiguationQuestion(candidates = [], zoneRules = [], matchedText = '') {
    const cleanCandidates = rankLocationDisambiguationCandidates(candidates, zoneRules).slice(0, 5);
    const locationName = getAmbiguousLocationName(cleanCandidates, matchedText);
    if (cleanCandidates.length === 2) {
        return [
            `Mmm, tenemos dos ${locationName} en nuestro sistema 🤔`,
            `¿Te refieres al de ${formatDisambiguationProvinceContext(cleanCandidates[0])} o al de ${formatDisambiguationProvinceContext(cleanCandidates[1])}?`
        ].join('\n');
    }
    if (cleanCandidates.length > 0) {
        const lines = cleanCandidates.map((candidate, index) => `${index + 1}. ${formatDisambiguationCandidateLabel(candidate)}`);
        return [
            `Encontré varios lugares llamados ${locationName} 🤔`,
            '¿Cuál es el tuyo?',
            ...lines,
        ].join('\n');
    }
    return 'No logro ubicar eso con certeza. ¿Puedes ser más específico?';
}

function buildNaturalLocationDisambiguationQuestion(candidates = [], zoneRules = [], matchedText = '') {
    const cleanCandidates = rankLocationDisambiguationCandidates(candidates, zoneRules).slice(0, 5);
    const locationName = getAmbiguousLocationName(cleanCandidates, matchedText);
    const labels = cleanCandidates.map(formatDisambiguationCandidateLabel);
    if (cleanCandidates.length === 2) {
        return [
            'Para confirmarte el reparto sin equivocarme:',
            `Â¿Te refieres a ${labels[0]}? Tambien encontre ${labels[1]}.`
        ].join('\n');
    }
    if (cleanCandidates.length > 0) {
        const lines = labels.slice(1).map((label, index) => `${index + 1}. ${label}`);
        return [
            `Puede referirse a mas de una zona llamada ${locationName}.`,
            `Â¿Es ${labels[0]}?`,
            ...(lines.length ? ['Tambien encontre:', ...lines] : []),
            'Dime cual es y te confirmo el reparto.'
        ].join('\n');
    }
    return 'No logro ubicar eso con certeza. Â¿Puedes ser mÃ¡s especÃ­fico?';
}

function buildConversationalLocationDisambiguationQuestion(candidates = [], zoneRules = [], matchedText = '') {
    const cleanCandidates = rankLocationDisambiguationCandidates(candidates, zoneRules).slice(0, 5);
    const locationName = getAmbiguousLocationName(cleanCandidates, matchedText);
    const labels = cleanCandidates.map(formatDisambiguationCandidateLabel);
    if (cleanCandidates.length === 2) {
        return [
            'Para confirmarte bien el reparto 😊',
            `¿Te refieres a ${labels[0]} o a ${labels[1]}?`
        ].join('\n');
    }
    if (cleanCandidates.length > 0) {
        const lines = labels.slice(1).map((label, index) => `${index + 1}. ${label}`);
        return [
            'Para no darte un dato equivocado 😊',
            `¿Te refieres a ${labels[0]}?`,
            ...(lines.length ? [`También encontré otros ${locationName}:`, ...lines] : []),
            'Dime cuál es y te confirmo el reparto.'
        ].join('\n');
    }
    return 'No logro ubicar eso con certeza. ¿Me indicas el distrito o provincia?';
}

function isLocationDisambiguationTopicChange(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return /\b(precio|precios|producto|productos|cuanto cuesta|quiero|cotiza|cotizame|tienes|tienen|detergente|lavavajillas|informacion|catalogo)\b/.test(normalized);
}

const NEW_LOCATION_PATTERNS = [
    /\by\s+en\b/i,
    /\by\s+para\b/i,
    /\bque\s+tal\s+en\b/i,
    /\bllegan\s+a\b/i,
    /\benvio\s+a\b/i,
    /\bdelivery\s+a\b/i,
    /\bestoy\s+en\b/i,
    /\bvivo\s+en\b/i,
    /\bsoy\s+de\b/i,
    /\bpara\b.*\?/i,
    /\btambien\s+en\b/i,
    /\bahora\s+en\b/i
];

function looksLikeNewLocationQuestion(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return NEW_LOCATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isSubdistrictClarification(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return /\b(urbanizacion|urb|barrio|sector|zona|centro\s+poblado|caserio|anexo|referencia|asentamiento|aa\s*hh|habilitacion)\b/.test(normalized);
}

function extractSubdistrictClarificationLabel(value = '') {
    const clean = text(value).replace(/[¿?!.]+$/g, '').trim();
    if (!clean) return 'ese lugar';
    const keyword = '(?:urbanizaci[oó]n|urb\\.?|barrio|sector|zona|centro\\s+poblado|caser[ií]o|anexo|referencia|asentamiento|aa\\.?hh\\.?|habilitaci[oó]n)';
    const beforeKeyword = clean.match(new RegExp(`^(.+?)\\s+(?:es|queda|esta|está|es una|es un)\\s+(?:una?\\s+)?${keyword}\\b`, 'i'));
    if (beforeKeyword?.[1]) return text(beforeKeyword[1]) || 'ese lugar';
    const afterPrep = clean.match(new RegExp(`\\b(?:en|de|para|a)\\s+(.+?)(?:\\s+(?:es|queda|esta|está)\\s+(?:una?\\s+)?${keyword}\\b|$)`, 'i'));
    if (afterPrep?.[1]) return text(afterPrep[1]) || 'ese lugar';
    return clean.length <= 60 ? clean : 'ese lugar';
}

function buildSubdistrictClarificationResponse(value = '') {
    const label = extractSubdistrictClarificationLabel(value);
    return `Entendido, ${label} puede ser una urbanizacion o sector. ¿Me indicas el distrito o ciudad donde esta ubicado? Así verifico si tenemos cobertura 😊`;
}

function candidateMatchKeys(candidate = {}) {
    const clean = normalizeLocationCandidate(candidate);
    return [
        clean.district,
        clean.province,
        clean.department,
        clean.name
    ]
        .map(normalizeLocationLookup)
        .filter((item) => item && item.length >= 4);
}

function extractDisambiguationOptionNumber(answer = '') {
    const normalized = normalizeLocationLookup(answer);
    if (!normalized) return null;
    const numeric = normalized.match(/\b(?:opcion|el|la|numero|nro)?\s*([1-9])\b/);
    if (numeric) return Number.parseInt(numeric[1], 10);
    if (/\bprimer[oa]?\b/.test(normalized)) return 1;
    if (/\bsegund[oa]?\b/.test(normalized)) return 2;
    if (/\btercer[oa]?\b/.test(normalized)) return 3;
    if (/\bcuart[oa]?\b/.test(normalized)) return 4;
    if (/\bquint[oa]?\b/.test(normalized)) return 5;
    return null;
}

function locationValueMatchesAnswer(answer = '', value = '') {
    const normalizedAnswer = normalizeLocationLookup(answer);
    const normalizedValue = normalizeLocationLookup(value);
    if (!normalizedAnswer || !normalizedValue || normalizedValue.length < 4) return false;
    if (normalizedAnswer === normalizedValue) return true;
    const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(normalizedAnswer);
}

function filterCandidatesByField(answer = '', candidates = [], field = '') {
    return normalizeLocationCandidates(candidates)
        .filter((candidate) => locationValueMatchesAnswer(answer, candidate[field]));
}

function resolvePendingLocationCandidate(answer = '', candidates = []) {
    const cleanCandidates = normalizeLocationCandidates(candidates);
    const optionNumber = extractDisambiguationOptionNumber(answer);
    if (optionNumber !== null && optionNumber >= 1 && optionNumber <= Math.min(5, cleanCandidates.length)) {
        return { status: 'resolved', candidate: cleanCandidates[optionNumber - 1], matches: [cleanCandidates[optionNumber - 1]], reason: 'option_number' };
    }

    const normalizedAnswer = normalizeLocationLookup(answer);
    const preferProvince = /\bprovincia\b/.test(normalizedAnswer);
    const preferDepartment = /\bdepartamento\b/.test(normalizedAnswer);
    const orderedFields = preferProvince
        ? ['province', 'department']
        : (preferDepartment ? ['department', 'province'] : ['department', 'province']);

    for (const field of orderedFields) {
        const matches = filterCandidatesByField(answer, cleanCandidates, field);
        if (matches.length === 1) return { status: 'resolved', candidate: matches[0], matches, reason: field };
        if (matches.length > 1) return { status: 'narrowed', candidate: null, matches, reason: field };
    }

    const broadMatches = cleanCandidates.filter((candidate) => candidateMatchKeys(candidate).some((key) => locationValueMatchesAnswer(answer, key)));
    if (broadMatches.length === 1) return { status: 'resolved', candidate: broadMatches[0], matches: broadMatches, reason: 'broad' };
    if (broadMatches.length > 1) return { status: 'narrowed', candidate: null, matches: broadMatches, reason: 'broad' };
    return { status: 'none', candidate: null, matches: [] };
}

function normalizePendingLocationDisambiguation(value = {}) {
    const source = safeJsonObject(value);
    const candidates = normalizeLocationCandidates(source.candidates);
    if (!candidates.length) return null;
    return {
        matchedText: text(source.matchedText || source.matched_text || ''),
        sourceMessageId: text(source.sourceMessageId || source.source_message_id || ''),
        createdAt: text(source.createdAt || source.created_at || ''),
        expiresAt: text(source.expiresAt || source.expires_at || ''),
        candidates,
        intent: safeJsonObject(source.intent)
    };
}

async function getPendingLocationDisambiguation(tenantId, chatId, scopeModuleId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanChatId = normalizeChatId(chatId);
    const cleanScopeModuleId = lower(scopeModuleId);
    if (!cleanChatId) return null;
    try {
        const current = await chatCommercialStatusService.getChatCommercialStatus(cleanTenantId, {
            chatId: cleanChatId,
            scopeModuleId: cleanScopeModuleId
        });
        const pending = normalizePendingLocationDisambiguation(current?.metadata?.pendingLocationDisambiguation);
        if (!pending) return null;
        const expiresAt = pending.expiresAt ? new Date(pending.expiresAt).getTime() : NaN;
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            await clearPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId, 'expired');
            console.log('[Patty] location disambiguation expired', {
                tenantId: cleanTenantId,
                chatId: cleanChatId,
                scopeModuleId: cleanScopeModuleId
            });
            return null;
        }
        console.log('[Patty] location disambiguation pending found', {
            tenantId: cleanTenantId,
            chatId: cleanChatId,
            scopeModuleId: cleanScopeModuleId,
            matchedText: pending.matchedText,
            candidates: pending.candidates.length
        });
        return pending;
    } catch (error) {
        console.warn('[Patty] location disambiguation lookup skipped:', error?.message || error);
        return null;
    }
}

async function setPendingLocationDisambiguation(tenantId, chatId, scopeModuleId, data = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanChatId = normalizeChatId(chatId);
    const cleanScopeModuleId = lower(scopeModuleId);
    const candidates = normalizeLocationCandidates(data.candidates);
    if (!cleanChatId || !candidates.length) return null;
    const now = new Date();
    const payload = {
        matchedText: text(data.matchedText || ''),
        sourceMessageId: text(data.sourceMessageId || ''),
        createdAt: text(data.createdAt || '') || now.toISOString(),
        expiresAt: text(data.expiresAt || '') || new Date(now.getTime() + LOCATION_DISAMBIGUATION_TTL_MS).toISOString(),
        candidates,
        intent: safeJsonObject(data.intent)
    };
    await chatCommercialStatusService.upsertChatCommercialStatus(cleanTenantId, {
        chatId: cleanChatId,
        scopeModuleId: cleanScopeModuleId,
        source: 'patty',
        metadata: {
            pendingLocationDisambiguation: payload
        }
    });
    return payload;
}

async function clearPendingLocationDisambiguation(tenantId, chatId, scopeModuleId = '', reason = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanChatId = normalizeChatId(chatId);
    const cleanScopeModuleId = lower(scopeModuleId);
    if (!cleanChatId) return;
    await chatCommercialStatusService.upsertChatCommercialStatus(cleanTenantId, {
        chatId: cleanChatId,
        scopeModuleId: cleanScopeModuleId,
        source: 'patty',
        metadata: {
            pendingLocationDisambiguation: null
        }
    });
    console.log(`[Patty] location disambiguation cleared: ${reason || 'cleared'}`, {
        tenantId: cleanTenantId,
        chatId: cleanChatId,
        scopeModuleId: cleanScopeModuleId
    });
}

function hasLocationMentionIntent(value = '') {
    const normalized = normalizeLocationLookup(value);
    if (!normalized) return false;
    return /\b(vivo|vive|soy|estoy|esta|ubicado|ubicada|direccion|domicilio|llegan|llega|delivery|envio)\b/.test(normalized)
        || /\ben\s+[a-z0-9]{4,}\b/.test(normalized);
}

function mentionsProductIntent(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return /\b(detergente|lavavajillas|lavajillas|quitamanchas|quita\s+manchas|suavizante|sacagrasa|saca\s+grasa|limpiador|desinfectante|jabon|jabÃ³n|kit|ropa|cocina|bano|baÃ±o|producto|productos|catalogo|catalogo|cotiza|cotizame|pedido|comprar|unidades)\b/.test(normalized);
}

function hasCoverageQuestionIntent(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return [
        'cobertura',
        'llegan',
        'tienen envio',
        'hacen envio',
        'reparten',
        'entregan',
        'despachan',
        'mandan',
        'llega',
        'llegaria',
        'llego',
        'envian',
        'reparto'
    ].some((keyword) => normalized.includes(normalizeProductLookupKey(keyword)));
}

function isPaymentQuestionWithoutLocation(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    const paymentIntent = isCreditOrInstallmentQuestion(normalized)
        || /\b(pago|pagar|pagos|yape|plin|transferencia|tarjeta|contraentrega)\b/.test(normalized)
        || normalized.includes('contra entrega')
        || normalized.includes('metodos de pago')
        || normalized.includes('forma de pago')
        || normalized.includes('formas de pago')
        || normalized.includes('como pago');
    return paymentIntent && !hasLocationMentionIntent(value);
}

function looksLikeBareLocationText(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    if (hasClientGreeting(value) || isPureGreetingMessage(value)) return false;
    if (isPaymentQuestionWithoutLocation(value)) return false;
    if (mentionsProductIntent(value) || isCreditOrInstallmentQuestion(value)) return false;
    if (/\b(que|como|cual|cuanto|cuando|tienes|tienen|puedo|puedes|pasa|hola|buenos|buenas|dias|tardes|noches)\b/.test(normalized)) {
        return false;
    }
    const words = normalized.split(/\s+/).filter(Boolean);
    return words.length > 0 && words.length <= 3 && words.some((word) => word.length >= 4);
}

function shouldResolveLocationFromMessage(value = '') {
    const clean = text(value);
    if (!clean || isPaymentQuestionWithoutLocation(clean)) return false;
    return hasLocationMentionIntent(clean)
        || hasCoverageQuestionIntent(clean)
        || looksLikeBareLocationText(clean);
}

function extractRecentCustomerLocationTexts(recentConversationText = '') {
    const lines = text(recentConversationText)
        .split(/\r?\n/)
        .map((line) => text(line))
        .filter(Boolean);
    const customerLines = lines
        .filter((line) => /^\[CLIENTE/i.test(line))
        .map((line) => line
            .replace(/^\[CLIENTE[^\]]*\]\s*:?\s*/i, '')
            .replace(/\s+\(\d{1,2}\/\d{1,2}\/\d{4}[^)]*\)\s*$/i, '')
            .trim())
        .filter(Boolean);
    return customerLines.length ? customerLines : lines;
}

function shouldUseLocationResult(location = {}) {
    const confidence = text(location?.confidence);
    return Boolean(location) && confidence && confidence !== 'none';
}

async function resolveLocationForZoneDecision(recentConversationText = '', lastCustomerMessage = '', zoneRules = []) {
    const lastText = text(lastCustomerMessage);
    if (shouldResolveLocationFromMessage(lastText)) {
        const lastLocation = await geoLocationService.resolveLocationFromText(lastText, { zoneRules });
        if (shouldUseLocationResult(lastLocation)) {
            return {
                location: lastLocation,
                source: 'last_message',
                lookupText: lastText
            };
        }
    }
    const historyText = text(recentConversationText);
    if (!historyText) {
        return {
            location: await geoLocationService.resolveLocationFromText('', { zoneRules }),
            source: 'none',
            lookupText: ''
        };
    }
    const recentCustomerTexts = extractRecentCustomerLocationTexts(historyText).reverse();
    for (const candidateText of recentCustomerTexts) {
        if (!shouldResolveLocationFromMessage(candidateText)) continue;
        const candidateLocation = await geoLocationService.resolveLocationFromText(candidateText, { zoneRules });
        if (shouldUseLocationResult(candidateLocation)) {
            return {
                location: candidateLocation,
                source: 'history_line',
                lookupText: candidateText
            };
        }
    }
    return {
        location: await geoLocationService.resolveLocationFromText('', { zoneRules }),
        source: 'none',
        lookupText: ''
    };
}

async function buildZoneDecision(tenantId, recentConversationText = '', lastCustomerMessage = '', options = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanChatId = normalizeChatId(options.chatId || '');
    const cleanScopeModuleId = lower(options.scopeModuleId || options.moduleId || '');
    const rules = await tenantZoneRulesService.listZoneRules(cleanTenantId, { includeInactive: false });
    const sourceRules = Array.isArray(rules) ? rules : [];
    const pending = cleanChatId
        ? await getPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId)
        : null;
    if (pending) {
        if (looksLikeNewLocationQuestion(lastCustomerMessage)) {
            console.log('[Patty] disambiguation cleared: new location', {
                tenantId: cleanTenantId,
                chatId: cleanChatId,
                scopeModuleId: cleanScopeModuleId,
                message: text(lastCustomerMessage).slice(0, 120)
            });
            await clearPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId, 'new_location_detected');
        } else if (isLocationDisambiguationTopicChange(lastCustomerMessage)) {
            console.log('[Patty] location disambiguation topic change detected', {
                tenantId: cleanTenantId,
                chatId: cleanChatId,
                scopeModuleId: cleanScopeModuleId,
                message: text(lastCustomerMessage).slice(0, 120)
            });
            await clearPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId, 'topic_change');
        } else {
            const resolution = resolvePendingLocationCandidate(lastCustomerMessage, pending.candidates);
            if (resolution.status === 'resolved') {
                const location = buildLocationFromCandidate(resolution.candidate, pending.matchedText);
                const zoneMatch = geoLocationService.resolveZoneFromLocation(location, sourceRules);
                await clearPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId, 'resolved');
                console.log('[Patty] location disambiguation resolved:', formatResolvedLocation(location), {
                    tenantId: cleanTenantId,
                    chatId: cleanChatId,
                    scopeModuleId: cleanScopeModuleId,
                    matchedZone: zoneMatch?.rule?.name || null
                });
                return {
                    rules: sourceRules,
                    location,
                    locationSource: 'pending_disambiguation',
                    locationLookupText: text(lastCustomerMessage),
                    zoneRule: zoneMatch?.rule || null,
                    matchedLevel: zoneMatch?.matchedLevel || null,
                    locationMentioned: true,
                    locationRecognized: true,
                    locationAmbiguous: false,
                    forceDeterministicDeliveryPayment: Boolean(zoneMatch?.rule),
                    forceKnownLocationNoZone: !zoneMatch?.rule,
                    deliveryPaymentIntent: safeJsonObject(pending.intent),
                    disambiguationResolved: true
                };
            }

            let continueNormalFlow = false;
            if (resolution.status !== 'narrowed') {
                const isNewLocationLikeMessage = shouldResolveLocationFromMessage(lastCustomerMessage);
                if (isNewLocationLikeMessage) {
                    const directLocation = await geoLocationService.resolveLocationFromText(lastCustomerMessage, { zoneRules: sourceRules });
                    if (shouldUseLocationResult(directLocation)) {
                        await clearPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId, 'new_location_replaces_pending');
                        continueNormalFlow = true;
                    }
                } else {
                    await clearPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId, 'non_location_message');
                    continueNormalFlow = true;
                }
            }
            if (continueNormalFlow) {
                // Fall through and process the current message normally.
            } else {
                const nextCandidates = resolution.status === 'narrowed' && resolution.matches.length > 1
                    ? rankLocationDisambiguationCandidates(resolution.matches, sourceRules)
                    : pending.candidates;
                const renewed = await setPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId, {
                    ...pending,
                    candidates: nextCandidates,
                    expiresAt: new Date(Date.now() + LOCATION_DISAMBIGUATION_TTL_MS).toISOString()
                });
                const candidates = renewed?.candidates || pending.candidates;
                const deterministicResponseOverride = resolution.status === 'narrowed'
                    ? buildConversationalLocationDisambiguationQuestion(candidates, sourceRules, pending.matchedText)
                    : (isSubdistrictClarification(lastCustomerMessage)
                        ? buildSubdistrictClarificationResponse(lastCustomerMessage)
                        : 'No logro identificar esa ubicacion entre las opciones. ¿Puedes ser mas especifico?');
                console.log('[Patty] location disambiguation asked:', candidates.map(formatDisambiguationCandidateLabel), {
                    tenantId: cleanTenantId,
                    chatId: cleanChatId,
                    scopeModuleId: cleanScopeModuleId
                });
                return {
                    rules: sourceRules,
                    location: {
                        district: null,
                        province: null,
                        department: null,
                        confidence: 'ambiguous',
                        matchedType: null,
                        matchedText: pending.matchedText,
                        candidates
                    },
                    locationSource: 'pending_disambiguation',
                    locationLookupText: text(lastCustomerMessage),
                    zoneRule: null,
                    matchedLevel: null,
                    locationMentioned: true,
                    locationRecognized: false,
                    locationAmbiguous: true,
                    deterministicResponseOverride
                };
            }
        }
    }

    const resolvedLocation = await resolveLocationForZoneDecision(recentConversationText, lastCustomerMessage, sourceRules);
    const location = resolvedLocation.location;
    const zoneMatch = geoLocationService.resolveZoneFromLocation(location, sourceRules);
    const confidence = text(location?.confidence);
    const locationMentionedText = resolvedLocation.source === 'last_message'
        ? lastCustomerMessage
        : recentConversationText;
    const locationAmbiguous = confidence === 'ambiguous';
    let deterministicResponseOverride = '';
    const subdistrictClarification = isSubdistrictClarification(lastCustomerMessage);
    const locationMentioned = hasLocationMentionIntent(locationMentionedText) || subdistrictClarification;
    const shouldAskAmbiguousLocation = cleanChatId
        && locationAmbiguous
        && (
            resolvedLocation.source === 'last_message'
            || hasCoverageQuestionIntent(lastCustomerMessage)
            || isPureDeliveryOrPaymentQuestion(lastCustomerMessage)
        );
    if (shouldAskAmbiguousLocation) {
        const candidates = normalizeLocationCandidates(location?.candidates);
        if (candidates.length) {
            const rankedCandidates = rankLocationDisambiguationCandidates(candidates, sourceRules);
            await setPendingLocationDisambiguation(cleanTenantId, cleanChatId, cleanScopeModuleId, {
                matchedText: text(location?.matchedText || lastCustomerMessage),
                sourceMessageId: text(options.sourceMessageId || ''),
                candidates: rankedCandidates,
                intent: getDeliveryPaymentIntent(lastCustomerMessage)
            });
            deterministicResponseOverride = buildConversationalLocationDisambiguationQuestion(rankedCandidates, sourceRules, location?.matchedText || lastCustomerMessage);
            console.log('[Patty] location disambiguation asked:', rankedCandidates.map(formatDisambiguationCandidateLabel), {
                tenantId: cleanTenantId,
                chatId: cleanChatId,
                scopeModuleId: cleanScopeModuleId
            });
        }
    }
    if (!deterministicResponseOverride
        && !locationAmbiguous
        && !['exact', 'partial'].includes(confidence)
        && locationMentioned
        && subdistrictClarification) {
        deterministicResponseOverride = buildSubdistrictClarificationResponse(lastCustomerMessage);
    }
    return {
        rules: sourceRules,
        location,
        locationSource: resolvedLocation.source,
        locationLookupText: resolvedLocation.lookupText,
        zoneRule: zoneMatch?.rule || null,
        matchedLevel: zoneMatch?.matchedLevel || null,
        locationMentioned,
        locationRecognized: ['exact', 'partial'].includes(confidence),
        locationAmbiguous,
        deterministicResponseOverride
    };
}

function logGeoResolveAttempt(recentText = '', zoneDecision = {}, deterministicResponse = null) {
    const geoResult = zoneDecision?.location || {};
    const matchedZone = zoneDecision?.zoneRule || null;
    const lookupText = text(zoneDecision?.locationLookupText || recentText);
    console.log('[Patty] geo resolve attempt', {
        textSample: lookupText.substring(0, 80),
        confidence: text(geoResult.confidence || 'none') || 'none',
        district: geoResult.district || null,
        province: geoResult.province || null,
        department: geoResult.department || null,
        source: zoneDecision?.locationSource || null,
        matchedZone: matchedZone?.name || null,
        deterministic: Boolean(deterministicResponse)
    });
}

function buildZoneContextFromDecision(decision = {}) {
    const sourceRules = Array.isArray(decision.rules) ? decision.rules : [];
    const location = decision.location || {};
    const zoneRule = decision.zoneRule || null;
    if (zoneRule) {
        const summary = buildZoneShippingSummary(zoneRule);
        const shippingLines = summary.activeShippingOptions
            .slice(0, 8)
            .map((item) => {
                const itemCost = money(item.cost);
                const itemFreeFrom = money(item.free_from ?? item.freeFrom);
                const itemTime = formatDeliveryTimeLabel(item.estimated_time || item.estimatedTime || '');
                return [
                    `    - ${formatShippingOptionLabel(item)}: ${itemCost !== null ? `S/ ${itemCost.toFixed(2)}` : 'Costo por confirmar'}`,
                    itemFreeFrom !== null ? `      Gratis desde S/ ${itemFreeFrom.toFixed(2)}` : '      Gratis desde: No aplica',
                    `      Tiempo: ${itemTime}`
                ].join('\n');
            });
        console.log('[Patty] zone matched:', summary.zoneName, 'shipping:', summary.shippingLabel, 'cost:', summary.cost);
        return [[
            `ZONA DETECTADA PARA ESTE CLIENTE: ${summary.zoneName}`,
            '  ADVERTENCIA: USA ESTOS DATOS EXACTOS:',
            `  Ubicacion resuelta: ${formatResolvedLocation(location)}`,
            `  Envio: ${summary.shippingLabel}`,
            `  Costo: ${summary.costText}`,
            `  Gratis desde: ${summary.freeFromText}`,
            `  Tiempo: ${summary.estimatedTime} exactos`,
            `  Metodos de pago: ${summary.paymentLabels.length ? summary.paymentLabels.join(', ') : 'No configurados'}`,
            `  Modalidad de pago: ${summary.paymentModalityText}`,
            `  Cobertura: ${summary.coverage}`,
            '  Envio disponible:',
            shippingLines.length ? shippingLines.join('\n') : '    - Sin opciones de envio configuradas',
            '  INSTRUCCION CRITICA: Cuando el cliente pregunte por envio o metodos de pago, usa EXACTAMENTE estos datos. NO digas "depende de la cantidad" ni inventes datos.'
        ].join('\n')];
    }

    if (decision.locationAmbiguous) {
        return [[
            'UBICACION AMBIGUA DETECTADA:',
            `  El cliente menciono "${text(location.matchedText) || 'una ubicacion'}" que puede corresponder a varios lugares:`,
            formatAmbiguousLocationCandidates(location),
            '  INSTRUCCION: Pregunta al cliente en que provincia o departamento esta para confirmar su ubicacion. No asumas ni uses ninguna zona hasta confirmar.'
        ].join('\n')];
    }

    if (decision.locationRecognized) {
        return [[
            'UBICACION RESUELTA SIN ZONA:',
            `  ${formatResolvedLocation(location)}`,
            '  INSTRUCCION: Informa que no tienes cobertura directa en esa zona y ofrece coordinar envio por courier. NO inventes costos.'
        ].join('\n')];
    }

    if (decision.locationMentioned || decision.locationAmbiguous) {
        return [[
            'UBICACION NO RECONOCIDA EN EL SISTEMA:',
            '  INSTRUCCION: Pregunta en que provincia o departamento esta el cliente antes de confirmar cobertura o dar precio de envio.'
        ].join('\n')];
    }

    const names = sourceRules.map((rule) => text(rule.name)).filter(Boolean).slice(0, 30);
    return names.length ? [`Zonas disponibles: ${names.join(', ')}`] : [];
}

async function resolveDeliveryForChatQuote(tenantId, chatId, subtotal = 0) {
    try {
        const { rows } = await pgQuery(
            `SELECT body
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND COALESCE(from_me, FALSE) = FALSE
              ORDER BY created_at DESC
              LIMIT 20`,
            [tenantId, chatId]
        );
        const recentText = (rows || [])
            .map((row) => text(row.body || ''))
            .filter(Boolean)
            .join('\n');
        if (!recentText) return { deliveryAmount: 0, deliveryFree: true, zoneName: null };
        const lastCustomerMessage = text(rows?.[0]?.body || '');
        const decision = await buildZoneDecision(tenantId, recentText, lastCustomerMessage);
        return resolveZoneDelivery(decision.zoneRule || null, subtotal);
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
    return Boolean(rule && recentConversationText && false);
}

async function getZonesContext(tenantId, recentConversationText = '', zoneDecision = null, lastCustomerMessage = '') {
    try {
        const strictDecision = zoneDecision || await buildZoneDecision(tenantId, recentConversationText, lastCustomerMessage);
        return buildZoneContextFromDecision(strictDecision);
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
                const zoneName = text(rule.name) || 'Zona';
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
                const activeShippingOptions = shippingOptions
                    .filter((item) => item?.is_active !== false && item?.isActive !== false)
                    .slice(0, 8);
                const shippingLines = activeShippingOptions
                    .map((item) => {
                        const label = lower(item.type) === 'courier' ? `Courier ${text(item.label) || 'Courier'}` : (text(item.label) || 'Delivery propio');
                        const cost = money(item.cost);
                        const freeFrom = money(item.free_from ?? item.freeFrom);
                        const estimatedTime = text(item.estimated_time || item.estimatedTime);
                        return [
                            `    - ${label}: ${cost !== null ? `S/ ${cost.toFixed(2)}` : 'Costo por confirmar'}`,
                            freeFrom !== null ? `      Gratis desde S/ ${freeFrom.toFixed(2)}` : '      Gratis desde: No aplica',
                            estimatedTime ? `      Tiempo de entrega: ${estimatedTime} dias habiles exactos` : '      Tiempo de entrega: Por confirmar'
                        ].filter(Boolean).join('\n');
                    });
                const primaryShipping = activeShippingOptions[0] || null;
                const primaryShippingLabel = primaryShipping
                    ? (lower(primaryShipping.type) === 'courier'
                        ? `Courier ${text(primaryShipping.label) || 'Courier'}`
                        : (text(primaryShipping.label) || 'Delivery propio'))
                    : 'Sin envio configurado';
                const primaryCost = primaryShipping ? money(primaryShipping.cost) : null;
                const primaryFreeFrom = primaryShipping ? money(primaryShipping.free_from ?? primaryShipping.freeFrom) : null;
                const primaryEstimatedTime = primaryShipping ? text(primaryShipping.estimated_time || primaryShipping.estimatedTime) : '';
                if (primaryShipping) {
                    console.log('[Patty] zone matched:', zoneName, 'shipping:', primaryShippingLabel, 'cost:', primaryCost);
                } else {
                    console.log('[Patty] zone matched:', zoneName, 'shipping:', 'Sin envio configurado', 'cost:', null);
                }
                const payments = safeJsonObject(rule.paymentMethods || rule.payment_methods);
                const paymentLabels = [
                    payments.yape ? 'Yape' : '',
                    payments.plin ? 'Plin' : '',
                    payments.bank_transfer || payments.bankTransfer ? 'Transferencia bancaria' : '',
                    payments.credit_card || payments.creditCard ? 'Tarjeta de credito' : ''
                ].filter(Boolean);
                return [
                    `ZONA DETECTADA PARA ESTE CLIENTE: ${zoneName}`,
                    '  ⚠️ USA ESTOS DATOS EXACTOS AL RESPONDER:',
                    `  Envio: ${primaryShippingLabel}`,
                    `  Costo: ${primaryCost !== null ? `S/ ${primaryCost.toFixed(2)}` : 'Por confirmar'}`,
                    `  Gratis desde: ${primaryFreeFrom !== null ? `S/ ${primaryFreeFrom.toFixed(2)}` : 'No aplica'}`,
                    `  Tiempo de entrega: ${primaryEstimatedTime ? `${primaryEstimatedTime} dias habiles exactos` : 'Por confirmar'}`,
                    primaryEstimatedTime
                        ? `  INSTRUCCION: cuando el cliente pregunte cuanto demora, di exactamente "${primaryEstimatedTime} dias habiles", no inventes rangos como "3 a 5 dias".`
                        : '  INSTRUCCION: si el tiempo no esta configurado, indica que el tiempo esta por confirmar.',
                    `  Metodos de pago: ${paymentLabels.length ? paymentLabels.join(', ') : 'No configurados'}`,
                    `  Cobertura: ${coverage}`,
                    '  Envio disponible:',
                    shippingLines.length ? shippingLines.join('\n') : '    - Sin opciones de envio configuradas',
                    '  Metodos de pago aceptados:',
                    `    - ${paymentLabels.length ? paymentLabels.join(', ') : 'No configurados'}`,
                    `  INSTRUCCION CRITICA: Cuando el cliente pregunte por envio o metodos de pago, usa EXACTAMENTE estos datos. NO digas "depende de la cantidad" ni inventes datos. El costo de envio es ${primaryCost !== null ? `S/ ${primaryCost.toFixed(2)}` : 'el indicado arriba'} fijo${primaryFreeFrom !== null ? `, gratis si el pedido supera S/ ${primaryFreeFrom.toFixed(2)}` : ''}.`
                ].join('\n');
            })
            .filter(Boolean);
    } catch (error) {
        console.warn('[Patty] zones unavailable:', error?.message || error);
        return [];
    }
}

function parseFirstDetectedZoneContext(zones = []) {
    const source = (Array.isArray(zones) ? zones : [])
        .map((entry) => text(entry))
        .find((entry) => entry.startsWith('ZONA DETECTADA PARA ESTE CLIENTE:'));
    if (!source) return null;
    const pick = (pattern) => text(source.match(pattern)?.[1] || '');
    const timeRaw = pick(/^\s*Tiempo de entrega:\s*(.+)$/mi)
        .replace(/\s+exactos?$/i, '')
        .trim();
    return {
        zoneName: pick(/^ZONA DETECTADA PARA ESTE CLIENTE:\s*(.+)$/mi),
        shipping: pick(/^\s*Envio:\s*(.+)$/mi),
        cost: pick(/^\s*Costo:\s*(.+)$/mi),
        freeFrom: pick(/^\s*Gratis desde:\s*(.+)$/mi),
        deliveryTime: timeRaw,
        payments: pick(/^\s*Metodos de pago:\s*(.+)$/mi)
    };
}

function isCreditOrInstallmentQuestion(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    return /\b(credito|creditos|cuota|cuotas|plazo|plazos|financiamiento|fiado|resto|abono|abonos|adelanto|debe|debo)\b/.test(normalized)
        || normalized.includes('fin de mes');
}

function isPureDeliveryOrPaymentQuestion(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    if (isCreditOrInstallmentQuestion(normalized)) return false;
    const hasDeliveryOrPayment = /\b(envio|delivery|entrega|demora|demorar|tiempo|pago|pagar|pagos|yape|plin|transferencia|tarjeta|domicilio|reparto|contraentrega)\b/.test(normalized)
        || normalized.includes('contra entrega')
        || normalized.includes('forma de pago')
        || normalized.includes('formas de pago')
        || normalized.includes('metodos de pago')
        || normalized.includes('como pago')
        || normalized.includes('cuanto cuesta el envio')
        || normalized.includes('precio envio')
        || normalized.includes('costo envio')
        || normalized.includes('cuanto es el envio')
        || normalized.includes('cuanto demora')
        || normalized.includes('tiempo de entrega')
        || normalized.includes('aceptan yape')
        || normalized.includes('aceptan plin')
        || normalized.includes('es a domicilio')
        || normalized.includes('llegan a domicilio');
    if (!hasDeliveryOrPayment) return false;
    const hasProductRequest = /\b(cotiza|cotizame|pedido|comprar|catalogo|muestrame|mostrarme|quiero\s+(?!pagar)|dame\s+\d|unidades)\b/.test(normalized);
    return !hasProductRequest;
}

function getDeliveryPaymentIntent(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (isCreditOrInstallmentQuestion(normalized)) {
        return { wantsDelivery: false, wantsPayment: false };
    }
    const deliveryLookup = normalized
        .replace(/\bcontra\s+entrega\b/g, ' ')
        .replace(/\bcontraentrega\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const wantsPayment = /\b(pago|pagar|pagos|yape|plin|transferencia|tarjeta|contraentrega)\b/.test(normalized)
        || normalized.includes('contra entrega')
        || normalized.includes('forma de pago')
        || normalized.includes('formas de pago')
        || normalized.includes('metodos de pago')
        || normalized.includes('como pago');
    const wantsDelivery = /\b(envio|delivery|entrega|demora|demorar|tiempo|domicilio|reparto)\b/.test(deliveryLookup)
        || deliveryLookup.includes('cuanto cuesta el envio')
        || deliveryLookup.includes('precio envio')
        || deliveryLookup.includes('costo envio')
        || deliveryLookup.includes('cuanto es el envio')
        || deliveryLookup.includes('cuanto demora')
        || deliveryLookup.includes('tiempo de entrega')
        || deliveryLookup.includes('es a domicilio')
        || deliveryLookup.includes('llegan a domicilio');
    return { wantsDelivery, wantsPayment };
}

function normalizedContainsPhrase(source = '', phrase = '') {
    const cleanSource = normalizeProductLookupKey(source);
    const cleanPhrase = normalizeProductLookupKey(phrase);
    if (!cleanSource || !cleanPhrase) return false;
    const escaped = cleanPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(cleanSource);
}

function hasCourierRequestIntentForAgency(normalized = '', agency = '') {
    const cleanAgency = normalizeProductLookupKey(agency);
    if (!normalized || !cleanAgency) return false;
    const escapedAgency = cleanAgency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const explicitAgencyPattern = new RegExp(`\\b(?:por|via|vía|agencia|courier|transporte)\\s+${escapedAgency}\\b|\\b${escapedAgency}\\s+(?:agencia|courier|transporte)\\b`);
    if (explicitAgencyPattern.test(normalized)) return true;
    const hasShippingVerb = /\b(enviar|envia|envian|enviame|mandar|manda|mandame|despachar|despachan|coordinar|prefiero|quisiera|quiero|pueden|puedes)\b/.test(normalized);
    const hasShippingContext = /\b(agencia|courier|transporte|flete|envio|delivery|despacho)\b/.test(normalized);
    return hasShippingVerb && hasShippingContext;
}

function detectRequestedExternalCourier(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return null;
    const knownAgencies = [
        'olva',
        'shalom',
        'cruz del sur',
        'civa',
        'flores',
        'movil tours',
        'tepsa',
        'ormeno',
        'ormeÃ±o'
    ];
    const match = knownAgencies.find((agency) => normalizedContainsPhrase(normalized, agency));
    if (match && !hasCourierRequestIntentForAgency(normalized, match)) return null;
    if (match) return match;
    if (/\b(?:otra?\s+)?(?:transporte|agencia|courier)\b/.test(normalized)
        && /\b(enviar|envia|envian|enviame|mandar|manda|mandame|despachar|prefiero|quisiera|quiero|pueden|puedes|por|via|vía)\b/.test(normalized)) {
        return 'agencia';
    }
    return null;
}

function requestedCourierMatchesSummary(requestedAgency = '', summary = {}) {
    const requested = normalizeProductLookupKey(requestedAgency);
    if (!requested) return true;
    const configuredValues = [
        summary.shippingDisplayName,
        summary.shippingLabel
    ].map(normalizeProductLookupKey).filter(Boolean);
    if ((requested === 'agencia' || requested === 'courier' || requested === 'transporte') && summary.shippingType === 'courier') {
        return true;
    }
    return configuredValues.some((value) => value.includes(requested) || requested.includes(value));
}

function shouldUseDeterministicResponse(lastMessage = '', zoneDecision = {}, context = {}) {
    if (zoneDecision?.deterministicResponseOverride) return true;
    if (isPureDeliveryOrPaymentQuestion(lastMessage)) return true;
    if (detectRequestedExternalCourier(lastMessage)) return true;
    const hasResolvedZone = Boolean(zoneDecision?.zoneRule);
    if (!hasResolvedZone) return false;
    if (hasLocationMentionIntent(lastMessage) && !mentionsProductIntent(lastMessage)) return true;
    if (hasCoverageQuestionIntent(lastMessage)) return true;
    return Boolean(context?.forceDeterministicDeliveryPayment);
}

function shouldUseKnownLocationNoZoneResponse(lastMessage = '', zoneDecision = {}) {
    if (zoneDecision?.forceKnownLocationNoZone === true) return true;
    if (zoneDecision?.zoneRule) return false;
    if (zoneDecision?.locationRecognized !== true) return false;
    if (zoneDecision?.locationAmbiguous === true) return false;
    return isPureDeliveryOrPaymentQuestion(lastMessage)
        || detectRequestedExternalCourier(lastMessage)
        || (hasLocationMentionIntent(lastMessage) && !mentionsProductIntent(lastMessage))
        || hasCoverageQuestionIntent(lastMessage);
}

function buildKnownLocationNoZoneResponse(zoneDecision = {}) {
    const locationLabel = formatCustomerLocationLabel(zoneDecision?.location || {}, 'tu zona');
    return [
        `Por el momento no tenemos cobertura directa en ${locationLabel} 😊`,
        'Déjame consultar con el equipo si podemos hacer llegar tu pedido.',
        'En breve te confirmamos.'
    ].join('\n');
}

function buildUnconfiguredCourierResponse(zoneDecision = {}, summary = {}, requestedAgency = '') {
    const locationLabel = formatCustomerLocationLabel(zoneDecision?.location || {}, summary.zoneName);
    const requestedLabel = text(requestedAgency) || 'esa agencia';
    const configuredLabel = summary.shippingType === 'courier'
        ? summary.shippingDisplayName
        : summary.shippingLabel;
    return [
        `Para ${locationLabel} trabajamos con *${configuredLabel}* 📦`,
        `Si prefieres ${requestedLabel}, el costo del flete lo asumes directamente con esa agencia 😊`,
        `¿Te gustaría coordinar con ${configuredLabel} o prefieres la otra opción?`
    ].join('\n');
}

function lineLooksInboundCustomer(line = '') {
    const clean = text(line);
    if (!clean) return false;
    if (/^\[CLIENTE/i.test(clean)) return true;
    if (/^\[(ASESOR|WA|PATTY|OPERADOR)/i.test(clean)) return false;
    return !clean.startsWith('[');
}

function countTopicMentions(chatHistory = [], keywords = []) {
    const lines = Array.isArray(chatHistory)
        ? chatHistory
        : String(chatHistory || '').split(/\r?\n/);
    const normalizedKeywords = (Array.isArray(keywords) ? keywords : [])
        .map(normalizeProductLookupKey)
        .filter(Boolean);
    if (!normalizedKeywords.length) return 0;
    return lines.reduce((count, line) => {
        if (!lineLooksInboundCustomer(line)) return count;
        const normalizedLine = normalizeProductLookupKey(line);
        return normalizedKeywords.some((keyword) => normalizedLine.includes(keyword))
            ? count + 1
            : count;
    }, 0);
}

function getZonePaymentMethodsForMessage(zoneDecision = {}) {
    const zoneRule = zoneDecision?.zoneRule || null;
    if (!zoneRule) return '';
    const summary = buildZoneShippingSummary(zoneRule);
    return formatSpanishList(summary.paymentLabels || [], 'o');
}

function detectUnavailablePaymentRequest(value = '', summary = {}) {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return null;
    const requestedCashOnDelivery = /\b(contraentrega|contra\s+entrega|pago\s+contra\s+entrega|pagar\s+al\s+recibir|pago\s+al\s+recibir|al\s+recibir)\b/.test(normalized);
    const requestedCash = /\b(efectivo|cash)\b/.test(normalized);
    if (!requestedCashOnDelivery && !requestedCash) return null;

    const modality = safeJsonObject(summary.paymentModality);
    const methods = safeJsonObject(summary.paymentMethods);
    const unavailable = [];
    if (requestedCashOnDelivery && modality.cashOnDelivery !== true) unavailable.push('contraentrega');
    if (requestedCash && methods.cash !== true) unavailable.push('efectivo');
    if (!unavailable.length) return null;
    return {
        requestedCashOnDelivery,
        requestedCash,
        unavailable
    };
}

function buildUnavailablePaymentResponse(zoneDecision = {}, summary = {}, issue = {}, mentionCount = 1) {
    const locationLabel = formatCustomerLocationLabel(zoneDecision?.location || {}, summary.zoneName);
    const paymentText = formatSpanishList(summary.paymentLabels || [], 'o') || 'los metodos configurados';
    const unavailableText = issue.unavailable.includes('contraentrega') && issue.unavailable.includes('efectivo')
        ? 'contraentrega ni efectivo al recibir'
        : (issue.unavailable.includes('contraentrega') ? 'contraentrega' : 'efectivo');
    const modalityText = text(summary.paymentModalityText) || 'pago anticipado';
    if (mentionCount > 1) {
        return [
            `Te entiendo. Para ${locationLabel} todavia no tenemos ${unavailableText}.`,
            `Lo manejamos con ${modalityText}; puedes pagar con ${paymentText}.`,
            'Si te parece, dime que productos necesitas y te ayudo a armar tu pedido.'
        ].join('\n');
    }
    return [
        `Por ahora para ${locationLabel} trabajamos con ${modalityText}.`,
        `No tenemos ${unavailableText} en esa zona; puedes pagar con ${paymentText}.`,
        'Si deseas, seguimos con tu pedido y te ayudo a elegir lo que necesitas.'
    ].join('\n');
}

function getUnavailablePaymentMentionCount(conversationLines = [], issue = {}) {
    const keywords = [
        issue.requestedCashOnDelivery ? 'contraentrega' : '',
        issue.requestedCashOnDelivery ? 'contra entrega' : '',
        issue.requestedCashOnDelivery ? 'al recibir' : '',
        issue.requestedCash ? 'efectivo' : ''
    ].filter(Boolean);
    return Math.max(1, countTopicMentions(conversationLines, keywords));
}

function buildCreditGuardResponse(level = 1, zoneDecision = {}) {
    const paymentMethods = getZonePaymentMethodsForMessage(zoneDecision);
    if (level >= 3) {
        return 'Déjame consultar eso con mi supervisor para ver si hay alguna excepción que podamos hacer por ti 🙌\nEn breve te confirmamos.';
    }
    if (level === 2) {
        return [
            'Entiendo que sería conveniente 😊',
            paymentMethods
                ? `Por ahora no contamos con esa modalidad, pero puedes pagar con ${paymentMethods}.`
                : 'Por ahora no contamos con esa modalidad, pero te confirmo las opciones de pago apenas validemos tu zona.',
            '¿Te ayudo a armar tu pedido?'
        ].join('\n');
    }
    return [
        'Por el momento Lávitat no ofrece crédito directo 😊',
        paymentMethods
            ? `Puedes pagar con ${paymentMethods}.`
            : 'Cuando confirmemos tu zona te indico los métodos de pago disponibles.',
        '¿Te ayudo a continuar con tu pedido?'
    ].join('\n');
}

function getUnverifiedDataTopic(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return null;
    if (/\b(stock|disponible|disponibilidad|queda|quedan)\b/.test(normalized)) return 'stock_no_confirmado';
    if (/\b(aroma|aromas|fragancia|olor|perfume)\b/.test(normalized)) return 'aroma_no_confirmado';
    if (/\b(descuento|descuentos|rebaja|gratis|sin\s+costo|precio\s+especial)\b/.test(normalized)) return 'descuento_no_configurado';
    if (normalized.includes('fecha de llegada')
        || normalized.includes('cuando llega')
        || normalized.includes('cuando vuelve')
        || /\b(reposicion|reingreso)\b/.test(normalized)) {
        return 'fecha_no_confirmada';
    }
    if (/\b(ingredientes|composicion|ficha tecnica|caracteristicas)\b/.test(normalized)) return 'dato_no_disponible';
    return null;
}

function getUnverifiedDataKeywordsForReason(reason = '') {
    if (reason === 'stock_no_confirmado') {
        return ['stock', 'disponible', 'disponibilidad', 'queda', 'quedan'];
    }
    if (reason === 'aroma_no_confirmado') {
        return ['aroma', 'aromas', 'fragancia', 'olor', 'perfume'];
    }
    if (reason === 'descuento_no_configurado') {
        return ['descuento', 'descuentos', 'rebaja', 'gratis', 'sin costo', 'precio especial'];
    }
    if (reason === 'fecha_no_confirmada') {
        return ['fecha de llegada', 'cuando llega', 'cuando vuelve', 'reposicion', 'reingreso'];
    }
    return UNVERIFIED_DATA_TOPIC_KEYWORDS;
}

function buildUnverifiedDataGuardResponse(level = 1) {
    if (level >= 3) {
        return 'Déjame verificar ese dato con el equipo para darte la información exacta 🙌\nEn breve te confirmamos.';
    }
    if (level === 2) {
        return 'No tengo ese detalle disponible ahora mismo.\n¿Hay algo más en lo que pueda ayudarte? 😊';
    }
    return 'No tengo ese dato confirmado en este momento 😊\n¿Te puedo ayudar con información sobre los productos del catálogo que tenemos disponibles?';
}

function buildExternalCourierEscalationResponse(requestedAgency = '') {
    const requestedLabel = text(requestedAgency) || 'esa agencia';
    return `Déjame consultar eso con mi supervisor para ver qué opciones tenemos con ${requestedLabel} 😊\nEn breve te confirmamos.`;
}

function buildAntiHallucinationGuardResponse({
    lastMessage = '',
    conversationLines = [],
    zoneDecision = {}
} = {}) {
    if (isCreditOrInstallmentQuestion(lastMessage)) {
        const creditMentions = Math.max(1, countTopicMentions(conversationLines, CREDIT_TOPIC_KEYWORDS));
        return {
            response: buildCreditGuardResponse(creditMentions, zoneDecision),
            needsAdvisorReason: creditMentions >= 3 ? 'credito_insistente' : '',
            source: 'patty.credit_guard',
            level: Math.min(creditMentions, 3)
        };
    }

    const requestedAgency = detectRequestedExternalCourier(lastMessage);
    if (requestedAgency && zoneDecision?.zoneRule) {
        const summary = buildZoneShippingSummary(zoneDecision.zoneRule);
        const isConfigured = requestedCourierMatchesSummary(requestedAgency, summary);
        const agencyMentions = countTopicMentions(conversationLines, [
            requestedAgency,
            'agencia',
            'courier',
            'transporte'
        ]);
        if (!isConfigured && agencyMentions >= 3) {
            return {
                response: buildExternalCourierEscalationResponse(requestedAgency),
                needsAdvisorReason: 'agencia_externa_insistente',
                source: 'patty.external_courier_escalation',
                level: 3
            };
        }
    }

    const unavailableReason = getUnverifiedDataTopic(lastMessage);
    if (unavailableReason) {
        const unavailableMentions = Math.max(1, countTopicMentions(
            conversationLines,
            getUnverifiedDataKeywordsForReason(unavailableReason)
        ));
        return {
            response: buildUnverifiedDataGuardResponse(unavailableMentions),
            needsAdvisorReason: unavailableMentions >= 3 ? 'dato_no_disponible' : '',
            source: `patty.${unavailableReason}`,
            level: Math.min(unavailableMentions, 3)
        };
    }

    return null;
}

function isSoftPauseIntent(value = '') {
    const normalized = normalizeProductLookupKey(value);
    if (!normalized) return false;
    const hasPause = normalized === 'ok'
        || normalized === 'ok te aviso'
        || normalized === 'te aviso'
        || normalized.includes('te aviso')
        || normalized.includes('luego te confirmo')
        || normalized.includes('despues te confirmo')
        || normalized.includes('lo voy a pensar')
        || normalized.includes('lo pienso')
        || normalized.includes('mas tarde')
        || normalized.includes('te escribo luego');
    if (!hasPause) return false;
    return !/\b(cuanto|precio|envio|delivery|reparto|pago|producto|productos|cotiza|cotizame|quiero|tienes|tienen)\b/.test(normalized);
}

function buildSoftPauseResponse(lastCustomerMessage = '') {
    if (!isSoftPauseIntent(lastCustomerMessage)) return null;
    return [
        'Perfecto 😊 Te dejo la idea a la mano.',
        'Cuando quieras avanzar, me dices qué uso tienes en mente o tu presupuesto y te ayudo a elegir sin vueltas.'
    ].join('\n');
}

function buildDeterministicDeliveryPaymentResponse(zoneDecision = {}, lastCustomerMessage = '', options = {}) {
    if (zoneDecision?.deterministicResponseOverride) return zoneDecision.deterministicResponseOverride;
    const forceResponse = zoneDecision?.forceDeterministicDeliveryPayment === true;
    const useDeterministic = shouldUseDeterministicResponse(lastCustomerMessage, zoneDecision, { forceDeterministicDeliveryPayment: forceResponse });
    if (!forceResponse && !useDeterministic) return null;
    const zoneRule = zoneDecision?.zoneRule || null;
    if (!zoneRule) {
        if (shouldUseKnownLocationNoZoneResponse(lastCustomerMessage, zoneDecision)) {
            console.log('[Patty] no zone for known location:', formatResolvedLocation(zoneDecision?.location || {}));
            return buildKnownLocationNoZoneResponse(zoneDecision);
        }
        return null;
    }
    if (zoneRule) {
        const summary = buildZoneShippingSummary(zoneRule);
        const locationLabel = formatCustomerLocationLabel(zoneDecision?.location || {}, summary.zoneName);
        const storedIntent = safeJsonObject(zoneDecision?.deliveryPaymentIntent);
        const fallbackIntent = getDeliveryPaymentIntent(lastCustomerMessage);
        const wantsPayment = storedIntent.wantsPayment === true || fallbackIntent.wantsPayment === true;
        const wantsDelivery = forceResponse
            ? (storedIntent.wantsDelivery !== false || !wantsPayment)
            : fallbackIntent.wantsDelivery === true;
        const unavailablePayment = detectUnavailablePaymentRequest(lastCustomerMessage, summary);
        if (unavailablePayment && wantsPayment) {
            return buildUnavailablePaymentResponse(
                zoneDecision,
                summary,
                unavailablePayment,
                getUnavailablePaymentMentionCount(options.conversationLines, unavailablePayment)
            );
        }
        const responseLines = [];
        if (wantsDelivery || !wantsPayment) {
            const requestedAgency = detectRequestedExternalCourier(lastCustomerMessage);
            if (requestedAgency && !requestedCourierMatchesSummary(requestedAgency, summary)) {
                console.log('[Patty] external courier requested:', requestedAgency, {
                    zoneName: summary.zoneName,
                    configuredShipping: summary.shippingLabel
                });
                return buildUnconfiguredCourierResponse(zoneDecision, summary, requestedAgency);
            }
            const deliveryLead = summary.shippingType === 'courier'
                ? `Para ${locationLabel} enviamos por *agencia ${summary.shippingDisplayName}* 📦`
                : `Para ${locationLabel} hacemos *reparto a domicilio* 🚚`;
            const freeFromText = summary.freeFrom !== null
                ? `, gratis en pedidos desde S/ ${summary.freeFrom.toFixed(2)}`
                : '';
            responseLines.push([
                deliveryLead,
                `El costo es *${summary.costText}*${freeFromText}, y llega en ${summary.estimatedTime}. ${buildZonePaymentPhrase(summary)}`
            ].join('\n'));
        } else if (wantsPayment) {
            responseLines.push(`Para ${locationLabel}, ${buildZonePaymentPhrase(summary, { sentenceStart: false })}`);
        }
        console.log('[Patty] deterministic delivery details', {
            zoneName: summary.zoneName,
            shippingType: summary.shippingType,
            shippingLabel: summary.shippingLabel,
            paymentLabels: summary.paymentLabels,
            paymentModalityText: summary.paymentModalityText
        });
        return responseLines.filter(Boolean).join('\n');
    }
    return null;
    const zone = parseFirstDetectedZoneContext(zones);
    if (!zone) return null;
    const lines = [
        `El envio a ${zone.zoneName || 'tu zona'} es con ${zone.shipping || 'el courier configurado'} a ${zone.cost || 'costo por confirmar'}.`
    ];
    if (zone.freeFrom && !/^no aplica$/i.test(zone.freeFrom)) {
        lines.push(`Gratis en pedidos desde ${zone.freeFrom}.`);
    }
    if (zone.deliveryTime) {
        lines.push(`Tiempo de entrega: ${zone.deliveryTime}.`);
    }
    if (zone.payments && !/^no configurados$/i.test(zone.payments)) {
        lines.push(`Metodos de pago: ${zone.payments} 🙌`);
    }
    return lines.join('\n');
}

function ensureTextArray(value = []) {
    return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
}

async function getCustomerContext(tenantId, moduleId, chatId) {
    const phoneE164 = firstPhoneE164FromChatId(chatId);
    if (!phoneE164) return { summary: 'CLIENTE: Prospecto nuevo (no registrado en BD)', customerId: null, customerName: null };
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
        if (!row) return { summary: 'CLIENTE: Prospecto nuevo (no registrado en BD)', customerId: null, customerName: null };
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
        return { summary: lines.join('\n'), customerId: text(row.customer_id) || null, customerName: name };
    } catch (error) {
        return { summary: 'CLIENTE: Prospecto nuevo (no registrado en BD)', customerId: null, customerName: null };
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
        const state = await getCurrentCommercialState(tenantId, moduleId, chatId);
        const status = state.status || 'sin_estado';
        const elapsed = formatElapsedSince(state.lastTransitionAt);
        const minutes = minutesSince(state.lastTransitionAt);
        const lines = [
            'ESTADO COMERCIAL:',
            `  Estado: ${status}`,
            `  Desde: ${elapsed}`
        ];
        if (status === 'aceptado') {
            if (minutes !== null && minutes < 30) {
                lines.push('  Contexto: Pedido recien confirmado. Pregunta si quiere agregar al pedido actual o hacer uno nuevo.');
            } else if (minutes !== null && minutes < 1440) {
                lines.push('  Contexto: Pedido confirmado hoy. Trata como nueva interaccion pero menciona el pedido si es relevante.');
            } else {
                lines.push('  Contexto: Pedido anterior. Probablemente nueva compra. No menciones el pedido anterior salvo que sea relevante.');
            }
        }
        if (status === 'atendido') {
            lines.push('  Contexto: Pedido entregado. Momento ideal para recompra o seguimiento post-venta.');
        }
        return lines.join('\n');
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
            `SELECT status, last_transition_at, patty_mode, patty_mode_until, patty_taken_by
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
            lastTransitionAt: rows?.[0]?.last_transition_at || null,
            pattyMode: lower(rows?.[0]?.patty_mode),
            pattyModeUntil: rows?.[0]?.patty_mode_until || null,
            pattyTakenBy: text(rows?.[0]?.patty_taken_by)
        };
    } catch (error) {
        console.warn('[Patty] commercial status lookup skipped:', error?.message || error);
        return { status: '', lastTransitionAt: null };
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

async function getChatPattyMode(tenantId, chatId, moduleId, moduleConfig = null) {
    const state = await getCurrentCommercialState(tenantId, moduleId, chatId);
    if (['autonomous', 'review', 'off'].includes(state.pattyMode)) {
        return {
            mode: state.pattyMode,
            source: 'chat_override',
            state
        };
    }
    const scheduleState = await resolveScheduleState(tenantId, moduleConfig || {});
    const aiConfig = moduleConfig?.aiConfig || {};
    const mode = scheduleState.open
        ? lower(aiConfig.withinHoursMode || aiConfig.within_hours_mode || 'off')
        : lower(aiConfig.outsideHoursMode || aiConfig.outside_hours_mode || 'off');
    return {
        mode,
        source: 'module_config',
        state,
        scheduleState
    };
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

function getCatalogProductFromReferenceMetadata(metadata = {}) {
    const source = safeJsonObject(metadata);
    const candidates = [
        source.catalogProduct,
        source.catalog_product,
        source.product,
        source.catalogItem,
        source.catalog_item,
        source.metadata?.catalogProduct,
        source.metadata?.catalog_product
    ];
    return candidates.map((item) => safeJsonObject(item)).find((item) => (
        text(item.title || item.name) || text(item.sku || item.item_id || item.itemId)
    )) || {};
}

function summarizeQuotedMessageRow(row = {}) {
    const orderPayload = safeJsonObject(row.order_payload);
    const orderProducts = extractOrderPayloadProducts(orderPayload);
    if (orderProducts.length) {
        return {
            type: 'cotizacion/pedido',
            lines: orderProducts.slice(0, 8).map((item) => {
                const sku = item.sku ? `[${item.sku}] ` : '';
                const quantity = item.quantity ? ` x ${item.quantity}` : '';
                const lineTotal = money(item.lineTotal);
                const price = Number.isFinite(lineTotal) ? ` = S/ ${lineTotal.toFixed(2)}` : '';
                return `- ${sku}${item.title}${quantity}${price}`;
            })
        };
    }

    const catalogProduct = getCatalogProductFromReferenceMetadata(row.metadata);
    const catalogTitle = text(catalogProduct.title || catalogProduct.name);
    const catalogSku = text(catalogProduct.sku || catalogProduct.item_id || catalogProduct.itemId).toUpperCase();
    if (catalogTitle || catalogSku) {
        return {
            type: 'producto',
            lines: [
                catalogTitle ? `- Producto: ${catalogTitle}` : '',
                catalogSku ? `- SKU: ${catalogSku}` : ''
            ].filter(Boolean)
        };
    }

    const body = text(row.body);
    const messageType = lower(row.message_type || '');
    const isMedia = Boolean(row.has_media) || ['image', 'video', 'document', 'audio'].includes(messageType);
    if (isMedia) {
        return {
            type: messageType || 'imagen/adjunto',
            lines: [body ? `- Caption: ${body.slice(0, 800)}` : '- Adjunto sin texto registrado']
        };
    }

    if (body) {
        return {
            type: 'texto',
            lines: [`- Texto: ${body.slice(0, 1000)}`]
        };
    }

    return {
        type: messageType || 'mensaje',
        lines: ['- Sin contenido textual registrado']
    };
}

function buildUnresolvedQuotedReferenceContext(lastText = '') {
    if (!isDeicticProductReference(lastText)) return '';
    return [
        'EL CLIENTE MENCIONO "ESTE/ESE" PERO NO SE PUDO RESOLVER EL MENSAJE CITADO:',
        'INSTRUCCION: Preguntale amablemente a que producto o mensaje se refiere antes de cotizar.',
        'INSTRUCCION: Si falta cantidad, pregunta cuantas unidades desea antes de generar quoteRequest.'
    ].join('\n');
}

async function getQuotedMessageReferenceContext(tenantId, moduleId, chatId, lastInboundRow = {}) {
    const quotedMessageId = text(lastInboundRow?.quoted_message_id || lastInboundRow?.quotedMessageId || '');
    const lastText = text(lastInboundRow?.body || '');
    if (!quotedMessageId) return buildUnresolvedQuotedReferenceContext(lastText);

    try {
        const { rows } = await pgQuery(
            `SELECT message_id, from_me, body, message_type, has_media, order_payload, metadata, created_at
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND message_id = $3
                AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($4))
              ORDER BY created_at DESC
              LIMIT 1`,
            [tenantId, normalizeChatId(chatId), quotedMessageId, lower(moduleId)]
        );
        const row = rows?.[0] || null;
        if (!row) return buildUnresolvedQuotedReferenceContext(lastText);
        const summary = summarizeQuotedMessageRow(row);
        return [
            'EL CLIENTE RESPONDIO A ESTE MENSAJE:',
            `  Tipo: ${summary.type}`,
            `  MessageId: ${quotedMessageId}`,
            '  Contenido:',
            ...summary.lines.map((line) => `  ${line}`),
            'INSTRUCCION: Usa esta referencia para entender "este", "ese", "este producto" o respuestas similares.',
            'INSTRUCCION: Si vas a cotizar y el cliente no indico cantidad, pregunta cuantas unidades desea antes de generar quoteRequest.'
        ].join('\n');
    } catch (error) {
        console.warn('[Patty] quoted message context skipped:', error?.message || error);
        return buildUnresolvedQuotedReferenceContext(lastText);
    }
}

async function getConversationContext(tenantId, moduleId, chatId) {
    const { rows } = await pgQuery(
        `SELECT message_id, from_me, body, message_type, has_media, quoted_message_id, order_payload, metadata, created_at
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
    const quotedReferenceContext = await getQuotedMessageReferenceContext(tenantId, moduleId, chatId, lastInbound || {});
    return {
        lines,
        lastCustomerMessage: text(lastInbound?.body) || '',
        lastCustomerMessageId: text(lastInbound?.message_id) || '',
        quotedReferenceContext,
        recentOrder: recentOrder?.order_payload || null
    };
}

async function getPendingInboundRowsSinceLastPatty(tenantId, moduleId, chatId, limit = 5) {
    const cleanLimit = Math.max(1, Math.min(20, Number.parseInt(String(limit), 10) || 5));
    const { rows } = await pgQuery(
        `WITH last_outbound AS (
            SELECT MAX(created_at) AS created_at
              FROM tenant_messages
             WHERE tenant_id = $1
               AND chat_id = $2
               AND COALESCE(from_me, FALSE) = TRUE
               AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
        )
        SELECT message_id, body, created_at
          FROM tenant_messages
         WHERE tenant_id = $1
           AND chat_id = $2
           AND COALESCE(from_me, FALSE) = FALSE
           AND COALESCE(body, '') <> ''
           AND created_at > COALESCE((SELECT created_at FROM last_outbound), '-infinity'::timestamptz)
           AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
         ORDER BY created_at DESC
         LIMIT $4`,
        [tenantId, normalizeChatId(chatId), lower(moduleId), cleanLimit]
    );
    return [...(rows || [])].reverse();
}

async function getGreetingInstructionContext(tenantId, moduleId, chatId, lastCustomerMessage = '') {
    const timeOfDay = getLimaTimeOfDay();
    const greetingText = greetingTextForTimeOfDay(timeOfDay);
    const base = {
        shouldGreet: false,
        timeOfDay,
        greetingText,
        reason: 'none'
    };
    const clientGreeted = hasClientGreeting(lastCustomerMessage);
    try {
        const [statsResult, pendingRows] = await Promise.all([
            pgQuery(
            `SELECT
                    COUNT(*)::INTEGER AS total_messages,
                    COUNT(*) FILTER (WHERE COALESCE(from_me, FALSE) = FALSE)::INTEGER AS inbound_messages,
                    MAX(created_at) FILTER (
                        WHERE COALESCE(from_me, FALSE) = TRUE
                          AND (
                            COALESCE(metadata->>'patty', '') = 'true'
                            OR LOWER(COALESCE(metadata->'agentMeta'->>'sentByUserId', '')) = 'patty'
                            OR LOWER(COALESCE(metadata->>'automationSource', '')) LIKE 'patty%'
                          )
                    ) AS last_patty_outbound_at,
                    MAX(created_at) FILTER (WHERE COALESCE(from_me, FALSE) = TRUE) AS last_outbound_at
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))`,
            [tenantId, normalizeChatId(chatId), lower(moduleId)]
            ),
            getPendingInboundRowsSinceLastPatty(tenantId, moduleId, chatId, 5)
        ]);
        const pendingClientGreeted = pendingRows.some((row) => hasClientGreeting(row.body));
        const row = statsResult.rows?.[0] || {};
        const totalMessages = Number(row.total_messages || 0);
        const inboundMessages = Number(row.inbound_messages || 0);
        if (totalMessages <= 1 || inboundMessages <= 1) {
            return { ...base, shouldGreet: true, reason: 'first_message' };
        }
        if (clientGreeted || pendingClientGreeted) {
            return { ...base, shouldGreet: true, reason: 'client_greeted' };
        }
        const lastResponseAtValue = row.last_patty_outbound_at || row.last_outbound_at;
        const lastResponseAt = lastResponseAtValue ? new Date(lastResponseAtValue).getTime() : NaN;
        if (Number.isFinite(lastResponseAt) && Date.now() - lastResponseAt > 4 * 60 * 60 * 1000) {
            return { ...base, shouldGreet: true, reason: 'long_absence' };
        }
    } catch (error) {
        if (clientGreeted) return { ...base, shouldGreet: true, reason: 'client_greeted' };
        console.warn('[Patty] greeting context skipped:', error?.message || error);
    }
    return clientGreeted ? { ...base, shouldGreet: true, reason: 'client_greeted' } : base;
}

function normalizeCustomerNameForGreeting(value = '') {
    const clean = text(value);
    return clean && !/^cliente registrado$/i.test(clean) ? clean : '';
}

function isLocationDisambiguationResponse(value = '') {
    const clean = text(value);
    if (!clean) return false;
    if (/^Para confirmarte bien el reparto/i.test(clean)
        || /^Para no darte un dato equivocado/i.test(clean)) {
        return true;
    }
    return /^Mmm, tenemos dos\s+/i.test(clean)
        || /^Encontr[eé]\s+varios\s+lugares\s+llamados\s+/i.test(clean)
        || clean.includes('¿Cuál es el tuyo?')
        || clean.includes('Â¿CuÃ¡l es el tuyo?');
}

function applyGreetingToResponse(response = '', greetingInstruction = {}, customerName = '', assistantName = DEFAULT_ASSISTANT_NAME, moduleName = '') {
    const cleanResponse = text(response);
    if (!cleanResponse || greetingInstruction?.shouldGreet !== true) return cleanResponse;
    const greeting = text(greetingInstruction.greetingText) || greetingTextForTimeOfDay(greetingInstruction.timeOfDay);
    const cleanName = normalizeCustomerNameForGreeting(customerName);
    if (isLocationDisambiguationResponse(cleanResponse)) {
        const prefix = cleanName
            ? `¡${greeting}, ${cleanName}! 😊`
            : `¡${greeting}! 😊`;
        return `${prefix}\n${cleanResponse}`;
    }
    if (greetingInstruction?.isFirstInteraction === true && greetingInstruction?.isKnownCustomer !== true) {
        const cleanAssistantName = text(assistantName) || DEFAULT_ASSISTANT_NAME;
        const cleanModuleName = text(moduleName);
        const intro = cleanModuleName
            ? `¡${greeting}, soy ${cleanAssistantName} de ${cleanModuleName}! 😊`
            : `¡${greeting}, soy ${cleanAssistantName}! 😊`;
        return `${intro}\nEstoy aquí para ayudarte con lo que necesites.\n${cleanResponse}`;
    }
    const prefix = cleanName
        ? `${greeting}, ${cleanName}.`
        : `${greeting}.`;
    return `${prefix}\n${cleanResponse}`;
}

async function getPendingInboundMessagesContext(tenantId, moduleId, chatId) {
    try {
        const ordered = await getPendingInboundRowsSinceLastPatty(tenantId, moduleId, chatId, 5);
        const ids = ordered.map((row) => text(row.message_id)).filter(Boolean);
        const messages = ordered
            .map((row) => ({
                messageId: text(row.message_id),
                body: text(row.body).replace(/\s+/g, ' '),
                createdAt: row.created_at || null
            }))
            .filter((row) => row.body);
        const lines = ordered
            .map((row) => {
                const messageId = text(row.message_id);
                const body = text(row.body).replace(/\s+/g, ' ');
                return messageId && body ? `  [${messageId}] "${body.slice(0, 240)}"` : '';
            })
            .filter(Boolean);
        const combinedText = messages
            .map((row) => row.body)
            .filter(Boolean)
            .join('\n');
        const latest = messages[messages.length - 1] || null;
        return {
            lines,
            ids,
            messages,
            combinedText,
            latestText: latest?.body || '',
            latestId: latest?.messageId || ''
        };
    } catch (error) {
        console.warn('[Patty] pending inbound context skipped:', error?.message || error);
        return { lines: [], ids: [], messages: [], combinedText: '', latestText: '', latestId: '' };
    }
}

async function getActiveQuoteContext(tenantId, moduleId, chatId) {
    try {
        const { rows } = await pgQuery(
            `SELECT quote_id, status, items_json, summary_json, sent_at, created_at, updated_at
               FROM tenant_quotes
              WHERE tenant_id = $1
                AND chat_id = $2
                AND status IN ('sent', 'draft', 'accepted', 'programado')
                AND created_at > NOW() - INTERVAL '72 hours'
                AND (scope_module_id IS NULL OR scope_module_id = '' OR LOWER(scope_module_id) = LOWER($3))
              ORDER BY created_at DESC
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
        if (status === 'accepted' || status === 'programado') {
            return [
                'COTIZACION BASE PARA MODIFICACIONES:',
                `ID: ${text(row.quote_id)}`,
                `Estado: ${status}`,
                'Productos:',
                products,
                `Total: S/ ${formatMoney(total)}`,
                '',
                'INSTRUCCION: Si el cliente pide agregar o quitar productos, usa estos como base en el nuevo quoteRequest.',
                status === 'programado'
                    ? 'INSTRUCCION CRITICA: Si el pedido esta PROGRAMADO y el cliente pide cambios, responde SOLO: "Entendido, en un momento te confirmamos si podemos agregar eso a tu pedido 🙌". NO incluyas lista de productos ni precios. NO generes quoteRequest; activa el modo de asistencia (needs_advisor=true).'
                    : ''
            ].filter(Boolean).join('\n');
        }
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
                '  - Si el cliente confirma sin cambios: NO generar quoteRequest',
                '  - Si el estado es PROGRAMADO y el cliente pide cambios: responder SOLO con el mensaje de confirmacion pendiente, sin productos, sin precios y sin quoteRequest.'
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

async function activateNeedsAdvisorForProgrammedChange({
    tenantId,
    moduleId,
    chatId,
    assistantName,
    moduleName = '',
    emitToRuntimeContext,
    emitCommercialStatusUpdated
} = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    const cleanChatId = normalizeChatId(chatId);
    const assistantDisplayName = formatAssistantDisplayName(assistantName);
    const cleanModuleName = text(moduleName);
    const advisorReason = 'cliente_solicita_cambio_programado';
    await waClient.sendMessage(cleanChatId, PROGRAMMED_CHANGE_RESPONSE, {
        metadata: {
            agentMeta: {
                sentByUserId: 'patty',
                sentByName: assistantDisplayName,
                sentByRole: 'assistant',
                sentViaModuleId: cleanModuleId,
                sentViaModuleName: cleanModuleName || null
            },
            patty: true,
            automationSource: 'patty_needs_advisor'
        }
    });
    const advisorResult = await chatCommercialStatusService.setNeedsAdvisor(
        cleanTenantId,
        cleanChatId,
        cleanModuleId,
        advisorReason
    );
    await chatCommercialStatusService.resetChatPattyMode(cleanTenantId, {
        chatId: cleanChatId,
        scopeModuleId: cleanModuleId,
        reason: advisorReason
    });
    await conversationOpsService.clearChatAssignment(cleanTenantId, {
        chatId: cleanChatId,
        scopeModuleId: cleanModuleId,
        assignedByUserId: null,
        assignmentMode: 'system',
        assignmentReason: advisorReason
    });
    if (typeof emitCommercialStatusUpdated === 'function') {
        emitCommercialStatusUpdated({
            tenantId: cleanTenantId,
            chatId: cleanChatId,
            scopeModuleId: cleanModuleId,
            result: advisorResult,
            source: 'patty.needs_advisor'
        });
    }
    if (typeof emitCommercialStatusUpdated !== 'function' && typeof emitToRuntimeContext === 'function') {
        emitToRuntimeContext('chat_needs_advisor', {
            tenantId: cleanTenantId,
            chatId: cleanChatId,
            scopeModuleId: cleanModuleId,
            reason: advisorReason,
            needsAdvisor: true,
            at: new Date().toISOString()
        });
    }
    console.log('[Patty] needs advisor activated for programmed order change', {
        tenantId: cleanTenantId,
        moduleId: cleanModuleId,
        chatId: cleanChatId,
        reason: advisorReason
    });
    return advisorResult;
}

async function markNeedsAdvisorFromPatty({
    tenantId,
    moduleId,
    chatId,
    reason,
    emitToRuntimeContext,
    emitCommercialStatusUpdated,
    source = 'patty.needs_advisor'
} = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    const cleanChatId = normalizeChatId(chatId);
    const cleanReason = text(reason) || 'patty_needs_advisor';
    const result = await chatCommercialStatusService.setNeedsAdvisor(
        cleanTenantId,
        cleanChatId,
        cleanModuleId,
        cleanReason
    );
    if (typeof emitCommercialStatusUpdated === 'function') {
        emitCommercialStatusUpdated({
            tenantId: cleanTenantId,
            chatId: cleanChatId,
            scopeModuleId: cleanModuleId,
            result,
            source
        });
    } else if (typeof emitToRuntimeContext === 'function') {
        emitToRuntimeContext('chat_needs_advisor', {
            tenantId: cleanTenantId,
            chatId: cleanChatId,
            scopeModuleId: cleanModuleId,
            reason: cleanReason,
            needsAdvisor: true,
            at: new Date().toISOString()
        });
    }
    console.log('[Patty] needs advisor activated:', cleanReason, {
        tenantId: cleanTenantId,
        moduleId: cleanModuleId,
        chatId: cleanChatId
    });
    return result;
}

async function escalateToAdvisor(
    tenantId,
    chatId,
    scopeModuleId,
    reason,
    responseText,
    emitCommercialStatusUpdated,
    socketEmitter,
    assistantName = DEFAULT_ASSISTANT_NAME,
    moduleName = ''
) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanChatId = normalizeChatId(chatId);
    const cleanScopeModuleId = lower(scopeModuleId);
    const cleanReason = text(reason) || 'patty_needs_advisor';
    const assistantDisplayName = formatAssistantDisplayName(assistantName);
    const cleanModuleName = text(moduleName);
    const cleanResponse = text(responseText);
    if (cleanResponse) {
        await waClient.sendMessage(cleanChatId, cleanResponse, {
            metadata: {
                agentMeta: {
                    sentByUserId: 'patty',
                    sentByName: assistantDisplayName,
                    sentByRole: 'assistant',
                    sentViaModuleId: cleanScopeModuleId,
                    sentViaModuleName: cleanModuleName || null
                },
                patty: true,
                automationSource: 'patty_escalation'
            }
        });
    }
    const result = await chatCommercialStatusService.setNeedsAdvisor(
        cleanTenantId,
        cleanChatId,
        cleanScopeModuleId,
        cleanReason
    );
    await chatCommercialStatusService.setChatPattyMode(cleanTenantId, {
        chatId: cleanChatId,
        scopeModuleId: cleanScopeModuleId,
        mode: 'review',
        reason: cleanReason
    });
    if (typeof emitCommercialStatusUpdated === 'function') {
        emitCommercialStatusUpdated({
            tenantId: cleanTenantId,
            chatId: cleanChatId,
            scopeModuleId: cleanScopeModuleId,
            result,
            source: 'patty.escalated_to_advisor'
        });
    } else if (typeof socketEmitter === 'function') {
        socketEmitter('chat_needs_advisor', {
            tenantId: cleanTenantId,
            chatId: cleanChatId,
            scopeModuleId: cleanScopeModuleId,
            reason: cleanReason,
            needsAdvisor: true,
            at: new Date().toISOString()
        });
    } else if (socketEmitter?.to && typeof socketEmitter.to === 'function') {
        socketEmitter.to(cleanTenantId).emit('chat_needs_advisor', {
            chatId: cleanChatId,
            scopeModuleId: cleanScopeModuleId,
            reason: cleanReason,
            needsAdvisor: true,
            at: new Date().toISOString()
        });
    }
    console.log('[Patty] escalated to advisor:', cleanReason, {
        tenantId: cleanTenantId,
        moduleId: cleanScopeModuleId,
        chatId: cleanChatId
    });
    return result;
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

function extractOrderPayloadProducts(orderPayload) {
    const order = safeJsonObject(orderPayload);
    const candidates = [
        order.products,
        order.items,
        order.product_items,
        order.order?.products,
        order.order?.product_items
    ];
    const rawProducts = candidates.find((items) => Array.isArray(items) && items.length) || [];
    return rawProducts.map((item) => {
        const quantity = Math.max(1, Number(item.quantity || item.qty || item.count || 1) || 1);
        const price = money(item.price || item.unitPrice || item.unit_price || item.lineTotal || item.line_total);
        const lineTotal = money(item.lineTotal || item.line_total || (Number.isFinite(price) ? price * quantity : null));
        return {
            sku: text(item.sku || item.itemId || item.item_id || item.product_retailer_id || item.id),
            title: text(item.name || item.title || item.productName || item.product_name || item.sku || item.id || 'Producto'),
            quantity,
            price: Number.isFinite(price) ? price : null,
            lineTotal: Number.isFinite(lineTotal) ? lineTotal : null
        };
    }).filter((item) => item.title || item.sku);
}

function buildMetaCatalogOrderContext(row = {}) {
    const order = safeJsonObject(row.order_payload);
    const products = extractOrderPayloadProducts(order);
    if (!products.length) return '';
    const total = money(
        order.total
        || order.totalPayable
        || order.subtotal
        || order.summary?.totalPayable
        || products.reduce((acc, item) => acc + (money(item.lineTotal) || 0), 0)
    );
    const productLines = products.map((item) => {
        const sku = item.sku ? `[${item.sku}] ` : '';
        const priceText = item.lineTotal !== null ? ` = S/ ${item.lineTotal.toFixed(2)}` : '';
        return `- ${sku}${item.title} x ${item.quantity}${priceText}`;
    });
    return [
        '⚠️ PEDIDO DEL CATALOGO META RECIBIDO:',
        'El cliente envio un pedido desde el catalogo WhatsApp:',
        ...productLines,
        Number.isFinite(total) ? `Total: S/ ${total.toFixed(2)}` : '',
        '',
        'INSTRUCCION CRITICA: Reconoce el pedido, confirma los productos y genera quoteRequest con exactamente esos productos. NO ignores este pedido.'
    ].filter(Boolean).join('\n');
}

async function getRecentMetaCatalogOrderContext(tenantId, moduleId, chatId) {
    try {
        const { rows } = await pgQuery(
            `SELECT message_id, order_payload, metadata, created_at
               FROM tenant_messages
              WHERE tenant_id = $1
                AND chat_id = $2
                AND COALESCE(from_me, FALSE) = FALSE
                AND message_type = 'order'
                AND created_at >= NOW() - INTERVAL '2 hours'
                AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
              ORDER BY created_at DESC
              LIMIT 1`,
            [tenantId, normalizeChatId(chatId), lower(moduleId)]
        );
        return buildMetaCatalogOrderContext(rows?.[0] || {});
    } catch (error) {
        console.warn('[Patty] recent Meta order context skipped:', error?.message || error);
        return '';
    }
}

async function createAndSendPattyQuote({
    tenantId,
    moduleId,
    chatId,
    assistantName,
    moduleName = '',
    quoteRequest,
    emitToRuntimeContext,
    emitCommercialStatusUpdated,
    persistMessageHistory
} = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = lower(moduleId);
    const cleanChatId = normalizeChatId(chatId);
    const cleanModuleName = text(moduleName);
    const request = quoteRequest && typeof quoteRequest === 'object' ? quoteRequest : null;
    if (!request || !Array.isArray(request.products) || !request.products.length) return null;

    const currentState = await getCurrentCommercialState(cleanTenantId, cleanModuleId, cleanChatId);
    if (currentState.status === 'programado') {
        await activateNeedsAdvisorForProgrammedChange({
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            assistantName,
            moduleName: cleanModuleName,
            emitToRuntimeContext,
            emitCommercialStatusUpdated
        });
        return null;
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
        moduleName: cleanModuleName || null,
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
                    sentViaModuleId: cleanModuleId,
                    sentViaModuleName: cleanModuleName || null
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
                    sentViaModuleId: cleanModuleId,
                    sentViaModuleName: cleanModuleName || null
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
            sentViaModuleName: cleanModuleName || null,
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
                    sentViaModuleId: cleanModuleId,
                    sentViaModuleName: cleanModuleName || null
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
    const [scheduleState, basePrompt, quickReplies, customer, commercialStatus, origin, conversation, pendingInbound, quote, metaCatalogOrder] = await Promise.all([
        resolveScheduleState(cleanTenantId, moduleConfig || {}),
        getBasePrompt(cleanTenantId),
        getQuickRepliesContext(cleanTenantId, cleanModuleId),
        getCustomerContext(cleanTenantId, cleanModuleId, cleanChatId),
        getCommercialStatusContext(cleanTenantId, cleanModuleId, cleanChatId),
        getOriginContext(cleanTenantId, cleanModuleId, cleanChatId),
        getConversationContext(cleanTenantId, cleanModuleId, cleanChatId),
        getPendingInboundMessagesContext(cleanTenantId, cleanModuleId, cleanChatId),
        getActiveQuoteContext(cleanTenantId, cleanModuleId, cleanChatId),
        getRecentMetaCatalogOrderContext(cleanTenantId, cleanModuleId, cleanChatId)
    ]);
    const pendingBatchText = text(pendingInbound.combinedText || '');
    const latestCustomerMessage = text(pendingInbound.latestText || conversation.lastCustomerMessage || '');
    const effectiveCustomerMessage = pendingBatchText || latestCustomerMessage || conversation.lastCustomerMessage || '';
    const latestCustomerMessageId = text(pendingInbound.latestId || conversation.lastCustomerMessageId || '');
    const recentConversationText = [
        ...(Array.isArray(conversation.lines) ? conversation.lines : []),
        effectiveCustomerMessage || ''
    ].join('\n');
    const [catalog, zoneDecision, greetingInstruction] = await Promise.all([
        getCatalogContext(cleanTenantId, recentConversationText, effectiveCustomerMessage || latestCustomerMessage || ''),
        buildZoneDecision(cleanTenantId, recentConversationText, latestCustomerMessage || effectiveCustomerMessage || '', {
            chatId: cleanChatId,
            scopeModuleId: cleanModuleId,
            sourceMessageId: latestCustomerMessageId || ''
        }),
        getGreetingInstructionContext(cleanTenantId, cleanModuleId, cleanChatId, latestCustomerMessage || effectiveCustomerMessage || '')
    ]);
    const zones = await getZonesContext(cleanTenantId, recentConversationText, zoneDecision, latestCustomerMessage || effectiveCustomerMessage || '');
    const labels = await getCustomerLabelsContext(cleanTenantId, customer.customerId);
    const recentOrder = formatOrderContext(conversation.recentOrder);
    const moduleName = text(moduleConfig?.name || moduleConfig?.moduleName || moduleConfig?.module_name || cleanModuleId);
    const isKnownCustomer = Boolean(customer.customerId);
    const customerNameForPrompt = normalizeCustomerNameForGreeting(customer.customerName);
    const isFirstInteraction = !isKnownCustomer && greetingInstruction.reason === 'first_message';
    const pattyGreetingInstruction = {
        ...greetingInstruction,
        isFirstInteraction,
        isKnownCustomer,
        customerName: customerNameForPrompt || null
    };
    const catalogText = lineList(catalog.lines);
    const relevantCatalogText = lineList(catalog.relevantLines, '');
    const mentionedCatalogText = lineList(catalog.mentionedDetails, '');
    const pendingInboundText = lineList(pendingInbound.lines, '');
    const zonesText = lineList(zones);
    const hasDetectedZone = (Array.isArray(zones) ? zones : []).some((entry) => text(entry).startsWith('ZONA DETECTADA PARA ESTE CLIENTE:'));
    const antiHallucinationGuard = buildAntiHallucinationGuardResponse({
        lastMessage: latestCustomerMessage || effectiveCustomerMessage || '',
        conversationLines: conversation.lines,
        zoneDecision
    });
    const rawDeterministicResponse = antiHallucinationGuard?.response
        || buildSoftPauseResponse(latestCustomerMessage || effectiveCustomerMessage || '')
        || buildDeterministicDeliveryPaymentResponse(zoneDecision, latestCustomerMessage || effectiveCustomerMessage || '', {
            conversationLines: conversation.lines
        });
    const deterministicNeedsAdvisorReason = antiHallucinationGuard?.needsAdvisorReason
        || (shouldUseKnownLocationNoZoneResponse(latestCustomerMessage || effectiveCustomerMessage || '', zoneDecision)
        ? 'sin_cobertura_zona'
        : '');
    const deterministicSource = antiHallucinationGuard?.source
        || (deterministicNeedsAdvisorReason === 'sin_cobertura_zona'
            ? 'patty.no_zone'
            : (isSoftPauseIntent(latestCustomerMessage || effectiveCustomerMessage || '')
                ? 'patty.soft_pause'
                : (rawDeterministicResponse ? 'patty.deterministic_delivery_payment' : '')));
    const deterministicResponse = applyGreetingToResponse(
        rawDeterministicResponse,
        pattyGreetingInstruction,
        customerNameForPrompt,
        assistantName,
        moduleName
    );
    logGeoResolveAttempt(recentConversationText, zoneDecision, deterministicResponse);
    if (String(process.env.PATTY_DEBUG || '').trim().toLowerCase() === 'true') {
        console.log('[Patty] catalog context preview', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chars: catalogText.length,
            preview: catalogText.slice(0, 200)
        });
    }
    const system = [
        'REGLA FUNDAMENTAL - NUNCA INVENTAR:',
        'Solo afirma lo que esta verificado en el contexto. Si no tienes el dato, usa una frase de escalado natural y no inventes ni supongas.',
        'Aplica especialmente a precios, costos de envio, cobertura geografica, metodos de pago, agencias, stock, aromas, descuentos y caracteristicas de productos no listadas en el catalogo.',
        'Cuando no tienes el dato, usa frases como: "Dejame consultar eso con mi supervisor. En breve te confirmamos.", "Dejame verificar ese dato con el equipo." o "No tengo ese dato ahora. Lo consulto y te escribo."',
        'NUNCA digas: "te derivo", "no puedo ayudarte", "consulta con soporte". Mantén el tono de que tu estas gestionando la situacion.',
        '',
        'CONTEXTO CRITICO DE ESTA RESPUESTA:',
        hasDetectedZone ? 'ZONA PRIORITARIA DETECTADA PARA RESPONDER ENVIO/PAGO:' : '',
        hasDetectedZone ? zonesText : '',
        quote ? '\nCOTIZACION / PEDIDO ACTUAL:' : '',
        quote || '',
        `ULTIMO MENSAJE DEL CLIENTE: ${latestCustomerMessage || 'Sin ultimo mensaje registrado.'}`,
        pendingBatchText ? `BLOQUE COMPLETO PENDIENTE DEL CLIENTE:\n${pendingBatchText}` : '',
        conversation.quotedReferenceContext ? '\nREFERENCIA DEL MENSAJE RESPONDIDO:' : '',
        conversation.quotedReferenceContext || '',
        relevantCatalogText ? '\nPRODUCTOS RELEVANTES PARA TU CONSULTA:' : '',
        relevantCatalogText,
        '',
        'INSTRUCCION DE SALUDO:',
        `shouldGreet: ${pattyGreetingInstruction.shouldGreet ? 'true' : 'false'}`,
        `timeOfDay: ${pattyGreetingInstruction.timeOfDay}`,
        `reason: ${pattyGreetingInstruction.reason}`,
        `saludo: ${pattyGreetingInstruction.greetingText}`,
        `isFirstInteraction: ${pattyGreetingInstruction.isFirstInteraction ? 'true' : 'false'}`,
        `isKnownCustomer: ${pattyGreetingInstruction.isKnownCustomer ? 'true' : 'false'}`,
        `customerName: ${pattyGreetingInstruction.customerName || 'null'}`,
        '',
        'PROMPT BASE DEL ASISTENTE:',
        basePrompt || 'Eres una asesora comercial experta de WhatsApp. Responde de forma breve, clara, humana y orientada a venta consultiva.',
        '',
        `Tu nombre visible es: ${assistantName}.`,
        `Modulo: ${moduleName || 'sin modulo'}. ${scheduleState.label}.`,
        '',
        'INSTRUCCIÓN CRÍTICA: Si el contexto incluye una sección "⚠️ COTIZACIÓN ACTIVA", NO incluyas quoteRequest salvo que el último mensaje del cliente pida cambios explícitos en productos, cantidades o reemplazos.',
        '',
        'NEGOCIO / CATALOGO:',
        relevantCatalogText ? 'PRODUCTOS RELEVANTES PARA TU CONSULTA:' : '',
        relevantCatalogText,
        relevantCatalogText ? '' : '',
        catalogText,
        mentionedCatalogText ? '\nPRODUCTOS MENCIONADOS EN CONVERSACION:' : '',
        mentionedCatalogText,
        '',
        'RESPUESTAS RAPIDAS PARA PATTY:',
        lineList(quickReplies),
        '',
        hasDetectedZone ? '' : 'ZONAS DE COBERTURA Y ENVIO:',
        hasDetectedZone ? '' : zonesText,
        '',
        'DATOS DEL CLIENTE:',
        customer.summary,
        labels ? `\n${labels}` : '',
        commercialStatus ? `\n${commercialStatus}` : '',
        metaCatalogOrder ? `\n${metaCatalogOrder}` : '',
        '',
        'ORIGEN DEL CONTACTO:',
        origin,
        '',
        'CONVERSACION RECIENTE:',
        lineList(conversation.lines),
        conversation.quotedReferenceContext ? '\nREFERENCIA DEL MENSAJE RESPONDIDO:' : '',
        conversation.quotedReferenceContext || '',
        pendingInboundText ? '\nMENSAJES PENDIENTES DE RESPUESTA:' : '',
        pendingInboundText,
        recentOrder ? `\n${recentOrder}` : '',
        '',
        'INSTRUCCIONES:',
        '- Devuelve exclusivamente JSON valido, sin markdown, sin texto adicional.',
        '- Formato obligatorio: {"messages":[{"text":"texto del mensaje","quotedMessageId":"message_id inbound relevante o null"}]}.',
        '- Si el cliente envio multiples mensajes sobre temas distintos, responde cada tema en un mensaje separado.',
        '- Cada mensaje debe tener maximo 3 lineas.',
        '- quotedMessageId debe ser el message_id del mensaje CLIENTE mas relevante para esa respuesta.',
        '- REGLA DE CITADO: Si hay UNA sola pregunta o intencion, genera UN mensaje con quotedMessageId: null.',
        '- REGLA DE CITADO: Si hay MULTIPLES preguntas sobre temas DISTINTOS, genera UN mensaje por pregunta y usa quotedMessageId de la seccion MENSAJES PENDIENTES DE RESPUESTA.',
        '- REGLA DE CITADO: Una sola intencion con varios mensajes sobre el mismo tema NO se cita. Multiples intenciones distintas SI se citan.',
        '- Si solo hay un tema, usa un array con un solo mensaje. Maximo 3 mensajes por respuesta.',
        '- FORMATO CORRECTO (copiar exactamente): {"messages":[{"text":"tu mensaje aqui","quotedMessageId":null}],"quoteRequest":{},"catalogProducts":[]}.',
        '- FORMATO INCORRECTO (nunca hacer esto): {"messages":[{"text":"..."},"quotedMessageId":null]}. quotedMessageId va DENTRO del mismo objeto del mensaje.',
        '- Si el cliente claramente acepta o pide una cotizacion, agrega quoteRequest con products usando el titulo EXACTO del catalogo: {"products":[{"title":"Nombre exacto del producto","qty":1}]}.',
        '- quoteRequest NO debe incluir campo note. Solo incluir: {"products":[{"title":"Nombre exacto del producto","qty":1}]}.',
        '- Cuando el cliente pida ver productos o el catalogo, incluye catalogProducts como array de SKUs exactos entre corchetes del catalogo. Ejemplo: si el catalogo dice "- [SKU_DEL_PRODUCTO_MENCIONADO_EN_TU_TEXTO] Producto elegido: S/ 39.90", entonces catalogProducts debe ser ["SKU_DEL_PRODUCTO_MENCIONADO_EN_TU_TEXTO"]. NUNCA uses el titulo, SIEMPRE el codigo entre corchetes. Maximo 5 productos por respuesta.',
        '- Si el cliente pregunta de forma general "que productos tienen", "que venden" o "catalogo" sin mencionar una categoria concreta, NO incluyas catalogProducts. Responde con una lista breve en texto y pregunta que tipo de producto quiere ver.',
        '- En catalogProducts incluye SOLO los SKUs de los productos que mencionaste en tu respuesta de texto. Si mencionaste "Detergente Concentrado 4L", incluye su SKU. No incluyas productos adicionales ni kits salvo que el cliente los haya pedido explicitamente.',
        '- Cuando generes quoteRequest, messages[] solo debe tener UNA linea de intro como "He agregado [producto] a tu pedido 😊" o "Aquí va tu cotización actualizada 👇". NUNCA incluyas lista de productos, precios ni subtotales en el texto; la cotizacion ya los muestra.',
        '- Cuando generes quoteRequest para modificar una cotizacion existente, products[] debe incluir TODOS los productos del resultado final, no solo los cambios. Ejemplo: si hay 2 productos actuales y el cliente agrega 1, products[] debe tener 3 items.',
        '- Si el estado es PROGRAMADO y el cliente pide cambios, responde SOLO: "Entendido, en un momento te confirmamos si podemos agregar eso a tu pedido 🙌". NO incluyas lista de productos ni precios. NO generes quoteRequest.',
        '- Si el contexto incluye "PEDIDO DEL CATALOGO META RECIBIDO", reconoce ese pedido y genera quoteRequest con exactamente esos productos, cantidades y titulos.',
        '- El title debe copiarse del catalogo tal como aparece despues del SKU entre corchetes. No inventes SKUs ni codigos. Si incluyes sku, debe ser exactamente uno de los SKUs entre corchetes.',
        '- Incluye quoteRequest solo cuando haya una aceptacion o solicitud clara de cotizacion.',
        '- IMPORTANTE: Solo genera quoteRequest cuando el cliente confirma EXPLICITAMENTE que productos quiere cotizar. "Si", "claro", "ok" o "dale" como respuesta a opciones o informacion NO confirma cotizacion; significa que quiere mas informacion. Cotiza solo con frases como "cotizame eso", "quiero esos productos", "dame el precio de todo" o "haz el pedido".',
        '- Si el cliente dice "este", "ese", "me interesa", "lo quiero", "ese producto" o "el primero" sin indicar cantidad, NO generes quoteRequest. Pregunta primero: "¿Cuántas unidades te gustaría? 😊".',
        '- Si el cliente pregunta por promociones, ofertas, combos, paquetes o kits, responde con kits del catalogo si existen. No lo trates como descuento no confirmado.',
        '- Para kits o combos: NUNCA inventes componentes, presentaciones, aromas ni contenido del kit. Solo di "incluye" si los componentes aparecen literalmente en PRODUCTOS MENCIONADOS EN CONVERSACION o en el detalle del catalogo. Si no hay detalle, explica la finalidad del kit y ofrece confirmar el contenido.',
        '- Si el cliente dice "ok te aviso", "luego te confirmo" o algo similar, no cierres la conversacion con frases tipo "aqui estare". Mantente disponible y deja una siguiente accion suave: elegir por uso, cantidad o presupuesto.',
        '- Cuando el cliente mencione su ubicacion, busca en las zonas de cobertura y responde con las opciones de envio y metodos de pago disponibles para esa zona. Si la ubicacion no esta en cobertura, dilo claramente.',
        '- Cuando el cliente indique su ubicacion, identifica su zona de cobertura y menciona el costo de envio y metodos de pago disponibles para esa zona.',
        '- Si INSTRUCCION DE SALUDO indica shouldGreet: true, comienza tu respuesta con el saludo correspondiente segun timeOfDay: Buenos días / Buenas tardes / Buenas noches, seguido del nombre del cliente si lo conoces. Si shouldGreet: false, NO saludes; continua natural.',
        '- PRIMER CONTACTO: Si isFirstInteraction=true e isKnownCustomer=false, preséntate siempre con: "¡[saludo según hora], soy [assistantName] de [nombre del módulo]! 😊 Estoy aquí para ayudarte con lo que necesites." Luego pregunta en qué puedes ayudar.',
        '- CLIENTE CONOCIDO: Si isKnownCustomer=true y shouldGreet=true, saluda por nombre si customerName existe: "¡[saludo], [nombre]! ¿En qué te ayudo hoy? 😊". Si customerName=null, saluda sin nombre: "¡[saludo]! ¿En qué te ayudo? 😊".',
        '- NUNCA te presentes si ya hubo interacción previa. Si shouldGreet=false, continúa natural sin saludo.',
        '- Si el cliente pregunta por credito, cuotas o pagos a plazos, responde empaticamente que Lavitat no ofrece credito directo. Si el cliente insiste, activa needs_advisor con reason: "cliente_solicita_credito" para que un asesor lo atienda.',
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
        zoneDecision,
        greetingInstruction: pattyGreetingInstruction,
        isFirstInteraction,
        isKnownCustomer,
        customerName: customerNameForPrompt || null,
        pendingInboundMessageIds: Array.isArray(pendingInbound.ids) ? pendingInbound.ids : [],
        quotedReferenceContext: conversation.quotedReferenceContext || '',
        system,
        deterministicResponse,
        deterministicNeedsAdvisorReason,
        deterministicSource,
        lastCustomerMessage: effectiveCustomerMessage || 'Continua la conversacion con el cliente.'
    };
}

async function generatePattySuggestion(tenantId, moduleId, chatId, prebuiltContext = null) {
    const context = prebuiltContext || await buildPattyContext(tenantId, moduleId, chatId);
    const moduleAssistantId = text(context.moduleConfig?.metadata?.moduleSettings?.aiAssistantId).toUpperCase();
    console.log('[Patty] generating suggestion', {
        tenantId: context.tenantId,
        moduleId: context.moduleId,
        chatId: context.chatId,
        moduleAssistantId: moduleAssistantId || null,
        contextChars: context.system.length,
        lastCustomerMessageChars: context.lastCustomerMessage.length
    });
    if (context.deterministicResponse) {
        const messages = [{ text: context.deterministicResponse, quotedMessageId: null }];
        console.log('[Patty] deterministic delivery/payment response', {
            tenantId: context.tenantId,
            moduleId: context.moduleId,
            chatId: context.chatId
        });
        return {
            ...context,
            suggestion: context.deterministicResponse,
            messages,
            quoteRequest: null,
            catalogProducts: [],
            rawSuggestion: context.deterministicResponse
        };
    }
    const rawSuggestion = await getChatSuggestion(
        context.system,
        [
            'REGLA FUNDAMENTAL - NUNCA INVENTAR: Solo afirma lo que esta verificado en el contexto. Si no tienes el dato, usa una frase de escalado natural y no inventes ni supongas.',
            'Aplica especialmente a precios, costos de envio, cobertura geografica, metodos de pago, agencias, stock, aromas, descuentos y caracteristicas de productos no listadas en el catalogo.',
            'NUNCA digas "te derivo", "no puedo ayudarte" ni "consulta con soporte"; mantén el tono de que tu estas gestionando la situacion.',
            '',
            `Ultimo mensaje del cliente: ${context.lastCustomerMessage}`,
            '',
            'INSTRUCCIÓN CRÍTICA: Si el contexto incluye "⚠️ COTIZACIÓN ACTIVA", NO incluyas quoteRequest salvo que este último mensaje pida cambios explícitos en productos, cantidades o reemplazos.',
            '',
            'Responde con JSON valido exactamente en este formato:',
            '{"messages":[{"text":"texto listo para enviar por WhatsApp","quotedMessageId":"message_id inbound relevante o null"}],"quoteRequest":{"products":[{"title":"Nombre exacto del producto del catalogo","qty":1}]},"catalogProducts":["SKU_DEL_PRODUCTO_MENCIONADO_EN_TU_TEXTO"]}',
            'FORMATO CORRECTO (copiar exactamente): {"messages":[{"text":"tu mensaje aqui","quotedMessageId":null}],"quoteRequest":{},"catalogProducts":[]}',
            'FORMATO INCORRECTO (nunca hacer esto): {"messages":[{"text":"..."},"quotedMessageId":null]}. quotedMessageId va DENTRO del mismo objeto del mensaje.',
            'REGLA DE CITADO: Si hay UNA sola pregunta o intencion, devuelve un solo mensaje con quotedMessageId:null. Si hay MULTIPLES preguntas sobre temas distintos, devuelve un mensaje por pregunta y usa solo message_id reales de MENSAJES PENDIENTES DE RESPUESTA.',
            'quoteRequest NO debe incluir campo note. Solo incluir products con title y qty.',
            'catalogProducts debe ser un array de SKUs exactos entre corchetes del catalogo. Ejemplo: si el catalogo dice "- [SKU_DEL_PRODUCTO_MENCIONADO_EN_TU_TEXTO] Producto elegido: S/ 39.90", entonces catalogProducts debe ser ["SKU_DEL_PRODUCTO_MENCIONADO_EN_TU_TEXTO"]. NUNCA uses el titulo del producto, SIEMPRE el codigo entre corchetes. Maximo 5 productos por respuesta.',
            'Si el cliente pregunta de forma general "que productos tienen", "que venden" o "catalogo" sin mencionar una categoria concreta, NO incluyas catalogProducts. Responde con una lista breve en texto y pregunta que tipo de producto quiere ver.',
            'En catalogProducts incluye SOLO los SKUs de los productos que mencionaste en tu respuesta de texto. Si mencionaste "Detergente Concentrado 4L", incluye su SKU. No incluyas productos adicionales ni kits salvo que el cliente los haya pedido explicitamente.',
            'Cuando incluyas quoteRequest, messages[] debe contener UNA sola linea de intro como "He agregado [producto] a tu pedido 😊" o "Aquí va tu cotización actualizada 👇". NUNCA incluyas lista de productos, precios ni subtotales en el texto; la cotizacion ya los muestra.',
            'Si quoteRequest modifica una cotizacion existente, products[] debe incluir TODOS los productos del resultado final, no solo el producto agregado/quitado/cambiado.',
            'Si el estado es PROGRAMADO y el cliente pide cambios, responde SOLO: "Entendido, en un momento te confirmamos si podemos agregar eso a tu pedido 🙌". NO incluyas lista de productos ni precios. NO generes quoteRequest.',
            'Para quoteRequest usa el title exacto del catalogo. No uses SKUs inventados; si agregas sku, debe existir exactamente entre corchetes en el catalogo.',
            'IMPORTANTE: Solo genera quoteRequest cuando el cliente confirma EXPLICITAMENTE que productos quiere cotizar. "Si", "claro", "ok" o "dale" como respuesta a opciones o informacion NO confirma cotizacion; significa que quiere mas informacion. Cotiza solo con frases como "cotizame eso", "quiero esos productos", "dame el precio de todo" o "haz el pedido".',
            'Si el cliente dice "este", "ese", "me interesa", "lo quiero", "ese producto" o "el primero" sin indicar cantidad, NO generes quoteRequest. Pregunta primero: "¿Cuántas unidades te gustaría? 😊".',
            'Si el cliente pregunta por promociones, ofertas, combos, paquetes o kits, responde con kits del catalogo si existen. No lo trates como descuento no confirmado.',
            'Para kits o combos: NUNCA inventes componentes, presentaciones, aromas ni contenido del kit. Solo di "incluye" si los componentes aparecen literalmente en el contexto del catalogo. Si no hay detalle, explica la finalidad del kit y ofrece confirmar el contenido.',
            'Si el cliente dice "ok te aviso", "luego te confirmo" o algo similar, no cierres la conversacion con frases tipo "aqui estare". Mantente disponible y deja una siguiente accion suave: elegir por uso, cantidad o presupuesto.',
            'Si el cliente pregunta por credito, cuotas o pagos a plazos, responde empaticamente que Lavitat no ofrece credito directo. Si insiste, solicita apoyo de asesor con reason cliente_solicita_credito.',
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
                : null,
            preserveFullContext: true
        }
    );
    let quoteRequest = normalizePattyQuoteRequest(rawSuggestion);
    let messages = normalizePattyMessages(rawSuggestion);
    const blockedMissingQuantity = shouldBlockQuoteForMissingQuantity(quoteRequest, context.lastCustomerMessage);
    if (blockedMissingQuantity) {
        quoteRequest = null;
        messages = [{ text: '¿Cuántas unidades te gustaría? 😊', quotedMessageId: null }];
    } else if (quoteRequest) {
        messages = normalizeQuoteIntroMessages(messages);
    }
    messages = sanitizePattyMessageQuotes(messages, context.pendingInboundMessageIds);
    const suggestion = messages.map((item) => item.text).join('\n\n');
    const catalogProducts = blockedMissingQuantity
        ? []
        : await filterCatalogProductsForContext(
            context.tenantId,
            normalizePattyCatalogProducts(rawSuggestion),
            context.lastCustomerMessage,
            suggestion,
            {
                chatId: context.chatId,
                moduleId: context.moduleId,
                quotedReferenceContext: context.quotedReferenceContext
            }
        );
    console.log('[Patty] suggestion generated', {
        tenantId: context.tenantId,
        moduleId: context.moduleId,
        chatId: context.chatId,
        suggestionChars: text(suggestion).length,
        messageCount: messages.length,
        hasQuoteRequest: Boolean(quoteRequest),
        blockedMissingQuantity,
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

async function hasInboundAfter(tenantId, moduleId, chatId, sinceIso, excludeMessageId = '') {
    if (!sinceIso) return { hasInbound: false, latest: null };
    const { rows } = await pgQuery(
        `SELECT message_id, created_at, body
           FROM tenant_messages
          WHERE tenant_id = $1
            AND chat_id = $2
            AND from_me = FALSE
            AND created_at > $4::timestamptz
            AND ($5 = '' OR message_id <> $5)
            AND (wa_module_id IS NULL OR wa_module_id = '' OR LOWER(wa_module_id) = LOWER($3))
          ORDER BY created_at DESC
          LIMIT 1`,
        [tenantId, normalizeChatId(chatId), lower(moduleId), sinceIso, text(excludeMessageId)]
    );
    const latest = rows?.[0] || null;
    return {
        hasInbound: Boolean(latest),
        latest: latest
            ? {
                messageId: text(latest.message_id),
                createdAt: latest.created_at,
                bodyPreview: text(latest.body).slice(0, 80)
            }
            : null
    };
}

function isPattyRunCurrent(debounceKey = '', token = null) {
    return Boolean(token && !token.cancelled && pattyInFlight.get(debounceKey) === token);
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

function isQuoteButtonReplyMessageObject(msg = null) {
    if (!msg || typeof msg !== 'object') return false;
    const rawInteractive = msg.rawInteractive
        || msg.interactive
        || msg?._data?.interactive
        || msg?.raw?.interactive
        || null;
    const msgType = lower(msg.message_type || msg.type || msg?._data?.type || msg?.raw?.type);
    const msgBody = lower(msg.body || msg.text || msg.caption || msg?._data?.body || msg?._data?.caption);
    const interactiveType = lower(rawInteractive?.type || msg?.interactive?.type || msg?._data?.interactive?.type);
    const buttonId = lower(extractInteractiveButtonId({
        ...safeJsonObject(msg),
        interactive: rawInteractive || msg?.interactive,
        rawInteractive,
        raw: msg?.raw || msg?._data || {}
    }));
    return msgType === 'interactive'
        || interactiveType === 'button_reply'
        || rawInteractive?.button_reply != null
        || rawInteractive?.buttonReply != null
        || buttonId.startsWith('quote_confirm_')
        || buttonId.startsWith('quote_change_')
        || msgBody.startsWith('quote_confirm_')
        || msgBody.startsWith('quote_change_');
}

async function shouldSkipPattyForQuoteButtonReply({
    tenantId,
    moduleId,
    chatId,
    messageId = '',
    status = '',
    detected = false,
    source = 'unknown'
} = {}) {
    if (!detected) return false;
    const hasAutomation = await hasActiveAutomationForStatus(tenantId, moduleId, status);
    if (hasAutomation) {
        console.log('[Patty] skipped: quote button_reply handled by automation', {
            tenantId,
            moduleId,
            chatId,
            messageId,
            status,
            source
        });
        return true;
    }
    console.log('[Patty] quote button_reply has no automation; continuing intervention', {
        tenantId,
        moduleId,
        chatId,
        messageId,
        status: status || 'sin_estado',
        source
    });
    return false;
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
    const inboundAt = text(options.inboundAt) || new Date().toISOString();
    const debounceKey = buildDebounceKey(cleanTenantId, cleanModuleId, cleanChatId);
    const rawMessage = options.msg || options.message || options.rawMessage || options.raw_message || null;
    const activeInFlight = pattyInFlight.get(debounceKey);
    if (activeInFlight) {
        activeInFlight.cancelled = true;
        pattyInFlight.delete(debounceKey);
        console.log('[Patty] in-flight cancelled: newer inbound scheduled', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            previousInboundAt: activeInFlight.inboundAt || null,
            inboundAt,
            messageId: inboundMessageId || null
        });
    }
    const currentState = await getCurrentCommercialState(cleanTenantId, cleanModuleId, cleanChatId);
    const currentStatus = currentState.status;
    if (await shouldSkipPattyForQuoteButtonReply({
        tenantId: cleanTenantId,
        moduleId: cleanModuleId,
        chatId: cleanChatId,
        messageId: inboundMessageId,
        status: currentStatus,
        detected: isQuoteButtonReplyMessageObject(rawMessage),
        source: 'raw_message'
    })) {
        return;
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

    const modeState = await getChatPattyMode(cleanTenantId, cleanChatId, cleanModuleId, moduleConfig);
    const scheduleState = modeState.scheduleState || await resolveScheduleState(cleanTenantId, moduleConfig);
    const mode = lower(modeState.mode || 'off');
    if (!['review', 'autonomous'].includes(mode)) {
        console.log('[Patty] skipped: mode off or unsupported', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            scheduleOpen: scheduleState.open,
            mode,
            modeSource: modeState.source
        });
        return;
    }

    const configuredWaitSeconds = resolveWaitSeconds(aiConfig);
    let settlePendingInboundRows = [];
    try {
        settlePendingInboundRows = mode === 'review'
            ? await getPendingInboundRowsSinceLastPatty(cleanTenantId, cleanModuleId, cleanChatId, 3)
            : [];
    } catch (error) {
        console.warn('[Patty] greeting settle lookup skipped:', error?.message || error);
    }
    const rawInboundText = text(rawMessage?.body || rawMessage?.text || rawMessage?.message || rawMessage?.caption || '');
    const latestPendingInboundText = text(settlePendingInboundRows[settlePendingInboundRows.length - 1]?.body) || rawInboundText;
    const pendingInboundCountForSettle = settlePendingInboundRows.length || (isPureGreetingMessage(latestPendingInboundText) ? 1 : 0);
    const shouldSettleGreeting = mode === 'review'
        && pendingInboundCountForSettle > 0
        && pendingInboundCountForSettle < 2
        && isPureGreetingMessage(latestPendingInboundText);
    const waitSeconds = configuredWaitSeconds;
    const previousTimer = pattyChatDebounce.get(debounceKey);
    if (previousTimer) {
        clearTimeout(previousTimer);
        console.log('[Patty] debounce reset: previous timer cancelled', {
            tenantId: cleanTenantId,
            moduleId: cleanModuleId,
            chatId: cleanChatId,
            configuredWaitSeconds,
            waitSeconds,
            shouldSettleGreeting,
            pendingInboundCount: pendingInboundCountForSettle
        });
    }
    console.log('[Patty] scheduled intervention', {
        tenantId: cleanTenantId,
        moduleId: cleanModuleId,
        chatId: cleanChatId,
        mode,
        configuredWaitSeconds,
        waitSeconds,
        shouldSettleGreeting,
        pendingInboundCount: pendingInboundCountForSettle,
        inboundAt,
        scheduleOpen: scheduleState.open,
        modeSource: modeState.source
    });
    const timer = setTimeout(async () => {
        const previousRun = pattyInFlight.get(debounceKey);
        if (previousRun) previousRun.cancelled = true;
        const runToken = {
            cancelled: false,
            inboundAt,
            messageId: inboundMessageId || null,
            startedAt: Date.now()
        };
        pattyInFlight.set(debounceKey, runToken);
        const shouldAbortRun = async (stage = 'unknown') => {
            if (!isPattyRunCurrent(debounceKey, runToken)) {
                console.log('[Patty] cancelled: in-flight superseded', {
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    chatId: cleanChatId,
                    inboundAt,
                    stage
                });
                return true;
            }
            const inboundCheck = await hasInboundAfter(
                cleanTenantId,
                cleanModuleId,
                cleanChatId,
                inboundAt,
                inboundMessageId
            );
            if (inboundCheck.hasInbound) {
                runToken.cancelled = true;
                if (pattyInFlight.get(debounceKey) === runToken) {
                    pattyInFlight.delete(debounceKey);
                }
                console.log('[Patty] cancelled: newer inbound found before send', {
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    chatId: cleanChatId,
                    inboundAt,
                    stage,
                    latestInbound: inboundCheck.latest
                });
                return true;
            }
            return false;
        };
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
            if (await shouldSkipPattyForQuoteButtonReply({
                tenantId: cleanTenantId,
                moduleId: cleanModuleId,
                chatId: cleanChatId,
                messageId: inboundMessageId,
                status: currentStatus,
                detected: await isQuoteButtonReplyMessage(cleanTenantId, cleanModuleId, cleanChatId, inboundMessageId),
                source: 'persisted_message'
            })) {
                return;
            }
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
            if (await shouldAbortRun('before_context')) return;
            const prebuiltContext = await buildPattyContext(cleanTenantId, cleanModuleId, cleanChatId);
            if (await shouldAbortRun('after_context')) return;
            const prebuiltModuleName = getModuleDisplayNameFromConfig(prebuiltContext.moduleConfig || moduleConfig || {});
            if (prebuiltContext.deterministicResponse) {
                const assistantName = formatAssistantDisplayName(prebuiltContext.assistantName || DEFAULT_ASSISTANT_NAME);
                if (prebuiltContext.deterministicNeedsAdvisorReason) {
                    if (await shouldAbortRun('before_deterministic_escalation')) return;
                    await escalateToAdvisor(
                        cleanTenantId,
                        cleanChatId,
                        cleanModuleId,
                        prebuiltContext.deterministicNeedsAdvisorReason,
                        prebuiltContext.deterministicResponse,
                        options.emitCommercialStatusUpdated,
                        socketEmitter,
                        prebuiltContext.assistantName || DEFAULT_ASSISTANT_NAME,
                        prebuiltModuleName
                    );
                    return;
                }
                if (await shouldAbortRun('before_deterministic_send')) return;
                await waClient.sendMessage(cleanChatId, prebuiltContext.deterministicResponse, {
                    metadata: {
                        agentMeta: {
                            sentByUserId: 'patty',
                            sentByName: assistantName,
                            sentByRole: 'assistant',
                            sentViaModuleId: cleanModuleId,
                            sentViaModuleName: prebuiltModuleName || null
                        },
                        patty: true,
                        automationSource: prebuiltContext.deterministicSource || 'patty_deterministic_delivery_payment'
                    }
                });
                console.log('[Patty] deterministic response sent', {
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    chatId: cleanChatId,
                    source: prebuiltContext.deterministicSource || 'patty_deterministic_delivery_payment'
                });
                return;
            }
            const result = await generatePattySuggestion(cleanTenantId, cleanModuleId, cleanChatId, prebuiltContext);
            if (await shouldAbortRun('after_ai_generation')) return;
            let messages = Array.isArray(result.messages) && result.messages.length
                ? result.messages
                : normalizePattyMessages(result.suggestion);
            const assistantName = formatAssistantDisplayName(result.assistantName || DEFAULT_ASSISTANT_NAME);
            const resultModuleName = getModuleDisplayNameFromConfig(result.moduleConfig || prebuiltContext.moduleConfig || moduleConfig || {});
            const lastCustomerMessage = text(result.lastCustomerMessage || '');
            const programadoChangeRequested = currentStatus === 'programado'
                && (Boolean(result.quoteRequest) || hasQuoteChangeIntent(lastCustomerMessage));
            if (programadoChangeRequested) {
                if (await shouldAbortRun('before_programmed_change_escalation')) return;
                await activateNeedsAdvisorForProgrammedChange({
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    chatId: cleanChatId,
                    assistantName,
                    moduleName: resultModuleName,
                    emitToRuntimeContext: socketEmitter,
                    emitCommercialStatusUpdated: options.emitCommercialStatusUpdated
                });
                return;
            }
            const skipCatalogProducts = Boolean(
                prebuiltContext?.deterministicResponse
                || result?.deterministicResponse
                || isBroadCatalogQuestion(lastCustomerMessage)
                || isPureDeliveryOrPaymentQuestion(lastCustomerMessage)
            );
            const catalogProducts = skipCatalogProducts
                ? []
                : (Array.isArray(result.catalogProducts) ? result.catalogProducts : []);
            const hasCatalogProducts = catalogProducts.length > 0;
            if (!messages.length && !result.quoteRequest && !hasCatalogProducts) {
                console.log('[Patty] skipped: empty suggestion', {
                    tenantId: cleanTenantId,
                    moduleId: cleanModuleId,
                    chatId: cleanChatId
                });
                return;
            }
            if (mode === 'review') {
                if (await shouldAbortRun('before_review_emit')) return;
                emitSuggestion(socketEmitter, cleanTenantId, {
                    chatId: cleanChatId,
                    moduleId: cleanModuleId,
                    suggestion: result.suggestion,
                    messages,
                    quoteRequest: result.quoteRequest || null,
                    catalogProducts,
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
                if (await shouldAbortRun(`before_autonomous_message_${index + 1}`)) return;
                await waClient.sendMessage(cleanChatId, msg.text, {
                    quotedMessageId: msg.quotedMessageId || null,
                    metadata: {
                        agentMeta: {
                            sentByUserId: 'patty',
                            sentByName: assistantName,
                            sentByRole: 'assistant',
                            sentViaModuleId: cleanModuleId,
                            sentViaModuleName: resultModuleName || null
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
                    if (await shouldAbortRun('before_catalog_products')) return;
                    const catalogResult = await sendPattyCatalogProducts({
                        tenantId: cleanTenantId,
                        moduleId: cleanModuleId,
                        chatId: cleanChatId,
                        skus: catalogProducts,
                        assistantName,
                        moduleName: resultModuleName
                    });
                    console.log('[Patty] catalog products sent', {
                        tenantId: cleanTenantId,
                        moduleId: cleanModuleId,
                        chatId: cleanChatId,
                        requested: catalogProducts,
                        sent: catalogResult.sent
                    });
                } catch (catalogError) {
                    console.warn('[Patty] catalog products failed; text messages already sent:', catalogError?.message || catalogError);
                }
            }
            if (result.quoteRequest) {
                try {
                    await sleep(1500);
                    if (await shouldAbortRun('before_quote_request')) return;
                    await createAndSendPattyQuote({
                        tenantId: cleanTenantId,
                        moduleId: cleanModuleId,
                        chatId: cleanChatId,
                        assistantName,
                        moduleName: resultModuleName,
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
        } finally {
            if (pattyInFlight.get(debounceKey) === runToken) {
                pattyInFlight.delete(debounceKey);
            }
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
