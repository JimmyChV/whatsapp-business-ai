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

function createQuoteExpiryJob({
    tenantService,
    logger,
    opsTelemetry
} = {}) {
    const enabled = toBool(process.env.QUOTE_EXPIRY_ENABLED, true);
    const expiryHours = Math.max(1, Math.floor(toNumber(process.env.QUOTE_EXPIRY_HOURS, 72)));
    const intervalMs = Math.max(60_000, Math.floor(toNumber(process.env.QUOTE_EXPIRY_INTERVAL_MS, 3_600_000)));
    const batchSize = Math.max(1, Math.floor(toNumber(process.env.QUOTE_EXPIRY_BATCH_SIZE, 100)));
    const storageDriver = String(getStorageDriver() || 'file').trim().toLowerCase();

    let timer = null;
    let running = false;

    async function runTenantPostgres(tenantId = '', tickAt = '') {
        const { rows } = await queryPostgres(
            `SELECT
                q.quote_id,
                q.chat_id AS quote_chat_id,
                q.scope_module_id,
                q.message_id,
                tm.chat_id AS message_chat_id
               FROM tenant_quotes q
               LEFT JOIN tenant_messages tm
                 ON tm.tenant_id = q.tenant_id
                AND tm.message_id = q.message_id
              WHERE q.tenant_id = $1
                AND q.status = 'sent'
                AND q.sent_at IS NOT NULL
                AND q.sent_at <= NOW() - ($2::int * INTERVAL '1 hour')
              ORDER BY q.sent_at ASC
              LIMIT $3`,
            [tenantId, expiryHours, batchSize]
        );

        const candidates = Array.isArray(rows) ? rows : [];
        let expired = 0;
        let statusUpdated = 0;

        for (const row of candidates) {
            const quoteId = String(row?.quote_id || '').trim();
            if (!quoteId) continue;

            const updateQuote = await queryPostgres(
                `UPDATE tenant_quotes
                    SET status = 'expired',
                        updated_at = NOW()
                  WHERE tenant_id = $1
                    AND quote_id = $2
                    AND status = 'sent'
                    AND sent_at IS NOT NULL
                    AND sent_at <= NOW() - ($3::int * INTERVAL '1 hour')
                  RETURNING quote_id`,
                [tenantId, quoteId, expiryHours]
            );
            if (!updateQuote?.rows?.length) continue;
            expired += 1;

            const chatId = String(row?.message_chat_id || row?.quote_chat_id || '').trim();
            const scopeModuleId = String(row?.scope_module_id || '').trim().toLowerCase();
            if (!chatId) continue;

            const updateStatus = await queryPostgres(
                `UPDATE tenant_chat_commercial_status
                    SET status = 'expirado',
                        source = 'automation',
                        reason = 'quote_expired_${expiryHours}h',
                        last_transition_at = $4::timestamptz,
                        metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
                        updated_at = NOW()
                  WHERE tenant_id = $1
                    AND chat_id = $2
                    AND scope_module_id = $3
                    AND status = 'cotizado'
                  RETURNING chat_id`,
                [
                    tenantId,
                    chatId,
                    scopeModuleId,
                    tickAt,
                    JSON.stringify({
                        trigger: 'quote_expiry_job',
                        quoteId,
                        expiryHours
                    })
                ]
            );
            if (updateStatus?.rows?.length) statusUpdated += 1;
        }

        return { scanned: candidates.length, expired, statusUpdated };
    }

    async function runTenantFile() {
        return { scanned: 0, expired: 0, statusUpdated: 0, skipped: true, reason: 'file_driver_not_supported' };
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
                .filter(Boolean);

            let scanned = 0;
            let expired = 0;
            let statusUpdated = 0;

            for (const tenantId of tenants) {
                const result = storageDriver === 'postgres'
                    ? await runTenantPostgres(tenantId, tickAt)
                    : await runTenantFile(tenantId, tickAt);
                scanned += Number(result?.scanned || 0);
                expired += Number(result?.expired || 0);
                statusUpdated += Number(result?.statusUpdated || 0);
            }

            if (expired > 0) {
                logger?.info?.(
                    `[Ops][QuoteExpiryJob] expired=${expired} statusUpdated=${statusUpdated} scanned=${scanned} expiryHours=${expiryHours}`
                );
            }

            return { ok: true, scanned, expired, statusUpdated, expiryHours };
        } catch (error) {
            opsTelemetry?.recordInternalError?.('quote_expiry_job', error);
            logger?.warn?.('[Ops][QuoteExpiryJob] run failed: ' + String(error?.message || error));
            return { ok: false, error: String(error?.message || error) };
        } finally {
            running = false;
        }
    }

    function start() {
        if (!enabled) {
            logger?.info?.('[Ops][QuoteExpiryJob] disabled.');
            return;
        }
        if (timer) return;
        timer = setInterval(() => {
            runNow().catch(() => { });
        }, intervalMs);
        if (typeof timer?.unref === 'function') timer.unref();
        runNow().catch(() => { });
        logger?.info?.(`[Ops][QuoteExpiryJob] started intervalMs=${intervalMs} expiryHours=${expiryHours} batchSize=${batchSize}`);
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
    createQuoteExpiryJob
};
