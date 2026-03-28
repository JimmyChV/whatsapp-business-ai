import { useEffect } from 'react';
import {
    normalizeCatalogItem,
    normalizeSkuKey,
    normalizeTextKey,
    parseMoney,
    parseOrderTitleItems,
    roundMoney
} from '../helpers';

export const usePendingOrderCartImport = ({
    pendingOrderCartLoad = null,
    activeChatId = '',
    catalog = [],
    lastImportedOrderRef,
    setCart,
    setShowOrderAdjustments,
    setActiveTab,
    setOrderImportStatus,
    setGlobalDiscountEnabled,
    setGlobalDiscountType,
    setGlobalDiscountValue,
    setDeliveryType,
    setDeliveryAmount,
    updateDraft = null,
    formatMoney
} = {}) => {
    useEffect(() => {
        if (!pendingOrderCartLoad || !activeChatId) return;
        if (String(pendingOrderCartLoad.chatId || '') !== String(activeChatId)) return;

        const token = String(pendingOrderCartLoad.token || pendingOrderCartLoad.order?.orderId || '');
        const dedupeKey = `${activeChatId}:${token}`;
        if (token && lastImportedOrderRef?.current === dedupeKey) return;
        if (token && lastImportedOrderRef) lastImportedOrderRef.current = dedupeKey;

        const applyDraftPatch = (patchOrFn) => {
            if (typeof updateDraft !== 'function') return false;
            updateDraft(patchOrFn);
            return true;
        };

        const applyCartChange = (nextCart, options = {}) => {
            const showAdjustments = options.showOrderAdjustments;
            const patched = applyDraftPatch((previousDraft = {}) => {
                const previousCart = Array.isArray(previousDraft?.cart) ? previousDraft.cart : [];
                const resolvedCart = typeof nextCart === 'function' ? nextCart(previousCart) : nextCart;
                const patch = { cart: Array.isArray(resolvedCart) ? resolvedCart : [] };
                if (typeof showAdjustments === 'boolean') {
                    patch.showOrderAdjustments = showAdjustments;
                }
                return patch;
            });
            if (patched) return;
            setCart(nextCart);
            if (typeof showAdjustments === 'boolean') {
                setShowOrderAdjustments(showAdjustments);
            }
        };

        const order = pendingOrderCartLoad.order && typeof pendingOrderCartLoad.order === 'object'
            ? pendingOrderCartLoad.order
            : {};
        const orderType = String(order?.rawPreview?.type || '').toLowerCase();
        const isProductImport = orderType.includes('product') && !String(order?.orderId || '').trim();
        const isQuoteImport = orderType.includes('quote');
        const quoteSummary = order?.rawPreview?.quoteSummary && typeof order.rawPreview.quoteSummary === 'object'
            ? order.rawPreview.quoteSummary
            : null;
        const sourceItems = Array.isArray(order.products) ? order.products : [];
        const titleFallbackItems = sourceItems.length === 0
            ? parseOrderTitleItems(order?.rawPreview?.title || order?.rawPreview?.orderTitle || '')
            : [];
        const itemsToImport = sourceItems.length > 0 ? sourceItems : titleFallbackItems;
        const usedTitleFallback = sourceItems.length === 0 && titleFallbackItems.length > 0;

        if (itemsToImport.length === 0) {
            const reportedCountRaw = parseMoney(order?.rawPreview?.itemCount ?? 1, 1);
            const reportedCount = Math.max(1, Math.round(Number.isFinite(reportedCountRaw) ? reportedCountRaw : 1));
            const subtotalValue = Math.max(0, parseMoney(order?.subtotal ?? 0, 0));
            const unitValue = reportedCount > 0 ? (subtotalValue / reportedCount) : subtotalValue;

            const fallbackCart = [{
                id: `meta_order_unknown_${String(order?.orderId || token || Date.now())}`,
                title: 'Pedido WhatsApp (detalle no disponible)',
                price: Math.max(0, unitValue).toFixed(2),
                regularPrice: Math.max(0, unitValue).toFixed(2),
                salePrice: null,
                discountPct: 0,
                description: 'Meta/WhatsApp no devolvio lineas del pedido en esta sesion. Puedes aplicar descuento y delivery.',
                imageUrl: null,
                source: 'meta_order',
                sku: null,
                stockStatus: null,
                qty: reportedCount,
                lineDiscountEnabled: false,
                lineDiscountType: 'percent',
                lineDiscountValue: 0
            }];

            applyCartChange(fallbackCart, { showOrderAdjustments: true });
            setActiveTab('cart');
            setOrderImportStatus({
                level: 'warn',
                text: `Pedido cargado sin detalle de productos (items reportados: ${reportedCount}). Usa subtotal S/ ${formatMoney(subtotalValue)} y aplica ajustes.`
            });
            return;
        }

        const catalogBySku = new Map();
        const catalogByName = new Map();
        const catalogList = [];
        catalog.forEach((item, idx) => {
            const normalized = normalizeCatalogItem(item, idx);
            catalogList.push(normalized);
            const skuKey = normalizeSkuKey(normalized.sku);
            if (skuKey && !catalogBySku.has(skuKey)) catalogBySku.set(skuKey, normalized);
            const nameKey = normalizeTextKey(normalized.title);
            if (nameKey && !catalogByName.has(nameKey)) catalogByName.set(nameKey, normalized);
        });

        const merged = new Map();
        let matchedBySku = 0;
        let matchedByName = 0;
        let fallbackLines = 0;

        itemsToImport.forEach((line, idx) => {
            if (!line || typeof line !== 'object') return;

            const rawSku = String(line.sku || line.retailer_id || line.product_retailer_id || '').trim();
            const skuKey = normalizeSkuKey(rawSku);
            const rawName = String(line.name || line.title || '').trim();
            const nameKey = normalizeTextKey(rawName);

            let matched = null;
            if (skuKey && catalogBySku.has(skuKey)) {
                matched = catalogBySku.get(skuKey);
                matchedBySku += 1;
            } else if (nameKey && catalogByName.has(nameKey)) {
                matched = catalogByName.get(nameKey);
                matchedByName += 1;
            } else if (nameKey) {
                matched = catalogList.find((candidate) => {
                    const candidateKey = normalizeTextKey(candidate.title);
                    if (!candidateKey) return false;
                    return candidateKey.includes(nameKey) || nameKey.includes(candidateKey);
                }) || null;
                if (matched) matchedByName += 1;
            }

            const qtyRaw = parseMoney(line.quantity ?? line.qty ?? 1, 1);
            const qty = isProductImport
                ? 1
                : Math.max(1, Math.round(Number.isFinite(qtyRaw) ? qtyRaw : 1));
            const linePrice = parseMoney(line.price ?? line.unitPrice ?? 0, 0);
            const lineTotal = parseMoney(line.lineTotal ?? line.total ?? 0, 0);
            const derivedUnitPrice = lineTotal > 0 && qty > 0 ? (lineTotal / qty) : linePrice;

            const baseLine = matched
                ? {
                    ...matched,
                    price: parseMoney(matched.price, derivedUnitPrice > 0 ? derivedUnitPrice : 0).toFixed(2),
                    regularPrice: parseMoney(matched.regularPrice ?? matched.price, parseMoney(matched.price, 0)).toFixed(2),
                    sku: matched.sku || rawSku || null,
                    qty,
                    lineDiscountEnabled: false,
                    lineDiscountType: 'percent',
                    lineDiscountValue: 0
                }
                : {
                    id: `meta_order_${skuKey || nameKey || idx + 1}`,
                    title: rawName || (rawSku ? `SKU ${rawSku}` : `Producto pedido ${idx + 1}`),
                    price: Math.max(0, derivedUnitPrice || 0).toFixed(2),
                    regularPrice: Math.max(0, derivedUnitPrice || 0).toFixed(2),
                    salePrice: null,
                    discountPct: 0,
                    description: 'Producto importado desde pedido de WhatsApp.',
                    imageUrl: null,
                    source: 'meta_order',
                    sku: rawSku || null,
                    stockStatus: null,
                    qty,
                    lineDiscountEnabled: false,
                    lineDiscountType: 'percent',
                    lineDiscountValue: 0
                };

            if (!matched) fallbackLines += 1;

            const lineKey = String(baseLine.id || `line_${idx}`);
            if (merged.has(lineKey)) {
                const prev = merged.get(lineKey);
                merged.set(lineKey, {
                    ...prev,
                    qty: Math.max(1, Number(prev.qty || 1) + qty)
                });
                return;
            }
            merged.set(lineKey, baseLine);
        });

        const importedCart = Array.from(merged.values());
        if (importedCart.length === 0) {
            setOrderImportStatus({
                level: 'warn',
                text: 'Pedido recibido, pero no se pudo convertir a items del carrito.'
            });
            return;
        }

        if (isProductImport) {
            applyCartChange((prev) => {
                const safePrev = Array.isArray(prev) ? prev : [];
                const map = new Map();
                const buildMergeKey = (item, idx) => {
                    const sku = normalizeSkuKey(item?.sku);
                    if (sku) return `sku:${sku}`;
                    const id = String(item?.id || '').trim();
                    if (id) return `id:${id}`;
                    const name = normalizeTextKey(item?.title || item?.name || '');
                    return name ? `name:${name}` : `line:${idx}`;
                };

                safePrev.forEach((item, idx) => {
                    const key = buildMergeKey(item, idx);
                    map.set(key, {
                        ...item,
                        qty: Math.max(1, Number(item?.qty || 1))
                    });
                });

                importedCart.forEach((item, idx) => {
                    const key = buildMergeKey(item, idx);
                    if (map.has(key)) {
                        const prevItem = map.get(key);
                        map.set(key, {
                            ...prevItem,
                            qty: Math.max(1, Number(prevItem?.qty || 1) + 1)
                        });
                        return;
                    }
                    map.set(key, {
                        ...item,
                        qty: 1
                    });
                });

                return Array.from(map.values());
            }, { showOrderAdjustments: true });
        } else {
            applyCartChange(importedCart, { showOrderAdjustments: true });
        }
        setActiveTab('cart');

        let quoteDiscountAmount = 0;
        let includedDiscountFromCatalog = 0;
        let reconstructedGlobalDiscount = 0;

        if (isQuoteImport && quoteSummary) {
            const parseMaybe = (value) => {
                const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
                return Number.isFinite(parsed) ? parsed : null;
            };

            const summaryDiscount = parseMaybe(quoteSummary?.discount);
            const summarySubtotal = parseMaybe(quoteSummary?.subtotal);
            const summaryTotalAfterDiscount = parseMaybe(quoteSummary?.totalAfterDiscount);
            quoteDiscountAmount = Number.isFinite(summaryDiscount)
                ? Math.max(0, summaryDiscount)
                : (Number.isFinite(summarySubtotal) && Number.isFinite(summaryTotalAfterDiscount)
                    ? Math.max(0, roundMoney(summarySubtotal - summaryTotalAfterDiscount))
                    : 0);

            includedDiscountFromCatalog = roundMoney(importedCart.reduce((sum, item) => {
                const qty = Math.max(1, Math.round(parseMoney(item?.qty, 1) || 1));
                const unitPrice = Math.max(0, parseMoney(item?.price, 0));
                const regularPrice = Math.max(unitPrice, parseMoney(item?.regularPrice ?? item?.price, unitPrice));
                const lineIncluded = Math.max(0, roundMoney((regularPrice - unitPrice) * qty));
                return sum + lineIncluded;
            }, 0));

            reconstructedGlobalDiscount = roundMoney(Math.max(0, quoteDiscountAmount - includedDiscountFromCatalog));

            const quoteDeliveryAmount = Math.max(0, parseMoney(quoteSummary?.deliveryAmount ?? 0, 0));
            const quoteDeliveryFree = Boolean(quoteSummary?.deliveryFree) || quoteDeliveryAmount <= 0;

            const quotePatch = {
                globalDiscountEnabled: reconstructedGlobalDiscount > 0,
                globalDiscountType: 'amount',
                globalDiscountValue: reconstructedGlobalDiscount > 0 ? reconstructedGlobalDiscount : 0,
                deliveryType: quoteDeliveryFree ? 'free' : 'amount',
                deliveryAmount: quoteDeliveryFree ? 0 : quoteDeliveryAmount
            };
            const patched = applyDraftPatch(quotePatch);
            if (!patched) {
                setGlobalDiscountEnabled(quotePatch.globalDiscountEnabled);
                setGlobalDiscountType(quotePatch.globalDiscountType);
                setGlobalDiscountValue(quotePatch.globalDiscountValue);
                setDeliveryType(quotePatch.deliveryType);
                setDeliveryAmount(quotePatch.deliveryAmount);
            }
        }

        const reportedItems = Number(order?.rawPreview?.itemCount || itemsToImport.length || importedCart.length);
        const hasSubtotal = order?.subtotal !== null && order?.subtotal !== undefined && String(order.subtotal).trim() !== '';
        const subtotalLabel = hasSubtotal ? ` | subtotal ${formatMoney(parseMoney(order.subtotal, 0))}` : '';
        const statusBits = [
            isProductImport ? 'Producto agregado al carrito (+1)' : `Pedido cargado al carrito: ${importedCart.length} productos`,
            isProductImport ? null : `(items reportados: ${reportedItems})`,
            usedTitleFallback ? 'origen: titulo del pedido' : null,
            isQuoteImport && quoteSummary ? `descuento detectado: S/ ${formatMoney(quoteDiscountAmount)}` : null,
            isQuoteImport && includedDiscountFromCatalog > 0 ? `descuento kit/base: S/ ${formatMoney(includedDiscountFromCatalog)}` : null,
            isQuoteImport ? `descuento global aplicado: S/ ${formatMoney(reconstructedGlobalDiscount)}` : null,
            matchedBySku > 0 ? `SKU: ${matchedBySku}` : null,
            matchedByName > 0 ? `nombre: ${matchedByName}` : null,
            fallbackLines > 0 ? `sin match: ${fallbackLines}` : null,
        ].filter(Boolean);

        setOrderImportStatus({
            level: fallbackLines > 0 ? 'warn' : 'ok',
            text: `${statusBits.join(' | ')}${subtotalLabel}`
        });
    }, [
        pendingOrderCartLoad,
        activeChatId,
        catalog,
        lastImportedOrderRef,
        setCart,
        setShowOrderAdjustments,
        setActiveTab,
        setOrderImportStatus,
        setGlobalDiscountEnabled,
        setGlobalDiscountType,
        setGlobalDiscountValue,
        setDeliveryType,
        setDeliveryAmount,
        updateDraft,
        formatMoney
    ]);
};


