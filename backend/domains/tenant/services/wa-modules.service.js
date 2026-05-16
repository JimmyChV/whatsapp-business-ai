const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const {
    prepareModuleMetadataForSave,
    sanitizeModuleMetadataForPublic,
    resolveCloudConfigFromMetadata
} = require('../../security/services/meta-config-crypto.service');

const MODULES_FILE = 'wa_modules.json';
const ALLOWED_TRANSPORTS = new Set(['cloud']);
const ALLOWED_CHANNEL_TYPES = new Set(['whatsapp', 'instagram', 'messenger', 'webchat']);
const MAX_MODULES_PER_TENANT = Math.max(1, Number(process.env.WA_MODULES_MAX_PER_TENANT || 50));
let postgresSchemaReadyPromise = null;

function toText(value = '') {
    const text = String(value ?? '').trim();
    return text || '';
}

function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const lower = value.trim().toLowerCase();
        if (['true', 'yes', 'on'].includes(lower)) return true;
        if (['false', 'no', 'off'].includes(lower)) return false;
    }
    return Boolean(fallback);
}

function normalizeModuleId(value = '', fallback = '') {
    const source = toText(value || fallback);
    const normalized = source.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return normalized || '';
}

function normalizeStructuredModuleIdCandidate(value = '', size = 6) {
    const safeSize = Math.max(4, Math.floor(Number(size) || 6));
    const clean = String(value || '').trim().toUpperCase();
    const matcher = new RegExp('^MOD-[A-Z0-9]{' + safeSize + '}$');
    if (!matcher.test(clean)) return '';
    return clean;
}

function randomModuleSuffix(size = 6) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const safeSize = Math.max(4, Math.floor(Number(size) || 6));
    const bytes = crypto.randomBytes(safeSize * 2);
    let out = '';
    for (let i = 0; i < bytes.length && out.length < safeSize; i += 1) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out.slice(0, safeSize);
}

function normalizePhone(value = '') {
    const source = toText(value);
    if (!source) return null;
    const plusPrefix = source.startsWith('+') ? '+' : '';
    const digits = source.replace(/\D/g, '');
    if (!digits) return null;
    return plusPrefix ? `${plusPrefix}${digits}` : digits;
}

function normalizeTransport(value = '') {
    const mode = toText(value).toLowerCase();
    if (ALLOWED_TRANSPORTS.has(mode)) return mode;
    return 'cloud';
}

function normalizeChannelType(value = '', fallback = 'whatsapp') {
    const source = toText(value || fallback).toLowerCase();
    if (!source) return 'whatsapp';
    if (ALLOWED_CHANNEL_TYPES.has(source)) return source;
    const clean = source.replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    return clean || 'whatsapp';
}

function normalizeChannelAccountId(value = '', fallback = null) {
    const clean = toText(value || fallback || '');
    return clean || null;
}

function normalizeChannelLabel(value = '', fallback = '') {
    const clean = toText(value || fallback);
    return clean || null;
}

function normalizeAssignedUserIds(value = []) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const out = [];
    source.forEach((entry) => {
        const clean = toText(entry);
        if (!clean) return;
        if (seen.has(clean)) return;
        seen.add(clean);
        out.push(clean);
    });
    return out;
}

function sanitizeMetadata(value = {}, fallback = {}) {
    const base = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : fallback;
    return base && typeof base === 'object' && !Array.isArray(base)
        ? base
        : {};
}

function normalizeImageUrl(value = '') {
    const text = String(value || '').trim();
    if (!text) return null;
    return /^https?:\/\//i.test(text) ? text : null;
}

function normalizeScheduleId(value = null) {
    const clean = toText(value);
    return clean || null;
}

function normalizeAiConfig(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const withinHoursMode = ['review', 'off'].includes(toText(source.withinHoursMode))
        ? toText(source.withinHoursMode)
        : 'review';
    const outsideHoursMode = ['autonomous', 'review', 'off'].includes(toText(source.outsideHoursMode))
        ? toText(source.outsideHoursMode)
        : 'autonomous';
    const parsedWaitSeconds = Number.parseInt(String(source.waitSeconds ?? source.wait_seconds ?? ''), 10);
    const parsedWaitMinutes = Number.parseFloat(String(source.waitMinutes ?? source.wait_minutes ?? ''));
    const waitSeconds = Number.isFinite(parsedWaitSeconds)
        ? Math.max(5, Math.min(300, parsedWaitSeconds))
        : (Number.isFinite(parsedWaitMinutes) && parsedWaitMinutes > 0
            ? Math.max(5, Math.min(300, Math.round(parsedWaitMinutes * 60)))
            : 15);
    return {
        assistantName: toText(source.assistantName) || 'Patty',
        withinHoursMode,
        outsideHoursMode,
        waitSeconds
    };
}

function createUniqueModuleId(modules = []) {
    const existing = new Set(
        (Array.isArray(modules) ? modules : [])
            .map((entry) => String(entry?.moduleId || '').trim().toUpperCase())
            .filter(Boolean)
    );

    for (let i = 0; i < 1000; i += 1) {
        const candidate = 'MOD-' + randomModuleSuffix(6);
        if (!existing.has(candidate)) return candidate;
    }

    const fallback = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6).padStart(6, '0');
    return 'MOD-' + fallback;
}

function normalizeModule(input = {}, {
    fallbackId = '',
    preserveCreatedAt = null,
    previousMetadata = {}
} = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const moduleId = normalizeModuleId(
        source.moduleId
        || source.id
        || source.slug
        || fallbackId
        || source.name
    );
    if (!moduleId) throw new Error('moduleId invalido.');

    const nowIso = new Date().toISOString();
    const createdAt = toText(source.createdAt || preserveCreatedAt) || nowIso;
    const baseMetadata = sanitizeMetadata(source.metadata, previousMetadata);
    const metadata = prepareModuleMetadataForSave(baseMetadata, previousMetadata);

    const phoneNumber = normalizePhone(source.phoneNumber || source.phone || source.number);
    const channelType = normalizeChannelType(
        source.channelType
        || source.channel_type
        || source.channel
        || source.metadata?.channelType
        || 'whatsapp'
    );
    const channelAccountId = normalizeChannelAccountId(
        source.channelAccountId
        || source.channel_account_id
        || source.accountId
        || (channelType === 'whatsapp' ? phoneNumber : null)
    );
    const channelLabel = normalizeChannelLabel(
        source.channelLabel
        || source.channel_label
        || source.accountLabel
        || source.name
        || moduleId
    );

    return {
        moduleId,
        name: toText(source.name) || moduleId,
        phoneNumber,
        channelType,
        channelAccountId,
        channelLabel,
        transportMode: normalizeTransport(source.transportMode || source.transport || source.mode),
        imageUrl: normalizeImageUrl(source.imageUrl || source.image_url || source.logoUrl || source.logo_url),
        isActive: toBoolean(source.isActive, true),
        isDefault: toBoolean(source.isDefault, false),
        isSelected: toBoolean(source.isSelected, false),
        assignedUserIds: normalizeAssignedUserIds(source.assignedUserIds || source.assignedUsers || source.assignments || []),
        metadata,
        createdAt,
        updatedAt: nowIso
    };
}

function normalizeStoreState(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const rawModules = Array.isArray(source.modules) ? source.modules : [];
    const selectedHint = toText(source.selectedModuleId || source.activeModuleId || '');

    const byId = new Map();
    rawModules.forEach((entry, index) => {
        try {
            const fallbackId = `modulo_${index + 1}`;
            const normalized = normalizeModule(entry, {
                fallbackId,
                preserveCreatedAt: toText(entry?.createdAt || '')
            });
            if (!byId.has(normalized.moduleId)) {
                byId.set(normalized.moduleId, normalized);
            }
        } catch (_) {
            // skip invalid rows
        }
    });

    const modules = Array.from(byId.values());
    if (!modules.length) {
        return { modules: [], selectedModuleId: null };
    }

    let defaultModuleId = '';
    modules.forEach((module) => {
        if (module.isDefault && !defaultModuleId) defaultModuleId = module.moduleId;
        module.isDefault = false;
    });
    if (!defaultModuleId) {
        defaultModuleId = modules[0].moduleId;
    }
    const defaultModule = modules.find((module) => module.moduleId === defaultModuleId) || modules[0];
    if (defaultModule) defaultModule.isDefault = true;

    let selectedModuleId = selectedHint;
    if (!selectedModuleId) {
        const selectedFromRows = modules.find((module) => module.isSelected)?.moduleId || '';
        selectedModuleId = selectedFromRows || '';
    }

    const selectedExists = modules.some((module) => module.moduleId === selectedModuleId && module.isActive !== false);
    if (!selectedExists) {
        selectedModuleId = (modules.find((module) => module.isActive !== false) || defaultModule || modules[0])?.moduleId || '';
    }

    modules.forEach((module) => {
        module.isSelected = module.moduleId === selectedModuleId;
    });

    return {
        modules,
        selectedModuleId: selectedModuleId || null
    };
}

function missingRelation(error) {
    const code = String(error?.code || '').trim();
    if (code === '42P01') return true;
    const message = String(error?.message || '').toLowerCase();
    return message.includes('relation') && message.includes('wa_modules') && message.includes('does not exist');
}

async function ensurePostgresSchema() {
    if (postgresSchemaReadyPromise) return postgresSchemaReadyPromise;

    postgresSchemaReadyPromise = (async () => {
        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS wa_modules (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                module_id TEXT NOT NULL,
                module_name TEXT NOT NULL,
                phone_number TEXT,
                channel_type TEXT NOT NULL DEFAULT 'whatsapp',
                channel_account_id TEXT,
                channel_label TEXT,
                transport_mode TEXT NOT NULL DEFAULT 'cloud',
                image_url TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                is_default BOOLEAN NOT NULL DEFAULT FALSE,
                is_selected BOOLEAN NOT NULL DEFAULT FALSE,
                assigned_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, module_id)
            )`
        );
        await queryPostgres('ALTER TABLE IF EXISTS wa_modules ADD COLUMN IF NOT EXISTS image_url TEXT');
        await queryPostgres("ALTER TABLE IF EXISTS wa_modules ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'whatsapp'");
        await queryPostgres('ALTER TABLE IF EXISTS wa_modules ADD COLUMN IF NOT EXISTS channel_account_id TEXT');
        await queryPostgres('ALTER TABLE IF EXISTS wa_modules ADD COLUMN IF NOT EXISTS channel_label TEXT');
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_wa_modules_tenant_default
             ON wa_modules(tenant_id, is_default DESC, created_at ASC)`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_wa_modules_tenant_selected
             ON wa_modules(tenant_id, is_selected DESC, updated_at DESC)`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_wa_modules_tenant_channel
             ON wa_modules(tenant_id, channel_type, is_active DESC, updated_at DESC)`
        );
    })();

    try {
        await postgresSchemaReadyPromise;
    } catch (error) {
        postgresSchemaReadyPromise = null;
        throw error;
    }
}

async function loadFileStore(tenantId) {
    const parsed = await readTenantJsonFile(MODULES_FILE, {
        tenantId,
        defaultValue: { modules: [], selectedModuleId: null }
    });
    return normalizeStoreState(parsed);
}

async function saveFileStore(tenantId, store = {}) {
    const normalized = normalizeStoreState(store);
    await writeTenantJsonFile(MODULES_FILE, normalized, { tenantId });
    return normalized;
}

async function loadPostgresStore(tenantId) {
    const fetchRows = async () => {
        const { rows } = await queryPostgres(
            `SELECT
                module_id,
                module_name,
                phone_number,
                channel_type,
                channel_account_id,
                channel_label,
                transport_mode,
                image_url,
                is_active,
                is_default,
                is_selected,
                assigned_user_ids,
                metadata,
                created_at,
                updated_at
             FROM wa_modules
             WHERE tenant_id = $1
             ORDER BY created_at ASC, module_id ASC`,
            [tenantId]
        );
        return Array.isArray(rows) ? rows : [];
    };

    const mapRowsToStore = (rows = []) => {
        const modules = rows.map((row) => normalizeModule({
            moduleId: row.module_id,
            name: row.module_name,
            phoneNumber: row.phone_number,
            channelType: row.channel_type,
            channelAccountId: row.channel_account_id,
            channelLabel: row.channel_label,
            transportMode: row.transport_mode,
            imageUrl: row.image_url,
            isActive: row.is_active,
            isDefault: row.is_default,
            isSelected: row.is_selected,
            assignedUserIds: Array.isArray(row.assigned_user_ids) ? row.assigned_user_ids : [],
            metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        }, {
            fallbackId: '',
            preserveCreatedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            previousMetadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        }));

        return normalizeStoreState({ modules });
    };

    try {
        const rows = await fetchRows();
        return mapRowsToStore(rows);
    } catch (error) {
        if (missingRelation(error)) {
            await ensurePostgresSchema();
            const rows = await fetchRows();
            return mapRowsToStore(rows);
        }
        throw error;
    }
}

async function savePostgresStore(tenantId, store = {}, { schemaEnsured = false } = {}) {
    const normalized = normalizeStoreState(store);
    try {
        await queryPostgres('BEGIN');
        await queryPostgres('DELETE FROM wa_modules WHERE tenant_id = $1', [tenantId]);
        for (const module of normalized.modules) {
            await queryPostgres(
                `INSERT INTO wa_modules (
                    tenant_id,
                    module_id,
                    module_name,
                    phone_number,
                    channel_type,
                    channel_account_id,
                    channel_label,
                    transport_mode,
                    image_url,
                    is_active,
                    is_default,
                    is_selected,
                    assigned_user_ids,
                    metadata,
                    created_at,
                    updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::timestamptz, NOW()
                )`,
                [
                    tenantId,
                    module.moduleId,
                    module.name,
                    module.phoneNumber || null,
                    normalizeChannelType(module.channelType || 'whatsapp'),
                    normalizeChannelAccountId(module.channelAccountId, module.phoneNumber || null),
                    normalizeChannelLabel(module.channelLabel, module.name || module.moduleId),
                    module.transportMode,
                    module.imageUrl || null,
                    module.isActive !== false,
                    module.isDefault === true,
                    module.isSelected === true,
                    JSON.stringify(module.assignedUserIds || []),
                    JSON.stringify(module.metadata || {}),
                    module.createdAt || new Date().toISOString()
                ]
            );
        }
        await queryPostgres('COMMIT');
        return normalized;
    } catch (error) {
        try {
            await queryPostgres('ROLLBACK');
        } catch (_) {
            // no-op
        }

        if (missingRelation(error) && !schemaEnsured) {
            await ensurePostgresSchema();
            return savePostgresStore(tenantId, store, { schemaEnsured: true });
        }

        throw error;
    }
}

async function loadStore(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        await ensurePostgresSchema();
        return loadPostgresStore(cleanTenantId);
    }
    return loadFileStore(cleanTenantId);
}

async function saveStore(tenantId = DEFAULT_TENANT_ID, store = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        await ensurePostgresSchema();
        return savePostgresStore(cleanTenantId, store);
    }
    return saveFileStore(cleanTenantId, store);
}

function sanitizeModulePublic(module = {}) {
    const moduleId = toText(module.moduleId);
    const name = toText(module.name) || moduleId;
    const phoneNumber = module.phoneNumber || null;
    const channelType = normalizeChannelType(module.channelType || 'whatsapp');
    const metadata = sanitizeModuleMetadataForPublic(sanitizeMetadata(module.metadata));
    const scheduleId = normalizeScheduleId(metadata.scheduleId);
    const aiConfig = normalizeAiConfig(metadata.aiConfig);

    return {
        moduleId,
        name,
        phoneNumber,
        channelType,
        channelAccountId: normalizeChannelAccountId(module.channelAccountId, channelType === 'whatsapp' ? phoneNumber : null),
        channelLabel: normalizeChannelLabel(module.channelLabel, name || moduleId),
        transportMode: normalizeTransport(module.transportMode),
        imageUrl: normalizeImageUrl(module.imageUrl || module.image_url),
        isActive: module.isActive !== false,
        isDefault: module.isDefault === true,
        isSelected: module.isSelected === true,
        assignedUserIds: normalizeAssignedUserIds(module.assignedUserIds || []),
        scheduleId,
        aiConfig,
        metadata: {
            ...metadata,
            scheduleId,
            aiConfig
        },
        createdAt: toText(module.createdAt) || null,
        updatedAt: toText(module.updatedAt) || null
    };
}

function resolveModuleCloudConfig(module = {}) {
    const metadata = sanitizeMetadata(module.metadata);
    return resolveCloudConfigFromMetadata(metadata);
}

async function listModulesRuntime(tenantId = DEFAULT_TENANT_ID, { includeInactive = true, userId = '' } = {}) {
    const store = await loadStore(tenantId);
    return (Array.isArray(store.modules) ? store.modules : [])
        .filter((module) => includeInactive || module.isActive !== false)
        .filter((module) => moduleVisibleForUser(module, userId))
        .map((module) => ({
            ...module,
            channelType: normalizeChannelType(module.channelType || 'whatsapp'),
            channelAccountId: normalizeChannelAccountId(module.channelAccountId, module.phoneNumber || null),
            channelLabel: normalizeChannelLabel(module.channelLabel, module.name || module.moduleId),
            assignedUserIds: normalizeAssignedUserIds(module.assignedUserIds || []),
            metadata: sanitizeMetadata(module.metadata)
        }));
}

async function getModuleRuntime(tenantId = DEFAULT_TENANT_ID, moduleId = '', { userId = '' } = {}) {
    const cleanModuleId = normalizeModuleId(moduleId);
    if (!cleanModuleId) return null;

    const modules = await listModulesRuntime(tenantId, { includeInactive: true, userId });
    return modules.find((module) => String(module?.moduleId || '').toLowerCase() === cleanModuleId.toLowerCase()) || null;
}

function moduleVisibleForUser(module = {}, userId = '') {
    const cleanUserId = toText(userId);
    if (!cleanUserId) return true;
    const assignments = normalizeAssignedUserIds(module.assignedUserIds || []);
    if (!assignments.length) return true;
    return assignments.includes(cleanUserId);
}

async function listModules(tenantId = DEFAULT_TENANT_ID, { includeInactive = true, userId = '' } = {}) {
    const store = await loadStore(tenantId);
    const modules = (store.modules || [])
        .filter((module) => includeInactive || module.isActive !== false)
        .filter((module) => moduleVisibleForUser(module, userId))
        .sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return String(a.name || a.moduleId || '').localeCompare(String(b.name || b.moduleId || ''), 'es', { sensitivity: 'base' });
        })
        .map(sanitizeModulePublic);

    return modules;
}

async function getModule(tenantId = DEFAULT_TENANT_ID, moduleId = '', { userId = '' } = {}) {
    const cleanModuleId = normalizeModuleId(moduleId);
    if (!cleanModuleId) return null;
    const modules = await listModules(tenantId, { includeInactive: true, userId });
    return modules.find((module) => module.moduleId === cleanModuleId) || null;
}

async function createModule(tenantId = DEFAULT_TENANT_ID, payload = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const store = await loadStore(cleanTenantId);
    const modules = Array.isArray(store.modules) ? [...store.modules] : [];
    if (modules.length >= MAX_MODULES_PER_TENANT) {
        throw new Error(`Se alcanzo el limite de modulos WA por empresa (${MAX_MODULES_PER_TENANT}).`);
    }

    const requestedRaw = String(payload?.moduleId || payload?.id || '').trim();
    const requestedId = normalizeStructuredModuleIdCandidate(requestedRaw, 6);
    const candidateId = requestedId || createUniqueModuleId(modules);

    const preparedMetadata = prepareModuleMetadataForSave(sanitizeMetadata(payload?.metadata), {});
    const candidate = normalizeModule({
        ...payload,
        moduleId: candidateId,
        metadata: preparedMetadata
    }, {
        fallbackId: candidateId,
        previousMetadata: {}
    });

    if (modules.some((module) => module.moduleId === candidate.moduleId)) {
        throw new Error('Ya existe un modulo con ese ID.');
    }

    if (!modules.length) {
        candidate.isDefault = true;
        candidate.isSelected = true;
    } else if (candidate.isDefault) {
        modules.forEach((module) => { module.isDefault = false; });
    }

    if (candidate.isSelected) {
        modules.forEach((module) => { module.isSelected = false; });
    }

    modules.push(candidate);
    const nextStore = await saveStore(cleanTenantId, { modules });
    return sanitizeModulePublic((nextStore.modules || []).find((module) => module.moduleId === candidate.moduleId) || candidate);
}

async function updateModule(tenantId = DEFAULT_TENANT_ID, moduleId = '', patch = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = normalizeModuleId(moduleId);
    if (!cleanModuleId) throw new Error('moduleId invalido.');

    const store = await loadStore(cleanTenantId);
    const modules = Array.isArray(store.modules) ? [...store.modules] : [];
    const index = modules.findIndex((module) => module.moduleId === cleanModuleId);
    if (index < 0) throw new Error('Modulo WA no encontrado.');

    const current = modules[index];
    const renamedId = normalizeModuleId(patch?.moduleId || patch?.id || cleanModuleId);
    if (renamedId !== cleanModuleId && modules.some((module) => module.moduleId === renamedId)) {
        throw new Error('No se puede renombrar: ya existe ese moduleId.');
    }

    const patchHasMetadata = Object.prototype.hasOwnProperty.call(patch || {}, 'metadata');
    const preparedMetadata = patchHasMetadata
        ? prepareModuleMetadataForSave(sanitizeMetadata(patch.metadata), sanitizeMetadata(current.metadata))
        : sanitizeMetadata(current.metadata);

    const merged = normalizeModule({
        ...current,
        ...patch,
        metadata: preparedMetadata,
        moduleId: renamedId || cleanModuleId,
        createdAt: current.createdAt
    }, {
        fallbackId: cleanModuleId,
        preserveCreatedAt: current.createdAt,
        previousMetadata: sanitizeMetadata(current.metadata)
    });

    modules[index] = merged;

    if (merged.isDefault) {
        modules.forEach((module, moduleIndex) => {
            if (moduleIndex !== index) module.isDefault = false;
        });
    }

    if (merged.isSelected) {
        modules.forEach((module, moduleIndex) => {
            if (moduleIndex !== index) module.isSelected = false;
        });
    }

    const nextStore = await saveStore(cleanTenantId, { modules });
    return sanitizeModulePublic((nextStore.modules || []).find((module) => module.moduleId === merged.moduleId) || merged);
}

async function deleteModule(tenantId = DEFAULT_TENANT_ID, moduleId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = normalizeModuleId(moduleId);
    if (!cleanModuleId) throw new Error('moduleId invalido.');

    const store = await loadStore(cleanTenantId);
    const modules = Array.isArray(store.modules) ? [...store.modules] : [];
    const index = modules.findIndex((module) => module.moduleId === cleanModuleId);
    if (index < 0) throw new Error('Modulo WA no encontrado.');

    const target = modules[index];
    const shouldPromoteDefault = target?.isDefault === true;
    const shouldPromoteSelected = target?.isSelected === true || shouldPromoteDefault;

    modules[index] = {
        ...target,
        isActive: false,
        isSelected: false,
        isDefault: false,
        updatedAt: new Date().toISOString()
    };

    const fallbackIndex = modules.findIndex((module, moduleIndex) => moduleIndex !== index && module?.isActive !== false);
    if (fallbackIndex >= 0) {
        modules.forEach((module, moduleIndex) => {
            if (moduleIndex === fallbackIndex) {
                if (shouldPromoteSelected) module.isSelected = true;
                if (shouldPromoteDefault) module.isDefault = true;
                return;
            }
            if (shouldPromoteSelected) module.isSelected = false;
            if (shouldPromoteDefault) module.isDefault = false;
        });
    } else {
        modules.forEach((module) => {
            module.isSelected = false;
            module.isDefault = false;
        });
    }

    const selectedModuleId = modules.find((module) => module.isSelected)?.moduleId || null;
    await saveStore(cleanTenantId, { modules, selectedModuleId });
    return { ok: true, moduleId: cleanModuleId, deactivated: true };
}

async function setSelectedModule(tenantId = DEFAULT_TENANT_ID, moduleId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanModuleId = normalizeModuleId(moduleId);
    if (!cleanModuleId) throw new Error('moduleId invalido.');

    const store = await loadStore(cleanTenantId);
    const modules = Array.isArray(store.modules) ? [...store.modules] : [];
    let found = false;
    modules.forEach((module) => {
        const isTarget = module.moduleId === cleanModuleId;
        if (isTarget) found = true;
        module.isSelected = isTarget;
    });

    if (!found) throw new Error('Modulo WA no encontrado.');
    const nextStore = await saveStore(cleanTenantId, { modules, selectedModuleId: cleanModuleId });
    return sanitizeModulePublic((nextStore.modules || []).find((module) => module.moduleId === cleanModuleId) || null);
}

async function getSelectedModule(tenantId = DEFAULT_TENANT_ID, { userId = '' } = {}) {
    const modules = await listModules(tenantId, { includeInactive: false, userId });
    if (!modules.length) return null;
    const selected = modules.find((module) => module.isSelected) || modules.find((module) => module.isDefault) || modules[0];
    return selected || null;
}

module.exports = {
    ALLOWED_TRANSPORTS: Array.from(ALLOWED_TRANSPORTS),
    ALLOWED_CHANNEL_TYPES: Array.from(ALLOWED_CHANNEL_TYPES),
    MAX_MODULES_PER_TENANT,
    sanitizeModulePublic,
    normalizeAssignedUserIds,
    normalizeTransport,
    normalizeChannelType,
    resolveModuleCloudConfig,
    listModulesRuntime,
    getModuleRuntime,
    listModules,
    getModule,
    createModule,
    updateModule,
    deleteModule,
    setSelectedModule,
    getSelectedModule
};


