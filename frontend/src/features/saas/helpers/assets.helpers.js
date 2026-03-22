export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No se encontro el archivo para subir.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
        reader.readAsDataURL(file);
    });
}

export function resolveQuickReplyMimeType(file, { allowedMimeTypes = [], extToMime = {} } = {}) {
    const fileType = String(file?.type || '').trim().toLowerCase();
    if (fileType && allowedMimeTypes.includes(fileType)) return fileType;
    const fileName = String(file?.name || '').trim().toLowerCase();
    const extMatch = fileName.match(/\.[a-z0-9]+$/i);
    const ext = String(extMatch?.[0] || '').trim().toLowerCase();
    const mimeFromExt = extToMime[ext] || '';
    if (mimeFromExt && allowedMimeTypes.includes(mimeFromExt)) return mimeFromExt;
    return fileType || '';
}

export async function buildDataUrlWithMime(file, mimeType = '') {
    const rawDataUrl = await readFileAsDataUrl(file);
    const base64Payload = String(rawDataUrl || '').split(',')[1] || '';
    if (!base64Payload) throw new Error('No se pudo leer el adjunto seleccionado.');
    const cleanMime = String(mimeType || '').trim().toLowerCase();
    if (!cleanMime) throw new Error('No se pudo detectar el tipo de archivo.');
    return `data:${cleanMime};base64,${base64Payload}`;
}

export async function uploadImageAsset({ file, tenantId, scope, requestJson }) {
    if (typeof requestJson !== 'function') {
        throw new Error('requestJson no disponible para subir activos.');
    }
    const dataUrl = await readFileAsDataUrl(file);
    const payload = await requestJson('/api/admin/saas/assets/upload', {
        method: 'POST',
        body: {
            tenantId,
            scope,
            fileName: String(file?.name || 'imagen').trim() || 'imagen',
            dataUrl
        }
    });
    return String(payload?.file?.url || payload?.file?.relativeUrl || '').trim();
}
