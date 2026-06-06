import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, MapPin, Navigation, X } from 'lucide-react';
import { API_URL } from '../../../config/runtime';
import {
    CoverageMap,
    agencyCoords,
    agencyListFromDecision,
    agencyMapUrl,
    carrierKey,
    coordPair,
    formatDistance,
    haversineKm,
    useGoogleMapsLoader
} from '../business/sections/BusinessCoverageTabSection';

const text = (value = '') => String(value || '').trim();

const buildHeaders = (buildApiHeaders, activeTenantId = '') => {
    const base = typeof buildApiHeaders === 'function'
        ? (buildApiHeaders({ includeJson: true }) || {})
        : { 'Content-Type': 'application/json' };
    const next = { 'Content-Type': 'application/json', ...base };
    if (activeTenantId) next['x-tenant-id'] = String(activeTenantId).trim();
    return next;
};

const googleMapsUrl = (location = {}) => {
    const coords = coordPair({ lat: location.latitude ?? location.lat, lng: location.longitude ?? location.lng });
    if (location.mapUrl) return text(location.mapUrl);
    return coords ? `https://maps.google.com/?q=${coords.lat},${coords.lng}` : '';
};

const wazeUrl = (location = {}) => {
    const coords = coordPair({ lat: location.latitude ?? location.lat, lng: location.longitude ?? location.lng });
    return coords ? `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes` : '';
};

const formatResolvedAddress = (location = {}, result = {}) => {
    const resolved = result?.resolvedLocation && typeof result.resolvedLocation === 'object'
        ? result.resolvedLocation
        : {};
    const pieces = [
        resolved.district,
        resolved.province,
        resolved.department
    ].map(text).filter(Boolean);
    return pieces.join(' - ')
        || text(location.label)
        || text(location.query)
        || text(location.mapUrl)
        || '';
};

export default function LocationMapDetails({
    location = {},
    buildApiHeaders,
    activeTenantId = '',
    activeChatId = '',
    onClose
}) {
    const coords = coordPair({ lat: location.latitude ?? location.lat, lng: location.longitude ?? location.lng });
    const [apiKey, setApiKey] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const headers = useMemo(() => buildHeaders(buildApiHeaders, activeTenantId), [activeTenantId, buildApiHeaders]);
    const mapsState = useGoogleMapsLoader(apiKey);
    const google = mapsState.loaded ? window.google : null;
    const agencies = useMemo(() => agencyListFromDecision(result?.agencies).slice(0, 3), [result?.agencies]);

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

    useEffect(() => {
        let cancelled = false;
        const loadCoverage = async () => {
            if (!coords) return;
            setLoading(true);
            setError('');
            try {
                const response = await fetch(`${API_URL}/api/tenant/coverage/detail`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        chatId: activeChatId || '',
                        lat: coords.lat,
                        lng: coords.lng,
                        lastMessage: text(location.label || location.query || location.mapUrl || `${coords.lat},${coords.lng}`)
                    })
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok || body?.ok === false) throw new Error(text(body?.error) || 'No se pudo cargar agencias cercanas.');
                if (!cancelled) setResult(body);
            } catch (err) {
                if (!cancelled) setError(text(err?.message) || 'No se pudo cargar agencias cercanas.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        loadCoverage();
        return () => {
            cancelled = true;
        };
    }, [activeChatId, coords?.lat, coords?.lng, headers, location.label, location.mapUrl, location.query]);

    const address = formatResolvedAddress(location, result);
    const coordinatesText = coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : '';
    const copyText = [address, coordinatesText].filter(Boolean).join('\n');
    const externalGoogleUrl = googleMapsUrl(location);
    const externalWazeUrl = wazeUrl(location);

    const handleCopy = async () => {
        if (!copyText) return;
        try {
            await navigator.clipboard?.writeText(copyText);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
        } catch (_) {
            setCopied(false);
        }
    };

    return (
        <div className="location-map-popup">
            <div className="location-map-popup-head">
                <strong><MapPin size={17} /> Ubicacion del cliente</strong>
                <button type="button" onClick={onClose} aria-label="Cerrar ubicacion"><X size={18} /> Cerrar</button>
            </div>
            <div className="location-map-popup-map">
                {coords && google?.maps ? (
                    <CoverageMap
                        google={google}
                        coords={coords}
                        agencies={agencies}
                        className="business-coverage-map location-map-popup-google-map"
                        maximized
                    />
                ) : (
                    <div className="location-map-popup-map-empty">
                        {coords ? 'Cargando Google Maps...' : 'No hay coordenadas validas para esta ubicacion.'}
                    </div>
                )}
            </div>
            <div className="location-map-popup-address">
                <strong>Direccion</strong>
                <span>{address || coordinatesText || 'Ubicacion compartida'}</span>
                {coordinatesText ? <small>{coordinatesText}</small> : null}
            </div>
            <div className="location-map-popup-actions">
                <button type="button" onClick={handleCopy} disabled={!copyText}>
                    <Copy size={14} /> {copied ? 'Copiado' : 'Copiar'}
                </button>
                {externalGoogleUrl ? (
                    <a href={externalGoogleUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} /> Google Maps
                    </a>
                ) : null}
                {externalWazeUrl ? (
                    <a href={externalWazeUrl} target="_blank" rel="noreferrer">
                        <Navigation size={14} /> Waze
                    </a>
                ) : null}
            </div>
            <div className="location-map-popup-agencies">
                <h4>Agencias mas cercanas</h4>
                {loading ? <div className="location-map-popup-muted">Buscando agencias cercanas...</div> : null}
                {!loading && error ? <div className="location-map-popup-muted">{error}</div> : null}
                {!loading && !error && agencies.length === 0 ? (
                    <div className="location-map-popup-muted">No hay agencias cercanas disponibles para esta ubicacion.</div>
                ) : null}
                {agencies.map((agency) => {
                    const key = carrierKey(agency.carrier || agency.name);
                    const fallbackDistanceKm = coords ? haversineKm(coords, agencyCoords(agency) || {}) : null;
                    const distance = formatDistance(agency.distanceKm ?? agency.distance_km)
                        || formatDistance(fallbackDistanceKm);
                    return (
                        <a
                            key={`${key}_${agency.name || agency.id || agency.address}`}
                            className="location-map-popup-agency"
                            href={agencyMapUrl(agency) || externalGoogleUrl || undefined}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <span>{agency.name || agency.carrier || 'Agencia'}</span>
                            <strong>{distance || 'Distancia por confirmar'}</strong>
                        </a>
                    );
                })}
            </div>
        </div>
    );
}
