import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const UiFeedbackContext = createContext(null);

const DEFAULT_TOAST_TTL = 4500;

const toSafeText = (value = '') => String(value || '').trim();

const buildId = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeToastInput = (input = {}) => {
  if (typeof input === 'string') {
    return {
      type: 'info',
      title: '',
      body: toSafeText(input),
      ttl: DEFAULT_TOAST_TTL
    };
  }

  const source = input && typeof input === 'object' ? input : {};
  return {
    type: toSafeText(source.type || 'info') || 'info',
    title: toSafeText(source.title || ''),
    body: toSafeText(source.body || source.message || ''),
    ttl: Number.isFinite(Number(source.ttl)) ? Math.max(0, Number(source.ttl)) : DEFAULT_TOAST_TTL
  };
};

const normalizeConfirmInput = (input = {}) => {
  if (typeof input === 'string') {
    return {
      title: 'Confirmar accion',
      message: toSafeText(input),
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      tone: 'default'
    };
  }

  const source = input && typeof input === 'object' ? input : {};
  return {
    title: toSafeText(source.title || 'Confirmar accion') || 'Confirmar accion',
    message: toSafeText(source.message || source.body || ''),
    confirmText: toSafeText(source.confirmText || 'Confirmar') || 'Confirmar',
    cancelText: toSafeText(source.cancelText || 'Cancelar') || 'Cancelar',
    tone: toSafeText(source.tone || 'default') || 'default'
  };
};

export default function UiFeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef(new Map());

  const confirmQueueRef = useRef([]);
  const activeConfirmRef = useRef(null);
  const [activeConfirm, setActiveConfirm] = useState(null);

  const dismissToast = useCallback((toastId) => {
    const safeId = String(toastId || '').trim();
    if (!safeId) return;

    const timerId = toastTimersRef.current.get(safeId);
    if (timerId) {
      clearTimeout(timerId);
      toastTimersRef.current.delete(safeId);
    }

    setToasts((prev) => prev.filter((toast) => String(toast?.id || '') !== safeId));
  }, []);

  const notify = useCallback((input = {}) => {
    const normalized = normalizeToastInput(input);
    if (!normalized.body) return null;

    const id = buildId('toast');
    const toast = {
      id,
      type: normalized.type,
      title: normalized.title,
      body: normalized.body,
      ttl: normalized.ttl
    };

    setToasts((prev) => [...prev, toast].slice(-6));

    if (toast.ttl > 0) {
      const timer = setTimeout(() => {
        dismissToast(id);
      }, toast.ttl);
      toastTimersRef.current.set(id, timer);
    }

    return id;
  }, [dismissToast]);

  const openNextConfirm = useCallback(() => {
    if (activeConfirmRef.current) return;
    const next = confirmQueueRef.current.shift();
    if (!next) return;

    activeConfirmRef.current = next;
    setActiveConfirm(next.payload);
  }, []);

  const resolveConfirm = useCallback((result) => {
    const current = activeConfirmRef.current;
    if (!current) return;

    activeConfirmRef.current = null;
    setActiveConfirm(null);

    try {
      current.resolve(Boolean(result));
    } catch (_) {
      // ignore resolver errors
    }

    openNextConfirm();
  }, [openNextConfirm]);

  const confirm = useCallback((input = {}) => {
    const payload = {
      id: buildId('confirm'),
      ...normalizeConfirmInput(input)
    };

    return new Promise((resolve) => {
      confirmQueueRef.current.push({ payload, resolve });
      openNextConfirm();
    });
  }, [openNextConfirm]);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      toastTimersRef.current.clear();

      if (activeConfirmRef.current?.resolve) {
        try {
          activeConfirmRef.current.resolve(false);
        } catch (_) {
          // ignore resolver errors
        }
      }

      confirmQueueRef.current.forEach((queued) => {
        try {
          queued.resolve(false);
        } catch (_) {
          // ignore resolver errors
        }
      });
      confirmQueueRef.current = [];
      activeConfirmRef.current = null;
    };
  }, []);

  const value = useMemo(() => ({
    toasts,
    notify,
    dismissToast,
    confirm,
    activeConfirm,
    resolveConfirm
  }), [toasts, notify, dismissToast, confirm, activeConfirm, resolveConfirm]);

  return (
    <UiFeedbackContext.Provider value={value}>
      {children}
    </UiFeedbackContext.Provider>
  );
}
