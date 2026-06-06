import React from 'react';

function text(value = '') {
    return String(value || '').trim();
}

function normalizePhone(value = '') {
    const digits = text(value).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
}

function displayContact(item = {}) {
    const label = text(item.label || item.displayName || item.name);
    const phone = text(item.phoneE164 || item.phone_e164 || item.phone);
    return { label: label || phone || 'Contacto', phone };
}

export default function TestContactsSettingsDetailPane({
    settingsTenantId,
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson,
    canEditTenantSettings = false
}) {
    const [items, setItems] = React.useState([]);
    const [query, setQuery] = React.useState('');
    const [candidates, setCandidates] = React.useState([]);
    const [selectedCandidate, setSelectedCandidate] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');
    const isVisible = Boolean(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'test_contacts');

    const loadContacts = React.useCallback(async (search = '') => {
        if (!isVisible || typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        try {
            const suffix = text(search) ? `?q=${encodeURIComponent(search)}` : '';
            const payload = await requestJson(`/api/tenant/test-contacts${suffix}`, {
                method: 'GET',
                tenantIdOverride: settingsTenantId
            });
            setItems(Array.isArray(payload?.items) ? payload.items : []);
            setCandidates(Array.isArray(payload?.candidates) ? payload.candidates : []);
        } catch (err) {
            setError(String(err?.message || err || 'No se pudieron cargar los numeros de prueba.'));
        } finally {
            setLoading(false);
        }
    }, [isVisible, requestJson, settingsTenantId]);

    React.useEffect(() => {
        void loadContacts('');
    }, [loadContacts]);

    React.useEffect(() => {
        if (!isVisible) return undefined;
        const search = text(query);
        if (search.length < 2) {
            setCandidates([]);
            return undefined;
        }
        const timer = window.setTimeout(() => {
            void loadContacts(search);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [isVisible, loadContacts, query]);

    const addContact = React.useCallback(async (candidate = null) => {
        if (!canEditTenantSettings || typeof requestJson !== 'function') return;
        const source = candidate || selectedCandidate || {};
        const phone = normalizePhone(source.phoneE164 || source.phone || query);
        const label = text(source.label || query);
        if (!phone) {
            setError('Selecciona un cliente o escribe un telefono valido.');
            return;
        }
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson('/api/tenant/test-contacts', {
                method: 'POST',
                tenantIdOverride: settingsTenantId,
                body: { phone, label }
            });
            setItems(Array.isArray(payload?.items) ? payload.items : []);
            setQuery('');
            setCandidates([]);
            setSelectedCandidate(null);
            setMessage('Numero de prueba agregado.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo agregar el numero de prueba.'));
        } finally {
            setBusy(false);
        }
    }, [canEditTenantSettings, query, requestJson, selectedCandidate, settingsTenantId]);

    const removeContact = React.useCallback(async (phone = '') => {
        if (!canEditTenantSettings || typeof requestJson !== 'function') return;
        const cleanPhone = normalizePhone(phone);
        if (!cleanPhone) return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson(`/api/tenant/test-contacts/${encodeURIComponent(cleanPhone)}`, {
                method: 'DELETE',
                tenantIdOverride: settingsTenantId
            });
            setItems(Array.isArray(payload?.items) ? payload.items : []);
            setMessage('Numero de prueba quitado.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo quitar el numero de prueba.'));
        } finally {
            setBusy(false);
        }
    }, [canEditTenantSettings, requestJson, settingsTenantId]);

    if (!isVisible) return null;

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Numeros de prueba</h3>
                    <small>Estos contactos se excluyen de los reportes operativos y del analisis IA.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading || busy} onClick={() => loadContacts('')}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}
            {message ? <div className="saas-admin-success-inline">{message}</div> : null}

            <div className="saas-admin-related-block">
                <h4>Contactos excluidos</h4>
                <small>Usalo para celulares internos, pruebas de campanas o chats que no deben afectar KPIs.</small>

                <div className="saas-test-contacts-add-row">
                    <label className="saas-test-contacts-search">
                        Buscar cliente o telefono
                        <input
                            className="saas-input"
                            value={query}
                            onChange={(event) => {
                                setSelectedCandidate(null);
                                setQuery(event.target.value);
                            }}
                            placeholder="Buscar cliente..."
                            disabled={loading || busy || !canEditTenantSettings}
                        />
                    </label>
                    <button
                        type="button"
                        className="saas-btn saas-test-contacts-add-btn"
                        disabled={loading || busy || !canEditTenantSettings || !text(query)}
                        onClick={() => addContact()}
                    >
                        + Agregar
                    </button>
                </div>

                {candidates.length > 0 ? (
                    <div className="saas-admin-related-list">
                        {candidates.map((candidate) => {
                            const item = displayContact(candidate);
                            return (
                                <button
                                    key={`test_candidate_${item.phone}`}
                                    type="button"
                                    className="saas-admin-related-row saas-admin-related-row--button"
                                    disabled={busy || !canEditTenantSettings}
                                    onClick={() => {
                                        setSelectedCandidate(candidate);
                                        setQuery(`${item.label} ${item.phone}`);
                                    }}
                                    onDoubleClick={() => addContact(candidate)}
                                >
                                    <span>{item.label}</span>
                                    <small>{item.phone}</small>
                                </button>
                            );
                        })}
                    </div>
                ) : null}

                <div className="saas-admin-related-list">
                    {loading ? <div className="saas-admin-empty-inline">Cargando numeros de prueba...</div> : null}
                    {!loading && items.length === 0 ? (
                        <div className="saas-admin-empty-inline">Aun no hay numeros de prueba configurados.</div>
                    ) : null}
                    {items.map((entry) => {
                        const item = displayContact(entry);
                        return (
                            <div key={`test_contact_${item.phone}`} className="saas-admin-related-row">
                                <span>{item.label}</span>
                                <small>{item.phone}</small>
                                {canEditTenantSettings ? (
                                    <button type="button" disabled={busy} onClick={() => removeContact(item.phone)}>
                                        x
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
