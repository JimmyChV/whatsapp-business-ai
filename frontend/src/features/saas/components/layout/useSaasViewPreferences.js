import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchSaasUiPreference, saveSaasUiPreference } from '../../services/uiPreferences.service';

const STORAGE_PREFIX = 'saas.viewPrefs';

const normalizeKeys = (columns = []) => (
    columns
        .filter((column) => (typeof column === 'string' ? true : column?.configurable !== false))
        .map((column) => (typeof column === 'string' ? column : column?.key))
        .map((key) => String(key || '').trim())
        .filter(Boolean)
);

const normalizePrefs = (value = {}, defaultKeys = []) => {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const visible = Array.isArray(source.visibleColumnKeys)
        ? source.visibleColumnKeys.map((key) => String(key || '').trim()).filter((key) => defaultKeys.includes(key))
        : [];
    const order = Array.isArray(source.columnOrder)
        ? source.columnOrder.map((key) => String(key || '').trim()).filter((key) => defaultKeys.includes(key))
        : [];
    return {
        visibleColumnKeys: visible.length ? visible : defaultKeys,
        columnOrder: [...order, ...defaultKeys.filter((key) => !order.includes(key))],
        sort: {
            columnKey: String(source?.sort?.columnKey || source?.sortColumnKey || '').trim(),
            direction: String(source?.sort?.direction || source?.sortDirection || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc'
        }
    };
};

const readLocal = (storageKey, fallback) => {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? normalizePrefs(JSON.parse(raw), fallback.visibleColumnKeys || []) : fallback;
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
    const storageKey = useMemo(() => `${STORAGE_PREFIX}.${String(sectionKey || 'default').trim()}`, [sectionKey]);
    const fallbackPrefs = useMemo(() => normalizePrefs({}, defaultKeys), [defaultKeys]);
    const [preferences, setPreferences] = useState(() => readLocal(storageKey, fallbackPrefs));
    const loadedRef = useRef(false);

    useEffect(() => {
        setPreferences((prev) => normalizePrefs(prev, defaultKeys));
    }, [defaultKeys]);

    useEffect(() => {
        let cancelled = false;
        loadedRef.current = false;
        const load = async () => {
            const localPrefs = readLocal(storageKey, fallbackPrefs);
            if (!cancelled) setPreferences(localPrefs);
            if (!requestJson) {
                loadedRef.current = true;
                return;
            }
            try {
                const remote = await fetchSaasUiPreference(requestJson, sectionKey);
                const remotePrefs = normalizePrefs(remote?.preferencesJson || {}, defaultKeys);
                if (!cancelled) {
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
    }, [defaultKeys, fallbackPrefs, requestJson, sectionKey, storageKey]);

    useEffect(() => {
        writeLocal(storageKey, preferences);
        if (!requestJson || !loadedRef.current) return undefined;
        const timer = setTimeout(() => {
            saveSaasUiPreference(requestJson, sectionKey, preferences).catch(() => {});
        }, 1000);
        return () => clearTimeout(timer);
    }, [preferences, requestJson, sectionKey, storageKey]);

    const setVisibleColumnKeys = useCallback((nextValue) => {
        setPreferences((prev) => {
            const next = typeof nextValue === 'function' ? nextValue(prev.visibleColumnKeys) : nextValue;
            return normalizePrefs({ ...prev, visibleColumnKeys: next }, defaultKeys);
        });
    }, [defaultKeys]);

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
        setPreferences((prev) => normalizePrefs({ ...prev, sort }, defaultKeys));
    }, [defaultKeys]);

    const setColumnOrder = useCallback((columnOrder) => {
        setPreferences((prev) => normalizePrefs({ ...prev, columnOrder }, defaultKeys));
    }, [defaultKeys]);

    const reset = useCallback(() => {
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
