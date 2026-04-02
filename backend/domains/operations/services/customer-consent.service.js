const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const STORE_FILE = 'customer_consents.json';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const VALID_CONSENT_TYPES = new Set(['marketing', 'transactional']);
const VALID_STATUSES = new Set(['granted', 'revoked']);
const VALID_SOURCES = new Set(['manual', 'import', 'api', 'webhook']);

let schemaReady = false;
let schemaPromise = null;

function nowIso() {
    return new Date().toISOString();
}

function createId(prefix = 'consent') {
    const clean = String(prefix || 'consent').trim().toLowerCase() || 'consent';
    return `${clean}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
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

function normalizeConsentType(value = '') {
    const normalized = toLower(value);
    if (VALID_CONSENT_TYPES.has(normalized)) return normalized;
    return 'marketing';
}

function normalizeStatus(value = '') {
    const normalized = toLower(value);
    if (VALID_STATUSES.has(normalized)) return normalized;
    return 'granted';
}

function normalizeSource(value = '') {
    const normalized = toLower(value);
    if (VALID_SOURCES.has(normalized)) return normalized;
    return 'manual';
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

function normalizeConsentRecord(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const status = normalizeStatus(source.status);
    const grantedAt = toIso(source.grantedAt || source.granted_at);
    const revokedAt = toIso(source.revokedAt || source.revoked_at);
    const createdAt = toIso(source.createdAt || source.created_at) || nowIso();

    return {
        consentId: toText(source.consentId || source.consent_id) || createId('consent'),
        customerId: toText(source.customerId || source.customer_id),
        consentType: normalizeConsentType(source.consentType || source.consent_type),
        status,
        source: normalizeSource(source.source),
        proofPayload: normalizeObject(source.proofPayload || source.proof_payload),
        grantedAt: status === 'granted' ? (grantedAt || createdAt) : (grantedAt || null),
        revokedAt: status === 'revoked' ? (revokedAt || createdAt) : (revokedAt || null),
        createdAt
    };
}

function normalizeStore(input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const items = Array.isArray(source.items)
        ? source.items
            .map((entry) => normalizeConsentRecord(entry))
            .filter((entry) => entry.customerId)
        : [];
    return { items };
}

function toPublicRecord(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    return {
        consentId: toText(source.consentId),
        customerId: toText(source.customerId),
        consentType: normalizeConsentType(source.consentType),
        status: normalizeStatus(source.status),
        source: normalizeSource(source.source),
        proofPayload: normalizeObject(source.proofPayload),
        grantedAt: toIso(source.grantedAt),
        revokedAt: toIso(source.revokedAt),
        createdAt: toIso(source.createdAt)
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
            CREATE TABLE IF NOT EXISTS tenant_customer_consents (
                consent_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                customer_id TEXT NOT NULL,
                consent_type TEXT NOT NULL CHECK (consent_type IN ('marketing', 'transactional')),
                status TEXT NOT NULL CHECK (status IN ('granted', 'revoked')),
                source TEXT NOT NULL CHECK (source IN ('manual', 'import', 'api', 'webhook')),
                proof_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                granted_at TIMESTAMPTZ NULL,
                revoked_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, consent_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_customer_consents_customer
            ON tenant_customer_consents(tenant_id, customer_id, created_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_customer_consents_status
            ON tenant_customer_consents(tenant_id, consent_type, status, created_at DESC)
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

async function getLatestConsent(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const customerId = toText(options.customerId || options);
    const consentType = normalizeConsentType(options.consentType || 'marketing');
    if (!customerId) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const items = store.items
            .filter((entry) => entry.customerId === customerId)
            .filter((entry) => entry.consentType === consentType)
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return items[0] ? toPublicRecord(items[0]) : null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT consent_id, customer_id, consent_type, status, source, proof_payload, granted_at, revoked_at, created_at
               FROM tenant_customer_consents
              WHERE tenant_id = $1
                AND customer_id = $2
                AND consent_type = $3
              ORDER BY created_at DESC
              LIMIT 1`,
            [cleanTenantId, customerId, consentType]
        );

        const row = Array.isArray(result?.rows) && result.rows[0] ? result.rows[0] : null;
        if (!row) return null;
        return toPublicRecord({
            consentId: row.consent_id,
            customerId: row.customer_id,
            consentType: row.consent_type,
            status: row.status,
            source: row.source,
            proofPayload: row.proof_payload,
            grantedAt: row.granted_at,
            revokedAt: row.revoked_at,
            createdAt: row.created_at
        });
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function listConsents(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const customerId = toText(options.customerId || '');
    const consentType = toLower(options.consentType || '');
    const status = toLower(options.status || '');
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.items
            .filter((entry) => !customerId || entry.customerId === customerId)
            .filter((entry) => !consentType || entry.consentType === normalizeConsentType(consentType))
            .filter((entry) => !status || entry.status === normalizeStatus(status))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const items = filtered.slice(offset, offset + limit).map((entry) => toPublicRecord(entry));
        return { items, total: filtered.length, limit, offset };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];

        if (customerId) {
            params.push(customerId);
            where.push(`customer_id = $${params.length}`);
        }
        if (consentType) {
            params.push(normalizeConsentType(consentType));
            where.push(`consent_type = $${params.length}`);
        }
        if (status) {
            params.push(normalizeStatus(status));
            where.push(`status = $${params.length}`);
        }

        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(
            `SELECT COUNT(*)::BIGINT AS total
               FROM tenant_customer_consents
              WHERE ${whereSql}`,
            params
        );

        const rowParams = [...params, limit, offset];
        const rowsResult = await queryPostgres(
            `SELECT consent_id, customer_id, consent_type, status, source, proof_payload, granted_at, revoked_at, created_at
               FROM tenant_customer_consents
              WHERE ${whereSql}
              ORDER BY created_at DESC
              LIMIT $${rowParams.length - 1}
              OFFSET $${rowParams.length}`,
            rowParams
        );

        const items = (Array.isArray(rowsResult?.rows) ? rowsResult.rows : []).map((row) => toPublicRecord({
            consentId: row.consent_id,
            customerId: row.customer_id,
            consentType: row.consent_type,
            status: row.status,
            source: row.source,
            proofPayload: row.proof_payload,
            grantedAt: row.granted_at,
            revokedAt: row.revoked_at,
            createdAt: row.created_at
        }));
        const total = Number(totalResult?.rows?.[0]?.total || 0);
        return { items, total, limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function insertConsent(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const clean = normalizeConsentRecord(payload);
    if (!clean.customerId) throw new Error('customerId requerido para registrar consentimiento.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const index = store.items.findIndex((entry) => entry.consentId === clean.consentId);
        if (index >= 0) {
            const merged = {
                ...store.items[index],
                ...clean,
                createdAt: store.items[index].createdAt || clean.createdAt
            };
            store.items[index] = normalizeConsentRecord(merged);
        } else {
            store.items.push(clean);
        }
        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        const out = store.items.find((entry) => entry.consentId === clean.consentId) || clean;
        return toPublicRecord(out);
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `INSERT INTO tenant_customer_consents (
            consent_id, tenant_id, customer_id, consent_type, status, source, proof_payload, granted_at, revoked_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz, $10::timestamptz)
        ON CONFLICT (tenant_id, consent_id)
        DO UPDATE SET
            customer_id = EXCLUDED.customer_id,
            consent_type = EXCLUDED.consent_type,
            status = EXCLUDED.status,
            source = EXCLUDED.source,
            proof_payload = COALESCE(tenant_customer_consents.proof_payload, '{}'::jsonb) || COALESCE(EXCLUDED.proof_payload, '{}'::jsonb),
            granted_at = COALESCE(EXCLUDED.granted_at, tenant_customer_consents.granted_at),
            revoked_at = COALESCE(EXCLUDED.revoked_at, tenant_customer_consents.revoked_at)
        RETURNING consent_id, customer_id, consent_type, status, source, proof_payload, granted_at, revoked_at, created_at`,
        [
            clean.consentId,
            cleanTenantId,
            clean.customerId,
            clean.consentType,
            clean.status,
            clean.source,
            JSON.stringify(clean.proofPayload || {}),
            clean.grantedAt,
            clean.revokedAt,
            clean.createdAt
        ]
    );

    const row = result?.rows?.[0] || null;
    return toPublicRecord({
        consentId: row?.consent_id,
        customerId: row?.customer_id,
        consentType: row?.consent_type,
        status: row?.status,
        source: row?.source,
        proofPayload: row?.proof_payload,
        grantedAt: row?.granted_at,
        revokedAt: row?.revoked_at,
        createdAt: row?.created_at
    });
}

async function grantConsent(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const customerId = toText(payload.customerId || payload.customer_id);
    const consentType = normalizeConsentType(payload.consentType || payload.consent_type || 'marketing');
    if (!customerId) throw new Error('customerId requerido para otorgar consentimiento.');

    const latest = await getLatestConsent(tenantId, { customerId, consentType });
    if (latest && latest.status === 'granted') return latest;

    return insertConsent(tenantId, {
        consentId: payload.consentId || payload.consent_id || createId('consent'),
        customerId,
        consentType,
        status: 'granted',
        source: payload.source,
        proofPayload: payload.proofPayload || payload.proof_payload,
        grantedAt: payload.grantedAt || payload.granted_at || nowIso(),
        createdAt: payload.createdAt || payload.created_at || nowIso()
    });
}

async function revokeConsent(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const customerId = toText(payload.customerId || payload.customer_id);
    const consentType = normalizeConsentType(payload.consentType || payload.consent_type || 'marketing');
    if (!customerId) throw new Error('customerId requerido para revocar consentimiento.');

    const latest = await getLatestConsent(tenantId, { customerId, consentType });
    if (latest && latest.status === 'revoked') return latest;

    return insertConsent(tenantId, {
        consentId: payload.consentId || payload.consent_id || createId('consent'),
        customerId,
        consentType,
        status: 'revoked',
        source: payload.source,
        proofPayload: payload.proofPayload || payload.proof_payload,
        revokedAt: payload.revokedAt || payload.revoked_at || nowIso(),
        createdAt: payload.createdAt || payload.created_at || nowIso()
    });
}

async function hasMarketingConsent(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const latest = await getLatestConsent(tenantId, {
        customerId: options.customerId || options,
        consentType: 'marketing'
    });
    return Boolean(latest && latest.status === 'granted');
}

module.exports = {
    grantConsent,
    revokeConsent,
    getLatestConsent,
    listConsents,
    hasMarketingConsent
};

