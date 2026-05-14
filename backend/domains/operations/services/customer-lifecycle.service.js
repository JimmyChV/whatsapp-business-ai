const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres
} = require('../../../config/persistence-runtime');

const LIFECYCLE_LABEL_IDS = Object.freeze({
    prospect: 'PROSPECTO',
    newCustomer: 'CLIENTE_NUEVO',
    recurringCustomer: 'CLIENTE_RECURRENTE'
});
const LIFECYCLE_SOURCE = 'lifecycle';

let schemaReady = false;
let schemaPromise = null;

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeCustomerId(value = '') {
    return toText(value);
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensureLifecycleSchema() {
    if (getStorageDriver() !== 'postgres') return;
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_customer_labels (
                tenant_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                label_id TEXT NOT NULL,
                address_id TEXT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, customer_id, label_id, source)
            )
        `);
        await queryPostgres(`
            ALTER TABLE tenant_customer_labels
              DROP CONSTRAINT IF EXISTS tenant_customer_labels_source_check
        `);
        await queryPostgres(`
            ALTER TABLE tenant_customer_labels
              ADD CONSTRAINT tenant_customer_labels_source_check
              CHECK (source IN ('zone', 'commercial', 'manual', 'lifecycle'))
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

async function getLifecycleLabelIds() {
    if (getStorageDriver() !== 'postgres') return LIFECYCLE_LABEL_IDS;
    await ensureLifecycleSchema();
    const ids = Object.values(LIFECYCLE_LABEL_IDS);
    const { rows } = await queryPostgres(
        `SELECT id
           FROM global_labels
          WHERE id = ANY($1::text[])
             OR UPPER(name) = ANY($1::text[])`,
        [ids]
    );
    const found = new Set((rows || []).map((row) => toText(row?.id).toUpperCase()).filter(Boolean));
    return {
        prospect: found.has(LIFECYCLE_LABEL_IDS.prospect) ? LIFECYCLE_LABEL_IDS.prospect : null,
        newCustomer: found.has(LIFECYCLE_LABEL_IDS.newCustomer) ? LIFECYCLE_LABEL_IDS.newCustomer : null,
        recurringCustomer: found.has(LIFECYCLE_LABEL_IDS.recurringCustomer) ? LIFECYCLE_LABEL_IDS.recurringCustomer : null
    };
}

async function hasLifecycleLabel(tenantId, customerId, labelIds) {
    const { rows } = await queryPostgres(
        `SELECT label_id
           FROM tenant_customer_labels
          WHERE tenant_id = $1
            AND customer_id = $2
            AND source = $3
            AND label_id = ANY($4::text[])
          LIMIT 1`,
        [tenantId, customerId, LIFECYCLE_SOURCE, labelIds.filter(Boolean)]
    );
    return Boolean(rows?.[0]);
}

async function insertLifecycleLabel(tenantId, customerId, labelId) {
    if (!labelId) return false;
    await queryPostgres(
        `INSERT INTO tenant_customer_labels (tenant_id, customer_id, label_id, source, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (tenant_id, customer_id, label_id, source) DO NOTHING`,
        [tenantId, customerId, labelId, LIFECYCLE_SOURCE]
    );
    return true;
}

async function replaceLifecycleLabel(tenantId, customerId, targetLabelId, removeLabelIds = []) {
    if (!targetLabelId) return false;
    const labelsToRemove = removeLabelIds.filter(Boolean);
    if (labelsToRemove.length > 0) {
        await queryPostgres(
            `DELETE FROM tenant_customer_labels
              WHERE tenant_id = $1
                AND customer_id = $2
                AND source = $3
                AND label_id = ANY($4::text[])`,
            [tenantId, customerId, LIFECYCLE_SOURCE, labelsToRemove]
        );
    }
    return insertLifecycleLabel(tenantId, customerId, targetLabelId);
}

async function countAttendedOrdersForCustomer(tenantId, customerId) {
    const { rows } = await queryPostgres(
        `SELECT COUNT(DISTINCT tcs.chat_id)::INTEGER AS total
           FROM tenant_chat_commercial_status tcs
          WHERE tcs.tenant_id = $1
            AND tcs.status = 'atendido'
            AND EXISTS (
                SELECT 1
                  FROM tenant_channel_events tce
                 WHERE tce.tenant_id = tcs.tenant_id
                   AND tce.chat_id = tcs.chat_id
                   AND COALESCE(tce.customer_id, '') = $2
            )`,
        [tenantId, customerId]
    );
    return Number(rows?.[0]?.total || 0);
}

async function ensureProspectLabel(tenantId = DEFAULT_TENANT_ID, customerId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanCustomerId = normalizeCustomerId(customerId);
    if (!cleanCustomerId || getStorageDriver() !== 'postgres') {
        return { applied: false, reason: 'unsupported_driver_or_missing_customer' };
    }

    try {
        await ensureLifecycleSchema();
        const labelIds = await getLifecycleLabelIds();
        const lifecycleIds = Object.values(labelIds).filter(Boolean);
        if (!labelIds.prospect || lifecycleIds.length === 0) {
            return { applied: false, reason: 'missing_lifecycle_labels' };
        }
        if (await hasLifecycleLabel(cleanTenantId, cleanCustomerId, lifecycleIds)) {
            return { applied: false, reason: 'lifecycle_label_exists' };
        }
        await insertLifecycleLabel(cleanTenantId, cleanCustomerId, labelIds.prospect);
        return { applied: true, labelId: labelIds.prospect };
    } catch (error) {
        if (missingRelation(error)) return { applied: false, reason: 'missing_relation' };
        throw error;
    }
}

async function upgradeToNewCustomer(tenantId = DEFAULT_TENANT_ID, customerId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanCustomerId = normalizeCustomerId(customerId);
    if (!cleanCustomerId || getStorageDriver() !== 'postgres') {
        return { applied: false, reason: 'unsupported_driver_or_missing_customer' };
    }

    await ensureLifecycleSchema();
    const attendedCount = await countAttendedOrdersForCustomer(cleanTenantId, cleanCustomerId);
    if (attendedCount !== 1) return { applied: false, reason: 'not_first_attended_order', attendedCount };

    const labelIds = await getLifecycleLabelIds();
    await replaceLifecycleLabel(cleanTenantId, cleanCustomerId, labelIds.newCustomer, [
        labelIds.prospect,
        labelIds.recurringCustomer
    ]);
    return { applied: true, labelId: labelIds.newCustomer, attendedCount };
}

async function upgradeToRecurringCustomer(tenantId = DEFAULT_TENANT_ID, customerId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanCustomerId = normalizeCustomerId(customerId);
    if (!cleanCustomerId || getStorageDriver() !== 'postgres') {
        return { applied: false, reason: 'unsupported_driver_or_missing_customer' };
    }

    await ensureLifecycleSchema();
    const attendedCount = await countAttendedOrdersForCustomer(cleanTenantId, cleanCustomerId);
    if (attendedCount <= 1) return { applied: false, reason: 'not_recurring_customer', attendedCount };

    const labelIds = await getLifecycleLabelIds();
    await replaceLifecycleLabel(cleanTenantId, cleanCustomerId, labelIds.recurringCustomer, [
        labelIds.prospect,
        labelIds.newCustomer
    ]);
    return { applied: true, labelId: labelIds.recurringCustomer, attendedCount };
}

async function syncAfterAttendedOrder(tenantId = DEFAULT_TENANT_ID, customerId = '') {
    const recurring = await upgradeToRecurringCustomer(tenantId, customerId);
    if (recurring.applied) return recurring;
    return upgradeToNewCustomer(tenantId, customerId);
}

module.exports = {
    ensureProspectLabel,
    upgradeToNewCustomer,
    upgradeToRecurringCustomer,
    syncAfterAttendedOrder
};
