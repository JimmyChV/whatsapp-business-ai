import { useEffect } from 'react';
import { buildAiScopeInfo, buildDefaultAiThread, repairMojibake } from '../businessSidebar.helpers';
import { attachAiSocketListeners, emitAiHistoryRequest } from '../services/aiSocket.service';

export const useAiSocketBridge = ({
    socket = null,
    tenantId = 'default',
    currentAiScopeKey = '',
    currentAiScopeChatId = '',
    scopeModuleId = null,
    aiHistoryLoadedRef,
    aiHistoryRequestSeqRef,
    aiHistoryScopeBySeqRef,
    aiRequestScopeRef,
    aiScopeKeyRef,
    setAiThreadsByScope,
    setAiScopeLoading,
    setAiThreadMessages
} = {}) => {
    useEffect(() => {
        if (!socket) return;
        if (!currentAiScopeChatId) return;
        if (aiHistoryLoadedRef?.current?.has(currentAiScopeKey)) return;

        aiHistoryLoadedRef.current.add(currentAiScopeKey);
        const requestSeq = (Number(aiHistoryRequestSeqRef.current || 0) || 0) + 1;
        aiHistoryRequestSeqRef.current = requestSeq;
        aiHistoryScopeBySeqRef.current.set(requestSeq, currentAiScopeKey);

        emitAiHistoryRequest(socket, {
            requestSeq,
            chatId: currentAiScopeChatId,
            scopeModuleId: scopeModuleId || null,
            limit: 120
        });
    }, [socket, currentAiScopeKey, currentAiScopeChatId, scopeModuleId, aiHistoryLoadedRef, aiHistoryRequestSeqRef, aiHistoryScopeBySeqRef]);

    useEffect(() => {
        if (!socket) return;
        let buffer = '';

        const resolveTargetScope = (fallback = '') => {
            const safeFallback = String(fallback || '').trim();
            if (safeFallback) return safeFallback;
            const fromRef = String(aiRequestScopeRef?.current || aiScopeKeyRef?.current || '').trim();
            if (fromRef) return fromRef;
            return currentAiScopeKey;
        };

        const onHistory = (payload = {}) => {
            const requestSeq = Number(payload?.requestSeq || 0) || 0;
            const mappedScope = requestSeq ? aiHistoryScopeBySeqRef.current.get(requestSeq) : '';
            if (requestSeq) aiHistoryScopeBySeqRef.current.delete(requestSeq);

            const incomingScopeInfo = buildAiScopeInfo(
                tenantId || 'default',
                payload?.scopeChatId || payload?.chatId || payload?.baseChatId || '',
                payload?.scopeModuleId || ''
            );
            const scopeKey = resolveTargetScope(mappedScope || incomingScopeInfo.scopeKey);
            const entries = Array.isArray(payload?.items) ? payload.items : [];
            const normalized = entries
                .map((entry) => {
                    const role = String(entry?.role || '').trim().toLowerCase() === 'user' ? 'user' : 'assistant';
                    const content = repairMojibake(String(entry?.content || '').trim());
                    if (!content) return null;
                    return { role, content };
                })
                .filter(Boolean);

            setAiThreadsByScope((previous) => {
                const existing = Array.isArray(previous?.[scopeKey]) ? previous[scopeKey] : [];
                if (existing.some((entry) => entry?.streaming)) return previous;
                if (normalized.length === 0) {
                    if (existing.length > 0) return previous;
                    return {
                        ...previous,
                        [scopeKey]: buildDefaultAiThread()
                    };
                }
                return {
                    ...previous,
                    [scopeKey]: normalized
                };
            });
            setAiScopeLoading(scopeKey, false);
        };

        const onChunk = (chunk) => {
            const scopeKey = resolveTargetScope();
            buffer += repairMojibake(chunk);
            setAiThreadMessages(scopeKey, (previous) => {
                const safePrevious = Array.isArray(previous) ? previous : buildDefaultAiThread();
                const last = safePrevious[safePrevious.length - 1];
                if (last?.role === 'assistant' && last?.streaming) {
                    return [...safePrevious.slice(0, -1), { ...last, content: buffer }];
                }
                return [...safePrevious, { role: 'assistant', content: buffer, streaming: true }];
            });
        };

        const onComplete = () => {
            const scopeKey = resolveTargetScope();
            buffer = '';
            setAiScopeLoading(scopeKey, false);
            setAiThreadMessages(scopeKey, (previous) => {
                const safePrevious = Array.isArray(previous) ? previous : buildDefaultAiThread();
                const last = safePrevious[safePrevious.length - 1];
                if (last?.streaming) return [...safePrevious.slice(0, -1), { ...last, streaming: false }];
                return safePrevious;
            });
            if (aiRequestScopeRef?.current !== undefined) aiRequestScopeRef.current = '';
        };

        const onError = (msg) => {
            const scopeKey = resolveTargetScope();
            setAiScopeLoading(scopeKey, false);
            setAiThreadMessages(scopeKey, (previous) => {
                const safePrevious = Array.isArray(previous) ? previous : buildDefaultAiThread();
                return [...safePrevious, { role: 'assistant', content: repairMojibake(msg || 'Error IA: no se pudo generar respuesta.') }];
            });
            if (aiRequestScopeRef?.current !== undefined) aiRequestScopeRef.current = '';
        };

        const detachAiListeners = attachAiSocketListeners(socket, {
            onHistory,
            onChunk,
            onComplete,
            onError
        });
        return detachAiListeners;
    }, [
        socket,
        currentAiScopeKey,
        tenantId,
        aiHistoryScopeBySeqRef,
        aiRequestScopeRef,
        aiScopeKeyRef,
        setAiThreadsByScope,
        setAiScopeLoading,
        setAiThreadMessages
    ]);
};