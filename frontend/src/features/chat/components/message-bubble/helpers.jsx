import React from 'react';
import { FileText, FileSpreadsheet, FileArchive, FileType2 } from 'lucide-react';

export const INLINE_WA_PATTERN = /(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
export const INLINE_WA_PATTERN_NO_CODE = /(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

export const unwrapWholeCodeFormatting = (text = '') => {
    const source = String(text || '');
    const trimmed = source.trim();
    const fencedMatch = trimmed.match(/^```([\s\S]*?)```$/);
    if (fencedMatch) return String(fencedMatch[1] || '').replace(/^\n+|\n+$/g, '');
    const inlineMatch = trimmed.match(/^`([^`\n]+)`$/);
    if (inlineMatch) return String(inlineMatch[1] || '');
    return source;
};

export const renderWhatsAppInline = (text = '', { allowCodeFormatting = true } = {}) => {
    const pattern = allowCodeFormatting ? INLINE_WA_PATTERN : INLINE_WA_PATTERN_NO_CODE;
    const tokens = String(text || '').split(pattern).filter((token) => token !== '');
    return tokens.map((token, idx) => {
        if (/^https?:\/\/[^\s]+$/i.test(token)) {
            return (
                <a key={`url_${idx}`} href={token} target="_blank" rel="noreferrer" style={{ color: 'var(--chat-link)', textDecoration: 'underline' }}>
                    {token}
                </a>
            );
        }
        if (/^\*[^*\n]+\*$/.test(token)) return <strong key={`b_${idx}`}>{token.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(token)) return <em key={`i_${idx}`}>{token.slice(1, -1)}</em>;
        if (/^~[^~\n]+~$/.test(token)) return <s key={`s_${idx}`}>{token.slice(1, -1)}</s>;
        if (allowCodeFormatting && /^`[^`\n]+`$/.test(token)) {
            return (
                <code key={`m_${idx}`} style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '0.88em', background: 'var(--chat-code-surface)', border: '1px solid var(--chat-code-border)', borderRadius: '4px', padding: '1px 4px' }}>
                    {token.slice(1, -1)}
                </code>
            );
        }
        return <React.Fragment key={`t_${idx}`}>{token}</React.Fragment>;
    });
};

export const renderInlineLines = (text = '', keyPrefix = 'inline', options = {}) => {
    const lines = String(text || '').split('\n');
    return lines.map((line, idx) => (
        <React.Fragment key={`${keyPrefix}_line_${idx}`}>
            {renderWhatsAppInline(line, options)}
            {idx < lines.length - 1 && <br />}
        </React.Fragment>
    ));
};

export const renderWhatsAppFormattedText = (text = '', options = {}) => {
    const { allowCodeFormatting = true } = options || {};
    const source = allowCodeFormatting
        ? String(text || '')
        : unwrapWholeCodeFormatting(text);
    const codeFencePattern = /```([\s\S]*?)```/g;
    const chunks = [];
    let lastIndex = 0;
    let match;
    let chunkIndex = 0;

    while (allowCodeFormatting && (match = codeFencePattern.exec(source)) !== null) {
        const before = source.slice(lastIndex, match.index);
        if (before) {
            const textKey = chunkIndex++;
            chunks.push(
                <React.Fragment key={`txt_${textKey}`}>
                    {renderInlineLines(before, `txt_${textKey}`, { allowCodeFormatting })}
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
                    border: '1px solid var(--chat-code-border)',
                    background: 'var(--chat-code-surface)',
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
                {renderInlineLines(tail, `tail_${tailKey}`, { allowCodeFormatting })}
            </React.Fragment>
        );
    }

    if (!chunks.length) return renderInlineLines(source, 'plain', { allowCodeFormatting });
    return chunks;
};
export const parseOrderMoneyValue = (value) => {
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

export const formatOrderMoney = (value, currency = 'PEN') => {
    const parsed = parseOrderMoneyValue(value);
    if (!Number.isFinite(parsed)) return null;
    const code = String(currency || 'PEN').toUpperCase();
    const prefix = code === 'PEN' ? 'S/ ' : `${code} `;
    return `${prefix}${parsed.toFixed(2)}`;
};

export const isLikelyBinaryBody = (value = '') => {
    const source = String(value || '').trim();
    if (!source || source.length < 140) return false;
    if (/\s/.test(source)) return false;
    if (!/^[A-Za-z0-9+/=]+$/.test(source)) return false;
    return source.length % 4 === 0 || source.startsWith('/9j/') || source.startsWith('iVBOR');
};

export const normalizeSearchText = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const parseQuoteItemsFromBody = (value = '') => {
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

export const parseQuotePaymentFromBody = (value = '') => {
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
export const parseLocationCoord = (value) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
};

export const isValidLat = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
export const isValidLng = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

export const normalizeUrlToken = (value = '') => String(value || '').trim().replace(/[),.;!?]+$/g, '');

export const isLikelyMapUrl = (value = '') => {
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

export const extractMapUrlFromText = (text = '') => {
    const urls = String(text || '').match(/https?:\/\/[^\s]+/gi) || [];
    for (const rawUrl of urls) {
        const mapUrl = normalizeUrlToken(rawUrl);
        if (isLikelyMapUrl(mapUrl)) return mapUrl;
    }
    return null;
};
export const extractFirstNonMapUrlFromText = (text = '') => {
    const urls = String(text || '').match(/https?:\/\/[^\s]+/gi) || [];
    for (const rawUrl of urls) {
        const candidate = normalizeUrlToken(rawUrl);
        if (!candidate) continue;
        if (isLikelyMapUrl(candidate)) continue;
        return candidate;
    }
    return null;
};

export const tryExtractCoordinates = (value = '') => {
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

export const extractCoordsFromText = (text = '') => {
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

export const resolveLocationData = (msg = {}) => {
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
export const GROUP_SENDER_COLORS = [
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

export const getStableHash = (seed = '') => {
    const source = String(seed || '');
    if (!source) return 0;
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

export const getGroupSenderColor = (seed = '') => {
    if (!seed) return '#7de6d2';
    const idx = getStableHash(seed) % GROUP_SENDER_COLORS.length;
    return GROUP_SENDER_COLORS[idx] || '#7de6d2';
};


export const formatFileSizeLabel = (bytes = null) => {
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

export const guessExtensionFromMime = (mime = '') => {
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
    if (type.includes('video/mp4')) return 'mp4';
    if (type.includes('audio/mpeg')) return 'mp3';
    if (type.includes('audio/ogg')) return 'ogg';
    if (type.includes('application/octet-stream')) return 'bin';
    return '';
};

export const getFileExtensionFromName = (filename = '') => {
    const safe = String(filename || '').trim();
    if (!safe.includes('.')) return '';
    const ext = safe.split('.').pop();
    return String(ext || '').trim().toLowerCase();
};

export const sanitizeAttachmentFilename = (value = '') => {
    let text = String(value || '').trim();
    if (!text) return null;
    text = text
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .pop() || '';
    text = text.split('?')[0].split('#')[0].trim();
    text = text
        .replace(/[\u0000-\u001F]/g, '')
        .replace(/[<>:"/\\|?*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+|\.+$/g, '')
        .trim();
    if (!text) return null;
    if (/^(null|undefined|\[object object\]|unknown)$/i.test(text)) return null;
    return text;
};

export const isGenericAttachmentFilename = (value = '') => {
    const base = String(value || '').trim().toLowerCase().replace(/\.[a-z0-9]{1,8}$/i, '');
    if (!base) return true;
    return ['archivo', 'file', 'adjunto', 'attachment', 'document', 'documento', 'media', 'download', 'descarga', 'unknown'].includes(base);
};

export const isMachineLikeAttachmentFilename = (value = '') => {
    const base = String(value || '').trim().replace(/\.[a-z0-9]{1,8}$/i, '').replace(/\s+/g, '');
    if (!base) return true;
    if (/^\d{8,}$/.test(base)) return true;
    if (/^[a-f0-9]{16,}$/i.test(base)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) return true;
    if (/^3EB0[A-F0-9]{8,}$/i.test(base)) return true;
    return false;
};

export const looksLikeFilenameText = (value = '') => {
    const text = String(value || '').trim();
    if (!text || text.length > 180) return false;
    if (/[\r\n]/.test(text)) return false;
    if (/^[A-Za-z0-9+/=]{160,}$/.test(text)) return false;
    if (/\.[A-Za-z0-9]{1,8}$/.test(text)) return true;
    return /^https?:\/\//i.test(text);
};

export const extractFilenameFromBody = (msg = {}) => {
    const body = String(msg?.body || '').trim();
    if (!looksLikeFilenameText(body)) return null;
    return sanitizeAttachmentFilename(body);
};

export const getAttachmentKind = (mimetype = '', extension = '') => {
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

export const buildAttachmentMeta = (msg = {}) => {
    const mimetype = String(msg?.mimetype || '').toLowerCase();
    const extFromMime = guessExtensionFromMime(mimetype);

    const filenameFromMessage = sanitizeAttachmentFilename(msg?.filename);
    const filenameFromBody = extractFilenameFromBody(msg);

    let resolvedName = filenameFromMessage;
    if ((!resolvedName || isGenericAttachmentFilename(resolvedName) || isMachineLikeAttachmentFilename(resolvedName)) && filenameFromBody) {
        resolvedName = filenameFromBody;
    }

    if (resolvedName && !getFileExtensionFromName(resolvedName) && extFromMime) {
        resolvedName = `${resolvedName}.${extFromMime}`;
    }
    if (resolvedName && (isGenericAttachmentFilename(resolvedName) || isMachineLikeAttachmentFilename(resolvedName)) && extFromMime) {
        resolvedName = `documento.${extFromMime}`;
    }
    if (!resolvedName || isMachineLikeAttachmentFilename(resolvedName)) {
        resolvedName = extFromMime ? `documento.${extFromMime}` : 'documento';
    }

    const extension = getFileExtensionFromName(resolvedName) || extFromMime;
    const extensionBadge = extension ? extension.toUpperCase() : 'FILE';
    const kind = getAttachmentKind(mimetype, extension);
    const sizeLabel = formatFileSizeLabel(msg?.fileSizeBytes);

    return {
        filename: resolvedName,
        displayName: resolvedName,
        downloadFilename: resolvedName,
        extensionBadge,
        kindLabel: kind.label,
        accentClass: kind.accentClass,
        icon: kind.icon,
        sizeLabel,
        mimetype: mimetype || 'application/octet-stream'
    };
};
export const renderAttachmentIcon = (icon = 'file') => {
    if (icon === 'pdf') return <FileText size={18} />;
    if (icon === 'doc') return <FileText size={18} />;
    if (icon === 'sheet') return <FileSpreadsheet size={18} />;
    if (icon === 'deck') return <FileType2 size={18} />;
    if (icon === 'archive') return <FileArchive size={18} />;
    if (icon === 'text') return <FileText size={18} />;
    return <FileType2 size={18} />;
};
export const extractPhoneCandidatesFromText = (text = '') => {
    const source = String(text || '');
    if (!source) return [];

    const rawMatches = source.match(/(?:\+?\d[\d\s()\-]{4,}\d)/g) || [];
    const dedupe = new Set();
    const phones = [];

    rawMatches.forEach((entry) => {
        const normalized = String(entry || '').replace(/\D/g, '');
        if (normalized.length < 8 || normalized.length > 15) return;
        if (/^(19|20)\d{6}$/.test(normalized)) return;
        if (dedupe.has(normalized)) return;
        dedupe.add(normalized);
        phones.push(normalized);
    });

    return phones.slice(0, 4);
};
