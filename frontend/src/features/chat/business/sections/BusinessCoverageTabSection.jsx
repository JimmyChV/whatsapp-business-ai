import React, { useCallback, useMemo, useState } from 'react';
import { API_URL } from '../../../../config/runtime';

function text(value = '') {
    return String(value || '').trim();
}

function money(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
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

export default function BusinessCoverageTabSection({
    activeTenantId = '',
    buildApiHeaders = null,
    notify = null
}) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
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
            const response = await fetch(`${API_URL}/api/tenant/zones/resolve-location`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
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
    }, [headers, notify]);

    const searchByText = useCallback(() => {
        const clean = text(query);
        if (!clean) {
            setError('Escribe una ubicacion para buscar.');
            return;
        }
        resolveCoverage({ text: clean });
    }, [query, resolveCoverage]);

    const useBrowserLocation = useCallback(() => {
        if (!navigator?.geolocation) {
            setError('Tu navegador no permite geolocalizacion.');
            return;
        }
        setLoading(true);
        setError('');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolveCoverage({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            () => {
                setLoading(false);
                setError('No pudimos obtener tu ubicacion.');
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    }, [resolveCoverage]);

    const zone = result?.zone || null;
    const shipping = firstActiveShippingOption(zone || {});
    const shippingType = text(shipping?.type).toLowerCase() === 'courier' ? 'courier' : 'delivery';
    const cost = money(shipping?.cost);
    const freeFrom = money(shipping?.free_from ?? shipping?.freeFrom);
    const agencies = Array.isArray(result?.agencies) ? result.agencies.slice(0, 3) : [];

    return (
        <div className="business-coverage-shell">
            <div className="business-coverage-card">
                <div className="business-coverage-title">Verificar cobertura</div>
                <div className="business-coverage-subtitle">Busca una zona o usa tu ubicacion para ver envio y agencias.</div>
                <div className="business-coverage-search">
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') searchByText();
                        }}
                        placeholder="Distrito, provincia o codigo postal..."
                    />
                    <button type="button" onClick={searchByText} disabled={loading}>
                        Buscar
                    </button>
                    <button type="button" className="business-coverage-ghost-btn" onClick={useBrowserLocation} disabled={loading}>
                        Usar mi ubicacion
                    </button>
                </div>
                {loading ? <div className="business-coverage-status">Verificando cobertura...</div> : null}
                {error ? <div className="business-coverage-error">{error}</div> : null}
            </div>

            {result && zone ? (
                <div className="business-coverage-card business-coverage-result">
                    <div className="business-coverage-result-head">
                        <span>{zone.name || 'Zona resuelta'}</span>
                        <strong>{shippingType === 'courier' ? 'Agencia' : 'Delivery a domicilio'}</strong>
                    </div>
                    <div className="business-coverage-grid">
                        <div><span>Costo</span><strong>{cost ? `S/ ${cost}` : 'Por confirmar'}</strong></div>
                        <div><span>Gratis desde</span><strong>{freeFrom ? `S/ ${freeFrom}` : 'No aplica'}</strong></div>
                        <div><span>Tiempo</span><strong>{shipping?.estimated_time || shipping?.estimatedTime || 'Por confirmar'} h</strong></div>
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
                                    <span>{text(agency.carrier).toUpperCase()}</span>
                                </div>
                                <p>{agency.address || 'Direccion no registrada'}</p>
                                <small>{[agency.district, formatDistance(agency.distanceKm)].filter(Boolean).join(' · ')}</small>
                                {agency.hoursWeek || agency.hoursDelivery ? <small>{agency.hoursWeek || agency.hoursDelivery}</small> : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
