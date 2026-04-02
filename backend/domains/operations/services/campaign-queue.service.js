const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const STORE_FILE = 'campaign_queue.json';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const VALID_STATUSES = new Set(['pending', 'claimed', 'sent', 'failed', 'skipped']);

let schemaReady = false;
let schemaPromise = null;

function nowIso() {
    return new Date().toISOString();
}

function createId(prefix = 'job') {
    return `${String(prefix || 'job').trim().toLowerCase() || 'job'}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

function resolveTenantId(input = null) {
    if (typeof input === 'string') return normalizeTenantId(input || DEFAULT_TENANT_ID);
    if (input && typeof input === 'object') return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    return DEFAULT_TENANT_ID;
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toNullableText(value = '') {
    const text = toText(value);
    return text || null;
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function toIso(value = '') {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    }
    const text = toText(value);
    if (!text) return null;
    const parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed.toISOString();
}

function normalizeScopeModuleId(value = '') {
    return toLower(value);
}

function normalizeObject(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function normalizeLimit(value = DEFAULT_LIMIT) {
    const parsed = Number(value || DEFAULT_LIMIT);
    if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function normalizeStatus(value = '') {
    const normalized = toLower(value);
    if (VALID_STATUSES.has(normalized)) return normalized;
    return 'pending';
}

function normalizeInteger(value = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return Math.max(min, 0);
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeJobRecord(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const createdAt = toIso(source.createdAt || source.created_at) || nowIso();
    const updatedAt = toIso(source.updatedAt || source.updated_at) || createdAt;
    return {
        jobId: toText(source.jobId || source.job_id) || createId('camp_job'),
        campaignId: toText(source.campaignId || source.campaign_id),
        recipientId: toText(source.recipientId || source.recipient_id),
        phone: toText(source.phone),
        moduleId: normalizeScopeModuleId(source.moduleId || source.module_id),
        templateName: toText(source.templateName || source.template_name),
        templateLanguage: toText(source.templateLanguage || source.template_language || 'es'),
        variablesJson: normalizeObject(source.variablesJson || source.variables_json),
        idempotencyKey: toText(source.idempotencyKey || source.idempotency_key),
        status: normalizeStatus(source.status || 'pending'),
        attemptCount: normalizeInteger(source.attemptCount ?? source.attempt_count, { min: 0, max: 10000 }),
        maxAttempts: normalizeInteger(source.maxAttempts ?? source.max_attempts, { min: 1, max: 10000 }) || 3,
        nextAttemptAt: toIso(source.nextAttemptAt || source.next_attempt_at) || createdAt,
        claimedAt: toIso(source.claimedAt || source.claimed_at),
        claimedBy: toNullableText(source.claimedBy || source.claimed_by),
        lastError: toNullableText(source.lastError || source.last_error),
        createdAt,
        updatedAt
    };
}

function normalizeStore(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const items = Array.isArray(source.items)
        ? source.items
            .map((entry) => normalizeJobRecord(entry))
            .filter((entry) => entry.idempotencyKey)
        : [];
    return { items };
}

function toPublicRecord(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    return {
        jobId: toText(source.jobId),
        campaignId: toText(source.campaignId),
        recipientId: toText(source.recipientId),
        phone: toText(source.phone),
        moduleId: normalizeScopeModuleId(source.moduleId),
        templateName: toText(source.templateName),
        templateLanguage: toText(source.templateLanguage || 'es'),
        variablesJson: normalizeObject(source.variablesJson),
        idempotencyKey: toText(source.idempotencyKey),
        status: normalizeStatus(source.status),
        attemptCount: normalizeInteger(source.attemptCount, { min: 0, max: 10000 }),
        maxAttempts: normalizeInteger(source.maxAttempts, { min: 1, max: 10000 }),
        nextAttemptAt: toIso(source.nextAttemptAt),
        claimedAt: toIso(source.claimedAt),
        claimedBy: toNullableText(source.claimedBy),
        lastError: toNullableText(source.lastError),
        createdAt: toIso(source.createdAt),
        updatedAt: toIso(source.updatedAt)
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_campaign_queue (
                job_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                campaign_id TEXT NOT NULL,
                recipient_id TEXT NOT NULL,
                phone TEXT NOT NULL,
                module_id TEXT NOT NULL,
                template_name TEXT NOT NULL,
                template_language TEXT NOT NULL,
                variables_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                idempotency_key TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'sent', 'failed', 'skipped')),
                attempt_count INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 3,
                next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                claimed_at TIMESTAMPTZ NULL,
                claimed_by TEXT NULL,
                last_error TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, job_id),
                UNIQUE (tenant_id, idempotency_key)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_campaign_queue_dispatch
            ON tenant_campaign_queue(tenant_id, status, next_attempt_at, created_at)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_campaign_queue_campaign
            ON tenant_campaign_queue(tenant_id, campaign_id, status, created_at DESC)
        `);
        schemaReady = true;
    })();

    try {
        await schemaPromise;
    } catch (error) {
        schemaPromise = null;
        throw error;
    }
}

async function getJobByIdempotencyKey(tenantId = DEFAULT_TENANT_ID, idempotencyKey = '') {
    const cleanTenantId = resolveTenantId(tenantId);
    const cleanIdempotencyKey = toText(idempotencyKey);
    if (!cleanIdempotencyKey) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const item = store.items.find((entry) => entry.idempotencyKey === cleanIdempotencyKey);
        return item ? toPublicRecord(item) : null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT job_id, campaign_id, recipient_id, phone, module_id, template_name, template_language,
                    variables_json, idempotency_key, status, attempt_count, max_attempts, next_attempt_at,
                    claimed_at, claimed_by, last_error, created_at, updated_at
               FROM tenant_campaign_queue
              WHERE tenant_id = $1
                AND idempotency_key = $2
              LIMIT 1`,
            [cleanTenantId, cleanIdempotencyKey]
        );
        const row = Array.isArray(result?.rows) && result.rows[0] ? result.rows[0] : null;
        if (!row) return null;
        return toPublicRecord({
            jobId: row.job_id,
            campaignId: row.campaign_id,
            recipientId: row.recipient_id,
            phone: row.phone,
            moduleId: row.module_id,
            templateName: row.template_name,
            templateLanguage: row.template_language,
            variablesJson: row.variables_json,
            idempotencyKey: row.idempotency_key,
            status: row.status,
            attemptCount: row.attempt_count,
            maxAttempts: row.max_attempts,
            nextAttemptAt: row.next_attempt_at,
            claimedAt: row.claimed_at,
            claimedBy: row.claimed_by,
            lastError: row.last_error,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function enqueueJob(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const clean = normalizeJobRecord(payload);
    if (!clean.idempotencyKey) throw new Error('idempotencyKey requerido para encolar job.');
    if (!clean.campaignId) throw new Error('campaignId requerido para encolar job.');
    if (!clean.phone) throw new Error('phone requerido para encolar job.');

    const existing = await getJobByIdempotencyKey(cleanTenantId, clean.idempotencyKey);
    if (existing) return existing;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        store.items.push(clean);
        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        return toPublicRecord(clean);
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO tenant_campaign_queue (
            job_id, tenant_id, campaign_id, recipient_id, phone, module_id, template_name, template_language,
            variables_json, idempotency_key, status, attempt_count, max_attempts, next_attempt_at,
            claimed_at, claimed_by, last_error, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9::jsonb, $10, $11, $12, $13, $14::timestamptz,
            $15::timestamptz, $16, $17, $18::timestamptz, $19::timestamptz
        )
        ON CONFLICT (tenant_id, idempotency_key)
        DO NOTHING`,
        [
            clean.jobId,
            cleanTenantId,
            clean.campaignId,
            clean.recipientId,
            clean.phone,
            clean.moduleId,
            clean.templateName,
            clean.templateLanguage,
            JSON.stringify(clean.variablesJson || {}),
            clean.idempotencyKey,
            clean.status,
            clean.attemptCount,
            clean.maxAttempts,
            clean.nextAttemptAt,
            clean.claimedAt,
            clean.claimedBy,
            clean.lastError,
            clean.createdAt,
            clean.updatedAt
        ]
    );

    return getJobByIdempotencyKey(cleanTenantId, clean.idempotencyKey);
}

async function claimBatch(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const workerId = toText(options.workerId || options.claimedBy || 'worker');
    const limit = normalizeLimit(options.limit || 20);
    const now = toIso(options.now) || nowIso();

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const candidates = store.items
            .filter((entry) => entry.status === 'pending')
            .filter((entry) => {
                const nextAttemptAt = Date.parse(String(entry.nextAttemptAt || ''));
                return Number.isFinite(nextAttemptAt) ? nextAttemptAt <= Date.parse(now) : true;
            })
            .sort((a, b) => String(a.nextAttemptAt || '').localeCompare(String(b.nextAttemptAt || '')))
            .slice(0, limit);

        const claimedIds = new Set(candidates.map((entry) => entry.jobId));
        store.items = store.items.map((entry) => {
            if (!claimedIds.has(entry.jobId)) return entry;
            return normalizeJobRecord({
                ...entry,
                status: 'claimed',
                claimedAt: now,
                claimedBy: workerId,
                updatedAt: now
            });
        });
        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        return store.items.filter((entry) => claimedIds.has(entry.jobId)).map((entry) => toPublicRecord(entry));
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `WITH picked AS (
            SELECT job_id
              FROM tenant_campaign_queue
             WHERE tenant_id = $1
               AND status = 'pending'
               AND next_attempt_at <= $2::timestamptz
             ORDER BY next_attempt_at ASC, created_at ASC
             LIMIT $3
             FOR UPDATE SKIP LOCKED
        )
        UPDATE tenant_campaign_queue AS q
           SET status = 'claimed',
               claimed_at = NOW(),
               claimed_by = $4,
               updated_at = NOW()
          FROM picked
         WHERE q.tenant_id = $1
           AND q.job_id = picked.job_id
        RETURNING q.job_id, q.campaign_id, q.recipient_id, q.phone, q.module_id, q.template_name, q.template_language,
                  q.variables_json, q.idempotency_key, q.status, q.attempt_count, q.max_attempts, q.next_attempt_at,
                  q.claimed_at, q.claimed_by, q.last_error, q.created_at, q.updated_at`,
        [cleanTenantId, now, limit, workerId]
    );

    return (Array.isArray(result?.rows) ? result.rows : []).map((row) => toPublicRecord({
        jobId: row.job_id,
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        phone: row.phone,
        moduleId: row.module_id,
        templateName: row.template_name,
        templateLanguage: row.template_language,
        variablesJson: row.variables_json,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        claimedAt: row.claimed_at,
        claimedBy: row.claimed_by,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}

async function updateJobByIdempotencyKey(tenantId = DEFAULT_TENANT_ID, idempotencyKey = '', mutator = null) {
    const cleanTenantId = resolveTenantId(tenantId);
    const cleanIdempotencyKey = toText(idempotencyKey);
    if (!cleanIdempotencyKey) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const index = store.items.findIndex((entry) => entry.idempotencyKey === cleanIdempotencyKey);
        if (index < 0) return null;
        const previous = normalizeJobRecord(store.items[index]);
        const nextPatch = typeof mutator === 'function' ? (mutator(previous) || {}) : {};
        const next = normalizeJobRecord({
            ...previous,
            ...nextPatch,
            updatedAt: nowIso()
        });
        store.items[index] = next;
        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        return toPublicRecord(next);
    }

    return getJobByIdempotencyKey(cleanTenantId, cleanIdempotencyKey);
}

async function ackJob(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const idempotencyKey = toText(payload.idempotencyKey || payload.idempotency_key);
    if (!idempotencyKey) throw new Error('idempotencyKey requerido para confirmar job.');

    if (getStorageDriver() !== 'postgres') {
        return updateJobByIdempotencyKey(cleanTenantId, idempotencyKey, () => ({
            status: 'sent',
            claimedAt: null,
            claimedBy: null,
            lastError: null
        }));
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `UPDATE tenant_campaign_queue
            SET status = 'sent',
                claimed_at = NULL,
                claimed_by = NULL,
                last_error = NULL,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND idempotency_key = $2
        RETURNING job_id, campaign_id, recipient_id, phone, module_id, template_name, template_language,
                  variables_json, idempotency_key, status, attempt_count, max_attempts, next_attempt_at,
                  claimed_at, claimed_by, last_error, created_at, updated_at`,
        [cleanTenantId, idempotencyKey]
    );
    const row = result?.rows?.[0] || null;
    if (!row) return null;
    return toPublicRecord({
        jobId: row.job_id,
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        phone: row.phone,
        moduleId: row.module_id,
        templateName: row.template_name,
        templateLanguage: row.template_language,
        variablesJson: row.variables_json,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        claimedAt: row.claimed_at,
        claimedBy: row.claimed_by,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    });
}

async function failJob(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const idempotencyKey = toText(payload.idempotencyKey || payload.idempotency_key);
    const retryDelaySeconds = normalizeInteger(payload.retryDelaySeconds ?? payload.retry_delay_seconds, { min: 1, max: 86400 }) || 60;
    const lastError = toNullableText(payload.lastError || payload.last_error || 'delivery_failed');
    if (!idempotencyKey) throw new Error('idempotencyKey requerido para fallar job.');

    if (getStorageDriver() !== 'postgres') {
        const now = Date.now();
        return updateJobByIdempotencyKey(cleanTenantId, idempotencyKey, (previous) => {
            const nextAttemptCount = normalizeInteger(previous.attemptCount, { min: 0, max: 10000 }) + 1;
            const maxAttempts = normalizeInteger(previous.maxAttempts, { min: 1, max: 10000 });
            const exhausted = nextAttemptCount >= maxAttempts;
            return {
                attemptCount: nextAttemptCount,
                status: exhausted ? 'failed' : 'pending',
                nextAttemptAt: exhausted ? nowIso() : new Date(now + (retryDelaySeconds * 1000)).toISOString(),
                claimedAt: null,
                claimedBy: null,
                lastError
            };
        });
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `UPDATE tenant_campaign_queue
            SET attempt_count = attempt_count + 1,
                status = CASE WHEN (attempt_count + 1) >= max_attempts THEN 'failed' ELSE 'pending' END,
                next_attempt_at = CASE
                    WHEN (attempt_count + 1) >= max_attempts THEN NOW()
                    ELSE NOW() + ($3::int * INTERVAL '1 second')
                END,
                claimed_at = NULL,
                claimed_by = NULL,
                last_error = $4,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND idempotency_key = $2
        RETURNING job_id, campaign_id, recipient_id, phone, module_id, template_name, template_language,
                  variables_json, idempotency_key, status, attempt_count, max_attempts, next_attempt_at,
                  claimed_at, claimed_by, last_error, created_at, updated_at`,
        [cleanTenantId, idempotencyKey, retryDelaySeconds, lastError]
    );
    const row = result?.rows?.[0] || null;
    if (!row) return null;
    return toPublicRecord({
        jobId: row.job_id,
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        phone: row.phone,
        moduleId: row.module_id,
        templateName: row.template_name,
        templateLanguage: row.template_language,
        variablesJson: row.variables_json,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        claimedAt: row.claimed_at,
        claimedBy: row.claimed_by,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    });
}

async function skipJob(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const idempotencyKey = toText(payload.idempotencyKey || payload.idempotency_key);
    const reason = toNullableText(payload.reason || payload.lastError || payload.last_error || 'skipped');
    if (!idempotencyKey) throw new Error('idempotencyKey requerido para omitir job.');

    if (getStorageDriver() !== 'postgres') {
        return updateJobByIdempotencyKey(cleanTenantId, idempotencyKey, () => ({
            status: 'skipped',
            claimedAt: null,
            claimedBy: null,
            lastError: reason
        }));
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `UPDATE tenant_campaign_queue
            SET status = 'skipped',
                claimed_at = NULL,
                claimed_by = NULL,
                last_error = $3,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND idempotency_key = $2
        RETURNING job_id, campaign_id, recipient_id, phone, module_id, template_name, template_language,
                  variables_json, idempotency_key, status, attempt_count, max_attempts, next_attempt_at,
                  claimed_at, claimed_by, last_error, created_at, updated_at`,
        [cleanTenantId, idempotencyKey, reason]
    );
    const row = result?.rows?.[0] || null;
    if (!row) return null;
    return toPublicRecord({
        jobId: row.job_id,
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        phone: row.phone,
        moduleId: row.module_id,
        templateName: row.template_name,
        templateLanguage: row.template_language,
        variablesJson: row.variables_json,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        claimedAt: row.claimed_at,
        claimedBy: row.claimed_by,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    });
}

module.exports = {
    enqueueJob,
    claimBatch,
    ackJob,
    failJob,
    skipJob,
    getJobByIdempotencyKey
};

