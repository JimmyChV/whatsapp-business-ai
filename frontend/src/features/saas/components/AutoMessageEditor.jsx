import React from 'react';
import EmojiPicker from 'emoji-picker-react';
import { EmojiStyle, SkinTonePickerLocation, SkinTones, SuggestionMode, Theme } from 'emoji-picker-react';
import { API_BASE } from '../helpers/panel.helpers';
import { loadStoredSaasSession } from '../../auth/helpers/saasSessionStorage';

const text = (value) => String(value ?? '').trim();
const AUTO_MESSAGE_EMOJI_SKIN_TONE_STORAGE_KEY = 'chat-emoji-skin-tone:global';

const FALLBACK_VARIABLE_CATEGORIES = Object.freeze([
    {
        id: 'cliente',
        label: 'Cliente',
        variables: [
            { key: 'contacto_cliente', label: 'Nombre con tratamiento', description: 'Nombre con tratamiento', exampleValue: 'Sra. Luisa' },
            { key: 'nombre_cliente', label: 'Nombre completo', description: 'Nombre completo', exampleValue: 'Maria Perez' },
            { key: 'telefono_cliente', label: 'Telefono', description: 'Telefono del cliente', exampleValue: '+51941443776' },
            { key: 'email_cliente', label: 'Email', description: 'Email', exampleValue: 'cliente@correo.com' },
            { key: 'erp_id', label: 'Codigo ERP', description: 'Codigo ERP', exampleValue: 'CLI-000245' },
            { key: 'tipo_cliente', label: 'Tipo de cliente', description: 'Tipo de cliente', exampleValue: 'Mayorista' },
            { key: 'fecha_registro', label: 'Fecha de registro', description: 'Fecha de registro', exampleValue: '29/05/2026' }
        ]
    },
    {
        id: 'direccion',
        label: 'Direccion',
        variables: [
            { key: 'direccion', label: 'Direccion', description: 'Direccion principal', exampleValue: 'Av. Los Ingenieros 245' },
            { key: 'distrito', label: 'Distrito', description: 'Distrito', exampleValue: 'Rimac' },
            { key: 'provincia', label: 'Provincia', description: 'Provincia', exampleValue: 'Lima' },
            { key: 'departamento', label: 'Departamento', description: 'Departamento', exampleValue: 'Lima' },
            { key: 'referencia', label: 'Referencia', description: 'Referencia', exampleValue: 'Frente al parque' }
        ]
    },
    {
        id: 'zona_envio',
        label: 'Zona y envio',
        variables: [
            { key: 'zona_envio', label: 'Zona de envio', description: 'Zona de envio', exampleValue: 'Lima Norte' },
            { key: 'tipo_envio', label: 'Tipo de envio', description: 'Tipo de envio', exampleValue: 'Delivery' },
            { key: 'costo_envio', label: 'Costo de envio', description: 'Costo de envio', exampleValue: 'S/ 12.00' }
        ]
    },
    {
        id: 'agente',
        label: 'Agente',
        variables: [
            { key: 'nombre_agente', label: 'Nombre del agente', description: 'Nombre del agente', exampleValue: 'Owner Lavitat' },
            { key: 'rol_agente', label: 'Rol', description: 'Rol', exampleValue: 'seller' }
        ]
    },
    {
        id: 'campana',
        label: 'Fecha',
        variables: [
            { key: 'fecha_inicio', label: 'Fecha de inicio', description: 'Fecha de inicio', exampleValue: '26 de mayo de 2026' },
            { key: 'fecha_fin', label: 'Fecha limite', description: 'Fecha limite', exampleValue: '29 de mayo de 2026' }
        ]
    }
]);

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

    return FALLBACK_VARIABLE_CATEGORIES.map((category) => ({
        ...category,
        variables: category.variables.map((variable) => ({ ...variable }))
    }));
}

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
            const key = `auto_msg_fmt_${lineIndex}_${offset}`;
            if (match.startsWith('*')) parts.push(<strong key={key}>{content}</strong>);
            else if (match.startsWith('_')) parts.push(<em key={key}>{content}</em>);
            else if (match.startsWith('~')) parts.push(<del key={key}>{content}</del>);
            else parts.push(<code key={key}>{content}</code>);
            lastIndex = offset + match.length;
            return match;
        });
        if (lastIndex < line.length) parts.push(line.slice(lastIndex));
        return (
            <React.Fragment key={`auto_msg_fmt_line_${lineIndex}`}>
                {parts.length > 0 ? parts : ' '}
                {lineIndex < raw.split('\n').length - 1 ? <br /> : null}
            </React.Fragment>
        );
    });
}

function renderAutoMessagePreviewText(value, categories = []) {
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

function buildVariableCatalogHeaders(tenantId = '') {
    const headers = {};
    const session = loadStoredSaasSession();
    const accessToken = text(session?.accessToken);
    const tokenType = text(session?.tokenType) || 'Bearer';
    const cleanTenantId = text(tenantId || session?.user?.tenantId);
    if (accessToken) headers.Authorization = `${tokenType} ${accessToken}`;
    if (cleanTenantId) headers['X-Tenant-Id'] = cleanTenantId;
    return headers;
}

export default function AutoMessageEditor({
    value = '',
    onChange = null,
    disabled = false,
    placeholder = '',
    maxLength = null,
    showMediaUpload = true,
    showPreview = true,
    tenantId = '',
    form = {},
    setForm = null,
    mode = 'create',
    categoryOptions = [],
    normalizeCategory = (input) => input,
    acceptValue = '',
    mediaAssets = [],
    onMediaAssetsChange = null,
    mediaUrl = '',
    onMediaUrlChange = null,
    mediaMimeType = '',
    onMediaMimeTypeChange = null,
    onUploadFiles = null,
    onUploadError = null,
    removeAssetAt = null,
    getAssetDisplayName = (asset, index) => asset?.fileName || asset?.filename || `Adjunto ${index + 1}`,
    formatBytes = (input) => input,
    resolveAssetPreviewUrl = (input) => input,
    isImageAsset = () => false,
    hasRequiredContent = true,
    saveDisabled = false,
    onSave = null,
    onCancel = null,
    initialShowVariablesPanel = true,
    initialVariableGroupsExpanded = true
}) {
    const textareaRef = React.useRef(null);
    const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
    const [emojiSkinTone, setEmojiSkinTone] = React.useState(() => {
        if (typeof window === 'undefined') return SkinTones.NEUTRAL;
        try {
            const stored = window.localStorage.getItem(AUTO_MESSAGE_EMOJI_SKIN_TONE_STORAGE_KEY);
            return Object.values(SkinTones).includes(stored) ? stored : SkinTones.NEUTRAL;
        } catch (_) {
            return SkinTones.NEUTRAL;
        }
    });
    const [variableSearch, setVariableSearch] = React.useState('');
    const [selectedVariableCategory, setSelectedVariableCategory] = React.useState('');
    const [showVariablesPanel, setShowVariablesPanel] = React.useState(initialShowVariablesPanel !== false);
    const [variableCategories, setVariableCategories] = React.useState(() => collectVariableCategories({}));
    const [variableLoading, setVariableLoading] = React.useState(false);
    const [variableError, setVariableError] = React.useState('');

    const cleanValue = String(value ?? '');
    const assets = Array.isArray(mediaAssets) ? mediaAssets : [];
    const resolvedMediaUrl = text(mediaUrl || form?.mediaUrl);
    const previewAsset = assets[0] || null;
    const previewMediaUrl = resolveAssetPreviewUrl(previewAsset?.url || resolvedMediaUrl || '');
    const previewMediaName = text(previewAsset?.fileName || previewAsset?.filename || form?.mediaFileName || 'Adjunto');
    const previewIsImage = previewAsset
        ? isImageAsset(previewAsset)
        : /\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i.test(previewMediaUrl);
    const cleanCategory = normalizeCategory(form?.category);
    const renderActions = Boolean(onSave || onCancel);

    const emitTextChange = React.useCallback((nextText = '') => {
        const source = String(nextText ?? '');
        const limited = Number.isFinite(Number(maxLength)) && Number(maxLength) > 0
            ? source.slice(0, Number(maxLength))
            : source;
        onChange?.(limited);
    }, [maxLength, onChange]);

    React.useEffect(() => {
        let cancelled = false;
        setVariableLoading(true);
        setVariableError('');
        fetch(`${API_BASE}/api/tenant/template-variables/catalog`, {
            cache: 'no-store',
            headers: buildVariableCatalogHeaders(tenantId)
        })
            .then(async (response) => {
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload?.ok === false) {
                    throw new Error(String(payload?.error || 'No se pudo cargar el catalogo de variables.'));
                }
                return payload;
            })
            .then((payload) => {
                if (cancelled) return;
                setVariableCategories(collectVariableCategories(payload));
            })
            .catch(() => {
                if (cancelled) return;
                setVariableError('');
                setVariableCategories(collectVariableCategories({}));
            })
            .finally(() => {
                if (!cancelled) setVariableLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    const focusAndSelect = React.useCallback((start, end = start) => {
        window.requestAnimationFrame?.(() => {
            const input = textareaRef.current;
            if (!input) return;
            input.focus();
            input.setSelectionRange(start, end);
        });
    }, []);

    const wrapSelection = React.useCallback((marker, suffix = marker) => {
        const markerStart = String(marker || '');
        const markerEnd = String(suffix || markerStart);
        const input = textareaRef.current;
        const start = Number(input?.selectionStart ?? cleanValue.length);
        const end = Number(input?.selectionEnd ?? cleanValue.length);
        const selectedText = cleanValue.slice(start, end);
        const nextText = `${cleanValue.slice(0, start)}${markerStart}${selectedText}${markerEnd}${cleanValue.slice(end)}`;
        emitTextChange(nextText);
        const cursorStart = selectedText ? start : start + markerStart.length;
        const cursorEnd = selectedText ? end + markerStart.length + markerEnd.length : cursorStart;
        focusAndSelect(cursorStart, cursorEnd);
    }, [cleanValue, emitTextChange, focusAndSelect]);

    const insertVariable = React.useCallback((variableKey = '') => {
        const cleanKey = text(variableKey);
        if (!cleanKey) return;
        const token = `{{${cleanKey}}}`;
        const input = textareaRef.current;
        const start = Number(input?.selectionStart ?? cleanValue.length);
        const end = Number(input?.selectionEnd ?? cleanValue.length);
        const nextText = `${cleanValue.slice(0, start)}${token}${cleanValue.slice(end)}`;
        emitTextChange(nextText);
        focusAndSelect(start + token.length);
    }, [cleanValue, emitTextChange, focusAndSelect]);

    const insertEmoji = React.useCallback((emoji = '') => {
        const safeEmoji = String(emoji || '');
        if (!safeEmoji) return;
        const input = textareaRef.current;
        const start = Number(input?.selectionStart ?? cleanValue.length);
        const end = Number(input?.selectionEnd ?? cleanValue.length);
        const nextText = `${cleanValue.slice(0, start)}${safeEmoji}${cleanValue.slice(end)}`;
        emitTextChange(nextText);
        setShowEmojiPicker(false);
        focusAndSelect(start + safeEmoji.length);
    }, [cleanValue, emitTextChange, focusAndSelect]);

    const handleEmojiSkinToneChange = React.useCallback((skinTone) => {
        const safeSkinTone = Object.values(SkinTones).includes(skinTone) ? skinTone : SkinTones.NEUTRAL;
        setEmojiSkinTone(safeSkinTone);
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(AUTO_MESSAGE_EMOJI_SKIN_TONE_STORAGE_KEY, safeSkinTone);
        } catch (_) { }
    }, []);

    const filteredVariableCategories = React.useMemo(() => {
        const query = text(variableSearch).toLowerCase();
        const categories = Array.isArray(variableCategories) ? variableCategories : [];
        if (!query) return categories;
        return categories
            .map((category) => ({
                ...category,
                variables: (Array.isArray(category?.variables) ? category.variables : []).filter((variable) => (
                    `${text(variable?.key)} ${text(variable?.label)} ${text(variable?.description)}`.toLowerCase().includes(query)
                ))
            }))
            .filter((category) => Array.isArray(category.variables) && category.variables.length > 0);
    }, [variableCategories, variableSearch]);

    const activeVariableCategory = React.useMemo(() => {
        const categories = Array.isArray(filteredVariableCategories) ? filteredVariableCategories : [];
        if (categories.length === 0) return null;
        const selectedKey = text(selectedVariableCategory).toLowerCase();
        return categories.find((category) => text(category?.id || category?.label).toLowerCase() === selectedKey) || categories[0];
    }, [filteredVariableCategories, selectedVariableCategory]);

    return (
        <div className="saas-quick-reply-editor-layout">
            <section className="saas-quick-reply-editor-main saas-quick-reply-editor-main--form" aria-label="Formulario de respuesta rapida">
                {form && Object.prototype.hasOwnProperty.call(form, 'label') ? (
                    <div className="saas-admin-form-row">
                        <label>Etiqueta</label>
                        <input value={form.label || ''} onChange={(event) => setForm?.((prev) => ({ ...prev, label: event.target.value }))} placeholder="Ej: Saludo inicial" disabled={disabled} />
                    </div>
                ) : null}
                <div className="saas-admin-form-row">
                    <label>Mensaje</label>
                    <textarea
                        ref={textareaRef}
                        value={cleanValue}
                        onChange={(event) => emitTextChange(event.target.value)}
                        rows={8}
                        maxLength={Number.isFinite(Number(maxLength)) && Number(maxLength) > 0 ? Number(maxLength) : undefined}
                        placeholder={placeholder || 'Escribe el mensaje. Puedes insertar variables desde la columna central.'}
                        disabled={disabled}
                    />
                </div>
                {categoryOptions.length > 0 ? (
                    <div className="saas-admin-form-row">
                        <label>Categoria</label>
                        <select
                            value={cleanCategory}
                            onChange={(event) => {
                                const category = normalizeCategory(event.target.value);
                                setForm?.((prev) => ({
                                    ...prev,
                                    category,
                                    availableForPatty: category === 'general' ? false : prev.availableForPatty === true
                                }));
                            }}
                            disabled={disabled}
                        >
                            {categoryOptions.map((category) => (
                                <option key={`auto_msg_category_${category.value}`} value={category.value}>{category.label}</option>
                            ))}
                        </select>
                    </div>
                ) : null}
                {categoryOptions.length > 0 && cleanCategory !== 'general' ? (
                    <label className="saas-admin-module-toggle">
                        <input
                            type="checkbox"
                            checked={form.availableForPatty === true}
                            onChange={(event) => setForm?.((prev) => ({ ...prev, availableForPatty: event.target.checked }))}
                            disabled={disabled}
                        />
                        <span>Disponible para Patty IA</span>
                    </label>
                ) : null}
                <div className="saas-quick-reply-format-toolbar" aria-label="Formato WhatsApp">
                    <span>Formato WhatsApp</span>
                    <div className="saas-quick-reply-emoji-wrap">
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setShowEmojiPicker((prev) => !prev)}
                            aria-label="Insertar emoji"
                        >
                            🙂
                        </button>
                        {showEmojiPicker ? (
                            <div className="saas-quick-reply-emoji-panel" onClick={(event) => event.stopPropagation()}>
                                <EmojiPicker
                                    onEmojiClick={(emojiData) => insertEmoji(emojiData?.emoji)}
                                    onSkinToneChange={handleEmojiSkinToneChange}
                                    width="100%"
                                    height={360}
                                    lazyLoadEmojis
                                    skinTonesDisabled={false}
                                    searchDisabled={false}
                                    searchPlaceHolder="Buscar emoji o gesto"
                                    defaultSkinTone={emojiSkinTone}
                                    suggestedEmojisMode={SuggestionMode.FREQUENT}
                                    skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
                                    emojiStyle={EmojiStyle.APPLE}
                                    previewConfig={{ showPreview: false }}
                                    theme={Theme.AUTO}
                                />
                            </div>
                        ) : null}
                    </div>
                    <button type="button" disabled={disabled} onClick={() => wrapSelection('*')}><strong>B</strong></button>
                    <button type="button" disabled={disabled} onClick={() => wrapSelection('_')}><em>I</em></button>
                    <button type="button" disabled={disabled} onClick={() => wrapSelection('~')}><del>S</del></button>
                    <button type="button" disabled={disabled} onClick={() => wrapSelection('`')}><code>M</code></button>
                </div>
                {showMediaUpload ? (
                    <div className="saas-admin-related-block">
                        <h4>Adjunto</h4>
                        <div className="saas-admin-form-row">
                            <input
                                value={resolvedMediaUrl}
                                onChange={(event) => {
                                    onMediaUrlChange?.(event.target.value);
                                    if (typeof onMediaMimeTypeChange === 'function' && !mediaMimeType) onMediaMimeTypeChange('');
                                    setForm?.((prev) => ({ ...prev, mediaUrl: event.target.value, mediaMimeType: prev.mediaMimeType || '' }));
                                }}
                                placeholder="URL principal (opcional)"
                                disabled={disabled}
                            />
                            <label className={`saas-admin-dropzone ${disabled ? 'is-disabled' : ''}`.trim()} style={{ minHeight: 'auto', padding: '10px 12px' }}>
                                <input
                                    type="file"
                                    multiple
                                    accept={acceptValue}
                                    disabled={disabled}
                                    onChange={async (event) => {
                                        const files = Array.from(event.target.files || []);
                                        event.target.value = '';
                                        if (files.length === 0) return;
                                        try {
                                            await onUploadFiles?.(files);
                                        } catch (uploadError) {
                                            onUploadError?.(uploadError);
                                        }
                                    }}
                                />
                                <strong>Subir adjuntos</strong>
                                <small>Imagenes, PDF, Word, Excel, PowerPoint, ZIP, audio y MP4. Max. 50 MB por archivo.</small>
                            </label>
                        </div>
                        {assets.length > 0 ? (
                            <div className="saas-admin-related-list">
                                {assets.map((asset, assetIdx) => {
                                    const fileLabel = getAssetDisplayName(asset, assetIdx);
                                    return (
                                        <div key={`auto_msg_asset_edit_${assetIdx}`} className="saas-admin-related-row" role="status">
                                            <span>{fileLabel}</span>
                                            <small>{asset.mimeType || 'archivo'}{asset.sizeBytes ? ` | ${formatBytes(asset.sizeBytes)}` : ''}</small>
                                            <button type="button" disabled={disabled} onClick={() => {
                                                removeAssetAt?.(assetIdx);
                                                if (typeof onMediaAssetsChange === 'function') {
                                                    onMediaAssetsChange(assets.filter((_asset, index) => index !== assetIdx));
                                                }
                                            }}>Quitar</button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {showMediaUpload ? (
                    <div className="saas-quick-reply-flow-note">
                        <strong>Botones y flujos</strong>
                        <span>Configuralos desde Automatizaciones para definir intencion, demora y siguiente respuesta sin mezclarlo con el contenido reutilizable.</span>
                    </div>
                ) : null}
                {form && Object.prototype.hasOwnProperty.call(form, 'isActive') ? (
                    <label className="saas-admin-module-toggle">
                        <input type="checkbox" checked={form.isActive !== false} onChange={(event) => setForm?.((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={disabled} />
                        <span>Respuesta activa</span>
                    </label>
                ) : null}
                {!hasRequiredContent ? <small className="saas-meta-template-error">Agrega texto o un adjunto para guardar la respuesta.</small> : null}
                {renderActions ? (
                    <div className="saas-admin-form-row saas-admin-form-row--actions saas-quick-reply-builder-actions">
                        {onSave ? (
                            <button
                                type="button"
                                disabled={saveDisabled}
                                onClick={onSave}
                            >
                                {mode === 'create' ? 'Guardar respuesta' : 'Actualizar respuesta'}
                            </button>
                        ) : null}
                        {onCancel ? <button type="button" className="saas-btn-cancel" disabled={disabled} onClick={onCancel}>Cancelar</button> : null}
                    </div>
                ) : null}
            </section>
            <aside className="saas-quick-reply-variable-panel" aria-label="Variables disponibles">
                <div className="saas-quick-reply-variable-panel__head">
                    <div className="saas-quick-reply-variable-panel__title">
                        <strong>Variables disponibles</strong>
                        <small>Haz click en cualquier variable para insertarla en el mensaje.</small>
                    </div>
                    <button
                        type="button"
                        className="saas-btn-cancel saas-quick-reply-variable-panel__toggle"
                        onClick={() => setShowVariablesPanel((prev) => !prev)}
                    >
                        {showVariablesPanel ? 'Ocultar' : 'Mostrar'}
                    </button>
                </div>
                {showVariablesPanel ? (
                    <>
                        <input
                            className="saas-quick-reply-variable-panel__search"
                            value={variableSearch}
                            onChange={(event) => setVariableSearch(event.target.value)}
                            placeholder="Buscar variable..."
                            disabled={disabled || variableLoading}
                        />
                        {variableLoading ? <small className="saas-quick-reply-preview-muted">Cargando variables...</small> : null}
                        {variableError ? <small className="saas-meta-template-error">{variableError}</small> : null}
                        {!variableLoading && !variableError ? (
                            <div className="saas-quick-reply-variable-browser">
                                {filteredVariableCategories.length > 0 ? (
                                    <>
                                        <div className="saas-quick-reply-variable-groups" aria-label="Grupos de variables">
                                            {filteredVariableCategories.map((category) => {
                                                const categoryKey = text(category?.id || category?.label).toLowerCase();
                                                const variables = Array.isArray(category?.variables) ? category.variables : [];
                                                const activeCategoryKey = text(activeVariableCategory?.id || activeVariableCategory?.label).toLowerCase();
                                                return (
                                                    <button
                                                        key={`auto_msg_var_group_${category?.id}`}
                                                        type="button"
                                                        className={`saas-quick-reply-variable-group-button ${categoryKey === activeCategoryKey ? 'is-active' : ''}`.trim()}
                                                        onClick={() => setSelectedVariableCategory(categoryKey)}
                                                    >
                                                        <span>{category?.label || category?.id}</span>
                                                        <small>{variables.length}</small>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="saas-quick-reply-variable-results" aria-label="Variables del grupo seleccionado">
                                            <div className="saas-quick-reply-variable-results__head">
                                                <strong>{activeVariableCategory?.label || activeVariableCategory?.id}</strong>
                                                <small>{(Array.isArray(activeVariableCategory?.variables) ? activeVariableCategory.variables.length : 0)} variables</small>
                                            </div>
                                            <div className="saas-meta-template-var-list">
                                                {(Array.isArray(activeVariableCategory?.variables) ? activeVariableCategory.variables : []).map((variable) => (
                                                    <button
                                                        type="button"
                                                        className="saas-meta-template-var-item saas-meta-template-var-item--interactive"
                                                        key={`auto_msg_var_${activeVariableCategory?.id}_${variable?.key}`}
                                                        disabled={disabled}
                                                        onClick={() => insertVariable(variable?.key)}
                                                    >
                                                        <span className="saas-meta-template-var-token">{`{{${variable?.key}}}`}</span>
                                                        <div className="saas-meta-template-var-item-main">
                                                            <strong>{variable?.label || variable?.key}</strong>
                                                            <small>
                                                                {text(variable?.description).toLowerCase() !== text(variable?.label).toLowerCase()
                                                                    ? text(variable?.description)
                                                                    : text(variable?.exampleValue || variable?.description || variable?.key)}
                                                            </small>
                                                        </div>
                                                        <span className="saas-meta-template-var-insert-label" aria-hidden="true">+</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <small className="saas-quick-reply-preview-muted">Sin variables para mostrar.</small>
                                )}
                            </div>
                        ) : null}
                    </>
                ) : null}
            </aside>
            {showPreview ? (
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
                                {renderWhatsAppFormattedText(renderAutoMessagePreviewText(cleanValue, variableCategories))}
                            </div>
                            <small className="saas-quick-reply-preview-time">Ahora</small>
                        </div>
                    </div>
                </aside>
            ) : null}
        </div>
    );
}
