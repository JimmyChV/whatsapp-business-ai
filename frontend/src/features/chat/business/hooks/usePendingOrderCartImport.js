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
    quoteHistory = [],
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
    setCartOpenReason = null,
    updateDraft = null,
    formatMoney
} = {}) => {
    useEffect(() => {
        if (!pendingOrderCartLoad || !activeChatId) return;
        if (String(pendingOrderCartLoad.chatId || '') !== String(activeChatId)) return;

        const token = String(pendingOrderCartLoad.token || pendingOrderCartLoad.order?.orderId || '');
        const dedupeKey = `${activeChatId}:${token}`;
        if (token && lastImportedOrderRef?.current === dedupeKey) return;

        const openImportedCart = () => {
            if (typeof setCartOpenReason === 'function') {
                setCartOpenReason('import');
            }
            if (typeof setActiveTab === 'function') {
                setActiveTab('cart', { cartOpenReason: 'import' });
            }
        };

        if (typeof setCartOpenReason === 'function') {
            setCartOpenReason('import');
        }

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
        const orderType = String(
            order?.sourceType
            || order?.source_type
            || order?.rawPreview?.sourceType
            || order?.rawPreview?.source_type
            || order?.rawPreview?.type
            || ''
        ).toLowerCase();
        const isQuoteImport = orderType.includes('quote');
        const orderQuoteId = String(order?.quoteId || order?.rawPreview?.quoteId || '').trim();
        const orderQuoteNumber = Number(order?.quoteNumber ?? order?.quote_number ?? order?.rawPreview?.quoteNumber ?? order?.rawPreview?.quote_number ?? 0) || null;
        const orderRevisionNumber = Number(order?.revisionNumber ?? order?.revision_number ?? order?.rawPreview?.revisionNumber ?? order?.rawPreview?.revision_number ?? 0) || null;
        const orderQuoteMessageId = String(
            order?.sourceQuoteMessageId
            || order?.source_quote_message_id
            || order?.rawPreview?.sourceQuoteMessageId
            || pendingOrderCartLoad?.messageId
            || ''
        ).trim();
        const matchedQuote = isQuoteImport && Array.isArray(quoteHistory)
            ? quoteHistory.find((quote) => {
                const quoteId = String(quote?.quoteId || quote?.quote_id || '').trim();
                const messageId = String(quote?.messageId || quote?.message_id || '').trim();
                const quoteNumber = Number(quote?.quoteNumber ?? quote?.quote_number ?? 0) || null;
                const revisionNumber = Number(quote?.revisionNumber ?? quote?.revision_number ?? 0) || null;
                if (orderQuoteId && quoteId && orderQuoteId === quoteId) return true;
                if (orderQuoteMessageId && messageId && orderQuoteMessageId === messageId) return true;
                if (orderQuoteNumber && quoteNumber && orderQuoteNumber === quoteNumber) {
                    return !orderRevisionNumber || !revisionNumber || orderRevisionNumber === revisionNumber;
                }
                return false;
            })
            : null;
        const matchedQuoteItems = [
            matchedQuote?.itemsJson,
            matchedQuote?.items_json,
            matchedQuote?.items
        ].find((items) => Array.isArray(items) && items.length > 0) || [];
        const matchedQuoteSummary = matchedQuote?.summaryJson && typeof matchedQuote.summaryJson === 'object'
            ? matchedQuote.summaryJson
            : (matchedQuote?.summary && typeof matchedQuote.summary === 'object' ? matchedQuote.summary : null);
        const sourceOrderId = String(
            order?.rawPreview?.token
            || order?.rawPreview?.orderId
            || order?.orderId
            || ''
        ).trim();
        const sourceOrderMessageId = String(
            order?.sourceMessageId
            || order?.messageId
            || order?.rawPreview?.messageId
            || pendingOrderCartLoad?.messageId
            || ''
        ).trim();
        const sourceOrder = (sourceOrderId || sourceOrderMessageId)
            ? {
                orderId: sourceOrderId || null,
                messageId: sourceOrderMessageId || null
            }
            : null;
        if (isQuoteImport) {
            applyDraftPatch({
                sourceOrder: null,
                sourceQuote: {
                    quoteId: orderQuoteId || String(matchedQuote?.quoteId || matchedQuote?.quote_id || '').trim() || null,
                    quoteNumber: orderQuoteNumber || Number(matchedQuote?.quoteNumber ?? matchedQuote?.quote_number ?? 0) || null,
                    revisionNumber: orderRevisionNumber || Number(matchedQuote?.revisionNumber ?? matchedQuote?.revision_number ?? 0) || null,
                    messageId: orderQuoteMessageId || String(matchedQuote?.messageId || matchedQuote?.message_id || '').trim() || null
                },
                sourceType: 'quote'
            });
        } else if (sourceOrder) {
            applyDraftPatch({ sourceOrder });
        }
        const isProductImport = orderType.includes('product') && !String(order?.orderId || '').trim();
        const quoteSummary = order?.rawPreview?.quoteSummary && typeof order.rawPreview.quoteSummary === 'object'
            ? order.rawPreview.quoteSummary
            : matchedQuoteSummary;
        const firstArray = (...candidates) => candidates.find((items) => Array.isArray(items) && items.length > 0) || [];
        const rawSourceItems = firstArray(
            order.products,
            order.rawPreview?.products,
            order.items,
            order.rawPreview?.items,
            order.lineItems,
            order.line_items,
            order.rawPreview?.lineItems,
            order.rawPreview?.line_items,
            order.rawPreview?.order?.products,
            order.rawPreview?.order?.items,
            order.payload?.products,
            order.payload?.items,
            matchedQuoteItems
        );
        const sourceItems = rawSourceItems
            .map((line, idx) => {
                if (line && typeof line === 'object') return line;
                const text = String(line || '').trim();
                return text ? { name: text, quantity: 1, sourceIndex: idx } : null;
            })
            .filter(Boolean);
        const titleFallbackItems = sourceItems.length === 0
            ? firstArray(
                parseOrderTitleItems(order?.rawPreview?.title || order?.rawPreview?.orderTitle || ''),
                parseOrderTitleItems(order?.rawPreview?.body || order?.body || order?.text || ''),
                parseOrderTitleItems(order?.rawPreview?.text || '')
            )
            : [];
        const itemsToImport = sourceItems.length > 0 ? sourceItems : titleFallbackItems;
        const usedTitleFallback = sourceItems.length === 0 && titleFallbackItems.length > 0;

        if (itemsToImport.length === 0) {
            applyDraftPatch({ cart: [], sourceOrder: null, sourceQuote: null, sourceType: null });
            setOrderImportStatus({
                level: 'warn',
                text: 'No se pudo cargar el detalle de esta cotización'
            });
            setActiveTab('catalog');
            if (typeof setCartOpenReason === 'function') {
                setCartOpenReason(null);
            }
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

            const rawSku = String(
                line.sku
                || line.SKU
                || line.retailer_id
                || line.retailerId
                || line.product_retailer_id
                || line.productRetailerId
                || line.product?.sku
                || line.item?.sku
                || ''
            ).trim();
            const skuKey = normalizeSkuKey(rawSku);
            const rawName = String(
                line.name
                || line.title
                || line.productName
                || line.product_name
                || line.product?.name
                || line.product?.title
                || line.item?.name
                || line.item?.title
                || ''
            ).trim();
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

            const qtyRaw = parseMoney(line.quantity ?? line.qty ?? line.count ?? line.amount ?? 1, 1);
            const qty = isProductImport
                ? 1
                : Math.max(1, Math.round(Number.isFinite(qtyRaw) ? qtyRaw : 1));
            const linePrice = parseMoney(line.price ?? line.unitPrice ?? line.unit_price ?? line.itemPrice ?? line.item_price ?? 0, 0);
            const lineTotal = parseMoney(line.lineTotal ?? line.line_total ?? line.total ?? line.totalPrice ?? line.total_price ?? 0, 0);
            const lineSubtotal = parseMoney(line.lineSubtotal ?? line.line_subtotal ?? line.subtotal ?? line.subtotalPrice ?? line.subtotal_price ?? (qty * linePrice), 0);
            const lineDiscountAmount = Math.max(0, parseMoney(line.lineDiscountAmount ?? 0, 0));
            const rawLineDiscountType = String(line.lineDiscountType || line.discountType || '').trim().toLowerCase();
            const lineDiscountType = rawLineDiscountType === 'amount' ? 'amount' : 'percent';
            let lineDiscountValue = Math.max(0, parseMoney(line.lineDiscountValue ?? 0, 0));
            if (lineDiscountAmount > 0 && lineDiscountValue <= 0) {
                lineDiscountValue = lineDiscountType === 'amount'
                    ? lineDiscountAmount
                    : Math.min(100, (lineSubtotal > 0 ? (lineDiscountAmount / lineSubtotal) * 100 : 0));
            }
            const lineDiscountEnabled = lineDiscountAmount > 0 || lineDiscountValue > 0;
            const derivedUnitPrice = parseMoney(line.unitPrice, (lineTotal > 0 && qty > 0 ? (lineTotal / qty) : linePrice));
            const derivedRegularUnitPrice = lineSubtotal > 0 && qty > 0 ? (lineSubtotal / qty) : derivedUnitPrice;

            let baseLine = null;
            if (matched && !isQuoteImport) {
                baseLine = {
                    ...matched,
                    sku: matched.sku || rawSku || null,
                    qty,
                    lineDiscountEnabled: Boolean(matched.lineDiscountEnabled || false),
                    lineDiscountType: matched.lineDiscountType === 'amount' ? 'amount' : 'percent',
                    lineDiscountValue: Math.max(0, parseMoney(matched.lineDiscountValue, 0))
                };
            } else if (matched) {
                baseLine = {
                    ...matched,
                    price: Math.max(0, derivedUnitPrice || 0).toFixed(2),
                    regularPrice: Math.max(0, derivedRegularUnitPrice || 0).toFixed(2),
                    sku: matched.sku || rawSku || null,
                    qty,
                    lineDiscountEnabled,
                    lineDiscountType,
                    lineDiscountValue,
                    lineDiscountAmount: roundMoney(lineDiscountAmount)
                };
            } else {
                baseLine = {
                    id: `meta_order_${skuKey || nameKey || idx + 1}`,
                    title: rawName || (rawSku ? `SKU ${rawSku}` : `Producto pedido ${idx + 1}`),
                    price: Math.max(0, derivedUnitPrice || 0).toFixed(2),
                    regularPrice: Math.max(0, derivedRegularUnitPrice || 0).toFixed(2),
                    salePrice: null,
                    discountPct: 0,
                    description: 'Producto importado desde pedido de WhatsApp.',
                    imageUrl: null,
                    source: 'meta_order',
                    sku: rawSku || null,
                    stockStatus: null,
                    qty,
                    lineDiscountEnabled,
                    lineDiscountType,
                    lineDiscountValue,
                    lineDiscountAmount: roundMoney(lineDiscountAmount)
                };
            }

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
            applyDraftPatch({ cart: [], sourceOrder: null, sourceQuote: null, sourceType: null });
            setOrderImportStatus({
                level: 'warn',
                text: 'No se pudo cargar el detalle de esta cotización'
            });
            setActiveTab('catalog');
            if (typeof setCartOpenReason === 'function') {
                setCartOpenReason(null);
            }
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
        if (token && lastImportedOrderRef) {
            lastImportedOrderRef.current = dedupeKey;
        }
        openImportedCart();

        let quoteDiscountAmount = 0;
        let importedLineDiscountTotal = 0;
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

            importedLineDiscountTotal = roundMoney(importedCart.reduce((sum, item) => {
                const explicit = Math.max(0, parseMoney(item?.lineDiscountAmount, 0));
                if (explicit > 0) return sum + explicit;
                if (!item?.lineDiscountEnabled) return sum;
                const qty = Math.max(1, Math.round(parseMoney(item?.qty, 1) || 1));
                const unitPrice = Math.max(0, parseMoney(item?.price, 0));
                const regularPrice = Math.max(unitPrice, parseMoney(item?.regularPrice ?? item?.price, unitPrice));
                const fallback = Math.max(0, roundMoney((regularPrice - unitPrice) * qty));
                return sum + fallback;
            }, 0));

            reconstructedGlobalDiscount = roundMoney(Math.max(0, quoteDiscountAmount - importedLineDiscountTotal));

            const quoteDeliveryAmount = Math.max(0, parseMoney(quoteSummary?.deliveryAmount ?? 0, 0));
            const quoteDeliveryFree = Boolean(quoteSummary?.deliveryFree) || quoteDeliveryAmount <= 0;

            const summaryGlobalDiscountType = String(quoteSummary?.globalDiscount?.type || '').trim().toLowerCase();
            const summaryGlobalDiscountValue = Math.max(0, parseMoney(quoteSummary?.globalDiscount?.value ?? 0, 0));
            const hasSummaryGlobalDiscount = (summaryGlobalDiscountType === 'percent' || summaryGlobalDiscountType === 'amount')
                && summaryGlobalDiscountValue > 0;
            const quotePatch = {
                globalDiscountEnabled: hasSummaryGlobalDiscount ? true : reconstructedGlobalDiscount > 0,
                globalDiscountType: hasSummaryGlobalDiscount ? summaryGlobalDiscountType : 'amount',
                globalDiscountValue: hasSummaryGlobalDiscount
                    ? summaryGlobalDiscountValue
                    : (reconstructedGlobalDiscount > 0 ? reconstructedGlobalDiscount : 0),
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
            isQuoteImport && importedLineDiscountTotal > 0 ? `descuento por linea: S/ ${formatMoney(importedLineDiscountTotal)}` : null,
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
        quoteHistory,
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
        setCartOpenReason,
        updateDraft,
        formatMoney
    ]);
};


