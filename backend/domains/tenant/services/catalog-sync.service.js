const {
    DEFAULT_TENANT_ID,
    normalizeTenantId,
    queryPostgres
} = require('../../../config/persistence-runtime');
const catalogManagerService = require('./catalog-manager.service');
const tenantCatalogService = require('./tenant-catalog.service');
const { getWooCatalog } = require('./woocommerce.service');

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
            ...(product?.metadata && typeof product.metadata === 'object' ? product.metadata : {}),
            wooProductId: productId || null,
            sku: sku || null,
            regularPrice: product?.regularPrice ?? null,
            salePrice: product?.salePrice ?? null,
            discountPct: product?.discountPct ?? 0,
            stockStatus: product?.stockStatus || null,
            categories: Array.isArray(product?.categories) ? product.categories : [],
            source: 'woocommerce'
        }
    };
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
            reason: wooResult?.reason || null
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
