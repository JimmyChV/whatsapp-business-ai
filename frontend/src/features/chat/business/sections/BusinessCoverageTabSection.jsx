import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../../../../config/runtime';

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
            if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng };
            }
        }
    }
    return null;
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
    const values = [
        modality.prepaid !== false ? 'anticipado' : '',
        modality.cash_on_delivery || modality.cashOnDelivery ? 'contraentrega' : ''
    ].filter(Boolean);
    return values.length ? values.join(' o ') : 'segun coordinacion';
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
            return { text: body || firstUrl, mapUrl: firstUrl, source: 'last_customer_maps_link' };
        }
    }
    return null;
}

function agencyListFromDecision(agencies) {
    if (!agencies) return [];
    if (Array.isArray(agencies)) return agencies;
    return ['marvisur', 'shalom']
        .map((carrier) => agencies[carrier] ? ({ ...agencies[carrier], carrier: agencies[carrier].carrier || carrier }) : null)
        .filter(Boolean);
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
    const searchTimerRef = useRef(null);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sendingDetail, setSendingDetail] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const headers = useMemo(() => {
        const base = typeof buildApiHeaders === 'function'
            ? (buildApiHeaders({ includeJson: true }) || {})
            : { 'Content-Type': 'application/json' };
        const next = { 'Content-Type': 'application/json', ...base };
        if (activeTenantId) next['x-tenant-id'] = String(activeTenantId).trim();
        return next;
    }, [activeTenantId, buildApiHeaders]);

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

    const loadGeoSuggestions = useCallback((value = '') => {
        const clean = text(value);
        window.clearTimeout(searchTimerRef.current);
        setSuggestions([]);
        if (clean.length < 2 || isLikelyMapUrl(clean) || parseCoordsFromText(clean)) return;
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
    }, [headers]);

    const handleQueryChange = useCallback((event) => {
        const value = event.target.value;
        setQuery(value);
        loadGeoSuggestions(value);
    }, [loadGeoSuggestions]);

    const resolveFromTextOrLink = useCallback(async () => {
        const clean = text(query);
        if (!clean) {
            setError('Escribe una direccion, distrito o pega un link de Google Maps.');
            return;
        }
        setSuggestions([]);
        const directCoords = parseCoordsFromText(clean);
        if (directCoords) {
            await resolveCoverage({ lat: directCoords.lat, lng: directCoords.lng, lastMessage: clean });
            return;
        }
        await resolveCoverage({ text: clean, lastMessage: clean });
    }, [query, resolveCoverage]);

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
            setError('El cliente aun no ha compartido su ubicacion en este chat.');
            return;
        }
        if (numberOrNull(latest.lat) !== null && numberOrNull(latest.lng) !== null) {
            resolveCoverage({ lat: latest.lat, lng: latest.lng, lastMessage: 'Ubicacion compartida' });
            return;
        }
        if (latest.text || latest.mapUrl) {
            resolveCoverage({ text: latest.text || latest.mapUrl, lastMessage: latest.text || latest.mapUrl });
            return;
        }
        setError('No pude leer la ubicacion compartida del cliente.');
    }, [messages, messagesRef, resolveCoverage]);

    const sendCoverageDetail = useCallback(() => {
        const responseText = text(result?.responseText || '');
        if (!socket || typeof socket.emit !== 'function' || !activeChatId || !responseText) return;
        setSendingDetail(true);
        socket.emit('send_message', {
            to: activeChatId,
            toPhone: activeChatPhone || null,
            body: responseText
        });
        window.setTimeout(() => setSendingDetail(false), 700);
        if (typeof notify === 'function') notify({ type: 'success', message: 'Detalle enviado al cliente.' });
    }, [activeChatId, activeChatPhone, notify, result?.responseText, socket]);

    const latestSharedLocation = useMemo(() => latestCustomerLocationSource(messagesRef, messages), [messages, messagesRef, result]);
    const zone = result?.zone || null;
    const shipping = firstActiveShippingOption(zone || {});
    const shippingType = text(shipping?.type).toLowerCase() === 'courier' ? 'courier' : 'delivery';
    const cost = money(shipping?.cost);
    const freeFrom = money(shipping?.free_from ?? shipping?.freeFrom);
    const agencies = agencyListFromDecision(result?.agencies);
    const responseText = text(result?.responseText || '');

    useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

    return (
        <div className="business-coverage-shell business-coverage-shell--maps">
            <div className="business-coverage-card business-coverage-hero">
                <div>
                    <div className="business-coverage-title">Verificar cobertura</div>
                    <div className="business-coverage-subtitle">Busca la ubicacion del cliente.</div>
                </div>
                <div className="business-coverage-search business-coverage-search--maps">
                    <div className="business-coverage-autocomplete">
                        <input
                            value={query}
                            onChange={handleQueryChange}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') resolveFromTextOrLink();
                            }}
                            placeholder="Escribe una direccion o distrito..."
                        />
                        <div className="business-coverage-link-hint">O pega un link de Google Maps.</div>
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
                        Detecte {latestSharedLocation.lat ? 'una ubicacion compartida' : 'un link de Google Maps'} reciente del cliente.
                    </div>
                ) : null}
                {loading ? <div className="business-coverage-status">Verificando cobertura...</div> : null}
                {error ? <div className="business-coverage-error">{error}</div> : null}
            </div>

            {result && zone ? (
                <div className="business-coverage-card business-coverage-result">
                    <div className="business-coverage-result-head">
                        <span>{zone.name || 'Zona resuelta'}</span>
                        <strong>{shippingType === 'courier' ? 'Agencia Marvisur + Shalom' : 'Delivery'}</strong>
                    </div>
                    <div className="business-coverage-grid">
                        <div><span>Costo</span><strong>{cost ? `S/ ${cost}` : 'Por confirmar'}</strong></div>
                        <div><span>Gratis desde</span><strong>{freeFrom ? `S/ ${freeFrom}` : 'No aplica'}</strong></div>
                        <div><span>Tiempo</span><strong>{formatEstimatedTime(shipping?.estimated_time || shipping?.estimatedTime)}</strong></div>
                        <div><span>Modalidad</span><strong>{paymentModalityLabel(zone)}</strong></div>
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
                        <span>Detalle para enviar</span>
                        <strong>Texto deterministico</strong>
                    </div>
                    <pre className="business-coverage-detail-preview">{responseText}</pre>
                    <button
                        type="button"
                        className="business-coverage-send-detail"
                        onClick={sendCoverageDetail}
                        disabled={!activeChatId || sendingDetail}
                    >
                        {sendingDetail ? 'Enviando...' : 'Enviar detalle al cliente'}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
