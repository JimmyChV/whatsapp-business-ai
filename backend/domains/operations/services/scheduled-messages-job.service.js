function createScheduledMessagesJob({
    scheduledMessagesService,
    waClient,
    logger,
    intervalMs = 60_000
} = {}) {
    let timer = null;
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
            if (timer) return;
            tick();
            timer = setInterval(tick, Math.max(10_000, Number(intervalMs) || 60_000));
            if (typeof timer?.unref === 'function') timer.unref();
        },
        stop() {
            if (!timer) return;
            clearInterval(timer);
            timer = null;
        }
    };
}

module.exports = {
    createScheduledMessagesJob
};
