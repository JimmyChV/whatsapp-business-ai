import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSaasUiPreference, saveSaasUiPreference } from '../../services/uiPreferences.service';
import { normalizeSortState } from './sortUtils';

const STORAGE_PREFIX = 'saas.viewPrefs';

const normalizeKeys = (columns = []) => (
    columns
        .filter((column) => (typeof column === 'string' ? true : column?.configurable !== false))
        .map((column) => (typeof column === 'string' ? column : column?.key))
        .map((key) => String(key || '').trim())
        .filter(Boolean)
);

const normalizePrefs = (value = {}, defaultKeys = [], availableKeys = defaultKeys) => {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const allowedKeys = Array.isArray(availableKeys) && availableKeys.length ? availableKeys : defaultKeys;
    const visible = Array.isArray(source.visibleColumnKeys)
        ? source.visibleColumnKeys.map((key) => String(key || '').trim()).filter((key) => allowedKeys.includes(key))
        : [];
    const order = Array.isArray(source.columnOrder)
        ? source.columnOrder.map((key) => String(key || '').trim()).filter((key) => allowedKeys.includes(key))
        : [];
    const normalizedSort = normalizeSortState(
        source?.sort && typeof source.sort === 'object'
            ? source.sort
            : {
                columnKey: source?.sortColumnKey,
                direction: source?.sortDirection
            }
    );
    return {
        visibleColumnKeys: visible.length ? visible : defaultKeys,
        columnOrder: [...order, ...allowedKeys.filter((key) => !order.includes(key))],
        sort: normalizedSort
    };
};

const readLocal = (storageKey, fallback, availableKeys) => {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? normalizePrefs(JSON.parse(raw), fallback.visibleColumnKeys || [], availableKeys) : fallback;
    } catch {
        return fallback;
    }
};

const writeLocal = (storageKey, prefs) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
        // local persistence is best-effort
    }
};

export default function useSaasViewPreferences(sectionKey, defaultColumns = [], options = {}) {
    const requestJson = typeof options?.requestJson === 'function' ? options.requestJson : null;
    const defaultKeys = useMemo(() => normalizeKeys(defaultColumns), [defaultColumns]);
    const availableKeys = useMemo(
        () => normalizeKeys(options?.availableColumns || options?.allColumns || defaultColumns),
        [defaultColumns, options?.allColumns, options?.availableColumns]
    );
    const storageKey = useMemo(() => `${STORAGE_PREFIX}.${String(sectionKey || 'default').trim()}`, [sectionKey]);
    const fallbackPrefs = useMemo(() => normalizePrefs({}, defaultKeys, availableKeys), [availableKeys, defaultKeys]);
    const [preferences, setPreferences] = useState(() => readLocal(storageKey, fallbackPrefs, availableKeys));
    const loadedRef = useRef(false);
    const userTouchedRef = useRef(false);

    useEffect(() => {
        setPreferences((prev) => normalizePrefs(prev, defaultKeys, availableKeys));
    }, [availableKeys, defaultKeys]);

    useEffect(() => {
        let cancelled = false;
        loadedRef.current = false;
        userTouchedRef.current = false;
        const load = async () => {
            const localPrefs = readLocal(storageKey, fallbackPrefs, availableKeys);
            if (!cancelled) setPreferences(localPrefs);
            if (!requestJson) {
                loadedRef.current = true;
                return;
            }
            try {
                const remote = await fetchSaasUiPreference(requestJson, sectionKey);
                const remotePrefs = normalizePrefs(remote?.preferencesJson || {}, defaultKeys, availableKeys);
                if (!cancelled && !userTouchedRef.current) {
                    setPreferences(remotePrefs);
                    writeLocal(storageKey, remotePrefs);
                }
            } catch {
                // keep local fallback
            } finally {
                loadedRef.current = true;
            }
        };
        load();
        return () => { cancelled = true; };
    }, [availableKeys, defaultKeys, fallbackPrefs, requestJson, sectionKey, storageKey]);

    useEffect(() => {
        writeLocal(storageKey, preferences);
        if (!requestJson || !loadedRef.current) return undefined;
        const timer = setTimeout(() => {
            saveSaasUiPreference(requestJson, sectionKey, preferences).catch(() => {});
        }, 1000);
        return () => clearTimeout(timer);
    }, [preferences, requestJson, sectionKey, storageKey]);

    const setVisibleColumnKeys = useCallback((nextValue) => {
        userTouchedRef.current = true;
        setPreferences((prev) => {
            const next = typeof nextValue === 'function' ? nextValue(prev.visibleColumnKeys) : nextValue;
            return normalizePrefs({ ...prev, visibleColumnKeys: next }, defaultKeys, availableKeys);
        });
    }, [availableKeys, defaultKeys]);

    const toggleColumn = useCallback((columnKey) => {
        const normalized = String(columnKey || '').trim();
        if (!normalized) return;
        setVisibleColumnKeys((prev = []) => {
            const current = Array.isArray(prev) ? prev : [];
            if (current.includes(normalized)) {
                const next = current.filter((key) => key !== normalized);
                return next.length ? next : current;
            }
            return [...current, normalized];
        });
    }, [setVisibleColumnKeys]);

    const setSort = useCallback((sort) => {
        userTouchedRef.current = true;
        setPreferences((prev) => normalizePrefs({
            ...prev,
            sort: typeof sort === 'function' ? sort(prev.sort) : sort
        }, defaultKeys, availableKeys));
    }, [availableKeys, defaultKeys]);

    const setColumnOrder = useCallback((columnOrder) => {
        userTouchedRef.current = true;
        setPreferences((prev) => normalizePrefs({ ...prev, columnOrder }, defaultKeys, availableKeys));
    }, [availableKeys, defaultKeys]);

    const reset = useCallback(() => {
        userTouchedRef.current = true;
        setPreferences(fallbackPrefs);
    }, [fallbackPrefs]);

    const isColumnVisible = useCallback(
        (columnKey) => preferences.visibleColumnKeys.includes(String(columnKey || '').trim()),
        [preferences.visibleColumnKeys]
    );

    return {
        ...preferences,
        setVisibleColumnKeys,
        toggleColumn,
        isColumnVisible,
        setSort,
        setColumnOrder,
        reset,
        resetColumns: reset,
        storageKey
    };
}
