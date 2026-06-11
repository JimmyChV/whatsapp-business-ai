const catalogSyncService = require('../../domains/tenant/services/catalog-sync.service');
const metaAdsSyncService = require('../../domains/tenant/services/meta-ads-sync.service');

async function timedPreloadTask(label, task) {
    const timerLabel = `[perf][preload] ${label}`;
    console.time(timerLabel);
    try {
        return await task();
    } finally {
        console.timeEnd(timerLabel);
    }
}

function startTimedBackgroundTask(label, task, logger, warnPrefix) {
    const timerLabel = `[perf][preload] ${label}`;
    console.time(timerLabel);
    Promise.resolve()
        .then(task)
        .then((result) => {
            console.log(`[perf][preload] ${label} result=${JSON.stringify(result || {})}`);
        })
        .catch((error) => {
            logger.warn(`${warnPrefix}: ${String(error?.message || error)}`);
        })
        .finally(() => {
            console.timeEnd(timerLabel);
        });
}

async function preloadRuntimeServices({
    saasControlService,
    planLimitsStoreService,
    accessPolicyService,
    customerService,
    logger
}) {
    const tasks = [
        Promise.resolve()
            .then(() => timedPreloadTask('saasControl.ensureLoaded', () => saasControlService.ensureLoaded()))
            .catch((error) => {
                logger.warn('[SaaS] no se pudo precargar control plane: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => timedPreloadTask('planLimits.initializePlanLimits', () => planLimitsStoreService.initializePlanLimits()))
            .catch((error) => {
                logger.warn('[SaaS] no se pudo precargar limites de plan: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => timedPreloadTask('accessPolicy.initializeAccessPolicy', () => accessPolicyService.initializeAccessPolicy()))
            .catch((error) => {
                logger.warn('[SaaS] no se pudo precargar catalogo de accesos: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => {
                startTimedBackgroundTask(
                    'catalogSync.warmupAllCatalogs',
                    () => catalogSyncService.warmupAllCatalogs(),
                    logger,
                    '[CatalogSync] no se pudo precargar catalogos WooCommerce'
                );
            })
            .catch((error) => {
                logger.warn('[CatalogSync] no se pudo precargar catalogos WooCommerce: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => {
                startTimedBackgroundTask(
                    'metaAds.startDailySync',
                    () => metaAdsSyncService.startDailySync(),
                    logger,
                    '[MetaAdsSync] no se pudo programar sync diario'
                );
            })
            .catch((error) => {
                logger.warn('[MetaAdsSync] no se pudo programar sync diario: ' + String(error?.message || error));
            }),
        Promise.resolve()
            .then(() => {
                startTimedBackgroundTask(
                    'metaAds.backfillConfiguredTenantsCurrentYear',
                    () => metaAdsSyncService.backfillConfiguredTenantsCurrentYear(),
                    logger,
                    '[MetaAdsSync] no se pudo iniciar backfill historico del ano actual'
                );
            })
            .catch((error) => {
                logger.warn('[MetaAdsSync] no se pudo iniciar backfill historico del ano actual: ' + String(error?.message || error));
            })
    ];

    await Promise.all(tasks);
}

module.exports = {
    preloadRuntimeServices
};
