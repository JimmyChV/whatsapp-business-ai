import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, Send, ShoppingCart, Clock, Sparkles, Trash2, Plus, Minus, ChevronDown, ChevronUp, Package, MessageSquare } from 'lucide-react';
import {
    buildAiScopeInfo,
    buildDefaultAiThread,
    clampNumber,
    formatMoney,
    formatMoneyCompact,
    formatQuoteProductTitle,
    normalizeCatalogItem,
    normalizeSkuKey,
    normalizeTextKey,
    parseMoney,
    parseOrderTitleItems,
    repairMojibake,
    roundMoney
} from './business/businessSidebar.helpers';
import { useAiScopeState } from './business/hooks/useAiScopeState';
import { attachAiSocketListeners, emitAiHistoryRequest, emitAiQuery } from './business/services/aiSocket.service';
import { buildAiRuntimeContext, buildBusinessContextPrompt } from './business/businessSidebarAiContext.helpers';
import {
    buildCartSnapshotPayload,
    buildQuoteMessageFromCart,
    calculateCartPricing,
    getCartLineBreakdown
} from './business/businessSidebarCart.helpers';
import {
    addItemToCartState,
    removeItemFromCartState,
    setCartItemDiscountEnabledState,
    setCartItemDiscountTypeState,
    setCartItemDiscountValueState,
    updateCartItemQtyState
} from './business/businessSidebarCartMutations.helpers';
import { ClientProfilePanel, CompanyProfilePanel } from './business/BusinessProfiles';
import BusinessCatalogTab from './business/BusinessCatalogTab';

export { ClientProfilePanel };

// =========================================================
// BUSINESS SIDEBAR - Main right panel


// =========================================================

const BusinessSidebar = ({ tenantScopeKey = 'default', setInputText, businessData = {}, messages = [], activeChatId, activeChatPhone = '', activeChatDetails = null, onSendToClient, socket, myProfile, onLogout, quickReplies = [], onSendQuickReply = null, waCapabilities = {}, pendingOrderCartLoad = null, openCompanyProfileToken = 0, waModules = [], selectedCatalogModuleId = '', selectedCatalogId = '', activeModuleId = '', onSelectCatalogModule = null, onSelectCatalog = null, onUploadCatalogImage = null, onCartSnapshotChange = null }) => {
    const [activeTab, setActiveTab] = useState('ai');
    const [showCompanyProfile, setShowCompanyProfile] = useState(false);
    const companyProfileRef = useRef(null);

    // AI Chat State
    const [aiInput, setAiInput] = useState('');
    const aiEndRef = useRef(null);

    const normalizedTenantScopeKey = useMemo(() => String(tenantScopeKey || 'default').trim() || 'default', [tenantScopeKey]);
    const {
        activeAiScope,
        activeTenantScopeId,
        aiHistoryLoadedRef,
        aiHistoryRequestSeqRef,
        aiHistoryScopeBySeqRef,
        aiMessages,
        aiRequestScopeRef,
        aiScopeKeyRef,
        currentAiScopeChatId,
        currentAiScopeKey,
        isAiLoading,
        resetAiScopeState,
        setAiScopeLoading,
        setAiThreadMessages,
        setAiThreadsByScope
    } = useAiScopeState({
        tenantScopeKey: normalizedTenantScopeKey,
        activeChatId,
        activeChatDetails,
        activeModuleId,
        selectedCatalogModuleId
    });

    // Cart State
    const [cart, setCart] = useState([]);
    const [showOrderAdjustments, setShowOrderAdjustments] = useState(false);
    const [globalDiscountEnabled, setGlobalDiscountEnabled] = useState(false);
    const [globalDiscountType, setGlobalDiscountType] = useState('percent');
    const [globalDiscountValue, setGlobalDiscountValue] = useState(0);
    const [deliveryType, setDeliveryType] = useState('free');
    const [deliveryAmount, setDeliveryAmount] = useState(0);
    const [showCartTotalsBreakdown, setShowCartTotalsBreakdown] = useState(true);
    const [cartDraftsByChat, setCartDraftsByChat] = useState({});
    const [quickSearch, setQuickSearch] = useState('');
    const [orderImportStatus, setOrderImportStatus] = useState(null);
    const lastImportedOrderRef = useRef('');
    const tenantScopeRef = useRef(String(tenantScopeKey || 'default').trim() || 'default');
    const cartDraftSignaturesRef = useRef({});

    const catalog = useMemo(
        () => (businessData.catalog || []).map((item, idx) => normalizeCatalogItem(item, idx)),
        [businessData.catalog]
    );
    const labels = useMemo(() => (Array.isArray(businessData.labels) ? businessData.labels : []), [businessData.labels]);
    const profile = useMemo(() => (businessData.profile || myProfile || null), [businessData.profile, myProfile]);
    const quickRepliesEnabled = Boolean(waCapabilities?.quickReplies || waCapabilities?.quickRepliesRead || waCapabilities?.quickRepliesWrite);
    useEffect(() => {
        const nextScope = normalizedTenantScopeKey;
        if (tenantScopeRef.current === nextScope) return;
        tenantScopeRef.current = nextScope;

        setActiveTab('ai');
        setShowCompanyProfile(false);
        resetAiScopeState();
        setAiInput('');
        setCart([]);
        setShowOrderAdjustments(false);
        setGlobalDiscountEnabled(false);
        setGlobalDiscountType('percent');
        setGlobalDiscountValue(0);
        setDeliveryType('free');
        setDeliveryAmount(0);
        setShowCartTotalsBreakdown(true);
        setCartDraftsByChat({});
        cartDraftSignaturesRef.current = {};
        setQuickSearch('');
        setOrderImportStatus(null);
        lastImportedOrderRef.current = '';
    }, [normalizedTenantScopeKey, resetAiScopeState]);

    useEffect(() => {
        if (!socket) return;
        if (!currentAiScopeChatId) return;
        if (aiHistoryLoadedRef.current.has(currentAiScopeKey)) return;

        aiHistoryLoadedRef.current.add(currentAiScopeKey);
        const requestSeq = aiHistoryRequestSeqRef.current + 1;
        aiHistoryRequestSeqRef.current = requestSeq;
        aiHistoryScopeBySeqRef.current.set(requestSeq, currentAiScopeKey);

        emitAiHistoryRequest(socket, {
            requestSeq,
            chatId: currentAiScopeChatId,
            scopeModuleId: activeAiScope.scopeModuleId || null,
            limit: 120
        });
    }, [socket, currentAiScopeKey, currentAiScopeChatId, activeAiScope.scopeModuleId]);

    useEffect(() => {
        setOrderImportStatus(null);
        if (!activeChatId) return;
        cartDraftSignaturesRef.current[activeChatId] = '';

        const draft = cartDraftsByChat[activeChatId];
        if (draft) {
            const legacyPct = parseMoney(draft.globalDiscountPct ?? draft.discount ?? 0, 0);
            const legacyAmount = parseMoney(draft.globalDiscountAmount ?? 0, 0);
            const hasLegacyDiscount = legacyPct > 0 || legacyAmount > 0;
            const resolvedDiscountType = draft.globalDiscountType || (legacyAmount > 0 ? 'amount' : 'percent');
            const resolvedDiscountValue = parseMoney(
                draft.globalDiscountValue ?? (resolvedDiscountType === 'amount' ? legacyAmount : legacyPct),
                0
            );

            let resolvedDeliveryType = draft.deliveryType;
            if (!resolvedDeliveryType) {
                const legacyDeliveryEnabled = Boolean(draft.deliveryEnabled ?? false);
                const legacyDeliveryAmount = parseMoney(draft.deliveryAmount ?? 0, 0);
                resolvedDeliveryType = legacyDeliveryEnabled && legacyDeliveryAmount > 0 ? 'amount' : 'free';
            }

            setCart(draft.cart || []);
            setShowOrderAdjustments(Boolean(draft.showOrderAdjustments ?? false));
            setGlobalDiscountEnabled(Boolean(draft.globalDiscountEnabled ?? hasLegacyDiscount));
            setGlobalDiscountType(resolvedDiscountType === 'amount' ? 'amount' : 'percent');
            setGlobalDiscountValue(Math.max(0, resolvedDiscountValue));
            setDeliveryType(resolvedDeliveryType === 'amount' ? 'amount' : 'free');
            setDeliveryAmount(Math.max(0, parseMoney(draft.deliveryAmount ?? 0, 0)));
            setShowCartTotalsBreakdown(Boolean(draft.showCartTotalsBreakdown ?? true));
        } else {
            setCart([]);
            setShowOrderAdjustments(false);
            setGlobalDiscountEnabled(false);
            setGlobalDiscountType('percent');
            setGlobalDiscountValue(0);
            setDeliveryType('free');
            setDeliveryAmount(0);
            setShowCartTotalsBreakdown(true);
        }
    }, [activeChatId]);

    useEffect(() => {
        if (!activeChatId) return;
        const nextDraft = {
            cart,
            showOrderAdjustments,
            globalDiscountEnabled,
            globalDiscountType,
            globalDiscountValue,
            deliveryType,
            deliveryAmount,
            showCartTotalsBreakdown
        };

        const nextSignature = JSON.stringify(nextDraft);
        if (cartDraftSignaturesRef.current[activeChatId] === nextSignature) return;

        cartDraftSignaturesRef.current[activeChatId] = nextSignature;
        setCartDraftsByChat((prev) => {
            const previousDraft = prev?.[activeChatId] || null;
            if (previousDraft && JSON.stringify(previousDraft) === nextSignature) return prev;
            return {
                ...prev,
                [activeChatId]: nextDraft
            };
        });
    }, [activeChatId, cart, showOrderAdjustments, globalDiscountEnabled, globalDiscountType, globalDiscountValue, deliveryType, deliveryAmount, showCartTotalsBreakdown]);

    useEffect(() => {
        if (!pendingOrderCartLoad || !activeChatId) return;
        if (String(pendingOrderCartLoad.chatId || '') !== String(activeChatId)) return;

        const token = String(pendingOrderCartLoad.token || pendingOrderCartLoad.order?.orderId || '');
        const dedupeKey = `${activeChatId}:${token}`;
        if (token && lastImportedOrderRef.current === dedupeKey) return;
        if (token) lastImportedOrderRef.current = dedupeKey;

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

            setCart(fallbackCart);
            setShowOrderAdjustments(true);
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
            setCart((prev) => {
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
            });
        } else {
            setCart(importedCart);
        }
        setShowOrderAdjustments(true);
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

            setGlobalDiscountEnabled(reconstructedGlobalDiscount > 0);
            setGlobalDiscountType('amount');
            setGlobalDiscountValue(reconstructedGlobalDiscount > 0 ? reconstructedGlobalDiscount : 0);
            setDeliveryType(quoteDeliveryFree ? 'free' : 'amount');
            setDeliveryAmount(quoteDeliveryFree ? 0 : quoteDeliveryAmount);
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
    }, [pendingOrderCartLoad, activeChatId, catalog]);

    // Auto-scroll AI chat
    useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

    useEffect(() => {
        if (activeTab === 'quick' && !quickRepliesEnabled) {
            setActiveTab('ai');
        }
    }, [activeTab, quickRepliesEnabled]);

    useEffect(() => {
        if (activeTab === 'cart' && cart.length === 0) {
            setActiveTab('catalog');
        }
    }, [activeTab, cart.length]);

    useEffect(() => {
        if (openCompanyProfileToken > 0) {
            setShowCompanyProfile(true);
        }
    }, [openCompanyProfileToken]);

    useEffect(() => {
        if (!showCompanyProfile) return;
        const handleOutsideClick = (event) => {
            const target = event.target;
            if (companyProfileRef.current?.contains(target)) return;
            setShowCompanyProfile(false);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [showCompanyProfile]);

    // Listen to AI responses from socket
    useEffect(() => {
        if (!socket) return;
        let buffer = '';

        const resolveTargetScope = (fallback = '') => {
            const safeFallback = String(fallback || '').trim();
            if (safeFallback) return safeFallback;
            const fromRef = String(aiRequestScopeRef.current || aiScopeKeyRef.current || '').trim();
            if (fromRef) return fromRef;
            return currentAiScopeKey;
        };

        const onHistory = (payload = {}) => {
            const requestSeq = Number(payload?.requestSeq || 0) || 0;
            const mappedScope = requestSeq ? aiHistoryScopeBySeqRef.current.get(requestSeq) : '';
            if (requestSeq) aiHistoryScopeBySeqRef.current.delete(requestSeq);

            const incomingScopeInfo = buildAiScopeInfo(
                tenantScopeRef.current || 'default',
                payload?.scopeChatId || payload?.chatId || payload?.baseChatId || '',
                payload?.scopeModuleId || ''
            );
            const scopeKey = resolveTargetScope(mappedScope || incomingScopeInfo.scopeKey);
            const entries = Array.isArray(payload?.items) ? payload.items : [];
            const normalized = entries
                .map((entry) => {
                    const role = String(entry?.role || '').trim().toLowerCase() === 'user' ? 'user' : 'assistant';
                    const content = repairMojibake(String(entry?.content || '').trim());
                    if (!content) return null;
                    return { role, content };
                })
                .filter(Boolean);

            setAiThreadsByScope((previous) => {
                const existing = Array.isArray(previous?.[scopeKey]) ? previous[scopeKey] : [];
                if (existing.some((entry) => entry?.streaming)) return previous;
                if (normalized.length === 0) {
                    if (existing.length > 0) return previous;
                    return {
                        ...previous,
                        [scopeKey]: buildDefaultAiThread()
                    };
                }
                return {
                    ...previous,
                    [scopeKey]: normalized
                };
            });
            setAiScopeLoading(scopeKey, false);
        };

        const onChunk = (chunk) => {
            const scopeKey = resolveTargetScope();
            buffer += repairMojibake(chunk);
            setAiThreadMessages(scopeKey, (previous) => {
                const safePrevious = Array.isArray(previous) ? previous : buildDefaultAiThread();
                const last = safePrevious[safePrevious.length - 1];
                if (last?.role === 'assistant' && last?.streaming) {
                    return [...safePrevious.slice(0, -1), { ...last, content: buffer }];
                }
                return [...safePrevious, { role: 'assistant', content: buffer, streaming: true }];
            });
        };

        const onComplete = () => {
            const scopeKey = resolveTargetScope();
            buffer = '';
            setAiScopeLoading(scopeKey, false);
            setAiThreadMessages(scopeKey, (previous) => {
                const safePrevious = Array.isArray(previous) ? previous : buildDefaultAiThread();
                const last = safePrevious[safePrevious.length - 1];
                if (last?.streaming) return [...safePrevious.slice(0, -1), { ...last, streaming: false }];
                return safePrevious;
            });
            aiRequestScopeRef.current = '';
        };

        const onError = (msg) => {
            const scopeKey = resolveTargetScope();
            setAiScopeLoading(scopeKey, false);
            setAiThreadMessages(scopeKey, (previous) => {
                const safePrevious = Array.isArray(previous) ? previous : buildDefaultAiThread();
                return [...safePrevious, { role: 'assistant', content: repairMojibake(msg || 'Error IA: no se pudo generar respuesta.') }];
            });
            aiRequestScopeRef.current = '';
        };

        const detachAiListeners = attachAiSocketListeners(socket, {
            onHistory,
            onChunk,
            onComplete,
            onError
        });
        return detachAiListeners;
    }, [socket, currentAiScopeKey]);
    const buildBusinessContext = () => buildBusinessContextPrompt({
        catalog,
        profile,
        messages,
        cart,
        formatMoney
    });

    const buildAiRuntimeContextPayload = () => buildAiRuntimeContext({
        activeModuleId,
        selectedCatalogModuleId,
        waModules,
        businessData,
        selectedCatalogId,
        activeChatPhone,
        activeChatDetails,
        activeTenantScopeId,
        profile,
        catalog,
        lineBreakdowns,
        parseMoney,
        subtotalProducts,
        totalDiscountForQuote,
        cartTotal,
        deliveryFee,
        deliveryType,
        globalDiscountEnabled,
        globalDiscountType,
        normalizedGlobalDiscountValue,
        messages,
        currentAiScopeChatId,
        activeChatId,
        activeAiScope
    });

    const sendAiMessage = () => {
        if (!aiInput.trim() || isAiLoading || !socket) return;
        const scopeKey = String(currentAiScopeKey || '').trim();
        if (!scopeKey) return;

        const cleanPrompt = aiInput.trim();
        const userMsg = { role: 'user', content: cleanPrompt };
        setAiThreadMessages(scopeKey, (previous) => {
            const safePrevious = Array.isArray(previous) ? previous : buildDefaultAiThread();
            return [...safePrevious, userMsg];
        });
        setAiInput('');
        setAiScopeLoading(scopeKey, true);
        aiRequestScopeRef.current = scopeKey;
        aiHistoryLoadedRef.current.add(scopeKey);

        const runtimeContext = buildAiRuntimeContextPayload();
        const moduleId = String(runtimeContext?.module?.moduleId || '').trim().toLowerCase();

        emitAiQuery(socket, {
            query: cleanPrompt,
            businessContext: buildBusinessContext(),
            moduleId: moduleId || undefined,
            runtimeContext
        });
    };

    const sendToClient = (text) => {
        // Extract content inside [MENSAJE: ...] if present, otherwise use full text
        const match = text.match(/\[MENSAJE:\s*([\s\S]+?)\]/);
        const msg = match ? match[1].trim() : text;
        setInputText(msg);
        setActiveTab('ai');
    };

    // Parse AI message to detect [MENSAJE: ...] blocks for send buttons
    const renderAiMessage = (content) => {
        const parts = repairMojibake(content).split(/(\[MENSAJE:[\s\S]*?\])/g);
        return parts.map((part, i) => {
            const match = part.match(/\[MENSAJE:\s*([\s\S]+?)\]/);
            if (match) {
                return (
                    <div key={i} style={{ marginTop: '8px', background: 'rgba(0,168,132,0.12)', border: '1px solid rgba(0,168,132,0.3)', borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '0.78rem', color: '#00a884', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MessageSquare size={11} /> MENSAJE LISTO PARA ENVIAR
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{match[1].trim()}</div>
                        <button
                            onClick={() => sendToClient(match[1].trim())}
                            style={{ marginTop: '8px', background: '#00a884', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Send size={13} /> Enviar al cliente
                        </button>
                                </div>
                );
            }
            return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
        });
    };

        // Cart functions
    const getLineBreakdown = (item = {}) => getCartLineBreakdown(item, {
        parseMoney,
        roundMoney,
        clampNumber
    });

    const {
        lineBreakdowns,
        regularSubtotalTotal,
        subtotalProducts,
        normalizedGlobalDiscountValue,
        subtotalAfterGlobal,
        totalDiscountForQuote,
        safeDeliveryAmount,
        deliveryFee,
        cartTotal
    } = useMemo(() => calculateCartPricing({
        cart,
        globalDiscountEnabled,
        globalDiscountType,
        globalDiscountValue,
        deliveryType,
        deliveryAmount,
        parseMoney,
        roundMoney,
        clampNumber
    }), [
        cart,
        globalDiscountEnabled,
        globalDiscountType,
        globalDiscountValue,
        deliveryType,
        deliveryAmount
    ]);

    const lastCartSnapshotSignatureRef = useRef('');
    const onCartSnapshotChangeRef = useRef(onCartSnapshotChange);

    const cartSnapshot = useMemo(() => buildCartSnapshotPayload({
        activeChatId,
        lineBreakdowns,
        parseMoney,
        subtotalProducts,
        totalDiscountForQuote,
        cartTotal,
        deliveryFee,
        deliveryType,
        globalDiscountEnabled,
        globalDiscountType,
        normalizedGlobalDiscountValue
    }), [
        activeChatId,
        lineBreakdowns,
        subtotalProducts,
        totalDiscountForQuote,
        cartTotal,
        deliveryFee,
        deliveryType,
        globalDiscountEnabled,
        globalDiscountType,
        normalizedGlobalDiscountValue
    ]);

    useEffect(() => {
        onCartSnapshotChangeRef.current = onCartSnapshotChange;
    }, [onCartSnapshotChange]);

    useEffect(() => {
        if (typeof onCartSnapshotChangeRef.current !== 'function') return;
        const signature = JSON.stringify(cartSnapshot);
        if (lastCartSnapshotSignatureRef.current === signature) return;
        lastCartSnapshotSignatureRef.current = signature;
        onCartSnapshotChangeRef.current(cartSnapshot);
    }, [cartSnapshot]);

    const sendQuoteToChat = () => {
        const msg = buildQuoteMessageFromCart({
            cart,
            getLineBreakdown,
            regularSubtotalTotal,
            totalDiscountForQuote,
            subtotalAfterGlobal,
            deliveryFee,
            cartTotal,
            formatMoneyCompact,
            formatQuoteProductTitle
        });
        if (!msg) return;
        setInputText(msg);
    };
    const addToCart = (item, qtyToAdd = 1) => {
        setCart((previous) => addItemToCartState(previous, item, qtyToAdd));
    };

    const removeFromCart = (id) => {
        setCart((previous) => removeItemFromCartState(previous, id));
    };

    const updateQty = (id, delta) => {
        setCart((previous) => updateCartItemQtyState(previous, id, delta));
    };

    const updateCatalogQty = (id, delta) => {
        setCart((previous) => updateCartItemQtyState(previous, id, delta));
    };

    const updateItemDiscountEnabled = (id, enabled) => {
        setCart((previous) => setCartItemDiscountEnabledState(previous, id, enabled, parseMoney));
    };

    const updateItemDiscountType = (id, type) => {
        setCart((previous) => setCartItemDiscountTypeState(previous, id, type));
    };

    const updateItemDiscountValue = (id, value) => {
        setCart((previous) => setCartItemDiscountValueState(previous, id, value, parseMoney));
    };
    const filteredQuickReplies = (Array.isArray(quickReplies) ? quickReplies : []).filter((item) => {
        const q = String(quickSearch || '').trim().toLowerCase();
        if (!q) return true;
        const haystack = `${item?.label || ''} ${item?.text || ''}`.toLowerCase();
        return haystack.includes(q);
    });
    const tabs = [
        { id: 'ai', icon: <Bot size={15} />, label: 'IA Pro' },
        { id: 'catalog', icon: <Package size={15} />, label: `Catalogo${catalog.length > 0 ? ` (${catalog.length})` : ''}` },
        ...(cart.length > 0 ? [{ id: 'cart', icon: <ShoppingCart size={15} />, label: `Carrito (${cart.length})` }] : []),
        ...(quickRepliesEnabled ? [{ id: 'quick', icon: <Clock size={15} />, label: 'Rapidas' }] : []),
    ];


    return (
        <div className="business-sidebar business-sidebar-pro">
            {/* Tabs */}
            <div className="business-tabs">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => { setActiveTab(t.id); setShowCompanyProfile(false); }} className={`business-tab-btn ${activeTab === t.id ? 'active' : ''}`} style={{
                        flex: 1, padding: '9px 2px', border: 'none', cursor: 'pointer',
                        background: activeTab === t.id ? '#111b21' : 'transparent',
                        color: activeTab === t.id ? '#00a884' : '#8696a0',
                        fontSize: '0.68rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                        borderBottom: activeTab === t.id ? '2px solid #00a884' : '2px solid transparent',
                    }}>
                        <span className="business-tab-icon">{t.icon}</span>
                        <span className="business-tab-label">{t.label}</span>
                    </button>
                ))}
            </div>

            {!quickRepliesEnabled && activeTab === 'ai' && (
                <div style={{ padding: '2px 10px 0', fontSize: '0.66rem', color: '#6f8796', textAlign: 'right' }}>
                    Respuestas rapidas deshabilitadas para esta empresa o plan.
                </div>
            )}




            {showCompanyProfile && (
                <CompanyProfilePanel
                    profile={profile}
                    labels={labels}
                    onClose={() => setShowCompanyProfile(false)}
                    onLogout={onLogout}
                    panelRef={companyProfileRef}
                />
            )}

            {/* AI PRO TAB */}
            {activeTab === 'ai' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="ai-thread-pro" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {aiMessages.map((msg, idx) => (
                            <div key={idx} className={`ai-row-pro ${msg.role === 'user' ? 'user' : 'assistant'}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div className={`ai-bubble-pro ${msg.role === 'user' ? 'user' : 'assistant'}`} style={{
                                    maxWidth: '92%', padding: '9px 12px', borderRadius: msg.role === 'user' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                                    background: msg.role === 'user' ? '#005c4b' : '#202c33',
                                    fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: '1.45',
                                    position: 'relative'
                                }}>
                                    {msg.role === 'assistant' ? renderAiMessage(msg.content) : msg.content}
                                    {msg.streaming && (
                                        <span style={{ display: 'inline-block', width: '6px', height: '12px', background: 'var(--text-primary)', marginLeft: '3px', animation: 'blink 0.8s step-end infinite' }} />
                                    )}
                                    {msg.role === 'assistant' && !msg.streaming && msg.content.length > 30 && !msg.content.includes('[MENSAJE:') && (
                                        <button
                                            onClick={() => sendToClient(msg.content)}
                                            title="Enviar este mensaje al cliente"
                                            className="ai-use-reply-btn"
                                        >
                                            <Send size={10} /> Usar como respuesta
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isAiLoading && aiMessages[aiMessages.length - 1]?.role !== 'assistant' && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{ background: '#202c33', borderRadius: '2px 12px 12px 12px', padding: '10px 14px' }}>
                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out infinite' }} />
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out 0.2s infinite' }} />
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out 0.4s infinite' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={aiEndRef} />
                    </div>

                    {/* Quick action chips */}
                    <div className="ai-quick-prompts ai-quick-prompts-pro" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '6px', flexShrink: 0 }}>
                        <div className="ai-quick-prompts-title">
                            <Sparkles size={12} />
                            Atajos IA
                        </div>
                        {[
                            'Dame 3 respuestas sugeridas para este cliente',
                            'Genera 3 cotizaciones con enfoque: entrada, equilibrio y premium',
                            'Recomienda upsell y cross sell segun este contexto',
                            'Maneja objecion de precio enfocando valor y rendimiento',
                            'Propone un cierre elegante para concretar hoy',
                        ].map((chip, i) => (
                            <button key={i} className="ai-prompt-chip ai-prompt-chip-pro"
                                onClick={() => { setAiInput(chip); }}
                                style={{ background: '#202c33', border: '1px solid var(--border-color)', color: '#8696a0', padding: '4px 9px', borderRadius: '14px', fontSize: '0.72rem', cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#00a884'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                            >
                                {chip}
                            </button>
                        ))}
                    </div>

                    {/* AI Input */}
                    <div className="ai-assistant-input-row ai-input-row-pro" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, background: '#202c33' }}>
                        <input
                            type="text"
                            placeholder="Pregunta algo a la IA..."
                            value={aiInput}
                            onChange={e => setAiInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAiMessage()}
                            className="ai-assistant-input ai-assistant-input-pro" style={{ flex: 1, background: '#2a3942', border: 'none', outline: 'none', color: 'var(--text-primary)', borderRadius: '20px', padding: '8px 14px', fontSize: '0.82rem' }}
                        />
                        <button
                            onClick={sendAiMessage}
                            disabled={isAiLoading || !aiInput.trim()}
                            className="ai-assistant-send ai-assistant-send-pro" style={{ background: isAiLoading ? '#3b4a54' : '#00a884', border: 'none', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isAiLoading ? 'wait' : 'pointer', flexShrink: 0 }}
                        >
                            <Send size={16} color="white" />
                        </button>
                                </div>
                </div>
            )}

            {/* CATALOG TAB */}
            {activeTab === 'catalog' && (
                <BusinessCatalogTab catalog={catalog} socket={socket} addToCart={addToCart} onCatalogQtyDelta={updateCatalogQty} catalogMeta={businessData.catalogMeta} activeChatId={activeChatId} activeChatPhone={activeChatPhone} cartItems={cart} waModules={waModules} selectedCatalogModuleId={selectedCatalogModuleId} selectedCatalogId={selectedCatalogId} onSelectCatalogModule={onSelectCatalogModule} onSelectCatalog={onSelectCatalog} onUploadCatalogImage={onUploadCatalogImage} />
            )}

                        {/* CART TAB */}
            {activeTab === 'cart' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {orderImportStatus?.text && (
                            <div style={{ background: orderImportStatus.level === 'warn' ? '#2d251a' : '#17362f', border: orderImportStatus.level === 'warn' ? '1px solid #7a5a27' : '1px solid rgba(0,168,132,0.42)', color: orderImportStatus.level === 'warn' ? '#ffd58f' : '#bdf7e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.74rem', lineHeight: 1.4 }}>
                                {orderImportStatus.text}
                            </div>
                        )}

                        {cart.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 15px', color: '#8696a0' }}>
                                <ShoppingCart size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto' }} />
                                <div style={{ fontSize: '0.875rem' }}>Carrito vacio</div>
                                <div style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: '6px' }}>Agrega productos desde el Catalogo</div>
                            </div>
                        ) : (
                            cart.map((item, i) => {
                                const line = getLineBreakdown(item);
                                const lineDiscountMode = line.lineDiscountEnabled ? (line.lineDiscountType === 'amount' ? 'amount' : 'percent') : 'none';
                                return (
                                    <div key={item.id || i} style={{ background: '#1f2e37', borderRadius: '9px', border: '1px solid rgba(134,150,160,0.26)', padding: '7px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                                                {(line.regularSubtotal > line.lineFinal || line.includedDiscount > 0 || line.additionalDiscountApplied > 0) && (
                                                    <div style={{ marginTop: '2px', fontSize: '0.68rem', color: '#97adba', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                        {line.regularSubtotal > line.lineFinal && <span>Regular: S/ {formatMoney(line.regularSubtotal)}</span>}
                                                        {line.includedDiscount > 0 && <span style={{ color: '#63d1b7' }}>Kit: -S/ {formatMoney(line.includedDiscount)}</span>}
                                                        {line.additionalDiscountApplied > 0 && <span style={{ color: '#63d1b7' }}>Linea: -S/ {formatMoney(line.additionalDiscountApplied)}</span>}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right', minWidth: '98px' }}>
                                                <div style={{ fontSize: '0.66rem', color: '#91a8b5', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Precio final</div>
                                                <div style={{ fontSize: '0.96rem', color: '#00d7ad', fontWeight: 800, lineHeight: 1.1 }}>S/ {formatMoney(line.lineFinal)}</div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: '6px', background: '#17242c', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '5px 6px' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <button onClick={() => (line.qty <= 1 ? removeFromCart(item.id) : updateQty(item.id, -1))} style={{ width: '21px', height: '21px', borderRadius: '50%', background: '#3b4a54', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={9} /></button>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700, minWidth: '18px', textAlign: 'center' }}>{line.qty}</span>
                                                <button onClick={() => updateQty(item.id, 1)} style={{ width: '21px', height: '21px', borderRadius: '50%', background: '#3b4a54', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={9} /></button>
                                                <button onClick={() => removeFromCart(item.id)} title="Eliminar" style={{ width: '21px', height: '21px', borderRadius: '50%', background: '#2a3942', border: '1px solid rgba(218,54,51,0.4)', cursor: 'pointer', color: '#da3633', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Trash2 size={11} />
                                                </button>
                                </div>

                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px', minWidth: 0 }}>
                                                <select
                                                    value={lineDiscountMode}
                                                    onChange={(e) => {
                                                        const mode = e.target.value;
                                                        if (mode === 'none') {
                                                            updateItemDiscountEnabled(item.id, false);
                                                            updateItemDiscountValue(item.id, 0);
                                                            return;
                                                        }
                                                        updateItemDiscountEnabled(item.id, true);
                                                        updateItemDiscountType(item.id, mode);
                                                    }}
                                                    style={{ background: '#2a3942', border: '1px solid var(--border-color)', color: '#d9e8f0', borderRadius: '6px', padding: '4px 6px', fontSize: '0.74rem', outline: 'none', minWidth: '98px' }}
                                                >
                                                    <option value="none">Sin desc.</option>
                                                    <option value="percent">Desc. %</option>
                                                    <option value="amount">Desc. S/</option>
                                                </select>
                                                {lineDiscountMode !== 'none' && (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={lineDiscountMode === 'percent' ? 100 : undefined}
                                                        step={lineDiscountMode === 'percent' ? '1' : '0.01'}
                                                        value={line.lineDiscountValue}
                                                        onChange={e => updateItemDiscountValue(item.id, e.target.value)}
                                                        placeholder="0"
                                                        style={{ width: '70px', background: '#2a3942', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 6px', fontSize: '0.74rem', outline: 'none' }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {cart.length > 0 && (
                        <div style={{ padding: '10px 9px', borderTop: '1px solid var(--border-color)', background: '#1a2b35', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => setShowOrderAdjustments(prev => !prev)}
                                style={{ width: '100%', background: 'linear-gradient(90deg, rgba(0,168,132,0.22), rgba(11,56,69,0.7))', border: '1px solid rgba(0,168,132,0.6)', color: '#e6fff8', borderRadius: '9px', padding: '9px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'inset 0 0 0 1px rgba(0,168,132,0.16)' }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Sparkles size={13} /> Ajustes de pago y envio</span>
                                {showOrderAdjustments ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>

                            {showOrderAdjustments && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ background: '#17242c', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#d5e3ec', fontSize: '0.78rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={globalDiscountEnabled} onChange={e => setGlobalDiscountEnabled(e.target.checked)} />
                                            Aplicar descuento global
                                        </label>

                                        {globalDiscountEnabled && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <select
                                                    value={globalDiscountType}
                                                    onChange={e => setGlobalDiscountType(e.target.value === 'amount' ? 'amount' : 'percent')}
                                                    style={{ background: '#2a3942', border: '1px solid var(--border-color)', color: '#d9e8f0', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none' }}
                                                >
                                                    <option value="percent">Porcentaje (%)</option>
                                                    <option value="amount">Monto (S/)</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={globalDiscountType === 'percent' ? 100 : undefined}
                                                    step={globalDiscountType === 'percent' ? '1' : '0.01'}
                                                    value={normalizedGlobalDiscountValue}
                                                    onChange={e => setGlobalDiscountValue(Math.max(0, parseMoney(e.target.value, 0)))}
                                                    style={{ background: '#2a3942', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none' }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ background: '#17242c', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#95abba' }}>Delivery / envio</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <select
                                                value={deliveryType}
                                                onChange={e => setDeliveryType(e.target.value === 'amount' ? 'amount' : 'free')}
                                                style={{ background: '#2a3942', border: '1px solid var(--border-color)', color: '#d9e8f0', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none' }}
                                            >
                                                <option value="free">Gratuito</option>
                                                <option value="amount">Con monto</option>
                                            </select>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={deliveryType === 'amount' ? safeDeliveryAmount : 0}
                                                onChange={e => setDeliveryAmount(Math.max(0, parseMoney(e.target.value, 0)))}
                                                disabled={deliveryType !== 'amount'}
                                                style={{ background: deliveryType === 'amount' ? '#2a3942' : '#26343d', border: '1px solid var(--border-color)', color: deliveryType === 'amount' ? 'var(--text-primary)' : '#6f8796', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ background: '#17242c', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCartTotalsBreakdown((prev) => !prev)}
                                    style={{ width: '100%', background: 'transparent', border: '1px dashed rgba(134,150,160,0.4)', color: '#d8e6ef', borderRadius: '7px', padding: '6px 8px', cursor: 'pointer', fontSize: '0.74rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                >
                                    <span>Resumen de total</span>
                                    {showCartTotalsBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {showCartTotalsBreakdown && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#d8e6ef', fontWeight: 700 }}>
                                            <span>Subtotal</span>
                                            <span>S/ {formatMoney(regularSubtotalTotal)}</span>
                                        </div>
                                        {totalDiscountForQuote > 0 && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#95abba' }}>
                                                    <span>Descuento</span>
                                                    <span>- S/ {formatMoney(totalDiscountForQuote)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#95abba' }}>
                                                    <span>Total con descuento</span>
                                                    <span>S/ {formatMoney(subtotalAfterGlobal)}</span>
                                                </div>
                                            </>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#95abba' }}>
                                            <span>Delivery</span>
                                            <span>{deliveryFee > 0 ? `S/ ${formatMoney(deliveryFee)}` : 'Gratuito'}</span>
                                        </div>
                                    </>
                                )}

                                <div style={{ marginTop: '2px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, color: '#00d7ad' }}>
                                    <span>TOTAL A PAGAR</span>
                                    <span>S/ {formatMoney(cartTotal)}</span>
                                </div>
                            </div>

                            <button
                                onClick={sendQuoteToChat}
                                style={{ width: '100%', padding: '9px', background: '#00a884', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <Send size={15} /> Enviar cotizacion al cliente
                            </button>
                                </div>
                    )}
                </div>
            )}

            {/* QUICK REPLIES TAB */}


            {activeTab === 'quick' && quickRepliesEnabled && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ background: '#1f2c34', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px' }}>
                        <input
                            type="text"
                            value={quickSearch}
                            onChange={e => setQuickSearch(e.target.value)}
                            placeholder="Buscar respuesta rapida"
                            style={{ width: '100%', background: '#111b21', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none' }}
                        />
                    </div>


                    {
                    <div style={{ background: '#202c33', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '10px', color: '#8696a0', fontSize: '0.78rem' }}>
                        Gestion centralizada: crea y edita respuestas rapidas solo desde Panel SaaS. En chat puedes buscarlas y usarlas.
                    </div>
                    }

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {filteredQuickReplies.length === 0 ? (
                            <div style={{ background: '#1f2c34', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', color: '#8696a0', fontSize: '0.78rem' }}>
                                No hay respuestas rapidas para mostrar.
                            </div>
                        ) : (
                            filteredQuickReplies.map((qr) => (
                                <div key={qr.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        className="ai-prompt-chip"
                                        onClick={() => { if (typeof onSendQuickReply === 'function') { onSendQuickReply(qr); } else { setInputText(qr.text || ''); } }}
                                        style={{
                                            width: '100%', padding: '10px 12px', borderRadius: '8px',
                                            background: '#202c33', border: '1px solid var(--border-color)',
                                            cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', transition: 'all 0.12s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = '#00a884'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    >
                                        <div style={{ fontSize: '0.84rem', fontWeight: 500, marginBottom: '3px' }}>{qr.label}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(qr.text || '').split('\n')[0]}</div>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            

        </div>
    );
};

export default BusinessSidebar;

































