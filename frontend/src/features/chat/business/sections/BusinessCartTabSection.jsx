import { ChevronDown, ChevronUp, Minus, Plus, Send, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';

export default function BusinessCartTabSection({
    cart = [],
    orderImportStatus = null,
    sourceOrder = null,
    getLineBreakdown,
    removeFromCart,
    updateQty,
    updateItemDiscountEnabled,
    updateItemDiscountValue,
    updateItemDiscountType,
    showOrderAdjustments = false,
    setShowOrderAdjustments,
    globalDiscountEnabled = false,
    setGlobalDiscountEnabled,
    globalDiscountType = 'percent',
    setGlobalDiscountType,
    normalizedGlobalDiscountValue = 0,
    setGlobalDiscountValue,
    parseMoney,
    deliveryType = 'free',
    setDeliveryType,
    safeDeliveryAmount = 0,
    setDeliveryAmount,
    showCartTotalsBreakdown = true,
    setShowCartTotalsBreakdown,
    formatMoney,
    regularSubtotalTotal = 0,
    totalDiscountForQuote = 0,
    subtotalAfterGlobal = 0,
    deliveryFee = 0,
    cartTotal = 0,
    sendQuoteToChat,
    canWriteByAssignment = false
}) {
    const tone = {
        warningSurface: 'var(--chat-warning-bg)',
        warningBorder: 'var(--chat-warning-border)',
        warningText: 'var(--chat-warning-text-strong)',
        successSurface: 'var(--chat-success-surface)',
        successBorder: 'var(--chat-success-border)',
        successText: 'var(--chat-success-text)',
        shellSurface: 'var(--chat-shell-panel-gradient-alt)',
        cardSurface: 'var(--chat-card-surface)',
        cardSurfaceAlt: 'var(--chat-card-surface-alt)',
        controlSurface: 'var(--chat-control-surface)',
        controlSurfaceStrong: 'var(--chat-control-surface-strong)',
        controlBorder: 'var(--chat-control-border)',
        textMuted: 'var(--chat-control-text-soft)',
        textSoft: 'var(--chat-control-text)',
        dangerSurface: 'var(--chat-danger-soft)',
        dangerBorder: 'var(--chat-danger-border)',
        dangerText: 'var(--chat-danger-text)',
        totalText: 'var(--chat-price-text)'
    };
    return (
        <div className="cart-tab-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="cart-tab-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {orderImportStatus?.text && (
                    <div style={{ background: orderImportStatus.level === 'warn' ? tone.warningSurface : tone.successSurface, border: orderImportStatus.level === 'warn' ? `1px solid ${tone.warningBorder}` : `1px solid ${tone.successBorder}`, color: orderImportStatus.level === 'warn' ? tone.warningText : tone.successText, borderRadius: '8px', padding: '8px 10px', fontSize: '0.74rem', lineHeight: 1.4 }}>
                        {orderImportStatus.text}
                    </div>
                )}
                {(sourceOrder?.orderId || sourceOrder?.messageId) && (
                    <div style={{ background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, color: tone.textSoft, borderRadius: '8px', padding: '8px 10px', fontSize: '0.74rem', lineHeight: 1.4 }}>
                        Pedido origen: <strong style={{ color: 'var(--text-primary)' }}>{sourceOrder.orderId || sourceOrder.messageId}</strong>
                    </div>
                )}

                {cart.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 15px', color: tone.textMuted }}>
                        <ShoppingCart size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto' }} />
                        <div style={{ fontSize: '0.875rem' }}>Carrito vacio</div>
                        <div style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: '6px' }}>Agrega productos desde el Catalogo</div>
                    </div>
                ) : (
                    cart.map((item, i) => {
                        const line = getLineBreakdown(item);
                        const lineDiscountMode = line.lineDiscountEnabled ? (line.lineDiscountType === 'amount' ? 'amount' : 'percent') : 'none';
                        return (
                            <div key={item.id || i} className="business-cart-item-card" style={{ background: tone.cardSurface, borderRadius: '9px', border: `1px solid ${tone.controlBorder}`, padding: '7px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <div className="business-cart-item-card__header" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px', alignItems: 'start' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div className="business-cart-item-card__title" title={item.title} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                                        {(line.regularSubtotal > line.lineFinal || line.includedDiscount > 0 || line.additionalDiscountApplied > 0) && (
                                            <div className="business-cart-item-card__badges" style={{ marginTop: '2px', fontSize: '0.68rem', color: tone.textMuted, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {line.regularSubtotal > line.lineFinal && <span>Regular: S/ {formatMoney(line.regularSubtotal)}</span>}
                                                {line.includedDiscount > 0 && <span style={{ color: tone.successText }}>Kit: -S/ {formatMoney(line.includedDiscount)}</span>}
                                                {line.additionalDiscountApplied > 0 && <span style={{ color: tone.successText }}>Linea: -S/ {formatMoney(line.additionalDiscountApplied)}</span>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="business-cart-item-card__price" style={{ textAlign: 'right', minWidth: '88px' }}>
                                        <div style={{ fontSize: '0.66rem', color: tone.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Precio final</div>
                                        <div style={{ fontSize: '0.96rem', color: tone.totalText, fontWeight: 800, lineHeight: 1.1 }}>S/ {formatMoney(line.lineFinal)}</div>
                                    </div>
                                </div>

                                <div className="business-cart-item-card__controls" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, borderRadius: '8px', padding: '5px 6px' }}>
                                    <div className="business-cart-item-card__qty" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                                        <button disabled={!canWriteByAssignment} onClick={() => (line.qty <= 1 ? removeFromCart(item.id) : updateQty(item.id, -1))} style={{ width: '21px', height: '21px', borderRadius: '50%', background: tone.controlSurfaceStrong, border: `1px solid ${tone.controlBorder}`, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canWriteByAssignment ? 1 : 0.75 }}><Minus size={9} /></button>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700, minWidth: '18px', textAlign: 'center' }}>{line.qty}</span>
                                        <button disabled={!canWriteByAssignment} onClick={() => updateQty(item.id, 1)} style={{ width: '21px', height: '21px', borderRadius: '50%', background: 'var(--saas-accent-primary)', border: '1px solid color-mix(in srgb, var(--saas-accent-primary) 74%, transparent)', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', color: 'var(--saas-accent-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canWriteByAssignment ? 1 : 0.75 }}><Plus size={9} /></button>
                                        <button disabled={!canWriteByAssignment} onClick={() => removeFromCart(item.id)} title="Eliminar" style={{ width: '21px', height: '21px', borderRadius: '50%', background: tone.dangerSurface, border: `1px solid ${tone.dangerBorder}`, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', color: tone.dangerText, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canWriteByAssignment ? 1 : 0.75 }}>
                                            <Trash2 size={11} />
                                        </button>
                                    </div>

                                    <div className="business-cart-item-card__discounts" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px', minWidth: 0, flex: '1 1 180px', flexWrap: 'wrap' }}>
                                        <select
                                            value={lineDiscountMode}
                                            disabled={!canWriteByAssignment}
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
                                            style={{ background: tone.controlSurface, border: `1px solid ${tone.controlBorder}`, color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 6px', fontSize: '0.74rem', outline: 'none', minWidth: '92px', maxWidth: '100%', opacity: canWriteByAssignment ? 1 : 0.75, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
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
                                                disabled={!canWriteByAssignment}
                                                onChange={e => updateItemDiscountValue(item.id, e.target.value)}
                                                placeholder="0"
                                                style={{ width: '70px', maxWidth: '100%', background: tone.controlSurface, border: `1px solid ${tone.controlBorder}`, color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 6px', fontSize: '0.74rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.75, cursor: canWriteByAssignment ? 'text' : 'not-allowed' }}
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
                <div className="cart-tab-footer" style={{ padding: '10px 9px', borderTop: '1px solid var(--border-color)', background: tone.shellSurface, display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
                    <button
                        type="button"
                        disabled={!canWriteByAssignment}
                        onClick={() => setShowOrderAdjustments(prev => !prev)}
                        style={{ width: '100%', background: 'linear-gradient(90deg, var(--chat-success-surface), color-mix(in srgb, var(--chat-info-surface) 72%, var(--chat-card-surface-alt)))', border: `1px solid ${tone.successBorder}`, color: tone.successText, borderRadius: '9px', padding: '9px 10px', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--saas-accent-primary) 16%, transparent)', opacity: canWriteByAssignment ? 1 : 0.75 }}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Sparkles size={13} /> Ajustes de pago y envio</span>
                        {showOrderAdjustments ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {showOrderAdjustments && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontSize: '0.78rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={globalDiscountEnabled} disabled={!canWriteByAssignment} onChange={e => setGlobalDiscountEnabled(e.target.checked)} />
                                    Aplicar descuento global
                                </label>

                                {globalDiscountEnabled && (
                                    <div className="business-cart-adjustments-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                                        <select
                                            value={globalDiscountType}
                                            disabled={!canWriteByAssignment}
                                            onChange={e => setGlobalDiscountType(e.target.value === 'amount' ? 'amount' : 'percent')}
                                            style={{ background: tone.controlSurface, border: `1px solid ${tone.controlBorder}`, color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.75, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
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
                                            disabled={!canWriteByAssignment}
                                            onChange={e => setGlobalDiscountValue(Math.max(0, parseMoney(e.target.value, 0)))}
                                            style={{ background: tone.controlSurface, border: `1px solid ${tone.controlBorder}`, color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.75, cursor: canWriteByAssignment ? 'text' : 'not-allowed' }}
                                        />
                                    </div>
                                )}
                            </div>

                            <div style={{ background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '0.75rem', color: tone.textMuted }}>Delivery / envio</div>
                                <div className="business-cart-adjustments-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                                    <select
                                        value={deliveryType}
                                        disabled={!canWriteByAssignment}
                                        onChange={e => setDeliveryType(e.target.value === 'amount' ? 'amount' : 'free')}
                                        style={{ background: tone.controlSurface, border: `1px solid ${tone.controlBorder}`, color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none', opacity: canWriteByAssignment ? 1 : 0.75, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
                                    >
                                        <option value="free">Gratuito</option>
                                        <option value="amount">Con monto</option>
                                    </select>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={deliveryType === 'amount' ? safeDeliveryAmount : 0}
                                        disabled={deliveryType !== 'amount' || !canWriteByAssignment}
                                        onChange={e => setDeliveryAmount(Math.max(0, parseMoney(e.target.value, 0)))}
                                        style={{ background: deliveryType === 'amount' && canWriteByAssignment ? tone.controlSurface : tone.controlSurfaceStrong, border: `1px solid ${tone.controlBorder}`, color: deliveryType === 'amount' && canWriteByAssignment ? 'var(--text-primary)' : tone.textMuted, borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none', cursor: canWriteByAssignment ? 'text' : 'not-allowed', opacity: canWriteByAssignment ? 1 : 0.75 }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ background: tone.cardSurfaceAlt, border: `1px solid ${tone.controlBorder}`, borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <button
                            type="button"
                            disabled={!canWriteByAssignment}
                            onClick={() => setShowCartTotalsBreakdown((prev) => !prev)}
                            style={{ width: '100%', background: 'transparent', border: `1px dashed ${tone.controlBorder}`, color: 'var(--text-primary)', borderRadius: '7px', padding: '6px 8px', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', fontSize: '0.74rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: canWriteByAssignment ? 1 : 0.75 }}
                        >
                            <span>Resumen de total</span>
                            {showCartTotalsBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {showCartTotalsBreakdown && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                                    <span>Subtotal</span>
                                    <span>S/ {formatMoney(regularSubtotalTotal)}</span>
                                </div>
                                {totalDiscountForQuote > 0 && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: tone.textMuted }}>
                                            <span>Descuento</span>
                                            <span>- S/ {formatMoney(totalDiscountForQuote)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: tone.textMuted }}>
                                            <span>Total con descuento</span>
                                            <span>S/ {formatMoney(subtotalAfterGlobal)}</span>
                                        </div>
                                    </>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: tone.textMuted }}>
                                    <span>Delivery</span>
                                    <span>{deliveryFee > 0 ? `S/ ${formatMoney(deliveryFee)}` : 'Gratuito'}</span>
                                </div>
                            </>
                        )}

                        <div style={{ marginTop: '2px', paddingTop: '6px', borderTop: `1px solid ${tone.controlBorder}`, display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, color: tone.totalText }}>
                            <span>TOTAL A PAGAR</span>
                            <span>S/ {formatMoney(cartTotal)}</span>
                        </div>
                    </div>

                    <button
                        onClick={sendQuoteToChat}
                        disabled={!canWriteByAssignment}
                        style={{ width: '100%', padding: '9px', background: canWriteByAssignment ? 'var(--saas-accent-primary)' : 'var(--chat-control-disabled)', border: '1px solid color-mix(in srgb, var(--saas-accent-primary) 60%, transparent)', borderRadius: '8px', color: 'var(--saas-accent-primary-text)', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: canWriteByAssignment ? 1 : 0.75 }}
                    >
                        <Send size={15} /> Enviar cotizacion al cliente
                    </button>
                </div>
            )}
        </div>
    );
}
