import React from 'react';

function toText(value = '') {
    return String(value ?? '').trim();
}

const overlayStyle = {
    position: 'absolute',
    inset: 0,
    zIndex: 120,
    background: 'rgba(6, 18, 24, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
};

const cardStyle = {
    width: 'min(960px, 100%)',
    maxHeight: 'min(82vh, 860px)',
    background: '#10212a',
    border: '1px solid rgba(124, 200, 255, 0.18)',
    borderRadius: '18px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f1f7fb' }}>Enviar template</div>
                        <div style={{ fontSize: '0.8rem', color: '#8fb3c5', marginTop: '4px' }}>
                            Selecciona un template individual y revisa sus variables resueltas con el contexto real del chat.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        style={{ border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#d9e7ee', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer' }}
                    >
                        Cerrar
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: '0', minHeight: 0, flex: 1 }}>
                    <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: '16px', overflowY: 'auto' }}>
                        <div style={{ fontSize: '0.74rem', color: '#7cc8ff', fontWeight: 800, letterSpacing: '0.08em', marginBottom: '10px' }}>
                            TEMPLATES DISPONIBLES
                        </div>
                        {templatesLoading && (
                            <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', color: '#a7bfcc', fontSize: '0.82rem' }}>
                                Cargando templates aprobados...
                            </div>
                        )}
                        {!templatesLoading && templatesError && (
                            <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(160, 32, 32, 0.16)', border: '1px solid rgba(255, 116, 116, 0.24)', color: '#ffd0d0', fontSize: '0.82rem' }}>
                                {templatesError}
                            </div>
                        )}
                        {!templatesLoading && !templatesError && templates.length === 0 && (
                            <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', color: '#a7bfcc', fontSize: '0.82rem' }}>
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
                                                border: isSelected ? '1px solid rgba(0, 212, 170, 0.72)' : '1px solid rgba(255,255,255,0.08)',
                                                background: isSelected ? 'rgba(0, 168, 132, 0.16)' : 'rgba(255,255,255,0.02)',
                                                borderRadius: '12px',
                                                padding: '12px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#eef7fb' }}>{toText(template?.templateName) || 'Template'}</div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.68rem', color: '#94bdd1', border: '1px solid rgba(124, 200, 255, 0.18)', borderRadius: '999px', padding: '3px 8px' }}>
                                                    {toText(template?.templateLanguage).toUpperCase() || 'ES'}
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: '#94bdd1', border: '1px solid rgba(124, 200, 255, 0.18)', borderRadius: '999px', padding: '3px 8px' }}>
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
                            <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: '14px', padding: '22px', color: '#8fb3c5', fontSize: '0.9rem' }}>
                                Elige un template para ver la preview resuelta con el cliente, cotizacion y agente del chat actual.
                            </div>
                        )}

                        {selectedTemplate && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f3fbff' }}>{toText(selectedTemplate?.templateName) || 'Template'}</div>
                                        <div style={{ marginTop: '4px', fontSize: '0.78rem', color: '#8fb3c5' }}>
                                            {toText(selectedTemplate?.moduleId) || 'Sin modulo'} | {toText(selectedTemplate?.templateLanguage).toUpperCase() || 'ES'}
                                        </div>
                                    </div>
                                </div>

                                {previewLoading && (
                                    <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', color: '#a7bfcc', fontSize: '0.84rem' }}>
                                        Resolviendo variables reales del chat...
                                    </div>
                                )}

                                {!previewLoading && previewError && (
                                    <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(160, 32, 32, 0.16)', border: '1px solid rgba(255, 116, 116, 0.24)', color: '#ffd0d0', fontSize: '0.84rem' }}>
                                        {previewError}
                                    </div>
                                )}

                                {!previewLoading && !previewError && preview && (
                                    <>
                                        <div style={{ border: '1px solid rgba(0, 212, 170, 0.2)', background: 'rgba(0, 168, 132, 0.08)', borderRadius: '14px', padding: '16px' }}>
                                            <div style={{ fontSize: '0.74rem', color: '#00d4aa', fontWeight: 800, letterSpacing: '0.08em', marginBottom: '8px' }}>
                                                PREVIEW DEL MENSAJE
                                            </div>
                                            <div style={{ whiteSpace: 'pre-wrap', color: '#f2fbff', fontSize: '0.92rem', lineHeight: 1.5 }}>
                                                {toText(preview?.previewText) || 'Sin contenido visible'}
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px' }}>
                                            {(Array.isArray(preview?.components) ? preview.components : []).map((component, index) => (
                                                <div
                                                    key={`${component?.type || 'component'}_${index}`}
                                                    style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '14px', background: 'rgba(255,255,255,0.02)' }}
                                                >
                                                    <div style={{ fontSize: '0.72rem', color: '#7cc8ff', fontWeight: 800, letterSpacing: '0.08em', marginBottom: '8px' }}>
                                                        {toText(component?.type) || 'BODY'}
                                                    </div>
                                                    <div style={{ whiteSpace: 'pre-wrap', color: '#e8f4fa', fontSize: '0.88rem', lineHeight: 1.45 }}>
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
                                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                                        background: parameter?.resolved ? 'rgba(0, 168, 132, 0.12)' : 'rgba(255, 170, 64, 0.12)',
                                                                        color: parameter?.resolved ? '#c9fff0' : '#ffe0b5'
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

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <button
                        type="button"
                        onClick={() => onClose?.()}
                        style={{ border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#d9e7ee', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                    {typeof onConfirm === 'function' && (
                        <button
                            type="button"
                            onClick={() => onConfirm?.()}
                            disabled={confirmDisabled || confirmBusy}
                            style={{
                                border: '1px solid rgba(0, 212, 170, 0.6)',
                                background: confirmDisabled || confirmBusy ? 'rgba(0, 168, 132, 0.18)' : 'rgba(0, 168, 132, 0.28)',
                                color: '#e9fffb',
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
