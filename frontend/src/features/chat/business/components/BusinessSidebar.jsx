import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Bot, ShoppingCart, Clock, Package, MapPin, FileText, ClipboardList } from 'lucide-react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import { API_URL } from '../../../../config/runtime';
import {
    addItemToCartState,
    buildAiRuntimeContext,
    buildBusinessContextPrompt,
    buildCartSnapshotPayload,
    buildDefaultAiThread,
    buildStructuredQuotePayloadFromCart,
    buildQuoteMessageFromCart,
    calculateCartPricing,
    clampNumber,
    formatMoney,
    formatMoneyCompact,
    formatQuoteProductTitle,
    getCartLineBreakdown,
    normalizeDiscountType,
    normalizeCatalogItem,
    parseAiScopedChatId,
    parseMoney,
    repairMojibake,
    renderAiMessageWithSendAction,
    removeItemFromCartState,
    roundMoney,
    setCartItemQtyState,
    setCartItemDiscountEnabledState,
    setCartItemExcludeFromGlobalState,
    setCartItemDiscountTypeState,
    setCartItemDiscountValueState,
    updateCartItemQtyState
} from '../helpers';
import {
    useAiScopeState,
    useAiSocketBridge,
    useBusinessSidebarUiSync,
    useCompanyProfileOverlay,
    usePendingOrderCartImport,
    useTenantScopeReset
} from '../hooks';
import { emitAiQuery } from '../services';
import {
    BusinessAiTabSection,
    BusinessCartTabSection,
    BusinessCatalogTab,
    BusinessCoverageTabSection,
    BusinessOrderModal,
    BusinessOrdersTabSection,
    BusinessQuotesTabSection,
    BusinessQuickRepliesTabSection,
    ClientProfilePanel,
    CompanyProfilePanel
} from '../sections';

export { ClientProfilePanel };
// =========================================================
// BUSINESS SIDEBAR - Main right panel


// =========================================================

const toOrderNumber = (value = 0, fallback = 0) => {
    const cleaned = String(value ?? '')
        .replace(/[^0-9,.-]/g, '')
        .replace(',', '.');
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};

const normalizeOrderLine = (item = {}, fallbackName = 'Producto') => {
    const quantity = Math.max(1, toOrderNumber(item.quantity ?? item.qty ?? item.cantidad ?? 1, 1));
    const explicitUnitPrice = item.unitPrice ?? item.unit_price ?? item.price ?? item.precio ?? item.finalUnitPrice;
    const rawLineTotal = item.subtotal ?? item.lineTotal ?? item.line_total ?? item.total;
    const unitPrice = toOrderNumber(
        explicitUnitPrice,
        quantity > 0 ? toOrderNumber(rawLineTotal, 0) / quantity : 0
    );
    const productName = String(
        item.productName
        || item.product_name
        || item.name
        || item.title
        || item.description
        || item.sku
        || fallbackName
    ).trim() || fallbackName;
    return {
        productId: String(item.productId || item.product_id || item.id || item.sku || '').trim() || null,
        productName,
        quantity,
        unitPrice: Math.max(0, roundMoney(unitPrice))
    };
};

const normalizeQuoteItemsForOrder = (quote = {}) => {
    const summary = quote?.summaryJson && typeof quote.summaryJson === 'object' ? quote.summaryJson : {};
    const rawItems = Array.isArray(quote?.itemsJson) ? quote.itemsJson : [];
    const items = rawItems
        .map((item, index) => normalizeOrderLine(item, `Producto ${index + 1}`))
        .filter((item) => item.productName && item.unitPrice > 0);
    if (items.length > 0) return items;
    const total = toOrderNumber(summary?.totalPayable ?? summary?.total ?? quote?.totalAmount ?? 0);
    if (total <= 0) return [];
    const quoteNumber = Number(quote?.quoteNumber || quote?.quote_number || 0) || '';
    return [{
        productId: null,
        productName: `Cotizacion ${quoteNumber}`.trim() || 'Cotizacion',
        quantity: 1,
        unitPrice: roundMoney(total)
    }];
};

const getTodayOrderDate = () => {
    try {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    } catch (_) {
        return new Date().toISOString().slice(0, 10);
    }
};

const buildQuoteOrderDraft = (quote = {}) => {
    const summary = quote?.summaryJson && typeof quote.summaryJson === 'object' ? quote.summaryJson : {};
    const quoteNumber = Number(quote?.quoteNumber || quote?.quote_number || 0) || null;
    return {
        sourceType: 'quote',
        sourceId: String(quote?.quoteId || quote?.quote_id || '').trim() || null,
        title: quoteNumber ? `Cotizacion ${quoteNumber}` : 'Cotizacion',
        items: normalizeQuoteItemsForOrder(quote),
        deliveryAmount: toOrderNumber(summary?.delivery ?? summary?.deliveryAmount ?? 0),
        discountAmount: toOrderNumber(summary?.discount ?? summary?.totalDiscount ?? 0),
        orderDate: getTodayOrderDate(),
        notes: quote?.notes || ''
    };
};

const buildCatalogOrderDraft = (payload = {}) => ({
    sourceType: 'catalog',
    sourceId: String(payload?.messageId || payload?.sourceId || '').trim() || null,
    title: String(payload?.productName || 'Producto del catalogo').trim(),
    items: [{
        productId: String(payload?.productId || '').trim() || null,
        productName: String(payload?.productName || 'Producto del catalogo').trim(),
        quantity: 1,
        unitPrice: Math.max(0, roundMoney(toOrderNumber(payload?.unitPrice ?? payload?.price ?? 0)))
    }],
    deliveryAmount: 0,
    discountAmount: 0,
    orderDate: getTodayOrderDate(),
    notes: 'Cliente acepto producto enviado desde catalogo.'
});

const buildManualOrderDraft = () => ({
    sourceType: 'manual',
    sourceId: null,
    title: 'Pedido manual',
    description: '',
    amount: '',
    items: [],
    deliveryAmount: 0,
    discountAmount: 0,
    orderDate: getTodayOrderDate(),
    notes: ''
});

const normalizeOrderForState = (order = null) => {
    if (!order || typeof order !== 'object') return null;
    const orderId = String(order?.orderId || order?.order_id || '').trim();
    if (!orderId) return null;
    return {
        ...order,
        orderId,
        items: Array.isArray(order?.items) ? order.items : (Array.isArray(order?.itemsJson) ? order.itemsJson : []),
        totalAmount: toOrderNumber(order?.totalAmount ?? order?.total_amount ?? 0),
        createdAt: order?.createdAt || order?.created_at || null,
        updatedAt: order?.updatedAt || order?.updated_at || null
    };
};

const BusinessSidebar = ({ tenantScopeKey = 'default', setInputText, businessData = {}, messages = [], messagesRef = null, activeChatId, activeChatPhone = '', activeChatDetails = null, onSendToClient, socket, myProfile, onLogout, quickReplies = [], onSendQuickReply = null, onSendCatalogProduct = null, waCapabilities = {}, pendingOrderCartLoad = null, pendingCatalogOrderRequest = null, requestedToolTab = null, openCompanyProfileToken = 0, waModules = [], selectedCatalogModuleId = '', selectedCatalogId = '', activeModuleId = '', onSelectCatalogModule = null, onSelectCatalog = null, onUploadCatalogImage = null, onCartSnapshotChange = null, cartDraftsByChat: externalCartDraftsByChat = {}, setCartDraftsByChat: externalSetCartDraftsByChat = null, chatAssignmentState = null, chatCommercialStatusState = null, buildApiHeaders = null, onMobileBackToChat = null, onMobileOpenTools = null }) => {
    const { notify, confirm } = useUiFeedback();
    const [activeTab, setActiveTab] = useState('ai');
    const [cartOpenReason, setCartOpenReason] = useState(null);
    const [showCompanyProfile, setShowCompanyProfile] = useState(false);
    const [pattySuggestion, setPattySuggestion] = useState(null);
    const companyProfileRef = useRef(null);
    const liveMessagesRef = useRef([]);
    const openToolsPanel = useCallback((tabId, options = {}) => {
        const reason = String(options?.cartOpenReason || '').trim();
        if (tabId === 'cart') {
            setCartOpenReason(reason || 'manual');
        } else if (tabId && tabId !== 'cart') {
            setCartOpenReason(null);
        }
        if (tabId) setActiveTab(tabId);
        setShowCompanyProfile(false);
        onMobileOpenTools?.();
    }, [onMobileOpenTools]);
    const returnToChatPanel = useCallback(() => {
        onMobileBackToChat?.();
    }, [onMobileBackToChat]);

    // AI Chat State
    const [aiInput, setAiInput] = useState('');
    const aiEndRef = useRef(null);

    const normalizedTenantScopeKey = useMemo(() => String(tenantScopeKey || 'default').trim() || 'default', [tenantScopeKey]);
    useEffect(() => {
        liveMessagesRef.current = Array.isArray(messages) ? messages : [];
    }, [messages]);
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
    const cartDraftsByChat = (externalCartDraftsByChat && typeof externalCartDraftsByChat === 'object')
        ? externalCartDraftsByChat
        : {};
    const setCartDraftsByChat = (typeof externalSetCartDraftsByChat === 'function')
        ? externalSetCartDraftsByChat
        : (() => {});
    const activeDraft = cartDraftsByChat[activeChatId] || {};
    const cart = activeDraft.cart || [];
    const showOrderAdjustments = activeDraft.showOrderAdjustments || false;
    const globalDiscountEnabled = activeDraft.globalDiscountEnabled || false;
    const globalDiscountType = activeDraft.globalDiscountType || 'percent';
    const globalDiscountValue = activeDraft.globalDiscountValue || 0;
    const globalOnRegular = activeDraft.globalOnRegular || false;
    const deliveryType = activeDraft.deliveryType || 'free';
    const deliveryAmount = activeDraft.deliveryAmount || 0;
    const showCartTotalsBreakdown = activeDraft.showCartTotalsBreakdown || false;
    const cartWizardStep = Math.max(1, Math.min(4, Number(activeDraft.cartWizardStep || 1) || 1));
    const sourceOrder = activeDraft.sourceOrder && typeof activeDraft.sourceOrder === 'object'
        ? activeDraft.sourceOrder
        : null;
    const sourceQuote = activeDraft.sourceQuote && typeof activeDraft.sourceQuote === 'object'
        ? activeDraft.sourceQuote
        : null;
    const [chatQuotesByChat, setChatQuotesByChat] = useState({});
    const [ordersByChat, setOrdersByChat] = useState({});
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersError, setOrdersError] = useState('');
    const [orderDraft, setOrderDraft] = useState(null);
    const [orderSaving, setOrderSaving] = useState(false);
    const [quoteHistoryExpanded, setQuoteHistoryExpanded] = useState(true);
    const buildInitialQuoteOptionsWizardState = useCallback(() => ({
        modoOpciones: false,
        totalOpciones: 3,
        phase: 'config',
        currentOption: 1,
        pasoActual: 1,
        opciones: [],
        mensajeFinal: ''
    }), []);
    const [quoteOptionsWizard, setQuoteOptionsWizard] = useState(() => buildInitialQuoteOptionsWizardState());
    const quoteHistory = useMemo(() => {
        const items = Array.isArray(chatQuotesByChat?.[activeChatId]) ? chatQuotesByChat[activeChatId] : [];
        return items.slice().sort((a, b) => {
            const aTime = new Date(a?.sentAt || a?.sent_at || a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at || 0).getTime() || 0;
            const bTime = new Date(b?.sentAt || b?.sent_at || b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at || 0).getTime() || 0;
            if (aTime !== bTime) return bTime - aTime;
            const aNumber = Number(a?.quoteNumber || a?.quote_number || 0) || 0;
            const bNumber = Number(b?.quoteNumber || b?.quote_number || 0) || 0;
            if (aNumber !== bNumber) return bNumber - aNumber;
            return (Number(b?.revisionNumber || b?.revision_number || 0) || 0) - (Number(a?.revisionNumber || a?.revision_number || 0) || 0);
        });
    }, [activeChatId, chatQuotesByChat]);
    const activeOrders = useMemo(() => {
        const items = Array.isArray(ordersByChat?.[activeChatId]) ? ordersByChat[activeChatId] : [];
        return items.slice().sort((a, b) => {
            const aTime = new Date(a?.createdAt || a?.created_at || 0).getTime() || 0;
            const bTime = new Date(b?.createdAt || b?.created_at || 0).getTime() || 0;
            return bTime - aTime;
        });
    }, [activeChatId, ordersByChat]);
    const quoteOptionsModeActive = Boolean(quoteOptionsWizard?.modoOpciones);
    const [quickSearch, setQuickSearch] = useState('');
    const [orderImportStatus, setOrderImportStatus] = useState(null);
    const lastImportedOrderRef = useRef('');
    const lastCatalogOrderRequestRef = useRef('');
    const tenantScopeRef = useRef(String(tenantScopeKey || 'default').trim() || 'default');
    const canWriteByAssignment = typeof chatAssignmentState?.isAssignedToMe === 'function'
        ? chatAssignmentState.isAssignedToMe(activeChatId)
        : false;
    const activeChatAssignment = typeof chatAssignmentState?.getAssignment === 'function'
        ? chatAssignmentState.getAssignment(activeChatId)
        : null;
    const activeChatCommercialStatus = typeof chatCommercialStatusState?.getCommercialStatus === 'function'
        ? chatCommercialStatusState.getCommercialStatus(activeChatId)
        : null;
    const conversationWindowOpen = activeChatDetails?.windowOpen !== false;
    const canUseMessageTools = canWriteByAssignment && conversationWindowOpen;
    const ASSIGNMENT_LOCK_MESSAGE = 'Toma este chat para responder';
    const WINDOW_LOCK_MESSAGE = 'La ventana de 24 horas expiró. Usa el botón de template del chat.';
    const notifyAssignmentLock = useCallback(() => {
        notify({
            type: 'warn',
            message: ASSIGNMENT_LOCK_MESSAGE
        });
    }, [notify]);
    const notifyWindowLock = useCallback(() => {
        notify({
            type: 'warn',
            message: WINDOW_LOCK_MESSAGE
        });
    }, [notify]);

    const updateDraft = useCallback((patch) => {
        if (!activeChatId || typeof setCartDraftsByChat !== 'function') return;
        setCartDraftsByChat((prev) => {
            const safePrev = prev && typeof prev === 'object' ? prev : {};
            const previousDraft = safePrev[activeChatId] && typeof safePrev[activeChatId] === 'object'
                ? safePrev[activeChatId]
                : {};
            const nextPatch = typeof patch === 'function' ? patch(previousDraft) : patch;
            return {
                ...safePrev,
                [activeChatId]: {
                    ...previousDraft,
                    ...(nextPatch && typeof nextPatch === 'object' ? nextPatch : {})
                }
            };
        });
    }, [activeChatId, setCartDraftsByChat]);

    const setCart = useCallback((nextCart) => {
        updateDraft((previousDraft) => {
            const previousCart = Array.isArray(previousDraft?.cart) ? previousDraft.cart : [];
            const resolved = typeof nextCart === 'function' ? nextCart(previousCart) : nextCart;
            return { cart: Array.isArray(resolved) ? resolved : [] };
        });
    }, [updateDraft]);

    const setShowOrderAdjustments = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = Boolean(previousDraft?.showOrderAdjustments || false);
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            return { showOrderAdjustments: Boolean(resolved) };
        });
    }, [updateDraft]);

    const setGlobalDiscountEnabled = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = Boolean(previousDraft?.globalDiscountEnabled || false);
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            return { globalDiscountEnabled: Boolean(resolved) };
        });
    }, [updateDraft]);

    const setGlobalDiscountType = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = normalizeDiscountType(previousDraft?.globalDiscountType || 'percent');
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            return { globalDiscountType: normalizeDiscountType(resolved || 'percent') };
        });
    }, [updateDraft]);

    const setGlobalDiscountValue = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = Number(previousDraft?.globalDiscountValue || 0) || 0;
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            const normalized = Number(resolved);
            return { globalDiscountValue: Number.isFinite(normalized) ? normalized : 0 };
        });
    }, [updateDraft]);

    const setGlobalOnRegular = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = Boolean(previousDraft?.globalOnRegular || false);
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            return { globalOnRegular: Boolean(resolved) };
        });
    }, [updateDraft]);

    const setDeliveryType = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = String(previousDraft?.deliveryType || 'none');
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            return { deliveryType: String(resolved || 'none') };
        });
    }, [updateDraft]);

    const setDeliveryAmount = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = Number(previousDraft?.deliveryAmount || 0) || 0;
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            const normalized = Number(resolved);
            return { deliveryAmount: Number.isFinite(normalized) ? normalized : 0 };
        });
    }, [updateDraft]);

    const setShowCartTotalsBreakdown = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = Boolean(previousDraft?.showCartTotalsBreakdown || false);
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            return { showCartTotalsBreakdown: Boolean(resolved) };
        });
    }, [updateDraft]);

    const setCartWizardStep = useCallback((nextValue) => {
        updateDraft((previousDraft) => {
            const previous = Math.max(1, Math.min(4, Number(previousDraft?.cartWizardStep || 1) || 1));
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            return { cartWizardStep: Math.max(1, Math.min(4, Number(resolved || 1) || 1)) };
        });
    }, [updateDraft]);

    const updateQuoteOptionsWizard = useCallback((patch) => {
        setQuoteOptionsWizard((previous) => {
            const resolvedPatch = typeof patch === 'function' ? patch(previous) : patch;
            return {
                ...previous,
                ...(resolvedPatch && typeof resolvedPatch === 'object' ? resolvedPatch : {})
            };
        });
    }, []);

    const resetQuoteOptionsWizard = useCallback(() => {
        setQuoteOptionsWizard(buildInitialQuoteOptionsWizardState());
    }, [buildInitialQuoteOptionsWizardState]);

    useEffect(() => {
        resetQuoteOptionsWizard();
    }, [activeChatId, normalizedTenantScopeKey, resetQuoteOptionsWizard]);

    useEffect(() => {
        if (quoteOptionsModeActive && activeTab === 'cart') {
            setActiveTab('catalog');
        }
    }, [activeTab, quoteOptionsModeActive]);

    const normalizeQuoteHistoryItem = useCallback((quote = {}) => {
        if (!quote || typeof quote !== 'object') return null;
        const quoteId = String(quote?.quoteId || quote?.quote_id || '').trim();
        if (!quoteId) return null;
        const summary = quote?.summaryJson && typeof quote.summaryJson === 'object'
            ? quote.summaryJson
            : (quote?.summary && typeof quote.summary === 'object' ? quote.summary : {});
        const itemsJson = Array.isArray(quote?.itemsJson)
            ? quote.itemsJson
            : (Array.isArray(quote?.items) ? quote.items : []);
        return {
            quoteId,
            quoteNumber: Number(quote?.quoteNumber ?? quote?.quote_number ?? 0) || null,
            revisionNumber: Number(quote?.revisionNumber ?? quote?.revision_number ?? 1) || 1,
            parentQuoteId: String(quote?.parentQuoteId || quote?.parent_quote_id || '').trim() || null,
            isOptionMode: Boolean(quote?.isOptionMode ?? quote?.is_option_mode ?? false),
            optionNumber: Number(quote?.optionNumber ?? quote?.option_number ?? 0) || null,
            optionGroupId: String(quote?.optionGroupId || quote?.option_group_id || '').trim() || null,
            messageId: String(quote?.messageId || quote?.message_id || '').trim() || null,
            status: String(quote?.status || 'sent').trim() || 'sent',
            currency: String(quote?.currency || summary?.currency || 'PEN').trim() || 'PEN',
            itemsJson,
            summaryJson: summary,
            notes: String(quote?.notes || '').trim() || null,
            sentAt: quote?.sentAt || quote?.sent_at || null,
            createdAt: quote?.createdAt || quote?.created_at || null,
            updatedAt: quote?.updatedAt || quote?.updated_at || null
        };
    }, []);

    const upsertQuoteHistory = useCallback((chatId, quote) => {
        const safeChatId = String(chatId || '').trim();
        const normalized = normalizeQuoteHistoryItem(quote);
        if (!safeChatId || !normalized) return;
        setChatQuotesByChat((prev) => {
            const safePrev = prev && typeof prev === 'object' ? prev : {};
            const current = Array.isArray(safePrev[safeChatId]) ? safePrev[safeChatId] : [];
            const next = current.filter((item) => String(item?.quoteId || '') !== normalized.quoteId);
            next.push(normalized);
            return {
                ...safePrev,
                [safeChatId]: next
            };
        });
    }, [normalizeQuoteHistoryItem]);

    const catalog = useMemo(
        () => (businessData.catalog || []).map((item, idx) => normalizeCatalogItem(item, idx)),
        [businessData.catalog]
    );
    const activeBusinessModule = useMemo(() => {
        const target = String(activeModuleId || selectedCatalogModuleId || '').trim().toLowerCase();
        if (!target) return null;
        return (Array.isArray(waModules) ? waModules : []).find((item) => {
            const moduleId = String(item?.moduleId || item?.module_id || item?.id || '').trim().toLowerCase();
            return moduleId === target;
        }) || null;
    }, [activeModuleId, selectedCatalogModuleId, waModules]);
    const activeAiConfig = useMemo(() => {
        const direct = activeBusinessModule?.aiConfig && typeof activeBusinessModule.aiConfig === 'object'
            ? activeBusinessModule.aiConfig
            : null;
        const metadataConfig = activeBusinessModule?.metadata?.aiConfig && typeof activeBusinessModule.metadata.aiConfig === 'object'
            ? activeBusinessModule.metadata.aiConfig
            : null;
        return direct || metadataConfig || {};
    }, [activeBusinessModule]);
    const activeChatScopeInfo = useMemo(() => {
        const parsed = parseAiScopedChatId(activeChatId || '');
        const baseChatId = String(parsed.baseChatId || activeChatId || '').trim();
        const scopeModuleId = String(
            activeChatDetails?.scopeModuleId
            || activeModuleId
            || parsed.scopeModuleId
            || ''
        ).trim().toLowerCase();
        return { baseChatId, scopeModuleId };
    }, [activeChatDetails?.scopeModuleId, activeChatId, activeModuleId]);
    const buildOrderApiHeaders = useCallback((includeJson = false) => {
        const headers = typeof buildApiHeaders === 'function'
            ? (buildApiHeaders({ includeJson }) || {})
            : {};
        const nextHeaders = { ...headers };
        if (includeJson && !nextHeaders['Content-Type']) {
            nextHeaders['Content-Type'] = 'application/json';
        }
        return nextHeaders;
    }, [buildApiHeaders]);
    const loadOrdersForActiveChat = useCallback(async () => {
        if (!activeChatId || !activeChatScopeInfo.baseChatId || normalizedTenantScopeKey === 'default') return;
        setOrdersLoading(true);
        setOrdersError('');
        try {
            const params = new URLSearchParams({ chatId: activeChatScopeInfo.baseChatId });
            if (activeChatScopeInfo.scopeModuleId) params.set('scopeModuleId', activeChatScopeInfo.scopeModuleId);
            const response = await fetch(`${API_URL}/api/tenant/orders?${params.toString()}`, {
                headers: buildOrderApiHeaders(false)
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) {
                throw new Error(payload?.error || 'No se pudieron cargar pedidos.');
            }
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map(normalizeOrderForState)
                .filter(Boolean);
            setOrdersByChat((prev) => ({
                ...(prev && typeof prev === 'object' ? prev : {}),
                [activeChatId]: items
            }));
        } catch (error) {
            setOrdersError(String(error?.message || 'No se pudieron cargar pedidos.'));
        } finally {
            setOrdersLoading(false);
        }
    }, [activeChatId, activeChatScopeInfo.baseChatId, activeChatScopeInfo.scopeModuleId, buildOrderApiHeaders, normalizedTenantScopeKey]);
    const upsertOrderForActiveChat = useCallback((order) => {
        const normalized = normalizeOrderForState(order);
        if (!activeChatId || !normalized) return;
        setOrdersByChat((prev) => {
            const safePrev = prev && typeof prev === 'object' ? prev : {};
            const current = Array.isArray(safePrev[activeChatId]) ? safePrev[activeChatId] : [];
            const next = current.filter((item) => String(item?.orderId || '') !== normalized.orderId);
            next.unshift(normalized);
            return { ...safePrev, [activeChatId]: next };
        });
    }, [activeChatId]);
    const openOrderDraft = useCallback((draft) => {
        if (!draft || typeof draft !== 'object') return;
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        setOrderDraft(draft);
        openToolsPanel('orders');
    }, [canWriteByAssignment, notifyAssignmentLock, openToolsPanel]);
    const handleOpenManualOrder = useCallback(() => {
        openOrderDraft(buildManualOrderDraft());
    }, [openOrderDraft]);
    const handleConvertQuoteToOrder = useCallback((quote) => {
        const draft = buildQuoteOrderDraft(quote);
        if (!draft.items.length) {
            notify({ type: 'warn', message: 'La cotizacion no tiene monto para crear pedido.' });
            return;
        }
        openOrderDraft(draft);
    }, [notify, openOrderDraft]);
    const handleSubmitOrderDraft = useCallback(async (draftWithTotals = {}) => {
        if (!activeChatScopeInfo.baseChatId || !draftWithTotals || typeof draftWithTotals !== 'object') return;
        const items = (Array.isArray(draftWithTotals.items) ? draftWithTotals.items : [])
            .map((item) => normalizeOrderLine(item, draftWithTotals.description || 'Pedido'))
            .filter((item) => item.productName && item.unitPrice > 0);
        if (items.length === 0) {
            notify({ type: 'warn', message: 'Agrega al menos un item con monto.' });
            return;
        }
        setOrderSaving(true);
        try {
            const body = {
                chatId: activeChatScopeInfo.baseChatId,
                scopeModuleId: activeChatScopeInfo.scopeModuleId || undefined,
                sourceType: draftWithTotals.sourceType || 'manual',
                sourceId: draftWithTotals.sourceId || undefined,
                items,
                deliveryAmount: toOrderNumber(draftWithTotals.deliveryAmount),
                discountAmount: toOrderNumber(draftWithTotals.discountAmount),
                notes: String(draftWithTotals.notes || '').trim()
            };
            const orderDate = String(draftWithTotals.orderDate || draftWithTotals.order_date || '').trim();
            if (orderDate) body.orderDate = orderDate;
            if (body.sourceType === 'manual') {
                body.description = String(draftWithTotals.description || items[0]?.productName || '').trim();
                body.amount = toOrderNumber(draftWithTotals.amount ?? items[0]?.unitPrice ?? 0);
            }
            const response = await fetch(`${API_URL}/api/tenant/orders`, {
                method: 'POST',
                headers: buildOrderApiHeaders(true),
                body: JSON.stringify(body)
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) {
                throw new Error(payload?.error || 'No se pudo crear el pedido.');
            }
            upsertOrderForActiveChat(payload.order);
            setOrderDraft(null);
            setActiveTab('orders');
            notify({ type: 'success', message: 'Pedido creado.' });
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'No se pudo crear el pedido.') });
        } finally {
            setOrderSaving(false);
        }
    }, [activeChatScopeInfo.baseChatId, activeChatScopeInfo.scopeModuleId, buildOrderApiHeaders, notify, upsertOrderForActiveChat]);
    const handleUpdateOrderStatus = useCallback(async (order, status) => {
        const orderId = String(order?.orderId || '').trim();
        const nextStatus = String(status || '').trim().toLowerCase();
        if (!orderId || !nextStatus) return;
        try {
            const response = await fetch(`${API_URL}/api/tenant/orders/${encodeURIComponent(orderId)}/status`, {
                method: 'PATCH',
                headers: buildOrderApiHeaders(true),
                body: JSON.stringify({ status: nextStatus })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) {
                throw new Error(payload?.error || 'No se pudo actualizar el pedido.');
            }
            upsertOrderForActiveChat(payload.order);
            notify({ type: 'success', message: 'Estado de pedido actualizado.' });
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'No se pudo actualizar el pedido.') });
            void loadOrdersForActiveChat();
        }
    }, [buildOrderApiHeaders, loadOrdersForActiveChat, notify, upsertOrderForActiveChat]);
    useEffect(() => {
        void loadOrdersForActiveChat();
    }, [loadOrdersForActiveChat]);
    useEffect(() => {
        const token = String(pendingCatalogOrderRequest?.token || '');
        if (!token || String(pendingCatalogOrderRequest?.chatId || '') !== String(activeChatId || '')) return;
        if (lastCatalogOrderRequestRef.current === token) return;
        lastCatalogOrderRequestRef.current = token;
        const draft = buildCatalogOrderDraft(pendingCatalogOrderRequest);
        if (!draft.items[0]?.unitPrice) {
            notify({ type: 'warn', message: 'Este producto no tiene precio detectado. Completa el monto antes de guardar.' });
        }
        openOrderDraft(draft);
    }, [activeChatId, notify, openOrderDraft, pendingCatalogOrderRequest]);
    useEffect(() => {
        console.log('[Patty debug] activeBusinessModule:', JSON.stringify(activeBusinessModule?.metadata?.aiConfig));
    }, [activeBusinessModule]);
    const enablePatty = activeAiConfig.enablePatty !== false;
    const enableCopilot = activeAiConfig.enableCopilot !== false;
    const aiPanelAvailable = enablePatty || enableCopilot;
    const labels = useMemo(() => (Array.isArray(businessData.labels) ? businessData.labels : []), [businessData.labels]);
    const profile = useMemo(() => (businessData.profile || myProfile || null), [businessData.profile, myProfile]);
    const quickRepliesEnabled = Boolean(waCapabilities?.quickReplies || waCapabilities?.quickRepliesRead || waCapabilities?.quickRepliesWrite);
    useTenantScopeReset({
        normalizedTenantScopeKey,
        tenantScopeRef,
        resetAiScopeState,
        setActiveTab,
        setShowCompanyProfile,
        setAiInput,
        setCartDraftsByChat,
        setQuickSearch,
        setOrderImportStatus,
        lastImportedOrderRef
    });

    useAiSocketBridge({
        socket,
        tenantId: normalizedTenantScopeKey,
        currentAiScopeKey,
        currentAiScopeChatId,
        scopeModuleId: activeAiScope.scopeModuleId || null,
        aiHistoryLoadedRef,
        aiHistoryRequestSeqRef,
        aiHistoryScopeBySeqRef,
        aiRequestScopeRef,
        aiScopeKeyRef,
        setAiThreadsByScope,
        setAiScopeLoading,
        setAiThreadMessages
    });
    usePendingOrderCartImport({
        pendingOrderCartLoad,
        activeChatId,
        catalog,
        quoteHistory,
        lastImportedOrderRef,
        setCart,
        setShowOrderAdjustments,
        setActiveTab: openToolsPanel,
        setOrderImportStatus,
        setGlobalDiscountEnabled,
        setGlobalDiscountType,
        setGlobalDiscountValue,
        setGlobalOnRegular,
        setDeliveryType,
        setDeliveryAmount,
        setCartWizardStep,
        setCartOpenReason,
        updateDraft,
        formatMoney
    });
    useEffect(() => {
        const requestedTabId = String(requestedToolTab?.tabId || '').trim();
        if (!requestedTabId) return;
        if (requestedTabId === 'cart') {
            setCartOpenReason('import');
        } else {
            setCartOpenReason(null);
        }
        setActiveTab(requestedTabId);
        setShowCompanyProfile(false);
    }, [requestedToolTab]);
    useBusinessSidebarUiSync({
        aiEndRef,
        aiMessages,
        activeTab,
        quickRepliesEnabled,
        cart,
        cartOpenReason,
        setCartOpenReason,
        setActiveTab
    });
    useCompanyProfileOverlay({
        openCompanyProfileToken,
        showCompanyProfile,
        companyProfileRef,
        setShowCompanyProfile
    });

    const getLiveMessages = useCallback(
        () => {
            if (Array.isArray(messagesRef?.current)) return messagesRef.current;
            return Array.isArray(liveMessagesRef.current) ? liveMessagesRef.current : [];
        },
        [messagesRef]
    );

    const buildBusinessContext = () => buildBusinessContextPrompt({
        catalog,
        profile,
        messages: getLiveMessages(),
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
        messages: getLiveMessages(),
        currentAiScopeChatId,
        activeChatId,
        activeAiScope
    });

    const sendAiMessage = () => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
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
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        // Extract content inside [MENSAJE: ...] if present, otherwise use full text
        const match = text.match(/\[MENSAJE:\s*([\s\S]+?)\]/);
        const msg = match ? match[1].trim() : text;
        setInputText(msg);
        setPattySuggestion(null);
        setActiveTab('ai');
        returnToChatPanel();
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
        normalizedGlobalDiscountType,
        globalDiscPct,
        subtotalParticipants,
        subtotalExcluded,
        globalDiscountApplied,
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
        globalOnRegular,
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
        globalOnRegular,
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
        normalizedGlobalDiscountValue,
        normalizedGlobalDiscountType,
        globalOnRegular
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
        normalizedGlobalDiscountValue,
        normalizedGlobalDiscountType,
        globalOnRegular
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

    useEffect(() => {
        if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') return;

        const resolveBaseChatId = (value = '') => String(value || '').split('::mod::')[0].trim();

        const handleQuoteSent = (event = {}) => {
            const incomingChatId = String(event?.chatId || event?.baseChatId || event?.to || '').trim();
            const currentChatId = String(activeChatId || '').trim();
            if (incomingChatId && currentChatId) {
                const incomingBase = resolveBaseChatId(incomingChatId);
                const currentBase = resolveBaseChatId(currentChatId);
                if (incomingChatId !== currentChatId && incomingBase !== currentBase) return;
            }

            setOrderImportStatus({
                level: 'ok',
                text: event?.quoteNumber
                    ? `Cotizacion ${event.quoteNumber}${Number(event?.revisionNumber || 0) > 1 ? ` (Rev. ${event.revisionNumber})` : ''} enviada correctamente.`
                    : 'Cotizacion enviada correctamente.'
            });
            upsertQuoteHistory(currentChatId || incomingChatId, {
                quoteId: event?.quoteId,
                quoteNumber: event?.quoteNumber ?? event?.quote_number,
                revisionNumber: event?.revisionNumber ?? event?.revision_number,
                parentQuoteId: event?.parentQuoteId ?? event?.parent_quote_id,
                isOptionMode: event?.isOptionMode ?? event?.is_option_mode,
                optionNumber: event?.optionNumber ?? event?.option_number,
                optionGroupId: event?.optionGroupId ?? event?.option_group_id,
                messageId: event?.messageId,
                status: event?.status,
                currency: event?.currency,
                items: event?.items,
                summary: event?.summary,
                notes: event?.notes
            });
        };

        const handleQuoteError = (event = {}) => {
            const detail = typeof event === 'string'
                ? event
                : String(event?.error || event?.message || '').trim();
            setOrderImportStatus({
                level: 'warn',
                text: detail || 'No se pudo enviar la cotizacion.'
            });
        };

        const handleChatQuotes = (event = {}) => {
            const incomingChatId = String(event?.chatId || event?.baseChatId || event?.to || '').trim();
            const currentChatId = String(activeChatId || '').trim();
            if (incomingChatId && currentChatId) {
                const incomingBase = resolveBaseChatId(incomingChatId);
                const currentBase = resolveBaseChatId(currentChatId);
                if (incomingChatId !== currentChatId && incomingBase !== currentBase) return;
            }
            if (event?.ok === false) return;
            const quotes = Array.isArray(event?.quotes)
                ? event.quotes.map(normalizeQuoteHistoryItem).filter(Boolean)
                : [];
            setChatQuotesByChat((prev) => ({
                ...(prev && typeof prev === 'object' ? prev : {}),
                [currentChatId || incomingChatId]: quotes
            }));
        };

        const handleQuoteOptionChosen = (event = {}) => {
            const incomingChatId = String(event?.chatId || event?.baseChatId || '').trim();
            const currentChatId = String(activeChatId || '').trim();
            if (!incomingChatId || !currentChatId) return;
            const incomingBase = resolveBaseChatId(incomingChatId);
            const currentBase = resolveBaseChatId(currentChatId);
            if (incomingChatId !== currentChatId && incomingBase !== currentBase) return;
            socket.emit('list_chat_quotes', { chatId: currentChatId });
        };

        socket.on('quote_sent', handleQuoteSent);
        socket.on('quote_error', handleQuoteError);
        socket.on('chat_quotes', handleChatQuotes);
        socket.on('quote_option_chosen', handleQuoteOptionChosen);

        return () => {
            socket.off('quote_sent', handleQuoteSent);
            socket.off('quote_error', handleQuoteError);
            socket.off('chat_quotes', handleChatQuotes);
            socket.off('quote_option_chosen', handleQuoteOptionChosen);
        };
    }, [socket, activeChatId, normalizeQuoteHistoryItem, upsertQuoteHistory]);

    useEffect(() => {
        if (!socket || typeof socket.emit !== 'function' || !activeChatId) return;
        socket.emit('list_chat_quotes', { chatId: activeChatId });
    }, [socket, activeChatId]);

    useEffect(() => {
        setPattySuggestion(null);
    }, [activeChatId]);

    useEffect(() => {
        if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') return;

        const resolveBaseChatId = (value = '') => String(value || '').split('::mod::')[0].trim();

        const handlePattySuggestion = (event = {}) => {
            const incomingChatId = String(event?.chatId || event?.baseChatId || '').trim();
            const currentChatId = String(activeChatId || '').trim();
            if (!incomingChatId || !currentChatId) return;
            if (resolveBaseChatId(incomingChatId) !== resolveBaseChatId(currentChatId)) return;
            const messages = Array.isArray(event?.messages)
                ? event.messages
                    .map((item) => ({
                        text: String(item?.text || '').trim(),
                        quotedMessageId: String(item?.quotedMessageId || '').trim() || null
                    }))
                    .filter((item) => item.text)
                : [];
            const suggestion = String(event?.suggestion || messages.map((item) => item.text).join('\n\n')).trim();
            setPattySuggestion({
                chatId: incomingChatId,
                moduleId: String(event?.moduleId || '').trim(),
                suggestion,
                messages: messages.length ? messages : (suggestion ? [{ text: suggestion, quotedMessageId: null }] : []),
                quoteRequest: event?.quoteRequest && typeof event.quoteRequest === 'object' ? event.quoteRequest : null,
                assistantName: String(event?.assistantName || 'Patty').trim() || 'Patty',
                timestamp: event?.timestamp || Date.now()
            });
        };

        const handleMessage = (event = {}) => {
            const currentChatId = String(activeChatId || '').trim();
            const incomingChatId = String(event?.chatId || event?.baseChatId || event?.to || '').trim();
            if (!currentChatId || !incomingChatId) return;
            if (resolveBaseChatId(incomingChatId) !== resolveBaseChatId(currentChatId)) return;
            if (event?.fromMe === true) setPattySuggestion(null);
        };

        socket.on('patty_suggestion', handlePattySuggestion);
        socket.on('message', handleMessage);

        return () => {
            socket.off('patty_suggestion', handlePattySuggestion);
            socket.off('message', handleMessage);
        };
    }, [socket, activeChatId]);

    useEffect(() => {
        if (activeTab === 'ai' && !aiPanelAvailable) {
            setActiveTab('catalog');
        }
    }, [activeTab, aiPanelAvailable]);

    const handleStartNewQuote = useCallback(() => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        setCart([]);
        updateDraft({
            sourceOrder: null,
            sourceQuote: null,
            sourceType: null,
            globalDiscountEnabled: false,
            globalDiscountType: 'percent',
            globalDiscountValue: 0,
            globalOnRegular: false,
            deliveryType: 'free',
            deliveryAmount: 0,
            cartWizardStep: 1
        });
        setOrderImportStatus({
            level: 'ok',
            text: 'Nueva cotizacion lista. Agrega productos desde el catalogo.'
        });
        setCartOpenReason(null);
        openToolsPanel('catalog');
    }, [canWriteByAssignment, notifyAssignmentLock, openToolsPanel, setCart, updateDraft]);

    const handleLoadQuoteToCart = useCallback((quote = {}) => {
        const normalized = normalizeQuoteHistoryItem(quote);
        if (!normalized) return;
        const quoteItems = [
            normalized?.itemsJson,
            normalized?.items_json,
            quote?.itemsJson,
            quote?.items_json,
            quote?.items
        ].find((items) => Array.isArray(items) && items.length > 0) || [];
        if (quoteItems.length === 0) {
            console.warn('[BusinessSidebar] quote cart load without items', {
                quoteId: normalized?.quoteId || quote?.quoteId || quote?.quote_id || null,
                quoteNumber: normalized?.quoteNumber || quote?.quoteNumber || quote?.quote_number || null,
                keys: quote && typeof quote === 'object' ? Object.keys(quote) : []
            });
            setOrderImportStatus({
                level: 'warn',
                text: 'No se pudo cargar el detalle de esta cotización'
            });
            return;
        }
        const importedCart = quoteItems.map((item, index) => {
            const qty = Math.max(1, Number(item?.qty ?? item?.quantity ?? 1) || 1);
            const unitPrice = Math.max(0, Number(item?.unitPrice ?? item?.price ?? 0) || 0);
            const regularCandidate = Number(item?.regularPrice ?? 0);
            const legacyLineSubtotal = Number(item?.lineSubtotal ?? 0);
            const regularPrice = Math.max(
                unitPrice,
                Number.isFinite(regularCandidate) && regularCandidate > 0
                    ? regularCandidate
                    : (Number.isFinite(legacyLineSubtotal) && legacyLineSubtotal > 0 ? legacyLineSubtotal / qty : unitPrice)
            );
            const lineDiscountType = normalizeDiscountType(item?.linDiscountType ?? item?.lineDiscountType);
            const lineDiscountPct = Math.max(0, Math.min(100, Number(item?.linDiscountPct ?? (lineDiscountType === 'percent' ? item?.lineDiscountValue : 0) ?? 0) || 0));
            const lineDiscountAmt = Math.max(0, Number(item?.linDiscountAmt ?? (lineDiscountType === 'amount' ? item?.lineDiscountValue : 0) ?? 0) || 0);
            const lineDiscountValue = lineDiscountType === 'amount' ? lineDiscountAmt : lineDiscountPct;
            return {
                id: String(item?.productId || item?.itemId || item?.sku || `quote_${normalized.quoteId}_${index + 1}`),
                productId: String(item?.productId || item?.itemId || '').trim() || null,
                sku: String(item?.sku || '').trim() || null,
                title: String(item?.productName || item?.title || item?.name || item?.sku || `Producto ${index + 1}`).trim() || `Producto ${index + 1}`,
                unit: String(item?.unit || 'unidad').trim() || 'unidad',
                qty,
                price: unitPrice.toFixed(2),
                regularPrice: regularPrice.toFixed(2),
                salePrice: null,
                discountPct: lineDiscountPct,
                description: 'Producto cargado desde cotizacion enviada.',
                imageUrl: null,
                source: 'quote_history',
                stockStatus: null,
                lineDiscountEnabled: lineDiscountValue > 0,
                lineDiscountType,
                lineDiscountValue,
                linDiscountType: lineDiscountType === 'amount' ? 'fixed' : 'pct',
                linDiscountPct: lineDiscountPct,
                linDiscountAmt: lineDiscountAmt,
                excludeFromGlobal: item?.excludeFromGlobal === true
            };
        });
        const summary = normalized.summaryJson && typeof normalized.summaryJson === 'object' ? normalized.summaryJson : {};
        const deliveryAmountValue = Math.max(0, Number((summary?.deliveryAmt ?? summary?.deliveryAmount) || 0) || 0);
        const deliveryFree = summary?.deliveryFree !== false || deliveryAmountValue <= 0;
        const globalDiscount = summary?.globalDiscount && typeof summary.globalDiscount === 'object'
            ? summary.globalDiscount
            : {};
        updateDraft({
            cart: importedCart,
            sourceOrder: null,
            sourceQuote: {
                quoteId: normalized.quoteId,
                quoteNumber: normalized.quoteNumber,
                revisionNumber: normalized.revisionNumber,
                messageId: normalized.messageId
            },
            sourceType: 'quote',
            showOrderAdjustments: true,
            cartWizardStep: 4,
            globalDiscountEnabled: Boolean(globalDiscount?.enabled || Number(summary?.globalDiscPct || 0) > 0),
            globalDiscountType: normalizeDiscountType(summary?.globalDiscType ?? globalDiscount?.type ?? 'percent'),
            globalDiscountValue: Math.max(0, Number(
                normalizeDiscountType(summary?.globalDiscType ?? globalDiscount?.type) === 'amount'
                    ? (summary?.globalDiscAmt ?? globalDiscount?.applied ?? globalDiscount?.value)
                    : (summary?.globalDiscPct ?? globalDiscount?.value)
            ) || 0),
            globalOnRegular: Boolean(summary?.globalOnRegular ?? globalDiscount?.onRegular),
            deliveryType: deliveryFree ? 'free' : 'amount',
            deliveryAmount: deliveryFree ? 0 : deliveryAmountValue
        });
        setOrderImportStatus({
            level: 'ok',
            text: `Cotizacion ${normalized.quoteNumber || ''}${normalized.revisionNumber > 1 ? ` (Rev. ${normalized.revisionNumber})` : ''} cargada para editar.`.replace(/\s+/g, ' ').trim()
        });
        openToolsPanel('cart', { cartOpenReason: 'quote-history' });
    }, [normalizeQuoteHistoryItem, openToolsPanel, updateDraft]);

    const sendQuoteToChat = async () => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        // TODO(bug): carrito debe limpiarse solo al ENVIAR la cotización, no al agregarla al input
        // TODO(bug): al editar cotización, los descuentos por producto y globales (soles/%) deben guardarse correctamente en BD con todos los campos
        // TODO(bug): la cotización no permite editar — funcionalidad que existía antes y se perdió
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        let quoteSendMode = 'new';
        if (sourceQuote?.quoteId) {
            const sendAsRevision = await confirm({
                title: 'Enviar cotizacion cargada',
                message: 'Puedes enviarla como revision de la cotizacion original o como una cotizacion nueva.',
                confirmText: 'Enviar revision',
                cancelText: 'Enviar como nueva'
            });
            quoteSendMode = sendAsRevision ? 'revision' : 'new';
        }
        const payload = buildStructuredQuotePayloadFromCart({
            activeChatId,
            activeChatPhone,
            cart,
            regularSubtotalTotal,
            subtotalProducts,
            totalDiscountForQuote,
            globalDiscountApplied,
            subtotalAfterGlobal,
            deliveryFee,
            cartTotal,
            deliveryType,
            globalDiscountEnabled,
            globalDiscountType,
            globalDiscountValue,
            globalDiscPct,
            globalOnRegular,
            getLineBreakdown,
            buildQuoteMessageFromCart,
            formatQuoteProductTitle,
            formatMoneyCompact,
            currency: 'PEN',
            metadata: {
                tenantScopeKey: normalizedTenantScopeKey,
                scopeModuleId: String(activeModuleId || selectedCatalogModuleId || '').trim().toLowerCase() || null,
                sourceType: sourceQuote ? 'quote' : (sourceOrder ? 'order' : 'quote'),
                quoteSendMode,
                sourceQuote: sourceQuote || undefined,
                sourceOrder: sourceQuote ? undefined : (sourceOrder || undefined)
            }
        });
        if (!payload) return;

        if (!socket || typeof socket.emit !== 'function') {
            if (payload.body) {
                setInputText(payload.body);
                returnToChatPanel();
            }
            return;
        }

        socket.emit('send_structured_quote', payload);
        setCart([]);
        updateDraft({ sourceOrder: null, sourceQuote: null, sourceType: null });
        setCartOpenReason(null);
        returnToChatPanel();
    };

    const handleUsePattySuggestionMessage = useCallback((index) => {
        const messages = Array.isArray(pattySuggestion?.messages) ? pattySuggestion.messages : [];
        const message = messages[index];
        const text = String(message?.text || '').trim();
        if (!text) return;
        setInputText(text);
        returnToChatPanel();
    }, [pattySuggestion, returnToChatPanel, setInputText]);

    const handleGeneratePattyQuote = useCallback(() => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        const products = Array.isArray(pattySuggestion?.quoteRequest?.products)
            ? pattySuggestion.quoteRequest.products
            : [];
        if (!products.length) {
            notify({ type: 'warn', message: 'Patty no incluyo productos para cotizar.' });
            return;
        }
        const catalogBySku = new Map(catalog.map((item) => {
            const sku = String(item?.sku || item?.itemId || item?.productId || item?.id || '').trim().toUpperCase();
            return [sku, item];
        }).filter(([sku]) => Boolean(sku)));
        const tempCart = products.map((entry) => {
            const sku = String(entry?.sku || entry?.productId || entry?.id || '').trim().toUpperCase();
            const catalogItem = catalogBySku.get(sku);
            if (!catalogItem) return null;
            const qty = Math.max(1, Number.parseInt(String(entry?.qty || entry?.quantity || 1), 10) || 1);
            return {
                ...catalogItem,
                qty
            };
        }).filter(Boolean);
        if (!tempCart.length) {
            notify({ type: 'warn', message: 'No encontre esos SKUs en el catalogo local.' });
            return;
        }
        const pricing = calculateCartPricing({
            cart: tempCart,
            globalDiscountEnabled: false,
            globalDiscountType: 'percent',
            globalDiscountValue: 0,
            deliveryType: 'free',
            deliveryAmount: 0,
            parseMoney,
            roundMoney,
            clampNumber
        });
        const getTempLineBreakdown = (item = {}) => getCartLineBreakdown(item, {
            parseMoney,
            roundMoney,
            clampNumber
        });
        const payload = buildStructuredQuotePayloadFromCart({
            activeChatId,
            activeChatPhone,
            cart: tempCart,
            regularSubtotalTotal: pricing.regularSubtotalTotal,
            subtotalProducts: pricing.subtotalProducts,
            totalDiscountForQuote: pricing.totalDiscountForQuote,
            subtotalAfterGlobal: pricing.subtotalAfterGlobal,
            deliveryFee: pricing.deliveryFee,
            cartTotal: pricing.cartTotal,
            deliveryType: 'free',
            globalDiscountEnabled: false,
            globalDiscountType: 'percent',
            globalDiscountValue: 0,
            globalOnRegular: false,
            getLineBreakdown: getTempLineBreakdown,
            buildQuoteMessageFromCart,
            formatQuoteProductTitle,
            formatMoneyCompact,
            currency: 'PEN',
            notes: String(pattySuggestion?.quoteRequest?.note || '').trim(),
            metadata: {
                tenantScopeKey: normalizedTenantScopeKey,
                scopeModuleId: String(activeModuleId || selectedCatalogModuleId || '').trim().toLowerCase() || null,
                source: 'patty_review',
                assistantName: pattySuggestion?.assistantName || activeAiConfig.assistantName || 'Patty'
            }
        });
        if (!payload) return;
        if (!socket || typeof socket.emit !== 'function') {
            if (payload.body) {
                setInputText(payload.body);
                returnToChatPanel();
            }
            return;
        }
        socket.emit('send_structured_quote', payload);
        setPattySuggestion(null);
        returnToChatPanel();
    }, [
        activeAiConfig.assistantName,
        activeChatId,
        activeChatPhone,
        activeModuleId,
        canWriteByAssignment,
        catalog,
        conversationWindowOpen,
        normalizedTenantScopeKey,
        notify,
        notifyAssignmentLock,
        notifyWindowLock,
        pattySuggestion,
        returnToChatPanel,
        selectedCatalogModuleId,
        setInputText,
        socket
    ]);
    const addToCart = (item, qtyToAdd = 1) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        setCart((previous) => addItemToCartState(previous, item, qtyToAdd));
    };

    const removeFromCart = (id) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        setCart((previous) => {
            const next = removeItemFromCartState(previous, id);
            if (!Array.isArray(next) || next.length === 0) {
                setCartOpenReason(null);
            }
            return next;
        });
    };

    const updateQty = (id, quantity) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        setCart((previous) => setCartItemQtyState(previous, id, quantity));
    };

    const updateCatalogQty = (id, delta) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        setCart((previous) => updateCartItemQtyState(previous, id, delta));
    };

    const updateItemDiscountEnabled = (id, enabled) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        setCart((previous) => setCartItemDiscountEnabledState(previous, id, enabled, parseMoney));
    };

    const updateItemDiscountType = (id, type) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        setCart((previous) => setCartItemDiscountTypeState(previous, id, type));
    };

    const updateItemDiscountValue = (id, value) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        setCart((previous) => setCartItemDiscountValueState(previous, id, value, parseMoney));
    };

    const updateItemExcludeFromGlobal = (id, excluded) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        setCart((previous) => setCartItemExcludeFromGlobalState(previous, id, excluded));
    };
    const handleSendQuickReply = useCallback((quickReply) => {
        if (!canWriteByAssignment) {
            notifyAssignmentLock();
            return;
        }
        if (!conversationWindowOpen) {
            notifyWindowLock();
            return;
        }
        if (typeof onSendQuickReply === 'function') {
            onSendQuickReply(quickReply);
        } else if (quickReply?.text) {
            setInputText(String(quickReply.text || ''));
        }
        returnToChatPanel();
    }, [canWriteByAssignment, conversationWindowOpen, notifyAssignmentLock, notifyWindowLock, onSendQuickReply, returnToChatPanel, setInputText]);
    const filteredQuickReplies = (Array.isArray(quickReplies) ? quickReplies : []).filter((item) => {
        const q = String(quickSearch || '').trim().toLowerCase();
        if (!q) return true;
        const haystack = `${item?.label || ''} ${item?.text || ''}`.toLowerCase();
        return haystack.includes(q);
    });
    const showCartTab = activeTab === 'cart' || ['import', 'manual', 'quote-history'].includes(String(cartOpenReason || ''));
    const tabs = [
        ...(aiPanelAvailable ? [{ id: 'ai', icon: <Bot size={15} />, label: 'IA Pro', tier: 'primary' }] : []),
        showCartTab
            ? { id: 'cart', icon: <ShoppingCart size={15} />, label: 'Carrito', tier: 'primary' }
            : { id: 'catalog', icon: <Package size={15} />, label: 'Catalogo', tier: 'primary' },
        { id: 'coverage', icon: <MapPin size={15} />, label: 'Cobertura', tier: 'primary' },
        { id: 'quotes', icon: <FileText size={15} />, label: 'Cotizaciones', tier: 'secondary' },
        { id: 'orders', icon: <ClipboardList size={15} />, label: 'Pedidos', tier: 'secondary' },
        ...(quickRepliesEnabled ? [{ id: 'quick', icon: <Clock size={15} />, label: 'Rapidas', tier: 'secondary' }] : []),
    ];
    const primaryTabs = tabs.filter(tab => tab.tier === 'primary');
    const secondaryTabs = tabs.filter(tab => tab.tier === 'secondary');
    const selectBusinessTab = useCallback((tabId) => {
        openToolsPanel(tabId);
    }, [openToolsPanel]);


    return (
        <div className="business-sidebar business-sidebar-pro">
            <div className="business-mobile-header">
                <button
                    type="button"
                    className="business-mobile-back-btn"
                    onClick={() => onMobileBackToChat?.()}
                >
                    ← Chat
                </button>
                <span>Herramientas</span>
            </div>
            {/* Tabs */}
            <div className="business-tabs-shell">
                <div className="business-tabs business-tabs--primary">
                    {primaryTabs.map(t => (
                          <button
                              key={t.id}
                              type="button"
                              onClick={() => selectBusinessTab(t.id)}
                              className={`business-tab-btn business-tab-btn--primary ${activeTab === t.id ? 'active' : ''}`}
                          >
                            <span className="business-tab-icon">{t.icon}</span>
                            <span className="business-tab-label">{t.label}</span>
                        </button>
                    ))}
                </div>
                {secondaryTabs.length > 0 && (
                    <div className="business-tabs business-tabs--secondary">
                        {secondaryTabs.map(t => (
                              <button
                              key={t.id}
                              type="button"
                                  onClick={() => selectBusinessTab(t.id)}
                                  className={`business-tab-btn business-tab-btn--secondary ${activeTab === t.id ? 'active' : ''}`}
                              >
                                <span className="business-tab-icon">{t.icon}</span>
                                <span className="business-tab-label">{t.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {!quickRepliesEnabled && activeTab === 'ai' && (
                <div style={{ padding: '2px 10px 0', fontSize: '0.66rem', color: 'var(--chat-control-text-soft)', textAlign: 'right' }}>
                    Respuestas rapidas deshabilitadas para esta empresa o plan.
                </div>
            )}
            {!canWriteByAssignment && (
                <div className="business-assignment-lock-hint">
                    Toma este chat para responder
                </div>
            )}
            {canWriteByAssignment && !conversationWindowOpen && (
                <div className="business-assignment-lock-hint">
                    La ventana de 24 horas expiró. Usa el botón de template del chat para volver a contactar.
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
                <BusinessAiTabSection
                    aiMessages={aiMessages}
                    isAiLoading={isAiLoading}
                    sendToClient={sendToClient}
                    renderAiMessageWithSendAction={renderAiMessageWithSendAction}
                    repairMojibake={repairMojibake}
                    aiEndRef={aiEndRef}
                    setAiInput={setAiInput}
                    sendAiMessage={sendAiMessage}
                    aiInput={aiInput}
                    canWriteByAssignment={canUseMessageTools}
                    pattySuggestion={pattySuggestion}
                    enablePatty={enablePatty}
                    enableCopilot={enableCopilot}
                    activeTenantId={normalizedTenantScopeKey}
                    activeChatId={activeChatId}
                    activeScopeModuleId={String(activeChatDetails?.scopeModuleId || activeModuleId || '').trim().toLowerCase()}
                    activeChatAssignment={activeChatAssignment}
                    activeChatCommercialStatus={activeChatCommercialStatus}
                    activeAiConfig={activeAiConfig}
                    chatAssignmentState={chatAssignmentState}
                    buildApiHeaders={buildApiHeaders}
                    onUsePattySuggestion={() => {
                        const messages = Array.isArray(pattySuggestion?.messages) ? pattySuggestion.messages : [];
                        const suggestion = messages.length
                            ? messages.map((item) => String(item?.text || '').trim()).filter(Boolean).join('\n\n')
                            : String(pattySuggestion?.suggestion || '').trim();
                        if (!suggestion) return;
                        setInputText(suggestion);
                        setPattySuggestion(null);
                        returnToChatPanel();
                    }}
                    onUsePattySuggestionMessage={handleUsePattySuggestionMessage}
                    onGeneratePattyQuote={handleGeneratePattyQuote}
                    onDismissPattySuggestion={() => setPattySuggestion(null)}
                />
            )}

            {/* CATALOG TAB */}
            {activeTab === 'catalog' && (
                <BusinessCatalogTab catalog={catalog} socket={socket} addToCart={addToCart} onCatalogQtyDelta={updateCatalogQty} catalogMeta={businessData.catalogMeta} activeChatId={activeChatId} activeChatPhone={activeChatPhone} cartItems={cart} waModules={waModules} selectedCatalogModuleId={selectedCatalogModuleId} selectedCatalogId={selectedCatalogId} tenantId={normalizedTenantScopeKey} onSelectCatalogModule={onSelectCatalogModule} onSelectCatalog={onSelectCatalog} onUploadCatalogImage={onUploadCatalogImage} onSendCatalogProduct={(payload) => {
                    if (typeof onSendCatalogProduct === 'function') {
                        onSendCatalogProduct(payload);
                    } else if (socket && typeof socket.emit === 'function') {
                        socket.emit('send_catalog_product', {
                            to: activeChatId,
                            toPhone: String(activeChatPhone || '').trim() || null,
                            product: payload
                        });
                    }
                    returnToChatPanel();
                }} canWriteByAssignment={canUseMessageTools} quoteOptionsWizard={quoteOptionsWizard} onQuoteOptionsWizardChange={updateQuoteOptionsWizard} onResetQuoteOptionsWizard={resetQuoteOptionsWizard} onOpenCart={() => openToolsPanel('cart', { cartOpenReason: 'manual' })} />
            )}

            {activeTab === 'coverage' && (
                <BusinessCoverageTabSection
                    activeTenantId={normalizedTenantScopeKey}
                    activeChatId={activeChatId}
                    activeChatPhone={activeChatPhone}
                    buildApiHeaders={buildApiHeaders}
                    messages={messages}
                    messagesRef={messagesRef}
                    notify={notify}
                    onPrepareMessage={(text) => {
                        setInputText(String(text || ''));
                        returnToChatPanel();
                    }}
                />
            )}

            {/* CART TAB */}
            {activeTab === 'cart' && (
                <BusinessCartTabSection
                    cart={cart}
                    orderImportStatus={orderImportStatus}
                    sourceOrder={sourceOrder}
                    sourceQuote={sourceQuote}
                    cartWizardStep={cartWizardStep}
                    setCartWizardStep={setCartWizardStep}
                    getLineBreakdown={getLineBreakdown}
                    removeFromCart={removeFromCart}
                    updateQty={updateQty}
                    updateItemDiscountEnabled={updateItemDiscountEnabled}
                    updateItemDiscountValue={updateItemDiscountValue}
                    updateItemDiscountType={updateItemDiscountType}
                    updateItemExcludeFromGlobal={updateItemExcludeFromGlobal}
                    showOrderAdjustments={showOrderAdjustments}
                    setShowOrderAdjustments={setShowOrderAdjustments}
                    globalDiscountEnabled={globalDiscountEnabled}
                    setGlobalDiscountEnabled={setGlobalDiscountEnabled}
                    globalDiscountType={globalDiscountType}
                    setGlobalDiscountType={setGlobalDiscountType}
                    normalizedGlobalDiscountValue={normalizedGlobalDiscountValue}
                    setGlobalDiscountValue={setGlobalDiscountValue}
                    globalOnRegular={globalOnRegular}
                    setGlobalOnRegular={setGlobalOnRegular}
                    parseMoney={parseMoney}
                    deliveryType={deliveryType}
                    setDeliveryType={setDeliveryType}
                    safeDeliveryAmount={safeDeliveryAmount}
                    setDeliveryAmount={setDeliveryAmount}
                    showCartTotalsBreakdown={showCartTotalsBreakdown}
                    setShowCartTotalsBreakdown={setShowCartTotalsBreakdown}
                    formatMoney={formatMoney}
                    regularSubtotalTotal={regularSubtotalTotal}
                    subtotalProducts={subtotalProducts}
                    subtotalParticipants={subtotalParticipants}
                    subtotalExcluded={subtotalExcluded}
                    globalDiscountApplied={globalDiscountApplied}
                    totalDiscountForQuote={totalDiscountForQuote}
                    subtotalAfterGlobal={subtotalAfterGlobal}
                    deliveryFee={deliveryFee}
                    cartTotal={cartTotal}
                    sendQuoteToChat={sendQuoteToChat}
                    canWriteByAssignment={canUseMessageTools}
                    onBackToCatalog={() => openToolsPanel('catalog')}
                />
            )}

            {activeTab === 'quotes' && (
                <BusinessQuotesTabSection
                    quoteHistory={quoteHistory}
                    quoteHistoryExpanded={quoteHistoryExpanded}
                    setQuoteHistoryExpanded={setQuoteHistoryExpanded}
                    onLoadQuoteToCart={handleLoadQuoteToCart}
                    onConvertQuoteToOrder={handleConvertQuoteToOrder}
                    onStartNewQuote={handleStartNewQuote}
                    quoteOptionsModeActive={quoteOptionsModeActive}
                    formatMoney={formatMoney}
                    canWriteByAssignment={canUseMessageTools}
                    canCreateOrder={canWriteByAssignment}
                />
            )}

            {activeTab === 'orders' && (
                <BusinessOrdersTabSection
                    orders={activeOrders}
                    ordersLoading={ordersLoading}
                    ordersError={ordersError}
                    onRefreshOrders={loadOrdersForActiveChat}
                    onOpenManualOrder={handleOpenManualOrder}
                    onUpdateOrderStatus={handleUpdateOrderStatus}
                    formatMoney={formatMoney}
                    canWriteByAssignment={canWriteByAssignment}
                />
            )}

            {/* QUICK REPLIES TAB */}


            {activeTab === 'quick' && quickRepliesEnabled && (
                <BusinessQuickRepliesTabSection
                    quickSearch={quickSearch}
                    setQuickSearch={setQuickSearch}
                    filteredQuickReplies={filteredQuickReplies}
                    onSendQuickReply={handleSendQuickReply}
                    setInputText={setInputText}
                    canWriteByAssignment={canUseMessageTools}
                />
            )}

            <BusinessOrderModal
                draft={orderDraft}
                saving={orderSaving}
                onChange={setOrderDraft}
                onClose={() => !orderSaving && setOrderDraft(null)}
                onSubmit={handleSubmitOrderDraft}
                formatMoney={formatMoney}
            />

        </div>
    );
};

export default React.memo(BusinessSidebar);














































