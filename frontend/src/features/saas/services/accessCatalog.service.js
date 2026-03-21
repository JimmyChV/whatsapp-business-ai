export async function fetchAccessCatalog(requestJson) {
    return requestJson('/api/admin/saas/access-profiles');
}

export async function createAccessRoleProfile(requestJson, payload) {
    return requestJson('/api/admin/saas/access-profiles/roles', {
        method: 'POST',
        body: payload
    });
}

export async function updateAccessRoleProfile(requestJson, roleCode, payload) {
    return requestJson(`/api/admin/saas/access-profiles/roles/${encodeURIComponent(String(roleCode || '').trim().toLowerCase())}`, {
        method: 'PUT',
        body: payload
    });
}
