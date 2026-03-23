import { useEffect, useState } from 'react';

const linkPreviewCache = new Map();

export default function useMessageBubbleLinkPreview({
    showWebPreview = false,
    firstNonMapUrl = '',
    apiUrl = '',
    buildApiHeaders
}) {
    const [webPreview, setWebPreview] = useState(null);
    const [webPreviewLoading, setWebPreviewLoading] = useState(false);

    useEffect(() => {
        if (!showWebPreview || !firstNonMapUrl) {
            setWebPreview(null);
            setWebPreviewLoading(false);
            return;
        }

        const cached = linkPreviewCache.get(firstNonMapUrl);
        if (cached) {
            setWebPreview(cached);
            setWebPreviewLoading(false);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setWebPreviewLoading(true);
                const encoded = encodeURIComponent(firstNonMapUrl);
                const response = await fetch(`${apiUrl}/api/link-preview?url=${encoded}`, {
                    headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
                });
                const payload = await response.json();
                const nextPreview = payload?.ok
                    ? payload
                    : { ok: false, url: firstNonMapUrl, title: firstNonMapUrl };
                linkPreviewCache.set(firstNonMapUrl, nextPreview);
                if (!cancelled) setWebPreview(nextPreview);
            } catch (e) {
                const fallback = { ok: false, url: firstNonMapUrl, title: firstNonMapUrl };
                linkPreviewCache.set(firstNonMapUrl, fallback);
                if (!cancelled) setWebPreview(fallback);
            } finally {
                if (!cancelled) setWebPreviewLoading(false);
            }
        }, 180);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [apiUrl, buildApiHeaders, firstNonMapUrl, showWebPreview]);

    return {
        webPreview,
        webPreviewLoading
    };
}

