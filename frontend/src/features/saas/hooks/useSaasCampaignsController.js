import { useCallback, useEffect, useMemo, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import {
    cancelCampaign as cancelCampaignApi,
    createCampaign as createCampaignApi,
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

export default function useSaasCampaignsController({
    requestJson = null,
    socket = null,
    initialFilters = {}
} = {}) {
    const { notify } = useUiFeedback();
    const [filters, setFilters] = useState(() => normalizeFilters({ ...DEFAULT_FILTERS, ...initialFilters }));
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [total, setTotal] = useState(0);
    const [recipients, setRecipients] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [error, setError] = useState('');

    const selectedCampaignId = toText(selectedCampaign?.campaignId || '');

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
        setCampaigns((prev) => patchCampaignArray(prev, patch));
        setSelectedCampaign((prev) => {
            const prevId = toText(prev?.campaignId || '');
            const patchId = toText(patch?.campaignId || '');
            if (!patchId || prevId !== patchId) return prev;
            return { ...prev, ...patch };
        });
    }, []);

    const loadCampaigns = useCallback(async (overrideFilters = null) => {
        if (typeof requestJson !== 'function') return { items: [], total: 0, limit: 0, offset: 0 };

        setLoading(true);
        setError('');
        try {
            const nextFilters = normalizeFilters({
                ...filters,
                ...(overrideFilters && typeof overrideFilters === 'object' ? overrideFilters : {})
            });
            const response = await listCampaignsApi(requestJson, nextFilters);
            const nextItems = Array.isArray(response?.items) ? response.items : [];
            const nextTotal = Number.isFinite(Number(response?.total)) ? Math.max(0, Number(response.total)) : nextItems.length;
            setCampaigns(sortCampaigns(nextItems));
            setTotal(nextTotal);
            if (selectedCampaignId) {
                const matched = nextItems.find((item) => toText(item?.campaignId || '') === selectedCampaignId);
                if (matched) setSelectedCampaign(matched);
            }
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudieron cargar campañas.');
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [filters, requestJson, selectedCampaignId]);

    const selectCampaign = useCallback(async (campaignId = '', { loadDetail = true } = {}) => {
        const cleanCampaignId = toText(campaignId);
        if (!cleanCampaignId) {
            setSelectedCampaign(null);
            return null;
        }

        const fromList = campaigns.find((item) => toText(item?.campaignId || '') === cleanCampaignId) || null;
        if (!loadDetail || typeof requestJson !== 'function') {
            setSelectedCampaign(fromList);
            return fromList;
        }

        setLoading(true);
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
            setLoading(false);
        }
    }, [campaigns, patchCampaignState, requestJson]);

    const createCampaign = useCallback(async (payload = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        setLoading(true);
        setError('');
        try {
            const response = await createCampaignApi(requestJson, payload);
            const campaign = response?.campaign && typeof response.campaign === 'object' ? response.campaign : null;
            if (campaign) {
                patchCampaignState(campaign);
                setTotal((prev) => Math.max(0, Number(prev) || 0) + 1);
                setSelectedCampaign(campaign);
            }
            return response;
        } catch (err) {
            const message = String(err?.message || 'No se pudo crear la campaña.');
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [patchCampaignState, requestJson]);

    const updateCampaign = useCallback(async ({ campaignId, patch = {} } = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        setLoading(true);
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
            setLoading(false);
        }
    }, [patchCampaignState, requestJson]);

    const startCampaign = useCallback(async (campaignId = '') => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');
        setLoading(true);
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
            setLoading(false);
        }
    }, [patchCampaignState, requestJson, selectedCampaignId]);

    const pauseCampaign = useCallback(async (campaignId = '') => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');
        setLoading(true);
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
            setLoading(false);
        }
    }, [patchCampaignState, requestJson, selectedCampaignId]);

    const resumeCampaign = useCallback(async (campaignId = '') => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');
        setLoading(true);
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
            setLoading(false);
        }
    }, [patchCampaignState, requestJson, selectedCampaignId]);

    const cancelCampaign = useCallback(async (campaignId = '', reason = '') => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const cleanCampaignId = toText(campaignId || selectedCampaignId);
        if (!cleanCampaignId) throw new Error('campaignId requerido.');
        setLoading(true);
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
            setLoading(false);
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
        loading,
        loadingRecipients,
        loadingEvents,
        error,
        clearError,
        statusCounts,
        loadCampaigns,
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

