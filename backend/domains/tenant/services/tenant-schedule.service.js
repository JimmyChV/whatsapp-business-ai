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

let schemaReady = false;
let schemaPromise = null;

function text(value = '') {
    return String(value ?? '').trim();
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
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_tenant_schedules_tenant
          ON tenant_schedules(tenant_id, is_active);
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
                custom_days, is_active, created_at, updated_at
           FROM tenant_schedules
          WHERE tenant_id = $1
          ORDER BY is_active DESC, name ASC`,
        [cleanTenantId]
    );
    return rows.map(normalizeRow);
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
                custom_days, is_active, created_at, updated_at
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
            (schedule_id, tenant_id, name, timezone, weekly_hours, holidays, custom_days, is_active)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
         RETURNING schedule_id, tenant_id, name, timezone, weekly_hours, holidays,
                   custom_days, is_active, created_at, updated_at`,
        [
            scheduleId,
            cleanTenantId,
            clean.name,
            clean.timezone,
            JSON.stringify(clean.weeklyHours),
            JSON.stringify(clean.holidays),
            JSON.stringify(clean.customDays),
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
                is_active = $8,
                updated_at = NOW()
          WHERE tenant_id = $1 AND schedule_id = $2
          RETURNING schedule_id, tenant_id, name, timezone, weekly_hours, holidays,
                    custom_days, is_active, created_at, updated_at`,
        [
            cleanTenantId,
            cleanScheduleId,
            clean.name,
            clean.timezone,
            JSON.stringify(clean.weeklyHours),
            JSON.stringify(clean.holidays),
            JSON.stringify(clean.customDays),
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
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    isWithinSchedule
};
