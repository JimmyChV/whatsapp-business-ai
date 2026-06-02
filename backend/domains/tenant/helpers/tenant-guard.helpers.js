function normalizeTenantGuardId(tenantId = '') {
    return String(tenantId || '').trim();
}

function isValidOperationalTenant(tenantId = '') {
    const cleanTenantId = normalizeTenantGuardId(tenantId);
    return Boolean(cleanTenantId && cleanTenantId !== 'default');
}

function assertValidTenant(tenantId = '', context = '') {
    const cleanTenantId = normalizeTenantGuardId(tenantId);
    if (!isValidOperationalTenant(cleanTenantId)) {
        const suffix = context ? ` en ${context}` : '';
        const message = `[TenantGuard] tenantId invalido '${cleanTenantId || 'null'}'${suffix}`;
        console.error(message);
        throw new Error(message);
    }
    return cleanTenantId;
}

function warnInvalidTenant(tenantId = '', context = '') {
    const cleanTenantId = normalizeTenantGuardId(tenantId);
    const suffix = context ? ` en ${context}` : '';
    console.warn(`[TenantGuard] tenantId invalido '${cleanTenantId || 'null'}'${suffix}; operacion cancelada`);
}

module.exports = {
    assertValidTenant,
    isValidOperationalTenant,
    warnInvalidTenant
};
