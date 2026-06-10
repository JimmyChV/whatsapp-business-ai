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
  if (windowStatus === 'expires_outside_hours' || laborMinutesRemaining <= 0) {
    return {
      status: 'outside-hours',
      laborMinutesRemaining,
      active: true,
      expiring: true,
      expired: false,
      outsideHours: true,
      label: laborMinutesRemaining > 0 ? `${formatLaborMinutes(laborMinutesRemaining)} ⚠️` : '⚠️ Vence fuera de horario',
      title: laborMinutesRemaining > 0
        ? 'La ventana vence fuera del horario laboral; este es el último margen operativo'
        : 'La ventana sigue abierta, pero ya pasó el último cierre laboral disponible'
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
