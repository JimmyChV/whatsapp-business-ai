import SaasPanelHeader from './SaasPanelHeader';
import SaasPanelNav from './SaasPanelNav';
import SaasPanelTenantPicker from './SaasPanelTenantPicker';

export default function SaasPanelFrame({
    embedded = false,
    showHeader = true,
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
    onClose,
    error = '',
    showPanelLoading = false,
    requiresTenantSelection = false,
    settingsTenantId = '',
    tenantOptions = [],
    toTenantDisplayName,
    onChangeTenant,
    onClearTenant,
    showNavigation = true,
    adminNavItems = [],
    selectedSectionId = '',
    tenantScopeLocked = false,
    onSectionChange,
    children
}) {
    return (
        <div className={embedded ? 'saas-admin-overlay saas-admin-overlay--embedded' : 'saas-admin-overlay'} onClick={() => { if (!embedded) onClose?.(); }}>
            <div className={embedded ? 'saas-admin-panel saas-admin-panel--embedded' : 'saas-admin-panel'} onClick={(event) => event.stopPropagation()}>
                <SaasPanelHeader
                    showHeader={showHeader}
                    embedded={embedded}
                    title={title}
                    subtitle={subtitle}
                    canOpenOperation={canOpenOperation}
                    isBusy={isBusy}
                    onOpenOperation={onOpenOperation}
                    currentUserAvatarUrl={currentUserAvatarUrl}
                    currentUserDisplayName={currentUserDisplayName}
                    currentUserRoleLabel={currentUserRoleLabel}
                    buildInitials={buildInitials}
                    closeLabel={closeLabel}
                    onClose={onClose}
                />

                {error && (
                    <div className='saas-admin-alert error'>
                        {error}
                    </div>
                )}

                {showPanelLoading && (
                    <div className='saas-admin-loading-overlay' role='status' aria-live='polite' aria-label='Cargando panel'>
                        <div className='saas-admin-loading-card'>
                            <div className='loader' />
                        </div>
                    </div>
                )}

                <SaasPanelTenantPicker
                    requiresTenantSelection={requiresTenantSelection}
                    settingsTenantId={settingsTenantId}
                    tenantOptions={tenantOptions}
                    busy={isBusy}
                    toTenantDisplayName={toTenantDisplayName}
                    onChangeTenant={onChangeTenant}
                    onClearTenant={onClearTenant}
                />

                <SaasPanelNav
                    showNavigation={showNavigation}
                    adminNavItems={adminNavItems}
                    selectedSectionId={selectedSectionId}
                    busy={isBusy}
                    tenantScopeLocked={tenantScopeLocked}
                    onSectionChange={onSectionChange}
                />

                {children}
            </div>
        </div>
    );
}
