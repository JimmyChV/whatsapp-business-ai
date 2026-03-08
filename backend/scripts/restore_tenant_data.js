#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {
    getStorageDriver,
    normalizeTenantId,
    getTenantDataDir,
    queryPostgres
} = require('../persistence_runtime');

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function parseArgs(argv = []) {
    const args = {
        input: '',
        tenant: '',
        mode: 'merge',
        includeMessages: true
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        if (!token) continue;

        if (token === '--in' || token === '--input') {
            args.input = String(argv[i + 1] || '').trim();
            i += 1;
            continue;
        }

        if (token === '--tenant' || token === '--tenants') {
            args.tenant = String(argv[i + 1] || '').trim();
            i += 1;
            continue;
        }

        if (token === '--mode') {
            const mode = String(argv[i + 1] || '').trim().toLowerCase();
            args.mode = mode === 'replace' ? 'replace' : 'merge';
            i += 1;
            continue;
        }

        if (token === '--include-messages') {
            args.includeMessages = parseBoolean(argv[i + 1], true);
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

function quoteIdent(name) {
    const safe = String(name || '').trim();
    if (!IDENTIFIER_RE.test(safe)) {
        throw new Error('Identificador SQL invalido: ' + safe);
    }
    return `"${safe}"`;
}

function buildUpsertSql(table, columns, conflictCols = []) {
    const colSql = columns.map((col) => quoteIdent(col)).join(', ');
    const valuesSql = columns.map((_, idx) => `$${idx + 1}`).join(', ');

    if (!conflictCols.length) {
        return `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES (${valuesSql})`;
    }

    const conflictSql = conflictCols.map((col) => quoteIdent(col)).join(', ');
    const updateCols = columns.filter((col) => !conflictCols.includes(col));

    if (!updateCols.length) {
        return `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES (${valuesSql}) ON CONFLICT (${conflictSql}) DO NOTHING`;
    }

    const updateSql = updateCols
        .map((col) => `${quoteIdent(col)} = EXCLUDED.${quoteIdent(col)}`)
        .join(', ');

    return `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES (${valuesSql}) ON CONFLICT (${conflictSql}) DO UPDATE SET ${updateSql}`;
}

function safeRelativePath(input = '') {
    const rel = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) return null;
    return rel;
}

function resolveTargetTenantsFromBackup(backup, tenantFilter = []) {
    const fromPayload = Array.isArray(backup?.tenantIds)
        ? backup.tenantIds.map((item) => normalizeTenantId(item)).filter(Boolean)
        : [];

    if (!tenantFilter.length) return fromPayload;
    const allow = new Set(fromPayload);
    return tenantFilter.filter((tenantId) => allow.has(tenantId));
}

async function restoreFileData(backup, tenantIds = [], mode = 'merge', includeMessages = true) {
    const fileData = backup?.data?.file;
    if (!fileData || typeof fileData !== 'object') {
        throw new Error('El backup no contiene bloque data.file.');
    }

    let written = 0;

    for (const tenantId of tenantIds) {
        const tenantBlob = fileData?.tenants?.[tenantId];
        const entries = Array.isArray(tenantBlob?.files) ? tenantBlob.files : [];
        const tenantDir = getTenantDataDir(tenantId);

        if (mode === 'replace' && fs.existsSync(tenantDir)) {
            await fsp.rm(tenantDir, { recursive: true, force: true });
        }
        await fsp.mkdir(tenantDir, { recursive: true });

        for (const entry of entries) {
            const relPath = safeRelativePath(entry?.path || '');
            if (!relPath) continue;
            if (!includeMessages && relPath.toLowerCase() === 'message_history.json') continue;

            const destination = path.resolve(tenantDir, relPath);
            const parentDir = path.dirname(destination);
            if (!parentDir.startsWith(path.resolve(tenantDir))) continue;

            await fsp.mkdir(parentDir, { recursive: true });
            const raw = String(entry?.content || '');
            const enc = String(entry?.encoding || '').trim().toLowerCase() === 'base64' ? 'base64' : 'utf8';
            const data = Buffer.from(raw, enc);
            await fsp.writeFile(destination, data);
            written += 1;
        }
    }

    return { written };
}

function isTenantScopedTable(table) {
    return [
        'tenants',
        'memberships',
        'wa_sessions',
        'quick_replies',
        'catalog_items',
        'tenant_settings',
        'tenant_chats',
        'tenant_messages',
        'audit_logs',
        'auth_sessions',
        'auth_token_revocations'
    ].includes(table);
}

function getConflictColumns(table) {
    switch (table) {
    case 'tenants': return ['tenant_id'];
    case 'users': return ['user_id'];
    case 'memberships': return ['tenant_id', 'user_id'];
    case 'wa_sessions': return ['tenant_id'];
    case 'quick_replies': return ['tenant_id', 'reply_id'];
    case 'catalog_items': return ['tenant_id', 'item_id'];
    case 'tenant_settings': return ['tenant_id'];
    case 'tenant_chats': return ['tenant_id', 'chat_id'];
    case 'tenant_messages': return ['tenant_id', 'message_id'];
    case 'auth_sessions': return ['session_id'];
    case 'auth_token_revocations': return ['token_hash'];
    default: return [];
    }
}

function shouldSkipTable(table, includeMessages = true) {
    if (includeMessages) return false;
    return table === 'tenant_messages' || table === 'tenant_chats';
}

function pickRowsByTenant(table, rows = [], tenantIds = []) {
    if (!isTenantScopedTable(table)) return rows;
    const allowed = new Set(tenantIds.map((id) => normalizeTenantId(id)));
    return rows.filter((row) => {
        const tenantId = normalizeTenantId(row?.tenant_id || row?.tenantId || '');
        return allowed.has(tenantId);
    });
}

async function deleteTenantScopedRowsForReplace(tenantIds = [], includeMessages = true) {
    const deleteOrder = [
        'tenant_messages',
        'tenant_chats',
        'auth_token_revocations',
        'auth_sessions',
        'audit_logs',
        'tenant_settings',
        'catalog_items',
        'quick_replies',
        'wa_sessions',
        'memberships'
    ];

    for (const table of deleteOrder) {
        if (shouldSkipTable(table, includeMessages)) continue;
        try {
            await queryPostgres(`DELETE FROM ${quoteIdent(table)} WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
        } catch (error) {
            if (String(error?.code || '').trim() === '42P01') continue;
            throw error;
        }
    }
}

async function upsertRows(table, rows = [], includeMessages = true) {
    if (!rows.length) return 0;
    if (shouldSkipTable(table, includeMessages)) return 0;

    let written = 0;

    for (const rawRow of rows) {
        if (!rawRow || typeof rawRow !== 'object') continue;
        const row = { ...rawRow };

        if (table === 'audit_logs') {
            delete row.id;
        }
        if (table === 'auth_token_revocations') {
            delete row.id;
        }

        const columns = Object.keys(row).filter((key) => row[key] !== undefined);
        if (!columns.length) continue;

        const values = columns.map((col) => row[col]);

        try {
            const sql = buildUpsertSql(table, columns, getConflictColumns(table));
            await queryPostgres(sql, values);
            written += 1;
        } catch (error) {
            if (String(error?.code || '').trim() === '42P01') {
                return written;
            }
            throw error;
        }
    }

    return written;
}

async function restorePostgresData(backup, tenantIds = [], mode = 'merge', includeMessages = true) {
    const pgData = backup?.data?.postgres?.tables;
    if (!pgData || typeof pgData !== 'object') {
        throw new Error('El backup no contiene bloque data.postgres.tables.');
    }

    if (mode === 'replace') {
        await deleteTenantScopedRowsForReplace(tenantIds, includeMessages);
    }

    const restoreOrder = [
        'tenants',
        'users',
        'memberships',
        'wa_sessions',
        'quick_replies',
        'catalog_items',
        'tenant_settings',
        'tenant_chats',
        'tenant_messages',
        'audit_logs',
        'auth_sessions',
        'auth_token_revocations'
    ];

    const byTable = {};

    for (const table of restoreOrder) {
        const rawRows = Array.isArray(pgData[table]) ? pgData[table] : [];
        const rows = pickRowsByTenant(table, rawRows, tenantIds);
        byTable[table] = await upsertRows(table, rows, includeMessages);
    }

    return byTable;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.input) {
        throw new Error('Uso: node scripts/restore_tenant_data.js --in <backup.json> [--tenant a,b] [--mode merge|replace]');
    }

    const inputPath = path.resolve(args.input);
    const raw = await fsp.readFile(inputPath, 'utf8');
    const backup = JSON.parse(raw);

    const currentDriver = getStorageDriver();
    const backupDriver = String(backup?.driver || '').trim().toLowerCase();
    if (!backupDriver) throw new Error('Backup invalido: driver faltante.');

    if (backupDriver !== currentDriver) {
        throw new Error(`Driver incompatible. Backup=${backupDriver}, Runtime=${currentDriver}. Ajusta SAAS_STORAGE_DRIVER.`);
    }

    const tenantFilter = parseTenantFilter(args.tenant);
    const targetTenants = resolveTargetTenantsFromBackup(backup, tenantFilter);
    if (!targetTenants.length) {
        throw new Error('No hay tenants a restaurar para el filtro solicitado.');
    }

    if (currentDriver === 'postgres') {
        const result = await restorePostgresData(backup, targetTenants, args.mode, args.includeMessages);
        console.log('[Restore] OK');
        console.log('[Restore] Driver: postgres');
        console.log('[Restore] Mode:', args.mode);
        console.log('[Restore] Tenants:', targetTenants.join(', '));
        console.log('[Restore] Rows:', JSON.stringify(result));
        return;
    }

    const result = await restoreFileData(backup, targetTenants, args.mode, args.includeMessages);
    console.log('[Restore] OK');
    console.log('[Restore] Driver: file');
    console.log('[Restore] Mode:', args.mode);
    console.log('[Restore] Tenants:', targetTenants.join(', '));
    console.log('[Restore] Files written:', Number(result.written || 0));
}

main().catch((error) => {
    console.error('[Restore] ERROR:', String(error?.message || error));
    process.exit(1);
});
