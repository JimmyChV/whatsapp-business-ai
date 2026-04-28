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
    closeLabel = 'Cerrar sesion',
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
                            <span className="saas-admin-header-tenant-label">Empresa</span>
                            <select
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
                        >
                            Ir al chat
                        </button>
                    )}
                    <div className="saas-admin-theme-toggle" role="group" aria-label="Cambiar tema">
                        <button
                            type="button"
                            className={`saas-header-btn ${themeMode === 'dark' ? 'saas-header-btn--primary' : 'saas-header-btn--secondary'}`.trim()}
                            onClick={() => onThemeChange?.('dark')}
                        >
                            🌙 Oscuro
                        </button>
                        <button
                            type="button"
                            className={`saas-header-btn ${themeMode === 'light' ? 'saas-header-btn--primary' : 'saas-header-btn--secondary'}`.trim()}
                            onClick={() => onThemeChange?.('light')}
                        >
                            ☀️ Claro
                        </button>
                    </div>
                    <div className="saas-admin-header-profile" role="status" aria-label="Usuario en sesion">
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
                    >
                        {closeLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
