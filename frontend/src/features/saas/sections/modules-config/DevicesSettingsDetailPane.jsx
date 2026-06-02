import React from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

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

function getInitials(name = '', email = '') {
    const source = toText(name) || toText(email) || 'U';
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
}

function avatarColor(name = '', email = '') {
    const palette = ['#1D9E75', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be123c'];
    const source = toText(name) || toText(email) || 'Usuario';
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
}

function roleLabel(role = '') {
    const clean = toText(role).toLowerCase();
    if (clean === 'owner') return 'Owner';
    if (clean === 'admin') return 'Admin';
    return 'Seller';
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
    onReauthorize,
    formatDateTimeLabel,
    allowRename = true,
    allowRevoke = true,
    allowReauthorize = false,
    mode = 'own'
}) {
    const isEditing = editingId === device.deviceId;
    const displayName = toText(device.deviceName) || formatDeviceType(device.deviceType);
    const canRevoke = allowRevoke && !busy && !device.current && !device.revokedAt;
    const canReauthorize = allowReauthorize && !busy && Boolean(device.revokedAt);
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
                    {device.revokedAt ? (
                        <small className="saas-device-row__owner">
                            Revocado: {formatDate(device.revokedAt, formatDateTimeLabel)}
                        </small>
                    ) : null}
                </div>
            </div>
            <div className="saas-device-row__actions">
                {!isEditing && allowRename ? (
                    <button
                        type="button"
                        className="saas-btn-cancel"
                        disabled={busy}
                        onClick={() => {
                            setDraftName(displayName);
                            setEditingId(device.deviceId);
                        }}
                    >
                        Renombrar
                    </button>
                ) : null}
                {!device.revokedAt ? (
                    <button
                        type="button"
                        className="danger"
                        disabled={!canRevoke}
                        onClick={() => onRevoke(device, mode)}
                        title={device.current ? 'No puedes revocar este dispositivo desde si mismo.' : ''}
                    >
                        Revocar
                    </button>
                ) : null}
                {device.revokedAt ? (
                    <button
                        type="button"
                        className="saas-btn-cancel"
                        disabled={!canReauthorize}
                        onClick={() => onReauthorize?.(device.deviceId, mode)}
                        title="Envia un OTP a los autorizadores para aprobar nuevamente este dispositivo."
                    >
                        Reautorizar con OTP
                    </button>
                ) : null}
            </div>
        </article>
    );
}

function UserDeviceGroup({
    user,
    busy,
    editingId,
    draftName,
    setEditingId,
    setDraftName,
    onSaveName,
    onRevoke,
    onReauthorize,
    formatDateTimeLabel,
    allowRename,
    allowRevoke,
    allowReauthorize
}) {
    const devices = Array.isArray(user?.devices) ? user.devices : [];
    const activeCount = devices.filter((device) => !device.revokedAt).length;
    const revokedCount = devices.filter((device) => device.revokedAt).length;
    return (
        <section className="saas-device-user-group">
            <header className="saas-device-user-group__header">
                <div
                    className="saas-device-user-avatar"
                    style={user?.avatarUrl ? undefined : { background: avatarColor(user?.displayName, user?.email), color: '#fff' }}
                >
                    {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{getInitials(user?.displayName, user?.email)}</span>}
                </div>
                <div>
                    <h4>{user?.displayName || user?.email || 'Usuario'}</h4>
                    <small>{roleLabel(user?.role)} · {user?.email || 'Sin email'}</small>
                </div>
                <div className="saas-device-user-group__summary">
                    {activeCount} activos
                    {revokedCount ? ` · ${revokedCount} revocados` : ''}
                </div>
            </header>
            {devices.length ? (
                <div className="saas-device-list">
                    {devices.map((device) => (
                        <DeviceRow
                            key={device.deviceId}
                            device={device}
                            busy={busy}
                            editingId={editingId}
                            draftName={draftName}
                            setEditingId={setEditingId}
                            setDraftName={setDraftName}
                            onSaveName={onSaveName}
                            onRevoke={onRevoke}
                            onReauthorize={onReauthorize}
                            formatDateTimeLabel={formatDateTimeLabel}
                            allowRename={allowRename}
                            allowRevoke={allowRevoke}
                            allowReauthorize={allowReauthorize}
                            mode="admin"
                        />
                    ))}
                </div>
            ) : (
                <div className="saas-admin-empty-inline">Este usuario aun no tiene dispositivos registrados.</div>
            )}
        </section>
    );
}

export default function DevicesSettingsDetailPane({
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson,
    formatDateTimeLabel,
    canViewAllDevices = false,
    canRevokeAllDevices = false
}) {
    const { confirm } = useUiFeedback();
    const [teamUsers, setTeamUsers] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [editingId, setEditingId] = React.useState('');
    const [draftName, setDraftName] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [notice, setNotice] = React.useState('');
    const [search, setSearch] = React.useState('');

    const canAdminDevices = Boolean(canViewAllDevices);
    const canRevokeTeamDevices = Boolean(canRevokeAllDevices);

    const loadTeamDevices = React.useCallback(async () => {
        if (typeof requestJson !== 'function' || !canAdminDevices) return;
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const payload = await requestJson('/api/admin/devices/all', { method: 'GET' });
            setTeamUsers(Array.isArray(payload?.users) ? payload.users : []);
        } catch (err) {
            setError(String(err?.message || err || 'No se pudieron cargar los dispositivos del equipo.'));
        } finally {
            setLoading(false);
        }
    }, [canAdminDevices, requestJson]);

    React.useEffect(() => {
        if (!(isGeneralConfigSection && selectedConfigKey === 'auth_devices')) return;
        void loadTeamDevices();
    }, [isGeneralConfigSection, loadTeamDevices, selectedConfigKey]);

    const filteredUsers = React.useMemo(() => {
        const term = toText(search).toLowerCase();
        if (!term) return teamUsers;
        return teamUsers
            .map((user) => {
                const haystack = [
                    user?.displayName,
                    user?.email,
                    user?.role,
                    ...(Array.isArray(user?.devices) ? user.devices.flatMap((device) => [
                        device?.deviceName,
                        device?.deviceType,
                        device?.ipAddress
                    ]) : [])
                ].map((value) => toText(value).toLowerCase()).join(' ');
                return haystack.includes(term) ? user : null;
            })
            .filter(Boolean);
    }, [search, teamUsers]);

    const saveName = React.useCallback(async (deviceId) => {
        if (typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await requestJson(`/api/auth/devices/${encodeURIComponent(deviceId)}`, {
                method: 'PATCH',
                body: { deviceName: draftName }
            });
            setEditingId('');
            setDraftName('');
            await loadTeamDevices();
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo renombrar el dispositivo.'));
        } finally {
            setBusy(false);
        }
    }, [draftName, loadTeamDevices, requestJson]);

    const revoke = React.useCallback(async (device, mode = 'admin') => {
        if (typeof requestJson !== 'function') return;
        const deviceId = toText(device?.deviceId || device);
        if (!deviceId) return;
        const owner = teamUsers.find((user) => Array.isArray(user?.devices)
            && user.devices.some((item) => toText(item?.deviceId) === deviceId));
        const deviceName = toText(device?.deviceName) || formatDeviceType(device?.deviceType);
        const ownerName = toText(owner?.displayName || owner?.email) || 'este usuario';
        const confirmed = await confirm({
            title: mode === 'admin' ? 'Revocar dispositivo de usuario' : 'Revocar dispositivo',
            message: mode === 'admin'
                ? `¿Revocar "${deviceName}" de ${ownerName}? Ese usuario perderá acceso y recibirá un email de notificación.`
                : `¿Revocar "${deviceName}"? Perderás acceso desde ese dispositivo. Necesitarás un nuevo código OTP para volver a usarlo.`,
            confirmText: 'Revocar',
            cancelText: 'Cancelar',
            tone: 'danger'
        });
        if (!confirmed) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const endpoint = mode === 'admin'
                ? `/api/admin/devices/${encodeURIComponent(deviceId)}`
                : `/api/auth/devices/${encodeURIComponent(deviceId)}`;
            await requestJson(endpoint, { method: 'DELETE' });
            await loadTeamDevices();
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo revocar el dispositivo.'));
        } finally {
            setBusy(false);
        }
    }, [confirm, loadTeamDevices, requestJson, teamUsers]);

    const reauthorize = React.useCallback(async (deviceId, mode = 'admin') => {
        if (typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const endpoint = mode === 'admin'
                ? `/api/admin/devices/${encodeURIComponent(deviceId)}/request-reauthorization`
                : `/api/auth/devices/${encodeURIComponent(deviceId)}/request-reauthorization`;
            const payload = await requestJson(endpoint, { method: 'POST' });
            setNotice(String(payload?.message || 'OTP enviado a los autorizadores de acceso.'));
            await loadTeamDevices();
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo solicitar reautorizacion.'));
        } finally {
            setBusy(false);
        }
    }, [loadTeamDevices, requestJson]);

    if (!(isGeneralConfigSection && selectedConfigKey === 'auth_devices')) {
        return null;
    }

    if (!canAdminDevices) {
        return (
            <>
                <div className="saas-admin-pane-header">
                    <div>
                        <h3>Mis dispositivos</h3>
                        <small>Gestiona tus dispositivos desde el perfil personal.</small>
                    </div>
                </div>
                <div className="saas-admin-related-block saas-device-panel">
                    <h4>Dispositivos personales</h4>
                    <p className="saas-muted-copy">
                        Para gestionar tus dispositivos, ve a Mi perfil {'->'} Mis dispositivos.
                    </p>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Dispositivos del equipo</h3>
                    <small>Gestiona los dispositivos autorizados de todos los usuarios de tu empresa.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading || busy} onClick={loadTeamDevices}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}
            {notice ? <div className="saas-admin-success-inline">{notice}</div> : null}

            <div className="saas-admin-related-block saas-device-panel">
                <div className="saas-device-team-toolbar">
                    <div>
                        <h4>Dispositivos del equipo</h4>
                        <small>{teamUsers.length} usuarios encontrados</small>
                    </div>
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar usuario, email, dispositivo o IP..."
                        disabled={loading || busy}
                    />
                </div>

                {loading ? (
                    <div className="saas-admin-empty-inline">Cargando dispositivos...</div>
                ) : filteredUsers.length ? (
                    <div className="saas-device-team-list">
                        {filteredUsers.map((user) => (
                            <UserDeviceGroup
                                key={user.userId}
                                user={user}
                                busy={busy}
                                editingId={editingId}
                                draftName={draftName}
                                setEditingId={setEditingId}
                                setDraftName={setDraftName}
                                onSaveName={saveName}
                                onRevoke={revoke}
                                onReauthorize={reauthorize}
                                formatDateTimeLabel={formatDateTimeLabel}
                                allowRename={true}
                                allowRevoke={canRevokeTeamDevices}
                                allowReauthorize={canRevokeTeamDevices}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="saas-admin-empty-inline">No hay dispositivos que coincidan con la busqueda.</div>
                )}
            </div>
        </>
    );
}
