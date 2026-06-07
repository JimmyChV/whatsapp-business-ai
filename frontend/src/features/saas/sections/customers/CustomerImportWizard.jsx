import React, { useMemo } from 'react';
import { SaasDetailPanel, SaasDetailPanelSection } from '../../components/layout';

const WIZARD_STEPS = [
    { id: 1, label: 'Archivos' },
    { id: 2, label: 'Analisis' },
    { id: 3, label: 'Confirmar' },
    { id: 4, label: 'Resultado' }
];

const toArray = (value) => (Array.isArray(value) ? value : []);
const toText = (value) => String(value ?? '').trim();
const valueOrDash = (value) => {
    const text = toText(value);
    return text || '-';
};

const getSummaryValue = (summary = {}, keys = []) => {
    for (const key of keys) {
        const value = Number(summary?.[key] || 0);
        if (Number.isFinite(value) && value > 0) return value;
    }
    return Number(summary?.[keys[0]] || 0);
};

const getSampleName = (item = {}) => (
    item.nombre_completo
    || item.fullName
    || item?.erp?.name
    || item?.system?.name
    || '-'
);

const getSamplePhone = (item = {}) => (
    item.telefono
    || item.phone_e164
    || item.phone
    || '-'
);

const formatChangeValue = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
};

const MetricCard = ({ label, value, tone = 'neutral' }) => (
    <div className={`saas-customers-import-metric saas-customers-import-metric--${tone}`}>
        <span>{label}</span>
        <strong>{value}</strong>
    </div>
);

const UploadCard = ({ title, hint, file, disabled, onChange, optional = false }) => (
    <label className="saas-customers-import-upload-card">
        <span className="saas-customers-import-upload-card__title">
            {title}
            {optional ? <small>Opcional</small> : null}
        </span>
        <input
            type="file"
            accept=".csv"
            onChange={(event) => onChange(event.target.files?.[0] || null)}
            disabled={disabled}
        />
        <span className="saas-customers-import-upload-card__hint">
            {file ? file.name : hint}
        </span>
    </label>
);

const ImportProgress = ({
    importElapsedSeconds,
    importProgress,
    importProgressCounts,
    importProgressPercent,
    importPreview,
    importStatusMessage,
    shouldShowCommitProgress
}) => (
    <div className="saas-customers-import-live-status">
        <div className="saas-admin-inline-feedback">
            {importStatusMessage}
            {importElapsedSeconds > 0 ? ` Tiempo transcurrido: ${importElapsedSeconds}s.` : ''}
        </div>
        {shouldShowCommitProgress ? (
            <div className="saas-customers-import-live-progress">
                <div className="saas-customers-import-live-progress__bar">
                    <span
                        className="saas-customers-import-live-progress__fill"
                        style={{ width: `${importProgressPercent}%` }}
                    />
                </div>
                <div className="saas-customers-import-live-progress__meta">
                    <strong>{importProgressPercent}%</strong>
                    <span>
                        Clientes: {Number(importProgressCounts.customersProcessed || 0)} / {Number(importProgressCounts.validRows || importPreview?.summary?.valid || 0)}
                    </span>
                    <span>
                        Direcciones: {Number(importProgressCounts.addressesProcessed || 0)} / {Number(importProgressCounts.addressMatched || importPreview?.addressSummary?.matched || 0)}
                    </span>
                    <span>
                        Fase: {String(importProgress?.phase || 'parsing_clients')}
                    </span>
                </div>
            </div>
        ) : null}
    </div>
);

const Stepper = ({ currentStep }) => (
    <div className="saas-customers-import-stepper">
        {WIZARD_STEPS.map((step) => (
            <div
                key={`customers_import_step_${step.id}`}
                className={`saas-customers-import-stepper__item${currentStep === step.id ? ' is-current' : ''}${currentStep > step.id ? ' is-complete' : ''}`}
            >
                <span>{step.id}</span>
                <strong>{step.label}</strong>
            </div>
        ))}
    </div>
);

const SampleRowsTable = ({ rows, emptyLabel = 'Sin registros en esta categoria.' }) => (
    <div className="saas-customers-import-table-wrap saas-customers-import-table-wrap--preview">
        <table className="saas-data-table">
            <thead>
                <tr>
                    <th>ERP ID</th>
                    <th>Cliente</th>
                    <th>Telefono</th>
                    <th>Tipo</th>
                    <th>Fuente</th>
                </tr>
            </thead>
            <tbody>
                {rows.length > 0 ? rows.map((item, index) => (
                    <tr key={`customers_import_sample_${item?.erp_id || index}`}>
                        <td>{valueOrDash(item?.erp_id)}</td>
                        <td>{getSampleName(item)}</td>
                        <td>{getSamplePhone(item)}</td>
                        <td>{valueOrDash(item?.tipo_cliente)}</td>
                        <td>{valueOrDash(item?.fuente)}</td>
                    </tr>
                )) : (
                    <tr>
                        <td colSpan={5}>{emptyLabel}</td>
                    </tr>
                )}
            </tbody>
        </table>
    </div>
);

const ChangesTable = ({ rows }) => {
    const changeRows = rows.flatMap((item, itemIndex) => (
        toArray(item?.changes).map((change, changeIndex) => ({
            key: `${item?.erp_id || itemIndex}_${change?.field || changeIndex}`,
            erpId: item?.erp_id,
            customer: getSampleName(item),
            field: change?.label || change?.field || '-',
            current: change?.current,
            incoming: change?.incoming
        }))
    ));

    return (
        <div className="saas-customers-import-table-wrap saas-customers-import-table-wrap--preview">
            <table className="saas-data-table">
                <thead>
                    <tr>
                        <th>Cliente</th>
                        <th>Campo</th>
                        <th>Actual</th>
                        <th>ERP</th>
                    </tr>
                </thead>
                <tbody>
                    {changeRows.length > 0 ? changeRows.map((item) => (
                        <tr key={`customers_import_change_${item.key}`}>
                            <td>
                                <strong>{item.customer}</strong>
                                <small>{valueOrDash(item.erpId)}</small>
                            </td>
                            <td>{item.field}</td>
                            <td>{formatChangeValue(item.current)}</td>
                            <td>{formatChangeValue(item.incoming)}</td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan={4}>No hay diferencias para mostrar en la muestra.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

const LinkableDecisionList = ({ rows, decisions, onSetLinkDecision }) => (
    <div className="saas-customers-import-linkable-list">
        {rows.length > 0 ? rows.map((item, index) => {
            const erpId = toText(item?.erp_id || item?.erp?.erpId);
            const systemCustomerId = toText(item?.system?.customerId || item?.customerId);
            const decision = decisions?.[erpId] || {
                action: item?.recommendedAction || 'link',
                customerId: systemCustomerId
            };
            const selectedAction = toText(decision.action) || 'link';

            return (
                <article className="saas-customers-import-linkable-card" key={`customers_import_linkable_${erpId || index}`}>
                    <div className="saas-customers-import-linkable-card__body">
                        <div>
                            <span>ERP</span>
                            <strong>{valueOrDash(item?.erp?.name)}</strong>
                            <small>{valueOrDash(erpId)} - {valueOrDash(item?.phone_e164)}</small>
                        </div>
                        <div>
                            <span>Sistema</span>
                            <strong>{valueOrDash(item?.system?.name)}</strong>
                            <small>{valueOrDash(systemCustomerId)}</small>
                        </div>
                    </div>
                    <div className="saas-customers-import-linkable-card__actions">
                        <label>
                            <input
                                type="radio"
                                name={`link_decision_${erpId}`}
                                checked={selectedAction === 'link'}
                                onChange={() => onSetLinkDecision?.(erpId, { action: 'link', customerId: systemCustomerId })}
                            />
                            Vincular recomendado
                        </label>
                        <label>
                            <input
                                type="radio"
                                name={`link_decision_${erpId}`}
                                checked={selectedAction === 'separate'}
                                onChange={() => onSetLinkDecision?.(erpId, { action: 'separate', customerId: '' })}
                            />
                            Crear separado
                        </label>
                        <label>
                            <input
                                type="radio"
                                name={`link_decision_${erpId}`}
                                checked={selectedAction === 'skip'}
                                onChange={() => onSetLinkDecision?.(erpId, { action: 'skip', customerId: '' })}
                            />
                            Omitir
                        </label>
                    </div>
                </article>
            );
        }) : (
            <div className="saas-admin-empty-state saas-customers-import-empty">
                <p>No hay clientes vinculables en este analisis.</p>
            </div>
        )}
    </div>
);

const ErrorsTable = ({ errors, importErrorsVisible, showAllImportErrors, onToggleAllErrors }) => (
    <SaasDetailPanelSection title={`Errores detectados (${errors.length})`} defaultOpen>
        <div className="saas-customers-import-table-wrap saas-customers-import-table-wrap--compact">
            <table className="saas-data-table">
                <thead>
                    <tr>
                        <th>Fila</th>
                        <th>ERP ID</th>
                        <th>Campo</th>
                        <th>Motivo</th>
                    </tr>
                </thead>
                <tbody>
                    {importErrorsVisible.map((item, index) => (
                        <tr key={`customers_import_error_${index}`}>
                            <td>{item?.row || '-'}</td>
                            <td>{item?.erp_id || '-'}</td>
                            <td>{item?.field || '-'}</td>
                            <td>{item?.message || '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        {errors.length > 10 ? (
            <button type="button" className="saas-btn saas-btn--secondary" onClick={onToggleAllErrors}>
                {showAllImportErrors ? 'Mostrar menos errores' : `Ver todos los errores (${errors.length})`}
            </button>
        ) : null}
    </SaasDetailPanelSection>
);

const DecisionSummary = ({ rows, decisions }) => {
    const counts = toArray(rows).reduce((acc, item = {}) => {
        const erpId = toText(item.erp_id || item?.erp?.erpId);
        const action = toText(decisions?.[erpId]?.action || item.recommendedAction || 'link') || 'link';
        acc[action] = Number(acc[action] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="saas-customers-import-decision-summary">
            <span>Vincular: <strong>{Number(counts.link || 0)}</strong></span>
            <span>Crear separados: <strong>{Number(counts.separate || 0)}</strong></span>
            <span>Omitir: <strong>{Number(counts.skip || 0)}</strong></span>
        </div>
    );
};

const CustomerImportWizard = ({
    importElapsedSeconds,
    importErrorMessage,
    importErrorsVisible,
    importFileClientes,
    importFileDirecciones,
    importLoading,
    importLinkDecisions,
    importModuleId,
    importPreview,
    importProgress,
    importProgressCounts,
    importProgressPercent,
    importResult,
    importStatusMessage,
    importStep,
    outreachModuleOptions,
    shouldShowCommitProgress,
    showAllImportErrors,
    onAnalyze,
    onCancel,
    onClose,
    onConfirm,
    onDownloadErrors,
    onRequestClose,
    onSetFileClientes,
    onSetFileDirecciones,
    onSetImportModuleId,
    onSetImportStep,
    onSetLinkDecision,
    onToggleAllErrors
}) => {
    const summary = importPreview?.summary || {};
    const addressSummary = importPreview?.addressSummary || {};
    const samples = importPreview?.samples || {};
    const errors = toArray(importPreview?.errors);
    const previewRows = toArray(importPreview?.preview);
    const newRows = toArray(samples.new);
    const updatedRows = toArray(samples.updated);
    const unchangedRows = toArray(samples.unchanged);
    const linkableRows = toArray(samples.linkable);
    const canContinue = !importLoading && Number(summary.valid || 0) > 0;
    const canConfirm = !importLoading && Number(summary.valid || 0) > 0;
    const linkDecisionSummary = useMemo(
        () => ({ rows: linkableRows, decisions: importLinkDecisions || {} }),
        [importLinkDecisions, linkableRows]
    );

    const actions = (
        <div className="saas-admin-list-actions saas-admin-list-actions--row">
            {importStep === 1 ? (
                <>
                    <button type="button" className="saas-btn saas-btn--secondary saas-btn-cancel" onClick={onRequestClose} disabled={importLoading}>
                        Cancelar
                    </button>
                    <button type="button" className="saas-btn saas-btn--primary" onClick={onAnalyze} disabled={importLoading || !importFileClientes}>
                        {importLoading ? 'Analizando...' : 'Analizar'}
                    </button>
                </>
            ) : null}
            {importStep === 2 ? (
                <>
                    <button type="button" className="saas-btn saas-btn--secondary" onClick={() => onSetImportStep(1)} disabled={importLoading}>
                        Volver
                    </button>
                    <button type="button" className="saas-btn saas-btn--primary" onClick={() => onSetImportStep(3)} disabled={!canContinue}>
                        Continuar
                    </button>
                </>
            ) : null}
            {importStep === 3 ? (
                <>
                    <button type="button" className="saas-btn saas-btn--secondary" onClick={() => onSetImportStep(2)} disabled={importLoading}>
                        Volver
                    </button>
                    {importLoading ? (
                        <button
                            type="button"
                            className="saas-btn saas-btn--secondary saas-btn-cancel"
                            onClick={onCancel}
                            disabled={Boolean(importProgress?.cancelRequested)}
                        >
                            {importProgress?.cancelRequested ? 'Cancelando...' : 'Cancelar importacion'}
                        </button>
                    ) : null}
                    <button type="button" className="saas-btn saas-btn--primary" onClick={onConfirm} disabled={!canConfirm}>
                        {importLoading ? 'Importando...' : 'Importar ahora'}
                    </button>
                </>
            ) : null}
            {importStep === 4 ? (
                <>
                    {errors.length > 0 ? (
                        <button type="button" className="saas-btn saas-btn--secondary" onClick={onDownloadErrors}>
                            Descargar reporte de errores CSV
                        </button>
                    ) : null}
                    <button type="button" className="saas-btn saas-btn--primary" onClick={onClose}>
                        Cerrar
                    </button>
                </>
            ) : null}
        </div>
    );

    return (
        <div className="saas-template-builder-modal-overlay" onClick={() => { if (!importLoading) onRequestClose(); }}>
            <div className="saas-template-builder-modal-shell saas-customers-import-shell" onClick={(event) => event.stopPropagation()}>
                <SaasDetailPanel
                    title="Importar clientes desde AppSheet"
                    subtitle="Carga la exportacion de AppSheet y valida todo antes de escribir en la base."
                    className="saas-template-builder-modal-panel saas-customers-import-panel saas-customers-import-wizard"
                    bodyClassName="saas-template-builder-modal-panel__body saas-customers-import-panel__body"
                    actions={actions}
                >
                    <Stepper currentStep={importStep} />

                    {importLoading ? (
                        <ImportProgress
                            importElapsedSeconds={importElapsedSeconds}
                            importProgress={importProgress}
                            importProgressCounts={importProgressCounts}
                            importProgressPercent={importProgressPercent}
                            importPreview={importPreview}
                            importStatusMessage={importStatusMessage}
                            shouldShowCommitProgress={shouldShowCommitProgress}
                        />
                    ) : null}

                    {importErrorMessage ? (
                        <div className="saas-admin-inline-feedback error">
                            {importErrorMessage}
                        </div>
                    ) : null}

                    {importStep === 1 ? (
                        <div className="saas-customers-import-step-card">
                            <div className="saas-customers-import-card-header">
                                <h4>Selecciona los archivos</h4>
                                <p>Primero analizamos la informacion y luego decides si confirmas la importacion.</p>
                            </div>
                            <div className="saas-customers-import-upload-grid">
                                <UploadCard
                                    title="Exportacion AppSheet"
                                    hint="CSV principal de clientes."
                                    file={importFileClientes}
                                    disabled={importLoading}
                                    onChange={onSetFileClientes}
                                />
                                <UploadCard
                                    title="TbDirecciones.csv"
                                    hint="Usalo si tambien quieres cruzar direcciones."
                                    file={importFileDirecciones}
                                    disabled={importLoading}
                                    onChange={onSetFileDirecciones}
                                    optional
                                />
                            </div>
                            <div className="saas-customers-import-module-card">
                                <label className="saas-customers-outreach-toolbar__field">
                                    <span>Modulo asociado</span>
                                    <select value={importModuleId} onChange={(event) => onSetImportModuleId(String(event.target.value || '').trim())} disabled={importLoading}>
                                        <option value="">Sin modulo</option>
                                        {outreachModuleOptions.map((moduleItem) => (
                                            <option key={`customers_import_module_${moduleItem.moduleId}`} value={moduleItem.moduleId}>
                                                {moduleItem.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    ) : null}

                    {importStep === 2 ? (
                        <div className="saas-customers-import-step-card">
                            <div className="saas-customers-import-card-header">
                                <h4>Analisis delta</h4>
                                <p>Separamos clientes nuevos, cambios reales, registros sin cambios, conflictos vinculables y errores.</p>
                            </div>
                            <div className="saas-customers-import-metrics">
                                <MetricCard label="Nuevos" value={getSummaryValue(summary, ['new', 'inserts'])} tone="success" />
                                <MetricCard label="Con cambios" value={getSummaryValue(summary, ['updated', 'updates'])} tone="info" />
                                <MetricCard label="Sin cambios" value={Number(summary.unchanged || 0)} tone="neutral" />
                                <MetricCard label="Vinculables" value={Number(summary.linkable || 0)} tone={Number(summary.linkable || 0) > 0 ? 'warning' : 'neutral'} />
                                <MetricCard label="Errores" value={Number(summary.errors || 0)} tone={Number(summary.errors || 0) > 0 ? 'danger' : 'neutral'} />
                                <MetricCard label="Direcciones match" value={Number(addressSummary.matched || 0)} tone="info" />
                            </div>
                            <div className="saas-customers-import-metrics saas-customers-import-metrics--compact">
                                <MetricCard label="Direcciones nuevas" value={Number(addressSummary.new || 0)} tone="success" />
                                <MetricCard label="Direcciones con cambios" value={Number(addressSummary.updated || 0)} tone="info" />
                                <MetricCard label="Direcciones sin cambios" value={Number(addressSummary.unchanged || 0)} tone="neutral" />
                                <MetricCard label="Direcciones sin match" value={Number(addressSummary.unmatched || 0)} tone="neutral" />
                            </div>

                            {errors.length > 0 ? (
                                <ErrorsTable
                                    errors={errors}
                                    importErrorsVisible={importErrorsVisible}
                                    showAllImportErrors={showAllImportErrors}
                                    onToggleAllErrors={onToggleAllErrors}
                                />
                            ) : null}

                            <SaasDetailPanelSection title={`Vinculables por telefono (${linkableRows.length})`} defaultOpen={linkableRows.length > 0}>
                                <p className="saas-customers-import-section-note">
                                    Cuando un cliente ERP coincide con un cliente existente sin ERP ID, recomendamos vincularlo para evitar duplicados.
                                </p>
                                <LinkableDecisionList
                                    rows={linkableRows}
                                    decisions={importLinkDecisions}
                                    onSetLinkDecision={onSetLinkDecision}
                                />
                            </SaasDetailPanelSection>

                            <SaasDetailPanelSection title={`Con cambios (${Number(summary.updated || summary.updates || 0)})`} defaultOpen>
                                <ChangesTable rows={updatedRows} />
                            </SaasDetailPanelSection>

                            <SaasDetailPanelSection title={`Nuevos (${Number(summary.new || summary.inserts || 0)})`}>
                                <SampleRowsTable rows={newRows} />
                            </SaasDetailPanelSection>

                            <SaasDetailPanelSection title={`Sin cambios (${Number(summary.unchanged || 0)})`}>
                                <SampleRowsTable rows={unchangedRows} />
                            </SaasDetailPanelSection>

                            <SaasDetailPanelSection title="Muestra general validada">
                                <SampleRowsTable rows={previewRows} />
                            </SaasDetailPanelSection>
                        </div>
                    ) : null}

                    {importStep === 3 ? (
                        <div className="saas-customers-import-step-card">
                            <div className="saas-customers-import-card-header">
                                <h4>Confirmar importacion</h4>
                                <p>Este commit aplicara solo nuevos, cambios reales y las decisiones de vinculacion seleccionadas.</p>
                            </div>
                            <div className="saas-customers-import-metrics">
                                <MetricCard label="Se insertaran" value={getSummaryValue(summary, ['new', 'inserts'])} tone="success" />
                                <MetricCard label="Se actualizaran" value={getSummaryValue(summary, ['updated', 'updates'])} tone="info" />
                                <MetricCard label="Se omitiran sin cambios" value={Number(summary.unchanged || 0)} tone="neutral" />
                                <MetricCard label="Errores no importables" value={Number(summary.errors || 0)} tone={Number(summary.errors || 0) > 0 ? 'danger' : 'neutral'} />
                            </div>
                            <SaasDetailPanelSection title="Decisiones para vinculables" defaultOpen={linkableRows.length > 0}>
                                <DecisionSummary rows={linkDecisionSummary.rows} decisions={linkDecisionSummary.decisions} />
                            </SaasDetailPanelSection>
                            <SaasDetailPanelSection title="Resumen de direcciones">
                                <div className="saas-customers-import-decision-summary">
                                    <span>Nuevas: <strong>{Number(addressSummary.new || 0)}</strong></span>
                                    <span>Con cambios: <strong>{Number(addressSummary.updated || 0)}</strong></span>
                                    <span>Sin cambios: <strong>{Number(addressSummary.unchanged || 0)}</strong></span>
                                    <span>Sin match: <strong>{Number(addressSummary.unmatched || 0)}</strong></span>
                                </div>
                            </SaasDetailPanelSection>
                        </div>
                    ) : null}

                    {importStep === 4 ? (
                        <div className="saas-customers-import-step-card saas-customers-import-step-card--result">
                            <div className="saas-admin-empty-state saas-customers-import-success">
                                <div className="saas-customers-import-success__icon">OK</div>
                                <h4>Importacion completada</h4>
                                <p>Los clientes y sus direcciones ya fueron procesados.</p>
                            </div>
                            <div className="saas-customers-import-metrics">
                                <MetricCard label="Clientes insertados" value={Number(importResult?.customers?.inserted || 0)} tone="success" />
                                <MetricCard label="Clientes actualizados" value={Number(importResult?.customers?.updated || 0)} tone="info" />
                                <MetricCard label="Clientes vinculados" value={Number(importResult?.customers?.linked || 0)} tone="success" />
                                <MetricCard label="Clientes omitidos" value={Number(importResult?.customers?.skipped || 0)} tone="neutral" />
                                <MetricCard label="Clientes con error" value={Number(importResult?.customers?.errors || 0)} tone={Number(importResult?.customers?.errors || 0) > 0 ? 'danger' : 'neutral'} />
                                <MetricCard label="Direcciones insertadas" value={Number(importResult?.addresses?.inserted || 0)} tone="success" />
                                <MetricCard label="Direcciones actualizadas" value={Number(importResult?.addresses?.updated || 0)} tone="info" />
                                <MetricCard label="Direcciones omitidas" value={Number(importResult?.addresses?.skipped || 0)} tone="neutral" />
                                <MetricCard label="Direcciones sin match" value={Number(importResult?.addresses?.unmatched || 0)} tone="neutral" />
                            </div>
                        </div>
                    ) : null}
                </SaasDetailPanel>
            </div>
        </div>
    );
};

export default React.memo(CustomerImportWizard);
