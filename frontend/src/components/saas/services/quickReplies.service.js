export async function fetchQuickReplyLibraries(requestJson, tenantId, { includeInactive = true } = {}) {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) return { items: [] };
    const query = includeInactive ? '?includeInactive=true' : '';
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-libraries${query}`);
}

export async function fetchQuickReplyItems(requestJson, tenantId, { includeInactive = true } = {}) {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) return { items: [] };
    const query = includeInactive ? '?includeInactive=true' : '';
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/quick-reply-items${query}`);
}

export async function createQuickReplyLibrary(requestJson, tenantId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/quick-reply-libraries`, {
        method: 'POST',
        body: payload
    });
}

export async function updateQuickReplyLibrary(requestJson, tenantId, libraryId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/quick-reply-libraries/${encodeURIComponent(String(libraryId || '').trim().toUpperCase())}`, {
        method: 'PUT',
        body: payload
    });
}

export async function deactivateQuickReplyLibrary(requestJson, tenantId, libraryId) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/quick-reply-libraries/${encodeURIComponent(String(libraryId || '').trim().toUpperCase())}/deactivate`, {
        method: 'POST',
        body: {}
    });
}

export async function createQuickReplyItem(requestJson, tenantId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/quick-reply-items`, {
        method: 'POST',
        body: payload
    });
}

export async function updateQuickReplyItem(requestJson, tenantId, itemId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/quick-reply-items/${encodeURIComponent(String(itemId || '').trim().toUpperCase())}`, {
        method: 'PUT',
        body: payload
    });
}

export async function deactivateQuickReplyItem(requestJson, tenantId, itemId) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/quick-reply-items/${encodeURIComponent(String(itemId || '').trim().toUpperCase())}/deactivate`, {
        method: 'POST',
        body: {}
    });
}
