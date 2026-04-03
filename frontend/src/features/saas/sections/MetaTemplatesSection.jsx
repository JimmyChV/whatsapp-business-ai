import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const HEADER_TYPE_OPTIONS = [
    { value: 'none', label: 'Sin header' },
    { value: 'text', label: 'Texto' },
    { value: 'image', label: 'Imagen' },
    { value: 'video', label: 'Video' },
    { value: 'document', label: 'Documento' }
];

const EMPTY_CREATE_FORM = {
    moduleId: '',
    name: '',
    category: 'marketing',
    language: 'es',
    headerType: 'none',
    headerText: '',
    headerMedia: null,
    bodyText: '',
    footerText: '',
    buttons: []
};

const toText = (value = '') => String(value || '').trim();
const toLower = (value = '') => toText(value).toLowerCase();
const PLACEHOLDER_REGEX = /{{\s*(\d+)\s*}}/g;
const SUPPORTED_LANGUAGES = Object.freeze(['es', 'en', 'pt']);
let buttonRowCounter = 0;

function nextButtonRowId() {
    buttonRowCounter += 1;
    return `btn_${buttonRowCounter}_${Date.now()}`;
}

function createEmptyButtonRow() {
    return {
        id: nextButtonRowId(),
        type: 'quick_reply',
        text: '',
        value: ''
    };
}

function resolveHeaderAccept(type = '') {
    const cleanType = toLower(type);
    if (cleanType === 'image') return 'image/*';
    if (cleanType === 'video') return 'video/*';
    if (cleanType === 'document') return '.pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx';
    return '';
}

function normalizeButtonRows(buttons = []) {
    if (!Array.isArray(buttons)) return [];
    return buttons
        .map((row = {}) => ({
            id: toText(row.id) || nextButtonRowId(),
            type: toLower(row.type || 'quick_reply') || 'quick_reply',
            text: toText(row.text),
            value: toText(row.value)
        }))
        .filter((row) => row.text);
}

function extractPlaceholderIndexes(...texts) {
    const indexes = new Set();
    texts.forEach((text) => {
        const source = String(text || '');
        if (!source) return;
        const regex = new RegExp(PLACEHOLDER_REGEX);
        let match = regex.exec(source);
        while (match) {
            const index = Number(match[1]);
            if (Number.isFinite(index) && index > 0) {
                indexes.add(index);
            }
            match = regex.exec(source);
        }
    });
    return [...indexes].sort((left, right) => left - right);
}

function replacePlaceholders(text = '', valuesByIndex = {}) {
    return String(text || '').replace(PLACEHOLDER_REGEX, (_, indexRaw) => {
        const index = Number(indexRaw);
        if (!Number.isFinite(index) || index <= 0) return `{{${indexRaw}}}`;
        const replacement = toText(valuesByIndex?.[index]);
        return replacement || `{{${index}}}`;
    });
}

function coerceCatalogPayload(payload = {}) {
    const categories = Array.isArray(payload?.categories) ? payload.categories : [];
    const normalizedCategories = categories
        .map((category = {}) => ({
            id: toLower(category?.id || category?.key),
            label: toText(category?.label || category?.id),
            variables: Array.isArray(category?.variables) ? category.variables : []
        }))
        .filter((category) => category.id && category.label);

    const variables = normalizedCategories.flatMap((category) => category.variables.map((variable = {}) => ({
        ...variable,
        key: toText(variable?.key),
        label: toText(variable?.label || variable?.key),
        description: toText(variable?.description),
        placeholderIndex: Number(variable?.placeholderIndex),
        exampleValue: toText(variable?.exampleValue),
        source: toText(variable?.source),
        requiresContext: Array.isArray(variable?.requiresContext) ? variable.requiresContext : [],
        supportedIn: Array.isArray(variable?.supportedIn) ? variable.supportedIn : [],
        categoryId: category.id,
        categoryLabel: category.label
    }))).filter((variable) => variable.key && Number.isFinite(variable.placeholderIndex) && variable.placeholderIndex > 0);

    return { categories: normalizedCategories, variables };
}

function buildInitialVariableExamples(variables = []) {
    return variables.reduce((acc, variable) => {
        const index = Number(variable?.placeholderIndex);
        if (!Number.isFinite(index) || index <= 0) return acc;
        acc[index] = toText(variable?.exampleValue);
        return acc;
    }, {});
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!(file instanceof File)) {
            reject(new Error('Archivo invalido para header.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo del header.'));
        reader.readAsDataURL(file);
    });
}

function resolveStatusMeta(status = '') {
    const cleanStatus = toLower(status);
    return STATUS_META[cleanStatus] || { label: cleanStatus || 'Desconocido', className: 'saas-meta-template-status--paused' };
}

function mapButtonRowsToMeta(buttonRows = []) {
    return normalizeButtonRows(buttonRows)
        .slice(0, 10)
        .map((row) => {
            const type = toLower(row.type || 'quick_reply');
            if (type === 'url') {
                return {
                    type: 'URL',
                    text: row.text,
                    url: toText(row.value)
                };
            }
            if (type === 'phone' || type === 'phone_number') {
                return {
                    type: 'PHONE_NUMBER',
                    text: row.text,
                    phone_number: toText(row.value)
                };
            }
            return {
                type: 'QUICK_REPLY',
                text: row.text
            };
        })
        .filter((button) => {
            if (!button?.text) return false;
            if (button.type === 'URL') return Boolean(button.url);
            if (button.type === 'PHONE_NUMBER') return Boolean(button.phone_number);
            return true;
        });
}

function buildTemplatePayload(form = {}, { variableExamplesByIndex = {} } = {}) {
    const name = toText(form.name);
    const category = toLower(form.category || 'marketing') || 'marketing';
    const language = toLower(form.language || 'es') || 'es';
    const headerType = toLower(form.headerType || 'none');
    const headerText = toText(form.headerText);
    const headerMedia = form?.headerMedia && typeof form.headerMedia === 'object' ? form.headerMedia : null;
    const bodyText = toText(form.bodyText);
    const footerText = toText(form.footerText);
    const buttons = mapButtonRowsToMeta(form.buttons);

    if (!name) throw new Error('Nombre del template requerido.');
    if (!bodyText) throw new Error('Body del template requerido.');

    const components = [
        {
            type: 'BODY',
            text: bodyText
        }
    ];

    const bodyIndexes = extractPlaceholderIndexes(bodyText);
    if (bodyIndexes.length > 0) {
        const values = bodyIndexes.map((index) => toText(variableExamplesByIndex?.[index]) || `valor_${index}`);
        components[0].example = {
            body_text: [values]
        };
    }

    if (headerType === 'text' && headerText) {
        const header = { type: 'HEADER', format: 'TEXT', text: headerText };
        const headerIndexes = extractPlaceholderIndexes(headerText);
        if (headerIndexes.length > 0) {
            header.example = {
                header_text: headerIndexes.map((index) => toText(variableExamplesByIndex?.[index]) || `valor_${index}`)
            };
        }
        components.unshift(header);
    } else if (['image', 'video', 'document'].includes(headerType)) {
        if (!toText(headerMedia?.base64)) {
            throw new Error('Selecciona un archivo para el header multimedia.');
        }
        components.unshift({
            type: 'HEADER',
            format: headerType.toUpperCase(),
            example: {
                header_handle: [toText(headerMedia?.base64)]
            }
        });
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
        requestJson = null,
        metaTemplatesController = null
    } = context;

    const { confirm, notify } = useUiFeedback();
    const [panelMode, setPanelMode] = useState('view');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [syncModuleId, setSyncModuleId] = useState('');
    const [createForm, setCreateForm] = useState(() => buildInitialForm(''));
    const [templateVarCatalog, setTemplateVarCatalog] = useState([]);
    const [templateVarCategories, setTemplateVarCategories] = useState([]);
    const [loadingVarCatalog, setLoadingVarCatalog] = useState(false);
    const [varCatalogError, setVarCatalogError] = useState('');
    const [variableExamplesByIndex, setVariableExamplesByIndex] = useState({});
    const [bodyCursor, setBodyCursor] = useState({ start: 0, end: 0 });
    const [showInlineVariablePicker, setShowInlineVariablePicker] = useState(false);
    const [expandedVariableCategories, setExpandedVariableCategories] = useState({});
    const bodyTextareaRef = useRef(null);
    const headerMediaInputRef = useRef(null);

    const moduleOptions = useMemo(() => {
        return Array.isArray(waModules)
            ? waModules
                .map((moduleItem) => ({
                    moduleId: toText(moduleItem?.moduleId),
                    label: toText(moduleItem?.name) || toText(moduleItem?.moduleId)
                }))
                .filter((entry) => entry.moduleId)
            : [];
    }, [waModules]);

    const varCatalogByPlaceholderIndex = useMemo(() => {
        return templateVarCatalog.reduce((acc, variable) => {
            const index = Number(variable?.placeholderIndex);
            if (!Number.isFinite(index) || index <= 0) return acc;
            acc[index] = variable;
            return acc;
        }, {});
    }, [templateVarCatalog]);

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

    const loadTemplateVariablesCatalog = useCallback(async ({ force = false } = {}) => {
        if (typeof requestJson !== 'function') return null;
        if (!force && templateVarCatalog.length > 0) return null;

        setLoadingVarCatalog(true);
        setVarCatalogError('');
        try {
            const payload = await requestJson('/api/tenant/template-variables/catalog');
            const { categories, variables } = coerceCatalogPayload(payload);
            setTemplateVarCategories(categories);
            setTemplateVarCatalog(variables);
            setVariableExamplesByIndex((prev) => {
                const defaults = buildInitialVariableExamples(variables);
                return Object.keys(prev || {}).length > 0 ? { ...defaults, ...prev } : defaults;
            });
            return payload;
        } catch (error) {
            const message = String(error?.message || 'No se pudo cargar el catalogo de variables.');
            setVarCatalogError(message);
            return null;
        } finally {
            setLoadingVarCatalog(false);
        }
    }, [requestJson, templateVarCatalog.length]);

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
        if (!isMetaTemplatesSection || panelMode !== 'create') return;
        if (templateVarCatalog.length > 0 || loadingVarCatalog) return;
        loadTemplateVariablesCatalog().catch(() => null);
    }, [isMetaTemplatesSection, panelMode, templateVarCatalog.length, loadingVarCatalog, loadTemplateVariablesCatalog]);

    useEffect(() => {
        if (!Array.isArray(templateVarCategories) || templateVarCategories.length === 0) return;
        setExpandedVariableCategories((prev) => {
            const next = { ...prev };
            templateVarCategories.forEach((category) => {
                const key = toText(category?.id);
                if (!key) return;
                if (typeof next[key] !== 'boolean') next[key] = true;
            });
            return next;
        });
    }, [templateVarCategories]);

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
        const moduleId = toText(createForm.moduleId);
        if (!moduleId) throw new Error('Selecciona un modulo para crear el template.');

        const templatePayload = buildTemplatePayload(createForm, { variableExamplesByIndex });
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
    }, [canWrite, createTemplate, createForm, runActionSafe, notify, loadTemplates, filters, variableExamplesByIndex]);

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

    const openCreateTemplatePanel = useCallback(async () => {
        setPanelMode('create');
        try {
            await loadTemplateVariablesCatalog();
        } catch (error) {
            throw error;
        }
    }, [loadTemplateVariablesCatalog, requestJson, templateVarCatalog.length]);

    const toggleVariableCategory = useCallback((categoryId = '') => {
        const key = toText(categoryId);
        if (!key) return;
        setExpandedVariableCategories((prev) => ({
            ...prev,
            [key]: !Boolean(prev?.[key])
        }));
    }, []);

    const updateHeaderType = useCallback((typeRaw = '') => {
        const nextType = toLower(typeRaw);
        const isMediaType = ['image', 'video', 'document'].includes(nextType);
        setCreateForm((prev) => ({
            ...prev,
            headerType: nextType,
            headerText: nextType === 'text' ? prev.headerText : '',
            headerMedia: isMediaType ? prev.headerMedia : null
        }));
        if (!isMediaType && headerMediaInputRef.current) {
            headerMediaInputRef.current.value = '';
        }
    }, []);

    const handleHeaderMediaFileChange = useCallback(async (event) => {
        const file = event?.target?.files?.[0] || null;
        if (!(file instanceof File)) {
            setCreateForm((prev) => ({ ...prev, headerMedia: null }));
            return;
        }
        try {
            const base64 = await readFileAsDataUrl(file);
            setCreateForm((prev) => ({
                ...prev,
                headerMedia: {
                    name: toText(file.name),
                    type: toText(file.type),
                    size: Number(file.size) || 0,
                    base64
                }
            }));
        } catch (error) {
            const message = String(error?.message || 'No se pudo leer el archivo del header.');
            notify({ type: 'error', message });
            setCreateForm((prev) => ({ ...prev, headerMedia: null }));
        }
    }, [notify]);

    const updateBodyCursor = useCallback((event) => {
        const target = event?.target;
        if (!target) return;
        const start = Number(target.selectionStart);
        const end = Number(target.selectionEnd);
        setBodyCursor({
            start: Number.isFinite(start) ? start : 0,
            end: Number.isFinite(end) ? end : Number.isFinite(start) ? start : 0
        });
    }, []);

    const insertVariableAtBodyCursor = useCallback((variable = null) => {
        const index = Number(variable?.placeholderIndex);
        if (!Number.isFinite(index) || index <= 0) return;
        const token = `{{${index}}}`;
        const input = bodyTextareaRef.current;
        const currentBody = String(createForm.bodyText || '');
        const start = Number.isFinite(input?.selectionStart) ? input.selectionStart : bodyCursor.start;
        const end = Number.isFinite(input?.selectionEnd) ? input.selectionEnd : bodyCursor.end;
        const safeStart = Number.isFinite(start) && start >= 0 ? start : currentBody.length;
        const safeEnd = Number.isFinite(end) && end >= safeStart ? end : safeStart;
        const nextBody = `${currentBody.slice(0, safeStart)}${token}${currentBody.slice(safeEnd)}`;
        const cursorPosition = safeStart + token.length;

        setCreateForm((prev) => ({ ...prev, bodyText: nextBody }));
        setBodyCursor({ start: cursorPosition, end: cursorPosition });

        requestAnimationFrame(() => {
            if (!bodyTextareaRef.current) return;
            bodyTextareaRef.current.focus();
            bodyTextareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
        });
    }, [bodyCursor.end, bodyCursor.start, createForm.bodyText]);

    const updateVariableExample = useCallback((placeholderIndex, value) => {
        const index = Number(placeholderIndex);
        if (!Number.isFinite(index) || index <= 0) return;
        setVariableExamplesByIndex((prev) => ({
            ...prev,
            [index]: value
        }));
    }, []);

    const usedPlaceholderIndexes = useMemo(() => {
        return extractPlaceholderIndexes(createForm.headerText, createForm.bodyText, createForm.footerText);
    }, [createForm.bodyText, createForm.footerText, createForm.headerText]);

    const usedVariables = useMemo(() => {
        return usedPlaceholderIndexes
            .map((index) => varCatalogByPlaceholderIndex[index])
            .filter(Boolean);
    }, [usedPlaceholderIndexes, varCatalogByPlaceholderIndex]);

    const previewText = useMemo(() => {
        return {
            header: replacePlaceholders(createForm.headerText, variableExamplesByIndex),
            body: replacePlaceholders(createForm.bodyText, variableExamplesByIndex),
            footer: replacePlaceholders(createForm.footerText, variableExamplesByIndex)
        };
    }, [createForm.bodyText, createForm.footerText, createForm.headerText, variableExamplesByIndex]);

    const previewButtons = useMemo(() => normalizeButtonRows(createForm.buttons).slice(0, 3), [createForm.buttons]);
    const previewTimeLabel = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const activeHeaderType = toLower(createForm.headerType || 'none');
    const isHeaderMediaType = ['image', 'video', 'document'].includes(activeHeaderType);
    const headerMediaAccept = resolveHeaderAccept(activeHeaderType);
    const bodyCharacterCount = String(createForm.bodyText || '').length;

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
                                onClick={() => openCreateTemplatePanel().catch((error) => {
                                    const message = String(error?.message || error || 'No se pudo abrir el formulario de templates.');
                                    notify({ type: 'error', message });
                                    setError?.(message);
                                })}
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
                                        const nextScopeModuleId = toText(event.target.value);
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
                                    onChange={(event) => setSyncModuleId(toText(event.target.value))}
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
                                    <small>Formulario inteligente con variables, ejemplos y preview en tiempo real.</small>
                                </div>
                            </div>

                            <div className="saas-meta-template-builder">
                                <section className="saas-meta-template-builder__form">
                                    <div className="saas-meta-template-field-grid saas-meta-template-field-grid--2">
                                        <div className="saas-meta-template-field">
                                            <label htmlFor="meta_template_form_module">Modulo</label>
                                            <select
                                                id="meta_template_form_module"
                                                value={createForm.moduleId}
                                                onChange={(event) => setCreateForm((prev) => ({ ...prev, moduleId: toText(event.target.value) }))}
                                                disabled={templatesBusy || !canWrite}
                                            >
                                                <option value="">Selecciona modulo</option>
                                                {moduleOptions.map((moduleItem) => (
                                                    <option key={`meta_template_form_module_${moduleItem.moduleId}`} value={moduleItem.moduleId}>
                                                        {moduleItem.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="saas-meta-template-field">
                                            <label htmlFor="meta_template_form_name">Nombre del template</label>
                                            <input
                                                id="meta_template_form_name"
                                                value={createForm.name}
                                                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                                                placeholder="Ejemplo: promo_semana_limpieza"
                                                disabled={templatesBusy || !canWrite}
                                            />
                                        </div>
                                    </div>

                                    <div className="saas-meta-template-field-grid saas-meta-template-field-grid--2">
                                        <div className="saas-meta-template-field">
                                            <label htmlFor="meta_template_category">Categoria</label>
                                            <select
                                                id="meta_template_category"
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
                                        </div>
                                        <div className="saas-meta-template-field">
                                            <label htmlFor="meta_template_language">Idioma</label>
                                            <select
                                                id="meta_template_language"
                                                value={createForm.language}
                                                onChange={(event) => {
                                                    const nextLanguage = toLower(event.target.value);
                                                    setCreateForm((prev) => ({
                                                        ...prev,
                                                        language: SUPPORTED_LANGUAGES.includes(nextLanguage) ? nextLanguage : 'es'
                                                    }));
                                                }}
                                                disabled={templatesBusy || !canWrite}
                                            >
                                                {LANGUAGE_OPTIONS.map((option) => (
                                                    <option key={`meta_template_language_${option.value}`} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="saas-meta-template-field-grid saas-meta-template-field-grid--2">
                                        <div className="saas-meta-template-field">
                                            <label htmlFor="meta_template_header_type">Header</label>
                                            <select
                                                id="meta_template_header_type"
                                                value={createForm.headerType}
                                                onChange={(event) => updateHeaderType(event.target.value)}
                                                disabled={templatesBusy || !canWrite}
                                            >
                                                {HEADER_TYPE_OPTIONS.map((option) => (
                                                    <option key={`meta_template_header_type_${option.value}`} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="saas-meta-template-field">
                                            {activeHeaderType === 'text' && (
                                                <>
                                                    <label htmlFor="meta_template_header_text">Texto del header</label>
                                                    <input
                                                        id="meta_template_header_text"
                                                        value={createForm.headerText}
                                                        onChange={(event) => setCreateForm((prev) => ({ ...prev, headerText: event.target.value }))}
                                                        placeholder="Header en negrita"
                                                        disabled={templatesBusy || !canWrite}
                                                    />
                                                </>
                                            )}
                                            {isHeaderMediaType && (
                                                <>
                                                    <label htmlFor="meta_template_header_media">Archivo del header</label>
                                                    <div className="saas-meta-template-upload-row">
                                                        <input
                                                            ref={headerMediaInputRef}
                                                            id="meta_template_header_media"
                                                            type="file"
                                                            accept={headerMediaAccept}
                                                            onChange={(event) => {
                                                                handleHeaderMediaFileChange(event).catch(() => null);
                                                            }}
                                                            disabled={templatesBusy || !canWrite}
                                                        />
                                                        {createForm?.headerMedia?.name && (
                                                            <small className="saas-meta-template-upload-file">{createForm.headerMedia.name}</small>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                            {!isHeaderMediaType && activeHeaderType !== 'text' && (
                                                <small className="saas-meta-template-help">Puedes usar header de texto o multimedia.</small>
                                            )}
                                        </div>
                                    </div>

                                    <div className="saas-meta-template-field">
                                        <div className="saas-meta-template-field-heading">
                                            <label htmlFor="meta_template_body_text">Body del template</label>
                                            <button
                                                type="button"
                                                className="saas-meta-template-inline-var-toggle"
                                                disabled={templatesBusy || !canWrite}
                                                onClick={() => setShowInlineVariablePicker((prev) => !prev)}
                                            >
                                                Insertar variable
                                            </button>
                                        </div>
                                        <textarea
                                            id="meta_template_body_text"
                                            ref={bodyTextareaRef}
                                            className="saas-meta-template-body-textarea"
                                            value={createForm.bodyText}
                                            onChange={(event) => setCreateForm((prev) => ({ ...prev, bodyText: event.target.value }))}
                                            onSelect={updateBodyCursor}
                                            onClick={updateBodyCursor}
                                            onKeyUp={updateBodyCursor}
                                            placeholder="Escribe el contenido principal del template..."
                                            rows={8}
                                            disabled={templatesBusy || !canWrite}
                                        />
                                        <div className="saas-meta-template-counter">{bodyCharacterCount} caracteres</div>
                                        {showInlineVariablePicker && (
                                            <div className="saas-meta-template-inline-picker">
                                                {templateVarCategories.map((category) => (
                                                    <div className="saas-meta-template-inline-picker-group" key={`inline_var_group_${category.id}`}>
                                                        <strong>{category.label}</strong>
                                                        <div className="saas-meta-template-inline-picker-list">
                                                            {(Array.isArray(category.variables) ? category.variables : []).map((variable) => (
                                                                <button
                                                                    type="button"
                                                                    key={`inline_var_${category.id}_${variable.key}`}
                                                                    disabled={templatesBusy || !canWrite}
                                                                    onClick={() => insertVariableAtBodyCursor(variable)}
                                                                >
                                                                    {`{{${Number(variable?.placeholderIndex)}}}`} {toText(variable?.label || variable?.key)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="saas-meta-template-field">
                                        <label htmlFor="meta_template_footer_text">Footer (opcional)</label>
                                        <input
                                            id="meta_template_footer_text"
                                            value={createForm.footerText}
                                            onChange={(event) => setCreateForm((prev) => ({ ...prev, footerText: event.target.value }))}
                                            placeholder="Texto corto al pie del template"
                                            disabled={templatesBusy || !canWrite}
                                        />
                                    </div>

                                    <div className="saas-meta-template-buttons">
                                        <h4>Botones (opcional)</h4>
                                        <div className="saas-meta-template-buttons-list">
                                            {(Array.isArray(createForm.buttons) ? createForm.buttons : []).map((buttonRow) => (
                                                <div className="saas-meta-template-button-row" key={buttonRow.id}>
                                                    <div className="saas-meta-template-field">
                                                        <label>Tipo</label>
                                                        <select
                                                            value={buttonRow.type || 'quick_reply'}
                                                            onChange={(event) => {
                                                                const nextType = toLower(event.target.value);
                                                                setCreateForm((prev) => ({
                                                                    ...prev,
                                                                    buttons: (Array.isArray(prev.buttons) ? prev.buttons : []).map((row) => (
                                                                        row.id === buttonRow.id
                                                                            ? { ...row, type: nextType, value: ['url', 'phone', 'phone_number'].includes(nextType) ? row.value : '' }
                                                                            : row
                                                                    ))
                                                                }));
                                                            }}
                                                            disabled={templatesBusy || !canWrite}
                                                        >
                                                            <option value="quick_reply">Quick reply</option>
                                                            <option value="url">URL</option>
                                                            <option value="phone">Telefono</option>
                                                        </select>
                                                    </div>
                                                    <div className="saas-meta-template-field">
                                                        <label>Texto</label>
                                                        <input
                                                            value={buttonRow.text || ''}
                                                            onChange={(event) => {
                                                                const nextValue = event.target.value;
                                                                setCreateForm((prev) => ({
                                                                    ...prev,
                                                                    buttons: (Array.isArray(prev.buttons) ? prev.buttons : []).map((row) => (
                                                                        row.id === buttonRow.id ? { ...row, text: nextValue } : row
                                                                    ))
                                                                }));
                                                            }}
                                                            placeholder="Texto del boton"
                                                            disabled={templatesBusy || !canWrite}
                                                        />
                                                    </div>
                                                    {(buttonRow.type === 'url' || buttonRow.type === 'phone' || buttonRow.type === 'phone_number') && (
                                                        <div className="saas-meta-template-field">
                                                            <label>Destino</label>
                                                            <input
                                                                value={buttonRow.value || ''}
                                                                onChange={(event) => {
                                                                    const nextValue = event.target.value;
                                                                    setCreateForm((prev) => ({
                                                                        ...prev,
                                                                        buttons: (Array.isArray(prev.buttons) ? prev.buttons : []).map((row) => (
                                                                            row.id === buttonRow.id ? { ...row, value: nextValue } : row
                                                                        ))
                                                                    }));
                                                                }}
                                                                placeholder={buttonRow.type === 'url' ? 'https://...' : '+51999999999'}
                                                                disabled={templatesBusy || !canWrite}
                                                            />
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="saas-meta-template-button-remove"
                                                        disabled={templatesBusy || !canWrite}
                                                        onClick={() => {
                                                            setCreateForm((prev) => ({
                                                                ...prev,
                                                                buttons: (Array.isArray(prev.buttons) ? prev.buttons : []).filter((row) => row.id !== buttonRow.id)
                                                            }));
                                                        }}
                                                    >
                                                        Quitar
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                className="saas-meta-template-button-add"
                                                disabled={templatesBusy || !canWrite || (createForm.buttons || []).length >= 10}
                                                onClick={() => {
                                                    setCreateForm((prev) => ({
                                                        ...prev,
                                                        buttons: [...(Array.isArray(prev.buttons) ? prev.buttons : []), createEmptyButtonRow()]
                                                    }));
                                                }}
                                            >
                                                Agregar boton
                                            </button>
                                        </div>
                                    </div>

                                    <div className="saas-admin-form-row saas-admin-form-row--actions saas-meta-template-builder__actions">
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
                                                setShowInlineVariablePicker(false);
                                                setCreateForm(buildInitialForm(createForm.moduleId || moduleOptions[0]?.moduleId || ''));
                                            }}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </section>

                                <section className="saas-meta-template-builder__variables">
                                    <div className="saas-admin-related-block saas-meta-template-pane">
                                        <h4>Variables por categoria</h4>
                                        {loadingVarCatalog && <small className="saas-meta-template-help">Cargando catalogo de variables...</small>}
                                        {varCatalogError && <small className="saas-meta-template-error">{varCatalogError}</small>}
                                        {!loadingVarCatalog && !varCatalogError && templateVarCategories.map((category) => {
                                            const categoryKey = toText(category?.id);
                                            const isExpanded = Boolean(expandedVariableCategories?.[categoryKey]);
                                            return (
                                                <div key={`template_var_category_${category.id}`} className="saas-meta-template-var-group">
                                                    <button
                                                        type="button"
                                                        className="saas-meta-template-accordion-trigger"
                                                        onClick={() => toggleVariableCategory(categoryKey)}
                                                    >
                                                        <span>{category.label}</span>
                                                        <span>{isExpanded ? '-' : '+'}</span>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="saas-meta-template-var-list">
                                                            {(Array.isArray(category.variables) ? category.variables : []).map((variable) => (
                                                                <div className="saas-meta-template-var-item" key={`template_var_${category.id}_${variable.key}`}>
                                                                    <div className="saas-meta-template-var-item-main">
                                                                        <span className="saas-meta-template-var-token">{`{{${Number(variable?.placeholderIndex)}}}`}</span>
                                                                        <strong>{toText(variable?.label || variable?.key)}</strong>
                                                                        <small>{toText(variable?.description)}</small>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        className="saas-meta-template-var-insert"
                                                                        disabled={templatesBusy || !canWrite}
                                                                        onClick={() => insertVariableAtBodyCursor(variable)}
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="saas-admin-related-block saas-meta-template-pane">
                                        <h4>Ejemplos para variables usadas</h4>
                                        {usedVariables.length === 0 && (
                                            <small className="saas-meta-template-help">Inserta variables en el body/header/footer para configurar ejemplos.</small>
                                        )}
                                        {usedVariables.length > 0 && usedVariables.map((variable) => {
                                            const index = Number(variable?.placeholderIndex);
                                            const key = `var_example_${index}`;
                                            return (
                                                <div className="saas-meta-template-example-row" key={key}>
                                                    <label htmlFor={key}>
                                                        {`{{${index}}}`} {toText(variable?.label)}
                                                    </label>
                                                    <input
                                                        id={key}
                                                        value={toText(variableExamplesByIndex?.[index])}
                                                        onChange={(event) => updateVariableExample(index, event.target.value)}
                                                        placeholder={toText(variable?.exampleValue) || `valor_${index}`}
                                                        disabled={templatesBusy || !canWrite}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>

                                </section>

                                <aside className="saas-meta-template-builder__preview">
                                    <h4>Preview WhatsApp</h4>
                                    <div className="saas-wa-preview">
                                        <div className="saas-wa-preview__chat-bg">
                                            <article className="saas-wa-preview__bubble">
                                                {isHeaderMediaType && (
                                                    <div className="saas-wa-preview__media-placeholder">
                                                        <strong>{activeHeaderType === 'image' ? 'Imagen' : activeHeaderType === 'video' ? 'Video' : 'Documento'}</strong>
                                                        <small>{toText(createForm?.headerMedia?.name) || 'Sin archivo cargado'}</small>
                                                    </div>
                                                )}
                                                {activeHeaderType === 'text' && Boolean(createForm.headerText) && (
                                                    <div className="saas-wa-preview__header">{previewText.header || '-'}</div>
                                                )}
                                                <div className="saas-wa-preview__body">{previewText.body || 'Escribe el contenido del template...'}</div>
                                                {Boolean(createForm.footerText) && (
                                                    <div className="saas-wa-preview__footer">{previewText.footer || '-'}</div>
                                                )}
                                                {previewButtons.length > 0 && (
                                                    <div className="saas-wa-preview__buttons">
                                                        {previewButtons.map((buttonRow) => (
                                                            <div className="saas-wa-preview__button" key={`preview_button_${buttonRow.id}`}>
                                                                {toText(buttonRow.text) || 'Boton'}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="saas-wa-preview__meta">
                                                    <span>{previewTimeLabel}</span>
                                                    <span className="saas-wa-preview__tick">{'\u2713\u2713'}</span>
                                                </div>
                                            </article>
                                        </div>
                                    </div>
                                </aside>
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
                                        onClick={() => openCreateTemplatePanel().catch((error) => {
                                            const message = String(error?.message || error || 'No se pudo abrir el formulario de templates.');
                                            notify({ type: 'error', message });
                                            setError?.(message);
                                        })}
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
