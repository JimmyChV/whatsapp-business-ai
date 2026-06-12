const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const jsonHeaders = (buildApiHeaders) => ({
    ...(typeof buildApiHeaders === 'function' ? buildApiHeaders() : {}),
    'Content-Type': 'application/json'
});

async function parseJsonResponse(resp) {
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'No se pudo completar la solicitud.');
    }
    return payload;
}

export async function listScheduledMessages({ chatId, scopeModuleId = '', buildApiHeaders } = {}) {
    const params = new URLSearchParams();
    params.set('chatId', String(chatId || ''));
    if (scopeModuleId) params.set('scopeModuleId', String(scopeModuleId || ''));
    const resp = await fetch(`${API_URL}/api/tenant/scheduled-messages?${params.toString()}`, {
        headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
    });
    const payload = await parseJsonResponse(resp);
    return Array.isArray(payload.items) ? payload.items : [];
}

export async function listScheduledMessageCounts({ buildApiHeaders } = {}) {
    const resp = await fetch(`${API_URL}/api/tenant/scheduled-messages/counts`, {
        headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
    });
    const payload = await parseJsonResponse(resp);
    return Array.isArray(payload.items) ? payload.items : [];
}

export async function createScheduledMessage({ payload, buildApiHeaders } = {}) {
    const resp = await fetch(`${API_URL}/api/tenant/scheduled-messages`, {
        method: 'POST',
        headers: jsonHeaders(buildApiHeaders),
        body: JSON.stringify(payload || {})
    });
    const result = await parseJsonResponse(resp);
    return result.item || null;
}

export async function updateScheduledMessage({ messageId, payload, buildApiHeaders } = {}) {
    const resp = await fetch(`${API_URL}/api/tenant/scheduled-messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        headers: jsonHeaders(buildApiHeaders),
        body: JSON.stringify(payload || {})
    });
    const result = await parseJsonResponse(resp);
    return result.item || null;
}

export async function cancelScheduledMessage({ messageId, buildApiHeaders } = {}) {
    const resp = await fetch(`${API_URL}/api/tenant/scheduled-messages/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
        headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
    });
    const result = await parseJsonResponse(resp);
    return result.item || null;
}
