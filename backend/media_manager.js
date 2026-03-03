const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class MediaManager {
    constructor() {
        this.cacheDir = path.join(__dirname, 'media_cache');
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        // Limpiamos caché antiguo al iniciar (opcionalmente)
        this.pruneCache(24 * 60 * 60 * 1000); // 24 horas
    }

    /**
     * Genera un hash para el ID del mensaje para usarlo como nombre de archivo.
     */
    getCachePath(messageId, mimetype) {
        const hash = crypto.createHash('md5').update(messageId).digest('hex');
        const ext = mimetype.split('/')[1] || 'bin';
        return path.join(this.cacheDir, `${hash}.${ext}`);
    }

    /**
     * Intenta obtener la data base64 de la caché.
     */
    async getFromCache(messageId, mimetype) {
        const filePath = this.getCachePath(messageId, mimetype);
        if (fs.existsSync(filePath)) {
            console.log(`Media cache hit for ${messageId}`);
            return fs.readFileSync(filePath, 'base64');
        }
        return null;
    }

    /**
     * Guarda la data base64 en la caché.
     */
    async saveToCache(messageId, mimetype, base64Data) {
        try {
            const filePath = this.getCachePath(messageId, mimetype);
            fs.writeFileSync(filePath, base64Data, 'base64');
            console.log(`Media cached: ${filePath}`);
        } catch (error) {
            console.error('Error saving to media cache:', error);
        }
    }

    /**
     * Elimina archivos antiguos de la caché.
     */
    pruneCache(maxAgeMs) {
        const now = Date.now();
        fs.readdir(this.cacheDir, (err, files) => {
            if (err) return;
            files.forEach(file => {
                const filePath = path.join(this.cacheDir, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    if (now - stats.mtimeMs > maxAgeMs) {
                        fs.unlink(filePath, () => { });
                    }
                });
            });
        });
    }

    /**
     * Procesa un mensaje con media, usando caché si está disponible.
     */
    async processMessageMedia(message) {
        if (!message.hasMedia) return null;

        const messageId = message.id._serialized;
        // Intentar obtener de caché primero
        // Nota: El mimetype no lo sabemos hasta descargar, pero para mensajes entrantes
        // podemos usar el ID como clave principal en un objeto de mapeo o simplemente
        // buscar si existe algún archivo con ese hash.

        // Versión simplificada: descargamos y guardamos si no existe.
        const cached = await this.getFromCache(messageId, ''); // Búsqueda aproximada o simplificada
        if (cached) return { data: cached, mimetype: 'image/jpeg' }; // Mimetype idealmente debería guardarse también

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
