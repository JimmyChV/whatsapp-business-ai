const normalizeText = (value = '') => String(value || '').trim();
const normalizeCacheKey = (value = '') => normalizeText(value).toLowerCase();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const customerSearchCache = new Map();

const getCacheEntry = (cache, key = '') => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCacheEntry = (cache, key = '', value) => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS
  });
};

const buildHeaders = (buildApiHeaders, tenantId = '') => {
  const headers = typeof buildApiHeaders === 'function' ? (buildApiHeaders() || {}) : {};
  const cleanTenantId = normalizeText(tenantId);
  if (cleanTenantId) headers['x-tenant-id'] = cleanTenantId;
  return headers;
};

const toTitleCase = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const buildCustomerDisplayName = (customer = {}) => {
  const fullName = [
    customer?.firstName || customer?.first_name,
    customer?.lastNamePaternal || customer?.last_name_paternal,
    customer?.lastNameMaternal || customer?.last_name_maternal
  ]
    .map((part) => toTitleCase(part))
    .filter(Boolean)
    .join(' ');

  return normalizeText(
    fullName
    || customer?.fullName
    || customer?.erpCustomerName
    || customer?.contactName
    || customer?.contact_name
    || customer?.name
  );
};

const buildCustomerLocationLabel = (customer = {}) => {
  const district = toTitleCase(customer?.districtName || customer?.district_name || '');
  const province = toTitleCase(customer?.provinceName || customer?.province_name || '');
  const department = toTitleCase(customer?.departmentName || customer?.department_name || '');
  return [district, province, department].filter(Boolean).join(' - ');
};

export async function searchTenantCustomersForChat({
  apiUrl = '',
  buildApiHeaders,
  tenantId = '',
  query = '',
  waModules = []
} = {}) {
  const cleanApiUrl = normalizeText(apiUrl);
  const cleanTenantId = normalizeText(tenantId);
  const cleanQuery = normalizeText(query);
  if (!cleanApiUrl || !cleanTenantId || cleanQuery.length < 2 || typeof buildApiHeaders !== 'function') {
    return [];
  }

  const searchCacheKey = `${normalizeCacheKey(cleanTenantId)}::${normalizeCacheKey(cleanQuery)}`;
  const cachedSearchResults = getCacheEntry(customerSearchCache, searchCacheKey);
  if (cachedSearchResults) return cachedSearchResults;

  const headers = buildHeaders(buildApiHeaders, cleanTenantId);
  const params = new URLSearchParams({
    q: cleanQuery,
    limit: '30',
    includeInactive: 'true'
  });

  const response = await fetch(`${cleanApiUrl}/api/tenant/customers/chat-search?${params.toString()}`, { headers });
  if (!response.ok) {
    throw new Error('No se pudieron buscar clientes.');
  }

  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const moduleConfigById = new Map(
    (Array.isArray(waModules) ? waModules : []).map((module) => [
      normalizeText(module?.moduleId || module?.id).toLowerCase(),
      module || {}
    ])
  );

  const results = items.map((customer, index) => {
    const customerId = normalizeText(customer?.customerId || customer?.customer_id);
    const moduleId = normalizeText(customer?.moduleId || customer?.module_id).toLowerCase();
    const moduleConfig = moduleConfigById.get(moduleId) || null;
    const moduleName = normalizeText(moduleConfig?.name || moduleId || customer?.moduleName || '');
    const displayName = buildCustomerDisplayName(customer)
      || normalizeText(customer?.phoneE164 || customer?.phone_e164 || customer?.phoneAlt || customer?.phone_alt)
      || `Cliente ${index + 1}`;
    const phone = normalizeText(customer?.phoneE164 || customer?.phone_e164);
    const phoneAlt = normalizeText(customer?.phoneAlt || customer?.phone_alt);
    const locationLabel = buildCustomerLocationLabel(customer);
    const phoneLine = [phone || phoneAlt || 'Sin telefono', moduleName].filter(Boolean).join(' • ');

    return {
      key: `customer_${customerId || index}_${moduleId || 'default'}`,
      customerId,
      displayName,
      phone,
      phoneAlt,
      moduleId,
      moduleName,
      locationLabel,
      channelType: normalizeText(moduleConfig?.channelType || 'whatsapp').toLowerCase(),
      label: displayName,
      sublabel: phoneLine
    };
  });

  setCacheEntry(customerSearchCache, searchCacheKey, results);
  return results;
}
