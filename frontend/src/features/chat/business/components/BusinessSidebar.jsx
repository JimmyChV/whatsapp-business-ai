import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Bot, ShoppingCart, Clock, Package, MapPin, FileText } from 'lucide-react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
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
    normalizeCatalogItem,
    parseMoney,
    repairMojibake,
    renderAiMessageWithSendAction,
    removeItemFromCartState,
    roundMoney,
    setCartItemDiscountEnabledState,
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
    BusinessQuotesTabSection,
    BusinessQuickRepliesTabSection,
    ClientProfilePanel,
    CompanyProfilePanel
} from '../sections';

export { ClientProfilePanel };
// =========================================================
// BUSINESS SIDEBAR - Main right panel


// =========================================================

const BusinessSidebar = ({ tenantScopeKey = 'default', setInputText, businessData = {}, messages = [], messagesRef = null, activeChatId, activeChatPhone = '', activeChatDetails = null, onSendToClient, socket, myProfile, onLogout, quickReplies = [], onSendQuickReply = null, onSendCatalogProduct = null, waCapabilities = {}, pendingOrderCartLoad = null, openCompanyProfileToken = 0, waModules = [], selectedCatalogModuleId = '', selectedCatalogId = '', activeModuleId = '', onSelectCatalogModule = null, onSelectCatalog = null, onUploadCatalogImage = null, onCartSnapshotChange = null, cartDraftsByChat: externalCartDraftsByChat = {}, setCartDraftsByChat: externalSetCartDraftsByChat = null, chatAssignmentState = null, chatCommercialStatusState = null, buildApiHeaders = null }) => {
    const { notify, confirm } = useUiFeedback();
    const [activeTab, setActiveTab] = useState('ai');
    const [showCompanyProfile, setShowCompanyProfile] = useState(false);
    const [pattySuggestion, setPattySuggestion] = useState(null);
    const companyProfileRef = useRef(null);
    const liveMessagesRef = useRef([]);

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
    const globalDiscountType = activeDraft.globalDiscountType || 'percentage';
    const globalDiscountValue = activeDraft.globalDiscountValue || 0;
    const deliveryType = activeDraft.deliveryType || 'none';
    const deliveryAmount = activeDraft.deliveryAmount || 0;
    const showCartTotalsBreakdown = activeDraft.showCartTotalsBreakdown || false;
    const sourceOrder = activeDraft.sourceOrder && typeof activeDraft.sourceOrder === 'object'
        ? activeDraft.sourceOrder
        : null;
    const sourceQuote = activeDraft.sourceQuote && typeof activeDraft.sourceQuote === 'object'
        ? activeDraft.sourceQuote
        : null;
    const [chatQuotesByChat, setChatQuotesByChat] = useState({});
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
    const quoteOptionsModeActive = Boolean(quoteOptionsWizard?.modoOpciones);
    const [quickSearch, setQuickSearch] = useState('');
    const [orderImportStatus, setOrderImportStatus] = useState(null);
    const lastImportedOrderRef = useRef('');
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
            const previous = String(previousDraft?.globalDiscountType || 'percentage');
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
            return { globalDiscountType: String(resolved || 'percentage') };
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
    });
    useBusinessSidebarUiSync({
        aiEndRef,
        aiMessages,
        activeTab,
        quickRepliesEnabled,
        cart,
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
            globalDiscountType: 'percentage',
            globalDiscountValue: 0,
            deliveryType: 'none',
            deliveryAmount: 0
        });
        setOrderImportStatus({
            level: 'ok',
            text: 'Nueva cotizacion lista. Agrega productos desde el catalogo.'
        });
        setActiveTab('catalog');
    }, [canWriteByAssignment, notifyAssignmentLock, setCart, updateDraft]);

    const handleLoadQuoteToCart = useCallback((quote = {}) => {
        const normalized = normalizeQuoteHistoryItem(quote);
        if (!normalized) return;
        const quoteItems = Array.isArray(normalized.itemsJson) ? normalized.itemsJson : [];
        const importedCart = quoteItems.map((item, index) => {
            const qty = Math.max(1, Number(item?.qty ?? item?.quantity ?? 1) || 1);
            const unitPrice = Math.max(0, Number(item?.unitPrice ?? item?.price ?? 0) || 0);
            const regularPrice = Math.max(unitPrice, Number(item?.lineSubtotal || 0) > 0 ? Number(item.lineSubtotal) / qty : unitPrice);
            const lineDiscountAmount = Math.max(0, Number(item?.lineDiscountAmount || 0) || 0);
            return {
                id: String(item?.productId || item?.itemId || item?.sku || `quote_${normalized.quoteId}_${index + 1}`),
                productId: String(item?.productId || item?.itemId || '').trim() || null,
                sku: String(item?.sku || '').trim() || null,
                title: String(item?.title || item?.name || item?.sku || `Producto ${index + 1}`).trim() || `Producto ${index + 1}`,
                unit: String(item?.unit || 'unidad').trim() || 'unidad',
                qty,
                price: unitPrice.toFixed(2),
                regularPrice: regularPrice.toFixed(2),
                salePrice: null,
                discountPct: 0,
                description: 'Producto cargado desde cotizacion enviada.',
                imageUrl: null,
                source: 'quote_history',
                stockStatus: null,
                lineDiscountEnabled: lineDiscountAmount > 0 || Number(item?.lineDiscountValue || 0) > 0,
                lineDiscountType: String(item?.lineDiscountType || '').trim().toLowerCase() === 'amount' ? 'amount' : 'percent',
                lineDiscountValue: Math.max(0, Number(item?.lineDiscountValue || 0) || 0),
                lineDiscountAmount
            };
        });
        const summary = normalized.summaryJson && typeof normalized.summaryJson === 'object' ? normalized.summaryJson : {};
        const deliveryAmountValue = Math.max(0, Number(summary?.deliveryAmount || 0) || 0);
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
            globalDiscountEnabled: Boolean(globalDiscount?.enabled || Number(globalDiscount?.applied || 0) > 0),
            globalDiscountType: String(globalDiscount?.type || 'amount').trim().toLowerCase() === 'percent' ? 'percent' : 'amount',
            globalDiscountValue: Math.max(0, Number(globalDiscount?.value ?? globalDiscount?.applied ?? 0) || 0),
            deliveryType: deliveryFree ? 'free' : 'amount',
            deliveryAmount: deliveryFree ? 0 : deliveryAmountValue
        });
        setOrderImportStatus({
            level: 'ok',
            text: `Cotizacion ${normalized.quoteNumber || ''}${normalized.revisionNumber > 1 ? ` (Rev. ${normalized.revisionNumber})` : ''} cargada para editar.`.replace(/\s+/g, ' ').trim()
        });
        setActiveTab('cart');
    }, [normalizeQuoteHistoryItem, updateDraft]);

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
            totalDiscountForQuote,
            subtotalAfterGlobal,
            deliveryFee,
            cartTotal,
            deliveryType,
            globalDiscountEnabled,
            globalDiscountType,
            globalDiscountValue,
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
            if (payload.body) setInputText(payload.body);
            return;
        }

        socket.emit('send_structured_quote', payload);
        setCart([]);
        updateDraft({ sourceOrder: null, sourceQuote: null, sourceType: null });
    };

    const handleUsePattySuggestionMessage = useCallback((index) => {
        const messages = Array.isArray(pattySuggestion?.messages) ? pattySuggestion.messages : [];
        const message = messages[index];
        const text = String(message?.text || '').trim();
        if (!text) return;
        setInputText(text);
    }, [pattySuggestion, setInputText]);

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
            globalDiscountType: 'percentage',
            globalDiscountValue: 0,
            deliveryType: 'none',
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
            totalDiscountForQuote: pricing.totalDiscountForQuote,
            subtotalAfterGlobal: pricing.subtotalAfterGlobal,
            deliveryFee: pricing.deliveryFee,
            cartTotal: pricing.cartTotal,
            deliveryType: 'none',
            globalDiscountEnabled: false,
            globalDiscountType: 'percentage',
            globalDiscountValue: 0,
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
            if (payload.body) setInputText(payload.body);
            return;
        }
        socket.emit('send_structured_quote', payload);
        setPattySuggestion(null);
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
        setCart((previous) => removeItemFromCartState(previous, id));
    };

    const updateQty = (id, delta) => {
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
    }, [canWriteByAssignment, conversationWindowOpen, notifyAssignmentLock, notifyWindowLock, onSendQuickReply, setInputText]);
    const filteredQuickReplies = (Array.isArray(quickReplies) ? quickReplies : []).filter((item) => {
        const q = String(quickSearch || '').trim().toLowerCase();
        if (!q) return true;
        const haystack = `${item?.label || ''} ${item?.text || ''}`.toLowerCase();
        return haystack.includes(q);
    });
    const tabs = [
        ...(aiPanelAvailable ? [{ id: 'ai', icon: <Bot size={15} />, label: 'IA Pro' }] : []),
        { id: 'coverage', icon: <MapPin size={15} />, label: 'Cobertura' },
        { id: 'catalog', icon: <Package size={15} />, label: `Catalogo${catalog.length > 0 ? ` (${catalog.length})` : ''}` },
        { id: 'quotes', icon: <FileText size={15} />, label: 'Cotizaciones' },
        ...(quickRepliesEnabled ? [{ id: 'quick', icon: <Clock size={15} />, label: 'Rapidas' }] : []),
    ];


    return (
        <div className="business-sidebar business-sidebar-pro">
            {/* Tabs */}
            <div className="business-tabs">
                {tabs.map(t => (
                      <button
                          key={t.id}
                          type="button"
                          onClick={() => { setActiveTab(t.id); setShowCompanyProfile(false); }}
                          className={`business-tab-btn ${activeTab === t.id ? 'active' : ''}`}
                      >
                        <span className="business-tab-icon">{t.icon}</span>
                        <span className="business-tab-label">{t.label}</span>
                    </button>
                ))}
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
                    }}
                    onUsePattySuggestionMessage={handleUsePattySuggestionMessage}
                    onGeneratePattyQuote={handleGeneratePattyQuote}
                    onDismissPattySuggestion={() => setPattySuggestion(null)}
                />
            )}

            {/* CATALOG TAB */}
            {activeTab === 'catalog' && (
                <BusinessCatalogTab catalog={catalog} socket={socket} addToCart={addToCart} onCatalogQtyDelta={updateCatalogQty} catalogMeta={businessData.catalogMeta} activeChatId={activeChatId} activeChatPhone={activeChatPhone} cartItems={cart} waModules={waModules} selectedCatalogModuleId={selectedCatalogModuleId} selectedCatalogId={selectedCatalogId} tenantId={normalizedTenantScopeKey} onSelectCatalogModule={onSelectCatalogModule} onSelectCatalog={onSelectCatalog} onUploadCatalogImage={onUploadCatalogImage} onSendCatalogProduct={onSendCatalogProduct} canWriteByAssignment={canUseMessageTools} quoteOptionsWizard={quoteOptionsWizard} onQuoteOptionsWizardChange={updateQuoteOptionsWizard} onResetQuoteOptionsWizard={resetQuoteOptionsWizard} onOpenCart={() => setActiveTab('cart')} />
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
                    onPrepareMessage={(text) => setInputText(String(text || ''))}
                />
            )}

            {/* CART TAB */}
            {activeTab === 'cart' && (
                <BusinessCartTabSection
                    cart={cart}
                    orderImportStatus={orderImportStatus}
                    sourceOrder={sourceOrder}
                    sourceQuote={sourceQuote}
                    quoteHistory={[]}
                    quoteHistoryExpanded={false}
                    setQuoteHistoryExpanded={() => {}}
                    onLoadQuoteToCart={null}
                    onStartNewQuote={null}
                    quoteOptionsModeActive={quoteOptionsModeActive}
                    getLineBreakdown={getLineBreakdown}
                    removeFromCart={removeFromCart}
                    updateQty={updateQty}
                    updateItemDiscountEnabled={updateItemDiscountEnabled}
                    updateItemDiscountValue={updateItemDiscountValue}
                    updateItemDiscountType={updateItemDiscountType}
                    showOrderAdjustments={showOrderAdjustments}
                    setShowOrderAdjustments={setShowOrderAdjustments}
                    globalDiscountEnabled={globalDiscountEnabled}
                    setGlobalDiscountEnabled={setGlobalDiscountEnabled}
                    globalDiscountType={globalDiscountType}
                    setGlobalDiscountType={setGlobalDiscountType}
                    normalizedGlobalDiscountValue={normalizedGlobalDiscountValue}
                    setGlobalDiscountValue={setGlobalDiscountValue}
                    parseMoney={parseMoney}
                    deliveryType={deliveryType}
                    setDeliveryType={setDeliveryType}
                    safeDeliveryAmount={safeDeliveryAmount}
                    setDeliveryAmount={setDeliveryAmount}
                    showCartTotalsBreakdown={showCartTotalsBreakdown}
                    setShowCartTotalsBreakdown={setShowCartTotalsBreakdown}
                    formatMoney={formatMoney}
                    regularSubtotalTotal={regularSubtotalTotal}
                    totalDiscountForQuote={totalDiscountForQuote}
                    subtotalAfterGlobal={subtotalAfterGlobal}
                    deliveryFee={deliveryFee}
                    cartTotal={cartTotal}
                    sendQuoteToChat={sendQuoteToChat}
                    canWriteByAssignment={canUseMessageTools}
                    showQuoteHistory={false}
                />
            )}

            {activeTab === 'quotes' && (
                <BusinessQuotesTabSection
                    quoteHistory={quoteHistory}
                    quoteHistoryExpanded={quoteHistoryExpanded}
                    setQuoteHistoryExpanded={setQuoteHistoryExpanded}
                    onLoadQuoteToCart={handleLoadQuoteToCart}
                    onStartNewQuote={handleStartNewQuote}
                    quoteOptionsModeActive={quoteOptionsModeActive}
                    formatMoney={formatMoney}
                    canWriteByAssignment={canUseMessageTools}
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

            

        </div>
    );
};

export default React.memo(BusinessSidebar);














































