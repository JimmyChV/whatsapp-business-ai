let cachedTransporter = null;
let cachedConfigKey = '';

function isProduction() {
    return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function parseBooleanEnv(value, defaultValue = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function getEmailConfig() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = parseBooleanEnv(process.env.SMTP_SECURE, false);
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    const from = String(process.env.SMTP_FROM || '').trim();
    const rejectUnauthorized = parseBooleanEnv(process.env.SMTP_TLS_REJECT_UNAUTHORIZED, false);

    return {
        host,
        port: Number.isFinite(port) ? port : 587,
        secure,
        user,
        pass,
        from,
        rejectUnauthorized
    };
}

function buildConfigKey(config = {}) {
    return [
        config.host,
        String(config.port || ''),
        config.secure ? '1' : '0',
        config.user,
        config.pass,
        config.from,
        config.rejectUnauthorized ? '1' : '0'
    ].join('|');
}

function isEmailConfigured(config = getEmailConfig()) {
    return Boolean(config.host && config.from);
}

async function loadNodemailer() {
    try {
        return require('nodemailer');
    } catch (error) {
        throw new Error('Falta dependencia nodemailer. Ejecuta npm i nodemailer en backend.');
    }
}

async function createTransporter(config = {}) {
    const nodemailer = await loadNodemailer();
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? {
            user: config.user,
            pass: config.pass
        } : undefined,
        tls: {
            rejectUnauthorized: config.rejectUnauthorized
        }
    });
}

async function getTransporter() {
    const config = getEmailConfig();
    if (!isEmailConfigured(config)) {
        throw new Error('SMTP no configurado. Define SMTP_HOST y SMTP_FROM.');
    }

    const configKey = buildConfigKey(config);
    if (cachedTransporter && cachedConfigKey === configKey) {
        return cachedTransporter;
    }

    cachedTransporter = await createTransporter(config);
    cachedConfigKey = configKey;
    return cachedTransporter;
}

async function sendEmailWithConfig(config = {}, { to = '', subject = '', text = '', html = '' } = {}) {
    const recipient = String(to || '').trim();
    if (!recipient) {
        throw new Error('Destinatario de correo requerido.');
    }
    if (!isEmailConfigured(config)) {
        throw new Error('SMTP no configurado para envio de correo.');
    }

    const globalConfig = getEmailConfig();
    const transporter = buildConfigKey(config) === buildConfigKey(globalConfig)
        ? await getTransporter()
        : await createTransporter(config);
    return transporter.sendMail({
        from: config.from,
        to: recipient,
        subject: String(subject || '').trim() || 'Notificacion',
        text: String(text || '').trim() || undefined,
        html: String(html || '').trim() || undefined
    });
}

async function sendEmail(args = {}) {
    return sendEmailWithConfig(getEmailConfig(), args);
}

function normalizeTenantSmtpConfig(smtp = {}) {
    const source = smtp && typeof smtp === 'object' ? smtp : {};
    const security = String(source.security || '').trim().toLowerCase();
    const port = Number(source.port || (security === 'ssl' ? 465 : 587));
    const secure = security === 'ssl' ? true : source.secure === true;
    return {
        host: String(source.host || '').trim(),
        port: Number.isFinite(port) ? port : (secure ? 465 : 587),
        secure,
        user: String(source.user || '').trim(),
        pass: String(source.pass || '').trim(),
        from: String(source.from || '').trim(),
        rejectUnauthorized: source.tlsRejectUnauthorized === true || source.rejectUnauthorized === true
    };
}

async function getTenantEmailConfig(tenantId = '') {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) return null;
    try {
        const tenantIntegrationsService = require('../../tenant/services/integrations.service');
        const integrations = await tenantIntegrationsService.getTenantIntegrations(cleanTenantId, { runtime: true });
        return normalizeTenantSmtpConfig(integrations?.smtp || {});
    } catch (error) {
        console.warn('[Email] tenant SMTP config unavailable', {
            tenantId: cleanTenantId,
            error: String(error?.message || error)
        });
        return null;
    }
}

async function sendEmailForTenant(tenantId = '', args = {}) {
    const cleanTenantId = String(tenantId || '').trim();
    const tenantConfig = await getTenantEmailConfig(cleanTenantId);

    if (tenantConfig && isEmailConfigured(tenantConfig)) {
        try {
            return await sendEmailWithConfig(tenantConfig, args);
        } catch (error) {
            console.warn('[Email] tenant SMTP failed, falling back to global SMTP', {
                tenantId: cleanTenantId || null,
                error: String(error?.message || error)
            });
            if (!isEmailConfigured(getEmailConfig())) throw error;
        }
    }

    if (!isEmailConfigured(getEmailConfig()) && !isProduction()) {
        return { skipped: 'smtp_not_configured' };
    }
    return sendEmail(args);
}

module.exports = {
    getEmailConfig,
    isEmailConfigured,
    sendEmail,
    sendEmailForTenant
};
