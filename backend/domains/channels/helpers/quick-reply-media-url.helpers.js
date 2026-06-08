const REAL_MEDIA_EXTENSION_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg|mp4|mov|m4v|webm|mp3|wav|pdf|docx?|xlsx?|ogg|aac|amr|opus)(?:$|[?#])/i;

function isRealQuickReplyMediaUrl(rawUrl = '') {
    const url = String(rawUrl || '').trim();
    if (!url) return false;
    if (/^data:(image|video|audio|application\/pdf|application\/msword|application\/vnd\.openxmlformats|application\/vnd\.ms-|application\/octet-stream)/i.test(url)) {
        return true;
    }
    if (REAL_MEDIA_EXTENSION_RE.test(url)) return true;

    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('/wp-content/uploads/')
        || lowerUrl.includes('/media/')
        || lowerUrl.includes('/uploads/')
        || lowerUrl.includes('/files/');
}

function isRealQuickReplyMediaAsset(asset = {}) {
    const url = String(asset?.url || asset?.mediaUrl || '').trim();
    if (!url) return false;
    if (isRealQuickReplyMediaUrl(url)) return true;

    const mimeType = String(asset?.mimeType || asset?.mediaMimeType || '').trim().toLowerCase();
    const fileName = String(asset?.fileName || asset?.mediaFileName || asset?.filename || '').trim();
    return Boolean(
        mimeType.startsWith('image/')
        || mimeType.startsWith('video/')
        || mimeType.startsWith('audio/')
        || mimeType === 'application/pdf'
        || REAL_MEDIA_EXTENSION_RE.test(fileName)
    );
}

module.exports = {
    isRealQuickReplyMediaUrl,
    isRealQuickReplyMediaAsset
};
