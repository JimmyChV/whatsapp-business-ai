const path = require('path');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

const CATALOG_FILE_NAME = 'catalogo.json';
const LEGACY_CATALOG_PATH = path.join(__dirname, 'catalogo.json');

let postgresSchemaReadyPromise = null;

function normalizeModuleId(value = '') {
    const text = String(value || '').trim();
    if (!text) return null;
    return text;
}

function toModuleKey(value = '') {
    return normalizeModuleId(value || '') || '';
}

function normalizeChannelType(value = '') {
    const clean = String(value || '').trim().toLowerCase();
    if (!clean) return null;
    if (['whatsapp', 'instagram', 'messenger', 'webchat'].includes(clean)) return clean;
    return clean;
}

function resolveOptions(input = null) {
    if (typeof input === 'string') {
        return {
            tenantId: normalizeTenantId(input || DEFAULT_TENANT_ID),
            moduleId: null,
            channelType: null
        };
    }

    const source = input && typeof input === 'object' ? input : {};
    return {
        tenantId: normalizeTenantId(source.tenantId || DEFAULT_TENANT_ID),
        moduleId: normalizeModuleId(source.moduleId || source.module_id || ''),
        channelType: normalizeChannelType(source.channelType || source.channel_type || '')
    };
}

function sanitizePrice(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) return raw;
    return parsed.toFixed(2);
}

function normalizeProduct(item = {}, { withDefaults = false, fallbackModuleId = null, fallbackChannelType = null } = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const id = String(source?.id || '').trim();
    const title = String(source?.title || source?.name || '').trim();
    const description = String(source?.description || '').trim();
    const imageUrl = source?.imageUrl ? String(source.imageUrl).trim() : null;
    const createdAt = String(source?.createdAt || '').trim() || new Date().toISOString();
    const moduleId = normalizeModuleId(source?.moduleId || source?.module_id || fallbackModuleId || '');
    const channelType = normalizeChannelType(source?.channelType || source?.channel_type || fallbackChannelType || '');

    const base = {
        id,
        moduleId,
        channelType,
        title: title || (withDefaults ? 'Sin nombre' : ''),
        price: sanitizePrice(source?.price ?? ''),
        description,
        imageUrl: imageUrl || null,
        createdAt
    };

    if (!withDefaults && !base.id) return null;
    return base;
}

function normalizeCatalog(items = [], { fallbackModuleId = null, fallbackChannelType = null } = {}) {
    return (Array.isArray(items) ? items : [])
        .map((item) => normalizeProduct(item, { fallbackModuleId, fallbackChannelType }))
        .filter(Boolean);
}

async function ensurePostgresSchema() {
    if (postgresSchemaReadyPromise) return postgresSchemaReadyPromise;

    postgresSchemaReadyPromise = (async () => {
        await queryPostgres('ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS module_id TEXT');
        await queryPostgres('ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS channel_type TEXT');
        await queryPostgres("UPDATE catalog_items SET module_id = '' WHERE module_id IS NULL");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN module_id SET DEFAULT ''");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN module_id SET NOT NULL");
        await queryPostgres(
            `DO $$
             BEGIN
               IF to_regclass('catalog_items') IS NULL THEN
                 RETURN;
               END IF;

               IF EXISTS (
                 SELECT 1
                 FROM pg_constraint
                 WHERE conname = 'catalog_items_pkey'
                   AND conrelid = to_regclass('catalog_items')
               ) THEN
                 IF NOT EXISTS (
                   SELECT 1
                   FROM pg_constraint
                   WHERE conname = 'catalog_items_pkey'
                     AND conrelid = to_regclass('catalog_items')
                     AND cardinality(conkey) = 3
                 ) THEN
                   ALTER TABLE catalog_items DROP CONSTRAINT catalog_items_pkey;
                   ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (tenant_id, item_id, module_id);
                 END IF;
               ELSE
                 ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (tenant_id, item_id, module_id);
               END IF;
             END $$;`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_module_created
             ON catalog_items(tenant_id, module_id, created_at DESC)`
        );
    })();

    try {
        await postgresSchemaReadyPromise;
    } catch (error) {
        postgresSchemaReadyPromise = null;
        throw error;
    }
}

async function loadCatalogFromFile(options = {}) {
    const { tenantId, moduleId, channelType } = resolveOptions(options);
    const parsed = await readTenantJsonFile(CATALOG_FILE_NAME, {
        tenantId,
        defaultValue: [],
        legacyPath: LEGACY_CATALOG_PATH
    });

    let items = normalizeCatalog(parsed, { fallbackModuleId: moduleId, fallbackChannelType: channelType });
    if (moduleId) {
        items = items.filter((item) => String(item?.moduleId || '') === moduleId);
    }
    if (channelType) {
        items = items.filter((item) => String(item?.channelType || '') === channelType);
    }
    return items;
}

async function saveCatalogToFile(catalog = [], options = {}) {
    const { tenantId } = resolveOptions(options);
    const clean = normalizeCatalog(catalog);
    await writeTenantJsonFile(CATALOG_FILE_NAME, clean, {
        tenantId,
        mirrorLegacyPath: LEGACY_CATALOG_PATH
    });
    return clean;
}

function isMissingRelationError(error) {
    const code = String(error?.code || '').trim();
    return code === '42P01';
}

async function loadCatalogFromPostgres(options = {}) {
    const { tenantId, moduleId, channelType } = resolveOptions(options);
    await ensurePostgresSchema();

    const clauses = ['tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (moduleId) {
        clauses.push(`module_id = $${idx}`);
        params.push(moduleId);
        idx += 1;
    }
    if (channelType) {
        clauses.push(`channel_type = $${idx}`);
        params.push(channelType);
        idx += 1;
    }

    try {
        const { rows } = await queryPostgres(
            `SELECT item_id, module_id, channel_type, title, price, description, image_url, created_at
               FROM catalog_items
              WHERE ${clauses.join(' AND ')}
              ORDER BY created_at DESC, item_id DESC`,
            params
        );

        return rows.map((row) => ({
            id: String(row.item_id || '').trim(),
            moduleId: normalizeModuleId(row.module_id || ''),
            channelType: normalizeChannelType(row.channel_type || ''),
            title: String(row.title || '').trim() || 'Sin nombre',
            price: sanitizePrice(row.price ?? ''),
            description: String(row.description || '').trim(),
            imageUrl: row.image_url ? String(row.image_url).trim() : null,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
        }));
    } catch (error) {
        if (isMissingRelationError(error)) return [];
        throw error;
    }
}

async function upsertCatalogItemPostgres(item, options = {}) {
    const { tenantId } = resolveOptions(options);
    await ensurePostgresSchema();

    await queryPostgres(
        `INSERT INTO catalog_items (tenant_id, item_id, module_id, channel_type, title, price, description, image_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         ON CONFLICT (tenant_id, item_id, module_id)
         DO UPDATE SET
            module_id = EXCLUDED.module_id,
            channel_type = EXCLUDED.channel_type,
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            updated_at = NOW()`,
        [tenantId, item.id, toModuleKey(item.moduleId), item.channelType || null, item.title, item.price, item.description, item.imageUrl]
    );
}

async function deleteCatalogItemPostgres(itemId, options = {}) {
    const { tenantId, moduleId } = resolveOptions(options);
    await ensurePostgresSchema();

    if (moduleId) {
        await queryPostgres(
            `DELETE FROM catalog_items
              WHERE tenant_id = $1
                AND item_id = $2
                AND module_id = $3`,
            [tenantId, itemId, toModuleKey(moduleId)]
        );
        return;
    }

    await queryPostgres(
        `DELETE FROM catalog_items
          WHERE tenant_id = $1
            AND item_id = $2`,
        [tenantId, itemId]
    );
}

async function loadCatalog(options = null) {
    if (getStorageDriver() === 'postgres') {
        return loadCatalogFromPostgres(options);
    }

    return loadCatalogFromFile(options);
}

async function addProduct(product = {}, options = null) {
    const { tenantId, moduleId, channelType } = resolveOptions(options);
    const nextProduct = normalizeProduct({
        id: `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        moduleId: normalizeModuleId(product?.moduleId || moduleId || ''),
        channelType: normalizeChannelType(product?.channelType || channelType || ''),
        title: product?.title || product?.name || 'Sin nombre',
        price: product?.price || '',
        description: product?.description || '',
        imageUrl: product?.imageUrl || null,
        createdAt: new Date().toISOString()
    }, { withDefaults: true });

    if (getStorageDriver() === 'postgres') {
        await upsertCatalogItemPostgres(nextProduct, { tenantId });
        return nextProduct;
    }

    const catalog = await loadCatalogFromFile({ tenantId });
    catalog.unshift(nextProduct);
    await saveCatalogToFile(catalog, { tenantId });
    return nextProduct;
}

async function updateProduct(id, updates = {}, options = null) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;

    const { tenantId, moduleId, channelType } = resolveOptions(options);
    const existingCatalog = await loadCatalog({ tenantId });
    const current = existingCatalog.find((item) => item.id === cleanId && (!moduleId || String(item?.moduleId || '') === moduleId));
    if (!current) return null;

    const merged = normalizeProduct({
        ...current,
        ...updates,
        moduleId: normalizeModuleId(updates?.moduleId || current?.moduleId || moduleId || ''),
        channelType: normalizeChannelType(updates?.channelType || current?.channelType || channelType || ''),
        id: cleanId,
        createdAt: current.createdAt || new Date().toISOString()
    }, { withDefaults: true });

    if (getStorageDriver() === 'postgres') {
        await upsertCatalogItemPostgres(merged, { tenantId });
        return merged;
    }

    const next = existingCatalog.map((item) => (item.id === cleanId ? merged : item));
    await saveCatalogToFile(next, { tenantId });
    return merged;
}

async function deleteProduct(id, options = null) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;

    const { tenantId, moduleId } = resolveOptions(options);

    if (getStorageDriver() === 'postgres') {
        await deleteCatalogItemPostgres(cleanId, { tenantId, moduleId });
        return;
    }

    const catalog = await loadCatalogFromFile({ tenantId });
    const next = catalog.filter((item) => !(item.id === cleanId && (!moduleId || String(item?.moduleId || '') === moduleId)));
    await saveCatalogToFile(next, { tenantId });
}

module.exports = {
    loadCatalog,
    addProduct,
    updateProduct,
    deleteProduct
};

