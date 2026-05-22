const {
    DEFAULT_TENANT_ID,
    normalizeTenantId,
    queryPostgres
} = require('../../../config/persistence-runtime');
const catalogManagerService = require('./catalog-manager.service');
const tenantCatalogService = require('./tenant-catalog.service');
const { getWooCatalog } = require('./woocommerce.service');
const wooZonesSyncService = require('./woo-zones-sync.service');
const logisticsAgenciesSyncService = require('./logistics-agencies-sync.service');

const syncIntervals = new Map();
const syncStatus = new Map();

function statusKey(tenantId = '', catalogId = '') {
    return `${normalizeTenantId(tenantId || DEFAULT_TENANT_ID)}:${String(catalogId || '').trim().toUpperCase()}`;
}

function normalizeIntervalHours(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(168, Math.max(1, Math.floor(parsed)));
}

function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeWooId(value = null) {
    if (value === null || value === undefined || value === '') return null;
    const clean = String(value).trim();
    return clean || null;
}

function normalizeWooIdArray(value = []) {
    return Array.from(new Set((Array.isArray(value) ? value : [])
        .map(normalizeWooId)
        .filter(Boolean)));
}

function normalizeWooMetadata(product = {}) {
    const sourceMetadata = isPlainObject(product?.metadata) ? product.metadata : {};
    const existingWoo = isPlainObject(sourceMetadata.woo) ? sourceMetadata.woo : {};
    const wooProductId = product?.wooProductId ?? existingWoo.wooProductId ?? sourceMetadata.wooProductId ?? null;
    return {
        ...existingWoo,
        wooProductId,
        relatedIds: normalizeWooIdArray(product?.relatedIds ?? existingWoo.relatedIds),
        upsellIds: normalizeWooIdArray(product?.upsellIds ?? existingWoo.upsellIds),
        crossSellIds: normalizeWooIdArray(product?.crossSellIds ?? existingWoo.crossSellIds),
        tags: Array.isArray(product?.tags) ? product.tags : (Array.isArray(existingWoo.tags) ? existingWoo.tags : []),
        attributes: Array.isArray(product?.attributes) ? product.attributes : (Array.isArray(existingWoo.attributes) ? existingWoo.attributes : []),
        permalink: product?.permalink ?? existingWoo.permalink ?? null,
        stockQuantity: product?.stockQuantity ?? existingWoo.stockQuantity ?? null,
        manageStock: product?.manageStock ?? existingWoo.manageStock ?? false,
        wooCategories: Array.isArray(product?.wooCategories)
            ? product.wooCategories
            : (Array.isArray(existingWoo.wooCategories) ? existingWoo.wooCategories : [])
    };
}

function getStoredStatus(tenantId, catalogId) {
    const key = statusKey(tenantId, catalogId);
    return syncStatus.get(key) || {
        lastSync: null,
        productCount: 0,
        status: 'never_synced',
        intervalHours: 0,
        nextSync: null,
        error: null
    };
}

function setStoredStatus(tenantId, catalogId, patch = {}) {
    const key = statusKey(tenantId, catalogId);
    const current = getStoredStatus(tenantId, catalogId);
    const next = { ...current, ...patch };
    syncStatus.set(key, next);
    return next;
}

async function countCatalogProducts(tenantId, catalogId) {
    try {
        const { rows } = await queryPostgres(
            `SELECT COUNT(*)::int AS count
               FROM catalog_items
              WHERE tenant_id = $1
                AND UPPER(COALESCE(catalog_id, '')) = UPPER($2)`,
            [normalizeTenantId(tenantId || DEFAULT_TENANT_ID), String(catalogId || '').trim().toUpperCase()]
        );
        return Number(rows?.[0]?.count || 0) || 0;
    } catch (error) {
        const code = String(error?.code || '').trim();
        if (code === '42P01') return 0;
        return 0;
    }
}

function buildCatalogItemFromWooProduct(product = {}, { catalogId = '' } = {}) {
    const sku = String(product?.sku || '').trim();
    const productId = String(product?.id || '').trim();
    const itemId = sku || productId;
    if (!itemId) return null;
    const productMetadata = product?.metadata && typeof product.metadata === 'object' ? product.metadata : {};
    const woo = normalizeWooMetadata(product);

    return {
        id: itemId,
        moduleId: '',
        catalogId: String(catalogId || '').trim().toUpperCase(),
        channelType: 'whatsapp',
        title: String(product?.title || product?.name || sku || productId || 'Producto').trim(),
        price: String(product?.price ?? product?.salePrice ?? product?.regularPrice ?? '0.00'),
        description: String(product?.description || '').trim(),
        imageUrl: product?.imageUrl || product?.image || null,
        source: 'woocommerce',
        metadata: {
            ...productMetadata,
            wooProductId: woo.wooProductId ?? productId ?? null,
            sku: sku || null,
            regularPrice: product?.regularPrice ?? null,
            salePrice: product?.salePrice ?? null,
            discountPct: product?.discountPct ?? 0,
            stockStatus: product?.stockStatus || null,
            stockQuantity: product?.stockQuantity ?? woo.stockQuantity ?? null,
            permalink: product?.permalink ?? woo.permalink ?? null,
            tags: Array.isArray(product?.tags) ? product.tags : [],
            categories: Array.isArray(product?.categories) ? product.categories : [],
            woo,
            source: 'woocommerce'
        }
    };
}

function addWooIdLookupKeys(map, value = null, sku = '') {
    const cleanSku = String(sku || '').trim();
    const clean = normalizeWooId(value);
    if (!clean || !cleanSku) return;
    map.set(clean, cleanSku);
    const stripped = clean.replace(/^woo_/i, '');
    if (stripped && stripped !== clean) map.set(stripped, cleanSku);
    map.set(`woo_${stripped || clean}`, cleanSku);
}

function resolveWooIdsToSkus(ids = [], lookup = new Map()) {
    return Array.from(new Set(normalizeWooIdArray(ids)
        .map((id) => lookup.get(id) || lookup.get(id.replace(/^woo_/i, '')) || lookup.get(`woo_${id}`) || '')
        .filter(Boolean)));
}

function arraysEqual(a = [], b = []) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function resolveWooRelatedSkusForCatalog(tenantId, catalogId) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
    if (!cleanTenantId || !cleanCatalogId) return { updated: 0 };
    const { rows } = await queryPostgres(
        `SELECT item_id, module_id, catalog_id, metadata
           FROM catalog_items
          WHERE tenant_id = $1
            AND UPPER(COALESCE(catalog_id, '')) = UPPER($2)
            AND LOWER(COALESCE(source, '')) = 'woocommerce'`,
        [cleanTenantId, cleanCatalogId]
    );
    const catalogRows = Array.isArray(rows) ? rows : [];
    const wooIdToSku = new Map();
    catalogRows.forEach((row) => {
        const metadata = isPlainObject(row.metadata) ? row.metadata : {};
        const woo = isPlainObject(metadata.woo) ? metadata.woo : {};
        addWooIdLookupKeys(wooIdToSku, woo.wooProductId ?? metadata.wooProductId, row.item_id);
    });

    let updated = 0;
    for (const row of catalogRows) {
        const metadata = isPlainObject(row.metadata) ? row.metadata : {};
        const woo = isPlainObject(metadata.woo) ? metadata.woo : {};
        const relatedSkus = resolveWooIdsToSkus(woo.relatedIds, wooIdToSku);
        const upsellSkus = resolveWooIdsToSkus(woo.upsellIds, wooIdToSku);
        const crossSellSkus = resolveWooIdsToSkus(woo.crossSellIds, wooIdToSku);
        const nextWoo = {
            ...woo,
            relatedSkus,
            upsellSkus,
            crossSellSkus
        };
        if (
            arraysEqual(woo.relatedSkus, relatedSkus)
            && arraysEqual(woo.upsellSkus, upsellSkus)
            && arraysEqual(woo.crossSellSkus, crossSellSkus)
        ) {
            continue;
        }
        await queryPostgres(
            `UPDATE catalog_items
                SET metadata = $5::jsonb,
                    updated_at = NOW()
              WHERE tenant_id = $1
                AND item_id = $2
                AND module_id = $3
                AND catalog_id = $4`,
            [
                cleanTenantId,
                row.item_id,
                row.module_id || '',
                row.catalog_id || '',
                JSON.stringify({
                    ...metadata,
                    woo: nextWoo
                })
            ]
        );
        updated += 1;
    }
    console.log(`[WooSync] resolved related SKUs for ${updated} products`, {
        tenantId: cleanTenantId,
        catalogId: cleanCatalogId
    });
    return { updated };
}

async function syncCatalogFromWoocommerce(tenantId = DEFAULT_TENANT_ID, catalogId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
    const startedAt = Date.now();
    if (!cleanCatalogId) throw new Error('catalogId invalido.');

    setStoredStatus(cleanTenantId, cleanCatalogId, { status: 'syncing', error: null });

    try {
        const catalog = await tenantCatalogService.getCatalog(cleanTenantId, cleanCatalogId, { runtime: true });
        if (!catalog) throw new Error('Catalogo no encontrado.');
        if (String(catalog.sourceType || '').trim().toLowerCase() !== 'woocommerce') {
            throw new Error('El catalogo no es WooCommerce.');
        }

        const wooConfig = catalog?.config?.woocommerce && typeof catalog.config.woocommerce === 'object'
            ? catalog.config.woocommerce
            : {};
        const wooResult = await getWooCatalog({ config: wooConfig });
        const products = Array.isArray(wooResult?.products) ? wooResult.products : [];

        let synced = 0;
        let errors = 0;
        for (const product of products) {
            const item = buildCatalogItemFromWooProduct(product, { catalogId: cleanCatalogId });
            if (!item) {
                errors += 1;
                continue;
            }
            try {
                await catalogManagerService.upsertCatalogItemPostgres(item, { tenantId: cleanTenantId });
                synced += 1;
            } catch (_) {
                errors += 1;
            }
        }
        const relatedSkuResolution = await resolveWooRelatedSkusForCatalog(cleanTenantId, cleanCatalogId);

        const zoneSync = await syncWooZonesBestEffort(cleanTenantId, cleanCatalogId);
        const agencySync = await syncAgenciesBestEffort(cleanTenantId);
        const nowIso = new Date().toISOString();
        const productCount = await countCatalogProducts(cleanTenantId, cleanCatalogId);
        const duration = Date.now() - startedAt;
        const current = getStoredStatus(cleanTenantId, cleanCatalogId);
        const result = {
            synced,
            errors,
            duration,
            timestamp: nowIso,
            source: wooResult?.source || 'woocommerce',
            reason: wooResult?.reason || null,
            relatedSkuResolution,
            zoneSync,
            agencySync
        };
        setStoredStatus(cleanTenantId, cleanCatalogId, {
            lastSync: nowIso,
            productCount,
            status: errors > 0 ? 'partial' : 'success',
            intervalHours: current.intervalHours || 0,
            nextSync: current.nextSync || null,
            error: errors > 0 ? `${errors} productos no pudieron sincronizarse.` : null
        });
        return result;
    } catch (error) {
        setStoredStatus(cleanTenantId, cleanCatalogId, {
            status: 'error',
            error: String(error?.message || error),
            nextSync: getStoredStatus(cleanTenantId, cleanCatalogId).nextSync || null
        });
        throw error;
    }
}

async function syncWooZonesBestEffort(tenantId = DEFAULT_TENANT_ID, catalogId = '') {
    try {
        return await wooZonesSyncService.syncZonesFromWooCommerce(tenantId, catalogId);
    } catch (error) {
        console.warn('[WooZones] sync skipped after catalog sync:', {
            tenantId,
            catalogId,
            error: String(error?.message || error)
        });
        return {
            synced: 0,
            error: String(error?.message || error)
        };
    }
}

async function syncAgenciesBestEffort(tenantId = DEFAULT_TENANT_ID) {
    try {
        return await logisticsAgenciesSyncService.syncAgenciesFromWordPress(tenantId);
    } catch (error) {
        console.warn('[Agencies] sync skipped after catalog sync:', {
            tenantId,
            error: String(error?.message || error)
        });
        return {
            synced: 0,
            error: String(error?.message || error)
        };
    }
}

function scheduleCatalogSync(tenantId = DEFAULT_TENANT_ID, catalogId = '', intervalHours = 0) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
    const key = statusKey(cleanTenantId, cleanCatalogId);
    const current = syncIntervals.get(key);
    if (current) {
        clearInterval(current);
        syncIntervals.delete(key);
    }

    const hours = normalizeIntervalHours(intervalHours);
    if (!hours) {
        return setStoredStatus(cleanTenantId, cleanCatalogId, { intervalHours: 0, nextSync: null });
    }

    const ms = hours * 60 * 60 * 1000;
    const nextSync = new Date(Date.now() + ms).toISOString();
    const handle = setInterval(() => {
        syncCatalogFromWoocommerce(cleanTenantId, cleanCatalogId).catch((error) => {
            setStoredStatus(cleanTenantId, cleanCatalogId, {
                status: 'error',
                error: String(error?.message || error)
            });
        });
        setStoredStatus(cleanTenantId, cleanCatalogId, {
            nextSync: new Date(Date.now() + ms).toISOString()
        });
    }, ms);
    if (typeof handle.unref === 'function') handle.unref();
    syncIntervals.set(key, handle);
    return setStoredStatus(cleanTenantId, cleanCatalogId, { intervalHours: hours, nextSync });
}

async function warmupAllCatalogs() {
    let rows = [];
    try {
        const result = await queryPostgres(
            `SELECT tenant_id, catalog_id
               FROM tenant_catalogs
              WHERE is_active IS TRUE
                AND LOWER(source_type) = 'woocommerce'`
        );
        rows = Array.isArray(result?.rows) ? result.rows : [];
    } catch (error) {
        const code = String(error?.code || '').trim();
        if (code === '42P01') return { warmed: 0, errors: 0 };
        throw error;
    }

    let warmed = 0;
    let errors = 0;
    for (const row of rows) {
        try {
            await syncCatalogFromWoocommerce(row.tenant_id, row.catalog_id);
            warmed += 1;
        } catch (_) {
            errors += 1;
        }
    }
    return { warmed, errors };
}

async function getSyncStatus(tenantId = DEFAULT_TENANT_ID, catalogId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
    const current = getStoredStatus(cleanTenantId, cleanCatalogId);
    const productCount = await countCatalogProducts(cleanTenantId, cleanCatalogId);
    const next = { ...current, productCount };
    syncStatus.set(statusKey(cleanTenantId, cleanCatalogId), next);
    return next;
}

module.exports = {
    syncCatalogFromWoocommerce,
    scheduleCatalogSync,
    warmupAllCatalogs,
    getSyncStatus
};
