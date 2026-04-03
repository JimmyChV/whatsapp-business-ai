function assertRequestJson(requestJson) {
    if (typeof requestJson !== 'function') {
        throw new Error('requestJson es obligatorio.');
    }
}

function toCleanText(value = '') {
    return String(value || '').trim();
}

function toPositiveInt(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const integer = Math.floor(parsed);
    if (integer < 0) return fallback;
    return integer;
}

export async function createMetaTemplate(requestJson, { moduleId, templatePayload = {} } = {}) {
    assertRequestJson(requestJson);

    const cleanModuleId = toCleanText(moduleId);
    if (!cleanModuleId) throw new Error('moduleId requerido.');
    if (!templatePayload || typeof templatePayload !== 'object' || Array.isArray(templatePayload)) {
        throw new Error('templatePayload requerido.');
    }

    return requestJson('/api/tenant/meta-templates', {
        method: 'POST',
        body: {
            moduleId: cleanModuleId,
            templatePayload
        }
    });
}

export async function listMetaTemplates(
    requestJson,
    {
        scopeModuleId = '',
        status = '',
        limit = 50,
        offset = 0
    } = {}
) {
    assertRequestJson(requestJson);

    const params = new URLSearchParams();
    const cleanScopeModuleId = toCleanText(scopeModuleId).toLowerCase();
    const cleanStatus = toCleanText(status).toLowerCase();
    const cleanLimit = toPositiveInt(limit, 50);
    const cleanOffset = toPositiveInt(offset, 0);

    if (cleanScopeModuleId) params.set('scopeModuleId', cleanScopeModuleId);
    if (cleanStatus) params.set('status', cleanStatus);
    if (cleanLimit > 0) params.set('limit', String(cleanLimit));
    if (cleanOffset >= 0) params.set('offset', String(cleanOffset));

    const suffix = params.toString() ? `?${params.toString()}` : '';
    return requestJson(`/api/tenant/meta-templates${suffix}`);
}

export async function deleteMetaTemplate(requestJson, { templateId, moduleId = '' } = {}) {
    assertRequestJson(requestJson);

    const cleanTemplateId = toCleanText(templateId);
    if (!cleanTemplateId) throw new Error('templateId requerido.');

    const cleanModuleId = toCleanText(moduleId);
    const params = new URLSearchParams();
    if (cleanModuleId) params.set('moduleId', cleanModuleId);
    const suffix = params.toString() ? `?${params.toString()}` : '';

    return requestJson(`/api/tenant/meta-templates/${encodeURIComponent(cleanTemplateId)}${suffix}`, {
        method: 'DELETE'
    });
}

export async function syncMetaTemplates(requestJson, { moduleId } = {}) {
    assertRequestJson(requestJson);

    const cleanModuleId = toCleanText(moduleId);
    if (!cleanModuleId) throw new Error('moduleId requerido para sincronizar.');

    return requestJson('/api/tenant/meta-templates/sync', {
        method: 'POST',
        body: { moduleId: cleanModuleId }
    });
}
