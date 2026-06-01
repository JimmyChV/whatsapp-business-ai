import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LogOut, MessageCircle, Moon, Smartphone, Sun, User, X } from 'lucide-react';
import SaasPanelActivityIndicator from '../SaasPanelActivityIndicator';
import SaasPanelExitBlockModal from '../SaasPanelExitBlockModal';

const normalizeThemeMode = (value = '') => (String(value || '').trim().toLowerCase() === 'light' ? 'light' : 'dark');

function avatarColor(name = '', email = '') {
    const palette = ['#1D9E75', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be123c'];
    const source = String(name || email || 'Usuario');
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(index);
        hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
}

const normalizeActivityActions = (savingActions) => {
    if (!(savingActions instanceof Map)) return [];
    return Array.from(savingActions.entries())
        .map(([actionKey, value]) => ({
            actionKey,
            label: String(value?.label || actionKey || 'cambio').trim() || 'cambio',
            status: String(value?.status || 'saving').trim().toLowerCase() || 'saving'
        }))
        .filter((item) => item.actionKey);
};

export default function SaasPanelHeader({
    showHeader = true,
    embedded = false,
    title = 'Control SaaS',
    subtitle = '',
    canOpenOperation = false,
    isBusy = false,
    onOpenOperation,
    currentUserAvatarUrl = '',
    currentUserDisplayName = 'Usuario',
    currentUserEmail = '',
    currentUserRoleLabel = 'Sin rol',
    currentUserTenantLabel = '',
    buildInitials,
    onOpenProfile,
    onOpenDevices,
    onLogout,
    closeLabel = 'Cerrar sesión',
    themeMode = 'dark',
    onThemeChange = null,
    onClose,
    tenantPicker = null,
    savingActions = new Map(),
    panelActivity = null,
    onRetryActivity = null
}) {
    if (!showHeader) return null;

    const [activeThemeMode, setActiveThemeMode] = useState(() => normalizeThemeMode(themeMode));
    const [exitBlockOpen, setExitBlockOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);

    useEffect(() => {
        setActiveThemeMode(normalizeThemeMode(themeMode));
    }, [themeMode]);

    const activityActions = useMemo(() => normalizeActivityActions(savingActions), [savingActions]);
    const pendingActions = useMemo(
        () => activityActions.filter((item) => item.status === 'saving'),
        [activityActions]
    );
    const hasPendingSaves = pendingActions.length > 0;

    useEffect(() => {
        if (!hasPendingSaves) setExitBlockOpen(false);
    }, [hasPendingSaves]);

    useEffect(() => {
        if (!profileMenuOpen) return undefined;
        const handlePointerDown = (event) => {
            if (profileMenuRef.current?.contains(event.target)) return;
            setProfileMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [profileMenuOpen]);

    const handleCloseClick = () => {
        if (hasPendingSaves) {
            setExitBlockOpen(true);
            return;
        }
        (onLogout || onClose)?.();
    };

    const renderAvatarNode = () => (
        <div
            className="saas-admin-header-profile-avatar"
            style={currentUserAvatarUrl ? undefined : { background: avatarColor(currentUserDisplayName, currentUserEmail), color: '#fff' }}
        >
            {currentUserAvatarUrl
                ? <img src={currentUserAvatarUrl} alt={currentUserDisplayName} />
                : <span>{typeof buildInitials === 'function' ? buildInitials(currentUserDisplayName) : 'U'}</span>}
        </div>
    );

    return (
        <div className="saas-admin-header">
            <div>
                <h2>{title}</h2>
                <div className="saas-admin-header-subrow">
                    {subtitle ? <span className="saas-admin-header-subtitle">{subtitle}</span> : null}
                    {tenantPicker && tenantPicker.visible ? (
                        <div className="saas-admin-header-tenant-inline">
                            <span className="saas-admin-header-tenant-label">EMPRESA</span>
                            <select
                                className="saas-admin-header-tenant-select"
                                value={String(tenantPicker.value || '')}
                                onChange={(event) => {
                                    const nextTenantId = String(event.target.value || '').trim();
                                    tenantPicker.onChange?.(nextTenantId);
                                }}
                                disabled={Boolean(tenantPicker.disabled)}
                                title="Empresa activa"
                                aria-label="Empresa activa"
                            >
                                <option value="">
                                    Seleccionar empresa
                                </option>
                                {(Array.isArray(tenantPicker.options) ? tenantPicker.options : []).map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>
                                        {typeof tenantPicker.toTenantDisplayName === 'function'
                                            ? tenantPicker.toTenantDisplayName(tenant)
                                            : (tenant?.name || tenant?.id || '')}
                                    </option>
                                ))}
                            </select>
                            {tenantPicker.canClear ? (
                                <button
                                    type="button"
                                    className="saas-btn saas-header-btn saas-header-btn--secondary saas-admin-header-tenant-clear"
                                    disabled={Boolean(tenantPicker.disabled)}
                                    onClick={() => tenantPicker.onClear?.()}
                                    title="Limpiar empresa activa"
                                    aria-label="Limpiar empresa activa"
                                >
                                    <X size={14} strokeWidth={2} />
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
            {!embedded && (
                <div className="saas-admin-header-actions">
                    <div className="saas-activity-slot" aria-live="polite">
                        <SaasPanelActivityIndicator
                            savingActions={savingActions}
                            panelActivity={panelActivity}
                            onRetry={onRetryActivity}
                        />
                    </div>
                    {typeof onOpenOperation === 'function' && (
                        <button
                            type="button"
                            className="saas-btn saas-header-btn saas-header-btn--secondary saas-admin-header-open-operation"
                            disabled={isBusy || !canOpenOperation}
                            onClick={onOpenOperation}
                            title="Ir al chat"
                        >
                            <MessageCircle size={15} strokeWidth={2} />
                            <span className="saas-btn-text">Ir al chat</span>
                        </button>
                    )}
                    <div className="saas-admin-theme-toggle" role="group" aria-label="Cambiar tema">
                        <button
                            type="button"
                            className="saas-admin-theme-toggle__button saas-btn saas-header-btn saas-header-btn--secondary"
                            onClick={() => {
                                const next = activeThemeMode === 'dark' ? 'light' : 'dark';
                                setActiveThemeMode(next);
                                document.documentElement.setAttribute('data-theme', next);
                                try {
                                    window.localStorage.setItem('saas-theme', next);
                                    window.localStorage.setItem('saas.theme.mode', next);
                                } catch {}
                                onThemeChange?.(next);
                            }}
                            title={activeThemeMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                            aria-label={activeThemeMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                        >
                            {activeThemeMode === 'dark'
                                ? <><Sun size={14} strokeWidth={2} /><span className="saas-admin-theme-toggle__button-label">Claro</span></>
                                : <><Moon size={14} strokeWidth={2} /><span className="saas-admin-theme-toggle__button-label">Oscuro</span></>}
                        </button>
                    </div>
                    <div className="saas-admin-header-profile-wrap" ref={profileMenuRef}>
                        <button
                            type="button"
                            className="saas-admin-header-profile"
                            aria-label="Abrir menu de perfil"
                            aria-haspopup="menu"
                            aria-expanded={profileMenuOpen}
                            onClick={() => setProfileMenuOpen((open) => !open)}
                        >
                            {renderAvatarNode()}
                            <div className="saas-admin-header-profile-meta">
                                <strong>{currentUserDisplayName}</strong>
                                <small>{currentUserRoleLabel}</small>
                            </div>
                            <ChevronDown size={14} strokeWidth={2} />
                        </button>
                        {profileMenuOpen ? (
                            <div className="saas-admin-profile-menu" role="menu">
                                <div className="saas-admin-profile-menu__identity">
                                    {renderAvatarNode()}
                                    <div>
                                        <strong>{currentUserDisplayName}</strong>
                                        <span>{currentUserEmail || '-'}</span>
                                        <small>{currentUserRoleLabel} · {currentUserTenantLabel || '-'}</small>
                                    </div>
                                </div>
                                <div className="saas-admin-profile-menu__divider" />
                                <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onOpenProfile?.(); }}>
                                    <User size={16} /> Mi perfil
                                </button>
                                <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onOpenDevices?.(); }}>
                                    <Smartphone size={16} /> Mis dispositivos
                                </button>
                                <div className="saas-admin-profile-menu__divider" />
                                <button type="button" role="menuitem" className="is-danger" onClick={() => { setProfileMenuOpen(false); handleCloseClick(); }}>
                                    <LogOut size={16} /> Cerrar sesión
                                </button>
                            </div>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className={`saas-btn saas-header-btn saas-header-btn--danger saas-admin-header-close-danger${hasPendingSaves ? ' is-save-blocked' : ''}`}
                        aria-disabled={hasPendingSaves}
                        onClick={handleCloseClick}
                        title={closeLabel}
                    >
                        <X size={15} strokeWidth={2} />
                        <span className="saas-btn-text">{closeLabel}</span>
                    </button>
                    {exitBlockOpen ? (
                        <SaasPanelExitBlockModal
                            pendingActions={pendingActions}
                            onWait={() => setExitBlockOpen(false)}
                            onForceExit={() => {
                                setExitBlockOpen(false);
                                onClose?.();
                            }}
                        />
                    ) : null}
                </div>
            )}
        </div>
    );
}
