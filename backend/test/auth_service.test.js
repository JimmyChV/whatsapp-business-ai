const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

function loadAuthServiceFresh() {
    const modulePath = require.resolve('../auth_service');
    delete require.cache[modulePath];
    return require('../auth_service');
}

test('auth_service login + token verification works when SaaS auth is enabled', () => {
    const prev = {
        SAAS_AUTH_ENABLED: process.env.SAAS_AUTH_ENABLED,
        SAAS_AUTH_SECRET: process.env.SAAS_AUTH_SECRET,
        SAAS_TOKEN_TTL_SEC: process.env.SAAS_TOKEN_TTL_SEC,
        SAAS_USERS_JSON: process.env.SAAS_USERS_JSON
    };

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_TOKEN_TTL_SEC = '3600';
        process.env.SAAS_USERS_JSON = JSON.stringify([
            {
                id: 'u_owner',
                email: 'owner@acme.com',
                tenantId: 'tenant_acme',
                role: 'owner',
                passwordHash
            }
        ]);

        const authService = loadAuthServiceFresh();
        const session = authService.login({ email: 'owner@acme.com', password: '123456', tenantId: 'tenant_acme' });

        assert.equal(session.user.email, 'owner@acme.com');
        assert.equal(session.user.tenantId, 'tenant_acme');
        assert.ok(session.accessToken);

        const verified = authService.verifyAccessToken(session.accessToken);
        assert.equal(verified.email, 'owner@acme.com');
        assert.equal(verified.tenantId, 'tenant_acme');
    } finally {
        process.env.SAAS_AUTH_ENABLED = prev.SAAS_AUTH_ENABLED;
        process.env.SAAS_AUTH_SECRET = prev.SAAS_AUTH_SECRET;
        process.env.SAAS_TOKEN_TTL_SEC = prev.SAAS_TOKEN_TTL_SEC;
        process.env.SAAS_USERS_JSON = prev.SAAS_USERS_JSON;
    }
});

test('auth_service rejects invalid password', () => {
    const prev = {
        SAAS_AUTH_ENABLED: process.env.SAAS_AUTH_ENABLED,
        SAAS_AUTH_SECRET: process.env.SAAS_AUTH_SECRET,
        SAAS_USERS_JSON: process.env.SAAS_USERS_JSON
    };

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_USERS_JSON = JSON.stringify([
            { id: 'u_1', email: 'seller@acme.com', tenantId: 'tenant_acme', role: 'seller', passwordHash }
        ]);

        const authService = loadAuthServiceFresh();
        assert.throws(() => {
            authService.login({ email: 'seller@acme.com', password: 'bad-pass', tenantId: 'tenant_acme' });
        }, /invalidas/i);
    } finally {
        process.env.SAAS_AUTH_ENABLED = prev.SAAS_AUTH_ENABLED;
        process.env.SAAS_AUTH_SECRET = prev.SAAS_AUTH_SECRET;
        process.env.SAAS_USERS_JSON = prev.SAAS_USERS_JSON;
    }
});
