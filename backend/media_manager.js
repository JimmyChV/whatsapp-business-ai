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

    async getFromCache(messageId) {
        const hash = this.getMessageHash(messageId);
        const files = fs.readdirSync(this.cacheDir);
        const hit = files.find((name) => name.startsWith(`${hash}.`));
        if (!hit) return null;

        const filePath = path.join(this.cacheDir, hit);
        const ext = path.extname(hit).replace('.', '');
        console.log(`Media cache hit for ${messageId}`);
        return {
            data: fs.readFileSync(filePath, 'base64'),
            mimetype: this.extToMime(ext)
        };
    }

    async saveToCache(messageId, mimetype, base64Data) {
        try {
            const filePath = this.getCachePath(messageId, mimetype);
            fs.writeFileSync(filePath, base64Data, 'base64');
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
                await this.saveToCache(messageId, media.mimetype, media.data);
                return media;
            }
        } catch (error) {
            console.error('Error downloading media:', error);
        }
        return null;
    }
}

module.exports = new MediaManager();

