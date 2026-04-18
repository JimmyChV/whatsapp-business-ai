import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { fetchTenantLabels } from '../services/labels.service';
import {
    cancelCampaign as cancelCampaignApi,
    createCampaign as createCampaignApi,
    estimateCampaign as estimateCampaignApi,
    getCampaignDetail,
    listCampaignEvents as listCampaignEventsApi,
    listCampaignRecipients as listCampaignRecipientsApi,
    listCampaigns as listCampaignsApi,
    pauseCampaign as pauseCampaignApi,
    resumeCampaign as resumeCampaignApi,
    startCampaign as startCampaignApi,
    updateCampaign as updateCampaignApi
} from '../services/campaigns.service';

const DEFAULT_FILTERS = Object.freeze({
    scopeModuleId: '',
    moduleId: '',
    status: '',
    query: '',
    limit: 50,
    offset: 0
});

const campaignsCacheByRequestJson = new WeakMap();
const campaignsFallbackCache = {
    items: [],
    total: 0,
    loaded: false
};

function toText(value = '') {
    return String(value || '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function normalizeFilters(input = {}) {
    const scopeModuleId = toLower(input?.scopeModuleId || '');
    const moduleId = toText(input?.moduleId || '');
    const status = toLower(input?.status || '');
    const query = toText(input?.query || input?.q || '');
    const limit = Number(input?.limit);
    const offset = Number(input?.offset);
    return {
        scopeModuleId,
        moduleId,
        status,
        query,
        limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50,
        offset: Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0
    };
}

function sortCampaigns(items = []) {
    return [...items].sort((left, right) => {
        const leftUpdated = Date.parse(left?.updatedAt || left?.createdAt || 0) || 0;
        const rightUpdated = Date.parse(right?.updatedAt || right?.createdAt || 0) || 0;
        if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;
        return String(left?.campaignName || '').localeCompare(String(right?.campaignName || ''), 'es', { sensitivity: 'base' });
    });
}

function patchCampaignArray(items = [], patch = null) {
    if (!patch || typeof patch !== 'object') return items;
    const campaignId = toText(patch?.campaignId || '');
    if (!campaignId) return items;
    let found = false;
    const next = items.map((item) => {
        const itemId = toText(item?.campaignId || '');
        if (itemId !== campaignId) return item;
        found = true;
        return { ...item, ...patch };
    });
    return found ? sortCampaigns(next) : sortCampaigns([patch, ...next]);
}

function resolveCampaignsCache(requestJson) {
    if (typeof requestJson !== 'function') return campaignsFallbackCache;
    let cacheEntry = campaignsCacheByRequestJson.get(requestJson);
    if (!cacheEntry) {
        cacheEntry = { items: [], total: 0, loaded: false };
        campaignsCacheByRequestJson.set(requestJson, cacheEntry);
    }
    return cacheEntry;
}

export default function useSaasCampaignsController({
    requestJson = null,
    socket = null,
    tenantId = '',
    initialFilters = {}
} = {}) {
    const { notify } = useUiFeedback();
    const cacheRef = useRef(resolveCampaignsCache(requestJson));
    const campaignsRef = useRef(cacheRef.current.items);
    const [filters, setFilters] = useState(() => normalizeFilters({ ...DEFAULT_FILTERS, ...initialFilters }));
    const filtersRef = useRef(filters);
    const [campaigns, setCampaigns] = useState(() => cacheRef.current.items);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [total, setTotal] = useState(() => cacheRef.current.total);
    const [hasLoadedCampaigns, setHasLoadedCampaigns] = useState(() => Boolean(cacheRef.current.loaded));
    const [recipients, setRecipients] = useState([]);
    const [events, setEvents] = useState([]);
    const [availableLabels, setAvailableLabels] = useState([]);
    const [reachEstimate, setReachEstimate] = useState(null);
    const [loadingList, setLoadingList] = useState(false);
    const [loadingAction, setLoadingAction] = useState(false);
    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [estimating, setEstimating] = useState(false);
    const [error, setError] = useState('');

    const selectedCampaignId = toText(selectedCampaign?.campaignId || '');

    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    useEffect(() => {
        campaignsRef.current = Array.isArray(campaigns) ? campaigns : [];
    }, [campaigns]);

    useEffect(() => {
        cacheRef.current = resolveCampaignsCache(requestJson);
        setCampaigns(cacheRef.current.items);
        campaignsRef.current = Array.isArray(cacheRef.current.items) ? cacheRef.current.items : [];
        setTotal(cacheRef.current.total);
        setHasLoadedCampaigns(Boolean(cacheRef.current.loaded));
    }, [requestJson]);

    const writeCache = useCallback((nextItems, nextTotal, loaded = true) => {
        cacheRef.current.items = Array.isArray(nextItems) ? nextItems : [];
        campaignsRef.current = cacheRef.current.items;
        cacheRef.current.total = Number.isFinite(Number(nextTotal))
            ? Math.max(0, Number(nextTotal))
            : cacheRef.current.items.length;
        cacheRef.current.loaded = Boolean(loaded);
    }, []);

    const patchFilters = useCallback((patch) => {
        setFilters((prev) => {
            const patchValue = typeof patch === 'function' ? patch(prev) : patch;
            return normalizeFilters({ ...prev, ...(patchValue && typeof patchValue === 'object' ? patchValue : {}) });
        });
    }, []);

    const clearError = useCallback(() => {
        setError('');
    }, []);

    const patchCampaignState = useCallback((patch = null) => {
        if (!patch || typeof patch !== 'object') return;
        setCampaigns((prev) => {
            const next = patchCampaignArray(prev, patch);
            writeCache(next, Math.max(Number(cacheRef.current.total) || 0, next.length));
            return next;
        });
        setSelectedCampaign((prev) => {
            const prevId = toText(prev?.campaignId || '');
            const patchId = toText(patch?.campaignId || '');
            if (!patchId || prevId !== patchId) return prev;
            return { ...prev, ...patch };
        });
    }, [writeCache]);

    const loadCampaigns = useCallback(async (overrideFilters = null) => {
        if (typeof requestJson !== 'function') return { items: [], total: 0, limit: 0, offset: 0 };

        setLoadingList(!cacheRef.current.loaded && cacheRef.current.items.length === 0);
        setError('');
        try {
            const nextFilters = normalizeFilters({
                ...(filtersRef.current || DEFAULT_FILTERS),
                ...(overrideFilters && typeof overrideFilters === 'object' ? overrideFilters : {})
            });
            const response = await listCampaignsApi(requestJson, nextFilters);
            const nextItems = Array.isArray(response?.items) ? response.items : [];
            const nextTotal = Number.isFinite(Number(response?.total)) ? Math.max(0, Number(response.total)) : nextItems.length;
            const sortedItems = sortCampaigns(nextItems);
            writeCache(sortedItems, nextTotal, true);
            setCampaigns(sortedItems);
            setTotal(nextTotal);
            setHasLoadedCampaigns(true);
            if (selectedCampaignId) {
                const matched = sortedItems.find((item) => toText(item?.campaignId || '') === selectedCampaignId);
                if (matched) setSelectedCampaign(matched);
            }
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudieron cargar campañas.');
            setError(message);
            throw err;
        } finally {
            setLoadingList(false);
        }
    }, [requestJson, selectedCampaignId, writeCache]);

    const loadAvailableLabels = useCallback(async (overrideTenantId = '') => {
        if (typeof requestJson !== 'function') return { items: [] };
        const cleanTenantId = toText(overrideTenantId || tenantId);
        if (!cleanTenantId) {
            setAvailableLabels([]);
            return { items: [] };
        }

        try {
            const response = await fetchTenantLabels(requestJson, cleanTenantId, { includeInactive: false });
            const items = Array.isArray(response?.items) ? response.items : [];
            setAvailableLabels(items);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudieron cargar etiquetas para campanas.');
            setError(message);
            throw err;
        }
    }, [requestJson, tenantId]);

    const estimateReach = useCallback(async (filtersPayload = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const payload = filtersPayload && typeof filtersPayload === 'object' && !Array.isArray(filtersPayload)
            ? filtersPayload
            : {};

        setEstimating(true);
        setError('');
        try {
            const response = await estimateCampaignApi(requestJson, payload);
            const estimate = response?.estimate && typeof response.estimate === 'object'
                ? response.estimate
                : null;
            setReachEstimate(estimate);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudo estimar el alcance de la campana.');
            setError(message);
            throw err;
        } finally {
            setEstimating(false);
        }
    }, [requestJson]);

    const selectCampaign = useCallback(async (campaignId = '', { loadDetail = true } = {}) => {
        const cleanCampaignId = toText(campaignId);
        if (!cleanCampaignId) {
            setSelectedCampaign(null);
            return null;
        }

        const fromList = (Array.isArray(campaignsRef.current) ? campaignsRef.current : [])
            .find((item) => toText(item?.campaignId || '') === cleanCampaignId) || null;
        if (!loadDetail || typeof requestJson !== 'function') {
            setSelectedCampaign(fromList);
            return fromList;
        }

        setLoadingAction(true);
        setError('');
        try {
            const response = await getCampaignDetail(requestJson, { campaignId: cleanCampaignId });
            const campaign = response?.campaign && typeof response.campaign === 'object' ? response.campaign : fromList;
            if (campaign) {
                patchCampaignState(campaign);
                setSelectedCampaign(campaign);
            }
            return campaign || null;
        } catch (err) {
            const message = String(err?.message || 'No se pudo cargar el detalle de campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingAction(false);
        }
    }, [patchCampaignState, requestJson]);

    const createCampaign = useCallback(async (payload = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        setLoadingAction(true);
        setError('');
        try {
            const response = await createCampaignApi(requestJson, payload);
            const campaign = response?.campaign && typeof response.campaign === 'object' ? response.campaign : null;
            if (campaign) {
                patchCampaignState(campaign);
                setTotal((prev) => {
                    const nextTotal = Math.max(0, Number(prev) || 0) + 1;
                    writeCache(cacheRef.current.items, nextTotal);
                    return nextTotal;
                });
                setSelectedCampaign(campaign);
            }
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudo crear la campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingAction(false);
        }
    }, [patchCampaignState, requestJson, writeCache]);

    const updateCampaign = useCallback(async ({ campaignId, patch = {} } = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        setLoadingAction(true);
        setError('');
        try {
            const response = await updateCampaignApi(requestJson, { campaignId, patch });
            const campaign = response?.campaign && typeof response.campaign === 'object' ? response.campaign : null;
            if (campaign) patchCampaignState(campaign);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudo actualizar la campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingAction(false);
        }
    }, [patchCampaignState, requestJson]);

    const startCampaign = useCallback(async (campaignId = '') => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');
        setLoadingAction(true);
        setError('');
        try {
            const response = await startCampaignApi(requestJson, { campaignId: cleanCampaignId });
            const campaign = response?.campaign && typeof response.campaign === 'object' ? response.campaign : null;
            if (campaign) patchCampaignState(campaign);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudo iniciar la campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingAction(false);
        }
    }, [patchCampaignState, requestJson, selectedCampaignId]);

    const pauseCampaign = useCallback(async (campaignId = '') => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');
        setLoadingAction(true);
        setError('');
        try {
            const response = await pauseCampaignApi(requestJson, { campaignId: cleanCampaignId });
            const campaign = response?.campaign && typeof response.campaign === 'object' ? response.campaign : null;
            if (campaign) patchCampaignState(campaign);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudo pausar la campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingAction(false);
        }
    }, [patchCampaignState, requestJson, selectedCampaignId]);

    const resumeCampaign = useCallback(async (campaignId = '') => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');
        setLoadingAction(true);
        setError('');
        try {
            const response = await resumeCampaignApi(requestJson, { campaignId: cleanCampaignId });
            const campaign = response?.campaign && typeof response.campaign === 'object' ? response.campaign : null;
            if (campaign) patchCampaignState(campaign);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudo reanudar la campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingAction(false);
        }
    }, [patchCampaignState, requestJson, selectedCampaignId]);

    const cancelCampaign = useCallback(async (campaignId = '', reason = '') => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');
        setLoadingAction(true);
        setError('');
        try {
            const response = await cancelCampaignApi(requestJson, { campaignId: cleanCampaignId, reason });
            const campaign = response?.campaign && typeof response.campaign === 'object' ? response.campaign : null;
            if (campaign) patchCampaignState(campaign);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudo cancelar la campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingAction(false);
        }
    }, [patchCampaignState, requestJson, selectedCampaignId]);

    const loadRecipients = useCallback(async ({
        campaignId = '',
        status = '',
        moduleId = '',
        search = '',
        limit = 100,
        offset = 0
    } = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');

        setLoadingRecipients(true);
        setError('');
        try {
            const response = await listCampaignRecipientsApi(requestJson, {
                campaignId: cleanCampaignId,
                status,
                moduleId,
                search,
                limit,
                offset
            });
            setRecipients(Array.isArray(response?.items) ? response.items : []);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudieron cargar destinatarios de campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingRecipients(false);
        }
    }, [requestJson, selectedCampaignId]);

    const loadEvents = useCallback(async ({
        campaignId = '',
        eventType = '',
        severity = '',
        limit = 100,
        offset = 0
    } = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');

        setLoadingEvents(true);
        setError('');
        try {
            const response = await listCampaignEventsApi(requestJson, {
                campaignId: cleanCampaignId,
                eventType,
                severity,
                limit,
                offset
            });
            setEvents(Array.isArray(response?.items) ? response.items : []);
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudieron cargar eventos de campaña.');
            setError(message);
            throw err;
        } finally {
            setLoadingEvents(false);
        }
    }, [requestJson, selectedCampaignId]);

    useEffect(() => {
        if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') return undefined;

        const handleCampaignStatusUpdated = (payload = {}) => {
            const incoming = payload?.campaign && typeof payload.campaign === 'object'
                ? payload.campaign
                : {
                    campaignId: toText(payload?.campaignId || ''),
                    status: toLower(payload?.status || '')
                };
            patchCampaignState(incoming);

            const nextStatus = toLower(payload?.status || incoming?.status || '');
            if (nextStatus === 'completed' && typeof notify === 'function') {
                notify({ type: 'info', message: `Campaña completada: ${toText(incoming?.campaignName || incoming?.campaignId || 'sin nombre')}` });
            }
            if (nextStatus === 'failed' && typeof notify === 'function') {
                notify({ type: 'warn', message: `Campaña con fallos: ${toText(incoming?.campaignName || incoming?.campaignId || 'sin nombre')}` });
            }
        };

        const handleCampaignProgressUpdated = (payload = {}) => {
            if (payload?.campaign && typeof payload.campaign === 'object') {
                patchCampaignState(payload.campaign);
            }
            const eventCampaignId = toText(payload?.campaignId || payload?.campaign?.campaignId || '');
            const recipient = payload?.recipient && typeof payload.recipient === 'object' ? payload.recipient : null;
            if (!eventCampaignId || !recipient || eventCampaignId !== selectedCampaignId) return;

            const recipientId = toText(recipient?.recipientId || '');
            if (!recipientId) return;

            setRecipients((prev) => {
                if (!Array.isArray(prev) || prev.length === 0) return prev;
                let changed = false;
                const next = prev.map((item) => {
                    const itemId = toText(item?.recipientId || '');
                    if (itemId !== recipientId) return item;
                    changed = true;
                    return { ...item, ...recipient };
                });
                return changed ? next : prev;
            });
        };

        socket.on('campaign_status_updated', handleCampaignStatusUpdated);
        socket.on('campaign_progress_updated', handleCampaignProgressUpdated);

        return () => {
            socket.off('campaign_status_updated', handleCampaignStatusUpdated);
            socket.off('campaign_progress_updated', handleCampaignProgressUpdated);
        };
    }, [notify, patchCampaignState, selectedCampaignId, socket]);

    useEffect(() => {
        const cleanTenantId = toText(tenantId);
        if (!cleanTenantId) {
            setAvailableLabels([]);
            return;
        }
        loadAvailableLabels(cleanTenantId).catch(() => { });
    }, [loadAvailableLabels, tenantId]);

    const statusCounts = useMemo(() => {
        const counts = {
            total: Number(total) || campaigns.length || 0,
            draft: 0,
            scheduled: 0,
            running: 0,
            paused: 0,
            completed: 0,
            cancelled: 0,
            failed: 0
        };
        campaigns.forEach((campaign) => {
            const status = toLower(campaign?.status || '');
            if (status && Object.prototype.hasOwnProperty.call(counts, status)) {
                counts[status] += 1;
            }
        });
        return counts;
    }, [campaigns, total]);

    return {
        filters,
        setFilters: patchFilters,
        campaigns,
        selectedCampaign,
        selectedCampaignId,
        total,
        recipients,
        events,
        availableLabels,
        reachEstimate,
        loading: loadingAction,
        loadingList,
        loadingRecipients,
        loadingEvents,
        estimating,
        error,
        clearError,
        statusCounts,
        hasLoadedCampaigns,
        loadCampaigns,
        loadAvailableLabels,
        estimateReach,
        selectCampaign,
        createCampaign,
        updateCampaign,
        startCampaign,
        pauseCampaign,
        resumeCampaign,
        cancelCampaign,
        loadRecipients,
        loadEvents
    };
}
