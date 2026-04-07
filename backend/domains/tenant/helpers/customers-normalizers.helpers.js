const crypto = require('crypto');

const CUSTOMER_PREFIX = 'CUS';

function toText(value = '') {
    return String(value ?? '').trim();
}

function toIsoText(value = '') {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : '';
    }
    const text = toText(value);
    if (!text) return '';
    const parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime())) return text;
    return parsed.toISOString();
}

function toLower(value = '') {
    return toText(value).toLowerCase();
}

function toBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    const lower = toLower(value);
    if (!lower) return Boolean(fallback);
    if (['true', 'yes', 'on', 'si', 's'].includes(lower)) return true;
    if (['false', 'no', 'off', 'n'].includes(lower)) return false;
    return Boolean(fallback);
}

function nowIso() {
    return new Date().toISOString();
}

function normalizePhone(value = '') {
    const digits = String(value || '').replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return '+' + digits;
}

function normalizeObject(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function normalizeTags(value = []) {
    if (Array.isArray(value)) {
        const seen = new Set();
        return value.map((entry) => toText(entry)).filter(Boolean).filter((entry) => {
            const key = entry.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    const text = toText(value);
    if (!text) return [];
    return normalizeTags(text.split(/[|,;]/g));
}

function normalizeCustomerIdCandidate(value = '') {
    const clean = String(value || '').trim().toUpperCase();
    if (!/^CUS-[A-Z0-9]{6}$/.test(clean)) return '';
    return clean;
}

function randomCode(size = 6) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(size * 2);
    let out = '';
    for (let i = 0; i < bytes.length && out.length < size; i += 1) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out.slice(0, size);
}

function createCustomerId(existingIds = new Set(), prefix = CUSTOMER_PREFIX) {
    const used = new Set(Array.from(existingIds || []).map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean));
    for (let i = 0; i < 1000; i += 1) {
        const candidate = `${prefix}-${randomCode(6)}`;
        if (!used.has(candidate)) return candidate;
    }
    return `${prefix}-${Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6).padStart(6, '0')}`;
}

function normalizeCustomer(payload = {}, { fallbackId = '', previous = null } = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const prev = previous && typeof previous === 'object' ? previous : null;
    const customerId = normalizeCustomerIdCandidate(source.customerId || source.id || fallbackId || prev?.customerId || '');
    if (!customerId) throw new Error('customerId invalido.');

    const profile = {
        ...(normalizeObject(prev?.profile)),
        ...(normalizeObject(source.profile)),
        treatmentId: toText(source.treatmentId || source.idTratamientoCliente || source.IdTratamientoCliente || prev?.profile?.treatmentId || '') || null,
        lastNamePaternal: toText(source.lastNamePaternal || source.apellidoPaterno || source.ApellidoPaterno || prev?.profile?.lastNamePaternal || '') || null,
        lastNameMaternal: toText(source.lastNameMaternal || source.apellidoMaterno || source.ApellidoMaterno || prev?.profile?.lastNameMaternal || '') || null,
        firstNames: toText(source.firstNames || source.nombres || source.Nombres || prev?.profile?.firstNames || '') || null,
        documentNumber: toText(source.documentNumber || source.numeroDocumentoIdentidad || source.NumeroDocumentoIdentidad || prev?.profile?.documentNumber || '') || null,
        groupName: toText(source.groupName || source.grupo || source.Grupo || prev?.profile?.groupName || '') || null,
        documentTypeId: toText(source.documentTypeId || source.idDocumentoIdentidad || source.IdDocumentoIdentidad || prev?.profile?.documentTypeId || '') || null,
        employeeId: toText(source.employeeId || source.idEmpleado || source.IdEmpleado || prev?.profile?.employeeId || '') || null,
        username: toText(source.username || source.usuario || source.Usuario || prev?.profile?.username || '') || null,
        customerTypeId: toText(source.customerTypeId || source.idTipoCliente || source.IdTipoCliente || prev?.profile?.customerTypeId || '') || null,
        sourceId: toText(source.sourceId || source.idFuenteCliente || source.IdFuenteCliente || prev?.profile?.sourceId || '') || null,
        brandId: toText(source.brandId || source.idMarca || source.IdMarca || prev?.profile?.brandId || '') || null,
        districtId: toText(source.districtId || source.idDistritoFiscal || source.IdDistritoFiscal || prev?.profile?.districtId || '') || null,
        fiscalAddress: toText(source.fiscalAddress || source.direccionFiscal || source.DireccionFiscal || prev?.profile?.fiscalAddress || '') || null,
        referredById: toText(source.referredById || source.idReferido || source.IdReferido || prev?.profile?.referredById || '') || null,
        contactType: toText(source.contactType || source.tipoContacto || source.TipoContacto || prev?.profile?.contactType || '') || null,
        notes: toText(source.notes || source.observacionCliente || source.ObservacionCliente || prev?.profile?.notes || '') || null,
        marketingAuthorization: toBool(source.marketingAuthorization ?? source.autorizacion ?? source.Autorizacion ?? prev?.profile?.marketingAuthorization, prev?.profile?.marketingAuthorization ?? false)
    };

    return {
        customerId,
        moduleId: toText(source.moduleId || source.module_id || prev?.moduleId || '') || null,
        contactName: toText(source.contactName || source.contacto || source.Contacto || source.name || prev?.contactName || '') || null,
        firstName: toText(source.firstName || source.first_name || source.firstNames || source.nombres || prev?.firstName || prev?.profile?.firstNames || '') || null,
        lastNamePaternal: toText(source.lastNamePaternal || source.last_name_paternal || source.apellidoPaterno || prev?.lastNamePaternal || prev?.profile?.lastNamePaternal || '') || null,
        lastNameMaternal: toText(source.lastNameMaternal || source.last_name_maternal || source.apellidoMaterno || prev?.lastNameMaternal || prev?.profile?.lastNameMaternal || '') || null,
        phoneE164: normalizePhone(source.phoneE164 || source.phone || source.telefono || source.Telefono || prev?.phoneE164 || ''),
        phoneAlt: normalizePhone(source.phoneAlt || source.telefono2 || source.Telefono2 || prev?.phoneAlt || ''),
        email: toLower(source.email || source.correoElectronico || source.CorreoElectronico || prev?.email || '') || null,
        treatmentId: toText(source.treatmentId || source.treatment_id || source.idTratamientoCliente || prev?.treatmentId || prev?.profile?.treatmentId || '') || null,
        customerTypeId: toText(source.customerTypeId || source.customer_type_id || source.idTipoCliente || prev?.customerTypeId || prev?.profile?.customerTypeId || '') || null,
        acquisitionSourceId: toText(source.acquisitionSourceId || source.acquisition_source_id || source.sourceId || source.idFuenteCliente || prev?.acquisitionSourceId || prev?.profile?.sourceId || '') || null,
        documentTypeId: toText(source.documentTypeId || source.document_type_id || source.idDocumentoIdentidad || prev?.documentTypeId || prev?.profile?.documentTypeId || '') || null,
        documentNumber: toText(source.documentNumber || source.document_number || source.numeroDocumentoIdentidad || prev?.documentNumber || prev?.profile?.documentNumber || '') || null,
        notes: toText(source.notes || source.observacionCliente || prev?.notes || prev?.profile?.notes || '') || null,
        tags: normalizeTags(source.tags !== undefined ? source.tags : prev?.tags || []),
        profile,
        metadata: { ...(normalizeObject(prev?.metadata)), ...(normalizeObject(source.metadata)) },
        isActive: toBool(source.isActive ?? source.active ?? prev?.isActive, prev?.isActive ?? true),
        lastInteractionAt: toIsoText(source.lastInteractionAt || prev?.lastInteractionAt || '') || null,
        createdAt: toIsoText(prev?.createdAt || nowIso()) || nowIso(),
        updatedAt: nowIso()
    };
}

function sanitizePublic(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const profile = normalizeObject(source.profile);

    const firstName = toText(source.firstName || source.first_name || profile.firstNames || profile.nombres || '') || null;
    const lastNamePaternal = toText(source.lastNamePaternal || source.last_name_paternal || profile.lastNamePaternal || profile.apellidoPaterno || '') || null;
    const lastNameMaternal = toText(source.lastNameMaternal || source.last_name_maternal || profile.lastNameMaternal || profile.apellidoMaterno || '') || null;
    const treatmentId = toText(source.treatmentId || source.treatment_id || profile.treatmentId || profile.idTratamientoCliente || '') || null;
    const customerTypeId = toText(source.customerTypeId || source.customer_type_id || profile.customerTypeId || profile.idTipoCliente || '') || null;
    const acquisitionSourceId = toText(source.acquisitionSourceId || source.acquisition_source_id || source.sourceId || source.source_id || profile.sourceId || profile.idFuenteCliente || '') || null;
    const documentTypeId = toText(source.documentTypeId || source.document_type_id || profile.documentTypeId || profile.idDocumentoIdentidad || '') || null;
    const documentNumber = toText(source.documentNumber || source.document_number || profile.documentNumber || profile.numeroDocumentoIdentidad || '') || null;
    const notes = toText(source.notes || profile.notes || profile.observacionCliente || '') || null;

    return {
        customerId: toText(source.customerId || source.customer_id),
        moduleId: toText(source.moduleId || source.module_id) || null,
        contactName: toText(source.contactName || source.contact_name) || null,
        firstName,
        lastNamePaternal,
        lastNameMaternal,
        phoneE164: toText(source.phoneE164 || source.phone_e164) || null,
        phoneAlt: toText(source.phoneAlt || source.phone_alt) || null,
        email: toLower(source.email || '') || null,
        treatmentId,
        customerTypeId,
        acquisitionSourceId,
        sourceId: acquisitionSourceId,
        documentTypeId,
        documentNumber,
        notes,
        tags: normalizeTags(source.tags || []),
        profile,
        metadata: normalizeObject(source.metadata),
        isActive: toBool(source.isActive ?? source.is_active, true),
        lastInteractionAt: toIsoText(source.lastInteractionAt || source.last_interaction_at || '') || null,
        createdAt: toIsoText(source.createdAt || source.created_at || '') || null,
        updatedAt: toIsoText(source.updatedAt || source.updated_at || '') || null
    };
}

function sanitizeIdentityPublic(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        tenantId: toText(source.tenantId || source.tenant_id) || null,
        customerId: toText(source.customerId || source.customer_id) || null,
        channelType: toText(source.channelType || source.channel_type) || null,
        channelIdentity: toText(source.channelIdentity || source.channel_identity) || null,
        normalizedPhone: toText(source.normalizedPhone || source.normalized_phone) || null,
        moduleId: toText(source.moduleId || source.module_id) || null,
        metadata: normalizeObject(source.metadata),
        createdAt: toText(source.createdAt || source.created_at) || null,
        updatedAt: toText(source.updatedAt || source.updated_at) || null
    };
}

function sanitizeChannelEventPublic(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    return {
        tenantId: toText(source.tenantId || source.tenant_id) || null,
        eventId: toText(source.eventId || source.event_id) || null,
        channelType: toText(source.channelType || source.channel_type) || null,
        moduleId: toText(source.moduleId || source.module_id) || null,
        customerId: toText(source.customerId || source.customer_id) || null,
        chatId: toText(source.chatId || source.chat_id) || null,
        messageId: toText(source.messageId || source.message_id) || null,
        direction: toText(source.direction || 'inbound') || 'inbound',
        status: toText(source.status || '') || null,
        payload: normalizeObject(source.payload),
        createdAt: toText(source.createdAt || source.created_at) || null
    };
}

function normalizeHeader(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function parseCsvRows(raw = '', delimiterHint = '') {
    const text = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!text.trim()) return [];

    const firstLine = text.split('\n')[0] || '';
    const delimiter = delimiterHint || (firstLine.includes(';') ? ';' : ',');
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === delimiter && !inQuotes) {
            row.push(cell);
            cell = '';
            continue;
        }
        if (ch === '\n' && !inQuotes) {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }
        cell += ch;
    }
    row.push(cell);
    rows.push(row);

    return rows.map((entries) => entries.map((entry) => String(entry || '').trim())).filter((entries) => entries.some((entry) => entry !== ''));
}

function mapCsvRow(headers = [], row = [], moduleId = '') {
    const map = {
        idcliente: 'customerId',
        contacto: 'contactName',
        telefono: 'phoneE164',
        telefono2: 'phoneAlt',
        correoelectronico: 'email',
        tags: 'tags',
        nombres: 'firstNames',
        apellidopaterno: 'lastNamePaternal',
        apellidomaterno: 'lastNameMaternal',
        numerodocumentoidentidad: 'documentNumber',
        idtipocliente: 'customerTypeId',
        observacioncliente: 'notes',
        autorizacion: 'marketingAuthorization'
    };

    const payload = {};
    headers.forEach((header, index) => {
        const key = map[normalizeHeader(header)];
        if (!key) return;
        payload[key] = row[index];
    });

    if (!payload.moduleId && moduleId) payload.moduleId = moduleId;
    return payload;
}

function createChannelEventId() {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
    toText,
    toIsoText,
    toLower,
    toBool,
    nowIso,
    normalizePhone,
    normalizeObject,
    normalizeTags,
    normalizeCustomerIdCandidate,
    createCustomerId,
    normalizeCustomer,
    sanitizePublic,
    sanitizeIdentityPublic,
    sanitizeChannelEventPublic,
    parseCsvRows,
    mapCsvRow,
    createChannelEventId
};
