async function preloadRuntimeServices({
    saasControlService,
    planLimitsStoreService,
    accessPolicyService,
    customerService,
    logger
}) {
    const tasks = [
        Promise.resolve()
            .then(() => saasControlService.ensureLoaded())
            .catch((error) => {
                logger.warn('[SaaS] no se pudo precargar control plane: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => planLimitsStoreService.initializePlanLimits())
            .catch((error) => {
                logger.warn('[SaaS] no se pudo precargar limites de plan: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => accessPolicyService.initializeAccessPolicy())
            .catch((error) => {
                logger.warn('[SaaS] no se pudo precargar catalogo de accesos: ' + String(error?.message || error));
            })
    ];

    if (customerService && typeof customerService.ensurePostgresSchema === 'function') {
        tasks.push(
            Promise.resolve()
                .then(() => customerService.ensurePostgresSchema())
                .catch((error) => {
                    logger.warn('[Customers] no se pudo precargar esquema Postgres: ' + String(error?.message || error));
                })
        );
    }

    await Promise.all(tasks);
}

module.exports = {
    preloadRuntimeServices
};
