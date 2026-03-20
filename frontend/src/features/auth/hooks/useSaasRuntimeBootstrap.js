import { useEffect } from 'react';

export default function useSaasRuntimeBootstrap({
  apiUrl,
  buildApiHeaders,
  refreshSaasSession,
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
}) {
  useEffect(() => {
    let cancelled = false;

    const fetchRuntime = async (tokenOverride = '') => {
      try {
        const response = await fetch(`${apiUrl}/api/saas/runtime`, {
          headers: buildApiHeaders({ tokenOverride })
        });
        const payload = await response.json().catch(() => ({}));
        return {
          ok: response.ok,
          payload: payload && typeof payload === 'object' ? payload : {},
          error: String(payload?.error || '')
        };
      } catch (error) {
        return {
          ok: false,
          payload: {},
          error: String(error?.message || 'No se pudo cargar runtime SaaS.')
        };
      }
    };

    (async () => {
      setSaasAuthBusy(true);
      setSaasAuthError('');

      const existing = saasSessionRef.current;
      let nextSession = existing;

      let runtimeResult = await fetchRuntime(String(existing?.accessToken || ''));
      let runtimePayload = runtimeResult.payload || {};
      const authEnabled = Boolean(runtimePayload?.authEnabled);
      const runtimeAuthed = Boolean(runtimePayload?.authContext?.isAuthenticated && runtimePayload?.authContext?.user);

      if (authEnabled) {
        if (runtimeAuthed && existing?.accessToken) {
          nextSession = { ...existing, user: runtimePayload.authContext.user };
        } else if (existing?.refreshToken) {
          try {
            const refreshed = await refreshSaasSession(existing.refreshToken);
            nextSession = refreshed;
            runtimeResult = await fetchRuntime(String(refreshed?.accessToken || ''));
            runtimePayload = runtimeResult.payload || runtimePayload;
            if (runtimePayload?.authContext?.isAuthenticated && runtimePayload?.authContext?.user) {
              nextSession = { ...refreshed, user: runtimePayload.authContext.user };
            }
          } catch (_error) {
            nextSession = null;
          }
        } else {
          nextSession = null;
        }
      }

      if (cancelled) return;

      const runtimeTenant = runtimePayload?.tenant || null;
      const runtimeUser = runtimePayload?.authContext?.user || nextSession?.user || null;
      const runtimeModules = normalizeWaModules(runtimePayload?.waModules || []);
      const runtimeSelectedModule = resolveSelectedWaModule(runtimeModules, runtimePayload?.selectedWaModule || null);

      setSaasSession(nextSession);
      setWaModules(runtimeModules);
      setSelectedWaModule(runtimeSelectedModule);
      setWaModuleError('');
      setSaasRuntime({
        loaded: true,
        authEnabled,
        tenant: runtimeTenant,
        tenants: Array.isArray(runtimePayload?.tenants) ? runtimePayload.tenants : [],
        authContext: {
          enabled: authEnabled,
          isAuthenticated: Boolean(runtimePayload?.authContext?.isAuthenticated),
          user: runtimeUser
        }
      });
      const suggestedEmail = String(runtimeUser?.email || '').trim();
      if (suggestedEmail) setLoginEmail((prev) => prev || suggestedEmail);

      if (!runtimeResult.ok) {
        setSaasAuthError(runtimeResult.error || 'No se pudo cargar runtime SaaS.');
      }
      setSaasAuthBusy(false);
    })().catch((error) => {
      if (cancelled) return;
      setSaasRuntime((prev) => ({ ...prev, loaded: true }));
      setWaModules([]);
      setSelectedWaModule(null);
      setSaasAuthBusy(false);
      setSaasAuthError(String(error?.message || 'No se pudo inicializar SaaS.'));
    });

    return () => {
      cancelled = true;
    };
  }, [
    apiUrl,
    buildApiHeaders,
    normalizeWaModules,
    refreshSaasSession,
    resolveSelectedWaModule,
    saasSessionRef,
    setLoginEmail,
    setSaasAuthBusy,
    setSaasAuthError,
    setSaasRuntime,
    setSaasSession,
    setSelectedWaModule,
    setWaModuleError,
    setWaModules
  ]);
}
