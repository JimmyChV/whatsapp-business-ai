import { Suspense } from 'react';

import AppErrorBoundary from '../../../shared/components/AppErrorBoundary';
import SaasAdminPanel from './SaasAdminPanel';

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
  return (
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
  );
}

