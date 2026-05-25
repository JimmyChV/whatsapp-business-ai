const {
    DEFAULT_TENANT_ID,
    normalizeTenantId
} = require('../../../config/persistence-runtime');
const zoneCoverageResolverService = require('./zone-coverage-resolver.service');
const logisticsAgenciesSyncService = require('./logistics-agencies-sync.service');
const tenantZoneRulesService = require('./tenant-zone-rules.service');

const COURIER_SEGMENTS = new Set(['lima_marvisur', 'resto_marvisur']);
const LOGISTICS_INTENTS = new Set([
    'ask_coverage',
    'ask_agencies',
    'ask_general_coverage',
    'ask_payment',
    'doubt_coverage',
    'location_change'
]);

function text(value = '') {
    return String(value || '').trim();
}

function lower(value = '') {
    return text(value).toLowerCase();
}

function normalizeLookup(value = '') {
    return lower(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function safeObject(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function isValidCoords(lat, lng) {
    return Number.isFinite(lat)
        && Number.isFinite(lng)
        && lat >= -90
        && lat <= 90
        && lng >= -180
        && lng <= 180;
}

function formatMoney(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `S/ ${parsed.toFixed(2)}` : 'por confirmar';
}

function formatEstimatedTime(value) {
    const hours = Number.parseInt(String(value ?? ''), 10) || 0;
    if (!hours) return '';
    if (hours >= 48) return `${Math.round(hours / 24)} dias habiles`;
    if (hours === 24) return '1 dia habil';
    return `${hours} horas`;
}

function formatLocationName(value = '') {
    return text(value)
        .toLowerCase()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDistance(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '';
    return `${parsed.toFixed(parsed >= 10 ? 1 : 2)} km aprox.`;
}

function carrierKey(value = '') {
    const normalized = normalizeLookup(value);
    if (normalized.includes('marvisur')) return 'marvisur';
    if (normalized.includes('shalom')) return 'shalom';
    return normalized || 'agency';
}

function carrierLabel(value = '') {
    const key = carrierKey(value);
    if (key === 'marvisur') return 'Marvisur';
    if (key === 'shalom') return 'Shalom';
    return formatLocationName(value || 'Agencia');
}

function firstActiveShippingOption(zone = {}) {
    const options = ensureArray(zone.shippingOptions || zone.shipping_options);
    return options.find((item) => item && item.is_active !== false && item.isActive !== false) || options[0] || null;
}

function normalizeZone(zone = null) {
    if (!zone) return null;
    return {
        ...zone,
        ruleId: text(zone.ruleId || zone.rule_id || ''),
        name: text(zone.name || ''),
        segmentKey: text(zone.segmentKey || zone.segment_key || ''),
        shippingOptions: ensureArray(zone.shippingOptions || zone.shipping_options),
        paymentMethods: safeObject(zone.paymentMethods || zone.payment_methods),
        paymentModality: safeObject(zone.paymentModality || zone.payment_modality),
        agenciesConfig: safeObject(zone.agenciesConfig || zone.agencies_config)
    };
}

function buildShippingSummary(zone = {}) {
    const normalizedZone = normalizeZone(zone);
    const shipping = firstActiveShippingOption(normalizedZone || {}) || {};
    const type = lower(shipping.type || '');
    const paymentMethods = safeObject(normalizedZone?.paymentMethods);
    const paymentModality = safeObject(normalizedZone?.paymentModality);
    const paymentLabels = [
        paymentMethods.yape ? 'Yape' : '',
        paymentMethods.plin ? 'Plin' : '',
        paymentMethods.bank_transfer || paymentMethods.bankTransfer ? 'Transferencia bancaria' : '',
        paymentMethods.credit_card || paymentMethods.creditCard ? 'Tarjeta de credito' : '',
        paymentMethods.cash ? 'Efectivo' : ''
    ].filter(Boolean);
    const advanceEnabled = paymentModality.advance === true || paymentModality.advance === 'true';
    const cashOnDeliveryEnabled = paymentModality.cash_on_delivery === true
        || paymentModality.cashOnDelivery === true
        || paymentModality.cash_on_delivery === 'true'
        || paymentModality.cashOnDelivery === 'true';
    const modalityPhrase = advanceEnabled && cashOnDeliveryEnabled
        ? 'anticipado o contraentrega'
        : (advanceEnabled ? 'pago anticipado' : (cashOnDeliveryEnabled ? 'contraentrega' : ''));
    return {
        zoneName: normalizedZone?.name || 'tu zona',
        segmentKey: normalizedZone?.segmentKey || '',
        shippingType: type === 'courier' ? 'courier' : 'delivery',
        shippingLabel: text(shipping.label || (type === 'courier' ? 'Agencia' : 'Delivery')),
        cost: Number(shipping.cost),
        freeFrom: shipping.free_from ?? shipping.freeFrom ?? null,
        estimatedTime: formatEstimatedTime(shipping.estimated_time || shipping.estimatedTime || shipping.time),
        paymentLabels,
        paymentPhrase: paymentLabels.length ? paymentLabels.join(', ') : 'los metodos configurados',
        modalityPhrase
    };
}

function hasLogisticsLocationHint(normalized = '') {
    return /\b(vivo en|estoy en|me encuentro en|para|en|a|hacia|desde|y en|y para)\b/.test(normalized);
}

function detectLogisticsIntent(value = '', history = []) {
    const normalized = normalizeLookup(value);
    if (!normalized) return 'none';
    if (/\b(a que lugares|a que lugares llegan|a donde envian|donde tienen cobertura|donde hay cobertura|donde llegan|a donde llegan|que zonas|a que zonas|que zonas cubren|zonas de cobertura|lugares tienen cobertura)\b/.test(normalized)) {
        return 'ask_general_coverage';
    }
    if (/\b(estas seguro|estan seguros|esta seguro|seguro tienen|seguro|cobertura completa|toda la zona|todo lima|llegan realmente|si llegan|confirmame cobertura|confirmar cobertura)\b/.test(normalized)) {
        return 'doubt_coverage';
    }
    if (/\b(por que agencia|que agencia|agencia|agencias|shalom|marvisur|courier|donde recojo|recojo|punto de recojo|por cual agencia|dime una agencia|con que agencia|trabajan con)\b/.test(normalized)) {
        return 'ask_agencies';
    }
    if (/\b(contraentrega|contra entrega|pago|pagar|yape|plin|transferencia|tarjeta|efectivo|metodos de pago|formas de pago)\b/.test(normalized)) {
        return 'ask_payment';
    }
    if (/\b(envio|envios|delivery|reparto|cobertura|llegan|llega|entrega|despacho|despachan|mandan|hacen envio|tienen envio)\b/.test(normalized)) {
        return 'ask_coverage';
    }
    if (hasLogisticsLocationHint(normalized) && /\b(y en|y para|vivo en|estoy en|me encuentro en|para)\b/.test(normalized)) {
        return 'location_change';
    }
    const recent = ensureArray(history).slice(-4).join('\n');
    if (recent && /\b(envio|reparto|cobertura|agencia)\b/.test(normalizeLookup(recent)) && hasLogisticsLocationHint(normalized)) {
        return 'location_change';
    }
    return 'none';
}

function buildLocationInput(resolvedLocation = {}, lastMessage = '') {
    const source = safeObject(resolvedLocation);
    const lat = numberOrNull(source.lat ?? source.latitude);
    const lng = numberOrNull(source.lng ?? source.longitude);
    const postcode = text(source.postcode || source.postalCode || source.postal_code || '');
    const lookupText = text(source.text || source.query || source.location || '');
    if (isValidCoords(lat, lng)) return { lat, lng };
    if (postcode) return { postcode };
    if (lookupText) return { text: lookupText };
    return lastMessage ? { text: lastMessage } : {};
}

function salesStateLocationInput(salesStateLocation = {}) {
    const source = safeObject(salesStateLocation);
    const lat = numberOrNull(source.lat ?? source.latitude);
    const lng = numberOrNull(source.lng ?? source.longitude);
    const postcode = text(source.postcode || source.postalCode || source.postal_code || '');
    if (isValidCoords(lat, lng)) return { lat, lng };
    if (postcode) return { postcode };
    return {};
}

function locationLabel(coverage = {}, fallback = '') {
    const location = safeObject(coverage.resolvedLocation);
    return formatLocationName(location.district || location.province || location.department || fallback || coverage.zone?.name || 'tu zona');
}

function freeFromLine(summary = {}) {
    const freeFrom = Number(summary.freeFrom);
    if (!Number.isFinite(freeFrom) || freeFrom <= 0) return '';
    return `gratis desde ${formatMoney(freeFrom)}`;
}

function buildPaymentSentence(summary = {}) {
    const modality = text(summary.modalityPhrase);
    return `Puedes pagar con ${summary.paymentPhrase}${modality ? `, ${modality}` : ''} 😊`;
}

function agencyHours(agency = {}) {
    return text(agency.hoursWeek || agency.hours_week || agency.hoursDelivery || agency.hours_delivery || agency.hoursSunday || agency.hours_sunday || '');
}

function normalizeAgency(agency = null) {
    if (!agency) return null;
    return {
        ...agency,
        carrier: carrierKey(agency.carrier),
        name: text(agency.name || agency.fullName || agency.full_name || 'Agencia'),
        address: text(agency.address || ''),
        district: text(agency.district || agency.city || ''),
        phonePrimary: text(agency.phonePrimary || agency.phone_primary || ''),
        hoursWeek: text(agency.hoursWeek || agency.hours_week || ''),
        hoursDelivery: text(agency.hoursDelivery || agency.hours_delivery || ''),
        distanceKm: Number(agency.distanceKm ?? agency.distance_km)
    };
}

async function findOneAgencyPerCarrier(tenantId, lat, lng, carriers = ['marvisur', 'shalom']) {
    if (!isValidCoords(lat, lng)) return {};
    const entries = await Promise.all(carriers.map(async (carrier) => {
        const items = await logisticsAgenciesSyncService.findNearestAgencies(tenantId, lat, lng, 1, [carrier]);
        return [carrier, normalizeAgency(items[0] || null)];
    }));
    return Object.fromEntries(entries.filter(([, agency]) => agency));
}

function agencyBlock(carrier = '', agency = null) {
    if (!agency) return '';
    const label = carrierLabel(carrier || agency.carrier);
    const prefix = carrierKey(carrier || agency.carrier) === 'marvisur' ? '🟠' : '🔵';
    const address = [agency.address, agency.district].map(text).filter(Boolean).join(', ');
    const phone = text(agency.phonePrimary);
    const hours = agencyHours(agency);
    const distance = formatDistance(agency.distanceKm);
    return [
        `${prefix} *${label}* — ${agency.name}`,
        address || '',
        phone ? `📞 ${phone}` : '',
        hours ? `🕐 ${hours}` : '',
        distance ? `📏 ${distance}` : ''
    ].filter(Boolean).join('\n');
}

function buildAgenciesResponse({ coverage = {}, summary = {}, agencies = {} } = {}) {
    const district = locationLabel(coverage, summary.zoneName);
    const blocks = [
        agencyBlock('marvisur', agencies.marvisur),
        agencyBlock('shalom', agencies.shalom)
    ].filter(Boolean);
    if (!blocks.length) {
        return [
            `📍 Te ubiqué en ${district} 😊`,
            `Para tu zona enviamos por agencia 📦`,
            'No tengo agencias cercanas cargadas ahora mismo, pero puedo coordinar el envio con las agencias disponibles.',
            '¿Avanzamos con tu pedido? 😊'
        ].join('\n');
    }
    const freeFrom = freeFromLine(summary);
    return [
        `📍 Te ubiqué en ${district} 😊`,
        '',
        'Agencias más cercanas a ti:',
        '',
        blocks.join('\n\n'),
        '',
        `Costo de envío: *${formatMoney(summary.cost)}*`,
        freeFrom ? `Gratis desde ${formatMoney(summary.freeFrom)}` : '',
        summary.estimatedTime ? `⏱ ${summary.estimatedTime}` : '',
        '',
        '¿Coordino el envío por Marvisur o Shalom? 😊'
    ].filter((line) => line !== '').join('\n');
}

function buildDeliveryResponse({ coverage = {}, summary = {} } = {}) {
    const district = locationLabel(coverage, summary.zoneName);
    const freeFrom = freeFromLine(summary);
    return [
        `📍 Te ubiqué en ${district} 😊`,
        '🚚 Hacemos *reparto a domicilio* en tu zona.',
        `Costo: *${formatMoney(summary.cost)}*${freeFrom ? `, ${freeFrom}` : ''}`,
        summary.estimatedTime ? `⏱ ${summary.estimatedTime}` : '',
        buildPaymentSentence(summary)
    ].filter(Boolean).join('\n');
}

function buildCourierWithoutGpsResponse({ coverage = {}, summary = {} } = {}) {
    const district = locationLabel(coverage, summary.zoneName);
    const freeFrom = freeFromLine(summary);
    return [
        `Para ${district} enviamos por agencia 📦`,
        'Trabajamos con *Marvisur* y *Shalom*.',
        `Costo: *${formatMoney(summary.cost)}*${freeFrom ? `, ${freeFrom}` : ''}`,
        summary.estimatedTime ? `⏱ ${summary.estimatedTime}` : '',
        'Para indicarte la agencia más cercana a ti,',
        '¿puedes compartirme tu ubicación? 😊',
        'Toca el clip → *Ubicación* → Enviar 📍'
    ].filter(Boolean).join('\n');
}

function buildPaymentResponse({ coverage = {}, summary = {} } = {}) {
    const district = locationLabel(coverage, summary.zoneName);
    return `Para ${district}, ${buildPaymentSentence(summary).replace(/^Puedes pagar con /, 'puedes pagar con ')}`;
}

function buildGpsRequestResponse() {
    return [
        'Entiendo la duda 😊 Para confirmarte con exactitud, ¿puedes enviarme tu ubicación?',
        'Así te digo exactamente si llegamos a tu zona.',
        'Toca el clip → *Ubicación* → Enviar 📍'
    ].join('\n');
}

function buildGeneralCoverageResponse() {
    return [
        'Tenemos cobertura en las siguientes zonas:',
        '🚚 *Reparto a domicilio:* Lima Metropolitana y Trujillo (zonas seleccionadas)',
        '📦 *Envío por agencia:* Todo el Perú vía Marvisur y Shalom',
        '¿Me dices desde qué zona nos escribes? 😊'
    ].join('\n');
}

function buildAgenciesWithoutZoneResponse() {
    return [
        'Trabajamos con *Marvisur* y *Shalom* 📦',
        '¿Me dices desde qué zona nos escribes?',
        'Así te indico la agencia más cercana a ti 😊'
    ].join('\n');
}

function buildNoCoverageResponse(coverage = {}) {
    const district = locationLabel(coverage, '');
    const label = district && district !== 'Tu Zona' ? ` en ${district}` : '';
    return [
        `No tengo una zona de envío configurada${label} 😊`,
        'Déjame derivarte con el equipo para revisarlo con precisión.'
    ].join('\n');
}

function hasRecognizedLocation(coverage = {}) {
    const location = safeObject(coverage.resolvedLocation);
    return Boolean(
        text(location.postcode)
        || text(location.district)
        || text(location.province)
        || text(location.department)
        || text(location.formattedAddress)
        || numberOrNull(location.lat) !== null
        || numberOrNull(location.lng) !== null
    );
}

async function findFallbackCourierZone(tenantId = DEFAULT_TENANT_ID) {
    const rules = await tenantZoneRulesService.listZoneRules(tenantId, { includeInactive: false });
    return ensureArray(rules).find((rule) => text(rule.segmentKey || rule.segment_key) === 'resto_marvisur') || null;
}

function isCourierZone(zone = null) {
    const normalized = normalizeZone(zone);
    if (!normalized) return false;
    const summary = buildShippingSummary(normalized);
    return summary.shippingType === 'courier' || COURIER_SEGMENTS.has(normalized.segmentKey);
}

function coverageHasGps(coverage = {}, input = {}) {
    const lat = numberOrNull(input.lat ?? coverage?.resolvedLocation?.lat);
    const lng = numberOrNull(input.lng ?? coverage?.resolvedLocation?.lng);
    return isValidCoords(lat, lng);
}

function responseForCoverage({ intent, coverage, agencies, input } = {}) {
    const zone = normalizeZone(coverage?.zone);
    if (!zone) {
        if (coverage?.ambiguous || coverage?.needsGps || intent === 'doubt_coverage') {
            return {
                responseText: buildGpsRequestResponse(),
                needsGps: true,
                gpsReason: 'ambiguous_zone'
            };
        }
        return {
            responseText: buildNoCoverageResponse(coverage),
            needsGps: false,
            gpsReason: null
        };
    }
    const summary = buildShippingSummary(zone);
    if (intent === 'ask_payment') {
        return {
            responseText: buildPaymentResponse({ coverage, summary }),
            needsGps: false,
            gpsReason: null
        };
    }
    if (intent === 'doubt_coverage') {
        return {
            responseText: buildGpsRequestResponse(),
            needsGps: true,
            gpsReason: 'ambiguous_zone'
        };
    }
    if (isCourierZone(zone)) {
        if (coverageHasGps(coverage, input)) {
            return {
                responseText: buildAgenciesResponse({ coverage, summary, agencies }),
                needsGps: false,
                gpsReason: null
            };
        }
        return {
            responseText: buildCourierWithoutGpsResponse({ coverage, summary }),
            needsGps: true,
            gpsReason: 'for_agencies'
        };
    }
    return {
        responseText: buildDeliveryResponse({ coverage, summary }),
        needsGps: false,
        gpsReason: null
    };
}

async function resolveCoverageForInput(tenantId, input = {}) {
    const source = safeObject(input);
    if (!source.text && !source.postcode && !isValidCoords(numberOrNull(source.lat), numberOrNull(source.lng))) {
        return null;
    }
    return zoneCoverageResolverService.resolveZoneCoverage(tenantId, source);
}

async function resolveLogisticsDecision({
    tenantId = DEFAULT_TENANT_ID,
    lastMessage = '',
    chatHistory = [],
    resolvedLocation = null,
    salesStateLocation = null,
    moduleId = ''
} = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
    const cleanMessage = text(lastMessage);
    const normalized = normalizeLookup(cleanMessage);
    const explicitInput = buildLocationInput(resolvedLocation || {}, '');
    const hasExplicitInput = Boolean(explicitInput.text || explicitInput.postcode || isValidCoords(numberOrNull(explicitInput.lat), numberOrNull(explicitInput.lng)));
    const hasGpsInput = isValidCoords(numberOrNull(explicitInput.lat), numberOrNull(explicitInput.lng));
    let intent = hasExplicitInput && !normalized
        ? 'ask_coverage'
        : detectLogisticsIntent(cleanMessage, chatHistory);
    if (intent === 'none' && hasGpsInput) intent = 'ask_coverage';

    if (!LOGISTICS_INTENTS.has(intent)) {
        return {
            intent,
            hasLogisticsDecision: false,
            responseText: null,
            zone: null,
            agencies: null,
            needsGps: false,
            gpsReason: null,
            shouldClearLocation: false
        };
    }

    if (intent === 'ask_general_coverage') {
        return {
            intent,
            hasLogisticsDecision: true,
            responseText: buildGeneralCoverageResponse(),
            zone: null,
            agencies: null,
            needsGps: false,
            gpsReason: null,
            shouldClearLocation: false
        };
    }

    const shouldUseMessageLocation = hasExplicitInput
        || intent === 'ask_coverage'
        || intent === 'location_change'
        || intent === 'doubt_coverage';
    const stateLocationInput = salesStateLocationInput(salesStateLocation || {});
    const input = shouldUseMessageLocation
        ? (hasExplicitInput ? explicitInput : buildLocationInput({ text: cleanMessage }, cleanMessage))
        : stateLocationInput;

    if (intent === 'ask_agencies'
        && !stateLocationInput.postcode
        && !isValidCoords(numberOrNull(stateLocationInput.lat), numberOrNull(stateLocationInput.lng))
        && !hasLogisticsLocationHint(normalized)) {
        return {
            intent,
            hasLogisticsDecision: true,
            responseText: buildAgenciesWithoutZoneResponse(),
            zone: null,
            agencies: null,
            needsGps: false,
            gpsReason: null,
            shouldClearLocation: false
        };
    }

    if (!input.text && !input.postcode && !isValidCoords(numberOrNull(input.lat), numberOrNull(input.lng))) {
        if (intent === 'ask_agencies') {
            return {
                intent,
                hasLogisticsDecision: true,
                responseText: buildAgenciesWithoutZoneResponse(),
                zone: null,
                agencies: null,
                needsGps: false,
                gpsReason: null,
                shouldClearLocation: false
            };
        }
        if (intent === 'ask_payment') {
            return {
                intent,
                hasLogisticsDecision: false,
                responseText: null,
                zone: null,
                agencies: null,
                needsGps: false,
                gpsReason: null,
                shouldClearLocation: false
            };
        }
        return {
            intent,
            hasLogisticsDecision: true,
            responseText: buildGpsRequestResponse(),
            zone: null,
            agencies: null,
            needsGps: true,
            gpsReason: 'ambiguous_zone',
            shouldClearLocation: false
        };
    }

    let coverage = await resolveCoverageForInput(cleanTenantId, input);
    let zone = normalizeZone(coverage?.zone);
    let fallbackApplied = false;
    if (!zone && coverage && !coverage.ambiguous && !coverage.needsGps && hasRecognizedLocation(coverage)) {
        const fallbackZone = await findFallbackCourierZone(cleanTenantId);
        if (fallbackZone) {
            coverage = {
                ...coverage,
                zone: fallbackZone
            };
            zone = normalizeZone(fallbackZone);
            fallbackApplied = true;
        }
    }
    const gpsLat = numberOrNull(input.lat ?? coverage?.resolvedLocation?.lat);
    const gpsLng = numberOrNull(input.lng ?? coverage?.resolvedLocation?.lng);
    const agencies = zone && isCourierZone(zone) && isValidCoords(gpsLat, gpsLng)
        ? await findOneAgencyPerCarrier(cleanTenantId, gpsLat, gpsLng)
        : {};
    const decision = responseForCoverage({
        intent: intent === 'location_change' ? 'ask_coverage' : intent,
        coverage: coverage || {},
        agencies,
        input
    });

    return {
        intent,
        hasLogisticsDecision: Boolean(decision.responseText),
        responseText: decision.responseText || null,
        zone,
        agencies: Object.keys(agencies).length ? agencies : null,
        resolvedLocation: coverage?.resolvedLocation || null,
        resolvedBy: coverage?.resolvedBy || null,
        ambiguous: Boolean(coverage?.ambiguous),
        needsGps: Boolean(decision.needsGps),
        gpsReason: decision.gpsReason || null,
        shouldClearLocation: intent === 'location_change',
        fallbackApplied,
        shouldEscalate: !zone && !fallbackApplied && coverage && !coverage.ambiguous && !coverage.needsGps && hasRecognizedLocation(coverage),
        advisorReason: !zone && !fallbackApplied && coverage && !coverage.ambiguous && !coverage.needsGps && hasRecognizedLocation(coverage)
            ? 'zona_sin_fallback_logistico'
            : null
    };
}

module.exports = {
    detectLogisticsIntent,
    resolveLogisticsDecision,
    formatEstimatedTime
};
