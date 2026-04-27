const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');
const { normalizeAddressFields } = require('../../../utils/normalize-text');

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
        labelName: toText(input.labelName || input.label_name || input.name || input.label || ''),
        color: normalizeColor(input.color || input.labelColor || input.label_color || '', DEFAULT_COLOR),
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
        const assignments = store.items.filter((item) => {
            if (customerId && item.customerId !== customerId) return false;
            if (source && item.source !== source) return false;
            return true;
        });
        if (source !== 'zone') return assignments;
        const zoneRules = await listZoneRules(cleanTenantId, { includeInactive: true });
        const zoneById = new Map(zoneRules.map((rule) => [normalizeRuleId(rule.ruleId || rule.rule_id || rule.id || ''), rule]));
        return assignments.map((item) => {
            const rule = zoneById.get(normalizeId(item.labelId || item.label_id || ''));
            return sanitizeAssignment({
                ...item,
                labelName: rule?.name || item?.labelName || item?.label_name || '',
                color: rule?.color || item?.color || ''
            });
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
            `SELECT tcl.tenant_id,
                    tcl.customer_id,
                    tcl.label_id,
                    tcl.address_id,
                    tcl.source,
                    tcl.created_at,
                    tzr.name AS label_name,
                    tzr.color AS label_color
               FROM tenant_customer_labels tcl
               LEFT JOIN tenant_zone_rules tzr
                 ON tzr.tenant_id = tcl.tenant_id
                AND tzr.rule_id = tcl.label_id
              WHERE ${where.map((entry) => entry.replace(/\btenant_id\b/g, 'tcl.tenant_id').replace(/\bcustomer_id\b/g, 'tcl.customer_id').replace(/\bsource\b/g, 'tcl.source')).join(' AND ')}
              ORDER BY tcl.created_at DESC`,
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
    const customerAddressesService = require('./customer-addresses.service');
    let scanned = 0;
    let assigned = 0;

    if (getStorageDriver() === 'postgres') {
        await ensurePostgresSchema();
        const rules = await listZoneRules(cleanTenantId, { includeInactive: false });
        const countResult = await queryPostgres(
            `SELECT COUNT(DISTINCT customer_id)::int AS total
               FROM tenant_customer_addresses
              WHERE tenant_id = $1`,
            [cleanTenantId]
        );
        const totalCustomers = Number(countResult?.rows?.[0]?.total || 0) || 0;
        const addressesResult = await queryPostgres(
            `SELECT DISTINCT ON (customer_id)
                tenant_id,
                customer_id,
                address_id,
                district_id,
                district_name,
                province_name,
                department_name,
                is_primary,
                updated_at
             FROM tenant_customer_addresses
             WHERE tenant_id = $1
             ORDER BY customer_id, is_primary DESC, updated_at DESC`,
            [cleanTenantId]
        );
        const primaryAddresses = ensureArray(addressesResult?.rows);

        for (const address of primaryAddresses) {
            const customerId = toText(address?.customer_id || '');
            const addressId = toText(address?.address_id || '');
            if (!customerId || !addressId) continue;
            const enriched = customerAddressesService.enrichAddressGeo({
                tenantId: cleanTenantId,
                customerId,
                addressId,
                districtId: address?.district_id,
                districtName: address?.district_name,
                provinceName: address?.province_name,
                departmentName: address?.department_name,
                isPrimary: address?.is_primary === true
            });
            scanned += 1;

            const nextDistrictName = toText(enriched?.districtName || enriched?.district_name) || null;
            const nextProvinceName = toText(enriched?.provinceName || enriched?.province_name) || null;
            const nextDepartmentName = toText(enriched?.departmentName || enriched?.department_name) || null;
            const normalizedGeoFields = normalizeAddressFields({
                district_name: nextDistrictName,
                province_name: nextProvinceName,
                department_name: nextDepartmentName
            });
            const prevDistrictName = toText(address?.district_name) || null;
            const prevProvinceName = toText(address?.province_name) || null;
            const prevDepartmentName = toText(address?.department_name) || null;

            if (
                nextDistrictName !== prevDistrictName
                || nextProvinceName !== prevProvinceName
                || nextDepartmentName !== prevDepartmentName
            ) {
                await queryPostgres(
                    `UPDATE tenant_customer_addresses
                        SET district_name = $3,
                            province_name = $4,
                            department_name = $5,
                            updated_at = NOW()
                      WHERE tenant_id = $1
                        AND address_id = $2`,
                    [
                        cleanTenantId,
                        addressId,
                        normalizedGeoFields.district_name,
                        normalizedGeoFields.province_name,
                        normalizedGeoFields.department_name
                    ]
                );
            }

            const rule = resolveZoneFromAddress(enriched, rules);
            const assignment = await replaceCustomerZoneLabel(cleanTenantId, {
                customerId,
                addressId,
                rule
            });
            if (assignment?.labelId) assigned += 1;
        }

        return { scanned, assigned, totalCustomers };
    }

    const customerService = require('./customers.service');
    const customers = [];
    let offset = 0;
    let totalCustomers = 0;

    while (true) {
        const page = await customerService.listCustomers(cleanTenantId, {
            limit: 500,
            offset,
            includeInactive: true
        });
        const pageItems = ensureArray(page?.items);
        totalCustomers = Number(page?.total || totalCustomers || 0);
        if (pageItems.length === 0) break;
        customers.push(...pageItems);
        offset += pageItems.length;
        if (pageItems.length < 500) break;
        if (totalCustomers > 0 && customers.length >= totalCustomers) break;
    }

    for (const customer of customers) {
        const customerId = toText(customer?.customerId || '');
        if (!customerId) continue;
        const addresses = await customerAddressesService.listAddresses(cleanTenantId, { customerId });
        const primary = ensureArray(addresses).find((item) => item?.isPrimary === true) || ensureArray(addresses)[0] || null;
        if (!primary) continue;
        scanned += 1;
        const normalizedPrimary = await customerAddressesService.upsertAddress(cleanTenantId, primary);
        const assignment = await applyZoneForAddress(cleanTenantId, normalizedPrimary || primary);
        if (assignment?.labelId) assigned += 1;
    }

    return { scanned, assigned, totalCustomers: totalCustomers || customers.length };
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
