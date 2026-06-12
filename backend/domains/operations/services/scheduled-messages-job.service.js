function createScheduledMessagesJob({
    scheduledMessagesService,
    waClient,
    logger,
    intervalMs = 60_000,
    initialDelayMs = 90_000
} = {}) {
    let timer = null;
    let initialTimer = null;
    let running = false;

    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await scheduledMessagesService?.processPendingMessages?.({
                waClient,
                logger
            });
        } catch (error) {
            logger?.warn?.('[ScheduledMessagesJob] failed: ' + String(error?.message || error));
        } finally {
            running = false;
        }
    };

    return {
        start() {
            if (timer || initialTimer) return;
            const startInterval = () => {
                initialTimer = null;
                tick();
                timer = setInterval(tick, Math.max(10_000, Number(intervalMs) || 60_000));
                if (typeof timer?.unref === 'function') timer.unref();
            };
            initialTimer = setTimeout(startInterval, Math.max(0, Number(initialDelayMs) || 90_000));
            if (typeof initialTimer?.unref === 'function') initialTimer.unref();
        },
        runOnce() {
            return tick();
        },
        stop() {
            if (initialTimer) {
                clearTimeout(initialTimer);
                initialTimer = null;
            }
            if (!timer) return;
            clearInterval(timer);
            timer = null;
        }
    };
}

module.exports = {
    createScheduledMessagesJob
};
