/**
 * Normaliza texto a mayúsculas para guardar en BD.
 * Respeta excepciones: email, URLs, passwords, body de mensajes.
 */
function toUpper(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    return trimmed.toUpperCase();
}

// Normaliza un objeto de cliente para guardar en BD
function normalizeCustomerFields(data) {
    const fields = [
        'first_name', 'last_name_paternal', 'last_name_maternal',
        'contact_name', 'document_number', 'notes', 'phone_e164',
        'phone_alt', 'erp_id', 'erp_employee_id', 'referral_customer_id'
    ];
    const result = { ...data };
    for (const f of fields) {
        if (result[f] !== undefined) result[f] = toUpper(result[f]);
    }
    // email: NO normalizar
    return result;
}

// Normaliza un objeto de dirección
function normalizeAddressFields(data) {
    const fields = [
        'street', 'reference', 'district_name', 'province_name',
        'department_name', 'district_id', 'wkt'
    ];
    const result = { ...data };
    for (const f of fields) {
        if (result[f] !== undefined) result[f] = toUpper(result[f]);
    }
    // maps_url: NO normalizar
    return result;
}

module.exports = { toUpper, normalizeCustomerFields, normalizeAddressFields };
