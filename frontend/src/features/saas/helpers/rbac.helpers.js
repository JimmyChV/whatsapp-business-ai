import { QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB, QUICK_REPLY_DEFAULT_STORAGE_MB } from './quickReplies.helpers';

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
export const PERMISSION_TENANT_CHAT_ASSIGNMENTS_READ = 'tenant.chat_assignments.read';
export const PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE = 'tenant.chat_assignments.manage';
export const PERMISSION_TENANT_KPIS_READ = 'tenant.kpis.read';

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

