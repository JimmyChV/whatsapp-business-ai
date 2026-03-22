const crypto = require('crypto');
const authSessionService = require('./auth-session.service');
const tenantService = require('../../tenant/services/tenant-core.service');
const saasControlService = require('../../tenant/services/tenant-control.service');
const accessPolicyService = require('./access-policy.service');
const passwordHashService = require('./password-hash.service');

function parseBooleanEnv(value, defaultValue = false) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return Boolean(defaultValue);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}
function isEnvAuthFallbackEnabled() {
    return parseBooleanEnv(process.env.SAAS_AUTH_ALLOW_ENV_FALLBACK, false);
}


function toBase64Url(input) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input || ''), 'utf8');
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(input = '') {
    const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const padSize = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padSize);
    return Buffer.from(padded, 'base64').toString('utf8');
}

function safeEqual(left = '', right = '') {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(a, b);
    } catch (error) {
        return false;
    }
}

function nowEpochSeconds() {
    return Math.floor(Date.now() / 1000);
}

function normalizePasswordInput(value = '') {
    return String(value || '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .trim();
}

function randomTokenId(prefix = 'tok') {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function normalizeRole(value = '') {
    return accessPolicyService.normalizeRole(value);
}

function roleWeight(role = '') {
    const normalized = normalizeRole(role);
    if (normalized === 'owner') return 3;
    if (normalized === 'admin') return 2;
    return 1;
}

function normalizeTenantId(value = '') {
    return String(value || '').trim();
}

function normalizeMembership(entry, fallbackRole = 'seller') {
    if (typeof entry === 'string') {
        const tenantId = normalizeTenantId(entry);
        if (!tenantId) return null;
        return { tenantId, role: normalizeRole(fallbackRole) };
    }

    if (!entry || typeof entry !== 'object') return null;
    const tenantId = normalizeTenantId(entry.tenantId || entry.tenant || entry.id || entry.slug || '');
    if (!tenantId) return null;
    return {
        tenantId,
        role: normalizeRole(entry.role || fallbackRole)
    };
}

function sanitizeMemberships(memberships = []) {
    return (Array.isArray(memberships) ? memberships : [])
        .map((item) => ({
            tenantId: normalizeTenantId(item?.tenantId),
            role: normalizeRole(item?.role)
        }))
        .filter((item) => item.tenantId);
}

function buildMemberships(entry = {}) {
    const fallbackRole = normalizeRole(entry.role || 'seller');
    const map = new Map();

    const pushMembership = (membership) => {
        const normalized = normalizeMembership(membership, fallbackRole);
        if (!normalized) return;
        const current = map.get(normalized.tenantId);
        if (!current || roleWeight(normalized.role) > roleWeight(current.role)) {
            map.set(normalized.tenantId, normalized);
        }
    };

    pushMembership({ tenantId: entry.tenantId || entry.tenant, role: entry.role });
    if (Array.isArray(entry.tenantIds)) entry.tenantIds.forEach((item) => pushMembership(item));
    if (Array.isArray(entry.tenants)) entry.tenants.forEach((item) => pushMembership(item));
    if (Array.isArray(entry.memberships)) entry.memberships.forEach((item) => pushMembership(item));

    if (map.size === 0) {
        pushMembership({ tenantId: 'default', role: fallbackRole });
    }

    return sanitizeMemberships(Array.from(map.values()));
}

function parseUsersFromEnv() {
    const raw = String(process.env.SAAS_USERS_JSON || '').trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((entry, idx) => {
                if (!entry || typeof entry !== 'object') return null;
                const id = String(entry.id || `user_${idx + 1}`).trim();
                const email = String(entry.email || '').trim().toLowerCase();
                const memberships = buildMemberships(entry);
                const tenantId = normalizeTenantId(entry.tenantId || entry.tenant || memberships?.[0]?.tenantId || 'default');
                const role = normalizeRole(entry.role || memberships?.[0]?.role || 'seller');
                const name = String(entry.name || entry.displayName || email || id).trim();
                const password = String(entry.password || '');
                const passwordHash = passwordHashService.normalizeStoredHash(entry.passwordHash || entry.sha256 || '');
                if (!id || !email || !tenantId) return null;
                if (!password && !passwordHash) return null;
                return { id, email, tenantId, role, memberships, name, password, passwordHash };
            })
            .filter(Boolean);
    } catch (error) {
        return [];
    }
}

function normalizeAuthUserRecord(entry = {}) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.active === false) return null;

    const id = String(entry.id || entry.userId || entry.user_id || '').trim();
    const email = String(entry.email || entry.mail || '').trim().toLowerCase();
    const password = String(entry.password || '').trim();
    const passwordHash = passwordHashService.normalizeStoredHash(entry.passwordHash || entry.password_hash || '');

    const rawMemberships = Array.isArray(entry.memberships)
        ? entry.memberships.filter((membership) => {
            if (!membership || typeof membership !== 'object') return true;
            return membership.active !== false;
        })
        : [];

    const memberships = sanitizeMemberships(rawMemberships);
    const tenantId = normalizeTenantId(entry.tenantId || entry.tenant || memberships?.[0]?.tenantId || 'default');
    const role = normalizeRole(entry.role || memberships?.[0]?.role || 'seller');
    const resolvedMemberships = memberships.length > 0 ? memberships : [{ tenantId, role }];

    if (!id || !email || !tenantId) return null;
    if (!password && !passwordHash) return null;

    return {
        id,
        email,
        tenantId,
        role,
        memberships: resolvedMemberships,
        name: String(entry.name || entry.displayName || email || id).trim(),
        password,
        passwordHash
    };
}

function getAuthUsersFromControlSnapshot() {
    try {
        const snapshot = saasControlService.getSnapshotSync();
        const users = Array.isArray(snapshot?.users) ? snapshot.users : [];
        return users;
    } catch (_) {
        return [];
    }
}

function dedupeAuthUsers(records = []) {
    const byId = new Map();
    const idByEmail = new Map();

    (Array.isArray(records) ? records : []).forEach((record) => {
        const safe = normalizeAuthUserRecord(record);
        if (!safe) return;

        const idKey = String(safe.id || '').trim().toLowerCase();
        const emailKey = String(safe.email || '').trim().toLowerCase();
        if (!idKey || !emailKey) return;

        const existingIdForEmail = idByEmail.get(emailKey);
        if (existingIdForEmail && existingIdForEmail !== idKey) {
            byId.delete(existingIdForEmail);
        }

        const previous = byId.get(idKey);
        if (previous) {
            const previousEmail = String(previous.email || '').trim().toLowerCase();
            if (previousEmail && previousEmail !== emailKey) {
                idByEmail.delete(previousEmail);
            }
        }

        byId.set(idKey, safe);
        idByEmail.set(emailKey, idKey);
    });

    return Array.from(byId.values());
}

function getAuthUsersRecords() {
    const fromControl = Array.isArray(saasControlService.getUsersForAuthSync())
        ? saasControlService.getUsersForAuthSync()
        : [];

    const fromSnapshot = getAuthUsersFromControlSnapshot();
    const fromEnv = isEnvAuthFallbackEnabled() ? parseUsersFromEnv() : [];

    return dedupeAuthUsers([
        ...fromSnapshot,
        ...fromControl,
        ...(fromControl.length || fromSnapshot.length ? [] : fromEnv)
    ]);
}
function findUserRecord({ userId = '', email = '' } = {}) {
    const cleanUserId = String(userId || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const users = getAuthUsersRecords();

    if (cleanUserId) {
        const byId = users.find((item) => String(item?.id || '').trim() === cleanUserId);
        if (byId) return byId;
    }

    if (cleanEmail) {
        const byEmail = users.find((item) => String(item?.email || '').trim().toLowerCase() === cleanEmail);
        if (byEmail) return byEmail;
    }

    return null;
}

function getAuthSecret() {
    return String(process.env.SAAS_AUTH_SECRET || '').trim();
}

function isAuthEnabled() {
    return parseBooleanEnv(process.env.SAAS_AUTH_ENABLED, false);
}

function getTokenTtlSec() {
    const parsed = Number(process.env.SAAS_TOKEN_TTL_SEC || 8 * 60 * 60);
    if (!Number.isFinite(parsed) || parsed <= 60) return 8 * 60 * 60;
    return Math.floor(parsed);
}

function buildAccessToken(payload = {}) {
    const headerPart = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadPart = toBase64Url(JSON.stringify(payload));
    const secret = getAuthSecret();
    const signature = crypto.createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    return `${headerPart}.${payloadPart}.${signature}`;
}

function parseAccessToken(token = '') {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const [headerPart, payloadPart, signaturePart] = raw.split('.');
    if (!headerPart || !payloadPart || !signaturePart) return null;

    const secret = getAuthSecret();
    if (!secret) return null;

    const expectedSignature = crypto.createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    if (!safeEqual(expectedSignature, signaturePart)) return null;

    try {
        const payload = JSON.parse(fromBase64Url(payloadPart));
        if (!payload || typeof payload !== 'object') return null;
        const now = nowEpochSeconds();
        const exp = Number(payload.exp || 0);
        if (!Number.isFinite(exp) || exp <= now) return null;
        return payload;
    } catch (error) {
        return null;
    }
}

function verifyUserPassword(user = {}, password = '') {
    const plain = String(password || '');
    if (!plain) return false;

    const normalized = normalizePasswordInput(plain);
    const candidates = Array.from(new Set([
        plain,
        plain.trim(),
        normalized
    ].filter((entry) => String(entry || '').length > 0)));

    const storedPassword = String(user?.password || '').trim();
    if (storedPassword) {
        return candidates.some((candidate) => safeEqual(storedPassword, candidate));
    }

    const storedPasswordHash = passwordHashService.normalizeStoredHash(user?.passwordHash || user?.password_hash || '');
    if (storedPasswordHash) {
        return candidates.some((candidate) => passwordHashService.verifyPassword(candidate, storedPasswordHash));
    }

    return false;
}

function resolveUserMatchesLoginIdentifier(user = {}, identifier = '') {
    const cleanIdentifier = String(identifier || '').trim().toLowerCase();
    if (!cleanIdentifier) return false;
    const email = String(user?.email || user?.mail || '').trim().toLowerCase();
    const userId = String(user?.id || user?.userId || user?.user_id || '').trim().toLowerCase();
    return email === cleanIdentifier || userId === cleanIdentifier;
}

function resolveRequestedTenantId({ tenantId = '', tenantSlug = '' } = {}) {
    const explicit = normalizeTenantId(tenantId);
    if (explicit) return explicit;

    const slug = String(tenantSlug || '').trim().toLowerCase();
    if (!slug) return '';
    const tenant = tenantService.findTenantBySlug(slug);
    return tenant?.id ? normalizeTenantId(tenant.id) : '';
}

function hasTenantMembership(user = {}, tenantId = '') {
    const cleanTenant = normalizeTenantId(tenantId);
    if (!cleanTenant) return false;
    const memberships = sanitizeMemberships(user?.memberships || []);
    return memberships.some((item) => item.tenantId === cleanTenant);
}

function resolveScopedUser(user = {}, requestedTenantId = '') {
    const memberships = sanitizeMemberships(user?.memberships || []);
    const preferredTenant = normalizeTenantId(requestedTenantId)
        || normalizeTenantId(user?.tenantId)
        || normalizeTenantId(memberships?.[0]?.tenantId)
        || 'default';
    const matched = memberships.find((item) => item.tenantId === preferredTenant) || null;
    const role = normalizeRole(matched?.role || user?.role);

    return {
        ...user,
        tenantId: preferredTenant,
        role,
        memberships: memberships.length > 0 ? memberships : [{ tenantId: preferredTenant, role }]
    };
}

function sanitizeUser(user = {}) {
    const scoped = resolveScopedUser(user, user?.tenantId);
    const memberships = sanitizeMemberships(scoped.memberships);
    const isSuperAdmin = saasControlService.isSuperAdminUser(scoped);
    const resolvedAccess = accessPolicyService.resolveUserPermissions({
        role: normalizeRole(scoped.role),
        isSuperAdmin,
        permissionGrants: scoped.permissionGrants || scoped.permissions || scoped?.metadata?.access?.permissionGrants || [],
        permissionPacks: scoped.permissionPacks || scoped?.metadata?.access?.permissionPacks || []
    });

    return {
        id: scoped.id,
        email: scoped.email,
        tenantId: scoped.tenantId,
        role: resolvedAccess.role,
        name: scoped.name,
        memberships,
        canSwitchTenant: memberships.length > 1,
        isSuperAdmin,
        permissions: resolvedAccess.permissions,
        requiredPermissions: resolvedAccess.required,
        optionalPermissions: resolvedAccess.optional,
        blockedPermissions: resolvedAccess.blocked,
        permissionGrants: resolvedAccess.permissionGrants,
        permissionPacks: resolvedAccess.permissionPacks,
        canManageSaas: Boolean(isSuperAdmin || resolvedAccess.permissions.includes(accessPolicyService.PERMISSIONS.TENANT_OVERVIEW_READ))
    };
}

function hydrateAuthUser(auth = null) {
    if (!auth || typeof auth !== 'object') return null;
    const userRecord = findUserRecord({ userId: auth.userId, email: auth.email });

    if (!userRecord) {
        const fallback = {
            id: auth.userId,
            email: auth.email,
            tenantId: auth.tenantId,
            role: normalizeRole(auth.role),
            name: auth.name,
            memberships: [{ tenantId: auth.tenantId, role: normalizeRole(auth.role) }]
        };
        const safeFallback = sanitizeUser(fallback);
        return {
            ...auth,
            role: safeFallback.role,
            name: safeFallback.name,
            memberships: safeFallback.memberships,
            canSwitchTenant: safeFallback.canSwitchTenant,
            isSuperAdmin: safeFallback.isSuperAdmin,
            canManageSaas: safeFallback.canManageSaas,
            permissions: safeFallback.permissions,
            requiredPermissions: safeFallback.requiredPermissions,
            optionalPermissions: safeFallback.optionalPermissions,
            blockedPermissions: safeFallback.blockedPermissions,
            permissionGrants: safeFallback.permissionGrants,
            permissionPacks: safeFallback.permissionPacks
        };
    }

    const scoped = resolveScopedUser({
        ...userRecord,
        role: normalizeRole(auth.role || userRecord.role),
        name: String(auth.name || userRecord.name || '').trim() || null
    }, auth.tenantId);
    const safeScoped = sanitizeUser(scoped);

    return {
        ...auth,
        role: safeScoped.role,
        name: safeScoped.name,
        memberships: safeScoped.memberships,
        canSwitchTenant: safeScoped.canSwitchTenant,
        isSuperAdmin: safeScoped.isSuperAdmin,
        canManageSaas: safeScoped.canManageSaas,
        permissions: safeScoped.permissions,
        requiredPermissions: safeScoped.requiredPermissions,
        optionalPermissions: safeScoped.optionalPermissions,
        blockedPermissions: safeScoped.blockedPermissions,
        permissionGrants: safeScoped.permissionGrants,
        permissionPacks: safeScoped.permissionPacks
    };
}

function getAllowedTenantsForUser(user = {}, tenants = []) {
    const safeTenants = Array.isArray(tenants) ? tenants : [];
    const memberships = sanitizeMemberships(user?.memberships || []);
    if (memberships.length === 0) return safeTenants;

    const allowedIds = new Set(memberships.map((item) => item.tenantId));
    const scoped = safeTenants.filter((tenant) => allowedIds.has(String(tenant?.id || '').trim()));
    if (scoped.length > 0) return scoped;

    const fallbackTenantId = normalizeTenantId(user?.tenantId);
    if (!fallbackTenantId) return [];
    return safeTenants.filter((tenant) => String(tenant?.id || '').trim() === fallbackTenantId);
}

function buildAccessSessionForUser(user = {}) {
    const now = nowEpochSeconds();
    const ttl = getTokenTtlSec();
    const payload = {
        sub: String(user.id || '').trim(),
        email: String(user.email || '').trim().toLowerCase(),
        tenantId: String(user.tenantId || 'default').trim(),
        role: normalizeRole(user.role),
        name: String(user.name || '').trim() || null,
        iat: now,
        exp: now + ttl,
        jti: randomTokenId('jti')
    };

    const accessToken = buildAccessToken(payload);
    return {
        accessToken,
        tokenType: 'Bearer',
        expiresInSec: ttl,
        payload
    };
}

async function issueSessionForScopedUser(user = {}) {
    const scoped = resolveScopedUser(user, user?.tenantId);
    const accessSession = buildAccessSessionForUser(scoped);
    const refresh = await authSessionService.issueRefreshSession({
        tenantId: scoped.tenantId,
        user: {
            id: scoped.id,
            email: scoped.email,
            role: scoped.role,
            name: scoped.name
        }
    });

    return {
        accessToken: accessSession.accessToken,
        tokenType: accessSession.tokenType,
        expiresInSec: accessSession.expiresInSec,
        refreshToken: refresh.refreshToken,
        refreshExpiresInSec: refresh.expiresInSec,
        refreshExpiresAtUnix: refresh.expiresAtUnix,
        user: sanitizeUser(scoped)
    };
}

async function login({ email = '', password = '', tenantId = '', tenantSlug = '' } = {}) {
    if (!isAuthEnabled()) {
        throw new Error('Autenticacion SaaS deshabilitada. Activa SAAS_AUTH_ENABLED=true.');
    }

    if (!getAuthSecret()) {
        throw new Error('Falta SAAS_AUTH_SECRET para generar tokens de acceso.');
    }

    const cleanIdentifier = String(email || '').trim();
    const requestedTenantId = resolveRequestedTenantId({ tenantId, tenantSlug });
    await saasControlService.ensureLoaded();
    const users = getAuthUsersRecords();
    if (!users.length) {
        throw new Error('No hay usuarios configurados para autenticacion SaaS (DB/control plane).');
    }

    const candidates = users.filter((user) => resolveUserMatchesLoginIdentifier(user, cleanIdentifier) && verifyUserPassword(user, password));
    if (!candidates.length) {
        throw new Error('Credenciales invalidas.');
    }

    let target = null;
    if (requestedTenantId) {
        target = candidates.find((user) => hasTenantMembership(user, requestedTenantId)) || null;
        if (!target) {
            throw new Error('Usuario sin acceso al tenant seleccionado.');
        }
    } else {
        target = candidates[0] || null;
    }

    if (!target) {
        throw new Error('Credenciales invalidas.');
    }

    const scoped = resolveScopedUser(target, requestedTenantId || target.tenantId);
    return issueSessionForScopedUser(scoped);
}

async function refreshSession({ refreshToken = '' } = {}) {
    if (!isAuthEnabled()) {
        throw new Error('Autenticacion SaaS deshabilitada.');
    }

    if (!getAuthSecret()) {
        throw new Error('Falta SAAS_AUTH_SECRET para renovar sesion.');
    }

    const cleanRefreshToken = String(refreshToken || '').trim();
    if (!cleanRefreshToken) {
        throw new Error('Refresh token requerido.');
    }

    await saasControlService.ensureLoaded();
    const rotated = await authSessionService.rotateRefreshSession(cleanRefreshToken);
    if (!rotated) {
        throw new Error('Refresh token invalido o expirado.');
    }

    const userRecord = findUserRecord({ userId: rotated.userId, email: rotated.email });
    const scopedUser = userRecord && hasTenantMembership(userRecord, rotated.tenantId)
        ? resolveScopedUser(userRecord, rotated.tenantId)
        : resolveScopedUser({
            id: rotated.userId,
            email: rotated.email,
            tenantId: rotated.tenantId,
            role: normalizeRole(rotated.role),
            name: null,
            memberships: [{ tenantId: rotated.tenantId, role: normalizeRole(rotated.role) }]
        }, rotated.tenantId);

    const accessSession = buildAccessSessionForUser(scopedUser);

    return {
        accessToken: accessSession.accessToken,
        tokenType: accessSession.tokenType,
        expiresInSec: accessSession.expiresInSec,
        refreshToken: rotated.refreshToken,
        refreshExpiresInSec: rotated.refreshExpiresInSec,
        refreshExpiresAtUnix: rotated.refreshExpiresAtUnix,
        user: sanitizeUser(scopedUser)
    };
}

async function switchTenantSession({ accessToken = '', refreshToken = '', targetTenantId = '' } = {}) {
    if (!isAuthEnabled()) {
        throw new Error('Autenticacion SaaS deshabilitada.');
    }

    if (!getAuthSecret()) {
        throw new Error('Falta SAAS_AUTH_SECRET para cambiar de tenant.');
    }

    await saasControlService.ensureLoaded();
    const cleanTargetTenantId = normalizeTenantId(targetTenantId);
    if (!cleanTargetTenantId) {
        throw new Error('targetTenantId es requerido.');
    }

    const cleanAccessToken = String(accessToken || '').trim();
    if (!cleanAccessToken) {
        throw new Error('accessToken es requerido para cambiar de tenant.');
    }

    const auth = await verifyAccessTokenAsync(cleanAccessToken);
    if (!auth) {
        throw new Error('Sesion invalida o expirada.');
    }

    if (normalizeTenantId(auth.tenantId) === cleanTargetTenantId) {
        return refreshSession({ refreshToken: String(refreshToken || '').trim() });
    }

    const userRecord = findUserRecord({ userId: auth.userId, email: auth.email });
    if (!userRecord) {
        throw new Error('No se encontro el usuario para cambiar de tenant.');
    }
    if (!hasTenantMembership(userRecord, cleanTargetTenantId)) {
        throw new Error('Usuario sin acceso al tenant seleccionado.');
    }

    const cleanRefreshToken = String(refreshToken || '').trim();
    if (cleanRefreshToken) {
        try {
            await authSessionService.revokeRefreshToken(cleanRefreshToken, { reason: 'tenant_switch' });
        } catch (_) {
        }
    }

    try {
        await authSessionService.revokeAccessToken({
            tenantId: auth.tenantId,
            accessToken: cleanAccessToken,
            jti: auth.jti,
            userId: auth.userId,
            expiresAtUnix: auth.exp,
            reason: 'tenant_switch'
        });
    } catch (_) {
    }

    const scoped = resolveScopedUser(userRecord, cleanTargetTenantId);
    return issueSessionForScopedUser(scoped);
}

function getTokenFromRequest(req = {}) {
    const authHeader = String(req?.headers?.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }
    return String(req?.headers?.['x-access-token'] || '').trim();
}

function verifyAccessToken(token = '') {
    if (!isAuthEnabled()) return null;
    const payload = parseAccessToken(token);
    if (!payload) return null;
    const baseAuth = {
        userId: String(payload.sub || '').trim(),
        email: String(payload.email || '').trim().toLowerCase(),
        tenantId: String(payload.tenantId || 'default').trim(),
        role: normalizeRole(payload.role),
        name: String(payload.name || '').trim() || null,
        exp: Number(payload.exp || 0),
        iat: Number(payload.iat || 0),
        jti: String(payload.jti || '').trim() || null
    };
    return hydrateAuthUser(baseAuth);
}

async function verifyAccessTokenAsync(token = '') {
    const cleanToken = String(token || '').trim();
    const auth = verifyAccessToken(cleanToken);
    if (!auth) return null;

    const revoked = await authSessionService.isAccessTokenRevoked({
        tenantId: auth.tenantId,
        tokenHash: authSessionService.buildAccessTokenHash(cleanToken),
        jti: auth.jti
    });
    if (revoked) return null;

    return auth;
}

async function logoutSession({ accessToken = '', refreshToken = '', reason = 'logout' } = {}) {
    const cleanAccessToken = String(accessToken || '').trim();
    const cleanRefreshToken = String(refreshToken || '').trim();

    let auth = null;
    if (cleanAccessToken) {
        auth = verifyAccessToken(cleanAccessToken);
    }

    let revokedAccess = false;
    if (auth && cleanAccessToken) {
        await authSessionService.revokeAccessToken({
            tenantId: auth.tenantId,
            accessToken: cleanAccessToken,
            jti: auth.jti,
            userId: auth.userId,
            expiresAtUnix: auth.exp,
            reason
        });
        revokedAccess = true;
    }

    let revokedRefresh = false;
    if (cleanRefreshToken) {
        const revoked = await authSessionService.revokeRefreshToken(cleanRefreshToken, { reason });
        revokedRefresh = Boolean(revoked?.ok && Number(revoked?.updated || 0) > 0);
    }

    if (!revokedAccess && !revokedRefresh) {
        return {
            ok: false,
            revokedAccess: false,
            revokedRefresh: false,
            user: auth
                ? {
                    id: auth.userId,
                    email: auth.email,
                    tenantId: auth.tenantId,
                    role: auth.role,
                    name: auth.name,
                    memberships: sanitizeMemberships(auth.memberships || []),
                    canSwitchTenant: Boolean(auth.canSwitchTenant),
                isSuperAdmin: Boolean(auth.isSuperAdmin),
                canManageSaas: Boolean(auth.canManageSaas)
            }
            : null
        };
    }

    return {
        ok: true,
        revokedAccess,
        revokedRefresh,
        user: auth
            ? {
                id: auth.userId,
                email: auth.email,
                tenantId: auth.tenantId,
                role: auth.role,
                name: auth.name,
                memberships: sanitizeMemberships(auth.memberships || []),
                canSwitchTenant: Boolean(auth.canSwitchTenant),
                isSuperAdmin: Boolean(auth.isSuperAdmin),
                canManageSaas: Boolean(auth.canManageSaas)
            }
            : null
    };
}

function getRequestAuthContext(req = {}) {
    const token = getTokenFromRequest(req);
    const auth = verifyAccessToken(token);
    return {
        enabled: isAuthEnabled(),
        tokenPresent: Boolean(token),
        isAuthenticated: Boolean(auth),
        user: auth
    };
}

async function getRequestAuthContextAsync(req = {}) {
    const token = getTokenFromRequest(req);
    const auth = await verifyAccessTokenAsync(token);
    return {
        enabled: isAuthEnabled(),
        tokenPresent: Boolean(token),
        isAuthenticated: Boolean(auth),
        user: auth
    };
}

module.exports = {
    isAuthEnabled,
    login,
    refreshSession,
    switchTenantSession,
    logoutSession,
    verifyAccessToken,
    verifyAccessTokenAsync,
    getTokenFromRequest,
    getRequestAuthContext,
    getRequestAuthContextAsync,
    getAllowedTenantsForUser,
    findUserRecord
};



