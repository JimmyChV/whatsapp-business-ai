const { getStorageDriver, queryPostgres } = require('../../../config/persistence-runtime');

function toBool(value, fallback = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(fallback);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoSafe(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
}

function isExpiredByHours(isoDate = '', thresholdHours = 48, nowMs = Date.now()) {
    const ts = Date.parse(String(isoDate || '').trim());
    if (!Number.isFinite(ts)) return false;
    const thresholdMs = Math.max(1, Number(thresholdHours || 48)) * 60 * 60 * 1000;
    return ts <= (nowMs - thresholdMs);
}

function getInactiveHours(isoDate = '', nowMs = Date.now()) {
    const ts = Date.parse(String(isoDate || '').trim());
    if (!Number.isFinite(ts)) return 0;
    return Math.max(0, (nowMs - ts) / (60 * 60 * 1000));
}

function createChatAssignmentInactivityJob({
    conversationOpsService,
    tenantService,
    logger,
    opsTelemetry
} = {}) {
    const enabled = toBool(process.env.CHAT_ASSIGNMENT_INACTIVITY_ENABLED, true);
    const thresholdHours = Math.max(1, Math.floor(toNumber(process.env.CHAT_ASSIGNMENT_INACTIVITY_THRESHOLD_HOURS, 48)));
    const releaseThresholdHours = Math.max(
        thresholdHours + 1,
        Math.floor(toNumber(process.env.CHAT_ASSIGNMENT_RELEASE_THRESHOLD_HOURS, 72))
    );
    const intervalMs = Math.max(30_000, Math.floor(toNumber(process.env.CHAT_ASSIGNMENT_INACTIVITY_INTERVAL_MS, 300_000)));
    const batchSize = Math.max(1, Math.floor(toNumber(process.env.CHAT_ASSIGNMENT_INACTIVITY_BATCH_SIZE, 500)));
    const storageDriver = String(getStorageDriver() || 'file').trim().toLowerCase();

    let timer = null;
    let running = false;

    async function runTenantPostgres(tenantId = '', tickAt = '') {
        const { rows } = await queryPostgres(
            `SELECT chat_id, scope_module_id, status, COALESCE(last_activity_at, updated_at) AS last_activity_at
               FROM tenant_chat_assignments
              WHERE tenant_id = $1
                AND status IN ('active', 'en_espera')
                AND assignee_user_id IS NOT NULL
                AND COALESCE(last_activity_at, updated_at) <= NOW() - ($2::int * INTERVAL '1 hour')
              ORDER BY COALESCE(last_activity_at, updated_at) ASC
              LIMIT $3`,
            [tenantId, thresholdHours, batchSize]
        );

        const candidates = Array.isArray(rows) ? rows : [];
        let transitioned = 0;
        let released = 0;
        const nowMs = Date.parse(tickAt) || Date.now();

        for (const row of candidates) {
            const inactiveHours = getInactiveHours(row?.last_activity_at, nowMs);
            const status = String(row?.status || '').trim();
            if (inactiveHours >= releaseThresholdHours) {
                const result = await conversationOpsService.clearChatAssignment(tenantId, {
                    chatId: String(row?.chat_id || '').trim(),
                    scopeModuleId: String(row?.scope_module_id || '').trim().toLowerCase(),
                    assignmentMode: 'auto',
                    assignmentReason: 'inactivity_release',
                    at: tickAt,
                    metadata: {
                        trigger: 'inactivity_job',
                        thresholdHours,
                        releaseThresholdHours
                    }
                });
                if (result?.changed) {
                    transitioned += 1;
                    released += 1;
                }
                continue;
            }
            if (status !== 'active' || inactiveHours < thresholdHours) continue;
            const result = await conversationOpsService.markChatAssignmentWaiting(tenantId, {
                chatId: String(row?.chat_id || '').trim(),
                scopeModuleId: String(row?.scope_module_id || '').trim().toLowerCase(),
                reason: `inactive_${thresholdHours}h`,
                at: tickAt,
                metadata: {
                    trigger: 'inactivity_job',
                    thresholdHours
                }
            });
            if (result?.changed) transitioned += 1;
        }

        return { scanned: candidates.length, transitioned, released };
    }

    async function runTenantFile(tenantId = '', tickAt = '') {
        const nowMs = Date.parse(tickAt) || Date.now();
        const [activeAssignments, waitingAssignments] = await Promise.all([
            conversationOpsService.listChatAssignments(tenantId, {
                status: 'active',
                limit: 500,
                offset: 0
            }),
            conversationOpsService.listChatAssignments(tenantId, {
                status: 'en_espera',
                limit: 500,
                offset: 0
            })
        ]);
        const items = [
            ...(Array.isArray(activeAssignments?.items) ? activeAssignments.items : []),
            ...(Array.isArray(waitingAssignments?.items) ? waitingAssignments.items : [])
        ].slice(0, batchSize);
        let transitioned = 0;
        let released = 0;

        for (const item of items) {
            const assigneeUserId = String(item?.assigneeUserId || '').trim();
            if (!assigneeUserId) continue;
            const lastActivityAt = String(item?.lastActivityAt || item?.updatedAt || '').trim();
            if (!isExpiredByHours(lastActivityAt, thresholdHours, nowMs)) continue;
            const inactiveHours = getInactiveHours(lastActivityAt, nowMs);

            if (inactiveHours >= releaseThresholdHours) {
                const result = await conversationOpsService.clearChatAssignment(tenantId, {
                    chatId: String(item?.chatId || '').trim(),
                    scopeModuleId: String(item?.scopeModuleId || '').trim().toLowerCase(),
                    assignmentMode: 'auto',
                    assignmentReason: 'inactivity_release',
                    at: tickAt,
                    metadata: {
                        trigger: 'inactivity_job',
                        thresholdHours,
                        releaseThresholdHours
                    }
                });
                if (result?.changed) {
                    transitioned += 1;
                    released += 1;
                }
                continue;
            }
            if (String(item?.status || '').trim() !== 'active') continue;

            const result = await conversationOpsService.markChatAssignmentWaiting(tenantId, {
                chatId: String(item?.chatId || '').trim(),
                scopeModuleId: String(item?.scopeModuleId || '').trim().toLowerCase(),
                reason: `inactive_${thresholdHours}h`,
                at: tickAt,
                metadata: {
                    trigger: 'inactivity_job',
                    thresholdHours
                }
            });
            if (result?.changed) transitioned += 1;
        }

        return { scanned: items.length, transitioned, released };
    }

    async function runNow() {
        if (!enabled) return { ok: true, skipped: true, reason: 'disabled' };
        if (running) return { ok: true, skipped: true, reason: 'already_running' };
        running = true;

        const tickAt = toIsoSafe(new Date()) || new Date().toISOString();
        try {
            const tenants = (typeof tenantService?.getTenants === 'function' ? tenantService.getTenants() : [])
                .filter((tenant) => tenant?.active !== false)
                .map((tenant) => String(tenant?.id || '').trim())
                .filter((tenantId) => tenantId && tenantId !== 'default');

            let scanned = 0;
            let transitioned = 0;
            let released = 0;

            for (const tenantId of tenants) {
                const result = storageDriver === 'postgres'
                    ? await runTenantPostgres(tenantId, tickAt)
                    : await runTenantFile(tenantId, tickAt);
                scanned += Number(result?.scanned || 0);
                transitioned += Number(result?.transitioned || 0);
                released += Number(result?.released || 0);
            }

            if (transitioned > 0) {
                logger?.info?.(
                    `[Ops][AssignmentInactivityJob] transitioned=${transitioned} released=${released} scanned=${scanned} thresholdHours=${thresholdHours} releaseThresholdHours=${releaseThresholdHours}`
                );
            }

            return { ok: true, scanned, transitioned, released, thresholdHours, releaseThresholdHours };
        } catch (error) {
            opsTelemetry?.recordInternalError?.('chat_assignment_inactivity_job', error);
            logger?.warn?.('[Ops][AssignmentInactivityJob] run failed: ' + String(error?.message || error));
            return { ok: false, error: String(error?.message || error) };
        } finally {
            running = false;
        }
    }

    function start() {
        if (!enabled) {
            logger?.info?.('[Ops][AssignmentInactivityJob] disabled.');
            return;
        }
        if (timer) return;
        timer = setInterval(() => {
            runNow().catch(() => { });
        }, intervalMs);
        if (typeof timer?.unref === 'function') timer.unref();
        runNow().catch(() => { });
        logger?.info?.(
            `[Ops][AssignmentInactivityJob] started intervalMs=${intervalMs} thresholdHours=${thresholdHours} releaseThresholdHours=${releaseThresholdHours} batchSize=${batchSize}`
        );
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
    createChatAssignmentInactivityJob
};

