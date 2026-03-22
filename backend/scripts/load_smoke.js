#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const { performance } = require('perf_hooks');

function parseArgs(argv = []) {
    const args = {
        baseUrl: process.env.SMOKE_BASE_URL || 'http://localhost:3001',
        opsToken: process.env.OPS_API_TOKEN || '',
        accessToken: process.env.SMOKE_ACCESS_TOKEN || '',
        tenantId: process.env.SMOKE_TENANT_ID || '',
        requests: Number(process.env.SMOKE_REQUESTS || 120),
        concurrency: Number(process.env.SMOKE_CONCURRENCY || 8),
        timeoutMs: Number(process.env.SMOKE_TIMEOUT_MS || 8000),
        paths: String(process.env.SMOKE_PATHS || '/api/ops/health,/api/ops/ready,/api/saas/runtime'),
        maxErrorRate: Number(process.env.SMOKE_MAX_ERROR_RATE || 0.05),
        maxP95Ms: Number(process.env.SMOKE_MAX_P95_MS || 1500)
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        if (!token) continue;

        const readValue = () => String(argv[i + 1] || '').trim();

        if (token === '--base-url') { args.baseUrl = readValue(); i += 1; continue; }
        if (token === '--ops-token') { args.opsToken = readValue(); i += 1; continue; }
        if (token === '--access-token') { args.accessToken = readValue(); i += 1; continue; }
        if (token === '--tenant-id') { args.tenantId = readValue(); i += 1; continue; }
        if (token === '--requests') { args.requests = Math.max(1, Number(readValue()) || args.requests); i += 1; continue; }
        if (token === '--concurrency') { args.concurrency = Math.max(1, Number(readValue()) || args.concurrency); i += 1; continue; }
        if (token === '--timeout-ms') { args.timeoutMs = Math.max(1000, Number(readValue()) || args.timeoutMs); i += 1; continue; }
        if (token === '--paths') { args.paths = readValue(); i += 1; continue; }
        if (token === '--max-error-rate') { args.maxErrorRate = Math.max(0, Number(readValue()) || args.maxErrorRate); i += 1; continue; }
        if (token === '--max-p95-ms') { args.maxP95Ms = Math.max(1, Number(readValue()) || args.maxP95Ms); i += 1; continue; }
    }

    return args;
}

function percentile(values = [], p = 0.95) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
    return sorted[idx] || 0;
}

function normalizePaths(raw = '') {
    return String(raw || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.startsWith('/') ? item : `/${item}`);
}

function buildHeaders({ opsToken = '', accessToken = '', tenantId = '', path = '' } = {}) {
    const headers = {
        Accept: 'application/json'
    };

    if (opsToken && path.startsWith('/api/ops/')) {
        headers['x-ops-token'] = opsToken;
    }

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    if (tenantId) {
        headers['x-tenant-id'] = tenantId;
    }

    return headers;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const text = await response.text();
        return { ok: true, status: response.status, body: text };
    } catch (error) {
        return { ok: false, error: String(error?.message || error), status: 0, body: '' };
    } finally {
        clearTimeout(timeoutId);
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const paths = normalizePaths(args.paths);

    if (!paths.length) {
        throw new Error('Debes proveer al menos una ruta en --paths.');
    }

    const latencies = [];
    const byStatus = {};
    const byPath = {};

    let nextIndex = 0;
    let failures = 0;

    async function worker() {
        while (true) {
            const idx = nextIndex;
            nextIndex += 1;
            if (idx >= args.requests) return;

            const path = paths[idx % paths.length];
            const url = `${args.baseUrl.replace(/\/$/, '')}${path}`;
            const headers = buildHeaders({
                opsToken: args.opsToken,
                accessToken: args.accessToken,
                tenantId: args.tenantId,
                path
            });

            const started = performance.now();
            const result = await fetchWithTimeout(url, { method: 'GET', headers }, args.timeoutMs);
            const durationMs = performance.now() - started;
            latencies.push(durationMs);

            const statusKey = String(result.status || 0);
            byStatus[statusKey] = (byStatus[statusKey] || 0) + 1;

            const pathBucket = byPath[path] || { total: 0, errors: 0, avgMs: 0 };
            pathBucket.total += 1;
            if (!result.ok || Number(result.status || 0) >= 500 || Number(result.status || 0) === 0) {
                pathBucket.errors += 1;
                failures += 1;
            }
            const prev = Math.max(0, pathBucket.total - 1);
            pathBucket.avgMs = prev > 0
                ? ((pathBucket.avgMs * prev) + durationMs) / (prev + 1)
                : durationMs;
            byPath[path] = pathBucket;
        }
    }

    const workers = [];
    const concurrency = Math.max(1, args.concurrency);
    for (let i = 0; i < concurrency; i += 1) {
        workers.push(worker());
    }

    const startedAt = performance.now();
    await Promise.all(workers);
    const totalMs = performance.now() - startedAt;

    const total = Math.max(1, latencies.length);
    const errorRate = failures / total;
    const p95 = percentile(latencies, 0.95);
    const p99 = percentile(latencies, 0.99);
    const avg = latencies.reduce((sum, item) => sum + item, 0) / total;
    const rps = total / Math.max(0.001, totalMs / 1000);

    console.log('[LoadSmoke] Summary');
    console.log(JSON.stringify({
        totalRequests: total,
        failures,
        errorRate: Number(errorRate.toFixed(4)),
        latencyMs: {
            avg: Number(avg.toFixed(2)),
            p95: Number(p95.toFixed(2)),
            p99: Number(p99.toFixed(2))
        },
        throughputRps: Number(rps.toFixed(2)),
        byStatus,
        byPath
    }, null, 2));

    const gateFail = errorRate > args.maxErrorRate || p95 > args.maxP95Ms;
    if (gateFail) {
        console.error(`[LoadSmoke] FAILED gates: errorRate<=${args.maxErrorRate}, p95<=${args.maxP95Ms}ms`);
        process.exit(1);
    }

    console.log('[LoadSmoke] PASS');
}

main().catch((error) => {
    console.error('[LoadSmoke] ERROR:', String(error?.message || error));
    process.exit(1);
});

