import { Suspense, useEffect, useState } from 'react';

import AppErrorBoundary from '../../../shared/components/AppErrorBoundary';
import SaasAdminPanel from './SaasAdminPanel';

const SAAS_NAV_COLLAPSED_KEY = 'saas_nav_collapsed';

const PanelChunkFallback = () => (
  <div className='login-screen'>
    <div style={{ textAlign: 'center' }}>
      <div className='loader' style={{ margin: '0 auto 12px' }} />
      <p style={{ color: '#9eb2bf', fontSize: '0.86rem', margin: 0 }}>Cargando panel...</p>
    </div>
  </div>
);

export default function SaasAdminPanelShell({
  isOpen,
  onClose,
  onLogout,
  socket,
  onOpenWhatsAppOperation,
  buildApiHeaders,
  activeTenantId,
  canManageSaas,
  userRole,
  isSuperAdmin,
  currentUser,
  preferredTenantId,
  launchSource,
  initialSection,
  resetKeys,
}) {
  const [navCollapsed, setNavCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(SAAS_NAV_COLLAPSED_KEY);
      return raw === '1' || raw === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SAAS_NAV_COLLAPSED_KEY, navCollapsed ? '1' : '0');
    } catch {
      // ignore storage failures
    }
  }, [navCollapsed]);

  const handleToggleNav = () => {
    setNavCollapsed((prev) => !prev);
  };

  return (
    <div className={`saas-admin-shell ${navCollapsed ? 'is-nav-collapsed' : ''}`.trim()}>
      <button
        type='button'
        className='saas-admin-shell__nav-toggle'
        onClick={handleToggleNav}
        aria-pressed={navCollapsed}
        title={navCollapsed ? 'Expandir menu' : 'Colapsar menu'}
      >
        ☰
      </button>
      <Suspense fallback={<PanelChunkFallback />}>
        <AppErrorBoundary
          fallbackTitle='Error en Panel SaaS'
          fallbackMessage='El panel tuvo un error inesperado. Puedes reintentar sin perder la sesion activa.'
          resetKeys={resetKeys}
          onError={(error) => {
            console.error('[SaaSPanelBoundary]', error);
          }}
        >
          <SaasAdminPanel
            isOpen={isOpen}
            onClose={onClose}
            onLogout={onLogout}
            socket={socket}
            closeLabel='Cerrar sesion'
            onOpenWhatsAppOperation={onOpenWhatsAppOperation}
            buildApiHeaders={buildApiHeaders}
            activeTenantId={activeTenantId}
            canManageSaas={canManageSaas}
            userRole={userRole}
            isSuperAdmin={isSuperAdmin}
            currentUser={currentUser}
            preferredTenantId={preferredTenantId}
            launchSource={launchSource}
            initialSection={initialSection}
          />
        </AppErrorBoundary>
      </Suspense>
    </div>
  );
}

