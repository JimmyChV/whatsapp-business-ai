const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('./persistence_runtime');

const LABELS_FILE = 'tenant_labels.json';
const DEFAULT_COLOR = '#00A884';
const COLOR_FALLBACKS = [
    '#00A884',
    '#25D366',
    '#34B7F1',
    '#3C9AFF',
    '#FFB02E',
    '#FF5C5C',
    '#9C6BFF',
    '#7D8D95'
];

let schemaReady = false;
let schemaPromise = null;

function resolveTenantId(input = null) {
    if (typeof input === 'string') return normalizeTenantId(input || DEFAULT_TENANT_ID);
    if (input && typeof input === 'object') return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    return DEFAULT_TENANT_ID;
}

function normalizeLabelId(value = '') {
    return String(value || '').trim().toUpperCase();
}

function normalizeChatId(value = '') {
    return String(value || '').trim();
}

function normalizeScopeModuleId(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeSortOrder(value, fallback = 1000) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, parsed);
}

function normalizeColor(value = '', fallback = DEFAULT_COLOR) {
    const raw = String(value || '').trim().toUpperCase();
    if (/^#([0-9A-F]{6})$/.test(raw)) return raw;
    if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
    return String(fallback || DEFAULT_COLOR).trim().toUpperCase() || DEFAULT_COLOR;
}

function sanitizeLabel(input = {}, { fallbackColor = DEFAULT_COLOR } = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const labelId = normalizeLabelId(source.labelId || source.id || '');
    const name = String(source.name || source.label || '').trim();
    const description = String(source.description || '').trim();
    const color = normalizeColor(source.color || source.hex || '', fallbackColor);
    const isActive = source.isActive !== false;
    const sortOrder = normalizeSortOrder(source.sortOrder, 1000);
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? { ...source.metadata }
        : {};

    return {
        labelId,
        name,
        description,
        color,
        isActive,
        sortOrder,
        metadata
    };
}

function createId(prefix = 'LBL') {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${String(prefix || 'ID').trim().toUpperCase()}-${stamp}${rand}`;
}

function assignmentKey(chatId = '', scopeModuleId = '') {
    return `${normalizeChatId(chatId)}::${normalizeScopeModuleId(scopeModuleId)}`;
}

function normalizeFileStore(value = null) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const labels = Array.isArray(source.labels)
        ? source.labels
            .map((entry, idx) => sanitizeLabel(entry, { fallbackColor: COLOR_FALLBACKS[idx % COLOR_FALLBACKS.length] }))
            .filter((entry) => entry.labelId && entry.name)
        : [];
    const assignments = Array.isArray(source.assignments)
        ? source.assignments
            .map((entry) => ({
                chatId: normalizeChatId(entry?.chatId || ''),
                scopeModuleId: normalizeScopeModuleId(entry?.scopeModuleId || ''),
                labelId: normalizeLabelId(entry?.labelId || ''),
                createdAt: String(entry?.createdAt || '').trim() || new Date().toISOString()
            }))
            .filter((entry) => entry.chatId && entry.labelId)
        : [];
    return { labels, assignments };
}

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS tenant_labels (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                label_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT NOT NULL DEFAULT '#00A884',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INTEGER NOT NULL DEFAULT 1000,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, label_id)
            )`
        );
        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS tenant_chat_labels (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                chat_id TEXT NOT NULL,
                scope_module_id TEXT NOT NULL DEFAULT '',
                label_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, chat_id, scope_module_id, label_id),
                FOREIGN KEY (tenant_id, label_id)
                    REFERENCES tenant_labels(tenant_id, label_id)
                    ON DELETE CASCADE
            )`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_tenant_labels_active
             ON tenant_labels(tenant_id, is_active DESC, sort_order ASC, created_at DESC)`
        );
        await queryPostgres(
            `CREATE INDEX IF NOT EXISTS idx_tenant_chat_labels_chat
             ON tenant_chat_labels(tenant_id, chat_id, scope_module_id, created_at DESC)`
        );

        schemaReady = true;
        schemaPromise = null;
    })();

    return schemaPromise;
}

async function listLabels(options = {}) {
    const tenantId = resolveTenantId(options);
    const includeInactive = options?.includeInactive === true;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(LABELS_FILE, { tenantId, defaultValue: {} }));
        return store.labels
            .filter((entry) => includeInactive || entry.isActive !== false)
            .sort((left, right) => {
                const sortDelta = normalizeSortOrder(left.sortOrder, 1000) - normalizeSortOrder(right.sortOrder, 1000);
                if (sortDelta !== 0) return sortDelta;
                return String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' });
            });
    }

    try {
        await ensurePostgresSchema();
        const params = [tenantId];
        let where = 'WHERE tenant_id = $1';
        if (!includeInactive) where += ' AND is_active = TRUE';

        const { rows } = await queryPostgres(
            `SELECT label_id, name, description, color, is_active, sort_order, metadata, created_at, updated_at
               FROM tenant_labels
               ${where}
              ORDER BY sort_order ASC, created_at DESC`,
            params
        );

        return (Array.isArray(rows) ? rows : []).map((row) => ({
            labelId: normalizeLabelId(row.label_id),
            name: String(row.name || '').trim() || normalizeLabelId(row.label_id),
            description: String(row.description || '').trim() || '',
            color: normalizeColor(row.color, DEFAULT_COLOR),
            isActive: row.is_active !== false,
            sortOrder: normalizeSortOrder(row.sort_order, 1000),
            metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        }));
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

async function saveLabel(payload = {}, options = {}) {
    const tenantId = resolveTenantId(options);
    const existingId = normalizeLabelId(payload.labelId || payload.id || '');
    const fallbackColor = COLOR_FALLBACKS[Math.floor(Math.random() * COLOR_FALLBACKS.length)] || DEFAULT_COLOR;
    const clean = sanitizeLabel(payload, { fallbackColor });
    const labelId = existingId || createId('LBL');

    if (!clean.name) throw new Error('Nombre de etiqueta requerido.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(LABELS_FILE, { tenantId, defaultValue: {} }));
        const index = store.labels.findIndex((entry) => normalizeLabelId(entry.labelId) === labelId);
        const previous = index >= 0 ? store.labels[index] : null;
        const next = {
            ...clean,
            labelId,
            createdAt: previous?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (index >= 0) store.labels[index] = next;
        else store.labels.push(next);
        await writeTenantJsonFile(LABELS_FILE, store, { tenantId });
        return next;
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO tenant_labels (
            tenant_id, label_id, name, description, color, is_active, sort_order, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
        ON CONFLICT (tenant_id, label_id)
        DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            color = EXCLUDED.color,
            is_active = EXCLUDED.is_active,
            sort_order = EXCLUDED.sort_order,
            metadata = COALESCE(tenant_labels.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
            updated_at = NOW()`,
        [
            tenantId,
            labelId,
            clean.name,
            clean.description || null,
            clean.color,
            clean.isActive,
            clean.sortOrder,
            JSON.stringify(clean.metadata || {})
        ]
    );

    const items = await listLabels({ tenantId, includeInactive: true });
    return items.find((entry) => normalizeLabelId(entry.labelId) === labelId) || null;
}

async function deactivateLabel(labelId = '', options = {}) {
    const tenantId = resolveTenantId(options);
    const cleanLabelId = normalizeLabelId(labelId);
    if (!cleanLabelId) throw new Error('labelId invalido.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(LABELS_FILE, { tenantId, defaultValue: {} }));
        const index = store.labels.findIndex((entry) => normalizeLabelId(entry.labelId) === cleanLabelId);
        if (index < 0) throw new Error('Etiqueta no encontrada.');
        store.labels[index] = {
            ...store.labels[index],
            isActive: false,
            updatedAt: new Date().toISOString()
        };
        await writeTenantJsonFile(LABELS_FILE, store, { tenantId });
        return { labelId: cleanLabelId };
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `UPDATE tenant_labels
            SET is_active = FALSE,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND label_id = $2`,
        [tenantId, cleanLabelId]
    );
    return { labelId: cleanLabelId };
}

async function listChatLabels(options = {}) {
    const tenantId = resolveTenantId(options);
    const chatId = normalizeChatId(options?.chatId || '');
    const scopeModuleId = normalizeScopeModuleId(options?.scopeModuleId || '');
    const includeInactive = options?.includeInactive === true;
    if (!chatId) return [];

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(LABELS_FILE, { tenantId, defaultValue: {} }));
        const labelMap = new Map(store.labels.map((entry) => [normalizeLabelId(entry.labelId), entry]));
        return store.assignments
            .filter((entry) => normalizeChatId(entry.chatId) === chatId && normalizeScopeModuleId(entry.scopeModuleId) === scopeModuleId)
            .map((entry) => labelMap.get(normalizeLabelId(entry.labelId)))
            .filter((entry) => entry && (includeInactive || entry.isActive !== false))
            .map((entry) => ({
                id: normalizeLabelId(entry.labelId),
                name: String(entry.name || '').trim(),
                color: normalizeColor(entry.color, DEFAULT_COLOR),
                isActive: entry.isActive !== false
            }));
    }

    await ensurePostgresSchema();
    const params = [tenantId, chatId, scopeModuleId];
    let whereActive = '';
    if (!includeInactive) whereActive = 'AND l.is_active = TRUE';
    const { rows } = await queryPostgres(
        `SELECT l.label_id, l.name, l.color, l.is_active
           FROM tenant_chat_labels cl
           JOIN tenant_labels l
             ON l.tenant_id = cl.tenant_id
            AND l.label_id = cl.label_id
          WHERE cl.tenant_id = $1
            AND cl.chat_id = $2
            AND cl.scope_module_id = $3
            ${whereActive}
          ORDER BY l.sort_order ASC, l.created_at DESC`,
        params
    );
    return (Array.isArray(rows) ? rows : []).map((row) => ({
        id: normalizeLabelId(row.label_id),
        name: String(row.name || '').trim(),
        color: normalizeColor(row.color, DEFAULT_COLOR),
        isActive: row.is_active !== false
    }));
}

async function setChatLabels({ tenantId, chatId = '', scopeModuleId = '', labelIds = [] } = {}) {
    const safeTenantId = resolveTenantId(tenantId);
    const cleanChatId = normalizeChatId(chatId);
    const cleanScope = normalizeScopeModuleId(scopeModuleId);
    if (!cleanChatId) throw new Error('chatId invalido.');

    const availableLabels = await listLabels({ tenantId: safeTenantId, includeInactive: false });
    const availableSet = new Set(availableLabels.map((entry) => normalizeLabelId(entry.labelId)).filter(Boolean));
    const nextIds = Array.from(new Set(
        (Array.isArray(labelIds) ? labelIds : [])
            .map((entry) => normalizeLabelId(entry))
            .filter((entry) => Boolean(entry) && availableSet.has(entry))
    ));

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(LABELS_FILE, { tenantId: safeTenantId, defaultValue: {} }));
        store.assignments = store.assignments
            .filter((entry) => !(normalizeChatId(entry.chatId) === cleanChatId && normalizeScopeModuleId(entry.scopeModuleId) === cleanScope));
        nextIds.forEach((labelId) => {
            store.assignments.push({
                chatId: cleanChatId,
                scopeModuleId: cleanScope,
                labelId,
                createdAt: new Date().toISOString()
            });
        });
        await writeTenantJsonFile(LABELS_FILE, store, { tenantId: safeTenantId });
        return listChatLabels({ tenantId: safeTenantId, chatId: cleanChatId, scopeModuleId: cleanScope });
    }

    await ensurePostgresSchema();
    await queryPostgres(
        `DELETE FROM tenant_chat_labels
          WHERE tenant_id = $1
            AND chat_id = $2
            AND scope_module_id = $3`,
        [safeTenantId, cleanChatId, cleanScope]
    );

    for (const labelId of nextIds) {
        await queryPostgres(
            `INSERT INTO tenant_chat_labels (tenant_id, chat_id, scope_module_id, label_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (tenant_id, chat_id, scope_module_id, label_id) DO NOTHING`,
            [safeTenantId, cleanChatId, cleanScope, labelId]
        );
    }

    return listChatLabels({ tenantId: safeTenantId, chatId: cleanChatId, scopeModuleId: cleanScope });
}

async function listChatLabelsMap({ tenantId, chatKeys = [], includeInactive = false } = {}) {
    const safeTenantId = resolveTenantId(tenantId);
    const cleaned = Array.from(new Set(
        (Array.isArray(chatKeys) ? chatKeys : [])
            .map((entry) => {
                const raw = entry && typeof entry === 'object' ? entry : {};
                const chatId = normalizeChatId(raw.chatId || raw.id || raw.baseChatId || '');
                const scopeModuleId = normalizeScopeModuleId(raw.scopeModuleId || '');
                if (!chatId) return null;
                return assignmentKey(chatId, scopeModuleId);
            })
            .filter(Boolean)
    )).map((key) => {
        const [chatId, scopeModuleId = ''] = String(key || '').split('::');
        return { chatId: normalizeChatId(chatId), scopeModuleId: normalizeScopeModuleId(scopeModuleId) };
    });

    const output = {};
    cleaned.forEach((entry) => {
        output[assignmentKey(entry.chatId, entry.scopeModuleId)] = [];
    });
    if (!cleaned.length) return output;

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(LABELS_FILE, { tenantId: safeTenantId, defaultValue: {} }));
        const labelMap = new Map(
            store.labels
                .filter((entry) => includeInactive || entry.isActive !== false)
                .map((entry) => [normalizeLabelId(entry.labelId), entry])
        );
        const keySet = new Set(cleaned.map((entry) => assignmentKey(entry.chatId, entry.scopeModuleId)));
        store.assignments.forEach((entry) => {
            const key = assignmentKey(entry.chatId, entry.scopeModuleId);
            if (!keySet.has(key)) return;
            const label = labelMap.get(normalizeLabelId(entry.labelId));
            if (!label) return;
            output[key] = output[key] || [];
            output[key].push({
                id: normalizeLabelId(label.labelId),
                name: String(label.name || '').trim(),
                color: normalizeColor(label.color, DEFAULT_COLOR),
                isActive: label.isActive !== false
            });
        });
        return output;
    }

    await ensurePostgresSchema();
    const params = [safeTenantId];
    const clauses = [];
    cleaned.forEach((entry) => {
        params.push(entry.chatId);
        params.push(entry.scopeModuleId);
        clauses.push(`(cl.chat_id = $${params.length - 1} AND cl.scope_module_id = $${params.length})`);
    });

    let activeClause = '';
    if (!includeInactive) activeClause = 'AND l.is_active = TRUE';

    const { rows } = await queryPostgres(
        `SELECT cl.chat_id, cl.scope_module_id, l.label_id, l.name, l.color, l.is_active
           FROM tenant_chat_labels cl
           JOIN tenant_labels l
             ON l.tenant_id = cl.tenant_id
            AND l.label_id = cl.label_id
          WHERE cl.tenant_id = $1
            AND (${clauses.join(' OR ')})
            ${activeClause}
          ORDER BY l.sort_order ASC, l.created_at DESC`,
        params
    );

    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = assignmentKey(row.chat_id, row.scope_module_id);
        output[key] = output[key] || [];
        output[key].push({
            id: normalizeLabelId(row.label_id),
            name: String(row.name || '').trim(),
            color: normalizeColor(row.color, DEFAULT_COLOR),
            isActive: row.is_active !== false
        });
    });

    return output;
}

module.exports = {
    DEFAULT_COLOR,
    normalizeLabelId,
    normalizeScopeModuleId,
    normalizeColor,
    listLabels,
    saveLabel,
    deactivateLabel,
    listChatLabels,
    listChatLabelsMap,
    setChatLabels
};
