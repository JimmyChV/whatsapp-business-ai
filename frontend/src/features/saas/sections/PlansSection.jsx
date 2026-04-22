import React from 'react';
import { SaasEntityPage } from '../components/layout';

function PlansSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isPlansSection,
        busy,
        loadingPlans,
        loadPlanMatrix,
        planIds = [],
        selectedPlanId,
        planMatrix,
        openPlanView,
        selectedPlan,
        planPanelMode,
        openPlanEdit,
        PLAN_LIMIT_KEYS = [],
        PLAN_FEATURE_KEYS = [],
        planForm = {},
        setPlanForm,
        chunkItems = (items) => [items],
        runAction,
        requestJson,
        setPlanPanelMode,
        cancelPlanEdit,
        setSelectedPlanId
    } = context;

    const isEditing = planPanelMode === 'edit';
    const rows = React.useMemo(() => planIds.map((planId) => {
        const limits = planMatrix?.[planId] || {};
        return {
            id: planId,
            plan: planId,
            maxUsers: Number(limits.maxUsers || 0),
            maxWaModules: Number(limits.maxWaModules || 0),
            maxCatalogs: Number(limits.maxCatalogs || 0),
            maxQuickReplies: Number(limits.maxQuickReplies || 0),
            raw: limits
        };
    }), [planIds, planMatrix]);

    const columns = React.useMemo(() => [
        { key: 'plan', label: 'Plan', width: '28%', minWidth: '220px', sortable: true },
        { key: 'maxUsers', label: 'Usuarios', width: '18%', minWidth: '140px', sortable: true },
        { key: 'maxWaModules', label: 'Modulos WA', width: '18%', minWidth: '150px', sortable: true },
        { key: 'maxCatalogs', label: 'Catalogos', width: '18%', minWidth: '140px', sortable: true },
        { key: 'maxQuickReplies', label: 'Respuestas rapidas', width: '18%', minWidth: '180px', sortable: true }
    ], []);

    const close = React.useCallback(() => {
        if (isEditing) {
            cancelPlanEdit?.();
            return;
        }
        setSelectedPlanId?.('');
        setPlanPanelMode?.('view');
    }, [cancelPlanEdit, isEditing, setPlanPanelMode, setSelectedPlanId]);

    const renderDetail = React.useCallback(() => {
        if (!selectedPlan) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona un plan</h4>
                    <p>Define limites de usuarios, modulos y catalogos segun el plan.</p>
                </div>
            );
        }

        return (
            <>
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
        );
    }, [PLAN_FEATURE_KEYS, PLAN_LIMIT_KEYS, selectedPlan]);

    const renderForm = React.useCallback(() => (
        <>
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
                                onChange={(event) => setPlanForm?.((prev) => ({ ...prev, [entry.key]: event.target.value }))}
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
                                onChange={(event) => setPlanForm?.((prev) => ({
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
                    onClick={() => runAction?.('Plan actualizado', async () => {
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

                        await requestJson?.(`/api/admin/saas/plans/${encodeURIComponent(planForm.id)}`, {
                            method: 'PUT',
                            body: payload
                        });

                        await loadPlanMatrix?.();
                        openPlanView?.(planForm.id);
                        setPlanPanelMode?.('view');
                    })}
                >
                    Guardar cambios
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelPlanEdit}>Cancelar</button>
            </div>
        </>
    ), [
        PLAN_FEATURE_KEYS,
        PLAN_LIMIT_KEYS,
        busy,
        cancelPlanEdit,
        chunkItems,
        loadPlanMatrix,
        openPlanView,
        planForm,
        requestJson,
        runAction,
        setPlanForm,
        setPlanPanelMode
    ]);

    const detailActions = React.useMemo(() => {
        if (!selectedPlan || planPanelMode !== 'view') return null;
        return <button type="button" disabled={busy} onClick={openPlanEdit}>Editar</button>;
    }, [busy, openPlanEdit, planPanelMode, selectedPlan]);

    if (!isPlansSection) return null;

    return (
        <div className="saas-admin-grid">
            <SaasEntityPage
                id="saas_planes"
                sectionKey="plans"
                title="Planes SaaS"
                rows={rows}
                columns={columns}
                selectedId={selectedPlan?.id || selectedPlanId || ''}
                onSelect={(row) => openPlanView?.(row?.id)}
                onClose={close}
                renderDetail={renderDetail}
                renderForm={renderForm}
                mode={isEditing ? 'form' : 'detail'}
                dirty={isEditing}
                loading={loadingPlans}
                emptyText="No hay planes cargados."
                searchPlaceholder="Buscar plan por nombre o limite"
                actions={[{ key: 'reload', label: 'Recargar planes', onClick: loadPlanMatrix, disabled: busy || loadingPlans }]}
                detailTitle={planPanelMode === 'edit' ? `Editando plan: ${planForm.id}` : `Plan: ${selectedPlan?.id || ''}`}
                detailSubtitle={isEditing ? 'Los cambios aplican globalmente a todos los tenants de este plan.' : 'Control global de limites por plan.'}
                detailActions={detailActions}
            />
        </div>
    );
}

export default React.memo(PlansSection);
