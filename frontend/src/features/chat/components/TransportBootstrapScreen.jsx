function TransportBootstrapScreen({
  selectedModeLabel,
  isSwitchingTransport,
  activeTransport,
  cloudConfigured,
  waModuleError,
  transportError
}) {
  const showCloudConfigError = activeTransport === 'cloud' && !cloudConfigured;
  const tone = {
    title: 'var(--saas-text-primary)',
    text: 'var(--chat-control-text-soft)',
    panel: 'var(--chat-shell-panel-gradient)',
    panelBorder: 'var(--chat-card-border)',
    infoSurface: 'var(--chat-info-surface)',
    infoBorder: 'var(--chat-info-border)',
    infoText: 'var(--chat-info-text)',
    warningSurface: 'var(--chat-warning-bg)',
    warningBorder: 'var(--chat-warning-border)',
    warningText: 'var(--chat-warning-text-strong)',
    dangerSurface: 'var(--chat-danger-soft)',
    dangerBorder: 'var(--chat-danger-border)',
    dangerText: 'var(--chat-danger-text)'
  };

  return (
    <div className='login-screen'>
      <div style={{ textAlign: 'center', maxWidth: '520px', width: '100%' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 300, color: tone.title, marginBottom: '10px' }}>WhatsApp Business Pro</div>
          <p style={{ color: tone.text, fontSize: '0.9rem' }}>Conectando con <strong style={{ color: tone.title }}>{selectedModeLabel}</strong>.</p>
        </div>

        {isSwitchingTransport && (
          <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${tone.infoBorder}`, background: tone.infoSurface, color: tone.infoText, fontSize: '0.82rem' }}>
            Cambiando transporte...
          </div>
        )}

        {showCloudConfigError ? (
          <div style={{ padding: '14px', borderRadius: '12px', border: `1px solid ${tone.warningBorder}`, background: tone.warningSurface, color: tone.warningText, textAlign: 'left', fontSize: '0.83rem', lineHeight: 1.6 }}>
            Falta configurar Cloud API en backend/.env.<br />
            Variables minimas: <strong>META_APP_ID</strong>, <strong>META_SYSTEM_USER_TOKEN</strong>, <strong>META_WABA_PHONE_NUMBER_ID</strong>.
          </div>
        ) : (
          <div style={{ padding: '16px', borderRadius: '12px', border: `1px solid ${tone.panelBorder}`, background: tone.panel, boxShadow: 'var(--chat-panel-shadow)' }}>
            <div className='loader' style={{ margin: '0 auto 12px' }} />
            <p style={{ color: tone.text, fontSize: '0.86rem', margin: 0 }}>Esperando inicializacion de Cloud API...</p>
          </div>
        )}

        {waModuleError && (
          <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${tone.warningBorder}`, background: tone.warningSurface, color: tone.warningText, fontSize: '0.82rem' }}>
            {waModuleError}
          </div>
        )}

        {transportError && (
          <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${tone.dangerBorder}`, background: tone.dangerSurface, color: tone.dangerText, fontSize: '0.82rem' }}>
            {transportError}
          </div>
        )}
      </div>
    </div>
  );
}

export default TransportBootstrapScreen;
