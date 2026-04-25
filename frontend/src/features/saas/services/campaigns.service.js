function assertRequestJson(requestJson) {
    if (typeof requestJson !== 'function') {
        throw new Error('requestJson es obligatorio.');
    }
}

function toCleanText(value = '') {
    return String(value || '').trim();
}

function toPositiveInt(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const integer = Math.floor(parsed);
    if (integer < 0) return fallback;
    return integer;
}

function toQueryString(params = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        const text = String(value).trim();
        if (!text) return;
        searchParams.set(key, text);
    });
    const encoded = searchParams.toString();
    return encoded ? `?${encoded}` : '';
}

function requestWithTenant(requestJson, path, tenantId = '', options = {}) {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) return requestJson(path, options);
    return requestJson(path, {
        ...options,
        tenantIdOverride: cleanTenantId
    });
}

export async function createCampaign(requestJson, payload = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('payload de campaña requerido.');
    }
    return requestWithTenant(requestJson, '/api/tenant/campaigns', tenantId, {
        method: 'POST',
        body: payload
    });
}

export async function estimateCampaign(requestJson, payload = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('payload de estimacion requerido.');
    }
    return requestWithTenant(requestJson, '/api/tenant/campaigns/estimate', tenantId, {
        method: 'POST',
        body: payload
    });
}

export async function fetchCampaignFilterOptions(requestJson, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    return requestWithTenant(requestJson, '/api/tenant/campaigns/filter-options', tenantId);
}

export async function fetchCampaignGeographyOptions(requestJson, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    return requestWithTenant(requestJson, '/api/tenant/campaigns/geography-options', tenantId);
}

export async function listCampaigns(
    requestJson,
    {
        scopeModuleId = '',
        moduleId = '',
        status = '',
        query = '',
        limit = 50,
        offset = 0
    } = {},
    { tenantId = '' } = {}
) {
    assertRequestJson(requestJson);
    const suffix = toQueryString({
        scopeModuleId: toCleanText(scopeModuleId).toLowerCase(),
        moduleId: toCleanText(moduleId),
        status: toCleanText(status).toLowerCase(),
        query: toCleanText(query),
        limit: String(toPositiveInt(limit, 50)),
        offset: String(toPositiveInt(offset, 0))
    });
    return requestWithTenant(requestJson, `/api/tenant/campaigns${suffix}`, tenantId);
}

export async function getCampaignDetail(requestJson, { campaignId } = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}`, tenantId);
}

export async function updateCampaign(requestJson, { campaignId, patch = {} } = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new Error('patch de campaña requerido.');
    }
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}`, tenantId, {
        method: 'PATCH',
        body: patch
    });
}

export async function startCampaign(requestJson, { campaignId } = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/start`, tenantId, {
        method: 'POST',
        body: {}
    });
}

export async function sendCampaignBlock(requestJson, { campaignId, blockIndex } = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    const cleanBlockIndex = Math.max(0, Math.floor(Number(blockIndex)));
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    if (!Number.isFinite(cleanBlockIndex)) throw new Error('blockIndex requerido.');
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/blocks/${encodeURIComponent(String(cleanBlockIndex))}/send`, tenantId, {
        method: 'POST',
        body: {}
    });
}

export async function pauseCampaign(requestJson, { campaignId } = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/pause`, tenantId, {
        method: 'POST',
        body: {}
    });
}

export async function resumeCampaign(requestJson, { campaignId } = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/resume`, tenantId, {
        method: 'POST',
        body: {}
    });
}

export async function cancelCampaign(requestJson, { campaignId, reason = '' } = {}, { tenantId = '' } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    const cleanReason = toCleanText(reason);
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/cancel`, tenantId, {
        method: 'POST',
        body: cleanReason ? { reason: cleanReason } : {}
    });
}

export async function listCampaignRecipients(
    requestJson,
    {
        campaignId,
        status = '',
        moduleId = '',
        search = '',
        limit = 50,
        offset = 0
    } = {},
    { tenantId = '' } = {}
) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    const suffix = toQueryString({
        status: toCleanText(status).toLowerCase(),
        moduleId: toCleanText(moduleId),
        search: toCleanText(search),
        limit: String(toPositiveInt(limit, 50)),
        offset: String(toPositiveInt(offset, 0))
    });
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/recipients${suffix}`, tenantId);
}

export async function listCampaignEvents(
    requestJson,
    {
        campaignId,
        eventType = '',
        severity = '',
        limit = 50,
        offset = 0
    } = {},
    { tenantId = '' } = {}
) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    const suffix = toQueryString({
        eventType: toCleanText(eventType).toLowerCase(),
        severity: toCleanText(severity).toLowerCase(),
        limit: String(toPositiveInt(limit, 50)),
        offset: String(toPositiveInt(offset, 0))
    });
    return requestWithTenant(requestJson, `/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/events${suffix}`, tenantId);
}
