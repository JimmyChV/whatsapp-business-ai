import { useCallback, useEffect, useMemo, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import {
    createMetaTemplate,
    deleteMetaTemplate,
    listMetaTemplates,
    syncMetaTemplates
} from '../services/metaTemplates.service';

const DEFAULT_FILTERS = Object.freeze({
    scopeModuleId: '',
    status: '',
    search: '',
    limit: 50,
    offset: 0
});

const STATUS_OPTIONS = Object.freeze([
    '',
    'approved',
    'pending',
    'rejected',
    'paused',
    'disabled',
    'archived'
]);

function normalizeFilters(value = {}) {
    const scopeModuleId = String(value?.scopeModuleId || '').trim().toLowerCase();
    const statusCandidate = String(value?.status || '').trim().toLowerCase();
    const status = STATUS_OPTIONS.includes(statusCandidate) ? statusCandidate : '';
    const search = String(value?.search || '').trim().toLowerCase();
    const limit = Number(value?.limit);
    const offset = Number(value?.offset);

    return {
        scopeModuleId,
        status,
        search,
        limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50,
        offset: Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0
    };
}

function sortTemplates(items = []) {
    return [...items].sort((left, right) => {
        const leftUpdated = Date.parse(left?.updatedAt || left?.createdAt || 0) || 0;
        const rightUpdated = Date.parse(right?.updatedAt || right?.createdAt || 0) || 0;
        if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;
        return String(left?.templateName || '').localeCompare(String(right?.templateName || ''), 'es', { sensitivity: 'base' });
    });
}

export default function useSaasMetaTemplatesController({
    requestJson = null,
    socket = null,
    initialFilters = {}
} = {}) {
    const { notify } = useUiFeedback();
    const [filters, setFilters] = useState(() => normalizeFilters({ ...DEFAULT_FILTERS, ...initialFilters }));
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);

    const [loadingList, setLoadingList] = useState(false);
    const [loadingCreate, setLoadingCreate] = useState(false);
    const [loadingDeleteById, setLoadingDeleteById] = useState({});
    const [loadingSync, setLoadingSync] = useState(false);

    const [listError, setListError] = useState('');
    const [createError, setCreateError] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [syncError, setSyncError] = useState('');

    const patchFilters = useCallback((patch) => {
        setFilters((prev) => {
            const patchValue = typeof patch === 'function' ? patch(prev) : patch;
            return normalizeFilters({ ...prev, ...(patchValue && typeof patchValue === 'object' ? patchValue : {}) });
        });
    }, []);

    const clearErrors = useCallback(() => {
        setListError('');
        setCreateError('');
        setDeleteError('');
        setSyncError('');
    }, []);

    const loadTemplates = useCallback(async (overrideFilters = null) => {
        if (typeof requestJson !== 'function') return { items: [], total: 0, limit: 0, offset: 0 };

        setLoadingList(true);
        setListError('');
        try {
            const query = normalizeFilters({
                ...filters,
                ...(overrideFilters && typeof overrideFilters === 'object' ? overrideFilters : {})
            });
            const response = await listMetaTemplates(requestJson, query);
            const nextItems = Array.isArray(response?.items) ? response.items : [];
            const nextTotal = Number.isFinite(Number(response?.total)) ? Math.max(0, Number(response.total)) : nextItems.length;
            setItems(sortTemplates(nextItems));
            setTotal(nextTotal);
            return response;
        } catch (error) {
            const message = String(error?.message || 'No se pudieron cargar templates Meta.');
            setListError(message);
            throw error;
        } finally {
            setLoadingList(false);
        }
    }, [filters, requestJson]);

    const createTemplate = useCallback(async ({ moduleId, templatePayload, reload = true } = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');

        setLoadingCreate(true);
        setCreateError('');
        try {
            const response = await createMetaTemplate(requestJson, { moduleId, templatePayload });
            const createdTemplate = response?.template && typeof response.template === 'object'
                ? response.template
                : null;

            if (createdTemplate) {
                setItems((prev) => sortTemplates([createdTemplate, ...prev]));
                setTotal((prev) => Math.max(Number(prev) || 0, 0) + 1);
            }

            if (reload) await loadTemplates();
            return response;
        } catch (error) {
            const message = String(error?.message || 'No se pudo crear el template Meta.');
            setCreateError(message);
            throw error;
        } finally {
            setLoadingCreate(false);
        }
    }, [loadTemplates, requestJson]);

    const removeTemplate = useCallback(async ({ templateId, moduleId = '', reload = true } = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');
        const key = String(templateId || '').trim();
        if (!key) throw new Error('templateId requerido.');

        setLoadingDeleteById((prev) => ({ ...prev, [key]: true }));
        setDeleteError('');
        try {
            const response = await deleteMetaTemplate(requestJson, { templateId: key, moduleId });
            setItems((prev) => prev.filter((entry) => String(entry?.templateId || '') !== key));
            setTotal((prev) => Math.max((Number(prev) || 1) - 1, 0));
            if (reload) await loadTemplates();
            return response;
        } catch (error) {
            const message = String(error?.message || 'No se pudo eliminar el template Meta.');
            setDeleteError(message);
            throw error;
        } finally {
            setLoadingDeleteById((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    }, [loadTemplates, requestJson]);

    const syncTemplates = useCallback(async ({ moduleId, reload = true } = {}) => {
        if (typeof requestJson !== 'function') throw new Error('requestJson no disponible.');

        setLoadingSync(true);
        setSyncError('');
        try {
            const response = await syncMetaTemplates(requestJson, { moduleId });
            if (reload) {
                await loadTemplates({
                    scopeModuleId: String(moduleId || '').trim().toLowerCase() || filters.scopeModuleId
                });
            }
            return response;
        } catch (error) {
            const message = String(error?.message || 'No se pudo sincronizar templates Meta.');
            setSyncError(message);
            throw error;
        } finally {
            setLoadingSync(false);
        }
    }, [filters.scopeModuleId, loadTemplates, requestJson]);

    const visibleItems = useMemo(() => {
        const term = String(filters.search || '').trim().toLowerCase();
        if (!term) return items;
        return items.filter((item) => {
            const name = String(item?.templateName || '').toLowerCase();
            const category = String(item?.category || '').toLowerCase();
            const language = String(item?.templateLanguage || '').toLowerCase();
            return name.includes(term) || category.includes(term) || language.includes(term);
        });
    }, [filters.search, items]);

    const loading = loadingList || loadingCreate || loadingSync || Object.keys(loadingDeleteById).length > 0;

    useEffect(() => {
        if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') return undefined;

        const handleMetaTemplateStatusUpdated = (payload = {}) => {
            const eventTemplateName = String(payload?.templateName || '').trim().toLowerCase();
            const eventScopeModuleId = String(payload?.scopeModuleId || '').trim().toLowerCase();
            const eventStatus = String(payload?.newStatus || payload?.status || '').trim().toLowerCase();
            const eventReason = String(payload?.reason || '').trim();
            const eventTimestamp = String(payload?.generatedAt || '').trim() || new Date().toISOString();
            const reconciledItems = Array.isArray(payload?.reconciliation?.items) ? payload.reconciliation.items : [];
            const reconciledByTemplateId = new Map(
                reconciledItems
                    .map((entry) => [String(entry?.templateId || '').trim(), entry])
                    .filter(([templateId]) => Boolean(templateId))
            );

            let toastToShow = null;
            let didUpdate = false;

            setItems((prev) => {
                if (!Array.isArray(prev) || prev.length === 0) return prev;

                const next = prev.map((item) => {
                    const itemTemplateId = String(item?.templateId || '').trim();
                    const matchedById = itemTemplateId ? reconciledByTemplateId.get(itemTemplateId) : null;
                    const itemName = String(item?.templateName || '').trim().toLowerCase();
                    const itemScopeModuleId = String(item?.scopeModuleId || '').trim().toLowerCase();
                    const matchedByName = !matchedById
                        && Boolean(eventTemplateName)
                        && itemName === eventTemplateName
                        && (!eventScopeModuleId || !itemScopeModuleId || itemScopeModuleId === eventScopeModuleId);

                    if (!matchedById && !matchedByName) return item;

                    const merged = matchedById && typeof matchedById === 'object'
                        ? { ...item, ...matchedById }
                        : {
                            ...item,
                            status: eventStatus || item?.status,
                            rejectionReason: eventReason || item?.rejectionReason,
                            updatedAt: eventTimestamp
                        };

                    const prevStatus = String(item?.status || '').trim().toLowerCase();
                    const nextStatus = String(merged?.status || '').trim().toLowerCase();
                    if (prevStatus !== nextStatus && (nextStatus === 'approved' || nextStatus === 'rejected')) {
                        const templateLabel = String(merged?.templateName || item?.templateName || '').trim() || 'Template';
                        toastToShow = {
                            type: nextStatus === 'approved' ? 'info' : 'warn',
                            message: nextStatus === 'approved'
                                ? `Template aprobado: ${templateLabel}`
                                : `Template rechazado: ${templateLabel}`
                        };
                    }

                    didUpdate = true;
                    return merged;
                });

                return didUpdate ? sortTemplates(next) : prev;
            });

            if (toastToShow && typeof notify === 'function') {
                notify(toastToShow);
            }
        };

        socket.on('meta_template_status_updated', handleMetaTemplateStatusUpdated);
        return () => {
            socket.off('meta_template_status_updated', handleMetaTemplateStatusUpdated);
        };
    }, [notify, socket]);

    return {
        filters,
        setFilters: patchFilters,
        statusOptions: STATUS_OPTIONS,

        items,
        visibleItems,
        total,

        loading,
        loadingList,
        loadingCreate,
        loadingDeleteById,
        loadingSync,

        listError,
        createError,
        deleteError,
        syncError,
        clearErrors,

        loadTemplates,
        createTemplate,
        removeTemplate,
        syncTemplates
    };
}
