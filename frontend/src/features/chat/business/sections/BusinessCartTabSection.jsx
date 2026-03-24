import { ChevronDown, ChevronUp, Minus, Plus, Send, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';

export default function BusinessCartTabSection({
    cart = [],
    orderImportStatus = null,
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
    sendQuoteToChat
}) {
    return (
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
    );
}
