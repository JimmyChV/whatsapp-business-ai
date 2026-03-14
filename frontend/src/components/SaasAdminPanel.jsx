import { useCallback, useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const EMPTY_TENANT_FORM = {
    id: '',
    slug: '',
    name: '',
    plan: 'starter',
    active: true,
    logoUrl: '',
    coverImageUrl: ''
};

const EMPTY_USER_FORM = {
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

const EMPTY_CUSTOMER_FORM = {
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

const EMPTY_SETTINGS = {
    catalogMode: 'hybrid',
    enabledModules: {
        aiPro: true,
        catalog: true,
        cart: true,
        quickReplies: true
    }
};
const EMPTY_INTEGRATIONS_FORM = {
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

const EMPTY_ACCESS_CATALOG = {
    permissions: [],
    packs: [],
    roleProfiles: [],
    actor: {
        assignableRoles: [],
        canEditOptionalAccess: false
    }
};

function normalizeAccessCatalogPayload(payload = {}) {
    return {
        permissions: Array.isArray(payload?.permissions) ? payload.permissions : [],
        packs: Array.isArray(payload?.packs) ? payload.packs : [],
        roleProfiles: Array.isArray(payload?.roleProfiles) ? payload.roleProfiles : [],
        actor: payload?.actor && typeof payload.actor === 'object'
            ? payload.actor
            : { assignableRoles: [], canEditOptionalAccess: false }
    };
}
const EMPTY_ROLE_FORM = {
    role: '',
    label: '',
    required: [],
    optional: [],
    blocked: [],
    active: true
};

const PLAN_LIMIT_KEYS = [
    { key: 'maxUsers', label: 'Max usuarios', min: 1, max: 100000 },
    { key: 'maxWaModules', label: 'Max modulos WA', min: 1, max: 100000 },
    { key: 'maxCatalogs', label: 'Max catalogos', min: 1, max: 100000 },
    { key: 'maxCatalogItems', label: 'Max productos catalogo', min: 1, max: 1000000 },
    { key: 'maxMonthlyAiRequests', label: 'Max IA mensual', min: 1, max: 100000000 },
    { key: 'maxActiveSessions', label: 'Max sesiones activas', min: 1, max: 100000 }
];

const PLAN_FEATURE_KEYS = [
    { key: 'aiPro', label: 'IA Pro' },
    { key: 'catalog', label: 'Catalogo' },
    { key: 'cart', label: 'Carrito' },
    { key: 'quickReplies', label: 'Respuestas rapidas' },
    { key: 'audit', label: 'Auditoria' },
    { key: 'opsPanel', label: 'Panel Ops' }
];

const EMPTY_WA_MODULE_FORM = {
    moduleId: '',
    name: '',
    phoneNumber: '',
    transportMode: 'cloud',
    imageUrl: '',
    assignedUserIds: [],
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

const BASE_ROLE_OPTIONS = ['owner', 'admin', 'seller'];
const PLAN_OPTIONS = ['starter', 'pro', 'enterprise'];
const CATALOG_MODE_OPTIONS = ['hybrid', 'meta_only', 'woo_only', 'local_only'];
const MODULE_KEYS = [
    { key: 'aiPro', label: 'IA Pro' },
    { key: 'catalog', label: 'Catalogo' },
    { key: 'cart', label: 'Carrito' },
    { key: 'quickReplies', label: 'Respuestas rapidas' }
];
const ADMIN_NAV_ITEMS = [
    { id: 'saas_resumen', label: 'Resumen' },
    { id: 'saas_planes', label: 'Planes' },
    { id: 'saas_empresas', label: 'Empresas' },
    { id: 'saas_usuarios', label: 'Usuarios' },
    { id: 'saas_roles', label: 'Roles' },
    { id: 'saas_clientes', label: 'Clientes' },
    { id: 'saas_modulos', label: 'Modulos' },
    { id: 'saas_catalogos', label: 'Catalogos' },
    { id: 'saas_config', label: 'Configuracion' }
];
const ROLE_PRIORITY = Object.freeze({
    seller: 1,
    admin: 2,
    owner: 3,
    superadmin: 4
});
const PERMISSION_OWNER_ASSIGN = 'tenant.users.owner.assign';
const ADMIN_IMAGE_MAX_BYTES = Math.max(200 * 1024, Number(import.meta.env.VITE_ADMIN_ASSET_MAX_BYTES || 2 * 1024 * 1024));
const ADMIN_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ADMIN_IMAGE_ALLOWED_EXTENSIONS_LABEL = '.jpg, .jpeg, .png, .webp';

function normalizeOverview(payload = {}) {
    return {
        tenants: Array.isArray(payload?.tenants) ? payload.tenants : [],
        users: Array.isArray(payload?.users) ? payload.users : [],
        metrics: Array.isArray(payload?.metrics) ? payload.metrics : [],
        aiUsage: Array.isArray(payload?.aiUsage) ? payload.aiUsage : []
    };
}

function sanitizeMemberships(memberships = []) {
    return (Array.isArray(memberships) ? memberships : [])
        .map((entry) => ({
            tenantId: String(entry?.tenantId || '').trim(),
            role: String(entry?.role || '').trim().toLowerCase() || 'seller',
            active: entry?.active !== false
        }))
        .filter((entry) => entry.tenantId);
}

function resolvePrimaryRoleFromMemberships(memberships = [], fallbackRole = 'seller') {
    const source = Array.isArray(memberships) ? memberships : [];
    const activeMembership = source.find((item) => item?.active !== false) || source[0] || null;
    const candidate = String(activeMembership?.role || fallbackRole || 'seller').trim().toLowerCase();
    return candidate || 'seller';
}

function getRolePriority(role = 'seller') {
    const cleanRole = String(role || '').trim().toLowerCase();
    return ROLE_PRIORITY[cleanRole] || ROLE_PRIORITY.seller;
}

function normalizeWaModule(item = {}) {
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
        isActive: source.isActive !== false,
        isDefault: source.isDefault === true,
        isSelected: source.isSelected === true,
        assignedUserIds: Array.isArray(source.assignedUserIds)
            ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [],
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

function normalizeIntegrationsPayload(integrations = {}) {
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

function buildIntegrationsUpdatePayload(form = {}) {
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

function normalizePlanForm(planId = 'starter', limits = {}) {
    const source = limits && typeof limits === 'object' ? limits : {};
    const features = source.features && typeof source.features === 'object' ? source.features : {};

    const base = {
        id: String(planId || 'starter').trim().toLowerCase() || 'starter',
        features: {}
    };

    PLAN_LIMIT_KEYS.forEach((entry) => {
        const value = Number(source?.[entry.key]);
        const fallback = entry.key === 'maxMonthlyAiRequests' ? 500 : 1;
        base[entry.key] = Number.isFinite(value) && value > 0
            ? Math.floor(value)
            : fallback;
    });

    PLAN_FEATURE_KEYS.forEach((entry) => {
        base.features[entry.key] = features?.[entry.key] !== false;
    });

    return base;
}
function normalizeRoleProfileItem(item = {}) {
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

function buildRoleFormFromItem(item = null) {
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

function sanitizeRoleCode(value = '') {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
function buildTenantFormFromItem(item = null) {
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

function buildUserFormFromItem(item = null) {
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

function normalizeCustomerFormFromItem(item = null) {
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

function buildCustomerPayloadFromForm(form = {}) {
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

function formatDateTimeLabel(value = '') {
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
function toTenantDisplayName(tenant = {}) {
    return String(tenant?.name || tenant?.slug || 'Empresa sin nombre').trim() || 'Empresa sin nombre';
}

function toUserDisplayName(user = {}) {
    const name = String(user?.name || '').trim();
    const email = String(user?.email || '').trim();
    return name || email || 'Usuario sin nombre';
}
function buildInitials(label = '') {
    const source = String(label || '').trim();
    if (!source) return 'NA';
    const chunks = source.split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = chunks.map((chunk) => String(chunk[0] || '').toUpperCase()).join('');
    return initials || 'NA';
}

function formatBytes(bytes = 0) {
    const safeValue = Number(bytes || 0);
    if (!Number.isFinite(safeValue) || safeValue <= 0) return '0 B';
    if (safeValue >= 1024 * 1024) return `${(safeValue / (1024 * 1024)).toFixed(1)} MB`;
    if (safeValue >= 1024) return `${Math.round(safeValue / 1024)} KB`;
    return `${Math.round(safeValue)} B`;
}

function validateImageFile(file = null) {
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

function ImageDropInput({
    label = 'Subir imagen',
    disabled = false,
    onFile,
    helpText = `Arrastra una imagen o haz clic para seleccionar (${ADMIN_IMAGE_ALLOWED_EXTENSIONS_LABEL}, max ${formatBytes(ADMIN_IMAGE_MAX_BYTES)}).`
}) {
    const [dragging, setDragging] = useState(false);
    const [localError, setLocalError] = useState('');

    const handleFiles = (fileList) => {
        const file = fileList && fileList[0] ? fileList[0] : null;
        const validationError = validateImageFile(file);
        if (validationError) {
            setLocalError(validationError);
            return;
        }
        setLocalError('');
        if (typeof onFile !== 'function') return;
        onFile(file);
    };

    return (
        <label
            className={`saas-admin-dropzone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}
            onDragOver={(event) => {
                if (disabled) return;
                event.preventDefault();
                setDragging(true);
            }}
            onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
            }}
            onDrop={(event) => {
                if (disabled) return;
                event.preventDefault();
                setDragging(false);
                handleFiles(event.dataTransfer?.files || null);
            }}
        >
            <input
                type="file"
                accept={ADMIN_IMAGE_ALLOWED_MIME_TYPES.join(',')}
                disabled={disabled}
                onChange={(event) => handleFiles(event.target.files || null)}
            />
            <strong>{label}</strong>
            <small className={localError ? 'saas-admin-dropzone-error' : ''}>{localError || helpText}</small>
        </label>
    );
}
export default function SaasAdminPanel({
    isOpen = false,
    onClose,
    onLogout,
    onOpenWhatsAppOperation,
    buildApiHeaders,
    activeTenantId = '',
    canManageSaas = false,
    initialSection = 'saas_resumen',
    userRole = 'seller',
    isSuperAdmin = false,
    embedded = false,
    activeSection = '',
    showNavigation = true,
    showHeader = true,
    closeLabel = 'Cerrar sesion',
    currentUser = null,
}) {
    const [overview, setOverview] = useState({ tenants: [], users: [], metrics: [], aiUsage: [] });
    const [tenantForm, setTenantForm] = useState(EMPTY_TENANT_FORM);
    const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
    const [settingsTenantId, setSettingsTenantId] = useState('');
    const [tenantSettings, setTenantSettings] = useState(EMPTY_SETTINGS);
    const [membershipDraft, setMembershipDraft] = useState([]);
    const [waModules, setWaModules] = useState([]);
    const [waModuleForm, setWaModuleForm] = useState(EMPTY_WA_MODULE_FORM);
    const [editingWaModuleId, setEditingWaModuleId] = useState('');
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedWaModuleId, setSelectedWaModuleId] = useState('');
    const [selectedConfigKey, setSelectedConfigKey] = useState('');
    const [moduleUserPickerId, setModuleUserPickerId] = useState('');
    const [tenantPanelMode, setTenantPanelMode] = useState('view');
    const [userPanelMode, setUserPanelMode] = useState('view');
    const [tenantSettingsPanelMode, setTenantSettingsPanelMode] = useState('view');
    const [waModulePanelMode, setWaModulePanelMode] = useState('view');
    const [tenantIntegrations, setTenantIntegrations] = useState(EMPTY_INTEGRATIONS_FORM);
    const [catalogPanelMode, setCatalogPanelMode] = useState('view');
    const [planMatrix, setPlanMatrix] = useState({});
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [planForm, setPlanForm] = useState(() => normalizePlanForm('starter', {}));
    const [planPanelMode, setPlanPanelMode] = useState('view');
    const [accessCatalog, setAccessCatalog] = useState(EMPTY_ACCESS_CATALOG);
    const [loadingAccessCatalog, setLoadingAccessCatalog] = useState(false);
    const [selectedRoleKey, setSelectedRoleKey] = useState('');
    const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
    const [rolePanelMode, setRolePanelMode] = useState('view');

    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
    const [customerPanelMode, setCustomerPanelMode] = useState('view');
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerCsvText, setCustomerCsvText] = useState('');
    const [customerImportModuleId, setCustomerImportModuleId] = useState('');

    const [busy, setBusy] = useState(false);
    const [loadingSettings, setLoadingSettings] = useState(false);
    const [loadingIntegrations, setLoadingIntegrations] = useState(false);
    const [loadingPlans, setLoadingPlans] = useState(false);
    const [pendingRequests, setPendingRequests] = useState(0);
    const [error, setError] = useState('');
    const [currentSection, setCurrentSection] = useState(String(activeSection || initialSection || 'saas_resumen'));

    const normalizedRole = String(userRole || '').trim().toLowerCase();
    const noRoleContext = !normalizedRole;
    const canManageTenants = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const canManageUsers = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const canManageTenantSettings = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || noRoleContext);
    const canManageCatalog = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const canManageRoles = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const canViewSuperAdminSections = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const canEditTenantSettings = canManageTenantSettings;
    const canEditModules = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || noRoleContext);
    const canEditCatalog = canManageCatalog;
    const requiresTenantSelection = Boolean(isSuperAdmin || normalizedRole === 'superadmin');
    const showPanelLoading = Boolean(
        busy || loadingSettings || loadingIntegrations || loadingPlans || loadingAccessCatalog || pendingRequests > 0
    );
    const defaultRoleOptions = useMemo(() => {
        if (isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext) return BASE_ROLE_OPTIONS;
        if (normalizedRole === 'owner') return BASE_ROLE_OPTIONS.filter((role) => role !== 'owner');
        if (normalizedRole === 'admin') return ['seller'];
        return ['seller'];
    }, [isSuperAdmin, normalizedRole, noRoleContext]);
    const roleOptions = useMemo(() => {
        const fromCatalog = Array.isArray(accessCatalog?.actor?.assignableRoles)
            ? accessCatalog.actor.assignableRoles
                .map((entry) => String(entry || '').trim().toLowerCase())
                .filter((entry) => Boolean(entry))
            : [];
        const merged = fromCatalog.length > 0 ? fromCatalog : defaultRoleOptions;
        return merged.length > 0 ? merged : ['seller'];
    }, [accessCatalog?.actor?.assignableRoles, defaultRoleOptions]);
    const canEditOptionalAccess = Boolean(
        accessCatalog?.actor?.canEditOptionalAccess
        || isSuperAdmin
        || normalizedRole === 'superadmin'
    );
    const actorRoleForPolicy = isSuperAdmin || normalizedRole === 'superadmin' ? 'superadmin' : (normalizedRole || 'seller');
    const actorRolePriority = getRolePriority(actorRoleForPolicy);
    const currentUserId = String(currentUser?.userId || currentUser?.id || '').trim();
    const actorPermissionSet = useMemo(() => new Set(
        (Array.isArray(currentUser?.permissions) ? currentUser.permissions : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
    ), [currentUser?.permissions]);
    const canActorManageRoleChanges = Boolean(
        actorRoleForPolicy === 'superadmin'
        || actorRoleForPolicy === 'owner'
        || (actorRoleForPolicy === 'admin' && actorPermissionSet.has(PERMISSION_OWNER_ASSIGN))
    );
    const accessPackOptions = useMemo(
        () => (Array.isArray(accessCatalog?.packs) ? accessCatalog.packs : []),
        [accessCatalog?.packs]
    );
    const accessPackLabelMap = useMemo(() => {
        const map = new Map();
        accessPackOptions.forEach((pack) => {
            const packId = String(pack?.id || '').trim();
            if (!packId) return;
            map.set(packId, String(pack?.label || packId));
        });
        return map;
    }, [accessPackOptions]);
    const getOptionalPermissionKeysForRole = useCallback((roleValue = 'seller') => {
        const cleanRole = String(roleValue || 'seller').trim().toLowerCase();
        const profiles = Array.isArray(accessCatalog?.roleProfiles) ? accessCatalog.roleProfiles : [];
        const profile = profiles.find((entry) => String(entry?.role || '').trim().toLowerCase() === cleanRole) || null;
        return new Set(
            (Array.isArray(profile?.optional) ? profile.optional : [])
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
        );
    }, [accessCatalog?.roleProfiles]);

    const getAllowedPackIdsForRole = useCallback((roleValue = 'seller') => {
        const optionalSet = getOptionalPermissionKeysForRole(roleValue);
        const packs = Array.isArray(accessCatalog?.packs) ? accessCatalog.packs : [];
        const allowedPackIds = new Set();
        packs.forEach((pack) => {
            const permissions = Array.isArray(pack?.permissions) ? pack.permissions : [];
            if (permissions.some((permission) => optionalSet.has(String(permission || '').trim()))) {
                allowedPackIds.add(String(pack?.id || '').trim());
            }
        });
        return allowedPackIds;
    }, [accessCatalog?.packs, getOptionalPermissionKeysForRole]);

    const roleProfiles = useMemo(() => {
        const source = Array.isArray(accessCatalog?.roleProfiles) ? accessCatalog.roleProfiles : [];
        return [...source].sort((left, right) => String(left?.label || left?.role || '').localeCompare(String(right?.label || right?.role || ''), 'es', { sensitivity: 'base' }));
    }, [accessCatalog?.roleProfiles]);

    const roleLabelMap = useMemo(() => {
        const map = new Map();
        roleProfiles.forEach((entry) => {
            const key = String(entry?.role || '').trim().toLowerCase();
            if (!key) return;
            map.set(key, String(entry?.label || key));
        });
        return map;
    }, [roleProfiles]);

    const selectedRoleProfile = useMemo(
        () => roleProfiles.find((entry) => String(entry?.role || '').trim().toLowerCase() === String(selectedRoleKey || '').trim().toLowerCase()) || null,
        [roleProfiles, selectedRoleKey]
    );

    const permissionLabelMap = useMemo(() => {
        const map = new Map();
        (Array.isArray(accessCatalog?.permissions) ? accessCatalog.permissions : []).forEach((entry) => {
            const key = String(entry?.key || '').trim();
            if (!key) return;
            map.set(key, String(entry?.label || key));
        });
        return map;
    }, [accessCatalog?.permissions]);

    const rolePermissionOptions = useMemo(() => {
        return (Array.isArray(accessCatalog?.permissions) ? accessCatalog.permissions : [])
            .map((entry) => ({
                key: String(entry?.key || '').trim(),
                label: String(entry?.label || entry?.key || '').trim()
            }))
            .filter((entry) => entry.key)
            .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
    }, [accessCatalog?.permissions]);
    const hasAccessCatalogData = Boolean(roleProfiles.length || accessPackOptions.length || rolePermissionOptions.length);
    const requestJson = async (path, { method = 'GET', body = null } = {}) => {
        setPendingRequests((prev) => prev + 1);
        try {
            const response = await fetch(`${API_BASE}${path}`, {
                method,
                headers: buildApiHeaders?.({ includeJson: body !== null }) || (body !== null ? { 'Content-Type': 'application/json' } : {}),
                body: body !== null ? JSON.stringify(body) : undefined
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) {
                throw new Error(String(payload?.error || 'Operacion fallida.'));
            }
            return payload;
        } finally {
            setPendingRequests((prev) => Math.max(0, prev - 1));
        }
    };
    const readFileAsDataUrl = (file) => {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No se encontro el archivo para subir.'));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
            reader.readAsDataURL(file);
        });
    };

    const uploadImageAsset = async ({ file, tenantId, scope }) => {
        const dataUrl = await readFileAsDataUrl(file);
        const payload = await requestJson('/api/admin/saas/assets/upload', {
            method: 'POST',
            body: {
                tenantId,
                scope,
                fileName: String(file?.name || 'imagen').trim() || 'imagen',
                dataUrl
            }
        });
        return String(payload?.file?.url || payload?.file?.relativeUrl || '').trim();
    };
    const aiUsageByTenant = useMemo(() => {
        const map = new Map();
        (overview.aiUsage || []).forEach((entry) => {
            const tenantId = String(entry?.tenantId || '').trim();
            if (!tenantId) return;
            map.set(tenantId, Number(entry?.requests || 0) || 0);
        });
        return map;
    }, [overview]);

    const tenantOptions = useMemo(() => {
        return [...(overview.tenants || [])].sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || ''), 'es', { sensitivity: 'base' }));
    }, [overview.tenants]);
    const selectedTenant = useMemo(
        () => tenantOptions.find((tenant) => String(tenant?.id || '') === String(selectedTenantId || '')) || null,
        [tenantOptions, selectedTenantId]
    );

    const tenantScopeId = useMemo(() => {
        const configuredTenantId = String(settingsTenantId || '').trim();
        if (configuredTenantId) return configuredTenantId;
        if (requiresTenantSelection) return '';
        const activeTenant = String(activeTenantId || '').trim();
        if (activeTenant) return activeTenant;
        if (tenantOptions.length === 1) return String(tenantOptions[0]?.id || '').trim();
        return '';
    }, [settingsTenantId, requiresTenantSelection, activeTenantId, tenantOptions]);

    const tenantScopeLocked = requiresTenantSelection && !tenantScopeId;

    const activeTenantLabel = useMemo(() => {
        if (!tenantScopeId) return requiresTenantSelection ? 'Seleccion pendiente' : '-';
        const match = tenantOptions.find((tenant) => String(tenant?.id || '').trim() === tenantScopeId);
        return match ? toTenantDisplayName(match) : tenantScopeId;
    }, [requiresTenantSelection, tenantOptions, tenantScopeId]);

    const currentUserDisplayName = String(currentUser?.name || currentUser?.email || currentUser?.userId || 'Usuario actual').trim() || 'Usuario actual';
    const currentUserEmail = String(currentUser?.email || '-').trim() || '-';
    const currentUserAvatarUrl = String(currentUser?.avatarUrl || '').trim();
    const currentUserRole = String(currentUser?.role || actorRoleForPolicy || 'seller').trim().toLowerCase();
    const currentUserRoleLabel = String(currentUser?.roleLabel || currentUserRole || '-').trim() || '-';
    const currentUserTenantCount = Array.isArray(currentUser?.memberships) ? currentUser.memberships.length : 0;
    const currentUserCapabilities = useMemo(() => {
        const capabilities = [];
        if (canManageTenants) capabilities.push('Gestion de empresas');
        if (canManageUsers) capabilities.push('Gestion de usuarios');
        if (canManageCatalog) capabilities.push('Gestion de catalogos');
        if (canManageTenantSettings) capabilities.push('Configuracion de empresa');
        if (canEditModules) capabilities.push('Modulos WhatsApp');
        if (canViewSuperAdminSections) capabilities.push('Planes y roles globales');
        if (canEditOptionalAccess) capabilities.push('Accesos opcionales');
        return capabilities;
    }, [canManageTenants, canManageUsers, canManageCatalog, canManageTenantSettings, canEditModules, canViewSuperAdminSections, canEditOptionalAccess]);

    const scopedUsers = useMemo(() => {
        if (!tenantScopeId) return [];
        return (overview.users || []).filter((user) => {
            const memberships = sanitizeMemberships(user?.memberships || []);
            return memberships.some((membership) => String(membership?.tenantId || '').trim() === tenantScopeId);
        });
    }, [overview.users, tenantScopeId]);

    const selectedUser = useMemo(
        () => scopedUsers.find((user) => String(user?.id || '') === String(selectedUserId || '')) || null,
        [scopedUsers, selectedUserId]
    );

    const selectedUserRole = useMemo(() => resolvePrimaryRoleFromMemberships(
        sanitizeMemberships(selectedUser?.memberships || []),
        selectedUser?.role || 'seller'
    ), [selectedUser]);
    const selectedUserRolePriority = getRolePriority(selectedUserRole);
    const selectedUserIsSelf = Boolean(selectedUser && currentUserId && String(selectedUser?.id || '').trim() === currentUserId);
    const canEditSelectedUser = Boolean(
        selectedUser
        && canManageUsers
        && (actorRoleForPolicy === 'superadmin' || selectedUserIsSelf || actorRolePriority > selectedUserRolePriority)
    );
    const canEditSelectedUserRole = Boolean(
        selectedUser
        && !selectedUserIsSelf
        && canEditSelectedUser
        && canActorManageRoleChanges
    );
    const canToggleSelectedUserStatus = Boolean(selectedUser && !selectedUserIsSelf && canEditSelectedUser);
    const canEditSelectedUserOptionalAccess = Boolean(
        selectedUser
        && !selectedUserIsSelf
        && canEditSelectedUser
        && canEditOptionalAccess
    );
    const canEditRoleInUserForm = userPanelMode === 'create' ? canManageUsers : canEditSelectedUserRole;
    const canEditScopeInUserForm = userPanelMode === 'create' ? canManageUsers : canEditSelectedUserRole;
    const canConfigureOptionalAccessInUserForm = userPanelMode === 'create' ? canEditOptionalAccess : canEditSelectedUserOptionalAccess;

    const allowedOptionalPermissionsForUserFormRole = useMemo(() => {
        return Array.from(getOptionalPermissionKeysForRole(userForm.role))
            .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
    }, [getOptionalPermissionKeysForRole, userForm.role]);

    const allowedPackIdsForUserFormRole = useMemo(
        () => getAllowedPackIdsForRole(userForm.role),
        [getAllowedPackIdsForRole, userForm.role]
    );

    const filteredCustomers = useMemo(() => {
        const query = String(customerSearch || '').trim().toLowerCase();
        const sorted = [...(Array.isArray(customers) ? customers : [])].sort((a, b) =>
            String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''))
        );
        if (!query) return sorted;
        return sorted.filter((item) => {
            const profile = item?.profile && typeof item.profile === 'object' ? item.profile : {};
            const haystack = [
                item?.customerId,
                item?.contactName,
                item?.phoneE164,
                item?.phoneAlt,
                item?.email,
                item?.moduleId,
                profile?.firstNames,
                profile?.lastNamePaternal,
                profile?.lastNameMaternal,
                profile?.documentNumber
            ].map((entry) => String(entry || '').toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }, [customers, customerSearch]);

    const selectedCustomer = useMemo(
        () => (Array.isArray(customers) ? customers : []).find((item) => String(item?.customerId || '').trim() === String(selectedCustomerId || '').trim()) || null,
        [customers, selectedCustomerId]
    );

    const selectedWaModule = useMemo(
        () => (waModules || []).find((item) => String(item?.moduleId || '') === String(selectedWaModuleId || '')) || null,
        [waModules, selectedWaModuleId]
    );
    const planIds = useMemo(() => {
        const keys = Object.keys(planMatrix || {}).map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
        const merged = Array.from(new Set([...PLAN_OPTIONS, ...keys]));
        return merged;
    }, [planMatrix]);

    const selectedPlan = useMemo(() => {
        const cleanPlanId = String(selectedPlanId || '').trim().toLowerCase();
        if (!cleanPlanId) return null;
        return {
            id: cleanPlanId,
            limits: planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object'
                ? planMatrix[cleanPlanId]
                : null
        };
    }, [planMatrix, selectedPlanId]);

    const usersByTenant = useMemo(() => {
        const map = new Map();
        (overview.users || []).forEach((user) => {
            sanitizeMemberships(user?.memberships || []).forEach((membership) => {
                const tenantId = String(membership?.tenantId || '').trim();
                if (!tenantId) return;
                const bucket = map.get(tenantId) || [];
                bucket.push({
                    ...user,
                    membershipRole: membership.role,
                    membershipActive: membership.active !== false
                });
                map.set(tenantId, bucket);
            });
        });
        return map;
    }, [overview.users]);
    const usersForSettingsTenant = useMemo(() => {
        const cleanTenantId = String(tenantScopeId || '').trim();
        if (!cleanTenantId) return [];
        return [...(usersByTenant.get(cleanTenantId) || [])]
            .sort((left, right) => toUserDisplayName(left).localeCompare(toUserDisplayName(right), 'es', { sensitivity: 'base' }));
    }, [tenantScopeId, usersByTenant]);

    const selectedConfigModule = useMemo(() => {
        if (!String(selectedConfigKey || '').startsWith('wa_module:')) return null;
        const moduleId = String(selectedConfigKey || '').slice('wa_module:'.length).trim();
        if (!moduleId) return null;
        return waModules.find((item) => String(item?.moduleId || '').trim() === moduleId) || null;
    }, [selectedConfigKey, waModules]);

    const assignedModuleUsers = useMemo(() => {
        const assignedIds = new Set((Array.isArray(waModuleForm.assignedUserIds) ? waModuleForm.assignedUserIds : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean));
        return usersForSettingsTenant.filter((user) => assignedIds.has(String(user?.id || '').trim()));
    }, [usersForSettingsTenant, waModuleForm.assignedUserIds]);

    const availableUsersForModulePicker = useMemo(() => {
        const assignedIds = new Set((Array.isArray(waModuleForm.assignedUserIds) ? waModuleForm.assignedUserIds : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean));
        return usersForSettingsTenant.filter((user) => !assignedIds.has(String(user?.id || '').trim()));
    }, [usersForSettingsTenant, waModuleForm.assignedUserIds]);
    const isSectionEnabled = useCallback((sectionId) => {
        const cleanId = String(sectionId || '').trim();
        if (cleanId === 'saas_empresas') return canManageTenants;
        if (cleanId === 'saas_usuarios') return canManageUsers;
        if (cleanId === 'saas_clientes') return canManageUsers;
        if (cleanId === 'saas_modulos') return canManageTenantSettings;
        if (cleanId === 'saas_catalogos') return canManageCatalog;
        if (cleanId === 'saas_planes') return canViewSuperAdminSections;
        if (cleanId === 'saas_roles') return canViewSuperAdminSections;
        if (cleanId === 'saas_config') return canManageTenantSettings;
        return true;
    }, [canManageTenants, canManageUsers, canManageTenantSettings, canManageCatalog, canManageRoles, canViewSuperAdminSections]);

    const adminNavItems = useMemo(() => {
        return ADMIN_NAV_ITEMS
            .filter((item) => canViewSuperAdminSections || !['saas_planes', 'saas_roles'].includes(String(item?.id || '').trim()))
            .map((item) => ({
                ...item,
                enabled: isSectionEnabled(item.id)
            }));
    }, [isSectionEnabled, canViewSuperAdminSections]);

    const selectedSectionId = (() => {
        const preferred = String(currentSection || activeSection || initialSection || 'saas_resumen').trim();
        if (adminNavItems.some((item) => item.id === preferred && item.enabled)) return preferred;
        return adminNavItems.find((item) => item.enabled)?.id || 'saas_resumen';
    })();
    const isModulesSection = selectedSectionId === 'saas_modulos';
    const isCatalogSection = selectedSectionId === 'saas_catalogos';
    const isPlansSection = selectedSectionId === 'saas_planes';
    const isRolesSection = selectedSectionId === 'saas_roles';
    const isCustomersSection = selectedSectionId === 'saas_clientes';
    const isGeneralConfigSection = selectedSectionId === 'saas_config';

    const handleSectionChange = (sectionId) => {
        const next = String(sectionId || '').trim();
        if (!next) return;
        if (!isSectionEnabled(next)) return;

        if (next === 'saas_empresas') {
            setSelectedTenantId('');
            setTenantPanelMode('view');
        }

        if (next === 'saas_usuarios') {
            setSelectedUserId('');
            setUserPanelMode('view');
            setMembershipDraft([]);
        }

        if (next === 'saas_roles') {
            setSelectedRoleKey('');
            setRolePanelMode('view');
            setRoleForm(EMPTY_ROLE_FORM);
        }

        if (next === 'saas_clientes') {
            setSelectedCustomerId('');
            setCustomerPanelMode('view');
        }

        if (next === 'saas_config') {
            clearConfigSelection();
        }
        if (next === 'saas_modulos') {
            clearConfigSelection();
        }

        setCurrentSection(next);
    };

    const preferredModuleIdForOperation = useMemo(() => {
        const moduleFromSelection = String(selectedWaModule?.moduleId || '').trim();
        if (moduleFromSelection) return moduleFromSelection;
        const firstModule = String(waModules?.[0]?.moduleId || '').trim();
        return firstModule;
    }, [selectedWaModule?.moduleId, waModules]);

    const canOpenOperation = Boolean(
        typeof onOpenWhatsAppOperation === 'function'
        && String(tenantScopeId || '').trim()
        && preferredModuleIdForOperation
    );
    const scrollToSection = (sectionId, behavior = 'smooth') => {
        const cleanSection = String(sectionId || '').trim();
        if (!cleanSection) return;
        const node = document.getElementById(cleanSection);
        if (node && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ behavior, block: 'start' });
        }
    };

    const refreshOverview = async () => {
        const payload = await requestJson('/api/admin/saas/overview');
        const next = normalizeOverview(payload);
        setOverview(next);

        const availableTenantIds = new Set((next.tenants || []).map((item) => String(item?.id || '').trim()).filter(Boolean));
        setSelectedTenantId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableTenantIds.has(cleanPrev)) return cleanPrev;
            return '';
        });

        setSettingsTenantId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableTenantIds.has(cleanPrev)) return cleanPrev;
            if (requiresTenantSelection) return '';

            const activeTenant = String(activeTenantId || '').trim();
            if (activeTenant && availableTenantIds.has(activeTenant)) return activeTenant;
            if (availableTenantIds.size === 1) return Array.from(availableTenantIds)[0] || '';
            return '';
        });

        const availableUserIds = new Set((next.users || []).map((item) => String(item?.id || '').trim()).filter(Boolean));
        setSelectedUserId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableUserIds.has(cleanPrev)) return cleanPrev;
            return '';
        });
    };

    const loadTenantSettings = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantSettings(EMPTY_SETTINGS);
            return;
        }
        setLoadingSettings(true);
        try {
            const payload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/settings`);
            const settings = payload?.settings && typeof payload.settings === 'object' ? payload.settings : {};
            setTenantSettings({
                catalogMode: CATALOG_MODE_OPTIONS.includes(String(settings.catalogMode || '').trim())
                    ? String(settings.catalogMode).trim()
                    : 'hybrid',
                enabledModules: {
                    aiPro: settings?.enabledModules?.aiPro !== false,
                    catalog: settings?.enabledModules?.catalog !== false,
                    cart: settings?.enabledModules?.cart !== false,
                    quickReplies: settings?.enabledModules?.quickReplies !== false
                }
            });
        } finally {
            setLoadingSettings(false);
        }
    };

    const loadTenantIntegrations = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantIntegrations(EMPTY_INTEGRATIONS_FORM);
            return;
        }
        setLoadingIntegrations(true);
        try {
            const payload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/integrations`);
            setTenantIntegrations(normalizeIntegrationsPayload(payload?.integrations || {}));
        } finally {
            setLoadingIntegrations(false);
        }
    };

    const loadPlanMatrix = async () => {
        setLoadingPlans(true);
        try {
            const payload = await requestJson('/api/admin/saas/plans');
            const rows = Array.isArray(payload?.plans) ? payload.plans : [];
            const nextMatrix = {};
            rows.forEach((row) => {
                const planId = String(row?.id || '').trim().toLowerCase();
                if (!planId) return;
                nextMatrix[planId] = row?.limits && typeof row.limits === 'object' ? row.limits : {};
            });
            setPlanMatrix(nextMatrix);
            setSelectedPlanId((prev) => {
                const cleanPrev = String(prev || '').trim().toLowerCase();
                if (cleanPrev && nextMatrix?.[cleanPrev]) return cleanPrev;
                return planIds.find((planId) => nextMatrix?.[planId]) || PLAN_OPTIONS[0] || '';
            });
        } finally {
            setLoadingPlans(false);
        }
    };

    const loadAccessCatalog = async () => {
        setLoadingAccessCatalog(true);
        try {
            const payload = await requestJson('/api/admin/saas/access-profiles');
            setAccessCatalog(normalizeAccessCatalogPayload(payload));
        } catch (_) {
            setAccessCatalog(EMPTY_ACCESS_CATALOG);
        } finally {
            setLoadingAccessCatalog(false);
        }
    };

    const openCatalogView = () => {
        setCatalogPanelMode('view');
    };

    const openCatalogEdit = () => {
        if (!canEditCatalog) return;
        setCatalogPanelMode('edit');
    };

    const openPlanView = (planId) => {
        const cleanPlanId = String(planId || '').trim().toLowerCase();
        if (!cleanPlanId) return;
        const limits = planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object' ? planMatrix[cleanPlanId] : {};
        setSelectedPlanId(cleanPlanId);
        setPlanForm(normalizePlanForm(cleanPlanId, limits));
        setPlanPanelMode('view');
        setRolePanelMode('view');
    };

    const openPlanEdit = () => {
        const cleanPlanId = String(selectedPlanId || '').trim().toLowerCase();
        if (!cleanPlanId) return;
        const limits = planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object' ? planMatrix[cleanPlanId] : {};
        setPlanForm(normalizePlanForm(cleanPlanId, limits));
        setPlanPanelMode('edit');
    };

    const cancelPlanEdit = () => {
        const cleanPlanId = String(selectedPlanId || '').trim().toLowerCase();
        const limits = planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object' ? planMatrix[cleanPlanId] : {};
        setPlanForm(normalizePlanForm(cleanPlanId, limits));
        setPlanPanelMode('view');
        setRolePanelMode('view');
    };
    const loadWaModules = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setWaModules([]);
            setSelectedWaModuleId('');
            return;
        }
        const payload = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(cleanTenantId) + '/wa-modules');
        const items = (Array.isArray(payload?.items) ? payload.items : [])
            .map(normalizeWaModule)
            .filter(Boolean)
            .sort((a, b) => String(a.name || a.moduleId).localeCompare(String(b.name || b.moduleId), 'es', { sensitivity: 'base' }));
        setWaModules(items);
        setSelectedWaModuleId((prev) => {
            const cleanPrev = String(prev || '').trim();
            const prevExists = items.some((item) => String(item?.moduleId || '').trim() === cleanPrev);
            if (prevExists) return cleanPrev;
            return '';
        });
    };

    const loadCustomers = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setCustomers([]);
            setSelectedCustomerId('');
            return;
        }
        const payload = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(cleanTenantId) + '/customers?limit=300&includeInactive=true');
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setCustomers(items);
        setSelectedCustomerId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (!cleanPrev) return '';
            const exists = items.some((item) => String(item?.customerId || '').trim() === cleanPrev);
            return exists ? cleanPrev : '';
        });
    };

    const resetWaModuleForm = () => {
        setWaModuleForm(EMPTY_WA_MODULE_FORM);
        setTenantIntegrations(EMPTY_INTEGRATIONS_FORM);
        setSelectedPlanId('');
        setPlanForm(normalizePlanForm('starter', {}));
        setRoleForm(EMPTY_ROLE_FORM);
        setEditingWaModuleId('');
        setModuleUserPickerId('');
        setSelectedCustomerId('');
        setCustomerPanelMode('view');
        setCustomerForm(EMPTY_CUSTOMER_FORM);
        setCustomerSearch('');
        setCustomerCsvText('');
        setCustomerImportModuleId('');
    };

    const openWaModuleEditor = (moduleItem = null) => {
        const item = normalizeWaModule(moduleItem || {});
        if (!item) {
            resetWaModuleForm();
            return;
        }
        setSelectedWaModuleId(item.moduleId);
        setEditingWaModuleId(item.moduleId);
        setWaModuleForm({
            moduleId: item.moduleId,
            name: item.name,
            phoneNumber: item.phoneNumber || '',
            transportMode: item.transportMode || 'cloud',
            imageUrl: item.imageUrl || '',
            assignedUserIds: [...(item.assignedUserIds || [])],
            moduleCatalogMode: item.moduleCatalogMode || 'inherit',
            moduleAiEnabled: item?.moduleFeatureFlags?.aiPro !== false,
            moduleCatalogEnabled: item?.moduleFeatureFlags?.catalog !== false,
            moduleCartEnabled: item?.moduleFeatureFlags?.cart !== false,
            moduleQuickRepliesEnabled: item?.moduleFeatureFlags?.quickReplies !== false,
            cloudAppId: item?.cloudConfig?.appId || '',
            cloudWabaId: item?.cloudConfig?.wabaId || '',
            cloudPhoneNumberId: item?.cloudConfig?.phoneNumberId || '',
            cloudVerifyToken: item?.cloudConfig?.verifyToken || '',
            cloudGraphVersion: item?.cloudConfig?.graphVersion || 'v22.0',
            cloudDisplayPhoneNumber: item?.cloudConfig?.displayPhoneNumber || '',
            cloudBusinessName: item?.cloudConfig?.businessName || '',
            cloudAppSecret: '',
            cloudSystemUserToken: '',
            cloudAppSecretMasked: item?.cloudConfig?.appSecretMasked || '',
            cloudSystemUserTokenMasked: item?.cloudConfig?.systemUserTokenMasked || '',
            cloudEnforceSignature: item?.cloudConfig?.enforceSignature !== false
        });
        setModuleUserPickerId('');
    };
    const runAction = async (label, action) => {
        setError('');
        setBusy(true);
        try {
            await action();
            await refreshOverview();
            if (settingsTenantId) {
                await loadTenantSettings(settingsTenantId);
                await loadWaModules(settingsTenantId);
            }
        } catch (err) {
            setError(String(err?.message || err || 'Error inesperado.'));
        } finally {
            setBusy(false);
        }
    };

    const handleOpenOperation = (moduleId = '') => {
        if (typeof onOpenWhatsAppOperation !== 'function') return;
        const cleanModuleId = String(moduleId || '').trim();
        const cleanTenantId = String(tenantScopeId || activeTenantId || '').trim();
        onOpenWhatsAppOperation(cleanModuleId, { tenantId: cleanTenantId || undefined });
    };
    const handleFormImageUpload = async ({ file, scope, tenantId, onUploaded }) => {
        if (!file) return;
        const cleanTenantId = String(tenantId || tenantScopeId || selectedTenantId || activeTenantId || 'default').trim() || 'default';
        setError('');
        setBusy(true);
        try {
            const publicUrl = await uploadImageAsset({ file, tenantId: cleanTenantId, scope });
            if (!publicUrl) {
                throw new Error('No se pudo obtener URL publica del archivo subido.');
            }
            if (typeof onUploaded === 'function') {
                onUploaded(publicUrl);
            }
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo subir la imagen.'));
        } finally {
            setBusy(false);
        }
    };
    const updateMembershipDraft = (index, patch = {}) => {
        setMembershipDraft((prev) => prev.map((entry, entryIndex) => {
            if (entryIndex !== index) return entry;
            return {
                ...entry,
                ...patch,
                role: String(patch?.role || entry.role || '').trim().toLowerCase() || 'seller'
            };
        }));
    };

    const removeMembershipDraft = (index) => {
        setMembershipDraft((prev) => prev.filter((_, entryIndex) => entryIndex !== index));
    };

    const addMembershipDraft = () => {
        const fallbackTenant = String(settingsTenantId || tenantOptions[0]?.id || '').trim();
        setMembershipDraft((prev) => [
            ...prev,
            { tenantId: fallbackTenant, role: 'seller', active: true }
        ]);
    };

    useEffect(() => {
        if (!isOpen || !canManageSaas) return;
        runAction('Carga inicial', async () => {
            const tasks = [
                refreshOverview(),
                loadAccessCatalog()
            ];
            if (canViewSuperAdminSections) {
                tasks.push(loadPlanMatrix());
            }
            const results = await Promise.allSettled(tasks);
            const firstError = results.find((entry) => entry.status === 'rejected');
            if (firstError?.status === 'rejected') {
                throw firstError.reason;
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, canManageSaas, canViewSuperAdminSections]);

    const clearPanelSelection = useCallback(() => {
        setSelectedTenantId('');
        setSelectedUserId('');
        setSelectedWaModuleId('');
        setSelectedConfigKey('');
        setTenantPanelMode('view');
        setUserPanelMode('view');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setCatalogPanelMode('view');
        setPlanPanelMode('view');
        setRolePanelMode('view');
        setMembershipDraft([]);
        setTenantForm(EMPTY_TENANT_FORM);
        setUserForm(EMPTY_USER_FORM);
        setWaModuleForm(EMPTY_WA_MODULE_FORM);
        setTenantIntegrations(EMPTY_INTEGRATIONS_FORM);
        setSelectedPlanId('');
        setPlanForm(normalizePlanForm('starter', {}));
        setRoleForm(EMPTY_ROLE_FORM);
        setEditingWaModuleId('');
        setModuleUserPickerId('');
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        clearPanelSelection();
    }, [isOpen, clearPanelSelection]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event) => {
            if (event.key !== 'Escape' || event.repeat) return;

            const hasSelection = Boolean(
                selectedTenantId
                || selectedUserId
                || selectedWaModuleId
                || selectedConfigKey
                || selectedRoleKey
                || tenantPanelMode !== 'view'
                || userPanelMode !== 'view'
                || tenantSettingsPanelMode !== 'view'
                || waModulePanelMode !== 'view'
                || catalogPanelMode !== 'view'
                || planPanelMode !== 'view'
                || rolePanelMode !== 'view'
                || selectedPlanId
                || selectedCustomerId
                || customerPanelMode !== 'view'
            );

            if (!hasSelection) return;
            event.preventDefault();
            clearPanelSelection();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [
        clearPanelSelection,
        isOpen,
        selectedConfigKey,
        selectedRoleKey,
        selectedTenantId,
        selectedUserId,
        selectedWaModuleId,
        tenantPanelMode,
        tenantSettingsPanelMode,
        userPanelMode,
        waModulePanelMode,
        catalogPanelMode,
        planPanelMode,
        rolePanelMode,
        selectedPlanId,
        selectedCustomerId,
        customerPanelMode
    ]);

    useEffect(() => {
        if (!isOpen || !canManageSaas || !tenantScopeId) return;
        Promise.all([
            loadTenantSettings(tenantScopeId),
            loadWaModules(tenantScopeId),
            loadTenantIntegrations(tenantScopeId),
            loadCustomers(tenantScopeId)
        ]).catch((err) => {
            setError(String(err?.message || err || 'No se pudo cargar configuracion del tenant.'));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, canManageSaas, tenantScopeId]);

    useEffect(() => {
        if (!isOpen) return;
        if (String(tenantScopeId || '').trim()) return;
        setWaModules([]);
        setSelectedWaModuleId('');
    }, [isOpen, tenantScopeId]);

    useEffect(() => {
        setSelectedConfigKey('');
        setSelectedRoleKey('');
        setSelectedWaModuleId('');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setCatalogPanelMode('view');
        setModuleUserPickerId('');
        setSelectedCustomerId('');
        setCustomerPanelMode('view');
        setCustomerSearch('');
        setCustomerCsvText('');
    }, [tenantScopeId]);

    useEffect(() => {
        if (!isOpen) return;
        if (requiresTenantSelection || settingsTenantId) return;
        const fallbackTenantId = String(activeTenantId || tenantOptions[0]?.id || '').trim();
        if (!fallbackTenantId) return;
        setSettingsTenantId(fallbackTenantId);
    }, [isOpen, requiresTenantSelection, settingsTenantId, activeTenantId, tenantOptions]);

    useEffect(() => {
        if (!isOpen) return;
        if (!requiresTenantSelection || tenantScopeId) return;
        setCurrentSection('saas_empresas');
    }, [isOpen, requiresTenantSelection, tenantScopeId]);

    useEffect(() => {
        const cleanPlanId = String(selectedPlanId || '').trim().toLowerCase();
        if (!cleanPlanId) return;
        const limits = planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object' ? planMatrix[cleanPlanId] : {};
        setPlanForm(normalizePlanForm(cleanPlanId, limits));
    }, [selectedPlanId, planMatrix]);
    useEffect(() => {
        if (!String(selectedConfigKey || '').startsWith('wa_module:')) return;
        if (selectedConfigModule) return;
        setSelectedConfigKey('');
        setSelectedRoleKey('');
        setSelectedWaModuleId('');
        setWaModulePanelMode('view');
        resetWaModuleForm();
    }, [selectedConfigKey, selectedConfigModule]);


    useEffect(() => {
        if (!isOpen || !canManageSaas) return;
        const sectionId = String(initialSection || '').trim();
        if (!sectionId) return;
        setCurrentSection(sectionId);
    }, [isOpen, canManageSaas, initialSection]);

    useEffect(() => {
        const next = String(activeSection || '').trim();
        if (!next) return;
        setCurrentSection(next);
    }, [activeSection]);

    useEffect(() => {
        if (tenantPanelMode === 'create') return;
        if (!selectedTenant) {
            setTenantForm(EMPTY_TENANT_FORM);
            return;
        }
        setTenantForm(buildTenantFormFromItem(selectedTenant));
    }, [selectedTenant, tenantPanelMode]);

    useEffect(() => {
        if (userPanelMode === 'create') return;
        if (!selectedUser) {
            setUserForm(EMPTY_USER_FORM);
            return;
        }
        setUserForm(buildUserFormFromItem(selectedUser));
    }, [selectedUser, userPanelMode]);

    useEffect(() => {
        if (customerPanelMode === 'create') return;
        if (!selectedCustomer) {
            setCustomerForm(EMPTY_CUSTOMER_FORM);
            return;
        }
        setCustomerForm(normalizeCustomerFormFromItem(selectedCustomer));
    }, [selectedCustomer, customerPanelMode]);

    useEffect(() => {
        if (!selectedWaModule) {
            resetWaModuleForm();
            return;
        }
        openWaModuleEditor(selectedWaModule);
    }, [selectedWaModule]);

    const openTenantCreate = () => {
        setTenantPanelMode('create');
        setSelectedTenantId('');
        setTenantForm(EMPTY_TENANT_FORM);
    };

    const openTenantView = (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) return;
        setSelectedTenantId(cleanTenantId);
        setSettingsTenantId(cleanTenantId);
        setTenantPanelMode('view');
    };

    const openTenantEdit = () => {
        if (!selectedTenant) return;
        setTenantForm(buildTenantFormFromItem(selectedTenant));
        setTenantPanelMode('edit');
    };

    const cancelTenantEdit = () => {
        if (selectedTenant) {
            setTenantForm(buildTenantFormFromItem(selectedTenant));
            setTenantPanelMode('view');
            return;
        }
        setTenantForm(EMPTY_TENANT_FORM);
        setTenantPanelMode('view');
    };

    const openUserCreate = () => {
        if (!loadingAccessCatalog && (!Array.isArray(accessCatalog?.roleProfiles) || accessCatalog.roleProfiles.length === 0)) {
            loadAccessCatalog().catch(() => undefined);
        }
        const fallbackTenantId = String(tenantScopeId || selectedTenantId || tenantOptions[0]?.id || '').trim();
        setUserPanelMode('create');
        setSelectedUserId('');
        setMembershipDraft([]);
        setUserForm({
            ...EMPTY_USER_FORM,
            tenantId: fallbackTenantId,
            role: roleOptions[0] || 'seller',
            permissionGrants: [],
            permissionPacks: []
        });
    };

    const openUserView = (userId) => {
        const cleanUserId = String(userId || '').trim();
        if (!cleanUserId) return;
        setSelectedUserId(cleanUserId);
        setMembershipDraft([]);
        setUserPanelMode('view');
    };

    const openUserEdit = () => {
        if (!selectedUser || !canEditSelectedUser) return;
        if (!loadingAccessCatalog && (!Array.isArray(accessCatalog?.roleProfiles) || accessCatalog.roleProfiles.length === 0)) {
            loadAccessCatalog().catch(() => undefined);
        }
        setUserForm(buildUserFormFromItem(selectedUser));
        setMembershipDraft(sanitizeMemberships(selectedUser.memberships || []));
        setUserPanelMode('edit');
    };

    const cancelUserEdit = () => {
        if (selectedUser) {
            setUserForm(buildUserFormFromItem(selectedUser));
            setMembershipDraft([]);
            setUserPanelMode('view');
            return;
        }
        setUserForm(EMPTY_USER_FORM);
        setMembershipDraft([]);
        setUserPanelMode('view');
    };


    const openRoleCreate = () => {
        if (!canManageRoles) return;
        setSelectedRoleKey('');
        setRoleForm(EMPTY_ROLE_FORM);
        setRolePanelMode('create');
    };

    const openRoleView = (roleKey) => {
        const cleanRole = String(roleKey || '').trim().toLowerCase();
        if (!cleanRole) return;
        setSelectedRoleKey(cleanRole);
        setRolePanelMode('view');
    };

    const openRoleEdit = () => {
        if (!selectedRoleProfile || !canManageRoles) return;
        setRoleForm(buildRoleFormFromItem(selectedRoleProfile));
        setRolePanelMode('edit');
    };

    const cancelRoleEdit = () => {
        if (selectedRoleProfile) {
            setRoleForm(buildRoleFormFromItem(selectedRoleProfile));
            setRolePanelMode('view');
            return;
        }
        setRoleForm(EMPTY_ROLE_FORM);
        setRolePanelMode('view');
    };

    const toggleRolePermission = (bucket, permissionKey, enabled) => {
        const cleanBucket = String(bucket || '').trim().toLowerCase();
        const cleanPermission = String(permissionKey || '').trim();
        if (!['required', 'optional', 'blocked'].includes(cleanBucket) || !cleanPermission) return;

        setRoleForm((prev) => {
            const required = new Set(Array.isArray(prev?.required) ? prev.required.map((entry) => String(entry || '').trim()).filter(Boolean) : []);
            const optional = new Set(Array.isArray(prev?.optional) ? prev.optional.map((entry) => String(entry || '').trim()).filter(Boolean) : []);
            const blocked = new Set(Array.isArray(prev?.blocked) ? prev.blocked.map((entry) => String(entry || '').trim()).filter(Boolean) : []);

            required.delete(cleanPermission);
            optional.delete(cleanPermission);
            blocked.delete(cleanPermission);

            if (enabled) {
                if (cleanBucket === 'required') required.add(cleanPermission);
                if (cleanBucket === 'optional') optional.add(cleanPermission);
                if (cleanBucket === 'blocked') blocked.add(cleanPermission);
            }

            return {
                ...prev,
                required: [...required].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
                optional: [...optional].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
                blocked: [...blocked].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
            };
        });
    };

    const saveRoleProfile = () => {
        if (!canManageRoles) return;

        runAction(rolePanelMode === 'create' ? 'Rol creado' : 'Rol actualizado', async () => {
            const cleanRole = sanitizeRoleCode(roleForm?.role || selectedRoleKey);
            if (!cleanRole) {
                throw new Error('El codigo del rol es obligatorio.');
            }

            const required = Array.from(new Set(
                (Array.isArray(roleForm?.required) ? roleForm.required : [])
                    .map((entry) => String(entry || '').trim())
                    .filter(Boolean)
            ));
            const optional = Array.from(new Set(
                (Array.isArray(roleForm?.optional) ? roleForm.optional : [])
                    .map((entry) => String(entry || '').trim())
                    .filter((entry) => Boolean(entry) && !required.includes(entry))
            ));
            const blocked = Array.from(new Set(
                (Array.isArray(roleForm?.blocked) ? roleForm.blocked : [])
                    .map((entry) => String(entry || '').trim())
                    .filter((entry) => Boolean(entry) && !required.includes(entry) && !optional.includes(entry))
            ));

            const body = {
                role: cleanRole,
                label: String(roleForm?.label || cleanRole).trim() || cleanRole,
                required,
                optional,
                blocked,
                active: roleForm?.active !== false
            };

            const endpoint = rolePanelMode === 'create'
                ? '/api/admin/saas/access-profiles/roles'
                : `/api/admin/saas/access-profiles/roles/${encodeURIComponent(cleanRole)}`;
            const method = rolePanelMode === 'create' ? 'POST' : 'PUT';

            const payload = await requestJson(endpoint, { method, body });
            const nextCatalog = normalizeAccessCatalogPayload(payload);
            setAccessCatalog(nextCatalog);

            const nextSelectedRole = cleanRole;
            const nextProfile = (Array.isArray(nextCatalog.roleProfiles) ? nextCatalog.roleProfiles : [])
                .find((entry) => String(entry?.role || '').trim().toLowerCase() === nextSelectedRole) || null;

            setSelectedRoleKey(nextSelectedRole);
            setRoleForm(buildRoleFormFromItem(nextProfile));
            setRolePanelMode('view');
        });
    };
    const openTenantFromUserMembership = (tenantId) => {
        openTenantView(tenantId);
        setCurrentSection('saas_empresas');
        scrollToSection('saas_empresas');
    };

    const openUserFromTenant = (userId) => {
        openUserView(userId);
        setCurrentSection('saas_usuarios');
        scrollToSection('saas_usuarios');
    };
    const openCustomerCreate = () => {
        setSelectedCustomerId('');
        setCustomerPanelMode('create');
        setCustomerForm({
            ...EMPTY_CUSTOMER_FORM,
            moduleId: String(customerImportModuleId || '').trim()
        });
    };

    const openCustomerView = (customerId) => {
        const cleanCustomerId = String(customerId || '').trim();
        if (!cleanCustomerId) return;
        setSelectedCustomerId(cleanCustomerId);
        setCustomerPanelMode('view');
    };

    const openCustomerEdit = () => {
        if (!selectedCustomer) return;
        setCustomerForm(normalizeCustomerFormFromItem(selectedCustomer));
        setCustomerPanelMode('edit');
    };

    const cancelCustomerEdit = () => {
        if (selectedCustomer) {
            setCustomerForm(normalizeCustomerFormFromItem(selectedCustomer));
            setCustomerPanelMode('view');
            return;
        }
        setCustomerForm(EMPTY_CUSTOMER_FORM);
        setCustomerPanelMode('view');
    };

    const openConfigSettingsView = () => {
        setSelectedConfigKey('tenant_settings');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setSelectedWaModuleId('');
    };

    const openConfigSettingsEdit = () => {
        if (!settingsTenantId || !canEditTenantSettings) return;
        setSelectedConfigKey('tenant_settings');
        setTenantSettingsPanelMode('edit');
        setWaModulePanelMode('view');
        setSelectedWaModuleId('');
    };

    const openConfigModuleView = (moduleId) => {
        const cleanModuleId = String(moduleId || '').trim();
        if (!cleanModuleId) return;
        const moduleItem = waModules.find((item) => String(item?.moduleId || '').trim() === cleanModuleId);
        if (!moduleItem) return;
        setSelectedConfigKey(`wa_module:${cleanModuleId}`);
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        openWaModuleEditor(moduleItem);
    };

    const openConfigModuleCreate = () => {
        if (!canEditModules) return;
        setSelectedConfigKey('');
        setSelectedRoleKey('');
        setSelectedWaModuleId('');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('create');
        setModuleUserPickerId('');
        resetWaModuleForm();
    };

    const openConfigModuleEdit = () => {
        if (!canEditModules) return;
        if (!selectedConfigModule) return;
        setSelectedConfigKey(`wa_module:${selectedConfigModule.moduleId}`);
        openWaModuleEditor(selectedConfigModule);
        setWaModulePanelMode('edit');
    };

    const clearConfigSelection = () => {
        setSelectedConfigKey('');
        setSelectedRoleKey('');
        setSelectedWaModuleId('');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setCatalogPanelMode('view');
        setModuleUserPickerId('');
        resetWaModuleForm();
    };

    const toggleAssignedUserForModule = (userId) => {
        const cleanUserId = String(userId || '').trim();
        if (!cleanUserId) return;
        setWaModuleForm((prev) => {
            const set = new Set(Array.isArray(prev.assignedUserIds) ? prev.assignedUserIds : []);
            if (set.has(cleanUserId)) {
                set.delete(cleanUserId);
            } else {
                set.add(cleanUserId);
            }
            return {
                ...prev,
                assignedUserIds: Array.from(set)
            };
        });
        setModuleUserPickerId('');
    };

    if (!isOpen) return null;

    if (!canManageSaas) {
        return (
            <div className={embedded ? "saas-admin-overlay saas-admin-overlay--embedded" : "saas-admin-overlay"} onClick={() => { if (!embedded) onClose?.(); }}>
                <div className={embedded ? "saas-admin-panel saas-admin-panel--embedded" : "saas-admin-panel"} onClick={(event) => event.stopPropagation()}>
                    {showHeader && (
                        <div className="saas-admin-header">
                            <h2>Panel SaaS</h2>
                            {!embedded && (
                            <div className="saas-admin-header-actions">
                                {typeof onOpenWhatsAppOperation === 'function' && (
                                    <button
                                        type="button"
                                        className="saas-admin-header-open-operation"
                                        disabled={busy || !canOpenOperation}
                                        onClick={() => onOpenWhatsAppOperation(preferredModuleIdForOperation, { tenantId: tenantScopeId || settingsTenantId || activeTenantId || undefined })}
                                    >
                                        Ir al chat
                                    </button>
                                )}
                                <div className="saas-admin-header-profile" role="status" aria-label="Usuario en sesion">
                                    <div className="saas-admin-header-profile-avatar">
                                        {currentUserAvatarUrl
                                            ? <img src={currentUserAvatarUrl} alt={currentUserDisplayName} />
                                            : <span>{buildInitials(currentUserDisplayName)}</span>}
                                    </div>
                                    <div className="saas-admin-header-profile-meta">
                                        <strong>{currentUserDisplayName}</strong>
                                        <small>{currentUserRoleLabel}</small>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="saas-admin-header-close-danger"
                                    onClick={() => { if (typeof onLogout === 'function') { onLogout(); return; } onClose?.(); }}
                                >
                                    {closeLabel}
                                </button>
                            </div>
                        )}
                        </div>
                    )}
                    <p>No tienes permisos para administrar empresas y usuarios.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={embedded ? "saas-admin-overlay saas-admin-overlay--embedded" : "saas-admin-overlay"} onClick={() => { if (!embedded) onClose?.(); }}>
            <div className={embedded ? "saas-admin-panel saas-admin-panel--embedded" : "saas-admin-panel"} onClick={(event) => event.stopPropagation()}>
                {showHeader && (
                    <div className="saas-admin-header">
                        <div>
                            <h2>Control SaaS</h2>
                            <span>Empresa activa: {activeTenantLabel}</span>
                        </div>
                        {!embedded && (
                            <div className="saas-admin-header-actions">
                                {typeof onOpenWhatsAppOperation === 'function' && (
                                    <button
                                        type="button"
                                        className="saas-admin-header-open-operation"
                                        disabled={busy || !canOpenOperation}
                                        onClick={() => onOpenWhatsAppOperation(preferredModuleIdForOperation, { tenantId: tenantScopeId || settingsTenantId || activeTenantId || undefined })}
                                    >
                                        Ir al chat
                                    </button>
                                )}
                                <div className="saas-admin-header-profile" role="status" aria-label="Usuario en sesion">
                                    <div className="saas-admin-header-profile-avatar">
                                        {currentUserAvatarUrl
                                            ? <img src={currentUserAvatarUrl} alt={currentUserDisplayName} />
                                            : <span>{buildInitials(currentUserDisplayName)}</span>}
                                    </div>
                                    <div className="saas-admin-header-profile-meta">
                                        <strong>{currentUserDisplayName}</strong>
                                        <small>{currentUserRoleLabel}</small>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="saas-admin-header-close-danger"
                                    onClick={() => { if (typeof onLogout === 'function') { onLogout(); return; } onClose?.(); }}
                                >
                                    {closeLabel}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="saas-admin-alert error">
                        {error}
                    </div>
                )}

                {showPanelLoading && (
                    <div className="saas-admin-loading-overlay" role="status" aria-live="polite" aria-label="Cargando panel">
                        <div className="saas-admin-loading-card">
                            <div className="loader" />
                        </div>
                    </div>
                )}
                {requiresTenantSelection && (
                    <div className="saas-admin-tenant-picker-row">
                        <select
                            value={settingsTenantId}
                            onChange={(event) => {
                                const nextTenantId = String(event.target.value || '').trim();
                                setSettingsTenantId(nextTenantId);
                                if (nextTenantId) setSelectedTenantId(nextTenantId);
                            }}
                            disabled={busy}
                        >
                            <option value="">Seleccionar empresa para trabajar</option>
                            {tenantOptions.map((tenant) => (
                                <option key={tenant.id} value={tenant.id}>{toTenantDisplayName(tenant)}</option>
                            ))}
                        </select>
                        {settingsTenantId && (
                            <button
                                type="button"
                                className="saas-admin-tenant-picker-clear"
                                disabled={busy}
                                onClick={() => {
                                    setSettingsTenantId('');
                                    setSelectedTenantId('');
                                }}
                            >
                                Limpiar seleccion
                            </button>
                        )}
                    </div>
                )}


                {showNavigation && (
                    <div className="saas-admin-nav">
                        {adminNavItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`saas-admin-nav-btn ${selectedSectionId === item.id ? "active" : ""}`.trim()}
                                disabled={busy || !item.enabled || (tenantScopeLocked && !['saas_resumen', 'saas_empresas', 'saas_planes', 'saas_roles'].includes(item.id))}
                                onClick={() => handleSectionChange(item.id)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                )}

                {selectedSectionId === 'saas_resumen' && (
                    <section id="saas_resumen" className="saas-admin-card saas-admin-card--full saas-admin-flow-card">
                        <div className="saas-admin-summary-top">
                            <section className="saas-admin-profile-summary" aria-label="Resumen del usuario actual">
                                <div className="saas-admin-profile-summary__head">
                                    <div className="saas-admin-profile-summary__avatar">
                                        {currentUserAvatarUrl
                                            ? <img src={currentUserAvatarUrl} alt={currentUserDisplayName} className="saas-admin-inline-avatar" />
                                            : buildInitials(currentUserDisplayName)}
                                    </div>
                                    <div className="saas-admin-profile-summary__meta">
                                        <strong>{currentUserDisplayName}</strong>
                                        <span>{currentUserEmail}</span>
                                    </div>
                                </div>
                                <div className="saas-admin-profile-summary__stats">
                                    <div><small>Rol</small><strong>{currentUserRoleLabel}</strong></div>
                                    <div><small>Empresas</small><strong>{currentUserTenantCount}</strong></div>
                                    <div><small>Empresa activa</small><strong>{activeTenantLabel}</strong></div>
                                </div>
                                <div className="saas-admin-profile-summary__caps">
                                    {currentUserCapabilities.length === 0 && <span className="saas-admin-profile-chip">Vista basica</span>}
                                    {currentUserCapabilities.map((capability) => (
                                        <span key={`user_cap_${capability}`} className="saas-admin-profile-chip">{capability}</span>
                                    ))}
                                </div>
                            </section>

                            <section className="saas-admin-summary-focus" aria-label="Estado operativo">
                                <h3>Contexto operativo</h3>
                                <div className="saas-admin-summary-focus-grid">
                                    <div className="saas-admin-detail-field">
                                        <span>Alcance actual</span>
                                        <strong>{tenantScopeLocked ? 'Seleccion pendiente' : activeTenantLabel}</strong>
                                    </div>
                                    <div className="saas-admin-detail-field">
                                        <span>Plan</span>
                                        <strong>{tenantOptions.find((tenant) => String(tenant?.id || '').trim() === tenantScopeId)?.plan || '-'}</strong>
                                    </div>
                                    <div className="saas-admin-detail-field">
                                        <span>Estado del panel</span>
                                        <strong>{tenantScopeLocked ? 'Bloqueado por tenant' : 'Listo para operar'}</strong>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="saas-admin-kpis saas-admin-kpis--embedded">
                            <div className="saas-admin-kpi">
                                <small>Empresas activas</small>
                                <strong>{(overview.tenants || []).filter((tenant) => tenant.active !== false).length}</strong>
                            </div>
                            <div className="saas-admin-kpi">
                                <small>Usuarios activos (alcance)</small>
                                <strong>{(scopedUsers || []).filter((user) => user.active !== false).length}</strong>
                            </div>
                            <div className="saas-admin-kpi">
                                <small>Modulos WhatsApp</small>
                                <strong>{waModules.length}</strong>
                            </div>
                            <div className="saas-admin-kpi">
                                <small>Modulo seleccionado</small>
                                <strong>{selectedWaModule?.name || 'Sin seleccion'}</strong>
                            </div>
                        </div>

                        <div className="saas-admin-related-block">
                            <h4>Acciones rapidas</h4>
                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                <button type="button" disabled={busy || !isSectionEnabled('saas_empresas')} onClick={() => handleSectionChange('saas_empresas')}>Gestionar empresas</button>
                                <button type="button" disabled={busy || !isSectionEnabled('saas_usuarios')} onClick={() => handleSectionChange('saas_usuarios')}>Gestionar usuarios</button>
                                <button type="button" disabled={busy || !isSectionEnabled('saas_modulos')} onClick={() => handleSectionChange('saas_modulos')}>Gestionar modulos</button>
                                <button type="button" disabled={busy || !isSectionEnabled('saas_config')} onClick={() => handleSectionChange('saas_config')}>Configuracion general</button>
                            </div>
                        </div>
                    </section>
                )}

                {selectedSectionId !== 'saas_resumen' && (
                <div className="saas-admin-grid">
                    {selectedSectionId === 'saas_empresas' && (
                    <section id="saas_empresas" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Empresas ({tenantOptions.length})</h3>
                                        <small>Listado operativo. Selecciona una empresa para ver detalle.</small>
                                    </div>
                                    {canManageTenants && (
                                        <button type="button" disabled={busy} onClick={openTenantCreate}>Agregar empresa</button>
                                    )}
                                </div>
                                <div className="saas-admin-list saas-admin-list--compact">
                                    {tenantOptions.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>No hay empresas registradas.</p>
                                            {canManageTenants && (
                                                <button type="button" disabled={busy} onClick={openTenantCreate}>Crear primera empresa</button>
                                            )}
                                        </div>
                                    )}
                                    {tenantOptions.map((tenant) => {
                                        const activeUsers = (overview.metrics || []).find((metric) => metric.tenantId === tenant.id)?.activeUsers || 0;
                                        const usage = aiUsageByTenant.get(tenant.id) || 0;
                                        return (
                                            <button
                                                key={tenant.id}
                                                type="button"
                                                className={`saas-admin-list-item saas-admin-list-item--button ${selectedTenantId === tenant.id && tenantPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                                onClick={() => openTenantView(tenant.id)}
                                            >
                                                <strong>{toTenantDisplayName(tenant)}</strong>
                                                <small>{tenant.plan} | {tenant.active === false ? 'inactiva' : 'activa'}</small>
                                                <small>Usuarios activos: {activeUsers} | IA mes: {usage}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!selectedTenant && tenantPanelMode !== 'create' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una empresa</h4>
                                        <p>El detalle se mostrara aqui en solo lectura. Editar se habilita solo por accion explicita.</p>
                                    </div>
                                )}

                                {(selectedTenant || tenantPanelMode === 'create') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>
                                                    {tenantPanelMode === 'create'
                                                        ? 'Nueva empresa'
                                                        : tenantPanelMode === 'edit'
                                                            ? `Editando: ${toTenantDisplayName(selectedTenant || {})}`
                                                            : toTenantDisplayName(selectedTenant || {})}
                                                </h3>
                                                <small>
                                                    {tenantPanelMode === 'view'
                                                        ? 'Campos bloqueados. Usa Editar para modificar.'
                                                        : 'ID fijo despues de crear. Ajusta solo campos permitidos.'}
                                                </small>
                                            </div>
                                            {tenantPanelMode === 'view' && selectedTenant && canManageTenants && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy} onClick={openTenantEdit}>Editar</button>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => runAction('Estado de empresa actualizado', async () => {
                                                            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(selectedTenant.id)}`, {
                                                                method: 'PUT',
                                                                body: {
                                                                    slug: selectedTenant.slug || undefined,
                                                                    name: selectedTenant.name,
                                                                    plan: selectedTenant.plan,
                                                                    active: selectedTenant.active === false,
                                                                    logoUrl: selectedTenant.logoUrl || null,
                                                                    coverImageUrl: selectedTenant.coverImageUrl || null
                                                                }
                                                            });
                                                        })}
                                                    >
                                                        {selectedTenant.active === false ? 'Activar' : 'Desactivar'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {tenantPanelMode === 'view' && selectedTenant && (
                                            <>
                                                <div className="saas-admin-hero">
                                                    <div className="saas-admin-hero-media">
                                                        {(selectedTenant.coverImageUrl || selectedTenant.logoUrl)
                                                            ? <img src={selectedTenant.coverImageUrl || selectedTenant.logoUrl} alt={toTenantDisplayName(selectedTenant)} className="saas-admin-hero-image" />
                                                            : <div className="saas-admin-hero-placeholder">{buildInitials(toTenantDisplayName(selectedTenant || {}))}</div>}
                                                    </div>
                                                    <div className="saas-admin-hero-content">
                                                        <h4>{toTenantDisplayName(selectedTenant)}</h4>
                                                        <p>{selectedTenant.slug ? `slug: ${selectedTenant.slug}` : 'Sin slug configurado'}</p>
                                                    </div>
                                                </div>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedTenant?.id || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Slug</span><strong>{selectedTenant.slug || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Plan</span><strong>{selectedTenant.plan || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenant.active === false ? 'Inactiva' : 'Activa'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedTenant.updatedAt)}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Logo</span><strong>{selectedTenant.logoUrl ? 'Configurado' : 'Sin logo'}</strong></div>
                                                </div>
                                                {(selectedTenant.logoUrl || selectedTenant.coverImageUrl) && (
                                                    <div className="saas-admin-preview-strip">
                                                        {selectedTenant.logoUrl && <img src={selectedTenant.logoUrl} alt="Logo empresa" className="saas-admin-preview-thumb" />}
                                                        {selectedTenant.coverImageUrl && <img src={selectedTenant.coverImageUrl} alt="Portada empresa" className="saas-admin-preview-thumb saas-admin-preview-thumb--wide" />}
                                                    </div>
                                                )}
                                                <div className="saas-admin-related-block">
                                                    <h4>Usuarios de esta empresa</h4>
                                                    <div className="saas-admin-related-list">
                                                        {((usersByTenant.get(selectedTenant.id) || []).length === 0) && (
                                                            <div className="saas-admin-empty-inline">Sin usuarios vinculados.</div>
                                                        )}
                                                        {(usersByTenant.get(selectedTenant.id) || []).map((user) => (
                                                            <button key={`${selectedTenant.id}_${user.id}`} type="button" className="saas-admin-related-row" onClick={() => openUserFromTenant(user.id)}>
                                                                <span>{toUserDisplayName(user)}</span>
                                                                <small>{user.membershipRole || 'seller'}{user.membershipActive ? '' : ' (inactivo)'}</small>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                </>
                                        )}

                                        {tenantPanelMode !== 'view' && canManageTenants && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={tenantForm.slug}
                                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, slug: event.target.value }))}
                                                        placeholder="slug"
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={tenantForm.name}
                                                        onChange={(event) => setTenantForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre"
                                                        disabled={busy}
                                                    />
                                                    <select value={tenantForm.plan} onChange={(event) => setTenantForm((prev) => ({ ...prev, plan: event.target.value }))} disabled={busy}>
                                                        {PLAN_OPTIONS.map((plan) => (
                                                            <option key={plan} value={plan}>{plan}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <ImageDropInput
                                                        label="Reemplazar logo"
                                                        disabled={busy}
                                                        onFile={(file) => handleFormImageUpload({
                                                            file,
                                                            scope: 'tenant_logo',
                                                            tenantId: selectedTenant?.id || settingsTenantId || activeTenantId || 'default',
                                                            onUploaded: (url) => setTenantForm((prev) => ({ ...prev, logoUrl: url }))
                                                        })}
                                                    />
                                                    <ImageDropInput
                                                        label="Reemplazar portada"
                                                        disabled={busy}
                                                        onFile={(file) => handleFormImageUpload({
                                                            file,
                                                            scope: 'tenant_cover',
                                                            tenantId: selectedTenant?.id || settingsTenantId || activeTenantId || 'default',
                                                            onUploaded: (url) => setTenantForm((prev) => ({ ...prev, coverImageUrl: url }))
                                                        })}
                                                    />
                                                </div>
                                                {(tenantForm.logoUrl || tenantForm.coverImageUrl) && (
                                                    <div className="saas-admin-preview-strip">
                                                        {tenantForm.logoUrl && <img src={tenantForm.logoUrl} alt="Logo empresa" className="saas-admin-preview-thumb" />}
                                                        {tenantForm.coverImageUrl && <img src={tenantForm.coverImageUrl} alt="Portada empresa" className="saas-admin-preview-thumb saas-admin-preview-thumb--wide" />}
                                                    </div>
                                                )}
                                                <div className="saas-admin-form-row">
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={tenantForm.active !== false}
                                                            onChange={(event) => setTenantForm((prev) => ({ ...prev, active: event.target.checked }))}
                                                            disabled={busy}
                                                        />
                                                        <span>Empresa activa</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={busy || !tenantForm.name.trim()}
                                                        onClick={() => runAction(tenantPanelMode === 'create' ? 'Empresa creada' : 'Empresa actualizada', async () => {
                                                            const payload = {
                                                                slug: tenantForm.slug || undefined,
                                                                name: tenantForm.name,
                                                                plan: tenantForm.plan,
                                                                active: tenantForm.active !== false,
                                                                logoUrl: tenantForm.logoUrl || null,
                                                                coverImageUrl: tenantForm.coverImageUrl || null
                                                            };

                                                            if (tenantPanelMode === 'create' || !selectedTenant?.id) {
                                                                const createdPayload = await requestJson('/api/admin/saas/tenants', {
                                                                    method: 'POST',
                                                                    body: payload
                                                                });
                                                                const createdId = String(createdPayload?.tenant?.id || '').trim();
                                                                if (createdId) {
                                                                    setSelectedTenantId(createdId);
                                                                    setSettingsTenantId(createdId);
                                                                }
                                                                setTenantPanelMode('view');
                                                                return;
                                                            }

                                                            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(selectedTenant.id)}`, {
                                                                method: 'PUT',
                                                                body: payload
                                                            });
                                                            setTenantPanelMode('view');
                                                        })}
                                                    >
                                                        {tenantPanelMode === 'create' ? 'Guardar empresa' : 'Actualizar empresa'}
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={cancelTenantEdit}>Cancelar</button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                    )}
                    {selectedSectionId === 'saas_usuarios' && (
                    <section id="saas_usuarios" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Usuarios ({scopedUsers.length})</h3>
                                        <small>Listado minimo. El detalle se administra en el panel derecho.</small>
                                    </div>
                                    {canManageUsers && (
                                        <button type="button" disabled={busy || tenantScopeLocked} onClick={openUserCreate}>Agregar usuario</button>
                                    )}
                                </div>
                                <div className="saas-admin-list saas-admin-list--compact">
                                    {scopedUsers.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>{tenantScopeLocked ? 'Selecciona una empresa para habilitar usuarios.' : 'No hay usuarios registrados.'}</p>
                                            {canManageUsers && (
                                                <button type="button" disabled={busy || tenantScopeLocked} onClick={openUserCreate}>Crear primer usuario</button>
                                            )}
                                        </div>
                                    )}
                                    {scopedUsers.map((user) => {
                                        const userMemberships = sanitizeMemberships(user?.memberships || []);
                                        return (
                                            <button
                                                key={user.id}
                                                type="button"
                                                className={`saas-admin-list-item saas-admin-list-item--button ${selectedUserId === user.id && userPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                                onClick={() => openUserView(user.id)}
                                            >
                                                <strong>{toUserDisplayName(user)}</strong>
                                                <small>{user.email || '-'} | {user.active === false ? 'inactivo' : 'activo'}</small>
                                                <small>Membresias: {userMemberships.length}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!selectedUser && userPanelMode !== 'create' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona un usuario</h4>
                                        <p>El detalle se mostrara bloqueado aqui. Editar se activa solo por boton.</p>
                                    </div>
                                )}

                                {(selectedUser || userPanelMode === 'create') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>
                                                    {userPanelMode === 'create'
                                                        ? 'Nuevo usuario'
                                                        : userPanelMode === 'edit'
                                                            ? `Editando: ${toUserDisplayName(selectedUser || {})}`
                                                            : toUserDisplayName(selectedUser || {})}
                                                </h3>
                                                <small>
                                                    {userPanelMode === 'view'
                                                        ? 'Campos bloqueados. Usa Editar para modificar.'
                                                        : 'ID y correo bloqueados durante edicion para mantener consistencia.'}
                                                </small>
                                            </div>
                                            {userPanelMode === 'view' && selectedUser && !canEditSelectedUser && (
                                                <div className="saas-admin-empty-inline">
                                                    No puedes editar este usuario porque tiene el mismo nivel o uno superior al tuyo.
                                                </div>
                                            )}
                                            {userPanelMode === 'view' && selectedUser && canManageUsers && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy || !canEditSelectedUser} onClick={openUserEdit}>Editar</button>
                                                    <button
                                                        type="button"
                                                        disabled={busy || !canToggleSelectedUserStatus}
                                                        onClick={() => runAction('Estado de usuario actualizado', async () => {
                                                            await requestJson(`/api/admin/saas/users/${encodeURIComponent(selectedUser.id)}`, {
                                                                method: 'PUT',
                                                                body: {
                                                                    active: selectedUser.active === false,
                                                                    avatarUrl: selectedUser.avatarUrl || null
                                                                }
                                                            });
                                                        })}
                                                    >
                                                        {selectedUser.active === false ? 'Activar' : 'Desactivar'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {userPanelMode === 'view' && selectedUser && (
                                            <>
                                                <div className="saas-admin-hero">
                                                    <div className="saas-admin-hero-media">
                                                        {selectedUser.avatarUrl
                                                            ? <img src={selectedUser.avatarUrl} alt={toUserDisplayName(selectedUser)} className="saas-admin-hero-image" />
                                                            : <div className="saas-admin-hero-placeholder">{buildInitials(toUserDisplayName(selectedUser || {}))}</div>}
                                                    </div>
                                                    <div className="saas-admin-hero-content">
                                                        <h4>{toUserDisplayName(selectedUser)}</h4>
                                                        <p>{selectedUser.email || 'Sin correo'}</p>
                                                    </div>
                                                </div>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedUser?.id || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Correo</span><strong>{selectedUser.email || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Rol</span><strong>{selectedUser.roleLabel || selectedUser.role || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedUser.active === false ? 'Inactivo' : 'Activo'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Packs de acceso</span><strong>{Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks.length : 0}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedUser.updatedAt)}</strong></div>
                                                </div>

                                                <div className="saas-admin-related-block">
                                                    <h4>Empresas vinculadas</h4>
                                                    <div className="saas-admin-related-list">
                                                        {sanitizeMemberships(selectedUser.memberships || []).length === 0 && (
                                                            <div className="saas-admin-empty-inline">Sin membresias activas.</div>
                                                        )}
                                                        {sanitizeMemberships(selectedUser.memberships || []).map((membership, index) => {
                                                            const tenantLabel = toTenantDisplayName(tenantOptions.find((tenant) => tenant.id === membership.tenantId) || {});
                                                            return (
                                                                <button
                                                                    key={`${selectedUser.id}_membership_view_${index}`}
                                                                    type="button"
                                                                    className="saas-admin-related-row"
                                                                    onClick={() => openTenantFromUserMembership(membership.tenantId)}
                                                                >
                                                                    <span>{tenantLabel}</span>
                                                                    <small>{membership.role}{membership.active ? '' : ' (inactivo)'}</small>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="saas-admin-related-block">
                                                    <h4>Accesos opcionales</h4>
                                                    <div className="saas-admin-related-list">
                                                        {(Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks : []).length === 0 && (
                                                            <div className="saas-admin-empty-inline">Sin paquetes opcionales asignados.</div>
                                                        )}
                                                        {(Array.isArray(selectedUser.permissionPacks) ? selectedUser.permissionPacks : []).map((packId, index) => (
                                                            <div key={`${selectedUser.id}_pack_${index}`} className="saas-admin-related-row" role="status">
                                                                <span>{accessPackLabelMap.get(String(packId || '').trim()) || packId}</span>
                                                                <small>{packId}</small>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                </>
                                        )}

                                        {userPanelMode !== 'view' && canManageUsers && (userPanelMode === 'create' || canEditSelectedUser) && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={userForm.email}
                                                        onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                                                        placeholder="email"
                                                        disabled={userPanelMode !== 'create' || busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={userForm.name}
                                                        onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre"
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        value={userForm.password}
                                                        onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                                                        type="password"
                                                        placeholder={userPanelMode === 'create' ? 'password inicial' : 'nueva password (opcional)'}
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={userForm.active !== false}
                                                            onChange={(event) => setUserForm((prev) => ({ ...prev, active: event.target.checked }))}
                                                            disabled={busy || (userPanelMode === 'edit' && !canToggleSelectedUserStatus)}
                                                        />
                                                        <span>Usuario activo</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <ImageDropInput
                                                        label="Reemplazar avatar"
                                                        disabled={busy}
                                                        onFile={(file) => handleFormImageUpload({
                                                            file,
                                                            scope: 'user_avatar',
                                                            tenantId: userForm.tenantId || settingsTenantId || selectedTenantId || activeTenantId || 'default',
                                                            onUploaded: (url) => setUserForm((prev) => ({ ...prev, avatarUrl: url }))
                                                        })}
                                                    />
                                                </div>

                                                {userForm.avatarUrl && (
                                                    <div className="saas-admin-preview-strip">
                                                        <img src={userForm.avatarUrl} alt="Avatar usuario" className="saas-admin-preview-thumb" />
                                                    </div>
                                                )}

                                                {userPanelMode !== 'view' && (
                                                    <div className="saas-admin-form-row">
                                                        <select value={userForm.tenantId} onChange={(event) => setUserForm((prev) => ({ ...prev, tenantId: event.target.value }))} disabled={busy || !canEditScopeInUserForm}>
                                                            <option value="">Tenant inicial</option>
                                                            {tenantOptions.map((tenant) => (
                                                                <option key={tenant.id} value={tenant.id}>{toTenantDisplayName(tenant)}</option>
                                                            ))}
                                                        </select>
                                                        <select value={userForm.role} onChange={(event) => {
                                                            const nextRole = event.target.value;
                                                            setUserForm((prev) => {
                                                                const allowedPacks = getAllowedPackIdsForRole(nextRole);
                                                                const allowedPermissions = getOptionalPermissionKeysForRole(nextRole);
                                                                const nextPacks = (Array.isArray(prev.permissionPacks) ? prev.permissionPacks : [])
                                                                    .filter((packId) => allowedPacks.has(String(packId || '').trim()));
                                                                const nextGrants = (Array.isArray(prev.permissionGrants) ? prev.permissionGrants : [])
                                                                    .map((entry) => String(entry || '').trim())
                                                                    .filter((permission) => allowedPermissions.has(permission));
                                                                return {
                                                                    ...prev,
                                                                    role: nextRole,
                                                                    permissionPacks: nextPacks,
                                                                    permissionGrants: Array.from(new Set(nextGrants))
                                                                };
                                                            });
                                                        }} disabled={busy || !canEditRoleInUserForm}>
                                                            {roleOptions.map((role) => (
                                                                <option key={role} value={role}>{roleLabelMap.get(String(role || '').trim().toLowerCase()) || role}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                                {canConfigureOptionalAccessInUserForm && (
                                                    <div className="saas-admin-related-block">
                                                        <h4>Accesos opcionales</h4>
                                                        {loadingAccessCatalog && (
                                                            <div className="saas-admin-empty-inline">Cargando catalogo de accesos...</div>
                                                        )}
                                                        {!loadingAccessCatalog && !hasAccessCatalogData && (
                                                            <div className="saas-admin-empty-inline">No se pudo cargar el catalogo de accesos. Reabre el editor de usuario para reintentar.</div>
                                                        )}
                                                        <div className="saas-admin-optional-access-grid">
                                                            <div className="saas-admin-optional-access-column">
                                                                <small className="saas-admin-optional-access-title">Paquetes</small>
                                                                <div className="saas-admin-modules">
                                                                    {accessPackOptions.length === 0 && (
                                                                        <div className="saas-admin-empty-inline">Sin paquetes configurados. Puedes trabajar con permisos directos.</div>
                                                                    )}
                                                                    {accessPackOptions.map((pack) => {
                                                                        const packId = String(pack?.id || '').trim();
                                                                        if (!packId) return null;
                                                                        const packAllowed = allowedPackIdsForUserFormRole.has(packId);
                                                                        const checked = Array.isArray(userForm.permissionPacks) && userForm.permissionPacks.includes(packId);
                                                                        return (
                                                                            <label key={`user_pack_${packId}`} className="saas-admin-module-toggle">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    disabled={busy || loadingAccessCatalog || !packAllowed}
                                                                                    onChange={(event) => setUserForm((prev) => {
                                                                                        const current = Array.isArray(prev.permissionPacks) ? prev.permissionPacks : [];
                                                                                        const nextSet = new Set(current.map((entry) => String(entry || '').trim()).filter(Boolean));
                                                                                        if (event.target.checked) {
                                                                                            nextSet.add(packId);
                                                                                        } else {
                                                                                            nextSet.delete(packId);
                                                                                        }
                                                                                        return { ...prev, permissionPacks: Array.from(nextSet) };
                                                                                    })}
                                                                                />
                                                                                <span>{String(pack?.label || packId)}{packAllowed ? '' : ' (no aplica al rol)'}</span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                            <div className="saas-admin-optional-access-column">
                                                                <small className="saas-admin-optional-access-title">Permisos directos por rol</small>
                                                                <div className="saas-admin-modules">
                                                                    {allowedOptionalPermissionsForUserFormRole.length === 0 && (
                                                                        <div className="saas-admin-empty-inline">El rol actual no tiene permisos opcionales habilitados.</div>
                                                                    )}
                                                                    {allowedOptionalPermissionsForUserFormRole.map((permissionKey) => {
                                                                        const checked = Array.isArray(userForm.permissionGrants) && userForm.permissionGrants.includes(permissionKey);
                                                                        const permissionLabel = permissionLabelMap.get(permissionKey) || permissionKey;
                                                                        return (
                                                                            <label key={`user_permission_${permissionKey}`} className="saas-admin-module-toggle">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    disabled={busy || loadingAccessCatalog}
                                                                                    onChange={(event) => setUserForm((prev) => {
                                                                                        const current = Array.isArray(prev.permissionGrants) ? prev.permissionGrants : [];
                                                                                        const nextSet = new Set(current.map((entry) => String(entry || '').trim()).filter(Boolean));
                                                                                        if (event.target.checked) {
                                                                                            nextSet.add(permissionKey);
                                                                                        } else {
                                                                                            nextSet.delete(permissionKey);
                                                                                        }
                                                                                        return { ...prev, permissionGrants: Array.from(nextSet) };
                                                                                    })}
                                                                                />
                                                                                <span>{permissionLabel}</span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            busy
                                                            || !userForm.email.trim()
                                                            || !userForm.tenantId.trim()
                                                            || (userPanelMode === 'create' && !userForm.password)
                                                        }
                                                        onClick={() => runAction(userPanelMode === 'create' ? 'Usuario creado' : 'Usuario actualizado', async () => {
                                                            const membershipsPayload = sanitizeMemberships([
                                                                { tenantId: userForm.tenantId, role: userForm.role, active: true }
                                                            ]);
                                                            const isCreateMode = userPanelMode === 'create' || !selectedUser?.id;

                                                            if (isCreateMode && membershipsPayload.length === 0) {
                                                                throw new Error('Debes asignar al menos una empresa/membresia.');
                                                            }

                                                            const payload = {
                                                                email: userForm.email,
                                                                name: userForm.name,
                                                                active: userForm.active !== false,
                                                                avatarUrl: userForm.avatarUrl || null
                                                            };

                                                            if (isCreateMode || canEditScopeInUserForm) {
                                                                payload.memberships = membershipsPayload;
                                                            }

                                                            if ((isCreateMode && canEditOptionalAccess) || (!isCreateMode && canConfigureOptionalAccessInUserForm)) {
                                                                payload.permissionPacks = Array.isArray(userForm.permissionPacks)
                                                                    ? userForm.permissionPacks.map((entry) => String(entry || '').trim()).filter(Boolean)
                                                                    : [];
                                                                payload.permissionGrants = Array.isArray(userForm.permissionGrants)
                                                                    ? userForm.permissionGrants.map((entry) => String(entry || '').trim()).filter(Boolean)
                                                                    : [];
                                                            }

                                                            if (userForm.password) {
                                                                payload.password = userForm.password;
                                                            }

                                                            if (userPanelMode === 'create' || !selectedUser?.id) {
                                                                const createdPayload = await requestJson('/api/admin/saas/users', {
                                                                    method: 'POST',
                                                                    body: payload
                                                                });
                                                                const createdId = String(createdPayload?.user?.id || '').trim();
                                                                if (createdId) {
                                                                    setSelectedUserId(createdId);
                                                                }
                                                                setUserPanelMode('view');
                                                                return;
                                                            }

                                                            await requestJson(`/api/admin/saas/users/${encodeURIComponent(selectedUser.id)}`, {
                                                                method: 'PUT',
                                                                body: payload
                                                            });
                                                            setUserPanelMode('view');
                                                        })}
                                                    >
                                                        {userPanelMode === 'create' ? 'Guardar usuario' : 'Actualizar usuario'}
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={cancelUserEdit}>Cancelar</button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                    )}
                    {isCustomersSection && (
                    <section id="saas_clientes" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Clientes ({filteredCustomers.length})</h3>
                                        <small>Base de clientes por empresa y modulo.</small>
                                    </div>
                                    <button type="button" disabled={busy || tenantScopeLocked} onClick={openCustomerCreate}>Agregar cliente</button>
                                </div>

                                <div className="saas-admin-form-row">
                                    <input
                                        value={customerSearch}
                                        onChange={(event) => setCustomerSearch(event.target.value)}
                                        placeholder="Buscar por codigo, nombre, telefono, email o documento"
                                        disabled={busy || tenantScopeLocked}
                                    />
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {tenantScopeLocked && (
                                        <div className="saas-admin-empty-state">
                                            <p>Selecciona una empresa para ver clientes.</p>
                                        </div>
                                    )}
                                    {!tenantScopeLocked && filteredCustomers.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>No hay clientes para esta empresa.</p>
                                        </div>
                                    )}
                                    {!tenantScopeLocked && filteredCustomers.map((customer) => (
                                        <button
                                            key={customer.customerId}
                                            type="button"
                                            className={("saas-admin-list-item saas-admin-list-item--button " + ((selectedCustomerId === customer.customerId && customerPanelMode !== 'create') ? 'active' : '')).trim()}
                                            onClick={() => openCustomerView(customer.customerId)}
                                        >
                                            <strong>{customer.contactName || customer.customerId}</strong>
                                            <small>{customer.phoneE164 || customer.email || '-'}</small>
                                            <small>{customer.moduleId ? ('Modulo: ' + customer.moduleId) : 'Sin modulo'} | {customer.isActive === false ? 'inactivo' : 'activo'}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {tenantScopeLocked && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Los clientes estan aislados por tenant.</p>
                                    </div>
                                )}

                                {!tenantScopeLocked && !selectedCustomer && customerPanelMode !== 'create' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona un cliente</h4>
                                        <p>El detalle se muestra en este panel derecho.</p>
                                    </div>
                                )}

                                {!tenantScopeLocked && (selectedCustomer || customerPanelMode === 'create') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{customerPanelMode === 'create' ? 'Nuevo cliente' : (customerPanelMode === 'edit' ? 'Editando cliente' : (selectedCustomer?.contactName || selectedCustomer?.customerId || 'Cliente'))}</h3>
                                                <small>{customerPanelMode === 'view' ? 'Vista bloqueada.' : 'Edicion activa.'}</small>
                                            </div>
                                            {customerPanelMode === 'view' && selectedCustomer && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy} onClick={openCustomerEdit}>Editar</button>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => runAction('Estado de cliente actualizado', async () => {
                                                            await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/' + encodeURIComponent(selectedCustomer.customerId), {
                                                                method: 'PUT',
                                                                body: { isActive: selectedCustomer.isActive === false }
                                                            });
                                                            await loadCustomers(tenantScopeId);
                                                        })}
                                                    >
                                                        {selectedCustomer.isActive === false ? 'Activar' : 'Desactivar'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {customerPanelMode === 'view' && selectedCustomer && (
                                            <>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedCustomer.customerId || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Nombre contacto</span><strong>{selectedCustomer.contactName || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Telefono</span><strong>{selectedCustomer.phoneE164 || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Telefono 2</span><strong>{selectedCustomer.phoneAlt || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Email</span><strong>{selectedCustomer.email || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Modulo</span><strong>{selectedCustomer.moduleId || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedCustomer.isActive === false ? 'Inactivo' : 'Activo'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedCustomer.updatedAt)}</strong></div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Perfil cliente</h4>
                                                    <div className="saas-admin-related-list">
                                                        <div className="saas-admin-related-row" role="status"><span>Nombres</span><small>{selectedCustomer?.profile?.firstNames || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Apellido paterno</span><small>{selectedCustomer?.profile?.lastNamePaternal || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Apellido materno</span><small>{selectedCustomer?.profile?.lastNameMaternal || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Documento</span><small>{selectedCustomer?.profile?.documentNumber || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Observacion</span><small>{selectedCustomer?.profile?.notes || '-'}</small></div>
                                                        <div className="saas-admin-related-row" role="status"><span>Etiquetas</span><small>{Array.isArray(selectedCustomer?.tags) ? selectedCustomer.tags.join(', ') : '-'}</small></div>
                                                    </div>
                                                </div>
                                                </>
                                        )}

                                        {customerPanelMode !== 'view' && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input value={customerForm.contactName} onChange={(event) => setCustomerForm((prev) => ({ ...prev, contactName: event.target.value }))} placeholder="Nombre contacto" disabled={busy} />
                                                    <input value={customerForm.email} onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Correo" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input value={customerForm.phoneE164} onChange={(event) => setCustomerForm((prev) => ({ ...prev, phoneE164: event.target.value }))} placeholder="Telefono principal (+51...)" disabled={busy} />
                                                    <input value={customerForm.phoneAlt} onChange={(event) => setCustomerForm((prev) => ({ ...prev, phoneAlt: event.target.value }))} placeholder="Telefono alterno" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <select value={customerForm.moduleId} onChange={(event) => setCustomerForm((prev) => ({ ...prev, moduleId: event.target.value }))} disabled={busy}>
                                                        <option value="">Sin modulo</option>
                                                        {waModules.map((moduleItem) => (
                                                            <option key={moduleItem.moduleId} value={moduleItem.moduleId}>{moduleItem.name || moduleItem.moduleId}</option>
                                                        ))}
                                                    </select>
                                                    <input value={customerForm.tagsText} onChange={(event) => setCustomerForm((prev) => ({ ...prev, tagsText: event.target.value }))} placeholder="Etiquetas separadas por coma" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input value={customerForm.profileFirstNames} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileFirstNames: event.target.value }))} placeholder="Nombres" disabled={busy} />
                                                    <input value={customerForm.profileLastNamePaternal} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileLastNamePaternal: event.target.value }))} placeholder="Apellido paterno" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input value={customerForm.profileLastNameMaternal} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileLastNameMaternal: event.target.value }))} placeholder="Apellido materno" disabled={busy} />
                                                    <input value={customerForm.profileDocumentNumber} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileDocumentNumber: event.target.value }))} placeholder="Documento" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <textarea value={customerForm.profileNotes} onChange={(event) => setCustomerForm((prev) => ({ ...prev, profileNotes: event.target.value }))} placeholder="Observaciones" rows={3} style={{ width: '100%' }} disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <label className="saas-admin-module-toggle">
                                                        <input type="checkbox" checked={customerForm.isActive !== false} onChange={(event) => setCustomerForm((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                                                        <span>Cliente activo</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={busy || !customerForm.contactName.trim() || !customerForm.phoneE164.trim()}
                                                        onClick={() => runAction(customerPanelMode === 'create' ? 'Cliente creado' : 'Cliente actualizado', async () => {
                                                            const payload = buildCustomerPayloadFromForm(customerForm);
                                                            if (customerPanelMode === 'create' || !selectedCustomer?.customerId) {
                                                                const created = await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers', {
                                                                    method: 'POST',
                                                                    body: payload
                                                                });
                                                                const createdId = String(created?.item?.customerId || '').trim();
                                                                if (createdId) setSelectedCustomerId(createdId);
                                                                setCustomerPanelMode('view');
                                                                await loadCustomers(tenantScopeId);
                                                                return;
                                                            }

                                                            await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/' + encodeURIComponent(selectedCustomer.customerId), {
                                                                method: 'PUT',
                                                                body: payload
                                                            });
                                                            setCustomerPanelMode('view');
                                                            await loadCustomers(tenantScopeId);
                                                        })}
                                                    >
                                                        {customerPanelMode === 'create' ? 'Guardar cliente' : 'Actualizar cliente'}
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={cancelCustomerEdit}>Cancelar</button>
                                                </div>
                                            </>
                                        )}

                                        <div className="saas-admin-related-block">
                                            <h4>Importacion masiva CSV</h4>
                                            <div className="saas-admin-form-row">
                                                <select value={customerImportModuleId} onChange={(event) => setCustomerImportModuleId(String(event.target.value || '').trim())} disabled={busy}>
                                                    <option value="">Sin modulo por defecto</option>
                                                    {waModules.map((moduleItem) => (
                                                        <option key={'import_module_' + moduleItem.moduleId} value={moduleItem.moduleId}>{moduleItem.name || moduleItem.moduleId}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="saas-admin-form-row">
                                                <textarea
                                                    value={customerCsvText}
                                                    onChange={(event) => setCustomerCsvText(event.target.value)}
                                                    placeholder="Pega CSV con encabezados (IdCliente,Contacto,Telefono,CorreoElectronico,...)"
                                                    rows={6}
                                                    style={{ width: '100%' }}
                                                    disabled={busy}
                                                />
                                            </div>
                                            <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                <button
                                                    type="button"
                                                    disabled={busy || !customerCsvText.trim()}
                                                    onClick={() => runAction('Importacion de clientes ejecutada', async () => {
                                                        await requestJson('/api/admin/saas/tenants/' + encodeURIComponent(tenantScopeId) + '/customers/import-csv', {
                                                            method: 'POST',
                                                            body: {
                                                                csvText: customerCsvText,
                                                                moduleId: customerImportModuleId || undefined
                                                            }
                                                        });
                                                        setCustomerCsvText('');
                                                        await loadCustomers(tenantScopeId);
                                                    })}
                                                >
                                                    Importar CSV
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                    )}

                    {(isGeneralConfigSection || isModulesSection) && (
                    <section id={isModulesSection ? 'saas_modulos' : 'saas_config'} className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <h3>{isModulesSection ? 'Modulos' : 'Configuracion general'}</h3>
                                    <small>
                                        {settingsTenantId
                                            ? `Empresa: ${toTenantDisplayName(tenantOptions.find((tenant) => tenant.id === settingsTenantId) || {})}`
                                            : 'Selecciona una empresa para administrar su panel.'}
                                    </small>
                                </div>

                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    {isModulesSection && (
                                        <button type="button" disabled={busy || !settingsTenantId || !canEditModules} onClick={openConfigModuleCreate}>
                                            Nuevo modulo
                                        </button>
                                    )}
                                    {isGeneralConfigSection && (
                                        <button type="button" disabled={busy || !settingsTenantId} onClick={openConfigSettingsView}>
                                            Abrir configuracion general
                                        </button>
                                    )}
                                    <button type="button" disabled={busy} onClick={clearConfigSelection}>
                                        Deseleccionar
                                    </button>
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {!settingsTenantId && (
                                        <div className="saas-admin-empty-state">
                                            <h4>Sin empresa seleccionada</h4>
                                            <p>Elige una empresa para ver su configuracion.</p>
                                        </div>
                                    )}

                                    {settingsTenantId && isGeneralConfigSection && (
                                        <button
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedConfigKey === 'tenant_settings' ? 'active' : ''}`.trim()}
                                            onClick={openConfigSettingsView}
                                        >
                                            <strong>Perfil de empresa</strong>
                                            <small>Catalogo: {tenantSettings.catalogMode}</small>
                                            <small>Modulos habilitados: {MODULE_KEYS.filter((entry) => tenantSettings?.enabledModules?.[entry.key] !== false).length}/{MODULE_KEYS.length}</small>
                                        </button>
                                    )}

                                    {settingsTenantId && isModulesSection && waModules.length === 0 && (
                                        <div className="saas-admin-empty-inline">Sin modulos WhatsApp configurados.</div>
                                    )}

                                    {settingsTenantId && isModulesSection && waModules.map((moduleItem) => (
                                        <button
                                            key={moduleItem.moduleId}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedConfigKey === `wa_module:${moduleItem.moduleId}` ? 'active' : ''}`.trim()}
                                            onClick={() => openConfigModuleView(moduleItem.moduleId)}
                                        >
                                            <strong>{moduleItem.name || 'Modulo sin nombre'}</strong>
                                            <small>Cloud API | {moduleItem.isActive ? 'activo' : 'inactivo'}{moduleItem.isSelected ? ' | en uso' : ''}</small>
                                            <small>{moduleItem.phoneNumber ? `Numero: ${moduleItem.phoneNumber}` : 'Numero sin configurar'}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>{isModulesSection ? 'Modulos por empresa' : 'Configuracion por empresa'}</h4>
                                        <p>Selecciona una empresa en el panel izquierdo para ver el detalle.</p>
                                    </div>
                                )}

                                {settingsTenantId && !selectedConfigKey && (isGeneralConfigSection || (isModulesSection && waModulePanelMode !== 'create')) && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Sin elemento seleccionado</h4>
                                        <p>{isModulesSection ? 'Selecciona un modulo WhatsApp para ver su detalle.' : 'Selecciona el perfil de empresa para ver su detalle.'}</p>
                                    </div>
                                )}

                                {settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'tenant_settings' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>Perfil de empresa</h3>
                                                <small>{tenantSettingsPanelMode === 'edit' ? 'Edicion activa' : 'Vista de solo lectura'}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                {false && (
                                                    <button type="button" disabled={busy || loadingSettings || !canEditTenantSettings} onClick={openConfigSettingsEdit}>
                                                        Editar
                                                    </button>
                                                )}
                                                {false && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={busy || loadingSettings}
                                                            onClick={() => runAction('Configuracion de tenant guardada', async () => {
                                                                await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/settings`, {
                                                                    method: 'PUT',
                                                                    body: {
                                                                        catalogMode: tenantSettings.catalogMode,
                                                                        enabledModules: tenantSettings.enabledModules
                                                                    }
                                                                });
                                                                setTenantSettingsPanelMode('view');
                                                            })}
                                                        >
                                                            Guardar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy || loadingSettings}
                                                            onClick={async () => {
                                                                try {
                                                                    setBusy(true);
                                                                    await loadTenantSettings(settingsTenantId);
                                                                    setTenantSettingsPanelMode('view');
                                                                } catch (err) {
                                                                    setError(String(err?.message || err || 'No se pudo recargar la configuracion.'));
                                                                } finally {
                                                                    setBusy(false);
                                                                }
                                                            }}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {tenantSettingsPanelMode === 'view' && (
                                            <>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Catalogo</span><strong>{tenantSettings.catalogMode}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Modulos habilitados</span><strong>{MODULE_KEYS.filter((entry) => tenantSettings?.enabledModules?.[entry.key] !== false).length}</strong></div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Estado funcional</h4>
                                                    <div className="saas-admin-related-list">
                                                        {MODULE_KEYS.map((entry) => (
                                                            <div key={`cfg_enabled_${entry.key}`} className="saas-admin-related-row" role="status">
                                                                <span>{entry.label}</span>
                                                                <small>{tenantSettings?.enabledModules?.[entry.key] !== false ? 'Habilitado' : 'Deshabilitado'}</small>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {false && (
                                                    <>
                                                <div className="saas-admin-form-row">
                                                    <select
                                                        value={tenantSettings.catalogMode}
                                                        onChange={(event) => setTenantSettings((prev) => ({ ...prev, catalogMode: event.target.value }))}
                                                        disabled={!settingsTenantId || loadingSettings || busy}
                                                    >
                                                        {CATALOG_MODE_OPTIONS.map((mode) => (
                                                            <option key={mode} value={mode}>{mode}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="saas-admin-modules">
                                                    {MODULE_KEYS.map((moduleEntry) => (
                                                        <label key={moduleEntry.key} className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={tenantSettings?.enabledModules?.[moduleEntry.key] !== false}
                                                                disabled={!settingsTenantId || loadingSettings || busy}
                                                                onChange={(event) => setTenantSettings((prev) => ({
                                                                    ...prev,
                                                                    enabledModules: {
                                                                        ...(prev?.enabledModules || {}),
                                                                        [moduleEntry.key]: event.target.checked
                                                                    }
                                                                }))}
                                                            />
                                                            <span>{moduleEntry.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}

                                {settingsTenantId && isModulesSection && (waModulePanelMode === 'create' || selectedConfigModule) && (() => {
                                    const moduleInDetail = waModulePanelMode === 'create' ? null : selectedConfigModule;
                                    const isModuleEditing = waModulePanelMode === 'edit' || waModulePanelMode === 'create';
                                    const assignedLabels = isModuleEditing
                                        ? assignedModuleUsers.map((user) => toUserDisplayName(user))
                                        : (moduleInDetail?.assignedUserIds || []).map((userId) => {
                                            const match = usersForSettingsTenant.find((user) => String(user?.id || '').trim() === String(userId || '').trim());
                                            return match ? toUserDisplayName(match) : 'Usuario no disponible';
                                        });
                                    const moduleCloudConfig = moduleInDetail?.cloudConfig && typeof moduleInDetail.cloudConfig === 'object'
                                        ? moduleInDetail.cloudConfig
                                        : {};

                                    return (
                                        <>
                                            <div className="saas-admin-pane-header">
                                                <div>
                                                    <h3>
                                                        {waModulePanelMode === 'create'
                                                            ? 'Nuevo modulo WhatsApp'
                                                            : isModuleEditing
                                                                ? `Editando modulo: ${moduleInDetail?.name || 'Sin nombre'}`
                                                                : moduleInDetail?.name || 'Detalle modulo'}
                                                    </h3>
                                                    <small>{isModuleEditing ? 'Edicion activa' : 'Vista de solo lectura'}</small>
                                                </div>
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    {!isModuleEditing && moduleInDetail && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                disabled={busy || !moduleInDetail.isActive}
                                                                onClick={() => handleOpenOperation(moduleInDetail.moduleId)}
                                                            >
                                                                Ir a operacion
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={busy || moduleInDetail.isSelected || !canEditModules}
                                                                onClick={() => runAction('Modulo WA seleccionado', async () => {
                                                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/wa-modules/${encodeURIComponent(moduleInDetail.moduleId)}/select`, {
                                                                        method: 'POST'
                                                                    });
                                                                })}
                                                            >
                                                                {moduleInDetail.isSelected ? 'En uso' : 'Seleccionar'}
                                                            </button>
                                                            <button type="button" disabled={busy || !canEditModules} onClick={openConfigModuleEdit}>Editar</button>
                                                            <button
                                                                type="button"
                                                                disabled={busy || !canEditModules}
                                                                onClick={() => runAction('Estado de modulo actualizado', async () => {
                                                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/wa-modules/${encodeURIComponent(moduleInDetail.moduleId)}`, {
                                                                        method: 'PUT',
                                                                        body: {
                                                                            isActive: moduleInDetail.isActive === false,
                                                                            imageUrl: moduleInDetail.imageUrl || null
                                                                        }
                                                                    });
                                                                })}
                                                            >
                                                                {moduleInDetail.isActive ? 'Desactivar' : 'Activar'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {!isModuleEditing && moduleInDetail && (
                                                <>
                                                    <div className="saas-admin-hero">
                                                        <div className="saas-admin-hero-media">
                                                            {moduleInDetail.imageUrl
                                                                ? <img src={moduleInDetail.imageUrl} alt={moduleInDetail.name || 'Modulo'} className="saas-admin-hero-image" />
                                                                : <div className="saas-admin-hero-placeholder">{buildInitials(moduleInDetail.name || moduleInDetail.moduleId)}</div>}
                                                        </div>
                                                        <div className="saas-admin-hero-content">
                                                            <h4>{moduleInDetail.name || 'Modulo sin nombre'}</h4>
                                                            <p>{moduleInDetail.phoneNumber || 'Sin numero vinculado'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="saas-admin-detail-grid">
                                                        <div className="saas-admin-detail-field"><span>Codigo</span><strong>{moduleInDetail?.moduleId || '-'}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Transporte</span><strong>Cloud API</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Telefono</span><strong>{moduleInDetail.phoneNumber || 'Sin numero'}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Estado</span><strong>{moduleInDetail.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Usuarios asignados</span><strong>{assignedLabels.length}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(moduleInDetail.updatedAt)}</strong></div>
                                                    </div>

                                                    {moduleInDetail.imageUrl && (
                                                        <div className="saas-admin-preview-strip">
                                                            <img src={moduleInDetail.imageUrl} alt={moduleInDetail.name || 'Modulo'} className="saas-admin-preview-thumb" />
                                                        </div>
                                                    )}

                                                    <div className="saas-admin-related-block">
                                                        <h4>Usuarios del modulo</h4>
                                                        <div className="saas-admin-related-list">
                                                            {assignedLabels.length === 0 && <div className="saas-admin-empty-inline">Sin usuarios asignados.</div>}
                                                            {assignedLabels.map((label, index) => (
                                                                <div key={`assigned_label_${index}`} className="saas-admin-related-row" role="status">
                                                                    <span>{label}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Configuracion Meta Cloud</h4>
                                                        <div className="saas-admin-detail-grid">
                                                            <div className="saas-admin-detail-field"><span>META_APP_ID</span><strong>{moduleCloudConfig.appId || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_WABA_ID</span><strong>{moduleCloudConfig.wabaId || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_WABA_PHONE_NUMBER_ID</span><strong>{moduleCloudConfig.phoneNumberId || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_VERIFY_TOKEN</span><strong>{moduleCloudConfig.verifyToken || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_GRAPH_VERSION</span><strong>{moduleCloudConfig.graphVersion || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_DISPLAY_PHONE_NUMBER</span><strong>{moduleCloudConfig.displayPhoneNumber || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_BUSINESS_NAME</span><strong>{moduleCloudConfig.businessName || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_ENFORCE_SIGNATURE</span><strong>{moduleCloudConfig.enforceSignature === false ? 'false' : 'true'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_APP_SECRET</span><strong>{moduleCloudConfig.appSecretMasked || 'No configurado'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_SYSTEM_USER_TOKEN</span><strong>{moduleCloudConfig.systemUserTokenMasked || 'No configurado'}</strong></div>
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            {isModuleEditing && (
                                                <>
                                                    <div className="saas-admin-form-row">
                                                        <input
                                                            value={waModuleForm.name}
                                                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, name: event.target.value }))}
                                                            placeholder="Nombre del modulo"
                                                            disabled={!settingsTenantId || busy}
                                                        />
                                                        <select
                                                            value={waModuleForm.transportMode}
                                                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, transportMode: event.target.value }))}
                                                            disabled={!settingsTenantId || busy || !canEditModules}
                                                        >
                                                            <option value="cloud">Cloud API</option>
                                                        </select>
                                                    </div>

                                                    <div className="saas-admin-form-row">
                                                        <input
                                                            value={waModuleForm.phoneNumber}
                                                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                                                            placeholder="Numero (ej: +51999999999)"
                                                            disabled={!settingsTenantId || busy}
                                                        />
                                                        <select
                                                            value={waModuleForm.moduleCatalogMode}
                                                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleCatalogMode: event.target.value }))}
                                                            disabled={!settingsTenantId || busy}
                                                        >
                                                            <option value="inherit">Catalogo: heredar empresa</option>
                                                            {CATALOG_MODE_OPTIONS.map((mode) => (
                                                                <option key={`module_catalog_${mode}`} value={mode}>{`Catalogo: ${mode}`}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="saas-admin-modules">
                                                        <label className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={waModuleForm.moduleAiEnabled !== false}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleAiEnabled: event.target.checked }))}
                                                                disabled={!settingsTenantId || busy}
                                                            />
                                                            <span>IA habilitada</span>
                                                        </label>
                                                        <label className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={waModuleForm.moduleCatalogEnabled !== false}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleCatalogEnabled: event.target.checked }))}
                                                                disabled={!settingsTenantId || busy}
                                                            />
                                                            <span>Catalogo habilitado</span>
                                                        </label>
                                                        <label className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={waModuleForm.moduleCartEnabled !== false}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleCartEnabled: event.target.checked }))}
                                                                disabled={!settingsTenantId || busy}
                                                            />
                                                            <span>Carrito habilitado</span>
                                                        </label>
                                                        <label className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={waModuleForm.moduleQuickRepliesEnabled !== false}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleQuickRepliesEnabled: event.target.checked }))}
                                                                disabled={!settingsTenantId || busy}
                                                            />
                                                            <span>Respuestas rapidas habilitadas</span>
                                                        </label>
                                                    </div>

                                                    <div className="saas-admin-form-row">
                                                        <ImageDropInput
                                                            label="Reemplazar imagen del modulo"
                                                            disabled={busy}
                                                            onFile={(file) => handleFormImageUpload({
                                                                file,
                                                                scope: 'wa_module_image',
                                                                tenantId: settingsTenantId,
                                                                onUploaded: (url) => setWaModuleForm((prev) => ({ ...prev, imageUrl: url }))
                                                            })}
                                                        />
                                                    </div>

                                                    {waModuleForm.imageUrl && (
                                                        <div className="saas-admin-preview-strip">
                                                            <img src={waModuleForm.imageUrl} alt="Imagen modulo" className="saas-admin-preview-thumb" />
                                                        </div>
                                                    )}

                                                    <div className="saas-admin-form-row">
                                                        <select
                                                            value={moduleUserPickerId}
                                                            onChange={(event) => setModuleUserPickerId(String(event.target.value || '').trim())}
                                                            disabled={!settingsTenantId || busy || availableUsersForModulePicker.length === 0}
                                                        >
                                                            <option value="">Seleccionar usuario para el modulo</option>
                                                            {availableUsersForModulePicker.map((user) => (
                                                                <option key={`wa_module_user_picker_${user.id}`} value={user.id}>{toUserDisplayName(user)}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            disabled={busy || !moduleUserPickerId}
                                                            onClick={() => toggleAssignedUserForModule(moduleUserPickerId)}
                                                        >
                                                            Agregar usuario
                                                        </button>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Usuarios asignados</h4>
                                                        <div className="saas-admin-related-list">
                                                            {assignedModuleUsers.length === 0 && (
                                                                <div className="saas-admin-empty-inline">No hay usuarios asignados al modulo.</div>
                                                            )}
                                                            {assignedModuleUsers.map((user) => (
                                                                <button
                                                                    key={`assigned_user_${user.id}`}
                                                                    type="button"
                                                                    className="saas-admin-related-row"
                                                                    onClick={() => toggleAssignedUserForModule(user.id)}
                                                                    disabled={busy}
                                                                >
                                                                    <span>{toUserDisplayName(user)}</span>
                                                                    <small>Quitar del modulo</small>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Credenciales Meta Cloud</h4>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-app-id">META_APP_ID</label>
                                                                <input
                                                                    id="wa-module-meta-app-id"
                                                                    value={waModuleForm.cloudAppId}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudAppId: event.target.value }))}
                                                                    placeholder="ID de la app de Meta"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-waba-id">META_WABA_ID</label>
                                                                <input
                                                                    id="wa-module-meta-waba-id"
                                                                    value={waModuleForm.cloudWabaId}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudWabaId: event.target.value }))}
                                                                    placeholder="ID de la cuenta WABA"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-phone-id">META_WABA_PHONE_NUMBER_ID</label>
                                                                <input
                                                                    id="wa-module-meta-phone-id"
                                                                    value={waModuleForm.cloudPhoneNumberId}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudPhoneNumberId: event.target.value }))}
                                                                    placeholder="ID del numero de telefono en Meta"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-verify-token">META_VERIFY_TOKEN</label>
                                                                <input
                                                                    id="wa-module-meta-verify-token"
                                                                    value={waModuleForm.cloudVerifyToken}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudVerifyToken: event.target.value }))}
                                                                    placeholder="Token de verificacion del webhook"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-graph-version">META_GRAPH_VERSION</label>
                                                                <input
                                                                    id="wa-module-meta-graph-version"
                                                                    value={waModuleForm.cloudGraphVersion}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudGraphVersion: event.target.value }))}
                                                                    placeholder="Version Graph API (ej: v22.0)"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-display-phone">META_DISPLAY_PHONE_NUMBER</label>
                                                                <input
                                                                    id="wa-module-meta-display-phone"
                                                                    value={waModuleForm.cloudDisplayPhoneNumber}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudDisplayPhoneNumber: event.target.value }))}
                                                                    placeholder="Numero visible (ej: 519XXXXXXXX)"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-business-name">META_BUSINESS_NAME</label>
                                                                <input
                                                                    id="wa-module-meta-business-name"
                                                                    value={waModuleForm.cloudBusinessName}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudBusinessName: event.target.value }))}
                                                                    placeholder="Nombre comercial mostrado"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-app-secret">META_APP_SECRET</label>
                                                                <input
                                                                    id="wa-module-meta-app-secret"
                                                                    type="password"
                                                                    value={waModuleForm.cloudAppSecret}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudAppSecret: event.target.value }))}
                                                                    placeholder={waModuleForm.cloudAppSecretMasked || 'Secreto de la app (opcional para actualizar)'}
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-system-user-token">META_SYSTEM_USER_TOKEN</label>
                                                                <input
                                                                    id="wa-module-meta-system-user-token"
                                                                    type="password"
                                                                    value={waModuleForm.cloudSystemUserToken}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudSystemUserToken: event.target.value }))}
                                                                    placeholder={waModuleForm.cloudSystemUserTokenMasked || 'Token de usuario del sistema (opcional para actualizar)'}
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label>Estado actual de secretos</label>
                                                                <input
                                                                    value={[
                                                                        waModuleForm.cloudAppSecretMasked ? 'APP_SECRET: configurado' : 'APP_SECRET: vacio',
                                                                        waModuleForm.cloudSystemUserTokenMasked ? 'SYSTEM_USER_TOKEN: configurado' : 'SYSTEM_USER_TOKEN: vacio'
                                                                    ].join(' | ')}
                                                                    disabled
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-modules">
                                                            <label className="saas-admin-module-toggle">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={waModuleForm.cloudEnforceSignature !== false}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudEnforceSignature: event.target.checked }))}
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                                <span>META_ENFORCE_SIGNATURE (validar firma X-Hub-Signature-256)</span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                        <button
                                                            type="button"
                                                            disabled={busy || !settingsTenantId || !waModuleForm.name.trim() || !canEditModules}
                                                            onClick={() => runAction(waModulePanelMode === 'create' ? 'Modulo WA creado' : 'Modulo WA actualizado', async () => {
                                                                const existingMetadata = moduleInDetail?.metadata && typeof moduleInDetail.metadata === 'object'
                                                                    ? moduleInDetail.metadata
                                                                    : {};
                                                                const existingCloudConfig = existingMetadata?.cloudConfig && typeof existingMetadata.cloudConfig === 'object'
                                                                    ? existingMetadata.cloudConfig
                                                                    : {};
                                                                const payload = {
                                                                    name: waModuleForm.name,
                                                                    phoneNumber: waModuleForm.phoneNumber,
                                                                    transportMode: 'cloud',
                                                                    imageUrl: waModuleForm.imageUrl || null,
                                                                    assignedUserIds: (Array.isArray(waModuleForm.assignedUserIds) ? waModuleForm.assignedUserIds : [])
                                                                        .map((entry) => String(entry || '').trim())
                                                                        .filter(Boolean),
                                                                    metadata: {
                                                                        ...existingMetadata,
                                                                        moduleSettings: {
                                                                            catalogMode: waModuleForm.moduleCatalogMode || 'inherit',
                                                                            enabledModules: {
                                                                                aiPro: waModuleForm.moduleAiEnabled !== false,
                                                                                catalog: waModuleForm.moduleCatalogEnabled !== false,
                                                                                cart: waModuleForm.moduleCartEnabled !== false,
                                                                                quickReplies: waModuleForm.moduleQuickRepliesEnabled !== false
                                                                            }
                                                                        },
                                                                        cloudConfig: {
                                                                            ...existingCloudConfig,
                                                                            appId: waModuleForm.cloudAppId || undefined,
                                                                            wabaId: waModuleForm.cloudWabaId || undefined,
                                                                            phoneNumberId: waModuleForm.cloudPhoneNumberId || undefined,
                                                                            verifyToken: waModuleForm.cloudVerifyToken || undefined,
                                                                            graphVersion: waModuleForm.cloudGraphVersion || undefined,
                                                                            displayPhoneNumber: waModuleForm.cloudDisplayPhoneNumber || undefined,
                                                                            businessName: waModuleForm.cloudBusinessName || undefined,
                                                                            appSecret: waModuleForm.cloudAppSecret || undefined,
                                                                            systemUserToken: waModuleForm.cloudSystemUserToken || undefined,
                                                                            enforceSignature: waModuleForm.cloudEnforceSignature !== false
                                                                        }
                                                                    }
                                                                };
                                                                if (waModulePanelMode === 'edit' && moduleInDetail?.moduleId) {
                                                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/wa-modules/${encodeURIComponent(moduleInDetail.moduleId)}`, {
                                                                        method: 'PUT',
                                                                        body: payload
                                                                    });
                                                                    setWaModulePanelMode('view');
                                                                    setSelectedConfigKey(`wa_module:${moduleInDetail.moduleId}`);
                                                                    return;
                                                                }

                                                                const createPayload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/wa-modules`, {
                                                                    method: 'POST',
                                                                    body: payload
                                                                });
                                                                const createdModuleId = String(createPayload?.item?.moduleId || '').trim();
                                                                if (createdModuleId) {
                                                                    setSelectedWaModuleId(createdModuleId);
                                                                    setSelectedConfigKey(`wa_module:${createdModuleId}`);
                                                                }
                                                                setWaModulePanelMode('view');
                                                            })}
                                                        >
                                                            {waModulePanelMode === 'create' ? 'Guardar modulo' : 'Actualizar modulo'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => {
                                                                if (moduleInDetail?.moduleId) {
                                                                    openConfigModuleView(moduleInDetail.moduleId);
                                                                    return;
                                                                }
                                                                clearConfigSelection();
                                                            }}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </section>
                    )}


                    {isCatalogSection && (
                    <section id="saas_catalogos" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <h3>Catalogos e IA</h3>
                                    <small>Configuracion por empresa. Las credenciales se guardan cifradas.</small>
                                </div>

                                <div className="saas-admin-form-row">
                                    <select
                                        value={settingsTenantId}
                                        onChange={(event) => setSettingsTenantId(String(event.target.value || '').trim())}
                                        disabled={busy}
                                    >
                                        <option value="">Seleccionar empresa</option>
                                        {tenantOptions.map((tenant) => (
                                            <option key={tenant.id} value={tenant.id}>{toTenantDisplayName(tenant)}</option>
                                        ))}
                                    </select>
                                    <button type="button" disabled={busy || loadingIntegrations} onClick={() => settingsTenantId && loadTenantIntegrations(settingsTenantId)}>
                                        Recargar
                                    </button>
                                </div>

                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    {catalogPanelMode === 'view' && (
                                        <button type="button" disabled={busy || !settingsTenantId || !canEditCatalog} onClick={openCatalogEdit}>Editar</button>
                                    )}
                                    {catalogPanelMode === 'edit' && (
                                        <>
                                            <button
                                                type="button"
                                                disabled={busy || !settingsTenantId || !canEditCatalog}
                                                onClick={() => runAction('Integraciones actualizadas', async () => {
                                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/integrations`, {
                                                        method: 'PUT',
                                                        body: buildIntegrationsUpdatePayload(tenantIntegrations)
                                                    });
                                                    setCatalogPanelMode('view');
                                                    await loadTenantIntegrations(settingsTenantId);
                                                })}
                                            >
                                                Guardar
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy || !settingsTenantId || !canEditCatalog}
                                                onClick={async () => {
                                                    if (!settingsTenantId || !canEditCatalog) return;
                                                    setBusy(true);
                                                    try {
                                                        await loadTenantIntegrations(settingsTenantId);
                                                        setCatalogPanelMode('view');
                                                    } catch (err) {
                                                        setError(String(err?.message || err || 'No se pudo recargar integraciones.'));
                                                    } finally {
                                                        setBusy(false);
                                                    }
                                                }}
                                            >
                                                Cancelar
                                            </button>
                                        </>
                                    )}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Define origen de catalogo, credenciales WooCommerce y modelo IA por tenant.</p>
                                    </div>
                                )}

                                {settingsTenantId && catalogPanelMode === 'view' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>Integraciones activas</h3>
                                                <small>Vista de solo lectura por tenant.</small>
                                            </div>
                                        </div>

                                        <div className="saas-admin-detail-grid">
                                            <div className="saas-admin-detail-field"><span>Modo catalogo</span><strong>{tenantIntegrations.catalogMode}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Meta</span><strong>{tenantIntegrations.metaEnabled ? 'Activo' : 'Inactivo'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>WooCommerce</span><strong>{tenantIntegrations.wooEnabled ? 'Activo' : 'Inactivo'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Catalogo local</span><strong>{tenantIntegrations.localEnabled ? 'Activo' : 'Inactivo'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Modelo IA</span><strong>{tenantIntegrations.aiModel || '-'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>OpenAI Key</span><strong>{tenantIntegrations.openaiApiKeyMasked || 'No configurada'}</strong></div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>WooCommerce</h4>
                                            <div className="saas-admin-related-list">
                                                <div className="saas-admin-related-row" role="status"><span>Base URL</span><small>{tenantIntegrations.wooBaseUrl || 'No configurada'}</small></div>
                                                <div className="saas-admin-related-row" role="status"><span>Per page</span><small>{tenantIntegrations.wooPerPage}</small></div>
                                                <div className="saas-admin-related-row" role="status"><span>Max pages</span><small>{tenantIntegrations.wooMaxPages}</small></div>
                                                <div className="saas-admin-related-row" role="status"><span>Consumer Key</span><small>{tenantIntegrations.wooConsumerKeyMasked || 'No configurada'}</small></div>
                                                <div className="saas-admin-related-row" role="status"><span>Consumer Secret</span><small>{tenantIntegrations.wooConsumerSecretMasked || 'No configurada'}</small></div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {settingsTenantId && catalogPanelMode === 'edit' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>Editar integraciones</h3>
                                                <small>Solo se actualizan secretos si escribes un valor nuevo.</small>
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <select
                                                value={tenantIntegrations.catalogMode}
                                                onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, catalogMode: event.target.value }))}
                                                disabled={busy}
                                            >
                                                {CATALOG_MODE_OPTIONS.map((mode) => (
                                                    <option key={`tenant_catalog_mode_${mode}`} value={mode}>{mode}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="saas-admin-modules">
                                            <label className="saas-admin-module-toggle">
                                                <input type="checkbox" checked={tenantIntegrations.metaEnabled !== false} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, metaEnabled: event.target.checked }))} disabled={busy} />
                                                <span>Meta catalog habilitado</span>
                                            </label>
                                            <label className="saas-admin-module-toggle">
                                                <input type="checkbox" checked={tenantIntegrations.wooEnabled !== false} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, wooEnabled: event.target.checked }))} disabled={busy} />
                                                <span>WooCommerce habilitado</span>
                                            </label>
                                            <label className="saas-admin-module-toggle">
                                                <input type="checkbox" checked={tenantIntegrations.localEnabled !== false} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, localEnabled: event.target.checked }))} disabled={busy} />
                                                <span>Catalogo local habilitado</span>
                                            </label>
                                            <label className="saas-admin-module-toggle">
                                                <input type="checkbox" checked={tenantIntegrations.wooIncludeOutOfStock !== false} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, wooIncludeOutOfStock: event.target.checked }))} disabled={busy} />
                                                <span>Woo incluye sin stock</span>
                                            </label>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <input value={tenantIntegrations.wooBaseUrl} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, wooBaseUrl: event.target.value }))} placeholder="Woo base URL (https://tu-tienda.com)" disabled={busy} />
                                        </div>
                                        <div className="saas-admin-form-row">
                                            <input type="number" min={10} max={500} value={tenantIntegrations.wooPerPage} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, wooPerPage: event.target.value }))} placeholder="Woo per page" disabled={busy} />
                                            <input type="number" min={1} max={200} value={tenantIntegrations.wooMaxPages} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, wooMaxPages: event.target.value }))} placeholder="Woo max pages" disabled={busy} />
                                        </div>
                                        <div className="saas-admin-form-row">
                                            <input value={tenantIntegrations.wooConsumerKey} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, wooConsumerKey: event.target.value }))} placeholder={tenantIntegrations.wooConsumerKeyMasked || 'Woo consumer key (opcional para actualizar)'} disabled={busy} />
                                            <input type="password" value={tenantIntegrations.wooConsumerSecret} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, wooConsumerSecret: event.target.value }))} placeholder={tenantIntegrations.wooConsumerSecretMasked || 'Woo consumer secret (opcional para actualizar)'} disabled={busy} />
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>IA por tenant</h4>
                                            <div className="saas-admin-form-row">
                                                <input value={tenantIntegrations.aiProvider} disabled />
                                                <input value={tenantIntegrations.aiModel} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, aiModel: event.target.value }))} placeholder="Modelo OpenAI" disabled={busy} />
                                            </div>
                                            <div className="saas-admin-form-row">
                                                <input type="password" value={tenantIntegrations.openaiApiKey} onChange={(event) => setTenantIntegrations((prev) => ({ ...prev, openaiApiKey: event.target.value }))} placeholder={tenantIntegrations.openaiApiKeyMasked || 'OpenAI API Key (opcional para actualizar)'} disabled={busy} />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                    )}

                    {isRolesSection && (
                    <section id="saas_roles" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Roles y accesos</h3>
                                        <small>Catalogo global de perfiles de acceso.</small>
                                    </div>
                                    {canManageRoles && (
                                        <button type="button" disabled={busy} onClick={openRoleCreate}>Nuevo rol</button>
                                    )}
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {roleProfiles.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>No hay perfiles de rol cargados.</p>
                                        </div>
                                    )}
                                    {roleProfiles.map((profile) => {
                                        const cleanRole = String(profile?.role || '').trim().toLowerCase();
                                        const roleLabel = String(profile?.label || cleanRole).trim() || cleanRole;
                                        const requiredCount = Array.isArray(profile?.required) ? profile.required.length : 0;
                                        const optionalCount = Array.isArray(profile?.optional) ? profile.optional.length : 0;
                                        return (
                                            <button
                                                key={`role_profile_${cleanRole}`}
                                                type="button"
                                                className={`saas-admin-list-item saas-admin-list-item--button ${selectedRoleKey === cleanRole && rolePanelMode !== 'create' ? 'active' : ''}`.trim()}
                                                onClick={() => openRoleView(cleanRole)}
                                            >
                                                <strong>{roleLabel}</strong>
                                                <small>{cleanRole}</small>
                                                <small>Req: {requiredCount} | Opc: {optionalCount}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!selectedRoleProfile && rolePanelMode !== 'create' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona un rol</h4>
                                        <p>Podras revisar su detalle y, como superadmin, ajustar permisos requeridos, opcionales o bloqueados.</p>
                                    </div>
                                )}

                                {selectedRoleProfile && rolePanelMode === 'view' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{selectedRoleProfile.label || selectedRoleProfile.role}</h3>
                                                <small>Codigo: {selectedRoleProfile.role}</small>
                                            </div>
                                            {canManageRoles && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy} onClick={openRoleEdit}>Editar rol</button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="saas-admin-detail-grid">
                                            <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedRoleProfile.role}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Etiqueta</span><strong>{selectedRoleProfile.label || selectedRoleProfile.role}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Permisos obligatorios</span><strong>{Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required.length : 0}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Permisos opcionales</span><strong>{Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional.length : 0}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Permisos bloqueados</span><strong>{Array.isArray(selectedRoleProfile.blocked) ? selectedRoleProfile.blocked.length : 0}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedRoleProfile.active === false ? 'Inactivo' : 'Activo'}</strong></div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Obligatorios</h4>
                                            <div className="saas-admin-related-list">
                                                {(Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required : []).length === 0 && (
                                                    <div className="saas-admin-related-row" role="status"><span>Sin permisos obligatorios.</span></div>
                                                )}
                                                {(Array.isArray(selectedRoleProfile.required) ? selectedRoleProfile.required : []).map((permissionKey) => (
                                                    <div key={`role_required_${permissionKey}`} className="saas-admin-related-row" role="status">
                                                        <span>{permissionLabelMap.get(permissionKey) || permissionKey}</span>
                                                        <small>{permissionKey}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Opcionales</h4>
                                            <div className="saas-admin-related-list">
                                                {(Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional : []).length === 0 && (
                                                    <div className="saas-admin-related-row" role="status"><span>Sin permisos opcionales.</span></div>
                                                )}
                                                {(Array.isArray(selectedRoleProfile.optional) ? selectedRoleProfile.optional : []).map((permissionKey) => (
                                                    <div key={`role_optional_${permissionKey}`} className="saas-admin-related-row" role="status">
                                                        <span>{permissionLabelMap.get(permissionKey) || permissionKey}</span>
                                                        <small>{permissionKey}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Bloqueados</h4>
                                            <div className="saas-admin-related-list">
                                                {(Array.isArray(selectedRoleProfile.blocked) ? selectedRoleProfile.blocked : []).length === 0 && (
                                                    <div className="saas-admin-related-row" role="status"><span>Sin permisos bloqueados.</span></div>
                                                )}
                                                {(Array.isArray(selectedRoleProfile.blocked) ? selectedRoleProfile.blocked : []).map((permissionKey) => (
                                                    <div key={`role_blocked_${permissionKey}`} className="saas-admin-related-row" role="status">
                                                        <span>{permissionLabelMap.get(permissionKey) || permissionKey}</span>
                                                        <small>{permissionKey}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {(rolePanelMode === 'create' || rolePanelMode === 'edit') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{rolePanelMode === 'create' ? 'Nuevo rol' : `Editando rol: ${roleForm.role || selectedRoleKey}`}</h3>
                                                <small>Define permisos obligatorios, opcionales y bloqueados por perfil.</small>
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <input
                                                value={roleForm.role}
                                                onChange={(event) => setRoleForm((prev) => ({ ...prev, role: sanitizeRoleCode(event.target.value) }))}
                                                placeholder="Codigo rol (ej: support_manager)"
                                                disabled={busy || rolePanelMode !== 'create'}
                                            />
                                            <input
                                                value={roleForm.label}
                                                onChange={(event) => setRoleForm((prev) => ({ ...prev, label: event.target.value }))}
                                                placeholder="Etiqueta visible"
                                                disabled={busy}
                                            />
                                        </div>

                                        <div className="saas-admin-modules">
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={roleForm.active !== false}
                                                    onChange={(event) => setRoleForm((prev) => ({ ...prev, active: event.target.checked }))}
                                                    disabled={busy || (rolePanelMode === 'edit' && selectedRoleProfile?.isSystem === true)}
                                                />
                                                <span>Rol activo</span>
                                            </label>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Matriz de permisos</h4>
                                            <div className="saas-admin-related-list">
                                                {rolePermissionOptions.map((permission) => {
                                                    const permissionKey = String(permission?.key || '').trim();
                                                    const isRequired = roleForm.required.includes(permissionKey);
                                                    const isOptional = roleForm.optional.includes(permissionKey);
                                                    const isBlocked = roleForm.blocked.includes(permissionKey);

                                                    return (
                                                        <div key={`role_permission_matrix_${permissionKey}`} className="saas-admin-related-row" role="status">
                                                            <span>{permission.label || permissionKey}</span>
                                                            <div className="saas-admin-inline-checks">
                                                                <label>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isRequired}
                                                                        onChange={(event) => toggleRolePermission('required', permissionKey, event.target.checked)}
                                                                        disabled={busy}
                                                                    />
                                                                    <small>Obligatorio</small>
                                                                </label>
                                                                <label>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isOptional}
                                                                        onChange={(event) => toggleRolePermission('optional', permissionKey, event.target.checked)}
                                                                        disabled={busy}
                                                                    />
                                                                    <small>Opcional</small>
                                                                </label>
                                                                <label>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isBlocked}
                                                                        onChange={(event) => toggleRolePermission('blocked', permissionKey, event.target.checked)}
                                                                        disabled={busy}
                                                                    />
                                                                    <small>Bloqueado</small>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button
                                                type="button"
                                                disabled={busy || !String(roleForm.role || selectedRoleKey || '').trim()}
                                                onClick={saveRoleProfile}
                                            >
                                                {rolePanelMode === 'create' ? 'Crear rol' : 'Guardar cambios'}
                                            </button>
                                            <button type="button" disabled={busy} onClick={cancelRoleEdit}>Cancelar</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                    )}
                    {isPlansSection && (
                    <section id="saas_planes" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <h3>Planes SaaS</h3>
                                    <small>Control global de limites por plan.</small>
                                </div>

                                <div className="saas-admin-form-row">
                                    <button type="button" disabled={busy || loadingPlans} onClick={loadPlanMatrix}>Recargar planes</button>
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {planIds.map((planId) => (
                                        <button
                                            key={`plan_row_${planId}`}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedPlanId === planId ? 'active' : ''}`.trim()}
                                            onClick={() => openPlanView(planId)}
                                        >
                                            <strong>{planId}</strong>
                                            <small>Usuarios: {Number(planMatrix?.[planId]?.maxUsers || 0)}</small>
                                            <small>Modulos WA: {Number(planMatrix?.[planId]?.maxWaModules || 0)} | Catalogos: {Number(planMatrix?.[planId]?.maxCatalogs || 0)}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!selectedPlan && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona un plan</h4>
                                        <p>Define limites de usuarios, modulos y catalogos segun el plan.</p>
                                    </div>
                                )}

                                {selectedPlan && planPanelMode === 'view' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>Plan: {selectedPlan.id}</h3>
                                                <small>Vista de limites activos</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" disabled={busy} onClick={openPlanEdit}>Editar</button>
                                            </div>
                                        </div>
                                        <div className="saas-admin-detail-grid">
                                            {PLAN_LIMIT_KEYS.map((entry) => (
                                                <div key={`plan_limit_view_${entry.key}`} className="saas-admin-detail-field">
                                                    <span>{entry.label}</span>
                                                    <strong>{Number(selectedPlan?.limits?.[entry.key] || 0)}</strong>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="saas-admin-related-block">
                                            <h4>Features</h4>
                                            <div className="saas-admin-related-list">
                                                {PLAN_FEATURE_KEYS.map((entry) => (
                                                    <div key={`plan_feature_view_${entry.key}`} className="saas-admin-related-row" role="status">
                                                        <span>{entry.label}</span>
                                                        <small>{selectedPlan?.limits?.features?.[entry.key] === false ? 'Deshabilitado' : 'Habilitado'}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {selectedPlan && planPanelMode === 'edit' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>Editando plan: {planForm.id}</h3>
                                                <small>Los cambios aplican globalmente a todos los tenants de este plan.</small>
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            {PLAN_LIMIT_KEYS.slice(0, 2).map((entry) => (
                                                <input
                                                    key={`plan_limit_edit_top_${entry.key}`}
                                                    type="number"
                                                    min={entry.min}
                                                    max={entry.max}
                                                    value={planForm?.[entry.key]}
                                                    onChange={(event) => setPlanForm((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                                                    placeholder={entry.label}
                                                    disabled={busy}
                                                />
                                            ))}
                                        </div>
                                        <div className="saas-admin-form-row">
                                            {PLAN_LIMIT_KEYS.slice(2, 4).map((entry) => (
                                                <input
                                                    key={`plan_limit_edit_mid_${entry.key}`}
                                                    type="number"
                                                    min={entry.min}
                                                    max={entry.max}
                                                    value={planForm?.[entry.key]}
                                                    onChange={(event) => setPlanForm((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                                                    placeholder={entry.label}
                                                    disabled={busy}
                                                />
                                            ))}
                                        </div>
                                        <div className="saas-admin-form-row">
                                            {PLAN_LIMIT_KEYS.slice(4, 6).map((entry) => (
                                                <input
                                                    key={`plan_limit_edit_bottom_${entry.key}`}
                                                    type="number"
                                                    min={entry.min}
                                                    max={entry.max}
                                                    value={planForm?.[entry.key]}
                                                    onChange={(event) => setPlanForm((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                                                    placeholder={entry.label}
                                                    disabled={busy}
                                                />
                                            ))}
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Features del plan</h4>
                                            <div className="saas-admin-modules">
                                                {PLAN_FEATURE_KEYS.map((entry) => (
                                                    <label key={`plan_feature_edit_${entry.key}`} className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={planForm?.features?.[entry.key] !== false}
                                                            onChange={(event) => setPlanForm((prev) => ({
                                                                ...prev,
                                                                features: {
                                                                    ...(prev?.features || {}),
                                                                    [entry.key]: event.target.checked
                                                                }
                                                            }))}
                                                            disabled={busy}
                                                        />
                                                        <span>{entry.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button
                                                type="button"
                                                disabled={busy || !planForm?.id}
                                                onClick={() => runAction('Plan actualizado', async () => {
                                                    const payload = {};
                                                    PLAN_LIMIT_KEYS.forEach((entry) => {
                                                        const rawValue = Number(planForm?.[entry.key]);
                                                        const bounded = Number.isFinite(rawValue)
                                                            ? Math.min(entry.max, Math.max(entry.min, Math.floor(rawValue)))
                                                            : entry.min;
                                                        payload[entry.key] = bounded;
                                                    });

                                                    payload.features = {};
                                                    PLAN_FEATURE_KEYS.forEach((entry) => {
                                                        payload.features[entry.key] = planForm?.features?.[entry.key] !== false;
                                                    });

                                                    await requestJson(`/api/admin/saas/plans/${encodeURIComponent(planForm.id)}`, {
                                                        method: 'PUT',
                                                        body: payload
                                                    });

                                                    await loadPlanMatrix();
                                                    openPlanView(planForm.id);
                                                    setPlanPanelMode('view');
        setRolePanelMode('view');
                                                })}
                                            >
                                                Guardar cambios
                                            </button>
                                            <button type="button" disabled={busy} onClick={cancelPlanEdit}>Cancelar</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}
