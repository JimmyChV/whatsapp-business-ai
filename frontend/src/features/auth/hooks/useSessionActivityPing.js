import { useEffect, useRef } from 'react';
import { clearAll as clearChatLocalCache } from '../../chat/core/services/chatLocalCache.service';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart'];
const ACTIVITY_DEBOUNCE_MS = 5 * 60 * 1000;

export default function useSessionActivityPing({
  apiUrl = '',
  authEnabled = false,
  saasSessionRef,
  buildApiHeaders,
  setSaasSession,
  setSaasAuthError
} = {}) {
  const lastPingAtRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!authEnabled) return undefined;
    if (!saasSessionRef?.current?.accessToken) return undefined;
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;

    const ping = async () => {
      const now = Date.now();
      if (inFlightRef.current) return;
      if (lastPingAtRef.current && now - lastPingAtRef.current < ACTIVITY_DEBOUNCE_MS) return;
      lastPingAtRef.current = now;
      inFlightRef.current = true;

      try {
        const response = await fetch(`${apiUrl}/api/auth/session/activity`, {
          method: 'PATCH',
          credentials: 'include',
          headers: buildApiHeaders({ includeJson: true }),
          body: JSON.stringify({
            deviceId: String(saasSessionRef?.current?.deviceId || '').trim() || undefined
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.status === 401 && String(payload?.error || '').trim() === 'device_revoked') {
          await clearChatLocalCache();
          setSaasSession(null);
          setSaasAuthError('Este dispositivo fue revocado. Comunicate con un administrador para solicitar nueva autorizacion.');
        }
      } catch (_) {
        // Activity pings should never interrupt normal app usage.
      } finally {
        inFlightRef.current = false;
      }
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, ping, { passive: true });
    });

    return () => {
      cancelled = true;
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, ping);
      });
    };
  }, [
    apiUrl,
    authEnabled,
    buildApiHeaders,
    saasSessionRef,
    setSaasAuthError,
    setSaasSession
  ]);
}
