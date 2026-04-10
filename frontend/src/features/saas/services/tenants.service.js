function encodeTenantId(tenantId) {
    return encodeURIComponent(String(tenantId || '').trim());
}

export async function fetchSaasOverview(requestJson) {
    return requestJson('/api/admin/saas/overview');
}

export async function fetchTenantSettings(requestJson, tenantId) {
    return requestJson(`/api/admin/saas/tenants/${encodeTenantId(tenantId)}/settings`);
}

export async function fetchTenantIntegrations(requestJson, tenantId) {
    return requestJson(`/api/admin/saas/tenants/${encodeTenantId(tenantId)}/integrations`);
}

export async function fetchTenantWaModules(requestJson, tenantId) {
    return requestJson(`/api/admin/saas/tenants/${encodeTenantId(tenantId)}/wa-modules`);
}

export async function fetchTenantCustomers(
    requestJson,
    tenantId,
    {
        limit = 300,
        offset = 0,
        includeInactive = true,
        updatedSince = ''
    } = {}
) {
    const params = new URLSearchParams();
    params.set('limit', String(Number(limit) > 0 ? Number(limit) : 300));
    params.set('offset', String(Number(offset) >= 0 ? Number(offset) : 0));
    params.set('includeInactive', includeInactive ? 'true' : 'false');
    if (String(updatedSince || '').trim()) {
        params.set('updatedSince', String(updatedSince || '').trim());
    }

    return requestJson(`/api/admin/saas/tenants/${encodeTenantId(tenantId)}/customers?${params.toString()}`);
}
