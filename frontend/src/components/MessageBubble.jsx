import React from 'react';
import moment from 'moment';
import { Check, CheckCheck, ShoppingBag } from 'lucide-react';

const formatMoney = (value, currency = 'PEN') => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number.parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(num)) return String(value);
    const symbol = currency === 'PEN' ? 'S/' : `${currency} `;
    return `${symbol} ${num.toFixed(2)}`;
};

const MessageBubble = ({ msg, onPrefillMessage }) => {
    const isOut = msg.fromMe;

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
                    style={{ borderRadius: '6px', marginBottom: '4px', maxWidth: '100%', cursor: 'zoom-in', display: 'block' }}
                    onClick={() => window.open(`data:${msg.mimetype};base64,${msg.mediaData}`)}
                />
            )}

            {msg.hasMedia && msg.mediaData && msg.mimetype?.startsWith('audio/') && (
                <audio src={`data:${msg.mimetype};base64,${msg.mediaData}`} controls className="media-audio" style={{ marginBottom: '4px' }} />
            )}

            {hasOrder && (
                <div style={{ background: 'rgba(0,168,132,0.12)', border: '1px solid rgba(0,168,132,0.3)', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '0.78rem', color: '#00a884', fontWeight: 700, marginBottom: '4px' }}>🛒 Pedido del cliente</div>
                    {msg?.order?.orderId && <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginBottom: '2px' }}>ID: {msg.order.orderId}</div>}
                    {msg?.order?.rawPreview?.title && <div style={{ fontSize: '0.74rem', color: '#c6d3da', marginBottom: '4px' }}>{msg.order.rawPreview.title}</div>}

                    {orderItems.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
                            {orderItems.map((item, idx) => {
                                const qty = Number(item.quantity || 1);
                                const unit = formatMoney(item.price, msg.order.currency);
                                const line = formatMoney(item.lineTotal, msg.order.currency);
                                return (
                                    <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {item.name} x{qty}{item.sku ? ` (SKU: ${item.sku})` : ''}</span>
                                            <span style={{ color: '#9bb0ba', flexShrink: 0 }}>{line || unit || ''}</span>
                                        </div>
                                        {unit && line && <div style={{ fontSize: '0.7rem', color: '#9bb0ba' }}>Unitario: {unit}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.8rem', color: '#c6d3da', marginBottom: '6px' }}>Se recibió un pedido desde catálogo de WhatsApp.</div>
                    )}

                    <div style={{ borderTop: '1px dashed rgba(255,255,255,0.2)', paddingTop: '6px', display: 'grid', gap: '2px' }}>
                        {msg?.order?.subtotal !== null && msg?.order?.subtotal !== undefined && <div style={{ fontSize: '0.74rem', color: '#9bb0ba' }}>Subtotal: {formatMoney(msg.order.subtotal, msg.order.currency)}</div>}
                        {msg?.order?.discount !== null && msg?.order?.discount !== undefined && <div style={{ fontSize: '0.74rem', color: '#9bb0ba' }}>Descuento: {formatMoney(msg.order.discount, msg.order.currency)}</div>}
                        {msg?.order?.shipping !== null && msg?.order?.shipping !== undefined && <div style={{ fontSize: '0.74rem', color: '#9bb0ba' }}>Envío: {formatMoney(msg.order.shipping, msg.order.currency)}</div>}
                        {msg?.order?.tax !== null && msg?.order?.tax !== undefined && <div style={{ fontSize: '0.74rem', color: '#9bb0ba' }}>Impuestos: {formatMoney(msg.order.tax, msg.order.currency)}</div>}
                        {msg?.order?.total !== null && msg?.order?.total !== undefined && <div style={{ fontSize: '0.78rem', color: '#e6f4f1', fontWeight: 600 }}>Total: {formatMoney(msg.order.total, msg.order.currency)}</div>}
                        {msg?.order?.rawPreview?.itemCount && <div style={{ fontSize: '0.74rem', color: '#9bb0ba' }}>Ítems reportados: {msg.order.rawPreview.itemCount}</div>}
                    </div>

                    {msg?.order?.rawPreview?.body && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '6px' }}>Nota cliente: {msg.order.rawPreview.body}</div>
                    )}

                    <button
                        onClick={() => onPrefillMessage && onPrefillMessage('¡Gracias! Ya revisé tu pedido completo ✅\nEstoy validando stock, precio final y envío para confirmarte la cotización en breve.')}
                        style={{ marginTop: '8px', background: '#00a884', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                        Confirmar recepción del pedido
                    </button>
                </div>
            )}

            <div className="message-content" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.9rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {isCatalogItem ? '¿Te gustaría que te lo separemos?' : msg.body}
                </span>

                <div className="message-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '2px', height: '15px' }}>
                    <span style={{ fontSize: '0.65rem', color: isOut ? 'rgba(233, 237, 239, 0.6)' : 'var(--text-secondary)' }}>
                        {moment.unix(msg.timestamp).format('H:mm')}
                    </span>
                    {renderStatus()}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
