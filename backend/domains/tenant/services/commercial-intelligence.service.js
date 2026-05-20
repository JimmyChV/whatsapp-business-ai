const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');
const catalogManagerService = require('./catalog-manager.service');

const COMMERCIAL_PROFILES_FILE = 'tenant_commercial_profiles.json';

const DEFAULT_COMMERCIAL_CONFIG = {
    catalogIds: [],
    brandPositioning: {
        description: '',
        salesStyle: 'consultivo',
        avoid: []
    },
    categories: [],
    synonyms: [],
    productRoles: {},
    playbooks: [],
    offerRules: {
        threeOptions: true,
        economicMinTotal: 90,
        freeShippingThresholdAware: true,
        alwaysAskBeforeQuote: true,
        maxProductsPerProposal: 5
    },
    closingRules: {
        askQuantityIfMissing: true,
        defaultQuantity: 1,
        upsellBeforeQuote: true
    }
};

let schemaReadyPromise = null;

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeTenant(tenantId = DEFAULT_TENANT_ID) {
    return normalizeTenantId(tenantId || DEFAULT_TENANT_ID);
}

function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeLookup(value = '') {
    return toText(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeProfileId(value = '') {
    return toText(value).replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function normalizeSalesStyle(value = '') {
    const clean = normalizeLookup(value);
    if (['directo', 'mixto', 'consultivo'].includes(clean)) return clean;
    return 'consultivo';
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function normalizeNumber(value, fallback, { min = null, max = null } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    let next = parsed;
    if (min !== null) next = Math.max(min, next);
    if (max !== null) next = Math.min(max, next);
    return next;
}

function normalizeStringArray(value = []) {
    return Array.from(new Set(ensureArray(value)
        .map(toText)
        .filter(Boolean)));
}

function normalizeCatalogIds(value = []) {
    return Array.from(new Set(ensureArray(value)
        .map((entry) => toText(entry).toUpperCase())
        .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry))));
}

function normalizeBrandPositioning(value = {}) {
    const input = isPlainObject(value) ? value : {};
    return {
        description: toText(input.description),
        salesStyle: normalizeSalesStyle(input.salesStyle || input.sales_style),
        avoid: normalizeStringArray(input.avoid)
    };
}

function normalizeCategories(value = []) {
    return ensureArray(value)
        .map((entry) => {
            const input = isPlainObject(entry) ? entry : {};
            const id = normalizeProfileId(input.id || input.categoryId || input.name || '');
            const name = toText(input.name || input.label || id);
            if (!id || !name) return null;
            return {
                id,
                name,
                description: toText(input.description),
                benefits: normalizeStringArray(input.benefits),
                discoveryQuestions: normalizeStringArray(input.discoveryQuestions || input.discovery_questions)
            };
        })
        .filter(Boolean);
}

function normalizeSynonyms(value = []) {
    return ensureArray(value)
        .map((entry) => {
            const input = isPlainObject(entry) ? entry : {};
            const term = toText(input.term);
            const mapsTo = toText(input.mapsTo || input.maps_to);
            const rawType = normalizeLookup(input.mapsToType || input.maps_to_type);
            const mapsToType = ['product', 'need', 'category'].includes(rawType) ? rawType : 'category';
            if (!term || !mapsTo) return null;
            return { term, mapsTo, mapsToType };
        })
        .filter(Boolean);
}

function normalizeProductRole(value = {}) {
    const input = isPlainObject(value) ? value : {};
    const rawRole = normalizeLookup(input.role);
    const role = ['core', 'complement', 'economic', 'premium', 'kit'].includes(rawRole)
        ? rawRole
        : (['principal'].includes(rawRole) ? 'core' : rawRole || 'core');
    return {
        category: normalizeProfileId(input.category || ''),
        role,
        priority: normalizeNumber(input.priority, 50, { min: 1, max: 100 }),
        rotationRank: normalizeNumber(input.rotationRank ?? input.rotation_rank, null, { min: 1 }),
        tags: normalizeStringArray(input.tags),
        complements: normalizeStringArray(input.complements),
        substituteSkus: normalizeStringArray(input.substituteSkus || input.substitute_skus)
    };
}

function normalizeProductRoles(value = {}) {
    const input = isPlainObject(value) ? value : {};
    return Object.entries(input).reduce((acc, [sku, role]) => {
        const cleanSku = toText(sku).toUpperCase();
        if (!cleanSku) return acc;
        acc[cleanSku] = normalizeProductRole(role);
        return acc;
    }, {});
}

function normalizePlaybooks(value = []) {
    return ensureArray(value)
        .map((entry) => {
            const input = isPlainObject(entry) ? entry : {};
            const id = normalizeProfileId(input.id || input.name || '');
            if (!id) return null;
            return {
                id,
                categories: normalizeStringArray(input.categories).map(normalizeProfileId).filter(Boolean),
                strategy: toText(input.strategy || 'three_options') || 'three_options',
                economicRule: toText(input.economicRule || input.economic_rule || 'lowest_price') || 'lowest_price',
                recommendedRule: toText(input.recommendedRule || input.recommended_rule || 'high_rotation') || 'high_rotation',
                completeRule: toText(input.completeRule || input.complete_rule || 'add_complements') || 'add_complements'
            };
        })
        .filter(Boolean);
}

function normalizeOfferRules(value = {}) {
    const input = isPlainObject(value) ? value : {};
    return {
        threeOptions: input.threeOptions !== false && input.three_options !== false,
        economicMinTotal: normalizeNumber(input.economicMinTotal ?? input.economic_min_total, 90, { min: 0 }),
        freeShippingThresholdAware: input.freeShippingThresholdAware !== false && input.free_shipping_threshold_aware !== false,
        alwaysAskBeforeQuote: input.alwaysAskBeforeQuote !== false && input.always_ask_before_quote !== false,
        maxProductsPerProposal: normalizeNumber(input.maxProductsPerProposal ?? input.max_products_per_proposal, 5, { min: 1, max: 10 })
    };
}

function normalizeClosingRules(value = {}) {
    const input = isPlainObject(value) ? value : {};
    return {
        askQuantityIfMissing: input.askQuantityIfMissing !== false && input.ask_quantity_if_missing !== false,
        defaultQuantity: normalizeNumber(input.defaultQuantity ?? input.default_quantity, 1, { min: 1, max: 99 }),
        upsellBeforeQuote: input.upsellBeforeQuote !== false && input.upsell_before_quote !== false
    };
}

function normalizeConfig(value = {}) {
    const input = isPlainObject(value) ? value : {};
    return {
        catalogIds: normalizeCatalogIds(input.catalogIds || input.catalog_ids || DEFAULT_COMMERCIAL_CONFIG.catalogIds),
        brandPositioning: normalizeBrandPositioning(input.brandPositioning || input.brand_positioning || DEFAULT_COMMERCIAL_CONFIG.brandPositioning),
        categories: normalizeCategories(input.categories || DEFAULT_COMMERCIAL_CONFIG.categories),
        synonyms: normalizeSynonyms(input.synonyms || DEFAULT_COMMERCIAL_CONFIG.synonyms),
        productRoles: normalizeProductRoles(input.productRoles || input.product_roles || DEFAULT_COMMERCIAL_CONFIG.productRoles),
        playbooks: normalizePlaybooks(input.playbooks || DEFAULT_COMMERCIAL_CONFIG.playbooks),
        offerRules: normalizeOfferRules(input.offerRules || input.offer_rules || DEFAULT_COMMERCIAL_CONFIG.offerRules),
        closingRules: normalizeClosingRules(input.closingRules || input.closing_rules || DEFAULT_COMMERCIAL_CONFIG.closingRules)
    };
}

function profileFromRow(row = {}) {
    const config = normalizeConfig(row.config);
    return {
        profileId: normalizeProfileId(row.profile_id || row.profileId),
        tenantId: normalizeTenant(row.tenant_id || row.tenantId),
        name: toText(row.name) || 'Perfil comercial',
        description: toText(row.description),
        isDefault: row.is_default === true || row.isDefault === true,
        isActive: row.is_active !== false && row.isActive !== false,
        config,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : (row.createdAt || null),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : (row.updatedAt || null)
    };
}

function normalizeProfilePayload(tenantId, profileId, data = {}) {
    const input = isPlainObject(data) ? data : {};
    return {
        profileId: normalizeProfileId(profileId || input.profileId || input.profile_id || ''),
        tenantId: normalizeTenant(tenantId || input.tenantId || input.tenant_id),
        name: toText(input.name) || 'Perfil comercial',
        description: toText(input.description),
        isDefault: input.isDefault === true || input.is_default === true,
        isActive: input.isActive !== false && input.is_active !== false,
        config: normalizeConfig(input.config || {})
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaReadyPromise) return schemaReadyPromise;
    schemaReadyPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_commercial_profiles (
                profile_id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT,
                is_default BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                config JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_commercial_profiles_tenant
              ON tenant_commercial_profiles(tenant_id, is_active)
        `);
    })();
    try {
        await schemaReadyPromise;
    } catch (error) {
        schemaReadyPromise = null;
        throw error;
    }
    return schemaReadyPromise;
}

async function readFileStore(tenantId) {
    const cleanTenantId = normalizeTenant(tenantId);
    const parsed = await readTenantJsonFile(COMMERCIAL_PROFILES_FILE, {
        tenantId: cleanTenantId,
        defaultValue: { profiles: [] }
    });
    return {
        profiles: ensureArray(parsed?.profiles)
            .map((entry) => profileFromRow({ ...entry, tenantId: cleanTenantId }))
            .filter((entry) => entry.profileId)
    };
}

async function writeFileStore(tenantId, profiles = []) {
    const cleanTenantId = normalizeTenant(tenantId);
    await writeTenantJsonFile(COMMERCIAL_PROFILES_FILE, {
        profiles: ensureArray(profiles).map((profile) => profileFromRow({ ...profile, tenantId: cleanTenantId }))
    }, { tenantId: cleanTenantId });
}

async function clearOtherDefaultsPostgres(tenantId, profileId) {
    await queryPostgres(
        `UPDATE tenant_commercial_profiles
            SET is_default = FALSE,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND profile_id <> $2`,
        [tenantId, profileId]
    );
}

async function listProfiles(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenant(tenantId);
    if (getStorageDriver() !== 'postgres') {
        const store = await readFileStore(cleanTenantId);
        return store.profiles
            .filter((profile) => profile.isActive)
            .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    }
    try {
        await ensurePostgresSchema();
        const { rows } = await queryPostgres(
            `SELECT profile_id, tenant_id, name, description, is_default, is_active, config, created_at, updated_at
               FROM tenant_commercial_profiles
              WHERE tenant_id = $1
                AND is_active = TRUE
              ORDER BY is_default DESC, created_at ASC`,
            [cleanTenantId]
        );
        return (Array.isArray(rows) ? rows : []).map(profileFromRow);
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

async function getProfile(tenantId = DEFAULT_TENANT_ID, profileId = '') {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanProfileId = normalizeProfileId(profileId);
    if (!cleanProfileId) return null;
    if (getStorageDriver() !== 'postgres') {
        const store = await readFileStore(cleanTenantId);
        return store.profiles.find((profile) => profile.profileId === cleanProfileId) || null;
    }
    try {
        await ensurePostgresSchema();
        const { rows } = await queryPostgres(
            `SELECT profile_id, tenant_id, name, description, is_default, is_active, config, created_at, updated_at
               FROM tenant_commercial_profiles
              WHERE tenant_id = $1
                AND profile_id = $2
              LIMIT 1`,
            [cleanTenantId, cleanProfileId]
        );
        return rows?.[0] ? profileFromRow(rows[0]) : null;
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function getDefaultProfile(tenantId = DEFAULT_TENANT_ID) {
    const cleanTenantId = normalizeTenant(tenantId);
    if (getStorageDriver() !== 'postgres') {
        const store = await readFileStore(cleanTenantId);
        return store.profiles.find((profile) => profile.isActive && profile.isDefault) || null;
    }
    try {
        await ensurePostgresSchema();
        const { rows } = await queryPostgres(
            `SELECT profile_id, tenant_id, name, description, is_default, is_active, config, created_at, updated_at
               FROM tenant_commercial_profiles
              WHERE tenant_id = $1
                AND is_default = TRUE
                AND is_active = TRUE
              ORDER BY created_at ASC
              LIMIT 1`,
            [cleanTenantId]
        );
        return rows?.[0] ? profileFromRow(rows[0]) : null;
    } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
    }
}

async function upsertProfile(tenantId = DEFAULT_TENANT_ID, profileId = '', data = {}) {
    const profile = normalizeProfilePayload(tenantId, profileId, data);
    if (!profile.profileId) throw new Error('profileId requerido.');
    if (getStorageDriver() !== 'postgres') {
        const store = await readFileStore(profile.tenantId);
        const now = new Date().toISOString();
        const existing = store.profiles.find((entry) => entry.profileId === profile.profileId);
        const nextProfile = {
            ...profile,
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
        const nextProfiles = store.profiles
            .filter((entry) => entry.profileId !== profile.profileId)
            .map((entry) => (profile.isDefault ? { ...entry, isDefault: false } : entry));
        nextProfiles.push(nextProfile);
        await writeFileStore(profile.tenantId, nextProfiles);
        return nextProfile;
    }
    await ensurePostgresSchema();
    if (profile.isDefault) await clearOtherDefaultsPostgres(profile.tenantId, profile.profileId);
    const { rows } = await queryPostgres(
        `INSERT INTO tenant_commercial_profiles (
            profile_id, tenant_id, name, description, is_default, is_active, config, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
         ON CONFLICT (profile_id)
         DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_default = EXCLUDED.is_default,
            is_active = EXCLUDED.is_active,
            config = EXCLUDED.config,
            updated_at = NOW()
         RETURNING profile_id, tenant_id, name, description, is_default, is_active, config, created_at, updated_at`,
        [
            profile.profileId,
            profile.tenantId,
            profile.name,
            profile.description,
            profile.isDefault,
            profile.isActive,
            JSON.stringify(profile.config)
        ]
    );
    return profileFromRow(rows[0]);
}

async function patchProfileSection(tenantId = DEFAULT_TENANT_ID, profileId = '', section = '', sectionData = null) {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanProfileId = normalizeProfileId(profileId);
    const cleanSection = toText(section);
    if (!cleanProfileId) throw new Error('profileId requerido.');
    if (!cleanSection) throw new Error('section requerida.');

    const current = await getProfile(cleanTenantId, cleanProfileId);
    if (!current) return null;
    const nextConfig = normalizeConfig({
        ...current.config,
        [cleanSection]: sectionData
    });

    if (getStorageDriver() !== 'postgres') {
        return upsertProfile(cleanTenantId, cleanProfileId, {
            ...current,
            config: nextConfig
        });
    }
    const { rows } = await queryPostgres(
        `UPDATE tenant_commercial_profiles
            SET config = $3::jsonb,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND profile_id = $2
          RETURNING profile_id, tenant_id, name, description, is_default, is_active, config, created_at, updated_at`,
        [cleanTenantId, cleanProfileId, JSON.stringify(nextConfig)]
    );
    return rows?.[0] ? profileFromRow(rows[0]) : null;
}

async function deleteProfile(tenantId = DEFAULT_TENANT_ID, profileId = '') {
    const cleanTenantId = normalizeTenant(tenantId);
    const cleanProfileId = normalizeProfileId(profileId);
    if (!cleanProfileId) return null;
    if (getStorageDriver() !== 'postgres') {
        const store = await readFileStore(cleanTenantId);
        const next = store.profiles.map((profile) => (
            profile.profileId === cleanProfileId
                ? { ...profile, isActive: false, updatedAt: new Date().toISOString() }
                : profile
        ));
        await writeFileStore(cleanTenantId, next);
        return next.find((profile) => profile.profileId === cleanProfileId) || null;
    }
    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `UPDATE tenant_commercial_profiles
            SET is_active = FALSE,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND profile_id = $2
          RETURNING profile_id, tenant_id, name, description, is_default, is_active, config, created_at, updated_at`,
        [cleanTenantId, cleanProfileId]
    );
    return rows?.[0] ? profileFromRow(rows[0]) : null;
}

async function resolveProfileForRead(tenantId, profileId = '') {
    const cleanProfileId = normalizeProfileId(profileId);
    if (cleanProfileId) return getProfile(tenantId, cleanProfileId);
    return getDefaultProfile(tenantId);
}

async function resolveProductRole(tenantId = DEFAULT_TENANT_ID, sku = '', profileId = '') {
    const profile = await resolveProfileForRead(tenantId, profileId);
    const cleanSku = toText(sku).toUpperCase();
    if (!profile || !cleanSku) return null;
    return profile.config.productRoles?.[cleanSku] || null;
}

async function resolveSynonym(tenantId = DEFAULT_TENANT_ID, term = '', profileId = '') {
    const profile = await resolveProfileForRead(tenantId, profileId);
    const cleanTerm = normalizeLookup(term);
    if (!profile || !cleanTerm) return null;
    return profile.config.synonyms.find((entry) => normalizeLookup(entry.term) === cleanTerm) || null;
}

function getWooMetadata(metadata = {}) {
    const safe = isPlainObject(metadata) ? metadata : {};
    return isPlainObject(safe.woo) ? safe.woo : {};
}

function normalizeWooCategoryEntry(entry = null) {
    if (isPlainObject(entry)) {
        const name = toText(entry.name || entry.label || entry.slug || entry.id);
        if (!name) return null;
        return {
            id: entry.id ?? entry.term_id ?? null,
            name,
            slug: toText(entry.slug || normalizeProfileId(name))
        };
    }
    const name = toText(entry);
    if (!name) return null;
    return {
        id: null,
        name,
        slug: normalizeProfileId(name)
    };
}

function normalizeWooCategoriesForCatalog(...sources) {
    const seen = new Set();
    return sources
        .flatMap((source) => ensureArray(source))
        .map(normalizeWooCategoryEntry)
        .filter(Boolean)
        .filter((category) => {
            const key = normalizeLookup(category.slug || category.name);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function catalogRowToCommercialProduct(row = {}, productRoles = {}) {
    const itemId = toText(row.item_id || row.id).toUpperCase();
    const metadata = isPlainObject(row.metadata) ? row.metadata : {};
    const woo = getWooMetadata(metadata);
    const relatedSkus = normalizeStringArray(woo.relatedSkus);
    const upsellSkus = normalizeStringArray(woo.upsellSkus);
    const crossSellSkus = normalizeStringArray(woo.crossSellSkus);
    const wooCategories = normalizeWooCategoriesForCatalog(
        woo.wooCategories,
        metadata.wooCategories,
        metadata.categories
    );
    return {
        itemId,
        title: toText(row.title),
        price: row.price ?? '',
        imageUrl: row.image_url || row.imageUrl || null,
        catalogId: toText(row.catalog_id || row.catalogId).toUpperCase(),
        wooCategories,
        wooTags: ensureArray(woo.tags || metadata.tags),
        relatedSkus,
        upsellSkus,
        crossSellSkus,
        assignedRole: productRoles[itemId] || null,
        hasWooSuggestions: relatedSkus.length > 0 || upsellSkus.length > 0 || crossSellSkus.length > 0,
        metadata
    };
}

async function getCatalogWithRoles(tenantId = DEFAULT_TENANT_ID, profileId = '') {
    const cleanTenantId = normalizeTenant(tenantId);
    const profile = await resolveProfileForRead(cleanTenantId, profileId);
    const productRoles = profile?.config?.productRoles || {};
    const catalogIds = normalizeCatalogIds(profile?.config?.catalogIds || []);
    if (getStorageDriver() !== 'postgres') {
        const catalog = await catalogManagerService.loadCatalog({ tenantId: cleanTenantId });
        const filteredCatalog = catalogIds.length
            ? catalog.filter((item) => catalogIds.includes(toText(item?.catalogId).toUpperCase()))
            : catalog;
        return filteredCatalog.map((item) => catalogRowToCommercialProduct({
            id: item.id,
            catalogId: item.catalogId,
            title: item.title,
            price: item.price,
            imageUrl: item.imageUrl,
            metadata: item.metadata
        }, productRoles));
    }
    try {
        const params = [cleanTenantId];
        const catalogFilter = catalogIds.length ? 'AND UPPER(catalog_id) = ANY($2::text[])' : '';
        if (catalogIds.length) params.push(catalogIds);
        const { rows } = await queryPostgres(
            `SELECT item_id, catalog_id, title, price, image_url, metadata
               FROM catalog_items
              WHERE tenant_id = $1
                ${catalogFilter}
              ORDER BY title ASC, item_id ASC`,
            params
        );
        return (Array.isArray(rows) ? rows : []).map((row) => catalogRowToCommercialProduct(row, productRoles));
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

module.exports = {
    DEFAULT_COMMERCIAL_CONFIG,
    listProfiles,
    getProfile,
    getDefaultProfile,
    upsertProfile,
    patchProfileSection,
    deleteProfile,
    resolveProductRole,
    resolveSynonym,
    getCatalogWithRoles
};
