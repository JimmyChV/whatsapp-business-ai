import React from 'react';
import ImageDropInput from '../../components/panel/ImageDropInput';
import { uploadImageAsset } from '../../helpers';

const EMPTY_BRAND = {
    logoUrl: '',
    brandColor: '#1D9E75',
    companyName: '',
    footerText: '',
    websiteUrl: '',
    socialLinks: {}
};

function text(value = '') {
    return String(value || '').trim();
}

function normalizeBrand(brand = {}) {
    return {
        ...EMPTY_BRAND,
        logoUrl: text(brand.logoUrl || brand.logo_url),
        brandColor: text(brand.brandColor || brand.brand_color) || '#1D9E75',
        companyName: text(brand.companyName || brand.company_name),
        footerText: text(brand.footerText || brand.footer_text),
        websiteUrl: text(brand.websiteUrl || brand.website_url),
        socialLinks: brand.socialLinks || brand.social_links || {}
    };
}

function templateIcon(key = '') {
    if (key.includes('otp')) return '🔐';
    if (key.includes('password')) return '🔒';
    if (key.includes('revoked')) return '📱';
    if (key.includes('approved') || key.includes('authorized')) return '✅';
    return '✉️';
}

function insertAtCursor(source = '', insert = '', start = 0, end = 0) {
    const safeStart = Math.max(0, Number(start) || 0);
    const safeEnd = Math.max(safeStart, Number(end) || safeStart);
    return `${source.slice(0, safeStart)}${insert}${source.slice(safeEnd)}`;
}

function TemplateCard({ item, selected, canManage, onEdit, onPreview }) {
    return (
        <article className={`saas-email-template-card ${selected ? 'is-selected' : ''}`.trim()}>
            <div className="saas-email-template-card__icon" aria-hidden="true">
                {templateIcon(item?.templateKey)}
            </div>
            <div className="saas-email-template-card__body">
                <div className="saas-email-template-card__title">
                    <strong>{item?.label || item?.templateKey}</strong>
                    <span className={`saas-email-template-status ${item?.isCustom ? 'is-custom' : ''}`.trim()}>
                        {item?.isCustom ? 'Personalizada' : 'Default'}
                    </span>
                </div>
                <small>{item?.description || 'Plantilla transaccional del sistema.'}</small>
            </div>
            <div className="saas-email-template-card__actions">
                <button type="button" onClick={() => onPreview(item)}>
                    Vista previa
                </button>
                <button type="button" disabled={!canManage} onClick={() => onEdit(item)}>
                    Editar
                </button>
            </div>
        </article>
    );
}

function TemplateEditorModal({
    template,
    draft,
    setDraft,
    previewHtml,
    previewLoading,
    previewError,
    busy,
    canManage,
    onClose,
    onSave,
    onReset,
    onSendTest
}) {
    const textareaRef = React.useRef(null);
    const subjectRef = React.useRef(null);
    const variables = Array.isArray(template?.variables) ? template.variables : [];

    const insertVariable = React.useCallback((variableKey) => {
        const token = `{{${variableKey}}}`;
        const textarea = textareaRef.current;
        if (!textarea) {
            setDraft((prev) => ({ ...prev, bodyHtml: `${prev.bodyHtml || ''}${token}` }));
            return;
        }
        const nextValue = insertAtCursor(draft.bodyHtml || '', token, textarea.selectionStart, textarea.selectionEnd);
        const nextCursor = (textarea.selectionStart || 0) + token.length;
        setDraft((prev) => ({ ...prev, bodyHtml: nextValue }));
        window.requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
        });
    }, [draft.bodyHtml, setDraft]);

    const insertSubjectVariable = React.useCallback((variableKey) => {
        const token = `{{${variableKey}}}`;
        const input = subjectRef.current;
        if (!input) {
            setDraft((prev) => ({ ...prev, subject: `${prev.subject || ''}${token}` }));
            return;
        }
        const nextValue = insertAtCursor(draft.subject || '', token, input.selectionStart, input.selectionEnd);
        const nextCursor = (input.selectionStart || 0) + token.length;
        setDraft((prev) => ({ ...prev, subject: nextValue }));
        window.requestAnimationFrame(() => {
            input.focus();
            input.setSelectionRange(nextCursor, nextCursor);
        });
    }, [draft.subject, setDraft]);

    return (
        <div className="saas-email-editor-overlay" role="dialog" aria-modal="true">
            <div className="saas-email-editor">
                <div className="saas-email-editor__header">
                    <div>
                        <h3>{canManage ? 'Editar plantilla' : 'Vista de plantilla'}</h3>
                        <small>{template?.label || template?.templateKey}</small>
                    </div>
                    <button type="button" onClick={onClose}>Cerrar</button>
                </div>

                <div className="saas-email-editor__grid">
                    <section className="saas-email-editor__form">
                        <label>
                            Asunto
                            <input
                                ref={subjectRef}
                                value={draft.subject || ''}
                                onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))}
                                disabled={!canManage || busy}
                            />
                        </label>

                        <label>
                            Cuerpo HTML
                            <textarea
                                ref={textareaRef}
                                value={draft.bodyHtml || ''}
                                onChange={(event) => setDraft((prev) => ({ ...prev, bodyHtml: event.target.value }))}
                                disabled={!canManage || busy}
                                spellCheck={false}
                            />
                        </label>

                        <div className="saas-email-variable-panel">
                            <div>
                                <strong>Variables disponibles</strong>
                                <small>Click en una variable para insertarla en el cuerpo.</small>
                            </div>
                            <div className="saas-email-variable-list">
                                {variables.map((variable) => (
                                    <button
                                        key={variable.key}
                                        type="button"
                                        disabled={!canManage}
                                        onClick={() => insertVariable(variable.key)}
                                        title={variable.description || variable.key}
                                    >
                                        {`{{${variable.key}}}`}
                                    </button>
                                ))}
                            </div>
                            <div className="saas-email-variable-actions">
                                {variables.slice(0, 6).map((variable) => (
                                    <button
                                        key={`subject_${variable.key}`}
                                        type="button"
                                        disabled={!canManage}
                                        onClick={() => insertSubjectVariable(variable.key)}
                                    >
                                        + asunto {`{{${variable.key}}}`}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="saas-email-preview-panel">
                        <div className="saas-email-preview-panel__header">
                            <div>
                                <strong>Preview en vivo</strong>
                                <small>{previewLoading ? 'Actualizando...' : 'Render con marca del tenant'}</small>
                            </div>
                            <span>{template?.isCustom ? 'Custom' : 'Default'}</span>
                        </div>
                        {previewError ? <div className="saas-admin-error-inline">{previewError}</div> : null}
                        <iframe title="Preview de correo" srcDoc={previewHtml || '<p>Generando preview...</p>'} />
                    </section>
                </div>

                <div className="saas-email-editor__footer">
                    <button type="button" className="saas-btn-cancel" disabled={busy || !canManage} onClick={onReset}>
                        Restaurar default
                    </button>
                    <button type="button" disabled={busy || !canManage} onClick={onSendTest}>
                        Enviar prueba
                    </button>
                    <button type="button" disabled={busy || !canManage} onClick={onSave}>
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function EmailTemplatesSettingsDetailPane({
    settingsTenantId,
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson,
    canViewEmailTemplates = false,
    canManageEmailTemplates = false,
    canViewBrand = false,
    canManageBrand = false
}) {
    const [templates, setTemplates] = React.useState([]);
    const [brand, setBrand] = React.useState(EMPTY_BRAND);
    const [loading, setLoading] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');
    const [selectedTemplate, setSelectedTemplate] = React.useState(null);
    const [draft, setDraft] = React.useState({ subject: '', bodyHtml: '' });
    const [previewHtml, setPreviewHtml] = React.useState('');
    const [previewLoading, setPreviewLoading] = React.useState(false);
    const [previewError, setPreviewError] = React.useState('');

    const isVisible = Boolean(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'email_templates' && canViewEmailTemplates);

    const loadData = React.useCallback(async () => {
        if (!isVisible || typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        setMessage('');
        try {
            const [templatesPayload, brandPayload] = await Promise.all([
                requestJson('/api/tenant/email-templates', {
                    method: 'GET',
                    tenantIdOverride: settingsTenantId
                }),
                canViewBrand
                    ? requestJson('/api/tenant/email-brand', {
                        method: 'GET',
                        tenantIdOverride: settingsTenantId
                    })
                    : Promise.resolve({ brand: EMPTY_BRAND })
            ]);
            setTemplates(Array.isArray(templatesPayload?.items) ? templatesPayload.items : []);
            setBrand(normalizeBrand(brandPayload?.brand || {}));
        } catch (err) {
            setError(String(err?.message || err || 'No se pudieron cargar plantillas de correo.'));
        } finally {
            setLoading(false);
        }
    }, [canViewBrand, isVisible, requestJson, settingsTenantId]);

    React.useEffect(() => {
        void loadData();
    }, [loadData]);

    const updateBrand = React.useCallback((key, value) => {
        setBrand((prev) => ({ ...prev, [key]: value }));
    }, []);

    const uploadLogo = React.useCallback(async (file) => {
        if (!file || typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const logoUrl = await uploadImageAsset({
                file,
                tenantId: settingsTenantId,
                scope: 'email_brand_logo',
                requestJson
            });
            setBrand((prev) => ({ ...prev, logoUrl }));
            setMessage('Logo cargado. Guarda identidad para conservar el cambio.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo subir el logo.'));
        } finally {
            setBusy(false);
        }
    }, [requestJson, settingsTenantId]);

    const saveBrand = React.useCallback(async () => {
        if (typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson('/api/tenant/email-brand', {
                method: 'PUT',
                tenantIdOverride: settingsTenantId,
                body: brand
            });
            setBrand(normalizeBrand(payload?.brand || {}));
            setMessage('Identidad de marca guardada.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo guardar identidad de marca.'));
        } finally {
            setBusy(false);
        }
    }, [brand, requestJson, settingsTenantId]);

    const openEditor = React.useCallback((template) => {
        setSelectedTemplate(template);
        setDraft({
            subject: template?.subject || '',
            bodyHtml: template?.bodyHtml || ''
        });
        setPreviewHtml('');
        setPreviewError('');
    }, []);

    const openPreview = React.useCallback((template) => {
        openEditor(template);
    }, [openEditor]);

    React.useEffect(() => {
        if (!selectedTemplate || typeof requestJson !== 'function') return undefined;
        const timer = window.setTimeout(async () => {
            setPreviewLoading(true);
            setPreviewError('');
            try {
                const payload = await requestJson(`/api/tenant/email-templates/${encodeURIComponent(selectedTemplate.templateKey)}/preview`, {
                    method: 'POST',
                    tenantIdOverride: settingsTenantId,
                    body: {
                        subject: draft.subject,
                        bodyHtml: draft.bodyHtml
                    }
                });
                setPreviewHtml(payload?.html || '');
            } catch (err) {
                setPreviewError(String(err?.message || err || 'No se pudo generar vista previa.'));
            } finally {
                setPreviewLoading(false);
            }
        }, 350);
        return () => window.clearTimeout(timer);
    }, [draft.bodyHtml, draft.subject, requestJson, selectedTemplate, settingsTenantId]);

    const refreshSelected = React.useCallback((item) => {
        setTemplates((prev) => prev.map((entry) => (
            entry.templateKey === item?.templateKey ? item : entry
        )));
        setSelectedTemplate(item);
        setDraft({
            subject: item?.subject || '',
            bodyHtml: item?.bodyHtml || ''
        });
    }, []);

    const saveTemplate = React.useCallback(async () => {
        if (!selectedTemplate || typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson(`/api/tenant/email-templates/${encodeURIComponent(selectedTemplate.templateKey)}`, {
                method: 'PUT',
                tenantIdOverride: settingsTenantId,
                body: draft
            });
            refreshSelected(payload?.item || selectedTemplate);
            setMessage('Plantilla guardada.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo guardar la plantilla.'));
        } finally {
            setBusy(false);
        }
    }, [draft, refreshSelected, requestJson, selectedTemplate, settingsTenantId]);

    const resetTemplate = React.useCallback(async () => {
        if (!selectedTemplate || typeof requestJson !== 'function') return;
        if (!window.confirm('Restaurar esta plantilla a su version original? Se perderan los cambios personalizados.')) return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson(`/api/tenant/email-templates/${encodeURIComponent(selectedTemplate.templateKey)}`, {
                method: 'DELETE',
                tenantIdOverride: settingsTenantId
            });
            refreshSelected(payload?.item || selectedTemplate);
            setMessage('Plantilla restaurada a default.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo restaurar la plantilla.'));
        } finally {
            setBusy(false);
        }
    }, [refreshSelected, requestJson, selectedTemplate, settingsTenantId]);

    const sendTest = React.useCallback(async () => {
        if (!selectedTemplate || typeof requestJson !== 'function') return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson(`/api/tenant/email-templates/${encodeURIComponent(selectedTemplate.templateKey)}/test`, {
                method: 'POST',
                tenantIdOverride: settingsTenantId
            });
            setMessage(payload?.message || 'Correo de prueba enviado.');
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo enviar correo de prueba.'));
        } finally {
            setBusy(false);
        }
    }, [requestJson, selectedTemplate, settingsTenantId]);

    if (!isVisible) return null;

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Plantillas de correo</h3>
                    <small>Personaliza identidad, textos y variables de los correos transaccionales.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading || busy} onClick={loadData}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}
            {message ? <div className="saas-admin-success-inline">{message}</div> : null}

            <section className={`saas-admin-related-block saas-email-brand-card ${!canViewBrand ? 'is-locked' : ''}`.trim()}>
                <div className="saas-email-brand-hero">
                    <div className="saas-email-brand-hero__content">
                        <span className="saas-email-kicker">Identidad de marca</span>
                        <h4>Personaliza como se ven tus correos corporativos</h4>
                        <small>
                            Define logo, color, empresa, footer y website para que OTP, seguridad y recuperacion
                            salgan con la identidad correcta del tenant.
                        </small>
                    </div>
                    <div className="saas-email-brand-preview saas-email-brand-preview--hero" style={{ '--brand-color': brand.brandColor || '#1D9E75' }}>
                        {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.companyName || 'Logo'} /> : <span>WA</span>}
                    </div>
                </div>

                {!canViewBrand ? (
                    <div className="saas-admin-empty-inline">
                        No tienes permiso para ver identidad de marca. Solicita el permiso tenant.brand.read.
                    </div>
                ) : (
                    <>
                    <div className="saas-email-brand-card__head">
                        <div>
                            <strong>Configuracion de marca</strong>
                            <small>Ajusta los datos visibles en el layout base del correo.</small>
                        </div>
                    </div>

                    <div className="saas-email-brand-grid">
                        <div className="saas-email-brand-upload">
                            <ImageDropInput
                                label="Subir logo"
                                disabled={busy || !canManageBrand}
                                onFile={uploadLogo}
                                helpText="JPG, PNG o WEBP. Se usara como header del correo."
                            />
                            <label>
                                URL del logo
                                <input
                                    value={brand.logoUrl}
                                    onChange={(event) => updateBrand('logoUrl', event.target.value)}
                                    disabled={busy || !canManageBrand}
                                    placeholder="https://..."
                                />
                            </label>
                        </div>
                        <div className="saas-email-brand-fields">
                            <div className="saas-admin-form-row">
                                <label>
                                    Color marca
                                    <div className="saas-email-color-field">
                                        <input
                                            type="color"
                                            value={brand.brandColor || '#1D9E75'}
                                            onChange={(event) => updateBrand('brandColor', event.target.value)}
                                            disabled={busy || !canManageBrand}
                                        />
                                        <input
                                            value={brand.brandColor}
                                            onChange={(event) => updateBrand('brandColor', event.target.value)}
                                            disabled={busy || !canManageBrand}
                                            placeholder="#1D9E75"
                                        />
                                    </div>
                                </label>
                                <label>
                                    Nombre
                                    <input
                                        value={brand.companyName}
                                        onChange={(event) => updateBrand('companyName', event.target.value)}
                                        disabled={busy || !canManageBrand}
                                        placeholder="Lavitat"
                                    />
                                </label>
                            </div>
                            <div className="saas-admin-form-row">
                                <label>
                                    Footer
                                    <input
                                        value={brand.footerText}
                                        onChange={(event) => updateBrand('footerText', event.target.value)}
                                        disabled={busy || !canManageBrand}
                                        placeholder="© 2026 Lavitat. Todos los derechos reservados."
                                    />
                                </label>
                                <label>
                                    Website
                                    <input
                                        value={brand.websiteUrl}
                                        onChange={(event) => updateBrand('websiteUrl', event.target.value)}
                                        disabled={busy || !canManageBrand}
                                        placeholder="https://lavitat.pe"
                                    />
                                </label>
                            </div>
                            {canManageBrand ? (
                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                    <button type="button" disabled={loading || busy} onClick={saveBrand}>
                                        Guardar identidad
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    </>
                )}
            </section>

            <section className="saas-admin-related-block saas-email-templates-list">
                <div className="saas-admin-pane-header">
                    <div>
                        <h4>Plantillas de correo electronico</h4>
                        <small>Estas plantillas se usan para OTP, recuperacion, dispositivos y seguridad.</small>
                    </div>
                    <span className="saas-admin-empty-inline">
                        {templates.length} plantillas
                    </span>
                </div>

                {loading ? (
                    <div className="saas-admin-empty-inline">Cargando plantillas...</div>
                ) : templates.length ? (
                    <div className="saas-email-template-list">
                        {templates.map((item) => (
                            <TemplateCard
                                key={item.templateKey}
                                item={item}
                                selected={selectedTemplate?.templateKey === item.templateKey}
                                canManage={canManageEmailTemplates}
                                onEdit={openEditor}
                                onPreview={openPreview}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="saas-admin-empty-inline">No hay plantillas disponibles.</div>
                )}
            </section>

            {selectedTemplate ? (
                <TemplateEditorModal
                    template={selectedTemplate}
                    draft={draft}
                    setDraft={setDraft}
                    previewHtml={previewHtml}
                    previewLoading={previewLoading}
                    previewError={previewError}
                    busy={busy}
                    canManage={canManageEmailTemplates}
                    onClose={() => setSelectedTemplate(null)}
                    onSave={saveTemplate}
                    onReset={resetTemplate}
                    onSendTest={sendTest}
                />
            ) : null}
        </>
    );
}
