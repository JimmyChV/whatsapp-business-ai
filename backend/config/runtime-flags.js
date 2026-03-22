function parseBooleanEnv(value, defaultValue = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function resolveRuntimeFlags({ env = process.env, parseCsvEnv } = {}) {
    if (typeof parseCsvEnv !== 'function') {
        throw new Error('resolveRuntimeFlags requires parseCsvEnv function');
    }

    const isProduction = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const allowedOrigins = parseCsvEnv(env.ALLOWED_ORIGINS);
    const allowEmptyOriginsInProd = parseBooleanEnv(env.CORS_ALLOW_EMPTY_IN_PROD, false);
    const securityHeadersEnabled = parseBooleanEnv(env.SECURITY_HEADERS_ENABLED, true);
    const socketAuthRequired = parseBooleanEnv(env.SOCKET_AUTH_REQUIRED, isProduction);
    const httpRateLimitEnabled = parseBooleanEnv(env.HTTP_RATE_LIMIT_ENABLED, true);
    const trustProxyEnabled = parseBooleanEnv(env.TRUST_PROXY, false);
    const saasSocketAuthRequired = parseBooleanEnv(env.SAAS_SOCKET_AUTH_REQUIRED, parseBooleanEnv(env.SAAS_AUTH_ENABLED, false));
    const opsApiToken = String(env.OPS_API_TOKEN || '').trim();
    const opsReadyRequireWa = parseBooleanEnv(env.OPS_READY_REQUIRE_WA, false);

    return {
        isProduction,
        allowedOrigins,
        allowEmptyOriginsInProd,
        securityHeadersEnabled,
        socketAuthRequired,
        httpRateLimitEnabled,
        trustProxyEnabled,
        saasSocketAuthRequired,
        opsApiToken,
        opsReadyRequireWa
    };
}

function createCorsOriginChecker({
    allowedOrigins = [],
    isProduction = false,
    allowEmptyOriginsInProd = false
} = {}) {
    return function isCorsOriginAllowed(origin) {
        if (!origin) return true;
        if (allowedOrigins.includes(origin)) return true;
        if (allowedOrigins.length === 0) {
            if (isProduction && !allowEmptyOriginsInProd) return false;
            return true;
        }
        return false;
    };
}

module.exports = {
    parseBooleanEnv,
    resolveRuntimeFlags,
    createCorsOriginChecker
};
