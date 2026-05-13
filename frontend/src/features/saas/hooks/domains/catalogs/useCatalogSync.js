import React from 'react';

const emptyStatus = {
    lastSync: null,
    productCount: 0,
    status: 'never_synced',
    intervalHours: 0,
    nextSync: null,
    error: null
};

function buildStatusUrl(tenantId, catalogId) {
    return `/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/catalogs/${encodeURIComponent(String(catalogId || '').trim().toUpperCase())}/sync-status`;
}

function buildSyncUrl(tenantId, catalogId) {
    return `/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/catalogs/${encodeURIComponent(String(catalogId || '').trim().toUpperCase())}/sync`;
}

export default function useCatalogSync({ requestJson } = {}) {
    const [syncStatus, setSyncStatus] = React.useState(emptyStatus);
    const [syncing, setSyncing] = React.useState(false);
    const [syncError, setSyncError] = React.useState(null);
    const activeRef = React.useRef({ tenantId: '', catalogId: '' });

    const loadSyncStatus = React.useCallback(async (tenantId, catalogId) => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        activeRef.current = { tenantId: cleanTenantId, catalogId: cleanCatalogId };
        if (!cleanTenantId || !cleanCatalogId || typeof requestJson !== 'function') {
            setSyncStatus(emptyStatus);
            setSyncing(false);
            setSyncError(null);
            return emptyStatus;
        }

        try {
            const payload = await requestJson(buildStatusUrl(cleanTenantId, cleanCatalogId), { method: 'GET' });
            const next = payload?.status && typeof payload.status === 'object' ? payload.status : emptyStatus;
            setSyncStatus({ ...emptyStatus, ...next });
            setSyncing(next.status === 'syncing');
            setSyncError(next.error || null);
            return next;
        } catch (error) {
            setSyncError(String(error?.message || 'No se pudo cargar la sincronizacion.'));
            return emptyStatus;
        }
    }, [requestJson]);

    const triggerSync = React.useCallback(async (tenantId, catalogId, intervalHours) => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanCatalogId || typeof requestJson !== 'function') return null;
        setSyncing(true);
        setSyncError(null);
        const body = {};
        if (intervalHours !== undefined) body.intervalHours = Number(intervalHours) || 0;
        try {
            const payload = await requestJson(buildSyncUrl(cleanTenantId, cleanCatalogId), {
                method: 'POST',
                body
            });
            const next = payload?.status && typeof payload.status === 'object' ? payload.status : emptyStatus;
            setSyncStatus({ ...emptyStatus, ...next });
            setSyncing(next.status === 'syncing');
            setSyncError(next.error || null);
            return payload;
        } catch (error) {
            const message = String(error?.message || 'No se pudo sincronizar.');
            setSyncError(message);
            setSyncing(false);
            setSyncStatus((prev) => ({ ...prev, status: 'error', error: message }));
            throw error;
        }
    }, [requestJson]);

    const setIntervalHours = React.useCallback(async (tenantId, catalogId, hours) => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanCatalogId || typeof requestJson !== 'function') return null;
        setSyncError(null);
        const payload = await requestJson(buildSyncUrl(cleanTenantId, cleanCatalogId), {
            method: 'POST',
            body: {
                intervalHours: Number(hours) || 0,
                scheduleOnly: true
            }
        });
        const next = payload?.status && typeof payload.status === 'object' ? payload.status : emptyStatus;
        setSyncStatus({ ...emptyStatus, ...next });
        setSyncing(next.status === 'syncing');
        setSyncError(next.error || null);
        return next;
    }, [requestJson]);

    React.useEffect(() => {
        if (!syncing) return undefined;
        const timer = window.setInterval(() => {
            const { tenantId, catalogId } = activeRef.current;
            if (tenantId && catalogId) void loadSyncStatus(tenantId, catalogId);
        }, 30000);
        return () => window.clearInterval(timer);
    }, [loadSyncStatus, syncing]);

    return {
        syncStatus,
        syncing,
        syncError,
        loadSyncStatus,
        triggerSync,
        setInterval: setIntervalHours
    };
}
