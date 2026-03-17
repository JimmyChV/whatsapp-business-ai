
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres,
    readTenantJsonFile,
    writeTenantJsonFile
} = require('./persistence_runtime');

const QUICK_REPLIES_FILE = 'quick_replies.json';
const DEFAULT_LIBRARY_ID = 'QRL-SHARED';
const DEFAULT_LIBRARY_NAME = 'Compartidas';

let schemaReady = false;
let schemaReadyPromise = null;

function missingRelation(error) {
    return String(error?.code || '').trim() === '42P01';
}

function resolveTenantId(input = null) {
    if (typeof input === 'string') return normalizeTenantId(input || DEFAULT_TENANT_ID);
    if (input && typeof input === 'object') return normalizeTenantId(input.tenantId || DEFAULT_TENANT_ID);
    return DEFAULT_TENANT_ID;
}

function normalizeLibraryId(value = '') {
    return String(value || '').trim().toUpperCase();
}

function normalizeItemId(value = '') {
    return String(value || '').trim().toUpperCase();
}

function normalizeModuleId(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeSortOrder(value, fallback = 1000) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, parsed);
}

function normalizeBool(value, fallback = true) {
    if (value === undefined || value === null) return Boolean(fallback);
    return value !== false;
}

function createId(prefix = 'QRI') {
    return `${String(prefix || 'ID').trim().toUpperCase()}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function sanitizeLibrary(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const libraryId = normalizeLibraryId(source.libraryId || source.id || '');
    const name = String(source.name || source.libraryName || '').trim();
    const description = String(source.description || '').trim();
    const isShared = normalizeBool(source.isShared, true);
    const isActive = normalizeBool(source.isActive, true);
    const sortOrder = normalizeSortOrder(source.sortOrder, 1000);
    const moduleIds = Array.isArray(source.moduleIds)
        ? Array.from(new Set(source.moduleIds.map((entry) => normalizeModuleId(entry)).filter(Boolean)))
        : [];

    return {
        libraryId,
        name,
        description,
        isShared,
        isActive,
        sortOrder,
        moduleIds: isShared ? [] : moduleIds
    };
}

function normalizeMediaAsset(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const url = String(source.url || source.mediaUrl || source.media_url || '').trim();
    if (!url) return null;
    const mimeType = String(source.mimeType || source.mediaMimeType || source.media_mime_type || '').trim().toLowerCase() || null;
    const fileName = String(source.fileName || source.mediaFileName || source.media_file_name || source.filename || '').trim() || null;
    const sizeBytesRaw = Number(source.sizeBytes ?? source.mediaSizeBytes ?? source.media_size_bytes);
    const sizeBytes = Number.isFinite(sizeBytesRaw) && sizeBytesRaw > 0 ? Math.floor(sizeBytesRaw) : null;
    const kind = String(source.kind || '').trim().toLowerCase() || null;
    return {
        url,
        mimeType,
        fileName,
        sizeBytes,
        kind
    };
}

function normalizeMediaAssets(value = [], fallback = null) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    const assets = source
        .map((entry) => normalizeMediaAsset(entry))
        .filter(Boolean)
        .filter((entry) => {
            const key = `${String(entry.url || '').trim()}|${String(entry.fileName || '').trim()}|${String(entry.mimeType || '').trim()}`;
            if (!key) return false;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    if (assets.length > 0) return assets;
    const fallbackAsset = normalizeMediaAsset(fallback);
    return fallbackAsset ? [fallbackAsset] : [];
}
function sanitizeItem(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const itemId = normalizeItemId(source.itemId || source.id || '');
    const libraryId = normalizeLibraryId(source.libraryId || source.library || DEFAULT_LIBRARY_ID);
    const label = String(source.label || '').trim();
    const text = String(source.text || source.bodyText || source.body || '').trim();
    const sourceMetadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? { ...source.metadata }
        : {};
    const mediaAssets = normalizeMediaAssets(
        source.mediaAssets || sourceMetadata.mediaAssets,
        {
            url: source.mediaUrl || source.media_url || '',
            mimeType: source.mediaMimeType || source.media_mime_type || '',
            fileName: source.mediaFileName || source.media_file_name || '',
            sizeBytes: source.mediaSizeBytes ?? source.media_size_bytes
        }
    );
    const primaryMedia = mediaAssets[0] || null;
    const mediaUrl = String(primaryMedia?.url || source.mediaUrl || source.media_url || '').trim() || null;
    const mediaMimeType = String(primaryMedia?.mimeType || source.mediaMimeType || source.media_mime_type || '').trim().toLowerCase() || null;
    const mediaFileName = String(primaryMedia?.fileName || source.mediaFileName || source.media_file_name || '').trim() || null;
    const mediaSizeRaw = Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes ?? source.media_size_bytes);
    const mediaSizeBytes = Number.isFinite(mediaSizeRaw) && mediaSizeRaw > 0 ? Math.floor(mediaSizeRaw) : null;
    const isActive = normalizeBool(source.isActive, true);
    const sortOrder = normalizeSortOrder(source.sortOrder, 1000);
    const metadata = {
        ...sourceMetadata,
        mediaAssets
    };

    return {
        itemId,
        libraryId,
        label,
        text,
        mediaAssets,
        mediaUrl,
        mediaMimeType,
        mediaFileName,
        mediaSizeBytes,
        isActive,
        sortOrder,
        metadata
    };
}

function normalizeFileStore(parsed = null) {
    const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};

    const libraries = Array.isArray(source.libraries)
        ? source.libraries.map((entry) => sanitizeLibrary(entry)).filter((entry) => entry.libraryId)
        : [{
            libraryId: DEFAULT_LIBRARY_ID,
            name: DEFAULT_LIBRARY_NAME,
            description: 'Respuestas rapidas compartidas para toda la empresa.',
            isShared: true,
            isActive: true,
            sortOrder: 1,
            moduleIds: []
        }];

    const items = Array.isArray(source.items)
        ? source.items
            .map((entry) => sanitizeItem(entry))
            .filter((entry) => entry.itemId && entry.libraryId && (entry.text || entry.mediaUrl || (Array.isArray(entry.mediaAssets) && entry.mediaAssets.length > 0)))
        : [];

    return { libraries, items };
}

async function ensurePostgresSchema() {
    if (schemaReady) return;
    if (schemaReadyPromise) return schemaReadyPromise;

    schemaReadyPromise = (async () => {
        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS quick_reply_libraries (
                tenant_id TEXT NOT NULL,
                library_id TEXT NOT NULL,
                library_name TEXT NOT NULL,
                description TEXT,
                is_shared BOOLEAN NOT NULL DEFAULT TRUE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                sort_order INTEGER NOT NULL DEFAULT 1000,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, library_id)
            )`
        );

        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS quick_reply_items (
                tenant_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                library_id TEXT NOT NULL,
                label TEXT NOT NULL,
                body_text TEXT NOT NULL DEFAULT '',
                media_url TEXT,
                media_mime_type TEXT,
                media_file_name TEXT,
                media_size_bytes BIGINT,
                sort_order INTEGER NOT NULL DEFAULT 1000,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, item_id)
            )`
        );

        await queryPostgres(
            `CREATE TABLE IF NOT EXISTS quick_reply_library_modules (
                tenant_id TEXT NOT NULL,
                library_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, library_id, module_id)
            )`
        );

        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_quick_reply_libraries_tenant_active ON quick_reply_libraries(tenant_id, is_active DESC, sort_order ASC, created_at DESC)`);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_quick_reply_items_tenant_library_sort ON quick_reply_items(tenant_id, library_id, is_active DESC, sort_order ASC, created_at DESC)`);
        await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_quick_reply_library_modules_tenant_module ON quick_reply_library_modules(tenant_id, module_id, library_id)`);

        schemaReady = true;
        schemaReadyPromise = null;
    })();

    return schemaReadyPromise;
}

async function ensureDefaultLibraryPostgres(tenantId) {
    await ensurePostgresSchema();
    await queryPostgres(
        `INSERT INTO quick_reply_libraries (tenant_id, library_id, library_name, description, is_shared, is_active, sort_order, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, 1, '{}'::jsonb, NOW(), NOW())
         ON CONFLICT (tenant_id, library_id) DO NOTHING`,
        [tenantId, DEFAULT_LIBRARY_ID, DEFAULT_LIBRARY_NAME, 'Respuestas rapidas compartidas para toda la empresa.']
    );
}
async function listQuickReplyLibraries(options = {}) {
    const tenantId = resolveTenantId(options);
    const includeInactive = options?.includeInactive === true;
    const moduleId = normalizeModuleId(options?.moduleId || '');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(QUICK_REPLIES_FILE, { tenantId, defaultValue: {} }));
        let libraries = (Array.isArray(store.libraries) ? store.libraries : []).filter((entry) => includeInactive || entry.isActive !== false);
        if (moduleId) {
            libraries = libraries.filter((entry) => entry.isShared || (Array.isArray(entry.moduleIds) && entry.moduleIds.includes(moduleId)));
        }
        return libraries;
    }

    try {
        await ensureDefaultLibraryPostgres(tenantId);
        const params = [tenantId];
        let where = 'WHERE l.tenant_id = $1';
        if (!includeInactive) where += ' AND l.is_active = TRUE';

        if (moduleId) {
            params.push(moduleId);
            where += ` AND (
                l.is_shared = TRUE
                OR EXISTS (
                    SELECT 1
                      FROM quick_reply_library_modules lm2
                     WHERE lm2.tenant_id = l.tenant_id
                       AND lm2.library_id = l.library_id
                       AND lm2.module_id = $${params.length}
                )
            )`;
        }

        const { rows } = await queryPostgres(
            `SELECT l.library_id, l.library_name, l.description, l.is_shared, l.is_active, l.sort_order, l.created_at, l.updated_at,
                    COALESCE(array_remove(array_agg(DISTINCT lm.module_id), NULL), '{}') AS module_ids
               FROM quick_reply_libraries l
               LEFT JOIN quick_reply_library_modules lm
                 ON lm.tenant_id = l.tenant_id
                AND lm.library_id = l.library_id
               ${where}
              GROUP BY l.library_id, l.library_name, l.description, l.is_shared, l.is_active, l.sort_order, l.created_at, l.updated_at
              ORDER BY l.sort_order ASC, l.created_at DESC`,
            params
        );

        return (Array.isArray(rows) ? rows : []).map((row) => ({
            libraryId: normalizeLibraryId(row.library_id),
            name: String(row.library_name || '').trim() || normalizeLibraryId(row.library_id),
            description: String(row.description || '').trim() || '',
            isShared: row.is_shared === true,
            isActive: row.is_active !== false,
            sortOrder: normalizeSortOrder(row.sort_order, 1000),
            moduleIds: Array.isArray(row.module_ids)
                ? Array.from(new Set(row.module_ids.map((entry) => normalizeModuleId(entry)).filter(Boolean)))
                : [],
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        }));
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

async function saveQuickReplyLibrary(payload = {}, options = {}) {
    const tenantId = resolveTenantId(options);
    const clean = sanitizeLibrary(payload);
    if (!clean.name) throw new Error('Nombre de biblioteca requerido.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(QUICK_REPLIES_FILE, { tenantId, defaultValue: {} }));
        const libraryId = clean.libraryId || createId('QRL');
        const idx = (store.libraries || []).findIndex((entry) => normalizeLibraryId(entry.libraryId) === normalizeLibraryId(libraryId));
        const nextEntry = { ...clean, libraryId, moduleIds: clean.isShared ? [] : clean.moduleIds };
        if (idx >= 0) store.libraries[idx] = nextEntry;
        else store.libraries.push(nextEntry);
        await writeTenantJsonFile(QUICK_REPLIES_FILE, store, { tenantId });
        return nextEntry;
    }

    await ensureDefaultLibraryPostgres(tenantId);
    const libraryId = clean.libraryId || createId('QRL');
    await queryPostgres(
        `INSERT INTO quick_reply_libraries (tenant_id, library_id, library_name, description, is_shared, is_active, sort_order, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, NOW(), NOW())
         ON CONFLICT (tenant_id, library_id)
         DO UPDATE SET
            library_name = EXCLUDED.library_name,
            description = EXCLUDED.description,
            is_shared = EXCLUDED.is_shared,
            is_active = EXCLUDED.is_active,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()`,
        [tenantId, libraryId, clean.name, clean.description || null, clean.isShared, clean.isActive, clean.sortOrder]
    );

    await queryPostgres(
        `DELETE FROM quick_reply_library_modules
          WHERE tenant_id = $1
            AND library_id = $2`,
        [tenantId, libraryId]
    );

    if (!clean.isShared && clean.moduleIds.length > 0) {
        for (const moduleId of clean.moduleIds) {
            await queryPostgres(
                `INSERT INTO quick_reply_library_modules (tenant_id, library_id, module_id, created_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (tenant_id, library_id, module_id) DO NOTHING`,
                [tenantId, libraryId, moduleId]
            );
        }
    }

    const all = await listQuickReplyLibraries({ tenantId, includeInactive: true });
    return all.find((entry) => normalizeLibraryId(entry.libraryId) === normalizeLibraryId(libraryId)) || null;
}

async function deactivateQuickReplyLibrary(libraryId = '', options = {}) {
    const tenantId = resolveTenantId(options);
    const cleanLibraryId = normalizeLibraryId(libraryId);
    if (!cleanLibraryId) throw new Error('libraryId invalido.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(QUICK_REPLIES_FILE, { tenantId, defaultValue: {} }));
        const idx = (store.libraries || []).findIndex((entry) => normalizeLibraryId(entry.libraryId) === cleanLibraryId);
        if (idx < 0) throw new Error('Biblioteca no encontrada.');
        store.libraries[idx] = { ...store.libraries[idx], isActive: false };
        await writeTenantJsonFile(QUICK_REPLIES_FILE, store, { tenantId });
        return { libraryId: cleanLibraryId };
    }

    await ensureDefaultLibraryPostgres(tenantId);
    await queryPostgres(
        `UPDATE quick_reply_libraries
            SET is_active = FALSE,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND library_id = $2`,
        [tenantId, cleanLibraryId]
    );

    return { libraryId: cleanLibraryId };
}

async function listQuickReplyItems(options = {}) {
    const tenantId = resolveTenantId(options);
    const includeInactive = options?.includeInactive === true;
    const moduleId = normalizeModuleId(options?.moduleId || '');
    const requestedLibraryId = normalizeLibraryId(options?.libraryId || '');

    const libraries = await listQuickReplyLibraries({ tenantId, includeInactive, moduleId });
    const libraryIds = libraries.map((entry) => normalizeLibraryId(entry.libraryId)).filter(Boolean);
    const scopedLibraryIds = requestedLibraryId
        ? (libraryIds.includes(requestedLibraryId) ? [requestedLibraryId] : [])
        : libraryIds;

    if (!scopedLibraryIds.length) return [];

    const libraryMap = new Map();
    libraries.forEach((entry) => libraryMap.set(normalizeLibraryId(entry.libraryId), entry));

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(QUICK_REPLIES_FILE, { tenantId, defaultValue: {} }));
        return (Array.isArray(store.items) ? store.items : [])
            .map((entry) => sanitizeItem(entry))
            .filter((entry) => entry.itemId && scopedLibraryIds.includes(entry.libraryId))
            .filter((entry) => includeInactive || entry.isActive !== false)
            .map((entry) => ({
                ...entry,
                id: entry.itemId,
                bodyText: entry.text,
                libraryName: libraryMap.get(entry.libraryId)?.name || entry.libraryId,
                isShared: libraryMap.get(entry.libraryId)?.isShared !== false,
                moduleIds: libraryMap.get(entry.libraryId)?.moduleIds || []
            }));
    }

    await ensureDefaultLibraryPostgres(tenantId);
    const params = [tenantId, scopedLibraryIds];
    let where = 'WHERE tenant_id = $1 AND library_id = ANY($2)';
    if (!includeInactive) where += ' AND is_active = TRUE';

    const { rows } = await queryPostgres(
        `SELECT item_id, library_id, label, body_text, media_url, media_mime_type, media_file_name, media_size_bytes, sort_order, is_active, metadata, created_at, updated_at
           FROM quick_reply_items
           ${where}
          ORDER BY sort_order ASC, created_at DESC`,
        params
    );

    return (Array.isArray(rows) ? rows : []).map((row) => {
        const libraryId = normalizeLibraryId(row.library_id);
        const library = libraryMap.get(libraryId) || null;
        const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? row.metadata
            : {};
        const mediaAssets = normalizeMediaAssets(metadata.mediaAssets, {
            url: row.media_url,
            mimeType: row.media_mime_type,
            fileName: row.media_file_name,
            sizeBytes: row.media_size_bytes
        });
        const primaryMedia = mediaAssets[0] || null;
        return {
            id: normalizeItemId(row.item_id),
            itemId: normalizeItemId(row.item_id),
            libraryId,
            libraryName: String(library?.name || libraryId).trim() || libraryId,
            label: String(row.label || '').trim() || 'Respuesta rapida',
            text: String(row.body_text || '').trim(),
            bodyText: String(row.body_text || '').trim(),
            mediaAssets,
            mediaUrl: String(primaryMedia?.url || row.media_url || '').trim() || null,
            mediaMimeType: String(primaryMedia?.mimeType || row.media_mime_type || '').trim().toLowerCase() || null,
            mediaFileName: String(primaryMedia?.fileName || row.media_file_name || '').trim() || null,
            mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes ?? row.media_size_bytes)) ? Number(primaryMedia?.sizeBytes ?? row.media_size_bytes) : null,
            sortOrder: normalizeSortOrder(row.sort_order, 1000),
            isActive: row.is_active !== false,
            isShared: library?.isShared !== false,
            moduleIds: Array.isArray(library?.moduleIds) ? library.moduleIds : [],
            metadata: {
                ...metadata,
                mediaAssets
            }
        };
    });
}
async function getQuickReplyItemById(itemId = '', options = {}) {
    const cleanItemId = normalizeItemId(itemId);
    if (!cleanItemId) return null;

    const items = await listQuickReplyItems({
        ...options,
        includeInactive: options?.includeInactive === true
    });

    return items.find((entry) => normalizeItemId(entry.itemId || entry.id) === cleanItemId) || null;
}

async function saveQuickReplyItem(payload = {}, options = {}) {
    const tenantId = resolveTenantId(options);
    const clean = sanitizeItem(payload);
    if (!clean.libraryId) clean.libraryId = DEFAULT_LIBRARY_ID;
    if (!clean.label) throw new Error('Etiqueta de respuesta requerida.');
    if (!clean.text && (!Array.isArray(clean.mediaAssets) || clean.mediaAssets.length === 0) && !clean.mediaUrl) throw new Error('La respuesta requiere texto o adjunto.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(QUICK_REPLIES_FILE, { tenantId, defaultValue: {} }));
        const itemId = clean.itemId || createId('QRI');
        const idx = (store.items || []).findIndex((entry) => normalizeItemId(entry.itemId || entry.id) === normalizeItemId(itemId));
        const nextItem = {
            itemId,
            libraryId: clean.libraryId,
            label: clean.label,
            text: clean.text || '',
            mediaUrl: clean.mediaUrl || null,
            mediaMimeType: clean.mediaMimeType || null,
            mediaFileName: clean.mediaFileName || null,
            mediaSizeBytes: clean.mediaSizeBytes,
            sortOrder: clean.sortOrder,
            isActive: clean.isActive,
            mediaAssets: Array.isArray(clean.mediaAssets) ? clean.mediaAssets : [],
            metadata: clean.metadata && typeof clean.metadata === 'object' ? clean.metadata : {}
        };
        if (idx >= 0) store.items[idx] = nextItem;
        else store.items.push(nextItem);
        await writeTenantJsonFile(QUICK_REPLIES_FILE, store, { tenantId });
        return { ...nextItem, id: nextItem.itemId };
    }

    await ensureDefaultLibraryPostgres(tenantId);
    const itemId = clean.itemId || createId('QRI');
    await queryPostgres(
        `INSERT INTO quick_reply_items (
            tenant_id, item_id, library_id, label, body_text, media_url, media_mime_type,
            media_file_name, media_size_bytes, sort_order, is_active, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW(), NOW())
        ON CONFLICT (tenant_id, item_id)
        DO UPDATE SET
            library_id = EXCLUDED.library_id,
            label = EXCLUDED.label,
            body_text = EXCLUDED.body_text,
            media_url = EXCLUDED.media_url,
            media_mime_type = EXCLUDED.media_mime_type,
            media_file_name = EXCLUDED.media_file_name,
            media_size_bytes = EXCLUDED.media_size_bytes,
            sort_order = EXCLUDED.sort_order,
            is_active = EXCLUDED.is_active,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()`,
        [
            tenantId,
            itemId,
            clean.libraryId,
            clean.label,
            clean.text || '',
            clean.mediaUrl || null,
            clean.mediaMimeType || null,
            clean.mediaFileName || null,
            clean.mediaSizeBytes,
            clean.sortOrder,
            clean.isActive,
            JSON.stringify(clean.metadata && typeof clean.metadata === 'object' ? clean.metadata : {})
        ]
    );

    return await getQuickReplyItemById(itemId, { tenantId, includeInactive: true, moduleId: options?.moduleId || '' });
}

async function deactivateQuickReplyItem(itemId = '', options = {}) {
    const tenantId = resolveTenantId(options);
    const cleanItemId = normalizeItemId(itemId);
    if (!cleanItemId) throw new Error('itemId invalido.');

    if (getStorageDriver() !== 'postgres') {
        const store = normalizeFileStore(await readTenantJsonFile(QUICK_REPLIES_FILE, { tenantId, defaultValue: {} }));
        const idx = (store.items || []).findIndex((entry) => normalizeItemId(entry.itemId || entry.id) === cleanItemId);
        if (idx < 0) throw new Error('Respuesta rapida no encontrada.');
        store.items[idx] = { ...store.items[idx], isActive: false };
        await writeTenantJsonFile(QUICK_REPLIES_FILE, store, { tenantId });
        return { itemId: cleanItemId };
    }

    await ensureDefaultLibraryPostgres(tenantId);
    await queryPostgres(
        `UPDATE quick_reply_items
            SET is_active = FALSE,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND item_id = $2`,
        [tenantId, cleanItemId]
    );
    return { itemId: cleanItemId };
}

module.exports = {
    DEFAULT_LIBRARY_ID,
    listQuickReplyLibraries,
    saveQuickReplyLibrary,
    deactivateQuickReplyLibrary,
    listQuickReplyItems,
    saveQuickReplyItem,
    deactivateQuickReplyItem,
    getQuickReplyItemById,
    resolveTenantId,
    normalizeLibraryId,
    normalizeItemId,
    normalizeModuleId,
    missingRelation
};






