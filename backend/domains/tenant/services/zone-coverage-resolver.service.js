const {
    DEFAULT_TENANT_ID,
    normalizeTenantId
} = require('../../../config/persistence-runtime');
const tenantIntegrationsService = require('./integrations.service');
const tenantZoneRulesService = require('./tenant-zone-rules.service');
const geoLocationService = require('./geo-location.service');
const logisticsAgenciesSyncService = require('./logistics-agencies-sync.service');
const geocodingService = require('../../channels/services/geocoding.service');

function text(value = '') {
    return String(value || '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function safeObject(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeStringArray(value = []) {
    return Array.from(new Set(
        ensureArray(value)
            .map((item) => text(item))
            .filter(Boolean)
    ));
}

function normalizeNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeZoneRule(rule = {}) {
    const source = safeObject(rule);
    if (!source.ruleId && !source.rule_id) return null;
    return {
        ruleId: text(source.ruleId || source.rule_id),
        name: text(source.name || ''),
        segmentKey: text(source.segmentKey || source.segment_key || ''),
        shippingOptions: ensureArray(source.shippingOptions || source.shipping_options),
        paymentMethods: safeObject(source.paymentMethods || source.payment_methods),
        paymentModality: safeObject(source.paymentModality || source.payment_modality),
        agenciesConfig: safeObject(source.agenciesConfig || source.agencies_config)
    };
}

function normalizeAgency(item = {}) {
    return {
        id: item.id ?? null,
        carrier: lower(item.carrier),
        name: text(item.name || item.fullName || item.full_name || ''),
        fullName: text(item.fullName || item.full_name || item.name || ''),
        address: text(item.address || ''),
        referenceText: text(item.referenceText || item.reference_text || ''),
        phonePrimary: text(item.phonePrimary || item.phone_primary || ''),
        department: text(item.department || ''),
        province: text(item.province || ''),
        city: text(item.city || ''),
        district: text(item.district || ''),
        latitude: normalizeNumberOrNull(item.latitude),
        longitude: normalizeNumberOrNull(item.longitude),
        hoursWeek: text(item.hoursWeek || item.hours_week || ''),
        hoursSunday: text(item.hoursSunday || item.hours_sunday || ''),
        hoursDelivery: text(item.hoursDelivery || item.hours_delivery || ''),
        distanceKm: normalizeNumberOrNull(item.distanceKm || item.distance_km)
    };
}

function buildResolvedLocation(input = {}) {
    return {
        postcode: text(input.postcode || input.postalCode || input.postal_code || '') || null,
        district: text(input.district || '') || null,
        province: text(input.province || '') || null,
        department: text(input.department || '') || null,
        formattedAddress: text(input.formattedAddress || input.formatted_address || '') || null
    };
}

function findZonesByPostalCode(zoneRules = [], postcode = '') {
    const cleanPostcode = text(postcode);
    if (!cleanPostcode) return [];
    return ensureArray(zoneRules)
        .filter((rule) => rule?.isActive !== false && rule?.is_active !== false)
        .filter((rule) => normalizeStringArray(rule.postalCodes || rule.postal_codes).includes(cleanPostcode));
}

function extractCarrierFilters(zoneRule = null) {
    const normalized = normalizeZoneRule(zoneRule);
    if (!normalized) return null;
    const configured = normalizeStringArray(normalized.agenciesConfig?.carriers).map(lower).filter(Boolean);
    if (configured.length) return configured;
    const fromShipping = ensureArray(normalized.shippingOptions)
        .filter((option) => lower(option?.type) === 'courier' && option?.is_active !== false && option?.isActive !== false)
        .map((option) => lower(option?.label))
        .filter(Boolean);
    return fromShipping.length ? fromShipping : null;
}

async function getGoogleMapsApiKey(tenantId = DEFAULT_TENANT_ID) {
    try {
        const config = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
        return text(config?.geo?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || '');
    } catch (error) {
        console.warn('[Coverage] Google Maps API key lookup skipped:', error?.message || error);
        return text(process.env.GOOGLE_MAPS_API_KEY || '');
    }
}

function resultFromZone({
    zone = null,
    agencies = null,
    resolvedBy = null,
    resolvedLocation = null,
    ambiguous = false,
    needsGps = false
} = {}) {
    return {
        zone: normalizeZoneRule(zone),
        agencies: agencies === null ? null : ensureArray(agencies).map(normalizeAgency).filter((item) => item.name),
        resolvedBy,
        resolvedLocation: resolvedLocation ? buildResolvedLocation(resolvedLocation) : null,
        ambiguous: Boolean(ambiguous),
        needsGps: Boolean(needsGps)
    };
}

async function resolveByPostalCode(zoneRules = [], postcode = '') {
    const matches = findZonesByPostalCode(zoneRules, postcode);
    if (matches.length === 1) {
        return { zone: matches[0], ambiguous: false, needsGps: false };
    }
    if (matches.length > 1) {
        return { zone: null, ambiguous: true, needsGps: true, matches };
    }
    return { zone: null, ambiguous: false, needsGps: false };
}

async function resolveByText(zoneRules = [], value = '') {
    const cleanText = text(value);
    if (!cleanText) return { zone: null, location: null, ambiguous: false, needsGps: false };
    const location = await geoLocationService.resolveLocationFromText(cleanText, { zoneRules });
    if (location?.confidence === 'ambiguous') {
        return { zone: null, location, ambiguous: true, needsGps: true };
    }
    const zoneMatch = geoLocationService.resolveZoneFromLocation(location, zoneRules);
    if (zoneMatch?.needsGps) {
        return { zone: null, location, ambiguous: true, needsGps: true, matches: zoneMatch.matches };
    }
    return {
        zone: zoneMatch?.rule || null,
        location,
        ambiguous: false,
        needsGps: false
    };
}

async function resolveZoneCoverage(tenantId = DEFAULT_TENANT_ID, input = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const source = safeObject(input);
    const lat = normalizeNumberOrNull(source.lat ?? source.latitude);
    const lng = normalizeNumberOrNull(source.lng ?? source.longitude);
    const postcode = text(source.postcode || source.postalCode || source.postal_code || '');
    const lookupText = text(source.text || source.query || source.location || '');
    const zoneRules = await tenantZoneRulesService.listZoneRules(cleanTenantId, { includeInactive: false });

    if (lat !== null && lng !== null) {
        const apiKey = await getGoogleMapsApiKey(cleanTenantId);
        const geocoded = await geocodingService.getLocationFromCoords(lat, lng, apiKey);
        const resolvedLocation = buildResolvedLocation(geocoded);
        const postalCandidate = text(resolvedLocation.postcode || postcode);
        let zoneResolution = postalCandidate
            ? await resolveByPostalCode(zoneRules, postalCandidate)
            : { zone: null, ambiguous: false, needsGps: false };

        if (!zoneResolution.zone && !zoneResolution.ambiguous) {
            const locationText = [
                resolvedLocation.district,
                resolvedLocation.province,
                resolvedLocation.department
            ].filter(Boolean).join(', ');
            if (locationText) zoneResolution = await resolveByText(zoneRules, locationText);
        }

        const carriers = extractCarrierFilters(zoneResolution.zone);
        const agencies = await logisticsAgenciesSyncService.findNearestAgencies(
            cleanTenantId,
            lat,
            lng,
            6,
            carriers
        );

        return resultFromZone({
            zone: zoneResolution.zone,
            agencies,
            resolvedBy: 'gps',
            resolvedLocation: {
                ...resolvedLocation,
                postcode: postalCandidate || resolvedLocation.postcode || null
            },
            ambiguous: zoneResolution.ambiguous,
            needsGps: zoneResolution.needsGps
        });
    }

    if (postcode) {
        const zoneResolution = await resolveByPostalCode(zoneRules, postcode);
        return resultFromZone({
            zone: zoneResolution.zone,
            agencies: null,
            resolvedBy: 'postcode',
            resolvedLocation: { postcode },
            ambiguous: zoneResolution.ambiguous,
            needsGps: zoneResolution.needsGps
        });
    }

    if (lookupText) {
        const zoneResolution = await resolveByText(zoneRules, lookupText);
        const location = zoneResolution.location || {};
        return resultFromZone({
            zone: zoneResolution.zone,
            agencies: null,
            resolvedBy: 'text',
            resolvedLocation: {
                postcode: location.postalCode || location.postcode || null,
                district: location.district || null,
                province: location.province || null,
                department: location.department || null
            },
            ambiguous: zoneResolution.ambiguous,
            needsGps: zoneResolution.needsGps
        });
    }

    return resultFromZone({
        zone: null,
        agencies: null,
        resolvedBy: null,
        resolvedLocation: null,
        ambiguous: false,
        needsGps: false
    });
}

module.exports = {
    resolveZoneCoverage
};
