const {
    DEFAULT_TENANT_ID,
    normalizeTenantId,
    queryPostgres
} = require('../../../config/persistence-runtime');
const tenantCatalogService = require('./tenant-catalog.service');
const tenantZoneRulesService = require('./tenant-zone-rules.service');
const { isWooConfigured, normalizeWooConfig } = require('./woocommerce.service');

const SEGMENT_RATES = {
    lima_delivery: {
        type: 'delivery',
        label: 'Delivery',
        cost: 8.50,
        free_from: 100,
        time: '72',
        carriers: []
    },
    lima_marvisur: {
        type: 'courier',
        label: 'Marvisur',
        cost: 10.00,
        free_from: 100,
        time: '72',
        carriers: ['marvisur']
    },
    trujillo_delivery: {
        type: 'delivery',
        label: 'Delivery',
        cost: 5.90,
        free_from: 100,
        time: '72',
        carriers: []
    },
    trujillo_costo: {
        type: 'delivery',
        label: 'Delivery',
        cost: 8.50,
        free_from: null,
        time: '72',
        carriers: []
    },
    resto_marvisur: {
        type: 'courier',
        label: 'Marvisur',
        cost: 15.00,
        free_from: 150,
        time: '72',
        carriers: ['marvisur', 'shalom']
    }
};

const DEFAULT_PAYMENT_METHODS = {
    yape: true,
    plin: true,
    bank_transfer: true,
    credit_card: true,
    cash: false
};

const DEFAULT_PAYMENT_MODALITY = {
    advance: true,
    cash_on_delivery: false
};

function normalize(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function text(value = '') {
    return String(value || '').trim();
}

function normalizeWooZoneId(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeWooLocation(location = {}) {
    const source = location && typeof location === 'object' ? location : {};
    return {
        type: text(source.type || '').toLowerCase(),
        code: text(source.code || ''),
        name: text(source.name || '')
    };
}

function extractPostalCodes(locations = []) {
    return ensureArray(locations)
        .filter((location) => String(location?.type || '').trim().toLowerCase() === 'postcode')
        .map((location) => String(location?.code ?? ''))
        .filter((code) => code.length > 0);
}

function detectSegmentKey(wooZone = {}, locations = []) {
    const normalizedLocations = ensureArray(locations).map(normalizeWooLocation);
    const states = normalizedLocations
        .filter((location) => location.type === 'state')
        .map((location) => location.code);
    const hasPostcodes = normalizedLocations.some((location) => location.type === 'postcode');
    const name = normalize(wooZone?.name || '');
    const nameHasAgency = name.includes('agencia') || name.includes('marvisur');

    if (states.includes('PE:LMA') || states.includes('PE:CAL')) {
        if (name.includes('delivery') || name.includes('domicilio')) return 'lima_delivery';
        if (nameHasAgency) return 'lima_marvisur';
        if (hasPostcodes && !nameHasAgency) return 'lima_delivery';
        if (hasPostcodes && nameHasAgency) return 'lima_marvisur';
    }

    if (states.includes('PE:LAL')) {
        if (name.includes('siempre') || name.includes('costo')) return 'trujillo_costo';
        if (hasPostcodes) return 'trujillo_delivery';
    }

    const hasOnlyPeruCountry = normalizedLocations.length > 0
        && normalizedLocations.every((location) => location.type === 'country' && location.code === 'PE');
    if (hasOnlyPeruCountry) return 'resto_marvisur';

    return null;
}

function shippingOptionsFromSegment(segmentKey = '') {
    const rate = SEGMENT_RATES[segmentKey] || null;
    if (!rate) return [];
    return [{
        type: rate.type,
        label: rate.label,
        cost: rate.cost,
        free_from: rate.free_from,
        estimated_time: rate.time,
        is_active: true
    }];
}

function agenciesConfigFromSegment(segmentKey = '') {
    const rate = SEGMENT_RATES[segmentKey] || null;
    if (!rate) return {};
    return {
        carriers: ensureArray(rate.carriers),
        preferred: ensureArray(rate.carriers).includes('marvisur') ? 'marvisur' : (rate.carriers?.[0] || '')
    };
}

function buildWooApiUrl(config = {}, endpoint = '') {
    const cleanConfig = normalizeWooConfig(config);
    const path = String(endpoint || '').startsWith('/') ? endpoint : `/${endpoint}`;
    const url = new URL(`${cleanConfig.baseUrl}${path}`);
    url.searchParams.set('consumer_key', cleanConfig.consumerKey);
    url.searchParams.set('consumer_secret', cleanConfig.consumerSecret);
    url.searchParams.set('_lavitat_sync', String(Date.now()));
    return url;
}

async function fetchWooJson(config = {}, endpoint = '') {
    const url = buildWooApiUrl(config, endpoint);
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            accept: 'application/json',
            'cache-control': 'no-cache',
            pragma: 'no-cache'
        }
    });
    const bodyText = await response.text();
    let payload = null;
    try {
        payload = bodyText ? JSON.parse(bodyText) : null;
    } catch (_) {
        payload = bodyText;
    }
    if (!response.ok) {
        const message = typeof payload?.message === 'string'
            ? payload.message
            : `WooCommerce respondio ${response.status}`;
        throw new Error(message);
    }
    return payload;
}

async function resolveWooCatalog(tenantId = DEFAULT_TENANT_ID, catalogId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanCatalogId = text(catalogId).toUpperCase();
    if (cleanCatalogId) {
        const catalog = await tenantCatalogService.getCatalog(cleanTenantId, cleanCatalogId, { runtime: true });
        if (!catalog) throw new Error('Catalogo WooCommerce no encontrado.');
        return catalog;
    }

    const catalogs = await tenantCatalogService.listCatalogs(cleanTenantId, {
        includeInactive: false,
        runtime: true
    });
    const wooCatalogs = ensureArray(catalogs)
        .filter((catalog) => String(catalog?.sourceType || '').trim().toLowerCase() === 'woocommerce');
    return wooCatalogs.find((catalog) => catalog.isDefault === true) || wooCatalogs[0] || null;
}

async function findExistingWooZoneRule(tenantId = DEFAULT_TENANT_ID, wooZoneId = null) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanWooZoneId = normalizeWooZoneId(wooZoneId);
    if (!cleanWooZoneId) return null;
    await tenantZoneRulesService.listZoneRules(cleanTenantId, { includeInactive: true });
    const { rows } = await queryPostgres(
        `SELECT rule_id, name, color, rules_json, payment_methods, payment_modality, ubigeo_codes
           FROM tenant_zone_rules
          WHERE tenant_id = $1
            AND woo_zone_id = $2
          LIMIT 1`,
        [cleanTenantId, cleanWooZoneId]
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function buildRulePayload({
    wooZone = {},
    methods = [],
    locations = [],
    existing = null
} = {}) {
    const wooZoneId = normalizeWooZoneId(wooZone?.id);
    const segmentKey = detectSegmentKey(wooZone, locations);
    const ruleId = existing?.rule_id || `WOO-ZONE-${wooZoneId}`;
    const normalizedLocations = ensureArray(locations).map(normalizeWooLocation);
    const previousRules = existing?.rules_json && typeof existing.rules_json === 'object' ? existing.rules_json : {};
    const manualPostalCodes = ensureArray(previousRules.manualPostalCodes);
    const wooPostalCodes = extractPostalCodes(normalizedLocations);
    const normalizedMethods = ensureArray(methods).map((method) => ({
        id: method?.id ?? null,
        methodId: text(method?.method_id || method?.methodId || ''),
        title: text(method?.title || ''),
        enabled: method?.enabled !== false
    }));

    return {
        ruleId,
        name: text(wooZone?.name || '') || `Zona Woo ${wooZoneId}`,
        color: text(existing?.color || '') || '#00A884',
        rulesJson: {
            ...previousRules,
            woo: {
                zoneId: wooZoneId,
                zoneName: text(wooZone?.name || ''),
                methods: normalizedMethods,
                locations: normalizedLocations
            },
            manualPostalCodes,
            ubigeoLabels: previousRules.ubigeoLabels && typeof previousRules.ubigeoLabels === 'object'
                ? previousRules.ubigeoLabels
                : {}
        },
        shippingOptions: shippingOptionsFromSegment(segmentKey),
        paymentMethods: existing?.payment_methods && typeof existing.payment_methods === 'object'
            ? existing.payment_methods
            : DEFAULT_PAYMENT_METHODS,
        paymentModality: existing?.payment_modality && typeof existing.payment_modality === 'object'
            ? existing.payment_modality
            : DEFAULT_PAYMENT_MODALITY,
        wooZoneId,
        postalCodes: Array.from(new Set([...wooPostalCodes, ...manualPostalCodes].map(text).filter(Boolean))),
        ubigeoCodes: ensureArray(existing?.ubigeo_codes),
        segmentKey,
        agenciesConfig: agenciesConfigFromSegment(segmentKey),
        isActive: true
    };
}

async function syncZonesFromWooCommerce(tenantId = DEFAULT_TENANT_ID, catalogId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const catalog = await resolveWooCatalog(cleanTenantId, catalogId);
    if (!catalog) throw new Error('No hay catalogos WooCommerce activos para sincronizar zonas.');

    const wooConfig = catalog?.config?.woocommerce && typeof catalog.config.woocommerce === 'object'
        ? catalog.config.woocommerce
        : {};
    if (!isWooConfigured(wooConfig)) throw new Error('Credenciales WooCommerce incompletas para sincronizar zonas.');

    const zonesPayload = await fetchWooJson(wooConfig, '/wp-json/wc/v3/shipping/zones');
    const wooZones = ensureArray(zonesPayload)
        .filter((zone) => normalizeWooZoneId(zone?.id));

    const syncedZones = [];
    for (const wooZone of wooZones) {
        const wooZoneId = normalizeWooZoneId(wooZone?.id);
        const [methods, locations] = await Promise.all([
            fetchWooJson(wooConfig, `/wp-json/wc/v3/shipping/zones/${wooZoneId}/methods`),
            fetchWooJson(wooConfig, `/wp-json/wc/v3/shipping/zones/${wooZoneId}/locations`)
        ]);
        const existing = await findExistingWooZoneRule(cleanTenantId, wooZoneId);
        const payload = buildRulePayload({
            wooZone,
            methods,
            locations,
            existing
        });
        if (existing?.name && text(existing.name) !== payload.name) {
            console.log('[WooZones] zone name updated from WooCommerce', {
                tenantId: cleanTenantId,
                wooZoneId,
                from: text(existing.name),
                to: payload.name
            });
        }
        const saved = await tenantZoneRulesService.saveZoneRule(cleanTenantId, payload);
        syncedZones.push(saved || payload);
    }

    console.log(`[WooZones] synced ${syncedZones.length} zones from WooCommerce`, {
        tenantId: cleanTenantId,
        catalogId: catalog.catalogId
    });

    return {
        synced: syncedZones.length,
        catalogId: catalog.catalogId,
        zones: syncedZones
    };
}

module.exports = {
    SEGMENT_RATES,
    detectSegmentKey,
    syncZonesFromWooCommerce
};
