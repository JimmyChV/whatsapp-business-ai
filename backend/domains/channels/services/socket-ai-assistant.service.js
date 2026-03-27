function createSocketAiAssistantService({
    getChatSuggestion,
    askInternalCopilot,
    aiChatHistoryService,
    resolveAiHistoryScope
} = {}) {
    const registerAiAssistantHandlers = ({
        socket,
        tenantId = 'default',
        authContext,
        guardRateLimit,
        normalizeSocketModuleId,
        resolveSocketModuleContext,
        reserveAiQuota
    } = {}) => {
        socket.on('get_ai_chat_history', async (payload = {}) => {
            try {
                const safePayload = payload && typeof payload === 'object'
                    ? payload
                    : { chatId: String(payload || '').trim() };
                const requestSeq = Number(safePayload?.requestSeq || 0) || null;
                const selectedScopeModuleId = normalizeSocketModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const historyScope = resolveAiHistoryScope({
                    chatId: safePayload.chatId || safePayload.scopeChatId || safePayload.scopedChatId || '',
                    scopeModuleId: safePayload.scopeModuleId || safePayload.moduleId || selectedScopeModuleId || '',
                    runtimeContext: safePayload.runtimeContext && typeof safePayload.runtimeContext === 'object'
                        ? safePayload.runtimeContext
                        : null
                }, selectedScopeModuleId);

                if (!historyScope.scopeChatId) {
                    socket.emit('ai_chat_history', {
                        requestSeq,
                        scopeChatId: null,
                        baseChatId: null,
                        scopeModuleId: historyScope.scopeModuleId || null,
                        items: []
                    });
                    return;
                }

                const rawLimit = Number(safePayload.limit || 80);
                const limit = Number.isFinite(rawLimit)
                    ? Math.min(200, Math.max(20, Math.floor(rawLimit)))
                    : 80;

                const items = await aiChatHistoryService.listEntries(tenantId, {
                    scopeChatId: historyScope.scopeChatId,
                    limit,
                    beforeTimestamp: Number(safePayload.beforeTimestamp || 0) || null
                });

                socket.emit('ai_chat_history', {
                    requestSeq,
                    scopeChatId: historyScope.scopeChatId,
                    baseChatId: historyScope.baseChatId || null,
                    scopeModuleId: historyScope.scopeModuleId || null,
                    items: Array.isArray(items) ? items : []
                });
            } catch (error) {
                socket.emit('ai_chat_history', {
                    requestSeq: Number(payload?.requestSeq || 0) || null,
                    scopeChatId: null,
                    baseChatId: null,
                    scopeModuleId: null,
                    items: [],
                    error: 'No se pudo cargar historial IA.'
                });
            }
        });

        socket.on('request_ai_suggestion', (payload) => {
            if (!guardRateLimit(socket, 'request_ai_suggestion')) return;
            const { contextText, customPrompt, businessContext, moduleId, runtimeContext } = payload || {};
            // Defer to avoid blocking the event loop (prevents 'click handler took Xms' violations)
            setImmediate(async () => {
                try {
                    const quota = await reserveAiQuota(tenantId, { socket });
                    if (!quota?.ok) {
                        socket.emit('ai_suggestion_complete');
                        return;
                    }

                    const requestedModuleId = normalizeSocketModuleId(moduleId || '');
                    let aiModuleContext = socket?.data?.waModule || null;
                    const activeModuleId = normalizeSocketModuleId(aiModuleContext?.moduleId || socket?.data?.waModuleId || '');
                    if (requestedModuleId && requestedModuleId !== activeModuleId) {
                        const contextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId).catch(() => null);
                        if (contextPayload?.selected) {
                            aiModuleContext = contextPayload.selected;
                        }
                    }
                    const moduleAssistantId = String(aiModuleContext?.metadata?.moduleSettings?.aiAssistantId || '').trim().toUpperCase();
                    const safeRuntimeContext = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : null;
                    const aiText = await getChatSuggestion(contextText, customPrompt, (chunk) => {
                        socket.emit('ai_suggestion_chunk', chunk);
                    }, businessContext, {
                        tenantId,
                        moduleAssistantId,
                        runtimeContext: safeRuntimeContext,
                        moduleContext: aiModuleContext && typeof aiModuleContext === 'object' ? aiModuleContext : null
                    });
                    if (typeof aiText === 'string' && aiText.startsWith('Error IA:')) {
                        socket.emit('ai_error', aiText);
                    } else {
                        const historyScope = resolveAiHistoryScope({
                            chatId: safeRuntimeContext?.chat?.chatId || '',
                            scopeModuleId: safeRuntimeContext?.module?.moduleId || requestedModuleId || activeModuleId || '',
                            runtimeContext: safeRuntimeContext
                        }, normalizeSocketModuleId(aiModuleContext?.moduleId || requestedModuleId || activeModuleId || ''));
                        const suggestionPrompt = String(contextText || customPrompt || '').trim();
                        if (historyScope.scopeChatId && suggestionPrompt && String(aiText || '').trim()) {
                            try {
                                await aiChatHistoryService.appendInteraction(tenantId, {
                                    scopeChatId: historyScope.scopeChatId,
                                    baseChatId: historyScope.baseChatId,
                                    scopeModuleId: historyScope.scopeModuleId,
                                    mode: 'suggestion',
                                    assistantId: moduleAssistantId || null,
                                    userId: String(authContext?.userId || authContext?.id || '').trim() || null,
                                    userName: String(authContext?.name || authContext?.displayName || authContext?.email || '').trim() || null,
                                    query: suggestionPrompt,
                                    response: String(aiText || '').trim(),
                                    runtimeContext: safeRuntimeContext
                                });
                            } catch (_) { }
                        }
                    }
                    socket.emit('ai_suggestion_complete');
                } catch (e) {
                    console.error('AI suggestion error:', e);
                    socket.emit('ai_error', 'Error IA: no se pudo generar sugerencia.');
                    socket.emit('ai_suggestion_complete');
                }
            });
        });

        socket.on('internal_ai_query', (payload) => {
            if (!guardRateLimit(socket, 'internal_ai_query')) return;
            const { query, businessContext, moduleId, runtimeContext } = typeof payload === 'string'
                ? { query: payload, businessContext: null, moduleId: '', runtimeContext: null }
                : (payload || {});
            // Defer to avoid blocking the event loop
            setImmediate(async () => {
                try {
                    const quota = await reserveAiQuota(tenantId, { socket });
                    if (!quota?.ok) {
                        socket.emit('internal_ai_complete');
                        return;
                    }

                    const requestedModuleId = normalizeSocketModuleId(moduleId || '');
                    let aiModuleContext = socket?.data?.waModule || null;
                    const activeModuleId = normalizeSocketModuleId(aiModuleContext?.moduleId || socket?.data?.waModuleId || '');
                    if (requestedModuleId && requestedModuleId !== activeModuleId) {
                        const contextPayload = await resolveSocketModuleContext(tenantId, authContext, requestedModuleId).catch(() => null);
                        if (contextPayload?.selected) {
                            aiModuleContext = contextPayload.selected;
                        }
                    }
                    const moduleAssistantId = String(aiModuleContext?.metadata?.moduleSettings?.aiAssistantId || '').trim().toUpperCase();
                    const safeRuntimeContext = runtimeContext && typeof runtimeContext === 'object' ? runtimeContext : null;
                    const copilotText = await askInternalCopilot(query, (chunk) => {
                        socket.emit('internal_ai_chunk', chunk);
                    }, businessContext, {
                        tenantId,
                        moduleAssistantId,
                        runtimeContext: safeRuntimeContext,
                        moduleContext: aiModuleContext && typeof aiModuleContext === 'object' ? aiModuleContext : null
                    });
                    if (typeof copilotText === 'string' && copilotText.startsWith('Error IA:')) {
                        socket.emit('internal_ai_error', copilotText);
                    } else {
                        const historyScope = resolveAiHistoryScope({
                            chatId: safeRuntimeContext?.chat?.chatId || '',
                            scopeModuleId: safeRuntimeContext?.module?.moduleId || requestedModuleId || activeModuleId || '',
                            runtimeContext: safeRuntimeContext
                        }, normalizeSocketModuleId(aiModuleContext?.moduleId || requestedModuleId || activeModuleId || ''));
                        const cleanQuery = String(query || '').trim();
                        const cleanCopilotText = String(copilotText || '').trim();
                        if (historyScope.scopeChatId && cleanQuery && cleanCopilotText) {
                            try {
                                await aiChatHistoryService.appendInteraction(tenantId, {
                                    scopeChatId: historyScope.scopeChatId,
                                    baseChatId: historyScope.baseChatId,
                                    scopeModuleId: historyScope.scopeModuleId,
                                    mode: 'copilot',
                                    assistantId: moduleAssistantId || null,
                                    userId: String(authContext?.userId || authContext?.id || '').trim() || null,
                                    userName: String(authContext?.name || authContext?.displayName || authContext?.email || '').trim() || null,
                                    query: cleanQuery,
                                    response: cleanCopilotText,
                                    runtimeContext: safeRuntimeContext
                                });
                            } catch (_) { }
                        }
                    }
                    socket.emit('internal_ai_complete');
                } catch (e) {
                    console.error('Copilot error:', e);
                    socket.emit('internal_ai_error', 'Error IA: no se pudo responder en copiloto.');
                    socket.emit('internal_ai_complete');
                }
            });
        });
    };

    return {
        registerAiAssistantHandlers
    };
}

module.exports = {
    createSocketAiAssistantService
};
