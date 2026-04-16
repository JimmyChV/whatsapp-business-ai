function createSocketTemplateMessagesService({
    waClient,
    metaTemplatesService,
    templateVariablesService,
    getSerializedMessageId,
    buildSocketAgentMeta,
    sanitizeAgentMeta,
    rememberOutgoingAgentMeta
} = {}) {
    const toText = (value = '') => String(value ?? '').trim();
    const toLower = (value = '') => toText(value).toLowerCase();
    const toUpper = (value = '') => toText(value).toUpperCase();
    const ensureArray = (value = []) => (Array.isArray(value) ? value : []);
    const normalizeTemplateComponentType = (value = '') => toUpper(value || 'BODY') || 'BODY';
    const normalizeTemplateToken = (value = '') => toLower(value).replace(/[{}]/g, '').trim();

    const parsePlaceholderIndexesFromText = (text = '') => {
        const matches = String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g);
        const indexes = new Set();
        for (const match of matches) {
            const next = Number(match?.[1]);
            if (Number.isFinite(next) && next > 0) indexes.add(Math.floor(next));
        }
        return Array.from(indexes).sort((left, right) => left - right);
    };

    const buildTemplatePreviewMaps = (previewPayload = {}) => ensureArray(previewPayload?.categories)
        .flatMap((category) => ensureArray(category?.variables))
        .reduce((acc, variable = {}) => {
            const placeholderIndex = Number(variable?.placeholderIndex);
            const normalizedKey = normalizeTemplateToken(variable?.key);
            const nextEntry = {
                key: normalizedKey,
                value: toText(variable?.previewValue),
                label: toText(variable?.label || variable?.key)
            };
            if (normalizedKey) {
                acc.byKey.set(normalizedKey, nextEntry);
            }
            if (!Number.isFinite(placeholderIndex) || placeholderIndex <= 0) return acc;
            acc.byIndex.set(placeholderIndex, nextEntry);
            return acc;
        }, {
            byKey: new Map(),
            byIndex: new Map()
        });

    const resolveTemplatePlaceholderValue = ({
        placeholderIndex = 0,
        componentMap = {},
        previewMaps = { byKey: new Map(), byIndex: new Map() }
    } = {}) => {
        const originalToken = normalizeTemplateToken(componentMap?.sequentialToOriginal?.[placeholderIndex] || '');
        if (originalToken) {
            const fromKey = previewMaps.byKey.get(originalToken);
            if (fromKey && typeof fromKey.value === 'string') return fromKey.value;
        }
        return previewMaps.byIndex.get(placeholderIndex)?.value || '';
    };

    const buildTemplateButtonComponents = (buttons = [], previewMaps = { byKey: new Map(), byIndex: new Map() }) => ensureArray(buttons)
        .map((button = {}, index) => {
            if (toUpper(button?.type) !== 'URL') return null;
            const placeholderIndexes = parsePlaceholderIndexesFromText(button?.url || '');
            if (placeholderIndexes.length === 0) return null;
            return {
                type: 'BUTTON',
                sub_type: 'URL',
                index: String(index),
                parameters: placeholderIndexes.map((placeholderIndex) => ({
                    type: 'text',
                    text: previewMaps.byIndex.get(placeholderIndex)?.value || ''
                }))
            };
        })
        .filter((component) => component && Array.isArray(component.parameters) && component.parameters.length > 0);

    const buildTemplateSendComponents = (template = {}, previewPayload = {}) => {
        const templateComponents = ensureArray(template?.componentsJson);
        const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
            ? template.variableMapJson
            : {};
        const previewMaps = buildTemplatePreviewMaps(previewPayload);
        return ensureArray(templateComponents)
            .flatMap((component = {}) => {
                const type = normalizeTemplateComponentType(component?.type || 'BODY');
                if (type === 'BUTTONS') {
                    return buildTemplateButtonComponents(component?.buttons, previewMaps);
                }
                if (type !== 'HEADER' && type !== 'BODY') return [];
                const placeholderIndexes = parsePlaceholderIndexesFromText(component?.text || '');
                if (placeholderIndexes.length === 0) return [];
                const componentMap = variableMapJson?.[toLower(type)] || {};
                return [{
                    type,
                    parameters: placeholderIndexes.map((placeholderIndex) => ({
                        type: 'text',
                        text: resolveTemplatePlaceholderValue({
                            placeholderIndex,
                            componentMap,
                            previewMaps
                        })
                    }))
                }];
            })
            .filter((component) => Array.isArray(component.parameters) && component.parameters.length > 0);
    };

    const buildTemplatePreviewText = (template = {}, previewPayload = {}, templateName = '') => {
        const templateComponents = ensureArray(template?.componentsJson);
        const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
            ? template.variableMapJson
            : {};
        const previewMaps = buildTemplatePreviewMaps(previewPayload);
        const rendered = ensureArray(templateComponents)
            .map((component = {}) => {
                const type = normalizeTemplateComponentType(component?.type || 'BODY');
                if (type !== 'HEADER' && type !== 'BODY' && type !== 'FOOTER') return '';
                const sourceText = toText(component?.text);
                if (!sourceText) return '';
                const componentMap = variableMapJson?.[toLower(type)] || {};
                return sourceText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, rawIndex) => {
                    const nextIndex = Number(rawIndex);
                    if (!Number.isFinite(nextIndex) || nextIndex <= 0) return '';
                    return resolveTemplatePlaceholderValue({
                        placeholderIndex: nextIndex,
                        componentMap,
                        previewMaps
                    });
                }).trim();
            })
            .filter(Boolean);
        return rendered.join('\n').trim() || `Template: ${toText(templateName) || 'sin nombre'}`;
    };

    const registerTemplateMessageHandlers = ({
        socket,
        tenantId = 'default',
        authContext,
        guardRateLimit,
        transportOrchestrator,
        resolveScopedSendTarget,
        emitRealtimeOutgoingMessage,
        recordConversationEvent
    } = {}) => {
        socket.on('send_template_message', async (payload = {}) => {
            if (!guardRateLimit(socket, 'send_template_message')) return;
            if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar templates', errorEvent: 'template_message_error' })) return;
            try {
                const templateName = toText(payload?.templateName);
                const templateLanguage = toLower(payload?.templateLanguage || 'es') || 'es';
                const customerId = toText(payload?.customerId || '');
                if (!templateName) {
                    socket.emit('template_message_error', 'templateName requerido para enviar template.');
                    return;
                }

                const target = await resolveScopedSendTarget({
                    rawChatId: payload?.to || payload?.chatId,
                    rawPhone: payload?.toPhone,
                    errorEvent: 'template_message_error',
                    action: 'enviar templates'
                });
                if (!target?.ok) return;

                const moduleContext = target.moduleContext || socket?.data?.waModule || null;
                const moduleId = toText(moduleContext?.moduleId || target.scopeModuleId || payload?.moduleId || '');
                const agentMeta = sanitizeAgentMeta(buildSocketAgentMeta(authContext, moduleContext));
                const template = await metaTemplatesService.getTemplateRecord(tenantId, {
                    templateName,
                    moduleId,
                    templateLanguage
                });

                if (!Array.isArray(template?.componentsJson) || template.componentsJson.length === 0) {
                    socket.emit('template_message_error', 'No se encontraron componentes del template para este modulo.');
                    return;
                }

                const previewPayload = await templateVariablesService.getPreview(tenantId, {
                    chatId: target.scopedChatId || target.targetChatId,
                    customerId
                });
                const components = buildTemplateSendComponents(template, previewPayload);
                const previewText = buildTemplatePreviewText(template, previewPayload, templateName);

                const providerResponse = await waClient.sendTemplateMessage(target.targetChatId, {
                    templateName,
                    languageCode: templateLanguage,
                    components,
                    metadata: {
                        previewText,
                        templateName,
                        templateLanguage,
                        templateId: toText(payload?.templateId || '')
                    }
                });

                const sentMessageId = getSerializedMessageId(providerResponse);
                const sentMessage = {
                    id: sentMessageId || ('local_template_' + Date.now().toString(36)),
                    to: target.targetChatId,
                    body: previewText,
                    timestamp: Math.floor(Date.now() / 1000),
                    ack: 1,
                    type: 'chat',
                    hasMedia: false
                };

                if (sentMessageId && agentMeta) {
                    rememberOutgoingAgentMeta(sentMessageId, agentMeta);
                }

                await emitRealtimeOutgoingMessage({
                    sentMessage,
                    fallbackChatId: target.targetChatId,
                    fallbackBody: previewText,
                    moduleContext,
                    agentMeta,
                    mediaPayload: null
                });

                await recordConversationEvent({
                    chatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId,
                    eventType: 'chat.message.outgoing.text',
                    eventSource: 'socket',
                    payload: {
                        messageId: sentMessageId || null,
                        kind: 'template',
                        templateName,
                        templateLanguage,
                        componentsCount: components.length
                    }
                });

                socket.emit('template_message_sent', {
                    ok: true,
                    chatId: target.scopedChatId || target.targetChatId,
                    baseChatId: target.targetChatId,
                    scopeModuleId: target.scopeModuleId || null,
                    templateId: toText(payload?.templateId || '') || null,
                    templateName,
                    templateLanguage,
                    previewText,
                    messageId: sentMessageId || null
                });
            } catch (error) {
                socket.emit('template_message_error', String(error?.message || 'No se pudo enviar el template.'));
            }
        });
    };

    return {
        registerTemplateMessageHandlers
    };
}

module.exports = {
    createSocketTemplateMessagesService
};
