const { queryPostgres } = require('../../../config/persistence-runtime');

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

function normalizeName(value = '') {
    return text(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function resolveOfficialDistrict(placeNames = []) {
    const candidates = Array.from(new Set(safeArray(placeNames).map(text).filter(Boolean)));
    for (const placeName of candidates) {
        const normalized = normalizeName(placeName);
        if (!normalized) continue;
        try {
            const { rows } = await queryPostgres(
                `SELECT id, name
                   FROM geo_locations
                  WHERE normalized_name = $1
                    AND type = 'district'
                    AND COALESCE(is_active, TRUE) = TRUE
                  ORDER BY id ASC
                  LIMIT 1`,
                [normalized]
            );
            const row = rows?.[0];
            if (row?.id && row?.name) {
                return {
                    district: text(row.name),
                    districtGeoId: text(row.id)
                };
            }
        } catch (error) {
            console.warn('[Geocoding] official district lookup skipped:', {
                placeName,
                message: String(error?.message || error)
            });
            break;
        }
    }
    return {
        district: candidates[0] || null,
        districtGeoId: null
    };
}

function normalizeGeocodeResult(result = {}) {
    const components = safeArray(result.address_components);
    const districtCandidates = [
        componentName(components, ['administrative_area_level_3']),
        componentName(components, ['sublocality_level_1']),
        componentName(components, ['locality'])
    ].filter(Boolean);
    return {
        postcode: componentName(components, ['postal_code']),
        district: districtCandidates[0] || null,
        districtCandidates,
        districtGeoId: null,
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
        districtGeoId: null,
        province: null,
        department: null,
        formattedAddress: null,
        lat: Number.isFinite(cleanLat) ? cleanLat : null,
        lng: Number.isFinite(cleanLng) ? cleanLng : null
    };
    if (!Number.isFinite(cleanLat) || !Number.isFinite(cleanLng) || !cleanApiKey) return empty;

    try {
        const result = normalizeGeocodeResult(await fetchGeocodeResult(cleanLat, cleanLng, cleanApiKey, '', 5000));
        const officialDistrict = await resolveOfficialDistrict(result.districtCandidates);
        return {
            ...result,
            district: officialDistrict.district || result.district || null,
            districtGeoId: officialDistrict.districtGeoId || null,
            postcode: result.postcode || null,
            lat: cleanLat,
            lng: cleanLng
        };
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
