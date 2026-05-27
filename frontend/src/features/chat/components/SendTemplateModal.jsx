import React from 'react';
import { readFileAsDataUrl } from '../../saas/helpers/assets.helpers';

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeDateInputValue(value = '') {
    const raw = toText(value);
    if (!raw) return '';
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch?.[1]) return isoMatch[1];
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getResolvedComponent(preview = null, type = '') {
    const components = Array.isArray(preview?.components) ? preview.components : [];
    return components.find((component) => toText(component?.type).toUpperCase() === toText(type).toUpperCase()) || null;
}

function getResolvedButtonComponents(preview = null) {
    const components = Array.isArray(preview?.components) ? preview.components : [];
    return components.filter((component) => toText(component?.type).toUpperCase() === 'BUTTON');
}

const tone = {
    overlay: 'var(--chat-overlay-backdrop)',
    card: 'var(--chat-shell-panel-gradient)',
    cardAlt: 'var(--chat-card-surface-alt)',
    border: 'var(--chat-card-border)',
    controlBorder: 'var(--chat-control-border)',
    menuBorder: 'var(--chat-pill-border)',
    title: 'var(--text-primary)',
    text: 'var(--text-primary)',
    textSoft: 'var(--chat-control-text-soft)',
    infoSurface: 'var(--chat-info-surface)',
    infoBorder: 'var(--chat-info-border)',
    infoText: 'var(--chat-info-text)',
    successSurface: 'var(--chat-success-surface)',
    successBorder: 'var(--chat-success-border)',
    successText: 'var(--chat-success-text)',
    warningSurface: 'var(--chat-warning-bg)',
    warningBorder: 'var(--chat-warning-border)',
    warningText: 'var(--chat-warning-text-strong)',
    dangerSurface: 'var(--chat-danger-soft)',
    dangerBorder: 'var(--chat-danger-border)',
    dangerText: 'var(--chat-danger-text)',
    primaryBg: 'var(--saas-accent-primary)',
    primaryBorder: 'var(--saas-accent-primary)',
    primaryText: 'var(--saas-accent-primary-text)',
    ghostBg: 'var(--chat-control-surface)',
    ghostBorder: 'var(--chat-control-border)',
    ghostText: 'var(--text-primary)',
    disabledBg: 'var(--chat-control-disabled)',
    panelShadow: 'var(--chat-panel-shadow)'
};

const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 4200,
    background: tone.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
};

const cardStyle = {
    width: 'min(1320px, 100%)',
    maxHeight: 'min(90vh, 980px)',
    background: tone.card,
    border: `1px solid ${tone.border}`,
    borderRadius: '18px',
    boxShadow: tone.panelShadow,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backdropFilter: 'blur(18px)'
};

export default function SendTemplateModal({
    isOpen = false,
    templates = [],
    templatesLoading = false,
    templatesError = '',
    selectedTemplate = null,
    preview = null,
    previewLoading = false,
    previewError = '',
    confirmLabel = 'Enviar template',
    confirmDisabled = true,
    confirmBusy = false,
    headerMedia = null,
    validFrom = '',
    validTo = '',
    onHeaderMediaChange = null,
    onValidityChange = null,
    onClose = null,
    onSelectTemplate = null,
    onConfirm = null
}) {
    const normalizedValidFrom = normalizeDateInputValue(validFrom);
    const normalizedValidTo = normalizeDateInputValue(validTo);
    const [validFromDraft, setValidFromDraft] = React.useState(normalizedValidFrom);
    const [validToDraft, setValidToDraft] = React.useState(normalizedValidTo);

    React.useEffect(() => {
        setValidFromDraft(normalizedValidFrom);
    }, [normalizedValidFrom]);

    React.useEffect(() => {
        setValidToDraft(normalizedValidTo);
    }, [normalizedValidTo]);

    const emitValidityChange = (next = {}) => {
        const nextValidFrom = normalizeDateInputValue(next.validFrom ?? validFromDraft);
        const nextValidTo = normalizeDateInputValue(next.validTo ?? validToDraft);
        setValidFromDraft(nextValidFrom);
        setValidToDraft(nextValidTo);
        onValidityChange?.({
            validFrom: nextValidFrom,
            validTo: nextValidTo
        });
    };

    if (!isOpen) return null;
    const templateComponents = Array.isArray(selectedTemplate?.componentsJson) ? selectedTemplate.componentsJson : [];
    const headerComponent = templateComponents.find((component) => toText(component?.type).toUpperCase() === 'HEADER') || null;
    const headerType = (() => {
        const format = toText(headerComponent?.format).toLowerCase();
        if (format === 'text') return 'text';
        if (format === 'image' || format === 'video' || format === 'document') return format;
        return 'none';
    })();
    const previewComponents = Array.isArray(preview?.components) ? preview.components : [];
    const supportsDateRange = previewComponents.some((component) => (
        Array.isArray(component?.parameters)
            && component.parameters.some((parameter) => {
                const key = toText(parameter?.key).toLowerCase();
                return key === 'fecha_inicio' || key === 'fecha_fin';
            })
    ));
    const imagePreviewSrc = headerType === 'image' ? toText(headerMedia?.base64) : '';
    const headerPreview = getResolvedComponent(preview, 'HEADER');
    const bodyPreview = getResolvedComponent(preview, 'BODY');
    const footerPreview = getResolvedComponent(preview, 'FOOTER');
    const buttonPreviews = getResolvedButtonComponents(preview);
    const renderedHeaderText = toText(headerPreview?.resolvedText || headerPreview?.text);
    const renderedBodyText = toText(bodyPreview?.resolvedText || bodyPreview?.text || preview?.previewText);
    const renderedFooterText = toText(footerPreview?.resolvedText || footerPreview?.text);

    const handleHeaderMediaInputChange = async (event) => {
        const file = event?.target?.files?.[0] || null;
        if (!file) {
            onHeaderMediaChange?.(null);
            return;
        }
        try {
            const base64 = await readFileAsDataUrl(file);
            onHeaderMediaChange?.({
                name: toText(file.name),
                type: toText(file.type),
                size: Number(file.size) || 0,
                base64
            });
        } catch (error) {
            onHeaderMediaChange?.({
                error: String(error?.message || 'No se pudo leer el archivo seleccionado.')
            });
        }
    };

    return (
        <div style={overlayStyle} onClick={() => onClose?.()}>
            <div style={cardStyle} onClick={(event) => event.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 20px', borderBottom: `1px solid ${tone.menuBorder}` }}>
                    <div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: tone.title }}>Enviar template</div>
                        <div style={{ fontSize: '0.8rem', color: tone.textSoft, marginTop: '4px' }}>
                            Selecciona un template y revisa sus variables resueltas con el contexto real antes de enviarlo.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        style={{ border: `1px solid ${tone.ghostBorder}`, background: tone.ghostBg, color: tone.ghostText, borderRadius: '10px', padding: '8px 12px', cursor: 'pointer' }}
                    >
                        Cerrar
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '400px minmax(0, 1fr)', gap: '0', minHeight: 0, flex: 1 }}>
                    <div style={{ borderRight: `1px solid ${tone.menuBorder}`, padding: '20px', overflowY: 'auto', overflowX: 'hidden', background: 'linear-gradient(180deg, rgba(255,255,255,0.78), rgba(249,246,240,0.58))' }}>
                        <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
                            <div style={{ fontSize: '0.74rem', color: tone.infoText, fontWeight: 800, letterSpacing: '0.08em' }}>
                            TEMPLATES DISPONIBLES
                            </div>
                            <div style={{ fontSize: '0.78rem', color: tone.textSoft, lineHeight: 1.45 }}>
                                Elige la plantilla y revisa su preview antes de enviarla.
                            </div>
                        </div>
                        {templatesLoading && (
                            <div style={{ padding: '14px', borderRadius: '12px', background: tone.cardAlt, color: tone.textSoft, fontSize: '0.82rem', border: `1px solid ${tone.border}` }}>
                                Cargando templates aprobados...
                            </div>
                        )}
                        {!templatesLoading && templatesError && (
                            <div style={{ padding: '14px', borderRadius: '12px', background: tone.dangerSurface, border: `1px solid ${tone.dangerBorder}`, color: tone.dangerText, fontSize: '0.82rem' }}>
                                {templatesError}
                            </div>
                        )}
                        {!templatesLoading && !templatesError && templates.length === 0 && (
                            <div style={{ padding: '14px', borderRadius: '12px', background: tone.cardAlt, color: tone.textSoft, fontSize: '0.82rem', border: `1px solid ${tone.border}` }}>
                                No hay templates `individual` o `both` aprobados para este modulo.
                            </div>
                        )}
                        {!templatesLoading && !templatesError && templates.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {templates.map((template) => {
                                    const isSelected = String(selectedTemplate?.templateId || '') === String(template?.templateId || '');
                                    return (
                                        <button
                                            key={String(template?.templateId || template?.templateName)}
                                            type="button"
                                            onClick={() => onSelectTemplate?.(template)}
                                            style={{
                                                textAlign: 'left',
                                                border: isSelected ? `1px solid ${tone.successBorder}` : `1px solid ${tone.border}`,
                                                background: isSelected ? 'linear-gradient(180deg, rgba(214,243,224,0.95), rgba(214,243,224,0.78))' : 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(245,242,236,0.82))',
                                                borderRadius: '14px',
                                                padding: '16px',
                                                cursor: 'pointer',
                                                boxShadow: isSelected ? '0 10px 24px rgba(36,124,74,0.12)' : '0 8px 18px rgba(15,23,42,0.05)',
                                                display: 'grid',
                                                gap: '8px',
                                                width: '100%',
                                                minWidth: 0,
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: tone.title, lineHeight: 1.35, minWidth: 0, overflowWrap: 'anywhere' }}>
                                                    {toText(template?.templateName) || 'Template'}
                                                </div>
                                                {isSelected ? (
                                                    <span style={{ fontSize: '0.68rem', color: tone.successText, background: 'rgba(36,124,74,0.12)', border: `1px solid ${tone.successBorder}`, borderRadius: '999px', padding: '4px 8px', whiteSpace: 'nowrap' }}>
                                                        Activo
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                                                <span style={{ fontSize: '0.68rem', color: tone.textSoft, border: `1px solid ${tone.controlBorder}`, borderRadius: '999px', padding: '3px 8px', background: tone.ghostBg }}>
                                                    {toText(template?.templateLanguage).toUpperCase() || 'ES'}
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: tone.textSoft, border: `1px solid ${tone.controlBorder}`, borderRadius: '999px', padding: '3px 8px', background: tone.ghostBg }}>
                                                    {toText(template?.useCase) || 'both'}
                                                </span>
                                                {toText(template?.moduleId) ? (
                                                    <span style={{ fontSize: '0.68rem', color: tone.textSoft, border: `1px solid ${tone.controlBorder}`, borderRadius: '999px', padding: '3px 8px', background: tone.ghostBg }}>
                                                        {toText(template?.moduleId)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div style={{ padding: '22px', overflowY: 'auto', background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(248,245,239,0.82))' }}>
                        {!selectedTemplate && (
                            <div style={{ border: `1px dashed ${tone.controlBorder}`, borderRadius: '14px', padding: '22px', color: tone.textSoft, fontSize: '0.9rem', background: tone.cardAlt }}>
                                Elige un template para ver la preview resuelta con el cliente, cotizacion y agente del chat actual.
                            </div>
                        )}

                        {selectedTemplate && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '1rem', fontWeight: 800, color: tone.title }}>{toText(selectedTemplate?.templateName) || 'Template'}</div>
                                        <div style={{ marginTop: '4px', fontSize: '0.78rem', color: tone.textSoft }}>
                                            {toText(selectedTemplate?.moduleId) || 'Sin modulo'} | {toText(selectedTemplate?.templateLanguage).toUpperCase() || 'ES'}
                                        </div>
                                    </div>
                                </div>

                                {previewLoading && (
                                    <div style={{ padding: '16px', borderRadius: '12px', background: tone.cardAlt, color: tone.textSoft, fontSize: '0.84rem', border: `1px solid ${tone.border}` }}>
                                        Resolviendo variables reales del chat...
                                    </div>
                                )}

                                {!previewLoading && previewError && (
                                    <div style={{ padding: '16px', borderRadius: '12px', background: tone.dangerSurface, border: `1px solid ${tone.dangerBorder}`, color: tone.dangerText, fontSize: '0.84rem' }}>
                                        {previewError}
                                    </div>
                                )}

                                {!previewLoading && !previewError && preview && (
                                    <>
                                        <div style={{ border: `1px solid ${tone.successBorder}`, background: tone.successSurface, borderRadius: '14px', padding: '16px', display: 'grid', gap: '14px' }}>
                                        <div style={{ fontSize: '0.74rem', color: tone.successText, fontWeight: 800, letterSpacing: '0.08em', marginBottom: '8px' }}>
                                                PREVIEW DEL MENSAJE
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                <div style={{ width: 'min(460px, 100%)', borderRadius: '24px', padding: '12px', background: 'linear-gradient(180deg, rgba(232,245,237,0.98), rgba(223,239,229,0.94))', border: `1px solid ${tone.successBorder}`, boxShadow: '0 18px 30px rgba(15,23,42,0.08)' }}>
                                                    <div style={{ borderRadius: '18px', overflow: 'hidden', background: '#ffffff', border: `1px solid rgba(15,23,42,0.08)` }}>
                                                        {imagePreviewSrc ? (
                                                            <img
                                                                src={imagePreviewSrc}
                                                                alt={toText(headerMedia?.name) || 'Header preview'}
                                                                style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'cover', background: '#f8fafc' }}
                                                            />
                                                        ) : null}
                                                        <div style={{ padding: '16px 16px 14px', display: 'grid', gap: '12px' }}>
                                                            {renderedHeaderText ? (
                                                                <div style={{ whiteSpace: 'pre-wrap', color: tone.text, fontSize: '0.9rem', lineHeight: 1.45, fontWeight: 700 }}>
                                                                    {renderedHeaderText}
                                                                </div>
                                                            ) : null}
                                                            <div style={{ whiteSpace: 'pre-wrap', color: tone.text, fontSize: '0.92rem', lineHeight: 1.55 }}>
                                                                {renderedBodyText || 'Sin contenido visible'}
                                                            </div>
                                                            {renderedFooterText ? (
                                                                <div style={{ color: tone.textSoft, fontSize: '0.78rem', lineHeight: 1.4 }}>
                                                                    {renderedFooterText}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        {buttonPreviews.length > 0 ? (
                                                            <div style={{ borderTop: `1px solid ${tone.border}`, display: 'grid' }}>
                                                                {buttonPreviews.map((component, index) => (
                                                                    <div
                                                                        key={`button_preview_${index}`}
                                                                        style={{
                                                                            padding: '12px 14px',
                                                                            textAlign: 'center',
                                                                            fontSize: '0.86rem',
                                                                            fontWeight: 700,
                                                                            color: tone.infoText,
                                                                            borderTop: index > 0 ? `1px solid ${tone.border}` : 'none',
                                                                            background: 'rgba(255,255,255,0.92)'
                                                                        }}
                                                                    >
                                                                        {toText(component?.resolvedText || component?.text) || 'Botón'}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {(supportsDateRange || ['image', 'video', 'document'].includes(headerType)) ? (
                                            <div style={{ border: `1px solid ${tone.border}`, borderRadius: '14px', padding: '14px', background: tone.cardAlt, display: 'grid', gap: '12px' }}>
                                                <div style={{ fontSize: '0.72rem', color: tone.infoText, fontWeight: 800, letterSpacing: '0.08em' }}>
                                                    CONFIGURACION DE ENVIO
                                                </div>
                                                {supportsDateRange ? (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                                                        <label style={{ display: 'grid', gap: '6px', fontSize: '0.78rem', color: tone.text }}>
                                                            <span>Fecha inicio</span>
                                                            <input
                                                                type="date"
                                                                value={validFromDraft}
                                                                onChange={(event) => emitValidityChange({
                                                                    validFrom: event.target.value,
                                                                    validTo: validToDraft
                                                                })}
                                                                onInput={(event) => emitValidityChange({
                                                                    validFrom: event.target.value,
                                                                    validTo: validToDraft
                                                                })}
                                                                style={{ border: `1px solid ${tone.controlBorder}`, background: tone.ghostBg, color: tone.text, borderRadius: '10px', padding: '10px 12px' }}
                                                            />
                                                        </label>
                                                        <label style={{ display: 'grid', gap: '6px', fontSize: '0.78rem', color: tone.text }}>
                                                            <span>Fecha fin</span>
                                                            <input
                                                                type="date"
                                                                value={validToDraft}
                                                                onChange={(event) => emitValidityChange({
                                                                    validFrom: validFromDraft,
                                                                    validTo: event.target.value
                                                                })}
                                                                onInput={(event) => emitValidityChange({
                                                                    validFrom: validFromDraft,
                                                                    validTo: event.target.value
                                                                })}
                                                                style={{ border: `1px solid ${tone.controlBorder}`, background: tone.ghostBg, color: tone.text, borderRadius: '10px', padding: '10px 12px' }}
                                                            />
                                                        </label>
                                                    </div>
                                                ) : null}
                                                {['image', 'video', 'document'].includes(headerType) ? (
                                                    <div style={{ display: 'grid', gap: '8px' }}>
                                                        <label style={{ display: 'grid', gap: '6px', fontSize: '0.78rem', color: tone.text }}>
                                                            <span>{headerType === 'image' ? 'Imagen del header' : headerType === 'video' ? 'Video del header' : 'Documento del header'}</span>
                                                            <input
                                                                type="file"
                                                                accept={headerType === 'image' ? 'image/*' : headerType === 'video' ? 'video/*' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
                                                                onChange={(event) => { void handleHeaderMediaInputChange(event); }}
                                                                style={{ border: `1px solid ${tone.controlBorder}`, background: tone.ghostBg, color: tone.text, borderRadius: '10px', padding: '10px 12px' }}
                                                            />
                                                        </label>
                                                        {toText(headerMedia?.name) ? (
                                                            <div style={{ display: 'grid', gap: '10px' }}>
                                                                <small style={{ color: tone.textSoft }}>
                                                                    Archivo cargado: {toText(headerMedia.name)}
                                                                </small>
                                                                {imagePreviewSrc ? (
                                                                    <div style={{ maxWidth: '280px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${tone.border}`, background: 'rgba(255,255,255,0.85)' }}>
                                                                        <img
                                                                            src={imagePreviewSrc}
                                                                            alt={toText(headerMedia?.name) || 'Preview'}
                                                                            style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'cover' }}
                                                                        />
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ) : (
                                                            <small style={{ color: tone.textSoft }}>
                                                                Esta plantilla necesita un encabezado multimedia al momento de enviar.
                                                            </small>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px' }}>
                                            {(Array.isArray(preview?.components) ? preview.components : []).map((component, index) => (
                                                <div
                                                    key={`${component?.type || 'component'}_${index}`}
                                                    style={{ border: `1px solid ${tone.border}`, borderRadius: '14px', padding: '14px', background: tone.cardAlt }}
                                                >
                                                    <div style={{ fontSize: '0.72rem', color: tone.infoText, fontWeight: 800, letterSpacing: '0.08em', marginBottom: '8px' }}>
                                                        {toText(component?.type) || 'BODY'}
                                                    </div>
                                                    <div style={{ whiteSpace: 'pre-wrap', color: tone.text, fontSize: '0.88rem', lineHeight: 1.45 }}>
                                                        {toText(component?.resolvedText || component?.text) || 'Sin texto'}
                                                    </div>
                                                    {Array.isArray(component?.parameters) && component.parameters.length > 0 && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                                                            {component.parameters.map((parameter) => (
                                                                <span
                                                                    key={`${component?.type || 'component'}_${parameter?.placeholderIndex}`}
                                                                    style={{
                                                                        fontSize: '0.72rem',
                                                                        borderRadius: '999px',
                                                                        padding: '4px 9px',
                                                                        border: `1px solid ${parameter?.resolved ? tone.successBorder : tone.warningBorder}`,
                                                                        background: parameter?.resolved ? tone.successSurface : tone.warningSurface,
                                                                        color: parameter?.resolved ? tone.successText : tone.warningText
                                                                    }}
                                                                >
                                                                    {`{{${parameter?.placeholderIndex}}}`} {toText(parameter?.label || parameter?.key || 'Variable')}: {toText(parameter?.value) || '(vacio)'}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: `1px solid ${tone.menuBorder}` }}>
                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        style={{ border: `1px solid ${tone.ghostBorder}`, background: tone.ghostBg, color: tone.ghostText, borderRadius: '10px', padding: '10px 14px', cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                    {typeof onConfirm === 'function' && (
                        <button
                            type="button"
                            onClick={() => onConfirm?.()}
                            disabled={confirmDisabled || confirmBusy}
                            style={{
                                border: `1px solid ${confirmDisabled || confirmBusy ? tone.ghostBorder : tone.primaryBorder}`,
                                background: confirmDisabled || confirmBusy ? tone.disabledBg : tone.primaryBg,
                                color: confirmDisabled || confirmBusy ? tone.ghostText : tone.primaryText,
                                borderRadius: '10px',
                                padding: '10px 14px',
                                cursor: confirmDisabled || confirmBusy ? 'not-allowed' : 'pointer',
                                opacity: confirmDisabled || confirmBusy ? 0.7 : 1
                            }}
                        >
                            {confirmBusy ? 'Enviando...' : confirmLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
