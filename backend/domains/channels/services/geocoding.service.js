function text(value = '') {
    return String(value || '').trim();
}

function safeArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function findAddressComponent(components = [], type = '') {
    return safeArray(components).find((component) => safeArray(component?.types).includes(type)) || null;
}

function componentName(components = [], types = []) {
    for (const type of types) {
        const component = findAddressComponent(components, type);
        const value = text(component?.long_name || component?.short_name || '');
        if (value) return value;
    }
    return null;
}

function normalizeGeocodeResult(result = {}) {
    const components = safeArray(result.address_components);
    return {
        postcode: componentName(components, ['postal_code']),
        district: componentName(components, [
            'sublocality_level_1',
            'sublocality',
            'locality',
            'administrative_area_level_3'
        ]),
        province: componentName(components, ['administrative_area_level_2']),
        department: componentName(components, ['administrative_area_level_1']),
        formattedAddress: text(result.formatted_address) || null
    };
}

async function fetchGeocodeResult(lat, lng, apiKey = '', resultType = '', timeoutMs = 5000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
    try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('latlng', `${lat},${lng}`);
        if (resultType) url.searchParams.set('result_type', resultType);
        url.searchParams.set('language', 'es');
        url.searchParams.set('key', apiKey);
        const response = await fetch(url, {
            method: 'GET',
            headers: { accept: 'application/json' },
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !safeArray(payload?.results).length) {
            throw new Error(payload?.error_message || payload?.status || `Google Geocoding ${response.status}`);
        }
        return payload.results[0] || {};
    } finally {
        clearTimeout(timeout);
    }
}

async function getLocationFromCoords(lat, lng, apiKey = '') {
    const cleanLat = Number(lat);
    const cleanLng = Number(lng);
    const cleanApiKey = text(apiKey || process.env.GOOGLE_MAPS_API_KEY || '');
    const empty = {
        postcode: null,
        district: null,
        province: null,
        department: null,
        formattedAddress: null
    };
    if (!Number.isFinite(cleanLat) || !Number.isFinite(cleanLng) || !cleanApiKey) return empty;

    const startedAt = Date.now();
    try {
        try {
            const postalResult = normalizeGeocodeResult(await fetchGeocodeResult(cleanLat, cleanLng, cleanApiKey, 'postal_code', 3000));
            if (postalResult.postcode) return postalResult;
        } catch (postalError) {
            console.warn('[Geocoding] postal_code lookup skipped; trying full reverse geocoding:', {
                message: String(postalError?.message || postalError)
            });
        }
        const remainingMs = Math.max(1000, 5000 - (Date.now() - startedAt));
        const fallbackResult = normalizeGeocodeResult(await fetchGeocodeResult(cleanLat, cleanLng, cleanApiKey, '', remainingMs));
        return { ...fallbackResult, postcode: fallbackResult.postcode || null };
    } catch (error) {
        console.warn('[Geocoding] reverse geocoding skipped:', {
            message: String(error?.message || error)
        });
        return empty;
    }
}

module.exports = {
    getLocationFromCoords
};
