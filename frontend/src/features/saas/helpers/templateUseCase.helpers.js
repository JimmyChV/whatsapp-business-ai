function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeTemplateToken(raw = '') {
    return toText(raw)
        .toLowerCase()
        .replace(/[{}]/g, '')
        .replace(/\s+/g, '_');
}

const VALID_TEMPLATE_USE_CASES = new Set(['campaign', 'individual', 'both']);

export const CAMPAIGN_TEMPLATE_VARIABLE_KEYS = new Set([
    'nombre_cliente',
    'telefono_cliente',
    'email_cliente',
    'idioma_preferido_cliente',
    'tags_cliente_csv',
    'customer_id'
]);

export function normalizeTemplateUseCase(value = '') {
    const normalized = toText(value).toLowerCase();
    return VALID_TEMPLATE_USE_CASES.has(normalized) ? normalized : 'both';
}

export function isTemplateAllowedInCampaigns(useCase = '') {
    const normalized = normalizeTemplateUseCase(useCase);
    return normalized === 'campaign' || normalized === 'both';
}

export function isTemplateAllowedInIndividual(useCase = '') {
    const normalized = normalizeTemplateUseCase(useCase);
    return normalized === 'individual' || normalized === 'both';
}

export function filterTemplateVariableCategoriesForUseCase(categories = [], useCase = '') {
    if (normalizeTemplateUseCase(useCase) !== 'campaign') {
        return Array.isArray(categories) ? categories : [];
    }

    return (Array.isArray(categories) ? categories : [])
        .map((category) => {
            const variables = Array.isArray(category?.variables) ? category.variables : [];
            return {
                ...category,
                variables: variables.filter((variable) => CAMPAIGN_TEMPLATE_VARIABLE_KEYS.has(
                    normalizeTemplateToken(variable?.key || variable?.token)
                ))
            };
        })
        .filter((category) => Array.isArray(category?.variables) && category.variables.length > 0);
}
