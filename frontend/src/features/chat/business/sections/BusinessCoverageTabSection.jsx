import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../../../../config/runtime';

let googleMapsLoaderPromise = null;

function text(value = '') {
    return String(value || '').trim();
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function money(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
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
        } catch (_) {
        }
    }
    for (const decoded of values) {
        for (const pattern of patterns) {
            const match = decoded.match(pattern);
            if (!match) continue;
            const isLngLatPattern = String(pattern).includes('!2d');
            const lat = numberOrNull(isLngLatPattern ? match[2] : match[1]);
            const lng = numberOrNull(isLngLatPattern ? match[1] : match[2]);
            if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng };
            }
        }
    }
    return null;
}

async function expandMapsLink(url = '') {
    const clean = text(url).replace(/[),.;!?]+$/g, '');
    if (!clean || !isLikelyMapUrl(clean)) return clean;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(clean, { redirect: 'follow', signal: controller.signal });
        clearTimeout(timer);
        return text(response?.url) || clean;
    } catch (_) {
        return clean;
    }
}

function loadGoogleMaps(apiKey = '') {
    const cleanKey = text(apiKey);
    if (!cleanKey) return Promise.reject(new Error('Falta configurar la API key de Google Maps.'));
    if (window.google?.maps?.places) return Promise.resolve(window.google);
    if (googleMapsLoaderPromise) return googleMapsLoaderPromise;
    googleMapsLoaderPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-google-maps-loader="coverage"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.google));
            existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps.')));
            return;
        }
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cleanKey)}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.dataset.googleMapsLoader = 'coverage';
        script.onload = () => resolve(window.google);
        script.onerror = () => reject(new Error('No se pudo cargar Google Maps.'));
        document.head.appendChild(script);
    });
    return googleMapsLoaderPromise;
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

function carrierMarkerIcon(google, carrier = '') {
    const key = carrierKey(carrier);
    const fill = key === 'shalom' ? '#2563EB' : (key === 'marvisur' ? '#F97316' : '#185FA5');
    const letter = key === 'shalom' ? 'S' : (key === 'marvisur' ? 'M' : 'A');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="48" viewBox="0 0 42 48">
        <path d="M21 46s16-14.2 16-27A16 16 0 1 0 5 19c0 12.8 16 27 16 27Z" fill="${fill}" stroke="white" stroke-width="3"/>
        <circle cx="21" cy="19" r="10" fill="white" opacity=".96"/>
        <text x="21" y="23" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="${fill}">${letter}</text>
    </svg>`;
    return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new google.maps.Size(34, 39),
        anchor: new google.maps.Point(17, 39)
    };
}

function clientMarkerIcon(google) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="54" viewBox="0 0 48 54">
        <path d="M24 52S43 35.2 43 21A19 19 0 1 0 5 21c0 14.2 19 31 19 31Z" fill="#E11D48" stroke="white" stroke-width="4"/>
        <circle cx="24" cy="21" r="10" fill="white"/>
        <circle cx="24" cy="21" r="5" fill="#E11D48"/>
    </svg>`;
    return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new google.maps.Size(38, 43),
        anchor: new google.maps.Point(19, 43)
    };
}

function extractMessageBody(message = {}) {
    return text(
        message?.body
        || message?.text?.body
        || message?.text
        || message?.message?.text?.body
        || message?.message?.body
        || message?.message
        || message?.metadata?.body
        || ''
    );
}

function extractNativeCoords(message = {}) {
    const candidates = [
        message?.locationPayload,
        message?.location,
        message?.metadata?.locationPayload,
        message?.metadata?.location,
        message?.raw?.location,
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
        if (!payload || typeof payload !== 'object') continue;
        const lat = numberOrNull(payload.latitude ?? payload.lat ?? payload.degreesLatitude);
        const lng = numberOrNull(payload.longitude ?? payload.lng ?? payload.lon ?? payload.degreesLongitude);
        if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            return { lat, lng };
        }
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
        if (coords) return { ...coords, source: 'last_customer_maps_link' };
        const firstUrl = extractFirstUrl(body);
        if (firstUrl && isLikelyMapUrl(firstUrl)) {
            return { text: body, mapUrl: firstUrl, source: 'last_customer_maps_link' };
        }
    }
    return null;
}

export default function BusinessCoverageTabSection({
    activeTenantId = '',
    activeChatId = '',
    activeChatPhone = '',
    buildApiHeaders = null,
    messages = [],
    messagesRef = null,
    notify = null,
    socket = null
}) {
    const mapRef = useRef(null);
    const autocompleteTimerRef = useRef(null);
    const [apiKey, setApiKey] = useState('');
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mapLoading, setMapLoading] = useState(false);
    const [sendingMap, setSendingMap] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [coords, setCoords] = useState(null);
    const [staticMapPreview, setStaticMapPreview] = useState('');
    const [staticMapMediaData, setStaticMapMediaData] = useState('');
    const [staticMapMime, setStaticMapMime] = useState('image/png');
    const [staticMapProvider, setStaticMapProvider] = useState('');

    const headers = useMemo(() => {
        const base = typeof buildApiHeaders === 'function'
            ? (buildApiHeaders({ includeJson: true }) || {})
            : { 'Content-Type': 'application/json' };
        const next = { 'Content-Type': 'application/json', ...base };
        if (activeTenantId) next['x-tenant-id'] = String(activeTenantId).trim();
        return next;
    }, [activeTenantId, buildApiHeaders]);

    const resolveCoverage = useCallback(async (payload = {}, sourceCoords = null) => {
        setLoading(true);
        setError('');
        setStaticMapPreview('');
        setStaticMapMediaData('');
        setStaticMapProvider('');
        try {
            const response = await fetch(`${API_URL}/api/tenant/zones/resolve-location`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body?.ok === false) {
                throw new Error(text(body?.error) || 'No se pudo verificar cobertura.');
            }
            const resolvedCoords = sourceCoords
                || (numberOrNull(payload.lat) !== null && numberOrNull(payload.lng) !== null
                    ? { lat: numberOrNull(payload.lat), lng: numberOrNull(payload.lng) }
                    : null)
                || (numberOrNull(body?.resolvedLocation?.lat) !== null && numberOrNull(body?.resolvedLocation?.lng) !== null
                    ? { lat: numberOrNull(body.resolvedLocation.lat), lng: numberOrNull(body.resolvedLocation.lng) }
                    : null);
            setCoords(resolvedCoords);
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
    }, [headers, notify]);

    useEffect(() => {
        let active = true;
        fetch(`${API_URL}/api/tenant/config/maps-api-key`, { headers })
            .then((response) => response.json())
            .then((body) => {
                if (!active) return;
                setApiKey(text(body?.apiKey || ''));
            })
            .catch(() => {
                if (active) setApiKey('');
            });
        return () => {
            active = false;
        };
    }, [headers]);

    const runAutocomplete = useCallback((value = '') => {
        const clean = text(value);
        window.clearTimeout(autocompleteTimerRef.current);
        setSuggestions([]);
        if (clean.length < 3 || isLikelyMapUrl(clean) || !apiKey) return;
        autocompleteTimerRef.current = window.setTimeout(async () => {
            setLoadingSuggestions(true);
            try {
                const google = await loadGoogleMaps(apiKey);
                const service = new google.maps.places.AutocompleteService();
                service.getPlacePredictions({
                    input: clean,
                    componentRestrictions: { country: 'pe' },
                    language: 'es'
                }, (predictions = [], status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        setSuggestions((predictions || []).slice(0, 5));
                    } else {
                        setSuggestions([]);
                    }
                    setLoadingSuggestions(false);
                });
            } catch (_) {
                setLoadingSuggestions(false);
            }
        }, 350);
    }, [apiKey]);

    const handleQueryChange = useCallback((event) => {
        const value = event.target.value;
        setQuery(value);
        runAutocomplete(value);
    }, [runAutocomplete]);

    const resolveFromTextOrLink = useCallback(async () => {
        const clean = text(query);
        if (!clean) {
            setError('Escribe una direccion, distrito o pega un link de Google Maps.');
            return;
        }
        const directCoords = parseCoordsFromText(clean);
        if (directCoords) {
            await resolveCoverage({ lat: directCoords.lat, lng: directCoords.lng }, directCoords);
            return;
        }
        const firstUrl = extractFirstUrl(clean);
        if (firstUrl && isLikelyMapUrl(firstUrl)) {
            const expanded = await expandMapsLink(firstUrl);
            const coordsFromLink = parseCoordsFromText(expanded || firstUrl);
            if (coordsFromLink) {
                await resolveCoverage({ lat: coordsFromLink.lat, lng: coordsFromLink.lng }, coordsFromLink);
                return;
            }
        }
        const resolved = await resolveCoverage({ text: clean });
        if (firstUrl && isLikelyMapUrl(firstUrl) && !resolved?.zone && !resolved?.ambiguous) {
            const latest = latestCustomerLocationSource(messagesRef, messages);
            if (numberOrNull(latest?.lat) !== null && numberOrNull(latest?.lng) !== null) {
                await resolveCoverage({ lat: latest.lat, lng: latest.lng }, latest);
            }
        }
    }, [messages, messagesRef, query, resolveCoverage]);

    const selectSuggestion = useCallback(async (suggestion = {}) => {
        const placeId = text(suggestion.place_id || suggestion.placeId || '');
        if (!placeId || !apiKey) return;
        setLoading(true);
        setError('');
        setSuggestions([]);
        setQuery(text(suggestion.description || suggestion.structured_formatting?.main_text || ''));
        try {
            const google = await loadGoogleMaps(apiKey);
            const service = new google.maps.places.PlacesService(document.createElement('div'));
            service.getDetails({ placeId, fields: ['geometry', 'formatted_address', 'name'] }, async (place, status) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
                    setLoading(false);
                    setError('No pude obtener coordenadas de esa direccion.');
                    return;
                }
                const nextCoords = {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng()
                };
                await resolveCoverage({ lat: nextCoords.lat, lng: nextCoords.lng }, nextCoords);
            });
        } catch (err) {
            setError(text(err?.message) || 'No se pudo consultar Google Maps.');
            setLoading(false);
        }
    }, [apiKey, resolveCoverage]);

    const useCustomerLocation = useCallback(() => {
        const latest = latestCustomerLocationSource(messagesRef, messages);
        if (!latest) {
            setError('Este chat no tiene una ubicacion o link de Maps reciente del cliente.');
            return;
        }
        if (numberOrNull(latest.lat) !== null && numberOrNull(latest.lng) !== null) {
            resolveCoverage({ lat: latest.lat, lng: latest.lng }, latest);
            return;
        }
        if (latest.text || latest.mapUrl) {
            resolveCoverage({ text: latest.text || latest.mapUrl });
            return;
        }
        setError('No pude leer la ubicacion compartida del cliente.');
    }, [messages, messagesRef, resolveCoverage]);

    const zone = result?.zone || null;
    const shipping = firstActiveShippingOption(zone || {});
    const shippingType = text(shipping?.type).toLowerCase() === 'courier' ? 'courier' : 'delivery';
    const cost = money(shipping?.cost);
    const freeFrom = money(shipping?.free_from ?? shipping?.freeFrom);
    const agencies = Array.isArray(result?.agencies) ? result.agencies.slice(0, 3) : [];
    const latestSharedLocation = useMemo(() => latestCustomerLocationSource(messagesRef, messages), [messages, messagesRef, result, query]);

    useEffect(() => {
        if (!apiKey || !coords?.lat || !coords?.lng || !mapRef.current) return;
        let disposed = false;
        setMapLoading(true);
        loadGoogleMaps(apiKey)
            .then((google) => {
                if (disposed || !mapRef.current) return;
                const map = new google.maps.Map(mapRef.current, {
                    center: coords,
                    zoom: 13,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false
                });
                const bounds = new google.maps.LatLngBounds();
                const clientPosition = new google.maps.LatLng(coords.lat, coords.lng);
                bounds.extend(clientPosition);
                new google.maps.Marker({
                    map,
                    position: clientPosition,
                    title: 'Ubicacion del cliente',
                    icon: clientMarkerIcon(google),
                    zIndex: 1000
                });
                agencies.forEach((agency) => {
                    const lat = numberOrNull(agency.latitude);
                    const lng = numberOrNull(agency.longitude);
                    if (lat === null || lng === null) return;
                    const position = new google.maps.LatLng(lat, lng);
                    bounds.extend(position);
                    const marker = new google.maps.Marker({
                        map,
                        position,
                        title: agency.name || agency.fullName || 'Agencia',
                        icon: carrierMarkerIcon(google, agency.carrier)
                    });
                    const info = new google.maps.InfoWindow({
                        content: `<strong>${agency.name || agency.fullName || 'Agencia'}</strong><br>${agency.address || ''}<br>${agency.hoursWeek || agency.hoursDelivery || ''}<br>${formatDistance(agency.distanceKm)}`
                    });
                    marker.addListener('click', () => info.open({ anchor: marker, map }));
                });
                if (agencies.length) map.fitBounds(bounds, 42);
                setMapLoading(false);
            })
            .catch((err) => {
                if (!disposed) {
                    setMapLoading(false);
                    setError(text(err?.message) || 'No se pudo cargar el mapa.');
                }
            });
        return () => {
            disposed = true;
        };
    }, [apiKey, coords, agencies]);

    const generateStaticMap = useCallback(async () => {
        if (!coords?.lat || !coords?.lng) {
            setError('Primero resuelve una ubicacion con coordenadas.');
            return;
        }
        setMapLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_URL}/api/tenant/coverage/static-map`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    lat: coords.lat,
                    lng: coords.lng,
                    zoneName: zone?.name || '',
                    agencies: agencies.map((agency) => ({
                        id: agency.id,
                        carrier: agency.carrier,
                        name: agency.name || agency.fullName || agency.full_name || '',
                        address: agency.address || '',
                        district: agency.district || agency.city || '',
                        distanceKm: agency.distanceKm ?? agency.distance_km ?? null,
                        latitude: agency.latitude,
                        longitude: agency.longitude
                    }))
                })
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body?.ok === false || !body?.mediaData) {
                throw new Error(text(body?.error) || 'No se pudo generar la imagen del mapa.');
            }
            setStaticMapMediaData(text(body.mediaData));
            setStaticMapMime(text(body.mimetype || 'image/png') || 'image/png');
            setStaticMapPreview(text(body.dataUrl || `data:${body.mimetype || 'image/png'};base64,${body.mediaData}`));
            setStaticMapProvider(text(body.provider || 'google'));
        } catch (err) {
            const message = text(err?.message) || 'No se pudo generar la imagen del mapa.';
            setError(message);
            if (typeof notify === 'function') notify({ type: 'error', message });
        } finally {
            setMapLoading(false);
        }
    }, [agencies, coords, headers, notify, zone?.name]);

    const sendStaticMap = useCallback(() => {
        if (!socket || typeof socket.emit !== 'function' || !activeChatId || !staticMapMediaData) return;
        setSendingMap(true);
        const caption = zone?.name
            ? `Mapa de cobertura para ${zone.name}`
            : 'Mapa de cobertura';
        socket.emit('send_media_message', {
            to: activeChatId,
            toPhone: activeChatPhone || null,
            body: caption,
            mediaData: staticMapMediaData,
            mimetype: staticMapMime || 'image/png',
            filename: 'mapa-cobertura.png'
        });
        window.setTimeout(() => setSendingMap(false), 900);
        if (typeof notify === 'function') notify({ type: 'success', message: 'Mapa enviado al cliente.' });
    }, [activeChatId, activeChatPhone, notify, socket, staticMapMediaData, staticMapMime, zone?.name]);

    return (
        <div className="business-coverage-shell business-coverage-shell--maps">
            <div className="business-coverage-card business-coverage-hero">
                <div>
                    <div className="business-coverage-title">Verificar cobertura</div>
                    <div className="business-coverage-subtitle">Busca una direccion real, pega un link de Google Maps o usa la ubicacion compartida por el cliente.</div>
                </div>
                <div className="business-coverage-search business-coverage-search--maps">
                    <div className="business-coverage-autocomplete">
                        <input
                            value={query}
                            onChange={handleQueryChange}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') resolveFromTextOrLink();
                            }}
                            placeholder="Direccion, distrito o link de Google Maps..."
                        />
                        {suggestions.length || loadingSuggestions ? (
                            <div className="business-coverage-suggestions">
                                {loadingSuggestions ? <button type="button" disabled>Buscando direcciones...</button> : null}
                                {suggestions.map((suggestion) => (
                                    <button
                                        key={suggestion.place_id}
                                        type="button"
                                        onClick={() => selectSuggestion(suggestion)}
                                    >
                                        {suggestion.description}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="business-coverage-actions">
                        <button type="button" onClick={resolveFromTextOrLink} disabled={loading}>
                            Buscar cobertura
                        </button>
                        <button type="button" className="business-coverage-ghost-btn" onClick={useCustomerLocation} disabled={loading}>
                            Usar ubicacion compartida
                        </button>
                    </div>
                </div>
                {latestSharedLocation ? (
                    <div className="business-coverage-hint">
                        Detecte {latestSharedLocation.lat ? 'una ubicacion compartida' : 'un link de Google Maps'} reciente del cliente.
                    </div>
                ) : null}
                {loading ? <div className="business-coverage-status">Verificando cobertura...</div> : null}
                {error ? <div className="business-coverage-error">{error}</div> : null}
                {!apiKey ? <div className="business-coverage-status">Google Maps no tiene API key configurada; aun puedes buscar por texto.</div> : null}
            </div>

            {coords ? (
                <div className="business-coverage-card business-coverage-map-card">
                    <div className="business-coverage-result-head">
                        <span>Mapa de ubicacion</span>
                        <strong>{mapLoading ? 'Cargando mapa' : 'Coordenadas listas'}</strong>
                    </div>
                    <div ref={mapRef} className="business-coverage-map" />
                </div>
            ) : null}

            {result && zone ? (
                <div className="business-coverage-card business-coverage-result">
                    <div className="business-coverage-result-head">
                        <span>{zone.name || 'Zona resuelta'}</span>
                        <strong>{shippingType === 'courier' ? `Agencia ${text(shipping?.label || '').trim() || ''}` : 'Delivery a domicilio'}</strong>
                    </div>
                    <div className="business-coverage-grid">
                        <div><span>Costo</span><strong>{cost ? `S/ ${cost}` : 'Por confirmar'}</strong></div>
                        <div><span>Gratis desde</span><strong>{freeFrom ? `S/ ${freeFrom}` : 'No aplica'}</strong></div>
                        <div><span>Tiempo</span><strong>{formatEstimatedTime(shipping?.estimated_time || shipping?.estimatedTime)}</strong></div>
                        <div><span>Resuelto por</span><strong>{result.resolvedBy || '-'}</strong></div>
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

            {agencies.length ? (
                <div className="business-coverage-card">
                    <div className="business-coverage-title">Agencias cercanas</div>
                    <div className="business-coverage-agencies">
                        {agencies.map((agency, index) => (
                            <div key={`${agency.carrier}_${agency.id || index}`} className="business-coverage-agency">
                                <div className="business-coverage-agency-head">
                                    <strong>{agency.name || agency.fullName}</strong>
                                    <span className={`business-coverage-carrier business-coverage-carrier--${carrierKey(agency.carrier)}`}>
                                        <i>{carrierLabel(agency.carrier).slice(0, 1)}</i>
                                        {carrierLabel(agency.carrier)}
                                    </span>
                                </div>
                                <p>{agency.address || 'Direccion no registrada'}</p>
                                <small>{[agency.district, formatDistance(agency.distanceKm)].filter(Boolean).join(' - ')}</small>
                                {agency.phonePrimary ? <small>Tel: {agency.phonePrimary}</small> : null}
                                {agency.hoursWeek || agency.hoursDelivery ? <small>{agency.hoursWeek || agency.hoursDelivery}</small> : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {coords ? (
                <div className="business-coverage-card business-coverage-static-card">
                    <div className="business-coverage-result-head">
                        <span>Imagen para enviar</span>
                        <strong>{staticMapProvider === 'osm' ? 'Mapa alternativo' : staticMapProvider === 'local' ? 'Imagen generada' : 'Mapa para WhatsApp'}</strong>
                    </div>
                    <div className="business-coverage-static-actions">
                        <button type="button" onClick={generateStaticMap} disabled={!coords?.lat || !coords?.lng || mapLoading}>
                            {mapLoading ? 'Generando...' : 'Generar imagen del mapa'}
                        </button>
                        <button type="button" className="business-coverage-ghost-btn" onClick={sendStaticMap} disabled={!staticMapMediaData || !activeChatId || sendingMap}>
                            {sendingMap ? 'Enviando...' : 'Enviar al cliente'}
                        </button>
                    </div>
                    {staticMapPreview ? (
                        <img className="business-coverage-static-preview" src={staticMapPreview} alt="Mapa de cobertura" />
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
