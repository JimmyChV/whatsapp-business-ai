#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { performance } = require('perf_hooks');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    getTenantDataDir,
    queryPostgres
} = require('../persistence_runtime');
const tenantService = require('../domains/tenant/services/tenant-core.service');

function parseArgs(argv = []) {
    const args = {
        baseUrl: String(process.env.PILOT_BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:3001').trim(),
        opsToken: String(process.env.OPS_API_TOKEN || '').trim(),
        requests: Math.max(30, Number(process.env.PHASE5_CLOSEOUT_REQUESTS || 120)),
        concurrency: Math.max(1, Number(process.env.PHASE5_CLOSEOUT_CONCURRENCY || 8)),
        samples: Math.max(3, Number(process.env.PHASE5_CLOSEOUT_SAMPLES || 10)),
        intervalMs: Math.max(1000, Number(process.env.PHASE5_CLOSEOUT_INTERVAL_MS || 3000)),
        timeoutMs: Math.max(1000, Number(process.env.PHASE5_CLOSEOUT_TIMEOUT_MS || 7000)),
        maxErrorRate: Math.max(0, Number(process.env.OPS_PILOT_MAX_ERROR_RATE || 0.01)),
        maxP95Ms: Math.max(1, Number(process.env.OPS_PILOT_MAX_P95_MS || 1200)),
        minReadyRatio: Math.max(0, Math.min(1, Number(process.env.OPS_PILOT_MIN_READY_RATIO || 0.995))),
        outDir: String(process.env.PHASE5_CLOSEOUT_OUT_DIR || '').trim()
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        const next = String(argv[i + 1] || '').trim();
        if (!token) continue;

        if (token === '--base-url') { args.baseUrl = next; i += 1; continue; }
        if (token === '--ops-token') { args.opsToken = next; i += 1; continue; }
        if (token === '--requests') { args.requests = Math.max(30, Number(next) || args.requests); i += 1; continue; }
        if (token === '--concurrency') { args.concurrency = Math.max(1, Number(next) || args.concurrency); i += 1; continue; }
        if (token === '--samples') { args.samples = Math.max(3, Number(next) || args.samples); i += 1; continue; }
        if (token === '--interval-ms') { args.intervalMs = Math.max(1000, Number(next) || args.intervalMs); i += 1; continue; }
        if (token === '--timeout-ms') { args.timeoutMs = Math.max(1000, Number(next) || args.timeoutMs); i += 1; continue; }
        if (token === '--max-error-rate') { args.maxErrorRate = Math.max(0, Number(next) || args.maxErrorRate); i += 1; continue; }
        if (token === '--max-p95-ms') { args.maxP95Ms = Math.max(1, Number(next) || args.maxP95Ms); i += 1; continue; }
        if (token === '--min-ready-ratio') { args.minReadyRatio = Math.max(0, Math.min(1, Number(next) || args.minReadyRatio)); i += 1; continue; }
        if (token === '--out-dir') { args.outDir = next; i += 1; continue; }
    }

    return args;
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values = [], p = 0.95) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
    return sorted[idx] || 0;
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildHeaders(opsToken = '', pathName = '') {
    const headers = { Accept: 'application/json' };
    if (opsToken && pathName.startsWith('/api/ops/')) headers['x-ops-token'] = opsToken;
    return headers;
}

async function fetchJson(baseUrl, pathName, opsToken, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();

    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}${pathName}`, {
            method: 'GET',
            headers: buildHeaders(opsToken, pathName),
            signal: controller.signal
        });
        const elapsedMs = performance.now() - started;
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch (_) {
            body = null;
        }

        return {
            ok: response.ok,
            status: response.status,
            elapsedMs,
            body,
            error: null
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            elapsedMs: performance.now() - started,
            body: null,
            error: String(error?.message || error)
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function collectTenantFiles(baseDir) {
    const files = [];
    if (!fs.existsSync(baseDir)) return files;

    async function walk(currentDir) {
        const entries = await fsp.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
                await walk(fullPath);
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

function resolveTenantIds() {
    const known = tenantService.getTenants().map((tenant) => normalizeTenantId(tenant?.id || ''));
    const dedup = new Set(known.filter(Boolean));
    dedup.add(DEFAULT_TENANT_ID);
    return Array.from(dedup.values());
}

async function runBackup(backupFile) {
    const driver = getStorageDriver();
    const tenantIds = resolveTenantIds();

    const payload = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        driver,
        node: process.version,
        includeMessages: true,
        tenantIds,
        data: {}
    };

    if (driver === 'postgres') {
        const tables = {};
        const warnings = [];

        async function safeTable(name, sql, params = []) {
            try {
                const result = await queryPostgres(sql, params);
                tables[name] = result.rows || [];
            } catch (error) {
                if (String(error?.code || '').trim() === '42P01') {
                    warnings.push(`Tabla no encontrada: ${name}`);
                    tables[name] = [];
                    return;
                }
                throw error;
            }
        }

        await safeTable('tenants', 'SELECT * FROM tenants WHERE tenant_id = ANY($1::text[])', [tenantIds]);
        await safeTable('memberships', 'SELECT * FROM memberships WHERE tenant_id = ANY($1::text[])', [tenantIds]);
        await safeTable('users', `SELECT DISTINCT u.* FROM users u INNER JOIN memberships m ON m.user_id = u.user_id WHERE m.tenant_id = ANY($1::text[])`, [tenantIds]);

        const scoped = [
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
        for (const table of scoped) {
            await safeTable(table, `SELECT * FROM ${table} WHERE tenant_id = ANY($1::text[])`, [tenantIds]);
        }

        await safeTable('saas_access_catalog', 'SELECT * FROM saas_access_catalog');
        await safeTable('saas_plan_limits', 'SELECT * FROM saas_plan_limits');

        payload.data.postgres = { tables, warnings };
    } else {
        const tenants = {};
        for (const tenantId of tenantIds) {
            const tenantDir = getTenantDataDir(tenantId);
            const files = await collectTenantFiles(tenantDir);
            tenants[tenantId] = {
                tenantDir,
                fileCount: files.length,
                files
            };
        }
        payload.data.file = { tenants };
    }

    await fsp.mkdir(path.dirname(backupFile), { recursive: true });
    await fsp.writeFile(backupFile, JSON.stringify(payload, null, 2), 'utf8');

    return {
        ok: true,
        driver,
        tenantIds,
        bytes: Number((await fsp.stat(backupFile)).size || 0)
    };
}

async function runSmoke(baseUrl, opsToken, requests, concurrency, timeoutMs) {
    const paths = ['/api/ops/health', '/api/ops/ready', '/api/saas/runtime'];
    const latencies = [];
    const byStatus = {};
    let failures = 0;
    let cursor = 0;

    async function worker() {
        while (true) {
            const idx = cursor;
            cursor += 1;
            if (idx >= requests) return;

            const pathName = paths[idx % paths.length];
            const result = await fetchJson(baseUrl, pathName, opsToken, timeoutMs);
            latencies.push(result.elapsedMs);
            const statusKey = String(result.status || 0);
            byStatus[statusKey] = (byStatus[statusKey] || 0) + 1;

            if (!result.ok || result.status >= 500 || result.status === 0) {
                failures += 1;
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const total = Math.max(1, latencies.length);
    return {
        totalRequests: total,
        failures,
        errorRate: failures / total,
        latencyMs: {
            avg: latencies.reduce((s, n) => s + n, 0) / total,
            p95: percentile(latencies, 0.95),
            p99: percentile(latencies, 0.99)
        },
        byStatus,
        pass: failures === 0
    };
}

async function runPilot(baseUrl, opsToken, samples, intervalMs, timeoutMs, limits, pilotFile) {
    const rows = [];

    for (let i = 0; i < samples; i += 1) {
        const at = new Date().toISOString();
        const metrics = await fetchJson(baseUrl, '/api/ops/metrics', opsToken, timeoutMs);
        const ready = await fetchJson(baseUrl, '/api/ops/ready', opsToken, timeoutMs);

        rows.push({
            at,
            metricsOk: Boolean(metrics.ok && metrics.body?.ok),
            readyOk: Boolean(ready.ok),
            readyValue: Boolean(ready.body?.ready),
            metricsStatus: metrics.status,
            readyStatus: ready.status,
            errorRate: toNumber(metrics.body?.http?.errorRate, null),
            p95Ms: toNumber(metrics.body?.http?.latencyMs?.p95, null),
            waReady: Boolean(metrics.body?.health?.waReady)
        });

        if (i < samples - 1) {
            await sleep(intervalMs);
        }
    }

    const validRows = rows.filter((row) => row.metricsOk && row.readyOk);
    const maxErrorRate = validRows.length ? Math.max(...validRows.map((row) => toNumber(row.errorRate, 1))) : 1;
    const maxP95Ms = validRows.length ? Math.max(...validRows.map((row) => toNumber(row.p95Ms, Number.POSITIVE_INFINITY))) : Number.POSITIVE_INFINITY;
    const readyRatio = rows.length ? (rows.filter((row) => row.readyValue).length / rows.length) : 0;

    const checks = {
        errorRate: maxErrorRate <= limits.maxErrorRate,
        p95: maxP95Ms <= limits.maxP95Ms,
        readyRatio: readyRatio >= limits.minReadyRatio
    };

    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        limits,
        summary: {
            samplesCollected: rows.length,
            samplesValid: validRows.length,
            maxErrorRate: Number(maxErrorRate.toFixed(6)),
            maxP95Ms: Number(maxP95Ms.toFixed(2)),
            readyRatio: Number(readyRatio.toFixed(6))
        },
        verdict: {
            checks,
            pass: checks.errorRate && checks.p95 && checks.readyRatio
        },
        samples: rows
    };

    await fsp.writeFile(pilotFile, JSON.stringify(report, null, 2), 'utf8');
    return report;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = path.resolve(__dirname, '..');
    const outDir = args.outDir ? path.resolve(args.outDir) : path.join(rootDir, 'backups');

    await fsp.mkdir(outDir, { recursive: true });

    const id = stamp();
    const backupFile = path.join(outDir, `phase5-backup-${id}.json`);
    const pilotFile = path.join(outDir, `phase5-pilot-kpi-${id}.json`);
    const closeoutFile = path.join(outDir, `phase5-closeout-${id}.json`);

    const startedAt = new Date().toISOString();
    const backup = await runBackup(backupFile);
    const smoke = await runSmoke(args.baseUrl, args.opsToken, args.requests, args.concurrency, args.timeoutMs);
    const pilot = await runPilot(
        args.baseUrl,
        args.opsToken,
        args.samples,
        args.intervalMs,
        args.timeoutMs,
        {
            maxErrorRate: args.maxErrorRate,
            maxP95Ms: args.maxP95Ms,
            minReadyRatio: args.minReadyRatio
        },
        pilotFile
    );

    const report = {
        generatedAt: new Date().toISOString(),
        startedAt,
        finishedAt: new Date().toISOString(),
        baseUrl: args.baseUrl,
        artifacts: {
            backupFile,
            pilotFile,
            closeoutFile
        },
        backup,
        smoke,
        pilotSummary: pilot.summary,
        pilotVerdict: pilot.verdict,
        pass: Boolean(backup.ok && smoke.pass && pilot.verdict?.pass)
    };

    await fsp.writeFile(closeoutFile, JSON.stringify(report, null, 2), 'utf8');

    console.log('[Phase5Closeout] Backup file:', backupFile);
    console.log('[Phase5Closeout] Pilot file:', pilotFile);
    console.log('[Phase5Closeout] Closeout report:', closeoutFile);
    console.log('[Phase5Closeout] PASS:', report.pass);

    if (!report.pass) process.exit(1);
}

main().catch((error) => {
    console.error('[Phase5Closeout] ERROR:', String(error?.message || error));
    process.exit(1);
});

