import { ClipboardList, Minus, Plus, Send, ShoppingCart, Tag, Trash2, Truck } from 'lucide-react';

const clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));

const stepNames = ['Productos', 'Descuentos', 'Delivery', 'Resumen'];

const emptyFn = () => {};

export default function BusinessCartTabSection({
    cart = [],
    orderImportStatus = null,
    sourceOrder = null,
    sourceQuote = null,
    getLineBreakdown,
    removeFromCart,
    updateQty,
    updateItemDiscountEnabled,
    updateItemDiscountValue,
    updateItemDiscountType,
    updateItemExcludeFromGlobal = emptyFn,
    globalDiscountEnabled = false,
    setGlobalDiscountEnabled = emptyFn,
    setGlobalDiscountType = emptyFn,
    normalizedGlobalDiscountValue = 0,
    setGlobalDiscountValue = emptyFn,
    globalOnRegular = false,
    setGlobalOnRegular = emptyFn,
    deliveryType = 'free',
    setDeliveryType = emptyFn,
    safeDeliveryAmount = 0,
    setDeliveryAmount = emptyFn,
    formatMoney,
    subtotalProducts = 0,
    subtotalParticipants = 0,
    subtotalExcluded = 0,
    globalDiscountApplied = 0,
    deliveryFee = 0,
    cartTotal = 0,
    cartWizardStep = 1,
    setCartWizardStep = emptyFn,
    sendQuoteToChat,
    canWriteByAssignment = false,
    showSendQuoteAction = true,
    onBackToCatalog = null
}) {
    const step = Math.max(1, Math.min(4, Number(cartWizardStep || 1) || 1));
    const hasItems = cart.length > 0;
    const money = typeof formatMoney === 'function'
        ? formatMoney
        : ((value) => (Number(value) || 0).toFixed(1));

    const tone = {
        shellSurface: 'var(--chat-shell-panel-gradient-alt)',
        cardSurface: 'var(--chat-card-surface)',
        cardSurfaceAlt: 'var(--chat-card-surface-alt)',
        controlSurface: 'var(--chat-control-surface)',
        controlSurfaceStrong: 'var(--chat-control-surface-strong)',
        controlBorder: 'var(--chat-control-border)',
        textMuted: 'var(--chat-control-text-soft)',
        textSoft: 'var(--chat-control-text)',
        successSurface: 'var(--chat-success-surface)',
        successBorder: 'var(--chat-success-border)',
        successText: 'var(--chat-success-text)',
        warningSurface: 'var(--chat-warning-bg)',
        warningBorder: 'var(--chat-warning-border)',
        warningText: 'var(--chat-warning-text-strong)',
        dangerSurface: 'var(--chat-danger-soft)',
        dangerBorder: 'var(--chat-danger-border)',
        dangerText: 'var(--chat-danger-text)',
        totalText: 'var(--chat-price-text)'
    };

    const goStep = (nextStep) => {
        setCartWizardStep(Math.max(1, Math.min(4, Number(nextStep) || 1)));
    };

    const lineFor = (item) => {
        if (typeof getLineBreakdown !== 'function') return {};
        return getLineBreakdown(item) || {};
    };
    const isDeliveryFree = deliveryType === 'free' || deliveryType === 'gratuito' || deliveryType === 'none';

    const setLineDiscount = (item, value) => {
        const pct = clampPercent(value);
        updateItemDiscountType?.(item.id, 'percent');
        updateItemDiscountEnabled?.(item.id, pct > 0);
        updateItemDiscountValue?.(item.id, pct);
    };

    const header = (
        <div style={{
            background: tone.shellSurface,
            border: `1px solid ${tone.controlBorder}`,
            borderRadius: '12px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '0.96rem', color: 'var(--text-primary)' }}>
                        {stepNames[step - 1]} - Paso {step} de 4
                    </h3>
                    <p style={{ margin: '3px 0 0', color: tone.textMuted, fontSize: '0.72rem' }}>
                        Arma la cotizacion con calculo unico y revisa antes de enviar.
                    </p>
                </div>
                <span style={{
                    border: `1px solid ${tone.successBorder}`,
                    color: tone.successText,
                    background: tone.successSurface,
                    borderRadius: '999px',
                    padding: '4px 8px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap'
                }}>
                    {cart.length} item{cart.length === 1 ? '' : 's'}
                </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                {stepNames.map((name, index) => {
                    const active = index + 1 === step;
                    const done = index + 1 < step;
                    return (
                        <button
                            key={name}
                            type="button"
                            onClick={() => hasItems && goStep(index + 1)}
                            disabled={!hasItems}
                            style={{
                                border: `1px solid ${active || done ? tone.successBorder : tone.controlBorder}`,
                                background: active ? tone.successSurface : (done ? 'rgba(29,158,117,0.08)' : tone.controlSurface),
                                color: active || done ? tone.successText : tone.textMuted,
                                borderRadius: '999px',
                                padding: '5px 6px',
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                cursor: hasItems ? 'pointer' : 'not-allowed'
                            }}
                        >
                            {index + 1}. {name}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const notices = (
        <>
            {orderImportStatus?.text && (
                <div style={{
                    background: orderImportStatus.level === 'warn' ? tone.warningSurface : tone.successSurface,
                    border: orderImportStatus.level === 'warn' ? `1px solid ${tone.warningBorder}` : `1px solid ${tone.successBorder}`,
                    color: orderImportStatus.level === 'warn' ? tone.warningText : tone.successText,
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '0.74rem',
                    lineHeight: 1.4
                }}>
                    {orderImportStatus.text}
                </div>
            )}
            {(sourceOrder?.orderId || sourceOrder?.messageId) && (
                <div style={{ background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, color: tone.textSoft, borderRadius: '8px', padding: '8px 10px', fontSize: '0.74rem', lineHeight: 1.4 }}>
                    Pedido origen: <strong style={{ color: 'var(--text-primary)' }}>{sourceOrder.orderId || sourceOrder.messageId}</strong>
                </div>
            )}
            {sourceQuote?.quoteId && !orderImportStatus?.text && (
                <div style={{ background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, color: tone.textSoft, borderRadius: '8px', padding: '8px 10px', fontSize: '0.74rem', lineHeight: 1.4 }}>
                    Editando: <strong style={{ color: 'var(--text-primary)' }}>Cotizacion {sourceQuote.quoteNumber || ''}{Number(sourceQuote.revisionNumber || 0) > 1 ? ` (Rev. ${sourceQuote.revisionNumber})` : ''}</strong>
                </div>
            )}
        </>
    );

    const navButton = (label, onClick, variant = 'secondary', disabled = false, icon = null) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                border: `1px solid ${variant === 'primary' ? tone.successBorder : tone.controlBorder}`,
                background: variant === 'primary' ? tone.successSurface : tone.controlSurface,
                color: variant === 'primary' ? tone.successText : tone.textSoft,
                borderRadius: '999px',
                padding: '8px 12px',
                fontSize: '0.74rem',
                fontWeight: 900,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                opacity: disabled ? 0.55 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer'
            }}
        >
            {icon}
            {label}
        </button>
    );

    const renderEmpty = () => (
        <div style={{
            background: tone.cardSurface,
            border: `1px dashed ${tone.controlBorder}`,
            borderRadius: '14px',
            padding: '18px 12px',
            textAlign: 'center',
            color: tone.textMuted,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            alignItems: 'center'
        }}>
            <ShoppingCart size={28} />
            <strong style={{ color: 'var(--text-primary)' }}>No hay productos en el carrito</strong>
            <span style={{ fontSize: '0.75rem' }}>Agrega productos del catalogo para iniciar una cotizacion.</span>
            {typeof onBackToCatalog === 'function' && navButton('Ir al catalogo', onBackToCatalog, 'primary')}
        </div>
    );

    const renderProductStep = () => (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {typeof onBackToCatalog === 'function' && navButton('+ Seguir agregando', onBackToCatalog, 'secondary', false, <ShoppingCart size={14} />)}
            </div>
            {cart.map((item) => {
                const line = lineFor(item);
                const discountPct = Number(line.lineDiscountPct ?? line.lineDiscountValue ?? item.linDiscountPct ?? 0) || 0;
                const imageUrl = item.imageUrl || item.image_url || item.thumbnailUrl || item.thumbnail_url || '';
                return (
                    <div key={item.id} style={{
                        background: tone.cardSurface,
                        border: `1px solid ${tone.controlBorder}`,
                        borderRadius: '14px',
                        padding: '10px',
                        display: 'grid',
                        gridTemplateColumns: imageUrl ? '54px 1fr' : '1fr',
                        gap: '10px',
                        alignItems: 'start'
                    }}>
                        {imageUrl && (
                            <img src={imageUrl} alt={item.title || 'Producto'} style={{ width: '54px', height: '54px', objectFit: 'cover', borderRadius: '10px', background: tone.controlSurface }} />
                        )}
                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <div style={{ minWidth: 0 }}>
                                    <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.82rem', lineHeight: 1.25 }}>
                                        {item.title || item.productName || 'Producto'}
                                    </strong>
                                    <span style={{ color: tone.textMuted, fontSize: '0.7rem' }}>
                                        Precio: S/ {money(line.finalPrice ?? line.unitPrice ?? item.price)}
                                    </span>
                                    {item.sku && (
                                        <span style={{ display: 'block', color: tone.textMuted, fontSize: '0.66rem' }}>
                                            SKU: {item.sku}
                                        </span>
                                    )}
                                </div>
                                <button type="button" onClick={() => removeFromCart?.(item.id)} style={{ border: 'none', background: tone.dangerSurface, color: tone.dangerText, borderRadius: '10px', width: '32px', height: '32px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                                    <Trash2 size={15} />
                                </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px', alignItems: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: tone.controlSurface, border: `1px solid ${tone.controlBorder}`, borderRadius: '999px', padding: '4px' }}>
                                    <button type="button" onClick={() => updateQty?.(item.id, Math.max(1, Number(item.qty || 1) - 1))} style={{ border: 'none', background: tone.controlSurfaceStrong, borderRadius: '999px', width: '24px', height: '24px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                                        <Minus size={12} />
                                    </button>
                                    <strong style={{ minWidth: '18px', textAlign: 'center' }}>{line.qty || item.qty || 1}</strong>
                                    <button type="button" onClick={() => updateQty?.(item.id, Number(item.qty || 1) + 1)} style={{ border: 'none', background: tone.controlSurfaceStrong, borderRadius: '999px', width: '24px', height: '24px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                                        <Plus size={12} />
                                    </button>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: tone.textSoft, fontSize: '0.72rem' }}>
                                    Desc. linea
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={discountPct}
                                        onChange={(event) => setLineDiscount(item, event.target.value)}
                                        style={{ minWidth: 0, flex: 1, border: `1px solid ${tone.controlBorder}`, borderRadius: '8px', padding: '6px 7px', background: tone.controlSurface, color: 'var(--text-primary)' }}
                                    />
                                    %
                                </label>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: tone.textMuted, fontSize: '0.72rem' }}>
                    <span>{globalOnRegular ? 'Subtotal (precio regular)' : 'Subtotal'}</span>
                                <strong style={{ color: tone.totalText }}>S/ {money(line.lineFinal ?? line.subtotal ?? 0)}</strong>
                            </div>
                        </div>
                    </div>
                );
            })}
            <div style={{ background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, borderRadius: '12px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: tone.textMuted, fontSize: '0.76rem' }}>Subtotal productos</span>
                <strong style={{ color: tone.totalText }}>S/ {money(subtotalProducts)}</strong>
            </div>
        </>
    );

    const renderDiscountStep = () => (
        <>
            <div style={{ background: tone.cardSurface, border: `1px solid ${tone.controlBorder}`, borderRadius: '14px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Tag size={16} />
                    <strong>Exclusiones por producto</strong>
                </div>
                <p style={{ margin: 0, color: tone.textMuted, fontSize: '0.72rem' }}>
                    Marca productos que no participaran del descuento global.
                </p>
                {cart.map((item) => {
                    const line = lineFor(item);
                    const excluded = Boolean(line.excludeFromGlobal || item.excludeFromGlobal);
                    return (
                        <label key={item.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: '8px', alignItems: 'center', padding: '8px', borderRadius: '10px', background: excluded ? tone.warningSurface : tone.cardSurfaceAlt, border: `1px solid ${excluded ? tone.warningBorder : tone.controlBorder}`, cursor: 'pointer' }}>
                            <input type="checkbox" checked={excluded} onChange={(event) => updateItemExcludeFromGlobal(item.id, event.target.checked)} />
                            <span style={{ minWidth: 0 }}>
                                <strong style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-primary)' }}>{item.title || item.productName || 'Producto'}</strong>
                                <small style={{ color: tone.textMuted }}>S/ {money(line.lineFinal ?? line.subtotal ?? 0)}</small>
                            </span>
                            <small style={{ color: excluded ? tone.warningText : tone.textMuted, fontWeight: 800 }}>
                                {excluded ? 'Excluido' : 'Incluido'}
                            </small>
                        </label>
                    );
                })}
            </div>
            <div style={{ background: tone.cardSurface, border: `1px solid ${tone.controlBorder}`, borderRadius: '14px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontWeight: 800 }}>
                    <input type="checkbox" checked={Boolean(globalDiscountEnabled)} onChange={(event) => {
                        setGlobalDiscountEnabled(event.target.checked);
                        setGlobalDiscountType('percent');
                    }} />
                    Descuento global
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: tone.textSoft, fontSize: '0.74rem' }}>
                    Porcentaje
                    <input
                        type="number"
                        min="0"
                        max="100"
                        value={Number(normalizedGlobalDiscountValue || 0)}
                        disabled={!globalDiscountEnabled}
                        onChange={(event) => {
                            setGlobalDiscountType('percent');
                            setGlobalDiscountValue(clampPercent(event.target.value));
                        }}
                        style={{ flex: 1, border: `1px solid ${tone.controlBorder}`, borderRadius: '8px', padding: '7px 8px', background: tone.controlSurface, color: 'var(--text-primary)' }}
                    />
                    %
                </label>
                <div style={{ display: 'grid', gap: '6px' }}>
                    <label style={{ display: 'flex', gap: '7px', alignItems: 'center', color: tone.textSoft, fontSize: '0.72rem' }}>
                        <input type="radio" name="globalOnRegular" checked={!globalOnRegular} onChange={() => setGlobalOnRegular(false)} />
                        Aplicar sobre precio actual
                    </label>
                    <label style={{ display: 'flex', gap: '7px', alignItems: 'center', color: tone.textSoft, fontSize: '0.72rem' }}>
                        <input type="radio" name="globalOnRegular" checked={Boolean(globalOnRegular)} onChange={() => setGlobalOnRegular(true)} />
                        Aplicar sobre precio regular
                    </label>
                </div>
            </div>
            <div style={{ background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, borderRadius: '12px', padding: '10px', display: 'grid', gap: '6px', fontSize: '0.74rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Participan</span>
                    <strong>S/ {money(subtotalParticipants)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: tone.successText }}>
                    <span>Descuento global</span>
                    <strong>- S/ {money(globalDiscountApplied)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Excluidos</span>
                    <strong>S/ {money(subtotalExcluded)}</strong>
                </div>
            </div>
        </>
    );

    const renderDeliveryStep = () => (
        <div style={{ background: tone.cardSurface, border: `1px solid ${tone.controlBorder}`, borderRadius: '14px', padding: '12px', display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Truck size={17} />
                <strong>Delivery</strong>
            </div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px', borderRadius: '12px', border: `1px solid ${isDeliveryFree ? tone.successBorder : tone.controlBorder}`, background: isDeliveryFree ? tone.successSurface : tone.cardSurfaceAlt, cursor: 'pointer' }}>
                <input type="radio" name="deliveryType" checked={isDeliveryFree} onChange={() => setDeliveryType('free')} />
                <span>
                    <strong style={{ display: 'block' }}>Delivery gratuito</strong>
                    <small style={{ color: tone.textMuted }}>No suma costo al total.</small>
                </span>
            </label>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px', borderRadius: '12px', border: `1px solid ${deliveryType === 'amount' ? tone.successBorder : tone.controlBorder}`, background: deliveryType === 'amount' ? tone.successSurface : tone.cardSurfaceAlt, cursor: 'pointer' }}>
                <input type="radio" name="deliveryTypeAmount" checked={deliveryType === 'amount'} onChange={() => setDeliveryType('amount')} />
                <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>Delivery con monto</strong>
                    <input
                        type="number"
                        min="0"
                        value={Number(safeDeliveryAmount || 0)}
                        disabled={deliveryType !== 'amount'}
                        onChange={(event) => {
                            setDeliveryType('amount');
                            setDeliveryAmount(Math.max(0, Number(event.target.value) || 0));
                        }}
                        style={{ marginTop: '6px', width: '100%', border: `1px solid ${tone.controlBorder}`, borderRadius: '8px', padding: '7px 8px', background: tone.controlSurface, color: 'var(--text-primary)' }}
                    />
                </span>
            </label>
        </div>
    );

    const renderSummaryStep = () => (
        <>
            <div style={{ background: 'rgba(37,211,102,0.13)', border: '1px dashed rgba(0,0,0,0.12)', borderRadius: '16px', padding: '12px', display: 'grid', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--text-primary)' }}>
                    <ClipboardList size={17} />
                    <strong>Vista previa de cotizacion</strong>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                    {cart.map((item) => {
                        const line = lineFor(item);
                        const discountPct = Number(line.lineDiscountPct || 0) || 0;
                        const excluded = Boolean(line.excludeFromGlobal || item.excludeFromGlobal);
                        return (
                            <div key={item.id} style={{ background: 'rgba(255,255,255,0.58)', borderRadius: '12px', padding: '9px', display: 'grid', gap: '4px' }}>
                                <strong style={{ fontSize: '0.78rem' }}>{item.title || item.productName || 'Producto'} x {line.qty || item.qty || 1}</strong>
                                {item.sku && <small style={{ color: tone.textMuted }}>SKU: {item.sku}</small>}
                                {discountPct > 0 && <small style={{ color: tone.successText }}>Desc. linea: {discountPct}%</small>}
                                {excluded && <small style={{ color: tone.warningText }}>No participa del descuento global</small>}
                                <strong style={{ justifySelf: 'end', color: tone.totalText }}>S/ {money(line.lineFinal ?? line.subtotal ?? 0)}</strong>
                            </div>
                        );
                    })}
                </div>
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '8px', display: 'grid', gap: '5px', fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Subtotal</span>
                        <strong>S/ {money(subtotalProducts)}</strong>
                    </div>
                    {globalDiscountApplied > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: tone.successText }}>
                            <span>Descuento global{Number(normalizedGlobalDiscountValue || 0) > 0 ? ` (${Number(normalizedGlobalDiscountValue || 0)}%)` : ''}</span>
                            <strong>- S/ {money(globalDiscountApplied)}</strong>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Delivery</span>
                        <strong>{deliveryFee > 0 ? `S/ ${money(deliveryFee)}` : 'Gratuito'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: tone.totalText }}>
                        <strong>Total a pagar</strong>
                        <strong>S/ {money(cartTotal)}</strong>
                    </div>
                </div>
            </div>
            <p style={{ margin: 0, color: tone.textMuted, fontSize: '0.72rem' }}>
                Si necesitas ajustar productos, descuentos o delivery, vuelve a editar antes de enviar.
            </p>
        </>
    );

    const renderStep = () => {
        if (!hasItems) return renderEmpty();
        if (step === 1) return renderProductStep();
        if (step === 2) return renderDiscountStep();
        if (step === 3) return renderDeliveryStep();
        return renderSummaryStep();
    };

    return (
        <div className="cart-tab-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="cart-tab-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notices}
                {header}
                <div style={{ animation: 'cartWizardFade 160ms ease-out', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {renderStep()}
                </div>
            </div>
            <div style={{ borderTop: `1px solid ${tone.controlBorder}`, padding: '8px', background: 'var(--chat-shell-panel-surface)', display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: tone.textMuted, fontSize: '0.74rem' }}>
                    <span>Total</span>
                    <strong style={{ color: tone.totalText, fontSize: '1rem' }}>S/ {money(cartTotal)}</strong>
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                    {step > 1
                        ? navButton('Atras', () => goStep(step - 1), 'secondary')
                        : (typeof onBackToCatalog === 'function' ? navButton('Catalogo', onBackToCatalog, 'secondary') : <span />)}
                    {step < 4 && navButton('Siguiente', () => goStep(step + 1), 'primary', !hasItems)}
                    {step === 4 && (
                        <>
                            {navButton('Editar', () => goStep(1), 'secondary', !hasItems)}
                            {showSendQuoteAction && navButton('Enviar cotizacion', sendQuoteToChat, 'primary', !hasItems || !canWriteByAssignment, <Send size={14} />)}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
