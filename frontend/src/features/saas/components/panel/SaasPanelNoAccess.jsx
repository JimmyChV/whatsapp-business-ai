import SaasPanelHeader from './SaasPanelHeader';

export default function SaasPanelNoAccess({
    embedded = false,
    showHeader = true,
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
    onClose
}) {
    return (
        <div className={embedded ? 'saas-admin-overlay saas-admin-overlay--embedded' : 'saas-admin-overlay'} onClick={() => { if (!embedded) onClose?.(); }}>
            <div className={embedded ? 'saas-admin-panel saas-admin-panel--embedded' : 'saas-admin-panel'} onClick={(event) => event.stopPropagation()}>
                <SaasPanelHeader
                    showHeader={showHeader}
                    embedded={embedded}
                    title='Panel SaaS'
                    canOpenOperation={canOpenOperation}
                    isBusy={isBusy}
                    onOpenOperation={onOpenOperation}
                    currentUserAvatarUrl={currentUserAvatarUrl}
                    currentUserDisplayName={currentUserDisplayName}
                    currentUserRoleLabel={currentUserRoleLabel}
                    buildInitials={buildInitials}
                    closeLabel={closeLabel}
                    themeMode={themeMode}
                    onThemeChange={onThemeChange}
                    onClose={onClose}
                />
                <p>No tienes permisos para administrar empresas y usuarios.</p>
            </div>
        </div>
    );
}
