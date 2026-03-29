import useUiFeedback from './useUiFeedback';

const toneConfirmStyles = {
  default: {
    background: '#00c2a8',
    color: '#042521'
  },
  danger: {
    background: '#ef4444',
    color: '#2a0508'
  },
  warn: {
    background: '#f59e0b',
    color: '#2b1a00'
  }
};

export default function UiConfirmHost() {
  const { activeConfirm, resolveConfirm } = useUiFeedback();

  if (!activeConfirm) return null;

  const tone = String(activeConfirm?.tone || 'default').trim().toLowerCase();
  const confirmStyle = toneConfirmStyles[tone] || toneConfirmStyles.default;

  return (
    <div
      role="presentation"
      onClick={() => resolveConfirm(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'rgba(3, 10, 16, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={activeConfirm.title || 'Confirmar accion'}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          borderRadius: '14px',
          border: '1px solid rgba(96, 125, 139, 0.35)',
          background: 'linear-gradient(180deg, #112434 0%, #0d1c28 100%)',
          boxShadow: '0 18px 46px rgba(0,0,0,0.35)',
          color: '#e6f0f5',
          padding: '18px 18px 14px'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
          {activeConfirm.title}
        </h3>

        <p style={{ margin: '10px 0 0', fontSize: '0.9rem', lineHeight: 1.45, color: '#b6cad6' }}>
          {activeConfirm.message}
        </p>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={() => resolveConfirm(false)}
            style={{
              border: '1px solid rgba(118, 149, 166, 0.42)',
              background: 'transparent',
              color: '#d0e2eb',
              borderRadius: '10px',
              padding: '8px 12px',
              cursor: 'pointer'
            }}
          >
            {activeConfirm.cancelText || 'Cancelar'}
          </button>

          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            style={{
              border: 'none',
              borderRadius: '10px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              ...confirmStyle
            }}
          >
            {activeConfirm.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
