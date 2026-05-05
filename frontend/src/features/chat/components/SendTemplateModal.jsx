import React from 'react';

function toText(value = '') {
    return String(value ?? '').trim();
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
    width: 'min(960px, 100%)',
    maxHeight: 'min(82vh, 860px)',
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
    onClose = null,
    onSelectTemplate = null,
    onConfirm = null
}) {
    if (!isOpen) return null;

    return (
        <div style={overlayStyle} onClick={() => onClose?.()}>
            <div style={cardStyle} onClick={(event) => event.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 20px', borderBottom: `1px solid ${tone.menuBorder}` }}>
                    <div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: tone.title }}>Enviar template</div>
                        <div style={{ fontSize: '0.8rem', color: tone.textSoft, marginTop: '4px' }}>
                            Selecciona un template individual y revisa sus variables resueltas con el contexto real del chat.
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

                <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: '0', minHeight: 0, flex: 1 }}>
                    <div style={{ borderRight: `1px solid ${tone.menuBorder}`, padding: '16px', overflowY: 'auto' }}>
                        <div style={{ fontSize: '0.74rem', color: tone.infoText, fontWeight: 800, letterSpacing: '0.08em', marginBottom: '10px' }}>
                            TEMPLATES DISPONIBLES
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                                                background: isSelected ? tone.successSurface : tone.cardAlt,
                                                borderRadius: '12px',
                                                padding: '12px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: tone.title }}>{toText(template?.templateName) || 'Template'}</div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.68rem', color: tone.textSoft, border: `1px solid ${tone.controlBorder}`, borderRadius: '999px', padding: '3px 8px', background: tone.ghostBg }}>
                                                    {toText(template?.templateLanguage).toUpperCase() || 'ES'}
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: tone.textSoft, border: `1px solid ${tone.controlBorder}`, borderRadius: '999px', padding: '3px 8px', background: tone.ghostBg }}>
                                                    {toText(template?.useCase) || 'both'}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div style={{ padding: '18px', overflowY: 'auto' }}>
                        {!selectedTemplate && (
                            <div style={{ border: `1px dashed ${tone.controlBorder}`, borderRadius: '14px', padding: '22px', color: tone.textSoft, fontSize: '0.9rem', background: tone.cardAlt }}>
                                Elige un template para ver la preview resuelta con el cliente, cotizacion y agente del chat actual.
                            </div>
                        )}

                        {selectedTemplate && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                                        <div style={{ border: `1px solid ${tone.successBorder}`, background: tone.successSurface, borderRadius: '14px', padding: '16px' }}>
                                            <div style={{ fontSize: '0.74rem', color: tone.successText, fontWeight: 800, letterSpacing: '0.08em', marginBottom: '8px' }}>
                                                PREVIEW DEL MENSAJE
                                            </div>
                                            <div style={{ whiteSpace: 'pre-wrap', color: tone.text, fontSize: '0.92rem', lineHeight: 1.5 }}>
                                                {toText(preview?.previewText) || 'Sin contenido visible'}
                                            </div>
                                        </div>

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
