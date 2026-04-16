import { API_URL } from '../../../../config/runtime';
import { isTemplateAllowedInIndividual } from '../../../saas/helpers/templateUseCase.helpers';

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

async function readJsonResponse(response, fallbackMessage) {
    let payload = null;
    try {
        payload = await response.json();
    } catch (_) {
        payload = null;
    }

    if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || fallbackMessage || 'Request failed.'));
    }

    return payload && typeof payload === 'object' ? payload : {};
}

function buildHeaders(buildApiHeaders, { includeJson = false } = {}) {
    if (typeof buildApiHeaders !== 'function') return includeJson ? { 'Content-Type': 'application/json' } : undefined;
    const headers = buildApiHeaders({ includeJson }) || {};
    if (includeJson && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return headers;
}

export async function listApprovedIndividualTemplates(buildApiHeaders, { moduleId = '' } = {}) {
    const params = new URLSearchParams();
    const cleanModuleId = toLower(moduleId);
    params.set('status', 'approved');
    params.set('limit', '200');
    if (cleanModuleId) params.set('scopeModuleId', cleanModuleId);

    const response = await fetch(`${API_URL}/api/tenant/meta-templates?${params.toString()}`, {
        headers: buildHeaders(buildApiHeaders)
    });
    const payload = await readJsonResponse(response, 'No se pudieron cargar templates aprobados.');
    const items = Array.isArray(payload?.items) ? payload.items : [];

    return items
        .filter((item) => isTemplateAllowedInIndividual(item?.useCase))
        .map((item) => ({
            ...item,
            templateId: toText(item?.templateId || item?.metaTemplateId || item?.templateName),
            templateName: toText(item?.templateName),
            templateLanguage: toLower(item?.templateLanguage || 'es') || 'es',
            moduleId: toText(item?.moduleId),
            useCase: toLower(item?.useCase || 'both') || 'both'
        }))
        .filter((item) => item.templateId && item.templateName);
}

export async function getTemplateVariablesPreview(buildApiHeaders, { chatId = '', customerId = '' } = {}) {
    const params = new URLSearchParams();
    const cleanChatId = toText(chatId);
    const cleanCustomerId = toText(customerId);
    if (cleanChatId) params.set('chatId', cleanChatId);
    if (cleanCustomerId) params.set('customerId', cleanCustomerId);

    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_URL}/api/tenant/template-variables/preview${suffix}`, {
        headers: buildHeaders(buildApiHeaders)
    });
    return readJsonResponse(response, 'No se pudo cargar la preview de variables.');
}
