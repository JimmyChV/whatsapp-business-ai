const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');

const ZONE_RULES_FILE = 'tenant_zone_rules.json';
const CUSTOMER_LABELS_FILE = 'tenant_customer_labels.json';
const DEFAULT_COLOR = '#00A884';

let schemaPromise = null;

function toText(value = '') {
    return String(value || '').trim();
}

function normalizeTenant(tenantId = DEFAULT_TENANT_ID) {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function normalizeId(value = '') {
    return toText(value).toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
}

function normalizeRuleId(value = '') {
    return normalizeId(value);
}

function createRuleId() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ZONE-${stamp}${rand}`;
}

function normalizeColor(value = '', fallback = DEFAULT_COLOR) {
    const raw = toText(value).toUpperCase();
    if (/^#([0-9A-F]{6})$/.test(raw)) return raw;
    if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
    return fallback;
}

function normalizeMatchValue(value = '') {
    return toText(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeObject(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function sanitizeRule(source = {}) {
    const input = normalizeObject(source);
    const ruleId = normalizeRuleId(input.ruleId || input.rule_id || input.id || '');
    const rulesJson = normalizeObject(input.rulesJson || input.rules_json || input.rules);
    return {
        ruleId,
        tenantId: normalizeTenant(input.tenantId || input.tenant_id || DEFAULT_TENANT_ID),
        name: toText(input.name || ''),
        color: normalizeColor(input.color || ''),
        rulesJson,
        isActive: input.isActive !== false && input.is_active !== false,
        createdAt: input.createdAt || input.created_at || null,
        updatedAt: input.updatedAt || input.updated_at || null
    };
}

function sanitizeAssignment(source = {}) {
    const input = normalizeObject(source);
    const sourceType = toText(input.source || '').toLowerCase();
    return {
        tenantId: normalizeTenant(input.tenantId || input.tenant_id || DEFAULT_TENANT_ID),
        customerId: toText(input.customerId || input.customer_id || ''),
        labelId: normalizeId(input.labelId || input.label_id || ''),
        addressId: toText(input.addressId || input.address_id || '') || null,
        source: ['zone', 'commercial', 'manual'].includes(sourceType) ? sourceType : 'manual',
        createdAt: input.createdAt || input.created_at || new Date().toISOString()
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_zone_rules (
                rule_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#00A884',
                rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, rule_id)
            )
        `);
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_customer_labels (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                customer_id TEXT NOT NULL,
                label_id TEXT NOT NULL,
                address_id TEXT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, customer_id, label_id, source)
            )
        `);
    })();
    try {
        await schemaPromise;
    } catch (error) {
        schemaPromise = null;
        throw error;
    }
}

async function readRulesStore(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenant(tenantId);
    const parsed = await readTenantJsonFile(ZONE_RULES_FILE, {
        tenantId: cleanTenantId,
        defaultValue: { items: [] }
    });
    return {
        items: ensureArray(parsed?.items)
            .map((item) => sanitizeRule({ ...item, tenantId: cleanTenantId }))
            .filter((item) => item.ruleId && item.name)
    };
}

async function writeRulesStore(tenantId = DEFAULT_TENANT_ID, store = { items: [] }) {
    const cleanTenantId = normalizeTenant(tenantId);
    await writeTenantJsonFile(ZONE_RULES_FILE, {
        items: ensureArray(store?.items)
            .map((item) => sanitizeRule({ ...item, tenantId: cleanTenantId }))
            .filter((item) => item.ruleId && item.name)
    }, { tenantId: cleanTenantId });
}

async function readAssignmentsStore(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenant(tenantId);
    const parsed = await readTenantJsonFile(CUSTOMER_LABELS_FILE, {
        tenantId: cleanTenantId,
        defaultValue: { items: [] }
    });
    return {
        items: ensureArray(parsed?.items)
            .map((item) => sanitizeAssignment({ ...item, tenantId: cleanTenantId }))
            .filter((item) => item.customerId && item.labelId)
    };
}

async function writeAssignmentsStore(tenantId = DEFAULT_TENANT_ID, store = { items: [] }) {
    const cleanTenantId = normalizeTenant(tenantId);
    await writeTenantJsonFile(CUSTOMER_LABELS_FILE, {
        items: ensureArray(store?.items)
            .map((item) => sanitizeAssignment({ ...item, tenantId: cleanTenantId }))
            .filter((item) => item.customerId && item.labelId)
    }, { tenantId: cleanTenantId });
}

async function listZoneRules(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const includeInactive = options?.includeInactive === true;

    if (getStorageDriver() !== 'postgres') {
        const store = await readRulesStore(cleanTenantId);
        return store.items
            .filter((item) => includeInactive || item.isActive !== false)
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const activeClause = includeInactive ? '' : 'AND is_active = TRUE';
        const { rows } = await queryPostgres(
            `SELECT rule_id, tenant_id, name, color, rules_json, is_active, created_at, updated_at
               FROM tenant_zone_rules
              WHERE tenant_id = $1
                ${activeClause}
              ORDER BY name ASC`,
            params
        );
        return ensureArray(rows).map(sanitizeRule);
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

async function saveZoneRule(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const clean = sanitizeRule({ ...payload, tenantId: cleanTenantId });
    const ruleId = clean.ruleId || createRuleId();
    if (!clean.name) throw new Error('Nombre de zona requerido.');

    if (getStorageDriver() !== 'postgres') {
        const store = await readRulesStore(cleanTenantId);
        const index = store.items.findIndex((item) => item.ruleId === ruleId);
        const previous = index >= 0 ? store.items[index] : null;
        const next = {
            ...clean,
            ruleId,
            createdAt: previous?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (index >= 0) store.items[index] = next;
        else store.items.push(next);
        await writeRulesStore(cleanTenantId, store);
        return next;
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO tenant_zone_rules (
            tenant_id, rule_id, name, color, rules_json, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), NOW())
        ON CONFLICT (tenant_id, rule_id)
        DO UPDATE SET
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            rules_json = EXCLUDED.rules_json,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()`,
        [cleanTenantId, ruleId, clean.name, clean.color, JSON.stringify(clean.rulesJson || {}), clean.isActive !== false]
    );
    const items = await listZoneRules(cleanTenantId, { includeInactive: true });
    return items.find((item) => item.ruleId === ruleId) || null;
}

async function deleteZoneRule(tenantId = DEFAULT_TENANT_ID, ruleId = '') {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanRuleId = normalizeRuleId(ruleId);
    if (!cleanRuleId) throw new Error('ruleId invalido.');

    if (getStorageDriver() !== 'postgres') {
        const store = await readRulesStore(cleanTenantId);
        const next = store.items.filter((item) => item.ruleId !== cleanRuleId);
        await writeRulesStore(cleanTenantId, { items: next });
        return { ruleId: cleanRuleId, deleted: next.length !== store.items.length };
    }

    await ensurePostgresSchema();
    const result = await queryPostgres(
        `DELETE FROM tenant_zone_rules WHERE tenant_id = $1 AND rule_id = $2`,
        [cleanTenantId, cleanRuleId]
    );
    return { ruleId: cleanRuleId, deleted: Number(result?.rowCount || 0) > 0 };
}

function collectRuleValues(rulesJson = {}, keys = []) {
    const output = [];
    const visit = (value) => {
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (!value || typeof value !== 'object') return;
        for (const key of keys) {
            if (value[key] !== undefined) {
                if (Array.isArray(value[key])) value[key].forEach((entry) => output.push(entry));
                else output.push(value[key]);
            }
        }
        Object.values(value).forEach((entry) => {
            if (entry && typeof entry === 'object') visit(entry);
        });
    };
    visit(rulesJson);
    return output
        .map((entry) => (entry && typeof entry === 'object' ? (entry.name || entry.label || entry.value || entry.id) : entry))
        .map(normalizeMatchValue)
        .filter(Boolean);
}

function ruleMatchesAddress(rule = {}, address = {}) {
    const rulesJson = normalizeObject(rule.rulesJson || rule.rules_json);
    const district = normalizeMatchValue(address?.districtName || address?.district_name || address?.districtId || address?.district_id || '');
    const province = normalizeMatchValue(address?.provinceName || address?.province_name || '');
    const department = normalizeMatchValue(address?.departmentName || address?.department_name || '');
    const districtValues = collectRuleValues(rulesJson, ['districts', 'districtNames', 'distritos', 'district']);
    const provinceValues = collectRuleValues(rulesJson, ['provinces', 'provinceNames', 'provincias', 'province']);
    const departmentValues = collectRuleValues(rulesJson, ['departments', 'departmentNames', 'departamentos', 'department']);

    if (district && districtValues.includes(district)) return { level: 'district', rule };
    if (province && provinceValues.includes(province)) return { level: 'province', rule };
    if (department && departmentValues.includes(department)) return { level: 'department', rule };
    return null;
}

function resolveZoneFromAddress(address = {}, rules = []) {
    const activeRules = ensureArray(rules).filter((rule) => rule?.isActive !== false);
    const matches = activeRules
        .map((rule) => ruleMatchesAddress(rule, address))
        .filter(Boolean);
    const byPriority = { district: 3, province: 2, department: 1 };
    matches.sort((a, b) => (byPriority[b.level] || 0) - (byPriority[a.level] || 0));
    return matches[0]?.rule || null;
}

async function replaceCustomerZoneLabel(tenantId = DEFAULT_TENANT_ID, { customerId = '', addressId = '', rule = null } = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanCustomerId = toText(customerId);
    if (!cleanCustomerId) return null;
    const labelId = rule ? normalizeRuleId(rule.ruleId || rule.rule_id || '') : '';

    if (getStorageDriver() !== 'postgres') {
        const store = await readAssignmentsStore(cleanTenantId);
        const nextItems = store.items.filter((item) => !(item.customerId === cleanCustomerId && item.source === 'zone'));
        if (labelId) {
            nextItems.push(sanitizeAssignment({
                tenantId: cleanTenantId,
                customerId: cleanCustomerId,
                labelId,
                addressId,
                source: 'zone'
            }));
        }
        await writeAssignmentsStore(cleanTenantId, { items: nextItems });
        return labelId ? nextItems.find((item) => item.customerId === cleanCustomerId && item.labelId === labelId && item.source === 'zone') : null;
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `DELETE FROM tenant_customer_labels
          WHERE tenant_id = $1 AND customer_id = $2 AND source = 'zone'`,
        [cleanTenantId, cleanCustomerId]
    );
    if (!labelId) return null;
    await queryPostgres(
        `INSERT INTO tenant_customer_labels (tenant_id, customer_id, label_id, address_id, source, created_at)
         VALUES ($1, $2, $3, $4, 'zone', NOW())
         ON CONFLICT (tenant_id, customer_id, label_id, source)
         DO UPDATE SET address_id = EXCLUDED.address_id, created_at = NOW()`,
        [cleanTenantId, cleanCustomerId, labelId, toText(addressId) || null]
    );
    return sanitizeAssignment({ tenantId: cleanTenantId, customerId: cleanCustomerId, labelId, addressId, source: 'zone' });
}

async function applyZoneForAddress(tenantId = DEFAULT_TENANT_ID, address = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const customerId = toText(address?.customerId || address?.customer_id || '');
    if (!customerId) return null;
    const rules = await listZoneRules(cleanTenantId, { includeInactive: false });
    const rule = resolveZoneFromAddress(address, rules);
    return replaceCustomerZoneLabel(cleanTenantId, {
        customerId,
        addressId: address?.addressId || address?.address_id || '',
        rule
    });
}

async function listCustomerLabels(tenantId = DEFAULT_TENANT_ID, options = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const customerId = toText(options?.customerId || options?.customer_id || '');
    const source = toText(options?.source || '').toLowerCase();

    if (getStorageDriver() !== 'postgres') {
        const store = await readAssignmentsStore(cleanTenantId);
        return store.items.filter((item) => {
            if (customerId && item.customerId !== customerId) return false;
            if (source && item.source !== source) return false;
            return true;
        });
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1'];
        if (customerId) {
            params.push(customerId);
            where.push(`customer_id = $${params.length}`);
        }
        if (source) {
            params.push(source);
            where.push(`source = $${params.length}`);
        }
        const { rows } = await queryPostgres(
            `SELECT tenant_id, customer_id, label_id, address_id, source, created_at
               FROM tenant_customer_labels
              WHERE ${where.join(' AND ')}
              ORDER BY created_at DESC`,
            params
        );
        return ensureArray(rows).map(sanitizeAssignment);
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

async function recalculateZonesForTenant(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenant(tenantId);
    const customerService = require('./customers.service');
    const customerAddressesService = require('./customer-addresses.service');
    const result = await customerService.listCustomers(cleanTenantId, { limit: 100000, offset: 0, includeInactive: true });
    const customers = ensureArray(result?.items);
    let scanned = 0;
    let assigned = 0;

    for (const customer of customers) {
        const customerId = toText(customer?.customerId || '');
        if (!customerId) continue;
        const addresses = await customerAddressesService.listAddresses(cleanTenantId, { customerId });
        const primary = ensureArray(addresses).find((item) => item?.isPrimary === true) || ensureArray(addresses)[0] || null;
        if (!primary) continue;
        scanned += 1;
        const assignment = await applyZoneForAddress(cleanTenantId, primary);
        if (assignment?.labelId) assigned += 1;
    }

    return { scanned, assigned, totalCustomers: customers.length };
}

module.exports = {
    listZoneRules,
    saveZoneRule,
    deleteZoneRule,
    resolveZoneFromAddress,
    applyZoneForAddress,
    listCustomerLabels,
    recalculateZonesForTenant,
    sanitizeRule,
    sanitizeAssignment
};
