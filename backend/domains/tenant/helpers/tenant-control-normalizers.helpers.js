const crypto = require('crypto');
const { DEFAULT_TENANT_ID } = require('../../../config/persistence-runtime');
const accessPolicyService = require('../../security/services/access-policy.service');
const passwordHashService = require('../../security/services/password-hash.service');

function nowIso() {
    return new Date().toISOString();
}

function normalizeTenantId(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

function normalizeSlug(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function sanitizeCodeToken(value = '', fallback = '') {
    const token = String(value || fallback || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return token || '';
}

function normalizeUrlValue(value = '') {
    const text = String(value || '').trim();
    if (!text) return null;
    if (/^https?:\/\//i.test(text)) return text;
    return null;
}

function normalizeMetadata(value = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

function buildUniqueIdFromSet(existingIds = new Set(), {
    prefix = '',
    base = '',
    fallback = ''
} = {}) {
    const normalizedPrefix = sanitizeCodeToken(prefix, 'id');
    const normalizedBase = sanitizeCodeToken(base, fallback || normalizedPrefix);
    const root = normalizedBase || sanitizeCodeToken(fallback, normalizedPrefix) || normalizedPrefix;

    let candidate = root;
    if (!candidate.startsWith(`${normalizedPrefix}_`) && candidate !== normalizedPrefix) {
        candidate = `${normalizedPrefix}_${candidate}`;
    }

    if (!existingIds.has(candidate)) return candidate;
    for (let i = 2; i < 10000; i += 1) {
        const next = `${candidate}_${i}`;
        if (!existingIds.has(next)) return next;
    }

    const randomSuffix = Math.random().toString(36).slice(2, 8);
    return `${candidate}_${randomSuffix}`;
}

function sanitizeStructuredCode(value = '') {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    return raw.replace(/[^A-Z0-9]/g, '');
}

function normalizeStructuredIdCandidate(value = '', {
    prefix = 'TEN',
    size = 6
} = {}) {
    const cleanPrefix = sanitizeStructuredCode(prefix || 'ID') || 'ID';
    const safeSize = Math.max(4, Math.floor(Number(size) || 6));
    const cleanValue = String(value || '').trim().toUpperCase();
    const matcher = new RegExp(`^${cleanPrefix}-[A-Z0-9]{${safeSize}}$`);
    if (!matcher.test(cleanValue)) return '';
    return cleanValue;
}

function randomStructuredSuffix(size = 6) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const safeSize = Math.max(4, Math.floor(Number(size) || 6));
    const bytes = crypto.randomBytes(safeSize * 2);
    let out = '';
    for (let i = 0; i < bytes.length && out.length < safeSize; i += 1) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out.slice(0, safeSize);
}

function createStructuredId(existingIds = new Set(), {
    prefix = 'TEN',
    size = 6
} = {}) {
    const cleanPrefix = sanitizeStructuredCode(prefix || 'ID') || 'ID';
    const safeSize = Math.max(4, Math.floor(Number(size) || 6));
    const used = new Set(
        Array.from(existingIds || [])
            .map((entry) => String(entry || '').trim().toUpperCase())
            .filter(Boolean)
    );

    for (let i = 0; i < 1000; i += 1) {
        const candidate = `${cleanPrefix}-${randomStructuredSuffix(safeSize)}`;
        if (!used.has(candidate)) return candidate;
    }

    const fallbackSuffix = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-safeSize).padStart(safeSize, '0');
    return `${cleanPrefix}-${fallbackSuffix}`;
}

function parseBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return Boolean(fallback);
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeRole(value = '') {
    return accessPolicyService.normalizeRole(value);
}

function roleWeight(role = '') {
    if (role === 'owner') return 3;
    if (role === 'admin') return 2;
    return 1;
}

function hashPassword(raw = '') {
    return passwordHashService.hashPassword(raw);
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

    const slugCandidate = String(input.slug || '').trim();
    const slug = normalizeSlug(slugCandidate || id) || id;
    const name = String(input.name || input.displayName || slug || id).trim() || id;
    const active = input.active !== false;
    const plan = String(input.plan || 'starter').trim().toLowerCase() || 'starter';
    const createdAt = String(input.createdAt || '').trim() || nowIso();
    const updatedAt = String(input.updatedAt || '').trim() || nowIso();
    const logoUrl = normalizeUrlValue(input.logoUrl || input.logo_url || input.imageUrl || input.image_url);
    const coverImageUrl = normalizeUrlValue(input.coverImageUrl || input.cover_image_url || input.bannerUrl || input.banner_url);

    return {
        id,
        slug,
        name,
        active,
        plan,
        logoUrl,
        coverImageUrl,
        metadata: normalizeMetadata(input.metadata),
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

    const passwordHashFromInput = passwordHashService.normalizeStoredHash(input.passwordHash || input.password_hash || input.sha256 || '');
    const plainPassword = String(input.password || '').trim();
    const passwordHash = passwordHashFromInput || (plainPassword ? hashPassword(plainPassword) : '');

    if (!passwordHash) return null;

    const createdAt = String(input.createdAt || '').trim() || nowIso();
    const updatedAt = String(input.updatedAt || '').trim() || nowIso();
    const avatarUrl = normalizeUrlValue(input.avatarUrl || input.avatar_url || input.photoUrl || input.photo_url || input.imageUrl || input.image_url);
    const metadata = normalizeMetadata(input.metadata);
    const metadataAccess = metadata?.access && typeof metadata.access === 'object' && !Array.isArray(metadata.access)
        ? metadata.access
        : {};
    const primaryMembership = memberships[0] || { role: fallbackRole };
    const normalizedAccess = accessPolicyService.sanitizeUserAccessInput({
        role: primaryMembership.role || fallbackRole,
        permissionGrants: input.permissionGrants || input.permissions || metadataAccess.permissionGrants || [],
        permissionPacks: input.permissionPacks || metadataAccess.permissionPacks || []
    });

    const nextMetadata = {
        ...metadata,
        access: {
            ...metadataAccess,
            permissionGrants: normalizedAccess.permissionGrants,
            permissionPacks: normalizedAccess.permissionPacks
        }
    };

    return {
        id,
        email,
        name: String(input.name || input.displayName || email).trim() || email,
        active: input.active !== false,
        passwordHash,
        avatarUrl,
        metadata: nextMetadata,
        permissionGrants: normalizedAccess.permissionGrants,
        permissionPacks: normalizedAccess.permissionPacks,
        memberships,
        createdAt,
        updatedAt
    };
}

module.exports = {
    nowIso,
    normalizeTenantId,
    normalizeSlug,
    sanitizeCodeToken,
    normalizeUrlValue,
    normalizeMetadata,
    buildUniqueIdFromSet,
    sanitizeStructuredCode,
    normalizeStructuredIdCandidate,
    createStructuredId,
    parseBoolean,
    normalizeRole,
    roleWeight,
    hashPassword,
    normalizeMembership,
    normalizeMemberships,
    normalizeTenant,
    normalizeUser
};
