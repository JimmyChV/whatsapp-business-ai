const TENANT_LOCK_EXEMPT_SECTIONS = new Set(['saas_resumen', 'saas_empresas', 'saas_planes', 'saas_roles', 'saas_global_labels']);

function NavSectionIcon({ sectionId }) {
    const commonProps = {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true'
    };

    switch (sectionId) {
    case 'saas_resumen':
        return <svg {...commonProps}><path d="M3 12h8V3H3zM13 21h8v-6h-8zM13 11h8V3h-8zM3 21h8v-7H3z" /></svg>;
    case 'saas_planes':
        return <svg {...commonProps}><path d="M9 11h11M9 16h11M9 6h11M4 6h.01M4 11h.01M4 16h.01" /></svg>;
    case 'saas_empresas':
        return <svg {...commonProps}><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01" /></svg>;
    case 'saas_usuarios':
        return <svg {...commonProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'saas_roles':
        return <svg {...commonProps}><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4zM9 12l2 2 4-4" /></svg>;
    case 'saas_clientes':
        return <svg {...commonProps}><path d="M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" /></svg>;
    case 'saas_operacion':
        return <svg {...commonProps}><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>;
    case 'saas_campaigns':
        return <svg {...commonProps}><path d="M3 11v2a2 2 0 0 0 2 2h2l4 4v-8h4l6 4V7l-6 4H5a2 2 0 0 0-2 2z" /></svg>;
    case 'saas_templates':
        return <svg {...commonProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case 'saas_ia':
        return <svg {...commonProps}><path d="m12 3 1.4 3.8L17 8.2l-3.1 2.4L15 15l-3-2-3 2 1.1-4.4L7 8.2l3.6-1.4L12 3z" /></svg>;
    case 'saas_automations':
        return <svg {...commonProps}><path d="M12 3v3M12 18v3M4.9 4.9 7 7M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1 7 17M17 7l2.1-2.1M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z" /></svg>;
    case 'saas_etiquetas':
    case 'saas_global_labels':
        return <svg {...commonProps}><path d="m20 13-7 7-9-9V4h7zM7.5 7.5h.01" /></svg>;
    case 'saas_quick_replies':
        return <svg {...commonProps}><path d="M7 8h10M7 12h7M4 4h16v12H7l-3 3z" /></svg>;
    case 'saas_modulos':
        return <svg {...commonProps}><path d="M12 2 3 7l9 5 9-5-9-5zM3 17l9 5 9-5M3 12l9 5 9-5" /></svg>;
    case 'saas_catalogos':
        return <svg {...commonProps}><path d="M4 6h16v14H4zM9 6V4h6v2M8 11h8M8 15h8" /></svg>;
    case 'saas_config':
        return <svg {...commonProps}><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>;
    default:
        return <svg {...commonProps}><circle cx="12" cy="12" r="8" /></svg>;
    }
}

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
            {adminNavItems.map((item, index) => {
                const previousGroup = index > 0 ? String(adminNavItems[index - 1]?.group || '') : '';
                const currentGroup = String(item?.group || '');
                const blockedByTenantScope = tenantScopeLocked && !TENANT_LOCK_EXEMPT_SECTIONS.has(item.id);
                return (
                    <div key={item.id} className="saas-admin-nav__entry">
                        {index > 0 && currentGroup === 'tenant' && currentGroup !== previousGroup ? (
                            <div
                                className="saas-admin-nav__divider"
                                aria-hidden="true"
                                data-group={currentGroup}
                            >
                                <span>Tenant</span>
                            </div>
                        ) : null}
                        <button
                            type="button"
                            className={`saas-admin-nav-btn ${selectedSectionId === item.id ? 'active' : ''}`.trim()}
                            disabled={busy || !item.enabled || blockedByTenantScope}
                            onClick={() => onSectionChange?.(item.id)}
                            title={item.label}
                            data-tooltip={item.label}
                            aria-label={item.label}
                        >
                            <span className="saas-admin-nav-btn__icon">
                                <NavSectionIcon sectionId={item.id} />
                            </span>
                            <span className="saas-admin-nav-btn__label">
                                {item.label}
                            </span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
