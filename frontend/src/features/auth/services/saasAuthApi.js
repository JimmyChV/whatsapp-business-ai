import { API_URL } from '../../../config/runtime';

async function requestJson(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function assertOk({ response, payload }, fallbackMessage) {
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || fallbackMessage));
  }
  return payload;
}

export async function loginSaas({ email, password, headers = {} }) {
  const result = await requestJson('/api/auth/login', {
    method: 'POST',
    headers,
    body: { email, password }
  });
  return assertOk(result, 'No se pudo iniciar sesion.');
}

export async function fetchSaasMe({ headers = {} }) {
  const result = await requestJson('/api/auth/me', {
    method: 'GET',
    headers
  });
  return assertOk(result, 'No se pudo cargar el perfil.');
}

export async function requestSaasRecovery({ email, headers = {} }) {
  const result = await requestJson('/api/auth/recovery/request', {
    method: 'POST',
    headers,
    body: { email }
  });
  return assertOk(result, 'No se pudo iniciar la recuperacion.');
}

export async function verifySaasRecovery({ email, code, headers = {} }) {
  const result = await requestJson('/api/auth/recovery/verify', {
    method: 'POST',
    headers,
    body: { email, code }
  });
  return assertOk(result, 'Codigo invalido o expirado.');
}

export async function resetSaasRecovery({ email, resetToken, newPassword, headers = {} }) {
  const result = await requestJson('/api/auth/recovery/reset', {
    method: 'POST',
    headers,
    body: { email, resetToken, newPassword }
  });
  return assertOk(result, 'No se pudo actualizar la contrasena.');
}

export async function logoutSaas({ accessToken, refreshToken, headers = {} }) {
  const result = await requestJson('/api/auth/logout', {
    method: 'POST',
    headers,
    body: { accessToken, refreshToken }
  });
  return assertOk(result, 'No se pudo cerrar sesion.');
}

export async function switchSaasTenant({ targetTenantId, refreshToken, headers = {} }) {
  const result = await requestJson('/api/auth/switch-tenant', {
    method: 'POST',
    headers,
    body: { targetTenantId, refreshToken }
  });
  return assertOk(result, 'No se pudo cambiar de empresa.');
}
