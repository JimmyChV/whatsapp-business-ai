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
        .filter((item) => Boolean(item.commercialStatusKey));
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
    if (!normalized.id || !normalized.commercialStatusKey) {
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

const TENANT_ZONE_RULES_DEFAULT_CACHE_KEY = 'default';
const tenantZoneRulesCache = new Map();

const normalizeMoneyInput = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? Math.round(numberValue * 100) / 100 : null;
};

function getTenantZoneRulesCacheKey(tenantId = '') {
    return normalizeText(tenantId) || TENANT_ZONE_RULES_DEFAULT_CACHE_KEY;
}

export function normalizeTenantZoneShippingOptions(value = []) {
    return (Array.isArray(value) ? value : []).map((item) => ({
        type: normalizeText(item?.type).toLowerCase() === 'courier' ? 'courier' : 'delivery',
        label: normalizeText(item?.label || item?.name || (normalizeText(item?.type).toLowerCase() === 'courier' ? 'Courier' : 'Delivery propio')),
        cost: normalizeMoneyInput(item?.cost) ?? 0,
        free_from: normalizeMoneyInput(item?.free_from ?? item?.freeFrom),
        estimated_time: normalizeText(item?.estimated_time || item?.estimatedTime),
        is_active: item?.is_active !== false && item?.isActive !== false
    }));
}

export function normalizeTenantZonePaymentMethods(value = {}) {
    return {
        yape: value?.yape === true,
        plin: value?.plin === true,
        bank_transfer: value?.bank_transfer === true || value?.bankTransfer === true,
        credit_card: value?.credit_card === true || value?.creditCard === true,
        cash: value?.cash === true
    };
}

export function normalizeTenantZonePaymentModality(value = {}) {
    return {
        advance: Object.prototype.hasOwnProperty.call(value || {}, 'advance') ? value?.advance === true : true,
        cash_on_delivery: value?.cash_on_delivery === true || value?.cashOnDelivery === true
    };
}

export function normalizeTenantZoneRule(item = {}) {
    const rules = item.rulesJson || item.rules_json || {};
    return {
        ruleId: normalizeUpper(item.ruleId || item.rule_id || ''),
        name: normalizeText(item.name),
        color: normalizeText(item.color || '#00A884') || '#00A884',
        rulesJson: rules && typeof rules === 'object' && !Array.isArray(rules) ? rules : {},
        shippingOptions: normalizeTenantZoneShippingOptions(item.shippingOptions || item.shipping_options),
        paymentMethods: normalizeTenantZonePaymentMethods(item.paymentMethods || item.payment_methods),
        paymentModality: normalizeTenantZonePaymentModality(item.paymentModality || item.payment_modality),
        wooZoneId: item.wooZoneId ?? item.woo_zone_id ?? null,
        postalCodes: Array.isArray(item.postalCodes || item.postal_codes) ? (item.postalCodes || item.postal_codes).map(normalizeText).filter(Boolean) : [],
        ubigeoCodes: Array.isArray(item.ubigeoCodes || item.ubigeo_codes) ? (item.ubigeoCodes || item.ubigeo_codes).map(normalizeText).filter(Boolean) : [],
        segmentKey: normalizeText(item.segmentKey || item.segment_key || ''),
        agenciesConfig: item.agenciesConfig || item.agencies_config || {},
        isActive: item.isActive !== false && item.is_active !== false
    };
}

export function hasCachedTenantZoneRules(tenantId = '') {
    return tenantZoneRulesCache.has(getTenantZoneRulesCacheKey(tenantId));
}

export function getCachedTenantZoneRules(tenantId = '') {
    return tenantZoneRulesCache.get(getTenantZoneRulesCacheKey(tenantId)) || [];
}

export function setCachedTenantZoneRules(tenantId = '', items = []) {
    const normalized = (Array.isArray(items) ? items : [])
        .map(normalizeTenantZoneRule)
        .filter((item) => item.ruleId);
    tenantZoneRulesCache.set(getTenantZoneRulesCacheKey(tenantId), normalized);
    return normalized;
}

export async function loadCachedTenantZoneRules(requestJson, { includeInactive = true, tenantId = '', force = false } = {}) {
    if (!requestJson) return getCachedTenantZoneRules(tenantId);
    if (!force && hasCachedTenantZoneRules(tenantId)) return getCachedTenantZoneRules(tenantId);
    const payload = await fetchTenantZoneRules(requestJson, { includeInactive, tenantId });
    return setCachedTenantZoneRules(tenantId, payload?.items || []);
}

export function upsertCachedTenantZoneRule(tenantId = '', item = {}) {
    const normalized = normalizeTenantZoneRule(item);
    if (!normalized.ruleId) return getCachedTenantZoneRules(tenantId);
    const current = getCachedTenantZoneRules(tenantId);
    const exists = current.some((entry) => entry.ruleId === normalized.ruleId);
    const next = exists
        ? current.map((entry) => (entry.ruleId === normalized.ruleId ? normalized : entry))
        : [normalized, ...current];
    return setCachedTenantZoneRules(tenantId, next);
}

export function removeCachedTenantZoneRule(tenantId = '', ruleId = '') {
    const cleanRuleId = normalizeUpper(ruleId);
    return setCachedTenantZoneRules(
        tenantId,
        getCachedTenantZoneRules(tenantId).filter((item) => item.ruleId !== cleanRuleId)
    );
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

export async function syncTenantZonesFromWooCommerce(requestJson, { tenantId = '', catalogId = '' } = {}) {
    const cleanTenantId = String(tenantId || '').trim();
    const cleanCatalogId = String(catalogId || '').trim();
    return requestJson('/api/tenant/zones/sync-from-woocommerce', {
        method: 'POST',
        body: cleanCatalogId ? { catalogId: cleanCatalogId } : {},
        ...(cleanTenantId ? { tenantIdOverride: cleanTenantId } : {})
    });
}
