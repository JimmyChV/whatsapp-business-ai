import { useSaasRecoveryFlow } from '../../features/auth/hooks/useSaasRecoveryFlow';
import useSaasRuntimeBootstrap from '../../features/auth/hooks/useSaasRuntimeBootstrap';
import useSaasSessionAutoRefresh from '../../features/auth/hooks/useSaasSessionAutoRefresh';
import { useSaasSessionActions } from '../../features/auth/hooks/useSaasSessionActions';
import useSaasApiSessionHelpers from '../../features/auth/hooks/useSaasApiSessionHelpers';
import { useSaasPanelVisibilityController } from '../../features/saas/hooks';
import { useSaasTenantScopeContext } from '../../features/saas/hooks/domains/tenants/useSaasTenantScopeContext';

export default function useAppRuntimeSessionController({
  sessionStateBlock = {},
  workspaceSessionRefsBlock = {},
  socketLifecycleBlock = {},
  normalizersBlock = {}
} = {}) {
  const {
    isConnected,
    setIsConnected,
    setQrCode,
    setIsClientReady,
    selectedTransport,
    setSelectedTransport,
    waRuntime,
    setWaRuntime,
    setTransportError,
    setIsSwitchingTransport,
    saasRuntime,
    setSaasRuntime,
    saasSession,
    setSaasSession,
    setSaasAuthBusy,
    setSaasAuthError,
    setTenantSwitchBusy,
    setTenantSwitchError,
    showSaasAdminPanel,
    setShowSaasAdminPanel,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    setSaasAuthNotice,
    setForceOperationLaunchBypass,
    forceOperationLaunch,
    requestedWaTenantFromUrl,
    tenantScopeId
  } = sessionStateBlock;

  const {
    setWaModules,
    setSelectedWaModule,
    setSelectedCatalogModuleId,
    setWaModuleError,
    setAiSuggestion,
    setIsAiLoading,
    saasSessionRef,
    saasRuntimeRef,
    canManageSaasRef,
    requestedWaTenantFromUrlRef,
    launchTenantAppliedRef,
    saasAdminAutoOpenRef,
    tenantScopeRef
  } = workspaceSessionRefsBlock;

  const {
    socket,
    resetWorkspaceState
  } = socketLifecycleBlock;

  const {
    apiUrl,
    normalizeWaModules,
    resolveSelectedWaModule
  } = normalizersBlock;

  const apiSessionExports = useSaasApiSessionHelpers({
    apiUrl,
    saasSessionRef,
    saasRuntimeRef,
    setSaasSession
  });

  const recoveryExports = useSaasRecoveryFlow({
    loginEmail,
    setLoginEmail,
    setLoginPassword,
    setSaasAuthNotice,
    buildApiHeaders: apiSessionExports.buildApiHeaders
  });

  useSaasRuntimeBootstrap({
    apiUrl,
    buildApiHeaders: apiSessionExports.buildApiHeaders,
    refreshSaasSession: apiSessionExports.refreshSaasSession,
    saasSessionRef,
    normalizeWaModules,
    resolveSelectedWaModule,
    setSaasSession,
    setWaModules,
    setSelectedWaModule,
    setWaModuleError,
    setSaasRuntime,
    setLoginEmail,
    setSaasAuthBusy,
    setSaasAuthError
  });

  useSaasSessionAutoRefresh({
    authEnabled: Boolean(saasRuntime?.authEnabled),
    refreshToken: String(saasSession?.refreshToken || ''),
    accessExpiresAtUnix: Number(saasSession?.accessExpiresAtUnix || 0),
    saasSessionRef,
    refreshSaasSession: apiSessionExports.refreshSaasSession,
    setSaasSession,
    setSaasAuthError
  });

  const sessionActions = useSaasSessionActions({
    recoveryStep: recoveryExports.recoveryStep,
    loginEmail,
    loginPassword,
    buildApiHeaders: apiSessionExports.buildApiHeaders,
    normalizeSaasSessionPayload: apiSessionExports.normalizeSaasSessionPayload,
    setSaasAuthBusy,
    setSaasAuthError,
    setSaasAuthNotice,
    setTenantSwitchError,
    setRecoveryError: recoveryExports.setRecoveryError,
    setSaasSession,
    setForceOperationLaunchBypass,
    setSelectedTransport,
    setShowSaasAdminPanel,
    setLoginPassword,
    setLoginEmail,
    resetRecoveryFlow: recoveryExports.resetRecoveryFlow,
    saasSessionRef,
    saasRuntimeRef,
    setTenantSwitchBusy,
    setWaModules,
    setSelectedWaModule,
    setSelectedCatalogModuleId,
    socket,
    setIsConnected,
    resetWorkspaceState,
    setWaModuleError,
    setSaasRuntime
  });

  const saasAuthEnabled = Boolean(saasRuntime?.authEnabled);
  const isSaasAuthenticated = !saasAuthEnabled || Boolean(saasSession?.accessToken);
  const tenantScopeExports = useSaasTenantScopeContext({
    saasRuntime,
    saasSession,
    saasAuthEnabled,
    isSaasAuthenticated
  });

  useSaasPanelVisibilityController({
    canManageSaasRef,
    canManageSaas: tenantScopeExports.canManageSaas,
    showSaasAdminPanel,
    setShowSaasAdminPanel,
    saasRuntimeLoaded: saasRuntime?.loaded,
    saasRuntimeTenantId: saasRuntime?.tenant?.id,
    saasAuthEnabled,
    isSaasAuthenticated,
    forceOperationLaunch,
    selectedTransport,
    setSelectedTransport,
    saasSessionUserTenantId: saasSession?.user?.tenantId,
    saasSessionUserId: saasSession?.user?.id || saasSession?.user?.userId,
    saasSessionUserEmail: saasSession?.user?.email,
    saasAdminAutoOpenRef,
    requestedWaTenantFromUrlRef,
    tenantScopeId,
    availableTenantOptions: tenantScopeExports.availableTenantOptions,
    handleSwitchTenant: sessionActions.handleSwitchTenant,
    launchTenantAppliedRef
  });

  const sessionRuntimeBlock = {
    tenantScopeId,
    tenantScopeRef,
    isConnected,
    selectedTransport,
    waRuntime,
    setIsConnected,
    setIsClientReady,
    setQrCode,
    setSelectedTransport,
    setTransportError,
    setIsSwitchingTransport,
    setWaRuntime,
    setShowSaasAdminPanel,
    canManageSaas: tenantScopeExports.canManageSaas,
    saasSessionRef,
    saasRuntimeRef,
    setAiSuggestion,
    setIsAiLoading,
    handleSaasLogin: sessionActions.handleSaasLogin,
    handleSaasLogout: sessionActions.handleSaasLogout,
    handleSwitchTenant: sessionActions.handleSwitchTenant
  };

  return {
    apiSessionExports,
    sessionActions,
    tenantScopeExports,
    recoveryExports,
    sessionRuntimeBlock
  };
}
