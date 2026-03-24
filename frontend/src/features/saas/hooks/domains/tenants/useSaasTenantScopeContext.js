import { useMemo } from 'react';

export function useSaasTenantScopeContext({
  saasRuntime,
  saasSession,
  saasAuthEnabled,
  isSaasAuthenticated,
}) {
  const availableTenantOptions = useMemo(() => {
    const runtimeTenantOptions = Array.isArray(saasRuntime?.tenants) ? saasRuntime.tenants : [];
    const sessionMemberships = Array.isArray(saasSession?.user?.memberships) ? saasSession.user.memberships : [];
    const tenantOptionsById = new Map();

    runtimeTenantOptions.forEach((tenant) => {
      const tenantId = String(tenant?.id || '').trim();
      if (!tenantId) return;
      tenantOptionsById.set(tenantId, tenant);
    });

    sessionMemberships.forEach((membership) => {
      const tenantId = String(membership?.tenantId || '').trim();
      if (!tenantId || tenantOptionsById.has(tenantId)) return;
      tenantOptionsById.set(tenantId, {
        id: tenantId,
        slug: tenantId,
        name: tenantId,
        active: true,
        plan: 'starter',
      });
    });

    return Array.from(tenantOptionsById.values());
  }, [saasRuntime?.tenants, saasSession?.user?.memberships]);

  const canSwitchTenant = saasAuthEnabled && isSaasAuthenticated && availableTenantOptions.length > 1;
  const saasUserRole = String(saasSession?.user?.role || '').trim().toLowerCase();
  const canManageSaas = !saasAuthEnabled || Boolean(
    saasSession?.user?.canManageSaas ||
    saasSession?.user?.isSuperAdmin ||
    saasUserRole === 'owner' ||
    saasUserRole === 'admin' ||
    saasUserRole === 'superadmin'
  );

  return {
    availableTenantOptions,
    canSwitchTenant,
    saasUserRole,
    canManageSaas,
  };
}
