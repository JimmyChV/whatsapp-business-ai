import { useCallback, useMemo, useState } from 'react';
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
    initialFilters = {}
} = {}) {
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
            setFilters((prev) => normalizeFilters({ ...prev, ...query }));
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
