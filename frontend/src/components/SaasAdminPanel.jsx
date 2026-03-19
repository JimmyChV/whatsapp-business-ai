import { useCallback, useEffect, useMemo, useState } from 'react';

import * as saasAdminPanelHelpers from './saas/SaasAdminPanel.helpers';

import OperationsSection from './saas/sections/OperationsSection';
import useOperationsPanelState from './saas/hooks/useOperationsPanelState';

const {
    API_BASE,
    EMPTY_TENANT_FORM,
    EMPTY_USER_FORM,
    EMPTY_CUSTOMER_FORM,
    EMPTY_SETTINGS,
    EMPTY_INTEGRATIONS_FORM,
    EMPTY_TENANT_CATALOG_FORM,
    EMPTY_CATALOG_PRODUCT_FORM,
    normalizeCatalogProductItem,
    buildCatalogProductFormFromItem,
    buildCatalogProductPayload,
    normalizeCatalogIdsList,
    normalizeTenantCatalogItem,
    buildTenantCatalogFormFromItem,
    buildTenantCatalogPayload,
    EMPTY_ACCESS_CATALOG,
    normalizeAccessCatalogPayload,
    EMPTY_ROLE_FORM,
    PLAN_LIMIT_KEYS,
    PLAN_FEATURE_KEYS,
    EMPTY_WA_MODULE_FORM,
    EMPTY_AI_ASSISTANT_FORM,
    BASE_ROLE_OPTIONS,
    PLAN_OPTIONS,
    CATALOG_MODE_OPTIONS,
    MODULE_KEYS,
    ADMIN_NAV_ITEMS,
    AI_PROVIDER_OPTIONS,
    AI_MODEL_OPTIONS,
    LAVITAT_FIRST_ASSISTANT_SYSTEM_PROMPT,
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
    ADMIN_IMAGE_MAX_BYTES,
    ADMIN_IMAGE_ALLOWED_MIME_TYPES,
    ADMIN_IMAGE_ALLOWED_EXTENSIONS_LABEL,
    QUICK_REPLY_ALLOWED_MIME_TYPES,
    QUICK_REPLY_ALLOWED_EXTENSIONS,
    QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
    QUICK_REPLY_ACCEPT_VALUE,
    QUICK_REPLY_EXT_TO_MIME,
    QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB,
    QUICK_REPLY_DEFAULT_STORAGE_MB,
    EMPTY_QUICK_REPLY_LIBRARY_FORM,
    EMPTY_QUICK_REPLY_ITEM_FORM,
    DEFAULT_LABEL_COLORS,
    EMPTY_LABEL_FORM,
    normalizeQuickReplyLibraryItem,
    normalizeQuickReplyItem,
    normalizeQuickReplyMediaAsset,
    normalizeQuickReplyMediaAssets,
    resolveQuickReplyAssetPreviewUrl,
    isQuickReplyImageAsset,
    getQuickReplyAssetTypeLabel,
    getQuickReplyAssetDisplayName,
    buildQuickReplyLibraryPayload,
    buildQuickReplyItemPayload,
    normalizeTenantLabelColor,
    normalizeTenantLabelItem,
    buildLabelFormFromItem,
    buildTenantLabelPayload,
    normalizeOverview,
    sanitizeMemberships,
    resolvePrimaryRoleFromMemberships,
    getRolePriority,
    normalizeWaModule,
    sanitizeAiAssistantCode,
    normalizeTenantAiAssistantItem,
    buildAiAssistantFormFromItem,
    buildLavitatAssistantPreset,
    buildAiAssistantPayload,
    normalizeIntegrationsPayload,
    buildIntegrationsUpdatePayload,
    normalizePlanForm,
    normalizeRoleProfileItem,
    buildRoleFormFromItem,
    sanitizeRoleCode,
    buildTenantFormFromItem,
    buildUserFormFromItem,
    normalizeCustomerFormFromItem,
    buildCustomerPayloadFromForm,
    formatDateTimeLabel,
    toTenantDisplayName,
    toUserDisplayName,
    buildInitials,
    formatBytes,
    chunkItems,
    validateImageFile
} = saasAdminPanelHelpers;

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
    preferredTenantId = '',
    launchSource = '',
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
    const [quickReplyModuleFilterId, setQuickReplyModuleFilterId] = useState('');
    const [moduleQuickReplyLibraryDraft, setModuleQuickReplyLibraryDraft] = useState([]);
    const [selectedConfigKey, setSelectedConfigKey] = useState('');
    const [moduleUserPickerId, setModuleUserPickerId] = useState('');
    const [tenantPanelMode, setTenantPanelMode] = useState('view');
    const [userPanelMode, setUserPanelMode] = useState('view');
    const [tenantSettingsPanelMode, setTenantSettingsPanelMode] = useState('view');
    const [waModulePanelMode, setWaModulePanelMode] = useState('view');
    const [tenantIntegrations, setTenantIntegrations] = useState(EMPTY_INTEGRATIONS_FORM);
    const [tenantCatalogs, setTenantCatalogs] = useState([]);
    const [selectedCatalogId, setSelectedCatalogId] = useState('');
    const [tenantCatalogForm, setTenantCatalogForm] = useState(EMPTY_TENANT_CATALOG_FORM);
    const [loadingTenantCatalogs, setLoadingTenantCatalogs] = useState(false);
    const [catalogPanelMode, setCatalogPanelMode] = useState('view');
    const [tenantCatalogProducts, setTenantCatalogProducts] = useState([]);
    const [selectedCatalogProductId, setSelectedCatalogProductId] = useState('');
    const [catalogProductForm, setCatalogProductForm] = useState(EMPTY_CATALOG_PRODUCT_FORM);
    const [catalogProductPanelMode, setCatalogProductPanelMode] = useState('view');
    const [loadingCatalogProducts, setLoadingCatalogProducts] = useState(false);
    const [catalogProductImageUploading, setCatalogProductImageUploading] = useState(false);
    const [catalogProductImageError, setCatalogProductImageError] = useState('');
    const [tenantAiAssistants, setTenantAiAssistants] = useState([]);
    const [selectedAiAssistantId, setSelectedAiAssistantId] = useState('');
    const [aiAssistantForm, setAiAssistantForm] = useState(EMPTY_AI_ASSISTANT_FORM);
    const [aiAssistantPanelMode, setAiAssistantPanelMode] = useState('view');
    const [loadingAiAssistants, setLoadingAiAssistants] = useState(false);
    const [planMatrix, setPlanMatrix] = useState({});
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [planForm, setPlanForm] = useState(() => normalizePlanForm('starter', {}));
    const [planPanelMode, setPlanPanelMode] = useState('view');
    const [accessCatalog, setAccessCatalog] = useState(EMPTY_ACCESS_CATALOG);
    const [loadingAccessCatalog, setLoadingAccessCatalog] = useState(false);
    const [selectedRoleKey, setSelectedRoleKey] = useState('');
    const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
    const [rolePanelMode, setRolePanelMode] = useState('view');
    const [quickReplyLibraries, setQuickReplyLibraries] = useState([]);
    const [quickReplyItems, setQuickReplyItems] = useState([]);
    const [selectedQuickReplyLibraryId, setSelectedQuickReplyLibraryId] = useState('');
    const [selectedQuickReplyItemId, setSelectedQuickReplyItemId] = useState('');
    const [quickReplyLibraryForm, setQuickReplyLibraryForm] = useState({ ...EMPTY_QUICK_REPLY_LIBRARY_FORM });
    const [quickReplyItemForm, setQuickReplyItemForm] = useState({ ...EMPTY_QUICK_REPLY_ITEM_FORM });
    const [quickReplyLibraryPanelMode, setQuickReplyLibraryPanelMode] = useState('view');
    const [quickReplyItemPanelMode, setQuickReplyItemPanelMode] = useState('view');
    const [quickReplyLibrarySearch, setQuickReplyLibrarySearch] = useState('');
    const [quickReplyItemSearch, setQuickReplyItemSearch] = useState('');
    const [loadingQuickReplies, setLoadingQuickReplies] = useState(false);
    const [uploadingQuickReplyAssets, setUploadingQuickReplyAssets] = useState(false);
    const [tenantLabels, setTenantLabels] = useState([]);
    const [selectedLabelId, setSelectedLabelId] = useState('');
    const [labelForm, setLabelForm] = useState({ ...EMPTY_LABEL_FORM });
    const [labelPanelMode, setLabelPanelMode] = useState('view');
    const [labelSearch, setLabelSearch] = useState('');
    const [loadingLabels, setLoadingLabels] = useState(false);

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
    const roleBasedCanManageTenants = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const roleBasedCanManageUsers = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageTenantSettings = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || noRoleContext);
    const roleBasedCanManageCatalog = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageRoles = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const roleBasedCanViewSuperAdminSections = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || noRoleContext);
    const roleBasedCanEditModules = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageQuickReplies = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageLabels = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageCustomers = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanViewAi = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);
    const roleBasedCanManageAi = Boolean(isSuperAdmin || normalizedRole === 'superadmin' || normalizedRole === 'owner' || normalizedRole === 'admin' || noRoleContext);

    const actorRoleForPolicy = isSuperAdmin || normalizedRole === 'superadmin' ? 'superadmin' : (normalizedRole || 'seller');
    const actorRolePriority = getRolePriority(actorRoleForPolicy);
    const currentUserId = String(currentUser?.userId || currentUser?.id || '').trim();
    const actorPermissionSet = useMemo(() => new Set(
        (Array.isArray(currentUser?.permissions) ? currentUser.permissions : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
    ), [currentUser?.permissions]);

    const hasPermissionContext = Boolean(
        isSuperAdmin
        || normalizedRole === 'superadmin'
        || actorPermissionSet.size > 0
    );

    const hasAnyActorPermission = useCallback((keys = []) => {
        if (isSuperAdmin || normalizedRole === 'superadmin') return true;
        const source = Array.isArray(keys) ? keys : [];
        return source.some((key) => actorPermissionSet.has(String(key || '').trim()));
    }, [actorPermissionSet, isSuperAdmin, normalizedRole]);

    const canManageTenants = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_PLATFORM_TENANTS_MANAGE])
        : roleBasedCanManageTenants;
    const canManageUsers = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_USERS_MANAGE])
        : roleBasedCanManageUsers;
    const canManageTenantSettings = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_SETTINGS_MANAGE])
        : roleBasedCanManageTenantSettings;
    const canViewTenantSettings = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_SETTINGS_READ, PERMISSION_TENANT_SETTINGS_MANAGE])
        : roleBasedCanManageTenantSettings;
    const canManageCatalog = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_CATALOGS_MANAGE])
        : roleBasedCanManageCatalog;
    const canManageRoles = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_PLATFORM_TENANTS_MANAGE, PERMISSION_PLATFORM_PLANS_MANAGE])
        : roleBasedCanManageRoles;
    const canViewSuperAdminSections = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_PLATFORM_OVERVIEW_READ, PERMISSION_PLATFORM_TENANTS_MANAGE, PERMISSION_PLATFORM_PLANS_MANAGE])
        : roleBasedCanViewSuperAdminSections;
    const canEditTenantSettings = canManageTenantSettings;
    const canEditModules = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_MODULES_MANAGE])
        : roleBasedCanEditModules;
    const canViewModules = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_MODULES_READ, PERMISSION_TENANT_MODULES_MANAGE])
        : roleBasedCanEditModules;
    const canManageQuickReplies = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_QUICK_REPLIES_MANAGE,
            PERMISSION_TENANT_MODULES_MANAGE
        ])
        : roleBasedCanManageQuickReplies;
    const canViewQuickReplies = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_QUICK_REPLIES_READ,
            PERMISSION_TENANT_QUICK_REPLIES_MANAGE,
            PERMISSION_TENANT_MODULES_READ,
            PERMISSION_TENANT_MODULES_MANAGE
        ])
        : roleBasedCanManageQuickReplies;
    const canManageLabels = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_LABELS_MANAGE,
            PERMISSION_TENANT_MODULES_MANAGE
        ])
        : roleBasedCanManageLabels;
    const canViewLabels = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_LABELS_READ,
            PERMISSION_TENANT_LABELS_MANAGE,
            PERMISSION_TENANT_MODULES_READ,
            PERMISSION_TENANT_MODULES_MANAGE
        ])
        : roleBasedCanManageLabels;
    const canViewAi = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_AI_READ,
            PERMISSION_TENANT_AI_MANAGE,
            PERMISSION_TENANT_INTEGRATIONS_READ,
            PERMISSION_TENANT_INTEGRATIONS_MANAGE
        ])
        : roleBasedCanViewAi;
    const canManageAi = hasPermissionContext
        ? hasAnyActorPermission([
            PERMISSION_TENANT_AI_MANAGE,
            PERMISSION_TENANT_INTEGRATIONS_MANAGE
        ])
        : roleBasedCanManageAi;
    const canViewCustomers = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_CUSTOMERS_READ, PERMISSION_TENANT_CUSTOMERS_MANAGE])
        : roleBasedCanManageCustomers;
    const canManageCustomers = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_CUSTOMERS_MANAGE])
        : roleBasedCanManageCustomers;
    const canViewOperations = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_KPIS_READ, PERMISSION_TENANT_CHAT_ASSIGNMENTS_READ, PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE])
        : Boolean(roleBasedCanManageTenantSettings || roleBasedCanManageUsers);
    const canManageAssignments = hasPermissionContext
        ? hasAnyActorPermission([PERMISSION_TENANT_CHAT_ASSIGNMENTS_MANAGE])
        : Boolean(roleBasedCanManageTenantSettings || roleBasedCanManageUsers);
    const {
        assignmentRules,
        setAssignmentRules,
        loadingAssignmentRules,
        operationsKpis,
        loadingOperationsKpis,
        unassignedCandidates: activeTenantChatCandidates,
        operationsSnapshot,
        loadTenantAssignmentRules,
        loadTenantOperationsKpis,
        saveAssignmentRules,
        triggerAutoAssignPreview,
        resetOperationsState
    } = useOperationsPanelState({
        canViewOperations,
        buildApiHeaders
    });
    const canEditCatalog = canManageCatalog;
    const requiresTenantSelection = Boolean(isSuperAdmin || normalizedRole === 'superadmin');
    const showPanelLoading = Boolean(
        busy || loadingSettings || loadingIntegrations || loadingPlans || loadingAccessCatalog || loadingAiAssistants || loadingAssignmentRules || loadingOperationsKpis || pendingRequests > 0
    );
    const canActorManageRoleChanges = Boolean(
        actorRoleForPolicy === 'superadmin'
        || actorRoleForPolicy === 'owner'
        || (actorRoleForPolicy === 'admin' && actorPermissionSet.has(PERMISSION_OWNER_ASSIGN))
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

    const resolveQuickReplyMimeType = (file) => {
        const fileType = String(file?.type || '').trim().toLowerCase();
        if (fileType && QUICK_REPLY_ALLOWED_MIME_TYPES.includes(fileType)) return fileType;
        const fileName = String(file?.name || '').trim().toLowerCase();
        const extMatch = fileName.match(/\.[a-z0-9]+$/i);
        const ext = String(extMatch?.[0] || '').trim().toLowerCase();
        const mimeFromExt = QUICK_REPLY_EXT_TO_MIME[ext] || '';
        if (mimeFromExt && QUICK_REPLY_ALLOWED_MIME_TYPES.includes(mimeFromExt)) return mimeFromExt;
        return fileType || '';
    };

    const buildDataUrlWithMime = async (file, mimeType = '') => {
        const rawDataUrl = await readFileAsDataUrl(file);
        const base64Payload = String(rawDataUrl || '').split(',')[1] || '';
        if (!base64Payload) throw new Error('No se pudo leer el adjunto seleccionado.');
        const cleanMime = String(mimeType || '').trim().toLowerCase();
        if (!cleanMime) throw new Error('No se pudo detectar el tipo de archivo.');
        return `data:${cleanMime};base64,${base64Payload}`;
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
        if (canManageLabels) capabilities.push('Etiquetas de chat');
        if (canManageTenantSettings) capabilities.push('Configuracion de empresa');
        if (canEditModules) capabilities.push('Modulos WhatsApp');
        if (canViewSuperAdminSections) capabilities.push('Planes y roles globales');
        if (canEditOptionalAccess) capabilities.push('Accesos opcionales');
        return capabilities;
    }, [canManageTenants, canManageUsers, canManageCatalog, canManageLabels, canManageQuickReplies, canManageAi, canManageTenantSettings, canEditModules, canViewSuperAdminSections, canEditOptionalAccess]);

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

    const quickReplyScopeModuleId = useMemo(
        () => String(quickReplyModuleFilterId || '').trim().toLowerCase(),
        [quickReplyModuleFilterId]
    );

    const quickReplyLibrariesByScope = useMemo(() => {
        if (!quickReplyScopeModuleId) return Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [];
        return (Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [])
            .filter((entry) => entry.isShared || (Array.isArray(entry.moduleIds) && entry.moduleIds.includes(quickReplyScopeModuleId)));
    }, [quickReplyLibraries, quickReplyScopeModuleId]);

    
    const selectedQuickReplyLibrary = useMemo(
        () => quickReplyLibraries.find((entry) => String(entry?.libraryId || '').trim().toUpperCase() === String(selectedQuickReplyLibraryId || '').trim().toUpperCase()) || null,
        [quickReplyLibraries, selectedQuickReplyLibraryId]
    );

    const quickReplyItemsForSelectedLibrary = useMemo(() => {
        const cleanLibraryId = String(selectedQuickReplyLibrary?.libraryId || '').trim().toUpperCase();
        if (!cleanLibraryId) return [];
        return (Array.isArray(quickReplyItems) ? quickReplyItems : [])
            .filter((entry) => String(entry?.libraryId || '').trim().toUpperCase() === cleanLibraryId)
            .sort((left, right) => String(left?.label || '').localeCompare(String(right?.label || ''), 'es', { sensitivity: 'base' }));
    }, [quickReplyItems, selectedQuickReplyLibrary]);

    const selectedQuickReplyItem = useMemo(
        () => quickReplyItemsForSelectedLibrary.find((entry) => String(entry?.itemId || '').trim().toUpperCase() === String(selectedQuickReplyItemId || '').trim().toUpperCase()) || null,
        [quickReplyItemsForSelectedLibrary, selectedQuickReplyItemId]
    );
    const selectedQuickReplyItemMediaAssets = useMemo(
        () => normalizeQuickReplyMediaAssets(selectedQuickReplyItem?.mediaAssets, {
            url: selectedQuickReplyItem?.mediaUrl || '',
            mimeType: selectedQuickReplyItem?.mediaMimeType || '',
            fileName: selectedQuickReplyItem?.mediaFileName || '',
            sizeBytes: selectedQuickReplyItem?.mediaSizeBytes
        }),
        [selectedQuickReplyItem]
    );
    const quickReplyItemFormAssets = useMemo(
        () => normalizeQuickReplyMediaAssets(quickReplyItemForm?.mediaAssets, {
            url: quickReplyItemForm?.mediaUrl || '',
            mimeType: quickReplyItemForm?.mediaMimeType || '',
            fileName: quickReplyItemForm?.mediaFileName || '',
            sizeBytes: quickReplyItemForm?.mediaSizeBytes
        }),
        [quickReplyItemForm?.mediaAssets, quickReplyItemForm?.mediaUrl, quickReplyItemForm?.mediaMimeType, quickReplyItemForm?.mediaFileName, quickReplyItemForm?.mediaSizeBytes]
    );

    const visibleQuickReplyLibraries = useMemo(() => {
        const query = String(quickReplyLibrarySearch || '').trim().toLowerCase();
        const source = Array.isArray(quickReplyLibrariesByScope) ? quickReplyLibrariesByScope : [];
        const sorted = [...source].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' }));
        if (!query) return sorted;
        return sorted.filter((entry) => {
            const haystack = [
                entry?.libraryId,
                entry?.name,
                entry?.description,
                entry?.isShared ? 'compartida' : 'modulo'
            ].map((value) => String(value || '').toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }, [quickReplyLibrariesByScope, quickReplyLibrarySearch]);

    const visibleQuickReplyItemsForSelectedLibrary = useMemo(() => {
        const query = String(quickReplyItemSearch || '').trim().toLowerCase();
        const source = Array.isArray(quickReplyItemsForSelectedLibrary) ? quickReplyItemsForSelectedLibrary : [];
        if (!query) return source;
        return source.filter((entry) => {
            const haystack = [
                entry?.itemId,
                entry?.label,
                entry?.text,
                entry?.mediaFileName,
                entry?.mediaMimeType
            ].map((value) => String(value || '').toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }, [quickReplyItemsForSelectedLibrary, quickReplyItemSearch]);
        const tenantLabelItems = useMemo(() => {
        return [...(Array.isArray(tenantLabels) ? tenantLabels : [])]
            .map((entry) => normalizeTenantLabelItem(entry))
            .filter(Boolean)
            .sort((left, right) => {
                const delta = Number(left?.sortOrder || 100) - Number(right?.sortOrder || 100);
                if (delta !== 0) return delta;
                return String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' });
            });
    }, [tenantLabels]);

    const selectedTenantLabel = useMemo(
        () => tenantLabelItems.find((entry) => String(entry?.labelId || '').trim().toUpperCase() === String(selectedLabelId || '').trim().toUpperCase()) || null,
        [tenantLabelItems, selectedLabelId]
    );

    const visibleTenantLabels = useMemo(() => {
        const query = String(labelSearch || '').trim().toLowerCase();
        if (!query) return tenantLabelItems;
        return tenantLabelItems.filter((entry) => {
            const haystack = [entry?.labelId, entry?.name, entry?.description]
                .map((value) => String(value || '').toLowerCase())
                .join(' ');
            return haystack.includes(query);
        });
    }, [tenantLabelItems, labelSearch]);

    const selectedSettingsTenant = useMemo(
        () => tenantOptions.find((tenant) => String(tenant?.id || '').trim() === String(settingsTenantId || '').trim()) || null,
        [tenantOptions, settingsTenantId]
    );
    const quickReplyTenantPlanId = useMemo(() => {
        const clean = String(selectedSettingsTenant?.plan || 'starter').trim().toLowerCase();
        return clean || 'starter';
    }, [selectedSettingsTenant]);
    const quickReplyUploadMaxMb = useMemo(() => {
        const fromPlan = Number(planMatrix?.[quickReplyTenantPlanId]?.quickReplyMaxUploadMb);
        if (Number.isFinite(fromPlan) && fromPlan > 0) return Math.max(1, Math.min(1024, Math.floor(fromPlan)));
        return QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB;
    }, [planMatrix, quickReplyTenantPlanId]);
    const quickReplyStorageQuotaMb = useMemo(() => {
        const fromPlan = Number(planMatrix?.[quickReplyTenantPlanId]?.quickReplyStorageQuotaMb);
        if (Number.isFinite(fromPlan) && fromPlan > 0) return Math.max(10, Math.min(200000, Math.floor(fromPlan)));
        return QUICK_REPLY_DEFAULT_STORAGE_MB;
    }, [planMatrix, quickReplyTenantPlanId]);
    const quickReplyUploadMaxBytes = useMemo(() => quickReplyUploadMaxMb * 1024 * 1024, [quickReplyUploadMaxMb]);

    const selectedConfigModule = useMemo(() => {
        if (!String(selectedConfigKey || '').startsWith('wa_module:')) return null;
        const moduleId = String(selectedConfigKey || '').slice('wa_module:'.length).trim();
        if (!moduleId) return null;
        return waModules.find((item) => String(item?.moduleId || '').trim() === moduleId) || null;
    }, [selectedConfigKey, waModules]);
    const activeQuickReplyLibraries = useMemo(() => {
        return (Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [])
            .filter((entry) => entry?.isActive !== false)
            .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' }));
    }, [quickReplyLibraries]);

    const moduleQuickReplySourceModuleId = useMemo(
        () => String(waModuleForm?.moduleId || selectedConfigModule?.moduleId || '').trim().toLowerCase(),
        [waModuleForm?.moduleId, selectedConfigModule?.moduleId]
    );

    const moduleQuickReplyAssignedLibraries = useMemo(() => {
        if (!moduleQuickReplySourceModuleId) return [];
        return activeQuickReplyLibraries.filter((library) => (
            library.isShared === true
            || (Array.isArray(library.moduleIds) && library.moduleIds.includes(moduleQuickReplySourceModuleId))
        ));
    }, [activeQuickReplyLibraries, moduleQuickReplySourceModuleId]);

    const moduleQuickReplyAssignedLibraryIds = useMemo(
        () => new Set(moduleQuickReplyAssignedLibraries.map((entry) => String(entry?.libraryId || '').trim().toUpperCase()).filter(Boolean)),
        [moduleQuickReplyAssignedLibraries]
    );

    const tenantCatalogItems = useMemo(() => {
        return [...(Array.isArray(tenantCatalogs) ? tenantCatalogs : [])]
            .map((entry) => normalizeTenantCatalogItem(entry))
            .filter(Boolean)
            .sort((a, b) => String(a?.name || a?.catalogId || '').localeCompare(String(b?.name || b?.catalogId || ''), 'es', { sensitivity: 'base' }));
    }, [tenantCatalogs]);

    const selectedTenantCatalog = useMemo(
        () => tenantCatalogItems.find((entry) => String(entry?.catalogId || '').trim().toUpperCase() === String(selectedCatalogId || '').trim().toUpperCase()) || null,
        [tenantCatalogItems, selectedCatalogId]
    );


    const selectedCatalogProduct = useMemo(
        () => (Array.isArray(tenantCatalogProducts) ? tenantCatalogProducts : []).find((item) => String(item?.productId || '').trim() === String(selectedCatalogProductId || '').trim()) || null,
        [tenantCatalogProducts, selectedCatalogProductId]
    );
    const activeCatalogOptions = useMemo(
        () => tenantCatalogItems.filter((entry) => entry?.isActive !== false),
        [tenantCatalogItems]
    );

    const activeCatalogLabelMap = useMemo(() => {
        const map = new Map();
        activeCatalogOptions.forEach((entry) => {
            const key = String(entry?.catalogId || '').trim().toUpperCase();
            if (!key) return;
            map.set(key, String(entry?.name || key).trim() || key);
        });
        return map;
    }, [activeCatalogOptions]);

    const tenantAiAssistantItems = useMemo(() => {
        return [...(Array.isArray(tenantAiAssistants) ? tenantAiAssistants : [])]
            .map((entry) => normalizeTenantAiAssistantItem(entry))
            .filter(Boolean)
            .sort((a, b) => String(a?.name || a?.assistantId || '').localeCompare(String(b?.name || b?.assistantId || ''), 'es', { sensitivity: 'base' }));
    }, [tenantAiAssistants]);

    const activeAiAssistantOptions = useMemo(
        () => tenantAiAssistantItems.filter((entry) => entry?.isActive !== false),
        [tenantAiAssistantItems]
    );

    const selectedAiAssistant = useMemo(
        () => tenantAiAssistantItems.find((entry) => String(entry?.assistantId || '').trim().toUpperCase() === String(selectedAiAssistantId || '').trim().toUpperCase()) || null,
        [tenantAiAssistantItems, selectedAiAssistantId]
    );

    const defaultAiAssistantId = useMemo(() => {
        const explicit = tenantAiAssistantItems.find((entry) => entry.isDefault === true && entry.isActive !== false);
        if (explicit?.assistantId) return explicit.assistantId;
        return activeAiAssistantOptions[0]?.assistantId || '';
    }, [tenantAiAssistantItems, activeAiAssistantOptions]);

    const aiAssistantLabelMap = useMemo(() => {
        const map = new Map();
        tenantAiAssistantItems.forEach((entry) => {
            const key = String(entry?.assistantId || '').trim().toUpperCase();
            if (!key) return;
            map.set(key, String(entry?.name || key).trim() || key);
        });
        return map;
    }, [tenantAiAssistantItems]);
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
        if (cleanId === 'saas_clientes') return canViewCustomers;
        if (cleanId === 'saas_operacion') return canViewOperations;
        if (cleanId === 'saas_ia') return canViewAi;
        if (cleanId === 'saas_etiquetas') return canViewLabels;
        if (cleanId === 'saas_quick_replies') return canViewQuickReplies;
        if (cleanId === 'saas_modulos') return canViewModules;
        if (cleanId === 'saas_catalogos') return canManageCatalog;
        if (cleanId === 'saas_planes') return canViewSuperAdminSections;
        if (cleanId === 'saas_roles') return canViewSuperAdminSections;
        if (cleanId === 'saas_config') return canViewTenantSettings;
        return true;
    }, [
        canManageTenants,
        canManageUsers,
        canViewCustomers,
        canViewOperations,
        canViewAi,
        canViewLabels,
        canViewQuickReplies,
        canViewModules,
        canManageCatalog,
        canViewSuperAdminSections,
        canViewTenantSettings
    ]);

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
    const isOperationsSection = selectedSectionId === 'saas_operacion';
    const isAiSection = selectedSectionId === 'saas_ia';
    const isLabelsSection = selectedSectionId === 'saas_etiquetas';
    const isQuickRepliesSection = selectedSectionId === 'saas_quick_replies';
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

        if (next === 'saas_ia') {
            setSelectedAiAssistantId('');
            setAiAssistantPanelMode('view');
            setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM });
        }

        if (next === 'saas_etiquetas') {
            setSelectedLabelId('');
            setLabelPanelMode('view');
            setLabelForm({ ...EMPTY_LABEL_FORM });
        }

        if (next === 'saas_quick_replies') {
            setSelectedQuickReplyLibraryId('');
            setSelectedQuickReplyItemId('');
            setQuickReplyModuleFilterId('');
            setQuickReplyLibraryPanelMode('view');
            setQuickReplyItemPanelMode('view');
            setQuickReplyLibraryForm({ ...EMPTY_QUICK_REPLY_LIBRARY_FORM });
            setQuickReplyItemForm({ ...EMPTY_QUICK_REPLY_ITEM_FORM });
        }

        if (next === 'saas_config') {
            clearConfigSelection();
        }
        if (next === 'saas_modulos') {
            clearConfigSelection();
        }

        setCurrentSection(next);
    };
    const assignmentRoleOptions = ['seller', 'admin', 'owner'];

    const operationTenantId = useMemo(() => {
        if (requiresTenantSelection) return String(settingsTenantId || '').trim();
        return String(tenantScopeId || settingsTenantId || activeTenantId || '').trim();
    }, [requiresTenantSelection, settingsTenantId, tenantScopeId, activeTenantId]);
    const hasActiveModuleForOperation = Boolean(
        (Array.isArray(waModules) ? waModules : []).some((moduleItem) =>
            String(moduleItem?.moduleId || '').trim() && moduleItem?.isActive !== false
        )
    );
    const canOpenOperation = Boolean(
        typeof onOpenWhatsAppOperation === 'function'
        && operationTenantId
        && hasActiveModuleForOperation
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
        setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
        setTenantCatalogProducts([]);
        setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
        setCatalogProductImageError('');
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

    const loadTenantAiAssistants = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantAiAssistants([]);
            setSelectedAiAssistantId('');
            setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM });
            setAiAssistantPanelMode('view');
            return;
        }

        setLoadingAiAssistants(true);
        try {
            const payload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/ai-assistants`);
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map((entry) => normalizeTenantAiAssistantItem(entry))
                .filter(Boolean);
            const defaultAssistantId = sanitizeAiAssistantCode(payload?.defaultAssistantId || '');
            const normalizedItems = items.map((entry) => {
                if (!defaultAssistantId) return entry;
                return {
                    ...entry,
                    isDefault: entry.assistantId === defaultAssistantId
                };
            });
            setTenantAiAssistants(normalizedItems);
            setSelectedAiAssistantId((prev) => {
                const cleanPrev = sanitizeAiAssistantCode(prev || '');
                if (cleanPrev && normalizedItems.some((entry) => entry.assistantId === cleanPrev)) return cleanPrev;
                return '';
            });
        } finally {
            setLoadingAiAssistants(false);
        }
    };
    const loadQuickReplyData = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setQuickReplyLibraries([]);
            setQuickReplyItems([]);
            setSelectedQuickReplyLibraryId('');
            setSelectedQuickReplyItemId('');
            setQuickReplyModuleFilterId('');
            setQuickReplyLibraryForm({ ...EMPTY_QUICK_REPLY_LIBRARY_FORM });
            setQuickReplyItemForm({ ...EMPTY_QUICK_REPLY_ITEM_FORM });
            setQuickReplyLibraryPanelMode('view');
            setQuickReplyItemPanelMode('view');
            return;
        }

        setLoadingQuickReplies(true);
        try {
            const [librariesPayload, itemsPayload] = await Promise.all([
                requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries?includeInactive=true`),
                requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items?includeInactive=true`)
            ]);

            const libraries = (Array.isArray(librariesPayload?.items) ? librariesPayload.items : [])
                .map((entry) => normalizeQuickReplyLibraryItem(entry))
                .filter(Boolean)
                .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' }));

            const items = (Array.isArray(itemsPayload?.items) ? itemsPayload.items : [])
                .map((entry) => normalizeQuickReplyItem(entry))
                .filter(Boolean);

            setQuickReplyLibraries(libraries);
            setQuickReplyItems(items);
            setQuickReplyModuleFilterId((prev) => {
                const cleanPrev = String(prev || '').trim().toLowerCase();
                if (!cleanPrev) return cleanPrev;
                const exists = (waModules || []).some((entry) => String(entry?.moduleId || '').trim().toLowerCase() === cleanPrev);
                return exists ? cleanPrev : '';
            });
            setSelectedQuickReplyLibraryId((prev) => {
                const cleanPrev = String(prev || '').trim().toUpperCase();
                if (cleanPrev && libraries.some((entry) => entry.libraryId === cleanPrev)) return cleanPrev;
                return String(libraries[0]?.libraryId || '').trim().toUpperCase();
            });
            setSelectedQuickReplyItemId((prev) => {
                const cleanPrev = String(prev || '').trim().toUpperCase();
                if (!cleanPrev) return '';
                return items.some((entry) => entry.itemId === cleanPrev) ? cleanPrev : '';
            });
        } finally {
            setLoadingQuickReplies(false);
        }
    };

        const loadTenantLabels = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantLabels([]);
            setSelectedLabelId('');
            setLabelForm({ ...EMPTY_LABEL_FORM });
            setLabelPanelMode('view');
            return;
        }

        setLoadingLabels(true);
        try {
            const payload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels?includeInactive=true`);
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map((entry) => normalizeTenantLabelItem(entry))
                .filter(Boolean)
                .sort((left, right) => {
                    const delta = Number(left?.sortOrder || 100) - Number(right?.sortOrder || 100);
                    if (delta !== 0) return delta;
                    return String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' });
                });

            setTenantLabels(items);
            setSelectedLabelId((prev) => {
                const cleanPrev = String(prev || '').trim().toUpperCase();
                if (cleanPrev && items.some((entry) => entry.labelId === cleanPrev)) return cleanPrev;
                return String(items[0]?.labelId || '').trim().toUpperCase();
            });
        } finally {
            setLoadingLabels(false);
        }
    };
    const openTenantLabelCreate = () => {
        setLabelForm({ ...EMPTY_LABEL_FORM, color: DEFAULT_LABEL_COLORS[0], sortOrder: '100', isActive: true });
        setLabelPanelMode('create');
    };

    const openTenantLabelEdit = () => {
        if (!selectedTenantLabel) return;
        setLabelForm(buildLabelFormFromItem(selectedTenantLabel));
        setLabelPanelMode('edit');
    };

    const cancelTenantLabelEdit = () => {
        if (selectedTenantLabel) {
            setLabelForm(buildLabelFormFromItem(selectedTenantLabel));
        } else {
            setLabelForm({ ...EMPTY_LABEL_FORM });
        }
        setLabelPanelMode('view');
    };

    const toggleModuleInLabelForm = (moduleId) => {
        const cleanModuleId = String(moduleId || '').trim().toLowerCase();
        if (!cleanModuleId) return;
        setLabelForm((prev) => {
            const current = Array.isArray(prev?.moduleIds) ? prev.moduleIds : [];
            const exists = current.includes(cleanModuleId);
            return {
                ...prev,
                moduleIds: exists
                    ? current.filter((entry) => entry !== cleanModuleId)
                    : [...current, cleanModuleId]
            };
        });
    };

    const saveTenantLabel = async () => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        if (!cleanTenantId) throw new Error('Selecciona una empresa para gestionar etiquetas.');
        const payload = buildTenantLabelPayload(labelForm, { allowLabelId: labelPanelMode === 'create' });
        if (!String(payload.name || '').trim()) throw new Error('Nombre de etiqueta requerido.');

        if (labelPanelMode === 'create') {
            const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels`, {
                method: 'POST',
                body: payload
            });
            const createdId = String(created?.item?.labelId || '').trim().toUpperCase();
            await loadTenantLabels(cleanTenantId);
            if (createdId) setSelectedLabelId(createdId);
            setLabelPanelMode('view');
            return;
        }

        const cleanLabelId = String(labelForm?.labelId || selectedLabelId || '').trim().toUpperCase();
        if (!cleanLabelId) throw new Error('Selecciona una etiqueta para actualizar.');

        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels/${encodeURIComponent(cleanLabelId)}`, {
            method: 'PUT',
            body: payload
        });
        await loadTenantLabels(cleanTenantId);
        setSelectedLabelId(cleanLabelId);
        setLabelPanelMode('view');
    };

    const deactivateTenantLabel = async (labelId) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanLabelId = String(labelId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanLabelId) return;
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels/${encodeURIComponent(cleanLabelId)}/deactivate`, {
            method: 'POST'
        });
        await loadTenantLabels(cleanTenantId);
    };

    const uploadQuickReplyAsset = async ({ file, tenantId, libraryId = '' } = {}) => {
        if (!file) throw new Error('Selecciona un archivo para subir.');
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) throw new Error('Selecciona tenant antes de subir adjunto.');

        const resolvedMimeType = resolveQuickReplyMimeType(file);
        if (!resolvedMimeType || !QUICK_REPLY_ALLOWED_MIME_TYPES.includes(resolvedMimeType)) {
            throw new Error(`Formato no permitido para ${String(file?.name || 'adjunto')}. Usa ${QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}.`);
        }

        const dataUrl = await buildDataUrlWithMime(file, resolvedMimeType);
        const payload = await requestJson('/api/admin/saas/assets/upload', {
            method: 'POST',
            body: {
                tenantId: cleanTenantId,
                scope: String(libraryId || 'quick_reply').trim().toLowerCase(),
                kind: 'quick_reply',
                mimeType: resolvedMimeType,
                fileName: String(file?.name || 'adjunto').trim() || 'adjunto',
                dataUrl
            }
        });

        const filePayload = payload?.file && typeof payload.file === 'object' ? payload.file : {};
        return {
            url: String(filePayload.url || filePayload.relativeUrl || '').trim(),
            mimeType: String(filePayload.mimeType || resolvedMimeType).trim().toLowerCase(),
            fileName: String(filePayload.fileName || file?.name || '').trim(),
            sizeBytes: Number.isFinite(Number(filePayload.sizeBytes || file?.size || 0)) ? Number(filePayload.sizeBytes || file?.size || 0) : null
        };
    };

    const handleQuickReplyAssetSelection = async (fileList) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (files.length === 0) return;
        if (!settingsTenantId) throw new Error('Selecciona una empresa antes de subir adjuntos.');

        for (const file of files) {
            const mimeType = resolveQuickReplyMimeType(file);
            if (!QUICK_REPLY_ALLOWED_MIME_TYPES.includes(mimeType)) {
                throw new Error(`Formato no permitido para ${String(file?.name || 'adjunto')}. Usa ${QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}.`);
            }
            if (Number(file?.size || 0) > quickReplyUploadMaxBytes) {
                throw new Error(`El archivo ${String(file?.name || 'adjunto')} supera el maximo de ${quickReplyUploadMaxMb} MB por archivo.`);
            }
        }

        setUploadingQuickReplyAssets(true);
        try {
            const uploadedAssets = [];
            for (const file of files) {
                const uploaded = await uploadQuickReplyAsset({
                    file,
                    tenantId: settingsTenantId,
                    libraryId: selectedQuickReplyLibrary?.libraryId || ''
                });
                if (uploaded?.url) uploadedAssets.push(uploaded);
            }
            if (uploadedAssets.length === 0) throw new Error('No se pudo subir ningun adjunto.');

            setQuickReplyItemForm((prev) => {
                const mergedAssets = normalizeQuickReplyMediaAssets([
                    ...(Array.isArray(prev?.mediaAssets) ? prev.mediaAssets : []),
                    ...uploadedAssets
                ]);
                const primaryMedia = mergedAssets[0] || null;
                return {
                    ...prev,
                    mediaAssets: mergedAssets,
                    mediaUrl: String(primaryMedia?.url || prev?.mediaUrl || '').trim(),
                    mediaMimeType: String(primaryMedia?.mimeType || prev?.mediaMimeType || '').trim().toLowerCase(),
                    mediaFileName: String(primaryMedia?.fileName || prev?.mediaFileName || '').trim()
                };
            });
        } finally {
            setUploadingQuickReplyAssets(false);
        }
    };

    const removeQuickReplyAssetAt = (index = -1) => {
        const targetIndex = Number(index);
        if (!Number.isInteger(targetIndex) || targetIndex < 0) return;
        setQuickReplyItemForm((prev) => {
            const assets = normalizeQuickReplyMediaAssets(prev?.mediaAssets, {
                url: prev?.mediaUrl || '',
                mimeType: prev?.mediaMimeType || '',
                fileName: prev?.mediaFileName || '',
                sizeBytes: prev?.mediaSizeBytes
            });
            const nextAssets = assets.filter((_asset, assetIdx) => assetIdx !== targetIndex);
            const primaryMedia = nextAssets[0] || null;
            return {
                ...prev,
                mediaAssets: nextAssets,
                mediaUrl: String(primaryMedia?.url || '').trim(),
                mediaMimeType: String(primaryMedia?.mimeType || '').trim().toLowerCase(),
                mediaFileName: String(primaryMedia?.fileName || '').trim(),
                mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes)) ? Number(primaryMedia?.sizeBytes) : null
            };
        });
    };
    const openQuickReplyLibraryCreate = () => {
        const moduleIds = quickReplyScopeModuleId ? [quickReplyScopeModuleId] : [];
        setQuickReplyLibraryForm({ ...EMPTY_QUICK_REPLY_LIBRARY_FORM, moduleIds });
        setQuickReplyLibraryPanelMode('create');
    };

    const openQuickReplyLibraryEdit = () => {
        if (!selectedQuickReplyLibrary) return;
        setQuickReplyLibraryForm({
            libraryId: selectedQuickReplyLibrary.libraryId,
            name: selectedQuickReplyLibrary.name || '',
            description: selectedQuickReplyLibrary.description || '',
            isShared: selectedQuickReplyLibrary.isShared === true,
            isActive: selectedQuickReplyLibrary.isActive !== false,
            sortOrder: String(selectedQuickReplyLibrary.sortOrder || 100),
            moduleIds: Array.isArray(selectedQuickReplyLibrary.moduleIds) ? [...selectedQuickReplyLibrary.moduleIds] : []
        });
        setQuickReplyLibraryPanelMode('edit');
    };

    const cancelQuickReplyLibraryEdit = () => {
        if (selectedQuickReplyLibrary) {
            setQuickReplyLibraryForm({
                libraryId: selectedQuickReplyLibrary.libraryId,
                name: selectedQuickReplyLibrary.name || '',
                description: selectedQuickReplyLibrary.description || '',
                isShared: selectedQuickReplyLibrary.isShared === true,
                isActive: selectedQuickReplyLibrary.isActive !== false,
                sortOrder: String(selectedQuickReplyLibrary.sortOrder || 100),
                moduleIds: Array.isArray(selectedQuickReplyLibrary.moduleIds) ? [...selectedQuickReplyLibrary.moduleIds] : []
            });
        } else {
            setQuickReplyLibraryForm({ ...EMPTY_QUICK_REPLY_LIBRARY_FORM });
        }
        setQuickReplyLibraryPanelMode('view');
    };

    const toggleModuleInQuickReplyLibraryForm = (moduleId) => {
        const clean = String(moduleId || '').trim().toLowerCase();
        if (!clean) return;
        setQuickReplyLibraryForm((prev) => {
            const current = Array.isArray(prev?.moduleIds) ? prev.moduleIds : [];
            const exists = current.includes(clean);
            return {
                ...prev,
                moduleIds: exists ? current.filter((entry) => entry !== clean) : [...current, clean]
            };
        });
    };

    const saveQuickReplyLibrary = async () => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        if (!cleanTenantId) throw new Error('Selecciona una empresa para gestionar bibliotecas.');
        const payload = buildQuickReplyLibraryPayload(quickReplyLibraryForm);
        if (!String(payload.name || '').trim()) throw new Error('Nombre de biblioteca requerido.');

        if (quickReplyLibraryPanelMode === 'create') {
            const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries`, {
                method: 'POST',
                body: payload
            });
            const createdId = String(created?.item?.libraryId || '').trim().toUpperCase();
            await loadQuickReplyData(cleanTenantId);
            if (createdId) setSelectedQuickReplyLibraryId(createdId);
            setQuickReplyLibraryPanelMode('view');
            return;
        }

        const cleanLibraryId = String(payload.libraryId || selectedQuickReplyLibraryId || '').trim().toUpperCase();
        if (!cleanLibraryId) throw new Error('Selecciona una biblioteca para actualizar.');
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries/${encodeURIComponent(cleanLibraryId)}`, {
            method: 'PUT',
            body: payload
        });
        await loadQuickReplyData(cleanTenantId);
        setSelectedQuickReplyLibraryId(cleanLibraryId);
        setQuickReplyLibraryPanelMode('view');
    };

    const deactivateQuickReplyLibrary = async (libraryId) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanLibraryId = String(libraryId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanLibraryId) return;
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries/${encodeURIComponent(cleanLibraryId)}/deactivate`, {
            method: 'POST',
            body: {}
        });
        await loadQuickReplyData(cleanTenantId);
        setQuickReplyLibraryPanelMode('view');
    };

    const openQuickReplyItemCreate = () => {
        if (!selectedQuickReplyLibrary) return;
        setSelectedQuickReplyItemId('');
        setQuickReplyItemForm({ ...EMPTY_QUICK_REPLY_ITEM_FORM, libraryId: selectedQuickReplyLibrary.libraryId, isActive: true, sortOrder: '100' });
        setQuickReplyItemPanelMode('create');
    };

    const openQuickReplyItemEdit = () => {
        if (!selectedQuickReplyItem) return;
        setQuickReplyItemForm({
            itemId: selectedQuickReplyItem.itemId,
            libraryId: selectedQuickReplyItem.libraryId,
            label: selectedQuickReplyItem.label || '',
            text: selectedQuickReplyItem.text || '',
            mediaAssets: normalizeQuickReplyMediaAssets(selectedQuickReplyItem.mediaAssets, {
                url: selectedQuickReplyItem.mediaUrl || '',
                mimeType: selectedQuickReplyItem.mediaMimeType || '',
                fileName: selectedQuickReplyItem.mediaFileName || '',
                sizeBytes: selectedQuickReplyItem.mediaSizeBytes
            }),
            mediaUrl: selectedQuickReplyItem.mediaUrl || '',
            mediaMimeType: selectedQuickReplyItem.mediaMimeType || '',
            mediaFileName: selectedQuickReplyItem.mediaFileName || '',
            isActive: selectedQuickReplyItem.isActive !== false,
            sortOrder: String(selectedQuickReplyItem.sortOrder || 100)
        });
        setQuickReplyItemPanelMode('edit');
    };

    const cancelQuickReplyItemEdit = () => {
        if (selectedQuickReplyItem) {
            setQuickReplyItemForm({
            itemId: selectedQuickReplyItem.itemId,
            libraryId: selectedQuickReplyItem.libraryId,
            label: selectedQuickReplyItem.label || '',
            text: selectedQuickReplyItem.text || '',
            mediaAssets: normalizeQuickReplyMediaAssets(selectedQuickReplyItem.mediaAssets, {
                url: selectedQuickReplyItem.mediaUrl || '',
                mimeType: selectedQuickReplyItem.mediaMimeType || '',
                fileName: selectedQuickReplyItem.mediaFileName || '',
                sizeBytes: selectedQuickReplyItem.mediaSizeBytes
            }),
            mediaUrl: selectedQuickReplyItem.mediaUrl || '',
            mediaMimeType: selectedQuickReplyItem.mediaMimeType || '',
            mediaFileName: selectedQuickReplyItem.mediaFileName || '',
            isActive: selectedQuickReplyItem.isActive !== false,
            sortOrder: String(selectedQuickReplyItem.sortOrder || 100)
        });
        } else {
            setQuickReplyItemForm({ ...EMPTY_QUICK_REPLY_ITEM_FORM, libraryId: String(selectedQuickReplyLibrary?.libraryId || '').trim().toUpperCase() });
        }
        setQuickReplyItemPanelMode('view');
    };

    const saveQuickReplyItem = async () => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const libraryId = String(quickReplyItemForm.libraryId || selectedQuickReplyLibrary?.libraryId || '').trim().toUpperCase();
        if (!cleanTenantId || !libraryId) throw new Error('Selecciona biblioteca antes de guardar respuesta rapida.');

        const payload = buildQuickReplyItemPayload(quickReplyItemForm, { libraryId });
        if (!payload.label) throw new Error('Etiqueta requerida.');
        if (!payload.text && (!Array.isArray(payload.mediaAssets) || payload.mediaAssets.length === 0) && !payload.mediaUrl) throw new Error('Debes registrar texto o adjunto.');

        if (quickReplyItemPanelMode === 'create') {
            const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items`, {
                method: 'POST',
                body: payload
            });
            const createdId = String(created?.item?.itemId || '').trim().toUpperCase();
            await loadQuickReplyData(cleanTenantId);
            if (createdId) setSelectedQuickReplyItemId(createdId);
            setQuickReplyItemPanelMode('view');
            return;
        }

        const cleanItemId = String(payload.itemId || selectedQuickReplyItemId || '').trim().toUpperCase();
        if (!cleanItemId) throw new Error('Selecciona una respuesta para actualizar.');
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items/${encodeURIComponent(cleanItemId)}`, {
            method: 'PUT',
            body: payload
        });
        await loadQuickReplyData(cleanTenantId);
        setSelectedQuickReplyItemId(cleanItemId);
        setQuickReplyItemPanelMode('view');
    };

    const deactivateQuickReplyItem = async (itemId) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanItemId = String(itemId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanItemId) return;
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items/${encodeURIComponent(cleanItemId)}/deactivate`, {
            method: 'POST',
            body: {}
        });
        await loadQuickReplyData(cleanTenantId);
        setQuickReplyItemPanelMode('view');
    };

    const loadTenantCatalogs = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantCatalogs([]);
            setSelectedCatalogId('');
            setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
            setTenantCatalogProducts([]);
            setSelectedCatalogProductId('');
            setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
            setCatalogProductPanelMode('view');
            setCatalogProductImageError('');
            return;
        }
        setLoadingTenantCatalogs(true);
        try {
            const payload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/catalogs`);
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map((entry) => normalizeTenantCatalogItem(entry))
                .filter(Boolean);
            setTenantCatalogs(items);
            setSelectedCatalogId((prev) => {
                const cleanPrev = String(prev || '').trim().toUpperCase();
                if (cleanPrev && items.some((entry) => String(entry?.catalogId || '').trim().toUpperCase() === cleanPrev)) {
                    return cleanPrev;
                }
                return '';
            });
        } finally {
            setLoadingTenantCatalogs(false);
        }
    };
    const loadTenantCatalogProducts = async (tenantId, catalogId) => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanCatalogId) {
            setTenantCatalogProducts([]);
            setSelectedCatalogProductId('');
            setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
            setCatalogProductPanelMode('view');
            setCatalogProductImageError('');
            return;
        }

        setLoadingCatalogProducts(true);
        try {
            const payload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/catalogs/${encodeURIComponent(cleanCatalogId)}/products`);
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map((entry) => normalizeCatalogProductItem(entry))
                .filter(Boolean)
                .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'es', { sensitivity: 'base' }));

            setTenantCatalogProducts(items);
            setSelectedCatalogProductId((prev) => {
                const cleanPrev = String(prev || '').trim();
                if (cleanPrev && items.some((item) => String(item?.productId || '').trim() === cleanPrev)) {
                    return cleanPrev;
                }
                return '';
            });
        } finally {
            setLoadingCatalogProducts(false);
        }
    };

    const openCatalogProductCreate = () => {
        if (!canEditCatalog || !selectedTenantCatalog || selectedTenantCatalog.sourceType !== 'local') return;
        setSelectedCatalogProductId('');
        setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
        setCatalogProductPanelMode('create');
        setCatalogProductImageError('');
    };

    const openCatalogProductEdit = (product) => {
        if (!canEditCatalog || !product) return;
        setSelectedCatalogProductId(String(product.productId || '').trim());
        setCatalogProductForm(buildCatalogProductFormFromItem(product));
        setCatalogProductPanelMode('edit');
        setCatalogProductImageError('');
    };

    const cancelCatalogProductEdit = () => {
        if (selectedCatalogProduct) {
            setCatalogProductForm(buildCatalogProductFormFromItem(selectedCatalogProduct));
        } else {
            setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
        }
        setCatalogProductPanelMode('view');
            setCatalogProductImageError('');
    };

    const saveCatalogProduct = async () => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanCatalogId = String(selectedTenantCatalog?.catalogId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanCatalogId) throw new Error('Selecciona tenant y catalogo antes de guardar.');

        const payload = buildCatalogProductPayload(catalogProductForm, {
            moduleId: '',
            catalogId: cleanCatalogId
        });

        if (!String(payload.title || '').trim()) throw new Error('Titulo de producto es obligatorio.');
        if (!String(payload.price || '').trim()) throw new Error('Precio de producto es obligatorio.');

        if (catalogProductPanelMode === 'create') {
            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/catalogs/${encodeURIComponent(cleanCatalogId)}/products`, {
                method: 'POST',
                body: payload
            });
        } else {
            const cleanProductId = String(catalogProductForm.productId || selectedCatalogProductId || '').trim();
            if (!cleanProductId) throw new Error('Producto invalido para actualizar.');
            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/catalogs/${encodeURIComponent(cleanCatalogId)}/products/${encodeURIComponent(cleanProductId)}`, {
                method: 'PUT',
                body: payload
            });
        }

        await loadTenantCatalogProducts(cleanTenantId, cleanCatalogId);
        setCatalogProductPanelMode('view');
        setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
    };

    const deactivateCatalogProduct = async (productId) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanCatalogId = String(selectedTenantCatalog?.catalogId || '').trim().toUpperCase();
        const cleanProductId = String(productId || '').trim();
        if (!cleanTenantId || !cleanCatalogId || !cleanProductId) return;

        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/catalogs/${encodeURIComponent(cleanCatalogId)}/products/${encodeURIComponent(cleanProductId)}/deactivate`, {
            method: 'POST',
            body: {}
        });
        await loadTenantCatalogProducts(cleanTenantId, cleanCatalogId);
        setCatalogProductPanelMode('view');
    };

    const handleCatalogProductImageUpload = async (file) => {
        if (!file) return;
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanCatalogId = String(selectedTenantCatalog?.catalogId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanCatalogId) {
            setCatalogProductImageError('Selecciona un catalogo local antes de subir imagen.');
            return;
        }

        try {
            setCatalogProductImageUploading(true);
            setCatalogProductImageError('');
            const uploadedUrl = await uploadImageAsset({
                file,
                tenantId: cleanTenantId,
                scope: `catalog-product-${cleanCatalogId.toLowerCase()}`
            });
            if (!uploadedUrl) throw new Error('No se recibio URL de imagen.');
            setCatalogProductForm((prev) => ({ ...prev, imageUrl: uploadedUrl }));
        } catch (error) {
            setCatalogProductImageError(String(error?.message || 'No se pudo subir la imagen del producto.'));
        } finally {
            setCatalogProductImageUploading(false);
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

    const openCatalogView = (catalogId = '') => {
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        setSelectedCatalogId(cleanCatalogId);
        if (!cleanCatalogId) {
            setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
        }
        setCatalogPanelMode('view');
        setCatalogProductPanelMode('view');
    };

    const openCatalogCreate = () => {
        if (!canEditCatalog) return;
        setSelectedCatalogId('');
        setSelectedCatalogProductId('');
        setCatalogPanelMode('create');
        setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
    };

    const openCatalogEdit = () => {
        if (!canEditCatalog || !selectedTenantCatalog) return;
        setCatalogPanelMode('edit');
        setTenantCatalogForm(buildTenantCatalogFormFromItem(selectedTenantCatalog));
    };

    const cancelCatalogEdit = () => {
        if (selectedTenantCatalog) {
            setTenantCatalogForm(buildTenantCatalogFormFromItem(selectedTenantCatalog));
        } else {
            setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
        }
        setCatalogPanelMode('view');
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
        setTenantCatalogs([]);
        setSelectedCatalogId('');
        setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
        setTenantCatalogProducts([]);
        setSelectedCatalogProductId('');
        setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
        setCatalogProductPanelMode('view');
            setCatalogProductImageError('');
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
        setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
        setSelectedPlanId('');
        setPlanForm(normalizePlanForm('starter', {}));
        setRoleForm(EMPTY_ROLE_FORM);
        setEditingWaModuleId('');
        setModuleUserPickerId('');
        setModuleQuickReplyLibraryDraft([]);
        setSelectedCustomerId('');
        setCustomerPanelMode('view');
        setCustomerForm(EMPTY_CUSTOMER_FORM);
        setCustomerSearch('');
        setCustomerCsvText('');
        setSelectedAiAssistantId('');
        setAiAssistantPanelMode('view');
        setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM });
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
            catalogIds: [...(item.catalogIds || [])],
            aiAssistantId: sanitizeAiAssistantCode(item.moduleAiAssistantId || ''),
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
        setModuleQuickReplyLibraryDraft(getQuickReplyLibraryIdsForModule(item.moduleId));
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
                await loadTenantCatalogs(settingsTenantId);
                await loadTenantAiAssistants(settingsTenantId);
                await loadQuickReplyData(settingsTenantId);
                await loadTenantLabels(settingsTenantId);
            }
        } catch (err) {
            setError(String(err?.message || err || 'Error inesperado.'));
        } finally {
            setBusy(false);
        }
    };

    const handleOpenOperation = () => {
        if (typeof onOpenWhatsAppOperation !== 'function') return;
        const cleanTenantId = String(tenantScopeId || activeTenantId || '').trim();
        onOpenWhatsAppOperation('', { tenantId: cleanTenantId || undefined });
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
        setSelectedCatalogId('');
        setSelectedCatalogProductId('');
        setSelectedConfigKey('');
        setTenantPanelMode('view');
        setUserPanelMode('view');
        setTenantSettingsPanelMode('view');
        setWaModulePanelMode('view');
        setCatalogPanelMode('view');
        setCatalogProductPanelMode('view');
        setPlanPanelMode('view');
        setRolePanelMode('view');
        setMembershipDraft([]);
        setTenantForm(EMPTY_TENANT_FORM);
        setUserForm(EMPTY_USER_FORM);
        setWaModuleForm(EMPTY_WA_MODULE_FORM);
        setTenantIntegrations(EMPTY_INTEGRATIONS_FORM);
        setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
        setTenantCatalogProducts([]);
        setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
        setCatalogProductImageError('');
        setSelectedAiAssistantId('');
        setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM });
        setAiAssistantPanelMode('view');
        setSelectedQuickReplyLibraryId('');
        setSelectedQuickReplyItemId('');
        setQuickReplyModuleFilterId('');
        setQuickReplyLibraryForm({ ...EMPTY_QUICK_REPLY_LIBRARY_FORM });
        setQuickReplyItemForm({ ...EMPTY_QUICK_REPLY_ITEM_FORM });
        setQuickReplyLibraryPanelMode('view');
        setQuickReplyItemPanelMode('view');
        setSelectedLabelId('');
        setLabelForm({ ...EMPTY_LABEL_FORM });
        setLabelPanelMode('view');
        setLabelSearch('');
        setSelectedPlanId('');
        setPlanForm(normalizePlanForm('starter', {}));
        setRoleForm(EMPTY_ROLE_FORM);
        setEditingWaModuleId('');
        setModuleUserPickerId('');
        setModuleQuickReplyLibraryDraft([]);
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
                || selectedCatalogId
                || selectedCatalogProductId
                || selectedConfigKey
                || selectedRoleKey
                || tenantPanelMode !== 'view'
                || userPanelMode !== 'view'
                || tenantSettingsPanelMode !== 'view'
                || waModulePanelMode !== 'view'
                || catalogPanelMode !== 'view'
                || catalogProductPanelMode !== 'view'
                || planPanelMode !== 'view'
                || rolePanelMode !== 'view'
                || selectedPlanId
                || selectedCustomerId
                || customerPanelMode !== 'view'
                || selectedAiAssistantId
                || aiAssistantPanelMode !== 'view'
                || selectedLabelId
                || labelPanelMode !== 'view'
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
        selectedCatalogId,
        tenantPanelMode,
        tenantSettingsPanelMode,
        userPanelMode,
        waModulePanelMode,
        catalogPanelMode,
        planPanelMode,
        rolePanelMode,
        selectedPlanId,
        selectedCustomerId,
        customerPanelMode,
        selectedAiAssistantId,
        aiAssistantPanelMode,
        selectedLabelId,
        labelPanelMode
    ]);
    useEffect(() => {
        if (!isOpen || !canManageSaas || !tenantScopeId) return;
        Promise.all([
            loadTenantSettings(tenantScopeId),
            loadWaModules(tenantScopeId),
            loadTenantCatalogs(tenantScopeId),
            loadTenantAiAssistants(tenantScopeId),
            loadTenantIntegrations(tenantScopeId),
            loadCustomers(tenantScopeId),
            loadQuickReplyData(tenantScopeId),
            loadTenantLabels(tenantScopeId),
            loadTenantAssignmentRules(tenantScopeId),
            loadTenantOperationsKpis(tenantScopeId)
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
        setTenantCatalogs([]);
        setSelectedCatalogId('');
        setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
        setTenantCatalogProducts([]);
        setSelectedCatalogProductId('');
        setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
        setCatalogProductPanelMode('view');
        setCatalogProductImageError('');
        setTenantAiAssistants([]);
        setSelectedAiAssistantId('');
        setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM });
        setAiAssistantPanelMode('view');
        setQuickReplyLibraries([]);
        setQuickReplyItems([]);
        setSelectedQuickReplyLibraryId('');
        setSelectedQuickReplyItemId('');
        setQuickReplyModuleFilterId('');
        setQuickReplyLibraryForm({ ...EMPTY_QUICK_REPLY_LIBRARY_FORM });
        setQuickReplyItemForm({ ...EMPTY_QUICK_REPLY_ITEM_FORM });
        setQuickReplyLibraryPanelMode('view');
        setQuickReplyItemPanelMode('view');
        setTenantLabels([]);
        setSelectedLabelId('');
        setLabelForm({ ...EMPTY_LABEL_FORM });
        setLabelPanelMode('view');
        resetOperationsState();
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
        setSelectedAiAssistantId('');
        setAiAssistantPanelMode('view');
        setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM });
        setSelectedQuickReplyLibraryId('');
        setSelectedQuickReplyItemId('');
        setQuickReplyModuleFilterId('');
        setQuickReplyLibraryPanelMode('view');
        setQuickReplyItemPanelMode('view');
        setSelectedLabelId('');
        setLabelPanelMode('view');
        setLabelForm({ ...EMPTY_LABEL_FORM });
        setLabelSearch('');
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
        if (!requiresTenantSelection) return;
        if (String(settingsTenantId || '').trim()) return;
        if (String(launchSource || '').trim().toLowerCase() !== 'chat') return;

        const requestedTenantId = String(preferredTenantId || '').trim();
        if (!requestedTenantId) return;

        const exists = tenantOptions.some((tenant) => String(tenant?.id || '').trim() === requestedTenantId);
        if (!exists) return;

        setSettingsTenantId(requestedTenantId);
        setSelectedTenantId(requestedTenantId);
    }, [isOpen, requiresTenantSelection, settingsTenantId, launchSource, preferredTenantId, tenantOptions]);
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
        if (aiAssistantPanelMode === 'create') return;
        if (!selectedAiAssistant) {
            setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM });
            return;
        }
        setAiAssistantForm(buildAiAssistantFormFromItem(selectedAiAssistant));
    }, [selectedAiAssistant, aiAssistantPanelMode]);
    useEffect(() => {
        if (catalogPanelMode === 'create') return;
        if (!selectedTenantCatalog) {
            setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
            return;
        }
        setTenantCatalogForm(buildTenantCatalogFormFromItem(selectedTenantCatalog));
    }, [selectedTenantCatalog, catalogPanelMode]);
    useEffect(() => {
        if (!isOpen || !settingsTenantId || !selectedTenantCatalog || selectedTenantCatalog.sourceType !== 'local') {
            setTenantCatalogProducts([]);
            setSelectedCatalogProductId('');
            setCatalogProductForm({ ...EMPTY_CATALOG_PRODUCT_FORM });
            setCatalogProductPanelMode('view');
            setCatalogProductImageError('');
            return;
        }
        loadTenantCatalogProducts(settingsTenantId, selectedTenantCatalog.catalogId)
            .catch((err) => setError(String(err?.message || err || 'No se pudieron cargar productos del catalogo.')));
    }, [isOpen, settingsTenantId, selectedTenantCatalog]);
    useEffect(() => {
        if (!selectedWaModule) {
            resetWaModuleForm();
            return;
        }
        openWaModuleEditor(selectedWaModule);
    }, [selectedWaModule]);
    useEffect(() => {
        if (!selectedQuickReplyLibrary) {
            setQuickReplyLibraryForm({ ...EMPTY_QUICK_REPLY_LIBRARY_FORM, moduleIds: quickReplyScopeModuleId ? [quickReplyScopeModuleId] : [] });
            return;
        }
        if (quickReplyLibraryPanelMode === 'create') return;
        setQuickReplyLibraryForm({
            libraryId: selectedQuickReplyLibrary.libraryId,
            name: selectedQuickReplyLibrary.name || '',
            description: selectedQuickReplyLibrary.description || '',
            isShared: selectedQuickReplyLibrary.isShared === true,
            isActive: selectedQuickReplyLibrary.isActive !== false,
            sortOrder: String(selectedQuickReplyLibrary.sortOrder || 100),
            moduleIds: Array.isArray(selectedQuickReplyLibrary.moduleIds) ? [...selectedQuickReplyLibrary.moduleIds] : []
        });
    }, [selectedQuickReplyLibrary, quickReplyLibraryPanelMode, quickReplyScopeModuleId]);
    useEffect(() => {
        if (!selectedQuickReplyItem) {
            setQuickReplyItemForm((prev) => ({
                ...EMPTY_QUICK_REPLY_ITEM_FORM,
                libraryId: String(selectedQuickReplyLibrary?.libraryId || prev?.libraryId || '').trim().toUpperCase()
            }));
            return;
        }
        if (quickReplyItemPanelMode === 'create') return;
        setQuickReplyItemForm({
            itemId: selectedQuickReplyItem.itemId,
            libraryId: selectedQuickReplyItem.libraryId,
            label: selectedQuickReplyItem.label || '',
            text: selectedQuickReplyItem.text || '',
            mediaAssets: normalizeQuickReplyMediaAssets(selectedQuickReplyItem.mediaAssets, {
                url: selectedQuickReplyItem.mediaUrl || '',
                mimeType: selectedQuickReplyItem.mediaMimeType || '',
                fileName: selectedQuickReplyItem.mediaFileName || '',
                sizeBytes: selectedQuickReplyItem.mediaSizeBytes
            }),
            mediaUrl: selectedQuickReplyItem.mediaUrl || '',
            mediaMimeType: selectedQuickReplyItem.mediaMimeType || '',
            mediaFileName: selectedQuickReplyItem.mediaFileName || '',
            isActive: selectedQuickReplyItem.isActive !== false,
            sortOrder: String(selectedQuickReplyItem.sortOrder || 100)
        });
    }, [selectedQuickReplyItem, selectedQuickReplyLibrary, quickReplyItemPanelMode]);

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

    const openAiAssistantCreate = () => {
        if (!canManageAi || !settingsTenantId) return;
        setSelectedAiAssistantId('');
        setAiAssistantForm({
            ...EMPTY_AI_ASSISTANT_FORM,
            provider: 'openai',
            model: String(tenantIntegrations?.aiModel || 'gpt-4o-mini').trim() || 'gpt-4o-mini'
        });
        setAiAssistantPanelMode('create');
    };

    const applyLavitatAssistantPreset = () => {
        setAiAssistantForm((prev) => buildLavitatAssistantPreset(prev));
    };
    const openAiAssistantView = (assistantId) => {
        const cleanAssistantId = sanitizeAiAssistantCode(assistantId || '');
        if (!cleanAssistantId) return;
        setSelectedAiAssistantId(cleanAssistantId);
        setAiAssistantPanelMode('view');
    };

    const openAiAssistantEdit = () => {
        if (!selectedAiAssistant) return;
        setAiAssistantForm(buildAiAssistantFormFromItem(selectedAiAssistant));
        setAiAssistantPanelMode('edit');
    };

    const cancelAiAssistantEdit = () => {
        if (selectedAiAssistant) {
            setAiAssistantForm(buildAiAssistantFormFromItem(selectedAiAssistant));
            setAiAssistantPanelMode('view');
            return;
        }
        setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM });
        setAiAssistantPanelMode('view');
    };

    const saveAiAssistant = () => {
        if (!settingsTenantId || !canManageAi) return;

        runAction(aiAssistantPanelMode === 'create' ? 'Asistente IA creado' : 'Asistente IA actualizado', async () => {
            const payload = buildAiAssistantPayload(aiAssistantForm, { allowAssistantId: aiAssistantPanelMode === 'create' });
            if (!String(payload.name || '').trim()) {
                throw new Error('El nombre del asistente IA es obligatorio.');
            }

            let response = null;
            if (aiAssistantPanelMode === 'create') {
                response = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/ai-assistants`, {
                    method: 'POST',
                    body: payload
                });
            } else {
                const cleanAssistantId = sanitizeAiAssistantCode(selectedAiAssistant?.assistantId || aiAssistantForm.assistantId || selectedAiAssistantId);
                if (!cleanAssistantId) throw new Error('Asistente IA invalido para actualizar.');
                response = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/ai-assistants/${encodeURIComponent(cleanAssistantId)}`, {
                    method: 'PUT',
                    body: payload
                });
            }

            await loadTenantAiAssistants(settingsTenantId);
            const returnedId = sanitizeAiAssistantCode(response?.item?.assistantId || '');
            if (returnedId) {
                setSelectedAiAssistantId(returnedId);
            }
            setAiAssistantPanelMode('view');
            setAiAssistantForm((prev) => ({ ...prev, openaiApiKey: '' }));
        });
    };

    const markAiAssistantAsDefault = (assistantId) => {
        const cleanAssistantId = sanitizeAiAssistantCode(assistantId || '');
        if (!settingsTenantId || !cleanAssistantId || !canManageAi) return;

        runAction('Asistente IA principal actualizado', async () => {
            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/ai-assistants/${encodeURIComponent(cleanAssistantId)}/default`, {
                method: 'POST',
                body: {}
            });
            await loadTenantAiAssistants(settingsTenantId);
            setSelectedAiAssistantId(cleanAssistantId);
        });
    };

    const toggleAiAssistantActive = (assistant) => {
        const cleanAssistantId = sanitizeAiAssistantCode(assistant?.assistantId || '');
        if (!settingsTenantId || !cleanAssistantId || !canManageAi) return;
        const isActive = assistant?.isActive !== false;

        runAction('Estado de asistente IA actualizado', async () => {
            if (isActive) {
                await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/ai-assistants/${encodeURIComponent(cleanAssistantId)}/deactivate`, {
                    method: 'POST',
                    body: {}
                });
            } else {
                await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/ai-assistants/${encodeURIComponent(cleanAssistantId)}`, {
                    method: 'PUT',
                    body: { isActive: true }
                });
            }
            await loadTenantAiAssistants(settingsTenantId);
            setSelectedAiAssistantId(cleanAssistantId);
        });
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
        setModuleQuickReplyLibraryDraft([]);
        resetWaModuleForm();
        setWaModuleForm((prev) => ({
            ...prev,
            catalogIds: activeCatalogOptions.length > 0
                ? [String(activeCatalogOptions[0]?.catalogId || '').trim().toUpperCase()].filter(Boolean)
                : [],
            aiAssistantId: defaultAiAssistantId || ''
        }));
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

    


    const toggleCatalogForModule = (catalogId) => {
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        if (!/^CAT-[A-Z0-9]{4,}$/.test(cleanCatalogId)) return;
        setWaModuleForm((prev) => {
            const current = normalizeCatalogIdsList(prev?.catalogIds || []);
            const set = new Set(current);
            if (set.has(cleanCatalogId)) set.delete(cleanCatalogId);
            else set.add(cleanCatalogId);
            return {
                ...prev,
                catalogIds: Array.from(set).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
            };
        });
    };

    const getQuickReplyLibraryIdsForModule = useCallback((moduleId = '') => {
        const cleanModuleId = String(moduleId || '').trim().toLowerCase();
        if (!cleanModuleId) return [];
        return (Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [])
            .filter((library) => library?.isShared !== true)
            .filter((library) => Array.isArray(library?.moduleIds) && library.moduleIds.includes(cleanModuleId))
            .map((library) => String(library?.libraryId || '').trim().toUpperCase())
            .filter(Boolean);
    }, [quickReplyLibraries]);

    const toggleQuickReplyLibraryForModuleDraft = (libraryId = '') => {
        const cleanLibraryId = String(libraryId || '').trim().toUpperCase();
        if (!cleanLibraryId) return;
        setModuleQuickReplyLibraryDraft((prev) => {
            const set = new Set((Array.isArray(prev) ? prev : []).map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean));
            if (set.has(cleanLibraryId)) set.delete(cleanLibraryId);
            else set.add(cleanLibraryId);
            return Array.from(set);
        });
    };

    const syncQuickReplyLibrariesForModule = useCallback(async (moduleId = '', selectedLibraryIds = []) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanModuleId = String(moduleId || '').trim().toLowerCase();
        if (!cleanTenantId || !cleanModuleId) return;

        const selectedSet = new Set((Array.isArray(selectedLibraryIds) ? selectedLibraryIds : [])
            .map((entry) => String(entry || '').trim().toUpperCase())
            .filter(Boolean));

        const mutableLibraries = (Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [])
            .filter((library) => library?.isShared !== true);

        for (const library of mutableLibraries) {
            const libraryId = String(library?.libraryId || '').trim().toUpperCase();
            if (!libraryId) continue;
            const currentSet = new Set((Array.isArray(library?.moduleIds) ? library.moduleIds : [])
                .map((entry) => String(entry || '').trim().toLowerCase())
                .filter(Boolean));
            const currentlyAssigned = currentSet.has(cleanModuleId);
            const shouldAssign = selectedSet.has(libraryId);
            if (currentlyAssigned === shouldAssign) continue;

            if (shouldAssign) currentSet.add(cleanModuleId);
            else currentSet.delete(cleanModuleId);

            const payload = buildQuickReplyLibraryPayload({
                ...library,
                moduleIds: Array.from(currentSet),
                isShared: false
            });

            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries/${encodeURIComponent(libraryId)}`, {
                method: 'PUT',
                body: payload
            });
        }
    }, [quickReplyLibraries, settingsTenantId]);

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
                                        onClick={() => onOpenWhatsAppOperation('', { tenantId: operationTenantId || undefined })}
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
                                        onClick={() => onOpenWhatsAppOperation('', { tenantId: operationTenantId || undefined })}
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
                                disabled={busy || !item.enabled || (tenantScopeLocked && !['saas_resumen', 'saas_empresas', 'saas_planes', 'saas_roles', 'saas_operacion'].includes(item.id))}
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
                                <small>Bandeja multicanal</small>
                                <strong>Todos los modulos</strong>
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
                                                                            <label key={`assignment_role_${role}`} className="saas-admin-module-toggle">
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
                                                                            <label key={`assignment_role_${role}`} className="saas-admin-module-toggle">
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

                                        {isOperationsSection && (
                        <OperationsSection
                            tenantScopeLocked={tenantScopeLocked}
                            busy={busy}
                            loadingAssignmentRules={loadingAssignmentRules}
                            loadingOperationsKpis={loadingOperationsKpis}
                            canManageAssignments={canManageAssignments}
                            canViewOperations={canViewOperations}
                            assignmentRules={assignmentRules}
                            assignmentRoleOptions={assignmentRoleOptions}
                            operationsSnapshot={operationsSnapshot}
                            activeTenantChatCandidates={activeTenantChatCandidates}
                            tenantScopeId={tenantScopeId}
                            setAssignmentRules={setAssignmentRules}
                            runAction={runAction}
                            saveAssignmentRules={saveAssignmentRules}
                            loadTenantOperationsKpis={loadTenantOperationsKpis}
                            triggerAutoAssignPreview={triggerAutoAssignPreview}
                            formatDateTimeLabel={formatDateTimeLabel}
                        />
                    )}

                    {isAiSection && (
                    <section id="saas_ia" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Asistentes IA</h3>
                                        <small>{settingsTenantId ? 'Define asistentes por empresa y asignalos por modulo.' : 'Selecciona una empresa para administrar asistentes IA.'}</small>
                                    </div>
                                </div>

                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    <button type="button" disabled={busy || !settingsTenantId || loadingAiAssistants} onClick={() => settingsTenantId && loadTenantAiAssistants(settingsTenantId)}>
                                        Recargar
                                    </button>
                                    <button type="button" disabled={busy || !settingsTenantId || !canManageAi} onClick={openAiAssistantCreate}>
                                        Nuevo asistente
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => { setSelectedAiAssistantId(''); setAiAssistantPanelMode('view'); setAiAssistantForm({ ...EMPTY_AI_ASSISTANT_FORM }); }}>
                                        Deseleccionar
                                    </button>
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {!settingsTenantId && (
                                        <div className="saas-admin-empty-state">
                                            <h4>Sin empresa seleccionada</h4>
                                            <p>Elige una empresa para administrar asistentes IA.</p>
                                        </div>
                                    )}

                                    {settingsTenantId && tenantAiAssistantItems.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <h4>Sin asistentes IA</h4>
                                            <p>Crea el primer asistente para definir contexto por modulo.</p>
                                        </div>
                                    )}

                                    {settingsTenantId && tenantAiAssistantItems.map((assistant) => (
                                        <button
                                            key={`assistant_${assistant.assistantId}`}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedAiAssistantId === assistant.assistantId && aiAssistantPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                            onClick={() => openAiAssistantView(assistant.assistantId)}
                                        >
                                            <strong>{assistant.name || assistant.assistantId}</strong>
                                            <small>{assistant.assistantId} | {assistant.model}</small>
                                            <small>{assistant.isActive ? 'Activo' : 'Inactivo'}{assistant.isDefault ? ' | Principal' : ''}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Asistentes por empresa</h4>
                                        <p>Selecciona una empresa para ver detalle y configuracion IA.</p>
                                    </div>
                                )}

                                {settingsTenantId && aiAssistantPanelMode === 'view' && !selectedAiAssistant && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Sin asistente seleccionado</h4>
                                        <p>Selecciona un asistente de la lista o crea uno nuevo.</p>
                                    </div>
                                )}

                                {settingsTenantId && aiAssistantPanelMode === 'view' && selectedAiAssistant && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{selectedAiAssistant.name || selectedAiAssistant.assistantId}</h3>
                                                <small>{selectedAiAssistant.assistantId}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" disabled={busy || !canManageAi} onClick={openAiAssistantEdit}>Editar</button>
                                                <button
                                                    type="button"
                                                    disabled={busy || !canManageAi || selectedAiAssistant.isDefault || selectedAiAssistant.isActive === false}
                                                    onClick={() => markAiAssistantAsDefault(selectedAiAssistant.assistantId)}
                                                >
                                                    Marcar principal
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy || !canManageAi}
                                                    onClick={() => toggleAiAssistantActive(selectedAiAssistant)}
                                                >
                                                    {selectedAiAssistant.isActive ? 'Desactivar' : 'Activar'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="saas-admin-detail-grid">
                                            <div className="saas-admin-detail-field"><span>Proveedor</span><strong>{selectedAiAssistant.provider}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Modelo</span><strong>{selectedAiAssistant.model}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Temperatura</span><strong>{selectedAiAssistant.temperature}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Top P</span><strong>{selectedAiAssistant.topP}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Max tokens</span><strong>{selectedAiAssistant.maxTokens}</strong></div>
                                            <div className="saas-admin-detail-field"><span>API key</span><strong>{selectedAiAssistant.openAiApiKeyMasked || 'No configurada'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedAiAssistant.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Principal</span><strong>{selectedAiAssistant.isDefault ? 'Si' : 'No'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedAiAssistant.updatedAt)}</strong></div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Descripcion</h4>
                                            <div className="saas-admin-related-list">
                                                <div className="saas-admin-related-row" role="status">
                                                    <span>{selectedAiAssistant.description || 'Sin descripcion.'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>System prompt</h4>
                                            <div className="saas-admin-detail-metadata">
                                                <pre>{selectedAiAssistant.systemPrompt || 'Sin prompt configurado.'}</pre>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {settingsTenantId && (aiAssistantPanelMode === 'create' || aiAssistantPanelMode === 'edit') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{aiAssistantPanelMode === 'create' ? 'Nuevo asistente IA' : 'Editar asistente IA'}</h3>
                                                <small>{aiAssistantPanelMode === 'create' ? 'Define contexto y parametros de inferencia.' : 'Actualiza los campos necesarios y guarda.'}</small>
                                            </div>
                                        </div>

                                        {aiAssistantPanelMode === 'edit' && (
                                            <div className="saas-admin-detail-grid">
                                                <div className="saas-admin-detail-field">
                                                    <span>Codigo</span>
                                                    <strong>{aiAssistantForm.assistantId || '-'}</strong>
                                                </div>
                                            </div>
                                        )}

                                        <div className="saas-admin-form-row">
                                            <input
                                                value={aiAssistantForm.name}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, name: event.target.value }))}
                                                placeholder="Nombre del asistente"
                                                disabled={busy}
                                            />
                                            <select
                                                value={aiAssistantForm.model}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, model: event.target.value }))}
                                                disabled={busy}
                                            >
                                                {AI_MODEL_OPTIONS.map((model) => (
                                                    <option key={`ai_model_${model}`} value={model}>{model}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <div className="saas-admin-field">
                                                <label>Temperatura (0-2)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="2"
                                                    step="0.1"
                                                    value={aiAssistantForm.temperature}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, temperature: event.target.value }))}
                                                    disabled={busy}
                                                />
                                            </div>
                                            <div className="saas-admin-field">
                                                <label>Top P (0-1)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="1"
                                                    step="0.05"
                                                    value={aiAssistantForm.topP}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, topP: event.target.value }))}
                                                    disabled={busy}
                                                />
                                            </div>
                                            <div className="saas-admin-field">
                                                <label>Max tokens</label>
                                                <input
                                                    type="number"
                                                    min="64"
                                                    max="4096"
                                                    step="1"
                                                    value={aiAssistantForm.maxTokens}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, maxTokens: event.target.value }))}
                                                    disabled={busy}
                                                />
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <textarea
                                                value={aiAssistantForm.description}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, description: event.target.value }))}
                                                placeholder="Descripcion del asistente"
                                                rows={2}
                                                disabled={busy}
                                            />
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <textarea
                                                value={aiAssistantForm.systemPrompt}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, systemPrompt: event.target.value }))}
                                                placeholder="Prompt base del asistente (contexto, tono, reglas, etc.)"
                                                rows={8}
                                                disabled={busy}
                                            />
                                        </div>

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button type="button" disabled={busy} onClick={applyLavitatAssistantPreset}>
                                                Cargar plantilla Lavitat
                                            </button>
                                        </div>
                                        <div className="saas-admin-form-row">
                                            <input
                                                type="password"
                                                value={aiAssistantForm.openaiApiKey}
                                                onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, openaiApiKey: event.target.value }))}
                                                placeholder={aiAssistantForm.openAiApiKeyMasked || 'OpenAI API key (opcional si no se cambia)'}
                                                disabled={busy}
                                            />
                                        </div>

                                        <div className="saas-admin-modules">
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={aiAssistantForm.isActive !== false}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                    disabled={busy}
                                                />
                                                <span>Asistente activo</span>
                                            </label>
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={aiAssistantForm.isDefault === true}
                                                    onChange={(event) => setAiAssistantForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
                                                    disabled={busy}
                                                />
                                                <span>Asistente principal del tenant</span>
                                            </label>
                                        </div>

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button
                                                type="button"
                                                disabled={busy || !String(aiAssistantForm.name || '').trim()}
                                                onClick={saveAiAssistant}
                                            >
                                                {aiAssistantPanelMode === 'create' ? 'Guardar asistente' : 'Actualizar asistente'}
                                            </button>
                                            <button type="button" disabled={busy} onClick={cancelAiAssistantEdit}>Cancelar</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                    )}
                    {isLabelsSection && (
                    <section id="saas_etiquetas" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Etiquetas de chat</h3>
                                        <small>Define etiquetas visuales por empresa, color y alcance por modulo.</small>
                                    </div>
                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                        <button
                                            type="button"
                                            disabled={busy || loadingLabels || !settingsTenantId}
                                            onClick={() => settingsTenantId && loadTenantLabels(settingsTenantId).catch((err) => setError(String(err?.message || err || 'No se pudieron recargar etiquetas.')))}
                                        >
                                            Recargar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || !canManageLabels || !settingsTenantId}
                                            onClick={openTenantLabelCreate}
                                        >
                                            Nueva etiqueta
                                        </button>
                                    </div>
                                </div>

                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Primero elige una empresa para administrar etiquetas.</p>
                                    </div>
                                )}

                                {settingsTenantId && (
                                    <>
                                        <div className="saas-admin-form-row">
                                            <input
                                                value={labelSearch}
                                                onChange={(event) => setLabelSearch(event.target.value)}
                                                placeholder="Filtrar etiquetas por nombre o codigo"
                                                disabled={loadingLabels}
                                            />
                                        </div>

                                        <div className="saas-admin-list saas-admin-list--compact">
                                            {visibleTenantLabels.length === 0 && (
                                                <div className="saas-admin-empty-state">
                                                    <h4>Sin etiquetas</h4>
                                                    <p>Crea tu primera etiqueta para clasificar chats.</p>
                                                </div>
                                            )}
                                            {visibleTenantLabels.map((label) => (
                                                <button
                                                    key={`tenant_label_${label.labelId}`}
                                                    type="button"
                                                    className={`saas-admin-list-item saas-admin-list-item--button ${(selectedTenantLabel?.labelId === label.labelId && labelPanelMode !== 'create') ? 'active' : ''}`.trim()}
                                                    onClick={() => {
                                                        setSelectedLabelId(String(label.labelId || '').trim().toUpperCase());
                                                        setLabelPanelMode('view');
                                                    }}
                                                >
                                                    <strong>{label.name || label.labelId}</strong>
                                                    <small>{label.labelId}</small>
                                                    <small>{label.moduleIds.length > 0 ? `Modulos: ${label.moduleIds.length}` : 'Compartida (todos los modulos)'} | {label.isActive === false ? 'inactiva' : 'activa'}</small>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Sin empresa seleccionada</h4>
                                        <p>Selecciona una empresa para ver y gestionar sus etiquetas.</p>
                                    </div>
                                )}

                                {settingsTenantId && !selectedTenantLabel && labelPanelMode === 'view' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una etiqueta</h4>
                                        <p>El detalle de la etiqueta se muestra en este panel derecho.</p>
                                    </div>
                                )}

                                {settingsTenantId && (selectedTenantLabel || labelPanelMode === 'create') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{labelPanelMode === 'create' ? 'Nueva etiqueta' : (labelPanelMode === 'edit' ? 'Editando etiqueta' : (selectedTenantLabel?.name || selectedTenantLabel?.labelId || 'Etiqueta'))}</h3>
                                                <small>{labelPanelMode === 'view' ? 'Vista bloqueada' : 'Edicion activa'}</small>
                                            </div>
                                            {labelPanelMode === 'view' && selectedTenantLabel && canManageLabels && (
                                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                    <button type="button" disabled={busy} onClick={openTenantLabelEdit}>Editar</button>
                                                    {selectedTenantLabel?.isActive !== false ? (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => runAction('Etiqueta desactivada', async () => {
                                                                await deactivateTenantLabel(selectedTenantLabel?.labelId);
                                                            })}
                                                        >
                                                            Desactivar
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => runAction('Etiqueta reactivada', async () => {
                                                                const cleanLabelId = String(selectedTenantLabel?.labelId || '').trim().toUpperCase();
                                                                if (!cleanLabelId) return;
                                                                await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/labels/${encodeURIComponent(cleanLabelId)}`, {
                                                                    method: 'PUT',
                                                                    body: {
                                                                        ...buildTenantLabelPayload(selectedTenantLabel, { allowLabelId: false }),
                                                                        isActive: true
                                                                    }
                                                                });
                                                                await loadTenantLabels(settingsTenantId);
                                                            })}
                                                        >
                                                            Reactivar
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {labelPanelMode === 'view' && selectedTenantLabel && (
                                            <>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Codigo</span><strong>{selectedTenantLabel.labelId || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedTenantLabel.name || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenantLabel.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Orden</span><strong>{selectedTenantLabel.sortOrder || 100}</strong></div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Color visual</h4>
                                                    <div className="saas-admin-related-list">
                                                        <div className="saas-admin-related-row" role="status">
                                                            <span>Hex</span>
                                                            <small>{selectedTenantLabel.color || '#00A884'}</small>
                                                        </div>
                                                        <div className="saas-admin-related-row" role="status">
                                                            <span>Muestra</span>
                                                            <small>
                                                                <span className="chat-header-label-chip" style={{ '--label-color': selectedTenantLabel.color || '#00A884' }}>{selectedTenantLabel.name || 'Etiqueta'}</span>
                                                            </small>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Alcance por modulo</h4>
                                                    <div className="saas-admin-related-list">
                                                        {selectedTenantLabel.moduleIds.length === 0 && (
                                                            <div className="saas-admin-related-row" role="status"><span>Alcance</span><small>Compartida para todos los modulos</small></div>
                                                        )}
                                                        {selectedTenantLabel.moduleIds.map((moduleId) => {
                                                            const moduleMatch = waModules.find((entry) => String(entry?.moduleId || '').trim().toLowerCase() === moduleId);
                                                            return (
                                                                <div key={`label_view_module_${moduleId}`} className="saas-admin-related-row" role="status">
                                                                    <span>{moduleMatch?.name || moduleId}</span>
                                                                    <small>{moduleId}</small>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {(labelPanelMode === 'create' || labelPanelMode === 'edit') && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={labelForm.name}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre de etiqueta"
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        value={labelForm.labelId}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, labelId: String(event.target.value || '').trim().toUpperCase() }))}
                                                        placeholder="Codigo (opcional, auto si vacio)"
                                                        disabled={busy || labelPanelMode === 'edit'}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={labelForm.description}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, description: event.target.value }))}
                                                        placeholder="Descripcion (opcional)"
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="9999"
                                                        value={labelForm.sortOrder}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                                                        placeholder="Orden"
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        type="color"
                                                        value={normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0])}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, color: event.target.value }))}
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        value={normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0])}
                                                        onChange={(event) => setLabelForm((prev) => ({ ...prev, color: event.target.value }))}
                                                        placeholder="#00A884"
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-modules">
                                                    {DEFAULT_LABEL_COLORS.map((colorValue) => (
                                                        <button
                                                            key={`label_color_${colorValue}`}
                                                            type="button"
                                                            className="saas-admin-color-chip"
                                                            style={{ background: colorValue, borderColor: colorValue }}
                                                            title={colorValue}
                                                            disabled={busy}
                                                            onClick={() => setLabelForm((prev) => ({ ...prev, color: colorValue }))}
                                                        >
                                                            {normalizeTenantLabelColor(labelForm.color || '', DEFAULT_LABEL_COLORS[0]) === colorValue ? 'ok' : ''}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="saas-admin-modules">
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={labelForm.isActive !== false}
                                                            onChange={(event) => setLabelForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                            disabled={busy}
                                                        />
                                                        <span>Etiqueta activa</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Asignacion por modulo</h4>
                                                    <small>Si no marcas modulos, la etiqueta queda compartida para todos.</small>
                                                    <div className="saas-admin-modules" style={{ marginTop: '8px' }}>
                                                        {waModules.length === 0 && (
                                                            <div className="saas-admin-empty-inline">No hay modulos configurados para esta empresa.</div>
                                                        )}
                                                        {waModules.map((moduleItem) => {
                                                            const moduleId = String(moduleItem?.moduleId || '').trim().toLowerCase();
                                                            const checked = Array.isArray(labelForm.moduleIds) && labelForm.moduleIds.includes(moduleId);
                                                            return (
                                                                <label key={`assignment_role_${role}`} className="saas-admin-module-toggle">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleModuleInLabelForm(moduleId)}
                                                                        disabled={busy}
                                                                    />
                                                                    <span>{moduleItem?.name || moduleId}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={busy || !canManageLabels || !String(labelForm.name || '').trim()}
                                                        onClick={() => runAction(labelPanelMode === 'create' ? 'Etiqueta creada' : 'Etiqueta actualizada', async () => {
                                                            await saveTenantLabel();
                                                        })}
                                                    >
                                                        {labelPanelMode === 'create' ? 'Guardar etiqueta' : 'Actualizar etiqueta'}
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={cancelTenantLabelEdit}>Cancelar</button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
                    )}
                    {isQuickRepliesSection && (
                    <section id="saas_quick_replies" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Respuestas rapidas</h3>
                                        <small>Gestiona bibliotecas y plantillas reutilizables por empresa/modulo.</small>
                                    </div>
                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                        <button
                                            type="button"
                                            disabled={busy || loadingQuickReplies || !settingsTenantId}
                                            onClick={() => settingsTenantId && loadQuickReplyData(settingsTenantId).catch((err) => setError(String(err?.message || err || 'No se pudo recargar respuestas rapidas.')))}
                                        >
                                            Recargar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy || !canManageQuickReplies || !settingsTenantId}
                                            onClick={openQuickReplyLibraryCreate}
                                        >
                                            Nueva biblioteca
                                        </button>
                                    </div>
                                </div>

                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Primero elige una empresa para gestionar respuestas rapidas.</p>
                                    </div>
                                )}

                                {settingsTenantId && (
                                    <>
                                        <div className="saas-admin-form-row">
                                            <select
                                                value={quickReplyModuleFilterId}
                                                onChange={(event) => {
                                                    const nextModuleId = String(event.target.value || '').trim().toLowerCase();
                                                    setQuickReplyModuleFilterId(nextModuleId);
                                                    setSelectedQuickReplyLibraryId('');
                                                    setSelectedQuickReplyItemId('');
                                                    setQuickReplyLibraryPanelMode('view');
                                                    setQuickReplyItemPanelMode('view');
                                                }}
                                                disabled={loadingQuickReplies}
                                            >
                                                <option value="">Todas las bibliotecas (sin filtro de modulo)</option>
                                                {waModules.map((moduleItem) => {
                                                    const moduleId = String(moduleItem?.moduleId || '').trim().toLowerCase();
                                                    return (
                                                        <option key={`qr_scope_${moduleId}`} value={moduleId}>
                                                            {moduleItem?.name || moduleId}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                        <div className="saas-admin-form-row">
                                            <input
                                                value={quickReplyLibrarySearch}
                                                onChange={(event) => setQuickReplyLibrarySearch(event.target.value)}
                                                placeholder="Filtrar bibliotecas por nombre, codigo o descripcion"
                                                disabled={loadingQuickReplies}
                                            />
                                        </div>

                                        <div className="saas-admin-list saas-admin-list--compact">
                                            {visibleQuickReplyLibraries.length === 0 && (
                                                <div className="saas-admin-empty-state">
                                                    <h4>Sin bibliotecas</h4>
                                                    <p>Crea una biblioteca para empezar.</p>
                                                </div>
                                            )}
                                            {visibleQuickReplyLibraries.map((library) => (
                                                <button
                                                    key={`qr_library_list_${library.libraryId}`}
                                                    type="button"
                                                    className={`saas-admin-list-item saas-admin-list-item--button ${selectedQuickReplyLibrary?.libraryId === library.libraryId ? 'active' : ''}`.trim()}
                                                    onClick={() => {
                                                        setSelectedQuickReplyLibraryId(String(library.libraryId || '').trim().toUpperCase());
                                                        setSelectedQuickReplyItemId('');
                                                        setQuickReplyLibraryPanelMode('view');
                                                        setQuickReplyItemPanelMode('view');
                                                    }}
                                                >
                                                    <strong>{library.name || library.libraryId}</strong>
                                                    <small>{library.libraryId}</small>
                                                    <small>{library.isShared ? 'Compartida' : 'Asignada por modulo'} | {library.isActive === false ? 'inactiva' : 'activa'}</small>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una empresa</h4>
                                        <p>Elige una empresa para administrar bibliotecas y respuestas rapidas.</p>
                                    </div>
                                )}
                                {settingsTenantId && !selectedQuickReplyLibrary && quickReplyLibraryPanelMode === 'view' && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona una biblioteca</h4>
                                        <p>Elige una biblioteca para ver y editar todas sus plantillas.</p>
                                    </div>
                                )}
                                {settingsTenantId && (selectedQuickReplyLibrary || quickReplyLibraryPanelMode === 'create') && (
                                    <div className="saas-admin-related-block" style={{ marginTop: '10px' }}>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h4>{quickReplyLibraryPanelMode === 'create' ? 'Nueva biblioteca' : (selectedQuickReplyLibrary?.name || selectedQuickReplyLibrary?.libraryId || 'Biblioteca de respuestas')}</h4>
                                                <small>{quickReplyLibraryPanelMode === 'create' ? 'Define tipo, alcance y modulos asignados' : (selectedQuickReplyLibrary?.libraryId || 'Biblioteca de respuestas')}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                {quickReplyLibraryPanelMode === 'view' && (
                                                    <>
                                                        <button type="button" disabled={busy || !canManageQuickReplies || !selectedQuickReplyLibrary} onClick={openQuickReplyLibraryEdit}>Editar biblioteca</button>
                                                        <button
                                                            type="button"
                                                            disabled={busy || !canManageQuickReplies || !selectedQuickReplyLibrary}
                                                            onClick={() => runAction('Biblioteca desactivada', async () => {
                                                                await deactivateQuickReplyLibrary(selectedQuickReplyLibrary?.libraryId);
                                                            })}
                                                        >
                                                            Desactivar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {(quickReplyLibraryPanelMode === 'create' || quickReplyLibraryPanelMode === 'edit') && (
                                            <div className="saas-admin-related-block" style={{ marginBottom: '10px' }}>
                                                <div className="saas-admin-form-row">
                                                    <input
                                                        value={quickReplyLibraryForm.name}
                                                        onChange={(event) => setQuickReplyLibraryForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre de biblioteca"
                                                        disabled={busy}
                                                    />
                                                    <input
                                                        value={quickReplyLibraryForm.description}
                                                        onChange={(event) => setQuickReplyLibraryForm((prev) => ({ ...prev, description: event.target.value }))}
                                                        placeholder="Descripcion (opcional)"
                                                        disabled={busy}
                                                    />
                                                </div>
                                                <div className="saas-admin-modules">
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={quickReplyLibraryForm.isShared === true}
                                                            onChange={(event) => setQuickReplyLibraryForm((prev) => ({ ...prev, isShared: event.target.checked }))}
                                                            disabled={busy}
                                                        />
                                                        <span>Biblioteca compartida</span>
                                                    </label>
                                                    <label className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={quickReplyLibraryForm.isActive !== false}
                                                            onChange={(event) => setQuickReplyLibraryForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                            disabled={busy}
                                                        />
                                                        <span>Biblioteca activa</span>
                                                    </label>
                                                </div>

                                                {!quickReplyLibraryForm.isShared && (
                                                    <div className="saas-admin-modules">
                                                        {waModules.map((moduleItem) => {
                                                            const moduleId = String(moduleItem?.moduleId || '').trim().toLowerCase();
                                                            const checked = Array.isArray(quickReplyLibraryForm.moduleIds) && quickReplyLibraryForm.moduleIds.includes(moduleId);
                                                            return (
                                                                <label key={
                                                                    'qr_library_module_' + moduleId
                                                                } className="saas-admin-module-toggle">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleModuleInQuickReplyLibraryForm(moduleId)}
                                                                        disabled={busy}
                                                                    />
                                                                    <span>{moduleItem?.name || moduleId}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                    <button
                                                        type="button"
                                                        disabled={busy || !canManageQuickReplies || !String(quickReplyLibraryForm.name || '').trim()}
                                                        onClick={() => runAction(
                                                            quickReplyLibraryPanelMode === 'create' ? 'Biblioteca creada' : 'Biblioteca actualizada',
                                                            async () => { await saveQuickReplyLibrary(); }
                                                        )}
                                                    >
                                                        {quickReplyLibraryPanelMode === 'create' ? 'Guardar biblioteca' : 'Actualizar biblioteca'}
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={cancelQuickReplyLibraryEdit}>Cancelar</button>
                                                </div>
                                            </div>
                                        )}


                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h4>Plantillas</h4>
                                                <small>Listado completo editable. Usa texto y/o adjuntos ({QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}).</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemCreate}>Nueva respuesta</button>
                                            </div>
                                        </div>

                                        <div className="saas-admin-detail-grid" style={{ marginBottom: '10px' }}>
                                            <div className="saas-admin-detail-field"><span>Biblioteca</span><strong>{selectedQuickReplyLibrary?.name || selectedQuickReplyLibrary?.libraryId || '-'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Plantillas visibles</span><strong>{visibleQuickReplyItemsForSelectedLibrary.length}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Max por archivo</span><strong>{quickReplyUploadMaxMb} MB</strong></div>
                                            <div className="saas-admin-detail-field"><span>Cuota plan</span><strong>{quickReplyStorageQuotaMb} MB</strong></div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <input
                                                value={quickReplyItemSearch}
                                                onChange={(event) => setQuickReplyItemSearch(event.target.value)}
                                                placeholder="Filtrar respuestas por etiqueta, contenido o archivo"
                                                disabled={loadingQuickReplies}
                                            />
                                        </div>

                                        <div className="saas-admin-catalog-products-layout">
                                            <div className="saas-admin-catalog-products-list">
                                                {visibleQuickReplyItemsForSelectedLibrary.length === 0 && (
                                                    <div className="saas-admin-empty-state">
                                                        <h4>Sin plantillas</h4>
                                                        <p>Crea tu primera respuesta rapida para esta biblioteca.</p>
                                                    </div>
                                                )}
                                                {visibleQuickReplyItemsForSelectedLibrary.map((item) => {
                                                    const itemAssets = normalizeQuickReplyMediaAssets(item?.mediaAssets, {
                                                        url: item?.mediaUrl || '',
                                                        mimeType: item?.mediaMimeType || '',
                                                        fileName: item?.mediaFileName || '',
                                                        sizeBytes: item?.mediaSizeBytes
                                                    });
                                                    return (
                                                        <button
                                                            key={`qr_item_row_${item.itemId}`}
                                                            type="button"
                                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedQuickReplyItem?.itemId === item.itemId ? 'active' : ''}`.trim()}
                                                            onClick={() => {
                                                                setSelectedQuickReplyItemId(String(item?.itemId || '').trim().toUpperCase());
                                                                setQuickReplyItemPanelMode('view');
                                                            }}
                                                        >
                                                            <strong>{item.label || item.itemId}</strong>
                                                            <small>{String(item.text || '').trim().slice(0, 96) || 'Solo adjuntos'}</small>
                                                            <small>{itemAssets.length} adjunto(s) | {item.isActive === false ? 'inactiva' : 'activa'}</small>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <div className="saas-admin-catalog-product-detail">
                                                {!selectedQuickReplyItem && quickReplyItemPanelMode === 'view' && (
                                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                                        <h4>Selecciona una plantilla</h4>
                                                        <p>Haz clic en una fila para ver detalle y editar.</p>
                                                    </div>
                                                )}

                                                {selectedQuickReplyItem && quickReplyItemPanelMode === 'view' && (
                                                    <>
                                                        <div className="saas-admin-pane-header">
                                                            <div>
                                                                <h4>{selectedQuickReplyItem.label || selectedQuickReplyItem.itemId}</h4>
                                                                <small>{selectedQuickReplyItem.itemId}</small>
                                                            </div>
                                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemEdit}>Editar respuesta</button>
                                                                <button
                                                                    type="button"
                                                                    disabled={busy || !canManageQuickReplies}
                                                                    onClick={() => runAction('Respuesta rapida desactivada', async () => {
                                                                        await deactivateQuickReplyItem(selectedQuickReplyItem?.itemId);
                                                                    })}
                                                                >
                                                                    Desactivar
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="saas-admin-detail-grid">
                                                            <div className="saas-admin-detail-field"><span>Etiqueta</span><strong>{selectedQuickReplyItem.label || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedQuickReplyItem.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>Adjuntos</span><strong>{selectedQuickReplyItemMediaAssets.length}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedQuickReplyItem.updatedAt)}</strong></div>
                                                        </div>

                                                        <div className="saas-admin-related-row" role="status" style={{ alignItems: 'flex-start' }}>
                                                            <span>Texto</span>
                                                            <small style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{selectedQuickReplyItem.text || 'Sin texto. Solo adjuntos.'}</small>
                                                        </div>

                                                        {selectedQuickReplyItemMediaAssets.length > 0 && (
                                                            <div className="saas-admin-related-block">
                                                                <h4>Adjuntos</h4>
                                                                <div className="saas-admin-related-list">
                                                                    {selectedQuickReplyItemMediaAssets.map((asset, assetIdx) => {
                                                                        const previewUrl = resolveQuickReplyAssetPreviewUrl(asset?.url || '');
                                                                        const fileLabel = getQuickReplyAssetDisplayName(asset, assetIdx);
                                                                        const isImage = isQuickReplyImageAsset(asset);
                                                                        return (
                                                                            <div key={`qr_item_asset_view_${assetIdx}`} className="saas-admin-related-row" role="status" style={{ alignItems: 'flex-start' }}>
                                                                                {isImage ? (
                                                                                    <a href={previewUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', width: '68px', height: '68px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', marginRight: '10px', flexShrink: 0 }}>
                                                                                        <img src={previewUrl} alt={fileLabel} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                    </a>
                                                                                ) : (
                                                                                    <div style={{ width: '68px', height: '68px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.22)', marginRight: '10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#8fb6c9', fontWeight: 700, fontSize: '0.78rem' }}>
                                                                                        {String(getQuickReplyAssetTypeLabel(asset) || 'file').toUpperCase()}
                                                                                    </div>
                                                                                )}
                                                                                <div style={{ minWidth: 0, display: 'grid', gap: '2px' }}>
                                                                                    <span>{fileLabel}</span>
                                                                                    <small>
                                                                                        <a href={previewUrl || '#'} target="_blank" rel="noreferrer">Abrir</a>
                                                                                        {' | '}{asset.mimeType || 'archivo'}
                                                                                        {asset.sizeBytes ? ` | ${formatBytes(asset.sizeBytes)}` : ''}
                                                                                    </small>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                )}

                                                {(quickReplyItemPanelMode === 'create' || quickReplyItemPanelMode === 'edit') && (
                                                    <div className="saas-admin-related-block">
                                                        <div className="saas-admin-pane-header">
                                                            <div>
                                                                <h4>{quickReplyItemPanelMode === 'create' ? 'Nueva respuesta' : 'Editar respuesta'}</h4>
                                                                <small>Permite texto y multiples adjuntos.</small>
                                                            </div>
                                                        </div>

                                                        <div className="saas-admin-form-row">
                                                            <input
                                                                value={quickReplyItemForm.label}
                                                                onChange={(event) => setQuickReplyItemForm((prev) => ({ ...prev, label: event.target.value }))}
                                                                placeholder="Etiqueta de respuesta"
                                                                disabled={busy || uploadingQuickReplyAssets}
                                                            />
                                                        </div>
                                                        <textarea
                                                            value={quickReplyItemForm.text}
                                                            onChange={(event) => setQuickReplyItemForm((prev) => ({ ...prev, text: event.target.value }))}
                                                            rows={5}
                                                            placeholder="Texto rapido (puede quedar vacio si solo envias adjuntos)"
                                                            disabled={busy || uploadingQuickReplyAssets}
                                                        />

                                                        <div className="saas-admin-form-row">
                                                            <input
                                                                value={quickReplyItemForm.mediaUrl}
                                                                onChange={(event) => setQuickReplyItemForm((prev) => ({ ...prev, mediaUrl: event.target.value, mediaMimeType: prev.mediaMimeType || '' }))}
                                                                placeholder="URL principal (opcional, auto al subir)"
                                                                disabled={busy || uploadingQuickReplyAssets}
                                                            />
                                                            <label className={`saas-admin-dropzone ${busy || uploadingQuickReplyAssets ? 'is-disabled' : ''}`.trim()} style={{ minHeight: 'auto', padding: '10px 12px' }}>
                                                                <input
                                                                    type="file"
                                                                    multiple
                                                                    accept={QUICK_REPLY_ACCEPT_VALUE}
                                                                    disabled={busy || uploadingQuickReplyAssets}
                                                                    onChange={async (event) => {
                                                                        const files = Array.from(event.target.files || []);
                                                                        event.target.value = '';
                                                                        if (files.length === 0) return;
                                                                        try {
                                                                            await handleQuickReplyAssetSelection(files);
                                                                        } catch (uploadError) {
                                                                            setError(String(uploadError?.message || uploadError || 'No se pudo subir adjunto de respuesta rapida.'));
                                                                        }
                                                                    }}
                                                                />
                                                                <strong>{uploadingQuickReplyAssets ? 'Subiendo adjuntos...' : 'Subir adjuntos (multiple)'}</strong>
                                                                <small>{QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL} | max archivo {quickReplyUploadMaxMb} MB | cuota {quickReplyStorageQuotaMb} MB</small>
                                                            </label>
                                                        </div>

                                                        {quickReplyItemFormAssets.length > 0 && (
                                                            <div className="saas-admin-related-block">
                                                                <h4>Adjuntos de esta respuesta ({quickReplyItemFormAssets.length})</h4>
                                                                <div className="saas-admin-related-list">
                                                                    {quickReplyItemFormAssets.map((asset, assetIdx) => {
                                                                        const previewUrl = resolveQuickReplyAssetPreviewUrl(asset?.url || '');
                                                                        const fileLabel = getQuickReplyAssetDisplayName(asset, assetIdx);
                                                                        const isImage = isQuickReplyImageAsset(asset);
                                                                        return (
                                                                            <div key={`qr_item_asset_edit_${assetIdx}`} className="saas-admin-related-row" role="status" style={{ alignItems: 'flex-start' }}>
                                                                                {isImage ? (
                                                                                    <a href={previewUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', marginRight: '10px', flexShrink: 0 }}>
                                                                                        <img src={previewUrl} alt={fileLabel} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                    </a>
                                                                                ) : (
                                                                                    <div style={{ width: '64px', height: '64px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.22)', marginRight: '10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#8fb6c9', fontWeight: 700, fontSize: '0.75rem' }}>
                                                                                        {String(getQuickReplyAssetTypeLabel(asset) || 'file').toUpperCase()}
                                                                                    </div>
                                                                                )}
                                                                                <div style={{ minWidth: 0, display: 'grid', gap: '2px', flex: 1 }}>
                                                                                    <span>{fileLabel}</span>
                                                                                    <small>
                                                                                        {asset.mimeType || 'archivo'}
                                                                                        {asset.sizeBytes ? ` | ${formatBytes(asset.sizeBytes)}` : ''}
                                                                                    </small>
                                                                                    <div>
                                                                                        <button
                                                                                            type="button"
                                                                                            disabled={busy || uploadingQuickReplyAssets}
                                                                                            onClick={() => removeQuickReplyAssetAt(assetIdx)}
                                                                                        >
                                                                                            Quitar
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="saas-admin-modules">
                                                            <label className="saas-admin-module-toggle">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={quickReplyItemForm.isActive !== false}
                                                                    onChange={(event) => setQuickReplyItemForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                                    disabled={busy || uploadingQuickReplyAssets}
                                                                />
                                                                <span>Respuesta activa</span>
                                                            </label>
                                                        </div>

                                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                            <button
                                                                type="button"
                                                                disabled={busy || uploadingQuickReplyAssets || !canManageQuickReplies || !String(quickReplyItemForm.label || '').trim() || (!String(quickReplyItemForm.text || '').trim() && quickReplyItemFormAssets.length === 0 && !String(quickReplyItemForm.mediaUrl || '').trim())}
                                                                onClick={() => runAction(
                                                                    quickReplyItemPanelMode === 'create' ? 'Respuesta rapida creada' : 'Respuesta rapida actualizada',
                                                                    async () => { await saveQuickReplyItem(); }
                                                                )}
                                                            >
                                                                {quickReplyItemPanelMode === 'create' ? 'Guardar respuesta' : 'Actualizar respuesta'}
                                                            </button>
                                                            <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={cancelQuickReplyItemEdit}>Cancelar</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
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
                                            <small>Cloud API | {moduleItem.isActive ? 'activo' : 'inactivo'}</small>
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
                                                        <label key={`assignment_role_${role}`} className="saas-admin-module-toggle">
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
                                    const moduleCatalogIds = normalizeCatalogIdsList(moduleInDetail?.catalogIds || []);
                                    const moduleCatalogLabels = moduleCatalogIds.map((catalogId) => activeCatalogLabelMap.get(catalogId) || catalogId);
                                    const moduleAssistantId = sanitizeAiAssistantCode(moduleInDetail?.moduleAiAssistantId || '');
                                    const moduleAssistantLabel = moduleAssistantId
                                        ? (aiAssistantLabelMap.get(moduleAssistantId) || moduleAssistantId)
                                        : 'Asistente principal del tenant';

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
                                                                onClick={() => handleOpenOperation()}
                                                            >
                                                                Ir a operacion
                                                            </button>
                                                            <span style={{ fontSize: '0.72rem', color: '#8eb3c7', alignSelf: 'center' }}>Operacion: seleccion dinamica por chat</span>
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
                                                        <div className="saas-admin-detail-field"><span>Catalogos asignados</span><strong>{moduleCatalogLabels.length}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Asistente IA</span><strong>{moduleAssistantLabel}</strong></div>
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
                                                        <h4>Catalogos del modulo</h4>
                                                        <div className="saas-admin-related-list">
                                                            {moduleCatalogLabels.length === 0 && <div className="saas-admin-empty-inline">Sin catalogos asignados.</div>}
                                                            {moduleCatalogLabels.map((label, index) => (
                                                                <div key={`module_catalog_label_${index}`} className="saas-admin-related-row" role="status">
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

                                                    <div className="saas-admin-form-row">
                                                        <div className="saas-admin-field">
                                                            <label htmlFor="wa-module-ai-assistant">Asistente IA del modulo</label>
                                                            <select
                                                                id="wa-module-ai-assistant"
                                                                value={waModuleForm.aiAssistantId}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, aiAssistantId: sanitizeAiAssistantCode(event.target.value || '') }))}
                                                                disabled={!settingsTenantId || busy}
                                                            >
                                                                <option value="">Usar asistente principal del tenant</option>
                                                                {activeAiAssistantOptions.map((assistant) => (
                                                                    <option key={`wa_module_ai_${assistant.assistantId}`} value={assistant.assistantId}>
                                                                        {assistant.name || assistant.assistantId}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Catalogos asignados al modulo</h4>
                                                        <small>Selecciona uno o mas catalogos activos para este modulo.</small>
                                                        <div className="saas-admin-modules">
                                                            {activeCatalogOptions.length === 0 && (
                                                                <div className="saas-admin-empty-inline">No hay catalogos activos. Crea uno en la pestana Catalogos.</div>
                                                            )}
                                                            {activeCatalogOptions.map((catalogItem) => {
                                                                const catalogId = String(catalogItem?.catalogId || '').trim().toUpperCase();
                                                                const checked = normalizeCatalogIdsList(waModuleForm.catalogIds || []).includes(catalogId);
                                                                return (
                                                                    <label key={`assignment_role_${role}`} className="saas-admin-module-toggle">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={() => toggleCatalogForModule(catalogId)}
                                                                            disabled={!settingsTenantId || busy}
                                                                        />
                                                                        <span>{catalogItem?.name || catalogId}</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Bibliotecas de respuestas rapidas</h4>
                                                        <small>Selecciona las bibliotecas especificas para este modulo. Las compartidas aplican siempre.</small>
                                                        <div className="saas-admin-modules">
                                                            {activeQuickReplyLibraries.length === 0 && (
                                                                <div className="saas-admin-empty-inline">No hay bibliotecas activas. Crea bibliotecas en la pestana Respuestas rapidas.</div>
                                                            )}
                                                            {activeQuickReplyLibraries.map((library) => {
                                                                const libraryId = String(library?.libraryId || '').trim().toUpperCase();
                                                                if (!libraryId) return null;
                                                                const isShared = library?.isShared === true;
                                                                const checked = isShared ? true : moduleQuickReplyLibraryDraft.includes(libraryId);
                                                                return (
                                                                    <label key={`assignment_role_${role}`} className="saas-admin-module-toggle">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={() => !isShared && toggleQuickReplyLibraryForModuleDraft(libraryId)}
                                                                            disabled={!settingsTenantId || busy || isShared}
                                                                        />
                                                                        <span>
                                                                            {library?.name || libraryId}
                                                                            {isShared ? ' (compartida, aplica a todos)' : ''}
                                                                        </span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
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
                                                                    catalogIds: (Array.isArray(waModuleForm.catalogIds) ? waModuleForm.catalogIds : [])
                                                                        .map((entry) => String(entry || '').trim().toUpperCase())
                                                                        .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry)),
                                                                    metadata: {
                                                                        ...existingMetadata,
                                                                        moduleSettings: {
                                                                            catalogMode: waModuleForm.moduleCatalogMode || 'inherit',
                                                                            catalogIds: (Array.isArray(waModuleForm.catalogIds) ? waModuleForm.catalogIds : [])
                                                                                .map((entry) => String(entry || '').trim().toUpperCase())
                                                                                .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry)),
                                                                            aiAssistantId: sanitizeAiAssistantCode(waModuleForm.aiAssistantId || '') || null,
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
                                                                const quickReplyLibraryIds = Array.from(new Set(
                                                                    (Array.isArray(moduleQuickReplyLibraryDraft) ? moduleQuickReplyLibraryDraft : [])
                                                                        .map((entry) => String(entry || '').trim().toUpperCase())
                                                                        .filter(Boolean)
                                                                ));

                                                                if (waModulePanelMode === 'edit' && moduleInDetail?.moduleId) {
                                                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/wa-modules/${encodeURIComponent(moduleInDetail.moduleId)}`, {
                                                                        method: 'PUT',
                                                                        body: payload
                                                                    });
                                                                    await syncQuickReplyLibrariesForModule(moduleInDetail.moduleId, quickReplyLibraryIds);
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
                                                                    await syncQuickReplyLibrariesForModule(createdModuleId, quickReplyLibraryIds);
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
                                })()}                            </div>
                        </div>

                    </section>
                    )}


                    {isCatalogSection && (
                    <section id="saas_catalogos" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Catalogos por empresa</h3>
                                        <small>Define multiples catalogos y su origen por tenant.</small>
                                    </div>
                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                        <button
                                            type="button"
                                            disabled={busy || !settingsTenantId || loadingTenantCatalogs}
                                            onClick={() => settingsTenantId && loadTenantCatalogs(settingsTenantId)}
                                        >
                                            Recargar
                                        </button>
                                        <button type="button" disabled={busy || !settingsTenantId || !canEditCatalog} onClick={openCatalogCreate}>
                                            Nuevo catalogo
                                        </button>
                                    </div>
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {!settingsTenantId && (
                                        <div className="saas-admin-empty-state">
                                            <h4>Selecciona una empresa</h4>
                                            <p>Primero elige el tenant para gestionar sus catalogos.</p>
                                        </div>
                                    )}

                                    {settingsTenantId && tenantCatalogItems.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>Sin catalogos configurados.</p>
                                            {canEditCatalog && (
                                                <button type="button" disabled={busy} onClick={openCatalogCreate}>Crear primer catalogo</button>
                                            )}
                                        </div>
                                    )}

                                    {settingsTenantId && tenantCatalogItems.map((item) => (
                                        <button
                                            key={`catalog_item_${item.catalogId}`}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedTenantCatalog?.catalogId === item.catalogId ? 'active' : ''}`.trim()}
                                            onClick={() => openCatalogView(item.catalogId)}
                                        >
                                            <strong>{item.name || item.catalogId}</strong>
                                            <small>{item.catalogId}</small>
                                            <small>{item.sourceType} | {item.isActive ? 'activo' : 'inactivo'}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Catalogos por tenant</h4>
                                        <p>Selecciona una empresa para gestionar varios catalogos.</p>
                                    </div>
                                )}

                                {settingsTenantId && catalogPanelMode === 'view' && !selectedTenantCatalog && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Sin catalogo seleccionado</h4>
                                        <p>Selecciona un catalogo de la lista o crea uno nuevo.</p>
                                    </div>
                                )}

                                {settingsTenantId && catalogPanelMode === 'view' && selectedTenantCatalog && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{selectedTenantCatalog.name || selectedTenantCatalog.catalogId}</h3>
                                                <small>{selectedTenantCatalog.catalogId}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" disabled={busy || !canEditCatalog} onClick={openCatalogEdit}>Editar</button>
                                                <button
                                                    type="button"
                                                    disabled={busy || !canEditCatalog || selectedTenantCatalog.isDefault === true}
                                                    onClick={() => runAction('Catalogo marcado como principal', async () => {
                                                        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, {
                                                            method: 'PUT',
                                                            body: { isDefault: true }
                                                        });
                                                        await loadTenantCatalogs(settingsTenantId);
                                                    })}
                                                >
                                                    Marcar principal
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy || !canEditCatalog || selectedTenantCatalog.isActive === false}
                                                    onClick={() => runAction('Catalogo desactivado', async () => {
                                                        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, {
                                                            method: 'DELETE'
                                                        });
                                                        await loadTenantCatalogs(settingsTenantId);
                                                        setSelectedCatalogId('');
                                                        setCatalogPanelMode('view');
                                                    })}
                                                >
                                                    Desactivar
                                                </button>
                                            </div>
                                        </div>

                                        <div className="saas-admin-detail-grid">
                                            <div className="saas-admin-detail-field"><span>ID catalogo</span><strong>{selectedTenantCatalog.catalogId}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedTenantCatalog.name || '-'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Origen</span><strong>{selectedTenantCatalog.sourceType}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenantCatalog.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Principal</span><strong>{selectedTenantCatalog.isDefault ? 'Si' : 'No'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedTenantCatalog.updatedAt)}</strong></div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Descripcion</h4>
                                            <div className="saas-admin-related-list">
                                                <div className="saas-admin-related-row" role="status">
                                                    <span>{selectedTenantCatalog.description || 'Sin descripcion'}</span>
                                                </div>
                                            </div>
                                        </div>


                                        {selectedTenantCatalog.sourceType === 'local' && (
                                            <div className="saas-admin-related-block saas-admin-catalog-products-block">
                                                <div className="saas-admin-pane-header">
                                                    <div>
                                                        <h4>Productos locales</h4>
                                                        <small>Gestiona productos con imagen, precio y detalle para este catalogo.</small>
                                                    </div>
                                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                        <button
                                                            type="button"
                                                            disabled={busy || loadingCatalogProducts}
                                                            onClick={() => loadTenantCatalogProducts(settingsTenantId, selectedTenantCatalog.catalogId)}
                                                        >
                                                            Recargar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy || !canEditCatalog}
                                                            onClick={openCatalogProductCreate}
                                                        >
                                                            Nuevo producto
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="saas-admin-catalog-products-layout">
                                                    <aside className="saas-admin-catalog-products-list">
                                                        {loadingCatalogProducts && (
                                                            <div className="saas-admin-empty-state">
                                                                <p>Cargando productos...</p>
                                                            </div>
                                                        )}

                                                        {!loadingCatalogProducts && tenantCatalogProducts.length === 0 && (
                                                            <div className="saas-admin-empty-state">
                                                                <p>Sin productos en este catalogo.</p>
                                                                {canEditCatalog && (
                                                                    <button type="button" disabled={busy} onClick={openCatalogProductCreate}>
                                                                        Crear primer producto
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}

                                                        {!loadingCatalogProducts && tenantCatalogProducts.map((productItem) => (
                                                            <button
                                                                key={`catalog_product_${productItem.productId}`}
                                                                type="button"
                                                                className={`saas-admin-list-item saas-admin-list-item--button ${selectedCatalogProductId === productItem.productId && catalogProductPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                                                onClick={() => {
                                                                    setSelectedCatalogProductId(productItem.productId);
                                                                    setCatalogProductPanelMode('view');
                                                                    setCatalogProductForm(buildCatalogProductFormFromItem(productItem));
                                                                    setCatalogProductImageError('');
                                                                }}
                                                            >
                                                                <strong>{productItem.title || productItem.productId}</strong>
                                                                <small>{productItem.productId}</small>
                                                                <small>{productItem.price ? `Precio: ${productItem.price}` : 'Sin precio'} | {productItem.isActive ? 'activo' : 'inactivo'}</small>
                                                            </button>
                                                        ))}
                                                    </aside>

                                                    <div className="saas-admin-catalog-product-detail">
                                                        {catalogProductPanelMode === 'view' && !selectedCatalogProduct && (
                                                            <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                                                <h4>Sin producto seleccionado</h4>
                                                                <p>Selecciona un producto para ver su detalle o crea uno nuevo.</p>
                                                            </div>
                                                        )}

                                                        {catalogProductPanelMode === 'view' && selectedCatalogProduct && (
                                                            <>
                                                                <div className="saas-admin-pane-header">
                                                                    <div>
                                                                        <h3>{selectedCatalogProduct.title || selectedCatalogProduct.productId}</h3>
                                                                        <small>{selectedCatalogProduct.productId}</small>
                                                                    </div>
                                                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                                        <button type="button" disabled={busy || !canEditCatalog} onClick={() => openCatalogProductEdit(selectedCatalogProduct)}>
                                                                            Editar
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={busy || !canEditCatalog || selectedCatalogProduct.isActive === false}
                                                                            onClick={() => runAction('Producto desactivado', async () => {
                                                                                await deactivateCatalogProduct(selectedCatalogProduct.productId);
                                                                            })}
                                                                        >
                                                                            Desactivar
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {selectedCatalogProduct.imageUrl && (
                                                                    <img src={selectedCatalogProduct.imageUrl} alt={selectedCatalogProduct.title || selectedCatalogProduct.productId} className="saas-admin-catalog-product-image" />
                                                                )}

                                                                <div className="saas-admin-detail-grid">
                                                                    <div className="saas-admin-detail-field"><span>ID producto</span><strong>{selectedCatalogProduct.productId}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Precio</span><strong>{selectedCatalogProduct.price || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>SKU</span><strong>{selectedCatalogProduct.sku || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedCatalogProduct.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Stock</span><strong>{selectedCatalogProduct.stockQuantity || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Categoria(s)</span><strong>{selectedCatalogProduct.categoriesText || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Marca</span><strong>{selectedCatalogProduct.brand || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>URL</span><strong>{selectedCatalogProduct.url || '-'}</strong></div>
                                                                </div>

                                                                <div className="saas-admin-related-block">
                                                                    <h4>Descripcion</h4>
                                                                    <div className="saas-admin-related-list">
                                                                        <div className="saas-admin-related-row" role="status">
                                                                            <span>{selectedCatalogProduct.description || 'Sin descripcion'}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}

                                                        {(catalogProductPanelMode === 'create' || catalogProductPanelMode === 'edit') && (
                                                            <>
                                                                <div className="saas-admin-pane-header">
                                                                    <div>
                                                                        <h3>{catalogProductPanelMode === 'create' ? 'Nuevo producto' : 'Editar producto'}</h3>
                                                                        <small>{catalogProductPanelMode === 'create' ? 'Completa los datos principales y guarda.' : 'Actualiza los campos necesarios y guarda.'}</small>
                                                                    </div>
                                                                </div>

                                                                {catalogProductPanelMode === 'edit' && (
                                                                    <div className="saas-admin-detail-field">
                                                                        <span>ID producto</span>
                                                                        <strong>{catalogProductForm.productId || '-'}</strong>
                                                                    </div>
                                                                )}

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>Titulo</label>
                                                                        <input
                                                                            value={catalogProductForm.title}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, title: event.target.value }))}
                                                                            placeholder="Nombre del producto"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>Precio</label>
                                                                        <input
                                                                            value={catalogProductForm.price}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, price: event.target.value }))}
                                                                            placeholder="Ej: 29.90"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>Precio regular</label>
                                                                        <input
                                                                            value={catalogProductForm.regularPrice}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, regularPrice: event.target.value }))}
                                                                            placeholder="Precio regular"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>Precio oferta</label>
                                                                        <input
                                                                            value={catalogProductForm.salePrice}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, salePrice: event.target.value }))}
                                                                            placeholder="Precio de oferta"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>SKU</label>
                                                                        <input
                                                                            value={catalogProductForm.sku}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, sku: event.target.value }))}
                                                                            placeholder="SKU"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>Stock (cantidad)</label>
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            value={catalogProductForm.stockQuantity}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, stockQuantity: event.target.value }))}
                                                                            placeholder="Cantidad"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>Estado de stock</label>
                                                                        <select
                                                                            value={catalogProductForm.stockStatus}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, stockStatus: event.target.value }))}
                                                                            disabled={busy}
                                                                        >
                                                                            <option value="instock">En stock</option>
                                                                            <option value="outofstock">Sin stock</option>
                                                                            <option value="onbackorder">Backorder</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>Marca</label>
                                                                        <input
                                                                            value={catalogProductForm.brand}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, brand: event.target.value }))}
                                                                            placeholder="Marca"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>Categorias (coma separadas)</label>
                                                                        <input
                                                                            value={catalogProductForm.categoriesText}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, categoriesText: event.target.value }))}
                                                                            placeholder="Ej: Limpieza, Hogar"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>URL del producto</label>
                                                                        <input
                                                                            value={catalogProductForm.url}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, url: event.target.value }))}
                                                                            placeholder="https://..."
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-field">
                                                                    <label>Descripcion</label>
                                                                    <textarea
                                                                        value={catalogProductForm.description}
                                                                        onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, description: event.target.value }))}
                                                                        placeholder="Descripcion del producto"
                                                                        rows={4}
                                                                        disabled={busy}
                                                                    />
                                                                </div>

                                                                <label className="saas-admin-module-toggle">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={catalogProductForm.isActive !== false}
                                                                        onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                                        disabled={busy}
                                                                    />
                                                                    <span>Producto activo</span>
                                                                </label>

                                                                {catalogProductForm.imageUrl && (
                                                                    <div className="saas-admin-preview-strip">
                                                                        <img src={catalogProductForm.imageUrl} alt={catalogProductForm.title || 'Producto'} className="saas-admin-hero-image" />
                                                                    </div>
                                                                )}

                                                                <div className="saas-admin-field">
                                                                    <label>URL de imagen</label>
                                                                    <input
                                                                        value={catalogProductForm.imageUrl}
                                                                        onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                                                                        placeholder="https://.../imagen.jpg"
                                                                        disabled={busy || catalogProductImageUploading}
                                                                    />
                                                                </div>

                                                                <ImageDropInput
                                                                    label={catalogProductImageUploading ? 'Subiendo imagen...' : 'Subir imagen de producto'}
                                                                    disabled={busy || catalogProductImageUploading}
                                                                    onFile={(file) => handleCatalogProductImageUpload(file)}
                                                                    helpText="PNG/JPG/WEBP, max 4 MB. Se guarda en archivos del tenant."
                                                                />

                                                                {catalogProductImageError && <div className="saas-admin-alert error">{catalogProductImageError}</div>}

                                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                                    <button
                                                                        type="button"
                                                                        disabled={busy || !canEditCatalog || !String(catalogProductForm.title || '').trim() || !String(catalogProductForm.price || '').trim()}
                                                                        onClick={() => runAction(catalogProductPanelMode === 'create' ? 'Producto creado' : 'Producto actualizado', async () => {
                                                                            await saveCatalogProduct();
                                                                        })}
                                                                    >
                                                                        {catalogProductPanelMode === 'create' ? 'Guardar producto' : 'Actualizar producto'}
                                                                    </button>
                                                                    <button type="button" disabled={busy} onClick={cancelCatalogProductEdit}>Cancelar</button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {selectedTenantCatalog.sourceType === 'woocommerce' && (
                                            <div className="saas-admin-related-block">
                                                <h4>WooCommerce</h4>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Base URL</span><strong>{selectedTenantCatalog.wooBaseUrl || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Per page</span><strong>{selectedTenantCatalog.wooPerPage}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Max pages</span><strong>{selectedTenantCatalog.wooMaxPages}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Incluye sin stock</span><strong>{selectedTenantCatalog.wooIncludeOutOfStock ? 'Si' : 'No'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Consumer key</span><strong>{selectedTenantCatalog.wooConsumerKeyMasked || 'No configurada'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Consumer secret</span><strong>{selectedTenantCatalog.wooConsumerSecretMasked || 'No configurada'}</strong></div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {settingsTenantId && (catalogPanelMode === 'create' || catalogPanelMode === 'edit') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{catalogPanelMode === 'create' ? 'Nuevo catalogo' : 'Editar catalogo'}</h3>
                                                <small>{catalogPanelMode === 'create' ? 'Deja ID vacio para generarlo automaticamente.' : 'Actualiza los campos necesarios y guarda.'}</small>
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <div className="saas-admin-field">
                                                <label>ID catalogo</label>
                                                <input
                                                    value={tenantCatalogForm.catalogId}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, catalogId: String(event.target.value || '').toUpperCase() }))}
                                                    placeholder="CAT-XXXXXX (auto si vacio)"
                                                    disabled={busy || catalogPanelMode === 'edit'}
                                                />
                                            </div>
                                            <div className="saas-admin-field">
                                                <label>Nombre</label>
                                                <input
                                                    value={tenantCatalogForm.name}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, name: event.target.value }))}
                                                    placeholder="Nombre del catalogo"
                                                    disabled={busy}
                                                />
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <div className="saas-admin-field">
                                                <label>Origen</label>
                                                <select
                                                    value={tenantCatalogForm.sourceType}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, sourceType: event.target.value }))}
                                                    disabled={busy}
                                                >
                                                    <option value="local">local</option>
                                                    <option value="woocommerce">woocommerce</option>
                                                    <option value="meta">meta</option>
                                                </select>
                                            </div>
                                            <div className="saas-admin-field">
                                                <label>Descripcion</label>
                                                <input
                                                    value={tenantCatalogForm.description}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, description: event.target.value }))}
                                                    placeholder="Descripcion corta"
                                                    disabled={busy}
                                                />
                                            </div>
                                        </div>

                                        <div className="saas-admin-modules">
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={tenantCatalogForm.isActive !== false}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                    disabled={busy}
                                                />
                                                <span>Catalogo activo</span>
                                            </label>
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={tenantCatalogForm.isDefault === true}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
                                                    disabled={busy}
                                                />
                                                <span>Catalogo principal</span>
                                            </label>
                                        </div>

                                        {tenantCatalogForm.sourceType === 'woocommerce' && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input value={tenantCatalogForm.wooBaseUrl} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooBaseUrl: event.target.value }))} placeholder="Woo base URL (https://tu-tienda.com)" disabled={busy} />
                                                    <input type="number" min={10} max={500} value={tenantCatalogForm.wooPerPage} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooPerPage: event.target.value }))} placeholder="Woo per page" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input type="number" min={1} max={200} value={tenantCatalogForm.wooMaxPages} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooMaxPages: event.target.value }))} placeholder="Woo max pages" disabled={busy} />
                                                    <label className="saas-admin-module-toggle">
                                                        <input type="checkbox" checked={tenantCatalogForm.wooIncludeOutOfStock !== false} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooIncludeOutOfStock: event.target.checked }))} disabled={busy} />
                                                        <span>Woo incluye sin stock</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input value={tenantCatalogForm.wooConsumerKey} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooConsumerKey: event.target.value }))} placeholder={tenantCatalogForm.wooConsumerKeyMasked || 'Woo consumer key (opcional para actualizar)'} disabled={busy} />
                                                    <input type="password" value={tenantCatalogForm.wooConsumerSecret} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooConsumerSecret: event.target.value }))} placeholder={tenantCatalogForm.wooConsumerSecretMasked || 'Woo consumer secret (opcional para actualizar)'} disabled={busy} />
                                                </div>
                                            </>
                                        )}

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button
                                                type="button"
                                                disabled={busy || !canEditCatalog || !String(tenantCatalogForm.name || '').trim()}
                                                onClick={() => runAction(catalogPanelMode === 'create' ? 'Catalogo creado' : 'Catalogo actualizado', async () => {
                                                    const payload = buildTenantCatalogPayload(tenantCatalogForm);
                                                    if (catalogPanelMode === 'create') {
                                                        const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs`, {
                                                            method: 'POST',
                                                            body: payload
                                                        });
                                                        await loadTenantCatalogs(settingsTenantId);
                                                        openCatalogView(String(created?.item?.catalogId || '').trim().toUpperCase());
                                                        return;
                                                    }
                                                    if (!selectedTenantCatalog?.catalogId) return;
                                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, {
                                                        method: 'PUT',
                                                        body: payload
                                                    });
                                                    await loadTenantCatalogs(settingsTenantId);
                                                    openCatalogView(selectedTenantCatalog.catalogId);
                                                })}
                                            >
                                                {catalogPanelMode === 'create' ? 'Guardar catalogo' : 'Actualizar catalogo'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    if (catalogPanelMode === 'create') {
                                                        setCatalogPanelMode('view');
                                                        setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
                                                        return;
                                                    }
                                                    cancelCatalogEdit();
                                                }}
                                            >
                                                Cancelar
                                            </button>
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

                                        {chunkItems(PLAN_LIMIT_KEYS, 2).map((row, rowIndex) => (
                                            <div key={`plan_limit_edit_row_${rowIndex}`} className="saas-admin-form-row">
                                                {row.map((entry) => (
                                                    <div key={`plan_limit_edit_${entry.key}`} className="saas-admin-field">
                                                        <label htmlFor={`plan-limit-${entry.key}`}>{entry.label}</label>
                                                        <input
                                                            id={`plan-limit-${entry.key}`}
                                                            type="number"
                                                            min={entry.min}
                                                            max={entry.max}
                                                            value={planForm?.[entry.key]}
                                                            onChange={(event) => setPlanForm((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                                                            placeholder={entry.label}
                                                            disabled={busy}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        ))}

                                        <div className="saas-admin-related-block">
                                            <h4>Features del plan</h4>
                                            <div className="saas-admin-modules">
                                                {PLAN_FEATURE_KEYS.map((entry) => (
                                                    <label key={`assignment_role_${role}`} className="saas-admin-module-toggle">
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










