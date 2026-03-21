import { SAAS_SESSION_STORAGE_KEY } from '../../../config/runtime';

export const loadStoredSaasSession = () => {
  try {
    const raw = localStorage.getItem(SAAS_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const accessToken = String(parsed.accessToken || '').trim();
    const refreshToken = String(parsed.refreshToken || '').trim();
    if (!accessToken || !refreshToken) return null;
    return {
      accessToken,
      refreshToken,
      tokenType: String(parsed.tokenType || 'Bearer').trim() || 'Bearer',
      accessExpiresAtUnix: Number(parsed.accessExpiresAtUnix || 0) || 0,
      refreshExpiresAtUnix: Number(parsed.refreshExpiresAtUnix || 0) || 0,
      user: parsed.user && typeof parsed.user === 'object' ? parsed.user : null
    };
  } catch (_error) {
    return null;
  }
};

export const persistSaasSession = (session = null) => {
  try {
    if (!session) {
      localStorage.removeItem(SAAS_SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SAAS_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (_error) {
    // ignore storage errors
  }
};
