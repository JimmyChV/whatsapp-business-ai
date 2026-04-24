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

const GLOBAL_LABELS_CACHE_KEY = 'commercial';
const GLOBAL_COMMERCIAL_STATUS_KEYS = new Set(['nuevo', 'en_conversacion', 'cotizado', 'vendido', 'perdido']);
const globalLabelsCache = new Map();

const normalizeText = (value = '') => String(value || '').trim();
const normalizeUpper = (value = '') => normalizeText(value).toUpperCase();

export function normalizeGlobalLabel(item = {}) {
    return {
        id: normalizeUpper(item.id || item.labelId || ''),
        name: normalizeText(item.name),
        color: normalizeText(item.color || '#00A884') || '#00A884',
        description: normalizeText(item.description),
        commercialStatusKey: normalizeText(item.commercialStatusKey || item.commercial_status_key),
        sortOrder: Number(item.sortOrder ?? item.sort_order ?? 100) || 100,
        isActive: item.isActive !== false && item.is_active !== false
    };
}

export function normalizeCommercialGlobalLabels(items = []) {
    return (Array.isArray(items) ? items : [])
        .map(normalizeGlobalLabel)
        .filter((item) => GLOBAL_COMMERCIAL_STATUS_KEYS.has(item.commercialStatusKey));
}

export function hasCachedGlobalLabels() {
    return globalLabelsCache.has(GLOBAL_LABELS_CACHE_KEY);
}

export function getCachedGlobalLabels() {
    return globalLabelsCache.get(GLOBAL_LABELS_CACHE_KEY) || [];
}

export function setCachedGlobalLabels(items = []) {
    const normalized = normalizeCommercialGlobalLabels(items);
    globalLabelsCache.set(GLOBAL_LABELS_CACHE_KEY, normalized);
    return normalized;
}

export async function loadCachedGlobalLabels(requestJson, { force = false, includeInactive = true } = {}) {
    if (!requestJson) return getCachedGlobalLabels();
    if (!force && hasCachedGlobalLabels()) return getCachedGlobalLabels();
    const payload = await fetchGlobalLabels(requestJson, { includeInactive });
    return setCachedGlobalLabels(payload?.items || []);
}

export function upsertCachedGlobalLabel(item = {}) {
    const normalized = normalizeGlobalLabel(item);
    if (!normalized.id || !GLOBAL_COMMERCIAL_STATUS_KEYS.has(normalized.commercialStatusKey)) {
        return getCachedGlobalLabels();
    }
    const current = getCachedGlobalLabels();
    const exists = current.some((entry) => entry.id === normalized.id);
    const next = exists
        ? current.map((entry) => (entry.id === normalized.id ? normalized : entry))
        : [normalized, ...current];
    return setCachedGlobalLabels(next);
}

export function removeCachedGlobalLabel(id = '') {
    const cleanId = normalizeUpper(id);
    return setCachedGlobalLabels(getCachedGlobalLabels().filter((item) => item.id !== cleanId));
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

export async function fetchTenantZoneRules(requestJson, { includeInactive = true, tenantId = '' } = {}) {
    const query = includeInactive ? '?includeInactive=true' : '';
    const cleanTenantId = String(tenantId || '').trim();
    return requestJson(`/api/tenant/zone-rules${query}`, cleanTenantId ? { tenantIdOverride: cleanTenantId } : undefined);
}

export async function fetchTenantCustomerLabels(requestJson, { source = '', tenantId = '' } = {}) {
    const params = new URLSearchParams();
    if (String(source || '').trim()) params.set('source', String(source || '').trim());
    const query = params.toString() ? `?${params.toString()}` : '';
    const cleanTenantId = String(tenantId || '').trim();
    return requestJson(`/api/tenant/customer-labels${query}`, cleanTenantId ? { tenantIdOverride: cleanTenantId } : undefined);
}

export async function saveTenantZoneRule(requestJson, payload = {}, { tenantId = '' } = {}) {
    const ruleId = String(payload?.ruleId || payload?.rule_id || '').trim();
    const cleanTenantId = String(tenantId || '').trim();
    return requestJson(ruleId ? `/api/tenant/zone-rules/${encodeURIComponent(ruleId)}` : '/api/tenant/zone-rules', {
        method: ruleId ? 'PUT' : 'POST',
        body: payload,
        ...(cleanTenantId ? { tenantIdOverride: cleanTenantId } : {})
    });
}

export async function deleteTenantZoneRule(requestJson, ruleId = '', { tenantId = '' } = {}) {
    const cleanTenantId = String(tenantId || '').trim();
    return requestJson(`/api/tenant/zone-rules/${encodeURIComponent(String(ruleId || '').trim())}`, {
        method: 'DELETE',
        ...(cleanTenantId ? { tenantIdOverride: cleanTenantId } : {})
    });
}

export async function recalculateTenantZones(requestJson, { tenantId = '' } = {}) {
    const cleanTenantId = String(tenantId || '').trim();
    return requestJson('/api/tenant/zone-rules/recalculate', {
        method: 'POST',
        ...(cleanTenantId ? { tenantIdOverride: cleanTenantId } : {})
    });
}
