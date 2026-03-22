const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../persistence_runtime');
const {
    encryptSecret,
    decryptSecretFully,
    maskSecret,
    isEncryptedValue
} = require('../../security/services/meta-config-crypto.service');

const CATALOGS_FILE = 'tenant_catalogs.json';
const ALLOWED_CATALOG_SOURCES = new Set(['local', 'woocommerce', 'meta']);
const DEFAULT_PAGE_SIZE = 100;
let postgresSchemaReadyPromise = null;

function toText(value = '') {
    const text = String(value || '').trim();
    return text || '';
}

function toBool(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const clean = value.trim().toLowerCase();
        if (['true', 'yes', 'on'].includes(clean)) return true;
        if (['false', 'no', 'off'].includes(clean)) return false;
    }
    return Boolean(fallback);
}

function normalizePositiveInteger(value, fallback = 1, { min = 1, max = 2000 } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.floor(parsed);
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
}

function normalizeCatalogSource(value = '', fallback = 'local') {
    const source = String(value || '').trim().toLowerCase();
    if (ALLOWED_CATALOG_SOURCES.has(source)) return source;
    return ALLOWED_CATALOG_SOURCES.has(fallback) ? fallback : 'local';
}

function normalizeCatalogIdCandidate(value = '', size = 6) {
    const clean = String(value || '').trim().toUpperCase();
    const safeSize = Math.max(4, Math.floor(Number(size) || 6));
    const matcher = new RegExp('^CAT-[A-Z0-9]{' + safeSize + '}$');
    if (!matcher.test(clean)) return '';
    return clean;
}

function randomCatalogSuffix(size = 6) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const safeSize = Math.max(4, Math.floor(Number(size) || 6));
    const bytes = crypto.randomBytes(safeSize * 2);
    let out = '';
    for (let i = 0; i < bytes.length && out.length < safeSize; i += 1) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out.slice(0, safeSize);
}

function createUniqueCatalogId(catalogs = []) {
    const existing = new Set(
        (Array.isArray(catalogs) ? catalogs : [])
            .map((entry) => String(entry?.catalogId || '').trim().toUpperCase())
            .filter(Boolean)
    );

    for (let i = 0; i < 1000; i += 1) {
        const candidate = 'CAT-' + randomCatalogSuffix(6);
        if (!existing.has(candidate)) return candidate;
    }

    const fallback = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6).padStart(6, '0');
    return 'CAT-' + fallback;
}

function normalizeSecretForStorage(incomingValue, currentValue = null) {
    if (incomingValue === undefined) return currentValue || null;
    if (incomingValue === null) return null;
    const clean = String(incomingValue || '').trim();
    if (!clean) return null;
    if (isEncryptedValue(clean)) return clean;
    return encryptSecret(clean);
}

function normalizeCatalogConfig(input = {}, previous = {}, sourceType = 'local') {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const current = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};

    const incomingWoo = source?.woocommerce && typeof source.woocommerce === 'object' ? source.woocommerce : {};
    const currentWoo = current?.woocommerce && typeof current.woocommerce === 'object' ? current.woocommerce : {};

    return {
        local: {
            enabled: sourceType === 'local' ? true : toBool(source?.local?.enabled, true)
        },
        woocommerce: {
            enabled: sourceType === 'woocommerce',
            baseUrl: toText(incomingWoo.baseUrl || currentWoo.baseUrl) || null,
            perPage: normalizePositiveInteger(incomingWoo.perPage ?? currentWoo.perPage, 100, { min: 10, max: 500 }),
            maxPages: normalizePositiveInteger(incomingWoo.maxPages ?? currentWoo.maxPages, 10, { min: 1, max: 200 }),
            includeOutOfStock: toBool(incomingWoo.includeOutOfStock ?? currentWoo.includeOutOfStock, true),
            consumerKey: normalizeSecretForStorage(
                Object.prototype.hasOwnProperty.call(incomingWoo, 'consumerKey') ? incomingWoo.consumerKey : undefined,
                currentWoo.consumerKey || null
            ),
            consumerSecret: normalizeSecretForStorage(
                Object.prototype.hasOwnProperty.call(incomingWoo, 'consumerSecret') ? incomingWoo.consumerSecret : undefined,
                currentWoo.consumerSecret || null
            )
        },
        meta: {
            enabled: sourceType === 'meta'
        }
    };
}

function normalizeCatalog(input = {}, {
    fallbackId = '',
    preserveCreatedAt = '',
    previousConfig = {}
} = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const nowIso = new Date().toISOString();
    const catalogId = normalizeCatalogIdCandidate(
        source.catalogId || source.id || source.slug || fallbackId || ''
    );
    if (!catalogId) throw new Error('catalogId invalido.');

    const sourceType = normalizeCatalogSource(source.sourceType || source.source || source.type || 'local');
    const createdAt = toText(source.createdAt || preserveCreatedAt) || nowIso;
    const config = normalizeCatalogConfig(source.config, previousConfig, sourceType);

    return {
        catalogId,
        name: toText(source.name) || catalogId,
        description: toText(source.description) || null,
        sourceType,
        isActive: toBool(source.isActive, true),
        isDefault: toBool(source.isDefault, false),
        config,
        createdAt,
        updatedAt: nowIso
    };
}

function normalizeStoreState(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const rows = Array.isArray(source.catalogs) ? source.catalogs : [];
    const byId = new Map();

    rows.forEach((row) => {
        try {
            const fallbackId = createUniqueCatalogId(Array.from(byId.values()));
            const normalized = normalizeCatalog(row, {
                fallbackId,
                preserveCreatedAt: toText(row?.createdAt || ''),
                previousConfig: row?.config
            });
            if (!byId.has(normalized.catalogId)) byId.set(normalized.catalogId, normalized);
        } catch (_) {
            // skip invalid rows
        }
    });

    const catalogs = Array.from(byId.values()).sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return String(a.name || a.catalogId).localeCompare(String(b.name || b.catalogId), 'es', { sensitivity: 'base' });
    });

    if (!catalogs.length) {
        return { catalogs: [] };
    }

    let defaultCatalogId = catalogs.find((item) => item.isDefault)?.catalogId || '';
    if (!defaultCatalogId) defaultCatalogId = catalogs[0].catalogId;

    catalogs.forEach((catalog) => {
        catalog.isDefault = catalog.catalogId === defaultCatalogId;
    });

    return { catalogs };
}

function sanitizeCatalogPublic(catalog = {}) {
    const woo = catalog?.config?.woocommerce && typeof catalog.config.woocommerce === 'object'
        ? catalog.config.woocommerce
        : {};
    const consumerKeyPlain = decryptSecretFully(woo.consumerKey || '');
    const consumerSecretPlain = decryptSecretFully(woo.consumerSecret || '');

    return {
        catalogId: String(catalog.catalogId || '').trim(),
        name: String(catalog.name || '').trim() || String(catalog.catalogId || '').trim(),
        description: String(catalog.description || '').trim() || null,
        sourceType: normalizeCatalogSource(catalog.sourceType || 'local'),
        isActive: catalog.isActive !== false,
        isDefault: catalog.isDefault === true,
        config: {
            local: {
                enabled: catalog?.config?.local?.enabled !== false
            },
            woocommerce: {
                enabled: catalog?.config?.woocommerce?.enabled === true,
                baseUrl: String(woo.baseUrl || '').trim() || null,
                perPage: normalizePositiveInteger(woo.perPage, 100, { min: 10, max: 500 }),
                maxPages: normalizePositiveInteger(woo.maxPages, 10, { min: 1, max: 200 }),
                includeOutOfStock: woo.includeOutOfStock !== false,
                hasConsumerKey: Boolean(String(woo.consumerKey || '').trim()),
                hasConsumerSecret: Boolean(String(woo.consumerSecret || '').trim()),
                consumerKeyMasked: consumerKeyPlain ? maskSecret(consumerKeyPlain) : null,
                consumerSecretMasked: consumerSecretPlain ? maskSecret(consumerSecretPlain) : null
            },
            meta: {
                enabled: catalog?.config?.meta?.enabled === true
            }
        },
        createdAt: toText(catalog.createdAt) || null,
        updatedAt: toText(catalog.updatedAt) || null
    };
}

function sanitizeCatalogRuntime(catalog = {}) {
    const publicView = sanitizeCatalogPublic(catalog);
    return {
        ...publicView,
        config: {
            ...publicView.config,
            woocommerce: {
                ...publicView.config.woocommerce,
                consumerKey: toText(decryptSecretFully(catalog?.config?.woocommerce?.consumerKey || '')) || null,
                consumerSecret: toText(decryptSecretFully(catalog?.config?.woocommerce?.consumerSecret || '')) || null
            }
        }
    };
}

function missingRelation(error) {
    const code = String(error?.code || '').trim();
    if (code === '42P01') return true;
    const message = String(error?.message || '').toLowerCase();
    return message.includes('relation') && message.includes('tenant_catalogs') && message.includes('does not exist');
}

async function ensurePostgresSchema() {
    if (postgresSchemaReadyPromise) return postgresSchemaReadyPromise;

    postgresSchemaReadyPromise = (async () => {
        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS tenant_catalogs (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                catalog_id TEXT NOT NULL,
                catalog_name TEXT NOT NULL,
                description TEXT,
                source_type TEXT NOT NULL DEFAULT 'local',
                config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                is_default BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, catalog_id)
            )`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_tenant_catalogs_tenant_active
             ON tenant_catalogs(tenant_id, is_active DESC, is_default DESC, updated_at DESC)`
        );
    })();

    try {
        await postgresSchemaReadyPromise;
    } catch (error) {
        postgresSchemaReadyPromise = null;
        throw error;
    }
}

async function loadStoreFromFile(tenantId = DEFAULT_TENANT_ID) {
    const parsed = await readTenantJsonFile(CATALOGS_FILE, {
        tenantId,
        defaultValue: { catalogs: [] }
    });
    return normalizeStoreState(parsed);
}

async function saveStoreToFile(tenantId = DEFAULT_TENANT_ID, store = {}) {
    const normalized = normalizeStoreState(store);
    await writeTenantJsonFile(CATALOGS_FILE, normalized, { tenantId });
    return normalized;
}

async function loadStoreFromPostgres(tenantId = DEFAULT_TENANT_ID) {
    const runQuery = async () => {
        const { rows } = await queryPostgres(
            `SELECT
                catalog_id,
                catalog_name,
                description,
                source_type,
                config_json,
                is_active,
                is_default,
                created_at,
                updated_at
             FROM tenant_catalogs
             WHERE tenant_id = $1
             ORDER BY is_default DESC, updated_at DESC, catalog_id ASC`,
            [tenantId]
        );
        return Array.isArray(rows) ? rows : [];
    };

    const mapRows = (rows = []) => normalizeStoreState({
        catalogs: rows.map((row) => ({
            catalogId: row.catalog_id,
            name: row.catalog_name,
            description: row.description,
            sourceType: row.source_type,
            config: row.config_json && typeof row.config_json === 'object' ? row.config_json : {},
            isActive: row.is_active,
            isDefault: row.is_default,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        }))
    });

    try {
        const rows = await runQuery();
        return mapRows(rows);
    } catch (error) {
        if (missingRelation(error)) {
            await ensurePostgresSchema();
            const rows = await runQuery();
            return mapRows(rows);
        }
        throw error;
    }
}

async function saveStoreToPostgres(tenantId = DEFAULT_TENANT_ID, store = {}, { schemaEnsured = false } = {}) {
    const normalized = normalizeStoreState(store);
    try {
        await queryPostgres('BEGIN');
        await queryPostgres('DELETE FROM tenant_catalogs WHERE tenant_id = $1', [tenantId]);
        for (const catalog of normalized.catalogs) {
            await queryPostgres(
                `INSERT INTO tenant_catalogs (
                    tenant_id,
                    catalog_id,
                    catalog_name,
                    description,
                    source_type,
                    config_json,
                    is_active,
                    is_default,
                    created_at,
                    updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz, NOW()
                )`,
                [
                    tenantId,
                    catalog.catalogId,
                    catalog.name,
                    catalog.description || null,
                    catalog.sourceType,
                    JSON.stringify(catalog.config || {}),
                    catalog.isActive !== false,
                    catalog.isDefault === true,
                    catalog.createdAt || new Date().toISOString()
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
            return saveStoreToPostgres(tenantId, store, { schemaEnsured: true });
        }
        throw error;
    }
}

async function loadStore(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        await ensurePostgresSchema();
        return loadStoreFromPostgres(cleanTenantId);
    }
    return loadStoreFromFile(cleanTenantId);
}

async function saveStore(tenantId = DEFAULT_TENANT_ID, store = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    if (getStorageDriver() === 'postgres') {
        await ensurePostgresSchema();
        return saveStoreToPostgres(cleanTenantId, store);
    }
    return saveStoreToFile(cleanTenantId, store);
}

function applyRuntimeView(catalog, runtime = false) {
    return runtime ? sanitizeCatalogRuntime(catalog) : sanitizeCatalogPublic(catalog);
}

async function listCatalogs(tenantId = DEFAULT_TENANT_ID, {
    includeInactive = true,
    runtime = false
} = {}) {
    const store = await loadStore(tenantId);
    return (Array.isArray(store.catalogs) ? store.catalogs : [])
        .filter((catalog) => includeInactive || catalog.isActive !== false)
        .sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return String(a.name || a.catalogId).localeCompare(String(b.name || b.catalogId), 'es', { sensitivity: 'base' });
        })
        .map((catalog) => applyRuntimeView(catalog, runtime));
}

async function ensureDefaultCatalog(tenantId = DEFAULT_TENANT_ID) {
    const store = await loadStore(tenantId);
    const catalogs = Array.isArray(store.catalogs) ? [...store.catalogs] : [];
    if (catalogs.length > 0) {
        const hasDefault = catalogs.some((entry) => entry?.isDefault === true);
        if (!hasDefault) {
            catalogs[0].isDefault = true;
            await saveStore(tenantId, { catalogs });
        }
        return listCatalogs(tenantId, { includeInactive: true, runtime: false });
    }

    const defaultCatalogId = createUniqueCatalogId(catalogs);
    const created = normalizeCatalog({
        catalogId: defaultCatalogId,
        name: 'Catalogo principal',
        sourceType: 'local',
        isActive: true,
        isDefault: true,
        config: {
            local: { enabled: true }
        }
    }, {
        fallbackId: defaultCatalogId,
        previousConfig: {}
    });

    catalogs.push(created);
    await saveStore(tenantId, { catalogs });
    return listCatalogs(tenantId, { includeInactive: true, runtime: false });
}

async function getCatalog(tenantId = DEFAULT_TENANT_ID, catalogId = '', { runtime = false } = {}) {
    const cleanCatalogId = normalizeCatalogIdCandidate(catalogId);
    if (!cleanCatalogId) return null;
    const store = await loadStore(tenantId);
    const match = (Array.isArray(store.catalogs) ? store.catalogs : [])
        .find((entry) => String(entry?.catalogId || '').trim().toUpperCase() === cleanCatalogId);
    if (!match) return null;
    return applyRuntimeView(match, runtime);
}

async function createCatalog(tenantId = DEFAULT_TENANT_ID, payload = {}, { maxCatalogs = 0 } = {}) {
    const store = await loadStore(tenantId);
    const catalogs = Array.isArray(store.catalogs) ? [...store.catalogs] : [];
    const activeCount = catalogs.filter((entry) => entry?.isActive !== false).length;

    const normalizedMax = Number(maxCatalogs);
    if (Number.isFinite(normalizedMax) && normalizedMax > 0 && activeCount >= normalizedMax) {
        throw new Error(`No puedes crear mas catalogos: limite del plan (${normalizedMax}).`);
    }

    const requestedId = normalizeCatalogIdCandidate(payload?.catalogId || payload?.id || '');
    const nextCatalogId = requestedId || createUniqueCatalogId(catalogs);
    if (catalogs.some((entry) => String(entry?.catalogId || '').trim().toUpperCase() === nextCatalogId)) {
        throw new Error('Ya existe un catalogo con ese ID.');
    }

    const created = normalizeCatalog({
        ...payload,
        catalogId: nextCatalogId
    }, {
        fallbackId: nextCatalogId,
        previousConfig: {}
    });

    if (!catalogs.length) {
        created.isDefault = true;
    } else if (created.isDefault) {
        catalogs.forEach((entry) => {
            entry.isDefault = false;
        });
    }

    catalogs.push(created);
    const saved = await saveStore(tenantId, { catalogs });
    const result = (Array.isArray(saved.catalogs) ? saved.catalogs : [])
        .find((entry) => String(entry?.catalogId || '').trim().toUpperCase() === nextCatalogId) || created;
    return sanitizeCatalogPublic(result);
}

async function updateCatalog(tenantId = DEFAULT_TENANT_ID, catalogId = '', patch = {}) {
    const cleanCatalogId = normalizeCatalogIdCandidate(catalogId);
    if (!cleanCatalogId) throw new Error('catalogId invalido.');

    const store = await loadStore(tenantId);
    const catalogs = Array.isArray(store.catalogs) ? [...store.catalogs] : [];
    const index = catalogs.findIndex((entry) => String(entry?.catalogId || '').trim().toUpperCase() === cleanCatalogId);
    if (index < 0) throw new Error('Catalogo no encontrado.');

    const current = catalogs[index];
    const merged = normalizeCatalog({
        ...current,
        ...patch,
        catalogId: cleanCatalogId,
        createdAt: current.createdAt
    }, {
        fallbackId: cleanCatalogId,
        preserveCreatedAt: current.createdAt,
        previousConfig: current.config
    });

    catalogs[index] = merged;
    if (merged.isDefault) {
        catalogs.forEach((entry, entryIndex) => {
            if (entryIndex !== index) entry.isDefault = false;
        });
    } else if (!catalogs.some((entry) => entry.isDefault)) {
        catalogs[index].isDefault = true;
    }

    const saved = await saveStore(tenantId, { catalogs });
    const result = (Array.isArray(saved.catalogs) ? saved.catalogs : [])
        .find((entry) => String(entry?.catalogId || '').trim().toUpperCase() === cleanCatalogId) || merged;
    return sanitizeCatalogPublic(result);
}

async function deactivateCatalog(tenantId = DEFAULT_TENANT_ID, catalogId = '') {
    const cleanCatalogId = normalizeCatalogIdCandidate(catalogId);
    if (!cleanCatalogId) throw new Error('catalogId invalido.');
    const store = await loadStore(tenantId);
    const catalogs = Array.isArray(store.catalogs) ? [...store.catalogs] : [];
    const index = catalogs.findIndex((entry) => String(entry?.catalogId || '').trim().toUpperCase() === cleanCatalogId);
    if (index < 0) throw new Error('Catalogo no encontrado.');

    catalogs[index] = {
        ...catalogs[index],
        isActive: false,
        isDefault: false,
        updatedAt: new Date().toISOString()
    };

    const fallbackIndex = catalogs.findIndex((entry, entryIndex) => entryIndex !== index && entry?.isActive !== false);
    if (fallbackIndex >= 0) catalogs[fallbackIndex].isDefault = true;
    await saveStore(tenantId, { catalogs });
    return { ok: true, catalogId: cleanCatalogId, deactivated: true };
}

module.exports = {
    ALLOWED_CATALOG_SOURCES: Array.from(ALLOWED_CATALOG_SOURCES),
    DEFAULT_PAGE_SIZE,
    normalizeCatalogSource,
    normalizeCatalogIdCandidate,
    listCatalogs,
    ensureDefaultCatalog,
    getCatalog,
    createCatalog,
    updateCatalog,
    deactivateCatalog
};

