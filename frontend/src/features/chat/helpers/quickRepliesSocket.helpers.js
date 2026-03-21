import { repairMojibake, sanitizeDisplayText } from './appChat.helpers';

export function normalizeQuickRepliesSocketPayload(payload = {}) {
    const enabled = payload?.enabled !== false;
    const writable = payload?.writable !== false;
    const items = Array.isArray(payload?.items) ? payload.items : [];

    const normalizedItems = items
        .map((item, idx) => {
            const mediaAssets = Array.isArray(item?.mediaAssets)
                ? item.mediaAssets
                    .map((asset) => ({
                        url: String(asset?.url || asset?.mediaUrl || '').trim() || null,
                        mimeType: String(asset?.mimeType || asset?.mediaMimeType || '').trim().toLowerCase() || null,
                        fileName: String(asset?.fileName || asset?.mediaFileName || '').trim() || null,
                        sizeBytes: Number.isFinite(Number(asset?.sizeBytes ?? asset?.mediaSizeBytes)) ? Number(asset?.sizeBytes ?? asset?.mediaSizeBytes) : null
                    }))
                    .filter((asset) => Boolean(asset.url))
                : [];

            const mediaUrl = String(item?.mediaUrl || mediaAssets[0]?.url || '').trim() || null;
            const mediaMimeType = String(item?.mediaMimeType || mediaAssets[0]?.mimeType || '').trim().toLowerCase() || null;
            const mediaFileName = String(item?.mediaFileName || mediaAssets[0]?.fileName || '').trim() || null;
            const mediaSizeBytes = Number.isFinite(Number(item?.mediaSizeBytes))
                ? Number(item.mediaSizeBytes)
                : (Number.isFinite(Number(mediaAssets[0]?.sizeBytes)) ? Number(mediaAssets[0].sizeBytes) : null);

            return {
                id: String(item?.id || (`qr_${idx + 1}`)),
                label: sanitizeDisplayText(item?.label || 'Respuesta rapida'),
                text: repairMojibake(item?.text || ''),
                mediaAssets,
                mediaUrl,
                mediaMimeType,
                mediaFileName,
                mediaSizeBytes,
                libraryId: String(item?.libraryId || '').trim() || null,
                libraryName: String(item?.libraryName || '').trim() || null,
                isShared: item?.isShared !== false
            };
        })
        .filter((item) => item.id && (item.text || item.mediaUrl || (Array.isArray(item.mediaAssets) && item.mediaAssets.length > 0)));

    return {
        enabled,
        writable,
        items: normalizedItems
    };
}
