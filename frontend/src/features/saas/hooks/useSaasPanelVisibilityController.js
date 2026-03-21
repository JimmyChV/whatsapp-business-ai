import { useEffect } from 'react';

export function useSaasPanelVisibilityController({
  canManageSaasRef,
  canManageSaas,
  showSaasAdminPanel,
  setShowSaasAdminPanel,
  saasRuntimeLoaded,
  saasRuntimeTenantId,
  saasAuthEnabled,
  isSaasAuthenticated,
  forceOperationLaunch,
  selectedTransport,
  setSelectedTransport,
  saasSessionUserTenantId,
  saasSessionUserId,
  saasSessionUserEmail,
  saasAdminAutoOpenRef,
  requestedWaTenantFromUrlRef,
  tenantScopeId,
  availableTenantOptions,
  handleSwitchTenant,
  launchTenantAppliedRef,
}) {
  useEffect(() => {
    canManageSaasRef.current = canManageSaas;
  }, [canManageSaas, canManageSaasRef]);

  useEffect(() => {
    if (canManageSaas) return;
    if (showSaasAdminPanel) setShowSaasAdminPanel(false);
  }, [canManageSaas, showSaasAdminPanel, setShowSaasAdminPanel]);

  useEffect(() => {
    if (!saasRuntimeLoaded) return;
    if (!saasAuthEnabled || !isSaasAuthenticated) return;
    if (!canManageSaas) return;
    if (forceOperationLaunch) return;
    if (selectedTransport) return;

    const tenantKey = String(saasSessionUserTenantId || saasRuntimeTenantId || 'default').trim() || 'default';
    const userKey = String(saasSessionUserId || saasSessionUserEmail || '').trim() || 'manager';
    const sessionKey = `${tenantKey}:${userKey}`;
    if (saasAdminAutoOpenRef.current === sessionKey) return;

    saasAdminAutoOpenRef.current = sessionKey;
    setShowSaasAdminPanel(true);
  }, [
    saasRuntimeLoaded,
    saasRuntimeTenantId,
    saasAuthEnabled,
    isSaasAuthenticated,
    canManageSaas,
    forceOperationLaunch,
    selectedTransport,
    saasSessionUserTenantId,
    saasSessionUserId,
    saasSessionUserEmail,
    saasAdminAutoOpenRef,
    setShowSaasAdminPanel,
  ]);

  useEffect(() => {
    if (isSaasAuthenticated) return;
    saasAdminAutoOpenRef.current = '';
  }, [isSaasAuthenticated, saasAdminAutoOpenRef]);

  useEffect(() => {
    if (!forceOperationLaunch) return;
    if (!isSaasAuthenticated) return;

    const requestedTenantId = String(requestedWaTenantFromUrlRef.current || '').trim();
    if (!requestedTenantId) return;
    if (requestedTenantId === tenantScopeId) {
      requestedWaTenantFromUrlRef.current = '';
      return;
    }

    const isAllowedTenant = availableTenantOptions.some((entry) => String(entry?.id || '').trim() === requestedTenantId);
    if (!isAllowedTenant) {
      requestedWaTenantFromUrlRef.current = '';
      return;
    }

    const marker = `${requestedTenantId}:${String(saasSessionUserId || saasSessionUserEmail || '')}`;
    if (launchTenantAppliedRef.current === marker) return;
    launchTenantAppliedRef.current = marker;

    Promise.resolve(handleSwitchTenant(requestedTenantId))
      .catch(() => { })
      .finally(() => {
        requestedWaTenantFromUrlRef.current = '';
      });
  }, [
    forceOperationLaunch,
    isSaasAuthenticated,
    tenantScopeId,
    availableTenantOptions,
    handleSwitchTenant,
    saasSessionUserId,
    saasSessionUserEmail,
    requestedWaTenantFromUrlRef,
    launchTenantAppliedRef,
  ]);

  useEffect(() => {
    if (selectedTransport) return;
    if (!saasRuntimeLoaded) return;
    if (forceOperationLaunch || !canManageSaas) {
      setShowSaasAdminPanel(false);
      setSelectedTransport('cloud');
    }
  }, [
    selectedTransport,
    saasRuntimeLoaded,
    forceOperationLaunch,
    canManageSaas,
    setShowSaasAdminPanel,
    setSelectedTransport,
  ]);
}
