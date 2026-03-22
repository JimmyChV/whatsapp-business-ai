const test = require('node:test');
const assert = require('node:assert/strict');

function loadOpsTelemetryFresh() {
    const p = require.resolve('../domains/operations/services/ops-telemetry.service');
    delete require.cache[p];
    return require('../domains/operations/services/ops-telemetry.service');
}

test('ops_telemetry records http and computes latency percentiles', () => {
    const telemetry = loadOpsTelemetryFresh();

    telemetry.recordHttpRequest({ method: 'GET', route: '/api/a', statusCode: 200, durationMs: 20, tenantId: 't1' });
    telemetry.recordHttpRequest({ method: 'GET', route: '/api/a', statusCode: 200, durationMs: 40, tenantId: 't1' });
    telemetry.recordHttpRequest({ method: 'POST', route: '/api/b?x=1', statusCode: 503, durationMs: 80, tenantId: 't2' });

    const snapshot = telemetry.buildSnapshot({ waRuntime: { activeTransport: 'idle' }, waReady: false, saasEnabled: true, authEnabled: true });

    assert.equal(snapshot.http.total, 3);
    assert.equal(snapshot.http.errors, 1);
    assert.equal(snapshot.http.byStatus['503'], 1);
    assert.equal(snapshot.http.byMethod['GET'], 2);
    assert.equal(snapshot.http.byRoute['GET /api/a'].total, 2);
    assert.equal(snapshot.http.byRoute['POST /api/b'].total, 1);
    assert.equal(snapshot.http.latencyMs.samples >= 3, true);
    assert.equal(snapshot.health.saasEnabled, true);
});

test('ops_telemetry records socket lifecycle and internal errors', () => {
    const telemetry = loadOpsTelemetryFresh();

    telemetry.recordSocketConnect();
    telemetry.recordSocketConnect();
    telemetry.recordSocketReject('unauthorized');
    telemetry.recordSocketDisconnect();
    telemetry.recordInternalError('unit_test', new Error('boom'));

    const snapshot = telemetry.buildSnapshot({});
    assert.equal(snapshot.socket.current, 1);
    assert.equal(snapshot.socket.totalConnections, 2);
    assert.equal(snapshot.socket.totalDisconnections, 1);
    assert.equal(snapshot.socket.rejected, 1);
    assert.equal(snapshot.socket.rejectedByReason.unauthorized, 1);
    assert.equal(snapshot.internal.errors, 1);
    assert.equal(snapshot.internal.lastError.scope, 'unit_test');
});

