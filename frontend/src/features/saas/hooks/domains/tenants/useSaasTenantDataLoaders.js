import { useCallback } from 'react';
import {
    CATALOG_MODE_OPTIONS,
    EMPTY_INTEGRATIONS_FORM,
    EMPTY_SETTINGS,
    normalizeIntegrationsPayload,
    normalizeOverview,
    normalizeWaModule
} from '../../../helpers';
import {
    fetchSaasOverview,
    fetchTenantCustomers,
    fetchTenantIntegrations,
    fetchTenantSettings,
    fetchTenantWaModules
} from '../../../services';

export default function useSaasTenantDataLoaders({
    requestJson,
    requiresTenantSelection = false,
    activeTenantId = '',
    setOverview,
    setSelectedTenantId,
    setSettingsTenantId,
    setSelectedUserId,
    setLoadingSettings,
    setTenantSettings,
    setLoadingIntegrations,
    setTenantIntegrations,
    setWaModules,
    setSelectedWaModuleId,
    setCustomers,
    setSelectedCustomerId
} = {}) {
    const refreshOverview = useCallback(async () => {
        const payload = await fetchSaasOverview(requestJson);
        const next = normalizeOverview(payload);
        setOverview(next);

        const availableTenantIds = new Set((next.tenants || []).map((item) => String(item?.id || '').trim()).filter(Boolean));
        setSelectedTenantId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableTenantIds.has(cleanPrev)) return cleanPrev;
            return '';
        });

        setSettingsTenantId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableTenantIds.has(cleanPrev)) return cleanPrev;
            if (requiresTenantSelection) return '';

            const activeTenant = String(activeTenantId || '').trim();
            if (activeTenant && availableTenantIds.has(activeTenant)) return activeTenant;
            if (availableTenantIds.size === 1) return Array.from(availableTenantIds)[0] || '';
            return '';
        });

        const availableUserIds = new Set((next.users || []).map((item) => String(item?.id || '').trim()).filter(Boolean));
        setSelectedUserId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (cleanPrev && availableUserIds.has(cleanPrev)) return cleanPrev;
            return '';
        });
    }, [
        activeTenantId,
        requestJson,
        requiresTenantSelection,
        setOverview,
        setSelectedTenantId,
        setSelectedUserId,
        setSettingsTenantId
    ]);

    const loadTenantSettings = useCallback(async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantSettings(EMPTY_SETTINGS);
            return;
        }
        setLoadingSettings(true);
        try {
            const payload = await fetchTenantSettings(requestJson, cleanTenantId);
            const settings = payload?.settings && typeof payload.settings === 'object' ? payload.settings : {};
            setTenantSettings({
                catalogMode: CATALOG_MODE_OPTIONS.includes(String(settings.catalogMode || '').trim())
                    ? String(settings.catalogMode).trim()
                    : 'hybrid',
                enabledModules: {
                    aiPro: settings?.enabledModules?.aiPro !== false,
                    catalog: settings?.enabledModules?.catalog !== false,
                    cart: settings?.enabledModules?.cart !== false,
                    quickReplies: settings?.enabledModules?.quickReplies !== false
                }
            });
        } finally {
            setLoadingSettings(false);
        }
    }, [requestJson, setLoadingSettings, setTenantSettings]);

    const loadTenantIntegrations = useCallback(async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantIntegrations(EMPTY_INTEGRATIONS_FORM);
            return;
        }
        setLoadingIntegrations(true);
        try {
            const payload = await fetchTenantIntegrations(requestJson, cleanTenantId);
            setTenantIntegrations(normalizeIntegrationsPayload(payload?.integrations || {}));
        } finally {
            setLoadingIntegrations(false);
        }
    }, [requestJson, setLoadingIntegrations, setTenantIntegrations]);

    const loadWaModules = useCallback(async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setWaModules([]);
            setSelectedWaModuleId('');
            return;
        }
        const payload = await fetchTenantWaModules(requestJson, cleanTenantId);
        const items = (Array.isArray(payload?.items) ? payload.items : [])
            .map(normalizeWaModule)
            .filter(Boolean)
            .sort((a, b) => String(a.name || a.moduleId).localeCompare(String(b.name || b.moduleId), 'es', { sensitivity: 'base' }));
        setWaModules(items);
        setSelectedWaModuleId((prev) => {
            const cleanPrev = String(prev || '').trim();
            const prevExists = items.some((item) => String(item?.moduleId || '').trim() === cleanPrev);
            if (prevExists) return cleanPrev;
            return '';
        });
    }, [requestJson, setSelectedWaModuleId, setWaModules]);

    const loadCustomers = useCallback(async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setCustomers([]);
            setSelectedCustomerId('');
            return;
        }
        const payload = await fetchTenantCustomers(requestJson, cleanTenantId, { limit: 300, includeInactive: true });
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setCustomers(items);
        setSelectedCustomerId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (!cleanPrev) return '';
            const exists = items.some((item) => String(item?.customerId || '').trim() === cleanPrev);
            return exists ? cleanPrev : '';
        });
    }, [requestJson, setCustomers, setSelectedCustomerId]);

    return {
        refreshOverview,
        loadTenantSettings,
        loadTenantIntegrations,
        loadWaModules,
        loadCustomers
    };
}
