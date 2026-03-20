import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as saasAdminPanelHelpers from './saas/helpers';
import SaasPanelHeader from './saas/shared/SaasPanelHeader';
import SaasPanelNav from './saas/shared/SaasPanelNav';
import SaasPanelTenantPicker from './saas/shared/SaasPanelTenantPicker';

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
    useSaasPanelActions,
    useSaasPanelDerivedData,
    useSaasPanelFormSyncEffects,
    useSaasPanelLoadEffects,
    useSaasPanelNavigation,
    useSaasPanelSelectionHotkeys,
    useSaasPanelSelectionState,
    useSaasPanelSectionSyncEffects,
    useSaasPanelSectionChange,
    useSaasPanelCrossNavigation,
    useSaasPanelTenantScopeEffects,
    useSaasPanelUserScopeState,
    useSaasTenantDataLoaders,
    useSaasTenantScope,
    useSaasTenantUsers,
    useTenantLabelsActions,
    useTenantsUsersAdminActions
} from './saas/hooks';


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
    sanitizeMemberships,
    resolvePrimaryRoleFromMemberships,
    getRolePriority,
    normalizeWaModule,
    sanitizeAiAssistantCode,
    buildAiAssistantFormFromItem,
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

    const {
        refreshOverview,
        loadTenantSettings,
        loadTenantIntegrations,
        loadWaModules,
        loadCustomers
    } = useSaasTenantDataLoaders({
        requestJson,
        requiresTenantSelection,
        activeTenantId,
        setOverview,
        setSelectedTenantId,
        setSettingsTenantId,
        setSelectedUserId,
        setLoadingSettings,
        setTenantSettings,
        setLoadingIntegrations,
        setTenantIntegrations,
        setWaModules,
        setSelectedWaModuleId,
        setCustomers,
        setSelectedCustomerId
    });
    const {
        currentUserCapabilities,
        scopedUsers,
        selectedUser,
        selectedUserRole,
        selectedUserRolePriority,
        selectedUserIsSelf,
        canEditSelectedUser,
        canEditSelectedUserRole,
        canToggleSelectedUserStatus,
        canEditSelectedUserOptionalAccess,
        canEditRoleInUserForm,
        canEditScopeInUserForm,
        canConfigureOptionalAccessInUserForm,
        allowedOptionalPermissionsForUserFormRole,
        allowedPackIdsForUserFormRole
    } = useSaasPanelUserScopeState({
        overviewUsers: overview.users,
        tenantScopeId,
        selectedUserId,
        currentUserId,
        actorRoleForPolicy,
        actorRolePriority,
        canManageUsers,
        canActorManageRoleChanges,
        canEditOptionalAccess,
        userPanelMode,
        userFormRole: userForm.role,
        canManageTenants,
        canManageCatalog,
        canManageLabels,
        canManageTenantSettings,
        canEditModules,
        canViewSuperAdminSections,
        resolvePrimaryRoleFromMemberships,
        sanitizeMemberships,
        getRolePriority,
        getOptionalPermissionKeysForRole,
        getAllowedPackIdsForRole
    });
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
    const runActionFallback = useCallback(async (_label, action) => {
        if (typeof action === 'function') {
            await action();
        }
    }, []);
    const runActionRef = useRef(runActionFallback);
    const runActionProxy = useCallback((label, action) => runActionRef.current(label, action), []);
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
        runAction: runActionProxy
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
        runAction: runActionProxy
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
    const {
        isSectionEnabled,
        adminNavItems,
        selectedSectionId,
        isModulesSection,
        isCatalogSection,
        isPlansSection,
        isRolesSection,
        isCustomersSection,
        isOperationsSection,
        isAiSection,
        isLabelsSection,
        isQuickRepliesSection,
        isGeneralConfigSection
    } = useSaasPanelNavigation({
        navItems: ADMIN_NAV_ITEMS,
        currentSection,
        activeSection,
        initialSection,
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
    });


    const handleSectionChange = useSaasPanelSectionChange({
        isSectionEnabled,
        setSelectedTenantId,
        setTenantPanelMode,
        setSelectedUserId,
        setUserPanelMode,
        setMembershipDraft,
        setSelectedRoleKey,
        setRolePanelMode,
        setRoleForm,
        emptyRoleForm: EMPTY_ROLE_FORM,
        setSelectedCustomerId,
        setCustomerPanelMode,
        setSelectedAiAssistantId,
        setAiAssistantPanelMode,
        setAiAssistantForm,
        emptyAiAssistantForm: EMPTY_AI_ASSISTANT_FORM,
        setSelectedLabelId,
        setLabelPanelMode,
        setLabelForm,
        emptyLabelForm: EMPTY_LABEL_FORM,
        setSelectedQuickReplyLibraryId,
        setSelectedQuickReplyItemId,
        setQuickReplyModuleFilterId,
        setQuickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryForm,
        emptyQuickReplyLibraryForm: EMPTY_QUICK_REPLY_LIBRARY_FORM,
        setQuickReplyItemForm,
        emptyQuickReplyItemForm: EMPTY_QUICK_REPLY_ITEM_FORM,
        clearConfigSelection,
        setCurrentSection
    });
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
    const {
        runAction,
        handleOpenOperation,
        handleFormImageUpload
    } = useSaasPanelActions({
        requestJson,
        onOpenWhatsAppOperation,
        tenantScopeId,
        activeTenantId,
        selectedTenantId,
        setError,
        setBusy,
        refreshOverview,
        settingsTenantId,
        loadTenantSettings,
        loadWaModules,
        loadTenantCatalogs,
        loadTenantAiAssistants,
        loadQuickReplyData,
        loadTenantLabels
        });


    useEffect(() => {
        runActionRef.current = runAction || runActionFallback;
    }, [runAction, runActionFallback]);

    useSaasPanelLoadEffects({
        isOpen,
        canManageSaas,
        canViewSuperAdminSections,
        tenantScopeId,
        runAction,
        refreshOverview,
        loadAccessCatalog,
        loadPlanMatrix,
        loadTenantSettings,
        loadWaModules,
        loadTenantCatalogs,
        loadTenantAiAssistants,
        loadTenantIntegrations,
        loadCustomers,
        loadQuickReplyData,
        loadTenantLabels,
        loadTenantAssignmentRules,
        loadTenantOperationsKpis,
        setError
    });

    const {
        clearPanelSelection,
        panelHasSelection
    } = useSaasPanelSelectionState({
        selectedTenantId,
        selectedUserId,
        selectedWaModuleId,
        selectedCatalogId,
        selectedCatalogProductId,
        selectedConfigKey,
        selectedRoleKey,
        selectedPlanId,
        selectedCustomerId,
        selectedAiAssistantId,
        selectedLabelId,
        tenantPanelMode,
        userPanelMode,
        tenantSettingsPanelMode,
        waModulePanelMode,
        catalogPanelMode,
        catalogProductPanelMode,
        planPanelMode,
        rolePanelMode,
        customerPanelMode,
        aiAssistantPanelMode,
        labelPanelMode,
        emptyTenantForm: EMPTY_TENANT_FORM,
        emptyUserForm: EMPTY_USER_FORM,
        emptyWaModuleForm: EMPTY_WA_MODULE_FORM,
        emptyIntegrationsForm: EMPTY_INTEGRATIONS_FORM,
        emptyTenantCatalogForm: EMPTY_TENANT_CATALOG_FORM,
        emptyCatalogProductForm: EMPTY_CATALOG_PRODUCT_FORM,
        emptyAiAssistantForm: EMPTY_AI_ASSISTANT_FORM,
        emptyQuickReplyLibraryForm: EMPTY_QUICK_REPLY_LIBRARY_FORM,
        emptyQuickReplyItemForm: EMPTY_QUICK_REPLY_ITEM_FORM,
        emptyLabelForm: EMPTY_LABEL_FORM,
        emptyRoleForm: EMPTY_ROLE_FORM,
        normalizePlanForm,
        setSelectedTenantId,
        setSelectedUserId,
        setSelectedWaModuleId,
        setSelectedCatalogId,
        setSelectedCatalogProductId,
        setSelectedConfigKey,
        setTenantPanelMode,
        setUserPanelMode,
        setTenantSettingsPanelMode,
        setWaModulePanelMode,
        setCatalogPanelMode,
        setCatalogProductPanelMode,
        setPlanPanelMode,
        setRolePanelMode,
        setMembershipDraft,
        setTenantForm,
        setUserForm,
        setWaModuleForm,
        setTenantIntegrations,
        setTenantCatalogForm,
        setTenantCatalogProducts,
        setCatalogProductForm,
        setCatalogProductImageError,
        setSelectedAiAssistantId,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setSelectedQuickReplyLibraryId,
        setSelectedQuickReplyItemId,
        setQuickReplyModuleFilterId,
        setQuickReplyLibraryForm,
        setQuickReplyItemForm,
        setQuickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode,
        setSelectedLabelId,
        setLabelForm,
        setLabelPanelMode,
        setLabelSearch,
        setSelectedPlanId,
        setPlanForm,
        setRoleForm,
        setEditingWaModuleId,
        setModuleUserPickerId,
        setModuleQuickReplyLibraryDraft
    });

    useSaasPanelSelectionHotkeys({
        isOpen,
        hasSelection: panelHasSelection,
        clearPanelSelection
    });
    useSaasPanelTenantScopeEffects({
        isOpen,
        tenantScopeId,
        requiresTenantSelection,
        settingsTenantId,
        activeTenantId,
        tenantOptions,
        launchSource,
        preferredTenantId,
        emptyTenantCatalogForm: EMPTY_TENANT_CATALOG_FORM,
        emptyCatalogProductForm: EMPTY_CATALOG_PRODUCT_FORM,
        emptyAiAssistantForm: EMPTY_AI_ASSISTANT_FORM,
        emptyQuickReplyLibraryForm: EMPTY_QUICK_REPLY_LIBRARY_FORM,
        emptyQuickReplyItemForm: EMPTY_QUICK_REPLY_ITEM_FORM,
        emptyLabelForm: EMPTY_LABEL_FORM,
        resetOperationsState,
        setWaModules,
        setSelectedWaModuleId,
        setTenantCatalogs,
        setSelectedCatalogId,
        setTenantCatalogForm,
        setTenantCatalogProducts,
        setSelectedCatalogProductId,
        setCatalogProductForm,
        setCatalogProductPanelMode,
        setCatalogProductImageError,
        setTenantAiAssistants,
        setSelectedAiAssistantId,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setQuickReplyLibraries,
        setQuickReplyItems,
        setSelectedQuickReplyLibraryId,
        setSelectedQuickReplyItemId,
        setQuickReplyModuleFilterId,
        setQuickReplyLibraryForm,
        setQuickReplyItemForm,
        setQuickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode,
        setTenantLabels,
        setSelectedLabelId,
        setLabelForm,
        setLabelPanelMode,
        setSelectedConfigKey,
        setSelectedRoleKey,
        setTenantSettingsPanelMode,
        setWaModulePanelMode,
        setCatalogPanelMode,
        setModuleUserPickerId,
        setSelectedCustomerId,
        setCustomerPanelMode,
        setCustomerSearch,
        setCustomerCsvText,
        setLabelSearch,
        setSettingsTenantId,
        setSelectedTenantId,
        setCurrentSection
    });
    useSaasPanelSectionSyncEffects({
        isOpen,
        canManageSaas,
        initialSection,
        activeSection,
        selectedPlanId,
        planMatrix,
        selectedConfigKey,
        selectedConfigModule,
        normalizePlanForm,
        setPlanForm,
        setCurrentSection,
        setSelectedConfigKey,
        setSelectedRoleKey,
        setSelectedWaModuleId,
        setWaModulePanelMode,
        resetWaModuleForm
    });
    useSaasPanelFormSyncEffects({
        isOpen,
        settingsTenantId,
        selectedTenant,
        tenantPanelMode,
        selectedUser,
        userPanelMode,
        selectedCustomer,
        customerPanelMode,
        selectedAiAssistant,
        aiAssistantPanelMode,
        selectedTenantCatalog,
        catalogPanelMode,
        selectedWaModule,
        selectedQuickReplyLibrary,
        quickReplyLibraryPanelMode,
        selectedQuickReplyItem,
        selectedQuickReplyLibraryEntity: selectedQuickReplyLibrary,
        quickReplyItemPanelMode,
        quickReplyScopeModuleId,
        emptyTenantForm: EMPTY_TENANT_FORM,
        emptyUserForm: EMPTY_USER_FORM,
        emptyCustomerForm: EMPTY_CUSTOMER_FORM,
        emptyAiAssistantForm: EMPTY_AI_ASSISTANT_FORM,
        emptyTenantCatalogForm: EMPTY_TENANT_CATALOG_FORM,
        emptyCatalogProductForm: EMPTY_CATALOG_PRODUCT_FORM,
        emptyQuickReplyLibraryForm: EMPTY_QUICK_REPLY_LIBRARY_FORM,
        emptyQuickReplyItemForm: EMPTY_QUICK_REPLY_ITEM_FORM,
        buildTenantFormFromItem,
        buildUserFormFromItem,
        normalizeCustomerFormFromItem,
        buildAiAssistantFormFromItem,
        buildTenantCatalogFormFromItem,
        normalizeQuickReplyMediaAssets,
        loadTenantCatalogProducts,
        setError,
        resetWaModuleForm,
        openWaModuleEditor,
        setTenantForm,
        setUserForm,
        setCustomerForm,
        setAiAssistantForm,
        setTenantCatalogForm,
        setTenantCatalogProducts,
        setSelectedCatalogProductId,
        setCatalogProductForm,
        setCatalogProductPanelMode,
        setCatalogProductImageError,
        setQuickReplyLibraryForm,
        setQuickReplyItemForm
    });
    const {
        openTenantFromUserMembership,
        openUserFromTenant
    } = useSaasPanelCrossNavigation({
        openTenantView,
        openUserView,
        setCurrentSection,
        scrollToSection
    });

    if (!isOpen) return null;

    if (!canManageSaas) {
        return (
            <div className={embedded ? "saas-admin-overlay saas-admin-overlay--embedded" : "saas-admin-overlay"} onClick={() => { if (!embedded) onClose?.(); }}>
                <div className={embedded ? "saas-admin-panel saas-admin-panel--embedded" : "saas-admin-panel"} onClick={(event) => event.stopPropagation()}>
                    <SaasPanelHeader
                        showHeader={showHeader}
                        embedded={embedded}
                        title="Panel SaaS"
                        canOpenOperation={canOpenOperation}
                        isBusy={busy}
                        onOpenOperation={typeof onOpenWhatsAppOperation === "function" ? () => onOpenWhatsAppOperation("", { tenantId: operationTenantId || undefined }) : undefined}
                        currentUserAvatarUrl={currentUserAvatarUrl}
                        currentUserDisplayName={currentUserDisplayName}
                        currentUserRoleLabel={currentUserRoleLabel}
                        buildInitials={buildInitials}
                        closeLabel={closeLabel}
                        onClose={() => { if (typeof onLogout === "function") { onLogout(); return; } onClose?.(); }}
                    />
                    <p>No tienes permisos para administrar empresas y usuarios.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={embedded ? "saas-admin-overlay saas-admin-overlay--embedded" : "saas-admin-overlay"} onClick={() => { if (!embedded) onClose?.(); }}>
            <div className={embedded ? "saas-admin-panel saas-admin-panel--embedded" : "saas-admin-panel"} onClick={(event) => event.stopPropagation()}>
                <SaasPanelHeader
                    showHeader={showHeader}
                    embedded={embedded}
                    title="Control SaaS"
                    subtitle={`Empresa activa: ${activeTenantLabel}`}
                    canOpenOperation={canOpenOperation}
                    isBusy={busy}
                    onOpenOperation={typeof onOpenWhatsAppOperation === "function" ? () => onOpenWhatsAppOperation("", { tenantId: operationTenantId || undefined }) : undefined}
                    currentUserAvatarUrl={currentUserAvatarUrl}
                    currentUserDisplayName={currentUserDisplayName}
                    currentUserRoleLabel={currentUserRoleLabel}
                    buildInitials={buildInitials}
                    closeLabel={closeLabel}
                    onClose={() => { if (typeof onLogout === "function") { onLogout(); return; } onClose?.(); }}
                />

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
                <SaasPanelTenantPicker
                    requiresTenantSelection={requiresTenantSelection}
                    settingsTenantId={settingsTenantId}
                    tenantOptions={tenantOptions}
                    busy={busy}
                    toTenantDisplayName={toTenantDisplayName}
                    onChangeTenant={(nextTenantId) => {
                        setSettingsTenantId(nextTenantId);
                        if (nextTenantId) setSelectedTenantId(nextTenantId);
                    }}
                    onClearTenant={() => {
                        setSettingsTenantId('');
                        setSelectedTenantId('');
                    }}
                />

                <SaasPanelNav
                    showNavigation={showNavigation}
                    adminNavItems={adminNavItems}
                    selectedSectionId={selectedSectionId}
                    busy={busy}
                    tenantScopeLocked={tenantScopeLocked}
                    onSectionChange={handleSectionChange}
                />


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


