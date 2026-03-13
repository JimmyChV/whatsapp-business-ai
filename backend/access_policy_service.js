const ROLE_VALUES = ['owner', 'admin', 'seller'];

const PERMISSIONS = Object.freeze({
    PLATFORM_OVERVIEW_READ: 'platform.overview.read',
    PLATFORM_TENANTS_MANAGE: 'platform.tenants.manage',
    PLATFORM_PLANS_MANAGE: 'platform.plans.manage',
    TENANT_OVERVIEW_READ: 'tenant.overview.read',
    TENANT_USERS_MANAGE: 'tenant.users.manage',
    TENANT_USERS_OWNER_ASSIGN: 'tenant.users.owner.assign',
    TENANT_SETTINGS_READ: 'tenant.settings.read',
    TENANT_SETTINGS_MANAGE: 'tenant.settings.manage',
    TENANT_INTEGRATIONS_READ: 'tenant.integrations.read',
    TENANT_INTEGRATIONS_MANAGE: 'tenant.integrations.manage',
    TENANT_MODULES_READ: 'tenant.modules.read',
    TENANT_MODULES_MANAGE: 'tenant.modules.manage',
    TENANT_CUSTOMERS_READ: 'tenant.customers.read',
    TENANT_CUSTOMERS_MANAGE: 'tenant.customers.manage',
    TENANT_CATALOGS_MANAGE: 'tenant.catalogs.manage',
    TENANT_AUDIT_READ: 'tenant.audit.read',
    TENANT_RUNTIME_READ: 'tenant.runtime.read',
    TENANT_ASSETS_UPLOAD: 'tenant.assets.upload',
    TENANT_CHAT_OPERATE: 'tenant.chat.operate'
});

const PERMISSION_LABELS = Object.freeze({
    [PERMISSIONS.PLATFORM_OVERVIEW_READ]: 'Ver control global',
    [PERMISSIONS.PLATFORM_TENANTS_MANAGE]: 'Gestionar empresas globales',
    [PERMISSIONS.PLATFORM_PLANS_MANAGE]: 'Gestionar planes globales',
    [PERMISSIONS.TENANT_OVERVIEW_READ]: 'Ver panel de empresa',
    [PERMISSIONS.TENANT_USERS_MANAGE]: 'Gestionar usuarios',
    [PERMISSIONS.TENANT_USERS_OWNER_ASSIGN]: 'Asignar rol owner',
    [PERMISSIONS.TENANT_SETTINGS_READ]: 'Ver configuracion tenant',
    [PERMISSIONS.TENANT_SETTINGS_MANAGE]: 'Editar configuracion tenant',
    [PERMISSIONS.TENANT_INTEGRATIONS_READ]: 'Ver integraciones',
    [PERMISSIONS.TENANT_INTEGRATIONS_MANAGE]: 'Editar integraciones',
    [PERMISSIONS.TENANT_MODULES_READ]: 'Ver modulos WhatsApp',
    [PERMISSIONS.TENANT_MODULES_MANAGE]: 'Gestionar modulos WhatsApp',
    [PERMISSIONS.TENANT_CUSTOMERS_READ]: 'Ver clientes',
    [PERMISSIONS.TENANT_CUSTOMERS_MANAGE]: 'Gestionar clientes',
    [PERMISSIONS.TENANT_CATALOGS_MANAGE]: 'Gestionar catalogos',
    [PERMISSIONS.TENANT_AUDIT_READ]: 'Ver auditoria tenant',
    [PERMISSIONS.TENANT_RUNTIME_READ]: 'Ver runtime tenant',
    [PERMISSIONS.TENANT_ASSETS_UPLOAD]: 'Subir archivos/imagenes',
    [PERMISSIONS.TENANT_CHAT_OPERATE]: 'Operar chat'
});

const ROLE_LABELS = Object.freeze({
    owner: 'Owner',
    admin: 'Admin',
    seller: 'Seller'
});

const PERMISSION_PACKS = Object.freeze({
    pack_module_manager: {
        id: 'pack_module_manager',
        label: 'Gestor de modulos',
        permissions: [
            PERMISSIONS.TENANT_MODULES_MANAGE,
            PERMISSIONS.TENANT_INTEGRATIONS_MANAGE
        ]
    },
    pack_settings_manager: {
        id: 'pack_settings_manager',
        label: 'Gestor de configuracion',
        permissions: [
            PERMISSIONS.TENANT_SETTINGS_MANAGE
        ]
    },
    pack_catalog_manager: {
        id: 'pack_catalog_manager',
        label: 'Gestor de catalogo',
        permissions: [
            PERMISSIONS.TENANT_CATALOGS_MANAGE
        ]
    },
    pack_audit_reader: {
        id: 'pack_audit_reader',
        label: 'Lectura de auditoria',
        permissions: [
            PERMISSIONS.TENANT_AUDIT_READ
        ]
    }
});

const ROLE_PROFILES = Object.freeze({
    owner: {
        required: [
            PERMISSIONS.TENANT_OVERVIEW_READ,
            PERMISSIONS.TENANT_USERS_MANAGE,
            PERMISSIONS.TENANT_SETTINGS_READ,
            PERMISSIONS.TENANT_SETTINGS_MANAGE,
            PERMISSIONS.TENANT_INTEGRATIONS_READ,
            PERMISSIONS.TENANT_INTEGRATIONS_MANAGE,
            PERMISSIONS.TENANT_MODULES_READ,
            PERMISSIONS.TENANT_MODULES_MANAGE,
            PERMISSIONS.TENANT_CUSTOMERS_READ,
            PERMISSIONS.TENANT_CUSTOMERS_MANAGE,
            PERMISSIONS.TENANT_CATALOGS_MANAGE,
            PERMISSIONS.TENANT_AUDIT_READ,
            PERMISSIONS.TENANT_RUNTIME_READ,
            PERMISSIONS.TENANT_ASSETS_UPLOAD,
            PERMISSIONS.TENANT_CHAT_OPERATE
        ],
        optional: [],
        blocked: [
            PERMISSIONS.PLATFORM_OVERVIEW_READ,
            PERMISSIONS.PLATFORM_TENANTS_MANAGE,
            PERMISSIONS.PLATFORM_PLANS_MANAGE,
            PERMISSIONS.TENANT_USERS_OWNER_ASSIGN
        ]
    },
    admin: {
        required: [
            PERMISSIONS.TENANT_OVERVIEW_READ,
            PERMISSIONS.TENANT_USERS_MANAGE,
            PERMISSIONS.TENANT_SETTINGS_READ,
            PERMISSIONS.TENANT_INTEGRATIONS_READ,
            PERMISSIONS.TENANT_MODULES_READ,
            PERMISSIONS.TENANT_CUSTOMERS_READ,
            PERMISSIONS.TENANT_CUSTOMERS_MANAGE,
            PERMISSIONS.TENANT_RUNTIME_READ,
            PERMISSIONS.TENANT_ASSETS_UPLOAD,
            PERMISSIONS.TENANT_CHAT_OPERATE
        ],
        optional: [
            PERMISSIONS.TENANT_MODULES_MANAGE,
            PERMISSIONS.TENANT_SETTINGS_MANAGE,
            PERMISSIONS.TENANT_INTEGRATIONS_MANAGE,
            PERMISSIONS.TENANT_CATALOGS_MANAGE,
            PERMISSIONS.TENANT_AUDIT_READ
        ],
        blocked: [
            PERMISSIONS.PLATFORM_OVERVIEW_READ,
            PERMISSIONS.PLATFORM_TENANTS_MANAGE,
            PERMISSIONS.PLATFORM_PLANS_MANAGE,
            PERMISSIONS.TENANT_USERS_OWNER_ASSIGN
        ]
    },
    seller: {
        required: [
            PERMISSIONS.TENANT_MODULES_READ,
            PERMISSIONS.TENANT_CUSTOMERS_READ,
            PERMISSIONS.TENANT_RUNTIME_READ,
            PERMISSIONS.TENANT_CHAT_OPERATE
        ],
        optional: [
            PERMISSIONS.TENANT_CUSTOMERS_MANAGE,
            PERMISSIONS.TENANT_CATALOGS_MANAGE
        ],
        blocked: [
            PERMISSIONS.PLATFORM_OVERVIEW_READ,
            PERMISSIONS.PLATFORM_TENANTS_MANAGE,
            PERMISSIONS.PLATFORM_PLANS_MANAGE,
            PERMISSIONS.TENANT_USERS_MANAGE,
            PERMISSIONS.TENANT_USERS_OWNER_ASSIGN,
            PERMISSIONS.TENANT_SETTINGS_READ,
            PERMISSIONS.TENANT_SETTINGS_MANAGE,
            PERMISSIONS.TENANT_INTEGRATIONS_READ,
            PERMISSIONS.TENANT_INTEGRATIONS_MANAGE,
            PERMISSIONS.TENANT_MODULES_MANAGE,
            PERMISSIONS.TENANT_AUDIT_READ,
            PERMISSIONS.TENANT_ASSETS_UPLOAD
        ]
    }
});

const ALL_PERMISSION_KEYS = Object.freeze(Object.values(PERMISSIONS));
const ALL_PERMISSION_SET = new Set(ALL_PERMISSION_KEYS);

function toSorted(values = []) {
    return Array.from(new Set(values))
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
}

function normalizeRole(value = '') {
    const cleanRole = String(value || '').trim().toLowerCase();
    if (ROLE_VALUES.includes(cleanRole)) return cleanRole;
    return 'seller';
}

function normalizePermissionList(values = []) {
    const source = Array.isArray(values) ? values : [];
    return toSorted(
        source.filter((entry) => ALL_PERMISSION_SET.has(String(entry || '').trim()))
    );
}

function normalizePackList(values = []) {
    const source = Array.isArray(values) ? values : [];
    return toSorted(
        source
            .map((entry) => String(entry || '').trim())
            .filter((entry) => Boolean(PERMISSION_PACKS[entry]))
    );
}

function getRoleTemplate(role = '') {
    const cleanRole = normalizeRole(role);
    const template = ROLE_PROFILES[cleanRole] || ROLE_PROFILES.seller;
    return {
        role: cleanRole,
        label: ROLE_LABELS[cleanRole] || cleanRole,
        required: normalizePermissionList(template.required),
        optional: normalizePermissionList(template.optional),
        blocked: normalizePermissionList(template.blocked)
    };
}

function expandPackPermissions(packIds = []) {
    const packs = normalizePackList(packIds);
    const permissions = [];
    packs.forEach((packId) => {
        const pack = PERMISSION_PACKS[packId];
        if (!pack) return;
        permissions.push(...normalizePermissionList(pack.permissions || []));
    });
    return normalizePermissionList(permissions);
}

function sanitizeUserAccessInput({
    role = 'seller',
    permissionGrants = [],
    permissionPacks = []
} = {}) {
    const template = getRoleTemplate(role);
    const allowedOptional = new Set(template.optional);

    const normalizedPacks = normalizePackList(permissionPacks).filter((packId) => {
        const packPermissions = expandPackPermissions([packId]);
        return packPermissions.some((permission) => allowedOptional.has(permission));
    });
    const packedPermissions = expandPackPermissions(normalizedPacks);

    const normalizedGrants = normalizePermissionList(permissionGrants)
        .filter((permission) => allowedOptional.has(permission));

    const effectiveOptional = normalizePermissionList([...normalizedGrants, ...packedPermissions]);
    return {
        role: template.role,
        permissionGrants: normalizedGrants,
        permissionPacks: normalizedPacks,
        effectiveOptional
    };
}

function resolveUserPermissions({
    role = 'seller',
    isSuperAdmin = false,
    permissionGrants = [],
    permissionPacks = []
} = {}) {
    if (isSuperAdmin) {
        return {
            role: 'superadmin',
            label: 'Superadmin',
            permissions: ALL_PERMISSION_KEYS,
            required: ALL_PERMISSION_KEYS,
            optional: [],
            blocked: [],
            permissionGrants: [],
            permissionPacks: []
        };
    }

    const template = getRoleTemplate(role);
    const sanitized = sanitizeUserAccessInput({
        role: template.role,
        permissionGrants,
        permissionPacks
    });
    const blocked = new Set(template.blocked);
    const effective = normalizePermissionList([
        ...template.required,
        ...sanitized.effectiveOptional
    ]).filter((permission) => !blocked.has(permission));

    return {
        role: template.role,
        label: template.label,
        permissions: effective,
        required: template.required,
        optional: template.optional,
        blocked: template.blocked,
        permissionGrants: sanitized.permissionGrants,
        permissionPacks: sanitized.permissionPacks
    };
}

function getAssignableRoles({ actorRole = 'seller', isActorSuperAdmin = false } = {}) {
    if (isActorSuperAdmin) return ['owner', 'admin', 'seller'];
    const cleanActorRole = normalizeRole(actorRole);
    if (cleanActorRole === 'owner') return ['admin', 'seller'];
    if (cleanActorRole === 'admin') return ['seller'];
    return [];
}

function canAssignRole({ actorRole = 'seller', isActorSuperAdmin = false, targetRole = 'seller' } = {}) {
    const assignable = new Set(getAssignableRoles({ actorRole, isActorSuperAdmin }));
    return assignable.has(normalizeRole(targetRole));
}

function canEditOptionalAccess({ actorRole = 'seller', isActorSuperAdmin = false } = {}) {
    if (isActorSuperAdmin) return true;
    return normalizeRole(actorRole) === 'owner';
}

function getAccessCatalog({ actorRole = 'seller', isActorSuperAdmin = false } = {}) {
    const actorAssignableRoles = getAssignableRoles({ actorRole, isActorSuperAdmin });
    return {
        permissions: ALL_PERMISSION_KEYS.map((key) => ({
            key,
            label: PERMISSION_LABELS[key] || key
        })),
        packs: Object.values(PERMISSION_PACKS).map((pack) => ({
            id: pack.id,
            label: pack.label,
            permissions: normalizePermissionList(pack.permissions || [])
        })),
        roleProfiles: ROLE_VALUES.map((role) => getRoleTemplate(role)),
        actor: {
            role: isActorSuperAdmin ? 'superadmin' : normalizeRole(actorRole),
            isSuperAdmin: Boolean(isActorSuperAdmin),
            assignableRoles: actorAssignableRoles,
            canEditOptionalAccess: canEditOptionalAccess({ actorRole, isActorSuperAdmin })
        }
    };
}

module.exports = {
    PERMISSIONS,
    PERMISSION_LABELS,
    ROLE_LABELS,
    PERMISSION_PACKS,
    ALL_PERMISSION_KEYS,
    normalizeRole,
    normalizePermissionList,
    normalizePackList,
    getRoleTemplate,
    expandPackPermissions,
    sanitizeUserAccessInput,
    resolveUserPermissions,
    getAssignableRoles,
    canAssignRole,
    canEditOptionalAccess,
    getAccessCatalog
};
