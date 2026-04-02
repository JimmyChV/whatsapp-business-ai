const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const STORE_FILE = 'template_webhook_events.json';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const VALID_EVENT_TYPES = new Set(['status_update', 'quality_update', 'category_update']);

let schemaReady = false;
let schemaPromise = null;

function nowIso() {
    return new Date().toISOString();
}

function createId(prefix = 'evt') {
    return `${String(prefix || 'evt').trim().toLowerCase() || 'evt'}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
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

function normalizeEventType(value = '') {
    const normalized = toLower(value);
    if (VALID_EVENT_TYPES.has(normalized)) return normalized;
    return 'status_update';
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

function normalizeOffset(value = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

function normalizeTemplateEventRecord(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const receivedAt = toIso(source.receivedAt || source.received_at) || nowIso();
    return {
        eventId: toText(source.eventId || source.event_id) || createId('tmpl_evt'),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id),
        wabaId: toNullableText(source.wabaId || source.waba_id),
        templateName: toNullableText(source.templateName || source.template_name),
        templateId: toNullableText(source.templateId || source.template_id),
        eventType: normalizeEventType(source.eventType || source.event_type),
        previousStatus: toNullableText(source.previousStatus || source.previous_status),
        newStatus: toNullableText(source.newStatus || source.new_status),
        reason: toNullableText(source.reason),
        rawPayload: normalizeObject(source.rawPayload || source.raw_payload),
        receivedAt
    };
}

function normalizeStore(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const items = Array.isArray(source.items)
        ? source.items.map((entry) => normalizeTemplateEventRecord(entry)).filter((entry) => entry.eventId)
        : [];
    return { items };
}

function toPublicRecord(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    return {
        eventId: toText(source.eventId),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId),
        wabaId: toNullableText(source.wabaId),
        templateName: toNullableText(source.templateName),
        templateId: toNullableText(source.templateId),
        eventType: normalizeEventType(source.eventType),
        previousStatus: toNullableText(source.previousStatus),
        newStatus: toNullableText(source.newStatus),
        reason: toNullableText(source.reason),
        rawPayload: normalizeObject(source.rawPayload),
        receivedAt: toIso(source.receivedAt)
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
            CREATE TABLE IF NOT EXISTS tenant_template_webhook_events (
                event_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                scope_module_id TEXT NOT NULL DEFAULT '',
                waba_id TEXT NULL,
                template_name TEXT NULL,
                template_id TEXT NULL,
                event_type TEXT NOT NULL CHECK (event_type IN ('status_update', 'quality_update', 'category_update')),
                previous_status TEXT NULL,
                new_status TEXT NULL,
                reason TEXT NULL,
                raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, event_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_template_webhook_events_type
            ON tenant_template_webhook_events(tenant_id, event_type, received_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_template_webhook_events_template
            ON tenant_template_webhook_events(tenant_id, template_name, received_at DESC)
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

async function getEventById(tenantId = DEFAULT_TENANT_ID, eventId = '') {
    const cleanTenantId = resolveTenantId(tenantId);
    const cleanEventId = toText(eventId);
    if (!cleanEventId) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const item = store.items.find((entry) => entry.eventId === cleanEventId);
        return item ? toPublicRecord(item) : null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT event_id, scope_module_id, waba_id, template_name, template_id, event_type,
                    previous_status, new_status, reason, raw_payload, received_at
               FROM tenant_template_webhook_events
              WHERE tenant_id = $1
                AND event_id = $2
              LIMIT 1`,
            [cleanTenantId, cleanEventId]
        );
        const row = Array.isArray(result?.rows) && result.rows[0] ? result.rows[0] : null;
        if (!row) return null;
        return toPublicRecord({
            eventId: row.event_id,
            scopeModuleId: row.scope_module_id,
            wabaId: row.waba_id,
            templateName: row.template_name,
            templateId: row.template_id,
            eventType: row.event_type,
            previousStatus: row.previous_status,
            newStatus: row.new_status,
            reason: row.reason,
            rawPayload: row.raw_payload,
            receivedAt: row.received_at
        });
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function recordTemplateWebhookEvent(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const clean = normalizeTemplateEventRecord(payload);
    if (!clean.eventId) throw new Error('eventId requerido para registrar evento de template.');

    const existing = await getEventById(cleanTenantId, clean.eventId);
    if (existing) return existing;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        store.items.push(clean);
        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        return toPublicRecord(clean);
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `INSERT INTO tenant_template_webhook_events (
            event_id, tenant_id, scope_module_id, waba_id, template_name, template_id,
            event_type, previous_status, new_status, reason, raw_payload, received_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11::jsonb, $12::timestamptz
        )
        ON CONFLICT (tenant_id, event_id)
        DO NOTHING
        RETURNING event_id, scope_module_id, waba_id, template_name, template_id, event_type, previous_status, new_status, reason, raw_payload, received_at`,
        [
            clean.eventId,
            cleanTenantId,
            clean.scopeModuleId || '',
            clean.wabaId,
            clean.templateName,
            clean.templateId,
            clean.eventType,
            clean.previousStatus,
            clean.newStatus,
            clean.reason,
            JSON.stringify(clean.rawPayload || {}),
            clean.receivedAt
        ]
    );

    const row = result?.rows?.[0] || null;
    if (row) {
        return toPublicRecord({
            eventId: row.event_id,
            scopeModuleId: row.scope_module_id,
            wabaId: row.waba_id,
            templateName: row.template_name,
            templateId: row.template_id,
            eventType: row.event_type,
            previousStatus: row.previous_status,
            newStatus: row.new_status,
            reason: row.reason,
            rawPayload: row.raw_payload,
            receivedAt: row.received_at
        });
    }
    return getEventById(cleanTenantId, clean.eventId);
}

async function listTemplateWebhookEvents(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const scopeModuleId = normalizeScopeModuleId(options.scopeModuleId || '');
    const eventType = toLower(options.eventType || '');
    const templateName = toText(options.templateName || '');
    const wabaId = toText(options.wabaId || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.items
            .filter((entry) => !scopeModuleId || entry.scopeModuleId === scopeModuleId)
            .filter((entry) => !eventType || entry.eventType === normalizeEventType(eventType))
            .filter((entry) => !templateName || toText(entry.templateName) === templateName)
            .filter((entry) => !wabaId || toText(entry.wabaId) === wabaId)
            .sort((a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')));
        const items = filtered.slice(offset, offset + limit).map((entry) => toPublicRecord(entry));
        return { items, total: filtered.length, limit, offset };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];

        if (scopeModuleId) {
            params.push(scopeModuleId);
            where.push(`scope_module_id = $${params.length}`);
        }
        if (eventType) {
            params.push(normalizeEventType(eventType));
            where.push(`event_type = $${params.length}`);
        }
        if (templateName) {
            params.push(templateName);
            where.push(`template_name = $${params.length}`);
        }
        if (wabaId) {
            params.push(wabaId);
            where.push(`waba_id = $${params.length}`);
        }

        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(
            `SELECT COUNT(*)::BIGINT AS total
               FROM tenant_template_webhook_events
              WHERE ${whereSql}`,
            params
        );

        const rowParams = [...params, limit, offset];
        const rowsResult = await queryPostgres(
            `SELECT event_id, scope_module_id, waba_id, template_name, template_id, event_type,
                    previous_status, new_status, reason, raw_payload, received_at
               FROM tenant_template_webhook_events
              WHERE ${whereSql}
              ORDER BY received_at DESC
              LIMIT $${rowParams.length - 1}
              OFFSET $${rowParams.length}`,
            rowParams
        );

        const items = (Array.isArray(rowsResult?.rows) ? rowsResult.rows : []).map((row) => toPublicRecord({
            eventId: row.event_id,
            scopeModuleId: row.scope_module_id,
            wabaId: row.waba_id,
            templateName: row.template_name,
            templateId: row.template_id,
            eventType: row.event_type,
            previousStatus: row.previous_status,
            newStatus: row.new_status,
            reason: row.reason,
            rawPayload: row.raw_payload,
            receivedAt: row.received_at
        }));
        const total = Number(totalResult?.rows?.[0]?.total || 0);
        return { items, total, limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function getLatestTemplateEvent(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const { items } = await listTemplateWebhookEvents(tenantId, {
        scopeModuleId: options.scopeModuleId || '',
        eventType: options.eventType || '',
        templateName: options.templateName || '',
        wabaId: options.wabaId || '',
        limit: 1,
        offset: 0
    });
    return Array.isArray(items) && items[0] ? items[0] : null;
}

module.exports = {
    recordTemplateWebhookEvent,
    listTemplateWebhookEvents,
    getLatestTemplateEvent
};

