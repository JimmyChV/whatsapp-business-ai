const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
} = require('./persistence_runtime');
const planLimitsService = require('./plan_limits_service');

const CONTROL_TENANT_ID = '_control';
const CONTROL_FILE_NAME = 'saas_control_plane.json';

let cachedSnapshot = {
    loaded: false,
    tenants: [],
    users: []
};
let ensurePromise = null;

function nowIso() {
    return new Date().toISOString();
}

function parseBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return Boolean(fallback);
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeRole(value = '') {
    const role = String(value || '').trim().toLowerCase();
    if (role === 'owner' || role === 'admin' || role === 'seller') return role;
    return 'seller';
}

function roleWeight(role = '') {
    if (role === 'owner') return 3;
    if (role === 'admin') return 2;
    return 1;
}

function hashPassword(raw = '') {
    return crypto.createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

function normalizeMembership(entry = {}, fallbackRole = 'seller') {
    if (typeof entry === 'string') {
        const tenantId = normalizeTenantId(entry);
        if (!tenantId) return null;
        return {
            tenantId,
            role: normalizeRole(fallbackRole),
            active: true
        };
    }

    if (!entry || typeof entry !== 'object') return null;
    const tenantId = normalizeTenantId(entry.tenantId || entry.tenant || entry.id || entry.slug || '');
    if (!tenantId) return null;

    return {
        tenantId,
        role: normalizeRole(entry.role || fallbackRole),
        active: entry.active !== false
    };
}

function normalizeMemberships(memberships = [], fallbackRole = 'seller') {
    const source = Array.isArray(memberships) ? memberships : [];
    const map = new Map();

    source.forEach((entry) => {
        const normalized = normalizeMembership(entry, fallbackRole);
        if (!normalized || !normalized.tenantId) return;

        const current = map.get(normalized.tenantId);
        if (!current) {
            map.set(normalized.tenantId, normalized);
            return;
        }

        if (roleWeight(normalized.role) > roleWeight(current.role)) {
            map.set(normalized.tenantId, normalized);
            return;
        }

        if (!current.active && normalized.active) {
            map.set(normalized.tenantId, normalized);
        }
    });

    return Array.from(map.values());
}

function normalizeTenant(input = {}, fallbackIndex = 0) {
    if (!input || typeof input !== 'object') return null;

    const id = normalizeTenantId(input.id || input.tenantId || `tenant_${fallbackIndex + 1}`);
    if (!id) return null;

    const slug = String(input.slug || id).trim().toLowerCase() || id;
    const name = String(input.name || input.displayName || slug || id).trim() || id;
    const active = input.active !== false;
    const plan = String(input.plan || 'starter').trim().toLowerCase() || 'starter';
    const createdAt = String(input.createdAt || '').trim() || nowIso();
    const updatedAt = String(input.updatedAt || '').trim() || nowIso();

    return {
        id,
        slug,
        name,
        active,
        plan,
        createdAt,
        updatedAt
    };
}

function normalizeUser(input = {}, fallbackIndex = 0) {
    if (!input || typeof input !== 'object') return null;

    const id = String(input.id || input.userId || `user_${fallbackIndex + 1}`).trim();
    const email = String(input.email || '').trim().toLowerCase();
    if (!id || !email) return null;

    const fallbackRole = normalizeRole(input.role || 'seller');
    const builtMemberships = normalizeMemberships([
        ...(Array.isArray(input.memberships) ? input.memberships : []),
        ...(Array.isArray(input.tenants) ? input.tenants : []),
        ...(Array.isArray(input.tenantIds) ? input.tenantIds : []),
        input.tenantId || input.tenant || null
    ], fallbackRole);

    const memberships = builtMemberships.length > 0
        ? builtMemberships
        : [{ tenantId: DEFAULT_TENANT_ID, role: fallbackRole, active: true }];

    const passwordHashFromInput = String(input.passwordHash || input.password_hash || input.sha256 || '').trim().toLowerCase();
    const plainPassword = String(input.password || '').trim();
    const passwordHash = passwordHashFromInput || (plainPassword ? hashPassword(plainPassword) : '');

    if (!passwordHash) return null;

    const createdAt = String(input.createdAt || '').trim() || nowIso();
    const updatedAt = String(input.updatedAt || '').trim() || nowIso();

    return {
        id,
        email,
        name: String(input.name || input.displayName || email).trim() || email,
        active: input.active !== false,
        passwordHash,
        memberships,
        createdAt,
        updatedAt
    };
}

function parseTenantsFromEnv() {
    const raw = String(process.env.SAAS_TENANTS_JSON || '').trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item, index) => normalizeTenant(item, index)).filter(Boolean);
    } catch (_) {
        return [];
    }
}

function parseUsersFromEnv() {
    const raw = String(process.env.SAAS_USERS_JSON || '').trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item, index) => normalizeUser(item, index)).filter(Boolean);
    } catch (_) {
        return [];
    }
}

function normalizeSnapshot(input = {}) {
    const source = input && typeof input === 'object' ? input : {};

    const tenantsMap = new Map();
    const usersMap = new Map();

    (Array.isArray(source.tenants) ? source.tenants : []).forEach((tenant, index) => {
        const normalized = normalizeTenant(tenant, index);
        if (!normalized) return;
        tenantsMap.set(normalized.id, normalized);
    });

    if (!tenantsMap.has(DEFAULT_TENANT_ID)) {
        tenantsMap.set(DEFAULT_TENANT_ID, normalizeTenant({
            id: DEFAULT_TENANT_ID,
            slug: DEFAULT_TENANT_ID,
            name: 'Default Tenant',
            active: true,
            plan: 'starter'
        }));
    }

    (Array.isArray(source.users) ? source.users : []).forEach((user, index) => {
        const normalized = normalizeUser(user, index);
        if (!normalized) return;
        usersMap.set(normalized.id, normalized);
    });

    return {
        loaded: Boolean(source.loaded),
        tenants: Array.from(tenantsMap.values()),
        users: Array.from(usersMap.values())
    };
}

function mergeSnapshots(primary = {}, secondary = {}) {
    const first = normalizeSnapshot(primary);
    const second = normalizeSnapshot(secondary);

    const tenantsMap = new Map();
    [...second.tenants, ...first.tenants].forEach((tenant) => {
        tenantsMap.set(tenant.id, tenant);
    });

    const usersMap = new Map();
    [...second.users, ...first.users].forEach((user) => {
        usersMap.set(user.id, user);
    });

    return normalizeSnapshot({
        loaded: first.loaded || second.loaded,
        tenants: Array.from(tenantsMap.values()),
        users: Array.from(usersMap.values())
    });
}

function buildEnvSnapshot() {
    return normalizeSnapshot({
        loaded: true,
        tenants: parseTenantsFromEnv(),
        users: parseUsersFromEnv()
    });
}

async function loadFromFileDriver() {
    const parsed = await readTenantJsonFile(CONTROL_FILE_NAME, {
        tenantId: CONTROL_TENANT_ID,
        defaultValue: { tenants: [], users: [] }
    });
    return normalizeSnapshot({ ...parsed, loaded: true });
}

function missingRelation(error) {
    const code = String(error?.code || '').trim();
    return code === '42P01';
}

async function loadFromPostgresDriver() {
    try {
        const [tenantRows, userRows, membershipRows] = await Promise.all([
            queryPostgres(
                `SELECT tenant_id, slug, name, plan, is_active, created_at, updated_at
                   FROM tenants
                  ORDER BY created_at ASC`
            ),
            queryPostgres(
                `SELECT user_id, email, password_hash, display_name, is_active, created_at, updated_at
                   FROM users
                  ORDER BY created_at ASC`
            ),
            queryPostgres(
                `SELECT tenant_id, user_id, role, is_active, created_at, updated_at
                   FROM memberships`
            )
        ]);

        const tenantList = (tenantRows?.rows || []).map((row) => normalizeTenant({
            id: row.tenant_id,
            slug: row.slug,
            name: row.name,
            active: row.is_active,
            plan: row.plan,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        })).filter(Boolean);

        const membershipByUser = new Map();
        (membershipRows?.rows || []).forEach((row) => {
            const key = String(row.user_id || '').trim();
            if (!key) return;
            const existing = membershipByUser.get(key) || [];
            existing.push({
                tenantId: row.tenant_id,
                role: row.role,
                active: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            });
            membershipByUser.set(key, existing);
        });

        const usersList = (userRows?.rows || []).map((row) => normalizeUser({
            id: row.user_id,
            email: row.email,
            passwordHash: row.password_hash,
            name: row.display_name,
            active: row.is_active,
            memberships: membershipByUser.get(String(row.user_id || '').trim()) || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at
        })).filter(Boolean);

        return normalizeSnapshot({
            loaded: true,
            tenants: tenantList,
            users: usersList
        });
    } catch (error) {
        if (missingRelation(error)) {
            return normalizeSnapshot({ loaded: true, tenants: [], users: [] });
        }
        throw error;
    }
}

async function loadFromStorage() {
    if (getStorageDriver() === 'postgres') {
        return loadFromPostgresDriver();
    }
    return loadFromFileDriver();
}

async function persistToFile(snapshot = {}) {
    await writeTenantJsonFile(CONTROL_FILE_NAME, {
        tenants: snapshot.tenants,
        users: snapshot.users
    }, {
        tenantId: CONTROL_TENANT_ID
    });
}

async function persistToPostgres(snapshot = {}) {
    const safe = normalizeSnapshot(snapshot);

    await queryPostgres('BEGIN');
    try {
        await queryPostgres('DELETE FROM memberships');
        await queryPostgres('DELETE FROM users');
        await queryPostgres('DELETE FROM tenants');

        for (const tenant of safe.tenants) {
            await queryPostgres(
                `INSERT INTO tenants (tenant_id, slug, name, plan, is_active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                [tenant.id, tenant.slug, tenant.name, tenant.plan, tenant.active !== false]
            );
        }

        for (const user of safe.users) {
            await queryPostgres(
                `INSERT INTO users (user_id, email, password_hash, display_name, is_active, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                [user.id, user.email, user.passwordHash, user.name || null, user.active !== false]
            );

            for (const membership of user.memberships || []) {
                await queryPostgres(
                    `INSERT INTO memberships (tenant_id, user_id, role, is_active, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
                    [membership.tenantId, user.id, membership.role, membership.active !== false]
                );
            }
        }

        await queryPostgres('COMMIT');
    } catch (error) {
        await queryPostgres('ROLLBACK');
        throw error;
    }
}

async function persistSnapshot(snapshot = {}) {
    const safe = normalizeSnapshot(snapshot);
    if (getStorageDriver() === 'postgres') {
        return persistToPostgres(safe);
    }
    return persistToFile(safe);
}

async function ensureLoaded() {
    if (cachedSnapshot.loaded) return cachedSnapshot;
    if (ensurePromise) return ensurePromise;

    ensurePromise = (async () => {
        const envSnapshot = buildEnvSnapshot();
        const storageSnapshot = await loadFromStorage();

        let merged = mergeSnapshots(storageSnapshot, envSnapshot);

        const storageLooksEmpty = (storageSnapshot.tenants || []).length <= 1 && (storageSnapshot.users || []).length === 0;
        const envHasData = (envSnapshot.tenants || []).length > 1 || (envSnapshot.users || []).length > 0;

        if (storageLooksEmpty && envHasData) {
            await persistSnapshot(merged);
        }

        merged.loaded = true;
        cachedSnapshot = merged;
        return cachedSnapshot;
    })();

    try {
        return await ensurePromise;
    } finally {
        ensurePromise = null;
    }
}

function getSnapshotSync() {
    if (!cachedSnapshot.loaded) {
        cachedSnapshot = mergeSnapshots(cachedSnapshot, buildEnvSnapshot());
        cachedSnapshot.loaded = false;
    }
    return cachedSnapshot;
}

function listTenantsSync({ includeInactive = true } = {}) {
    const snapshot = getSnapshotSync();
    const items = Array.isArray(snapshot.tenants) ? snapshot.tenants : [];
    if (includeInactive) return items;
    return items.filter((item) => item.active !== false);
}

async function listTenants(options = {}) {
    await ensureLoaded();
    return listTenantsSync(options);
}

function findTenantByIdSync(tenantId = '') {
    const target = normalizeTenantId(tenantId || '');
    if (!target) return null;
    return listTenantsSync({ includeInactive: true }).find((tenant) => tenant.id === target) || null;
}

async function findTenantById(tenantId = '') {
    await ensureLoaded();
    return findTenantByIdSync(tenantId);
}

function listUsersSync({ includeInactive = true, tenantId = '' } = {}) {
    const cleanTenant = normalizeTenantId(tenantId || '');
    const snapshot = getSnapshotSync();
    let items = Array.isArray(snapshot.users) ? snapshot.users : [];

    if (!includeInactive) {
        items = items.filter((user) => user.active !== false);
    }

    if (cleanTenant) {
        items = items.filter((user) => (user.memberships || []).some((membership) => {
            if (!membership || membership.tenantId !== cleanTenant) return false;
            if (includeInactive) return true;
            return membership.active !== false;
        }));
    }

    return items;
}

async function listUsers(options = {}) {
    await ensureLoaded();
    return listUsersSync(options);
}

function findUserByIdSync(userId = '') {
    const target = String(userId || '').trim();
    if (!target) return null;
    return listUsersSync({ includeInactive: true }).find((user) => user.id === target) || null;
}

function findUserByEmailSync(email = '') {
    const target = String(email || '').trim().toLowerCase();
    if (!target) return null;
    return listUsersSync({ includeInactive: true }).find((user) => user.email === target) || null;
}

function countActiveUsersForTenant(snapshot = {}, tenantId = '') {
    const cleanTenant = normalizeTenantId(tenantId || '');
    if (!cleanTenant) return 0;
    const users = Array.isArray(snapshot.users) ? snapshot.users : [];
    return users.filter((user) => {
        if (!user || user.active === false) return false;
        return (user.memberships || []).some((membership) => {
            if (!membership || membership.tenantId !== cleanTenant) return false;
            return membership.active !== false;
        });
    }).length;
}

function validateTenantUserLimits(snapshot = {}) {
    const tenants = Array.isArray(snapshot.tenants) ? snapshot.tenants : [];
    tenants.forEach((tenant) => {
        const limits = planLimitsService.getTenantPlanLimits(tenant);
        const current = countActiveUsersForTenant(snapshot, tenant.id);
        planLimitsService.assertUsageWithinLimit({
            metric: 'usuarios activos',
            current,
            next: current,
            max: limits.maxUsers,
            plan: tenant.plan
        });
    });
}

function sanitizeUserPublic(user = {}) {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        active: user.active !== false,
        memberships: Array.isArray(user.memberships) ? user.memberships.map((membership) => ({
            tenantId: membership.tenantId,
            role: membership.role,
            active: membership.active !== false
        })) : [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

function sanitizeTenantPublic(tenant = {}) {
    return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        active: tenant.active !== false,
        plan: tenant.plan,
        limits: planLimitsService.getTenantPlanLimits(tenant),
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt
    };
}

function sortByName(items = [], key = 'name') {
    return [...items].sort((left, right) => String(left?.[key] || '').localeCompare(String(right?.[key] || ''), 'es', { sensitivity: 'base' }));
}

async function updateSnapshot(mutator) {
    const current = normalizeSnapshot(await ensureLoaded());
    const next = normalizeSnapshot(typeof mutator === 'function' ? mutator(current) : current);
    validateTenantUserLimits(next);
    await persistSnapshot(next);
    next.loaded = true;
    cachedSnapshot = next;
    return cachedSnapshot;
}

async function createTenant(payload = {}) {
    const normalized = normalizeTenant(payload);
    if (!normalized) throw new Error('Datos invalidos para crear tenant.');

    return updateSnapshot((current) => {
        if ((current.tenants || []).some((tenant) => tenant.id === normalized.id)) {
            throw new Error('Ya existe una empresa con ese id.');
        }
        if ((current.tenants || []).some((tenant) => tenant.slug === normalized.slug)) {
            throw new Error('Ya existe una empresa con ese slug.');
        }

        return {
            ...current,
            tenants: sortByName([...current.tenants, {
                ...normalized,
                createdAt: nowIso(),
                updatedAt: nowIso()
            }])
        };
    });
}

async function updateTenant(tenantId = '', patch = {}) {
    const cleanTenantId = normalizeTenantId(tenantId || '');
    if (!cleanTenantId) throw new Error('tenantId invalido.');

    return updateSnapshot((current) => {
        const index = current.tenants.findIndex((tenant) => tenant.id === cleanTenantId);
        if (index < 0) throw new Error('Empresa no encontrada.');

        const previous = current.tenants[index];
        const merged = normalizeTenant({
            ...previous,
            ...patch,
            id: previous.id,
            createdAt: previous.createdAt,
            updatedAt: nowIso()
        });

        const duplicatedSlug = current.tenants.some((tenant, tenantIndex) => tenantIndex !== index && tenant.slug === merged.slug);
        if (duplicatedSlug) throw new Error('El slug ya esta siendo usado por otra empresa.');

        const nextTenants = [...current.tenants];
        nextTenants[index] = merged;

        return {
            ...current,
            tenants: sortByName(nextTenants)
        };
    });
}

async function deleteTenant(tenantId = '') {
    const cleanTenantId = normalizeTenantId(tenantId || '');
    if (!cleanTenantId || cleanTenantId === DEFAULT_TENANT_ID) {
        throw new Error('No se puede eliminar el tenant default.');
    }

    return updateSnapshot((current) => {
        if (!current.tenants.some((tenant) => tenant.id === cleanTenantId)) {
            throw new Error('Empresa no encontrada.');
        }

        const nextUsers = current.users.map((user) => ({
            ...user,
            memberships: (user.memberships || []).filter((membership) => membership.tenantId !== cleanTenantId)
        })).filter((user) => (user.memberships || []).length > 0);

        return {
            ...current,
            tenants: current.tenants.filter((tenant) => tenant.id !== cleanTenantId),
            users: nextUsers
        };
    });
}

async function createUser(payload = {}) {
    const normalized = normalizeUser(payload);
    if (!normalized) throw new Error('Datos invalidos para crear usuario.');

    return updateSnapshot((current) => {
        if (current.users.some((user) => user.id === normalized.id)) {
            throw new Error('Ya existe un usuario con ese id.');
        }
        if (current.users.some((user) => user.email === normalized.email)) {
            throw new Error('Ya existe un usuario con ese correo.');
        }

        normalized.memberships.forEach((membership) => {
            if (!current.tenants.some((tenant) => tenant.id === membership.tenantId)) {
                throw new Error(`El tenant ${membership.tenantId} no existe.`);
            }
        });

        const nextUser = {
            ...normalized,
            createdAt: nowIso(),
            updatedAt: nowIso()
        };

        return {
            ...current,
            users: sortByName([...current.users, nextUser], 'email')
        };
    });
}

async function updateUser(userId = '', patch = {}) {
    const cleanUserId = String(userId || '').trim();
    if (!cleanUserId) throw new Error('userId invalido.');

    return updateSnapshot((current) => {
        const index = current.users.findIndex((user) => user.id === cleanUserId);
        if (index < 0) throw new Error('Usuario no encontrado.');

        const previous = current.users[index];
        const nextEmail = String(patch.email || previous.email).trim().toLowerCase();
        if (!nextEmail) throw new Error('email invalido.');

        const duplicatedEmail = current.users.some((user, userIndex) => userIndex !== index && user.email === nextEmail);
        if (duplicatedEmail) throw new Error('El correo ya esta en uso.');

        const nextMemberships = patch.memberships
            ? normalizeMemberships(patch.memberships, previous.memberships?.[0]?.role || previous.role || 'seller')
            : previous.memberships;

        (nextMemberships || []).forEach((membership) => {
            if (!current.tenants.some((tenant) => tenant.id === membership.tenantId)) {
                throw new Error(`El tenant ${membership.tenantId} no existe.`);
            }
        });

        const updated = {
            ...previous,
            email: nextEmail,
            name: String(patch.name || previous.name || nextEmail).trim() || nextEmail,
            active: patch.active === undefined ? previous.active !== false : patch.active !== false,
            memberships: nextMemberships,
            passwordHash: patch.password
                ? hashPassword(patch.password)
                : (String(patch.passwordHash || '').trim().toLowerCase() || previous.passwordHash),
            updatedAt: nowIso()
        };

        if (!updated.passwordHash) {
            throw new Error('passwordHash invalido.');
        }

        const nextUsers = [...current.users];
        nextUsers[index] = updated;
        return {
            ...current,
            users: sortByName(nextUsers, 'email')
        };
    });
}

async function setUserMemberships(userId = '', memberships = []) {
    return updateUser(userId, { memberships });
}

async function deleteUser(userId = '') {
    const cleanUserId = String(userId || '').trim();
    if (!cleanUserId) throw new Error('userId invalido.');

    return updateSnapshot((current) => {
        if (!current.users.some((user) => user.id === cleanUserId)) {
            throw new Error('Usuario no encontrado.');
        }
        return {
            ...current,
            users: current.users.filter((user) => user.id !== cleanUserId)
        };
    });
}

function toAuthUserRecord(user = {}) {
    const memberships = normalizeMemberships(user.memberships || [], user?.memberships?.[0]?.role || 'seller');
    const activeMemberships = memberships.filter((membership) => membership.active !== false);
    const selectedMembership = activeMemberships[0] || memberships[0] || { tenantId: DEFAULT_TENANT_ID, role: 'seller', active: true };

    return {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        tenantId: selectedMembership.tenantId,
        role: selectedMembership.role,
        name: user.name,
        memberships: activeMemberships.length > 0 ? activeMemberships : [selectedMembership]
    };
}

function getUsersForAuthSync() {
    return listUsersSync({ includeInactive: false }).map(toAuthUserRecord).filter((user) => user.email && user.passwordHash);
}

function findUserRecordSync({ userId = '', email = '' } = {}) {
    const cleanUserId = String(userId || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    const users = getUsersForAuthSync();
    if (cleanUserId) {
        const byId = users.find((user) => user.id === cleanUserId);
        if (byId) return byId;
    }

    if (cleanEmail) {
        const byEmail = users.find((user) => user.email === cleanEmail);
        if (byEmail) return byEmail;
    }

    return null;
}

function parseSuperAdminsFromEnv() {
    const raw = String(process.env.SAAS_SUPERADMINS_JSON || '').trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
    } catch (_) {
        return [];
    }
}

function isSuperAdminUser(user = {}) {
    const email = String(user?.email || '').trim().toLowerCase();
    const id = String(user?.id || user?.userId || '').trim().toLowerCase();
    const superAdmins = parseSuperAdminsFromEnv();
    if (!superAdmins.length) return false;
    return superAdmins.includes(email) || superAdmins.includes(id);
}

async function getAdminOverview() {
    const snapshot = await ensureLoaded();
    const tenants = sortByName(snapshot.tenants.map(sanitizeTenantPublic));
    const users = sortByName(snapshot.users.map(sanitizeUserPublic), 'email');

    const metrics = tenants.map((tenant) => {
        const tenantUsers = users.filter((user) => user.memberships.some((membership) => membership.tenantId === tenant.id && membership.active !== false) && user.active !== false);
        return {
            tenantId: tenant.id,
            activeUsers: tenantUsers.length,
            plan: tenant.plan,
            limits: tenant.limits
        };
    });

    return {
        tenants,
        users,
        metrics
    };
}

module.exports = {
    ensureLoaded,
    getSnapshotSync,
    listTenants,
    listTenantsSync,
    listUsers,
    listUsersSync,
    findTenantById,
    findTenantByIdSync,
    findUserByIdSync,
    findUserByEmailSync,
    findUserRecordSync,
    getUsersForAuthSync,
    createTenant,
    updateTenant,
    deleteTenant,
    createUser,
    updateUser,
    setUserMemberships,
    deleteUser,
    sanitizeTenantPublic,
    sanitizeUserPublic,
    getAdminOverview,
    isSuperAdminUser,
    hashPassword,
    CONTROL_FILE_NAME,
    CONTROL_TENANT_ID
};