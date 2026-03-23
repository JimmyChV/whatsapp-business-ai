import { Check, Minus, Package, Plus, Send, ShoppingCart } from 'lucide-react';

export default function BusinessCatalogProductCard({
    item,
    index,
    cartItems = [],
    onCatalogQtyDelta,
    addToCart,
    sendCatalogProduct,
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

    return (
        <div style={{ background: '#1b2730', borderRadius: '11px', border: '1px solid #2a3a45', padding: '8px', display: 'grid', gridTemplateColumns: '74px 1fr', gap: '8px', alignItems: 'start' }}>
            <div style={{ width: '74px', height: '74px', borderRadius: '9px', background: '#2a3942', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                {item.imageUrl
                    ? <img src={item.imageUrl} alt={item.title || 'Producto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Package size={24} color="#98adba" />}
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'flex-start' }}>
                <div style={{ fontSize: '0.84rem', color: '#eef5f9', fontWeight: 700, lineHeight: 1.24, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {String(item.title || `Producto ${index + 1}`)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    {hasDiscount && (
                        <span style={{ fontSize: '0.72rem', color: '#8fa1ad', textDecoration: 'line-through' }}>S/ {formatMoney(regularPrice)}</span>
                    )}
                    {hasDiscount && (
                        <span style={{ fontSize: '0.7rem', color: '#d5fff4', background: 'rgba(0,168,132,0.26)', border: '1px solid rgba(0,168,132,0.44)', borderRadius: '999px', padding: '2px 7px', fontWeight: 700 }}>
                            -{effectiveDiscount.toFixed(effectiveDiscount % 1 === 0 ? 0 : 1)}%
                        </span>
                    )}
                </div>

                <div style={{ fontSize: '1rem', color: '#00d7ad', fontWeight: 800 }}>
                    {finalPrice > 0 ? `S/ ${formatMoney(finalPrice)}` : 'Precio: Consultar'}
                </div>

                {inCart && (
                    <div style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: '#d9fff4', background: 'rgba(0,168,132,0.22)', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '999px', padding: '3px 8px', fontWeight: 700 }}>
                        <Check size={11} />
                        En carrito: {cartQty}
                    </div>
                )}

                <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px', alignItems: 'stretch' }}>
                    <button
                        onClick={() => sendCatalogProduct(item, index)}
                        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', background: '#17323f', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '9px', color: '#d6f7ee', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                        <Send size={12} /> Enviar
                    </button>
                    {inCart ? (
                        <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#0f322b', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '9px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                            <button
                                onClick={() => onCatalogQtyDelta && onCatalogQtyDelta(item.id, -1)}
                                style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#20423a', border: 'none', cursor: 'pointer', color: '#d6f7ee', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                                <Minus size={11} />
                            </button>
                            <span style={{ minWidth: '20px', textAlign: 'center', color: '#d9fff4', fontSize: '0.78rem', fontWeight: 800 }}>{cartQty}</span>
                            <button
                                onClick={() => onCatalogQtyDelta && onCatalogQtyDelta(item.id, 1)}
                                style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#00a884', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                                <Plus size={11} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => addToCart(item, 1)}
                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', background: 'linear-gradient(90deg, #00a884 0%, #02c39a 100%)', border: 'none', borderRadius: '9px', color: 'white', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                            <ShoppingCart size={12} /> Carrito
                        </button>
                    )}
                </div>

                {!chatCatalogReadOnly && !isExternalCatalog && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', alignItems: 'stretch' }}>
                        <button onClick={() => handleEditClick(item)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#23323c', border: '1px solid rgba(255,255,255,0.13)', borderRadius: '8px', color: '#d8e6ef', cursor: 'pointer', fontSize: '0.71rem', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Editar
                        </button>
                        <button onClick={() => handleDelete(item.id)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#2e1f26', border: '1px solid rgba(220,74,95,0.45)', borderRadius: '8px', color: '#ffb8c7', cursor: 'pointer', fontSize: '0.71rem', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Eliminar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
