import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Eye, EyeOff, Laptop, LogOut, MonitorSmartphone, Phone, Save, Shield, Smartphone, X } from 'lucide-react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

const PASSWORD_RULES = [
    { key: 'length', label: 'Mínimo 8 caracteres' },
    { key: 'number', label: 'Al menos 1 número' },
    { key: 'uppercase', label: 'Al menos 1 letra mayúscula' },
    { key: 'match', label: 'Las contraseñas coinciden' }
];

function buildInitials(name = '') {
    const parts = String(name || 'Usuario')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    return (parts[0]?.[0] || 'U').concat(parts[1]?.[0] || '').toUpperCase();
}

function avatarColor(name = '') {
    const palette = ['#1D9E75', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be123c'];
    const text = String(name || 'Usuario');
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(index);
        hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
}

function formatDate(value = '') {
    if (!value) return 'Sin registro';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin registro';
    return date.toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function deviceIcon(type = '') {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'mobile') return <Smartphone size={18} strokeWidth={2} />;
    if (normalized === 'tablet') return <MonitorSmartphone size={18} strokeWidth={2} />;
    return <Laptop size={18} strokeWidth={2} />;
}

function normalizeDeviceType(type = '') {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'mobile') return 'Móvil';
    if (normalized === 'tablet') return 'Tablet';
    return 'Desktop';
}

function PasswordField({ label, value, onChange, visible, onToggle, autoComplete }) {
    return (
        <label className="saas-profile-field">
            <span>{label}</span>
            <div className="saas-profile-password-control">
                <input
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={(event) => onChange?.(event.target.value)}
                    autoComplete={autoComplete}
                />
                <button type="button" onClick={onToggle} aria-label={visible ? 'Ocultar contraseña' : 'Ver contraseña'}>
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
        </label>
    );
}

export default function SaasProfileModal({
    initialSection = 'profile',
    requestJson,
    onClose,
    onLogoutAllDone
}) {
    const { confirm } = useUiFeedback();
    const [profile, setProfile] = useState(null);
    const [devices, setDevices] = useState([]);
    const [activeSection, setActiveSection] = useState(initialSection === 'devices' ? 'devices' : 'profile');
    const [profileDraft, setProfileDraft] = useState({ displayName: '', phone: '' });
    const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [visiblePasswords, setVisiblePasswords] = useState({});
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        setActiveSection(initialSection === 'devices' ? 'devices' : 'profile');
    }, [initialSection]);

    const loadProfileData = async () => {
        if (typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        try {
            const [profileResult, devicesResult] = await Promise.all([
                requestJson('/api/auth/profile'),
                requestJson('/api/auth/devices').catch(() => ({ devices: [] }))
            ]);
            const nextProfile = profileResult?.profile || null;
            setProfile(nextProfile);
            setProfileDraft({
                displayName: nextProfile?.displayName || '',
                phone: nextProfile?.phone || ''
            });
            setDevices(Array.isArray(devicesResult?.devices) ? devicesResult.devices : []);
        } catch (err) {
            setError(String(err?.message || 'No se pudo cargar tu perfil.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfileData();
    }, []);

    const passwordChecks = useMemo(() => {
        const next = String(passwordDraft.newPassword || '');
        return {
            length: next.length >= 8,
            number: /\d/.test(next),
            uppercase: /[A-Z]/.test(next),
            match: Boolean(next) && next === String(passwordDraft.confirmPassword || '')
        };
    }, [passwordDraft.newPassword, passwordDraft.confirmPassword]);

    const canChangePassword = Boolean(passwordDraft.currentPassword)
        && Object.values(passwordChecks).every(Boolean)
        && passwordDraft.currentPassword !== passwordDraft.newPassword;

    const handleAvatarChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setError('La foto debe ser JPG, PNG o WEBP.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setError('La foto no puede superar 2 MB.');
            return;
        }
        const form = new FormData();
        form.append('avatar', file);
        setSaving(true);
        setError('');
        setStatus('');
        try {
            const result = await requestJson('/api/auth/profile/avatar', { method: 'POST', body: form });
            setProfile(result?.profile || { ...profile, avatarUrl: result?.avatarUrl || profile?.avatarUrl });
            setStatus('Foto actualizada correctamente.');
        } catch (err) {
            setError(String(err?.message || 'No se pudo actualizar la foto.'));
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        setError('');
        setStatus('');
        try {
            const result = await requestJson('/api/auth/profile', {
                method: 'PATCH',
                body: profileDraft
            });
            setProfile(result?.profile || profile);
            setStatus('Perfil actualizado correctamente.');
        } catch (err) {
            setError(String(err?.message || 'No se pudo guardar el perfil.'));
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async () => {
        setSaving(true);
        setError('');
        setStatus('');
        try {
            await requestJson('/api/auth/change-password', {
                method: 'POST',
                body: passwordDraft
            });
            setPasswordDraft({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setStatus('Contraseña cambiada correctamente. Se cerraron todas las sesiones en otros dispositivos por seguridad.');
        } catch (err) {
            const message = String(err?.message || '');
            setError(message === 'invalid_current_password'
                ? 'La contraseña actual no es correcta.'
                : 'No se pudo cambiar la contraseña.');
        } finally {
            setSaving(false);
        }
    };

    const handleRevokeDevice = async (deviceId) => {
        const device = devices.find((item) => String(item.deviceId || '') === String(deviceId || ''));
        if (!device || device.isCurrent) return;
        const confirmed = await confirm({
            title: 'Revocar dispositivo',
            message: `¿Revocar "${device.deviceName || 'este dispositivo'}"? Perderás acceso desde ese dispositivo. Necesitarás un nuevo código OTP para volver a usarlo.`,
            confirmText: 'Revocar',
            cancelText: 'Cancelar',
            tone: 'danger'
        });
        if (!confirmed) return;
        setSaving(true);
        setError('');
        setStatus('');
        try {
            await requestJson(`/api/auth/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
            await loadProfileData();
            setStatus('Dispositivo revocado correctamente.');
        } catch (err) {
            setError(String(err?.message || 'No se pudo revocar el dispositivo.'));
        } finally {
            setSaving(false);
        }
    };

    const handleLogoutAllDevices = async () => {
        const confirmed = await confirm({
            title: 'Cerrar sesión en todos',
            message: 'Se cerrará el acceso en todos tus dispositivos. Tendrás que iniciar sesión nuevamente por seguridad.',
            confirmText: 'Cerrar sesiones',
            cancelText: 'Cancelar',
            tone: 'danger'
        });
        if (!confirmed) return;
        setSaving(true);
        setError('');
        setStatus('');
        try {
            await requestJson('/api/auth/logout-all-devices', { method: 'POST', body: {} });
            setStatus('Sesiones cerradas correctamente.');
            onLogoutAllDone?.();
        } catch (err) {
            setError(String(err?.message || 'No se pudieron cerrar las sesiones.'));
        } finally {
            setSaving(false);
        }
    };

    const avatarStyle = { background: avatarColor(profile?.displayName || profile?.email) };
    const devicesActive = devices.filter((device) => !device.revokedAt);

    return (
        <div className="saas-profile-overlay" role="dialog" aria-modal="true" aria-label="Mi Perfil" onClick={onClose}>
            <div className="saas-profile-modal" onClick={(event) => event.stopPropagation()}>
                <header className="saas-profile-header">
                    <button type="button" className="saas-btn saas-header-btn saas-header-btn--secondary" onClick={onClose}>
                        ← Volver al panel
                    </button>
                    <strong>Mi Perfil</strong>
                    <button type="button" className="saas-profile-close" onClick={onClose} aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </header>

                {loading ? (
                    <div className="saas-profile-loading">Cargando perfil...</div>
                ) : (
                    <div className="saas-profile-body">
                        <aside className="saas-profile-summary">
                            <button
                                type="button"
                                className="saas-profile-avatar-large"
                                style={profile?.avatarUrl ? undefined : avatarStyle}
                                onClick={() => fileInputRef.current?.click()}
                                title="Cambiar foto"
                            >
                                {profile?.avatarUrl
                                    ? <img src={profile.avatarUrl} alt={profile.displayName} />
                                    : <span>{buildInitials(profile?.displayName || profile?.email)}</span>}
                                <em><Camera size={15} /></em>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                hidden
                                onChange={handleAvatarChange}
                            />
                            <button type="button" className="saas-profile-photo-link" onClick={() => fileInputRef.current?.click()}>
                                Cambiar foto
                            </button>
                            <h3>{profile?.displayName || 'Usuario'}</h3>
                            <p>{profile?.email || '-'}</p>
                            <span>Rol: {profile?.role || '-'} · {profile?.tenantName || '-'}</span>
                            <nav className="saas-profile-tabs" aria-label="Secciones de perfil">
                                <button type="button" className={activeSection === 'profile' ? 'is-active' : ''} onClick={() => setActiveSection('profile')}>
                                    Información
                                </button>
                                <button type="button" className={activeSection === 'security' ? 'is-active' : ''} onClick={() => setActiveSection('security')}>
                                    Seguridad
                                </button>
                                <button type="button" className={activeSection === 'devices' ? 'is-active' : ''} onClick={() => setActiveSection('devices')}>
                                    Dispositivos
                                </button>
                            </nav>
                        </aside>

                        <main className="saas-profile-content">
                            {error ? <div className="saas-profile-alert is-error">{error}</div> : null}
                            {status ? <div className="saas-profile-alert is-success">{status}</div> : null}

                            {activeSection === 'profile' ? (
                                <section className="saas-profile-card">
                                    <h4>Información personal</h4>
                                    <label className="saas-profile-field">
                                        <span>Nombre para mostrar</span>
                                        <input
                                            value={profileDraft.displayName}
                                            onChange={(event) => setProfileDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                                        />
                                    </label>
                                    <label className="saas-profile-field">
                                        <span>Teléfono</span>
                                        <div className="saas-profile-input-icon">
                                            <Phone size={15} />
                                            <input
                                                value={profileDraft.phone}
                                                onChange={(event) => setProfileDraft((prev) => ({ ...prev, phone: event.target.value }))}
                                            />
                                        </div>
                                    </label>
                                    <p className="saas-profile-note">Email y rol no son editables desde esta pantalla.</p>
                                    <button type="button" className="saas-btn saas-btn-primary" disabled={saving} onClick={handleSaveProfile}>
                                        <Save size={15} /> Guardar cambios
                                    </button>
                                </section>
                            ) : null}

                            {activeSection === 'security' ? (
                                <section className="saas-profile-card">
                                    <h4>Seguridad</h4>
                                    <PasswordField
                                        label="Contraseña actual"
                                        value={passwordDraft.currentPassword}
                                        onChange={(value) => setPasswordDraft((prev) => ({ ...prev, currentPassword: value }))}
                                        visible={visiblePasswords.current}
                                        onToggle={() => setVisiblePasswords((prev) => ({ ...prev, current: !prev.current }))}
                                        autoComplete="current-password"
                                    />
                                    <PasswordField
                                        label="Nueva contraseña"
                                        value={passwordDraft.newPassword}
                                        onChange={(value) => setPasswordDraft((prev) => ({ ...prev, newPassword: value }))}
                                        visible={visiblePasswords.next}
                                        onToggle={() => setVisiblePasswords((prev) => ({ ...prev, next: !prev.next }))}
                                        autoComplete="new-password"
                                    />
                                    <PasswordField
                                        label="Confirmar"
                                        value={passwordDraft.confirmPassword}
                                        onChange={(value) => setPasswordDraft((prev) => ({ ...prev, confirmPassword: value }))}
                                        visible={visiblePasswords.confirm}
                                        onToggle={() => setVisiblePasswords((prev) => ({ ...prev, confirm: !prev.confirm }))}
                                        autoComplete="new-password"
                                    />
                                    <div className="saas-profile-password-rules">
                                        {PASSWORD_RULES.map((rule) => (
                                            <span key={rule.key} className={passwordChecks[rule.key] ? 'is-ok' : 'is-pending'}>
                                                {passwordChecks[rule.key] ? <Check size={13} /> : <X size={13} />}
                                                {rule.label}
                                            </span>
                                        ))}
                                    </div>
                                    <button type="button" className="saas-btn saas-btn-primary" disabled={saving || !canChangePassword} onClick={handleChangePassword}>
                                        <Shield size={15} /> Cambiar contraseña
                                    </button>
                                </section>
                            ) : null}

                            {activeSection === 'devices' ? (
                                <section className="saas-profile-card">
                                    <h4>Mis dispositivos</h4>
                                    <div className="saas-profile-devices">
                                        {devicesActive.length === 0 ? (
                                            <div className="saas-profile-empty">No hay dispositivos activos.</div>
                                        ) : devicesActive.map((device) => (
                                            <article key={device.deviceId} className={`saas-profile-device${device.isCurrent ? ' is-current' : ''}`}>
                                                <div className="saas-profile-device-icon">
                                                    {deviceIcon(device.deviceType)}
                                                </div>
                                                <div>
                                                    <strong>{device.deviceName || normalizeDeviceType(device.deviceType)}</strong>
                                                    <span>
                                                        {device.isCurrent ? 'Este dispositivo · ' : ''}
                                                        {normalizeDeviceType(device.deviceType)} · Última vez: {formatDate(device.lastSeenAt)}
                                                    </span>
                                                    <small>{device.ipAddress || 'IP no registrada'}</small>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="saas-btn saas-header-btn saas-header-btn--secondary"
                                                    disabled={saving || device.isCurrent}
                                                    onClick={() => handleRevokeDevice(device.deviceId)}
                                                >
                                                    Revocar
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                    <div className="saas-profile-session-box">
                                        <div>
                                            <strong>Sesión</strong>
                                            <span>Cierra el acceso de todos tus dispositivos por seguridad.</span>
                                        </div>
                                        <button type="button" className="saas-btn saas-header-btn saas-header-btn--danger" disabled={saving} onClick={handleLogoutAllDevices}>
                                            <LogOut size={15} /> Cerrar sesión en todos
                                        </button>
                                    </div>
                                </section>
                            ) : null}
                        </main>
                    </div>
                )}
            </div>
        </div>
    );
}
