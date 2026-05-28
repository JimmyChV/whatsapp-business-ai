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
    const MULTIMEDIA_HEADER_FORMATS = new Set(['IMAGE', 'VIDEO', 'DOCUMENT']);

    const isDataUrl = (value = '') => /^data:[^;]+;base64,/i.test(toText(value));
    const parseDataUrlPayload = (value = '') => {
        const input = toText(value);
        const match = input.match(/^data:([^;]+);base64,(.+)$/i);
        if (!match) return null;
        return {
            mimetype: toText(match[1]).toLowerCase() || 'application/octet-stream',
            mediaData: toText(match[2])
        };
    };

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

    const buildTemplateSendComponents = async (template = {}, previewPayload = {}, options = {}) => {
        const templateComponents = ensureArray(template?.componentsJson);
        const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
            ? template.variableMapJson
            : {};
        const previewMaps = buildTemplatePreviewMaps(previewPayload);
        const headerMedia = options?.headerMedia && typeof options.headerMedia === 'object'
            ? options.headerMedia
            : null;
        const resolvedComponents = [];
        for (const component of ensureArray(templateComponents)) {
                const type = normalizeTemplateComponentType(component?.type || 'BODY');
                if (type === 'BUTTONS') {
                    resolvedComponents.push(...buildTemplateButtonComponents(component?.buttons, previewMaps));
                    continue;
                }
                if (type !== 'HEADER' && type !== 'BODY') continue;
                const format = toUpper(component?.format || '');
                if (type === 'HEADER' && MULTIMEDIA_HEADER_FORMATS.has(format)) {
                    if (!headerMedia?.base64 || !isDataUrl(headerMedia.base64)) continue;
                    if (!waClient || typeof waClient.uploadMedia !== 'function') {
                        throw new Error('El transporte actual no soporta uploads de media para templates.');
                    }
                    const parsed = parseDataUrlPayload(headerMedia.base64);
                    if (!parsed?.mediaData) continue;
                    const mediaId = await waClient.uploadMedia(
                        parsed.mediaData,
                        parsed.mimetype,
                        toText(headerMedia.name || 'template-header')
                    );
                    if (!mediaId) continue;
                    const parameterType = toLower(format);
                    resolvedComponents.push({
                        type,
                        parameters: [{
                            type: parameterType,
                            [parameterType]: { id: mediaId }
                        }]
                    });
                    continue;
                }
                const placeholderIndexes = parsePlaceholderIndexesFromText(component?.text || '');
                if (placeholderIndexes.length === 0) continue;
                const componentMap = variableMapJson?.[toLower(type)] || {};
                resolvedComponents.push({
                    type,
                    parameters: placeholderIndexes.map((placeholderIndex) => ({
                        type: 'text',
                        text: resolveTemplatePlaceholderValue({
                            placeholderIndex,
                            componentMap,
                            previewMaps
                        })
                    }))
                });
        }
        return resolvedComponents.filter((component) => Array.isArray(component.parameters) && component.parameters.length > 0);
    };

    const buildTemplatePreviewText = (template = {}, previewPayload = {}, templateName = '', options = {}) => {
        const templateComponents = ensureArray(template?.componentsJson);
        const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
            ? template.variableMapJson
            : {};
        const previewMaps = buildTemplatePreviewMaps(previewPayload);
        const rendered = ensureArray(templateComponents)
            .map((component = {}) => {
                const type = normalizeTemplateComponentType(component?.type || 'BODY');
                if (type !== 'HEADER' && type !== 'BODY' && type !== 'FOOTER') return '';
                const format = toUpper(component?.format || '');
                if (type === 'HEADER' && MULTIMEDIA_HEADER_FORMATS.has(format)) {
                    const fileName = toText(options?.headerMedia?.name || '');
                    return fileName ? `[${format}] ${fileName}` : `[${format}]`;
                }
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

    const buildTemplateRealtimeComponents = (template = {}, previewPayload = {}, options = {}) => {
        const templateComponents = ensureArray(template?.componentsJson);
        const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
            ? template.variableMapJson
            : {};
        const previewMaps = buildTemplatePreviewMaps(previewPayload);

        return ensureArray(templateComponents)
            .map((component = {}) => {
                const type = normalizeTemplateComponentType(component?.type || 'BODY');
                if (type !== 'HEADER' && type !== 'BODY' && type !== 'FOOTER') return null;
                const format = toUpper(component?.format || '');
                if (type === 'HEADER' && MULTIMEDIA_HEADER_FORMATS.has(format)) {
                    return {
                        type,
                        format: toLower(format),
                        text: '',
                        resolvedText: toText(options?.headerMedia?.name || `[${format}]`),
                        parameters: []
                    };
                }
                const sourceText = toText(component?.text);
                if (!sourceText) return null;
                const componentMap = variableMapJson?.[toLower(type)] || {};
                const parameters = parsePlaceholderIndexesFromText(sourceText).map((placeholderIndex) => ({
                    type: 'text',
                    text: resolveTemplatePlaceholderValue({
                        placeholderIndex,
                        componentMap,
                        previewMaps
                    })
                }));
                const resolvedText = sourceText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, rawIndex) => {
                    const nextIndex = Number(rawIndex);
                    if (!Number.isFinite(nextIndex) || nextIndex <= 0) return '';
                    return resolveTemplatePlaceholderValue({
                        placeholderIndex: nextIndex,
                        componentMap,
                        previewMaps
                    });
                }).trim();
                return {
                    type,
                    text: sourceText,
                    resolvedText,
                    parameters: parameters.filter((parameter) => toText(parameter?.text))
                };
            })
            .filter(Boolean);
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
        const recentSendIds = new Set();
        socket.on('send_template_message', async (payload = {}) => {
            if (!guardRateLimit(socket, 'send_template_message')) return;
            if (!transportOrchestrator.ensureTransportReady(socket, { action: 'enviar templates', errorEvent: 'template_message_error' })) return;
            try {
                const sendRequestId = toText(payload?.sendRequestId || payload?.clientTempId || '');
                if (sendRequestId) {
                    if (recentSendIds.has(sendRequestId)) return;
                    recentSendIds.add(sendRequestId);
                    setTimeout(() => {
                        recentSendIds.delete(sendRequestId);
                    }, 30000);
                }
                const templateName = toText(payload?.templateName);
                const templateLanguage = toLower(payload?.templateLanguage || 'es') || 'es';
                const customerId = toText(payload?.customerId || '');
                const validFrom = toText(payload?.validFrom || '');
                const validTo = toText(payload?.validTo || '');
                const headerMedia = payload?.headerMedia && typeof payload.headerMedia === 'object'
                    ? payload.headerMedia
                    : null;
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
                    customerId,
                    validFrom,
                    validTo
                });
                const headerComponent = Array.isArray(template?.componentsJson)
                    ? template.componentsJson.find((component) => toText(component?.type).toUpperCase() === 'HEADER')
                    : null;
                const templateHeaderType = toText(headerComponent?.format || '').toUpperCase() || 'TEXT';
                const templateHeaderImageUrl = templateHeaderType === 'IMAGE'
                    ? (
                        toText(headerMedia?.base64 || '')
                        || toText(headerComponent?.example?.header_handle?.[0] || '')
                        || null
                    )
                    : null;
                const components = await buildTemplateSendComponents(template, previewPayload, { headerMedia });
                const realtimeTemplateComponents = buildTemplateRealtimeComponents(template, previewPayload, { headerMedia });
                const previewText = buildTemplatePreviewText(template, previewPayload, templateName, { headerMedia });
                const hasMedia = components.some((component) => ensureArray(component?.parameters).some((parameter) => {
                    const parameterType = toLower(parameter?.type || '');
                    return parameterType === 'image' || parameterType === 'video' || parameterType === 'document';
                }));

                const providerResponse = await waClient.sendTemplateMessage(target.targetChatId, {
                    templateName,
                    languageCode: templateLanguage,
                    components,
                    metadata: {
                        previewText,
                        templateName,
                        templateLanguage,
                        templateId: toText(payload?.templateId || ''),
                        templateComponents: realtimeTemplateComponents
                    }
                });

                const sentMessageId = getSerializedMessageId(providerResponse);
                const templateMetadata = {
                    previewText,
                    templateName,
                    templateLanguage,
                    templateId: toText(payload?.templateId || ''),
                    clientTempId: toText(payload?.clientTempId || ''),
                    templateComponents: realtimeTemplateComponents,
                    templateHeaderType,
                    templateHeaderImageUrl
                };
                const sentMessage = {
                    id: sentMessageId || ('local_template_' + Date.now().toString(36)),
                    clientTempId: toText(payload?.clientTempId || '') || null,
                    to: target.targetChatId,
                    body: previewText,
                    timestamp: Math.floor(Date.now() / 1000),
                    ack: 1,
                    type: 'template',
                    hasMedia,
                    templateName,
                    templateLanguage,
                    templatePreviewText: previewText,
                    templateComponents: realtimeTemplateComponents,
                    templateHeaderType,
                    templateHeaderImageUrl,
                    _data: {
                        templateName,
                        templateLanguage,
                        templateComponents: realtimeTemplateComponents,
                        metadata: templateMetadata
                    }
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
                    clientTempId: toText(payload?.clientTempId || '') || null,
                    templateName,
                    templateLanguage,
                    previewText,
                    templateComponents: realtimeTemplateComponents,
                    templateHeaderType,
                    templateHeaderImageUrl,
                    type: 'template',
                    timestamp: Math.floor(Date.now() / 1000),
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
