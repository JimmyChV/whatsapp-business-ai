import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../../../../config/runtime';

let googleMapsLoaderPromise = null;
let googleMapsLoaderKey = '';

function text(value = '') {
    return String(value || '').trim();
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function money(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
}

function isValidCoords(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng)
        && lat >= -90 && lat <= 90
        && lng >= -180 && lng <= 180;
}

function coordPair(value = {}) {
    const lat = numberOrNull(value.lat ?? value.latitude);
    const lng = numberOrNull(value.lng ?? value.longitude);
    return isValidCoords(lat, lng) ? { lat, lng } : null;
}

function isLikelyMapUrl(value = '') {
    return /maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|google\.[^\s/]+\/maps/i.test(String(value || ''));
}

function extractFirstUrl(value = '') {
    const match = String(value || '').match(/https?:\/\/[^\s]+/i);
    return match ? String(match[0]).replace(/[),.;!?]+$/g, '') : '';
}

function parseCoordsFromText(value = '') {
    const raw = String(value || '');
    const patterns = [
        /@(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
        /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/i,
        /!2d(-?\d{1,3}(?:\.\d+)?)!3d(-?\d{1,2}(?:\.\d+)?)/i,
        /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
    ];
    const values = [];
    const addValue = (next = '') => {
        const clean = String(next || '');
        if (clean && !values.includes(clean)) values.push(clean);
    };
    addValue(raw);
    addValue(raw.replace(/\\\//g, '/').replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/').replace(/&amp;/gi, '&'));
    for (const item of [...values]) {
        try {
            addValue(decodeURIComponent(item));
        } catch (_) {}
    }
    for (const decoded of values) {
        for (const pattern of patterns) {
            const match = decoded.match(pattern);
            if (!match) continue;
            const isLngLatPattern = String(pattern).includes('!2d');
            const lat = numberOrNull(isLngLatPattern ? match[2] : match[1]);
            const lng = numberOrNull(isLngLatPattern ? match[1] : match[2]);
            if (isValidCoords(lat, lng)) return { lat, lng };
        }
    }
    return null;
}

function haversineKm(origin = {}, destination = {}) {
    const start = coordPair(origin);
    const end = coordPair(destination);
    if (!start || !end) return null;
    const toRad = (degrees) => degrees * Math.PI / 180;
    const earthKm = 6371;
    const dLat = toRad(end.lat - start.lat);
    const dLng = toRad(end.lng - start.lng);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(start.lat)) * Math.cos(toRad(end.lat)) * Math.sin(dLng / 2) ** 2;
    return earthKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function firstActiveShippingOption(zone = {}) {
    const options = Array.isArray(zone.shippingOptions || zone.shipping_options)
        ? (zone.shippingOptions || zone.shipping_options)
        : [];
    return options.find((item) => item && item.is_active !== false && item.isActive !== false) || options[0] || null;
}

function paymentLabels(zone = {}) {
    const payments = zone.paymentMethods || zone.payment_methods || {};
    return [
        payments.yape ? 'Yape' : '',
        payments.plin ? 'Plin' : '',
        payments.bank_transfer || payments.bankTransfer ? 'Transferencia' : '',
        payments.credit_card || payments.creditCard ? 'Tarjeta' : '',
        payments.cash ? 'Efectivo' : ''
    ].filter(Boolean);
}

function paymentModalityLabel(zone = {}) {
    const modality = zone.paymentModality || zone.payment_modality || {};
    const advance = modality.advance === true || modality.prepaid === true;
    const cashOnDelivery = modality.cash_on_delivery === true || modality.cashOnDelivery === true;
    if (advance && cashOnDelivery) return 'anticipado o contraentrega';
    if (advance) return 'pago anticipado';
    if (cashOnDelivery) return 'contraentrega';
    return '';
}

function formatDistance(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '';
    return `${parsed.toFixed(parsed >= 10 ? 1 : 2)} km`;
}

function formatEstimatedTime(value) {
    const hours = Number.parseInt(String(value ?? ''), 10) || 0;
    if (!hours) return 'Por confirmar';
    if (hours >= 48) return `${Math.round(hours / 24)} dias habiles`;
    if (hours === 24) return '1 dia habil';
    return `${hours} horas`;
}

function carrierKey(value = '') {
    const normalized = text(value).toLowerCase();
    if (normalized.includes('shalom')) return 'shalom';
    if (normalized.includes('marvisur')) return 'marvisur';
    return 'agency';
}

function carrierLabel(value = '') {
    const key = carrierKey(value);
    if (key === 'shalom') return 'Shalom';
    if (key === 'marvisur') return 'Marvisur';
    return text(value).toUpperCase() || 'Agencia';
}

function carrierColor(value = '') {
    const key = carrierKey(value);
    if (key === 'marvisur') return '#FF6B00';
    if (key === 'shalom') return '#0066CC';
    return '#185FA5';
}

function svgMarkerDataUrl(svg = '') {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildCustomerMarkerIcon(google) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="58" height="72" viewBox="0 0 58 72">
            <defs>
                <filter id="shadow" x="-40%" y="-25%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#111827" flood-opacity="0.28"/>
                </filter>
            </defs>
            <path filter="url(#shadow)" d="M29 4C16.3 4 6 14.2 6 26.8c0 17.5 23 41.2 23 41.2s23-23.7 23-41.2C52 14.2 41.7 4 29 4z" fill="#E11D48"/>
            <circle cx="29" cy="27" r="11" fill="#FFFFFF"/>
            <circle cx="29" cy="27" r="5" fill="#E11D48"/>
        </svg>
    `;
    return {
        url: svgMarkerDataUrl(svg),
        scaledSize: new google.maps.Size(58, 72),
        anchor: new google.maps.Point(29, 68)
    };
}

function buildAgencyMarkerIcon(google, carrier = '') {
    const key = carrierKey(carrier);
    const color = carrierColor(key);
    const letter = key === 'marvisur' ? 'M' : (key === 'shalom' ? 'S' : 'A');
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54">
            <defs>
                <filter id="shadow" x="-35%" y="-35%" width="170%" height="170%">
                    <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#111827" flood-opacity="0.24"/>
                </filter>
            </defs>
            <circle filter="url(#shadow)" cx="27" cy="27" r="24" fill="#FFFFFF"/>
            <circle cx="27" cy="27" r="19" fill="${color}"/>
            <text x="27" y="34" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#FFFFFF">${letter}</text>
        </svg>
    `;
    return {
        url: svgMarkerDataUrl(svg),
        scaledSize: new google.maps.Size(54, 54),
        anchor: new google.maps.Point(27, 27)
    };
}

function extractMessageBody(message = {}) {
    return text(
        message?.body
        || message?.caption
        || message?.text?.body
        || message?.text
        || message?.message?.text?.body
        || message?.message?.body
        || message?.message?.caption
        || message?.message
        || message?.metadata?.body
        || message?.metadata?.caption
        || ''
    );
}

function extractNativeCoords(message = {}) {
    const candidates = [
        message?.locationPayload,
        message?.location_payload,
        message?.location,
        message?.metadata?.locationPayload,
        message?.metadata?.location_payload,
        message?.metadata?.location,
        message?.raw?.location,
        message?.rawMessage?.location,
        message?.message?.location,
        message?._data?.location
    ];
    for (const rawPayload of candidates) {
        let payload = rawPayload;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            } catch (_) {
                payload = null;
            }
        }
        const coords = coordPair({
            lat: payload?.latitude ?? payload?.lat ?? payload?.degreesLatitude,
            lng: payload?.longitude ?? payload?.lng ?? payload?.lon ?? payload?.degreesLongitude
        });
        if (coords) return coords;
    }
    return null;
}

function latestCustomerLocationSource(messagesRef = null, fallbackMessages = []) {
    const messages = Array.isArray(messagesRef?.current)
        ? messagesRef.current
        : (Array.isArray(fallbackMessages) ? fallbackMessages : []);
    for (const message of [...messages].reverse()) {
        if (message?.fromMe) continue;
        const nativeCoords = extractNativeCoords(message);
        if (nativeCoords) return { ...nativeCoords, source: 'last_customer_location' };
        const body = extractMessageBody(message);
        const coords = parseCoordsFromText(body);
        if (coords) return { ...coords, source: 'last_customer_maps_link', text: body };
        const firstUrl = extractFirstUrl(body);
        if (firstUrl && isLikelyMapUrl(firstUrl)) {
            return { text: body || firstUrl, mapUrl: firstUrl, source: 'last_customer_maps_link' };
        }
    }
    return null;
}

function agencyListFromDecision(agencies) {
    if (!agencies) return [];
    const source = Array.isArray(agencies)
        ? agencies
        : ['marvisur', 'shalom'].map((carrier) => (
            agencies[carrier] ? ({ ...agencies[carrier], carrier: agencies[carrier].carrier || carrier }) : null
        )).filter(Boolean);
    const byCarrier = new Map();
    source.forEach((agency) => {
        const key = carrierKey(agency?.carrier);
        if (!byCarrier.has(key)) byCarrier.set(key, { ...agency, carrier: agency?.carrier || key });
    });
    return ['marvisur', 'shalom']
        .map((carrier) => byCarrier.get(carrier))
        .filter(Boolean);
}

function agencyCoords(agency = {}) {
    return coordPair({
        lat: agency.latitude ?? agency.lat,
        lng: agency.longitude ?? agency.lng
    });
}

function agencyMapUrl(agency = {}) {
    const coords = agencyCoords(agency);
    if (!coords) return '';
    return `https://maps.google.com/?daddr=${coords.lat},${coords.lng}`;
}

function buildGoogleMapsScriptUrl(apiKey = '') {
    const params = new URLSearchParams();
    params.set('key', apiKey);
    params.set('libraries', 'places');
    params.set('language', 'es');
    params.set('region', 'PE');
    params.set('v', 'weekly');
    return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function useGoogleMapsLoader(apiKey = '') {
    const [state, setState] = useState({
        loaded: Boolean(window.google?.maps?.places),
        error: ''
    });

    useEffect(() => {
        const cleanKey = text(apiKey);
        if (window.google?.maps?.places) {
            setState({ loaded: true, error: '' });
            return;
        }
        if (!cleanKey) {
            setState({ loaded: false, error: '' });
            return;
        }
        if (!googleMapsLoaderPromise || googleMapsLoaderKey !== cleanKey) {
            googleMapsLoaderKey = cleanKey;
            googleMapsLoaderPromise = new Promise((resolve, reject) => {
                const existing = document.querySelector('script[data-lavitat-google-maps="true"]');
                if (existing) existing.remove();
                const script = document.createElement('script');
                script.src = buildGoogleMapsScriptUrl(cleanKey);
                script.async = true;
                script.defer = true;
                script.dataset.lavitatGoogleMaps = 'true';
                script.onload = () => resolve(window.google);
                script.onerror = () => reject(new Error('No se pudo cargar Google Maps.'));
                document.head.appendChild(script);
            });
        }
        let cancelled = false;
        setState({ loaded: false, error: '' });
        googleMapsLoaderPromise
            .then(() => {
                if (!cancelled) setState({ loaded: Boolean(window.google?.maps?.places), error: '' });
            })
            .catch((error) => {
                if (!cancelled) setState({ loaded: false, error: text(error?.message) || 'No se pudo cargar Google Maps.' });
            });
        return () => {
            cancelled = true;
        };
    }, [apiKey]);

    return state;
}

function CoverageMap({
    google,
    coords,
    agencies = [],
    onCoordsChange,
    className = '',
    maximized = false
}) {
    const mapElementRef = useRef(null);
    const mapRef = useRef(null);
    const overlaysRef = useRef({ markers: [], renderers: [], polylines: [] });

    useEffect(() => {
        if (!google?.maps || !mapElementRef.current || !coords) return;
        mapRef.current = new google.maps.Map(mapElementRef.current, {
            center: coords,
            zoom: maximized ? 14 : 15,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false
        });
    }, [google, maximized, coords?.lat, coords?.lng]);

    useEffect(() => {
        const map = mapRef.current;
        if (!google?.maps || !map || !coords) return undefined;
        overlaysRef.current.markers.forEach((marker) => marker.setMap(null));
        overlaysRef.current.renderers.forEach((renderer) => renderer.setMap(null));
        overlaysRef.current.polylines.forEach((polyline) => polyline.setMap(null));
        overlaysRef.current = { markers: [], renderers: [], polylines: [] };

        const bounds = new google.maps.LatLngBounds();
        const clientPosition = new google.maps.LatLng(coords.lat, coords.lng);
        const clientMarker = new google.maps.Marker({
            position: clientPosition,
            map,
            draggable: true,
            title: 'Ubicacion del cliente',
            icon: buildCustomerMarkerIcon(google),
            zIndex: 1000
        });
        clientMarker.addListener('dragend', (event) => {
            const nextLat = event.latLng.lat();
            const nextLng = event.latLng.lng();
            if (typeof onCoordsChange === 'function') onCoordsChange({ lat: nextLat, lng: nextLng });
        });
        overlaysRef.current.markers.push(clientMarker);
        bounds.extend(clientPosition);

        const infoWindow = new google.maps.InfoWindow();
        const directionsService = new google.maps.DirectionsService();
        agencies.forEach((agency) => {
            const agencyPosition = agencyCoords(agency);
            if (!agencyPosition) return;
            const carrier = carrierKey(agency.carrier);
            const color = carrierColor(carrier);
            const marker = new google.maps.Marker({
                position: agencyPosition,
                map,
                title: agency.name || carrierLabel(carrier),
                icon: buildAgencyMarkerIcon(google, carrier),
                zIndex: carrier === 'marvisur' ? 910 : 920
            });
            marker.addListener('click', () => {
                infoWindow.setContent(`
                    <strong>${agency.name || carrierLabel(carrier)}</strong><br/>
                    ${agency.address || ''}<br/>
                    ${agency.phonePrimary || ''}<br/>
                    ${agency.hoursWeek || agency.hoursDelivery || ''}
                `);
                infoWindow.open({ anchor: marker, map });
            });
            overlaysRef.current.markers.push(marker);
            bounds.extend(agencyPosition);

            const fallbackLine = new google.maps.Polyline({
                path: [clientPosition, new google.maps.LatLng(agencyPosition.lat, agencyPosition.lng)],
                geodesic: true,
                map,
                strokeColor: color,
                strokeOpacity: 0.62,
                strokeWeight: 7,
                zIndex: carrier === 'marvisur' ? 40 : 41
            });
            overlaysRef.current.polylines.push(fallbackLine);

            const renderer = new google.maps.DirectionsRenderer({
                map,
                suppressMarkers: true,
                preserveViewport: true,
                polylineOptions: {
                    strokeColor: color,
                    strokeOpacity: 0.95,
                    strokeWeight: 7,
                    zIndex: carrier === 'marvisur' ? 80 : 81
                }
            });
            overlaysRef.current.renderers.push(renderer);
            directionsService.route({
                origin: coords,
                destination: agencyPosition,
                travelMode: google.maps.TravelMode.DRIVING
            }, (response, status) => {
                if (status === google.maps.DirectionsStatus.OK && response) {
                    fallbackLine.setMap(null);
                    renderer.setDirections(response);
                }
            });
        });

        if (agencies.some((agency) => agencyCoords(agency))) map.fitBounds(bounds, 56);
        else map.setCenter(clientPosition);

        return () => {
            overlaysRef.current.markers.forEach((marker) => marker.setMap(null));
            overlaysRef.current.renderers.forEach((renderer) => renderer.setMap(null));
            overlaysRef.current.polylines.forEach((polyline) => polyline.setMap(null));
            overlaysRef.current = { markers: [], renderers: [], polylines: [] };
        };
    }, [google, coords?.lat, coords?.lng, agencies, onCoordsChange]);

    return <div ref={mapElementRef} className={className || 'business-coverage-map'} />;
}

function buildPreparedCoverageMessageLegacy({ result, zone, shipping, agencies, routeMetrics }) {
    const responseText = text(result?.responseText || '');
    if (!zone || !agencies.length) return responseText;
    const shippingType = text(shipping?.type).toLowerCase() === 'courier' ? 'courier' : 'delivery';
    if (shippingType !== 'courier') return responseText;
    const location = result?.resolvedLocation || {};
    const locationName = text(location.district || location.province || location.department || 'tu zona');
    const cost = money(shipping?.cost);
    const freeFrom = money(shipping?.free_from ?? shipping?.freeFrom);
    const time = formatEstimatedTime(shipping?.estimated_time || shipping?.estimatedTime);
    const freeText = freeFrom ? `, gratis desde S/ ${freeFrom}` : '';

    if (shippingType !== 'courier') {
        const methods = paymentLabels(zone).join(', ');
        const modality = paymentModalityLabel(zone);
        return [
            `Te confirmo la cobertura para ${locationName}.`,
            '',
            'Tenemos reparto a domicilio en esa zona.',
            `El costo de envio es *S/ ${cost || 'por confirmar'}*${freeText}.`,
            time ? `El tiempo estimado es ${time}.` : '',
            methods ? `Puedes pagar con ${methods}.` : '',
            modality ? `La modalidad disponible es ${modality}.` : '',
            '',
            'Si te parece bien, seguimos con la coordinacion de tu pedido.'
        ].filter(Boolean).join('\n');
    }

    const agencyLines = agencies.map((agency) => {
        const carrier = carrierLabel(agency.carrier);
        const metric = routeMetrics[carrierKey(agency.carrier)] || {};
        const distance = text(metric.distanceText) || formatDistance(agency.distanceKm);
        const duration = text(metric.durationText);
        const meta = [distance, duration ? `${duration} en auto` : ''].filter(Boolean).join(' · ');
        return [
            `${carrier === 'Marvisur' ? '🟠' : '🔵'} *${carrier}* — ${agency.name || agency.fullName || 'Agencia'}`,
            text(agency.address || ''),
            agency.phonePrimary ? `📞 ${agency.phonePrimary}` : '',
            agency.hoursWeek || agency.hoursDelivery ? `🕐 ${agency.hoursWeek || agency.hoursDelivery}` : '',
            meta ? `📏 ${meta}` : ''
        ].filter(Boolean).join('\n');
    });
    return [
        `📍 Te ubiqué en ${locationName} 😊`,
        '',
        'Agencias más cercanas a ti:',
        '',
        agencyLines.join('\n\n'),
        '',
        `Costo de envío: *S/ ${cost || 'por confirmar'}*${freeFrom ? `, gratis desde S/ ${freeFrom}` : ''}`,
        `⏱ ${time}`,
        '',
        '¿Coordino el envío por Marvisur o Shalom? 😊'
    ].join('\n');
}

function buildPreparedCoverageMessage({ result, zone, shipping, agencies, routeMetrics }) {
    const responseText = text(result?.responseText || '');
    if (!zone || !agencies.length) return responseText;
    const shippingType = text(shipping?.type).toLowerCase() === 'courier' ? 'courier' : 'delivery';
    const location = result?.resolvedLocation || {};
    const locationName = text(location.district || location.province || location.department || 'tu zona');
    const cost = money(shipping?.cost);
    const freeFrom = money(shipping?.free_from ?? shipping?.freeFrom);
    const time = formatEstimatedTime(shipping?.estimated_time || shipping?.estimatedTime);
    const freeText = freeFrom ? `, gratis desde S/ ${freeFrom}` : '';

    if (shippingType !== 'courier') {
        const methods = paymentLabels(zone).join(', ');
        const modality = paymentModalityLabel(zone);
        return [
            `Te confirmo la cobertura para ${locationName}.`,
            '',
            'Tenemos reparto a domicilio en esa zona.',
            `El costo de envio es *S/ ${cost || 'por confirmar'}*${freeText}.`,
            time ? `El tiempo estimado es ${time}.` : '',
            methods ? `Puedes pagar con ${methods}.` : '',
            modality ? `La modalidad disponible es ${modality}.` : '',
            '',
            'Si te parece bien, seguimos con la coordinacion de tu pedido.'
        ].filter(Boolean).join('\n');
    }

    const agencyLines = agencies.map((agency) => {
        const carrier = carrierLabel(agency.carrier);
        const metric = routeMetrics[carrierKey(agency.carrier)] || {};
        const distance = text(metric.distanceText) || formatDistance(agency.distanceKm);
        const duration = text(metric.durationText);
        const meta = [distance, duration ? `${duration} en auto` : ''].filter(Boolean).join(' - ');
        return [
            `*${carrier}: ${agency.name || agency.fullName || 'Agencia'}*`,
            text(agency.address || ''),
            agency.phonePrimary ? `Tel: ${agency.phonePrimary}` : '',
            agency.hoursWeek || agency.hoursDelivery ? `Horario: ${agency.hoursWeek || agency.hoursDelivery}` : '',
            meta ? `Referencia: ${meta}` : ''
        ].filter(Boolean).join('\n');
    });

    return [
        `Te confirmo la cobertura para ${locationName}.`,
        '',
        'Para tu zona podemos enviarlo por agencia. Estas son las opciones mas cercanas:',
        '',
        agencyLines.join('\n\n'),
        '',
        `El costo de envio es *S/ ${cost || 'por confirmar'}*${freeText}.`,
        `El tiempo estimado es ${time}.`,
        '',
        'Si te parece bien, dime cual agencia te queda mejor y seguimos con la coordinacion de tu pedido.'
    ].join('\n');
}

export default function BusinessCoverageTabSection({
    activeTenantId = '',
    activeChatId = '',
    buildApiHeaders = null,
    messages = [],
    messagesRef = null,
    notify = null,
    onPrepareMessage = null
}) {
    const searchTimerRef = useRef(null);
    const inputRef = useRef(null);
    const placesAutocompleteRef = useRef(null);
    const [apiKey, setApiKey] = useState('');
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [clientCoords, setClientCoords] = useState(null);
    const [routeMetrics, setRouteMetrics] = useState({});
    const [mapMaximized, setMapMaximized] = useState(false);

    const headers = useMemo(() => {
        const base = typeof buildApiHeaders === 'function'
            ? (buildApiHeaders({ includeJson: true }) || {})
            : { 'Content-Type': 'application/json' };
        const next = { 'Content-Type': 'application/json', ...base };
        if (activeTenantId) next['x-tenant-id'] = String(activeTenantId).trim();
        return next;
    }, [activeTenantId, buildApiHeaders]);

    const mapsState = useGoogleMapsLoader(apiKey);
    const google = mapsState.loaded ? window.google : null;

    useEffect(() => {
        let cancelled = false;
        const loadKey = async () => {
            try {
                const response = await fetch(`${API_URL}/api/tenant/config/maps-api-key`, { headers });
                const body = await response.json().catch(() => ({}));
                if (!response.ok || body?.ok === false) throw new Error(text(body?.error) || 'No se pudo cargar Google Maps.');
                if (!cancelled) setApiKey(text(body?.apiKey || ''));
            } catch (err) {
                if (!cancelled) setError(text(err?.message) || 'No se pudo cargar Google Maps.');
            }
        };
        loadKey();
        return () => {
            cancelled = true;
        };
    }, [headers]);

    const resolveCoverage = useCallback(async (payload = {}) => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_URL}/api/tenant/coverage/detail`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    ...payload,
                    chatId: activeChatId || ''
                })
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body?.ok === false) {
                throw new Error(text(body?.error) || 'No se pudo verificar cobertura.');
            }
            const coords = coordPair(payload) || coordPair(body?.resolvedLocation || {});
            if (coords) setClientCoords(coords);
            setResult(body);
            return body;
        } catch (err) {
            const message = text(err?.message) || 'No se pudo verificar cobertura.';
            setError(message);
            if (typeof notify === 'function') notify({ type: 'error', message });
            return null;
        } finally {
            setLoading(false);
        }
    }, [activeChatId, headers, notify]);

    const resolveFromCoords = useCallback(async (coords, label = 'Ubicacion seleccionada') => {
        const cleanCoords = coordPair(coords);
        if (!cleanCoords) return null;
        setClientCoords(cleanCoords);
        return resolveCoverage({ lat: cleanCoords.lat, lng: cleanCoords.lng, lastMessage: label });
    }, [resolveCoverage]);

    const loadGeoSuggestions = useCallback((value = '') => {
        const clean = text(value);
        window.clearTimeout(searchTimerRef.current);
        setSuggestions([]);
        if (mapsState.loaded || clean.length < 2 || isLikelyMapUrl(clean) || parseCoordsFromText(clean)) return;
        searchTimerRef.current = window.setTimeout(async () => {
            setLoadingSuggestions(true);
            try {
                const params = new URLSearchParams();
                params.set('q', clean);
                params.set('type', 'all');
                params.set('limit', '8');
                const response = await fetch(`${API_URL}/api/tenant/geo/search?${params.toString()}`, { headers });
                const body = await response.json().catch(() => ({}));
                setSuggestions(Array.isArray(body?.items) ? body.items : []);
            } catch (_) {
                setSuggestions([]);
            } finally {
                setLoadingSuggestions(false);
            }
        }, 280);
    }, [headers, mapsState.loaded]);

    const handleQueryChange = useCallback((event) => {
        const value = event.target.value;
        setQuery(value);
        loadGeoSuggestions(value);
    }, [loadGeoSuggestions]);

    useEffect(() => {
        if (!google?.maps?.places || !inputRef.current || placesAutocompleteRef.current) return;
        placesAutocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
            componentRestrictions: { country: 'pe' },
            fields: ['geometry', 'formatted_address', 'address_components', 'name'],
            types: ['geocode', 'establishment']
        });
        placesAutocompleteRef.current.addListener('place_changed', () => {
            const place = placesAutocompleteRef.current.getPlace();
            const location = place?.geometry?.location;
            if (!location) return;
            const lat = location.lat();
            const lng = location.lng();
            const label = text(place.formatted_address || place.name || query);
            setQuery(label);
            resolveFromCoords({ lat, lng }, label);
        });
    }, [google, query, resolveFromCoords]);

    const resolveFromTextOrLink = useCallback(async () => {
        const clean = text(query);
        if (!clean) {
            setError('Busca una direccion, distrito o pega un link de Google Maps.');
            return;
        }
        setSuggestions([]);
        const directCoords = parseCoordsFromText(clean);
        if (directCoords) {
            await resolveFromCoords(directCoords, clean);
            return;
        }
        await resolveCoverage({ text: clean, lastMessage: clean });
    }, [query, resolveCoverage, resolveFromCoords]);

    const selectSuggestion = useCallback(async (suggestion = {}) => {
        const label = text(suggestion.label || suggestion.name || '');
        if (!label) return;
        setQuery(label);
        setSuggestions([]);
        await resolveCoverage({ text: label, lastMessage: label });
    }, [resolveCoverage]);

    const useCustomerLocation = useCallback(() => {
        const latest = latestCustomerLocationSource(messagesRef, messages);
        if (!latest) {
            setError('El cliente no ha compartido su ubicacion en este chat.');
            return;
        }
        if (coordPair(latest)) {
            resolveFromCoords(latest, 'Ubicacion compartida por el cliente');
            return;
        }
        if (latest.text || latest.mapUrl) {
            setQuery(latest.text || latest.mapUrl);
            resolveCoverage({ text: latest.text || latest.mapUrl, lastMessage: latest.text || latest.mapUrl });
            return;
        }
        setError('No pude leer la ubicacion compartida del cliente.');
    }, [messages, messagesRef, resolveCoverage, resolveFromCoords]);

    const zone = result?.zone || null;
    const shipping = firstActiveShippingOption(zone || {});
    const shippingType = text(shipping?.type).toLowerCase() === 'courier' ? 'courier' : 'delivery';
    const cost = money(shipping?.cost);
    const freeFrom = money(shipping?.free_from ?? shipping?.freeFrom);
    const agencies = useMemo(() => agencyListFromDecision(result?.agencies), [result?.agencies]);
    const responseText = text(result?.responseText || '');
    const latestSharedLocation = useMemo(() => latestCustomerLocationSource(messagesRef, messages), [messages, messagesRef, result]);

    useEffect(() => {
        if (!google?.maps || !clientCoords || !agencies.length) {
            setRouteMetrics({});
            return undefined;
        }
        let cancelled = false;
        const destinations = agencies.map(agencyCoords).filter(Boolean);
        if (!destinations.length) {
            setRouteMetrics({});
            return undefined;
        }
        const service = new google.maps.DistanceMatrixService();
        const fallbackTimer = window.setTimeout(() => {
            if (cancelled) return;
            const fallback = {};
            agencies.forEach((agency) => {
                const key = carrierKey(agency.carrier);
                const km = haversineKm(clientCoords, agencyCoords(agency));
                fallback[key] = {
                    distanceText: formatDistance(km ?? agency.distanceKm),
                    durationText: ''
                };
            });
            setRouteMetrics(fallback);
        }, 5000);
        service.getDistanceMatrix({
            origins: [clientCoords],
            destinations,
            travelMode: google.maps.TravelMode.DRIVING,
            language: 'es'
        }, (response, status) => {
            if (cancelled) return;
            window.clearTimeout(fallbackTimer);
            const next = {};
            if (status === 'OK') {
                const elements = response?.rows?.[0]?.elements || [];
                agencies.forEach((agency, index) => {
                    const key = carrierKey(agency.carrier);
                    const element = elements[index] || {};
                    const km = haversineKm(clientCoords, agencyCoords(agency));
                    next[key] = {
                        distanceText: text(element.distance?.text) || formatDistance(km ?? agency.distanceKm),
                        durationText: text(element.duration?.text)
                    };
                });
            } else {
                agencies.forEach((agency) => {
                    const key = carrierKey(agency.carrier);
                    const km = haversineKm(clientCoords, agencyCoords(agency));
                    next[key] = {
                        distanceText: formatDistance(km ?? agency.distanceKm),
                        durationText: ''
                    };
                });
            }
            setRouteMetrics(next);
        });
        return () => {
            cancelled = true;
            window.clearTimeout(fallbackTimer);
        };
    }, [google, clientCoords, agencies]);

    const prepareMessage = useCallback(async () => {
        if (!result) return;
        setPreparing(true);
        try {
            let latestResult = result;
            if (clientCoords) {
                latestResult = await resolveCoverage({ lat: clientCoords.lat, lng: clientCoords.lng, lastMessage: query || 'Ubicacion seleccionada' }) || result;
            }
            const latestZone = latestResult?.zone || zone;
            const latestShipping = firstActiveShippingOption(latestZone || {});
            const latestAgencies = agencyListFromDecision(latestResult?.agencies);
            const preparedText = buildPreparedCoverageMessage({
                result: latestResult,
                zone: latestZone,
                shipping: latestShipping,
                agencies: latestAgencies.length ? latestAgencies : agencies,
                routeMetrics
            });
            if (!preparedText) throw new Error('No hay detalle logistico para preparar.');
            if (typeof onPrepareMessage === 'function') {
                onPrepareMessage(preparedText);
                if (typeof notify === 'function') notify({ type: 'success', message: 'Detalle cargado en el input del chat.' });
            } else {
                throw new Error('No se encontro el input del chat para preparar el mensaje.');
            }
        } catch (err) {
            const message = text(err?.message) || 'No se pudo preparar el mensaje.';
            setError(message);
            if (typeof notify === 'function') notify({ type: 'error', message });
        } finally {
            setPreparing(false);
        }
    }, [agencies, clientCoords, notify, onPrepareMessage, query, resolveCoverage, result, routeMetrics, zone]);

    useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

    return (
        <div className="business-coverage-shell business-coverage-shell--maps">
            <div className="business-coverage-card business-coverage-hero">
                <div>
                    <div className="business-coverage-title">Verificar cobertura</div>
                    <div className="business-coverage-subtitle">Busca una direccion real, usa el pin del cliente o pega un link de Google Maps.</div>
                </div>
                <div className="business-coverage-search business-coverage-search--maps">
                    <div className="business-coverage-autocomplete">
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={handleQueryChange}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') resolveFromTextOrLink();
                            }}
                            placeholder="Busca una direccion o distrito..."
                        />
                        <div className="business-coverage-link-hint">
                            {mapsState.loaded ? 'Sugerencias de Google Places activas.' : 'O pega un link de Google Maps.'}
                        </div>
                        {suggestions.length || loadingSuggestions ? (
                            <div className="business-coverage-suggestions">
                                {loadingSuggestions ? <button type="button" disabled>Buscando ubicaciones...</button> : null}
                                {suggestions.map((suggestion) => (
                                    <button
                                        key={`${suggestion.id || suggestion.label}_${suggestion.type || ''}`}
                                        type="button"
                                        onClick={() => selectSuggestion(suggestion)}
                                    >
                                        {suggestion.label || suggestion.name}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="business-coverage-actions">
                        <button type="button" onClick={resolveFromTextOrLink} disabled={loading}>
                            {loading ? 'Buscando...' : 'Buscar cobertura'}
                        </button>
                        <button type="button" className="business-coverage-ghost-btn" onClick={useCustomerLocation} disabled={loading}>
                            Usar ubicacion del cliente
                        </button>
                    </div>
                </div>
                {latestSharedLocation ? (
                    <div className="business-coverage-hint">
                        Detecte {coordPair(latestSharedLocation) ? 'una ubicacion compartida' : 'un link de Google Maps'} reciente del cliente.
                    </div>
                ) : null}
                {mapsState.error ? <div className="business-coverage-error">{mapsState.error}</div> : null}
                {loading ? <div className="business-coverage-status">Verificando cobertura...</div> : null}
                {error ? <div className="business-coverage-error">{error}</div> : null}
            </div>

            {clientCoords ? (
                <div className="business-coverage-card business-coverage-map-card">
                    <div className="business-coverage-map-container">
                        {mapsState.loaded ? (
                            <>
                                <CoverageMap
                                    google={google}
                                    coords={clientCoords}
                                    agencies={agencies}
                                    onCoordsChange={resolveFromCoords}
                                />
                                <button type="button" className="business-coverage-map-maximize-btn" onClick={() => setMapMaximized(true)}>
                                    Maximizar
                                </button>
                            </>
                        ) : (
                            <div className="business-coverage-map-placeholder">
                                {apiKey ? 'Cargando mapa...' : 'Configura la API key de Google Maps para ver el mapa.'}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {result && zone ? (
                <div className="business-coverage-card business-coverage-result">
                    <div className="business-coverage-result-head">
                        <span>{zone.name || 'Zona resuelta'}</span>
                        <strong>{zone.segmentKey || zone.segment_key || (shippingType === 'courier' ? 'courier' : 'delivery')}</strong>
                    </div>
                    <div className="business-coverage-grid">
                        <div><span>Tipo</span><strong>{shippingType === 'courier' ? 'Courier' : 'Delivery'}</strong></div>
                        <div><span>Costo</span><strong>{cost ? `S/ ${cost}` : 'Por confirmar'}</strong></div>
                        <div><span>Gratis desde</span><strong>{freeFrom ? `S/ ${freeFrom}` : 'No aplica'}</strong></div>
                        <div><span>Tiempo</span><strong>{formatEstimatedTime(shipping?.estimated_time || shipping?.estimatedTime)}</strong></div>
                        <div><span>Modalidad</span><strong>{paymentModalityLabel(zone) || 'Segun coordinacion'}</strong></div>
                    </div>
                    <div className="business-coverage-chip-row">
                        {paymentLabels(zone).map((label) => <span key={label}>{label}</span>)}
                    </div>
                </div>
            ) : null}

            {result && !zone ? (
                <div className="business-coverage-card business-coverage-empty">
                    {result.needsGps || result.ambiguous
                        ? 'La ubicacion puede pertenecer a mas de una zona. Pide el pin GPS para confirmar.'
                        : 'No encontramos cobertura directa para esa ubicacion.'}
                </div>
            ) : null}

            {zone && shippingType === 'courier' ? (
                <div className="business-coverage-card">
                    <div className="business-coverage-title">Agencias cercanas</div>
                    {agencies.length ? (
                        <div className="business-coverage-agencies">
                            {agencies.map((agency, index) => {
                                const key = carrierKey(agency.carrier);
                                const metric = routeMetrics[key] || {};
                                const fallbackDistance = formatDistance(agency.distanceKm);
                                return (
                                    <div key={`${agency.carrier}_${agency.id || index}`} className={`business-coverage-agency business-coverage-agency--${key}`}>
                                        <div className="business-coverage-agency-head">
                                            <strong>{agency.name || agency.fullName}</strong>
                                            <span className={`business-coverage-carrier business-coverage-carrier--${key}`}>
                                                <i>{carrierLabel(agency.carrier).slice(0, 1)}</i>
                                                {carrierLabel(agency.carrier)}
                                            </span>
                                        </div>
                                        <p>{agency.address || 'Direccion no registrada'}</p>
                                        {agency.phonePrimary ? <small>📞 {agency.phonePrimary}</small> : null}
                                        {agency.hoursWeek || agency.hoursDelivery ? <small>🕐 {agency.hoursWeek || agency.hoursDelivery}</small> : null}
                                        <small>📏 {[metric.distanceText || fallbackDistance, metric.durationText ? `${metric.durationText} en auto` : ''].filter(Boolean).join(' · ') || 'Distancia por confirmar'}</small>
                                        {agencyMapUrl(agency) ? (
                                            <a className="business-coverage-map-link" href={agencyMapUrl(agency)} target="_blank" rel="noreferrer">
                                                Abrir en Google Maps
                                            </a>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="business-coverage-status">
                            Para ver agencias cercanas, usa la ubicacion del cliente o pide al cliente que la comparta.
                        </div>
                    )}
                </div>
            ) : null}

            {responseText ? (
                <div className="business-coverage-card business-coverage-detail-card">
                    <div className="business-coverage-result-head">
                        <span>Detalle para el chat</span>
                        <strong>Revisable</strong>
                    </div>
                    <pre className="business-coverage-detail-preview">
                        {buildPreparedCoverageMessage({ result, zone, shipping, agencies, routeMetrics })}
                    </pre>
                    <button
                        type="button"
                        className="business-coverage-send-detail"
                        onClick={prepareMessage}
                        disabled={!responseText || preparing}
                    >
                        {preparing ? 'Preparando...' : 'Preparar mensaje'}
                    </button>
                </div>
            ) : null}

            {mapMaximized && clientCoords ? (
                <div className="business-coverage-map-modal" role="dialog" aria-modal="true">
                    <div className="business-coverage-map-modal-head">
                        <strong>Mapa de cobertura</strong>
                        <button type="button" onClick={() => setMapMaximized(false)}>Cerrar</button>
                    </div>
                    <div className="business-coverage-map-modal-inner">
                        <CoverageMap
                            google={google}
                            coords={clientCoords}
                            agencies={agencies}
                            onCoordsChange={resolveFromCoords}
                            maximized
                            className="business-coverage-map business-coverage-map--modal"
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
