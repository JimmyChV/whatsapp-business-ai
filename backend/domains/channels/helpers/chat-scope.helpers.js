const CHAT_SCOPE_SEPARATOR = '::mod::';

function normalizePhoneDigits(raw = '') {
    return String(raw || '').replace(/\D/g, '');
}

function looksLikeSamePhoneDigits(a = '', b = '') {
    const left = normalizePhoneDigits(a);
    const right = normalizePhoneDigits(b);
    if (!left || !right) return false;
    return left === right || left.endsWith(right) || right.endsWith(left);
}

function formatPhoneForDisplay(raw = '') {
    const digits = normalizePhoneDigits(raw);
    if (digits.length < 8 || digits.length > 15) return null;
    return digits;
}

function isLikelyHumanPhoneDigits(raw = '') {
    const digits = normalizePhoneDigits(raw);
    if (digits.length < 8 || digits.length > 12) return false;
    if (/^0+$/.test(digits)) return false;
    return true;
}

function coerceHumanPhone(raw = '') {
    const digits = formatPhoneForDisplay(raw);
    if (!digits) return null;
    return isLikelyHumanPhoneDigits(digits) ? digits : null;
}

function normalizeScopedModuleId(value = '') {
    return String(value || '').trim().toLowerCase();
}

function parseScopedChatId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return { chatId: '', moduleId: '' };

    const idx = raw.lastIndexOf(CHAT_SCOPE_SEPARATOR);
    if (idx < 0) return { chatId: raw, moduleId: '' };

    const chatId = String(raw.slice(0, idx) || '').trim();
    const moduleId = normalizeScopedModuleId(raw.slice(idx + CHAT_SCOPE_SEPARATOR.length));
    if (!chatId || !moduleId) return { chatId: raw, moduleId: '' };
    return { chatId, moduleId };
}

function buildScopedChatId(chatId = '', moduleId = '') {
    const base = String(parseScopedChatId(chatId).chatId || chatId || '').trim();
    const scopedModuleId = normalizeScopedModuleId(moduleId);
    if (!base || !scopedModuleId) return base;
    return base + CHAT_SCOPE_SEPARATOR + scopedModuleId;
}

function getSummaryModuleScopeId(summary = {}) {
    return normalizeScopedModuleId(
        summary?.scopeModuleId
        || summary?.lastMessageModuleId
        || summary?.sentViaModuleId
        || parseScopedChatId(summary?.id || '').moduleId
        || ''
    ) || '';
}

function resolveScopedChatTarget(rawChatId = '', fallbackModuleId = '') {
    const parsed = parseScopedChatId(rawChatId || '');
    const baseChatId = String(parsed.chatId || rawChatId || '').trim();
    const moduleId = normalizeScopedModuleId(parsed.moduleId || fallbackModuleId || '');
    return {
        baseChatId,
        moduleId,
        scopedChatId: buildScopedChatId(baseChatId, moduleId)
    };
}

function resolveAiHistoryScope(payload = {}, fallbackModuleId = '') {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const runtimeContext = safePayload.runtimeContext && typeof safePayload.runtimeContext === 'object'
        ? safePayload.runtimeContext
        : null;
    const runtimeModuleId = normalizeScopedModuleId(
        runtimeContext?.module?.moduleId
        || runtimeContext?.chat?.scopeModuleId
        || ''
    );
    const rawFallbackModuleId = normalizeScopedModuleId(
        safePayload.scopeModuleId
        || safePayload.moduleId
        || fallbackModuleId
        || runtimeModuleId
        || ''
    );
    const rawChatId = String(
        safePayload.chatId
        || safePayload.scopeChatId
        || safePayload.scopedChatId
        || runtimeContext?.chat?.chatId
        || ''
    ).trim();
    const target = resolveScopedChatTarget(rawChatId, rawFallbackModuleId || runtimeModuleId);
    const scopeModuleId = normalizeScopedModuleId(target.moduleId || rawFallbackModuleId || runtimeModuleId || '');
    const baseChatId = String(target.baseChatId || '').trim();
    return {
        scopeChatId: String(target.scopedChatId || baseChatId || '').trim(),
        baseChatId,
        scopeModuleId: scopeModuleId || null
    };
}

function isLidIdentifier(value = '') {
    return String(value || '').trim().endsWith('@lid');
}

function extractPhoneFromText(value = '') {
    const text = String(value || '');
    if (!text) return null;
    const matches = text.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
    for (const token of matches) {
        const phone = formatPhoneForDisplay(token);
        if (phone) return phone;
    }
    return null;
}

function extractPhoneFromContactLike(contact = {}, options = {}) {
    const skipDirectNumber = Boolean(options?.skipDirectNumber);
    const serialized = String(contact?.id?._serialized || '');
    const isLid = isLidIdentifier(serialized);
    const candidates = [
        skipDirectNumber ? null : contact?.number,
        contact?.phoneNumber,
        (!isLid ? contact?.id?.user : null),
        (!isLid ? (serialized.split('@')[0] || '') : null),
        contact?.userid,
        contact?.pn,
        contact?.lid
    ];
    for (const candidate of candidates) {
        const phone = coerceHumanPhone(candidate);
        if (phone) return phone;
    }
    const fromText = extractPhoneFromText(
        `${contact?.name || ''} ${contact?.pushname || ''} ${contact?.shortName || ''}`
    );
    if (fromText && isLikelyHumanPhoneDigits(fromText)) return fromText;
    return null;
}

function extractPhoneFromChat(chat = {}) {
    const chatId = String(chat?.id?._serialized || '');
    const contact = chat?.contact || null;
    const isLid = isLidIdentifier(chatId);
    const fromMetaText = extractPhoneFromText(
        `${chat?.name || ''} ${chat?.formattedTitle || ''} ${contact?.name || ''} ${contact?.pushname || ''} ${contact?.shortName || ''}`
    );
    if (isLid && fromMetaText && isLikelyHumanPhoneDigits(fromMetaText)) return fromMetaText;

    const fromContact = extractPhoneFromContactLike(contact || {}, { skipDirectNumber: isLid });
    if (fromContact) return fromContact;
    if (fromMetaText && isLikelyHumanPhoneDigits(fromMetaText)) return fromMetaText;

    if (!isLid && chatId.endsWith('@c.us')) {
        const fromCUs = coerceHumanPhone(chat?.id?.user || chatId.split('@')[0] || '');
        if (fromCUs) return fromCUs;
    }

    if (!isLid) {
        const fromUser = coerceHumanPhone(chat?.id?.user || '');
        if (fromUser) return fromUser;
    }

    if (isLid) return null;
    return coerceHumanPhone(chatId.split('@')[0] || '');
}

function extractPhoneFromSummary(summary = {}) {
    const id = String(summary?.id || '');
    const isLid = isLidIdentifier(id);

    const fromSubtitle = extractPhoneFromText(summary?.subtitle || '');
    if (fromSubtitle && isLikelyHumanPhoneDigits(fromSubtitle)) return fromSubtitle;

    const fromStatus = extractPhoneFromText(summary?.status || '');
    if (fromStatus && isLikelyHumanPhoneDigits(fromStatus)) return fromStatus;

    const explicitPhone = coerceHumanPhone(summary?.phone || '');
    if (explicitPhone) return explicitPhone;

    if (!isLid && id.endsWith('@c.us')) {
        const fromCUs = coerceHumanPhone(id.split('@')[0] || '');
        if (fromCUs) return fromCUs;
    }

    if (isLid) return null;
    return coerceHumanPhone(id.split('@')[0] || '');
}

function buildChatIdentityKeyFromSummary(summary = {}) {
    const scoped = parseScopedChatId(summary?.id || '');
    const baseId = String(summary?.baseChatId || scoped.chatId || summary?.id || '');
    const phone = extractPhoneFromSummary({ ...summary, id: baseId });
    const moduleScopeId = getSummaryModuleScopeId(summary);

    if (phone) return moduleScopeId ? ('module:' + moduleScopeId + '|phone:' + phone) : ('phone:' + phone);
    return moduleScopeId ? ('module:' + moduleScopeId + '|id:' + baseId) : ('id:' + baseId);
}

function pickPreferredSummary(prevItem = {}, incoming = {}) {
    const prevTs = Number(prevItem?.timestamp || 0);
    const incomingTs = Number(incoming?.timestamp || 0);

    const incomingHasFreshPayload = Boolean(incoming?.lastMessage) && !Boolean(prevItem?.lastMessage);
    const pickIncoming = incomingTs > prevTs || (incomingTs === prevTs && incomingHasFreshPayload);
    const primary = pickIncoming ? incoming : prevItem;
    const secondary = pickIncoming ? prevItem : incoming;

    const primaryScoped = parseScopedChatId(primary?.id || '');
    const secondaryScoped = parseScopedChatId(secondary?.id || '');
    const baseChatId = String(primary?.baseChatId || primaryScoped.chatId || secondary?.baseChatId || secondaryScoped.chatId || '').trim();
    const scopeModuleId = getSummaryModuleScopeId(primary) || getSummaryModuleScopeId(secondary) || '';

    const merged = {
        ...secondary,
        ...primary,
        id: buildScopedChatId(baseChatId || primary?.id || secondary?.id || '', scopeModuleId),
        baseChatId: baseChatId || null,
        scopeModuleId: scopeModuleId || null,
        phone: primary?.phone || secondary?.phone || null,
        subtitle: primary?.subtitle || secondary?.subtitle || null,
        isMyContact: Boolean(primary?.isMyContact || secondary?.isMyContact),
        lastMessage: primary?.lastMessage || secondary?.lastMessage || '',
        timestamp: Math.max(prevTs, incomingTs),
        labels: Array.isArray(primary?.labels) && primary.labels.length > 0
            ? primary.labels
            : (Array.isArray(secondary?.labels) ? secondary.labels : []),
        customerId: String(primary?.customerId || secondary?.customerId || '').trim() || null,
        erpCustomerName: String(primary?.erpCustomerName || secondary?.erpCustomerName || '').trim() || null,
        contactName: String(primary?.contactName || primary?.contact_name || secondary?.contactName || secondary?.contact_name || '').trim() || null,
        firstName: String(primary?.firstName || primary?.first_name || secondary?.firstName || secondary?.first_name || '').trim() || null,
        lastNamePaternal: String(primary?.lastNamePaternal || primary?.last_name_paternal || secondary?.lastNamePaternal || secondary?.last_name_paternal || '').trim() || null,
        lastNameMaternal: String(primary?.lastNameMaternal || primary?.last_name_maternal || secondary?.lastNameMaternal || secondary?.last_name_maternal || '').trim() || null
    };

    const primaryName = String(primary?.name || '').trim();
    const secondaryName = String(secondary?.name || '').trim();
    const primaryLooksInternal = primaryName.includes('@') || /^\d{14,}$/.test(primaryName);
    merged.name = (!primaryLooksInternal && primaryName) ? primaryName : (secondaryName || primaryName || 'Sin nombre');

    if (!merged.lastMessageModuleId && scopeModuleId) {
        merged.lastMessageModuleId = scopeModuleId;
    }

    return merged;
}

function resolveCloudDestinationChatId(chatId = '', explicitPhone = '') {
    const byExplicit = coerceHumanPhone(explicitPhone || '');
    if (byExplicit) return `${byExplicit}@c.us`;

    const scoped = parseScopedChatId(chatId || '');
    const fromChatId = String(scoped.chatId || chatId || '').trim();
    const fromChatDigits = coerceHumanPhone(fromChatId.split('@')[0] || '');
    if (fromChatDigits) return `${fromChatDigits}@c.us`;

    return null;
}

module.exports = {
    CHAT_SCOPE_SEPARATOR,
    normalizePhoneDigits,
    looksLikeSamePhoneDigits,
    formatPhoneForDisplay,
    isLikelyHumanPhoneDigits,
    coerceHumanPhone,
    resolveCloudDestinationChatId,
    normalizeScopedModuleId,
    parseScopedChatId,
    buildScopedChatId,
    getSummaryModuleScopeId,
    resolveScopedChatTarget,
    resolveAiHistoryScope,
    isLidIdentifier,
    extractPhoneFromText,
    extractPhoneFromContactLike,
    extractPhoneFromChat,
    extractPhoneFromSummary,
    buildChatIdentityKeyFromSummary,
    pickPreferredSummary
};
