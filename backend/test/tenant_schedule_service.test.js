const test = require('node:test');
const assert = require('node:assert/strict');

const tenantScheduleService = require('../domains/tenant/services/tenant-schedule.service');

test('getRemainingLaboralMinutes counts next-day working time when window expires tomorrow', () => {
    const schedule = {
        scheduleId: 'sch_lavitat',
        tenantId: 'tenant_cleaning',
        timezone: 'America/Lima',
        isActive: true,
        weeklyHours: {
            mon: [{ start: '09:00', end: '17:00' }],
            tue: [{ start: '09:00', end: '17:00' }],
            wed: [{ start: '09:00', end: '17:00' }],
            thu: [{ start: '09:00', end: '17:00' }],
            fri: [{ start: '09:00', end: '17:00' }],
            sat: [],
            sun: []
        },
        holidays: [],
        customDays: []
    };

    const now = '2026-05-29T00:11:35.000Z';
    const windowExpiresAt = '2026-05-30T00:11:35.000Z';

    const minutes = tenantScheduleService.getRemainingLaboralMinutes(schedule, windowExpiresAt, now);

    assert.equal(minutes, 480);
});

test('getRemainingLaboralMinutes truncates to expiry minute within the next work day', () => {
    const schedule = {
        scheduleId: 'sch_lavitat',
        tenantId: 'tenant_cleaning',
        timezone: 'America/Lima',
        isActive: true,
        weeklyHours: {
            mon: [{ start: '09:00', end: '19:00' }],
            tue: [{ start: '09:00', end: '19:00' }],
            wed: [{ start: '09:00', end: '19:00' }],
            thu: [{ start: '09:00', end: '19:00' }],
            fri: [{ start: '09:00', end: '19:00' }],
            sat: [],
            sun: []
        },
        holidays: [],
        customDays: []
    };

    const now = '2026-05-29T01:00:00.000Z';
    const windowExpiresAt = '2026-05-29T22:30:00.000Z';

    const minutes = tenantScheduleService.getRemainingLaboralMinutes(schedule, windowExpiresAt, now);

    assert.equal(minutes, 510);
});
