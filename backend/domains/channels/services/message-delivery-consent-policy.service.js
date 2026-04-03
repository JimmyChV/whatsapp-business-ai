function normalizePhone(value = '') {
    const digits = String(value || '').replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return '+' + digits;
}

function normalizeMode(value = '') {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'strict' || mode === 'warn-only' || mode === 'disabled') return mode;
    return 'disabled';
}

function resolveTargetPhone(value = '') {
    const direct = normalizePhone(value);
    if (direct) return direct;
    const text = String(value || '').trim();
    if (!text) return null;
    const chatBase = text.split('@')[0] || '';
    return normalizePhone(chatBase);
}

async function resolveCustomerIdByPhone(customerService, tenantId, phone = '') {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !customerService || typeof customerService.listCustomers !== 'function') return null;

    try {
        const result = await customerService.listCustomers(tenantId, {
            query: normalizedPhone,
            limit: 30,
            offset: 0,
            includeInactive: true
        });
        const items = Array.isArray(result?.items) ? result.items : [];
        const match = items.find((item) => String(item?.phoneE164 || '').trim() === normalizedPhone);
        return String(match?.customerId || '').trim() || null;
    } catch (_) {
        return null;
    }
}

function createMessageDeliveryConsentPolicyService({
    customerService,
    customerConsentService,
    policyMode = null
} = {}) {
    const configuredMode = normalizeMode(policyMode || process.env.CONSENT_POLICY_MODE || 'disabled');

    async function checkOutboundConsent(tenantId, { phone, customerId, messageType } = {}) {
        const mode = configuredMode;
        if (mode === 'disabled') {
            return { allowed: true, reason: 'policy_disabled', status: 'disabled' };
        }

        const resolvedCustomerId = String(customerId || '').trim()
            || await resolveCustomerIdByPhone(customerService, tenantId, resolveTargetPhone(phone));

        if (!resolvedCustomerId) {
            if (mode === 'warn-only') {
                console.warn('[ConsentPolicy] warn-only bypass (customer_not_found) tenant=' + String(tenantId || 'default') + ' type=' + String(messageType || 'unknown'));
                return { allowed: true, reason: 'warn_only_bypass', status: 'unknown' };
            }
            return { allowed: false, reason: 'marketing_consent_required', status: 'unknown' };
        }

        let latest = null;
        if (customerConsentService && typeof customerConsentService.getLatestConsent === 'function') {
            latest = await customerConsentService.getLatestConsent(tenantId, {
                customerId: resolvedCustomerId,
                consentType: 'marketing'
            });
        }
        const consentStatus = String(latest?.status || '').trim().toLowerCase() || 'unknown';
        const optedIn = consentStatus === 'granted' || consentStatus === 'opted_in';

        if (optedIn) {
            return { allowed: true, reason: 'opted_in', status: 'opted_in' };
        }

        if (mode === 'warn-only') {
            console.warn('[ConsentPolicy] warn-only bypass tenant=' + String(tenantId || 'default') + ' customerId=' + String(resolvedCustomerId) + ' status=' + String(consentStatus || 'unknown') + ' type=' + String(messageType || 'unknown'));
            return {
                allowed: true,
                reason: 'warn_only_bypass',
                status: consentStatus === 'revoked' || consentStatus === 'opted_out' ? 'opted_out' : 'unknown'
            };
        }

        return {
            allowed: false,
            reason: 'marketing_consent_required',
            status: consentStatus === 'revoked' || consentStatus === 'opted_out' ? 'opted_out' : 'unknown'
        };
    }

    return {
        checkOutboundConsent
    };
}

module.exports = {
    createMessageDeliveryConsentPolicyService
};

