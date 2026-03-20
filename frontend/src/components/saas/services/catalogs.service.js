export async function fetchTenantCatalogs(requestJson, tenantId) {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) return { items: [] };
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/catalogs`);
}

export async function fetchTenantCatalogProducts(requestJson, tenantId, catalogId) {
    const cleanTenantId = String(tenantId || '').trim();
    const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
    if (!cleanTenantId || !cleanCatalogId) return { items: [] };
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/catalogs/${encodeURIComponent(cleanCatalogId)}/products`);
}

export async function createTenantCatalogProduct(requestJson, tenantId, catalogId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/catalogs/${encodeURIComponent(String(catalogId || '').trim().toUpperCase())}/products`, {
        method: 'POST',
        body: payload
    });
}

export async function updateTenantCatalogProduct(requestJson, tenantId, catalogId, productId, payload) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/catalogs/${encodeURIComponent(String(catalogId || '').trim().toUpperCase())}/products/${encodeURIComponent(String(productId || '').trim())}`, {
        method: 'PUT',
        body: payload
    });
}

export async function deactivateTenantCatalogProduct(requestJson, tenantId, catalogId, productId) {
    return requestJson(`/api/admin/saas/tenants/${encodeURIComponent(String(tenantId || '').trim())}/catalogs/${encodeURIComponent(String(catalogId || '').trim().toUpperCase())}/products/${encodeURIComponent(String(productId || '').trim())}/deactivate`, {
        method: 'POST',
        body: {}
    });
}
