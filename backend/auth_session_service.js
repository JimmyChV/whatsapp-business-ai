const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    getTenantDataDir,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');

const AUTH_SESSIONS_FILE = 'auth_sessions.json';

function parseBooleanEnv(value, defaultValue = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function toBase64Url(input) {
    return Buffer.from(String(input || ''), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(input = '') {
    const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    return Buffer.from(normalized + '='.repeat(padding), 'base64').toString('utf8');
}

function nowEpochSeconds() {
    return Math.floor(Date.now() / 1000);
}

function randomId(prefix = 'id') {
    return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function sha256Hex(value = '') {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function resolveTenantId(tenantId = '') {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function getRefreshTokenTtlSec() {
    const raw = Number(process.env.SAAS_REFRESH_TOKEN_TTL_SEC || 30 * 24 * 60 * 60);
    if (!Number.isFinite(raw) || raw < 60) return 30 * 24 * 60 * 60;
    return Math.floor(raw);
}

function getMaxActiveSessionsPerUser() {
    const raw = Number(process.env.SAAS_MAX_REFRESH_SESSIONS_PER_USER || 8);
    if (!Number.isFinite(raw) || raw < 1) return 8;
    return Math.floor(raw);
}

function getRevocationStoreLimit() {
    const raw = Number(process.env.SAAS_REVOKED_TOKEN_STORE_LIMIT || 5000);
    if (!Number.isFinite(raw) || raw < 100) return 5000;
    return Math.floor(raw);
}

function isSessionPersistenceEnabled() {
    return parseBooleanEnv(process.env.SAAS_AUTH_ENABLED, false);
}

function buildRefreshToken(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenant = resolveTenantId(tenantId);
    const tenantPart = toBase64Url(cleanTenant);
    const randomPart = crypto.randomBytes(32).toString('hex');
    return `rt.${tenantPart}.${randomPart}`;
}

function parseRefreshTokenTenant(refreshToken = '') {
    const raw = String(refreshToken || '').trim();
    const parts = raw.split('.');
    if (parts.length !== 3 || parts[0] !== 'rt') return null;
    try {
        const decoded = String(fromBase64Url(parts[1]) || '').trim();
        return resolveTenantId(decoded);
    } catch (error) {
        return null;
    }
}

function buildAccessTokenHash(accessToken = '') {
    return sha256Hex(accessToken || '');
}

function normalizeStoreShape(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    return {
        sessions: source.sessions && typeof source.sessions === 'object' ? source.sessions : {},
        revokedAccessTokens: source.revokedAccessTokens && typeof source.revokedAccessTokens === 'object'
            ? source.revokedAccessTokens
            : {}
    };
}

async function loadTenantStore(tenantId) {
    const parsed = await readTenantJsonFile(AUTH_SESSIONS_FILE, {
        tenantId,
        defaultValue: {
            sessions: {},
            revokedAccessTokens: {}
        }
    });
    return normalizeStoreShape(parsed);
}

async function saveTenantStore(tenantId, store = {}) {
    await writeTenantJsonFile(AUTH_SESSIONS_FILE, normalizeStoreShape(store), { tenantId });
}

function cleanupStoreInMemory(store, nowSec) {
    const next = normalizeStoreShape(store);
    const safeNow = Number.isFinite(nowSec) ? nowSec : nowEpochSeconds();

    for (const [sessionId, session] of Object.entries(next.sessions)) {
        const expiresAt = Number(session?.expiresAtUnix || 0);
        const revokedAt = Number(session?.revokedAtUnix || 0);
        if ((expiresAt && expiresAt <= safeNow) || (revokedAt && revokedAt <= safeNow)) {
            delete next.sessions[sessionId];
        }
    }

    for (const [tokenHash, entry] of Object.entries(next.revokedAccessTokens)) {
        const expiresAt = Number(entry?.expiresAtUnix || 0);
        if (expiresAt && expiresAt <= safeNow) {
            delete next.revokedAccessTokens[tokenHash];
        }
    }

    const limit = getRevocationStoreLimit();
    const revocations = Object.entries(next.revokedAccessTokens)
        .sort((a, b) => Number(b?.[1]?.createdAtUnix || 0) - Number(a?.[1]?.createdAtUnix || 0));
    if (revocations.length > limit) {
        const toRemove = revocations.slice(limit);
        toRemove.forEach(([key]) => {
            delete next.revokedAccessTokens[key];
        });
    }

    return next;
}

function findActiveSessionByRefreshHash(store, refreshTokenHash, nowSec) {
    const safeNow = Number.isFinite(nowSec) ? nowSec : nowEpochSeconds();
    return Object.values(store?.sessions || {}).find((session) => {
        if (!session || typeof session !== 'object') return false;
        if (String(session.refreshTokenHash || '') !== refreshTokenHash) return false;
        if (session.revokedAtUnix) return false;
        const expiresAt = Number(session.expiresAtUnix || 0);
        return expiresAt > safeNow;
    }) || null;
}

function normalizeRole(value = '') {
    const role = String(value || '').trim().toLowerCase();
    if (['owner', 'admin', 'seller'].includes(role)) return role;
    return 'seller';
}

function missingRelation(error) {
    const code = String(error?.code || '').trim();
    return code === '42P01' || code === '23503';
}

async function issueSessionFile(tenantId, user) {
    const cleanTenant = resolveTenantId(tenantId);
    const refreshToken = buildRefreshToken(cleanTenant);
    const refreshTokenHash = sha256Hex(refreshToken);
    const sessionId = randomId('sess');
    const ttl = getRefreshTokenTtlSec();
    const nowSec = nowEpochSeconds();
    const expiresAtUnix = nowSec + ttl;

    const store = cleanupStoreInMemory(await loadTenantStore(cleanTenant), nowSec);

    const maxActive = getMaxActiveSessionsPerUser();
    const activeByUser = Object.values(store.sessions)
        .filter((session) => {
            if (!session || typeof session !== 'object') return false;
            if (String(session.userId || '') !== String(user.userId || '')) return false;
            if (session.revokedAtUnix) return false;
            return Number(session.expiresAtUnix || 0) > nowSec;
        })
        .sort((a, b) => Number(a.createdAtUnix || 0) - Number(b.createdAtUnix || 0));

    if (activeByUser.length >= maxActive) {
        const toRevoke = activeByUser.slice(0, activeByUser.length - maxActive + 1);
        toRevoke.forEach((session) => {
            if (session?.sessionId && store.sessions[session.sessionId]) {
                store.sessions[session.sessionId] = {
                    ...store.sessions[session.sessionId],
                    revokedAtUnix: nowSec,
                    updatedAtUnix: nowSec
                };
            }
        });
    }

    store.sessions[sessionId] = {
        sessionId,
        tenantId: cleanTenant,
        userId: String(user.userId || '').trim(),
        userEmail: String(user.email || '').trim().toLowerCase(),
        userName: String(user.name || '').trim() || null,
        role: normalizeRole(user.role),
        refreshTokenHash,
        createdAtUnix: nowSec,
        updatedAtUnix: nowSec,
        lastUsedAtUnix: nowSec,
        expiresAtUnix,
        revokedAtUnix: null,
        replacedBySessionId: null
    };

    await saveTenantStore(cleanTenant, store);
    return {
        sessionId,
        refreshToken,
        expiresInSec: ttl,
        expiresAtUnix
    };
}

async function issueSessionPostgres(tenantId, user) {
    const cleanTenant = resolveTenantId(tenantId);
    const refreshToken = buildRefreshToken(cleanTenant);
    const refreshTokenHash = sha256Hex(refreshToken);
    const sessionId = randomId('sess');
    const ttl = getRefreshTokenTtlSec();

    try {
        await queryPostgres(
            `INSERT INTO auth_sessions (
                session_id, tenant_id, user_id, user_email, role, refresh_token_hash,
                expires_at, revoked_at, replaced_by_session_id, created_at, updated_at, last_used_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                NOW() + ($7 * INTERVAL '1 second'), NULL, NULL, NOW(), NOW(), NOW()
            )`,
            [
                sessionId,
                cleanTenant,
                String(user.userId || '').trim(),
                String(user.email || '').trim().toLowerCase(),
                normalizeRole(user.role),
                refreshTokenHash,
                ttl
            ]
        );

        const maxActive = getMaxActiveSessionsPerUser();
        const { rows } = await queryPostgres(
            `SELECT session_id
               FROM auth_sessions
              WHERE tenant_id = $1
                AND user_id = $2
                AND revoked_at IS NULL
                AND expires_at > NOW()
              ORDER BY created_at DESC`,
            [cleanTenant, String(user.userId || '').trim()]
        );

        if (Array.isArray(rows) && rows.length > maxActive) {
            const overflow = rows.slice(maxActive).map((row) => String(row.session_id || '').trim()).filter(Boolean);
            if (overflow.length > 0) {
                await queryPostgres(
                    `UPDATE auth_sessions
                        SET revoked_at = NOW(), updated_at = NOW()
                      WHERE tenant_id = $1
                        AND session_id = ANY($2::text[])`,
                    [cleanTenant, overflow]
                );
            }
        }
    } catch (error) {
        if (missingRelation(error)) {
            return issueSessionFile(cleanTenant, user);
        }
        throw error;
    }

    return {
        sessionId,
        refreshToken,
        expiresInSec: ttl,
        expiresAtUnix: nowEpochSeconds() + ttl
    };
}

async function issueRefreshSession({ tenantId = DEFAULT_TENANT_ID, user = {} } = {}) {
    if (!isSessionPersistenceEnabled()) {
        return { sessionId: null, refreshToken: null, expiresInSec: 0, expiresAtUnix: 0 };
    }
    const cleanTenant = resolveTenantId(tenantId);
    const payload = {
        userId: String(user.userId || user.id || '').trim(),
        email: String(user.email || '').trim().toLowerCase(),
        name: String(user.name || '').trim() || null,
        role: normalizeRole(user.role)
    };

    if (!payload.userId || !payload.email) {
        throw new Error('Usuario invalido para crear sesion de refresh token.');
    }

    if (getStorageDriver() === 'postgres') {
        return issueSessionPostgres(cleanTenant, payload);
    }

    return issueSessionFile(cleanTenant, payload);
}

async function findSessionByRefreshToken(refreshToken = '') {
    const cleanToken = String(refreshToken || '').trim();
    if (!cleanToken) return null;

    const tenantId = parseRefreshTokenTenant(cleanToken);
    if (!tenantId) return null;

    const refreshTokenHash = sha256Hex(cleanToken);
    const nowSec = nowEpochSeconds();

    if (getStorageDriver() === 'postgres') {
        try {
            const { rows } = await queryPostgres(
                `SELECT session_id, tenant_id, user_id, user_email, role, expires_at, revoked_at
                   FROM auth_sessions
                  WHERE tenant_id = $1
                    AND refresh_token_hash = $2
                  LIMIT 1`,
                [tenantId, refreshTokenHash]
            );

            const row = rows?.[0] || null;
            if (!row) return null;
            if (row.revoked_at) return null;
            const expiresAt = Math.floor(new Date(row.expires_at).getTime() / 1000);
            if (!Number.isFinite(expiresAt) || expiresAt <= nowSec) return null;
            return {
                sessionId: String(row.session_id || '').trim(),
                tenantId: String(row.tenant_id || tenantId).trim(),
                userId: String(row.user_id || '').trim(),
                email: String(row.user_email || '').trim().toLowerCase(),
                role: normalizeRole(row.role),
                expiresAtUnix: expiresAt,
                refreshTokenHash
            };
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const store = cleanupStoreInMemory(await loadTenantStore(tenantId), nowSec);
    const session = findActiveSessionByRefreshHash(store, refreshTokenHash, nowSec);
    if (!session) {
        await saveTenantStore(tenantId, store);
        return null;
    }

    return {
        sessionId: String(session.sessionId || '').trim(),
        tenantId,
        userId: String(session.userId || '').trim(),
        email: String(session.userEmail || '').trim().toLowerCase(),
        role: normalizeRole(session.role),
        expiresAtUnix: Number(session.expiresAtUnix || 0),
        refreshTokenHash
    };
}

async function revokeRefreshToken(refreshToken = '', { reason = 'logout' } = {}) {
    const cleanToken = String(refreshToken || '').trim();
    if (!cleanToken) return { ok: false, skipped: 'missing_refresh_token' };

    const tenantId = parseRefreshTokenTenant(cleanToken);
    if (!tenantId) return { ok: false, skipped: 'invalid_refresh_token' };
    const refreshTokenHash = sha256Hex(cleanToken);
    const nowSec = nowEpochSeconds();

    if (getStorageDriver() === 'postgres') {
        try {
            const result = await queryPostgres(
                `UPDATE auth_sessions
                    SET revoked_at = NOW(), updated_at = NOW()
                  WHERE tenant_id = $1
                    AND refresh_token_hash = $2
                    AND revoked_at IS NULL`,
                [tenantId, refreshTokenHash]
            );
            return { ok: true, driver: 'postgres', updated: Number(result?.rowCount || 0), reason };
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const store = cleanupStoreInMemory(await loadTenantStore(tenantId), nowSec);
    let updated = 0;
    for (const [sessionId, session] of Object.entries(store.sessions)) {
        if (String(session?.refreshTokenHash || '') !== refreshTokenHash) continue;
        if (session?.revokedAtUnix) continue;
        store.sessions[sessionId] = {
            ...session,
            revokedAtUnix: nowSec,
            updatedAtUnix: nowSec
        };
        updated += 1;
    }
    await saveTenantStore(tenantId, store);
    return { ok: true, driver: 'file', updated, reason };
}

async function rotateRefreshSession(refreshToken = '') {
    const existing = await findSessionByRefreshToken(refreshToken);
    if (!existing) return null;

    const replacement = await issueRefreshSession({
        tenantId: existing.tenantId,
        user: {
            userId: existing.userId,
            email: existing.email,
            role: existing.role
        }
    });

    const nowSec = nowEpochSeconds();
    if (getStorageDriver() === 'postgres') {
        try {
            await queryPostgres(
                `UPDATE auth_sessions
                    SET revoked_at = NOW(),
                        replaced_by_session_id = $3,
                        updated_at = NOW(),
                        last_used_at = NOW()
                  WHERE tenant_id = $1
                    AND session_id = $2`,
                [existing.tenantId, existing.sessionId, replacement.sessionId]
            );
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    } else {
        const store = cleanupStoreInMemory(await loadTenantStore(existing.tenantId), nowSec);
        const current = store.sessions[existing.sessionId];
        if (current) {
            store.sessions[existing.sessionId] = {
                ...current,
                revokedAtUnix: nowSec,
                replacedBySessionId: replacement.sessionId,
                updatedAtUnix: nowSec,
                lastUsedAtUnix: nowSec
            };
            await saveTenantStore(existing.tenantId, store);
        }
    }

    return {
        tenantId: existing.tenantId,
        userId: existing.userId,
        email: existing.email,
        role: existing.role,
        refreshToken: replacement.refreshToken,
        refreshExpiresInSec: replacement.expiresInSec,
        refreshExpiresAtUnix: replacement.expiresAtUnix
    };
}

async function revokeAccessToken({
    tenantId = DEFAULT_TENANT_ID,
    accessToken = '',
    jti = '',
    userId = '',
    expiresAtUnix = null,
    reason = 'logout'
} = {}) {
    const cleanToken = String(accessToken || '').trim();
    const tokenHash = buildAccessTokenHash(cleanToken);
    if (!tokenHash) return { ok: false, skipped: 'invalid_access_token' };

    const cleanTenant = resolveTenantId(tenantId);
    const cleanJti = String(jti || '').trim() || null;
    const safeUserId = String(userId || '').trim() || null;
    const safeExpiresAt = Number.isFinite(Number(expiresAtUnix)) ? Number(expiresAtUnix) : (nowEpochSeconds() + 8 * 60 * 60);

    if (getStorageDriver() === 'postgres') {
        try {
            await queryPostgres(
                `INSERT INTO auth_token_revocations (
                    tenant_id, token_hash, token_jti, user_id, reason, expires_at, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, TO_TIMESTAMP($6), NOW()
                )
                ON CONFLICT (token_hash)
                DO UPDATE SET
                    token_jti = COALESCE(EXCLUDED.token_jti, auth_token_revocations.token_jti),
                    user_id = COALESCE(EXCLUDED.user_id, auth_token_revocations.user_id),
                    reason = COALESCE(EXCLUDED.reason, auth_token_revocations.reason),
                    expires_at = GREATEST(auth_token_revocations.expires_at, EXCLUDED.expires_at)`,
                [cleanTenant, tokenHash, cleanJti, safeUserId, String(reason || 'logout'), safeExpiresAt]
            );
            return { ok: true, driver: 'postgres', tokenHash };
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const nowSec = nowEpochSeconds();
    const store = cleanupStoreInMemory(await loadTenantStore(cleanTenant), nowSec);
    store.revokedAccessTokens[tokenHash] = {
        tenantId: cleanTenant,
        tokenHash,
        jti: cleanJti,
        userId: safeUserId,
        reason: String(reason || 'logout'),
        expiresAtUnix: safeExpiresAt,
        createdAtUnix: nowSec
    };
    await saveTenantStore(cleanTenant, store);
    return { ok: true, driver: 'file', tokenHash };
}

async function isAccessTokenRevoked({
    tenantId = DEFAULT_TENANT_ID,
    accessToken = '',
    tokenHash = '',
    jti = ''
} = {}) {
    const cleanTenant = resolveTenantId(tenantId);
    const safeTokenHash = String(tokenHash || '').trim() || buildAccessTokenHash(accessToken);
    const cleanJti = String(jti || '').trim();
    if (!safeTokenHash) return false;

    if (getStorageDriver() === 'postgres') {
        try {
            const { rows } = await queryPostgres(
                `SELECT 1
                   FROM auth_token_revocations
                  WHERE tenant_id = $1
                    AND (
                        token_hash = $2
                        OR ($3 <> '' AND token_jti = $3)
                    )
                    AND (expires_at IS NULL OR expires_at > NOW())
                  LIMIT 1`,
                [cleanTenant, safeTokenHash, cleanJti]
            );
            return Boolean(rows?.length);
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const nowSec = nowEpochSeconds();
    const store = cleanupStoreInMemory(await loadTenantStore(cleanTenant), nowSec);
    await saveTenantStore(cleanTenant, store);
    const matchByHash = store.revokedAccessTokens[safeTokenHash];
    if (matchByHash) return true;

    if (!cleanJti) return false;
    return Object.values(store.revokedAccessTokens).some((entry) => String(entry?.jti || '') === cleanJti);
}

async function revokeUserRefreshSessionsGlobally({
    userId = '',
    email = '',
    reason = 'password_reset'
} = {}) {
    const cleanUserId = String(userId || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanUserId && !cleanEmail) {
        return { ok: false, updated: 0, tenants: 0, reason: 'missing_user' };
    }

    let updated = 0;
    let touchedTenants = 0;
    const nowSec = nowEpochSeconds();

    if (getStorageDriver() === 'postgres') {
        try {
            const { rowCount } = await queryPostgres(
                `UPDATE auth_sessions
                    SET revoked_at = NOW(),
                        updated_at = NOW(),
                        last_used_at = NOW()
                  WHERE revoked_at IS NULL
                    AND (
                        ($1 <> '' AND user_id = $1)
                        OR ($2 <> '' AND lower(user_email) = lower($2))
                    )`,
                [cleanUserId, cleanEmail]
            );
            updated += Number(rowCount || 0);
        } catch (error) {
            if (!missingRelation(error)) throw error;
        }
    }

    const defaultTenantDir = getTenantDataDir(DEFAULT_TENANT_ID);
    const tenantsRoot = path.dirname(defaultTenantDir);
    let tenantIds = [];
    try {
        tenantIds = fs.readdirSync(tenantsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => String(entry.name || '').trim())
            .filter(Boolean);
    } catch (_) {
        tenantIds = [];
    }

    for (const tenantId of tenantIds) {
        const store = cleanupStoreInMemory(await loadTenantStore(tenantId), nowSec);
        let changed = false;

        for (const [sessionId, session] of Object.entries(store.sessions || {})) {
            if (!session || typeof session !== 'object') continue;
            if (session.revokedAtUnix) continue;
            const expiresAt = Number(session.expiresAtUnix || 0);
            if (expiresAt && expiresAt <= nowSec) continue;

            const sameUser = cleanUserId && String(session.userId || '').trim() === cleanUserId;
            const sameEmail = cleanEmail && String(session.userEmail || '').trim().toLowerCase() === cleanEmail;
            if (!sameUser && !sameEmail) continue;

            store.sessions[sessionId] = {
                ...session,
                revokedAtUnix: nowSec,
                updatedAtUnix: nowSec,
                revokeReason: String(reason || 'password_reset')
            };
            changed = true;
            updated += 1;
        }

        if (changed) {
            await saveTenantStore(tenantId, store);
            touchedTenants += 1;
        }
    }

    return {
        ok: true,
        updated,
        tenants: touchedTenants
    };
}
module.exports = {
    getRefreshTokenTtlSec,
    parseRefreshTokenTenant,
    buildAccessTokenHash,
    issueRefreshSession,
    rotateRefreshSession,
    revokeRefreshToken,
    revokeUserRefreshSessionsGlobally,
    revokeAccessToken,
    isAccessTokenRevoked
};
