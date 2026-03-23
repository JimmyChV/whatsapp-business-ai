import { useState } from 'react';
import {
    QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
    QUICK_REPLY_ALLOWED_MIME_TYPES,
    QUICK_REPLY_EXT_TO_MIME,
    buildDataUrlWithMime,
    normalizeQuickReplyMediaAssets,
    resolveQuickReplyMimeType
} from '../../../helpers';

export default function useQuickReplyAssetsUpload({
    requestJson,
    settingsTenantId = '',
    selectedQuickReplyLibrary = null,
    quickReplyUploadMaxBytes = 0,
    quickReplyUploadMaxMb = 0,
    setQuickReplyItemForm
} = {}) {
    const [uploadingQuickReplyAssets, setUploadingQuickReplyAssets] = useState(false);

    const uploadQuickReplyAsset = async ({ file, tenantId, libraryId = '' } = {}) => {
        if (!file) throw new Error('Selecciona un archivo para subir.');
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) throw new Error('Selecciona tenant antes de subir adjunto.');

        const resolvedMimeType = resolveQuickReplyMimeType(file, {
            allowedMimeTypes: QUICK_REPLY_ALLOWED_MIME_TYPES,
            extToMime: QUICK_REPLY_EXT_TO_MIME
        });
        if (!resolvedMimeType || !QUICK_REPLY_ALLOWED_MIME_TYPES.includes(resolvedMimeType)) {
            throw new Error(`Formato no permitido para ${String(file?.name || 'adjunto')}. Usa ${QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}.`);
        }

        const dataUrl = await buildDataUrlWithMime(file, resolvedMimeType);
        const payload = await requestJson('/api/admin/saas/assets/upload', {
            method: 'POST',
            body: {
                tenantId: cleanTenantId,
                scope: String(libraryId || 'quick_reply').trim().toLowerCase(),
                kind: 'quick_reply',
                mimeType: resolvedMimeType,
                fileName: String(file?.name || 'adjunto').trim() || 'adjunto',
                dataUrl
            }
        });

        const filePayload = payload?.file && typeof payload.file === 'object' ? payload.file : {};
        return {
            url: String(filePayload.url || filePayload.relativeUrl || '').trim(),
            mimeType: String(filePayload.mimeType || resolvedMimeType).trim().toLowerCase(),
            fileName: String(filePayload.fileName || file?.name || '').trim(),
            sizeBytes: Number.isFinite(Number(filePayload.sizeBytes || file?.size || 0)) ? Number(filePayload.sizeBytes || file?.size || 0) : null
        };
    };

    const handleQuickReplyAssetSelection = async (fileList) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (files.length === 0) return;
        if (!settingsTenantId) throw new Error('Selecciona una empresa antes de subir adjuntos.');

        for (const file of files) {
            const mimeType = resolveQuickReplyMimeType(file, {
                allowedMimeTypes: QUICK_REPLY_ALLOWED_MIME_TYPES,
                extToMime: QUICK_REPLY_EXT_TO_MIME
            });
            if (!QUICK_REPLY_ALLOWED_MIME_TYPES.includes(mimeType)) {
                throw new Error(`Formato no permitido para ${String(file?.name || 'adjunto')}. Usa ${QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL}.`);
            }
            if (Number(file?.size || 0) > quickReplyUploadMaxBytes) {
                throw new Error(`El archivo ${String(file?.name || 'adjunto')} supera el maximo de ${quickReplyUploadMaxMb} MB por archivo.`);
            }
        }

        setUploadingQuickReplyAssets(true);
        try {
            const uploadedAssets = [];
            for (const file of files) {
                const uploaded = await uploadQuickReplyAsset({
                    file,
                    tenantId: settingsTenantId,
                    libraryId: selectedQuickReplyLibrary?.libraryId || ''
                });
                if (uploaded?.url) uploadedAssets.push(uploaded);
            }
            if (uploadedAssets.length === 0) throw new Error('No se pudo subir ningun adjunto.');

            setQuickReplyItemForm((prev) => {
                const mergedAssets = normalizeQuickReplyMediaAssets([
                    ...(Array.isArray(prev?.mediaAssets) ? prev.mediaAssets : []),
                    ...uploadedAssets
                ]);
                const primaryMedia = mergedAssets[0] || null;
                return {
                    ...prev,
                    mediaAssets: mergedAssets,
                    mediaUrl: String(primaryMedia?.url || prev?.mediaUrl || '').trim(),
                    mediaMimeType: String(primaryMedia?.mimeType || prev?.mediaMimeType || '').trim().toLowerCase(),
                    mediaFileName: String(primaryMedia?.fileName || prev?.mediaFileName || '').trim()
                };
            });
        } finally {
            setUploadingQuickReplyAssets(false);
        }
    };

    const removeQuickReplyAssetAt = (index = -1) => {
        const targetIndex = Number(index);
        if (!Number.isInteger(targetIndex) || targetIndex < 0) return;
        setQuickReplyItemForm((prev) => {
            const assets = normalizeQuickReplyMediaAssets(prev?.mediaAssets, {
                url: prev?.mediaUrl || '',
                mimeType: prev?.mediaMimeType || '',
                fileName: prev?.mediaFileName || '',
                sizeBytes: prev?.mediaSizeBytes
            });
            const nextAssets = assets.filter((_asset, assetIdx) => assetIdx !== targetIndex);
            const primaryMedia = nextAssets[0] || null;
            return {
                ...prev,
                mediaAssets: nextAssets,
                mediaUrl: String(primaryMedia?.url || '').trim(),
                mediaMimeType: String(primaryMedia?.mimeType || '').trim().toLowerCase(),
                mediaFileName: String(primaryMedia?.fileName || '').trim(),
                mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes)) ? Number(primaryMedia?.sizeBytes) : null
            };
        });
    };

    return {
        uploadingQuickReplyAssets,
        handleQuickReplyAssetSelection,
        removeQuickReplyAssetAt
    };
}
