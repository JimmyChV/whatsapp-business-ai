import { useEffect } from 'react';

export function useSocketConnectionAuthEffect({
  socket,
  saasRuntime,
  saasSession,
  selectedWaModuleRef,
  selectedWaModuleId,
  socketAuthToken,
  setIsConnected,
  setIsClientReady
}) {
  useEffect(() => {
    if (!saasRuntime?.loaded) return;

    const authRequired = Boolean(saasRuntime?.authEnabled);
    const accessToken = String(saasSession?.accessToken || '').trim();
    const tenantId = String(saasSession?.user?.tenantId || saasRuntime?.tenant?.id || '').trim();

    if (authRequired && !accessToken) {
      if (socket.connected) socket.disconnect();
      setIsConnected(false);
      setIsClientReady(false);
      return;
    }

    const auth = {};
    if (socketAuthToken) auth.token = socketAuthToken;
    if (accessToken) auth.accessToken = accessToken;
    if (tenantId) auth.tenantId = tenantId;
    const selectedModuleId = String(selectedWaModuleRef.current?.moduleId || '').trim();
    if (selectedModuleId) auth.waModuleId = selectedModuleId;
    socket.auth = Object.keys(auth).length > 0 ? auth : undefined;

    if (!socket.connected) socket.connect();
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
}
