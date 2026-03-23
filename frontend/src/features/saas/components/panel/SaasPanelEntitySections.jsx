import {
    CompaniesSection,
    CustomersSection,
    SummarySection,
    UsersSection
} from '../../sections';

export default function SaasPanelEntitySections({
    selectedSectionId = 'saas_resumen',
    currentUserAvatarUrl = '',
    buildInitials,
    currentUserDisplayName = '',
    currentUserRoleLabel = '',
    currentUserEmail = '',
    activeTenantLabel = '',
    currentUserTenantCount = 0,
    currentUserCapabilities = [],
    tenantScopeLocked = false,
    tenantScopeId = '',
    tenantOptions = [],
    overview = {},
    scopedUsers = [],
    waModules = [],
    busy = false,
    isSectionEnabled,
    handleSectionChange,
    canManageTenants = false,
    openTenantCreate,
    selectedTenantId = '',
    openTenantView,
    selectedTenant = null,
    tenantPanelMode = 'view',
    openTenantEdit,
    runAction,
    requestJson,
    activeTenantId = '',
    setSettingsTenantId,
    setSelectedTenantId,
    setTenantPanelMode,
    setTenantForm,
    cancelTenantEdit,
    PLAN_OPTIONS = [],
    tenantForm = {},
    handleFormImageUpload,
    toTenantDisplayName,
    formatDateTimeLabel,
    usersByTenant = {},
    toUserDisplayName,
    openUserFromTenant,
    aiUsageByTenant = {},
    settingsTenantId = '',
    canManageUsers = false,
    openUserCreate,
    hasAccessCatalogData = false,
    loadingAccessCatalog = false,
    selectedUserId = '',
    userPanelMode = 'view',
    openUserView,
    selectedUser = null,
    canEditSelectedUser = false,
    canToggleSelectedUserStatus = false,
    openUserEdit,
    canEditScopeInUserForm = false,
    openTenantFromUserMembership,
    userForm = {},
    setUserForm,
    roleOptions = [],
    canEditRoleInUserForm = false,
    canEditOptionalAccess = false,
    allowedOptionalPermissionsForUserFormRole = [],
    permissionLabelMap = {},
    getOptionalPermissionKeysForRole,
    accessPackOptions = [],
    accessPackLabelMap = {},
    getAllowedPackIdsForRole,
    allowedPackIdsForUserFormRole = [],
    canConfigureOptionalAccessInUserForm = false,
    roleLabelMap = {},
    sanitizeMemberships,
    setSelectedUserId,
    setUserPanelMode,
    cancelUserEdit,
    isCustomersSection = false,
    filteredCustomers = [],
    openCustomerCreate,
    customerSearch = '',
    setCustomerSearch,
    selectedCustomerId = '',
    customerPanelMode = 'view',
    openCustomerView,
    selectedCustomer = null,
    openCustomerEdit,
    loadCustomers,
    customerForm = {},
    setCustomerForm,
    buildCustomerPayloadFromForm,
    setCustomerPanelMode,
    cancelCustomerEdit,
    customerImportModuleId = '',
    setCustomerImportModuleId,
    customerCsvText = '',
    setCustomerCsvText
}) {
    return (
        <>
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
                <>
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
                </>
            )}
        </>
    );
}
