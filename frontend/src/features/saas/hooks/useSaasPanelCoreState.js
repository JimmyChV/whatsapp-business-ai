import { useState } from 'react';

export default function useSaasPanelCoreState({
    activeSection = '',
    initialSection = 'saas_resumen',
    EMPTY_TENANT_FORM,
    EMPTY_USER_FORM,
    EMPTY_CUSTOMER_FORM,
    EMPTY_SETTINGS,
    EMPTY_INTEGRATIONS_FORM,
    EMPTY_TENANT_CATALOG_FORM,
    EMPTY_CATALOG_PRODUCT_FORM,
    EMPTY_WA_MODULE_FORM,
    EMPTY_AI_ASSISTANT_FORM,
    EMPTY_ACCESS_CATALOG,
    EMPTY_ROLE_FORM,
    normalizePlanForm,
    EMPTY_QUICK_REPLY_LIBRARY_FORM,
    EMPTY_QUICK_REPLY_ITEM_FORM,
    EMPTY_LABEL_FORM
} = {}) {
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

    return {
        overview,
        setOverview,
        tenantForm,
        setTenantForm,
        userForm,
        setUserForm,
        settingsTenantId,
        setSettingsTenantId,
        tenantSettings,
        setTenantSettings,
        membershipDraft,
        setMembershipDraft,
        waModules,
        setWaModules,
        waModuleForm,
        setWaModuleForm,
        editingWaModuleId,
        setEditingWaModuleId,
        selectedTenantId,
        setSelectedTenantId,
        selectedUserId,
        setSelectedUserId,
        selectedWaModuleId,
        setSelectedWaModuleId,
        quickReplyModuleFilterId,
        setQuickReplyModuleFilterId,
        moduleQuickReplyLibraryDraft,
        setModuleQuickReplyLibraryDraft,
        selectedConfigKey,
        setSelectedConfigKey,
        moduleUserPickerId,
        setModuleUserPickerId,
        tenantPanelMode,
        setTenantPanelMode,
        userPanelMode,
        setUserPanelMode,
        tenantSettingsPanelMode,
        setTenantSettingsPanelMode,
        waModulePanelMode,
        setWaModulePanelMode,
        tenantIntegrations,
        setTenantIntegrations,
        tenantCatalogs,
        setTenantCatalogs,
        selectedCatalogId,
        setSelectedCatalogId,
        tenantCatalogForm,
        setTenantCatalogForm,
        loadingTenantCatalogs,
        setLoadingTenantCatalogs,
        catalogPanelMode,
        setCatalogPanelMode,
        tenantCatalogProducts,
        setTenantCatalogProducts,
        selectedCatalogProductId,
        setSelectedCatalogProductId,
        catalogProductForm,
        setCatalogProductForm,
        catalogProductPanelMode,
        setCatalogProductPanelMode,
        loadingCatalogProducts,
        setLoadingCatalogProducts,
        catalogProductImageUploading,
        setCatalogProductImageUploading,
        catalogProductImageError,
        setCatalogProductImageError,
        tenantAiAssistants,
        setTenantAiAssistants,
        selectedAiAssistantId,
        setSelectedAiAssistantId,
        aiAssistantForm,
        setAiAssistantForm,
        aiAssistantPanelMode,
        setAiAssistantPanelMode,
        loadingAiAssistants,
        setLoadingAiAssistants,
        planMatrix,
        setPlanMatrix,
        selectedPlanId,
        setSelectedPlanId,
        planForm,
        setPlanForm,
        planPanelMode,
        setPlanPanelMode,
        accessCatalog,
        setAccessCatalog,
        loadingAccessCatalog,
        setLoadingAccessCatalog,
        selectedRoleKey,
        setSelectedRoleKey,
        roleForm,
        setRoleForm,
        rolePanelMode,
        setRolePanelMode,
        quickReplyLibraries,
        setQuickReplyLibraries,
        quickReplyItems,
        setQuickReplyItems,
        selectedQuickReplyLibraryId,
        setSelectedQuickReplyLibraryId,
        selectedQuickReplyItemId,
        setSelectedQuickReplyItemId,
        quickReplyLibraryForm,
        setQuickReplyLibraryForm,
        quickReplyItemForm,
        setQuickReplyItemForm,
        quickReplyLibraryPanelMode,
        setQuickReplyLibraryPanelMode,
        quickReplyItemPanelMode,
        setQuickReplyItemPanelMode,
        quickReplyLibrarySearch,
        setQuickReplyLibrarySearch,
        quickReplyItemSearch,
        setQuickReplyItemSearch,
        loadingQuickReplies,
        setLoadingQuickReplies,
        tenantLabels,
        setTenantLabels,
        selectedLabelId,
        setSelectedLabelId,
        labelForm,
        setLabelForm,
        labelPanelMode,
        setLabelPanelMode,
        labelSearch,
        setLabelSearch,
        loadingLabels,
        setLoadingLabels,
        customers,
        setCustomers,
        selectedCustomerId,
        setSelectedCustomerId,
        customerForm,
        setCustomerForm,
        customerPanelMode,
        setCustomerPanelMode,
        customerSearch,
        setCustomerSearch,
        customerCsvText,
        setCustomerCsvText,
        customerImportModuleId,
        setCustomerImportModuleId,
        busy,
        setBusy,
        loadingSettings,
        setLoadingSettings,
        loadingIntegrations,
        setLoadingIntegrations,
        loadingPlans,
        setLoadingPlans,
        error,
        setError,
        currentSection,
        setCurrentSection
    };
}
