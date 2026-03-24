export default function useSaasUsersController(input = {}) {
    const {
        panelCoreState = {},
        panelUserScopeState = {},
        tenantUsersState = {},
        tenantsUsersActions = null
    } = input;

    const usersState = {
        userForm: panelCoreState.userForm,
        setUserForm: panelCoreState.setUserForm,
        membershipDraft: panelCoreState.membershipDraft,
        setMembershipDraft: panelCoreState.setMembershipDraft,
        selectedUserId: panelCoreState.selectedUserId,
        setSelectedUserId: panelCoreState.setSelectedUserId,
        userPanelMode: panelCoreState.userPanelMode,
        setUserPanelMode: panelCoreState.setUserPanelMode
    };

    const usersDerived = {
        currentUserCapabilities: panelUserScopeState.currentUserCapabilities,
        scopedUsers: panelUserScopeState.scopedUsers,
        selectedUser: panelUserScopeState.selectedUser,
        selectedUserRole: panelUserScopeState.selectedUserRole,
        selectedUserRolePriority: panelUserScopeState.selectedUserRolePriority,
        selectedUserIsSelf: panelUserScopeState.selectedUserIsSelf,
        canEditSelectedUser: panelUserScopeState.canEditSelectedUser,
        canEditSelectedUserRole: panelUserScopeState.canEditSelectedUserRole,
        canToggleSelectedUserStatus: panelUserScopeState.canToggleSelectedUserStatus,
        canEditSelectedUserOptionalAccess: panelUserScopeState.canEditSelectedUserOptionalAccess,
        canEditRoleInUserForm: panelUserScopeState.canEditRoleInUserForm,
        canEditScopeInUserForm: panelUserScopeState.canEditScopeInUserForm,
        canConfigureOptionalAccessInUserForm: panelUserScopeState.canConfigureOptionalAccessInUserForm,
        allowedOptionalPermissionsForUserFormRole: panelUserScopeState.allowedOptionalPermissionsForUserFormRole,
        allowedPackIdsForUserFormRole: panelUserScopeState.allowedPackIdsForUserFormRole,
        usersByTenant: tenantUsersState.usersByTenant,
        usersForSettingsTenant: tenantUsersState.usersForSettingsTenant,
        assignedModuleUsers: tenantUsersState.assignedModuleUsers,
        availableUsersForModulePicker: tenantUsersState.availableUsersForModulePicker
    };

    return {
        usersState,
        usersDerived,
        usersActions: tenantsUsersActions
    };
}
