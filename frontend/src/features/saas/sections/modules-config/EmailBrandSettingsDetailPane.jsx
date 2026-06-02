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

export default function EmailBrandSettingsDetailPane({
    settingsTenantId,
    isGeneralConfigSection,
    selectedConfigKey,
    requestJson,
    canViewBrand = false,
    canManageBrand = false
}) {
    const [brand, setBrand] = React.useState(EMPTY_BRAND);
    const [loading, setLoading] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [error, setError] = React.useState('');

    const isVisible = Boolean(settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'email_brand' && canViewBrand);

    const loadData = React.useCallback(async () => {
        if (!isVisible || typeof requestJson !== 'function') return;
        setLoading(true);
        setError('');
        setMessage('');
        try {
            const payload = await requestJson('/api/tenant/email-brand', {
                method: 'GET',
                tenantIdOverride: settingsTenantId
            });
            setBrand(normalizeBrand(payload?.brand || {}));
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo cargar identidad de marca.'));
        } finally {
            setLoading(false);
        }
    }, [isVisible, requestJson, settingsTenantId]);

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

    if (!isVisible) return null;

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>Identidad de marca</h3>
                    <small>Personaliza como se ven tus correos corporativos.</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    <button type="button" disabled={loading || busy} onClick={loadData}>
                        Recargar
                    </button>
                </div>
            </div>

            {error ? <div className="saas-admin-error-inline">{error}</div> : null}
            {message ? <div className="saas-admin-success-inline">{message}</div> : null}

            <section className="saas-admin-related-block saas-email-brand-card saas-email-brand-card--standalone">
                <div className="saas-email-brand-hero">
                    <div className="saas-email-brand-hero__content">
                        <span className="saas-email-kicker">Identidad de marca</span>
                        <h4>Define la apariencia de tus correos</h4>
                        <small>
                            Este logo, color, empresa, footer y website se usan en OTP, seguridad,
                            recuperacion de contraseña y avisos de dispositivos.
                        </small>
                    </div>
                    <div className="saas-email-brand-preview saas-email-brand-preview--hero" style={{ '--brand-color': brand.brandColor || '#1D9E75' }}>
                        {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.companyName || 'Logo'} /> : <span>WA</span>}
                    </div>
                </div>

                <div className="saas-email-brand-card__body">
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
                </div>
            </section>
        </>
    );
}
