function createChatRuntimeHelpers({
    extractLocationInfo,
    extractCoordsFromText,
    normalizePhoneDigits,
    coerceHumanPhone
} = {}) {
    function isStatusOrSystemMessage(msg) {
        const from = String(msg?.from || '');
        const to = String(msg?.to || '');
        const type = String(msg?.type || '').toLowerCase();

        if (from.includes('status@broadcast') || to.includes('status@broadcast')) return true;
        if (from.endsWith('@broadcast') || to.endsWith('@broadcast')) return true;

        const blockedTypes = new Set([
            'e2e_notification',
            'notification',
            'ciphertext',
            'revoked'
        ]);

        return blockedTypes.has(type);
    }

    function isVisibleChatId(chatId) {
        const id = String(chatId || '');
        if (!id) return false;
        if (id.includes('status@broadcast')) return false;
        if (id.endsWith('@broadcast')) return false;
        return true;
    }

    function resolveLastMessagePreview(chat = {}) {
        const last = chat?.lastMessage;
        if (!last) return '';

        const type = String(last?.type || last?._data?.type || '').toLowerCase();
        if (type === 'location') {
            const location = extractLocationInfo(last);
            if (location?.label) return `Ubicacion: ${location.label}`;
            return 'Ubicacion';
        }

        const mediaMap = {
            image: 'Imagen',
            video: 'Video',
            audio: 'Audio',
            ptt: 'Nota de voz',
            document: 'Documento',
            sticker: 'Sticker',
            vcard: 'Contacto',
            order: 'Pedido',
            revoked: 'Mensaje eliminado'
        };

        if (type && type !== 'chat' && mediaMap[type]) {
            return mediaMap[type];
        }

        const body = String(last?.body || '').trim();
        if (body) {
            const possibleCoords = extractCoordsFromText(body);
            const hasMapUrl = /https?:\/\/(?:www\.)?(?:google\.[^\s/]+\/maps|maps\.app\.goo\.gl|maps\.google\.com)/i.test(body);
            if (possibleCoords || hasMapUrl) return 'Ubicacion';
            return body;
        }

        return 'Mensaje';
    }

    function defaultCountryCode() {
        return normalizePhoneDigits(process.env.WA_DEFAULT_COUNTRY_CODE || process.env.DEFAULT_COUNTRY_CODE || '51');
    }

    function buildPhoneCandidates(rawPhone) {
        const clean = normalizePhoneDigits(rawPhone);
        if (!clean) return [];

        const cc = defaultCountryCode();
        const trimmed = clean.replace(/^0+/, '') || clean;
        const candidates = [];

        const push = (v) => {
            const digits = normalizePhoneDigits(v);
            if (!digits) return;
            if (!candidates.includes(digits)) candidates.push(digits);
        };

        const isLikelyLocal = trimmed.length <= 10;
        if (isLikelyLocal && cc && !trimmed.startsWith(cc)) push(`${cc}${trimmed}`);
        push(trimmed);
        if (cc && trimmed.startsWith(cc)) push(trimmed.slice(cc.length));

        return candidates;
    }

    async function resolveRegisteredNumber(client, rawPhone) {
        const candidates = buildPhoneCandidates(rawPhone);
        for (const cand of candidates) {
            try {
                const numberId = await client.getNumberId(cand);
                if (!numberId) continue;

                const candDigits = coerceHumanPhone(cand);
                const byUser = coerceHumanPhone(numberId.user || '');
                const serialized = String(numberId._serialized || '');
                const bySerialized = coerceHumanPhone(serialized.split('@')[0] || '');

                const looksLikeSameNumber = (a, b) => {
                    if (!a || !b) return false;
                    return a === b || a.endsWith(b) || b.endsWith(a);
                };

                if (byUser && candDigits && looksLikeSameNumber(byUser, candDigits)) return byUser;
                if (bySerialized && candDigits && looksLikeSameNumber(bySerialized, candDigits)) return bySerialized;
                if (candDigits) return candDigits;
                if (byUser) return byUser;
                if (bySerialized) return bySerialized;
            } catch (e) { }
        }
        return null;
    }

    function normalizeFilterToken(value = '') {
        return String(value || '').trim().toLowerCase();
    }

    function normalizeFilterTokens(tokens = []) {
        if (!Array.isArray(tokens)) return [];
        const seen = new Set();
        const normalized = [];
        for (const token of tokens) {
            const clean = normalizeFilterToken(token);
            if (!clean) continue;
            if (seen.has(clean)) continue;
            seen.add(clean);
            normalized.push(clean);
        }
        return normalized;
    }

    function toLabelTokenSet(labels = []) {
        const tokens = new Set();
        if (!Array.isArray(labels)) return tokens;
        for (const label of labels) {
            const id = normalizeFilterToken(label?.id);
            if (id) tokens.add(`id:${id}`);
            const name = normalizeFilterToken(label?.name);
            if (name) tokens.add(`name:${name}`);
        }
        return tokens;
    }

    function matchesTokenSet(labelTokenSet, selectedTokens) {
        if (!(labelTokenSet instanceof Set)) return false;
        if (!Array.isArray(selectedTokens) || selectedTokens.length === 0) return true;
        return selectedTokens.some((token) => {
            const clean = normalizeFilterToken(token);
            if (!clean) return false;
            if (labelTokenSet.has(clean)) return true;
            if (clean.startsWith('id:')) {
                const value = clean.slice(3);
                return value ? labelTokenSet.has(value) : false;
            }
            if (clean.startsWith('name:')) {
                const value = clean.slice(5);
                return value ? labelTokenSet.has(value) : false;
            }
            return labelTokenSet.has(`id:${clean}`) || labelTokenSet.has(`name:${clean}`);
        });
    }

    async function runWithConcurrency(items, limit, worker) {
        if (!Array.isArray(items) || items.length === 0) return;
        const max = Math.max(1, Math.floor(Number(limit) || 1));
        let cursor = 0;

        const runners = Array.from({ length: Math.min(max, items.length) }, async () => {
            while (true) {
                const idx = cursor++;
                if (idx >= items.length) return;
                await worker(items[idx], idx);
            }
        });

        await Promise.all(runners);
    }

    return {
        isStatusOrSystemMessage,
        isVisibleChatId,
        resolveLastMessagePreview,
        defaultCountryCode,
        buildPhoneCandidates,
        resolveRegisteredNumber,
        normalizeFilterToken,
        normalizeFilterTokens,
        toLabelTokenSet,
        matchesTokenSet,
        runWithConcurrency
    };
}

module.exports = {
    createChatRuntimeHelpers
};
