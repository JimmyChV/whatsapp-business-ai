import { useMemo } from 'react';

import {
    getFileExtensionFromName,
    guessExtensionFromMime,
    isGenericAttachmentFilename,
    isMachineLikeAttachmentFilename
} from '../helpers';

const normalizeBase64Payload = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const stripped = raw.replace(/^data:.*?;base64,/i, '');
    const cleaned = stripped.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const remainder = cleaned.length % 4;
    if (remainder === 0) return cleaned;
    if (remainder === 2) return `${cleaned}==`;
    if (remainder === 3) return `${cleaned}=`;
    return cleaned;
};

function buildAttachmentObjectUrl({ msg, attachmentMeta }) {
    if (!attachmentMeta || !msg?.mediaData) return null;
    try {
        const payload = normalizeBase64Payload(msg.mediaData);
        if (!payload) return null;
        const binary = window.atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], {
            type: attachmentMeta.mimetype || msg?.mimetype || 'application/octet-stream'
        });
        return URL.createObjectURL(blob);
    } catch (e) {
        return null;
    }
}

function revokeObjectUrlLater(url, delayMs = 120000) {
    if (!url) return;
    window.setTimeout(() => {
        try {
            URL.revokeObjectURL(url);
        } catch (e) {
            // ignore
        }
    }, delayMs);
}

export default function useMessageBubbleAttachmentActions({
    msg,
    attachmentMeta,
    mediaDataUrl
}) {
    const canOpenAttachmentAsPdf = useMemo(() => {
        if (!attachmentMeta) return false;
        const safeMime = String(attachmentMeta.mimetype || msg?.mimetype || '').toLowerCase();
        const safeFilename = String(attachmentMeta.downloadFilename || attachmentMeta.filename || '');
        return safeMime.includes('pdf') || getFileExtensionFromName(safeFilename).toLowerCase() === 'pdf';
    }, [attachmentMeta, msg?.mimetype]);

    const handleDownloadAttachment = (event) => {
        event.preventDefault();

        const objectUrl = buildAttachmentObjectUrl({ msg, attachmentMeta });
        const rawDownloadName = attachmentMeta?.downloadFilename || attachmentMeta?.filename || 'documento';
        const fallbackExt = getFileExtensionFromName(rawDownloadName)
            || guessExtensionFromMime(attachmentMeta?.mimetype || msg?.mimetype || '');
        const downloadName = (isGenericAttachmentFilename(rawDownloadName) || isMachineLikeAttachmentFilename(rawDownloadName))
            ? (fallbackExt ? `documento.${fallbackExt}` : 'documento')
            : rawDownloadName;

        if (objectUrl) {
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = downloadName;
            link.rel = 'noreferrer';
            document.body.appendChild(link);
            link.click();
            link.remove();
            revokeObjectUrlLater(objectUrl, 30000);
            return;
        }

        if (mediaDataUrl) {
            const fallback = document.createElement('a');
            fallback.href = mediaDataUrl;
            fallback.download = downloadName;
            fallback.rel = 'noreferrer';
            document.body.appendChild(fallback);
            fallback.click();
            fallback.remove();
        }
    };

    const handleOpenAttachment = (event) => {
        event.preventDefault();
        if (!canOpenAttachmentAsPdf) {
            handleDownloadAttachment(event);
            return;
        }

        const objectUrl = buildAttachmentObjectUrl({ msg, attachmentMeta });
        if (objectUrl) {
            const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
            if (!opened) {
                const link = document.createElement('a');
                link.href = objectUrl;
                link.target = '_blank';
                link.rel = 'noreferrer';
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
            revokeObjectUrlLater(objectUrl);
            return;
        }

        if (mediaDataUrl) {
            const fallback = document.createElement('a');
            fallback.href = mediaDataUrl;
            fallback.target = '_blank';
            fallback.rel = 'noreferrer';
            document.body.appendChild(fallback);
            fallback.click();
            fallback.remove();
        }
    };

    return {
        canOpenAttachmentAsPdf,
        handleOpenAttachment,
        handleDownloadAttachment
    };
}

