import { useCallback, useEffect, useState } from 'react';
import {
  fetchSaasMe,
  loginSaas,
  logoutSaas,
  resendSaasDeviceOtp,
  switchSaasTenant,
  verifySaasDeviceOtp
} from '../services/saasAuthApi';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { clearAll as clearChatLocalCache } from '../../chat/core/services/chatLocalCache.service';

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
  const [deviceAuthStep, setDeviceAuthStep] = useState('credentials');
  const [pendingDeviceAuth, setPendingDeviceAuth] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [otpResendAvailableAt, setOtpResendAvailableAt] = useState(0);
  const [loginLockedUntil, setLoginLockedUntil] = useState(0);
  const [, setLoginLockTick] = useState(0);
  const loginRetryRemainingSec = Math.max(0, Math.ceil((Number(loginLockedUntil || 0) - Date.now()) / 1000));

  useEffect(() => {
    if (!loginLockedUntil || loginRetryRemainingSec <= 0) return undefined;
    const timer = window.setInterval(() => setLoginLockTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loginLockedUntil, loginRetryRemainingSec]);

  const finalizeAuthenticatedSession = useCallback(async (payload = {}, fallbackEmail = '') => {
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
    setLoginEmail(String(session?.user?.email || payload?.user?.email || fallbackEmail || ''));
    setDeviceAuthStep('credentials');
    setPendingDeviceAuth(null);
    setOtpCode('');
    setDeviceName('');
    resetRecoveryFlow();
    return session;
  }, [
    buildApiHeaders,
    normalizeSaasSessionPayload,
    resetRecoveryFlow,
    setForceOperationLaunchBypass,
    setLoginEmail,
    setLoginPassword,
    setSaasSession,
    setSelectedTransport,
    setShowSaasAdminPanel
  ]);

  const handleSaasLogin = useCallback(async (event) => {
    event?.preventDefault();
    if (recoveryStep !== 'idle') return;
    const email = String(loginEmail || '').trim().toLowerCase();
    const password = String(loginPassword || '');

    if (loginRetryRemainingSec > 0) {
      setSaasAuthError('Demasiados intentos fallidos. Por seguridad, espera 15 minutos antes de intentar de nuevo.');
      return;
    }

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
      if (payload?.requiresOtp) {
        const expiresInSec = Number(payload?.expiresInSec || 600) || 600;
        const nextPendingDeviceAuth = {
          deviceId: String(payload?.deviceId || '').trim(),
          email: String(payload?.email || email).trim(),
          deviceType: String(payload?.deviceType || '').trim(),
          otpDelivery: String(payload?.otpDelivery || '').trim(),
          debugCode: payload?.debugCode || ''
        };
        setPendingDeviceAuth(nextPendingDeviceAuth);
        setDeviceName((prev) => prev || `Mi ${String(payload?.deviceType || 'dispositivo')}`);
        setOtpCode('');
        setOtpResendAvailableAt(Date.now() + 60000);
        setDeviceAuthStep('otp');
        setSaasAuthNotice(`Enviamos un codigo de 6 digitos a los autorizadores de acceso. Expira en ${Math.ceil(expiresInSec / 60)} minutos.`);
        setLoginPassword('');
        return;
      }
      await finalizeAuthenticatedSession(payload, email);
    } catch (error) {
      if (Number(error?.status || 0) === 429 || String(error?.code || '') === 'too_many_attempts') {
        const retryAfterSec = Number(error?.retryAfter || 900) || 900;
        setLoginLockedUntil(Date.now() + retryAfterSec * 1000);
        setLoginLockTick((value) => value + 1);
        setSaasAuthError('Demasiados intentos fallidos. Por seguridad, espera 15 minutos antes de intentar de nuevo.');
        return;
      }
      setSaasAuthError(String(error?.message || 'No se pudo iniciar sesion.'));
    } finally {
      setSaasAuthBusy(false);
    }
  }, [
    buildApiHeaders,
    finalizeAuthenticatedSession,
    loginEmail,
    loginPassword,
    loginRetryRemainingSec,
    recoveryStep,
    setLoginPassword,
    setRecoveryError,
    setSaasAuthBusy,
    setSaasAuthError,
    setSaasAuthNotice,
    setTenantSwitchError
  ]);

  const handleOtpBack = useCallback(() => {
    setDeviceAuthStep('credentials');
    setPendingDeviceAuth(null);
    setOtpCode('');
    setDeviceName('');
    setSaasAuthError('');
    setSaasAuthNotice('');
  }, [setSaasAuthError, setSaasAuthNotice]);

  const handleOtpContinue = useCallback((event) => {
    event?.preventDefault();
    const cleanCode = String(otpCode || '').replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setSaasAuthError('Ingresa el codigo de 6 digitos.');
      return;
    }
    setOtpCode(cleanCode);
    setSaasAuthError('');
    setDeviceAuthStep('device_name');
  }, [otpCode, setSaasAuthError]);

  const handleVerifyDeviceOtp = useCallback(async (event) => {
    event?.preventDefault();
    const deviceId = String(pendingDeviceAuth?.deviceId || '').trim();
    const cleanCode = String(otpCode || '').replace(/\D/g, '');
    const safeName = String(deviceName || '').trim() || `Mi ${String(pendingDeviceAuth?.deviceType || 'dispositivo')}`;
    if (!deviceId || cleanCode.length !== 6) {
      setSaasAuthError('Codigo o dispositivo invalido.');
      setDeviceAuthStep('otp');
      return;
    }
    setSaasAuthBusy(true);
    setSaasAuthError('');
    setSaasAuthNotice('');
    try {
      const payload = await verifySaasDeviceOtp({
        deviceId,
        code: cleanCode,
        deviceName: safeName,
        headers: buildApiHeaders({ includeJson: true })
      });
      await finalizeAuthenticatedSession(payload, pendingDeviceAuth?.email || loginEmail);
    } catch (error) {
      setDeviceAuthStep('otp');
      setSaasAuthError(String(error?.message || 'No se pudo verificar el dispositivo.'));
    } finally {
      setSaasAuthBusy(false);
    }
  }, [
    buildApiHeaders,
    deviceName,
    finalizeAuthenticatedSession,
    loginEmail,
    otpCode,
    pendingDeviceAuth,
    setSaasAuthBusy,
    setSaasAuthError,
    setSaasAuthNotice
  ]);

  const handleResendDeviceOtp = useCallback(async () => {
    const deviceId = String(pendingDeviceAuth?.deviceId || '').trim();
    if (!deviceId || Date.now() < Number(otpResendAvailableAt || 0)) return;
    setSaasAuthBusy(true);
    setSaasAuthError('');
    try {
      const payload = await resendSaasDeviceOtp({
        deviceId,
        headers: buildApiHeaders({ includeJson: true })
      });
      setPendingDeviceAuth((prev) => ({
        ...(prev || {}),
        debugCode: payload?.debugCode || prev?.debugCode || ''
      }));
      setOtpResendAvailableAt(Date.now() + 60000);
      setSaasAuthNotice('Codigo reenviado a los autorizadores de acceso.');
    } catch (error) {
      setSaasAuthError(String(error?.message || 'No se pudo reenviar el codigo.'));
    } finally {
      setSaasAuthBusy(false);
    }
  }, [
    buildApiHeaders,
    otpResendAvailableAt,
    pendingDeviceAuth,
    setSaasAuthBusy,
    setSaasAuthError,
    setSaasAuthNotice
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
      if (current?.accessToken) {
        await logoutSaas({
          accessToken: String(current?.accessToken || ''),
          headers: buildApiHeaders({
            includeJson: true,
            tokenOverride: String(current?.accessToken || '')
          })
        });
      }
    } catch (_error) {
      // best effort
    }
    await clearChatLocalCache();
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
    if (!current?.accessToken) return;

    const targetTenantId = String(nextTenantId || '').trim();
    const currentTenantId = String(current?.user?.tenantId || saasRuntimeRef.current?.tenant?.id || '').trim();
    if (!targetTenantId || targetTenantId === currentTenantId) return;

    setTenantSwitchError('');
    setTenantSwitchBusy(true);

    try {
      const payload = await switchSaasTenant({
        targetTenantId,
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
    handleSwitchTenant,
    deviceAuthStep,
    pendingDeviceAuth,
    loginRetryRemainingSec,
    otpCode,
    setOtpCode,
    deviceName,
    setDeviceName,
    otpResendAvailableAt,
    handleOtpBack,
    handleOtpContinue,
    handleVerifyDeviceOtp,
    handleResendDeviceOtp
  };
}
