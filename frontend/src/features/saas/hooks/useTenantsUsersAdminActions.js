import {
    buildTenantFormFromItem,
    buildUserFormFromItem,
    sanitizeMemberships
} from '../helpers';

export default function useTenantsUsersAdminActions({
    loadingAccessCatalog = false,
    accessCatalog = {},
    canEditSelectedUser = false,
    selectedTenant = null,
    selectedUser = null,
    tenantScopeId = '',
    selectedTenantId = '',
    tenantOptions = [],
    roleOptions = [],
    emptyTenantForm = {},
    emptyUserForm = {},
    setTenantPanelMode,
    setSelectedTenantId,
    setSettingsTenantId,
    setTenantForm,
    setUserPanelMode,
    setSelectedUserId,
    setMembershipDraft,
    setUserForm,
    loadAccessCatalog
} = {}) {
    const openTenantCreate = () => {
        setTenantPanelMode('create');
        setSelectedTenantId('');
        setTenantForm(emptyTenantForm);
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
        setTenantForm(emptyTenantForm);
        setTenantPanelMode('view');
    };

    const openUserCreate = () => {
        if (!loadingAccessCatalog && (!Array.isArray(accessCatalog?.roleProfiles) || accessCatalog.roleProfiles.length === 0)) {
            loadAccessCatalog?.().catch(() => undefined);
        }
        const fallbackTenantId = String(tenantScopeId || selectedTenantId || tenantOptions[0]?.id || '').trim();
        setUserPanelMode('create');
        setSelectedUserId('');
        setMembershipDraft([]);
        setUserForm({
            ...emptyUserForm,
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
            loadAccessCatalog?.().catch(() => undefined);
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
        setUserForm(emptyUserForm);
        setMembershipDraft([]);
        setUserPanelMode('view');
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
        const fallbackTenant = String(tenantScopeId || selectedTenantId || tenantOptions[0]?.id || '').trim();
        setMembershipDraft((prev) => [
            ...prev,
            { tenantId: fallbackTenant, role: 'seller', active: true }
        ]);
    };

    return {
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
    };
}
