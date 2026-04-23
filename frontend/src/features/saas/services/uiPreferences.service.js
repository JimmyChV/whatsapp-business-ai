export async function fetchSaasUiPreference(requestJson, sectionKey) {
    if (typeof requestJson !== 'function') return null;
    const key = String(sectionKey || '').trim();
    if (!key) return null;
    const payload = await requestJson(`/api/tenant/ui-preferences/${encodeURIComponent(key)}`, { method: 'GET' });
    return payload?.item || null;
}

export async function saveSaasUiPreference(requestJson, sectionKey, preferencesJson = {}) {
    if (typeof requestJson !== 'function') return null;
    const key = String(sectionKey || '').trim();
    if (!key) return null;
    const payload = await requestJson(`/api/tenant/ui-preferences/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: { preferencesJson: preferencesJson && typeof preferencesJson === 'object' ? preferencesJson : {} }
    });
    return payload?.item || null;
}
