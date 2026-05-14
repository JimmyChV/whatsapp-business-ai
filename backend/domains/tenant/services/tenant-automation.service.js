const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');

const AUTOMATIONS_FILE = 'tenant_automation_rules.json';
const VALID_EVENT_KEYS = new Set(['quote_accepted', 'order_programmed', 'order_attended']);

let schemaReady = false;
let schemaPromise = null;

function normalizeText(value = '') {
    return String(value ?? '').trim();
}

function normalizeRuleId(value = '') {
    return normalizeText(value);
}

function normalizeEventKey(value = '') {
    const eventKey = normalizeText(value).toLowerCase();
    return VALID_EVENT_KEYS.has(eventKey) ? eventKey : '';
}

function normalizeModuleId(value = '') {
    return normalizeText(value) || null;
}

function normalizeDelayMinutes(value = 0) {
    const parsed = Number.parseInt(String(value ?? 0), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(parsed, 60 * 24 * 30);
}

function sanitizeRulePayload(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const eventKey = normalizeEventKey(source.eventKey || source.event_key);
    if (!eventKey) throw new Error('event_key invalido.');
    const templateName = normalizeText(source.templateName || source.template_name);
    return {
        eventKey,
        moduleId: normalizeModuleId(source.moduleId || source.module_id),
        templateName: templateName || null,
        templateLanguage: normalizeText(source.templateLanguage || source.template_language || 'es') || 'es',
        delayMinutes: normalizeDelayMinutes(source.delayMinutes ?? source.delay_minutes),
        isActive: source.isActive !== false && source.is_active !== false
    };
}

function normalizeRow(row = {}) {
    return {
        ruleId: normalizeText(row.rule_id || row.ruleId || row.id),
        tenantId: normalizeTenantId(row.tenant_id || row.tenantId || DEFAULT_TENANT_ID),
        eventKey: normalizeEventKey(row.event_key || row.eventKey),
        moduleId: normalizeModuleId(row.module_id || row.moduleId),
        templateName: normalizeText(row.template_name || row.templateName),
        templateLanguage: normalizeText(row.template_language || row.templateLanguage || 'es') || 'es',
        delayMinutes: normalizeDelayMinutes(row.delay_minutes ?? row.delayMinutes),
        isActive: row.is_active !== false && row.isActive !== false,
        createdAt: row.created_at || row.createdAt || null,
        updatedAt: row.updated_at || row.updatedAt || null
    };
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_automation_rules (
              rule_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
              tenant_id TEXT NOT NULL,
              event_key TEXT NOT NULL,
              module_id TEXT,
              template_name TEXT,
              template_language TEXT DEFAULT 'es',
              delay_minutes INTEGER DEFAULT 0,
              is_active BOOLEAN DEFAULT true,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW(),
              CONSTRAINT tenant_automation_rules_event_key_check
                CHECK (event_key IN ('quote_accepted', 'order_programmed', 'order_attended'))
            );
            CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant
              ON tenant_automation_rules(tenant_id, event_key, is_active);
        `);
        schemaReady = true;
    })().finally(() => {
        schemaPromise = null;
    });
    return schemaPromise;
}

async function readFileRules(tenantId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const rows = await readTenantJsonFile(AUTOMATIONS_FILE, {
        tenantId: cleanTenantId,
        defaultValue: []
    });
    return (Array.isArray(rows) ? rows : []).map(normalizeRow).filter((item) => item.ruleId);
}

async function writeFileRules(tenantId, rows) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    await writeTenantJsonFile(AUTOMATIONS_FILE, rows, { tenantId: cleanTenantId });
}

async function listAutomationRules(tenantId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() !== 'postgres') {
        const rows = await readFileRules(cleanTenantId);
        return rows.sort((a, b) => String(a.eventKey).localeCompare(String(b.eventKey), 'es'));
    }
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `SELECT rule_id, tenant_id, event_key, module_id, template_name, template_language,
                delay_minutes, is_active, created_at, updated_at
           FROM tenant_automation_rules
          WHERE tenant_id = $1
          ORDER BY event_key ASC, module_id ASC NULLS FIRST, created_at DESC`,
        [cleanTenantId]
    );
    return rows.map(normalizeRow);
}

async function createAutomationRule(tenantId, payload = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const clean = sanitizeRulePayload(payload);
    const ruleId = normalizeRuleId(payload.ruleId || payload.rule_id) || `tar_${crypto.randomUUID()}`;
    if (getStorageDriver() !== 'postgres') {
        const now = new Date().toISOString();
        const rows = await readFileRules(cleanTenantId);
        const item = normalizeRow({
            ruleId,
            tenantId: cleanTenantId,
            ...clean,
            createdAt: now,
            updatedAt: now
        });
        rows.push(item);
        await writeFileRules(cleanTenantId, rows);
        return item;
    }
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `INSERT INTO tenant_automation_rules
            (rule_id, tenant_id, event_key, module_id, template_name, template_language, delay_minutes, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING rule_id, tenant_id, event_key, module_id, template_name, template_language,
                   delay_minutes, is_active, created_at, updated_at`,
        [
            ruleId,
            cleanTenantId,
            clean.eventKey,
            clean.moduleId,
            clean.templateName,
            clean.templateLanguage,
            clean.delayMinutes,
            clean.isActive
        ]
    );
    return normalizeRow(rows[0]);
}

async function updateAutomationRule(tenantId, ruleId, payload = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanRuleId = normalizeRuleId(ruleId);
    if (!cleanRuleId) throw new Error('ruleId requerido.');
    const clean = sanitizeRulePayload(payload);
    if (getStorageDriver() !== 'postgres') {
        const rows = await readFileRules(cleanTenantId);
        const idx = rows.findIndex((item) => item.ruleId === cleanRuleId);
        if (idx < 0) throw new Error('Regla no encontrada.');
        const item = normalizeRow({
            ...rows[idx],
            ...clean,
            updatedAt: new Date().toISOString()
        });
        rows[idx] = item;
        await writeFileRules(cleanTenantId, rows);
        return item;
    }
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `UPDATE tenant_automation_rules
            SET event_key = $3,
                module_id = $4,
                template_name = $5,
                template_language = $6,
                delay_minutes = $7,
                is_active = $8,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND rule_id = $2
          RETURNING rule_id, tenant_id, event_key, module_id, template_name, template_language,
                    delay_minutes, is_active, created_at, updated_at`,
        [
            cleanTenantId,
            cleanRuleId,
            clean.eventKey,
            clean.moduleId,
            clean.templateName,
            clean.templateLanguage,
            clean.delayMinutes,
            clean.isActive
        ]
    );
    if (!rows[0]) throw new Error('Regla no encontrada.');
    return normalizeRow(rows[0]);
}

async function deleteAutomationRule(tenantId, ruleId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanRuleId = normalizeRuleId(ruleId);
    if (!cleanRuleId) throw new Error('ruleId requerido.');
    if (getStorageDriver() !== 'postgres') {
        const rows = await readFileRules(cleanTenantId);
        const next = rows.filter((item) => item.ruleId !== cleanRuleId);
        await writeFileRules(cleanTenantId, next);
        return { deleted: next.length !== rows.length };
    }
    await ensurePostgresSchema();
    const { rowCount } = await queryPostgres(
        'DELETE FROM tenant_automation_rules WHERE tenant_id = $1 AND rule_id = $2',
        [cleanTenantId, cleanRuleId]
    );
    return { deleted: rowCount > 0 };
}

async function listActiveRulesForEvent(tenantId, eventKey, { moduleId = '' } = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanEventKey = normalizeEventKey(eventKey);
    if (!cleanEventKey) return [];
    const cleanModuleId = normalizeModuleId(moduleId);
    const rows = await listAutomationRules(cleanTenantId);
    return rows.filter((item) => {
        if (!item.isActive || item.eventKey !== cleanEventKey || !item.templateName) return false;
        if (!item.moduleId) return true;
        return cleanModuleId && String(item.moduleId) === String(cleanModuleId);
    });
}

module.exports = {
    VALID_EVENT_KEYS,
    listAutomationRules,
    createAutomationRule,
    updateAutomationRule,
    deleteAutomationRule,
    listActiveRulesForEvent
};
