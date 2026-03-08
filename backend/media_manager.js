const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class MediaManager {
    constructor() {
        this.cacheDir = path.join(__dirname, 'media_cache');
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        this.pruneCache(24 * 60 * 60 * 1000);
    }

    getMessageHash(messageId) {
        return crypto.createHash('md5').update(messageId).digest('hex');
    }

    getCachePath(messageId, mimetype) {
        const hash = this.getMessageHash(messageId);
        const rawExt = String(mimetype || '').split('/')[1] || 'bin';
        const ext = rawExt.split(';')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
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
            mp3: 'audio/mpeg',
            ogg: 'audio/ogg',
            opus: 'audio/ogg',
            mp4: 'video/mp4',
            pdf: 'application/pdf'
        };
        return map[clean] || `application/${clean}`;
    }

    readMeta(messageId) {
        try {
            const metaPath = this.getMetaPath(messageId);
            if (!fs.existsSync(metaPath)) return null;
            const raw = fs.readFileSync(metaPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    sanitizeFilename(value = '') {
        const text = String(value || '').trim().replace(/[\u0000-\u001F]/g, '');
        if (!text) return null;
        return text;
    }

    toPositiveInt(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return Math.round(parsed);
    }

    async getFromCache(messageId) {
        const hash = this.getMessageHash(messageId);
        const files = fs.readdirSync(this.cacheDir);
        const hit = files.find((name) => name.startsWith(`${hash}.`) && !name.endsWith('.meta.json'));
        if (!hit) return null;

        const filePath = path.join(this.cacheDir, hit);
        const ext = path.extname(hit).replace('.', '');
        const meta = this.readMeta(messageId) || {};
        console.log(`Media cache hit for ${messageId}`);
        return {
            data: fs.readFileSync(filePath, 'base64'),
            mimetype: String(meta.mimetype || this.extToMime(ext)),
            filename: this.sanitizeFilename(meta.filename || ''),
            fileSizeBytes: this.toPositiveInt(meta.fileSizeBytes)
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
                fileSizeBytes: this.toPositiveInt(metadata.fileSizeBytes)
            };
            fs.writeFileSync(metaPath, JSON.stringify(metaPayload), 'utf8');

            console.log(`Media cached: ${filePath}`);
        } catch (error) {
            console.error('Error saving to media cache:', error);
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

    async processMessageMedia(message) {
        if (!message.hasMedia) return null;

        const messageId = message.id._serialized;
        const cached = await this.getFromCache(messageId);
        if (cached) return cached;

        try {
            const media = await message.downloadMedia();
            if (media) {
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

                await this.saveToCache(messageId, media.mimetype, media.data, {
                    filename,
                    fileSizeBytes
                });

                return {
                    ...media,
                    filename,
                    fileSizeBytes
                };
            }
        } catch (error) {
            console.error('Error downloading media:', error);
        }
        return null;
    }
}

module.exports = new MediaManager();
