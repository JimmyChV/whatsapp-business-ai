const { URL } = require('url');

function parseLocationNumber(value) {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}

function extractFirstUrlFromText(text = '') {
    const match = String(text || '').match(/https?:\/\/[^\s]+/i);
    return match ? String(match[0]).replace(/[),.;!?]+$/g, '') : null;
}

function isLikelyMapUrl(value = '') {
    const candidate = String(value || '').trim().replace(/[),.;!?]+$/g, '');
    if (!candidate) return false;
    try {
        const parsed = new URL(candidate);
        const host = String(parsed.hostname || '').toLowerCase();
        const path = String(parsed.pathname || '').toLowerCase();
        if (host.includes('maps.app.goo.gl')) return true;
        if (host === 'goo.gl' && path.startsWith('/maps')) return true;
        if (host.startsWith('maps.google.')) return true;
        if (host === 'maps.google.com') return true;
        if (host.includes('google.') && path.startsWith('/maps')) return true;
        return false;
    } catch (e) {
        return /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|google\.[^\s/]+\/maps/i.test(candidate);
    }
}

function extractMapUrlFromText(text = '') {
    const matches = String(text || '').match(/https?:\/\/[^\s]+/gi) || [];
    for (const raw of matches) {
        const candidate = String(raw || '').replace(/[),.;!?]+$/g, '');
        if (isLikelyMapUrl(candidate)) return candidate;
    }
    return null;
}

function extractCoordsFromText(text = '') {
    const raw = String(text || '');
    if (!raw) return null;
    let value = raw;
    try {
        value = decodeURIComponent(raw);
    } catch (e) {}

    const patterns = [
        /geo:\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
    ];

    for (const pattern of patterns) {
        const match = value.match(pattern);
        if (!match) continue;
        const lat = parseLocationNumber(match[1]);
        const lng = parseLocationNumber(match[2]);
        if (isValidLatitude(lat) && isValidLongitude(lng)) {
            return { latitude: lat, longitude: lng };
        }
    }

    return null;
}

function truncateDisplayValue(value = '', maxLen = 260) {
    const text = String(value ?? '');
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
}

function extractLocationInfo(msg) {
    try {
        const data = msg?._data || {};
        const type = String(msg?.type || data?.type || '').toLowerCase();
        const body = String(msg?.body || data?.body || '').trim();
        const rawLocation = msg?.location || data?.location || data?.loc || {};
        const locationObj = rawLocation && typeof rawLocation === 'object' ? rawLocation : {};

        const directLat = parseLocationNumber(
            locationObj?.latitude
            ?? locationObj?.lat
            ?? data?.latitude
            ?? data?.lat
            ?? data?.latDegrees
        );
        const directLng = parseLocationNumber(
            locationObj?.longitude
            ?? locationObj?.lng
            ?? locationObj?.lon
            ?? data?.longitude
            ?? data?.lng
            ?? data?.lon
            ?? data?.lngDegrees
        );

        let latitude = isValidLatitude(directLat) ? directLat : null;
        let longitude = isValidLongitude(directLng) ? directLng : null;

        const urlFromData = String(
            locationObj?.url
            || data?.clientUrl
            || data?.url
            || ''
        ).trim();
        const urlFromBody = extractMapUrlFromText(body);
        const candidateUrl = isLikelyMapUrl(urlFromData)
            ? urlFromData.replace(/[),.;!?]+$/g, '')
            : (isLikelyMapUrl(urlFromBody || '') ? String(urlFromBody || '').replace(/[),.;!?]+$/g, '') : '');

        if ((latitude === null || longitude === null) && candidateUrl) {
            const fromUrl = extractCoordsFromText(candidateUrl);
            if (fromUrl) {
                latitude = fromUrl.latitude;
                longitude = fromUrl.longitude;
            }
        }

        let bodyCoords = null;
        if ((latitude === null || longitude === null) && body) {
            const fromBody = extractCoordsFromText(body);
            if (fromBody) {
                bodyCoords = fromBody;
                latitude = fromBody.latitude;
                longitude = fromBody.longitude;
            }
        }

        const label = truncateDisplayValue(
            String(
                locationObj?.description
                || locationObj?.name
                || data?.address
                || data?.name
                || ''
            ).trim(),
            180
        ) || null;

        const mapUrl = candidateUrl
            || ((latitude !== null && longitude !== null)
                ? `https://www.google.com/maps?q=${latitude},${longitude}`
                : null);

        if (type !== 'location' && !label && !mapUrl && (latitude === null || longitude === null)) {
            return null;
        }

        return {
            latitude: latitude,
            longitude: longitude,
            label: label,
            mapUrl: mapUrl,
            text: label || ((latitude !== null && longitude !== null) ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'Ubicacion compartida'),
            source: type === 'location' ? 'native' : ((candidateUrl || bodyCoords) ? 'link' : 'native')
        };
    } catch (e) {
        return null;
    }
}

function getMessageTypePreviewLabel(type = '') {
    const value = String(type || '').toLowerCase();
    if (!value) return 'Mensaje';
    if (value === 'image') return 'Imagen';
    if (value === 'video') return 'Video';
    if (value === 'audio') return 'Audio';
    if (value === 'ptt') return 'Nota de voz';
    if (value === 'document') return 'Documento';
    if (value === 'sticker') return 'Sticker';
    if (value === 'location') return 'Ubicacion';
    if (value === 'vcard') return 'Contacto';
    if (value === 'revoked') return 'Mensaje eliminado';
    if (value === 'order') return 'Pedido';
    if (value === 'product') return 'Producto';
    return 'Mensaje';
}

module.exports = {
    parseLocationNumber,
    isValidLatitude,
    isValidLongitude,
    extractFirstUrlFromText,
    extractMapUrlFromText,
    isLikelyMapUrl,
    extractCoordsFromText,
    extractLocationInfo,
    getMessageTypePreviewLabel
};
