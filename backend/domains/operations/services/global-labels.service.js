const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('../../../config/persistence-runtime');

const STORE_FILE = 'global_labels.json';
const DEFAULT_COLOR = '#00A884';
const DEFAULT_GLOBAL_LABELS = Object.freeze([
    {
        id: 'NUEVO',
        name: 'Nuevo',
        color: '#7D8D95',
        description: 'Etiqueta comercial predeterminada para clientes nuevos.',
        commercialStatusKey: 'nuevo',
        sortOrder: 1,
        isActive: true
    },
    {
        id: 'EN_CONVERSACION',
        name: 'En conversacion',
        color: '#34B7F1',
        description: 'Etiqueta comercial predeterminada para conversaciones activas.',
        commercialStatusKey: 'en_conversacion',
        sortOrder: 2,
        isActive: true
    },
    {
        id: 'COTIZADO',
        name: 'Cotizado',
        color: '#FFB02E',
        description: 'Etiqueta comercial predeterminada para clientes cotizados.',
        commercialStatusKey: 'cotizado',
        sortOrder: 3,
        isActive: true
    },
    {
        id: 'VENDIDO',
        name: 'Vendido',
        color: '#00A884',
        description: 'Etiqueta comercial predeterminada para ventas cerradas.',
        commercialStatusKey: 'vendido',
        sortOrder: 4,
        isActive: true
    },
    {
        id: 'PERDIDO',
        name: 'Perdido',
        color: '#FF5C5C',
        description: 'Etiqueta comercial predeterminada para oportunidades perdidas.',
        commercialStatusKey: 'perdido',
        sortOrder: 5,
        isActive: true
    }
]);
const DEFAULT_GLOBAL_LABEL_IDS = new Set(DEFAULT_GLOBAL_LABELS.map((entry) => entry.id));

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

function isDefaultGlobalLabelId(id = '') {
    return DEFAULT_GLOBAL_LABEL_IDS.has(normalizeId(id));
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function seedFromExistingTenantLabelsIfEmpty() {
    if (getStorageDriver() !== 'postgres') return;

    try {
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

async function ensureDefaultGlobalLabels() {
    if (getStorageDriver() !== 'postgres') {
        const store = await readStore();
        let changed = false;
        const existingIds = new Set(store.items.map((item) => normalizeId(item.id)).filter(Boolean));
        DEFAULT_GLOBAL_LABELS.forEach((defaultLabel) => {
            if (existingIds.has(defaultLabel.id)) return;
            store.items.push({
                ...defaultLabel,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            changed = true;
        });
        if (changed) await writeStore(store);
        return;
    }

    await queryPostgres(
        `INSERT INTO global_labels (
            id, name, color, description, commercial_status_key, sort_order, is_active, created_at, updated_at
        ) VALUES
            ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW()),
            ($7, $8, $9, $10, $11, $12, TRUE, NOW(), NOW()),
            ($13, $14, $15, $16, $17, $18, TRUE, NOW(), NOW()),
            ($19, $20, $21, $22, $23, $24, TRUE, NOW(), NOW()),
            ($25, $26, $27, $28, $29, $30, TRUE, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        DEFAULT_GLOBAL_LABELS.flatMap((entry) => [
            entry.id,
            entry.name,
            entry.color,
            entry.description,
            entry.commercialStatusKey,
            entry.sortOrder
        ])
    );
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
        await ensureDefaultGlobalLabels();
        const store = await readStore();
        return store.items
            .filter((item) => includeInactive || item.isActive !== false)
            .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name), 'es'));
    }

    try {
        await ensurePostgresSchema();
        await ensureDefaultGlobalLabels();
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
    const isDefault = isDefaultGlobalLabelId(id);
    const defaultLabel = isDefault ? DEFAULT_GLOBAL_LABELS.find((entry) => entry.id === id) : null;

    if (getStorageDriver() !== 'postgres') {
        await ensureDefaultGlobalLabels();
        const store = await readStore();
        const index = store.items.findIndex((item) => item.id === id);
        const previous = index >= 0 ? store.items[index] : null;
        const next = {
            ...clean,
            id,
            commercialStatusKey: isDefault ? defaultLabel?.commercialStatusKey : clean.commercialStatusKey,
            isActive: isDefault ? true : clean.isActive,
            createdAt: previous?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (index >= 0) store.items[index] = next;
        else store.items.push(next);
        await writeStore(store);
        return next;
    }

    await ensurePostgresSchema();
    await ensureDefaultGlobalLabels();
    await queryPostgres(
        `INSERT INTO global_labels (
            id, name, color, description, commercial_status_key, sort_order, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (id)
        DO UPDATE SET
            name = EXCLUDED.name,
            color = EXCLUDED.color,
            description = EXCLUDED.description,
            commercial_status_key = CASE
                WHEN global_labels.id IN ('NUEVO', 'EN_CONVERSACION', 'COTIZADO', 'VENDIDO', 'PERDIDO') THEN global_labels.commercial_status_key
                ELSE EXCLUDED.commercial_status_key
            END,
            sort_order = EXCLUDED.sort_order,
            is_active = CASE
                WHEN global_labels.id IN ('NUEVO', 'EN_CONVERSACION', 'COTIZADO', 'VENDIDO', 'PERDIDO') THEN TRUE
                ELSE EXCLUDED.is_active
            END,
            updated_at = NOW()`,
        [
            id,
            clean.name,
            clean.color,
            clean.description || null,
            isDefault ? defaultLabel?.commercialStatusKey : clean.commercialStatusKey || null,
            clean.sortOrder,
            isDefault ? true : clean.isActive !== false
        ]
    );
    const items = await listLabels({ includeInactive: true });
    return items.find((item) => item.id === id) || null;
}

async function deleteLabel(id = '') {
    const cleanId = normalizeId(id);
    if (!cleanId) throw new Error('id invalido.');
    if (isDefaultGlobalLabelId(cleanId)) {
        throw new Error('Las etiquetas globales predeterminadas no se pueden eliminar.');
    }

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
