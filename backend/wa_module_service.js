const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

const MODULES_FILE = 'wa_modules.json';
const ALLOWED_TRANSPORTS = new Set(['webjs', 'cloud']);
const MAX_MODULES_PER_TENANT = Math.max(1, Number(process.env.WA_MODULES_MAX_PER_TENANT || 50));

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
    const source = toText(value || fallback).toLowerCase();
    const normalized = source.replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return normalized || '';
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
    return 'webjs';
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

function sanitizeMetadata(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}

function normalizeModule(input = {}, {
    fallbackId = '',
    preserveCreatedAt = null
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

    return {
        moduleId,
        name: toText(source.name) || moduleId,
        phoneNumber: normalizePhone(source.phoneNumber || source.phone || source.number),
        transportMode: normalizeTransport(source.transportMode || source.transport || source.mode),
        isActive: toBoolean(source.isActive, true),
        isDefault: toBoolean(source.isDefault, false),
        isSelected: toBoolean(source.isSelected, false),
        assignedUserIds: normalizeAssignedUserIds(source.assignedUserIds || source.assignedUsers || source.assignments || []),
        metadata: sanitizeMetadata(source.metadata),
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
    return String(error?.code || '').trim() === '42P01';
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
    try {
        const { rows } = await queryPostgres(
            `SELECT
                module_id,
                module_name,
                phone_number,
                transport_mode,
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

        const modules = (Array.isArray(rows) ? rows : []).map((row) => normalizeModule({
            moduleId: row.module_id,
            name: row.module_name,
            phoneNumber: row.phone_number,
            transportMode: row.transport_mode,
            isActive: row.is_active,
            isDefault: row.is_default,
            isSelected: row.is_selected,
            assignedUserIds: Array.isArray(row.assigned_user_ids) ? row.assigned_user_ids : [],
            metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        }, {
            fallbackId: '',
            preserveCreatedAt: row.created_at ? new Date(row.created_at).toISOString() : null
        }));

        return normalizeStoreState({ modules });
    } catch (error) {
        if (missingRelation(error)) {
            return normalizeStoreState({ modules: [], selectedModuleId: null });
        }
        throw error;
    }
}

async function savePostgresStore(tenantId, store = {}) {
    const normalized = normalizeStoreState(store);
    await queryPostgres('BEGIN');
    try {
        await queryPostgres('DELETE FROM wa_modules WHERE tenant_id = $1', [tenantId]);
        for (const module of normalized.modules) {
            await queryPostgres(
                `INSERT INTO wa_modules (
                    tenant_id,
                    module_id,
                    module_name,
                    phone_number,
                    transport_mode,
                    is_active,
                    is_default,
                    is_selected,
                    assigned_user_ids,
                    metadata,
                    created_at,
                    updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::timestamptz, NOW()
                )`,
                [
                    tenantId,
                    module.moduleId,
                    module.name,
                    module.phoneNumber || null,
                    module.transportMode,
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
        await queryPostgres('ROLLBACK');
        throw error;
    }
}

async function loadStore(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') return loadPostgresStore(cleanTenantId);
    return loadFileStore(cleanTenantId);
}

async function saveStore(tenantId = DEFAULT_TENANT_ID, store = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') return savePostgresStore(cleanTenantId, store);
    return saveFileStore(cleanTenantId, store);
}

function sanitizeModulePublic(module = {}) {
    return {
        moduleId: toText(module.moduleId),
        name: toText(module.name),
        phoneNumber: module.phoneNumber || null,
        transportMode: normalizeTransport(module.transportMode),
        isActive: module.isActive !== false,
        isDefault: module.isDefault === true,
        isSelected: module.isSelected === true,
        assignedUserIds: normalizeAssignedUserIds(module.assignedUserIds || []),
        metadata: sanitizeMetadata(module.metadata),
        createdAt: toText(module.createdAt) || null,
        updatedAt: toText(module.updatedAt) || null
    };
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

    const candidate = normalizeModule(payload, {
        fallbackId: normalizeModuleId(payload?.name || `modulo_${modules.length + 1}`)
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

    const merged = normalizeModule({
        ...current,
        ...patch,
        moduleId: renamedId || cleanModuleId,
        createdAt: current.createdAt
    }, {
        fallbackId: cleanModuleId,
        preserveCreatedAt: current.createdAt
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
    const modules = (Array.isArray(store.modules) ? store.modules : []).filter((module) => module.moduleId !== cleanModuleId);
    await saveStore(cleanTenantId, { modules });
    return { ok: true };
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
    MAX_MODULES_PER_TENANT,
    sanitizeModulePublic,
    normalizeAssignedUserIds,
    normalizeTransport,
    listModules,
    getModule,
    createModule,
    updateModule,
    deleteModule,
    setSelectedModule,
    getSelectedModule
};
