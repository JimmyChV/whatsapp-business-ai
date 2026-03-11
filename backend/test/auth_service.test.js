const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadAuthServiceFresh() {
    const authPath = require.resolve('../auth_service');
    const sessionPath = require.resolve('../auth_session_service');
    delete require.cache[authPath];
    delete require.cache[sessionPath];
    return require('../auth_service');
}

function snapshotEnv() {
    return {
        SAAS_AUTH_ENABLED: process.env.SAAS_AUTH_ENABLED,
        SAAS_AUTH_SECRET: process.env.SAAS_AUTH_SECRET,
        SAAS_TOKEN_TTL_SEC: process.env.SAAS_TOKEN_TTL_SEC,
        SAAS_REFRESH_TOKEN_TTL_SEC: process.env.SAAS_REFRESH_TOKEN_TTL_SEC,
        SAAS_USERS_JSON: process.env.SAAS_USERS_JSON,
        SAAS_TENANTS_JSON: process.env.SAAS_TENANTS_JSON,
        SAAS_STORAGE_DRIVER: process.env.SAAS_STORAGE_DRIVER,
        SAAS_TENANT_DATA_DIR: process.env.SAAS_TENANT_DATA_DIR,
        SAAS_MAX_REFRESH_SESSIONS_PER_USER: process.env.SAAS_MAX_REFRESH_SESSIONS_PER_USER,
        SAAS_REVOKED_TOKEN_STORE_LIMIT: process.env.SAAS_REVOKED_TOKEN_STORE_LIMIT
    };
}

function restoreEnv(prev = {}) {
    Object.keys(prev).forEach((key) => {
        process.env[key] = prev[key];
    });
}

test('auth_service login + token verification + refresh works when SaaS auth is enabled', async () => {
    const prev = snapshotEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_TOKEN_TTL_SEC = '3600';
        process.env.SAAS_REFRESH_TOKEN_TTL_SEC = '3600';
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_MAX_REFRESH_SESSIONS_PER_USER = '8';
        process.env.SAAS_REVOKED_TOKEN_STORE_LIMIT = '5000';
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
        const session = await authService.login({ email: 'owner@acme.com', password: '123456', tenantId: 'tenant_acme' });

        assert.equal(session.user.email, 'owner@acme.com');
        assert.equal(session.user.tenantId, 'tenant_acme');
        assert.ok(session.accessToken);
        assert.ok(session.refreshToken);

        const verifiedSync = authService.verifyAccessToken(session.accessToken);
        assert.equal(verifiedSync.email, 'owner@acme.com');
        assert.equal(verifiedSync.tenantId, 'tenant_acme');

        const verifiedAsync = await authService.verifyAccessTokenAsync(session.accessToken);
        assert.equal(verifiedAsync.email, 'owner@acme.com');
        assert.equal(verifiedAsync.tenantId, 'tenant_acme');

        const renewed = await authService.refreshSession({ refreshToken: session.refreshToken });
        assert.ok(renewed.accessToken);
        assert.ok(renewed.refreshToken);
        assert.notEqual(renewed.accessToken, session.accessToken);
        assert.notEqual(renewed.refreshToken, session.refreshToken);
        assert.equal(renewed.user.email, 'owner@acme.com');
    } finally {
        restoreEnv(prev);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('auth_service logout revokes access token and refresh token', async () => {
    const prev = snapshotEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_TOKEN_TTL_SEC = '3600';
        process.env.SAAS_REFRESH_TOKEN_TTL_SEC = '3600';
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_USERS_JSON = JSON.stringify([
            { id: 'u_seller', email: 'seller@acme.com', tenantId: 'tenant_acme', role: 'seller', passwordHash }
        ]);

        const authService = loadAuthServiceFresh();
        const session = await authService.login({ email: 'seller@acme.com', password: '123456', tenantId: 'tenant_acme' });
        const beforeLogout = await authService.verifyAccessTokenAsync(session.accessToken);
        assert.ok(beforeLogout);

        const result = await authService.logoutSession({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            reason: 'unit_test'
        });
        assert.equal(result.ok, true);
        assert.equal(result.revokedAccess, true);

        const afterLogout = await authService.verifyAccessTokenAsync(session.accessToken);
        assert.equal(afterLogout, null);

        await assert.rejects(
            () => authService.refreshSession({ refreshToken: session.refreshToken }),
            /invalido|expirado/i
        );
    } finally {
        restoreEnv(prev);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('auth_service rejects invalid password', async () => {
    const prev = snapshotEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_USERS_JSON = JSON.stringify([
            { id: 'u_1', email: 'seller@acme.com', tenantId: 'tenant_acme', role: 'seller', passwordHash }
        ]);

        const authService = loadAuthServiceFresh();
        await assert.rejects(
            () => authService.login({ email: 'seller@acme.com', password: 'bad-pass', tenantId: 'tenant_acme' }),
            /invalidas/i
        );
    } finally {
        restoreEnv(prev);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});



test('auth_service accepts surrounding spaces for hashed passwords created from trimmed input', async () => {
    const prev = snapshotEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_USERS_JSON = JSON.stringify([
            { id: 'u_trim', email: 'trim@acme.com', tenantId: 'tenant_acme', role: 'seller', passwordHash }
        ]);

        const authService = loadAuthServiceFresh();
        const session = await authService.login({ email: 'trim@acme.com', password: ' 123456 ', tenantId: 'tenant_acme' });
        assert.equal(session.user.email, 'trim@acme.com');
    } finally {
        restoreEnv(prev);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('auth_service login accepts user id as identifier', async () => {
    const prev = snapshotEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_USERS_JSON = JSON.stringify([
            { id: 'seller_lavitat', email: 'seller@acme.com', tenantId: 'tenant_acme', role: 'seller', passwordHash }
        ]);

        const authService = loadAuthServiceFresh();
        const session = await authService.login({ email: 'seller_lavitat', password: '123456', tenantId: 'tenant_acme' });
        assert.equal(session.user.id, 'seller_lavitat');
        assert.equal(session.user.email, 'seller@acme.com');
    } finally {
        restoreEnv(prev);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
test('auth_service supports multi-tenant memberships and tenant switching', async () => {
    const prev = snapshotEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_TOKEN_TTL_SEC = '3600';
        process.env.SAAS_REFRESH_TOKEN_TTL_SEC = '3600';
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_USERS_JSON = JSON.stringify([
            {
                id: 'u_multi',
                email: 'owner@acme.com',
                role: 'owner',
                passwordHash,
                memberships: [
                    { tenantId: 'tenant_acme', role: 'owner' },
                    { tenantId: 'tenant_beta', role: 'admin' }
                ]
            }
        ]);
        process.env.SAAS_TENANTS_JSON = JSON.stringify([
            { id: 'tenant_acme', slug: 'acme', name: 'Acme SAC', active: true, plan: 'pro' },
            { id: 'tenant_beta', slug: 'beta', name: 'Beta SAC', active: true, plan: 'pro' },
            { id: 'tenant_other', slug: 'other', name: 'Other SAC', active: true, plan: 'starter' }
        ]);

        const authService = loadAuthServiceFresh();
        const session = await authService.login({ email: 'owner@acme.com', password: '123456', tenantId: 'tenant_acme' });
        assert.equal(session.user.tenantId, 'tenant_acme');
        assert.equal(session.user.canSwitchTenant, true);
        assert.deepEqual(
            session.user.memberships.map((item) => item.tenantId).sort(),
            ['tenant_acme', 'tenant_beta']
        );

        const allowed = authService.getAllowedTenantsForUser(session.user, [
            { id: 'tenant_acme' },
            { id: 'tenant_beta' },
            { id: 'tenant_other' }
        ]);
        assert.deepEqual(allowed.map((tenant) => tenant.id), ['tenant_acme', 'tenant_beta']);

        const switched = await authService.switchTenantSession({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            targetTenantId: 'tenant_beta'
        });
        assert.equal(switched.user.tenantId, 'tenant_beta');
        assert.equal(switched.user.role, 'admin');
        assert.notEqual(switched.accessToken, session.accessToken);
        assert.notEqual(switched.refreshToken, session.refreshToken);

        const oldAccess = await authService.verifyAccessTokenAsync(session.accessToken);
        assert.equal(oldAccess, null);

        const currentAccess = await authService.verifyAccessTokenAsync(switched.accessToken);
        assert.equal(currentAccess.tenantId, 'tenant_beta');

        await assert.rejects(
            () => authService.refreshSession({ refreshToken: session.refreshToken }),
            /invalido|expirado/i
        );
    } finally {
        restoreEnv(prev);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('auth_service rejects tenant switch without membership', async () => {
    const prev = snapshotEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));

    try {
        const passwordHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_USERS_JSON = JSON.stringify([
            { id: 'u_1', email: 'seller@acme.com', tenantId: 'tenant_acme', role: 'seller', passwordHash }
        ]);

        const authService = loadAuthServiceFresh();
        const session = await authService.login({ email: 'seller@acme.com', password: '123456', tenantId: 'tenant_acme' });

        await assert.rejects(
            () => authService.switchTenantSession({
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                targetTenantId: 'tenant_beta'
            }),
            /sin acceso/i
        );
    } finally {
        restoreEnv(prev);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});


test('auth_service login uses snapshot users when control-plane auth list is incomplete', async () => {
    const prev = snapshotEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));

    const saasControl = require('../saas_control_plane_service');
    const originalGetUsersForAuthSync = saasControl.getUsersForAuthSync;
    const originalGetSnapshotSync = saasControl.getSnapshotSync;
    const originalEnsureLoaded = saasControl.ensureLoaded;

    try {
        process.env.SAAS_AUTH_ENABLED = 'true';
        process.env.SAAS_AUTH_SECRET = 'unit-test-secret';
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_USERS_JSON = '[]';

        const ownerHash = crypto.createHash('sha256').update('123456', 'utf8').digest('hex');
        const sellerHash = crypto.createHash('sha256').update('123456789qwerty', 'utf8').digest('hex');

        saasControl.getUsersForAuthSync = () => ([
            {
                id: 'owner_lavitat',
                email: 'owner@lavitat.com',
                tenantId: 'tenant_lavitat',
                role: 'owner',
                name: 'Owner Lavitat',
                passwordHash: ownerHash,
                memberships: [{ tenantId: 'tenant_lavitat', role: 'owner' }]
            }
        ]);

        saasControl.getSnapshotSync = () => ({
            loaded: true,
            tenants: [{ id: 'tenant_lavitat', slug: 'lavitat', name: 'Lavitat', active: true, plan: 'enterprise' }],
            users: [
                {
                    id: 'owner_lavitat',
                    email: 'owner@lavitat.com',
                    active: true,
                    passwordHash: ownerHash,
                    memberships: [{ tenantId: 'tenant_lavitat', role: 'owner', active: true }]
                },
                {
                    id: 'USER0001',
                    email: 'a@b.com',
                    active: true,
                    passwordHash: sellerHash,
                    memberships: [{ tenantId: 'tenant_lavitat', role: 'seller', active: true }]
                }
            ]
        });

        saasControl.ensureLoaded = async () => saasControl.getSnapshotSync();

        const authService = loadAuthServiceFresh();

        const sellerById = await authService.login({
            email: 'USER0001',
            password: '123456789qwerty',
            tenantId: 'tenant_lavitat'
        });
        assert.equal(sellerById.user.id, 'USER0001');
        assert.equal(sellerById.user.email, 'a@b.com');

        const sellerByEmail = await authService.login({
            email: 'a@b.com',
            password: '123456789qwerty',
            tenantId: 'tenant_lavitat'
        });
        assert.equal(sellerByEmail.user.id, 'USER0001');
    } finally {
        saasControl.getUsersForAuthSync = originalGetUsersForAuthSync;
        saasControl.getSnapshotSync = originalGetSnapshotSync;
        saasControl.ensureLoaded = originalEnsureLoaded;
        restoreEnv(prev);
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
