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
