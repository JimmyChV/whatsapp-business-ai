import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_PREFIX = 'saas.columnPrefs';

const readStoredValue = (storageKey, fallback) => {
    if (typeof window === 'undefined' || !storageKey) {
        return fallback;
    }
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            return fallback;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
};

const normalizeDefaultKeys = (defaultColumns = []) => (
    defaultColumns
        .map((column) => (typeof column === 'string' ? column : column?.key))
        .map((key) => String(key || '').trim())
        .filter(Boolean)
);

const useSaasColumnPrefs = (sectionKey, defaultColumns = []) => {
    const defaultKeys = useMemo(
        () => normalizeDefaultKeys(defaultColumns),
        [defaultColumns]
    );

    const storageKey = useMemo(
        () => `${STORAGE_PREFIX}.${String(sectionKey || 'default').trim()}`,
        [sectionKey]
    );

    const [visibleColumnKeys, setVisibleColumnKeys] = useState(() => readStoredValue(storageKey, defaultKeys));

    useEffect(() => {
        setVisibleColumnKeys((prev) => {
            const current = Array.isArray(prev) ? prev.map((key) => String(key || '').trim()).filter(Boolean) : [];
            if (!current.length) {
                return defaultKeys;
            }
            const allowed = current.filter((key) => defaultKeys.includes(key));
            if (!allowed.length) {
                return defaultKeys;
            }
            return allowed;
        });
    }, [defaultKeys]);

    useEffect(() => {
        if (typeof window === 'undefined' || !storageKey) {
            return;
        }
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(visibleColumnKeys));
        } catch {
            // ignore localStorage failures
        }
    }, [storageKey, visibleColumnKeys]);

    const isColumnVisible = useCallback(
        (columnKey) => visibleColumnKeys.includes(String(columnKey || '').trim()),
        [visibleColumnKeys]
    );

    const toggleColumn = useCallback((columnKey) => {
        const normalized = String(columnKey || '').trim();
        if (!normalized) {
            return;
        }
        setVisibleColumnKeys((prev) => {
            const current = Array.isArray(prev) ? prev : [];
            if (current.includes(normalized)) {
                const next = current.filter((key) => key !== normalized);
                return next.length ? next : current;
            }
            return [...current, normalized];
        });
    }, []);

    const resetColumns = useCallback(() => {
        setVisibleColumnKeys(defaultKeys);
    }, [defaultKeys]);

    return {
        visibleColumnKeys,
        setVisibleColumnKeys,
        isColumnVisible,
        toggleColumn,
        resetColumns,
        storageKey
    };
};

export default useSaasColumnPrefs;
