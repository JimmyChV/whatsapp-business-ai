const path = require('path');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('../../../config/persistence-runtime');

const CATALOG_FILE_NAME = 'catalogo.json';
const LEGACY_CATALOG_PATH = path.join(__dirname, '../../../data/legacy/catalogo.json');

let postgresSchemaReadyPromise = null;

function normalizeModuleId(value = '') {
    const text = String(value || '').trim();
    if (!text) return null;
    return text.toLowerCase();
}

function normalizeCatalogId(value = '') {
    const text = String(value || '').trim().toUpperCase();
    if (!text) return null;
    return text;
}

function toModuleKey(value = '') {
    return normalizeModuleId(value || '') || '';
}

function toCatalogKey(value = '') {
    return normalizeCatalogId(value || '') || '';
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
            catalogId: null,
            channelType: null,
            includeLegacyEmptyCatalogId: false
        };
    }

    const source = input && typeof input === 'object' ? input : {};
    return {
        tenantId: normalizeTenantId(source.tenantId || DEFAULT_TENANT_ID),
        moduleId: normalizeModuleId(source.moduleId || source.module_id || ''),
        catalogId: normalizeCatalogId(source.catalogId || source.catalog_id || ''),
        channelType: normalizeChannelType(source.channelType || source.channel_type || ''),
        includeLegacyEmptyCatalogId: source.includeLegacyEmptyCatalogId === true
    };
}

function sanitizePrice(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) return raw;
    return parsed.toFixed(2);
}

function sanitizeText(value = '') {
    const clean = String(value ?? '').trim();
    return clean || '';
}

function sanitizeUrl(value = '') {
    const clean = String(value ?? '').trim();
    if (!clean) return '';
    return clean;
}

function sanitizeInteger(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number.parseInt(String(value).trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
}

function normalizeCategoryEntries(...inputs) {
    const list = [];
    inputs.forEach((source) => {
        if (!source) return;
        if (Array.isArray(source)) {
            source.forEach((entry) => {
                if (!entry) return;
                if (typeof entry === 'string') {
                    list.push(entry);
                    return;
                }
                if (typeof entry === 'object') {
                    list.push(entry.name || entry.slug || entry.label || entry.title || '');
                }
            });
            return;
        }

        if (typeof source === 'string') {
            source.split(',').forEach((token) => list.push(token));
            return;
        }

        if (typeof source === 'object') {
            list.push(source.name || source.slug || source.label || source.title || '');
        }
    });

    const unique = new Set();
    list
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .forEach((entry) => unique.add(entry));
    return Array.from(unique);
}

function computeDiscountPct({ explicitDiscount = '', regularPrice = '', finalPrice = '' } = {}) {
    const explicit = Number.parseFloat(String(explicitDiscount ?? '').replace(',', '.'));
    if (Number.isFinite(explicit) && explicit >= 0) return Number(explicit.toFixed(2));

    const regular = Number.parseFloat(String(regularPrice ?? '').replace(',', '.'));
    const final = Number.parseFloat(String(finalPrice ?? '').replace(',', '.'));
    if (!Number.isFinite(regular) || !Number.isFinite(final) || regular <= 0 || final <= 0 || final >= regular) return 0;
    return Number((((regular - final) / regular) * 100).toFixed(2));
}

function normalizeProduct(item = {}, {
    withDefaults = false,
    fallbackModuleId = null,
    fallbackCatalogId = null,
    fallbackChannelType = null
} = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const rawMetadata = source?.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? source.metadata
        : {};

    const id = String(source?.id || '').trim();
    const title = String(source?.title || source?.name || '').trim();
    const description = String(source?.description || '').trim();
    const imageUrl = sanitizeUrl(source?.imageUrl || source?.image || source?.image_url || rawMetadata?.imageUrl || rawMetadata?.image_url || '');
    const createdAt = String(source?.createdAt || '').trim() || new Date().toISOString();
    const moduleId = normalizeModuleId(source?.moduleId || source?.module_id || rawMetadata?.moduleId || fallbackModuleId || '');
    const catalogId = normalizeCatalogId(source?.catalogId || source?.catalog_id || rawMetadata?.catalogId || fallbackCatalogId || '');
    const channelType = normalizeChannelType(source?.channelType || source?.channel_type || rawMetadata?.channelType || fallbackChannelType || '');
    const sourceType = String(source?.source || rawMetadata?.source || 'local').trim().toLowerCase() || 'local';

    let finalPrice = sanitizePrice(source?.price ?? source?.amount ?? rawMetadata?.price ?? '');
    let regularPrice = sanitizePrice(source?.regularPrice ?? source?.regular_price ?? rawMetadata?.regularPrice ?? rawMetadata?.regular_price ?? source?.price ?? '');
    let salePrice = sanitizePrice(source?.salePrice ?? source?.sale_price ?? rawMetadata?.salePrice ?? rawMetadata?.sale_price ?? '');

    if (!finalPrice) finalPrice = salePrice || regularPrice || '';
    if (!regularPrice) regularPrice = finalPrice || '';
    if (!salePrice) salePrice = '';

    const categories = normalizeCategoryEntries(
        source?.categories,
        source?.category,
        source?.categoryName,
        source?.category_slug,
        rawMetadata?.categories,
        rawMetadata?.category,
        rawMetadata?.categoryName
    );
    const category = categories[0] || '';
    const sku = sanitizeText(source?.sku || rawMetadata?.sku || '');
    const stockStatus = sanitizeText(source?.stockStatus || source?.stock_status || rawMetadata?.stockStatus || rawMetadata?.stock_status || '');
    const stockQuantity = sanitizeInteger(
        source?.stockQuantity ?? source?.stock_quantity ?? rawMetadata?.stockQuantity ?? rawMetadata?.stock_quantity,
        null
    );
    const url = sanitizeUrl(source?.url || source?.permalink || source?.productUrl || source?.link || rawMetadata?.url || rawMetadata?.permalink || rawMetadata?.productUrl || rawMetadata?.link || '');
    const brand = sanitizeText(source?.brand || rawMetadata?.brand || '');
    const catalogName = sanitizeText(source?.catalogName || source?.catalog_name || rawMetadata?.catalogName || rawMetadata?.catalog_name || '');
    const discountPct = computeDiscountPct({
        explicitDiscount: source?.discountPct ?? source?.discount_pct ?? rawMetadata?.discountPct ?? rawMetadata?.discount_pct,
        regularPrice,
        finalPrice
    });

    const metadata = {
        ...rawMetadata,
        regularPrice: regularPrice || null,
        salePrice: salePrice || null,
        discountPct,
        sku: sku || null,
        stockStatus: stockStatus || null,
        stockQuantity,
        categories,
        category: category || null,
        url: url || null,
        brand: brand || null,
        catalogName: catalogName || null,
        source: sourceType
    };

    const base = {
        id,
        moduleId,
        catalogId,
        channelType,
        title: title || (withDefaults ? 'Sin nombre' : ''),
        price: finalPrice || '',
        regularPrice: regularPrice || null,
        salePrice: salePrice || null,
        discountPct,
        description,
        imageUrl: imageUrl || null,
        source: sourceType,
        sku: sku || null,
        stockStatus: stockStatus || null,
        stockQuantity,
        url: url || null,
        brand: brand || null,
        category: category || null,
        categories,
        catalogName: catalogName || null,
        metadata,
        createdAt
    };

    if (!withDefaults && !base.id) return null;
    return base;
}

function normalizeCatalog(items = [], {
    fallbackModuleId = null,
    fallbackCatalogId = null,
    fallbackChannelType = null
} = {}) {
    return (Array.isArray(items) ? items : [])
        .map((item) => normalizeProduct(item, {
            fallbackModuleId,
            fallbackCatalogId,
            fallbackChannelType
        }))
        .filter(Boolean);
}
async function ensurePostgresSchema() {
    if (postgresSchemaReadyPromise) return postgresSchemaReadyPromise;

    postgresSchemaReadyPromise = (async () => {
        await queryPostgres('ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS module_id TEXT');
        await queryPostgres('ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS catalog_id TEXT');
        await queryPostgres('ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS channel_type TEXT');
        await queryPostgres('ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS source TEXT');
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb");
        await queryPostgres("UPDATE catalog_items SET module_id = '' WHERE module_id IS NULL");
        await queryPostgres("UPDATE catalog_items SET catalog_id = '' WHERE catalog_id IS NULL");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN module_id SET DEFAULT ''");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN catalog_id SET DEFAULT ''");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN module_id SET NOT NULL");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN catalog_id SET NOT NULL");
        await queryPostgres("UPDATE catalog_items SET source = 'local' WHERE source IS NULL OR source = ''");
        await queryPostgres("UPDATE catalog_items SET metadata = '{}'::jsonb WHERE metadata IS NULL");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN source SET DEFAULT 'local'");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN metadata SET DEFAULT '{}'::jsonb");
        await queryPostgres("ALTER TABLE IF EXISTS catalog_items ALTER COLUMN metadata SET NOT NULL");
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
                     AND cardinality(conkey) = 4
                 ) THEN
                   ALTER TABLE catalog_items DROP CONSTRAINT catalog_items_pkey;
                   ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (tenant_id, item_id, module_id, catalog_id);
                 END IF;
               ELSE
                 ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (tenant_id, item_id, module_id, catalog_id);
               END IF;
             END $$;`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_module_catalog_created
             ON catalog_items(tenant_id, module_id, catalog_id, created_at DESC)`
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
    const { tenantId, moduleId, catalogId, channelType, includeLegacyEmptyCatalogId } = resolveOptions(options);
    const parsed = await readTenantJsonFile(CATALOG_FILE_NAME, {
        tenantId,
        defaultValue: [],
        legacyPath: LEGACY_CATALOG_PATH
    });

    let items = normalizeCatalog(parsed, {
        fallbackModuleId: moduleId,
        fallbackCatalogId: catalogId,
        fallbackChannelType: channelType
    });
    if (moduleId) {
        items = items.filter((item) => {
            const itemModuleId = String(item?.moduleId || '');
            return itemModuleId === moduleId || itemModuleId === '';
        });
    }
    if (catalogId) {
        items = items.filter((item) => {
            const itemCatalogId = String(item?.catalogId || '').trim().toUpperCase();
            if (itemCatalogId === catalogId) return true;
            if (includeLegacyEmptyCatalogId && !itemCatalogId) return true;
            return false;
        });
    }
    if (channelType) {
        items = items.filter((item) => {
            const itemChannelType = String(item?.channelType || '').trim().toLowerCase();
            return !itemChannelType || itemChannelType === channelType;
        });
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
    const { tenantId, moduleId, catalogId, channelType, includeLegacyEmptyCatalogId } = resolveOptions(options);
    await ensurePostgresSchema();

    const clauses = ['tenant_id = $1'];
    const params = [tenantId];
    let idx = 2;

    if (moduleId) {
        clauses.push(`(module_id = $${idx} OR module_id = '')`);
        params.push(moduleId);
        idx += 1;
    }
    if (catalogId) {
        if (includeLegacyEmptyCatalogId) {
            clauses.push(`(catalog_id = $${idx} OR catalog_id = '')`);
            params.push(catalogId);
        } else {
            clauses.push(`catalog_id = $${idx}`);
            params.push(catalogId);
        }
        idx += 1;
    }
    if (channelType) {
        clauses.push(`(channel_type = $${idx} OR channel_type IS NULL OR channel_type = '')`);
        params.push(channelType);
        idx += 1;
    }

    try {
        const { rows } = await queryPostgres(
            `SELECT item_id, module_id, catalog_id, channel_type, title, price, description, image_url, source, metadata, created_at
               FROM catalog_items
              WHERE ${clauses.join(' AND ')}
              ORDER BY created_at DESC, item_id DESC, catalog_id DESC`,
            params
        );

        return rows.map((row) => normalizeProduct({
            id: String(row.item_id || '').trim(),
            moduleId: row.module_id || '',
            catalogId: row.catalog_id || catalogId || '',
            channelType: row.channel_type || '',
            title: row.title || '',
            price: row.price ?? '',
            description: row.description || '',
            imageUrl: row.image_url ? String(row.image_url).trim() : null,
            source: row.source || 'local',
            metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
        }, {
            withDefaults: true,
            fallbackModuleId: moduleId,
            fallbackCatalogId: catalogId,
            fallbackChannelType: channelType
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
        `INSERT INTO catalog_items (tenant_id, item_id, module_id, catalog_id, channel_type, title, price, description, image_url, source, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW(), NOW())
         ON CONFLICT (tenant_id, item_id, module_id, catalog_id)
         DO UPDATE SET
            module_id = EXCLUDED.module_id,
            catalog_id = EXCLUDED.catalog_id,
            channel_type = EXCLUDED.channel_type,
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            source = EXCLUDED.source,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()`,
        [
            tenantId,
            item.id,
            toModuleKey(item.moduleId),
            toCatalogKey(item.catalogId),
            item.channelType || null,
            item.title,
            item.price,
            item.description,
            item.imageUrl,
            item.source || 'local',
            JSON.stringify(item?.metadata && typeof item.metadata === 'object' ? item.metadata : {})
        ]
    );
}
async function deleteCatalogItemPostgres(itemId, options = {}) {
    const { tenantId, moduleId, catalogId } = resolveOptions(options);
    await ensurePostgresSchema();

    if (moduleId && catalogId) {
        await queryPostgres(
            `DELETE FROM catalog_items
              WHERE tenant_id = $1
                AND item_id = $2
                AND (module_id = $3 OR module_id = '')
                AND (catalog_id = $4 OR catalog_id = '')`,
            [tenantId, itemId, toModuleKey(moduleId), toCatalogKey(catalogId)]
        );
        return;
    }

    if (moduleId) {
        await queryPostgres(
            `DELETE FROM catalog_items
              WHERE tenant_id = $1
                AND item_id = $2
                AND (module_id = $3 OR module_id = '')`,
            [tenantId, itemId, toModuleKey(moduleId)]
        );
        return;
    }

    if (catalogId) {
        await queryPostgres(
            `DELETE FROM catalog_items
              WHERE tenant_id = $1
                AND item_id = $2
                AND (catalog_id = $3 OR catalog_id = '')`,
            [tenantId, itemId, toCatalogKey(catalogId)]
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
    const { tenantId, moduleId, catalogId, channelType } = resolveOptions(options);
    const nextProduct = normalizeProduct({
        ...(product && typeof product === 'object' ? product : {}),
        id: `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        moduleId: normalizeModuleId(product?.moduleId || moduleId || ''),
        catalogId: normalizeCatalogId(product?.catalogId || catalogId || ''),
        channelType: normalizeChannelType(product?.channelType || channelType || ''),
        title: product?.title || product?.name || 'Sin nombre',
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

    const { tenantId, moduleId, catalogId, channelType } = resolveOptions(options);
    const existingCatalog = await loadCatalog({ tenantId });
    const current = existingCatalog.find((item) => (
        item.id === cleanId
        && (!moduleId || String(item?.moduleId || '') === moduleId || String(item?.moduleId || '') === '')
        && (!catalogId || String(item?.catalogId || '') === catalogId || String(item?.catalogId || '') === '')
    ));
    if (!current) return null;

    const merged = normalizeProduct({
        ...current,
        ...updates,
        moduleId: normalizeModuleId(updates?.moduleId || current?.moduleId || moduleId || ''),
        catalogId: normalizeCatalogId(updates?.catalogId || current?.catalogId || catalogId || ''),
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

    const { tenantId, moduleId, catalogId } = resolveOptions(options);

    if (getStorageDriver() === 'postgres') {
        await deleteCatalogItemPostgres(cleanId, { tenantId, moduleId, catalogId });
        return;
    }

    const catalog = await loadCatalogFromFile({ tenantId });
    const next = catalog.filter((item) => !(
        item.id === cleanId
        && (!moduleId || String(item?.moduleId || '') === moduleId || String(item?.moduleId || '') === '')
        && (!catalogId || String(item?.catalogId || '') === catalogId || String(item?.catalogId || '') === '')
    ));
    await saveCatalogToFile(next, { tenantId });
}

async function getCatalogItemsBySkus(tenantId, skus = []) {
    if (!Array.isArray(skus) || skus.length === 0) return [];
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    await ensurePostgresSchema();
    try {
        const upper = skus.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean);
        if (!upper.length) return [];
        const placeholders = upper.map((_, i) => `$${i + 2}`).join(', ');
        const { rows } = await queryPostgres(
            `SELECT item_id, title, price, metadata
               FROM catalog_items
              WHERE tenant_id = $1
                AND UPPER(item_id) = ANY(ARRAY[${placeholders}])`,
            [cleanTenantId, ...upper]
        );
        return rows.map((row) => ({
            id: String(row.item_id || '').trim(),
            title: row.title || '',
            price: row.price ?? '',
            metadata: row.metadata && typeof row.metadata === 'object'
                ? row.metadata : {}
        }));
    } catch (error) {
        if (isMissingRelationError(error)) return [];
        throw error;
    }
}

module.exports = {
    loadCatalog,
    addProduct,
    updateProduct,
    deleteProduct,
    getCatalogItemsBySkus
};

