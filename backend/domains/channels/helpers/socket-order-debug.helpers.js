function createSocketOrderDebugHelpers({
    env = process.env,
    buildOrderDebugKey,
    pickOrderDebugData,
    safeOrderDebugJson,
    extractCatalogItemCategories,
    buildCatalogDebugLine,
    normalizeOrderCurrencyAmount,
    dedupeOrderProducts,
    collectProductsFromUnknownShape,
    parseProductsFromBodyText,
    parseProductsFromOrderTitle
} = {}) {
    const orderDebugSeen = new Set();
    const ORDER_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(
        String(env?.ORDER_DEBUG || '').trim().toLowerCase()
    );
    const ORDER_DEBUG_VERBOSE = ['1', 'true', 'yes', 'on'].includes(
        String(env?.ORDER_DEBUG_VERBOSE || '').trim().toLowerCase()
    );
    const CATALOG_DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(
        String(env?.CATALOG_DEBUG || '').trim().toLowerCase()
    );
    const ORDER_DEBUG_MISSING_ENABLED = ['1', 'true', 'yes', 'on'].includes(
        String(env?.ORDER_DEBUG_MISSING || env?.ORDER_DEBUG || '').trim().toLowerCase()
    );
    const CATALOG_DEBUG_MAX_ITEMS = Math.max(
        1,
        Number(env?.CATALOG_DEBUG_MAX_ITEMS || 120)
    );
    let catalogDebugLastSignature = '';

    function logOrderDebug({
        msg,
        data,
        orderId,
        products,
        subtotal,
        subtotalFrom1000,
        subtotalFallback,
        currency,
        rawPreview
    }) {
        const key = buildOrderDebugKey(orderId, data, msg);
        const hasLines = Array.isArray(products) && products.length > 0;
        const seenKey = `${hasLines ? 'ok' : 'missing'}:${key}`;

        if (orderDebugSeen.has(seenKey)) return;
        orderDebugSeen.add(seenKey);

        const summary = {
            key,
            type: msg?.type || data?.type || null,
            orderId: orderId || null,
            productsCount: Array.isArray(products) ? products.length : 0,
            itemCount: rawPreview?.itemCount || null,
            subtotalFrom1000,
            subtotalFallback,
            subtotal,
            currency,
            hasMsgOrder: Boolean(msg?.order),
            hasMsgOrderProducts: Array.isArray(msg?.orderProducts)
                ? msg.orderProducts.length
                : Boolean(msg?.orderProducts),
            dataKeys: Object.keys(data || {}).slice(0, 60)
        };

        if (!hasLines) {
            if (ORDER_DEBUG_MISSING_ENABLED) {
                console.warn('[OrderDebug] Pedido detectado SIN lineas de producto:', summary);
            }
        } else if (ORDER_DEBUG_ENABLED) {
            console.log('[OrderDebug] Pedido parseado:', summary);
        }

        if (ORDER_DEBUG_VERBOSE || (!hasLines && ORDER_DEBUG_MISSING_ENABLED)) {
            const preview = safeOrderDebugJson({
                msgOrder: msg?.order,
                msgOrderProducts: msg?.orderProducts,
                data: pickOrderDebugData(data),
                body: msg?.body || data?.body || null
            });
            if (preview) console.log('[OrderDebug] Payload preview:', preview);
        }
    }

    function logCatalogDebugSnapshot({ catalog = [], catalogMeta = {} } = {}) {
        if (!CATALOG_DEBUG_ENABLED) return;

        const safeCatalog = Array.isArray(catalog) ? catalog : [];
        const categories = Array.isArray(catalogMeta?.categories)
            ? catalogMeta.categories.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [];

        const signature = JSON.stringify({
            source: String(catalogMeta?.source || 'unknown'),
            totalProducts: safeCatalog.length,
            categories,
            sample: safeCatalog.slice(0, 40).map((item) => [
                String(item?.id || ''),
                String(item?.sku || ''),
                extractCatalogItemCategories(item).join('|')
            ])
        });

        if (signature === catalogDebugLastSignature) return;
        catalogDebugLastSignature = signature;

        console.log(
            `[CatalogDebug] source=${String(catalogMeta?.source || 'unknown')} totalProducts=${safeCatalog.length} totalCategories=${categories.length}`
        );
        if (categories.length > 0) {
            console.log(`[CatalogDebug] categories=${categories.join(' | ')}`);
        }

        const maxLines = Math.min(Math.max(1, CATALOG_DEBUG_MAX_ITEMS), safeCatalog.length);
        for (let i = 0; i < maxLines; i += 1) {
            console.log(buildCatalogDebugLine(safeCatalog[i], i));
        }

        if (safeCatalog.length > maxLines) {
            console.log(`[CatalogDebug] ... +${safeCatalog.length - maxLines} productos adicionales`);
        }
    }

    function extractOrderInfo(msg) {
        try {
            const data = msg?._data || {};
            const orderTitle = data?.orderTitle
                || data?.title
                || msg?.orderTitle
                || msg?.title
                || msg?.order?.order_title
                || msg?.order?.catalog_name
                || msg?.order?.text
                || '';
            let products = [];
            if (Array.isArray(msg?.orderProducts) && msg.orderProducts.length > 0) {
                products = msg.orderProducts.map((item) => ({
                    name: String(item?.name || item?.sku || '').trim() || 'Producto',
                    quantity: Math.max(1, Number(item?.quantity) || 1),
                    price: item?.price ?? null,
                    lineTotal: item?.lineTotal ?? null,
                    sku: item?.sku || null,
                    currency: item?.currency || 'PEN'
                }));
            } else {
                products = collectProductsFromUnknownShape({
                    msgOrder: msg?.order,
                    msgOrderProducts: msg?.orderProducts,
                    native: msg,
                    raw: data
                });
            }

            if (!products.length) {
                products = parseProductsFromBodyText(msg?.body || data?.body || '');
            }
            if (!products.length) {
                products = parseProductsFromOrderTitle(orderTitle);
            }
            products = dedupeOrderProducts(products);

            const messageId = msg?.id?._serialized
                || msg?.id
                || data?.message_id
                || data?.messageId
                || data?.id?._serialized
                || data?.id
                || null;

            const orderId = msg?.orderId
                || msg?.order?.id
                || msg?.order?.order_id
                || data?.orderId
                || data?.order?.id
                || data?.order?.order_id
                || data?.orderToken
                || data?.token
                || messageId
                || null;
            const subtotalFrom1000 = normalizeOrderCurrencyAmount(
                msg?.totalAmount1000
                ?? msg?.order?.total_amount_1000
                ?? msg?.order?.subtotal_amount_1000
                ?? msg?.order?.total_amount
                ?? data?.totalAmount1000
                ?? data?.total_amount_1000
                ?? data?.subtotalAmount1000
                ?? data?.subtotal_amount_1000
                ?? data?.priceTotalAmount1000,
                { scaleHint: '1000' }
            );
            const subtotalFallback = normalizeOrderCurrencyAmount(
                msg?.subtotal
                ?? msg?.order?.subtotal
                ?? msg?.order?.total
                ?? msg?.total
                ?? data?.subtotal
                ?? data?.total
                ?? data?.totalAmount,
                { scaleHint: 'subtotal' }
            );
            const subtotal = Number.isFinite(subtotalFrom1000) ? subtotalFrom1000 : subtotalFallback;
            const currency = msg?.currency
                || msg?.order?.currency
                || msg?.order?.currency_code
                || data?.totalCurrencyCode
                || data?.currency
                || 'PEN';

            const maybeOrderType = String(msg?.type || '').toLowerCase().includes('order')
                || String(data?.type || '').toLowerCase().includes('order')
                || String(msg?.type || '').toLowerCase().includes('product')
                || String(data?.type || '').toLowerCase().includes('product')
                || products.length > 0
                || Boolean(orderId)
                || Boolean(msg?.order);

            if (!maybeOrderType) return null;

            const rawPreview = {
                type: msg?.type || data?.type || null,
                body: msg?.body || data?.body || null,
                title: orderTitle || null,
                itemCount: data?.itemCount
                    || data?.orderItemCount
                    || msg?.itemCount
                    || msg?.order?.item_count
                    || products.length
                    || null,
                sellerJid: data?.sellerJid || msg?.order?.seller_jid || null,
                token: data?.orderToken || data?.token || msg?.order?.token || null,
                messageId
            };

            logOrderDebug({
                msg,
                data,
                orderId,
                products,
                subtotal: Number.isFinite(subtotal) ? subtotal : null,
                subtotalFrom1000,
                subtotalFallback,
                currency,
                rawPreview
            });

            return {
                orderId,
                currency,
                subtotal: Number.isFinite(subtotal) ? subtotal : null,
                products,
                rawPreview
            };
        } catch (error) {
            return null;
        }
    }

    return {
        extractOrderInfo,
        logCatalogDebugSnapshot
    };
}

module.exports = {
    createSocketOrderDebugHelpers
};

