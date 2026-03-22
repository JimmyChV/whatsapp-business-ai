// Helpers extraidos desde SaasAdminPanel para reducir tamano del modulo principal.
import { sanitizeMemberships } from './rbac.helpers';
import { sanitizeAiAssistantCode } from './ai.helpers';

export { sanitizeAiAssistantCode };


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
export { EMPTY_INTEGRATIONS_FORM } from './integrations.helpers';

export {
    EMPTY_TENANT_CATALOG_FORM,
    EMPTY_CATALOG_PRODUCT_FORM,
    normalizeCatalogProductItem,
    buildCatalogProductFormFromItem,
    buildCatalogProductPayload,
    normalizeCatalogIdsList,
    normalizeTenantCatalogItem,
    buildTenantCatalogFormFromItem,
    buildTenantCatalogPayload
} from './catalogs.helpers';

export {
    EMPTY_ACCESS_CATALOG,
    normalizeAccessCatalogPayload,
    EMPTY_ROLE_FORM,
    PLAN_LIMIT_KEYS,
    PLAN_FEATURE_KEYS,
    ROLE_PRIORITY,
    PERMISSION_OWNER_ASSIGN,
    PERMISSION_PLATFORM_OVERVIEW_READ,
    PERMISSION_PLATFORM_TENANTS_MANAGE,
    PERMISSION_PLATFORM_PLANS_MANAGE,
    PERMISSION_TENANT_OVERVIEW_READ,
    PERMISSION_TENANT_USERS_MANAGE,
    PERMISSION_TENANT_SETTINGS_READ,
    PERMISSION_TENANT_SETTINGS_MANAGE,
    PERMISSION_TENANT_INTEGRATIONS_READ,
    PERMISSION_TENANT_INTEGRATIONS_MANAGE,
    PERMISSION_TENANT_MODULES_READ,
    PERMISSION_TENANT_MODULES_MANAGE,
    PERMISSION_TENANT_QUICK_REPLIES_READ,
    PERMISSION_TENANT_QUICK_REPLIES_MANAGE,
    PERMISSION_TENANT_LABELS_READ,
    PERMISSION_TENANT_LABELS_MANAGE,
    PERMISSION_TENANT_AI_READ,
    PERMISSION_TENANT_AI_MANAGE,
    PERMISSION_TENANT_CUSTOMERS_READ,
    PERMISSION_TENANT_CUSTOMERS_MANAGE,
    PERMISSION_TENANT_CATALOGS_MANAGE,
    PERMISSION_TENANT_CHAT_ASSIGNMENTS_READ,
    PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE,
    PERMISSION_TENANT_KPIS_READ,
    sanitizeMemberships,
    resolvePrimaryRoleFromMemberships,
    getRolePriority,
    normalizePlanForm,
    normalizeRoleProfileItem,
    buildRoleFormFromItem,
    sanitizeRoleCode
} from './rbac.helpers';

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


export {
    EMPTY_AI_ASSISTANT_FORM,
    AI_PROVIDER_OPTIONS,
    AI_MODEL_OPTIONS,
    LAVITAT_FIRST_ASSISTANT_SYSTEM_PROMPT
} from './ai.helpers';

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
    { id: 'saas_operacion', label: 'Operacion' },
    { id: 'saas_ia', label: 'IA' },
    { id: 'saas_etiquetas', label: 'Etiquetas' },
    { id: 'saas_quick_replies', label: 'Respuestas rapidas' },
    { id: 'saas_modulos', label: 'Modulos' },
    { id: 'saas_catalogos', label: 'Catalogos' },
    { id: 'saas_config', label: 'Configuracion' }
];
export const ADMIN_IMAGE_MAX_BYTES = Math.max(200 * 1024, Number(import.meta.env.VITE_ADMIN_ASSET_MAX_BYTES || 2 * 1024 * 1024));
export const ADMIN_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ADMIN_IMAGE_ALLOWED_EXTENSIONS_LABEL = '.jpg, .jpeg, .png, .webp';
export {
    QUICK_REPLY_ALLOWED_MIME_TYPES,
    QUICK_REPLY_ALLOWED_EXTENSIONS,
    QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
    QUICK_REPLY_ACCEPT_VALUE,
    QUICK_REPLY_EXT_TO_MIME,
    QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB,
    QUICK_REPLY_DEFAULT_STORAGE_MB,
    EMPTY_QUICK_REPLY_LIBRARY_FORM,
    EMPTY_QUICK_REPLY_ITEM_FORM,
    normalizeQuickReplyLibraryItem,
    normalizeQuickReplyItem,
    normalizeQuickReplyMediaAsset,
    normalizeQuickReplyMediaAssets,
    resolveQuickReplyAssetPreviewUrl,
    isQuickReplyImageAsset,
    getQuickReplyAssetTypeLabel,
    getQuickReplyAssetDisplayName,
    buildQuickReplyLibraryPayload,
    buildQuickReplyItemPayload
} from './quickReplies.helpers';
export {
    DEFAULT_LABEL_COLORS,
    EMPTY_LABEL_FORM,
    normalizeTenantLabelColor,
    normalizeTenantLabelItem,
    buildLabelFormFromItem,
    buildTenantLabelPayload
} from './labels.helpers';

export function normalizeOverview(payload = {}) {
    return {
        tenants: Array.isArray(payload?.tenants) ? payload.tenants : [],
        users: Array.isArray(payload?.users) ? payload.users : [],
        metrics: Array.isArray(payload?.metrics) ? payload.metrics : [],
        aiUsage: Array.isArray(payload?.aiUsage) ? payload.aiUsage : []
    };
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


export {
    normalizeTenantAiAssistantItem,
    buildAiAssistantFormFromItem,
    buildLavitatAssistantPreset,
    buildAiAssistantPayload
} from './ai.helpers';
export {
    normalizeIntegrationsPayload,
    buildIntegrationsUpdatePayload
} from './integrations.helpers';

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




