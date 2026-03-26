function createRequestAccessHelpers({
    accessPolicyService,
    authService
} = {}) {
    if (!accessPolicyService || !authService) {
        throw new Error('createRequestAccessHelpers requires accessPolicyService and authService');
    }

    function getAuthRole(req = {}) {
        return accessPolicyService.normalizeRole(req?.authContext?.user?.role || 'seller');
    }

    function getUserPermissions(req = {}) {
        const raw = Array.isArray(req?.authContext?.user?.permissions)
            ? req.authContext.user.permissions
            : [];
        return new Set(
            raw
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
        );
    }

    function hasPermission(req = {}, permission = '') {
        const key = String(permission || '').trim();
        if (!key) return false;
        if (!authService.isAuthEnabled()) {
            return true;
        }
        const authContext = req.authContext || { isAuthenticated: false, user: null };
        const user = authContext?.user && typeof authContext.user === 'object' ? authContext.user : null;
        const userPermissions = Array.from(getUserPermissions(req));
        const hasAuthUser = Boolean(authContext.isAuthenticated && user);
        const isSuperAdmin = Boolean(user?.isSuperAdmin);
        return hasAuthUser && (isSuperAdmin || userPermissions.includes(key));
    }

    function hasAnyPermission(req = {}, permissions = []) {
        const source = Array.isArray(permissions) ? permissions : [];
        return source.some((permission) => hasPermission(req, permission));
    }

    function getAllowedTenantIdsFromAuth(req = {}) {
        const memberships = Array.isArray(req?.authContext?.user?.memberships)
            ? req.authContext.user.memberships
            : [];
        const allowed = memberships
            .filter((membership) => membership?.active !== false)
            .map((membership) => String(membership?.tenantId || '').trim())
            .filter(Boolean);

        if (!allowed.length) {
            const fallback = String(req?.authContext?.user?.tenantId || req?.tenantContext?.id || '').trim();
            if (fallback) return [fallback];
        }

        return Array.from(new Set(allowed));
    }

    function hasSaasControlReadAccess(req = {}, { requireSuperAdmin = false } = {}) {
        if (requireSuperAdmin) {
            return Boolean(req?.authContext?.user?.isSuperAdmin);
        }

        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.PLATFORM_OVERVIEW_READ,
            accessPolicyService.PERMISSIONS.TENANT_OVERVIEW_READ
        ]);
    }

    function hasSaasControlWriteAccess(req = {}, { requireSuperAdmin = false } = {}) {
        if (!authService.isAuthEnabled()) return true;
        const authContext = req.authContext || { isAuthenticated: false, user: null };
        if (!authContext.isAuthenticated || !authContext.user) return false;

        if (requireSuperAdmin) return Boolean(authContext.user?.isSuperAdmin);

        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.PLATFORM_TENANTS_MANAGE,
            accessPolicyService.PERMISSIONS.TENANT_SETTINGS_MANAGE
        ]);
    }

    function hasTenantAdminWriteAccess(req = {}) {
        return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_USERS_MANAGE);
    }

    function isTenantAllowedForUser(req = {}, tenantId = '') {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) return false;
        if (req?.authContext?.user?.isSuperAdmin) return true;
        const allowed = getAllowedTenantIdsFromAuth(req);
        return allowed.includes(cleanTenantId);
    }

    function hasTenantModuleReadAccess(req = {}, tenantId = '') {
        if (!tenantId) return false;
        if (!isTenantAllowedForUser(req, tenantId)) return false;
        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_MODULES_READ,
            accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_READ
        ]);
    }

    function hasTenantModuleWriteAccess(req = {}, tenantId = '') {
        if (!tenantId) return false;
        if (!isTenantAllowedForUser(req, tenantId)) return false;
        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_MODULES_MANAGE,
            accessPolicyService.PERMISSIONS.TENANT_INTEGRATIONS_MANAGE
        ]);
    }

    function hasConversationEventsReadAccess(req = {}, tenantId = '') {
        if (!tenantId) return false;
        if (!isTenantAllowedForUser(req, tenantId)) return false;
        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_CONVERSATION_EVENTS_READ,
            accessPolicyService.PERMISSIONS.TENANT_CHAT_OPERATE,
            accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
        ]);
    }

    function hasChatAssignmentsReadAccess(req = {}, tenantId = '') {
        if (!tenantId) return false;
        if (!isTenantAllowedForUser(req, tenantId)) return false;
        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_READ,
            accessPolicyService.PERMISSIONS.TENANT_CHAT_OPERATE,
            accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
        ]);
    }

    function hasChatAssignmentsWriteAccess(req = {}, tenantId = '') {
        if (!tenantId) return false;
        if (!isTenantAllowedForUser(req, tenantId)) return false;
        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_MANAGE,
            accessPolicyService.PERMISSIONS.TENANT_USERS_MANAGE
        ]);
    }

    function hasAssignmentRulesReadAccess(req = {}, tenantId = '') {
        if (!tenantId) return false;
        if (!isTenantAllowedForUser(req, tenantId)) return false;
        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_ASSIGNMENT_RULES_READ,
            accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_READ,
            accessPolicyService.PERMISSIONS.TENANT_CHAT_OPERATE,
            accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
        ]);
    }

    function hasAssignmentRulesWriteAccess(req = {}, tenantId = '') {
        if (!tenantId) return false;
        if (!isTenantAllowedForUser(req, tenantId)) return false;
        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_ASSIGNMENT_RULES_MANAGE,
            accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_MANAGE,
            accessPolicyService.PERMISSIONS.TENANT_USERS_MANAGE
        ]);
    }

    function hasOperationsKpiReadAccess(req = {}, tenantId = '') {
        if (!tenantId) return false;
        if (!isTenantAllowedForUser(req, tenantId)) return false;
        return hasAnyPermission(req, [
            accessPolicyService.PERMISSIONS.TENANT_KPIS_READ,
            accessPolicyService.PERMISSIONS.TENANT_CONVERSATION_EVENTS_READ,
            accessPolicyService.PERMISSIONS.TENANT_CHAT_ASSIGNMENTS_READ,
            accessPolicyService.PERMISSIONS.TENANT_RUNTIME_READ
        ]);
    }

    function normalizeScopeModuleId(value = '') {
        return String(value || '').trim().toLowerCase();
    }

    function resolvePrimaryRoleFromMemberships(memberships = [], fallbackRole = 'seller') {
        const list = Array.isArray(memberships) ? memberships : [];
        const primary = list.find((item) => item?.active !== false) || list[0] || null;
        const role = String(primary?.role || fallbackRole || 'seller').trim().toLowerCase();
        return accessPolicyService.normalizeRole(role);
    }

    function canActorAssignRole(req = {}, targetRole = 'seller') {
        return accessPolicyService.canAssignRole({
            actorRole: getAuthRole(req),
            isActorSuperAdmin: Boolean(req?.authContext?.user?.isSuperAdmin),
            targetRole
        });
    }

    function canActorEditOptionalAccess(req = {}) {
        return accessPolicyService.canEditOptionalAccess({
            actorRole: getAuthRole(req),
            isActorSuperAdmin: Boolean(req?.authContext?.user?.isSuperAdmin)
        });
    }

    const ROLE_PRIORITY = Object.freeze({
        seller: 1,
        admin: 2,
        owner: 3,
        superadmin: 4
    });

    function getRolePriority(role = 'seller') {
        const cleanRole = String(role || '').trim().toLowerCase();
        return ROLE_PRIORITY[cleanRole] || ROLE_PRIORITY.seller;
    }

    function getAuthUserId(req = {}) {
        return String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim();
    }

    function isSelfUserAction(req = {}, targetUserId = '') {
        const actorUserId = getAuthUserId(req);
        const cleanTargetUserId = String(targetUserId || '').trim();
        return Boolean(actorUserId && cleanTargetUserId && actorUserId === cleanTargetUserId);
    }

    function getUserPrimaryRole(user = {}) {
        const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
        return resolvePrimaryRoleFromMemberships(memberships, user?.role || 'seller');
    }

    function isActorSuperiorToRole(req = {}, targetRole = 'seller') {
        if (req?.authContext?.user?.isSuperAdmin) return true;
        const actorRole = getAuthRole(req);
        return getRolePriority(actorRole) > getRolePriority(targetRole);
    }

    function canActorManageRoleChanges(req = {}) {
        if (req?.authContext?.user?.isSuperAdmin) return true;
        const actorRole = getAuthRole(req);
        if (actorRole === 'owner') return true;
        if (actorRole === 'admin') {
            return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_USERS_OWNER_ASSIGN);
        }
        return false;
    }

    function hasAnyAccessOverride(payload = {}) {
        const source = payload && typeof payload === 'object' ? payload : {};
        const hasGrants = Object.prototype.hasOwnProperty.call(source, 'permissionGrants');
        const hasPacks = Object.prototype.hasOwnProperty.call(source, 'permissionPacks');
        if (!hasGrants && !hasPacks) return false;
        const grants = Array.isArray(source.permissionGrants) ? source.permissionGrants : [];
        const packs = Array.isArray(source.permissionPacks) ? source.permissionPacks : [];
        return grants.length > 0 || packs.length > 0;
    }

    function filterAdminOverviewByScope(req = {}, overview = {}) {
        if (req?.authContext?.user?.isSuperAdmin) return overview;

        const allowed = new Set(getAllowedTenantIdsFromAuth(req));
        const tenants = Array.isArray(overview?.tenants)
            ? overview.tenants.filter((tenant) => allowed.has(String(tenant?.id || '').trim()))
            : [];
        const users = Array.isArray(overview?.users)
            ? overview.users.filter((user) => (Array.isArray(user?.memberships) ? user.memberships : []).some((membership) => allowed.has(String(membership?.tenantId || '').trim())))
            : [];
        const metrics = Array.isArray(overview?.metrics)
            ? overview.metrics.filter((item) => allowed.has(String(item?.tenantId || '').trim()))
            : [];

        return { tenants, users, metrics };
    }

    return {
        getAuthRole,
        getUserPermissions,
        hasPermission,
        hasAnyPermission,
        getAllowedTenantIdsFromAuth,
        hasSaasControlReadAccess,
        hasSaasControlWriteAccess,
        hasTenantAdminWriteAccess,
        isTenantAllowedForUser,
        hasTenantModuleReadAccess,
        hasTenantModuleWriteAccess,
        hasConversationEventsReadAccess,
        hasChatAssignmentsReadAccess,
        hasChatAssignmentsWriteAccess,
        hasAssignmentRulesReadAccess,
        hasAssignmentRulesWriteAccess,
        hasOperationsKpiReadAccess,
        normalizeScopeModuleId,
        resolvePrimaryRoleFromMemberships,
        canActorAssignRole,
        canActorEditOptionalAccess,
        getRolePriority,
        getAuthUserId,
        isSelfUserAction,
        getUserPrimaryRole,
        isActorSuperiorToRole,
        canActorManageRoleChanges,
        hasAnyAccessOverride,
        filterAdminOverviewByScope
    };
}

module.exports = {
    createRequestAccessHelpers
};
