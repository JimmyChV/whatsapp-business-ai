const accessPolicyStore = require('./access_policy_store_service');
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

function normalizeRuntimePermissionLabels(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const labels = { ...PERMISSION_LABELS };
    ALL_PERMISSION_KEYS.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(source, key)) return;
        const next = String(source[key] || '').trim();
        if (!next) return;
        labels[key] = next;
    });
    return labels;
}

function normalizeRuntimePackMap(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const packs = {};

    Object.values(PERMISSION_PACKS).forEach((pack) => {
        const id = String(pack?.id || '').trim();
        if (!id) return;
        packs[id] = {
            id,
            label: String(pack.label || id).trim() || id,
            permissions: normalizePermissionList(pack.permissions || []),
            active: true,
            isSystem: true
        };
    });

    Object.keys(source).forEach((rawId) => {
        const id = String(rawId || '').trim();
        if (!id) return;
        const entry = source[id] && typeof source[id] === 'object' ? source[id] : {};
        const previous = packs[id] || null;
        packs[id] = {
            id,
            label: String(entry.label || previous?.label || id).trim() || id,
            permissions: normalizePermissionList(entry.permissions || previous?.permissions || []),
            active: entry.active === undefined ? (previous ? previous.active !== false : true) : entry.active !== false,
            isSystem: previous?.isSystem === true || entry.isSystem === true
        };
    });

    return packs;
}

function normalizeRuntimeRoleMap(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const roles = {};

    ROLE_VALUES.forEach((role) => {
        const template = ROLE_PROFILES[role] || ROLE_PROFILES.seller;
        roles[role] = {
            role,
            label: ROLE_LABELS[role] || role,
            required: normalizePermissionList(template.required || []),
            optional: normalizePermissionList(template.optional || []),
            blocked: normalizePermissionList(template.blocked || []),
            active: true,
            isSystem: true
        };
    });

    Object.keys(source).forEach((rawRole) => {
        const role = String(rawRole || '').trim().toLowerCase();
        if (!role) return;
        const entry = source[role] && typeof source[role] === 'object' ? source[role] : {};
        const previous = roles[role] || null;

        const required = normalizePermissionList(entry.required || previous?.required || []);
        const optional = normalizePermissionList(entry.optional || previous?.optional || []).filter((permission) => !required.includes(permission));
        const blocked = normalizePermissionList(entry.blocked || previous?.blocked || []).filter((permission) => !required.includes(permission) && !optional.includes(permission));

        roles[role] = {
            role,
            label: String(entry.label || previous?.label || ROLE_LABELS[role] || role).trim() || role,
            required,
            optional,
            blocked,
            active: entry.active === undefined ? (previous ? previous.active !== false : true) : entry.active !== false,
            isSystem: previous?.isSystem === true || ROLE_VALUES.includes(role) || entry.isSystem === true
        };
    });

    if (!roles.seller || roles.seller.active === false) {
        const template = ROLE_PROFILES.seller || { required: [], optional: [], blocked: [] };
        roles.seller = {
            role: 'seller',
            label: ROLE_LABELS.seller || 'Seller',
            required: normalizePermissionList(template.required || []),
            optional: normalizePermissionList(template.optional || []),
            blocked: normalizePermissionList(template.blocked || []),
            active: true,
            isSystem: true
        };
    }

    return roles;
}

function getRuntimeCatalog() {
    const overrides = accessPolicyStore.getOverridesSync();
    const labels = normalizeRuntimePermissionLabels(overrides?.permissionLabels || {});
    const packs = normalizeRuntimePackMap(overrides?.permissionPacks || {});
    const roles = normalizeRuntimeRoleMap(overrides?.roleProfiles || {});
    return { labels, packs, roles };
}

function listActiveRoles() {
    const catalog = getRuntimeCatalog();
    const keys = Object.values(catalog.roles || {})
        .filter((entry) => entry?.active !== false)
        .map((entry) => String(entry.role || '').trim().toLowerCase())
        .filter(Boolean);

    return toSorted(keys);
}


function toSorted(values = []) {
    return Array.from(new Set(values))
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
}

function normalizeRole(value = '') {
    const cleanRole = String(value || '').trim().toLowerCase();
    const activeRoles = listActiveRoles();
    if (cleanRole && activeRoles.includes(cleanRole)) return cleanRole;
    if (activeRoles.includes('seller')) return 'seller';
    return activeRoles[0] || 'seller';
}

function normalizePermissionList(values = []) {
    const source = Array.isArray(values) ? values : [];
    return toSorted(
        source.filter((entry) => ALL_PERMISSION_SET.has(String(entry || '').trim()))
    );
}

function normalizePackList(values = []) {
    const source = Array.isArray(values) ? values : [];
    const packs = getRuntimeCatalog().packs || {};
    return toSorted(
        source
            .map((entry) => String(entry || '').trim())
            .filter((entry) => Boolean(packs[entry]) && packs[entry].active !== false)
    );
}

function getRoleTemplate(role = '') {
    const catalog = getRuntimeCatalog();
    const cleanRole = normalizeRole(role);
    const roleMap = catalog.roles || {};
    const template = roleMap[cleanRole] || roleMap.seller || {
        role: 'seller',
        label: ROLE_LABELS.seller || 'Seller',
        required: [],
        optional: [],
        blocked: [],
        active: true,
        isSystem: true
    };

    return {
        role: cleanRole,
        label: String(template.label || ROLE_LABELS[cleanRole] || cleanRole),
        required: normalizePermissionList(template.required || []),
        optional: normalizePermissionList(template.optional || []),
        blocked: normalizePermissionList(template.blocked || [])
    };
}

function expandPackPermissions(packIds = []) {
    const packs = normalizePackList(packIds);
    const packMap = getRuntimeCatalog().packs || {};
    const permissions = [];
    packs.forEach((packId) => {
        const pack = packMap[packId];
        if (!pack || pack.active === false) return;
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
    const activeRoles = listActiveRoles();
    if (isActorSuperAdmin) return activeRoles;

    const cleanActorRole = normalizeRole(actorRole);
    if (cleanActorRole === 'owner') return activeRoles.filter((role) => role !== 'owner');
    if (cleanActorRole === 'admin') return activeRoles.filter((role) => role === 'seller');
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
    const catalog = getRuntimeCatalog();
    const actorAssignableRoles = getAssignableRoles({ actorRole, isActorSuperAdmin });

    return {
        permissions: ALL_PERMISSION_KEYS.map((key) => ({
            key,
            label: catalog.labels[key] || PERMISSION_LABELS[key] || key,
            active: true,
            isSystem: true
        })),
        packs: Object.values(catalog.packs || {}).map((pack) => ({
            id: pack.id,
            label: pack.label,
            permissions: normalizePermissionList(pack.permissions || []),
            active: pack.active !== false,
            isSystem: pack.isSystem === true
        })),
        roleProfiles: Object.values(catalog.roles || {}).map((profile) => ({
            role: profile.role,
            label: profile.label,
            required: normalizePermissionList(profile.required || []),
            optional: normalizePermissionList(profile.optional || []),
            blocked: normalizePermissionList(profile.blocked || []),
            active: profile.active !== false,
            isSystem: profile.isSystem === true
        })),
        actor: {
            role: isActorSuperAdmin ? 'superadmin' : normalizeRole(actorRole),
            isSuperAdmin: Boolean(isActorSuperAdmin),
            assignableRoles: actorAssignableRoles,
            canEditOptionalAccess: canEditOptionalAccess({ actorRole, isActorSuperAdmin })
        }
    };
}



async function initializeAccessPolicy() {
    await accessPolicyStore.ensureLoaded();
    return getRuntimeCatalog();
}

function validateRoleCode(role = '') {
    const cleanRole = String(role || '').trim().toLowerCase();
    if (!cleanRole) throw new Error('El codigo del rol es requerido.');
    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(cleanRole)) {
        throw new Error('Codigo de rol invalido. Usa 2-32 caracteres: a-z, 0-9, _ o -.');
    }
    if (cleanRole === 'superadmin') throw new Error('superadmin es reservado.');
    return cleanRole;
}

function validatePackCode(packId = '') {
    const cleanPackId = String(packId || '').trim().toLowerCase();
    if (!cleanPackId) throw new Error('El codigo del pack es requerido.');
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(cleanPackId)) {
        throw new Error('Codigo de pack invalido.');
    }
    return cleanPackId;
}

async function persistRoleProfile(payload = {}) {
    await initializeAccessPolicy();

    const role = validateRoleCode(payload.role);
    const catalog = getRuntimeCatalog();
    const previous = catalog.roles?.[role] || null;
    const isSystem = Boolean(previous?.isSystem || ROLE_VALUES.includes(role));
    const nextActive = payload.active === undefined
        ? (previous ? previous.active !== false : true)
        : payload.active !== false;

    if (isSystem && !nextActive) {
        throw new Error('Los roles obligatorios del sistema no se pueden desactivar.');
    }

    const required = normalizePermissionList(payload.required || previous?.required || []);
    const optional = normalizePermissionList(payload.optional || previous?.optional || [])
        .filter((permission) => !required.includes(permission));
    const blocked = normalizePermissionList(payload.blocked || previous?.blocked || [])
        .filter((permission) => !required.includes(permission) && !optional.includes(permission));

    const nextRole = {
        role,
        label: String(payload.label || previous?.label || ROLE_LABELS[role] || role).trim() || role,
        required,
        optional,
        blocked,
        active: nextActive,
        isSystem
    };

    await accessPolicyStore.updateOverrides((current) => {
        const safe = accessPolicyStore.normalizeOverrides(current);
        safe.roleProfiles = {
            ...(safe.roleProfiles || {}),
            [role]: nextRole
        };
        safe.updatedAt = new Date().toISOString();
        return safe;
    });

    return getRoleTemplate(role);
}

async function persistPermissionPack(payload = {}) {
    await initializeAccessPolicy();

    const packId = validatePackCode(payload.id || payload.packId);
    const catalog = getRuntimeCatalog();
    const previous = catalog.packs?.[packId] || null;

    const nextPack = {
        id: packId,
        label: String(payload.label || previous?.label || packId).trim() || packId,
        permissions: normalizePermissionList(payload.permissions || previous?.permissions || []),
        active: payload.active === undefined ? (previous ? previous.active !== false : true) : payload.active !== false,
        isSystem: Boolean(previous?.isSystem || Object.prototype.hasOwnProperty.call(PERMISSION_PACKS, packId))
    };

    await accessPolicyStore.updateOverrides((current) => {
        const safe = accessPolicyStore.normalizeOverrides(current);
        safe.permissionPacks = {
            ...(safe.permissionPacks || {}),
            [packId]: nextPack
        };
        safe.updatedAt = new Date().toISOString();
        return safe;
    });

    return nextPack;
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
    getAccessCatalog,
    initializeAccessPolicy,
    persistRoleProfile,
    persistPermissionPack,
};

