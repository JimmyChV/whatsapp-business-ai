import { MessageCircle, Moon, Sun, X } from 'lucide-react';

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
    currentUserRoleLabel = 'Sin rol',
    buildInitials,
    closeLabel = 'Cerrar sesión',
    themeMode = 'dark',
    onThemeChange = null,
    onClose,
    tenantPicker = null
}) {
    if (!showHeader) return null;

    return (
        <div className="saas-admin-header">
            <div>
                <h2>{title}</h2>
                <div className="saas-admin-header-subrow">
                    {subtitle ? <span>{subtitle}</span> : null}
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
                                    className="saas-header-btn saas-header-btn--secondary saas-admin-header-tenant-clear"
                                    disabled={Boolean(tenantPicker.disabled)}
                                    onClick={() => tenantPicker.onClear?.()}
                                >
                                    Limpiar
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
            {!embedded && (
                <div className="saas-admin-header-actions">
                    {typeof onOpenOperation === 'function' && (
                        <button
                            type="button"
                            className="saas-header-btn saas-header-btn--primary saas-admin-header-open-operation"
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
                            className="saas-admin-theme-toggle__button"
                            onClick={() => {
                                const next = themeMode === 'dark' ? 'light' : 'dark';
                                document.documentElement.setAttribute('data-theme', next);
                                try {
                                    window.localStorage.setItem('saas-theme', next);
                                    window.localStorage.setItem('saas.theme.mode', next);
                                } catch {}
                                onThemeChange?.(next);
                            }}
                            title={themeMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                            aria-label={themeMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--saas-border-color)',
                                borderRadius: '20px',
                                padding: '4px 10px',
                                cursor: 'pointer',
                                color: 'var(--saas-text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                pointerEvents: 'auto',
                                zIndex: 10,
                                position: 'relative'
                            }}
                        >
                            {themeMode === 'dark'
                                ? <><Sun size={14} strokeWidth={2} /> Claro</>
                                : <><Moon size={14} strokeWidth={2} /> Oscuro</>}
                        </button>
                    </div>
                    <div className="saas-admin-header-profile" role="status" aria-label="Usuario en sesión">
                        <div className="saas-admin-header-profile-avatar">
                            {currentUserAvatarUrl
                                ? <img src={currentUserAvatarUrl} alt={currentUserDisplayName} />
                                : <span>{typeof buildInitials === 'function' ? buildInitials(currentUserDisplayName) : 'U'}</span>}
                        </div>
                        <div className="saas-admin-header-profile-meta">
                            <strong>{currentUserDisplayName}</strong>
                            <small>{currentUserRoleLabel}</small>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="saas-header-btn saas-header-btn--danger saas-admin-header-close-danger"
                        onClick={onClose}
                        title={closeLabel}
                    >
                        <X size={15} strokeWidth={2} />
                        <span className="saas-btn-text">{closeLabel}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
