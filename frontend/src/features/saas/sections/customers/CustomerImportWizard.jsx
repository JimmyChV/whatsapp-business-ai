import React from 'react';
import { SaasDetailPanel, SaasDetailPanelSection } from '../../components/layout';

const WIZARD_STEPS = [
    { id: 1, label: 'Archivos' },
    { id: 2, label: 'Vista previa' },
    { id: 3, label: 'Resultado' }
];

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

const CustomerImportWizard = ({
    importElapsedSeconds,
    importErrorMessage,
    importErrorsVisible,
    importFileClientes,
    importFileDirecciones,
    importLoading,
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
    onToggleAllErrors
}) => {
    const errors = Array.isArray(importPreview?.errors) ? importPreview.errors : [];
    const previewRows = Array.isArray(importPreview?.preview) ? importPreview.preview : [];
    const canConfirm = !importLoading && Number(importPreview?.summary?.valid || 0) > 0;

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
                    <button
                        type="button"
                        className="saas-btn saas-btn--primary"
                        onClick={onConfirm}
                        disabled={!canConfirm}
                    >
                        {importLoading ? 'Importando...' : 'Confirmar importacion'}
                    </button>
                </>
            ) : null}
            {importStep === 3 ? (
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
                                <h4>Vista previa</h4>
                                <p>Revisa los conteos, errores y una muestra de clientes antes de confirmar.</p>
                            </div>
                            <div className="saas-customers-import-metrics">
                                <MetricCard label="Validos" value={Number(importPreview?.summary?.valid || 0)} tone="success" />
                                <MetricCard label="Actualizaciones" value={Number(importPreview?.summary?.updates || 0)} tone="info" />
                                <MetricCard label="Inserciones" value={Number(importPreview?.summary?.inserts || 0)} tone="success" />
                                <MetricCard label="Errores" value={Number(importPreview?.summary?.errors || 0)} tone={Number(importPreview?.summary?.errors || 0) > 0 ? 'danger' : 'neutral'} />
                                <MetricCard label="Direcciones match" value={Number(importPreview?.addressSummary?.matched || 0)} tone="info" />
                                <MetricCard label="Direcciones sin match" value={Number(importPreview?.addressSummary?.unmatched || 0)} tone="neutral" />
                            </div>

                            {errors.length > 0 ? (
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
                            ) : null}

                            <SaasDetailPanelSection title="Clientes validos de muestra" defaultOpen>
                                <div className="saas-customers-import-table-wrap saas-customers-import-table-wrap--preview">
                                    <table className="saas-data-table">
                                        <thead>
                                            <tr>
                                                <th>Nombre completo</th>
                                                <th>Telefono</th>
                                                <th>Tipo</th>
                                                <th>Fuente</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewRows.map((item, index) => (
                                                <tr key={`customers_import_preview_${index}`}>
                                                    <td>{item?.nombre_completo || '-'}</td>
                                                    <td>{item?.telefono || '-'}</td>
                                                    <td>{item?.tipo_cliente || '-'}</td>
                                                    <td>{item?.fuente || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </SaasDetailPanelSection>
                        </div>
                    ) : null}

                    {importStep === 3 ? (
                        <div className="saas-customers-import-step-card saas-customers-import-step-card--result">
                            <div className="saas-admin-empty-state saas-customers-import-success">
                                <div className="saas-customers-import-success__icon">OK</div>
                                <h4>Importacion completada</h4>
                                <p>Los clientes y sus direcciones ya fueron procesados.</p>
                            </div>
                            <div className="saas-customers-import-metrics">
                                <MetricCard label="Clientes insertados" value={Number(importResult?.customers?.inserted || 0)} tone="success" />
                                <MetricCard label="Clientes actualizados" value={Number(importResult?.customers?.updated || 0)} tone="info" />
                                <MetricCard label="Clientes con error" value={Number(importResult?.customers?.errors || 0)} tone={Number(importResult?.customers?.errors || 0) > 0 ? 'danger' : 'neutral'} />
                                <MetricCard label="Direcciones insertadas" value={Number(importResult?.addresses?.inserted || 0)} tone="success" />
                                <MetricCard label="Direcciones actualizadas" value={Number(importResult?.addresses?.updated || 0)} tone="info" />
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
