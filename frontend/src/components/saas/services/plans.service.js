export async function fetchSaasPlans(requestJson) {
    return requestJson('/api/admin/saas/plans');
}

export async function updateSaasPlan(requestJson, planId, payload) {
    return requestJson(`/api/admin/saas/plans/${encodeURIComponent(String(planId || '').trim().toLowerCase())}`, {
        method: 'PUT',
        body: payload
    });
}
