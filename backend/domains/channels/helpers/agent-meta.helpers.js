const { coerceHumanPhone } = require('./chat-scope.helpers');

function getSerializedMessageId(message = null) {
    if (!message) return '';
    if (typeof message === 'string') return String(message).trim();

    const candidates = [
        message?.id?._serialized,
        message?.id?.id,
        message?.id,
        message?._data?.id,
        message?.key?.id,
        message?.messageId,
        message?.message_id,
        message?.messages?.[0]?.id
    ];

    for (const candidate of candidates) {
        const safe = String(candidate || '').trim();
        if (safe) return safe;
    }

    return '';
}

function buildSocketAgentMeta(authContext = null, moduleContext = null) {
    if (!authContext || typeof authContext !== 'object') return null;
    const userId = String(authContext?.userId || authContext?.id || '').trim();
    const email = String(authContext?.email || '').trim() || null;
    const role = String(authContext?.role || '').trim().toLowerCase() || null;
    const name = String(authContext?.name || authContext?.displayName || email || userId || '').trim() || null;
    if (!userId && !email && !name) return null;

    return {
        sentByUserId: userId || null,
        sentByName: name,
        sentByEmail: email,
        sentByRole: role,
        sentViaModuleId: String(moduleContext?.moduleId || '').trim() || null,
        sentViaModuleName: String(moduleContext?.name || '').trim() || null,
        sentViaModuleImageUrl: String(moduleContext?.imageUrl || moduleContext?.logoUrl || '').trim() || null,
        sentViaTransport: String(moduleContext?.transportMode || '').trim().toLowerCase() || null,
        sentViaPhoneNumber: coerceHumanPhone(moduleContext?.phoneNumber || moduleContext?.phone || '') || null,
        sentViaChannelType: String(moduleContext?.channelType || '').trim().toLowerCase() || null
    };
}

function sanitizeAgentMeta(agentMeta = null) {
    if (!agentMeta || typeof agentMeta !== 'object') return null;
    const out = {};
    ['sentByUserId', 'sentByName', 'sentByEmail', 'sentByRole', 'sentViaModuleId', 'sentViaModuleName', 'sentViaModuleImageUrl', 'sentViaTransport', 'sentViaPhoneNumber', 'sentViaChannelType'].forEach((key) => {
        const value = String(agentMeta?.[key] || '').trim();
        if (value) out[key] = value;
    });
    return Object.keys(out).length > 0 ? out : null;
}

function buildModuleAttributionMeta(moduleContext = null) {
    if (!moduleContext || typeof moduleContext !== 'object') return null;
    const sentViaModuleId = String(moduleContext?.moduleId || '').trim().toLowerCase() || null;
    const sentViaModuleName = String(moduleContext?.name || '').trim() || null;
    const sentViaModuleImageUrl = String(moduleContext?.imageUrl || moduleContext?.logoUrl || '').trim() || null;
    const sentViaTransport = String(moduleContext?.transportMode || '').trim().toLowerCase() || null;
    const sentViaPhoneNumber = coerceHumanPhone(
        moduleContext?.phoneNumber
        || moduleContext?.phone
        || ''
    ) || null;
    const sentViaChannelType = String(moduleContext?.channelType || '').trim().toLowerCase() || null;

    if (!sentViaModuleId && !sentViaModuleName && !sentViaModuleImageUrl && !sentViaTransport && !sentViaPhoneNumber && !sentViaChannelType) {
        return null;
    }

    return {
        sentViaModuleId,
        sentViaModuleName,
        sentViaModuleImageUrl,
        sentViaTransport,
        sentViaPhoneNumber,
        sentViaChannelType
    };
}

function buildEffectiveModuleContext(runtimeModuleContext = null, agentMeta = null) {
    const base = runtimeModuleContext && typeof runtimeModuleContext === 'object' ? runtimeModuleContext : {};
    const safeAgentMeta = sanitizeAgentMeta(agentMeta);
    const safeModuleId = String(
        safeAgentMeta?.sentViaModuleId
        || base?.moduleId
        || ''
    ).trim().toLowerCase();
    const safeModuleName = String(
        safeAgentMeta?.sentViaModuleName
        || base?.name
        || ''
    ).trim() || null;
    const safeModuleImageUrl = String(
        safeAgentMeta?.sentViaModuleImageUrl
        || base?.imageUrl
        || base?.logoUrl
        || ''
    ).trim() || null;
    const safeTransport = String(
        safeAgentMeta?.sentViaTransport
        || base?.transportMode
        || ''
    ).trim().toLowerCase() || null;
    const safePhone = coerceHumanPhone(
        safeAgentMeta?.sentViaPhoneNumber
        || base?.phoneNumber
        || base?.phone
        || ''
    ) || null;
    const safeChannelType = String(
        safeAgentMeta?.sentViaChannelType
        || base?.channelType
        || ''
    ).trim().toLowerCase() || null;

    const hasEffectiveData = Boolean(
        safeModuleId
        || safeModuleName
        || safeModuleImageUrl
        || safeTransport
        || safePhone
        || safeChannelType
    );

    if (!hasEffectiveData) return Object.keys(base).length > 0 ? base : null;

    return {
        ...base,
        moduleId: safeModuleId || String(base?.moduleId || '').trim().toLowerCase() || null,
        name: safeModuleName,
        imageUrl: safeModuleImageUrl,
        logoUrl: safeModuleImageUrl,
        transportMode: safeTransport,
        phoneNumber: safePhone,
        channelType: safeChannelType
    };
}

module.exports = {
    getSerializedMessageId,
    buildSocketAgentMeta,
    sanitizeAgentMeta,
    buildModuleAttributionMeta,
    buildEffectiveModuleContext
};
