export async function fetchTenantLabels(requestJson, tenantId, { includeInactive = true } = {}) {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) return { items: [] };
    const query = includeInactive ? '?includeInactive=true' : '';
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels${query}`);
}

export async function createTenantLabel(requestJson, tenantId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/labels`, {
        method: 'POST',
        body: payload
    });
}

export async function updateTenantLabel(requestJson, tenantId, labelId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/labels/${encodeURIComponent(String(labelId || '').trim().toUpperCase())}`, {
        method: 'PUT',
        body: payload
    });
}

export async function deactivateTenantLabel(requestJson, tenantId, labelId) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/labels/${encodeURIComponent(String(labelId || '').trim().toUpperCase())}/deactivate`, {
        method: 'POST'
    });
}
