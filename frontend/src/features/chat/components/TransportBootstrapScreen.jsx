function TransportBootstrapScreen({
  selectedModeLabel,
  isSwitchingTransport,
  activeTransport,
  cloudConfigured,
  waModuleError,
  transportError
}) {
  const showCloudConfigError = activeTransport === 'cloud' && !cloudConfigured;

  return (
    <div className='login-screen'>
      <div style={{ textAlign: 'center', maxWidth: '520px', width: '100%' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 300, color: '#e9edef', marginBottom: '10px' }}>WhatsApp Business Pro</div>
          <p style={{ color: '#9eb2bf', fontSize: '0.9rem' }}>Conectando con <strong style={{ color: '#e9edef' }}>{selectedModeLabel}</strong>.</p>
        </div>

        {isSwitchingTransport && (
          <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(124,200,255,0.35)', background: 'rgba(124,200,255,0.08)', color: '#cdeaff', fontSize: '0.82rem' }}>
            Cambiando transporte...
          </div>
        )}

        {showCloudConfigError ? (
          <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,170,0,0.4)', background: 'rgba(255,170,0,0.08)', color: '#ffe1a3', textAlign: 'left', fontSize: '0.83rem', lineHeight: 1.6 }}>
            Falta configurar Cloud API en backend/.env.<br />
            Variables minimas: <strong>META_APP_ID</strong>, <strong>META_SYSTEM_USER_TOKEN</strong>, <strong>META_WABA_PHONE_NUMBER_ID</strong>.
          </div>
        ) : (
          <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid rgba(124,200,255,0.35)', background: '#202c33' }}>
            <div className='loader' style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#9eb2bf', fontSize: '0.86rem', margin: 0 }}>Esperando inicializacion de Cloud API...</p>
          </div>
        )}

        {waModuleError && (
          <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,153,102,0.45)', background: 'rgba(255,153,102,0.08)', color: '#ffd9c2', fontSize: '0.82rem' }}>
            {waModuleError}
          </div>
        )}

        {transportError && (
          <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,113,113,0.4)', background: 'rgba(255,113,113,0.08)', color: '#ffd1d1', fontSize: '0.82rem' }}>
            {transportError}
          </div>
        )}
      </div>
    </div>
  );
}

export default TransportBootstrapScreen;
