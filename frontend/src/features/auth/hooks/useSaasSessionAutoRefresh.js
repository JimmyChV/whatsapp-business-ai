import { useEffect } from 'react';

export default function useSaasSessionAutoRefresh({
  authEnabled = false,
  refreshToken = '',
  accessExpiresAtUnix = 0,
  saasSessionRef,
  refreshSaasSession,
  setSaasSession,
  setSaasAuthError
}) {
  useEffect(() => {
    if (!authEnabled) return;
    if (!refreshToken) return;
    if (!Number.isFinite(Number(accessExpiresAtUnix)) || Number(accessExpiresAtUnix) <= 0) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      const expiresAt = Number(saasSessionRef.current?.accessExpiresAtUnix || 0);
      const now = Math.floor(Date.now() / 1000);
      if (!expiresAt || (expiresAt - now) > 120) return;

      try {
        await refreshSaasSession();
      } catch (_error) {
        if (cancelled) return;
        setSaasSession(null);
        setSaasAuthError('Sesion expirada. Inicia sesion nuevamente.');
      }
    };

    const interval = setInterval(tick, 30000);
    tick();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    accessExpiresAtUnix,
    authEnabled,
    refreshSaasSession,
    refreshToken,
    saasSessionRef,
    setSaasAuthError,
    setSaasSession
  ]);
}
