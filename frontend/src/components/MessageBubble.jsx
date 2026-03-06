import React from 'react';
import moment from 'moment';
import { Check, CheckCheck, ShoppingBag } from 'lucide-react';

const MessageBubble = ({ msg, onPrefillMessage, isHighlighted = false, isCurrentHighlighted = false }) => {
    const isOut = msg.fromMe;

    const isCatalogItem = msg.body && msg.body.includes('REF:');
    const catalogMatch = isCatalogItem ? msg.body.match(/REF: (.*)\nPrecio: (.*)/) : null;
    const productTitle = catalogMatch ? catalogMatch[1] : null;
    const productPrice = catalogMatch ? catalogMatch[2] : null;

    const hasOrder = Boolean(msg?.order);
    const orderItems = Array.isArray(msg?.order?.products) ? msg.order.products : [];

    const getAckLabel = (ackValue) => {
        const ack = Number.isFinite(Number(ackValue)) ? Number(ackValue) : 0;
        if (ack >= 4) return 'Reproducido';
        if (ack >= 3) return 'Leido';
        if (ack >= 2) return 'Entregado';
        if (ack >= 1) return 'Enviado';
        if (ack === -1) return 'Error';
        return 'Pendiente';
    };

    const renderStatus = () => {
        if (!isOut) return null;
        const ack = Number.isFinite(Number(msg.ack)) ? Number(msg.ack) : 0;
        const color = ack >= 3 ? '#53bdeb' : 'rgba(233, 237, 239, 0.6)';
        const label = `Estado: ${getAckLabel(ack)}`;
        return (
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); window.alert(label); }}
                title={label}
                style={{ display: 'flex', color, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            >
                {ack >= 2 ? <CheckCheck size={16} /> : <Check size={16} />}
            </button>
        );
    };

    return (
        <div className={`message ${isOut ? 'out' : 'in'}`} style={isHighlighted ? { outline: `2px solid ${isCurrentHighlighted ? '#00a884' : 'rgba(0,168,132,0.35)'}`, borderRadius: '10px', padding: '2px' } : undefined}>
            {isCatalogItem && (
                <div className="catalog-card">
                    <div style={{ width: '100%', height: '85px', background: 'linear-gradient(120deg,#233138,#1a252b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingBag size={22} color="#9db0ba" />
                    </div>
                    <div className="catalog-card-info">
                        <div className="catalog-card-title">{productTitle}</div>
                        <div className="catalog-card-price">{productPrice}</div>
                    </div>
                    <button className="catalog-card-btn" onClick={() => onPrefillMessage && onPrefillMessage(`Hola, me interesa ${productTitle || 'el producto del catalogo'}. Me confirmas stock y precio final?`)}>
                        <ShoppingBag size={16} /> Pedir cotizacion
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
                        maxWidth: '220px',
                        maxHeight: '180px',
                        objectFit: 'cover',
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

            {msg.hasMedia && msg.mediaData && !msg.mimetype?.startsWith('image/') && !msg.mimetype?.startsWith('audio/') && (
                <a
                    href={`data:${msg.mimetype || 'application/octet-stream'};base64,${msg.mediaData}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(0,0,0,0.18)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        marginBottom: '6px',
                        color: 'inherit',
                        textDecoration: 'none',
                        maxWidth: '220px',
                        fontSize: '0.78rem'
                    }}
                >
                    <span>Adjunto</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {msg.mimetype || 'Archivo'}
                    </span>
                </a>
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
                        Carrito/Pedido del cliente
                    </div>
                    {msg?.order?.orderId && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginBottom: '2px' }}>ID: {msg.order.orderId}</div>
                    )}
                    {msg?.order?.subtotal && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginBottom: '4px' }}>Subtotal: {msg.order.currency || 'PEN'} {msg.order.subtotal}</div>
                    )}
                    {orderItems.length > 0 ? orderItems.slice(0, 12).map((item, idx) => (
                        <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {item.name} x{item.quantity || 1}{item.sku ? ` (SKU: ${item.sku})` : ''}</span>
                            <span style={{ color: '#9bb0ba', flexShrink: 0 }}>{item.lineTotal ? `S/ ${item.lineTotal}` : (item.price ? `S/ ${item.price}` : '')}</span>
                        </div>
                    )) : (
                        <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>Se recibio un pedido desde catalogo de WhatsApp.</div>
                    )}
                    {msg?.order?.rawPreview?.body && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '6px' }}>
                            Nota cliente: {msg.order.rawPreview.body}
                        </div>
                    )}
                    {msg?.order?.rawPreview?.itemCount && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '2px' }}>
                            Items reportados: {msg.order.rawPreview.itemCount}
                        </div>
                    )}
                    <button
                        onClick={() => onPrefillMessage && onPrefillMessage('Gracias. Ya vi tu carrito del catalogo. Estoy validando stock y en un momento te confirmo el pedido para proceder con el pago y despacho.')}
                        style={{ marginTop: '8px', background: '#00a884', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                        Aprobar/confirmar pedido
                    </button>
                </div>
            )}

            <div className="message-content" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.9rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {isCatalogItem ? 'Te gustaria que te lo separemos?' : msg.body}
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