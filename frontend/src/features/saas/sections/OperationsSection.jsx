import React from 'react';
import { SaasEntityPage } from '../components/layout';

function toggleRoleInRules(prevRules, role, checked) {
    const current = new Set(
        (Array.isArray(prevRules?.allowedRoles) ? prevRules.allowedRoles : [])
            .map((entry) => String(entry || '').trim().toLowerCase())
            .filter(Boolean)
    );
    if (checked) current.add(role);
    else current.delete(role);
    return { ...prevRules, allowedRoles: Array.from(current) };
}

function OperationsSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
    tenantScopeLocked = true,
    busy = false,
    loadingAssignmentRules = false,
    loadingOperationsKpis = false,
    canManageAssignments = false,
    canManageAssignmentRules = false,
    canViewOperations = false,
    assignmentRules = {},
    assignmentRoleOptions = [],
    operationsSnapshot = {},
    activeTenantChatCandidates = [],
    tenantScopeId = '',
    setAssignmentRules,
    runAction,
    runSectionAction,
    saveAssignmentRules,
    loadTenantAssignmentRules,
    loadTenantOperationsKpis,
    ensureSectionData,
    isLoading,
    getError,
    getReloadToken,
    forceReload,
    triggerAutoAssignPreview,
    formatDateTimeLabel
    } = context;
    const lazySectionId = 'operations';
    const sectionReloadToken = typeof getReloadToken === 'function' ? getReloadToken(lazySectionId) : 0;
    const sectionLoading = typeof isLoading === 'function' && isLoading(lazySectionId);
    const sectionError = typeof getError === 'function' ? getError(lazySectionId) : '';
    const assignmentModeLabel = assignmentRules.mode === 'round_robin' ? 'Round robin' : 'Menor carga';
    const allowedRolesLabel = Array.isArray(assignmentRules.allowedRoles) && assignmentRules.allowedRoles.length > 0
        ? assignmentRules.allowedRoles.join(', ')
        : 'Sin roles configurados';
    React.useEffect(() => {
        if (tenantScopeLocked || !tenantScopeId) return;
        if (typeof ensureSectionData !== 'function') {
            Promise.all([
                loadTenantAssignmentRules?.(tenantScopeId),
                loadTenantOperationsKpis?.(tenantScopeId)
            ]).catch(() => {});
            return;
        }
        void ensureSectionData(
            lazySectionId,
            () => Promise.all([
                loadTenantAssignmentRules?.(tenantScopeId),
                loadTenantOperationsKpis?.(tenantScopeId)
            ]),
            {
                canLoad: Boolean(canViewOperations && tenantScopeId && !tenantScopeLocked),
                forceReload: sectionReloadToken > 0,
                reloadToken: sectionReloadToken,
                deps: [tenantScopeId]
            }
        );
    }, [canViewOperations, ensureSectionData, loadTenantAssignmentRules, loadTenantOperationsKpis, sectionReloadToken, tenantScopeId, tenantScopeLocked]);
    return (
        <SaasEntityPage
            id="saas_operacion"
            sectionKey="operations"
            selectedId={tenantScopeLocked ? '' : tenantScopeId || 'operations'}
            className="saas-entity-page--legacy"
            layoutClassName="saas-admin-master-detail saas-admin-master-detail--td-pattern"
            left={<aside className="saas-admin-master-pane">
                    <div className="saas-admin-pane-header">
                        <div>
                            <h3>OPERACIÓN (ASIGNACIÓN Y RENDIMIENTO)</h3>
                            <small>Reglas de enrutamiento y KPI operativo por empresa.</small>
                        </div>
                    </div>

                    {tenantScopeLocked && (
                        <div className="saas-admin-empty-state">
                            <p>Selecciona una empresa para configurar operacion.</p>
                        </div>
                    )}

                    {!tenantScopeLocked && (
                        <>
                            {sectionError ? <div className="saas-admin-empty-inline">{sectionError}</div> : null}
                            {sectionLoading ? <div className="saas-admin-empty-inline">Cargando operacion...</div> : null}
                            {canManageAssignmentRules ? (
                                <>
                                    <div className="saas-admin-form-row saas-admin-form-row--single">
                                        <label className="saas-admin-checkbox-inline">
                                            <input
                                                type="checkbox"
                                                checked={assignmentRules.enabled === true}
                                                disabled={busy || loadingAssignmentRules}
                                                onChange={(event) => setAssignmentRules((prev) => ({ ...prev, enabled: event.target.checked }))}
                                            />
                                            <span>Auto-asignacion habilitada</span>
                                        </label>
                                    </div>
                                    <div className="saas-admin-form-row">
                                        <div>
                                            <small>Modo de asignacion</small>
                                            <select
                                                value={assignmentRules.mode || 'least_load'}
                                                disabled={busy || loadingAssignmentRules}
                                                onChange={(event) => setAssignmentRules((prev) => ({ ...prev, mode: event.target.value === 'round_robin' ? 'round_robin' : 'least_load' }))}
                                            >
                                                <option value="least_load">Menor carga</option>
                                                <option value="round_robin">Round robin</option>
                                            </select>
                                        </div>
                                        <div>
                                            <small>Max chats abiertos por usuaria (0 = sin limite)</small>
                                            <input
                                                type="number"
                                                min={0}
                                                max={500}
                                                value={String(assignmentRules.maxOpenChatsPerUser ?? 0)}
                                                disabled={busy || loadingAssignmentRules}
                                                onChange={(event) => setAssignmentRules((prev) => ({ ...prev, maxOpenChatsPerUser: Number(event.target.value || 0) }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="saas-admin-related-block">
                                        <h4>Roles habilitados para recibir chats</h4>
                                        <div className="saas-admin-modules">
                                            {assignmentRoleOptions.map((role) => {
                                                const checked = Array.isArray(assignmentRules.allowedRoles) && assignmentRules.allowedRoles.includes(role);
                                                return (
                                                    <label key={`assignment_role_${role}`} className="saas-admin-module-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            disabled={busy || loadingAssignmentRules}
                                                            onChange={(event) => setAssignmentRules((prev) => toggleRoleInRules(prev, role, event.target.checked))}
                                                        />
                                                        <span>{role}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="saas-admin-related-block">
                                    <h4>Reglas de asignacion</h4>
                                    <div className="saas-admin-detail-grid">
                                        <div className="saas-admin-detail-field"><span>Auto-asignacion</span><strong>{assignmentRules.enabled === true ? 'Habilitada' : 'Deshabilitada'}</strong></div>
                                        <div className="saas-admin-detail-field"><span>Modo</span><strong>{assignmentModeLabel}</strong></div>
                                        <div className="saas-admin-detail-field"><span>Max chats abiertos</span><strong>{Number(assignmentRules.maxOpenChatsPerUser ?? 0)}</strong></div>
                                        <div className="saas-admin-detail-field"><span>Roles habilitados</span><strong>{allowedRolesLabel}</strong></div>
                                    </div>
                                </div>
                            )}
                            {(canManageAssignmentRules || canManageAssignments) ? (
                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                    {canManageAssignmentRules ? (
                                        <button
                                            type="button"
                                            disabled={busy || loadingAssignmentRules}
                                            onClick={() => {
                                                const action = async () => {
                                                    await saveAssignmentRules(tenantScopeId);
                                                    await loadTenantOperationsKpis(tenantScopeId);
                                                };
                                                return typeof runSectionAction === 'function'
                                                    ? runSectionAction('save_ops', action, { successMessage: 'Reglas de asignacion actualizadas' })
                                                    : runAction('Reglas de asignacion actualizadas', action);
                                            }}
                                        >
                                            Guardar reglas
                                        </button>
                                    ) : null}
                                    {canManageAssignments ? (
                                        <button
                                            type="button"
                                            disabled={busy || loadingOperationsKpis || activeTenantChatCandidates.length === 0}
                                            onClick={() => {
                                                const action = async () => {
                                                    await triggerAutoAssignPreview(tenantScopeId);
                                                };
                                                return typeof runSectionAction === 'function'
                                                    ? runSectionAction('autoassign', action, { successMessage: 'Auto-asignacion ejecutada' })
                                                    : runAction('Auto-asignacion ejecutada', action);
                                            }}
                                        >
                                            Auto-asignar siguiente chat
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </>
                    )}
                </aside>}

            right={<div className="saas-admin-detail-pane">
                    {tenantScopeLocked && (
                        <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                            <h4>Sin empresa activa</h4>
                            <p>Selecciona una empresa para ver metricas operativas.</p>
                        </div>
                    )}

                    {!tenantScopeLocked && (
                        <>
                            <div className="saas-admin-pane-header">
                                <div>
                                    <h3>KPI operativos (ventana actual)</h3>
                                    <small>{loadingOperationsKpis ? 'Actualizando...' : 'Datos listos para monitoreo operativo.'}</small>
                                </div>
                                <button
                                    type="button"
                                    disabled={busy || loadingOperationsKpis || !canViewOperations}
                                    onClick={() => {
                                        if (typeof forceReload === 'function') {
                                            forceReload(lazySectionId);
                                            return undefined;
                                        }
                                        const action = async () => {
                                            await loadTenantOperationsKpis(tenantScopeId);
                                        };
                                        return typeof runSectionAction === 'function'
                                            ? runSectionAction('refresh_ops_kpis', action, { successMessage: 'KPI operativos actualizados' })
                                            : runAction('KPI operativos actualizados', action);
                                    }}
                                >
                                    {sectionError ? 'Reintentar' : 'Recargar KPI'}
                                </button>
                            </div>
                            <div className="saas-admin-detail-grid">
                                <div className="saas-admin-detail-field"><span>Mensajes entrantes</span><strong>{operationsSnapshot.incomingCount}</strong></div>
                                <div className="saas-admin-detail-field"><span>Mensajes salientes</span><strong>{operationsSnapshot.outgoingCount}</strong></div>
                                <div className="saas-admin-detail-field"><span>1ra respuesta promedio</span><strong>{Math.round(operationsSnapshot.avgFirstResponseSec || 0)} s</strong></div>
                                <div className="saas-admin-detail-field"><span>Chats respondidos</span><strong>{operationsSnapshot.respondedChats}</strong></div>
                                <div className="saas-admin-detail-field"><span>Asignaciones activas</span><strong>{operationsSnapshot.activeAssignments}</strong></div>
                                <div className="saas-admin-detail-field"><span>Reasignaciones</span><strong>{operationsSnapshot.reassignedChats}</strong></div>
                                <div className="saas-admin-detail-field"><span>Sin asignar</span><strong>{operationsSnapshot.unassignedChats}</strong></div>
                            </div>
                            <div className="saas-admin-related-block">
                                <h4>Chats sin asignar (top)</h4>
                                <div className="saas-admin-related-list">
                                    {activeTenantChatCandidates.length === 0 && (
                                        <div className="saas-admin-empty-inline">No hay chats sin asignar en este momento.</div>
                                    )}
                                    {activeTenantChatCandidates.slice(0, 8).map((entry) => (
                                        <div
                                            key={`${entry.chatId || 'chat'}_${entry.scopeModuleId || 'default'}`}
                                            className="saas-admin-related-row"
                                            role="status"
                                        >
                                            <span>{entry.chatId || 'chat'}</span>
                                            <small>
                                                {entry.scopeModuleId ? `Módulo ${entry.scopeModuleId}` : 'Sin módulo'}
                                                {' | '}
                                                {entry.lastIncomingAt ? formatDateTimeLabel(entry.lastIncomingAt) : 'sin fecha'}
                                            </small>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>}
        />
    );
}

export default React.memo(OperationsSection);
