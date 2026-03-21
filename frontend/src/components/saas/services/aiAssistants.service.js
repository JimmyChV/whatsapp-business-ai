export async function fetchTenantAiAssistants(requestJson, tenantId) {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) return { items: [] };
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/ai-assistants`);
}

export async function createTenantAiAssistant(requestJson, tenantId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/ai-assistants`, {
        method: 'POST',
        body: payload
    });
}

export async function updateTenantAiAssistant(requestJson, tenantId, assistantId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/ai-assistants/${encodeURIComponent(String(assistantId || '').trim().toUpperCase())}`, {
        method: 'PUT',
        body: payload
    });
}

export async function setTenantAiAssistantDefault(requestJson, tenantId, assistantId) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/ai-assistants/${encodeURIComponent(String(assistantId || '').trim().toUpperCase())}/set-default`, {
        method: 'POST',
        body: {}
    });
}

export async function setTenantAiAssistantActive(requestJson, tenantId, assistantId, isActive) {
    const action = isActive ? 'activate' : 'deactivate';
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/ai-assistants/${encodeURIComponent(String(assistantId || '').trim().toUpperCase())}/${action}`, {
        method: 'POST',
        body: {}
    });
}
