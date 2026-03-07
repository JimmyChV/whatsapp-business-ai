import React, { useEffect, useState } from 'react';
import moment from 'moment';
import { Check, CheckCheck, ShoppingBag, Pencil, MapPin, ExternalLink } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const linkPreviewCache = new Map();

const INLINE_WA_PATTERN = /(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;

const renderWhatsAppInline = (text = '') => {
    const tokens = String(text || '').split(INLINE_WA_PATTERN).filter((token) => token !== '');
    return tokens.map((token, idx) => {
        if (/^https?:\/\/[^\s]+$/i.test(token)) {
            return (
                <a key={`url_${idx}`} href={token} target="_blank" rel="noreferrer" style={{ color: '#7cc8ff', textDecoration: 'underline' }}>
                    {token}
                </a>
            );
        }
        if (/^\*[^*\n]+\*$/.test(token)) return <strong key={`b_${idx}`}>{token.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(token)) return <em key={`i_${idx}`}>{token.slice(1, -1)}</em>;
        if (/^~[^~\n]+~$/.test(token)) return <s key={`s_${idx}`}>{token.slice(1, -1)}</s>;
        if (/^`[^`\n]+`$/.test(token)) {
            return (
                <code key={`m_${idx}`} style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '0.88em', background: 'rgba(0,0,0,0.22)', borderRadius: '4px', padding: '1px 4px' }}>
                    {token.slice(1, -1)}
                </code>
            );
        }
        return <React.Fragment key={`t_${idx}`}>{token}</React.Fragment>;
    });
};

const renderInlineLines = (text = '', keyPrefix = 'inline') => {
    const lines = String(text || '').split('\n');
    return lines.map((line, idx) => (
        <React.Fragment key={`${keyPrefix}_line_${idx}`}>
            {renderWhatsAppInline(line)}
            {idx < lines.length - 1 && <br />}
        </React.Fragment>
    ));
};

const renderWhatsAppFormattedText = (text = '') => {
    const source = String(text || '');
    const codeFencePattern = /```([\s\S]*?)```/g;
    const chunks = [];
    let lastIndex = 0;
    let match;
    let chunkIndex = 0;

    while ((match = codeFencePattern.exec(source)) !== null) {
        const before = source.slice(lastIndex, match.index);
        if (before) {
            const textKey = chunkIndex++;
            chunks.push(
                <React.Fragment key={`txt_${textKey}`}>
                    {renderInlineLines(before, `txt_${textKey}`)}
                </React.Fragment>
            );
        }

        const codeText = String(match[1] || '').replace(/^\n+|\n+$/g, '');
        const codeKey = chunkIndex++;
        chunks.push(
            <pre
                key={`code_${codeKey}`}
                style={{
                    margin: '6px 0 2px',
                    borderRadius: '7px',
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(0,0,0,0.28)',
                    padding: '8px',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '0.82rem'
                }}
            >
                <code>{codeText}</code>
            </pre>
        );

        lastIndex = match.index + match[0].length;
    }

    const tail = source.slice(lastIndex);
    if (tail) {
        const tailKey = chunkIndex++;
        chunks.push(
            <React.Fragment key={`tail_${tailKey}`}>
                {renderInlineLines(tail, `tail_${tailKey}`)}
            </React.Fragment>
        );
    }

    if (!chunks.length) return renderInlineLines(source, 'plain');
    return chunks;
};
const parseLocationCoord = (value) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
};

const isValidLat = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLng = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

const normalizeUrlToken = (value = '') => String(value || '').trim().replace(/[),.;!?]+$/g, '');

const isLikelyMapUrl = (value = '') => {
    const candidate = normalizeUrlToken(value);
    if (!candidate) return false;
    try {
        const parsed = new URL(candidate);
        const host = String(parsed.hostname || '').toLowerCase();
        const path = String(parsed.pathname || '').toLowerCase();
        if (host.includes('maps.app.goo.gl')) return true;
        if (host === 'goo.gl' && path.startsWith('/maps')) return true;
        if (host.startsWith('maps.google.')) return true;
        if (host.includes('google.') && path.startsWith('/maps')) return true;
        return false;
    } catch (e) {
        return /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|google\.[^\s/]+\/maps/i.test(candidate);
    }
};

const extractMapUrlFromText = (text = '') => {
    const urls = String(text || '').match(/https?:\/\/[^\s]+/gi) || [];
    for (const rawUrl of urls) {
        const mapUrl = normalizeUrlToken(rawUrl);
        if (isLikelyMapUrl(mapUrl)) return mapUrl;
    }
    return null;
};
const extractFirstNonMapUrlFromText = (text = '') => {
    const urls = String(text || '').match(/https?:\/\/[^\s]+/gi) || [];
    for (const rawUrl of urls) {
        const candidate = normalizeUrlToken(rawUrl);
        if (!candidate) continue;
        if (isLikelyMapUrl(candidate)) continue;
        return candidate;
    }
    return null;
};

const tryExtractCoordinates = (value = '') => {
    const source = String(value || '');
    if (!source) return null;

    const patterns = [
        /geo:\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /@(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (!match) continue;
        const latitude = parseLocationCoord(match[1]);
        const longitude = parseLocationCoord(match[2]);
        if (isValidLat(latitude) && isValidLng(longitude)) {
            return { latitude, longitude };
        }
    }
    return null;
};

const extractCoordsFromText = (text = '') => {
    const raw = String(text || '');
    if (!raw) return null;

    let value = raw;
    try {
        value = decodeURIComponent(raw);
    } catch (e) { }

    const direct = tryExtractCoordinates(value);
    if (direct) return direct;

    const urls = value.match(/https?:\/\/[^\s]+/gi) || [];
    for (const rawUrl of urls) {
        const urlCandidate = normalizeUrlToken(rawUrl);
        try {
            const parsed = new URL(urlCandidate);
            const queryCandidates = [
                parsed.searchParams.get('q'),
                parsed.searchParams.get('query'),
                parsed.searchParams.get('ll'),
                parsed.searchParams.get('sll'),
                parsed.searchParams.get('destination'),
                parsed.searchParams.get('daddr'),
                `${parsed.pathname || ''}${parsed.hash || ''}`,
            ].filter(Boolean);

            for (const queryCandidate of queryCandidates) {
                const parsedCoords = tryExtractCoordinates(String(queryCandidate));
                if (parsedCoords) return parsedCoords;
            }
        } catch (e) { }
    }

    return null;
};

const resolveLocationData = (msg = {}) => {
    const type = String(msg?.type || '').toLowerCase();
    const explicit = msg?.location && typeof msg.location === 'object' ? msg.location : null;
    const body = String(msg?.body || '').trim();
    const isNativeLocationType = type === 'location';

    let latitude = parseLocationCoord(explicit?.latitude);
    let longitude = parseLocationCoord(explicit?.longitude);
    if (!isValidLat(latitude)) latitude = null;
    if (!isValidLng(longitude)) longitude = null;

    const mapFromBody = extractMapUrlFromText(body);
    const coordsFromBody = extractCoordsFromText(body);
    if ((latitude === null || longitude === null) && coordsFromBody) {
        latitude = coordsFromBody.latitude;
        longitude = coordsFromBody.longitude;
    }

    const explicitMapUrl = normalizeUrlToken(explicit?.mapUrl || explicit?.url || '');
    const mapUrl = isLikelyMapUrl(explicitMapUrl)
        ? explicitMapUrl
        : (mapFromBody || ((latitude !== null && longitude !== null) ? `https://www.google.com/maps?q=${latitude},${longitude}` : null));

    const label = String(explicit?.label || '').trim();
    const text = String(explicit?.text || '').trim();

    const hasExplicitLocation = Boolean(explicit && Object.keys(explicit).length > 0);
    const hasCoordinates = latitude !== null && longitude !== null;
    const bodyHasMapLink = Boolean(mapFromBody);
    const bodyHasCoordHint = hasCoordinates && Boolean(body);
    const looksLikeLocationBody = bodyHasMapLink || bodyHasCoordHint;

    const hasAny = isNativeLocationType || hasExplicitLocation || looksLikeLocationBody;
    if (!hasAny) return null;

    const explicitSource = String(explicit?.source || '').toLowerCase();
    const source = (explicitSource === 'native' || explicitSource === 'link')
        ? explicitSource
        : (isNativeLocationType ? 'native' : (bodyHasMapLink || bodyHasCoordHint ? 'link' : 'native'));

    const resolvedLabel = label
        || ((text && !/^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/.test(text)) ? text : '')
        || 'Ubicacion compartida';

    return {
        latitude,
        longitude,
        label: resolvedLabel,
        mapUrl,
        source
    };
};
const MessageBubble = ({
    msg,
    onPrefillMessage,
    isHighlighted = false,
    isCurrentHighlighted = false,
    onOpenMedia,
    onOpenMap,
    onEditMessage,
    canEditMessages = true,
}) => {
    const isOut = msg.fromMe;

    const isCatalogItem = msg.body && msg.body.includes('REF:');
    const catalogMatch = isCatalogItem ? msg.body.match(/REF: (.*)\nPrecio: (.*)/) : null;
    const productTitle = catalogMatch ? catalogMatch[1] : null;
    const productPrice = catalogMatch ? catalogMatch[2] : null;

    const hasOrder = Boolean(msg?.order);
    const orderItems = Array.isArray(msg?.order?.products) ? msg.order.products : [];
    const locationData = resolveLocationData(msg);
    const isLocationMessage = Boolean(locationData);
    const [selectedLocationText, setSelectedLocationText] = useState('');
    const [webPreview, setWebPreview] = useState(null);
    const [webPreviewLoading, setWebPreviewLoading] = useState(false);

    const messageBodyText = String(msg?.body || '');
    const firstNonMapUrl = extractFirstNonMapUrlFromText(messageBodyText);
    const showWebPreview = Boolean(firstNonMapUrl && !isLocationMessage && !msg?.hasMedia && !hasOrder && !isCatalogItem);

    useEffect(() => {
        if (!showWebPreview || !firstNonMapUrl) {
            setWebPreview(null);
            setWebPreviewLoading(false);
            return;
        }

        const cached = linkPreviewCache.get(firstNonMapUrl);
        if (cached) {
            setWebPreview(cached);
            setWebPreviewLoading(false);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setWebPreviewLoading(true);
                const encoded = encodeURIComponent(firstNonMapUrl);
                const response = await fetch(`${API_URL}/api/link-preview?url=${encoded}`);
                const payload = await response.json();
                const nextPreview = payload?.ok
                    ? payload
                    : { ok: false, url: firstNonMapUrl, title: firstNonMapUrl };
                linkPreviewCache.set(firstNonMapUrl, nextPreview);
                if (!cancelled) setWebPreview(nextPreview);
            } catch (e) {
                const fallback = { ok: false, url: firstNonMapUrl, title: firstNonMapUrl };
                linkPreviewCache.set(firstNonMapUrl, fallback);
                if (!cancelled) setWebPreview(fallback);
            } finally {
                if (!cancelled) setWebPreviewLoading(false);
            }
        }, 180);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [firstNonMapUrl, showWebPreview]);

    const hasLocationCoords = Number.isFinite(locationData?.latitude) && Number.isFinite(locationData?.longitude);
    const locationMapQuery = hasLocationCoords
        ? `${locationData.latitude},${locationData.longitude}`
        : String(locationData?.mapUrl || locationData?.label || '');
    const locationEmbedUrl = locationMapQuery
        ? `https://www.google.com/maps?q=${encodeURIComponent(locationMapQuery)}&output=embed`
        : '';

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
        const label = `Estado: ${getAckLabel(ack)}`;
        return (
            <span className={`message-ack ${ack >= 3 ? 'read' : ack >= 2 ? 'delivered' : ack >= 1 ? 'sent' : 'pending'}`} title={label} aria-label={label}>
                {ack >= 2 ? <CheckCheck size={16} /> : <Check size={16} />}
            </span>
        );
    };

    const mediaDataUrl = msg.hasMedia && msg.mediaData
        ? `data:${msg.mimetype || 'application/octet-stream'};base64,${msg.mediaData}`
        : null;

    const canEditMessage = Boolean(
        canEditMessages
        && isOut
        && !msg?.hasMedia
        && String(msg?.body || '').trim()
        && msg?.canEdit === true
    );

    const handleEditClick = () => {
        if (!canEditMessage || typeof onEditMessage !== 'function') return;
        onEditMessage(msg?.id, String(msg?.body || ''));
    };

    const openMapPopup = (payload = {}) => {
        if (typeof onOpenMap !== 'function') return;
        onOpenMap(payload);
    };

    return (
        <div
            className={`message ${isOut ? 'out' : 'in'}`}
            style={isHighlighted ? { outline: `2px solid ${isCurrentHighlighted ? '#00a884' : 'rgba(0,168,132,0.35)'}`, borderRadius: '10px', padding: '2px' } : undefined}
        >
            {isCatalogItem && (
                <div className="catalog-card">
                    <div style={{ width: '100%', height: '72px', background: 'linear-gradient(120deg,#233138,#1a252b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShoppingBag size={20} color="#9db0ba" />
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
                    src={mediaDataUrl}
                    className="message-media"
                    alt="Media"
                    style={{
                        borderRadius: '8px',
                        marginBottom: '4px',
                        maxWidth: '190px',
                        maxHeight: '145px',
                        objectFit: 'cover',
                        cursor: 'zoom-in',
                        display: 'block'
                    }}
                    onClick={() => onOpenMedia && onOpenMedia({ src: mediaDataUrl, mimetype: msg.mimetype, messageId: msg.id })}
                />
            )}

            {msg.hasMedia && msg.mediaData && msg.mimetype?.startsWith('audio/') && (
                <audio
                    src={mediaDataUrl}
                    controls
                    className="media-audio"
                    style={{ marginBottom: '4px' }}
                />
            )}

            {msg.hasMedia && msg.mediaData && !msg.mimetype?.startsWith('image/') && !msg.mimetype?.startsWith('audio/') && (
                <a
                    href={mediaDataUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(0,0,0,0.18)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        padding: '7px 10px',
                        marginBottom: '6px',
                        color: 'inherit',
                        textDecoration: 'none',
                        maxWidth: '210px',
                        fontSize: '0.76rem'
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
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>- {item.name} x{item.quantity || 1}{item.sku ? ` (SKU: ${item.sku})` : ''}</span>
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

            <div className={`message-content ${canEditMessage ? 'can-edit' : ''}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {isLocationMessage && (
                    <div style={{
                        border: '1px solid rgba(0,168,132,0.38)',
                        background: 'rgba(0,0,0,0.16)',
                        borderRadius: '9px',
                        padding: '8px',
                        marginBottom: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00c7a0', fontSize: '0.78rem', fontWeight: 700 }}>
                            <MapPin size={14} /> Ubicacion compartida
                        </div>

                        {locationEmbedUrl && (
                            <button
                                type="button"
                                onClick={() => openMapPopup({ query: locationMapQuery, mapUrl: locationData?.mapUrl, latitude: locationData?.latitude, longitude: locationData?.longitude })}
                                style={{
                                    marginTop: '7px',
                                    width: '100%',
                                    border: '1px solid rgba(124,200,255,0.35)',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    padding: 0,
                                    cursor: 'pointer',
                                    background: '#17242d'
                                }}
                            >
                                <iframe
                                    title="Vista previa de ubicacion"
                                    src={locationEmbedUrl}
                                    style={{ width: '100%', height: '118px', border: 'none', pointerEvents: 'none' }}
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                />
                            </button>
                        )}

                        <div style={{ fontSize: '0.84rem', color: '#e4edf2', marginTop: '6px' }}>
                            {locationData?.label || 'Ubicacion'}
                        </div>
                        {(locationData?.latitude !== null && locationData?.longitude !== null) && (
                            <div style={{ fontSize: '0.72rem', color: '#97aab4', marginTop: '2px' }}>
                                {locationData.latitude.toFixed(6)}, {locationData.longitude.toFixed(6)}
                            </div>
                        )}
                        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => openMapPopup({ query: locationMapQuery, mapUrl: locationData?.mapUrl, latitude: locationData?.latitude, longitude: locationData?.longitude })}
                                style={{
                                    border: '1px solid rgba(124,200,255,0.45)',
                                    background: 'rgba(124,200,255,0.12)',
                                    color: '#cfefff',
                                    borderRadius: '999px',
                                    padding: '4px 10px',
                                    fontSize: '0.74rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                Ver en popup <ExternalLink size={12} />
                            </button>
                        </div>
                    </div>
                )}

                {showWebPreview && (webPreviewLoading || webPreview) && (
                    <a
                        href={webPreview?.url || firstNonMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            textDecoration: 'none',
                            color: 'inherit',
                            border: '1px solid rgba(124,200,255,0.26)',
                            background: 'rgba(16,26,34,0.72)',
                            borderRadius: '10px',
                            padding: '8px',
                            marginBottom: '6px'
                        }}
                    >
                        {webPreview?.image && (
                            <img
                                src={webPreview.image}
                                alt="Vista previa"
                                style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                            />
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.72rem', color: '#82d0ff', marginBottom: '2px' }}>
                                {webPreviewLoading ? 'Cargando vista previa...' : 'Enlace'}
                            </div>
                            <div style={{ fontSize: '0.84rem', color: '#e8f1f6', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {webPreview?.title || webPreview?.siteName || firstNonMapUrl}
                            </div>
                            {webPreview?.description && (
                                <div style={{ fontSize: '0.74rem', color: '#9cb1ba', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {webPreview.description}
                                </div>
                            )}
                        </div>
                    </a>
                )}

                {String(isCatalogItem ? 'Te gustaria que te lo separemos?' : ((isLocationMessage && locationData?.source === 'native') ? '' : (msg.body || ''))).trim() && (
                    <span
                        style={{ fontSize: '0.9rem', wordBreak: 'break-word', whiteSpace: 'normal' }}
                        onMouseUp={() => {
                            const selected = String(window.getSelection?.()?.toString?.() || '').trim();
                            if (selected.length >= 4 && selected.length <= 180) {
                                setSelectedLocationText(selected);
                                return;
                            }
                            setSelectedLocationText('');
                        }}
                    >
                        {renderWhatsAppFormattedText(isCatalogItem ? 'Te gustaria que te lo separemos?' : ((isLocationMessage && locationData?.source === 'native') ? '' : msg.body))}
                    </span>
                )}

                {selectedLocationText && typeof onOpenMap === 'function' && (
                    <button
                        type="button"
                        onClick={() => {
                            openMapPopup({ query: selectedLocationText });
                            setSelectedLocationText('');
                        }}
                        style={{
                            marginTop: '6px',
                            border: '1px solid rgba(0,168,132,0.45)',
                            background: 'rgba(0,168,132,0.14)',
                            color: '#baf6e8',
                            borderRadius: '999px',
                            padding: '4px 10px',
                            fontSize: '0.73rem',
                            cursor: 'pointer',
                            alignSelf: 'flex-start'
                        }}
                    >
                        Buscar en mapa: "{selectedLocationText.slice(0, 60)}{selectedLocationText.length > 60 ? '...' : ''}"
                    </button>
                )}

                {canEditMessage && (
                    <button
                        type="button"
                        onClick={handleEditClick}
                        className="message-edit-btn"
                        title="Editar este mensaje"
                    >
                        <Pencil size={11} /> Editar
                    </button>
                )}

                <div className="message-meta" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    marginTop: '2px',
                    minHeight: '16px'
                }}>
                    <span className="message-time-text">
                        {moment.unix(msg.timestamp).format('H:mm')}
                    </span>
                    {msg?.edited && <span className="message-edited-badge">editado</span>}
                    {renderStatus()}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;

