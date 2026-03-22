function createTenantAssetUploadHelpers({
    env = process.env,
    uploadsBaseDir,
    parseCsvEnv,
    fs,
    path,
    crypto,
    tenantService,
    planLimitsService
} = {}) {
    if (!uploadsBaseDir || typeof parseCsvEnv !== 'function' || !fs || !path || !crypto || !tenantService || !planLimitsService) {
        throw new Error('createTenantAssetUploadHelpers missing required dependencies');
    }

    const uploadsRoot = path.resolve(String(env.SAAS_UPLOADS_DIR || path.join(uploadsBaseDir, 'uploads')).trim() || path.join(uploadsBaseDir, 'uploads'));
    const adminAssetUploadMaxBytes = Math.max(200 * 1024, Number(env.ADMIN_ASSET_UPLOAD_MAX_BYTES || 2 * 1024 * 1024));
    const adminAssetQuickReplyMaxBytes = Math.max(500 * 1024, Number(env.ADMIN_ASSET_QUICK_REPLY_MAX_BYTES || 50 * 1024 * 1024));

    const adminAssetAllowedMimeTypesImage = new Set((() => {
        const configured = parseCsvEnv(env.ADMIN_ASSET_ALLOWED_MIME_TYPES);
        const base = configured.length > 0 ? configured : ['image/jpeg', 'image/png', 'image/webp'];
        return base
            .map((entry) => String(entry || '').trim().toLowerCase())
            .filter(Boolean);
    })());

    const adminAssetAllowedMimeTypesQuickReply = new Set((() => {
        const configured = parseCsvEnv(env.ADMIN_ASSET_QUICK_REPLY_ALLOWED_MIME_TYPES);
        const base = configured.length > 0
            ? configured
            : [
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
        return base
            .map((entry) => String(entry || '').trim().toLowerCase())
            .filter(Boolean);
    })());

    if (!fs.existsSync(uploadsRoot)) {
        fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    function sanitizeStorageSegment(value = '', fallback = 'default') {
        const source = String(value || fallback || '').trim();
        if (!source) return fallback;
        const clean = source.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        return clean || fallback;
    }

    function getRequestOrigin(req = {}) {
        const protoRaw = String(req.headers?.['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
        const hostRaw = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
        const proto = protoRaw || 'http';
        if (!hostRaw) return '';
        return proto + '://' + hostRaw;
    }

    function normalizeAssetExtension(fileName = '', mimeType = '') {
        const fromName = String(fileName || '').trim().split('.').pop();
        const cleanNameExt = String(fromName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanNameExt && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'mp3', 'ogg', 'mp4'].includes(cleanNameExt)) {
            return cleanNameExt === 'jpg' ? 'jpeg' : cleanNameExt;
        }

        const mime = String(mimeType || '').trim().toLowerCase().split(';')[0];
        const map = {
            'image/png': 'png',
            'image/jpeg': 'jpeg',
            'image/jpg': 'jpeg',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'application/pdf': 'pdf',
            'text/plain': 'txt',
            'text/csv': 'csv',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'application/vnd.ms-powerpoint': 'ppt',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
            'application/zip': 'zip',
            'application/x-zip-compressed': 'zip',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
            'video/mp4': 'mp4'
        };
        return map[mime] || 'bin';
    }

    function normalizeAssetUploadKind(value = '') {
        const clean = String(value || '').trim().toLowerCase();
        if (clean === 'quick_reply' || clean === 'quickreply' || clean === 'quick-reply') return 'quick_reply';
        return 'image';
    }

    function parseAssetUploadPayload(body = {}, options = {}) {
        const source = body && typeof body === 'object' ? body : {};
        const dataUrl = String(source.dataUrl || source.data || '').trim();
        const base64Raw = String(source.base64 || '').trim();

        if (!dataUrl && !base64Raw) {
            throw new Error('No se recibio archivo para subir.');
        }

        let mimeType = String(source.mimeType || source.contentType || '').trim().toLowerCase();
        const kind = normalizeAssetUploadKind(source.kind || source.assetKind || source.scopeKind || '');
        let base64Data = base64Raw;

        if (dataUrl) {
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
            if (!match) {
                throw new Error('Formato dataUrl invalido.');
            }
            mimeType = String(match[1] || mimeType || '').trim().toLowerCase();
            base64Data = String(match[2] || '').trim();
        }

        const allowedMimes = kind === 'quick_reply'
            ? (options.allowedQuickReplyMimes || adminAssetAllowedMimeTypesQuickReply)
            : adminAssetAllowedMimeTypesImage;
        const fallbackQuickReplyMaxBytes = Math.max(500 * 1024, Number(options.fallbackQuickReplyMaxBytes || adminAssetQuickReplyMaxBytes || 8 * 1024 * 1024));
        const configuredQuickReplyMaxBytes = Math.max(500 * 1024, Number(options.maxQuickReplyBytes || fallbackQuickReplyMaxBytes || 8 * 1024 * 1024));
        const maxBytes = kind === 'quick_reply'
            ? configuredQuickReplyMaxBytes
            : adminAssetUploadMaxBytes;

        if (!allowedMimes.has(mimeType)) {
            if (kind === 'quick_reply') {
                throw new Error('Formato no permitido para respuestas rapidas.');
            }
            throw new Error('Formato de imagen no permitido. Usa JPG, PNG o WEBP.');
        }

        let buffer;
        try {
            buffer = Buffer.from(base64Data, 'base64');
        } catch (_) {
            throw new Error('El archivo no es base64 valido.');
        }

        if (!buffer || !buffer.length) {
            throw new Error('El archivo esta vacio.');
        }

        if (buffer.length > maxBytes) {
            throw new Error('El archivo supera el tamano permitido.');
        }

        return {
            kind,
            mimeType,
            buffer,
            fileName: String(source.fileName || source.filename || '').trim() || 'archivo'
        };
    }

    async function saveAssetFile({ tenantId = 'default', scope = 'general', mimeType = 'image/png', fileName = 'archivo', buffer = Buffer.alloc(0) } = {}) {
        const cleanTenant = sanitizeStorageSegment(tenantId, 'default');
        const cleanScope = sanitizeStorageSegment(scope, 'general');
        const ext = normalizeAssetExtension(fileName, mimeType);
        const now = new Date();
        const yyyy = String(now.getUTCFullYear());
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(now.getUTCDate()).padStart(2, '0');
        const baseName = sanitizeStorageSegment(path.parse(fileName).name || 'archivo', 'archivo').slice(0, 32);
        const suffix = crypto.randomBytes(5).toString('hex');
        const outName = baseName + '_' + suffix + '.' + ext;

        const relativeParts = ['saas-assets', cleanTenant, cleanScope, yyyy, mm, dd, outName];
        const relativePath = relativeParts.join('/');
        const absolutePath = path.join(uploadsRoot, ...relativeParts);

        await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.promises.writeFile(absolutePath, buffer);

        return {
            relativePath,
            relativeUrl: '/uploads/' + relativePath,
            absolutePath
        };
    }

    function resolveTenantQuickReplyAssetLimits(tenantId = 'default') {
        const tenant = tenantService.findTenantById(tenantId) || tenantService.DEFAULT_TENANT || { plan: 'starter' };
        const limits = planLimitsService.getTenantPlanLimits(tenant) || {};
        const fallbackUploadMb = Math.max(1, Math.floor((adminAssetQuickReplyMaxBytes || (8 * 1024 * 1024)) / (1024 * 1024)));
        const maxUploadMb = Math.max(1, Math.min(1024, Number(limits.quickReplyMaxUploadMb || fallbackUploadMb) || fallbackUploadMb));
        const storageQuotaMbRaw = Number(limits.quickReplyStorageQuotaMb || 0);
        const storageQuotaMb = Number.isFinite(storageQuotaMbRaw) ? Math.max(0, Math.floor(storageQuotaMbRaw)) : 0;
        return {
            maxUploadMb,
            maxUploadBytes: Math.max(500 * 1024, Math.floor(maxUploadMb * 1024 * 1024)),
            storageQuotaMb,
            storageQuotaBytes: storageQuotaMb > 0 ? Math.floor(storageQuotaMb * 1024 * 1024) : 0
        };
    }

    async function estimateDirectorySizeBytes(dirPath = '') {
        const cleanDirPath = String(dirPath || '').trim();
        if (!cleanDirPath) return 0;
        let entries = [];
        try {
            entries = await fs.promises.readdir(cleanDirPath, { withFileTypes: true });
        } catch (_) {
            return 0;
        }
        let total = 0;
        for (const entry of entries) {
            if (!entry) continue;
            const absolute = path.join(cleanDirPath, entry.name);
            if (entry.isDirectory()) {
                total += await estimateDirectorySizeBytes(absolute);
                continue;
            }
            if (!entry.isFile()) continue;
            try {
                const stats = await fs.promises.stat(absolute);
                total += Number(stats?.size || 0) || 0;
            } catch (_) {
                // ignore unreadable file and continue
            }
        }
        return total;
    }

    return {
        uploadsRoot,
        adminAssetQuickReplyMaxBytes,
        normalizeAssetUploadKind,
        sanitizeStorageSegment,
        resolveTenantQuickReplyAssetLimits,
        parseAssetUploadPayload,
        estimateDirectorySizeBytes,
        saveAssetFile,
        getRequestOrigin
    };
}

module.exports = {
    createTenantAssetUploadHelpers
};
