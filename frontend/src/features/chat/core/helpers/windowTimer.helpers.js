const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_TIME_ZONE = 'America/Lima';

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

const normalizeWindowStatus = (value = '') => {
  const status = String(value || '').trim().toLowerCase();
  return ['open', 'expires_outside_hours', 'expired'].includes(status) ? status : null;
};

const formatLaborMinutes = (minutes = 0) => {
  const safeMinutes = Math.max(1, Math.floor(Number(minutes || 0)));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (remainder <= 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
};

const getDateKey = (date = new Date()) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: WINDOW_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
};

const formatClockTime = (date = new Date()) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: WINDOW_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (_) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
};

const formatExpiryDate = (date = new Date()) => {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: WINDOW_TIME_ZONE,
      day: '2-digit',
      month: '2-digit'
    }).format(date);
  } catch (_) {
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
  }
};

const formatWindowExpiryLabel = (expiresAt = null, nowMs = Date.now()) => {
  if (!expiresAt) return '';
  const now = Number(nowMs || Date.now());
  if (expiresAt.getTime() <= now) return 'Expirado';

  const todayKey = getDateKey(new Date(now));
  const tomorrowKey = getDateKey(new Date(now + DAY_MS));
  const expiryKey = getDateKey(expiresAt);
  const timeLabel = formatClockTime(expiresAt);

  if (expiryKey === todayKey) return `Hoy ${timeLabel}`;
  if (expiryKey === tomorrowKey) return `Mañana ${timeLabel}`;
  return `${formatExpiryDate(expiresAt)} ${timeLabel}`;
};

const resolveRealMinutesRemaining = (expiresAt = null, nowMs = Date.now()) => {
  if (!expiresAt) return null;
  const remainingMs = expiresAt.getTime() - Number(nowMs || Date.now());
  return Math.max(0, Math.floor(remainingMs / MINUTE_MS));
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
  const realMinutesRemaining = resolveRealMinutesRemaining(expiresAt, nowMs);
  const expiryLabel = formatWindowExpiryLabel(expiresAt, nowMs);
  const windowStatus = normalizeWindowStatus(source?.windowStatus);
  const hasWindowOpen = typeof source?.windowOpen === 'boolean';
  const isExpired = windowStatus === 'expired' || (Boolean(expiresAt) && (
    hasWindowOpen
      ? source.windowOpen === false
      : expiresAt.getTime() <= Number(nowMs || Date.now())
  ));
  if (isExpired) {
    return {
      status: 'expired',
      laborMinutesRemaining: 0,
      realMinutesRemaining: 0,
      active: false,
      expiring: false,
      expired: true,
      label: 'Expirado',
      title: 'Ventana 24h expirada'
    };
  }

  const laborMinutesRemaining = resolveCurrentLaboralMinutes(source, nowMs);
  if (laborMinutesRemaining === null) {
    return {
      status: 'unknown',
      laborMinutesRemaining: null,
      realMinutesRemaining,
      active: false,
      expiring: false,
      expired: false,
      label: expiryLabel
    };
  }
  if (windowStatus === 'expires_outside_hours' || laborMinutesRemaining <= 0) {
    return {
      status: 'outside-hours',
      laborMinutesRemaining,
      realMinutesRemaining,
      active: true,
      expiring: realMinutesRemaining !== null ? realMinutesRemaining <= 120 : true,
      expired: false,
      outsideHours: true,
      label: expiryLabel || (laborMinutesRemaining > 0 ? formatLaborMinutes(laborMinutesRemaining) : 'Vence fuera de horario'),
      title: laborMinutesRemaining > 0
        ? 'La ventana vence fuera del horario laboral; este es el último margen operativo'
        : 'La ventana sigue abierta, pero ya pasó el último cierre laboral disponible'
    };
  }

  return {
    status: 'active',
    laborMinutesRemaining,
    realMinutesRemaining,
    active: true,
    expiring: (realMinutesRemaining ?? laborMinutesRemaining) <= 120,
    expired: false,
    label: expiryLabel || formatLaborMinutes(laborMinutesRemaining)
  };
}

export function getWindowStatus(source = {}, nowMs = Date.now()) {
  const base = getWindowState(source, nowMs);
  if (base.expired || base.outsideHours) return base;
  if (!base.active) return null;

  const minutesRemaining = Number.isFinite(Number(base.realMinutesRemaining))
    ? Number(base.realMinutesRemaining)
    : Number(base.laborMinutesRemaining);

  if (minutesRemaining <= 60) {
    return { ...base, status: 'critical' };
  }
  if (minutesRemaining <= 240) {
    return { ...base, status: 'warning' };
  }
  return { ...base, status: 'ok' };
}

export const WINDOW_FILTER_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Con ventana activa' },
  { value: 'critical', label: 'Críticas (< 30m)' },
  { value: 'urgent', label: 'Urgente (30m - 2h)' },
  { value: 'normal', label: 'Normal (2h - 12h)' },
  { value: 'comfortable', label: 'Holgado (> 12h)' },
  { value: 'expires_in_schedule', label: 'Vence en horario' },
  { value: 'expires_out_schedule', label: 'Vence fuera horario' },
  { value: 'expired', label: 'Vencida' },
  { value: 'custom', label: 'Personalizado' }
];

export const isValidWindowFilter = (value = '') => WINDOW_FILTER_OPTIONS.some((entry) => entry.value === String(value || '').trim().toLowerCase());
