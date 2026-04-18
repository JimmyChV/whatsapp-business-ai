const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');
const waModuleService = require('../../tenant/services/wa-modules.service');
const waCloudClient = require('../../channels/services/whatsapp-cloud-client.service');

const STORE_FILE = 'meta_templates.json';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const VALID_USE_CASES = new Set(['campaign', 'individual', 'both', 'optin']);
const DEFAULT_LIST_FIELDS = [
    'id',
    'name',
    'language',
    'status',
    'category',
    'quality_score',
    'components',
    'rejected_reason'
].join(',');

let schemaReady = false;
let schemaPromise = null;

function toText(value = '') {
    return String(value ?? '').trim();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function nowIso() {
    return new Date().toISOString();
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

function normalizeTenant(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function normalizeScopeModuleId(value = '') {
    return toLower(value);
}

function normalizeStatus(value = '') {
    const status = toLower(value);
    if (!status) return 'pending';
    return status;
}

function normalizeQuality(value = '') {
    const source = value && typeof value === 'object' ? JSON.stringify(value) : value;
    const quality = toLower(source);
    if (!quality) return 'unknown';
    return quality;
}

function normalizeLanguage(value = '') {
    const language = toText(value || 'es').toLowerCase();
    return language || 'es';
}

function normalizeCategory(value = '') {
    const category = toLower(value || 'marketing');
    return category || 'marketing';
}

function normalizeUseCase(value = '') {
    const useCase = toLower(value || 'both') || 'both';
    return VALID_USE_CASES.has(useCase) ? useCase : 'both';
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

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function buildTemplateId() {
    if (typeof crypto.randomUUID === 'function') {
        return `tmpl_${crypto.randomUUID().replace(/-/g, '')}`;
    }
    return `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_meta_templates (
                template_id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                scope_module_id TEXT NOT NULL DEFAULT '',
                module_id TEXT NOT NULL,
                waba_id TEXT NOT NULL,
                phone_number_id TEXT NOT NULL,
                meta_template_id TEXT NULL,
                template_name TEXT NOT NULL,
                template_language TEXT NOT NULL DEFAULT 'es',
                use_case TEXT NOT NULL DEFAULT 'both' CHECK (use_case IN ('campaign', 'individual', 'both', 'optin')),
                category TEXT NOT NULL DEFAULT 'marketing',
                status TEXT NOT NULL DEFAULT 'pending',
                quality_score TEXT NOT NULL DEFAULT 'unknown',
                rejection_reason TEXT NULL,
                components_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                variable_map_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                raw_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                last_synced_at TIMESTAMPTZ NULL,
                last_status_event_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at TIMESTAMPTZ NULL
            )
        `);
        await queryPostgres(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_templates_tenant_scope_name_lang_active
            ON tenant_meta_templates(tenant_id, scope_module_id, template_name, template_language)
            WHERE deleted_at IS NULL
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_meta_templates_tenant_scope_status_updated
            ON tenant_meta_templates(tenant_id, scope_module_id, status, updated_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_meta_templates_tenant_scope_updated
            ON tenant_meta_templates(tenant_id, scope_module_id, updated_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_meta_templates_waba_meta_id
            ON tenant_meta_templates(waba_id, meta_template_id)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_meta_templates_tenant_scope_template_name
            ON tenant_meta_templates(tenant_id, scope_module_id, template_name)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_meta_templates_components_json_gin
            ON tenant_meta_templates USING GIN (components_json)
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

function normalizeStoredRecord(input = {}) {
    const source = isPlainObject(input) ? input : {};
    const createdAt = toIso(source.createdAt || source.created_at) || nowIso();
    const updatedAt = toIso(source.updatedAt || source.updated_at) || createdAt;
    return {
        templateId: toText(source.templateId || source.template_id) || buildTemplateId(),
        tenantId: normalizeTenant(source.tenantId || source.tenant_id || DEFAULT_TENANT_ID),
        scopeModuleId: normalizeScopeModuleId(source.scopeModuleId || source.scope_module_id || ''),
        moduleId: toText(source.moduleId || source.module_id),
        wabaId: toText(source.wabaId || source.waba_id),
        phoneNumberId: toText(source.phoneNumberId || source.phone_number_id),
        metaTemplateId: toText(source.metaTemplateId || source.meta_template_id) || null,
        templateName: toText(source.templateName || source.template_name),
        templateLanguage: normalizeLanguage(source.templateLanguage || source.template_language),
        useCase: normalizeUseCase(source.useCase || source.use_case || 'both'),
        category: normalizeCategory(source.category),
        status: normalizeStatus(source.status),
        qualityScore: normalizeQuality(source.qualityScore || source.quality_score),
        rejectionReason: toText(source.rejectionReason || source.rejection_reason) || null,
        componentsJson: Array.isArray(source.componentsJson || source.components_json)
            ? (source.componentsJson || source.components_json)
            : [],
        variableMapJson: isPlainObject(source.variableMapJson || source.variable_map_json)
            ? (source.variableMapJson || source.variable_map_json)
            : {},
        rawMetaJson: isPlainObject(source.rawMetaJson || source.raw_meta_json)
            ? (source.rawMetaJson || source.raw_meta_json)
            : {},
        lastSyncedAt: toIso(source.lastSyncedAt || source.last_synced_at),
        lastStatusEventAt: toIso(source.lastStatusEventAt || source.last_status_event_at),
        createdAt,
        updatedAt,
        deletedAt: toIso(source.deletedAt || source.deleted_at)
    };
}

function sanitizeTemplatePublic(input = {}) {
    const record = normalizeStoredRecord(input);
    return {
        templateId: record.templateId,
        tenantId: record.tenantId,
        scopeModuleId: record.scopeModuleId,
        moduleId: record.moduleId,
        wabaId: record.wabaId,
        phoneNumberId: record.phoneNumberId,
        metaTemplateId: record.metaTemplateId,
        templateName: record.templateName,
        templateLanguage: record.templateLanguage,
        useCase: record.useCase,
        category: record.category,
        status: record.status,
        qualityScore: record.qualityScore,
        rejectionReason: record.rejectionReason,
        componentsJson: Array.isArray(record.componentsJson) ? record.componentsJson : [],
        variableMapJson: isPlainObject(record.variableMapJson) ? record.variableMapJson : {},
        rawMetaJson: isPlainObject(record.rawMetaJson) ? record.rawMetaJson : {},
        lastSyncedAt: record.lastSyncedAt,
        lastStatusEventAt: record.lastStatusEventAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        deletedAt: record.deletedAt
    };
}

function normalizeStore(input = {}) {
    const source = isPlainObject(input) ? input : {};
    const items = Array.isArray(source.items)
        ? source.items
            .map((entry) => sanitizeTemplatePublic(entry))
            .filter((entry) => Boolean(entry.templateId))
        : [];
    return { items };
}

function normalizeTemplateFromMeta(metaTemplate = {}) {
    const source = isPlainObject(metaTemplate) ? metaTemplate : {};
    return {
        metaTemplateId: toText(source.id) || null,
        templateName: toText(source.name),
        templateLanguage: normalizeLanguage(source.language || source.locale || 'es'),
        useCase: normalizeUseCase(source.useCase || source.use_case || 'both'),
        category: normalizeCategory(source.category || 'marketing'),
        status: normalizeStatus(source.status || 'pending'),
        qualityScore: normalizeQuality(
            source.quality_score
            || source.qualityScore
            || source.quality_rating
            || 'unknown'
        ),
        rejectionReason: toText(
            source.rejected_reason
            || source.rejection_reason
            || source.reason
            || ''
        ) || null,
        componentsJson: Array.isArray(source.components) ? source.components : [],
        rawMetaJson: source
    };
}

async function resolveCloudModuleRuntime(tenantId = DEFAULT_TENANT_ID, moduleId = '') {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanModuleId = toText(moduleId);
    if (!cleanModuleId) throw new Error('moduleId requerido.');

    const module = await waModuleService.getModuleRuntime(cleanTenantId, cleanModuleId);
    if (!module) throw new Error('Modulo no encontrado.');

    const cloudConfig = waModuleService.resolveModuleCloudConfig(module);
    const wabaId = toText(cloudConfig?.wabaId);
    const phoneNumberId = toText(cloudConfig?.phoneNumberId);
    const systemUserToken = toText(cloudConfig?.systemUserToken);
    if (!wabaId || !phoneNumberId || !systemUserToken) {
        throw new Error('Cloud config incompleta para el modulo.');
    }

    return {
        tenantId: cleanTenantId,
        moduleId: toText(module.moduleId || cleanModuleId),
        scopeModuleId: normalizeScopeModuleId(module.moduleId || cleanModuleId),
        wabaId,
        phoneNumberId,
        systemUserToken
    };
}

function recordKey(record = {}) {
    return [
        normalizeScopeModuleId(record.scopeModuleId || ''),
        toText(record.templateName || '').toLowerCase(),
        normalizeLanguage(record.templateLanguage || 'es')
    ].join('::');
}

async function upsertTemplateRecord(tenantId = DEFAULT_TENANT_ID, input = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const source = sanitizeTemplatePublic({
        ...input,
        tenantId: cleanTenantId,
        templateId: toText(input.templateId || input.template_id) || buildTemplateId(),
        updatedAt: nowIso()
    });

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const key = recordKey(source);
        const nextItems = [...store.items];
        const index = nextItems.findIndex((entry) =>
            toText(entry.templateId) === source.templateId || recordKey(entry) === key
        );
        if (index >= 0) {
            const previous = sanitizeTemplatePublic(nextItems[index]);
            nextItems[index] = sanitizeTemplatePublic({
                ...previous,
                ...source,
                createdAt: previous.createdAt || source.createdAt
            });
        } else {
            nextItems.unshift(source);
        }
        await writeTenantJsonFile(STORE_FILE, { items: nextItems }, { tenantId: cleanTenantId });
        return sanitizeTemplatePublic(index >= 0 ? nextItems[index] : source);
    }

    await ensurePostgresSchema();
    const params = [
        source.templateId,
        cleanTenantId,
        source.scopeModuleId || '',
        source.moduleId,
        source.wabaId,
        source.phoneNumberId,
        source.metaTemplateId,
        source.templateName,
        source.templateLanguage,
        source.useCase,
        source.category,
        source.status,
        source.qualityScore,
        source.rejectionReason,
        JSON.stringify(source.componentsJson || []),
        JSON.stringify(source.variableMapJson || {}),
        JSON.stringify(source.rawMetaJson || {}),
        source.lastSyncedAt,
        source.lastStatusEventAt,
        source.createdAt,
        source.updatedAt,
        source.deletedAt
    ];
    const result = await queryPostgres(
        `INSERT INTO tenant_meta_templates (
            template_id, tenant_id, scope_module_id, module_id, waba_id, phone_number_id,
            meta_template_id, template_name, template_language, use_case, category, status, quality_score,
            rejection_reason, components_json, variable_map_json, raw_meta_json, last_synced_at, last_status_event_at,
            created_at, updated_at, deleted_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12, $13,
            $14, $15::jsonb, $16::jsonb, $17::jsonb, $18::timestamptz, $19::timestamptz,
            $20::timestamptz, $21::timestamptz, $22::timestamptz
        )
        ON CONFLICT (tenant_id, scope_module_id, template_name, template_language) WHERE deleted_at IS NULL
        DO UPDATE SET
            module_id = EXCLUDED.module_id,
            waba_id = EXCLUDED.waba_id,
            phone_number_id = EXCLUDED.phone_number_id,
            meta_template_id = COALESCE(EXCLUDED.meta_template_id, tenant_meta_templates.meta_template_id),
            use_case = EXCLUDED.use_case,
            category = EXCLUDED.category,
            status = EXCLUDED.status,
            quality_score = EXCLUDED.quality_score,
            rejection_reason = EXCLUDED.rejection_reason,
            components_json = COALESCE(EXCLUDED.components_json, tenant_meta_templates.components_json),
            variable_map_json = CASE
                WHEN EXCLUDED.variable_map_json IS NULL OR EXCLUDED.variable_map_json = '{}'::jsonb
                    THEN tenant_meta_templates.variable_map_json
                ELSE EXCLUDED.variable_map_json
            END,
            raw_meta_json = COALESCE(tenant_meta_templates.raw_meta_json, '{}'::jsonb) || COALESCE(EXCLUDED.raw_meta_json, '{}'::jsonb),
            last_synced_at = COALESCE(EXCLUDED.last_synced_at, tenant_meta_templates.last_synced_at),
            last_status_event_at = COALESCE(EXCLUDED.last_status_event_at, tenant_meta_templates.last_status_event_at),
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at
        RETURNING
            template_id, tenant_id, scope_module_id, module_id, waba_id, phone_number_id,
            meta_template_id, template_name, template_language, use_case, category, status, quality_score,
            rejection_reason, components_json, variable_map_json, raw_meta_json, last_synced_at, last_status_event_at,
            created_at, updated_at, deleted_at`,
        params
    );

    const row = Array.isArray(result?.rows) ? result.rows[0] : null;
    return sanitizeTemplatePublic(row || source);
}

async function getTemplateById(tenantId = DEFAULT_TENANT_ID, templateId = '') {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanTemplateId = toText(templateId);
    if (!cleanTemplateId) return null;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const found = store.items.find((entry) => toText(entry.templateId) === cleanTemplateId) || null;
        return found ? sanitizeTemplatePublic(found) : null;
    }

    try {
        await ensurePostgresSchema();
        const result = await queryPostgres(
            `SELECT
                template_id, tenant_id, scope_module_id, module_id, waba_id, phone_number_id,
                meta_template_id, template_name, template_language, use_case, category, status, quality_score,
                rejection_reason, components_json, variable_map_json, raw_meta_json, last_synced_at, last_status_event_at,
                created_at, updated_at, deleted_at
             FROM tenant_meta_templates
             WHERE tenant_id = $1
               AND template_id = $2
             LIMIT 1`,
            [cleanTenantId, cleanTemplateId]
        );
        const row = Array.isArray(result?.rows) ? result.rows[0] : null;
        return row ? sanitizeTemplatePublic(row) : null;
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function createTemplate(tenantId = DEFAULT_TENANT_ID, { moduleId = '', templatePayload = {}, useCase = 'both', variableMapJson = {} } = {}) {
    const runtime = await resolveCloudModuleRuntime(tenantId, moduleId);
    if (!isPlainObject(templatePayload)) {
        throw new Error('templatePayload requerido.');
    }
    const normalizedUseCase = normalizeUseCase(useCase);
    const graphCreated = await waCloudClient.createMessageTemplate(
        runtime.wabaId,
        templatePayload,
        { systemUserToken: runtime.systemUserToken }
    );

    const mergedMeta = {
        ...(isPlainObject(templatePayload) ? templatePayload : {}),
        ...(isPlainObject(graphCreated) ? graphCreated : {})
    };

    const normalizedMeta = normalizeTemplateFromMeta(mergedMeta);
    if (!normalizedMeta.templateName) {
        throw new Error('Meta no devolvio nombre de template valido.');
    }

    const persisted = await upsertTemplateRecord(runtime.tenantId, {
        templateId: buildTemplateId(),
        tenantId: runtime.tenantId,
        scopeModuleId: runtime.scopeModuleId,
        moduleId: runtime.moduleId,
        wabaId: runtime.wabaId,
        phoneNumberId: runtime.phoneNumberId,
        metaTemplateId: normalizedMeta.metaTemplateId,
        templateName: normalizedMeta.templateName,
        templateLanguage: normalizedMeta.templateLanguage,
        useCase: normalizedUseCase,
        category: normalizedMeta.category,
        status: normalizedMeta.status || 'pending',
        qualityScore: normalizedMeta.qualityScore,
        rejectionReason: normalizedMeta.rejectionReason,
        componentsJson: normalizedMeta.componentsJson,
        variableMapJson: isPlainObject(variableMapJson) ? variableMapJson : {},
        rawMetaJson: normalizedMeta.rawMetaJson,
        lastSyncedAt: nowIso(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: null
    });

    return {
        template: persisted,
        metaResponse: graphCreated
    };
}

async function listTemplates(tenantId = DEFAULT_TENANT_ID, {
    scopeModuleId = '',
    status = '',
    limit = DEFAULT_LIMIT,
    offset = 0
} = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanScope = normalizeScopeModuleId(scopeModuleId);
    const cleanStatus = normalizeStatus(status || '');
    const hasStatusFilter = Boolean(toText(status));
    const normalizedLimit = normalizeLimit(limit);
    const normalizedOffset = normalizeOffset(offset);

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const filtered = store.items
            .filter((entry) => !entry.deletedAt)
            .filter((entry) => !cleanScope || normalizeScopeModuleId(entry.scopeModuleId) === cleanScope)
            .filter((entry) => !hasStatusFilter || normalizeStatus(entry.status) === cleanStatus)
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        const items = filtered.slice(normalizedOffset, normalizedOffset + normalizedLimit).map((entry) => sanitizeTemplatePublic(entry));
        return { items, total: filtered.length, limit: normalizedLimit, offset: normalizedOffset };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId];
        const where = ['tenant_id = $1', 'deleted_at IS NULL'];

        if (cleanScope) {
            params.push(cleanScope);
            where.push(`scope_module_id = $${params.length}`);
        }
        if (hasStatusFilter) {
            params.push(cleanStatus);
            where.push(`status = $${params.length}`);
        }

        const whereSql = where.join(' AND ');
        const totalResult = await queryPostgres(
            `SELECT COUNT(*)::BIGINT AS total
             FROM tenant_meta_templates
             WHERE ${whereSql}`,
            params
        );

        const rowParams = [...params, normalizedLimit, normalizedOffset];
        const rowsResult = await queryPostgres(
            `SELECT
                template_id, tenant_id, scope_module_id, module_id, waba_id, phone_number_id,
                meta_template_id, template_name, template_language, use_case, category, status, quality_score,
                rejection_reason, components_json, variable_map_json, raw_meta_json, last_synced_at, last_status_event_at,
                created_at, updated_at, deleted_at
             FROM tenant_meta_templates
             WHERE ${whereSql}
             ORDER BY updated_at DESC
             LIMIT $${rowParams.length - 1}
             OFFSET $${rowParams.length}`,
            rowParams
        );
        return {
            items: (Array.isArray(rowsResult?.rows) ? rowsResult.rows : []).map((row) => sanitizeTemplatePublic(row)),
            total: Number(totalResult?.rows?.[0]?.total || 0),
            limit: normalizedLimit,
            offset: normalizedOffset
        };
    } catch (error) {
        if (missingRelation(error)) {
            return { items: [], total: 0, limit: normalizedLimit, offset: normalizedOffset };
        }
        throw error;
    }
}

async function getTemplateRecord(tenantId = DEFAULT_TENANT_ID, {
    templateName = '',
    moduleId = '',
    templateLanguage = ''
} = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanTemplateName = toText(templateName);
    const cleanModuleId = toText(moduleId);
    const cleanScope = normalizeScopeModuleId(cleanModuleId);
    const cleanLanguage = normalizeLanguage(templateLanguage || '');
    if (!cleanTemplateName) return null;

    const matchesTemplate = (entry = {}) => toLower(entry.templateName) === toLower(cleanTemplateName);
    const matchesModule = (entry = {}) => !cleanModuleId
        || toText(entry.moduleId) === cleanModuleId
        || normalizeScopeModuleId(entry.scopeModuleId) === cleanScope;
    const matchesLanguage = (entry = {}) => !toText(templateLanguage)
        || normalizeLanguage(entry.templateLanguage || '') === cleanLanguage;
    const sortByPriority = (left = {}, right = {}) => {
        const leftApproved = normalizeStatus(left.status) === 'approved' ? 1 : 0;
        const rightApproved = normalizeStatus(right.status) === 'approved' ? 1 : 0;
        if (rightApproved !== leftApproved) return rightApproved - leftApproved;
        return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
    };

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        return store.items
            .filter((entry) => !entry.deletedAt)
            .filter(matchesTemplate)
            .filter(matchesModule)
            .filter(matchesLanguage)
            .sort(sortByPriority)
            .map((entry) => sanitizeTemplatePublic(entry))[0] || null;
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId, cleanTemplateName.toLowerCase()];
        const where = [
            'tenant_id = $1',
            'deleted_at IS NULL',
            'LOWER(template_name) = $2'
        ];
        if (cleanScope) {
            params.push(cleanScope);
            where.push(`(scope_module_id = $${params.length} OR LOWER(module_id) = $${params.length})`);
        }
        if (toText(templateLanguage)) {
            params.push(cleanLanguage);
            where.push(`template_language = $${params.length}`);
        }
        const result = await queryPostgres(
            `SELECT
                template_id, tenant_id, scope_module_id, module_id, waba_id, phone_number_id,
                meta_template_id, template_name, template_language, use_case, category, status, quality_score,
                rejection_reason, components_json, variable_map_json, raw_meta_json, last_synced_at, last_status_event_at,
                created_at, updated_at, deleted_at
               FROM tenant_meta_templates
              WHERE ${where.join(' AND ')}
              ORDER BY CASE WHEN status = 'approved' THEN 0 ELSE 1 END ASC, updated_at DESC
              LIMIT 1`,
            params
        );
        const row = Array.isArray(result?.rows) ? result.rows[0] : null;
        return row ? sanitizeTemplatePublic(row) : null;
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function getTemplateComponents(tenantId = DEFAULT_TENANT_ID, {
    templateName = '',
    moduleId = '',
    templateLanguage = ''
} = {}) {
    const found = await getTemplateRecord(tenantId, { templateName, moduleId, templateLanguage });
    return Array.isArray(found?.componentsJson) ? found.componentsJson : [];
}

async function deleteTemplate(tenantId = DEFAULT_TENANT_ID, { templateId = '', moduleId = '' } = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanTemplateId = toText(templateId);
    if (!cleanTemplateId) throw new Error('templateId requerido.');

    const existing = await getTemplateById(cleanTenantId, cleanTemplateId);
    if (!existing || existing.deletedAt) {
        throw new Error('Template no encontrado.');
    }

    const targetModuleId = toText(moduleId || existing.moduleId);
    const runtime = await resolveCloudModuleRuntime(cleanTenantId, targetModuleId);
    await waCloudClient.deleteMessageTemplate(
        runtime.wabaId,
        existing.templateName,
        { systemUserToken: runtime.systemUserToken }
    );

    const deleted = await upsertTemplateRecord(cleanTenantId, {
        ...existing,
        moduleId: runtime.moduleId,
        scopeModuleId: runtime.scopeModuleId,
        wabaId: runtime.wabaId,
        phoneNumberId: runtime.phoneNumberId,
        status: 'deleted',
        deletedAt: nowIso(),
        updatedAt: nowIso(),
        lastStatusEventAt: nowIso()
    });
    return { template: deleted };
}

async function upsertTemplateFromMeta(tenantId = DEFAULT_TENANT_ID, { moduleId = '', metaTemplate = {} } = {}) {
    const runtime = await resolveCloudModuleRuntime(tenantId, moduleId);
    const normalizedMeta = normalizeTemplateFromMeta(metaTemplate);
    if (!normalizedMeta.templateName) {
        throw new Error('metaTemplate invalido: name requerido.');
    }
    const stored = await upsertTemplateRecord(runtime.tenantId, {
        tenantId: runtime.tenantId,
        scopeModuleId: runtime.scopeModuleId,
        moduleId: runtime.moduleId,
        wabaId: runtime.wabaId,
        phoneNumberId: runtime.phoneNumberId,
        metaTemplateId: normalizedMeta.metaTemplateId,
        templateName: normalizedMeta.templateName,
        templateLanguage: normalizedMeta.templateLanguage,
        useCase: normalizedMeta.useCase,
        category: normalizedMeta.category,
        status: normalizedMeta.status || 'pending',
        qualityScore: normalizedMeta.qualityScore,
        rejectionReason: normalizedMeta.rejectionReason,
        componentsJson: normalizedMeta.componentsJson,
        rawMetaJson: normalizedMeta.rawMetaJson,
        lastSyncedAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: null
    });
    return stored;
}

async function syncTemplatesFromMeta(tenantId = DEFAULT_TENANT_ID, { moduleId = '' } = {}) {
    const runtime = await resolveCloudModuleRuntime(tenantId, moduleId);
    const syncedItems = [];
    const seenKeys = new Set();
    let afterCursor = '';
    let guard = 0;

    while (guard < 200) {
        guard += 1;
        const page = await waCloudClient.listMessageTemplates(runtime.wabaId, {
            systemUserToken: runtime.systemUserToken,
            fields: DEFAULT_LIST_FIELDS,
            limit: 100,
            after: afterCursor
        });
        const rows = Array.isArray(page?.data) ? page.data : [];
        for (const row of rows) {
            const stored = await upsertTemplateFromMeta(runtime.tenantId, {
                moduleId: runtime.moduleId,
                metaTemplate: row
            });
            syncedItems.push(stored);
            seenKeys.add(recordKey(stored));
        }
        const next = toText(page?.paging?.cursors?.after);
        if (!next || next === afterCursor) break;
        afterCursor = next;
    }

    const listed = await listTemplates(runtime.tenantId, {
        scopeModuleId: runtime.scopeModuleId,
        limit: MAX_LIMIT,
        offset: 0
    });
    for (const existing of listed.items) {
        const key = recordKey(existing);
        if (seenKeys.has(key)) continue;
        await upsertTemplateRecord(runtime.tenantId, {
            ...existing,
            status: existing.status === 'deleted' ? 'deleted' : 'disabled',
            updatedAt: nowIso(),
            lastSyncedAt: nowIso()
        });
    }

    return {
        moduleId: runtime.moduleId,
        scopeModuleId: runtime.scopeModuleId,
        totalSynced: syncedItems.length,
        items: syncedItems
    };
}

async function applyTemplateWebhookStatusUpdate(tenantId = DEFAULT_TENANT_ID, {
    templateName = '',
    newStatus = '',
    reason = '',
    wabaId = '',
    rawPayload = {}
} = {}) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanName = toText(templateName);
    if (!cleanName) return { updatedCount: 0, items: [] };
    const normalizedStatus = normalizeStatus(newStatus || 'pending');
    const cleanWabaId = toText(wabaId);
    const at = nowIso();

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeStore(await readTenantJsonFile(STORE_FILE, { tenantId: cleanTenantId, defaultValue: {} }));
        const nextItems = [...store.items];
        const updated = [];
        nextItems.forEach((entry, index) => {
            const sameName = toText(entry.templateName).toLowerCase() === cleanName.toLowerCase();
            const sameWaba = !cleanWabaId || toText(entry.wabaId) === cleanWabaId;
            if (!sameName || !sameWaba || entry.deletedAt) return;
            const merged = sanitizeTemplatePublic({
                ...entry,
                status: normalizedStatus,
                rejectionReason: toText(reason) || toText(entry.rejectionReason) || null,
                lastStatusEventAt: at,
                updatedAt: at,
                rawMetaJson: {
                    ...(isPlainObject(entry.rawMetaJson) ? entry.rawMetaJson : {}),
                    lastWebhookEvent: isPlainObject(rawPayload) ? rawPayload : {}
                }
            });
            nextItems[index] = merged;
            updated.push(merged);
        });
        if (updated.length > 0) {
            await writeTenantJsonFile(STORE_FILE, { items: nextItems }, { tenantId: cleanTenantId });
        }
        return { updatedCount: updated.length, items: updated };
    }

    try {
        await ensurePostgresSchema();
        const params = [cleanTenantId, cleanName.toLowerCase(), normalizedStatus, toText(reason) || null, at, JSON.stringify(isPlainObject(rawPayload) ? rawPayload : {})];
        const where = ['tenant_id = $1', 'LOWER(template_name) = $2', 'deleted_at IS NULL'];
        if (cleanWabaId) {
            params.push(cleanWabaId);
            where.push(`waba_id = $${params.length}`);
        }
        const result = await queryPostgres(
            `UPDATE tenant_meta_templates
             SET status = $3,
                 rejection_reason = COALESCE($4, rejection_reason),
                 last_status_event_at = $5::timestamptz,
                 raw_meta_json = COALESCE(raw_meta_json, '{}'::jsonb) || jsonb_build_object('lastWebhookEvent', $6::jsonb),
                 updated_at = $5::timestamptz
             WHERE ${where.join(' AND ')}
             RETURNING
                template_id, tenant_id, scope_module_id, module_id, waba_id, phone_number_id,
                meta_template_id, template_name, template_language, use_case, category, status, quality_score,
                rejection_reason, components_json, variable_map_json, raw_meta_json, last_synced_at, last_status_event_at,
                created_at, updated_at, deleted_at`,
            params
        );
        const items = (Array.isArray(result?.rows) ? result.rows : []).map((row) => sanitizeTemplatePublic(row));
        return { updatedCount: items.length, items };
    } catch (error) {
        if (missingRelation(error)) return { updatedCount: 0, items: [] };
        throw error;
    }
}

module.exports = {
    createTemplate,
    listTemplates,
    getTemplateRecord,
    getTemplateComponents,
    deleteTemplate,
    syncTemplatesFromMeta,
    upsertTemplateFromMeta,
    applyTemplateWebhookStatusUpdate
};
