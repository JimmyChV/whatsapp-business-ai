const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');

const FILE_NAME = 'saas_user_ui_preferences.json';

let schemaReady = false;
let schemaPromise = null;

function toText(value = '') {
    return String(value ?? '').trim();
}

function normalizeUserId(value = '') {
    return toText(value) || 'anonymous';
}

function normalizeSectionKey(value = '') {
    const normalized = toText(value).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
    return /^[a-z0-9_]{1,80}$/.test(normalized) ? normalized : 'default';
}

function resolveTenantId(value = '') {
    const raw = toText(value);
    return raw ? normalizeTenantId(raw) : DEFAULT_TENANT_ID;
}

function normalizePreferences(value = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...value };
}

function preferenceKey({ userId, tenantId, sectionKey }) {
    return `${normalizeUserId(userId)}::${resolveTenantId(tenantId)}::${normalizeSectionKey(sectionKey)}`;
}

function publicPreference(row = {}) {
    const preferences = normalizePreferences(row.preferencesJson || row.preferences_json || row.preferences || {});
    return {
        userId: normalizeUserId(row.userId || row.user_id || ''),
        tenantId: resolveTenantId(row.tenantId || row.tenant_id || ''),
        sectionKey: normalizeSectionKey(row.sectionKey || row.section_key || ''),
        preferencesJson: preferences,
        updatedAt: toText(row.updatedAt || row.updated_at || '') || null
    };
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS saas_user_ui_preferences (
                preference_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                tenant_id TEXT,
                section_key TEXT NOT NULL,
                preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, tenant_id, section_key)
            )`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_saas_user_ui_preferences_user
             ON saas_user_ui_preferences(user_id, tenant_id, section_key)`
        );
        schemaReady = true;
        schemaPromise = null;
    })();
    return schemaPromise;
}

function normalizeFileStore(value = null) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const items = Array.isArray(source.items) ? source.items : [];
    return {
        items: items.map(publicPreference).filter((item) => item.userId && item.sectionKey)
    };
}

async function getPreference({ userId, tenantId, sectionKey } = {}) {
    const normalized = {
        userId: normalizeUserId(userId),
        tenantId: resolveTenantId(tenantId),
        sectionKey: normalizeSectionKey(sectionKey)
    };

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(normalized.tenantId, FILE_NAME, { items: [] }));
        const key = preferenceKey(normalized);
        const item = store.items.find((entry) => preferenceKey(entry) === key);
        return item || { ...normalized, preferencesJson: {}, updatedAt: null };
    }

    await ensurePostgresSchema();
    const { rows } = await queryPostgres(
        `SELECT user_id, tenant_id, section_key, preferences_json, updated_at
         FROM saas_user_ui_preferences
         WHERE user_id = $1 AND tenant_id = $2 AND section_key = $3
         LIMIT 1`,
        [normalized.userId, normalized.tenantId, normalized.sectionKey]
    );
    return rows[0]
        ? publicPreference(rows[0])
        : { ...normalized, preferencesJson: {}, updatedAt: null };
}

async function savePreference({ userId, tenantId, sectionKey, preferencesJson } = {}) {
    const normalized = {
        userId: normalizeUserId(userId),
        tenantId: resolveTenantId(tenantId),
        sectionKey: normalizeSectionKey(sectionKey),
        preferencesJson: normalizePreferences(preferencesJson)
    };
    const now = new Date().toISOString();

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(normalized.tenantId, FILE_NAME, { items: [] }));
        const key = preferenceKey(normalized);
        const nextItem = { ...normalized, updatedAt: now };
        const items = store.items.filter((entry) => preferenceKey(entry) !== key);
        items.push(nextItem);
        await writeTenantJsonFile(normalized.tenantId, FILE_NAME, { items });
        return nextItem;
    }

    await ensurePostgresSchema();
    const preferenceId = `pref_${Buffer.from(preferenceKey(normalized)).toString('hex').slice(0, 48)}`;
    const { rows } = await queryPostgres(
        `INSERT INTO saas_user_ui_preferences (
            preference_id, user_id, tenant_id, section_key, preferences_json, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
        ON CONFLICT (user_id, tenant_id, section_key)
        DO UPDATE SET preferences_json = EXCLUDED.preferences_json, updated_at = NOW()
        RETURNING user_id, tenant_id, section_key, preferences_json, updated_at`,
        [
            preferenceId,
            normalized.userId,
            normalized.tenantId,
            normalized.sectionKey,
            JSON.stringify(normalized.preferencesJson)
        ]
    );
    return publicPreference(rows[0] || normalized);
}

module.exports = {
    getPreference,
    savePreference,
    normalizeSectionKey
};
