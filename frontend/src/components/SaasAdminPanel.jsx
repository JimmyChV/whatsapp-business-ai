import { useCallback, useEffect, useMemo, useState } from 'react';

import * as saasAdminPanelHelpers from './saas/helpers';

import {
    AiAssistantsSection,
    CatalogSection,
    CompaniesSection,
    CustomersSection,
    ModulesConfigSection,
    OperationsSection,
    PlansSection,
    QuickRepliesSection,
    RoleProfilesSection,
    SummarySection,
    TenantLabelsSection,
    UsersSection
} from './saas/sections';
import {
    useAiAssistantsAdminActions,
    useCatalogAdminActions,
    useCustomersAdminActions,
    useModuleConfigActions,
    useOperationsPanelState,
    usePlansRolesAdminActions,
    useQuickReplyAdminActions,
    useQuickReplyAssetsUpload,
    useSaasAccessControl,
    useSaasApiClient,
    useSaasPanelDerivedData,
    useSaasTenantScope,
    useSaasTenantUsers,
    useTenantLabelsActions,
    useTenantsUsersAdminActions
} from './saas/hooks';
import {
    fetchSaasOverview,
    fetchTenantCustomers,
    fetchTenantIntegrations,
    fetchTenantSettings,
    fetchTenantWaModules
} from './saas/services';

import { uploadImageAsset } from './saas/helpers';

const {
    API_BASE,
    EMPTY_TENANT_FORM,
    EMPTY_USER_FORM,
    EMPTY_CUSTOMER_FORM,
    EMPTY_SETTINGS,
    EMPTY_INTEGRATIONS_FORM,
    EMPTY_TENANT_CATALOG_FORM,
    EMPTY_CATALOG_PRODUCT_FORM,
    buildCatalogProductFormFromItem,
    normalizeCatalogIdsList,
    buildTenantCatalogFormFromItem,
    buildTenantCatalogPayload,
    EMPTY_ACCESS_CATALOG,
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
    QUICK_REPLY_ALLOWED_EXTENSIONS,
    QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
    QUICK_REPLY_ACCEPT_VALUE,
    QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB,
    QUICK_REPLY_DEFAULT_STORAGE_MB,
    EMPTY_QUICK_REPLY_LIBRARY_FORM,
    EMPTY_QUICK_REPLY_ITEM_FORM,
    DEFAULT_LABEL_COLORS,
    EMPTY_LABEL_FORM,
    normalizeQuickReplyMediaAsset,
    normalizeQuickReplyMediaAssets,
    resolveQuickReplyAssetPreviewUrl,
    isQuickReplyImageAsset,
    getQuickReplyAssetTypeLabel,
    getQuickReplyAssetDisplayName,
    normalizeTenantLabelColor,
    buildTenantLabelPayload,
    normalizeOverview,
    sanitizeMemberships,
    resolvePrimaryRoleFromMemberships,
    getRolePriority,
    normalizeWaModule,
    sanitizeAiAssistantCode,
    buildAiAssistantFormFromItem,
    normalizeIntegrationsPayload,
    buildIntegrationsUpdatePayload,
    normalizePlanForm,
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
    chunkItems
} = saasAdminPanelHelpers;

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
    const [error, setError] = useState('');
    const [currentSection, setCurrentSection] = useState(String(activeSection || initialSection || 'saas_resumen'));

    const {
        normalizedRole,
        actorRoleForPolicy,
        actorRolePriority,
        currentUserId,
        canManageTenants,
        canManageUsers,
        canManageTenantSettings,
        canViewTenantSettings,
        canManageCatalog,
        canManageRoles,
        canViewSuperAdminSections,
        canEditTenantSettings,
        canEditModules,
        canViewModules,
        canManageQuickReplies,
        canViewQuickReplies,
        canManageLabels,
        canViewLabels,
        canViewAi,
        canManageAi,
        canViewCustomers,
        canManageCustomers,
        canViewOperations,
        canManageAssignments,
        canEditCatalog,
        requiresTenantSelection,
        canActorManageRoleChanges,
        roleOptions,
        canEditOptionalAccess,
        accessPackOptions,
        accessPackLabelMap,
        getOptionalPermissionKeysForRole,
        getAllowedPackIdsForRole,
        roleProfiles,
        roleLabelMap,
        selectedRoleProfile,
        permissionLabelMap,
        rolePermissionOptions,
        hasAccessCatalogData
    } = useSaasAccessControl({
        userRole,
        isSuperAdmin,
        currentUser,
        accessCatalog,
        selectedRoleKey,
        baseRoleOptions: BASE_ROLE_OPTIONS,
        getRolePriority,
        permissionKeys: {
            PERMISSION_OWNER_ASSIGN,
            PERMISSION_PLATFORM_OVERVIEW_READ,
            PERMISSION_PLATFORM_TENANTS_MANAGE,
            PERMISSION_PLATFORM_PLANS_MANAGE,
            PERMISSION_TENANT_USERS_MANAGE,
            PERMISSION_TENANT_SETTINGS_READ,
            PERMISSION_TENANT_SETTINGS_MANAGE,
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
            PERMISSION_TENANT_INTEGRATIONS_READ,
            PERMISSION_TENANT_INTEGRATIONS_MANAGE
        }
    });
    const { pendingRequests, requestJson } = useSaasApiClient({
        apiBase: API_BASE,
        buildApiHeaders
    });

    const {
        assignmentRules,
        setAssignmentRules,
        loadingAssignmentRules,
        operationsKpis,
        loadingOperationsKpis,
        unassignedCandidates,
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

    const showPanelLoading = useMemo(() => {
        const hasOverviewData = (Array.isArray(overview?.tenants) && overview.tenants.length > 0)
            || (Array.isArray(overview?.users) && overview.users.length > 0);
        return Boolean(busy || (!error && !hasOverviewData && pendingRequests > 0));
    }, [busy, error, overview, pendingRequests]);
    const aiUsageByTenant = useMemo(() => {
        const map = new Map();
        (overview.aiUsage || []).forEach((entry) => {
            const tenantId = String(entry?.tenantId || '').trim();
            if (!tenantId) return;
            map.set(tenantId, Number(entry?.requests || 0) || 0);
        });
        return map;
    }, [overview]);

    const {
        tenantOptions,
        selectedTenant,
        tenantScopeId,
        tenantScopeLocked,
        activeTenantLabel,
        currentUserDisplayName,
        currentUserEmail,
        currentUserAvatarUrl,
        currentUserRole,
        currentUserRoleLabel,
        currentUserTenantCount
    } = useSaasTenantScope({
        overviewTenants: overview.tenants,
        selectedTenantId,
        settingsTenantId,
        requiresTenantSelection,
        activeTenantId,
        toTenantDisplayName,
        currentUser,
        actorRoleForPolicy
    });
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
    const {
        filteredCustomers,
        selectedCustomer,
        selectedWaModule,
        quickReplyScopeModuleId,
        quickReplyLibrariesByScope,
        selectedQuickReplyLibrary,
        quickReplyItemsForSelectedLibrary,
        selectedQuickReplyItem,
        selectedQuickReplyItemMediaAssets,
        quickReplyItemFormAssets,
        visibleQuickReplyLibraries,
        visibleQuickReplyItemsForSelectedLibrary,
        tenantLabelItems,
        selectedTenantLabel,
        visibleTenantLabels,
        selectedSettingsTenant,
        quickReplyTenantPlanId,
        quickReplyUploadMaxMb,
        quickReplyStorageQuotaMb,
        quickReplyUploadMaxBytes,
        selectedConfigModule,
        activeQuickReplyLibraries,
        moduleQuickReplySourceModuleId,
        moduleQuickReplyAssignedLibraries,
        moduleQuickReplyAssignedLibraryIds,
        tenantCatalogItems,
        selectedTenantCatalog,
        selectedCatalogProduct,
        activeCatalogOptions,
        activeCatalogLabelMap,
        tenantAiAssistantItems,
        activeAiAssistantOptions,
        selectedAiAssistant,
        defaultAiAssistantId,
        aiAssistantLabelMap,
        planIds,
        selectedPlan
    } = useSaasPanelDerivedData({
        customerSearch,
        customers,
        selectedCustomerId,
        waModules,
        selectedWaModuleId,
        quickReplyModuleFilterId,
        quickReplyLibraries,
        selectedQuickReplyLibraryId,
        quickReplyItems,
        selectedQuickReplyItemId,
        quickReplyItemForm,
        quickReplyLibrarySearch,
        quickReplyItemSearch,
        tenantLabels,
        selectedLabelId,
        labelSearch,
        tenantOptions,
        settingsTenantId,
        planMatrix,
        quickReplyDefaultMaxUploadMb: QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB,
        quickReplyDefaultStorageMb: QUICK_REPLY_DEFAULT_STORAGE_MB,
        selectedConfigKey,
        waModuleForm,
        tenantCatalogs,
        selectedCatalogId,
        tenantCatalogProducts,
        selectedCatalogProductId,
        tenantAiAssistants,
        selectedAiAssistantId,
        selectedPlanId,
        planOptions: PLAN_OPTIONS
    });
    const {
        usersByTenant,
        usersForSettingsTenant,
        assignedModuleUsers,
        availableUsersForModulePicker
    } = useSaasTenantUsers({
        overviewUsers: overview.users,
        settingsTenantId,
        waModuleForm,
        toUserDisplayName
    });
    const {
        uploadingQuickReplyAssets,
        handleQuickReplyAssetSelection,
        removeQuickReplyAssetAt
    } = useQuickReplyAssetsUpload({
        requestJson,
        settingsTenantId,
        selectedQuickReplyLibrary,
        quickReplyUploadMaxBytes,
        quickReplyUploadMaxMb,
        setQuickReplyItemForm
    });
    const {
        loadQuickReplyData,
        openQuickReplyLibraryCreate,
        openQuickReplyLibraryEdit,
        cancelQuickReplyLibraryEdit,
        toggleModuleInQuickReplyLibraryForm,
        saveQuickReplyLibrary,
        deactivateQuickReplyLibrary,
        openQuickReplyItemCreate,
        openQuickReplyItemEdit,
        cancelQuickReplyItemEdit,
        saveQuickReplyItem,
        deactivateQuickReplyItem
    } = useQuickReplyAdminActions({
        requestJson,
        settingsTenantId,
        waModules,
        selectedQuickReplyLibrary,
        selectedQuickReplyLibraryId,
        selectedQuickReplyItem,
        selectedQuickReplyItemId,
        quickReplyScopeModuleId,
        quickReplyLibraryForm,
        quickReplyItemForm,
        quickReplyLibraryPanelMode,
        quickReplyItemPanelMode,
        emptyQuickReplyLibraryForm: EMPTY_QUICK_REPLY_LIBRARY_FORM,
        emptyQuickReplyItemForm: EMPTY_QUICK_REPLY_ITEM_FORM,
        setQuickReplyLibraries,
        setQuickReplyItems,
        setSelectedQuickReplyLibraryId,
        setSelectedQuickReplyItemId,
        setQuickReplyModuleFilterId,
        setQuickReplyLibraryForm,
        setQuickReplyItemForm,
        setQuickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode,
        setLoadingQuickReplies
    });
    const {
        loadTenantLabels,
        openTenantLabelCreate,
        openTenantLabelEdit,
        cancelTenantLabelEdit,
        toggleModuleInLabelForm,
        saveTenantLabel,
        deactivateTenantLabel
    } = useTenantLabelsActions({
        requestJson,
        settingsTenantId,
        selectedTenantLabel,
        selectedLabelId,
        labelForm,
        labelPanelMode,
        emptyLabelForm: EMPTY_LABEL_FORM,
        defaultLabelColors: DEFAULT_LABEL_COLORS,
        setTenantLabels,
        setSelectedLabelId,
        setLabelForm,
        setLabelPanelMode,
        setLoadingLabels
    });
    const {
        loadTenantCatalogs,
        loadTenantCatalogProducts,
        openCatalogProductCreate,
        openCatalogProductEdit,
        cancelCatalogProductEdit,
        saveCatalogProduct,
        deactivateCatalogProduct,
        handleCatalogProductImageUpload,
        openCatalogView,
        openCatalogCreate,
        openCatalogEdit,
        cancelCatalogEdit
    } = useCatalogAdminActions({
        requestJson,
        settingsTenantId,
        canEditCatalog,
        selectedTenantCatalog,
        selectedCatalogProduct,
        selectedCatalogProductId,
        catalogProductForm,
        catalogProductPanelMode,
        emptyCatalogProductForm: EMPTY_CATALOG_PRODUCT_FORM,
        emptyTenantCatalogForm: EMPTY_TENANT_CATALOG_FORM,
        setTenantCatalogs,
        setSelectedCatalogId,
        setTenantCatalogForm,
        setTenantCatalogProducts,
        setSelectedCatalogProductId,
        setCatalogProductForm,
        setCatalogProductPanelMode,
        setCatalogProductImageError,
        setCatalogProductImageUploading,
        setLoadingTenantCatalogs,
        setLoadingCatalogProducts,
        setCatalogPanelMode
    });
    const {
        loadTenantAiAssistants,
        openAiAssistantCreate,
        applyLavitatAssistantPreset,
        openAiAssistantView,
        openAiAssistantEdit,
        cancelAiAssistantEdit,
        saveAiAssistant,
        markAiAssistantAsDefault,
        toggleAiAssistantActive
    } = useAiAssistantsAdminActions({
        requestJson,
        settingsTenantId,
        canManageAi,
        selectedAiAssistant,
        selectedAiAssistantId,
        aiAssistantForm,
        aiAssistantPanelMode,
        tenantIntegrations,
        emptyAiAssistantForm: EMPTY_AI_ASSISTANT_FORM,
        setLoadingAiAssistants,
        setTenantAiAssistants,
        setSelectedAiAssistantId,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        runAction
    });
    const {
        loadPlanMatrix,
        loadAccessCatalog,
        openPlanView,
        openPlanEdit,
        cancelPlanEdit,
        openRoleCreate,
        openRoleView,
        openRoleEdit,
        cancelRoleEdit,
        toggleRolePermission,
        saveRoleProfile
    } = usePlansRolesAdminActions({
        requestJson,
        canManageRoles,
        selectedRoleProfile,
        selectedRoleKey,
        roleForm,
        rolePanelMode,
        selectedPlanId,
        planMatrix,
        planOptions: PLAN_OPTIONS,
        emptyRoleForm: EMPTY_ROLE_FORM,
        setLoadingPlans,
        setPlanMatrix,
        setSelectedPlanId,
        setPlanForm,
        setPlanPanelMode,
        setRolePanelMode,
        setLoadingAccessCatalog,
        setAccessCatalog,
        setSelectedRoleKey,
        setRoleForm,
        runAction
    });
    const {
        openTenantCreate,
        openTenantView,
        openTenantEdit,
        cancelTenantEdit,
        openUserCreate,
        openUserView,
        openUserEdit,
        cancelUserEdit,
        updateMembershipDraft,
        removeMembershipDraft,
        addMembershipDraft
    } = useTenantsUsersAdminActions({
        loadingAccessCatalog,
        accessCatalog,
        canEditSelectedUser,
        selectedTenant,
        selectedUser,
        tenantScopeId,
        selectedTenantId,
        tenantOptions,
        roleOptions,
        emptyTenantForm: EMPTY_TENANT_FORM,
        emptyUserForm: EMPTY_USER_FORM,
        setTenantPanelMode,
        setSelectedTenantId,
        setSettingsTenantId,
        setTenantForm,
        setUserPanelMode,
        setSelectedUserId,
        setMembershipDraft,
        setUserForm,
        loadAccessCatalog
    });
    const {
        openCustomerCreate,
        openCustomerView,
        openCustomerEdit,
        cancelCustomerEdit
    } = useCustomersAdminActions({
        selectedCustomer,
        customerImportModuleId,
        emptyCustomerForm: EMPTY_CUSTOMER_FORM,
        setSelectedCustomerId,
        setCustomerPanelMode,
        setCustomerForm
    });
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
        const payload = await fetchSaasOverview(requestJson);
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
            const payload = await fetchTenantSettings(requestJson, cleanTenantId);
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
            const payload = await fetchTenantIntegrations(requestJson, cleanTenantId);
            setTenantIntegrations(normalizeIntegrationsPayload(payload?.integrations || {}));
        } finally {
            setLoadingIntegrations(false);
        }
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
        const payload = await fetchTenantWaModules(requestJson, cleanTenantId);
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
        const payload = await fetchTenantCustomers(requestJson, cleanTenantId, { limit: 300, includeInactive: true });
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
    const {
        clearConfigSelection,
        getQuickReplyLibraryIdsForModule,
        openConfigModuleCreate,
        openConfigModuleEdit,
        openConfigModuleView,
        openConfigSettingsEdit,
        openConfigSettingsView,
        syncQuickReplyLibrariesForModule,
        toggleAssignedUserForModule,
        toggleCatalogForModule,
        toggleQuickReplyLibraryForModuleDraft
    } = useModuleConfigActions({
        requestJson,
        settingsTenantId,
        canEditTenantSettings,
        canEditModules,
        waModules,
        selectedConfigModule,
        quickReplyLibraries,
        activeCatalogOptions,
        defaultAiAssistantId,
        setSelectedConfigKey,
        setSelectedRoleKey,
        setSelectedWaModuleId,
        setTenantSettingsPanelMode,
        setWaModulePanelMode,
        setCatalogPanelMode,
        setModuleUserPickerId,
        setModuleQuickReplyLibraryDraft,
        setWaModuleForm,
        openWaModuleEditor,
        resetWaModuleForm
    });
    async function runAction(label, action) {
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
    }
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
            const publicUrl = await uploadImageAsset({ file, tenantId: cleanTenantId, scope, requestJson });
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

                <SummarySection
                    selectedSectionId={selectedSectionId}
                    currentUserAvatarUrl={currentUserAvatarUrl}
                    buildInitials={buildInitials}
                    currentUserDisplayName={currentUserDisplayName}
                    currentUserRoleLabel={currentUserRoleLabel}
                    currentUserEmail={currentUserEmail}
                    activeTenantLabel={activeTenantLabel}
                    currentUserTenantCount={currentUserTenantCount}
                    currentUserCapabilities={currentUserCapabilities}
                    tenantScopeLocked={tenantScopeLocked}
                    tenantScopeId={tenantScopeId}
                    tenantOptions={tenantOptions}
                    overview={overview}
                    scopedUsers={scopedUsers}
                    waModules={waModules}
                    busy={busy}
                    isSectionEnabled={isSectionEnabled}
                    handleSectionChange={handleSectionChange}
                />
                {selectedSectionId !== 'saas_resumen' && (
                <div className="saas-admin-grid">
                    <CompaniesSection
                        selectedSectionId={selectedSectionId}
                        tenantOptions={tenantOptions}
                        busy={busy}
                        canManageTenants={canManageTenants}
                        openTenantCreate={openTenantCreate}
                        selectedTenantId={selectedTenantId}
                        openTenantView={openTenantView}
                        selectedTenant={selectedTenant}
                        tenantPanelMode={tenantPanelMode}
                        openTenantEdit={openTenantEdit}
                        runAction={runAction}
                        requestJson={requestJson}
                        activeTenantId={activeTenantId}
                        setSettingsTenantId={setSettingsTenantId}
                        setSelectedTenantId={setSelectedTenantId}
                        setTenantPanelMode={setTenantPanelMode}
                        setTenantForm={setTenantForm}
                        cancelTenantEdit={cancelTenantEdit}
                        PLAN_OPTIONS={PLAN_OPTIONS}
                        tenantForm={tenantForm}
                        handleFormImageUpload={handleFormImageUpload}
                        buildInitials={buildInitials}
                        toTenantDisplayName={toTenantDisplayName}
                        formatDateTimeLabel={formatDateTimeLabel}
                        usersByTenant={usersByTenant}
                        toUserDisplayName={toUserDisplayName}
                        openUserFromTenant={openUserFromTenant}
                        overview={overview}
                        aiUsageByTenant={aiUsageByTenant}
                        settingsTenantId={settingsTenantId}
                    />
                    <UsersSection
                        selectedSectionId={selectedSectionId}
                        tenantScopeLocked={tenantScopeLocked}
                        busy={busy}
                        canManageUsers={canManageUsers}
                        openUserCreate={openUserCreate}
                        selectedTenantId={selectedTenantId}
                        tenantOptions={tenantOptions}
                        hasAccessCatalogData={hasAccessCatalogData}
                        loadingAccessCatalog={loadingAccessCatalog}
                        scopedUsers={scopedUsers}
                        selectedUserId={selectedUserId}
                        userPanelMode={userPanelMode}
                        openUserView={openUserView}
                        selectedUser={selectedUser}
                        canEditSelectedUser={canEditSelectedUser}
                        canToggleSelectedUserStatus={canToggleSelectedUserStatus}
                        toUserDisplayName={toUserDisplayName}
                        openUserEdit={openUserEdit}
                        runAction={runAction}
                        requestJson={requestJson}
                        canEditScopeInUserForm={canEditScopeInUserForm}
                        settingsTenantId={settingsTenantId}
                        openTenantFromUserMembership={openTenantFromUserMembership}
                        toTenantDisplayName={toTenantDisplayName}
                        formatDateTimeLabel={formatDateTimeLabel}
                        userForm={userForm}
                        setUserForm={setUserForm}
                        roleOptions={roleOptions}
                        canEditRoleInUserForm={canEditRoleInUserForm}
                        canEditOptionalAccess={canEditOptionalAccess}
                        allowedOptionalPermissionsForUserFormRole={allowedOptionalPermissionsForUserFormRole}
                        permissionLabelMap={permissionLabelMap}
                        getOptionalPermissionKeysForRole={getOptionalPermissionKeysForRole}
                        accessPackOptions={accessPackOptions}
                        accessPackLabelMap={accessPackLabelMap}
                        getAllowedPackIdsForRole={getAllowedPackIdsForRole}
                        allowedPackIdsForUserFormRole={allowedPackIdsForUserFormRole}
                        canConfigureOptionalAccessInUserForm={canConfigureOptionalAccessInUserForm}
                        roleLabelMap={roleLabelMap}
                        sanitizeMemberships={sanitizeMemberships}
                        setSelectedUserId={setSelectedUserId}
                        setUserPanelMode={setUserPanelMode}
                        cancelUserEdit={cancelUserEdit}
                        handleFormImageUpload={handleFormImageUpload}
                        buildInitials={buildInitials}
                        activeTenantId={activeTenantId}
                    />
                    <CustomersSection
                        isCustomersSection={isCustomersSection}
                        filteredCustomers={filteredCustomers}
                        busy={busy}
                        tenantScopeLocked={tenantScopeLocked}
                        openCustomerCreate={openCustomerCreate}
                        customerSearch={customerSearch}
                        setCustomerSearch={setCustomerSearch}
                        selectedCustomerId={selectedCustomerId}
                        customerPanelMode={customerPanelMode}
                        openCustomerView={openCustomerView}
                        selectedCustomer={selectedCustomer}
                        openCustomerEdit={openCustomerEdit}
                        runAction={runAction}
                        requestJson={requestJson}
                        tenantScopeId={tenantScopeId}
                        loadCustomers={loadCustomers}
                        formatDateTimeLabel={formatDateTimeLabel}
                        customerForm={customerForm}
                        setCustomerForm={setCustomerForm}
                        waModules={waModules}
                        buildCustomerPayloadFromForm={buildCustomerPayloadFromForm}
                        setSelectedCustomerId={setSelectedCustomerId}
                        setCustomerPanelMode={setCustomerPanelMode}
                        cancelCustomerEdit={cancelCustomerEdit}
                        customerImportModuleId={customerImportModuleId}
                        setCustomerImportModuleId={setCustomerImportModuleId}
                        customerCsvText={customerCsvText}
                        setCustomerCsvText={setCustomerCsvText}
                    />

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
                            activeTenantChatCandidates={unassignedCandidates}
                            tenantScopeId={tenantScopeId}
                            setAssignmentRules={setAssignmentRules}
                            runAction={runAction}
                            saveAssignmentRules={saveAssignmentRules}
                            loadTenantOperationsKpis={loadTenantOperationsKpis}
                            triggerAutoAssignPreview={triggerAutoAssignPreview}
                            formatDateTimeLabel={formatDateTimeLabel}
                        />
                    )}

                    <AiAssistantsSection
                        isAiSection={isAiSection}
                        busy={busy}
                        loadingAiAssistants={loadingAiAssistants}
                        settingsTenantId={settingsTenantId}
                        loadTenantAiAssistants={loadTenantAiAssistants}
                        openAiAssistantCreate={openAiAssistantCreate}
                        tenantAiAssistantItems={tenantAiAssistantItems}
                        selectedAiAssistantId={selectedAiAssistantId}
                        aiAssistantPanelMode={aiAssistantPanelMode}
                        openAiAssistantView={openAiAssistantView}
                        selectedAiAssistant={selectedAiAssistant}
                        formatDateTimeLabel={formatDateTimeLabel}
                        canManageAi={canManageAi}
                        openAiAssistantEdit={openAiAssistantEdit}
                        markAiAssistantAsDefault={markAiAssistantAsDefault}
                        toggleAiAssistantActive={toggleAiAssistantActive}
                        aiAssistantForm={aiAssistantForm}
                        setAiAssistantForm={setAiAssistantForm}
                        AI_MODEL_OPTIONS={AI_MODEL_OPTIONS}
                        applyLavitatAssistantPreset={applyLavitatAssistantPreset}
                        saveAiAssistant={saveAiAssistant}
                        cancelAiAssistantEdit={cancelAiAssistantEdit}
                        setSelectedAiAssistantId={setSelectedAiAssistantId}
                        setAiAssistantPanelMode={setAiAssistantPanelMode}
                        EMPTY_AI_ASSISTANT_FORM={EMPTY_AI_ASSISTANT_FORM}
                    />
                                        {isLabelsSection && (
                    <TenantLabelsSection
                        busy={busy}
                        loadingLabels={loadingLabels}
                        settingsTenantId={settingsTenantId}
                        loadTenantLabels={loadTenantLabels}
                        setError={setError}
                        canManageLabels={canManageLabels}
                        openTenantLabelCreate={openTenantLabelCreate}
                        labelSearch={labelSearch}
                        setLabelSearch={setLabelSearch}
                        visibleTenantLabels={visibleTenantLabels}
                        selectedTenantLabel={selectedTenantLabel}
                        labelPanelMode={labelPanelMode}
                        setSelectedLabelId={setSelectedLabelId}
                        setLabelPanelMode={setLabelPanelMode}
                        openTenantLabelEdit={openTenantLabelEdit}
                        runAction={runAction}
                        deactivateTenantLabel={deactivateTenantLabel}
                        requestJson={requestJson}
                        buildTenantLabelPayload={buildTenantLabelPayload}
                                                labelForm={labelForm}
                        setLabelForm={setLabelForm}
                        normalizeTenantLabelColor={normalizeTenantLabelColor}
                        DEFAULT_LABEL_COLORS={DEFAULT_LABEL_COLORS}
                        toggleModuleInLabelForm={toggleModuleInLabelForm}
                        saveTenantLabel={saveTenantLabel}
                        cancelTenantLabelEdit={cancelTenantLabelEdit}
                    />
                    )}
                    {isQuickRepliesSection && (
                    <QuickRepliesSection
                        busy={busy}
                        loadingQuickReplies={loadingQuickReplies}
                        settingsTenantId={settingsTenantId}
                        loadQuickReplyData={loadQuickReplyData}
                        setError={setError}
                        canManageQuickReplies={canManageQuickReplies}
                        openQuickReplyLibraryCreate={openQuickReplyLibraryCreate}
                        quickReplyModuleFilterId={quickReplyModuleFilterId}
                        setQuickReplyModuleFilterId={setQuickReplyModuleFilterId}
                        setSelectedQuickReplyLibraryId={setSelectedQuickReplyLibraryId}
                        setSelectedQuickReplyItemId={setSelectedQuickReplyItemId}
                        setQuickReplyLibraryPanelMode={setQuickReplyLibraryPanelMode}
                        setQuickReplyItemPanelMode={setQuickReplyItemPanelMode}
                        waModules={waModules}
                        quickReplyLibrarySearch={quickReplyLibrarySearch}
                        setQuickReplyLibrarySearch={setQuickReplyLibrarySearch}
                        visibleQuickReplyLibraries={visibleQuickReplyLibraries}
                        selectedQuickReplyLibrary={selectedQuickReplyLibrary}
                        quickReplyLibraryPanelMode={quickReplyLibraryPanelMode}
                        openQuickReplyLibraryEdit={openQuickReplyLibraryEdit}
                        runAction={runAction}
                        deactivateQuickReplyLibrary={deactivateQuickReplyLibrary}
                        quickReplyLibraryForm={quickReplyLibraryForm}
                        setQuickReplyLibraryForm={setQuickReplyLibraryForm}
                        toggleModuleInQuickReplyLibraryForm={toggleModuleInQuickReplyLibraryForm}
                        saveQuickReplyLibrary={saveQuickReplyLibrary}
                        cancelQuickReplyLibraryEdit={cancelQuickReplyLibraryEdit}
                        QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL={QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}
                        visibleQuickReplyItemsForSelectedLibrary={visibleQuickReplyItemsForSelectedLibrary}
                        quickReplyUploadMaxMb={quickReplyUploadMaxMb}
                        quickReplyStorageQuotaMb={quickReplyStorageQuotaMb}
                        quickReplyItemSearch={quickReplyItemSearch}
                        setQuickReplyItemSearch={setQuickReplyItemSearch}
                        normalizeQuickReplyMediaAssets={normalizeQuickReplyMediaAssets}
                        selectedQuickReplyItem={selectedQuickReplyItem}
                        quickReplyItemPanelMode={quickReplyItemPanelMode}
                        openQuickReplyItemEdit={openQuickReplyItemEdit}
                        deactivateQuickReplyItem={deactivateQuickReplyItem}
                        selectedQuickReplyItemMediaAssets={selectedQuickReplyItemMediaAssets}
                        formatDateTimeLabel={formatDateTimeLabel}
                        resolveQuickReplyAssetPreviewUrl={resolveQuickReplyAssetPreviewUrl}
                        getQuickReplyAssetDisplayName={getQuickReplyAssetDisplayName}
                        isQuickReplyImageAsset={isQuickReplyImageAsset}
                        getQuickReplyAssetTypeLabel={getQuickReplyAssetTypeLabel}
                        formatBytes={formatBytes}
                        quickReplyItemForm={quickReplyItemForm}
                        setQuickReplyItemForm={setQuickReplyItemForm}
                        uploadingQuickReplyAssets={uploadingQuickReplyAssets}
                        QUICK_REPLY_ACCEPT_VALUE={QUICK_REPLY_ACCEPT_VALUE}
                        handleQuickReplyAssetSelection={handleQuickReplyAssetSelection}
                        quickReplyItemFormAssets={quickReplyItemFormAssets}
                        removeQuickReplyAssetAt={removeQuickReplyAssetAt}
                        saveQuickReplyItem={saveQuickReplyItem}
                        cancelQuickReplyItemEdit={cancelQuickReplyItemEdit}
                        openQuickReplyItemCreate={openQuickReplyItemCreate}
                    />
                    )}
                    <ModulesConfigSection
                        isGeneralConfigSection={isGeneralConfigSection}
                        isModulesSection={isModulesSection}
                        settingsTenantId={settingsTenantId}
                        toTenantDisplayName={toTenantDisplayName}
                        tenantOptions={tenantOptions}
                        busy={busy}
                        canEditModules={canEditModules}
                        openConfigModuleCreate={openConfigModuleCreate}
                        openConfigSettingsView={openConfigSettingsView}
                        clearConfigSelection={clearConfigSelection}
                        tenantSettings={tenantSettings}
                        MODULE_KEYS={MODULE_KEYS}
                        waModules={waModules}
                        selectedConfigKey={selectedConfigKey}
                        openConfigModuleView={openConfigModuleView}
                        waModulePanelMode={waModulePanelMode}
                        selectedConfigModule={selectedConfigModule}
                        assignedModuleUsers={assignedModuleUsers}
                        toUserDisplayName={toUserDisplayName}
                        usersForSettingsTenant={usersForSettingsTenant}
                        normalizeCatalogIdsList={normalizeCatalogIdsList}
                        activeCatalogLabelMap={activeCatalogLabelMap}
                        sanitizeAiAssistantCode={sanitizeAiAssistantCode}
                        aiAssistantLabelMap={aiAssistantLabelMap}
                        handleOpenOperation={handleOpenOperation}
                        openConfigModuleEdit={openConfigModuleEdit}
                        runAction={runAction}
                        requestJson={requestJson}
                        setTenantSettingsPanelMode={setTenantSettingsPanelMode}
                        loadTenantSettings={loadTenantSettings}
                        setBusy={setBusy}
                        setError={setError}
                        loadingSettings={loadingSettings}
                        tenantSettingsPanelMode={tenantSettingsPanelMode}
                        setTenantSettings={setTenantSettings}
                        CATALOG_MODE_OPTIONS={CATALOG_MODE_OPTIONS}
                        formatDateTimeLabel={formatDateTimeLabel}
                        buildInitials={buildInitials}
                        waModuleForm={waModuleForm}
                        setWaModuleForm={setWaModuleForm}
                        availableUsersForModulePicker={availableUsersForModulePicker}
                        toggleAssignedUserForModule={toggleAssignedUserForModule}
                        activeCatalogOptions={activeCatalogOptions}
                        toggleCatalogForModule={toggleCatalogForModule}
                        activeAiAssistantOptions={activeAiAssistantOptions}
                        moduleQuickReplyLibraryDraft={moduleQuickReplyLibraryDraft}
                        activeQuickReplyLibraries={activeQuickReplyLibraries}
                        toggleQuickReplyLibraryForModuleDraft={toggleQuickReplyLibraryForModuleDraft}
                        moduleUserPickerId={moduleUserPickerId}
                        setModuleUserPickerId={setModuleUserPickerId}
                        syncQuickReplyLibrariesForModule={syncQuickReplyLibrariesForModule}
                        handleFormImageUpload={handleFormImageUpload}
                        canEditTenantSettings={canEditTenantSettings}
                        setWaModulePanelMode={setWaModulePanelMode}
                        setSelectedWaModuleId={setSelectedWaModuleId}
                        setSelectedConfigKey={setSelectedConfigKey}
                    />

                    <CatalogSection
                        isCatalogSection={isCatalogSection}
                        busy={busy}
                        settingsTenantId={settingsTenantId}
                        loadingTenantCatalogs={loadingTenantCatalogs}
                        loadTenantCatalogs={loadTenantCatalogs}
                        canEditCatalog={canEditCatalog}
                        openCatalogCreate={openCatalogCreate}
                        tenantCatalogItems={tenantCatalogItems}
                        selectedTenantCatalog={selectedTenantCatalog}
                        openCatalogView={openCatalogView}
                        catalogPanelMode={catalogPanelMode}
                        setCatalogPanelMode={setCatalogPanelMode}
                        setTenantCatalogForm={setTenantCatalogForm}
                        EMPTY_TENANT_CATALOG_FORM={EMPTY_TENANT_CATALOG_FORM}
                        cancelCatalogEdit={cancelCatalogEdit}
                        formatDateTimeLabel={formatDateTimeLabel}
                        openCatalogEdit={openCatalogEdit}
                        requestJson={requestJson}
                        runAction={runAction}
                        buildTenantCatalogPayload={buildTenantCatalogPayload}
                        selectedCatalogProductId={selectedCatalogProductId}
                        setSelectedCatalogProductId={setSelectedCatalogProductId}
                        loadTenantCatalogProducts={loadTenantCatalogProducts}
                        tenantCatalogProducts={tenantCatalogProducts}
                        loadingCatalogProducts={loadingCatalogProducts}
                        setCatalogProductPanelMode={setCatalogProductPanelMode}
                        openCatalogProductCreate={openCatalogProductCreate}
                        selectedCatalogProduct={selectedCatalogProduct}
                        catalogProductPanelMode={catalogProductPanelMode}
                        openCatalogProductEdit={openCatalogProductEdit}
                        deactivateCatalogProduct={deactivateCatalogProduct}
                        setCatalogProductForm={setCatalogProductForm}
                        buildCatalogProductFormFromItem={buildCatalogProductFormFromItem}
                        catalogProductForm={catalogProductForm}
                        setCatalogProductImageError={setCatalogProductImageError}
                        handleCatalogProductImageUpload={handleCatalogProductImageUpload}
                        catalogProductImageUploading={catalogProductImageUploading}
                        catalogProductImageError={catalogProductImageError}
                        saveCatalogProduct={saveCatalogProduct}
                        cancelCatalogProductEdit={cancelCatalogProductEdit}
                        setSelectedCatalogId={setSelectedCatalogId}
                        tenantCatalogForm={tenantCatalogForm}
                    />

                    <RoleProfilesSection
                        isRolesSection={isRolesSection}
                        busy={busy}
                        canManageRoles={canManageRoles}
                        openRoleCreate={openRoleCreate}
                        roleProfiles={roleProfiles}
                        selectedRoleKey={selectedRoleKey}
                        rolePanelMode={rolePanelMode}
                        openRoleView={openRoleView}
                        selectedRoleProfile={selectedRoleProfile}
                        openRoleEdit={openRoleEdit}
                        permissionLabelMap={permissionLabelMap}
                        rolePermissionOptions={rolePermissionOptions}
                        roleForm={roleForm}
                        setRoleForm={setRoleForm}
                        sanitizeRoleCode={sanitizeRoleCode}
                        toggleRolePermission={toggleRolePermission}
                        saveRoleProfile={saveRoleProfile}
                        cancelRoleEdit={cancelRoleEdit}
                    />
                    <PlansSection
                        isPlansSection={isPlansSection}
                        busy={busy}
                        loadingPlans={loadingPlans}
                        loadPlanMatrix={loadPlanMatrix}
                        planIds={planIds}
                        selectedPlanId={selectedPlanId}
                        planMatrix={planMatrix}
                        openPlanView={openPlanView}
                        selectedPlan={selectedPlan}
                        planPanelMode={planPanelMode}
                        openPlanEdit={openPlanEdit}
                        PLAN_LIMIT_KEYS={PLAN_LIMIT_KEYS}
                        PLAN_FEATURE_KEYS={PLAN_FEATURE_KEYS}
                        planForm={planForm}
                        setPlanForm={setPlanForm}
                        chunkItems={chunkItems}
                        runAction={runAction}
                        requestJson={requestJson}
                        setPlanPanelMode={setPlanPanelMode}
                        cancelPlanEdit={cancelPlanEdit}
                    />
                </div>
                )}
            </div>
        </div>
    );
}















































