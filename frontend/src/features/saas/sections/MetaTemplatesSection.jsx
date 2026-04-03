import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';

const STATUS_META = {
    approved: { label: 'Aprobado', className: 'saas-meta-template-status--approved' },
    pending: { label: 'Pendiente', className: 'saas-meta-template-status--pending' },
    rejected: { label: 'Rechazado', className: 'saas-meta-template-status--rejected' },
    paused: { label: 'Pausado', className: 'saas-meta-template-status--paused' },
    disabled: { label: 'Deshabilitado', className: 'saas-meta-template-status--paused' },
    archived: { label: 'Archivado', className: 'saas-meta-template-status--paused' },
    deleted: { label: 'Eliminado', className: 'saas-meta-template-status--paused' }
};

const CATEGORY_OPTIONS = [
    { value: 'marketing', label: 'Marketing' },
    { value: 'utility', label: 'Utilidad' },
    { value: 'authentication', label: 'Autenticacion' }
];

const LANGUAGE_OPTIONS = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
    { value: 'pt', label: 'Português' }
];

const EMPTY_CREATE_FORM = {
    moduleId: '',
    name: '',
    category: 'marketing',
    language: 'es',
    headerType: 'none',
    headerText: '',
    bodyText: '',
    footerText: '',
    buttonsText: ''
};

const toText = (value = '') => String(value || '').trim();
const toLower = (value = '') => toText(value).toLowerCase();

function resolveStatusMeta(status = '') {
    const cleanStatus = toLower(status);
    return STATUS_META[cleanStatus] || { label: cleanStatus || 'Desconocido', className: 'saas-meta-template-status--paused' };
}

function parseButtons(buttonsText = '') {
    return String(buttonsText || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((line) => {
            const [rawType, rawLabel, rawValue] = line.split('|').map((chunk) => String(chunk || '').trim());
            const type = toLower(rawType);
            const label = rawLabel || rawType;
            if (!label) return null;
            if (type === 'url') {
                const url = toText(rawValue);
                if (!url) return null;
                return { type: 'URL', text: label, url };
            }
            if (type === 'phone' || type === 'phone_number') {
                const phoneNumber = toText(rawValue);
                if (!phoneNumber) return null;
                return { type: 'PHONE_NUMBER', text: label, phone_number: phoneNumber };
            }
            return { type: 'QUICK_REPLY', text: label };
        })
        .filter(Boolean);
}

function buildTemplatePayload(form = {}) {
    const name = toText(form.name);
    const category = toLower(form.category || 'marketing') || 'marketing';
    const language = toLower(form.language || 'es') || 'es';
    const headerType = toLower(form.headerType || 'none');
    const headerText = toText(form.headerText);
    const bodyText = toText(form.bodyText);
    const footerText = toText(form.footerText);
    const buttons = parseButtons(form.buttonsText);

    if (!name) throw new Error('Nombre del template requerido.');
    if (!bodyText) throw new Error('Body del template requerido.');

    const components = [
        { type: 'BODY', text: bodyText }
    ];

    if (headerType === 'text' && headerText) {
        components.unshift({ type: 'HEADER', format: 'TEXT', text: headerText });
    }
    if (footerText) {
        components.push({ type: 'FOOTER', text: footerText });
    }
    if (buttons.length > 0) {
        components.push({ type: 'BUTTONS', buttons });
    }

    return {
        name,
        category: category.toUpperCase(),
        language,
        components
    };
}

function buildInitialForm(moduleId = '') {
    return { ...EMPTY_CREATE_FORM, moduleId: toText(moduleId) };
}

function MetaTemplatesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isMetaTemplatesSection = false,
        settingsTenantId = '',
        tenantScopeLocked = true,
        waModules = [],
        busy = false,
        canEditModules = false,
        runAction = null,
        setError = null,
        metaTemplatesController = null
    } = context;

    const { confirm, notify } = useUiFeedback();
    const [panelMode, setPanelMode] = useState('view');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [syncModuleId, setSyncModuleId] = useState('');
    const [createForm, setCreateForm] = useState(() => buildInitialForm(''));

    const moduleOptions = useMemo(() => {
        return Array.isArray(waModules)
            ? waModules
                .map((moduleItem) => ({
                    moduleId: toText(moduleItem?.moduleId).toLowerCase(),
                    label: toText(moduleItem?.name) || toText(moduleItem?.moduleId)
                }))
                .filter((entry) => entry.moduleId)
            : [];
    }, [waModules]);

    const runActionSafe = useCallback(async (label, action) => {
        if (typeof runAction === 'function') return runAction(label, action);
        if (typeof action === 'function') return action();
        return undefined;
    }, [runAction]);

    const {
        filters = { scopeModuleId: '', status: '', search: '', limit: 50, offset: 0 },
        setFilters = null,
        statusOptions = [''],
        visibleItems = [],
        total = 0,
        loadingList = false,
        loadingCreate = false,
        loadingDeleteById = {},
        loadingSync = false,
        listError = '',
        createError = '',
        deleteError = '',
        syncError = '',
        clearErrors = null,
        loadTemplates = null,
        createTemplate = null,
        removeTemplate = null,
        syncTemplates = null
    } = metaTemplatesController || {};

    useEffect(() => {
        if (!isMetaTemplatesSection) return;
        const firstModuleId = moduleOptions[0]?.moduleId || '';
        setSyncModuleId((prev) => prev || firstModuleId);
        setCreateForm((prev) => {
            if (toText(prev.moduleId)) return prev;
            return { ...prev, moduleId: firstModuleId };
        });
    }, [isMetaTemplatesSection, moduleOptions]);

    useEffect(() => {
        if (!isMetaTemplatesSection || !settingsTenantId || typeof loadTemplates !== 'function') return;
        clearErrors?.();
        loadTemplates().catch((error) => {
            const message = String(error?.message || 'No se pudieron cargar templates Meta.');
            setError?.(message);
        });
    }, [isMetaTemplatesSection, settingsTenantId, loadTemplates, clearErrors, setError]);

    useEffect(() => {
        if (!isMetaTemplatesSection) return;
        if (!selectedTemplateId && visibleItems.length > 0) {
            setSelectedTemplateId(String(visibleItems[0]?.templateId || '').trim());
        }
        if (selectedTemplateId && !visibleItems.some((entry) => String(entry?.templateId || '').trim() === selectedTemplateId)) {
            setSelectedTemplateId(String(visibleItems[0]?.templateId || '').trim());
        }
    }, [isMetaTemplatesSection, selectedTemplateId, visibleItems]);

    const selectedTemplate = useMemo(() => {
        return visibleItems.find((entry) => String(entry?.templateId || '').trim() === selectedTemplateId) || null;
    }, [selectedTemplateId, visibleItems]);

    const hasErrors = Boolean(listError || createError || deleteError || syncError);
    const templatesBusy = busy || loadingList || loadingCreate || loadingSync;
    const canWrite = Boolean(settingsTenantId) && Boolean(canEditModules);

    const reloadTemplates = useCallback(async (overrideFilters = null) => {
        if (typeof loadTemplates !== 'function') return;
        await runActionSafe('Templates Meta recargados', async () => {
            await loadTemplates(overrideFilters);
        });
    }, [loadTemplates, runActionSafe]);

    const updateFilter = useCallback(async (patch = {}) => {
        const nextFilters = {
            ...filters,
            ...(patch && typeof patch === 'object' ? patch : {})
        };
        setFilters?.(nextFilters);
        if (typeof loadTemplates === 'function') {
            await loadTemplates(nextFilters);
        }
    }, [filters, setFilters, loadTemplates]);

    const handleCreateTemplate = useCallback(async () => {
        if (!canWrite || typeof createTemplate !== 'function') return;
        const moduleId = toText(createForm.moduleId).toLowerCase();
        if (!moduleId) throw new Error('Selecciona un modulo para crear el template.');

        const templatePayload = buildTemplatePayload(createForm);
        await runActionSafe('Template Meta creado', async () => {
            await createTemplate({
                moduleId,
                templatePayload,
                reload: false
            });
            notify({ type: 'info', message: 'Template creado correctamente.' });
            setPanelMode('view');
            setCreateForm(buildInitialForm(moduleId));
            await loadTemplates?.({
                ...filters,
                scopeModuleId: filters.scopeModuleId || moduleId
            });
        });
    }, [canWrite, createTemplate, createForm, runActionSafe, notify, loadTemplates, filters]);

    const handleDeleteTemplate = useCallback(async (template = null) => {
        const templateId = toText(template?.templateId);
        if (!templateId || typeof removeTemplate !== 'function' || !canWrite) return;
        const templateName = toText(template?.templateName) || templateId;
        const ok = await confirm({
            title: 'Eliminar template',
            message: `Se eliminara \"${templateName}\" en Meta y en el registro local.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            tone: 'danger'
        });
        if (!ok) return;

        await runActionSafe('Template Meta eliminado', async () => {
            await removeTemplate({
                templateId,
                moduleId: toText(template?.moduleId),
                reload: false
            });
            notify({ type: 'warn', message: 'Template eliminado correctamente.' });
            if (selectedTemplateId === templateId) {
                setSelectedTemplateId('');
            }
            await loadTemplates?.(filters);
        });
    }, [canWrite, confirm, filters, loadTemplates, notify, removeTemplate, runActionSafe, selectedTemplateId]);

    const handleSyncTemplates = useCallback(async () => {
        if (!canWrite || typeof syncTemplates !== 'function') return;
        const moduleId = toText(syncModuleId);
        if (!moduleId) throw new Error('Selecciona un modulo para sincronizar.');

        await runActionSafe('Templates Meta sincronizados', async () => {
            const response = await syncTemplates({
                moduleId,
                reload: false
            });
            const syncedCount = Number(response?.totalSynced || 0);
            notify({ type: 'info', message: `Sincronizacion completada (${syncedCount} templates).` });
            await loadTemplates?.({
                ...filters,
                scopeModuleId: filters.scopeModuleId || moduleId
            });
        });
    }, [canWrite, filters, loadTemplates, notify, runActionSafe, syncModuleId, syncTemplates]);

    if (!isMetaTemplatesSection) {
        return null;
    }

    return (
        <section id="saas_templates" className="saas-admin-card saas-admin-card--full">
            <div className="saas-admin-master-detail">
                <aside className="saas-admin-master-pane">
                    <div className="saas-admin-pane-header">
                        <div>
                            <h3>Templates Meta</h3>
                            <small>Gestiona templates aprobados para WhatsApp Cloud API.</small>
                        </div>
                        <div className="saas-admin-list-actions saas-admin-list-actions--row">
                            <button
                                type="button"
                                disabled={templatesBusy || !settingsTenantId}
                                onClick={() => reloadTemplates().catch((error) => setError?.(String(error?.message || error || 'No se pudo recargar templates.')))}
                            >
                                Recargar
                            </button>
                            <button
                                type="button"
                                disabled={templatesBusy || !canWrite}
                                onClick={() => setPanelMode('create')}
                            >
                                Crear template
                            </button>
                        </div>
                    </div>

                    {tenantScopeLocked && (
                        <div className="saas-admin-empty-state">
                            <h4>Selecciona una empresa</h4>
                            <p>Elige una empresa para gestionar templates Meta.</p>
                        </div>
                    )}

                    {!tenantScopeLocked && (
                        <>
                            <div className="saas-admin-form-row">
                                <select
                                    value={filters.scopeModuleId || ''}
                                    disabled={templatesBusy}
                                    onChange={(event) => {
                                        const nextScopeModuleId = toLower(event.target.value);
                                        updateFilter({ scopeModuleId: nextScopeModuleId, offset: 0 }).catch((error) => {
                                            setError?.(String(error?.message || error || 'No se pudo filtrar por modulo.'));
                                        });
                                    }}
                                >
                                    <option value="">Todos los modulos</option>
                                    {moduleOptions.map((moduleItem) => (
                                        <option key={`meta_template_scope_${moduleItem.moduleId}`} value={moduleItem.moduleId}>
                                            {moduleItem.label}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={filters.status || ''}
                                    disabled={templatesBusy}
                                    onChange={(event) => {
                                        const nextStatus = toLower(event.target.value);
                                        updateFilter({ status: nextStatus, offset: 0 }).catch((error) => {
                                            setError?.(String(error?.message || error || 'No se pudo filtrar por estado.'));
                                        });
                                    }}
                                >
                                    <option value="">Todos los estados</option>
                                    {statusOptions
                                        .filter((option) => Boolean(option))
                                        .map((option) => (
                                            <option key={`meta_template_status_${option}`} value={option}>
                                                {resolveStatusMeta(option).label}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div className="saas-admin-form-row">
                                <input
                                    value={filters.search || ''}
                                    onChange={(event) => setFilters?.({ ...filters, search: event.target.value })}
                                    placeholder="Buscar template por nombre, categoria o idioma"
                                    disabled={templatesBusy}
                                />
                            </div>

                            <div className="saas-admin-form-row">
                                <select
                                    value={syncModuleId}
                                    onChange={(event) => setSyncModuleId(toLower(event.target.value))}
                                    disabled={templatesBusy || !canWrite}
                                >
                                    <option value="">Selecciona modulo para sincronizar</option>
                                    {moduleOptions.map((moduleItem) => (
                                        <option key={`meta_template_sync_${moduleItem.moduleId}`} value={moduleItem.moduleId}>
                                            {moduleItem.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    disabled={templatesBusy || !canWrite || !syncModuleId}
                                    onClick={() => handleSyncTemplates().catch((error) => {
                                        setError?.(String(error?.message || error || 'No se pudo sincronizar templates.'));
                                    })}
                                >
                                    Sincronizar
                                </button>
                            </div>

                            <div className="saas-admin-list saas-admin-list--compact">
                                {visibleItems.length === 0 && (
                                    <div className="saas-admin-empty-state">
                                        <h4>Sin templates</h4>
                                        <p>No hay templates para los filtros seleccionados.</p>
                                    </div>
                                )}
                                {visibleItems.map((template) => {
                                    const templateId = toText(template?.templateId);
                                    const statusMeta = resolveStatusMeta(template?.status);
                                    return (
                                        <button
                                            key={`meta_template_item_${templateId}`}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedTemplateId === templateId ? 'active' : ''}`.trim()}
                                            onClick={() => {
                                                setSelectedTemplateId(templateId);
                                                setPanelMode('view');
                                            }}
                                        >
                                            <strong>{toText(template?.templateName) || templateId}</strong>
                                            <small>{toText(template?.templateLanguage).toUpperCase()} | {toText(template?.category) || '-'}</small>
                                            <small>{toText(template?.moduleId) || '-'}</small>
                                            <span className={`saas-meta-template-status ${statusMeta.className}`.trim()}>{statusMeta.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </aside>

                <div className="saas-admin-detail-pane">
                    {hasErrors && (
                        <div className="saas-admin-empty-state">
                            <h4>Se detectaron errores</h4>
                            <p>{listError || createError || deleteError || syncError}</p>
                        </div>
                    )}

                    {!tenantScopeLocked && panelMode !== 'create' && !selectedTemplate && (
                        <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                            <h4>Selecciona un template</h4>
                            <p>Visualiza su estado, componentes y detalles de sincronizacion.</p>
                        </div>
                    )}

                    {!tenantScopeLocked && panelMode === 'create' && (
                        <div className="saas-admin-related-block">
                            <div className="saas-admin-pane-header">
                                <div>
                                    <h3>Crear template</h3>
                                    <small>Define componentes HEADER/BODY/FOOTER/BUTTONS para enviar a Meta.</small>
                                </div>
                            </div>

                            <div className="saas-admin-form-row">
                                <select
                                    value={createForm.moduleId}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, moduleId: toLower(event.target.value) }))}
                                    disabled={templatesBusy || !canWrite}
                                >
                                    <option value="">Selecciona modulo</option>
                                    {moduleOptions.map((moduleItem) => (
                                        <option key={`meta_template_form_module_${moduleItem.moduleId}`} value={moduleItem.moduleId}>
                                            {moduleItem.label}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    value={createForm.name}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                                    placeholder="Nombre (snake_case recomendado)"
                                    disabled={templatesBusy || !canWrite}
                                />
                            </div>

                            <div className="saas-admin-form-row">
                                <select
                                    value={createForm.category}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, category: toLower(event.target.value) }))}
                                    disabled={templatesBusy || !canWrite}
                                >
                                    {CATEGORY_OPTIONS.map((option) => (
                                        <option key={`meta_template_category_${option.value}`} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={createForm.language}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, language: toLower(event.target.value) }))}
                                    disabled={templatesBusy || !canWrite}
                                >
                                    {LANGUAGE_OPTIONS.map((option) => (
                                        <option key={`meta_template_language_${option.value}`} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="saas-admin-form-row">
                                <select
                                    value={createForm.headerType}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, headerType: toLower(event.target.value) }))}
                                    disabled={templatesBusy || !canWrite}
                                >
                                    <option value="none">Sin header</option>
                                    <option value="text">Header de texto</option>
                                </select>
                                <input
                                    value={createForm.headerText}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, headerText: event.target.value }))}
                                    placeholder="Header (opcional)"
                                    disabled={templatesBusy || !canWrite || createForm.headerType !== 'text'}
                                />
                            </div>

                            <div className="saas-admin-form-row">
                                <textarea
                                    value={createForm.bodyText}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, bodyText: event.target.value }))}
                                    placeholder="Body del template (obligatorio)"
                                    rows={4}
                                    style={{ width: '100%' }}
                                    disabled={templatesBusy || !canWrite}
                                />
                            </div>

                            <div className="saas-admin-form-row">
                                <textarea
                                    value={createForm.footerText}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, footerText: event.target.value }))}
                                    placeholder="Footer (opcional)"
                                    rows={2}
                                    style={{ width: '100%' }}
                                    disabled={templatesBusy || !canWrite}
                                />
                            </div>

                            <div className="saas-admin-form-row">
                                <textarea
                                    value={createForm.buttonsText}
                                    onChange={(event) => setCreateForm((prev) => ({ ...prev, buttonsText: event.target.value }))}
                                    placeholder={'Botones (uno por linea):\nquick_reply|Hablar con asesor\nurl|Ver web|https://...'}
                                    rows={4}
                                    style={{ width: '100%' }}
                                    disabled={templatesBusy || !canWrite}
                                />
                            </div>

                            <div className="saas-admin-form-row saas-admin-form-row--actions">
                                <button
                                    type="button"
                                    disabled={templatesBusy || !canWrite}
                                    onClick={() => handleCreateTemplate().catch((error) => {
                                        const message = String(error?.message || error || 'No se pudo crear template Meta.');
                                        notify({ type: 'error', message });
                                        setError?.(message);
                                    })}
                                >
                                    Guardar template
                                </button>
                                <button
                                    type="button"
                                    disabled={templatesBusy}
                                    onClick={() => {
                                        setPanelMode('view');
                                        setCreateForm(buildInitialForm(createForm.moduleId || moduleOptions[0]?.moduleId || ''));
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {!tenantScopeLocked && panelMode !== 'create' && selectedTemplate && (
                        <>
                            <div className="saas-admin-pane-header">
                                <div>
                                    <h3>{toText(selectedTemplate.templateName) || selectedTemplate.templateId}</h3>
                                    <small>{selectedTemplate.templateId}</small>
                                </div>
                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    <button
                                        type="button"
                                        disabled={templatesBusy || !canWrite || Boolean(loadingDeleteById?.[selectedTemplate.templateId])}
                                        onClick={() => handleDeleteTemplate(selectedTemplate).catch((error) => {
                                            const message = String(error?.message || error || 'No se pudo eliminar template Meta.');
                                            notify({ type: 'error', message });
                                            setError?.(message);
                                        })}
                                    >
                                        Eliminar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={templatesBusy || !canWrite}
                                        onClick={() => setPanelMode('create')}
                                    >
                                        Crear template
                                    </button>
                                </div>
                            </div>

                            <div className="saas-admin-detail-grid">
                                <div className="saas-admin-detail-field"><span>Estado</span><strong>{resolveStatusMeta(selectedTemplate?.status).label}</strong></div>
                                <div className="saas-admin-detail-field"><span>Modulo</span><strong>{toText(selectedTemplate?.moduleId) || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Idioma</span><strong>{toText(selectedTemplate?.templateLanguage).toUpperCase() || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Categoria</span><strong>{toText(selectedTemplate?.category) || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Quality</span><strong>{(() => {
                                    const q = selectedTemplate?.qualityScore;
                                    if (!q) return 'N/A';
                                    try {
                                        const parsed = typeof q === 'string' ? JSON.parse(q) : q;
                                        return parsed?.score || q;
                                    } catch { return q; }
                                })()}</strong></div>
                                <div className="saas-admin-detail-field"><span>Meta ID</span><strong>{toText(selectedTemplate?.metaTemplateId) || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{toText(selectedTemplate?.updatedAt) || '-'}</strong></div>
                                <div className="saas-admin-detail-field"><span>Total listados</span><strong>{Number(total || 0)}</strong></div>
                            </div>

                            {selectedTemplate?.rejectionReason && (
                                <div className="saas-admin-empty-state">
                                    <h4>Motivo de rechazo</h4>
                                    <p>{selectedTemplate.rejectionReason}</p>
                                </div>
                            )}

                            <div className="saas-admin-detail-metadata">
                                <h4>Componentes JSON</h4>
                                <pre>{JSON.stringify(selectedTemplate?.componentsJson || [], null, 2)}</pre>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

export default React.memo(MetaTemplatesSection);
