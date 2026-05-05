import { Check, Minus, Package, Plus, Send, ShoppingCart } from 'lucide-react';

export default function BusinessCatalogProductCard({
    item,
    index,
    cartItems = [],
    onCatalogQtyDelta,
    addToCart,
    sendCatalogProduct,
    canWriteByAssignment = false,
    chatCatalogReadOnly = true,
    isExternalCatalog = false,
    handleEditClick,
    handleDelete,
    formatMoney
}) {
    const finalPrice = Number.parseFloat(item.price || '0') || 0;
    const regularPrice = Number.parseFloat(item.regularPrice || item.price || '0') || finalPrice;
    const hasDiscount = regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice;
    const rawDiscount = Number.parseFloat(String(item.discountPct || 0));
    const effectiveDiscount = Number.isFinite(rawDiscount) && rawDiscount > 0
        ? rawDiscount
        : (hasDiscount ? Number((((regularPrice - finalPrice) / regularPrice) * 100).toFixed(1)) : 0);
    const cartLine = cartItems.find((cartItem) => String(cartItem?.id || '') === String(item?.id || ''));
    const cartQty = Math.max(0, Number(cartLine?.qty || 0));
    const inCart = cartQty > 0;
    const tone = {
        cardSurface: 'var(--chat-card-surface)',
        cardSurfaceAlt: 'var(--chat-card-surface-alt)',
        controlSurface: 'var(--chat-control-surface)',
        controlSurfaceStrong: 'var(--chat-control-surface-strong)',
        controlBorder: 'var(--chat-control-border)',
        textMuted: 'var(--chat-control-text-soft)',
        successSurface: 'var(--chat-success-surface)',
        successBorder: 'var(--chat-success-border)',
        successText: 'var(--chat-success-text)',
        infoSurface: 'var(--chat-info-surface)',
        infoBorder: 'var(--chat-info-border)',
        infoText: 'var(--chat-info-text)',
        dangerSurface: 'var(--chat-danger-soft)',
        dangerBorder: 'var(--chat-danger-border)',
        dangerText: 'var(--chat-danger-text)',
        priceText: 'var(--chat-price-text)'
    };

    return (
        <div style={{ background: tone.cardSurface, borderRadius: '11px', border: `1px solid ${tone.controlBorder}`, padding: '8px', display: 'grid', gridTemplateColumns: '74px 1fr', gap: '8px', alignItems: 'start' }}>
            <div style={{ width: '74px', height: '74px', borderRadius: '9px', background: tone.cardSurfaceAlt, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${tone.controlBorder}` }}>
                {item.imageUrl
                    ? <img src={item.imageUrl} alt={item.title || 'Producto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Package size={24} color="var(--chat-control-text-soft)" />}
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'flex-start' }}>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.24, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {String(item.title || `Producto ${index + 1}`)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    {hasDiscount && (
                        <span style={{ fontSize: '0.72rem', color: tone.textMuted, textDecoration: 'line-through' }}>S/ {formatMoney(regularPrice)}</span>
                    )}
                    {hasDiscount && (
                        <span style={{ fontSize: '0.7rem', color: tone.successText, background: tone.successSurface, border: `1px solid ${tone.successBorder}`, borderRadius: '999px', padding: '2px 7px', fontWeight: 700 }}>
                            -{effectiveDiscount.toFixed(effectiveDiscount % 1 === 0 ? 0 : 1)}%
                        </span>
                    )}
                </div>

                <div style={{ fontSize: '1rem', color: tone.priceText, fontWeight: 800 }}>
                    {finalPrice > 0 ? `S/ ${formatMoney(finalPrice)}` : 'Precio: Consultar'}
                </div>

                {inCart && (
                    <div style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: tone.successText, background: tone.successSurface, border: `1px solid ${tone.successBorder}`, borderRadius: '999px', padding: '3px 8px', fontWeight: 700 }}>
                        <Check size={11} />
                        En carrito: {cartQty}
                    </div>
                )}

                <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px', alignItems: 'stretch' }}>
                    <button
                        onClick={() => sendCatalogProduct(item, index)}
                        disabled={!canWriteByAssignment}
                        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', background: canWriteByAssignment ? tone.infoSurface : 'var(--chat-control-disabled)', border: `1px solid ${tone.infoBorder}`, borderRadius: '9px', color: canWriteByAssignment ? tone.infoText : 'var(--saas-text-inverse)', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', fontSize: '0.73rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: canWriteByAssignment ? 1 : 0.75 }}
                    >
                        <Send size={12} /> Enviar
                    </button>
                    {inCart ? (
                        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: tone.successSurface, border: `1px solid ${tone.successBorder}`, borderRadius: '9px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                            <button
                                onClick={() => onCatalogQtyDelta && onCatalogQtyDelta(item.id, -1)}
                                disabled={!canWriteByAssignment}
                                style={{ width: '22px', height: '22px', borderRadius: '50%', background: tone.controlSurfaceStrong, border: `1px solid ${tone.controlBorder}`, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: canWriteByAssignment ? 1 : 0.75 }}
                            >
                                <Minus size={11} />
                            </button>
                            <span style={{ minWidth: '20px', textAlign: 'center', color: tone.successText, fontSize: '0.78rem', fontWeight: 800 }}>{cartQty}</span>
                            <button
                                onClick={() => onCatalogQtyDelta && onCatalogQtyDelta(item.id, 1)}
                                disabled={!canWriteByAssignment}
                                style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--saas-accent-primary)', border: '1px solid color-mix(in srgb, var(--saas-accent-primary) 70%, transparent)', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', color: 'var(--saas-accent-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: canWriteByAssignment ? 1 : 0.75 }}
                            >
                                <Plus size={11} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => addToCart(item, 1)}
                            disabled={!canWriteByAssignment}
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', background: canWriteByAssignment ? 'var(--saas-accent-primary)' : 'var(--chat-control-disabled)', border: '1px solid color-mix(in srgb, var(--saas-accent-primary) 68%, transparent)', borderRadius: '9px', color: 'var(--saas-accent-primary-text)', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', fontSize: '0.73rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: canWriteByAssignment ? 1 : 0.75 }}
                        >
                            <ShoppingCart size={12} /> Carrito
                        </button>
                    )}
                </div>

                {!chatCatalogReadOnly && !isExternalCatalog && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', alignItems: 'stretch' }}>
                        <button onClick={() => handleEditClick(item)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: tone.controlSurface, border: `1px solid ${tone.controlBorder}`, borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.71rem', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Editar
                        </button>
                        <button onClick={() => handleDelete(item.id)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: tone.dangerSurface, border: `1px solid ${tone.dangerBorder}`, borderRadius: '8px', color: tone.dangerText, cursor: 'pointer', fontSize: '0.71rem', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Eliminar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
