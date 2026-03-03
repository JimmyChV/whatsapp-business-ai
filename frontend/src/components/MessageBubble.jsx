import React from 'react';
import moment from 'moment';
import { Check, CheckCheck, ShoppingBag } from 'lucide-react';

const MessageBubble = ({ msg, onPrefillMessage }) => {
    const isOut = msg.fromMe;

    // Check if message is a catalog item
    const isCatalogItem = msg.body && msg.body.includes('REF:');
    const catalogMatch = isCatalogItem ? msg.body.match(/REF: (.*)\nPrecio: (.*)/) : null;
    const productTitle = catalogMatch ? catalogMatch[1] : null;
    const productPrice = catalogMatch ? catalogMatch[2] : null;

    const hasOrder = Boolean(msg?.order);
    const orderItems = Array.isArray(msg?.order?.products) ? msg.order.products : [];

    const renderStatus = () => {
        if (!isOut) return null;
        const color = msg.ack === 3 ? '#53bdeb' : 'rgba(233, 237, 239, 0.6)';
        return (
            <span style={{ display: 'flex', color }}>
                {msg.ack >= 2 ? <CheckCheck size={16} /> : <Check size={16} />}
            </span>
        );
    };

    return (
        <div className={`message ${isOut ? 'out' : 'in'}`}>
            {isCatalogItem && (
                <div className="catalog-card">
                    <img src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=300&auto=format&fit=crop" alt="Producto" />
                    <div className="catalog-card-info">
                        <div className="catalog-card-title">{productTitle}</div>
                        <div className="catalog-card-price">{productPrice}</div>
                    </div>
                    <button className="catalog-card-btn" onClick={() => window.open('https://wa.me/c/51933657188')}>
                        <ShoppingBag size={16} /> Ver artículo
                    </button>
                </div>
            )}

            {msg.hasMedia && msg.mediaData && msg.mimetype?.startsWith('image/') && (
                <img
                    src={`data:${msg.mimetype};base64,${msg.mediaData}`}
                    className="message-media"
                    alt="Media"
                    style={{
                        borderRadius: '6px',
                        marginBottom: '4px',
                        maxWidth: '100%',
                        cursor: 'zoom-in',
                        display: 'block'
                    }}
                    onClick={() => window.open(`data:${msg.mimetype};base64,${msg.mediaData}`)}
                />
            )}

            {msg.hasMedia && msg.mediaData && msg.mimetype?.startsWith('audio/') && (
                <audio
                    src={`data:${msg.mimetype};base64,${msg.mediaData}`}
                    controls
                    className="media-audio"
                    style={{ marginBottom: '4px' }}
                />
            )}


            {hasOrder && (
                <div style={{
                    background: 'rgba(0,168,132,0.12)',
                    border: '1px solid rgba(0,168,132,0.3)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    marginBottom: '6px'
                }}>
                    <div style={{ fontSize: '0.78rem', color: '#00a884', fontWeight: 700, marginBottom: '4px' }}>
                        🛒 Carrito/Pedido del cliente
                    </div>
                    {msg?.order?.orderId && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginBottom: '4px' }}>ID: {msg.order.orderId}</div>
                    )}
                    {orderItems.length > 0 ? orderItems.slice(0, 8).map((item, idx) => (
                        <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {item.name} x{item.quantity || 1}</span>
                            <span style={{ color: '#9bb0ba', flexShrink: 0 }}>{item.price ? `S/ ${item.price}` : ''}</span>
                        </div>
                    )) : (
                        <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>Se recibió un pedido desde catálogo de WhatsApp.</div>
                    )}
                    {msg?.order?.rawPreview?.body && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '6px' }}>
                            Nota cliente: {msg.order.rawPreview.body}
                        </div>
                    )}
                    {msg?.order?.rawPreview?.itemCount && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '2px' }}>
                            Ítems reportados: {msg.order.rawPreview.itemCount}
                        </div>
                    )}
                    <button
                        onClick={() => onPrefillMessage && onPrefillMessage(`¡Gracias! Ya vi tu carrito del catálogo. ✅\nEstoy validando stock y en un momento te confirmo el pedido para proceder con el pago y despacho.`)}
                        style={{ marginTop: '8px', background: '#00a884', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                        Aprobar/confirmar pedido
                    </button>
                </div>
            )}

            <div className="message-content" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.9rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {isCatalogItem ? "¿Te gustaría que te lo separemos?" : msg.body}
                </span>

                <div className="message-meta" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    marginTop: '2px',
                    height: '15px'
                }}>
                    <span style={{
                        fontSize: '0.65rem',
                        color: isOut ? 'rgba(233, 237, 239, 0.6)' : 'var(--text-secondary)'
                    }}>
                        {moment.unix(msg.timestamp).format('H:mm')}
                    </span>
                    {renderStatus()}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
