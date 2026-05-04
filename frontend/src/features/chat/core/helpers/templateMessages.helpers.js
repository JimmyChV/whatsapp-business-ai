function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function normalizeTemplateToken(value = '') {
    return toLower(value).replace(/[{}]/g, '').trim();
}

function normalizeComponentType(value = '') {
    return toText(value).toUpperCase() || 'BODY';
}

function normalizeParameterText(parameter = {}) {
    if (parameter && typeof parameter === 'object') {
        if (parameter.text !== undefined && parameter.text !== null) return toText(parameter.text);
        if (parameter.payload !== undefined && parameter.payload !== null) return toText(parameter.payload);
    }
    return toText(parameter);
}

export function isGenericTemplateFallbackText(text = '', templateName = '') {
    const safeText = toLower(text);
    const safeTemplateName = toLower(templateName);
    if (!safeText) return true;
    if (!safeTemplateName) return safeText === 'template' || safeText.startsWith('template:');
    return safeText === `template: ${safeTemplateName}` || safeText === safeTemplateName;
}

export function mergeTemplateMessageContent(existingMessage = {}, incomingMessage = {}) {
    const existing = existingMessage && typeof existingMessage === 'object' ? existingMessage : {};
    const incoming = incomingMessage && typeof incomingMessage === 'object' ? incomingMessage : {};
    const existingTemplate = buildRenderedTemplateMessage(existing);
    const incomingTemplate = buildRenderedTemplateMessage(incoming);
    const safeTemplateName = toText(incoming?.templateName || existing?.templateName || '');
    const incomingPreviewText = toText(incoming?.templatePreviewText || incoming?.body || '');
    const existingPreviewText = toText(existing?.templatePreviewText || existing?.body || '');
    const incomingLooksGeneric = isGenericTemplateFallbackText(incomingPreviewText, safeTemplateName);
    const existingHasRealContent = Boolean(
        existingTemplate.headerText
        || existingTemplate.bodyText
        || existingTemplate.footerText
        || (
            existingTemplate.previewText
            && !isGenericTemplateFallbackText(existingTemplate.previewText, safeTemplateName)
        )
    );
    const incomingHasStructuredContent = Boolean(
        incomingTemplate.headerText
        || incomingTemplate.bodyText
        || incomingTemplate.footerText
        || (
            incomingTemplate.previewText
            && !isGenericTemplateFallbackText(incomingTemplate.previewText, safeTemplateName)
        )
    );

    const merged = {
        ...existing,
        ...incoming
    };

    const incomingIsStructuredTemplate = Boolean(
        incomingTemplate.isTemplateMessage
        && (
            Array.isArray(incoming?.templateComponents)
            || toLower(incoming?.type || '') === 'template'
            || toText(incoming?.templatePreviewText || '')
        )
    );
    const incomingLooksLikePlainMessage = Boolean(
        !incomingIsStructuredTemplate
        && (
            toText(incoming?.body || '')
            || toText(incoming?.caption || '')
            || toText(incoming?.text || '')
        )
    );

    if (existingHasRealContent && !incomingHasStructuredContent) {
        merged.templateComponents = Array.isArray(existing?.templateComponents) ? existing.templateComponents : [];
        merged.templatePreviewText = existing?.templatePreviewText || existingPreviewText || null;
        merged.body = existing?.body || existingPreviewText || merged.body;
    } else if (Array.isArray(incoming?.templateComponents) && incoming.templateComponents.length > 0) {
        merged.templateComponents = incoming.templateComponents;
    } else if (!Array.isArray(merged.templateComponents)) {
        merged.templateComponents = Array.isArray(existing?.templateComponents) ? existing.templateComponents : [];
    }

    if (!toText(merged.templateName) && safeTemplateName) {
        merged.templateName = safeTemplateName;
    }

    if (!toText(merged.templatePreviewText) || (incomingLooksGeneric && existingHasRealContent)) {
        merged.templatePreviewText = existing?.templatePreviewText || existingPreviewText || merged.templatePreviewText || null;
    }

    if (!toText(merged.body) || (incomingLooksGeneric && existingHasRealContent)) {
        merged.body = existing?.body || existingPreviewText || merged.body;
    }

    if (incomingLooksLikePlainMessage) {
        merged.templateComponents = [];
        merged.templatePreviewText = null;
        merged.templateName = null;
        merged.templateLanguage = null;
    }

    return merged;
}

export function parseTemplatePlaceholderIndexes(text = '') {
    const matches = String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g);
    const indexes = new Set();
    for (const match of matches) {
        const next = Number(match?.[1]);
        if (Number.isFinite(next) && next > 0) indexes.add(Math.floor(next));
    }
    return Array.from(indexes).sort((left, right) => left - right);
}

export function buildTemplatePreviewValueMap(previewPayload = {}) {
    const categories = Array.isArray(previewPayload?.categories) ? previewPayload.categories : [];
    return categories.flatMap((category) => (Array.isArray(category?.variables) ? category.variables : []))
        .reduce((acc, variable = {}) => {
            const key = toLower(variable?.key);
            const placeholderIndex = Number(variable?.placeholderIndex);
            const previewValue = toText(variable?.previewValue);
            const resolved = previewValue || '';
            const entry = {
                key,
                value: resolved,
                label: toText(variable?.label || key),
                resolved: Boolean(resolved)
            };
            if (key) acc.byKey.set(key, entry);
            if (Number.isFinite(placeholderIndex) && placeholderIndex > 0) {
                acc.byIndex.set(placeholderIndex, entry);
            }
            return acc;
        }, {
            byKey: new Map(),
            byIndex: new Map()
        });
}

function resolveTemplatePreviewValue({
    placeholderIndex = 0,
    componentMap = {},
    valueMap = { byKey: new Map(), byIndex: new Map() }
} = {}) {
    const originalToken = normalizeTemplateToken(componentMap?.sequentialToOriginal?.[placeholderIndex] || '');
    if (originalToken) {
        const fromKey = valueMap.byKey.get(originalToken);
        if (fromKey && typeof fromKey === 'object') {
            return {
                key: originalToken,
                value: toText(fromKey.value),
                label: toText(fromKey.label || originalToken),
                resolved: Boolean(toText(fromKey.value))
            };
        }
    }

    return valueMap.byIndex.get(placeholderIndex) || {
        key: '',
        value: '',
        label: `Variable ${placeholderIndex}`,
        resolved: false
    };
}

export function buildTemplateResolvedPreview(template = {}, previewPayload = {}) {
    const templateComponents = Array.isArray(template?.componentsJson) ? template.componentsJson : [];
    const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
        ? template.variableMapJson
        : {};
    const valueMap = buildTemplatePreviewValueMap(previewPayload);
    const resolvedComponents = templateComponents.map((component = {}) => {
        const type = normalizeComponentType(component?.type || 'BODY');
        const text = toText(component?.text);
        const placeholderIndexes = parseTemplatePlaceholderIndexes(text);
        const componentMap = variableMapJson?.[toLower(type)] || {};
        const resolvedText = text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, rawIndex) => {
            const nextIndex = Number(rawIndex);
            if (!Number.isFinite(nextIndex) || nextIndex <= 0) return '';
            return resolveTemplatePreviewValue({
                placeholderIndex: nextIndex,
                componentMap,
                valueMap
            })?.value || '';
        });
        const parameters = placeholderIndexes.map((placeholderIndex) => ({
            placeholderIndex,
            ...resolveTemplatePreviewValue({
                placeholderIndex,
                componentMap,
                valueMap
            })
        }));
        return {
            type,
            format: toLower(component?.format),
            text,
            resolvedText: toText(resolvedText),
            parameters
        };
    });

    const findComponentText = (type) => resolvedComponents
        .find((component) => component.type === type && toText(component.resolvedText || component.text))?.resolvedText
        || resolvedComponents.find((component) => component.type === type)?.text
        || '';

    const headerText = findComponentText('HEADER');
    const bodyText = findComponentText('BODY');
    const footerText = findComponentText('FOOTER');
    const previewText = [headerText, bodyText, footerText].filter(Boolean).join('\n').trim()
        || `Template: ${toText(template?.templateName) || 'sin nombre'}`;

    return {
        components: resolvedComponents,
        headerText,
        bodyText,
        footerText,
        previewText,
        valueMap
    };
}

export function buildRenderedTemplateMessage(message = {}) {
    const source = message && typeof message === 'object' ? message : {};
    const isOutgoingBusinessMessage = Boolean(source?.fromMe);
    const isExplicitTemplateType = toLower(source?.type || '') === 'template';
    const templateName = toText(source?.templateName || '');
    const templateLanguage = toText(source?.templateLanguage || '');
    const rawTemplatePreviewText = toText(source?.templatePreviewText || '');
    const rawBodyText = toText(source?.body || '');
    const templateComponents = Array.isArray(source?.templateComponents) ? source.templateComponents : [];
    const renderedComponents = templateComponents
        .map((component = {}) => {
            const type = normalizeComponentType(component?.type || 'BODY');
            const parameters = Array.isArray(component?.parameters) ? component.parameters : [];
            const explicitResolvedText = toText(component?.resolvedText || component?.text || '');
            return {
                type,
                resolvedText: explicitResolvedText || parameters.map((parameter) => (
                    normalizeParameterText(parameter?.text ?? parameter?.value ?? parameter)
                )).filter(Boolean).join(' ')
            };
        })
        .filter((component) => component.resolvedText);

    const headerText = renderedComponents.find((component) => component.type === 'HEADER')?.resolvedText || '';
    const bodyText = renderedComponents.find((component) => component.type === 'BODY')?.resolvedText || '';
    const footerText = renderedComponents.find((component) => component.type === 'FOOTER')?.resolvedText || '';
    const previewText = [headerText, bodyText, footerText].filter(Boolean).join('\n').trim()
        || rawTemplatePreviewText
        || rawBodyText
        || `Template: ${templateName || 'sin nombre'}`;

    const hasStructuredComponents = renderedComponents.length > 0;
    const hasStrongTemplateMetadata = Boolean(
        templateName
        && (
            templateLanguage
            || isExplicitTemplateType
            || hasStructuredComponents
        )
    );
    const hasMeaningfulTemplatePreview = Boolean(
        rawTemplatePreviewText
        && !isGenericTemplateFallbackText(rawTemplatePreviewText, templateName)
        && hasStrongTemplateMetadata
    );
    const hasMeaningfulTemplateBody = Boolean(
        rawBodyText
        && templateName
        && rawBodyText !== rawTemplatePreviewText
        && !isGenericTemplateFallbackText(rawBodyText, templateName)
        && hasStrongTemplateMetadata
    );

    return {
        isTemplateMessage: Boolean(
            isOutgoingBusinessMessage
            && (
                isExplicitTemplateType
                || hasStructuredComponents
                || hasMeaningfulTemplatePreview
                || hasMeaningfulTemplateBody
            )
        ),
        templateName: templateName || null,
        templateLanguage: templateLanguage || null,
        headerText,
        bodyText,
        footerText,
        previewText,
        components: renderedComponents
    };
}
