import { useCallback } from 'react';

export default function useSaasApiSessionHelpers({
  apiUrl,
  saasSessionRef,
  saasRuntimeRef,
  setSaasSession
}) {
  const buildApiHeaders = useCallback((options = {}) => {
    const includeJson = Boolean(options?.includeJson);
    const tokenOverride = String(options?.tokenOverride || '').trim();
    const tenantIdOverride = String(options?.tenantIdOverride || '').trim();

    const session = saasSessionRef.current;
    const runtime = saasRuntimeRef.current;
    const accessToken = tokenOverride || String(session?.accessToken || '').trim();
    const tenantId = tenantIdOverride || String(session?.user?.tenantId || runtime?.tenant?.id || '').trim();

    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
    return headers;
  }, [saasRuntimeRef, saasSessionRef]);

  const resolveSessionSenderIdentity = useCallback(() => {
    const sessionUser = (saasSessionRef.current?.user && typeof saasSessionRef.current.user === 'object')
      ? saasSessionRef.current.user
      : null;
    const runtimeAuthUser = (saasRuntimeRef.current?.authContext?.user && typeof saasRuntimeRef.current.authContext.user === 'object')
      ? saasRuntimeRef.current.authContext.user
      : null;
    const user = sessionUser || runtimeAuthUser;
    const id = String(user?.id || user?.userId || '').trim();
    const email = String(user?.email || '').trim();
    const role = String(user?.role || '').trim().toLowerCase();
    const explicitName = String(user?.name || user?.displayName || user?.fullName || '').trim();
    const name = String(explicitName || email || id || '').trim();
    return {
      id: id || null,
      email: email || null,
      role: role || null,
      name: name || null
    };
  }, [saasRuntimeRef, saasSessionRef]);

  const normalizeSaasSessionPayload = useCallback((payload = {}, previousSession = null) => {
    const accessToken = String(payload?.accessToken || '').trim();
    if (!accessToken) return null;

    const now = Math.floor(Date.now() / 1000);
    const accessExpiresIn = Number(payload?.expiresInSec || 0);
    const accessExpiresAtUnix = accessExpiresIn > 0 ? (now + accessExpiresIn) : (Number(previousSession?.accessExpiresAtUnix || 0) || 0);
    const refreshExpiresAtUnix = Number(payload?.refreshExpiresAtUnix || 0)
      || (Number(payload?.refreshExpiresInSec || 0) > 0 ? (now + Number(payload.refreshExpiresInSec)) : 0)
      || (Number(previousSession?.refreshExpiresAtUnix || 0) || 0);

    return {
      accessToken,
      tokenType: String(payload?.tokenType || previousSession?.tokenType || 'Bearer').trim() || 'Bearer',
      accessExpiresAtUnix,
      refreshExpiresAtUnix,
      deviceType: String(payload?.deviceType || previousSession?.deviceType || '').trim(),
      user: payload?.user && typeof payload.user === 'object'
        ? payload.user
        : (previousSession?.user && typeof previousSession.user === 'object' ? previousSession.user : null)
    };
  }, []);

  const refreshSaasSession = useCallback(async () => {
    const current = saasSessionRef.current;

    const response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: buildApiHeaders({ includeJson: true, tokenOverride: String(current?.accessToken || '').trim() }),
      body: JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      throw new Error(String(payload?.error || 'No se pudo renovar sesion.'));
    }

    const nextSession = normalizeSaasSessionPayload(payload, current);
    if (!nextSession) throw new Error('Sesion renovada invalida.');
    setSaasSession(nextSession);
    return nextSession;
  }, [apiUrl, buildApiHeaders, normalizeSaasSessionPayload, saasSessionRef, setSaasSession]);

  const refreshCurrentUserPermissions = useCallback(async () => {
    const current = saasSessionRef.current;
    const accessToken = String(current?.accessToken || '').trim();
    if (!accessToken) throw new Error('No hay sesion activa para refrescar permisos.');

    const response = await fetch(`${apiUrl}/api/auth/me`, {
      method: 'GET',
      headers: buildApiHeaders({ tokenOverride: accessToken })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false || !payload?.user || typeof payload.user !== 'object') {
      throw new Error(String(payload?.error || 'No se pudieron refrescar los permisos de la sesion.'));
    }

    const nextSession = {
      ...current,
      user: {
        ...(current?.user && typeof current.user === 'object' ? current.user : {}),
        ...payload.user
      }
    };
    setSaasSession(nextSession);
    return nextSession.user;
  }, [apiUrl, buildApiHeaders, saasSessionRef, setSaasSession]);

  return {
    buildApiHeaders,
    resolveSessionSenderIdentity,
    normalizeSaasSessionPayload,
    refreshSaasSession,
    refreshCurrentUserPermissions
  };
}
