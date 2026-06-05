const test = require('node:test');
const assert = require('node:assert/strict');

const tenantScheduleService = require('../domains/tenant/services/tenant-schedule.service');

test('getRemainingLaboralMinutes returns real time when window expires inside working hours', () => {
    const schedule = {
        scheduleId: 'sch_lavitat',
        tenantId: 'tenant_cleaning',
        timezone: 'America/Lima',
        isActive: true,
        weeklyHours: {
            mon: [{ start: '07:30', end: '17:00' }],
            tue: [{ start: '07:30', end: '17:00' }],
            wed: [{ start: '07:30', end: '17:00' }],
            thu: [{ start: '07:30', end: '17:00' }],
            fri: [{ start: '07:30', end: '17:00' }],
            sat: [],
            sun: []
        },
        holidays: [],
        customDays: []
    };

    const now = '2026-06-04T15:00:00.000Z'; // 10:00 Lima
    const windowExpiresAt = '2026-06-05T13:00:00.000Z'; // manana 08:00 Lima

    const result = tenantScheduleService.getRemainingLaboralMinutes(schedule, windowExpiresAt, now);

    assert.deepEqual(result, { minutes: 1320, status: 'open' });
});

test('getRemainingLaboralMinutes warns at last close when expiry is before next opening', () => {
    const schedule = {
        scheduleId: 'sch_lavitat',
        tenantId: 'tenant_cleaning',
        timezone: 'America/Lima',
        isActive: true,
        weeklyHours: {
            mon: [{ start: '07:30', end: '17:00' }],
            tue: [{ start: '07:30', end: '17:00' }],
            wed: [{ start: '07:30', end: '17:00' }],
            thu: [{ start: '07:30', end: '17:00' }],
            fri: [{ start: '07:30', end: '17:00' }],
            sat: [],
            sun: []
        },
        holidays: [],
        customDays: []
    };

    const now = '2026-06-04T15:00:00.000Z'; // 10:00 Lima
    const windowExpiresAt = '2026-06-05T11:00:00.000Z'; // manana 06:00 Lima

    const result = tenantScheduleService.getRemainingLaboralMinutes(schedule, windowExpiresAt, now);

    assert.deepEqual(result, { minutes: 420, status: 'expires_outside_hours' });
});

test('getRemainingLaboralMinutes returns zero urgency when the last close already passed', () => {
    const schedule = {
        scheduleId: 'sch_lavitat',
        tenantId: 'tenant_cleaning',
        timezone: 'America/Lima',
        isActive: true,
        weeklyHours: {
            mon: [{ start: '07:30', end: '17:00' }],
            tue: [{ start: '07:30', end: '17:00' }],
            wed: [{ start: '07:30', end: '17:00' }],
            thu: [{ start: '07:30', end: '17:00' }],
            fri: [{ start: '07:30', end: '17:00' }],
            sat: [{ start: '07:30', end: '13:00' }],
            sun: []
        },
        holidays: [],
        customDays: []
    };

    const now = '2026-06-05T23:00:00.000Z'; // 18:00 Lima
    const windowExpiresAt = '2026-06-06T11:00:00.000Z'; // manana 06:00 Lima

    const result = tenantScheduleService.getRemainingLaboralMinutes(schedule, windowExpiresAt, now);

    assert.deepEqual(result, { minutes: 0, status: 'expires_outside_hours' });
});

test('getRemainingLaboralMinutes does not warn one day before a future close', () => {
    const schedule = {
        scheduleId: 'sch_lavitat',
        tenantId: 'tenant_cleaning',
        timezone: 'America/Lima',
        isActive: true,
        weeklyHours: {
            mon: [{ start: '07:30', end: '17:00' }],
            tue: [{ start: '07:30', end: '17:00' }],
            wed: [{ start: '07:30', end: '17:00' }],
            thu: [{ start: '07:30', end: '17:00' }],
            fri: [{ start: '07:30', end: '17:00' }],
            sat: [{ start: '07:30', end: '13:00' }],
            sun: []
        },
        holidays: [],
        customDays: []
    };

    const now = '2026-06-05T18:30:00.000Z'; // viernes 13:30 Lima
    const windowExpiresAt = '2026-06-06T18:40:00.000Z'; // sabado 13:40 Lima

    const result = tenantScheduleService.getRemainingLaboralMinutes(schedule, windowExpiresAt, now);

    assert.deepEqual(result, { minutes: 1450, status: 'open' });
});

test('getLastLaboralCloseBeforeDate uses weekend close before a closed expiry day', () => {
    const schedule = {
        scheduleId: 'sch_lavitat',
        tenantId: 'tenant_cleaning',
        timezone: 'America/Lima',
        isActive: true,
        weeklyHours: {
            mon: [{ start: '07:30', end: '17:00' }],
            tue: [{ start: '07:30', end: '17:00' }],
            wed: [{ start: '07:30', end: '17:00' }],
            thu: [{ start: '07:30', end: '17:00' }],
            fri: [{ start: '07:30', end: '17:00' }],
            sat: [{ start: '07:30', end: '13:00' }],
            sun: []
        },
        holidays: [],
        customDays: []
    };

    const now = '2026-06-06T15:00:00.000Z'; // sabado 10:00 Lima
    const windowExpiresAt = '2026-06-07T19:00:00.000Z'; // domingo 14:00 Lima

    const result = tenantScheduleService.getRemainingLaboralMinutes(schedule, windowExpiresAt, now);

    assert.deepEqual(result, { minutes: 180, status: 'expires_outside_hours' });
});
