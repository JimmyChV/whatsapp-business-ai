import React from 'react';

const LIMIT = 5;

function text(value = '') {
    return String(value || '').trim();
}

function emailValid(value = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value).toLowerCase());
}

function AuthorizerRow({ item, busy, onDelete }) {
    return (
        <article className="saas-device-row">
            <div className="saas-device-row__main">
                <div className="saas-device-row__icon" aria-hidden="true">
                    A
                </div>
                <div className="saas-device-row__content">
                    <div className="saas-device-row__title">
                        <strong>{text(item?.name) || 'Autorizador'}</strong>
                        <span className="saas-device-badge saas-device-badge--active">Activo</span>
                    </div>
                    <div className="saas-device-row__meta">
                        <span>{item?.email || '-'}</span>
                    </div>
                </div>
            </div>
            <div className="saas-device-row__actions">
                <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => onDelete(item?.id)}
                >
                    Eliminar
                </button>
            </div>
        </article>
    );
}

export default function DeviceAuthorizersSettingsDetailPane({
    settingsTenantId,
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson
}) {
    const [items, setItems] = React.useState([]);
    const [form, setForm] = React.useState({ name: '', email: '' });
    const [loading, setLoading] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');

    const isVisible = Boolean(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'device_authorizers');
    const count = Array.isArray(items) ? items.length : 0;

    const loadAuthorizers = React.useCallback(async () => {
        if (!isVisible || typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson('/api/tenant/device-authorizers', {
                method: 'GET',
                tenantIdOverride: settingsTenantId
            });
            setItems(Array.isArray(payload?.items) ? payload.items : []);
        } catch (err) {
            setError(String(err?.message || err || 'No se pudieron cargar autorizadores.'));
        } finally {
            setLoading(false);
        }
    }, [isVisible, requestJson, settingsTenantId]);

    React.useEffect(() => {
        void loadAuthorizers();
    }, [loadAuthorizers]);

    const updateField = React.useCallback((key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    }, []);

    const addAuthorizer = React.useCallback(async () => {
        if (typeof requestJson !== 'function') return;
        const email = text(form.email).toLowerCase();
        if (!emailValid(email)) {
            setError('Ingresa un email valido.');
            return;
        }
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson('/api/tenant/device-authorizers', {
                method: 'POST',
                tenantIdOverride: settingsTenantId,
                body: {
                    name: text(form.name),
                    email
                }
            });
            setItems(Array.isArray(payload?.items) ? payload.items : []);
            setForm({ name: '', email: '' });
            setMessage('Autorizador agregado.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo agregar autorizador.'));
        } finally {
            setBusy(false);
        }
    }, [form.email, form.name, requestJson, settingsTenantId]);

    const deleteAuthorizer = React.useCallback(async (id) => {
        if (typeof requestJson !== 'function' || !id) return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson(`/api/tenant/device-authorizers/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                tenantIdOverride: settingsTenantId
            });
            setItems(Array.isArray(payload?.items) ? payload.items : []);
            setMessage('Autorizador eliminado.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo eliminar autorizador.'));
        } finally {
            setBusy(false);
        }
    }, [requestJson, settingsTenantId]);

    if (!isVisible) return null;

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Autorizadores de dispositivos</h3>
                    <small>Estas personas reciben el OTP cuando alguien entra desde un dispositivo nuevo.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading || busy} onClick={loadAuthorizers}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}
            {message ? <div className="saas-admin-success-inline">{message}</div> : null}

            <div className="saas-admin-related-block saas-device-panel">
                <h4>Autorizadores de acceso</h4>
                <small>
                    Estas personas recibiran el codigo OTP cuando alguien intente acceder desde un dispositivo nuevo.
                    Si no hay autorizadores, el codigo llegara al owner.
                </small>
                <div className="saas-admin-empty-inline">
                    {count} de {LIMIT} autorizadores configurados
                </div>

                {loading ? (
                    <div className="saas-admin-empty-inline">Cargando autorizadores...</div>
                ) : count ? (
                    <div className="saas-device-list">
                        {items.map((item) => (
                            <AuthorizerRow key={item.id || item.email} item={item} busy={busy} onDelete={deleteAuthorizer} />
                        ))}
                    </div>
                ) : (
                    <div className="saas-admin-empty-inline">No hay autorizadores. Se usara el owner como fallback.</div>
                )}
            </div>

            <div className="saas-admin-related-block">
                <h4>Agregar autorizador</h4>
                <div className="saas-admin-form-row">
                    <label>
                        Nombre
                        <input
                            value={form.name}
                            onChange={(event) => updateField('name', event.target.value)}
                            placeholder="Ej: Administracion"
                            disabled={loading || busy || count >= LIMIT}
                        />
                    </label>
                    <label>
                        Email
                        <input
                            type="email"
                            value={form.email}
                            onChange={(event) => updateField('email', event.target.value)}
                            placeholder="admin@empresa.com"
                            disabled={loading || busy || count >= LIMIT}
                        />
                    </label>
                </div>
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button
                        type="button"
                        disabled={loading || busy || count >= LIMIT || !emailValid(form.email)}
                        onClick={addAuthorizer}
                    >
                        + Agregar autorizador
                    </button>
                </div>
            </div>
        </>
    );
}
