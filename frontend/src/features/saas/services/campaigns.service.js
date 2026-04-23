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

export async function createCampaign(requestJson, payload = {}) {
    assertRequestJson(requestJson);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('payload de campaña requerido.');
    }
    return requestJson('/api/tenant/campaigns', {
        method: 'POST',
        body: payload
    });
}

export async function estimateCampaign(requestJson, payload = {}) {
    assertRequestJson(requestJson);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('payload de estimacion requerido.');
    }
    return requestJson('/api/tenant/campaigns/estimate', {
        method: 'POST',
        body: payload
    });
}

export async function fetchCampaignFilterOptions(requestJson) {
    assertRequestJson(requestJson);
    return requestJson('/api/tenant/campaigns/filter-options');
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
    } = {}
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
    return requestJson(`/api/tenant/campaigns${suffix}`);
}

export async function getCampaignDetail(requestJson, { campaignId } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    return requestJson(`/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}`);
}

export async function updateCampaign(requestJson, { campaignId, patch = {} } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new Error('patch de campaña requerido.');
    }
    return requestJson(`/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}`, {
        method: 'PATCH',
        body: patch
    });
}

export async function startCampaign(requestJson, { campaignId } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    return requestJson(`/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/start`, {
        method: 'POST',
        body: {}
    });
}

export async function pauseCampaign(requestJson, { campaignId } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    return requestJson(`/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/pause`, {
        method: 'POST',
        body: {}
    });
}

export async function resumeCampaign(requestJson, { campaignId } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    return requestJson(`/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/resume`, {
        method: 'POST',
        body: {}
    });
}

export async function cancelCampaign(requestJson, { campaignId, reason = '' } = {}) {
    assertRequestJson(requestJson);
    const cleanCampaignId = toCleanText(campaignId);
    if (!cleanCampaignId) throw new Error('campaignId requerido.');
    const cleanReason = toCleanText(reason);
    return requestJson(`/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/cancel`, {
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
    } = {}
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
    return requestJson(`/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/recipients${suffix}`);
}

export async function listCampaignEvents(
    requestJson,
    {
        campaignId,
        eventType = '',
        severity = '',
        limit = 50,
        offset = 0
    } = {}
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
    return requestJson(`/api/tenant/campaigns/${encodeURIComponent(cleanCampaignId)}/events${suffix}`);
}
