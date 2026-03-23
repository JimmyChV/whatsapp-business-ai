function createOutgoingAgentMetaCache({
    sanitizeAgentMeta,
    ttlMs = 10 * 60 * 1000
} = {}) {
    const outgoingMessageAgentMeta = new Map();
    const safeTtlMs = Math.max(60 * 1000, Number(ttlMs || (10 * 60 * 1000)));

    function cleanupOutgoingAgentMeta() {
        const now = Date.now();
        for (const [messageId, entry] of outgoingMessageAgentMeta.entries()) {
            if (!entry || Number(entry.expiresAt || 0) <= now) {
                outgoingMessageAgentMeta.delete(messageId);
            }
        }
    }

    function rememberOutgoingAgentMeta(messageId = '', meta = null) {
        const safeId = String(messageId || '').trim();
        if (!safeId || !meta || typeof meta !== 'object') return;
        cleanupOutgoingAgentMeta();
        outgoingMessageAgentMeta.set(safeId, {
            meta,
            expiresAt: Date.now() + safeTtlMs
        });
    }

    function getOutgoingAgentMeta(messageId = '') {
        const safeId = String(messageId || '').trim();
        if (!safeId) return null;
        const entry = outgoingMessageAgentMeta.get(safeId);
        if (!entry) return null;
        if (Number(entry.expiresAt || 0) <= Date.now()) {
            outgoingMessageAgentMeta.delete(safeId);
            return null;
        }
        return entry.meta && typeof entry.meta === 'object' ? entry.meta : null;
    }

    function mergeAgentMeta(...candidates) {
        const merged = {};
        for (const candidate of candidates) {
            if (!candidate || typeof candidate !== 'object') continue;
            const normalized = typeof sanitizeAgentMeta === 'function'
                ? sanitizeAgentMeta(candidate)
                : candidate;
            if (!normalized || typeof normalized !== 'object') continue;
            Object.assign(merged, normalized);
        }
        return Object.keys(merged).length > 0 ? merged : null;
    }

    return {
        cleanupOutgoingAgentMeta,
        rememberOutgoingAgentMeta,
        getOutgoingAgentMeta,
        mergeAgentMeta
    };
}

module.exports = {
    createOutgoingAgentMetaCache
};

