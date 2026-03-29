import useUiFeedback from './useUiFeedback';

const typeStyles = {
  info: {
    border: '1px solid rgba(78, 205, 196, 0.35)',
    background: 'rgba(17, 28, 37, 0.96)'
  },
  success: {
    border: '1px solid rgba(16, 185, 129, 0.45)',
    background: 'rgba(14, 33, 29, 0.96)'
  },
  warn: {
    border: '1px solid rgba(245, 158, 11, 0.45)',
    background: 'rgba(38, 29, 12, 0.96)'
  },
  error: {
    border: '1px solid rgba(239, 68, 68, 0.5)',
    background: 'rgba(36, 17, 19, 0.96)'
  }
};

export default function UiToastHost() {
  const { toasts, dismissToast } = useUiFeedback();

  if (!Array.isArray(toasts) || toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 3000,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: 'min(420px, calc(100vw - 24px))'
      }}
    >
      {toasts.map((toast) => {
        const tone = String(toast?.type || 'info').trim().toLowerCase();
        const toneStyle = typeStyles[tone] || typeStyles.info;

        return (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismissToast(toast.id)}
            style={{
              ...toneStyle,
              width: '100%',
              textAlign: 'left',
              borderRadius: '12px',
              color: '#e8f0f4',
              padding: '10px 12px',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
            }}
          >
            {toast?.title ? (
              <div style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: '4px' }}>
                {toast.title}
              </div>
            ) : null}
            <div style={{ fontSize: '0.82rem', lineHeight: 1.35, opacity: 0.95 }}>
              {toast?.body}
            </div>
          </button>
        );
      })}
    </div>
  );
}
