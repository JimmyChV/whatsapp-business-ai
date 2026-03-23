function createServerLifecycleHandlers({
    waClient,
    opsTelemetry,
    logger,
    server,
    waInitRestartDelayMs = 12000,
    shutdownForceTimeoutMs = 10000
} = {}) {
    const scheduleWaInitialize = (delayMs = 0) => {
        const safeDelay = Math.max(0, Number(delayMs) || 0);
        setTimeout(() => {
            waClient.initialize().catch((error) => {
                const retryDelay = Math.max(2000, Number(waInitRestartDelayMs || 12000));
                opsTelemetry.recordInternalError('wa_initialize', error);
                logger.error(`[WA] initialize bootstrap error: ${String(error?.message || error)}`);
                logger.warn(`[WA] retrying initialize in ${retryDelay}ms...`);
                scheduleWaInitialize(retryDelay);
            });
        }, safeDelay);
    };

    function registerProcessHandlers() {
        process.on('uncaughtException', (error) => {
            opsTelemetry.recordInternalError('uncaught_exception', error);
            logger.error('[Process] uncaught exception: ' + String(error?.stack || error?.message || error));
        });

        process.on('unhandledRejection', (reason) => {
            opsTelemetry.recordInternalError('unhandled_rejection', reason);
            logger.error('[Process] unhandled rejection: ' + String(reason?.stack || reason?.message || reason));
        });

        const graceful = async (signal) => {
            logger.warn('[Process] graceful shutdown requested by ' + signal);
            try {
                if (typeof waClient.setTransportMode === 'function') {
                    await waClient.setTransportMode('idle');
                }
            } catch (error) {
                logger.warn('[Process] failed to stop WA transport: ' + String(error?.message || error));
            }

            server.close(() => {
                logger.info('[Process] HTTP server closed.');
                process.exit(0);
            });

            setTimeout(() => {
                logger.warn('[Process] forced shutdown timeout reached.');
                process.exit(1);
            }, Number(shutdownForceTimeoutMs || 10000)).unref();
        };

        process.on('SIGTERM', () => graceful('SIGTERM'));
        process.on('SIGINT', () => graceful('SIGINT'));
    }

    return {
        scheduleWaInitialize,
        registerProcessHandlers
    };
}

module.exports = {
    createServerLifecycleHandlers
};
