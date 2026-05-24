function ensureAuthenticated(req, res, authService) {
    if (authService.isAuthEnabled() && !req?.authContext?.isAuthenticated) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return false;
    }
    return true;
}

const multer = require('multer');
const { TextDecoder } = require('util');
const { parseCsvRows } = require('../helpers/customers-normalizers.helpers');
const geoLocationService = require('../services/geo-location.service');
const wooZonesSyncService = require('../services/woo-zones-sync.service');
const logisticsAgenciesSyncService = require('../services/logistics-agencies-sync.service');
const zoneCoverageResolverService = require('../services/zone-coverage-resolver.service');
const tenantIntegrationsService = require('../services/integrations.service');
const { extractLocationInfoAsync } = require('../../channels/helpers/message-location.helpers');
const sharp = require('sharp');

const erpImportUpload = multer({ storage: multer.memoryStorage() });

function createImportRequestId(prefix = 'erpimp') {
    return `${String(prefix || 'erpimp').trim() || 'erpimp'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function decodeCsvBuffer(buffer) {
    const safeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from([]);
    if (!safeBuffer.length) return '';
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(safeBuffer);
    } catch (_) {
        return new TextDecoder('latin1').decode(safeBuffer);
    }
}

function parseUploadedCsv(file, delimiter = ',') {
    if (!file?.buffer) return [];
    const rows = parseCsvRows(decodeCsvBuffer(file.buffer).replace(/^\uFEFF/, ''), delimiter);
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const headers = (rows[0] || []).map((entry) => String(entry || '').replace(/\uFEFF/g, '').trim());
    return rows.slice(1).map((row, index) => {
        const item = { __rowNumber: index + 2 };
        headers.forEach((header, headerIndex) => {
            if (!header) return;
            item[header] = String(row?.[headerIndex] || '').trim();
        });
        return item;
    }).filter((item) => Object.keys(item).some((key) => key !== '__rowNumber' && String(item[key] || '').trim()));
}

function parseCoordinateValue(value) {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function isValidStaticMapCoordinate(lat, lng) {
    return Number.isFinite(lat)
        && Number.isFinite(lng)
        && lat >= -90
        && lat <= 90
        && lng >= -180
        && lng <= 180;
}

function staticMapMarkerForCarrier(carrier = '') {
    const value = String(carrier || '').trim().toLowerCase();
    if (value.includes('shalom')) return 'color:0x2563EB|label:S';
    if (value.includes('marvisur')) return 'color:0xF97316|label:M';
    return 'color:blue|label:A';
}

async function fetchImageWithTimeout(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 5000));
    try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        const contentType = String(response?.headers?.get('content-type') || 'image/png').split(';')[0] || 'image/png';
        const isImage = contentType.toLowerCase().startsWith('image/');
        const arrayBuffer = response?.ok && isImage ? await response.arrayBuffer() : null;
        const textBody = response?.ok && isImage ? '' : await response.text().catch(() => '');
        return {
            ok: Boolean(response?.ok && isImage),
            status: response?.status || 0,
            contentType,
            buffer: arrayBuffer ? Buffer.from(arrayBuffer) : null,
            error: textBody
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            contentType: 'image/png',
            buffer: null,
            error: String(error?.message || error || 'fetch_failed')
        };
    } finally {
        clearTimeout(timer);
    }
}

function escapeSvgText(value = '') {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function truncateSvgText(value = '', maxLength = 42) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function staticMapCarrierStyle(carrier = '') {
    const value = String(carrier || '').trim().toLowerCase();
    if (value.includes('marvisur')) {
        return { fill: '#F97316', stroke: '#9A3412', label: 'M', name: 'Marvisur', route: '0xF97316FF' };
    }
    if (value.includes('shalom')) {
        return { fill: '#2563EB', stroke: '#1E3A8A', label: 'S', name: 'Shalom', route: '0x2563EBFF' };
    }
    return { fill: '#475569', stroke: '#0F172A', label: 'A', name: 'Agencia', route: '0x475569FF' };
}

function normalizeStaticMapAgency(agency = {}) {
    const lat = parseCoordinateValue(agency?.latitude ?? agency?.lat);
    const lng = parseCoordinateValue(agency?.longitude ?? agency?.lng);
    if (!isValidStaticMapCoordinate(lat, lng)) return null;
    return {
        lat,
        lng,
        carrier: String(agency?.carrier || '').trim(),
        name: String(agency?.name || agency?.fullName || agency?.full_name || 'Agencia').trim(),
        address: String(agency?.address || '').trim(),
        district: String(agency?.district || agency?.city || '').trim(),
        distanceKm: agency?.distanceKm ?? agency?.distance_km ?? null
    };
}

function formatStaticMapDistance(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `${parsed.toFixed(1)} km` : '';
}

function haversineStaticMapKm(latA, lngA, latB, lngB) {
    const toRad = (value) => (Number(value) * Math.PI) / 180;
    const dLat = toRad(latB - latA);
    const dLng = toRad(lngB - lngA);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function estimateStaticMapDuration(distanceKm) {
    const parsed = Number(distanceKm);
    if (!Number.isFinite(parsed) || parsed <= 0) return '';
    const minutes = Math.max(6, Math.round((parsed / 20) * 60));
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest ? `${hours} h ${rest} min aprox.` : `${hours} h aprox.`;
    }
    return `${minutes} min aprox.`;
}

function agencyIdentity(agency = {}) {
    return [
        String(agency.carrier || '').toLowerCase(),
        String(agency.name || '').toLowerCase(),
        String(agency.address || '').toLowerCase()
    ].join('|');
}

function enrichStaticMapAgencies({ lat, lng, agencies = [], routes = [] } = {}) {
    const routeByIdentity = new Map(routes.map((route) => [agencyIdentity(route.agency || route), route]));
    return agencies
        .map(normalizeStaticMapAgency)
        .filter(Boolean)
        .map((agency) => {
            const distanceKm = Number.isFinite(Number(agency.distanceKm))
                ? Number(agency.distanceKm)
                : haversineStaticMapKm(lat, lng, agency.lat, agency.lng);
            const route = routeByIdentity.get(agencyIdentity(agency)) || null;
            return {
                ...agency,
                distanceKm,
                distanceText: route?.distanceText || formatStaticMapDistance(distanceKm),
                durationText: route?.durationText || estimateStaticMapDuration(distanceKm),
                routePolyline: route?.polyline || ''
            };
        });
}

function selectStaticMapAgencies({ lat, lng, agencies = [], routes = [], max = 4 } = {}) {
    const enriched = enrichStaticMapAgencies({ lat, lng, agencies, routes })
        .sort((left, right) => Number(left.distanceKm || 9999) - Number(right.distanceKm || 9999));
    const selected = [];
    const add = (agency) => {
        if (!agency) return;
        if (selected.some((item) => agencyIdentity(item) === agencyIdentity(agency))) return;
        selected.push(agency);
    };
    add(enriched.find((agency) => String(agency.carrier || '').toLowerCase().includes('marvisur')));
    add(enriched.find((agency) => String(agency.carrier || '').toLowerCase().includes('shalom')));
    enriched.forEach(add);
    return selected
        .slice(0, Math.max(2, Number(max) || 4))
        .sort((left, right) => Number(left.distanceKm || 9999) - Number(right.distanceKm || 9999));
}

async function fetchJsonWithTimeout(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 5000));
    try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        const body = await response.json().catch(() => null);
        return { ok: Boolean(response?.ok), status: response?.status || 0, body };
    } catch (error) {
        return { ok: false, status: 0, body: null, error: String(error?.message || error || 'fetch_failed') };
    } finally {
        clearTimeout(timer);
    }
}

async function fetchGoogleRoute({ apiKey = '', lat, lng, agency = {} } = {}) {
    if (!apiKey || !agency?.lat || !agency?.lng) return null;
    const params = new URLSearchParams();
    params.set('origin', `${lat},${lng}`);
    params.set('destination', `${agency.lat},${agency.lng}`);
    params.set('mode', 'driving');
    params.set('language', 'es');
    params.set('region', 'pe');
    params.set('key', apiKey);
    const result = await fetchJsonWithTimeout(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`, 5000);
    if (!result.ok || result.body?.status !== 'OK') return null;
    const route = Array.isArray(result.body?.routes) ? result.body.routes[0] : null;
    const leg = Array.isArray(route?.legs) ? route.legs[0] : null;
    if (!leg) return null;
    return {
        agency,
        distanceText: String(leg.distance?.text || '').trim(),
        durationText: String(leg.duration?.text || '').trim(),
        polyline: String(route?.overview_polyline?.points || '').trim()
    };
}

function buildGoogleCoverageStaticMapUrl({ apiKey = '', lat, lng, agencies = [] } = {}) {
    const params = new URLSearchParams();
    params.set('size', '640x640');
    params.set('scale', '2');
    params.set('maptype', 'roadmap');
    params.append('markers', `color:red|label:C|${lat},${lng}`);
    params.append('visible', `${lat},${lng}`);
    agencies.forEach((agency) => {
        const style = staticMapCarrierStyle(agency.carrier);
        params.append('markers', `color:${style.fill.replace('#', '0x')}|label:${style.label}|${agency.lat},${agency.lng}`);
        params.append('visible', `${agency.lat},${agency.lng}`);
        if (agency.routePolyline) {
            params.append('path', `color:${style.route}|weight:5|enc:${agency.routePolyline}`);
        }
    });
    params.set('key', apiKey);
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

function buildLocalCoverageSvg({ lat, lng, agencies = [], zoneName = '', routes = [] } = {}) {
    const width = 720;
    const height = 1280;
    const normalizedAgencies = selectStaticMapAgencies({ lat, lng, agencies, routes, max: 4 });
    const points = [{ lat, lng, type: 'client' }, ...normalizedAgencies.map((agency) => ({ ...agency, type: 'agency' }))];
    const lats = points.map((point) => point.lat);
    const lngs = points.map((point) => point.lng);
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);
    if (Math.abs(maxLat - minLat) < 0.002) {
        minLat -= 0.004;
        maxLat += 0.004;
    }
    if (Math.abs(maxLng - minLng) < 0.002) {
        minLng -= 0.004;
        maxLng += 0.004;
    }
    const plot = (point) => {
        const x = 58 + ((point.lng - minLng) / (maxLng - minLng)) * 604;
        const y = 164 + ((maxLat - point.lat) / (maxLat - minLat)) * 492;
        return {
            x: Math.max(48, Math.min(672, x)),
            y: Math.max(148, Math.min(682, y))
        };
    };
    const agencyMarkers = normalizedAgencies.map((agency, index) => {
        const position = plot(agency);
        const style = staticMapCarrierStyle(agency.carrier);
        const offset = index % 2 === 0 ? 20 : -20;
        return `
            <g>
                <circle cx="${position.x}" cy="${position.y}" r="18" fill="${style.fill}" stroke="#FFFFFF" stroke-width="5"/>
                <text x="${position.x}" y="${position.y + 6}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="800" fill="#FFFFFF">${style.label}</text>
                <text x="${Math.max(44, Math.min(582, position.x + offset))}" y="${Math.max(150, position.y - 28)}" font-family="Arial" font-size="14" font-weight="800" fill="${style.stroke}">${escapeSvgText(truncateSvgText(agency.name, 25))}</text>
            </g>`;
    }).join('');
    const client = plot({ lat, lng });
    const agencyRows = normalizedAgencies.map((agency, index) => {
        const style = staticMapCarrierStyle(agency.carrier);
        const y = 810 + (index * 100);
        return `
            <g>
                <rect x="34" y="${y - 44}" width="652" height="86" rx="22" fill="#FFFFFF" opacity="0.96"/>
                <circle cx="68" cy="${y - 12}" r="18" fill="${style.fill}"/>
                <text x="68" y="${y - 5}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="800" fill="#FFFFFF">${style.label}</text>
                <text x="96" y="${y - 23}" font-family="Arial" font-size="19" font-weight="900" fill="#111827">${escapeSvgText(truncateSvgText(agency.name, 36))}</text>
                <text x="96" y="${y + 2}" font-family="Arial" font-size="14" font-weight="700" fill="${style.stroke}">${escapeSvgText(style.name)} - ${escapeSvgText(agency.distanceText || formatStaticMapDistance(agency.distanceKm))} - ${escapeSvgText(agency.durationText || estimateStaticMapDuration(agency.distanceKm))}</text>
                <text x="96" y="${y + 26}" font-family="Arial" font-size="13" fill="#64748B">${escapeSvgText(truncateSvgText([agency.address, agency.district].filter(Boolean).join(', '), 65))}</text>
            </g>`;
    }).join('');
    const title = zoneName ? `Cobertura: ${zoneName}` : 'Mapa de cobertura';
    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stop-color="#F8FAFC"/>
                    <stop offset="100%" stop-color="#EEF7E6"/>
                </linearGradient>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.16"/>
                </filter>
            </defs>
            <rect width="${width}" height="${height}" rx="28" fill="url(#bg)"/>
            <text x="34" y="58" font-family="Arial" font-size="29" font-weight="900" fill="#111827">${escapeSvgText(truncateSvgText(title, 34))}</text>
            <text x="34" y="91" font-family="Arial" font-size="15" fill="#64748B">Ubicacion del cliente: ${lat.toFixed(6)}, ${lng.toFixed(6)}</text>
            <rect x="24" y="116" width="672" height="596" rx="28" fill="#DFF3EE" stroke="#B8D9CD"/>
            <path d="M46 270 C152 210, 284 322, 410 250 S594 218, 684 292" stroke="#FFFFFF" stroke-width="28" fill="none" opacity="0.95"/>
            <path d="M42 540 C190 440, 284 584, 440 500 S608 430, 690 494" stroke="#FFFFFF" stroke-width="25" fill="none" opacity="0.95"/>
            <path d="M150 128 C188 274, 146 468, 210 698" stroke="#B7E3D4" stroke-width="18" fill="none"/>
            <path d="M510 128 C458 282, 560 468, 526 698" stroke="#B7E3D4" stroke-width="18" fill="none"/>
            <path d="M24 400 L696 400" stroke="#C8EADB" stroke-width="8" opacity="0.8"/>
            <path d="M360 116 L360 712" stroke="#C8EADB" stroke-width="8" opacity="0.8"/>
            ${agencyMarkers}
            <g filter="url(#shadow)">
                <path d="M${client.x} ${client.y + 42} C${client.x - 39} ${client.y - 6}, ${client.x - 28} ${client.y - 58}, ${client.x} ${client.y - 58} C${client.x + 28} ${client.y - 58}, ${client.x + 39} ${client.y - 6}, ${client.x} ${client.y + 42} Z" fill="#E11D48"/>
                <circle cx="${client.x}" cy="${client.y - 21}" r="15" fill="#FFFFFF"/>
            </g>
            <rect x="34" y="728" width="652" height="34" rx="17" fill="#FFFFFF" opacity="0.92"/>
            <text x="58" y="751" font-family="Arial" font-size="14" font-weight="800" fill="#475569">Rojo: cliente</text>
            <text x="210" y="751" font-family="Arial" font-size="14" font-weight="800" fill="#9A3412">Naranja: Marvisur</text>
            <text x="430" y="751" font-family="Arial" font-size="14" font-weight="800" fill="#1E3A8A">Azul: Shalom</text>
            <text x="34" y="794" font-family="Arial" font-size="24" font-weight="900" fill="#111827">Agencias cercanas</text>
            ${agencyRows || '<text x="34" y="850" font-family="Arial" font-size="16" fill="#64748B">Sin agencias cercanas registradas</text>'}
            <text x="34" y="1228" font-family="Arial" font-size="14" fill="#64748B">Imagen generada por Lavitat para referencia de cobertura.</text>
            <text x="34" y="1254" font-family="Arial" font-size="12" fill="#94A3B8">Si no ves calles reales, Google Static Maps no esta disponible y usamos el respaldo local.</text>
        </svg>`;
}

async function generateLocalCoverageMapPng({ lat, lng, agencies = [], zoneName = '', routes = [] } = {}) {
    const svg = buildLocalCoverageSvg({ lat, lng, agencies, zoneName, routes });
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return {
        ok: true,
        status: 200,
        contentType: 'image/png',
        buffer,
        error: ''
    };
}

async function composeCoverageSharePng({ mapBuffer, lat, lng, agencies = [], zoneName = '', provider = 'google' } = {}) {
    const selected = selectStaticMapAgencies({ lat, lng, agencies, max: 4 });
    const width = 720;
    const height = 1280;
    const mapMask = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="668" height="592"><rect x="0" y="0" width="668" height="592" rx="24" ry="24" fill="#fff"/></svg>');
    const mapImage = await sharp(mapBuffer)
        .resize(668, 592, { fit: 'cover' })
        .composite([{ input: mapMask, blend: 'dest-in' }])
        .png()
        .toBuffer();
    const agencyRows = selected.map((agency, index) => {
        const style = staticMapCarrierStyle(agency.carrier);
        const y = 810 + (index * 100);
        return `
            <g>
                <rect x="34" y="${y - 44}" width="652" height="86" rx="22" fill="#FFFFFF" opacity="0.97"/>
                <circle cx="68" cy="${y - 12}" r="18" fill="${style.fill}"/>
                <text x="68" y="${y - 5}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="800" fill="#FFFFFF">${style.label}</text>
                <text x="96" y="${y - 23}" font-family="Arial" font-size="19" font-weight="900" fill="#111827">${escapeSvgText(truncateSvgText(agency.name, 36))}</text>
                <text x="96" y="${y + 2}" font-family="Arial" font-size="14" font-weight="700" fill="${style.stroke}">${escapeSvgText(style.name)} - ${escapeSvgText(agency.distanceText || formatStaticMapDistance(agency.distanceKm))} - ${escapeSvgText(agency.durationText || estimateStaticMapDuration(agency.distanceKm))}</text>
                <text x="96" y="${y + 26}" font-family="Arial" font-size="13" fill="#64748B">${escapeSvgText(truncateSvgText([agency.address, agency.district].filter(Boolean).join(', '), 65))}</text>
            </g>`;
    }).join('');
    const title = zoneName ? `Cobertura: ${zoneName}` : 'Mapa de cobertura';
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stop-color="#F8FAFC"/>
                    <stop offset="100%" stop-color="#EEF7E6"/>
                </linearGradient>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.16"/>
                </filter>
            </defs>
            <rect width="${width}" height="${height}" rx="28" fill="url(#bg)"/>
            <text x="34" y="58" font-family="Arial" font-size="29" font-weight="900" fill="#111827">${escapeSvgText(truncateSvgText(title, 34))}</text>
            <text x="34" y="91" font-family="Arial" font-size="15" fill="#64748B">Rutas desde la ubicacion del cliente</text>
            <rect x="24" y="116" width="672" height="596" rx="28" fill="#FFFFFF" filter="url(#shadow)"/>
            <rect x="24" y="116" width="672" height="596" rx="28" fill="none" stroke="#D8D0C4" stroke-width="2"/>
            <rect x="34" y="728" width="652" height="34" rx="17" fill="#FFFFFF" opacity="0.92"/>
            <text x="58" y="751" font-family="Arial" font-size="14" font-weight="800" fill="#475569">Rojo: cliente</text>
            <text x="210" y="751" font-family="Arial" font-size="14" font-weight="800" fill="#9A3412">Naranja: Marvisur</text>
            <text x="430" y="751" font-family="Arial" font-size="14" font-weight="800" fill="#1E3A8A">Azul: Shalom</text>
            <text x="34" y="794" font-family="Arial" font-size="24" font-weight="900" fill="#111827">Agencias cercanas</text>
            ${agencyRows}
            <text x="34" y="1228" font-family="Arial" font-size="14" fill="#64748B">Mapa real con calles y rutas generado para WhatsApp.</text>
            <text x="34" y="1254" font-family="Arial" font-size="12" fill="#94A3B8">Proveedor: ${escapeSvgText(provider)} - Distancias sujetas a trafico y disponibilidad de ruta.</text>
        </svg>`;
    return sharp(Buffer.from(svg))
        .composite([{ input: mapImage, top: 118, left: 26 }])
        .png()
        .toBuffer();
}

function buildOsmStaticMapUrl({ lat, lng, agencies = [] } = {}) {
    const params = new URLSearchParams();
    params.set('center', `${lat},${lng}`);
    params.set('zoom', '14');
    params.set('size', '600x400');
    const markers = [`${lat},${lng},red-pushpin`];
    agencies.slice(0, 3).forEach((agency) => {
        const agencyLat = parseCoordinateValue(agency?.latitude ?? agency?.lat);
        const agencyLng = parseCoordinateValue(agency?.longitude ?? agency?.lng);
        if (!isValidStaticMapCoordinate(agencyLat, agencyLng)) return;
        markers.push(`${agencyLat},${agencyLng},blue-pushpin`);
    });
    params.set('markers', markers.join('|'));
    return `https://staticmap.openstreetmap.de/staticmap.php?${params.toString()}`;
}

function registerTenantCustomerHttpRoutes({
    app,
    authService,
    accessPolicyService,
    customerService,
    customerAddressesService,
    customerCatalogsService,
    tenantZoneRulesService,
    waModuleService,
    isTenantAllowedForUser,
    hasPermission
}) {
    if (!app) throw new Error('registerTenantCustomerHttpRoutes requiere app.');

    function hasLabelsReadAccess(req) {
        return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_LABELS_READ);
    }

    function hasLabelsManageAccess(req) {
        return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_LABELS_MANAGE);
    }

    function hasZonesReadAccess(req) {
        return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_ZONES_READ)
            || hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_ZONES_MANAGE);
    }

    function hasZonesManageAccess(req) {
        return hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_ZONES_MANAGE);
    }

    function hasCoverageResolveAccess(req) {
        return hasZonesReadAccess(req)
            || hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CHAT_OPERATE);
    }

    app.get('/api/admin/saas/tenants/:tenantId/customers', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_READ)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const query = String(req.query?.q || req.query?.query || '').trim();
            const moduleId = String(req.query?.moduleId || '').trim();
            const updatedSince = String(req.query?.updatedSince || '').trim();
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() !== 'false';
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const result = await customerService.listCustomers(tenantId, {
                query,
                moduleId,
                updatedSince,
                includeInactive,
                limit,
                offset
            });
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar clientes.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/customers/:customerId/identities', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const customerId = String(req.params?.customerId || '').trim();
        if (!tenantId || !customerId) return res.status(400).json({ ok: false, error: 'tenantId/customerId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_READ)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const moduleId = String(req.query?.moduleId || '').trim();
            const channelType = String(req.query?.channelType || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const result = await customerService.listCustomerIdentities(tenantId, {
                customerId,
                moduleId,
                channelType,
                limit,
                offset
            });
            return res.json({ ok: true, tenantId, customerId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar identidades del cliente.') });
        }
    });

    app.get('/api/admin/saas/tenants/:tenantId/customers/:customerId/channel-events', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const customerId = String(req.params?.customerId || '').trim();
        if (!tenantId || !customerId) return res.status(400).json({ ok: false, error: 'tenantId/customerId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_READ)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const moduleId = String(req.query?.moduleId || '').trim();
            const chatId = String(req.query?.chatId || '').trim();
            const channelType = String(req.query?.channelType || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const result = await customerService.listChannelEvents(tenantId, {
                customerId,
                moduleId,
                chatId,
                channelType,
                limit,
                offset
            });
            return res.json({ ok: true, tenantId, customerId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar eventos del cliente.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/customers', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const result = await customerService.upsertCustomer(tenantId, payload, { allowPhoneMerge: true });
            return res.status(result?.created ? 201 : 200).json({ ok: true, tenantId, created: Boolean(result?.created), item: result?.item || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar cliente.') });
        }
    });

    app.put('/api/admin/saas/tenants/:tenantId/customers/:customerId', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        const customerId = String(req.params?.customerId || '').trim();
        if (!tenantId || !customerId) return res.status(400).json({ ok: false, error: 'tenantId/customerId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const patch = req.body && typeof req.body === 'object' ? req.body : {};
            const result = await customerService.updateCustomer(tenantId, customerId, patch);
            return res.json({ ok: true, tenantId, item: result?.item || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar cliente.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/customers/import-csv', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const csvText = String(req.body?.csvText || '').trim();
            const moduleId = String(req.body?.moduleId || '').trim();
            const delimiter = String(req.body?.delimiter || '').trim();
            const result = await customerService.importCustomersCsv(tenantId, csvText, { moduleId, delimiter });
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo importar CSV de clientes.') });
        }
    });

    app.post(
        '/api/admin/saas/tenants/:tenantId/customers/import-erp',
        (req, _res, next) => {
            console.log('[ERP-IMPORT][HTTP] incoming multipart request');
            next();
        },
        erpImportUpload.fields([
            { name: 'file_clientes', maxCount: 1 },
            { name: 'file_direcciones', maxCount: 1 }
        ]),
        async (req, res) => {
            const tenantId = String(req.params?.tenantId || '').trim();
            if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
            if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }

            try {
                const mode = String(req.body?.mode || 'preview').trim().toLowerCase();
                console.log('[ERP-IMPORT][HTTP] multipart parsed mode=%s tenant=%s', mode, tenantId);
                if (mode !== 'preview' && mode !== 'commit') {
                    throw new Error('mode invalido. Usa preview o commit.');
                }

                const fileClientes = Array.isArray(req.files?.file_clientes) ? req.files.file_clientes[0] : null;
                const fileDirecciones = Array.isArray(req.files?.file_direcciones) ? req.files.file_direcciones[0] : null;
                if (!fileClientes?.buffer) {
                    throw new Error('El archivo file_clientes es obligatorio.');
                }
                console.log(
                    '[ERP-IMPORT][HTTP] files ready clientesBytes=%s direccionesBytes=%s',
                    Number(fileClientes?.buffer?.length || 0),
                    Number(fileDirecciones?.buffer?.length || 0)
                );

                const importId = String(req.body?.importId || '').trim() || createImportRequestId(mode === 'commit' ? 'erpcommit' : 'erppreview');
                if (typeof customerService.setErpImportProgress === 'function') {
                    customerService.setErpImportProgress(importId, {
                        tenantId,
                        mode,
                        status: mode === 'preview' ? 'analyzing' : 'running',
                        phase: 'parsing_clients',
                        message: 'Leyendo exportacion de AppSheet...',
                        percent: mode === 'preview' ? 5 : 1,
                        counts: {}
                    });
                }
                await new Promise((resolve) => setImmediate(resolve));

                console.log('[ERP-IMPORT][HTTP] parsing clientes importId=%s', importId);
                const clientesRows = parseUploadedCsv(fileClientes, ';');
                console.log('[ERP-IMPORT][HTTP] parsed clientes rows=%s importId=%s', clientesRows.length, importId);

                if (typeof customerService.setErpImportProgress === 'function') {
                    customerService.setErpImportProgress(importId, {
                        tenantId,
                        mode,
                        status: mode === 'preview' ? 'analyzing' : 'running',
                        phase: 'parsing_addresses',
                        message: fileDirecciones?.buffer
                            ? 'Leyendo archivo de direcciones ERP...'
                            : 'Validando clientes AppSheet...',
                        percent: mode === 'preview' ? 15 : 3,
                        counts: {
                            totalRows: clientesRows.length
                        }
                    });
                }
                await new Promise((resolve) => setImmediate(resolve));

                console.log('[ERP-IMPORT][HTTP] parsing direcciones importId=%s', importId);
                const direccionesRows = parseUploadedCsv(fileDirecciones, ',');
                console.log('[ERP-IMPORT][HTTP] parsed direcciones rows=%s importId=%s', direccionesRows.length, importId);

                console.log('[ERP-IMPORT][HTTP] invoking service importId=%s mode=%s', importId, mode);
                const result = await customerService.importCustomersFromAppSheet(tenantId, {
                    importId,
                    clientesRows,
                    direccionesRows,
                    moduleId: String(req.body?.moduleId || '').trim(),
                    mode
                });
                console.log('[ERP-IMPORT][HTTP] service completed importId=%s mode=%s', importId, mode);
                return res.json({ ok: true, tenantId, ...result });
            } catch (error) {
                console.error('[ERP-IMPORT][HTTP] failed', error?.message, error?.stack);
                return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo importar ERP.') });
            }
        }
    );

    app.get('/api/admin/saas/tenants/:tenantId/customers/import-erp-progress', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const importId = String(req.query?.importId || '').trim();
            if (!importId) {
                return res.status(400).json({ ok: false, error: 'importId invalido.' });
            }
            const progress = customerService.getErpImportProgress(importId, tenantId);
            if (!progress) {
                return res.json({
                    ok: true,
                    tenantId,
                    progress: {
                        importId,
                        tenantId,
                        status: 'pending',
                        phase: 'starting',
                        mode: 'commit',
                        message: 'Preparando importacion ERP...',
                        percent: 1,
                        counts: {}
                    }
                });
            }
            return res.json({ ok: true, tenantId, progress });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo consultar el progreso de la importacion ERP.') });
        }
    });

    app.post('/api/admin/saas/tenants/:tenantId/customers/import-erp-cancel', async (req, res) => {
        const tenantId = String(req.params?.tenantId || '').trim();
        if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId invalido.' });
        if (!isTenantAllowedForUser(req, tenantId) || !hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
            return res.status(403).json({ ok: false, error: 'No autorizado.' });
        }

        try {
            const importId = String(req.body?.importId || '').trim();
            if (!importId) {
                return res.status(400).json({ ok: false, error: 'importId invalido.' });
            }
            const progress = typeof customerService.cancelErpImportProgress === 'function'
                ? customerService.cancelErpImportProgress(importId, tenantId)
                : null;
            if (!progress) {
                return res.status(404).json({ ok: false, error: 'No se encontro una importacion activa para cancelar.' });
            }
            return res.json({ ok: true, tenantId, progress });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cancelar la importacion ERP.') });
        }
    });

    app.get('/api/tenant/customers', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const query = String(req.query?.q || req.query?.query || '').trim();
            const moduleId = String(req.query?.moduleId || '').trim();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() !== 'false';

            const result = await customerService.listCustomers(tenantId, {
                query,
                moduleId,
                limit,
                offset,
                includeInactive
            });

            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar clientes.') });
        }
    });

    app.get('/api/tenant/customers/chat-search', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const query = String(req.query?.q || req.query?.query || '').trim();
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() !== 'false';
            const limit = Number(req.query?.limit || 24);

            const result = await customerService.searchCustomersForChat(tenantId, {
                query,
                includeInactive,
                limit
            });

            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron buscar clientes para chat.') });
        }
    });

    app.get('/api/tenant/zone-rules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasZonesReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const includeInactive = String(req.query?.includeInactive || '').trim().toLowerCase() === 'true';
            const items = await tenantZoneRulesService.listZoneRules(tenantId, { includeInactive });
            return res.json({ ok: true, tenantId, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar zonas.') });
        }
    });

    app.post('/api/tenant/zone-rules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasZonesManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await tenantZoneRulesService.saveZoneRule(tenantId, payload);
            return res.status(201).json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo guardar zona.') });
        }
    });

    app.put('/api/tenant/zone-rules/:ruleId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasZonesManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const ruleId = String(req.params?.ruleId || '').trim();
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await tenantZoneRulesService.saveZoneRule(tenantId, { ...payload, ruleId });
            return res.json({ ok: true, tenantId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar zona.') });
        }
    });

    app.delete('/api/tenant/zone-rules/:ruleId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasZonesManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const ruleId = String(req.params?.ruleId || '').trim();
            const result = await tenantZoneRulesService.deleteZoneRule(tenantId, ruleId);
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar zona.') });
        }
    });

    app.post('/api/tenant/zone-rules/recalculate', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasZonesManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const result = await tenantZoneRulesService.recalculateZonesForTenant(tenantId);
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo recalcular zonas.') });
        }
    });

    app.post('/api/tenant/zones/sync-from-woocommerce', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasZonesManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const catalogId = String(payload.catalogId || req.query?.catalogId || '').trim();
            const result = await wooZonesSyncService.syncZonesFromWooCommerce(tenantId, catalogId);
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron importar zonas desde WooCommerce.') });
        }
    });

    app.post('/api/tenant/agencies/sync', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasZonesManageAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const result = await logisticsAgenciesSyncService.syncAgenciesFromWordPress(tenantId);
            return res.json({ ok: true, tenantId, synced: Number(result?.synced || 0), source: result?.source || null });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudieron sincronizar agencias.') });
        }
    });

    app.post('/api/tenant/zones/resolve-location', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasCoverageResolveAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const textValue = String(payload.text || payload.query || '').trim();
            let lat = payload.lat ?? payload.latitude;
            let lng = payload.lng ?? payload.longitude;
            if ((lat === undefined || lat === null || lng === undefined || lng === null) && textValue) {
                const locationFromText = await extractLocationInfoAsync({ body: textValue }, { timeoutMs: 5000 });
                if (locationFromText && locationFromText.latitude !== null && locationFromText.longitude !== null) {
                    lat = locationFromText.latitude;
                    lng = locationFromText.longitude;
                }
            }
            const result = await zoneCoverageResolverService.resolveZoneCoverage(tenantId, {
                text: textValue,
                lat,
                lng,
                postcode: payload.postcode || payload.postalCode || payload.postal_code || ''
            });
            return res.json({ ok: true, tenantId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo resolver la cobertura.') });
        }
    });

    app.get('/api/tenant/config/maps-api-key', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CHAT_OPERATE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const runtimeConfig = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
            const geo = runtimeConfig?.geo && typeof runtimeConfig.geo === 'object' ? runtimeConfig.geo : {};
            const apiKey = String(
                geo.googleMapsFrontendApiKey
                || process.env.GOOGLE_MAPS_FRONTEND_API_KEY
                || geo.googleMapsApiKey
                || ''
            ).trim();
            return res.json({ ok: true, apiKey });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar la configuracion de mapas.') });
        }
    });

    app.post('/api/tenant/coverage/static-map', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasCoverageResolveAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const lat = parseCoordinateValue(payload.lat ?? payload.latitude);
            const lng = parseCoordinateValue(payload.lng ?? payload.longitude);
            if (!isValidStaticMapCoordinate(lat, lng)) {
                return res.status(400).json({ ok: false, error: 'Coordenadas invalidas.' });
            }

            const runtimeConfig = await tenantIntegrationsService.getTenantIntegrations(tenantId, { runtime: true });
            const geo = runtimeConfig?.geo && typeof runtimeConfig.geo === 'object' ? runtimeConfig.geo : {};
            const apiKey = String(
                geo.googleMapsApiKey
                || process.env.GOOGLE_MAPS_API_KEY
                || geo.googleMapsFrontendApiKey
                || process.env.GOOGLE_MAPS_FRONTEND_API_KEY
                || ''
            ).trim();
            const requestedAgencies = Array.isArray(payload.agencies) ? payload.agencies : [];
            const zoneName = String(payload.zoneName || payload.zone?.name || '').trim();
            const candidateAgencies = selectStaticMapAgencies({ lat, lng, agencies: requestedAgencies, max: 4 });
            const routeResults = apiKey
                ? (await Promise.all(candidateAgencies.map((agency) => fetchGoogleRoute({ apiKey, lat, lng, agency })))).filter(Boolean)
                : [];
            const agencies = selectStaticMapAgencies({ lat, lng, agencies: candidateAgencies, routes: routeResults, max: 4 });

            let imageResult = null;
            let provider = 'local';
            if (apiKey) {
                const googleUrl = buildGoogleCoverageStaticMapUrl({ apiKey, lat, lng, agencies });
                imageResult = await fetchImageWithTimeout(googleUrl, 5000);
                provider = 'google';
                if (imageResult?.ok && imageResult?.buffer) {
                    imageResult = {
                        ...imageResult,
                        contentType: 'image/png',
                        buffer: await composeCoverageSharePng({
                            mapBuffer: imageResult.buffer,
                            lat,
                            lng,
                            agencies,
                            zoneName,
                            provider: 'Google Maps'
                        })
                    };
                }
            }
            if (!imageResult?.ok || !imageResult?.buffer) {
                const googleError = String(imageResult?.error || '').slice(0, 220);
                if (apiKey) {
                    console.warn('[Coverage] Google Static Maps fallback:', googleError || imageResult?.status || 'unknown_error');
                }
                const osmUrl = buildOsmStaticMapUrl({ lat, lng, agencies });
                imageResult = await fetchImageWithTimeout(osmUrl, 5000);
                provider = 'osm';
                if (imageResult?.ok && imageResult?.buffer) {
                    imageResult = {
                        ...imageResult,
                        contentType: 'image/png',
                        buffer: await composeCoverageSharePng({
                            mapBuffer: imageResult.buffer,
                            lat,
                            lng,
                            agencies,
                            zoneName,
                            provider: 'OpenStreetMap'
                        })
                    };
                }
            }
            if (!imageResult?.ok || !imageResult?.buffer) {
                const osmError = String(imageResult?.error || '').slice(0, 220);
                console.warn('[Coverage] External static map fallback:', osmError || imageResult?.status || 'unknown_error');
                imageResult = await generateLocalCoverageMapPng({ lat, lng, agencies, zoneName, routes: routeResults });
                provider = 'local';
            }
            const mediaData = imageResult.buffer.toString('base64');
            const mimetype = imageResult.contentType || 'image/png';
            return res.json({
                ok: true,
                provider,
                mimetype,
                filename: 'mapa-cobertura.png',
                mediaData,
                dataUrl: `data:${mimetype};base64,${mediaData}`
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo generar la imagen del mapa.') });
        }
    });

    app.get('/api/tenant/geo/search', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasZonesReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const query = String(req.query?.q || req.query?.query || '').trim();
            const type = String(req.query?.type || 'all').trim().toLowerCase();
            const limit = Number(req.query?.limit || 20);
            const items = await geoLocationService.searchLocations(query, { type, limit });
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron buscar ubicaciones.') });
        }
    });

    app.get('/api/tenant/customer-labels', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasLabelsReadAccess(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.query?.customerId || '').trim();
            const source = String(req.query?.source || '').trim().toLowerCase();
            const items = await tenantZoneRulesService.listCustomerLabels(tenantId, { customerId, source });
            return res.json({ ok: true, tenantId, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar etiquetas de clientes.') });
        }
    });

    app.get('/api/tenant/customers/by-phone/:phoneE164', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const phoneE164 = String(req.params?.phoneE164 || '').trim();
            if (!phoneE164) {
                return res.status(400).json({ ok: false, error: 'phoneE164 invalido.' });
            }

            const item = await customerService.getCustomerByPhoneWithAddresses(tenantId, phoneE164, {
                customerAddressesService
            });

            if (!item) {
                return res.status(404).json({ ok: false, error: 'Cliente no encontrado para ese telefono.' });
            }

            return res.json({
                ok: true,
                tenantId,
                phoneE164,
                item
            });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar el cliente por telefono.') });
        }
    });

    app.get('/api/tenant/customers/:customerId/identities', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const moduleId = String(req.query?.moduleId || '').trim();
            const channelType = String(req.query?.channelType || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await customerService.listCustomerIdentities(tenantId, {
                customerId,
                moduleId,
                channelType,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, customerId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar identidades del cliente.') });
        }
    });

    app.get('/api/tenant/customers/:customerId/channel-events', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });

            const moduleId = String(req.query?.moduleId || '').trim();
            const chatId = String(req.query?.chatId || '').trim();
            const channelType = String(req.query?.channelType || '').trim().toLowerCase();
            const limit = Number(req.query?.limit || 50);
            const offset = Number(req.query?.offset || 0);

            const result = await customerService.listChannelEvents(tenantId, {
                customerId,
                moduleId,
                chatId,
                channelType,
                limit,
                offset
            });

            return res.json({ ok: true, tenantId, customerId, ...result });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar eventos del cliente.') });
        }
    });

    app.get('/api/tenant/customers/:customerId/addresses', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });
            const items = await customerAddressesService.listAddresses(tenantId, { customerId });
            return res.json({ ok: true, tenantId, customerId, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar direcciones del cliente.') });
        }
    });

    app.post('/api/tenant/customers/:customerId/addresses', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            if (!customerId) return res.status(400).json({ ok: false, error: 'customerId invalido.' });
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await customerAddressesService.upsertAddress(tenantId, { ...payload, customerId });
            return res.status(201).json({ ok: true, tenantId, customerId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo crear direccion.') });
        }
    });

    app.put('/api/tenant/customers/:customerId/addresses/:addressId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            const addressId = String(req.params?.addressId || '').trim();
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });
            const payload = req.body && typeof req.body === 'object' ? req.body : {};
            const item = await customerAddressesService.upsertAddress(tenantId, { ...payload, customerId, addressId });
            return res.json({ ok: true, tenantId, customerId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo actualizar direccion.') });
        }
    });

    app.delete('/api/tenant/customers/:customerId/addresses/:addressId', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            const addressId = String(req.params?.addressId || '').trim();
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });
            const deleted = await customerAddressesService.deleteAddress(tenantId, { addressId });
            return res.json({ ok: true, tenantId, customerId, addressId, deleted: Boolean(deleted) });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo eliminar direccion.') });
        }
    });

    app.patch('/api/tenant/customers/:customerId/addresses/:addressId/set-primary', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            if (!hasPermission(req, accessPolicyService.PERMISSIONS.TENANT_CUSTOMERS_MANAGE)) {
                return res.status(403).json({ ok: false, error: 'No autorizado.' });
            }
            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const customerId = String(req.params?.customerId || '').trim();
            const addressId = String(req.params?.addressId || '').trim();
            if (!customerId || !addressId) return res.status(400).json({ ok: false, error: 'customerId/addressId invalido.' });
            const item = await customerAddressesService.setPrimaryAddress(tenantId, { customerId, addressId });
            return res.json({ ok: true, tenantId, customerId, item });
        } catch (error) {
            return res.status(400).json({ ok: false, error: String(error?.message || 'No se pudo marcar direccion primaria.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/treatments', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const items = await customerCatalogsService.getTreatments();
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo de tratamientos.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/types', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const items = await customerCatalogsService.getCustomerTypes();
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo de tipos de cliente.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/sources', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const items = await customerCatalogsService.getAcquisitionSources();
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo de fuentes.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/document-types', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const items = await customerCatalogsService.getDocumentTypes();
            return res.json({ ok: true, items });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo de documentos.') });
        }
    });

    app.get('/api/tenant/customer-catalogs/geo', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;
            const departmentId = String(req.query?.departmentId || '').trim();
            const provinceId = String(req.query?.provinceId || '').trim();
            const payload = await customerCatalogsService.getGeoCatalog({ departmentId, provinceId });
            return res.json({ ok: true, ...payload });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudo cargar catalogo geografico.') });
        }
    });

    app.get('/api/tenant/wa-modules', async (req, res) => {
        try {
            if (!ensureAuthenticated(req, res, authService)) return;

            const tenantId = String(req?.tenantContext?.id || 'default').trim() || 'default';
            const userId = String(req?.authContext?.user?.userId || req?.authContext?.user?.id || '').trim();
            const items = await waModuleService.listModules(tenantId, { includeInactive: false, userId });
            const selected = await waModuleService.getSelectedModule(tenantId, { userId });
            return res.json({ ok: true, tenantId, items, selected });
        } catch (error) {
            return res.status(500).json({ ok: false, error: String(error?.message || 'No se pudieron cargar modulos WA.') });
        }
    });
}

module.exports = {
    registerTenantCustomerHttpRoutes
};

