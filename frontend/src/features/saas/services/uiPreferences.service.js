const uiPreferenceCache = new Map();

const normalizeSectionKey = (sectionKey) => String(sectionKey || '').trim();

export async function fetchSaasUiPreference(requestJson, sectionKey) {
    if (typeof requestJson !== 'function') return null;
    const key = normalizeSectionKey(sectionKey);
    if (!key) return null;
    const payload = await requestJson(`/api/tenant/ui-preferences/${encodeURIComponent(key)}`, { method: 'GET' });
    return payload?.item || null;
}

export function getCachedSaasUiPreference(sectionKey) {
    const key = normalizeSectionKey(sectionKey);
    if (!key || !uiPreferenceCache.has(key)) return null;
    return uiPreferenceCache.get(key) || null;
}

export function hasCachedSaasUiPreference(sectionKey) {
    const key = normalizeSectionKey(sectionKey);
    return Boolean(key && uiPreferenceCache.has(key));
}

export async function loadCachedSaasUiPreference(requestJson, sectionKey, options = {}) {
    const key = normalizeSectionKey(sectionKey);
    if (!key) return null;
    if (!options?.force && uiPreferenceCache.has(key)) {
        return uiPreferenceCache.get(key) || null;
    }
    const item = await fetchSaasUiPreference(requestJson, key);
    uiPreferenceCache.set(key, item || null);
    return item || null;
}

export async function saveSaasUiPreference(requestJson, sectionKey, preferencesJson = {}) {
    if (typeof requestJson !== 'function') return null;
    const key = normalizeSectionKey(sectionKey);
    if (!key) return null;
    const payload = await requestJson(`/api/tenant/ui-preferences/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: { preferencesJson: preferencesJson && typeof preferencesJson === 'object' ? preferencesJson : {} }
    });
    const item = payload?.item || { sectionKey: key, preferencesJson };
    uiPreferenceCache.set(key, item);
    return item;
}
