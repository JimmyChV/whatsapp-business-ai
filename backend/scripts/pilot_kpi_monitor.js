#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const { performance } = require('perf_hooks');
const fs = require('fs/promises');
const path = require('path');

function parseArgs(argv = []) {
    const args = {
        baseUrl: String(process.env.PILOT_BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:3001').trim(),
        opsToken: String(process.env.OPS_API_TOKEN || '').trim(),
        alertWebhook: String(process.env.OPS_ALERT_WEBHOOK_URL || '').trim(),
        samples: Math.max(1, Number(process.env.OPS_PILOT_SAMPLES || 12)),
        intervalMs: Math.max(1000, Number(process.env.OPS_PILOT_INTERVAL_MS || 30000)),
        timeoutMs: Math.max(1000, Number(process.env.OPS_PILOT_TIMEOUT_MS || 7000)),
        maxP95Ms: Math.max(1, Number(process.env.OPS_PILOT_MAX_P95_MS || 1200)),
        maxErrorRate: Math.max(0, Number(process.env.OPS_PILOT_MAX_ERROR_RATE || 0.01)),
        minReadyRatio: Math.max(0, Math.min(1, Number(process.env.OPS_PILOT_MIN_READY_RATIO || 0.995))),
        out: ''
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        if (!token) continue;
        const next = String(argv[i + 1] || '').trim();

        if (token === '--base-url') { args.baseUrl = next; i += 1; continue; }
        if (token === '--ops-token') { args.opsToken = next; i += 1; continue; }
        if (token === '--alert-webhook') { args.alertWebhook = next; i += 1; continue; }
        if (token === '--samples') { args.samples = Math.max(1, Number(next) || args.samples); i += 1; continue; }
        if (token === '--interval-ms') { args.intervalMs = Math.max(1000, Number(next) || args.intervalMs); i += 1; continue; }
        if (token === '--timeout-ms') { args.timeoutMs = Math.max(1000, Number(next) || args.timeoutMs); i += 1; continue; }
        if (token === '--max-p95-ms') { args.maxP95Ms = Math.max(1, Number(next) || args.maxP95Ms); i += 1; continue; }
        if (token === '--max-error-rate') { args.maxErrorRate = Math.max(0, Number(next) || args.maxErrorRate); i += 1; continue; }
        if (token === '--min-ready-ratio') {
            args.minReadyRatio = Math.max(0, Math.min(1, Number(next) || args.minReadyRatio));
            i += 1;
            continue;
        }
        if (token === '--out') { args.out = next; i += 1; continue; }
    }

    return args;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(opsToken = '') {
    const headers = { Accept: 'application/json' };
    if (opsToken) headers['x-ops-token'] = opsToken;
    return headers;
}

async function fetchJson(url, headers = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal
        });
        const elapsedMs = performance.now() - started;
        const text = await response.text();

        let parsed = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch (_) {
            parsed = null;
        }

        return {
            ok: response.ok,
            status: response.status,
            elapsedMs,
            body: parsed,
            raw: text
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            elapsedMs: performance.now() - started,
            body: null,
            raw: '',
            error: String(error?.message || error)
        };
    } finally {
        clearTimeout(timer);
    }
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function summarize(samples = []) {
    const metricsOnly = samples.filter((item) => item.metricsOk && item.metrics);
    const readyOnly = samples.filter((item) => item.readyOk);
    const readyTrue = samples.filter((item) => item.readyValue === true);
    const errorRates = metricsOnly.map((item) => toNumber(item.metrics?.http?.errorRate, 0));
    const p95Values = metricsOnly.map((item) => toNumber(item.metrics?.http?.latencyMs?.p95, 0));

    const maxErrorRate = errorRates.length ? Math.max(...errorRates) : 1;
    const maxP95Ms = p95Values.length ? Math.max(...p95Values) : Number.POSITIVE_INFINITY;
    const readyRatio = readyOnly.length ? (readyTrue.length / readyOnly.length) : 0;

    return {
        samplesCollected: samples.length,
        samplesMetricsOk: metricsOnly.length,
        samplesReadyOk: readyOnly.length,
        maxErrorRate,
        maxP95Ms,
        readyRatio
    };
}

function evaluate(summary, limits) {
    const checks = {
        errorRate: summary.maxErrorRate <= limits.maxErrorRate,
        p95: summary.maxP95Ms <= limits.maxP95Ms,
        readyRatio: summary.readyRatio >= limits.minReadyRatio
    };

    return {
        checks,
        pass: checks.errorRate && checks.p95 && checks.readyRatio
    };
}

async function sendAlert(webhookUrl = '', payload = {}) {
    if (!webhookUrl) return { skipped: true };
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return { skipped: false, ok: response.ok, status: response.status };
    } catch (error) {
        return { skipped: false, ok: false, status: 0, error: String(error?.message || error) };
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const base = args.baseUrl.replace(/\/$/, '');
    const headers = buildHeaders(args.opsToken);
    const results = [];

    for (let i = 0; i < args.samples; i += 1) {
        const at = new Date().toISOString();
        const metrics = await fetchJson(`${base}/api/ops/metrics`, headers, args.timeoutMs);
        const ready = await fetchJson(`${base}/api/ops/ready`, headers, args.timeoutMs);

        const row = {
            at,
            metricsOk: Boolean(metrics.ok && metrics.body?.ok),
            readyOk: Boolean(ready.ok),
            readyValue: Boolean(ready.body?.ready),
            metricsStatus: metrics.status,
            readyStatus: ready.status,
            metricsError: metrics.error || null,
            readyError: ready.error || null,
            metrics,
            ready
        };
        results.push(row);

        if (i < args.samples - 1) {
            await sleep(args.intervalMs);
        }
    }

    const compactSamples = results.map((row) => ({
        at: row.at,
        metricsOk: row.metricsOk,
        readyOk: row.readyOk,
        readyValue: row.readyValue,
        metricsStatus: row.metricsStatus,
        readyStatus: row.readyStatus,
        errorRate: toNumber(row.metrics?.body?.http?.errorRate, null),
        p95Ms: toNumber(row.metrics?.body?.http?.latencyMs?.p95, null),
        waReady: Boolean(row.metrics?.body?.health?.waReady)
    }));

    const summary = summarize(results.map((item) => ({
        ...item,
        metrics: item.metrics?.body || null
    })));

    const limits = {
        maxErrorRate: args.maxErrorRate,
        maxP95Ms: args.maxP95Ms,
        minReadyRatio: args.minReadyRatio
    };

    const verdict = evaluate(summary, limits);

    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl: base,
        limits,
        summary: {
            ...summary,
            maxErrorRate: Number(summary.maxErrorRate.toFixed(6)),
            maxP95Ms: Number(summary.maxP95Ms.toFixed(2)),
            readyRatio: Number(summary.readyRatio.toFixed(6))
        },
        verdict,
        samples: compactSamples
    };

    if (args.out) {
        const outPath = path.resolve(args.out);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
    }

    console.log('[PilotKPI] Report');
    console.log(JSON.stringify(report, null, 2));

    if (!verdict.pass) {
        const alertPayload = {
            event: 'pilot_kpi_failed',
            generatedAt: report.generatedAt,
            baseUrl: report.baseUrl,
            limits: report.limits,
            summary: report.summary,
            checks: report.verdict.checks
        };
        const alertResult = await sendAlert(args.alertWebhook, alertPayload);
        if (!alertResult.skipped) {
            console.log('[PilotKPI] Alert result:', JSON.stringify(alertResult));
        }
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('[PilotKPI] ERROR:', String(error?.message || error));
    process.exit(1);
});
