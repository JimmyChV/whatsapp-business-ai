import {
    CompaniesSection,
    CustomersSection,
    SummarySection,
    UsersSection
} from '../../sections';

export default function SaasPanelEntitySections(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const selectedSectionId = context?.selectedSectionId || 'saas_resumen';
    const summaryContext = {
        selectedSectionId: context.selectedSectionId,
        currentUserAvatarUrl: context.currentUserAvatarUrl,
        buildInitials: context.buildInitials,
        currentUserDisplayName: context.currentUserDisplayName,
        currentUserRoleLabel: context.currentUserRoleLabel,
        currentUserEmail: context.currentUserEmail,
        activeTenantLabel: context.activeTenantLabel,
        currentUserTenantCount: context.currentUserTenantCount,
        currentUserCapabilities: context.currentUserCapabilities,
        tenantScopeLocked: context.tenantScopeLocked,
        tenantScopeId: context.tenantScopeId,
        tenantOptions: context.tenantOptions,
        customers: context.customers,
        operationsSnapshot: context.operationsSnapshot,
        campaignsController: context.campaignsController,
        metaTemplatesController: context.metaTemplatesController,
        overview: context.overview,
        scopedUsers: context.scopedUsers,
        waModules: context.waModules,
        busy: context.busy,
        isSectionEnabled: context.isSectionEnabled,
        handleSectionChange: context.handleSectionChange
    };

    const companiesContext = {
        selectedSectionId: context.selectedSectionId,
        tenantOptions: context.tenantOptions,
        busy: context.busy,
        canManageTenants: context.canManageTenants,
        openTenantCreate: context.openTenantCreate,
        selectedTenantId: context.selectedTenantId,
        openTenantView: context.openTenantView,
        selectedTenant: context.selectedTenant,
        tenantPanelMode: context.tenantPanelMode,
        openTenantEdit: context.openTenantEdit,
        runAction: context.runAction,
        requestJson: context.requestJson,
        activeTenantId: context.activeTenantId,
        setSettingsTenantId: context.setSettingsTenantId,
        setSelectedTenantId: context.setSelectedTenantId,
        setTenantPanelMode: context.setTenantPanelMode,
        setTenantForm: context.setTenantForm,
        cancelTenantEdit: context.cancelTenantEdit,
        PLAN_OPTIONS: context.PLAN_OPTIONS,
        tenantForm: context.tenantForm,
        handleFormImageUpload: context.handleFormImageUpload,
        buildInitials: context.buildInitials,
        toTenantDisplayName: context.toTenantDisplayName,
        formatDateTimeLabel: context.formatDateTimeLabel,
        usersByTenant: context.usersByTenant,
        toUserDisplayName: context.toUserDisplayName,
        openUserFromTenant: context.openUserFromTenant,
        overview: context.overview,
        aiUsageByTenant: context.aiUsageByTenant,
        settingsTenantId: context.settingsTenantId
    };

    const usersContext = {
        selectedSectionId: context.selectedSectionId,
        tenantScopeLocked: context.tenantScopeLocked,
        busy: context.busy,
        canManageUsers: context.canManageUsers,
        openUserCreate: context.openUserCreate,
        selectedTenantId: context.selectedTenantId,
        tenantOptions: context.tenantOptions,
        hasAccessCatalogData: context.hasAccessCatalogData,
        loadingAccessCatalog: context.loadingAccessCatalog,
        scopedUsers: context.scopedUsers,
        selectedUserId: context.selectedUserId,
        userPanelMode: context.userPanelMode,
        openUserView: context.openUserView,
        selectedUser: context.selectedUser,
        canEditSelectedUser: context.canEditSelectedUser,
        canToggleSelectedUserStatus: context.canToggleSelectedUserStatus,
        toUserDisplayName: context.toUserDisplayName,
        openUserEdit: context.openUserEdit,
        runAction: context.runAction,
        requestJson: context.requestJson,
        canEditScopeInUserForm: context.canEditScopeInUserForm,
        settingsTenantId: context.settingsTenantId,
        openTenantFromUserMembership: context.openTenantFromUserMembership,
        toTenantDisplayName: context.toTenantDisplayName,
        formatDateTimeLabel: context.formatDateTimeLabel,
        userForm: context.userForm,
        setUserForm: context.setUserForm,
        roleOptions: context.roleOptions,
        canEditRoleInUserForm: context.canEditRoleInUserForm,
        canEditOptionalAccess: context.canEditOptionalAccess,
        allowedOptionalPermissionsForUserFormRole: context.allowedOptionalPermissionsForUserFormRole,
        permissionLabelMap: context.permissionLabelMap,
        getOptionalPermissionKeysForRole: context.getOptionalPermissionKeysForRole,
        accessPackOptions: context.accessPackOptions,
        accessPackLabelMap: context.accessPackLabelMap,
        getAllowedPackIdsForRole: context.getAllowedPackIdsForRole,
        allowedPackIdsForUserFormRole: context.allowedPackIdsForUserFormRole,
        canConfigureOptionalAccessInUserForm: context.canConfigureOptionalAccessInUserForm,
        roleLabelMap: context.roleLabelMap,
        sanitizeMemberships: context.sanitizeMemberships,
        setSelectedUserId: context.setSelectedUserId,
        setUserPanelMode: context.setUserPanelMode,
        cancelUserEdit: context.cancelUserEdit,
        handleFormImageUpload: context.handleFormImageUpload,
        buildInitials: context.buildInitials,
        activeTenantId: context.activeTenantId
    };

    // TODO: packId no existe en el contexto actual — UsersSection lo desestructura con default vacío. Resolver en Fase 6 cuando se revise el dominio users.
    const customersContext = {
        isCustomersSection: context.isCustomersSection,
        filteredCustomers: context.filteredCustomers,
        busy: context.busy,
        tenantScopeLocked: context.tenantScopeLocked,
        openCustomerCreate: context.openCustomerCreate,
        customerSearch: context.customerSearch,
        setCustomerSearch: context.setCustomerSearch,
        selectedCustomerId: context.selectedCustomerId,
        customerPanelMode: context.customerPanelMode,
        openCustomerView: context.openCustomerView,
        selectedCustomer: context.selectedCustomer,
        openCustomerEdit: context.openCustomerEdit,
        runAction: context.runAction,
        requestJson: context.requestJson,
        socket: context.socket,
        tenantScopeId: context.tenantScopeId,
        loadCustomers: context.loadCustomers,
        syncCustomersDelta: context.syncCustomersDelta,
        maxCustomersUpdatedAt: context.maxCustomersUpdatedAt,
        patchCustomerInCache: context.patchCustomerInCache,
        customersLoadProgress: context.customersLoadProgress,
        customersLoadingBatch: context.customersLoadingBatch,
        setCustomers: context.setCustomers,
        formatDateTimeLabel: context.formatDateTimeLabel,
        customerForm: context.customerForm,
        setCustomerForm: context.setCustomerForm,
        waModules: context.waModules,
        buildCustomerPayloadFromForm: context.buildCustomerPayloadFromForm,
        setSelectedCustomerId: context.setSelectedCustomerId,
        setCustomerPanelMode: context.setCustomerPanelMode,
        cancelCustomerEdit: context.cancelCustomerEdit,
        customerImportModuleId: context.customerImportModuleId,
        setCustomerImportModuleId: context.setCustomerImportModuleId,
        customerCsvText: context.customerCsvText,
        setCustomerCsvText: context.setCustomerCsvText
    };
    return (
        <>
            <SummarySection context={summaryContext} />
            {selectedSectionId !== 'saas_resumen' && (
                <>
                    <CompaniesSection context={companiesContext} />
                    <UsersSection context={usersContext} />
                    <CustomersSection context={customersContext} />
                </>
            )}
        </>
    );
}
