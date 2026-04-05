const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const STORE_FILE = 'customer_module_contexts.json';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const VALID_OPT_IN = new Set(['unknown', 'opted_in', 'opted_out']);
const VALID_COMMERCIAL = new Set(['unknown', 'nuevo', 'en_conversacion', 'cotizado', 'vendido', 'perdido']);

let schemaReady = false;
let schemaPromise = null;

function nowIso() { return new Date().toISOString(); }
function resolveTenantId(input = null) {
    if (typeof input === 'string') return normalizeTenantId(input || DEFAULT_TENANT_ID);
    if (input && typeof input === 'object') return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    return DEFAULT_TENANT_ID;
}
function toText(v = '') { return String(v ?? '').trim(); }
function toLower(v = '') { return toText(v).toLowerCase(); }
function toNullable(v = '') { const t = toText(v); return t || null; }
function toIso(v = '') {
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
    const t = toText(v); if (!t) return null;
    const d = new Date(t); return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function normalizeCustomerId(v = '') { return toText(v); }
function normalizeModuleId(v = '') { return toText(v); }
function normalizeOptIn(v = '') { const n = toLower(v); return VALID_OPT_IN.has(n) ? n : 'unknown'; }
function normalizeCommercial(v = '') { const n = toLower(v); return VALID_COMMERCIAL.has(n) ? n : 'unknown'; }
function normalizeMetadata(v = {}) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
function normalizeLimit(v = DEFAULT_LIMIT) {
    const n = Number(v || DEFAULT_LIMIT); if (!Number.isFinite(n)) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}
function normalizeOffset(v = 0) {
    const n = Number(v || 0); if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}
function normalizeLabels(v = []) {
    const arr = Array.isArray(v) ? v : [];
    const seen = new Set(); const out = [];
    arr.forEach((entry) => {
        const t = toText(entry); if (!t) return;
        const k = t.toLowerCase(); if (seen.has(k)) return;
        seen.add(k); out.push(t);
    });
    return out;
}
function toList(v = null) {
    if (Array.isArray(v)) return v.map((x) => toText(x)).filter(Boolean);
    const t = toText(v); if (!t) return [];
    return t.split(',').map((x) => toText(x)).filter(Boolean);
}
function contextKey(customerId = '', moduleId = '') { return `${normalizeCustomerId(customerId)}::${normalizeModuleId(moduleId)}`; }
function missingRelation(error) { return String(error?.code || '').trim() === '42P01'; }

function normalizeRecord(input = {}) {
    const s = (input && typeof input === 'object') ? input : {};
    const createdAt = toIso(s.createdAt || s.created_at) || nowIso();
    const updatedAt = toIso(s.updatedAt || s.updated_at) || createdAt;
    return {
        customerId: normalizeCustomerId(s.customerId || s.customer_id),
        moduleId: normalizeModuleId(s.moduleId || s.module_id),
        marketingOptInStatus: normalizeOptIn(s.marketingOptInStatus || s.marketing_opt_in_status),
        marketingOptInUpdatedAt: toIso(s.marketingOptInUpdatedAt || s.marketing_opt_in_updated_at),
        marketingOptInSource: toNullable(s.marketingOptInSource || s.marketing_opt_in_source),
        commercialStatus: normalizeCommercial(s.commercialStatus || s.commercial_status),
        labels: normalizeLabels(s.labels),
        assignmentUserId: toNullable(s.assignmentUserId || s.assignment_user_id),
        firstInteractionAt: toIso(s.firstInteractionAt || s.first_interaction_at),
        lastInteractionAt: toIso(s.lastInteractionAt || s.last_interaction_at),
        metadata: normalizeMetadata(s.metadata),
        createdAt,
        updatedAt
    };
}
function normalizeStore(input = {}) {
    const s = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
    const items = Array.isArray(s.items)
        ? s.items.map((x) => normalizeRecord(x)).filter((x) => x.customerId && x.moduleId)
        : [];
    return { items };
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_customer_module_contexts (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                customer_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                marketing_opt_in_status TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (marketing_opt_in_status IN ('unknown', 'opted_in', 'opted_out')),
                marketing_opt_in_updated_at TIMESTAMPTZ NULL,
                marketing_opt_in_source TEXT NULL,
                commercial_status TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (commercial_status IN ('nuevo', 'en_conversacion', 'cotizado', 'vendido', 'perdido', 'unknown')),
                labels JSONB NOT NULL DEFAULT '[]'::jsonb,
                assignment_user_id TEXT NULL,
                first_interaction_at TIMESTAMPTZ NULL,
                last_interaction_at TIMESTAMPTZ NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, customer_id, module_id),
                FOREIGN KEY (tenant_id, customer_id)
                    REFERENCES tenant_customers(tenant_id, customer_id)
                    ON DELETE CASCADE
            )
        `);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_tenant_customer_module_ctx_marketing ON tenant_customer_module_contexts(tenant_id, module_id, marketing_opt_in_status, updated_at DESC)`);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_tenant_customer_module_ctx_commercial ON tenant_customer_module_contexts(tenant_id, module_id, commercial_status, updated_at DESC)`);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_tenant_customer_module_ctx_customer ON tenant_customer_module_contexts(tenant_id, customer_id, updated_at DESC)`);
        schemaReady = true;
    })();
    try { await schemaPromise; } catch (error) { schemaPromise = null; throw error; }
}

async function getContext(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const customerId = normalizeCustomerId(options.customerId || options);
    const moduleId = normalizeModuleId(options.moduleId || '');
    if (!customerId || !moduleId) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const item = store.items.find((x) => contextKey(x.customerId, x.moduleId) === contextKey(customerId, moduleId));
        return item || null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT customer_id, module_id, marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
                    commercial_status, labels, assignment_user_id, first_interaction_at, last_interaction_at, metadata, created_at, updated_at
               FROM tenant_customer_module_contexts
              WHERE tenant_id = $1 AND customer_id = $2 AND module_id = $3
              LIMIT 1`,
            [cleanTenantId, customerId, moduleId]
        );
        return result?.rows?.[0] ? normalizeRecord(result.rows[0]) : null;
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function upsertContext(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const source = payload && typeof payload === 'object' ? payload : {};
    const customerId = normalizeCustomerId(source.customerId || source.customer_id);
    const moduleId = normalizeModuleId(source.moduleId || source.module_id);
    if (!customerId) throw new Error('customerId requerido para contexto.');
    if (!moduleId) throw new Error('moduleId requerido para contexto.');

    const previous = await getContext(cleanTenantId, { customerId, moduleId });
    const now = nowIso();
    const hasLabels = Object.prototype.hasOwnProperty.call(source, 'labels');
    const hasAssignment = Object.prototype.hasOwnProperty.call(source, 'assignmentUserId')
        || Object.prototype.hasOwnProperty.call(source, 'assignment_user_id');

    const next = normalizeRecord({
        customerId,
        moduleId,
        marketingOptInStatus: (source.marketingOptInStatus ?? source.marketing_opt_in_status) ?? (previous?.marketingOptInStatus || 'unknown'),
        marketingOptInUpdatedAt: (source.marketingOptInUpdatedAt ?? source.marketing_opt_in_updated_at) ?? (previous?.marketingOptInUpdatedAt || null),
        marketingOptInSource: (source.marketingOptInSource ?? source.marketing_opt_in_source) ?? (previous?.marketingOptInSource || null),
        commercialStatus: (source.commercialStatus ?? source.commercial_status) ?? (previous?.commercialStatus || 'unknown'),
        labels: hasLabels ? source.labels : (previous?.labels || []),
        assignmentUserId: hasAssignment ? (source.assignmentUserId ?? source.assignment_user_id ?? null) : (previous?.assignmentUserId || null),
        firstInteractionAt: (source.firstInteractionAt ?? source.first_interaction_at) ?? (previous?.firstInteractionAt || null),
        lastInteractionAt: (source.lastInteractionAt ?? source.last_interaction_at) ?? (previous?.lastInteractionAt || null),
        metadata: { ...(previous?.metadata || {}), ...normalizeMetadata(source.metadata) },
        createdAt: previous?.createdAt || now,
        updatedAt: now
    });

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = contextKey(customerId, moduleId);
        const index = store.items.findIndex((x) => contextKey(x.customerId, x.moduleId) === key);
        if (index >= 0) store.items[index] = next;
        else store.items.push(next);
        await writeTenantJsonFile(STORE_FILE, store, { tenantId: cleanTenantId });
        return { context: next, previous, changed: !previous || JSON.stringify(previous) !== JSON.stringify(next) };
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO tenant_customer_module_contexts (
            tenant_id, customer_id, module_id, marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
            commercial_status, labels, assignment_user_id, first_interaction_at, last_interaction_at, metadata, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5::timestamptz, $6, $7, $8::jsonb, $9, $10::timestamptz, $11::timestamptz, $12::jsonb, $13::timestamptz, $14::timestamptz
        )
        ON CONFLICT (tenant_id, customer_id, module_id)
        DO UPDATE SET
            marketing_opt_in_status = EXCLUDED.marketing_opt_in_status,
            marketing_opt_in_updated_at = EXCLUDED.marketing_opt_in_updated_at,
            marketing_opt_in_source = EXCLUDED.marketing_opt_in_source,
            commercial_status = EXCLUDED.commercial_status,
            labels = EXCLUDED.labels,
            assignment_user_id = EXCLUDED.assignment_user_id,
            first_interaction_at = COALESCE(tenant_customer_module_contexts.first_interaction_at, EXCLUDED.first_interaction_at),
            last_interaction_at = COALESCE(GREATEST(tenant_customer_module_contexts.last_interaction_at, EXCLUDED.last_interaction_at), EXCLUDED.last_interaction_at, tenant_customer_module_contexts.last_interaction_at),
            metadata = COALESCE(tenant_customer_module_contexts.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_at = EXCLUDED.updated_at`,
        [
            cleanTenantId, next.customerId, next.moduleId, next.marketingOptInStatus, next.marketingOptInUpdatedAt, next.marketingOptInSource,
            next.commercialStatus, JSON.stringify(next.labels || []), next.assignmentUserId, next.firstInteractionAt, next.lastInteractionAt,
            JSON.stringify(next.metadata || {}), next.createdAt, next.updatedAt
        ]
    );
    return { context: next, previous, changed: !previous || JSON.stringify(previous) !== JSON.stringify(next) };
}

async function listContextsByCustomer(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const customerId = normalizeCustomerId(options.customerId || options);
    const limit = normalizeLimit(options.limit);
    const offset = normalizeOffset(options.offset);
    if (!customerId) return { items: [], total: 0, limit, offset };

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.items.filter((x) => x.customerId === customerId).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        return { items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset };
    }

    try {
        await ensurePostgresSchema();
        const totalRes = await queryPostgres(`SELECT COUNT(*)::BIGINT AS total FROM tenant_customer_module_contexts WHERE tenant_id = $1 AND customer_id = $2`, [cleanTenantId, customerId]);
        const rowsRes = await queryPostgres(
            `SELECT customer_id, module_id, marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
                    commercial_status, labels, assignment_user_id, first_interaction_at, last_interaction_at, metadata, created_at, updated_at
               FROM tenant_customer_module_contexts
              WHERE tenant_id = $1 AND customer_id = $2
              ORDER BY updated_at DESC
              LIMIT $3 OFFSET $4`,
            [cleanTenantId, customerId, limit, offset]
        );
        return { items: (rowsRes?.rows || []).map((x) => normalizeRecord(x)), total: Number(totalRes?.rows?.[0]?.total || 0), limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function listContextsByModule(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = resolveTenantId(tenantId);
    const moduleId = normalizeModuleId(options.moduleId || options.module_id || '');
    const filters = (options && typeof options.filters === 'object' && options.filters) ? options.filters : options;
    const optIns = toList(filters.marketingOptInStatus || filters.marketing_opt_in_status).map((x) => normalizeOptIn(x));
    const commercial = toList(filters.commercialStatus || filters.commercial_status).map((x) => normalizeCommercial(x));
    const labels = toList(filters.labels).map((x) => toLower(x));
    const customerId = normalizeCustomerId(filters.customerId || filters.customer_id || '');
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.items
            .filter((x) => !moduleId || x.moduleId === moduleId)
            .filter((x) => !customerId || x.customerId === customerId)
            .filter((x) => optIns.length === 0 || optIns.includes(x.marketingOptInStatus))
            .filter((x) => commercial.length === 0 || commercial.includes(x.commercialStatus))
            .filter((x) => labels.length === 0 || labels.some((l) => normalizeLabels(x.labels).map((y) => toLower(y)).includes(l)))
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        return { items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];
        if (moduleId) { params.push(moduleId); where.push(`module_id = $${params.length}`); }
        if (customerId) { params.push(customerId); where.push(`customer_id = $${params.length}`); }
        if (optIns.length > 0) { params.push(optIns); where.push(`marketing_opt_in_status = ANY($${params.length}::text[])`); }
        if (commercial.length > 0) { params.push(commercial); where.push(`commercial_status = ANY($${params.length}::text[])`); }
        if (labels.length > 0) {
            params.push(labels);
            where.push(`EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(labels, '[]'::jsonb)) AS lbl(value)
                WHERE LOWER(lbl.value) = ANY($${params.length}::text[])
            )`);
        }
        const whereSql = where.join(' AND ');
        const totalRes = await queryPostgres(`SELECT COUNT(*)::BIGINT AS total FROM tenant_customer_module_contexts WHERE ${whereSql}`, params);
        const rowsParams = [...params, limit, offset];
        const rowsRes = await queryPostgres(
            `SELECT customer_id, module_id, marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
                    commercial_status, labels, assignment_user_id, first_interaction_at, last_interaction_at, metadata, created_at, updated_at
               FROM tenant_customer_module_contexts
              WHERE ${whereSql}
              ORDER BY updated_at DESC
              LIMIT $${rowsParams.length - 1}
              OFFSET $${rowsParams.length}`,
            rowsParams
        );
        return { items: (rowsRes?.rows || []).map((x) => normalizeRecord(x)), total: Number(totalRes?.rows?.[0]?.total || 0), limit, offset };
    } catch (error) {
        if (missingRelation(error)) return { items: [], total: 0, limit, offset };
        throw error;
    }
}

async function backfillFromExistingData(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = resolveTenantId(tenantId);
    if (getStorageDriver() !== 'postgres') {
        const customers = await readTenantJsonFile('customers.json', { tenantId: cleanTenantId, defaultValue: { items: [] } });
        const items = Array.isArray(customers?.items) ? customers.items : [];
        let total = 0;
        for (const row of items) {
            const customerId = normalizeCustomerId(row.customerId || row.customer_id);
            const moduleId = normalizeModuleId(row.moduleId || row.module_id);
            if (!customerId || !moduleId) continue;
            await upsertContext(cleanTenantId, {
                customerId,
                moduleId,
                marketingOptInStatus: row.marketingOptInStatus || row.marketing_opt_in_status || 'unknown',
                marketingOptInUpdatedAt: row.marketingOptInUpdatedAt || row.marketing_opt_in_updated_at || null,
                marketingOptInSource: row.marketingOptInSource || row.marketing_opt_in_source || null,
                labels: Array.isArray(row.tags) ? row.tags : [],
                firstInteractionAt: row.firstInteractionAt || row.first_interaction_at || row.createdAt || row.created_at || null,
                lastInteractionAt: row.lastInteractionAt || row.last_interaction_at || row.updatedAt || row.updated_at || null,
                metadata: { backfilled: true, source: 'tenant_customers' }
            });
            total += 1;
        }
        return { total };
    }

    await ensurePostgresSchema();
    await queryPostgres('BEGIN');
    try {
        await queryPostgres(
            `INSERT INTO tenant_customer_module_contexts (
                tenant_id, customer_id, module_id, marketing_opt_in_status, marketing_opt_in_updated_at, marketing_opt_in_source,
                labels, first_interaction_at, last_interaction_at, metadata, created_at, updated_at
            )
            SELECT
                tc.tenant_id, tc.customer_id, BTRIM(tc.module_id),
                CASE WHEN LOWER(COALESCE(tc.marketing_opt_in_status, 'unknown')) IN ('unknown', 'opted_in', 'opted_out')
                    THEN LOWER(COALESCE(tc.marketing_opt_in_status, 'unknown')) ELSE 'unknown' END,
                tc.marketing_opt_in_updated_at, tc.marketing_opt_in_source, COALESCE(tc.tags, '[]'::jsonb),
                COALESCE(tc.last_interaction_at, tc.created_at, tc.updated_at, NOW()),
                COALESCE(tc.last_interaction_at, tc.updated_at, tc.created_at, NOW()),
                jsonb_build_object('backfilled', true, 'source', 'tenant_customers'),
                COALESCE(tc.created_at, NOW()), COALESCE(tc.updated_at, NOW())
            FROM tenant_customers tc
            WHERE tc.tenant_id = $1 AND COALESCE(BTRIM(tc.module_id), '') <> ''
            ON CONFLICT (tenant_id, customer_id, module_id)
            DO UPDATE SET
                marketing_opt_in_status = EXCLUDED.marketing_opt_in_status,
                marketing_opt_in_updated_at = COALESCE(EXCLUDED.marketing_opt_in_updated_at, tenant_customer_module_contexts.marketing_opt_in_updated_at),
                marketing_opt_in_source = COALESCE(EXCLUDED.marketing_opt_in_source, tenant_customer_module_contexts.marketing_opt_in_source),
                labels = CASE WHEN tenant_customer_module_contexts.labels IS NULL OR tenant_customer_module_contexts.labels = '[]'::jsonb THEN EXCLUDED.labels ELSE tenant_customer_module_contexts.labels END,
                first_interaction_at = COALESCE(tenant_customer_module_contexts.first_interaction_at, EXCLUDED.first_interaction_at),
                last_interaction_at = COALESCE(GREATEST(tenant_customer_module_contexts.last_interaction_at, EXCLUDED.last_interaction_at), EXCLUDED.last_interaction_at, tenant_customer_module_contexts.last_interaction_at),
                metadata = COALESCE(tenant_customer_module_contexts.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
                updated_at = NOW()`,
            [cleanTenantId]
        );

        await queryPostgres(
            `WITH latest_assignment AS (
                SELECT DISTINCT ON (ce.customer_id, module_id)
                    ce.customer_id, module_id, ta.assignee_user_id
                FROM tenant_chat_assignments ta
                JOIN tenant_channel_events ce ON ce.tenant_id = ta.tenant_id AND ce.chat_id = ta.chat_id
                CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(BTRIM(ta.scope_module_id), ''), NULLIF(BTRIM(ce.module_id), '')) AS module_id) m
                WHERE ta.tenant_id = $1
                  AND COALESCE(BTRIM(ce.customer_id), '') <> ''
                  AND COALESCE(BTRIM(m.module_id), '') <> ''
                ORDER BY ce.customer_id, module_id, COALESCE(ta.updated_at, ta.created_at, ce.created_at) DESC
            )
            UPDATE tenant_customer_module_contexts ctx
               SET assignment_user_id = latest_assignment.assignee_user_id, updated_at = NOW()
              FROM latest_assignment
             WHERE ctx.tenant_id = $1 AND ctx.customer_id = latest_assignment.customer_id AND ctx.module_id = latest_assignment.module_id`,
            [cleanTenantId]
        );

        await queryPostgres(
            `WITH latest_commercial AS (
                SELECT DISTINCT ON (ce.customer_id, module_id)
                    ce.customer_id, module_id, tccs.status AS commercial_status
                FROM tenant_chat_commercial_status tccs
                JOIN tenant_channel_events ce ON ce.tenant_id = tccs.tenant_id AND ce.chat_id = tccs.chat_id
                CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(BTRIM(tccs.scope_module_id), ''), NULLIF(BTRIM(ce.module_id), '')) AS module_id) m
                WHERE tccs.tenant_id = $1
                  AND COALESCE(BTRIM(ce.customer_id), '') <> ''
                  AND COALESCE(BTRIM(m.module_id), '') <> ''
                ORDER BY ce.customer_id, module_id, COALESCE(tccs.updated_at, tccs.last_transition_at, tccs.created_at, ce.created_at) DESC
            )
            UPDATE tenant_customer_module_contexts ctx
               SET commercial_status = CASE
                   WHEN latest_commercial.commercial_status IN ('nuevo', 'en_conversacion', 'cotizado', 'vendido', 'perdido')
                       THEN latest_commercial.commercial_status
                   ELSE ctx.commercial_status
               END,
               updated_at = NOW()
              FROM latest_commercial
             WHERE ctx.tenant_id = $1 AND ctx.customer_id = latest_commercial.customer_id AND ctx.module_id = latest_commercial.module_id`,
            [cleanTenantId]
        );

        const totalRes = await queryPostgres(`SELECT COUNT(*)::BIGINT AS total FROM tenant_customer_module_contexts WHERE tenant_id = $1`, [cleanTenantId]);
        await queryPostgres('COMMIT');
        return { total: Number(totalRes?.rows?.[0]?.total || 0) };
    } catch (error) {
        await queryPostgres('ROLLBACK');
        if (missingRelation(error)) return { total: 0 };
        throw error;
    }
}

module.exports = {
    getContext,
    upsertContext,
    listContextsByCustomer,
    listContextsByModule,
    backfillFromExistingData
};

