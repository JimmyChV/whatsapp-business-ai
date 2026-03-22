const { getChatSuggestion, askInternalCopilot } = require('../../operations/services/ai.service');
const waClient = require('./wa-provider.service');
const mediaManager = require('./media-manager.service');
const { loadCatalog, addProduct, updateProduct, deleteProduct } = require('../../tenant/services/catalog-manager.service');
const { getWooCatalog, isWooConfigured } = require('../../tenant/services/woocommerce.service');
const { listQuickReplies } = require('../../tenant/services/quick-replies-manager.service');
const tenantSettingsService = require('../../tenant/services/tenant-settings.service');
const tenantIntegrationsService = require('../../tenant/services/integrations.service');
const tenantService = require('../../tenant/services/tenant-core.service');
const planLimitsService = require('../../security/services/plan-limits.service');
const aiUsageService = require('../../tenant/services/ai-usage.service');
const aiChatHistoryService = require('../../operations/services/ai-chat-history.service');
const messageHistoryService = require('../../operations/services/message-history.service');
const waModuleService = require('../../tenant/services/wa-modules.service');
const tenantCatalogService = require('../../tenant/services/tenant-catalog.service');
const customerService = require('../../tenant/services/customers.service');
const tenantLabelService = require('../../tenant/services/tenant-labels.service');
const conversationOpsService = require('../../operations/services/conversation-ops.service');
const auditLogService = require('../../security/services/audit-log.service');
const RateLimiter = require('../../../config/rate-limiter');
const { URL } = require('url');
const { resolveAndValidatePublicHost } = require('../../security/helpers/security-utils');
const {
    parseOrderNumber,
    normalizeOrderCurrencyAmount,
    normalizeOrderSku,
    normalizeOrderSkuKey,
    parseOrderLineFromObject,
    dedupeOrderProducts,
    collectProductsFromUnknownShape,
    parseProductsFromBodyText,
    parseProductsFromOrderTitle,
    buildOrderDebugKey,
    pickOrderDebugData,
    safeOrderDebugJson,
    extractCatalogItemCategories,
    buildCatalogDebugLine
} = require('../../operations/helpers/order-parsing.helpers');
const {
    normalizePhoneDigits,
    looksLikeSamePhoneDigits,
    formatPhoneForDisplay,
    isLikelyHumanPhoneDigits,
    coerceHumanPhone,
    resolveCloudDestinationChatId,
    normalizeScopedModuleId,
    parseScopedChatId,
    buildScopedChatId,
    getSummaryModuleScopeId,
    resolveScopedChatTarget,
    resolveAiHistoryScope,
    isLidIdentifier,
    extractPhoneFromText,
    extractPhoneFromContactLike,
    extractPhoneFromChat,
    extractPhoneFromSummary,
    buildChatIdentityKeyFromSummary,
    pickPreferredSummary
} = require('../helpers/chat-scope.helpers');
const {
    getSerializedMessageId,
    buildSocketAgentMeta,
    sanitizeAgentMeta,
    buildModuleAttributionMeta,
    buildEffectiveModuleContext
} = require('../helpers/agent-meta.helpers');
const fs = require('fs');
const path = require('path');

const eventRateLimiter = new RateLimiter({
    windowMs: Number(process.env.SOCKET_RATE_LIMIT_WINDOW_MS || 10000),
    max: Number(process.env.SOCKET_RATE_LIMIT_MAX || 30)
});
const orderDebugSeen = new Set();
const ORDER_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.ORDER_DEBUG || '').trim().toLowerCase());
const ORDER_DEBUG_VERBOSE = ['1', 'true', 'yes', 'on'].includes(String(process.env.ORDER_DEBUG_VERBOSE || '').trim().toLowerCase());
const CATALOG_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.CATALOG_DEBUG || '').trim().toLowerCase());
const ORDER_DEBUG_MISSING_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.ORDER_DEBUG_MISSING || process.env.ORDER_DEBUG || '').trim().toLowerCase());
const HISTORY_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.HISTORY_DEBUG || '').trim().toLowerCase());
const CATALOG_DEBUG_MAX_ITEMS = Math.max(1, Number(process.env.CATALOG_DEBUG_MAX_ITEMS || 120));
let catalogDebugLastSignature = '';
const SENDER_META_TTL_MS = Math.max(60 * 1000, Number(process.env.SENDER_META_TTL_MS || (10 * 60 * 1000)));
const senderMetaCache = new Map();
const GROUP_PARTICIPANT_CONTACT_TTL_MS = Math.max(5 * 60 * 1000, Number(process.env.GROUP_PARTICIPANT_CONTACT_TTL_MS || (30 * 60 * 1000)));
const groupParticipantContactCache = new Map();
const outgoingMessageAgentMeta = new Map();
const OUTGOING_AGENT_META_TTL_MS = Math.max(60 * 1000, Number(process.env.OUTGOING_AGENT_META_TTL_MS || (10 * 60 * 1000)));
const SOCKET_RBAC_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.SAAS_AUTH_ENABLED || '').trim().toLowerCase());
const WA_REQUIRE_SELECTED_MODULE = ['1', 'true', 'yes', 'on'].includes(String(process.env.WA_REQUIRE_SELECTED_MODULE || '').trim().toLowerCase());
const WA_ENFORCE_WEBJS_PHONE_MATCH = ['1', 'true', 'yes', 'on'].includes(String(process.env.WA_ENFORCE_WEBJS_PHONE_MATCH || '').trim().toLowerCase());
const QUICK_REPLY_MEDIA_MAX_BYTES = Math.max(
    256 * 1024,
    Number(process.env.QUICK_REPLY_MEDIA_MAX_BYTES || process.env.ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || (50 * 1024 * 1024))
);
const QUICK_REPLY_MEDIA_TIMEOUT_MS = Math.max(
    2000,
    Number(process.env.QUICK_REPLY_MEDIA_TIMEOUT_MS || 15000)
);
let sharpImageProcessor = null;
let sharpLoadAttempted = false;
const DEFAULT_SAAS_UPLOADS_ROOT = path.resolve(__dirname, '../../../uploads');
const SAAS_UPLOADS_ROOT = path.resolve(String(process.env.SAAS_UPLOADS_DIR || DEFAULT_SAAS_UPLOADS_ROOT).trim() || DEFAULT_SAAS_UPLOADS_ROOT);

function guardRateLimit(socket, eventName) {
    const key = `${socket.id}:${eventName}`;
    const result = eventRateLimiter.check(key);
    if (!result.allowed) {
        socket.emit('error', `Rate limit excedido para ${eventName}. Intenta en unos segundos.`);
        return false;
    }
    return true;
}

function getSharpImageProcessor() {
    if (sharpLoadAttempted) return sharpImageProcessor;
    sharpLoadAttempted = true;
    try {
        sharpImageProcessor = require('sharp');
    } catch (error) {
        sharpImageProcessor = null;
    }
    return sharpImageProcessor;
}

function cleanupOutgoingAgentMeta() {
    const now = Date.now();
    for (const [messageId, entry] of outgoingMessageAgentMeta.entries()) {
        if (!entry || Number(entry.expiresAt || 0) <= now) {
            outgoingMessageAgentMeta.delete(messageId);
        }
    }
}

function rememberOutgoingAgentMeta(messageId = '', meta = null) {
    const safeId = String(messageId || '').trim();
    if (!safeId || !meta || typeof meta !== 'object') return;
    cleanupOutgoingAgentMeta();
    outgoingMessageAgentMeta.set(safeId, {
        meta,
        expiresAt: Date.now() + OUTGOING_AGENT_META_TTL_MS
    });
}

function getOutgoingAgentMeta(messageId = '') {
    const safeId = String(messageId || '').trim();
    if (!safeId) return null;
    const entry = outgoingMessageAgentMeta.get(safeId);
    if (!entry) return null;
    if (Number(entry.expiresAt || 0) <= Date.now()) {
        outgoingMessageAgentMeta.delete(safeId);
        return null;
    }
    return entry.meta && typeof entry.meta === 'object' ? entry.meta : null;
}
async function resolveSocketModuleContext(tenantId = 'default', authContext = null, requestedModuleId = '') {
    const cleanTenantId = String(tenantId || 'default').trim() || 'default';
    const userId = String(authContext?.userId || authContext?.id || '').trim();
    const normalizedRole = String(authContext?.role || '').trim().toLowerCase();
    const privilegedActor = Boolean(authContext?.isSuperAdmin) || ['superadmin', 'owner', 'admin'].includes(normalizedRole);
    const normalizedRequestedId = String(requestedModuleId || '').trim().toLowerCase();

    const modules = await waModuleService.listModules(cleanTenantId, {
        includeInactive: false,
        userId: privilegedActor ? '' : userId
    });

    if (!Array.isArray(modules) || modules.length === 0) {
        return { modules: [], selected: null };
    }

    let selected = null;
    if (normalizedRequestedId) {
        selected = modules.find((module) => String(module?.moduleId || '').trim().toLowerCase() === normalizedRequestedId) || null;
    }
    if (!selected) {
        selected = modules.find((module) => module?.isSelected) || modules.find((module) => module?.isDefault) || modules[0] || null;
    }

    return {
        modules,
        selected: selected || null
    };
}

function buildWebjsSessionNamespaceFromIds(tenantId = 'default', moduleId = 'default') {
    const cleanTenant = String(tenantId || 'default')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'default';
    const cleanModule = String(moduleId || 'default')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30) || 'default';
    return String(cleanTenant + '__' + cleanModule)
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'default';
}
function mergeAgentMeta(...candidates) {
    const merged = {};
    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') continue;
        const normalized = sanitizeAgentMeta(candidate);
        if (!normalized) continue;
        Object.assign(merged, normalized);
    }
    return Object.keys(merged).length > 0 ? merged : null;
}
function logOrderDebug({ msg, data, orderId, products, subtotal, subtotalFrom1000, subtotalFallback, currency, rawPreview }) {
    const key = buildOrderDebugKey(orderId, data, msg);
    const hasLines = Array.isArray(products) && products.length > 0;
    const seenKey = `${hasLines ? 'ok' : 'missing'}:${key}`;

    if (orderDebugSeen.has(seenKey)) return;
    orderDebugSeen.add(seenKey);

    const summary = {
        key,
        type: msg?.type || data?.type || null,
        orderId: orderId || null,
        productsCount: Array.isArray(products) ? products.length : 0,
        itemCount: rawPreview?.itemCount || null,
        subtotalFrom1000,
        subtotalFallback,
        subtotal,
        currency,
        hasMsgOrder: Boolean(msg?.order),
        hasMsgOrderProducts: Array.isArray(msg?.orderProducts) ? msg.orderProducts.length : Boolean(msg?.orderProducts),
        dataKeys: Object.keys(data || {}).slice(0, 60)
    };

    if (!hasLines) {
        if (ORDER_DEBUG_MISSING_ENABLED) {
            console.warn('[OrderDebug] Pedido detectado SIN lineas de producto:', summary);
        }
    } else if (ORDER_DEBUG_ENABLED) {
        console.log('[OrderDebug] Pedido parseado:', summary);
    }

    if (ORDER_DEBUG_VERBOSE || (!hasLines && ORDER_DEBUG_MISSING_ENABLED)) {
        const preview = safeOrderDebugJson({
            msgOrder: msg?.order,
            msgOrderProducts: msg?.orderProducts,
            data: pickOrderDebugData(data),
            body: msg?.body || data?.body || null
        });
        if (preview) console.log('[OrderDebug] Payload preview:', preview);
    }
}

function logCatalogDebugSnapshot({ catalog = [], catalogMeta = {} } = {}) {
    if (!CATALOG_DEBUG_ENABLED) return;

    const safeCatalog = Array.isArray(catalog) ? catalog : [];
    const categories = Array.isArray(catalogMeta?.categories)
        ? catalogMeta.categories.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];

    const signature = JSON.stringify({
        source: String(catalogMeta?.source || 'unknown'),
        totalProducts: safeCatalog.length,
        categories,
        sample: safeCatalog.slice(0, 40).map((item) => [
            String(item?.id || ''),
            String(item?.sku || ''),
            extractCatalogItemCategories(item).join('|')
        ])
    });

    if (signature === catalogDebugLastSignature) return;
    catalogDebugLastSignature = signature;

    console.log(`[CatalogDebug] source=${String(catalogMeta?.source || 'unknown')} totalProducts=${safeCatalog.length} totalCategories=${categories.length}`);
    if (categories.length > 0) {
        console.log(`[CatalogDebug] categories=${categories.join(' | ')}`);
    }

    const maxLines = Math.min(Math.max(1, CATALOG_DEBUG_MAX_ITEMS), safeCatalog.length);
    for (let i = 0; i < maxLines; i += 1) {
        console.log(buildCatalogDebugLine(safeCatalog[i], i));
    }

    if (safeCatalog.length > maxLines) {
        console.log(`[CatalogDebug] ... +${safeCatalog.length - maxLines} productos adicionales`);
    }
}
function parseLocationNumber(value) {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}

function extractFirstUrlFromText(text = '') {
    const match = String(text || '').match(/https?:\/\/[^\s]+/i);
    return match ? String(match[0]).replace(/[),.;!?]+$/g, '') : null;
}

function extractMapUrlFromText(text = '') {
    const matches = String(text || '').match(/https?:\/\/[^\s]+/gi) || [];
    for (const raw of matches) {
        const candidate = String(raw || '').replace(/[),.;!?]+$/g, '');
        if (isLikelyMapUrl(candidate)) return candidate;
    }
    return null;
}

function isLikelyMapUrl(value = '') {
    const candidate = String(value || '').trim().replace(/[),.;!?]+$/g, '');
    if (!candidate) return false;
    try {
        const parsed = new URL(candidate);
        const host = String(parsed.hostname || '').toLowerCase();
        const path = String(parsed.pathname || '').toLowerCase();
        if (host.includes('maps.app.goo.gl')) return true;
        if (host === 'goo.gl' && path.startsWith('/maps')) return true;
        if (host.startsWith('maps.google.')) return true;
        if (host === 'maps.google.com') return true;
        if (host.includes('google.') && path.startsWith('/maps')) return true;
        return false;
    } catch (e) {
        return /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|google\.[^\s/]+\/maps/i.test(candidate);
    }
}

function extractCoordsFromText(text = '') {
    const raw = String(text || '');
    if (!raw) return null;
    let value = raw;
    try {
        value = decodeURIComponent(raw);
    } catch (e) { }

    const patterns = [
        /geo:\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (!match) continue;
        const lat = parseLocationNumber(match[1]);
        const lng = parseLocationNumber(match[2]);
        if (isValidLatitude(lat) && isValidLongitude(lng)) {
            return { latitude: lat, longitude: lng };
        }
    }

    return null;
}

function extractLocationInfo(msg) {
    try {
        const data = msg?._data || {};
        const type = String(msg?.type || data?.type || '').toLowerCase();
        const body = String(msg?.body || data?.body || '').trim();
        const rawLocation = msg?.location || data?.location || data?.loc || {};
        const locationObj = rawLocation && typeof rawLocation === 'object' ? rawLocation : {};

        const directLat = parseLocationNumber(
            locationObj?.latitude
            ?? locationObj?.lat
            ?? data?.latitude
            ?? data?.lat
            ?? data?.latDegrees
        );
        const directLng = parseLocationNumber(
            locationObj?.longitude
            ?? locationObj?.lng
            ?? locationObj?.lon
            ?? data?.longitude
            ?? data?.lng
            ?? data?.lon
            ?? data?.lngDegrees
        );

        let latitude = isValidLatitude(directLat) ? directLat : null;
        let longitude = isValidLongitude(directLng) ? directLng : null;

        const urlFromData = String(
            locationObj?.url
            || data?.clientUrl
            || data?.url
            || ''
        ).trim();
        const urlFromBody = extractMapUrlFromText(body);
        const candidateUrl = isLikelyMapUrl(urlFromData)
            ? urlFromData.replace(/[),.;!?]+$/g, '')
            : (isLikelyMapUrl(urlFromBody || '') ? String(urlFromBody || '').replace(/[),.;!?]+$/g, '') : '');

        if ((latitude === null || longitude === null) && candidateUrl) {
            const fromUrl = extractCoordsFromText(candidateUrl);
            if (fromUrl) {
                latitude = fromUrl.latitude;
                longitude = fromUrl.longitude;
            }
        }

        let bodyCoords = null;
        if ((latitude === null || longitude === null) && body) {
            const fromBody = extractCoordsFromText(body);
            if (fromBody) {
                bodyCoords = fromBody;
                latitude = fromBody.latitude;
                longitude = fromBody.longitude;
            }
        }

        const label = truncateDisplayValue(
            String(
                locationObj?.description
                || locationObj?.name
                || data?.address
                || data?.name
                || ''
            ).trim(),
            180
        ) || null;

        const mapUrl = candidateUrl
            || ((latitude !== null && longitude !== null)
                ? `https://www.google.com/maps?q=${latitude},${longitude}`
                : null);

        if (type !== 'location' && !label && !mapUrl && (latitude === null || longitude === null)) {
            return null;
        }

        return {
            latitude: latitude,
            longitude: longitude,
            label: label,
            mapUrl: mapUrl,
            text: label || ((latitude !== null && longitude !== null) ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'Ubicacion compartida'),
            source: type === 'location' ? 'native' : ((candidateUrl || bodyCoords) ? 'link' : 'native')
        };
    } catch (e) {
        return null;
    }
}
function getMessageTypePreviewLabel(type = '') {
    const value = String(type || '').toLowerCase();
    if (!value) return 'Mensaje';
    if (value === 'image') return 'Imagen';
    if (value === 'video') return 'Video';
    if (value === 'audio') return 'Audio';
    if (value === 'ptt') return 'Nota de voz';
    if (value === 'document') return 'Documento';
    if (value === 'sticker') return 'Sticker';
    if (value === 'location') return 'Ubicacion';
    if (value === 'vcard') return 'Contacto';
    if (value === 'revoked') return 'Mensaje eliminado';
    if (value === 'order') return 'Pedido';
    if (value === 'product') return 'Producto';
    return 'Mensaje';
}


function guessFileExtensionFromMime(mimetype = '') {
    const type = String(mimetype || '').toLowerCase();
    if (!type) return '';
    if (type.includes('pdf')) return 'pdf';
    if (type.includes('wordprocessingml')) return 'docx';
    if (type.includes('msword')) return 'doc';
    if (type.includes('spreadsheetml')) return 'xlsx';
    if (type.includes('ms-excel') || type.includes('excel')) return 'xls';
    if (type.includes('presentationml')) return 'pptx';
    if (type.includes('ms-powerpoint') || type.includes('powerpoint')) return 'ppt';
    if (type.includes('text/plain')) return 'txt';
    if (type.includes('csv')) return 'csv';
    if (type.includes('json')) return 'json';
    if (type.includes('xml')) return 'xml';
    if (type.includes('zip')) return 'zip';
    if (type.includes('rar')) return 'rar';
    if (type.includes('7z')) return '7z';
    if (type.includes('jpeg')) return 'jpg';
    if (type.includes('png')) return 'png';
    if (type.includes('webp')) return 'webp';
    if (type.includes('gif')) return 'gif';
    if (type.includes('mp4')) return 'mp4';
    if (type.includes('audio/mpeg')) return 'mp3';
    if (type.includes('audio/ogg')) return 'ogg';
    return '';
}

function sanitizeFilenameCandidate(value = '') {
    let text = String(value || '').trim();
    if (!text) return null;

    if (/^https?:\/\//i.test(text)) {
        try {
            const parsed = new URL(text);
            const fromPath = String(parsed.pathname || '').split('/').filter(Boolean).pop() || '';
            text = fromPath || text;
        } catch (e) { }
    }

    text = text
        .replace(/^['\"]+|['\"]+$/g, '')
        .replace(/\\/g, '/');
    if (text.includes('/')) text = text.split('/').pop() || text;
    text = text.split('?')[0].split('#')[0];

    try {
        text = decodeURIComponent(text);
    } catch (e) { }

    text = text
        .replace(/[\u0000-\u001F]/g, '')
        .replace(/[<>:\"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+|\.+$/g, '')
        .trim();

    if (!text) return null;
    if (/^(null|undefined|\[object object\]|unknown)$/i.test(text)) return null;
    return text;
}

function getFilenameExtension(filename = '') {
    const name = String(filename || '').trim();
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx <= 0 || dotIdx >= name.length - 1) return '';
    const ext = name.slice(dotIdx + 1).toLowerCase();
    if (!/^[a-z0-9]{1,8}$/.test(ext)) return '';
    return ext;
}

function isGenericFilename(filename = '') {
    const base = String(filename || '')
        .trim()
        .toLowerCase()
        .replace(/\.[a-z0-9]{1,8}$/i, '');
    if (!base) return true;
    return ['archivo', 'file', 'adjunto', 'attachment', 'document', 'documento', 'media', 'unknown', 'download', 'descarga'].includes(base);
}

function isMachineLikeFilename(filename = '') {
    const base = String(filename || '')
        .trim()
        .replace(/\.[a-z0-9]{1,8}$/i, '')
        .replace(/\s+/g, '');
    if (!base) return true;

    if (/^\d{8,}$/.test(base)) return true;
    if (/^[a-f0-9]{16,}$/i.test(base)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) return true;
    if (/^3EB0[A-F0-9]{8,}$/i.test(base)) return true;

    return false;
}

function looksLikeBodyFilename(value = '') {
    const text = String(value || '').trim();
    if (!text || text.length > 180) return false;
    if (/[\r\n]/.test(text)) return false;
    if (/^[A-Za-z0-9+/=]{160,}$/.test(text)) return false;
    if (/^https?:\/\//i.test(text)) return true;
    return /\.[A-Za-z0-9]{1,8}$/.test(text);
}

function extractMessageFileMeta(msg = {}, downloadedMedia = null) {
    const raw = msg?._data || {};
    const nestedDocumentName =
        raw?.message?.documentMessage?.fileName
        || raw?.message?.documentWithCaptionMessage?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessage?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessageV2?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessageV2Extension?.message?.documentMessage?.fileName
        || null;

    const bodyCandidateRaw = String(msg?.body || raw?.body || '').trim();
    const bodyCandidate = looksLikeBodyFilename(bodyCandidateRaw) ? bodyCandidateRaw : null;

    const candidateNames = [
        msg?.filename,
        raw?.filename,
        raw?.fileName,
        raw?.file_name,
        raw?.mediaData?.filename,
        raw?.mediaData?.fileName,
        raw?.mediaData?.file_name,
        nestedDocumentName,
        downloadedMedia?.filename,
        downloadedMedia?.fileName,
        raw?.title,
        bodyCandidate
    ];

    let filename = null;
    let fallbackFilename = null;
    for (const candidate of candidateNames) {
        const safeName = sanitizeFilenameCandidate(candidate);
        if (!safeName) continue;
        if (!fallbackFilename) fallbackFilename = safeName;
        const ext = getFilenameExtension(safeName);
        if (!isGenericFilename(safeName) && !isMachineLikeFilename(safeName) && ext) {
            filename = safeName;
            break;
        }
        if (!filename && !isGenericFilename(safeName) && !isMachineLikeFilename(safeName)) {
            filename = safeName;
        }
    }
    if (!filename) filename = fallbackFilename;

    const mimetype = String(
        msg?.mimetype
        || raw?.mimetype
        || raw?.mediaData?.mimetype
        || downloadedMedia?.mimetype
        || ''
    ).trim();
    const mimeExt = guessFileExtensionFromMime(mimetype);
    const hasAttachment = Boolean(msg?.hasMedia || raw?.hasMedia || mimetype || downloadedMedia);

    if (filename && !getFilenameExtension(filename) && mimeExt) {
        filename = `${filename}.${mimeExt}`;
    }
    if (filename && (isGenericFilename(filename) || isMachineLikeFilename(filename)) && mimeExt) {
        filename = `documento.${mimeExt}`;
    }
    if (!filename && hasAttachment && mimeExt) {
        filename = `documento.${mimeExt}`;
    }
    if (!filename && hasAttachment && String(msg?.type || '').toLowerCase() === 'document') {
        filename = 'documento';
    }

    const sizeCandidates = [
        raw?.size,
        raw?.fileSize,
        raw?.fileLength,
        raw?.mediaData?.size,
        downloadedMedia?.filesize,
        downloadedMedia?.fileSize,
        downloadedMedia?.size
    ];

    let fileSizeBytes = null;
    for (const candidate of sizeCandidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed) && parsed > 0) {
            fileSizeBytes = Math.round(parsed);
            break;
        }
    }
    if (!fileSizeBytes && downloadedMedia?.data) {
        const base64Length = String(downloadedMedia.data || '').length;
        if (base64Length > 0) {
            fileSizeBytes = Math.round((base64Length * 3) / 4);
        }
    }

    const mediaUrl = String(downloadedMedia?.publicUrl || downloadedMedia?.storedPublicUrl || '').trim() || null;
    const mediaPath = String(downloadedMedia?.relativePath || downloadedMedia?.storedRelativePath || '').trim() || null;

    return {
        filename,
        mimetype: mimetype || null,
        fileSizeBytes,
        mediaUrl,
        mediaPath
    };
}

function normalizeQuotedPayload(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;

    const rawId = raw?.id?._serialized || raw?.id || raw?.quotedStanzaID || raw?.quotedMsgId || raw?.quotedMsgKey || null;
    const id = rawId ? String(rawId).trim() : null;
    const body = truncateDisplayValue(String(raw?.body || raw?.caption || raw?.text || '').trim(), 180);
    const type = String(raw?.type || '').trim() || null;
    const fromMe = Boolean(raw?.fromMe || raw?.id?.fromMe || raw?.isFromMe);
    const timestamp = Number(raw?.timestamp || raw?.t || 0) || null;
    const hasMedia = Boolean(raw?.hasMedia || raw?.mimetype || raw?.mediaData || raw?.isMedia);

    if (!id && !body && !type && !hasMedia) return null;

    const preview = body || getMessageTypePreviewLabel(type);
    return {
        id: id || null,
        body: preview,
        type: type || 'chat',
        fromMe,
        timestamp,
        hasMedia
    };
}

async function extractQuotedMessageInfo(msg) {
    try {
        if (!msg) return null;
        const data = msg?._data || {};
        const quick = normalizeQuotedPayload({
            id: data?.quotedStanzaID,
            body: data?.quotedMsg?.body || data?.quotedMsg?.caption,
            type: data?.quotedMsg?.type,
            fromMe: data?.quotedMsg?.id?.fromMe || data?.quotedMsg?.fromMe,
            timestamp: data?.quotedMsg?.t,
            hasMedia: data?.quotedMsg?.isMedia || data?.quotedMsg?.mediaData || data?.quotedMsg?.mimetype
        });

        if (quick && quick.body && quick.id) return quick;

        if (msg?.hasQuotedMsg && typeof msg.getQuotedMessage === 'function') {
            try {
                const quoted = await msg.getQuotedMessage();
                const parsedQuoted = normalizeQuotedPayload({
                    id: quoted?.id?._serialized,
                    body: quoted?.body,
                    caption: quoted?._data?.caption,
                    type: quoted?.type,
                    fromMe: quoted?.fromMe,
                    timestamp: quoted?.timestamp,
                    hasMedia: quoted?.hasMedia
                });

                if (parsedQuoted) {
                    if (quick?.id && !parsedQuoted.id) parsedQuoted.id = quick.id;
                    return parsedQuoted;
                }
            } catch (e) {
            }
        }

        return quick;
    } catch (e) {
        return null;
    }
}

function extractOrderInfo(msg) {
    try {
        const data = msg?._data || {};
        const orderTitle = data?.orderTitle || data?.title || msg?.orderTitle || msg?.title || msg?.order?.order_title || msg?.order?.catalog_name || msg?.order?.text || '';
        let products = collectProductsFromUnknownShape({
            msgOrder: msg?.order,
            msgOrderProducts: msg?.orderProducts,
            native: msg,
            raw: data
        });

        if (!products.length) {
            products = parseProductsFromBodyText(msg?.body || data?.body || '');
        }
        if (!products.length) {
            products = parseProductsFromOrderTitle(orderTitle);
        }
        products = dedupeOrderProducts(products);

        const orderId = msg?.orderId || msg?.order?.id || msg?.order?.order_id || data?.orderId || data?.orderToken || data?.token || null;
        const subtotalFrom1000 = normalizeOrderCurrencyAmount(
            msg?.totalAmount1000
            ?? msg?.order?.total_amount_1000
            ?? msg?.order?.subtotal_amount_1000
            ?? msg?.order?.total_amount
            ?? data?.totalAmount1000
            ?? data?.total_amount_1000
            ?? data?.subtotalAmount1000
            ?? data?.subtotal_amount_1000
            ?? data?.priceTotalAmount1000,
            { scaleHint: '1000' }
        );
        const subtotalFallback = normalizeOrderCurrencyAmount(
            msg?.subtotal
            ?? msg?.order?.subtotal
            ?? msg?.order?.total
            ?? msg?.total
            ?? data?.subtotal
            ?? data?.total
            ?? data?.totalAmount,
            { scaleHint: 'subtotal' }
        );
        const subtotal = Number.isFinite(subtotalFrom1000) ? subtotalFrom1000 : subtotalFallback;
        const currency = msg?.currency || msg?.order?.currency || msg?.order?.currency_code || data?.totalCurrencyCode || data?.currency || 'PEN';

        const maybeOrderType = String(msg?.type || '').toLowerCase().includes('order')
            || String(data?.type || '').toLowerCase().includes('order')
            || String(msg?.type || '').toLowerCase().includes('product')
            || String(data?.type || '').toLowerCase().includes('product')
            || products.length > 0
            || Boolean(orderId)
            || Boolean(msg?.order);

        if (!maybeOrderType) return null;

        const rawPreview = {
            type: msg?.type || data?.type || null,
            body: msg?.body || data?.body || null,
            title: orderTitle || null,
            itemCount: data?.itemCount || data?.orderItemCount || msg?.itemCount || msg?.order?.item_count || products.length || null,
            sellerJid: data?.sellerJid || msg?.order?.seller_jid || null,
            token: data?.orderToken || data?.token || msg?.order?.token || null
        };

        logOrderDebug({
            msg,
            data,
            orderId,
            products,
            subtotal: Number.isFinite(subtotal) ? subtotal : null,
            subtotalFrom1000,
            subtotalFallback,
            currency,
            rawPreview
        });

        return {
            orderId,
            currency,
            subtotal: Number.isFinite(subtotal) ? subtotal : null,
            products,
            rawPreview
        };
    } catch (error) {
        return null;
    }
}

const CATALOG_IMAGE_EXT_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

const CLOUD_CATALOG_COMPATIBLE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const CATALOG_IMAGE_FETCH_ACCEPT = 'image/jpeg,image/png,image/*;q=0.85,*/*;q=0.5';

function slugifyFileName(value = 'producto') {
    const clean = String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return clean || 'producto';
}

function buildCatalogProductCaption(product = {}) {
    const title = String(product?.title || product?.name || 'Producto').trim() || 'Producto';

    const parsePrice = (value, fallback = 0) => {
        const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
        return Number.isFinite(fallback) ? fallback : 0;
    };

    const finalPrice = parsePrice(product?.price, 0);
    const regularPrice = parsePrice(product?.regularPrice ?? product?.regular_price, finalPrice);

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

    const description = String(product?.description || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (description) {
        lines.push('');
        lines.push(`Detalle: ${description.length > 280 ? `${description.slice(0, 277)}...` : description}`);
    }

    return lines.join('\n');
}

function buildCatalogImageCandidateUrls(imageUrl = '') {
    const rawUrl = String(imageUrl || '').trim();
    if (!rawUrl) return [];

    const candidates = [];
    const seen = new Set();
    const pushCandidate = (nextUrl = '') => {
        const clean = String(nextUrl || '').trim();
        if (!clean || seen.has(clean)) return;
        seen.add(clean);
        candidates.push(clean);
    };

    pushCandidate(rawUrl);

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (e) {
        return candidates;
    }

    const pathname = String(parsed.pathname || '');
    const extMatch = pathname.match(/\.([a-z0-9]{3,4})$/i);
    const ext = String(extMatch?.[1] || '').toLowerCase();
    if (['webp', 'gif', 'avif'].includes(ext)) {
        for (const fallbackExt of ['jpg', 'jpeg', 'png']) {
            const clone = new URL(parsed.toString());
            clone.pathname = pathname.replace(/\.[a-z0-9]{3,4}$/i, '.' + fallbackExt);
            pushCandidate(clone.toString());
        }
    }

    const queryKeys = ['format', 'fm', 'output-format', 'ext'];
    for (const key of queryKeys) {
        const current = String(parsed.searchParams.get(key) || '').trim().toLowerCase();
        if (!['webp', 'gif', 'avif'].includes(current)) continue;
        const clone = new URL(parsed.toString());
        clone.searchParams.set(key, 'jpg');
        pushCandidate(clone.toString());
    }

    return candidates;
}

function normalizeUploadsRelativePath(value = '') {
    const raw = String(value || '').replace(/\\+/g, '/').trim();
    if (!raw) return '';
    const normalized = path.posix.normalize(raw).replace(/^\/+/, '');
    if (!normalized || normalized === '.' || normalized.startsWith('..') || normalized.includes('/../')) return '';
    return normalized;
}

function resolveLocalUploadReference(rawUrl = '') {
    const clean = String(rawUrl || '').trim();
    if (!clean) return null;

    let pathname = clean;
    if (/^https?:\/\//i.test(clean)) {
        try {
            const parsedUrl = new URL(clean);
            const localHostNames = new Set(['localhost', '127.0.0.1', '::1']);
            const hostName = String(parsedUrl.hostname || '').trim().toLowerCase();
            if (!localHostNames.has(hostName)) return null;
            pathname = String(parsedUrl.pathname || '').trim();
        } catch (e) {
            return null;
        }
    }

    if (!pathname) return null;
    if (!pathname.startsWith('/uploads/') && !pathname.startsWith('uploads/')) return null;

    const relativePart = pathname.startsWith('/uploads/')
        ? pathname.slice('/uploads/'.length)
        : pathname.slice('uploads/'.length);

    const normalizedRelative = normalizeUploadsRelativePath(relativePart);
    if (!normalizedRelative) return null;

    const absolutePath = path.resolve(SAAS_UPLOADS_ROOT, normalizedRelative);
    const relativeToRoot = path.relative(SAAS_UPLOADS_ROOT, absolutePath);
    if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;

    return {
        sourceUrl: clean,
        publicUrl: '/uploads/' + normalizedRelative,
        relativePath: normalizedRelative,
        absolutePath
    };
}

function guessMimeFromPathOrUrl(input = '') {
    const ext = String(path.extname(String(input || '')).replace(/^\./, '') || '').trim().toLowerCase();
    const map = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        avif: 'image/avif'
    };
    return map[ext] || 'image/jpeg';
}
function guessMimeFromFilename(input = '') {
    const ext = String(path.extname(String(input || '')).replace(/^\./, '') || '').trim().toLowerCase();
    const map = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        avif: 'image/avif',
        pdf: 'application/pdf',
        txt: 'text/plain',
        csv: 'text/csv',
        json: 'application/json',
        xml: 'application/xml',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return map[ext] || 'application/octet-stream';
}

function parseContentDispositionFilename(headerValue = '') {
    const raw = String(headerValue || '').trim();
    if (!raw) return null;
    const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        try {
            return sanitizeFilenameCandidate(decodeURIComponent(String(utf8Match[1] || '').trim()));
        } catch (e) {
            return sanitizeFilenameCandidate(String(utf8Match[1] || '').trim());
        }
    }
    const plainMatch = raw.match(/filename="?([^\";]+)"?/i);
    if (plainMatch?.[1]) return sanitizeFilenameCandidate(String(plainMatch[1] || '').trim());
    return null;
}

function buildQuickReplyFilename({ fileNameHint = '', sourceUrl = '', mimeType = '' } = {}) {
    const safeHint = sanitizeFilenameCandidate(fileNameHint) || null;
    const safeSource = sanitizeFilenameCandidate(sourceUrl) || null;
    const fallback = safeHint || safeSource || `adjunto_${Date.now()}`;
    const extension = getFilenameExtension(fallback);
    if (extension) return fallback;
    const mimeExt = guessFileExtensionFromMime(mimeType);
    return mimeExt ? `${fallback}.${mimeExt}` : fallback;
}

function parseCatalogImageDataUrl(rawValue = '', { maxBytes = 4 * 1024 * 1024 } = {}) {
    const clean = String(rawValue || '').trim();
    if (!/^data:image\//i.test(clean)) return null;

    const match = clean.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) return null;

    const mimetype = String(match[1] || '').trim().toLowerCase();
    if (!mimetype.startsWith('image/')) return null;

    let buffer;
    try {
        buffer = Buffer.from(String(match[2] || '').trim(), 'base64');
    } catch (e) {
        return null;
    }

    if (!buffer?.length || buffer.length > maxBytes) return null;

    return {
        mediaData: buffer.toString('base64'),
        mimetype,
        extension: CATALOG_IMAGE_EXT_BY_MIME[mimetype] || ((() => { const suffix = String(mimetype.split('/')[1] || '').trim().toLowerCase(); if (suffix === 'jpeg' || suffix === 'jpg') return 'jpg'; return suffix || 'jpg'; })()),
        fileSizeBytes: buffer.length,
        sourceUrl: null,
        publicUrl: null,
        relativePath: null
    };
}

async function fetchCatalogProductImageFromLocalUpload(reference = null, { maxBytes = 4 * 1024 * 1024 } = {}) {
    if (!reference?.absolutePath) return null;

    try {
        const stat = await fs.promises.stat(reference.absolutePath);
        if (!stat?.isFile()) return null;
        if (Number(stat.size || 0) <= 0 || Number(stat.size || 0) > maxBytes) return null;

        const imageBuffer = await fs.promises.readFile(reference.absolutePath);
        if (!imageBuffer?.length || imageBuffer.length > maxBytes) return null;

        const guessedMime = guessMimeFromPathOrUrl(reference.absolutePath);
        return {
            mediaData: imageBuffer.toString('base64'),
            mimetype: guessedMime,
            extension: CATALOG_IMAGE_EXT_BY_MIME[guessedMime] || String(path.extname(reference.absolutePath || '').replace(/^\./, '') || 'jpg').toLowerCase(),
            sourceUrl: reference.sourceUrl || reference.publicUrl || null,
            publicUrl: reference.publicUrl || null,
            relativePath: reference.relativePath || null,
            fileSizeBytes: Number(imageBuffer.length || 0) || null
        };
    } catch (e) {
        return null;
    }
}

async function fetchQuickReplyMedia(rawUrl = '', { maxBytes = QUICK_REPLY_MEDIA_MAX_BYTES, timeoutMs = QUICK_REPLY_MEDIA_TIMEOUT_MS, mimeHint = '', fileNameHint = '' } = {}) {
    const cleanUrl = String(rawUrl || '').trim();
    const cleanMimeHint = String(mimeHint || '').trim().toLowerCase();
    const safeMaxBytes = Math.max(256 * 1024, Number(maxBytes || QUICK_REPLY_MEDIA_MAX_BYTES || (50 * 1024 * 1024)));
    const safeTimeoutMs = Math.max(2000, Number(timeoutMs || QUICK_REPLY_MEDIA_TIMEOUT_MS || 15000));
    if (!cleanUrl) return null;

    const dataUrlMatch = cleanUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
        try {
            const mimetype = String(dataUrlMatch[1] || cleanMimeHint || 'application/octet-stream').trim().toLowerCase();
            const mediaBuffer = Buffer.from(String(dataUrlMatch[2] || '').trim(), 'base64');
            if (!mediaBuffer?.length || mediaBuffer.length > safeMaxBytes) return null;
            const filename = buildQuickReplyFilename({
                fileNameHint,
                sourceUrl: '',
                mimeType: mimetype
            });
            return {
                mediaData: mediaBuffer.toString('base64'),
                mimetype,
                filename,
                fileSizeBytes: Number(mediaBuffer.length || 0) || null,
                sourceUrl: null,
                publicUrl: null,
                relativePath: null
            };
        } catch (e) {
            return null;
        }
    }

    const localReference = resolveLocalUploadReference(cleanUrl);
    if (localReference?.absolutePath) {
        try {
            const stat = await fs.promises.stat(localReference.absolutePath);
            if (!stat?.isFile()) return null;
            const fileSizeBytes = Number(stat.size || 0);
            if (!fileSizeBytes || fileSizeBytes > safeMaxBytes) return null;
            const mediaBuffer = await fs.promises.readFile(localReference.absolutePath);
            if (!mediaBuffer?.length || mediaBuffer.length > safeMaxBytes) return null;
            const guessedMime = cleanMimeHint || guessMimeFromFilename(localReference.absolutePath) || 'application/octet-stream';
            const filename = buildQuickReplyFilename({
                fileNameHint: fileNameHint || path.basename(localReference.absolutePath || ''),
                sourceUrl: localReference.sourceUrl || localReference.publicUrl || '',
                mimeType: guessedMime
            });
            return {
                mediaData: mediaBuffer.toString('base64'),
                mimetype: guessedMime,
                filename,
                fileSizeBytes: Number(mediaBuffer.length || 0) || null,
                sourceUrl: localReference.sourceUrl || localReference.publicUrl || null,
                publicUrl: localReference.publicUrl || null,
                relativePath: localReference.relativePath || null
            };
        } catch (e) {
            return null;
        }
    }

    let parsed;
    try {
        parsed = new URL(cleanUrl);
    } catch (e) {
        return null;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;

    try {
        await resolveAndValidatePublicHost(parsed.hostname);
    } catch (e) {
        return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), safeTimeoutMs);
    let response;
    try {
        response = await fetch(parsed.toString(), {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Lavitat QuickReply Media Fetcher)',
                'Accept': '*/*'
            },
            signal: controller.signal
        });
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timeout);
    }

    if (!response?.ok) return null;

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > safeMaxBytes) return null;

    const mediaBuffer = Buffer.from(await response.arrayBuffer());
    if (!mediaBuffer.length || mediaBuffer.length > safeMaxBytes) return null;

    const responseMime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const mimetype = responseMime || cleanMimeHint || guessMimeFromFilename(parsed.pathname) || 'application/octet-stream';
    const filename = buildQuickReplyFilename({
        fileNameHint: fileNameHint || parseContentDispositionFilename(response.headers.get('content-disposition') || ''),
        sourceUrl: parsed.pathname,
        mimeType: mimetype
    });

    return {
        mediaData: mediaBuffer.toString('base64'),
        mimetype,
        filename,
        fileSizeBytes: Number(mediaBuffer.length || 0) || null,
        sourceUrl: parsed.toString(),
        publicUrl: parsed.toString(),
        relativePath: null
    };
}
async function fetchCatalogProductImageFromUrl(rawUrl, { maxBytes = 4 * 1024 * 1024, timeoutMs = 7000 } = {}) {
    const cleanUrl = String(rawUrl || '').trim();
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) return null;

    const localReference = resolveLocalUploadReference(cleanUrl);
    if (localReference) {
        const localMedia = await fetchCatalogProductImageFromLocalUpload(localReference, { maxBytes });
        if (localMedia) return localMedia;
    }

    let parsed;
    try {
        parsed = new URL(cleanUrl);
    } catch (e) {
        return null;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) return null;

    try {
        await resolveAndValidatePublicHost(parsed.hostname);
    } catch (e) {
        return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
        response = await fetch(parsed.toString(), {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Catalog Fetcher)',
                'Accept': CATALOG_IMAGE_FETCH_ACCEPT
            },
            signal: controller.signal
        });
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timeout);
    }

    if (!response?.ok) return null;

    const contentTypeRaw = String(response.headers.get('content-type') || '').toLowerCase();
    const contentType = contentTypeRaw.split(';')[0] || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > maxBytes) return null;

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (!imageBuffer.length || imageBuffer.length > maxBytes) return null;

    return {
        mediaData: imageBuffer.toString('base64'),
        mimetype: contentType,
        extension: CATALOG_IMAGE_EXT_BY_MIME[contentType] || 'jpg',
        sourceUrl: parsed.toString(),
        publicUrl: parsed.toString(),
        relativePath: null,
        fileSizeBytes: Number(imageBuffer.length || 0) || null
    };
}

async function fetchCatalogProductImage(imageUrl, { maxBytes = 4 * 1024 * 1024, timeoutMs = 7000 } = {}) {
    const inline = parseCatalogImageDataUrl(imageUrl, { maxBytes });
    if (inline) return inline;

    const localReference = resolveLocalUploadReference(imageUrl);
    if (localReference) {
        const localMedia = await fetchCatalogProductImageFromLocalUpload(localReference, { maxBytes });
        if (localMedia) return localMedia;
    }

    const candidates = buildCatalogImageCandidateUrls(imageUrl);
    if (!candidates.length) return null;

    let fallbackUnsupported = null;
    for (const candidate of candidates) {
        const localCandidate = resolveLocalUploadReference(candidate);
        const media = localCandidate
            ? await fetchCatalogProductImageFromLocalUpload(localCandidate, { maxBytes })
            : await fetchCatalogProductImageFromUrl(candidate, { maxBytes, timeoutMs });
        if (!media) continue;
        const mediaMime = String(media?.mimetype || '').trim().toLowerCase();
        if (CLOUD_CATALOG_COMPATIBLE_MIME.has(mediaMime)) return media;
        if (!fallbackUnsupported && mediaMime.startsWith('image/')) fallbackUnsupported = media;
    }

    return fallbackUnsupported;
}

async function ensureCloudApiCompatibleCatalogImage(media = null, { maxBytes = 4 * 1024 * 1024 } = {}) {
    if (!media || typeof media !== 'object') return null;
    const mediaMime = String(media?.mimetype || '').trim().toLowerCase();
    if (!mediaMime.startsWith('image/')) return null;

    if (CLOUD_CATALOG_COMPATIBLE_MIME.has(mediaMime)) {
        return {
            mediaData: String(media.mediaData || ''),
            mimetype: mediaMime,
            extension: CATALOG_IMAGE_EXT_BY_MIME[mediaMime] || 'jpg',
            sourceUrl: String(media?.sourceUrl || '').trim() || null,
            publicUrl: String(media?.publicUrl || media?.sourceUrl || '').trim() || null,
            relativePath: String(media?.relativePath || '').trim() || null,
            fileSizeBytes: Number(media?.fileSizeBytes || 0) || null
        };
    }

    const sharp = getSharpImageProcessor();
    if (!sharp) return null;

    try {
        const inputBuffer = Buffer.from(String(media.mediaData || ''), 'base64');
        if (!inputBuffer.length) return null;

        const convertedBuffer = await sharp(inputBuffer, { failOn: 'none', animated: false })
            .rotate()
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 86, mozjpeg: true })
            .toBuffer();

        if (!convertedBuffer.length || convertedBuffer.length > maxBytes) return null;

        return {
            mediaData: convertedBuffer.toString('base64'),
            mimetype: 'image/jpeg',
            extension: 'jpg',
            convertedFrom: mediaMime,
            sourceUrl: String(media?.sourceUrl || '').trim() || null,
            publicUrl: String(media?.publicUrl || media?.sourceUrl || '').trim() || null,
            relativePath: String(media?.relativePath || '').trim() || null,
            fileSizeBytes: Number(convertedBuffer.length || 0) || null
        };
    } catch (error) {
        return null;
    }
}
function resolveChatDisplayName(chat) {
    if (!chat) return 'Sin nombre';

    const contact = chat.contact || null;
    const chatId = String(chat?.id?._serialized || '');
    const candidates = [
        String(chat.name || '').trim(),
        String(chat.formattedTitle || '').trim(),
        String(contact?.name || '').trim(),
        String(contact?.pushname || '').trim(),
        String(contact?.shortName || '').trim(),
    ].filter(Boolean);

    const bestHuman = candidates.find((name) => !name.includes('@') && !/^\d{14,}$/.test(name));
    if (bestHuman) return bestHuman;

    const fallbackPhone = coerceHumanPhone(
        contact?.number
        || contact?.phoneNumber
        || (!isLidIdentifier(chatId) ? (contact?.id?.user || chat?.id?.user || String(chatId).split('@')[0] || '') : '')
    );
    if (fallbackPhone) return `+${fallbackPhone}`;

    return 'Sin nombre';
}

function buildProfilePicCandidates(rawId, extraCandidates = []) {
    const out = [];
    const push = (value) => {
        const text = String(value || '').trim();
        if (!text) return;
        if (!out.includes(text)) out.push(text);
        if (!text.includes('@')) {
            const digits = text.replace(/\D/g, '');
            if (digits && !out.includes(`${digits}@c.us`)) out.push(`${digits}@c.us`);
        } else {
            const localPart = text.split('@')[0] || '';
            const digits = localPart.replace(/\D/g, '');
            if (digits && !out.includes(`${digits}@c.us`)) out.push(`${digits}@c.us`);
        }
    };

    push(rawId);
    (Array.isArray(extraCandidates) ? extraCandidates : []).forEach(push);
    return out;
}

async function resolveProfilePic(client, chatOrContactId, extraCandidates = []) {
    const candidates = buildProfilePicCandidates(chatOrContactId, extraCandidates);

    for (const candidate of candidates) {
        try {
            const direct = await client.getProfilePicUrl(candidate);
            if (direct) return direct;
        } catch (e) { }
    }

    for (const candidate of candidates) {
        try {
            const contact = await client.getContactById(candidate);
            if (contact?.getProfilePicUrl) {
                const fromContact = await contact.getProfilePicUrl();
                if (fromContact) return fromContact;
            }
        } catch (e) { }
    }

    for (const candidate of candidates) {
        try {
            const chat = await client.getChatById(candidate);
            if (chat?.contact?.getProfilePicUrl) {
                const fromChatContact = await chat.contact.getProfilePicUrl();
                if (fromChatContact) return fromChatContact;
            }
        } catch (e) { }
    }

    return null;
}

function truncateDisplayValue(value = '', maxLen = 260) {
    const text = String(value ?? '');
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

function snapshotSerializable(input, depth = 0, seen = new WeakSet()) {
    if (depth > 3) return undefined;
    if (input === null || input === undefined) return input;

    const t = typeof input;
    if (t === 'string') return truncateDisplayValue(input);
    if (t === 'number' || t === 'boolean') return input;
    if (t === 'bigint') return String(input);
    if (t === 'function' || t === 'symbol') return undefined;

    if (Array.isArray(input)) {
        return input
            .slice(0, 30)
            .map((entry) => snapshotSerializable(entry, depth + 1, seen))
            .filter((entry) => entry !== undefined);
    }

    if (input instanceof Date) return input.toISOString();
    if (Buffer.isBuffer(input)) return `[buffer:${input.length}]`;

    if (t === 'object') {
        if (seen.has(input)) return '[circular]';
        seen.add(input);
        const out = {};
        const keys = Object.keys(input).slice(0, 80);
        for (const key of keys) {
            const value = snapshotSerializable(input[key], depth + 1, seen);
            if (value !== undefined && value !== '') out[key] = value;
        }
        return out;
    }

    return undefined;
}

function normalizeBusinessDetailsSnapshot(businessProfile = null) {
    if (!businessProfile) return null;
    const websites = Array.isArray(businessProfile?.website)
        ? businessProfile.website.filter(Boolean)
        : (businessProfile?.website ? [businessProfile.website] : []);

    return {
        category: businessProfile?.category || null,
        description: businessProfile?.description || null,
        email: businessProfile?.email || null,
        website: websites[0] || null,
        websites,
        address: businessProfile?.address || null,
        businessHours: businessProfile?.business_hours || businessProfile?.businessHours || null,
        raw: snapshotSerializable(businessProfile)
    };
}

function extractContactSnapshot(contact = null) {
    if (!contact) return null;
    const raw = contact?._data || {};
    return {
        id: contact?.id?._serialized || null,
        user: contact?.id?.user || null,
        server: contact?.id?.server || null,
        number: contact?.number || raw?.userid || null,
        name: contact?.name || null,
        pushname: contact?.pushname || null,
        shortName: contact?.shortName || null,
        verifiedName: raw?.verifiedName || null,
        verifiedLevel: raw?.verifiedLevel || null,
        statusMute: raw?.statusMute || null,
        type: raw?.type || null,
        isBusiness: Boolean(contact?.isBusiness),
        isEnterprise: Boolean(contact?.isEnterprise),
        isMyContact: Boolean(contact?.isMyContact),
        isMe: Boolean(contact?.isMe),
        isUser: Boolean(contact?.isUser),
        isGroup: Boolean(contact?.isGroup),
        isWAContact: Boolean(contact?.isWAContact),
        isBlocked: Boolean(contact?.isBlocked),
        isPSA: Boolean(contact?.isPSA),
        rawData: snapshotSerializable(raw)
    };
}

function extractChatSnapshot(chat = null) {
    if (!chat) return null;
    return {
        id: chat?.id?._serialized || null,
        archived: Boolean(chat?.archived),
        pinned: Boolean(chat?.pinned),
        isMuted: Boolean(chat?.isMuted),
        muteExpiration: Number(chat?.muteExpiration || 0) || null,
        unreadCount: Number(chat?.unreadCount || 0) || 0,
        timestamp: Number(chat?.timestamp || 0) || null,
        isGroup: Boolean(chat?.isGroup),
        participantsCount: Boolean(chat?.isGroup) ? (extractGroupParticipants(chat).length || 0) : null,
        rawData: snapshotSerializable(chat?._data || null)
    };
}




function toParticipantArray(rawParticipants) {
    if (!rawParticipants) return [];
    if (Array.isArray(rawParticipants)) return rawParticipants;
    if (Array.isArray(rawParticipants?._models)) return rawParticipants._models;
    if (Array.isArray(rawParticipants?.models)) return rawParticipants.models;
    if (typeof rawParticipants?.serialize === 'function') {
        try {
            const serialized = rawParticipants.serialize();
            if (Array.isArray(serialized)) return serialized;
        } catch (e) { }
    }
    if (rawParticipants?._map && typeof rawParticipants._map.forEach === 'function') {
        const models = [];
        rawParticipants._map.forEach((value) => models.push(value));
        return models;
    }
    return [];
}

function normalizeGroupParticipant(participant = {}) {
    const idFromObject = participant?.id && typeof participant.id === 'object'
        ? (participant.id?._serialized || ((participant.id.user && participant.id.server) ? `${participant.id.user}@${participant.id.server}` : null))
        : null;
    const rawId = idFromObject
        || participant?.id
        || participant?.wid?._serialized
        || participant?.wid
        || participant?._serialized
        || participant?.participant
        || null;
    const id = String(rawId || '').trim();
    if (!id) return null;

    const isSuperAdmin = Boolean(participant?.isSuperAdmin || participant?.superadmin);
    const isAdmin = isSuperAdmin || Boolean(participant?.isAdmin || participant?.admin);
    const phone = coerceHumanPhone(
        participant?.number
        || participant?.phone
        || participant?.id?.user
        || String(id).split('@')[0]
        || ''
    );

    const name = String(
        participant?.formattedShortName
        || participant?.shortName
        || participant?.name
        || participant?.pushname
        || participant?.notify
        || ''
    ).trim();

    return {
        id,
        phone: phone || null,
        name: name || null,
        isAdmin,
        isSuperAdmin,
        isMe: Boolean(participant?.isMe),
        role: isSuperAdmin ? 'superadmin' : (isAdmin ? 'admin' : 'member')
    };
}

function isInternalLikeName(value = '') {
    const text = String(value || '').trim();
    if (!text) return true;
    return text.includes('@') || /^\d{14,}$/.test(text);
}

function getGroupParticipantContactCache(key = '') {
    const safeKey = String(key || '').trim();
    if (!safeKey) return null;
    const hit = groupParticipantContactCache.get(safeKey);
    if (!hit) return null;
    if (Date.now() - Number(hit.updatedAt || 0) > GROUP_PARTICIPANT_CONTACT_TTL_MS) {
        groupParticipantContactCache.delete(safeKey);
        return null;
    }
    return hit.value || null;
}

function setGroupParticipantContactCache(keys = [], value = null) {
    const payload = value && typeof value === 'object' ? value : null;
    if (!payload) return;
    const now = Date.now();
    keys.forEach((key) => {
        const safeKey = String(key || '').trim();
        if (!safeKey) return;
        groupParticipantContactCache.set(safeKey, { value: payload, updatedAt: now });
    });
}

async function resolveGroupParticipantContact(client, participant = {}) {
    const participantId = String(participant?.id || '').trim();
    const phone = coerceHumanPhone(participant?.phone || participantId.split('@')[0] || '');

    const cacheKeys = [
        participantId,
        phone ? `phone:${phone}` : ''
    ].filter(Boolean);

    for (const key of cacheKeys) {
        const cached = getGroupParticipantContactCache(key);
        if (cached) return cached;
    }

    if (!client?.getContactById) return null;

    const candidateIds = [
        participantId,
        phone ? `${phone}@c.us` : '',
        phone ? `${phone}@s.whatsapp.net` : '',
        phone ? `${phone}@lid` : ''
    ].filter(Boolean);

    const tried = new Set();
    for (const candidateId of candidateIds) {
        if (tried.has(candidateId)) continue;
        tried.add(candidateId);

        try {
            const contact = await client.getContactById(candidateId);
            const raw = contact?._data || {};
            const resolved = {
                name: String(contact?.name || contact?.pushname || contact?.shortName || raw?.verifiedName || '').trim() || null,
                pushname: String(contact?.pushname || raw?.notifyName || '').trim() || null,
                shortName: String(contact?.shortName || '').trim() || null,
                phone: coerceHumanPhone(contact?.number || raw?.userid || phone || '') || phone || null
            };

            setGroupParticipantContactCache([...cacheKeys, candidateId], resolved);
            return resolved;
        } catch (e) { }
    }

    return null;
}

async function hydrateGroupParticipantsWithContacts(client, participants = []) {
    if (!Array.isArray(participants) || participants.length === 0) return [];

    const hydrated = [];
    const maxItems = Math.min(participants.length, 256);
    for (let idx = 0; idx < maxItems; idx += 1) {
        const current = participants[idx];
        if (!current || typeof current !== 'object') continue;

        const next = { ...current };
        const hasUsefulName = Boolean(next.name && !isInternalLikeName(next.name));

        if (!hasUsefulName || !next.phone) {
            const resolved = await resolveGroupParticipantContact(client, next);
            if (resolved) {
                const resolvedName = String(resolved.name || resolved.pushname || resolved.shortName || '').trim();
                if (!hasUsefulName && resolvedName && !isInternalLikeName(resolvedName)) {
                    next.name = resolvedName;
                }
                next.pushname = resolved.pushname || next.pushname || null;
                next.shortName = resolved.shortName || next.shortName || null;
                if (!next.phone && resolved.phone) next.phone = resolved.phone;
            }
        }

        hydrated.push(next);
    }

    return hydrated;
}

function extractGroupParticipants(chat = null) {
    const participants = [];
    const seen = new Set();
    const sources = [
        chat?.participants,
        chat?.groupMetadata?.participants,
        chat?._data?.groupMetadata?.participants,
        chat?._data?.participants
    ];

    sources.forEach((source) => {
        const models = toParticipantArray(source);
        models.forEach((model) => {
            const normalized = normalizeGroupParticipant(model);
            if (!normalized || seen.has(normalized.id)) return;
            seen.add(normalized.id);
            participants.push(normalized);
        });
    });

    return participants;
}

async function fetchGroupParticipantsFromStore(client, groupId = '') {
    if (!client?.pupPage?.evaluate || !groupId) return [];
    try {
        const raw = await client.pupPage.evaluate(async (targetGroupId) => {
            try {
                const widFactory = window.Store?.WidFactory;
                const chatStore = window.Store?.Chat;
                if (!widFactory || !chatStore) return [];

                const groupWid = widFactory.createWid(targetGroupId);
                const chat = chatStore.get(groupWid) || await chatStore.find(groupWid);
                if (!chat) return [];

                try {
                    const groupMetadataStore = window.Store?.GroupMetadata || window.Store?.WAWebGroupMetadataCollection;
                    if (groupMetadataStore?.update) {
                        await groupMetadataStore.update(groupWid);
                    }
                } catch (e) { }

                const participantsCollection = chat?.groupMetadata?.participants || [];
                const models = Array.isArray(participantsCollection)
                    ? participantsCollection
                    : (participantsCollection?._models || participantsCollection?.models || []);

                return models.map((participant) => ({
                    id: participant?.id?._serialized || participant?.id || null,
                    phone: participant?.id?.user || null,
                    name: participant?.formattedShortName || participant?.name || participant?.notify || participant?.pushname || null,
                    isAdmin: Boolean(participant?.isAdmin || participant?.isSuperAdmin || participant?.admin || participant?.superadmin),
                    isSuperAdmin: Boolean(participant?.isSuperAdmin || participant?.superadmin),
                    isMe: Boolean(participant?.isMe)
                })).filter((entry) => Boolean(entry?.id));
            } catch (e) {
                return [];
            }
        }, groupId);

        if (!Array.isArray(raw)) return [];
        return raw.map((participant) => normalizeGroupParticipant(participant)).filter(Boolean);
    } catch (e) {
        return [];
    }
}
function getSenderMetaCache(key = '') {
    const safeKey = String(key || '').trim();
    if (!safeKey) return null;
    const hit = senderMetaCache.get(safeKey);
    if (!hit) return null;
    if (Date.now() - Number(hit.updatedAt || 0) > SENDER_META_TTL_MS) {
        senderMetaCache.delete(safeKey);
        return null;
    }
    return hit.value || null;
}

function setSenderMetaCache(keys = [], value = null) {
    const payload = value && typeof value === 'object' ? value : null;
    if (!payload) return;
    const now = Date.now();
    keys.forEach((key) => {
        const safeKey = String(key || '').trim();
        if (!safeKey) return;
        senderMetaCache.set(safeKey, { value: payload, updatedAt: now });
    });
}

async function resolveMessageSenderMeta(msg) {
    try {
        const base = {
            notifyName: null,
            senderPhone: null,
            senderId: null,
            senderPushname: null,
            isGroupMessage: false
        };
        if (!msg || msg.fromMe) return base;

        const fromId = String(msg?.from || '').trim();
        const authorId = String(msg?.author || msg?._data?.author || '').trim();
        const isGroupMessage = fromId.endsWith('@g.us');
        const senderId = String((isGroupMessage ? authorId : fromId) || '').trim() || null;
        const senderPhone = coerceHumanPhone(
            (senderId || '').split('@')[0]
            || authorId.split('@')[0]
            || fromId.split('@')[0]
            || msg?._data?.sender?.id?.user
            || ''
        );

        const cacheKeys = [
            senderId,
            senderPhone ? `phone:${senderPhone}` : '',
            fromId,
            authorId
        ].filter(Boolean);
        for (const key of cacheKeys) {
            const cached = getSenderMetaCache(key);
            if (cached) return { ...cached, isGroupMessage };
        }

        let notifyName = String(msg?._data?.notifyName || msg?._data?.senderObj?.pushname || '').trim() || null;
        let senderPushname = String(msg?._data?.senderObj?.pushname || '').trim() || null;

        const candidateIds = [
            senderId,
            authorId,
            senderPhone ? `${senderPhone}@c.us` : '',
            senderPhone ? `${senderPhone}@s.whatsapp.net` : '',
            senderPhone ? `${senderPhone}@lid` : ''
        ].filter(Boolean);

        const tried = new Set();
        for (const candidateId of candidateIds) {
            if (tried.has(candidateId)) continue;
            tried.add(candidateId);
            try {
                const contact = await waClient.client.getContactById(candidateId);
                const raw = contact?._data || {};
                notifyName = String(contact?.name || contact?.pushname || contact?.shortName || raw?.verifiedName || notifyName || '').trim() || notifyName;
                senderPushname = String(contact?.pushname || raw?.notifyName || senderPushname || '').trim() || senderPushname;
                if (notifyName || senderPushname) break;
            } catch (e) { }
        }

        if (!notifyName) {
            try {
                const fallbackContact = await msg.getContact();
                notifyName = String(fallbackContact?.name || fallbackContact?.pushname || fallbackContact?.shortName || '').trim() || null;
                senderPushname = String(fallbackContact?.pushname || senderPushname || '').trim() || senderPushname;
            } catch (e) { }
        }

        const resolved = {
            notifyName: notifyName || senderPushname || null,
            senderPhone: senderPhone || null,
            senderId,
            senderPushname: senderPushname || null,
            isGroupMessage
        };
        setSenderMetaCache(cacheKeys, resolved);
        return resolved;
    } catch (e) {
        return {
            notifyName: null,
            senderPhone: null,
            senderId: null,
            senderPushname: null,
            isGroupMessage: false
        };
    }
}

function isStatusOrSystemMessage(msg) {
    const from = String(msg?.from || '');
    const to = String(msg?.to || '');
    const type = String(msg?.type || '').toLowerCase();

    if (from.includes('status@broadcast') || to.includes('status@broadcast')) return true;
    if (from.endsWith('@broadcast') || to.endsWith('@broadcast')) return true;

    const blockedTypes = new Set([
        'e2e_notification',
        'notification',
        'ciphertext',
        'revoked'
    ]);

    return blockedTypes.has(type);
}

function isVisibleChatId(chatId) {
    const id = String(chatId || '');
    if (!id) return false;
    if (id.includes('status@broadcast')) return false;
    if (id.endsWith('@broadcast')) return false;
    return true;
}

function resolveLastMessagePreview(chat = {}) {
    const last = chat?.lastMessage;
    if (!last) return '';

    const type = String(last?.type || last?._data?.type || '').toLowerCase();
    if (type === 'location') {
        const location = extractLocationInfo(last);
        if (location?.label) return `Ubicacion: ${location.label}`;
        return 'Ubicacion';
    }

    const mediaMap = {
        image: 'Imagen',
        video: 'Video',
        audio: 'Audio',
        ptt: 'Nota de voz',
        document: 'Documento',
        sticker: 'Sticker',
        vcard: 'Contacto',
        order: 'Pedido',
        revoked: 'Mensaje eliminado'
    };

    if (type && type !== 'chat' && mediaMap[type]) {
        return mediaMap[type];
    }

    const body = String(last?.body || '').trim();
    if (body) {
        const possibleCoords = extractCoordsFromText(body);
        const hasMapUrl = /https?:\/\/(?:www\.)?(?:google\.[^\s/]+\/maps|maps\.app\.goo\.gl|maps\.google\.com)/i.test(body);
        if (possibleCoords || hasMapUrl) return 'Ubicacion';
        return body;
    }

    return 'Mensaje';
}

function defaultCountryCode() {
    return normalizePhoneDigits(process.env.WA_DEFAULT_COUNTRY_CODE || process.env.DEFAULT_COUNTRY_CODE || '51');
}

function buildPhoneCandidates(rawPhone) {
    const clean = normalizePhoneDigits(rawPhone);
    if (!clean) return [];

    const cc = defaultCountryCode();
    const trimmed = clean.replace(/^0+/, '') || clean;
    const candidates = [];

    const push = (v) => {
        const digits = normalizePhoneDigits(v);
        if (!digits) return;
        if (!candidates.includes(digits)) candidates.push(digits);
    };

    const isLikelyLocal = trimmed.length <= 10;
    if (isLikelyLocal && cc && !trimmed.startsWith(cc)) push(`${cc}${trimmed}`);
    push(trimmed);
    if (cc && trimmed.startsWith(cc)) push(trimmed.slice(cc.length));

    return candidates;
}

async function resolveRegisteredNumber(client, rawPhone) {
    const candidates = buildPhoneCandidates(rawPhone);
    for (const cand of candidates) {
        try {
            const numberId = await client.getNumberId(cand);
            if (!numberId) continue;

            const candDigits = coerceHumanPhone(cand);
            const byUser = coerceHumanPhone(numberId.user || '');
            const serialized = String(numberId._serialized || '');
            const bySerialized = coerceHumanPhone(serialized.split('@')[0] || '');

            const looksLikeSameNumber = (a, b) => {
                if (!a || !b) return false;
                return a === b || a.endsWith(b) || b.endsWith(a);
            };

            if (byUser && candDigits && looksLikeSameNumber(byUser, candDigits)) return byUser;
            if (bySerialized && candDigits && looksLikeSameNumber(bySerialized, candDigits)) return bySerialized;
            if (candDigits) return candDigits;
            if (byUser) return byUser;
            if (bySerialized) return bySerialized;
        } catch (e) { }
    }
    return null;
}

function normalizeFilterToken(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeFilterTokens(tokens = []) {
    if (!Array.isArray(tokens)) return [];
    const seen = new Set();
    const normalized = [];
    for (const token of tokens) {
        const clean = normalizeFilterToken(token);
        if (!clean) continue;
        if (seen.has(clean)) continue;
        seen.add(clean);
        normalized.push(clean);
    }
    return normalized;
}

function toLabelTokenSet(labels = []) {
    const tokens = new Set();
    if (!Array.isArray(labels)) return tokens;
    for (const label of labels) {
        const id = normalizeFilterToken(label?.id);
        if (id) tokens.add(`id:${id}`);
        const name = normalizeFilterToken(label?.name);
        if (name) tokens.add(`name:${name}`);
    }
    return tokens;
}

function matchesTokenSet(labelTokenSet, selectedTokens) {
    if (!(labelTokenSet instanceof Set)) return false;
    if (!Array.isArray(selectedTokens) || selectedTokens.length === 0) return true;
    return selectedTokens.some((token) => {
        const clean = normalizeFilterToken(token);
        if (!clean) return false;
        if (labelTokenSet.has(clean)) return true;
        if (clean.startsWith('id:')) {
            const value = clean.slice(3);
            return value ? labelTokenSet.has(value) : false;
        }
        if (clean.startsWith('name:')) {
            const value = clean.slice(5);
            return value ? labelTokenSet.has(value) : false;
        }
        return labelTokenSet.has(`id:${clean}`) || labelTokenSet.has(`name:${clean}`);
    });
}

async function runWithConcurrency(items, limit, worker) {
    if (!Array.isArray(items) || items.length === 0) return;
    const max = Math.max(1, Math.floor(Number(limit) || 1));
    let cursor = 0;

    const runners = Array.from({ length: Math.min(max, items.length) }, async () => {
        while (true) {
            const idx = cursor++;
            if (idx >= items.length) return;
            await worker(items[idx], idx);
        }
    });

    await Promise.all(runners);
}
class SocketManager {
    constructor(io) {
        this.io = io;
        this.chatMetaCache = new Map();
        this.chatMetaTtlMs = Number(process.env.CHAT_META_TTL_MS || 10 * 60 * 1000);
        this.chatListCache = { items: [], updatedAt: 0 };
        this.chatListTtlMs = Number(process.env.CHAT_LIST_TTL_MS || 15000);
        this.contactListCache = { items: [], updatedAt: 0 };
        this.contactListTtlMs = Number(process.env.CONTACT_LIST_TTL_MS || 60 * 1000);
        this.activeRuntimeContext = {
            tenantId: 'default',
            moduleId: 'default',
            transportMode: 'idle',
            webjsNamespace: typeof waClient.getWebjsSessionNamespace === 'function' ? waClient.getWebjsSessionNamespace() : null,
            updatedAt: Date.now()
        };
        this.setupSocketEvents();
        this.setupWAClientEvents();
    }


    getWaRuntime() {
        const runtime = typeof waClient.getRuntimeInfo === 'function'
            ? waClient.getRuntimeInfo()
            : {};
        return {
            requestedTransport: String(runtime?.requestedTransport || process.env.WA_TRANSPORT || 'idle').toLowerCase(),
            activeTransport: String(runtime?.activeTransport || 'idle').toLowerCase(),
            cloudRequested: Boolean(runtime?.cloudRequested),
            cloudConfigured: Boolean(runtime?.cloudConfigured),
            cloudReady: Boolean(runtime?.cloudReady),
            availableTransports: Array.isArray(runtime?.availableTransports) ? runtime.availableTransports : ['cloud'],
            migrationReady: runtime?.migrationReady !== false
        };
    }

    getWaCapabilities() {
        const caps = waClient.getCapabilities();
        const runtime = this.getWaRuntime();
        return {
            messageEdit: Boolean(caps?.messageEdit),
            messageEditSync: Boolean(caps?.messageEditSync),
            messageForward: Boolean(caps?.messageForward),
            messageDelete: Boolean(caps?.messageDelete),
            messageReply: Boolean(caps?.messageReply),
            quickReplies: Boolean(caps?.quickReplies),
            quickRepliesRead: Boolean(caps?.quickRepliesRead),
            quickRepliesWrite: false,
            transport: runtime.activeTransport,
            requestedTransport: runtime.requestedTransport,
            cloudConfigured: runtime.cloudConfigured,
            cloudReady: runtime.cloudReady,
            availableTransports: runtime.availableTransports,
            migrationReady: runtime.migrationReady
        };
    }

    emitWaCapabilities(socket) {
        socket.emit('wa_capabilities', this.getWaCapabilities());

        socket.emit('wa_runtime', this.getWaRuntime());
    }


    async isFeatureEnabledForTenant(tenantId = 'default', featureKey = '') {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const tenant = tenantService.findTenantById(cleanTenantId) || tenantService.DEFAULT_TENANT;
        const tenantSettings = await tenantSettingsService.getTenantSettings(cleanTenantId);
        return planLimitsService.isFeatureEnabledForTenant(featureKey, tenant, tenantSettings);
    }

    async reserveAiQuota(tenantId = 'default', { socket = null } = {}) {
        const cleanTenantId = String(tenantId || 'default').trim() || 'default';
        const tenant = tenantService.findTenantById(cleanTenantId) || tenantService.DEFAULT_TENANT;
        const tenantSettings = await tenantSettingsService.getTenantSettings(cleanTenantId);

        const aiEnabled = planLimitsService.isFeatureEnabledForTenant('aiPro', tenant, tenantSettings);
        if (!aiEnabled) {
            if (socket) socket.emit('ai_error', 'La IA esta deshabilitada para esta empresa o plan.');
            return { ok: false, reason: 'disabled' };
        }

        const limits = planLimitsService.getTenantPlanLimits(tenant);
        const used = await aiUsageService.getMonthlyUsage(cleanTenantId);
        const limit = Number(limits?.maxMonthlyAiRequests || 0);

        if (Number.isFinite(limit) && limit > 0 && used >= limit) {
            if (socket) {
                socket.emit('ai_error', 'Se alcanzo el limite mensual de IA (' + limit + ') para el plan ' + (tenant.plan || 'starter') + '.');
            }
            return { ok: false, reason: 'quota_exceeded', used, limit };
        }

        const next = await aiUsageService.incrementMonthlyUsage(cleanTenantId, { incrementBy: 1 });
        return { ok: true, used: next, limit };
    }

    getTenantRoom(tenantId = 'default') {
        const cleanTenant = String(tenantId || 'default').trim() || 'default';
        return 'tenant:' + cleanTenant;
    }

    emitToTenant(tenantId, eventName, payload) {
        this.io.to(this.getTenantRoom(tenantId)).emit(eventName, payload);
    }

    getTenantModuleRoom(tenantId = 'default', moduleId = 'default') {
        const cleanTenant = String(tenantId || 'default').trim() || 'default';
        const cleanModule = String(moduleId || 'default').trim().toLowerCase() || 'default';
        return 'tenant:' + cleanTenant + ':module:' + cleanModule;
    }

    emitToTenantModule(tenantId, moduleId, eventName, payload) {
        this.io.to(this.getTenantModuleRoom(tenantId, moduleId)).emit(eventName, payload);
    }

        setActiveRuntimeContext({
        tenantId = 'default',
        moduleId = 'default',
        moduleName = null,
        modulePhone = null,
        channelType = null,
        transportMode = 'idle',
        webjsNamespace = null
    } = {}) {
        this.activeRuntimeContext = {
            tenantId: String(tenantId || 'default').trim() || 'default',
            moduleId: String(moduleId || 'default').trim().toLowerCase() || 'default',
            moduleName: String(moduleName || '').trim() || null,
            modulePhone: coerceHumanPhone(modulePhone || '') || null,
            channelType: String(channelType || '').trim().toLowerCase() || null,
            transportMode: String(transportMode || 'idle').trim().toLowerCase() || 'idle',
            webjsNamespace: String(webjsNamespace || '').trim() || null,
            updatedAt: Date.now()
        };
    }

    resolveRuntimeEventTarget() {
        const context = this.activeRuntimeContext && typeof this.activeRuntimeContext === 'object'
            ? this.activeRuntimeContext
            : null;

        if (context?.tenantId && context?.moduleId) {
            return { tenantId: context.tenantId, moduleId: context.moduleId };
        }

        const socketsMap = this.io?.sockets?.sockets;
        const sockets = socketsMap ? Array.from(socketsMap.values()) : [];
        const seen = new Set();
        let candidate = null;
        sockets.forEach((socket) => {
            const tenant = String(socket?.data?.tenantId || '').trim();
            const module = String(socket?.data?.waModuleId || '').trim().toLowerCase();
            if (!tenant || !module) return;
            const key = tenant + '::' + module;
            seen.add(key);
            if (!candidate) {
                candidate = { tenantId: tenant, moduleId: module };
            }
        });

        if (seen.size === 1 && candidate) return candidate;
        return candidate;
    }

    emitToRuntimeContext(eventName, payload) {
        const target = this.resolveRuntimeEventTarget();
        if (target?.tenantId) {
            this.emitToTenant(target.tenantId, eventName, payload);
            return;
        }
        this.io.emit(eventName, payload);
    }

    async enforceRuntimeWebjsPhonePolicy() {
        if (!WA_ENFORCE_WEBJS_PHONE_MATCH) return true;

        const runtime = this.getWaRuntime();
        const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
        if (activeTransport !== 'webjs') return true;

        const target = this.resolveRuntimeEventTarget();
        if (!target?.tenantId || !target?.moduleId) return true;

        const moduleConfig = await waModuleService.getModule(target.tenantId, target.moduleId).catch(() => null);
        const registeredPhone = normalizePhoneDigits(moduleConfig?.phoneNumber || '');
        if (!registeredPhone) return true;

        const connectedPhone = normalizePhoneDigits(waClient?.client?.info?.wid?.user || '');
        if (!connectedPhone) return true;

        if (looksLikeSamePhoneDigits(registeredPhone, connectedPhone)) return true;

        const warning = 'Numero no permitido para este modulo. Registrado: +' + registeredPhone + '. Escaneado: +' + connectedPhone + '.';
        this.emitToTenantModule(target.tenantId, target.moduleId, 'auth_failure', warning);

        try {
            await waClient.client.logout();
        } catch (_) { }

        try {
            waClient.isReady = false;
            await waClient.initialize();
        } catch (_) { }

        return false;
    }

    async persistMessageHistory(tenantId, {
        msg,
        senderMeta = null,
        fileMeta = null,
        order = null,
        location = null,
        quotedMessage = null,
        agentMeta = null,
        moduleContext = null
    } = {}) {
        try {
            if (!msg) return;
            const messageId = getSerializedMessageId(msg);
            const chatId = String(msg?.fromMe ? msg?.to : msg?.from || '').trim();
            if (!messageId || !chatId) return;

            const persistedAgentMeta = sanitizeAgentMeta(agentMeta);
            const historyModuleId = String(
                moduleContext?.moduleId
                || persistedAgentMeta?.sentViaModuleId
                || ''
            ).trim().toLowerCase() || null;
            const historyModulePhone = coerceHumanPhone(
                moduleContext?.phoneNumber
                || moduleContext?.phone
                || ''
            ) || null;
            const moduleAttributionMeta = buildModuleAttributionMeta(moduleContext);
            await messageHistoryService.upsertMessage(tenantId, {
                messageId,
                chatId,
                fromMe: Boolean(msg?.fromMe),
                senderId: senderMeta?.senderId || null,
                senderPhone: senderMeta?.senderPhone || null,
                waModuleId: historyModuleId,
                waPhoneNumber: historyModulePhone,
                authorId: String(msg?.author || msg?._data?.author || '').trim() || null,
                body: msg?.body || '',
                messageType: msg?.type || null,
                timestampUnix: Number(msg?.timestamp || 0) || Math.floor(Date.now() / 1000),
                ack: Number.isFinite(Number(msg?.ack)) ? Number(msg?.ack) : null,
                edited: false,
                hasMedia: Boolean(msg?.hasMedia),
                mediaMime: fileMeta?.mimetype || null,
                mediaFilename: fileMeta?.filename || null,
                mediaSizeBytes: Number(fileMeta?.fileSizeBytes || 0) || null,
                quotedMessageId: quotedMessage?.id || null,
                orderPayload: order && typeof order === 'object' ? order : null,
                locationPayload: location && typeof location === 'object' ? location : null,
                metadata: {
                    notifyName: senderMeta?.notifyName || null,
                    senderPushname: senderMeta?.senderPushname || null,
                    isGroupMessage: Boolean(senderMeta?.isGroupMessage),
                    media: {
                        url: fileMeta?.mediaUrl || null,
                        path: fileMeta?.mediaPath || null
                    },
                    sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || persistedAgentMeta?.sentViaModuleId || historyModuleId || null,
                    sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || persistedAgentMeta?.sentViaModuleName || null,
                    sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || persistedAgentMeta?.sentViaModuleImageUrl || null,
                    sentViaTransport: moduleAttributionMeta?.sentViaTransport || persistedAgentMeta?.sentViaTransport || null,
                    sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || historyModulePhone || null,
                    sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                    ...(persistedAgentMeta || {})
                },
                chat: {
                    id: chatId,
                    displayName: senderMeta?.notifyName || null,
                    phone: senderMeta?.senderPhone || null,
                    subtitle: senderMeta?.senderPushname || null
                }
            });

            const customerPhone = coerceHumanPhone(
                senderMeta?.senderPhone
                || chatId.split('@')[0]
                || ''
            );
            if (customerPhone) {
                await customerService.upsertFromInteraction(tenantId, {
                    moduleId: historyModuleId,
                    channelType: moduleContext?.channelType || moduleAttributionMeta?.sentViaChannelType || 'whatsapp',
                    messageId,
                    chatId,
                    phone: customerPhone,
                    contactName: senderMeta?.notifyName || senderMeta?.senderPushname || null,
                    direction: msg?.fromMe ? 'outbound' : 'inbound',
                    messageType: msg?.type || null,
                    lastMessageAt: new Date().toISOString(),
                    metadata: {
                        messageId,
                        senderId: senderMeta?.senderId || null,
                        senderPushname: senderMeta?.senderPushname || null,
                        waPhoneNumber: historyModulePhone,
                        fromMe: Boolean(msg?.fromMe)
                    }
                });
            }
            if (HISTORY_DEBUG_ENABLED) {
                console.info('[History] persist message ok tenant=' + String(tenantId || 'default') + ' chat=' + String(chatId || '') + ' msg=' + String(messageId || '') + ' module=' + String(historyModuleId || 'n/a'));
            }
        } catch (error) {
            console.warn('[History] persistMessageHistory failed:', String(error?.message || error));
        }
    }
    async persistMessageEdit(tenantId, {
        messageId,
        chatId,
        body,
        editedAtUnix
    } = {}) {
        try {
            await messageHistoryService.updateMessageEdit(tenantId, {
                messageId,
                chatId,
                body,
                editedAtUnix
            });
        } catch (error) {
            console.warn('[History] persistMessageEdit failed:', String(error?.message || error));
        }
    }

    async persistMessageAck(tenantId, {
        messageId,
        chatId,
        ack
    } = {}) {
        try {
            await messageHistoryService.updateMessageAck(tenantId, {
                messageId,
                chatId,
                ack
            });
        } catch (error) {
            console.warn('[History] persistMessageAck failed:', String(error?.message || error));
        }
    }

    resolveHistoryTenantId() {
        try {
            const runtimeTarget = this.resolveRuntimeEventTarget();
            if (runtimeTarget?.tenantId) return runtimeTarget.tenantId;
            const socketsMap = this.io?.sockets?.sockets;
            const entries = socketsMap ? Array.from(socketsMap.values()) : [];
            if (!entries.length) return 'default';
            const tenants = new Set(entries.map((socket) => String(socket?.data?.tenantId || 'default').trim() || 'default'));
            if (tenants.size === 1) return Array.from(tenants)[0] || 'default';
            return String(this.activeRuntimeContext?.tenantId || 'default').trim() || 'default';
        } catch (error) {
            return 'default';
        }
    }

    resolveHistoryModuleContext() {
        const runtimeContext = this.activeRuntimeContext && typeof this.activeRuntimeContext === 'object'
            ? this.activeRuntimeContext
            : {};
        const runtimeTarget = this.resolveRuntimeEventTarget();
        const moduleId = String(runtimeTarget?.moduleId || runtimeContext?.moduleId || '').trim().toLowerCase() || null;
        const phoneNumber = coerceHumanPhone(runtimeContext?.modulePhone || '') || null;
        const moduleName = String(runtimeContext?.moduleName || '').trim() || null;
        const transportMode = String(runtimeContext?.transportMode || this.getWaRuntime()?.activeTransport || '').trim().toLowerCase() || null;
        const channelType = String(runtimeContext?.channelType || '').trim().toLowerCase() || null;

        return {
            moduleId,
            phoneNumber,
            name: moduleName,
            transportMode,
            channelType
        };
    }

    normalizeHistoryLabels(labels = []) {
        if (!Array.isArray(labels)) return [];
        const seen = new Set();
        const normalized = [];
        for (const label of labels) {
            if (!label) continue;
            const id = String(label?.id || '').trim();
            const name = String(label?.name || '').trim();
            const key = `${id}:${name}`.toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            normalized.push({
                id: id || null,
                name: name || (id || ''),
                color: label?.color || null
            });
        }
        return normalized;
    }

    toHistoryChatSummary(entry = {}) {
        const chatId = String(entry?.chatId || '').trim();
        if (!chatId || !isVisibleChatId(chatId)) return null;

        const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
        const subtitle = String(entry?.subtitle || metadata?.senderPushname || '').trim() || null;
        const explicitPhone = coerceHumanPhone(entry?.phone || '');
        const idPhone = isLidIdentifier(chatId) ? null : coerceHumanPhone(chatId.split('@')[0] || '');
        const subtitlePhone = coerceHumanPhone(extractPhoneFromText(subtitle || '') || '');
        const phone = explicitPhone || subtitlePhone || idPhone || null;

        const displayName = String(entry?.displayName || metadata?.notifyName || '').trim();
        const fallbackName = displayName || subtitle || (phone ? `+${phone}` : 'Contacto');

        const labels = this.normalizeHistoryLabels(metadata?.labels || []);
        const profilePicUrl = String(metadata?.profilePicUrl || '').trim() || null;

        const lastMessageModuleId = String(entry?.lastMessageModuleId || metadata?.sentViaModuleId || '').trim().toLowerCase() || null;
        const lastMessageModuleName = String(entry?.lastMessageModuleName || metadata?.sentViaModuleName || '').trim() || null;
        const lastMessageModuleImageUrl = String(entry?.lastMessageModuleImageUrl || metadata?.sentViaModuleImageUrl || '').trim() || null;
        const lastMessageTransport = String(entry?.lastMessageTransport || metadata?.sentViaTransport || '').trim().toLowerCase() || null;
        const lastMessageChannelType = String(entry?.lastMessageChannelType || metadata?.sentViaChannelType || '').trim().toLowerCase() || null;
        const scopeModuleId = getSummaryModuleScopeId({ scopeModuleId: entry?.scopeModuleId, lastMessageModuleId, id: chatId }) || null;
        const scopedId = buildScopedChatId(chatId, scopeModuleId || '');

        return {
            id: scopedId || chatId,
            baseChatId: chatId,
            scopeModuleId,
            name: fallbackName,
            phone,
            subtitle,
            unreadCount: Number(entry?.unreadCount || 0) || 0,
            timestamp: Number(entry?.lastMessageAt || 0) || 0,
            lastMessage: String(entry?.lastMessageBody || metadata?.lastMessage || '').trim(),
            lastMessageFromMe: Boolean(entry?.lastMessageFromMe),
            ack: Number.isFinite(Number(entry?.lastMessageAck)) ? Number(entry.lastMessageAck) : 0,
            labels,
            profilePicUrl,
            isMyContact: Boolean(metadata?.isMyContact),
            lastMessageModuleId: scopeModuleId || lastMessageModuleId,
            lastMessageModuleName,
            lastMessageModuleImageUrl,
            lastMessageTransport,
            lastMessageChannelType,
            archived: Boolean(entry?.archived),
            pinned: Boolean(entry?.pinned)
        };
    }

    historySummaryMatches(summary = {}, { queryLower = '', queryDigits = '', filters = {} } = {}) {
        if (!summary || typeof summary !== 'object') return false;

        const name = String(summary?.name || '').toLowerCase();
        const subtitle = String(summary?.subtitle || '').toLowerCase();
        const lastMessage = String(summary?.lastMessage || '').toLowerCase();
        const phone = normalizePhoneDigits(summary?.phone || '');
        const baseSummaryId = String(summary?.baseChatId || parseScopedChatId(summary?.id || '').chatId || summary?.id || '');
        const idDigits = normalizePhoneDigits(String(baseSummaryId || '').split('@')[0] || '');

        if (queryDigits) {
            const byPhone = phone.includes(queryDigits);
            const byId = idDigits.includes(queryDigits);
            if (!byPhone && !byId) return false;
        } else if (queryLower) {
            const byText = name.includes(queryLower) || subtitle.includes(queryLower) || lastMessage.includes(queryLower);
            if (!byText) return false;
        }

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
        const labelTokens = normalizeFilterTokens(filters?.labelTokens);

        if (unreadOnly && Number(summary?.unreadCount || 0) <= 0) return false;
        if (contactMode === 'my' && !summary?.isMyContact) return false;
        if (contactMode === 'unknown' && summary?.isMyContact) return false;
        if (archivedMode === 'archived' && !summary?.archived) return false;
        if (archivedMode === 'active' && summary?.archived) return false;
        if (pinnedMode === 'pinned' && !summary?.pinned) return false;
        if (pinnedMode === 'unpinned' && summary?.pinned) return false;

        const labels = Array.isArray(summary?.labels) ? summary.labels : [];
        if (unlabeledOnly && labels.length > 0) return false;
        if (!unlabeledOnly && labelTokens.length > 0) {
            const labelTokenSet = toLabelTokenSet(labels);
            if (!matchesTokenSet(labelTokenSet, labelTokens)) return false;
        }

        return true;
    }

    async getHistoryChatsPage(tenantId, {
        offset = 0,
        limit = 80,
        query = '',
        filters = {},
        filterKey = '',
        scopeModuleId = ''
    } = {}) {
        const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
        const safeLimit = Number.isFinite(Number(limit)) ? Math.min(250, Math.max(20, Math.floor(Number(limit)))) : 80;
        const queryText = String(query || '').trim();
        const queryLower = queryText.toLowerCase();
        const queryDigits = normalizePhoneDigits(queryText);
        const normalizedScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');

        const allRows = [];
        let cursor = 0;
        const batchSize = 500;
        const maxRows = Math.max(1000, Number(process.env.HISTORY_FALLBACK_MAX_CHATS || 3000));

        while (allRows.length < maxRows) {
            const batch = await messageHistoryService.listChats(tenantId, { limit: batchSize, offset: cursor });
            if (!Array.isArray(batch) || batch.length === 0) break;
            allRows.push(...batch);
            cursor += batch.length;
            if (batch.length < batchSize) break;
        }

        const normalized = allRows
            .map((entry) => this.toHistoryChatSummary(entry))
            .filter(Boolean)
            .filter((summary) => {
                if (!normalizedScopeModuleId) return true;
                const summaryScopeId = normalizeScopedModuleId(
                    summary?.scopeModuleId
                    || summary?.lastMessageModuleId
                    || summary?.sentViaModuleId
                    || ''
                );
                return summaryScopeId === normalizedScopeModuleId;
            })
            .filter((summary) => this.historySummaryMatches(summary, {
                queryLower,
                queryDigits,
                filters
            }))
            .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)));

        const pageItems = normalized.slice(safeOffset, safeOffset + safeLimit);
        const nextOffset = safeOffset + pageItems.length;
        const total = normalized.length;
        const hasMore = nextOffset < total;

        return {
            items: pageItems,
            offset: safeOffset,
            limit: safeLimit,
            total,
            hasMore,
            nextOffset,
            query: queryText,
            filters,
            filterKey,
            scopeModuleId: normalizedScopeModuleId || null,
            source: 'history_fallback'
        };
    }

    toHistoryMessagePayload(row = {}, chatId = '') {
        const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        const senderId = String(row?.senderId || row?.authorId || '').trim() || null;
        const senderPhone = coerceHumanPhone(row?.senderPhone || (senderId ? senderId.split('@')[0] : '') || '') || null;
        const timestamp = Number(row?.timestampUnix || 0) || Math.floor(Date.now() / 1000);
        const type = String(row?.messageType || 'chat').trim() || 'chat';
        const fromMe = Boolean(row?.fromMe);

        return {
            id: String(row?.messageId || '').trim(),
            from: fromMe ? 'me@localhost' : (senderId || chatId),
            to: fromMe ? chatId : null,
            body: row?.body === null || row?.body === undefined ? '' : String(row.body),
            timestamp,
            fromMe,
            hasMedia: Boolean(row?.hasMedia),
            mediaData: null,
            mimetype: row?.mediaMime || null,
            filename: row?.mediaFilename || null,
            fileSizeBytes: Number.isFinite(Number(row?.mediaSizeBytes)) ? Number(row.mediaSizeBytes) : null,
            mediaUrl: String(metadata?.media?.url || '').trim() || null,
            mediaPath: String(metadata?.media?.path || '').trim() || null,
            type,
            author: row?.authorId || null,
            notifyName: String(metadata?.notifyName || '').trim() || null,
            senderPhone,
            senderId,
            senderPushname: String(metadata?.senderPushname || '').trim() || null,
            isGroupMessage: Boolean(metadata?.isGroupMessage || String(chatId || '').endsWith('@g.us')),
            sentByUserId: String(metadata?.sentByUserId || '').trim() || null,
            sentByName: String(metadata?.sentByName || '').trim() || null,
            sentByEmail: String(metadata?.sentByEmail || '').trim() || null,
            sentByRole: String(metadata?.sentByRole || '').trim() || null,
            sentViaModuleId: String(row?.waModuleId || metadata?.sentViaModuleId || '').trim() || null,
            sentViaPhoneNumber: String(row?.waPhoneNumber || '').trim() || null,
            sentViaModuleName: String(metadata?.sentViaModuleName || '').trim() || null,
            sentViaModuleImageUrl: String(metadata?.sentViaModuleImageUrl || '').trim() || null,
            sentViaTransport: String(metadata?.sentViaTransport || '').trim() || null,
            sentViaChannelType: String(metadata?.sentViaChannelType || '').trim() || null,
            ack: Number.isFinite(Number(row?.ack)) ? Number(row.ack) : 0,
            edited: Boolean(row?.edited),
            editedAt: Number(row?.editedAtUnix || 0) || null,
            canEdit: false,
            order: row?.orderPayload && typeof row.orderPayload === 'object' ? row.orderPayload : null,
            location: row?.locationPayload && typeof row.locationPayload === 'object' ? row.locationPayload : null,
            quotedMessage: row?.quotedMessageId ? { id: String(row.quotedMessageId), body: '', fromMe: false } : null
        };
    }

    async getHistoryChatHistory(tenantId, { chatId = '', limit = 60, scopeModuleId = '' } = {}) {
        const requestedChatId = String(chatId || '').trim();
        const safeLimit = Number.isFinite(Number(limit)) ? Math.min(300, Math.max(20, Math.floor(Number(limit)))) : 60;
        const normalizedScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');

        const filterRowsByScope = (rows = []) => {
            const source = Array.isArray(rows) ? rows : [];
            if (!normalizedScopeModuleId) return source;
            const withScope = source.filter((row) => normalizeScopedModuleId(row?.waModuleId || row?.metadata?.sentViaModuleId || '') === normalizedScopeModuleId);
            return withScope;
        };

        let resolvedChatId = requestedChatId;
        let rows = requestedChatId
            ? await messageHistoryService.listMessages(tenantId, { chatId: requestedChatId, limit: safeLimit })
            : [];
        rows = filterRowsByScope(rows);

        if ((!Array.isArray(rows) || rows.length === 0) && requestedChatId) {
            const digits = normalizePhoneDigits(requestedChatId.split('@')[0] || '');
            if (digits) {
                const candidates = await messageHistoryService.listChats(tenantId, { limit: 500, offset: 0 });
                const candidate = (Array.isArray(candidates) ? candidates : []).find((entry) => {
                    if (normalizedScopeModuleId) {
                        const candidateModuleId = normalizeScopedModuleId(entry?.lastMessageModuleId || entry?.metadata?.sentViaModuleId || '');
                        if (candidateModuleId && candidateModuleId !== normalizedScopeModuleId) return false;
                    }
                    const phoneDigits = normalizePhoneDigits(entry?.phone || '');
                    const idDigits = normalizePhoneDigits(String(entry?.chatId || '').split('@')[0] || '');
                    return (phoneDigits && (phoneDigits === digits || phoneDigits.endsWith(digits) || digits.endsWith(phoneDigits)))
                        || (idDigits && (idDigits === digits || idDigits.endsWith(digits) || digits.endsWith(idDigits)));
                });
                if (candidate?.chatId) {
                    resolvedChatId = String(candidate.chatId);
                    rows = await messageHistoryService.listMessages(tenantId, { chatId: resolvedChatId, limit: safeLimit });
                    rows = filterRowsByScope(rows);
                }
            }
        }

        const messages = (Array.isArray(rows) ? rows : [])
            .slice()
            .sort((a, b) => {
                const aTs = Number(a?.timestampUnix || 0);
                const bTs = Number(b?.timestampUnix || 0);
                if (aTs !== bTs) return aTs - bTs;
                return String(a?.messageId || '').localeCompare(String(b?.messageId || ''));
            })
            .map((row) => this.toHistoryMessagePayload(row, resolvedChatId || requestedChatId))
            .filter((msg) => Boolean(msg?.id));

        return {
            chatId: resolvedChatId || requestedChatId,
            requestedChatId,
            scopeModuleId: normalizedScopeModuleId || null,
            messages,
            source: 'history_fallback'
        };
    }
    ensureTransportReady(socket, {
        action = 'completar la operacion',
        errorEvent = 'error',
        requireReady = true
    } = {}) {
        const runtime = this.getWaRuntime();
        const activeTransport = String(runtime?.activeTransport || 'idle').toLowerCase();

        if (activeTransport === 'idle') {
            socket.emit(errorEvent, `Selecciona un modo de transporte antes de ${action}.`);
            socket.emit('wa_runtime', runtime);
            return false;
        }

        if (requireReady && !waClient.isReady) {
            const message = `Cloud API aun no esta lista para ${action}.`;
            socket.emit(errorEvent, message);
            socket.emit('wa_runtime', runtime);
            return false;
        }

        return true;
    }

    async emitMessageEditability(messageId, chatId) {
        const id = String(messageId || '').trim();
        if (!id) return;
        try {
            const canEdit = await waClient.canEditMessageById(id);
            this.emitToRuntimeContext('message_editability', {
                id,
                chatId: String(chatId || ''),
                canEdit
            });
        } catch (e) { }
    }

    scheduleEditabilityRefresh(messageId, chatId, delaysMs = [1200, 3200, 7000]) {
        const id = String(messageId || '').trim();
        if (!id) return;
        const normalizedChatId = String(chatId || '');
        (Array.isArray(delaysMs) ? delaysMs : []).forEach((delay) => {
            const waitMs = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
            setTimeout(() => {
                this.emitMessageEditability(id, normalizedChatId);
            }, waitMs);
        });
    }

    invalidateChatListCache() {
        this.chatListCache = { items: [], updatedAt: 0 };
    }

    async getSortedVisibleChats({ forceRefresh = false } = {}) {
        const cacheAge = Date.now() - (this.chatListCache?.updatedAt || 0);
        if (!forceRefresh && this.chatListCache.items.length > 0 && cacheAge <= this.chatListTtlMs) {
            return this.chatListCache.items;
        }

        let chats = [];
        try {
            chats = await waClient.getChats();
        } catch (error) {
            if (this.chatListCache.items.length > 0) {
                console.warn(`[WA] getChats failed; using cache (${this.chatListCache.items.length} chats).`, String(error?.message || error));
                return this.chatListCache.items;
            }
            throw error;
        }

        const sortedChats = [...chats]
            .filter((c) => isVisibleChatId(c?.id?._serialized))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        this.chatListCache = {
            items: sortedChats,
            updatedAt: Date.now()
        };
        return sortedChats;
    }
    getCachedChatMeta(chatId) {
        const key = String(chatId || '');
        const cached = this.chatMetaCache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.updatedAt > this.chatMetaTtlMs) return null;
        return cached;
    }

    async hydrateChatMeta(chat) {
        const chatId = chat?.id?._serialized;
        if (!chatId || !isVisibleChatId(chatId)) return { labels: [], profilePicUrl: null };

        const cached = this.getCachedChatMeta(chatId);
        if (cached) return { labels: Array.isArray(cached.labels) ? cached.labels : [], profilePicUrl: cached.profilePicUrl };

        let profilePicUrl = null;
        try { profilePicUrl = await resolveProfilePic(waClient.client, chatId); } catch (e) { }

        const normalized = {
            labels: [],
            profilePicUrl,
            updatedAt: Date.now()
        };
        this.chatMetaCache.set(chatId, normalized);
        return normalized;
    }

    async getSearchableContacts({ forceRefresh = false } = {}) {
        const cacheAge = Date.now() - (this.contactListCache?.updatedAt || 0);
        if (!forceRefresh && this.contactListCache.items.length > 0 && cacheAge <= this.contactListTtlMs) {
            return this.contactListCache.items;
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
                    profilePicUrl: null,
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

        this.contactListCache = {
            items: deduped,
            updatedAt: Date.now()
        };
        return deduped;
    }
    async getChatLabelTokenSet(chat, { tenantId = 'default', scopeModuleId = '' } = {}) {
        const chatId = String(chat?.id?._serialized || '');
        if (!chatId || !isVisibleChatId(chatId)) return new Set();

        try {
            const labels = await tenantLabelService.listChatLabels({
                tenantId,
                chatId,
                scopeModuleId: normalizeScopedModuleId(scopeModuleId || ''),
                includeInactive: false
            });
            return toLabelTokenSet(labels);
        } catch (error) {
            return new Set();
        }
    }

    async applyAdvancedChatFilters(chats = [], filters = {}, { tenantId = 'default', scopeModuleId = '' } = {}) {
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

        const included = new Array(chats.length).fill(false);
        const labelConcurrency = Math.max(2, Number(process.env.LABEL_FILTER_CONCURRENCY || 10));

        await runWithConcurrency(chats, labelConcurrency, async (chat, idx) => {
            const unreadCount = Number(chat?.unreadCount || 0);
            if (unreadOnly && unreadCount <= 0) return;

            const isMyContact = Boolean(chat?.contact?.isMyContact);
            if (contactMode === 'my' && !isMyContact) return;
            if (contactMode === 'unknown' && isMyContact) return;
            const isArchived = Boolean(chat?.archived);
            if (archivedMode === 'archived' && !isArchived) return;
            if (archivedMode === 'active' && isArchived) return;
            const isPinned = Boolean(chat?.pinned);
            if (pinnedMode === 'pinned' && !isPinned) return;
            if (pinnedMode === 'unpinned' && isPinned) return;

            if (needsLabelFiltering) {
                const labelTokenSet = await this.getChatLabelTokenSet(chat, { tenantId: safeTenantId, scopeModuleId: safeScopeModuleId });
                const hasAnyLabel = labelTokenSet.size > 0;
                if (unlabeledOnly && hasAnyLabel) return;
                if (!unlabeledOnly && selectedTokens.length > 0 && !matchesTokenSet(labelTokenSet, selectedTokens)) {
                    return;
                }
            }

            included[idx] = true;
        });

        return chats.filter((_, idx) => included[idx]);
    }
    async toChatSummary(chat, {
        includeHeavyMeta = false,
        scopeModuleId = '',
        scopeModuleName = null,
        scopeModuleImageUrl = null,
        scopeChannelType = null,
        scopeTransport = null,
        tenantId = 'default'
    } = {}) {
        const chatId = chat?.id?._serialized;
        if (!isVisibleChatId(chatId)) return null;

        const cached = this.getCachedChatMeta(chatId);
        let profilePicUrl = cached?.profilePicUrl || null;

        if (includeHeavyMeta || !cached) {
            const hydrated = await this.hydrateChatMeta(chat);
            profilePicUrl = hydrated.profilePicUrl;
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
        const subtitle = contact?.pushname || contact?.shortName || contact?.name || null;
        const normalizedScopeModuleId = normalizeScopedModuleId(scopeModuleId || '');
        const scopedSummaryId = buildScopedChatId(chatId, normalizedScopeModuleId);
        const resolvedTenantId = String(tenantId || 'default').trim() || 'default';
        let labels = [];
        try {
            labels = await tenantLabelService.listChatLabels({
                tenantId: resolvedTenantId,
                chatId,
                scopeModuleId: normalizedScopeModuleId,
                includeInactive: false
            });
        } catch (error) {
            labels = [];
        }

        return {
            id: scopedSummaryId || chatId,
            baseChatId: chatId,
            scopeModuleId: normalizedScopeModuleId || null,
            name: resolveChatDisplayName(effectiveChat),
            phone,
            subtitle,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            lastMessage: resolveLastMessagePreview(chat),
            lastMessageFromMe: chat.lastMessage ? chat.lastMessage.fromMe : false,
            ack: chat.lastMessage ? chat.lastMessage.ack : 0,
            labels,
            profilePicUrl,
            isMyContact: Boolean(contact?.isMyContact),
            archived: Boolean(chat?.archived),
            lastMessageModuleId: normalizedScopeModuleId || null,
            lastMessageModuleName: String(scopeModuleName || '').trim() || null,
            lastMessageModuleImageUrl: String(scopeModuleImageUrl || '').trim() || null,
            lastMessageTransport: String(scopeTransport || '').trim().toLowerCase() || null,
            lastMessageChannelType: String(scopeChannelType || '').trim().toLowerCase() || null
        };
    }

    setupSocketEvents() {

        this.io.on('connection', (socket) => {
            const tenantId = String(socket?.data?.tenantId || 'default');
            const authContext = socket?.data?.authContext || null;
            const normalizeSocketRole = (role = '') => {
                const raw = String(role || '').trim().toLowerCase();
                if (!raw) return 'seller';
                if (raw === 'super_admin' || raw === 'super-admin') return 'superadmin';
                return raw;
            };
            const userRole = normalizeSocketRole(authContext?.role);
            const roleWeight = { seller: 1, admin: 2, owner: 3, superadmin: 4 };
            const isActorSuperAdmin = Boolean(authContext?.isSuperAdmin) || userRole === 'superadmin';
            const effectiveRoleWeight = isActorSuperAdmin ? roleWeight.superadmin : (roleWeight[userRole] || 0);
            const requireRole = (allowedRoles = [], {
                errorEvent = 'permission_error',
                action = 'realizar esta accion'
            } = {}) => {
                if (!SOCKET_RBAC_ENABLED) return true;
                const allowSet = new Set((Array.isArray(allowedRoles) ? allowedRoles : [])
                    .map((role) => String(role || '').trim().toLowerCase())
                    .filter(Boolean));
                if (allowSet.size === 0) return true;
                if (!authContext) {
                    socket.emit(errorEvent, 'No autorizado para ' + action + '. Inicia sesion nuevamente.');
                    return false;
                }
                if (isActorSuperAdmin) return true;
                const minimumWeight = Math.min(...Array.from(allowSet)
                    .map((role) => roleWeight[role] || 999)
                    .filter((weight) => Number.isFinite(weight)));
                if (effectiveRoleWeight >= minimumWeight) return true;
                socket.emit(errorEvent, 'No tienes permisos para ' + action + '.');
                return false;
            };

            const auditSocketAction = async (action = '', {
                resourceType = 'socket',
                resourceId = null,
                payload = {}
            } = {}) => {
                try {
                    await auditLogService.writeAuditLog(tenantId, {
                        userId: authContext?.userId || null,
                        userEmail: authContext?.email || null,
                        role: userRole,
                        action: String(action || '').trim() || 'socket.action',
                        resourceType,
                        resourceId,
                        source: 'socket',
                        socketId: socket.id,
                        payload
                    });
                } catch (_) { }
            };

            const recordConversationEvent = async ({
                chatId = '',
                scopeModuleId = '',
                eventType = '',
                eventSource = 'socket',
                payload = {},
                customerId = null
            } = {}) => {
                try {
                    const cleanChatId = String(chatId || '').trim();
                    if (!cleanChatId) return;
                    await conversationOpsService.recordConversationEvent(tenantId, {
                        chatId: cleanChatId,
                        scopeModuleId: String(scopeModuleId || '').trim().toLowerCase(),
                        customerId: String(customerId || '').trim() || null,
                        actorUserId: authContext?.userId || null,
                        actorRole: userRole || null,
                        eventType: String(eventType || '').trim() || 'chat.event',
                        eventSource: String(eventSource || 'socket').trim() || 'socket',
                        payload: payload && typeof payload === 'object' ? payload : {}
                    });
                } catch (_) { }
            };
            const normalizeSocketModuleId = (value = '') => String(value || '').trim().toLowerCase();
            const normalizeSocketCatalogId = (value = '') => String(value || '').trim().toUpperCase();
            const normalizeSocketCatalogIdList = (value = []) => {
                const source = Array.isArray(value) ? value : [];
                const seen = new Set();
                const out = [];
                source.forEach((entry) => {
                    const clean = normalizeSocketCatalogId(entry);
                    if (!/^CAT-[A-Z0-9]{4,}$/.test(clean)) return;
                    if (seen.has(clean)) return;
                    seen.add(clean);
                    out.push(clean);
                });
                return out;
            };
            const getRequestedModuleIdFromSocket = () => normalizeSocketModuleId(
                socket?.handshake?.auth?.waModuleId
                || socket?.handshake?.auth?.moduleId
                || socket?.handshake?.query?.waModuleId
                || socket?.handshake?.query?.moduleId
                || ''
            );
            const getCatalogIdsFromModuleContext = (moduleContext = null) => {
                const moduleSettings = moduleContext?.metadata?.moduleSettings && typeof moduleContext.metadata.moduleSettings === 'object'
                    ? moduleContext.metadata.moduleSettings
                    : {};
                return normalizeSocketCatalogIdList(moduleSettings.catalogIds);
            };

            const getActiveCatalogScope = () => {
                const selectedModuleContext = socket?.data?.waModule || null;
                return {
                    tenantId,
                    moduleId: String(selectedModuleContext?.moduleId || '').trim() || null,
                    channelType: String(selectedModuleContext?.channelType || '').trim().toLowerCase() || null,
                    catalogIds: getCatalogIdsFromModuleContext(selectedModuleContext)
                };
            };

            const resolveCatalogSelection = async (scope = {}) => {
                const catalogs = await tenantCatalogService.ensureDefaultCatalog(tenantId).catch(() => []);
                const activeCatalogs = (Array.isArray(catalogs) ? catalogs : []).filter((entry) => entry?.isActive !== false);
                const activeCatalogIds = new Set(activeCatalogs.map((entry) => normalizeSocketCatalogId(entry?.catalogId)).filter(Boolean));

                let catalogIds = normalizeSocketCatalogIdList(scope.catalogIds);
                catalogIds = catalogIds.filter((catalogId) => activeCatalogIds.has(catalogId));

                const defaultCatalogId = normalizeSocketCatalogId(
                    activeCatalogs.find((entry) => entry?.isDefault)?.catalogId
                    || activeCatalogs[0]?.catalogId
                    || ''
                ) || null;

                if (!catalogIds.length) {
                    catalogIds = activeCatalogs
                        .map((entry) => normalizeSocketCatalogId(entry?.catalogId))
                        .filter(Boolean);
                }
                if (!catalogIds.length && defaultCatalogId) {
                    catalogIds = [defaultCatalogId];
                }
                const primaryCatalogId = defaultCatalogId && catalogIds.includes(defaultCatalogId)
                    ? defaultCatalogId
                    : (catalogIds[0] || defaultCatalogId || null);

                return {
                    catalogIds,
                    defaultCatalogId,
                    primaryCatalogId,
                    catalogs: activeCatalogs.filter((entry) => catalogIds.includes(normalizeSocketCatalogId(entry?.catalogId)))
                };
            };

            const loadScopedLocalCatalog = async (scope = {}, { requestedCatalogId = '' } = {}) => {
                const selection = await resolveCatalogSelection(scope);
                let catalogIds = [...selection.catalogIds];
                const requested = normalizeSocketCatalogId(requestedCatalogId);
                if (requested && catalogIds.includes(requested)) {
                    catalogIds = [requested];
                }

                const catalogNameMap = new Map();
                (Array.isArray(selection.catalogs) ? selection.catalogs : []).forEach((entry) => {
                    const cleanCatalogId = normalizeSocketCatalogId(entry?.catalogId);
                    if (!cleanCatalogId) return;
                    catalogNameMap.set(cleanCatalogId, String(entry?.name || cleanCatalogId).trim() || cleanCatalogId);
                });

                const merged = [];
                for (const catalogId of catalogIds) {
                    const includeLegacyEmptyCatalogId = Boolean(
                        catalogId
                        && selection.defaultCatalogId
                        && catalogId === selection.defaultCatalogId
                    );
                    const scopedItems = await loadCatalog({
                        tenantId: scope?.tenantId || tenantId,
                        moduleId: scope?.moduleId || null,
                        channelType: scope?.channelType || null,
                        catalogId,
                        includeLegacyEmptyCatalogId
                    });
                    (Array.isArray(scopedItems) ? scopedItems : []).forEach((item) => {
                        merged.push({
                            ...item,
                            catalogId: normalizeSocketCatalogId(item?.catalogId || catalogId || '') || null,
                            catalogName: catalogNameMap.get(catalogId) || catalogId || null
                        });
                    });
                }

                return {
                    items: merged,
                    selection: {
                        ...selection,
                        catalogIds,
                        catalogs: (Array.isArray(selection.catalogs) ? selection.catalogs : [])
                            .filter((entry) => catalogIds.includes(normalizeSocketCatalogId(entry?.catalogId))),
                        primaryCatalogId: catalogIds[0] || selection.primaryCatalogId || null
                    }
                };
            };

            const resolveCatalogScope = async ({ requestedModuleId = '', requestedCatalogId = '' } = {}) => {
                const normalizedRequested = normalizeSocketModuleId(requestedModuleId);
                if (!normalizedRequested) {
                    const activeScope = getActiveCatalogScope();
                    const activeSelection = await resolveCatalogSelection(activeScope);
                    const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
                    const nextCatalogIds = overrideCatalogId && activeSelection.catalogIds.includes(overrideCatalogId)
                        ? [overrideCatalogId]
                        : activeSelection.catalogIds;
                    return {
                        ...activeScope,
                        catalogIds: nextCatalogIds,
                        catalogId: nextCatalogIds[0] || activeSelection.primaryCatalogId || null
                    };
                }

                const activeModuleId = normalizeSocketModuleId(
                    socket?.data?.waModule?.moduleId
                    || socket?.data?.waModuleId
                    || ''
                );
                if (activeModuleId && activeModuleId === normalizedRequested) {
                    const activeScope = getActiveCatalogScope();
                    const activeSelection = await resolveCatalogSelection(activeScope);
                    const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
                    const nextCatalogIds = overrideCatalogId && activeSelection.catalogIds.includes(overrideCatalogId)
                        ? [overrideCatalogId]
                        : activeSelection.catalogIds;
                    return {
                        ...activeScope,
                        catalogIds: nextCatalogIds,
                        catalogId: nextCatalogIds[0] || activeSelection.primaryCatalogId || null
                    };
                }

                const userId = String(authContext?.userId || authContext?.id || '').trim();
                const allowedModules = await waModuleService.listModules(tenantId, {
                    includeInactive: false,
                    userId
                });
                const selected = (Array.isArray(allowedModules) ? allowedModules : [])
                    .find((entry) => normalizeSocketModuleId(entry?.moduleId) === normalizedRequested);
                if (!selected) {
                    throw new Error('No tienes acceso al modulo solicitado para catalogo.');
                }

                const baseScope = {
                    tenantId,
                    moduleId: String(selected?.moduleId || '').trim() || null,
                    channelType: String(selected?.channelType || '').trim().toLowerCase() || null,
                    catalogIds: getCatalogIdsFromModuleContext(selected)
                };
                const selection = await resolveCatalogSelection(baseScope);
                const overrideCatalogId = normalizeSocketCatalogId(requestedCatalogId);
                const nextCatalogIds = overrideCatalogId && selection.catalogIds.includes(overrideCatalogId)
                    ? [overrideCatalogId]
                    : selection.catalogIds;

                return {
                    ...baseScope,
                    catalogIds: nextCatalogIds,
                    catalogId: nextCatalogIds[0] || selection.primaryCatalogId || null
                };
            };
            const emitWaModuleContext = async ({ requestedModuleId = '' } = {}) => {
                const cleanRequested = normalizeSocketModuleId(requestedModuleId || getRequestedModuleIdFromSocket());
                const moduleContext = await resolveSocketModuleContext(tenantId, authContext, cleanRequested);
                const selected = moduleContext?.selected || null;
                const modules = Array.isArray(moduleContext?.modules) ? moduleContext.modules : [];

                socket.data = socket.data || {};
                socket.data.waModule = selected;
                socket.data.waModuleId = selected?.moduleId || '';
                socket.data.waModules = modules;

                const previousModuleRoom = String(socket?.data?.waModuleRoom || '').trim();
                const nextModuleId = selected?.moduleId || 'default';
                const nextModuleRoom = this.getTenantModuleRoom(tenantId, nextModuleId);
                if (previousModuleRoom && previousModuleRoom !== nextModuleRoom) {
                    socket.leave(previousModuleRoom);
                }
                if (nextModuleRoom && previousModuleRoom !== nextModuleRoom) {
                    socket.join(nextModuleRoom);
                }
                socket.data.waModuleRoom = nextModuleRoom;

                const payload = {
                    tenantId,
                    items: modules,
                    selected
                };
                socket.emit('wa_module_context', payload);
                return payload;
            };

            const applyCloudConfigForModule = async (selectedModule = null) => {
                if (!selectedModule || typeof selectedModule !== 'object') return null;
                if (String(selectedModule?.transportMode || '').trim().toLowerCase() !== 'cloud') return null;
                if (typeof waModuleService.resolveModuleCloudConfig !== 'function') return null;
                if (typeof waClient.setCloudRuntimeConfig !== 'function') return null;

                let moduleForRuntime = selectedModule;
                try {
                    const moduleId = String(selectedModule?.moduleId || '').trim();
                    if (moduleId && typeof waModuleService.getModuleRuntime === 'function') {
                        const runtimeModule = await waModuleService.getModuleRuntime(tenantId, moduleId);
                        if (runtimeModule) moduleForRuntime = runtimeModule;
                    }
                } catch (_) {
                    // fallback: usar modulo actual de contexto
                }

                const runtimeCloudConfig = waModuleService.resolveModuleCloudConfig(moduleForRuntime);
                waClient.setCloudRuntimeConfig(runtimeCloudConfig || {});
                return runtimeCloudConfig || null;
            };

            const ensureTransportForSelectedModule = async (selectedModule = null) => {
                const moduleTransport = String(selectedModule?.transportMode || '').trim().toLowerCase();
                if (moduleTransport !== 'cloud') return null;
                await applyCloudConfigForModule(selectedModule);

                const namespaceChanged = false;

                let runtime = this.getWaRuntime();
                const activeTransport = String(runtime?.activeTransport || 'idle').trim().toLowerCase();

                if (activeTransport === moduleTransport) {
                    if (namespaceChanged) {
                        try {
                            await waClient.initialize();
                        } catch (_) { }
                        runtime = this.getWaRuntime();
                    }

                    this.invalidateChatListCache();
                    this.contactListCache = { items: [], updatedAt: 0 };
                    this.emitWaCapabilities(socket);
                    socket.emit('transport_mode_set', runtime);

                    if (waClient.isReady) {
                        socket.emit('ready', { message: 'WhatsApp transport listo' });
                    }

                    this.setActiveRuntimeContext({
                        tenantId,
                        moduleId: selectedModule?.moduleId || 'default',
                        moduleName: selectedModule?.name || null,
                        modulePhone: selectedModule?.phoneNumber || null,
                        channelType: selectedModule?.channelType || null,
                        transportMode: moduleTransport,
                        webjsNamespace: null
                    });

                    return runtime;
                }

                const nextRuntime = await waClient.setTransportMode(moduleTransport);
                this.invalidateChatListCache();
                this.contactListCache = { items: [], updatedAt: 0 };
                this.emitWaCapabilities(socket);
                socket.emit('transport_mode_set', nextRuntime);
                await auditSocketAction('wa.transport_mode.autoset_by_module', {
                    resourceType: 'wa_module',
                    resourceId: selectedModule?.moduleId || null,
                    payload: { moduleTransport, runtime: nextRuntime, namespaceChanged }
                });

                if (waClient.isReady) {
                    socket.emit('ready', { message: 'WhatsApp transport listo' });
                }

                this.setActiveRuntimeContext({
                    tenantId,
                    moduleId: selectedModule?.moduleId || 'default',
                    moduleName: selectedModule?.name || null,
                    modulePhone: selectedModule?.phoneNumber || null,
                    channelType: selectedModule?.channelType || null,
                    transportMode: moduleTransport,
                    webjsNamespace: null
                });

                return nextRuntime;
            };

            console.log('Web client connected:', socket.id, '| tenant:', tenantId);
            socket.join(this.getTenantRoom(tenantId));
            socket.emit('tenant_context', {
                tenantId,
                user: authContext ? {
                    userId: authContext.userId,
                    name: authContext.name || null,
                    email: authContext.email,
                    role: authContext.role,
                    tenantId: authContext.tenantId
                } : null
            });

            if (!WA_REQUIRE_SELECTED_MODULE) {
                if (waClient.isReady) {
                    socket.emit('ready', { message: 'WhatsApp is ready' });
                }
            }
            this.emitWaCapabilities(socket);
            emitWaModuleContext({ requestedModuleId: getRequestedModuleIdFromSocket() })
                .then(async (payload) => {
                    const selectedModule = payload?.selected || null;
                    if (WA_REQUIRE_SELECTED_MODULE && !selectedModule?.moduleId) {
                        socket.emit('wa_module_error', 'No hay un numero WhatsApp habilitado para tu usuario/empresa.');
                        socket.emit('transport_mode_set', this.getWaRuntime());
                        return null;
                    }
                    return await ensureTransportForSelectedModule(selectedModule);
                })
                .catch(() => { });

            socket.on('get_wa_capabilities', () => {
                this.emitWaCapabilities(socket);
            });

            socket.on('get_wa_modules', async () => {
                try {
                    await emitWaModuleContext({ requestedModuleId: socket?.data?.waModuleId || getRequestedModuleIdFromSocket() });
                } catch (error) {
                    socket.emit('wa_module_error', String(error?.message || 'No se pudieron cargar los modulos WhatsApp.'));
                }
            });

            socket.on('set_wa_module', async ({ moduleId } = {}) => {
                if (!guardRateLimit(socket, 'set_wa_module')) return;
                try {
                    const requestedModuleId = normalizeSocketModuleId(moduleId);
                    if (!requestedModuleId) {
                        socket.emit('wa_module_error', 'Selecciona un modulo valido.');
                        return;
                    }

                    const userId = String(authContext?.userId || authContext?.id || '').trim();
                    const allowedModules = await waModuleService.listModules(tenantId, {
                        includeInactive: false,
                        userId
                    });
                    const selected = (Array.isArray(allowedModules) ? allowedModules : [])
                        .find((entry) => normalizeSocketModuleId(entry?.moduleId) === requestedModuleId);

                    if (!selected) {
                        socket.emit('wa_module_error', 'No tienes acceso a ese modulo WhatsApp.');
                        return;
                    }

                    await waModuleService.setSelectedModule(tenantId, selected.moduleId);
                    const contextPayload = await emitWaModuleContext({ requestedModuleId: selected.moduleId });
                    socket.emit('wa_module_selected', {
                        tenantId,
                        selected: contextPayload?.selected || selected
                    });
                    await ensureTransportForSelectedModule(contextPayload?.selected || selected);
                    await auditSocketAction('wa.module.selected', {
                        resourceType: 'wa_module',
                        resourceId: selected.moduleId,
                        payload: { transportMode: selected.transportMode || null }
                    });
                } catch (error) {
                    socket.emit('wa_module_error', String(error?.message || 'No se pudo seleccionar el modulo WhatsApp.'));
                }
            });
            socket.on('set_transport_mode', async ({ mode } = {}) => {
                try {
                    const nextMode = String(mode || '').trim().toLowerCase();
                    if (!nextMode) {
                        socket.emit('transport_mode_error', 'Debes seleccionar un modo de transporte.');
                        return;
                    }

                    if (nextMode !== 'cloud' && nextMode !== 'idle') {
                        socket.emit('transport_mode_error', 'Modo de transporte invalido. Solo Cloud API esta permitido.');
                        return;
                    }

                    const selectedModule = socket?.data?.waModule || null;
                    if (WA_REQUIRE_SELECTED_MODULE && !selectedModule?.moduleId) {
                        socket.emit('transport_mode_error', 'Primero selecciona un numero/modulo WhatsApp permitido.');
                        return;
                    }
                    const forcedMode = String(selectedModule?.transportMode || '').trim().toLowerCase();
                    const hasForcedMode = forcedMode === 'cloud';

                    if (hasForcedMode && nextMode !== forcedMode) {
                        socket.emit('transport_mode_error', 'Este modulo exige modo ' + forcedMode + '. Cambia de modulo para usar otro transporte.');
                        return;
                    }

                    if (!hasForcedMode) {
                        if (!requireRole(['owner', 'admin'], { errorEvent: 'transport_mode_error', action: 'cambiar el modo de transporte' })) return;
                    }

                    if (nextMode === 'cloud' && selectedModule?.moduleId && typeof waModuleService.resolveModuleCloudConfig === 'function' && typeof waClient.setCloudRuntimeConfig === 'function') {
                        await applyCloudConfigForModule(selectedModule);
                    }
                    const runtime = await waClient.setTransportMode(nextMode);
                    this.invalidateChatListCache();
                    this.contactListCache = { items: [], updatedAt: 0 };
                    this.emitWaCapabilities(socket);
                    socket.emit('transport_mode_set', runtime);

                    this.setActiveRuntimeContext({
                        tenantId,
                        moduleId: selectedModule?.moduleId || socket?.data?.waModuleId || 'default',
                        moduleName: selectedModule?.name || null,
                        modulePhone: selectedModule?.phoneNumber || null,
                        channelType: selectedModule?.channelType || null,
                        transportMode: runtime?.activeTransport || nextMode,
                        webjsNamespace: null
                    });
                    await auditSocketAction('wa.transport_mode.changed', {
                        resourceType: hasForcedMode ? 'wa_module' : 'wa_runtime',
                        resourceId: hasForcedMode ? (selectedModule?.moduleId || null) : (runtime?.activeTransport || nextMode),
                        payload: {
                            requestedMode: nextMode,
                            effectiveMode: runtime?.activeTransport || nextMode,
                            selectedModuleId: selectedModule?.moduleId || null,
                            runtime
                        }
                    });

                    if (waClient.isReady) {
                        socket.emit('ready', { message: 'WhatsApp transport listo' });
                    }
                } catch (error) {
                    socket.emit('transport_mode_error', String(error?.message || 'No se pudo cambiar el modo de transporte.'));
                    this.emitWaCapabilities(socket);
                }
            });

            // --- Chat info ---
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

                    if (!this.ensureTransportReady(socket, { action: 'cargar chats', errorEvent: 'transport_info' })) {
                        const fallbackPage = await this.getHistoryChatsPage(tenantId, {
                            offset,
                            limit,
                            query,
                            filters: activeFilters,
                            filterKey,
                            scopeModuleId: null
                        });
                        socket.emit('chats', fallbackPage);
                        return;
                    }


                    const hasActiveFilters = activeFilters.unreadOnly || activeFilters.unlabeledOnly || activeFilters.contactMode !== 'all' || activeFilters.archivedMode !== 'all' || activeFilters.pinnedMode !== 'all' || activeFilters.labelTokens.length > 0;
                    let sortedChats = await this.getSortedVisibleChats({ forceRefresh: reset || Boolean(query) || hasActiveFilters });
                    if (!queryLower && !reset && offset >= sortedChats.length) {
                        sortedChats = await this.getSortedVisibleChats({ forceRefresh: true });
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

                    filtered = await this.applyAdvancedChatFilters(filtered, activeFilters, { tenantId, scopeModuleId: activeScopeModuleId });

                    const page = filtered.slice(offset, offset + limit);
                    const scannedCount = page.length;
                    const formatted = await Promise.all(page.map((c) => this.toChatSummary(c, { includeHeavyMeta: false, ...summaryScopeOptions })));

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

                        const contacts = await this.getSearchableContacts();
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
                                const summary = await this.toChatSummary(chat, { includeHeavyMeta: true, ...summaryScopeOptions });
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
                                    profilePicUrl: null,
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
                        const fallbackPageIfEmpty = await this.getHistoryChatsPage(tenantId, {
                            offset,
                            limit,
                            query,
                            filters: activeFilters,
                            filterKey,
                            scopeModuleId: null
                        });
                        if (Array.isArray(fallbackPageIfEmpty?.items) && fallbackPageIfEmpty.items.length > 0) {
                            socket.emit('chats', fallbackPageIfEmpty);
                            return;
                        }
                    }

                    let historyTotalHint = 0;
                    const activeRuntime = this.getWaRuntime();
                    const activeTransportMode = String(activeRuntime?.activeTransport || 'idle').trim().toLowerCase();
                    if (activeTransportMode === 'cloud') {
                        try {
                            const cloudHistoryPage = await this.getHistoryChatsPage(tenantId, {
                                offset,
                                limit,
                                query,
                                filters: activeFilters,
                                filterKey,
                                scopeModuleId: null
                            });

                            historyTotalHint = Math.max(0, Number(cloudHistoryPage?.total || 0));
                            if (Array.isArray(cloudHistoryPage?.items) && cloudHistoryPage.items.length > 0) {
                                const mergedMap = new Map();
                                for (const item of cloudHistoryPage.items) {
                                    if (!item) continue;
                                    const key = buildChatIdentityKeyFromSummary(item);
                                    if (!mergedMap.has(key)) mergedMap.set(key, item);
                                }
                                for (const item of items) {
                                    if (!item) continue;
                                    const key = buildChatIdentityKeyFromSummary(item);
                                    if (!mergedMap.has(key)) {
                                        mergedMap.set(key, item);
                                    } else {
                                        mergedMap.set(key, pickPreferredSummary(mergedMap.get(key), item));
                                    }
                                }

                                const mergedItems = Array.from(mergedMap.values())
                                    .sort((a, b) => (Number(b?.timestamp || 0) - Number(a?.timestamp || 0)))
                                    .slice(0, limit);

                                if (mergedItems.length > 0) {
                                    items = mergedItems;
                                }
                            }
                        } catch (historyMergeError) {
                            console.warn('[History] cloud chat merge failed:', String(historyMergeError?.message || historyMergeError));
                        }
                    }

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

                    // Hydrate photos/labels progressively in background to keep first paint fast.
                    const pendingMetaChats = page
                        .filter((chat) => {
                            const chatId = String(chat?.id?._serialized || '');
                            if (!chatId || !isVisibleChatId(chatId)) return false;
                            const cached = this.getCachedChatMeta(chatId);
                            if (!cached) return true;
                            return !cached.profilePicUrl || !Array.isArray(cached.labels);
                        })
                        .slice(0, 24);

                    if (pendingMetaChats.length > 0) {
                        setImmediate(async () => {
                            for (const chat of pendingMetaChats) {
                                try {
                                    const summary = await this.toChatSummary(chat, { includeHeavyMeta: true, ...summaryScopeOptions });
                                    if (summary) socket.emit('chat_updated', summary);
                                } catch (_) { }
                            }
                        });
                    }
                } catch (e) {
                    console.error('Error fetching chats:', e);
                    try {
                        const fallbackPage = await this.getHistoryChatsPage(tenantId, {
                            offset: Number(payload?.offset ?? 0),
                            limit: Number(payload?.limit ?? 80),
                            query: String(payload?.query || '').trim(),
                            filters: payload?.filters || {},
                            filterKey: String(payload?.filterKey || '').trim(),
                            scopeModuleId: normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '') || null
                        });
                        socket.emit('chats', fallbackPage);
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

            socket.on('get_chat_history', async (chatId) => {
                try {
                    const requestedRawChatId = String(chatId || '').trim();
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedTarget = resolveScopedChatTarget(requestedRawChatId, selectedScopeModuleId);
                    const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                    const requestedScopedChatId = scopedTarget.scopedChatId
                        || buildScopedChatId(String(scopedTarget.baseChatId || requestedRawChatId || '').trim(), scopeModuleId || '');
                    let historyChatId = String(scopedTarget.baseChatId || requestedRawChatId || '').trim();

                    if (!historyChatId) {
                        socket.emit('chat_history', {
                            chatId: requestedScopedChatId || requestedRawChatId,
                            requestedChatId: requestedRawChatId,
                            baseChatId: null,
                            scopeModuleId: scopeModuleId || null,
                            messages: []
                        });
                        return;
                    }

                    if (!this.ensureTransportReady(socket, { action: 'abrir historial', errorEvent: 'transport_info' })) {
                        const fallbackHistory = await this.getHistoryChatHistory(tenantId, {
                            chatId: historyChatId,
                            limit: 60,
                            scopeModuleId
                        });
                        socket.emit('chat_history', {
                            ...fallbackHistory,
                            chatId: requestedScopedChatId || fallbackHistory?.chatId || historyChatId,
                            requestedChatId: requestedRawChatId,
                            baseChatId: fallbackHistory?.chatId || historyChatId,
                            scopeModuleId: scopeModuleId || null
                        });
                        return;
                    }

                    let messages = [];
                    try {
                        messages = await waClient.getMessages(historyChatId, 30);
                    } catch (directErr) {
                        const requestedDigits = normalizePhoneDigits(historyChatId.split('@')[0] || '');
                        if (requestedDigits) {
                            const visibleChats = await this.getSortedVisibleChats({ forceRefresh: true });
                            const byPhone = visibleChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === requestedDigits);
                            if (byPhone?.id?._serialized) {
                                historyChatId = byPhone.id._serialized;
                                messages = await waClient.getMessages(historyChatId, 30);
                            } else {
                                throw directErr;
                            }
                        } else {
                            throw directErr;
                        }
                    }

                    const visible = messages.filter((m) => !isStatusOrSystemMessage(m));
                    const outgoingIds = visible
                        .filter((m) => Boolean(m?.fromMe))
                        .map((m) => String(m?.id?._serialized || ''))
                        .filter(Boolean);
                    const editableMap = outgoingIds.length > 0
                        ? await waClient.getMessagesEditability(outgoingIds)
                        : {};

                    let historyMetaByMessageId = new Map();
                    try {
                        const persistedRows = await messageHistoryService.listMessages(tenantId, { chatId: historyChatId, limit: 500 });
                        historyMetaByMessageId = new Map(
                            (Array.isArray(persistedRows) ? persistedRows : [])
                                .map((row) => {
                                    const key = String(row?.messageId || '').trim();
                                    if (!key) return null;
                                    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
                                    return [key, {
                                        metadata,
                                        waModuleId: String(row?.waModuleId || '').trim().toLowerCase() || null,
                                        waPhoneNumber: String(row?.waPhoneNumber || '').trim() || null
                                    }];
                                })
                                .filter(Boolean)
                        );
                    } catch (_) { }

                    const formattedAll = await Promise.all(visible.map(async (m) => {
                        const senderMeta = await resolveMessageSenderMeta(m);
                        const fileMeta = extractMessageFileMeta(m);
                        const messageId = String(m?.id?._serialized || '').trim();
                        const persistedEntry = historyMetaByMessageId.get(messageId) || null;
                        const persistedMeta = persistedEntry?.metadata || null;
                        const persistedModuleId = normalizeScopedModuleId(persistedEntry?.waModuleId || persistedMeta?.sentViaModuleId || '');
                        const pendingAgentMeta = m?.fromMe ? getOutgoingAgentMeta(messageId) : null;
                        const agentMeta = mergeAgentMeta(persistedMeta, pendingAgentMeta);
                        const resolvedMessageModuleId = normalizeScopedModuleId(
                            agentMeta?.sentViaModuleId
                            || persistedModuleId
                            || (m?.fromMe ? scopeModuleId : '')
                            || ''
                        ) || null;

                        return ({
                        id: m.id._serialized,
                        from: m.from,
                        to: m.to,
                        body: m.body,
                        timestamp: m.timestamp,
                        fromMe: m.fromMe,
                        hasMedia: m.hasMedia,
                        mediaData: null,
                        mimetype: null,
                        filename: fileMeta.filename,
                        fileSizeBytes: fileMeta.fileSizeBytes,
                        mediaUrl: fileMeta.mediaUrl || null,
                        mediaPath: fileMeta.mediaPath || null,
                        type: m.type,
                        author: m?.author || m?._data?.author || null,
                        notifyName: senderMeta.notifyName,
                        senderPhone: senderMeta.senderPhone,
                        senderId: senderMeta.senderId,
                        senderPushname: senderMeta.senderPushname,
                        isGroupMessage: senderMeta.isGroupMessage,
                        ack: Number.isFinite(Number(m.ack)) ? Number(m.ack) : 0,
                        edited: Boolean(m?._data?.latestEditMsgKey || m?._data?.latestEditSenderTimestampMs || m?._data?.edited),
                        editedAt: Number(m?._data?.latestEditSenderTimestampMs || 0) > 0 ? Math.floor(Number(m._data.latestEditSenderTimestampMs) / 1000) : null,
                        canEdit: Boolean(editableMap[String(m?.id?._serialized || '')]),
                        order: extractOrderInfo(m),
                        location: extractLocationInfo(m),
                        quotedMessage: await extractQuotedMessageInfo(m),
                        ...(agentMeta || {}),
                        sentViaModuleId: resolvedMessageModuleId,
                        sentViaModuleName: String(agentMeta?.sentViaModuleName || '').trim() || null,
                        sentViaModuleImageUrl: String(agentMeta?.sentViaModuleImageUrl || '').trim() || null,
                        sentViaTransport: String(agentMeta?.sentViaTransport || '').trim().toLowerCase() || null,
                        sentViaPhoneNumber: String(agentMeta?.sentViaPhoneNumber || persistedEntry?.waPhoneNumber || '').trim() || null,
                        sentViaChannelType: String(agentMeta?.sentViaChannelType || '').trim().toLowerCase() || null
                        });
                    }));

                    const formatted = scopeModuleId
                        ? (() => {
                            const scopedOnly = formattedAll.filter((entry) => normalizeScopedModuleId(entry?.sentViaModuleId || '') === scopeModuleId);
                            return scopedOnly;
                        })()
                        : formattedAll;

                    if (formatted.length === 0) {
                        const historyFallbackIfEmpty = await this.getHistoryChatHistory(tenantId, {
                            chatId: historyChatId,
                            limit: 60,
                            scopeModuleId
                        });
                        if (Array.isArray(historyFallbackIfEmpty?.messages) && historyFallbackIfEmpty.messages.length > 0) {
                            socket.emit('chat_history', {
                                ...historyFallbackIfEmpty,
                                chatId: requestedScopedChatId || historyFallbackIfEmpty?.chatId || historyChatId,
                                requestedChatId: requestedRawChatId,
                                baseChatId: historyFallbackIfEmpty?.chatId || historyChatId,
                                scopeModuleId: scopeModuleId || null
                            });
                            return;
                        }
                    }

                    socket.emit('chat_history', {
                        chatId: requestedScopedChatId || historyChatId,
                        requestedChatId: requestedRawChatId,
                        baseChatId: historyChatId,
                        scopeModuleId: scopeModuleId || null,
                        messages: formatted
                    });

                    // Avoid blocking chat open while media is downloaded/cached.
                    visible
                        .filter((m) => m.hasMedia)
                        .slice(-12)
                        .forEach(async (m) => {
                            try {
                                const media = await mediaManager.processMessageMedia(m);
                                if (!media) return;
                                const mediaMeta = extractMessageFileMeta(m, media);
                                socket.emit('chat_media', {
                                    chatId: requestedScopedChatId || historyChatId,
                                    baseChatId: historyChatId,
                                    scopeModuleId: scopeModuleId || null,
                                    messageId: m.id._serialized,
                                    mediaData: media.data,
                                    mimetype: media.mimetype,
                                    filename: mediaMeta.filename,
                                    fileSizeBytes: mediaMeta.fileSizeBytes
                                });
                            } catch (mediaErr) { }
                        });
                } catch (e) {
                    console.error('Error fetching history:', e);
                    try {
                        const requestedRawChatId = String(chatId || '').trim();
                        const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                        const scopedTarget = resolveScopedChatTarget(requestedRawChatId, selectedScopeModuleId);
                        const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                        const fallbackHistory = await this.getHistoryChatHistory(tenantId, {
                            chatId: String(scopedTarget.baseChatId || requestedRawChatId || '').trim(),
                            limit: 60,
                            scopeModuleId
                        });
                        const requestedScopedChatId = scopedTarget.scopedChatId
                            || buildScopedChatId(String(scopedTarget.baseChatId || requestedRawChatId || '').trim(), scopeModuleId || '');
                        socket.emit('chat_history', {
                            ...fallbackHistory,
                            chatId: requestedScopedChatId || fallbackHistory?.chatId || scopedTarget.baseChatId || requestedRawChatId,
                            requestedChatId: requestedRawChatId,
                            baseChatId: fallbackHistory?.chatId || scopedTarget.baseChatId || requestedRawChatId,
                            scopeModuleId: scopeModuleId || null
                        });
                    } catch (historyErr) {
                        socket.emit('chat_history', {
                            chatId: String(chatId || ''),
                            requestedChatId: String(chatId || ''),
                            baseChatId: String(resolveScopedChatTarget(String(chatId || ''), '').baseChatId || chatId || ''),
                            scopeModuleId: normalizeScopedModuleId(resolveScopedChatTarget(String(chatId || ''), '').moduleId || '') || null,
                            messages: [],
                            source: 'history_fallback'
                        });
                    }
                }
            });

            socket.on('start_new_chat', async ({ phone, firstMessage, moduleId } = {}) => {
                try {
                    if (!this.ensureTransportReady(socket, { action: 'abrir un chat nuevo', errorEvent: 'start_new_chat_error' })) {
                        return;
                    }

                    const requestedModuleId = normalizeSocketModuleId(moduleId || '');
                    let activeModuleContext = socket?.data?.waModule || null;
                    if (requestedModuleId) {
                        const currentModuleId = normalizeSocketModuleId(activeModuleContext?.moduleId || socket?.data?.waModuleId || '');
                        if (!currentModuleId || currentModuleId !== requestedModuleId) {
                            const moduleContextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId);
                            activeModuleContext = moduleContextPayload?.selected || null;
                            if (!activeModuleContext?.moduleId || normalizeSocketModuleId(activeModuleContext.moduleId) !== requestedModuleId) {
                                socket.emit('start_new_chat_error', 'No tienes acceso al modulo solicitado para abrir este chat.');
                                return;
                            }
                            await ensureTransportForSelectedModule(activeModuleContext);
                        }
                    }

                    const activeScopeModuleId = normalizeScopedModuleId(activeModuleContext?.moduleId || socket?.data?.waModuleId || '');
                    const scopeSummaryOptions = {
                        scopeModuleId: activeScopeModuleId,
                        scopeModuleName: String(activeModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(activeModuleContext?.imageUrl || activeModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(activeModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(activeModuleContext?.transportMode || '').trim().toLowerCase() || null
                    };

                    const clean = normalizePhoneDigits(phone);
                    if (!clean) {
                        socket.emit('start_new_chat_error', 'Numero invalido.');
                        return;
                    }

                    const runtime = this.getWaRuntime();
                    const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();

                    let registeredUser = null;
                    if (activeTransport === 'cloud') {
                        try {
                            if (waClient?.client && typeof waClient.client.getNumberId === 'function') {
                                const numberId = await waClient.client.getNumberId(clean);
                                const byUser = coerceHumanPhone(numberId?.user || '');
                                const bySerialized = coerceHumanPhone(String(numberId?._serialized || '').split('@')[0] || '');
                                registeredUser = byUser || bySerialized || null;
                            }
                        } catch (_) { }

                        if (!registeredUser) {
                            const candidates = buildPhoneCandidates(clean);
                            registeredUser = coerceHumanPhone(candidates[0] || clean);
                        }
                    } else {
                        registeredUser = await resolveRegisteredNumber(waClient.client, clean);
                        if (!registeredUser) {
                            socket.emit('start_new_chat_error', 'El numero no esta registrado en WhatsApp.');
                            return;
                        }
                    }

                    if (!registeredUser) {
                        socket.emit('start_new_chat_error', 'Numero invalido para abrir chat.');
                        return;
                    }

                    const normalizedRegistered = normalizePhoneDigits(registeredUser);
                    const directChatId = String(registeredUser) + '@c.us';
                    let canonicalChatId = directChatId;

                    try {
                        const visibleChats = await this.getSortedVisibleChats({ forceRefresh: true });
                        const existingChat = visibleChats.find((c) => normalizePhoneDigits(extractPhoneFromChat(c) || '') === normalizedRegistered);
                        if (existingChat?.id?._serialized) {
                            canonicalChatId = existingChat.id._serialized;
                        }
                    } catch (e) { }

                    if (firstMessage && String(firstMessage).trim()) {
                        const firstText = String(firstMessage).trim();
                        const firstSentMessage = await waClient.sendMessage(directChatId, firstText);
                        const firstAgentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, activeModuleContext));
                        const firstSentMessageId = getSerializedMessageId(firstSentMessage);
                        if (firstSentMessageId && firstAgentMeta) {
                            rememberOutgoingAgentMeta(firstSentMessageId, firstAgentMeta);
                        }
                        await emitRealtimeOutgoingMessage({
                            sentMessage: firstSentMessage,
                            fallbackChatId: canonicalChatId || directChatId,
                            fallbackBody: firstText,
                            quotedMessageId: '',
                            moduleContext: activeModuleContext,
                            agentMeta: firstAgentMeta,
                            mediaPayload: null
                        });

                        await recordConversationEvent({
                            chatId: canonicalChatId || directChatId,
                            scopeModuleId: activeScopeModuleId || '',
                            eventType: 'chat.message.outgoing.text',
                            eventSource: 'socket',
                            payload: {
                                messageId: firstSentMessageId || null,
                                quotedMessageId: null,
                                length: firstText.length,
                                hasQuote: false
                            }
                        });
                    }

                    try {
                        const chat = await waClient.client.getChatById(canonicalChatId);
                        const summary = await this.toChatSummary(chat, { includeHeavyMeta: true, ...scopeSummaryOptions });
                        if (summary) {
                            canonicalChatId = String(summary.baseChatId || parseScopedChatId(summary.id).chatId || canonicalChatId || '').trim() || canonicalChatId;
                            this.io.emit('chat_updated', summary);
                        }
                    } catch (e) {
                        try {
                            const fallbackChat = await waClient.client.getChatById(directChatId);
                            const fallbackSummary = await this.toChatSummary(fallbackChat, { includeHeavyMeta: true, ...scopeSummaryOptions });
                            if (fallbackSummary) {
                                canonicalChatId = String(fallbackSummary.baseChatId || parseScopedChatId(fallbackSummary.id).chatId || directChatId || '').trim() || directChatId;
                                this.io.emit('chat_updated', fallbackSummary);
                            }
                        } catch (fallbackErr) { }
                    }

                    const scopedChatId = buildScopedChatId(canonicalChatId, activeScopeModuleId || '');
                    socket.emit('chat_opened', {
                        chatId: scopedChatId || canonicalChatId,
                        baseChatId: canonicalChatId,
                        moduleId: activeScopeModuleId || null,
                        phone: registeredUser
                    });
                } catch (e) {
                    console.error('start_new_chat error:', e.message);
                    socket.emit('start_new_chat_error', 'No se pudo iniciar el chat.');
                }
            });

            socket.on('set_chat_state', async ({ chatId, pinned, archived }) => {
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'error', action: 'actualizar estado de chat' })) return;
                try {
                    const requestedChatId = String(chatId || '').trim();
                    if (!requestedChatId) {
                        socket.emit('error', 'Chat invalido para actualizar estado.');
                        return;
                    }

                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedTarget = resolveScopedChatTarget(requestedChatId, selectedScopeModuleId);
                    const safeChatId = String(scopedTarget.baseChatId || '').trim();
                    const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                    const scopedChatId = scopedTarget.scopedChatId || buildScopedChatId(safeChatId, scopeModuleId || '');
                    if (!safeChatId) {
                        socket.emit('error', 'Chat invalido para actualizar estado.');
                        return;
                    }

                    const hasPinned = typeof pinned === 'boolean';
                    const hasArchived = typeof archived === 'boolean';
                    if (!hasPinned && !hasArchived) {
                        socket.emit('error', 'No se detectaron cambios para el chat.');
                        return;
                    }

                    const patch = {};
                    if (hasPinned) patch.pinned = Boolean(pinned);
                    if (hasArchived) patch.archived = Boolean(archived);

                    const persisted = await messageHistoryService.updateChatState(tenantId, {
                        chatId: safeChatId,
                        pinned: hasPinned ? patch.pinned : undefined,
                        archived: hasArchived ? patch.archived : undefined
                    });

                    const selectedModuleContext = socket?.data?.waModule || null;
                    const summaryScopeOptions = {
                        tenantId,
                        scopeModuleId: scopeModuleId || '',
                        scopeModuleName: String(selectedModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(selectedModuleContext?.imageUrl || selectedModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(selectedModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(selectedModuleContext?.transportMode || '').trim().toLowerCase() || null
                    };

                    let summary = null;
                    try {
                        const visibleChats = await this.getSortedVisibleChats({ forceRefresh: false });
                        const waChat = (visibleChats || []).find((entry) => String(entry?.id?._serialized || '').trim() === safeChatId);
                        if (waChat) {
                            summary = await this.toChatSummary(waChat, { includeHeavyMeta: false, ...summaryScopeOptions });
                        }
                    } catch (_) { }

                    if (!summary) {
                        try {
                            const rows = await messageHistoryService.listChats(tenantId, { limit: 5000, offset: 0 });
                            const row = Array.isArray(rows)
                                ? rows.find((entry) => String(entry?.chatId || '').trim() === safeChatId)
                                : null;
                            if (row) {
                                summary = this.toHistoryChatSummary({ ...row, scopeModuleId: scopeModuleId || row?.scopeModuleId || null });
                            }
                        } catch (_) { }
                    }

                    if (summary) {
                        const nextSummary = {
                            ...summary,
                            id: scopedChatId || summary.id || safeChatId,
                            baseChatId: safeChatId,
                            scopeModuleId: scopeModuleId || summary.scopeModuleId || null,
                            archived: hasArchived ? patch.archived : Boolean(summary.archived),
                            pinned: hasPinned ? patch.pinned : Boolean(summary.pinned)
                        };
                        this.emitToTenant(tenantId, 'chat_updated', nextSummary);
                    }

                    socket.emit('chat_state_saved', {
                        ok: true,
                        chatId: scopedChatId || safeChatId,
                        baseChatId: safeChatId,
                        scopeModuleId: scopeModuleId || null,
                        pinned: hasPinned ? patch.pinned : Boolean(persisted?.pinned),
                        archived: hasArchived ? patch.archived : Boolean(persisted?.archived)
                    });

                    await auditSocketAction('chat.state.updated', {
                        resourceType: 'chat',
                        resourceId: safeChatId,
                        payload: {
                            pinned: hasPinned ? patch.pinned : undefined,
                            archived: hasArchived ? patch.archived : undefined
                        }
                    });

                    await recordConversationEvent({
                        chatId: safeChatId,
                        scopeModuleId,
                        eventType: 'chat.state.updated',
                        eventSource: 'socket',
                        payload: {
                            pinned: hasPinned ? patch.pinned : undefined,
                            archived: hasArchived ? patch.archived : undefined
                        }
                    });
                } catch (e) {
                    console.error('set_chat_state error:', e.message);
                    socket.emit('error', String(e?.message || 'No se pudo actualizar el estado del chat.'));
                }
            });
            socket.on('set_chat_labels', async ({ chatId, labelIds }) => {
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'chat_labels_error', action: 'gestionar etiquetas' })) return;
                try {
                    const requestedChatId = String(chatId || '').trim();
                    if (!requestedChatId) {
                        socket.emit('chat_labels_error', 'Chat invalido para etiquetar.');
                        return;
                    }

                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedTarget = resolveScopedChatTarget(requestedChatId, selectedScopeModuleId);
                    const safeChatId = String(scopedTarget.baseChatId || '').trim();
                    const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                    const scopedChatId = scopedTarget.scopedChatId || buildScopedChatId(safeChatId, scopeModuleId || '');
                    if (!safeChatId) {
                        socket.emit('chat_labels_error', 'Chat invalido para etiquetar.');
                        return;
                    }

                    const ids = Array.isArray(labelIds)
                        ? labelIds.map((value) => tenantLabelService.normalizeLabelId(value)).filter(Boolean)
                        : [];

                    const updatedLabels = await tenantLabelService.setChatLabels({
                        tenantId,
                        chatId: safeChatId,
                        scopeModuleId,
                        labelIds: ids
                    });

                    const payload = {
                        chatId: scopedChatId || safeChatId,
                        baseChatId: safeChatId,
                        scopeModuleId: scopeModuleId || null,
                        labels: Array.isArray(updatedLabels) ? updatedLabels : []
                    };

                    this.emitToTenant(tenantId, 'chat_labels_updated', payload);
                    socket.emit('chat_labels_saved', {
                        chatId: payload.chatId || safeChatId,
                        baseChatId: safeChatId,
                        scopeModuleId: payload.scopeModuleId || null,
                        ok: true
                    });
                    await auditSocketAction('chat.labels.updated', {
                        resourceType: 'chat',
                        resourceId: safeChatId,
                        payload: { labelIds: ids, labels: payload.labels }
                    });

                    await recordConversationEvent({
                        chatId: safeChatId,
                        scopeModuleId,
                        eventType: 'chat.labels.updated',
                        eventSource: 'socket',
                        payload: {
                            labelIds: ids,
                            labels: payload.labels
                        }
                    });
                } catch (e) {
                    console.error('set_chat_labels error:', e.message);
                    socket.emit('chat_labels_error', String(e?.message || 'No se pudieron actualizar las etiquetas del chat.'));
                }
            });

            socket.on('create_label', async ({ name, color = '', description = '' }) => {
                if (!requireRole(['owner', 'admin'], { errorEvent: 'chat_labels_error', action: 'crear etiquetas' })) return;
                try {
                    const cleanName = String(name || '').trim();
                    if (!cleanName) {
                        socket.emit('chat_labels_error', 'Nombre de etiqueta invalido.');
                        return;
                    }
                    const item = await tenantLabelService.saveLabel({
                        name: cleanName,
                        color: String(color || '').trim(),
                        description: String(description || '').trim(),
                        isActive: true
                    }, { tenantId });
                    socket.emit('chat_label_created', { ok: true, item });
                    const labels = await tenantLabelService.listLabels({ tenantId, includeInactive: false });
                    this.emitToTenant(tenantId, 'business_data_labels', {
                        labels,
                        source: 'tenant_db'
                    });
                } catch (e) {
                    console.error('create_label error:', e.message);
                    socket.emit('chat_labels_error', String(e?.message || 'No se pudo crear la etiqueta.'));
                }
            });
            socket.on('get_quick_replies', async (payload = {}) => {
                try {
                    const quickRepliesEnabled = await this.isFeatureEnabledForTenant(tenantId, 'quickReplies');
                    if (!quickRepliesEnabled) {
                        socket.emit('quick_replies', { items: [], source: 'disabled', enabled: false, writable: false });
                        return;
                    }

                    const payloadModuleId = String(payload?.moduleId || '').trim().toLowerCase();
                    const selectedModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const moduleId = payloadModuleId || selectedModuleId || '';
                    const items = await listQuickReplies({ tenantId, moduleId });
                    socket.emit('quick_replies', {
                        items: Array.isArray(items) ? items : [],
                        source: 'db',
                        enabled: true,
                        writable: false
                    });
                } catch (_) {
                    socket.emit('quick_reply_error', 'No se pudieron cargar las respuestas rapidas.');
                }
            });

            socket.on('add_quick_reply', async () => {
                socket.emit('quick_reply_error', 'Gestiona respuestas rapidas desde Panel SaaS.');
            });

            socket.on('update_quick_reply', async () => {
                socket.emit('quick_reply_error', 'Gestiona respuestas rapidas desde Panel SaaS.');
            });

            socket.on('delete_quick_reply', async () => {
                socket.emit('quick_reply_error', 'Gestiona respuestas rapidas desde Panel SaaS.');
            });

            socket.on('send_quick_reply', async (payload = {}) => {
                if (!guardRateLimit(socket, 'send_quick_reply')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar respuestas rapidas', errorEvent: 'error' })) return;
                try {
                    const quickRepliesEnabled = await this.isFeatureEnabledForTenant(tenantId, 'quickReplies');
                    if (!quickRepliesEnabled) {
                        socket.emit('error', 'Respuestas rapidas deshabilitadas para esta empresa o plan.');
                        return;
                    }

                    const quoted = String(payload?.quotedMessageId || '').trim();
                    const target = await resolveScopedSendTarget({
                        rawChatId: payload?.to,
                        rawPhone: payload?.toPhone,
                        errorEvent: 'error',
                        action: 'enviar respuestas rapidas'
                    });
                    if (!target?.ok) return;

                    const moduleId = normalizeScopedModuleId(target.scopeModuleId || socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const quickReplyId = String(payload?.quickReplyId || payload?.id || '').trim();

                    let replyPayload = null;
                    if (quickReplyId) {
                        const scopedReplies = await listQuickReplies({ tenantId, moduleId });
                        replyPayload = (Array.isArray(scopedReplies) ? scopedReplies : [])
                            .find((entry) => String(entry?.id || '').trim() === quickReplyId) || null;
                    }

                    if (!replyPayload && payload?.quickReply && typeof payload.quickReply === 'object') {
                        replyPayload = payload.quickReply;
                    }

                    if (!replyPayload) {
                        socket.emit('error', 'Respuesta rapida no encontrada para este modulo.');
                        return;
                    }

                    const bodyText = String(replyPayload?.text || replyPayload?.bodyText || replyPayload?.body || '').trim();
                    const rawMediaAssets = Array.isArray(replyPayload?.mediaAssets) ? replyPayload.mediaAssets : [];
                    const mediaAssets = rawMediaAssets
                        .map((entry) => ({
                            url: String(entry?.url || entry?.mediaUrl || '').trim(),
                            mimeType: String(entry?.mimeType || entry?.mediaMimeType || '').trim().toLowerCase() || '',
                            fileName: String(entry?.fileName || entry?.mediaFileName || entry?.filename || '').trim() || '',
                            sizeBytes: Number(entry?.sizeBytes ?? entry?.mediaSizeBytes) || null
                        }))
                        .filter((entry) => Boolean(entry.url));
                    const legacyMediaUrl = String(replyPayload?.mediaUrl || '').trim();
                    const legacyMediaMimeType = String(replyPayload?.mediaMimeType || '').trim().toLowerCase();
                    const legacyMediaFileName = String(replyPayload?.mediaFileName || replyPayload?.filename || '').trim();
                    if (legacyMediaUrl && !mediaAssets.some((entry) => entry.url === legacyMediaUrl)) {
                        mediaAssets.push({
                            url: legacyMediaUrl,
                            mimeType: legacyMediaMimeType,
                            fileName: legacyMediaFileName,
                            sizeBytes: null
                        });
                    }

                    if (!bodyText && mediaAssets.length === 0) {
                        socket.emit('error', 'La respuesta rapida no tiene contenido para enviar.');
                        return;
                    }

                    const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));

                    let sentMessage = null;
                    let mediaPayload = null;

                    if (mediaAssets.length > 0) {
                        const sentMediaPayloads = [];
                        for (let index = 0; index < mediaAssets.length; index += 1) {
                            const mediaEntry = mediaAssets[index] || null;
                            if (!mediaEntry?.url) continue;

                            const fetchedMedia = await fetchQuickReplyMedia(mediaEntry.url, {
                                maxBytes: QUICK_REPLY_MEDIA_MAX_BYTES,
                                timeoutMs: QUICK_REPLY_MEDIA_TIMEOUT_MS,
                                mimeHint: mediaEntry.mimeType || legacyMediaMimeType,
                                fileNameHint: mediaEntry.fileName || legacyMediaFileName
                            });

                            if (!fetchedMedia || !fetchedMedia.mediaData) {
                                socket.emit('error', 'No se pudo procesar el adjunto de la respuesta rapida.');
                                return;
                            }

                            const fileNameBase = mediaEntry.fileName || legacyMediaFileName || path.basename(String(fetchedMedia.filename || '').trim() || '') || ('adjunto-' + Date.now());
                            const safeFileName = String(fileNameBase || '').trim() || ('adjunto-' + Date.now());
                            const captionText = index === 0 ? bodyText : '';
                            const quotedMessageId = index === 0 ? (quoted || null) : null;
                            const sentAssetMessage = await waClient.sendMedia(
                                target.targetChatId,
                                fetchedMedia.mediaData,
                                fetchedMedia.mimetype || mediaEntry.mimeType || legacyMediaMimeType || 'application/octet-stream',
                                safeFileName,
                                captionText,
                                false,
                                quotedMessageId
                            );

                            if (!sentMessage) sentMessage = sentAssetMessage;
                            const currentMediaPayload = {
                                mimetype: fetchedMedia.mimetype || mediaEntry.mimeType || legacyMediaMimeType || null,
                                filename: safeFileName,
                                fileSizeBytes: Number(fetchedMedia?.fileSizeBytes || mediaEntry?.sizeBytes || 0) || null,
                                mediaUrl: String(fetchedMedia?.publicUrl || fetchedMedia?.sourceUrl || mediaEntry.url || '').trim() || null,
                                mediaPath: String(fetchedMedia?.relativePath || '').trim() || null
                            };
                            sentMediaPayloads.push(currentMediaPayload);

                            const sentAssetMessageId = getSerializedMessageId(sentAssetMessage);
                            if (sentAssetMessageId && agentMeta) rememberOutgoingAgentMeta(sentAssetMessageId, agentMeta);

                            await emitRealtimeOutgoingMessage({
                                sentMessage: sentAssetMessage,
                                fallbackChatId: target.targetChatId,
                                fallbackBody: captionText,
                                quotedMessageId: quotedMessageId || '',
                                moduleContext,
                                agentMeta,
                                mediaPayload: currentMediaPayload
                            });
                        }
                        if (sentMediaPayloads.length > 0) {
                            mediaPayload = {
                                ...sentMediaPayloads[0],
                                mediaAssets: sentMediaPayloads
                            };
                        }
                    } else {
                        if (quoted) {
                            sentMessage = await waClient.sendMessage(target.targetChatId, bodyText, { quotedMessageId: quoted });
                        } else {
                            sentMessage = await waClient.sendMessage(target.targetChatId, bodyText);
                        }
                        const sentMessageId = getSerializedMessageId(sentMessage);
                        if (sentMessageId && agentMeta) rememberOutgoingAgentMeta(sentMessageId, agentMeta);

                        await emitRealtimeOutgoingMessage({
                            sentMessage,
                            fallbackChatId: target.targetChatId,
                            fallbackBody: bodyText,
                            quotedMessageId: quoted,
                            moduleContext,
                            agentMeta,
                            mediaPayload
                        });
                    }

                    socket.emit('quick_reply_sent', {
                        ok: true,
                        id: String(replyPayload?.id || quickReplyId || '').trim() || null,
                        label: String(replyPayload?.label || '').trim() || null,
                        to: target.scopedChatId || target.targetChatId,
                        baseChatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId || null
                    });
                } catch (error) {
                    socket.emit('error', String(error?.message || 'No se pudo enviar la respuesta rapida.'));
                }
            });

            // --- Messaging ---
            const emitRealtimeOutgoingMessage = async ({
                sentMessage = null,
                fallbackChatId = '',
                fallbackBody = '',
                quotedMessageId = '',
                moduleContext = null,
                agentMeta = null,
                mediaPayload = null
            } = {}) => {
                const safeSentMessage = sentMessage && typeof sentMessage === 'object' ? sentMessage : {};
                const serializedMessageId = getSerializedMessageId(safeSentMessage);
                const messageId = serializedMessageId || ('local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9));
                const targetChatId = String(safeSentMessage?.to || fallbackChatId || '').trim();
                if (!targetChatId || !isVisibleChatId(targetChatId)) return;

                const timestamp = Number(safeSentMessage?.timestamp || 0) || Math.floor(Date.now() / 1000);
                const ack = Number.isFinite(Number(safeSentMessage?.ack)) ? Number(safeSentMessage.ack) : 0;
                const quotedId = String(quotedMessageId || '').trim();
                const mediaData = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.data || '').trim() : '';
                const mediaMimetype = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mimetype || '').trim() : '';
                const mediaFilename = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.filename || '').trim() : '';
                const mediaUrl = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mediaUrl || mediaPayload?.url || '').trim() : '';
                const mediaPath = mediaPayload && typeof mediaPayload === 'object' ? String(mediaPayload?.mediaPath || mediaPayload?.path || '').trim() : '';
                const mediaSizeBytesRaw = mediaPayload && typeof mediaPayload === 'object' ? Number(mediaPayload?.fileSizeBytes) : null;
                const mediaSizeBytes = Number.isFinite(mediaSizeBytesRaw) ? mediaSizeBytesRaw : null;
                const moduleAttributionMeta = buildModuleAttributionMeta(moduleContext);
                const moduleScopeId = normalizeScopedModuleId(
                    moduleContext?.moduleId
                    || moduleAttributionMeta?.sentViaModuleId
                    || agentMeta?.sentViaModuleId
                    || ''
                );
                const scopedTargetChatId = buildScopedChatId(targetChatId, moduleScopeId || '');

                const payload = {
                    id: messageId,
                    from: String(safeSentMessage?.from || '').trim() || null,
                    to: scopedTargetChatId || targetChatId,
                    chatId: scopedTargetChatId || targetChatId,
                    baseChatId: targetChatId,
                    scopeModuleId: moduleScopeId || null,
                    body: String(safeSentMessage?.body ?? fallbackBody ?? ''),
                    timestamp,
                    fromMe: true,
                    hasMedia: Boolean(mediaData || mediaUrl || safeSentMessage?.hasMedia),
                    mediaData: mediaData || null,
                    mimetype: mediaMimetype || null,
                    filename: mediaFilename || null,
                    mediaUrl: mediaUrl || null,
                    mediaPath: mediaPath || null,
                    fileSizeBytes: mediaSizeBytes,
                    ack,
                    type: String(safeSentMessage?.type || ((mediaData || mediaUrl) ? 'media' : 'chat')),
                    author: String(safeSentMessage?.author || safeSentMessage?._data?.author || '').trim() || null,
                    notifyName: null,
                    senderPhone: null,
                    senderId: null,
                    senderPushname: null,
                    isGroupMessage: String(targetChatId || '').endsWith('@g.us'),
                    canEdit: false,
                    order: null,
                    location: null,
                    quotedMessage: quotedId ? { id: quotedId, body: '', fromMe: false, hasMedia: false, type: 'chat' } : null,
                    ...(agentMeta || {}),
                    sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || String(agentMeta?.sentViaModuleId || '').trim() || null,
                    sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || String(agentMeta?.sentViaModuleName || '').trim() || null,
                    sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || String(agentMeta?.sentViaModuleImageUrl || '').trim() || null,
                    sentViaTransport: moduleAttributionMeta?.sentViaTransport || String(agentMeta?.sentViaTransport || '').trim().toLowerCase() || null,
                    sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || String(agentMeta?.sentViaPhoneNumber || '').trim() || null,
                    sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || String(agentMeta?.sentViaChannelType || '').trim().toLowerCase() || null
                };

                const persistedMessage = {
                    ...safeSentMessage,
                    id: safeSentMessage?.id || { _serialized: messageId },
                    fromMe: true,
                    to: targetChatId,
                    body: payload.body,
                    timestamp,
                    hasMedia: payload.hasMedia,
                    type: payload.type,
                    ack
                };
                this.emitToRuntimeContext('message', payload);

                setImmediate(async () => {
                    try {
                        await this.persistMessageHistory(tenantId, {
                            msg: persistedMessage,
                            senderMeta: null,
                            fileMeta: {
                                mimetype: payload.mimetype,
                                filename: payload.filename,
                                fileSizeBytes: payload.fileSizeBytes,
                                mediaUrl: payload.mediaUrl,
                                mediaPath: payload.mediaPath
                            },
                            order: null,
                            location: null,
                            quotedMessage: payload.quotedMessage,
                            agentMeta,
                            moduleContext
                        });
                    } catch (persistError) {
                        console.warn('[WA][PersistOutgoing] ' + String(persistError?.message || persistError || 'No se pudo persistir mensaje saliente.'));
                    }
                });

                setImmediate(async () => {
                    try {
                        this.invalidateChatListCache();
                        const chat = await waClient.client.getChatById(targetChatId);
                        const summary = await this.toChatSummary(chat, {
                            includeHeavyMeta: false,
                            tenantId,
                            scopeModuleId: String(moduleContext?.moduleId || '').trim().toLowerCase() || '',
                            scopeModuleName: String(moduleContext?.name || '').trim() || null,
                            scopeModuleImageUrl: String(moduleContext?.imageUrl || moduleContext?.logoUrl || '').trim() || null,
                            scopeChannelType: String(moduleContext?.channelType || '').trim().toLowerCase() || null,
                            scopeTransport: String(moduleContext?.transportMode || '').trim().toLowerCase() || null
                        });
                        if (summary) this.emitToRuntimeContext('chat_updated', summary);
                    } catch (_) { }
                });
            };
            const resolveScopedSendTarget = async ({ rawChatId = '', rawPhone = '', errorEvent = 'error', action = 'enviar mensajes' } = {}) => {
                const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const scopedTarget = resolveScopedChatTarget(String(rawChatId || '').trim(), selectedScopeModuleId);
                let scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                let moduleContext = socket?.data?.waModule || null;

                if (scopeModuleId) {
                    const currentModuleId = normalizeScopedModuleId(moduleContext?.moduleId || socket?.data?.waModuleId || '');
                    if (!currentModuleId || currentModuleId !== scopeModuleId) {
                        const moduleContextPayload = await resolveSocketModuleContext(tenantId, authContext, scopeModuleId);
                        moduleContext = moduleContextPayload?.selected || null;
                        const resolvedModuleId = normalizeScopedModuleId(moduleContext?.moduleId || '');
                        if (!resolvedModuleId || resolvedModuleId !== scopeModuleId) {
                            socket.emit(errorEvent, 'No tienes acceso al modulo solicitado para ' + action + '.');
                            return { ok: false };
                        }
                        await ensureTransportForSelectedModule(moduleContext);
                    }
                }

                if (!scopeModuleId) {
                    scopeModuleId = normalizeScopedModuleId(moduleContext?.moduleId || socket?.data?.waModuleId || '');
                }

                const runtime = this.getWaRuntime();
                const activeTransport = String(runtime?.activeTransport || '').trim().toLowerCase();
                const targetPhone = coerceHumanPhone(rawPhone || '');
                let targetChatId = String(scopedTarget.baseChatId || '').trim();

                if (activeTransport === 'cloud') {
                    const resolvedCloudChatId = resolveCloudDestinationChatId(targetChatId, targetPhone);
                    if (!resolvedCloudChatId) {
                        socket.emit(errorEvent, 'No se pudo resolver un numero WhatsApp valido para este chat en Cloud API. Abre chat por numero real.');
                        return { ok: false };
                    }
                    targetChatId = resolvedCloudChatId;
                }

                if (!targetChatId) {
                    socket.emit(errorEvent, 'Datos invalidos para ' + action + '.');
                    return { ok: false };
                }

                return {
                    ok: true,
                    activeTransport,
                    targetPhone,
                    targetChatId,
                    moduleContext,
                    scopeModuleId,
                    scopedChatId: buildScopedChatId(targetChatId, scopeModuleId || '')
                };
            };

            socket.on('send_message', async ({ to, toPhone, body, quotedMessageId }) => {
                if (!guardRateLimit(socket, 'send_message')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar mensajes', errorEvent: 'error' })) return;
                try {
                    const text = String(body || '');
                    const quoted = String(quotedMessageId || '').trim();
                    if (!text.trim()) {
                        socket.emit('error', 'Datos invalidos para enviar mensaje.');
                        return;
                    }

                    const target = await resolveScopedSendTarget({
                        rawChatId: to,
                        rawPhone: toPhone,
                        errorEvent: 'error',
                        action: 'enviar mensajes'
                    });
                    if (!target?.ok) return;

                    const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                    let sentMessage = null;

                    if (quoted) {
                        let quotedTargetChatId = target.targetChatId;
                        try {
                            const quotedMsg = await waClient.getMessageById(quoted);
                            const fromQuoted = String(quotedMsg?.fromMe ? quotedMsg?.to : quotedMsg?.from || '').trim();
                            if (fromQuoted && isVisibleChatId(fromQuoted)) {
                                quotedTargetChatId = String(parseScopedChatId(fromQuoted).chatId || fromQuoted).trim();
                            }
                            if (target.activeTransport === 'cloud' && isLidIdentifier(quotedTargetChatId)) {
                                quotedTargetChatId = target.targetChatId;
                            }
                        } catch (resolveQuotedError) {
                        }

                        try {
                            sentMessage = await waClient.sendMessage(quotedTargetChatId, text, { quotedMessageId: quoted });
                        } catch (sendWithQuoteError) {
                            sentMessage = await waClient.replyToMessage(quotedTargetChatId, quoted, text);
                        }
                    } else {
                        sentMessage = await waClient.sendMessage(target.targetChatId, text);
                    }

                    const sentMessageId = getSerializedMessageId(sentMessage);
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }

                    await emitRealtimeOutgoingMessage({
                        sentMessage,
                        fallbackChatId: target.targetChatId,
                        fallbackBody: text,
                        quotedMessageId: quoted,
                        moduleContext,
                        agentMeta,
                        mediaPayload: null
                    });

                    await recordConversationEvent({
                        chatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId,
                        eventType: 'chat.message.outgoing.text',
                        eventSource: 'socket',
                        payload: {
                            messageId: sentMessageId || null,
                            quotedMessageId: quoted || null,
                            length: text.length,
                            hasQuote: Boolean(quoted)
                        }
                    });
                } catch (e) {
                    const detail = String(e?.message || e || 'Failed to send message.');
                    console.warn('[WA][SendMessage] ' + detail);
                    socket.emit('error', detail);
                }
            });
            socket.on('edit_message', async ({ chatId, messageId, body }) => {
                if (!guardRateLimit(socket, 'edit_message')) return;
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'edit_message_error', action: 'editar mensajes' })) return;
                if (!this.ensureTransportReady(socket, { action: 'editar mensajes', errorEvent: 'edit_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageEdit) {
                    socket.emit('edit_message_error', 'La edicion de mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const targetChatId = String(chatId || '').trim();
                    const targetMessageId = String(messageId || '').trim();
                    const nextBody = String(body || '').trim();

                    if (!targetChatId || !targetMessageId || !nextBody) {
                        socket.emit('edit_message_error', 'Datos invalidos para editar el mensaje.');
                        return;
                    }

                    const chat = await waClient.client.getChatById(targetChatId);
                    const candidates = await chat.fetchMessages({ limit: 150 });
                    const targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId);
                    if (!targetMessage) {
                        socket.emit('edit_message_error', 'No se encontro el mensaje para editar.');
                        return;
                    }

                    if (!targetMessage.fromMe) {
                        socket.emit('edit_message_error', 'Solo puedes editar mensajes enviados por ti.');
                        return;
                    }

                    if (typeof targetMessage.edit !== 'function') {
                        socket.emit('edit_message_error', 'Esta version de WhatsApp Web no permite editar mensajes por API.');
                        return;
                    }


                    const canEditNow = await waClient.canEditMessageById(targetMessageId);
                    if (!canEditNow) {
                        socket.emit('edit_message_error', 'WhatsApp no permite editar este mensaje (tipo o tiempo).');
                        return;
                    }

                    const editedMessage = await targetMessage.edit(nextBody);
                    if (!editedMessage) {
                        socket.emit('edit_message_error', 'WhatsApp no permitio editar el mensaje.');
                        return;
                    }

                    this.emitMessageEditability(targetMessageId, targetChatId);
                    await auditSocketAction('message.edited', {
                        resourceType: 'message',
                        resourceId: targetMessageId,
                        payload: { chatId: targetChatId }
                    });
                } catch (e) {
                    const detail = String(e?.message || '').toLowerCase();
                    if (detail.includes('revoke') || detail.includes('time') || detail.includes('edit')) {
                        socket.emit('edit_message_error', 'No se pudo editar: WhatsApp puede limitar la edicion por tiempo.');
                    } else {
                        socket.emit('edit_message_error', 'No se pudo editar el mensaje.');
                    }
                }
            });
            socket.on('send_media_message', async (data) => {
                if (!guardRateLimit(socket, 'send_media_message')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar adjuntos', errorEvent: 'error' })) return;
                try {
                    const { to, toPhone, body, mediaData, mimetype, filename, isPtt, quotedMessageId } = data || {};
                    if (isPtt) {
                        socket.emit('error', 'El envio de notas de voz esta deshabilitado temporalmente.');
                        return;
                    }

                    const caption = String(body || '');
                    const quoted = String(quotedMessageId || '').trim();
                    if (!String(mediaData || '').trim()) {
                        socket.emit('error', 'Datos invalidos para enviar adjunto.');
                        return;
                    }

                    const target = await resolveScopedSendTarget({
                        rawChatId: to,
                        rawPhone: toPhone,
                        errorEvent: 'error',
                        action: 'enviar adjuntos'
                    });
                    if (!target?.ok) return;

                    const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                    const sentMessage = await waClient.sendMedia(target.targetChatId, mediaData, mimetype, filename, caption, isPtt, quoted || null);
                    const sentMessageId = getSerializedMessageId(sentMessage);
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }

                    await emitRealtimeOutgoingMessage({
                        sentMessage,
                        fallbackChatId: target.targetChatId,
                        fallbackBody: caption,
                        quotedMessageId: quoted,
                        moduleContext,
                        agentMeta,
                        mediaPayload: {
                            data: String(mediaData || ''),
                            mimetype: String(mimetype || '').trim() || null,
                            filename: String(filename || '').trim() || null,
                            fileSizeBytes: null
                        }
                    });
                    await recordConversationEvent({
                        chatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId,
                        eventType: 'chat.message.outgoing.media',
                        eventSource: 'socket',
                        payload: {
                            messageId: sentMessageId || null,
                            quotedMessageId: quoted || null,
                            mimetype: String(mimetype || '').trim() || null,
                            filename: String(filename || '').trim() || null,
                            hasCaption: Boolean(caption.trim())
                        }
                    });
                } catch (e) {
                    const detail = String(e?.message || e || 'Failed to send media.');
                    console.warn('[WA][SendMedia] ' + detail);
                    socket.emit('error', detail);
                }
            });

            socket.on('forward_message', async ({ messageId, toChatId }) => {
                if (!guardRateLimit(socket, 'forward_message')) return;
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'forward_message_error', action: 'reenviar mensajes' })) return;
                if (!this.ensureTransportReady(socket, { action: 'reenviar mensajes', errorEvent: 'forward_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageForward) {
                    socket.emit('forward_message_error', 'Reenviar mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const sourceMessageId = String(messageId || '').trim();
                    const targetChatId = String(toChatId || '').trim();
                    if (!sourceMessageId || !targetChatId) {
                        socket.emit('forward_message_error', 'Datos invalidos para reenviar.');
                        return;
                    }

                    await waClient.forwardMessage(sourceMessageId, targetChatId);
                    socket.emit('message_forwarded', {
                        messageId: sourceMessageId,
                        toChatId: targetChatId
                    });
                    await auditSocketAction('message.forwarded', {
                        resourceType: 'message',
                        resourceId: sourceMessageId,
                        payload: { toChatId: targetChatId }
                    });
                } catch (e) {
                    socket.emit('forward_message_error', 'No se pudo reenviar el mensaje en esta version de WhatsApp.');
                }
            });

            socket.on('delete_message', async ({ chatId, messageId }) => {
                if (!guardRateLimit(socket, 'delete_message')) return;
                if (!requireRole(['owner', 'admin', 'seller'], { errorEvent: 'delete_message_error', action: 'eliminar mensajes' })) return;
                if (!this.ensureTransportReady(socket, { action: 'eliminar mensajes', errorEvent: 'delete_message_error' })) return;
                const caps = this.getWaCapabilities();
                if (!caps.messageDelete) {
                    socket.emit('delete_message_error', 'Eliminar mensajes no esta disponible en este transporte.');
                    return;
                }
                try {
                    const targetMessageId = String(messageId || '').trim();
                    const incomingChatId = String(chatId || '').trim();
                    if (!targetMessageId) {
                        socket.emit('delete_message_error', 'Datos invalidos para eliminar mensaje.');
                        return;
                    }

                    let targetMessage = await waClient.getMessageById(targetMessageId);
                    if ((!targetMessage || typeof targetMessage.delete !== 'function')) {
                        const safeChatId = incomingChatId;
                        if (!safeChatId) {
                            if (!targetMessage) {
                                socket.emit('delete_message_error', 'No se encontro el chat del mensaje.');
                                return;
                            }
                        } else {
                            const chat = await waClient.client.getChatById(safeChatId);
                            const candidates = await chat.fetchMessages({ limit: 250 });
                            targetMessage = candidates.find((m) => String(m?.id?._serialized || '') === targetMessageId) || targetMessage;
                        }
                    }

                    if (!targetMessage) {
                        socket.emit('delete_message_error', 'No se encontro el mensaje para eliminar.');
                        return;
                    }

                    if (typeof targetMessage.delete !== 'function') {
                        socket.emit('delete_message_error', 'Esta version no permite eliminar mensajes por API.');
                        return;
                    }

                    const targetChatId = String(incomingChatId || (targetMessage.fromMe ? targetMessage.to : targetMessage.from) || '').trim();
                    const attemptDeleteForEveryone = Boolean(targetMessage.fromMe);

                    try {
                        await targetMessage.delete(attemptDeleteForEveryone);
                    } catch (deleteErr) {
                        if (!attemptDeleteForEveryone) throw deleteErr;
                        // Fallback to local delete when revoke-for-everyone is no longer allowed.
                        await targetMessage.delete(false);
                    }

                    this.io.emit('message_deleted', {
                        chatId: targetChatId,
                        messageId: targetMessageId
                    });
                    await auditSocketAction('message.deleted', {
                        resourceType: 'message',
                        resourceId: targetMessageId,
                        payload: { chatId: targetChatId }
                    });
                } catch (e) {
                    socket.emit('delete_message_error', 'No se pudo eliminar el mensaje.');
                }
            });
            socket.on('send_catalog_product', async (payload = {}) => {
                if (!guardRateLimit(socket, 'send_catalog_product')) return;
                if (!this.ensureTransportReady(socket, { action: 'enviar productos de catalogo', errorEvent: 'error' })) return;
                const catalogEnabled = await this.isFeatureEnabledForTenant(tenantId, 'catalog');
                if (!catalogEnabled) {
                    socket.emit('error', 'Catalogo deshabilitado para esta empresa o plan.');
                    return;
                }
                try {
                    const target = await resolveScopedSendTarget({
                        rawChatId: payload?.to,
                        rawPhone: payload?.toPhone,
                        errorEvent: 'error',
                        action: 'enviar productos de catalogo'
                    });
                    if (!target?.ok) return;

                    const product = payload?.product && typeof payload.product === 'object' ? payload.product : {};
                    const caption = buildCatalogProductCaption(product);
                    const imageUrl = String(product?.imageUrl || product?.image || '').trim();
                    const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                    const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));

                    let sentWithImage = false;
                    let sentResponse = null;
                    let catalogMediaPayload = null;
                    if (imageUrl) {
                        const maxCatalogImageBytes = Number(process.env.CATALOG_IMAGE_MAX_BYTES || 4 * 1024 * 1024);
                        const media = await fetchCatalogProductImage(imageUrl, {
                            maxBytes: maxCatalogImageBytes,
                            timeoutMs: Number(process.env.CATALOG_IMAGE_TIMEOUT_MS || 7000)
                        });
                        const compatibleMedia = await ensureCloudApiCompatibleCatalogImage(media, {
                            maxBytes: maxCatalogImageBytes
                        });

                        if (compatibleMedia) {
                            const baseName = slugifyFileName(product?.title || product?.name || 'producto');
                            const filename = String(baseName || 'producto') + '.' + String(compatibleMedia.extension || 'jpg');
                            sentResponse = await waClient.sendMedia(
                                target.targetChatId,
                                compatibleMedia.mediaData,
                                compatibleMedia.mimetype,
                                filename,
                                caption,
                                false
                            );
                            sentWithImage = true;
                            catalogMediaPayload = {
                                mimetype: compatibleMedia.mimetype,
                                filename,
                                fileSizeBytes: Number(compatibleMedia?.fileSizeBytes || 0) || null,
                                mediaUrl: String(compatibleMedia?.publicUrl || compatibleMedia?.sourceUrl || imageUrl || '').trim() || null,
                                mediaPath: String(compatibleMedia?.relativePath || '').trim() || null
                            };
                        } else if (media?.mimetype) {
                            console.warn('[WA][SendCatalogProduct] media no compatible para Cloud API (' + String(media.mimetype) + '), se enviara solo texto.');
                        }
                    }

                    if (!sentWithImage) {
                        sentResponse = await waClient.sendMessage(target.targetChatId, caption);
                    }


                    const sentMessageId = getSerializedMessageId(sentResponse)
                        || String(sentResponse?.messages?.[0]?.id || sentResponse?.message_id || '').trim();
                    if (sentMessageId && agentMeta) {
                        rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                    }
                    await emitRealtimeOutgoingMessage({
                        sentMessage: sentResponse || {
                            id: sentMessageId ? { _serialized: sentMessageId } : null,
                            to: target.targetChatId,
                            body: caption,
                            fromMe: true,
                            timestamp: Math.floor(Date.now() / 1000),
                            ack: 1,
                            hasMedia: sentWithImage,
                            type: sentWithImage ? 'image' : 'chat'
                        },
                        fallbackChatId: target.targetChatId,
                        fallbackBody: caption,
                        moduleContext,
                        agentMeta,
                        mediaPayload: catalogMediaPayload
                    });
                    await recordConversationEvent({
                        chatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId,
                        eventType: 'chat.message.outgoing.catalog_product',
                        eventSource: 'socket',
                        payload: {
                            messageId: sentMessageId || null,
                            productId: String(product?.id || product?.productId || '').trim() || null,
                            productTitle: String(product?.title || product?.name || '').trim() || null,
                            withImage: sentWithImage,
                            mediaUrl: String(catalogMediaPayload?.mediaUrl || '').trim() || null,
                            catalogId: String(product?.catalogId || '').trim() || null
                        }
                    });

                    socket.emit('catalog_product_sent', {
                        to: target.scopedChatId || target.targetChatId,
                        baseChatId: target.targetChatId,
                        scopeModuleId: target.scopeModuleId || null,
                        title: String(product?.title || product?.name || 'Producto'),
                        withImage: sentWithImage
                    });
                } catch (e) {
                    const detail = String(e?.message || e || 'No se pudo enviar el producto del catalogo.');
                    console.warn('[WA][SendCatalogProduct] ' + detail);
                    socket.emit('error', detail);
                }
            });

            socket.on('mark_chat_read', async (chatId) => {
                try {
                    const requestedChatId = String(chatId || '').trim();
                    if (!requestedChatId) return;
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedTarget = resolveScopedChatTarget(requestedChatId, selectedScopeModuleId);
                    const safeChatId = String(scopedTarget.baseChatId || '').trim();
                    if (!safeChatId) return;
                    await waClient.markAsRead(safeChatId);
                } catch (e) { }
            });

            // --- AI ---
            socket.on('get_ai_chat_history', async (payload = {}) => {
                try {
                    const safePayload = payload && typeof payload === 'object'
                        ? payload
                        : { chatId: String(payload || '').trim() };
                    const requestSeq = Number(safePayload?.requestSeq || 0) || null;
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const historyScope = resolveAiHistoryScope({
                        chatId: safePayload.chatId || safePayload.scopeChatId || safePayload.scopedChatId || '',
                        scopeModuleId: safePayload.scopeModuleId || safePayload.moduleId || selectedScopeModuleId || '',
                        runtimeContext: safePayload.runtimeContext && typeof safePayload.runtimeContext === 'object'
                            ? safePayload.runtimeContext
                            : null
                    }, selectedScopeModuleId);

                    if (!historyScope.scopeChatId) {
                        socket.emit('ai_chat_history', {
                            requestSeq,
                            scopeChatId: null,
                            baseChatId: null,
                            scopeModuleId: historyScope.scopeModuleId || null,
                            items: []
                        });
                        return;
                    }

                    const rawLimit = Number(safePayload.limit || 80);
                    const limit = Number.isFinite(rawLimit)
                        ? Math.min(200, Math.max(20, Math.floor(rawLimit)))
                        : 80;

                    const items = await aiChatHistoryService.listEntries(tenantId, {
                        scopeChatId: historyScope.scopeChatId,
                        limit,
                        beforeTimestamp: Number(safePayload.beforeTimestamp || 0) || null
                    });

                    socket.emit('ai_chat_history', {
                        requestSeq,
                        scopeChatId: historyScope.scopeChatId,
                        baseChatId: historyScope.baseChatId || null,
                        scopeModuleId: historyScope.scopeModuleId || null,
                        items: Array.isArray(items) ? items : []
                    });
                } catch (error) {
                    socket.emit('ai_chat_history', {
                        requestSeq: Number(payload?.requestSeq || 0) || null,
                        scopeChatId: null,
                        baseChatId: null,
                        scopeModuleId: null,
                        items: [],
                        error: 'No se pudo cargar historial IA.'
                    });
                }
            });
            socket.on('request_ai_suggestion', (payload) => {
                if (!guardRateLimit(socket, 'request_ai_suggestion')) return;
                const { contextText, customPrompt, businessContext, moduleId, runtimeContext } = payload || {};
                // Defer to avoid blocking the event loop (prevents 'click handler took Xms' violations)
                setImmediate(async () => {
                    try {
                        const quota = await this.reserveAiQuota(tenantId, { socket });
                        if (!quota?.ok) {
                            socket.emit('ai_suggestion_complete');
                            return;
                        }

                        const requestedModuleId = normalizeSocketModuleId(moduleId || '');
                        let aiModuleContext = socket?.data?.waModule || null;
                        const activeModuleId = normalizeSocketModuleId(aiModuleContext?.moduleId || socket?.data?.waModuleId || '');
                        if (requestedModuleId && requestedModuleId !== activeModuleId) {
                            const contextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId).catch(() => null);
                            if (contextPayload?.selected) {
                                aiModuleContext = contextPayload.selected;
                            }
                        }
                        const moduleAssistantId = String(aiModuleContext?.metadata?.moduleSettings?.aiAssistantId || '').trim().toUpperCase();
                        const safeRuntimeContext = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : null;
                        const aiText = await getChatSuggestion(contextText, customPrompt, (chunk) => {
                            socket.emit('ai_suggestion_chunk', chunk);
                        }, businessContext, {
                            tenantId,
                            moduleAssistantId,
                            runtimeContext: safeRuntimeContext,
                            moduleContext: aiModuleContext && typeof aiModuleContext === 'object' ? aiModuleContext : null
                        });
                        if (typeof aiText === 'string' && aiText.startsWith('Error IA:')) {
                            socket.emit('ai_error', aiText);
                        } else {
                            const historyScope = resolveAiHistoryScope({
                                chatId: safeRuntimeContext?.chat?.chatId || '',
                                scopeModuleId: safeRuntimeContext?.module?.moduleId || requestedModuleId || activeModuleId || '',
                                runtimeContext: safeRuntimeContext
                            }, normalizeSocketModuleId(aiModuleContext?.moduleId || requestedModuleId || activeModuleId || ''));
                            const suggestionPrompt = String(contextText || customPrompt || '').trim();
                            if (historyScope.scopeChatId && suggestionPrompt && String(aiText || '').trim()) {
                                try {
                                    await aiChatHistoryService.appendInteraction(tenantId, {
                                        scopeChatId: historyScope.scopeChatId,
                                        baseChatId: historyScope.baseChatId,
                                        scopeModuleId: historyScope.scopeModuleId,
                                        mode: 'suggestion',
                                        assistantId: moduleAssistantId || null,
                                        userId: String(authContext?.userId || authContext?.id || '').trim() || null,
                                        userName: String(authContext?.name || authContext?.displayName || authContext?.email || '').trim() || null,
                                        query: suggestionPrompt,
                                        response: String(aiText || '').trim(),
                                        runtimeContext: safeRuntimeContext
                                    });
                                } catch (_) { }
                            }
                        }
                        socket.emit('ai_suggestion_complete');
                    } catch (e) {
                        console.error('AI suggestion error:', e);
                        socket.emit('ai_error', 'Error IA: no se pudo generar sugerencia.');
                        socket.emit('ai_suggestion_complete');
                    }
                });
            });

            socket.on('internal_ai_query', (payload) => {
                if (!guardRateLimit(socket, 'internal_ai_query')) return;
                const { query, businessContext, moduleId, runtimeContext } = typeof payload === 'string'
                    ? { query: payload, businessContext: null, moduleId: '', runtimeContext: null }
                    : (payload || {});
                // Defer to avoid blocking the event loop
                setImmediate(async () => {
                    try {
                        const quota = await this.reserveAiQuota(tenantId, { socket });
                        if (!quota?.ok) {
                            socket.emit('internal_ai_complete');
                            return;
                        }

                        const requestedModuleId = normalizeSocketModuleId(moduleId || '');
                        let aiModuleContext = socket?.data?.waModule || null;
                        const activeModuleId = normalizeSocketModuleId(aiModuleContext?.moduleId || socket?.data?.waModuleId || '');
                        if (requestedModuleId && requestedModuleId !== activeModuleId) {
                            const contextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId).catch(() => null);
                            if (contextPayload?.selected) {
                                aiModuleContext = contextPayload.selected;
                            }
                        }
                        const moduleAssistantId = String(aiModuleContext?.metadata?.moduleSettings?.aiAssistantId || '').trim().toUpperCase();
                        const safeRuntimeContext = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : null;
                        const copilotText = await askInternalCopilot(query, (chunk) => {
                            socket.emit('internal_ai_chunk', chunk);
                        }, businessContext, {
                            tenantId,
                            moduleAssistantId,
                            runtimeContext: safeRuntimeContext,
                            moduleContext: aiModuleContext && typeof aiModuleContext === 'object' ? aiModuleContext : null
                        });
                        if (typeof copilotText === 'string' && copilotText.startsWith('Error IA:')) {
                            socket.emit('internal_ai_error', copilotText);
                        } else {
                            const historyScope = resolveAiHistoryScope({
                                chatId: safeRuntimeContext?.chat?.chatId || '',
                                scopeModuleId: safeRuntimeContext?.module?.moduleId || requestedModuleId || activeModuleId || '',
                                runtimeContext: safeRuntimeContext
                            }, normalizeSocketModuleId(aiModuleContext?.moduleId || requestedModuleId || activeModuleId || ''));
                            const cleanQuery = String(query || '').trim();
                            const cleanCopilotText = String(copilotText || '').trim();
                            if (historyScope.scopeChatId && cleanQuery && cleanCopilotText) {
                                try {
                                    await aiChatHistoryService.appendInteraction(tenantId, {
                                        scopeChatId: historyScope.scopeChatId,
                                        baseChatId: historyScope.baseChatId,
                                        scopeModuleId: historyScope.scopeModuleId,
                                        mode: 'copilot',
                                        assistantId: moduleAssistantId || null,
                                        userId: String(authContext?.userId || authContext?.id || '').trim() || null,
                                        userName: String(authContext?.name || authContext?.displayName || authContext?.email || '').trim() || null,
                                        query: cleanQuery,
                                        response: cleanCopilotText,
                                        runtimeContext: safeRuntimeContext
                                    });
                                } catch (_) { }
                            }
                        }
                        socket.emit('internal_ai_complete');
                    } catch (e) {
                        console.error('Copilot error:', e);
                        socket.emit('internal_ai_error', 'Error IA: no se pudo responder en copiloto.');
                        socket.emit('internal_ai_complete');
                    }
                });
            });
            socket.on('get_business_catalog', async ({ moduleId, catalogId, requestSeq } = {}) => {
                try {
                    const catalogScope = await resolveCatalogScope({
                        requestedModuleId: moduleId,
                        requestedCatalogId: catalogId
                    });
                    const scopedCatalog = await loadScopedLocalCatalog(catalogScope, {
                        requestedCatalogId: catalogId
                    });
                    socket.emit('business_data_catalog', {
                        scope: {
                            ...catalogScope,
                            catalogIds: scopedCatalog.selection.catalogIds,
                            catalogId: scopedCatalog.selection.primaryCatalogId,
                            catalogs: scopedCatalog.selection.catalogs || []
                        },
                        source: 'local',
                        requestSeq: Number(requestSeq || 0) || null,
                        items: scopedCatalog.items
                    });
                } catch (error) {
                    socket.emit('error', String(error?.message || 'No se pudo cargar el catalogo del modulo.'));
                }
            });

            socket.on('get_business_data', async (scopeRequest = {}) => {
                const requestSeq = scopeRequest && typeof scopeRequest === 'object'
                    ? (Number(scopeRequest?.requestSeq || 0) || null)
                    : null;
                try {
                    const requestedModuleId = scopeRequest && typeof scopeRequest === 'object' ? scopeRequest?.moduleId : '';
                    const requestedCatalogId = scopeRequest && typeof scopeRequest === 'object' ? scopeRequest?.catalogId : '';
                    const catalogScope = await resolveCatalogScope({
                        requestedModuleId,
                        requestedCatalogId
                    });
                    const requestedModuleScopeId = normalizeSocketModuleId(catalogScope?.moduleId || requestedModuleId);
                    const availableSocketModules = Array.isArray(socket?.data?.waModules) ? socket.data.waModules : [];
                    const selectedModuleContext = requestedModuleScopeId
                        ? (availableSocketModules.find((entry) => normalizeSocketModuleId(entry?.moduleId) === requestedModuleScopeId) || socket?.data?.waModule || null)
                        : (socket?.data?.waModule || null);
                    const resolvedCatalogSelection = await resolveCatalogSelection(catalogScope);

                    if (!this.ensureTransportReady(socket, { action: 'cargar datos del negocio', errorEvent: 'error' })) {
                        const scopedLocalFallback = await loadScopedLocalCatalog(catalogScope);
                        socket.emit('business_data', {
                            profile: null,
                            labels: [],
                            catalog: scopedLocalFallback.items,
                            requestSeq,
                            catalogMeta: {
                                source: 'local',
                                nativeAvailable: false,
                                wooConfigured: false,
                                wooAvailable: false,
                                scope: {
                                    ...catalogScope,
                                    catalogIds: scopedLocalFallback.selection.catalogIds,
                                    catalogId: scopedLocalFallback.selection.primaryCatalogId
                                }
                            }
                        });
                        return;
                    }
                    const me = waClient.client.info;
                    const meId = me.wid._serialized;

                                        // Real profile from WA account info
                    let meContact = null;
                    let profilePicUrl = null;
                    let businessProfile = null;
                    let aboutStatus = null;
                    try {
                        if (meId) meContact = await waClient.client.getContactById(meId);
                    } catch (e) { }
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                            me?.wid?.user,
                            meContact?.id?._serialized,
                            meContact?.number
                        ]);
                    } catch (e) { }
                    try { businessProfile = await waClient.getBusinessProfile(meId); } catch (e) { }
                    try {
                        if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(meContact);
                    const profile = {
                        name: me?.pushname || meContact?.name || meContact?.pushname || 'Mi Negocio',
                        pushname: me?.pushname || meContact?.pushname || null,
                        shortName: meContact?.shortName || null,
                        verifiedName: meContact?._data?.verifiedName || null,
                        verifiedLevel: meContact?._data?.verifiedLevel || null,
                        phone: me?.wid?.user || meContact?.number || null,
                        id: meId || null,
                        platform: me?.platform || null,
                        isBusiness: Boolean(meContact?.isBusiness ?? true),
                        isEnterprise: Boolean(meContact?.isEnterprise),
                        isMyContact: Boolean(meContact?.isMyContact),
                        isMe: Boolean(meContact?.isMe ?? true),
                        isWAContact: Boolean(meContact?.isWAContact ?? true),
                        status: aboutStatus || null,
                        profilePicUrl,
                        businessHours: businessDetails?.businessHours || null,
                        category: businessDetails?.category || null,
                        email: businessDetails?.email || null,
                        website: businessDetails?.website || null,
                        websites: businessDetails?.websites || [],
                        address: businessDetails?.address || null,
                        description: businessDetails?.description || null,
                        businessDetails,
                        whatsappInfo: snapshotSerializable(me),
                        contactSnapshot
                    };

                    // Labels desde store tenant (Postgres/file), no desde WhatsApp Web.
                    let labels = [];
                    try {
                        labels = await tenantLabelService.listLabels({ tenantId, includeInactive: false });
                        profile.labelsCount = Array.isArray(labels) ? labels.length : 0;
                    } catch (e) {
                        labels = [];
                    }

                    const tenantSettings = await tenantSettingsService.getTenantSettings(tenantId);
                    const tenantIntegrations = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
                    const activeCatalogId = normalizeSocketCatalogId(catalogScope?.catalogId || resolvedCatalogSelection?.primaryCatalogId || '');
                    const activeCatalogConfig = (Array.isArray(resolvedCatalogSelection?.catalogs) ? resolvedCatalogSelection.catalogs : [])
                        .find((entry) => normalizeSocketCatalogId(entry?.catalogId) === activeCatalogId) || null;
                    const activeCatalogSourceType = String(activeCatalogConfig?.sourceType || '').trim().toLowerCase();

                    const moduleCatalogMode = String(selectedModuleContext?.metadata?.moduleSettings?.catalogMode || '').trim().toLowerCase();
                    const configuredCatalogMode = String(tenantIntegrations?.catalog?.mode || tenantSettings?.catalogMode || 'hybrid').trim().toLowerCase();
                    const forcedCatalogMode = activeCatalogSourceType === 'local'
                        ? 'local_only'
                        : (activeCatalogSourceType === 'woocommerce'
                            ? 'woo_only'
                            : (activeCatalogSourceType === 'meta' ? 'meta_only' : ''));
                    const catalogMode = forcedCatalogMode
                        || (moduleCatalogMode && moduleCatalogMode !== 'inherit'
                            ? moduleCatalogMode
                            : configuredCatalogMode);

                    const wooConfig = {
                        ...(tenantIntegrations?.catalog?.providers?.woocommerce || {}),
                        enabled: tenantIntegrations?.catalog?.providers?.woocommerce?.enabled !== false
                    };
                    const wooConfigured = isWooConfigured(wooConfig);
                    const tenantPlan = tenantService.findTenantById(tenantId) || tenantService.DEFAULT_TENANT;
                    const catalogEnabled = planLimitsService.isFeatureEnabledForTenant('catalog', tenantPlan, tenantSettings);
                    if (!catalogEnabled) {
                        socket.emit('business_data', {
                            profile,
                            labels,
                            catalog: [],
                            catalogMeta: {
                                source: 'disabled',
                                mode: catalogMode,
                                selectedCatalogSource: activeCatalogSourceType || null,
                                nativeAvailable: false,
                                wooConfigured,
                                wooAvailable: false,
                                disabledReason: 'catalog_module_disabled',
                                categories: []
                            },
                            tenantSettings,
                            integrations: tenantIntegrations
                        });
                        return;
                    }

                    let catalog = [];
                    let catalogMeta = {
                        source: 'native',
                        mode: catalogMode,
                        selectedCatalogSource: activeCatalogSourceType || null,
                        nativeAvailable: false,
                        wooConfigured,
                        wooAvailable: false,
                        wooSource: null,
                        wooStatus: null,
                        wooReason: null
                    };

                    const enableNative = catalogMode === 'hybrid' || catalogMode === 'meta_only';
                    const enableWoo = catalogMode === 'hybrid' || catalogMode === 'woo_only';
                    const enableLocal = catalogMode === 'hybrid' || catalogMode === 'local_only';
                    let scopedLocalCatalogResult = null;
                    // En modo hibrido priorizamos catalogo local del modulo si existe.
                    // Esto evita que Woo/Meta pisen catalogos separados por modulo.
                    if (enableLocal) {
                        scopedLocalCatalogResult = await loadScopedLocalCatalog(catalogScope);
                        const localCatalog = scopedLocalCatalogResult.items;
                        if (Array.isArray(localCatalog) && localCatalog.length > 0) {
                            catalog = localCatalog;
                            catalogMeta = {
                                ...catalogMeta,
                                source: 'local',
                                nativeAvailable: false,
                                wooConfigured,
                                wooAvailable: false,
                                scope: {
                                    ...catalogScope,
                                    catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                                    catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                                    catalogs: scopedLocalCatalogResult.selection.catalogs || []
                                }
                            };
                        }
                    }
                    if (!catalog.length && enableNative) {
                        try {
                            const nativeProducts = await waClient.getCatalog(meId);
                            if (nativeProducts && nativeProducts.length > 0) {
                                catalog = nativeProducts.map((p) => ({
                                    id: p.id,
                                    title: p.name,
                                    price: p.price ? Number.parseFloat(String(p.price)).toFixed(2) : '0.00',
                                    description: p.description,
                                    imageUrl: p.imageUrls ? p.imageUrls[0] : null,
                                    source: 'meta'
                                }));
                                catalogMeta = {
                                    ...catalogMeta,
                                    source: 'meta',
                                    nativeAvailable: true,
                                    wooAvailable: false
                                };
                            }
                        } catch (_) {
                            // noop
                        }
                    }

                    if (!catalog.length && enableWoo) {
                        const wooResult = await getWooCatalog({ config: wooConfig });
                        if (wooResult.products.length > 0) {
                            catalog = wooResult.products;
                            catalogMeta = {
                                ...catalogMeta,
                                source: 'woocommerce',
                                nativeAvailable: false,
                                wooAvailable: true,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                        } else {
                            catalogMeta = {
                                ...catalogMeta,
                                wooConfigured,
                                wooAvailable: false,
                                wooSource: wooResult.source,
                                wooStatus: wooResult.status,
                                wooReason: wooResult.reason
                            };
                        }
                    }

                    if (!catalog.length && enableLocal) {
                        if (!scopedLocalCatalogResult) {
                            scopedLocalCatalogResult = await loadScopedLocalCatalog(catalogScope);
                        }
                        catalog = scopedLocalCatalogResult.items;
                        catalogMeta = {
                            ...catalogMeta,
                            source: 'local',
                            nativeAvailable: false,
                            wooConfigured,
                            wooAvailable: false,
                            scope: {
                                ...catalogScope,
                                catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                                catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                                    catalogs: scopedLocalCatalogResult.selection.catalogs || []
                                }
                        };
                    }

                    const catalogCategories = Array.from(new Set(
                        (catalog || [])
                            .flatMap((item) => extractCatalogItemCategories(item))
                            .map((entry) => String(entry || '').trim())
                            .filter(Boolean)
                    )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
                    const resolvedScope = scopedLocalCatalogResult?.selection
                        ? {
                            ...catalogScope,
                            catalogIds: scopedLocalCatalogResult.selection.catalogIds,
                            catalogId: scopedLocalCatalogResult.selection.primaryCatalogId,
                                    catalogs: scopedLocalCatalogResult.selection.catalogs || []
                                }
                        : {
                            ...catalogScope,
                            catalogIds: resolvedCatalogSelection.catalogIds,
                            catalogId: resolvedCatalogSelection.primaryCatalogId,
                            catalogs: resolvedCatalogSelection.catalogs || []
                        };
                    catalogMeta = {
                        ...catalogMeta,
                        categories: catalogCategories,
                        scope: resolvedScope
                    };
                    logCatalogDebugSnapshot({ catalog, catalogMeta });
                    socket.emit('business_data', { profile, labels, catalog, catalogMeta, tenantSettings, integrations: tenantIntegrations, requestSeq });
                } catch (e) {
                    console.error('Error fetching business data:', e);
                    const fallbackCatalogScope = getActiveCatalogScope();
                    const fallbackCatalog = await loadScopedLocalCatalog(fallbackCatalogScope);
                    socket.emit('business_data', {
                        profile: null,
                        labels: [],
                        catalog: fallbackCatalog.items,
                        requestSeq,
                        catalogMeta: {
                            source: 'local',
                            mode: 'hybrid',
                            nativeAvailable: false,
                            wooConfigured: false,
                            wooAvailable: false,
                            wooSource: null,
                            wooStatus: 'error',
                            wooReason: 'Error al obtener datos de negocio',
                            scope: {
                                ...fallbackCatalogScope,
                                catalogIds: fallbackCatalog.selection.catalogIds,
                                catalogId: fallbackCatalog.selection.primaryCatalogId,
                                catalogs: fallbackCatalog.selection.catalogs || []
                            }
                        },
                        tenantSettings: await tenantSettingsService.getTenantSettings(tenantId),
                        integrations: await tenantIntegrationsService.getTenantIntegrations(tenantId)
                    });
                }
            });

            // --- Catalog CRUD ---
            socket.on('add_product', async () => {
                socket.emit('error', 'La edicion de productos desde chat esta deshabilitada. Gestiona el catalogo desde Panel SaaS.');
            });

            socket.on('update_product', async () => {
                socket.emit('error', 'La edicion de productos desde chat esta deshabilitada. Gestiona el catalogo desde Panel SaaS.');
            });

            socket.on('delete_product', async () => {
                socket.emit('error', 'La edicion de productos desde chat esta deshabilitada. Gestiona el catalogo desde Panel SaaS.');
            });
            socket.on('get_my_profile', async () => {
                try {
                    if (!this.ensureTransportReady(socket, { action: 'cargar perfil de empresa', errorEvent: 'error' })) {
                        socket.emit('my_profile', null);
                        return;
                    }
                    const me = waClient.client.info || {};
                    const meId = me?.wid?._serialized || null;
                    let meContact = null;
                    let profilePicUrl = null;
                    let businessProfile = null;
                    let aboutStatus = null;

                    try {
                        if (meId) meContact = await waClient.client.getContactById(meId);
                    } catch (e) { }
                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, meId, [
                            me?.wid?.user,
                            meContact?.id?._serialized,
                            meContact?.number
                        ]);
                    } catch (e) { }
                    try {
                        businessProfile = await waClient.getBusinessProfile(meId);
                    } catch (e) { }
                    try {
                        if (meContact?.getAbout) aboutStatus = await meContact.getAbout();
                    } catch (e) { }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(meContact);

                    socket.emit('my_profile', {
                        name: me?.pushname || meContact?.name || meContact?.pushname || null,
                        pushname: me?.pushname || meContact?.pushname || null,
                        shortName: meContact?.shortName || null,
                        verifiedName: meContact?._data?.verifiedName || null,
                        verifiedLevel: meContact?._data?.verifiedLevel || null,
                        phone: me?.wid?.user || meContact?.number || null,
                        id: meId,
                        platform: me?.platform || null,
                        profilePicUrl,
                        status: aboutStatus || null,
                        isBusiness: Boolean(meContact?.isBusiness ?? true),
                        isEnterprise: Boolean(meContact?.isEnterprise),
                        isMyContact: Boolean(meContact?.isMyContact),
                        isMe: Boolean(meContact?.isMe ?? true),
                        isWAContact: Boolean(meContact?.isWAContact ?? true),
                        category: businessDetails?.category || null,
                        email: businessDetails?.email || null,
                        website: businessDetails?.website || null,
                        websites: businessDetails?.websites || [],
                        address: businessDetails?.address || null,
                        description: businessDetails?.description || null,
                        businessHours: businessDetails?.businessHours || null,
                        businessDetails,
                        whatsappInfo: snapshotSerializable(me),
                        contactSnapshot
                    });
                } catch (e) {
                    console.error('Error fetching my profile:', e);
                }
            });

            socket.on('get_contact_info', async (contactId) => {
                try {
                    if (!this.ensureTransportReady(socket, { action: 'cargar perfil de contacto', errorEvent: 'error' })) {
                        return;
                    }
                    const requestedContactId = String(contactId || '').trim();
                    const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                    const scopedContactTarget = resolveScopedChatTarget(requestedContactId, selectedScopeModuleId);
                    const safeContactId = String(scopedContactTarget.baseChatId || '').trim();
                    if (!safeContactId) return;

                    const contact = await waClient.client.getContactById(safeContactId);
                    let chat = null;
                    let profilePicUrl = null;
                    let status = null;
                    let businessProfile = null;

                    try {
                        chat = await waClient.client.getChatById(safeContactId);
                    } catch (e) { }

                    try {
                        profilePicUrl = await resolveProfilePic(waClient.client, safeContactId, [
                            contact?.id?._serialized,
                            contact?.number,
                            contact?.number ? `${contact.number}@c.us` : null,
                            chat?.id?._serialized,
                            chat?.contact?.id?._serialized
                        ]);
                    } catch (e) { }
                    try {
                        const statusObj = await contact.getAbout();
                        status = statusObj;
                    } catch (e) { }
                    try {
                        if (contact?.isBusiness) {
                            businessProfile = await waClient.getBusinessProfile(safeContactId);
                        }
                    } catch (e) { }

                    let labels = [];
                    try {
                        labels = await tenantLabelService.listChatLabels({
                            tenantId,
                            chatId: safeContactId,
                            scopeModuleId: String(scopedContactTarget?.moduleId || '').trim().toLowerCase(),
                            includeInactive: false
                        });
                    } catch (e) { }

                    const isGroupChat = safeContactId.includes('@g.us') || Boolean(contact?.isGroup) || Boolean(chat?.isGroup);
                    let groupParticipants = [];
                    if (isGroupChat) {
                        groupParticipants = extractGroupParticipants(chat);
                        if (groupParticipants.length === 0) {
                            groupParticipants = await fetchGroupParticipantsFromStore(waClient.client, safeContactId);
                        }
                        groupParticipants = await hydrateGroupParticipantsWithContacts(waClient.client, groupParticipants);
                    }

                    const businessDetails = normalizeBusinessDetailsSnapshot(businessProfile);
                    const contactSnapshot = extractContactSnapshot(contact);
                    const chatSnapshot = extractChatSnapshot(chat);
                    const participantsCount = isGroupChat
                        ? (groupParticipants.length || Number(chatSnapshot?.participantsCount || 0) || 0)
                        : (chatSnapshot?.participantsCount ?? null);
                    const hydratedChatSnapshot = chatSnapshot
                        ? { ...chatSnapshot, participantsCount }
                        : null;

                    socket.emit('contact_info', {
                        id: scopedContactTarget.scopedChatId || buildScopedChatId(safeContactId, scopedContactTarget.moduleId || ''),
                        baseChatId: safeContactId,
                        scopeModuleId: scopedContactTarget.moduleId || null,
                        name: contact?.name || contact?.pushname || contact?.number || null,
                        phone: contact?.number || null,
                        number: contact?.number || null,
                        user: contact?.id?.user || null,
                        server: contact?.id?.server || null,
                        pushname: contact?.pushname || null,
                        shortName: contact?.shortName || null,
                        verifiedName: contact?._data?.verifiedName || null,
                        verifiedLevel: contact?._data?.verifiedLevel || null,
                        profilePicUrl,
                        hasProfilePic: Boolean(profilePicUrl),
                        status,
                        isBusiness: Boolean(contact?.isBusiness),
                        isEnterprise: Boolean(contact?.isEnterprise),
                        isMyContact: Boolean(contact?.isMyContact),
                        isWAContact: Boolean(contact?.isWAContact),
                        isBlocked: Boolean(contact?.isBlocked),
                        isMe: Boolean(contact?.isMe),
                        isUser: Boolean(contact?.isUser),
                        isGroup: isGroupChat,
                        isPSA: Boolean(contact?.isPSA),
                        participants: participantsCount,
                        participantsList: isGroupChat ? groupParticipants : [],
                        labels,
                        chatState: hydratedChatSnapshot,
                        businessDetails,
                        contactSnapshot,
                        raw: {
                            contact: contactSnapshot?.rawData || null,
                            chat: hydratedChatSnapshot?.rawData || null,
                            business: businessDetails?.raw || null
                        }
                    });
                } catch (e) {
                    console.error('Error fetching contact info:', e);
                }
            });

            socket.on('logout_whatsapp', async () => {
                if (!requireRole(['owner', 'admin'], { errorEvent: 'error', action: 'cerrar sesion de WhatsApp' })) return;
                try {
                    await waClient.client.logout();
                } catch (e) {
                    console.error('logout_whatsapp error:', e.message);
                }
                try {
                    waClient.isReady = false;
                    await waClient.initialize();
                } catch (e) {
                    console.error('reinitialize after logout failed:', e.message);
                }
                socket.emit('logout_done', { ok: true });
                await auditSocketAction('wa.logout.requested', {
                    resourceType: 'wa_runtime',
                    resourceId: 'logout',
                    payload: {}
                });
            });

            socket.on('disconnect', () => {
                console.log('Web client disconnected:', socket.id);
            });
        });
    }

    setupWAClientEvents() {
        waClient.on('qr', (qr) => this.emitToRuntimeContext('qr', qr));
        waClient.on('ready', async () => {
            const policyOk = await this.enforceRuntimeWebjsPhonePolicy();
            if (!policyOk) return;

            this.emitToRuntimeContext('ready', { message: 'WhatsApp Ready' });
            this.emitToRuntimeContext('wa_capabilities', this.getWaCapabilities());
            this.emitToRuntimeContext('wa_runtime', this.getWaRuntime());
        });
        waClient.on('authenticated', () => this.emitToRuntimeContext('authenticated'));
        waClient.on('auth_failure', (msg) => this.emitToRuntimeContext('auth_failure', msg));
        waClient.on('disconnected', (reason) => this.emitToRuntimeContext('disconnected', reason));

        waClient.on('message', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;

            const historyTenantId = this.resolveHistoryTenantId();
            const runtimeModuleContext = this.resolveHistoryModuleContext();
            const relatedChatIdBase = String(msg?.fromMe ? msg?.to : msg?.from || '').trim();
            const messageId = getSerializedMessageId(msg);
            const agentMeta = msg?.fromMe ? mergeAgentMeta(getOutgoingAgentMeta(messageId)) : null;
            const effectiveModuleContext = buildEffectiveModuleContext(runtimeModuleContext, agentMeta);
            const moduleAttributionMeta = buildModuleAttributionMeta(effectiveModuleContext);
            const scopeModuleId = normalizeScopedModuleId(
                effectiveModuleContext?.moduleId
                || moduleAttributionMeta?.sentViaModuleId
                || ''
            );
            const scopedChatId = buildScopedChatId(relatedChatIdBase, scopeModuleId || '');
            const media = await mediaManager.processMessageMedia(msg, {
                tenantId: historyTenantId,
                moduleId: scopeModuleId || '',
                contactId: relatedChatIdBase,
                timestampUnix: Number(msg?.timestamp || 0) || null
            });
            const senderMeta = await resolveMessageSenderMeta(msg);
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            const order = extractOrderInfo(msg);
            const location = extractLocationInfo(msg);
            await this.persistMessageHistory(historyTenantId, {
                msg,
                senderMeta,
                fileMeta,
                order,
                location,
                quotedMessage,
                agentMeta,
                moduleContext: effectiveModuleContext
            });

            this.emitToRuntimeContext('message', {
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
                mediaData: media ? media.data : null,
                mimetype: media ? media.mimetype : null,
                filename: fileMeta.filename,
                fileSizeBytes: fileMeta.fileSizeBytes,
                mediaUrl: fileMeta.mediaUrl || null,
                mediaPath: fileMeta.mediaPath || null,
                ack: msg?.ack,
                type: msg?.type,
                author: msg?.author || msg?._data?.author || null,
                notifyName: senderMeta.notifyName,
                senderPhone: senderMeta.senderPhone,
                senderId: senderMeta.senderId,
                senderPushname: senderMeta.senderPushname,
                isGroupMessage: senderMeta.isGroupMessage,
                canEdit: false,
                order,
                location,
                quotedMessage,
                sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || null,
                sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || null,
                sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || null,
                sentViaTransport: moduleAttributionMeta?.sentViaTransport || null,
                sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || null,
                sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                ...(agentMeta || {})
            });

            try {
                if (isVisibleChatId(relatedChatIdBase)) {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatIdBase);
                    const summary = await this.toChatSummary(chat, {
                        includeHeavyMeta: false,
                        tenantId: historyTenantId,
                        scopeModuleId: String(effectiveModuleContext?.moduleId || '').trim().toLowerCase() || '',
                        scopeModuleName: String(effectiveModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(effectiveModuleContext?.imageUrl || effectiveModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(effectiveModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(effectiveModuleContext?.transportMode || '').trim().toLowerCase() || null
                    });
                    if (summary) this.emitToRuntimeContext('chat_updated', summary);
                }
            } catch (e) {
                // silent: message delivery should not fail by chat refresh issues
            }
        });

        waClient.on('message_sent', async (msg) => {
            if (isStatusOrSystemMessage(msg)) return;
            const historyTenantId = this.resolveHistoryTenantId();
            const runtimeModuleContext = this.resolveHistoryModuleContext();
            const relatedChatIdBase = String(msg?.to || msg?.from || '').trim();
            const messageId = getSerializedMessageId(msg);
            const agentMeta = msg?.fromMe ? mergeAgentMeta(getOutgoingAgentMeta(messageId)) : null;
            const effectiveModuleContext = buildEffectiveModuleContext(runtimeModuleContext, agentMeta);
            const moduleAttributionMeta = buildModuleAttributionMeta(effectiveModuleContext);
            const scopeModuleId = normalizeScopedModuleId(
                effectiveModuleContext?.moduleId
                || moduleAttributionMeta?.sentViaModuleId
                || ''
            );
            const scopedChatId = buildScopedChatId(relatedChatIdBase, scopeModuleId || '');
            const media = await mediaManager.processMessageMedia(msg, {
                tenantId: historyTenantId,
                moduleId: scopeModuleId || '',
                contactId: relatedChatIdBase,
                timestampUnix: Number(msg?.timestamp || 0) || null
            });
            const fileMeta = extractMessageFileMeta(msg, media);
            const quotedMessage = await extractQuotedMessageInfo(msg);
            const order = extractOrderInfo(msg);
            const location = extractLocationInfo(msg);
            await this.persistMessageHistory(historyTenantId, {
                msg,
                senderMeta: null,
                fileMeta,
                order,
                location,
                quotedMessage,
                agentMeta,
                moduleContext: effectiveModuleContext
            });
            this.emitToRuntimeContext('message', {
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
                author: msg?.author || msg?._data?.author || null,
                notifyName: null,
                senderPhone: null,
                senderId: null,
                senderPushname: null,
                isGroupMessage: String(msg?.to || msg?.from || '').includes('@g.us'),
                canEdit: false,
                order,
                location,
                quotedMessage,
                sentViaModuleId: moduleAttributionMeta?.sentViaModuleId || null,
                sentViaModuleName: moduleAttributionMeta?.sentViaModuleName || null,
                sentViaModuleImageUrl: moduleAttributionMeta?.sentViaModuleImageUrl || null,
                sentViaTransport: moduleAttributionMeta?.sentViaTransport || null,
                sentViaPhoneNumber: moduleAttributionMeta?.sentViaPhoneNumber || null,
                sentViaChannelType: moduleAttributionMeta?.sentViaChannelType || null,
                ...(agentMeta || {})
            });

            if (messageId) {
                this.emitMessageEditability(messageId, scopedChatId || relatedChatIdBase);
                this.scheduleEditabilityRefresh(messageId, scopedChatId || relatedChatIdBase);
            }

            try {
                if (isVisibleChatId(relatedChatIdBase)) {
                    this.invalidateChatListCache();
                    const chat = await waClient.client.getChatById(relatedChatIdBase);
                    const summary = await this.toChatSummary(chat, {
                        includeHeavyMeta: false,
                        tenantId: historyTenantId,
                        scopeModuleId: String(effectiveModuleContext?.moduleId || '').trim().toLowerCase() || '',
                        scopeModuleName: String(effectiveModuleContext?.name || '').trim() || null,
                        scopeModuleImageUrl: String(effectiveModuleContext?.imageUrl || effectiveModuleContext?.logoUrl || '').trim() || null,
                        scopeChannelType: String(effectiveModuleContext?.channelType || '').trim().toLowerCase() || null,
                        scopeTransport: String(effectiveModuleContext?.transportMode || '').trim().toLowerCase() || null
                    });
                    if (summary) this.emitToRuntimeContext('chat_updated', summary);
                }
            } catch (e) { }
        });

        waClient.on('message_edit', async ({ message, newBody, prevBody }) => {
            if (!message || isStatusOrSystemMessage(message)) return;
            const chatId = message.fromMe ? message.to : message.from;

            const messageId = getSerializedMessageId(message);
            if (!messageId) return;

            let canEdit = false;
            try {
                canEdit = await waClient.canEditMessageById(messageId);
            } catch (e) { }

            const editedAtMs = Number(message?.latestEditSenderTimestampMs || message?._data?.latestEditSenderTimestampMs || 0);
            const editedAt = editedAtMs > 0 ? Math.floor(editedAtMs / 1000) : Math.floor(Date.now() / 1000);
            await this.persistMessageEdit(this.resolveHistoryTenantId(), {
                messageId,
                chatId,
                body: String(newBody ?? message.body ?? ''),
                editedAtUnix: editedAt
            });

            if (!isVisibleChatId(chatId)) return;

            this.emitToRuntimeContext('message_edited', {
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
                this.invalidateChatListCache();
                const refreshedChat = await waClient.client.getChatById(chatId);
                const runtimeModuleContext = this.resolveHistoryModuleContext();
                const summary = await this.toChatSummary(refreshedChat, {
                    includeHeavyMeta: false,
                    tenantId: this.resolveHistoryTenantId(),
                    scopeModuleId: String(runtimeModuleContext?.moduleId || '').trim().toLowerCase() || '',
                    scopeModuleName: String(runtimeModuleContext?.name || '').trim() || null,
                    scopeModuleImageUrl: String(runtimeModuleContext?.imageUrl || runtimeModuleContext?.logoUrl || '').trim() || null,
                    scopeChannelType: String(runtimeModuleContext?.channelType || '').trim().toLowerCase() || null,
                    scopeTransport: String(runtimeModuleContext?.transportMode || '').trim().toLowerCase() || null
                });
                if (summary) this.emitToRuntimeContext('chat_updated', summary);
            } catch (e) { }
        });

        waClient.on('message_ack', async ({ message, ack }) => {
            const messageId = getSerializedMessageId(message);
            const baseChatId = String(message?.to || message?.from || '').trim();
            const isFromMe = Boolean(message?.fromMe);
            const runtimeModuleContext = this.resolveHistoryModuleContext();
            const scopeModuleId = normalizeScopedModuleId(runtimeModuleContext?.moduleId || '');
            const scopedChatId = buildScopedChatId(baseChatId, scopeModuleId || '');
            await this.persistMessageAck(this.resolveHistoryTenantId(), {
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

            this.emitToRuntimeContext('message_ack', {
                id: messageId,
                chatId: scopedChatId || baseChatId,
                baseChatId: baseChatId || null,
                scopeModuleId: scopeModuleId || null,
                ack: ack,
                canEdit
            });

            if (isFromMe && messageId) {
                this.scheduleEditabilityRefresh(messageId, scopedChatId || baseChatId, [900, 2600]);
            }
        });
    }
}


module.exports = SocketManager;








