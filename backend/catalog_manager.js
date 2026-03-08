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

function resolveTenantId(input = null) {
    if (typeof input === 'string') {
        return normalizeTenantId(input || DEFAULT_TENANT_ID);
    }
    if (input && typeof input === 'object') {
        return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    }
    return DEFAULT_TENANT_ID;
}

function sanitizePrice(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) return raw;
    return parsed.toFixed(2);
}

function normalizeProduct(item = {}, { withDefaults = false } = {}) {
    const id = String(item?.id || '').trim();
    const title = String(item?.title || item?.name || '').trim();
    const description = String(item?.description || '').trim();
    const imageUrl = item?.imageUrl ? String(item.imageUrl).trim() : null;
    const createdAt = String(item?.createdAt || '').trim() || new Date().toISOString();

    const base = {
        id,
        title: title || (withDefaults ? 'Sin nombre' : ''),
        price: sanitizePrice(item?.price ?? ''),
        description,
        imageUrl: imageUrl || null,
        createdAt
    };

    if (!withDefaults && !base.id) return null;
    return base;
}

function normalizeCatalog(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => normalizeProduct(item))
        .filter(Boolean);
}

async function loadCatalogFromFile(tenantId) {
    const parsed = await readTenantJsonFile(CATALOG_FILE_NAME, {
        tenantId,
        defaultValue: [],
        legacyPath: LEGACY_CATALOG_PATH
    });
    return normalizeCatalog(parsed);
}

async function saveCatalogToFile(catalog = [], tenantId = DEFAULT_TENANT_ID) {
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

async function loadCatalogFromPostgres(tenantId) {
    try {
        const { rows } = await queryPostgres(
            `SELECT item_id, title, price, description, image_url, created_at
               FROM catalog_items
              WHERE tenant_id = $1
              ORDER BY created_at DESC, item_id DESC`,
            [tenantId]
        );

        return rows.map((row) => ({
            id: String(row.item_id || '').trim(),
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

async function upsertCatalogItemPostgres(item, tenantId) {
    await queryPostgres(
        `INSERT INTO catalog_items (tenant_id, item_id, title, price, description, image_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (tenant_id, item_id)
         DO UPDATE SET
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            updated_at = NOW()`,
        [tenantId, item.id, item.title, item.price, item.description, item.imageUrl]
    );
}

async function deleteCatalogItemPostgres(itemId, tenantId) {
    await queryPostgres(
        `DELETE FROM catalog_items
          WHERE tenant_id = $1
            AND item_id = $2`,
        [tenantId, itemId]
    );
}

async function loadCatalog(options = null) {
    const tenantId = resolveTenantId(options);
    const driver = getStorageDriver();

    if (driver === 'postgres') {
        return loadCatalogFromPostgres(tenantId);
    }

    return loadCatalogFromFile(tenantId);
}

async function addProduct(product = {}, options = null) {
    const tenantId = resolveTenantId(options);
    const nextProduct = normalizeProduct({
        id: `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        title: product?.title || product?.name || 'Sin nombre',
        price: product?.price || '',
        description: product?.description || '',
        imageUrl: product?.imageUrl || null,
        createdAt: new Date().toISOString()
    }, { withDefaults: true });

    if (getStorageDriver() === 'postgres') {
        await upsertCatalogItemPostgres(nextProduct, tenantId);
        return nextProduct;
    }

    const catalog = await loadCatalogFromFile(tenantId);
    catalog.unshift(nextProduct);
    await saveCatalogToFile(catalog, tenantId);
    return nextProduct;
}

async function updateProduct(id, updates = {}, options = null) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;

    const tenantId = resolveTenantId(options);
    const existingCatalog = await loadCatalog({ tenantId });
    const current = existingCatalog.find((item) => item.id === cleanId);
    if (!current) return null;

    const merged = normalizeProduct({
        ...current,
        ...updates,
        id: cleanId,
        createdAt: current.createdAt || new Date().toISOString()
    }, { withDefaults: true });

    if (getStorageDriver() === 'postgres') {
        await upsertCatalogItemPostgres(merged, tenantId);
        return merged;
    }

    const next = existingCatalog.map((item) => (item.id === cleanId ? merged : item));
    await saveCatalogToFile(next, tenantId);
    return merged;
}

async function deleteProduct(id, options = null) {
    const cleanId = String(id || '').trim();
    if (!cleanId) return;

    const tenantId = resolveTenantId(options);

    if (getStorageDriver() === 'postgres') {
        await deleteCatalogItemPostgres(cleanId, tenantId);
        return;
    }

    const catalog = await loadCatalogFromFile(tenantId);
    const next = catalog.filter((item) => item.id !== cleanId);
    await saveCatalogToFile(next, tenantId);
}

module.exports = {
    loadCatalog,
    addProduct,
    updateProduct,
    deleteProduct
};
