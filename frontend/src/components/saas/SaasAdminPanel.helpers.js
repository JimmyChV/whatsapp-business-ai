// Helpers extraidos desde SaasAdminPanel para reducir tamano del modulo principal.

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const EMPTY_TENANT_FORM = {
    id: '',
    slug: '',
    name: '',
    plan: 'starter',
    active: true,
    logoUrl: '',
    coverImageUrl: ''
};

export const EMPTY_USER_FORM = {
    id: '',
    email: '',
    name: '',
    password: '',
    tenantId: '',
    role: 'seller',
    active: true,
    avatarUrl: '',
    permissionGrants: [],
    permissionPacks: []
};

export const EMPTY_CUSTOMER_FORM = {
    customerId: '',
    moduleId: '',
    contactName: '',
    phoneE164: '',
    phoneAlt: '',
    email: '',
    tagsText: '',
    profileFirstNames: '',
    profileLastNamePaternal: '',
    profileLastNameMaternal: '',
    profileDocumentNumber: '',
    profileNotes: '',
    isActive: true
};

export const EMPTY_SETTINGS = {
    catalogMode: 'hybrid',
    enabledModules: {
        aiPro: true,
        catalog: true,
        cart: true,
        quickReplies: true
    }
};
export const EMPTY_INTEGRATIONS_FORM = {
    catalogMode: 'hybrid',
    metaEnabled: true,
    wooEnabled: true,
    wooBaseUrl: '',
    wooPerPage: 100,
    wooMaxPages: 10,
    wooIncludeOutOfStock: true,
    wooConsumerKey: '',
    wooConsumerSecret: '',
    wooConsumerKeyMasked: '',
    wooConsumerSecretMasked: '',
    localEnabled: true,
    aiProvider: 'openai',
    aiModel: 'gpt-4o-mini',
    openaiApiKey: '',
    openaiApiKeyMasked: ''
};

export const EMPTY_TENANT_CATALOG_FORM = {
    catalogId: '',
    name: '',
    description: '',
    sourceType: 'local',
    isActive: true,
    isDefault: false,
    wooBaseUrl: '',
    wooPerPage: 100,
    wooMaxPages: 10,
    wooIncludeOutOfStock: true,
    wooConsumerKey: '',
    wooConsumerSecret: '',
    wooConsumerKeyMasked: '',
    wooConsumerSecretMasked: ''
};

export const EMPTY_CATALOG_PRODUCT_FORM = {
    productId: '',
    title: '',
    price: '',
    regularPrice: '',
    salePrice: '',
    description: '',
    imageUrl: '',
    sku: '',
    stockStatus: 'instock',
    stockQuantity: '',
    categoriesText: '',
    url: '',
    brand: '',
    isActive: true
};

export function normalizeCatalogProductItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const productId = String(source.id || source.productId || '').trim();
    if (!productId) return null;
    const categories = Array.isArray(source.categories)
        ? source.categories
        : String(source.category || '').split(',');
    const cleanCategories = categories
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
    const isActive = metadata?.isActive !== false && String(source.stockStatus || source.stock_status || '').trim().toLowerCase() !== 'outofstock';

    return {
        productId,
        title: String(source.title || source.name || '').trim() || productId,
        price: String(source.price || '').trim(),
        regularPrice: String(source.regularPrice || source.regular_price || '').trim(),
        salePrice: String(source.salePrice || source.sale_price || '').trim(),
        description: String(source.description || '').trim(),
        imageUrl: String(source.imageUrl || source.image || '').trim(),
        sku: String(source.sku || '').trim(),
        stockStatus: String(source.stockStatus || source.stock_status || '').trim().toLowerCase() || 'instock',
        stockQuantity: Number.isFinite(Number(source.stockQuantity)) ? String(source.stockQuantity) : '',
        categories: cleanCategories,
        categoriesText: cleanCategories.join(', '),
        url: String(source.url || source.permalink || source.productUrl || source.link || '').trim(),
        brand: String(source.brand || '').trim(),
        moduleId: String(source.moduleId || '').trim().toLowerCase(),
        catalogId: String(source.catalogId || '').trim().toUpperCase(),
        createdAt: String(source.createdAt || '').trim(),
        isActive
    };
}

export function buildCatalogProductFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return { ...EMPTY_CATALOG_PRODUCT_FORM };
    return {
        productId: String(item.productId || item.id || '').trim(),
        title: String(item.title || '').trim(),
        price: String(item.price || '').trim(),
        regularPrice: String(item.regularPrice || '').trim(),
        salePrice: String(item.salePrice || '').trim(),
        description: String(item.description || '').trim(),
        imageUrl: String(item.imageUrl || '').trim(),
        sku: String(item.sku || '').trim(),
        stockStatus: String(item.stockStatus || 'instock').trim().toLowerCase() || 'instock',
        stockQuantity: String(item.stockQuantity || '').trim(),
        categoriesText: String(item.categoriesText || '').trim(),
        url: String(item.url || '').trim(),
        brand: String(item.brand || '').trim(),
        isActive: item.isActive !== false
    };
}

export function buildCatalogProductPayload(form = {}, { moduleId = '', catalogId = '' } = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const categories = String(source.categoriesText || '')
        .split(',')
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    return {
        title: String(source.title || '').trim(),
        price: String(source.price || '').trim(),
        regularPrice: String(source.regularPrice || '').trim(),
        salePrice: String(source.salePrice || '').trim(),
        description: String(source.description || '').trim(),
        imageUrl: String(source.imageUrl || '').trim(),
        sku: String(source.sku || '').trim(),
        stockStatus: String(source.stockStatus || '').trim().toLowerCase(),
        stockQuantity: String(source.stockQuantity || '').trim(),
        categories,
        category: categories[0] || '',
        url: String(source.url || '').trim(),
        brand: String(source.brand || '').trim(),
        moduleId: String(moduleId || '').trim().toLowerCase(),
        catalogId: String(catalogId || '').trim().toUpperCase()
    };
}
export function normalizeCatalogIdsList(value = []) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    return source
        .map((entry) => String(entry || '').trim().toUpperCase())
        .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry))
        .filter((entry) => {
            if (seen.has(entry)) return false;
            seen.add(entry);
            return true;
        });
}

export function normalizeTenantCatalogItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const config = source?.config && typeof source.config === 'object' ? source.config : {};
    const woo = config?.woocommerce && typeof config.woocommerce === 'object' ? config.woocommerce : {};
    const catalogId = String(source.catalogId || source.id || '').trim().toUpperCase();
    if (!catalogId) return null;
    return {
        catalogId,
        name: String(source.name || catalogId).trim() || catalogId,
        description: String(source.description || '').trim() || '',
        sourceType: ['local', 'woocommerce', 'meta'].includes(String(source.sourceType || '').trim().toLowerCase())
            ? String(source.sourceType || '').trim().toLowerCase()
            : 'local',
        isDefault: source.isDefault === true,
        wooBaseUrl: String(woo.baseUrl || '').trim(),
        wooPerPage: Number(woo.perPage || 100) || 100,
        wooMaxPages: Number(woo.maxPages || 10) || 10,
        wooIncludeOutOfStock: woo.includeOutOfStock !== false,
        wooConsumerKeyMasked: String(woo.consumerKeyMasked || '').trim(),
        wooConsumerSecretMasked: String(woo.consumerSecretMasked || '').trim(),
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function buildTenantCatalogFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return EMPTY_TENANT_CATALOG_FORM;
    return {
        catalogId: String(item.catalogId || '').trim().toUpperCase(),
        name: String(item.name || '').trim(),
        description: String(item.description || '').trim(),
        sourceType: ['local', 'woocommerce', 'meta'].includes(String(item.sourceType || '').trim().toLowerCase())
            ? String(item.sourceType || '').trim().toLowerCase()
            : 'local',
        isActive: item.isActive !== false,
        isDefault: item.isDefault === true,
        wooBaseUrl: String(item.wooBaseUrl || '').trim(),
        wooPerPage: Number(item.wooPerPage || 100) || 100,
        wooMaxPages: Number(item.wooMaxPages || 10) || 10,
        wooIncludeOutOfStock: item.wooIncludeOutOfStock !== false,
        wooConsumerKey: '',
        wooConsumerSecret: '',
        wooConsumerKeyMasked: String(item.wooConsumerKeyMasked || '').trim(),
        wooConsumerSecretMasked: String(item.wooConsumerSecretMasked || '').trim()
    };
}

export function buildTenantCatalogPayload(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const payload = {
        catalogId: String(source.catalogId || '').trim().toUpperCase() || undefined,
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        sourceType: ['local', 'woocommerce', 'meta'].includes(String(source.sourceType || '').trim().toLowerCase())
            ? String(source.sourceType || '').trim().toLowerCase()
            : 'local',
        isDefault: source.isDefault === true,
        config: {
            woocommerce: {
                baseUrl: String(source.wooBaseUrl || '').trim() || null,
                perPage: Math.max(10, Math.min(500, Number(source.wooPerPage || 100) || 100)),
                maxPages: Math.max(1, Math.min(200, Number(source.wooMaxPages || 10) || 10)),
                includeOutOfStock: source.wooIncludeOutOfStock !== false
            }
        }
    };

    const consumerKey = String(source.wooConsumerKey || '').trim();
    const consumerSecret = String(source.wooConsumerSecret || '').trim();
    if (consumerKey) payload.config.woocommerce.consumerKey = consumerKey;
    if (consumerSecret) payload.config.woocommerce.consumerSecret = consumerSecret;

    return payload;
}
export const EMPTY_ACCESS_CATALOG = {
    permissions: [],
    packs: [],
    roleProfiles: [],
    actor: {
        assignableRoles: [],
        canEditOptionalAccess: false
    }
};

export function normalizeAccessCatalogPayload(payload = {}) {
    return {
        permissions: Array.isArray(payload?.permissions) ? payload.permissions : [],
        packs: Array.isArray(payload?.packs) ? payload.packs : [],
        roleProfiles: Array.isArray(payload?.roleProfiles) ? payload.roleProfiles : [],
        actor: payload?.actor && typeof payload.actor === 'object'
            ? payload.actor
            : { assignableRoles: [], canEditOptionalAccess: false }
    };
}
export const EMPTY_ROLE_FORM = {
    role: '',
    label: '',
    required: [],
    optional: [],
    blocked: [],
    active: true
};

export const PLAN_LIMIT_KEYS = [
    { key: 'maxUsers', label: 'Max usuarios', min: 1, max: 100000 },
    { key: 'maxWaModules', label: 'Max modulos WA', min: 1, max: 100000 },
    { key: 'maxCatalogs', label: 'Max catalogos', min: 1, max: 100000 },
    { key: 'maxCatalogItems', label: 'Max productos catalogo', min: 1, max: 1000000 },
    { key: 'maxMonthlyAiRequests', label: 'Max IA mensual', min: 1, max: 100000000 },
    { key: 'maxActiveSessions', label: 'Max sesiones activas', min: 1, max: 100000 },
    { key: 'quickReplyMaxUploadMb', label: 'Max MB por archivo rapido', min: 1, max: 1024 },
    { key: 'quickReplyStorageQuotaMb', label: 'Cuota MB respuestas rapidas', min: 10, max: 200000 }
];

export const PLAN_FEATURE_KEYS = [
    { key: 'aiPro', label: 'IA Pro' },
    { key: 'catalog', label: 'Catalogo' },
    { key: 'cart', label: 'Carrito' },
    { key: 'quickReplies', label: 'Respuestas rapidas' },
    { key: 'audit', label: 'Auditoria' },
    { key: 'opsPanel', label: 'Panel Ops' }
];

export const EMPTY_WA_MODULE_FORM = {
    moduleId: '',
    name: '',
    phoneNumber: '',
    transportMode: 'cloud',
    imageUrl: '',
    assignedUserIds: [],
    catalogIds: [],
    aiAssistantId: '',
    moduleCatalogMode: 'inherit',
    moduleAiEnabled: true,
    moduleCatalogEnabled: true,
    moduleCartEnabled: true,
    moduleQuickRepliesEnabled: true,
    cloudAppId: '',
    cloudWabaId: '',
    cloudPhoneNumberId: '',
    cloudVerifyToken: '',
    cloudGraphVersion: 'v22.0',
    cloudDisplayPhoneNumber: '',
    cloudBusinessName: '',
    cloudAppSecret: '',
    cloudSystemUserToken: '',
    cloudAppSecretMasked: '',
    cloudSystemUserTokenMasked: '',
    cloudEnforceSignature: true
};


export const EMPTY_AI_ASSISTANT_FORM = {
    assistantId: '',
    name: '',
    description: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    systemPrompt: '',
    temperature: '0.7',
    topP: '1',
    maxTokens: '800',
    openaiApiKey: '',
    openAiApiKeyMasked: '',
    isActive: true,
    isDefault: false
};
export const BASE_ROLE_OPTIONS = ['owner', 'admin', 'seller'];
export const PLAN_OPTIONS = ['starter', 'pro', 'enterprise'];
export const CATALOG_MODE_OPTIONS = ['hybrid', 'meta_only', 'woo_only', 'local_only'];
export const MODULE_KEYS = [
    { key: 'aiPro', label: 'IA Pro' },
    { key: 'catalog', label: 'Catalogo' },
    { key: 'cart', label: 'Carrito' },
    { key: 'quickReplies', label: 'Respuestas rapidas' }
];
export const ADMIN_NAV_ITEMS = [
    { id: 'saas_resumen', label: 'Resumen' },
    { id: 'saas_planes', label: 'Planes' },
    { id: 'saas_empresas', label: 'Empresas' },
    { id: 'saas_usuarios', label: 'Usuarios' },
    { id: 'saas_roles', label: 'Roles' },
    { id: 'saas_clientes', label: 'Clientes' },
    { id: 'saas_ia', label: 'IA' },
    { id: 'saas_etiquetas', label: 'Etiquetas' },
    { id: 'saas_quick_replies', label: 'Respuestas rapidas' },
    { id: 'saas_modulos', label: 'Modulos' },
    { id: 'saas_catalogos', label: 'Catalogos' },
    { id: 'saas_config', label: 'Configuracion' }
];
export const AI_PROVIDER_OPTIONS = ['openai'];
export const AI_MODEL_OPTIONS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'];
export const LAVITAT_FIRST_ASSISTANT_SYSTEM_PROMPT = `Eres el copiloto comercial interno de Lavitat (Peru). Tu interlocutor es la vendedora, no el cliente final.

Objetivo:
- ayudar a vender mejor con criterio comercial
- sugerir respuestas listas para WhatsApp
- recomendar productos reales del catalogo activo
- proponer upsell/cross-sell con naturalidad
- generar cotizaciones claras cuando se solicite

Reglas innegociables:
- usa solo datos reales del sistema (tenant, modulo, catalogo, carrito, chat)
- no inventes productos, precios, descuentos, stock, presentaciones o aromas
- no mezcles informacion entre tenants
- si falta un dato clave, dilo de forma ejecutiva y sugiere como validar antes de enviar

Tono Lavitat:
- amigable, claro, experto, seguro, calido y elegante
- evita tono suplicante, vulgar, agresivo o improvisado
- comunica valor (calidad, rendimiento, cuidado de tejidos/superficies, servicio)

Cuando corresponda, resalta:
- detergente concentrado: formula enzimatica y cuidado de tejidos
- linea delicada: hipoalergenica, ideal para bebes/piel sensible/lenceria
- limpiador desinfectante: limpia + desinfecta + aromatiza
- quitasarro gel: mejor rendimiento por aplicacion

Formato recomendado para copiloto:
1) 3 respuestas sugeridas (listas para copiar)
2) recomendacion comercial (producto principal + complemento + motivo)
3) cierre sugerido
4) 3 cotizaciones separadas si aplica`;
export const ROLE_PRIORITY = Object.freeze({
    seller: 1,
    admin: 2,
    owner: 3,
    superadmin: 4
});
export const PERMISSION_OWNER_ASSIGN = 'tenant.users.owner.assign';
export const PERMISSION_PLATFORM_OVERVIEW_READ = 'platform.overview.read';
export const PERMISSION_PLATFORM_TENANTS_MANAGE = 'platform.tenants.manage';
export const PERMISSION_PLATFORM_PLANS_MANAGE = 'platform.plans.manage';
export const PERMISSION_TENANT_OVERVIEW_READ = 'tenant.overview.read';
export const PERMISSION_TENANT_USERS_MANAGE = 'tenant.users.manage';
export const PERMISSION_TENANT_SETTINGS_READ = 'tenant.settings.read';
export const PERMISSION_TENANT_SETTINGS_MANAGE = 'tenant.settings.manage';
export const PERMISSION_TENANT_INTEGRATIONS_READ = 'tenant.integrations.read';
export const PERMISSION_TENANT_INTEGRATIONS_MANAGE = 'tenant.integrations.manage';
export const PERMISSION_TENANT_MODULES_READ = 'tenant.modules.read';
export const PERMISSION_TENANT_MODULES_MANAGE = 'tenant.modules.manage';
export const PERMISSION_TENANT_QUICK_REPLIES_READ = 'tenant.quick_replies.read';
export const PERMISSION_TENANT_QUICK_REPLIES_MANAGE = 'tenant.quick_replies.manage';
export const PERMISSION_TENANT_LABELS_READ = 'tenant.labels.read';
export const PERMISSION_TENANT_LABELS_MANAGE = 'tenant.labels.manage';
export const PERMISSION_TENANT_AI_READ = 'tenant.ai.read';
export const PERMISSION_TENANT_AI_MANAGE = 'tenant.ai.manage';
export const PERMISSION_TENANT_CUSTOMERS_READ = 'tenant.customers.read';
export const PERMISSION_TENANT_CUSTOMERS_MANAGE = 'tenant.customers.manage';
export const PERMISSION_TENANT_CATALOGS_MANAGE = 'tenant.catalogs.manage';
export const ADMIN_IMAGE_MAX_BYTES = Math.max(200 * 1024, Number(import.meta.env.VITE_ADMIN_ASSET_MAX_BYTES || 2 * 1024 * 1024));
export const ADMIN_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ADMIN_IMAGE_ALLOWED_EXTENSIONS_LABEL = '.jpg, .jpeg, .png, .webp';
export const QUICK_REPLY_ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'audio/mpeg',
    'audio/ogg',
    'video/mp4'
];
export const QUICK_REPLY_ALLOWED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.txt', '.csv', '.doc', '.docx',
    '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.mp3', '.ogg', '.mp4'
];
export const QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL = '.jpg, .jpeg, .png, .webp, .gif, .pdf, .txt, .csv, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .zip, .mp3, .ogg, .mp4';
export const QUICK_REPLY_ACCEPT_VALUE = `${QUICK_REPLY_ALLOWED_MIME_TYPES.join(',')},${QUICK_REPLY_ALLOWED_EXTENSIONS.join(',')}`;
export const QUICK_REPLY_EXT_TO_MIME = Object.freeze({
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4'
});
export const QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB = 50;
export const QUICK_REPLY_DEFAULT_STORAGE_MB = 500;
export const EMPTY_QUICK_REPLY_LIBRARY_FORM = {
    libraryId: '',
    name: '',
    description: '',
    isShared: false,
    isActive: true,
    sortOrder: '100',
    moduleIds: []
};
export const EMPTY_QUICK_REPLY_ITEM_FORM = {
    itemId: '',
    libraryId: '',
    label: '',
    text: '',
    mediaUrl: '',
    mediaMimeType: '',
    mediaFileName: '',
    mediaAssets: [],
    isActive: true,
    sortOrder: '100'
};
export const DEFAULT_LABEL_COLORS = ['#00A884', '#25D366', '#34B7F1', '#FFB02E', '#FF5C5C', '#9C6BFF', '#7D8D95'];
export const EMPTY_LABEL_FORM = {
    labelId: '',
    name: '',
    description: '',
    color: '#00A884',
    sortOrder: '100',
    isActive: true,
    moduleIds: []
};

export function normalizeQuickReplyLibraryItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const libraryId = String(source.libraryId || source.id || '').trim().toUpperCase();
    if (!libraryId) return null;
    const moduleIds = Array.isArray(source.moduleIds)
        ? source.moduleIds
            .map((entry) => String(entry || '').trim().toLowerCase())
            .filter(Boolean)
        : [];
    return {
        libraryId,
        name: String(source.libraryName || source.name || libraryId).trim() || libraryId,
        description: String(source.description || '').trim(),
        isShared: source.isShared === true,
        isActive: source.isActive !== false,
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 100,
        moduleIds,
        metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function normalizeQuickReplyItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const itemId = String(source.itemId || source.id || '').trim().toUpperCase();
    if (!itemId) return null;
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? source.metadata : {};
    const mediaAssets = normalizeQuickReplyMediaAssets(source.mediaAssets || metadata.mediaAssets, {
        url: source.mediaUrl,
        mimeType: source.mediaMimeType,
        fileName: source.mediaFileName,
        sizeBytes: source.mediaSizeBytes
    });
    const primaryMedia = mediaAssets[0] || null;
    return {
        itemId,
        libraryId: String(source.libraryId || '').trim().toUpperCase(),
        label: String(source.label || itemId).trim() || itemId,
        text: String(source.text || '').trim(),
        mediaAssets,
        mediaUrl: String(primaryMedia?.url || source.mediaUrl || '').trim(),
        mediaMimeType: String(primaryMedia?.mimeType || source.mediaMimeType || '').trim().toLowerCase(),
        mediaFileName: String(primaryMedia?.fileName || source.mediaFileName || '').trim(),
        mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes)) ? Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes) : null,
        isActive: source.isActive !== false,
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 100,
        metadata,
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function normalizeQuickReplyMediaAsset(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const url = String(source.url || source.mediaUrl || '').trim();
    if (!url) return null;
    const mimeType = String(source.mimeType || source.mediaMimeType || '').trim().toLowerCase() || null;
    const fileName = String(source.fileName || source.mediaFileName || source.file || '').trim() || null;
    const sizeRaw = Number(source.sizeBytes ?? source.mediaSizeBytes);
    const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : null;
    return {
        url,
        mimeType,
        fileName,
        sizeBytes
    };
}

export function normalizeQuickReplyMediaAssets(value = [], fallback = null) {
    const source = Array.isArray(value) ? value : [];
    const dedupe = new Set();
    const assets = source
        .map((entry) => normalizeQuickReplyMediaAsset(entry))
        .filter(Boolean)
        .filter((entry) => {
            const key = `${String(entry.url || '').trim()}|${String(entry.fileName || '').trim()}|${String(entry.mimeType || '').trim()}`;
            if (!key || dedupe.has(key)) return false;
            dedupe.add(key);
            return true;
        });
    if (assets.length > 0) return assets;
    const fallbackAsset = normalizeQuickReplyMediaAsset(fallback);
    return fallbackAsset ? [fallbackAsset] : [];
}

export function resolveQuickReplyAssetPreviewUrl(rawUrl = '') {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    if (value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${API_BASE}${value}`;
    return `${API_BASE}/${value.replace(/^\/+/, '')}`;
}

export function isQuickReplyImageAsset(asset = {}) {
    const mimeType = String(asset?.mimeType || '').trim().toLowerCase();
    if (mimeType.startsWith('image/')) return true;
    const fileName = String(asset?.fileName || '').trim().toLowerCase();
    return /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(fileName);
}

export function getQuickReplyAssetTypeLabel(asset = {}) {
    const mimeType = String(asset?.mimeType || '').trim().toLowerCase();
    if (!mimeType) return 'archivo';
    if (mimeType.startsWith('image/')) return 'imagen';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word')) return 'doc';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'xls';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'ppt';
    if (mimeType.startsWith('text/')) return 'texto';
    return mimeType;
}

export function getQuickReplyAssetDisplayName(asset = {}, index = 0) {
    const fileName = String(asset?.fileName || '').trim();
    if (fileName) return fileName;
    const typeLabel = getQuickReplyAssetTypeLabel(asset);
    return `Adjunto ${index + 1}${typeLabel ? ` (${typeLabel})` : ''}`;
}

export function buildQuickReplyLibraryPayload(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    return {
        libraryId: String(source.libraryId || '').trim().toUpperCase() || undefined,
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        isShared: source.isShared === true,
        isActive: source.isActive !== false,
        sortOrder: Math.max(0, Math.min(9999, Number(source.sortOrder || 100) || 100)),
        moduleIds: Array.isArray(source.moduleIds)
            ? source.moduleIds.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
            : []
    };
}

export function buildQuickReplyItemPayload(form = {}, { libraryId = '' } = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const mediaAssets = normalizeQuickReplyMediaAssets(source.mediaAssets, {
        url: source.mediaUrl,
        mimeType: source.mediaMimeType,
        fileName: source.mediaFileName,
        sizeBytes: source.mediaSizeBytes
    });
    const primaryMedia = mediaAssets[0] || null;
    return {
        itemId: String(source.itemId || '').trim().toUpperCase() || undefined,
        libraryId: String(source.libraryId || libraryId || '').trim().toUpperCase(),
        label: String(source.label || '').trim(),
        text: String(source.text || '').trim(),
        mediaAssets,
        mediaUrl: String(primaryMedia?.url || source.mediaUrl || '').trim() || null,
        mediaMimeType: String(primaryMedia?.mimeType || source.mediaMimeType || '').trim().toLowerCase() || null,
        mediaFileName: String(primaryMedia?.fileName || source.mediaFileName || '').trim() || null,
        mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes)) ? Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes) : null,
        isActive: source.isActive !== false,
        sortOrder: Math.max(0, Math.min(9999, Number(source.sortOrder || 100) || 100))
    };
}

export function normalizeTenantLabelColor(value = '', fallback = '#00A884') {
    const raw = String(value || '').trim().toUpperCase();
    if (/^#([0-9A-F]{6})$/.test(raw)) return raw;
    if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
    const fallbackRaw = String(fallback || '#00A884').trim().toUpperCase();
    if (/^#([0-9A-F]{6})$/.test(fallbackRaw)) return fallbackRaw;
    return '#00A884';
}

export function normalizeTenantLabelItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const labelId = String(source.labelId || source.id || '').trim().toUpperCase();
    if (!labelId) return null;
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? source.metadata
        : {};
    const moduleIds = Array.isArray(source.moduleIds)
        ? source.moduleIds
        : (Array.isArray(metadata.moduleIds) ? metadata.moduleIds : []);
    const normalizedModuleIds = Array.from(new Set(moduleIds
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)));

    return {
        labelId,
        name: String(source.name || labelId).trim() || labelId,
        description: String(source.description || '').trim(),
        color: normalizeTenantLabelColor(source.color || source.hex || '', DEFAULT_LABEL_COLORS[0]),
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 100,
        isActive: source.isActive !== false,
        moduleIds: normalizedModuleIds,
        metadata,
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function buildLabelFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return { ...EMPTY_LABEL_FORM };
    const normalized = normalizeTenantLabelItem(item);
    if (!normalized) return { ...EMPTY_LABEL_FORM };
    return {
        labelId: normalized.labelId,
        name: normalized.name || '',
        description: normalized.description || '',
        color: normalizeTenantLabelColor(normalized.color || '', DEFAULT_LABEL_COLORS[0]),
        sortOrder: String(normalized.sortOrder || 100),
        isActive: normalized.isActive !== false,
        moduleIds: Array.isArray(normalized.moduleIds) ? [...normalized.moduleIds] : []
    };
}

export function buildTenantLabelPayload(form = {}, { allowLabelId = true } = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const payload = {
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        color: normalizeTenantLabelColor(source.color || '', DEFAULT_LABEL_COLORS[0]),
        sortOrder: Math.max(1, Math.min(9999, Number(source.sortOrder || 100) || 100)),
        isActive: source.isActive !== false,
        metadata: {
            moduleIds: Array.isArray(source.moduleIds)
                ? Array.from(new Set(source.moduleIds
                    .map((entry) => String(entry || '').trim().toLowerCase())
                    .filter(Boolean)))
                : []
        }
    };

    if (allowLabelId) {
        const labelId = String(source.labelId || source.id || '').trim().toUpperCase();
        if (labelId) payload.labelId = labelId;
    }

    return payload;
}

export function normalizeOverview(payload = {}) {
    return {
        tenants: Array.isArray(payload?.tenants) ? payload.tenants : [],
        users: Array.isArray(payload?.users) ? payload.users : [],
        metrics: Array.isArray(payload?.metrics) ? payload.metrics : [],
        aiUsage: Array.isArray(payload?.aiUsage) ? payload.aiUsage : []
    };
}

export function sanitizeMemberships(memberships = []) {
    return (Array.isArray(memberships) ? memberships : [])
        .map((entry) => ({
            tenantId: String(entry?.tenantId || '').trim(),
            role: String(entry?.role || '').trim().toLowerCase() || 'seller',
            active: entry?.active !== false
        }))
        .filter((entry) => entry.tenantId);
}

export function resolvePrimaryRoleFromMemberships(memberships = [], fallbackRole = 'seller') {
    const source = Array.isArray(memberships) ? memberships : [];
    const activeMembership = source.find((item) => item?.active !== false) || source[0] || null;
    const candidate = String(activeMembership?.role || fallbackRole || 'seller').trim().toLowerCase();
    return candidate || 'seller';
}

export function getRolePriority(role = 'seller') {
    const cleanRole = String(role || '').trim().toLowerCase();
    return ROLE_PRIORITY[cleanRole] || ROLE_PRIORITY.seller;
}

export function normalizeWaModule(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const moduleId = String(source.moduleId || source.id || '').trim();
    if (!moduleId) return null;

    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? source.metadata
        : {};
    const cloudConfig = metadata.cloudConfig && typeof metadata.cloudConfig === 'object' && !Array.isArray(metadata.cloudConfig)
        ? metadata.cloudConfig
        : {};
    const moduleSettings = metadata.moduleSettings && typeof metadata.moduleSettings === 'object' && !Array.isArray(metadata.moduleSettings)
        ? metadata.moduleSettings
        : {};

    return {
        moduleId,
        name: String(source.name || moduleId).trim() || moduleId,
        phoneNumber: String(source.phoneNumber || '').trim() || '',
        transportMode: 'cloud',
        imageUrl: String(source.imageUrl || '').trim() || '',
        isDefault: source.isDefault === true,
        isSelected: source.isSelected === true,
        assignedUserIds: Array.isArray(source.assignedUserIds)
            ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [],
        catalogIds: Array.isArray(moduleSettings.catalogIds)
            ? moduleSettings.catalogIds.map((entry) => String(entry || '').trim().toUpperCase()).filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry))
            : [],
        moduleAiAssistantId: sanitizeAiAssistantCode(moduleSettings.aiAssistantId),
        moduleCatalogMode: CATALOG_MODE_OPTIONS.includes(String(moduleSettings.catalogMode || '').trim())
            ? String(moduleSettings.catalogMode || '').trim()
            : 'inherit',
        moduleFeatureFlags: {
            aiPro: moduleSettings?.enabledModules?.aiPro !== false,
            catalog: moduleSettings?.enabledModules?.catalog !== false,
            cart: moduleSettings?.enabledModules?.cart !== false,
            quickReplies: moduleSettings?.enabledModules?.quickReplies !== false
        },
        metadata,
        cloudConfig: {
            appId: String(cloudConfig.appId || '').trim(),
            wabaId: String(cloudConfig.wabaId || '').trim(),
            phoneNumberId: String(cloudConfig.phoneNumberId || '').trim(),
            verifyToken: String(cloudConfig.verifyToken || '').trim(),
            graphVersion: String(cloudConfig.graphVersion || '').trim(),
            displayPhoneNumber: String(cloudConfig.displayPhoneNumber || '').trim(),
            businessName: String(cloudConfig.businessName || '').trim(),
            appSecretMasked: String(cloudConfig.appSecretMasked || '').trim(),
            systemUserTokenMasked: String(cloudConfig.systemUserTokenMasked || '').trim(),
            enforceSignature: cloudConfig.enforceSignature !== false
        }
    };
}


export function sanitizeAiAssistantCode(value = '') {
    const clean = String(value || '').trim().toUpperCase();
    return /^AIA-[A-Z0-9]{6}$/.test(clean) ? clean : '';
}

export function normalizeTenantAiAssistantItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const assistantId = sanitizeAiAssistantCode(source.assistantId || source.id || '');
    if (!assistantId) return null;
    return {
        assistantId,
        name: String(source.name || assistantId).trim() || assistantId,
        description: String(source.description || '').trim(),
        provider: String(source.provider || 'openai').trim().toLowerCase() || 'openai',
        model: String(source.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        systemPrompt: String(source.systemPrompt || '').trim(),
        temperature: String(source.temperature ?? '0.7').trim() || '0.7',
        topP: String(source.topP ?? '1').trim() || '1',
        maxTokens: String(source.maxTokens ?? '800').trim() || '800',
        hasOpenAiApiKey: source.hasOpenAiApiKey === true,
        openAiApiKeyMasked: String(source.openAiApiKeyMasked || '').trim(),
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function buildAiAssistantFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return { ...EMPTY_AI_ASSISTANT_FORM };
    return {
        assistantId: sanitizeAiAssistantCode(item.assistantId || item.id || ''),
        name: String(item.name || '').trim(),
        description: String(item.description || '').trim(),
        provider: String(item.provider || 'openai').trim().toLowerCase() || 'openai',
        model: String(item.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        systemPrompt: String(item.systemPrompt || '').trim(),
        temperature: String(item.temperature ?? '0.7').trim() || '0.7',
        topP: String(item.topP ?? '1').trim() || '1',
        maxTokens: String(item.maxTokens ?? '800').trim() || '800',
        openaiApiKey: '',
        openAiApiKeyMasked: String(item.openAiApiKeyMasked || '').trim(),
        isActive: item.isActive !== false,
        isDefault: item.isDefault === true
    };
}

export function buildLavitatAssistantPreset(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const modelCandidate = String(source.model || '').trim();
    const safeModel = AI_MODEL_OPTIONS.includes(modelCandidate) ? modelCandidate : 'gpt-4o-mini';
    return {
        ...source,
        name: String(source.name || '').trim() || 'Asistente Comercial Lavitat',
        description: String(source.description || '').trim() || 'Copiloto interno de ventas para Lavitat. Sugiere respuestas, recomendaciones y cotizaciones desde contexto real del tenant.',
        provider: 'openai',
        model: safeModel,
        systemPrompt: LAVITAT_FIRST_ASSISTANT_SYSTEM_PROMPT,
        temperature: '0.45',
        topP: '0.95',
        maxTokens: '1200',
        isActive: source.isActive !== false
    };
}
export function buildAiAssistantPayload(form = {}, { allowAssistantId = true } = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const payload = {
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        provider: AI_PROVIDER_OPTIONS.includes(String(source.provider || '').trim().toLowerCase())
            ? String(source.provider || '').trim().toLowerCase()
            : 'openai',
        model: String(source.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        systemPrompt: String(source.systemPrompt || '').trim() || null,
        temperature: Math.max(0, Math.min(2, Number(source.temperature ?? 0.7) || 0.7)),
        topP: Math.max(0, Math.min(1, Number(source.topP ?? 1) || 1)),
        maxTokens: Math.max(64, Math.min(4096, Number(source.maxTokens ?? 800) || 800)),
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true
    };

    const openaiApiKey = String(source.openaiApiKey || '').trim();
    if (openaiApiKey) payload.openaiApiKey = openaiApiKey;

    if (allowAssistantId) {
        const cleanAssistantId = sanitizeAiAssistantCode(source.assistantId || source.id || '');
        if (cleanAssistantId) payload.assistantId = cleanAssistantId;
    }

    return payload;
}
export function normalizeIntegrationsPayload(integrations = {}) {
    const source = integrations && typeof integrations === 'object' ? integrations : {};
    const catalog = source.catalog && typeof source.catalog === 'object' ? source.catalog : {};
    const providers = catalog.providers && typeof catalog.providers === 'object' ? catalog.providers : {};
    const woo = providers.woocommerce && typeof providers.woocommerce === 'object' ? providers.woocommerce : {};
    const ai = source.ai && typeof source.ai === 'object' ? source.ai : {};

    return {
        catalogMode: CATALOG_MODE_OPTIONS.includes(String(catalog.mode || '').trim())
            ? String(catalog.mode || '').trim()
            : 'hybrid',
        metaEnabled: providers?.meta?.enabled !== false,
        wooEnabled: woo.enabled !== false,
        wooBaseUrl: String(woo.baseUrl || '').trim(),
        wooPerPage: Number(woo.perPage || 100) || 100,
        wooMaxPages: Number(woo.maxPages || 10) || 10,
        wooIncludeOutOfStock: woo.includeOutOfStock !== false,
        wooConsumerKey: '',
        wooConsumerSecret: '',
        wooConsumerKeyMasked: String(woo.consumerKeyMasked || '').trim(),
        wooConsumerSecretMasked: String(woo.consumerSecretMasked || '').trim(),
        localEnabled: providers?.local?.enabled !== false,
        aiProvider: String(ai.provider || 'openai').trim() || 'openai',
        aiModel: String(ai.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        openaiApiKey: '',
        openaiApiKeyMasked: String(ai.openAiApiKeyMasked || '').trim()
    };
}

export function buildIntegrationsUpdatePayload(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const payload = {
        catalog: {
            mode: CATALOG_MODE_OPTIONS.includes(String(source.catalogMode || '').trim())
                ? String(source.catalogMode || '').trim()
                : 'hybrid',
            providers: {
                meta: {
                    enabled: source.metaEnabled !== false
                },
                woocommerce: {
                    enabled: source.wooEnabled !== false,
                    baseUrl: String(source.wooBaseUrl || '').trim() || null,
                    perPage: Math.max(10, Math.min(500, Number(source.wooPerPage || 100) || 100)),
                    maxPages: Math.max(1, Math.min(200, Number(source.wooMaxPages || 10) || 10)),
                    includeOutOfStock: source.wooIncludeOutOfStock !== false
                },
                local: {
                    enabled: source.localEnabled !== false
                }
            }
        },
        ai: {
            provider: String(source.aiProvider || 'openai').trim() || 'openai',
            model: String(source.aiModel || 'gpt-4o-mini').trim() || 'gpt-4o-mini'
        }
    };

    const wooConsumerKey = String(source.wooConsumerKey || '').trim();
    const wooConsumerSecret = String(source.wooConsumerSecret || '').trim();
    const openaiApiKey = String(source.openaiApiKey || '').trim();

    if (wooConsumerKey) payload.catalog.providers.woocommerce.consumerKey = wooConsumerKey;
    if (wooConsumerSecret) payload.catalog.providers.woocommerce.consumerSecret = wooConsumerSecret;
    if (openaiApiKey) payload.ai.openaiApiKey = openaiApiKey;

    return payload;
}

export function normalizePlanForm(planId = 'starter', limits = {}) {
    const source = limits && typeof limits === 'object' ? limits : {};
    const features = source.features && typeof source.features === 'object' ? source.features : {};

    const base = {
        id: String(planId || 'starter').trim().toLowerCase() || 'starter',
        features: {}
    };

    PLAN_LIMIT_KEYS.forEach((entry) => {
        const value = Number(source?.[entry.key]);
        const fallbackMap = {
            maxMonthlyAiRequests: 500,
            quickReplyMaxUploadMb: QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB,
            quickReplyStorageQuotaMb: QUICK_REPLY_DEFAULT_STORAGE_MB
        };
        const fallback = fallbackMap[entry.key] || 1;
        base[entry.key] = Number.isFinite(value) && value > 0
            ? Math.floor(value)
            : fallback;
    });

    PLAN_FEATURE_KEYS.forEach((entry) => {
        base.features[entry.key] = features?.[entry.key] !== false;
    });

    return base;
}
export function normalizeRoleProfileItem(item = {}) {
    const role = String(item?.role || '').trim().toLowerCase();
    if (!role) return null;
    return {
        role,
        label: String(item?.label || role).trim() || role,
        required: Array.isArray(item?.required) ? item.required : [],
        optional: Array.isArray(item?.optional) ? item.optional : [],
        blocked: Array.isArray(item?.blocked) ? item.blocked : [],
        active: item?.active !== false,
        isSystem: item?.isSystem === true
    };
}

export function buildRoleFormFromItem(item = null) {
    const profile = normalizeRoleProfileItem(item);
    if (!profile) return EMPTY_ROLE_FORM;
    return {
        role: profile.role,
        label: profile.label,
        required: [...profile.required],
        optional: [...profile.optional],
        blocked: [...profile.blocked],
        active: profile.active !== false
    };
}

export function sanitizeRoleCode(value = '') {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
export function buildTenantFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return EMPTY_TENANT_FORM;
    return {
        id: String(item.id || '').trim(),
        slug: String(item.slug || '').trim(),
        name: String(item.name || '').trim(),
        plan: PLAN_OPTIONS.includes(String(item.plan || '').trim().toLowerCase())
            ? String(item.plan || '').trim().toLowerCase()
            : 'starter',
        active: item.active !== false,
        logoUrl: String(item.logoUrl || '').trim(),
        coverImageUrl: String(item.coverImageUrl || '').trim()
    };
}

export function buildUserFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return EMPTY_USER_FORM;
    const memberships = sanitizeMemberships(item.memberships || []);
    const primaryMembership = memberships[0] || { tenantId: '', role: 'seller' };
    const primaryRole = String(primaryMembership.role || '').trim().toLowerCase() || 'seller';

    return {
        id: String(item.id || '').trim(),
        email: String(item.email || '').trim(),
        name: String(item.name || '').trim(),
        password: '',
        tenantId: String(primaryMembership.tenantId || '').trim(),
        role: primaryRole,
        active: item.active !== false,
        avatarUrl: String(item.avatarUrl || '').trim(),
        permissionGrants: Array.isArray(item.permissionGrants) ? item.permissionGrants : [],
        permissionPacks: Array.isArray(item.permissionPacks) ? item.permissionPacks : []
    };
}

export function normalizeCustomerFormFromItem(item = null) {
    if (!item || typeof item !== 'object') return EMPTY_CUSTOMER_FORM;
    const profile = item.profile && typeof item.profile === 'object' ? item.profile : {};
    return {
        customerId: String(item.customerId || '').trim(),
        moduleId: String(item.moduleId || '').trim(),
        contactName: String(item.contactName || '').trim(),
        phoneE164: String(item.phoneE164 || '').trim(),
        phoneAlt: String(item.phoneAlt || '').trim(),
        email: String(item.email || '').trim(),
        tagsText: Array.isArray(item.tags) ? item.tags.join(', ') : String(item.tags || '').trim(),
        profileFirstNames: String(profile.firstNames || '').trim(),
        profileLastNamePaternal: String(profile.lastNamePaternal || '').trim(),
        profileLastNameMaternal: String(profile.lastNameMaternal || '').trim(),
        profileDocumentNumber: String(profile.documentNumber || '').trim(),
        profileNotes: String(profile.notes || '').trim(),
        isActive: item.isActive !== false
    };
}

export function buildCustomerPayloadFromForm(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const tags = String(source.tagsText || '')
        .split(/[;,|\n]/g)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    return {
        customerId: String(source.customerId || '').trim() || undefined,
        moduleId: String(source.moduleId || '').trim() || null,
        contactName: String(source.contactName || '').trim() || null,
        phoneE164: String(source.phoneE164 || '').trim() || null,
        phoneAlt: String(source.phoneAlt || '').trim() || null,
        email: String(source.email || '').trim().toLowerCase() || null,
        tags,
        profile: {
            firstNames: String(source.profileFirstNames || '').trim() || null,
            lastNamePaternal: String(source.profileLastNamePaternal || '').trim() || null,
            lastNameMaternal: String(source.profileLastNameMaternal || '').trim() || null,
            documentNumber: String(source.profileDocumentNumber || '').trim() || null,
            notes: String(source.profileNotes || '').trim() || null
        },
        isActive: source.isActive !== false
    };
}

export function formatDateTimeLabel(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString('es-PE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
export function toTenantDisplayName(tenant = {}) {
    return String(tenant?.name || tenant?.slug || 'Empresa sin nombre').trim() || 'Empresa sin nombre';
}

export function toUserDisplayName(user = {}) {
    const name = String(user?.name || '').trim();
    const email = String(user?.email || '').trim();
    return name || email || 'Usuario sin nombre';
}
export function buildInitials(label = '') {
    const source = String(label || '').trim();
    if (!source) return 'NA';
    const chunks = source.split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = chunks.map((chunk) => String(chunk[0] || '').toUpperCase()).join('');
    return initials || 'NA';
}

export function formatBytes(bytes = 0) {
    const safeValue = Number(bytes || 0);
    if (!Number.isFinite(safeValue) || safeValue <= 0) return '0 B';
    if (safeValue >= 1024 * 1024) return `${(safeValue / (1024 * 1024)).toFixed(1)} MB`;
    if (safeValue >= 1024) return `${Math.round(safeValue / 1024)} KB`;
    return `${Math.round(safeValue)} B`;
}

export function chunkItems(items = [], size = 2) {
    const source = Array.isArray(items) ? items : [];
    const chunkSize = Math.max(1, Number(size || 1));
    const chunks = [];
    for (let idx = 0; idx < source.length; idx += chunkSize) {
        chunks.push(source.slice(idx, idx + chunkSize));
    }
    return chunks;
}

export function validateImageFile(file = null) {
    if (!file) return 'Selecciona una imagen valida.';
    const mimeType = String(file.type || '').trim().toLowerCase();
    if (!ADMIN_IMAGE_ALLOWED_MIME_TYPES.includes(mimeType)) {
        return `Formato no permitido. Usa ${ADMIN_IMAGE_ALLOWED_EXTENSIONS_LABEL}.`;
    }
    if (Number(file.size || 0) > ADMIN_IMAGE_MAX_BYTES) {
        return `Imagen demasiado pesada. Maximo ${formatBytes(ADMIN_IMAGE_MAX_BYTES)}.`;
    }
    return '';
}

