function createRequestOpsHelpers({
    crypto,
    opsApiToken = ''
} = {}) {
    if (!crypto) {
        throw new Error('createRequestOpsHelpers requires crypto');
    }

    function resolveRequestId(req = {}) {
        const fromHeader = String(req.headers?.['x-request-id'] || req.headers?.['x-correlation-id'] || '').trim();
        if (fromHeader) return fromHeader;
        try {
            return crypto.randomUUID();
        } catch (_) {
            return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        }
    }

    function getOpsTokenFromRequest(req = {}) {
        const fromHeader = String(req.headers?.['x-ops-token'] || '').trim();
        if (fromHeader) return fromHeader;
        const authHeader = String(req.headers?.authorization || '').trim();
        if (/^bearer\s+/i.test(authHeader)) return authHeader.replace(/^bearer\s+/i, '').trim();
        return '';
    }

    function hasOpsAccess(req = {}) {
        if (!opsApiToken) return true;
        const incoming = getOpsTokenFromRequest(req);
        if (!incoming) return false;
        const left = Buffer.from(opsApiToken, 'utf8');
        const right = Buffer.from(incoming, 'utf8');
        if (left.length !== right.length) return false;
        try {
            return crypto.timingSafeEqual(left, right);
        } catch (_) {
            return false;
        }
    }

    return {
        resolveRequestId,
        getOpsTokenFromRequest,
        hasOpsAccess
    };
}

module.exports = {
    createRequestOpsHelpers
};
