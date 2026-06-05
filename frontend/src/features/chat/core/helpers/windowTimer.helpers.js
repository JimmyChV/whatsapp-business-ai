const MINUTE_MS = 60 * 1000;

const toSafeDate = (value = '') => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
};

const normalizeMinutes = (value = null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};

const formatLaborMinutes = (minutes = 0) => {
  const safeMinutes = Math.max(1, Math.floor(Number(minutes || 0)));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (remainder <= 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
};

const resolveCurrentLaboralMinutes = (source = {}, nowMs = Date.now()) => {
  const baseMinutes = normalizeMinutes(source?.laboralMinutesRemaining);
  if (baseMinutes === null) return null;

  const measuredAt = toSafeDate(source?.laboralWindowMeasuredAt);
  if (!measuredAt) return baseMinutes;

  const elapsedMinutes = Math.max(0, Math.floor((Number(nowMs || Date.now()) - measuredAt.getTime()) / MINUTE_MS));
  return Math.max(0, baseMinutes - elapsedMinutes);
};

export function getWindowState(source = {}, nowMs = Date.now()) {
  const expiresAt = toSafeDate(source?.windowExpiresAt);
  const hasWindowOpen = typeof source?.windowOpen === 'boolean';
  const isExpired = Boolean(expiresAt) && (
    hasWindowOpen
      ? source.windowOpen === false
      : expiresAt.getTime() <= Number(nowMs || Date.now())
  );
  if (isExpired) {
    return {
      status: 'expired',
      laborMinutesRemaining: 0,
      active: false,
      expiring: false,
      expired: true,
      label: 'Expirado',
      title: 'Ventana 24h expirada'
    };
  }

  const laborMinutesRemaining = resolveCurrentLaboralMinutes(source, nowMs);
  if (laborMinutesRemaining === null) {
    return { status: 'unknown', laborMinutesRemaining: null, active: false, expiring: false, expired: false, label: '' };
  }
  if (laborMinutesRemaining <= 0) {
    return {
      status: 'outside-hours',
      laborMinutesRemaining: 0,
      active: true,
      expiring: true,
      expired: false,
      outsideHours: true,
      label: '⚠️ Vence fuera de horario',
      title: 'La ventana sigue abierta, pero no quedan minutos laborales disponibles'
    };
  }

  return {
    status: 'active',
    laborMinutesRemaining,
    active: true,
    expiring: laborMinutesRemaining <= 120,
    expired: false,
    label: formatLaborMinutes(laborMinutesRemaining)
  };
}

export function getWindowStatus(source = {}, nowMs = Date.now()) {
  const base = getWindowState(source, nowMs);
  if (base.expired || base.outsideHours) return base;
  if (!base.active) return null;

  if (base.laborMinutesRemaining <= 60) {
    return { ...base, status: 'critical', label: formatLaborMinutes(base.laborMinutesRemaining) };
  }
  if (base.laborMinutesRemaining <= 240) {
    return { ...base, status: 'warning', label: formatLaborMinutes(base.laborMinutesRemaining) };
  }
  return { ...base, status: 'ok', label: formatLaborMinutes(base.laborMinutesRemaining) };
}

export const WINDOW_FILTER_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Con ventana activa' },
  { value: 'expiring', label: 'Por vencer (< 2h)' },
  { value: 'expired', label: 'Vencida' }
];

export const isValidWindowFilter = (value = '') => WINDOW_FILTER_OPTIONS.some((entry) => entry.value === String(value || '').trim().toLowerCase());
