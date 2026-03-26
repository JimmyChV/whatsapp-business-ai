import { useCallback, useState } from 'react';

export default function useSaasApiClient({ apiBase, buildApiHeaders }) {
    const [pendingRequests, setPendingRequests] = useState(0);

    const requestJson = useCallback(async (path, { method = 'GET', body = null } = {}) => {
        setPendingRequests((prev) => prev + 1);
        try {
            const url = `${apiBase}${path}`;
            const headers = buildApiHeaders?.({ includeJson: body !== null }) || (body !== null ? { 'Content-Type': 'application/json' } : {});
            const response = await fetch(url, {
                method,
                cache: 'no-store',
                headers,
                body: body !== null ? JSON.stringify(body) : undefined
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
