function StatusScreen({ message = '' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--chat-shell-background)',
        padding: '24px'
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          padding: '24px 26px',
          borderRadius: '20px',
          border: '1px solid var(--chat-card-border)',
          background: 'var(--chat-shell-panel-gradient)',
          boxShadow: 'var(--chat-panel-shadow)',
          display: 'grid',
          justifyItems: 'center',
          gap: '16px'
        }}
      >
        <div className='loader' />
        <p style={{ color: 'var(--chat-control-text-soft)', fontSize: '0.92rem', textAlign: 'center', lineHeight: 1.6 }}>
          {message}
        </p>
      </div>
    </div>
  );
}

export default StatusScreen;
