import React from 'react';

const DEFAULT_LIMIT = 100;

function text(value = '') {
    return String(value || '').trim();
}

function formatDate(value, formatDateTimeLabel) {
    if (!value) return '-';
    if (typeof formatDateTimeLabel === 'function') return formatDateTimeLabel(value);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function actionLabel(action = '') {
    const normalized = text(action);
    const labels = {
        'auth.login.success': 'Login exitoso',
        'auth.login.failed': 'Login fallido',
        'auth.logout.success': 'Logout',
        'auth.device.otp_verified': 'OTP verificado',
        'auth.device.revoked': 'Dispositivo revocado',
        'auth.device.reauth_requested': 'Reautorizacion solicitada',
        'auth.device.reauthorized': 'Dispositivo reautorizado',
        'auth.device.rename': 'Dispositivo renombrado',
        'campaign.created': 'Campana creada',
        'campaign.sent': 'Campana enviada',
        'customer.updated': 'Cliente actualizado',
        'config.updated': 'Configuracion cambiada',
        'user.created': 'Usuario creado',
        'user.deactivated': 'Usuario desactivado'
    };
    return labels[normalized] || normalized || 'Evento';
}

function actionTone(action = '') {
    const normalized = text(action);
    if (normalized.includes('failed') || normalized.includes('revoked') || normalized.includes('revoke')) return 'danger';
    if (normalized.includes('login') || normalized.includes('verified') || normalized.includes('created')) return 'success';
    if (normalized.includes('campaign')) return 'info';
    return 'neutral';
}

function buildQuery(filters = {}, offset = 0) {
    const params = new URLSearchParams();
    params.set('limit', String(DEFAULT_LIMIT));
    params.set('offset', String(offset));
    if (text(filters.userId)) params.set('userId', text(filters.userId));
    if (text(filters.action)) params.set('action', text(filters.action));
    if (text(filters.from)) params.set('from', text(filters.from));
    if (text(filters.to)) params.set('to', `${text(filters.to)}T23:59:59`);
    return `/api/audit/logs?${params.toString()}`;
}

function AuditRow({ item, formatDateTimeLabel }) {
    const payload = item?.payload && typeof item.payload === 'object' ? item.payload : {};
    const entityType = item?.resourceType || item?.entityType || '-';
    const entityId = item?.resourceId || item?.entityId || '-';
    const detail = payload?.data
        ? JSON.stringify(payload.data).slice(0, 140)
        : (Object.keys(payload).length ? JSON.stringify(payload).slice(0, 140) : 'Sin detalle adicional');
    return (
        <article className="saas-audit-row">
            <div className="saas-audit-row__time">
                <strong>{formatDate(item?.createdAt, formatDateTimeLabel)}</strong>
                <span>{item?.ip || payload?.ip || 'IP no disponible'}</span>
            </div>
            <div className="saas-audit-row__main">
                <span className={`saas-audit-action saas-audit-action--${actionTone(item?.action)}`}>
                    {actionLabel(item?.action)}
                </span>
                <strong>{item?.userEmail || item?.userId || 'Sistema'}</strong>
                <small>{entityType}{entityId !== '-' ? ` - ${entityId}` : ''}</small>
            </div>
            <div className="saas-audit-row__payload">{detail}</div>
        </article>
    );
}

export default function AuditSettingsDetailPane({
    settingsTenantId,
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson,
    formatDateTimeLabel,
    canViewAuditLogs = false
}) {
    const [items, setItems] = React.useState([]);
    const [filters, setFilters] = React.useState({ userId: '', action: '', from: '', to: '' });
    const [offset, setOffset] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    const isVisible = Boolean(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'audit_logs' && canViewAuditLogs);

    const loadLogs = React.useCallback(async (nextOffset = offset) => {
        if (!isVisible || typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        try {
            const payload = await requestJson(buildQuery(filters, nextOffset), {
                method: 'GET',
                tenantIdOverride: settingsTenantId
            });
            setItems(Array.isArray(payload?.items) ? payload.items : []);
            setOffset(nextOffset);
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo cargar la auditoria.'));
        } finally {
            setLoading(false);
        }
    }, [filters, isVisible, offset, requestJson, settingsTenantId]);

    React.useEffect(() => {
        void loadLogs(0);
    }, [loadLogs]);

    const updateFilter = React.useCallback((key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    if (!isVisible) return null;

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Auditoria</h3>
                    <small>Eventos sensibles de acceso, dispositivos, campanas y cambios operativos.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading} onClick={() => loadLogs(0)}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}

            <div className="saas-admin-related-block saas-audit-panel">
                <div className="saas-audit-filters">
                    <input
                        value={filters.userId}
                        onChange={(event) => updateFilter('userId', event.target.value)}
                        placeholder="Filtrar por user_id"
                    />
                    <input
                        value={filters.action}
                        onChange={(event) => updateFilter('action', event.target.value)}
                        placeholder="Accion exacta"
                    />
                    <input
                        type="date"
                        value={filters.from}
                        onChange={(event) => updateFilter('from', event.target.value)}
                    />
                    <input
                        type="date"
                        value={filters.to}
                        onChange={(event) => updateFilter('to', event.target.value)}
                    />
                    <button type="button" disabled={loading} onClick={() => loadLogs(0)}>
                        Aplicar
                    </button>
                </div>

                {loading ? (
                    <div className="saas-admin-empty-inline">Cargando auditoria...</div>
                ) : items.length ? (
                    <div className="saas-audit-list">
                        {items.map((item) => (
                            <AuditRow key={item.id} item={item} formatDateTimeLabel={formatDateTimeLabel} />
                        ))}
                    </div>
                ) : (
                    <div className="saas-admin-empty-inline">No hay eventos con estos filtros.</div>
                )}

                <div className="saas-audit-pagination">
                    <button type="button" disabled={loading || offset <= 0} onClick={() => loadLogs(Math.max(0, offset - DEFAULT_LIMIT))}>
                        Anterior
                    </button>
                    <span>Mostrando {offset + 1}-{offset + items.length}</span>
                    <button type="button" disabled={loading || items.length < DEFAULT_LIMIT} onClick={() => loadLogs(offset + DEFAULT_LIMIT)}>
                        Siguiente
                    </button>
                </div>
            </div>
        </>
    );
}
