import { useCallback, useRef, useState } from 'react';
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

function resolveCustomerId(value = null) {
    if (!value || typeof value !== 'object') return '';
    return String(
        value.customerId
        || value.customer_id
        || value.customerid
        || value.id
        || ''
    ).trim();
}

function normalizeCustomerMatchId(value = '') {
    return String(value || '').trim().toUpperCase();
}

function resolveUpdatedAtTimestamp(value = null) {
    if (!value || typeof value !== 'object') return 0;
    const raw = String(value.updatedAt || value.updated_at || '').trim();
    if (!raw) return 0;
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeUpdatedSince(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toISOString();
}

function computeMaxUpdatedAt(items = []) {
    if (!Array.isArray(items) || !items.length) return '';
    let max = 0;
    for (const item of items) {
        const current = resolveUpdatedAtTimestamp(item);
        if (current > max) max = current;
    }
    return max > 0 ? new Date(max).toISOString() : '';
}

function mergeCustomersByRecency(existing = [], incoming = []) {
    const mergedById = new Map();
    const safeExisting = Array.isArray(existing) ? existing : [];
    const safeIncoming = Array.isArray(incoming) ? incoming : [];

    for (const customer of safeExisting) {
        const customerId = resolveCustomerId(customer);
        if (!customerId) continue;
        mergedById.set(customerId, customer);
    }

    for (const customer of safeIncoming) {
        const customerId = resolveCustomerId(customer);
        if (!customerId) continue;
        const previous = mergedById.get(customerId);
        if (!previous) {
            mergedById.set(customerId, customer);
            continue;
        }
        const previousTs = resolveUpdatedAtTimestamp(previous);
        const currentTs = resolveUpdatedAtTimestamp(customer);
        if (currentTs >= previousTs) {
            mergedById.set(customerId, customer);
        }
    }

    return Array.from(mergedById.values()).sort((left, right) => {
        const rightTs = resolveUpdatedAtTimestamp(right);
        const leftTs = resolveUpdatedAtTimestamp(left);
        if (rightTs !== leftTs) return rightTs - leftTs;
        return String(resolveCustomerId(left)).localeCompare(String(resolveCustomerId(right)), 'es', { sensitivity: 'base' });
    });
}

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
    const customersByTenantRef = useRef({});
    const maxUpdatedAtByTenantRef = useRef({});
    const loadTokenByTenantRef = useRef({});
    const [customersLoadProgress, setCustomersLoadProgress] = useState(0);
    const [customersLoadingBatch, setCustomersLoadingBatch] = useState(false);

    const applyCustomersState = useCallback((items = []) => {
        const nextItems = Array.isArray(items) ? items : [];
        setCustomers(nextItems);
        setSelectedCustomerId((prev) => {
            const cleanPrev = String(prev || '').trim();
            if (!cleanPrev) return '';
            const normalizedPrev = normalizeCustomerMatchId(cleanPrev);
            const exists = nextItems.some((item) => normalizeCustomerMatchId(resolveCustomerId(item)) === normalizedPrev);
            return exists ? cleanPrev : '';
        });
    }, [setCustomers, setSelectedCustomerId]);

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
            applyCustomersState([]);
            setCustomersLoadProgress(0);
            setCustomersLoadingBatch(false);
            return;
        }

        const updateLoadProgress = (loadedCount, totalCount = null) => {
            const loaded = Number.isFinite(Number(loadedCount)) ? Math.max(0, Number(loadedCount)) : 0;
            const total = Number.isFinite(Number(totalCount)) ? Math.max(0, Number(totalCount)) : null;
            if (total && total > 0) {
                const ratio = Math.min(1, loaded / total);
                setCustomersLoadProgress(Math.round(ratio * 100));
                return;
            }
            if (loaded > 0) {
                setCustomersLoadProgress((prev) => (prev > 90 ? prev : 90));
                return;
            }
            setCustomersLoadProgress(0);
        };

        setCustomersLoadingBatch(true);
        setCustomersLoadProgress(0);
        const cached = Array.isArray(customersByTenantRef.current[cleanTenantId])
            ? customersByTenantRef.current[cleanTenantId]
            : [];
        if (cached.length) {
            applyCustomersState(cached);
        }

        const pageSize = 200;
        const loadToken = String(Date.now() + Math.random());
        loadTokenByTenantRef.current[cleanTenantId] = loadToken;

        const firstPayload = await fetchTenantCustomers(requestJson, cleanTenantId, {
            limit: pageSize,
            offset: 0,
            includeInactive: true
        });
        if (loadTokenByTenantRef.current[cleanTenantId] !== loadToken) return;

        const firstBatch = Array.isArray(firstPayload?.items) ? firstPayload.items : [];
        const expectedTotalRaw = Number(firstPayload?.total);
        const expectedTotal = Number.isFinite(expectedTotalRaw) && expectedTotalRaw >= 0 ? expectedTotalRaw : null;

        const mergedFirst = mergeCustomersByRecency(cached, firstBatch);
        customersByTenantRef.current[cleanTenantId] = mergedFirst;
        maxUpdatedAtByTenantRef.current[cleanTenantId] = computeMaxUpdatedAt(mergedFirst);
        applyCustomersState(mergedFirst);
        updateLoadProgress(mergedFirst.length, expectedTotal);

        if (!firstBatch.length) {
            setCustomersLoadProgress(100);
            setCustomersLoadingBatch(false);
            return;
        }
        if (expectedTotal !== null && firstBatch.length >= expectedTotal) {
            setCustomersLoadProgress(100);
            setCustomersLoadingBatch(false);
            return;
        }

        void (async () => {
            let offset = firstBatch.length;
            try {
                while (true) {
                    if (loadTokenByTenantRef.current[cleanTenantId] !== loadToken) return;
                    if (expectedTotal !== null && offset >= expectedTotal) return;

                    const payload = await fetchTenantCustomers(requestJson, cleanTenantId, {
                        limit: pageSize,
                        offset,
                        includeInactive: true
                    });
                    if (loadTokenByTenantRef.current[cleanTenantId] !== loadToken) return;

                    const batch = Array.isArray(payload?.items) ? payload.items : [];
                    if (!batch.length) return;

                    offset += batch.length;
                    const currentCached = Array.isArray(customersByTenantRef.current[cleanTenantId])
                        ? customersByTenantRef.current[cleanTenantId]
                        : [];
                    const merged = mergeCustomersByRecency(currentCached, batch);
                    customersByTenantRef.current[cleanTenantId] = merged;
                    maxUpdatedAtByTenantRef.current[cleanTenantId] = computeMaxUpdatedAt(merged);
                    applyCustomersState(merged);
                    updateLoadProgress(offset, expectedTotal);

                    if (batch.length < pageSize && (expectedTotal === null || offset >= expectedTotal)) return;
                }
            } catch {
                // Keep first render data even if background pagination fails.
            } finally {
                if (loadTokenByTenantRef.current[cleanTenantId] === loadToken) {
                    setCustomersLoadProgress(100);
                    setCustomersLoadingBatch(false);
                }
            }
        })();
    }, [applyCustomersState, requestJson]);

    const syncCustomersDelta = useCallback(async (tenantId, { updatedSince = '' } = {}) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) return { updatedCount: 0, totalCount: 0, updatedSince: '' };

        const normalizedSince = normalizeUpdatedSince(updatedSince || maxUpdatedAtByTenantRef.current[cleanTenantId] || '');
        if (!normalizedSince) {
            const cached = Array.isArray(customersByTenantRef.current[cleanTenantId]) ? customersByTenantRef.current[cleanTenantId] : [];
            return {
                updatedCount: 0,
                totalCount: cached.length,
                updatedSince: maxUpdatedAtByTenantRef.current[cleanTenantId] || ''
            };
        }

        const pageSize = 200;
        let offset = 0;
        let expectedTotal = null;
        const deltaItems = [];

        while (true) {
            const payload = await fetchTenantCustomers(requestJson, cleanTenantId, {
                limit: pageSize,
                offset,
                includeInactive: true,
                updatedSince: normalizedSince
            });
            const batch = Array.isArray(payload?.items) ? payload.items : [];
            if (expectedTotal === null) {
                const totalRaw = Number(payload?.total);
                expectedTotal = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : null;
            }
            if (!batch.length) break;

            deltaItems.push(...batch);
            offset += batch.length;

            if (expectedTotal !== null && offset >= expectedTotal) break;
            if (batch.length < pageSize && expectedTotal === null) break;
        }

        if (deltaItems.length) {
            const cached = Array.isArray(customersByTenantRef.current[cleanTenantId])
                ? customersByTenantRef.current[cleanTenantId]
                : [];
            const merged = mergeCustomersByRecency(cached, deltaItems);
            customersByTenantRef.current[cleanTenantId] = merged;
            maxUpdatedAtByTenantRef.current[cleanTenantId] = computeMaxUpdatedAt(merged);
            applyCustomersState(merged);
        }

        const currentMax = String(maxUpdatedAtByTenantRef.current[cleanTenantId] || normalizedSince).trim();
        return {
            updatedCount: deltaItems.length,
            totalCount: Array.isArray(customersByTenantRef.current[cleanTenantId]) ? customersByTenantRef.current[cleanTenantId].length : 0,
            updatedSince: currentMax
        };
    }, [applyCustomersState, requestJson]);

    const maxCustomersUpdatedAt = useCallback((tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) return '';
        return String(maxUpdatedAtByTenantRef.current[cleanTenantId] || '').trim();
    }, []);

    const patchCustomerInCache = useCallback((tenantId, customerId, fields = {}) => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanCustomerId = String(customerId || '').trim();
        if (!cleanTenantId || !cleanCustomerId) return null;

        const cacheItems = Array.isArray(customersByTenantRef.current[cleanTenantId])
            ? customersByTenantRef.current[cleanTenantId]
            : [];
        if (!cacheItems.length) return null;

        const normalizedTargetId = normalizeCustomerMatchId(cleanCustomerId);
        let patchedItem = null;
        const nextItems = cacheItems.map((item) => {
            const itemId = normalizeCustomerMatchId(resolveCustomerId(item));
            if (!itemId || itemId !== normalizedTargetId) return item;
            const safeFields = fields && typeof fields === 'object' ? fields : {};
            const nextProfile = safeFields.profile && typeof safeFields.profile === 'object'
                ? {
                    ...(item?.profile && typeof item.profile === 'object' ? item.profile : {}),
                    ...safeFields.profile
                }
                : (item?.profile && typeof item.profile === 'object' ? item.profile : undefined);
            const nextMetadata = safeFields.metadata && typeof safeFields.metadata === 'object'
                ? {
                    ...(item?.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
                    ...safeFields.metadata
                }
                : (item?.metadata && typeof item.metadata === 'object' ? item.metadata : undefined);
            patchedItem = {
                ...item,
                ...safeFields,
                ...(nextProfile ? { profile: nextProfile } : {}),
                ...(nextMetadata ? { metadata: nextMetadata } : {})
            };
            return patchedItem;
        });

        if (!patchedItem) return null;
        const merged = mergeCustomersByRecency([], nextItems);
        customersByTenantRef.current[cleanTenantId] = merged;
        maxUpdatedAtByTenantRef.current[cleanTenantId] = computeMaxUpdatedAt(merged);
        return patchedItem;
    }, []);

    return {
        refreshOverview,
        loadTenantSettings,
        loadTenantIntegrations,
        loadWaModules,
        loadCustomers,
        syncCustomersDelta,
        maxCustomersUpdatedAt,
        patchCustomerInCache,
        customersLoadProgress,
        customersLoadingBatch
    };
}
