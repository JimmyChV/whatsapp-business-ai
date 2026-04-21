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

export async function fetchGlobalLabels(requestJson, { includeInactive = true } = {}) {
    const query = includeInactive ? '?includeInactive=true' : '';
    return requestJson(`/api/ops/global-labels${query}`);
}

export async function saveGlobalLabel(requestJson, payload = {}) {
    const id = String(payload?.id || '').trim();
    return requestJson(id ? `/api/ops/global-labels/${encodeURIComponent(id)}` : '/api/ops/global-labels', {
        method: id ? 'PUT' : 'POST',
        body: payload
    });
}

export async function deleteGlobalLabel(requestJson, id = '') {
    return requestJson(`/api/ops/global-labels/${encodeURIComponent(String(id || '').trim())}`, {
        method: 'DELETE'
    });
}

export async function fetchTenantZoneRules(requestJson, { includeInactive = true } = {}) {
    const query = includeInactive ? '?includeInactive=true' : '';
    return requestJson(`/api/tenant/zone-rules${query}`);
}

export async function saveTenantZoneRule(requestJson, payload = {}) {
    const ruleId = String(payload?.ruleId || payload?.rule_id || '').trim();
    return requestJson(ruleId ? `/api/tenant/zone-rules/${encodeURIComponent(ruleId)}` : '/api/tenant/zone-rules', {
        method: ruleId ? 'PUT' : 'POST',
        body: payload
    });
}

export async function deleteTenantZoneRule(requestJson, ruleId = '') {
    return requestJson(`/api/tenant/zone-rules/${encodeURIComponent(String(ruleId || '').trim())}`, {
        method: 'DELETE'
    });
}

export async function recalculateTenantZones(requestJson) {
    return requestJson('/api/tenant/zone-rules/recalculate', { method: 'POST' });
}
