import useUiFeedback from './useUiFeedback';

const toneConfirmStyles = {
  default: {
    background: 'var(--saas-accent-primary)',
    color: 'var(--saas-accent-primary-text)',
    border: '1px solid var(--saas-accent-primary)'
  },
  danger: {
    background: 'var(--saas-accent-danger)',
    color: 'var(--saas-accent-primary-text)',
    border: '1px solid var(--saas-accent-danger)'
  },
  warn: {
    background: 'var(--saas-accent-warning)',
    color: 'var(--saas-text-inverse)',
    border: '1px solid var(--saas-accent-warning)'
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
        background: 'color-mix(in srgb, var(--saas-bg-base) 78%, transparent)',
        backdropFilter: 'blur(8px)',
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
          borderRadius: '16px',
          border: '1px solid var(--saas-border-color)',
          background: 'linear-gradient(180deg, var(--saas-bg-surface) 0%, var(--saas-bg-elevated) 100%)',
          boxShadow: 'var(--saas-shadow-lg)',
          color: 'var(--saas-text-primary)',
          padding: '20px 20px 16px'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.2 }}>
          {activeConfirm.title}
        </h3>

        <p style={{ margin: '12px 0 0', fontSize: '0.96rem', lineHeight: 1.5, color: 'var(--saas-text-secondary)' }}>
          {activeConfirm.message}
        </p>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={() => resolveConfirm(false)}
            style={{
              border: '1px solid var(--saas-border-color)',
              background: 'transparent',
              color: 'var(--saas-text-primary)',
              borderRadius: '10px',
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            {activeConfirm.cancelText || 'Cancelar'}
          </button>

          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            style={{
              borderRadius: '10px',
              padding: '10px 14px',
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
