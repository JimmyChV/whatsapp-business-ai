function registerTenantAssetsUploadHttpRoutes({
    app,
    accessPolicyService,
    hasPermission,
    isTenantAllowedForUser,
    normalizeAssetUploadKind,
    sanitizeStorageSegment,
    resolveTenantQuickReplyAssetLimits,
    parseAssetUploadPayload,
    adminAssetQuickReplyMaxBytes,
    estimateDirectorySizeBytes,
    uploadsRoot,
    path,
    saveAssetFile,
    getRequestOrigin
}) {
    if (!app) throw new Error('registerTenantAssetsUploadHttpRoutes requiere app.');

    app.post('/api/admin/saas/assets/upload', async (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const uploadKind = normalizeAssetUploadKind(body.kind || body.assetKind || body.scopeKind || '');
            const canUploadGenericAssets = hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_ASSETS_UPLOAD);
            const canManageQuickReplies = hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_QUICK_REPLIES_MANAGE);
            const canUploadQuickReplyAssets = uploadKind === 'quick_reply' && canManageQuickReplies;
            if (!canUploadGenericAssets && !canUploadQuickReplyAssets) {
                return res.status(403).json({ ok: false, error: 'No autorizado para subir archivos.' });
            }
            const requestedTenantId = String(body.tenantId || req?.tenantContext?.id || 'default').trim() || 'default';
            const tenantId = sanitizeStorageSegment(requestedTenantId, 'default');

            if (!req?.authContext?.user?.isSuperAdmin && !isTenantAllowedForUser(req, requestedTenantId)) {
                return res.status(403).json({ ok: false, error: 'No tienes acceso a ese tenant para subir archivos.' });
            }

            const quickReplyAssetLimits = uploadKind === 'quick_reply'
                ? resolveTenantQuickReplyAssetLimits(requestedTenantId)
                : null;
            const scope = sanitizeStorageSegment(body.scope || 'general', 'general');
            const parsed = parseAssetUploadPayload(body, {
                maxQuickReplyBytes: quickReplyAssetLimits?.maxUploadBytes,
                fallbackQuickReplyMaxBytes: adminAssetQuickReplyMaxBytes
            });

            if (parsed.kind === 'quick_reply' && quickReplyAssetLimits?.storageQuotaBytes > 0) {
                const tenantAssetsRoot = path.join(uploadsRoot, 'saas-assets', tenantId);
                const usedBytes = await estimateDirectorySizeBytes(tenantAssetsRoot);
                const incomingBytes = Number(parsed?.buffer?.length || 0) || 0;
                if ((usedBytes + incomingBytes) > quickReplyAssetLimits.storageQuotaBytes) {
                    throw new Error('El tenant supero la cuota de almacenamiento para respuestas rapidas.' +
                        ` (plan: ${quickReplyAssetLimits.storageQuotaMb} MB).`);
                }
            }

            const stored = await saveAssetFile({
                tenantId,
                scope,
                mimeType: parsed.mimeType,
                fileName: parsed.fileName,
                buffer: parsed.buffer
            });

            const origin = getRequestOrigin(req);
            const publicUrl = origin ? origin + stored.relativeUrl : stored.relativeUrl;

            return res.status(201).json({
                ok: true,
                tenantId,
                scope,
                limits: parsed.kind === 'quick_reply' && quickReplyAssetLimits
                    ? {
                        maxUploadMb: quickReplyAssetLimits.maxUploadMb,
                        storageQuotaMb: quickReplyAssetLimits.storageQuotaMb
                    }
                    : undefined,
                file: {
                    url: publicUrl,
                    relativeUrl: stored.relativeUrl,
                    relativePath: stored.relativePath,
                    mimeType: parsed.mimeType,
                    sizeBytes: Number(parsed.buffer?.length || 0) || 0,
                    fileName: path.basename(stored.absolutePath),
                    kind: parsed.kind
                }
            });
        } catch (error) {
            const message = String(error?.message || 'No se pudo subir el archivo.');
            const status = /tamano|base64|imagen|archivo|formato/i.test(message) ? 400 : 500;
            return res.status(status).json({ ok: false, error: message });
        }
    });
}

module.exports = {
    registerTenantAssetsUploadHttpRoutes
};

