import React, { useState } from 'react';
import { Package, PlusCircle, Search, SlidersHorizontal } from 'lucide-react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import {
    addItemToCartState,
    buildQuoteItemFromCartLine,
    buildQuoteSummaryFromCart,
    buildCatalogFormDataFromProduct,
    buildCatalogProductPayloadFromForm,
    calculateCartPricing,
    clampNumber,
    createCatalogProductEmptyForm,
    extractCatalogCategoryLabels,
    formatMoney,
    getCartLineBreakdown,
    normalizeCatalogCategoryKey,
    normalizeTextKey,
    parseMoney,
    removeItemFromCartState,
    roundMoney,
    setCartItemDiscountEnabledState,
    setCartItemDiscountTypeState,
    setCartItemDiscountValueState,
    updateCartItemQtyState
} from '../helpers';
import BusinessCartTabSection from './BusinessCartTabSection';
import { BusinessCatalogProductCard, BusinessCatalogProductForm } from './catalog';
import QuoteOptionReview from './QuoteOptionReview';

const CatalogTab = ({ catalog, socket, addToCart, onCatalogQtyDelta, catalogMeta, activeChatId, activeChatPhone = '', cartItems = [], waModules = [], selectedCatalogModuleId = '', selectedCatalogId = '', tenantId = 'default', onSelectCatalogModule = null, onSelectCatalog = null, onUploadCatalogImage = null, onSendCatalogProduct = null, canWriteByAssignment = false, quoteOptionsWizard = null, onQuoteOptionsWizardChange = null, onResetQuoteOptionsWizard = null, onOpenCart = null }) => {
    const { confirm, notify } = useUiFeedback();
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState(() => createCatalogProductEmptyForm());
    const [imageUploadBusy, setImageUploadBusy] = useState(false);
    const [imageUploadError, setImageUploadError] = useState('');
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('all');
    const [catalogTypeFilter, setCatalogTypeFilter] = useState('all');
    const [showCatalogFilters, setShowCatalogFilters] = useState(false);
    const moduleOptions = Array.isArray(waModules)
        ? waModules
            .filter((module) => module && String(module.moduleId || '').trim())
            .map((module) => ({
                moduleId: String(module.moduleId || '').trim(),
                name: String(module.name || module.moduleId || '').trim() || String(module.moduleId || '').trim()
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
        : [];
    const activeCatalogModuleId = String(selectedCatalogModuleId || '').trim();
    const activeCatalogId = String(selectedCatalogId || '').trim().toUpperCase();
    const catalogOptions = Array.isArray(catalogMeta?.scope?.catalogs)
        ? catalogMeta.scope.catalogs
            .map((entry) => ({
                catalogId: String(entry?.catalogId || '').trim().toUpperCase(),
                name: String(entry?.name || entry?.catalogId || '').trim() || String(entry?.catalogId || '').trim().toUpperCase(),
                sourceType: String(entry?.sourceType || entry?.source || '').trim().toLowerCase() || 'local'
            }))
            .filter((entry) => entry.catalogId)
        : [];
    const activeCatalogOption = catalogOptions.find((entry) => entry.catalogId === activeCatalogId) || null;
    const effectiveCatalogSource = String(activeCatalogOption?.sourceType || catalogMeta?.source || 'local').trim().toLowerCase() || 'local';
    const isExternalCatalog = ['native', 'woocommerce', 'meta'].includes(effectiveCatalogSource);
    const chatCatalogReadOnly = true;
    const showCatalogForm = !chatCatalogReadOnly && showForm;
    const handleAddClick = () => {
        setEditingProduct(null);
        setFormData(createCatalogProductEmptyForm());
        setImageUploadError('');
        setShowForm(true);
    };

    const handleEditClick = (product) => {
        setEditingProduct(product);
        setFormData(buildCatalogFormDataFromProduct(product));
        setImageUploadError('');
        setShowForm(true);
    };

    const handleCatalogImageFileChange = async (event) => {
        const file = event?.target?.files?.[0] || null;
        if (!file) return;

        const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        const maxBytes = 3 * 1024 * 1024;
        if (!allowedMime.includes(String(file.type || '').toLowerCase())) {
            setImageUploadError('Formato no permitido. Usa JPG, PNG o WEBP.');
            event.target.value = '';
            return;
        }
        if (Number(file.size || 0) > maxBytes) {
            setImageUploadError('La imagen supera 3 MB.');
            event.target.value = '';
            return;
        }
        if (typeof onUploadCatalogImage !== 'function') {
            setImageUploadError('No hay servicio de carga de imagen disponible.');
            event.target.value = '';
            return;
        }

        try {
            setImageUploadBusy(true);
            setImageUploadError('');
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
                reader.readAsDataURL(file);
            });
            const uploaded = await onUploadCatalogImage({
                dataUrl,
                fileName: file.name,
                scope: `catalog-${activeCatalogModuleId || 'general'}`
            });
            const uploadedUrl = String(uploaded?.url || '').trim();
            if (!uploadedUrl) throw new Error('No se recibio URL de imagen.');
            setFormData((prev) => ({ ...prev, imageUrl: uploadedUrl }));
        } catch (error) {
            setImageUploadError(String(error?.message || 'No se pudo subir la imagen.'));
        } finally {
            setImageUploadBusy(false);
            event.target.value = '';
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = buildCatalogProductPayloadFromForm(formData, { activeCatalogModuleId, activeCatalogId });
        if (!payload.title) {
            notify({ type: 'warn', message: 'El titulo del producto es obligatorio.' });
            return;
        }
        if (!payload.price) {
            notify({ type: 'warn', message: 'El precio del producto es obligatorio.' });
            return;
        }

        if (editingProduct) {
            socket.emit('update_product', {
                id: editingProduct.id,
                updates: payload,
                moduleId: activeCatalogModuleId || null,
                catalogId: activeCatalogId || null
            });
        } else {
            socket.emit('add_product', payload);
        }
        setImageUploadError('');
        setShowForm(false);
    };

    const handleDelete = async (id) => {
        const confirmed = await confirm({
            title: 'Eliminar producto',
            message: 'Eliminar este producto del catalogo?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            tone: 'danger'
        });
        if (!confirmed) return;
        socket.emit('delete_product', { id, moduleId: activeCatalogModuleId || null, catalogId: activeCatalogId || null });
    };

    const sendCatalogProduct = (item, i) => {
        if (!canWriteByAssignment) {
            notify({ type: 'warn', message: 'Toma este chat para responder' });
            return;
        }
        if (!activeChatId) {
            notify({ type: 'info', message: 'Selecciona un chat antes de enviar un producto.' });
            return;
        }

        const payload = {
            id: item.id || `catalog_${i}`,
            title: item.title || `Producto ${i + 1}`,
            price: item.price || '',
            regularPrice: item.regularPrice || item.price || '',
            salePrice: item.salePrice || '',
            discountPct: item.discountPct || 0,
            description: item.description || '',
            imageUrl: item.imageUrl || '',
            url: item.url || item.permalink || item.productUrl || item.link || ''
        };

        if (typeof onSendCatalogProduct === 'function') {
            onSendCatalogProduct(payload);
            return;
        }

        socket.emit('send_catalog_product', {
            to: activeChatId,
            toPhone: String(activeChatPhone || '').trim() || null,
            product: payload
        });
    };

    const normalizedSearch = normalizeTextKey(catalogSearch);
    const normalizeCategoryKey = (value) => normalizeCatalogCategoryKey(value, normalizeTextKey);

    const metaCategories = Array.isArray(catalogMeta?.categories) ? catalogMeta.categories : [];
    const categoryMap = new Map();
    [...metaCategories, ...catalog.flatMap((item) => extractCatalogCategoryLabels(item))]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .forEach((label) => {
            const key = normalizeCategoryKey(label);
            if (!key) return;
            if (!categoryMap.has(key)) categoryMap.set(key, label);
        });
    const categoryOptions = Array.from(categoryMap.entries())
        .map(([, label]) => ({ label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
    const selectedCategoryKey = catalogCategoryFilter === 'all'
        ? 'all'
        : normalizeCategoryKey(catalogCategoryFilter);
    const visibleCatalog = catalog.filter((item) => {
        const searchable = normalizeTextKey(String(item?.title || '') + ' ' + String(item?.sku || '') + ' ' + String(item?.description || ''));
        const searchMatch = !normalizedSearch || searchable.includes(normalizedSearch);

        const itemCategoryKeys = extractCatalogCategoryLabels(item)
            .map((entry) => normalizeCategoryKey(entry))
            .filter(Boolean);
        const categoryMatch = selectedCategoryKey === 'all'
            || itemCategoryKeys.some((key) => (
                key === selectedCategoryKey
                || key.includes(selectedCategoryKey)
                || selectedCategoryKey.includes(key)
            ))
            || (itemCategoryKeys.length === 0 && searchable.includes(selectedCategoryKey));

        const finalPrice = Number.parseFloat(item?.price || '0') || 0;
        const regularPrice = Number.parseFloat(item?.regularPrice || item?.price || '0') || finalPrice;
        const hasDiscount = regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice;
        const cartLine = cartItems.find((cartItem) => String(cartItem?.id || '') === String(item?.id || ''));
        const inCart = Number(cartLine?.qty || 0) > 0;

        const typeMatch = catalogTypeFilter === 'all'
            || (catalogTypeFilter === 'discount' && hasDiscount)
            || (catalogTypeFilter === 'regular' && !hasDiscount)
            || (catalogTypeFilter === 'in_cart' && inCart)
            || (catalogTypeFilter === 'out_cart' && !inCart);

        return searchMatch && categoryMatch && typeMatch;
    });
    const hasCatalogFilters = catalogCategoryFilter !== 'all' || catalogTypeFilter !== 'all';
    const hasAnyCatalogCriteria = Boolean(catalogSearch.trim() || hasCatalogFilters);
    const cardSurface = 'var(--chat-card-surface)';
    const cardAltSurface = 'var(--chat-card-surface-alt)';
    const controlSurface = 'var(--chat-control-surface)';
    const controlStrongSurface = 'var(--chat-control-surface-strong)';
    const cardBorder = 'var(--chat-card-border)';
    const controlBorder = 'var(--chat-control-border)';
    const primaryText = 'var(--text-primary)';
    const secondaryText = 'var(--chat-control-text-soft)';
    const successSurface = 'var(--chat-success-surface)';
    const successBorder = 'var(--chat-success-border)';
    const successText = 'var(--chat-success-text)';
    const infoSurface = 'var(--chat-info-surface)';
    const infoBorder = 'var(--chat-info-border)';
    const infoText = 'var(--chat-info-text)';
    const warningSurface = 'var(--chat-warning-bg)';
    const warningBorder = 'var(--chat-warning-border)';
    const warningText = 'var(--chat-warning-text-strong)';
    const wizardState = quoteOptionsWizard && typeof quoteOptionsWizard === 'object'
        ? quoteOptionsWizard
        : {};
    const modoOpciones = Boolean(wizardState.modoOpciones);
    const optionCountChoices = [2, 3];
    const safeTotalOpciones = optionCountChoices.includes(Number(wizardState.totalOpciones))
        ? Number(wizardState.totalOpciones)
        : 3;
    const safePasoActual = Math.max(1, Number(wizardState.pasoActual || 1) || 1);
    const wizardOptions = Array.isArray(wizardState.opciones) ? wizardState.opciones : [];
    const wizardConfigured = wizardOptions.length > 0;
    const safePhase = ['config', 'catalog', 'cart', 'review'].includes(String(wizardState.phase || ''))
        ? String(wizardState.phase || '')
        : (wizardConfigured ? 'catalog' : 'config');
    const activeOptionNumber = Math.min(
        safeTotalOpciones,
        Math.max(1, Number(wizardState.currentOption || Math.max(1, safePasoActual - 1)) || 1)
    );
    const currentOptionIndex = wizardConfigured && safePhase !== 'config'
        ? activeOptionNumber - 1
        : -1;
    const currentOption = currentOptionIndex >= 0 ? (wizardOptions[currentOptionIndex] || null) : null;
    const currentOptionProducts = Array.isArray(currentOption?.productos) ? currentOption.productos : [];
    const currentOptionGlobalDiscountEnabled = Boolean(currentOption?.globalDiscountEnabled);
    const currentOptionGlobalDiscountType = currentOption?.globalDiscountType === 'amount' ? 'amount' : 'percent';
    const currentOptionGlobalDiscountValue = Number(currentOption?.globalDiscountValue || 0) || 0;
    const currentOptionDeliveryType = currentOption?.deliveryType === 'amount' ? 'amount' : 'free';
    const currentOptionDeliveryAmount = Number(currentOption?.deliveryAmount || 0) || 0;
    const currentOptionShowOrderAdjustments = Boolean(currentOption?.showOrderAdjustments);
    const currentOptionShowCartTotalsBreakdown = currentOption?.showCartTotalsBreakdown !== false;
    const currentOptionPricing = calculateCartPricing({
        cart: currentOptionProducts,
        globalDiscountEnabled: currentOptionGlobalDiscountEnabled,
        globalDiscountType: currentOptionGlobalDiscountType,
        globalDiscountValue: currentOptionGlobalDiscountValue,
        deliveryType: currentOptionDeliveryType,
        deliveryAmount: currentOptionDeliveryAmount,
        parseMoney,
        roundMoney,
        clampNumber
    });
    const getOptionLineBreakdown = (item = {}) => getCartLineBreakdown(item, { parseMoney, roundMoney, clampNumber });
    const wizardSteps = [
        { type: 'config', step: 1, label: 'Config', complete: wizardConfigured, active: safePhase === 'config' },
        ...Array.from({ length: safeTotalOpciones }, (_, index) => {
            const optionNumber = index + 1;
            const option = wizardOptions[index] || {};
            return {
                type: 'option',
                step: optionNumber + 1,
                optionNumber,
                label: `Opción ${optionNumber}`,
                complete: Boolean(option?.confirmada),
                active: safePhase !== 'config' && safePhase !== 'review' && activeOptionNumber === optionNumber
            };
        })
    ];
    const setWizardPatch = (patch) => {
        if (typeof onQuoteOptionsWizardChange !== 'function') return;
        onQuoteOptionsWizardChange(patch);
    };
    const handleQuoteModeChange = (nextModoOpciones) => {
        if (!canWriteByAssignment) {
            notify({ type: 'warn', message: 'Toma este chat para cotizar.' });
            return;
        }
        if (!nextModoOpciones) {
            if (typeof onResetQuoteOptionsWizard === 'function') {
                onResetQuoteOptionsWizard();
            } else {
                setWizardPatch({ modoOpciones: false, phase: 'config', currentOption: 1, pasoActual: 1, opciones: [], mensajeFinal: '' });
            }
            return;
        }
        setWizardPatch({
            modoOpciones: true,
            totalOpciones: safeTotalOpciones,
            phase: 'config',
            currentOption: 1,
            pasoActual: 1,
            opciones: [],
            mensajeFinal: ''
        });
    };
    const handleStartWizard = () => {
        const opciones = Array.from({ length: safeTotalOpciones }, (_, index) => ({
            numero: index + 1,
            label: `Opción ${index + 1}`,
            productos: [],
            globalDiscountEnabled: false,
            globalDiscountType: 'percent',
            globalDiscountValue: 0,
            deliveryType: 'free',
            deliveryAmount: 0,
            showOrderAdjustments: false,
            showCartTotalsBreakdown: true,
            total: 0,
            confirmada: false
        }));
        setWizardPatch({
            modoOpciones: true,
            totalOpciones: safeTotalOpciones,
            phase: 'catalog',
            currentOption: 1,
            pasoActual: 2,
            opciones,
            mensajeFinal: ''
        });
    };
    const patchCurrentOption = (updater) => {
        if (currentOptionIndex < 0) return;
        const nextOptions = wizardOptions.map((option, index) => {
            if (index !== currentOptionIndex) return option;
            const resolved = typeof updater === 'function' ? updater(option || {}) : updater;
            return {
                ...(option || {}),
                ...(resolved && typeof resolved === 'object' ? resolved : {})
            };
        });
        setWizardPatch({ opciones: nextOptions });
    };
    const updateCurrentOptionProducts = (updater) => {
        patchCurrentOption((option) => {
            const previousProducts = Array.isArray(option?.productos) ? option.productos : [];
            const nextProducts = typeof updater === 'function' ? updater(previousProducts) : updater;
            const safeProducts = Array.isArray(nextProducts) ? nextProducts : [];
            const pricing = calculateCartPricing({
                cart: safeProducts,
                globalDiscountEnabled: Boolean(option?.globalDiscountEnabled),
                globalDiscountType: option?.globalDiscountType === 'amount' ? 'amount' : 'percent',
                globalDiscountValue: Number(option?.globalDiscountValue || 0) || 0,
                deliveryType: option?.deliveryType === 'amount' ? 'amount' : 'free',
                deliveryAmount: Number(option?.deliveryAmount || 0) || 0,
                parseMoney,
                roundMoney,
                clampNumber
            });
            return {
                productos: safeProducts,
                total: pricing.cartTotal,
                confirmada: false
            };
        });
    };
    const updateCurrentOptionPricing = (patch) => {
        patchCurrentOption((option) => {
            const nextOption = {
                ...(option || {}),
                ...(patch && typeof patch === 'object' ? patch : {}),
                confirmada: false
            };
            const safeProducts = Array.isArray(nextOption.productos) ? nextOption.productos : [];
            const pricing = calculateCartPricing({
                cart: safeProducts,
                globalDiscountEnabled: Boolean(nextOption.globalDiscountEnabled),
                globalDiscountType: nextOption.globalDiscountType === 'amount' ? 'amount' : 'percent',
                globalDiscountValue: Number(nextOption.globalDiscountValue || 0) || 0,
                deliveryType: nextOption.deliveryType === 'amount' ? 'amount' : 'free',
                deliveryAmount: Number(nextOption.deliveryAmount || 0) || 0,
                parseMoney,
                roundMoney,
                clampNumber
            });
            return {
                ...nextOption,
                total: pricing.cartTotal
            };
        });
    };
    const handleAddProductToCurrentOption = (item, qty = 1) => {
        if (!currentOption) return;
        updateCurrentOptionProducts((previous) => addItemToCartState(previous, item, qty));
    };
    const handleCurrentOptionQtyDelta = (id, delta) => {
        updateCurrentOptionProducts((previous) => updateCartItemQtyState(previous, id, delta));
    };
    const handleCurrentOptionRemove = (id) => {
        updateCurrentOptionProducts((previous) => removeItemFromCartState(previous, id));
    };
    const handleCurrentOptionDiscountEnabled = (id, enabled) => {
        updateCurrentOptionProducts((previous) => setCartItemDiscountEnabledState(previous, id, enabled, parseMoney));
    };
    const handleCurrentOptionDiscountType = (id, type) => {
        updateCurrentOptionProducts((previous) => setCartItemDiscountTypeState(previous, id, type));
    };
    const handleCurrentOptionDiscountValue = (id, value) => {
        updateCurrentOptionProducts((previous) => setCartItemDiscountValueState(previous, id, value, parseMoney));
    };
    const confirmCurrentOptionAndContinue = () => {
        if (!currentOption) return;
        if (currentOptionProducts.length === 0) {
            notify({ type: 'warn', message: 'Agrega al menos un producto a esta opción.' });
            return;
        }
        const nextOptions = wizardOptions.map((option, index) => (
            index === currentOptionIndex
                ? { ...option, total: currentOptionPricing.cartTotal, confirmada: true }
                : option
        ));
        setWizardPatch({
            opciones: nextOptions,
            phase: activeOptionNumber < safeTotalOpciones ? 'catalog' : 'review',
            currentOption: activeOptionNumber < safeTotalOpciones ? activeOptionNumber + 1 : activeOptionNumber,
            pasoActual: activeOptionNumber < safeTotalOpciones ? activeOptionNumber + 2 : safeTotalOpciones + 2
        });
    };
    const reviewOptionsData = wizardOptions
        .filter((option) => Array.isArray(option?.productos) && option.productos.length > 0)
        .map((option) => {
            const products = Array.isArray(option?.productos) ? option.productos : [];
            const pricing = calculateCartPricing({
                cart: products,
                globalDiscountEnabled: Boolean(option?.globalDiscountEnabled),
                globalDiscountType: option?.globalDiscountType === 'amount' ? 'amount' : 'percent',
                globalDiscountValue: Number(option?.globalDiscountValue || 0) || 0,
                deliveryType: option?.deliveryType === 'amount' ? 'amount' : 'free',
                deliveryAmount: Number(option?.deliveryAmount || 0) || 0,
                parseMoney,
                roundMoney,
                clampNumber
            });
            const items = products.map((item, index) => buildQuoteItemFromCartLine({
                item,
                line: getOptionLineBreakdown(item),
                index,
                currency: 'PEN'
            }));
            const summary = buildQuoteSummaryFromCart({
                cart: products,
                regularSubtotalTotal: pricing.regularSubtotalTotal,
                totalDiscountForQuote: pricing.totalDiscountForQuote,
                subtotalAfterGlobal: pricing.subtotalAfterGlobal,
                deliveryFee: pricing.deliveryFee,
                cartTotal: pricing.cartTotal,
                deliveryType: option?.deliveryType === 'amount' ? 'amount' : 'free',
                globalDiscountEnabled: Boolean(option?.globalDiscountEnabled),
                globalDiscountType: option?.globalDiscountType === 'amount' ? 'amount' : 'percent',
                globalDiscountValue: Number(option?.globalDiscountValue || 0) || 0,
                currency: 'PEN'
            });
            return {
                optionNumber: Number(option?.numero || 0) || 1,
                items,
                summary
            };
        });
    const primaryActionStyle = {
        background: 'var(--saas-accent-primary)',
        color: 'var(--saas-accent-primary-text)',
        border: '1px solid var(--saas-accent-primary)',
        borderRadius: '999px',
        padding: '4px 10px',
        cursor: 'pointer',
        fontSize: '0.7rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontWeight: 700
    };
    const neutralActionStyle = {
        background: controlSurface,
        border: `1px solid ${cardBorder}`,
        color: primaryText,
        borderRadius: '999px',
        padding: '4px 10px',
        fontSize: '0.71rem',
        cursor: 'pointer'
    };

    return (
        <div className="catalog-tab-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="catalog-tab-toolbar" style={{ padding: '8px 8px 6px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', background: cardSurface, borderBottom: `1px solid ${cardBorder}` }}>
                {catalogMeta?.source === 'local' && catalogMeta?.wooStatus && catalogMeta?.wooStatus !== 'ok' && (
                    <div className="catalog-source-warning" style={{ background: warningSurface, color: warningText, border: `1px solid ${warningBorder}`, borderRadius: '9px', padding: '8px 10px', fontSize: '0.75rem' }}>
                        WooCommerce no devolvio productos ({catalogMeta?.wooSource || 'sin fuente'}).
                        {catalogMeta?.wooReason ? ` Detalle: ${catalogMeta.wooReason}` : ''}
                    </div>
                )}

                                {moduleOptions.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.68rem', color: secondaryText, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Modulo</label>
                            <select
                                value={activeCatalogModuleId}
                                disabled={!canWriteByAssignment}
                                onChange={(event) => {
                                    const nextModuleId = String(event.target.value || '').trim();
                                    if (!nextModuleId || typeof onSelectCatalogModule !== 'function') return;
                                    onSelectCatalogModule(nextModuleId);
                                }}
                                style={{ width: '100%', background: controlStrongSurface, border: `1px solid ${cardBorder}`, color: primaryText, borderRadius: '10px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.72, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
                            >
                                {moduleOptions.map((module) => (
                                    <option key={'catalog_module_' + module.moduleId} value={module.moduleId}>{module.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.68rem', color: secondaryText, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Catalogo</label>
                            <select
                                value={activeCatalogId}
                                disabled={!canWriteByAssignment}
                                onChange={(event) => {
                                    const nextCatalogId = String(event.target.value || '').trim().toUpperCase();
                                    if (typeof onSelectCatalog !== 'function') return;
                                    onSelectCatalog(nextCatalogId);
                                }}
                                style={{ width: '100%', background: controlStrongSurface, border: `1px solid ${cardBorder}`, color: primaryText, borderRadius: '10px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.72, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
                            >
                                {catalogOptions.length === 0 && <option value="">Sin catalogos</option>}
                                {catalogOptions.map((entry) => (
                                    <option key={'catalog_option_' + entry.catalogId} value={entry.catalogId}>{entry.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ fontSize: '0.68rem', color: secondaryText, whiteSpace: 'nowrap', alignSelf: 'end' }}>
                            Scope: {activeCatalogModuleId || 'tenant'}
                        </div>
                    </div>
                )}
                {chatCatalogReadOnly && (
                    <div className="catalog-quote-mode-card" style={{ background: infoSurface, border: `1px solid ${infoBorder}`, color: infoText, borderRadius: '10px', padding: '9px 10px', fontSize: '0.74rem', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 800 }}>
                            Modo de cotización:
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', background: !modoOpciones ? controlStrongSurface : controlSurface, border: `1px solid ${!modoOpciones ? successBorder : cardBorder}`, borderRadius: '10px', padding: '8px 9px', color: !modoOpciones ? successText : primaryText, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', fontWeight: 800 }}>
                                <input
                                    type="radio"
                                    name="quote-mode"
                                    checked={!modoOpciones}
                                    disabled={!canWriteByAssignment}
                                    onChange={() => handleQuoteModeChange(false)}
                                />
                                Cotización única
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', background: modoOpciones ? controlStrongSurface : controlSurface, border: `1px solid ${modoOpciones ? successBorder : cardBorder}`, borderRadius: '10px', padding: '8px 9px', color: modoOpciones ? successText : primaryText, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', fontWeight: 800 }}>
                                <input
                                    type="radio"
                                    name="quote-mode"
                                    checked={modoOpciones}
                                    disabled={!canWriteByAssignment}
                                    onChange={() => handleQuoteModeChange(true)}
                                />
                                Por opciones
                            </label>
                        </div>
                    </div>
                )}
                {(!modoOpciones || safePhase === 'catalog') && (
                <div className="catalog-toolbar-card" style={{ background: cardAltSurface, border: `1px solid ${cardBorder}`, borderRadius: '11px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: controlStrongSurface, border: `1px solid ${controlBorder}`, borderRadius: '10px', padding: '0 10px', minWidth: 0 }}>
                            <Search size={15} color="var(--chat-control-text-soft)" />
                            <input
                                type="text"
                                value={catalogSearch}
                                disabled={!canWriteByAssignment}
                                onChange={e => setCatalogSearch(e.target.value)}
                                placeholder="Buscar producto o SKU"
                                style={{ width: '100%', minWidth: 0, background: 'transparent', border: 'none', color: primaryText, borderRadius: '10px', padding: '8px 0', fontSize: '0.78rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.72, cursor: canWriteByAssignment ? 'text' : 'not-allowed' }}
                            />
                            {catalogSearch.trim() && (
                                <button
                                    type="button"
                                    onClick={() => setCatalogSearch('')}
                                    style={{ background: 'transparent', border: 'none', color: secondaryText, cursor: 'pointer', fontSize: '0.72rem', padding: 0, whiteSpace: 'nowrap' }}
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowCatalogFilters(prev => !prev)}
                            title="Filtros"
                            disabled={!canWriteByAssignment}
                            style={{
                                height: '36px',
                                minWidth: '40px',
                                borderRadius: '10px',
                                border: hasCatalogFilters || showCatalogFilters ? `1px solid ${successBorder}` : `1px solid ${cardBorder}`,
                                background: hasCatalogFilters || showCatalogFilters ? successSurface : controlStrongSurface,
                                color: hasCatalogFilters || showCatalogFilters ? successText : secondaryText,
                                cursor: canWriteByAssignment ? 'pointer' : 'not-allowed',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                opacity: canWriteByAssignment ? 1 : 0.72
                            }}
                        >
                            <SlidersHorizontal size={15} />
                            {hasCatalogFilters && (
                                <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--saas-accent-primary)', boxShadow: '0 0 0 2px var(--chat-control-surface-strong)' }} />
                            )}
                        </button>
                                </div>

                    {showCatalogFilters && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', color: secondaryText }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><SlidersHorizontal size={12} /> Categoria</span>
                                <select
                                    value={catalogCategoryFilter}
                                    disabled={!canWriteByAssignment}
                                    onChange={e => setCatalogCategoryFilter(e.target.value)}
                                    style={{ width: '100%', background: controlStrongSurface, border: `1px solid ${cardBorder}`, color: primaryText, borderRadius: '8px', padding: '6px 8px', fontSize: '0.75rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.72, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
                                >
                                    <option value="all">Todas</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category.label} value={category.label}>{category.label}</option>
                                    ))}
                                </select>
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', color: secondaryText }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>Vista</span>
                                <select
                                    value={catalogTypeFilter}
                                    disabled={!canWriteByAssignment}
                                    onChange={e => setCatalogTypeFilter(e.target.value)}
                                    style={{ width: '100%', background: controlStrongSurface, border: `1px solid ${cardBorder}`, color: primaryText, borderRadius: '8px', padding: '6px 8px', fontSize: '0.75rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.72, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
                                >
                                    <option value="all">Todos</option>
                                    <option value="discount">Con descuento</option>
                                    <option value="regular">Precio regular</option>
                                    <option value="in_cart">En carrito</option>
                                    <option value="out_cart">Fuera del carrito</option>
                                </select>
                            </label>
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {!chatCatalogReadOnly && !isExternalCatalog && (
                                <button
                                    type="button"
                                    onClick={handleAddClick}
                                    style={primaryActionStyle}
                                >
                                    <PlusCircle size={13} /> Nuevo
                                </button>
                            )}
                            {hasAnyCatalogCriteria && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCatalogSearch('');
                                        setCatalogCategoryFilter('all');
                                        setCatalogTypeFilter('all');
                                    }}
                                    style={neutralActionStyle}
                                >
                                    Limpiar
                                </button>
                            )}
                            {!modoOpciones && cartItems.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => typeof onOpenCart === 'function' && onOpenCart()}
                                    style={primaryActionStyle}
                                >
                                    Ver carrito ({cartItems.length})
                                </button>
                            )}
                        </div>

                        <div style={{ fontSize: '0.7rem', color: secondaryText }}>
                            Mostrando {visibleCatalog.length} de {catalog.length} productos
                        </div>
                    </div>
                </div>
                )}
            </div>

            <div className="catalog-tab-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {modoOpciones ? (
                    <div className="catalog-options-wizard" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ color: primaryText, fontSize: '0.9rem', fontWeight: 900 }}>Cotización por opciones</div>
                                    <div style={{ color: secondaryText, fontSize: '0.73rem', lineHeight: 1.35 }}>Arma varias cotizaciones para que el cliente elija una alternativa.</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleQuoteModeChange(false)}
                                    style={neutralActionStyle}
                                >
                                    Volver a única
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '2px' }}>
                                {wizardSteps.map((step) => {
                                    const isCurrent = Boolean(step.active);
                                    const isComplete = Boolean(step.complete);
                                    const canOpenStep = step.type === 'config' || isComplete || isCurrent;
                                    return (
                                        <button
                                            key={`quote_option_step_${step.step}`}
                                            type="button"
                                            disabled={!canOpenStep}
                                            onClick={() => {
                                                if (!canOpenStep) return;
                                                if (step.type === 'config') {
                                                    setWizardPatch({ phase: 'config', pasoActual: 1, currentOption: 1 });
                                                    return;
                                                }
                                                setWizardPatch({
                                                    phase: isCurrent ? safePhase : (isComplete ? 'cart' : 'catalog'),
                                                    currentOption: step.optionNumber,
                                                    pasoActual: step.step
                                                });
                                            }}
                                            style={{
                                                flex: '0 0 auto',
                                                borderRadius: '999px',
                                                border: `1px solid ${isCurrent ? successBorder : cardBorder}`,
                                                background: isComplete ? successSurface : (isCurrent ? controlStrongSurface : controlSurface),
                                                color: isComplete || isCurrent ? successText : secondaryText,
                                                padding: '6px 10px',
                                                fontSize: '0.7rem',
                                                fontWeight: 800,
                                                cursor: canOpenStep ? 'pointer' : 'not-allowed',
                                                opacity: canOpenStep ? 1 : 0.65,
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {isComplete ? 'OK ' : ''}{step.label}{isCurrent ? ' *' : ''}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {safePhase === 'config' && (
                            <div style={{ background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                    <div style={{ color: primaryText, fontSize: '0.95rem', fontWeight: 900 }}>Configurar envío por opciones</div>
                                    <div style={{ color: secondaryText, fontSize: '0.75rem', lineHeight: 1.45 }}>Define cuántas alternativas quieres preparar antes de empezar.</div>
                                </div>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: secondaryText, fontSize: '0.74rem', fontWeight: 700 }}>
                                    ¿Cuántas alternativas vas a preparar?
                                    <select
                                        value={safeTotalOpciones}
                                        disabled={!canWriteByAssignment}
                                        onChange={(event) => setWizardPatch({ totalOpciones: Number(event.target.value || 3) })}
                                        style={{ width: '100%', background: controlStrongSurface, border: `1px solid ${cardBorder}`, color: primaryText, borderRadius: '10px', padding: '9px 10px', fontSize: '0.8rem', outline: 'none' }}
                                    >
                                        {optionCountChoices.map((count) => (
                                            <option key={`quote_option_count_${count}`} value={count}>{count} opciones</option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    disabled={!canWriteByAssignment}
                                    onClick={handleStartWizard}
                                    style={{
                                        ...primaryActionStyle,
                                        justifyContent: 'center',
                                        padding: '9px 12px',
                                        borderRadius: '12px',
                                        opacity: canWriteByAssignment ? 1 : 0.65,
                                        cursor: canWriteByAssignment ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    Comenzar
                                </button>
                            </div>
                        )}

                        {safePhase === 'catalog' && currentOption && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '12px', padding: '11px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ color: primaryText, fontSize: '0.95rem', fontWeight: 900 }}>Opción {activeOptionNumber} de {safeTotalOpciones}</div>
                                        <div style={{ color: secondaryText, fontSize: '0.74rem', lineHeight: 1.4 }}>Selecciona productos para esta alternativa.</div>
                                    </div>
                                    <div style={{ color: currentOptionProducts.length > 0 ? successText : secondaryText, fontSize: '0.72rem', fontWeight: 800 }}>
                                        {currentOptionProducts.length} producto{currentOptionProducts.length === 1 ? '' : 's'} agregados
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {visibleCatalog.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '30px 15px', color: secondaryText, background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '12px' }}>
                                            <Package size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto', color: secondaryText }} />
                                            <div style={{ fontSize: '0.875rem', marginBottom: '6px' }}>Catalogo vacio</div>
                                            <div style={{ fontSize: '0.78rem', opacity: 0.7, lineHeight: '1.5' }}>
                                                Ajusta la busqueda o filtros para agregar productos.
                                            </div>
                                        </div>
                                    ) : (
                                        visibleCatalog.map((item, i) => (
                                            <BusinessCatalogProductCard
                                                key={item.id || i}
                                                item={item}
                                                index={i}
                                                cartItems={currentOptionProducts}
                                                onCatalogQtyDelta={handleCurrentOptionQtyDelta}
                                                addToCart={handleAddProductToCurrentOption}
                                                sendCatalogProduct={sendCatalogProduct}
                                                canWriteByAssignment={canWriteByAssignment}
                                                chatCatalogReadOnly={chatCatalogReadOnly}
                                                isExternalCatalog={isExternalCatalog}
                                                handleEditClick={handleEditClick}
                                                handleDelete={handleDelete}
                                                formatMoney={formatMoney}
                                                quoteOptionMode
                                                optionLabel={currentOption.label || `Opción ${currentOption.numero || currentOptionIndex + 1}`}
                                            />
                                        ))
                                    )}
                                </div>

                                <div style={{ position: 'sticky', bottom: 0, zIndex: 5, background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '14px', padding: '10px', boxShadow: '0 -8px 22px rgba(15, 23, 42, 0.08)', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ color: secondaryText, fontSize: '0.74rem', lineHeight: 1.35 }}>
                                        Revisa cantidades y descuentos antes de confirmar esta opción.
                                    </div>
                                    <button
                                        type="button"
                                        disabled={currentOptionProducts.length === 0}
                                        onClick={() => setWizardPatch({ phase: 'cart', pasoActual: activeOptionNumber + 1 })}
                                        style={{
                                            ...primaryActionStyle,
                                            justifyContent: 'center',
                                            padding: '9px 13px',
                                            borderRadius: '12px',
                                            opacity: currentOptionProducts.length > 0 ? 1 : 0.55,
                                            cursor: currentOptionProducts.length > 0 ? 'pointer' : 'not-allowed'
                                        }}
                                    >
                                        Ver carrito de Opción {activeOptionNumber}
                                    </button>
                                </div>
                            </div>
                        )}

                        {safePhase === 'cart' && currentOption && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '12px', padding: '11px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ color: primaryText, fontSize: '0.95rem', fontWeight: 900 }}>{currentOption.label || `Opción ${currentOption.numero || currentOptionIndex + 1}`}</div>
                                        <div style={{ color: secondaryText, fontSize: '0.72rem', lineHeight: 1.4 }}>Ajusta cantidades, descuentos y delivery.</div>
                                    </div>
                                    <button type="button" onClick={() => setWizardPatch({ phase: 'catalog', pasoActual: activeOptionNumber + 1 })} style={neutralActionStyle}>
                                        Volver al catálogo
                                    </button>
                                </div>

                                <div style={{ background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '12px', overflow: 'hidden' }}>
                                    <BusinessCartTabSection
                                        cart={currentOptionProducts}
                                        orderImportStatus={null}
                                        sourceOrder={null}
                                        sourceQuote={null}
                                        quoteHistory={[]}
                                        quoteHistoryExpanded={false}
                                        setQuoteHistoryExpanded={() => {}}
                                        onLoadQuoteToCart={null}
                                        onStartNewQuote={null}
                                        quoteOptionsModeActive
                                        getLineBreakdown={getOptionLineBreakdown}
                                        removeFromCart={handleCurrentOptionRemove}
                                        updateQty={handleCurrentOptionQtyDelta}
                                        updateItemDiscountEnabled={handleCurrentOptionDiscountEnabled}
                                        updateItemDiscountValue={handleCurrentOptionDiscountValue}
                                        updateItemDiscountType={handleCurrentOptionDiscountType}
                                        showOrderAdjustments={currentOptionShowOrderAdjustments}
                                        setShowOrderAdjustments={(value) => updateCurrentOptionPricing({
                                            showOrderAdjustments: typeof value === 'function'
                                                ? value(currentOptionShowOrderAdjustments)
                                                : Boolean(value)
                                        })}
                                        globalDiscountEnabled={currentOptionGlobalDiscountEnabled}
                                        setGlobalDiscountEnabled={(value) => updateCurrentOptionPricing({
                                            globalDiscountEnabled: typeof value === 'function'
                                                ? value(currentOptionGlobalDiscountEnabled)
                                                : Boolean(value)
                                        })}
                                        globalDiscountType={currentOptionGlobalDiscountType}
                                        setGlobalDiscountType={(value) => updateCurrentOptionPricing({
                                            globalDiscountType: typeof value === 'function'
                                                ? value(currentOptionGlobalDiscountType)
                                                : (value === 'amount' ? 'amount' : 'percent')
                                        })}
                                        normalizedGlobalDiscountValue={currentOptionGlobalDiscountValue}
                                        setGlobalDiscountValue={(value) => updateCurrentOptionPricing({
                                            globalDiscountValue: typeof value === 'function'
                                                ? value(currentOptionGlobalDiscountValue)
                                                : Math.max(0, Number(value) || 0)
                                        })}
                                        parseMoney={parseMoney}
                                        deliveryType={currentOptionDeliveryType}
                                        setDeliveryType={(value) => updateCurrentOptionPricing({
                                            deliveryType: typeof value === 'function'
                                                ? value(currentOptionDeliveryType)
                                                : (value === 'amount' ? 'amount' : 'free')
                                        })}
                                        safeDeliveryAmount={currentOptionDeliveryAmount}
                                        setDeliveryAmount={(value) => updateCurrentOptionPricing({
                                            deliveryAmount: typeof value === 'function'
                                                ? value(currentOptionDeliveryAmount)
                                                : Math.max(0, Number(value) || 0)
                                        })}
                                        showCartTotalsBreakdown={currentOptionShowCartTotalsBreakdown}
                                        setShowCartTotalsBreakdown={(value) => updateCurrentOptionPricing({
                                            showCartTotalsBreakdown: typeof value === 'function'
                                                ? value(currentOptionShowCartTotalsBreakdown)
                                                : Boolean(value)
                                        })}
                                        formatMoney={formatMoney}
                                        regularSubtotalTotal={currentOptionPricing.regularSubtotalTotal}
                                        totalDiscountForQuote={currentOptionPricing.totalDiscountForQuote}
                                        subtotalAfterGlobal={currentOptionPricing.subtotalAfterGlobal}
                                        deliveryFee={currentOptionPricing.deliveryFee}
                                        cartTotal={currentOptionPricing.cartTotal}
                                        sendQuoteToChat={() => {}}
                                        canWriteByAssignment={canWriteByAssignment}
                                        showQuoteHistory={false}
                                        showSendQuoteAction={false}
                                    />
                                </div>

                                {false && (
                                <div style={{ background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                                    {currentOptionProducts.length === 0 ? (
                                        <div style={{ color: secondaryText, background: cardAltSurface, border: `1px dashed ${cardBorder}`, borderRadius: '10px', padding: '14px', fontSize: '0.76rem', lineHeight: 1.45, textAlign: 'center' }}>
                                            Esta opción aún no tiene productos.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {currentOptionProducts.map((item, index) => {
                                                const line = getOptionLineBreakdown(item);
                                                const discountMode = line.lineDiscountEnabled ? line.lineDiscountType : 'none';
                                                return (
                                                    <div key={item.id || index} style={{ background: cardAltSurface, border: `1px solid ${cardBorder}`, borderRadius: '10px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ color: primaryText, fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.25 }}>{item.title || item.sku || `Producto ${index + 1}`}</div>
                                                                <div style={{ color: secondaryText, fontSize: '0.68rem', marginTop: '2px' }}>{item.sku || 'Sin SKU'} - S/ {formatMoney(line.unitPrice || 0)}</div>
                                                            </div>
                                                            <button type="button" onClick={() => handleCurrentOptionRemove(item.id)} style={{ ...neutralActionStyle, padding: '3px 7px', color: 'var(--chat-danger-text)' }}>
                                                                Quitar
                                                            </button>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px', alignItems: 'center' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                                <button type="button" onClick={() => handleCurrentOptionQtyDelta(item.id, -1)} style={{ ...neutralActionStyle, padding: '2px 7px' }}>-</button>
                                                                <span style={{ color: primaryText, fontWeight: 900, minWidth: '20px', textAlign: 'center' }}>{line.qty}</span>
                                                                <button type="button" onClick={() => handleCurrentOptionQtyDelta(item.id, 1)} style={{ ...primaryActionStyle, padding: '2px 7px' }}>+</button>
                                                            </div>
                                                            <div style={{ textAlign: 'right', color: primaryText, fontSize: '0.76rem', fontWeight: 800 }}>Subtotal: S/ {formatMoney(line.lineFinal || 0)}</div>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 72px', gap: '6px' }}>
                                                            <select
                                                                value={discountMode}
                                                                onChange={(event) => {
                                                                    const mode = event.target.value;
                                                                    if (mode === 'none') {
                                                                        handleCurrentOptionDiscountEnabled(item.id, false);
                                                                        return;
                                                                    }
                                                                    handleCurrentOptionDiscountEnabled(item.id, true);
                                                                    handleCurrentOptionDiscountType(item.id, mode);
                                                                }}
                                                                style={{ background: controlSurface, border: `1px solid ${controlBorder}`, color: primaryText, borderRadius: '8px', padding: '6px 7px', fontSize: '0.72rem' }}
                                                            >
                                                                <option value="none">Sin desc.</option>
                                                                <option value="percent">Desc. %</option>
                                                                <option value="amount">Desc. S/</option>
                                                            </select>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={discountMode === 'percent' ? 100 : undefined}
                                                                step={discountMode === 'percent' ? '1' : '0.01'}
                                                                value={discountMode === 'none' ? 0 : line.lineDiscountValue}
                                                                disabled={discountMode === 'none'}
                                                                onChange={(event) => handleCurrentOptionDiscountValue(item.id, event.target.value)}
                                                                style={{ background: controlSurface, border: `1px solid ${controlBorder}`, color: primaryText, borderRadius: '8px', padding: '6px 7px', fontSize: '0.72rem', opacity: discountMode === 'none' ? 0.6 : 1 }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div style={{ background: cardAltSurface, border: `1px solid ${cardBorder}`, borderRadius: '10px', padding: '9px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: secondaryText, fontSize: '0.75rem' }}>
                                            <span>Subtotal</span>
                                            <strong style={{ color: primaryText }}>S/ {formatMoney(currentOptionPricing.regularSubtotalTotal || 0)}</strong>
                                        </div>
                                        <label style={{ display: 'grid', gridTemplateColumns: '1fr 86px', gap: '7px', alignItems: 'center', color: secondaryText, fontSize: '0.74rem' }}>
                                            Descuento total (S/)
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={Number(currentOption?.descuentoGlobal || 0) || 0}
                                                onChange={(event) => updateCurrentOptionPricing({ descuentoGlobal: Math.max(0, parseMoney(event.target.value, 0)) })}
                                                style={{ background: controlSurface, border: `1px solid ${controlBorder}`, color: primaryText, borderRadius: '8px', padding: '6px 7px', fontSize: '0.72rem' }}
                                            />
                                        </label>
                                        <label style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: '7px', alignItems: 'center', color: secondaryText, fontSize: '0.74rem' }}>
                                            Delivery
                                            <select
                                                value={currentOptionDelivery.type === 'amount' ? String(currentOptionDelivery.amount || 0) : 'free'}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    updateCurrentOptionPricing({
                                                        delivery: value === 'free'
                                                            ? { type: 'free', amount: 0 }
                                                            : { type: 'amount', amount: value === 'other' ? Number(currentOptionDelivery.amount || 0) || 0 : Number(value || 0) }
                                                    });
                                                }}
                                                style={{ background: controlSurface, border: `1px solid ${controlBorder}`, color: primaryText, borderRadius: '8px', padding: '6px 7px', fontSize: '0.72rem' }}
                                            >
                                                <option value="free">Gratuito</option>
                                                <option value="8.5">S/ 8.50</option>
                                                <option value="10">S/ 10.00</option>
                                                <option value="15">S/ 15.00</option>
                                                <option value="other">Otro</option>
                                            </select>
                                        </label>
                                        {currentOptionDelivery.type === 'amount' && ![8.5, 10, 15].includes(Number(currentOptionDelivery.amount || 0)) && (
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={Number(currentOptionDelivery.amount || 0) || 0}
                                                onChange={(event) => updateCurrentOptionPricing({ delivery: { type: 'amount', amount: Math.max(0, parseMoney(event.target.value, 0)) } })}
                                                placeholder="Monto delivery"
                                                style={{ background: controlSurface, border: `1px solid ${controlBorder}`, color: primaryText, borderRadius: '8px', padding: '7px 8px', fontSize: '0.74rem' }}
                                            />
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: secondaryText, fontSize: '0.75rem' }}>
                                            <span>Descuento</span>
                                            <strong style={{ color: successText }}>- S/ {formatMoney(currentOptionPricing.totalDiscountForQuote || 0)}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: secondaryText, fontSize: '0.75rem' }}>
                                            <span>Delivery</span>
                                            <strong style={{ color: primaryText }}>{currentOptionPricing.deliveryFee > 0 ? `S/ ${formatMoney(currentOptionPricing.deliveryFee)}` : 'Gratuito'}</strong>
                                        </div>
                                        <div style={{ borderTop: `1px solid ${cardBorder}`, paddingTop: '8px', display: 'flex', justifyContent: 'space-between', color: primaryText, fontSize: '0.92rem', fontWeight: 900 }}>
                                            <span>Total</span>
                                            <span>S/ {formatMoney(currentOptionPricing.cartTotal || 0)}</span>
                                        </div>
                                    </div>
                                </div>
                                )}

                                <div style={{ position: 'sticky', bottom: 0, zIndex: 5, background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '14px', padding: '10px', boxShadow: '0 -8px 22px rgba(15, 23, 42, 0.08)', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button type="button" onClick={() => setWizardPatch({ phase: 'catalog', pasoActual: activeOptionNumber + 1 })} style={neutralActionStyle}>
                                        Volver al catálogo
                                    </button>
                                    <button
                                        type="button"
                                        disabled={currentOptionProducts.length === 0}
                                        onClick={confirmCurrentOptionAndContinue}
                                        style={{
                                            ...primaryActionStyle,
                                            justifyContent: 'center',
                                            padding: '9px 13px',
                                            borderRadius: '12px',
                                            opacity: currentOptionProducts.length > 0 ? 1 : 0.55,
                                            cursor: currentOptionProducts.length > 0 ? 'pointer' : 'not-allowed'
                                        }}
                                    >
                                        {activeOptionNumber < safeTotalOpciones
                                            ? `Confirmar - pasar a Opción ${activeOptionNumber + 1}`
                                            : 'Confirmar - revisar todo'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {safePhase === 'review' && (
                            <QuoteOptionReview
                                socket={socket}
                                options={reviewOptionsData}
                                totalOptions={safeTotalOpciones}
                                chatId={activeChatId}
                                tenantId={tenantId}
                                onSent={() => {
                                    if (typeof onResetQuoteOptionsWizard === 'function') {
                                        onResetQuoteOptionsWizard();
                                        return;
                                    }
                                    setWizardPatch({ modoOpciones: false, phase: 'config', currentOption: 1, pasoActual: 1, opciones: [], mensajeFinal: '' });
                                }}
                                onBack={() => setWizardPatch({ phase: 'cart', currentOption: safeTotalOpciones, pasoActual: safeTotalOpciones + 1 })}
                            />
                        )}

                        {false && safePhase === 'review' && (
                            <div style={{ background: cardSurface, border: `1px solid ${cardBorder}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '180px' }}>
                                <div style={{ color: primaryText, fontSize: '0.95rem', fontWeight: 900 }}>
                                    Revisar opciones
                                </div>
                                <div style={{ color: secondaryText, fontSize: '0.78rem', lineHeight: 1.55 }}>
                                    Las opciones ya estan confirmadas. La revision y confirmacion final se completan en el siguiente bloque.
                                </div>
                                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                    <button type="button" onClick={() => setWizardPatch({ phase: 'cart', currentOption: safeTotalOpciones, pasoActual: safeTotalOpciones + 1 })} style={neutralActionStyle}>
                                        Editar última opción
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : showCatalogForm ? (
                    <BusinessCatalogProductForm
                        editingProduct={editingProduct}
                        formData={formData}
                        setFormData={setFormData}
                        activeCatalogId={activeCatalogId}
                        imageUploadBusy={imageUploadBusy}
                        imageUploadError={imageUploadError}
                        onImageFileChange={handleCatalogImageFileChange}
                        onSubmit={handleSubmit}
                        onCancel={() => {
                            setImageUploadError('');
                            setShowForm(false);
                        }}
                    />
                ) : (
                    <>
                        {visibleCatalog.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 15px', color: secondaryText }}>
                                <Package size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto', color: secondaryText }} />
                                <div style={{ fontSize: '0.875rem', marginBottom: '6px' }}>Catalogo vacio</div>
                                <div style={{ fontSize: '0.78rem', opacity: 0.7, lineHeight: '1.5' }}>
                                    Si tu catalogo nativo no aparece, Cloud API no lo esta exponiendo en esta sesion.
                                </div>
                            </div>
                        ) : (
                            visibleCatalog.map((item, i) => (
                                <BusinessCatalogProductCard
                                    key={item.id || i}
                                    item={item}
                                    index={i}
                                    cartItems={cartItems}
                                    onCatalogQtyDelta={onCatalogQtyDelta}
                                    addToCart={addToCart}
                                    sendCatalogProduct={sendCatalogProduct}
                                    canWriteByAssignment={canWriteByAssignment}
                                    chatCatalogReadOnly={chatCatalogReadOnly}
                                    isExternalCatalog={isExternalCatalog}
                                    handleEditClick={handleEditClick}
                                    handleDelete={handleDelete}
                                    formatMoney={formatMoney}
                                />
                            ))
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default CatalogTab;













