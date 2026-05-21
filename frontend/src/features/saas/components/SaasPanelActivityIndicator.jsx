function normalizeSavingActions(savingActions) {
    if (savingActions instanceof Map) {
        return Array.from(savingActions.entries())
            .map(([actionKey, value]) => ({
                actionKey,
                label: String(value?.label || actionKey || 'cambio').trim() || 'cambio',
                status: String(value?.status || 'saving').trim().toLowerCase() || 'saving',
                error: String(value?.error || '').trim(),
                updatedAt: Number(value?.updatedAt || 0)
            }))
            .filter((item) => item.actionKey);
    }
    return [];
}

function pickLatest(items) {
    return [...items].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
}

export default function SaasPanelActivityIndicator({
    savingActions,
    onRetry
}) {
    const items = normalizeSavingActions(savingActions);
    const savingItems = items.filter((item) => item.status === 'saving');
    const errorItem = pickLatest(items.filter((item) => item.status === 'error'));
    const successItem = pickLatest(items.filter((item) => item.status === 'success'));

    if (savingItems.length > 0) {
        const label = savingItems.length > 1
            ? `Guardando ${savingItems.length} cambios...`
            : `Guardando ${savingItems[0].label}...`;
        return (
            <div className="saas-activity-pill saas-activity-pill--saving" role="status" aria-live="polite">
                <span className="saas-activity-dot saas-activity-dot--pulse" />
                <span>{label}</span>
            </div>
        );
    }

    if (errorItem) {
        return (
            <div className="saas-activity-pill saas-activity-pill--error" role="status" aria-live="polite" title={errorItem.error || 'Error al guardar'}>
                <span className="saas-activity-dot saas-activity-dot--static" />
                <span>Error al guardar</span>
                {typeof onRetry === 'function' ? (
                    <button type="button" onClick={() => onRetry(errorItem.actionKey)}>
                        Reintentar
                    </button>
                ) : null}
            </div>
        );
    }

    if (successItem) {
        return (
            <div className="saas-activity-pill saas-activity-pill--success" role="status" aria-live="polite">
                <span className="saas-activity-dot saas-activity-dot--static" />
                <span>{successItem.label} actualizado</span>
            </div>
        );
    }

    return null;
}
