const API_BASE = import.meta.env.VITE_API_URL || '"'"'http://localhost:3001'"'"';

const joinUrl = (path = '') => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const normalizeHeaders = (headers = {}) => {
  const source = headers && typeof headers === 'object' ? headers : {};
  const out = {};
  Object.keys(source).forEach((key) => {
    const value = source[key];
    if (value === undefined || value === null) return;
    out[key] = String(value);
  });
  return out;
};

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const parseError = async (response) => {
  const payload = await safeJson(response);
  const message = String(payload?.error || payload?.message || `HTTP ${response.status}`).trim();
  const error = new Error(message);
  error.status = response.status;
  error.payload = payload;
  return error;
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw await parseError(response);
  }
  return await safeJson(response);
};

export const getAdminTenantAssignmentRules = async ({ tenantId, headers = {} }) => {
  const cleanTenantId = String(tenantId || '').trim();
  if (!cleanTenantId) throw new Error('tenantId requerido.');
  return requestJson(joinUrl(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/assignment-rules`), {
    method: 'GET',
    headers: normalizeHeaders(headers),
  });
};

export const updateAdminTenantAssignmentRules = async ({ tenantId, body = {}, headers = {} }) => {
  const cleanTenantId = String(tenantId || '').trim();
  if (!cleanTenantId) throw new Error('tenantId requerido.');
  return requestJson(joinUrl(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/assignment-rules`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...normalizeHeaders(headers),
    },
    body: JSON.stringify(body || {}),
  });
};

export const triggerAdminAutoAssign = async ({ tenantId, chatId, scopeModuleId = '', reason = '', headers = {} }) => {
  const cleanTenantId = String(tenantId || '').trim();
  const cleanChatId = String(chatId || '').trim();
  if (!cleanTenantId) throw new Error('tenantId requerido.');
  if (!cleanChatId) throw new Error('chatId requerido.');
  return requestJson(joinUrl(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/chats/${encodeURIComponent(cleanChatId)}/auto-assign`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...normalizeHeaders(headers),
    },
    body: JSON.stringify({
      scopeModuleId: String(scopeModuleId || '').trim(),
      reason: String(reason || '').trim(),
    }),
  });
};

export const getAdminTenantOperationsKpis = async ({ tenantId, from = '', to = '', headers = {} }) => {
  const cleanTenantId = String(tenantId || '').trim();
  if (!cleanTenantId) throw new Error('tenantId requerido.');
  const params = new URLSearchParams();
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return requestJson(joinUrl(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/kpis/operations${suffix}`), {
    method: 'GET',
    headers: normalizeHeaders(headers),
  });
};

export const getTenantAssignmentRules = async ({ headers = {} }) => {
  return requestJson(joinUrl('/api/tenant/assignment-rules'), {
    method: 'GET',
    headers: normalizeHeaders(headers),
  });
};

export const updateTenantAssignmentRules = async ({ body = {}, headers = {} }) => {
  return requestJson(joinUrl('/api/tenant/assignment-rules'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...normalizeHeaders(headers),
    },
    body: JSON.stringify(body || {}),
  });
};

export const triggerTenantAutoAssign = async ({ chatId, scopeModuleId = '', reason = '', headers = {} }) => {
  const cleanChatId = String(chatId || '').trim();
  if (!cleanChatId) throw new Error('chatId requerido.');
  return requestJson(joinUrl(`/api/tenant/chats/${encodeURIComponent(cleanChatId)}/auto-assign`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...normalizeHeaders(headers),
    },
    body: JSON.stringify({
      scopeModuleId: String(scopeModuleId || '').trim(),
      reason: String(reason || '').trim(),
    }),
  });
};

export const getTenantOperationsKpis = async ({ from = '', to = '', headers = {} }) => {
  const params = new URLSearchParams();
  if (from) params.set('from', String(from));
  if (to) params.set('to', String(to));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return requestJson(joinUrl(`/api/tenant/kpis/operations${suffix}`), {
    method: 'GET',
    headers: normalizeHeaders(headers),
  });
};