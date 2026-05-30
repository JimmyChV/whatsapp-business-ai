import { useEffect, useMemo, useState } from 'react';

import { API_URL } from '../../../config/runtime';

const PROMPT_DISMISSED_KEY = 'wa_saas_push_prompt_dismissed';

function detectDeviceType() {
  const ua = String(window.navigator?.userAgent || '');
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function isMobileLike() {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  return standalone || window.innerWidth < 768 || detectDeviceType() === 'mobile';
}

function urlBase64ToUint8Array(base64String = '') {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush({ buildApiHeaders, vapidPublicKey }) {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const response = await fetch(`${API_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(typeof buildApiHeaders === 'function' ? buildApiHeaders() : {}),
    },
    credentials: 'include',
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceType: detectDeviceType(),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'No se pudo activar notificaciones.');
  }
  return subscription;
}

function PushNotificationPrompt({ isAuthenticated, buildApiHeaders }) {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const vapidPublicKey = useMemo(() => String(import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim(), []);

  useEffect(() => {
    if (!isAuthenticated || !vapidPublicKey) return;
    if (!isMobileLike()) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'default') return;
    if (window.localStorage.getItem(PROMPT_DISMISSED_KEY) === '1') return;
    setVisible(true);
  }, [isAuthenticated, vapidPublicKey]);

  const handleDismiss = () => {
    window.localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
    setVisible(false);
  };

  const handleActivate = async () => {
    try {
      setStatus('busy');
      setMessage('');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        setMessage('Puedes activarlas luego desde la configuracion del navegador.');
        window.localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
        return;
      }
      await subscribeToPush({ buildApiHeaders, vapidPublicKey });
      setStatus('success');
      setMessage('Notificaciones activadas.');
      window.localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
      window.setTimeout(() => setVisible(false), 1200);
    } catch (error) {
      setStatus('error');
      setMessage(String(error?.message || 'No se pudo activar notificaciones.'));
    }
  };

  if (!visible) return null;

  return (
    <div className="push-prompt" role="dialog" aria-live="polite" aria-label="Activar notificaciones">
      <div className="push-prompt__icon">!</div>
      <div className="push-prompt__content">
        <h3>Activa las notificaciones</h3>
        <p>Recibe alertas de mensajes nuevos aunque la app este en segundo plano, como WhatsApp.</p>
        {message ? <p className={`push-prompt__message push-prompt__message--${status}`}>{message}</p> : null}
        <div className="push-prompt__actions">
          <button type="button" className="push-prompt__primary" onClick={handleActivate} disabled={status === 'busy'}>
            {status === 'busy' ? 'Activando...' : 'Activar notificaciones'}
          </button>
          <button type="button" className="push-prompt__secondary" onClick={handleDismiss}>
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}

export default PushNotificationPrompt;
