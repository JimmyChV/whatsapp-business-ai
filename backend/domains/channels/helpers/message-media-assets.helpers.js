const {
    guessFileExtensionFromMime,
    sanitizeFilenameCandidate,
    getFilenameExtension,
    isGenericFilename,
    isMachineLikeFilename
} = require('./message-file.helpers');

const CATALOG_IMAGE_EXT_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

const CLOUD_CATALOG_COMPATIBLE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const CATALOG_IMAGE_FETCH_ACCEPT = 'image/jpeg,image/png,image/*;q=0.85,*/*;q=0.5';

function createMessageMediaAssetsHelpers(deps = {}) {
    const {
        fs,
        path,
        URL,
        Buffer,
        resolveAndValidatePublicHost,
        getSharpImageProcessor,
        SAAS_UPLOADS_ROOT,
        QUICK_REPLY_MEDIA_MAX_BYTES,
        QUICK_REPLY_MEDIA_TIMEOUT_MS,
        processedMediaCache
    } = deps;

    function buildProcessedMediaCacheKey(tenantId = '', sourceKey = '', variant = 'raw') {
        const safeTenantId = String(tenantId || '').trim();
        const safeSourceKey = String(sourceKey || '').trim();
        const safeVariant = String(variant || 'raw').trim().toLowerCase() || 'raw';
        if (!safeTenantId || !safeSourceKey) return '';
        return `${safeTenantId}:${safeVariant}:${safeSourceKey}`;
    }

    function cloneProcessedMediaEntry(entry = null) {
        if (!entry || typeof entry !== 'object') return null;
        return {
            mediaData: String(entry.mediaData || ''),
            mimetype: String(entry.mimetype || '').trim() || null,
            extension: String(entry.extension || '').trim() || null,
            filename: String(entry.filename || '').trim() || null,
            sourceUrl: String(entry.sourceUrl || '').trim() || null,
            publicUrl: String(entry.publicUrl || '').trim() || null,
            relativePath: String(entry.relativePath || '').trim() || null,
            fileSizeBytes: Number(entry.fileSizeBytes || 0) || null,
            convertedFrom: String(entry.convertedFrom || '').trim() || null,
            cachedAt: Number(entry.cachedAt || Date.now()) || Date.now()
        };
    }

    function getProcessedMediaFromCache(tenantId = '', sourceKey = '', variant = 'raw') {
        if (!(processedMediaCache instanceof Map)) return null;
        const cacheKey = buildProcessedMediaCacheKey(tenantId, sourceKey, variant);
        if (!cacheKey) return null;
        return cloneProcessedMediaEntry(processedMediaCache.get(cacheKey));
    }

    function setProcessedMediaCacheEntry(tenantId = '', sourceKey = '', media = null, variant = 'raw') {
        if (!(processedMediaCache instanceof Map)) return null;
        const cacheKey = buildProcessedMediaCacheKey(tenantId, sourceKey, variant);
        const normalized = cloneProcessedMediaEntry(media);
        if (!cacheKey || !normalized?.mediaData) return null;
        normalized.cachedAt = Date.now();
        processedMediaCache.set(cacheKey, normalized);
        return cloneProcessedMediaEntry(normalized);
    }

    function slugifyFileName(value = 'producto') {
        const clean = String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return clean || 'producto';
    }

    function buildCatalogProductCaption(product = {}) {
        const title = String(product?.title || product?.name || 'Producto').trim() || 'Producto';

        const parsePrice = (value, fallback = 0) => {
            const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
            if (Number.isFinite(parsed)) return parsed;
            return Number.isFinite(fallback) ? fallback : 0;
        };

        const finalPrice = parsePrice(product?.price, 0);
        const regularPrice = parsePrice(product?.regularPrice ?? product?.regular_price, finalPrice);

        const lines = [`*${title}*`];

        if (regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice) {
            const discountAmount = Math.max(regularPrice - finalPrice, 0);
            lines.push(`Precio regular: S/ ${regularPrice.toFixed(2)}`);
            lines.push(`*Descuento: S/ ${discountAmount.toFixed(2)}*`);
            lines.push(`*PRECIO FINAL: S/ ${finalPrice.toFixed(2)}*`);
        } else if (finalPrice > 0) {
            lines.push(`*PRECIO FINAL: S/ ${finalPrice.toFixed(2)}*`);
        } else {
            lines.push('*PRECIO FINAL: CONSULTAR*');
        }

        const description = String(product?.description || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (description) {
            lines.push('');
            lines.push(`Detalle: ${description.length > 280 ? `${description.slice(0, 277)}...` : description}`);
        }

        return lines.join('\n');
    }

    function buildCatalogImageCandidateUrls(imageUrl = '') {
        const rawUrl = String(imageUrl || '').trim();
        if (!rawUrl) return [];

        const candidates = [];
        const seen = new Set();
        const pushCandidate = (nextUrl = '') => {
            const clean = String(nextUrl || '').trim();
            if (!clean || seen.has(clean)) return;
            seen.add(clean);
            candidates.push(clean);
        };

        pushCandidate(rawUrl);

        let parsed;
        try {
            parsed = new URL(rawUrl);
        } catch (e) {
            return candidates;
        }

        const pathname = String(parsed.pathname || '');
        const extMatch = pathname.match(/\.([a-z0-9]{3,4})$/i);
        const ext = String(extMatch?.[1] || '').toLowerCase();
        if (['webp', 'gif', 'avif'].includes(ext)) {
            for (const fallbackExt of ['jpg', 'jpeg', 'png']) {
                const clone = new URL(parsed.toString());
                clone.pathname = pathname.replace(/\.[a-z0-9]{3,4}$/i, '.' + fallbackExt);
                pushCandidate(clone.toString());
            }
        }

        const queryKeys = ['format', 'fm', 'output-format', 'ext'];
        for (const key of queryKeys) {
            const current = String(parsed.searchParams.get(key) || '').trim().toLowerCase();
            if (!['webp', 'gif', 'avif'].includes(current)) continue;
            const clone = new URL(parsed.toString());
            clone.searchParams.set(key, 'jpg');
            pushCandidate(clone.toString());
        }

        return candidates;
    }

    function normalizeUploadsRelativePath(value = '') {
        const raw = String(value || '').replace(/\\+/g, '/').trim();
        if (!raw) return '';
        const normalized = path.posix.normalize(raw).replace(/^\/+/, '');
        if (!normalized || normalized === '.' || normalized.startsWith('..') || normalized.includes('/../')) return '';
        return normalized;
    }

    function resolveLocalUploadReference(rawUrl = '') {
        const clean = String(rawUrl || '').trim();
        if (!clean) return null;

        let pathname = clean;
        if (/^https?:\/\//i.test(clean)) {
            try {
                const parsedUrl = new URL(clean);
                const localHostNames = new Set(['localhost', '127.0.0.1', '::1']);
                const hostName = String(parsedUrl.hostname || '').trim().toLowerCase();
                if (!localHostNames.has(hostName)) return null;
                pathname = String(parsedUrl.pathname || '').trim();
            } catch (e) {
                return null;
            }
        }

        if (!pathname) return null;
        if (!pathname.startsWith('/uploads/') && !pathname.startsWith('uploads/')) return null;

        const relativePart = pathname.startsWith('/uploads/')
            ? pathname.slice('/uploads/'.length)
            : pathname.slice('uploads/'.length);

        const normalizedRelative = normalizeUploadsRelativePath(relativePart);
        if (!normalizedRelative) return null;

        const absolutePath = path.resolve(SAAS_UPLOADS_ROOT, normalizedRelative);
        const relativeToRoot = path.relative(SAAS_UPLOADS_ROOT, absolutePath);
        if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null;

        return {
            sourceUrl: clean,
            publicUrl: '/uploads/' + normalizedRelative,
            relativePath: normalizedRelative,
            absolutePath
        };
    }

    function guessMimeFromPathOrUrl(input = '') {
        const ext = String(path.extname(String(input || '')).replace(/^\./, '') || '').trim().toLowerCase();
        const map = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            gif: 'image/gif',
            avif: 'image/avif'
        };
        return map[ext] || 'image/jpeg';
    }

    function guessMimeFromFilename(input = '') {
        const ext = String(path.extname(String(input || '')).replace(/^\./, '') || '').trim().toLowerCase();
        const map = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            gif: 'image/gif',
            avif: 'image/avif',
            pdf: 'application/pdf',
            txt: 'text/plain',
            csv: 'text/csv',
            json: 'application/json',
            xml: 'application/xml',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        };
        return map[ext] || 'application/octet-stream';
    }

    function parseContentDispositionFilename(headerValue = '') {
        const raw = String(headerValue || '').trim();
        if (!raw) return null;
        const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match?.[1]) {
            try {
                return sanitizeFilenameCandidate(decodeURIComponent(String(utf8Match[1] || '').trim()));
            } catch (e) {
                return sanitizeFilenameCandidate(String(utf8Match[1] || '').trim());
            }
        }
        const plainMatch = raw.match(/filename="?([^\";]+)"?/i);
        if (plainMatch?.[1]) return sanitizeFilenameCandidate(String(plainMatch[1] || '').trim());
        return null;
    }

    function buildQuickReplyFilename({ fileNameHint = '', sourceUrl = '', mimeType = '' } = {}) {
        const safeHint = sanitizeFilenameCandidate(fileNameHint) || null;
        const safeSource = sanitizeFilenameCandidate(sourceUrl) || null;
        const fallback = safeHint || safeSource || `adjunto_${Date.now()}`;
        const extension = getFilenameExtension(fallback);
        if (extension) return fallback;
        const mimeExt = guessFileExtensionFromMime(mimeType);
        return mimeExt ? `${fallback}.${mimeExt}` : fallback;
    }

    function parseCatalogImageDataUrl(rawValue = '', { maxBytes = 4 * 1024 * 1024 } = {}) {
        const clean = String(rawValue || '').trim();
        if (!/^data:image\//i.test(clean)) return null;

        const match = clean.match(/^data:([^;]+);base64,(.+)$/i);
        if (!match) return null;

        const mimetype = String(match[1] || '').trim().toLowerCase();
        if (!mimetype.startsWith('image/')) return null;

        let buffer;
        try {
            buffer = Buffer.from(String(match[2] || '').trim(), 'base64');
        } catch (e) {
            return null;
        }

        if (!buffer?.length || buffer.length > maxBytes) return null;

        return {
            mediaData: buffer.toString('base64'),
            mimetype,
            extension: CATALOG_IMAGE_EXT_BY_MIME[mimetype] || ((() => {
                const suffix = String(mimetype.split('/')[1] || '').trim().toLowerCase();
                if (suffix === 'jpeg' || suffix === 'jpg') return 'jpg';
                return suffix || 'jpg';
            })()),
            fileSizeBytes: buffer.length,
            sourceUrl: null,
            publicUrl: null,
            relativePath: null
        };
    }

    async function fetchCatalogProductImageFromLocalUpload(reference = null, { maxBytes = 4 * 1024 * 1024 } = {}) {
        if (!reference?.absolutePath) return null;

        try {
            const stat = await fs.promises.stat(reference.absolutePath);
            if (!stat?.isFile()) return null;
            if (Number(stat.size || 0) <= 0 || Number(stat.size || 0) > maxBytes) return null;

            const imageBuffer = await fs.promises.readFile(reference.absolutePath);
            if (!imageBuffer?.length || imageBuffer.length > maxBytes) return null;

            const guessedMime = guessMimeFromPathOrUrl(reference.absolutePath);
            return {
                mediaData: imageBuffer.toString('base64'),
                mimetype: guessedMime,
                extension: CATALOG_IMAGE_EXT_BY_MIME[guessedMime] || String(path.extname(reference.absolutePath || '').replace(/^\./, '') || 'jpg').toLowerCase(),
                sourceUrl: reference.sourceUrl || reference.publicUrl || null,
                publicUrl: reference.publicUrl || null,
                relativePath: reference.relativePath || null,
                fileSizeBytes: Number(imageBuffer.length || 0) || null
            };
        } catch (e) {
            return null;
        }
    }

    async function fetchQuickReplyMedia(rawUrl = '', { tenantId = 'default', maxBytes = QUICK_REPLY_MEDIA_MAX_BYTES, timeoutMs = QUICK_REPLY_MEDIA_TIMEOUT_MS, mimeHint = '', fileNameHint = '' } = {}) {
        const cleanUrl = String(rawUrl || '').trim();
        const cleanMimeHint = String(mimeHint || '').trim().toLowerCase();
        const safeMaxBytes = Math.max(256 * 1024, Number(maxBytes || QUICK_REPLY_MEDIA_MAX_BYTES || (50 * 1024 * 1024)));
        const safeTimeoutMs = Math.max(2000, Number(timeoutMs || QUICK_REPLY_MEDIA_TIMEOUT_MS || 15000));
        if (!cleanUrl) return null;

        const cachedMedia = getProcessedMediaFromCache(tenantId, cleanUrl, 'raw');
        if (cachedMedia) return cachedMedia;

        const dataUrlMatch = cleanUrl.match(/^data:([^;]+);base64,(.+)$/i);
        if (dataUrlMatch) {
            try {
                const mimetype = String(dataUrlMatch[1] || cleanMimeHint || 'application/octet-stream').trim().toLowerCase();
                const mediaBuffer = Buffer.from(String(dataUrlMatch[2] || '').trim(), 'base64');
                if (!mediaBuffer?.length || mediaBuffer.length > safeMaxBytes) return null;
                const filename = buildQuickReplyFilename({
                    fileNameHint,
                    sourceUrl: '',
                    mimeType: mimetype
                });
                const inlineMedia = {
                    mediaData: mediaBuffer.toString('base64'),
                    mimetype,
                    filename,
                    fileSizeBytes: Number(mediaBuffer.length || 0) || null,
                    sourceUrl: null,
                    publicUrl: null,
                    relativePath: null
                };
                return setProcessedMediaCacheEntry(tenantId, cleanUrl, inlineMedia, 'raw') || inlineMedia;
            } catch (e) {
                return null;
            }
        }

        const localReference = resolveLocalUploadReference(cleanUrl);
        if (localReference?.absolutePath) {
            try {
                const stat = await fs.promises.stat(localReference.absolutePath);
                if (!stat?.isFile()) return null;
                const fileSizeBytes = Number(stat.size || 0);
                if (!fileSizeBytes || fileSizeBytes > safeMaxBytes) return null;
                const mediaBuffer = await fs.promises.readFile(localReference.absolutePath);
                if (!mediaBuffer?.length || mediaBuffer.length > safeMaxBytes) return null;
                const guessedMime = cleanMimeHint || guessMimeFromFilename(localReference.absolutePath) || 'application/octet-stream';
                const filename = buildQuickReplyFilename({
                    fileNameHint: fileNameHint || path.basename(localReference.absolutePath || ''),
                    sourceUrl: localReference.sourceUrl || localReference.publicUrl || '',
                    mimeType: guessedMime
                });
                const localMedia = {
                    mediaData: mediaBuffer.toString('base64'),
                    mimetype: guessedMime,
                    filename,
                    fileSizeBytes: Number(mediaBuffer.length || 0) || null,
                    sourceUrl: localReference.sourceUrl || localReference.publicUrl || null,
                    publicUrl: localReference.publicUrl || null,
                    relativePath: localReference.relativePath || null
                };
                return setProcessedMediaCacheEntry(tenantId, cleanUrl, localMedia, 'raw') || localMedia;
            } catch (e) {
                return null;
            }
        }

        let parsed;
        try {
            parsed = new URL(cleanUrl);
        } catch (e) {
            return null;
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;

        try {
            await resolveAndValidatePublicHost(parsed.hostname);
        } catch (e) {
            return null;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), safeTimeoutMs);
        let response;
        try {
            response = await fetch(parsed.toString(), {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Lavitat QuickReply Media Fetcher)',
                    'Accept': '*/*'
                },
                signal: controller.signal
            });
        } catch (e) {
            return null;
        } finally {
            clearTimeout(timeout);
        }

        if (!response?.ok) return null;

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength && contentLength > safeMaxBytes) return null;

        const mediaBuffer = Buffer.from(await response.arrayBuffer());
        if (!mediaBuffer.length || mediaBuffer.length > safeMaxBytes) return null;

        const responseMime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const mimetype = responseMime || cleanMimeHint || guessMimeFromFilename(parsed.pathname) || 'application/octet-stream';
        const filename = buildQuickReplyFilename({
            fileNameHint: fileNameHint || parseContentDispositionFilename(response.headers.get('content-disposition') || ''),
            sourceUrl: parsed.pathname,
            mimeType: mimetype
        });

        const fetchedMedia = {
            mediaData: mediaBuffer.toString('base64'),
            mimetype,
            filename,
            fileSizeBytes: Number(mediaBuffer.length || 0) || null,
            sourceUrl: parsed.toString(),
            publicUrl: parsed.toString(),
            relativePath: null
        };
        return setProcessedMediaCacheEntry(tenantId, cleanUrl, fetchedMedia, 'raw') || fetchedMedia;
    }

    async function fetchCatalogProductImageFromUrl(rawUrl, { tenantId = 'default', maxBytes = 4 * 1024 * 1024, timeoutMs = 7000 } = {}) {
        const cleanUrl = String(rawUrl || '').trim();
        if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) return null;

        const cachedMedia = getProcessedMediaFromCache(tenantId, cleanUrl, 'raw');
        if (cachedMedia) return cachedMedia;

        const localReference = resolveLocalUploadReference(cleanUrl);
        if (localReference) {
            const localMedia = await fetchCatalogProductImageFromLocalUpload(localReference, { maxBytes });
            if (localMedia) return localMedia;
        }

        let parsed;
        try {
            parsed = new URL(cleanUrl);
        } catch (e) {
            return null;
        }

        if (!['http:', 'https:'].includes(parsed.protocol)) return null;

        try {
            await resolveAndValidatePublicHost(parsed.hostname);
        } catch (e) {
            return null;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(parsed.toString(), {
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (WhatsApp Business Pro Catalog Fetcher)',
                    'Accept': CATALOG_IMAGE_FETCH_ACCEPT
                },
                signal: controller.signal
            });
        } catch (e) {
            return null;
        } finally {
            clearTimeout(timeout);
        }

        if (!response?.ok) return null;

        const contentTypeRaw = String(response.headers.get('content-type') || '').toLowerCase();
        const contentType = contentTypeRaw.split(';')[0] || 'image/jpeg';
        if (!contentType.startsWith('image/')) return null;

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength && contentLength > maxBytes) return null;

        const imageBuffer = Buffer.from(await response.arrayBuffer());
        if (!imageBuffer.length || imageBuffer.length > maxBytes) return null;

        const fetchedImage = {
            mediaData: imageBuffer.toString('base64'),
            mimetype: contentType,
            extension: CATALOG_IMAGE_EXT_BY_MIME[contentType] || 'jpg',
            sourceUrl: parsed.toString(),
            publicUrl: parsed.toString(),
            relativePath: null,
            fileSizeBytes: Number(imageBuffer.length || 0) || null
        };
        return setProcessedMediaCacheEntry(tenantId, cleanUrl, fetchedImage, 'raw') || fetchedImage;
    }

    async function fetchCatalogProductImage(imageUrl, { tenantId = 'default', maxBytes = 4 * 1024 * 1024, timeoutMs = 7000 } = {}) {
        const cachedMedia = getProcessedMediaFromCache(tenantId, imageUrl, 'raw');
        if (cachedMedia) return cachedMedia;

        const inline = parseCatalogImageDataUrl(imageUrl, { maxBytes });
        if (inline) return inline;

        const localReference = resolveLocalUploadReference(imageUrl);
        if (localReference) {
            const localMedia = await fetchCatalogProductImageFromLocalUpload(localReference, { maxBytes });
            if (localMedia) return localMedia;
        }

        const candidates = buildCatalogImageCandidateUrls(imageUrl);
        if (!candidates.length) return null;

        let fallbackUnsupported = null;
        for (const candidate of candidates) {
            const cachedCandidateMedia = getProcessedMediaFromCache(tenantId, candidate, 'raw');
            if (cachedCandidateMedia) return cachedCandidateMedia;
            const localCandidate = resolveLocalUploadReference(candidate);
            const media = localCandidate
                ? await fetchCatalogProductImageFromLocalUpload(localCandidate, { maxBytes })
                : await fetchCatalogProductImageFromUrl(candidate, { tenantId, maxBytes, timeoutMs });
            if (!media) continue;
            const mediaMime = String(media?.mimetype || '').trim().toLowerCase();
            if (CLOUD_CATALOG_COMPATIBLE_MIME.has(mediaMime)) return media;
            if (!fallbackUnsupported && mediaMime.startsWith('image/')) fallbackUnsupported = media;
        }

        return fallbackUnsupported;
    }

    async function ensureCloudApiCompatibleCatalogImage(media = null, { tenantId = 'default', cacheKey = '', maxBytes = 4 * 1024 * 1024 } = {}) {
        if (!media || typeof media !== 'object') return null;
        const sourceCacheKey = String(cacheKey || media?.sourceUrl || media?.publicUrl || '').trim();
        const cachedMedia = getProcessedMediaFromCache(tenantId, sourceCacheKey, 'cloud-compatible');
        if (cachedMedia) return cachedMedia;
        const mediaMime = String(media?.mimetype || '').trim().toLowerCase();
        if (!mediaMime.startsWith('image/')) return null;

        if (CLOUD_CATALOG_COMPATIBLE_MIME.has(mediaMime)) {
            const compatibleMedia = {
                mediaData: String(media.mediaData || ''),
                mimetype: mediaMime,
                extension: CATALOG_IMAGE_EXT_BY_MIME[mediaMime] || 'jpg',
                sourceUrl: String(media?.sourceUrl || '').trim() || null,
                publicUrl: String(media?.publicUrl || media?.sourceUrl || '').trim() || null,
                relativePath: String(media?.relativePath || '').trim() || null,
                fileSizeBytes: Number(media?.fileSizeBytes || 0) || null
            };
            return setProcessedMediaCacheEntry(tenantId, sourceCacheKey, compatibleMedia, 'cloud-compatible') || compatibleMedia;
        }

        const sharp = getSharpImageProcessor();
        if (!sharp) return null;

        try {
            const inputBuffer = Buffer.from(String(media.mediaData || ''), 'base64');
            if (!inputBuffer.length) return null;

            const convertedBuffer = await sharp(inputBuffer, { failOn: 'none', animated: false })
                .rotate()
                .flatten({ background: '#ffffff' })
                .jpeg({ quality: 86, mozjpeg: true })
                .toBuffer();

            if (!convertedBuffer.length || convertedBuffer.length > maxBytes) return null;

            const convertedMedia = {
                mediaData: convertedBuffer.toString('base64'),
                mimetype: 'image/jpeg',
                extension: 'jpg',
                convertedFrom: mediaMime,
                sourceUrl: String(media?.sourceUrl || '').trim() || null,
                publicUrl: String(media?.publicUrl || media?.sourceUrl || '').trim() || null,
                relativePath: String(media?.relativePath || '').trim() || null,
                fileSizeBytes: Number(convertedBuffer.length || 0) || null
            };
            return setProcessedMediaCacheEntry(tenantId, sourceCacheKey, convertedMedia, 'cloud-compatible') || convertedMedia;
        } catch (error) {
            return null;
        }
    }

    async function resolveQuickReplyMediaForSend(rawUrl = '', options = {}) {
        return await fetchQuickReplyMedia(rawUrl, options);
    }

    async function resolveCatalogProductMediaForSend(imageUrl = '', {
        tenantId = 'default',
        maxBytes = 4 * 1024 * 1024,
        timeoutMs = 7000
    } = {}) {
        const fetchedMedia = await fetchCatalogProductImage(imageUrl, {
            tenantId,
            maxBytes,
            timeoutMs
        });
        if (!fetchedMedia) return null;
        return await ensureCloudApiCompatibleCatalogImage(fetchedMedia, {
            tenantId,
            cacheKey: imageUrl,
            maxBytes
        });
    }

    return {
        slugifyFileName,
        buildCatalogProductCaption,
        buildCatalogImageCandidateUrls,
        normalizeUploadsRelativePath,
        resolveLocalUploadReference,
        guessMimeFromPathOrUrl,
        guessMimeFromFilename,
        parseContentDispositionFilename,
        buildQuickReplyFilename,
        parseCatalogImageDataUrl,
        fetchCatalogProductImageFromLocalUpload,
        fetchQuickReplyMedia,
        fetchCatalogProductImageFromUrl,
        fetchCatalogProductImage,
        ensureCloudApiCompatibleCatalogImage,
        resolveQuickReplyMediaForSend,
        resolveCatalogProductMediaForSend,
        buildProcessedMediaCacheKey,
        getProcessedMediaFromCache,
        setProcessedMediaCacheEntry
    };
}

module.exports = {
    createMessageMediaAssetsHelpers
};
