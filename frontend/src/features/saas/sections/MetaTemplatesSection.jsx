import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import {
    SaasDataTable,
    SaasDetailPanel,
    SaasDetailPanelSection,
    SaasTableDetailLayout,
    SaasViewHeader,
    useSaasColumnPrefs
} from '../components/layout';

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

const TEMPLATE_TABLE_COLUMNS = [
    { key: 'templateName', label: 'Nombre', width: '280px', minWidth: '220px', maxWidth: '360px', type: 'text' },
    { key: 'category', label: 'Categoria', width: '140px', minWidth: '120px', maxWidth: '180px', type: 'option' },
    { key: 'templateLanguage', label: 'Idioma', width: '120px', minWidth: '100px', maxWidth: '150px', type: 'option' },
    { key: 'statusLabel', label: 'Estado', width: '140px', minWidth: '120px', maxWidth: '180px', type: 'option' },
    { key: 'moduleLabel', label: 'Modulo', width: '200px', minWidth: '160px', maxWidth: '280px', type: 'text' },
    { key: 'updatedAt', label: 'Actualizado', width: '190px', minWidth: '160px', maxWidth: '230px', type: 'date' }
];

const TEMPLATE_DEFAULT_COLUMN_KEYS = [
    'templateName',
    'category',
    'templateLanguage',
    'statusLabel',
    'moduleLabel',
    'updatedAt'
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
const toUpper = (value = '') => toText(value).toUpperCase();
const META_PLACEHOLDER_REGEX = /{{\s*(\d+)\s*}}/g;
const TEMPLATE_TOKEN_REGEX = /{{\s*([^{}]+?)\s*}}/g;
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

function normalizeTemplateToken(raw = '') {
    return toText(raw).toLowerCase();
}

function isMetaNumericToken(token = '') {
    return /^[1-9]\d*$/.test(toText(token));
}

function extractPlaceholderIndexes(...texts) {
    const indexes = new Set();
    texts.forEach((text) => {
        const source = String(text || '');
        if (!source) return;
        const regex = new RegExp(META_PLACEHOLDER_REGEX);
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

function collectPlaceholderTokensInAppearanceOrder(text = '') {
    const ordered = [];
    const seen = new Set();
    const source = String(text || '');
    if (!source) return ordered;
    const regex = new RegExp(TEMPLATE_TOKEN_REGEX);
    let match = regex.exec(source);
    while (match) {
        const token = normalizeTemplateToken(match[1]);
        if (token && !seen.has(token)) {
            seen.add(token);
            ordered.push(token);
        }
        match = regex.exec(source);
    }
    return ordered;
}

function buildSequentialPlaceholderMap(...texts) {
    const orderedOriginalTokens = [];
    const seen = new Set();
    texts.forEach((text) => {
        collectPlaceholderTokensInAppearanceOrder(text).forEach((token) => {
            if (seen.has(token)) return;
            seen.add(token);
            orderedOriginalTokens.push(token);
        });
    });
    const originalToSequential = {};
    const sequentialToOriginal = {};
    orderedOriginalTokens.forEach((originalToken, position) => {
        const sequentialIndex = position + 1;
        originalToSequential[originalToken] = sequentialIndex;
        sequentialToOriginal[sequentialIndex] = originalToken;
    });
    return { orderedTokens: orderedOriginalTokens, originalToSequential, sequentialToOriginal };
}

function applySequentialPlaceholderMap(text = '', originalToSequential = {}) {
    return String(text || '').replace(TEMPLATE_TOKEN_REGEX, (_, rawToken) => {
        const token = normalizeTemplateToken(rawToken);
        if (!token) return `{{${rawToken}}}`;
        const sequentialIndex = Number(originalToSequential?.[token]);
        if (!Number.isFinite(sequentialIndex) || sequentialIndex <= 0) return `{{${token}}}`;
        return `{{${sequentialIndex}}}`;
    });
}

function replaceTemplateTokens(text = '', valuesByToken = {}) {
    return String(text || '').replace(TEMPLATE_TOKEN_REGEX, (_, rawToken) => {
        const token = normalizeTemplateToken(rawToken);
        if (!token) return `{{${rawToken}}}`;
        const replacement = toText(valuesByToken?.[token]);
        return replacement || `{{${token}}}`;
    });
}

function wrapPreviewLines(text = '', maxCharsPerLine = 90) {
    const maxChars = Number(maxCharsPerLine);
    if (!Number.isFinite(maxChars) || maxChars <= 0) return String(text || '');
    return String(text || '')
        .split('\n')
        .map((rawLine) => {
            let line = String(rawLine || '');
            if (line.length <= maxChars) return line;
            const chunks = [];
            while (line.length > maxChars) {
                let cut = line.lastIndexOf(' ', maxChars);
                if (cut < 1) cut = maxChars;
                chunks.push(line.slice(0, cut));
                line = line.slice(cut).trimStart();
            }
            if (line.length > 0) chunks.push(line);
            return chunks.join('\n');
        })
        .join('\n');
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
        const tokenKey = normalizeTemplateToken(variable?.key);
        const exampleValue = toText(variable?.exampleValue);
        if (tokenKey) {
            acc[tokenKey] = exampleValue;
        }
        const index = Number(variable?.placeholderIndex);
        if (Number.isFinite(index) && index > 0) {
            acc[String(index)] = exampleValue;
        }
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

function replaceMetaPlaceholdersWithExampleArray(text = '', examples = []) {
    return String(text || '').replace(META_PLACEHOLDER_REGEX, (_, indexRaw) => {
        const index = Number(indexRaw);
        if (!Number.isFinite(index) || index <= 0) return `{{${indexRaw}}}`;
        const value = toText(Array.isArray(examples) ? examples[index - 1] : '');
        return value || `{{${index}}}`;
    });
}

function buildTemplatePreviewFromComponents(componentsJson = []) {
    const components = Array.isArray(componentsJson) ? componentsJson : [];
    const byType = (type) => components.find((component) => toUpper(component?.type) === type) || null;
    const headerComponent = byType('HEADER');
    const bodyComponent = byType('BODY');
    const footerComponent = byType('FOOTER');
    const buttonsComponent = byType('BUTTONS');

    const headerFormat = toLower(headerComponent?.format || '');
    const headerType = headerComponent
        ? (headerFormat === 'text' ? 'text' : (['image', 'video', 'document'].includes(headerFormat) ? headerFormat : 'none'))
        : 'none';

    const headerExampleValues = Array.isArray(headerComponent?.example?.header_text)
        ? headerComponent.example.header_text
        : [];
    const bodyExampleValues = Array.isArray(bodyComponent?.example?.body_text?.[0])
        ? bodyComponent.example.body_text[0]
        : [];

    const mediaHandle = toText(headerComponent?.example?.header_handle?.[0]);
    const headerMediaSrc = toText(mediaHandle);
    const headerMediaLabel = toText(headerComponent?.text) || mediaHandle || 'Media de ejemplo';

    const previewButtons = (Array.isArray(buttonsComponent?.buttons) ? buttonsComponent.buttons : [])
        .map((button, index) => ({
            id: `selected_btn_${index + 1}`,
            type: toLower(button?.type || 'quick_reply'),
            text: toText(button?.text) || `Boton ${index + 1}`,
            value: toText(button?.url || button?.phone_number || '')
        }));

    return {
        headerType,
        headerText: wrapPreviewLines(
            replaceMetaPlaceholdersWithExampleArray(toText(headerComponent?.text), headerExampleValues),
            90
        ),
        headerMediaSrc,
        headerMediaLabel,
        bodyText: wrapPreviewLines(
            replaceMetaPlaceholdersWithExampleArray(toText(bodyComponent?.text), bodyExampleValues),
            90
        ),
        footerText: wrapPreviewLines(toText(footerComponent?.text), 90),
        buttons: previewButtons
    };
}

function WhatsAppTemplatePreview({
    headerType = 'none',
    headerText = '',
    headerMediaSrc = '',
    headerMediaLabel = '',
    bodyText = '',
    footerText = '',
    buttons = [],
    timeLabel = '',
    emptyBodyText = 'Escribe el contenido del template...'
}) {
    const cleanHeaderType = toLower(headerType || 'none');
    const isHeaderMediaType = ['image', 'video', 'document'].includes(cleanHeaderType);
    const canRenderHeaderImage = cleanHeaderType === 'image' && toText(headerMediaSrc);
    const previewButtons = Array.isArray(buttons) ? buttons : [];

    return (
        <div className="saas-wa-preview">
            <div className="saas-wa-preview__chat-bg">
                <div className="saas-wa-preview__delivery-stack">
                    <article className="saas-wa-preview__bubble">
                        {isHeaderMediaType && (
                            <div className="saas-wa-preview__media-placeholder">
                                {canRenderHeaderImage ? (
                                    <img
                                        src={headerMediaSrc}
                                        alt="Preview header"
                                        className="saas-wa-preview__media-image"
                                    />
                                ) : (
                                    <>
                                        <strong>{cleanHeaderType === 'image' ? 'Imagen' : cleanHeaderType === 'video' ? 'Video' : 'Documento'}</strong>
                                        <small>{toText(headerMediaLabel) || 'Sin archivo cargado'}</small>
                                    </>
                                )}
                            </div>
                        )}
                        {cleanHeaderType === 'text' && Boolean(headerText) && (
                            <div className="saas-wa-preview__header">{headerText || '-'}</div>
                        )}
                        <div className="saas-wa-preview__body">{bodyText || emptyBodyText}</div>
                        {Boolean(footerText) && (
                            <div className="saas-wa-preview__footer">{footerText || '-'}</div>
                        )}
                        <div className="saas-wa-preview__meta">
                            <span>{toText(timeLabel) || new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="saas-wa-preview__tick">{'\u2713\u2713'}</span>
                        </div>
                    </article>
                    {previewButtons.length > 0 && (
                        <div className="saas-wa-preview__template-buttons">
                            {previewButtons.map((buttonRow) => (
                                <div className="saas-wa-preview__template-button" key={`preview_button_${buttonRow.id}`}>
                                    <span className="saas-wa-preview__template-button-meta">
                                        {toLower(buttonRow?.type) === 'url'
                                            ? 'Enlace'
                                            : (toLower(buttonRow?.type) === 'phone' || toLower(buttonRow?.type) === 'phone_number')
                                                ? 'Llamar'
                                                : 'Respuesta'}
                                    </span>
                                    <span>{toText(buttonRow?.text) || 'Boton'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function buildTemplatePayload(form = {}, {
    variableExamplesByToken = {},
    defaultExampleByToken = {}
} = {}) {
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

    const headerVariableMap = buildSequentialPlaceholderMap(headerText);
    const bodyVariableMap = buildSequentialPlaceholderMap(bodyText);
    const footerVariableMap = buildSequentialPlaceholderMap(footerText);

    const normalizedHeaderText = applySequentialPlaceholderMap(headerText, headerVariableMap.originalToSequential);
    const normalizedBodyText = applySequentialPlaceholderMap(bodyText, bodyVariableMap.originalToSequential);
    const normalizedFooterText = applySequentialPlaceholderMap(footerText, footerVariableMap.originalToSequential);

    const resolveExampleForToken = (originalToken, sequentialIndex) => {
        const normalizedToken = normalizeTemplateToken(originalToken);
        const fromUser = toText(
            variableExamplesByToken?.[normalizedToken]
            ?? variableExamplesByToken?.[originalToken]
        );
        if (fromUser) return fromUser;
        const fromDefaults = toText(
            defaultExampleByToken?.[normalizedToken]
            ?? defaultExampleByToken?.[originalToken]
        );
        if (fromDefaults) return fromDefaults;
        return `valor_${sequentialIndex}`;
    };

    const components = [
        {
            type: 'BODY',
            text: normalizedBodyText
        }
    ];

    const bodyIndexes = extractPlaceholderIndexes(normalizedBodyText);
    if (bodyIndexes.length > 0) {
        const values = bodyIndexes.map((sequentialIndex) => {
            const originalToken = toText(bodyVariableMap?.sequentialToOriginal?.[sequentialIndex]);
            return resolveExampleForToken(originalToken, sequentialIndex);
        });
        components[0].example = {
            body_text: [values]
        };
    }

    if (headerType === 'text' && normalizedHeaderText) {
        const header = { type: 'HEADER', format: 'TEXT', text: normalizedHeaderText };
        const headerIndexes = extractPlaceholderIndexes(normalizedHeaderText);
        if (headerIndexes.length > 0) {
            header.example = {
                header_text: headerIndexes.map((sequentialIndex) => {
                    const originalToken = toText(headerVariableMap?.sequentialToOriginal?.[sequentialIndex]);
                    return resolveExampleForToken(originalToken, sequentialIndex);
                })
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
    if (normalizedFooterText) {
        components.push({ type: 'FOOTER', text: normalizedFooterText });
    }
    if (buttons.length > 0) {
        components.push({ type: 'BUTTONS', buttons });
    }

    return {
        metaPayload: {
            name,
            category: category.toUpperCase(),
            language,
            components
        },
        variableIndexMap: {
            header: headerVariableMap,
            body: bodyVariableMap,
            footer: footerVariableMap
        }
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
    const [showColumnsPanel, setShowColumnsPanel] = useState(false);
    const [syncModuleId, setSyncModuleId] = useState('');
    const [createForm, setCreateForm] = useState(() => buildInitialForm(''));
    const [templateVarCatalog, setTemplateVarCatalog] = useState([]);
    const [templateVarCategories, setTemplateVarCategories] = useState([]);
    const [loadingVarCatalog, setLoadingVarCatalog] = useState(false);
    const [varCatalogError, setVarCatalogError] = useState('');
    const [variableExamplesByToken, setVariableExamplesByToken] = useState({});
    const [bodyCursor, setBodyCursor] = useState({ start: 0, end: 0 });
    const [expandedVariableCategories, setExpandedVariableCategories] = useState({});
    const [variableSearchQuery, setVariableSearchQuery] = useState('');
    const [previewMode, setPreviewMode] = useState('delivery');
    const bodyTextareaRef = useRef(null);
    const headerMediaInputRef = useRef(null);
    const {
        visibleKeys: visibleTableColumnKeys,
        setVisibleKeys: setVisibleTableColumnKeys,
        resetVisibleKeys: resetVisibleTableColumnKeys
    } = useSaasColumnPrefs('meta_templates', TEMPLATE_DEFAULT_COLUMN_KEYS);
    const lastVariableIndexMapRef = useRef({
        header: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} },
        body: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} },
        footer: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} }
    });

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

    const varCatalogByToken = useMemo(() => {
        return templateVarCatalog.reduce((acc, variable) => {
            const tokenKey = normalizeTemplateToken(variable?.key);
            if (tokenKey) {
                acc[tokenKey] = variable;
            }
            const numericToken = Number(variable?.placeholderIndex);
            if (Number.isFinite(numericToken) && numericToken > 0 && !acc[String(numericToken)]) {
                acc[String(numericToken)] = variable;
            }
            return acc;
        }, {});
    }, [templateVarCatalog]);

    const defaultVariableExamplesByToken = useMemo(
        () => buildInitialVariableExamples(templateVarCatalog),
        [templateVarCatalog]
    );

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
            setVariableExamplesByToken((prev) => {
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
                if (typeof next[key] !== 'boolean') next[key] = false;
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

    const tableRows = useMemo(() => {
        return Array.isArray(visibleItems)
            ? visibleItems.map((template = {}) => {
                const templateId = toText(template?.templateId);
                const statusMeta = resolveStatusMeta(template?.status);
                return {
                    id: templateId,
                    templateId,
                    templateName: toText(template?.templateName) || templateId || '-',
                    category: toText(template?.category) || '-',
                    templateLanguage: toText(template?.templateLanguage).toUpperCase() || '-',
                    statusLabel: statusMeta.label,
                    moduleLabel: toText(template?.moduleId) || '-',
                    updatedAt: toText(template?.updatedAt) || '-'
                };
            })
            : [];
    }, [visibleItems]);

    const tableColumns = useMemo(() => {
        const visibleSet = new Set((Array.isArray(visibleTableColumnKeys) ? visibleTableColumnKeys : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean));
        return TEMPLATE_TABLE_COLUMNS.map((column) => ({
            ...column,
            hidden: visibleSet.size > 0 ? !visibleSet.has(column.key) : false
        }));
    }, [visibleTableColumnKeys]);

    const selectedTemplatePreview = useMemo(
        () => buildTemplatePreviewFromComponents(selectedTemplate?.componentsJson || []),
        [selectedTemplate]
    );

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

        const {
            metaPayload: templatePayload,
            variableIndexMap
        } = buildTemplatePayload(createForm, {
            variableExamplesByToken,
            defaultExampleByToken: defaultVariableExamplesByToken
        });
        lastVariableIndexMapRef.current = variableIndexMap || {
            header: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} },
            body: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} },
            footer: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} }
        };
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
    }, [canWrite, createTemplate, createForm, runActionSafe, notify, loadTemplates, filters, variableExamplesByToken, defaultVariableExamplesByToken]);

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
        setVariableSearchQuery('');
        setPreviewMode('delivery');
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
        const tokenKey = normalizeTemplateToken(variable?.key);
        const numericFallback = Number(variable?.placeholderIndex);
        const normalizedToken = tokenKey || (Number.isFinite(numericFallback) && numericFallback > 0 ? String(numericFallback) : '');
        if (!normalizedToken) return;
        const token = `{{${normalizedToken}}}`;
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

    const updateVariableExample = useCallback((token, value) => {
        const normalizedToken = normalizeTemplateToken(token);
        if (!normalizedToken) return;
        setVariableExamplesByToken((prev) => ({
            ...prev,
            [normalizedToken]: value
        }));
    }, []);

    const usedTemplateTokens = useMemo(() => {
        const { orderedTokens = [] } = buildSequentialPlaceholderMap(
            createForm.headerText,
            createForm.bodyText,
            createForm.footerText
        );
        return orderedTokens;
    }, [createForm.bodyText, createForm.footerText, createForm.headerText]);

    const usedVariables = useMemo(() => {
        return usedTemplateTokens.map((rawToken) => {
            const token = normalizeTemplateToken(rawToken);
            const catalogVariable = varCatalogByToken[token]
                || (Number.isFinite(Number(token)) ? varCatalogByPlaceholderIndex[Number(token)] : null);
            if (catalogVariable) {
                return {
                    ...catalogVariable,
                    token
                };
            }
            return {
                key: token,
                token,
                label: `Variable personalizada (${token})`,
                description: 'Variable no catalogada. Define un ejemplo para validarla.',
                placeholderIndex: null,
                exampleValue: ''
            };
        });
    }, [usedTemplateTokens, varCatalogByToken, varCatalogByPlaceholderIndex]);

    const filteredVarCategories = useMemo(() => {
        const query = toLower(variableSearchQuery);
        return templateVarCategories
            .map((category) => {
                const variables = Array.isArray(category?.variables) ? category.variables : [];
                if (!query) return { ...category, variables };
                const filtered = variables.filter((variable) => {
                    const haystack = `${toText(variable?.label)} ${toText(variable?.key)} ${toText(variable?.description)}`.toLowerCase();
                    return haystack.includes(query);
                });
                return { ...category, variables: filtered };
            })
            .filter((category) => (Array.isArray(category?.variables) ? category.variables.length > 0 : false));
    }, [templateVarCategories, variableSearchQuery]);

    const previewValuesByToken = useMemo(() => {
        const values = {};
        usedVariables.forEach((variable) => {
            const token = normalizeTemplateToken(variable?.token || variable?.key);
            if (!token) return;
            const userExample = toText(variableExamplesByToken?.[token]);
            const defaultExample = toText(defaultVariableExamplesByToken?.[token] ?? variable?.exampleValue);
            const finalExample = userExample || defaultExample || `valor_${token}`;
            values[token] = finalExample;
            if (isMetaNumericToken(token) && !values[String(Number(token))]) {
                values[String(Number(token))] = finalExample;
            }
            const placeholderIndex = Number(variable?.placeholderIndex);
            if (Number.isFinite(placeholderIndex) && placeholderIndex > 0 && !values[String(placeholderIndex)]) {
                values[String(placeholderIndex)] = finalExample;
            }
        });
        return values;
    }, [usedVariables, variableExamplesByToken, defaultVariableExamplesByToken]);

    const previewText = useMemo(() => {
        return {
            header: wrapPreviewLines(replaceTemplateTokens(createForm.headerText, previewValuesByToken), 90),
            body: wrapPreviewLines(replaceTemplateTokens(createForm.bodyText, previewValuesByToken), 90),
            footer: wrapPreviewLines(replaceTemplateTokens(createForm.footerText, previewValuesByToken), 90)
        };
    }, [createForm.bodyText, createForm.footerText, createForm.headerText, previewValuesByToken]);

    const previewButtons = useMemo(() => normalizeButtonRows(createForm.buttons).slice(0, 3), [createForm.buttons]);
    const previewTimeLabel = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const activeHeaderType = toLower(createForm.headerType || 'none');
    const isHeaderMediaType = ['image', 'video', 'document'].includes(activeHeaderType);
    const headerMediaAccept = resolveHeaderAccept(activeHeaderType);
    const previewHeaderMediaSrc = toText(createForm?.headerMedia?.base64);
    const bodyCharacterCount = String(createForm.bodyText || '').length;
    const previewHeaderModeLabel = activeHeaderType === 'image'
        ? 'Imagen de ejemplo'
        : activeHeaderType === 'video'
            ? 'Video de ejemplo'
            : activeHeaderType === 'document'
                ? 'Documento de ejemplo'
                : 'Sin header multimedia';
    const approvalPayloadBuild = useMemo(() => {
        try {
            return {
                ...buildTemplatePayload(createForm, {
                    variableExamplesByToken,
                    defaultExampleByToken: defaultVariableExamplesByToken
                }),
                error: null
            };
        } catch (error) {
            return {
                metaPayload: null,
                variableIndexMap: {
                    header: buildSequentialPlaceholderMap(createForm.headerText),
                    body: buildSequentialPlaceholderMap(createForm.bodyText),
                    footer: buildSequentialPlaceholderMap(createForm.footerText)
                },
                error: String(error?.message || error || 'Payload invalido')
            };
        }
    }, [createForm, variableExamplesByToken, defaultVariableExamplesByToken]);

    const currentVariableIndexMap = approvalPayloadBuild.variableIndexMap || {
        header: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} },
        body: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} },
        footer: { orderedTokens: [], originalToSequential: {}, sequentialToOriginal: {} }
    };
    const approvalPayloadSummary = useMemo(() => ({
        HEADER: isHeaderMediaType
            ? {
                type: 'MEDIA',
                format: activeHeaderType.toUpperCase(),
                exampleFileName: toText(createForm?.headerMedia?.name) || null
            }
            : activeHeaderType === 'text'
                ? {
                    type: 'TEXT',
                    text: previewText.header || '',
                    placeholders: extractPlaceholderIndexes(
                        applySequentialPlaceholderMap(
                            createForm.headerText,
                            currentVariableIndexMap?.header?.originalToSequential || {}
                        )
                    )
                }
                : { type: 'NONE' },
        BODY: {
            textLength: String(createForm.bodyText || '').length,
            placeholders: extractPlaceholderIndexes(
                applySequentialPlaceholderMap(
                    createForm.bodyText,
                    currentVariableIndexMap?.body?.originalToSequential || {}
                )
            ),
            text: previewText.body || ''
        },
        FOOTER: {
            textLength: String(createForm.footerText || '').length,
            placeholders: extractPlaceholderIndexes(
                applySequentialPlaceholderMap(
                    createForm.footerText,
                    currentVariableIndexMap?.footer?.originalToSequential || {}
                )
            ),
            text: previewText.footer || ''
        },
        BUTTONS: previewButtons.map((buttonRow) => ({
            type: toLower(buttonRow?.type || 'quick_reply'),
            text: toText(buttonRow?.text),
            value: toText(buttonRow?.value) || null
        })),
        VARIABLE_ORDER_BY_COMPONENT: {
            header: currentVariableIndexMap?.header?.orderedTokens || [],
            body: currentVariableIndexMap?.body?.orderedTokens || [],
            footer: currentVariableIndexMap?.footer?.orderedTokens || []
        },
        VARIABLE_REMAP_BY_COMPONENT: {
            header: currentVariableIndexMap?.header?.originalToSequential || {},
            body: currentVariableIndexMap?.body?.originalToSequential || {},
            footer: currentVariableIndexMap?.footer?.originalToSequential || {}
        },
        META_PAYLOAD: approvalPayloadBuild.metaPayload,
        ERROR: approvalPayloadBuild.error
    }), [
        activeHeaderType,
        createForm?.bodyText,
        createForm?.footerText,
        createForm?.headerMedia?.name,
        createForm?.headerText,
        currentVariableIndexMap?.body?.orderedTokens,
        currentVariableIndexMap?.body?.originalToSequential,
        currentVariableIndexMap?.footer?.orderedTokens,
        currentVariableIndexMap?.footer?.originalToSequential,
        currentVariableIndexMap?.header?.orderedTokens,
        currentVariableIndexMap?.header?.originalToSequential,
        isHeaderMediaType,
        approvalPayloadBuild.error,
        approvalPayloadBuild.metaPayload,
        previewButtons,
        previewText.body,
        previewText.footer,
        previewText.header
    ]);

    const headerElement = useMemo(() => (
        <SaasViewHeader
            title="Templates Meta"
            count={total}
            searchValue={filters.search || ''}
            onSearchChange={(value) => {
                updateFilter({ search: value, offset: 0 }).catch((error) => {
                    setError?.(String(error?.message || error || 'No se pudo actualizar la busqueda.'));
                });
            }}
            searchPlaceholder="Buscar template por nombre, categoria o idioma"
            searchDisabled={templatesBusy || tenantScopeLocked}
            actions={[
                {
                    key: 'reload',
                    label: 'Recargar',
                    onClick: () => reloadTemplates().catch((error) => {
                        setError?.(String(error?.message || error || 'No se pudo recargar templates.'));
                    }),
                    disabled: templatesBusy || !settingsTenantId
                },
                {
                    key: 'columns',
                    label: showColumnsPanel ? 'Ocultar columnas' : 'Columnas',
                    onClick: () => setShowColumnsPanel((prev) => !prev),
                    disabled: tenantScopeLocked
                },
                {
                    key: 'create',
                    label: 'Crear template',
                    onClick: () => openCreateTemplatePanel().catch((error) => {
                        const message = String(error?.message || error || 'No se pudo abrir el formulario de templates.');
                        notify({ type: 'error', message });
                        setError?.(message);
                    }),
                    disabled: templatesBusy || !canWrite
                }
            ]}
            extra={!tenantScopeLocked ? (
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
                    <select
                        value={syncModuleId}
                        onChange={(event) => setSyncModuleId(toText(event.target.value))}
                        disabled={templatesBusy || !canWrite}
                    >
                        <option value="">Modulo para sincronizar</option>
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
            ) : null}
        />
    ), [
        canWrite,
        filters.scopeModuleId,
        filters.search,
        filters.status,
        handleSyncTemplates,
        moduleOptions,
        notify,
        openCreateTemplatePanel,
        reloadTemplates,
        setError,
        settingsTenantId,
        showColumnsPanel,
        statusOptions,
        syncModuleId,
        templatesBusy,
        tenantScopeLocked,
        total,
        updateFilter
    ]);

    if (!isMetaTemplatesSection) {
        return null;
    }

    return (
        <section id="saas_templates" className="saas-admin-card saas-admin-card--full">
            <SaasTableDetailLayout
                selectedId={tenantScopeLocked ? '' : (panelMode === 'create' ? '__template_create__' : selectedTemplateId)}
                className={`saas-meta-templates-td-layout ${panelMode === 'create' ? 'saas-meta-templates-td-layout--create' : ''}`.trim()}
                header={headerElement}
                left={(
                    <aside className="saas-admin-master-pane">
                    {tenantScopeLocked && (
                        <div className="saas-admin-empty-state">
                            <h4>Selecciona una empresa</h4>
                            <p>Elige una empresa para gestionar templates Meta.</p>
                        </div>
                    )}

                    {!tenantScopeLocked && (
                        <>
                            {showColumnsPanel ? (
                                <div className="saas-customers-columns-panel">
                                    <div className="saas-customers-columns-header">
                                        <strong>Columnas</strong>
                                        <button type="button" onClick={resetVisibleTableColumnKeys}>Restaurar</button>
                                    </div>
                                    <div className="saas-customers-columns-grid">
                                        {TEMPLATE_TABLE_COLUMNS.map((column) => {
                                            const isChecked = (Array.isArray(visibleTableColumnKeys) ? visibleTableColumnKeys : []).includes(column.key);
                                            return (
                                                <label key={`meta-template-col-${column.key}`} className="saas-customers-columns-item">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(event) => {
                                                            const current = Array.isArray(visibleTableColumnKeys) ? visibleTableColumnKeys : [];
                                                            const next = event.target.checked
                                                                ? [...current, column.key]
                                                                : current.filter((entry) => entry !== column.key);
                                                            setVisibleTableColumnKeys(next.length > 0 ? next : TEMPLATE_DEFAULT_COLUMN_KEYS);
                                                        }}
                                                    />
                                                    <span>{column.label}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}

                            <SaasDataTable
                                columns={tableColumns}
                                rows={tableRows}
                                selectedId={selectedTemplateId}
                                loading={loadingList}
                                emptyText="No hay templates para los filtros seleccionados."
                                onSelect={(row) => {
                                    const nextTemplateId = toText(row?.templateId || row?.id);
                                    if (!nextTemplateId) return;
                                    setSelectedTemplateId(nextTemplateId);
                                    setPanelMode('view');
                                }}
                                enableInfinite
                                initialBatch={80}
                                batchSize={80}
                            />
                        </>
                    )}
                </aside>
                )}
                right={(
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
                        <SaasDetailPanel
                            title="Crear template"
                            subtitle="Formulario inteligente con variables, ejemplos y preview en tiempo real."
                            className="saas-meta-templates-detail-panel"
                            bodyClassName="saas-meta-templates-detail-panel__body"
                            actions={(
                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    <button
                                        type="button"
                                        disabled={templatesBusy || !canWrite}
                                        onClick={() => setPanelMode('view')}
                                    >
                                        Cancelar
                                    </button>
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
                                </div>
                            )}
                        >
                            <SaasDetailPanelSection title="Builder" defaultOpen>
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
                                                    <small className="saas-meta-template-help">
                                                        Este archivo se usa como ejemplo para aprobacion de Meta. El media final se define al enviar la plantilla.
                                                    </small>
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
                                            <span className="saas-meta-template-body-hint">Inserta variables desde el panel derecho (+)</span>
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
                                                setCreateForm(buildInitialForm(createForm.moduleId || moduleOptions[0]?.moduleId || ''));
                                            }}
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </section>

                                <aside className="saas-meta-template-builder__side">
                                    <section className="saas-meta-template-builder__variables">
                                        <div className="saas-admin-related-block saas-meta-template-pane">
                                            <h4>Variables por categoria</h4>
                                            <div className="saas-meta-template-variables-toolbar">
                                                <input
                                                    value={variableSearchQuery}
                                                    onChange={(event) => setVariableSearchQuery(event.target.value)}
                                                    placeholder="Buscar variable..."
                                                    disabled={templatesBusy}
                                                />
                                            </div>
                                            {loadingVarCatalog && <small className="saas-meta-template-help">Cargando catalogo de variables...</small>}
                                            {varCatalogError && <small className="saas-meta-template-error">{varCatalogError}</small>}
                                            {!loadingVarCatalog && !varCatalogError && filteredVarCategories.map((category) => {
                                                const categoryKey = toText(category?.id);
                                                const isExpanded = Boolean(expandedVariableCategories?.[categoryKey]);
                                                return (
                                                    <div key={`template_var_category_${category.id}`} className="saas-meta-template-var-group">
                                                        <button
                                                            type="button"
                                                            className="saas-meta-template-accordion-trigger"
                                                            onClick={() => toggleVariableCategory(categoryKey)}
                                                        >
                                                            <span className="saas-meta-template-accordion-title">
                                                                {category.label}
                                                                <small>{(Array.isArray(category.variables) ? category.variables.length : 0)}</small>
                                                            </span>
                                                            <span className="saas-meta-template-accordion-caret">{isExpanded ? '\u25be' : '\u25b8'}</span>
                                                        </button>
                                                        {isExpanded && (
                                                            <div className="saas-meta-template-var-list">
                                                                {(Array.isArray(category.variables) ? category.variables : []).map((variable) => (
                                                                    <div className="saas-meta-template-var-item" key={`template_var_${category.id}_${variable.key}`}>
                                                                        <div className="saas-meta-template-var-item-main">
                                                                            <span className="saas-meta-template-var-token">{`{{${normalizeTemplateToken(variable?.key)}}}`}</span>
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
                                            {!loadingVarCatalog && !varCatalogError && filteredVarCategories.length === 0 && (
                                                <small className="saas-meta-template-help">Sin resultados para la busqueda.</small>
                                            )}
                                        </div>

                                        <div className="saas-admin-related-block saas-meta-template-pane">
                                            <h4>Ejemplos para variables usadas</h4>
                                            {usedVariables.length === 0 && (
                                                <small className="saas-meta-template-help">Inserta variables en el body/header/footer para configurar ejemplos.</small>
                                            )}
                                            {usedVariables.length > 0 && usedVariables.map((variable) => {
                                                const token = normalizeTemplateToken(variable?.token || variable?.key);
                                                if (!token) return null;
                                                const inputId = `var_example_${token.replace(/[^a-z0-9_]+/gi, '_')}`;
                                                const headerIndex = Number(currentVariableIndexMap?.header?.originalToSequential?.[token]);
                                                const bodyIndex = Number(currentVariableIndexMap?.body?.originalToSequential?.[token]);
                                                const footerIndex = Number(currentVariableIndexMap?.footer?.originalToSequential?.[token]);
                                                const mappedSegments = [];
                                                if (Number.isFinite(headerIndex) && headerIndex > 0) mappedSegments.push(`Header {{${headerIndex}}}`);
                                                if (Number.isFinite(bodyIndex) && bodyIndex > 0) mappedSegments.push(`Body {{${bodyIndex}}}`);
                                                if (Number.isFinite(footerIndex) && footerIndex > 0) mappedSegments.push(`Footer {{${footerIndex}}}`);
                                                const mappedLabel = mappedSegments.length > 0 ? mappedSegments.join(' | ') : '';
                                                const firstMappedIndex = [headerIndex, bodyIndex, footerIndex]
                                                    .find((value) => Number.isFinite(value) && value > 0);
                                                return (
                                                    <div className="saas-meta-template-example-row" key={inputId}>
                                                        <label htmlFor={inputId}>
                                                            {`{{${token}}}`} {toText(variable?.label)} {mappedLabel ? `(${mappedLabel})` : ''}
                                                        </label>
                                                        <input
                                                            id={inputId}
                                                            value={toText(variableExamplesByToken?.[token])}
                                                            onChange={(event) => updateVariableExample(token, event.target.value)}
                                                            placeholder={toText(defaultVariableExamplesByToken?.[token]) || toText(variable?.exampleValue) || `valor_${firstMappedIndex || token}`}
                                                            disabled={templatesBusy || !canWrite}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>

                                    <section className="saas-meta-template-builder__preview">
                                        <h4>Preview</h4>
                                        <div className="saas-template-preview-mode">
                                            <button
                                                type="button"
                                                className={previewMode === 'delivery' ? 'active' : ''}
                                                onClick={() => setPreviewMode('delivery')}
                                            >
                                                Mensaje final al cliente
                                            </button>
                                            <button
                                                type="button"
                                                className={previewMode === 'approval' ? 'active' : ''}
                                                onClick={() => setPreviewMode('approval')}
                                            >
                                                Aprobacion Meta
                                            </button>
                                        </div>
                                        {previewMode === 'delivery' && (
                                            <>
                                                <small className="saas-meta-template-help">Simulacion de entrega al cliente en WhatsApp.</small>
                                                <WhatsAppTemplatePreview
                                                    headerType={activeHeaderType}
                                                    headerText={previewText.header}
                                                    headerMediaSrc={previewHeaderMediaSrc}
                                                    headerMediaLabel={toText(createForm?.headerMedia?.name)}
                                                    bodyText={previewText.body}
                                                    footerText={previewText.footer}
                                                    buttons={previewButtons}
                                                    timeLabel={previewTimeLabel}
                                                    emptyBodyText="Escribe el contenido del template..."
                                                />
                                            </>
                                        )}
                                        {previewMode === 'approval' && (
                                            <>
                                                <small className="saas-meta-template-help">Vista del contenido de ejemplo para revision de Meta.</small>
                                                <div className="saas-template-approval-preview">
                                                    <div className="saas-template-approval-preview__row">
                                                        <span>Header</span>
                                                        <strong>{isHeaderMediaType ? previewHeaderModeLabel : (activeHeaderType === 'text' ? 'Texto' : 'Sin header')}</strong>
                                                    </div>
                                                    {isHeaderMediaType && (
                                                        <div className="saas-template-approval-preview__media">
                                                            {activeHeaderType === 'image' && previewHeaderMediaSrc ? (
                                                                <img src={previewHeaderMediaSrc} alt="Aprobacion header" />
                                                            ) : (
                                                                <div>
                                                                    <strong>{previewHeaderModeLabel}</strong>
                                                                    <small>{toText(createForm?.headerMedia?.name) || 'Sin archivo cargado'}</small>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="saas-template-approval-preview__block">
                                                        <span>Body</span>
                                                        <p>{previewText.body || '-'}</p>
                                                    </div>
                                                    <div className="saas-template-approval-preview__block">
                                                        <span>Footer</span>
                                                        <p>{previewText.footer || '-'}</p>
                                                    </div>
                                                    <div className="saas-template-approval-preview__block">
                                                        <span>Botones</span>
                                                        <p>{previewButtons.length > 0 ? previewButtons.map((row) => toText(row.text)).join(' | ') : 'Sin botones'}</p>
                                                    </div>
                                                    <small className="saas-meta-template-help">
                                                        Nota: este ejemplo se usa para la evaluacion del template. El contenido final puede variar por variables y media al momento de envio.
                                                    </small>
                                                    <div className="saas-template-approval-preview__payload">
                                                        <span>Resumen tecnico (HEADER/BODY/BUTTONS)</span>
                                                        <pre>{JSON.stringify(approvalPayloadSummary, null, 2)}</pre>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </section>
                                </aside>
                            </div>
                            </SaasDetailPanelSection>
                        </SaasDetailPanel>
                    )}

                    {!tenantScopeLocked && panelMode !== 'create' && selectedTemplate && (
                        <SaasDetailPanel
                            title={toText(selectedTemplate.templateName) || selectedTemplate.templateId}
                            subtitle={selectedTemplate.templateId}
                            className="saas-meta-templates-detail-panel"
                            bodyClassName="saas-meta-templates-detail-panel__body"
                            actions={(
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
                            )}
                        >
                            <SaasDetailPanelSection title="Metadata" defaultOpen>
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
                            </SaasDetailPanelSection>

                            <SaasDetailPanelSection title="Preview + Payload tecnico" defaultOpen>
                                <div className="saas-template-detail-layout">
                                    <div className="saas-admin-related-block saas-template-detail-preview-pane">
                                        <h4>Preview WhatsApp</h4>
                                        <small className="saas-meta-template-help">Vista estimada del mensaje final para cliente usando examples del template.</small>
                                        <WhatsAppTemplatePreview
                                            headerType={selectedTemplatePreview?.headerType}
                                            headerText={selectedTemplatePreview?.headerText}
                                            headerMediaSrc={selectedTemplatePreview?.headerMediaSrc}
                                            headerMediaLabel={selectedTemplatePreview?.headerMediaLabel}
                                            bodyText={selectedTemplatePreview?.bodyText}
                                            footerText={selectedTemplatePreview?.footerText}
                                            buttons={selectedTemplatePreview?.buttons}
                                            timeLabel={new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                                            emptyBodyText="Template sin body"
                                        />
                                    </div>
                                    <div className="saas-admin-related-block saas-template-detail-payload-pane">
                                        <h4>Payload tecnico</h4>
                                        <div className="saas-template-detail-meta-grid">
                                            <div className="saas-template-detail-meta-item">
                                                <span>Estado Meta</span>
                                                <strong>{resolveStatusMeta(selectedTemplate?.status).label}</strong>
                                            </div>
                                            <div className="saas-template-detail-meta-item">
                                                <span>Meta ID</span>
                                                <strong>{toText(selectedTemplate?.metaTemplateId) || '-'}</strong>
                                            </div>
                                        </div>
                                        {selectedTemplate?.rejectionReason && (
                                            <div className="saas-template-detail-rejection">
                                                <span>Motivo de rechazo</span>
                                                <p>{toText(selectedTemplate?.rejectionReason)}</p>
                                            </div>
                                        )}
                                        <pre>{JSON.stringify(selectedTemplate?.componentsJson || [], null, 2)}</pre>
                                    </div>
                                </div>
                            </SaasDetailPanelSection>
                        </SaasDetailPanel>
                    )}
                </div>
                )}
            />
        </section>
    );
}

export default React.memo(MetaTemplatesSection);
