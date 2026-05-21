function toPendingActions(actions) {
    return (Array.isArray(actions) ? actions : [])
        .map((action) => String(action?.label || '').trim())
        .filter(Boolean);
}

export default function SaasPanelExitBlockModal({
    pendingActions,
    onWait,
    onForceExit
}) {
    const labels = toPendingActions(pendingActions);

    return (
        <div className="saas-exit-block-modal" role="dialog" aria-modal="false" aria-labelledby="saas-exit-block-title">
            <div className="saas-exit-block-modal__panel">
                <h3 id="saas-exit-block-title">Hay cambios guardándose</h3>
                <p>Si sales ahora, estos cambios podrían perderse:</p>
                <ul>
                    {(labels.length > 0 ? labels : ['Cambios pendientes']).map((label) => (
                        <li key={label}>{label}</li>
                    ))}
                </ul>
                <div className="saas-exit-block-modal__actions">
                    <button type="button" className="saas-btn saas-btn--secondary" onClick={onWait}>
                        Esperar y guardar
                    </button>
                    <button type="button" className="saas-btn saas-exit-block-modal__danger" onClick={onForceExit}>
                        Salir y descartar
                    </button>
                </div>
            </div>
        </div>
    );
}
