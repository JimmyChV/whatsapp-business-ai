import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Bot, ShoppingCart, Clock, Package } from 'lucide-react';
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
    BusinessQuickRepliesTabSection,
    ClientProfilePanel,
    CompanyProfilePanel
} from '../sections';

export { ClientProfilePanel };
// =========================================================
// BUSINESS SIDEBAR - Main right panel


// =========================================================

const BusinessSidebar = ({ tenantScopeKey = 'default', setInputText, businessData = {}, messages = [], activeChatId, activeChatPhone = '', activeChatDetails = null, onSendToClient, socket, myProfile, onLogout, quickReplies = [], onSendQuickReply = null, onSendCatalogProduct = null, waCapabilities = {}, pendingOrderCartLoad = null, openCompanyProfileToken = 0, waModules = [], selectedCatalogModuleId = '', selectedCatalogId = '', activeModuleId = '', onSelectCatalogModule = null, onSelectCatalog = null, onUploadCatalogImage = null, onCartSnapshotChange = null, cartDraftsByChat: externalCartDraftsByChat = {}, setCartDraftsByChat: externalSetCartDraftsByChat = null, chatAssignmentState = null }) => {
    const { notify } = useUiFeedback();
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
    const [quickSearch, setQuickSearch] = useState('');
    const [orderImportStatus, setOrderImportStatus] = useState(null);
    const lastImportedOrderRef = useRef('');
    const tenantScopeRef = useRef(String(tenantScopeKey || 'default').trim() || 'default');
    const canWriteByAssignment = typeof chatAssignmentState?.isAssignedToMe === 'function'
        ? chatAssignmentState.isAssignedToMe(activeChatId)
        : false;
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

    const catalog = useMemo(
        () => (businessData.catalog || []).map((item, idx) => normalizeCatalogItem(item, idx)),
        [businessData.catalog]
    );
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
                text: 'Cotizacion enviada correctamente.'
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

        socket.on('quote_sent', handleQuoteSent);
        socket.on('quote_error', handleQuoteError);

        return () => {
            socket.off('quote_sent', handleQuoteSent);
            socket.off('quote_error', handleQuoteError);
        };
    }, [socket, activeChatId]);

    const sendQuoteToChat = () => {
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
                scopeModuleId: String(activeModuleId || selectedCatalogModuleId || '').trim().toLowerCase() || null
            }
        });
        if (!payload) return;

        if (!socket || typeof socket.emit !== 'function') {
            if (payload.body) setInputText(payload.body);
            return;
        }

        socket.emit('send_structured_quote', payload);
        setCart([]);
    };
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
                />
            )}

            {/* CATALOG TAB */}
            {activeTab === 'catalog' && (
                <BusinessCatalogTab catalog={catalog} socket={socket} addToCart={addToCart} onCatalogQtyDelta={updateCatalogQty} catalogMeta={businessData.catalogMeta} activeChatId={activeChatId} activeChatPhone={activeChatPhone} cartItems={cart} waModules={waModules} selectedCatalogModuleId={selectedCatalogModuleId} selectedCatalogId={selectedCatalogId} onSelectCatalogModule={onSelectCatalogModule} onSelectCatalog={onSelectCatalog} onUploadCatalogImage={onUploadCatalogImage} onSendCatalogProduct={onSendCatalogProduct} canWriteByAssignment={canUseMessageTools} />
            )}

            {/* CART TAB */}
            {activeTab === 'cart' && (
                <BusinessCartTabSection
                    cart={cart}
                    orderImportStatus={orderImportStatus}
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














































