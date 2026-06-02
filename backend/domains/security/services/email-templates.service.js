const {
    getStorageDriver,
    queryPostgres
} = require('../../../config/persistence-runtime');

function text(value = '') {
    return String(value ?? '').trim();
}

function isPostgresAvailable() {
    return getStorageDriver() === 'postgres';
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeColor(value = '') {
    const clean = text(value);
    return /^#[0-9A-Fa-f]{6}$/.test(clean) ? clean : '#1D9E75';
}

function currentYear() {
    return String(new Date().getFullYear());
}

const GLOBAL_VARIABLE_KEYS = Object.freeze([
    'empresa',
    'plataforma',
    'año',
    'color_marca',
    'website'
]);

const TEMPLATE_DEFINITIONS = Object.freeze({
    otp_device_verify: {
        label: 'Verificacion de nuevo dispositivo',
        description: 'Codigo OTP para aprobar un dispositivo nuevo.',
        subject: 'Nuevo dispositivo requiere autorizacion',
        bodyHtml: `
            <p>Hola {{nombre}},</p>
            <p>El usuario <strong>{{usuario_solicitante}}</strong> esta intentando acceder desde un nuevo dispositivo.</p>
            <p><strong>Dispositivo:</strong> {{dispositivo}}</p>
            <p><strong>IP:</strong> {{ip}}</p>
            <div class="otp-code">{{codigo_otp}}</div>
            <p>Comparte este codigo con el usuario para que pueda ingresar.</p>
            <p>Valido por {{expiracion}}.</p>
        `,
        variables: [
            'nombre',
            'usuario_solicitante',
            'codigo_otp',
            'dispositivo',
            'ip',
            'fecha',
            'expiracion'
        ]
    },
    password_changed: {
        label: 'Contrasena cambiada',
        description: 'Aviso al usuario cuando su contrasena cambia.',
        subject: 'Tu contrasena fue cambiada - {{plataforma}}',
        bodyHtml: `
            <p>Hola {{nombre}},</p>
            <p>Tu contrasena fue cambiada exitosamente.</p>
            <p><strong>Fecha:</strong> {{fecha}}<br/><strong>IP:</strong> {{ip}}</p>
            <p>Si no fuiste tu, contacta al administrador inmediatamente.</p>
        `,
        variables: ['nombre', 'fecha', 'ip']
    },
    device_revoked_self: {
        label: 'Dispositivo revocado por el usuario',
        description: 'Aviso cuando el usuario revoca su propio dispositivo.',
        subject: 'Dispositivo revocado',
        bodyHtml: `
            <p>Hola {{nombre}},</p>
            <p>Tu dispositivo <strong>{{dispositivo}}</strong> fue revocado por ti mismo.</p>
            <p><strong>Fecha:</strong> {{fecha}}</p>
            <p>Si no reconoces esta accion, contacta al administrador inmediatamente.</p>
        `,
        variables: ['nombre', 'dispositivo', 'revocado_por', 'fecha']
    },
    device_revoked_admin: {
        label: 'Dispositivo revocado por admin',
        description: 'Aviso cuando un administrador revoca un dispositivo.',
        subject: 'Tu dispositivo fue revocado',
        bodyHtml: `
            <p>Hola {{nombre}},</p>
            <p>Tu dispositivo <strong>{{dispositivo}}</strong> fue revocado por <strong>{{revocado_por}}</strong>.</p>
            <p><strong>Fecha:</strong> {{fecha}}</p>
            <p>Si tienes dudas, contacta a tu administrador.</p>
        `,
        variables: ['nombre', 'dispositivo', 'revocado_por', 'fecha']
    },
    device_reauth_otp: {
        label: 'Codigo OTP para reautorizar',
        description: 'Codigo OTP para reautorizar un dispositivo revocado.',
        subject: 'Codigo OTP para reautorizar dispositivo',
        bodyHtml: `
            <p>Hola {{nombre_destinatario}},</p>
            <p><strong>{{usuario_solicitante}}</strong> solicito reautorizar el dispositivo <strong>{{dispositivo}}</strong>.</p>
            <div class="otp-code">{{codigo_otp}}</div>
            <p>Comparte este codigo para que el usuario pueda ingresar.</p>
            <p>Valido por {{expiracion}}.</p>
        `,
        variables: [
            'nombre_destinatario',
            'usuario_solicitante',
            'dispositivo',
            'codigo_otp',
            'expiracion'
        ]
    },
    device_reauthorized: {
        label: 'Dispositivo reautorizado',
        description: 'Aviso cuando un dispositivo vuelve a estar autorizado.',
        subject: 'Tu dispositivo fue reautorizado',
        bodyHtml: `
            <p>Hola {{nombre}},</p>
            <p>Tu dispositivo <strong>{{dispositivo}}</strong> fue reautorizado exitosamente.</p>
            <p><strong>Fecha:</strong> {{fecha}}</p>
            <p>Ya puedes usarlo para ingresar.</p>
        `,
        variables: ['nombre', 'dispositivo', 'fecha']
    },
    password_recovery: {
        label: 'Recuperacion de contrasena',
        description: 'Codigo o enlace para recuperar el acceso.',
        subject: 'Codigo de seguridad para recuperar tu acceso',
        bodyHtml: `
            <p>Hola {{nombre}},</p>
            <p>Recibimos una solicitud para restablecer tu contrasena.</p>
            <div class="otp-code">{{link_reset}}</div>
            <p>Este codigo vence en {{expiracion}}.</p>
            <p>Si no solicitaste este cambio, ignora este correo.</p>
        `,
        variables: ['nombre', 'link_reset', 'fecha', 'ip', 'expiracion']
    },
    device_approved: {
        label: 'Nuevo dispositivo aprobado',
        description: 'Aviso informativo para autorizadores u owners.',
        subject: 'Nuevo dispositivo aprobado',
        bodyHtml: `
            <p>Se aprobo un nuevo dispositivo para acceder al panel.</p>
            <p><strong>Usuario:</strong> {{nombre}}<br/><strong>Dispositivo:</strong> {{dispositivo}}<br/><strong>IP:</strong> {{ip}}</p>
            <p><strong>Fecha:</strong> {{fecha}}</p>
        `,
        variables: ['nombre', 'dispositivo', 'ip', 'fecha']
    }
});

const TEMPLATE_KEYS = Object.freeze(Object.keys(TEMPLATE_DEFINITIONS));

const SAMPLE_VALUES = Object.freeze({
    empresa: 'Lavitat',
    plataforma: 'Panel WhatsApp SaaS',
    'año': currentYear(),
    color_marca: '#1D9E75',
    website: 'https://lavitat.pe',
    nombre: 'Sra. Luisa',
    nombre_destinatario: 'Administrador',
    usuario_solicitante: 'Jimmy Chuquizuta',
    codigo_otp: '482913',
    dispositivo: 'Celular Jimmy',
    ip: '38.25.25.153',
    fecha: '01/06/2026, 10:30 a. m.',
    expiracion: '10 minutos',
    revocado_por: 'Jimmy Chuquizuta',
    link_reset: '482913'
});

const VARIABLE_CATALOG = Object.freeze({
    empresa: {
        group: 'Marca del tenant',
        label: 'Empresa',
        description: 'Nombre comercial que aparece en el correo.',
        source: 'tenant_email_brand.company_name; si esta vacio, nombre del tenant'
    },
    plataforma: {
        group: 'Marca del tenant',
        label: 'Plataforma',
        description: 'Nombre del producto o panel que envia el correo.',
        source: 'Valor del sistema: Panel WhatsApp SaaS'
    },
    'año': {
        group: 'Marca del tenant',
        label: 'Año actual',
        description: 'Año usado para el footer legal del correo.',
        source: 'Fecha actual del servidor'
    },
    color_marca: {
        group: 'Marca del tenant',
        label: 'Color de marca',
        description: 'Color principal usado en botones, lineas y codigos.',
        source: 'tenant_email_brand.brand_color'
    },
    website: {
        group: 'Marca del tenant',
        label: 'Sitio web',
        description: 'URL corporativa que aparece en el footer.',
        source: 'tenant_email_brand.website_url'
    },
    nombre: {
        group: 'Destinatario',
        label: 'Nombre del destinatario',
        description: 'Persona que recibe este correo. Su significado exacto depende de la plantilla.',
        source: 'Usuario, owner o autorizador que recibira el email'
    },
    nombre_destinatario: {
        group: 'Destinatario',
        label: 'Nombre del destinatario',
        description: 'Persona autorizada que recibe el correo de reautorizacion.',
        source: 'tenant_device_authorizers.name; fallback al owner del tenant'
    },
    usuario_solicitante: {
        group: 'Usuario y dispositivo',
        label: 'Usuario solicitante',
        description: 'Usuario que intenta acceder o que solicito reautorizar el dispositivo.',
        source: 'users.display_name del usuario que dispara la accion'
    },
    codigo_otp: {
        group: 'Seguridad',
        label: 'Codigo OTP',
        description: 'Codigo de 6 digitos que se comparte para aprobar o reautorizar.',
        source: 'auth_otp_codes generado al momento del flujo'
    },
    dispositivo: {
        group: 'Usuario y dispositivo',
        label: 'Dispositivo',
        description: 'Nombre o tipo del dispositivo involucrado.',
        source: 'auth_device_sessions.device_name o device_type'
    },
    ip: {
        group: 'Seguridad',
        label: 'IP de acceso',
        description: 'IP desde donde se hizo la accion.',
        source: 'IP del request HTTP'
    },
    fecha: {
        group: 'Seguridad',
        label: 'Fecha del evento',
        description: 'Fecha y hora en que ocurrio la accion.',
        source: 'Fecha generada por el servidor al enviar el correo'
    },
    expiracion: {
        group: 'Seguridad',
        label: 'Tiempo de expiracion',
        description: 'Tiempo de validez del codigo o enlace.',
        source: 'Configuracion del flujo OTP o recuperacion'
    },
    revocado_por: {
        group: 'Usuario y dispositivo',
        label: 'Quien revoco',
        description: 'Usuario o administrador que revoco el dispositivo.',
        source: 'users.display_name del actor que ejecuta la revocacion'
    },
    link_reset: {
        group: 'Seguridad',
        label: 'Codigo o enlace de recuperacion',
        description: 'Codigo o URL para recuperar la contrasena.',
        source: 'Token generado por el flujo de recuperacion'
    }
});

const TEMPLATE_VARIABLE_OVERRIDES = Object.freeze({
    otp_device_verify: {
        nombre: {
            group: 'Autorizador',
            label: 'Nombre del autorizador',
            description: 'Persona autorizada que recibe el OTP y debe compartirlo con el usuario.',
            source: 'tenant_device_authorizers.name/email; si no hay autorizadores, owner del tenant'
        },
        usuario_solicitante: {
            label: 'Usuario que intenta ingresar',
            description: 'Usuario que esta intentando entrar desde un dispositivo nuevo.'
        }
    },
    password_changed: {
        nombre: {
            label: 'Usuario que cambio su contrasena',
            description: 'Usuario de la cuenta cuya contrasena fue cambiada.',
            source: 'users.display_name del usuario autenticado'
        }
    },
    device_revoked_self: {
        nombre: {
            label: 'Duenio del dispositivo',
            description: 'Usuario que revoco su propio dispositivo.'
        }
    },
    device_revoked_admin: {
        nombre: {
            label: 'Duenio del dispositivo',
            description: 'Usuario afectado por la revocacion.'
        },
        revocado_por: {
            label: 'Administrador que revoco',
            description: 'Admin, owner o superadmin que revoco el dispositivo.'
        }
    },
    device_reauth_otp: {
        nombre_destinatario: {
            group: 'Autorizador',
            label: 'Autorizador que recibe el OTP',
            description: 'Persona que recibe el codigo para reautorizar el dispositivo.'
        },
        usuario_solicitante: {
            label: 'Admin que solicita reautorizar',
            description: 'Persona que pidio iniciar la reautorizacion del dispositivo.'
        }
    },
    device_reauthorized: {
        nombre: {
            label: 'Duenio del dispositivo',
            description: 'Usuario cuyo dispositivo fue reautorizado.'
        }
    },
    password_recovery: {
        nombre: {
            label: 'Usuario que recupera acceso',
            description: 'Usuario que solicito recuperar su contrasena.'
        }
    },
    device_approved: {
        nombre: {
            label: 'Usuario aprobado',
            description: 'Usuario para quien se aprobo el nuevo dispositivo.'
        }
    }
});

function getTemplateDefinition(templateKey = '') {
    const key = text(templateKey);
    return TEMPLATE_DEFINITIONS[key] || null;
}

function getVariableMetadata(templateKey = '', variableKey = '') {
    const key = text(variableKey);
    const base = VARIABLE_CATALOG[key] || {};
    const overrides = TEMPLATE_VARIABLE_OVERRIDES[text(templateKey)]?.[key] || {};
    return {
        key,
        group: overrides.group || base.group || 'Datos del sistema',
        label: overrides.label || base.label || key,
        description: overrides.description || base.description || key,
        source: overrides.source || base.source || 'Valor entregado por el flujo que envia el correo',
        example: SAMPLE_VALUES[key] || ''
    };
}

function getAvailableVariables(templateKey = '') {
    const definition = getTemplateDefinition(templateKey);
    const cleanTemplateKey = text(templateKey);
    const specific = (definition?.variables || []).map((key) => getVariableMetadata(cleanTemplateKey, key));
    const seen = new Set();
    return [
        ...GLOBAL_VARIABLE_KEYS.map((key) => getVariableMetadata(cleanTemplateKey, key)),
        ...specific
    ].filter((entry) => {
        if (seen.has(entry.key)) return false;
        seen.add(entry.key);
        return true;
    });
}

function normalizeTemplateRow(row = null, templateKey = '') {
    const definition = getTemplateDefinition(templateKey || row?.template_key);
    if (!definition) return null;
    return {
        templateKey: text(row?.template_key || templateKey),
        label: definition.label,
        description: definition.description,
        subject: text(row?.subject) || definition.subject,
        bodyHtml: text(row?.body_html) || definition.bodyHtml,
        isCustom: row?.is_custom === true,
        updatedAt: row?.updated_at || null,
        updatedBy: text(row?.updated_by),
        variables: getAvailableVariables(templateKey || row?.template_key)
    };
}

function normalizeBrand(row = null, tenantId = '') {
    const source = row && typeof row === 'object' ? row : {};
    const companyName = text(source.company_name || source.companyName) || 'Panel WhatsApp SaaS';
    const websiteUrl = text(source.website_url || source.websiteUrl);
    return {
        tenantId: text(source.tenant_id || source.tenantId || tenantId),
        logoUrl: text(source.logo_url || source.logoUrl),
        brandColor: normalizeColor(source.brand_color || source.brandColor),
        companyName,
        footerText: text(source.footer_text || source.footerText) || `© ${currentYear()} ${companyName}. Todos los derechos reservados.`,
        websiteUrl,
        socialLinks: source.social_links && typeof source.social_links === 'object'
            ? source.social_links
            : {},
        updatedAt: source.updated_at || source.updatedAt || null
    };
}

async function getBrand(tenantId = '') {
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId || !isPostgresAvailable()) return normalizeBrand(null, cleanTenantId);
    const { rows } = await queryPostgres(
        `SELECT tenant_id, logo_url, brand_color, company_name,
                footer_text, website_url, social_links, updated_at
           FROM tenant_email_brand
          WHERE tenant_id = $1
          LIMIT 1`,
        [cleanTenantId]
    );
    return normalizeBrand(rows?.[0] || null, cleanTenantId);
}

async function upsertBrand(tenantId = '', payload = {}) {
    const cleanTenantId = text(tenantId);
    if (!cleanTenantId) throw new Error('tenantId requerido.');
    if (!isPostgresAvailable()) throw new Error('Base de datos no disponible.');
    const clean = normalizeBrand({
        tenant_id: cleanTenantId,
        logo_url: payload.logoUrl,
        brand_color: payload.brandColor,
        company_name: payload.companyName,
        footer_text: payload.footerText,
        website_url: payload.websiteUrl,
        social_links: payload.socialLinks && typeof payload.socialLinks === 'object' ? payload.socialLinks : {}
    }, cleanTenantId);
    const { rows } = await queryPostgres(
        `INSERT INTO tenant_email_brand (
            tenant_id, logo_url, brand_color, company_name,
            footer_text, website_url, social_links, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, NOW()
        )
        ON CONFLICT (tenant_id)
        DO UPDATE SET
            logo_url = EXCLUDED.logo_url,
            brand_color = EXCLUDED.brand_color,
            company_name = EXCLUDED.company_name,
            footer_text = EXCLUDED.footer_text,
            website_url = EXCLUDED.website_url,
            social_links = EXCLUDED.social_links,
            updated_at = NOW()
        RETURNING tenant_id, logo_url, brand_color, company_name,
                  footer_text, website_url, social_links, updated_at`,
        [
            cleanTenantId,
            clean.logoUrl,
            clean.brandColor,
            clean.companyName,
            clean.footerText,
            clean.websiteUrl,
            JSON.stringify(clean.socialLinks || {})
        ]
    );
    return normalizeBrand(rows?.[0] || null, cleanTenantId);
}

async function getTemplate(tenantId = '', templateKey = '') {
    const cleanTenantId = text(tenantId);
    const cleanKey = text(templateKey);
    const definition = getTemplateDefinition(cleanKey);
    if (!definition) throw new Error('Plantilla no soportada.');

    if (!cleanTenantId || !isPostgresAvailable()) {
        return normalizeTemplateRow({ template_key: cleanKey, is_custom: false }, cleanKey);
    }

    const { rows } = await queryPostgres(
        `SELECT template_key, subject, body_html, is_custom, updated_at, updated_by
           FROM tenant_email_templates
          WHERE tenant_id = $1
            AND template_key = $2
            AND is_custom = TRUE
          LIMIT 1`,
        [cleanTenantId, cleanKey]
    );
    return normalizeTemplateRow(rows?.[0] || { template_key: cleanKey, is_custom: false }, cleanKey);
}

async function listTemplates(tenantId = '') {
    const cleanTenantId = text(tenantId);
    const customByKey = new Map();
    if (cleanTenantId && isPostgresAvailable()) {
        const { rows } = await queryPostgres(
            `SELECT template_key, subject, body_html, is_custom, updated_at, updated_by
               FROM tenant_email_templates
              WHERE tenant_id = $1
                AND template_key = ANY($2::text[])`,
            [cleanTenantId, TEMPLATE_KEYS]
        );
        (rows || []).forEach((row) => customByKey.set(text(row.template_key), row));
    }
    return TEMPLATE_KEYS.map((key) => normalizeTemplateRow(customByKey.get(key) || { template_key: key, is_custom: false }, key));
}

async function saveTemplate(tenantId = '', templateKey = '', payload = {}, userId = '') {
    const cleanTenantId = text(tenantId);
    const cleanKey = text(templateKey);
    const definition = getTemplateDefinition(cleanKey);
    if (!cleanTenantId) throw new Error('tenantId requerido.');
    if (!definition) throw new Error('Plantilla no soportada.');
    if (!isPostgresAvailable()) throw new Error('Base de datos no disponible.');
    const subject = text(payload.subject) || definition.subject;
    const bodyHtml = text(payload.bodyHtml || payload.body_html) || definition.bodyHtml;
    const { rows } = await queryPostgres(
        `INSERT INTO tenant_email_templates (
            tenant_id, template_key, subject, body_html,
            is_custom, updated_at, updated_by
        ) VALUES (
            $1, $2, $3, $4, TRUE, NOW(), $5
        )
        ON CONFLICT (tenant_id, template_key)
        DO UPDATE SET
            subject = EXCLUDED.subject,
            body_html = EXCLUDED.body_html,
            is_custom = TRUE,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by
        RETURNING template_key, subject, body_html, is_custom, updated_at, updated_by`,
        [cleanTenantId, cleanKey, subject, bodyHtml, text(userId)]
    );
    return normalizeTemplateRow(rows?.[0] || null, cleanKey);
}

async function resetTemplate(tenantId = '', templateKey = '') {
    const cleanTenantId = text(tenantId);
    const cleanKey = text(templateKey);
    if (!cleanTenantId) throw new Error('tenantId requerido.');
    if (!getTemplateDefinition(cleanKey)) throw new Error('Plantilla no soportada.');
    if (!isPostgresAvailable()) throw new Error('Base de datos no disponible.');
    await queryPostgres(
        `DELETE FROM tenant_email_templates
          WHERE tenant_id = $1
            AND template_key = $2`,
        [cleanTenantId, cleanKey]
    );
    return getTemplate(cleanTenantId, cleanKey);
}

function mergeVariables(variables = {}, brand = {}) {
    return {
        ...SAMPLE_VALUES,
        ...variables,
        empresa: text(variables.empresa) || brand.companyName || SAMPLE_VALUES.empresa,
        plataforma: text(variables.plataforma) || 'Panel WhatsApp SaaS',
        'año': text(variables['año']) || currentYear(),
        color_marca: text(variables.color_marca) || brand.brandColor || '#1D9E75',
        website: text(variables.website) || brand.websiteUrl || ''
    };
}

function replaceVariables(source = '', variables = {}) {
    return String(source || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
        const cleanKey = String(key || '').trim();
        return escapeHtml(variables[cleanKey] ?? '');
    });
}

function stripHtml(html = '') {
    return String(html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function renderTemplate(template = {}, variables = {}, brandInput = {}) {
    const brand = normalizeBrand(brandInput);
    const merged = mergeVariables(variables, brand);
    const subject = replaceVariables(template.subject || '', merged);
    const body = replaceVariables(template.bodyHtml || '', merged);
    const color = normalizeColor(merged.color_marca || brand.brandColor);
    const logo = text(brand.logoUrl)
        ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.companyName)}" width="148" style="display:block;width:148px;max-width:148px;height:auto;max-height:64px;border:0;outline:none;text-decoration:none;object-fit:contain;" />`
        : `<div style="width:54px;height:54px;border-radius:16px;background:${color};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">WA</div>`;
    const website = text(brand.websiteUrl || merged.website);
    const websiteHtml = website
        ? `<a href="${escapeHtml(website)}" style="color:${color};text-decoration:none;">${escapeHtml(website)}</a>`
        : '';

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      .otp-code {
        display: inline-block;
        margin: 14px 0;
        padding: 12px 18px;
        border-radius: 14px;
        background: #eefaf5;
        color: ${color};
        font-size: 28px;
        font-weight: 800;
        letter-spacing: 4px;
      }
      @media (max-width: 640px) {
        .email-card { padding: 22px !important; border-radius: 18px !important; }
      }
    </style>
  </head>
  <body style="margin:0;background:#f4f6f8;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;">
            <tr>
              <td align="center" style="padding:0 0 18px;">${logo}</td>
            </tr>
            <tr>
              <td class="email-card" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;padding:34px;box-shadow:0 20px 50px rgba(15,23,42,.08);">
                <div style="height:4px;width:64px;border-radius:999px;background:${color};margin:0 0 22px;"></div>
                <div style="font-size:16px;line-height:1.65;">${body}</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 10px 0;color:#6b7280;font-size:12px;line-height:1.5;">
                <div>${escapeHtml(brand.footerText || `© ${currentYear()} ${brand.companyName}.`)}</div>
                ${websiteHtml ? `<div style="margin-top:6px;">${websiteHtml}</div>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return {
        subject,
        html,
        text: stripHtml(body)
    };
}

function getSampleVariables(templateKey = '') {
    const out = {};
    getAvailableVariables(templateKey).forEach((entry) => {
        out[entry.key] = SAMPLE_VALUES[entry.key] || `{{${entry.key}}}`;
    });
    return out;
}

module.exports = {
    TEMPLATE_KEYS,
    TEMPLATE_DEFINITIONS,
    getAvailableVariables,
    getSampleVariables,
    listTemplates,
    getTemplate,
    saveTemplate,
    resetTemplate,
    getBrand,
    upsertBrand,
    renderTemplate
};
