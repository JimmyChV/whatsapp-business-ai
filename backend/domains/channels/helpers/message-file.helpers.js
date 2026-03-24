const { URL } = require('url');
const { getMessageTypePreviewLabel } = require('./message-location.helpers');

function guessFileExtensionFromMime(mimetype = '') {
    const type = String(mimetype || '').toLowerCase();
    if (!type) return '';
    if (type.includes('pdf')) return 'pdf';
    if (type.includes('wordprocessingml')) return 'docx';
    if (type.includes('msword')) return 'doc';
    if (type.includes('spreadsheetml')) return 'xlsx';
    if (type.includes('ms-excel') || type.includes('excel')) return 'xls';
    if (type.includes('presentationml')) return 'pptx';
    if (type.includes('ms-powerpoint') || type.includes('powerpoint')) return 'ppt';
    if (type.includes('text/plain')) return 'txt';
    if (type.includes('csv')) return 'csv';
    if (type.includes('json')) return 'json';
    if (type.includes('xml')) return 'xml';
    if (type.includes('zip')) return 'zip';
    if (type.includes('rar')) return 'rar';
    if (type.includes('7z')) return '7z';
    if (type.includes('jpeg')) return 'jpg';
    if (type.includes('png')) return 'png';
    if (type.includes('webp')) return 'webp';
    if (type.includes('gif')) return 'gif';
    if (type.includes('mp4')) return 'mp4';
    if (type.includes('audio/mpeg')) return 'mp3';
    if (type.includes('audio/ogg')) return 'ogg';
    return '';
}

function sanitizeFilenameCandidate(value = '') {
    let text = String(value || '').trim();
    if (!text) return null;

    if (/^https?:\/\//i.test(text)) {
        try {
            const parsed = new URL(text);
            const fromPath = String(parsed.pathname || '').split('/').filter(Boolean).pop() || '';
            text = fromPath || text;
        } catch (e) {}
    }

    text = text
        .replace(/^['\"]+|['\"]+$/g, '')
        .replace(/\\/g, '/');
    if (text.includes('/')) text = text.split('/').pop() || text;
    text = text.split('?')[0].split('#')[0];

    try {
        text = decodeURIComponent(text);
    } catch (e) {}

    text = text
        .replace(/[\u0000-\u001F]/g, '')
        .replace(/[<>:\"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+|\.+$/g, '')
        .trim();

    if (!text) return null;
    if (/^(null|undefined|\[object object\]|unknown)$/i.test(text)) return null;
    return text;
}

function getFilenameExtension(filename = '') {
    const name = String(filename || '').trim();
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx <= 0 || dotIdx >= name.length - 1) return '';
    const ext = name.slice(dotIdx + 1).toLowerCase();
    if (!/^[a-z0-9]{1,8}$/.test(ext)) return '';
    return ext;
}

function isGenericFilename(filename = '') {
    const base = String(filename || '')
        .trim()
        .toLowerCase()
        .replace(/\.[a-z0-9]{1,8}$/i, '');
    if (!base) return true;
    return ['archivo', 'file', 'adjunto', 'attachment', 'document', 'documento', 'media', 'unknown', 'download', 'descarga'].includes(base);
}

function isMachineLikeFilename(filename = '') {
    const base = String(filename || '')
        .trim()
        .replace(/\.[a-z0-9]{1,8}$/i, '')
        .replace(/\s+/g, '');
    if (!base) return true;

    if (/^\d{8,}$/.test(base)) return true;
    if (/^[a-f0-9]{16,}$/i.test(base)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) return true;
    if (/^3EB0[A-F0-9]{8,}$/i.test(base)) return true;

    return false;
}

function looksLikeBodyFilename(value = '') {
    const text = String(value || '').trim();
    if (!text || text.length > 180) return false;
    if (/[\r\n]/.test(text)) return false;
    if (/^[A-Za-z0-9+/=]{160,}$/.test(text)) return false;
    if (/^https?:\/\//i.test(text)) return true;
    return /\.[A-Za-z0-9]{1,8}$/.test(text);
}

function extractMessageFileMeta(msg = {}, downloadedMedia = null) {
    const raw = msg?._data || {};
    const nestedDocumentName =
        raw?.message?.documentMessage?.fileName
        || raw?.message?.documentWithCaptionMessage?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessage?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessageV2?.message?.documentMessage?.fileName
        || raw?.message?.viewOnceMessageV2Extension?.message?.documentMessage?.fileName
        || null;

    const bodyCandidateRaw = String(msg?.body || raw?.body || '').trim();
    const bodyCandidate = looksLikeBodyFilename(bodyCandidateRaw) ? bodyCandidateRaw : null;

    const candidateNames = [
        msg?.filename,
        raw?.filename,
        raw?.fileName,
        raw?.file_name,
        raw?.mediaData?.filename,
        raw?.mediaData?.fileName,
        raw?.mediaData?.file_name,
        nestedDocumentName,
        downloadedMedia?.filename,
        downloadedMedia?.fileName,
        raw?.title,
        bodyCandidate
    ];

    let filename = null;
    let fallbackFilename = null;
    for (const candidate of candidateNames) {
        const safeName = sanitizeFilenameCandidate(candidate);
        if (!safeName) continue;
        if (!fallbackFilename) fallbackFilename = safeName;
        const ext = getFilenameExtension(safeName);
        if (!isGenericFilename(safeName) && !isMachineLikeFilename(safeName) && ext) {
            filename = safeName;
            break;
        }
        if (!filename && !isGenericFilename(safeName) && !isMachineLikeFilename(safeName)) {
            filename = safeName;
        }
    }
    if (!filename) filename = fallbackFilename;

    const mimetype = String(
        msg?.mimetype
        || raw?.mimetype
        || raw?.mediaData?.mimetype
        || downloadedMedia?.mimetype
        || ''
    ).trim();
    const mimeExt = guessFileExtensionFromMime(mimetype);
    const hasAttachment = Boolean(msg?.hasMedia || raw?.hasMedia || mimetype || downloadedMedia);

    if (filename && !getFilenameExtension(filename) && mimeExt) {
        filename = `${filename}.${mimeExt}`;
    }
    if (filename && (isGenericFilename(filename) || isMachineLikeFilename(filename)) && mimeExt) {
        filename = `documento.${mimeExt}`;
    }
    if (!filename && hasAttachment && mimeExt) {
        filename = `documento.${mimeExt}`;
    }
    if (!filename && hasAttachment && String(msg?.type || '').toLowerCase() === 'document') {
        filename = 'documento';
    }

    const sizeCandidates = [
        raw?.size,
        raw?.fileSize,
        raw?.fileLength,
        raw?.mediaData?.size,
        downloadedMedia?.filesize,
        downloadedMedia?.fileSize,
        downloadedMedia?.size
    ];

    let fileSizeBytes = null;
    for (const candidate of sizeCandidates) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed) && parsed > 0) {
            fileSizeBytes = Math.round(parsed);
            break;
        }
    }
    if (!fileSizeBytes && downloadedMedia?.data) {
        const base64Length = String(downloadedMedia.data || '').length;
        if (base64Length > 0) {
            fileSizeBytes = Math.round((base64Length * 3) / 4);
        }
    }

    const mediaUrl = String(downloadedMedia?.publicUrl || downloadedMedia?.storedPublicUrl || '').trim() || null;
    const mediaPath = String(downloadedMedia?.relativePath || downloadedMedia?.storedRelativePath || '').trim() || null;

    return {
        filename,
        mimetype: mimetype || null,
        fileSizeBytes,
        mediaUrl,
        mediaPath
    };
}

function normalizeQuotedPayload(raw = {}) {
    if (!raw || typeof raw !== 'object') return null;

    const rawId = raw?.id?._serialized || raw?.id || raw?.quotedStanzaID || raw?.quotedMsgId || raw?.quotedMsgKey || null;
    const id = rawId ? String(rawId).trim() : null;
    const body = String(raw?.body || raw?.caption || raw?.text || '').trim().slice(0, 180);
    const type = String(raw?.type || '').trim() || null;
    const fromMe = Boolean(raw?.fromMe || raw?.id?.fromMe || raw?.isFromMe);
    const timestamp = Number(raw?.timestamp || raw?.t || 0) || null;
    const hasMedia = Boolean(raw?.hasMedia || raw?.mimetype || raw?.mediaData || raw?.isMedia);

    if (!id && !body && !type && !hasMedia) return null;

    const preview = body || getMessageTypePreviewLabel(type);
    return {
        id: id || null,
        body: preview,
        type: type || 'chat',
        fromMe,
        timestamp,
        hasMedia
    };
}

async function extractQuotedMessageInfo(msg) {
    try {
        if (!msg) return null;
        const data = msg?._data || {};
        const quick = normalizeQuotedPayload({
            id: data?.quotedStanzaID,
            body: data?.quotedMsg?.body || data?.quotedMsg?.caption,
            type: data?.quotedMsg?.type,
            fromMe: data?.quotedMsg?.id?.fromMe || data?.quotedMsg?.fromMe,
            timestamp: data?.quotedMsg?.t,
            hasMedia: data?.quotedMsg?.isMedia || data?.quotedMsg?.mediaData || data?.quotedMsg?.mimetype
        });

        if (quick && quick.body && quick.id) return quick;

        if (msg?.hasQuotedMsg && typeof msg.getQuotedMessage === 'function') {
            try {
                const quoted = await msg.getQuotedMessage();
                const parsedQuoted = normalizeQuotedPayload({
                    id: quoted?.id?._serialized,
                    body: quoted?.body,
                    caption: quoted?._data?.caption,
                    type: quoted?.type,
                    fromMe: quoted?.fromMe,
                    timestamp: quoted?.timestamp,
                    hasMedia: quoted?.hasMedia
                });

                if (parsedQuoted) {
                    if (quick?.id && !parsedQuoted.id) parsedQuoted.id = quick.id;
                    return parsedQuoted;
                }
            } catch (e) {}
        }

        return quick;
    } catch (e) {
        return null;
    }
}

module.exports = {
    guessFileExtensionFromMime,
    sanitizeFilenameCandidate,
    getFilenameExtension,
    isGenericFilename,
    isMachineLikeFilename,
    looksLikeBodyFilename,
    extractMessageFileMeta,
    normalizeQuotedPayload,
    extractQuotedMessageInfo
};
