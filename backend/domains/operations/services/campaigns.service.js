const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
const campaignQueueService = require('./campaign-queue.service');

const STORE_FILE = 'campaigns.json';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_RECIPIENT_LIMIT = 2000;

const CAMPAIGN_STATUSES = new Set(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed']);
const RECIPIENT_STATUSES = new Set(['pending', 'claimed', 'sent', 'failed', 'skipped', 'opted_out']);
const EVENT_TYPES = new Set([
    'campaign_created',
    'campaign_updated',
    'campaign_started',
    'campaign_paused',
    'campaign_resumed',
    'campaign_cancelled',
    'campaign_completed',
    'recipient_queued',
    'recipient_claimed',
    'recipient_sent',
    'recipient_failed',
    'recipient_skipped',
    'recipient_delivered',
    'recipient_read'
]);
const EVENT_SEVERITIES = new Set(['info', 'warn', 'error']);
const EVENT_ACTOR_TYPES = new Set(['system', 'user', 'worker', 'webhook']);

let schemaReady = false;
let schemaPromise = null;
const campaignUpdatedListeners = new Set();

function emitCampaignUpdated(payload = {}) {
    campaignUpdatedListeners.forEach((listener) => {
        try {
            listener(payload);
        } catch (_) { }
    });
}

function onCampaignUpdated(listener) {
    if (typeof listener !== 'function') return () => { };
    campaignUpdatedListeners.add(listener);
    return () => {
        campaignUpdatedListeners.delete(listener);
    };
}

function nowIso() {
    return new Date().toISOString();
}

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function toNullableText(value = '') {
    const text = toText(value);
    return text || null;
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

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value, fallback = 0, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeTenant(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function normalizeScopeModuleId(value = '') {
    return toLower(value);
}

function normalizeModuleId(value = '') {
    return toText(value).toUpperCase();
}

function normalizeCampaignStatus(value = '', fallback = 'draft') {
    const status = toLower(value || fallback);
    if (CAMPAIGN_STATUSES.has(status)) return status;
    return fallback;
}

function normalizeRecipientStatus(value = '', fallback = 'pending') {
    const status = toLower(value || fallback);
    if (RECIPIENT_STATUSES.has(status)) return status;
    return fallback;
}

function normalizeEventType(value = '', fallback = 'campaign_updated') {
    const type = toLower(value || fallback);
    if (EVENT_TYPES.has(type)) return type;
    return fallback;
}

function normalizeEventSeverity(value = '', fallback = 'info') {
    const severity = toLower(value || fallback);
    if (EVENT_SEVERITIES.has(severity)) return severity;
    return fallback;
}

function normalizeActorType(value = '', fallback = 'system') {
    const actorType = toLower(value || fallback);
    if (EVENT_ACTOR_TYPES.has(actorType)) return actorType;
    return fallback;
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

function normalizeOffset(value = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

function randomId(prefix = 'id') {
    const normalizedPrefix = toLower(prefix) || 'id';
    const seed = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '')
        : crypto.randomBytes(8).toString('hex');
    return `${normalizedPrefix}_${seed}`;
}

function ensureArray(input = []) {
    return Array.isArray(input) ? input : [];
}

function normalizeCampaignRecord(input = {}) {
    const source = normalizeObject(input);
    const createdAt = toIso(source.createdAt || source.created_at) || nowIso();
    const updatedAt = toIso(source.updatedAt || source.updated_at) || createdAt;
    const status = normalizeCampaignStatus(source.status || 'draft');
    const scheduledAt = toIso(source.scheduledAt || source.scheduled_at);
    return {
        campaignId: toText(source.campaignId || source.campaign_id) || randomId('camp'),
        tenantId: normalizeTenant(source.tenantId || source.tenant_id),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id || source.moduleId || source.module_id || ''),
        moduleId: normalizeModuleId(source.moduleId || source.module_id),
        templateId: toNullableText(source.templateId || source.template_id),
        templateName: toText(source.templateName || source.template_name),
        templateLanguage: toLower(source.templateLanguage || source.template_language || 'es') || 'es',
        campaignName: toText(source.campaignName || source.campaign_name) || 'Campana sin nombre',
        campaignDescription: toNullableText(source.campaignDescription || source.campaign_description),
        status,
        audienceFiltersJson: normalizeObject(source.audienceFiltersJson || source.audience_filters_json),
        variablesPreviewJson: normalizeObject(source.variablesPreviewJson || source.variables_preview_json),
        totalRecipients: toInt(source.totalRecipients ?? source.total_recipients, 0, { min: 0 }),
        pendingRecipients: toInt(source.pendingRecipients ?? source.pending_recipients, 0, { min: 0 }),
        claimedRecipients: toInt(source.claimedRecipients ?? source.claimed_recipients, 0, { min: 0 }),
        sentRecipients: toInt(source.sentRecipients ?? source.sent_recipients, 0, { min: 0 }),
        failedRecipients: toInt(source.failedRecipients ?? source.failed_recipients, 0, { min: 0 }),
        skippedRecipients: toInt(source.skippedRecipients ?? source.skipped_recipients, 0, { min: 0 }),
        scheduledAt,
        startedAt: toIso(source.startedAt || source.started_at),
        completedAt: toIso(source.completedAt || source.completed_at),
        cancelledAt: toIso(source.cancelledAt || source.cancelled_at),
        createdBy: toNullableText(source.createdBy || source.created_by),
        updatedBy: toNullableText(source.updatedBy || source.updated_by),
        createdAt,
        updatedAt
    };
}

function normalizeRecipientRecord(input = {}) {
    const source = normalizeObject(input);
    const createdAt = toIso(source.createdAt || source.created_at) || nowIso();
    const updatedAt = toIso(source.updatedAt || source.updated_at) || createdAt;
    return {
        tenantId: normalizeTenant(source.tenantId || source.tenant_id),
        campaignId: toText(source.campaignId || source.campaign_id),
        recipientId: toText(source.recipientId || source.recipient_id) || randomId('rcp'),
        customerId: toNullableText(source.customerId || source.customer_id),
        phone: toText(source.phone),
        moduleId: toText(source.moduleId || source.module_id),
        status: normalizeRecipientStatus(source.status || 'pending'),
        idempotencyKey: toText(source.idempotencyKey || source.idempotency_key),
        variablesJson: normalizeObject(source.variablesJson || source.variables_json),
        attemptCount: toInt(source.attemptCount ?? source.attempt_count, 0, { min: 0 }),
        maxAttempts: toInt(source.maxAttempts ?? source.max_attempts, 3, { min: 1 }),
        nextAttemptAt: toIso(source.nextAttemptAt || source.next_attempt_at) || createdAt,
        claimedAt: toIso(source.claimedAt || source.claimed_at),
        sentAt: toIso(source.sentAt || source.sent_at),
        deliveredAt: toIso(source.deliveredAt || source.delivered_at),
        readAt: toIso(source.readAt || source.read_at),
        failedAt: toIso(source.failedAt || source.failed_at),
        skippedAt: toIso(source.skippedAt || source.skipped_at),
        lastError: toNullableText(source.lastError || source.last_error),
        skipReason: toNullableText(source.skipReason || source.skip_reason),
        metaMessageId: toNullableText(source.metaMessageId || source.meta_message_id),
        createdAt,
        updatedAt
    };
}

function normalizeEventRecord(input = {}) {
    const source = normalizeObject(input);
    return {
        eventId: toText(source.eventId || source.event_id) || randomId('camp_evt'),
        tenantId: normalizeTenant(source.tenantId || source.tenant_id),
        campaignId: toText(source.campaignId || source.campaign_id),
        recipientId: toNullableText(source.recipientId || source.recipient_id),
        customerId: toNullableText(source.customerId || source.customer_id),
        phone: toNullableText(source.phone),
        moduleId: toNullableText(source.moduleId || source.module_id),
        eventType: normalizeEventType(source.eventType || source.event_type || 'campaign_updated'),
        severity: normalizeEventSeverity(source.severity || 'info'),
        actorType: normalizeActorType(source.actorType || source.actor_type || 'system'),
        actorId: toNullableText(source.actorId || source.actor_id),
        reason: toNullableText(source.reason),
        message: toNullableText(source.message),
        payloadJson: normalizeObject(source.payloadJson || source.payload_json),
        createdAt: toIso(source.createdAt || source.created_at) || nowIso()
    };
}

function sanitizeCampaign(record = {}) {
    return normalizeCampaignRecord(record);
}

function sanitizeRecipient(record = {}) {
    return normalizeRecipientRecord(record);
}

function sanitizeEvent(record = {}) {
    return normalizeEventRecord(record);
}

function normalizeStore(input = {}) {
    const source = normalizeObject(input);
    return {
        campaigns: ensureArray(source.campaigns).map(sanitizeCampaign),
        recipients: ensureArray(source.recipients).map(sanitizeRecipient),
        events: ensureArray(source.events).map(sanitizeEvent)
    };
}

function recipientKey(item = {}) {
    return `${toText(item.tenantId)}::${toText(item.campaignId)}::${toText(item.recipientId)}`;
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_campaigns (
                campaign_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                scope_module_id TEXT NOT NULL DEFAULT '',
                module_id TEXT NOT NULL,
                template_id TEXT NULL,
                template_name TEXT NOT NULL,
                template_language TEXT NOT NULL DEFAULT 'es',
                campaign_name TEXT NOT NULL,
                campaign_description TEXT NULL,
                status TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
                audience_filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                variables_preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                total_recipients INTEGER NOT NULL DEFAULT 0,
                pending_recipients INTEGER NOT NULL DEFAULT 0,
                claimed_recipients INTEGER NOT NULL DEFAULT 0,
                sent_recipients INTEGER NOT NULL DEFAULT 0,
                failed_recipients INTEGER NOT NULL DEFAULT 0,
                skipped_recipients INTEGER NOT NULL DEFAULT 0,
                scheduled_at TIMESTAMPTZ NULL,
                started_at TIMESTAMPTZ NULL,
                completed_at TIMESTAMPTZ NULL,
                cancelled_at TIMESTAMPTZ NULL,
                created_by TEXT NULL,
                updated_by TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, campaign_id)
            )
        `);

        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_campaign_recipients (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                campaign_id TEXT NOT NULL,
                recipient_id TEXT NOT NULL,
                customer_id TEXT NULL,
                phone TEXT NOT NULL,
                module_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'claimed', 'sent', 'failed', 'skipped', 'opted_out')),
                idempotency_key TEXT NOT NULL,
                variables_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL DEFAULT 3,
                next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                claimed_at TIMESTAMPTZ NULL,
                sent_at TIMESTAMPTZ NULL,
                delivered_at TIMESTAMPTZ NULL,
                read_at TIMESTAMPTZ NULL,
                failed_at TIMESTAMPTZ NULL,
                skipped_at TIMESTAMPTZ NULL,
                last_error TEXT NULL,
                skip_reason TEXT NULL,
                meta_message_id TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, campaign_id, recipient_id),
                UNIQUE (tenant_id, idempotency_key)
            )
        `);

        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_campaign_events (
                event_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                campaign_id TEXT NOT NULL,
                recipient_id TEXT NULL,
                customer_id TEXT NULL,
                phone TEXT NULL,
                module_id TEXT NULL,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'info',
                actor_type TEXT NOT NULL DEFAULT 'system',
                actor_id TEXT NULL,
                reason TEXT NULL,
                message TEXT NULL,
                payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, event_id)
            )
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

function mapCampaignRow(row = {}) {
    return sanitizeCampaign({
        campaignId: row.campaign_id,
        tenantId: row.tenant_id,
        scopeModuleId: row.scope_module_id,
        moduleId: row.module_id,
        templateId: row.template_id,
        templateName: row.template_name,
        templateLanguage: row.template_language,
        campaignName: row.campaign_name,
        campaignDescription: row.campaign_description,
        status: row.status,
        audienceFiltersJson: row.audience_filters_json,
        variablesPreviewJson: row.variables_preview_json,
        totalRecipients: row.total_recipients,
        pendingRecipients: row.pending_recipients,
        claimedRecipients: row.claimed_recipients,
        sentRecipients: row.sent_recipients,
        failedRecipients: row.failed_recipients,
        skippedRecipients: row.skipped_recipients,
        scheduledAt: row.scheduled_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        cancelledAt: row.cancelled_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    });
}

function mapRecipientRow(row = {}) {
    return sanitizeRecipient({
        tenantId: row.tenant_id,
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        customerId: row.customer_id,
        phone: row.phone,
        moduleId: row.module_id,
        status: row.status,
        idempotencyKey: row.idempotency_key,
        variablesJson: row.variables_json,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at,
        claimedAt: row.claimed_at,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        readAt: row.read_at,
        failedAt: row.failed_at,
        skippedAt: row.skipped_at,
        lastError: row.last_error,
        skipReason: row.skip_reason,
        metaMessageId: row.meta_message_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    });
}

function mapEventRow(row = {}) {
    return sanitizeEvent({
        eventId: row.event_id,
        tenantId: row.tenant_id,
        campaignId: row.campaign_id,
        recipientId: row.recipient_id,
        customerId: row.customer_id,
        phone: row.phone,
        moduleId: row.module_id,
        eventType: row.event_type,
        severity: row.severity,
        actorType: row.actor_type,
        actorId: row.actor_id,
        reason: row.reason,
        message: row.message,
        payloadJson: row.payload_json,
        createdAt: row.created_at
    });
}

async function readStore(tenantId = DEFAULT_TENANT_ID) {
    const parsed = await readTenantJsonFile(STORE_FILE, { tenantId, defaultValue: {} });
    return normalizeStore(parsed);
}

async function writeStore(tenantId = DEFAULT_TENANT_ID, store = {}) {
    await writeTenantJsonFile(STORE_FILE, normalizeStore(store), { tenantId });
}

async function persistCampaignRecord(tenantId = DEFAULT_TENANT_ID, record = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const normalized = sanitizeCampaign({ ...record, tenantId: cleanTenantId });
    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const campaigns = [...store.campaigns];
        const index = campaigns.findIndex((item) => item.campaignId === normalized.campaignId);
        if (index >= 0) campaigns[index] = normalized;
        else campaigns.unshift(normalized);
        await writeStore(cleanTenantId, { ...store, campaigns });
        return normalized;
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `INSERT INTO tenant_campaigns (
            campaign_id, tenant_id, scope_module_id, module_id, template_id, template_name, template_language,
            campaign_name, campaign_description, status, audience_filters_json, variables_preview_json,
            total_recipients, pending_recipients, claimed_recipients, sent_recipients, failed_recipients, skipped_recipients,
            scheduled_at, started_at, completed_at, cancelled_at, created_by, updated_by, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11::jsonb, $12::jsonb,
            $13, $14, $15, $16, $17, $18,
            $19::timestamptz, $20::timestamptz, $21::timestamptz, $22::timestamptz, $23, $24, $25::timestamptz, $26::timestamptz
        )
        ON CONFLICT (tenant_id, campaign_id)
        DO UPDATE SET
            scope_module_id = EXCLUDED.scope_module_id,
            module_id = EXCLUDED.module_id,
            template_id = EXCLUDED.template_id,
            template_name = EXCLUDED.template_name,
            template_language = EXCLUDED.template_language,
            campaign_name = EXCLUDED.campaign_name,
            campaign_description = EXCLUDED.campaign_description,
            status = EXCLUDED.status,
            audience_filters_json = EXCLUDED.audience_filters_json,
            variables_preview_json = EXCLUDED.variables_preview_json,
            total_recipients = EXCLUDED.total_recipients,
            pending_recipients = EXCLUDED.pending_recipients,
            claimed_recipients = EXCLUDED.claimed_recipients,
            sent_recipients = EXCLUDED.sent_recipients,
            failed_recipients = EXCLUDED.failed_recipients,
            skipped_recipients = EXCLUDED.skipped_recipients,
            scheduled_at = EXCLUDED.scheduled_at,
            started_at = EXCLUDED.started_at,
            completed_at = EXCLUDED.completed_at,
            cancelled_at = EXCLUDED.cancelled_at,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [
            normalized.campaignId,
            cleanTenantId,
            normalized.scopeModuleId || '',
            normalized.moduleId,
            normalized.templateId,
            normalized.templateName,
            normalized.templateLanguage,
            normalized.campaignName,
            normalized.campaignDescription,
            normalized.status,
            JSON.stringify(normalized.audienceFiltersJson || {}),
            JSON.stringify(normalized.variablesPreviewJson || {}),
            normalized.totalRecipients,
            normalized.pendingRecipients,
            normalized.claimedRecipients,
            normalized.sentRecipients,
            normalized.failedRecipients,
            normalized.skippedRecipients,
            normalized.scheduledAt,
            normalized.startedAt,
            normalized.completedAt,
            normalized.cancelledAt,
            normalized.createdBy,
            normalized.updatedBy,
            normalized.createdAt,
            normalized.updatedAt
        ]
    );
    return mapCampaignRow(result?.rows?.[0] || normalized);
}

async function persistRecipientRecord(tenantId = DEFAULT_TENANT_ID, record = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const normalized = sanitizeRecipient({ ...record, tenantId: cleanTenantId });
    if (!normalized.campaignId) throw new Error('campaignId requerido en recipient.');
    if (!normalized.phone) throw new Error('phone requerido en recipient.');

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const recipients = [...store.recipients];
        const key = recipientKey(normalized);
        const index = recipients.findIndex((item) => recipientKey(item) === key || item.idempotencyKey === normalized.idempotencyKey);
        if (index >= 0) recipients[index] = normalized;
        else recipients.push(normalized);
        await writeStore(cleanTenantId, { ...store, recipients });
        return normalized;
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `INSERT INTO tenant_campaign_recipients (
            tenant_id, campaign_id, recipient_id, customer_id, phone, module_id, status, idempotency_key,
            variables_json, attempt_count, max_attempts, next_attempt_at, claimed_at, sent_at, delivered_at,
            read_at, failed_at, skipped_at, last_error, skip_reason, meta_message_id, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9::jsonb, $10, $11, $12::timestamptz, $13::timestamptz, $14::timestamptz, $15::timestamptz,
            $16::timestamptz, $17::timestamptz, $18::timestamptz, $19, $20, $21, $22::timestamptz, $23::timestamptz
        )
        ON CONFLICT (tenant_id, campaign_id, recipient_id)
        DO UPDATE SET
            customer_id = EXCLUDED.customer_id,
            phone = EXCLUDED.phone,
            module_id = EXCLUDED.module_id,
            status = EXCLUDED.status,
            idempotency_key = EXCLUDED.idempotency_key,
            variables_json = EXCLUDED.variables_json,
            attempt_count = EXCLUDED.attempt_count,
            max_attempts = EXCLUDED.max_attempts,
            next_attempt_at = EXCLUDED.next_attempt_at,
            claimed_at = EXCLUDED.claimed_at,
            sent_at = EXCLUDED.sent_at,
            delivered_at = EXCLUDED.delivered_at,
            read_at = EXCLUDED.read_at,
            failed_at = EXCLUDED.failed_at,
            skipped_at = EXCLUDED.skipped_at,
            last_error = EXCLUDED.last_error,
            skip_reason = EXCLUDED.skip_reason,
            meta_message_id = EXCLUDED.meta_message_id,
            updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [
            cleanTenantId,
            normalized.campaignId,
            normalized.recipientId,
            normalized.customerId,
            normalized.phone,
            normalized.moduleId,
            normalized.status,
            normalized.idempotencyKey,
            JSON.stringify(normalized.variablesJson || {}),
            normalized.attemptCount,
            normalized.maxAttempts,
            normalized.nextAttemptAt,
            normalized.claimedAt,
            normalized.sentAt,
            normalized.deliveredAt,
            normalized.readAt,
            normalized.failedAt,
            normalized.skippedAt,
            normalized.lastError,
            normalized.skipReason,
            normalized.metaMessageId,
            normalized.createdAt,
            normalized.updatedAt
        ]
    );
    return mapRecipientRow(result?.rows?.[0] || normalized);
}

async function persistEventRecord(tenantId = DEFAULT_TENANT_ID, record = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const normalized = sanitizeEvent({ ...record, tenantId: cleanTenantId });
    if (!normalized.campaignId) throw new Error('campaignId requerido en evento.');

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const events = [...store.events, normalized]
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        await writeStore(cleanTenantId, { ...store, events });
        return normalized;
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `INSERT INTO tenant_campaign_events (
            event_id, tenant_id, campaign_id, recipient_id, customer_id, phone, module_id,
            event_type, severity, actor_type, actor_id, reason, message, payload_json, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14::jsonb, $15::timestamptz
        )
        ON CONFLICT (tenant_id, event_id)
        DO NOTHING
        RETURNING *`,
        [
            normalized.eventId,
            cleanTenantId,
            normalized.campaignId,
            normalized.recipientId,
            normalized.customerId,
            normalized.phone,
            normalized.moduleId,
            normalized.eventType,
            normalized.severity,
            normalized.actorType,
            normalized.actorId,
            normalized.reason,
            normalized.message,
            JSON.stringify(normalized.payloadJson || {}),
            normalized.createdAt
        ]
    );
    return mapEventRow(result?.rows?.[0] || normalized);
}

async function getCampaignById(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const campaignId = toText(typeof options === 'string' ? options : options?.campaignId);
    if (!campaignId) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const campaign = store.campaigns.find((item) => item.campaignId === campaignId) || null;
        return campaign ? sanitizeCampaign(campaign) : null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT * FROM tenant_campaigns WHERE tenant_id = $1 AND campaign_id = $2 LIMIT 1`,
            [cleanTenantId, campaignId]
        );
        const row = Array.isArray(result?.rows) ? result.rows[0] : null;
        return row ? mapCampaignRow(row) : null;
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function listCampaigns(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    const moduleId = toText(options.moduleId || '');
    const status = toText(options.status || '');
    const query = toLower(options.query || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const filtered = store.campaigns
            .filter((item) => !scopeModuleId || normalizeScopeModuleId(item.scopeModuleId) === scopeModuleId)
            .filter((item) => !moduleId || toText(item.moduleId) === moduleId)
            .filter((item) => !status || normalizeCampaignStatus(item.status) === normalizeCampaignStatus(status))
            .filter((item) => {
                if (!query) return true;
                const haystack = `${toLower(item.campaignName)} ${toLower(item.templateName)} ${toLower(item.campaignDescription || '')}`;
                return haystack.includes(query);
            })
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        return {
            items: filtered.slice(offset, offset + limit).map(sanitizeCampaign),
            total: filtered.length,
            limit,
            offset
        };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];

        if (scopeModuleId) {
            params.push(scopeModuleId);
            where.push(`scope_module_id = $${params.length}`);
        }
        if (moduleId) {
            params.push(moduleId);
            where.push(`module_id = $${params.length}`);
        }
        if (status) {
            params.push(normalizeCampaignStatus(status));
            where.push(`status = $${params.length}`);
        }
        if (query) {
            params.push(`%${query}%`);
            where.push(`(LOWER(campaign_name) LIKE $${params.length} OR LOWER(template_name) LIKE $${params.length} OR LOWER(COALESCE(campaign_description, '')) LIKE $${params.length})`);
        }

        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(`SELECT COUNT(*)::BIGINT AS total FROM tenant_campaigns WHERE ${whereSql}`, params);
        const rowsResult = await queryPostgres(
            `SELECT *
               FROM tenant_campaigns
              WHERE ${whereSql}
              ORDER BY created_at DESC
              LIMIT $${params.length + 1}
              OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        return {
            items: (Array.isArray(rowsResult?.rows) ? rowsResult.rows : []).map(mapCampaignRow),
            total: Number(totalResult?.rows?.[0]?.total || 0),
            limit,
            offset
        };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function recordCampaignEvent(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    return persistEventRecord(tenantId, payload);
}

async function listCampaignEvents(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const campaignId = toText(options.campaignId || '');
    if (!campaignId) {
        return { items: [], total: 0, limit: normalizeLimit(options.limit), offset: normalizeOffset(options.offset) };
    }
    const eventType = toText(options.eventType || '');
    const severity = toText(options.severity || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const filtered = store.events
            .filter((item) => item.campaignId === campaignId)
            .filter((item) => !eventType || item.eventType === normalizeEventType(eventType))
            .filter((item) => !severity || item.severity === normalizeEventSeverity(severity))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return {
            items: filtered.slice(offset, offset + limit).map(sanitizeEvent),
            total: filtered.length,
            limit,
            offset
        };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId, campaignId];
        const where = ['tenant_id = $1', 'campaign_id = $2'];
        if (eventType) {
            params.push(normalizeEventType(eventType));
            where.push(`event_type = $${params.length}`);
        }
        if (severity) {
            params.push(normalizeEventSeverity(severity));
            where.push(`severity = $${params.length}`);
        }
        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(`SELECT COUNT(*)::BIGINT AS total FROM tenant_campaign_events WHERE ${whereSql}`, params);
        const rowsResult = await queryPostgres(
            `SELECT *
               FROM tenant_campaign_events
              WHERE ${whereSql}
              ORDER BY created_at DESC
              LIMIT $${params.length + 1}
              OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );
        return {
            items: (Array.isArray(rowsResult?.rows) ? rowsResult.rows : []).map(mapEventRow),
            total: Number(totalResult?.rows?.[0]?.total || 0),
            limit,
            offset
        };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function createCampaign(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const source = normalizeObject(payload);
    const cleanNow = nowIso();
    const campaign = sanitizeCampaign({
        campaignId: source.campaignId || randomId('camp'),
        tenantId: cleanTenantId,
        scopeModuleId: source.scopeModuleId || source.moduleId || '',
        moduleId: normalizeModuleId(source.moduleId),
        templateId: source.templateId || null,
        templateName: source.templateName,
        templateLanguage: source.templateLanguage || 'es',
        campaignName: source.campaignName || source.name || 'Campana sin nombre',
        campaignDescription: source.campaignDescription || source.description || null,
        status: source.status || (toIso(source.scheduledAt) ? 'scheduled' : 'draft'),
        audienceFiltersJson: source.audienceFiltersJson || source.audienceFilters || {},
        variablesPreviewJson: source.variablesPreviewJson || source.variablesPreview || {},
        totalRecipients: 0,
        pendingRecipients: 0,
        claimedRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
        skippedRecipients: 0,
        scheduledAt: source.scheduledAt || null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        createdBy: source.createdBy || source.actorUserId || null,
        updatedBy: source.updatedBy || source.actorUserId || source.createdBy || null,
        createdAt: cleanNow,
        updatedAt: cleanNow
    });

    if (!campaign.moduleId) throw new Error('moduleId requerido para crear campana.');
    if (!campaign.templateName) throw new Error('templateName requerido para crear campana.');

    const persisted = await persistCampaignRecord(cleanTenantId, campaign);
    await recordCampaignEvent(cleanTenantId, {
        campaignId: persisted.campaignId,
        moduleId: persisted.moduleId,
        eventType: 'campaign_created',
        actorType: persisted.createdBy ? 'user' : 'system',
        actorId: persisted.createdBy,
        severity: 'info',
        message: `Campana creada: ${persisted.campaignName}`,
        payloadJson: {
            status: persisted.status,
            templateName: persisted.templateName,
            templateLanguage: persisted.templateLanguage
        }
    });

    return persisted;
}

async function updateCampaign(tenantId = DEFAULT_TENANT_ID, { campaignId = '', patch = {} } = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanCampaignId = toText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido para actualizar campana.');
    const existing = await getCampaignById(cleanTenantId, cleanCampaignId);
    if (!existing) throw new Error('Campana no encontrada.');

    const sourcePatch = normalizeObject(patch);
    const next = sanitizeCampaign({
        ...existing,
        moduleId: sourcePatch.moduleId !== undefined ? sourcePatch.moduleId : existing.moduleId,
        scopeModuleId: sourcePatch.scopeModuleId !== undefined ? sourcePatch.scopeModuleId : existing.scopeModuleId,
        templateId: sourcePatch.templateId !== undefined ? sourcePatch.templateId : existing.templateId,
        templateName: sourcePatch.templateName !== undefined ? sourcePatch.templateName : existing.templateName,
        templateLanguage: sourcePatch.templateLanguage !== undefined ? sourcePatch.templateLanguage : existing.templateLanguage,
        campaignName: sourcePatch.campaignName !== undefined ? sourcePatch.campaignName : existing.campaignName,
        campaignDescription: sourcePatch.campaignDescription !== undefined ? sourcePatch.campaignDescription : existing.campaignDescription,
        status: sourcePatch.status !== undefined ? sourcePatch.status : existing.status,
        audienceFiltersJson: sourcePatch.audienceFiltersJson !== undefined ? sourcePatch.audienceFiltersJson : existing.audienceFiltersJson,
        variablesPreviewJson: sourcePatch.variablesPreviewJson !== undefined ? sourcePatch.variablesPreviewJson : existing.variablesPreviewJson,
        scheduledAt: sourcePatch.scheduledAt !== undefined ? sourcePatch.scheduledAt : existing.scheduledAt,
        startedAt: sourcePatch.startedAt !== undefined ? sourcePatch.startedAt : existing.startedAt,
        completedAt: sourcePatch.completedAt !== undefined ? sourcePatch.completedAt : existing.completedAt,
        cancelledAt: sourcePatch.cancelledAt !== undefined ? sourcePatch.cancelledAt : existing.cancelledAt,
        updatedBy: sourcePatch.updatedBy !== undefined ? sourcePatch.updatedBy : (sourcePatch.actorUserId || existing.updatedBy),
        updatedAt: nowIso()
    });

    const persisted = await persistCampaignRecord(cleanTenantId, next);
    await recordCampaignEvent(cleanTenantId, {
        campaignId: persisted.campaignId,
        moduleId: persisted.moduleId,
        eventType: 'campaign_updated',
        actorType: sourcePatch.actorUserId ? 'user' : 'system',
        actorId: sourcePatch.actorUserId || sourcePatch.updatedBy || null,
        severity: 'info',
        message: 'Campana actualizada',
        payloadJson: { previous: existing, next: persisted }
    });
    return persisted;
}

function normalizeStringArray(input = []) {
    const source = Array.isArray(input) ? input : [];
    return source.map((entry) => toText(entry)).filter(Boolean);
}

function normalizeIdempotencyKey(campaignId = '', moduleId = '', phone = '') {
    return `campaign:${toText(campaignId)}:${toLower(moduleId)}:${toText(phone)}`;
}

function customerMatchesFilters(customer = {}, filters = {}) {
    const includeCustomerIds = new Set(normalizeStringArray(filters.includeCustomerIds || filters.customerIds));
    const excludeCustomerIds = new Set(normalizeStringArray(filters.excludeCustomerIds));
    const tagAny = new Set(normalizeStringArray(filters.tagAny).map((entry) => toLower(entry)));
    const tagAll = new Set(normalizeStringArray(filters.tagAll).map((entry) => toLower(entry)));
    const labelsAny = new Set(normalizeStringArray(filters.labels || filters.labelsAny || filters.labelAny).map((entry) => toLower(entry)));
    const search = toLower(filters.search || '');
    const marketingStatus = new Set(normalizeStringArray(filters.marketingStatus).map((entry) => toLower(entry)));
    const commercialStatus = new Set(
        normalizeStringArray(
            filters.commercialStatus
            || filters.commercialStatuses
            || filters.commercial_status
            || filters.commercial_statuses
        ).map((entry) => toLower(entry))
    );

    const customerId = toText(customer.customerId);
    const tags = ensureArray(customer.tags).map((entry) => toLower(entry));
    const tagsSet = new Set(tags);
    const haystack = `${toLower(customer.contactName)} ${toLower(customer.phone)} ${toLower(customer.email)} ${toLower(customer.customerId)}`;

    if (includeCustomerIds.size && !includeCustomerIds.has(customerId)) return false;
    if (excludeCustomerIds.size && excludeCustomerIds.has(customerId)) return false;
    if (search && !haystack.includes(search)) return false;

    if (tagAny.size > 0) {
        const hasAny = [...tagAny].some((tag) => tagsSet.has(tag));
        if (!hasAny) return false;
    }

    if (labelsAny.size > 0) {
        const hasAnyLabel = [...labelsAny].some((tag) => tagsSet.has(tag));
        if (!hasAnyLabel) return false;
    }

    if (tagAll.size > 0) {
        const hasAll = [...tagAll].every((tag) => tagsSet.has(tag));
        if (!hasAll) return false;
    }

    if (marketingStatus.size > 0) {
        const currentMarketingStatus = toLower(customer.marketingOptInStatus || 'unknown');
        if (!marketingStatus.has(currentMarketingStatus)) return false;
    }

    if (commercialStatus.size > 0) {
        const currentCommercialStatus = toLower(customer.commercialStatus || customer.commercial_status || 'unknown');
        if (!commercialStatus.has(currentCommercialStatus)) return false;
    }

    return true;
}

async function loadCandidateCustomers(tenantId = DEFAULT_TENANT_ID, campaign = {}, filters = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const moduleFilter = normalizeModuleId(filters.moduleId || campaign.moduleId || '');
    const maxRecipients = toInt(filters.maxRecipients, DEFAULT_RECIPIENT_LIMIT, { min: 1, max: 10000 });

    if (getStorageDriver() !== 'postgres') {
        const customersStore = await readTenantJsonFile('customers.json', { tenantId: cleanTenantId, defaultValue: { items: [] } });
        const all = ensureArray(customersStore?.items).map((entry) => ({
            customerId: toText(entry.customerId),
            phone: toText(entry.phoneE164 || entry.phone),
            contactName: toText(entry.contactName),
            email: toText(entry.email),
            tags: ensureArray(entry.tags),
            marketingOptInStatus: toLower(entry.marketingOptInStatus || entry.marketing_opt_in_status || 'unknown'),
            moduleId: toText(entry.moduleId || entry.module_id || ''),
            preferredLanguage: toLower(entry.preferredLanguage || entry.preferred_language || 'es')
        }));
        return all
            .filter((item) => item.phone)
            .filter((item) => !moduleFilter || normalizeModuleId(item.moduleId) === moduleFilter)
            .filter((item) => customerMatchesFilters(item, filters))
            .slice(0, maxRecipients);
    }

    await ensurePostgresSchema();
    if (moduleFilter) {
        try {
            const contextRowsResult = await queryPostgres(
                `SELECT
                    c.customer_id,
                    c.phone_e164,
                    c.contact_name,
                    c.email,
                    c.preferred_language,
                    c.module_id AS customer_module_id,
                    cmc.module_id AS context_module_id,
                    cmc.marketing_opt_in_status,
                    cmc.commercial_status,
                    cmc.labels
                 FROM tenant_customer_module_contexts cmc
                 JOIN tenant_customers c
                   ON c.tenant_id = cmc.tenant_id
                  AND c.customer_id = cmc.customer_id
                 WHERE cmc.tenant_id = $1
                   AND LOWER(cmc.module_id) = LOWER($2)
                   AND COALESCE(c.phone_e164, '') <> ''
                   AND c.is_active = TRUE
                 ORDER BY COALESCE(cmc.updated_at, c.updated_at) DESC
                 LIMIT $3`,
                [cleanTenantId, moduleFilter, Math.max(maxRecipients * 3, 300)]
            );

            const contextRows = ensureArray(contextRowsResult?.rows).map((row) => ({
                customerId: toText(row.customer_id),
                phone: toText(row.phone_e164),
                contactName: toText(row.contact_name),
                email: toText(row.email),
                tags: ensureArray(row.labels),
                marketingOptInStatus: toLower(row.marketing_opt_in_status || 'unknown'),
                commercialStatus: toLower(row.commercial_status || 'unknown'),
                moduleId: toText(row.context_module_id || row.customer_module_id || ''),
                preferredLanguage: toLower(row.preferred_language || 'es')
            }));

            if (contextRows.length > 0) {
                return contextRows
                    .filter((item) => customerMatchesFilters(item, filters))
                    .slice(0, maxRecipients);
            }
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const params = [cleanTenantId];
    const where = [
        'tenant_id = $1',
        "COALESCE(phone_e164, '') <> ''",
        'is_active = TRUE'
    ];
    if (moduleFilter) {
        params.push(moduleFilter);
        where.push(`LOWER(module_id) = LOWER($${params.length})`);
    }

    const rowsResult = await queryPostgres(
        `SELECT customer_id, phone_e164, contact_name, email, tags, module_id, preferred_language, marketing_opt_in_status
           FROM tenant_customers
          WHERE ${where.join(' AND ')}
          ORDER BY updated_at DESC
          LIMIT $${params.length + 1}`,
        [...params, Math.max(maxRecipients * 3, 300)]
    );

    const rows = ensureArray(rowsResult?.rows).map((row) => ({
        customerId: toText(row.customer_id),
        phone: toText(row.phone_e164),
        contactName: toText(row.contact_name),
        email: toText(row.email),
        tags: ensureArray(row.tags),
        marketingOptInStatus: toLower(row.marketing_opt_in_status || 'unknown'),
        commercialStatus: 'unknown',
        moduleId: toText(row.module_id || ''),
        preferredLanguage: toLower(row.preferred_language || 'es')
    }));

    return rows
        .filter((item) => customerMatchesFilters(item, filters))
        .slice(0, maxRecipients);
}

function computeRecipientEligibility(candidates = [], existingRecipients = []) {
    const knownByPhone = new Set(ensureArray(existingRecipients).map((entry) => toText(entry.phone)));
    const knownByCustomer = new Set(
        ensureArray(existingRecipients)
            .map((entry) => toText(entry.customerId))
            .filter(Boolean)
    );

    let total = 0;
    const eligibleCustomers = [];

    for (const customer of ensureArray(candidates)) {
        const phone = toText(customer?.phone || '');
        if (!phone) continue;

        total += 1;
        const customerId = toText(customer?.customerId || '');
        if (knownByPhone.has(phone)) continue;
        if (customerId && knownByCustomer.has(customerId)) continue;

        eligibleCustomers.push(customer);
        knownByPhone.add(phone);
        if (customerId) knownByCustomer.add(customerId);
    }

    const eligible = eligibleCustomers.length;
    const excluded = Math.max(total - eligible, 0);
    return { total, eligible, excluded, eligibleCustomers };
}

function sanitizeEligibleCustomer(customer = {}) {
    const source = normalizeObject(customer);
    return {
        customerId: toText(source.customerId || '') || null,
        contactName: toText(source.contactName || '') || null,
        phone: toText(source.phone || '') || null,
        commercialStatus: toLower(source.commercialStatus || source.commercial_status || 'unknown') || 'unknown',
        tags: ensureArray(source.tags).map((entry) => toText(entry)).filter(Boolean),
        preferredLanguage: toLower(source.preferredLanguage || source.preferred_language || 'es') || 'es',
        marketingOptInStatus: toLower(source.marketingOptInStatus || source.marketing_opt_in_status || 'unknown') || 'unknown'
    };
}

async function estimateCampaign(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const source = normalizeObject(options);
    const campaignId = toText(source.campaignId || '');

    let campaign = null;
    if (campaignId) {
        campaign = await getCampaignById(cleanTenantId, campaignId);
        if (!campaign) throw new Error('Campana no encontrada.');
    }

    const filters = normalizeObject(source.filters || campaign?.audienceFiltersJson || {});
    const campaignContext = campaign
        ? campaign
        : {
            tenantId: cleanTenantId,
            campaignId: null,
            scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || ''),
            moduleId: normalizeModuleId(source.moduleId || ''),
            templateName: toText(source.templateName || ''),
            templateLanguage: toLower(source.templateLanguage || 'es') || 'es'
        };

    const candidates = await loadCandidateCustomers(cleanTenantId, campaignContext, filters);
    const existingRecipients = campaign?.campaignId
        ? await listCampaignRecipients(cleanTenantId, {
            campaignId: campaign.campaignId,
            limit: MAX_LIMIT,
            offset: 0
        })
        : { items: [] };

    const eligibility = computeRecipientEligibility(candidates, existingRecipients.items);

    return {
        tenantId: cleanTenantId,
        campaignId: campaign?.campaignId || null,
        scopeModuleId: campaignContext.scopeModuleId || '',
        moduleId: campaignContext.moduleId || null,
        filters,
        total: eligibility.total,
        eligible: eligibility.eligible,
        excluded: eligibility.excluded,
        items: ensureArray(eligibility.eligibleCustomers).map(sanitizeEligibleCustomer)
    };
}

async function listCampaignRecipients(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const campaignId = toText(options.campaignId || '');
    if (!campaignId) {
        return { items: [], total: 0, limit: normalizeLimit(options.limit), offset: normalizeOffset(options.offset) };
    }
    const status = toText(options.status || '');
    const moduleId = toText(options.moduleId || '');
    const search = toLower(options.search || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const filtered = store.recipients
            .filter((item) => item.campaignId === campaignId)
            .filter((item) => !status || item.status === normalizeRecipientStatus(status))
            .filter((item) => !moduleId || toText(item.moduleId) === moduleId)
            .filter((item) => !search || `${toLower(item.phone)} ${toLower(item.customerId || '')}`.includes(search))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return {
            items: filtered.slice(offset, offset + limit).map(sanitizeRecipient),
            total: filtered.length,
            limit,
            offset
        };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId, campaignId];
        const where = ['tenant_id = $1', 'campaign_id = $2'];
        if (status) {
            params.push(normalizeRecipientStatus(status));
            where.push(`status = $${params.length}`);
        }
        if (moduleId) {
            params.push(moduleId);
            where.push(`module_id = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            where.push(`(LOWER(phone) LIKE $${params.length} OR LOWER(COALESCE(customer_id, '')) LIKE $${params.length})`);
        }
        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(`SELECT COUNT(*)::BIGINT AS total FROM tenant_campaign_recipients WHERE ${whereSql}`, params);
        const rowsResult = await queryPostgres(
            `SELECT *
               FROM tenant_campaign_recipients
              WHERE ${whereSql}
              ORDER BY created_at DESC
              LIMIT $${params.length + 1}
              OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );
        return {
            items: ensureArray(rowsResult?.rows).map(mapRecipientRow),
            total: Number(totalResult?.rows?.[0]?.total || 0),
            limit,
            offset
        };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function getRecipientByIdempotencyKey(tenantId = DEFAULT_TENANT_ID, { idempotencyKey = '' } = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanIdempotencyKey = toText(idempotencyKey);
    if (!cleanIdempotencyKey) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const found = store.recipients.find((item) => toText(item.idempotencyKey) === cleanIdempotencyKey) || null;
        return found ? sanitizeRecipient(found) : null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT *
               FROM tenant_campaign_recipients
              WHERE tenant_id = $1
                AND idempotency_key = $2
              LIMIT 1`,
            [cleanTenantId, cleanIdempotencyKey]
        );
        const row = Array.isArray(result?.rows) ? result.rows[0] : null;
        return row ? mapRecipientRow(row) : null;
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function recomputeCampaignStats(tenantId = DEFAULT_TENANT_ID, { campaignId = '', markCompleted = true } = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanCampaignId = toText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido para recalcular stats.');

    const campaign = await getCampaignById(cleanTenantId, cleanCampaignId);
    if (!campaign) throw new Error('Campana no encontrada.');

    let counts = {
        total: 0,
        pending: 0,
        claimed: 0,
        sent: 0,
        failed: 0,
        skipped: 0
    };

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const recipients = store.recipients.filter((item) => item.campaignId === cleanCampaignId);
        counts.total = recipients.length;
        for (const item of recipients) {
            const status = normalizeRecipientStatus(item.status);
            if (status === 'pending') counts.pending += 1;
            if (status === 'claimed') counts.claimed += 1;
            if (status === 'sent') counts.sent += 1;
            if (status === 'failed') counts.failed += 1;
            if (status === 'skipped' || status === 'opted_out') counts.skipped += 1;
        }
    } else {
        const result = await queryPostgres(
            `SELECT
                COUNT(*)::INT AS total,
                COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending,
                COUNT(*) FILTER (WHERE status = 'claimed')::INT AS claimed,
                COUNT(*) FILTER (WHERE status = 'sent')::INT AS sent,
                COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed,
                COUNT(*) FILTER (WHERE status IN ('skipped', 'opted_out'))::INT AS skipped
             FROM tenant_campaign_recipients
             WHERE tenant_id = $1 AND campaign_id = $2`,
            [cleanTenantId, cleanCampaignId]
        );
        const row = result?.rows?.[0] || {};
        counts = {
            total: toInt(row.total, 0, { min: 0 }),
            pending: toInt(row.pending, 0, { min: 0 }),
            claimed: toInt(row.claimed, 0, { min: 0 }),
            sent: toInt(row.sent, 0, { min: 0 }),
            failed: toInt(row.failed, 0, { min: 0 }),
            skipped: toInt(row.skipped, 0, { min: 0 })
        };
    }

    let nextStatus = campaign.status;
    let completedAt = campaign.completedAt;
    if (
        markCompleted
        && counts.total > 0
        && counts.pending === 0
        && counts.claimed === 0
        && ['running', 'paused', 'scheduled'].includes(campaign.status)
    ) {
        nextStatus = 'completed';
        completedAt = completedAt || nowIso();
    }

    const updatedCampaign = await persistCampaignRecord(cleanTenantId, {
        ...campaign,
        totalRecipients: counts.total,
        pendingRecipients: counts.pending,
        claimedRecipients: counts.claimed,
        sentRecipients: counts.sent,
        failedRecipients: counts.failed,
        skippedRecipients: counts.skipped,
        status: nextStatus,
        completedAt,
        updatedAt: nowIso()
    });

    if (nextStatus === 'completed' && campaign.status !== 'completed') {
        await recordCampaignEvent(cleanTenantId, {
            campaignId: updatedCampaign.campaignId,
            moduleId: updatedCampaign.moduleId,
            eventType: 'campaign_completed',
            severity: 'info',
            actorType: 'system',
            message: 'Campana completada automaticamente',
            payloadJson: counts
        });
    }

    if (campaign.status !== updatedCampaign.status) {
        emitCampaignUpdated({
            tenantId: cleanTenantId,
            type: 'status',
            campaignId: updatedCampaign.campaignId,
            campaign: updatedCampaign,
            previousCampaign: campaign,
            previousStatus: campaign.status,
            status: updatedCampaign.status,
            reason: updatedCampaign.status === 'completed' ? 'campaign_completed' : 'campaign_status_changed',
            source: 'campaigns.recomputeCampaignStats',
            generatedAt: nowIso()
        });
    }

    return updatedCampaign;
}

async function enqueuePendingRecipientsForCampaign(tenantId = DEFAULT_TENANT_ID, campaign = null) {
    const cleanTenantId = normalizeTenant(tenantId);
    const targetCampaign = campaign || null;
    if (!targetCampaign?.campaignId) return { queued: 0 };

    const recipientsResult = await listCampaignRecipients(cleanTenantId, {
        campaignId: targetCampaign.campaignId,
        status: 'pending',
        limit: MAX_LIMIT,
        offset: 0
    });
    const pendingRecipients = ensureArray(recipientsResult.items);
    let queued = 0;

    for (const recipient of pendingRecipients) {
        const existingJob = await campaignQueueService.getJobByIdempotencyKey(cleanTenantId, recipient.idempotencyKey);
        const queueJob = await campaignQueueService.enqueueJob(cleanTenantId, {
            campaignId: targetCampaign.campaignId,
            recipientId: recipient.recipientId,
            phone: recipient.phone,
            moduleId: targetCampaign.moduleId,
            templateName: targetCampaign.templateName,
            templateLanguage: targetCampaign.templateLanguage,
            variablesJson: recipient.variablesJson,
            idempotencyKey: recipient.idempotencyKey,
            maxAttempts: recipient.maxAttempts,
            nextAttemptAt: recipient.nextAttemptAt || nowIso(),
            status: 'pending'
        });
        if (!existingJob && queueJob) {
            queued += 1;
            await recordCampaignEvent(cleanTenantId, {
                campaignId: targetCampaign.campaignId,
                recipientId: recipient.recipientId,
                customerId: recipient.customerId || null,
                phone: recipient.phone,
                moduleId: targetCampaign.moduleId,
                eventType: 'recipient_queued',
                severity: 'info',
                actorType: 'system',
                message: 'Job materializado en tenant_campaign_queue',
                payloadJson: {
                    idempotencyKey: recipient.idempotencyKey
                }
            });
        }
    }

    return { queued };
}

async function seedRecipientsFromFilters(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const campaignId = toText(options.campaignId || '');
    if (!campaignId) throw new Error('campaignId requerido para sembrar destinatarios.');

    const campaign = await getCampaignById(cleanTenantId, campaignId);
    if (!campaign) throw new Error('Campana no encontrada.');

    const filters = normalizeObject(options.filters || campaign.audienceFiltersJson);
    const enqueueQueue = options.enqueueQueue === true;
    const candidates = await loadCandidateCustomers(cleanTenantId, campaign, filters);
    const maxAttempts = toInt(options.maxAttempts, 3, { min: 1, max: 10 });
    const existingRecipients = await listCampaignRecipients(cleanTenantId, {
        campaignId: campaign.campaignId,
        limit: MAX_LIMIT,
        offset: 0
    });
    const eligibility = computeRecipientEligibility(candidates, existingRecipients.items);

    const insertedRecipients = [];
    for (const customer of eligibility.eligibleCustomers) {
        const phone = toText(customer.phone);

        const recipient = await persistRecipientRecord(cleanTenantId, {
            tenantId: cleanTenantId,
            campaignId: campaign.campaignId,
            recipientId: customer.customerId || randomId('rcp'),
            customerId: customer.customerId || null,
            phone,
            moduleId: campaign.moduleId,
            status: 'pending',
            idempotencyKey: normalizeIdempotencyKey(campaign.campaignId, campaign.moduleId, phone),
            variablesJson: {
                campaignId: campaign.campaignId,
                customerId: customer.customerId || null,
                languageCode: campaign.templateLanguage,
                preview: campaign.variablesPreviewJson || {},
                customer: {
                    customerId: customer.customerId || null,
                    contactName: customer.contactName || null,
                    phone,
                    preferredLanguage: customer.preferredLanguage || null
                }
            },
            attemptCount: 0,
            maxAttempts,
            nextAttemptAt: campaign.scheduledAt || nowIso(),
            createdAt: nowIso(),
            updatedAt: nowIso()
        });
        insertedRecipients.push(recipient);

        if (enqueueQueue) {
            const existingJob = await campaignQueueService.getJobByIdempotencyKey(cleanTenantId, recipient.idempotencyKey);
            const queueJob = await campaignQueueService.enqueueJob(cleanTenantId, {
                campaignId: campaign.campaignId,
                recipientId: recipient.recipientId,
                phone: recipient.phone,
                moduleId: campaign.moduleId,
                templateName: campaign.templateName,
                templateLanguage: campaign.templateLanguage,
                variablesJson: recipient.variablesJson,
                idempotencyKey: recipient.idempotencyKey,
                maxAttempts: recipient.maxAttempts,
                nextAttemptAt: recipient.nextAttemptAt || nowIso(),
                status: 'pending'
            });
            if (!existingJob && queueJob) {
                await recordCampaignEvent(cleanTenantId, {
                    campaignId: campaign.campaignId,
                    recipientId: recipient.recipientId,
                    customerId: recipient.customerId,
                    phone: recipient.phone,
                    moduleId: campaign.moduleId,
                    eventType: 'recipient_queued',
                    severity: 'info',
                    actorType: options.actorUserId ? 'user' : 'system',
                    actorId: toNullableText(options.actorUserId),
                    message: 'Destinatario encolado para campana',
                    payloadJson: {
                        idempotencyKey: recipient.idempotencyKey
                    }
                });
            }
        }
    }

    const refreshedCampaign = await recomputeCampaignStats(cleanTenantId, { campaignId: campaign.campaignId, markCompleted: false });
    return {
        campaign: refreshedCampaign,
        insertedCount: insertedRecipients.length,
        insertedRecipients
    };
}

async function applyQueueJobUpdate(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const queueJob = normalizeObject(options.queueJob);
    const idempotencyKey = toText(queueJob.idempotencyKey || options.idempotencyKey || '');
    if (!idempotencyKey) return null;

    const job = queueJob.idempotencyKey
        ? queueJob
        : (await campaignQueueService.getJobByIdempotencyKey(cleanTenantId, idempotencyKey));
    if (!job || !toText(job.campaignId)) return null;

    const recipient = await getRecipientByIdempotencyKey(cleanTenantId, { idempotencyKey });
    if (!recipient) return null;

    const now = nowIso();
    const nextStatus = normalizeRecipientStatus(job.status || recipient.status);
    const nextRecipient = sanitizeRecipient({
        ...recipient,
        status: nextStatus,
        attemptCount: toInt(job.attemptCount ?? recipient.attemptCount, 0, { min: 0 }),
        maxAttempts: toInt(job.maxAttempts ?? recipient.maxAttempts, recipient.maxAttempts || 3, { min: 1 }),
        nextAttemptAt: job.nextAttemptAt || recipient.nextAttemptAt || now,
        claimedAt: nextStatus === 'claimed' ? (job.claimedAt || recipient.claimedAt || now) : null,
        sentAt: nextStatus === 'sent' ? (recipient.sentAt || now) : recipient.sentAt,
        failedAt: nextStatus === 'failed' ? (recipient.failedAt || now) : recipient.failedAt,
        skippedAt: nextStatus === 'skipped' ? (recipient.skippedAt || now) : recipient.skippedAt,
        lastError: job.lastError !== undefined ? toNullableText(job.lastError) : recipient.lastError,
        skipReason: nextStatus === 'skipped'
            ? (toNullableText(options.reason || job.lastError || recipient.skipReason || 'skipped') || 'skipped')
            : recipient.skipReason,
        updatedAt: now
    });

    const changed = (
        nextRecipient.status !== recipient.status
        || nextRecipient.attemptCount !== recipient.attemptCount
        || toText(nextRecipient.nextAttemptAt) !== toText(recipient.nextAttemptAt)
        || toText(nextRecipient.lastError || '') !== toText(recipient.lastError || '')
        || toText(nextRecipient.claimedAt || '') !== toText(recipient.claimedAt || '')
    );

    if (!changed) {
        return { campaign: await recomputeCampaignStats(cleanTenantId, { campaignId: recipient.campaignId, markCompleted: true }), recipient };
    }

    const persistedRecipient = await persistRecipientRecord(cleanTenantId, nextRecipient);

    let eventType = '';
    let severity = 'info';
    let message = '';
    if (nextStatus === 'claimed') {
        eventType = 'recipient_claimed';
        message = 'Destinatario tomado por worker';
    } else if (nextStatus === 'sent') {
        eventType = 'recipient_sent';
        message = 'Template enviado al destinatario';
    } else if (nextStatus === 'skipped') {
        eventType = 'recipient_skipped';
        severity = 'warn';
        message = 'Destinatario omitido por politica/estado';
    } else if (nextStatus === 'failed') {
        eventType = 'recipient_failed';
        severity = 'error';
        message = 'Destinatario fallo definitivamente';
    } else if (nextStatus === 'pending' && toText(nextRecipient.lastError || '')) {
        eventType = 'recipient_failed';
        severity = 'warn';
        message = 'Fallo transitorio, reintento programado';
    }

    if (eventType) {
        await recordCampaignEvent(cleanTenantId, {
            campaignId: persistedRecipient.campaignId,
            recipientId: persistedRecipient.recipientId,
            customerId: persistedRecipient.customerId,
            phone: persistedRecipient.phone,
            moduleId: persistedRecipient.moduleId,
            eventType,
            severity,
            actorType: toLower(options.actorType || 'worker') || 'worker',
            actorId: toNullableText(options.actorId),
            reason: toNullableText(options.reason || nextRecipient.lastError),
            message,
            payloadJson: {
                status: nextStatus,
                attemptCount: nextRecipient.attemptCount,
                maxAttempts: nextRecipient.maxAttempts,
                nextAttemptAt: nextRecipient.nextAttemptAt,
                idempotencyKey
            }
        });
    }

    const campaign = await recomputeCampaignStats(cleanTenantId, {
        campaignId: persistedRecipient.campaignId,
        markCompleted: true
    });

    if (['sent', 'failed', 'skipped'].includes(nextStatus)) {
        emitCampaignUpdated({
            tenantId: cleanTenantId,
            type: 'progress',
            campaignId: persistedRecipient.campaignId,
            campaign,
            recipient: persistedRecipient,
            recipientStatus: nextStatus,
            reason: toNullableText(options.reason || nextRecipient.lastError || nextStatus) || nextStatus,
            source: 'campaigns.applyQueueJobUpdate',
            generatedAt: nowIso()
        });
    }

    return { campaign, recipient: persistedRecipient };
}

async function startCampaign(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const campaignId = toText(options.campaignId || '');
    if (!campaignId) throw new Error('campaignId requerido para iniciar campana.');

    const campaign = await getCampaignById(cleanTenantId, campaignId);
    if (!campaign) throw new Error('Campana no encontrada.');
    if (campaign.status === 'cancelled') throw new Error('No se puede iniciar una campana cancelada.');
    if (campaign.status === 'completed') throw new Error('No se puede iniciar una campana completada.');

    let workingCampaign = campaign;
    if (toInt(campaign.totalRecipients, 0, { min: 0 }) === 0 && options.seedIfEmpty !== false) {
        const seeded = await seedRecipientsFromFilters(cleanTenantId, {
            campaignId: campaign.campaignId,
            filters: campaign.audienceFiltersJson,
            actorUserId: options.actorUserId || null
        });
        workingCampaign = seeded.campaign;
    }

    const startedAt = workingCampaign.startedAt || nowIso();
    const updated = await persistCampaignRecord(cleanTenantId, {
        ...workingCampaign,
        moduleId: normalizeModuleId(options.moduleId || workingCampaign.moduleId),
        status: 'running',
        startedAt,
        updatedBy: options.actorUserId || workingCampaign.updatedBy,
        updatedAt: nowIso()
    });

    await enqueuePendingRecipientsForCampaign(cleanTenantId, updated);
    await recordCampaignEvent(cleanTenantId, {
        campaignId: updated.campaignId,
        moduleId: updated.moduleId,
        eventType: 'campaign_started',
        severity: 'info',
        actorType: options.actorUserId ? 'user' : 'system',
        actorId: toNullableText(options.actorUserId),
        message: 'Campana iniciada',
        payloadJson: {
            recipients: updated.totalRecipients
        }
    });

    const finalCampaign = await recomputeCampaignStats(cleanTenantId, { campaignId: updated.campaignId, markCompleted: true });
    emitCampaignUpdated({
        tenantId: cleanTenantId,
        type: 'status',
        campaignId: finalCampaign?.campaignId || updated.campaignId,
        campaign: finalCampaign || updated,
        previousCampaign: campaign,
        previousStatus: campaign.status,
        status: (finalCampaign || updated).status,
        reason: 'campaign_started',
        source: 'campaigns.startCampaign',
        generatedAt: nowIso()
    });
    return finalCampaign;
}

async function pauseCampaign(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const campaignId = toText(options.campaignId || '');
    if (!campaignId) throw new Error('campaignId requerido para pausar campana.');

    const campaign = await getCampaignById(cleanTenantId, campaignId);
    if (!campaign) throw new Error('Campana no encontrada.');

    const updated = await persistCampaignRecord(cleanTenantId, {
        ...campaign,
        status: 'paused',
        updatedBy: options.actorUserId || campaign.updatedBy,
        updatedAt: nowIso()
    });

    await recordCampaignEvent(cleanTenantId, {
        campaignId: updated.campaignId,
        moduleId: updated.moduleId,
        eventType: 'campaign_paused',
        severity: 'info',
        actorType: options.actorUserId ? 'user' : 'system',
        actorId: toNullableText(options.actorUserId),
        message: 'Campana pausada',
        payloadJson: {}
    });

    emitCampaignUpdated({
        tenantId: cleanTenantId,
        type: 'status',
        campaignId: updated.campaignId,
        campaign: updated,
        previousCampaign: campaign,
        previousStatus: campaign.status,
        status: updated.status,
        reason: 'campaign_paused',
        source: 'campaigns.pauseCampaign',
        generatedAt: nowIso()
    });

    return updated;
}

async function resumeCampaign(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const campaignId = toText(options.campaignId || '');
    if (!campaignId) throw new Error('campaignId requerido para reanudar campana.');

    const campaign = await getCampaignById(cleanTenantId, campaignId);
    if (!campaign) throw new Error('Campana no encontrada.');
    if (campaign.status === 'cancelled') throw new Error('No se puede reanudar una campana cancelada.');
    if (campaign.status === 'completed') throw new Error('No se puede reanudar una campana completada.');

    const updated = await persistCampaignRecord(cleanTenantId, {
        ...campaign,
        status: 'running',
        startedAt: campaign.startedAt || nowIso(),
        updatedBy: options.actorUserId || campaign.updatedBy,
        updatedAt: nowIso()
    });

    await enqueuePendingRecipientsForCampaign(cleanTenantId, updated);
    await recordCampaignEvent(cleanTenantId, {
        campaignId: updated.campaignId,
        moduleId: updated.moduleId,
        eventType: 'campaign_resumed',
        severity: 'info',
        actorType: options.actorUserId ? 'user' : 'system',
        actorId: toNullableText(options.actorUserId),
        message: 'Campana reanudada',
        payloadJson: {}
    });

    emitCampaignUpdated({
        tenantId: cleanTenantId,
        type: 'status',
        campaignId: updated.campaignId,
        campaign: updated,
        previousCampaign: campaign,
        previousStatus: campaign.status,
        status: updated.status,
        reason: 'campaign_resumed',
        source: 'campaigns.resumeCampaign',
        generatedAt: nowIso()
    });

    return updated;
}

async function cancelCampaign(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const campaignId = toText(options.campaignId || '');
    if (!campaignId) throw new Error('campaignId requerido para cancelar campana.');

    const campaign = await getCampaignById(cleanTenantId, campaignId);
    if (!campaign) throw new Error('Campana no encontrada.');

    const cancelledAt = nowIso();
    if (getStorageDriver() !== 'postgres') {
        const store = await readStore(cleanTenantId);
        const recipients = store.recipients.map((item) => {
            if (item.campaignId !== campaignId) return item;
            const status = normalizeRecipientStatus(item.status);
            if (status !== 'pending' && status !== 'claimed') return item;
            return sanitizeRecipient({
                ...item,
                status: 'skipped',
                skipReason: item.skipReason || 'campaign_cancelled',
                skippedAt: cancelledAt,
                updatedAt: cancelledAt
            });
        });
        await writeStore(cleanTenantId, { ...store, recipients });
    } else {
        await ensurePostgresSchema();
        await queryPostgres(
            `UPDATE tenant_campaign_recipients
                SET status = 'skipped',
                    skip_reason = COALESCE(skip_reason, 'campaign_cancelled'),
                    skipped_at = COALESCE(skipped_at, NOW()),
                    updated_at = NOW()
              WHERE tenant_id = $1
                AND campaign_id = $2
                AND status IN ('pending', 'claimed')`,
            [cleanTenantId, campaignId]
        );
    }

    const updated = await persistCampaignRecord(cleanTenantId, {
        ...campaign,
        status: 'cancelled',
        cancelledAt,
        updatedBy: options.actorUserId || campaign.updatedBy,
        updatedAt: cancelledAt
    });

    await recordCampaignEvent(cleanTenantId, {
        campaignId: updated.campaignId,
        moduleId: updated.moduleId,
        eventType: 'campaign_cancelled',
        severity: 'warn',
        actorType: options.actorUserId ? 'user' : 'system',
        actorId: toNullableText(options.actorUserId),
        reason: toNullableText(options.reason || 'cancelled'),
        message: 'Campana cancelada',
        payloadJson: {}
    });

    const finalCampaign = await recomputeCampaignStats(cleanTenantId, { campaignId: updated.campaignId, markCompleted: false });
    emitCampaignUpdated({
        tenantId: cleanTenantId,
        type: 'status',
        campaignId: finalCampaign?.campaignId || updated.campaignId,
        campaign: finalCampaign || updated,
        previousCampaign: campaign,
        previousStatus: campaign.status,
        status: (finalCampaign || updated).status,
        reason: 'campaign_cancelled',
        source: 'campaigns.cancelCampaign',
        generatedAt: nowIso()
    });
    return finalCampaign;
}

module.exports = {
    createCampaign,
    updateCampaign,
    getCampaignById,
    listCampaigns,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    estimateCampaign,
    seedRecipientsFromFilters,
    listCampaignRecipients,
    recordCampaignEvent,
    listCampaignEvents,
    recomputeCampaignStats,
    applyQueueJobUpdate,
    onCampaignUpdated
};
