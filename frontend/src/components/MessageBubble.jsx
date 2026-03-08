import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { Check, CheckCheck, ShoppingBag, Pencil, MapPin, ExternalLink, Reply, Forward, ChevronDown, FileText, FileSpreadsheet, FileArchive, FileType2, Download } from 'lucide-react';

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
const parseOrderMoneyValue = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const source = String(value || '').trim();
    if (!source) return null;

    let cleaned = source.replace(/[^\d.,-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') return null;

    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');

    if (hasComma && hasDot) {
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
    } else if (hasComma) {
        const commaCount = (cleaned.match(/,/g) || []).length;
        cleaned = commaCount > 1 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
    }

    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatOrderMoney = (value, currency = 'PEN') => {
    const parsed = parseOrderMoneyValue(value);
    if (!Number.isFinite(parsed)) return null;
    const code = String(currency || 'PEN').toUpperCase();
    const prefix = code === 'PEN' ? 'S/ ' : `${code} `;
    return `${prefix}${parsed.toFixed(2)}`;
};

const isLikelyBinaryBody = (value = '') => {
    const source = String(value || '').trim();
    if (!source || source.length < 140) return false;
    if (/\s/.test(source)) return false;
    if (!/^[A-Za-z0-9+/=]+$/.test(source)) return false;
    return source.length % 4 === 0 || source.startsWith('/9j/') || source.startsWith('iVBOR');
};

const normalizeSearchText = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const parseQuoteItemsFromBody = (value = '') => {
    const source = String(value || '');
    const normalized = normalizeSearchText(source);
    if (!normalized.includes('cotizacion') || !normalized.includes('detalle de productos')) return [];

    const lines = source.split(/\r?\n/).map((line) => String(line || '').trim()).filter(Boolean);
    const items = [];

    for (const line of lines) {
        const cleaned = line.replace(/\u2796/g, '-').trim();
        let match = cleaned.match(/^(?:[-\u2022])\s*\*(\d+(?:[.,]\d+)?)\*\s+(.+)$/);
        if (!match) match = cleaned.match(/^(?:[-\u2022])\s*(\d+(?:[.,]\d+)?)\s+(.+)$/);
        if (!match) continue;

        const qtyParsed = parseOrderMoneyValue(match[1]);
        const quantity = Number.isFinite(qtyParsed) && qtyParsed > 0
            ? Math.max(1, Math.round(qtyParsed * 1000) / 1000)
            : 1;
        const name = String(match[2] || '').replace(/[\*_`~]+/g, '').trim();
        if (!name) continue;

        items.push({
            name,
            quantity,
            price: null,
            lineTotal: null,
            sku: null
        });
        if (items.length >= 40) break;
    }

    return items;
};

const parseQuotePaymentFromBody = (value = '') => {
    const source = String(value || '');
    const normalized = normalizeSearchText(source);
    if (!normalized.includes('detalle de pago')) return null;

    const lines = source.split(/\r?\n/).map((line) => String(line || '').trim()).filter(Boolean);
    let subtotal = null;
    let discount = null;
    let totalAfterDiscount = null;
    let deliveryAmount = null;
    let deliveryFree = false;
    let totalPayable = null;

    const readAmount = (line = '') => {
        const amountMatch = String(line || '').match(/s\/\s*([0-9.,]+)/i);
        if (!amountMatch) return null;
        return parseOrderMoneyValue(amountMatch[1]);
    };

    for (const line of lines) {
        const cleanLine = line.replace(/\u2796/g, '-').replace(/[\*_`~]/g, '').trim();
        const normLine = normalizeSearchText(cleanLine);

        if (normLine.includes('total a pagar')) {
            totalPayable = readAmount(cleanLine);
            continue;
        }
        if (normLine.includes('total con descuento')) {
            totalAfterDiscount = readAmount(cleanLine);
            continue;
        }
        if (normLine.includes('descuento')) {
            discount = readAmount(cleanLine);
            continue;
        }
        if (normLine.includes('delivery') || normLine.includes('envio')) {
            if (normLine.includes('gratuito')) {
                deliveryFree = true;
                deliveryAmount = 0;
            } else {
                const parsedDelivery = readAmount(cleanLine);
                if (Number.isFinite(parsedDelivery)) deliveryAmount = parsedDelivery;
            }
            continue;
        }
        if (normLine.includes('subtotal')) {
            subtotal = readAmount(cleanLine);
            continue;
        }
    }

    const hasAny = [subtotal, discount, totalAfterDiscount, deliveryAmount, totalPayable]
        .some((entry) => Number.isFinite(entry));
    if (!hasAny && !deliveryFree) return null;

    return {
        subtotal: Number.isFinite(subtotal) ? subtotal : null,
        discount: Number.isFinite(discount) ? discount : null,
        totalAfterDiscount: Number.isFinite(totalAfterDiscount) ? totalAfterDiscount : null,
        deliveryAmount: Number.isFinite(deliveryAmount) ? deliveryAmount : null,
        deliveryFree: Boolean(deliveryFree),
        totalPayable: Number.isFinite(totalPayable) ? totalPayable : null
    };
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
const GROUP_SENDER_COLORS = [
    '#53bdeb', // azul
    '#ff8f8f', // coral
    '#7bc48f', // verde suave
    '#e6a45c', // naranja
    '#b39ddb', // lavanda
    '#4dd0c8', // turquesa
    '#f48fb1', // rosa
    '#81c784', // verde
    '#90caf9', // celeste
    '#ffd54f', // amarillo
];

const getStableHash = (seed = '') => {
    const source = String(seed || '');
    if (!source) return 0;
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

const getGroupSenderColor = (seed = '') => {
    if (!seed) return '#7de6d2';
    const idx = getStableHash(seed) % GROUP_SENDER_COLORS.length;
    return GROUP_SENDER_COLORS[idx] || '#7de6d2';
};


const formatFileSizeLabel = (bytes = null) => {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx += 1;
    }
    const decimals = size >= 100 || idx === 0 ? 0 : (size >= 10 ? 1 : 2);
    return String(size.toFixed(decimals) + ' ' + units[idx]);
};

const guessExtensionFromMime = (mime = '') => {
    const type = String(mime || '').toLowerCase();
    if (!type) return '';
    if (type.includes('pdf')) return 'pdf';
    if (type.includes('wordprocessingml')) return 'docx';
    if (type.includes('msword')) return 'doc';
    if (type.includes('spreadsheetml')) return 'xlsx';
    if (type.includes('ms-excel') || type.includes('excel')) return 'xls';
    if (type.includes('presentationml')) return 'pptx';
    if (type.includes('ms-powerpoint') || type.includes('powerpoint')) return 'ppt';
    if (type.includes('csv')) return 'csv';
    if (type.includes('zip')) return 'zip';
    if (type.includes('rar')) return 'rar';
    if (type.includes('7z')) return '7z';
    if (type.includes('text/plain')) return 'txt';
    if (type.includes('json')) return 'json';
    if (type.includes('xml')) return 'xml';
    if (type.includes('video/')) return 'video';
    if (type.includes('application/octet-stream')) return 'bin';
    return '';
};

const getFileExtensionFromName = (filename = '') => {
    const safe = String(filename || '').trim();
    if (!safe.includes('.')) return '';
    const ext = safe.split('.').pop();
    return String(ext || '').trim().toLowerCase();
};

const getAttachmentKind = (mimetype = '', extension = '') => {
    const type = String(mimetype || '').toLowerCase();
    const ext = String(extension || '').toLowerCase();

    if (type.includes('pdf') || ext === 'pdf') return { icon: 'pdf', label: 'Documento PDF', accentClass: 'is-pdf' };
    if (type.includes('word') || ['doc', 'docx'].includes(ext)) return { icon: 'doc', label: 'Documento Word', accentClass: 'is-doc' };
    if (type.includes('excel') || type.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'sheet', label: 'Hoja de calculo', accentClass: 'is-sheet' };
    if (type.includes('powerpoint') || type.includes('presentation') || ['ppt', 'pptx'].includes(ext)) return { icon: 'deck', label: 'Presentacion', accentClass: 'is-deck' };
    if (type.includes('zip') || type.includes('rar') || type.includes('7z') || ['zip', 'rar', '7z'].includes(ext)) return { icon: 'archive', label: 'Archivo comprimido', accentClass: 'is-archive' };
    if (type.startsWith('text/') || ['txt', 'json', 'xml'].includes(ext)) return { icon: 'text', label: 'Archivo de texto', accentClass: 'is-text' };
    return { icon: 'file', label: 'Archivo adjunto', accentClass: 'is-generic' };
};

const buildAttachmentMeta = (msg = {}) => {
    const mimetype = String(msg?.mimetype || '').toLowerCase();
    const rawFilename = String(msg?.filename || '').trim();
    const extension = getFileExtensionFromName(rawFilename) || guessExtensionFromMime(mimetype);
    const fallbackName = extension ? ('archivo.' + extension) : 'archivo';
    const filename = rawFilename || fallbackName;
    const extensionBadge = extension ? extension.toUpperCase() : 'FILE';
    const kind = getAttachmentKind(mimetype, extension);
    const sizeLabel = formatFileSizeLabel(msg?.fileSizeBytes);
    return {
        filename,
        extensionBadge,
        kindLabel: kind.label,
        accentClass: kind.accentClass,
        icon: kind.icon,
        sizeLabel,
        mimetype: mimetype || 'application/octet-stream'
    };
};

const renderAttachmentIcon = (icon = 'file') => {
    if (icon === 'pdf') return <FileText size={18} />;
    if (icon === 'doc') return <FileText size={18} />;
    if (icon === 'sheet') return <FileSpreadsheet size={18} />;
    if (icon === 'deck') return <FileType2 size={18} />;
    if (icon === 'archive') return <FileArchive size={18} />;
    if (icon === 'text') return <FileText size={18} />;
    return <FileType2 size={18} />;
};
const MessageBubble = ({
    msg,
    onPrefillMessage,
    onLoadOrderToCart,
    isHighlighted = false,
    isCurrentHighlighted = false,
    onOpenMedia,
    onOpenMap,
    onEditMessage,
    onReplyMessage,
    onForwardMessage,
    forwardChatOptions = [],
    activeChatId = null,
    canEditMessages = true,
    showSenderName = false,
    senderDisplayName = '',
}) => {
    const isOut = msg.fromMe;

    const isCatalogItem = msg.body && msg.body.includes('REF:');
    const catalogMatch = isCatalogItem ? msg.body.match(/REF: (.*)\nPrecio: (.*)/) : null;
    const productTitle = catalogMatch ? catalogMatch[1] : null;
    const productPrice = catalogMatch ? catalogMatch[2] : null;

    const messageBodyText = String(msg?.body || '');
    const quoteItemsFromBody = parseQuoteItemsFromBody(messageBodyText);
    const quotePaymentFromBody = parseQuotePaymentFromBody(messageBodyText);
    const quoteOrderPayload = quoteItemsFromBody.length > 0
        ? {
            orderId: null,
            currency: 'PEN',
            subtotal: Number.isFinite(quotePaymentFromBody?.subtotal)
                ? quotePaymentFromBody.subtotal
                : (Number.isFinite(quotePaymentFromBody?.totalAfterDiscount) ? quotePaymentFromBody.totalAfterDiscount : null),
            products: quoteItemsFromBody,
            rawPreview: {
                type: 'quote',
                itemCount: quoteItemsFromBody.length,
                title: 'Cotizacion',
                quoteSummary: quotePaymentFromBody || null
            }
        }
        : null;

    const hasOrder = Boolean(msg?.order);
    const actionOrder = hasOrder ? msg.order : quoteOrderPayload;
    const orderRawType = String(actionOrder?.rawPreview?.type || msg?.type || '').toLowerCase();
    const orderItems = Array.isArray(actionOrder?.products) ? actionOrder.products : [];
    const firstOrderItem = orderItems[0] || null;
    const rawItemCount = parseOrderMoneyValue(actionOrder?.rawPreview?.itemCount);
    const reportedItemCount = Number.isFinite(rawItemCount) ? Math.max(0, Math.round(rawItemCount)) : orderItems.length;
    const isProductPayload = orderRawType.includes('product');
    const isOrderPayload = orderRawType.includes('order') || Boolean(actionOrder?.orderId);
    const bodyNormalized = normalizeSearchText(messageBodyText);
    const isQuotePayload = orderRawType.includes('quote') || (bodyNormalized.includes('cotizacion') && orderItems.length > 0);
    const isOrderActionable = Boolean(actionOrder) && (isOrderPayload || isQuotePayload || isProductPayload);
    const orderActionLabel = isProductPayload ? 'Anadir al carrito' : 'Ver en carrito';
    const rawOrderNote = String(actionOrder?.rawPreview?.body || '').trim();
    const safeOrderNote = isLikelyBinaryBody(rawOrderNote) ? '' : rawOrderNote;
    const orderSubtotalLabel = formatOrderMoney(actionOrder?.subtotal, actionOrder?.currency || 'PEN');
    const quoteSummaryRaw = isQuotePayload
        ? (actionOrder?.rawPreview?.quoteSummary || quotePaymentFromBody || null)
        : null;
    const quoteCurrency = actionOrder?.currency || 'PEN';
    const quoteSubtotal = parseOrderMoneyValue(quoteSummaryRaw?.subtotal ?? actionOrder?.subtotal);
    const quoteDiscount = parseOrderMoneyValue(quoteSummaryRaw?.discount);
    const quoteTotalAfterDiscount = parseOrderMoneyValue(quoteSummaryRaw?.totalAfterDiscount)
        ?? ((Number.isFinite(quoteSubtotal) && Number.isFinite(quoteDiscount))
            ? Math.max(0, Math.round((quoteSubtotal - quoteDiscount) * 100) / 100)
            : null);
    const quoteDelivery = parseOrderMoneyValue(quoteSummaryRaw?.deliveryAmount);
    const quoteTotalPayable = parseOrderMoneyValue(quoteSummaryRaw?.totalPayable)
        ?? ((Number.isFinite(quoteTotalAfterDiscount) && Number.isFinite(quoteDelivery))
            ? Math.max(0, Math.round((quoteTotalAfterDiscount + quoteDelivery) * 100) / 100)
            : null);
    const quoteSubtotalLabel = formatOrderMoney(quoteSubtotal, quoteCurrency);
    const quoteDiscountLabel = formatOrderMoney(quoteDiscount, quoteCurrency);
    const quoteTotalAfterDiscountLabel = formatOrderMoney(quoteTotalAfterDiscount, quoteCurrency);
    const quoteDeliveryLabel = quoteSummaryRaw?.deliveryFree
        ? 'Gratuito'
        : formatOrderMoney(quoteDelivery, quoteCurrency);
    const quoteTotalPayableLabel = formatOrderMoney(quoteTotalPayable, quoteCurrency);
    const locationData = resolveLocationData(msg);
    const isLocationMessage = Boolean(locationData);
    const [selectedLocationText, setSelectedLocationText] = useState('');
    const [webPreview, setWebPreview] = useState(null);
    const [webPreviewLoading, setWebPreviewLoading] = useState(false);
    const [showForwardPicker, setShowForwardPicker] = useState(false);
    const [forwardSearch, setForwardSearch] = useState('');
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const bubbleRef = useRef(null);

    const shouldHideBodyForOrder = isQuotePayload || (hasOrder && isLikelyBinaryBody(messageBodyText));
    const messageTextToRender = isCatalogItem
        ? 'Te gustaria que te lo separemos?'
        : ((isLocationMessage && locationData?.source === 'native') ? '' : (shouldHideBodyForOrder ? '' : (msg.body || '')));
    const firstNonMapUrl = extractFirstNonMapUrlFromText(messageBodyText);
    const showWebPreview = Boolean(firstNonMapUrl && !isLocationMessage && !msg?.hasMedia && !hasOrder && !isCatalogItem && !isOrderActionable);

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

    useEffect(() => {
        if (!showActionsMenu && !showForwardPicker) return;

        const handleOutsideClick = (event) => {
            if (!bubbleRef.current) return;
            if (bubbleRef.current.contains(event.target)) return;
            setShowActionsMenu(false);
            setShowForwardPicker(false);
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setShowActionsMenu(false);
                setShowForwardPicker(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [showActionsMenu, showForwardPicker]);

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

    const hasBinaryAttachment = Boolean(
        msg.hasMedia
        && msg.mediaData
        && !msg.mimetype?.startsWith('image/')
        && !msg.mimetype?.startsWith('audio/')
    );
    const attachmentMeta = hasBinaryAttachment ? buildAttachmentMeta(msg) : null;

    const messageSenderName = String(senderDisplayName || msg?.notifyName || msg?.senderPushname || '').trim();
    const senderIdentityKey = String(
        msg?.senderId
        || msg?.author
        || msg?.senderPhone
        || messageSenderName
        || ''
    ).trim().toLowerCase();
    const senderNameColor = getGroupSenderColor(senderIdentityKey);

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

    const quotedMessage = msg?.quotedMessage && typeof msg.quotedMessage === 'object'
        ? {
            id: String(msg.quotedMessage?.id || '').trim() || null,
            body: String(msg.quotedMessage?.body || '').trim() || (msg.quotedMessage?.hasMedia ? 'Adjunto' : 'Mensaje'),
            fromMe: Boolean(msg.quotedMessage?.fromMe),
            hasMedia: Boolean(msg.quotedMessage?.hasMedia),
            type: String(msg.quotedMessage?.type || 'chat')
        }
        : null;

    const canReplyMessage = Boolean(msg?.id && typeof onReplyMessage === 'function');
    const canForwardMessage = Boolean(msg?.id && typeof onForwardMessage === 'function');
    const hasMenuActions = Boolean(canReplyMessage || canForwardMessage || canEditMessage);
    const forwardNeedle = normalizeSearchText(forwardSearch);
    const forwardCandidates = Array.isArray(forwardChatOptions)
        ? forwardChatOptions.filter((chat) => {
            const id = String(chat?.id || '').trim();
            if (!id) return false;
            if (id === String(activeChatId || '')) return false;
            if (!forwardNeedle) return true;
            const haystack = normalizeSearchText(`${chat?.name || ''} ${chat?.phone || ''} ${chat?.subtitle || ''}`);
            return haystack.includes(forwardNeedle);
        }).slice(0, 40)
        : [];

    const handleReplyClick = () => {
        if (!canReplyMessage) return;
        onReplyMessage({
            id: msg?.id,
            body: String(msg?.body || ''),
            hasMedia: Boolean(msg?.hasMedia),
            fromMe: Boolean(msg?.fromMe),
            type: String(msg?.type || 'chat')
        });
        setShowActionsMenu(false);
        setShowForwardPicker(false);
    };

    const handleForwardSelect = (targetChatId) => {
        if (!canForwardMessage) return;
        const sourceMessageId = String(msg?.id || '').trim();
        const chatId = String(targetChatId || '').trim();
        if (!sourceMessageId || !chatId) return;
        onForwardMessage(sourceMessageId, chatId);
        setShowForwardPicker(false);
        setShowActionsMenu(false);
        setForwardSearch('');
    };
    const openMapPopup = (payload = {}) => {
        if (typeof onOpenMap !== 'function') return;
        onOpenMap(payload);
    };

    return (
        <div
            ref={bubbleRef}
            className={`message ${isOut ? 'out' : 'in'}${hasMenuActions ? ' has-menu-actions' : ''}`}
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
                        maxWidth: 'min(320px, 56vw)',
                        maxHeight: '260px',
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

            {hasBinaryAttachment && attachmentMeta && (
                <div className={`message-file-card ${attachmentMeta.accentClass}`}>
                    <div className="message-file-icon" aria-hidden="true">
                        {renderAttachmentIcon(attachmentMeta.icon)}
                    </div>

                    <div className="message-file-main">
                        <div className="message-file-topline">
                            <span className="message-file-badge">{attachmentMeta.extensionBadge}</span>
                            <span className="message-file-kind">{attachmentMeta.kindLabel}</span>
                        </div>
                        <div className="message-file-name" title={attachmentMeta.filename}>
                            {attachmentMeta.filename}
                        </div>
                        <div className="message-file-meta">
                            <span>{attachmentMeta.mimetype}</span>
                            {attachmentMeta.sizeLabel && <span>| {attachmentMeta.sizeLabel}</span>}
                        </div>
                    </div>

                    <div className="message-file-actions">
                        <a href={mediaDataUrl} target="_blank" rel="noreferrer" className="message-file-action">
                            Abrir
                        </a>
                        <a href={mediaDataUrl} download={attachmentMeta.filename} className="message-file-action secondary">
                            <Download size={13} /> Descargar
                        </a>
                    </div>
                </div>
            )}

            {isOrderActionable && (
                <div style={{
                    background: 'rgba(0,168,132,0.12)',
                    border: '1px solid rgba(0,168,132,0.3)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    marginBottom: '6px'
                }}>
                    <div style={{ fontSize: '0.78rem', color: '#00a884', fontWeight: 700, marginBottom: '4px' }}>
                        {isProductPayload ? 'Producto compartido' : (isQuotePayload ? 'Cotizacion' : 'Carrito/Pedido del cliente')}
                    </div>
                    {actionOrder?.orderId && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginBottom: '2px' }}>ID: {actionOrder.orderId}</div>
                    )}
                    {isProductPayload && firstOrderItem?.name && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: '4px', fontWeight: 600 }}>
                            {firstOrderItem.name}
                        </div>
                    )}
                    {orderSubtotalLabel && !isQuotePayload && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginBottom: '4px' }}>Subtotal: {orderSubtotalLabel}</div>
                    )}
                    {isProductPayload ? (
                        <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>
                            Puedes anadir este producto al carrito para cotizarlo.
                        </div>
                    ) : isQuotePayload ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '0.75rem', color: '#9bb0ba', marginTop: '1px' }}>Detalle de productos:</div>
                            {orderItems.length > 0 ? orderItems.slice(0, 40).map((item, idx) => {
                                const itemQty = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1;
                                return (
                                    <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                        - {itemQty} {item?.name || 'Producto'}
                                    </div>
                                );
                            }) : (
                                <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>No se pudo leer el detalle de productos.</div>
                            )}
                            {(quoteSubtotalLabel || quoteDiscountLabel || quoteTotalAfterDiscountLabel || quoteDeliveryLabel || quoteTotalPayableLabel) && (
                                <>
                                    <div style={{ fontSize: '0.75rem', color: '#9bb0ba', marginTop: '6px' }}>Detalle de pago:</div>
                                    {quoteSubtotalLabel && (
                                        <div style={{ fontSize: '0.79rem', color: '#d6e3eb', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Subtotal</span>
                                            <strong>{quoteSubtotalLabel}</strong>
                                        </div>
                                    )}
                                    {quoteDiscountLabel && (
                                        <div style={{ fontSize: '0.79rem', color: '#d6e3eb', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Descuento</span>
                                            <strong>- {quoteDiscountLabel}</strong>
                                        </div>
                                    )}
                                    {quoteTotalAfterDiscountLabel && (
                                        <div style={{ fontSize: '0.79rem', color: '#d6e3eb', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Total con descuento</span>
                                            <strong>{quoteTotalAfterDiscountLabel}</strong>
                                        </div>
                                    )}
                                    {quoteDeliveryLabel && (
                                        <div style={{ fontSize: '0.79rem', color: '#d6e3eb', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <span>Delivery</span>
                                            <strong>{quoteDeliveryLabel}</strong>
                                        </div>
                                    )}
                                    {quoteTotalPayableLabel && (
                                        <div style={{ fontSize: '0.82rem', color: '#e8fbf3', display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
                                            <span style={{ fontWeight: 700 }}>TOTAL A PAGAR</span>
                                            <strong style={{ fontWeight: 800 }}>{quoteTotalPayableLabel}</strong>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : orderItems.length > 0 ? orderItems.slice(0, 16).map((item, idx) => {
                        const itemAmount = formatOrderMoney(item?.lineTotal ?? item?.price, actionOrder?.currency || 'PEN');
                        const itemQty = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1;
                        return (
                            <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>- {item?.name || 'Producto'} x{itemQty}{item?.sku ? ` (SKU: ${item.sku})` : ''}</span>
                                <span style={{ color: '#9bb0ba', flexShrink: 0 }}>{itemAmount || ''}</span>
                            </div>
                        );
                    }) : (
                        <div style={{ fontSize: '0.8rem', color: '#c6d3da' }}>Se recibio un pedido desde catalogo de WhatsApp.</div>
                    )}
                    {!isProductPayload && !isQuotePayload && safeOrderNote && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '6px' }}>
                            Nota cliente: {safeOrderNote}
                        </div>
                    )}
                    {!isProductPayload && !isQuotePayload && actionOrder?.rawPreview?.itemCount && (
                        <div style={{ fontSize: '0.74rem', color: '#9bb0ba', marginTop: '2px' }}>
                            Items reportados: {actionOrder.rawPreview.itemCount}
                        </div>
                    )}
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => typeof onLoadOrderToCart === 'function' && onLoadOrderToCart(actionOrder || null)}
                            disabled={typeof onLoadOrderToCart !== 'function'}
                            style={{
                                background: '#17323f',
                                color: '#c7f1ff',
                                border: '1px solid rgba(124,200,255,0.45)',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                cursor: typeof onLoadOrderToCart === 'function' ? 'pointer' : 'not-allowed',
                                fontSize: '0.75rem',
                                opacity: typeof onLoadOrderToCart === 'function' ? 1 : 0.55
                            }}
                        >
                            {orderActionLabel}
                        </button>
                    </div>
                </div>
            )}

            
            <div className={`message-content ${canEditMessage ? 'can-edit' : ''}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {showSenderName && messageSenderName && (
                    <div className="message-sender-name" title={messageSenderName} style={{ color: senderNameColor }}>
                        {messageSenderName}
                    </div>
                )}
                {quotedMessage && (
                    <div style={{
                        borderLeft: '3px solid ' + (quotedMessage.fromMe ? '#73dbf8' : '#00a884'),
                        background: 'rgba(0,0,0,0.16)',
                        borderRadius: '8px',
                        padding: '6px 8px',
                        marginBottom: '6px'
                    }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: quotedMessage.fromMe ? '#9fe9ff' : '#72f3d3', marginBottom: '2px' }}>
                            {quotedMessage.fromMe ? 'Tu mensaje' : 'Mensaje respondido'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#c8d8e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {quotedMessage.body}
                        </div>
                    </div>
                )}
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

                {String(messageTextToRender).trim() && (
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
                        {renderWhatsAppFormattedText(messageTextToRender)}
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
                {hasMenuActions && (
                    <div className={`message-actions-anchor ${showActionsMenu ? 'open' : ''}`}>
                        <button
                            type="button"
                            className={`message-actions-toggle ${showActionsMenu ? 'open' : ''}`}
                            title="Opciones"
                            onClick={(event) => {
                                event.stopPropagation();
                                setShowActionsMenu((prev) => {
                                    const next = !prev;
                                    if (!next) setShowForwardPicker(false);
                                    return next;
                                });
                            }}
                        >
                            <ChevronDown size={13} />
                        </button>
                        {showActionsMenu && (
                            <div className="message-actions-menu" onClick={(event) => event.stopPropagation()}>
                                {canReplyMessage && (
                                    <button type="button" className="message-actions-item" onClick={handleReplyClick}>
                                        <Reply size={13} /> Responder
                                    </button>
                                )}
                                {canForwardMessage && (
                                    <button
                                        type="button"
                                        className="message-actions-item"
                                        onClick={() => {
                                            setShowForwardPicker((prev) => !prev);
                                            setShowActionsMenu(false);
                                        }}
                                    >
                                        <Forward size={13} /> Reenviar
                                    </button>
                                )}
                                {canEditMessage && (
                                    <button
                                        type="button"
                                        className="message-actions-item"
                                        onClick={() => {
                                            handleEditClick();
                                            setShowActionsMenu(false);
                                        }}
                                    >
                                        <Pencil size={13} /> Editar
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {showForwardPicker && canForwardMessage && (
                    <div style={{
                        marginTop: '6px',
                        border: '1px solid rgba(124,200,255,0.32)',
                        background: 'rgba(15,26,34,0.96)',
                        borderRadius: '10px',
                        padding: '8px',
                        minWidth: '220px',
                        maxWidth: '320px',
                        alignSelf: isOut ? 'flex-end' : 'flex-start'
                    }}>
                        <div style={{ fontSize: '0.72rem', color: '#7cc8ff', fontWeight: 700, marginBottom: '6px' }}>
                            Reenviar a...
                        </div>
                        <input
                            type="text"
                            value={forwardSearch}
                            onChange={(event) => setForwardSearch(event.target.value)}
                            placeholder="Buscar chat"
                            style={{
                                width: '100%',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.18)',
                                background: 'rgba(255,255,255,0.04)',
                                color: '#e8f1f6',
                                padding: '5px 8px',
                                fontSize: '0.75rem',
                                marginBottom: '6px'
                            }}
                        />
                        <div style={{ maxHeight: '170px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {forwardCandidates.length > 0 ? forwardCandidates.map((chat) => (
                                <button
                                    key={chat.id}
                                    type="button"
                                    onClick={() => handleForwardSelect(chat.id)}
                                    style={{
                                        textAlign: 'left',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.02)',
                                        color: '#e8f1f6',
                                        borderRadius: '8px',
                                        padding: '5px 7px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {chat.name || chat.phone || 'Chat'}
                                    </div>
                                    {(chat.phone || chat.subtitle) && (
                                        <div style={{ fontSize: '0.68rem', color: '#9db0ba', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {chat.phone || chat.subtitle}
                                        </div>
                                    )}
                                </button>
                            )) : (
                                <div style={{ fontSize: '0.72rem', color: '#9db0ba' }}>No se encontraron chats.</div>
                            )}
                        </div>
                    </div>
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

