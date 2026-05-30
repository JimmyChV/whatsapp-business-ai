import React from 'react';

const EMPTY_FORM = {
    host: '',
    port: '587',
    user: '',
    pass: '',
    from: '',
    security: 'tls',
    tlsRejectUnauthorized: false,
    hasPass: false,
    passMasked: ''
};

function text(value = '') {
    return String(value || '').trim();
}

function mapSmtpToForm(smtp = {}) {
    return {
        ...EMPTY_FORM,
        host: text(smtp.host),
        port: text(smtp.port || 587),
        user: text(smtp.user),
        pass: '',
        from: text(smtp.from),
        security: text(smtp.security || 'tls').toLowerCase() || 'tls',
        tlsRejectUnauthorized: smtp.tlsRejectUnauthorized === true,
        hasPass: smtp.hasPass === true,
        passMasked: text(smtp.passMasked)
    };
}

export default function SmtpSettingsDetailPane({
    settingsTenantId,
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson
}) {
    const [form, setForm] = React.useState(EMPTY_FORM);
    const [loading, setLoading] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');

    const isVisible = Boolean(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'smtp_email');

    const loadSmtp = React.useCallback(async () => {
        if (!isVisible || typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson('/api/tenant/smtp', {
                method: 'GET',
                tenantIdOverride: settingsTenantId
            });
            setForm(mapSmtpToForm(payload?.smtp || {}));
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo cargar la configuracion SMTP.'));
        } finally {
            setLoading(false);
        }
    }, [isVisible, requestJson, settingsTenantId]);

    React.useEffect(() => {
        void loadSmtp();
    }, [loadSmtp]);

    const updateField = React.useCallback((key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    }, []);

    const buildPayload = React.useCallback(() => {
        const smtp = {
            host: form.host,
            port: form.port,
            user: form.user,
            from: form.from,
            security: form.security,
            tlsRejectUnauthorized: form.tlsRejectUnauthorized
        };
        if (text(form.pass)) smtp.pass = form.pass;
        return { smtp };
    }, [form]);

    const save = React.useCallback(async () => {
        if (typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson('/api/tenant/smtp', {
                method: 'PUT',
                tenantIdOverride: settingsTenantId,
                body: buildPayload()
            });
            setForm(mapSmtpToForm(payload?.smtp || {}));
            setMessage('Configuracion de correo guardada.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo guardar la configuracion SMTP.'));
        } finally {
            setBusy(false);
        }
    }, [buildPayload, requestJson, settingsTenantId]);

    const sendTest = React.useCallback(async () => {
        if (typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson('/api/tenant/smtp/test', {
                method: 'POST',
                tenantIdOverride: settingsTenantId
            });
            setMessage(payload?.message || 'Correo enviado correctamente.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo enviar el correo de prueba.'));
        } finally {
            setBusy(false);
        }
    }, [requestJson, settingsTenantId]);

    if (!isVisible) return null;

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Correo</h3>
                    <small>Configura el SMTP corporativo para OTP, recuperacion y notificaciones.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading || busy} onClick={loadSmtp}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}
            {message ? <div className="saas-admin-success-inline">{message}</div> : null}

            <div className="saas-admin-related-block">
                <h4>SMTP del tenant</h4>
                <small>Si queda incompleto, el sistema usara el SMTP global del servidor como respaldo.</small>

                <div className="saas-admin-form-row">
                    <label>
                        Servidor SMTP
                        <input
                            value={form.host}
                            onChange={(event) => updateField('host', event.target.value)}
                            placeholder="smtp.gmail.com"
                            disabled={loading || busy}
                        />
                    </label>
                    <label>
                        Puerto
                        <input
                            type="number"
                            min="1"
                            max="65535"
                            value={form.port}
                            onChange={(event) => updateField('port', event.target.value)}
                            placeholder="587"
                            disabled={loading || busy}
                        />
                    </label>
                </div>

                <div className="saas-admin-form-row">
                    <label>
                        Usuario
                        <input
                            value={form.user}
                            onChange={(event) => updateField('user', event.target.value)}
                            placeholder="empresa@gmail.com"
                            disabled={loading || busy}
                        />
                    </label>
                    <label>
                        Seguridad
                        <select
                            value={form.security}
                            onChange={(event) => updateField('security', event.target.value)}
                            disabled={loading || busy}
                        >
                            <option value="tls">TLS</option>
                            <option value="ssl">SSL</option>
                            <option value="none">Ninguna</option>
                        </select>
                    </label>
                </div>

                <div className="saas-admin-form-row">
                    <label>
                        Contrasena
                        <input
                            type="password"
                            value={form.pass}
                            onChange={(event) => updateField('pass', event.target.value)}
                            placeholder={form.hasPass ? `Guardada (${form.passMasked || 'oculta'}). Dejar vacio para conservar.` : 'Contrasena SMTP'}
                            disabled={loading || busy}
                        />
                    </label>
                    <label>
                        Remitente
                        <input
                            value={form.from}
                            onChange={(event) => updateField('from', event.target.value)}
                            placeholder="Lavitat <no-reply@lavitat.pe>"
                            disabled={loading || busy}
                        />
                    </label>
                </div>

                <label className="saas-admin-module-toggle">
                    <input
                        type="checkbox"
                        checked={form.tlsRejectUnauthorized}
                        onChange={(event) => updateField('tlsRejectUnauthorized', event.target.checked)}
                        disabled={loading || busy}
                    />
                    <span>Validar certificado TLS del servidor</span>
                </label>

                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button type="button" disabled={loading || busy} onClick={save}>
                        Guardar configuracion
                    </button>
                    <button type="button" className="saas-btn-cancel" disabled={loading || busy} onClick={sendTest}>
                        Enviar correo de prueba
                    </button>
                </div>
            </div>
        </>
    );
}
