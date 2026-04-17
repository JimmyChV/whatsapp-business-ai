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

function toText(value = '') {
    return String(value ?? '').trim();
}

function toIsoSafe(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
}

function parseCodeSet(value = '', fallback = []) {
    const source = String(value || '').trim();
    const base = source
        ? source.split(',').map((entry) => Number(String(entry || '').trim())).filter((entry) => Number.isFinite(entry))
        : fallback;
    return new Set(base);
}

function sleep(ms = 0) {
    const safe = Math.max(0, Number(ms) || 0);
    if (!safe) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, safe));
}

function normalizeTemplateComponents(variables = {}) {
    if (Array.isArray(variables?.components)) {
        return variables.components;
    }
    if (Array.isArray(variables?.parameters)) {
        return [{ type: 'body', parameters: variables.parameters }];
    }
    if (Array.isArray(variables?.bodyVariables)) {
        return [{
            type: 'body',
            parameters: variables.bodyVariables.map((entry) => ({ type: 'text', text: String(entry ?? '') }))
        }];
    }
    if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
        const keys = Object.keys(variables)
            .filter((key) => !['components', 'parameters', 'bodyVariables', 'language', 'languageCode'].includes(key))
            .sort();
        if (keys.length) {
            return [{
                type: 'body',
                parameters: keys.map((key) => ({ type: 'text', text: String(variables[key] ?? '') }))
            }];
        }
    }
    return [];
}

function resolveTemplateLanguage(job = {}) {
    const vars = job?.variablesJson && typeof job.variablesJson === 'object' ? job.variablesJson : {};
    const fromVars = toText(vars.languageCode || vars.language || '');
    return fromVars || toText(job?.templateLanguage || 'es') || 'es';
}

function extractErrorCode(error = null) {
    if (!error) return null;
    const fromPayload = Number(error?.payload?.error?.code);
    if (Number.isFinite(fromPayload)) return fromPayload;
    const fromObject = Number(error?.code);
    if (Number.isFinite(fromObject)) return fromObject;
    return null;
}

function isLikelyPermanentError(code = null, permanentCodes = new Set()) {
    if (!Number.isFinite(Number(code))) return false;
    return permanentCodes.has(Number(code));
}

function buildRetryDelaySeconds(attemptCount = 0, baseSeconds = 30, maxSeconds = 900) {
    const safeAttempt = Math.max(0, Number(attemptCount) || 0);
    const next = Math.max(1, Math.floor(baseSeconds)) * Math.pow(2, safeAttempt);
    return Math.max(1, Math.min(Math.floor(maxSeconds), Math.floor(next)));
}

function createCampaignDispatcherJob({
    campaignQueueService,
    campaignsService,
    customerConsentService,
    tenantService,
    waModuleService,
    waClient,
    logger,
    opsTelemetry
} = {}) {
    const enabled = toBool(process.env.CAMPAIGN_DISPATCHER_ENABLED, true);
    const intervalMs = Math.max(5_000, Math.floor(toNumber(process.env.CAMPAIGN_DISPATCHER_INTERVAL_MS, 10_000)));
    const batchSize = Math.max(1, Math.floor(toNumber(process.env.CAMPAIGN_DISPATCHER_BATCH_SIZE, 50)));
    const workerId = toText(process.env.CAMPAIGN_DISPATCHER_WORKER_ID || 'campaign-dispatcher');
    const perModuleRpm = Math.max(1, Math.floor(toNumber(process.env.CAMPAIGN_DISPATCHER_PER_MODULE_RPM, 20)));
    const minIntervalPerModuleMs = Math.max(1, Math.ceil(60000 / perModuleRpm));
    const retryBaseSeconds = Math.max(1, Math.floor(toNumber(process.env.CAMPAIGN_DISPATCHER_RETRY_BASE_SECONDS, 30)));
    const retryMaxSeconds = Math.max(retryBaseSeconds, Math.floor(toNumber(process.env.CAMPAIGN_DISPATCHER_RETRY_MAX_SECONDS, 900)));
    const claimTtlSeconds = Math.max(30, Math.floor(toNumber(process.env.CAMPAIGN_DISPATCHER_CLAIM_TTL_SECONDS, 300)));
    const transientCodes = parseCodeSet(process.env.CAMPAIGN_DISPATCHER_TRANSIENT_CODES, [2, 4, 131000, 131016, 131048]);
    const permanentCodes = parseCodeSet(process.env.CAMPAIGN_DISPATCHER_PERMANENT_CODES, [131026, 131047, 131051]);
    const storageDriver = String(getStorageDriver() || 'file').trim().toLowerCase();

    const moduleNextAllowedAt = new Map();
    let timer = null;
    let running = false;

    async function syncCampaignRecipientFromQueue(tenantId = '', queueJob = null, { reason = '', actorType = 'worker', actorId = '' } = {}) {
        if (!queueJob || !toText(queueJob.idempotencyKey)) return;
        if (!campaignsService || typeof campaignsService.applyQueueJobUpdate !== 'function') return;
        try {
            await campaignsService.applyQueueJobUpdate(tenantId, {
                queueJob,
                reason,
                actorType,
                actorId
            });
        } catch (error) {
            opsTelemetry?.recordInternalError?.('campaign_dispatcher_sync_recipient', error);
            logger?.warn?.('[Ops][CampaignDispatcher] sync recipient failed tenant=' + tenantId + ': ' + String(error?.message || error));
        }
    }

    async function recoverStaleClaims(tenantId = '') {
        if (storageDriver !== 'postgres') return 0;
        if (!tenantId) return 0;
        try {
            const result = await queryPostgres(
                `UPDATE tenant_campaign_queue
                    SET status = 'pending',
                        claimed_at = NULL,
                        claimed_by = NULL,
                        updated_at = NOW()
                  WHERE tenant_id = $1
                    AND status = 'claimed'
                    AND claimed_at IS NOT NULL
                    AND claimed_at <= NOW() - ($2::int * INTERVAL '1 second')`,
                [tenantId, claimTtlSeconds]
            );
            return Number(result?.rowCount || 0) || 0;
        } catch (error) {
            opsTelemetry?.recordInternalError?.('campaign_dispatcher_recover', error);
            logger?.warn?.('[Ops][CampaignDispatcher] recover stale claims failed tenant=' + tenantId + ': ' + String(error?.message || error));
            return 0;
        }
    }

    async function enforceModulePacing(tenantId = '', moduleId = '') {
        const key = `${tenantId}::${moduleId}`;
        const now = Date.now();
        const nextAllowed = Number(moduleNextAllowedAt.get(key) || 0);
        if (nextAllowed > now) {
            await sleep(nextAllowed - now);
        }
        moduleNextAllowedAt.set(key, Date.now() + minIntervalPerModuleMs);
    }

    async function resolveModuleContext(tenantId = '', moduleId = '') {
        if (!moduleId) return null;
        const runtimeModule = await waModuleService.getModuleRuntime(tenantId, moduleId);
        if (!runtimeModule || runtimeModule.isActive === false) return null;
        if (String(runtimeModule.transportMode || '').trim().toLowerCase() !== 'cloud') return null;
        return runtimeModule;
    }

    async function ensureCloudTransportForModule(moduleContext = null) {
        if (!moduleContext) throw new Error('module_unavailable');
        const cloudConfig = {
            ...(waModuleService.resolveModuleCloudConfig(moduleContext) || {}),
            tenantId: String(moduleContext?.tenantId || '').trim() || null
        };
        waClient.setCloudRuntimeConfig(cloudConfig || {});
        const runtime = waClient.getRuntimeInfo?.() || {};
        if (String(runtime?.activeTransport || '').trim().toLowerCase() !== 'cloud') {
            await waClient.setTransportMode('cloud');
        }
        if (!waClient.isReady) {
            await waClient.initialize();
        }
    }

    async function hasConsent(tenantId = '', job = {}) {
        const customerId = toText(job?.recipientId || '');
        if (!customerId) return false;
        if (!customerConsentService || typeof customerConsentService.hasMarketingConsent !== 'function') return false;
        return Boolean(await customerConsentService.hasMarketingConsent(tenantId, { customerId }));
    }

    async function dispatchSingleJob(tenantId = '', job = {}) {
        const moduleId = toText(job?.moduleId || '');
        const idempotencyKey = toText(job?.idempotencyKey || '');
        if (!idempotencyKey) return { status: 'failed', reason: 'missing_idempotency_key' };

        const moduleContext = await resolveModuleContext(tenantId, moduleId);
        if (!moduleContext) {
            const skippedJob = await campaignQueueService.skipJob(tenantId, {
                idempotencyKey,
                reason: 'module_unavailable'
            });
            await syncCampaignRecipientFromQueue(tenantId, skippedJob, { reason: 'module_unavailable' });
            return { status: 'skipped', reason: 'module_unavailable' };
        }

        const consentGranted = await hasConsent(tenantId, job);
        if (!consentGranted) {
            const skippedJob = await campaignQueueService.skipJob(tenantId, {
                idempotencyKey,
                reason: 'consent_required'
            });
            await syncCampaignRecipientFromQueue(tenantId, skippedJob, { reason: 'consent_required' });
            return { status: 'skipped', reason: 'consent_required' };
        }

        await enforceModulePacing(tenantId, moduleId || 'default');
        await ensureCloudTransportForModule(moduleContext);

        const variablesJson = job?.variablesJson && typeof job.variablesJson === 'object' ? job.variablesJson : {};
        const languageCode = resolveTemplateLanguage(job);
        const components = normalizeTemplateComponents(variablesJson);

        try {
            await waClient.sendTemplateMessage(job.phone, {
                templateName: toText(job.templateName || ''),
                languageCode,
                components,
                metadata: {
                    campaignId: toText(job.campaignId || ''),
                    jobId: toText(job.jobId || ''),
                    tenantId,
                    moduleId
                }
            });

            const sentJob = await campaignQueueService.ackJob(tenantId, { idempotencyKey });
            await syncCampaignRecipientFromQueue(tenantId, sentJob, { reason: 'sent' });
            return { status: 'sent' };
        } catch (error) {
            const code = extractErrorCode(error);
            if (isLikelyPermanentError(code, permanentCodes)) {
                const skippedJob = await campaignQueueService.skipJob(tenantId, {
                    idempotencyKey,
                    reason: `permanent_error_${code}`
                });
                await syncCampaignRecipientFromQueue(tenantId, skippedJob, { reason: `permanent_error_${code}` });
                return { status: 'skipped', reason: 'permanent_error', code };
            }

            const isTransient = Number.isFinite(Number(code)) ? transientCodes.has(Number(code)) : false;
            const retryDelaySeconds = buildRetryDelaySeconds(job?.attemptCount || 0, retryBaseSeconds, retryMaxSeconds);
            const failedJob = await campaignQueueService.failJob(tenantId, {
                idempotencyKey,
                lastError: String(error?.message || (isTransient ? 'transient_dispatch_failed' : 'dispatch_failed')),
                retryDelaySeconds
            });
            await syncCampaignRecipientFromQueue(tenantId, failedJob, {
                reason: String(error?.message || (isTransient ? 'transient_dispatch_failed' : 'dispatch_failed'))
            });
            return { status: 'failed', reason: 'retry_scheduled', code };
        }
    }

    async function runTenant(tenantId = '') {
        if (!tenantId) return { claimed: 0, sent: 0, failed: 0, skipped: 0, recovered: 0 };
        const recovered = await recoverStaleClaims(tenantId);
        const claimedJobs = await campaignQueueService.claimBatch(tenantId, {
            workerId,
            limit: batchSize
        });
        const jobs = Array.isArray(claimedJobs) ? claimedJobs : [];
        for (const claimedJob of jobs) {
            await syncCampaignRecipientFromQueue(tenantId, claimedJob, { reason: 'claimed', actorId: workerId });
        }

        let sent = 0;
        let failed = 0;
        let skipped = 0;
        for (const job of jobs) {
            const result = await dispatchSingleJob(tenantId, job);
            if (result?.status === 'sent') sent += 1;
            else if (result?.status === 'failed') failed += 1;
            else if (result?.status === 'skipped') skipped += 1;
        }

        return { claimed: jobs.length, sent, failed, skipped, recovered };
    }

    async function runNow() {
        if (!enabled) return { ok: true, skipped: true, reason: 'disabled' };
        if (running) return { ok: true, skipped: true, reason: 'already_running' };
        running = true;
        try {
            const tenants = (typeof tenantService?.getTenants === 'function' ? tenantService.getTenants() : [])
                .filter((tenant) => tenant?.active !== false)
                .map((tenant) => toText(tenant?.id || ''))
                .filter(Boolean);

            let claimed = 0;
            let sent = 0;
            let failed = 0;
            let skipped = 0;
            let recovered = 0;

            for (const tenantId of tenants) {
                const result = await runTenant(tenantId);
                claimed += Number(result?.claimed || 0);
                sent += Number(result?.sent || 0);
                failed += Number(result?.failed || 0);
                skipped += Number(result?.skipped || 0);
                recovered += Number(result?.recovered || 0);
            }

            if (claimed > 0 || recovered > 0) {
                logger?.info?.(`[Ops][CampaignDispatcher] recovered=${recovered} claimed=${claimed} sent=${sent} failed=${failed} skipped=${skipped}`);
            }
            return { ok: true, claimed, sent, failed, skipped, recovered, at: toIsoSafe(new Date()) };
        } catch (error) {
            opsTelemetry?.recordInternalError?.('campaign_dispatcher_job', error);
            logger?.warn?.('[Ops][CampaignDispatcher] run failed: ' + String(error?.message || error));
            return { ok: false, error: String(error?.message || error) };
        } finally {
            running = false;
        }
    }

    function start() {
        if (!enabled) {
            logger?.info?.('[Ops][CampaignDispatcher] disabled.');
            return;
        }
        if (timer) return;
        timer = setInterval(() => {
            runNow().catch(() => { });
        }, intervalMs);
        if (typeof timer?.unref === 'function') timer.unref();
        runNow().catch(() => { });
        logger?.info?.(`[Ops][CampaignDispatcher] started intervalMs=${intervalMs} batchSize=${batchSize} rpmPerModule=${perModuleRpm} claimTtlSeconds=${claimTtlSeconds}`);
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
    createCampaignDispatcherJob
};
