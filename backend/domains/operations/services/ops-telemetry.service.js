const DEFAULT_MAX_LATENCY_SAMPLES = Math.max(200, Number(process.env.OPS_MAX_LATENCY_SAMPLES || 4000));

function nowIso() {
    return new Date().toISOString();
}

function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function percentile(values = [], p = 0.95) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return sorted[idx] || 0;
}

class OpsTelemetry {
    constructor() {
        this.startedAt = Date.now();
        this.http = {
            total: 0,
            errors: 0,
            byStatus: {},
            byMethod: {},
            byRoute: {},
            latenciesMs: []
        };
        this.socket = {
            current: 0,
            totalConnections: 0,
            totalDisconnections: 0,
            rejected: 0,
            rejectedByReason: {}
        };
        this.internal = {
            errors: 0,
            lastError: null,
            lastErrorAt: null
        };
    }

    recordHttpRequest({
        method = 'GET',
        route = '/',
        statusCode = 200,
        durationMs = 0,
        tenantId = 'default'
    } = {}) {
        const safeMethod = String(method || 'GET').toUpperCase();
        const safeRoute = String(route || '/').split('?')[0] || '/';
        const safeStatus = String(Math.max(0, Math.floor(safeNumber(statusCode, 0))));
        const safeDuration = Math.max(0, safeNumber(durationMs, 0));
        const safeTenant = String(tenantId || 'default').trim() || 'default';

        this.http.total += 1;
        if (safeNumber(statusCode, 0) >= 500) this.http.errors += 1;

        this.http.byStatus[safeStatus] = (this.http.byStatus[safeStatus] || 0) + 1;
        this.http.byMethod[safeMethod] = (this.http.byMethod[safeMethod] || 0) + 1;

        const routeKey = `${safeMethod} ${safeRoute}`;
        const existing = this.http.byRoute[routeKey] || {
            total: 0,
            errors: 0,
            p95Ms: 0,
            avgMs: 0,
            tenantHits: {}
        };

        existing.total += 1;
        if (safeNumber(statusCode, 0) >= 500) existing.errors += 1;
        existing.tenantHits[safeTenant] = (existing.tenantHits[safeTenant] || 0) + 1;

        const previousTotal = Math.max(0, existing.total - 1);
        existing.avgMs = previousTotal > 0
            ? ((existing.avgMs * previousTotal) + safeDuration) / (previousTotal + 1)
            : safeDuration;

        this.http.byRoute[routeKey] = existing;

        this.http.latenciesMs.push(safeDuration);
        if (this.http.latenciesMs.length > DEFAULT_MAX_LATENCY_SAMPLES) {
            this.http.latenciesMs.splice(0, this.http.latenciesMs.length - DEFAULT_MAX_LATENCY_SAMPLES);
        }

        existing.p95Ms = percentile(this.http.latenciesMs, 0.95);
    }

    recordSocketConnect() {
        this.socket.current += 1;
        this.socket.totalConnections += 1;
    }

    recordSocketDisconnect() {
        this.socket.current = Math.max(0, this.socket.current - 1);
        this.socket.totalDisconnections += 1;
    }

    recordSocketReject(reason = 'unknown') {
        const safeReason = String(reason || 'unknown').trim().toLowerCase() || 'unknown';
        this.socket.rejected += 1;
        this.socket.rejectedByReason[safeReason] = (this.socket.rejectedByReason[safeReason] || 0) + 1;
    }

    recordInternalError(scope = 'unknown', error = null) {
        this.internal.errors += 1;
        this.internal.lastErrorAt = nowIso();
        this.internal.lastError = {
            scope: String(scope || 'unknown'),
            message: String(error?.message || error || 'unknown error')
        };
    }

    buildSnapshot({ waRuntime = {}, waReady = false, saasEnabled = false, authEnabled = false } = {}) {
        const uptimeSec = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
        const latencies = this.http.latenciesMs;
        const avgLatency = latencies.length
            ? (latencies.reduce((sum, item) => sum + item, 0) / latencies.length)
            : 0;

        return {
            generatedAt: nowIso(),
            uptimeSec,
            health: {
                process: 'up',
                waReady: Boolean(waReady),
                waRuntime,
                saasEnabled: Boolean(saasEnabled),
                authEnabled: Boolean(authEnabled)
            },
            http: {
                total: this.http.total,
                errors: this.http.errors,
                errorRate: this.http.total > 0 ? Number((this.http.errors / this.http.total).toFixed(6)) : 0,
                byStatus: this.http.byStatus,
                byMethod: this.http.byMethod,
                byRoute: this.http.byRoute,
                latencyMs: {
                    samples: latencies.length,
                    avg: Number(avgLatency.toFixed(2)),
                    p50: Number(percentile(latencies, 0.5).toFixed(2)),
                    p95: Number(percentile(latencies, 0.95).toFixed(2)),
                    p99: Number(percentile(latencies, 0.99).toFixed(2))
                }
            },
            socket: {
                ...this.socket
            },
            internal: {
                ...this.internal
            }
        };
    }
}

module.exports = new OpsTelemetry();
