import React from 'react';
import { SaasEntityPage } from '../components/layout';
import { isTemplateAllowedInIndividual } from '../helpers/templateUseCase.helpers';
import { normalizeQuickReplyItem, normalizeQuickReplyLibraryItem } from '../helpers';
import { fetchQuickReplyItems, fetchQuickReplyLibraries } from '../services';

const EVENT_OPTIONS = [
    { value: 'quote_accepted', label: 'Pedido aceptado' },
    { value: 'order_programmed', label: 'Pedido programado' },
    { value: 'order_attended', label: 'Pedido atendido' },
    { value: 'order_expired', label: 'Pedido expirado' },
    { value: 'order_lost', label: 'Pedido perdido' },
    { value: 'order_sold', label: 'Pedido vendido' }
];

const DELAY_UNIT_OPTIONS = [
    { value: 'seconds', label: 'Segundos' },
    { value: 'minutes', label: 'Minutos' },
    { value: 'hours', label: 'Horas' },
    { value: 'days', label: 'Días' },
    { value: 'weeks', label: 'Semanas' },
    { value: 'months', label: 'Meses' }
];

const EMPTY_FORM = {
    eventKey: 'quote_accepted',
    moduleId: '',
    templateName: '',
    quickReplyCode: '',
    templateLanguage: 'es',
    delayValue: 0,
    delayUnit: 'minutes',
    isActive: true
};

function text(value = '') {
    return String(value ?? '').trim();
}

function eventLabel(value = '') {
    return EVENT_OPTIONS.find((item) => item.value === value)?.label || text(value) || '-';
}

function normalizeDelayUnit(value = '') {
    const unit = text(value).toLowerCase();
    return DELAY_UNIT_OPTIONS.some((item) => item.value === unit) ? unit : 'minutes';
}

function normalizeDelayValue(value = 0) {
    const parsed = Number.parseInt(String(value ?? 0), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatDelay(rule = {}) {
    const value = normalizeDelayValue(rule.delayValue ?? rule.delay_value ?? rule.delayMinutes ?? rule.delay_minutes);
    const unit = normalizeDelayUnit(rule.delayUnit || rule.delay_unit || 'minutes');
    if (!value) return 'Inmediato';
    const label = DELAY_UNIT_OPTIONS.find((item) => item.value === unit)?.label || 'Minutos';
    return `${value} ${label.toLowerCase()}`;
}

function buildForm(rule = null) {
    if (!rule) return { ...EMPTY_FORM };
    return {
        eventKey: text(rule.eventKey) || EMPTY_FORM.eventKey,
        moduleId: text(rule.moduleId),
        templateName: text(rule.templateName),
        quickReplyCode: text(rule.quickReplyCode || rule.quick_reply_code),
        templateLanguage: text(rule.templateLanguage) || 'es',
        delayValue: normalizeDelayValue(rule.delayValue ?? rule.delay_value ?? rule.delayMinutes ?? rule.delay_minutes),
        delayUnit: normalizeDelayUnit(rule.delayUnit || rule.delay_unit || 'minutes'),
        isActive: rule.isActive !== false
    };
}

function AutomationSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        selectedSectionId,
        settingsTenantId,
        tenantScopeLocked,
        busy,
        requestJson,
        runAction,
        runSectionAction,
        waModules = [],
        metaTemplatesController = null,
        automationRules = [],
        loadingAutomations = false,
        loadAutomations = null,
        createAutomationRule = null,
        updateAutomationRule = null,
        deleteAutomationRule = null,
        quickReplyItems: contextQuickReplyItems = null,
        quickReplyLibraries: contextQuickReplyLibraries = null,
        loadingQuickReplies: contextLoadingQuickReplies = false,
        canManageAutomations = false,
        canViewAutomations = canManageAutomations,
        ensureSectionData = null,
        isLoading = null,
        getError = null,
        getReloadToken = null,
        forceReload = null,
        formatDateTimeLabel = (value) => value || '-'
    } = context;

    const isSection = selectedSectionId === 'saas_automations';
    const lazySectionId = 'automations';
    const sectionReloadToken = typeof getReloadToken === 'function' ? getReloadToken(lazySectionId) : 0;
    const sectionLoading = (typeof isLoading === 'function' && isLoading(lazySectionId)) || loadingAutomations;
    const sectionError = typeof getError === 'function' ? getError(lazySectionId) : '';

    const [selectedRuleId, setSelectedRuleId] = React.useState('');
    const [panelMode, setPanelMode] = React.useState('view');
    const [form, setForm] = React.useState(() => ({ ...EMPTY_FORM }));
    const [localQuickReplyItems, setLocalQuickReplyItems] = React.useState([]);
    const [localQuickReplyLibraries, setLocalQuickReplyLibraries] = React.useState([]);
    const [localQuickRepliesLoading, setLocalQuickRepliesLoading] = React.useState(false);
    const hasQuickReplyContext = Array.isArray(contextQuickReplyItems) || Array.isArray(contextQuickReplyLibraries);
    const quickReplyItems = React.useMemo(() => {
        if (Array.isArray(contextQuickReplyItems)) return contextQuickReplyItems;
        return localQuickReplyItems;
    }, [contextQuickReplyItems, localQuickReplyItems]);
    const quickReplyLibraries = React.useMemo(() => {
        if (Array.isArray(contextQuickReplyLibraries)) return contextQuickReplyLibraries;
        return localQuickReplyLibraries;
    }, [contextQuickReplyLibraries, localQuickReplyLibraries]);
    const loadingQuickReplies = hasQuickReplyContext ? contextLoadingQuickReplies : localQuickRepliesLoading;

    const moduleOptions = React.useMemo(() => (Array.isArray(waModules) ? waModules : [])
        .map((item) => ({
            moduleId: text(item?.moduleId || item?.id),
            label: text(item?.name || item?.moduleName || item?.moduleId || item?.id)
        }))
        .filter((item) => item.moduleId && item.label), [waModules]);

    const moduleLabelMap = React.useMemo(() => new Map(moduleOptions.map((item) => [item.moduleId, item.label])), [moduleOptions]);

    const templateItems = React.useMemo(() => {
        const items = Array.isArray(metaTemplatesController?.items) ? metaTemplatesController.items : [];
        return items
            .filter((item) => String(item?.status || '').trim().toLowerCase() === 'approved')
            .filter((item) => isTemplateAllowedInIndividual(item?.useCase))
            .map((item) => ({
                templateName: text(item?.templateName),
                templateLanguage: text(item?.templateLanguage || item?.language || 'es') || 'es',
                moduleId: text(item?.moduleId || item?.scopeModuleId),
                label: `${text(item?.templateName)} (${text(item?.templateLanguage || item?.language || 'es').toUpperCase() || 'ES'})`
            }))
            .filter((item) => item.templateName)
            .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
    }, [metaTemplatesController?.items]);

    React.useEffect(() => {
        if (!isSection) return;
        if (typeof ensureSectionData !== 'function') {
            if (typeof loadAutomations === 'function' && canViewAutomations && settingsTenantId && !tenantScopeLocked) {
                loadAutomations().catch(() => {});
            }
            return;
        }
        void ensureSectionData(
            lazySectionId,
            () => loadAutomations?.(),
            {
                canLoad: Boolean(canViewAutomations && settingsTenantId && !tenantScopeLocked && typeof loadAutomations === 'function'),
                forceReload: sectionReloadToken > 0,
                reloadToken: sectionReloadToken,
                deps: [settingsTenantId]
            }
        );
    }, [canViewAutomations, ensureSectionData, isSection, loadAutomations, sectionReloadToken, settingsTenantId, tenantScopeLocked]);

    React.useEffect(() => {
        if (!isSection || !settingsTenantId || typeof metaTemplatesController?.loadTemplates !== 'function') return;
        if (Array.isArray(metaTemplatesController?.items) && metaTemplatesController.items.length > 0) return;
        metaTemplatesController.loadTemplates().catch(() => {});
    }, [isSection, metaTemplatesController, settingsTenantId]);

    React.useEffect(() => {
        if (hasQuickReplyContext) return;
        if (!isSection || !settingsTenantId || typeof requestJson !== 'function') {
            setLocalQuickReplyItems([]);
            setLocalQuickReplyLibraries([]);
            return;
        }
        let cancelled = false;
        setLocalQuickRepliesLoading(true);
        Promise.all([
            fetchQuickReplyItems(requestJson, settingsTenantId, { includeInactive: false }),
            fetchQuickReplyLibraries(requestJson, settingsTenantId, { includeInactive: false })
        ])
            .then(([itemsPayload, librariesPayload]) => {
                if (cancelled) return;
                const items = (Array.isArray(itemsPayload?.items) ? itemsPayload.items : [])
                    .map((entry) => normalizeQuickReplyItem(entry))
                    .filter(Boolean)
                    .filter((item) => item.isActive !== false)
                    .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }));
                const libraries = (Array.isArray(librariesPayload?.items) ? librariesPayload.items : [])
                    .map((entry) => normalizeQuickReplyLibraryItem(entry))
                    .filter(Boolean)
                    .filter((library) => library.isActive !== false);
                setLocalQuickReplyItems(items);
                setLocalQuickReplyLibraries(libraries);
            })
            .catch(() => {
                if (!cancelled) {
                    setLocalQuickReplyItems([]);
                    setLocalQuickReplyLibraries([]);
                }
            })
            .finally(() => {
                if (!cancelled) setLocalQuickRepliesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [hasQuickReplyContext, isSection, requestJson, settingsTenantId]);

    const selectedRule = React.useMemo(
        () => automationRules.find((item) => text(item?.ruleId) === selectedRuleId) || null,
        [automationRules, selectedRuleId]
    );

    const rows = React.useMemo(() => automationRules.map((rule) => ({
        id: text(rule.ruleId),
        event: eventLabel(rule.eventKey),
        module: moduleLabelMap.get(text(rule.moduleId)) || (text(rule.moduleId) || 'Todos los modulos'),
        template: text(rule.templateName) || 'Sin template',
        delay: formatDelay(rule),
        status: rule.isActive === false ? 'Inactiva' : 'Activa',
        updatedAt: formatDateTimeLabel(rule.updatedAt),
        raw: rule
    })), [automationRules, formatDateTimeLabel, moduleLabelMap]);

    const columns = React.useMemo(() => [
        { key: 'event', label: 'Evento', width: '22%', minWidth: '180px', sortable: true },
        { key: 'module', label: 'Modulo', width: '22%', minWidth: '180px', sortable: true },
        { key: 'template', label: 'Template', width: '26%', minWidth: '220px', sortable: true },
        { key: 'delay', label: 'Delay', width: '12%', minWidth: '110px', sortable: true },
        { key: 'status', label: 'Estado', width: '12%', minWidth: '120px', sortable: true },
        { key: 'updatedAt', label: 'Actualizado', width: '18%', minWidth: '160px', sortable: true, hidden: true }
    ], []);

    const filters = React.useMemo(() => [
        {
            key: 'event',
            label: 'Evento',
            type: 'select',
            options: EVENT_OPTIONS.map((item) => ({ value: item.label, label: item.label }))
        },
        {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'Activa', label: 'Activa' },
                { value: 'Inactiva', label: 'Inactiva' }
            ]
        }
    ], []);

    const openCreate = React.useCallback(() => {
        if (!canManageAutomations) return;
        setForm({ ...EMPTY_FORM, moduleId: moduleOptions[0]?.moduleId || '' });
        setSelectedRuleId('__new_automation__');
        setPanelMode('create');
    }, [canManageAutomations, moduleOptions]);

    const openView = React.useCallback((ruleId) => {
        const cleanRuleId = text(ruleId);
        setSelectedRuleId(cleanRuleId);
        setPanelMode('view');
    }, []);

    const openEdit = React.useCallback(() => {
        if (!canManageAutomations) return;
        setForm(buildForm(selectedRule));
        setPanelMode('edit');
    }, [canManageAutomations, selectedRule]);

    const close = React.useCallback(() => {
        if (panelMode === 'create' || panelMode === 'edit') {
            setPanelMode('view');
            if (panelMode === 'create') setSelectedRuleId('');
            return;
        }
        setSelectedRuleId('');
    }, [panelMode]);

    const saveRule = React.useCallback(() => {
        const label = panelMode === 'create' ? 'Automatizacion creada' : 'Automatizacion actualizada';
        const action = async () => {
            if (!canManageAutomations) throw new Error('No tienes permiso para modificar automatizaciones.');
            const payload = {
                eventKey: form.eventKey,
                moduleId: form.moduleId || null,
                templateName: form.templateName,
                quickReplyCode: form.quickReplyCode || null,
                templateLanguage: form.templateLanguage || 'es',
                delayValue: normalizeDelayValue(form.delayValue),
                delayUnit: normalizeDelayUnit(form.delayUnit),
                isActive: form.isActive !== false
            };
            if (!payload.eventKey) throw new Error('Selecciona un evento.');
            if (panelMode === 'create') {
                const item = await createAutomationRule(payload);
                setSelectedRuleId(text(item?.ruleId));
            } else if (selectedRule?.ruleId) {
                await updateAutomationRule(selectedRule.ruleId, payload);
            }
            setPanelMode('view');
        };
        return typeof runSectionAction === 'function'
            ? runSectionAction('save_auto', action, { successMessage: label })
            : runAction?.(label, action);
    }, [canManageAutomations, createAutomationRule, form, panelMode, runAction, runSectionAction, selectedRule, updateAutomationRule]);

    const removeRule = React.useCallback(() => {
        if (!selectedRule?.ruleId || !canManageAutomations) return;
        const action = async () => {
            await deleteAutomationRule(selectedRule.ruleId);
            setSelectedRuleId('');
            setPanelMode('view');
        };
        return typeof runSectionAction === 'function'
            ? runSectionAction('delete_auto', action, { successMessage: 'Automatizacion eliminada' })
            : runAction?.('Automatizacion eliminada', action);
    }, [canManageAutomations, deleteAutomationRule, runAction, runSectionAction, selectedRule]);

    const selectedTemplate = React.useMemo(
        () => templateItems.find((item) => item.templateName === form.templateName) || null,
        [form.templateName, templateItems]
    );

    const quickReplyLibraryMap = React.useMemo(() => new Map(
        quickReplyLibraries.map((item) => [text(item.libraryId).toUpperCase(), item])
    ), [quickReplyLibraries]);

    const quickReplyOptions = React.useMemo(() => {
        const selectedModuleId = text(form.moduleId).toLowerCase();
        return quickReplyItems
            .filter((item) => {
                if (!selectedModuleId) return true;
                const library = quickReplyLibraryMap.get(text(item.libraryId).toUpperCase());
                if (!library) return true;
                if (library.isShared === true) return true;
                const moduleIds = Array.isArray(library.moduleIds) ? library.moduleIds : [];
                return moduleIds.some((moduleId) => text(moduleId).toLowerCase() === selectedModuleId);
            })
            .map((item) => ({
                code: text(item.itemId),
                label: `${item.label || item.itemId} (${item.itemId})`,
                text: text(item.text)
            }))
            .filter((item) => item.code);
    }, [form.moduleId, quickReplyItems, quickReplyLibraryMap]);

    React.useEffect(() => {
        if (!form.quickReplyCode) return;
        if (quickReplyOptions.some((item) => item.code === form.quickReplyCode)) return;
        setForm((prev) => ({ ...prev, quickReplyCode: '' }));
    }, [form.quickReplyCode, quickReplyOptions]);

    const selectedQuickReply = React.useMemo(
        () => quickReplyOptions.find((item) => item.code === form.quickReplyCode) || null,
        [form.quickReplyCode, quickReplyOptions]
    );

    const detailActions = React.useMemo(() => {
        if (!selectedRule || panelMode !== 'view' || !canManageAutomations) return null;
        return (
            <>
                <button type="button" disabled={busy} onClick={openEdit}>Editar</button>
                <button type="button" disabled={busy} onClick={removeRule}>Eliminar</button>
            </>
        );
    }, [busy, canManageAutomations, openEdit, panelMode, removeRule, selectedRule]);

    const renderDetail = React.useCallback(() => {
        const rule = selectedRule || {};
        return (
            <>
                <div className="saas-admin-related-block">
                    <h4>Regla automatica</h4>
                    <div className="saas-admin-detail-grid">
                        <div className="saas-admin-detail-field"><span>EVENTO</span><strong>{eventLabel(rule.eventKey)}</strong></div>
                        <div className="saas-admin-detail-field"><span>MODULO</span><strong>{moduleLabelMap.get(text(rule.moduleId)) || text(rule.moduleId) || 'Todos los modulos'}</strong></div>
                        <div className="saas-admin-detail-field"><span>TEMPLATE (fuera 24h)</span><strong>{text(rule.templateName) || 'Sin template'}</strong></div>
                        <div className="saas-admin-detail-field"><span>RESPUESTA RAPIDA (dentro 24h)</span><strong>{text(rule.quickReplyCode || rule.quick_reply_code) || 'Sin respuesta rapida'}</strong></div>
                        <div className="saas-admin-detail-field"><span>IDIOMA</span><strong>{text(rule.templateLanguage).toUpperCase() || 'ES'}</strong></div>
                        <div className="saas-admin-detail-field"><span>DELAY</span><strong>{formatDelay(rule)}</strong></div>
                        <div className="saas-admin-detail-field"><span>ESTADO</span><strong>{rule.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                    </div>
                </div>
            </>
        );
    }, [moduleLabelMap, selectedRule]);

    const renderForm = React.useCallback(({ requestClose } = {}) => {
        if (!canManageAutomations) {
            return <div className="saas-admin-empty-inline">No tienes permisos para modificar automatizaciones.</div>;
        }
        return (
        <>
            <div className="saas-admin-form-row">
                <select
                    id="automation_event"
                    aria-label="Evento"
                    className="saas-input"
                    value={form.eventKey}
                    disabled={busy}
                    onChange={(event) => setForm((prev) => ({ ...prev, eventKey: event.target.value }))}
                >
                    {EVENT_OPTIONS.map((item) => (
                        <option key={`automation_event_${item.value}`} value={item.value}>{item.label}</option>
                    ))}
                </select>
                <select
                    id="automation_module"
                    aria-label="Modulo"
                    className="saas-input"
                    value={form.moduleId}
                    disabled={busy}
                    onChange={(event) => setForm((prev) => ({ ...prev, moduleId: event.target.value }))}
                >
                    <option value="">Todos los modulos</option>
                    {moduleOptions.map((item) => (
                        <option key={`automation_module_${item.moduleId}`} value={item.moduleId}>{item.label}</option>
                    ))}
                </select>
            </div>
            <div className="saas-admin-form-row">
                <select
                    id="automation_template"
                    aria-label="Template Meta fuera de 24h"
                    className="saas-input"
                    value={form.templateName}
                    disabled={busy}
                    onChange={(event) => {
                        const template = templateItems.find((item) => item.templateName === event.target.value);
                        setForm((prev) => ({
                            ...prev,
                            templateName: event.target.value,
                            templateLanguage: template?.templateLanguage || prev.templateLanguage || 'es'
                        }));
                    }}
                >
                    <option value="">Template Meta (fuera de 24h)</option>
                    {templateItems.map((item) => (
                        <option key={`automation_template_${item.templateName}_${item.templateLanguage}`} value={item.templateName}>
                            {item.label}
                        </option>
                    ))}
                </select>
                <select
                    id="automation_quick_reply"
                    aria-label="Respuesta rapida dentro de 24h"
                    className="saas-input"
                    value={form.quickReplyCode}
                    disabled={busy || loadingQuickReplies}
                    onChange={(event) => setForm((prev) => ({ ...prev, quickReplyCode: event.target.value }))}
                >
                    <option value="">{loadingQuickReplies ? 'Cargando respuestas...' : 'Sin respuesta rapida'}</option>
                    {quickReplyOptions.map((item) => (
                        <option key={`automation_quick_reply_${item.code}`} value={item.code}>{item.label}</option>
                    ))}
                </select>
            </div>
            {!text(form.templateName) && !text(form.quickReplyCode) ? (
                <div className="saas-admin-related-block">
                    <small>Sin accion configurada para este evento.</small>
                </div>
            ) : null}
            <div className="saas-admin-form-row">
                <label htmlFor="automation_delay_value" hidden>Enviar despues</label>
                <input
                    id="automation_delay_value"
                    aria-label="Enviar despues"
                    className="saas-input"
                    type="number"
                    min="0"
                    step="1"
                    value={form.delayValue}
                    placeholder="Enviar despues"
                    disabled={busy}
                    onChange={(event) => setForm((prev) => ({ ...prev, delayValue: event.target.value }))}
                />
                <select
                    className="saas-input"
                    aria-label="Unidad de delay"
                    value={form.delayUnit}
                    disabled={busy}
                    onChange={(event) => setForm((prev) => ({ ...prev, delayUnit: event.target.value }))}
                >
                    {DELAY_UNIT_OPTIONS.map((item) => (
                        <option key={`automation_delay_unit_${item.value}`} value={item.value}>{item.label}</option>
                    ))}
                </select>
            </div>
            <div className="saas-admin-related-block">
                <h4>Estado</h4>
                <label className="saas-admin-module-toggle">
                    <input
                        type="checkbox"
                        checked={form.isActive !== false}
                        disabled={busy}
                        onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    <span>Regla activa</span>
                </label>
            </div>
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !form.eventKey} onClick={saveRule}>
                    {panelMode === 'create' ? 'Guardar regla' : 'Actualizar regla'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void requestClose?.(); }}>Cancelar</button>
            </div>
        </>
        );
    }, [busy, canManageAutomations, form, loadingQuickReplies, moduleOptions, panelMode, quickReplyOptions, saveRule, selectedQuickReply, selectedTemplate, templateItems]);

    if (!isSection) return null;

    return (
        <SaasEntityPage
            id="saas_automations"
            sectionKey="saas_automations"
            title="Mensajes automaticos"
            rows={rows}
            columns={columns}
            selectedId={panelMode === 'create' ? '__new_automation__' : selectedRuleId}
            onSelect={(row) => openView(row?.id)}
            onClose={close}
            renderDetail={renderDetail}
            renderForm={renderForm}
            mode={panelMode === 'create' || panelMode === 'edit' ? 'form' : 'detail'}
            dirty={panelMode === 'create' || panelMode === 'edit'}
            requestJson={requestJson}
            loading={sectionLoading}
            emptyText={sectionError || (tenantScopeLocked ? 'Selecciona una empresa para configurar automatizaciones.' : 'No hay reglas automaticas configuradas.')}
            searchPlaceholder="Buscar por evento, modulo, template o estado..."
            filters={filters}
            actions={[
                { label: sectionError ? 'Reintentar' : 'Recargar', onClick: () => (typeof forceReload === 'function' ? forceReload(lazySectionId) : loadAutomations?.().catch(() => {})), disabled: busy || sectionLoading || !settingsTenantId },
                ...(canManageAutomations ? [{ label: 'Nuevo', onClick: openCreate, disabled: busy || !settingsTenantId }] : [])
            ]}
            detailTitle={panelMode === 'create' ? 'Nueva automatizacion' : (selectedRule ? eventLabel(selectedRule.eventKey) : 'Automatizacion')}
            detailSubtitle={panelMode === 'view' ? 'Template por evento comercial.' : 'Configura evento, modulo, template y delay.'}
            detailActions={detailActions}
        />
    );
}

export default React.memo(AutomationSection);
