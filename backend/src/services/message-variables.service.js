const CATALOG_VARIABLE_REGEX = /(\{\{catalogo\}\}|\{\{producto:([^}]+)\}\})/g;

/**
 * Parsea texto con variables de catalogo y retorna segmentos ordenados
 * para envio secuencial.
 *
 * Segmento:
 *   { type: 'text', content: string }
 *   { type: 'catalog' }
 *   { type: 'product', sku: string }
 *
 * Si no hay variables de catalogo/producto en el texto, retorna el texto
 * sin modificar para conservar el comportamiento actual.
 */
function resolveMessageSegments(rawText = '') {
    const source = String(rawText || '');
    const matches = Array.from(source.matchAll(CATALOG_VARIABLE_REGEX));
    if (matches.length === 0) {
        return [{ type: 'text', content: source }];
    }

    const segments = [];
    let cursor = 0;

    for (const match of matches) {
        const matchText = match[0];
        const matchIndex = Number(match.index || 0);
        const textBefore = source.slice(cursor, matchIndex);
        if (textBefore.trim()) {
            segments.push({ type: 'text', content: textBefore });
        }

        if (matchText === '{{catalogo}}') {
            segments.push({ type: 'catalog' });
        } else {
            segments.push({ type: 'product', sku: match[2] });
        }

        cursor = matchIndex + matchText.length;
    }

    const trailingText = source.slice(cursor);
    if (trailingText.trim()) {
        segments.push({ type: 'text', content: trailingText });
    }

    return segments;
}

module.exports = {
    resolveMessageSegments
};
