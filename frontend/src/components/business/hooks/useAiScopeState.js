import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildAiScopeInfo, buildDefaultAiThread, normalizeAiScopeModuleId } from '../businessSidebar.helpers';

export const useAiScopeState = ({
    tenantScopeKey = 'default',
    activeChatId = '',
    activeChatDetails = null,
    activeModuleId = '',
    selectedCatalogModuleId = ''
} = {}) => {
    const [aiThreadsByScope, setAiThreadsByScope] = useState({});
    const [aiLoadingByScope, setAiLoadingByScope] = useState({});

    const aiRequestScopeRef = useRef('');
    const aiScopeKeyRef = useRef('');
    const aiHistoryLoadedRef = useRef(new Set());
    const aiHistoryRequestSeqRef = useRef(0);
    const aiHistoryScopeBySeqRef = useRef(new Map());
    const tenantScopeRef = useRef(String(tenantScopeKey || 'default').trim() || 'default');

    const normalizedTenantScopeKey = useMemo(() => String(tenantScopeKey || 'default').trim() || 'default', [tenantScopeKey]);
    const activeTenantScopeId = normalizedTenantScopeKey;

    const activeScopeModuleCandidate = normalizeAiScopeModuleId(
        activeChatDetails?.scopeModuleId || activeModuleId || selectedCatalogModuleId || ''
    );

    const activeAiScope = useMemo(
        () => buildAiScopeInfo(activeTenantScopeId, activeChatId, activeScopeModuleCandidate),
        [activeTenantScopeId, activeChatId, activeScopeModuleCandidate]
    );

    const currentAiScopeKey = activeAiScope.scopeKey;
    const currentAiScopeChatId = activeAiScope.scopeChatId;

    const aiMessages = useMemo(() => {
        const scoped = aiThreadsByScope[currentAiScopeKey];
        if (Array.isArray(scoped) && scoped.length > 0) return scoped;
        return buildDefaultAiThread();
    }, [aiThreadsByScope, currentAiScopeKey]);

    const isAiLoading = Boolean(aiLoadingByScope[currentAiScopeKey]);

    const resetAiScopeState = useCallback(() => {
        setAiThreadsByScope({});
        setAiLoadingByScope({});
        aiRequestScopeRef.current = '';
        aiScopeKeyRef.current = '';
        aiHistoryLoadedRef.current = new Set();
        aiHistoryRequestSeqRef.current = 0;
        aiHistoryScopeBySeqRef.current = new Map();
    }, []);

    const setAiThreadMessages = useCallback((scopeKey = '', updater = null) => {
        const safeScopeKey = String(scopeKey || '').trim();
        if (!safeScopeKey) return;
        setAiThreadsByScope((previous) => {
            const baseThread = Array.isArray(previous?.[safeScopeKey]) && previous[safeScopeKey].length > 0
                ? previous[safeScopeKey]
                : buildDefaultAiThread();
            const nextThread = typeof updater === 'function' ? updater(baseThread) : updater;
            if (!Array.isArray(nextThread) || nextThread.length === 0) {
                return {
                    ...previous,
                    [safeScopeKey]: buildDefaultAiThread()
                };
            }
            return {
                ...previous,
                [safeScopeKey]: nextThread
            };
        });
    }, []);

    const setAiScopeLoading = useCallback((scopeKey = '', nextValue = false) => {
        const safeScopeKey = String(scopeKey || '').trim();
        if (!safeScopeKey) return;
        setAiLoadingByScope((previous) => ({
            ...previous,
            [safeScopeKey]: Boolean(nextValue)
        }));
    }, []);

    useEffect(() => {
        const nextScope = normalizedTenantScopeKey;
        if (tenantScopeRef.current === nextScope) return;
        tenantScopeRef.current = nextScope;
        resetAiScopeState();
    }, [normalizedTenantScopeKey, resetAiScopeState]);

    useEffect(() => {
        aiScopeKeyRef.current = currentAiScopeKey;
        setAiThreadsByScope((previous) => {
            const existing = previous?.[currentAiScopeKey];
            if (Array.isArray(existing) && existing.length > 0) return previous;
            return {
                ...previous,
                [currentAiScopeKey]: buildDefaultAiThread()
            };
        });
    }, [currentAiScopeKey]);

    return {
        activeAiScope,
        activeTenantScopeId,
        aiHistoryLoadedRef,
        aiHistoryRequestSeqRef,
        aiHistoryScopeBySeqRef,
        aiMessages,
        aiRequestScopeRef,
        aiScopeKeyRef,
        currentAiScopeChatId,
        currentAiScopeKey,
        isAiLoading,
        normalizedTenantScopeKey,
        resetAiScopeState,
        setAiScopeLoading,
        setAiThreadMessages,
        setAiThreadsByScope
    };
};