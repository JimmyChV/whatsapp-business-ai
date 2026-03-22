let cachedTransporter = null;
let cachedConfigKey = '';

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

async function getTransporter() {
    const config = getEmailConfig();
    if (!isEmailConfigured(config)) {
        throw new Error('SMTP no configurado. Define SMTP_HOST y SMTP_FROM.');
    }

    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    } catch (error) {
        throw new Error('Falta dependencia nodemailer. Ejecuta npm i nodemailer en backend.');
    }

    const configKey = buildConfigKey(config);
    if (cachedTransporter && cachedConfigKey === configKey) {
        return cachedTransporter;
    }

    cachedTransporter = nodemailer.createTransport({
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
    cachedConfigKey = configKey;
    return cachedTransporter;
}

async function sendEmail({ to = '', subject = '', text = '', html = '' } = {}) {
    const recipient = String(to || '').trim();
    if (!recipient) {
        throw new Error('Destinatario de correo requerido.');
    }

    const config = getEmailConfig();
    if (!isEmailConfigured(config)) {
        throw new Error('SMTP no configurado para envio de correo.');
    }

    const transporter = await getTransporter();
    return transporter.sendMail({
        from: config.from,
        to: recipient,
        subject: String(subject || '').trim() || 'Notificacion',
        text: String(text || '').trim() || undefined,
        html: String(html || '').trim() || undefined
    });
}

module.exports = {
    getEmailConfig,
    isEmailConfigured,
    sendEmail
};

