import { useCallback } from 'react';
import {
  fetchSaasMe,
  loginSaas,
  logoutSaas,
  switchSaasTenant
} from '../services/saasAuthApi';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';

export function useSaasSessionActions({
  recoveryStep,
  loginEmail,
  loginPassword,
  buildApiHeaders,
  normalizeSaasSessionPayload,
  setSaasAuthBusy,
  setSaasAuthError,
  setSaasAuthNotice,
  setTenantSwitchError,
  setRecoveryError,
  setSaasSession,
  setForceOperationLaunchBypass,
  setSelectedTransport,
  setShowSaasAdminPanel,
  setLoginPassword,
  setLoginEmail,
  resetRecoveryFlow,
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
}) {
  const { confirm } = useUiFeedback();
  const handleSaasLogin = useCallback(async (event) => {
    event?.preventDefault();
    if (recoveryStep !== 'idle') return;
    const email = String(loginEmail || '').trim().toLowerCase();
    const password = String(loginPassword || '');

    if (!email || !password) {
      setSaasAuthError('Ingresa correo y contrasena para continuar.');
      return;
    }

    setSaasAuthBusy(true);
    setSaasAuthError('');
    setSaasAuthNotice('');
    setTenantSwitchError('');
    setRecoveryError('');

    try {
      const payload = await loginSaas({
        email,
        password,
        headers: buildApiHeaders({ includeJson: true })
      });
      const session = normalizeSaasSessionPayload(payload, null);
      if (!session) throw new Error('Respuesta de autenticacion invalida.');
      if (payload?.user && typeof payload.user === 'object') {
        session.user = payload.user;
      }

      try {
        const mePayload = await fetchSaasMe({
          headers: buildApiHeaders({
            tokenOverride: String(session?.accessToken || ''),
            tenantIdOverride: String(session?.user?.tenantId || '')
          })
        });
        if (mePayload?.user && typeof mePayload.user === 'object') {
          session.user = { ...(session.user || {}), ...mePayload.user };
        }
      } catch (_) {
        // best effort: seguimos con lo recibido en login
      }

      const loginRole = String(session?.user?.role || '').trim().toLowerCase();
      const loginCanManageSaas = Boolean(
        session?.user?.canManageSaas
        || session?.user?.isSuperAdmin
        || loginRole === 'owner'
        || loginRole === 'admin'
        || loginRole === 'superadmin'
      );
      setSaasSession(session);
      setForceOperationLaunchBypass(loginCanManageSaas);
      if (loginCanManageSaas) {
        try {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('wa_launch');
          cleanUrl.searchParams.delete('wa_module');
          cleanUrl.searchParams.delete('wa_tenant');
          window.history.replaceState({}, '', cleanUrl.toString());
        } catch (_) {
          // no-op
        }
        setSelectedTransport('');
        setShowSaasAdminPanel(true);
      } else {
        setShowSaasAdminPanel(false);
        setSelectedTransport('cloud');
      }
      setLoginPassword('');
      setLoginEmail(String(session?.user?.email || payload?.user?.email || email));
      resetRecoveryFlow();
    } catch (error) {
      setSaasAuthError(String(error?.message || 'No se pudo iniciar sesion.'));
    } finally {
      setSaasAuthBusy(false);
    }
  }, [
    buildApiHeaders,
    loginEmail,
    loginPassword,
    normalizeSaasSessionPayload,
    recoveryStep,
    resetRecoveryFlow,
    setForceOperationLaunchBypass,
    setLoginEmail,
    setLoginPassword,
    setRecoveryError,
    setSaasAuthBusy,
    setSaasAuthError,
    setSaasAuthNotice,
    setSaasSession,
    setSelectedTransport,
    setShowSaasAdminPanel,
    setTenantSwitchError
  ]);

  const handleSaasLogout = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Cerrar sesión',
      message: '¿Cerrar sesión de tu cuenta SaaS?',
      confirmText: 'Cerrar sesión',
      cancelText: 'Cancelar',
      tone: 'danger'
    });
    if (!confirmed) return;
    const current = saasSessionRef.current;
    try {
      if (current?.accessToken || current?.refreshToken) {
        await logoutSaas({
          accessToken: String(current?.accessToken || ''),
          refreshToken: String(current?.refreshToken || ''),
          headers: buildApiHeaders({
            includeJson: true,
            tokenOverride: String(current?.accessToken || '')
          })
        });
      }
    } catch (_error) {
      // best effort
    }
    setSaasSession(null);
    setSelectedTransport('');
    setShowSaasAdminPanel(false);
    setForceOperationLaunchBypass(false);
    setSaasAuthError('');
    setTenantSwitchError('');
    setTenantSwitchBusy(false);
    setWaModules([]);
    setSelectedWaModule(null);
    setSelectedCatalogModuleId('');
    if (socket.connected) socket.disconnect();
    setIsConnected(false);
    resetWorkspaceState();
  }, [
    buildApiHeaders,
    confirm,
    resetWorkspaceState,
    saasSessionRef,
    setForceOperationLaunchBypass,
    setIsConnected,
    setSaasAuthError,
    setSaasSession,
    setSelectedCatalogModuleId,
    setSelectedTransport,
    setSelectedWaModule,
    setShowSaasAdminPanel,
    setTenantSwitchBusy,
    setTenantSwitchError,
    setWaModules,
    socket
  ]);

  const handleSwitchTenant = useCallback(async (nextTenantId = '') => {
    if (!saasRuntimeRef.current?.authEnabled) return;
    const current = saasSessionRef.current;
    if (!current?.accessToken || !current?.refreshToken) return;

    const targetTenantId = String(nextTenantId || '').trim();
    const currentTenantId = String(current?.user?.tenantId || saasRuntimeRef.current?.tenant?.id || '').trim();
    if (!targetTenantId || targetTenantId === currentTenantId) return;

    setTenantSwitchError('');
    setTenantSwitchBusy(true);

    try {
      const payload = await switchSaasTenant({
        targetTenantId,
        refreshToken: String(current?.refreshToken || ''),
        headers: buildApiHeaders({
          includeJson: true,
          tokenOverride: String(current?.accessToken || ''),
          tenantIdOverride: currentTenantId
        })
      });
      const nextSession = normalizeSaasSessionPayload(payload, current);
      if (!nextSession) throw new Error('Sesion invalida al cambiar de empresa.');
      if (payload?.user && typeof payload.user === 'object') nextSession.user = payload.user;

      const targetTenant = (Array.isArray(saasRuntimeRef.current?.tenants) ? saasRuntimeRef.current.tenants : [])
        .find((item) => String(item?.id || '').trim() === targetTenantId) || null;

      setSaasSession(nextSession);
      setSaasRuntime((prev) => ({
        ...prev,
        tenant: targetTenant || { id: targetTenantId, slug: targetTenantId, name: targetTenantId, active: true, plan: prev?.tenant?.plan || 'starter' },
        authContext: {
          ...(prev?.authContext || {}),
          enabled: true,
          isAuthenticated: true,
          user: nextSession.user || prev?.authContext?.user || null
        }
      }));

      setWaModules([]);
      setSelectedWaModule(null);
      setWaModuleError('');
      if (socket.connected) socket.disconnect();
      setIsConnected(false);
      resetWorkspaceState();
    } catch (error) {
      setTenantSwitchError(String(error?.message || 'No se pudo cambiar de empresa.'));
    } finally {
      setTenantSwitchBusy(false);
    }
  }, [
    buildApiHeaders,
    normalizeSaasSessionPayload,
    resetWorkspaceState,
    saasRuntimeRef,
    saasSessionRef,
    setIsConnected,
    setSaasRuntime,
    setSaasSession,
    setSelectedWaModule,
    setTenantSwitchBusy,
    setTenantSwitchError,
    setWaModuleError,
    setWaModules,
    socket
  ]);

  return {
    handleSaasLogin,
    handleSaasLogout,
    handleSwitchTenant
  };
}
