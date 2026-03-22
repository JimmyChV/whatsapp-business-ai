import React from 'react';

function PlansSection({
    isPlansSection,
    busy,
    loadingPlans,
    loadPlanMatrix,
    planIds,
    selectedPlanId,
    planMatrix,
    openPlanView,
    selectedPlan,
    planPanelMode,
    openPlanEdit,
    PLAN_LIMIT_KEYS,
    PLAN_FEATURE_KEYS,
    planForm,
    setPlanForm,
    chunkItems,
    runAction,
    requestJson,
    setPlanPanelMode,
    cancelPlanEdit
}) {
    if (!isPlansSection) {
        return null;
    }

    return (
                    <section id="saas_planes" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <h3>Planes SaaS</h3>
                                    <small>Control global de limites por plan.</small>
                                </div>

                                <div className="saas-admin-form-row">
                                    <button type="button" disabled={busy || loadingPlans} onClick={loadPlanMatrix}>Recargar planes</button>
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {planIds.map((planId) => (
                                        <button
                                            key={`plan_row_${planId}`}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedPlanId === planId ? 'active' : ''}`.trim()}
                                            onClick={() => openPlanView(planId)}
                                        >
                                            <strong>{planId}</strong>
                                            <small>Usuarios: {Number(planMatrix?.[planId]?.maxUsers || 0)}</small>
                                            <small>Modulos WA: {Number(planMatrix?.[planId]?.maxWaModules || 0)} | Catalogos: {Number(planMatrix?.[planId]?.maxCatalogs || 0)}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!selectedPlan && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Selecciona un plan</h4>
                                        <p>Define limites de usuarios, modulos y catalogos segun el plan.</p>
                                    </div>
                                )}

                                {selectedPlan && planPanelMode === 'view' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>Plan: {selectedPlan.id}</h3>
                                                <small>Vista de limites activos</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" disabled={busy} onClick={openPlanEdit}>Editar</button>
                                            </div>
                                        </div>
                                        <div className="saas-admin-detail-grid">
                                            {PLAN_LIMIT_KEYS.map((entry) => (
                                                <div key={`plan_limit_view_${entry.key}`} className="saas-admin-detail-field">
                                                    <span>{entry.label}</span>
                                                    <strong>{Number(selectedPlan?.limits?.[entry.key] || 0)}</strong>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="saas-admin-related-block">
                                            <h4>Features</h4>
                                            <div className="saas-admin-related-list">
                                                {PLAN_FEATURE_KEYS.map((entry) => (
                                                    <div key={`plan_feature_view_${entry.key}`} className="saas-admin-related-row" role="status">
                                                        <span>{entry.label}</span>
                                                        <small>{selectedPlan?.limits?.features?.[entry.key] === false ? 'Deshabilitado' : 'Habilitado'}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {selectedPlan && planPanelMode === 'edit' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>Editando plan: {planForm.id}</h3>
                                                <small>Los cambios aplican globalmente a todos los tenants de este plan.</small>
                                            </div>
                                        </div>

                                        {chunkItems(PLAN_LIMIT_KEYS, 2).map((row, rowIndex) => (
                                            <div key={`plan_limit_edit_row_${rowIndex}`} className="saas-admin-form-row">
                                                {row.map((entry) => (
                                                    <div key={`plan_limit_edit_${entry.key}`} className="saas-admin-field">
                                                        <label htmlFor={`plan-limit-${entry.key}`}>{entry.label}</label>
                                                        <input
                                                            id={`plan-limit-${entry.key}`}
                                                            type="number"
                                                            min={entry.min}
                                                            max={entry.max}
                                                            value={planForm?.[entry.key]}
                                                            onChange={(event) => setPlanForm((prev) => ({ ...prev, [entry.key]: event.target.value }))}
                                                            placeholder={entry.label}
                                                            disabled={busy}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        ))}

                                        <div className="saas-admin-related-block">
                                            <h4>Features del plan</h4>
                                            <div className="saas-admin-modules">
                                                {PLAN_FEATURE_KEYS.map((entry) => (
                                                    <label key={`plan_feature_edit_${entry.key}`} className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={planForm?.features?.[entry.key] !== false}
                                                            onChange={(event) => setPlanForm((prev) => ({
                                                                ...prev,
                                                                features: {
                                                                    ...(prev?.features || {}),
                                                                    [entry.key]: event.target.checked
                                                                }
                                                            }))}
                                                            disabled={busy}
                                                        />
                                                        <span>{entry.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button
                                                type="button"
                                                disabled={busy || !planForm?.id}
                                                onClick={() => runAction('Plan actualizado', async () => {
                                                    const payload = {};
                                                    PLAN_LIMIT_KEYS.forEach((entry) => {
                                                        const rawValue = Number(planForm?.[entry.key]);
                                                        const bounded = Number.isFinite(rawValue)
                                                            ? Math.min(entry.max, Math.max(entry.min, Math.floor(rawValue)))
                                                            : entry.min;
                                                        payload[entry.key] = bounded;
                                                    });

                                                    payload.features = {};
                                                    PLAN_FEATURE_KEYS.forEach((entry) => {
                                                        payload.features[entry.key] = planForm?.features?.[entry.key] !== false;
                                                    });

                                                    await requestJson(`/api/admin/saas/plans/${encodeURIComponent(planForm.id)}`, {
                                                        method: 'PUT',
                                                        body: payload
                                                    });

                                                    await loadPlanMatrix();
                                                    openPlanView(planForm.id);
                                                    setPlanPanelMode('view');
                                                })}

                                            >
                                                Guardar cambios
                                            </button>
                                            <button type="button" disabled={busy} onClick={cancelPlanEdit}>Cancelar</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
    );
}

export default React.memo(PlansSection);
