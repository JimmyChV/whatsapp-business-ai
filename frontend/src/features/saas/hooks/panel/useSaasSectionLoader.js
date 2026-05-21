import { useCallback, useMemo, useRef, useState } from 'react';

function toSectionId(sectionId) {
    return String(sectionId || '').trim();
}

function toErrorMessage(error) {
    return String(error?.message || error || 'No se pudo cargar la seccion.');
}

function setMapValue(mapRef, setState, key, value) {
    const next = new Map(mapRef.current);
    if (value === null || value === undefined || value === false) {
        next.delete(key);
    } else {
        next.set(key, value);
    }
    mapRef.current = next;
    setState(next);
}

function serializeDeps(deps) {
    if (!Array.isArray(deps) || deps.length === 0) return '';
    try {
        return JSON.stringify(deps.map((entry) => (
            entry === null || entry === undefined
                ? null
                : typeof entry === 'object'
                    ? String(entry?.id || entry?.key || entry?.value || JSON.stringify(entry))
                    : String(entry)
        )));
    } catch {
        return deps.map((entry) => String(entry ?? '')).join('|');
    }
}

export default function useSaasSectionLoader() {
    const loadedRef = useRef(new Map());
    const loadingRef = useRef(new Map());
    const errorsRef = useRef(new Map());
    const reloadTokensRef = useRef(new Map());
    const consumedReloadTokensRef = useRef(new Map());
    const depsRef = useRef(new Map());

    const [loadedSections, setLoadedSections] = useState(() => new Map());
    const [loadingSections, setLoadingSections] = useState(() => new Map());
    const [sectionErrors, setSectionErrors] = useState(() => new Map());
    const [reloadTokens, setReloadTokens] = useState(() => new Map());

    const isLoaded = useCallback((sectionId) => {
        const cleanSectionId = toSectionId(sectionId);
        return cleanSectionId ? loadedRef.current.get(cleanSectionId) === true : false;
    }, []);

    const isLoading = useCallback((sectionId) => {
        const cleanSectionId = toSectionId(sectionId);
        return cleanSectionId ? loadingRef.current.get(cleanSectionId) === true : false;
    }, []);

    const getError = useCallback((sectionId) => {
        const cleanSectionId = toSectionId(sectionId);
        return cleanSectionId ? errorsRef.current.get(cleanSectionId) || null : null;
    }, []);

    const getReloadToken = useCallback((sectionId) => {
        const cleanSectionId = toSectionId(sectionId);
        return cleanSectionId ? Number(reloadTokensRef.current.get(cleanSectionId) || 0) : 0;
    }, []);

    const forceReload = useCallback((sectionId) => {
        const cleanSectionId = toSectionId(sectionId);
        if (!cleanSectionId) return;

        setMapValue(loadedRef, setLoadedSections, cleanSectionId, false);
        setMapValue(errorsRef, setSectionErrors, cleanSectionId, false);

        const nextTokens = new Map(reloadTokensRef.current);
        nextTokens.set(cleanSectionId, Number(nextTokens.get(cleanSectionId) || 0) + 1);
        reloadTokensRef.current = nextTokens;
        setReloadTokens(nextTokens);
    }, []);

    const ensureSectionData = useCallback(async (sectionId, loadFn, options = {}) => {
        const cleanSectionId = toSectionId(sectionId);
        if (!cleanSectionId) return undefined;
        if (options.canLoad === false) return undefined;
        if (typeof loadFn !== 'function') return undefined;
        if (loadingRef.current.get(cleanSectionId) === true) return undefined;

        const depsKey = serializeDeps(options.deps);
        const previousDepsKey = depsRef.current.get(cleanSectionId) || '';
        const depsChanged = Boolean(depsKey && depsKey !== previousDepsKey);
        if (depsKey && depsChanged) {
            depsRef.current.set(cleanSectionId, depsKey);
            setMapValue(loadedRef, setLoadedSections, cleanSectionId, false);
            setMapValue(errorsRef, setSectionErrors, cleanSectionId, false);
        }
        const currentReloadToken = Number(
            options.reloadToken ?? reloadTokensRef.current.get(cleanSectionId) ?? 0
        );
        const consumedReloadToken = Number(consumedReloadTokensRef.current.get(cleanSectionId) || 0);
        const hasPendingForceReload = options.forceReload === true
            && currentReloadToken > 0
            && currentReloadToken !== consumedReloadToken;
        if (!hasPendingForceReload && !depsChanged && loadedRef.current.get(cleanSectionId) === true) return undefined;

        setMapValue(loadingRef, setLoadingSections, cleanSectionId, true);
        setMapValue(errorsRef, setSectionErrors, cleanSectionId, false);
        try {
            const result = await loadFn();
            setMapValue(loadedRef, setLoadedSections, cleanSectionId, true);
            if (hasPendingForceReload) {
                const nextConsumedTokens = new Map(consumedReloadTokensRef.current);
                nextConsumedTokens.set(cleanSectionId, currentReloadToken);
                consumedReloadTokensRef.current = nextConsumedTokens;
            }
            return result;
        } catch (error) {
            setMapValue(errorsRef, setSectionErrors, cleanSectionId, toErrorMessage(error));
            if (options.throwOnError === true) throw error;
            return undefined;
        } finally {
            setMapValue(loadingRef, setLoadingSections, cleanSectionId, false);
        }
    }, []);

    return useMemo(() => ({
        loadedSections,
        loadingSections,
        sectionErrors,
        reloadTokens,
        ensureSectionData,
        isLoaded,
        isLoading,
        getError,
        getReloadToken,
        forceReload
    }), [
        ensureSectionData,
        forceReload,
        getError,
        getReloadToken,
        isLoaded,
        isLoading,
        loadedSections,
        loadingSections,
        reloadTokens,
        sectionErrors
    ]);
}
