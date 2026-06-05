const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');

const SCHEDULES_FILE = 'tenant_schedules.json';
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAY_TO_KEY = {
    Sun: 'sun',
    Mon: 'mon',
    Tue: 'tue',
    Wed: 'wed',
    Thu: 'thu',
    Fri: 'fri',
    Sat: 'sat'
};
const DEFAULT_WEEKLY_HOURS = Object.freeze({
    mon: [{ start: '09:00', end: '19:00' }],
    tue: [{ start: '09:00', end: '19:00' }],
    wed: [{ start: '09:00', end: '19:00' }],
    thu: [{ start: '09:00', end: '19:00' }],
    fri: [{ start: '09:00', end: '19:00' }],
    sat: [{ start: '09:00', end: '13:00' }],
    sun: []
});
const MAX_AUTO_MESSAGE_LENGTH = 1000;

let schemaReady = false;
let schemaPromise = null;

function text(value = '') {
    return String(value ?? '').trim();
}

function truncateAutoMessage(value = '') {
    return text(value).slice(0, MAX_AUTO_MESSAGE_LENGTH);
}

function normalizeScheduleId(value = '') {
    return text(value);
}

function normalizeTimezone(value = '') {
    const timezone = text(value) || 'America/Lima';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
        return timezone;
    } catch (_) {
        return 'America/Lima';
    }
}

function normalizeTime(value = '') {
    const raw = text(value);
    const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return match ? raw : '';
}

function timeToMinutes(value = '') {
    const safe = normalizeTime(value);
    if (!safe) return null;
    const [hour, minute] = safe.split(':').map((part) => Number.parseInt(part, 10));
    return (hour * 60) + minute;
}

function normalizeHours(hours = []) {
    const source = Array.isArray(hours) ? hours : [];
    return source
        .map((entry) => {
            const start = normalizeTime(entry?.start);
            const end = normalizeTime(entry?.end);
            if (!start || !end) return null;
            if (timeToMinutes(end) <= timeToMinutes(start)) return null;
            return { start, end };
        })
        .filter(Boolean);
}

function normalizeWeeklyHours(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return DAY_KEYS.reduce((acc, key) => {
        acc[key] = normalizeHours(Object.prototype.hasOwnProperty.call(source, key) ? source[key] : DEFAULT_WEEKLY_HOURS[key]);
        return acc;
    }, {});
}

function normalizeHoliday(entry = {}) {
    const month = Number.parseInt(String(entry?.month ?? ''), 10);
    const day = Number.parseInt(String(entry?.day ?? ''), 10);
    const name = text(entry?.name);
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    return { month, day, name: name || `Feriado ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` };
}

function normalizeHolidays(value = []) {
    return (Array.isArray(value) ? value : []).map(normalizeHoliday).filter(Boolean);
}

function normalizeDate(value = '') {
    const raw = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeCustomDay(entry = {}) {
    const date = normalizeDate(entry?.date);
    const type = text(entry?.type).toLowerCase() === 'open' ? 'open' : 'closed';
    if (!date) return null;
    const item = {
        date,
        name: text(entry?.name) || date,
        type
    };
    if (type === 'open') item.hours = normalizeHours(entry?.hours);
    return item;
}

function normalizeCustomDays(value = []) {
    return (Array.isArray(value) ? value : []).map(normalizeCustomDay).filter(Boolean);
}

function normalizeRow(row = {}) {
    return {
        scheduleId: normalizeScheduleId(row.schedule_id || row.scheduleId),
        tenantId: normalizeTenantId(row.tenant_id || row.tenantId || DEFAULT_TENANT_ID),
        name: text(row.name) || 'Horario',
        timezone: normalizeTimezone(row.timezone),
        weeklyHours: normalizeWeeklyHours(row.weekly_hours || row.weeklyHours),
        holidays: normalizeHolidays(row.holidays),
        customDays: normalizeCustomDays(row.custom_days || row.customDays),
        welcomeMessage: truncateAutoMessage(row.welcome_message || row.welcomeMessage),
        awayMessage: truncateAutoMessage(row.away_message || row.awayMessage),
        welcomeEnabled: row.welcome_enabled === true || row.welcomeEnabled === true,
        awayEnabled: row.away_enabled === true || row.awayEnabled === true,
        isActive: row.is_active !== false && row.isActive !== false,
        createdAt: row.created_at || row.createdAt || null,
        updatedAt: row.updated_at || row.updatedAt || null
    };
}

function sanitizePayload(payload = {}) {
    return {
        name: text(payload.name) || 'Horario',
        timezone: normalizeTimezone(payload.timezone),
        weeklyHours: normalizeWeeklyHours(payload.weeklyHours || payload.weekly_hours || DEFAULT_WEEKLY_HOURS),
        holidays: normalizeHolidays(payload.holidays),
        customDays: normalizeCustomDays(payload.customDays || payload.custom_days),
        welcomeMessage: truncateAutoMessage(payload.welcomeMessage || payload.welcome_message),
        awayMessage: truncateAutoMessage(payload.awayMessage || payload.away_message),
        welcomeEnabled: payload.welcomeEnabled === true || payload.welcome_enabled === true,
        awayEnabled: payload.awayEnabled === true || payload.away_enabled === true,
        isActive: payload.isActive !== false && payload.is_active !== false
    };
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = queryPostgres(`
        CREATE TABLE IF NOT EXISTS tenant_schedules (
          schedule_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          timezone TEXT NOT NULL DEFAULT 'America/Lima',
          weekly_hours JSONB NOT NULL DEFAULT '{}',
          holidays JSONB NOT NULL DEFAULT '[]',
          custom_days JSONB NOT NULL DEFAULT '[]',
          welcome_message TEXT,
          away_message TEXT,
          welcome_enabled BOOLEAN DEFAULT FALSE,
          away_enabled BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_tenant_schedules_tenant
          ON tenant_schedules(tenant_id, is_active);
        ALTER TABLE tenant_schedules
          ADD COLUMN IF NOT EXISTS welcome_message TEXT,
          ADD COLUMN IF NOT EXISTS away_message TEXT,
          ADD COLUMN IF NOT EXISTS welcome_enabled BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS away_enabled BOOLEAN DEFAULT FALSE;
    `).then(() => {
        schemaReady = true;
    }).finally(() => {
        schemaPromise = null;
    });
    return schemaPromise;
}

async function readFileSchedules(tenantId) {
    const rows = await readTenantJsonFile(SCHEDULES_FILE, {
        tenantId: normalizeTenantId(tenantId || DEFAULT_TENANT_ID),
        defaultValue: []
    });
    return (Array.isArray(rows) ? rows : []).map(normalizeRow).filter((item) => item.scheduleId);
}

async function writeFileSchedules(tenantId, rows) {
    await writeTenantJsonFile(SCHEDULES_FILE, rows, {
        tenantId: normalizeTenantId(tenantId || DEFAULT_TENANT_ID)
    });
}

async function listSchedules(tenantId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() !== 'postgres') {
        const rows = await readFileSchedules(cleanTenantId);
        return rows.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    }
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `SELECT schedule_id, tenant_id, name, timezone, weekly_hours, holidays,
                custom_days, welcome_message, away_message, welcome_enabled,
                away_enabled, is_active, created_at, updated_at
           FROM tenant_schedules
          WHERE tenant_id = $1
          ORDER BY is_active DESC, name ASC`,
        [cleanTenantId]
    );
    return rows.map(normalizeRow);
}

async function getActiveSchedule(tenantId) {
    const schedules = await listSchedules(tenantId);
    return schedules.find((item) => item?.isActive !== false) || null;
}

async function getSchedule(tenantId, scheduleId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanScheduleId = normalizeScheduleId(scheduleId);
    if (!cleanScheduleId) return null;
    if (getStorageDriver() !== 'postgres') {
        const rows = await readFileSchedules(cleanTenantId);
        return rows.find((item) => item.scheduleId === cleanScheduleId) || null;
    }
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `SELECT schedule_id, tenant_id, name, timezone, weekly_hours, holidays,
                custom_days, welcome_message, away_message, welcome_enabled,
                away_enabled, is_active, created_at, updated_at
           FROM tenant_schedules
          WHERE tenant_id = $1 AND schedule_id = $2
          LIMIT 1`,
        [cleanTenantId, cleanScheduleId]
    );
    return rows[0] ? normalizeRow(rows[0]) : null;
}

async function createSchedule(tenantId, data = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const clean = sanitizePayload(data);
    const scheduleId = normalizeScheduleId(data.scheduleId || data.schedule_id) || `sch_${crypto.randomUUID()}`;
    if (getStorageDriver() !== 'postgres') {
        const now = new Date().toISOString();
        const rows = await readFileSchedules(cleanTenantId);
        const item = normalizeRow({ scheduleId, tenantId: cleanTenantId, ...clean, createdAt: now, updatedAt: now });
        rows.push(item);
        await writeFileSchedules(cleanTenantId, rows);
        return item;
    }
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `INSERT INTO tenant_schedules
            (schedule_id, tenant_id, name, timezone, weekly_hours, holidays, custom_days,
             welcome_message, away_message, welcome_enabled, away_enabled, is_active)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)
         RETURNING schedule_id, tenant_id, name, timezone, weekly_hours, holidays,
                   custom_days, welcome_message, away_message, welcome_enabled,
                   away_enabled, is_active, created_at, updated_at`,
        [
            scheduleId,
            cleanTenantId,
            clean.name,
            clean.timezone,
            JSON.stringify(clean.weeklyHours),
            JSON.stringify(clean.holidays),
            JSON.stringify(clean.customDays),
            clean.welcomeMessage || null,
            clean.awayMessage || null,
            clean.welcomeEnabled,
            clean.awayEnabled,
            clean.isActive
        ]
    );
    return normalizeRow(rows[0]);
}

async function updateSchedule(tenantId, scheduleId, data = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanScheduleId = normalizeScheduleId(scheduleId);
    if (!cleanScheduleId) throw new Error('scheduleId requerido.');
    const clean = sanitizePayload(data);
    if (getStorageDriver() !== 'postgres') {
        const rows = await readFileSchedules(cleanTenantId);
        const idx = rows.findIndex((item) => item.scheduleId === cleanScheduleId);
        if (idx < 0) throw new Error('Horario no encontrado.');
        const item = normalizeRow({ ...rows[idx], ...clean, updatedAt: new Date().toISOString() });
        rows[idx] = item;
        await writeFileSchedules(cleanTenantId, rows);
        return item;
    }
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `UPDATE tenant_schedules
            SET name = $3,
                timezone = $4,
                weekly_hours = $5::jsonb,
                holidays = $6::jsonb,
                custom_days = $7::jsonb,
                welcome_message = $8,
                away_message = $9,
                welcome_enabled = $10,
                away_enabled = $11,
                is_active = $12,
                updated_at = NOW()
          WHERE tenant_id = $1 AND schedule_id = $2
          RETURNING schedule_id, tenant_id, name, timezone, weekly_hours, holidays,
                    custom_days, welcome_message, away_message, welcome_enabled,
                    away_enabled, is_active, created_at, updated_at`,
        [
            cleanTenantId,
            cleanScheduleId,
            clean.name,
            clean.timezone,
            JSON.stringify(clean.weeklyHours),
            JSON.stringify(clean.holidays),
            JSON.stringify(clean.customDays),
            clean.welcomeMessage || null,
            clean.awayMessage || null,
            clean.welcomeEnabled,
            clean.awayEnabled,
            clean.isActive
        ]
    );
    if (!rows[0]) throw new Error('Horario no encontrado.');
    return normalizeRow(rows[0]);
}

async function deleteSchedule(tenantId, scheduleId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanScheduleId = normalizeScheduleId(scheduleId);
    if (!cleanScheduleId) throw new Error('scheduleId requerido.');
    if (getStorageDriver() !== 'postgres') {
        const rows = await readFileSchedules(cleanTenantId);
        const next = rows.filter((item) => item.scheduleId !== cleanScheduleId);
        await writeFileSchedules(cleanTenantId, next);
        return { deleted: next.length !== rows.length };
    }
    await ensurePostgresSchema();
    const { rowCount } = await queryPostgres(
        'DELETE FROM tenant_schedules WHERE tenant_id = $1 AND schedule_id = $2',
        [cleanTenantId, cleanScheduleId]
    );
    return { deleted: rowCount > 0 };
}

function getTimezoneParts(datetime, timezone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(datetime).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});
    const hour = Number.parseInt(parts.hour, 10) === 24 ? 0 : Number.parseInt(parts.hour, 10);
    const minute = Number.parseInt(parts.minute, 10);
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        month: Number.parseInt(parts.month, 10),
        day: Number.parseInt(parts.day, 10),
        dayKey: WEEKDAY_TO_KEY[parts.weekday] || '',
        minutes: (hour * 60) + minute
    };
}

function isMinuteWithinHours(minutes, hours = []) {
    return normalizeHours(hours).some((range) => {
        const start = timeToMinutes(range.start);
        const end = timeToMinutes(range.end);
        return start !== null && end !== null && minutes >= start && minutes < end;
    });
}

function getScheduleHoursForDate(schedule = null, parts = null) {
    if (!schedule || !parts) return [];
    const customDay = Array.isArray(schedule?.customDays)
        ? schedule.customDays.find((item) => item?.date === parts.date)
        : null;
    if (customDay) {
        if (customDay.type === 'closed') return [];
        return normalizeHours(customDay.hours);
    }
    const holiday = Array.isArray(schedule?.holidays)
        ? schedule.holidays.find((item) => item?.month === parts.month && item?.day === parts.day)
        : null;
    if (holiday) return [];
    return normalizeHours(schedule?.weeklyHours?.[parts.dayKey] || []);
}

function buildCalendarParts(dateKey = '') {
    const safeDateKey = normalizeDate(dateKey);
    if (!safeDateKey) return null;
    const [year, month, day] = safeDateKey.split('-').map((part) => Number.parseInt(part, 10));
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const weekday = DAY_KEYS[utcDate.getUTCDay()] || '';
    return {
        date: safeDateKey,
        month,
        day,
        dayKey: weekday,
        minutes: 0
    };
}

function addDaysToDateKey(dateKey = '', days = 0) {
    const safeDateKey = normalizeDate(dateKey);
    if (!safeDateKey) return '';
    const [year, month, day] = safeDateKey.split('-').map((part) => Number.parseInt(part, 10));
    const utcDate = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
    const nextYear = utcDate.getUTCFullYear();
    const nextMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const nextDay = String(utcDate.getUTCDate()).padStart(2, '0');
    return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getTimezoneOffsetMs(date = new Date(), timezone = 'America/Lima') {
    const parts = getTimezoneParts(date, timezone);
    const [year, month, day] = String(parts.date || '').split('-').map((part) => Number.parseInt(part, 10));
    const hour = Math.floor(Number(parts.minutes || 0) / 60);
    const minute = Number(parts.minutes || 0) % 60;
    return Date.UTC(year, month - 1, day, hour, minute) - date.getTime();
}

function buildDateInTimezone(dateKey = '', minutes = 0, timezone = 'America/Lima') {
    const safeDateKey = normalizeDate(dateKey);
    if (!safeDateKey) return null;
    const [year, month, day] = safeDateKey.split('-').map((part) => Number.parseInt(part, 10));
    const safeMinutes = Math.max(0, Math.min(24 * 60, Math.floor(Number(minutes || 0))));
    const hour = Math.floor(safeMinutes / 60);
    const minute = safeMinutes % 60;
    const utcMillis = Date.UTC(year, month - 1, day, hour, minute);
    const firstGuess = new Date(utcMillis);
    const firstOffset = getTimezoneOffsetMs(firstGuess, timezone);
    const secondGuess = new Date(utcMillis - firstOffset);
    const secondOffset = getTimezoneOffsetMs(secondGuess, timezone);
    return new Date(utcMillis - secondOffset);
}

function getWorkingMinutesBetween(schedule = null, from = new Date(), to = new Date()) {
    if (!schedule || schedule?.isActive === false) return null;
    const fromDate = from instanceof Date ? from : new Date(from);
    const toDate = to instanceof Date ? to : new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null;
    if (toDate.getTime() <= fromDate.getTime()) return 0;

    const timezone = normalizeTimezone(schedule?.timezone);
    const fromParts = getTimezoneParts(fromDate, timezone);
    const toParts = getTimezoneParts(toDate, timezone);
    let totalMinutes = 0;
    let currentDateKey = fromParts.date;

    while (currentDateKey && currentDateKey <= toParts.date) {
        const dayParts = buildCalendarParts(currentDateKey);
        if (!dayParts) break;
        const dayHours = getScheduleHoursForDate(schedule, dayParts);
        if (dayHours.length) {
            const dayStartMinute = currentDateKey === fromParts.date ? fromParts.minutes : 0;
            const dayEndMinute = currentDateKey === toParts.date ? toParts.minutes : (24 * 60);
            for (const range of dayHours) {
                const start = timeToMinutes(range.start);
                const end = timeToMinutes(range.end);
                if (start === null || end === null || end <= start) continue;
                const rangeStart = Math.max(start, dayStartMinute);
                const rangeEnd = Math.min(end, dayEndMinute);
                if (rangeEnd > rangeStart) {
                    totalMinutes += (rangeEnd - rangeStart);
                }
            }
        }
        if (currentDateKey === toParts.date) break;
        currentDateKey = addDaysToDateKey(currentDateKey, 1);
    }

    return Math.max(0, totalMinutes);
}

function getNextLaboralClose(schedule = null, now = new Date()) {
    if (!schedule || schedule?.isActive === false) return null;
    const nowDate = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(nowDate.getTime())) return null;

    const timezone = normalizeTimezone(schedule?.timezone);
    const nowParts = getTimezoneParts(nowDate, timezone);
    let currentDateKey = nowParts.date;

    for (let dayOffset = 0; dayOffset < 14 && currentDateKey; dayOffset += 1) {
        const dayParts = buildCalendarParts(currentDateKey);
        if (!dayParts) break;
        const dayHours = getScheduleHoursForDate(schedule, dayParts)
            .map((range) => ({
                start: timeToMinutes(range.start),
                end: timeToMinutes(range.end)
            }))
            .filter((range) => range.start !== null && range.end !== null && range.end > range.start)
            .sort((a, b) => a.start - b.start);

        const currentMinute = currentDateKey === nowParts.date ? nowParts.minutes : -1;
        const nextRange = dayHours.find((range) => currentMinute < range.end);
        if (nextRange) {
            return buildDateInTimezone(currentDateKey, nextRange.end, timezone);
        }
        currentDateKey = addDaysToDateKey(currentDateKey, 1);
    }

    return null;
}

function getLastLaboralCloseBeforeDate(schedule = null, date = new Date()) {
    if (!schedule || schedule?.isActive === false) return null;
    const targetDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(targetDate.getTime())) return null;

    const timezone = normalizeTimezone(schedule?.timezone);
    const targetParts = getTimezoneParts(targetDate, timezone);
    let currentDateKey = targetParts.date;

    for (let dayOffset = 0; dayOffset <= 7 && currentDateKey; dayOffset += 1) {
        const dayParts = buildCalendarParts(currentDateKey);
        if (!dayParts) break;
        const closeMinutes = getScheduleHoursForDate(schedule, dayParts)
            .map((range) => timeToMinutes(range.end))
            .filter((minute) => minute !== null)
            .sort((a, b) => b - a);

        for (const closeMinute of closeMinutes) {
            const closeDate = buildDateInTimezone(currentDateKey, closeMinute, timezone);
            if (closeDate && closeDate.getTime() < targetDate.getTime()) {
                return closeDate;
            }
        }

        currentDateKey = addDaysToDateKey(currentDateKey, -1);
    }

    return null;
}

function isDateWithinLaboralHours(schedule = null, date = new Date()) {
    if (!schedule || schedule?.isActive === false) return false;
    const targetDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(targetDate.getTime())) return false;

    const timezone = normalizeTimezone(schedule?.timezone);
    const parts = getTimezoneParts(targetDate, timezone);
    const dayHours = getScheduleHoursForDate(schedule, parts);
    return dayHours.some((range) => {
        const start = timeToMinutes(range.start);
        const end = timeToMinutes(range.end);
        return start !== null && end !== null && end > start && parts.minutes >= start && parts.minutes <= end;
    });
}

function getRemainingLaboralMinutes(schedule = null, windowExpiresAt = null, now = new Date()) {
    if (!schedule || schedule?.isActive === false) return null;
    const nowDate = now instanceof Date ? now : new Date(now);
    const expiresDate = windowExpiresAt instanceof Date ? windowExpiresAt : new Date(windowExpiresAt);
    if (Number.isNaN(nowDate.getTime()) || Number.isNaN(expiresDate.getTime())) return null;
    if (expiresDate.getTime() <= nowDate.getTime()) {
        return { minutes: 0, status: 'expired' };
    }

    if (isDateWithinLaboralHours(schedule, expiresDate)) {
        return {
            minutes: Math.max(0, Math.floor((expiresDate.getTime() - nowDate.getTime()) / (60 * 1000))),
            status: 'open'
        };
    }

    const lastLaboralClose = getLastLaboralCloseBeforeDate(schedule, expiresDate);
    if (!lastLaboralClose || lastLaboralClose.getTime() <= nowDate.getTime()) {
        return { minutes: 0, status: 'expires_outside_hours' };
    }

    return {
        minutes: Math.max(0, Math.floor((lastLaboralClose.getTime() - nowDate.getTime()) / (60 * 1000))),
        status: 'expires_outside_hours'
    };
}

async function isWithinSchedule(tenantId, scheduleId, datetime = new Date()) {
    const schedule = await getSchedule(tenantId, scheduleId);
    if (!schedule || schedule.isActive === false) {
        return { open: false, schedule: schedule || null, reason: 'inactive' };
    }
    const date = datetime instanceof Date ? datetime : new Date(datetime);
    if (Number.isNaN(date.getTime())) {
        return { open: false, schedule, reason: 'invalid_datetime' };
    }
    const parts = getTimezoneParts(date, schedule.timezone);
    const customDay = schedule.customDays.find((item) => item.date === parts.date);
    if (customDay) {
        if (customDay.type === 'closed') return { open: false, schedule, reason: 'custom_closed' };
        return {
            open: isMinuteWithinHours(parts.minutes, customDay.hours),
            schedule,
            reason: 'custom_open'
        };
    }
    const holiday = schedule.holidays.find((item) => item.month === parts.month && item.day === parts.day);
    if (holiday) return { open: false, schedule, reason: 'holiday' };
    const hours = schedule.weeklyHours[parts.dayKey] || [];
    return {
        open: isMinuteWithinHours(parts.minutes, hours),
        schedule,
        reason: 'weekly_hours'
    };
}

module.exports = {
    DEFAULT_WEEKLY_HOURS,
    listSchedules,
    getActiveSchedule,
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    isWithinSchedule,
    getWorkingMinutesBetween,
    getNextLaboralClose,
    getLastLaboralCloseBeforeDate,
    getRemainingLaboralMinutes
};
