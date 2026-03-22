#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    getTenantDataDir,
    queryPostgres
} = require('../config/persistence-runtime');
const tenantService = require('../domains/tenant/services/tenant-core.service');

function parseArgs(argv = []) {
    const args = {
        out: '',
        tenant: '',
        includeMessages: true,
        pretty: true
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        if (!token) continue;

        if (token === '--out') {
            args.out = String(argv[i + 1] || '').trim();
            i += 1;
            continue;
        }

        if (token === '--tenant' || token === '--tenants') {
            args.tenant = String(argv[i + 1] || '').trim();
            i += 1;
            continue;
        }

        if (token === '--include-messages') {
            args.includeMessages = parseBoolean(argv[i + 1], true);
            i += 1;
            continue;
        }

        if (token === '--pretty') {
            args.pretty = parseBoolean(argv[i + 1], true);
            i += 1;
            continue;
        }
    }

    return args;
}

function parseBoolean(input, fallback = false) {
    const raw = String(input ?? '').trim().toLowerCase();
    if (!raw) return Boolean(fallback);
    return ['1', 'true', 'yes', 'on'].includes(raw);
}

function parseTenantFilter(raw = '') {
    if (!raw) return [];
    return String(raw)
        .split(',')
        .map((item) => normalizeTenantId(item))
        .filter(Boolean);
}

function resolveTargetTenants(tenantFilter = []) {
    const known = tenantService.getTenants().map((tenant) => normalizeTenantId(tenant?.id || ''));
    const dedup = new Set(known.filter(Boolean));
    dedup.add(DEFAULT_TENANT_ID);

    const all = Array.from(dedup.values());
    if (!tenantFilter.length) return all;

    const selected = [];
    tenantFilter.forEach((tenantId) => {
        if (dedup.has(tenantId)) {
            selected.push(tenantId);
        }
    });

    return selected;
}

function stamp() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function collectTenantFiles(baseDir, includeMessages = true) {
    const files = [];
    const exists = fs.existsSync(baseDir);
    if (!exists) return files;

    async function walk(currentDir) {
        const entries = await fsp.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }

            if (!includeMessages && relPath.toLowerCase() === 'message_history.json') {
                continue;
            }

            const buf = await fsp.readFile(fullPath);
            const stat = await fsp.stat(fullPath);
            files.push({
                path: relPath,
                encoding: 'base64',
                content: buf.toString('base64'),
                sizeBytes: Number(stat.size || 0),
                mtimeIso: stat.mtime ? stat.mtime.toISOString() : null
            });
        }
    }

    await walk(baseDir);
    files.sort((a, b) => String(a.path).localeCompare(String(b.path)));
    return files;
}

async function buildFileBackup(tenantIds = [], includeMessages = true) {
    const tenants = {};

    for (const tenantId of tenantIds) {
        const tenantDir = getTenantDataDir(tenantId);
        const files = await collectTenantFiles(tenantDir, includeMessages);
        tenants[tenantId] = {
            tenantDir,
            fileCount: files.length,
            files
        };
    }

    return { tenants };
}

async function fetchTable(table, tenantIds = []) {
    if (!tenantIds.length) return [];
    const sql = `SELECT * FROM ${table} WHERE tenant_id = ANY($1::text[])`;
    const result = await queryPostgres(sql, [tenantIds]);
    return Array.isArray(result?.rows) ? result.rows : [];
}

async function buildPostgresBackup(tenantIds = [], includeMessages = true) {
    const warnings = [];
    const tables = {};

    async function safeLoad(label, fn) {
        try {
            tables[label] = await fn();
        } catch (error) {
            if (String(error?.code || '').trim() === '42P01') {
                warnings.push(`Tabla no encontrada: ${label}`);
                tables[label] = [];
                return;
            }
            throw error;
        }
    }

    await safeLoad('tenants', async () => {
        const result = await queryPostgres('SELECT * FROM tenants WHERE tenant_id = ANY($1::text[])', [tenantIds]);
        return result.rows || [];
    });

    await safeLoad('memberships', async () => {
        const result = await queryPostgres('SELECT * FROM memberships WHERE tenant_id = ANY($1::text[])', [tenantIds]);
        return result.rows || [];
    });

    await safeLoad('users', async () => {
        const result = await queryPostgres(
            `SELECT DISTINCT u.*
               FROM users u
               INNER JOIN memberships m ON m.user_id = u.user_id
              WHERE m.tenant_id = ANY($1::text[])`,
            [tenantIds]
        );
        return result.rows || [];
    });

    const scopedTables = [
        'wa_sessions',
        'wa_modules',
        'quick_replies',
        'catalog_items',
        'tenant_settings',
        'tenant_chats',
        'tenant_messages',
        'audit_logs',
        'auth_sessions',
        'auth_token_revocations',
        'tenant_catalogs',
        'tenant_integrations',
        'tenant_ai_chat_history',
        'tenant_ai_usage'
    ];

    for (const table of scopedTables) {
        if (!includeMessages && (table === 'tenant_messages' || table === 'tenant_chats' || table === 'tenant_ai_chat_history')) {
            tables[table] = [];
            continue;
        }

        await safeLoad(table, async () => fetchTable(table, tenantIds));
    }

    await safeLoad('saas_access_catalog', async () => {
        const result = await queryPostgres('SELECT * FROM saas_access_catalog');
        return result.rows || [];
    });

    await safeLoad('saas_plan_limits', async () => {
        const result = await queryPostgres('SELECT * FROM saas_plan_limits');
        return result.rows || [];
    });

    return { tables, warnings };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const driver = getStorageDriver();
    const tenantFilter = parseTenantFilter(args.tenant);
    const tenantIds = resolveTargetTenants(tenantFilter);

    if (!tenantIds.length) {
        throw new Error('No se encontraron tenants para backup con el filtro actual.');
    }

    const outPath = args.out
        ? path.resolve(args.out)
        : path.resolve(__dirname, '..', 'backups', `tenant-backup-${stamp()}.json`);

    const payload = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        driver,
        node: process.version,
        includeMessages: Boolean(args.includeMessages),
        tenantIds,
        data: {}
    };

    if (driver === 'postgres') {
        payload.data.postgres = await buildPostgresBackup(tenantIds, args.includeMessages);
    } else {
        payload.data.file = await buildFileBackup(tenantIds, args.includeMessages);
    }

    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    const json = JSON.stringify(payload, null, args.pretty ? 2 : 0);
    await fsp.writeFile(outPath, json, 'utf8');

    const stat = await fsp.stat(outPath);
    console.log('[Backup] OK');
    console.log('[Backup] Driver:', driver);
    console.log('[Backup] Tenants:', tenantIds.join(', '));
    console.log('[Backup] File:', outPath);
    console.log('[Backup] SizeBytes:', Number(stat.size || 0));
}

main().catch((error) => {
    console.error('[Backup] ERROR:', String(error?.message || error));
    process.exit(1);
});


