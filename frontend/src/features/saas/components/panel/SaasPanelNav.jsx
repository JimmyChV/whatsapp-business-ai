const TENANT_LOCK_EXEMPT_SECTIONS = new Set(['saas_resumen', 'saas_empresas', 'saas_planes', 'saas_roles', 'saas_operacion']);

export default function SaasPanelNav({
    showNavigation = true,
    adminNavItems = [],
    selectedSectionId = '',
    busy = false,
    tenantScopeLocked = false,
    onSectionChange
}) {
    if (!showNavigation) return null;

    return (
        <div className="saas-admin-nav">
            {adminNavItems.map((item) => {
                const blockedByTenantScope = tenantScopeLocked && !TENANT_LOCK_EXEMPT_SECTIONS.has(item.id);
                return (
                    <button
                        key={item.id}
                        type="button"
                        className={`saas-admin-nav-btn ${selectedSectionId === item.id ? 'active' : ''}`.trim()}
                        disabled={busy || !item.enabled || blockedByTenantScope}
                        onClick={() => onSectionChange?.(item.id)}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
