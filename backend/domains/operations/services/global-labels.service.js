const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');

const STORE_FILE = 'global_labels.json';
const DEFAULT_COLOR = '#00A884';

let schemaPromise = null;

function toText(value = '') {
    return String(value || '').trim();
}

function normalizeColor(value = '', fallback = DEFAULT_COLOR) {
    const raw = toText(value).toUpperCase();
    if (/^#([0-9A-F]{6})$/.test(raw)) return raw;
    if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
    return fallback;
}

function normalizeId(value = '') {
    return toText(value).toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
}

function createId() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `GLB-${stamp}${rand}`;
}

function normalizeSortOrder(value, fallback = 1000) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

function sanitizeLabel(source = {}) {
    const input = source && typeof source === 'object' ? source : {};
    const id = normalizeId(input.id || input.labelId || '');
    const name = toText(input.name || input.label || '');
    return {
        id,
        name,
        color: normalizeColor(input.color),
        description: toText(input.description || ''),
        commercialStatusKey: toText(input.commercialStatusKey || input.commercial_status_key || '').toLowerCase(),
        sortOrder: normalizeSortOrder(input.sortOrder ?? input.sort_order, 1000),
        isActive: input.isActive !== false && input.is_active !== false,
        createdAt: input.createdAt || input.created_at || null,
        updatedAt: input.updatedAt || input.updated_at || null
    };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function seedFromExistingTenantLabelsIfEmpty() {
    if (getStorageDriver() !== 'postgres') return;

    try {
        const { rows: countRows } = await queryPostgres('SELECT COUNT(*)::int AS total FROM global_labels');
        const total = Number(countRows?.[0]?.total || 0);
        if (total > 0) return;

        await queryPostgres(`
            INSERT INTO global_labels (
                id,
                name,
                color,
                description,
                commercial_status_key,
                sort_order,
                is_active,
                created_at,
                updated_at
            )
            SELECT DISTINCT ON (UPPER(label_id))
                UPPER(label_id) AS id,
                name,
                color,
                description,
                NULL AS commercial_status_key,
                sort_order,
                is_active,
                NOW(),
                NOW()
              FROM tenant_labels
             WHERE COALESCE(BTRIM(label_id), '') <> ''
               AND COALESCE(BTRIM(name), '') <> ''
             ORDER BY UPPER(label_id), is_active DESC, sort_order ASC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
            ON CONFLICT (id) DO NOTHING
        `);
    } catch (error) {
        if (missingRelation(error)) return;
        throw error;
    }
}

async function ensurePostgresSchema() {
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS global_labels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#00A884',
                description TEXT NULL,
                commercial_status_key TEXT NULL,
                sort_order INTEGER NOT NULL DEFAULT 1000,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
    })();
    try {
        await schemaPromise;
    } catch (error) {
        schemaPromise = null;
        throw error;
    }
}

async function readStore() {
    const parsed = await readTenantJsonFile(STORE_FILE, {
        tenantId: DEFAULT_TENANT_ID,
        defaultValue: { items: [] }
    });
    const items = Array.isArray(parsed?.items) ? parsed.items.map(sanitizeLabel).filter((item) => item.id && item.name) : [];
    return { items };
}

async function writeStore(store = { items: [] }) {
    await writeTenantJsonFile(STORE_FILE, {
        items: Array.isArray(store?.items) ? store.items.map(sanitizeLabel).filter((item) => item.id && item.name) : []
    }, { tenantId: DEFAULT_TENANT_ID });
}

async function listLabels(options = {}) {
    const includeInactive = options?.includeInactive === true;
    if (getStorageDriver() !== 'postgres') {
        const store = await readStore();
        return store.items
            .filter((item) => includeInactive || item.isActive !== false)
            .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name), 'es'));
    }

    try {
        await ensurePostgresSchema();
        await seedFromExistingTenantLabelsIfEmpty();
        const where = includeInactive ? '' : 'WHERE is_active = TRUE';
        const { rows } = await queryPostgres(
            `SELECT id, name, color, description, commercial_status_key, sort_order, is_active, created_at, updated_at
               FROM global_labels
               ${where}
              ORDER BY sort_order ASC, name ASC`
        );
        return (Array.isArray(rows) ? rows : []).map(sanitizeLabel);
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

async function saveLabel(payload = {}) {
    const clean = sanitizeLabel(payload);
    const id = clean.id || createId();
    if (!clean.name) throw new Error('Nombre de etiqueta requerido.');

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore();
        const index = store.items.findIndex((item) => item.id === id);
        const previous = index >= 0 ? store.items[index] : null;
        const next = {
            ...clean,
            id,
            createdAt: previous?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (index >= 0) store.items[index] = next;
        else store.items.push(next);
        await writeStore(store);
        return next;
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO global_labels (
            id, name, color, description, commercial_status_key, sort_order, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (id)
        DO UPDATE SET
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            description = EXCLUDED.description,
            commercial_status_key = EXCLUDED.commercial_status_key,
            sort_order = EXCLUDED.sort_order,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()`,
        [id, clean.name, clean.color, clean.description || null, clean.commercialStatusKey || null, clean.sortOrder, clean.isActive !== false]
    );
    const items = await listLabels({ includeInactive: true });
    return items.find((item) => item.id === id) || null;
}

async function deleteLabel(id = '') {
    const cleanId = normalizeId(id);
    if (!cleanId) throw new Error('id invalido.');

    if (getStorageDriver() !== 'postgres') {
        const store = await readStore();
        const index = store.items.findIndex((item) => item.id === cleanId);
        if (index < 0) return { id: cleanId, deleted: false };
        store.items.splice(index, 1);
        await writeStore(store);
        return { id: cleanId, deleted: true };
    }

    await ensurePostgresSchema();
    const result = await queryPostgres('DELETE FROM global_labels WHERE id = $1', [cleanId]);
    return { id: cleanId, deleted: Number(result?.rowCount || 0) > 0 };
}

module.exports = {
    listLabels,
    saveLabel,
    deleteLabel,
    sanitizeLabel
};
