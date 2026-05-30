import React from 'react';

const DEVICE_TYPE_LABELS = {
    mobile: 'Movil',
    tablet: 'Tablet',
    desktop: 'Desktop'
};

function toText(value = '') {
    return String(value || '').trim();
}

function formatDeviceType(value = '') {
    const key = toText(value).toLowerCase();
    return DEVICE_TYPE_LABELS[key] || 'Dispositivo';
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

function DeviceStatusBadge({ device }) {
    if (device?.revokedAt) {
        return <span className="saas-device-badge saas-device-badge--danger">Revocado</span>;
    }
    if (device?.current) {
        return <span className="saas-device-badge saas-device-badge--current">Este dispositivo</span>;
    }
    if (device?.isApproved) {
        return <span className="saas-device-badge saas-device-badge--active">Activo</span>;
    }
    return <span className="saas-device-badge">Pendiente</span>;
}

function DeviceRow({
    device,
    busy,
    editingId,
    draftName,
    setEditingId,
    setDraftName,
    onSaveName,
    onRevoke,
    formatDateTimeLabel,
    allowRename = true,
    allowRevoke = true
}) {
    const isEditing = editingId === device.deviceId;
    const displayName = toText(device.deviceName) || formatDeviceType(device.deviceType);
    const canRevoke = allowRevoke && !busy && !device.current && !device.revokedAt;
    return (
        <article className={`saas-device-row ${device.current ? 'is-current' : ''}`.trim()}>
            <div className="saas-device-row__main">
                <div className="saas-device-row__icon" aria-hidden="true">
                    {formatDeviceType(device.deviceType).slice(0, 1)}
                </div>
                <div className="saas-device-row__content">
                    {isEditing ? (
                        <div className="saas-device-inline-edit">
                            <input
                                value={draftName}
                                onChange={(event) => setDraftName(event.target.value)}
                                placeholder="Nombre del dispositivo"
                                disabled={busy}
                            />
                            <button type="button" disabled={busy || !toText(draftName)} onClick={() => onSaveName(device.deviceId)}>
                                Guardar
                            </button>
                            <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => setEditingId('')}>
                                Cancelar
                            </button>
                        </div>
                    ) : (
                        <div className="saas-device-row__title">
                            <strong>{displayName}</strong>
                            <DeviceStatusBadge device={device} />
                        </div>
                    )}
                    <div className="saas-device-row__meta">
                        <span>{formatDeviceType(device.deviceType)}</span>
                        <span>{device.ipAddress || 'IP no disponible'}</span>
                        <span>Ultima vez: {formatDate(device.lastSeenAt || device.createdAt, formatDateTimeLabel)}</span>
                    </div>
                    {device.userEmail ? (
                        <small className="saas-device-row__owner">
                            {device.userName ? `${device.userName} - ` : ''}{device.userEmail}
                        </small>
                    ) : null}
                </div>
            </div>
            <div className="saas-device-row__actions">
                {!isEditing && allowRename ? (
                    <button
                        type="button"
                        className="saas-btn-cancel"
                        disabled={busy || Boolean(device.revokedAt)}
                        onClick={() => {
                            setDraftName(displayName);
                            setEditingId(device.deviceId);
                        }}
                    >
                        Renombrar
                    </button>
                ) : null}
                <button
                    type="button"
                    className="danger"
                    disabled={!canRevoke}
                    onClick={() => onRevoke(device.deviceId)}
                    title={device.current ? 'No puedes revocar este dispositivo desde si mismo.' : ''}
                >
                    Revocar
                </button>
            </div>
        </article>
    );
}

function DevicesList(props) {
    const { devices = [], emptyText = 'No hay dispositivos para mostrar.' } = props;
    if (!devices.length) {
        return <div className="saas-admin-empty-inline">{emptyText}</div>;
    }
    return (
        <div className="saas-device-list">
            {devices.map((device) => (
                <DeviceRow key={device.deviceId} device={device} {...props} />
            ))}
        </div>
    );
}

export default function DevicesSettingsDetailPane({
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson,
    formatDateTimeLabel,
    currentUser,
    isSuperAdmin,
    userRole,
    canViewAllDevices = false,
    canRevokeOwnDevices = true,
    canRevokeAllDevices = false
}) {
    const [devices, setDevices] = React.useState([]);
    const [adminUserId, setAdminUserId] = React.useState('');
    const [adminDevices, setAdminDevices] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [adminLoading, setAdminLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [editingId, setEditingId] = React.useState('');
    const [draftName, setDraftName] = React.useState('');
    const [busy, setBusy] = React.useState(false);

    const canAdminDevices = Boolean(canViewAllDevices || isSuperAdmin || currentUser?.isSuperAdmin === true || toText(userRole).toLowerCase() === 'owner');

    const loadDevices = React.useCallback(async () => {
        if (typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        try {
            const payload = await requestJson('/api/auth/devices', { method: 'GET' });
            setDevices(Array.isArray(payload?.devices) ? payload.devices : []);
        } catch (err) {
            setError(String(err?.message || err || 'No se pudieron cargar los dispositivos.'));
        } finally {
            setLoading(false);
        }
    }, [requestJson]);

    React.useEffect(() => {
        if (!(isGeneralConfigSection && selectedConfigKey === 'auth_devices')) return;
        void loadDevices();
    }, [isGeneralConfigSection, loadDevices, selectedConfigKey]);

    const saveName = React.useCallback(async (deviceId) => {
        if (typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        try {
            await requestJson(`/api/auth/devices/${encodeURIComponent(deviceId)}`, {
                method: 'PATCH',
                body: { deviceName: draftName }
            });
            setEditingId('');
            setDraftName('');
            await loadDevices();
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo renombrar el dispositivo.'));
        } finally {
            setBusy(false);
        }
    }, [draftName, loadDevices, requestJson]);

    const revoke = React.useCallback(async (deviceId) => {
        if (typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        try {
            await requestJson(`/api/auth/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
            await loadDevices();
            if (adminUserId && adminDevices.length) {
                const payload = await requestJson(`/api/admin/users/${encodeURIComponent(adminUserId)}/devices`, { method: 'GET' });
                setAdminDevices(Array.isArray(payload?.devices) ? payload.devices : []);
            }
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo revocar el dispositivo.'));
        } finally {
            setBusy(false);
        }
    }, [adminDevices.length, adminUserId, loadDevices, requestJson]);

    const loadAdminDevices = React.useCallback(async () => {
        if (typeof requestJson !== 'function' || !toText(adminUserId)) return;
        setAdminLoading(true);
        setError('');
        try {
            const payload = await requestJson(`/api/admin/users/${encodeURIComponent(adminUserId)}/devices`, { method: 'GET' });
            setAdminDevices(Array.isArray(payload?.devices) ? payload.devices : []);
        } catch (err) {
            setError(String(err?.message || err || 'No se pudieron cargar los dispositivos del usuario.'));
        } finally {
            setAdminLoading(false);
        }
    }, [adminUserId, requestJson]);

    if (!(isGeneralConfigSection && selectedConfigKey === 'auth_devices')) {
        return null;
    }

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Mis dispositivos</h3>
                    <small>Administra los equipos que pueden mantener sesion en el panel.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading || busy} onClick={loadDevices}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}

            <div className="saas-admin-related-block saas-device-panel">
                <h4>Dispositivos de mi cuenta</h4>
                {loading ? (
                    <div className="saas-admin-empty-inline">Cargando dispositivos...</div>
                ) : (
                    <DevicesList
                        devices={devices}
                        busy={busy}
                        editingId={editingId}
                        draftName={draftName}
                        setEditingId={setEditingId}
                        setDraftName={setDraftName}
                        onSaveName={saveName}
                        onRevoke={revoke}
                        formatDateTimeLabel={formatDateTimeLabel}
                        allowRename={true}
                        allowRevoke={canRevokeOwnDevices}
                    />
                )}
            </div>

            {canAdminDevices ? (
                <div className="saas-admin-related-block saas-device-panel">
                    <h4>Revision administrativa</h4>
                    <small>Usuarios autorizados pueden consultar dispositivos de otros usuarios.</small>
                    <div className="saas-admin-form-row saas-device-admin-search">
                        <input
                            value={adminUserId}
                            onChange={(event) => setAdminUserId(event.target.value)}
                            placeholder="user_id del usuario"
                            disabled={adminLoading || busy}
                        />
                        <button type="button" disabled={adminLoading || busy || !toText(adminUserId)} onClick={loadAdminDevices}>
                            Buscar
                        </button>
                    </div>
                    {adminLoading ? (
                        <div className="saas-admin-empty-inline">Cargando dispositivos...</div>
                    ) : (
                        <DevicesList
                            devices={adminDevices}
                            emptyText="Busca un usuario para revisar sus dispositivos."
                            busy={busy}
                            editingId={editingId}
                            draftName={draftName}
                            setEditingId={setEditingId}
                            setDraftName={setDraftName}
                            onSaveName={saveName}
                            onRevoke={revoke}
                            formatDateTimeLabel={formatDateTimeLabel}
                            allowRename={false}
                            allowRevoke={canRevokeAllDevices || isSuperAdmin || currentUser?.isSuperAdmin === true}
                        />
                    )}
                </div>
            ) : null}
        </>
    );
}
