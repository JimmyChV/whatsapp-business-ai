function toText(value = '') {
    return String(value ?? '').trim();
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

function parsePlaceholderIndexesFromText(text = '') {
    const matches = String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g);
    const indexes = new Set();
    for (const match of matches) {
        const next = Number(match?.[1]);
        if (Number.isFinite(next) && next > 0) indexes.add(Math.floor(next));
    }
    return Array.from(indexes).sort((left, right) => left - right);
}

function buildSentParametersByType(sentComponents = []) {
    return ensureArray(sentComponents).reduce((acc, component = {}) => {
        const type = normalizeTemplateComponentType(component?.type || 'BODY');
        const parameters = ensureArray(component?.parameters)
            .map((parameter = {}) => {
                if (parameter && typeof parameter === 'object') {
                    return toText(parameter?.text ?? parameter?.payload ?? parameter?.value ?? '');
                }
                return toText(parameter);
            })
            .filter(Boolean);
        if (!acc.has(type)) acc.set(type, []);
        acc.get(type).push(parameters);
        return acc;
    }, new Map());
}

function resolveTemplateTextWithSentParameters(sourceText = '', parameterValues = []) {
    const normalizedValues = ensureArray(parameterValues);
    return String(sourceText || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, rawIndex) => {
        const nextIndex = Number(rawIndex);
        if (!Number.isFinite(nextIndex) || nextIndex <= 0) return '';
        return toText(normalizedValues[nextIndex - 1] ?? '');
    }).trim();
}

function buildRenderedTemplateFromRecord(template = {}, sentComponents = [], templateName = '') {
    const templateComponents = ensureArray(template?.componentsJson);
    const sentParametersByType = buildSentParametersByType(sentComponents);
    const renderedComponents = templateComponents
        .map((component = {}) => {
            const type = normalizeTemplateComponentType(component?.type || 'BODY');
            if (type !== 'HEADER' && type !== 'BODY' && type !== 'FOOTER') return null;
            const sourceText = toText(component?.text);
            if (!sourceText) return null;
            const sentParameterGroups = sentParametersByType.get(type) || [];
            const parameterValues = sentParameterGroups[0] || [];
            const placeholderIndexes = parsePlaceholderIndexesFromText(sourceText);
            return {
                type,
                text: sourceText,
                resolvedText: resolveTemplateTextWithSentParameters(sourceText, parameterValues),
                parameters: placeholderIndexes.map((placeholderIndex) => ({
                    type: 'text',
                    text: toText(parameterValues[placeholderIndex - 1] ?? '')
                })).filter((parameter) => parameter.text)
            };
        })
        .filter(Boolean);

    const previewText = renderedComponents
        .map((component) => toText(component?.resolvedText || component?.text || ''))
        .filter(Boolean)
        .join('\n')
        .trim() || `Template: ${toText(templateName) || 'sin nombre'}`;

    return {
        previewText,
        templateComponents: renderedComponents
    };
}

module.exports = {
    buildRenderedTemplateFromRecord
};
