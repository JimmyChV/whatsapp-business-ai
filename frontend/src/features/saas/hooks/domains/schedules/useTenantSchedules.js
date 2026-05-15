import React from 'react';

function text(value = '') {
    return String(value ?? '').trim();
}

export default function useTenantSchedules({
    requestJson = null,
    tenantId = '',
    enabled = true,
    autoLoad = true
} = {}) {
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    const loadSchedules = React.useCallback(async (overrideTenantId = '') => {
        const cleanTenantId = text(overrideTenantId || tenantId);
        if (!enabled || !cleanTenantId || typeof requestJson !== 'function') {
            setItems([]);
            return [];
        }
        setLoading(true);
        setError('');
        try {
            const response = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/schedules`);
            const nextItems = Array.isArray(response?.items) ? response.items : [];
            setItems(nextItems);
            return nextItems;
        } catch (err) {
            const message = String(err?.message || err || 'No se pudieron cargar horarios.');
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [enabled, requestJson, tenantId]);

    React.useEffect(() => {
        if (!autoLoad || !enabled) return;
        loadSchedules().catch(() => {});
    }, [autoLoad, enabled, loadSchedules]);

    const createSchedule = React.useCallback(async (payload) => {
        const cleanTenantId = text(tenantId);
        if (!cleanTenantId || typeof requestJson !== 'function') throw new Error('Selecciona una empresa.');
        const response = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/schedules`, {
            method: 'POST',
            body: payload
        });
        const item = response?.item || null;
        if (item) setItems((prev) => [item, ...prev]);
        return item;
    }, [requestJson, tenantId]);

    const updateSchedule = React.useCallback(async (scheduleId, payload) => {
        const cleanTenantId = text(tenantId);
        const cleanScheduleId = text(scheduleId);
        if (!cleanTenantId || !cleanScheduleId || typeof requestJson !== 'function') throw new Error('Horario invalido.');
        const response = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/schedules/${encodeURIComponent(cleanScheduleId)}`, {
            method: 'PUT',
            body: payload
        });
        const item = response?.item || null;
        if (item) setItems((prev) => prev.map((entry) => (text(entry?.scheduleId) === cleanScheduleId ? item : entry)));
        return item;
    }, [requestJson, tenantId]);

    const deleteSchedule = React.useCallback(async (scheduleId) => {
        const cleanTenantId = text(tenantId);
        const cleanScheduleId = text(scheduleId);
        if (!cleanTenantId || !cleanScheduleId || typeof requestJson !== 'function') throw new Error('Horario invalido.');
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/schedules/${encodeURIComponent(cleanScheduleId)}`, {
            method: 'DELETE'
        });
        setItems((prev) => prev.filter((entry) => text(entry?.scheduleId) !== cleanScheduleId));
    }, [requestJson, tenantId]);

    return {
        schedules: items,
        loadingSchedules: loading,
        schedulesError: error,
        loadSchedules,
        createSchedule,
        updateSchedule,
        deleteSchedule,
        setSchedules: setItems
    };
}
