const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const QUICK_REPLY_ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'audio/mpeg',
    'audio/ogg',
    'video/mp4'
];

export const QUICK_REPLY_ALLOWED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.txt', '.csv', '.doc', '.docx',
    '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.mp3', '.ogg', '.mp4'
];

export const QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL = '.jpg, .jpeg, .png, .webp, .gif, .pdf, .txt, .csv, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .zip, .mp3, .ogg, .mp4';
export const QUICK_REPLY_ACCEPT_VALUE = `${QUICK_REPLY_ALLOWED_MIME_TYPES.join(',')},${QUICK_REPLY_ALLOWED_EXTENSIONS.join(',')}`;

export const QUICK_REPLY_EXT_TO_MIME = Object.freeze({
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4'
});

export const QUICK_REPLY_DEFAULT_MAX_UPLOAD_MB = 50;
export const QUICK_REPLY_DEFAULT_STORAGE_MB = 500;

export const EMPTY_QUICK_REPLY_LIBRARY_FORM = {
    libraryId: '',
    name: '',
    description: '',
    isShared: false,
    isActive: true,
    sortOrder: '100',
    moduleIds: []
};

export const EMPTY_QUICK_REPLY_ITEM_FORM = {
    itemId: '',
    libraryId: '',
    label: '',
    text: '',
    mediaUrl: '',
    mediaMimeType: '',
    mediaFileName: '',
    mediaAssets: [],
    isActive: true,
    sortOrder: '100'
};

export function normalizeQuickReplyLibraryItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const libraryId = String(source.libraryId || source.id || '').trim().toUpperCase();
    if (!libraryId) return null;
    const moduleIds = Array.isArray(source.moduleIds)
        ? source.moduleIds
            .map((entry) => String(entry || '').trim().toLowerCase())
            .filter(Boolean)
        : [];
    return {
        libraryId,
        name: String(source.libraryName || source.name || libraryId).trim() || libraryId,
        description: String(source.description || '').trim(),
        isShared: source.isShared === true,
        isActive: source.isActive !== false,
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 100,
        moduleIds,
        metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function normalizeQuickReplyItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const itemId = String(source.itemId || source.id || '').trim().toUpperCase();
    if (!itemId) return null;
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? source.metadata : {};
    const mediaAssets = normalizeQuickReplyMediaAssets(source.mediaAssets || metadata.mediaAssets, {
        url: source.mediaUrl,
        mimeType: source.mediaMimeType,
        fileName: source.mediaFileName,
        sizeBytes: source.mediaSizeBytes
    });
    const primaryMedia = mediaAssets[0] || null;
    return {
        itemId,
        libraryId: String(source.libraryId || '').trim().toUpperCase(),
        label: String(source.label || itemId).trim() || itemId,
        text: String(source.text || '').trim(),
        mediaAssets,
        mediaUrl: String(primaryMedia?.url || source.mediaUrl || '').trim(),
        mediaMimeType: String(primaryMedia?.mimeType || source.mediaMimeType || '').trim().toLowerCase(),
        mediaFileName: String(primaryMedia?.fileName || source.mediaFileName || '').trim(),
        mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes)) ? Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes) : null,
        isActive: source.isActive !== false,
        sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 100,
        metadata,
        createdAt: String(source.createdAt || '').trim() || null,
        updatedAt: String(source.updatedAt || '').trim() || null
    };
}

export function normalizeQuickReplyMediaAsset(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const url = String(source.url || source.mediaUrl || '').trim();
    if (!url) return null;
    const mimeType = String(source.mimeType || source.mediaMimeType || '').trim().toLowerCase() || null;
    const fileName = String(source.fileName || source.mediaFileName || source.file || '').trim() || null;
    const sizeRaw = Number(source.sizeBytes ?? source.mediaSizeBytes);
    const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : null;
    return {
        url,
        mimeType,
        fileName,
        sizeBytes
    };
}

export function normalizeQuickReplyMediaAssets(value = [], fallback = null) {
    const source = Array.isArray(value) ? value : [];
    const dedupe = new Set();
    const assets = source
        .map((entry) => normalizeQuickReplyMediaAsset(entry))
        .filter(Boolean)
        .filter((entry) => {
            const key = `${String(entry.url || '').trim()}|${String(entry.fileName || '').trim()}|${String(entry.mimeType || '').trim()}`;
            if (!key || dedupe.has(key)) return false;
            dedupe.add(key);
            return true;
        });
    if (assets.length > 0) return assets;
    const fallbackAsset = normalizeQuickReplyMediaAsset(fallback);
    return fallbackAsset ? [fallbackAsset] : [];
}

export function resolveQuickReplyAssetPreviewUrl(rawUrl = '') {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    if (value.startsWith('data:') || value.startsWith('blob:')) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${API_BASE}${value}`;
    return `${API_BASE}/${value.replace(/^\/+/, '')}`;
}

export function isQuickReplyImageAsset(asset = {}) {
    const mimeType = String(asset?.mimeType || '').trim().toLowerCase();
    if (mimeType.startsWith('image/')) return true;
    const fileName = String(asset?.fileName || '').trim().toLowerCase();
    return /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(fileName);
}

export function getQuickReplyAssetTypeLabel(asset = {}) {
    const mimeType = String(asset?.mimeType || '').trim().toLowerCase();
    if (!mimeType) return 'archivo';
    if (mimeType.startsWith('image/')) return 'imagen';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word')) return 'doc';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'xls';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'ppt';
    if (mimeType.startsWith('text/')) return 'texto';
    return mimeType;
}

export function getQuickReplyAssetDisplayName(asset = {}, index = 0) {
    const fileName = String(asset?.fileName || '').trim();
    if (fileName) return fileName;
    const typeLabel = getQuickReplyAssetTypeLabel(asset);
    return `Adjunto ${index + 1}${typeLabel ? ` (${typeLabel})` : ''}`;
}

export function buildQuickReplyLibraryPayload(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    return {
        libraryId: String(source.libraryId || '').trim().toUpperCase() || undefined,
        name: String(source.name || '').trim(),
        description: String(source.description || '').trim() || null,
        isShared: source.isShared === true,
        isActive: source.isActive !== false,
        sortOrder: Math.max(0, Math.min(9999, Number(source.sortOrder || 100) || 100)),
        moduleIds: Array.isArray(source.moduleIds)
            ? source.moduleIds.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
            : []
    };
}

export function buildQuickReplyItemPayload(form = {}, { libraryId = '' } = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const mediaAssets = normalizeQuickReplyMediaAssets(source.mediaAssets, {
        url: source.mediaUrl,
        mimeType: source.mediaMimeType,
        fileName: source.mediaFileName,
        sizeBytes: source.mediaSizeBytes
    });
    const primaryMedia = mediaAssets[0] || null;
    return {
        itemId: String(source.itemId || '').trim().toUpperCase() || undefined,
        libraryId: String(source.libraryId || libraryId || '').trim().toUpperCase(),
        label: String(source.label || '').trim(),
        text: String(source.text || '').trim(),
        mediaAssets,
        mediaUrl: String(primaryMedia?.url || source.mediaUrl || '').trim() || null,
        mediaMimeType: String(primaryMedia?.mimeType || source.mediaMimeType || '').trim().toLowerCase() || null,
        mediaFileName: String(primaryMedia?.fileName || source.mediaFileName || '').trim() || null,
        mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes)) ? Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes) : null,
        isActive: source.isActive !== false,
        sortOrder: Math.max(0, Math.min(9999, Number(source.sortOrder || 100) || 100))
    };
}
