const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const DEFAULT_DRIVER = 'file';
const DEFAULT_TENANT_ID = 'default';
const TENANT_DATA_ROOT = path.join(__dirname, 'data', 'tenants');

let cachedPgPool = null;
let cachedDriverWarning = false;

function getStorageDriver() {
    const raw = String(process.env.SAAS_STORAGE_DRIVER || DEFAULT_DRIVER).trim().toLowerCase();
    return raw === 'postgres' ? 'postgres' : 'file';
}

function normalizeTenantId(input = '') {
    const tenantId = String(input || DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
    const safe = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return safe || DEFAULT_TENANT_ID;
}

function getTenantDataDir(tenantId = DEFAULT_TENANT_ID) {
    const safeTenantId = normalizeTenantId(tenantId);
    const customRoot = String(process.env.SAAS_TENANT_DATA_DIR || '').trim();
    const root = customRoot ? path.resolve(customRoot) : TENANT_DATA_ROOT;
    return path.join(root, safeTenantId);
}

function getTenantDataFilePath(tenantId = DEFAULT_TENANT_ID, fileName = '') {
    const safeFile = String(fileName || '').trim();
    if (!safeFile) throw new Error('Nombre de archivo tenant requerido.');
    return path.join(getTenantDataDir(tenantId), safeFile);
}

async function ensureTenantDataDir(tenantId = DEFAULT_TENANT_ID) {
    const dir = getTenantDataDir(tenantId);
    await fsp.mkdir(dir, { recursive: true });
    return dir;
}

async function readTenantJsonFile(fileName, {
    tenantId = DEFAULT_TENANT_ID,
    defaultValue = [],
    legacyPath = null
} = {}) {
    const filePath = getTenantDataFilePath(tenantId, fileName);

    try {
        const raw = await fsp.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            throw error;
        }
    }

    const safeTenantId = normalizeTenantId(tenantId);
    if (safeTenantId === DEFAULT_TENANT_ID && legacyPath && fs.existsSync(legacyPath)) {
        try {
            const legacyRaw = await fsp.readFile(legacyPath, 'utf8');
            const parsed = JSON.parse(legacyRaw);
            await ensureTenantDataDir(safeTenantId);
            await fsp.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
            return parsed;
        } catch (error) {
        }
    }

    const fallback = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
    await ensureTenantDataDir(safeTenantId);
    await fsp.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
}

async function writeTenantJsonFile(fileName, data, {
    tenantId = DEFAULT_TENANT_ID,
    mirrorLegacyPath = null
} = {}) {
    const safeTenantId = normalizeTenantId(tenantId);
    const filePath = getTenantDataFilePath(safeTenantId, fileName);
    await ensureTenantDataDir(safeTenantId);
    const payload = JSON.stringify(data, null, 2);
    await fsp.writeFile(filePath, payload, 'utf8');

    if (safeTenantId === DEFAULT_TENANT_ID && mirrorLegacyPath) {
        try {
            await fsp.writeFile(mirrorLegacyPath, payload, 'utf8');
        } catch (error) {
        }
    }
}

function getPostgresConfig() {
    const connectionString = String(process.env.DATABASE_URL || '').trim();
    if (connectionString) {
        return {
            connectionString,
            ssl: String(process.env.PGSSL || '').trim().toLowerCase() === 'true'
                ? { rejectUnauthorized: false }
                : undefined
        };
    }

    return {
        host: String(process.env.PGHOST || '').trim() || undefined,
        port: Number(process.env.PGPORT || 5432),
        user: String(process.env.PGUSER || '').trim() || undefined,
        password: String(process.env.PGPASSWORD || '').trim() || undefined,
        database: String(process.env.PGDATABASE || '').trim() || undefined,
        ssl: String(process.env.PGSSL || '').trim().toLowerCase() === 'true'
            ? { rejectUnauthorized: false }
            : undefined
    };
}

function getPostgresPool() {
    if (cachedPgPool) return cachedPgPool;

    let pg;
    try {
        pg = require('pg');
    } catch (error) {
        throw new Error('Driver postgres requiere dependencia "pg". Ejecuta: npm i pg');
    }

    const { Pool } = pg;
    const config = getPostgresConfig();
    cachedPgPool = new Pool(config);
    return cachedPgPool;
}

async function queryPostgres(sql = '', params = []) {
    const pool = getPostgresPool();
    return pool.query(sql, params);
}

function warnIfPostgresMissing() {
    if (cachedDriverWarning) return;
    cachedDriverWarning = true;
    console.warn('[SaaS] SAAS_STORAGE_DRIVER=postgres aun no esta configurado o la dependencia pg no esta instalada. Se recomienda completar la fase de migracion antes de produccion.');
}

function isPostgresDriver() {
    const postgres = getStorageDriver() === 'postgres';
    if (postgres) {
        try {
            getPostgresPool();
        } catch (error) {
            warnIfPostgresMissing();
            throw error;
        }
    }
    return postgres;
}

module.exports = {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    isPostgresDriver,
    normalizeTenantId,
    getTenantDataDir,
    getTenantDataFilePath,
    readTenantJsonFile,
    writeTenantJsonFile,
    queryPostgres
};

