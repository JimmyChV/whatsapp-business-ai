const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class MediaManager {
    constructor() {
        this.cacheDir = path.join(__dirname, 'media_cache');
        const uploadsRoot = path.resolve(String(process.env.SAAS_UPLOADS_DIR || path.join(__dirname, 'uploads')).trim() || path.join(__dirname, 'uploads'));
        this.waMediaDir = path.resolve(String(process.env.WA_MEDIA_STORAGE_DIR || path.join(uploadsRoot, 'wa-media')).trim() || path.join(uploadsRoot, 'wa-media'));

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        if (!fs.existsSync(this.waMediaDir)) {
            fs.mkdirSync(this.waMediaDir, { recursive: true });
        }

        this.pruneCache(24 * 60 * 60 * 1000);
    }

    getMessageHash(messageId) {
        return crypto.createHash('md5').update(String(messageId || '')).digest('hex');
    }

    getCachePath(messageId, mimetype) {
        const hash = this.getMessageHash(messageId);
        const ext = this.detectExtension('', mimetype);
        return path.join(this.cacheDir, `${hash}.${ext}`);
    }

    getMetaPath(messageId) {
        const hash = this.getMessageHash(messageId);
        return path.join(this.cacheDir, `${hash}.meta.json`);
    }

    extToMime(ext = '') {
        const clean = String(ext || '').toLowerCase();
        if (!clean) return 'application/octet-stream';
        const map = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            gif: 'image/gif',
            bmp: 'image/bmp',
            mp3: 'audio/mpeg',
            ogg: 'audio/ogg',
            opus: 'audio/ogg',
            mp4: 'video/mp4',
            pdf: 'application/pdf'
        };
        return map[clean] || `application/${clean}`;
    }

    sanitizeFilename(value = '') {
        const text = String(value || '').trim().replace(/[\u0000-\u001F]/g, '');
        if (!text) return null;
        return text;
    }

    sanitizeSegment(value = '', fallback = 'default') {
        const text = String(value || fallback || '').trim();
        if (!text) return fallback;
        const clean = text.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        return clean || fallback;
    }

    detectExtension(filename = '', mimetype = '') {
        const fromName = String(filename || '').trim().split('.').pop();
        const cleanNameExt = String(fromName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanNameExt) return cleanNameExt;

        const mime = String(mimetype || '').trim().toLowerCase().split(';')[0];
        const map = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'image/bmp': 'bmp',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
            'video/mp4': 'mp4',
            'application/pdf': 'pdf'
        };
        return map[mime] || 'bin';
    }

    toPositiveInt(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return Math.round(parsed);
    }

    readMeta(messageId) {
        try {
            const metaPath = this.getMetaPath(messageId);
            if (!fs.existsSync(metaPath)) return null;
            const raw = fs.readFileSync(metaPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        } catch (_) {
            return null;
        }
    }

    resolveContactSegment(context = {}, message = {}) {
        const fromContext = String(context?.contactId || '').trim();
        const source = fromContext || String(message?.fromMe ? message?.to : message?.from || '').trim();
        const withoutDomain = source.includes('@') ? source.split('@')[0] : source;
        return this.sanitizeSegment(withoutDomain, 'contact');
    }

    async getFromCache(messageId) {
        const hash = this.getMessageHash(messageId);
        const files = fs.readdirSync(this.cacheDir);
        const hit = files.find((name) => name.startsWith(`${hash}.`) && !name.endsWith('.meta.json'));
        if (!hit) return null;

        const filePath = path.join(this.cacheDir, hit);
        const ext = path.extname(hit).replace('.', '');
        const meta = this.readMeta(messageId) || {};

        return {
            data: fs.readFileSync(filePath, 'base64'),
            mimetype: String(meta.mimetype || this.extToMime(ext)),
            filename: this.sanitizeFilename(meta.filename || ''),
            fileSizeBytes: this.toPositiveInt(meta.fileSizeBytes),
            relativePath: String(meta.relativePath || '').trim() || null,
            publicUrl: String(meta.publicUrl || '').trim() || null
        };
    }

    async saveToCache(messageId, mimetype, base64Data, metadata = {}) {
        try {
            const filePath = this.getCachePath(messageId, mimetype);
            fs.writeFileSync(filePath, base64Data, 'base64');

            const metaPath = this.getMetaPath(messageId);
            const metaPayload = {
                mimetype: String(mimetype || ''),
                filename: this.sanitizeFilename(metadata.filename || '') || null,
                fileSizeBytes: this.toPositiveInt(metadata.fileSizeBytes),
                relativePath: String(metadata.relativePath || '').trim() || null,
                publicUrl: String(metadata.publicUrl || '').trim() || null
            };
            fs.writeFileSync(metaPath, JSON.stringify(metaPayload), 'utf8');
        } catch (error) {
            console.error('Error saving to media cache:', error);
        }
    }

    async storePersistentMedia(messageId, mimetype, base64Data, metadata = {}, context = {}) {
        if (!base64Data) return { relativePath: null, publicUrl: null };

        try {
            const timestampUnix = Number(context?.timestampUnix || metadata?.timestampUnix || 0) || Math.floor(Date.now() / 1000);
            const date = new Date(timestampUnix * 1000);
            const yyyy = String(date.getUTCFullYear());
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(date.getUTCDate()).padStart(2, '0');

            const tenantSegment = this.sanitizeSegment(context?.tenantId, 'default');
            const moduleSegment = this.sanitizeSegment(context?.moduleId, 'module');
            const contactSegment = this.resolveContactSegment(context, context?.message || {});
            const ext = this.detectExtension(metadata?.filename || '', mimetype);
            const fileBase = this.sanitizeSegment(String(messageId || '').replace(/[:@]/g, '_'), 'media');
            const fileName = `${fileBase}.${ext}`;

            const relativeParts = ['wa-media', tenantSegment, moduleSegment, contactSegment, yyyy, mm, dd, fileName];
            const relativePath = relativeParts.join('/');
            const absolutePath = path.join(this.waMediaDir, tenantSegment, moduleSegment, contactSegment, yyyy, mm, dd, fileName);

            await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.promises.writeFile(absolutePath, base64Data, 'base64');

            return {
                relativePath,
                publicUrl: '/uploads/' + relativePath
            };
        } catch (error) {
            console.error('Error storing persistent media:', error);
            return { relativePath: null, publicUrl: null };
        }
    }

    pruneCache(maxAgeMs) {
        const now = Date.now();
        fs.readdir(this.cacheDir, (err, files) => {
            if (err) return;
            files.forEach((file) => {
                const filePath = path.join(this.cacheDir, file);
                fs.stat(filePath, (statErr, stats) => {
                    if (statErr) return;
                    if (now - stats.mtimeMs > maxAgeMs) {
                        fs.unlink(filePath, () => { });
                    }
                });
            });
        });
    }

    async processMessageMedia(message, context = {}) {
        if (!message?.hasMedia) return null;

        const messageId = message?.id?._serialized;
        if (!messageId) return null;

        const cached = await this.getFromCache(messageId);
        if (cached) {
            return cached;
        }

        try {
            const media = await message.downloadMedia();
            if (!media) return null;

            const raw = message?._data || {};
            const sizeCandidates = [
                raw?.size,
                raw?.fileSize,
                raw?.fileLength,
                raw?.mediaData?.size,
                media?.filesize,
                media?.fileSize,
                media?.size
            ];

            let fileSizeBytes = null;
            for (const candidate of sizeCandidates) {
                const parsed = Number(candidate);
                if (Number.isFinite(parsed) && parsed > 0) {
                    fileSizeBytes = Math.round(parsed);
                    break;
                }
            }
            if (!fileSizeBytes && media?.data) {
                fileSizeBytes = Math.round((String(media.data).length * 3) / 4);
            }

            const filename = this.sanitizeFilename(
                media?.filename
                || raw?.filename
                || raw?.fileName
                || raw?.mediaData?.filename
                || ''
            );

            const persisted = await this.storePersistentMedia(messageId, media.mimetype, media.data, {
                filename,
                fileSizeBytes,
                timestampUnix: Number(message?.timestamp || 0) || null
            }, {
                ...context,
                message,
                timestampUnix: Number(message?.timestamp || 0) || null
            });

            await this.saveToCache(messageId, media.mimetype, media.data, {
                filename,
                fileSizeBytes,
                relativePath: persisted.relativePath,
                publicUrl: persisted.publicUrl
            });

            return {
                ...media,
                filename,
                fileSizeBytes,
                relativePath: persisted.relativePath,
                publicUrl: persisted.publicUrl
            };
        } catch (error) {
            console.error('Error downloading media:', error);
        }

        return null;
    }
}

module.exports = new MediaManager();


