import { useCallback, useState } from 'react';

export default function useSaasApiClient({ apiBase, buildApiHeaders }) {
    const [pendingRequests, setPendingRequests] = useState(0);

    const requestJson = useCallback(async (path, { method = 'GET', body = null, tenantIdOverride = '', headers: extraHeaders = null } = {}) => {
        setPendingRequests((prev) => prev + 1);
        try {
            const url = `${apiBase}${path}`;
            const isFormDataBody = typeof FormData !== 'undefined' && body instanceof FormData;
            const baseHeaders = buildApiHeaders?.({
                includeJson: body !== null && !isFormDataBody,
                tenantIdOverride
            }) || (body !== null && !isFormDataBody ? { 'Content-Type': 'application/json' } : {});
            const headers = {
                ...baseHeaders,
                ...(extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {})
            };
            const response = await fetch(url, {
                method,
                cache: 'no-store',
                headers,
                body: body === null ? undefined : (isFormDataBody ? body : JSON.stringify(body))
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) {
                throw new Error(String(payload?.error || 'Operacion fallida.'));
            }
            return payload;
        } finally {
            setPendingRequests((prev) => Math.max(0, prev - 1));
        }
    }, [apiBase, buildApiHeaders]);

    return {
        pendingRequests,
        requestJson
    };
}
