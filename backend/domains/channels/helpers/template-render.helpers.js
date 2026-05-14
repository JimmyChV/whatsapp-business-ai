function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function toUpper(value = '') {
    return toText(value).toUpperCase();
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function normalizeTemplateComponentType(value = '') {
    return toUpper(value || 'BODY') || 'BODY';
}

function normalizeTemplateToken(value = '') {
    return toLower(value).replace(/[{}]/g, '').trim();
}

function parsePlaceholderIndexesFromText(text = '') {
    const matches = String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g);
    const indexes = new Set();
    for (const match of matches) {
        const next = Number(match?.[1]);
        if (Number.isFinite(next) && next > 0) indexes.add(Math.floor(next));
    }
    return Array.from(indexes).sort((left, right) => left - right);
}

function buildTemplatePreviewMaps(previewPayload = {}) {
    return ensureArray(previewPayload?.categories)
        .flatMap((category) => ensureArray(category?.variables))
        .reduce((acc, variable = {}) => {
            const placeholderIndex = Number(variable?.placeholderIndex);
            const normalizedKey = normalizeTemplateToken(variable?.key);
            const nextEntry = {
                key: normalizedKey,
                value: toText(variable?.previewValue),
                label: toText(variable?.label || variable?.key)
            };
            if (normalizedKey) acc.byKey.set(normalizedKey, nextEntry);
            if (Number.isFinite(placeholderIndex) && placeholderIndex > 0) {
                acc.byIndex.set(placeholderIndex, nextEntry);
            }
            return acc;
        }, {
            byKey: new Map(),
            byIndex: new Map()
        });
}

function resolveTemplatePlaceholderValue({
    placeholderIndex = 0,
    componentMap = {},
    previewMaps = { byKey: new Map(), byIndex: new Map() }
} = {}) {
    const originalToken = normalizeTemplateToken(componentMap?.sequentialToOriginal?.[placeholderIndex] || '');
    if (originalToken) {
        const fromKey = previewMaps.byKey.get(originalToken);
        if (fromKey && typeof fromKey.value === 'string') return fromKey.value;
    }
    return previewMaps.byIndex.get(placeholderIndex)?.value || '';
}

function buildTemplateButtonComponents(buttons = [], previewMaps = { byKey: new Map(), byIndex: new Map() }) {
    return ensureArray(buttons)
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
}

function buildTemplateSendComponents(template = {}, previewPayload = {}) {
    const templateComponents = ensureArray(template?.componentsJson);
    const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
        ? template.variableMapJson
        : {};
    const previewMaps = buildTemplatePreviewMaps(previewPayload);
    return templateComponents
        .flatMap((component = {}) => {
            const type = normalizeTemplateComponentType(component?.type || 'BODY');
            if (type === 'BUTTONS') return buildTemplateButtonComponents(component?.buttons, previewMaps);
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
}

function buildTemplatePreviewText(template = {}, previewPayload = {}, templateName = '') {
    const templateComponents = ensureArray(template?.componentsJson);
    const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
        ? template.variableMapJson
        : {};
    const previewMaps = buildTemplatePreviewMaps(previewPayload);
    const rendered = templateComponents
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
}

function buildTemplateRealtimeComponents(template = {}, previewPayload = {}) {
    const templateComponents = ensureArray(template?.componentsJson);
    const variableMapJson = template?.variableMapJson && typeof template.variableMapJson === 'object'
        ? template.variableMapJson
        : {};
    const previewMaps = buildTemplatePreviewMaps(previewPayload);

    return templateComponents
        .map((component = {}) => {
            const type = normalizeTemplateComponentType(component?.type || 'BODY');
            if (type !== 'HEADER' && type !== 'BODY' && type !== 'FOOTER') return null;
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
}

module.exports = {
    buildTemplateSendComponents,
    buildTemplatePreviewText,
    buildTemplateRealtimeComponents
};
