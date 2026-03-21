function StatusScreen({ message = '' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111b21', gap: '20px' }}>
      <div className='loader' />
      <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>{message}</p>
    </div>
  );
}

export default StatusScreen;
