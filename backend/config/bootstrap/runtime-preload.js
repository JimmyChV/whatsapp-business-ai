function preloadRuntimeServices({
    saasControlService,
    planLimitsStoreService,
    accessPolicyService,
    logger
}) {
    saasControlService.ensureLoaded().catch((error) => {
        logger.warn('[SaaS] no se pudo precargar control plane: ' + String(error?.message || error));
    });

    planLimitsStoreService.initializePlanLimits().catch((error) => {
        logger.warn('[SaaS] no se pudo precargar limites de plan: ' + String(error?.message || error));
    });

    accessPolicyService.initializeAccessPolicy().catch((error) => {
        logger.warn('[SaaS] no se pudo precargar catalogo de accesos: ' + String(error?.message || error));
    });
}

module.exports = {
    preloadRuntimeServices
};
