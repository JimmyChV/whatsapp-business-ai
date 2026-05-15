import React from 'react';
import EmojiPicker from 'emoji-picker-react';
import { EmojiStyle, SkinTonePickerLocation, SkinTones, SuggestionMode, Theme } from 'emoji-picker-react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { SaasEntityPage } from '../components/layout';

const text = (value) => String(value ?? '').trim();
const QUICK_REPLY_EMOJI_SKIN_TONE_STORAGE_KEY = 'chat-emoji-skin-tone:global';

const QUICK_REPLY_FALLBACK_VARIABLE_CATEGORIES = Object.freeze([
    {
        id: 'cliente',
        label: 'Cliente',
        variables: [
            { key: 'nombre_cliente', label: 'Nombre del cliente', description: 'Nombre visible para saludo.', exampleValue: 'Maria Perez' },
            { key: 'telefono_cliente', label: 'Telefono del cliente', description: 'Telefono principal.', exampleValue: '+51941443776' },
            { key: 'email_cliente', label: 'Email del cliente', description: 'Correo del cliente.', exampleValue: 'cliente@correo.com' },
            { key: 'customer_id', label: 'ID de cliente', description: 'Identificador interno.', exampleValue: 'CUS-8K2M4P' }
        ]
    },
    {
        id: 'agente',
        label: 'Agente',
        variables: [
            { key: 'nombre_agente', label: 'Nombre del agente', description: 'Asesor asignado al chat.', exampleValue: 'Owner Lavitat' },
            { key: 'rol_agente', label: 'Rol del agente', description: 'Rol operativo.', exampleValue: 'seller' },
            { key: 'modulo_chat_id', label: 'Modulo del chat', description: 'Modulo/canal del chat.', exampleValue: 'MOD-4Q8K5C' }
        ]
    },
    {
        id: 'comercial',
        label: 'Comercial',
        variables: [
            { key: 'estado_comercial_chat', label: 'Estado comercial', description: 'Estado comercial actual.', exampleValue: 'cotizado' },
            { key: 'estado_asignacion_chat', label: 'Estado de asignacion', description: 'Estado operativo del chat.', exampleValue: 'active' }
        ]
    },
    {
        id: 'cotizacion',
        label: 'Cotizacion',
        variables: [
            { key: 'ultima_cotizacion_id', label: 'ID de ultima cotizacion', description: 'Ultima cotizacion enviada.', exampleValue: 'quote_mnb9jysp_tg3fiy' },
            { key: 'ultima_cotizacion_total', label: 'Total de ultima cotizacion', description: 'Total final.', exampleValue: '186.2' },
            { key: 'ultima_cotizacion_items_count', label: 'Items cotizados', description: 'Cantidad de items.', exampleValue: '3' }
        ]
    },
    {
        id: 'origen',
        label: 'Origen',
        variables: [
            { key: 'origen_chat_tipo', label: 'Origen del chat', description: 'Origen detectado.', exampleValue: 'meta_ad' },
            { key: 'origen_campana_id', label: 'ID de campana', description: 'Campana asociada.', exampleValue: 'camp_abril_2026_01' }
        ]
    }
]);

function renderWhatsAppFormattedText(value) {
    const raw = String(value || '');
    if (!raw) return <span className="saas-quick-reply-preview-muted">El texto aparecera aqui...</span>;
    const tokenRegex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
    return raw.split('\n').map((line, lineIndex) => {
        const parts = [];
        let lastIndex = 0;
        line.replace(tokenRegex, (match, _token, offset) => {
            if (offset > lastIndex) parts.push(line.slice(lastIndex, offset));
            const content = match.slice(1, -1);
            const key = `qr_fmt_${lineIndex}_${offset}`;
            if (match.startsWith('*')) parts.push(<strong key={key}>{content}</strong>);
            else if (match.startsWith('_')) parts.push(<em key={key}>{content}</em>);
            else if (match.startsWith('~')) parts.push(<del key={key}>{content}</del>);
            else parts.push(<code key={key}>{content}</code>);
            lastIndex = offset + match.length;
            return match;
        });
        if (lastIndex < line.length) parts.push(line.slice(lastIndex));
        return (
            <React.Fragment key={`qr_fmt_line_${lineIndex}`}>
                {parts.length > 0 ? parts : ' '}
                {lineIndex < raw.split('\n').length - 1 ? <br /> : null}
            </React.Fragment>
        );
    });
}

function collectVariableCategories(payload = {}) {
    const categories = Array.isArray(payload?.categories) ? payload.categories : [];
    const normalizedCategories = categories
        .map((category = {}) => ({
            id: text(category?.id || category?.key).toLowerCase(),
            label: text(category?.label || category?.id || category?.key),
            variables: (Array.isArray(category?.variables) ? category.variables : [])
                .map((variable = {}) => ({
                    ...variable,
                    key: text(variable?.key),
                    label: text(variable?.label || variable?.key),
                    description: text(variable?.description),
                    exampleValue: text(variable?.exampleValue || variable?.previewValue)
                }))
                .filter((variable) => variable.key)
        }))
        .filter((category) => category.id && category.label && category.variables.length > 0);
    if (normalizedCategories.length > 0) return normalizedCategories;

    const variables = Array.isArray(payload?.variables) ? payload.variables : [];
    if (variables.length > 0) {
        const grouped = new Map();
        variables.forEach((variable = {}) => {
            const categoryId = text(variable?.categoryId || variable?.category || 'general').toLowerCase() || 'general';
            const categoryLabel = text(variable?.categoryLabel || variable?.category || categoryId);
            if (!grouped.has(categoryId)) grouped.set(categoryId, { id: categoryId, label: categoryLabel, variables: [] });
            const key = text(variable?.key);
            if (key) grouped.get(categoryId).variables.push({
                ...variable,
                key,
                label: text(variable?.label || key),
                description: text(variable?.description),
                exampleValue: text(variable?.exampleValue || variable?.previewValue)
            });
        });
        const groupedCategories = Array.from(grouped.values()).filter((category) => category.variables.length > 0);
        if (groupedCategories.length > 0) return groupedCategories;
    }

    return QUICK_REPLY_FALLBACK_VARIABLE_CATEGORIES.map((category) => ({
        ...category,
        variables: category.variables.map((variable) => ({ ...variable }))
    }));
}

function renderQuickReplyPreviewText(value, categories = []) {
    const variableMap = new Map((Array.isArray(categories) ? categories : [])
        .flatMap((category) => (Array.isArray(category?.variables) ? category.variables : []))
        .map((variable) => [
            text(variable?.key).toLowerCase(),
            text(variable?.exampleValue || variable?.previewValue)
        ]));
    return String(value || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => (
        variableMap.get(String(key || '').trim().toLowerCase()) || match
    ));
}

export default function QuickRepliesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const { confirm } = useUiFeedback();
    const {
        busy,
        loadingQuickReplies,
        settingsTenantId,
        loadQuickReplyData,
        setError,
        canManageQuickReplies,
        openQuickReplyLibraryCreate,
        quickReplyModuleFilterId,
        setQuickReplyModuleFilterId,
        setSelectedQuickReplyLibraryId,
        setSelectedQuickReplyItemId,
        setQuickReplyLibraryPanelMode,
        setQuickReplyItemPanelMode,
        waModules = [],
        visibleQuickReplyLibraries = [],
        selectedQuickReplyLibrary,
        quickReplyLibraryPanelMode,
        openQuickReplyLibraryEdit,
        runAction,
        deactivateQuickReplyLibrary,
        quickReplyLibraryForm = {},
        setQuickReplyLibraryForm,
        toggleModuleInQuickReplyLibraryForm,
        saveQuickReplyLibrary,
        cancelQuickReplyLibraryEdit,
        QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
        visibleQuickReplyItemsForSelectedLibrary = [],
        quickReplyUploadMaxMb,
        quickReplyStorageQuotaMb,
        normalizeQuickReplyMediaAssets,
        selectedQuickReplyItem,
        quickReplyItemPanelMode,
        openQuickReplyItemEdit,
        deactivateQuickReplyItem,
        selectedQuickReplyItemMediaAssets = [],
        formatDateTimeLabel = (value) => value || '-',
        resolveQuickReplyAssetPreviewUrl = (value) => value,
        getQuickReplyAssetDisplayName = (asset, index) => asset?.filename || asset?.name || `Adjunto ${index + 1}`,
        isQuickReplyImageAsset = () => false,
        getQuickReplyAssetTypeLabel = () => 'file',
        formatBytes = (value) => value,
        quickReplyItemForm = {},
        setQuickReplyItemForm,
        uploadingQuickReplyAssets,
        QUICK_REPLY_ACCEPT_VALUE,
        handleQuickReplyAssetSelection,
        quickReplyItemFormAssets = [],
        removeQuickReplyAssetAt,
        saveQuickReplyItem,
        cancelQuickReplyItemEdit,
        openQuickReplyItemCreate,
        requestJson
    } = context;

    const isLibraryEditing = quickReplyLibraryPanelMode === 'create' || quickReplyLibraryPanelMode === 'edit';
    const isItemEditing = quickReplyItemPanelMode === 'create' || quickReplyItemPanelMode === 'edit';
    const quickReplyTextRef = React.useRef(null);
    const [quickReplyVariableCategories, setQuickReplyVariableCategories] = React.useState(() => collectVariableCategories({}));
    const [quickReplyVariableLoading, setQuickReplyVariableLoading] = React.useState(false);
    const [quickReplyVariableError, setQuickReplyVariableError] = React.useState('');
    const [quickReplyVariableSearch, setQuickReplyVariableSearch] = React.useState('');
    const [quickReplyVariableCatalogLoaded, setQuickReplyVariableCatalogLoaded] = React.useState(false);
    const [quickReplyExpandedVariableCategories, setQuickReplyExpandedVariableCategories] = React.useState({});
    const [showQuickReplyEmojiPicker, setShowQuickReplyEmojiPicker] = React.useState(false);
    const [quickReplyEmojiSkinTone, setQuickReplyEmojiSkinTone] = React.useState(() => {
        if (typeof window === 'undefined') return SkinTones.NEUTRAL;
        try {
            const stored = window.localStorage.getItem(QUICK_REPLY_EMOJI_SKIN_TONE_STORAGE_KEY);
            return Object.values(SkinTones).includes(stored) ? stored : SkinTones.NEUTRAL;
        } catch (_) {
            return SkinTones.NEUTRAL;
        }
    });
    const selectedId = quickReplyLibraryPanelMode === 'create'
        ? '__create_quick_reply_library__'
        : text(selectedQuickReplyLibrary?.libraryId);

    const quickReplyItemInitialSignature = React.useMemo(() => {
        if (quickReplyItemPanelMode === 'create') {
            return JSON.stringify({
                label: '',
                text: '',
                mediaUrl: '',
                buttons: [],
                isActive: true,
                assets: []
            });
        }
        const item = selectedQuickReplyItem || {};
        const assets = Array.isArray(selectedQuickReplyItemMediaAssets) ? selectedQuickReplyItemMediaAssets : [];
        return JSON.stringify({
            label: text(item.label),
            text: String(item.text || ''),
            mediaUrl: text(item.mediaUrl),
            buttons: (Array.isArray(item.buttons) ? item.buttons : [])
                .map((button, index) => ({
                    id: text(button?.id) || `btn_${index + 1}`,
                    title: text(button?.title || button?.label || button?.text).slice(0, 20)
                }))
                .slice(0, 3),
            isActive: item.isActive !== false,
            assets: assets.map((asset) => text(asset?.url || asset?.mediaUrl || asset?.filename || asset?.fileName)).filter(Boolean)
        });
    }, [quickReplyItemPanelMode, selectedQuickReplyItem, selectedQuickReplyItemMediaAssets]);

    const quickReplyItemCurrentSignature = React.useMemo(() => JSON.stringify({
        label: text(quickReplyItemForm.label),
        text: String(quickReplyItemForm.text || ''),
        mediaUrl: text(quickReplyItemForm.mediaUrl),
        buttons: (Array.isArray(quickReplyItemForm.buttons) ? quickReplyItemForm.buttons : [])
            .map((button, index) => ({
                id: text(button?.id) || `btn_${index + 1}`,
                title: text(button?.title || button?.label || button?.text).slice(0, 20)
            }))
            .slice(0, 3),
        isActive: quickReplyItemForm.isActive !== false,
        assets: (Array.isArray(quickReplyItemFormAssets) ? quickReplyItemFormAssets : [])
            .map((asset) => text(asset?.url || asset?.mediaUrl || asset?.filename || asset?.fileName))
            .filter(Boolean)
    }), [quickReplyItemForm, quickReplyItemFormAssets]);

    const quickReplyItemHasChanges = isItemEditing && quickReplyItemCurrentSignature !== quickReplyItemInitialSignature;

    const rows = React.useMemo(() => visibleQuickReplyLibraries.map((library) => ({
        id: text(library?.libraryId).toUpperCase(),
        name: library?.name || library?.libraryId || '-',
        textPreview: library?.description || '-',
        sortOrder: String(library?.sortOrder ?? '-'),
        scope: library?.isShared ? 'Compartida' : 'Por módulo',
        status: library?.isActive === false ? 'Inactiva' : 'Activa',
        modules: Array.isArray(library?.moduleIds) ? String(library.moduleIds.length) : '0',
        updatedAt: formatDateTimeLabel(library?.updatedAt),
        raw: library
    })), [formatDateTimeLabel, visibleQuickReplyLibraries]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Etiqueta', width: '24%', sortable: true },
        { key: 'textPreview', label: 'Texto', width: '30%', sortable: true, hidden: true },
        { key: 'sortOrder', label: 'Orden', width: '12%', sortable: true, hidden: true },
        { key: 'updatedAt', label: 'Actualizado', width: '18%', sortable: true, hidden: true },
        { key: 'scope', label: 'Alcance', width: '18%', sortable: true, hidden: true },
        { key: 'modules', label: 'Módulos', width: '14%', sortable: true, hidden: true },
        { key: 'status', label: 'Estado', width: '16%', sortable: true },
        { key: 'id', label: 'Código', width: '20%', sortable: true, hidden: true }
    ], []);

    const filters = React.useMemo(() => [
        {
            key: 'scope',
            label: 'Alcance',
            type: 'select',
            options: [
                { value: 'Compartida', label: 'Compartida' },
                { value: 'Por módulo', label: 'Por módulo' }
            ]
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

    const close = React.useCallback(() => {
        if (isItemEditing) {
            cancelQuickReplyItemEdit?.();
            return;
        }
        if (isLibraryEditing) {
            cancelQuickReplyLibraryEdit?.();
            return;
        }
        setSelectedQuickReplyItemId?.('');
        setSelectedQuickReplyLibraryId?.('');
        setQuickReplyItemPanelMode?.('view');
        setQuickReplyLibraryPanelMode?.('view');
    }, [
        cancelQuickReplyItemEdit,
        cancelQuickReplyLibraryEdit,
        isItemEditing,
        isLibraryEditing,
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryPanelMode,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId
    ]);

    const selectLibrary = React.useCallback((libraryId) => {
        setSelectedQuickReplyLibraryId?.(text(libraryId).toUpperCase());
        setSelectedQuickReplyItemId?.('');
        setQuickReplyLibraryPanelMode?.('view');
        setQuickReplyItemPanelMode?.('view');
    }, [
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryPanelMode,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId
    ]);

    const renderLibraryForm = React.useCallback(({ close: requestClose } = {}) => (
        <div className="saas-admin-related-block">
            <div className="saas-admin-form-row">
                <input value={quickReplyLibraryForm.name || ''} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nombre de biblioteca" disabled={busy} />
                <input value={quickReplyLibraryForm.description || ''} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, description: event.target.value }))} placeholder="descripción" disabled={busy} />
            </div>
            <div className="saas-admin-modules">
                <label className="saas-admin-module-toggle">
                    <input type="checkbox" checked={quickReplyLibraryForm.isShared === true} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, isShared: event.target.checked }))} disabled={busy} />
                    <span>Biblioteca compartida</span>
                </label>
                <label className="saas-admin-module-toggle">
                    <input type="checkbox" checked={quickReplyLibraryForm.isActive !== false} onChange={(event) => setQuickReplyLibraryForm?.((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                    <span>Biblioteca activa</span>
                </label>
            </div>
            {!quickReplyLibraryForm.isShared ? (
                <div className="saas-admin-modules">
                    {waModules.map((moduleItem) => {
                        const moduleId = text(moduleItem?.moduleId).toLowerCase();
                        const checked = Array.isArray(quickReplyLibraryForm.moduleIds) && quickReplyLibraryForm.moduleIds.includes(moduleId);
                        return (
                            <label key={`qr_library_module_${moduleId}`} className="saas-admin-module-toggle">
                                <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggleModuleInQuickReplyLibraryForm?.(moduleId)} />
                                <span>{moduleItem?.name || moduleId}</span>
                            </label>
                        );
                    })}
                </div>
            ) : null}
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !canManageQuickReplies || !text(quickReplyLibraryForm.name)} onClick={() => runAction?.(quickReplyLibraryPanelMode === 'create' ? 'Biblioteca creada' : 'Biblioteca actualizada', async () => saveQuickReplyLibrary?.())}>
                    {quickReplyLibraryPanelMode === 'create' ? 'Guardar biblioteca' : 'Actualizar biblioteca'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void requestClose?.(); }}>Cancelar</button>
            </div>
        </div>
    ), [
        busy,
        canManageQuickReplies,
        quickReplyLibraryForm,
        quickReplyLibraryPanelMode,
        runAction,
        saveQuickReplyLibrary,
        setQuickReplyLibraryForm,
        toggleModuleInQuickReplyLibraryForm,
        waModules
    ]);

    React.useEffect(() => {
        if (!isItemEditing || quickReplyVariableCatalogLoaded || quickReplyVariableLoading || typeof requestJson !== 'function') return;
        let cancelled = false;
        setQuickReplyVariableLoading(true);
        setQuickReplyVariableError('');
        requestJson('/api/tenant/template-variables/catalog')
            .then((payload) => {
                if (cancelled) return;
                setQuickReplyVariableCategories(collectVariableCategories(payload));
                setQuickReplyVariableCatalogLoaded(true);
            })
            .catch(() => {
                if (cancelled) return;
                setQuickReplyVariableError('');
                setQuickReplyVariableCategories(collectVariableCategories({}));
                setQuickReplyVariableCatalogLoaded(true);
            })
            .finally(() => {
                if (!cancelled) setQuickReplyVariableLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isItemEditing, quickReplyVariableCatalogLoaded, quickReplyVariableLoading, requestJson]);

    React.useEffect(() => {
        setQuickReplyExpandedVariableCategories((prev) => {
            const next = { ...(prev || {}) };
            (Array.isArray(quickReplyVariableCategories) ? quickReplyVariableCategories : []).forEach((category) => {
                const key = text(category?.id || category?.label).toLowerCase();
                if (key && next[key] === undefined) next[key] = true;
            });
            return next;
        });
    }, [quickReplyVariableCategories]);

    const wrapQuickReplySelection = React.useCallback((prefix, suffix = prefix) => {
        const markerStart = String(prefix || '');
        const markerEnd = String(suffix || markerStart);
        const input = quickReplyTextRef.current;
        const currentText = String(quickReplyItemForm.text || '');
        const start = Number(input?.selectionStart ?? currentText.length);
        const end = Number(input?.selectionEnd ?? currentText.length);
        const selectedText = currentText.slice(start, end);
        const nextText = `${currentText.slice(0, start)}${markerStart}${selectedText}${markerEnd}${currentText.slice(end)}`;
        setQuickReplyItemForm?.((prev) => ({ ...prev, text: nextText }));
        window.requestAnimationFrame?.(() => {
            const nextInput = quickReplyTextRef.current;
            if (!nextInput) return;
            nextInput.focus();
            const cursorStart = selectedText ? start : start + markerStart.length;
            const cursorEnd = selectedText ? end + markerStart.length + markerEnd.length : cursorStart;
            nextInput.setSelectionRange(cursorStart, cursorEnd);
        });
    }, [quickReplyItemForm.text, setQuickReplyItemForm]);

    const insertQuickReplyEmoji = React.useCallback((emoji = '') => {
        const safeEmoji = String(emoji || '');
        if (!safeEmoji) return;
        const input = quickReplyTextRef.current;
        const currentText = String(quickReplyItemForm.text || '');
        const start = Number(input?.selectionStart ?? currentText.length);
        const end = Number(input?.selectionEnd ?? currentText.length);
        const nextText = `${currentText.slice(0, start)}${safeEmoji}${currentText.slice(end)}`;
        setQuickReplyItemForm?.((prev) => ({ ...prev, text: nextText }));
        setShowQuickReplyEmojiPicker(false);
        window.requestAnimationFrame?.(() => {
            const nextInput = quickReplyTextRef.current;
            if (!nextInput) return;
            nextInput.focus();
            const cursor = start + safeEmoji.length;
            nextInput.setSelectionRange(cursor, cursor);
        });
    }, [quickReplyItemForm.text, setQuickReplyItemForm]);

    const handleQuickReplyEmojiSkinToneChange = React.useCallback((skinTone) => {
        const safeSkinTone = Object.values(SkinTones).includes(skinTone) ? skinTone : SkinTones.NEUTRAL;
        setQuickReplyEmojiSkinTone(safeSkinTone);
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(QUICK_REPLY_EMOJI_SKIN_TONE_STORAGE_KEY, safeSkinTone);
        } catch (_) { }
    }, []);

    const insertQuickReplyVariable = React.useCallback((variableKey = '') => {
        const cleanKey = text(variableKey);
        if (!cleanKey) return;
        const token = `{{${cleanKey}}}`;
        const input = quickReplyTextRef.current;
        const currentText = String(quickReplyItemForm.text || '');
        const start = Number(input?.selectionStart ?? currentText.length);
        const end = Number(input?.selectionEnd ?? currentText.length);
        const nextText = `${currentText.slice(0, start)}${token}${currentText.slice(end)}`;
        setQuickReplyItemForm?.((prev) => ({ ...prev, text: nextText }));
        window.requestAnimationFrame?.(() => {
            const nextInput = quickReplyTextRef.current;
            if (!nextInput) return;
            nextInput.focus();
            const cursor = start + token.length;
            nextInput.setSelectionRange(cursor, cursor);
        });
    }, [quickReplyItemForm.text, setQuickReplyItemForm]);

    const filteredQuickReplyVariableCategories = React.useMemo(() => {
        const query = text(quickReplyVariableSearch).toLowerCase();
        const categories = Array.isArray(quickReplyVariableCategories) ? quickReplyVariableCategories : [];
        if (!query) return categories;
        return categories
            .map((category) => ({
                ...category,
                variables: (Array.isArray(category?.variables) ? category.variables : []).filter((variable) => (
                    `${text(variable?.key)} ${text(variable?.label)} ${text(variable?.description)}`.toLowerCase().includes(query)
                ))
            }))
            .filter((category) => Array.isArray(category.variables) && category.variables.length > 0);
    }, [quickReplyVariableCategories, quickReplyVariableSearch]);

    const toggleQuickReplyVariableCategory = React.useCallback((categoryKey = '') => {
        const key = text(categoryKey).toLowerCase();
        if (!key) return;
        setQuickReplyExpandedVariableCategories((prev) => ({ ...(prev || {}), [key]: !prev?.[key] }));
    }, []);

    const requestCloseQuickReplyItemBuilder = React.useCallback(async (requestClose = null) => {
        if (quickReplyItemHasChanges) {
            const ok = await confirm({
                title: 'Descartar cambios',
                message: '¿Descartar cambios en esta respuesta rápida?',
                confirmText: 'Descartar',
                cancelText: 'Seguir editando',
                tone: 'danger'
            });
            if (!ok) return;
        }
        await requestClose?.();
    }, [confirm, quickReplyItemHasChanges]);

    const renderItemForm = React.useCallback(({ close: requestClose } = {}) => {
        const hasRequiredContent = Boolean(text(quickReplyItemForm.text) || quickReplyItemFormAssets.length > 0 || text(quickReplyItemForm.mediaUrl));
        const saveDisabled = busy || uploadingQuickReplyAssets || !canManageQuickReplies || !text(quickReplyItemForm.label) || !hasRequiredContent;
        const handleClose = () => { void requestCloseQuickReplyItemBuilder(requestClose); };
        const previewAsset = quickReplyItemFormAssets[0] || null;
        const previewMediaUrl = resolveQuickReplyAssetPreviewUrl(previewAsset?.url || quickReplyItemForm.mediaUrl || '');
        const previewMediaName = text(previewAsset?.fileName || previewAsset?.filename || quickReplyItemForm.mediaFileName || 'Adjunto');
        const previewIsImage = previewAsset
            ? isQuickReplyImageAsset(previewAsset)
            : /\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i.test(previewMediaUrl);

        return (
            <div className="saas-quick-reply-builder-overlay" onClick={handleClose}>
                <div className="saas-quick-reply-builder-shell" onClick={(event) => event.stopPropagation()}>
                    <div className="saas-quick-reply-builder-header">
                        <div>
                            <h4>{quickReplyItemPanelMode === 'create' ? 'Nueva respuesta rapida' : 'Editar respuesta rapida'}</h4>
                            <small>Construye una respuesta con formato, variables, adjuntos y botones.</small>
                        </div>
                        <button type="button" className="saas-btn-cancel" disabled={busy || uploadingQuickReplyAssets} onClick={handleClose}>Cerrar</button>
                    </div>
                    <div className="saas-quick-reply-editor-layout">
                        <section className="saas-quick-reply-editor-main saas-quick-reply-editor-main--form" aria-label="Formulario de respuesta rapida">
                            <div className="saas-admin-form-row">
                                <label>Etiqueta</label>
                                <input value={quickReplyItemForm.label || ''} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, label: event.target.value }))} placeholder="Ej: Saludo inicial" disabled={busy || uploadingQuickReplyAssets} />
                            </div>
                            <div className="saas-admin-form-row">
                                <label>Mensaje</label>
                                <textarea ref={quickReplyTextRef} value={quickReplyItemForm.text || ''} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, text: event.target.value }))} rows={8} placeholder="Escribe el mensaje. Puedes insertar variables desde la columna central." disabled={busy || uploadingQuickReplyAssets} />
                            </div>
                            <div className="saas-quick-reply-format-toolbar" aria-label="Formato WhatsApp">
                                <span>Formato WhatsApp</span>
                                <div className="saas-quick-reply-emoji-wrap">
                                    <button
                                        type="button"
                                        disabled={busy || uploadingQuickReplyAssets}
                                        onClick={() => setShowQuickReplyEmojiPicker((prev) => !prev)}
                                        aria-label="Insertar emoji"
                                    >
                                        🙂
                                    </button>
                                    {showQuickReplyEmojiPicker ? (
                                        <div className="saas-quick-reply-emoji-panel" onClick={(event) => event.stopPropagation()}>
                                            <EmojiPicker
                                                onEmojiClick={(emojiData) => insertQuickReplyEmoji(emojiData?.emoji)}
                                                onSkinToneChange={handleQuickReplyEmojiSkinToneChange}
                                                width="100%"
                                                height={360}
                                                lazyLoadEmojis
                                                skinTonesDisabled={false}
                                                searchDisabled={false}
                                                searchPlaceHolder="Buscar emoji o gesto"
                                                defaultSkinTone={quickReplyEmojiSkinTone}
                                                suggestedEmojisMode={SuggestionMode.FREQUENT}
                                                skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
                                                emojiStyle={EmojiStyle.APPLE}
                                                previewConfig={{ showPreview: false }}
                                                theme={Theme.AUTO}
                                            />
                                        </div>
                                    ) : null}
                                </div>
                                <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => wrapQuickReplySelection('*')}><strong>B</strong></button>
                                <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => wrapQuickReplySelection('_')}><em>I</em></button>
                                <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => wrapQuickReplySelection('~')}><del>S</del></button>
                                <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => wrapQuickReplySelection('`')}><code>M</code></button>
                            </div>
                            <div className="saas-admin-related-block">
                                <h4>Adjunto</h4>
                                <div className="saas-admin-form-row">
                                    <input value={quickReplyItemForm.mediaUrl || ''} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, mediaUrl: event.target.value, mediaMimeType: prev.mediaMimeType || '' }))} placeholder="URL principal (opcional)" disabled={busy || uploadingQuickReplyAssets} />
                                    <label className={`saas-admin-dropzone ${busy || uploadingQuickReplyAssets ? 'is-disabled' : ''}`.trim()} style={{ minHeight: 'auto', padding: '10px 12px' }}>
                                        <input
                                            type="file"
                                            multiple
                                            accept={QUICK_REPLY_ACCEPT_VALUE}
                                            disabled={busy || uploadingQuickReplyAssets}
                                            onChange={async (event) => {
                                                const files = Array.from(event.target.files || []);
                                                event.target.value = '';
                                                if (files.length === 0) return;
                                                try {
                                                    await handleQuickReplyAssetSelection?.(files);
                                                } catch (uploadError) {
                                                    setError?.(String(uploadError?.message || uploadError || 'No se pudo subir adjunto de respuesta rapida.'));
                                                }
                                            }}
                                        />
                                        <strong>{uploadingQuickReplyAssets ? 'Subiendo adjuntos...' : 'Subir adjuntos'}</strong>
                                        <small>JPEG o PNG recomendado para WhatsApp. Max 50 MB.</small>
                                    </label>
                                </div>
                                {quickReplyItemFormAssets.length > 0 ? (
                                    <div className="saas-admin-related-list">
                                        {quickReplyItemFormAssets.map((asset, assetIdx) => {
                                            const fileLabel = getQuickReplyAssetDisplayName(asset, assetIdx);
                                            return (
                                                <div key={`qr_item_asset_edit_${assetIdx}`} className="saas-admin-related-row" role="status">
                                                    <span>{fileLabel}</span>
                                                    <small>{asset.mimeType || 'archivo'}{asset.sizeBytes ? ` | ${formatBytes(asset.sizeBytes)}` : ''}</small>
                                                    <button type="button" disabled={busy || uploadingQuickReplyAssets} onClick={() => removeQuickReplyAssetAt?.(assetIdx)}>Quitar</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                            <div className="saas-quick-reply-flow-note">
                                <strong>Botones y flujos</strong>
                                <span>Configuralos desde Automatizaciones para definir intencion, demora y siguiente respuesta sin mezclarlo con el contenido reutilizable.</span>
                            </div>
                            <label className="saas-admin-module-toggle">
                                <input type="checkbox" checked={quickReplyItemForm.isActive !== false} onChange={(event) => setQuickReplyItemForm?.((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy || uploadingQuickReplyAssets} />
                                <span>Respuesta activa</span>
                            </label>
                            {!hasRequiredContent ? <small className="saas-meta-template-error">Agrega texto o un adjunto para guardar la respuesta.</small> : null}
                            <div className="saas-admin-form-row saas-admin-form-row--actions saas-quick-reply-builder-actions">
                                <button
                                    type="button"
                                    disabled={saveDisabled}
                                    onClick={() => runAction?.(quickReplyItemPanelMode === 'create' ? 'Respuesta rapida creada' : 'Respuesta rapida actualizada', async () => saveQuickReplyItem?.())}
                                >
                                    {quickReplyItemPanelMode === 'create' ? 'Guardar respuesta' : 'Actualizar respuesta'}
                                </button>
                                <button type="button" className="saas-btn-cancel" disabled={busy || uploadingQuickReplyAssets} onClick={handleClose}>Cancelar</button>
                            </div>
                        </section>
                        <aside className="saas-quick-reply-variable-panel" aria-label="Variables disponibles">
                            <div className="saas-quick-reply-variable-panel__head">
                                <strong>Variables</strong>
                                <input
                                    value={quickReplyVariableSearch}
                                    onChange={(event) => setQuickReplyVariableSearch(event.target.value)}
                                    placeholder="Buscar variable..."
                                    disabled={busy || quickReplyVariableLoading}
                                />
                            </div>
                            {quickReplyVariableLoading ? <small className="saas-quick-reply-preview-muted">Cargando variables...</small> : null}
                            {quickReplyVariableError ? <small className="saas-meta-template-error">{quickReplyVariableError}</small> : null}
                            {!quickReplyVariableLoading && !quickReplyVariableError ? (
                                <div className="saas-quick-reply-variable-list">
                                    {filteredQuickReplyVariableCategories.map((category) => {
                                        const categoryKey = text(category?.id || category?.label).toLowerCase();
                                        const variables = Array.isArray(category?.variables) ? category.variables : [];
                                        const isExpanded = quickReplyExpandedVariableCategories?.[categoryKey] !== false;
                                        return (
                                            <div key={`qr_var_group_${category?.id}`} className="saas-quick-reply-variable-group">
                                                <button
                                                    type="button"
                                                    className="saas-meta-template-accordion-trigger"
                                                    onClick={() => toggleQuickReplyVariableCategory(categoryKey)}
                                                >
                                                    <span className="saas-meta-template-accordion-title">
                                                        {category?.label || category?.id}
                                                        <small>{variables.length}</small>
                                                    </span>
                                                    <span className="saas-meta-template-accordion-caret">{isExpanded ? '▾' : '▸'}</span>
                                                </button>
                                                {isExpanded ? (
                                                    <div className="saas-meta-template-var-list">
                                                        {variables.map((variable) => (
                                                            <div className="saas-meta-template-var-item" key={`qr_var_${category?.id}_${variable?.key}`}>
                                                                <div className="saas-meta-template-var-item-main">
                                                                    <span className="saas-meta-template-var-token">{`{{${variable?.key}}}`}</span>
                                                                    <strong>{variable?.label || variable?.key}</strong>
                                                                    <small>{variable?.description || variable?.exampleValue || variable?.key}</small>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className="saas-btn saas-btn--primary saas-meta-template-var-insert"
                                                                    disabled={busy || uploadingQuickReplyAssets}
                                                                    onClick={() => insertQuickReplyVariable(variable?.key)}
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                    {filteredQuickReplyVariableCategories.length === 0 ? <small className="saas-quick-reply-preview-muted">Sin variables para mostrar.</small> : null}
                                </div>
                            ) : null}
                        </aside>
                        <aside className="saas-quick-reply-preview" aria-label="Preview WhatsApp">
                            <h5>Preview WhatsApp</h5>
                            <div className="saas-quick-reply-preview-phone">
                                <div className="saas-quick-reply-preview-chatbar">
                                    <span>Vista del cliente</span>
                                    <small>WhatsApp</small>
                                </div>
                                <div className="saas-quick-reply-preview-bubble">
                                    {previewMediaUrl ? (
                                        previewIsImage ? (
                                            <img className="saas-quick-reply-preview-image" src={previewMediaUrl} alt={previewMediaName || 'Imagen de respuesta rapida'} />
                                        ) : (
                                            <div className="saas-quick-reply-preview-file">
                                                <span>Archivo adjunto</span>
                                                <small>{previewMediaName}</small>
                                            </div>
                                        )
                                    ) : null}
                                    <div className="saas-quick-reply-preview-text">
                                        {renderWhatsAppFormattedText(renderQuickReplyPreviewText(quickReplyItemForm.text, quickReplyVariableCategories))}
                                    </div>
                                    <small className="saas-quick-reply-preview-time">Ahora</small>
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>
        );
    }, [
        QUICK_REPLY_ACCEPT_VALUE,
        QUICK_REPLY_ALLOWED_EXTENSIONS_LABEL,
        busy,
        canManageQuickReplies,
        formatBytes,
        getQuickReplyAssetDisplayName,
        handleQuickReplyAssetSelection,
        quickReplyItemForm,
        quickReplyItemFormAssets,
        quickReplyItemPanelMode,
        quickReplyVariableCategories,
        quickReplyExpandedVariableCategories,
        filteredQuickReplyVariableCategories,
        quickReplyVariableError,
        quickReplyVariableLoading,
        quickReplyVariableSearch,
        quickReplyStorageQuotaMb,
        quickReplyUploadMaxMb,
        resolveQuickReplyAssetPreviewUrl,
        isQuickReplyImageAsset,
        showQuickReplyEmojiPicker,
        quickReplyEmojiSkinTone,
        insertQuickReplyEmoji,
        handleQuickReplyEmojiSkinToneChange,
        removeQuickReplyAssetAt,
        requestCloseQuickReplyItemBuilder,
        runAction,
        saveQuickReplyItem,
        setError,
        setQuickReplyItemForm,
        insertQuickReplyVariable,
        toggleQuickReplyVariableCategory,
        uploadingQuickReplyAssets,
        wrapQuickReplySelection
    ]);

    const renderDetail = React.useCallback(() => {
        if (!settingsTenantId) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona una empresa</h4>
                    <p>Elige una empresa para administrar bibliotecas y respuestas rápidas.</p>
                </div>
            );
        }
        if (isLibraryEditing) return renderLibraryForm({ close });
        if (!selectedQuickReplyLibrary) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona una biblioteca</h4>
                    <p>Elige una biblioteca para ver y editar todas sus plantillas.</p>
                </div>
            );
        }
        return (
            <>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>CÓDIGO</span><strong>{selectedQuickReplyLibrary.libraryId}</strong></div>
                    <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedQuickReplyLibrary.name || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ALCANCE</span><strong>{selectedQuickReplyLibrary.isShared ? 'Compartida' : 'Por módulo'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedQuickReplyLibrary.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Respuestas</h4>
                    <div className="saas-admin-related-list">
                        {visibleQuickReplyItemsForSelectedLibrary.length === 0 ? <div className="saas-admin-empty-inline">Sin respuestas registradas.</div> : null}
                        {visibleQuickReplyItemsForSelectedLibrary.map((item) => (
                            <button
                                key={`qr_item_${item.itemId}`}
                                type="button"
                                className={`saas-admin-related-row ${selectedQuickReplyItem?.itemId === item.itemId && quickReplyItemPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                onClick={() => {
                                    setSelectedQuickReplyItemId?.(text(item.itemId).toUpperCase());
                                    setQuickReplyItemPanelMode?.('view');
                                }}
                            >
                                <span>{item.label || item.itemId}</span>
                                <small>{item.isActive === false ? 'Inactiva' : 'Activa'} | {item.text || 'Solo adjuntos'}</small>
                            </button>
                        ))}
                    </div>
                </div>
                {selectedQuickReplyItem && quickReplyItemPanelMode === 'view' ? (
                    <div className="saas-admin-related-block">
                        <div className="saas-admin-list-actions saas-admin-list-actions--row">
                            <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemEdit}>Editar</button>
                            <button type="button" disabled={busy || !canManageQuickReplies} onClick={() => runAction?.('Respuesta rápida desactivada', async () => deactivateQuickReplyItem?.(selectedQuickReplyItem?.itemId))}>Desactivar</button>
                        </div>
                        <div className="saas-admin-detail-grid">
                            <div className="saas-admin-detail-field"><span>Etiqueta</span><strong>{selectedQuickReplyItem.label || '-'}</strong></div>
                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedQuickReplyItem.isActive === false ? 'Inactiva' : 'Activa'}</strong></div>
                            <div className="saas-admin-detail-field"><span>Adjuntos</span><strong>{selectedQuickReplyItemMediaAssets.length}</strong></div>
                            <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedQuickReplyItem.updatedAt)}</strong></div>
                        </div>
                        <div className="saas-admin-related-row" role="status" style={{ alignItems: 'flex-start' }}>
                            <span>Texto</span>
                            <small style={{ whiteSpace: 'pre-wrap', textAlign: 'left' }}>{selectedQuickReplyItem.text || 'Sin texto. Solo adjuntos.'}</small>
                        </div>
                        {selectedQuickReplyItemMediaAssets.length > 0 ? (
                            <div className="saas-admin-related-list">
                                {selectedQuickReplyItemMediaAssets.map((asset, idx) => {
                                    const previewUrl = resolveQuickReplyAssetPreviewUrl(asset?.url || '');
                                    const fileLabel = getQuickReplyAssetDisplayName(asset, idx);
                                    return (
                                        <div key={`qr_item_asset_view_${idx}`} className="saas-admin-related-row" role="status">
                                            <span>{fileLabel}</span>
                                            <small>
                                                <a href={previewUrl || '#'} target="_blank" rel="noreferrer">Abrir</a>
                                                {' | '}{getQuickReplyAssetTypeLabel(asset)}
                                                {isQuickReplyImageAsset(asset) ? ' | imagen' : ''}
                                            </small>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {isItemEditing ? renderItemForm({ close }) : null}
            </>
        );
    }, [
        busy,
        canManageQuickReplies,
        deactivateQuickReplyItem,
        deactivateQuickReplyLibrary,
        formatDateTimeLabel,
        getQuickReplyAssetDisplayName,
        getQuickReplyAssetTypeLabel,
        isItemEditing,
        isLibraryEditing,
        isQuickReplyImageAsset,
        openQuickReplyItemCreate,
        openQuickReplyItemEdit,
        openQuickReplyLibraryEdit,
        quickReplyItemPanelMode,
        renderItemForm,
        renderLibraryForm,
        resolveQuickReplyAssetPreviewUrl,
        runAction,
        selectedQuickReplyItem,
        selectedQuickReplyItemMediaAssets,
        selectedQuickReplyLibrary,
        setQuickReplyItemPanelMode,
        setSelectedQuickReplyItemId,
        settingsTenantId,
        visibleQuickReplyItemsForSelectedLibrary
    ]);

    const detailActions = React.useMemo(() => {
        if (!selectedQuickReplyLibrary || isLibraryEditing || isItemEditing) return null;
        return (
            <>
                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyLibraryEdit}>Editar</button>
                <button type="button" disabled={busy || !canManageQuickReplies} onClick={() => runAction?.('Biblioteca desactivada', async () => deactivateQuickReplyLibrary?.(selectedQuickReplyLibrary?.libraryId))}>Desactivar</button>
                <button type="button" disabled={busy || !canManageQuickReplies} onClick={openQuickReplyItemCreate}>Nueva respuesta</button>
            </>
        );
    }, [
        busy,
        canManageQuickReplies,
        deactivateQuickReplyLibrary,
        isItemEditing,
        isLibraryEditing,
        openQuickReplyItemCreate,
        openQuickReplyLibraryEdit,
        runAction,
        selectedQuickReplyLibrary
    ]);

    return (
        <SaasEntityPage
            id="saas_quick_replies"
            sectionKey="saas_quick_replies"
            title="RESPUESTAS RÁPIDAS"
            rows={rows}
            columns={columns}
            selectedId={selectedId}
            onSelect={(row) => selectLibrary(row?.id)}
            onClose={close}
            renderDetail={renderDetail}
            renderForm={renderDetail}
            mode={isLibraryEditing || isItemEditing ? 'form' : 'detail'}
            dirty={isLibraryEditing || isItemEditing}
            requestJson={context.requestJson}
            loading={loadingQuickReplies}
            emptyText={settingsTenantId ? 'Sin bibliotecas registradas.' : 'Selecciona una empresa para gestionar respuestas rápidas.'}
            searchPlaceholder="Buscar biblioteca por nombre, código, alcance o estado..."
            filters={filters}
            extra={settingsTenantId ? (
                <select
                    value={quickReplyModuleFilterId}
                    onChange={(event) => {
                        const nextModuleId = text(event.target.value).toLowerCase();
                        setQuickReplyModuleFilterId?.(nextModuleId);
                        setSelectedQuickReplyLibraryId?.('');
                        setSelectedQuickReplyItemId?.('');
                        setQuickReplyLibraryPanelMode?.('view');
                        setQuickReplyItemPanelMode?.('view');
                    }}
                    disabled={loadingQuickReplies}
                >
                    <option value="">Todos los módulos</option>
                    {waModules.map((moduleItem) => {
                        const moduleId = text(moduleItem?.moduleId).toLowerCase();
                        return <option key={`qr_scope_${moduleId}`} value={moduleId}>{moduleItem?.name || moduleId}</option>;
                    })}
                </select>
            ) : null}
            actions={[
                {
                    label: 'Recargar',
                    onClick: () => settingsTenantId && loadQuickReplyData?.(settingsTenantId).catch((err) => setError?.(String(err?.message || err || 'No se pudo recargar respuestas rápidas.'))),
                    disabled: busy || loadingQuickReplies || !settingsTenantId
                },
                {
                    label: 'Nuevo',
                    onClick: openQuickReplyLibraryCreate,
                    disabled: busy || !canManageQuickReplies || !settingsTenantId
                }
            ]}
            detailTitle={quickReplyLibraryPanelMode === 'create' ? 'Nueva biblioteca' : (selectedQuickReplyLibrary?.name || 'Biblioteca de respuestas')}
            detailSubtitle={quickReplyLibraryPanelMode === 'create' ? 'Define tipo, alcance y módulos asignados.' : (selectedQuickReplyLibrary?.libraryId || '')}
            detailActions={detailActions}
        />
    );
}
