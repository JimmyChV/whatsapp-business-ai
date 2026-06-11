const catalogSyncService = require('../../domains/tenant/services/catalog-sync.service');
const metaAdsSyncService = require('../../domains/tenant/services/meta-ads-sync.service');

async function preloadRuntimeServices({
    saasControlService,
    planLimitsStoreService,
    accessPolicyService,
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

    await Promise.all(tasks);
}

async function runHeavyWarmups({ logger } = {}) {
    const tasks = [
        Promise.resolve()
            .then(() => catalogSyncService.warmupAllCatalogs())
            .catch((error) => {
                logger?.warn('[CatalogSync] warmup failed: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => metaAdsSyncService.startDailySync())
            .catch((error) => {
                logger?.warn('[MetaAdsSync] daily sync failed: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => metaAdsSyncService.backfillConfiguredTenantsCurrentYear())
            .catch((error) => {
                logger?.warn('[MetaAdsSync] backfill failed: ' + String(error?.message || error));
            })
    ];

    await Promise.all(tasks);
}

module.exports = {
    preloadRuntimeServices,
    runHeavyWarmups
};
