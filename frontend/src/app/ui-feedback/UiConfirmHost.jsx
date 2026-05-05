import useUiFeedback from './useUiFeedback';

export default function UiConfirmHost() {
  const { activeConfirm, resolveConfirm } = useUiFeedback();

  if (!activeConfirm) return null;

  const tone = String(activeConfirm?.tone || 'default').trim().toLowerCase();
  const confirmClassName = tone === 'danger'
    ? 'saas-btn saas-btn--danger'
    : (tone === 'warn' ? 'saas-btn ui-feedback-confirm__confirm--warn' : 'saas-btn saas-btn--primary');

  return (
    <div
      className="ui-feedback-confirm__overlay"
      role="presentation"
      onClick={() => resolveConfirm(false)}
    >
      <div
        className="ui-feedback-confirm__shell"
        role="presentation"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`ui-feedback-confirm__panel ui-feedback-confirm__panel--${tone || 'default'}`}
          role="dialog"
          aria-modal="true"
          aria-label={activeConfirm.title || 'Confirmar accion'}
        >
          <h3 className="ui-feedback-confirm__title">{activeConfirm.title}</h3>

          <p className="ui-feedback-confirm__message">{activeConfirm.message}</p>

          <div className="ui-feedback-confirm__actions">
            <button
              type="button"
              className="saas-btn saas-btn--secondary"
              onClick={() => resolveConfirm(false)}
            >
              {activeConfirm.cancelText || 'Cancelar'}
            </button>

            <button
              type="button"
              className={confirmClassName}
              onClick={() => resolveConfirm(true)}
            >
              {activeConfirm.confirmText || 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
