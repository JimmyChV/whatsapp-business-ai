const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const toSafeDate = (value = '') => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
};

const formatMinutes = (remaining = 0) => {
  const totalMinutes = Math.max(1, Math.floor(Number(remaining || 0) / MINUTE_MS));
  return `${totalMinutes}m`;
};

const formatHours = (remaining = 0) => {
  const safeRemaining = Math.max(0, Number(remaining || 0));
  const hours = Math.floor(safeRemaining / HOUR_MS);
  const minutes = Math.max(0, Math.floor((safeRemaining % HOUR_MS) / MINUTE_MS));
  if (hours <= 0) return formatMinutes(safeRemaining);
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

export function getWindowState(lastCustomerMessageAt, nowMs = Date.now()) {
  const date = toSafeDate(lastCustomerMessageAt);
  if (!date) return { status: 'unknown', remaining: null, active: false, expiring: false, expired: false, label: '' };

  const elapsed = Number(nowMs || Date.now()) - date.getTime();
  const remaining = DAY_WINDOW_MS - elapsed;
  if (remaining <= 0) {
    return { status: 'expired', remaining: 0, active: false, expiring: false, expired: true, label: '0m' };
  }

  const expiring = remaining <= 3 * HOUR_MS;
  return {
    status: 'active',
    remaining,
    active: true,
    expiring,
    expired: false,
    label: remaining <= HOUR_MS ? formatMinutes(remaining) : formatHours(remaining)
  };
}

export function getWindowStatus(lastCustomerMessageAt, nowMs = Date.now()) {
  const base = getWindowState(lastCustomerMessageAt, nowMs);
  if (base.status === 'unknown' || base.status === 'expired') return null;

  if (base.remaining <= HOUR_MS) {
    return { ...base, status: 'critical', label: formatMinutes(base.remaining) };
  }
  if (base.remaining <= 3 * HOUR_MS) {
    return { ...base, status: 'warning', label: formatHours(base.remaining) };
  }
  if (base.remaining <= 6 * HOUR_MS) {
    return { ...base, status: 'ok', label: formatHours(base.remaining) };
  }
  return null;
}

export const WINDOW_FILTER_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Con ventana activa' },
  { value: 'expiring', label: 'Por vencer (< 3h)' },
  { value: 'expired', label: 'Vencida' }
];

export const isValidWindowFilter = (value = '') => WINDOW_FILTER_OPTIONS.some((entry) => entry.value === String(value || '').trim().toLowerCase());
