import { useEffect, useRef } from 'react';

function readAccessExpiryUnix(session = {}) {
  const storedExpiry = Number(session?.accessExpiresAtUnix || 0);
  if (Number.isFinite(storedExpiry) && storedExpiry > 0) return storedExpiry;
  const token = String(session?.accessToken || '').trim();
  const payload = token.split('.')[1] || '';
  if (!payload) return 0;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const parsed = JSON.parse(atob(padded));
    return Number(parsed?.exp || 0) || 0;
  } catch (_) {
    return 0;
  }
}

export function useSocketConnectionAuthEffect({
  socket,
  saasRuntime,
  saasSession,
  saasSessionRef,
  selectedWaModuleRef,
  selectedWaModuleId,
  socketAuthToken,
  refreshSaasSession,
  onSocketAuthFailure,
  setIsConnected,
  setIsClientReady
}) {
  const unauthorizedRefreshRef = useRef(false);

  useEffect(() => {
    const accessToken = String(saasSession?.accessToken || '').trim();
    const tenantId = String(saasSession?.user?.tenantId || saasRuntime?.tenant?.id || '').trim();
    const runtimeLoaded = Boolean(saasRuntime?.loaded);
    const hasEarlyAuthContext = Boolean(accessToken || tenantId || socketAuthToken);
    if (!runtimeLoaded && !hasEarlyAuthContext) return;

    const authRequired = runtimeLoaded ? Boolean(saasRuntime?.authEnabled) : Boolean(accessToken);

    if (authRequired && !accessToken) {
      if (socket.connected) socket.disconnect();
      setIsConnected(false);
      setIsClientReady(false);
      return;
    }

    if (authRequired || accessToken) {
      const expiresAt = readAccessExpiryUnix(saasSession);
      const now = Math.floor(Date.now() / 1000);
      if (!expiresAt || expiresAt - now <= 5) {
        if (socket.connected) socket.disconnect();
        setIsConnected(false);
        setIsClientReady(false);
        return;
      }
    }

    const auth = {};
    if (socketAuthToken) auth.token = socketAuthToken;
    if (accessToken) auth.accessToken = accessToken;
    if (tenantId) auth.tenantId = tenantId;
    const selectedModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim();
    if (selectedModuleId) auth.waModuleId = selectedModuleId;
    socket.auth = Object.keys(auth).length > 0 ? auth : undefined;

    if (!socket.connected && !socket.active) socket.connect();
  }, [
    socket,
    saasRuntime?.loaded,
    saasRuntime?.authEnabled,
    saasRuntime?.tenant?.id,
    saasSession?.accessToken,
    saasSession?.user?.tenantId,
    selectedWaModuleRef,
    selectedWaModuleId,
    socketAuthToken,
    setIsConnected,
    setIsClientReady
  ]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleConnectError = async (error) => {
      const message = String(error?.message || error || '');
      if (!/unauthorized/i.test(message)) return;
      if (!saasRuntime?.authEnabled) return;
      if (unauthorizedRefreshRef.current) return;

      unauthorizedRefreshRef.current = true;
      try {
        if (socket.connected || socket.active) socket.disconnect();
        const refreshed = typeof refreshSaasSession === 'function'
          ? await refreshSaasSession()
          : null;
        const nextSession = refreshed || saasSessionRef?.current || {};
        const accessToken = String(nextSession?.accessToken || '').trim();
        if (!accessToken) throw new Error('missing_access_token');

        const tenantId = String(nextSession?.user?.tenantId || saasRuntime?.tenant?.id || '').trim();
        const selectedModuleId = String(selectedWaModuleRef?.current?.moduleId || '').trim();
        const auth = {};
        if (socketAuthToken) auth.token = socketAuthToken;
        auth.accessToken = accessToken;
        if (tenantId) auth.tenantId = tenantId;
        if (selectedModuleId) auth.waModuleId = selectedModuleId;

        socket.auth = auth;
        socket.connect();
      } catch (refreshError) {
        if (typeof onSocketAuthFailure === 'function') {
          onSocketAuthFailure(refreshError);
        }
      } finally {
        unauthorizedRefreshRef.current = false;
      }
    };

    socket.on('connect_error', handleConnectError);
    return () => {
      socket.off('connect_error', handleConnectError);
    };
  }, [
    onSocketAuthFailure,
    refreshSaasSession,
    saasRuntime?.authEnabled,
    saasRuntime?.tenant?.id,
    saasSessionRef,
    selectedWaModuleRef,
    socket,
    socketAuthToken
  ]);
}
