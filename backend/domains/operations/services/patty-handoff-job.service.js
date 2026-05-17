function toBool(value, fallback = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(fallback);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function createPattyHandoffJob({
    chatCommercialStatusService,
    tenantService,
    logger,
    opsTelemetry,
    emitToTenant
} = {}) {
    const enabled = toBool(process.env.PATTY_HANDOFF_JOB_ENABLED, true);
    const intervalMs = Math.max(30_000, Math.floor(toNumber(process.env.PATTY_HANDOFF_INTERVAL_MS, 120_000)));
    const batchSize = Math.max(1, Math.floor(toNumber(process.env.PATTY_HANDOFF_BATCH_SIZE, 100)));
    let timer = null;
    let running = false;

    async function runNow() {
        if (!enabled) return { ok: true, skipped: true, reason: 'disabled' };
        if (running) return { ok: true, skipped: true, reason: 'already_running' };
        running = true;

        try {
            const tenants = (typeof tenantService?.getTenants === 'function' ? tenantService.getTenants() : [])
                .filter((tenant) => tenant?.active !== false)
                .map((tenant) => String(tenant?.id || '').trim())
                .filter(Boolean);

            let resumed = 0;

            for (const tenantId of tenants) {
                const result = typeof chatCommercialStatusService?.resumeExpiredPattyReviewModes === 'function'
                    ? await chatCommercialStatusService.resumeExpiredPattyReviewModes(tenantId, { limit: batchSize })
                    : { items: [] };
                const items = Array.isArray(result?.items) ? result.items : [];
                resumed += items.length;
                for (const item of items) {
                    if (typeof emitToTenant === 'function') {
                        emitToTenant(tenantId, 'patty_resumed', {
                            tenantId,
                            chatId: String(item?.chatId || '').trim(),
                            scopeModuleId: String(item?.scopeModuleId || '').trim().toLowerCase(),
                            reason: 'asesor_inactivo',
                            generatedAt: new Date().toISOString()
                        });
                    }
                    logger?.info?.(`[Patty] resumed autonomous: asesor inactive tenantId=${tenantId} chatId=${item?.chatId || ''}`);
                }
            }

            return { ok: true, resumed };
        } catch (error) {
            opsTelemetry?.recordInternalError?.('patty_handoff_job', error);
            logger?.warn?.('[Patty][HandoffJob] run failed: ' + String(error?.message || error));
            return { ok: false, error: String(error?.message || error) };
        } finally {
            running = false;
        }
    }

    function start() {
        if (!enabled) {
            logger?.info?.('[Patty][HandoffJob] disabled.');
            return;
        }
        if (timer) return;
        timer = setInterval(() => {
            runNow().catch(() => { });
        }, intervalMs);
        if (typeof timer?.unref === 'function') timer.unref();
        runNow().catch(() => { });
        logger?.info?.(`[Patty][HandoffJob] started intervalMs=${intervalMs} batchSize=${batchSize}`);
    }

    function stop() {
        if (!timer) return;
        clearInterval(timer);
        timer = null;
    }

    return {
        start,
        stop,
        runNow
    };
}

module.exports = {
    createPattyHandoffJob
};
