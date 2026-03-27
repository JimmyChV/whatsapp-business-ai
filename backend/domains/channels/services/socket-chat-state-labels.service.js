function createSocketChatStateLabelsService({
    messageHistoryService,
    tenantLabelService,
    normalizeScopedModuleId,
    resolveScopedChatTarget,
    buildScopedChatId,
    getSortedVisibleChats,
    toChatSummary,
    toHistoryChatSummary,
    emitToTenant
} = {}) {
    const buildChatStateSavedPayload = ({
        scopedChatId,
        safeChatId,
        scopeModuleId,
        hasPinned,
        hasArchived,
        patch,
        persisted
    }) => {
        const nextPinned = hasPinned ? patch.pinned : Boolean(persisted?.pinned);
        const nextArchived = hasArchived ? patch.archived : Boolean(persisted?.archived);
        return {
            ok: true,
            chatId: scopedChatId || safeChatId,
            baseChatId: safeChatId,
            scopeModuleId: scopeModuleId || null,
            pinned: nextPinned,
            archived: nextArchived,
            state: {
                pinned: nextPinned,
                archived: nextArchived
            }
        };
    };

    const normalizeCreatedLabel = (item) => {
        if (!item || typeof item !== 'object') return item;
        return {
            ...item,
            id: String(item?.id || item?.labelId || '').trim() || item?.id || null,
            name: String(item?.name || '').trim() || item?.name || null
        };
    };

    const registerChatStateLabelHandlers = ({
        socket,
        tenantId = 'default',
        authzAudit,
        recordConversationEvent
    } = {}) => {
        socket.on('set_chat_state', async ({ chatId, pinned, archived }) => {
            if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'error', action: 'actualizar estado de chat' })) return;
            try {
                const requestedChatId = String(chatId || '').trim();
                if (!requestedChatId) {
                    socket.emit('error', 'Chat invalido para actualizar estado.');
                    return;
                }

                const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const scopedTarget = resolveScopedChatTarget(requestedChatId, selectedScopeModuleId);
                const safeChatId = String(scopedTarget.baseChatId || '').trim();
                const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                const scopedChatId = scopedTarget.scopedChatId || buildScopedChatId(safeChatId, scopeModuleId || '');
                if (!safeChatId) {
                    socket.emit('error', 'Chat invalido para actualizar estado.');
                    return;
                }

                const hasPinned = typeof pinned === 'boolean';
                const hasArchived = typeof archived === 'boolean';
                if (!hasPinned && !hasArchived) {
                    socket.emit('error', 'No se detectaron cambios para el chat.');
                    return;
                }

                const patch = {};
                if (hasPinned) patch.pinned = Boolean(pinned);
                if (hasArchived) patch.archived = Boolean(archived);

                const persisted = await messageHistoryService.updateChatState(tenantId, {
                    chatId: safeChatId,
                    pinned: hasPinned ? patch.pinned : undefined,
                    archived: hasArchived ? patch.archived : undefined
                });

                const selectedModuleContext = socket?.data?.waModule || null;
                const summaryScopeOptions = {
                    tenantId,
                    scopeModuleId: scopeModuleId || '',
                    scopeModuleName: String(selectedModuleContext?.name || '').trim() || null,
                    scopeModuleImageUrl: String(selectedModuleContext?.imageUrl || selectedModuleContext?.logoUrl || '').trim() || null,
                    scopeChannelType: String(selectedModuleContext?.channelType || '').trim().toLowerCase() || null,
                    scopeTransport: String(selectedModuleContext?.transportMode || '').trim().toLowerCase() || null
                };

                let summary = null;
                try {
                    const visibleChats = await getSortedVisibleChats({ forceRefresh: false });
                    const waChat = (visibleChats || []).find((entry) => String(entry?.id?._serialized || '').trim() === safeChatId);
                    if (waChat) {
                        summary = await toChatSummary(waChat, { includeHeavyMeta: false, ...summaryScopeOptions });
                    }
                } catch (_) { }

                if (!summary) {
                    try {
                        const rows = await messageHistoryService.listChats(tenantId, { limit: 5000, offset: 0 });
                        const row = Array.isArray(rows)
                            ? rows.find((entry) => String(entry?.chatId || '').trim() === safeChatId)
                            : null;
                        if (row) {
                            summary = toHistoryChatSummary({ ...row, scopeModuleId: scopeModuleId || row?.scopeModuleId || null });
                        }
                    } catch (_) { }
                }

                if (summary) {
                    const nextSummary = {
                        ...summary,
                        id: scopedChatId || summary.id || safeChatId,
                        baseChatId: safeChatId,
                        scopeModuleId: scopeModuleId || summary.scopeModuleId || null,
                        archived: hasArchived ? patch.archived : Boolean(summary.archived),
                        pinned: hasPinned ? patch.pinned : Boolean(summary.pinned)
                    };
                    emitToTenant(tenantId, 'chat_updated', nextSummary);
                }

                const payload = buildChatStateSavedPayload({
                    scopedChatId,
                    safeChatId,
                    scopeModuleId,
                    hasPinned,
                    hasArchived,
                    patch,
                    persisted
                });
                socket.emit('chat_state_saved', payload);

                await authzAudit.auditSocketAction('chat.state.updated', {
                    resourceType: 'chat',
                    resourceId: safeChatId,
                    payload: {
                        pinned: hasPinned ? patch.pinned : undefined,
                        archived: hasArchived ? patch.archived : undefined
                    }
                });

                await recordConversationEvent({
                    chatId: safeChatId,
                    scopeModuleId,
                    eventType: 'chat.state.updated',
                    eventSource: 'socket',
                    payload: {
                        pinned: hasPinned ? patch.pinned : undefined,
                        archived: hasArchived ? patch.archived : undefined
                    }
                });
            } catch (e) {
                console.error('set_chat_state error:', e.message);
                socket.emit('error', String(e?.message || 'No se pudo actualizar el estado del chat.'));
            }
        });

        socket.on('set_chat_labels', async ({ chatId, labelIds }) => {
            if (!authzAudit.requireRole(['owner', 'admin', 'seller'], { errorEvent: 'chat_labels_error', action: 'gestionar etiquetas' })) return;
            try {
                const requestedChatId = String(chatId || '').trim();
                if (!requestedChatId) {
                    socket.emit('chat_labels_error', 'Chat invalido para etiquetar.');
                    return;
                }

                const selectedScopeModuleId = normalizeScopedModuleId(socket?.data?.waModule?.moduleId || socket?.data?.waModuleId || '');
                const scopedTarget = resolveScopedChatTarget(requestedChatId, selectedScopeModuleId);
                const safeChatId = String(scopedTarget.baseChatId || '').trim();
                const scopeModuleId = normalizeScopedModuleId(scopedTarget.moduleId || selectedScopeModuleId || '');
                const scopedChatId = scopedTarget.scopedChatId || buildScopedChatId(safeChatId, scopeModuleId || '');
                if (!safeChatId) {
                    socket.emit('chat_labels_error', 'Chat invalido para etiquetar.');
                    return;
                }

                const ids = Array.isArray(labelIds)
                    ? labelIds.map((value) => tenantLabelService.normalizeLabelId(value)).filter(Boolean)
                    : [];

                const updatedLabels = await tenantLabelService.setChatLabels({
                    tenantId,
                    chatId: safeChatId,
                    scopeModuleId,
                    labelIds: ids
                });

                const payload = {
                    chatId: scopedChatId || safeChatId,
                    baseChatId: safeChatId,
                    scopeModuleId: scopeModuleId || null,
                    labels: Array.isArray(updatedLabels) ? updatedLabels : []
                };

                emitToTenant(tenantId, 'chat_labels_updated', payload);
                socket.emit('chat_labels_saved', {
                    chatId: payload.chatId || safeChatId,
                    baseChatId: safeChatId,
                    scopeModuleId: payload.scopeModuleId || null,
                    ok: true
                });

                await authzAudit.auditSocketAction('chat.labels.updated', {
                    resourceType: 'chat',
                    resourceId: safeChatId,
                    payload: { labelIds: ids, labels: payload.labels }
                });

                await recordConversationEvent({
                    chatId: safeChatId,
                    scopeModuleId,
                    eventType: 'chat.labels.updated',
                    eventSource: 'socket',
                    payload: {
                        labelIds: ids,
                        labels: payload.labels
                    }
                });
            } catch (e) {
                console.error('set_chat_labels error:', e.message);
                socket.emit('chat_labels_error', String(e?.message || 'No se pudieron actualizar las etiquetas del chat.'));
            }
        });

        socket.on('create_label', async ({ name, color = '', description = '' }) => {
            if (!authzAudit.requireRole(['owner', 'admin'], { errorEvent: 'chat_labels_error', action: 'crear etiquetas' })) return;
            try {
                const cleanName = String(name || '').trim();
                if (!cleanName) {
                    socket.emit('chat_labels_error', 'Nombre de etiqueta invalido.');
                    return;
                }
                const createdItem = await tenantLabelService.saveLabel({
                    name: cleanName,
                    color: String(color || '').trim(),
                    description: String(description || '').trim(),
                    isActive: true
                }, { tenantId });
                const item = normalizeCreatedLabel(createdItem);
                socket.emit('chat_label_created', { ok: true, item, label: item });
                const labels = await tenantLabelService.listLabels({ tenantId, includeInactive: false });
                emitToTenant(tenantId, 'business_data_labels', {
                    labels,
                    source: 'tenant_db'
                });
            } catch (e) {
                console.error('create_label error:', e.message);
                socket.emit('chat_labels_error', String(e?.message || 'No se pudo crear la etiqueta.'));
            }
        });
    };

    return {
        registerChatStateLabelHandlers
    };
}

module.exports = {
    createSocketChatStateLabelsService
};
